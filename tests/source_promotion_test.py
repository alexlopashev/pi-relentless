"""Filesystem promotion fixtures; no models, VM or Git mutation."""
import json
import hashlib
import sqlite3
import subprocess
import signal
import time
from unittest.mock import patch
import os
from pathlib import Path
import sys
import tempfile
import unittest
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
import promote_sources as promotion

class PromotionTest(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name).resolve();self.project=self.root/'project';self.project.mkdir()
        (self.project/'x.ts').write_text('old');(self.project/'context.ts').write_text('context')
        self.database=self.root/'coding.sqlite'
        with sqlite3.connect(self.database) as db:
            db.execute('CREATE TABLE runs(id TEXT PRIMARY KEY, body TEXT, hash TEXT)')
            db.execute('INSERT INTO runs VALUES(?,?,?)',('run','{}',hashlib.sha256(b'{}').hexdigest()))
        self.request={'coding':{'path':str(self.database),'id':'run','bodySha256':hashlib.sha256(b'{}').hexdigest()},'version':1,'root':str(self.project),'checkpointSha256':'a'*64,'files':[
            {'path':'x.ts','original':'old','current':'new','writable':True},
            {'path':'context.ts','original':'context','current':'context','writable':False}]}
        self.run=self.root/'promotion'

    def new_file_request(self):
        (self.project/'x.ts').unlink()
        self.request['files'][0]['original']=None

    def test_new_file_install_and_idempotent_recovery(self):
        self.new_file_request()
        result=promotion.apply(self.request,self.run)
        self.assertEqual(result['status'],'applied')
        installed=(self.project/'x.ts').stat().st_ino
        self.assertEqual((self.project/'x.ts').read_text(),'new')
        self.assertEqual(promotion.apply(self.request,self.run)['status'],'applied')
        self.assertEqual((self.project/'x.ts').stat().st_ino,installed)

    def test_new_file_refuses_preexisting_equal_content(self):
        self.new_file_request();(self.project/'x.ts').write_text('new')
        with self.assertRaises(ValueError):promotion.apply(self.request,self.run)
        self.assertEqual((self.project/'x.ts').read_text(),'new')
        self.assertFalse(self.run.exists())

    def test_new_file_recovers_link_before_journal_update(self):
        self.new_file_request();real_save=promotion.save
        def fail_applied(path,state):
            if any(x['phase']=='applied' for x in state['files']):raise RuntimeError('simulated crash after link')
            return real_save(path,state)
        with patch.object(promotion,'save',side_effect=fail_applied):
            with self.assertRaises(RuntimeError):promotion.apply(self.request,self.run)
        self.assertEqual((self.project/'x.ts').read_text(),'new')
        self.assertEqual(promotion.apply(self.request,self.run)['status'],'applied')

    def test_new_file_refuses_replacement_even_with_equal_content(self):
        self.new_file_request();promotion.apply(self.request,self.run)
        other=self.project/'replacement';other.write_text('new');os.replace(other,self.project/'x.ts')
        with self.assertRaises(ValueError):promotion.apply(self.request,self.run)
        self.assertEqual((self.project/'x.ts').read_text(),'new')

    def test_new_file_preserves_target_appearing_at_publication(self):
        self.new_file_request();real_link=os.link
        def collide(source,target,**kwargs):
            (self.project/'x.ts').write_text('developer')
            return real_link(source,target,**kwargs)
        with patch.object(promotion.os,'link',side_effect=collide):
            with self.assertRaises(ValueError):promotion.apply(self.request,self.run)
        self.assertEqual((self.project/'x.ts').read_text(),'developer')
        with self.assertRaises(ValueError):promotion.apply(self.request,self.run)

    def test_new_file_must_be_writable_and_existing_parent_is_required(self):
        self.new_file_request();self.request['files'][0]['writable']=False
        with self.assertRaises(ValueError):promotion.apply(self.request,self.run)
        self.request['files'][0]['writable']=True;self.request['files'][0]['path']='missing/x.ts'
        with self.assertRaises((ValueError,FileNotFoundError)):promotion.apply(self.request,self.run)
        self.assertFalse((self.project/'missing').exists())

    def test_new_file_can_be_empty_and_rejects_later_removal(self):
        self.new_file_request();self.request['files'][0]['current']=''
        self.assertEqual(promotion.apply(self.request,self.run)['status'],'applied')
        self.assertEqual((self.project/'x.ts').read_bytes(),b'')
        (self.project/'x.ts').unlink()
        with self.assertRaises(ValueError):promotion.apply(self.request,self.run)
        self.assertFalse((self.project/'x.ts').exists())

    def test_new_file_rejects_symlink_without_touching_destination(self):
        self.new_file_request();outside=self.root/'outside';outside.write_text('keep')
        (self.project/'x.ts').symlink_to(outside)
        with self.assertRaises((ValueError,OSError)):promotion.apply(self.request,self.run)
        self.assertEqual(outside.read_text(),'keep')
        self.assertTrue((self.project/'x.ts').is_symlink())

    def enable_goal(self,deadline=None):
        self.goal_database=self.project/'.harness'/'ledger.sqlite';self.goal_database.parent.mkdir()
        goal={'id':'goal','revision':1,'status':'active','contract':{'memories':[]}}
        if deadline is not None:goal['contract']['deadlineAt']=deadline
        body=json.dumps({'goals':[goal]},separators=(',',':'))
        with sqlite3.connect(self.goal_database) as db:
            db.execute('CREATE TABLE checkpoint(id INTEGER PRIMARY KEY,body TEXT,hash TEXT)')
            db.execute('INSERT INTO checkpoint VALUES(1,?,?)',(body,hashlib.sha256(body.encode()).hexdigest()))
        self.request['goal']={'path':str(self.goal_database),'expected':goal,'validUntil':deadline}
        coding_body=json.dumps({'request':{'goalOrigin':{'goalId':'goal','taskId':'fix','revision':1}}})
        coding_hash=hashlib.sha256(coding_body.encode()).hexdigest()
        with sqlite3.connect(self.database) as db:db.execute('UPDATE runs SET body=?,hash=?',(coding_body,coding_hash))
        self.request['coding']['bodySha256']=coding_hash

    def test_workflow_reference_is_fenced_and_changed_reviews_cannot_publish(self):
        self.enable_goal();lease={'owner':'scheduler','until':int(time.time()*1000)+20000};self.set_lease(lease)
        path=self.project/'.harness'/'workflows.sqlite';body='{"phase":"verified"}';digest=hashlib.sha256(body.encode()).hexdigest()
        with sqlite3.connect(path) as db:
            db.execute('CREATE TABLE workflows(id TEXT PRIMARY KEY,body TEXT,hash TEXT,owner TEXT,until INTEGER)')
            db.execute('INSERT INTO workflows VALUES(?,?,?,?,?)',('run',body,digest,None,0))
        self.request['workflow']={'path':str(path),'id':'run','bodySha256':digest}
        with sqlite3.connect(path) as db:
            changed='{"phase":"blocked"}'
            db.execute('UPDATE workflows SET body=?,hash=?',(changed,hashlib.sha256(changed.encode()).hexdigest()))
        with self.assertRaises(ValueError):promotion.apply(self.request,self.run,lease=lease)
        self.assertEqual((self.project/'x.ts').read_text(),'old')
        with sqlite3.connect(path) as db:db.execute('UPDATE workflows SET body=?,hash=?',(body,digest))
        self.assertEqual(promotion.apply(self.request,self.run,lease=lease)['status'],'applied')

    def set_lease(self,lease):
        with sqlite3.connect(self.goal_database) as db:
            state=json.loads(db.execute('SELECT body FROM checkpoint WHERE id=1').fetchone()[0])
            state['lease']=lease;body=json.dumps(state,separators=(',',':'))
            db.execute('UPDATE checkpoint SET body=?,hash=?',(body,hashlib.sha256(body.encode()).hexdigest()))

    def test_settings_revocation_after_capture_prevents_publication(self):
        settings=self.project/'.pi';settings.mkdir()
        path=settings/'settings.json';path.write_text('{"resumeGoal":"approved"}')
        original=path.read_bytes()
        self.request['settingsSha256']=hashlib.sha256(original).hexdigest()
        def revoke(_path):path.write_text('{}')
        with self.assertRaisesRegex(ValueError,'settings'):
            promotion.apply(self.request,self.run,revoke)
        self.assertFalse((self.project/'x.ts').exists())
        backups=list(self.project.glob('.relentless-*.before'))
        self.assertEqual(len(backups),1);self.assertEqual(backups[0].read_text(),'old')
        path.write_bytes(original)
        self.assertEqual(promotion.apply(self.request,self.run)['status'],'applied')
        self.assertEqual((self.project/'x.ts').read_text(),'new')
        self.assertEqual(list(self.project.glob('.relentless-*.before')),backups)

    def test_guarded_promotion_rejects_missing_expired_and_other_owners_before_writes(self):
        self.enable_goal();now=int(time.time()*1000);lease={'owner':'scheduler','until':now+10000}
        for current in [None,{'owner':'other','until':now+10000},{'owner':'scheduler','until':now-1}]:
            with self.subTest(current=current):
                self.set_lease(current)
                with self.assertRaises(ValueError):promotion.apply(self.request,self.run,lease=lease)
                self.assertEqual((self.project/'x.ts').read_text(),'old')
                self.assertFalse(self.run.exists())

    def test_guard_expiry_preserves_capture_and_new_lease_recovers_same_transaction(self):
        self.enable_goal();now=int(time.time()*1000);lease={'owner':'first','until':now+1000};self.set_lease(lease)
        clock=[now/1000]
        with patch.object(promotion.time,'time',side_effect=lambda:clock[0]):
            def expire(_path):clock[0]=(lease['until']+1)/1000
            with self.assertRaises(ValueError):promotion.apply(self.request,self.run,expire,lease=lease)
        self.assertFalse((self.project/'x.ts').exists())
        backups=list(self.project.glob('.relentless-*.before'));self.assertEqual(len(backups),1);self.assertEqual(backups[0].read_text(),'old')
        next_lease={'owner':'successor','until':now+20000};self.set_lease(next_lease)
        self.assertEqual(promotion.apply(self.request,self.run,lease=next_lease)['status'],'applied')
        self.assertEqual((self.project/'x.ts').read_text(),'new')
        self.assertEqual(list(self.project.glob('.relentless-*.before')),backups)
        saved=json.loads((self.run/'state.json').read_text())
        self.assertNotIn('lease',saved['value']['request'])

    def test_guard_rejects_malformed_or_unbound_authority(self):
        for lease in [{'owner':'','until':1},{'owner':'a','until':True},{'owner':'a','until':1.5},{'owner':'a','until':1,'extra':True}]:
            with self.assertRaises(ValueError):promotion.apply(self.request,self.run,lease=lease)
        with self.assertRaises(ValueError):promotion.apply(self.request,self.run,lease={'owner':'a','until':int(time.time()*1000)+10000})
        self.assertEqual((self.project/'x.ts').read_text(),'old')

    def test_guarded_writer_retains_fences_after_parent_death_and_successor_recovers(self):
        self.enable_goal()
        self.scheduler_lease={'owner':'scheduler','until':int(time.time()*1000)+20000}
        self.set_lease(self.scheduler_lease)
        self.test_writer_owns_fence_after_parent_death_and_releases_on_own_death()

    def test_goal_writer_fence_survives_parent_death(self):
        self.enable_goal()
        self.test_writer_owns_fence_after_parent_death_and_releases_on_own_death()

    def test_goal_reference_required_and_changed_goal_rejected(self):
        self.enable_goal()
        saved=self.request.pop('goal')
        with self.assertRaises(ValueError):promotion.apply(self.request,self.run)
        self.assertEqual((self.project/'x.ts').read_text(),'old')
        self.request['goal']=saved
        with sqlite3.connect(self.goal_database) as db:
            body=json.dumps({'goals':[{**saved['expected'],'status':'cancelled'}]})
            db.execute('UPDATE checkpoint SET body=?,hash=?',(body,hashlib.sha256(body.encode()).hexdigest()))
        with self.assertRaises(ValueError):promotion.apply(self.request,self.run)
        self.assertEqual((self.project/'x.ts').read_text(),'old')

    def test_goal_deadline_is_checked_after_capturing_original(self):
        now=int(time.time()*1000);deadline=now+1000;self.enable_goal(deadline)
        current=[now/1000]
        with patch.object(promotion.time,'time',side_effect=lambda:current[0]):
            def expire(_path):current[0]=(deadline+1)/1000
            with self.assertRaises(ValueError):promotion.apply(self.request,self.run,expire)
        self.assertFalse((self.project/'x.ts').exists())
        self.assertEqual(next(self.project.glob('.relentless-*.before')).read_text(),'old')
        self.assertNotIn('new',[path.read_text() for path in self.project.glob('x.ts')])

    def test_promotes_and_retains_original_then_resumes_without_overwrite(self):
        result=promotion.apply(self.request,self.run)
        self.assertEqual(result['status'],'applied')
        self.assertEqual((self.project/'x.ts').read_text(),'new')
        self.assertEqual((self.project/result['files'][0]['backup']).read_text(),'old')
        self.assertEqual(promotion.apply(self.request,self.run),result)

    def test_all_inputs_preflight_before_any_write(self):
        (self.project/'context.ts').write_text('developer edit')
        with self.assertRaises(ValueError):promotion.apply(self.request,self.run)
        self.assertEqual((self.project/'x.ts').read_text(),'old')
        self.assertEqual((self.project/'context.ts').read_text(),'developer edit')

    def test_recovers_interruption_after_moving_original(self):
        def interrupt(_path):raise RuntimeError('crash')
        with self.assertRaises(RuntimeError):promotion.apply(self.request,self.run,interrupt)
        self.assertFalse((self.project/'x.ts').exists())
        self.assertEqual(promotion.apply(self.request,self.run)['status'],'applied')
        self.assertEqual((self.project/'x.ts').read_text(),'new')

    def test_new_target_during_move_is_never_overwritten(self):
        def race(_path):(self.project/'x.ts').write_text('concurrent edit')
        with self.assertRaises(ValueError):promotion.apply(self.request,self.run,race)
        self.assertEqual((self.project/'x.ts').read_text(),'concurrent edit')
        with self.assertRaises(ValueError):promotion.apply(self.request,self.run)
        backups=list(self.project.glob('.relentless-*.before'))
        self.assertEqual(len(backups),1)
        self.assertEqual(backups[0].read_text(),'old')

    def test_edit_through_old_descriptor_is_retained_and_detected(self):
        file=(self.project/'x.ts').open('r+')
        self.addCleanup(file.close)
        def race(_path):file.seek(0);file.write('EDIT');file.flush()
        with self.assertRaises(ValueError):promotion.apply(self.request,self.run,race)
        self.assertIn('EDIT',next(self.project.glob('.relentless-*.before')).read_text())

    def test_symlink_and_traversal_rejected(self):
        (self.project/'x.ts').unlink();(self.project/'x.ts').symlink_to(self.project/'context.ts')
        with self.assertRaises((ValueError,OSError)):promotion.apply(self.request,self.run)
        self.assertEqual((self.project/'context.ts').read_text(),'context')
        self.request['files'][0]['path']='../escape'
        with self.assertRaises(ValueError):promotion.apply(self.request,self.run)

    def test_changed_request_cannot_reuse_intents(self):
        promotion.apply(self.request,self.run)
        self.request['files'][0]['current']='different'
        with self.assertRaises(ValueError):promotion.apply(self.request,self.run)
        self.assertEqual((self.project/'x.ts').read_text(),'new')

    def test_malformed_state_cannot_skip_files(self):
        promotion.apply(self.request,self.run)
        path=self.run/'state.json';record=json.loads(path.read_text());record['value']['files']=[]
        record['sha256']=hashlib.sha256(promotion.encode(record['value'])).hexdigest()
        path.write_bytes(promotion.encode(record))
        with self.assertRaises(ValueError):promotion.apply(self.request,self.run)

    def test_partial_stage_is_retained_and_replaced_on_recovery(self):
        original=promotion.exclusive_rename
        def stop(parent,source,target):
            # Approximate a crash during staging using an owned staged prefix.
            stage=next(self.project.glob('.relentless-*.new'));stage.write_text('partial')
            raise RuntimeError('interrupted stage')
        with patch.object(promotion,'exclusive_rename',side_effect=stop):
            with self.assertRaises(RuntimeError):promotion.apply(self.request,self.run)
        self.assertEqual(promotion.apply(self.request,self.run)['status'],'applied')
        self.assertTrue(any(p.read_text()=='partial' for p in self.project.glob('.relentless-*.new')))

    def test_writer_owns_fence_after_parent_death_and_releases_on_own_death(self):
        request=self.root/'request.json';request.write_text(json.dumps(self.request))
        marker=self.root/'paused';pidfile=self.root/'pid'
        lease_arg=(',lease='+repr(self.scheduler_lease)) if hasattr(self,'scheduler_lease') else ''
        child_code=("import sys,json,time,os; from pathlib import Path; sys.path.insert(0,"+repr(str(ROOT/'scripts'))+"); import promote_sources as p; "
                    "p.apply(json.loads(Path("+repr(str(request))+").read_text()),Path("+repr(str(self.run))+"),lambda _: (Path("+repr(str(marker))+").write_text('paused'),time.sleep(30))"+lease_arg+")")
        parent_code=("import subprocess,sys,time; from pathlib import Path; child=subprocess.Popen([sys.executable,'-c',"+repr(child_code)+"]); Path("+repr(str(pidfile))+").write_text(str(child.pid)); child.wait()")
        parent=subprocess.Popen([sys.executable,'-c',parent_code],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        child_pid=None
        try:
            deadline=time.monotonic()+5
            while not marker.exists() and time.monotonic()<deadline:time.sleep(.01)
            self.assertTrue(marker.exists());child_pid=int(pidfile.read_text())
            parent.kill();parent.wait(timeout=5)
            with sqlite3.connect(self.database,timeout=0) as db:
                with self.assertRaises(sqlite3.OperationalError):db.execute('BEGIN IMMEDIATE')
            if 'goal' in self.request:
                with sqlite3.connect(self.goal_database,timeout=0) as goal_db:
                    with self.assertRaises(sqlite3.OperationalError):goal_db.execute('BEGIN IMMEDIATE')
            os.kill(child_pid,signal.SIGKILL)
            child_pid=None
            # Poll the database lock rather than assuming delivery means stopped.
            deadline=time.monotonic()+5
            while True:
                try:
                    with sqlite3.connect(self.database,timeout=0) as db:db.execute('BEGIN IMMEDIATE')
                    break
                except sqlite3.OperationalError:
                    if time.monotonic()>deadline:raise
                    time.sleep(.01)
            if hasattr(self,'scheduler_lease'):
                successor={'owner':'successor','until':int(time.time()*1000)+20000}
                self.set_lease(successor)
                self.assertEqual(promotion.apply(self.request,self.run,lease=successor)['status'],'applied')
            else:self.assertEqual(promotion.apply(self.request,self.run)['status'],'applied')
        finally:
            if parent.poll() is None:parent.kill()
            parent.wait(timeout=5)
            if child_pid:
                try:os.kill(child_pid,signal.SIGKILL)
                except ProcessLookupError:pass

    def test_exclusive_capture_does_not_replace_an_existing_backup(self):
        parent=os.open(self.project,os.O_RDONLY|os.O_DIRECTORY)
        try:
            with self.assertRaises(FileExistsError):promotion.exclusive_rename(parent,'x.ts','context.ts')
            self.assertEqual((self.project/'x.ts').read_text(),'old')
            self.assertEqual((self.project/'context.ts').read_text(),'context')
        finally:os.close(parent)

    def test_process_death_during_stage_write_recovers_from_partial_bytes(self):
        request=self.root/'request.json';request.write_text(json.dumps(self.request))
        code="""import sys,json,os
from pathlib import Path
sys.path.insert(0, SCRIPTS)
import promote_sources as p
original=p.os.fdopen
class Interrupted:
    def __init__(self,fd,*args,**kwargs):self.fd=fd;self.file=original(fd,*args,**kwargs)
    def __enter__(self):return self
    def __exit__(self,*args):pass
    def write(self,data):
        self.file.write(data[:1]);self.file.flush();os.fsync(self.fd);os._exit(74)
p.os.fdopen=Interrupted
p.apply(json.loads(Path(REQUEST).read_text()),Path(OUTPUT))
""".replace('SCRIPTS',repr(str(ROOT/'scripts'))).replace('REQUEST',repr(str(request))).replace('OUTPUT',repr(str(self.run)))
        result=subprocess.run([sys.executable,'-c',code],capture_output=True,timeout=5)
        self.assertEqual(result.returncode,74,result.stderr)
        self.assertEqual((self.project/'x.ts').read_text(),'old')
        self.assertEqual(promotion.apply(self.request,self.run)['status'],'applied')
        self.assertTrue(any(path.read_text()=='n' for path in self.project.glob('.relentless-*.new')))

    def test_complete_unsynced_stage_is_synced_before_capture_on_recovery(self):
        request=self.root/'request.json';request.write_text(json.dumps(self.request))
        code="""import sys,json,os
from pathlib import Path
sys.path.insert(0, SCRIPTS)
import promote_sources as p
original=p.os.fdopen
class Interrupted:
    def __init__(self,fd,*args,**kwargs):self.file=original(fd,*args,**kwargs)
    def __enter__(self):return self
    def __exit__(self,*args):pass
    def write(self,data):
        self.file.write(data);self.file.flush();os._exit(74)
p.os.fdopen=Interrupted
p.apply(json.loads(Path(REQUEST).read_text()),Path(OUTPUT))
""".replace('SCRIPTS',repr(str(ROOT/'scripts'))).replace('REQUEST',repr(str(request))).replace('OUTPUT',repr(str(self.run)))
        result=subprocess.run([sys.executable,'-c',code],capture_output=True,timeout=5)
        self.assertEqual(result.returncode,74,result.stderr)
        stage=next(self.project.glob('.relentless-*.new'))
        self.assertEqual(stage.read_text(),'new')
        stage_identity=promotion.identity(stage.stat());synced=[]
        fsync=promotion.os.fsync;rename=promotion.exclusive_rename
        def sync(fd):
            fsync(fd)
            if promotion.identity(os.fstat(fd))==stage_identity:synced.append(True)
        def capture(parent,source,target):
            self.assertTrue(synced,'Recovered candidate must be synced before capture')
            rename(parent,source,target)
        with patch.object(promotion.os,'fsync',side_effect=sync),patch.object(promotion,'exclusive_rename',side_effect=capture):
            self.assertEqual(promotion.apply(self.request,self.run)['status'],'applied')

if __name__=='__main__':unittest.main()
