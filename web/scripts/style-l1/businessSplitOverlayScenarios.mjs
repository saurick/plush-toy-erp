import { expect } from 'playwright/test'
import { installBOMMaterialMatchingMocks } from './bomMaterialMatchingScenarios.mjs'
import { installAuditRoute } from './auditLogScenarios.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { createBusinessSplitRecoveryScenarios } from './businessSplitRecoveryScenarios.mjs'

export function createBusinessSplitOverlayScenarios({ assert, customerRuntimeEffectiveSession, outputDir, assertNoHorizontalOverflow }) {
  return ['light', 'dark'].map((themeMode) => {
    const creates = []
    return {
      name: `business-split-overlays-${themeMode}`,
      path: '/erp/purchase/material-bom',
      auth: 'admin',
      themeMode,
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      beforeNavigate: async (page) => {
        creates.length = 0
        await installBOMMaterialMatchingMocks(page, creates)
        await installAuditRoute(page)
      },
      verify: async (page) => {
        const within = async (pane, overlay, label) => {
          const a = await pane.boundingBox()
          const b = await overlay.boundingBox()
          assert(a && b, `${label}: both regions must be visible`)
          assert(b.x >= a.x - 1 && b.y >= a.y - 1 && b.x + b.width <= a.x + a.width + 1 && b.y + b.height <= a.y + a.height + 1, `${label}: ${JSON.stringify({ pane: a, overlay: b })}`)
        }
        await page.getByRole('button', { name: '新建 BOM' }).click()
        await expect(page.locator('.erp-business-form-page:not([hidden])').getByRole('button', { name: '保存草稿', exact: true })).toBeEnabled()
        await page.getByLabel('订单数量', { exact: true }).fill('3030')
        await page.locator('.erp-business-form-page:not([hidden])').getByRole('button', { name: '添加物料' }).click()
        await expect(page.getByLabel('订单数量', { exact: true })).toHaveValue('3030')
        await page.getByRole('button', { name: '分栏', exact: true }).first().click()
        const left = page.locator('.erp-split-pane--left')
        const right = page.locator('.erp-split-pane--right')
        const picker = right.getByRole('combobox', { name: '选择右栏页面' })
        await picker.click()
        await picker.fill('系统操作记录')
        await page.locator('.ant-select-dropdown:visible').getByText('系统操作记录', { exact: true }).click()
        await right.getByRole('button', { name: '查看变化' }).first().waitFor()
        await page.getByRole('button', { name: /^账号菜单：/u }).click()
        await page.getByRole('menuitem', { name: /退出登录$/u }).click()
        const globalConfirm = page.getByRole('dialog').filter({ hasText: '放弃未保存的修改？' })
        await globalConfirm.waitFor()
        assert.equal(await globalConfirm.evaluate((node) => node.closest('.app-overlay-scope') === null), true, '退出工作区使用全局确认')
        const globalMask = page.locator('.ant-modal-root').filter({ has: globalConfirm }).locator('.ant-modal-mask')
        assert.ok((await globalMask.boundingBox()).width >= 1918)
        await globalConfirm.getByRole('button', { name: '继续编辑', exact: true }).click()
        await globalConfirm.waitFor({ state: 'hidden' })

        const choose = left.getByRole('combobox', { name: '物料名称 1', exact: true })
        await choose.fill('浮层测试面料')
        await page.locator('.ant-select-dropdown:visible').getByRole('button', { name: '新建物料并使用', exact: true }).click()
        const modal = page.getByRole('dialog').filter({ hasText: '新建物料并使用' })
        await modal.waitFor()
        await modal.getByLabel('名称', { exact: true }).fill('浮层测试面料已填写')
        await modal.getByLabel('库存类别', { exact: true }).click()
        await page.locator('.ant-select-dropdown:visible').getByText('主料', { exact: true }).click()
        await modal.getByLabel('默认单位', { exact: true }).click()
        await page.locator('.ant-select-dropdown:visible').getByText('个', { exact: true }).click()
        const originalName = await modal.getByLabel('名称', { exact: true }).elementHandle()
        await right.getByRole('button', { name: '查看变化' }).first().click()
        const drawer = page.locator('.erp-audit-detail-drawer')
        await drawer.getByRole('heading', { name: '字段变化' }).waitFor()
        await waitForFiniteAnimations(page)
        const modalRoot = page.locator('.ant-modal-root').filter({ has: modal })
        await within(left, modalRoot.locator('.ant-modal-mask'), '左栏弹窗遮罩')
        await within(left, modal, '左栏表单')
        await within(right, drawer.locator('.ant-drawer-mask'), '右栏抽屉遮罩')
        await within(right, drawer.locator('.ant-drawer-content-wrapper'), '右栏抽屉')
        await expect(modal).toHaveAttribute('aria-modal', 'false')
        await expect(drawer.getByRole('dialog')).toHaveAttribute('aria-modal', 'false')
        assert.equal(await page.locator('#root').getAttribute('inert'), null, '栏内办理不隔离整个应用')
        await page.screenshot({ path: `${outputDir}/business-split-overlays-${themeMode}-both-open.png`, fullPage: true })

        await modal.getByLabel('名称', { exact: true }).focus()
        await page.locator('.erp-admin-menu').getByText('销售管理', { exact: true }).click()
        const discard = page.getByRole('dialog').filter({ hasText: '放弃未保存的修改？' })
        await discard.waitFor()
        await waitForFiniteAnimations(page)
        await within(left, discard, '浮层草稿离开确认')
        await discard.getByRole('button', { name: '继续编辑', exact: true }).click()
        await discard.waitFor({ state: 'hidden' })
        assert.equal(new URL(page.url()).pathname, '/erp/purchase/material-bom')
        await expect(modal.getByLabel('名称', { exact: true })).toHaveValue('浮层测试面料已填写')

        await page.setViewportSize({ width: 1920, height: 640 })
        await waitForFiniteAnimations(page)
        await within(left, modalRoot.locator('.ant-modal-mask'), '低窗口弹窗遮罩')
        await modal.locator('.ant-modal-body').evaluate((node) => { node.scrollTop = node.scrollHeight })
        await expect(modal.getByRole('button', { name: '新建并使用', exact: true })).toBeInViewport()
        await within(right, drawer.locator('.ant-drawer-content-wrapper'), '低窗口抽屉')
        await modal.getByRole('button', { name: '新建并使用', exact: true }).click()
        await modal.waitFor({ state: 'hidden' })
        assert.equal(creates.length, 1)
        await expect(left.getByLabel('订单数量', { exact: true })).toHaveValue('3030')
        await expect(drawer).toBeVisible()
        await drawer.getByRole('button', { name: '完成', exact: true }).focus()
        await page.keyboard.press('Escape')
        await drawer.waitFor({ state: 'hidden' })
        await right.getByRole('button', { name: '查看变化' }).first().click()
        await drawer.getByRole('heading', { name: '字段变化' }).waitFor()
        await left.getByRole('button', { name: '布局', exact: true }).click()
        await page.getByRole('button', { name: '左右互换' }).click()
        await waitForFiniteAnimations(page)
        await within(right, drawer.locator('.ant-drawer-mask'), '互换后的抽屉')
        assert.ok((await right.boundingBox()).x < (await left.boundingBox()).x)
        await left.getByRole('button', { name: '收起分栏', exact: true }).first().click()
        await drawer.waitFor({ state: 'hidden' })
        await page.getByRole('button', { name: '分栏', exact: true }).first().click()
        await drawer.getByRole('heading', { name: '字段变化' }).waitFor()
        await page.setViewportSize({ width: 800, height: 900 })
        await expect(drawer).toBeVisible()
        await waitForFiniteAnimations(page)
        await within(right, drawer.locator('.ant-drawer-content-wrapper'), '窄屏抽屉')
        await drawer.getByRole('button', { name: '完成', exact: true }).click()
        await drawer.waitFor({ state: 'hidden' })
        await page.locator('.erp-split-switcher').getByText('右栏', { exact: true }).click()
        await expect(left.getByLabel('订单数量', { exact: true })).toHaveValue('3030')
        await assertNoHorizontalOverflow(page, `scoped-overlays-${themeMode}`)
        await originalName.dispose()
      },
    }
  }).concat(createBusinessSplitRecoveryScenarios({ assert, customerRuntimeEffectiveSession, outputDir }))
}
