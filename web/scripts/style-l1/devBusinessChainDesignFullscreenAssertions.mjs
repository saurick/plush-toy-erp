import { expect } from 'playwright/test'
import { chooseChainNodeView } from './devBusinessChainNodeFilterAssertions.mjs'

export function createDevBusinessChainDesignFullscreenScenarios({
  assert,
  startNoWriteAudit,
}) {
  const writes = new WeakMap()
  return [
    {
      name: 'dev-business-chain-design-fullscreen-desktop',
      path: '/__dev/flow-explorer?new=blank',
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      beforeNavigate: (page) => startNoWriteAudit(page, writes),
      verify: async (page) => {
        const editor = page.getByRole('region', {
          name: '流程探索',
          exact: true,
        })
        await editor.getByRole('button', { name: '全库', exact: true }).click()
        await editor.getByRole('button', { name: '调整布局', exact: true }).click()
        // Object-level gestures remain available through the complete node library.
        await chooseChainNodeView(page, editor, '全部')
        await editor
          .locator('.erp-chain-design__canvas-bar')
          .getByText('全部已载入节点', { exact: true })
          .click()
        await expect(
          editor.getByRole('button', { name: '适应画布全图', exact: true })
        ).toBeDisabled()
        for (const name of ['销售订单', '提交后启动受理', '销售订单受理流程']) {
          await editor
            .getByRole('button', { name: `加入：${name}`, exact: true })
            .click()
          await editor
            .getByRole('button', { name: '关闭画布说明', exact: true })
            .click()
        }
        await assertChainDesignFullscreen(page, editor, assert)
        assert.deepEqual(writes.get(page), [], '全屏探索不调用业务写接口')
        await page.setViewportSize({ width: 1920, height: 1080 })
        await editor
          .getByRole('button', { name: '全屏探索', exact: true })
          .click()
        await editor
          .getByRole('button', { name: '适应画布全图', exact: true })
          .click()
        for (const viewport of [
          { width: 2048, height: 930 },
          { width: 1920, height: 1080 },
        ]) {
          await page.setViewportSize(viewport)
          const layout = await editor.evaluate((element) => {
            const box = (selector) => {
              const rect = element
                .querySelector(selector)
                .getBoundingClientRect()
              return { top: rect.top, height: rect.height, bottom: rect.bottom }
            }
            return {
              canvas: box('.erp-chain-design__viewport'),
              footer: box('.erp-chain-design__footer'),
              drafts: box('.erp-chain-design__drafts'),
              tools: box('.erp-chain-design__toolbar'),
            }
          })
          console.log(
            `[chain-design-density] ${viewport.width}x${viewport.height} ${JSON.stringify(layout)}`
          )
          assert(
            layout.tools.bottom - layout.drafts.top <= 84,
            '宽屏页头在两行内放下视图操作和范围工具'
          )
          assert(layout.footer.height <= 40, '图例按需查看，底部仅占一行')
          assert(
            viewport.height - layout.canvas.height <= 300,
            '宽屏上下工具与图例总占用不超过 300 像素，其余高度留给画布'
          )
        }
      },
    },
  ]
}

