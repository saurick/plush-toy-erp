import { chooseDisplay, chooseExplorerAction, searchWholeLibrary } from './devFlowExplorerControls.mjs'
import { expect } from 'playwright/test'
import { chooseChainNodeView } from './devBusinessChainNodeFilterAssertions.mjs'

const contentWithoutCamera = (raw) => {
  const value = JSON.parse(raw)
  if (value?.draft?.presentation) delete value.draft.presentation.viewport
  return value
}

export function createDevBusinessChainDesignViewportScenarios({
  assert,
  startNoWriteAudit,
}) {
  const writes = new WeakMap()
  return [
    {
      name: 'dev-business-chain-map-fit-width-desktop',
      path: '/__dev/flow-explorer',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      beforeNavigate: (page) => startNoWriteAudit(page, writes),
      verify: async (page) => {
        await assertExpandedChainFitWidth(page, assert)
        assert.deepEqual(writes.get(page), [], '适配展开链路不调用业务写接口')
      },
    },
    {
      name: 'dev-business-chain-design-viewport-desktop',
      path: '/__dev/flow-explorer?new=blank',
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 2,
      beforeNavigate: (page) => startNoWriteAudit(page, writes),
      verify: async (page) => {
        const editor = page.getByRole('region', {
          name: '流程探索',
          exact: true,
        })
        await searchWholeLibrary(editor)
        await chooseExplorerAction(editor, '调整布局')
        // Object-level gestures remain available through the complete node library.
        await chooseChainNodeView(page, editor, '全部')
        await chooseDisplay(editor, '全部已载入节点')
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
        await assertConnectionToolbarGeometry(page, editor, assert)
        await assertChainDesignNavigation(page, editor, assert)
        await assertChainDesignPageHeight(page, editor, assert)
        const normalBounds = await editor.boundingBox()
        await editor
          .getByRole('button', { name: '全屏探索', exact: true })
          .click()
        await editor
          .getByRole('button', { name: '适应画布全图', exact: true })
          .click()
        await editor
          .getByRole('button', { name: '退出全屏', exact: true })
          .click()
        assert.deepEqual(await editor.boundingBox(), normalBounds, '退出全屏恢复占满页面的布局')
        assert.deepEqual(
          writes.get(page),
          [],
          '缩放、平移和适应画布不调用业务写接口'
        )
      },
    },
  ]
}

