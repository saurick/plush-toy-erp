import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import {
  normalizeDevBrowserTarget,
  openDevBrowser,
  parseDevBrowserTarget,
  resolveDevBrowserLaunchEnv,
} from './openDevBrowser.js'

const scriptPath = fileURLToPath(new URL('./openDevBrowser.js', import.meta.url))

test('dev browser: WSL start 使用同一受管标签复用器', () => {
  assert.deepEqual(
    resolveDevBrowserLaunchEnv(
      {},
      {
        fileExists: () => true,
        platform: 'linux',
        release: '6.6.0-microsoft-standard-WSL2',
      }
    ),
    {
      BROWSER: scriptPath,
      ERP_DEV_BROWSER_POWERSHELL:
        '/mnt/c/Windows/System32/WindowsPowerShell/v1.0/powershell.exe',
    }
  )
})

test('dev browser: 原生 Windows 使用系统 PowerShell', () => {
  assert.deepEqual(
    resolveDevBrowserLaunchEnv(
      { SYSTEMROOT: 'C:\\Windows' },
      {
        fileExists: () => true,
        platform: 'win32',
        release: '10.0.26100',
      }
    ),
    {
      BROWSER: scriptPath,
      ERP_DEV_BROWSER_POWERSHELL:
        'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe',
    }
  )
})

test('dev browser: 显式 BROWSER 和非 Windows 环境保持原行为', () => {
  assert.deepEqual(
    resolveDevBrowserLaunchEnv(
      { BROWSER: 'none' },
      {
        fileExists: () => true,
        platform: 'linux',
        release: '6.6.0-microsoft-standard-WSL2',
      }
    ),
    {}
  )
  assert.deepEqual(
    resolveDevBrowserLaunchEnv(
      {},
      {
        fileExists: () => true,
        platform: 'linux',
        release: '6.8.0-generic',
      }
    ),
    {}
  )
})

test('dev browser: 只接受无凭据的 loopback 开发地址', () => {
  assert.equal(
    normalizeDevBrowserTarget('http://127.0.0.1:5175/erp').href,
    'http://127.0.0.1:5175/erp'
  )
  assert.equal(
    parseDevBrowserTarget([
      '--config',
      'vite.config.mjs',
      'http://localhost:15200/erp',
    ]).origin,
    'http://localhost:15200'
  )
  assert.throws(
    () => normalizeDevBrowserTarget('https://example.com/erp'),
    /loopback/u
  )
  assert.throws(
    () => normalizeDevBrowserTarget('http://admin:secret@127.0.0.1:5175'),
    /credentials/u
  )
})

test('dev browser: PowerShell 命中旧标签时返回 reused 且不泄露路径', () => {
  const calls = []
  const result = openDevBrowser('http://127.0.0.1:5175/admin-login', {
    env: {},
    powerShellPath: path.win32.join('C:\\Windows', 'powershell.exe'),
    spawnSyncImpl(command, args, options) {
      calls.push({ command, args, options })
      return {
        status: 0,
        stdout: 'PLUSH_DEV_BROWSER_REUSED\r\n',
      }
    },
  })

  assert.deepEqual(result, {
    action: 'reused',
    origin: 'http://127.0.0.1:5175',
  })
  assert.equal(calls.length, 1)
  assert.deepEqual(calls[0].options.env, {})
  assert.equal(calls[0].args.includes('-EncodedCommand'), true)
  assert.equal(calls[0].args.join(' ').includes('/admin-login'), false)
  const encodedIndex = calls[0].args.indexOf('-EncodedCommand') + 1
  const powerShellSource = Buffer.from(
    calls[0].args[encodedIndex],
    'base64'
  ).toString('utf16le')
  assert.match(
    powerShellSource,
    /\$targetUrl = 'http:\/\/127\.0\.0\.1:5175\/admin-login'/u
  )
  assert.ok(
    powerShellSource.indexOf('$title -notmatch $knownTitlePattern') <
      powerShellSource.indexOf('$address = Get-AddressValue')
  )
  assert.match(
    powerShellSource,
    /if \(\[PlushDevBrowserWindow\]::IsIconic\([\s\S]+?\)\) \{[\s\S]+?ShowWindowAsync/u
  )
  assert.equal(
    powerShellSource.match(/\]::ShowWindowAsync\(/gu)?.length,
    1,
    'SW_RESTORE 只能位于最小化窗口分支'
  )
  assert.doesNotMatch(powerShellSource, /Write-Output\s+\$address/u)
})

test('dev browser: 未命中旧标签时保留首次新开回退', () => {
  const result = openDevBrowser('http://localhost:15200/erp', {
    env: {},
    powerShellPath: 'powershell.exe',
    spawnSyncImpl() {
      return {
        status: 0,
        stdout: 'PLUSH_DEV_BROWSER_OPENED\r\n',
      }
    },
  })

  assert.deepEqual(result, {
    action: 'opened',
    origin: 'http://localhost:15200',
  })
})

test('dev browser: 浏览器桥失败时明确失败而不是误报复用', () => {
  assert.throws(
    () =>
      openDevBrowser('http://127.0.0.1:5175', {
        env: {},
        powerShellPath: 'powershell.exe',
        spawnSyncImpl() {
          return { status: 1, stderr: 'private platform detail' }
        },
      }),
    /could not reuse or open/u
  )
})
