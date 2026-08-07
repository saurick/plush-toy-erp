import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('./MobileTaskDetailScreen.jsx', import.meta.url),
  'utf8'
)

test('mobile production arrangement entry requires task and action authority', () => {
  assert.match(
    source,
    /resolveMobileProductionArrangementContext\(selectedTask\)/u
  )
  assert.match(source, /'production\.wip\.read'/u)
  assert.match(source, /'production\.wip\.assign'/u)
  assert.match(source, /'outsourcing\.order\.read'/u)
  assert.match(
    source,
    /productionArrangementContext &&\s*selectedCanOperate &&\s*canReadProductionWip &&\s*canAssignProductionWip/u
  )
  assert.match(source, /data-testid="mobile-production-arrangement-entry"/u)
  assert.match(source, /安排本厂 \/ 外发/u)
})

test('mobile entry reuses the scoped assignment modal without settling workflow', () => {
  assert.match(source, /<ProductionRouteExecutionModal/u)
  assert.match(source, /assignmentOnly/u)
  assert.match(
    source,
    /originReworkFactID=\{\s*productionArrangementContext\.productionFactID\s*\}/u
  )
  assert.match(source, /canAssign=\{canAssignProductionWip\}/u)
  assert.match(
    source,
    /canReadOutsourcingContracts=\{canReadOutsourcingContracts\}/u
  )
  assert.match(
    source,
    /onChanged=\{\(\) => setProductionArrangementOpen\(false\)\}/u
  )
  assert.match(source, /再回到任务处理页记录本次处理结论/u)
  assert.doesNotMatch(source, /completeWorkflowTask/u)
})
