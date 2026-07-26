import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'

const repoRoot = path.resolve(new URL('../..', import.meta.url).pathname)
const scriptPath = path.join(repoRoot, 'scripts/git-hooks/commit-msg.sh')

function checkSubject(subject) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'commit-msg-hook-'))
  const messagePath = path.join(root, 'COMMIT_EDITMSG')
  fs.writeFileSync(messagePath, `${subject}\n`)
  return spawnSync('bash', [scriptPath, messagePath], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
}

test('commit-msg exempts only real generated Git subjects', () => {
  for (const subject of [
    'Merge branch \'main\'',
    'Revert "fix: broken change"',
    'fixup! feat: add workflow',
    'squash! fix: correct workflow',
  ]) {
    assert.equal(checkSubject(subject).status, 0, subject)
  }
  for (const subject of ['MergeSort cleanup', 'Reverted config']) {
    const result = checkSubject(subject)
    assert.equal(result.status, 1, subject)
    assert.match(result.stdout, /提交信息不符合规范/)
  }
})

test('commit-msg keeps Conventional Commits behavior', () => {
  assert.equal(checkSubject('fix(hooks): 收紧标题豁免').status, 0)
  assert.equal(checkSubject('plain title').status, 1)
})
