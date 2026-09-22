"""Recoverable per-file installation. Not an atomic project update/editor lock."""
import ctypes
import hashlib
import json
import os
from pathlib import Path
import re
import stat
import sqlite3
import signal
import sys
import time
import uuid
from verify_vm import encode, read_json

NAME=re.compile(r'^[A-Za-z0-9_-][A-Za-z0-9_.-]*(/[A-Za-z0-9_-][A-Za-z0-9_.-]*)*$')

def identity(value):return [value.st_dev,value.st_ino]

def read_at(parent,name,sync=False,limit=32768):
    try:fd=os.open(name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=parent)
    except FileNotFoundError:return None,None
    try:
        info=os.fstat(fd)
        if not stat.S_ISREG(info.st_mode):raise ValueError('Target must be regular')
        data=b''
        while len(data)<=limit:
            chunk=os.read(fd,limit+1-len(data))
            if not chunk:break
            data+=chunk
        if len(data)>limit:raise ValueError('Target exceeds limit')
        if sync:os.fsync(fd)
        return data,info
    finally:os.close(fd)


def open_parent(root,path):
    fd=os.dup(root)
    try:
        for part in path.split('/')[:-1]:
            new=os.open(part,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW,dir_fd=fd)
            os.close(fd);fd=new
        return fd
    except BaseException:os.close(fd);raise


def save(path,value):
    temporary=path.parent/('.promotion-'+uuid.uuid4().hex+'.tmp')
    with temporary.open('xb') as stream:
        stream.write(encode({'value':value,'sha256':hashlib.sha256(encode(value)).hexdigest()}))
        stream.flush();os.fsync(stream.fileno())
    os.replace(temporary,path)
    fd=os.open(path.parent,os.O_RDONLY|os.O_DIRECTORY)
    try:os.fsync(fd)
    finally:os.close(fd)


def exclusive_rename(parent,source,target):
    libc=ctypes.CDLL(None,use_errno=True)
    if sys.platform=='darwin':function=libc.renameatx_np;flag=4
    elif sys.platform.startswith('linux'):function=libc.renameat2;flag=1
    else:raise ValueError('Exclusive rename is unsupported')
    function.argtypes=[ctypes.c_int,ctypes.c_char_p,ctypes.c_int,ctypes.c_char_p,ctypes.c_uint]
    function.restype=ctypes.c_int
    if function(parent,os.fsencode(source),parent,os.fsencode(target),flag)!=0:
        error=ctypes.get_errno();raise OSError(error,os.strerror(error))


def validate(request):
    if not isinstance(request,dict) or set(request)-{'goal','workflow','settingsSha256'}!={'version','root','checkpointSha256','files','coding'}:raise ValueError('Invalid promotion request')
    if type(request['version']) is not int or request['version']!=1:raise ValueError('Invalid version')
    if not isinstance(request['root'],str) or not Path(request['root']).is_absolute() or str(Path(request['root']).resolve())!=request['root']:raise ValueError('Expected canonical project root')
    if not isinstance(request['checkpointSha256'],str) or not re.fullmatch('[0-9a-f]{64}',request['checkpointSha256']):raise ValueError('Invalid checkpoint')
    if not isinstance(request['files'],list) or not 1<=len(request['files'])<=20:raise ValueError('Invalid files')
    coding=request['coding']
    if not isinstance(coding,dict) or set(coding)!={'path','id','bodySha256'} or not isinstance(coding['id'],str) or not coding['id']:raise ValueError('Invalid coding reference')
    if not isinstance(coding['path'],str) or not Path(coding['path']).is_absolute() or not Path(coding['path']).is_file():raise ValueError('Invalid coding journal')
    if not isinstance(coding['bodySha256'],str) or not re.fullmatch('[0-9a-f]{64}',coding['bodySha256']):raise ValueError('Invalid coding digest')
    if 'settingsSha256' in request and (not isinstance(request['settingsSha256'],str) or not re.fullmatch('[0-9a-f]{64}',request['settingsSha256'])):raise ValueError('Invalid settings digest')
    if 'workflow' in request:
        workflow=request['workflow']
        if (not isinstance(workflow,dict) or set(workflow)!={'path','id','bodySha256'} or
            workflow['path']!=str(Path(request['root'])/'.harness'/'workflows.sqlite') or not Path(workflow['path']).is_file() or
            workflow['id']!=coding['id'] or not isinstance(workflow['bodySha256'],str) or not re.fullmatch('[0-9a-f]{64}',workflow['bodySha256'])):
            raise ValueError('Invalid workflow reference')
    if 'goal' in request:
        goal=request['goal']
        if not isinstance(goal,dict) or set(goal)!={'path','expected','validUntil'}:raise ValueError('Invalid goal reference')
        if goal['path']!=str(Path(request['root'])/'.harness'/'ledger.sqlite') or not Path(goal['path']).is_file():raise ValueError('Invalid goal journal')
        expected=goal['expected']
        if not isinstance(expected,dict) or not isinstance(expected.get('id'),str) or type(expected.get('revision')) is not int or expected.get('status') not in ['active','completed'] or not isinstance(expected.get('contract'),dict):raise ValueError('Invalid expected goal')
        until=goal['validUntil']
        if until is not None and (type(until) is not int or not 0<=until<=9007199254740991):raise ValueError('Invalid goal validity')
    names=set()
    for file in request['files']:
        if not isinstance(file,dict) or set(file)!={'path','original','current','writable'}:raise ValueError('Invalid file')
        name=file['path']
        if not isinstance(name,str) or len(name)>240 or not NAME.fullmatch(name) or name in names:raise ValueError('Invalid path')
        names.add(name)
        if type(file['writable']) is not bool:raise ValueError('Invalid permission')
        if file['original'] is None and not file['writable']:raise ValueError('New file must be writable')
        for key in ['original','current']:
            if key=='original' and file[key] is None:continue
            if not isinstance(file[key],str) or len(file[key].encode())>32768 or '\0' in file[key]:raise ValueError('Invalid text')
        if not file['writable'] and file['original']!=file['current']:raise ValueError('Read-only change')


