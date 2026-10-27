#!/usr/bin/env python3
"""Build, install and roll back the macOS Node test resource guard."""

import argparse
from contextlib import contextmanager
import fcntl
import hashlib
import json
import os
from pathlib import Path
import platform
import shutil
import signal
import subprocess
import tempfile
import uuid

SOURCE = Path(__file__).resolve().parent
DEFAULT_PREFIX = Path('/Library/Application Support/PlushNodeTestGuard')
DEFAULT_NODE = Path('/usr/local/bin/node')
DEFAULT_POLICY = dict(budget=6144, unit=128, driver=256, runner=512, worker=1024, queue=900,
                      job_seconds=120, suite_seconds=1800)


def run(args, **kwargs):
    return subprocess.run([str(x) for x in args], check=True, text=True, capture_output=True, **kwargs)


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def source_digest():
    return hashlib.sha256(b''.join((SOURCE / name).read_bytes() for name in
                                  ['node-test-guard.c', 'node-test-bootstrap.cjs'])).hexdigest()


def build_guard(prefix, runtime, public_node=None, state=None, owner=None, policy=None, installed_prefix=None, kernel_release=None):
    prefix, runtime = Path(prefix).resolve(), Path(runtime).resolve()
    installed_prefix = Path(installed_prefix or prefix).absolute()
    public_node = Path(public_node or prefix / 'node').absolute()
    state = Path(state or prefix / 'state').absolute()
    policy = {**DEFAULT_POLICY, **(policy or {})}
    owner = os.getuid() if owner is None else owner
    if not all(isinstance(value, int) and value > 0 for value in policy.values()):
        raise ValueError('resource limits must be positive integers')
    if any(policy[name] % policy['unit'] for name in ['budget', 'driver', 'runner', 'worker']):
        raise ValueError('limits must use whole memory units')
    if max(policy['driver'], policy['runner']) > policy['worker'] or policy['worker'] > policy['budget'] or max(policy.values()) > 6144:
        raise ValueError('invalid resource budget')
    prefix.mkdir(parents=True, exist_ok=True)
    config = {
        'GUARD_REAL_NODE': str(runtime), 'GUARD_PUBLIC_NODE': str(public_node),
        'GUARD_BOOTSTRAP': str(installed_prefix / 'node-test-bootstrap.cjs'),
        'GUARD_STATE': str(state), 'GUARD_STATE_OWNER': owner,
        'GUARD_KERNEL_RELEASE': kernel_release or platform.release(), 'GUARD_SOURCE_SHA': source_digest(),
        **{f'GUARD_{key.upper()}_MIB': policy[key] for key in ['budget', 'unit', 'driver', 'runner', 'worker']},
        'GUARD_QUEUE_SECONDS': policy['queue'],
        'GUARD_JOB_SECONDS': policy['job_seconds'], 'GUARD_SUITE_SECONDS': policy['suite_seconds'],
    }
    with tempfile.TemporaryDirectory(prefix='plush-guard-compile-') as temporary:
        include = Path(temporary) / 'guard-config.h'
        include.write_text(''.join(f'#define {key} {json.dumps(value)}\n' for key, value in config.items()))
        run(['clang', '-O2', '-Wall', '-Wextra', '-Werror', '-I', temporary,
             SOURCE / 'node-test-guard.c', '-o', prefix / 'launcher', '-lproc'])
    run(['codesign', '--force', '--sign', '-', prefix / 'launcher'])
    shutil.copy2(SOURCE / 'node-test-bootstrap.cjs', prefix / 'node-test-bootstrap.cjs')
    manifest = dict(schema='plush.node-kernel-guard-install/v1', source=source_digest(),
                    realNode=str(runtime), publicNode=str(public_node), helper=str(installed_prefix / 'launcher'),
                    kernel=platform.release(), runtimeSha=digest(runtime),
                    runtimeVersion=run([runtime, '--version']).stdout.strip(), policy=policy,
                    launcherSha=digest(prefix / 'launcher'), prefix=str(installed_prefix), state=str(state))
    (prefix / 'manifest.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    if public_node.parent == prefix:
        shutil.copy2(prefix / 'launcher', public_node)
    if state.parent == prefix:
        state.mkdir(exist_ok=True)
        for name in ['job.lock', 'memory.lock']:
            (state / name).touch(exist_ok=True)
            (state / name).chmod(0o666)
    return manifest


def smoke(node):
    with tempfile.TemporaryDirectory(prefix='plush-guard-smoke-') as temporary:
        file = Path(temporary) / 'smoke.test.mjs'
        file.write_text("import test from 'node:test'; import assert from 'node:assert/strict'; "
                        "test('kernel guard', () => { assert.equal(process.env.PLUSH_NODE_KERNEL_PID, String(process.pid)); "
                        "assert(Number(process.env.PLUSH_NODE_KERNEL_LIMIT_MIB) > 0); });")
        env = {key: value for key, value in os.environ.items() if not key.startswith('PLUSH_NODE_')}
        env.pop('NODE_TEST_CONTEXT', None)
        result = run([node, '--test', '--test-reporter=tap', file], env=env, timeout=15)
        if '# pass 1' not in result.stdout or '# fail 0' not in result.stdout:
            raise RuntimeError('native smoke did not execute one passing test')


def atomic_install(source, destination, mode='755'):
    destination = Path(destination)
    temporary = destination.parent / f'.plush-node-{uuid.uuid4().hex}'
    try:
        run(['sudo', '-n', 'install', '-m', mode, source, temporary])
        run(['sudo', '-n', 'mv', temporary, destination])
    finally:
        if temporary.exists():
            run(['sudo', '-n', 'rm', temporary])


@contextmanager
def installation_lock(state):
    def expired(_signal, _frame):
        raise TimeoutError('active tests prevented installation; their state is preserved')
    with (Path(state) / 'job.lock').open('r+') as file:
        previous = signal.signal(signal.SIGALRM, expired)
        signal.alarm(45)
        try:
            fcntl.lockf(file, fcntl.LOCK_EX)
            signal.alarm(0)
            yield
        finally:
            signal.alarm(0)
            signal.signal(signal.SIGALRM, previous)


def install(prefix=DEFAULT_PREFIX, node=DEFAULT_NODE, policy_override=None):
    prefix, node = Path(prefix), Path(node)
    record = prefix / 'installation.json'
    previous = json.loads(record.read_text()) if record.exists() else None
    current_sha = digest(node)
    physical_mib = int(run(['sysctl', '-n', 'hw.memsize']).stdout) // (1024 * 1024)
    policy = {**DEFAULT_POLICY, 'budget': min(DEFAULT_POLICY['budget'],
              physical_mib // 4 // DEFAULT_POLICY['unit'] * DEFAULT_POLICY['unit'])}
    if policy_override:
        if policy_override.get('budget', policy['budget']) > policy['budget']:
            raise RuntimeError('a validation policy cannot increase the host budget')
        policy.update(policy_override)
    if policy['budget'] < policy['runner'] + policy['worker']:
        raise RuntimeError('physical memory cannot safely admit the default Node test workload')
    expected_sha = current_sha
    if previous:
        expected_sha = previous['runtimeSha'] if previous.get('status') == 'rolled_back' else previous['installedSha']
    if current_sha != expected_sha:
        raise RuntimeError('Node changed outside this guard; preserve it and inspect before installing')
    original = prefix / 'node.original'
    run(['sudo', '-n', 'mkdir', '-p', prefix / 'versions', prefix / 'state'])
    if not original.exists():
        run(['sudo', '-n', 'cp', '-p', node, original])
    if digest(original) != (previous['runtimeSha'] if previous else current_sha):
        raise RuntimeError('original Node identity mismatch')
    for name in ['job.lock', 'memory.lock']:
        file = prefix / 'state' / name
        if not file.exists():
            run(['sudo', '-n', 'touch', file])
        run(['sudo', '-n', 'chmod', '666', file])
    version = prefix / 'versions' / f'{source_digest()[:20]}-{uuid.uuid4().hex[:8]}'
    with installation_lock(prefix / 'state'), tempfile.TemporaryDirectory(prefix='plush-guard-install-') as temporary:
        if digest(node) != current_sha:
            raise RuntimeError('Node changed while installation was waiting')
        stage = Path(temporary) / 'version'
        manifest = build_guard(stage, original, node, prefix / 'state', 0, policy=policy, installed_prefix=version)
        if previous and previous.get('status') != 'rolled_back':
            live = json.loads(run([stage / 'launcher', '--plush-guard-status']).stdout)
            if live['reservedMiB']:
                raise RuntimeError('test descendants still hold memory reservations; preserve their installation')
        manifest['physicalMiB'] = physical_mib
        manifest['status'] = 'installed'
        run(['sudo', '-n', 'install', '-d', '-m', '755', version])
        for name in ['launcher', 'node-test-bootstrap.cjs', 'manifest.json']:
            run(['sudo', '-n', 'install', '-m', '755' if name == 'launcher' else '644', stage / name, version / name])
        manifest['installedSha'] = digest(version / 'launcher')
        candidate = Path(temporary) / 'installation.json'
        candidate.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
        backup = Path(temporary) / 'previous-node'
        shutil.copy2(node, backup)
        try:
            atomic_install(version / 'launcher', node)
            smoke(node)
            atomic_install(candidate, record, mode='644')
        except BaseException:
            if digest(node) == manifest['installedSha']:
                atomic_install(backup, node)
            raise
    return manifest


def rollback(prefix=DEFAULT_PREFIX, node=DEFAULT_NODE):
    prefix, node = Path(prefix), Path(node)
    record = json.loads((prefix / 'installation.json').read_text())
    if digest(node) != record['installedSha'] or digest(prefix / 'node.original') != record['runtimeSha']:
        raise RuntimeError('runtime drift prevents automatic rollback')
    with installation_lock(prefix / 'state'):
        with tempfile.TemporaryDirectory(prefix='plush-guard-inspect-') as temporary:
            inspector = Path(temporary) / 'inspector'
            build_guard(inspector, prefix / 'node.original', node, prefix / 'state', 0, policy=record['policy'])
            live = json.loads(run([inspector / 'launcher', '--plush-guard-status']).stdout)
            if live['reservedMiB']:
                raise RuntimeError('protected descendants remain; keep their installation intact')
        if digest(node) != record['installedSha']:
            raise RuntimeError('Node changed while rollback was waiting')
        atomic_install(prefix / 'node.original', node)
        record['status'] = 'rolled_back'
        with tempfile.TemporaryDirectory(prefix='plush-guard-rollback-') as temporary:
            candidate = Path(temporary) / 'installation.json'
            candidate.write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
            atomic_install(candidate, prefix / 'installation.json', mode='644')
    if digest(node) != record['runtimeSha']:
        raise RuntimeError('rollback readback failed')
    return dict(status='rolled_back', runtimeSha=record['runtimeSha'])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--install', action='store_true')
    mode.add_argument('--rollback', action='store_true')
    mode.add_argument('--build-prefix', type=Path)
    parser.add_argument('--runtime', type=Path, default=DEFAULT_NODE)
    args = parser.parse_args()
    if platform.system() != 'Darwin':
        raise RuntimeError('native kernel guard requires macOS')
    if args.install:
        result = install()
    elif args.rollback:
        result = rollback()
    else:
        result = build_guard(args.build_prefix, args.runtime)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
