import assert from 'node:assert/strict'
import path from 'node:path'
import { createRequire } from 'node:module'
import { PurchaseSourceActions } from '../../web/src/common/consts/purchaseSourceActions.mjs'
import { PermissionCode as P } from '../../web/src/common/consts/permissions.generated.mjs'
import { RpcErrorCode } from '../../web/src/common/consts/errorCodes.generated.js'
import { BUSINESS_ROUTE_PATHS } from '../../web/src/erp/utils/masterDataOrderView.mjs'
import { browserRPCURL } from './browser-write-target.mjs'
import { prepareTransactionPurchase } from './transaction-real-backend-fixture.mjs'
import { clickRPC, modal, pageAction, selectRow, settleRPCPage } from './transaction-browser-ui.mjs'
import { verifyPurchaseSourceRevocation } from './purchase-source-permissions-browser.mjs'

const require = createRequire(new URL('../../web/package.json', import.meta.url))
const { expect } = require('playwright/test')

export const PURCHASE_RELATED_SOURCE_CASES = Object.freeze([
  { key: 'receipt-return', actionKey: 'receiptReturn', role: 'warehouse', menu: '仓储管理 → 入库办理 → 采购收货 → 生成采购退货', button: '生成采购退货', title: '从入库单生成采购退货', quantity: '退货数量', submit: '生成退货草稿', table: 'purchase_returns', result: 'purchase_return', chain: 'purchase_posting_corrections', step: 'posted_purchase_receipt:returns:purchase_return_correction' },
  { key: 'receipt-adjustment', actionKey: 'receiptAdjustment', role: 'warehouse', menu: '仓储管理 → 入库办理 → 采购收货 → 登记入库调整', button: '登记入库调整', title: '登记采购入库调整', quantity: '调整数量', submit: '生成调整草稿', table: 'purchase_receipt_adjustments', result: 'purchase_receipt_adjustment', chain: 'purchase_posting_corrections', step: 'posted_purchase_receipt:creates_fact_draft:purchase_adjustment_correction' },
  { key: 'quality-return', actionKey: 'qualityReturn', role: 'purchase', menu: '质检管理 → 质量检验 → 已入库后追加检验不合格 → 不合格处置', button: '不合格处置', title: '退供应商', quantity: '本次退货数量', submit: '生成退货草稿', table: 'purchase_returns', result: 'purchase_return', readMethod: 'list_purchase_returns', chain: 'purchase_posting_corrections', step: 'posted_purchase_receipt:returns:purchase_return_correction' },
  { key: 'rejection-disposition', actionKey: 'rejectionDisposition', role: 'purchase', menu: '质检管理 → 质量检验 → 首次来料不合格 → 不合格处置', button: '不合格处置', title: '首次来料不合格退厂处置', quantity: '处置数量', submit: '生成处置草稿', table: 'purchase_rejection_dispositions', result: 'purchase_rejection_disposition', readMethod: 'list_purchase_rejection_dispositions', chain: 'purchase_quality_disposition', step: 'rejected_purchase_quality:creates_fact_draft:purchase_disposition' },
])

export function assertPurchaseRelatedSourceEvidence(proofs, browserRPC) {
  assert.deepEqual(proofs?.map((proof) => proof.key), PURCHASE_RELATED_SOURCE_CASES.map((entry) => entry.key))
  for (const entry of PURCHASE_RELATED_SOURCE_CASES) {
    const proof = proofs.find((item) => item.key === entry.key)
    for (const key of ['modalClosed', 'actionHidden', 'reasonVisible', 'deniedWithoutWrite', 'restored', 'staleValuesCleared', 'ownPermissionRevoked', 'backendDenialCleared', 'createdWithoutPosting']) assert.equal(proof[key], true, `${entry.key}: ${key}`)
    if (entry.readMethod) {
      assert.equal(proof.lateReadIgnored, true, entry.key)
      assert.equal(proof.preparationPermissionRevoked, true, entry.key)
    }
    assert(proof.createdID > 0 && proof.sourceID > 0)
    assert.equal(proof.actionKey, entry.actionKey)
    assert.equal(proof.chainKey, entry.chain)
    assert.equal(proof.stepKey, entry.step)
    assert.equal(proof.role, entry.role)
    assert.equal(proof.permission, P.PURCHASE_RECEIPT_READ)
    assert.equal(proof.readback?.status, 'DRAFT')
    assert.equal(proof.readback?.id, proof.createdID)
    assert.equal(proof.menu, entry.menu)
    assert.equal(proof.screenshot, `source-permission-${entry.key}.png`)
    assert.equal(proof.createdScreenshot, `source-created-${entry.key}.png`)
    for (const [ids, code] of [[proof.requestIDs, 0], [proof.deniedRequestIDs, RpcErrorCode.PERMISSION_DENIED]]) {
      assert(ids?.length > 0)
      assert(ids.every((id) => browserRPC.some((call) => call.requestID === id && call.role === entry.role && call.method === PurchaseSourceActions[entry.actionKey].method && call.code === code)))
    }
  }
}

