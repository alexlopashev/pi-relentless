"""Offline release acceptance: real archive, isolated install, no live inference.

Run after npm pack: python3 tests/package_release_test.py ARCHIVE STORE_DIRECTORY
The dependency store must already contain the frozen production graph.
"""
import json
import pathlib
import shutil
import subprocess
import sys
import tarfile
import tempfile

archive = pathlib.Path(sys.argv[1]).resolve()
store = pathlib.Path(sys.argv[2]).resolve()
with tempfile.TemporaryDirectory(prefix="clanker-release-") as directory:
    root = pathlib.Path(directory)
    with tarfile.open(archive) as package:
        members = package.getmembers()
        names = {m.name.removeprefix("package/") for m in members}
        required = {"LICENSE", "scripts/prepare-install.mjs", "dist/worker-entry.js", "dist/managed-local-entry.js", "release-lock.yaml",
                    "scripts/verify_vm.py", "scripts/package_vm.py", "scripts/promote_sources.py",
                    ".pi/extensions/clanker.ts", "skills/clanker-configure/SKILL.md"}
        assert required <= names, required - names
        for member in members:
            path = pathlib.PurePosixPath(member.name)
            assert path.parts[0] == "package" and ".." not in path.parts
            assert member.isfile() or member.isdir(), member.name
            relative = member.name.removeprefix("package/")
            assert not relative.startswith((".harness/", "node_modules/", "tests/", ".env"))
            assert relative != ".pi/settings.json"
        package.extractall(root)
    installed = root / "package"
    shutil.copyfile(installed / "release-lock.yaml", installed / "pnpm-lock.yaml")
    subprocess.run(["pnpm", "install", "--offline", "--frozen-lockfile", "--prod", "--ignore-scripts",
                    "--store-dir", str(store)], cwd=installed, check=True)
    script = r'''
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {discoverAndLoadExtensions,loadSkillsFromDir} from '@earendil-works/pi-coding-agent';
const manifest=JSON.parse(await readFile('package.json','utf8'));
const project=resolve('../consumer');await mkdir(project);
const probe=join(project,'probe.ts');
await writeFile(probe, `import {processWorker} from ${JSON.stringify(resolve('src/process-worker.ts'))};
export default async function () {
 try {await processWorker({config:{timeoutMs:1000},selection:{candidate:{billing:'subscription'}}},new AbortController().signal);throw Error('Unexpected success');}
 catch(error){if(error.kind!=='unknown')throw Error('Worker validation not reached: '+error.kind);}
}`);
const loaded=await discoverAndLoadExtensions([...manifest.pi.extensions.map(p=>resolve(p)),probe],project,join(project,'agent'));
assert.deepEqual(loaded.errors,[]);
const command=loaded.extensions.find(e=>e.commands.has('clanker'))?.commands.get('clanker');
assert.ok(command);
const notices=[];const statuses=[];
await command.handler('inventory',{cwd:project,hasUI:true,isProjectTrusted:()=>true,scopedModels:[],modelRegistry:{getAll:()=>[],getAvailable:()=>[]},ui:{notify:(text,type)=>notices.push({text,type}),setStatus:(key,text)=>statuses.push(text)}});
assert.equal(notices.at(-1)?.type,'info');
assert.ok(statuses.some(s=>typeof s==='string'));assert.equal(statuses.at(-1),undefined);
assert.ok(loadSkillsFromDir({dir:resolve('skills'),source:'release'}).skills.some(s=>s.name==='clanker-configure'));
console.log('Archive extensions, skill, inventory progress, and worker IPC passed without inference.');
'''
    subprocess.run(["node", "--input-type=module", "-"], input=script, text=True, cwd=installed, check=True)
    for helper in ("verify_vm.py", "package_vm.py", "promote_sources.py"):
        # Importing from the extracted package proves sibling Python dependencies resolve.
        subprocess.run(["python3", "-c", f"import sys; sys.path.insert(0,'scripts'); import {helper[:-3]}"],
                       cwd=installed, check=True)
print("Portable release acceptance passed.")
