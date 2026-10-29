#!/usr/bin/env python3
"""为可配置计算内核及非封装的 Artifact Node 安装 V8 堆上限。"""

import argparse
import copy
import importlib.util
import json
import os
from pathlib import Path
import re
import shutil
import sys
import tempfile
import tomllib
import uuid

sys.dont_write_bytecode = True
SOURCE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('native_guard_install', SOURCE / 'install-node-test-guard.py')
native = importlib.util.module_from_spec(spec)
spec.loader.exec_module(native)
CACHE = Path.home() / 'Library/Application Support/Codex/artifact-sessions/runtime-generations'
CUA = Path('/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node')
CONFIG = Path.home() / '.codex/config.toml'
TOOLS = native.DEFAULT_PREFIX / 'tools'


def source_digest():
    return native.hashlib.sha256(b''.join((SOURCE / name).read_bytes() for name in
        ['node-tool-heap-guard.c', 'node-tool-heap-bootstrap.cjs'])).hexdigest()


def build_guard(prefix, runtime, public_node=None, installed_prefix=None, limit=512):
    prefix, runtime = Path(prefix).resolve(), Path(runtime).resolve()
    installed_prefix = Path(installed_prefix or prefix).absolute()
    public_node = Path(public_node or prefix / 'node').absolute()
    if not isinstance(limit, int) or limit < 32 or limit > 1024:
        raise ValueError('tool old-space limit must be between 32 and 1024 MiB')
    prefix.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='plush-tool-compile-') as temporary:
        header = Path(temporary) / 'tool-config.h'
        config = dict(TOOL_REAL_NODE=str(runtime), TOOL_BOOTSTRAP=str(installed_prefix / 'node-tool-heap-bootstrap.cjs'),
                      TOOL_HEAP_MIB=limit)
        header.write_text(''.join(f'#define {key} {json.dumps(value)}\n' for key,value in config.items()))
        native.run(['clang', '-O2', '-Wall', '-Wextra', '-Werror', '-I', temporary,
                    SOURCE / 'node-tool-heap-guard.c', '-o', prefix / 'launcher'])
    native.run(['codesign', '--force', '--sign', '-', prefix / 'launcher'])
    shutil.copy2(SOURCE / 'node-tool-heap-bootstrap.cjs', prefix / 'node-tool-heap-bootstrap.cjs')
    record = dict(schema='plush.node-tool-heap-guard/v1', source=source_digest(), mode='v8-heap-only',
                  realNode=str(runtime), publicNode=str(public_node), heapMiB=limit,
                  runtimeSha=native.digest(runtime), runtimeVersion=native.run([runtime,'--version']).stdout.strip(),
                  launcherSha=native.digest(prefix / 'launcher'), prefix=str(installed_prefix))
    (prefix / 'manifest.json').write_text(json.dumps(record,ensure_ascii=False,indent=2)+'\n')
    if public_node.parent == prefix:
        shutil.copy2(prefix / 'launcher', public_node)
    return record


def replace_node_path(text, expected, replacement):
    before = tomllib.loads(text)
    value = before['mcp_servers']['node_repl']['env']['NODE_REPL_NODE_PATH']
    if value != str(expected):
        raise RuntimeError('Node REPL configuration changed; preserve it and inspect')
    header = '[mcp_servers.node_repl.env]'
    if text.count(header) != 1:
        raise RuntimeError('an explicit Node REPL environment table is required')
    start = text.index(header) + len(header)
    end = text.find('\n[', start)
    if end < 0:
        end = len(text)
    section = text[start:end]
    pattern = r'^(\s*NODE_REPL_NODE_PATH\s*=\s*)("(?:[^"\\]|\\.)*"|\'[^\']*\')(\s*(?:#.*)?)$'
    section, count = re.subn(pattern, lambda match: match[1] + json.dumps(str(replacement)) + match[3],
                             section, flags=re.MULTILINE)
    if count != 1:
        raise RuntimeError('Node REPL path is ambiguous')
    result = text[:start] + section + text[end:]
    expected_document = copy.deepcopy(before)
    expected_document['mcp_servers']['node_repl']['env']['NODE_REPL_NODE_PATH'] = str(replacement)
    if tomllib.loads(result) != expected_document:
        raise RuntimeError('configuration patch changed an unrelated setting')
    return result


