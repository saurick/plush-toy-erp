import { IDBFactory } from 'fake-indexeddb'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

import { Window } from 'happy-dom'
import { act, createElement } from 'react'
import { createRoot } from 'react-dom/client'
import {
  preparePrintDraftStorage,
  createPrintDraftWriter,
} from './printDraftStorage.mjs'

import { multiplyNumeric20Scale6Values } from './numeric20Scale6.mjs'
import {
  MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY,
  buildPrintWorkspaceDraftStorageKey,
  readPrintWorkspaceDraftSnapshot,
} from './printWorkspace.js'
import { preparePrintWorkspaceSnapshot } from './printWorkspaceOutput.mjs'
import {
  runSilentPrintWorkspaceDraftUpdate,
  useFlushPrintWorkspaceDraftOnPageExit,
  usePersistentPrintWorkspaceDraft,
} from './usePersistentPrintWorkspaceDraft.js'

const erpRootDir = dirname(dirname(fileURLToPath(import.meta.url)))

function installTestDOM() {
  const runtimeWindow = new Window({ url: 'http://127.0.0.1/' })
  runtimeWindow.indexedDB = new IDBFactory()
  runtimeWindow.requestAnimationFrame = (callback) =>
    runtimeWindow.setTimeout(() => callback(Date.now()), 0)
  const globals = {
    window: runtimeWindow,
    document: runtimeWindow.document,
    HTMLElement: runtimeWindow.HTMLElement,
    Node: runtimeWindow.Node,
    Event: runtimeWindow.Event,
  }
  const previousDescriptors = new Map(
    Object.keys(globals).map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ])
  )
  Object.entries(globals).forEach(([key, value]) => {
    Object.defineProperty(globalThis, key, {
      configurable: true,
      value,
      writable: true,
    })
  })
  globalThis.IS_REACT_ACT_ENVIRONMENT = true

  return () => {
    previousDescriptors.forEach((descriptor, key) => {
      if (descriptor) {
        Object.defineProperty(globalThis, key, descriptor)
      } else {
        delete globalThis[key]
      }
    })
    delete globalThis.IS_REACT_ACT_ENVIRONMENT
  }
}

function DraftInteractionHarness({ storageKey, onPreparedAction }) {
  const [draft, setDraft, flushDraft] = usePersistentPrintWorkspaceDraft(
    () =>
      readPrintWorkspaceDraftSnapshot(storageKey) || {
        quantity: '1',
        unitPrice: '2.675',
      },
    storageKey
  )
  useFlushPrintWorkspaceDraftOnPageExit(flushDraft)

  const prepareAction = async (action) => {
    await preparePrintWorkspaceSnapshot({
      windowLike: window,
      beforeSnapshot: flushDraft,
    })
    onPreparedAction({
      action,
      total: document.querySelector('[data-testid="draft-total"]')?.textContent,
    })
  }

  return createElement(
    'div',
    null,
    createElement(
      'div',
      {
        contentEditable: true,
        'data-testid': 'draft-quantity',
        onInput: (event) => {
          const quantity = event.currentTarget.textContent || ''
          runSilentPrintWorkspaceDraftUpdate(() =>
            setDraft((current) => ({ ...current, quantity }))
          )
        },
        suppressContentEditableWarning: true,
      },
      draft.quantity
    ),
    createElement(
      'span',
      { 'data-testid': 'draft-total' },
      multiplyNumeric20Scale6Values(draft.quantity, draft.unitPrice, 2)
    ),
    createElement(
      'button',
      { onClick: () => prepareAction('preview'), type: 'button' },
      'preview'
    ),
    createElement(
      'button',
      { onClick: () => prepareAction('print'), type: 'button' },
      'print'
    )
  )
}

test('write result and pending state follow the actual asynchronous transaction', async () => {
  const statuses = []
  let finish
  const writer = createPrintDraftWriter({
    write: () =>
      new Promise((resolve) => {
        finish = resolve
      }),
    onStatus: (status) => statuses.push(status),
  })
  const result = writer.save({ value: 'last input' })
  const flushed = writer.flush()
  await Promise.resolve()
  assert.equal(writer.unsaved, true)
  assert.deepEqual(statuses, ['saving'])
  finish(false)
  assert.equal(await result, false)
  assert.equal(await flushed, false)
  assert.equal(writer.unsaved, true)
  assert.equal(statuses.at(-1), 'error')
})

