import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const listScreenSource = readFileSync(
  new URL('./MobileTaskListScreen.jsx', import.meta.url),
  'utf8'
)
const roleTaskPageSource = readFileSync(
  new URL('../pages/MobileRoleTasksPage.jsx', import.meta.url),
  'utf8'
)

test('mobile task filter cold load keeps full skeleton exclusive to the first page load', () => {
  assert.match(
    roleTaskPageSource,
    /const activeViewInitialLoading =\s*loading &&\s*!activeTaskSlot\.loaded &&\s*activeTaskSlot\.items\.length === 0/u
  )
  assert.match(
    roleTaskPageSource,
    /const hasLoadedTaskView = Object\.values\(taskSlots\)\.some\(\s*\(slot\) => slot\.loaded\s*\)/u
  )
  assert.match(
    roleTaskPageSource,
    /const initialLoading = activeViewInitialLoading && !hasLoadedTaskView/u
  )
  assert.match(
    listScreenSource,
    /initialLoading \? \(\s*<MobileTaskListSkeleton/u
  )
  assert.equal(
    (listScreenSource.match(/<MobileTaskListSkeleton/gu) || []).length,
    1
  )
})

test('mobile task filter cold load scopes busy state and feedback to the task list', () => {
  assert.match(
    listScreenSource,
    /const taskListLoading =\s*loading && !activeViewHasData && !initialLoading/u
  )
  assert.match(listScreenSource, /data-testid="mobile-loaded-task-overview"/u)
  assert.match(listScreenSource, /data-testid="mobile-role-task-filters"/u)
  assert.match(listScreenSource, /data-testid="mobile-role-bottom-nav"/u)
  assert.match(listScreenSource, /data-testid="mobile-role-task-list"/u)
  assert.match(
    listScreenSource,
    /data-testid="mobile-role-task-list"[\s\S]*?aria-busy=\{taskListLoading \? 'true' : 'false'\}/u
  )
  assert.match(
    listScreenSource,
    /data-testid="mobile-role-task-list-loading"[\s\S]*?role="status"[\s\S]*?aria-live="polite"/u
  )
  assert.match(listScreenSource, /正在加载\{activeFilterLabel\}任务/u)
  assert.match(
    listScreenSource,
    /data-testid="mobile-role-scroll"[\s\S]*?aria-busy=\{initialLoading \? 'true' : 'false'\}/u
  )
})
