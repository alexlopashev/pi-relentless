"""No inference: a tiny HTTP executable tests actual supervisor ownership."""
import hashlib
import json
import os
from pathlib import Path
import select
import shutil
import signal
import socket
import subprocess
import tempfile
import time
import unittest

ROOT = Path(__file__).resolve().parents[1]
NODE = subprocess.check_output(["node", "-p", "process.execPath"], text=True).strip()


class ManagedLocalProcessTest(unittest.TestCase):
    def setUp(self):
        with socket.socket() as probe:
            probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            try:
                probe.bind(("127.0.0.1", 18080))
            except OSError:
                self.skipTest("Fixed local inference port is externally occupied")
        self.directory = Path(tempfile.mkdtemp(prefix="relentless-managed-"))
        self.parents = []
        self.pidfile = self.directory / "server.pid"
        executable = self.directory / "server"
        executable.write_text(
            "#!" + NODE + "\n"
            + "const http=require('node:http'),fs=require('node:fs');"
            + "const key=process.argv[process.argv.indexOf('--api-key')+1];"
            + "fs.writeFileSync(" + json.dumps(str(self.pidfile)) + ",String(process.pid));"
            + "http.createServer((req,res)=>{if(req.headers.authorization!=='Bearer '+key){res.writeHead(401);res.end();return;}res.end(JSON.stringify({data:[{id:'qwen3.5-4b'}]}));}).listen(18080,'127.0.0.1');"
        )
        executable.chmod(0o700)
        model = self.directory / "model"
        model.write_text("fake model; no inference")
        artifact = lambda path: {"path": str(path), "sha256": hashlib.sha256(path.read_bytes()).hexdigest()}
        self.config = {"executable": artifact(executable), "model": artifact(model), "startupMs": 3000, "libraries": {}}

    def tearDown(self):
        for parent in self.parents:
            if parent.poll() is None:
                parent.kill()
            parent.wait(timeout=10)
            for stream in (parent.stdin, parent.stdout, parent.stderr):
                if stream:
                    stream.close()
        shutil.rmtree(self.directory)

    def launch(self):
        script = "import{startManagedLocal}from './dist/managed-local.js';const lease=await startManagedLocal(" + json.dumps(self.config) + ");console.log('ready');process.stdin.once('data',()=>{void lease.close().then(()=>process.exit(0));});"
        host = os.environ.get("RELENTLESS_TEST_MANAGED_HOST", NODE)
        args = [host, "-e", script] if host != NODE else [NODE, "--input-type=module", "-e", script]
        parent = subprocess.Popen(args, cwd=ROOT, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        self.parents.append(parent)
        return parent

    def ready(self, parent):
        self.assertTrue(select.select([parent.stdout], [], [], 10)[0], "No readiness result")
        self.assertEqual(parent.stdout.readline().strip(), "ready")

    def assert_server_stopped(self):
        pid = int(self.pidfile.read_text())
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            try:
                os.kill(pid, 0)
            except ProcessLookupError:
                return
            time.sleep(0.05)
        self.fail("Owned server survived cleanup")

    def test_owned_server_stops_after_close(self):
        parent = self.launch()
        self.ready(parent)
        parent.stdin.write("stop\n")
        parent.stdin.flush()
        self.assertEqual(parent.wait(timeout=10), 0)
        self.assert_server_stopped()

    def test_parent_sigkill_triggers_supervisor_cleanup(self):
        parent = self.launch()
        self.ready(parent)
        parent.send_signal(signal.SIGKILL)
        parent.wait(timeout=10)
        self.assert_server_stopped()

    def test_pin_mismatch_never_launches_executable(self):
        self.config["model"]["sha256"] = "0" * 64
        parent = self.launch()
        self.assertNotEqual(parent.wait(timeout=10), 0)
        self.assertFalse(self.pidfile.exists())

    def test_wrong_model_readiness_times_out_and_reaps_server(self):
        executable = Path(self.config["executable"]["path"])
        executable.write_text(executable.read_text().replace("qwen3.5-4b", "wrong-model"))
        self.config["executable"]["sha256"] = hashlib.sha256(executable.read_bytes()).hexdigest()
        parent = self.launch()
        self.assertNotEqual(parent.wait(timeout=10), 0)
        self.assert_server_stopped()

    def test_external_listener_is_not_adopted_or_stopped(self):
        with socket.socket() as external:
            external.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            external.bind(("127.0.0.1", 18080))
            external.listen()
            parent = self.launch()
            self.assertNotEqual(parent.wait(timeout=10), 0)
            self.assertFalse(self.pidfile.exists())
            self.assertEqual(external.getsockname()[1], 18080)


if __name__ == "__main__":
    unittest.main()
