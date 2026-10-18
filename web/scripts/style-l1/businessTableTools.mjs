export async function openBusinessTableTool(page, label) {
  const name = new RegExp(label.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u')
  const direct = page.getByRole('button', { name })
  if (await direct.isVisible()) {
    await direct.click()
    return direct
  }
  const trigger = page.getByRole('button', { name: '表格工具', exact: true })
  await trigger.click()
  await page.getByRole('menuitem', { name }).click()
  return trigger
}
