export async function selectLineItem(row) {
  const editor = row.locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " erp-line-editor ")][1]')
  if (!(await editor.count()) || await editor.getAttribute('data-line-editor-compact') === 'true' || !(await row.getAttribute('tabindex'))) return null
  await row.locator('.erp-editable-line-group__sequence').click({ position: { x: 2, y: 2 } })
  return editor
}

export async function clickLineItemAction(row, name, { exact = typeof name === 'string' } = {}) {
  const editor = await selectLineItem(row)
  const scope = editor ? editor.locator('.erp-line-editor__action-host') : row
  await scope.getByRole('button', { name, exact }).click()
}

export async function revealLineItemDetails(row) {
  const toggle = row.locator('.erp-line-editor__details-toggle')
  if (await toggle.count()) {
    if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click()
    const panelID = await toggle.getAttribute('aria-controls')
    await row.locator(`[id=${JSON.stringify(panelID)}]`).waitFor({ state: 'visible' })
  }
}
