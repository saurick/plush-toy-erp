export async function selectWarehouseView(page, label, scope = page) {
  const navigation = scope.locator('.erp-business-module-view-tabs')
  await navigation.getByRole('tab', { name: label, exact: true }).click()
  await navigation.getByRole('tab', { name: label, exact: true, selected: true }).waitFor()
}
