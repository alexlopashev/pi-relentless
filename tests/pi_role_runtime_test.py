"""Exercise Pi's loaded command and real registry without inference."""
import pathlib
import subprocess
import unittest
ROOT = pathlib.Path(__file__).resolve().parents[1]

class PiRoleRuntimeTest(unittest.TestCase):
    def test_loaded_command_selects_local_model_and_preserves_floor(self):
        script = r'''
import {discoverAndLoadExtensions,ModelRuntime,ModelRegistry} from '@earendil-works/pi-coding-agent';
import {mkdtemp,writeFile,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const root=await mkdtemp(join(tmpdir(),'relentless-role-runtime-'));
await mkdir(join(root,'.pi'));
await writeFile(join(root,'.pi/settings.json'),JSON.stringify({relentless:{version:1,routing:{maxConcurrency:1,candidates:[{name:'local',provider:'relentless-local',model:'qwen3.5-4b',billing:'local',enabled:true,quality:1,preference:1,efforts:['off']}]},roles:{scheduler:['local']}}}));
const loaded=await discoverAndLoadExtensions([resolve('.pi/extensions/relentless.ts'),resolve('.pi/extensions/local-provider.ts')],root,join(root,'agent'));
if(loaded.errors.length)throw Error(JSON.stringify(loaded.errors));
const runtime=await ModelRuntime.create({modelsPath:null,refreshOnCreate:false,credentials:{read:async()=>undefined,list:async()=>[],modify:async()=>{throw Error('immutable')},delete:async()=>{throw Error('immutable')}}});
for(const entry of loaded.runtime.pendingProviderRegistrations)runtime.registerProvider(entry.name,entry.config);
await runtime.getAvailable('relentless-local');
const registry=new ModelRegistry(runtime);
const local=registry.find('relentless-local','qwen3.5-4b');
if(!local)throw Error('Local provider missing from Pi');
const command=loaded.extensions.flatMap(e=>[...e.commands.values()]).find(c=>c.name==='relentless');
if(!command)throw Error('Missing command');
let notice;
const context={cwd:root,isProjectTrusted:()=>true,modelRegistry:registry,scopedModels:[{model:local,thinkingLevel:'off'}],ui:{notify:(message,type)=>{notice={message,type}}}};
const task={id:'schedule',prompt:'Plan retries',minQuality:1,effort:'off'};
await command.handler('route scheduler '+JSON.stringify(task),context);
if(notice?.type!=='info')throw Error('Role route failed');
const selected=JSON.parse(notice.message);
if(selected.provider!=='relentless-local'||selected.effort!=='off'||selected.dispatched!==false)throw Error('Unexpected selection');
await command.handler('route scheduler '+JSON.stringify({...task,effort:'low'}),context);
if(notice?.type!=='error')throw Error('Reasoning floor bypassed');
'''
        result=subprocess.run(['node','--input-type=module','-'],input=script,cwd=ROOT,text=True,capture_output=True,timeout=20)
        self.assertEqual(result.returncode,0,result.stderr)
if __name__=='__main__':unittest.main()
