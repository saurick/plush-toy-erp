import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { getContrastRatio, parseRgb } from './colorAssertions.mjs'

export async function clickMermaidControl(diagram, action) {
  const page = diagram.page()
  const previousID = action === 'layout' ? await diagram.locator('.erp-markdown-mermaid__canvas > svg').getAttribute('id') : null
  const selector = action === 'layout' ? '[data-mermaid-layout-action="toggle"]' : `[data-mermaid-zoom-action="${action}"]`
  const direct = diagram.locator(selector)
  if (await direct.count()) await direct.click()
  else {
    const labels = { layout: '切换布局', 'fit-all': '适应全图', fit: '适配宽度', 'zoom-in': '放大', 'zoom-out': '缩小', reset: '原始大小（100%）' }
    await diagram.locator('[data-mermaid-menu-trigger]').click()
    await page.getByRole('menuitem', { name: labels[action], exact: true }).click()
  }
  if (previousID) {
    await page.waitForFunction(({ root, previous }) => root.dataset.mermaidStatus === 'rendered' && root.querySelector('.erp-markdown-mermaid__canvas > svg')?.id !== previous, { root: await diagram.elementHandle(), previous: previousID })
  }
  await waitForFiniteAnimations(page)
}

export async function verifyCompactMermaidViewer(page, diagram, assert) {
  await diagram.locator('.erp-markdown-mermaid__canvas > svg').waitFor()
  assert.equal(await diagram.getAttribute('data-mermaid-toolbar'), 'compact')
  assert.equal(await diagram.locator('.erp-markdown-mermaid__toolbar button').count(), 2)
  const canvas = diagram.locator('.erp-markdown-mermaid__canvas')
  const originalWidth = (await canvas.locator('svg').boundingBox()).width
  await clickMermaidControl(diagram, 'zoom-in')
  assert((await canvas.locator('svg').boundingBox()).width > originalWidth)
  await clickMermaidControl(diagram, 'reset')
  assert.equal(await canvas.getAttribute('data-mermaid-zoom'), '100')
  await clickMermaidControl(diagram, 'fit')
  assert.equal(await diagram.getAttribute('data-mermaid-zoom-mode'), 'fit-width')
  await clickMermaidControl(diagram, 'fit-all')
  await assertMermaidFits(diagram, assert)
  await assertMermaidCentered(diagram, assert)
  await diagram.locator('[data-mermaid-fullscreen-action="open"]').click()
  await diagram.locator('[data-mermaid-fullscreen-action="close"]').waitFor()
  assert.equal(await diagram.getAttribute('data-mermaid-toolbar'), 'full')
  await clickMermaidControl(diagram, 'reset')
  assert.equal(await canvas.getAttribute('data-mermaid-zoom'), '100')
  await clickMermaidControl(diagram, 'fit-all')
  await assertMermaidFits(diagram, assert)
  await diagram.locator('[data-mermaid-fullscreen-action="close"]').press('Escape')
  await diagram.locator('[data-mermaid-fullscreen-action="open"]').waitFor()
  await page.waitForFunction((root) => root.querySelector('[data-mermaid-fullscreen-action="open"]') === document.activeElement, await diagram.elementHandle())
  await waitForFiniteAnimations(page)
  assert.equal(await diagram.getAttribute('data-mermaid-toolbar'), 'compact')
  assert.equal(await diagram.getAttribute('data-mermaid-zoom-mode'), 'fit-all')
  await assertMermaidFits(diagram, assert)
  // 自动适配随容器重新计算；手动比例必须在退出全屏后原样恢复。
  await clickMermaidControl(diagram, 'reset')
  const inlineZoom = await canvas.getAttribute('data-mermaid-zoom')
  await diagram.locator('[data-mermaid-fullscreen-action="open"]').click()
  await diagram.locator('[data-mermaid-fullscreen-action="close"]').waitFor()
  await clickMermaidControl(diagram, 'zoom-out')
  await diagram.locator('[data-mermaid-fullscreen-action="close"]').click()
  await diagram.locator('[data-mermaid-fullscreen-action="open"]').waitFor()
  await waitForFiniteAnimations(page)
  assert.equal(await diagram.getAttribute('data-mermaid-zoom-mode'), 'manual')
  assert.equal(await canvas.getAttribute('data-mermaid-zoom'), inlineZoom)
  await clickMermaidControl(diagram, 'fit-all')
}

