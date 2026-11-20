import { clickERPThemeOption } from './themeAssertions.mjs'

export async function clickMobileThemeOption(page, label) {
  const activeTab = await page
    .getByTestId('mobile-role-bottom-nav')
    .locator('[aria-current="page"]')
    .getAttribute('data-testid')
  await page.getByTestId('mobile-role-nav-mine').click()
  await clickERPThemeOption(page, label)
  if (activeTab !== 'mobile-role-nav-mine') {
    await page.getByTestId(activeTab).click()
  }
}
