import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import http from 'node:http'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { runInNewContext } from 'node:vm'
import { createServer } from 'vite'
import WebSocket from 'ws'
import { findAvailableDevAuxPort } from '../scripts/dev-ports.mjs'

import {
  assertERPResolvedVitePorts,
  createERPViteConfig,
  resolveERPViteCacheDir,
  resolveERPDevServerPort,
  resolveERPHMRClientPort,
} from './vite.shared.mjs'

const ports = Object.freeze({
  web: 5175,
  style: 6175,
  auxStart: 15200,
})

test('isolated Vite serves linked dependency assets while rejecting unrelated and denied files', async (t) => {
  const directory = await realpath(await mkdtemp(path.join(os.tmpdir(), 'plush-vite-assets-')))
  const workspace = path.join(directory, 'workspace')
  const webRoot = path.join(workspace, 'web')
  const dependencies = path.join(directory, 'installed-dependencies')
  await mkdir(webRoot, { recursive: true })
  await mkdir(dependencies)
  await symlink(dependencies, path.join(webRoot, 'node_modules'), 'dir')
  const font = path.join(dependencies, 'fixture.woff2')
  const unrelated = path.join(directory, 'unrelated.txt')
  await writeFile(font, 'synthetic-font-fixture')
  await writeFile(unrelated, 'unrelated-fixture')
  await writeFile(path.join(dependencies, '.env'), 'FIXTURE_ONLY=1')
  let server
  t.after(async () => {
    await server?.close()
    await rm(directory, { recursive: true, force: true })
  })
  const config = await createERPViteConfig('desktop')({ command: 'serve', mode: 'development' })
  server = await createServer({
    configFile: false,
    root: webRoot,
    logLevel: 'silent',
    plugins: config.plugins.filter((plugin) => plugin.name === 'plush-dev-linked-dependency-assets'),
    server: { host: '127.0.0.1', port: 0, fs: { strict: true, allow: [workspace] } },
    optimizeDeps: { noDiscovery: true, include: [] },
  })
  await server.listen()
  const baseURL = `http://127.0.0.1:${server.httpServer.address().port}`
  const asset = await fetch(`${baseURL}/@fs${font}`)
  assert.equal(asset.status, 200)
  assert.equal(await asset.text(), 'synthetic-font-fixture')
  assert.equal((await fetch(`${baseURL}/@fs${unrelated}`)).status, 403)
  assert.equal((await fetch(`${baseURL}/@fs${dependencies}/.env`)).status, 403)
  assert.equal(server.config.server.fs.strict, true)
  assert(!server.config.server.fs.allow.includes(directory))
})

test('Vite admits lazy archive Markdown while keeping its parent and sensitive files restricted', async (t) => {
  const config = await createERPViteConfig('desktop')({ command: 'serve', mode: 'development' })
  const server = await createServer({ ...config, configFile: false, root: import.meta.dirname, logLevel: 'silent', server: { ...config.server, host: '127.0.0.1', open: false } })
  t.after(() => server.close())
  await server.listen()
  const directory = path.resolve(import.meta.dirname, '../docs/archive')
  const file = path.join(directory, 'architecture-history/bom-lot-schema-review.md')
  const response = await fetch(`http://127.0.0.1:${server.httpServer.address().port}/@fs${file}?import&raw`)
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type'), /javascript/u)
  assert.match(await response.text(), /export default/u)
  assert(server.config.server.fs.allow.includes(directory))
  assert(!server.config.server.fs.allow.includes(path.dirname(directory)))
  assert.equal(server.config.server.fs.strict, true)
  assert(server.config.fsDenyGlob(path.join(directory, '.env')))
})

