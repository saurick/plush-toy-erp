import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { transformWithEsbuild } from 'vite'

const source = readFileSync(
  fileURLToPath(
    new URL('./PermissionRelationshipGraphModal.jsx', import.meta.url)
  ),
  'utf8'
)
const modelSource = readFileSync(
  fileURLToPath(
    new URL('../utils/permissionRelationshipGraph.mjs', import.meta.url)
  ),
  'utf8'
)

test('permission relationship modal remains valid JSX', async () => {
  await transformWithEsbuild(source, 'PermissionRelationshipGraphModal.jsx', {
    loader: 'jsx',
    jsx: 'automatic',
  })
})

test('permission relationship modal reads existing truth sources without writing RBAC', () => {
  assert.match(source, /adminRpc\.call\('list', \{\}\)/u)
  assert.match(source, /adminRpc\.call\('rbac_options', \{\}\)/u)
  assert.match(source, /adminRpc\.call\('effective_role_access'/u)
  assert.match(source, /getApprovalSettings\(\{\}\)/u)
  assert.doesNotMatch(
    source,
    /set_roles|set_role_settings|publishApprovalSettings|applyApprovalSettings/u
  )
  assert.match(source, /关系图是只读结果，不是新的权限配置入口/u)
})

test('permission graph loads only while open and hides technical source on render failure', () => {
  assert.match(source, /if \(!open\)/u)
  assert.match(source, /loadBaseData\(\)/u)
  assert.match(source, /showSourceOnError=\{false\}/u)
  assert.match(source, /label="权限生效关系图"/u)
  assert.match(source, /destroyOnHidden/u)
})

test('permission graph exposes only permission-adjacent relationships', () => {
  for (const label of [
    '账号',
    '岗位',
    '功能',
    '页面',
    '仓库数据范围',
    '审批责任',
  ]) {
    assert.match(source + modelSource, new RegExp(label, 'u'))
  }
  assert.match(source, /这里不包含任务、单据或业务运行状态/u)
  assert.doesNotMatch(modelSource, /\.phone\b/u)
  const modalMarkup = source.slice(
    source.lastIndexOf('\n  return (\n    <Modal')
  )
  assert.doesNotMatch(modalMarkup, /permission_key|role_key|config_revision/u)
})
