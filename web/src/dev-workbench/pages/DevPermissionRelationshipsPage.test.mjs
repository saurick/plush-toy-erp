import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import { transformWithEsbuild } from 'vite'

const source = readFileSync(
  fileURLToPath(
    new URL('./DevPermissionRelationshipsPage.jsx', import.meta.url)
  ),
  'utf8'
)
const modelSource = readFileSync(
  fileURLToPath(
    new URL('../config/devPermissionRelationshipGraph.mjs', import.meta.url)
  ),
  'utf8'
)

test('dev permission relationship page remains valid JSX', async () => {
  await transformWithEsbuild(source, 'DevPermissionRelationshipsPage.jsx', {
    loader: 'jsx',
    jsx: 'automatic',
  })
})

test('dev permission relationship page reads existing truth sources without writing RBAC', () => {
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

test('permission graph loads on the dev page and hides technical source on render failure', () => {
  assert.match(
    source,
    /<DevPageNav sourcePath="docs\/product\/配置与权限策略\.md"/u
  )
  assert.match(source, /loadBaseData\(\)/u)
  assert.match(source, /showSourceOnError=\{false\}/u)
  assert.match(source, /label="权限生效关系图"/u)
  assert.match(source, /erp-dev-workspace-page/u)
  assert.match(source, /权限关系 \/ Effective Access/u)
  assert.match(source, /href="\/erp\/system\/permissions"/u)
  assert.doesNotMatch(source, /<Modal\b|permissionRelationshipOpen/u)
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
  assert.match(source, /不包含任务、单据、流程运行或业务事实/u)
  assert.doesNotMatch(modelSource, /\.phone\b/u)
  const pageMarkup = source.slice(source.lastIndexOf('\n  return ('))
  assert.doesNotMatch(pageMarkup, /permission_key|role_key|config_revision/u)
})

test('permission relationship implementation stays under the dev-only tree', () => {
  assert.match(source, /\.\.\/styles\/dev-permission-relationships\.css/u)
  assert.doesNotMatch(source, /\.\.\/\.\.\/erp\/components/u)
})
