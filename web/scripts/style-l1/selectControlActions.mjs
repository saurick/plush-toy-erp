// 所有选值都经过可见弹层；读取值只用于断言，不通过 DOM 改写控件状态。
export async function chooseSelectOption(control, value) {
  const custom = await control.evaluate((node) => node.tagName === 'UI-SELECT')
  if (custom) {
    if ((await control.getAttribute('aria-expanded')) !== 'true') {
      await control.click()
    }
    const option = value && typeof value === 'object'
      ? Number.isInteger(value.index)
        ? control.getByRole('option').nth(value.index)
        : control.getByRole('option', { name: value.label, exact: true })
      : control.locator(`[role="option"][data-value=${JSON.stringify(String(value))}]`)
    await option.click()
    return
  }
  const select = control.locator(
    'xpath=ancestor-or-self::*[contains(concat(" ", normalize-space(@class), " "), " ant-select ")][1]'
  )
  const input = select.getByRole('combobox')
  if ((await input.getAttribute('aria-expanded')) !== 'true') {
    await select.locator('.ant-select-selector').click()
  }
  const listId = await input.getAttribute('aria-controls')
  if (!listId) throw new Error('选择控件缺少可访问的选项列表')
  await control
    .page()
    .locator(
      `[id=${JSON.stringify(listId)}] [data-select-value=${JSON.stringify(String(value))}]`
    )
    .click()
  await control
    .page()
    .locator(`[id=${JSON.stringify(listId)}]`)
    .waitFor({ state: 'hidden' })
}

export function readSelectValue(control) {
  return control.evaluate(
    (node) => node.closest('.ant-select')?.dataset.value ?? node.value
  )
}
