"""Real process interruption at cohort commits, without model inference."""
import json
import os
from pathlib import Path
import select
import signal
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = r'''
import {CodingCalibrationJournal} from './dist/coding-calibration-journal.js';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync,writeSync} from 'node:fs';
let commits=0;
const original=DatabaseSync.prototype.exec;
DatabaseSync.prototype.exec=function(sql){
 if(sql==='COMMIT'){
  commits++;
  const cut=process.env.CUT;
  const stop=()=>{
   const row=this.prepare('SELECT body FROM cohorts').get();
   writeSync(1,JSON.stringify({checkpoint:true,body:row?.body??null})+'\n');
   process.kill(process.pid,'SIGSTOP');
  };
  if(cut===`${commits}:before`)stop();
  const result=original.call(this,sql);
  if(cut===`${commits}:after`)stop();
  return result;
 }
 return original.call(this,sql);
};
const input=JSON.parse(readFileSync(process.env.INPUT,'utf8'));
const journal=new CodingCalibrationJournal(process.env.DB);
const state=journal.register(input);
const identity=journal.reserve(input.id,state.plan.trials[0].id);
writeSync(1,JSON.stringify({identity,state:journal.read(input.id)})+'\n');
journal.close();
'''

def fixture():
    def candidate(name):
        return dict(name=name,provider=name,model=name,billing='subscription',enabled=True,
                    quality=1,preference=1,efforts=['low'])
    task=dict(id='fix',prompt='Fix addition',minQuality=1,effort='low')
    artifact=dict(path='/pinned/file',sha256='a'*64)
    return dict(version=1,id='process-cohort',workload='addition',repeats=2,
                config=dict(candidates=[candidate('a'),candidate('b')]),
                review=dict(task=task,config=dict(candidates=[candidate('r1'),candidate('r2')])),
                maxReviewPairs=1,cases=[dict(id=name,request=dict(sourceRoot='/project',task=task,
                files=[dict(path='x.ts',writable=True)],maxAttempts=1),sourceHashes={'x.ts':'b'*64},
                execution=dict(package=dict(version=1,emulator=artifact,kernel=artifact,baseImage=artifact,
                tests={'test.mjs':artifact},entrypoint='test.mjs',wallSeconds=30,outputBytes=4096),
                acceptance=dict(kind='test_process_exit',expected=0))) for name in ['case-a','case-b']])