test('usePersistentPrintWorkspaceDraft: 不 blur 也能恢复最后输入，立即预览和打印读取重算后的金额', async () => {
  const restoreDOM = installTestDOM()
  const revisionOneKey = buildPrintWorkspaceDraftStorageKey(
    MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY,
    'interaction-window',
    {
      customerKey: 'yoyoosun',
      accountKey: '42',
      configRevision: 'revision-1',
    }
  )
  const revisionTwoKey = buildPrintWorkspaceDraftStorageKey(
    MATERIAL_PURCHASE_CONTRACT_TEMPLATE_KEY,
    'interaction-window',
    {
      customerKey: 'yoyoosun',
      accountKey: '42',
      configRevision: 'revision-2',
    }
  )
  const preparedActions = []
  let actionResolved = null
  const handlePreparedAction = (payload) => {
    preparedActions.push(payload)
    actionResolved?.()
  }
  const mountHarness = async (storageKey) => {
    await preparePrintDraftStorage(storageKey)
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    await act(async () => {
      root.render(
        createElement(DraftInteractionHarness, {
          onPreparedAction: handlePreparedAction,
          storageKey,
        })
      )
    })
    return { container, root }
  }
  const editQuantity = async (container, value) => {
    const editable = container.querySelector('[data-testid="draft-quantity"]')
    editable.focus()
    await act(async () => {
      editable.textContent = value
      editable.dispatchEvent(new window.Event('input', { bubbles: true }))
    })
    assert.equal(document.activeElement, editable)
  }
  const runPreparedAction = async (container, action) => {
    const completed = new Promise((resolve) => {
      actionResolved = resolve
    })
    await act(async () => {
      Array.from(container.querySelectorAll('button'))
        .find((button) => button.textContent === action)
        .click()
    })
    await act(async () => {
      await completed
    })
    actionResolved = null
  }

  let mounted = null
  let restored = null
  try {
    window.localStorage.clear()
    mounted = await mountHarness(revisionOneKey)
    await editQuantity(mounted.container, '12')
    assert.equal(
      readPrintWorkspaceDraftSnapshot(revisionOneKey),
      null,
      '尚未提交的异步写入不能报告已保存'
    )
    assert.equal(
      mounted.container.querySelector('[data-testid="draft-total"]')
        ?.textContent,
      '2.68',
      '静默输入在提交前不应伪装成已重算视图'
    )

    await runPreparedAction(mounted.container, 'preview')
    assert.deepEqual(preparedActions.at(-1), {
      action: 'preview',
      total: '32.10',
    })

    await editQuantity(mounted.container, '13')
    await runPreparedAction(mounted.container, 'print')
    assert.deepEqual(preparedActions.at(-1), {
      action: 'print',
      total: '34.78',
    })

    await editQuantity(mounted.container, '14')
    await runPreparedAction(mounted.container, 'print')
    await act(async () => mounted.root.unmount())
    mounted = null

    restored = await mountHarness(revisionOneKey)
    assert.equal(
      restored.container.querySelector('[data-testid="draft-total"]')
        ?.textContent,
      '37.45',
      '刷新或重开后应恢复未 blur 的最后输入'
    )

    await act(async () => {
      restored.root.render(
        createElement(DraftInteractionHarness, {
          onPreparedAction: handlePreparedAction,
          storageKey: revisionTwoKey,
        })
      )
    })
    assert.equal(
      restored.container.querySelector('[data-testid="draft-total"]')
        ?.textContent,
      '2.68',
      '配置版本变化后不得继续显示旧版本草稿'
    )
  } finally {
    if (mounted) {
      await act(async () => mounted.root.unmount())
    }
    if (restored) {
      await act(async () => restored.root.unmount())
    }
    restoreDOM()
  }
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

  const workspacePageSources = [
    join(erpRootDir, 'pages/EngineeringPrintWorkspacePage.jsx'),
    join(erpRootDir, 'pages/ProcessingContractPrintWorkspacePage.jsx'),
    join(erpRootDir, 'pages/MaterialPurchaseContractPrintWorkspacePage.jsx'),
  ].map((filePath) => readFileSync(filePath, 'utf8'))

  workspacePageSources.forEach((workspaceSource) => {
    assert.match(
      workspaceSource,
      /getPrintWorkspaceDraftScope\(searchParams\)/u
    )
    assert.doesNotMatch(workspaceSource, /useOutletContext/u)
    assert.match(workspaceSource, /configRevision/u)
    assert.match(
      workspaceSource,
      /buildPrintWorkspaceDraftStorageKey\([\s\S]*?accountKey[\s\S]*?configRevision/u
    )
  })

  const businessPrintSources = [
    join(erpRootDir, 'pages/V1OutsourcingOrdersPage.jsx'),
    join(erpRootDir, 'pages/BOMVersionsPage.jsx'),
    join(erpRootDir, 'pages/OperationalFactsPage.jsx'),
    join(
      erpRootDir,
      'components/purchase-orders/usePurchaseOrderContractPrint.mjs'
    ),
  ].map((filePath) => readFileSync(filePath, 'utf8'))

  businessPrintSources.forEach((businessPrintSource) => {
    assert.match(
      businessPrintSource,
      /openPrintWorkspaceWindow\([\s\S]*?initialDraft[\s\S]*?accountKey[\s\S]*?configRevision/u
    )
  })

  const purchaseOrderPageSource = readFileSync(
    join(erpRootDir, 'pages/V1PurchaseOrdersPage.jsx'),
    'utf8'
  )
  assert.match(
    purchaseOrderPageSource,
    /usePurchaseOrderContractPrint\([\s\S]*?accountKey:\s*adminProfile\?\.id/u
  )
})