def validate_state(state,request):
    if not isinstance(state,dict) or set(state)!={'request','rootIdentity','status','files'} or state['request']!=request or state['status'] not in ['incomplete','applied']:
        raise ValueError('Invalid promotion state')
    if not isinstance(state['files'],list) or len(state['files'])!=len(request['files']):raise ValueError('Invalid promotion file count')
    def valid_identity(value):return isinstance(value,list) and len(value)==2 and all(type(x) is int and x>=0 for x in value)
    if not valid_identity(state['rootIdentity']):raise ValueError('Invalid root identity')
    for index,(item,file) in enumerate(zip(state['files'],request['files'])):
        if not isinstance(item,dict) or set(item)!={'path','identity','parentIdentity','mode','backup','stage','retiredStages','phase'} or item['path']!=file['path']:
            raise ValueError('Invalid promotion entry')
        if not (item['identity'] is None if file['original'] is None else valid_identity(item['identity'])) or not valid_identity(item['parentIdentity']) or type(item['mode']) is not int or not 0<=item['mode']<=0o777:raise ValueError('Invalid file identity')
        if item['phase'] not in ['planned','moving','applied','unchanged']:raise ValueError('Invalid phase')
        if not isinstance(item['retiredStages'],list) or len(item['retiredStages'])>3:raise ValueError('Invalid staging history')
        pattern=rf'\.relentless-[0-9a-f]{{32}}-{index}\.new'
        for stage in item['retiredStages']+([item['stage']] if item['stage'] is not None else []):
            if not isinstance(stage,str) or not re.fullmatch(pattern,stage):raise ValueError('Invalid stage path')
        if file['original'] is None:
            if item['backup'] is not None or item['stage'] is None or item['mode']!=0o600 or item['phase'] not in ['planned','applied']:raise ValueError('Invalid new-file state')
        elif item['backup'] is None:
            if item['stage'] is not None or item['retiredStages'] or item['phase']!='unchanged':raise ValueError('Invalid unchanged entry')
        elif (not file['writable'] or item['stage'] is None or not isinstance(item['backup'],str)
              or str(Path(item['backup']).parent)!=str(Path(file['path']).parent)
              or not re.fullmatch(rf'\.relentless-[0-9a-f]{{32}}-{index}\.before',Path(item['backup']).name)):
            raise ValueError('Invalid backup path')


_NO_LEASE=object()

def validate_lease(lease):
    if (not isinstance(lease,dict) or set(lease)!={'owner','until'} or
        not isinstance(lease['owner'],str) or not 1<=len(lease['owner'])<=256 or
        type(lease['until']) is not int or not 0<=lease['until']<=9007199254740991):
        raise ValueError('Invalid supervisor lease')


