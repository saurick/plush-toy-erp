#!/usr/bin/env python3
"""对已安装工具入口作限额、MCP、绕过和无干扰读回。"""

import argparse
import importlib.util
import json
import os
from pathlib import Path
import selectors
import signal
import subprocess
import sys
import time
import tomllib

sys.dont_write_bytecode = True
SOURCE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('tool_guard_install', SOURCE / 'install-node-tool-guard.py')
tools = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tools)
native = tools.native


def environment():
    return {key: value for key, value in os.environ.items()
            if not key.startswith('PLUSH_NODE_') and key not in ['NODE_OPTIONS', 'NODE_TEST_CONTEXT']}


def snapshot():
    rows = {}
    for line in subprocess.check_output(['ps', '-axo', 'pid=,ppid=,comm='], text=True, errors='replace').splitlines():
        value = line.strip().split(None, 2)
        if len(value) == 3:
            rows[int(value[0])] = (int(value[1]), value[2])
    return rows


def descendants(owner):
    rows = snapshot()
    found = {owner}
    for _ in range(128):
        current = len(found)
        found.update(pid for pid, (parent, _path) in rows.items() if parent in found)
        if len(found) == current:
            break
    return {pid: rows[pid][1] for pid in found if pid in rows and pid != owner}


def verify_mcp(node, env, expected_heap=512):
    process = subprocess.Popen([str(tools.CUA.parent / 'node_repl')], stdin=subprocess.PIPE,
        stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        env={**environment(), **env, 'NODE_REPL_NODE_PATH': str(node)}, start_new_session=True)
    counter = 0
    protocol_deadline = time.monotonic() + 20
    try:
        def request(method, params):
            nonlocal counter
            counter += 1
            process.stdin.write(json.dumps(dict(jsonrpc='2.0', id=counter, method=method, params=params)) + '\n')
            process.stdin.flush()
            deadline = protocol_deadline
            with selectors.DefaultSelector() as selector:
                selector.register(process.stdout, selectors.EVENT_READ)
                while time.monotonic() < deadline:
                    if not selector.select(max(.01, deadline - time.monotonic())):
                        break
                    line = process.stdout.readline()
                    if not line:
                        raise RuntimeError('isolated MCP server exited')
                    result = json.loads(line)
                    if result.get('id') != counter:
                        continue
                    if 'error' in result:
                        raise RuntimeError('isolated MCP request failed: ' + json.dumps(result['error'])[:1200])
                    return result['result']
            raise TimeoutError('isolated MCP protocol exceeded 20 seconds')

        request('initialize', dict(protocolVersion='2024-11-05', capabilities={},
                                  clientInfo=dict(name='node-guard-verification', version='1')))
        process.stdin.write(json.dumps(dict(jsonrpc='2.0', method='notifications/initialized')) + '\n')
        process.stdin.flush()
        code = 'const guardV8=await import("node:v8");nodeRepl.write(JSON.stringify({answer:6*7,heapLimitMiB:guardV8.getHeapStatistics().heap_size_limit/1024/1024}))'
        result = request('tools/call', dict(name='js', arguments=dict(code=code, timeout_ms=10000)))
        if result.get('isError') or '42' not in json.dumps(result):
            raise RuntimeError('isolated MCP arithmetic failed: ' + json.dumps(result)[:1600])
        values = [json.loads(item['text']) for item in result.get('content', [])
                  if item.get('type') == 'text' and item.get('text', '').startswith('{')]
        heap = next((value['heapLimitMiB'] for value in values if 'heapLimitMiB' in value), None)
        if heap is None or heap > expected_heap + 48:
            raise RuntimeError('real MCP kernel heap readback failed: ' + json.dumps(result)[:1600])
        owned = descendants(process.pid)
        guarded = [pid for pid, path in owned.items() if path.endswith('/node') or path.endswith('/node.original')]
        if not guarded:
            raise RuntimeError('isolated MCP did not start its real Node kernel')
        request('tools/call', dict(name='js_reset', arguments={}))
        return dict(answer=42, heapLimitMiB=heap, realNodeDescendants=len(guarded), server='isolated configured node_repl',
                    existingServersRestarted=False)
    finally:
        if process.poll() is None:
            os.killpg(process.pid, signal.SIGTERM)
            try:
                process.wait(timeout=3)
            except subprocess.TimeoutExpired:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=3)
        process.stdin.close()
        process.stdout.close()
        process.stderr.close()


