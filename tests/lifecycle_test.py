"""Exercise public lifecycle behavior without installing tools or touching user state."""
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]

class LifecycleTest(unittest.TestCase):
    def run_script(self, name, *args, env=None):
        return subprocess.run([str(ROOT / 'scripts' / name), *args], cwd='/tmp', env=env,
                              capture_output=True, text=True, check=False)

    def test_help_check_and_repeated_teardown(self):
        for name in ('bootstrap', 'teardown'):
            self.assertEqual(self.run_script(name, '--help').returncode, 0)
            self.assertEqual(self.run_script(name, '--unknown').returncode, 2)
        with tempfile.TemporaryDirectory(prefix='harness tools ') as tmp:
            bindir = Path(tmp)
            for tool, body in [('uname', 'echo Darwin'), ('dirname', '/usr/bin/dirname "$@"'), ('mise', 'exit 0')]:
                script = bindir / tool
                script.write_text('#!/bin/sh\n' + body + '\n')
                script.chmod(0o755)
            env = {**os.environ, 'PATH': f'{tmp}:/usr/bin:/bin'}
            self.assertEqual(self.run_script('bootstrap', '--check', env=env).returncode, 0)
            for _ in range(2):
                self.assertEqual(self.run_script('teardown', env=env).returncode, 0)
            (bindir / 'uname').write_text('#!/bin/sh\necho UnsupportedOS\n')
            self.assertNotEqual(self.run_script('bootstrap', '--check', env=env).returncode, 0)

if __name__ == '__main__':
    unittest.main()
