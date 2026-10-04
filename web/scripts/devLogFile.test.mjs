import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import { PassThrough } from 'node:stream'
import test from 'node:test'
import { attachDevLogFile, createDevLogFile } from './devLogFile.mjs'

function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plush-dev-log-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  return root
}

test('frontend stdout and stderr remain visible and are collected without terminal controls', async (t) => {
  const root = fixture(t), stdout = new PassThrough(), stderr = new PassThrough()
  let out = '', err = ''
  stdout.on('data', (chunk) => { out += chunk }); stderr.on('data', (chunk) => { err += chunk })
  const child = spawn(process.execPath, ['-e', 'console.log("\u001b[32mready\u001b[0m");console.error("render failed")'], { stdio: ['ignore', 'pipe', 'pipe'] })
  const log = attachDevLogFile(child, root, 5175, { stdout, stderr })
  await once(child, 'close')
  assert.match(out, /ready/u); assert.match(err, /render failed/u)
  const content = fs.readFileSync(log.file, 'utf8')
  assert.match(content, /ready/u); assert.match(content, /render failed/u)
  assert.doesNotMatch(content, /\u001b/u)
  assert.equal(fs.statSync(log.file).mode & 0o777, 0o600)
  assert.equal(stdout.writableEnded, false); assert.equal(stderr.writableEnded, false)
})

test('frontend log rotation bounds current and retained files and survives restart', (t) => {
  const root = fixture(t)
  const log = createDevLogFile(root, 5175, { maxBytes: 8 })
  for (const line of ['one\n', 'two\n', 'three\n', 'four\n', 'five\n', 'six\n', 'seven\n']) log.write(line)
  log.close()
  const files = fs.readdirSync(path.dirname(log.file))
  assert.equal(files.length, 3)
  for (const file of files) assert.ok(fs.statSync(path.join(path.dirname(log.file), file)).size <= 8)
  const restarted = createDevLogFile(root, 5175, { maxBytes: 8 })
  restarted.write('tail\n'); restarted.close()
  assert.equal(fs.readFileSync(log.file, 'utf8'), 'tail\n')
})

test('file failures warn once and do not interrupt log producers or follow symlinks', (t) => {
  const root = fixture(t), directory = path.join(root, 'output/dev-workbench/web-logs')
  fs.mkdirSync(directory, { recursive: true })
  const protectedFile = path.join(root, 'protected'); fs.writeFileSync(protectedFile, 'keep')
  fs.symlinkSync(protectedFile, path.join(directory, 'vite-5175.log'))
  let warnings = 0
  const log = createDevLogFile(root, 5175, { warn: () => { warnings++ } })
  log.write('ignored'); log.write('again'); log.close()
  assert.equal(warnings, 1); assert.equal(fs.readFileSync(protectedFile, 'utf8'), 'keep')
})
