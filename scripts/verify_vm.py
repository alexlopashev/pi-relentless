"""Experimental, explicitly invoked VM verification; manifests are operator inputs.

A trusted, reviewed image must contain /relentless-init and the root-only result
channel protocol. This runner does not certify an arbitrary image or test oracle.
"""
import hashlib
import json
import os
from pathlib import Path
import re
import resource
import selectors
import signal
import stat
import subprocess
import sys
import time

DIGEST = re.compile(r'^[0-9a-f]{64}$')
MAX_INPUT = 512 * 1024 * 1024


def encode(value):
    return json.dumps(value, sort_keys=True, separators=(',', ':')).encode()


def atomic(path, value):
    temporary = path.with_suffix('.tmp')
    with temporary.open('xb') as stream:
        stream.write(encode(value))
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temporary, path)
    directory = os.open(path.parent, os.O_RDONLY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)


def open_regular(path):
    if not stat.S_ISREG(path.lstat().st_mode):
        raise ValueError('Input must be a regular file')
    descriptor = os.open(path, os.O_RDONLY | os.O_NONBLOCK | os.O_NOFOLLOW)
    try:
        if not stat.S_ISREG(os.fstat(descriptor).st_mode):
            raise ValueError('Input must be a regular file')
        return os.fdopen(descriptor, 'rb')
    except BaseException:
        os.close(descriptor)
        raise


def read_json(path, limit=65536):
    with open_regular(path) as stream:
        raw = stream.read(limit + 1)
    if len(raw) > limit:
        raise ValueError('JSON exceeds limit')
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError('Duplicate JSON key')
            result[key] = value
        return result
    return json.loads(raw, object_pairs_hook=unique)


def validate(request):
    if not isinstance(request, dict) or set(request) != {
        'version', 'emulator', 'kernel', 'image', 'candidateSha256',
        'testSha256', 'wallSeconds', 'outputBytes'
    }:
        raise ValueError('Invalid verification manifest')
    for key, low, high in [('version', 1, 1), ('wallSeconds', 1, 300),
                           ('outputBytes', 1024, 1048576)]:
        if type(request[key]) is not int or not low <= request[key] <= high:
            raise ValueError('Invalid verification limit')
    for key in ['candidateSha256', 'testSha256']:
        if not isinstance(request[key], str) or not DIGEST.fullmatch(request[key]):
            raise ValueError('Invalid binding digest')
    for key in ['emulator', 'kernel', 'image']:
        item = request[key]
        if not isinstance(item, dict) or set(item) != {'path', 'sha256'}:
            raise ValueError('Invalid artifact')
        if not isinstance(item['path'], str) or not Path(item['path']).is_absolute():
            raise ValueError('Artifact paths must be absolute')
        if not isinstance(item['sha256'], str) or not DIGEST.fullmatch(item['sha256']):
            raise ValueError('Invalid artifact digest')
        digest_file(Path(item['path']), item['sha256'])
    return request


def digest_file(path, expected, destination=None):
    digest = hashlib.sha256()
    total = 0
    with open_regular(path) as source:
        while chunk := source.read(1024 * 1024):
            total += len(chunk)
            if total > MAX_INPUT:
                raise ValueError('Artifact exceeds size limit')
            digest.update(chunk)
            if destination is not None:
                destination.write(chunk)
    if digest.hexdigest() != expected:
        raise ValueError('Artifact digest mismatch')


def status(directory):
    directory = Path(directory)
    if (directory / 'report.json').exists():
        return read_json(directory / 'report.json')
    if (directory / 'pending.json').exists():
        return {'outcome': 'ambiguous', 'acceptance': 'not_assessed',
                'reason': 'No terminal record; do not replay or assume the emulator stopped'}
    raise ValueError('Missing verification record')


