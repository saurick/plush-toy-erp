import { expect } from 'playwright/test'
import { styleRpcResult } from './rpcMockResult.mjs'
import { createBOMImportWorkbookFixture } from './bomImportWorkbookFixture.mjs'
import { closeBusinessFormPage } from './businessFormPageAssertions.mjs'

export function createBOMMaterialDropdownStabilityScenarios(deps) {
  return [
    { name: 'bom-material-dropdown-stability', width: 1920 },
    { name: 'bom-material-dropdown-stability-dark', width: 1920, themeMode: 'dark' },
    { name: 'bom-material-dropdown-stability-narrow', width: 1024 },
  ].map(({ name, width, themeMode }) => ({
    name,
    path: '/erp/purchase/material-bom',
    auth: 'admin',
    effectiveSession: deps.customerRuntimeEffectiveSession,
    viewport: { width, height: 1080 },
    deviceScaleFactor: 2,
    themeMode,
    verify: async (page) => {
      await page.getByRole('button', { name: '更多新建方式', exact: true }).click()
      const chooser = page.waitForEvent('filechooser')
      await page.getByRole('menuitem', { name: /从 Excel 新建/u }).click()
      await (await chooser).setFiles({
        name: 'BOM-DROPDOWN-SYNTHETIC.xlsx',
        mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        buffer: createBOMImportWorkbookFixture(),
      })
      await page.getByRole('button', { name: '带入编辑', exact: true }).click()
      const editor = page.locator('.erp-bom-editor:visible')
      const material = editor.getByRole('combobox', { name: '物料名称 1', exact: true })
      const materialSelect = material.locator('xpath=ancestor::div[contains(concat(" ",normalize-space(@class)," ")," ant-select ")][1]')
      await materialSelect.hover()
      await materialSelect.locator('.ant-select-clear').click()
      await material.scrollIntoViewIfNeeded()
      const box = await material.boundingBox()
      await page.setViewportSize({ width, height: Math.ceil(box.y + box.height + 170) })
      await expect(material).toBeInViewport()

      let releaseRequest
      let pendingRequest
      const routeHandler = async (route) => {
        const { id, method, params } = route.request().postDataJSON()
        if (method !== 'list_materials' || params.ids) return route.fallback()
        await pendingRequest
        const count = params.keyword === '没有结果' ? 0 : params.keyword === '单项' ? 1 : 30
        const materials = Array.from({ length: count }, (_, index) => ({
          id: 1000 + index,
          code: `MAT-DROPDOWN-${index + 1}`,
          name: `下拉稳定性材料${index + 1}`,
          default_unit_id: 1,
          is_active: true,
        }))
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            jsonrpc: '2.0',
            id,
            result: styleRpcResult({
              materials,
              total: count,
              limit: params.limit,
              offset: params.offset,
            }),
          }),
        })
      }
      await page.route('**/rpc/masterdata', routeHandler)
      try {
        for (const state of ['首次打开', '重新打开', '单项', '没有结果', '清空搜索']) {
          const received = page.waitForRequest((request) =>
            request.url().endsWith('/rpc/masterdata') && request.postDataJSON()?.method === 'list_materials',
          { timeout: 5000 })
          const deferred = Promise.withResolvers()
          pendingRequest = deferred.promise
          releaseRequest = deferred.resolve
          await material.evaluate((input) => {
            const select = input.closest('.ant-select')
            const scroller = input.closest('.erp-business-form-page__body')
            const frames = []
            let frame
            const sample = () => {
              const rect = select.getBoundingClientRect()
              const popup = document.querySelector('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
              const style = popup && getComputedStyle(popup)
              if (popup && style.visibility !== 'hidden' && Number(style.opacity) > 0) {
                frames.push({
                  select: [rect.x, rect.y, rect.width, rect.height, scroller.scrollTop],
                  reference: select.classList.contains('app-select--reference'),
                  popup: [popup.offsetLeft, popup.offsetTop, popup.offsetWidth, popup.offsetHeight],
                  placement: popup.className.match(/placement-([^ ]+)/u)?.[1],
                })
              }
              frame = requestAnimationFrame(sample)
            }
            window.__bomDropdownProbe = { frames, stop: () => cancelAnimationFrame(frame) }
            sample()
          })
          if (state.endsWith('打开')) await material.click()
          else await material.fill(state === '清空搜索' ? '' : state)
          await received
          await page.waitForFunction(() => window.__bomDropdownProbe.frames.length >= 3)
          releaseRequest()
          const popup = page.locator('.ant-select-dropdown:visible')
          if (state === '没有结果') await expect(popup).toContainText('暂无数据')
          else await expect(popup.locator('.ant-select-item-option').first()).toContainText('下拉稳定性材料1')
          await expect(editor.locator('.ant-select-loading')).toHaveCount(0)
          await page.waitForFunction(() => !document.querySelector('.ant-select-dropdown.ant-slide-up-enter'))
          const frames = await page.evaluate(async () => {
            await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
            const probe = window.__bomDropdownProbe
            probe.stop()
            delete window.__bomDropdownProbe
            return probe.frames
          })
          deps.assert.ok(frames.length >= 3, `${state}须覆盖慢响应和结果返回`)
          const baseline = frames[0]
          const expectedWidth = Math.max(baseline.select[2], Math.min(560, width - 24))
          deps.assert.ok(Math.abs(baseline.popup[2] - expectedWidth) <= 1, `${state}从首帧使用资料候选宽度`)
          for (const frame of frames) {
            deps.assert.equal(frame.reference, baseline.reference, `${state}保持相同展示模式`)
            deps.assert.equal(frame.placement, baseline.placement, `${state}不翻转弹层`)
            for (const key of ['select', 'popup']) {
              deps.assert.ok(frame[key].every((value, index) => Math.abs(value - baseline[key][index]) <= 1),
                `${state} ${key}保持几何尺寸与位置: ${JSON.stringify({ baseline, frame })}`)
            }
          }
          await popup.getByRole('button', { name: '新建物料并使用', exact: true }).waitFor()
          if (state === '首次打开') {
            await page.screenshot({ path: `${deps.outputDir}/${name}-expanded.png` })
          }
          if (state.endsWith('打开')) {
            await material.press('Escape')
            await popup.waitFor({ state: 'hidden' })
          }
        }
        await material.press('Escape')
        await page.locator('.ant-select-dropdown:visible').waitFor({ state: 'hidden' })
        await deps.assertNoHorizontalOverflow(page)
      } finally {
        releaseRequest?.()
        await page.evaluate(() => {
          window.__bomDropdownProbe?.stop()
          delete window.__bomDropdownProbe
        })
        await page.unroute('**/rpc/masterdata', routeHandler)
      }
      await closeBusinessFormPage(page, editor)
    },
  }))
}
