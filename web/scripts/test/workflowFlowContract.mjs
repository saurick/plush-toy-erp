import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

export const mobileWorkflowSources = Object.freeze({
  page: readFileSync(
    new URL(
      '../../src/erp/mobile/pages/MobileRoleTasksPage.jsx',
      import.meta.url
    ),
    'utf8'
  ),
  actions: readFileSync(
    new URL(
      '../../src/erp/mobile/hooks/useMobileRoleTaskActions.js',
      import.meta.url
    ),
    'utf8'
  ),
  model: readFileSync(
    new URL(
      '../../src/erp/mobile/utils/mobileRoleTaskModel.mjs',
      import.meta.url
    ),
    'utf8'
  ),
})

export function assertSourceOmitsSymbols(source, sourceName, symbols) {
  for (const symbol of symbols) {
    assert.equal(
      source.includes(symbol),
      false,
      `${sourceName} must not own workflow symbol ${symbol}`
    )
  }
}

export function assertCanonicalTaskReload(source) {
  assert.match(
    source,
    /loadTasks\(\{\s*canonicalTask: confirmedTask\s*\}\)\.catch/
  )
}

export function assertServerOwnedTaskMatchers(flow, contracts) {
  assert.equal(
    Object.keys(flow).some((name) => name.startsWith('build')),
    false,
    'frontend flow modules must not export workflow task builders'
  )
  for (const { matcher, sourceType, taskGroup } of contracts) {
    assert.equal(
      flow[matcher]({ source_type: sourceType, task_group: taskGroup }),
      true
    )
    assert.equal(
      flow[matcher]({ source_type: 'unrelated', task_group: taskGroup }),
      false
    )
    assert.equal(
      flow[matcher]({ source_type: sourceType, task_group: 'unrelated' }),
      false
    )
    assert.equal(flow[matcher]({}), false)
  }
}
