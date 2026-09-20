"""No emulation, downloads or inference: immutable verification packaging."""
import gzip
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import package_vm as package


def sha(data):
    return hashlib.sha256(data).hexdigest()


class PackagingTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.request = {'version': 1, 'wallSeconds': 30, 'outputBytes': 65536,
                        'entrypoint': 'tests/check.mjs', 'sources': {}, 'tests': {}}
        for key in ['baseImage', 'emulator', 'kernel']:
            self.request[key] = self.artifact(key, b'fixture')
        self.request['sources']['src/main.ts'] = self.artifact('source', b'export const n = 1;')
        self.request['tests']['tests/check.mjs'] = self.artifact('test', b'import "../src/main.ts";')

    def artifact(self, name, data):
        path = self.root / name
        path.write_bytes(data)
        return {'path': str(path), 'sha256': sha(data)}

    def test_deterministic_bundle_binds_all_source_and_test_bytes(self):
        first = package.build(self.request, self.root / 'a')
        second = package.build(self.request, self.root / 'b')
        self.assertEqual(first['image']['sha256'], second['image']['sha256'])
        self.assertEqual(first['candidateSha256'], second['candidateSha256'])
        old_test = first['testSha256']
        self.request['tests']['tests/check.mjs'] = self.artifact('test', b'throw Error();')
        changed = package.build(self.request, self.root / 'c')
        self.assertNotEqual(changed['testSha256'], old_test)
        self.assertNotEqual(changed['image']['sha256'], first['image']['sha256'])
        self.assertEqual(changed['candidateSha256'], first['candidateSha256'])

    def test_workspace_paths_and_collisions_rejected(self):
        for name in ['../escape', '/host', 'a/../b', 'a//b', 'a b', '-flag', 'a\\nb']:
            with self.subTest(name=name), self.assertRaises(ValueError):
                request = {**self.request, 'sources': {name: self.request['sources']['src/main.ts']}}
                package.build(request, self.root / 'bad')
        with self.assertRaises(ValueError):
            package.build({**self.request, 'sources': self.request['tests']}, self.root / 'collision')
        sources = {'src': self.request['sources']['src/main.ts'], **self.request['sources']}
        with self.assertRaises(ValueError):
            package.build({**self.request, 'sources': sources}, self.root / 'parent')

    def test_entrypoint_must_be_supplied_test(self):
        with self.assertRaises(ValueError):
            package.build({**self.request, 'entrypoint': 'src/main.ts'}, self.root / 'bad')

    def test_bad_digest_cannot_publish_manifest(self):
        self.request['sources']['src/main.ts']['sha256'] = '0'*64
        with self.assertRaises(ValueError):
            package.build(self.request, self.root / 'bad')
        self.assertFalse((self.root / 'bad/manifest.json').exists())

    def test_final_image_limit_checked_before_manifest_publication(self):
        with patch.object(package, 'MAX_INPUT', 16, create=True):
            with self.assertRaisesRegex(ValueError, 'image exceeds'):
                package.build(self.request, self.root / 'oversized')
        self.assertFalse((self.root / 'oversized/manifest.json').exists())

    def test_existing_output_never_overwritten(self):
        output = self.root / 'exists'
        output.mkdir()
        (output / 'sentinel').write_text('keep')
        with self.assertRaises(FileExistsError):
            package.build(self.request, output)
        self.assertEqual((output / 'sentinel').read_text(), 'keep')

    def test_cli_build_publishes_manifest_without_launch(self):
        manifest = self.root / 'package.json'
        manifest.write_text(json.dumps(self.request))
        result = subprocess.run(['node', str(ROOT / 'dist/cli.js'), 'verify-vm', 'package',
                                 str(manifest), str(self.root / 'built')], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue((self.root / 'built/manifest.json').exists())
        self.assertFalse((self.root / 'built/report.json').exists())


if __name__ == '__main__':
    unittest.main()
