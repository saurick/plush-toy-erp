import assert from 'node:assert/strict'
import test from 'node:test'

import { createERPViteConfig } from '../vite.shared.mjs'
import {
  DEV_GITLAB_KEYCHAIN,
  parseStartWebDevArgs,
  resolveDevGitlabCredential,
} from './startWebDev.mjs'

test('start web dev: 默认启用共享 runtime preflight', () => {
  assert.deepEqual(parseStartWebDevArgs([], {}), {
    apiOrigin: 'http://127.0.0.1:8300',
    frontendOnly: false,
    viteArgs: [],
  })
})

test('start web dev: frontend-only 必须显式启用且保留 Vite 参数', () => {
  assert.deepEqual(
    parseStartWebDevArgs(['--', '--frontend-only', '--host', '127.0.0.1'], {
      API_ORIGIN: 'http://localhost:8300',
    }),
    {
      apiOrigin: 'http://localhost:8300',
      frontendOnly: true,
      viteArgs: ['--host', '127.0.0.1'],
    }
  )
  assert.equal(
    parseStartWebDevArgs([], { ERP_FRONTEND_ONLY: '1' }).frontendOnly,
    false,
    '遗留 shell 环境不能把普通 pnpm start 静默降级'
  )
})

test('start web dev: 显式 GitLab 凭据优先且不读取钥匙串', async () => {
  let keychainReads = 0
  const credential = await resolveDevGitlabCredential({
    env: { PLUSH_GITLAB_READ_TOKEN: 'explicit-read-token' },
    platform: 'darwin',
    readKeychain: async () => {
      keychainReads += 1
      return 'must-not-read'
    },
  })

  assert.deepEqual(credential, {
    source: 'environment',
    token: 'explicit-read-token',
  })
  assert.equal(keychainReads, 0)
})

test('start web dev: macOS 自动读取固定钥匙串凭据', async () => {
  const credential = await resolveDevGitlabCredential({
    env: {},
    platform: 'darwin',
    readKeychain: async () => 'keychain-read-token\n',
  })

  assert.deepEqual(DEV_GITLAB_KEYCHAIN, {
    account: 'simon',
    service: 'plush-toy-erp.gitlab-read-api',
  })
  assert.deepEqual(credential, {
    source: 'keychain',
    token: 'keychain-read-token',
  })
})

test('start web dev: 非 macOS 或缺少钥匙串凭据时安全降级', async () => {
  let keychainReads = 0
  const nonMac = await resolveDevGitlabCredential({
    env: {},
    platform: 'linux',
    readKeychain: async () => {
      keychainReads += 1
      return 'must-not-read'
    },
  })
  const missing = await resolveDevGitlabCredential({
    env: {},
    platform: 'darwin',
    readKeychain: async () => {
      throw new Error('item not found')
    },
  })

  assert.deepEqual(nonMac, { source: 'missing', token: '' })
  assert.deepEqual(missing, { source: 'missing', token: '' })
  assert.equal(keychainReads, 0)
})

test('start web dev: preflight 地址与 Vite RPC/template 代理使用同一 API_ORIGIN', async () => {
  const previousAPIOrigin = process.env.API_ORIGIN
  process.env.API_ORIGIN = 'http://127.0.0.1:18430/'
  try {
    const configFactory = createERPViteConfig('desktop')
    const config = await configFactory({
      command: 'serve',
      mode: 'development',
    })
    assert.equal(config.server.proxy['/rpc'].target, 'http://127.0.0.1:18430')
    assert.equal(
      config.server.proxy['/templates'].target,
      'http://127.0.0.1:18430'
    )
  } finally {
    if (previousAPIOrigin === undefined) delete process.env.API_ORIGIN
    else process.env.API_ORIGIN = previousAPIOrigin
  }
})
