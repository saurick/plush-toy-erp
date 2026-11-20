const { spawnSync } = require('node:child_process')
const { registerHooks } = require('node:module')
const { readFileSync } = require('node:fs')
const path = require('node:path')

const config = JSON.parse(readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'))
const protectedProcess = process.env.PLUSH_NODE_GUARD_PID === String(process.pid)
if (protectedProcess) {
  const result = spawnSync('/usr/bin/sudo', [
    '-n', config.helper, '--plush-guard-activate', String(process.pid),
    process.env.PLUSH_NODE_GUARD_SLOT, process.env.PLUSH_NODE_GUARD_UNITS,
    process.env.PLUSH_NODE_GUARD_HOLDER,
  ], { encoding: 'utf8', timeout: 5000, maxBuffer: 4096 })
  if (result.error || result.status !== 0) {
    process.stderr.write('[qa:node-kernel] status=incomplete reason=kernel-activation-failed\n')
    if (result.stderr) process.stderr.write(result.stderr.slice(0, 2048))
    process.exit(75)
  }
  const evidence = JSON.parse(result.stdout)
  if (!evidence.fatal || !Number.isInteger(evidence.kernelLimitMiB)) {
    process.stderr.write('[qa:node-kernel] status=incomplete reason=invalid-kernel-readback\n')
    process.exit(75)
  }
  process.env.PLUSH_NODE_KERNEL_PID = String(process.pid)
  process.env.PLUSH_NODE_KERNEL_LIMIT_MIB = String(evidence.kernelLimitMiB)
}

process.execPath = config.publicNode
process.argv[0] = config.publicNode
registerHooks({
  resolve(specifier, context, nextResolve) {
    if ((specifier === 'node:test' || specifier.startsWith('node:test/')) && !protectedProcess) {
      throw new Error('[qa:node-kernel] Test execution requires the protected Node entry; use node --test or the project test gate')
    }
    return nextResolve(specifier, context)
  },
})
