import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { waitForFiniteAnimations } from './browserReadiness.mjs'

async function assertHelp(page, trigger) {
  const popup = page.locator('.erp-supplemental-help-popover:visible')
  await popup.waitFor()
  await waitForFiniteAnimations(page)
  assert.equal(await popup.count(), 1)
  assert.equal(await trigger.getAttribute('aria-expanded'), 'true')
  assert.equal(await trigger.locator('[data-icon="info-circle"]').count(), 1)
  const metrics = await popup.evaluate((node) => {
    const content = node.querySelector('.erp-supplemental-help-content')
    return { box: node.getBoundingClientRect().toJSON(), width: innerWidth, height: innerHeight, overflow: content.scrollWidth - content.clientWidth }
  })
  assert.ok(metrics.box.left >= 0 && metrics.box.right <= metrics.width + 1, '说明完整位于视口宽度内')
  assert.ok(metrics.box.top >= 0 && metrics.box.bottom <= metrics.height + 1, '说明完整位于视口高度内')
  assert.ok(metrics.overflow <= 1, '说明没有横向裁剪')
  return popup
}

export function createSupplementalHelpScenarios({ customerRuntimeEffectiveSession, outputDir }) {
  return [
    {
      name: 'dev-ui-supplemental-help',
      path: '/__dev/ui-design?page=controls&control=help',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      verify: async (page) => {
        const stage = page.locator('.erp-control-library-stage')
        await stage.getByLabel('演示备注', { exact: true }).fill('查看帮助时保留的草稿')
        const trigger = stage.getByRole('button', { name: '查看备注说明', exact: true })
        const fields = await stage.locator('.ant-form-item-control-input').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().top))
        assert.ok(Math.abs(fields[0] - fields[1]) <= 1, '有无说明图标的表单输入保持对齐')
        await trigger.hover()
        let popup = await assertHelp(page, trigger)
        await popup.hover()
        await page.waitForTimeout(250)
        assert.equal(await popup.isVisible(), true, '鼠标可进入说明阅读')
        await trigger.click()
        await page.mouse.move(0, 0)
        await page.waitForTimeout(250)
        assert.equal(await popup.isVisible(), true, '点击固定后移开鼠标仍显示')
        await trigger.click()
        await popup.waitFor({ state: 'hidden' })
        await page.keyboard.press('Tab')
        await trigger.focus()
        popup = await assertHelp(page, trigger)
        await page.keyboard.press('Escape')
        await popup.waitFor({ state: 'hidden' })
        await trigger.click()
        const density = stage.getByRole('button', { name: '查看表格密度说明', exact: true })
        await density.hover()
        popup = await assertHelp(page, density)
        assert.equal(await trigger.getAttribute('aria-expanded'), 'false')
        assert.equal(await popup.locator('figure').count(), 2)
        await page.keyboard.press('Escape')
        await popup.waitFor({ state: 'hidden' })
        await stage.getByRole('button', { name: '在弹窗中查看', exact: true }).click()
        const dialog = page.getByRole('dialog', { name: '弹窗内的补充说明', exact: true })
        const inner = dialog.getByRole('button', { name: '查看弹窗备注说明', exact: true })
        await inner.click()
        popup = await assertHelp(page, inner)
        await page.keyboard.press('Escape')
        await popup.waitFor({ state: 'hidden' })
        assert.equal(await dialog.isVisible(), true)
        assert.equal(await dialog.getByLabel('弹窗演示备注').inputValue(), '查看帮助时保留的草稿')
        await page.keyboard.press('Escape')
        await dialog.waitFor({ state: 'hidden' })
        await stage.locator('.erp-business-page-help-trigger').click()
        const pageHelp = page.locator('.erp-business-page-help-modal[role="dialog"]')
        await pageHelp.waitFor()
        assert.equal(await pageHelp.locator('.erp-business-page-help__boundary').count(), 1)
        await pageHelp.getByRole('button', { name: '我知道了', exact: true }).click()
        await pageHelp.waitFor({ state: 'hidden' })
        assert.equal(await stage.locator('.ant-alert-warning').isVisible(), true)
        assert.equal(await stage.getByLabel('演示备注', { exact: true }).inputValue(), '查看帮助时保留的草稿')
        await trigger.hover()
        await assertHelp(page, trigger)
        await page.screenshot({ path: `${outputDir}/dev-ui-supplemental-help-4k.png` })
        await writeFile(`${outputDir}/dev-ui-supplemental-help.json`, JSON.stringify({ fields, draftPreserved: true, pageHelpRetained: true, warningRetained: true }, null, 2))
      },
    },
    ...[false, true].map((mobile) => ({
      auth: 'admin',
      name: `supplemental-help-permissions-${mobile ? 'touch' : 'desktop'}`,
      path: '/erp/system/permissions',
      effectiveSession: customerRuntimeEffectiveSession,
      themeMode: mobile ? 'dark' : 'light',
      viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      verify: async (page) => {
        const trigger = page.getByRole('button', { name: '菜单与操作说明', exact: true })
        await trigger.waitFor()
        const writes = []
        page.on('request', (request) => {
          if (request.method() === 'POST' && request.url().endsWith('/rpc/admin')) {
            const { method } = request.postDataJSON()
            if (/^(set_|create_|update_|save_)/u.test(method)) writes.push(method)
          }
        })
        if (mobile) await trigger.tap()
        else await trigger.hover()
        let popup = await assertHelp(page, trigger)
        await popup.getByText('当前调整仅预览，保存岗位设置后生效。', { exact: true }).waitFor()
        if (!mobile) await trigger.click()
        await trigger.click()
        await popup.waitFor({ state: 'hidden' })
        await trigger.click()
        popup = await assertHelp(page, trigger)
        await page.keyboard.press('Escape')
        await popup.waitFor({ state: 'hidden' })
        if (!mobile) {
          await page.getByRole('button', { name: /^全屏(?:编辑|查看)$/u }).click()
          const full = page.locator('.erp-role-center-detail--fullscreen')
          await full.getByRole('button', { name: '菜单与操作说明', exact: true }).click()
          popup = await assertHelp(page, trigger)
          await page.keyboard.press('Escape')
          await popup.waitFor({ state: 'hidden' })
          assert.equal(await full.isVisible(), true, 'Esc 先收起说明，保留全屏岗位设置')
          await page.keyboard.press('Escape')
          await full.waitFor({ state: 'hidden' })
        }
        assert.deepEqual(writes, [], '查看说明不写岗位设置或业务数据')
        await page.screenshot({ path: `${outputDir}/supplemental-help-permissions-${mobile ? 'touch' : 'desktop'}.png` })
      },
    })),
    ...[false, true].flatMap((mobile) => ['progress', 'statistics'].map((view) => ({
      auth: 'admin',
      name: `supplemental-help-${view}-${mobile ? 'touch' : 'desktop'}`,
      path: `/erp/business-dashboard${view === 'statistics' ? '?view=statistics' : ''}`,
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 },
      verify: async (page) => {
        const trigger = page.getByRole('button', { name: view === 'statistics' ? '查看统计口径' : '查看进度计算说明', exact: true })
        if (mobile) await trigger.tap()
        else await trigger.hover()
        const popup = await assertHelp(page, trigger)
        await page.keyboard.press('Escape')
        await popup.waitFor({ state: 'hidden' })
        assert.equal(await trigger.isVisible(), true)
      },
    }))),
    {
      auth: 'admin',
      name: 'supplemental-help-approval',
      path: '/erp/system/permissions?tab=approvals',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 1000 },
      verify: async (page) => {
        await page.getByRole('tab', { name: '审批责任', exact: true }).click()
        const trigger = page.getByRole('button', { name: '审批责任说明', exact: true })
        await trigger.hover()
        const popup = await assertHelp(page, trigger)
        await page.keyboard.press('Escape')
        await popup.waitFor({ state: 'hidden' })
        assert.equal(await page.getByRole('tab', { name: '审批责任', exact: true }).getAttribute('aria-selected'), 'true')
      },
    },
    {
      name: 'dev-ui-prototype-supplemental-help',
      path: '/__dev/ui-design',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      verify: async (page) => {
        const frame = page.frameLocator('iframe[title="ERP 最新可交互设计"]')
        await frame.locator('.app').waitFor()
        await frame.locator('.nav-item[data-page="permissions"]').click()
        const permission = frame.getByRole('button', { name: '菜单与操作说明', exact: true })
        await permission.hover()
        const popup = frame.locator('.prototype-supplemental-help-popup')
        await popup.waitFor()
        assert.equal(await permission.getAttribute('aria-expanded'), 'true')
        await page.keyboard.press('Escape')
        await popup.waitFor({ state: 'hidden' })
        assert.equal(await frame.locator('.overlay').count(), 0, '补充说明不再借用完整弹窗')
        await frame.getByRole('button', { name: '销售管理', exact: true }).click()
        await frame.locator('[data-action="product-gallery-preview"][data-count="3"]').first().click()
        const preview = frame.locator('.product-image-preview')
        await preview.waitFor()
        const helper = preview.locator('summary[aria-label="查看看图操作帮助"]')
        await helper.hover()
        await popup.getByText('滚轮或双指缩放 · 放大后拖动查看', { exact: false }).waitFor()
        assert.equal(await helper.locator('svg').count(), 1)
        await helper.click()
        await helper.click()
        await popup.waitFor({ state: 'hidden' })
        await helper.click()
        await popup.waitFor()
        await page.keyboard.press('Escape')
        await popup.waitFor({ state: 'hidden' })
        assert.equal(await preview.isVisible(), true)
        assert.equal(await preview.locator('[data-action="product-gallery-product"][aria-pressed="true"]').count(), 1)
        await preview.getByRole('button', { name: '关闭图片预览', exact: true }).click()
        await preview.waitFor({ state: 'hidden' })
      },
    },
  ]
}
