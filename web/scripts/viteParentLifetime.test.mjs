import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { setTimeout as delay } from 'node:timers/promises'
import test from 'node:test'
import { canListenOnPort } from './localPort.mjs'

test(
  '启动器被 SIGKILL 后，IPC 断开会关闭其子服务并释放真实端口',
  { timeout: 10000 },
  async (t) => {
    const preload = new URL('./viteParentLifetime.mjs', import.meta.url).href
    const serverSource = `
    const net = require('node:net');
    const server = net.createServer();
    process.once('SIGTERM', () => server.close(() => process.exit(0)));
    server.listen(0, '127.0.0.1', () => process.send({ pid: process.pid, port: server.address().port }));
  `
    const parentSource = `
    const { spawn } = require('node:child_process');
    const child = spawn(process.execPath, ['--import', ${JSON.stringify(preload)}, '-e', ${JSON.stringify(serverSource)}], { stdio: ['ignore', 'ignore', 'inherit', 'ipc'] });
    child.on('message', info => process.send(info));
  `
    const parent = spawn(process.execPath, ['-e', parentSource], {
      stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
    })
    let listener
    t.after(() => {
      if (parent.exitCode === null && parent.signalCode === null)
        parent.kill('SIGTERM')
      if (listener) {
        try {
          process.kill(listener.pid, 'SIGTERM')
        } catch (error) {
          if (error.code !== 'ESRCH') throw error
        }
      }
    })
    ;[listener] = await once(parent, 'message')
    assert.equal(await canListenOnPort(listener.port), false)
    const exited = once(parent, 'exit')
    parent.kill('SIGKILL')
    await exited
    for (let attempt = 0; attempt < 50; attempt += 1) {
      if (await canListenOnPort(listener.port)) break
      await delay(100)
    }
    assert.equal(await canListenOnPort(listener.port), true)
    listener = null
  }
)
