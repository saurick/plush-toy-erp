export async function selectLineItem(row) {
  const radio = row.locator('.erp-line-editor__row-marker input[type="radio"]')
  if (!(await radio.count()) || !(await radio.isVisible())) return null
  await radio.check()
  return row.locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " erp-line-editor ")][1]')
}

export async function clickLineItemAction(row, name, { exact = typeof name === 'string' } = {}) {
  const editor = await selectLineItem(row)
  const scope = editor ? editor.locator('.erp-line-editor__action-host') : row
  await scope.getByRole('button', { name, exact }).click()
}

export async function revealLineItemDetails(row) {
  const toggle = row.locator('.erp-line-editor__details-toggle')
  if (await toggle.count() && await toggle.getAttribute('aria-expanded') === 'false') await toggle.click()
}