def verify(output):
    output = Path(output).resolve()
    if output.exists() or not output.is_relative_to(SOURCE.parents[2] / 'output'):
        raise RuntimeError('receipt must be a new file in managed output')
    record = json.loads((tools.TOOLS / 'installation.json').read_text())
    if record['source'] != tools.source_digest():
        raise RuntimeError('tool installation does not match current source')
    signed_before = native.digest(tools.CUA)
    before = snapshot()
    existing = {pid: path for pid, (_parent, path) in before.items()
                if path == str(tools.CUA) or '/artifact-sessions/runtime-generations/' in path}
    evidence = dict(schema='plush.node-tool-guard-verification/v1', status='incomplete', source=record['source'], cases={})
    for entry in record['entries']:
        if native.digest(entry['publicNode']) != entry['installedSha']:
            raise RuntimeError('installed tool launcher drifted')
        result = tools.smoke(entry)
        objects = entry['heapMiB'] * 192
        killed = subprocess.run([entry['publicNode'], '-e',
            f"const held=[];for(let i=0;i<{objects};i++)held.push(new Array(1024).fill(i));console.log('UNSAFE_BODY')"],
            capture_output=True, text=True, env=environment(), timeout=15)
        if killed.returncode != -signal.SIGABRT or 'UNSAFE_BODY' in killed.stdout or 'heap out of memory' not in killed.stderr:
            raise RuntimeError('tool V8 did not enforce its heap limit')
        evidence['cases'][entry['publicNode']] = dict(smoke=result, heapTermination='SIGABRT',
            samplingWatchdog=False, nativeKernelQuota=False, runtimeVersion=entry['runtimeVersion'])
    config = tomllib.loads(tools.CONFIG.read_text())['mcp_servers']['node_repl']['env']
    if config['NODE_REPL_NODE_PATH'] != record['configuredNodeReplPath']:
        raise RuntimeError('Node REPL configuration drifted')
    evidence['cases']['configuredMcp'] = verify_mcp(record['configuredNodeReplPath'], config)
    raw = subprocess.run([tools.CUA, '-p', 'process.env.PLUSH_NODE_KERNEL_LIMIT_MIB??"UNPROTECTED"'],
                         capture_output=True, text=True, env=environment(), timeout=5)
    if raw.returncode or raw.stdout.strip() != 'UNPROTECTED':
        raise RuntimeError('original signed path bypass readback changed')
    after = snapshot()
    evidence['signedApplicationNodeUnchanged'] = native.digest(tools.CUA) == signed_before
    native.run(['codesign', '--verify', '--strict', tools.CUA])
    if not evidence['signedApplicationNodeUnchanged']:
        raise RuntimeError('signed application runtime changed')
    evidence['existingProcesses'] = dict(observed=len(existing), survived=sum(after.get(pid, (0,''))[1] == path for pid,path in existing.items()),
        signalledByVerifier=0, restartedByVerifier=0)
    evidence['remainingBypasses'] = ['Buffer/ArrayBuffer/native memory is not capped by the V8 old-space limit',
        'tool heap wrappers do not participate in the native shared 6 GiB budget',
        'original signed CUA Node absolute path', 'tool connections and processes started before configuration update',
        'desktop runtime overrides that ignore user MCP configuration', 'future artifact runtime generations and other unregistered Node copies',
        'explicit original backup runtime invocation']
    evidence['status'] = 'passed-with-documented-bypasses'
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n')
    return evidence


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', required=True, type=Path)
    args = parser.parse_args()
    print(json.dumps(verify(args.out), ensure_ascii=False))