async function verifyStableMermaidScroll(page, diagram, assert, action) {
  const watcher = await diagram.evaluateHandle((root) => {
    const scrollers = new Set([document.scrollingElement])
    for (let node = root.parentElement; node; node = node.parentElement) {
      if (/auto|scroll|hidden/u.test(getComputedStyle(node).overflowY)) {
        scrollers.add(node)
      }
    }
    const positions = [...scrollers].map((node) => ({
      node,
      top: node.scrollTop,
      left: node.scrollLeft,
      clientHeight: node.clientHeight,
      scrollHeight: node.scrollHeight,
    }))
    const toolbar = root.querySelector('.erp-markdown-mermaid__toolbar')
    let maxScrollDelta = 0
    let toolbarDetached = false
    let largestShift = null
    const sample = () => {
      for (const { node, top, left, clientHeight, scrollHeight } of positions) {
        const delta = Math.max(
          Math.abs(node.scrollTop - top),
          Math.abs(node.scrollLeft - left)
        )
        if (delta > maxScrollDelta) {
          largestShift = {
            tag: node.tagName,
            className: String(node.className),
            top,
            currentTop: node.scrollTop,
            clientHeight,
            currentHeight: node.clientHeight,
            scrollHeight,
            currentScrollHeight: node.scrollHeight,
          }
        }
        maxScrollDelta = Math.max(
          maxScrollDelta,
          Math.abs(node.scrollTop - top),
          Math.abs(node.scrollLeft - left)
        )
      }
      toolbarDetached ||= !toolbar.isConnected
    }
    const observer = new MutationObserver(sample)
    observer.observe(root, { attributes: true, childList: true, subtree: true })
    document.addEventListener('scroll', sample, true)
    let frame
    const tick = () => {
      sample()
      frame = requestAnimationFrame(tick)
    }
    tick()
    return {
      finish() {
        sample()
        cancelAnimationFrame(frame)
        observer.disconnect()
        document.removeEventListener('scroll', sample, true)
        return { maxScrollDelta, toolbarDetached, largestShift }
      },
    }
  })
  let result
  try {
    await action()
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        )
    )
  } finally {
    result = await watcher.evaluate((watch) => watch.finish())
    await watcher.dispose()
  }
  assert(
    result.maxScrollDelta <= 1,
    `图表操作不得移动外层滚动位置：${JSON.stringify(result)}`
  )
  assert.equal(result.toolbarDetached, false, '重渲染不得卸载工具栏或丢失焦点')
}

export async function switchMermaidLayout(
  page,
  diagram,
  assert,
  { rapid = false, advanceFocus = false } = {}
) {
  await waitForFiniteAnimations(page)
  const button = diagram.locator('[data-mermaid-layout-action="toggle"]')
  await button.scrollIntoViewIfNeeded()
  const svg = diagram.locator('.erp-markdown-mermaid__canvas > svg')
  const previous = await svg.getAttribute('id')
  const direction = await diagram.getAttribute('data-mermaid-direction')
  await verifyStableMermaidScroll(page, diagram, assert, async () => {
    if (rapid) await button.dblclick()
    else await button.click()
    if (advanceFocus) await page.keyboard.press('Tab')
    await page.waitForFunction(
      ({ root, previousID }) =>
        root.dataset.mermaidStatus === 'rendered' &&
        root.querySelector('.erp-markdown-mermaid__canvas > svg')?.id !==
          previousID,
      { root: await diagram.elementHandle(), previousID: previous }
    )
  })
  if (rapid) {
    assert.equal(
      await diagram.getAttribute('data-mermaid-direction'),
      direction === 'TD' ? 'TB' : direction
    )
  }
  if (advanceFocus) {
    assert(
      await diagram
        .locator('[data-mermaid-zoom-action="fit-all"]')
        .evaluate((node) => node === document.activeElement),
      '渲染完成后不得抢回用户已移走的焦点'
    )
  }
  await assertMermaidFits(diagram, assert)
  await assertMermaidCentered(diagram, assert)
  await assertMermaidZoomMode(diagram, assert, 'fit-all')
}

