export async function openTestingDetails(page, trigger, title) {
  await trigger.click()
  const dialog = title
    ? page.getByRole('dialog', { name: title, exact: true })
    : page.getByRole('dialog')
  const inline = page.locator('.erp-dev-testing-inline-details[open] > .erp-dev-testing-detail-content')
  const row = page.locator('.erp-dev-testing-guide-expanded [role="region"]')
  const local = title ? inline.and(page.getByRole('region', { name: title, exact: true })).or(row.and(page.getByRole('region', { name: `${title}详情`, exact: true }))) : inline.or(row)
  const surface = dialog.or(local)
  await surface.waitFor({ state: 'visible' })
  return surface
}

export async function closeTestingDetails(page) {
  const dialog = page.getByRole('dialog')
  if (await dialog.isVisible()) {
    await dialog.locator('.ant-drawer-close').click()
    await dialog.waitFor({ state: 'hidden' })
  } else if (await page.locator('.erp-dev-testing-guide-expanded [role="region"]').isVisible()) {
    const row = page.locator('.erp-dev-testing-guide-expanded [role="region"]')
    await page.locator('.erp-dev-testing-strategy-guide button[aria-expanded="true"]').click()
    await row.waitFor({ state: 'hidden' })
  } else {
    const inline = page.locator('.erp-dev-testing-inline-details[open]')
    await inline.locator('summary').click()
    await inline.waitFor({ state: 'hidden' })
  }
}