async function verifyLateRead({ page, options, entry, permission, setPermissions, original, refreshProfile }) {
  let release, completed, captured = false
  const waiting = new Promise((resolve) => { release = resolve })
  const finished = new Promise((resolve) => { completed = resolve })
  const pattern = '**/rpc/purchase'
  const handler = async (route) => {
    if (captured || route.request().postDataJSON()?.method !== entry.readMethod) return route.fallback()
    try {
      const response = await route.fetch({ url: browserRPCURL(options.backendURL, route.request().url()), maxRedirects: 0, timeout: 30000 })
      assert.equal((await response.json()).result.code, 0)
      captured = true
      await waiting
      await route.fulfill({ response })
    } finally { completed() }
  }
  await page.route(pattern, handler)
  try {
    await pageAction(page, entry.button)
    await expect.poll(() => captured).toBe(true)
    await setPermissions(original.permissions.filter((key) => key !== permission))
    await refreshProfile()
    await expect(page.getByRole('dialog', { name: entry.title, exact: true })).toBeHidden()
    release()
    await finished
    await settleRPCPage(page)
    await expect(page.getByRole('dialog', { name: entry.title, exact: true })).toBeHidden()
  } finally {
    release()
    await page.unroute(pattern, handler)
    await setPermissions(original.permissions)
    await refreshProfile()
  }
}

