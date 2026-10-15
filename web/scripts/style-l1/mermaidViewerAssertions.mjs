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
    }))
    const toolbar = root.querySelector('.erp-markdown-mermaid__toolbar')
    let maxScrollDelta = 0
    let toolbarDetached = false
    const sample = () => {
      for (const { node, top, left } of positions) {
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
        return { maxScrollDelta, toolbarDetached }
      },
    }
  })
  let result
  try {
    await action()
    await page.evaluate(
      () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    )
  } finally {
    result = await watcher.evaluate((watch) => watch.finish())
    await watcher.dispose()
  }
  assert(result.maxScrollDelta <= 1, `图表操作不得移动外层滚动位置：${JSON.stringify(result)}`)
  assert.equal(result.toolbarDetached, false, '重渲染不得卸载工具栏或丢失焦点')
}

export async function switchMermaidLayout(
  page,
  diagram,
  assert,
  { rapid = false, advanceFocus = false } = {}
) {
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
        root.querySelector('.erp-markdown-mermaid__canvas > svg')?.id !== previousID,
      { root: await diagram.elementHandle(), previousID: previous }
    )
  })
  if (rapid) {
    assert.equal(await diagram.getAttribute('data-mermaid-direction'), direction === 'TD' ? 'TB' : direction)
  }
  if (advanceFocus) {
    assert(
      await diagram.locator('[data-mermaid-zoom-action="fit-all"]')
        .evaluate((node) => node === document.activeElement),
      '渲染完成后不得抢回用户已移走的焦点'
    )
  }
  await assertMermaidFits(diagram, assert)
}

async function assertMermaidFits(diagram, assert) {
  const viewport = diagram.locator('.erp-markdown-mermaid__viewport')
  const bounds = await viewport.evaluate((node) => ({
    width: node.clientWidth,
    height: node.clientHeight,
    scrollWidth: node.scrollWidth,
    scrollHeight: node.scrollHeight,
  }))
  assert(
    bounds.scrollWidth <= bounds.width + 2 &&
      bounds.scrollHeight <= bounds.height + 2,
    `适应全图后不能裁切：${JSON.stringify(bounds)}`
  )
}

export async function fitMermaidDiagram(diagram, assert) {
  await diagram.locator('[data-mermaid-zoom-action="fit-all"]').click()
  await assertMermaidFits(diagram, assert)
}

export async function verifyMermaidViewer(page, diagram, assert) {
  const svg = diagram.locator('.erp-markdown-mermaid__canvas > svg')
  const viewport = diagram.locator('.erp-markdown-mermaid__viewport')
  const canvas = diagram.locator('.erp-markdown-mermaid__canvas')
  await svg.waitFor()
  const original = await svg.evaluate((node) => ({
    width: node.getBoundingClientRect().width,
    intrinsicWidth: node.viewBox.baseVal.width,
    labels: [...node.querySelectorAll('.node')]
      .map((item) => item.textContent.trim())
      .sort(),
  }))
  const previewZoom = Number(await canvas.getAttribute('data-mermaid-zoom'))
  assert(previewZoom >= 75 && previewZoom <= 90, '默认概览兼顾可读性和可见高度')
  assert(
    original.width > 0 && original.width <= original.intrinsicWidth * 0.9 + 1,
    `HTML 换行标签仍须按原生尺寸缩放：${JSON.stringify(original)}`
  )
  assert((await viewport.boundingBox()).height <= 520)
  if (previewZoom > 75) {
    assert(await viewport.evaluate((node) => node.scrollHeight <= node.clientHeight + 2), '未达到可读性下限时，默认预览应适配可见高度')
  }

  await diagram.locator('[data-mermaid-zoom-action="zoom-in"]').click()
  assert((await svg.boundingBox()).width > original.width * 1.1)
  await diagram.locator('[data-mermaid-zoom-action="reset"]').click()
  assert.equal(await canvas.getAttribute('data-mermaid-zoom'), '100')

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
  await diagram.locator('[data-mermaid-fullscreen-action="open"]').scrollIntoViewIfNeeded()
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
    await viewport.evaluate((node) => node.scrollHeight <= node.clientHeight + 2),
    '打印必须展开完整图，不能沿用切换布局时保留的屏幕高度'
  )
  assert.equal(
    await diagram.locator('.erp-markdown-mermaid__toolbar').isVisible(),
    false
  )
  await page.emulateMedia({ media: 'screen' })
}