def write_config(config, before, after):
    config = Path(config).resolve()
    mode = config.stat().st_mode & 0o777
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(dir=config.parent, prefix='.node-guard-', delete=False) as file:
            temporary = Path(file.name)
            os.fchmod(file.fileno(), mode)
            file.write(after.encode())
            file.flush()
            os.fsync(file.fileno())
        if config.read_text() != before:
            raise RuntimeError('configuration changed before publication; preserve it')
        os.replace(temporary, config)
    finally:
        if temporary and temporary.exists():
            temporary.unlink()


def write_record(path, record):
    with tempfile.TemporaryDirectory(prefix='plush-tool-record-') as temporary:
        file = Path(temporary) / 'record.json'
        file.write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
        native.atomic_install(file, path, mode='644')


def publish_private(source, destination, mode, uid, gid):
    destination = Path(destination)
    temporary = destination.parent / f'.node-tool-{uuid.uuid4().hex}'
    try:
        native.run(['sudo', '-n', 'install', '-m', oct(mode)[2:], '-o', str(uid), '-g', str(gid),
                    source, temporary])
        native.run(['sudo', '-n', 'mv', temporary, destination])
    finally:
        if temporary.exists():
            native.run(['sudo', '-n', 'rm', temporary])


def smoke(entry):
    env = {key: value for key, value in os.environ.items()
           if not key.startswith('PLUSH_NODE_') and key not in ['NODE_OPTIONS', 'NODE_TEST_CONTEXT']}
    source = 'JSON.stringify({pid:process.pid,limit:Number(process.env.PLUSH_NODE_TOOL_HEAP_MIB),heapLimitMiB:require("node:v8").getHeapStatistics().heap_size_limit/1024/1024,execPath:process.execPath,version:process.version})'
    result = json.loads(native.run([entry['publicNode'], '-p', source], env=env, timeout=15).stdout)
    if result['limit'] != entry['heapMiB'] or result['heapLimitMiB'] > entry['heapMiB'] + 48 or result['execPath'] != entry['publicNode']:
        raise RuntimeError('tool V8 heap or executable readback failed')
    native.run(['codesign', '--verify', '--strict', entry['publicNode']])
    native.run(['codesign', '--verify', '--strict', entry['realNode']])
    return result


def install_entry(name, runtime, public_node, replace_runtime, tools=TOOLS, limit=512):
    tools, runtime, public_node = Path(tools), Path(runtime), Path(public_node)
    home = tools / name
    record_path = home / 'installation.json'
    previous = json.loads(record_path.read_text()) if record_path.exists() else None
    public_exists = public_node.exists()
    public_sha = native.digest(public_node) if public_exists else None
    if previous and previous.get('status') == 'installed':
        if public_sha != previous['installedSha']:
            raise RuntimeError('tool entry drifted; automatic replacement is refused')
    elif public_exists and not replace_runtime:
        raise RuntimeError('external tool launcher already exists without an installation record')
    native.run(['sudo', '-n', 'mkdir', '-p', home / 'versions'])
    original_mode = runtime.stat().st_mode & 0o777
    original_uid, original_gid = runtime.stat().st_uid, runtime.stat().st_gid
    if replace_runtime:
        backup = home / 'node.original'
        if previous:
            if native.digest(backup) != previous['runtimeSha']:
                raise RuntimeError('private runtime backup drifted')
            if previous.get('status') != 'installed' and public_sha != previous['runtimeSha']:
                raise RuntimeError('private runtime changed outside this installer')
            original_mode = previous['originalMode']
            original_uid, original_gid = previous['originalUid'], previous['originalGid']
        else:
            if backup.exists():
                raise RuntimeError('unowned private runtime backup exists')
            native.run(['sudo', '-n', 'cp', '-p', runtime, backup])
        runtime = backup
    native.run(['codesign', '--verify', '--strict', runtime])
    version = home / 'versions' / f'{source_digest()[:16]}-{uuid.uuid4().hex[:8]}'
    with tempfile.TemporaryDirectory(prefix='plush-tool-install-') as temporary:
        stage = Path(temporary) / 'version'
        entry = build_guard(stage, runtime, public_node, installed_prefix=version, limit=limit)
        native.run(['sudo', '-n', 'install', '-d', '-m', '755', version])
        for filename in ['launcher', 'node-tool-heap-bootstrap.cjs', 'manifest.json']:
            native.run(['sudo', '-n', 'install', '-m', '755' if filename == 'launcher' else '644',
                        stage / filename, version / filename])
        entry.update(status='installed', installedSha=native.digest(version / 'launcher'),
                     replacesPrivateRuntime=replace_runtime, originalMode=original_mode,
                     originalUid=original_uid, originalGid=original_gid)
        old_public = Path(temporary) / 'previous-entry'
        if public_exists:
            shutil.copy2(public_node, old_public)
        if public_node.exists() != public_exists or (public_exists and native.digest(public_node) != public_sha):
            raise RuntimeError('tool entry changed before installation')
        if replace_runtime:
            publish_private(version / 'launcher', public_node, original_mode, original_uid, original_gid)
        else:
            native.atomic_install(version / 'launcher', public_node)
        try:
            entry['smoke'] = smoke(entry)
        except BaseException:
            if native.digest(public_node) == entry['installedSha']:
                if public_exists:
                    if replace_runtime:
                        publish_private(old_public, public_node, original_mode, original_uid, original_gid)
                    else:
                        native.atomic_install(old_public, public_node)
                else:
                    native.run(['sudo', '-n', 'chmod', '644', public_node])
            raise
        write_record(record_path, entry)
    return entry


