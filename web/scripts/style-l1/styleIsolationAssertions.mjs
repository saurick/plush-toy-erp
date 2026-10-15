import assert from 'node:assert/strict'

const appearanceProperties = [
  'width',
  'height',
  'font-size',
  'line-height',
  'padding',
  'border-radius',
  'border-width',
  'border-color',
  'background-color',
  'box-shadow',
  'outline-width',
]

async function readAppearance(input) {
  return input.evaluate(async (node, properties) => {
    const owner = node.closest('.ant-input-affix-wrapper') || node
    await new Promise((resolve) =>
      requestAnimationFrame(() => requestAnimationFrame(resolve))
    )
    await Promise.all(
      owner
        .getAnimations({ subtree: true })
        .filter((animation) =>
          Number.isFinite(animation.effect.getComputedTiming().endTime)
        )
        .map((animation) => animation.finished.catch(() => {}))
    )
    const read = (element) => {
      const style = getComputedStyle(element)
      return Object.fromEntries(
        properties.map((property) => [
          property,
          style.getPropertyValue(property),
        ])
      )
    }
    return { input: read(node), owner: read(owner) }
  }, appearanceProperties)
}

async function captureStates(page, input) {
  await input.blur()
  await page.mouse.move(0, 0)
  const normal = await readAppearance(input)
  await input.hover()
  const hover = await readAppearance(input)
  await input.focus()
  const focus = await readAppearance(input)
  return { normal, hover, focus }
}

// 使用真实路由切换保留已加载的 CSS，整页刷新无法检验这种污染。
export async function navigateWithinApp(page, pathname, ready) {
  const timeOrigin = await page.evaluate(() => performance.timeOrigin)
  await page.evaluate((nextPath) => {
    window.history.pushState(window.history.state, '', nextPath)
    window.dispatchEvent(
      new PopStateEvent('popstate', { state: window.history.state })
    )
  }, pathname)
  await ready.waitFor({ state: 'visible' })
  assert.equal(
    await page.evaluate(() => performance.timeOrigin),
    timeOrigin,
    '样式隔离回归不能通过刷新清除其他模块 CSS'
  )
}

export async function assertControlStyleSurvivesVisits(
  page,
  { input, close, reopen, visits, label }
) {
  const before = await captureStates(page, input)
  for (const visit of visits) {
    await close()
    await visit()
    await reopen()
    assert.deepEqual(
      await captureStates(page, input),
      before,
      `${label} 访问其他模块后，默认、hover 和 focus 样式不能发生变化`
    )
  }
}

export async function assertInactivePrintStylesDoNotHideApp(page) {
  await page.emulateMedia({ media: 'print' })
  try {
    const metrics = await page.locator('#root').evaluate((root) => ({
      display: getComputedStyle(root).display,
      width: root.getBoundingClientRect().width,
      height: root.getBoundingClientRect().height,
    }))
    assert(
      metrics.display !== 'none' && metrics.width > 0 && metrics.height > 0,
      `未打开专属打印界面时，其他模块不能隐藏应用: ${JSON.stringify(metrics)}`
    )
  } finally {
    await page.emulateMedia({ media: 'screen' })
  }
}