async function assertExpandedChainFitWidth(page, assert) {
  const editor = page.getByRole('region', { name: '流程探索', exact: true })
  const action = (name) => editor.getByRole('button', { name, exact: true })
  const canvas = editor.getByRole('region', { name: '流程探索画布', exact: true })
  const fitWidth = action('适配画布宽度')
  const fitAll = action('适应画布全图')
  const working = () => page.evaluate(() => sessionStorage.getItem('plush-workbench:business-chain-design:working'))
  const chooseScope = async (name) => {
    await editor.locator('.ant-select').filter({ has: page.getByRole('combobox', { name: '选择流程范围', exact: true }) }).locator('.ant-select-selector').click()
    await page.locator('.ant-select-dropdown:visible').getByText(name, { exact: true }).click()
  }
  const detail = (name) => chooseDisplay(editor, name)
  const stepIds = () => editor.locator('[data-design-node]:not([data-design-node^="map:"])').evaluateAll((nodes) => nodes.map((node) => node.dataset.designNode))
  const assertReadable = async (ids, label) => {
    await expect(fitWidth).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => canvas.evaluate((area, ids) => {
      const viewport = area.getBoundingClientRect()
      const nodes = [...area.querySelectorAll('[data-design-node]')].filter((node) => ids.includes(node.dataset.designNode))
      const boxes = nodes.map((node) => node.getBoundingClientRect())
      const edges = [...area.querySelectorAll('[data-design-edge]')].filter((edge) =>
        ids.includes(edge.dataset.edgeFrom) && ids.includes(edge.dataset.edgeTo)
      ).map((edge) => edge.getBoundingClientRect())
      const left = Math.min(...boxes.map((box) => box.left))
      const right = Math.max(...boxes.map((box) => box.right))
      const top = Math.min(...boxes.map((box) => box.top))
      const scale = (boxes[0]?.width ?? 0) / 176
      return boxes.length === ids.length && boxes.length > 1 &&
        left >= viewport.left && right <= viewport.right + 1 &&
        top >= viewport.top && top < viewport.top + 80 &&
        edges.every((edge) => edge.left >= viewport.left && edge.right <= viewport.right + 1 && edge.top >= viewport.top) &&
        (scale >= 0.99 || (right - left) / viewport.width > 0.9)
    }, ids), { message: `${label}：展开步骤从画布顶部开始，横向适配且没有被概览卡片挤到屏幕外` }).toBe(true)
  }
  await chooseScope('采购下单到入库应付')
  await detail('链路概览')
  await action('查看节点：采购下单到入库应付').click()
  await action('展开这条链路的步骤').click()
  await action('展开分支').click()
  const purchaseIds = await stepIds()
  assert(purchaseIds.length > 10, '复现有多行步骤的采购链路')
  await fitWidth.click()
  await assertReadable(purchaseIds, '采购链路')
  await assertNodeAndEdgeVisualSemantics(editor, assert)
  await fitAll.click()
  await action('折叠为链路卡片').click()
  await fitWidth.click()
  await action('查看节点：采购下单到入库应付').click()
  await action('展开这条链路的步骤').click()
  await assertReadable(purchaseIds, '先适配宽度再展开，不被自动切回适应全图')
  const beforeFit = await working()
  for (const width of [1440, 1024, 1920]) {
    await page.setViewportSize({ width, height: 1080 })
    await assertReadable(purchaseIds, `${width}px 窗口`)
  }
  await action('全屏探索').click()
  await assertReadable(purchaseIds, '进入全屏')
  await action('退出全屏').click()
  await assertReadable(purchaseIds, '退出全屏')
  assert.deepEqual(contentWithoutCamera(await working()), contentWithoutCamera(beforeFit), '宽度适配和窗口变化只更新镜头，不改范围、节点或布局')

  await detail('业务步骤')
  await expect(action('收起分支')).toHaveAttribute('aria-pressed', 'true')
  await assertReadable(await stepIds(), '切换业务步骤后保持适配宽度')
  await assertNodeAndEdgeVisualSemantics(editor, assert)
  await detail('链路概览')
  await assertReadable(purchaseIds, '返回概览后保持适配宽度')
  await chooseScope('业务全流程地图')
  await fitAll.click()
  await action('查看节点：委外发料到回货应付').click()
  await action('展开这条链路的步骤').click()
  const outsourceIds = (await stepIds()).filter((id) => !purchaseIds.includes(id))
  await fitWidth.click()
  await assertReadable(outsourceIds, '同时展开两条链路时适配最近展开的一条')
  await fitAll.click()
  await action('查看节点：采购下单到入库应付').click()
  await fitWidth.click()
  await assertReadable(purchaseIds, '选中其他已展开链路后适配该链路')
  await action('放大画布').click()
  await expect(fitWidth).toHaveAttribute('aria-pressed', 'false')
  await fitWidth.click()
  await assertReadable(purchaseIds, '手动放大后重新适配仍对准正在查看的链路')
  await fitAll.click()
  const bounds = await canvas.boundingBox()
  assert(await editor.locator('[data-design-node], [data-design-edge]').evaluateAll((items, bounds) => items.every((item) => {
    const rect = item.getBoundingClientRect()
    return rect.left >= bounds.x && rect.top >= bounds.y && rect.right <= bounds.x + bounds.width + 1 && rect.bottom <= bounds.y + bounds.height + 1
  }), bounds), '适应全图仍包含全部概览卡片和已展开步骤')
  await action('查看节点：采购下单到入库应付').click()
  await fitWidth.click()
  await assertReadable(purchaseIds, '全图返回采购链路阅读')
  await chooseScope('采购下单到入库应付')
  await assertReadable(purchaseIds, '切换为单条链路范围仍保持宽度适配')
}

