import assert from 'node:assert/strict'
import test from 'node:test'
import {
  buildCanonicalLocalDevUrl,
  redirectToCanonicalLocalDevHost,
} from './localDevThemeOrigin.mjs'

test('buildCanonicalLocalDevUrl: rewrites localhost to 127.0.0.1 and preserves path', () => {
  assert.equal(
    buildCanonicalLocalDevUrl({
      hash: '#section',
      hostname: 'localhost',
      pathname: '/__dev/testing',
      port: '5175',
      protocol: 'http:',
      search: '?q=qa',
    }),
    'http://127.0.0.1:5175/__dev/testing?q=qa#section'
  )
})

test('buildCanonicalLocalDevUrl: leaves 127.0.0.1 and non-local hosts untouched', () => {
  assert.equal(
    buildCanonicalLocalDevUrl({
      hostname: '127.0.0.1',
      pathname: '/__dev/testing',
      port: '5175',
      protocol: 'http:',
    }),
    ''
  )
  assert.equal(
    buildCanonicalLocalDevUrl({
      hostname: 'erp.example.com',
      pathname: '/__dev/testing',
      port: '',
      protocol: 'https:',
    }),
    ''
  )
})

test('redirectToCanonicalLocalDevHost: redirects only alias local dev host', () => {
  const aliasLocation = {
    hash: '',
    hostname: 'localhost',
    href: 'http://localhost:5175/__dev/customer-config?customer=yoyoosun',
    pathname: '/__dev/customer-config',
    port: '5175',
    protocol: 'http:',
    search: '?customer=yoyoosun',
    replace(nextUrl) {
      this.href = nextUrl
    },
  }
  assert.equal(
    redirectToCanonicalLocalDevHost({
      location: aliasLocation,
    }),
    true
  )
  assert.equal(
    aliasLocation.href,
    'http://127.0.0.1:5175/__dev/customer-config?customer=yoyoosun'
  )

  assert.equal(
    redirectToCanonicalLocalDevHost({
      location: {
        hostname: '127.0.0.1',
        pathname: '/__dev/customer-config',
        replace() {
          throw new Error('should not redirect 127.0.0.1')
        },
      },
    }),
    false
  )
})