def run(request, directory):
    # Existing directories are never reused, even after interruption.
    directory = Path(directory).absolute()
    if directory.exists():
        raise FileExistsError('Verification directory already exists')
    if ',' in str(directory):
        raise ValueError('Verification directory cannot contain a comma')
    request = validate(request)
    directory.mkdir(mode=0o700)
    atomic(directory / 'pending.json', request)
    # Snapshot image/kernel; a concurrent source edit must not alter execution.
    for key in ['emulator', 'kernel', 'image']:
        with (directory / key).open('xb') as target:
            digest_file(Path(request[key]['path']), request[key]['sha256'], target)
        (directory / key).chmod(0o500 if key == 'emulator' else 0o400)
    controller_path = directory / 'controller.json'
    command = [str(directory / 'emulator'), '-machine', 'virt', '-accel',
               'tcg,thread=single,tb-size=16', '-cpu', 'cortex-a53', '-m', '768',
               '-smp', '1', '-nodefaults', '-no-user-config', '-nic', 'none',
               '-display', 'none', '-monitor', 'none', '-serial', 'stdio',
               '-no-reboot', '-kernel', str(directory / 'kernel'),
               '-initrd', str(directory / 'image'), '-append',
               'console=ttyAMA0 rdinit=/relentless-init panic=1 quiet',
               '-chardev', 'file,id=proof,path=' + str(controller_path),
               '-device', 'virtio-serial-pci,id=relentless-serial', '-device',
               'virtserialport,bus=relentless-serial.0,chardev=proof,name=relentless.result']
    def limits():
        resource.setrlimit(resource.RLIMIT_CPU, (request['wallSeconds'], request['wallSeconds']))
        resource.setrlimit(resource.RLIMIT_FSIZE, (65536, 65536))
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    interrupted = False
    def stop(_signum, _frame):
        nonlocal interrupted
        interrupted = True
    handlers = {s: signal.signal(s, stop) for s in [signal.SIGINT, signal.SIGTERM]}
    process = None
    output = bytearray()
    outcome = 'invalid_evidence'
    controller = None
    started = time.monotonic()
    try:
        process = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE,
                                   stderr=subprocess.STDOUT, close_fds=True,
                                   env={'PATH': '/usr/bin:/bin', 'LC_ALL': 'C'},
                                   preexec_fn=limits, start_new_session=True)
        with selectors.DefaultSelector() as selector:
            selector.register(process.stdout, selectors.EVENT_READ)
            while True:
                if interrupted:
                    outcome = 'interrupted'
                    break
                if time.monotonic() - started >= request['wallSeconds']:
                    outcome = 'wall_limit'
                    break
                ready = selector.select(0.02)
                if ready:
                    chunk = os.read(process.stdout.fileno(), 4096)
                    if not chunk:
                        if process.poll() is not None:
                            break
                        continue
                    remaining = request['outputBytes'] - len(output)
                    output.extend(chunk[:remaining])
                    if len(chunk) > remaining:
                        outcome = 'output_limit'
                        break
                elif process.poll() is not None:
                    break
        if process.poll() is None:
            process.kill()
        process.wait(timeout=5)
        if outcome == 'invalid_evidence' and process.returncode == 0:
            try:
                value = read_json(controller_path, 4096)
                if (isinstance(value, dict) and set(value) == {
                        'exitCode', 'candidateSha256', 'testSha256'}
                    and type(value['exitCode']) is int and 0 <= value['exitCode'] <= 255
                    and value['candidateSha256'] == request['candidateSha256']
                    and value['testSha256'] == request['testSha256']):
                    controller = value
                    outcome = 'executed' if value['exitCode'] == 0 else 'test_process_failed'
            except (OSError, ValueError):
                pass
    finally:
        if process is not None:
            if process.poll() is None:
                process.kill()
            process.wait(timeout=5)
            process.stdout.close()
        for sig, handler in handlers.items():
            signal.signal(sig, handler)
    (directory / 'output.log').write_bytes(output)
    report = {'version': 1, 'outcome': outcome, 'acceptance': 'not_assessed',
              'manifestSha256': hashlib.sha256(encode(request)).hexdigest(),
              'inputs': request, 'controller': controller,
              'emulatorExitCode': process.returncode, 'reaped': True,
              'elapsedSeconds': time.monotonic() - started, 'outputBytes': len(output),
              'hostMemoryBound': False}
    atomic(directory / 'report.json', report)
    return report


def main():
    if len(sys.argv) == 3 and sys.argv[1] == 'status':
        report = status(Path(sys.argv[2]))
    elif len(sys.argv) == 4 and sys.argv[1] == 'run':
        report = run(read_json(Path(sys.argv[2])), Path(sys.argv[3]))
    else:
        raise ValueError('Usage: verify_vm.py run <manifest.json> <new-directory> | status <directory>')
    print(json.dumps(report, indent=2))
    return 0 if report['outcome'] == 'executed' else 1


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (OSError, ValueError, subprocess.SubprocessError):
        print('Verification failed; inspect the run record before any retry', file=sys.stderr)
        sys.exit(1)
