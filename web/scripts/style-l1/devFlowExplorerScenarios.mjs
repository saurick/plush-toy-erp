import fs from 'node:fs/promises'
import { expect } from 'playwright/test'
import { createFlowExplorerExportScenario } from './devFlowExplorerExportScenario.mjs'

const savedKey = 'plush-workbench:business-chain-design'
const workingKey = `${savedKey}:working`
const savedViews = [
  {
    id: 'existing-explorer-view',
    name: '已有采购视图',
    draft: {
      nodes: [{ id: 'node:purchase_order', x: 96, y: 80, manual: true }],
      edges: [],
      ideas: [{ text: '保留原来的阅读备注' }],
      presentation: { mode: 'all', role: '' },
    },
  },
]

export function createDevFlowExplorerScenarios({
  assert,
  assertNoHorizontalOverflow,
  startNoWriteAudit,
}) {
  const writes = new WeakMap()
  return [
    createFlowExplorerExportScenario({ assert, assertNoHorizontalOverflow, startNoWriteAudit }),
    createFlowExplorerReadingScenario({ assert, assertNoHorizontalOverflow, startNoWriteAudit }),
    {
      name: 'dev-flow-explorer-navigation-desktop',
      path: '/__dev/flow-explorer',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      beforeNavigate: async (page) => {
        startNoWriteAudit(page, writes)
        await page.addInitScript(
          ({ key, views }) => {
            if (!localStorage.getItem(key)) {
              localStorage.setItem(key, JSON.stringify(views))
            }
          },
          { key: savedKey, views: savedViews }
        )
      },
      verify: async (page) => {
        const editor = page.getByRole('region', {
          name: '流程探索',
          exact: true,
        })
        const readSaved = () =>
          page.evaluate((key) => localStorage.getItem(key), savedKey)
        const readWorking = () =>
          page.evaluate((key) => sessionStorage.getItem(key), workingKey)
        await expect(editor.locator('.erp-chain-design__layout-filter')).toContainText('阶段排布')
        await expect(
          page.getByRole('heading', { name: '流程探索', level: 1 })
        ).toBeVisible()
        await expect(
          page.getByRole('link', { name: '流程探索', exact: true })
        ).toHaveAttribute('aria-current', 'page')
        const labels = await page
          .getByRole('group', { name: '产品与业务工作入口' })
          .getByRole('link')
          .allTextContents()
        assert.equal(labels[labels.indexOf('业务链路') + 1], '流程探索')
        await expect(
          editor.locator('.erp-chain-design__draft-select')
        ).toContainText('已有采购视图')
        await expect(
          editor.getByRole('button', {
            name: '查看节点：采购订单',
            exact: true,
          })
        ).toBeVisible()
        const savedBefore = await readSaved()
        await assertCompactExplorerLayout(page, editor, assert, assertNoHorizontalOverflow)
        await editor.getByRole('button', { name: '全库', exact: true }).click()
        await editor
          .getByRole('button', { name: '加入：预留现有成品', exact: true })
          .click()
        await editor
          .getByRole('button', { name: '关闭画布说明', exact: true })
          .click()
        const workingBefore = await readWorking()
        await page
          .getByRole('link', { name: '业务专题', exact: true })
          .click()
        await expect(page.locator('[data-topic-diagram]')).toBeVisible()
        await page.getByRole('link', { name: '流程探索', exact: true }).click()
        await expect(
          editor.getByRole('status', { name: '视图保存状态' })
        ).toHaveText('未保存')
        assert.equal(await readWorking(), workingBefore)
        await page.reload()
        await expect(editor).toBeVisible()
        assert.equal(await readWorking(), workingBefore)
        assert.equal(await readSaved(), savedBefore)

      await page.goto(new URL(
        '/__dev/business-topics?flow_topic=purchase_to_inventory&flow_topic_node=purchase_order&flow_role=purchase',
        page.url()
      ).href)
        await expect(
          page.getByRole('region', {
            name: '采购下单到入库应付关系图',
            exact: true,
          })
        ).toHaveAttribute('data-graph-status', 'rendered')
        const opener = page.getByRole('button', {
          name: '从此节点探索',
          exact: true,
        })
        await opener.scrollIntoViewIfNeeded()
        const source = {
          url: page.url(),
          scroll: await page.evaluate(() => window.scrollY),
        }
        await opener.click()
        await expect(page).toHaveURL(/\/__dev\/flow-explorer$/u)
        await expect(
        editor.getByLabel('当前探索范围', { exact: true })
        ).toContainText('采购订单')
        const focused = await readWorking()
        await page.reload()
        await expect(editor).toBeVisible()
        assert.equal(await readWorking(), focused)
        await page.goBack()
        await expect(page).toHaveURL(source.url)
        await expect(opener).toBeFocused()
        await expect
          .poll(() => page.evaluate(() => window.scrollY))
          .toBeCloseTo(source.scroll, 0)
        await page
          .getByRole('button', { name: '在流程探索中打开', exact: true })
          .click()
        await expect(editor).toBeVisible()
        await expect
          .poll(async () => JSON.parse(await readWorking()).draft.map.scope)
          .toBe('whole')
        assert.equal(
          await readSaved(),
          savedBefore,
          '进入、返回及刷新不覆盖已有保存内容'
        )
        await assertNoHorizontalOverflow(page)
        assert.deepEqual(writes.get(page), [], '探索与保存只使用浏览器视图存储')
      },
    },
  ]
}