export async function assertMermaidCentered(diagram, assert) {
  const geometry = await diagram.evaluate((root) => {
    const viewport = root.querySelector('.erp-markdown-mermaid__viewport')
    const canvas = root.querySelector('.erp-markdown-mermaid__canvas')
    const svg = canvas.querySelector('svg')
    const viewportBox = viewport.getBoundingClientRect()
    const svgBox = svg.getBoundingClientRect()
    return {
      offsetX:
        svgBox.left +
        svgBox.width / 2 -
        (viewportBox.left + viewport.clientLeft + viewport.clientWidth / 2),
      offsetY:
        svgBox.top +
        svgBox.height / 2 -
        (viewportBox.top + viewport.clientTop + viewport.clientHeight / 2),
      viewport: { width: viewport.clientWidth, height: viewport.clientHeight },
      canvas: {
        height: canvas.getBoundingClientRect().height,
        minHeight: getComputedStyle(canvas).minHeight,
        alignItems: getComputedStyle(canvas).alignItems,
      },
      svg: { width: svgBox.width, height: svgBox.height },
    }
  })
  assert(
    Math.abs(geometry.offsetX) <= 1 && Math.abs(geometry.offsetY) <= 1,
    `适配后的图应在画布内水平、垂直居中：${JSON.stringify(geometry)}`
  )
}

export async function assertMermaidFits(diagram, assert) {
  const viewport = diagram.locator('.erp-markdown-mermaid__viewport')
  const bounds = await viewport.evaluate((node) => ({
    width: node.clientWidth,
    height: node.clientHeight,
    scrollWidth: node.scrollWidth,
    scrollHeight: node.scrollHeight,
  }))
  assert(
    bounds.width > 0 &&
      bounds.height > 0 &&
      bounds.scrollWidth <= bounds.width + 2 &&
      bounds.scrollHeight <= bounds.height + 2,
    `适应全图后不能裁切：${JSON.stringify(bounds)}`
  )
}

export async function waitForMermaidFit(page, diagram) {
  await page.waitForFunction(
    (root) => {
      const viewport = root.querySelector('.erp-markdown-mermaid__viewport')
      return (
        root.dataset.mermaidStatus === 'rendered' &&
        viewport &&
        viewport.clientWidth > 0 &&
        viewport.clientHeight > 0 &&
        viewport.scrollWidth <= viewport.clientWidth + 2 &&
        viewport.scrollHeight <= viewport.clientHeight + 2
      )
    },
    await diagram.elementHandle()
  )
}

export async function fitMermaidDiagram(diagram, assert) {
  await diagram.locator('[data-mermaid-zoom-action="fit-all"]').click()
  await assertMermaidFits(diagram, assert)
  await assertMermaidCentered(diagram, assert)
  await assertMermaidZoomMode(diagram, assert, 'fit-all')
}

export async function assertMermaidZoomMode(diagram, assert, selectedAction) {
  const controls = await diagram.evaluate((root) =>
    ['fit-all', 'fit', 'reset'].map((action) => {
      const button = root.querySelector(
        `[data-mermaid-zoom-action="${action}"]`
      )
      const style = getComputedStyle(button)
      return {
        action,
        pressed: button.getAttribute('aria-pressed'),
        color: style.color,
        background: style.backgroundColor,
      }
    })
  )
  assert.deepEqual(
    Object.fromEntries(
      controls.map(({ action, pressed }) => [action, pressed])
    ),
    Object.fromEntries(
      controls.map(({ action }) => [action, String(action === selectedAction)])
    ),
    `缩放模式按钮应准确且互斥地显示当前状态：${JSON.stringify(controls)}`
  )
  if (selectedAction) {
    assert.notEqual(
      controls.find(({ action }) => action === selectedAction).color,
      controls.find(({ action }) => action !== selectedAction).color,
      '选中模式应有持续可辨认的图标颜色'
    )
  }
}

