import assert from 'node:assert/strict'

export async function assertMobileBackToTop(
  page,
  scroll,
  { screenshotPath, keyboard = false } = {}
) {
  const button = scroll.locator('..').getByTestId('mobile-back-to-top')
  const focused = await page.evaluateHandle(() => document.activeElement)
  const before = await scroll.evaluate((node) => {
    document.activeElement?.blur()
    const top = node.scrollTop
    node.scrollTop = 0
    return { top, maximum: node.scrollHeight - node.clientHeight }
  })
  const restore = async () => {
    await scroll.evaluate((node, top) => { node.scrollTop = top }, before.top)
    await focused.evaluate((node) => { if (node?.isConnected) node.focus({ preventScroll: true }) })
    await focused.dispose()
  }
  await button.waitFor({ state: 'hidden' })
  if (before.maximum < 280) {
    await scroll.evaluate((node) => { node.scrollTop = node.scrollHeight })
    await page.waitForTimeout(50)
    assert.equal(await button.count(), 0, '短内容滚到底部也保持隐藏')
    await restore()
    return false
  }
  const values = () =>
    scroll
      .locator('input, textarea, select')
      .evaluateAll((nodes) => nodes.map((node) => [node.name, node.value]))
  const originalValues = await values()
  await scroll.evaluate((node) => {
    node.scrollTop = 279
  })
  await page.waitForTimeout(50)
  assert.equal(await button.count(), 0, '未达到回顶距离时保持隐藏')
  await scroll.evaluate((node) => {
    node.scrollTop = 280
  })
  await button.waitFor({ state: 'visible' })
  const bodyBox = await scroll.boundingBox()
  const buttonBox = await button.boundingBox()
  assert.equal(buttonBox.width, 44)
  assert.equal(buttonBox.height, 44)
  assert(
    buttonBox.x >= bodyBox.x && buttonBox.x + 44 <= bodyBox.x + bodyBox.width
  )
  assert(
    buttonBox.y >= bodyBox.y &&
      buttonBox.y + 44 <= bodyBox.y + bodyBox.height - 12,
    `回顶按钮应位于滚动正文内、固定操作栏上方: ${JSON.stringify({ bodyBox, buttonBox })}`
  )
  if (screenshotPath) await page.screenshot({ path: screenshotPath })
  if (keyboard) {
    await button.focus()
    await page.keyboard.press('Enter')
  } else await button.click()
  await page.waitForFunction(
    (node) => node.scrollTop <= 2,
    await scroll.elementHandle()
  )
  await button.waitFor({ state: 'hidden' })
  assert.deepEqual(await values(), originalValues, '回顶保留表单输入和当前筛选')
  await restore()
  return true
}
