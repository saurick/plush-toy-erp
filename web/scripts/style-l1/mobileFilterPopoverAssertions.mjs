export async function assertMobileFilterOutsideDismissal({
  page,
  assert,
  trigger,
  dialog,
}) {
  const backgroundTab = page.getByTestId('mobile-role-nav-mine')
  const queryLabel = await trigger.getAttribute('aria-label')
  const url = page.url()

  for (const pointer of ['mouse', 'touch']) {
    await trigger.click()
    await dialog.waitFor({ state: 'visible' })
    await page.waitForFunction(() =>
      document.activeElement?.classList.contains('mobile-filter-panel')
    )
    const backdrop = await page
      .locator('.mobile-filter-backdrop')
      .evaluate((node) => {
        const bounds = node.getBoundingClientRect()
        return {
          x: bounds.x,
          y: bounds.y,
          width: bounds.width,
          height: bounds.height,
          viewportWidth: window.innerWidth,
          viewportHeight: window.innerHeight,
        }
      })
    assert(
      backdrop.x === 0 &&
        backdrop.y === 0 &&
        backdrop.width === backdrop.viewportWidth &&
        backdrop.height === backdrop.viewportHeight,
      `遮罩覆盖整个视口：${JSON.stringify(backdrop)}`
    )
    const target = await backgroundTab.boundingBox()
    const panel = await dialog.boundingBox()
    assert(target && panel, '筛选和底部导航均应在视口内')
    const x = target.x + target.width / 2
    const y = target.y + target.height / 2
    assert(y > panel.y + panel.height, '关闭点击位于筛选面板之外')

    if (pointer === 'mouse') {
      await page.mouse.move(x, y)
      await page.mouse.down()
      assert(await dialog.isVisible(), '按下时保留遮罩，完整点击才关闭')
      await page.mouse.up()
    } else {
      await page.touchscreen.tap(x, y)
    }

    await dialog.waitFor({ state: 'hidden' })
    assert.equal(
      await backgroundTab.getAttribute('aria-selected'),
      'false',
      `${pointer} 点击外侧只关闭筛选，不切换底部导航`
    )
    assert.equal(page.url(), url, '关闭筛选不导航到其他页面')
    assert.equal(
      await trigger.getAttribute('aria-label'),
      queryLabel,
      '外侧关闭保留原筛选条件'
    )
    assert(
      await trigger.evaluate((node) => node === document.activeElement),
      '外侧关闭后焦点回到筛选入口'
    )
  }
}
