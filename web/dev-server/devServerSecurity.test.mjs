import assert from 'node:assert/strict'
import test from 'node:test'

import {
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
