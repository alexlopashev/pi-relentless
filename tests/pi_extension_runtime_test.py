"""Pi's real loader must reach the built worker without invoking any provider."""
import pathlib
import subprocess
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]

class PiExtensionRuntimeTest(unittest.TestCase):
    def test_model_proposal_cannot_apply_configuration(self):
        script = r'''
import {discoverAndLoadExtensions} from '@earendil-works/pi-coding-agent';
import {mkdtemp,mkdir,writeFile,readFile,access,rm,readdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
const root=await mkdtemp(join(tmpdir(),'clanker-proposal-tool-'));
try {
 const loaded=await discoverAndLoadExtensions([resolve('.pi/extensions/clanker.ts')],root,join(root,'agent'));
 assert.equal(loaded.errors.length,0);
 const extension=loaded.extensions.find(e=>e.tools.has('clanker_config_propose'));
 assert.ok(extension,'Missing model-callable configuration proposal');
 assert.ok(!extension.tools.has('clanker_config_apply'));
 const tool=extension.tools.get('clanker_config_propose').definition;
 const configuration={version:1,routing:{candidates:[{name:'candidate',provider:'p',model:'m',billing:'subscription',enabled:false,quality:1,preference:1,efforts:['low']}]},roles:{coder:['candidate']}};
 let trusted=false;
 const context={cwd:root,signal:undefined,isProjectTrusted:()=>trusted,scopedModels:[],modelRegistry:{getAvailable:()=>[{provider:'p',id:'m',reasoning:true}],getAll:()=>[{provider:'p',id:'m',reasoning:true}]},ui:{confirm:()=>{throw Error('No confirmation allowed');}}};
 const run=(params={configuration},signal)=>tool.execute('call',params,signal,undefined,context);
 await assert.rejects(run());await assert.rejects(access(join(root,'.harness')));
 trusted=true;
 await assert.rejects(run({configuration},AbortSignal.abort()));
 await assert.rejects(run({configuration,approved:true}));
 await assert.rejects(run({configuration:{version:999}}));
 await assert.rejects(access(join(root,'.harness')));
 await mkdir(join(root,'.pi'));
 const before='{"privateMarker":"DO_NOT_EXPOSE","packages":[]}';
 await writeFile(join(root,'.pi/settings.json'),before);
 const result=await run();
 const text=result.content.find(c=>c.type==='text').text;
 assert.ok(!text.includes('DO_NOT_EXPOSE'));
 const body=JSON.parse(text);
 assert.equal(body.applied,false);assert.equal(body.dispatched,false);
 assert.equal(body.reviewCoverage.scope,'current_role_pools');
 assert.equal(body.reviewCoverage.allEligibleAuthors.sufficient,false);
 assert.match(body.id,/^[a-f0-9]{64}$/);
 assert.equal(body.applyCommand,'/clanker config-apply '+body.id);
 assert.equal(await readFile(join(root,'.pi/settings.json'),'utf8'),before);
 const saved=JSON.parse(await readFile(join(root,'.harness/config-proposals',body.id+'.json'),'utf8'));
 assert.equal(saved.id,body.id);assert.equal(saved.before,null);assert.equal(saved.after.routing.candidates[0].enabled,false);
 const again=JSON.parse((await run()).content[0].text);assert.equal(again.id,body.id);
 assert.equal((await readdir(join(root,'.harness/config-proposals'))).length,1);
 context.modelRegistry.getAvailable=()=>{trusted=false;return [];};
 await assert.rejects(run());
 trusted=true;
 for(const handler of extension.handlers.get('session_shutdown')??[])await handler({type:'session_shutdown'},context);
 await assert.rejects(run());
 assert.equal(await readFile(join(root,'.pi/settings.json'),'utf8'),before);
} finally {await rm(root,{recursive:true,force:true});}
'''
        result = subprocess.run(['node','--input-type=module','-'], input=script,
                                cwd=ROOT, text=True, capture_output=True, timeout=20)
        self.assertEqual(result.returncode,0,result.stderr)

    def test_model_callable_inventory_before_configuration(self):
        script = r'''
import {discoverAndLoadExtensions} from '@earendil-works/pi-coding-agent';
import {mkdtemp,mkdir,writeFile,readFile,access,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import assert from 'node:assert/strict';
const root=await mkdtemp(join(tmpdir(),'clanker-inventory-tool-'));
try {
 const loaded=await discoverAndLoadExtensions([resolve('.pi/extensions/clanker.ts')],root,join(root,'agent'));
 assert.equal(loaded.errors.length,0);
 const extension=loaded.extensions.find(e=>e.tools.has('clanker_inventory'));
 assert.ok(extension,'Missing model-callable inventory tool');
 const tool=extension.tools.get('clanker_inventory').definition;
 const models=Array.from({length:25},(_,i)=>({provider:'test',id:'model-'+i,reasoning:false}));
 let trusted=true;
 const context={cwd:root,signal:undefined,isProjectTrusted:()=>trusted,scopedModels:[],modelRegistry:{getAvailable:()=>models,getAll:()=>models}};
 const run=(params={},signal)=>tool.execute('call',params,signal,undefined,context);
 const result=await run();
 const body=JSON.parse(result.content.find(c=>c.type==='text').text);
 assert.deepEqual(body.configured,[]);
 assert.equal(body.unconfiguredAvailable.length,20);
 assert.equal(body.nextOffset,20);
 const tail=JSON.parse((await run({offset:20})).content[0].text);
 assert.equal(tail.unconfiguredAvailable.length,5);
 assert.equal(tail.nextOffset,null);
 await assert.rejects(access(join(root,'.harness')));
 await assert.rejects(access(join(root,'.pi')));
 for(const params of [{offset:-1},{offset:0.5},{offset:Number.MAX_SAFE_INTEGER+1},{command:'goal-step x'}]) await assert.rejects(run(params));
 trusted=false;
 await assert.rejects(run());
 trusted=true;
 await assert.rejects(run({},AbortSignal.abort()));
 await mkdir(join(root,'.pi'));
 await writeFile(join(root,'.pi/settings.json'),'{"clanker":{"version":999},"privateMarker":"DO_NOT_EXPOSE"}');
 await assert.rejects(run(),error=>!String(error).includes('DO_NOT_EXPOSE'));
 const before=await readFile(join(root,'.pi/settings.json'),'utf8');
 assert.ok(before.includes('DO_NOT_EXPOSE'));
 await writeFile(join(root,'.pi/settings.json'),'{}');
 context.modelRegistry.getAvailable=()=>{trusted=false;return models;};
 await assert.rejects(run());
 trusted=true;
 context.modelRegistry.getAvailable=()=>models;
 for(const handler of extension.handlers.get('session_shutdown')??[]) await handler({type:'session_shutdown'},context);
 await assert.rejects(run());
} finally {await rm(root,{recursive:true,force:true});}
'''
        result = subprocess.run(['node','--input-type=module','-'], input=script,
                                cwd=ROOT, text=True, capture_output=True, timeout=20)
        self.assertEqual(result.returncode,0,result.stderr)

    def test_source_extension_reaches_worker_validation(self):
        script = r'''
import {discoverAndLoadExtensions} from '@earendil-works/pi-coding-agent';
import {mkdtemp,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const root=await mkdtemp(join(tmpdir(),'clanker-pi-worker-'));
const extension=join(root,'probe.ts');
await writeFile(extension, `import {processWorker} from ${JSON.stringify(resolve('src/process-worker.ts'))};
export default async function () {
  try {
    await processWorker({config:{timeoutMs:1000},selection:{candidate:{billing:'subscription'}}},new AbortController().signal);
    throw Error('Invalid job unexpectedly succeeded');
  } catch(error) {
    if(error.kind!=='unknown')throw Error('Worker validation was not reached: '+error.kind);
  }
}`);
const result=await discoverAndLoadExtensions([extension,resolve('.pi/extensions/clanker.ts')],root,join(root,'agent'));
if(result.errors.length)throw Error(JSON.stringify(result.errors));
if(!result.extensions.some(e=>e.commands.has('clanker')))throw Error('Missing command');
const {mkdir}=await import('node:fs/promises');
await mkdir(join(root,'.pi'));
await writeFile(join(root,'x.ts'),'export const x=1;');
const names=['author','review-a','review-b'];
const candidates=names.map(name=>({name,provider:name,model:name,billing:'subscription',enabled:true,quality:1,preference:1,efforts:['low']}));
await writeFile(join(root,'.pi/settings.json'),JSON.stringify({clanker:{version:1,routing:{candidates,maxConcurrency:1},roles:{coder:['author'],reviewer:['review-a','review-b']}}}));
const command=result.extensions.flatMap(e=>[...e.commands.values()]).find(c=>c.name==='clanker');
let notice;
const task={id:'fix',prompt:'Fix x',minQuality:1,effort:'low'};
await command.handler('create '+JSON.stringify({task,files:[{path:'x.ts',writable:true}],maxAttempts:1,reviewTask:{...task,id:'review'},maxReviewPairs:1}),{
 cwd:root,isProjectTrusted:()=>true,scopedModels:[],
 modelRegistry:{getAvailable:()=>names.map(name=>({provider:name,id:name,reasoning:true}))},
 ui:{notify:(message,type)=>{notice={message,type}}}
});
if(notice?.type!=='info')throw Error('Loaded creation failed');
const created=JSON.parse(notice.message);
if(created.phase!=='coding'||created.dispatched!==false)throw Error('Wrong creation result');
const {CodingJournal}=await import('./dist/coding-journal.js');
const journal=new CodingJournal(join(root,'.harness/coding.sqlite'));
try{if(journal.read(created.id).attempts!==0)throw Error('Creation dispatched work');}finally{journal.close();}

'''
        result = subprocess.run(['node','--input-type=module','-'], input=script,
                                cwd=ROOT, text=True, capture_output=True, timeout=20)
        self.assertEqual(result.returncode,0,result.stderr)

if __name__=='__main__': unittest.main()
