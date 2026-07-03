import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'

function contentTypeFor(filePath) {
  if (filePath.endsWith('.svg')) {
    return 'image/svg+xml'
  }
  if (filePath.endsWith('.png')) {
    return 'image/png'
  }
  if (filePath.endsWith('.jpg') || filePath.endsWith('.jpeg')) {
    return 'image/jpeg'
  }
  if (filePath.endsWith('.webp')) {
    return 'image/webp'
  }
  return 'application/octet-stream'
}

export function normalizeDevCustomerKey(value) {
  const customerKey = String(value || '').trim()
  if (!customerKey) {
    return ''
  }
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(customerKey)) {
    throw new Error(`invalid dev customer key: ${customerKey}`)
  }
  return customerKey
}

export function createDevCustomerConfigPlugin({ projectRoot } = {}) {
  const customerKey = normalizeDevCustomerKey(process.env.ERP_DEV_CUSTOMER_KEY)

  if (!customerKey) {
    return null
  }

  const configRoot = path.resolve(projectRoot || process.cwd(), 'config')
  const customersRoot = path.join(configRoot, 'customers')
  const customerDir = path.join(customersRoot, customerKey)
  const customerConfigPath = path.join(
    customerDir,
    'customer-config.example.js'
  )
  const customerAssetsDir = path.join(customerDir, 'assets')

  return {
    name: 'plush-dev-customer-config',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const requestUrl = new URL(
          request.url || '/',
          `http://${request.headers.host || 'localhost'}`
        )

        if (requestUrl.pathname === '/customer-config.js') {
          if (!fs.existsSync(customerConfigPath)) {
            response.writeHead(404, {
              'content-type': 'text/plain; charset=utf-8',
            })
            response.end(`customer config not found: ${customerKey}`)
            return
          }

          response.writeHead(200, {
            'cache-control': 'no-cache',
            'content-type': 'text/javascript; charset=utf-8',
          })
          response.end(await fsp.readFile(customerConfigPath, 'utf8'))
          return
        }

        const assetPrefix = `/customer-assets/${customerKey}/`
        if (requestUrl.pathname.startsWith(assetPrefix)) {
          const relativeAssetPath = requestUrl.pathname.slice(
            assetPrefix.length
          )
          const assetPath = path.resolve(customerAssetsDir, relativeAssetPath)
          const allowedRoot = `${path.resolve(customerAssetsDir)}${path.sep}`

          if (!assetPath.startsWith(allowedRoot) || !fs.existsSync(assetPath)) {
            response.writeHead(404, {
              'content-type': 'text/plain; charset=utf-8',
            })
            response.end('customer asset not found')
            return
          }

          response.writeHead(200, {
            'cache-control': 'no-cache',
            'content-type': contentTypeFor(assetPath),
          })
          fs.createReadStream(assetPath).pipe(response)
          return
        }

        next()
      })
    },
  }
}
