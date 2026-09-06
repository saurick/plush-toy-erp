import assert from 'node:assert/strict'
import test from 'node:test'
import { Readable } from 'node:stream'

import {
  isSameOriginRequest,
  readJsonBody,
  isLoopbackHostHeader,
  isLoopbackRemoteAddress,
} from './devServerSecurity.mjs'

test('loopback checks accept IPv4, IPv6, and IPv4-mapped remotes only', () => {
  for (const address of [
    '127.0.0.1',
    '127.42.9.7',
    '::1',
    '::ffff:127.0.0.1',
    '::ffff:7f00:1',
    '0:0:0:0:0:ffff:7f00:1',
  ]) {
    assert.equal(isLoopbackRemoteAddress(address), true, address)
  }
  for (const address of [
    '',
    '0.0.0.0',
    '10.0.0.2',
    '192.168.1.8',
    '::',
    '::ffff:10.0.0.2',
  ]) {
    assert.equal(isLoopbackRemoteAddress(address), false, address)
  }
})

test('Host checks reject DNS rebinding and malformed loopback lookalikes', () => {
  for (const host of [
    'localhost',
    'LOCALHOST:5175',
    '127.0.0.1',
    '127.22.3.4:65535',
    '[::1]',
    '[::1]:5175',
  ]) {
    assert.equal(isLoopbackHostHeader(host), true, host)
  }
  for (const host of [
    '',
    '0.0.0.0:5175',
    'localhost.evil',
    '127.0.0.1.evil',
    'localhost@evil.test',
    '[::ffff:127.0.0.1]:5175',
    '[::1].evil',
    '127.0.0.1:0',
    '127.0.0.1:65536',
  ]) {
    assert.equal(isLoopbackHostHeader(host), false, host)
  }
})

test('same-origin checks reject malformed origins and cross-origin metadata', () => {
  const headers = {
    host: 'localhost:5175',
    origin: 'http://localhost:5175',
    'sec-fetch-site': 'same-origin',
  }
  assert.equal(isSameOriginRequest({ headers }), true)
  for (const changed of [
    { host: ['localhost:5175'] },
    { origin: ['http://localhost:5175'] },
    { origin: undefined },
    { origin: 'null' },
    { origin: 'https://evil.test' },
    { origin: 'http://localhost:5176' },
    { origin: 'http://user@localhost:5175' },
    { origin: 'http://localhost:5175/path' },
    { origin: 'http://localhost:5175?x=1' },
    { origin: 'http://localhost:5175#x' },
    { 'sec-fetch-site': 'same-site' },
  ])
    assert.equal(
      isSameOriginRequest({ headers: { ...headers, ...changed } }),
      false,
      JSON.stringify(changed)
    )
})

test('JSON request limits count streamed UTF-8 bytes and preserve parse failures', async () => {
  const bytes = Buffer.from('{"名称":"棉"}')
  assert.deepEqual(
    await readJsonBody(
      Readable.from([bytes.subarray(0, 5), bytes.subarray(5)]),
      { maxBytes: bytes.length }
    ),
    { 名称: '棉' }
  )
  await assert.rejects(
    readJsonBody(Readable.from([bytes]), { maxBytes: bytes.length - 1 }),
    /body is too large/u
  )
  await assert.rejects(
    readJsonBody(Readable.from([]), { maxBytes: 16, label: 'testing request' }),
    /testing request body is required/u
  )
  await assert.rejects(
    readJsonBody(Readable.from(['{']), { maxBytes: 16 }),
    SyntaxError
  )
  const interrupted = Readable.from(
    (async function* () {
      yield '{'
      throw new Error('interrupted')
    })()
  )
  await assert.rejects(
    readJsonBody(interrupted, { maxBytes: 16 }),
    /interrupted/u
  )
})
