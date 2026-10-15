import net from 'node:net'
import { findAvailableDevAuxPort } from '../../scripts/dev-ports.mjs'

export function isCodexDevSession(env = process.env) {
  return (
    Boolean(String(env.CODEX_THREAD_ID || '').trim()) ||
    ['1', 'true'].includes(env.CODEX_CI)
  )
}

export function resolveERPDevServerPort(rawPort, ports) {
  const normalized = String(rawPort || '').trim()
  const port = normalized ? Number(normalized) : ports.web
  const auxEnd = ports.auxStart + 99
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error('ERP_VITE_PORT must be an integer between 1024 and 65535')
  }
  if (
    port !== ports.web &&
    port !== ports.style &&
    (port < ports.auxStart || port > auxEnd)
  ) {
    throw new Error(
      `ERP_VITE_PORT=${port} must use web=${ports.web}, style=${ports.style}, or auxiliary range ${ports.auxStart}-${auxEnd}`
    )
  }
  return port
}

export async function selectWebDevPort({
  ports,
  env = process.env,
  isolated = isCodexDevSession(env),
  findPort = findAvailableDevAuxPort,
}) {
  if (String(env.ERP_VITE_PORT || '').trim()) {
    return resolveERPDevServerPort(env.ERP_VITE_PORT, ports)
  }
  return isolated ? findPort(ports) : ports.web
}

export function resolveERPHMRClientPort(rawPort, serverPort) {
  const normalized = String(rawPort || '').trim()
  const port = normalized ? Number(normalized) : serverPort
  if (!Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error(
      'ERP_VITE_HMR_CLIENT_PORT must be an integer between 1024 and 65535'
    )
  }
  if (port !== serverPort) {
    throw new Error(
      `ERP_VITE_HMR_CLIENT_PORT=${port} must match ERP_VITE_PORT=${serverPort}`
    )
  }
  return port
}

const defaultMaxPortProbeCount = 100

function canListenOnHost(port, host) {
  return new Promise((resolve, reject) => {
    const server = net.createServer()

    server.once('error', (error) => {
      if (error.code === 'EADDRINUSE' || error.code === 'EACCES') {
        resolve(false)
        return
      }
      reject(error)
    })

    server.once('listening', () => {
      server.close(() => resolve(true))
    })

    server.listen(Number(port), host)
  })
}

export async function canListenOnPort(port) {
  if (!(await canListenOnHost(port, '127.0.0.1'))) return false
  return canListenOnHost(port, '0.0.0.0')
}

export async function resolveAvailablePort(
  startPort,
  maxPortProbeCount = defaultMaxPortProbeCount
) {
  const basePort = Number(startPort)

  for (let offset = 0; offset < maxPortProbeCount; offset += 1) {
    const port = basePort + offset
    if (port > 65535) {
      break
    }
    if (await canListenOnPort(port)) {
      return String(port)
    }
  }

  throw new Error(
    `no available port found from ${startPort} within ${maxPortProbeCount} ports`
  )
}