def apply(request,directory,after_move=None,lease=_NO_LEASE):
    validate(request)
    guarded=lease is not _NO_LEASE
    if guarded:
        validate_lease(lease)
        if 'goal' not in request:raise ValueError('Supervisor lease requires a goal')
    prior=signal.signal(signal.SIGALRM,signal.SIG_DFL);remaining=signal.alarm(30)
    db=None;goal_db=None;workflow_db=None
    try:
        # Fixed lock order: goal then coding. The mutator retains both after parent death.
        goal=request.get('goal')
        if goal is not None:
            goal_db=sqlite3.connect(goal['path'],timeout=5,isolation_level=None)
            goal_db.execute('BEGIN IMMEDIATE')
            row=goal_db.execute('SELECT body,hash FROM checkpoint WHERE id=1').fetchone()
            if not row or hashlib.sha256(row[0].encode()).hexdigest()!=row[1]:raise ValueError('Goal checkpoint changed')
            state=json.loads(row[0])
            if guarded:
                current_lease=state.get('lease')
                validate_lease(current_lease)
                if current_lease['owner']!=lease['owner'] or current_lease['until']<lease['until']:
                    raise ValueError('Supervisor lease changed')
            current=next((item for item in state['goals'] if item.get('id')==goal['expected']['id']),None)
            if encode(current)!=encode(goal['expected']):raise ValueError('Goal changed')
        db=sqlite3.connect(request['coding']['path'],timeout=5,isolation_level=None)
        db.execute('BEGIN IMMEDIATE')
        row=db.execute('SELECT body,hash FROM runs WHERE id=?',(request['coding']['id'],)).fetchone()
        if not row or row[1]!=request['coding']['bodySha256'] or hashlib.sha256(row[0].encode()).hexdigest()!=row[1]:raise ValueError('Coding checkpoint changed')
        if 'workflow' in request:
            ref=request['workflow'];workflow_db=sqlite3.connect(ref['path'],timeout=5,isolation_level=None)
            workflow_db.execute('BEGIN IMMEDIATE')
            reviewed=workflow_db.execute('SELECT body,hash,owner,until FROM workflows WHERE id=?',(ref['id'],)).fetchone()
            if (not reviewed or reviewed[1]!=ref['bodySha256'] or hashlib.sha256(reviewed[0].encode()).hexdigest()!=reviewed[1]
                or (reviewed[2] is not None and reviewed[3]>int(time.time()*1000))):raise ValueError('Workflow changed or leased')
        origin=json.loads(row[0]).get('request',{}).get('goalOrigin')
        if (origin is None)!=(goal is None):raise ValueError('Missing goal binding')
        if goal is not None and (origin['goalId']!=goal['expected']['id'] or origin['revision']!=goal['expected']['revision']):raise ValueError('Goal identity changed')
        if goal is not None:
            target=next((task for task in goal['expected'].get('tasks',[]) if task.get('id')==origin['taskId']),None)
            admission=target.get('workflowAdmission') if target is not None else None
            if goal['expected']['status']=='completed' or admission is not None:
                if (not isinstance(admission,dict) or target.get('status')!='completed' or target.get('verifiedRevision')!=origin['revision']
                    or admission.get('codingId')!=request['coding']['id'] or admission.get('checkpointSha256')!=request['checkpointSha256']
                    or encode(admission.get('origin'))!=encode(origin)):raise ValueError('Completed artifact binding changed')
        def guard():
            if 'settingsSha256' in request:
                root_fd=os.open(request['root'],os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
                try:
                    parent=open_parent(root_fd,'.pi/settings.json')
                    try:data,_info=read_at(parent,'settings.json',limit=128*1024)
                    finally:os.close(parent)
                    if data is None or hashlib.sha256(data).hexdigest()!=request['settingsSha256']:raise ValueError('Project settings changed')
                finally:os.close(root_fd)
            if goal is None:return
            now=int(time.time()*1000)
            if guarded and now>=lease['until']:raise ValueError('Supervisor lease expired')
            if goal['validUntil'] is not None and now>=goal['validUntil']:raise ValueError('Goal context expired')
            contract=goal['expected']['contract'];expiries=[]
            if contract.get('deadlineAt') is not None:
                if now>=contract['deadlineAt']:raise ValueError('Goal deadline expired')
                expiries.append(contract['deadlineAt'])
            for memory in contract.get('memories',[]):
                if memory.get('scope','goal') in ['goal',origin['taskId']] and memory.get('expiresAt',0)>now:expiries.append(memory['expiresAt'])
            if goal['validUntil']!=(min(expiries) if expiries else None):raise ValueError('Goal validity mismatch')
        guard()
        result=_apply(request,directory,after_move,guard)
        if workflow_db is not None:workflow_db.execute('COMMIT')
        db.execute('COMMIT')
        if goal_db is not None:goal_db.execute('COMMIT')
        return result
    finally:
        if workflow_db is not None:workflow_db.close()
        if db is not None:db.close()
        if goal_db is not None:goal_db.close()
        signal.alarm(remaining);signal.signal(signal.SIGALRM,prior)


def _apply(request,directory,after_move=None,guard=lambda:None):
    directory=Path(directory).absolute()
    root=os.open(request['root'],os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)
    parents=[]
    try:
        def visible(parent,path):
            check=open_parent(root,path)
            try:
                if identity(os.fstat(check))!=identity(os.fstat(parent)) or identity(os.stat(request['root'],follow_symlinks=False))!=identity(os.fstat(root)):
                    raise ValueError('Project directory changed')
            finally:os.close(check)
        for file in request['files']:parents.append(open_parent(root,file['path']))
        journal=directory/'state.json'
        if directory.exists():
            record=read_json(journal,2*1024*1024);state=record['value']
            if not directory.is_dir() or directory.is_symlink():raise ValueError('Invalid promotion directory')
            if record['sha256']!=hashlib.sha256(encode(state)).hexdigest() or state['request']!=request or state['rootIdentity']!=identity(os.fstat(root)):raise ValueError('Promotion identity changed')
        else:
            files=[];aliases=set();token=uuid.uuid4().hex
            for index,(file,parent) in enumerate(zip(request['files'],parents)):
                visible(parent,file['path']);data,info=read_at(parent,Path(file['path']).name)
                prefix=f'.relentless-{token}-{index}'
                if file['original'] is None:
                    if data is not None:raise ValueError('New target already exists')
                    files.append({'path':file['path'],'identity':None,'parentIdentity':identity(os.fstat(parent)),'mode':0o600,
                                  'backup':None,'stage':prefix+'.new','retiredStages':[],'phase':'planned'})
                    continue
                if data is None or data not in [file['original'].encode(),file['current'].encode()]:raise ValueError('Developer edit or missing input')
                alias=tuple(identity(info))
                if alias in aliases:raise ValueError('Aliased input files')
                aliases.add(alias)
                prefix=f'.relentless-{token}-{index}'
                changed=data!=file['current'].encode()
                files.append({'path':file['path'],'identity':identity(info),'parentIdentity':identity(os.fstat(parent)),'mode':stat.S_IMODE(info.st_mode)&0o777,
                              'backup':str(Path(file['path']).parent/(prefix+'.before')) if changed else None,
                              'stage':prefix+'.new' if changed else None,'retiredStages':[],'phase':'planned' if changed else 'unchanged'})
            directory.mkdir(mode=0o700)
            outer=os.open(directory.parent,os.O_RDONLY|os.O_DIRECTORY)
            try:os.fsync(outer)
            finally:os.close(outer)
            state={'request':request,'rootIdentity':identity(os.fstat(root)),'status':'incomplete','files':files}
            save(journal,state)
        validate_state(state,request)
        # Preflight every remaining input before modifying any further target.
        for file,item,parent in zip(request['files'],state['files'],parents):
            visible(parent,file['path'])
            if identity(os.fstat(parent))!=item['parentIdentity']:raise ValueError('Parent identity changed')
            data,target_info=read_at(parent,Path(file['path']).name)
            if file['original'] is None:
                staged,stage_info=read_at(parent,item['stage'])
                if data is None:
                    if item['phase']=='applied':raise ValueError('Installed new target disappeared')
                elif (data!=file['current'].encode() or staged!=data or
                      identity(target_info)!=identity(stage_info)):
                    raise ValueError('New target is not the journaled stage')
                continue
            backup,info=read_at(parent,Path(item['backup']).name) if item['backup'] else (None,None)
            if backup is not None and (backup!=file['original'].encode() or identity(info)!=item['identity']):raise ValueError('Retained original changed')
            if data is None:
                if item['phase']!='moving' or backup is None:raise ValueError('Unexplained missing target')
            elif data not in [file['original'].encode(),file['current'].encode()]:raise ValueError('Developer edit')
        for file,item,parent in zip(request['files'],state['files'],parents):
            guard()
            name=Path(file['path']).name;visible(parent,file['path'])
            data,info=read_at(parent,name)
            if data==file['current'].encode():
                if file['original'] is None:
                    staged,stage_info=read_at(parent,item['stage'],sync=True)
                    if staged!=data or identity(info)!=identity(stage_info):raise ValueError('New target changed')
                    os.fsync(parent);item['phase']='applied';save(journal,state)
                continue
            creating=file['original'] is None
            if item['backup'] is None and not creating:raise ValueError('Unchanged input moved')
            backup=Path(item['backup']).name if item['backup'] else None;stage=item['stage']
            staged,_=read_at(parent,stage,sync=True)
            if staged is None:
                fd=os.open(stage,os.O_WRONLY|os.O_CREAT|os.O_EXCL|os.O_NOFOLLOW,item['mode'],dir_fd=parent)
                try:
                    with os.fdopen(fd,'wb',closefd=False) as stream:stream.write(file['current'].encode());stream.flush();os.fsync(fd)
                finally:os.close(fd)
                os.fsync(parent)
            elif staged!=file['current'].encode():
                if len(item['retiredStages'])>=3:raise ValueError('Staging recovery limit reached')
                item['retiredStages'].append(stage)
                item['stage']=f'.relentless-{uuid.uuid4().hex}-{request["files"].index(file)}.new'
                save(journal,state)
                # Preserve the interrupted stage and retry with a freshly journaled name.
                return _apply(request,directory,after_move,guard)
            if creating:
                if data is not None:raise ValueError('New target appeared')
                visible(parent,file['path']);guard()
                try:os.link(stage,name,src_dir_fd=parent,dst_dir_fd=parent,follow_symlinks=False)
                except FileExistsError:raise ValueError('New target appeared; staged candidate preserved') from None
                os.fsync(parent);item['phase']='applied';save(journal,state)
                continue
            if data is not None:
                if data!=file['original'].encode() or identity(info)!=item['identity']:raise ValueError('Target changed before capture')
                item['phase']='moving';save(journal,state)
                guard()
                exclusive_rename(parent,name,backup);os.fsync(parent)
                if after_move:after_move(file['path'])
            captured,info=read_at(parent,backup)
            if captured!=file['original'].encode() or identity(info)!=item['identity']:raise ValueError('Captured original changed')
            visible(parent,file['path'])
            guard()
            try:os.link(stage,name,src_dir_fd=parent,dst_dir_fd=parent,follow_symlinks=False)
            except FileExistsError:raise ValueError('New target appeared; retained original preserved') from None
            os.fsync(parent);item['phase']='applied';save(journal,state)
        for file,item,parent in zip(request['files'],state['files'],parents):
            visible(parent,file['path']);data,info=read_at(parent,Path(file['path']).name)
            if data!=file['current'].encode():raise ValueError('Final target mismatch')
            if file['original'] is None:
                staged,stage_info=read_at(parent,item['stage'])
                if staged!=data or identity(info)!=identity(stage_info):raise ValueError('New target identity changed')
            if item['backup'] and read_at(parent,Path(item['backup']).name)[0]!=file['original'].encode():raise ValueError('Retained original changed')
        guard()
        state['status']='applied';save(journal,state)
        return {'status':'applied','checkpointSha256':request['checkpointSha256'],'files':state['files']}
    finally:
        for parent in parents:os.close(parent)
        os.close(root)


if __name__=='__main__':
    try:
        if len(sys.argv) not in [3,4]:raise ValueError('Usage: promote_sources.py <request.json> <promotion-directory> [lease-json]')
        lease=_NO_LEASE
        if len(sys.argv)==4:
            if len(sys.argv[3].encode())>4096:raise ValueError('Lease exceeds limit')
            lease=json.loads(sys.argv[3]);validate_lease(lease)
        print(json.dumps(apply(read_json(Path(sys.argv[1]),2*1024*1024),Path(sys.argv[2]),lease=lease)))
    except (OSError,ValueError,KeyError,AttributeError,sqlite3.Error):
        print('Promotion stopped; preserve source, backups and journal for reconciliation',file=sys.stderr);sys.exit(1)
