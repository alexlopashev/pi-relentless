"""Prepare a pinned base initramfs plus an immutable source/test overlay.

Base images are operator-reviewed executable inputs, never worker output. No
archive member is extracted on the host. Packaging does not launch a VM.
"""
import gzip
import hashlib
import os
from pathlib import Path
import re
import stat
import sys

from verify_vm import MAX_INPUT, DIGEST, atomic, digest_file, encode, open_regular, read_json, validate

NAME = re.compile(r'^[A-Za-z0-9_][A-Za-z0-9_.-]*(/[A-Za-z0-9_][A-Za-z0-9_.-]*)*$')
MAX_SOURCE = 8 * 1024 * 1024
MAX_TOTAL = 32 * 1024 * 1024


def artifact(value):
    if (not isinstance(value, dict) or set(value) != {'path', 'sha256'}
        or not isinstance(value['path'], str) or not Path(value['path']).is_absolute()
        or not isinstance(value['sha256'], str) or not DIGEST.fullmatch(value['sha256'])):
        raise ValueError('Invalid pinned artifact')
    return value


def read_input(value):
    artifact(value)
    with open_regular(Path(value['path'])) as stream:
        data = stream.read(MAX_SOURCE + 1)
    if len(data) > MAX_SOURCE:
        raise ValueError('Source file exceeds 8 MiB')
    if hashlib.sha256(data).hexdigest() != value['sha256']:
        raise ValueError('Source digest mismatch')
    return data


def path_name(name):
    if not isinstance(name, str) or len(name) > 240 or not NAME.fullmatch(name):
        raise ValueError('Invalid workspace path')
    return name


def entry(name, data, mode, inode):
    name = name.encode() + b'\0'
    fields = [inode, mode, 0, 0, 1, 0, len(data), 0, 0, 0, 0, len(name), 0]
    header = b'070701' + b''.join(f'{field:08x}'.encode() for field in fields) + name
    return header + b'\0' * (-len(header) % 4) + data + b'\0' * (-len(data) % 4)


def controller(entrypoint):
    # Names are validated against NAME before interpolation. No user shell text.
    return ('''#!/bin/sh
set -eu
/bin/busybox mount -t proc proc /proc
/bin/busybox mount -t sysfs sysfs /sys
/bin/busybox mount -t devtmpfs devtmpfs /dev
/bin/busybox chmod 755 /
/bin/busybox mkdir -p /tmp
/bin/busybox chmod 1777 /tmp
exec 3>/dev/vport0p1
/bin/busybox sha256sum -c /relentless-proof/checksums >/dev/null
if (exec 3>&-; /bin/busybox setpriv --no-new-privs /bin/busybox su -s /bin/sh nobody -c 'cd /workspace; ulimit -u 32; ulimit -f 2048; ulimit -t 15; exec /usr/local/bin/node --max-old-space-size=64 ./ENTRYPOINT'); then
  status=0
else
  status=$?
fi
/bin/busybox sha256sum -c /relentless-proof/checksums >/dev/null
candidate=$(/bin/busybox sha256sum /relentless-proof/sources.json)
candidate=${candidate%% *}
tests=$(/bin/busybox sha256sum /relentless-proof/tests.json)
tests=${tests%% *}
printf '{"exitCode":%s,"candidateSha256":"%s","testSha256":"%s"}\\n' "$status" "$candidate" "$tests" >&3
exec 3>&-
/bin/busybox poweroff -f
'''.replace('ENTRYPOINT', entrypoint)).encode()


