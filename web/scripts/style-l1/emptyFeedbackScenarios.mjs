import { getContrastRatio, parseRgb } from './colorAssertions.mjs'
import { closeBusinessFormPage } from './businessFormPageAssertions.mjs'
import { RpcErrorCode } from '../../src/common/consts/errorCodes.js'

async function inspectFeedback(node) {
  await node.waitFor({ state: 'visible' })
  return node.evaluate((root) => {
    const style = getComputedStyle(root)
    const image = root.querySelector('.ant-empty-image')
    let surface = root
    while (
      surface.parentElement &&
      getComputedStyle(surface).backgroundColor === 'rgba(0, 0, 0, 0)'
    ) {
      surface = surface.parentElement
    }
    return {
      font: style.fontSize,
      lineHeight: style.lineHeight,
      padding: style.padding,
      image: image?.getBoundingClientRect().height ?? null,
      overflow: root.scrollWidth - root.clientWidth,
      color: style.color,
      background: getComputedStyle(surface).backgroundColor,
    }
  })
}

async function chooseState(page, demo, label) {
  await demo
    .locator(
      '.ant-select:has(input[aria-label="空提示状态"]) .ant-select-selector'
    )
    .click()
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option-content')
    .getByText(label, { exact: true })
    .click()
}

async function chooseScene(demo, label) {
  await demo
    .locator('[aria-label="空提示位置"]')
    .getByText(label, { exact: true })
    .click()
}

async function installMaterialReadStates(page) {
  let mode = 'empty'
  let release = () => {}
  let signalHold = () => {}
  let holdReady = Promise.resolve()
  const queries = []
  await page.route('**/rpc/masterdata', async (route) => {
    const body = route.request().postDataJSON()
    if (
      body?.method !== 'list_materials' ||
      body.params?.limit !== 50 ||
      body.params?.ids
    ) {
      return route.fallback()
    }
    queries.push(body.params)
    const responseMode = mode
    if (responseMode === 'hold') {
      await new Promise((resolve) => {
        release = resolve
        signalHold()
      })
    }
    return route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: body.id,
        result:
          responseMode === 'error' || responseMode === 'denied'
            ? {
                code:
                  responseMode === 'denied'
                    ? RpcErrorCode.PERMISSION_DENIED
                    : RpcErrorCode.INTERNAL,
                message: '模拟读取失败',
              }
            : {
                code: 0,
                data: {
                  materials: [],
                  total: 0,
                  offset: body.params.offset || 0,
                  limit: body.params.limit,
                },
              },
      }),
    })
  })
  return {
    queries,
    setMode: (value) => {
      mode = value
      if (value === 'hold') {
        holdReady = new Promise((resolve) => {
          signalHold = resolve
        })
      }
    },
    waitForHold: async () => {
      let timeout
      try {
        await Promise.race([
          holdReady,
          new Promise((_, reject) => {
            timeout = setTimeout(
              () => reject(new Error('没有收到预期的材料读取请求')),
              10000
            )
          }),
        ])
      } finally {
        clearTimeout(timeout)
      }
    },
    release: () => release(),
  }
}

