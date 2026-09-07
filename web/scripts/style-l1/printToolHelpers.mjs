export async function expandPrintToolSection(page, title) {
  const details = page
    .getByRole('region', { name: title, exact: true })
    .locator(':scope > details')
  if (!(await details.evaluate((node) => node.open))) {
    await details.locator(':scope > summary').click()
  }
}
