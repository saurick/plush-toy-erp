export function businessSplitLayoutButton(page) {
  return page.getByRole('button', { name: '分栏布局', exact: true }).first()
}

export async function collapseBusinessSplit(page) {
  await page.getByRole('button', { name: '收起分栏', exact: true }).first().click()
}
