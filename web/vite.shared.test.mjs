import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
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
    const root = await mkdtemp(path.join(os.tmpdir(), 'plush-hmr-'))
    t.after(() => rm(root, { recursive: true, force: true }))
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
      server: { ...config.server, open: false },
      optimizeDeps: { noDiscovery: true, include: [] },
    }
    const server = await createServer(isolatedConfig)
    t.after(() => server.close())
    await server.listen()

    const forwardedSockets = new Set()
    const forwarder = net.createServer((socket) => {
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
    t.after(async () => {
      for (const socket of forwardedSockets) socket.destroy()
      await new Promise((resolve) => forwarder.close(resolve))
    })
    forwarder.listen(0, '127.0.0.1')
    await once(forwarder, 'listening')

    const origins = [
      `http://127.0.0.1:${port}`,
      `http://127.0.0.2:${port}`,
      `http://127.0.0.1:${forwarder.address().port}`,
    ]
    for (const [index, origin] of origins.entries()) {
      const probe = probes[index]
      const response = await fetch(`${origin}/@vite/client`)
      assert.equal(response.status, 200)
      const client = await response.text()
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
      })
      try {
        const [data] = await once(socket, 'message')
        assert.equal(JSON.parse(data).type, 'connected')
        assert.equal((await fetch(`${origin}/${probe}`)).status, 200)
        const updated = once(socket, 'message')
        await writeFile(
          path.join(root, probe),
          probeSource.replace('value = 0', 'value = 1')
        )
        const [update] = await updated
        const payload = JSON.parse(update)
        assert.equal(payload.type, 'update')
        assert.equal(payload.updates[0].path, `/${probe}`)
      } finally {
        const closed = once(socket, 'close')
        socket.close()
        await closed
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
