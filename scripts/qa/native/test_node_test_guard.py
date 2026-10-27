#!/usr/bin/env python3
"""真实 macOS 内核、共享预算、入口与进程退出回归。"""

import importlib.util
from contextlib import ExitStack
import json
import os
from pathlib import Path
import signal
import shutil
import subprocess
import sys
import tempfile
import time
import unittest

sys.dont_write_bytecode = True
SOURCE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('guard_install', SOURCE / 'install-node-test-guard.py')
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


class NativeNodeGuard(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory(prefix='plush-native-node-guard-')
        cls.stack = ExitStack()
        cls.addClassCleanup(cls.stack.close)
        cls.root = Path(cls.temporary.name)
        runtime = Path('/usr/local/bin/node')
        record = installer.DEFAULT_PREFIX / 'installation.json'
        if record.exists():
            installed = json.loads(record.read_text())
            if installer.digest(runtime) == installed['installedSha']:
                runtime = Path(installed['realNode'])
            controller = cls.root / 'escrow'
            installer.build_guard(controller, runtime, state=installed['state'], owner=0)
            status = json.loads(subprocess.check_output([controller / 'launcher', '--plush-guard-status'], text=True))
            parents = {}
            for line in subprocess.check_output(['ps', '-axo', 'pid=,ppid='], text=True).splitlines():
                fields = line.split()
                if len(fields) == 2: parents[int(fields[0])] = int(fields[1])
            pid = os.getpid()
            ancestry = set()
            while pid > 1 and pid not in ancestry:
                ancestry.add(pid)
                pid = parents.get(pid, 1)
            if status['jobOwner'] not in ancestry:
                cls.stack.enter_context(installer.installation_lock(installed['state']))
            escrow = subprocess.Popen([controller / 'launcher', '--plush-guard-reserve', '512'],
                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            def release():
                escrow.stdin.close()
                escrow.wait(timeout=3)
                escrow.stdout.close()
                escrow.stderr.close()
            cls.stack.callback(release)
            ready = escrow.stdout.readline()
            if not ready or json.loads(ready).get('reservedMiB') != 512:
                raise RuntimeError('native fixture could not reserve its host budget')
        cls.manifest = installer.build_guard(cls.root / 'runtime', runtime,
            policy=dict(budget=512, unit=32, driver=64, runner=64, worker=128, queue=3,
                        job_seconds=2, suite_seconds=10))
        cls.node = cls.root / 'runtime/node'
        cls.env = {key: value for key, value in os.environ.items()
                   if not key.startswith('PLUSH_NODE_') and key not in ['NODE_TEST_CONTEXT', 'NODE_OPTIONS']}

    @classmethod
    def tearDownClass(cls):
        cls.stack.close()
        cls.temporary.cleanup()

    def status(self):
        return json.loads(subprocess.check_output([self.node, '--plush-guard-status'], text=True, env=self.env))

    def tearDown(self):
        status = self.status()
        self.assertEqual(status['reservedMiB'], 0)
        self.assertEqual(status['jobOwner'], 0)

    def file(self, name, source):
        file = self.root / name
        file.write_text(source)
        return file

    def run_node(self, args, timeout=8):
        return subprocess.run([self.node, *map(str, args)], capture_output=True, text=True,
                              env=self.env, timeout=timeout, cwd=self.root)

    def test_bare_and_absolute_test_entry_get_real_kernel_limit(self):
        installer.smoke(self.node)

    def test_normal_node_keeps_its_runtime_and_has_no_test_reservation(self):
        result = self.run_node(['-p', 'JSON.stringify({version:process.version,guard:process.env.PLUSH_NODE_KERNEL_PID})'])
        self.assertEqual(result.returncode, 0, result.stderr)
        value = json.loads(result.stdout)
        self.assertTrue(value['version'].startswith('v24.'))
        self.assertNotIn('guard', value)

    def test_privileged_helper_rejects_an_unrelated_node_process(self):
        unrelated = subprocess.Popen([self.node, '-e', 'setInterval(()=>{},1000)'],
            env=self.env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        try:
            result = subprocess.run(['sudo', '-n', self.root / 'runtime/launcher',
                '--plush-guard-activate', str(unrelated.pid), '0', '4', str(os.getpid())],
                capture_output=True, text=True, timeout=3)
            self.assertEqual(result.returncode, 75)
            self.assertIn('foreign-kernel-limit-target', result.stderr)
            self.assertIsNone(unrelated.poll())
        finally:
            unrelated.terminate()
            unrelated.wait(timeout=2)

    def test_test_code_closing_the_quota_file_does_not_release_its_reservation(self):
        file = self.file('close-fd.test.mjs', f"""import test from 'node:test';
import assert from 'node:assert/strict';
import {{openSync,closeSync}} from 'node:fs';
import {{spawnSync}} from 'node:child_process';
test('budget is held outside test JavaScript',()=>{{
 const state=()=>JSON.parse(spawnSync(process.execPath,['--plush-guard-status'],{{encoding:'utf8'}}).stdout);
 const before=state().reservedMiB;
 const fd=openSync({json.dumps(str(self.root / 'runtime/state/memory.lock'))},'r+');
 closeSync(fd);
 assert.equal(state().reservedMiB,before);
 assert(Number(process.env.PLUSH_NODE_GUARD_HOLDER)>0);
}});""")
        result = self.run_node(['--test', '--test-reporter=tap', file])
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_install_rollback_and_reinstall_preserve_the_original_runtime(self):
        prefix = (self.root / 'installed-fixture').resolve()
        node = (self.root / 'installed-node').resolve()
        shutil.copy2(self.manifest['realNode'], node)
        original = installer.digest(node)
        policy = dict(budget=512, unit=32, driver=64, runner=64, worker=128, queue=3,
                      job_seconds=2, suite_seconds=10)
        try:
            installed = installer.install(prefix, node, policy_override=policy)
            self.assertEqual(installed['status'], 'installed')
            self.assertEqual(installed['runtimeSha'], original)
            self.assertEqual(installer.digest(node), installed['installedSha'])
            result = installer.rollback(prefix, node)
            self.assertEqual(result['status'], 'rolled_back')
            self.assertEqual(installer.digest(node), original)
            installed_again = installer.install(prefix, node, policy_override=policy)
            self.assertEqual(installed_again['runtimeSha'], original)
            self.assertEqual(json.loads((prefix / 'installation.json').read_text())['status'], 'installed')
            installer.smoke(node)
            stale = self.root / 'stale-kernel'
            installer.build_guard(stale, prefix / 'node.original', node, prefix / 'state', 0,
                                  policy=policy, kernel_release='unavailable-kernel-release')
            installer.atomic_install(stale / 'launcher', node)
            stale_record = json.loads((prefix / 'installation.json').read_text())
            stale_record['installedSha'] = installer.digest(node)
            stale_json = self.root / 'stale-installation.json'
            stale_json.write_text(json.dumps(stale_record))
            installer.atomic_install(stale_json, prefix / 'installation.json', mode='644')
            rejected = subprocess.run([node, '--plush-guard-status'], capture_output=True, text=True)
            self.assertEqual(rejected.returncode, 75)
            repaired = installer.install(prefix, node, policy_override=policy)
            self.assertEqual(repaired['kernel'], installer.platform.release())
            installer.smoke(node)
        finally:
            if prefix.exists():
                subprocess.run(['sudo', '-n', 'chown', '-R', f'{os.getuid()}:{os.getgid()}', prefix], check=True)

    def test_implicit_and_dynamic_test_import_cannot_bypass_the_entry(self):
        file = self.file('implicit.mjs', "import test from 'node:' + 'test';")
        file.write_text("const test = await import('node:' + 'test'); test.default('unsafe', () => console.log('BODY_RAN'));")
        result = self.run_node([file])
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('protected Node entry', result.stderr)
        self.assertNotIn('BODY_RAN', result.stdout)

    def test_spawn_execpath_with_empty_environment_remains_protected(self):
        file = self.file('spawn.test.mjs', "import test from 'node:test'; import assert from 'node:assert/strict'; test('child', () => assert.equal(process.env.PLUSH_NODE_KERNEL_PID, String(process.pid)));")
        source = "const {spawnSync}=require('node:child_process'); const r=spawnSync(process.execPath,['--test','--test-reporter=tap',process.argv[1]],{env:{},encoding:'utf8'}); process.stdout.write(r.stdout);process.stderr.write(r.stderr);process.exit(r.status ?? 1);"
        result = self.run_node(['-e', source, file])
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn('# pass 1', result.stdout)

    def test_kernel_stops_native_buffer_growth_without_a_sampling_watchdog(self):
        file = self.file('oom.test.mjs', """import test from 'node:test';
test('kernel-only memory failure', () => {
  const held = [];
  for (let i = 0; i < 32; i++) held.push(Buffer.alloc(8 * 1024 * 1024, 1));
  console.log('KERNEL_LIMIT_BYPASSED');
});""")
        result = self.run_node(['--test', '--test-reporter=tap', file])
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('SIGKILL', result.stdout)
        self.assertNotIn('KERNEL_LIMIT_BYPASSED', result.stdout)

    def test_descendants_share_one_budget_and_exhaustion_fails_before_node_starts(self):
        file = self.file('budget.test.mjs', f"""import test from 'node:test';
import assert from 'node:assert/strict';
import {{spawn,spawnSync}} from 'node:child_process';
test('shared reservations', async () => {{
  const children=[];
  try {{
    for(let i=0;i<2;i++) {{
      const child=spawn(process.execPath,['-e',"console.log('READY');setInterval(()=>{{}},1000)"],{{env:{{}},stdio:['ignore','pipe','pipe']}});
      children.push(child);
      await new Promise((resolve,reject)=>{{child.stdout.once('data',resolve);child.once('exit',code=>reject(new Error('child '+code)));}});
    }}
    const state=JSON.parse(spawnSync(process.execPath,['--plush-guard-status'],{{encoding:'utf8'}}).stdout);
    assert(state.reservedMiB <= 512);
    const rejected=spawnSync(process.execPath,['-e',"console.log('UNSAFE_BODY')"],{{env:{{}},encoding:'utf8'}});
    assert.equal(rejected.status,75);
    assert(rejected.stderr.includes('shared-memory-budget-exhausted'));
    assert(!rejected.stdout.includes('UNSAFE_BODY'));
  }} finally {{
    await Promise.all(children.map(child=>new Promise(resolve=>{{child.once('close',resolve);child.kill('SIGTERM');}})));
  }}
}});""")
        result = self.run_node(['--test', '--test-reporter=tap', file])
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_smaller_child_limits_use_matching_kernel_limits_and_reservations(self):
        file = self.file('smaller-children.test.mjs', """import test from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
test('bounded children coexist',async()=>{
 const children=[];
 try {
  await Promise.all(Array.from({length:3},async()=>{
   const child=spawn(process.execPath,['-e',"console.log(process.env.PLUSH_NODE_KERNEL_LIMIT_MIB);process.stdin.resume()"],{env:{PLUSH_NODE_GUARD_MEMORY_MIB:'64'},stdio:['pipe','pipe','pipe']});
   children.push(child);
   const limit=await new Promise((resolve,reject)=>{child.stdout.once('data',data=>resolve(Number(data.toString().trim())));child.once('exit',code=>reject(new Error('child '+code)));});
   assert.equal(limit,64);
  }));
  const current=JSON.parse(spawnSync(process.execPath,['--plush-guard-status'],{encoding:'utf8'}).stdout);
  assert.equal(current.reservedMiB,64+128+3*64);
  assert(current.reservedMiB<=current.budgetMiB);
 } finally {
  await Promise.all(children.map(child=>new Promise(resolve=>{child.once('close',resolve);child.stdin.end();})));
 }
});""")
        result = self.run_node(['--test', '--test-reporter=tap', file])
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)

    def test_memory_requests_cannot_raise_limits_or_use_invalid_units(self):
        file = self.file('invalid-request.test.mjs', "import test from 'node:test';test('must not run',()=>console.log('UNSAFE_BODY'));")
        for value in ['', '0', '33', '160', '-64', ' 64', 'invalid']:
            with self.subTest(value=value):
                result = subprocess.run([self.node, '--test', file], capture_output=True, text=True,
                    env={**self.env, 'PLUSH_NODE_GUARD_MEMORY_MIB': value}, timeout=5)
                self.assertEqual(result.returncode, 75, result.stdout + result.stderr)
                self.assertIn('invalid-memory-request', result.stderr)
                self.assertNotIn('UNSAFE_BODY', result.stdout)

    def test_smaller_request_remains_a_fatal_kernel_limit(self):
        file = self.file('smaller-limit.test.mjs', """import test from 'node:test';
test('smaller native limit',()=>{const held=[];for(let i=0;i<6;i++)held.push(Buffer.alloc(16*1024*1024,1));console.log('LIMIT_BYPASSED');});""")
        result = subprocess.run([self.node, '--test', '--test-reporter=tap', file], capture_output=True,
            text=True, env={**self.env, 'PLUSH_NODE_GUARD_MEMORY_MIB': '64'}, timeout=8)
        self.assertNotEqual(result.returncode, 0)
        self.assertIn('SIGKILL', result.stdout)
        self.assertNotIn('LIMIT_BYPASSED', result.stdout)

    def test_simultaneous_sessions_queue_on_the_kernel_job_lock(self):
        file = self.file('queue.test.mjs', """import test from 'node:test';
import {appendFileSync} from 'node:fs';
test('queued session', async () => {
  appendFileSync(process.env.RECORD, JSON.stringify({event:'start',at:Date.now(),pid:process.pid})+'\\n');
  await new Promise(resolve=>setTimeout(resolve,350));
  appendFileSync(process.env.RECORD, JSON.stringify({event:'end',at:Date.now(),pid:process.pid})+'\\n');
});""")
        record = self.root / 'queue.jsonl'
        processes = []
        try:
            for _ in range(3):
                processes.append(subprocess.Popen([self.node, '--test', file],
                    env={**self.env, 'RECORD': str(record)}, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                    text=True, start_new_session=True))
            for process in processes:
                stdout, stderr = process.communicate(timeout=8)
                self.assertEqual(process.returncode, 0, stdout + stderr)
            events = [json.loads(line) for line in record.read_text().splitlines()]
            self.assertEqual([event['event'] for event in events], ['start', 'end'] * 3)
            self.assertEqual(len({event['pid'] for event in events}), 3)
        finally:
            for process in processes:
                if process.poll() is None:
                    os.killpg(process.pid, signal.SIGKILL)
                    process.wait(timeout=2)

    def test_killed_session_releases_all_kernel_locks(self):
        ready = self.root / 'ready'
        file = self.file('killed.test.mjs', f"""import test from 'node:test';
import {{writeFileSync}} from 'node:fs';
test('killed', async()=>{{writeFileSync({json.dumps(str(ready))},'ready');await new Promise(()=>{{}});}});""")
        process = subprocess.Popen([self.node, '--test', file], env=self.env,
            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, start_new_session=True)
        try:
            for _ in range(150):
                if ready.exists(): break
                time.sleep(.02)
            self.assertTrue(ready.exists())
            self.assertGreater(self.status()['reservedMiB'], 0)
        finally:
            if process.poll() is None: os.killpg(process.pid, signal.SIGKILL)
            process.wait(timeout=2)
        for _ in range(100):
            if self.status()['reservedMiB'] == 0: break
            time.sleep(.02)
        self.assertEqual(self.status()['reservedMiB'], 0)
        installer.smoke(self.node)

    def test_raw_command_has_an_external_deadline(self):
        file = self.file('timeout.test.mjs', "import test from 'node:test';test('blocked',()=>{while(true){}});")
        started = time.monotonic()
        result = self.run_node(['--test', file])
        self.assertEqual(result.returncode, 75)
        self.assertIn('native-job-timeout', result.stderr)
        self.assertLess(time.monotonic() - started, 5)

    def test_terminal_interrupt_releases_the_job_even_when_javascript_ignores_it(self):
        ready = self.root / 'interrupt-ready'
        file = self.file('interrupt.test.mjs', f"""import test from 'node:test';
import {{writeFileSync}} from 'node:fs';
process.on('SIGINT',()=>{{}});
test('blocked',async()=>{{writeFileSync({json.dumps(str(ready))},'ready');await new Promise(()=>{{}});}});""")
        process = subprocess.Popen([self.node, '--test', file], env=self.env, stdout=subprocess.PIPE,
                                   stderr=subprocess.PIPE, text=True, start_new_session=True)
        try:
            for _ in range(100):
                if ready.exists(): break
                time.sleep(.01)
            self.assertTrue(ready.exists())
            os.killpg(process.pid, signal.SIGINT)
            stdout, stderr = process.communicate(timeout=4)
            self.assertEqual(process.returncode, 130, stdout + stderr)
            self.assertIn('native-job-interrupted', stderr)
        finally:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=2)

    def test_killing_only_the_client_also_stops_detached_node_descendants(self):
        ready = self.root / 'detached.json'
        file = self.file('detached.test.mjs', f"""import test from 'node:test';
import {{spawn}} from 'node:child_process';
import {{writeFileSync}} from 'node:fs';
test('detached worker',async()=>{{
 const child=spawn(process.execPath,['-e','setInterval(()=>{{}},1000)'],{{env:{{}},stdio:'ignore',detached:true}});
 await new Promise(resolve=>setTimeout(resolve,150));
 writeFileSync({json.dumps(str(ready))},JSON.stringify(child.pid));
 await new Promise(()=>{{}});
}});""")
        process = subprocess.Popen([self.node, '--test', file], env=self.env, stdout=subprocess.DEVNULL,
                                   stderr=subprocess.DEVNULL, start_new_session=True)
        detached = None
        try:
            for _ in range(100):
                if ready.exists(): break
                time.sleep(.02)
            self.assertTrue(ready.exists())
            detached = json.loads(ready.read_text())
            process.kill()
            process.wait(timeout=2)
            for _ in range(100):
                try: os.kill(detached, 0)
                except ProcessLookupError: break
                time.sleep(.02)
            with self.assertRaises(ProcessLookupError): os.kill(detached, 0)
        finally:
            if process.poll() is None:
                os.killpg(process.pid, signal.SIGKILL)
                process.wait(timeout=2)
            if detached:
                try: os.kill(detached, signal.SIGKILL)
                except ProcessLookupError: pass


if __name__ == '__main__':
    unittest.main(verbosity=2)
