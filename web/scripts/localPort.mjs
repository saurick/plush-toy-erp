import net from 'node:net'

const defaultMaxPortProbeCount = 100

export function canListenOnPort(port) {
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

    server.listen(Number(port), '0.0.0.0')
  })
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
