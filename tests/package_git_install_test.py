"""Fresh Git-source install without a checkout build, auth, or model calls.
Run with Node/npm on PATH: python3 tests/package_git_install_test.py
"""
import json
import os
import pathlib
import shutil
import subprocess
import tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix="clanker-git-install-") as temp:
    package = pathlib.Path(temp) / "package"
    package.mkdir()
    for name in ("package.json", "tsconfig.json", "tsconfig.build.json"):
        shutil.copyfile(ROOT / name, package / name)
    for name in ("src", "scripts", "skills"):
        shutil.copytree(ROOT / name, package / name, ignore=shutil.ignore_patterns("__pycache__"))
    shutil.copytree(ROOT / ".pi/extensions", package / ".pi/extensions")
    assert not (package / "dist").exists()
    manifest = json.loads((package / "package.json").read_text())
    assert "prepare" in manifest["scripts"], "Git installs do not build worker entries"
    env = dict(os.environ, npm_config_cache=str(ROOT / ".harness/npm-cache"))
    subprocess.run(["npm", "install", "--omit=dev", "--no-audit", "--no-fund"], cwd=package, env=env, check=True)
    for name in ("worker-entry.js", "managed-local-entry.js", "cli.js"):
        assert (package / "dist" / name).is_file(), name
    subprocess.run(["node", "dist/cli.js", "demo"], cwd=package, env=env, check=True, stdout=subprocess.DEVNULL)
    script = r'''
import {discoverAndLoadExtensions,loadSkillsFromDir} from '@earendil-works/pi-coding-agent';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import assert from 'node:assert/strict';
const manifest=JSON.parse(await readFile('package.json','utf8'));
const cwd=resolve('../consumer');await mkdir(cwd);
const probe=join(cwd,'probe.ts');
await writeFile(probe, `import {processWorker} from ${JSON.stringify(resolve('src/process-worker.ts'))};
export default async function(){try{await processWorker({config:{timeoutMs:1000},selection:{candidate:{billing:'subscription'}}},new AbortController().signal);throw Error('Unexpected success');}catch(e){if(e.kind!=='unknown')throw e;}}`);
const loaded=await discoverAndLoadExtensions([...manifest.pi.extensions.map(p=>resolve(p)),probe],cwd,join(cwd,'agent'));
assert.deepEqual(loaded.errors,[]);assert.ok(loaded.extensions.some(e=>e.commands.has('clanker')));
assert.ok(loadSkillsFromDir({dir:resolve('skills'),source:'git-install'}).skills.some(s=>s.name==='clanker-configure'));
console.log('Fresh source installation: extensions, skill, demo and worker validation passed.');
'''
    subprocess.run(["node", "--input-type=module", "-"], input=script, text=True, cwd=package, env=env, check=True)
