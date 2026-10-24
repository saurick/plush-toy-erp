export async function chooseUIDesignState(page, label) {
  const select = page.locator('.erp-dev-ui-design-state-select')
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
