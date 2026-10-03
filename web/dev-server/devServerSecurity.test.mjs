import assert from 'node:assert/strict'
import test from 'node:test'
import { Readable } from 'node:stream'

import {
  createDevHttpsProxyMiddleware,
  isDevWorkbenchHttpsRequest,
  normalizeDevHttpsOrigin,
  isDevWorkbenchRequest,
  isLocalNetworkReadRequest,
  isSameOriginRequest,
  readJsonBody,
  isLoopbackHostHeader,
  isLoopbackRemoteAddress,
} from './devServerSecurity.mjs'

test('the optional HTTPS proxy origin accepts one domain and fails closed on invalid configuration', () => {
  assert.equal(normalizeDevHttpsOrigin(undefined), '')
  assert.equal(normalizeDevHttpsOrigin(''), '')
  assert.equal(normalizeDevHttpsOrigin('https://DEV.example.test:443/'), 'https://dev.example.test')
  assert.equal(normalizeDevHttpsOrigin('https://dev.example.test:8443'), 'https://dev.example.test:8443')
  for (const value of [
    'http://dev.example.test', 'https://192.168.0.133', 'https://localhost',
    'https://user:password@dev.example.test', 'https://dev.example.test/__dev',
    'https://dev.example.test?x=1', 'https://dev.example.test#x',
    'https://dev.example.test,https://evil.example', ['https://dev.example.test'],
  ]) assert.throws(() => normalizeDevHttpsOrigin(value), /PLUSH_DEV_HTTPS_ORIGIN/u)
})

test('HTTPS proxy trust requires explicit configuration, loopback sockets and an overwritten private client address', () => {
  const origin = 'https://dev.example.test'
  const makeRequest = (changes = {}) => ({
    method: 'GET',
    headers: {
      host: 'dev.example.test',
      'x-forwarded-proto': 'https',
      'x-forwarded-for': '192.168.0.66',
      ...changes.headers,
    },
    socket: { localAddress: '127.0.0.1', remoteAddress: '127.0.0.1', ...changes.socket },
  })
  const proxy = createDevHttpsProxyMiddleware(origin)
  const validate = (request, middleware = proxy) => {
    let continued = false
    middleware(request, {}, () => { continued = true })
    assert.equal(continued, true)
    return request
  }
  const request = makeRequest()
  assert.equal(isDevWorkbenchRequest(request), false)
  validate(request)
  assert.equal(isLocalNetworkReadRequest(request), true)
  assert.equal(isDevWorkbenchHttpsRequest(request), true)
  assert.equal(isDevWorkbenchRequest(request), true)
  assert.equal(isSameOriginRequest(request), false)
  request.method = 'POST'
  request.headers.origin = origin
  request.headers['sec-fetch-site'] = 'same-origin'
  assert.equal(isSameOriginRequest(request), true)
  request.headers.origin = 'http://dev.example.test'
  assert.equal(isDevWorkbenchRequest(request), false)
  assert.equal(isSameOriginRequest(request), false)
  for (const changes of [
    { socket: { remoteAddress: '192.168.0.66' } },
    { socket: { remoteAddress: '8.8.8.8' } },
    { socket: { localAddress: '192.168.0.133' } },
    { headers: { host: 'evil.example' } },
    { headers: { host: 'dev.example.test:8443' } },
    { headers: { 'x-forwarded-proto': undefined } },
    { headers: { 'x-forwarded-proto': 'http' } },
    { headers: { 'x-forwarded-proto': ['https'] } },
    { headers: { 'x-forwarded-for': undefined } },
    { headers: { 'x-forwarded-for': '8.8.8.8' } },
    { headers: { 'x-forwarded-for': '8.8.8.8, 192.168.0.66' } },
    { headers: { 'x-forwarded-for': ['192.168.0.66'] } },
    { headers: { 'sec-fetch-site': 'cross-site' } },
    { headers: { origin: 'https://evil.example' } },
    { headers: { referer: 'https://evil.example/' } },
  ]) {
    const changed = validate(makeRequest(changes))
    assert.equal(isDevWorkbenchRequest(changed), false, JSON.stringify(changes))
    assert.equal(isLocalNetworkReadRequest(changed), false, JSON.stringify(changes))
    assert.equal(isDevWorkbenchHttpsRequest(changed), false, JSON.stringify(changes))
  }
  assert.equal(isDevWorkbenchRequest(validate(makeRequest(), createDevHttpsProxyMiddleware(''))), false)
  const customPort = makeRequest({ headers: { host: 'dev.example.test:8443', origin: 'https://dev.example.test:8443' } })
  validate(customPort, createDevHttpsProxyMiddleware('https://dev.example.test:8443'))
  assert.equal(isSameOriginRequest(customPort), true)
})

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
  ]) {
    assert.equal(
      isSameOriginRequest({ headers: { ...headers, ...changed } }),
      false,
      JSON.stringify(changed)
    )
  }
})