def build(request, directory):
    directory = Path(directory).absolute()
    if directory.exists():
        raise FileExistsError('Package directory already exists')
    if not isinstance(request, dict) or set(request) != {
        'version', 'baseImage', 'emulator', 'kernel', 'sources', 'tests',
        'entrypoint', 'wallSeconds', 'outputBytes'
    }:
        raise ValueError('Invalid package manifest')
    for key in ['sources', 'tests']:
        if not isinstance(request[key], dict) or not 1 <= len(request[key]) <= 500:
            raise ValueError('Expected 1 to 500 files per bundle')
    entrypoint = path_name(request['entrypoint'])
    if entrypoint not in request['tests'] or not entrypoint.endswith(('.js', '.mjs', '.cjs', '.ts', '.mts', '.cts')):
        raise ValueError('Entrypoint must be a supplied JavaScript/TypeScript test')
    names = [path_name(name) for key in ['sources', 'tests'] for name in request[key]]
    if len(set(names)) != len(names):
        raise ValueError('Source and test path collision')
    parents = set()
    for name in names:
        parent = Path(name).parent
        while str(parent) != '.':
            parents.add(str(parent))
            parent = parent.parent
    if parents.intersection(names):
        raise ValueError('File/directory collision')
    files = {}
    total = 0
    bundles = {}
    for key in ['sources', 'tests']:
        bundle = []
        for name, item in sorted(request[key].items()):
            data = read_input(item)
            total += len(data)
            if total > MAX_TOTAL:
                raise ValueError('Source and tests exceed 32 MiB')
            files['workspace/' + name] = (stat.S_IFREG | 0o444, data)
            bundle.append({'path': name, 'sha256': item['sha256']})
        bundles[key] = encode(bundle if key == 'sources' else {'entrypoint': entrypoint, 'files': bundle})
    manifest = {key: request[key] for key in ['version', 'emulator', 'kernel', 'wallSeconds', 'outputBytes']}
    manifest.update(image=artifact(request['baseImage']),
                    candidateSha256=hashlib.sha256(bundles['sources']).hexdigest(),
                    testSha256=hashlib.sha256(bundles['tests']).hexdigest())
    validate(manifest)
    files['workspace'] = (stat.S_IFDIR | 0o555, b'')
    for parent in parents:
        files['workspace/' + parent] = (stat.S_IFDIR | 0o555, b'')
    files['relentless-proof'] = (stat.S_IFDIR | 0o700, b'')
    files['relentless-proof/sources.json'] = (stat.S_IFREG | 0o400, bundles['sources'])
    files['relentless-proof/tests.json'] = (stat.S_IFREG | 0o400, bundles['tests'])
    checksums = ''.join(f"{hashlib.sha256(files['workspace/' + name][1]).hexdigest()}  /workspace/{name}\n" for name in sorted(names))
    files['relentless-proof/checksums'] = (stat.S_IFREG | 0o400, checksums.encode())
    files['relentless-init'] = (stat.S_IFREG | 0o700, controller(entrypoint))
    directory.mkdir(mode=0o700)
    atomic(directory / 'package.json', request)
    image = directory / 'image.initramfs'
    with image.open('xb') as output:
        digest_file(Path(request['baseImage']['path']), request['baseImage']['sha256'], output)
        # Concatenated independent gzip/newc archives are supported by initramfs.
        with gzip.GzipFile(filename='', mode='wb', mtime=0, fileobj=output) as overlay:
            for inode, (name, (mode, data)) in enumerate(sorted(files.items(), key=lambda item: (item[0].count('/'), item[0])), 1):
                overlay.write(entry(name, data, mode, inode))
            overlay.write(entry('TRAILER!!!', b'', 0, len(files) + 1))
        output.flush()
        os.fsync(output.fileno())
    if image.stat().st_size > MAX_INPUT:
        raise ValueError('Combined image exceeds runner limit')
    with image.open('rb') as stream:
        hasher = hashlib.sha256()
        while chunk := stream.read(1024 * 1024):
            hasher.update(chunk)
        digest = hasher.hexdigest()
    manifest['image'] = {'path': str(image), 'sha256': digest}
    image.chmod(0o400)
    atomic(directory / 'manifest.json', manifest)
    return manifest


if __name__ == '__main__':
    try:
        if len(sys.argv) != 3:
            raise ValueError('Usage: package_vm.py <package.json> <new-directory>')
        print(encode(build(read_json(Path(sys.argv[1])), Path(sys.argv[2]))).decode())
    except (OSError, ValueError):
        print('Verification packaging failed; no VM was launched', file=sys.stderr)
        sys.exit(1)