def install(config=CONFIG, tools=TOOLS):
    config, tools = Path(config), Path(tools)
    before = config.read_text()
    old = tomllib.loads(before)['mcp_servers']['node_repl']['env']['NODE_REPL_NODE_PATH']
    public_cua = tools / 'cua/node'
    if old not in [str(CUA), str(public_cua)]:
        raise RuntimeError('Node REPL uses another runtime; preserve its configuration')
    cua = install_entry('cua', CUA, public_cua, False, tools=tools)
    entries = [cua]
    for runtime in sorted(CACHE.glob('*/runtime/bin/node')):
        name = 'artifact-' + native.hashlib.sha256(str(runtime).encode()).hexdigest()[:12]
        entries.append(install_entry(name, runtime, runtime, True, tools=tools, limit=1024))
    record_path = tools / 'installation.json'
    previous = json.loads(record_path.read_text()) if record_path.exists() else {}
    original = previous.get('originalNodeReplPath', old)
    after = replace_node_path(before, old, public_cua)
    record = dict(schema='plush.node-tool-guard-install/v1', status='installed', source=source_digest(),
                  config=str(config.resolve()), originalNodeReplPath=original,
                  configuredNodeReplPath=str(public_cua), entries=entries,
                  scope='V8 heap only; excludes Buffer/native memory and aggregate budget; original signed CUA path, old connections, desktop overrides and future cache generations can bypass')
    write_record(record_path, record)
    write_config(config, before, after)
    return record


def rollback(config=CONFIG, tools=TOOLS):
    tools, config = Path(tools), Path(config)
    record = json.loads((tools / 'installation.json').read_text())
    before = config.read_text()
    after = replace_node_path(before, record['configuredNodeReplPath'], record['originalNodeReplPath'])
    for entry in record['entries']:
        if not entry['replacesPrivateRuntime']:
            continue
        public = Path(entry['publicNode'])
        if native.digest(public) != entry['installedSha'] or native.digest(entry['realNode']) != entry['runtimeSha']:
            raise RuntimeError('private runtime drift prevents rollback')
        publish_private(entry['realNode'], public, entry['originalMode'], entry['originalUid'], entry['originalGid'])
        if native.digest(public) != entry['runtimeSha']:
            raise RuntimeError('private runtime rollback readback failed')
        entry['status'] = 'rolled_back'
        for installation in tools.glob('artifact-*/installation.json'):
            item = json.loads(installation.read_text())
            if item['publicNode'] == str(public):
                item['status'] = 'rolled_back'
                write_record(installation, item)
    write_config(config, before, after)
    record['status'] = 'rolled_back'
    write_record(tools / 'installation.json', record)
    return dict(status='rolled_back', entries=len(record['entries']), runningProcessesChanged=False)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument('--install', action='store_true')
    mode.add_argument('--rollback', action='store_true')
    args = parser.parse_args()
    print(json.dumps(install() if args.install else rollback(), ensure_ascii=False))
