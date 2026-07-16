import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const source = readFileSync(
  fileURLToPath(new URL('./DashboardPage.jsx', import.meta.url)),
  'utf8'
)

test('workbench keeps the explicit view button and opens plain rows on double-click', () => {
  assert.match(source, /openDashboardItemOnDoubleClick/u)
  assert.match(source, /erp-workbench-task-row--openable/u)
  assert.match(source, /data-open-on-double-click['"]?:\s*['"]true['"]/u)
  assert.match(
    source,
    /onDoubleClick:\s*\(event\)\s*=>[\s\S]{0,180}openDashboardItemOnDoubleClick\(event,[\s\S]{0,180}openTaskDrawer\(record\)/u
  )
  assert.match(source, />\s*查看\s*</u)
  assert.match(source, /电脑端双击可直接打开详情/u)
})

test('task board keeps selection on click and opens the same detail surface on double-click', () => {
  assert.match(source, /onClick=\{\(\) => onSelectTask\(task\)\}/u)
  assert.match(
    source,
    /onDoubleClick=\{\(event\)\s*=>[\s\S]{0,160}openDashboardItemOnDoubleClick\(event,[\s\S]{0,120}onOpenTask\(task\)/u
  )
  assert.match(source, /title="单击选中，双击查看任务详情"/u)
  assert.match(source, /电脑端可双击任务卡快速查看详情/u)
})
