#!/usr/bin/env python3
"""实测工具堆上限、真实 MCP、绕过边界和非破坏安装。"""

import importlib.util
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
import unittest

sys.dont_write_bytecode = True
SOURCE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('tool_verify', SOURCE / 'verify_node_tool_guard.py')
verify = importlib.util.module_from_spec(spec)
spec.loader.exec_module(verify)
tools = verify.tools


class ToolHeapGuard(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory(prefix='plush-tool-heap-tests-')
        cls.root = Path(cls.temporary.name).resolve()
        cls.manifest = tools.build_guard(cls.root / 'guard', tools.CUA, limit=32)
        cls.node = cls.manifest['publicNode']
        cls.env = verify.environment()

    @classmethod
    def tearDownClass(cls):
        cls.temporary.cleanup()

    def run_node(self, args, env=None):
        return subprocess.run([self.node, *map(str,args)], env=self.env if env is None else env,
                              capture_output=True, text=True, timeout=15)

    def test_real_heap_limit_and_original_runtime_version(self):
        result = tools.smoke(self.manifest)
        self.assertEqual(result['limit'], 32)
        self.assertLessEqual(result['heapLimitMiB'], 80)
        self.assertEqual(result['version'], self.manifest['runtimeVersion'])

    def test_oom_stops_without_sampling_or_core_dump(self):
        result = self.run_node(['-e', "const held=[];for(let i=0;i<20000;i++)held.push(new Array(1024).fill(i));console.log('UNSAFE_BODY')"])
        self.assertEqual(result.returncode, -signal.SIGABRT, result.stderr[-1000:])
        self.assertIn('heap out of memory', result.stderr)
        self.assertNotIn('UNSAFE_BODY', result.stdout)

    def test_larger_cli_and_environment_heap_requests_are_rejected(self):
        for flag in ['--max-old-space-size=8192','--max_old_space_size=8192',
                     '--max-old-space-size-percentage=80','--max-heap-size=8192']:
            with self.subTest(flag=flag):
                result = self.run_node([flag,'-e',"console.log('UNSAFE_BODY')"])
                self.assertEqual(result.returncode, 75)
                self.assertNotIn('UNSAFE_BODY', result.stdout)
        result = self.run_node(['-e',"console.log('UNSAFE_BODY')"],
                               {**self.env,'NODE_OPTIONS':'--max_old_space_size=8192'})
        self.assertEqual(result.returncode, 75)
        self.assertNotIn('UNSAFE_BODY', result.stdout)

    def test_execpath_and_empty_environment_keep_child_heap_limit(self):
        source = "const{spawnSync}=require('node:child_process');const r=spawnSync(process.execPath,['-p','process.env.PLUSH_NODE_TOOL_HEAP_MIB'],{env:{},encoding:'utf8'});console.log(r.stdout.trim());process.stderr.write(r.stderr);process.exit(r.status??1)"
        result = self.run_node(['-e',source], {})
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(result.stdout.strip(),'32')

    def test_bare_tests_are_serialized_and_workers_keep_heap_limit(self):
        events = self.root / 'events'
        files = []
        for name in ['one','two']:
            file = self.root / f'{name}.test.mjs'
            file.write_text("import test from 'node:test';import assert from 'node:assert/strict';import{appendFileSync}from'node:fs';test('bounded',async()=>{assert.equal(process.env.PLUSH_NODE_TOOL_HEAP_MIB,'32');appendFileSync("+json.dumps(str(events))+",'start\\n');await new Promise(r=>setTimeout(r,100));appendFileSync("+json.dumps(str(events))+",'end\\n');});")
            files.append(file)
        result = self.run_node(['--test','--test-concurrency=8','--test-reporter=tap',*files])
        self.assertEqual(result.returncode,0,result.stdout+result.stderr)
        self.assertIn('# pass 2',result.stdout)
        self.assertEqual(events.read_text().splitlines(),['start','end','start','end'])

    def test_buffer_memory_is_explicitly_outside_heap_limit(self):
        result = self.run_node(['-p', "JSON.stringify({heap:require('node:v8').getHeapStatistics().heap_size_limit/1024/1024,buffer:Buffer.alloc(96*1024*1024,1).length/1024/1024})"])
        self.assertEqual(result.returncode,0,result.stderr)
        value = json.loads(result.stdout)
        self.assertGreater(value['buffer'],value['heap'])

    def test_original_signed_path_remains_a_documented_bypass(self):
        result = subprocess.run([tools.CUA,'-p','process.env.PLUSH_NODE_TOOL_HEAP_MIB??"UNPROTECTED"'],
                                env={},capture_output=True,text=True,timeout=5)
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertEqual(result.stdout.strip(),'UNPROTECTED')

    def test_runtime_identity_drift_fails_before_application_code(self):
        file = self.root/'guard/manifest.json'
        original = file.read_text()
        changed = json.loads(original)
        changed['runtimeSha'] = '0'*64
        try:
            file.write_text(json.dumps(changed))
            result = self.run_node(['-e',"console.log('UNSAFE_BODY')"])
            self.assertEqual(result.returncode,75)
            self.assertIn('runtime-revalidation-required',result.stderr)
            self.assertNotIn('UNSAFE_BODY',result.stdout)
        finally:
            file.write_text(original)

    def test_real_mcp_kernel_uses_heap_guard(self):
        manifest = tools.build_guard(self.root / 'mcp', tools.CUA, limit=512)
        env = tools.tomllib.loads(tools.CONFIG.read_text())['mcp_servers']['node_repl']['env']
        result = verify.verify_mcp(manifest['publicNode'],env)
        self.assertEqual(result['answer'],42)
        self.assertLessEqual(result['heapLimitMiB'],560)

    def test_private_runtime_install_rollback_reinstall_preserve_running_process(self):
        with tempfile.TemporaryDirectory(prefix='plush-tool-entry-fixture-') as temporary:
            root = Path(temporary)
            runtime = root/'private/bin/node'
            runtime.parent.mkdir(parents=True)
            shutil.copy2(tools.CUA,runtime)
            runtime.chmod(0o500)
            original = tools.native.digest(runtime)
            process = subprocess.Popen([runtime,'-e',"console.log('READY');process.stdin.resume()"],
                stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,text=True,env=self.env)
            try:
                self.assertEqual(process.stdout.readline().strip(),'READY')
                prefix = root/'tools'
                entry = tools.install_entry('artifact-fixture',runtime,runtime,True,tools=prefix,limit=32)
                self.assertIsNone(process.poll())
                self.assertEqual(tools.native.digest(runtime),entry['installedSha'])
                self.assertEqual(runtime.stat().st_mode & 0o777,0o500)
                self.assertEqual(runtime.stat().st_uid,os.getuid())
                config = root/'config.toml'
                config.write_text('[mcp_servers.node_repl.env]\nNODE_REPL_NODE_PATH="/guard/node"\nOTHER="keep"\n')
                tools.write_record(prefix/'installation.json',dict(entries=[entry],
                    configuredNodeReplPath='/guard/node',originalNodeReplPath='/signed/node'))
                tools.rollback(config,prefix)
                self.assertEqual(tools.native.digest(runtime),original)
                self.assertIsNone(process.poll())
                self.assertIn('OTHER="keep"',config.read_text())
                again=tools.install_entry('artifact-fixture',runtime,runtime,True,tools=prefix,limit=32)
                self.assertEqual(again['runtimeSha'],original)
                self.assertIsNone(process.poll())
            finally:
                process.stdin.close()
                process.wait(timeout=3)
                process.stdout.close();process.stderr.close()
                subprocess.run(['sudo','-n','chown','-R',f'{os.getuid()}:{os.getgid()}',root],check=True)

    def test_config_patch_preserves_other_settings_and_drift(self):
        text='[mcp_servers.node_repl.env]\nNODE_REPL_NODE_PATH = "/signed/node" # keep\nOTHER="unchanged"\n'
        patched=tools.replace_node_path(text,'/signed/node','/guard/node')
        self.assertEqual(tools.replace_node_path(patched,'/guard/node','/signed/node'),text)
        with self.assertRaisesRegex(RuntimeError,'configuration changed'):
            tools.replace_node_path(text,'/another/node','/guard/node')
        file=self.root/'config.toml';file.write_text(text)
        with self.assertRaisesRegex(RuntimeError,'changed before publication'):
            tools.write_config(file,'stale','replacement')
        self.assertEqual(file.read_text(),text)


if __name__=='__main__':
    unittest.main(verbosity=2)
