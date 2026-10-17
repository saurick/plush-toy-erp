import assert from 'node:assert/strict'
import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import { assertBusinessViewMotion } from './businessViewDetailAssertions.mjs'

export function createProductionProcessScenarios({
  common,
  outputDir,
  assertNoHorizontalOverflow,
  clickERPThemeOption,
}) {
  const base = {
    ...common,
    path: '/erp/production/progress?display=process',
    productionOrderReleased: true,
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
  }
  let aggregateResponse
  return [
    {
      ...base,
      name: 'production-process-stage-names-and-batch-results',
      beforeNavigate: async (page) => {
        aggregateResponse = page.waitForResponse((response) =>
          response.url().endsWith('/rpc/production_wip') &&
          response.request().postDataJSON()?.method === 'get_production_wip'
        )
      },
      verify: async (page) => {
        const panel = page.getByRole('region', { name: '生产执行', exact: true })
        await panel.getByRole('table', { name: '当前生产事项' }).waitFor()
        const envelope = await (await aggregateResponse).json()
        const data = structuredClone(envelope.result.data)
        const accepted = data.production_wip_batches.find((batch) => batch.id === 91003)
        accepted.quantity = '10'
        data.production_wip_batches.push(
          { ...accepted, id: 99001, batch_no: 'WIP-MIXED-REJECTED', quantity: '5', status: 'REJECTED' },
          { ...accepted, id: 99002, batch_no: 'WIP-MIXED-PLANNED', quantity: '5', status: 'PLANNED', execution_mode: null }
        )
        data.quality_inspections.push({
          id: 99003, inspection_no: 'QI-MIXED-REJECTED', production_wip_batch_id: 99001,
          gate_code: 'FINISHED_GOODS', status: 'REJECTED', result: 'REJECT',
        })
        await page.route('**/rpc/production_wip', async (route) => {
          const { id, method } = route.request().postDataJSON()
          if (method !== 'get_production_wip') return route.fallback()
          return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 0, message: 'OK', data } } })
        })
        await page.getByRole('button', { name: '刷新当前页', exact: true }).click()
        await panel.getByText('手工制作检验不合格，需跟进处置', { exact: true }).waitFor()
        await panel.getByText('工序对照', { exact: true }).click()
        const matrix = panel.locator('.erp-production-process__lanes')
        const firstRow = matrix.locator('.erp-production-process__lane').first()
        const handwork = firstRow.getByRole('button', { name: /的手工制作$/u })
        await handwork.getByText('有不合格批次', { exact: true }).waitFor()
        assert.equal(await matrix.locator('.erp-production-process__step-no').count(), 0)
        assert.match(await firstRow.getByRole('button', { name: /的包装$/u }).innerText(), /已通过/u)
        const geometry = await matrix.evaluate((element) => ({
          headings: [...element.querySelectorAll('.erp-production-process__head strong')].map((heading) => heading.getBoundingClientRect().left),
          cells: [...element.querySelector('.erp-production-process__lane').querySelectorAll('.erp-production-process__step')].map((cell) => cell.getBoundingClientRect().left),
        }))
        geometry.headings.forEach((left, index) => assert.ok(Math.abs(left - geometry.cells[index]) <= 1))
        await page.screenshot({ path: path.join(outputDir, 'production-stage-names-matrix-4k.png'), scale: 'device' })
        await handwork.click()
        const drawer = page.getByRole('dialog').filter({ has: page.locator('.erp-production-process-drawer__summary') })
        await drawer.getByRole('button', { name: '只看需处理批次', exact: true }).click()
        await drawer.getByRole('heading', { name: /需处理批次/u }).waitFor()
        assert.equal(await drawer.locator('.erp-production-process-drawer__batch').count(), 1)
        assert.match(await drawer.locator('.erp-production-process-drawer__batch').innerText(), /WIP-MIXED-REJECTED/u)
        assert.equal(await drawer.locator('.erp-production-process-drawer__results > div').count(), 1)
        await drawer.getByRole('button', { name: '查看检验结果 QI-MIXED-REJECTED', exact: true }).waitFor()
        await page.screenshot({ path: path.join(outputDir, 'production-stage-names-drawer-4k.png'), scale: 'device' })
        await drawer.getByRole('button', { name: '查看全部批次', exact: true }).click()
        assert.equal(await drawer.locator('.erp-production-process-drawer__batch').count(), 3)
        await drawer.getByRole('radiogroup', { name: '查看生产工序' }).getByText('包装', { exact: true }).click()
        assert.equal(await drawer.getByRole('button', { name: '只看需处理批次', exact: true }).count(), 0)
        await drawer.getByRole('button', { name: '返回列表', exact: true }).click()
        await drawer.waitFor({ state: 'hidden' })
        await page.waitForFunction(
          (label) => document.activeElement?.getAttribute('aria-label') === label,
          await handwork.getAttribute('aria-label')
        )
        for (const width of [1440, 1024, 768, 390]) {
          await page.setViewportSize({ width, height: 1080 })
          await assertNoHorizontalOverflow(page, `production-stage-names-${width}`)
          const label = firstRow.locator('.erp-production-process__step-name').first()
          const headVisible = await matrix.locator('.erp-production-process__head').isVisible()
          assert.equal(await label.isVisible(), !headVisible, '列头与卡片名称根据空间互补显示')
        }
        await page.setViewportSize({ width: 1440, height: 1080 })
        await clickERPThemeOption(page, '暗色')
        await handwork.click()
        await page.getByRole('dialog').getByRole('button', { name: '只看需处理批次', exact: true }).waitFor()
        await assertNoHorizontalOverflow(page, 'production-stage-names-dark-drawer')
        const inspectionRequest = page.waitForRequest((request) =>
          request.url().endsWith('/rpc/quality') &&
          request.postDataJSON()?.method === 'get_quality_inspection'
        )
        await page.getByRole('dialog').getByRole('button', { name: '查看检验结果 QI-MIXED-REJECTED', exact: true }).click()
        await page.waitForURL((url) => url.searchParams.get('quality_inspection_id') === '99003')
        assert.equal((await inspectionRequest).postDataJSON().params.id, 99003)
      },
    },
    {
      ...base,
      name: 'production-toolbar-inline-geometry',
      verify: async (page) => {
        const panel = page.getByRole('region', {
          name: '生产执行',
          exact: true,
        })
        await panel.getByRole('table', { name: '当前生产事项' }).waitFor()
        const query = panel.getByRole('textbox', { name: '搜索生产产品或规格' })
        await query.fill('SKU-STYLE-L1-LONG')
        const pending = panel.getByRole('button', { name: /^待办理/u })
        await pending.click()
        const toolbar = panel.locator('.erp-production-process__toolbar')
        const originalToolbar = await toolbar.elementHandle()
        await assertBusinessViewMotion(
          page,
          'production-toolbar-matrix',
          outputDir
        )
        await panel.locator('.erp-production-process__lanes').waitFor()
        assert.equal(await query.inputValue(), 'SKU-STYLE-L1-LONG')
        assert.equal(await pending.getAttribute('aria-pressed'), 'true')
        await panel.getByText('当前事项', { exact: true }).click()
        await panel.getByRole('table', { name: '当前生产事项' }).waitFor()
        assert.equal(
          await originalToolbar.evaluate((element) => element.isConnected),
          true
        )
        const measurements = []
        for (const width of [
          1920, 1600, 1536, 1440, 1366, 1280, 1024, 768, 390, 358,
        ]) {
          await page.setViewportSize({ width, height: 1080 })
          await toolbar.evaluate(async (element) => {
            await new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve))
            )
            await Promise.all(
              element
                .getAnimations({ subtree: true })
                .filter(
                  (animation) =>
                    animation.effect?.getTiming().iterations !== Infinity
                )
                .map((animation) => animation.finished.catch(() => {}))
            )
          })
          const geometry = await toolbar.evaluate((element) => {
            const box = (target) => {
              const rect = target.getBoundingClientRect()
              return {
                left: rect.left,
                top: rect.top,
                right: rect.right,
                bottom: rect.bottom,
                width: rect.width,
                height: rect.height,
                centerY: rect.top + rect.height / 2,
                overflow: target.scrollWidth - target.clientWidth,
              }
            }
            return {
              panelWidth: element.closest('.erp-production-process')
                .clientWidth,
              toolbar: box(element),
              controls: [...element.children].map((target) => ({
                className: target.className,
                ...box(target),
              })),
            }
          })
          measurements.push({ width, ...geometry })
          if (geometry.panelWidth > 1280) {
            const centers = geometry.controls.map((control) => control.centerY)
            assert.ok(
              Math.max(...centers) - Math.min(...centers) <= 1,
              `${width}px 宽屏工具栏保持同一行并居中对齐`
            )
          }
          for (const control of geometry.controls) {
            assert.ok(
              control.left >= geometry.toolbar.left - 1 &&
                control.right <= geometry.toolbar.right + 1,
              `${width}px 控件不越过工具栏`
            )
            assert.ok(control.overflow <= 1, `${width}px 控件内部不溢出`)
          }
          for (let index = 0; index < geometry.controls.length; index += 1) {
            for (const peer of geometry.controls.slice(index + 1)) {
              const control = geometry.controls[index]
              const overlapWidth =
                Math.min(control.right, peer.right) -
                Math.max(control.left, peer.left)
              const overlapHeight =
                Math.min(control.bottom, peer.bottom) -
                Math.max(control.top, peer.top)
              assert.ok(
                overlapWidth <= 1 || overlapHeight <= 1,
                `${width}px 相邻控件不重叠`
              )
            }
          }
          await assertNoHorizontalOverflow(page, `production-toolbar-${width}`)
          if (width === 1920 || width === 768) {
            await page.screenshot({
              path: path.join(outputDir, `production-toolbar-${width}-4k.png`),
              scale: 'device',
            })
          }
          if (width === 1920) {
            await page.screenshot({
              path: path.join(outputDir, 'production-toolbar-compact-4k.png'),
              clip: { x: 0, y: 0, width: 1920, height: 450 },
              scale: 'device',
            })
          }
        }
        await writeFile(
          path.join(outputDir, 'production-toolbar-geometry.json'),
          JSON.stringify(measurements, null, 2)
        )
      },
    },
    ...[
      { name: 'production-order-picker-clear', source: '' },
      {
        name: 'production-order-picker-clear-source',
        source: '&source_type=PRODUCTION_ORDER&source_id=71',
      },
    ].map(({ name, source }) => ({
      ...base,
      name,
      path: `${base.path}${source}`,
      verify: async (page) => {
        const panel = page.getByRole('region', {
          name: '生产执行',
          exact: true,
        })
        const table = panel.getByRole('table', { name: '当前生产事项' })
        await table.waitFor()
        const picker = panel.locator('.erp-production-process__order-picker')
        const search = picker.getByRole('combobox', { name: '选择生产订单' })
        const selected = await picker
          .locator('.ant-select-selection-item')
          .innerText()
        await search.fill('不存在的生产订单')
        await page
          .locator('.ant-select-dropdown:visible .ant-empty-description')
          .waitFor()
        await picker.hover()
        await page.waitForFunction(() => {
          const clear = document.querySelector(
            '.erp-production-process__order-picker .ant-select-clear'
          )
          return clear && getComputedStyle(clear).opacity === '1'
        })
        await page.screenshot({
          path: path.join(outputDir, `${name}-4k.png`),
          scale: 'device',
        })
        await picker.locator('.ant-select-clear').click()
        const empty = panel.getByText('请选择可查看的生产订单', { exact: true })
        await empty.waitFor()
        assert.equal(await search.inputValue(), '')
        assert.equal(await table.count(), 0, '清空订单后不保留原订单生产事项')
        assert.equal(
          await panel
            .getByRole('button', { name: '打开生产订单' })
            .isDisabled(),
          true
        )
        const refreshed = page.waitForResponse(
          (response) =>
            response.url().endsWith('/rpc/production_order') &&
            response.request().postDataJSON()?.method ===
              'list_production_orders'
        )
        await page
          .getByRole('button', { name: '刷新当前页', exact: true })
          .click()
        await refreshed
        await page.waitForFunction(
          () =>
            !document.querySelector('.erp-production-process[aria-busy="true"]')
        )
        await empty.waitFor()
        assert.equal(
          await picker.locator('.ant-select-selection-item').count(),
          0,
          '刷新不自动选回生产订单'
        )
        await search.fill('仅搜索，未选订单')
        await picker.hover()
        await picker.locator('.ant-select-clear').click()
        assert.equal(
          await search.inputValue(),
          '',
          '未选订单时也可清空搜索文字'
        )
        await empty.waitFor()
        await search.fill('MO-STYLE')
        await page
          .locator('.ant-select-dropdown:visible .ant-select-item-option')
          .filter({ hasText: selected })
          .click()
        await table.waitFor()
        assert.equal(
          await picker.locator('.ant-select-selection-item').innerText(),
          selected
        )
      },
    })),
    {
      ...base,
      name: 'production-current-items-drawer-and-recovery',
      verify: async (page) => {
        const panel = page.getByRole('region', {
          name: '生产执行',
          exact: true,
        })
        const table = panel.getByRole('table', { name: '当前生产事项' })
        await table.waitFor()
        assert.equal(
          await panel.getByRole('radio', { name: '当前事项' }).isChecked(),
          true
        )
        const query = panel.getByRole('textbox', { name: '搜索生产产品或规格' })
        await query.fill('不存在的产品')
        await panel.getByText('当前筛选暂无数据', { exact: true }).waitFor()
        await query.fill('SKU-STYLE-L1-LONG')
        await table.waitFor()
        await table
          .locator('[data-product-id="7102"]')
          .getByRole('button', { name: /生产进度$/u })
          .click()
        const drawer = page
          .getByRole('dialog')
          .filter({ has: page.getByRole('heading', { name: '本工序批次' }) })
        await drawer.getByText('负责岗位', { exact: true }).waitFor()
        await drawer.getByText('下一步', { exact: true }).waitFor()
        assert.equal(
          (await drawer
            .getByRole('button', { name: '安排生产', exact: true })
            .count()) > 0,
          true
        )
        const stages = drawer.getByRole('radiogroup', { name: '查看生产工序' })
        await stages.getByText('手工制作', { exact: true }).click()
        await drawer.getByText('手工制作尚未开始', { exact: true }).waitFor()
        await drawer
          .getByRole('button', { name: '查看当前事项', exact: true })
          .click()
        await drawer
          .getByRole('heading', { name: '布料加工待安排', exact: true })
          .waitFor()
        await drawer.getByText('批次与原工艺名称', { exact: true }).click()
        await drawer.locator('.erp-production-process-drawer__trace').getByText('布料加工', { exact: true }).waitFor()
        await page.screenshot({
          path: path.join(outputDir, 'production-current-drawer-4k.png'),
          scale: 'device',
        })
        await drawer
          .getByRole('button', { name: '返回列表', exact: true })
          .click()
        await drawer.waitFor({ state: 'hidden' })
        assert.equal(await query.inputValue(), 'SKU-STYLE-L1-LONG')
        await assertBusinessViewMotion(
          page,
          'production-current-matrix',
          outputDir
        )
        const matrix = panel.locator('.erp-production-process__lanes')
        await matrix.waitFor()
        assert.deepEqual(
          await matrix
            .locator('.erp-production-process__head strong')
            .allTextContents(),
          ['布料加工', '缝制', '手工制作', '包装']
        )
        assert.equal(await matrix.locator('.erp-production-process__step-no').count(), 0)
        const strip = await panel
          .locator('.erp-production-process__layout .ant-segmented-group')
          .elementHandle()
        await panel.getByText('当前事项', { exact: true }).click()
        await table.waitFor()
        assert.equal(
          await strip.evaluate((element) => element.isConnected),
          true
        )
        assert.equal(await query.inputValue(), 'SKU-STYLE-L1-LONG')
        for (const width of [1440, 1024, 768]) {
          await page.setViewportSize({ width, height: 1000 })
          await assertNoHorizontalOverflow(page, `production-current-${width}`)
        }
        await page.setViewportSize({ width: 1440, height: 1000 })
        await clickERPThemeOption(page, '暗色')
        await table
          .locator('[data-product-id="7102"]')
          .getByRole('button', { name: /生产进度$/u })
          .click()
        await drawer.waitFor()
        const bounds = await drawer.evaluate((element) => ({
          width: element.clientWidth,
          overflow: element.scrollWidth - element.clientWidth,
          background: getComputedStyle(
            element.querySelector('.erp-production-process-drawer__summary')
          ).backgroundColor,
        }))
        assert.equal(bounds.overflow, 0)
        assert.notEqual(bounds.background, 'rgba(0, 0, 0, 0)')
        await page.screenshot({
          path: path.join(outputDir, 'production-current-drawer-dark.png'),
        })
      },
    },
    {
      ...base,
      name: 'production-current-direct-batch-form',
      verify: async (page) => {
        const panel = page.getByRole('region', {
          name: '生产执行',
          exact: true,
        })
        const row = panel.locator('[data-product-id="7101"]')
        await row.waitFor()
        const origin = page.url()
        await panel
          .getByRole('textbox', { name: '搜索生产产品或规格' })
          .fill('SKU-STYLE-L1-LONG')
        await row.getByRole('button', { name: '安排生产', exact: true }).click()
        await page.waitForURL(
          (url) =>
            url.searchParams.get('wip_action') === 'ASSIGN_EXECUTION' &&
            url.searchParams.get('wip_batch_id') === '91012'
        )
        const modal = page
          .getByRole('dialog')
          .filter({ hasText: '安排本厂或外发加工' })
          .last()
        await modal
          .getByRole('radio', { name: '本厂生产', exact: true })
          .waitFor()
        assert.equal(
          await modal.locator('.ant-table-wrapper').count(),
          0,
          '直达办理不再夹带整单批次表'
        )
        const request = page.waitForRequest(
          (entry) =>
            entry.url().endsWith('/rpc/production_wip') &&
            entry.postDataJSON()?.method === 'execute_production_wip_action'
        )
        await modal
          .getByRole('button', { name: '确认办理', exact: true })
          .click()
        const payload = (await request).postDataJSON().params
        assert.equal(payload.production_wip_batch_id, 91012)
        assert.equal(payload.action, 'ASSIGN_EXECUTION')
        assert.equal(payload.execution_mode, 'IN_HOUSE')
        await page.waitForFunction(
          () => !document.querySelector('.ant-btn-loading')
        )
        await page
          .getByRole('button', { name: '办完返回生产执行', exact: true })
          .click()
        await page.waitForURL(origin)
        await row.waitFor()
        assert.equal(
          await panel
            .getByRole('textbox', { name: '搜索生产产品或规格' })
            .inputValue(),
          'SKU-STYLE-L1-LONG'
        )
        await row.getByText('待开工', { exact: true }).waitFor()
        assert.equal(await row.getAttribute('data-selected'), 'true')
        await assertNoHorizontalOverflow(
          page,
          'production-current-return-from-form'
        )
      },
    },
    {
      ...base,
      name: 'production-current-readonly-error-retry',
      adminProfile: {
        username: 'style-production-reader',
        is_super_admin: false,
        permissions: ['production.fact.read', 'production.wip.read'],
        menus: [
          {
            key: 'production-progress',
            path: '/erp/production/progress',
            required_any: ['production.fact.read'],
          },
        ],
      },
      effectiveSession: {
        ...common.effectiveSession,
        pages: ['production-progress'],
        actions: ['production.fact.read', 'production.wip.read'],
      },
      beforeNavigate: async (page) => {
        let failures = 0
        await page.route('**/rpc/production_wip', async (route) => {
          const { id, method } = route.request().postDataJSON()
          if (method !== 'get_production_wip' || failures > 0)
            return route.fallback()
          failures += 1
          return route.fulfill({
            json: {
              jsonrpc: '2.0',
              id,
              result: { code: 500, message: '读取失败' },
            },
          })
        })
      },
      verify: async (page) => {
        const panel = page.getByRole('region', {
          name: '生产执行',
          exact: true,
        })
        await panel.getByRole('alert').waitFor()
        await panel
          .getByRole('button', { name: '重新加载', exact: true })
          .click()
        const row = panel.locator('[data-product-id="7102"]')
        await row.waitFor()
        assert.equal(
          await row
            .getByRole('button', { name: '安排生产', exact: true })
            .count(),
          0
        )
        await row.getByRole('button', { name: '查看进度', exact: true }).click()
        const drawer = page.getByRole('dialog')
        await drawer
          .getByText('当前事项由生产安排岗位办理。', { exact: true })
          .waitFor()
        assert.equal(
          await drawer
            .getByRole('button', { name: '安排生产', exact: true })
            .count(),
          0
        )
        await drawer.getByRole('button', { name: '返回列表', exact: true }).click()
        await drawer.waitFor({ state: 'hidden' })
        await panel.locator('[data-product-id="7100"]').getByRole('button', { name: '查看进度', exact: true }).click()
        await drawer.getByText('QI-STYLE-3', { exact: true }).waitFor()
        assert.equal(await drawer.getByRole('button', { name: /^查看检验结果/u }).count(), 0)
      },
    },
  ]
}
