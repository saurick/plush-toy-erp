import assert from 'node:assert/strict'

export async function assertTaskTitleFocusInteractions(page, row) {
  const entry = row.locator('.erp-task-title-entry')
  const drawer = page.locator('.erp-task-action-drawer')
  const readFocus = () =>
    entry.evaluate((button) => {
      const style = getComputedStyle(button)
      return {
        focused: document.activeElement === button,
        outlined:
          style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0,
      }
    })
  const closeWithMouse = async () => {
    await drawer.waitFor({ state: 'visible', timeout: 10_000 })
    await drawer.getByRole('button', { name: '关闭', exact: true }).click()
    await drawer.waitFor({ state: 'hidden', timeout: 10_000 })
    assert.deepEqual(
      await readFocus(),
      { focused: true, outlined: false },
      '鼠标关闭详情应保留标题焦点，但不显示选中般的轮廓'
    )
  }

  await row.locator('td').nth(1).click()
  await closeWithMouse()

  // 从相邻控件按 Tab 返回，覆盖键盘事件发生在标题以外的情况。
  await page.keyboard.press('Tab')
  assert.equal((await readFocus()).focused, false)
  await page.keyboard.press('Shift+Tab')
  assert.deepEqual(
    await readFocus(),
    { focused: true, outlined: true },
    'Tab 返回标题应显示键盘焦点轮廓'
  )

  for (const key of ['Enter', 'Space']) {
    await page.keyboard.press(key)
    await drawer.waitFor({ state: 'visible', timeout: 10_000 })
    assert.equal(
      await page.locator('.erp-task-action-drawer:visible').count(),
      1
    )
    await page.keyboard.press('Escape')
    await drawer.waitFor({ state: 'hidden', timeout: 10_000 })
    assert.deepEqual(
      await readFocus(),
      { focused: true, outlined: true },
      `${key} 打开并用 Esc 返回后应保留键盘焦点轮廓`
    )
  }

  // 已有键盘轮廓时，按下鼠标即应隐藏，不能等详情关闭后才消失。
  await entry.hover()
  await page.mouse.down()
  try {
    assert.equal((await readFocus()).outlined, false)
  } finally {
    await page.mouse.up()
  }
  await closeWithMouse()
}