// Sources are prepared through domain APIs in the disposable database. Every
// permission experiment and downstream draft creation is a real browser action.
export async function runPurchaseRelatedSourcePermissions({ client, options, report, fixture, receipt, inspection, open, failed, snapshot }) {
  const reject = async (id) => client.rpc('quality', 'quality', 'reject_quality_inspection', {
    id, result: 'REJECT', check_items: [{ name: '外观', requirement: '符合确认样', observation: '模拟外观不符', result: 'FAIL', scope: 'FULL', note: '模拟权限验证来源' }],
    defect_rate_operator: 'GT', defect_rate_percent: '50', decision_note: '模拟不合格来源，核对权限边界',
  })
  let correction, rejectedFixture
  report.relatedSourcePermissions = []
  for (const entry of PURCHASE_RELATED_SOURCE_CASES) {
    let source = receipt
    if (entry.actionKey === 'qualityReturn') {
      const result = await client.rpc('quality', 'quality', 'create_quality_inspection_draft', { inspection_no: `${fixture.prefix}-PERM-RECHECK`, purchase_receipt_id: receipt.id, purchase_receipt_item_id: inspection.purchase_receipt_item_id, decision_note: '模拟入库后追加复核，保留原合格检验' })
      correction = result.quality_inspection
      if (correction.status === 'DRAFT') await client.rpc('quality', 'quality', 'submit_quality_inspection', { id: correction.id })
      await reject(correction.id)
      source = correction
    } else if (entry.actionKey === 'rejectionDisposition') {
      rejectedFixture = await prepareTransactionPurchase(client, { ...options, runID: `${options.runID}-perm`, purchaseDraftOnly: false }, fixture.configHash)
      await reject(rejectedFixture.inspection.id)
      source = rejectedFixture.inspection
    }
    const fromQuality = Boolean(entry.readMethod)
    const page = await open(entry.role, fromQuality ? BUSINESS_ROUTE_PATHS.qualityInspections : BUSINESS_ROUTE_PATHS.purchaseReceipts, source.id, false, entry.actionKey === 'rejectionDisposition')
    const action = PurchaseSourceActions[entry.actionKey]
    const permission = P.PURCHASE_RECEIPT_READ
    const params = fromQuality ? { quality_inspection_id: source.id } : { purchase_receipt_id: source.id }
    const fieldLabel = entry.actionKey === 'rejectionDisposition' ? '处置原因' : fromQuality ? '备注' : '备注说明'
    const closeText = entry.actionKey === 'rejectionDisposition' ? '关闭' : '取消'
    const fill = async (editor) => {
      await editor.getByLabel(entry.quantity, { exact: true }).fill('1')
      if (entry.actionKey === 'receiptAdjustment') await editor.getByLabel('调整原因', { exact: true }).fill('模拟权限验证调整')
    }
    const proof = await verifyPurchaseSourceRevocation({
      client, page, role: entry.role, action, permission, params, failed, outputDir: options.outputDir,
      proofKey: entry.key, button: entry.button, title: entry.title, selectionID: source.id,
      fieldLabel, initialValue: entry.actionKey === 'rejectionDisposition' ? '首次来料检验不合格' : '', closeText, verifyOwnPermission: true,
      exercise: async ({ setPermissions, original, refreshProfile }) => {
        await selectRow(page, source.id)
        if (entry.readMethod) {
          await verifyLateRead({ page, options, entry, permission, setPermissions, original, refreshProfile })
          await selectRow(page, source.id)
        }
        await pageAction(page, entry.button)
        let editor = await modal(page, entry.title)
        await expect(editor.getByLabel(fieldLabel, { exact: true })).toHaveValue(entry.actionKey === 'rejectionDisposition' ? '首次来料检验不合格' : '')
        await fill(editor)
        const before = snapshot()
        const offset = report.browserRPC.length
        try {
          await setPermissions(original.permissions.filter((key) => key !== permission))
          // Keep the old effective session to exercise a genuine server rejection.
          await clickRPC(page, action.method, () => editor.getByRole('button', { name: entry.submit, exact: true }).click(), RpcErrorCode.PERMISSION_DENIED)
          await expect(editor).toBeHidden()
          await settleRPCPage(page)
          assert.deepEqual(snapshot(), before)
        } finally {
          await setPermissions(original.permissions)
          await refreshProfile()
        }
        const deniedRequestIDs = report.browserRPC.slice(offset).filter((call) => call.method === action.method && call.code === RpcErrorCode.PERMISSION_DENIED).map((call) => call.requestID)
        await selectRow(page, source.id)
        await pageAction(page, entry.button)
        editor = await modal(page, entry.title)
        await expect(editor.getByLabel(entry.quantity, { exact: true })).toHaveValue('')
        await fill(editor)
        const ledger = client.query(`SELECT json_build_object('inventory',(SELECT count(*) FROM inventory_txns),'finance',(SELECT count(*) FROM finance_facts))`)
        const createdOffset = report.browserRPC.length
        const result = await clickRPC(page, action.method, () => editor.getByRole('button', { name: entry.submit, exact: true }).click())
        const created = result[entry.result]
        assert(created?.id > 0)
        const row = client.query(`SELECT row_to_json(p) FROM ${entry.table} p WHERE id=${Number(created.id)}`)
        assert.equal(row.status, 'DRAFT')
        assert.equal(Number(fromQuality ? row.quality_inspection_id : row.purchase_receipt_id), source.id)
        assert.deepEqual(client.query(`SELECT json_build_object('inventory',(SELECT count(*) FROM inventory_txns),'finance',(SELECT count(*) FROM finance_facts))`), ledger)
        await settleRPCPage(page)
        const createdScreenshot = `source-created-${entry.key}.png`
        await page.screenshot({ path: path.join(options.outputDir, createdScreenshot), fullPage: false })
        const requestIDs = report.browserRPC.slice(createdOffset).filter((call) => call.method === action.method && call.code === 0).map((call) => call.requestID)
        if (entry.actionKey === 'rejectionDisposition') {
          await editor.getByRole('button', { name: closeText, exact: true }).click()
        } else if (!fromQuality) {
          const records = page.getByRole('dialog', { name: /^退货与调整记录/u })
          await expect(records).toBeVisible()
          await records.getByRole('button', { name: '关闭', exact: true }).click()
          await expect(records).toBeHidden()
        }
        await settleRPCPage(page)
        return { backendDenialCleared: true, lateReadIgnored: Boolean(entry.readMethod), createdWithoutPosting: true, createdID: row.id, sourceID: source.id, readback: row, deniedRequestIDs, requestIDs, createdScreenshot }
      },
    })
    report.relatedSourcePermissions.push({ key: entry.key, actionKey: entry.actionKey, menu: entry.menu, chainKey: entry.chain, stepKey: entry.step, ...proof })
  }
  assertPurchaseRelatedSourceEvidence(report.relatedSourcePermissions, report.browserRPC)
}
