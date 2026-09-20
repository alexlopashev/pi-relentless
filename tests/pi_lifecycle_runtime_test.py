"""Real Pi event registration: shutdown suppresses results from old sessions."""
import pathlib
import subprocess
import unittest
ROOT=pathlib.Path(__file__).resolve().parents[1]
class PiLifecycleTest(unittest.TestCase):
    def test_shutdown_and_restart_fence_command_results(self):
        script=r'''
import {discoverAndLoadExtensions} from '@earendil-works/pi-coding-agent';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const root=await mkdtemp(join(tmpdir(),'pi-lifecycle-'));
await mkdir(join(root,'.pi'));await writeFile(join(root,'.pi/settings.json'),'{}');
const loaded=await discoverAndLoadExtensions([resolve('.pi/extensions/clanker.ts')],root,join(root,'agent'));
if(loaded.errors.length)throw Error(JSON.stringify(loaded.errors));
const extension=loaded.extensions.find(e=>e.commands.has('clanker'));
const command=extension?.commands.get('clanker');
if(!command)throw Error('Missing command');
const shutdown=extension.handlers.get('session_shutdown');
const start=extension.handlers.get('session_start');
if(!shutdown?.length||!start?.length)throw Error('Missing lifecycle handlers');
const notices=[]; const statuses=[];
const ctx={cwd:root,hasUI:true,isProjectTrusted:()=>true,ui:{setStatus:(key,value)=>statuses.push({key,value}),notify:(message,type)=>notices.push({message,type})}};
const pending=command.handler('config',ctx);
if(!statuses.some(x=>typeof x.value==='string'))throw Error('No immediate progress');
for(const handler of shutdown)await handler({type:'session_shutdown',reason:'reload'},ctx);
await pending;
if(statuses.at(-1)?.value!==undefined)throw Error('Progress not cleared');
const clearedCount=statuses.length;
if(notices.length)throw Error('Old session published after shutdown');
await command.handler('config',ctx);
if(notices.length)throw Error('Closed session accepted UI publication');
if(statuses.length!==clearedCount)throw Error('Closed session published progress');
for(const handler of start)await handler({type:'session_start',reason:'startup'},ctx);
await command.handler('config',ctx);
if(notices.length!==1||notices[0].type!=='info')throw Error('New session did not resume command admission');
'''
        result=subprocess.run(['node','--input-type=module','-'],input=script,cwd=ROOT,text=True,capture_output=True,timeout=20)
        self.assertEqual(result.returncode,0,result.stderr)
    def test_opted_in_start_resumes_and_pause_is_reachable(self):
        script=r'''
import {discoverAndLoadExtensions} from '@earendil-works/pi-coding-agent';
import {Ledger} from './dist/ledger.js';
import {mkdtemp,mkdir,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
const root=await mkdtemp(join(tmpdir(),'pi-resume-'));
await mkdir(join(root,'.pi'));
const candidate={name:'local',provider:'fixture',model:'fixture',billing:'subscription',enabled:true,quality:1,preference:1,efforts:['off']};
const ledger=new Ledger(join(root,'.harness/ledger.sqlite'));
const id=ledger.create({objective:'Do not infer in fixture',constraints:[],config:{candidates:[candidate]},maxAttempts:1,tasks:[{id:'work',prompt:'No workflow declaration',minQuality:1,effort:'off',acceptance:{kind:'contains',values:['done']}}]});
const settings={clanker:{version:1,routing:{candidates:[candidate]},roles:{coder:['local']},resumeGoal:{id,revision:1}}};
await writeFile(join(root,'.pi/settings.json'),JSON.stringify(settings));
const loaded=await discoverAndLoadExtensions([resolve('.pi/extensions/clanker.ts')],root,join(root,'agent'));
if(loaded.errors.length)throw Error(JSON.stringify(loaded.errors));
const extension=loaded.extensions.find(e=>e.commands.has('clanker'));
const notices=[];
const ctx={cwd:root,isProjectTrusted:()=>true,modelRegistry:{getAvailable:()=>[]},scopedModels:[],ui:{notify:(message,type)=>notices.push({message,type})}};
for(const h of extension.handlers.get('session_start'))await h({type:'session_start',reason:'startup'},ctx);
for(let n=0;n<100&&!notices.some(x=>x.message.includes('needs_attention'));n++)await new Promise(r=>setTimeout(r,10));
if(!notices.some(x=>x.message.includes('needs_attention')))throw Error('Opted-in startup did not settle');
await extension.commands.get('clanker').handler('pause',ctx);
if(!notices.some(x=>x.message.includes('paused')))throw Error('Pause unavailable');
if(ledger.goal(id).tasks[0].attempts!==0)throw Error('Startup consumed model work');
for(const h of extension.handlers.get('session_shutdown'))await h({type:'session_shutdown',reason:'exit'},ctx);
ledger.close();
'''
        result=subprocess.run(['node','--input-type=module','-'],input=script,cwd=ROOT,text=True,capture_output=True,timeout=20)
        self.assertEqual(result.returncode,0,result.stderr)
if __name__=='__main__':unittest.main()