export async function verifyMermaidZoomModes(page, diagram, assert) {
  const initialViewport = page.viewportSize()
  const canvas = diagram.locator('.erp-markdown-mermaid__canvas')
  const button = (action) =>
    diagram.locator(`[data-mermaid-zoom-action="${action}"]`)
  const assertWidth = async () => {
    const geometry = await diagram.evaluate((root) => {
      const viewport = root.querySelector('.erp-markdown-mermaid__viewport')
      const svg = root.querySelector('.erp-markdown-mermaid__canvas > svg')
      return {
        width: svg.getBoundingClientRect().width,
        target: Math.min(viewport.clientWidth, svg.viewBox.baseVal.width),
        intrinsicWidth: svg.viewBox.baseVal.width,
      }
    })
    assert(
      geometry.width > 0 &&
        geometry.width <= geometry.target + 1 &&
        geometry.target - geometry.width < geometry.intrinsicWidth / 100 + 1,
      `宽度模式须按当前容器宽度适配：${JSON.stringify(geometry)}`
    )
  }
  await page.mouse.move(0, 0)
  await assertMermaidZoomMode(diagram, assert, 'fit-all')
  await button('fit').click()
  await assertMermaidZoomMode(diagram, assert, 'fit')
  await assertWidth()
  await button('reset').click()
  await assertMermaidZoomMode(diagram, assert, 'reset')
  await button('zoom-in').click()
  await assertMermaidZoomMode(diagram, assert, null)
  await button('zoom-out').click()
  await assertMermaidZoomMode(diagram, assert, 'reset')
  await button('fit').click()
  await page.setViewportSize({
    width: Math.max(320, Math.min(initialViewport.width - 30, 960)),
    height: Math.min(initialViewport.height, 720),
  })
  await waitForFiniteAnimations(page)
  await assertMermaidZoomMode(diagram, assert, 'fit')
  await assertWidth()
  await page.setViewportSize(initialViewport)
  await waitForFiniteAnimations(page)
  await assertWidth()
  const inlineZoom = await canvas.getAttribute('data-mermaid-zoom')
  const appearance = () =>
    diagram.evaluate((root) => {
      const tool = getComputedStyle(
        root.querySelector('[data-mermaid-zoom-action="zoom-out"]')
      )
      return {
        theme: root.dataset.mermaidTheme,
        background: getComputedStyle(root).backgroundColor,
        toolBackground: tool.backgroundColor,
        toolColor: tool.color,
        toolBorder: tool.borderColor,
        labelColor: getComputedStyle(
          root.querySelector('[data-mermaid-zoom-label]')
        ).color,
      }
    })
  const inlineAppearance = await appearance()
  assert(
    getContrastRatio(
      parseRgb(inlineAppearance.toolColor),
      parseRgb(inlineAppearance.toolBackground)
    ) >= 3,
    '图表控件的图标与背景须有足够对比度'
  )
  await diagram.locator('[data-mermaid-fullscreen-action="open"]').click()
  assert.deepEqual(
    await appearance(),
    inlineAppearance,
    '全屏沿用当前主题的画布与控件配色'
  )
  assert.equal(
    await diagram
      .locator('.erp-markdown-mermaid__viewport')
      .evaluate((node) => getComputedStyle(node).backgroundColor),
    inlineAppearance.background,
    '全屏画布与当前主题背景保持一致'
  )
  await assertMermaidZoomMode(diagram, assert, 'fit-all')
  await page.setViewportSize({ width: 900, height: 500 })
  await waitForFiniteAnimations(page)
  const close = diagram.locator('[data-mermaid-fullscreen-action="close"]')
  assert(
    await close.evaluate((node) => {
      const rect = node.getBoundingClientRect()
      return node.contains(
        document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2
        )
      )
    }),
    '窄窗口的全屏工具栏不能被页面导航或父级层叠遮挡'
  )
  await button('reset').click()
  await assertMermaidZoomMode(diagram, assert, 'reset')
  await page.setViewportSize(initialViewport)
  await waitForFiniteAnimations(page)
  await diagram
    .locator('[data-mermaid-fullscreen-action="close"]')
    .press('Escape')
  await assertMermaidZoomMode(diagram, assert, 'fit')
  assert.deepEqual(
    await appearance(),
    inlineAppearance,
    '退出全屏恢复原有主题外观'
  )
  assert.equal(
    await canvas.getAttribute('data-mermaid-zoom'),
    inlineZoom,
    '退出全屏恢复页面原有的模式与缩放'
  )
  await fitMermaidDiagram(diagram, assert)
  await assertMermaidZoomMode(diagram, assert, 'fit-all')
}

