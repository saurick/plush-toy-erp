import { chooseSelectOption } from './selectControlActions.mjs'

export const visibleUIDesignFrame = 'iframe[title="ERP 最新可交互设计"]:visible'

async function openSettingsIfCompact(page) {
  const trigger = page.getByRole('button', { name: /^预览设置/u })
  if (!await trigger.isVisible() || await trigger.getAttribute('aria-expanded') === 'true') return false
  await trigger.click()
  await page.getByRole('dialog', { name: '预览设置', exact: true }).waitFor()
  return true
}

export async function chooseUIDesignScene(page, field, label) {
  const opened = await openSettingsIfCompact(page)
  const input = page.getByRole('combobox', { name: field, exact: true })
  await chooseSelectOption(input, { label })
  await page.locator('.erp-dev-ui-design-scope-select').filter({ has: input })
    .locator('.ant-select-selection-item').and(page.getByText(label, { exact: true })).waitFor()
  if (opened) await page.getByRole('button', { name: '收起预览设置', exact: true }).click()
}

export async function chooseUIDesignMode(page, label) {
  const modes = page.getByLabel('设计预览界面', { exact: true })
  await modes.getByText(label, { exact: true }).click()
  await modes.getByRole('radio', { name: label, exact: true, checked: true }).waitFor({ state: 'attached' })
}

export async function chooseUIDesignState(page, label) {
  const opened = await openSettingsIfCompact(page)
  const select = page.locator('.erp-dev-ui-design-state-select:visible')
  await select.locator('.ant-select-selector').click()
  const listId = await select.getByRole('combobox').getAttribute('aria-controls')
  const popup = page.locator('.ant-select-dropdown').filter({ has: page.locator(`[id=${JSON.stringify(listId)}]`) })
  await popup.locator('.ant-select-item-option-content').first().waitFor()
  await popup.getByText(label, { exact: true }).click()
  await popup.waitFor({ state: 'hidden' })
  if (opened) await page.getByRole('button', { name: '收起预览设置', exact: true }).click()
}

export async function openUIDesignAccountMenu(frame) {
  const navigation = frame.locator('[data-action="open-nav"]').filter({ visible: true }).first()
  if (await navigation.isVisible() && await navigation.getAttribute('aria-expanded') !== 'true') {
    await navigation.click()
  }
  await frame.locator('#sidebar [data-action="open-account"]').click()
}

export async function openUIDesignAppearance(frame) {
  await openUIDesignAccountMenu(frame)
  await frame.locator('.account-popover [data-action="open-theme"]').click()
}

export async function openUIDesignMobileTasks(frame) {
  await openUIDesignAccountMenu(frame)
  await frame.getByRole('menu', { name: '账号菜单' }).getByRole('button', { name: '切换工作入口' }).click()
  await frame.locator('.role-mobile-device').waitFor()
}
