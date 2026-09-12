const headerSelector =
  '.erp-business-data-table-card .ant-table-thead:not([aria-hidden="true"]) .erp-module-column-header-text'

const cases = [
  {
    key: 'customers',
    path: '/erp/master/partners/customers',
    visible: ['编号', '名称', '状态', '付款条件'],
    detail: ['简称', '税号', '默认收货信息'],
  },
  {
    key: 'suppliers',
    path: '/erp/master/partners/suppliers',
    visible: ['编号', '名称', '状态', '联系电话'],
    detail: ['简称', '税号', '经营 / 加工地址'],
  },
  {
    key: 'products',
    path: '/erp/master/products',
    visible: ['产品编号', '产品名称', '状态', '客户款号'],
    detail: ['英文品名', '海关编码（HS Code）'],
  },
  {
    key: 'sales',
    path: '/erp/sales/project-orders/sales-orders',
    visible: ['订单号', '客户', '状态', '订单总额', '币种', '计划交付日期'],
    detail: [
      '联系人',
      '货款金额',
      '计税方式 / 税率',
      '税额',
      '运费条件',
      '报价运费',
      '收货信息',
    ],
  },
  {
    key: 'purchase',
    path: '/erp/purchase/accessories',
    visible: [
      '采购单号',
      '供应商',
      '状态',
      '预计到货日期',
      '供应商确认到货日期',
    ],
    detail: ['收货地址'],
  },
  {
    key: 'shipments',
    path: '/erp/warehouse/shipments',
    visible: ['出货单号', '状态', '客户', '收货信息'],
    detail: ['唛头'],
  },
]

async function downloadedText(download) {
  const stream = await download.createReadStream()
  const chunks = []
  for await (const chunk of stream) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

export function createBusinessFieldDensityScenarios(deps) {
  const {
    assert,
    gotoScenarioPath,
    customerRuntimeEffectiveSession,
    assertNoHorizontalOverflow,
  } = deps
  const assertHeaders = async (page, entry) => {
    await page
      .locator(headerSelector)
      .filter({ hasText: entry.visible[0] })
      .first()
      .waitFor()
    const labels = (await page.locator(headerSelector).allTextContents()).map(
      (text) => text.trim()
    )
    for (const label of entry.visible)
      assert.ok(labels.includes(label), `${entry.key}: 保留 ${label}`)
    for (const label of entry.detail)
      assert.ok(!labels.includes(label), `${entry.key}: ${label} 应在详情查看`)
    if (page.viewportSize().width >= 1280) {
      const scanLabels = ['customers', 'sales'].includes(entry.key)
        ? entry.visible
        : entry.visible.slice(0, 3)
      const metrics = await page.evaluate(
        ({ selector, scanLabels }) => {
          const card = document.querySelector('.erp-business-data-table-card')
          const frame = card
            .querySelector('.ant-table-body, .ant-table-content')
            .getBoundingClientRect()
          return Array.from(document.querySelectorAll(selector))
            .filter((node) => scanLabels.includes(node.textContent.trim()))
            .map((node) => {
              const box = node.closest('th').getBoundingClientRect()
              return {
                label: node.textContent.trim(),
                visible:
                  box.left >= frame.left - 1 && box.right <= frame.right + 1,
              }
            })
        },
        { selector: headerSelector, scanLabels }
      )
      assert.ok(
        metrics.every((field) => field.visible),
        `${entry.key}: 常用信息应在首屏完整可见 ${JSON.stringify(metrics)}`
      )
    }
    await assertNoHorizontalOverflow(page, `field-density-${entry.key}`)
  }

  return [
    {
      name: 'business-field-density-desktop',
      path: cases[0].path,
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1280, height: 900 },
      verify: async (page) => {
        for (const entry of cases) {
          console.info(`[style:l1:field-density] ${entry.key}: 列表和导出`)
          await gotoScenarioPath(page, entry.path, {
            waitUntil: 'domcontentloaded',
          })
          await assertHeaders(page, entry)
          const [download] = await Promise.all([
            page.waitForEvent('download'),
            page.getByRole('button', { name: /导出筛选结果/u }).click(),
          ])
          const csv = await downloadedText(download)
          for (const label of entry.detail)
            assert.ok(
              csv.includes(label),
              `${entry.key}: 导出仍需包含 ${label}`
            )
        }

        await gotoScenarioPath(page, cases[0].path, {
          waitUntil: 'domcontentloaded',
        })
        await assertHeaders(page, cases[0])
        await page
          .locator(
            '.erp-business-data-table-card .ant-table-tbody tr[data-row-key]'
          )
          .first()
          .dblclick()
        const editor = page.locator('.erp-business-form-page:not([hidden])')
        await editor.getByLabel('简称', { exact: true }).waitFor()
        assert.equal(
          await editor.getByLabel('简称', { exact: true }).inputValue(),
          '暗色'
        )
        assert.equal(
          await editor.getByLabel('税号', { exact: true }).inputValue(),
          'TAX-STYLE-L1'
        )
        await editor
          .getByRole('button', { name: '返回列表', exact: true })
          .click()
        await editor.waitFor({ state: 'hidden' })

        await page
          .locator(headerSelector)
          .filter({ hasText: '名称' })
          .first()
          .locator('xpath=ancestor::th')
          .locator('.erp-module-column-header-trigger')
          .click()
        await page
          .locator('.ant-dropdown:not(.ant-dropdown-hidden)')
          .last()
          .getByText('移到最前', { exact: true })
          .click()
        await page.waitForFunction(
          (selector) =>
            document.querySelector(selector)?.textContent.trim() === '名称',
          headerSelector
        )
        await page.reload({ waitUntil: 'domcontentloaded' })
        await assertHeaders(page, cases[0])
        assert.equal(
          (await page.locator(headerSelector).first().textContent()).trim(),
          '名称'
        )
        await page
          .locator(headerSelector)
          .first()
          .locator('xpath=ancestor::th')
          .locator('.erp-module-column-header-trigger')
          .click()
        await page
          .locator('.ant-dropdown:not(.ant-dropdown-hidden)')
          .last()
          .getByText('打开列顺序面板', { exact: true })
          .click()
        const panel = page.getByRole('dialog', { name: '调整列表列顺序' })
        for (const label of cases[0].detail)
          assert.equal(await panel.getByText(label, { exact: true }).count(), 0)
        await panel
          .getByRole('button', { name: '恢复默认', exact: true })
          .click()
        await panel.getByRole('button', { name: /^完\s*成$/u }).click()
        await panel.waitFor({ state: 'hidden' })
        await page.reload({ waitUntil: 'domcontentloaded' })
        await assertHeaders(page, cases[0])
        assert.equal(
          (await page.locator(headerSelector).first().textContent()).trim(),
          '编号'
        )
        await page.screenshot({
          path: `${deps.outputDir}/business-field-density-customers.png`,
          fullPage: true,
        })
      },
    },
    {
      name: 'business-field-density-narrow-dark',
      path: cases[0].path,
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      themeMode: 'dark',
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        for (const entry of cases) {
          await gotoScenarioPath(page, entry.path, {
            waitUntil: 'domcontentloaded',
          })
          await assertHeaders(page, entry)
        }
      },
    },
  ]
}