async function assertNodeAndEdgeVisualSemantics(editor, assert) {
  await editor.getByRole('button', { name: '图例与操作说明', exact: true }).click()
  const legendPanel = editor.getByRole('dialog', { name: '画布图例', exact: true })
  await expect(legendPanel).toBeVisible()
  const visual = await editor.evaluate((root) => {
    const legend = root.querySelector('[aria-label="画布图例"]')
    const icon = (element) => element.querySelector('[data-node-type-icon] svg')?.getAttribute('data-icon')
    const types = [...legend.querySelectorAll('[data-type]')].map((item) => ({
      type: item.dataset.type,
      icon: icon(item),
      label: item.textContent.trim(),
    }))
    const matchesLegend = (element) => {
      const icons = element.querySelectorAll('[data-node-type-icon]')
      return icons.length === 1 && icons[0].getAttribute('aria-hidden') === 'true' &&
        icon(element) === types.find((type) => type.type === icons[0].dataset.nodeTypeIcon)?.icon
    }
    const edge = (element) => {
      const line = element.querySelector('.erp-chain-design__edge')
      const marker = /^url\(#(.+)\)$/.exec(line.getAttribute('marker-end') || '')?.[1]
      const label = element.querySelector('text')
      return {
        color: getComputedStyle(line).stroke,
        dash: getComputedStyle(line).strokeDasharray,
        arrow: marker ? getComputedStyle(document.getElementById(marker).querySelector('path')).fill : null,
        labelColor: label ? getComputedStyle(label).fill : getComputedStyle(element).color,
        label: label ? label.textContent.trim() : element.textContent.trim(),
      }
    }
    return {
      types,
      nodes: [...root.querySelectorAll('[data-design-node]')].map((node) => ({
        matches: matchesLegend(node),
        typeMatches: node.dataset.type === node.querySelector('[data-node-type-icon]')?.dataset.nodeTypeIcon,
        title: node.querySelector('strong').textContent.trim(),
        background: getComputedStyle(node.querySelector('.erp-chain-design__node-body')).backgroundColor,
      })),
      libraryMatches: [...root.querySelectorAll('.erp-chain-design__library-item')].every(matchesLegend),
      exceptions: [...root.querySelectorAll('[data-design-edge="exception"]')].map(edge),
      normal: edge(root.querySelector('[data-design-edge="known"]')),
      legendException: edge(legend.querySelector('[data-legend-edge="exception"]')),
      legendUnknown: edge(legend.querySelector('[data-legend-edge="unknown"]')),
    }
  })
  assert.equal(visual.types.length, 9, '图例完整列出九种节点类型')
  assert(visual.types.every((type) => type.icon && type.label), '每种类型保留图标和中文说明')
  assert.equal(new Set(visual.types.map((type) => type.icon)).size, 9, '不同类型使用可区分的图标')
  assert(visual.nodes.every((node) => node.matches && node.typeMatches && node.title), '画布节点与图例共用类型图标并保留步骤名称')
  assert(visual.libraryMatches, '节点库和分支入口使用同一套类型图标')
  assert(new Set(visual.nodes.map((node) => node.background)).size > 1, '节点仍以业务领域区分底色')
  assert(visual.exceptions.length > 0, '采购链路包含可核对的异常分支')
  const exceptionColor = visual.legendException.color
  assert(visual.exceptions.every((edge) => edge.color === exceptionColor && edge.arrow === exceptionColor && edge.labelColor === exceptionColor && edge.label), '异常线路、箭头、分支名称与图例同色且保留文字')
  assert.equal(visual.legendException.arrow, exceptionColor, '异常图例箭头与线条同色')
  assert.equal(visual.legendException.labelColor, exceptionColor, '异常图例文字与线条同色')
  assert.notEqual(exceptionColor, visual.normal.color, '异常线路颜色与正常线路区分')
  assert(visual.exceptions.every((edge) => edge.dash === '8px, 5px'), '异常线路保留虚线，不只依赖颜色')
  assert.equal(visual.normal.dash, 'none', '正常线路保留实线')
  assert.equal(visual.normal.arrow, visual.normal.color, '正常箭头不被异常配色污染')
  assert.equal(visual.legendUnknown.dash, '2px, 5px', '待核对关系保留点线')
  assert.equal(visual.legendUnknown.arrow, null, '待核对关系保持无方向')
  assert.notEqual(visual.legendUnknown.color, exceptionColor, '待核对关系不混入异常红色')
  await legendPanel.press('Escape')
  await expect(legendPanel).toBeHidden()
}

async function assertConnectionToolbarGeometry(page, editor, assert) {
  const canvas = editor.getByRole('region', { name: '流程探索画布', exact: true })
  for (const fullscreen of [false, true]) {
    if (fullscreen) await editor.getByRole('button', { name: '全屏探索', exact: true }).click()
    for (const width of [1920, 1600, 1440, 1280, 1024]) {
      await page.setViewportSize({ width, height: 1080 })
      await editor.getByRole('button', { name: '适应画布全图', exact: true }).click()
      const before = await canvas.boundingBox()
      await editor.getByRole('button', { name: '从销售订单受理流程拖出连线', exact: true }).click()
      await expect(editor.getByRole('button', { name: '取消连线', exact: true })).toBeVisible()
      assert.deepEqual(await canvas.boundingBox(), before, `${fullscreen ? '全屏' : '普通页'} ${width}px 开始连线不移动或缩小画布`)
      await editor.getByRole('button', { name: '取消连线', exact: true }).click()
      assert.deepEqual(await canvas.boundingBox(), before, '取消连线不改变画布几何')
    }
    if (fullscreen) await editor.getByRole('button', { name: '退出全屏', exact: true }).click()
  }
  await page.setViewportSize({ width: 1440, height: 900 })
}

async function assertChainDesignPageHeight(page, editor, assert) {
  const readDrafts = () => page.evaluate(() => ({
    saved: localStorage.getItem('plush-workbench:business-chain-design:working'),
    working: sessionStorage.getItem('plush-workbench:business-chain-design:working'),
  }))
  const before = await readDrafts()
  const heights = []
  for (const viewport of [
    { width: 1920, height: 861 },
    { width: 1920, height: 1080 },
    { width: 1920, height: 1440 },
    { width: 1440, height: 900 },
  ]) {
    await page.setViewportSize(viewport)
    await page.evaluate(() => window.scrollTo(0, 0))
    const layout = await page.evaluate(() => {
      const rect = (selector) => {
        const box = document.querySelector(selector).getBoundingClientRect()
        return { top: box.top, bottom: box.bottom, height: box.height }
      }
      return {
        main: rect('.erp-dev-flow-explorer-page > main'),
        canvas: rect('.erp-chain-design__viewport'),
        footer: rect('.erp-chain-design__footer'),
        pageHeight: document.documentElement.scrollHeight,
        pageWidth: document.documentElement.scrollWidth,
        bottomPadding: parseFloat(getComputedStyle(document.querySelector('.erp-dev-flow-explorer-page')).paddingBottom),
      }
    })
    assert(Math.abs(viewport.height - layout.main.bottom - layout.bottomPadding) <= 1, '独立页面填满视口，只保留页边距')
    assert(layout.pageHeight <= viewport.height + 1, '足够高的窗口无需整页滚动')
    assert(layout.pageWidth <= viewport.width, '流程探索没有页面级横向溢出')
    assert(layout.canvas.bottom <= layout.footer.top, '简短状态栏排在画布下方')
    assert(layout.footer.bottom <= viewport.height, '状态与图例入口在当前窗口内可见')
    assert(layout.footer.height <= 40, '图例不常驻占用纵向空间')
    heights.push(layout.canvas.height)
    console.log(`[chain-design-page-height] ${viewport.width}x${viewport.height} ${JSON.stringify(layout)}`)
  }
  assert(Math.abs(heights[1] - heights[0] - 219) <= 1, '窗口增高的空间全部用于画布')
  assert(Math.abs(heights[2] - heights[1] - 360) <= 1, '高窗口不再受旧画布高度上限限制')

  await page.setViewportSize({ width: 1280, height: 600 })
  assert((await editor.locator('.erp-chain-design__workspace').boundingBox()).height >= 520, '短窗口保留可阅读的画布高度')
  assert(await page.evaluate(() => document.documentElement.scrollHeight > innerHeight), '短窗口允许页面纵向滚动')
  await editor.locator('.erp-chain-design__footer').scrollIntoViewIfNeeded()
  await expect(editor.getByRole('button', { name: '图例与操作说明', exact: true })).toBeInViewport()
  await expect(editor.locator('.erp-chain-design__footer')).toBeInViewport()
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), '短窗口换行后仍无横向溢出')
  await page.setViewportSize({ width: 1920, height: 1080 })
  await page.evaluate(() => window.scrollTo(0, 0))
  assert.deepEqual(await readDrafts(), before, '调整窗口尺寸不改写本地和标签页的探索记录')
}

