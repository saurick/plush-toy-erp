import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const source = readFileSync(
  fileURLToPath(new URL('./DashboardPage.jsx', import.meta.url)),
  'utf8'
)

test('task board keeps the summary visible while only its lanes update', () => {
  assert.match(source, /const \[taskBoardSummaryState,/u)
  assert.match(source, /getWorkflowTaskBoardSummaryRequestKey/u)
  assert.match(source, /loading=\{taskBoardInitialLoading\}/u)
  assert.match(source, /taskBoardMetricsReady[\s\S]*taskBoardCounts/u)
  assert.match(
    source,
    /className=\{`erp-task-board-lanes[\s\S]{0,260}aria-busy=\{taskBoardUpdating\}/u
  )
  assert.match(source, /<TaskLane[\s\S]{0,220}loading=\{taskBoardUpdating\}/u)
  assert.match(
    source,
    /const preserveTaskBoardTransitionHeight = useCallback\(/u
  )
  assert.match(
    source,
    /pendingTaskBoardTransitionRequestKeyRef\.current =[\s\S]{0,160}getWorkflowTaskBoardRequestKey\(nextRequest\)/u
  )
  assert.match(source, /setTaskBoardTransitionMinHeight\(currentCardHeight\)/u)
  assert.match(
    source,
    /const selectTaskBoardLane = \(lane\) =>[\s\S]{0,420}preserveTaskBoardTransitionHeight\([\s\S]{0,120}buildWorkflowTaskBoardRequest\(nextFilters\)/u
  )
  assert.doesNotMatch(
    source,
    /erp-dashboard-task-board-card"[\s\S]{0,160}loading=\{loading\}/u
  )
})