export async function verifyMermaidDarkTheme(page, diagram, assert) {
  const trigger = page.getByRole('button', { name: '外观与密度', exact: true })
  const dialog = page.getByRole('dialog', { name: '外观与密度', exact: true })
  await trigger.click()
  const previousMode = await dialog
    .getByRole('radiogroup', { name: '主题模式', exact: true })
    .evaluate((node) => node.querySelector('input:checked').closest('label').textContent.trim())
  await dialog.getByText('暗色', { exact: true }).click()
  await dialog.getByRole('button', { name: '关闭', exact: true }).click()
  try {
    await page.waitForFunction(
      (root) => root.dataset.mermaidTheme === 'dark' && root.dataset.mermaidStatus === 'rendered',
      await diagram.elementHandle()
    )
    await waitForMermaidFit(page, diagram)
    await verifyMermaidZoomModes(page, diagram, assert)
  } finally {
    const close = diagram.locator('[data-mermaid-fullscreen-action="close"]')
    if (await close.count()) await close.press('Escape')
    await trigger.click()
    await dialog.getByText(previousMode, { exact: true }).click()
    await dialog.getByRole('button', { name: '关闭', exact: true }).click()
    await waitForMermaidFit(page, diagram)
  }
}

export async function verifyMermaidViewer(page, diagram, assert) {
  const svg = diagram.locator('.erp-markdown-mermaid__canvas > svg')
  const viewport = diagram.locator('.erp-markdown-mermaid__viewport')
  const canvas = diagram.locator('.erp-markdown-mermaid__canvas')
  await svg.waitFor()
  await waitForMermaidFit(page, diagram)
  await assertMermaidZoomMode(diagram, assert, 'fit-all')
  await assertMermaidFits(diagram, assert)
  await assertMermaidCentered(diagram, assert)
  await verifyMermaidZoomModes(page, diagram, assert)
  const initialViewport = page.viewportSize()
  await page.setViewportSize({
    width: Math.min(initialViewport.width, 960),
    height: Math.min(initialViewport.height, 640),
  })
  await waitForMermaidFit(page, diagram)
  await assertMermaidFits(diagram, assert)
  await page.setViewportSize(initialViewport)
  await waitForMermaidFit(page, diagram)
  const original = await svg.evaluate((node) => ({
    width: node.getBoundingClientRect().width,
    intrinsicWidth: node.viewBox.baseVal.width,
    labels: [...node.querySelectorAll('.node')]
      .map((item) => item.textContent.trim())
      .sort(),
  }))
  const initialZoom = Number(await canvas.getAttribute('data-mermaid-zoom'))
  assert(
    initialZoom >= 1 && initialZoom <= 100,
    '首次显示应完整适配全图，不放大小图'
  )
  assert(
    original.width > 0 && original.width <= original.intrinsicWidth + 1,
    `HTML 换行标签仍须按原生尺寸缩放：${JSON.stringify(original)}`
  )
  assert((await viewport.boundingBox()).height <= 520)

  await diagram.locator('[data-mermaid-zoom-action="zoom-in"]').click()
  assert((await svg.boundingBox()).width > original.width * 1.1)
  await diagram.locator('[data-mermaid-zoom-action="reset"]').click()
  assert.equal(await canvas.getAttribute('data-mermaid-zoom'), '100')
  await page.setViewportSize({
    width: Math.min(initialViewport.width, 1100),
    height: Math.min(initialViewport.height, 720),
  })
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve))
      )
  )
  assert.equal(
    await canvas.getAttribute('data-mermaid-zoom'),
    '100',
    '窗口变化不得覆盖用户选择的手动缩放'
  )
  await page.setViewportSize(initialViewport)

  const fit = () => fitMermaidDiagram(diagram, assert)
  await fit()

  const direction = await diagram.getAttribute('data-mermaid-direction')
  if (direction) {
    for (let i = 0; i < 2; i += 1) {
      await switchMermaidLayout(page, diagram, assert)
      assert.deepEqual(
        await svg
          .locator('.node')
          .evaluateAll((nodes) =>
            nodes.map((node) => node.textContent.trim()).sort()
          ),
        original.labels
      )
      assert.equal(
        await diagram
          .locator('[data-mermaid-layout-action="toggle"]')
          .evaluate((node) => node === document.activeElement),
        true
      )
    }
    assert.equal(
      await diagram.getAttribute('data-mermaid-direction'),
      direction === 'TD' ? 'TB' : direction
    )
    await switchMermaidLayout(page, diagram, assert, { rapid: true })
    await switchMermaidLayout(page, diagram, assert, { advanceFocus: true })
    await switchMermaidLayout(page, diagram, assert)
  }

  const inlineZoom = await canvas.getAttribute('data-mermaid-zoom')
  await diagram
    .locator('[data-mermaid-fullscreen-action="open"]')
    .scrollIntoViewIfNeeded()
  await verifyStableMermaidScroll(page, diagram, assert, async () => {
    await diagram.locator('[data-mermaid-fullscreen-action="open"]').click()
    await diagram.locator('[data-mermaid-fullscreen-action="close"]').waitFor()
    await fit()
    if (direction) {
      await switchMermaidLayout(page, diagram, assert)
      await switchMermaidLayout(page, diagram, assert)
    }
    await diagram
      .locator('[data-mermaid-fullscreen-action="close"]')
      .press('Escape')
    await diagram.locator('[data-mermaid-fullscreen-action="open"]').waitFor()
  })
  assert.equal(await canvas.getAttribute('data-mermaid-zoom'), inlineZoom)
  await page.waitForFunction(
    (root) =>
      root.querySelector('[data-mermaid-fullscreen-action="open"]') ===
      document.activeElement,
    await diagram.elementHandle()
  )

  // Deliberately overflow the canvas to prove dragging changes the actual scroll position.
  for (let i = 0; i < 12; i += 1) {
    const button = diagram.locator('[data-mermaid-zoom-action="zoom-in"]')
    if (await button.isEnabled()) await button.click()
  }
  await viewport.scrollIntoViewIfNeeded()
  const bounds = await viewport.boundingBox()
  const before = await viewport.evaluate((node) => ({
    x: node.scrollLeft,
    y: node.scrollTop,
  }))
  await page.mouse.move(
    bounds.x + bounds.width / 2,
    bounds.y + Math.min(bounds.height / 2, 120)
  )
  await page.mouse.down()
  await page.mouse.move(
    bounds.x + bounds.width / 2 - 90,
    bounds.y + Math.min(bounds.height / 2, 120) - 70,
    { steps: 5 }
  )
  await page.mouse.up()
  const after = await viewport.evaluate((node) => ({
    x: node.scrollLeft,
    y: node.scrollTop,
  }))
  assert(
    after.x > before.x + 20 || after.y > before.y + 20,
    '拖拽必须移动放大后的画布'
  )
  assert.equal(await viewport.getAttribute('data-mermaid-panning'), null)
  await fit()

  await page.emulateMedia({ media: 'print' })
  assert.equal(
    await viewport.evaluate((node) => getComputedStyle(node).maxHeight),
    'none'
  )
  assert(
    await viewport.evaluate(
      (node) => node.scrollHeight <= node.clientHeight + 2
    ),
    '打印必须展开完整图，不能沿用切换布局时保留的屏幕高度'
  )
  assert.equal(
    await diagram.locator('.erp-markdown-mermaid__toolbar').isVisible(),
    false
  )
  await page.emulateMedia({ media: 'screen' })
}
