import assert from 'node:assert/strict'
import path from 'node:path'
import { createRequire } from 'node:module'
import { clickRPC, modal, pageAction, selectRow, settleRPCPage } from './transaction-browser-ui.mjs'
import { RpcErrorCode } from '../../web/src/common/consts/errorCodes.generated.js'

const require = createRequire(new URL('../../web/package.json', import.meta.url))
const { expect } = require('playwright/test')

export function assertPurchaseSourcePricesOmitted(value) {
  if (!value || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value)) {
    assert(!['unit_price', 'unit_price_snapshot', 'amount', 'total_amount', 'currency', 'payment_term_days'].includes(key), `unauthorized source field: ${key}`)
    assertPurchaseSourcePricesOmitted(child)
  }
}

// This runs only inside the disposable transaction runner. All permission
// changes use the normal admin command and retain scopes/navigation settings.
export async function verifyPurchaseSourceRevocation({ client, page, role, action, permission, button, title, formPage = false, selectionID, params, failed, outputDir, proofKey = role, fieldLabel = '备注', initialValue = '', closeText = '取消', verifyOwnPermission = false, exercise }) {
  const readRole = async () => {
    const { roles } = await client.rpc('admin', 'admin', 'rbac_options')
    const current = roles.find((entry) => entry.role_key === role)
    assert(current && !current.disabled)
    return current
  }
  const original = await readRole()
  assert(original.permissions.includes(permission))
  const setPermissions = async (permissions) => {
    const current = await readRole()
    const { role: updated } = await client.rpc('admin', 'admin', 'set_role_settings', {
      role_key: role, permission_keys: permissions,
      data_scopes: current.data_scopes,
      navigation_mode: current.navigation_mode,
      primary_menu_paths: current.primary_menu_paths,
      secondary_menu_paths: current.secondary_menu_paths,
      expected_version: current.version,
    })
    assert.deepEqual(updated.permissions, permissions)
  }
  const refreshProfile = () => clickRPC(page, 'get_effective_session', () =>
    page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))))
  const actionButton = page.locator('button').filter({ hasText: new RegExp(`^${button}$`, 'u') })
  await pageAction(page, button)
  const editor = formPage ? page.getByRole('region', { name: title, exact: true }) : await modal(page, title)
  await expect(editor).toBeVisible()
  await editor.getByLabel(fieldLabel, { exact: true }).fill('撤权前的临时填写')
  await settleRPCPage(page)
  try {
    await setPermissions(original.permissions.filter((key) => key !== permission))
    await refreshProfile()
    await expect(editor).toBeHidden()
    await expect(actionButton).toHaveCount(0)
    await expect(page.getByRole('status').filter({ hasText: `${action.label}还需` })).toBeVisible()
    if (['quality', 'quality-return', 'rejection-disposition'].includes(proofKey)) {
      await expect(page.locator('.ant-table-row:visible')).toHaveCount(0)
    }
    await failed(role, action.domain, action.method, params, RpcErrorCode.PERMISSION_DENIED)
    await settleRPCPage(page)
    await page.screenshot({ path: path.join(outputDir, `source-permission-${proofKey}.png`), fullPage: false })
  } catch (error) {
    await page.screenshot({ path: path.join(outputDir, `source-access-failure-${proofKey}.png`), fullPage: false })
    throw error
  } finally {
    await setPermissions(original.permissions)
    await refreshProfile()
  }
  await expect(page.getByRole('status').filter({ hasText: `${action.label}还需` })).toHaveCount(0)
  await expect(actionButton).toBeVisible()
  await settleRPCPage(page)
  if (selectionID) await selectRow(page, selectionID)
  await pageAction(page, button)
  const restored = formPage ? page.getByRole('region', { name: title, exact: true }) : await modal(page, title)
  await expect(restored).toBeVisible()
  await expect(restored.getByLabel(fieldLabel, { exact: true })).toHaveValue(initialValue)
  await restored.getByRole('button', { name: formPage ? '返回列表' : closeText, exact: true }).click()
  await expect(restored).toBeHidden()
  if (verifyOwnPermission) {
    try {
      if (selectionID) await selectRow(page, selectionID)
      await pageAction(page, button)
      const ownEditor = await modal(page, title)
      await ownEditor.getByLabel(fieldLabel, { exact: true }).fill('本岗撤权前的临时填写')
      await settleRPCPage(page)
      await setPermissions(original.permissions.filter((key) => key !== action.permission))
      await refreshProfile()
      await expect(ownEditor).toBeHidden()
      await expect(actionButton).toHaveCount(0)
      await failed(role, action.domain, action.method, params, RpcErrorCode.PERMISSION_DENIED)
    } finally {
      await setPermissions(original.permissions)
      await refreshProfile()
    }
  }
  if (verifyOwnPermission) {
    for (const required of action.preparationPermissions) {
      try {
        if (selectionID) await selectRow(page, selectionID)
        await pageAction(page, button)
        const preparationEditor = await modal(page, title)
        await preparationEditor.getByLabel(fieldLabel, { exact: true }).fill('准备资料撤权前的临时填写')
        await settleRPCPage(page)
        await setPermissions(original.permissions.filter((key) => key !== required))
        await refreshProfile()
        await expect(preparationEditor).toBeHidden()
        await expect(actionButton).toHaveCount(0)
        await expect(page.getByRole('status').filter({ hasText: `${action.label}还需` })).toBeVisible()
      } finally {
        await setPermissions(original.permissions)
        await refreshProfile()
      }
    }
  }
  const extra = exercise ? await exercise({ setPermissions, original, refreshProfile, actionButton }) : {}
  return { role, permission, modalClosed: true, actionHidden: true, reasonVisible: true, deniedWithoutWrite: true, restored: true, staleValuesCleared: true, ownPermissionRevoked: verifyOwnPermission, preparationPermissionRevoked: verifyOwnPermission && action.preparationPermissions.length > 0, screenshot: `source-permission-${proofKey}.png`, ...extra }
}
