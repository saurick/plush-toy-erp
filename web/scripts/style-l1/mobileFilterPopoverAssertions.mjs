export async function assertMobileFilterDensity({ assert, dialog }) {
  const layout = await dialog.evaluate((node) => ({
    legends: [...node.querySelectorAll('.mobile-filter-fields legend')].map((legend) => ({
      text: legend.textContent,
      align: getComputedStyle(legend).textAlign,
    })),
    groups: [...node.querySelectorAll('.mobile-filter-options, .erp-progress-due-options')].map((group) => ({
      label: group.getAttribute('aria-label'),
      display: getComputedStyle(group).display,
      width: group.clientWidth,
      buttons: [...group.querySelectorAll('button')].map((button) => ({
        text: button.textContent,
        width: button.getBoundingClientRect().width,
        height: button.getBoundingClientRect().height,
      })),
    })),
    overflow: node.scrollWidth > node.clientWidth + 1,
  }))
  assert.equal(layout.overflow, false, '筛选面板不横向溢出')
  for (const legend of layout.legends) assert.equal(legend.align, 'left', `筛选标题左对齐：${legend.text}`)
  for (const group of layout.groups) {
    assert.equal(group.display, 'flex', `短选项紧凑换行：${group.label}`)
    for (const button of group.buttons) {
      assert(button.height >= 44, `触摸区域至少 44px：${button.text}`)
      if (button.text.length <= 12 && group.buttons.length > 1) {
        assert(button.width < group.width * 0.85, `短选项不独占整行：${JSON.stringify({ group, button })}`)
      }
    }
  }
}

export async function assertMobileFilterEdgePositions({
  page,
  assert,
  trigger,
  dialog,
}) {
  const { width } = page.viewportSize()
  const bounds = await trigger.boundingBox()
  const originalStyle = await trigger.getAttribute('style')

  try {
    for (const left of [
      12,
      (width - bounds.width) / 2,
      width - bounds.width - 12,
    ]) {
      await trigger.evaluate(
        (node, position) => {
          Object.assign(node.style, {
            position: 'fixed',
            left: `${position.left}px`,
            top: `${position.top}px`,
            right: 'auto',
          })
        },
        { left, top: bounds.y }
      )
      await trigger.click()
      await dialog.waitFor({ state: 'visible' })
      await page.waitForFunction(() =>
        document.activeElement?.classList.contains('mobile-filter-panel')
      )
      const fields = dialog.locator('.mobile-filter-fields')
      await fields.evaluate((node) => { node.scrollTop = node.scrollHeight })
      const fixedControls = await dialog.evaluate((node) => {
        const box = node.getBoundingClientRect()
        const footer = node.querySelector('footer').getBoundingClientRect()
        return { top: box.top, bottom: box.bottom, footerBottom: footer.bottom, footerTop: footer.top, footerHeight: footer.height }
      })
      assert(fixedControls.footerTop >= fixedControls.top && fixedControls.footerBottom <= fixedControls.bottom && fixedControls.footerHeight >= 44, `重置和收起固定在底部，不随条件区滚走：${JSON.stringify(fixedControls)}`)
      await fields.evaluate((node) => { node.scrollTop = 0 })
      const geometry = await dialog.evaluate((node) => {
        const rect = (element) => element?.getBoundingClientRect().toJSON()
        return {
          viewportWidth: document.documentElement.clientWidth,
          viewportHeight: window.innerHeight,
          scrollWidth: document.documentElement.scrollWidth,
          popup: rect(node.closest('.mobile-filter-popover')),
          panel: rect(node),
          fieldsHeight: node.querySelector('.mobile-filter-fields').clientHeight,
          fieldsContent: node.querySelector('.mobile-filter-fields').scrollHeight,
          close: rect(node.querySelector('[aria-label="关闭筛选"]')),
        }
      })
      assert(
        geometry.popup.left >= 0 &&
          geometry.popup.right <= geometry.viewportWidth + 1 &&
          geometry.close.left >= 0 &&
          geometry.close.right <= geometry.viewportWidth + 1 &&
          geometry.scrollWidth <= geometry.viewportWidth + 1,
        `筛选入口靠左、居中或靠右时，弹层及关闭按钮均在视口内：${JSON.stringify(geometry)}`
      )
      assert(
        Math.abs(
          geometry.popup.width - (geometry.viewportWidth - 16)
        ) <= 1 &&
          Math.abs(
            geometry.popup.left - (geometry.viewportWidth - geometry.popup.right)
          ) <= 1,
        `筛选浮层横向居中，两侧各留 8px，充分使用手机宽度：${JSON.stringify(geometry)}`
      )
      assert(
        geometry.panel.top >= 12 &&
          geometry.panel.bottom <= geometry.viewportHeight - 12,
        `筛选面板完整显示并保留上下边距：${JSON.stringify(geometry)}`
      )
      assert(
        geometry.fieldsContent <= geometry.fieldsHeight + 1 ||
          geometry.panel.height >= geometry.viewportHeight - 28,
        `只有充分使用可用高度后，筛选条件区才需要滚动：${JSON.stringify(geometry)}`
      )
      await dialog
        .getByRole('button', { name: '关闭筛选', exact: true })
        .click()
      await dialog.waitFor({ state: 'hidden' })
    }
  } finally {
    await trigger.evaluate((node, style) => {
      if (style === null) node.removeAttribute('style')
      else node.setAttribute('style', style)
    }, originalStyle)
  }
}

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
    const x = page.viewportSize().width - 2
    const y = target.y + target.height / 2
    assert(
      x > panel.x + panel.width || y > panel.y + panel.height,
      '关闭点击位于筛选面板之外、底部导航所在区域'
    )

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