class CalibrationProcessTests(unittest.TestCase):
    def invoke(self, env):
        result=subprocess.run(['node','--input-type=module','-e',SCRIPT],cwd=ROOT,env=env,
                              capture_output=True,text=True,timeout=20)
        self.assertEqual(result.returncode,0,result.stderr)
        return json.loads(result.stdout)

    def test_kill_schema_registration_and_reservation_commits(self):
        for cut in ['1:before','1:after','2:before','2:after','3:before','3:after']:
            with self.subTest(cut=cut), tempfile.TemporaryDirectory(prefix='clanker-cohort-') as directory:
                root=Path(directory);source=root/'input.json';source.write_text(json.dumps(fixture()))
                env={**os.environ,'INPUT':str(source),'DB':str(root/'cohorts.sqlite')}
                child=subprocess.Popen(['node','--input-type=module','-e',SCRIPT],cwd=ROOT,
                    env={**env,'CUT':cut},stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
                try:
                    ready,_,_=select.select([child.stdout],[],[],20)
                    self.assertTrue(ready,'No commit boundary reached')
                    snapshot=json.loads(child.stdout.readline())
                    self.assertTrue(snapshot['checkpoint'])
                    os.kill(child.pid,signal.SIGKILL);child.wait(timeout=10)
                    self.assertEqual(child.returncode,-signal.SIGKILL)
                finally:
                    if child.poll() is None: child.kill();child.wait(timeout=10)
                    child.stdout.close();child.stderr.close()
                first=self.invoke(env);second=self.invoke(env)
                self.assertEqual(first,second)
                self.assertEqual(len(first['state']['plan']['trials']),8)
                self.assertEqual(len(first['state']['bindings']),1)
                if cut=='3:after':
                    saved=json.loads(snapshot['body'])
                    self.assertEqual(saved['bindings'],first['state']['bindings'])

    def test_competing_processes_share_reservation(self):
        with tempfile.TemporaryDirectory(prefix='clanker-cohort-race-') as directory:
            root=Path(directory);source=root/'input.json';source.write_text(json.dumps(fixture()))
            env={**os.environ,'INPUT':str(source),'DB':str(root/'cohorts.sqlite')}
            # Exercise independent processes against an initialized WAL database.
            init="import {CodingCalibrationJournal} from './dist/coding-calibration-journal.js';new CodingCalibrationJournal(process.env.DB).close();"
            subprocess.run(['node','--input-type=module','-e',init],cwd=ROOT,env=env,check=True,capture_output=True,timeout=15)
            children=[subprocess.Popen(['node','--input-type=module','-e',SCRIPT],cwd=ROOT,env=env,
                       stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True) for _ in range(3)]
            results=[]
            try:
                for child in children:
                    out,err=child.communicate(timeout=20)
                    self.assertEqual(child.returncode,0,err);results.append(json.loads(out))
            finally:
                for child in children:
                    if child.poll() is None:child.kill();child.wait(timeout=10)
            self.assertTrue(all(result==results[0] for result in results))



PREP_SCRIPT = r"""
import {preparePiCalibrationTrial} from './dist/pi-calibration-prepare.js';
import {CodingCalibrationJournal} from './dist/coding-calibration-journal.js';
import {DatabaseSync} from 'node:sqlite';
import {CodingWorkflows} from './dist/coding-workflow.js';
import {writeSync,readFileSync} from 'node:fs';
const stop=()=>{writeSync(1,'checkpoint\n');process.kill(process.pid,'SIGSTOP');};
if(process.env.CUT==='reserved'){
 const original=CodingCalibrationJournal.prototype.reserve;
 CodingCalibrationJournal.prototype.reserve=function(...args){const result=original.apply(this,args);stop();return result;};
}
if(process.env.CUT==='uncommitted'){
 const original=DatabaseSync.prototype.prepare;
 DatabaseSync.prototype.prepare=function(sql,...args){
  const statement=original.call(this,sql,...args);
  if(sql==='INSERT INTO runs VALUES(?,?,?)'){
   const run=statement.run;
   statement.run=function(...values){const result=run.apply(this,values);stop();return result;};
  }
  return statement;
 };
}
if(process.env.CUT==='before-workflow'||process.env.CUT==='after-workflow'){
 const original=CodingWorkflows.prototype.create;
 CodingWorkflows.prototype.create=function(...args){if(process.env.CUT==='before-workflow')stop();const result=original.apply(this,args);if(process.env.CUT==='after-workflow')stop();return result;};
}
const root=process.env.FIXTURE_ROOT;
const journal=new CodingCalibrationJournal(root+'/.harness/calibration.sqlite',{readOnly:true});
const state=journal.read('process-cohort');journal.close();
const candidates=[...state.plan.contract.config.candidates,...state.plan.contract.review.config.candidates];
const result=await preparePiCalibrationTrial(state.plan.contract.id,state.plan.trials[0].id,{
 cwd:root,isProjectTrusted:()=>true,models:()=>({available:candidates.map(c=>({provider:c.provider,model:c.model,efforts:c.efforts})),scoped:[]})
});
writeSync(1,JSON.stringify(result)+'\n');
"""

class CalibrationPreparationRecoveryTests(unittest.TestCase):
    def setup_project(self, directory):
        import hashlib
        root=Path(directory).resolve();(root/'.pi').mkdir()
        contract=fixture();content='export const x = 1;\n'
        (root/'x.ts').write_text(content);(root/'artifact').write_text('artifact')
        artifact=dict(path=str(root/'artifact'),sha256=hashlib.sha256(b'artifact').hexdigest())
        for item in contract['cases']:
            item['request']['sourceRoot']=str(root)
            item['sourceHashes']={'x.ts':hashlib.sha256(content.encode()).hexdigest()}
            item['execution']['package'].update(emulator=artifact,kernel=artifact,baseImage=artifact,tests={'test.mjs':artifact})
        candidates=contract['config']['candidates']+contract['review']['config']['candidates']
        (root/'.pi/settings.json').write_text(json.dumps(dict(clanker=dict(version=1,routing=dict(candidates=candidates),roles=dict(coder=['a','b'],reviewer=['r1','r2'])))))
        (root/'input.json').write_text(json.dumps(contract))
        env={**os.environ,'FIXTURE_ROOT':str(root)}
        init="""
import {CodingCalibrationJournal} from './dist/coding-calibration-journal.js';
import {CodingJournal} from './dist/coding-journal.js';
import {readFileSync} from 'node:fs';
const root=process.env.FIXTURE_ROOT;
const journal=new CodingCalibrationJournal(root+'/.harness/calibration.sqlite');
journal.register(JSON.parse(readFileSync(root+'/input.json','utf8')));journal.close();
new CodingJournal(root+'/.harness/coding.sqlite').close();
"""
        result=subprocess.run(['node','--input-type=module','-e',init],cwd=ROOT,env=env,capture_output=True,text=True,timeout=15)
        self.assertEqual(result.returncode,0,result.stderr)
        return env

    def prepare(self,env):
        result=subprocess.run(['node','--input-type=module','-e',PREP_SCRIPT],cwd=ROOT,env=env,capture_output=True,text=True,timeout=20)
        self.assertEqual(result.returncode,0,result.stderr)
        return json.loads(result.stdout)

    def test_preparation_recovers_one_coding_workflow_across_four_boundaries(self):
        for cut in ['reserved','uncommitted','before-workflow','after-workflow']:
            with self.subTest(cut=cut), tempfile.TemporaryDirectory(prefix='clanker-trial-') as directory:
                env=self.setup_project(directory)
                child=subprocess.Popen(['node','--input-type=module','-e',PREP_SCRIPT],cwd=ROOT,env={**env,'CUT':cut},stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
                try:
                    ready,_,_=select.select([child.stdout],[],[],20);self.assertTrue(ready)
                    self.assertEqual(child.stdout.readline().strip(),'checkpoint')
                    os.kill(child.pid,signal.SIGKILL);child.wait(timeout=10)
                    self.assertEqual(child.returncode,-signal.SIGKILL)
                finally:
                    if child.poll() is None:child.kill();child.wait(timeout=10)
                    child.stdout.close();child.stderr.close()
                first=self.prepare(env);self.assertEqual(first,self.prepare(env));self.assertFalse(first['dispatched'])
                import sqlite3
                with sqlite3.connect(str(Path(env['FIXTURE_ROOT'])/'.harness/coding.sqlite')) as db:
                    rows=db.execute('SELECT id,body FROM runs').fetchall();self.assertEqual(len(rows),1)
                    self.assertEqual(rows[0][0],first['codingId']);self.assertEqual(json.loads(rows[0][1])['attempts'],0)
                with sqlite3.connect(str(Path(env['FIXTURE_ROOT'])/'.harness/workflows.sqlite')) as db:
                    self.assertEqual(db.execute('SELECT count(*) FROM workflows').fetchone()[0],1)

if __name__=='__main__':unittest.main()
