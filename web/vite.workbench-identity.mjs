import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { assertRepositoryIdentityEqual, readRepositoryIdentity } from '../scripts/qa/lib/repository-identity.mjs'

export function workbenchBuildIdentityPlugin(root) {
  let repository
  return {
    name: 'plush-workbench-build-identity',
    async buildStart() { repository = await readRepositoryIdentity(root) },
    async generateBundle() {
      assertRepositoryIdentityEqual(repository, await readRepositoryIdentity(root))
      this.emitFile({ type: 'asset', fileName: 'workbench-build.json', source: JSON.stringify({
        kind: 'plush.workbench-build', repository,
        nodeVersion: process.versions.node,
        lockSha256: createHash('sha256').update(await readFile(path.join(root, 'web/pnpm-lock.yaml'))).digest('hex'),
      }) })
    },
  }
}
