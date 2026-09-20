"""Kill real creation processes at commit boundaries; no inference or network."""
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
import {createPiWork} from './dist/pi-work-create.js';
import {DatabaseSync} from 'node:sqlite';
import {CodingWorkflows} from './dist/coding-workflow.js';
import {writeSync} from 'node:fs';
const names=['author','review-a','review-b'];
const stop=()=>{writeSync(1,'checkpoint\n');process.kill(process.pid,'SIGSTOP');};
const stage=process.env.CUT;
if(stage==='uncommitted'){
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
if(stage==='before-workflow'||stage==='after-workflow'){
 const original=CodingWorkflows.prototype.create;
 CodingWorkflows.prototype.create=function(...args){
  if(stage==='before-workflow')stop();
  const result=original.apply(this,args);
  if(stage==='after-workflow')stop();return result;
 };
}
const task={id:'fault-fixture',prompt:'Fix x',minQuality:1,effort:'low'};
const result=await createPiWork(JSON.stringify({task,files:[{path:'x.ts',writable:true}],maxAttempts:2,reviewTask:{...task,id:'review'},maxReviewPairs:1}),{
 cwd:process.env.FIXTURE_ROOT,isProjectTrusted:()=>true,
 models:()=>({available:names.map(name=>({provider:name,model:name,efforts:['low']})),scoped:[]})
});
writeSync(1,JSON.stringify(result)+'\n');
'''

class PiCreationRecoveryTests(unittest.TestCase):
    def fixture(self, root):
        (root / '.pi').mkdir()
        (root / 'x.ts').write_text('export const x=1;')
        candidates = [dict(name=n, provider=n, model=n, billing='subscription', enabled=True,
                           quality=1, preference=1, efforts=['low']) for n in ['author','review-a','review-b']]
        (root / '.pi/settings.json').write_text(json.dumps({'clanker':{'version':1,'routing':{'candidates':candidates,'maxConcurrency':1},'roles':{'coder':['author'],'reviewer':['review-a','review-b']}}}))

    def run_creation(self, env):
        result = subprocess.run(['node','--input-type=module','-e',SCRIPT],cwd=ROOT,env=env,
                                capture_output=True,text=True,timeout=20)
        self.assertEqual(result.returncode,0,result.stderr)
        return json.loads(result.stdout)

    def assert_single(self, env, expected_id):
        code = r'''
import {DatabaseSync} from 'node:sqlite';
import {join} from 'node:path';
const root=process.env.FIXTURE_ROOT;
const coding=new DatabaseSync(join(root,'.harness/coding.sqlite'));
const workflows=new DatabaseSync(join(root,'.harness/workflows.sqlite'));
const rows=coding.prepare('SELECT id,body FROM runs').all();
if(rows.length!==1||rows[0].id!==process.env.EXPECTED_ID||JSON.parse(rows[0].body).attempts!==0)throw Error('Duplicate or dispatched coding task');
if(coding.prepare('SELECT * FROM pi_creations').all().length!==1)throw Error('Missing or duplicate intent');
if(workflows.prepare('SELECT * FROM workflows').all().length!==1)throw Error('Missing or duplicate workflow');
coding.close();workflows.close();
'''
        result=subprocess.run(['node','--input-type=module','-e',code],cwd=ROOT,
                              env={**env,'EXPECTED_ID':expected_id},capture_output=True,text=True,timeout=15)
        self.assertEqual(result.returncode,0,result.stderr)

    def test_sigkill_at_three_creation_boundaries(self):
        for stage in ['uncommitted','before-workflow','after-workflow']:
            with self.subTest(stage=stage), tempfile.TemporaryDirectory(prefix='clanker-pi-create-') as directory:
                root=Path(directory);self.fixture(root)
                env={**os.environ,'FIXTURE_ROOT':directory}
                child=subprocess.Popen(['node','--input-type=module','-e',SCRIPT],cwd=ROOT,
                                       env={**env,'CUT':stage},stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True)
                try:
                    ready,_,_=select.select([child.stdout],[],[],15)
                    self.assertTrue(ready,'Creation did not reach fault boundary')
                    self.assertEqual(child.stdout.readline().strip(),'checkpoint')
                    os.kill(child.pid,signal.SIGKILL)
                    child.wait(timeout=10)
                    self.assertEqual(child.returncode,-signal.SIGKILL)
                finally:
                    if child.poll() is None: child.kill();child.wait(timeout=10)
                    child.stdout.close();child.stderr.close()
                first=self.run_creation(env);second=self.run_creation(env)
                self.assertEqual(first,second)
                self.assertEqual(first['phase'],'coding')
                self.assertFalse(first['dispatched'])
                self.assert_single(env,first['id'])
                self.assertEqual((root/'x.ts').read_text(),'export const x=1;')

    def test_concurrent_creations_share_one_intent_and_task(self):
        with tempfile.TemporaryDirectory(prefix='clanker-pi-concurrent-') as directory:
            root=Path(directory);self.fixture(root)
            env={**os.environ,'FIXTURE_ROOT':directory}
            # Initialize the journal schema; concurrent insertion is the boundary under test.
            init="import {CodingJournal} from './dist/coding-journal.js';new CodingJournal(process.env.FIXTURE_ROOT+'/.harness/coding.sqlite').close();"
            subprocess.run(['node','--input-type=module','-e',init],cwd=ROOT,env=env,check=True,capture_output=True,timeout=15)
            children=[subprocess.Popen(['node','--input-type=module','-e',SCRIPT],cwd=ROOT,env=env,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True) for _ in range(3)]
            outputs=[]
            try:
                for child in children:
                    out,err=child.communicate(timeout=20)
                    self.assertEqual(child.returncode,0,err)
                    outputs.append(json.loads(out))
            finally:
                for child in children:
                    if child.poll() is None: child.kill();child.wait(timeout=10)
            final=self.run_creation(env)
            self.assertTrue(all(result['id']==final['id'] for result in outputs))
            self.assert_single(env,final['id'])

if __name__=='__main__':unittest.main()
