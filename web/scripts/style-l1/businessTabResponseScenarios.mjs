import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'

export function createBusinessTabResponseScenarios({ customerRuntimeEffectiveSession, outputDir }) {
  const common = { auth: 'admin', effectiveSession: customerRuntimeEffectiveSession, productionOrderReleased: true, viewport: { width: 1440, height: 900 } }
  return [
    {
      ...common, name: 'business-tab-response-leave-guard', path: '/erp/production/orders',
      verify: async (page) => {
        await page.getByRole('group', { name: '页面主操作', exact: true }).getByRole('button', { name: /新建生产订单$/u }).click()
        const editor = page.locator('.erp-business-form-page:not([hidden])')
        await editor.getByRole('heading', { name: '新建生产订单', exact: true }).waitFor()
        await page.waitForFunction(() => document.activeElement?.closest('.erp-business-form-page__body'))
        const note = editor.getByRole('textbox', { name: '备注', exact: true })
        await note.fill('本次页签保护测试的未保存输入')
        await page.waitForFunction(() => document.querySelector('.erp-business-form-page[data-unsaved="true"]'))
        const strip = page.locator('.erp-business-module-tabs')
        const target = strip.getByRole('tab', { name: '生产记录', exact: true })
        await target.click()
        const confirm = page.getByRole('dialog', { name: '放弃未保存的修改？', exact: true })
        await confirm.waitFor()
        assert.equal((await strip.locator('[role="tab"][aria-selected="true"]').innerText()).trim(), '生产订单', '未确认离开前不提前切换高亮')
        assert.equal(new URL(page.url()).pathname, '/erp/production/orders')
        assert.equal(await page.locator('.erp-business-switch-content[aria-busy="true"]').count(), 0)
        await confirm.getByRole('button', { name: '继续编辑', exact: true }).click()
        await confirm.waitFor({ state: 'hidden' })
        assert.equal(await note.inputValue(), '本次页签保护测试的未保存输入')
        await target.click()
        await confirm.getByRole('button', { name: '放弃修改', exact: true }).click()
        await page.waitForURL('**/erp/production/progress')
        await page.locator('.erp-business-switch-content[aria-busy="true"]').waitFor({ state: 'hidden' })
        assert.equal(await target.getAttribute('aria-selected'), 'true')
      },
    },
    ...[
      { key: 'production', path: '/erp/production/progress', strip: '.erp-business-module-tabs', from: '生产记录', to: '生产执行' },
      { key: 'purchase', path: '/erp/purchase/accessories', strip: '.erp-business-visual-switch', from: '订单列表', to: '采购跟进' },
      { key: 'inventory', path: '/erp/warehouse/inventory', strip: '.erp-business-module-view-tabs', from: '库存余额', to: '库存批次' },
    ].map((entry) => ({
      ...common, name: `business-tab-response-${entry.key}`, path: entry.path,
      verify: async (page) => {
        const strip = page.locator(entry.strip)
        await strip.getByRole('tab', { name: entry.from, exact: true }).waitFor()
        await page.locator('tr[data-row-key]').first().waitFor()
        const samples = []
        for (const label of [entry.to, entry.from]) {
          const sample = await strip.evaluate(async (node, label) => {
            const before = node.getBoundingClientRect().toJSON()
            const source = { url: location.pathname + location.search, selected: node.querySelector('[aria-selected="true"]')?.textContent.trim() }
            const target = [...node.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent.trim() === label)
            target.click()
            return new Promise((resolve) => requestAnimationFrame(() => {
              const after = node.getBoundingClientRect().toJSON()
              resolve({ label, source, url: location.pathname + location.search, before, after, connected: node.isConnected, selected: target.getAttribute('aria-selected'), busy: Boolean(document.querySelector('.erp-business-switch-content[aria-busy="true"]')), inert: Boolean(document.querySelector('[data-switch-pending][inert]')) })
            }))
          }, label)
          samples.push(sample)
          await writeFile(path.join(outputDir, `business-tab-response-${entry.key}.json`), JSON.stringify(samples, null, 2))
          assert.equal(sample.selected, 'true', `下一帧先展示新的页签选择: ${label}`)
          assert.equal(sample.connected, true)
          assert.equal(sample.busy, true, '重内容提交前已有等待反馈')
          assert.equal(sample.inert, true, '等待时旧内容不能继续办理')
          for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(sample.before[key] - sample.after[key]) <= 1, '页签条保持原位')
          await page.locator('.erp-business-switch-content[aria-busy="true"]').waitFor({ state: 'hidden' })
        }
        // All three clicks happen before a content frame; the final active entry cancels the queued trip.
        await strip.evaluate((node, entry) => {
          const click = (label) => [...node.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent.trim() === label).click()
          click(entry.to); click(entry.from)
        }, entry)
        await page.waitForFunction(({ selector, label }) => document.querySelector(`${selector} [aria-selected="true"]`)?.textContent.trim() === label, { selector: entry.strip, label: entry.from })
        await page.locator('.erp-business-switch-content[aria-busy="true"]').waitFor({ state: 'hidden' })
        assert.equal(await strip.getByRole('tab', { name: entry.from, exact: true }).getAttribute('aria-selected'), 'true')
        await writeFile(path.join(outputDir, `business-tab-response-${entry.key}.json`), JSON.stringify(samples, null, 2))
      },
    })),
    {
      ...common, name: 'business-tab-response-slow-route', path: '/erp/production/progress',
      verify: async (page) => {
        await page.locator('tr[data-row-key]').first().waitFor()
        let release
        const hold = new Promise((resolve) => { release = resolve })
        await page.route('**/src/erp/pages/ProductionOrdersPage.jsx*', async (route) => { await hold; await route.continue() })
        try {
          const strip = page.locator('.erp-business-module-tabs')
          const loading = page.waitForRequest('**/src/erp/pages/ProductionOrdersPage.jsx*', { timeout: 10000 })
          await strip.getByRole('tab', { name: '生产订单', exact: true }).click()
          await loading
          assert.equal(await strip.getByRole('tab', { name: '生产订单', exact: true }).getAttribute('aria-selected'), 'true')
          await strip.getByRole('tab', { name: '异常处理', exact: true }).click()
          await page.waitForURL('**/erp/production/exceptions')
          await page.locator('.erp-business-switch-content[aria-busy="true"]').waitFor({ state: 'hidden' })
          release()
          await page.unroute('**/src/erp/pages/ProductionOrdersPage.jsx*')
          await page.locator('.erp-production-record-workspace').waitFor()
          assert.equal(await strip.getByRole('tab', { name: '异常处理', exact: true }).getAttribute('aria-selected'), 'true', '较晚到达的旧模块不抢回当前页')
          await page.goBack()
          await page.waitForURL('**/erp/production/orders')
          await page.goBack()
          await page.waitForURL('**/erp/production/progress')
        } finally {
          release()
          await page.unroute('**/src/erp/pages/ProductionOrdersPage.jsx*')
        }
      },
    },
  ]
}
