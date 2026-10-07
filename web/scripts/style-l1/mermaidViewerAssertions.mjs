export async function fitMermaidDiagram(diagram, assert) {
  const viewport = diagram.locator('.erp-markdown-mermaid__viewport')
  await diagram.locator('[data-mermaid-zoom-action="fit-all"]').click()
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
      const previousID = await svg.getAttribute('id')
      await diagram.locator('[data-mermaid-layout-action="toggle"]').click()
      await page.waitForFunction(
        ({ root, previous }) => {
          const next = root.querySelector('.erp-markdown-mermaid__canvas > svg')
          return (
            root.dataset.mermaidStatus === 'rendered' && next?.id !== previous
          )
        },
        { root: await diagram.elementHandle(), previous: previousID }
      )
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
  }

  const inlineZoom = await canvas.getAttribute('data-mermaid-zoom')
  await diagram.locator('[data-mermaid-fullscreen-action="open"]').click()
  await diagram.locator('[data-mermaid-fullscreen-action="close"]').waitFor()
  await fit()
  await diagram
    .locator('[data-mermaid-fullscreen-action="close"]')
    .press('Escape')
  await diagram.locator('[data-mermaid-fullscreen-action="open"]').waitFor()
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
  assert.equal(
    await diagram.locator('.erp-markdown-mermaid__toolbar').isVisible(),
    false
  )
  await page.emulateMedia({ media: 'screen' })
}
