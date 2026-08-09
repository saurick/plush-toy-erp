import assert from 'node:assert/strict'
import fs from 'node:fs'
import test from 'node:test'

const source = fs.readFileSync(
  new URL('./HistoryRecordsPage.jsx', import.meta.url),
  'utf8'
)

test('历史记录中心按菜单与读取权限选择真实来源并固定只读 history 合同', () => {
  assert.match(source, /getAvailableHistorySources/u)
  assert.match(source, /visibleMenuPaths/u)
  assert.match(source, /hasActionPermission/u)
  assert.match(source, /buildHistoryListParams/u)
  assert.match(source, /只读查询/u)
})

test('历史记录中心只提供详情与所属模块跳转，不提供跨对象写动作', () => {
  assert.match(source, /查看详情/u)
  assert.match(source, /前往所属模块/u)
  assert.doesNotMatch(source, /archive[A-Z]|restore[A-Z]|delete[A-Z]/u)
  assert.doesNotMatch(source, /一键归档|一键恢复|移入回收站/u)
})