function createFlowExplorerReadingScenario({ assert, assertNoHorizontalOverflow, startNoWriteAudit }) {
  const writes = new WeakMap()
  return {
    name: 'dev-flow-explorer-reading-desktop',
    path: '/__dev/flow-explorer',
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    beforeNavigate: (page) => startNoWriteAudit(page, writes),
    verify: async (page) => {
      const editor = page.getByRole('region', { name: '流程探索', exact: true })
      const canvas = editor.getByRole('region', { name: '流程探索画布', exact: true })
      const card = editor.locator('.erp-chain-design__card')
      const surface = editor.locator('.erp-chain-design__surface')
      const camera = () => surface.evaluate((element) => element.style.transform)
      const nodePositions = () => editor.locator('[data-design-node]').evaluateAll((nodes) => nodes.map((node) => ({ id: node.dataset.designNode, x: node.style.left, y: node.style.top })))
      const choose = async (label, value) => {
        await editor.locator('.ant-select').filter({ has: page.getByRole('combobox', { name: label, exact: true }) }).locator('.ant-select-selector').click()
        await page.locator('.ant-select-dropdown:visible .ant-select-item-option').getByText(value, { exact: true }).click()
      }
      const click = (name) => editor.getByRole('button', { name, exact: true }).click()
      const search = editor.getByRole('textbox', { name: '搜索业务节点', exact: true })
      await expect(editor.locator('[data-design-node^="map:"]')).toHaveCount(11)
      await expect(editor.getByRole('radio', { name: '业务步骤', exact: true })).toBeDisabled()
      await click('查看节点：销售受理到生产准备')
      await expect(card).toContainText('用途与交接')
      await expect(card).toContainText('从什么开始')
      await expect(card).toContainText('交出什么结果')
      await click('关闭画布说明')
      await choose('选择流程范围', '销售受理到生产准备')
      await expect(editor.locator('.erp-chain-design__layout-filter')).toContainText('业务泳道')
      await expect(canvas.locator('[data-design-node$=":reject_sales_order"]')).toHaveCount(0)
      await expect(editor.locator('.erp-chain-design__lane')).toHaveCount(6)
      const laneStyles = await editor.locator('.erp-chain-design__lane').evaluateAll((lanes) => lanes.map((lane) => {
        const style = getComputedStyle(lane)
        return { background: style.backgroundColor, border: style.borderTopColor, borderWidth: parseFloat(style.borderTopWidth), labelColor: getComputedStyle(lane.querySelector('strong')).color }
      }))
      assert.equal(new Set(laneStyles.map((lane) => lane.background)).size, 6, '各领域泳道使用各自底色')
      assert(laneStyles.every((lane) => lane.borderWidth >= 1 && lane.background !== lane.border && lane.labelColor !== lane.background), '底色、边界与标题保持可区分的层次')
      await click('适应画布全图')
      await expect.poll(() => canvas.locator('.erp-chain-design__lane').evaluateAll((lanes) => lanes.every((lane) => {
        const area = lane.closest('.erp-chain-design__viewport').getBoundingClientRect()
        const box = lane.getBoundingClientRect()
        return box.left >= area.left && box.right <= area.right + 1 && box.top >= area.top && box.bottom <= area.bottom + 1
      })), { message: '适应全图包含完整泳道标题和边框' }).toBe(true)
      const mainlinePositions = await nodePositions()
      if (process.env.STYLE_L1_OUTPUT_DIR) {
        await page.screenshot({ path: `${process.env.STYLE_L1_OUTPUT_DIR}/swimlane-mainline.png` })
        await fs.writeFile(`${process.env.STYLE_L1_OUTPUT_DIR}/swimlane-styles.json`, JSON.stringify(laneStyles, null, 2))
      }
      await click('展开分支')
      await expect(canvas.locator('[data-design-node$=":reject_sales_order"]')).toHaveCount(2)
      await click('收起分支')
      await expect(canvas.locator('[data-design-node$=":reject_sales_order"]')).toHaveCount(0)
      assert.deepEqual(await nodePositions(), mainlinePositions, '展开收起分支不改变主线节点位置')
      await choose('选择流程范围', '采购下单到入库应付')
      await click('适应画布全图')
      const normalPositions = await nodePositions()
      const normalCamera = await camera()
      await click('查看节点：自动建立逐行待检 IQC')
      assert.equal(await camera(), normalCamera, '选中节点不改变镜头')
      const selectedPositions = await nodePositions()
      for (const previous of normalPositions) assert.deepEqual(selectedPositions.find((node) => node.id === previous.id), previous, '原位查看不移动原节点')
      await expect(card.getByLabel('已登记上游', { exact: true })).toContainText('上游 · 2')
      await expect(card.getByLabel('已登记下游', { exact: true })).toContainText('下游 · 2')
      await card.getByRole('tab', { name: '状态', exact: true }).click()
      await expect(card.locator('.ant-select').filter({ has: page.getByRole('combobox', { name: '查看状态对象', exact: true }) })).toContainText('质量检验')
      await expect(card.locator('[data-business-flow]')).toHaveAttribute('data-graph-status', 'rendered')
      await click('关闭画布说明')
      await search.fill('创建来料纠正检验')
      await search.press('Enter')
      const beforeInspect = await camera()
      await click('查看：创建来料纠正检验')
      await expect(canvas).toHaveAttribute('data-view-mode', 'mainline')
      await expect(canvas.getByRole('button', { name: '查看节点：创建来料纠正检验', exact: true })).toHaveCount(0)
      assert.equal(await camera(), beforeInspect, '目录详情不隐式展开或缩放')
      await card.getByRole('button', { name: '展开此节点', exact: true }).click()
      await expect(canvas.getByRole('button', { name: '查看节点：创建来料纠正检验', exact: true })).toBeVisible()
      await click('关闭画布说明')
      await click('查看节点：提交采购订单')
      await card.getByRole('tab', { name: '审批', exact: true }).click()
      await card.getByRole('tab', { name: '查看驳回采购订单路径', exact: true }).click()
      await expect(card.locator('[data-business-flow]')).toHaveAttribute('data-graph-status', 'rendered')
      await expect(editor.locator('[data-design-edge][data-highlighted][data-edge-to$=":reject_purchase_order"]')).toHaveCount(1)
      await expect(editor.locator('[data-design-edge][data-highlighted][data-edge-to$=":approve_purchase_order"]')).toHaveCount(0)
      assert(await editor.locator('[data-design-edge][data-highlighted] .erp-chain-design__edge').evaluateAll((lines) => lines.every((line) => {
        const markerId = /^url\(#(.+)\)$/.exec(line.getAttribute('marker-end'))?.[1]
        const arrow = document.getElementById(markerId)?.querySelector('path')
        return arrow && getComputedStyle(arrow).fill === getComputedStyle(line).stroke
      })), '所选审批路径的线条与箭头使用同一高亮色')
      await click('关闭画布说明')
      await search.fill('IQC')
      await search.press('Enter')
      await click('查看节点：自动建立逐行待检 IQC')
      await choose('查看一条链路交接', '质检拒绝进入处置')
      const returnCamera = await camera()
      await card.getByRole('button', { name: '进入目标链', exact: true }).click()
      await expect(editor.locator('.erp-chain-design__toolbar')).toContainText('采购拒收处置')
      await search.fill('补换')
      await search.press('Enter')
      await click('返回来处')
      await expect(search).toHaveValue('IQC')
      assert.equal(await camera(), returnCamera, '跨链返回恢复镜头')
      await expect(card).toContainText('质检拒绝进入处置')
      await click('关闭画布说明')
      await click('调整布局')
      const movable = editor.getByRole('button', { name: '查看节点：提交采购订单', exact: true })
      const beforeMove = await nodePositions()
      const box = await movable.boundingBox()
      await page.mouse.move(box.x + 45, box.y + 30)
      await page.mouse.down()
      await page.mouse.move(box.x + 85, box.y + 55, { steps: 6 })
      await page.mouse.up()
      await click('撤销')
      assert.deepEqual(await nodePositions(), beforeMove, '撤销还原坐标')
      await expect(search).toHaveValue('IQC')
      await click('调整布局')
      await editor.getByRole('tab', { name: '员工定位示例', exact: true }).click()
      const example = editor.getByRole('region', { name: '员工定位示例', exact: true })
      const notes = example.getByRole('textbox', { name: '检查备注（模拟草稿）', exact: true })
      await notes.fill('核对 A 行后继续填写')
      await example.getByRole('button', { name: '在规则图定位此环', exact: true }).click()
      await expect(card.locator('.ant-select').filter({ has: page.getByRole('combobox', { name: '选择要观察的状态', exact: true }) })).toContainText('已提交')
      await expect.poll(() => canvas.locator('[data-design-node][data-selected]').evaluate((node) => {
        const area = node.closest('.erp-chain-design__viewport').getBoundingClientRect()
        const box = node.getBoundingClientRect()
        return box.left >= area.left && box.right <= area.right + 1 && box.top >= area.top && box.bottom <= area.bottom + 1
      }), { message: '从员工示例定位后，所选步骤完整出现在可见画布内' }).toBe(true)
      await click('返回员工示例')
      await expect(notes).toHaveValue('核对 A 行后继续填写')
      await example.getByRole('tab', { name: 'B 行 · 检验通过', exact: true }).click()
      await expect(example).toContainText('已通过，尚未入库')
      await editor.getByRole('tab', { name: '规则探索', exact: true }).click()
      await click('保存视图')
      const dialog = page.getByRole('dialog', { name: '保存本地视图', exact: true })
      await dialog.getByRole('textbox', { name: '视图名称', exact: true }).fill('流程阅读验证')
      await dialog.getByRole('button', { name: '保存', exact: true }).click()
      await expect(dialog).toBeHidden()
      const savedCamera = await camera()
      await page.reload()
      await expect(editor.locator('.erp-chain-design__draft-select')).toContainText('流程阅读验证')
      await expect.poll(camera).toBe(savedCamera)
      await choose('流程布局', '业务泳道')
      await choose('岗位高亮', '仓库')
      await click('适应画布全图')
      await click('查看节点：自动建立逐行待检 IQC')
      await search.fill('采购')
      await search.press('Enter')
      const list = editor.getByLabel('可加入的节点', { exact: true })
      await list.evaluate((element) => { element.scrollTop = 120 })
      const readWorking = () => page.evaluate((key) => JSON.parse(sessionStorage.getItem(key)), workingKey)
      const readSaved = () => page.evaluate((key) => localStorage.getItem(key), savedKey)
      await expect.poll(async () => (await readWorking()).draft.presentation?.viewport?.mode).toBe('fit-all')
      const beforeBlank = { working: await readWorking(), camera: await camera(), saved: await readSaved(), scroll: await list.evaluate((element) => element.scrollTop), nodes: await nodePositions() }
      assert(beforeBlank.scroll > 0, '使用已滚动的节点库验证原页不变')
      await click('更多视图操作')
      const newView = page.getByRole('link', { name: '在新标签页新建', exact: true })
      await expect(newView).toHaveAttribute('target', '_blank')
      await expect(newView).toHaveAttribute('rel', 'noopener noreferrer')
      const newPage = page.context().waitForEvent('page')
      await newView.click()
      const blankPage = await newPage
      try {
        startNoWriteAudit(blankPage, writes)
        const blankEditor = blankPage.getByRole('region', { name: '流程探索', exact: true })
        await expect(blankEditor).toBeVisible()
        await expect(blankPage).toHaveURL(/\/__dev\/flow-explorer$/u)
        await expect(blankEditor.locator('[data-design-node]')).toHaveCount(0)
        await expect(blankEditor.getByLabel('当前探索范围', { exact: true })).toHaveText('空白画布 · 尚未加载链路')
        await expect(blankEditor.locator('.erp-chain-design__toolbar')).toContainText('尚未加载链路')
        await expect(blankEditor.locator('.erp-chain-design__draft-select')).toContainText('未命名视图')
        if (process.env.STYLE_L1_OUTPUT_DIR) await blankPage.screenshot({ path: `${process.env.STYLE_L1_OUTPUT_DIR}/native-blank-tab.png` })
        assert.equal(await blankPage.evaluate(() => window.opener === null), true, '新页使用原生隔离标签，不保留 opener')
        assert.equal((await blankPage.evaluate((key) => JSON.parse(sessionStorage.getItem(key)), workingKey)).currentId, null)
        await expect(page.getByRole('dialog', { name: '当前视图有未保存修改', exact: true })).toHaveCount(0)
        assert.deepEqual(await readWorking(), beforeBlank.working, '新建不改写原标签页草稿')
        assert.equal(await readSaved(), beforeBlank.saved, '新建不修改共享命名视图')
        await blankEditor.getByRole('button', { name: '加载业务全流程地图', exact: true }).click()
        await expect(blankEditor.locator('[data-design-node^="map:"]')).toHaveCount(11)
        await blankEditor.getByRole('button', { name: '保存视图', exact: true }).click()
        const nameDialog = blankPage.getByRole('dialog', { name: '保存本地视图', exact: true })
        await nameDialog.getByRole('textbox', { name: '视图名称', exact: true }).fill('新标签页探索')
        await nameDialog.getByRole('button', { name: '保存', exact: true }).click()
        await expect(nameDialog).toBeHidden()
        await blankPage.reload()
        await expect(blankEditor.locator('.erp-chain-design__draft-select')).toContainText('新标签页探索')
        await expect(blankEditor.locator('[data-design-node^="map:"]')).toHaveCount(11)
        const entries = JSON.parse(await readSaved())
        const original = JSON.parse(beforeBlank.saved)[0]
        assert.deepEqual(entries.find((item) => item.id === original.id), original, '新页保存不会覆盖原命名视图')
        assert(entries.some((item) => item.name === '新标签页探索'))
        assert.deepEqual(writes.get(blankPage), [], '新页探索和保存不调用业务写接口')
      } finally {
        await blankPage.close()
      }
      assert.deepEqual(await readWorking(), beforeBlank.working, '关闭新标签页后原草稿保持不变')
      assert.equal(await camera(), beforeBlank.camera)
      assert.deepEqual(await nodePositions(), beforeBlank.nodes)
      await expect(card).toContainText('自动建立逐行待检 IQC')
      await expect(search).toHaveValue('采购')
      assert.equal(await list.evaluate((element) => element.scrollTop), beforeBlank.scroll)
      await assertCurrentPageNewView(page, editor, assert)
      await choose('选择流程范围', '业务全流程地图')
      await click('查看节点：销售受理到生产准备')
      await expect(card).toContainText('用途与交接')
      await assertNoHorizontalOverflow(page)
      await click('关闭画布说明')
      await choose('选择流程范围', '销售受理到生产准备')
      await expect(editor.locator('.erp-chain-design__layout-filter')).toContainText('业务泳道')
      await choose('流程布局', '阶段排布')
      await click('展开分支')
      await click('保存视图')
      const retained = page.getByRole('dialog', { name: '保存本地视图', exact: true })
      await retained.getByRole('textbox', { name: '视图名称', exact: true }).fill('保留阶段排布与分支')
      await retained.getByRole('button', { name: '保存', exact: true }).click()
      await expect(retained).toBeHidden()
      const savedBeforeReload = await page.evaluate((key) => localStorage.getItem(key), savedKey)
      await page.reload()
      await expect(editor.locator('.erp-chain-design__layout-filter')).toContainText('阶段排布')
      await expect(editor.getByRole('button', { name: '收起分支', exact: true })).toHaveAttribute('aria-pressed', 'true')
      await expect(canvas.locator('[data-design-node$=":reject_sales_order"]')).toHaveCount(2)
      assert.equal(await page.evaluate((key) => localStorage.getItem(key), savedKey), savedBeforeReload, '刷新不改写旧视图选择')
      assert.deepEqual(writes.get(page), [], '流程阅读和模拟示例不调用业务写接口')
    },
  }
}

async function assertCurrentPageNewView(page, editor, assert) {
  const click = (name) => editor.getByRole('button', { name, exact: true }).click()
  const confirm = page.getByRole('dialog', { name: '当前视图有未保存修改', exact: true })
  const naming = page.getByRole('dialog', { name: '保存本地视图', exact: true })
  const snapshot = () => page.evaluate(({ savedKey, workingKey }) => ({
    saved: localStorage.getItem(savedKey),
    working: sessionStorage.getItem(workingKey),
    camera: document.querySelector('.erp-chain-design__surface').style.transform,
    search: document.querySelector('input[aria-label="搜索业务节点"]').value,
    scroll: document.querySelector('.erp-chain-design__library-list').scrollTop,
  }), { savedKey, workingKey })
  const chooseChain = async (name) => {
    await editor.locator('.ant-select').filter({ has: page.getByRole('combobox', { name: '选择流程范围', exact: true }) }).locator('.ant-select-selector').click()
    await page.locator('.ant-select-dropdown:visible .ant-select-item-option').getByText(name, { exact: true }).click()
  }
  const failStorage = (storageName) => page.evaluate(({ storageName, savedKey, workingKey }) => {
    const original = Storage.prototype.setItem
    window.__restoreFlowViewStorage = () => { Storage.prototype.setItem = original; delete window.__restoreFlowViewStorage }
    Storage.prototype.setItem = function failViewStorage(key, value) {
      if (this === window[storageName] && key === (storageName === 'localStorage' ? savedKey : workingKey)) throw new DOMException('Test storage limit', 'QuotaExceededError')
      return original.call(this, key, value)
    }
  }, { storageName, savedKey, workingKey })
  const restoreStorage = () => page.evaluate(() => window.__restoreFlowViewStorage?.())
  const assertBlank = async () => {
    await expect(editor.locator('[data-design-node]')).toHaveCount(0)
    await expect(editor.getByLabel('当前探索范围', { exact: true })).toHaveText('空白画布 · 尚未加载链路')
    await expect(editor.getByRole('button', { name: '撤销', exact: true })).toBeDisabled()
    await expect(editor.getByRole('button', { name: '重做', exact: true })).toBeDisabled()
  }
  const original = await snapshot()
  const url = page.url()
  const tabCount = page.context().pages().length
  await expect(editor.getByRole('button', { name: '另存一份', exact: true })).toHaveCount(0)
  await expect(editor.getByRole('link', { name: '新建空白视图', exact: true })).toHaveCount(0)
  await click('新建空白视图')
  await expect(confirm).toContainText('再新建空白视图')
  if (process.env.STYLE_L1_OUTPUT_DIR) await page.screenshot({ path: `${process.env.STYLE_L1_OUTPUT_DIR}/new-view-unsaved-confirmation.png` })
  await confirm.getByRole('button', { name: '取消', exact: true }).click()
  assert.deepEqual(await snapshot(), original, '取消新建完整保留原图、镜头、筛选和滚动')

  await click('新建空白视图')
  await failStorage('localStorage')
  try {
    await confirm.getByRole('button', { name: '保存并新建', exact: true }).click()
    await expect(confirm.getByRole('alert')).toContainText('保存失败')
    assert.deepEqual(await snapshot(), original, '保存失败不切换、不丢草稿、不覆盖原保存内容')
  } finally { await restoreStorage() }
  await confirm.getByRole('button', { name: '保存并新建', exact: true }).click()
  await expect(confirm).toBeHidden()
  await assertBlank()
  const updated = JSON.parse((await snapshot()).saved).find((item) => item.id === JSON.parse(original.working).currentId)
  assert.deepEqual(updated.draft, JSON.parse(original.working).draft, '保存成功后原视图保留完整编辑内容')
  assert.equal(page.context().pages().length, tabCount, '默认新建不增加浏览器标签页')
  assert.equal(page.url(), url, '默认新建不增加路由导航')
  await click('新建空白视图')
  await expect(confirm).toHaveCount(0)
  await assertBlank()

  await chooseChain('销售受理到生产准备')
  const unnamed = await snapshot()
  await click('新建空白视图')
  await confirm.getByRole('button', { name: '保存并新建', exact: true }).click()
  await naming.getByRole('button', { name: '保存', exact: true }).click()
  await expect(naming.getByRole('alert')).toContainText('请输入')
  await naming.getByRole('button', { name: '取消', exact: true }).click()
  assert.deepEqual(await snapshot(), unnamed, '未命名保存取消后仍保留原探索')
  await click('新建空白视图')
  await confirm.getByRole('button', { name: '保存并新建', exact: true }).click()
  await naming.getByRole('textbox', { name: '视图名称', exact: true }).fill('当前页新建前保留')
  await naming.getByRole('button', { name: '保存', exact: true }).click()
  await expect(naming).toBeHidden()
  await assertBlank()
  assert(JSON.parse((await snapshot()).saved).some((item) => item.name === '当前页新建前保留'))

  await chooseChain('采购下单到入库应付')
  const discard = await snapshot()
  await click('新建空白视图')
  await failStorage('sessionStorage')
  try {
    await confirm.getByRole('button', { name: '放弃并新建', exact: true }).click()
    await expect(confirm.getByRole('alert')).toContainText('暂存失败')
    assert.deepEqual(await snapshot(), discard, '空白暂存失败时保留当前草稿及原图')
  } finally { await restoreStorage() }
  await confirm.getByRole('button', { name: '放弃并新建', exact: true }).click()
  await expect(confirm).toBeHidden()
  await assertBlank()
  assert.equal((await snapshot()).saved, discard.saved, '放弃只丢弃当前草稿，不改已保存列表')
  await page.reload()
  await assertBlank()
  assert.equal(page.context().pages().length, tabCount)
}

async function assertCompactExplorerLayout(page, editor, assert, assertNoHorizontalOverflow) {
  const canvas = editor.getByRole('region', { name: '流程探索画布', exact: true })
  const canvasGeometry = () => canvas.evaluate((element) => {
    const box = element.getBoundingClientRect()
    return { x: box.x + scrollX, y: box.y + scrollY, width: box.width, height: box.height }
  })
  const search = editor.getByRole('textbox', { name: '搜索业务节点', exact: true })
  const list = editor.getByLabel('可加入的节点', { exact: true })
  const readViews = () => page.evaluate(({ saved, working }) => ({
    saved: localStorage.getItem(saved), working: sessionStorage.getItem(working),
  }), { saved: savedKey, working: workingKey })
  const original = await readViews()
  await page.setViewportSize({ width: 1920, height: 816 })
  const initial = await canvas.boundingBox()
  assert(initial.height >= 560, '常见桌面窗口保留至少 560px 画布，容纳入口及范围两行页头')
  const libraryWidth = (await editor.getByRole('complementary', { name: '业务节点库', exact: true }).boundingBox()).width
  const visibleItems = await list.evaluate((element) => {
    const area = element.getBoundingClientRect()
    return [...element.children].filter((node) => {
      const box = node.getBoundingClientRect()
      return box.top >= area.top && box.bottom <= area.bottom
    }).length
  })
  assert(visibleItems >= 5, '节点库首屏完整展示至少五项，并保留原字号和搜索筛选')
  await search.fill('采购')
  await search.press('Enter')
  await list.evaluate((element) => { element.scrollTop = 160 })
  const scrollTop = await list.evaluate((element) => element.scrollTop)
  await editor.getByRole('button', { name: '收起节点库', exact: true }).click()
  await expect(search).toBeHidden()
  await expect.poll(async () => (await canvas.boundingBox()).width,
    { message: '收起节点库把横向空间交还画布' }).toBeGreaterThanOrEqual(initial.width + libraryWidth - 1)
  await editor.getByRole('button', { name: '展开节点库', exact: true }).click()
  await expect(search).toHaveValue('采购')
  assert.equal(await list.evaluate((element) => element.scrollTop), scrollTop, '展开后保留节点库滚动位置')
  await search.fill('')
  await search.press('Enter')
  await list.evaluate((element) => { element.scrollTop = 0 })
  for (const size of [
    { width: 1920, height: 816 },
    { width: 1280, height: 720 },
    { width: 1024, height: 768 },
  ]) {
    await page.setViewportSize(size)
    await assertNoHorizontalOverflow(page)
    await expect(editor.getByRole('button', { name: '保存视图', exact: true })).toBeInViewport()
    const beforeLegend = await canvasGeometry()
    const trigger = editor.getByRole('button', { name: '图例与操作说明', exact: true })
    await trigger.click()
    const legend = editor.getByRole('dialog', { name: '画布图例', exact: true })
    await expect(legend).toBeVisible()
    await expect(legend.locator('[data-type]')).toHaveCount(9)
    const bounds = await legend.boundingBox()
    assert(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= size.width && bounds.y + bounds.height <= size.height, '图例一键可看且不超出窗口')
    assert.deepEqual(await canvasGeometry(), beforeLegend, '打开图例不挤动画布；短窗口滚动不改变文档内布局')
    await legend.press('Escape')
    await expect(legend).toBeHidden()
    await expect(trigger).toBeFocused()
  }
  assert.deepEqual(await readViews(), original, '布局收起、搜索、图例和窗口变化均不改保存或草稿')
  await page.setViewportSize({ width: 1920, height: 1080 })
}
