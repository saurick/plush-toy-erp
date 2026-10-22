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
