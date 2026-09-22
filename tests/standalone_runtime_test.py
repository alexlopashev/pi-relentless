"""Offline compatibility checks; opt in with RELENTLESS_TEST_BUN and RELENTLESS_TEST_PI."""
import json
import os
import pathlib
import subprocess
import tempfile
import time
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]
BUN = os.environ.get('RELENTLESS_TEST_BUN')
PI = os.environ.get('RELENTLESS_TEST_PI')

class StandaloneRuntimeTest(unittest.TestCase):
    @unittest.skipUnless(BUN, 'set RELENTLESS_TEST_BUN to test Bun')
    def test_sqlite_workers_and_syntax(self):
        script = r'''
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,openSync,closeSync,rmSync,symlinkSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {DatabaseSync,backup} from './dist/sqlite.js';
import {Ledger} from './dist/ledger.js';
import {nodeExecutable} from './dist/node-runtime.js';
import {checkFiles} from './dist/coding-worker.js';
import {processWorker} from './dist/process-worker.js';
const root=mkdtempSync(join(tmpdir(),'relentless-bun-'));
try {
 const db=new DatabaseSync(join(root,'db'));
 db.exec('PRAGMA journal_mode=WAL;CREATE TABLE t(x TEXT);BEGIN IMMEDIATE');
 assert.equal(db.prepare('INSERT INTO t VALUES(?)').run('rollback').changes,1);
 db.exec('ROLLBACK');assert.equal(db.prepare('SELECT * FROM t').get(),undefined);
 const insert=db.prepare('INSERT INTO t VALUES(?)');insert.run('first');insert.run('second');
 assert.deepEqual(db.prepare('SELECT x FROM t').all().map(r=>r.x),['first','second']);
 db.exec('BEGIN IMMEDIATE');
 const lockScript=`import {DatabaseSync} from './dist/sqlite.js';import assert from 'node:assert/strict';const d=new DatabaseSync(${JSON.stringify(join(root,'db'))});d.exec('PRAGMA busy_timeout=20');assert.throws(()=>d.exec('BEGIN IMMEDIATE'));d.close();`;
 execFileSync(nodeExecutable(),['--input-type=module','-e',lockScript]);db.exec('ROLLBACK');
 const ro=new DatabaseSync(join(root,'db'),{readOnly:true});
 assert.throws(()=>ro.exec('DELETE FROM t'));
 ro.exec('BEGIN');assert.equal(ro.prepare('SELECT COUNT(*) AS n FROM t').get().n,2);
 insert.run('third');assert.equal(ro.prepare('SELECT COUNT(*) AS n FROM t').get().n,2);
 ro.exec('COMMIT');
 const out=join(root,'out');closeSync(openSync(out,'wx',0o600));await backup(ro,out);
 const restored=new DatabaseSync(out,{readOnly:true});assert.equal(restored.prepare('SELECT COUNT(*) AS n FROM t').get().n,3);restored.close();
 await assert.rejects(backup(ro,out));
 const link=join(root,'link');symlinkSync(out,link);await assert.rejects(backup(ro,link));
 const fifo=join(root,'fifo');execFileSync('mkfifo',[fifo]);await assert.rejects(backup(ro,fifo));
 ro.close();db.close();
 const node=nodeExecutable();assert.notEqual(node,process.execPath);
 assert.equal(execFileSync(node,['-p','typeof process.versions.bun'],{encoding:'utf8'}).trim(),'undefined');
 const ledgerPath=join(root,'ledger');
 execFileSync(node,['--input-type=module','-e',`import {Ledger} from './dist/ledger.js';const l=new Ledger(${JSON.stringify(ledgerPath)});l.close()`]);
 const ledger=new Ledger(ledgerPath);assert.equal(ledger.read().version,1);
 ledger.transaction('bun',1,s=>{s.health.test={until:42,failures:1,reason:'quota'};});
 const saved=join(root,'saved');ledger.backup(saved);ledger.close();
 const target=join(root,'restored');await Ledger.restore(saved,target);
 execFileSync(node,['--input-type=module','-e',`import {Ledger} from './dist/ledger.js';const l=new Ledger(${JSON.stringify(target)});if(l.read().health.test.until!==42||l.events().length!==1)throw Error('Lost Bun checkpoint');l.close()`]);
 await assert.rejects(Ledger.restore(saved,target));
 mkdirSync(join(root,'workspace'));
 assert.equal((await checkFiles(root,new Map([['ok.ts','export const x: number = 1;']]),new Set(['ok.ts'])))[0].passed,true);
 assert.equal((await checkFiles(root,new Map([['bad.ts','export const = ;']]),new Set(['bad.ts'])))[0].passed,false);
 await assert.rejects(processWorker({config:{timeoutMs:100}},new AbortController().signal),e=>e.kind==='unknown');
} finally {rmSync(root,{recursive:true,force:true});}
'''
        result = subprocess.run([BUN, '-e', script], cwd=ROOT, text=True, capture_output=True, timeout=40)
        self.assertEqual(result.returncode, 0, result.stderr)

    @unittest.skipUnless(PI, 'set RELENTLESS_TEST_PI to test standalone Pi')
    def test_real_standalone_extension_registration(self):
        with tempfile.TemporaryDirectory(prefix='relentless-pi-') as directory:
            root = pathlib.Path(directory)
            probe = root / 'probe.ts'
            result = root / 'result.json'
            probe.write_text('import extension from '+json.dumps(str(ROOT / '.pi/extensions/relentless.ts'))+';\n'
                'import {writeFileSync} from "node:fs";\n'
                'export default async function(pi) {\n'
                'try {await extension(pi);writeFileSync('+json.dumps(str(result))+',JSON.stringify({ok:true,bun:process.versions.bun}));}\n'
                'catch(e){writeFileSync('+json.dumps(str(result))+',JSON.stringify({ok:false,error:String(e)}));}\n}\n')
            env = dict(os.environ, PI_CODING_AGENT_DIR=str(root / 'agent'))
            with tempfile.TemporaryFile(mode='w+') as log:
                child = subprocess.Popen([PI, '-e', str(probe), '--mode', 'rpc', '--no-session'],cwd=root,env=env,stdin=subprocess.PIPE,stdout=log,stderr=log,text=True)
                try:
                    deadline = time.monotonic()+20
                    while not result.exists() and child.poll() is None and time.monotonic()<deadline:
                        time.sleep(.1)
                    self.assertTrue(result.exists(), 'Standalone Pi did not register the extension')
                    observed=json.loads(result.read_text())
                    self.assertTrue(observed['ok'], observed)
                    self.assertTrue(observed.get('bun'), observed)
                finally:
                    child.terminate()
                    try: child.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        child.kill();child.wait(timeout=5)
                    child.stdin.close()

if __name__ == '__main__': unittest.main()