test(
  'Vite startup opens a browser only for manual development',
  { timeout: 30_000 },
  async (t) => {
    const envKeys = [
      'CODEX_THREAD_ID',
      'CODEX_CI',
      'CI',
      'NODE_ENV',
      'NODE_TEST_CONTEXT',
      'ERP_VITE_PORT',
      'ERP_VITE_HMR_CLIENT_PORT',
      'ERP_VITE_HMR_HOST',
    ]
    const originalEnv = envKeys.map((key) => [key, process.env[key]])
    const root = await realpath(
      await mkdtemp(path.join(os.tmpdir(), 'plush-vite-browser-'))
    )
    t.after(async () => {
      for (const [key, value] of originalEnv) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
      await rm(root, { recursive: true, force: true })
    })
    await writeFile(
      path.join(root, 'index.html'),
      '<!doctype html><title>Browser startup fixture</title>'
    )

    for (const [name, env, expectedOpenCount, openOverride] of [
      ['Codex chat', { CODEX_THREAD_ID: 'browser-startup-fixture' }, 0],
      ['Codex CI', { CODEX_CI: '1' }, 0],
      ['CI', { CI: 'true' }, 0],
      ['test environment', { NODE_ENV: 'test' }, 0],
      ['Node test runner', { NODE_TEST_CONTEXT: 'child-v8' }, 0],
      ['manual terminal', {}, 1],
      ['disabled automation markers', { CODEX_CI: '0', CI: 'false' }, 1],
      ['Codex CLI open path override', { CODEX_THREAD_ID: 'browser-startup-fixture' }, 0, 'false'],
      ['CI explicit open override', { CI: 'true' }, 0, true],
      ['test explicit open override', { NODE_ENV: 'test' }, 0, true],
      ['manual explicit open path', {}, 1, '/erp'],
    ]) {
      await t.test(name, async (t) => {
        for (const key of envKeys) delete process.env[key]
        const port = await findAvailableDevAuxPort(ports)
        Object.assign(process.env, env, { ERP_VITE_PORT: String(port) })
        const config = await createERPViteConfig('desktop')({
          command: 'serve',
          mode: 'development',
        })
        const server = await createServer({
          ...config,
          configFile: false,
          root,
          publicDir: false,
          cacheDir: path.join(root, '.vite'),
          logLevel: 'silent',
          plugins: config.plugins.filter((plugin) => plugin.name === 'plush-dev-browser-policy'),
          server: {
            ...config.server,
            host: '127.0.0.1',
            ...(openOverride === undefined ? {} : { open: openOverride }),
          },
          ...(openOverride === undefined ? {} : { preview: { open: openOverride } }),
          optimizeDeps: { noDiscovery: true, include: [] },
        })
        t.after(() => server.close())
        let openCount = 0
        server.openBrowser = () => {
          openCount += 1
        }
        await server.listen()
        assert.equal((await fetch(`http://127.0.0.1:${port}/`)).status, 200)
        assert.equal(openCount, expectedOpenCount)
        if (expectedOpenCount === 0) {
          assert.equal(server.config.server.open, false)
          assert.equal(server.config.preview.open, false)
        } else if (openOverride !== undefined) {
          assert.equal(server.config.server.open, openOverride)
          assert.equal(server.config.preview.open, openOverride)
        }
      })
    }
  }
)

test('ERP Vite runtime ports stay on canonical or project auxiliary ports', () => {
  assert.equal(resolveERPDevServerPort('', ports), 5175)
  assert.equal(resolveERPDevServerPort('6175', ports), 6175)
  assert.equal(resolveERPDevServerPort('15299', ports), 15299)
  assert.throws(
    () => resolveERPDevServerPort('5177', ports),
    /auxiliary range 15200-15299/u
  )
  assert.throws(
    () => resolveERPDevServerPort('not-a-port', ports),
    /integer between 1024 and 65535/u
  )
})

test('ERP HMR client port follows the actual Vite listener', () => {
  assert.equal(resolveERPHMRClientPort('', 15230), 15230)
  assert.equal(resolveERPHMRClientPort('15230', 15230), 15230)
  assert.throws(
    () => resolveERPHMRClientPort('5175', 15230),
    /must match ERP_VITE_PORT=15230/u
  )
})

