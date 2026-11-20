import { execFile } from 'node:child_process'
import path from 'node:path'
import { promisify } from 'node:util'
import { normalizeRPCContractReview } from '../src/dev-workbench/config/devRPCContractReview.mjs'

const execFileAsync = promisify(execFile)

export async function readDevRPCContractReview(projectRoot, { range = 'worktree', execute = execFileAsync } = {}) {
  if (!['worktree', 'staged'].includes(range)) throw new Error('接口合同比较范围无效')
  const args = [path.join(projectRoot, 'scripts/gen-public-contracts.mjs'), '--review', '--json', ...(range === 'staged' ? ['--staged'] : [])]
  const result = await execute(process.execPath, args, { cwd: projectRoot, encoding: 'utf8', timeout: 150_000, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' } })
  return normalizeRPCContractReview(JSON.parse(result.stdout))
}
