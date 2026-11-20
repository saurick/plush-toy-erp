import assert from 'node:assert/strict'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { runInNewContext } from 'node:vm'

import {
  normalizeDevBrowserTarget,
  launchDevBrowser,
  openDevBrowser,
  parseDevBrowserTarget,
  resolveDevBrowserLaunchEnv,
} from './openDevBrowser.js'

const scriptPath = fileURLToPath(new URL('./openDevBrowser.js', import.meta.url))

test('dev browser: macOS 人工入口共用页签复用器', () => {
  assert.deepEqual(resolveDevBrowserLaunchEnv({}, { platform: 'darwin' }), {
    BROWSER: scriptPath,
  })
})

function macBrowserFixture(addresses, { inaccessible = false } = {}) {
  const calls = []
  const spawnSyncImpl = (command, args, options) => {
    calls.push({ command, args, options })
    if (command !== '/usr/bin/osascript') return { status: 0 }
    try {
      const context = {
        Application: (bundle) => ({
          running: () => bundle === 'com.google.Chrome',
          windows: () => {
            if (inaccessible) throw new Error('private browser diagnostic')
            return [{ tabs: () => addresses.map((address) => ({ url: () => address })) }]
          },
        }),
      }
      runInNewContext(args[3], context)
      return { status: 0, stdout: context.run(args.slice(4)) }
    } catch (error) {
      return { status: 1, stderr: error.message }
    }
  }
  return { calls, spawnSyncImpl }
}

test('dev browser: macOS 同服务的业务深链与 loopback 别名复用且不重置页面', () => {
  for (const address of [
    'http://127.0.0.1:5175/erp/sales/orders?q=fixture#detail',
    'http://localhost:5175/admin-login',
    'http://[::1]:5175/m/boss/tasks',
  ]) {
    const fixture = macBrowserFixture([address])
    const result = openDevBrowser('http://127.0.0.1:5175/', {
      env: {}, platform: 'darwin', spawnSyncImpl: fixture.spawnSyncImpl,
    })
    assert.deepEqual(result, { action: 'reused', origin: 'http://127.0.0.1:5175' })
    assert.equal(fixture.calls.length, 1)
    assert.equal(fixture.calls[0].command, '/usr/bin/osascript')
  }
})

test('dev browser: macOS 无同服务页签时才后台新开，端口与协议须精确匹配', () => {
  for (const addresses of [
    [], ['http://127.0.0.1:15200/erp'], ['http://127.0.0.1:51750/'],
    ['https://127.0.0.1:5175/erp'], ['http://127.0.0.1.example.com:5175/erp'],
  ]) {
    const fixture = macBrowserFixture(addresses)
    const result = openDevBrowser('http://127.0.0.1:5175/', {
      env: {}, platform: 'darwin', spawnSyncImpl: fixture.spawnSyncImpl,
    })
    assert.equal(result.action, 'opened')
    assert.equal(fixture.calls.length, 2)
    assert.equal(fixture.calls[1].command, '/usr/bin/open')
    assert.deepEqual(fixture.calls[1].args, ['-g', 'http://127.0.0.1:5175/'])
  }
})

test('dev browser: macOS 无法核对页签时不以新开掩盖失败', () => {
  for (const inaccessible of [true, false]) {
    const fixture = macBrowserFixture([], { inaccessible })
    assert.throws(() => openDevBrowser('http://127.0.0.1:5175/', {
      env: {}, platform: 'darwin', spawnSyncImpl: inaccessible
        ? fixture.spawnSyncImpl
        : () => ({ status: 0, stdout: 'unknown result' }),
    }), /无法核对|未返回有效结果/u)
    assert(fixture.calls.every((call) => call.command !== '/usr/bin/open'))
  }
})

test('dev browser: 人工启动和已运行服务均按实际页签决定复用或新开', () => {
  const fixture = macBrowserFixture([])
  const output = []
  const options = { env: {}, platform: 'darwin', spawnSyncImpl: fixture.spawnSyncImpl, writeLine: (line) => output.push(line) }
  assert.equal(launchDevBrowser('http://127.0.0.1:5175/', options).action, 'opened')
  const existing = macBrowserFixture(['http://localhost:5175/erp/orders?status=open#lines'])
  assert.equal(launchDevBrowser('http://127.0.0.1:5175/', { ...options, spawnSyncImpl: existing.spawnSyncImpl }).action, 'reused')
  assert.equal(existing.calls.length, 1)
  assert.doesNotMatch(output.join('\n'), /status=open|#lines/u)
})

test('dev browser: 自动化与显式禁开页不会访问浏览器，开页失败不改变服务结果', () => {
  for (const env of [
    { BROWSER: 'none' }, { CODEX_THREAD_ID: 'fixture' }, { CODEX_CI: 'true' },
    { CI: '1' }, { NODE_ENV: 'test' }, { NODE_TEST_CONTEXT: 'child-v8' },
  ]) {
    const result = launchDevBrowser('http://127.0.0.1:5175/', {
      env, platform: 'darwin', openBrowser: () => assert.fail('browser must stay closed'),
    })
    assert.equal(result.action, 'suppressed')
  }
  const output = []
  const result = launchDevBrowser('http://127.0.0.1:5175/', {
    env: {}, platform: 'darwin', openBrowser: () => { throw new Error('private details') },
    writeLine: (line) => output.push(line),
  })
  assert.equal(result.action, 'unavailable')
  assert.match(output.join('\n'), /服务已就绪/u)
  assert.doesNotMatch(output.join('\n'), /private details/u)
})

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

test('dev browser: 显式 BROWSER 优先，无桌面 Linux 只输出地址', () => {
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
    { BROWSER: 'none' }
  )
  assert.deepEqual(
    resolveDevBrowserLaunchEnv(
      { DISPLAY: ':0' },
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
    platform: 'win32',
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
    platform: 'win32',
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
        platform: 'win32',
        powerShellPath: 'powershell.exe',
        spawnSyncImpl() {
          return { status: 1, stderr: 'private platform detail' }
        },
      }),
    /could not reuse or open/u
  )
})
