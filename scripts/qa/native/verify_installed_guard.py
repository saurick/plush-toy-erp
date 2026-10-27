#!/usr/bin/env python3
"""在独立执行单元验证已安装的单机 Node 保护，并保存有界回执。"""

import argparse
import importlib.util
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time

sys.dont_write_bytecode = True
SOURCE = Path(__file__).resolve().parent
ROOT = SOURCE.parents[2]
spec = importlib.util.spec_from_file_location('guard_install', SOURCE / 'install-node-test-guard.py')
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


def status(node):
    return json.loads(subprocess.check_output([node, '--plush-guard-status'], text=True, timeout=5))


def execute_many(node, commands, env, timeout=60):
    processes = [subprocess.Popen([node, *map(str, args)], stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                 text=True, env=env, start_new_session=True) for args in commands]
    started = time.monotonic()
    peak_rss = 0
    try:
        while any(process.poll() is None for process in processes):
            rows = []
            for line in subprocess.check_output(['ps', '-axo', 'pid=,ppid=,rss='], text=True).splitlines():
                parts = line.split()
                if len(parts) == 3: rows.append(tuple(map(int, parts)))
            owned = {process.pid for process in processes}
            for _ in range(128):
                old = len(owned)
                owned.update(pid for pid, parent, _rss in rows if parent in owned)
                if len(owned) == old: break
            peak_rss = max(peak_rss, sum(rss for pid, _parent, rss in rows if pid in owned))
            if time.monotonic() - started > timeout:
                raise TimeoutError('installed verification exceeded its bounded wait')
            time.sleep(.02)
        results = []
        for process in processes:
            stdout, stderr = process.communicate(timeout=5)
            results.append(dict(code=process.returncode, stdout=stdout, stderr=stderr))
        return results, dict(durationSeconds=round(time.monotonic() - started, 3),
                             peakTreeRssMiB=round(peak_rss / 1024, 1))
    finally:
        for process in processes:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=3)


