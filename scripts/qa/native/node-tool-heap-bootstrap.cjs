const { readFileSync, openSync, readSync, closeSync } = require('node:fs')
const { createHash } = require('node:crypto')
const path = require('node:path')
const config = JSON.parse(readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'))
const digest = createHash('sha256')
const buffer = Buffer.alloc(1024 * 1024)
const descriptor = openSync(config.realNode, 'r')
try {
  let length
  while ((length = readSync(descriptor, buffer, 0, buffer.length, null)) > 0) {
    digest.update(buffer.subarray(0, length))
  }
} finally {
  closeSync(descriptor)
}
if (digest.digest('hex') !== config.runtimeSha) {
  process.stderr.write('[qa:tool-node] status=incomplete reason=runtime-revalidation-required\n')
  process.exit(75)
}
process.execPath = config.publicNode
process.argv[0] = config.publicNode