async function assertChainDesignNavigation(page, editor, assert) {
  const canvas = editor.getByRole('region', {
    name: '流程探索画布',
    exact: true,
  })
  const nodes = editor.locator('[data-design-node]')
  const first = nodes.first()
  const zoom = editor.locator('[data-diagram-zoom-label]')
  const reset = editor.getByRole('button', {
    name: '重置画布为 100%',
    exact: true,
  })
  const fitWidth = editor.getByRole('button', {
    name: '适配画布宽度',
    exact: true,
  })
  const fit = editor.getByRole('button', { name: '适应画布全图', exact: true })
  const controls = editor.getByRole('group', {
    name: '画布视图操作',
    exact: true,
  })
  assert.deepEqual(
    await controls
      .locator('button')
      .evaluateAll((buttons) => buttons.map((button) => button.title)),
    ['适应全图', '适配宽度', '缩小', '放大', '重置 100%', '全屏探索'],
    '画布沿用 Mermaid 的工具顺序，比例为独立显示'
  )
  const controlSize = await controls.locator('button').first().boundingBox()
  assert.equal(controlSize.width, 32)
  assert.equal(controlSize.height, 32)
  const positions = () =>
    nodes.evaluateAll((items) =>
      items.map((item) => item.getAttribute('style'))
    )
  const original = await positions()
  const stored = await page.evaluate(() =>
    sessionStorage.getItem('plush-workbench:business-chain-design:working')
  )
  await fit.click()
  const fittedZoom = parseFloat(await zoom.textContent())
  await editor.getByRole('button', { name: '缩小画布', exact: true }).click()
  await editor.getByRole('button', { name: '缩小画布', exact: true }).click()
  const reducedZoom = await zoom.textContent()
  assert(Math.abs(parseFloat(reducedZoom) - fittedZoom / 1.44) <= 1, '缩小两次按当前适应比例连续缩放')
  const area = await canvas.boundingBox()
  const beforePan = await first.boundingBox()
  await page.mouse.move(area.x + area.width - 32, area.y + area.height - 24)
  await page.mouse.down()
  await page.mouse.move(area.x + area.width - 97, area.y + area.height - 59, {
    steps: 6,
  })
  await page.mouse.up()
  const afterPan = await first.boundingBox()
  assert(
    Math.abs(afterPan.x - beforePan.x + 65) < 1 &&
      Math.abs(afterPan.y - beforePan.y + 35) < 1,
    '拖动空白处只平移视图'
  )
  await editor
    .getByRole('button', { name: '平移画布，使用方向键移动视图', exact: true })
    .press('ArrowRight')
  assert(
    Math.abs((await first.boundingBox()).x - afterPan.x + 40) < 1,
    '方向键可平移画布'
  )
  await editor
    .getByRole('button', { name: '平移画布，使用方向键移动视图', exact: true })
    .press('ArrowLeft')
  await page.mouse.move(
    afterPan.x + afterPan.width / 2,
    afterPan.y + afterPan.height / 2
  )
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, -120)
  await page.keyboard.up('Control')
  await expect(zoom).not.toHaveText(reducedZoom)
  const zoomed = await first.boundingBox()
  assert(
    Math.abs(zoomed.x + zoomed.width / 2 - afterPan.x - afterPan.width / 2) < 1,
    '缩放围绕鼠标指向位置'
  )
  assert.deepEqual(
    await positions(),
    original,
    '缩放、平移、适应画布不改变节点坐标'
  )
  assert.deepEqual(
    contentWithoutCamera(await page.evaluate(() =>
      sessionStorage.getItem('plush-workbench:business-chain-design:working')
    )),
    contentWithoutCamera(stored),
    '镜头可暂存，查看操作不改画布内容'
  )

  const scale = zoomed.width / 176
  const beforeMove = await first.evaluate((node) => ({
    x: parseFloat(node.style.left),
    y: parseFloat(node.style.top),
  }))
  await page.mouse.move(
    zoomed.x + zoomed.width / 2,
    zoomed.y + zoomed.height / 2
  )
  await page.mouse.down()
  await page.mouse.move(
    zoomed.x + zoomed.width / 2 + 36,
    zoomed.y + zoomed.height / 2 + 24,
    { steps: 6 }
  )
  await page.mouse.up()
  const afterMove = await first.evaluate((node) => ({
    x: parseFloat(node.style.left),
    y: parseFloat(node.style.top),
  }))
  assert(
    Math.abs(afterMove.x - beforeMove.x - 36 / scale) < 1 &&
      Math.abs(afterMove.y - beforeMove.y - 24 / scale) < 1,
    '缩放后拖动仍使用正确的节点坐标'
  )
  await editor.getByRole('button', { name: '撤销', exact: true }).click()
  assert.deepEqual(await positions(), original)
  const from = await editor
    .getByRole('button', { name: '从销售订单拖出连线', exact: true })
    .boundingBox()
  const to = await editor
    .getByRole('button', { name: '查看节点：提交后启动受理', exact: true })
    .boundingBox()
  const beforeConnectionCanvas = await canvas.boundingBox()
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await expect(editor.getByRole('button', { name: '取消连线', exact: true })).toBeVisible()
  assert.deepEqual(await canvas.boundingBox(), beforeConnectionCanvas, '开始拖线时工具栏不推移画布')
  await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 6 })
  await page.mouse.up()
  await expect(editor.locator('[data-connection-status]')).toHaveAttribute(
    'data-connection-status',
    'known'
  )
  const card = await editor.locator('.erp-chain-design__card').boundingBox()
  assert(
    card.y >= area.y && card.y + card.height <= area.y + area.height + 1,
    '缩放后的接入条件卡片保持在画布内'
  )
  await editor.getByRole('button', { name: '取消连线', exact: true }).click()
  await searchWholeLibrary(editor)
  const source = editor
    .locator('.erp-chain-design__library-item')
    .filter({
      has: page.getByRole('button', { name: '加入：采购订单', exact: true }),
    })
  const dropArea = await canvas.boundingBox()
  await canvas.evaluate((element) => {
    element.addEventListener('drop', (event) => {
      element.dataset.dropPoint = JSON.stringify([event.clientX, event.clientY])
    }, { capture: true, once: true })
  })
  await source.dragTo(canvas, {
    targetPosition: { x: dropArea.width - 80, y: dropArea.height - 50 },
  })
  await expect(nodes).toHaveCount(4)
  const dropped = await editor
    .getByRole('button', { name: '查看节点：采购订单', exact: true })
    .boundingBox()
  const [dropX, dropY] = JSON.parse(await canvas.getAttribute('data-drop-point'))
  assert(
    Math.abs(dropped.x + dropped.width / 2 - dropX) < 2 &&
      Math.abs(dropped.y + dropped.height / 2 - dropY) < 2,
    '缩放和平移后拖入节点仍落在鼠标位置'
  )
  await editor.getByRole('button', { name: '撤销', exact: true }).click()

  await page.mouse.move(area.x + area.width / 2, area.y + area.height / 2)
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, -10000)
  await page.keyboard.up('Control')
  await expect(zoom).toHaveText('200%')
  await expect(
    editor.getByRole('button', { name: '放大画布', exact: true })
  ).toBeDisabled()
  await page.keyboard.down('Control')
  await page.mouse.wheel(0, 10000)
  await page.keyboard.up('Control')
  await expect(zoom).toHaveText('5%')
  await expect(
    editor.getByRole('button', { name: '缩小画布', exact: true })
  ).toBeDisabled()
  await reset.click()
  await expect(zoom).toHaveText('100%')
  await editor.getByRole('button', { name: '回到整体', exact: true }).click()
  await chooseDisplay(editor, '全部已载入节点')
  await expect(editor.locator('.erp-chain-design__mode')).toContainText('全部已载入节点')
  assert((await nodes.count()) > 10, '使用完整业务链路验证多个节点的总览')
  for (const width of [1440, 1024]) {
    await page.setViewportSize({ width, height: 900 })
    await fit.click()
    const viewport = await canvas.boundingBox()
    const allVisible = await editor
      .locator('[data-design-node], [data-design-edge]')
      .evaluateAll(
        (items, bounds) =>
          items.every((item) => {
            const rect = item.getBoundingClientRect()
            return (
              rect.left >= bounds.x &&
              rect.top >= bounds.y &&
              rect.right <= bounds.x + bounds.width + 1 &&
              rect.bottom <= bounds.y + bounds.height + 1
            )
          }),
        viewport
      )
    assert(allVisible, `宽度 ${width} 下适应画布能看全全部节点和连线`)
    await expect(fit).toBeInViewport()
  }
  await page.setViewportSize({ width: 1920, height: 720 })
  await editor.getByRole('button', { name: '全屏探索', exact: true }).click()
  await editor.locator('.ant-select').filter({ has: page.getByRole('combobox', { name: '流程布局', exact: true }) }).locator('.ant-select-selector').click()
  await page.locator('.ant-select-dropdown:visible').getByText('业务泳道', { exact: true }).click()
  await fit.click()
  const beforeFitWidth = await positions()
  const fitAllScale = parseFloat(await zoom.textContent())
  await fitWidth.click()
  await expect(fitWidth).toHaveAttribute('aria-pressed', 'true')
  await expect(fit).toHaveAttribute('aria-pressed', 'false')
  assert(
    parseFloat(await zoom.textContent()) >= fitAllScale,
    '适配宽度不受整图高度限制，便于阅读节点'
  )
  const widthBounds = await canvas.boundingBox()
  assert(
    await editor.locator('[data-design-node], [data-design-edge]').evaluateAll(
      (items, bounds) =>
        items.every((item) => {
          const rect = item.getBoundingClientRect()
          return (
            rect.left >= bounds.x &&
            rect.right <= bounds.x + bounds.width + 1 &&
            rect.top >= bounds.y
          )
        }),
      widthBounds
    ),
    '适配宽度完整保留横向内容，纵向从图的顶部开始'
  )
  assert(
    await nodes.evaluateAll(
      (items, bounds) =>
        items.some(
          (item) =>
            item.getBoundingClientRect().bottom > bounds.y + bounds.height
        ),
      widthBounds
    ),
    '长图按宽度适配时允许纵向超出视口'
  )
  const beforeVerticalPan = await first.boundingBox()
  await editor
    .getByRole('button', { name: '平移画布，使用方向键移动视图', exact: true })
    .press('ArrowDown')
  assert.equal(
    Math.round((await first.boundingBox()).y - beforeVerticalPan.y),
    -40,
    '适配宽度后可继续向下浏览长图'
  )
  assert.deepEqual(
    await positions(),
    beforeFitWidth,
    '两种适配只改变查看范围，节点位置不变'
  )
  await reset.click()
  await expect(zoom).toHaveText('100%')
  await expect(reset).toHaveAttribute('aria-pressed', 'true')
  await expect(fitWidth).toHaveAttribute('aria-pressed', 'false')
  await editor.getByRole('button', { name: '退出全屏', exact: true }).click()
  await page.setViewportSize({ width: 1024, height: 900 })
  await fit.click()
  const scene = await editor
    .locator('.erp-chain-design__surface')
    .getAttribute('style')
  await editor.getByRole('button', { name: '全屏探索', exact: true }).click()
  await editor.getByRole('button', { name: '退出全屏', exact: true }).click()
  assert.equal(
    await editor.locator('.erp-chain-design__surface').getAttribute('style'),
    scene,
    '进入和退出全屏保留缩放与平移位置'
  )
}
