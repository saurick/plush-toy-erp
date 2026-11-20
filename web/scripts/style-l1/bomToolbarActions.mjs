const toolbar = (target) => target.locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " erp-bom-material-groups ")][1]').getByRole('group', { name: 'BOM 选中对象操作', exact: true })

export async function clickBOMMaterialAction(group, name) {
  await group.locator('.erp-bom-material-cell').nth(1).click()
  await toolbar(group).getByRole('button', { name, exact: true }).click()
  if (name === '移除物料') await group.page().getByRole('button', { name: '移除整组', exact: true }).click()
}

export async function clickBOMPartAction(target, name) {
  const isRow = await target.evaluate((node) => node.matches('tr[data-bom-part-index]'))
  const row = isRow ? target : target.locator('tr[data-bom-part-index]').first()
  await row.locator('td:not(.erp-bom-material-cell)').first().click()
  await toolbar(row).getByRole('button', { name, exact: true }).click()
}
