import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const source = readFileSync(
  new URL('./usePersistentPrintWorkspaceDraft.js', import.meta.url),
  'utf8'
)
const erpRootDir = dirname(dirname(fileURLToPath(import.meta.url)))

test('usePersistentPrintWorkspaceDraft: 持久化结果、保存状态和 setter 返回值使用同一写入结果', () => {
  assert.match(
    source,
    /const saved = persistPrintWorkspaceDraftSnapshot\([\s\S]*?setPersistenceStatus\(saved \? 'saved' : 'error'\)[\s\S]*?return saved/u
  )
  assert.match(
    source,
    /const persisted = persistDraft\(resolvedDraft\)[\s\S]*?return persisted/u
  )
  assert.doesNotMatch(
    source,
    /persistPrintWorkspaceDraftSnapshot\(draftStorageKey, nextDraft\)[\s\S]*?return true/u,
    'localStorage 满额时不得继续报告保存成功'
  )
})

test('usePersistentPrintWorkspaceDraft: 普通输入只由 setter 持久化，不用 draft effect 重复写入', () => {
  assert.doesNotMatch(
    source,
    /useEffect\(\(\) => \{[\s\S]*?persistDraft\(draftRef\.current\)[\s\S]*?\}, \[[^\]]*persistDraft[^\]]*\]\)/u
  )
  assert.doesNotMatch(source, /\[draft, persistDraft\]/u)
})

test('usePersistentPrintWorkspaceDraft: flush 会把静默编辑提交给 React 后再持久化', () => {
  assert.match(
    source,
    /setDraftState\(\(currentDraft\) =>\s*currentDraft === draftRef\.current \? currentDraft : draftRef\.current\s*\)/u
  )
  assert.match(
    source,
    /return \[draft, setDraft, flushDraft, draftRef, persistenceStatus\]/u
  )
})

test('usePersistentPrintWorkspaceDraft: 三个正式工作台传入 scoped key 并展示真实保存状态', () => {
  const workspaceSources = [
    join(erpRootDir, 'pages/EngineeringPrintWorkspacePage.jsx'),
    join(erpRootDir, 'pages/ProcessingContractPrintWorkspacePage.jsx'),
    join(erpRootDir, 'components/print/MaterialPurchaseContractWorkbench.jsx'),
  ].map((filePath) => readFileSync(filePath, 'utf8'))

  workspaceSources.forEach((workspaceSource) => {
    assert.match(
      workspaceSource,
      /usePersistentPrintWorkspaceDraft\([\s\S]*?draftStorageKey\s*\)/u
    )
    assert.match(workspaceSource, /beforeSnapshot: flush/u)
    assert.match(workspaceSource, /persistenceStatus=\{persistenceStatus\}/u)
    assert.doesNotMatch(
      workspaceSource,
      /persistPrintWorkspaceDraftSnapshot/u,
      '页面不得和 hook 重复持久化同一草稿'
    )
  })
})
