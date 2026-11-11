export const visibleUIDesignFrame = 'iframe[title="ERP 最新可交互设计"]:visible'

export async function chooseUIDesignMode(page, label) {
  const modes = page.getByLabel('设计预览界面', { exact: true })
  await modes.getByText(label, { exact: true }).click()
  await modes.getByRole('radio', { name: label, exact: true, checked: true }).waitFor({ state: 'attached' })
}

export async function chooseUIDesignState(page, label) {
  const select = page.locator('.erp-dev-ui-design-state-select:visible')
  await select.locator('.ant-select-selector').click()
  const listId = await select.getByRole('combobox').getAttribute('aria-controls')
  const popup = page.locator('.ant-select-dropdown').filter({ has: page.locator(`[id=${JSON.stringify(listId)}]`) })
  await popup.locator('.ant-select-item-option-content').first().waitFor()
  await popup.getByText(label, { exact: true }).click()
  await popup.waitFor({ state: 'hidden' })
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
  await frame.locator('[data-action="open-mobile-tasks"]').click()
}
