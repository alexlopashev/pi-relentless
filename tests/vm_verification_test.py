"""Exercise the reusable VM supervisor without live models or real emulation."""
import hashlib
import importlib.util
import json
import os
import subprocess
from pathlib import Path
import tempfile
import time
import signal
import unittest
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('verify_vm', ROOT / 'scripts/verify_vm.py')
vm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(vm)


class VerificationTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.output = self.root / 'run'

    def request(self, body):
        executable = self.root / 'emulator'
        executable.write_text('#!/usr/bin/python3\nimport sys, time, os, json\n' + body)
        executable.chmod(0o700)
        request = {'version': 1, 'wallSeconds': 1, 'outputBytes': 4096,
                   'candidateSha256': 'a' * 64, 'testSha256': 'b' * 64}
        for key, path in [('emulator', executable), ('kernel', self.root / 'kernel'),
                          ('image', self.root / 'image')]:
            if key != 'emulator':
                path.write_bytes(b'fixture')
            request[key] = {'path': str(path), 'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
        return request

    def controller(self, code=0):
        return "p = sys.argv[sys.argv.index('-chardev')+1].split('path=',1)[1]\n" + \
            f"open(p, 'w').write(json.dumps({{'exitCode': {code}, 'candidateSha256': 'a'*64, 'testSha256': 'b'*64}}))\n"

    def test_success_is_execution_evidence_not_automatic_acceptance(self):
        report = vm.run(self.request(self.controller()), self.output)
        self.assertEqual(report['outcome'], 'executed')
        self.assertEqual(report['acceptance'], 'not_assessed')
        self.assertTrue(report['reaped'])
        self.assertEqual(vm.status(self.output), report)
        with self.assertRaises(FileExistsError):
            vm.run(self.request(self.controller()), self.output)

    def test_stdout_cannot_override_controller_failure(self):
        report = vm.run(self.request(self.controller(7) + "print('{\"exitCode\":0}')\n"), self.output)
        self.assertEqual(report['outcome'], 'test_process_failed')
        self.assertEqual(report['controller']['exitCode'], 7)

    def test_mismatched_binding_and_missing_channel_fail_closed(self):
        for body in [self.controller().replace("'a'*64", "'c'*64"), "print('PASS')\n"]:
            with self.subTest(body=body):
                output = self.root / ('run' + str(len(list(self.root.iterdir()))))
                report = vm.run(self.request(body), output)
                self.assertEqual(report['outcome'], 'invalid_evidence')

    def test_wall_and_output_limits_reap_child(self):
        for body, outcome in [("time.sleep(10)\n", 'wall_limit'),
                              ("os.write(1,b'x'*100000)\ntime.sleep(10)\n", 'output_limit')]:
            with self.subTest(outcome=outcome):
                report = vm.run(self.request(body), self.root / outcome)
                self.assertEqual(report['outcome'], outcome)
                self.assertTrue(report['reaped'])
                self.assertLessEqual(report['outputBytes'], 4096)

    def test_digest_failure_prevents_launch(self):
        request = self.request("raise Exception('must not launch')\n")
        request['image']['sha256'] = '0'*64
        with self.assertRaisesRegex(ValueError, 'digest'):
            vm.run(request, self.output)
        self.assertFalse(self.output.exists())

    def test_pending_is_ambiguous_not_replayed(self):
        self.output.mkdir()
        (self.output / 'pending.json').write_text('{}')
        self.assertEqual(vm.status(self.output)['outcome'], 'ambiguous')
        with self.assertRaises(FileExistsError):
            vm.run(self.request(self.controller()), self.output)

    def test_replaced_emulator_never_runs_under_old_digest(self):
        request = self.request(self.controller())
        original = vm.digest_file
        def replacing(path, expected, destination=None):
            original(path, expected, destination)
            if destination is not None and path == Path(request['image']['path']):
                Path(request['emulator']['path']).write_text('#!/bin/sh\nexit 9\n')
        with patch.object(vm, 'digest_file', side_effect=replacing):
            report = vm.run(request, self.output)
        self.assertEqual(report['outcome'], 'executed')

    def test_special_files_are_rejected_before_open(self):
        fifo = self.root / 'fifo'
        os.mkfifo(fifo)
        # A subprocess timeout keeps a regression from hanging the test suite.
        code = ("import sys; sys.path.insert(0, " + repr(str(ROOT / 'scripts')) + "); "
                "import verify_vm; verify_vm.read_json(__import__('pathlib').Path(" + repr(str(fifo)) + "))")
        result = subprocess.run(['python3', '-c', code], capture_output=True, timeout=2)
        self.assertNotEqual(result.returncode, 0)

    def test_controller_duplicates_and_flood_fail_closed(self):
        bodies = [self.controller() + "open(p,'w').write('{\"exitCode\":7,\"exitCode\":0}')\n",
                  self.controller() + "open(p,'w').write('x'*100000)\n"]
        for i, body in enumerate(bodies):
            report = vm.run(self.request(body), self.root / ('malformed' + str(i)))
            self.assertEqual(report['outcome'], 'invalid_evidence')
            self.assertTrue(report['reaped'])

    def test_cli_cancellation_reaps_the_started_emulator(self):
        marker = self.root / 'started'
        request = self.request("open(" + repr(str(marker)) + ", 'w').write(str(os.getpid()))\ntime.sleep(30)\n")
        request['wallSeconds'] = 60
        manifest = self.root / 'manifest.json'
        manifest.write_text(json.dumps(request))
        child = subprocess.Popen(['node', str(ROOT / 'dist/cli.js'), 'verify-vm', 'run',
                                  str(manifest), str(self.output)], stdout=subprocess.PIPE,
                                  stderr=subprocess.PIPE)
        try:
            deadline = time.monotonic() + 5
            while not marker.exists() and time.monotonic() < deadline and child.poll() is None:
                time.sleep(0.01)
            self.assertTrue(marker.exists())
            child.send_signal(signal.SIGTERM)
            stdout, stderr = child.communicate(timeout=5)
            self.assertEqual(child.returncode, 1, stderr)
            report = json.loads(stdout)
            self.assertEqual(report['outcome'], 'interrupted')
            self.assertTrue(report['reaped'])
            with self.assertRaises(ProcessLookupError):
                os.kill(int(marker.read_text()), 0)
        finally:
            if child.poll() is None:
                child.kill()
            child.communicate(timeout=5)

    def test_workflow_specification_rejects_fifo_and_oversize(self):
        harness = self.root / '.harness'
        harness.mkdir()
        for name in ['coding.sqlite', 'workflows.sqlite']:
            (harness / name).touch()
        fifo = self.root / 'spec-fifo'
        os.mkfifo(fifo)
        large = self.root / 'spec-large'
        large.write_bytes(b' ' * 65537)
        for path in [fifo, large]:
            with self.subTest(path=path.name):
                result = subprocess.run(['node', str(ROOT / 'dist/cli.js'), 'workflow',
                                         'package', 'fixture', str(path), str(self.output)],
                                        cwd=self.root, capture_output=True, timeout=2)
                self.assertEqual(result.returncode, 1)
                self.assertFalse(self.output.exists())

    def test_public_cli_reports_ambiguous_without_launch(self):
        self.output.mkdir()
        (self.output / 'pending.json').write_text('{}')
        result = subprocess.run(['node', str(ROOT / 'dist/cli.js'), 'verify-vm',
                                 'status', str(self.output)], capture_output=True, text=True)
        self.assertEqual(result.returncode, 1)
        self.assertEqual(json.loads(result.stdout)['outcome'], 'ambiguous')

    def test_credentials_are_not_inherited(self):
        os.environ['RELENTLESS_TEST_SECRET'] = 'do-not-inherit'
        self.addCleanup(os.environ.pop, 'RELENTLESS_TEST_SECRET')
        report = vm.run(self.request("assert 'RELENTLESS_TEST_SECRET' not in os.environ\n" + self.controller()), self.output)
        self.assertEqual(report['outcome'], 'executed')


if __name__ == '__main__':
    unittest.main()