test('local-network reads bind a private caller to the numeric listening address', () => {
  const request = {
    method: 'GET',
    headers: { host: '192.168.0.133:15200' },
    socket: {
      localAddress: '192.168.0.133',
      localPort: 15200,
      remoteAddress: '192.168.0.20',
    },
  }
  assert.equal(isLocalNetworkReadRequest(request), true)
  assert.equal(
    isLocalNetworkReadRequest({
      ...request,
      socket: {
        ...request.socket,
        localAddress: '::ffff:192.168.0.133',
        remoteAddress: '::ffff:192.168.0.20',
      },
      headers: {
        ...request.headers,
        referer: 'http://192.168.0.133:15200/__dev/customer-config',
      },
    }),
    true
  )
  for (const socket of [
    { remoteAddress: '8.8.8.8' },
    { remoteAddress: '172.32.0.1' },
    { remoteAddress: '' },
    { localAddress: '192.168.0.134' },
    { localAddress: '0.0.0.0' },
    { localPort: 15201 },
  ]) {
    assert.equal(
      isLocalNetworkReadRequest({
        ...request,
        socket: { ...request.socket, ...socket },
      }),
      false,
      JSON.stringify(socket)
    )
  }
  assert.equal(isLocalNetworkReadRequest({ ...request, method: 'POST' }), false)
  for (const host of [
    'evil.example:15200',
    '192.168.0.133.evil:15200',
    '192.168.0.133:15201',
    '192.168.0.133:0',
    '192.168.0.133:65536',
    '192.168.0.133@evil.example',
    ['192.168.0.133:15200'],
  ]) {
    assert.equal(
      isLocalNetworkReadRequest({ ...request, headers: { host } }),
      false,
      JSON.stringify(host)
    )
  }
})

test('local-network reads reject cross-origin metadata while supporting HTTP LAN fetches', () => {
  const request = {
    method: 'GET',
    headers: {
      host: '192.168.0.133:15200',
      origin: 'http://192.168.0.133:15200',
      referer:
        'http://192.168.0.133:15200/__dev/customer-config?customer=yoyoosun',
      'sec-fetch-site': 'same-origin',
    },
    socket: {
      localAddress: '192.168.0.133',
      localPort: 15200,
      remoteAddress: '192.168.0.20',
    },
  }
  assert.equal(isLocalNetworkReadRequest(request), true)
  assert.equal(
    isLocalNetworkReadRequest({
      ...request,
      headers: { ...request.headers, 'sec-fetch-site': undefined },
    }),
    true
  )
  for (const headers of [
    { origin: 'null' },
    { origin: 'http://evil.example' },
    { origin: 'http://192.168.0.133:15201' },
    { origin: 'http://192.168.0.133:15200/path' },
    { origin: 'http://user@192.168.0.133:15200' },
    { origin: ['http://192.168.0.133:15200'] },
    { referer: 'http://evil.example/page' },
    { referer: 'http://192.168.0.133:15201/__dev' },
    { 'sec-fetch-site': 'cross-site' },
    { 'sec-fetch-site': 'same-site' },
  ]) {
    assert.equal(
      isLocalNetworkReadRequest({
        ...request,
        headers: { ...request.headers, ...headers },
      }),
      false,
      JSON.stringify(headers)
    )
  }
})

test('LAN workbench actions require the listening address and matching origin', () => {
  const request = {
    method: 'POST',
    headers: {
      host: '192.168.0.133:15200',
      origin: 'http://192.168.0.133:15200',
    },
    socket: {
      localAddress: '192.168.0.133',
      localPort: 15200,
      remoteAddress: '192.168.0.20',
    },
  }
  assert.equal(isDevWorkbenchRequest(request), true)
  assert.equal(isSameOriginRequest(request), true)
  for (const method of ['PUT', 'DELETE', 'PATCH']) {
    assert.equal(isDevWorkbenchRequest({ ...request, method }), false)
  }
  for (const headers of [
    { origin: undefined },
    { origin: 'null' },
    { origin: 'https://192.168.0.133:15200' },
    { origin: 'http://192.168.0.133:15201' },
    { origin: 'http://evil.example' },
    { 'sec-fetch-site': 'none' },
    { 'sec-fetch-site': 'cross-site' },
  ]) {
    assert.equal(
      isSameOriginRequest({
        ...request,
        headers: { ...request.headers, ...headers },
      }),
      false,
      JSON.stringify(headers)
    )
  }
  for (const socket of [
    { remoteAddress: '8.8.8.8' },
    { localAddress: '192.168.0.134' },
    { localPort: 15201 },
  ]) {
    const changed = { ...request, socket: { ...request.socket, ...socket } }
    assert.equal(isDevWorkbenchRequest(changed), false)
    assert.equal(isSameOriginRequest(changed), false)
  }
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
    (async function* interruptedInput() {
      yield '{'
      throw new Error('interrupted')
    })()
  )
  await assert.rejects(
    readJsonBody(interrupted, { maxBytes: 16 }),
    /interrupted/u
  )
})
