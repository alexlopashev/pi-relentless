"""Fault injection against compiled supervisor; all workers are offline fixtures."""
import json
import os
from pathlib import Path
import select
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
IMPORTS = f"""
import {{Ledger}} from {json.dumps((ROOT / 'dist/ledger.js').as_uri())};
import {{Supervisor}} from {json.dumps((ROOT / 'dist/supervisor.js').as_uri())};
"""
CONTRACT = {
    "objective": "Offline crash fixture", "constraints": ["No tools"],
    "config": {"candidates": [{"name": "fixture", "provider": "fixture", "model": "none", "billing": "subscription", "enabled": True, "quality": 1, "preference": 1, "efforts": ["off"]}], "timeoutMs": 100},
    "tasks": [{"id": "one", "prompt": "fixture", "minQuality": 1, "effort": "off", "acceptance": {"kind": "json", "equals": {"ok": True}}}],
    "retryBaseMs": 100, "retryMaxMs": 1000,
}

def run(code, env):
    return subprocess.run(["node", "--input-type=module", "-e", IMPORTS + code], env=env, text=True, capture_output=True, check=True, timeout=15).stdout.strip()

class RecoveryTests(unittest.TestCase):
    def test_sigkill_after_dispatch_preserves_goal_and_budget(self):
        with tempfile.TemporaryDirectory(prefix="relentless-crash-") as directory:
            env = {**os.environ, "FIXTURE_DB": str(Path(directory) / "ledger.sqlite")}
            code = IMPORTS + f"""
const ledger = new Ledger(process.env.FIXTURE_DB);
const id = ledger.create({json.dumps(CONTRACT)}, 0);
const supervisor = new Supervisor(ledger, () => {{ console.log(id); return new Promise(() => {{}}); }}, () => 1000);
await supervisor.tick();
"""
            process = subprocess.Popen(["node", "--input-type=module", "-e", code], env=env, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            try:
                self.assertTrue(select.select([process.stdout], [], [], 10)[0], "worker did not start")
                goal_id = process.stdout.readline().strip()
                self.assertTrue(goal_id)
                process.kill()
                process.wait(timeout=5)
            finally:
                if process.poll() is None:
                    process.kill()
                process.communicate(timeout=5)
            value = run("""
const ledger = new Ledger(process.env.FIXTURE_DB);
const before = ledger.read().goals[0];
let now = 100000; let calls = 0;
const supervisor = new Supervisor(ledger, async () => { calls++; return '{"ok":true}'; }, () => now);
await supervisor.tick(); now += 1000; await supervisor.tick();
const after = ledger.read().goals[0]; supervisor.close(); ledger.close();
console.log(JSON.stringify({before, after, calls}));
""", env)
            data = json.loads(value)
            self.assertEqual(data["before"]["tasks"][0]["attempts"], 1)
            self.assertEqual(data["before"]["tasks"][0]["status"], "running")
            self.assertEqual(data["after"]["status"], "completed")
            self.assertEqual(data["after"]["tasks"][0]["attempts"], 2)
            self.assertEqual(data["calls"], 1)

    def test_sqlite_commit_failure_rejects_dispatch(self):
        with tempfile.TemporaryDirectory(prefix="relentless-full-") as directory:
            env = {**os.environ, "FIXTURE_DB": str(Path(directory) / "ledger.sqlite")}
            value = run(f"""
import {{DatabaseSync}} from 'node:sqlite';
const ledger = new Ledger(process.env.FIXTURE_DB);
ledger.create({json.dumps(CONTRACT)}, 0); ledger.close();
const db = new DatabaseSync(process.env.FIXTURE_DB);
db.exec("CREATE TRIGGER fail_dispatch BEFORE UPDATE ON checkpoint BEGIN SELECT RAISE(ABORT, 'disk full fixture'); END;"); db.close();
const reopened = new Ledger(process.env.FIXTURE_DB); let calls = 0;
const supervisor = new Supervisor(reopened, async () => {{ calls++; return '{{"ok":true}}'; }}, () => 1000);
let failed = false; try {{ await supervisor.tick(); }} catch {{ failed = true; }}
console.log(JSON.stringify({{failed,calls,state:reopened.read().goals[0].tasks[0].status}})); reopened.close();
""", env)
            data = json.loads(value)
            self.assertTrue(data["failed"])
            self.assertEqual(data["calls"], 0)
            self.assertEqual(data["state"], "ready")

    def test_coding_sigkill_preserves_snapshot_and_consumed_attempt(self):
        with tempfile.TemporaryDirectory(prefix="relentless-coding-crash-") as directory:
            env = {**os.environ, "FIXTURE_DB": str(Path(directory) / "coding.sqlite")}
            imports = f"""
import {{CodingJournal}} from {json.dumps((ROOT / 'dist/coding-journal.js').as_uri())};
import {{resumeCoding}} from {json.dumps((ROOT / 'dist/durable-coding.js').as_uri())};
import {{writeFileSync, readFileSync, rmSync}} from 'node:fs';
"""
            request = {"sourceRoot": directory, "task": {"id": "repair", "prompt": "Repair syntax", "minQuality": 1, "effort": "off"}, "files": [{"path": "x.mjs", "writable": True}], "maxAttempts": 2}
            crashed = subprocess.run(["node", "--input-type=module", "-e", imports + f"""
const journal = new CodingJournal(process.env.FIXTURE_DB);
const id = journal.create({json.dumps(request)}, {json.dumps(CONTRACT['config'])}, {{'x.mjs':'export const x = ;'}});
journal.start(id,'crashed',0,1);
writeFileSync(process.env.FIXTURE_DB+'.id',id);
process.kill(process.pid,'SIGKILL');
"""], env=env, capture_output=True, timeout=15)
            self.assertEqual(crashed.returncode, -9)
            value = run(imports + """
const journal = new CodingJournal(process.env.FIXTURE_DB);
const id = readFileSync(process.env.FIXTURE_DB+'.id','utf8');
const before=journal.read(id); let calls=0;
const result=await resumeCoding(id,journal,async()=>{calls++;return JSON.stringify({edits:[{path:'x.mjs',content:'export const x = 1;'}]});});
const after=journal.read(id);
if(result.directory) rmSync(result.directory,{recursive:true,force:true});
journal.close(); console.log(JSON.stringify({before,after,calls}));
""", env)
            data = json.loads(value)
            self.assertEqual(data["before"]["attempts"], 1)
            self.assertEqual(data["before"]["status"], "running")
            self.assertEqual(data["after"]["attempts"], 1)
            self.assertEqual(data["after"]["status"], "ambiguous")
            self.assertEqual(data["after"]["files"]["x.mjs"]["original"], "export const x = ;")
            self.assertEqual(data["calls"], 0)

    def test_coding_cli_cancel_stops_a_separate_worker_process(self):
        with tempfile.TemporaryDirectory(prefix="relentless-cancel-") as directory:
            env = {**os.environ, "FIXTURE_DB": str(Path(directory) / ".harness/coding.sqlite"), "FIXTURE_ROOT": directory}
            imports = f"""
import {{CodingJournal}} from {json.dumps((ROOT / 'dist/coding-journal.js').as_uri())};
import {{resumeCoding}} from {json.dumps((ROOT / 'dist/durable-coding.js').as_uri())};
import {{codingCli}} from {json.dumps((ROOT / 'dist/coding-cli.js').as_uri())};
import {{rmSync}} from 'node:fs';
"""
            request = {"sourceRoot": directory, "task": {"id": "repair", "prompt": "Repair", "minQuality": 1, "effort": "off"}, "files": [{"path": "x.mjs", "writable": True}], "maxAttempts": 2}
            config = {**CONTRACT["config"], "timeoutMs": 10000}
            code = imports + f"""
const journal=new CodingJournal(process.env.FIXTURE_DB);
const id=journal.create({json.dumps(request)}, {json.dumps(config)}, {{'x.mjs':'export const x = ;'}});
let aborted=false;
const result=await resumeCoding(id,journal,(_task,_selection,signal)=>{{
 console.log(id);
 return new Promise((_resolve,reject)=>{{signal.addEventListener('abort',()=>{{aborted=true;reject(new Error('cancelled'));}},{{once:true}});}});
}});
const state=journal.read(id);journal.close();
if(result.directory)rmSync(result.directory,{{recursive:true,force:true}});
console.log(JSON.stringify({{status:result.status,attempts:state.attempts,aborted,current:state.files['x.mjs'].current}}));
"""
            process=subprocess.Popen(["node","--input-type=module","-e",code],env=env,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
            try:
                self.assertTrue(select.select([process.stdout],[],[],10)[0],"coding worker did not start")
                run_id=process.stdout.readline().strip()
                self.assertTrue(run_id)
                cancelled=json.loads(run(imports+f"console.log(JSON.stringify(await codingCli(['cancel',{json.dumps(run_id)}],process.env.FIXTURE_ROOT)));",env))
                self.assertEqual(cancelled["status"],"cancelled")
                stdout,stderr=process.communicate(timeout=10)
                self.assertEqual(process.returncode,0,stderr)
                result=json.loads(stdout.strip())
                self.assertTrue(result["aborted"])
                self.assertEqual(result["status"],"cancelled")
                self.assertEqual(result["attempts"],1)
                self.assertEqual(result["current"],"export const x = ;")
            finally:
                if process.poll() is None:
                    process.kill()
                    process.communicate(timeout=5)

    def test_coding_cooldown_survives_process_exit_and_blocks_other_run(self):
        with tempfile.TemporaryDirectory(prefix="relentless-shared-health-") as directory:
            env = {**os.environ, "FIXTURE_DB": str(Path(directory) / "coding.sqlite")}
            imports = f"""
import {{CodingJournal}} from {json.dumps((ROOT / 'dist/coding-journal.js').as_uri())};
import {{Failure}} from {json.dumps((ROOT / 'dist/failures.js').as_uri())};
"""
            request = {"sourceRoot": directory, "task": {"id": "repair", "prompt": "Repair", "minQuality": 1, "effort": "off"}, "files": [{"path": "x.mjs", "writable": True}], "maxAttempts": 2}
            ids = json.loads(run(imports + f"""
const j = new CodingJournal(process.env.FIXTURE_DB);
const a = j.create({json.dumps(request)}, {json.dumps(CONTRACT['config'])}, {{'x.mjs':'export const x = ;'}});
const b = j.create({json.dumps(request)}, {json.dumps(CONTRACT['config'])}, {{'x.mjs':'export const x = ;'}});
const token = j.start(a,'first',100,100);
j.fail(a, token, new Failure('quota',90000),101);
j.close(); console.log(JSON.stringify({{a,b}}));
""", env))
            result = json.loads(run(imports + f"""
const j = new CodingJournal(process.env.FIXTURE_DB);
const id = {json.dumps(ids['b'])};
const early = j.start(id,'waiting',102,100);
const before = j.read(id);
const due = j.start(id,'retry',90101,100);
const after = j.read(id);
j.close(); console.log(JSON.stringify({{early,before,due,after}}));
""", env))
            self.assertIsNone(result["early"])
            self.assertEqual(result["before"]["attempts"], 0)
            self.assertEqual(result["before"]["status"], "waiting_retry")
            self.assertEqual(result["before"]["dueAt"], 90101)
            self.assertEqual(result["due"]["epoch"], 1)
            self.assertEqual(result["after"]["attempts"], 1)

    def test_workflow_crash_during_review_preserves_reservation_without_replay(self):
        with tempfile.TemporaryDirectory(prefix="relentless-workflow-crash-") as directory:
            env = {**os.environ, "FIXTURE_ROOT": directory}
            imports = f"""
import {{CodingJournal}} from {json.dumps((ROOT / 'dist/coding-journal.js').as_uri())};
import {{CodingWorkflows}} from {json.dumps((ROOT / 'dist/coding-workflow.js').as_uri())};
import {{DatabaseSync}} from 'node:sqlite';
import {{writeFileSync,readFileSync,rmSync}} from 'node:fs';
import {{join}} from 'node:path';
"""
            task = {"id": "repair", "prompt": "Export x = 2", "minQuality": 1, "effort": "off"}
            request = {"sourceRoot": directory, "task": task, "files": [{"path": "x.mjs", "writable": True}], "maxAttempts": 2}
            reviewer = {**CONTRACT["config"]["candidates"][0], "name": "review-a", "provider": "review-a"}
            second = {**reviewer, "name": "review-b", "provider": "review-b"}
            review = {"task": task, "config": {"candidates": [reviewer, second], "timeoutMs": 10000}}
            code = imports + f"""
const root=process.env.FIXTURE_ROOT;
const coding=new CodingJournal(join(root,'coding.sqlite'));
const id=coding.create({json.dumps(request)},{json.dumps(CONTRACT['config'])},{{'x.mjs':'export const x = ;'}});
const workflows=new CodingWorkflows(join(root,'workflows.sqlite'));
workflows.create(id,coding,{json.dumps(review)},2);
writeFileSync(join(root,'id'),id);
await workflows.resume(id,coding,(_task,selection)=>{{
 if(selection.candidate.provider==='fixture')return Promise.resolve(JSON.stringify({{edits:[{{path:'x.mjs',content:'export const x = 2;'}}]}}));
 console.log(id);
 return new Promise(()=>{{}});
}});
"""
            process = subprocess.Popen(["node", "--input-type=module", "-e", code], env=env, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            try:
                self.assertTrue(select.select([process.stdout], [], [], 10)[0], "review did not start")
                self.assertTrue(process.stdout.readline().strip())
                process.kill()
                process.communicate(timeout=5)
            finally:
                if process.poll() is None:
                    process.kill()
                    process.communicate(timeout=5)
            value = run(imports + """
const root=process.env.FIXTURE_ROOT;
const id=readFileSync(join(root,'id'),'utf8');
const db=new DatabaseSync(join(root,'workflows.sqlite'));
// Advance only the dead controller's lease boundary, avoiding a 30-second test wait.
db.exec('UPDATE workflows SET until=0');db.close();
const coding=new CodingJournal(join(root,'coding.sqlite'));
const workflows=new CodingWorkflows(join(root,'workflows.sqlite'));
const before=workflows.read(id);let calls=0;
const after=await workflows.resume(id,coding,()=>{calls++;throw Error('Must not replay');});
console.log(JSON.stringify({before,after,calls,attempts:coding.read(id).attempts}));
for(const directory of after.artifactDirectories)rmSync(directory,{recursive:true,force:true});
workflows.close();coding.close();
""", env)
            data=json.loads(value)
            self.assertEqual(data["before"]["phase"], "reviewing")
            self.assertEqual(data["after"]["phase"], "blocked")
            self.assertEqual(data["after"]["reason"], "ambiguous_review")
            self.assertEqual(data["after"]["reviewPairsUsed"], 1)
            self.assertEqual(data["attempts"], 1)
            self.assertEqual(data["calls"], 0)

    def test_evaluation_kill_retains_observation_and_ambiguous_reservation(self):
        with tempfile.TemporaryDirectory(prefix="relentless-eval-crash-") as directory:
            env = {**os.environ, "FIXTURE_DB": str(Path(directory) / "evaluation.sqlite")}
            setup = f"""
import {{EvaluationCheckpoint}} from {json.dumps((ROOT / 'dist/evaluation-checkpoint.js').as_uri())};
import {{evaluate}} from {json.dumps((ROOT / 'dist/evaluation.js').as_uri())};
import {{configSchema}} from {json.dumps((ROOT / 'dist/router.js').as_uri())};
const config=configSchema.parse({json.dumps(CONTRACT['config'])});
const suite={{workload:"crash",effort:"off",cases:[{{id:"a",prompt:"a",acceptance:{{kind:"json",equals:{{ok:true}}}}}},{{id:"b",prompt:"b",acceptance:{{kind:"json",equals:{{ok:true}}}}}}]}};
const cp=new EvaluationCheckpoint(process.env.FIXTURE_DB,{{suite,config}});
"""
            process=subprocess.Popen(["node","--input-type=module","-e",setup+"""
let calls=0;
await evaluate(suite,config,()=>{if(++calls===1)return Promise.resolve('{"ok":true}');console.log('reserved');return new Promise(()=>{});},Date.now,()=>undefined,cp);
"""],env=env,text=True,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
            try:
                self.assertTrue(select.select([process.stdout],[],[],10)[0])
                self.assertEqual(process.stdout.readline().strip(),"reserved")
                process.kill()
                process.wait(timeout=5)
            finally:
                if process.poll() is None:
                    process.kill()
                process.communicate(timeout=5)
            result=run(setup+"""
let calls=0,error='';
try{await evaluate(suite,config,()=>{calls++;return Promise.resolve('{}');},Date.now,()=>undefined,cp);}catch(e){error=e.message;}
console.log(JSON.stringify({calls,error,state:cp.read()}));cp.close();
""",env)
            data=json.loads(result)
            self.assertEqual(data["calls"],0)
            self.assertIn("Ambiguous",data["error"])
            self.assertEqual(len(data["state"]["report"]["observations"]),1)
            self.assertIsNotNone(data["state"]["pending"])

if __name__ == "__main__":
    unittest.main()
