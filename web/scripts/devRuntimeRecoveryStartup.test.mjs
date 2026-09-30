import assert from 'node:assert/strict'
import test from 'node:test'
import {
  createViteChildEnvironment,
  resolveWebRuntimeStartup,
} from './startWebDev.mjs'
import { LocalRuntimePreflightError } from '../../scripts/local-runtime-preflight.mjs'

test('普通启动启用停服检查，仅前端调试清除遗留的检查开关', () => {
  const options = {
    apiOrigin: 'http://127.0.0.1:8300',
    gitlabCredential: { source: 'missing', token: '' },
    env: { ERP_DEV_RUNTIME_CHECKS: 'stale', BROWSER: 'none' },
  }
  assert.equal(createViteChildEnvironment(options).ERP_DEV_RUNTIME_CHECKS, '1')
  assert.equal(
    createViteChildEnvironment({ ...options, frontendOnly: true })
      .ERP_DEV_RUNTIME_CHECKS,
    undefined
  )
})

test('无法启动的后端明确提示总览恢复入口，数据库阻断仍提示迁移页', async () => {
  for (const [reason, route] of [
    ['local_backend_unavailable', '/__dev/'],
    ['local_backend_start_failed', '/__dev/'],
    ['database_migration_pending', '/__dev/database-migration'],
  ]) {
    const output = []
    await resolveWebRuntimeStartup(
      { apiOrigin: 'http://127.0.0.1:8300' },
      {
        preflight: async () => {
          throw new LocalRuntimePreflightError(reason, 'fixture')
        },
        startBackend: async () => false,
        isPortAvailable: async () => true,
        writeLine: (line) => output.push(line),
      }
    )
    assert.ok(output.join('\n').includes(`恢复模式：${route}；`))
  }
})
