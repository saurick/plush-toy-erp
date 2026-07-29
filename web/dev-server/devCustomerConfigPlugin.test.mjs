import assert from 'node:assert/strict'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { Writable } from 'node:stream'
import test from 'node:test'

import {
  createDevCustomerConfigPlugin,
  normalizeDevCustomerKey,
} from './devCustomerConfigPlugin.mjs'

test('normalizeDevCustomerKey accepts stable customer keys', () => {
  assert.equal(normalizeDevCustomerKey(' yoyoosun '), 'yoyoosun')
  assert.equal(normalizeDevCustomerKey('demo_customer-01'), 'demo_customer-01')
})

test('normalizeDevCustomerKey rejects path-like customer keys', () => {
  assert.throws(
    () => normalizeDevCustomerKey('../yoyoosun'),
    /invalid dev customer key/
  )
  assert.throws(
    () => normalizeDevCustomerKey('customers/yoyoosun'),
    /invalid dev customer key/
  )
  assert.throws(
    () => normalizeDevCustomerKey('永绅'),
    /invalid dev customer key/
  )
})

async function createFixtureProject(t) {
  const projectRoot = await fsp.mkdtemp(
    path.join(os.tmpdir(), 'plush-dev-customer-config-')
  )
  t.after(async () => {
    await fsp.rm(projectRoot, {
      recursive: true,
      force: true,
    })
  })

  const customerDir = path.join(projectRoot, 'config/customers/yoyoosun')
  const assetsDir = path.join(customerDir, 'public-assets')

  await fsp.mkdir(assetsDir, {
    recursive: true,
  })
  await fsp.writeFile(
    path.join(customerDir, 'customer-config.example.js'),
    'window.__PLUSH_ERP_CUSTOMER_CONFIG__ = { customerKey: "yoyoosun" }\n'
  )
  await fsp.writeFile(
    path.join(assetsDir, 'favicon-yoyoosun.svg'),
    '<svg xmlns="http://www.w3.org/2000/svg" />\n'
  )
  await fsp.writeFile(path.join(customerDir, 'secret.txt'), 'not an asset\n')

  return projectRoot
}

function capturePluginMiddleware(plugin) {
  let middleware = null

  plugin.configureServer({
    middlewares: {
      use(nextMiddleware) {
        middleware = nextMiddleware
      },
    },
  })

  assert.equal(typeof middleware, 'function')
  return middleware
}

function requestMiddleware(middleware, requestUrl) {
  const chunks = []

  class CaptureResponse extends Writable {
    constructor() {
      super()
      this.statusCode = null
      this.headers = null
      this.finishedByMiddleware = false
      this.nextCalled = false
      this.body = ''
    }

    writeHead(statusCode, headers) {
      this.statusCode = statusCode
      this.headers = headers
    }

    _write(chunk, _encoding, callback) {
      chunks.push(Buffer.from(chunk))
      callback()
    }

    end(chunk, encoding, callback) {
      if (chunk) {
        chunks.push(Buffer.from(chunk, encoding))
      }
      this.finishedByMiddleware = true
      super.end(callback)
    }
  }

  const response = new CaptureResponse()

  return new Promise((resolve, reject) => {
    response.once('finish', () => {
      response.body = Buffer.concat(chunks).toString('utf8')
      resolve(response)
    })

    const next = () => {
      response.nextCalled = true
      resolve(response)
    }

    const done = () => {
      if (response.finishedByMiddleware) {
        response.body = Buffer.concat(chunks).toString('utf8')
        resolve(response)
      }
    }

    try {
      const result = middleware(
        {
          url: requestUrl,
          headers: {
            host: 'localhost',
          },
        },
        response,
        next
      )

      Promise.resolve(result).then(done, reject)
    } catch (error) {
      reject(error)
    }
  })
}

test('createDevCustomerConfigPlugin serves yoyoosun config and assets without exposing sibling files', async (t) => {
  const originalCustomerKey = process.env.ERP_DEV_CUSTOMER_KEY
  const projectRoot = await createFixtureProject(t)

  process.env.ERP_DEV_CUSTOMER_KEY = 'yoyoosun'
  t.after(() => {
    if (originalCustomerKey === undefined) {
      delete process.env.ERP_DEV_CUSTOMER_KEY
    } else {
      process.env.ERP_DEV_CUSTOMER_KEY = originalCustomerKey
    }
  })

  const plugin = createDevCustomerConfigPlugin({ projectRoot })
  const middleware = capturePluginMiddleware(plugin)

  const configResponse = await requestMiddleware(
    middleware,
    '/customer-config.js'
  )
  assert.equal(configResponse.statusCode, 200)
  assert.match(configResponse.body, /customerKey: "yoyoosun"/u)

  const assetResponse = await requestMiddleware(
    middleware,
    '/customer-assets/yoyoosun/favicon-yoyoosun.svg'
  )
  assert.equal(assetResponse.statusCode, 200)
  assert.equal(assetResponse.headers['content-type'], 'image/svg+xml')

  const traversalResponse = await requestMiddleware(
    middleware,
    '/customer-assets/yoyoosun/secret.txt'
  )
  assert.equal(traversalResponse.statusCode, 404)
  assert.match(traversalResponse.body, /customer asset not found/u)

  assert.equal(
    fs.existsSync(
      path.join(projectRoot, 'config/customers/yoyoosun/secret.txt')
    ),
    true
  )
})