async function assertChainDesignFullscreen(page, editor, assert) {
  const initialViewport = page.viewportSize()
  const canvas = editor.locator('.erp-chain-design__viewport')
  const node = editor.locator('[data-design-node]').first()
  const normalHeight = (await canvas.boundingBox()).height
  const bodyOverflow = await page
    .locator('body')
    .evaluate((body) => body.style.overflow)
  await node.evaluate((element) => {
    element.dataset.fullscreenIdentity = 'same-node'
  })
  await canvas.evaluate((element) => {
    element.scrollLeft = 60
  })
  const previousScroll = await canvas.evaluate((element) => element.scrollLeft)
  const fullscreen = page.getByRole('dialog', {
    name: '流程探索全屏',
    exact: true,
  })
  const enter = editor.getByRole('button', { name: '全屏探索', exact: true })
  const exit = editor.getByRole('button', { name: '退出全屏', exact: true })
  await enter.click()
  await expect(fullscreen).toBeVisible()
  assert(
    (await canvas.boundingBox()).height > normalHeight,
    '全屏扩大画布编辑区域'
  )
  const body = node.locator('.erp-chain-design__node-body')
  const before = await node.getAttribute('style')
  const box = await body.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(
    box.x + box.width / 2 + 24,
    box.y + box.height / 2 + 100,
    { steps: 6 }
  )
  await page.mouse.up()
  const after = await node.getAttribute('style')
  assert.notEqual(after, before, '全屏内可拖动节点')
  const from = editor.getByRole('button', {
    name: '从销售订单拖出连线',
    exact: true,
  })
  const to = editor.getByRole('button', {
    name: '查看节点：提交后启动受理',
    exact: true,
  })
  const a = await from.boundingBox()
  const b = await to.boundingBox()
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 6 })
  await expect(
    editor.locator('[data-candidate="known"][data-design-node]')
  ).toHaveCount(1)
  await page.mouse.up()
  await expect(editor.locator('[data-connection-status]')).toHaveAttribute(
    'data-connection-status',
    'known'
  )
  await editor
    .getByRole('button', { name: '关闭画布说明', exact: true })
    .press('Escape')
  await expect(editor.locator('.erp-chain-design__card')).toHaveCount(0)
  await expect(fullscreen).toBeVisible()
  await editor.getByRole('button', { name: '新建空白视图', exact: true }).click()
  const confirm = page.getByRole('dialog', { name: '替换当前探索？', exact: true })
  await expect(confirm).toBeVisible()
  await confirm.getByRole('button', { name: '取消', exact: true }).press('Escape')
  await expect(confirm).toHaveCount(0)
  await expect(fullscreen).toBeVisible()
  await exit.click()
  await expect(fullscreen).toHaveCount(0)
  await expect(enter).toBeFocused()
  await expect(
    editor.locator('[data-fullscreen-identity="same-node"]')
  ).toHaveCount(1)
  assert.equal(
    await node.getAttribute('style'),
    after,
    '退出保留拖动后的节点位置'
  )
  await expect
    .poll(() => canvas.evaluate((element) => element.scrollLeft))
    .toBe(previousScroll)
  assert.equal(
    await page.locator('body').evaluate((element) => element.style.overflow),
    bodyOverflow
  )

  for (const viewport of [
    { width: 1280, height: 720 },
    { width: 1024, height: 768 },
  ]) {
    await page.setViewportSize(viewport)
    await enter.click()
    const bounds = await fullscreen.boundingBox()
    assert(
      bounds.x === 0 &&
        bounds.y === 0 &&
        bounds.width === viewport.width &&
        bounds.height === viewport.height,
      '全屏铺满浏览器内容区'
    )
    await expect(
      editor.getByRole('button', { name: '更多视图操作', exact: true })
    ).toBeInViewport()
    await editor.getByRole('button', { name: '图例与操作说明', exact: true }).click()
    const legendPanel = editor.getByRole('dialog', { name: '画布图例', exact: true })
    await expect(legendPanel).toBeVisible()
    const legend = await legendPanel.boundingBox()
    assert(legend.y >= 0 && legend.y + legend.height <= viewport.height, '全屏图例浮层完整可见')
    await legendPanel.press('Escape')
    await expect(legendPanel).toBeHidden()
    await expect(fullscreen).toBeVisible()
    const filterTrigger = editor.getByRole('button', { name: /^筛选业务节点 · /u })
    await filterTrigger.click()
    const filterPanel = page.getByRole('dialog', {
      name: '筛选业务节点',
      exact: true,
    })
    await expect(filterPanel).toBeVisible()
    await expect(
      filterPanel.getByRole('button', { name: '收起', exact: true })
    ).toBeInViewport()
    await filterPanel.press('Escape')
    await expect(filterPanel).toBeHidden()
    await expect(filterTrigger).toBeFocused()
    await expect(fullscreen).toBeVisible()
    const template = page.getByRole('combobox', {
      name: '选择流程范围',
      exact: true,
    })
    await editor
      .locator('.ant-select')
      .filter({ has: template })
      .locator('.ant-select-selector')
      .click()
    await expect(
      page.locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
    ).toBeVisible()
    await template.press('Escape')
    await expect(fullscreen).toBeVisible()
    await exit.press('Escape')
    await expect(fullscreen).toHaveCount(0)
  }
  await page.setViewportSize(initialViewport)
  await editor.getByRole('button', { name: '撤销', exact: true }).click()
  assert.equal(
    await node.getAttribute('style'),
    before,
    '退出全屏后仍可撤销布局修改'
  )
}