test('resolved Vite CLI overrides cannot desynchronize HMR and listener ports', () => {
  assert.doesNotThrow(() =>
    assertERPResolvedVitePorts({
      serverPort: 15240,
      hmrClientPort: 15240,
    })
  )
  assert.throws(
    () =>
      assertERPResolvedVitePorts({
        serverPort: 15240,
        hmrClientPort: 5175,
      }),
    /must match; set ERP_VITE_PORT and ERP_VITE_HMR_CLIENT_PORT/u
  )
})

test('development Vite optimizer caches are isolated by app and listener port', () => {
  const rootDir = path.resolve('/repo/web')
  const localCache = resolveERPViteCacheDir(
    rootDir,
    'desktop',
    'development',
    15200
  )
  const gateCache = resolveERPViteCacheDir(
    rootDir,
    'desktop',
    'development',
    15201
  )

  assert.equal(
    localCache,
    path.join(rootDir, '.vite-cache', 'desktop', '15200')
  )
  assert.equal(gateCache, path.join(rootDir, '.vite-cache', 'desktop', '15201'))
  assert.notEqual(localCache, gateCache)
  assert.equal(
    resolveERPViteCacheDir(rootDir, 'desktop', 'production', 15200),
    path.join(rootDir, 'build', '.vite-cache', 'desktop')
  )
  assert.equal(
    resolveERPViteCacheDir(rootDir, 'desktop', 'production', 15201),
    path.join(rootDir, 'build', '.vite-cache', 'desktop')
  )
})