def verify(output):
    record = json.loads((installer.DEFAULT_PREFIX / 'installation.json').read_text())
    node = record['publicNode']
    if installer.digest(node) != record['installedSha'] or installer.source_digest() != record['source']:
        raise RuntimeError('installed guard identity does not match the current source')
    status(node)
    policy = record['policy']
    env = {key: value for key, value in os.environ.items()
           if not key.startswith('PLUSH_NODE_') and key not in ['NODE_TEST_CONTEXT', 'NODE_OPTIONS']}
    evidence = dict(schema='plush.node-kernel-guard-verification/v1', status='incomplete',
                    source=record['source'], installedSha=record['installedSha'],
                    originalRuntimeSha=record['runtimeSha'], runtime=record['runtimeVersion'],
                    kernel=record['kernel'], physicalMiB=record['physicalMiB'], policy=policy,
                    cases={})
    with tempfile.TemporaryDirectory(prefix='plush-installed-node-verification-') as temporary:
        root = Path(temporary)
        events_file = root / 'events.jsonl'
        files = []
        for name in ['first', 'second']:
            file = root / f'{name}.test.mjs'
            file.write_text(f"""import test from 'node:test';
import {{appendFileSync}} from 'node:fs';
test('{name}',async()=>{{
 const held=Buffer.alloc(32*1024*1024,1);
 const event=(event)=>appendFileSync(process.env.EVENTS,JSON.stringify({{event,pid:process.pid,at:Date.now(),limit:Number(process.env.PLUSH_NODE_KERNEL_LIMIT_MIB)}})+'\\n');
 event('start');await new Promise(resolve=>setTimeout(resolve,250));event('end');held[0];
}});""")
            files.append(file)
        results, metrics = execute_many(node,
            [['--test', '--test-concurrency=8', '--test-reporter=tap', *files] for _ in range(3)],
            {**env, 'EVENTS': str(events_file)})
        if any(result['code'] or '# pass 2' not in result['stdout'] for result in results):
            raise RuntimeError('one simultaneous session failed its two real tests')
        events = [json.loads(line) for line in events_file.read_text().splitlines()]
        if [event['event'] for event in events] != ['start', 'end'] * 6:
            raise RuntimeError('session or file execution escaped serialized admission')
        if any(event['limit'] != policy['worker'] for event in events):
            raise RuntimeError('a worker did not activate its real kernel quota')
        evidence['cases']['simultaneousSessions'] = dict(sessions=3, filesPerSession=2,
            requestedFileConcurrency=8, passedTests=6, serialized=True, **metrics)

        report = root / 'budget.json'
        children = (policy['budget'] - policy['runner'] - policy['worker']) // policy['worker']
        file = root / 'budget.test.mjs'
        file.write_text(f"""import test from 'node:test';
import assert from 'node:assert/strict';
import {{spawn,spawnSync}} from 'node:child_process';
import {{writeFileSync}} from 'node:fs';
test('installed shared budget',async()=>{{
 const children=[];
 try {{
  for(let i=0;i<{children};i++) {{
   const child=spawn(process.execPath,['-e',"const held=Buffer.alloc(64*1024*1024,1);console.log('READY');setInterval(()=>held[0],1000)"],{{env:{{}},stdio:['ignore','pipe','pipe']}});
   children.push(child);
   await new Promise((resolve,reject)=>{{child.stdout.once('data',resolve);child.once('exit',code=>reject(new Error('child '+code)));}});
  }}
  const current=JSON.parse(spawnSync(process.execPath,['--plush-guard-status'],{{encoding:'utf8'}}).stdout);
  assert(current.reservedMiB<={policy['budget']});
  assert(current.reservedMiB+{policy['worker']}>{policy['budget']});
  const blocked=spawnSync(process.execPath,['-e',"console.log('UNSAFE_BODY')"],{{env:{{}},encoding:'utf8'}});
  assert.equal(blocked.status,75);
  assert(blocked.stderr.includes('shared-memory-budget-exhausted'));
  assert(!blocked.stdout.includes('UNSAFE_BODY'));
  writeFileSync({json.dumps(str(report))},JSON.stringify({{budgetMiB:current.budgetMiB,reservedMiB:current.reservedMiB,rejectedExit:blocked.status,unsafeBodyRan:false,children:children.length}}));
 }} finally {{
  await Promise.all(children.map(child=>new Promise(resolve=>{{child.once('close',resolve);child.kill('SIGTERM');}})));
 }}
}});""")
        results, metrics = execute_many(node, [['--test', '--test-reporter=tap', file]], env)
        if results[0]['code'] or not report.exists(): raise RuntimeError('installed shared-budget denial failed')
        evidence['cases']['sharedBudget'] = {**json.loads(report.read_text()), **metrics}

        report = root / 'bounded-children.json'
        file = root / 'bounded-children.test.mjs'
        file.write_text(f"""import test from 'node:test';
import assert from 'node:assert/strict';
import {{spawn,spawnSync}} from 'node:child_process';
import {{writeFileSync}} from 'node:fs';
test('six bounded processes coexist',async()=>{{
 const children=[];
 try {{
  const identities=await Promise.all(Array.from({{length:6}},async()=>{{
   const source="console.log(JSON.stringify({{pid:process.pid,kernelPid:Number(process.env.PLUSH_NODE_KERNEL_PID),limit:Number(process.env.PLUSH_NODE_KERNEL_LIMIT_MIB)}}));process.stdin.resume()";
   const child=spawn(process.execPath,['-e',source],{{env:{{PLUSH_NODE_GUARD_MEMORY_MIB:'256'}},stdio:['pipe','pipe','pipe']}});
   children.push(child);
   return await new Promise((resolve,reject)=>{{child.stdout.once('data',data=>resolve(JSON.parse(data.toString())));child.once('exit',code=>reject(new Error('child '+code)));}});
  }}));
  assert.equal(new Set(identities.map(value=>value.pid)).size,6);
  assert(identities.every(value=>value.pid===value.kernelPid && value.limit===256));
  const current=JSON.parse(spawnSync(process.execPath,['--plush-guard-status'],{{encoding:'utf8'}}).stdout);
  assert(current.reservedMiB>=6*256 && current.reservedMiB<=current.budgetMiB);
  writeFileSync({json.dumps(str(report))},JSON.stringify({{children:6,simultaneouslyAlive:true,childKernelLimitMiB:256,budgetMiB:current.budgetMiB,reservedMiB:current.reservedMiB}}));
 }} finally {{
  await Promise.all(children.map(child=>new Promise(resolve=>{{if(child.exitCode!==null || child.signalCode!==null)return resolve();child.once('close',resolve);child.stdin.end();}})));
 }}
}});""")
        results, metrics = execute_many(node, [['--test', '--test-reporter=tap', file]], env)
        if results[0]['code'] or not report.exists(): raise RuntimeError('six bounded child processes failed')
        evidence['cases']['boundedChildren'] = {**json.loads(report.read_text()), **metrics}

        file = root / 'kernel-oom.test.mjs'
        blocks = policy['worker'] * 3 // 2 // 16
        file.write_text(f"""import test from 'node:test';
test('installed kernel limit',()=>{{const held=[];for(let i=0;i<{blocks};i++)held.push(Buffer.alloc(16*1024*1024,1));console.log('KERNEL_LIMIT_BYPASSED');}});""")
        results, metrics = execute_many(node, [['--test', '--test-reporter=tap', file]], env)
        result = results[0]
        if result['code'] == 0 or 'SIGKILL' not in result['stdout'] or 'KERNEL_LIMIT_BYPASSED' in result['stdout']:
            raise RuntimeError('installed kernel did not terminate its over-limit worker')
        evidence['cases']['kernelTermination'] = dict(kernelLimitMiB=policy['worker'],
            attemptedAllocationMiB=blocks * 16, exitCode=result['code'], signal='SIGKILL',
            samplingWatchdog=False, **metrics)

    with installer.installation_lock(record['state']):
        for _ in range(100):
            final = status(node)
            if final['reservedMiB'] == 0: break
            time.sleep(.02)
        if final['reservedMiB']:
            raise RuntimeError('memory reservations survived the completed jobs')
        evidence['cleanup'] = dict(reservedMiB=0, verifiedUnderAdmissionLock=True)
    evidence['status'] = 'passed'
    evidence['commit'] = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT,
        env={**os.environ, 'GIT_OPTIONAL_LOCKS': '0'}, text=True).strip()
    output = Path(output).resolve()
    if not output.is_relative_to(ROOT / 'output') or output.exists():
        raise RuntimeError('verification output must be a new file under managed output')
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + '\n')
    return evidence


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--out', required=True, type=Path)
    args = parser.parse_args()
    result = verify(args.out)
    print(json.dumps(result, ensure_ascii=False))
