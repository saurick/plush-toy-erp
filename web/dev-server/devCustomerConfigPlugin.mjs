import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { CUSTOMER_DRAFT_JSON_FILE, customerDraftWebScript } from '../../config/customers/customerDraftConfig.mjs'

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

export function createDevCustomerConfigPlugin({ projectRoot, packageSourcePath } = {}) {
  const customerKey = normalizeDevCustomerKey(process.env.ERP_DEV_CUSTOMER_KEY)

  if (!customerKey) {
    return null
  }

  const configRoot = path.resolve(projectRoot || process.cwd(), 'config')
  const customersRoot = path.join(configRoot, 'customers')
  const customerDir = path.join(customersRoot, customerKey)
  const jsonDraft = packageSourcePath?.endsWith(`/${CUSTOMER_DRAFT_JSON_FILE}`)
  const customerConfigPath = path.join(
    customerDir,
    jsonDraft ? CUSTOMER_DRAFT_JSON_FILE : 'customer-config.example.js'
  )
  const customerAssetsDir = path.join(customerDir, 'public-assets')

  return {
    name: 'plush-dev-customer-config',
    apply: 'serve',
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

          try {
            if (jsonDraft && (!(await fsp.lstat(customerDir)).isDirectory() ||
              !(await fsp.lstat(customerConfigPath)).isFile())) {
              throw new Error('invalid draft file')
            }
            const source = await fsp.readFile(customerConfigPath, 'utf8')
            const script = jsonDraft ? customerDraftWebScript(JSON.parse(source), customerKey) : source
            response.writeHead(200, {
              'cache-control': 'no-cache',
              'content-type': 'text/javascript; charset=utf-8',
            })
            response.end(script)
          } catch (error) {
            response.writeHead(error?.code === 'ENOENT' ? 404 : 422, {
              'cache-control': 'no-store',
              'content-type': 'text/plain; charset=utf-8',
            })
            response.end('客户前端配置无法读取或校验未通过。')
          }
          return
        }

        const assetPrefix = `/customer-assets/${customerKey}/`
        if (requestUrl.pathname.startsWith(assetPrefix)) {
          const relativeAssetPath = requestUrl.pathname.slice(
            assetPrefix.length
          )
          const assetPath = path.resolve(customerAssetsDir, relativeAssetPath)
          const allowedRoot = `${path.resolve(customerAssetsDir)}${path.sep}`

          let regularAsset = false
          try {
            const stats = fs.lstatSync(assetPath)
            regularAsset =
              stats.isFile() &&
              !stats.isSymbolicLink() &&
              fs
                .realpathSync(assetPath)
                .startsWith(`${fs.realpathSync(customerAssetsDir)}${path.sep}`)
          } catch {
            /* Missing or inaccessible assets are not served. */
          }
          if (!assetPath.startsWith(allowedRoot) || !regularAsset) {
            response.writeHead(404, {
              'content-type': 'text/plain; charset=utf-8',
            })
            response.end('customer asset not found')
            return
          }

          const stream = fs.createReadStream(assetPath)
          stream.once('error', () => {
            if (response.headersSent) response.destroy()
            else {
              response.writeHead(404, {
                'content-type': 'text/plain; charset=utf-8',
              })
              response.end('customer asset not found')
            }
          })
          stream.once('open', () => {
            response.writeHead(200, {
              'cache-control': 'no-cache',
              'content-type': contentTypeFor(assetPath),
            })
            stream.pipe(response)
          })
          return
        }

        next()
      })
    },
  }
}
