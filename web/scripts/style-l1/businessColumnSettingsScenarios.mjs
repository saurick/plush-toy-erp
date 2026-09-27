import fs from 'node:fs/promises'

export function createBusinessColumnSettingsScenarios({
  assert,
  customerRuntimeEffectiveSession,
  gotoScenarioPath,
  outputDir,
  path,
}) {
  const headerSelector =
    '.erp-business-data-table-card .ant-table-thead:not([aria-hidden="true"]) .erp-module-column-header-text'
  const labels = (page) => page.locator(headerSelector).allTextContents()
  const open = async (page) => {
    await page
      .locator('.erp-business-operation-panel__actions')
      .getByRole('button', { name: /列设置/u })
      .first()
      .click()
    const dialog = page.getByRole('dialog', { name: /^列设置/u })
    await dialog.waitFor({ state: 'visible' })
    return dialog
  }
  const save = async (page, dialog) => {
    const response = page.waitForResponse(
      (res) =>
        res.url().includes('/rpc/admin') &&
        res.request().postDataJSON()?.method === 'set_erp_column_order'
    )
    await dialog.getByRole('button', { name: /^完\s*成$/u }).click()
    const result = await response
    await dialog.waitFor({ state: 'hidden' })
    return result.request().postDataJSON().params
  }
  const geometry = async (dialog) => {
    await dialog.evaluate(async (node) => {
      await document.fonts.ready
      await Promise.all(
        node
          .getAnimations({ subtree: true })
          .filter(
            (animation) => animation.effect?.getTiming().iterations !== Infinity
          )
          .map((animation) => animation.finished.catch(() => {}))
      )
    })
    const metrics = await dialog.evaluate((node) => {
      const box = node.getBoundingClientRect()
      return {
        width: box.width,
        inViewport:
          box.left >= 0 &&
          box.right <= window.innerWidth &&
          box.top >= 0 &&
          box.bottom <= window.innerHeight,
        overflow: node.scrollWidth > node.clientWidth,
        rowOverflow: [...node.querySelectorAll('[role="listitem"]')].some(
          (row) => row.scrollWidth > row.clientWidth
        ),
      }
    })
    assert(metrics.width >= 300, '布局度量必须等弹窗展开动画结束')
    assert(
      metrics.inViewport && !metrics.overflow && !metrics.rowOverflow,
      JSON.stringify(metrics)
    )
    return metrics
  }
  return [
    {
      name: 'business-column-settings-desktop',
      path: '/erp/master/materials',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await page.locator(headerSelector).first().waitFor()
        const defaults = await labels(page)
        let dialog = await open(page)
        await dialog
          .getByRole('checkbox', { name: '颜色', exact: true })
          .uncheck()
        assert.deepEqual(
          await labels(page),
          defaults,
          '未完成的显隐不得改变列表'
        )
        await dialog.locator('.ant-modal-close').click()
        dialog = await open(page)
        assert(
          await dialog
            .getByRole('checkbox', { name: '颜色', exact: true })
            .isChecked(),
          '关闭应放弃草稿'
        )
        await dialog
          .getByRole('checkbox', { name: '颜色', exact: true })
          .uncheck()
        await dialog
          .getByRole('button', { name: '颜色 移到最前', exact: true })
          .click()
        await geometry(dialog)
        await dialog.screenshot({
          path: path.join(outputDir, 'business-column-settings-materials.png'),
        })
        const saved = await save(page, dialog)
        assert(saved.hidden_columns.includes('color'), '显隐与排序应一起保存')
        assert(!(await labels(page)).includes('颜色'))
        await page.reload({ waitUntil: 'domcontentloaded' })
        await page.locator(headerSelector).first().waitFor()
        assert(!(await labels(page)).includes('颜色'), '刷新后应保留账号显隐')

        assert.equal(
          await page.locator('.erp-module-column-header-trigger').count(),
          0,
          '表头只保留列名与排序，列设置集中在工具栏'
        )
        dialog = await open(page)
        await dialog
          .getByRole('button', { name: `${defaults[0]} 下移`, exact: true })
          .click()
        await save(page, dialog)
        assert.equal((await labels(page))[0], defaults[1])
        assert(!(await labels(page)).includes('颜色'), '调整顺序应保留显隐设置')

        const download = page.waitForEvent('download')
        await page
          .locator('.erp-business-operation-panel__actions')
          .getByRole('button', { name: /导出/u })
          .first()
          .click()
        const csv = await download
        const csvText = await fs.readFile(await csv.path(), 'utf8')
        assert(
          csvText.split('\n')[0].includes('颜色'),
          '隐藏列仍须保留在导出中'
        )

        dialog = await open(page)
        await dialog
          .getByRole('checkbox', { name: '颜色', exact: true })
          .check()
        await save(page, dialog)
        assert.equal((await labels(page))[0], '颜色', '重新显示应保留排列位置')

        dialog = await open(page)
        const checkboxes = await dialog.getByRole('checkbox').all()
        for (const checkbox of checkboxes.slice(1)) await checkbox.uncheck()
        assert(await checkboxes[0].isDisabled(), '至少保留一列')
        await checkboxes[1].check()
        assert(
          !(await checkboxes[0].isDisabled()),
          '增加可见列后应解除最后一列限制'
        )
        await dialog.getByRole('button', { name: '恢复默认' }).click()
        await save(page, dialog)
        assert.deepEqual(await labels(page), defaults)

        let failure = true
        const failureRoute = async (route) => {
          const body = route.request().postDataJSON()
          if (body?.method !== 'set_erp_column_order' || !failure) {
            return route.fallback()
          }
          failure = false
          return route.fulfill({
            json: {
              jsonrpc: '2.0',
              id: body.id,
              result: { code: 500, message: '保存失败', data: {} },
            },
          })
        }
        await page.route('**/rpc/admin', failureRoute)
        dialog = await open(page)
        await dialog
          .getByRole('checkbox', { name: '颜色', exact: true })
          .uncheck()
        await dialog.getByRole('button', { name: /^完\s*成$/u }).click()
        await page.locator('.ant-message-error').waitFor()
        assert(await dialog.isVisible(), '失败应保留弹窗')
        assert(
          !(await dialog
            .getByRole('checkbox', { name: '颜色', exact: true })
            .isChecked()),
          '失败应保留草稿'
        )
        assert.deepEqual(await labels(page), defaults, '失败不得改变已保存设置')
        await save(page, dialog)
        await page.unroute('**/rpc/admin', failureRoute)

        const cases = [
          '/erp/master/partners/customers',
          '/erp/sales/project-orders/sales-orders',
          '/erp/purchase/accessories',
          '/erp/purchase/processing-contracts',
          '/erp/purchase/material-bom',
          '/erp/production/quality-inspections',
          '/erp/warehouse/shipments',
          '/erp/finance/payments',
        ]
        for (const url of cases) {
          await gotoScenarioPath(page, url, { waitUntil: 'domcontentloaded' })
          await page.locator(headerSelector).first().waitFor()
          const before = await labels(page)
          dialog = await open(page)
          await dialog.getByRole('checkbox').last().uncheck()
          await save(page, dialog)
          assert.equal(
            (await labels(page)).length,
            before.length - 1,
            `${url} 显隐应生效`
          )
          dialog = await open(page)
          await dialog.getByRole('button', { name: '恢复默认' }).click()
          await save(page, dialog)
          assert.deepEqual(await labels(page), before, `${url} 应恢复默认`)
        }
        await gotoScenarioPath(page, '/erp/master/materials', {
          waitUntil: 'domcontentloaded',
        })
        await page.locator(headerSelector).first().waitFor()
        assert(
          !(await labels(page)).includes('颜色'),
          '切换列表不能覆盖材料设置'
        )
        dialog = await open(page)
        await dialog.getByRole('button', { name: '恢复默认' }).click()
        await save(page, dialog)
        await page.reload({ waitUntil: 'domcontentloaded' })
        await page.locator(headerSelector).first().waitFor()
        assert.deepEqual(await labels(page), defaults, '恢复默认应跨刷新保存')
      },
    },
    {
      name: 'business-column-settings-dark-narrow',
      path: '/erp/master/materials',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      themeMode: 'dark',
      viewport: { width: 760, height: 900 },
      verify: async (page) => {
        const dialog = await open(page)
        await dialog
          .getByRole('checkbox', { name: '颜色', exact: true })
          .press('Space')
        assert(
          !(await dialog
            .getByRole('checkbox', { name: '颜色', exact: true })
            .isChecked())
        )
        const metrics = await geometry(dialog)
        await dialog.screenshot({
          path: path.join(
            outputDir,
            'business-column-settings-dark-narrow.png'
          ),
        })
        await fs.writeFile(
          path.join(outputDir, 'business-column-settings-geometry.json'),
          JSON.stringify(metrics, null, 2)
        )
        await dialog.press('Escape')
        await dialog.waitFor({ state: 'hidden' })
        assert(
          await page
            .locator('.erp-business-operation-panel__actions')
            .getByRole('button', { name: /列设置/u })
            .first()
            .evaluate((node) => node === document.activeElement),
          '关闭后焦点回到入口'
        )
      },
    },
  ]
}