export function createEmptyFeedbackScenarios({
  assert,
  assertNoHorizontalOverflow,
  customerRuntimeEffectiveSession,
  outputDir,
  path,
}) {
  return [
    {
      name: 'empty-feedback-standards-desktop',
      path: '/__dev/ui-design?page=controls&control=empty',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      verify: async (page) => {
        await page
          .locator('[aria-label="页面状态设备"]')
          .getByText('空提示规格', { exact: true })
          .click()
        const demo = page.locator('.erp-ui-empty-examples:visible')
        await demo.waitFor()
        const note = demo.getByRole('textbox', {
          name: '空提示样例备注',
          exact: true,
        })
        await note.fill('切换场景和错误状态后保留的备注')
        let metrics = await inspectFeedback(
          demo.locator('.erp-line-items-empty')
        )
        assert.equal(metrics.padding, '10px 12px')
        assert.equal(metrics.font, '14px')
        assert.equal(metrics.image, null)
        await demo
          .getByRole('button', { name: '添加订货明细', exact: true })
          .click()
        await demo
          .getByRole('textbox', { name: '样例第 1 行产品', exact: true })
          .fill('这是一条保留在当前明细的长产品名称'.repeat(3))
        await demo
          .getByRole('button', { name: '移除样例第 1 行', exact: true })
          .click()
        await demo
          .getByText('暂无订货明细，可先保存订单草稿', { exact: true })
          .waitFor()
        await chooseScene(demo, '列表区域')
        metrics = await inspectFeedback(
          demo.locator('[data-empty-demo="list"] .erp-empty')
        )
        assert.equal(metrics.padding, '24px 16px')
        assert.equal(metrics.image, 40)
        assert.equal(metrics.lineHeight, '22px')
        assert.ok(
          getContrastRatio(
            parseRgb(metrics.color),
            parseRgb(metrics.background)
          ) >= 4.5
        )
        await chooseState(page, demo, '筛选无结果')
        await demo
          .getByRole('button', { name: '清除条件', exact: true })
          .click()
        assert.equal(await demo.locator('.ant-table-row').count(), 2)
        await chooseState(page, demo, '读取失败')
        await demo.locator('[data-empty-state="error"][role="alert"]').waitFor()
        await demo
          .getByRole('button', { name: '重新加载', exact: true })
          .click()
        assert.equal(await demo.locator('.ant-table-row').count(), 2)
        await chooseState(page, demo, '正在读取')
        assert.equal(
          await demo.locator('[data-empty-demo="list"] .erp-empty').count(),
          0
        )
        await demo.locator('[data-read-state="loading"]').waitFor()
        await chooseState(page, demo, '无查看权限')
        assert.equal(
          await demo
            .getByRole('button', { name: '新建订单', exact: true })
            .isVisible(),
          false
        )
        await demo.locator('[data-empty-state="denied"]').waitFor()
        await chooseScene(demo, '下拉候选')
        await chooseState(page, demo, '暂无数据')
        await demo
          .getByRole('combobox', { name: '空提示样例材料', exact: true })
          .click()
        const popup = page.locator('.ant-select-dropdown:visible')
        metrics = await inspectFeedback(popup.locator('.erp-empty--compact'))
        assert.equal(metrics.padding, '12px')
        assert.equal(metrics.font, '13px')
        assert.equal(metrics.image, 28)
        await demo
          .getByRole('combobox', { name: '空提示样例材料', exact: true })
          .fill('未匹配的材料')
        await popup
          .getByRole('button', { name: '清除搜索', exact: true })
          .click()
        await popup.getByText('短毛绒 · 粉色 5mm', { exact: true }).click()
        await demo
          .getByText('已选择：短毛绒 · 粉色 5mm', { exact: true })
          .waitFor()
        await chooseScene(demo, '表单明细')
        assert.equal(await note.inputValue(), '切换场景和错误状态后保留的备注')
        await demo
          .getByRole('button', { name: '保存演示草稿', exact: true })
          .click()
        await demo.getByText('演示草稿已保存', { exact: true }).waitFor()
        await page.screenshot({
          path: path.join(outputDir, 'empty-feedback-form-4k.png'),
        })
        await page
          .locator('[aria-label="控件样例主题"]')
          .getByText('深色', { exact: true })
          .click()
        await chooseScene(demo, '列表区域')
        await chooseState(page, demo, '暂无数据')
        metrics = await inspectFeedback(
          demo.locator('[data-empty-demo="list"] .erp-empty')
        )
        assert.ok(
          getContrastRatio(
            parseRgb(metrics.color),
            parseRgb(metrics.background)
          ) >= 4.5
        )
        assert.equal(metrics.image, 40)
        await assertNoHorizontalOverflow(page)
      },
    },
    {
      name: 'empty-feedback-business-forms',
      path: '/erp/sales/project-orders/sales-orders',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      verify: async (page) => {
        const documents = [
          ['/erp/sales/project-orders/sales-orders', '新建订单', 'sales'],
          ['/erp/purchase/material-bom', '新建 BOM', 'bom'],
          ['/erp/purchase/accessories', '新建采购订单', 'purchase'],
          ['/erp/purchase/processing-contracts', '新建加工合同', 'outsourcing'],
        ]
        for (const [route, trigger, key] of documents) {
          if (new URL(page.url()).pathname !== route) {
            await page.goto(new URL(route, page.url()).href)
          }
          await page.getByRole('button', { name: trigger }).click()
          const editor = page.locator('.erp-business-form-page:not([hidden])')
          await editor.waitFor()
          if (key === 'sales' || key === 'bom') {
            const empty = editor.locator('.erp-line-items-empty')
            await empty.scrollIntoViewIfNeeded()
            const metrics = await inspectFeedback(empty)
            assert.equal(metrics.padding, '10px 12px')
            assert.equal(metrics.font, '14px')
            assert.ok(metrics.overflow <= 1)
            if (key === 'sales') {
              await editor
                .getByRole('button', { name: '添加订货明细', exact: true })
                .click()
              await editor.getByRole('button', { name: /移除行/ }).click()
              await empty.waitFor()
              await page.setViewportSize({ width: 390, height: 844 })
              await empty.scrollIntoViewIfNeeded()
              assert.equal((await inspectFeedback(empty)).padding, '10px 12px')
              await assertNoHorizontalOverflow(page)
              await page.setViewportSize({ width: 1920, height: 1080 })
              await empty.scrollIntoViewIfNeeded()
              await page.screenshot({
                path: path.join(outputDir, 'empty-feedback-sales-4k.png'),
              })
            }
          } else {
            assert.equal(
              await editor.locator('.erp-line-items-empty').count(),
              0,
              '至少一条明细的单据不显示空结果'
            )
          }
          await closeBusinessFormPage(page, editor)
        }
      },
    },
    {
      name: 'empty-feedback-reference-picker',
      path: '/erp/purchase/accessories',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        const reads = await installMaterialReadStates(page)
        try {
          await page.getByRole('button', { name: '新建采购订单' }).click()
          const editor = page.locator('.erp-business-form-page:not([hidden])')
          await editor.locator('#supplier_id').click()
          await page.locator('.ant-select-dropdown:visible .ant-select-item-option:not(.ant-select-item-option-disabled)').first().click()
          await editor.getByRole('button', { name: '从材料库添加' }).click()
          const picker = page.locator('.erp-source-import-picker-modal:visible')
          await picker.locator('[data-empty-state="empty"]').waitFor()
          reads.setMode('error')
          await picker
            .getByRole('button', { name: '重新加载', exact: true })
            .click()
          await picker
            .locator('[data-empty-state="error"][role="alert"]')
            .waitFor()
          assert.equal(
            await picker.locator('[data-empty-state="empty"]').count(),
            0
          )
          reads.setMode('hold')
          await picker
            .getByRole('button', { name: '重新加载', exact: true })
            .click()
          await picker.locator('.ant-spin-spinning').waitFor()
          await reads.waitForHold()
          assert.equal(
            await picker.locator('.erp-empty').count(),
            0,
            '读取中不显示无记录或旧错误'
          )
          reads.release()
          await picker.locator('[data-empty-state="empty"]').waitFor()
          reads.setMode('denied')
          await picker
            .getByRole('button', { name: '重新加载', exact: true })
            .click()
          await picker.locator('[data-empty-state="denied"]').waitFor()
          assert.equal(
            await picker
              .getByRole('button', { name: '重新加载', exact: true })
              .count(),
            0
          )
          assert.equal(
            await picker
              .locator('.erp-source-import-picker__import-count')
              .count(),
            0
          )
          await picker
            .getByRole('button', { name: '取消', exact: true })
            .click()
          await closeBusinessFormPage(page, editor)
        } finally {
          reads.release()
        }
      },
    },
    {
      name: 'empty-feedback-reference-dropdown',
      path: '/erp/purchase/material-bom',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        const reads = await installMaterialReadStates(page)
        try {
          await page.getByRole('button', { name: '新建 BOM' }).click()
          const editor = page.locator('.erp-business-form-page:not([hidden])')
          await editor
            .getByRole('button', { name: '添加物料', exact: true })
            .click()
          const control = editor.getByRole('combobox', {
            name: '物料名称 1',
            exact: true,
          })
          await control.click()
          const popup = page.locator('.ant-select-dropdown:visible')
          await popup.getByText('暂无可选物料', { exact: true }).waitFor()
          await control.fill('未匹配的材料')
          await popup.getByText('未找到对应物料', { exact: true }).waitFor()
          await popup
            .getByRole('button', { name: '清除搜索', exact: true })
            .click()
          await popup.getByText('暂无可选物料', { exact: true }).waitFor()
          assert.equal(await control.inputValue(), '')
          assert.equal(reads.queries.at(-1).keyword, '')
          reads.setMode('error')
          await control.fill('失败时保留的搜索词')
          await popup.locator('[data-empty-state="error"]').waitFor()
          assert.equal(await control.inputValue(), '失败时保留的搜索词')
          reads.setMode('hold')
          await popup
            .getByRole('button', { name: '重试读取', exact: true })
            .click()
          await popup.locator('[data-read-state="loading"]').waitFor()
          await reads.waitForHold()
          assert.equal(await popup.locator('.erp-empty').count(), 0)
          reads.release()
          await popup.getByText('未找到对应物料', { exact: true }).waitFor()
          reads.setMode('denied')
          await control.fill('核对权限')
          await popup.locator('[data-empty-state="denied"]').waitFor()
          assert.equal(
            await popup
              .getByRole('button', { name: '重试读取', exact: true })
              .count(),
            0
          )
          await control.press('Escape')
          await closeBusinessFormPage(page, editor)
        } finally {
          reads.release()
        }
      },
    },
  ]
}