test(
  '默认 HMR 通过页面地址连接，覆盖远程主机和转发端口',
  { timeout: 15_000 },
  async (t) => {
    const envKeys = [
      'ERP_VITE_PORT',
      'ERP_VITE_HMR_HOST',
      'ERP_VITE_HMR_CLIENT_PORT',
    ]
    const originalEnv = envKeys.map((key) => [key, process.env[key]])
    t.after(() => {
      for (const [key, value] of originalEnv) {
        if (value === undefined) delete process.env[key]
        else process.env[key] = value
      }
    })
    const port = await findAvailableDevAuxPort(ports)
    process.env.ERP_VITE_PORT = String(port)
    delete process.env.ERP_VITE_HMR_HOST
    delete process.env.ERP_VITE_HMR_CLIENT_PORT
    // Vite's module graph and watcher must refer to the same path on macOS,
    // where the temporary directory can be reached through a symlink.
    const root = await realpath(
      await mkdtemp(path.join(os.tmpdir(), 'plush-hmr-'))
    )
    const remoteHost = 'erp-hmr.example.test'
    // Exercise a distinct page hostname without requiring DNS or a second
    // loopback interface (127.0.0.2 is not portable across operating systems).
    const lookup = (hostname, options, callback) => {
      assert.equal(hostname, remoteHost)
      if (options.all) callback(null, [{ address: '127.0.0.1', family: 4 }])
      else callback(null, '127.0.0.1', 4)
    }
    const readPage = (url) => new Promise((resolve, reject) => {
      http.get(url, { lookup, agent: false, signal: t.signal }, (response) => {
        let body = ''
        response.setEncoding('utf8')
        response.on('data', (chunk) => { body += chunk })
        response.on('end', () => resolve({ status: response.statusCode, body }))
        response.on('error', reject)
      }).on('error', reject)
    })
    let server
    let forwarder
    const forwardedSockets = new Set()
    const hmrSockets = new Set()
    t.after(async () => {
      for (const socket of hmrSockets) socket.terminate()
      for (const socket of forwardedSockets) socket.destroy()
      if (forwarder) await new Promise((resolve) => forwarder.close(resolve))
      if (server) await server.close()
      await rm(root, { recursive: true, force: true })
    })
    const probes = ['local.js', 'remote.js', 'forwarded.js']
    const probeSource =
      'export const value = 0; if (import.meta.hot) import.meta.hot.accept();\n'
    await Promise.all(
      probes.map((probe) => writeFile(path.join(root, probe), probeSource))
    )
    const config = await createERPViteConfig('desktop')({
      command: 'serve',
      mode: 'development',
    })
    const isolatedConfig = {
      ...config,
      configFile: false,
      root,
      cacheDir: path.join(root, '.vite'),
      plugins: config.plugins.filter((plugin) =>
        [
          'plush-dev-localhost-origin-normalizer',
          'plush-dev-resolved-port-guard',
        ].includes(plugin.name)
      ),
      server: {
        ...config.server,
        open: false,
        allowedHosts: [...config.server.allowedHosts, remoteHost],
      },
      optimizeDeps: { noDiscovery: true, include: [] },
    }
    server = await createServer(isolatedConfig)
    await server.listen()

    forwarder = net.createServer((socket) => {
      const upstream = net.connect(port, '127.0.0.1')
      for (const connection of [socket, upstream]) {
        forwardedSockets.add(connection)
        connection.on('close', () => forwardedSockets.delete(connection))
        connection.on('error', () => {
          socket.destroy()
          upstream.destroy()
        })
      }
      socket.pipe(upstream).pipe(socket)
    })
    forwarder.listen(0, '127.0.0.1')
    await once(forwarder, 'listening', { signal: t.signal })

    const origins = [
      `http://127.0.0.1:${port}`,
      `http://${remoteHost}:${port}`,
      `http://127.0.0.1:${forwarder.address().port}`,
    ]
    for (const [index, origin] of origins.entries()) {
      const probe = probes[index]
      const response = await readPage(`${origin}/@vite/client`)
      assert.equal(response.status, 200)
      const client = response.body
      const socketURL = runInNewContext(
        client.slice(
          client.indexOf('const serverHost ='),
          client.indexOf('const transport =')
        ) + '\n(socketProtocol + "://" + socketHost + "?token=" + wsToken)',
        { importMetaUrl: new URL(`${origin}/@vite/client`) }
      )
      assert.equal(new URL(socketURL).host, new URL(origin).host)
      const socket = new WebSocket(socketURL, 'vite-hmr', {
        origin,
        handshakeTimeout: 2000,
        lookup,
      })
      hmrSockets.add(socket)
      try {
        const [data] = await once(socket, 'message', { signal: t.signal })
        assert.equal(JSON.parse(data).type, 'connected')
        const moduleResponse = await readPage(`${origin}/${probe}`)
        assert.equal(moduleResponse.status, 200)
        assert.match(moduleResponse.body, /createHotContext/u)
        const module = await server.environments.client.moduleGraph.getModuleByUrl(`/${probe}`)
        assert.equal(module?.file, path.join(root, probe))
        assert.equal(module?.isSelfAccepting, true)
        const updated = once(socket, 'message', { signal: t.signal })
        await writeFile(
          path.join(root, probe),
          probeSource.replace('value = 0', 'value = 1')
        )
        const [update] = await updated
        const payload = JSON.parse(update)
        assert.equal(payload.type, 'update')
        assert.equal(payload.updates.length, 1)
        assert.equal(payload.updates[0].type, 'js-update')
        assert.equal(payload.updates[0].path, `/${probe}`)
        assert.equal(payload.updates[0].acceptedPath, `/${probe}`)
      } finally {
        const closed = once(socket, 'close')
        socket.terminate()
        await closed
        hmrSockets.delete(socket)
      }
    }

    await assert.rejects(
      createServer({
        ...isolatedConfig,
        server: { ...isolatedConfig.server, port: port + 1 },
      }),
      /must match configured ERP_VITE_PORT/u
    )
    process.env.ERP_VITE_HMR_HOST = 'dev.example.test'
    process.env.ERP_VITE_HMR_CLIENT_PORT = String(port)
    const overridden = await createERPViteConfig('desktop')({
      command: 'serve',
      mode: 'development',
    })
    assert.equal(overridden.server.hmr.host, 'dev.example.test')
    assert.equal(overridden.server.hmr.clientPort, port)
    process.env.ERP_VITE_HMR_CLIENT_PORT = String(port + 1)
    await assert.rejects(
      createERPViteConfig('desktop')({ command: 'serve', mode: 'development' }),
      /must match ERP_VITE_PORT/u
    )
  }
)
