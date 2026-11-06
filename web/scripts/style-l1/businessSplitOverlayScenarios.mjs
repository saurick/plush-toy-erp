import { expect } from 'playwright/test'
import { businessSplitLayoutButton, collapseBusinessSplit } from './businessSplitActions.mjs'
import { installBOMMaterialMatchingMocks } from './bomMaterialMatchingScenarios.mjs'
import { installAuditRoute } from './auditLogScenarios.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { createBusinessSplitRecoveryScenarios } from './businessSplitRecoveryScenarios.mjs'

function outsideCollapseButton(page) {
  return page.locator('.app-overlay-chrome-control:not([hidden])').getByRole('button', { name: '收起分栏', exact: true })
}

async function collapseButtonIsHittable(page) {
  return outsideCollapseButton(page).evaluate((node) => {
    const rect = node.getBoundingClientRect()
    const target = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
    return !node.closest('[inert]') && (node === target || node.contains(target))
  })
}

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
        await right.getByRole('button', { name: '查看变化' }).first().click()
        const drawer = page.locator('.erp-audit-detail-drawer')
        await drawer.getByRole('heading', { name: '字段变化' }).waitFor()
        await waitForFiniteAnimations(page)
        assert.equal(await collapseButtonIsHittable(page), true, '抽屉打开后外侧叉号仍可操作')
        await page.getByRole('button', { name: /^账号菜单：/u }).click()
        await page.getByRole('menuitem', { name: /退出登录$/u }).click()
        const globalConfirm = page.getByRole('dialog').filter({ hasText: '放弃未保存的修改？' })
        await globalConfirm.waitFor()
        assert.equal(await globalConfirm.evaluate((node) => node.closest('.app-overlay-scope') === null), true, '退出工作区使用全局确认')
        const globalMask = page.locator('.ant-modal-root').filter({ has: globalConfirm }).locator('.ant-modal-mask')
        assert.ok((await globalMask.boundingBox()).width >= 1918)
        assert.equal(await collapseButtonIsHittable(page), false, '全局确认仍覆盖外侧收起按钮')
        const splitterHandle = page.locator('.erp-split-panels > .ant-splitter-bar .ant-splitter-bar-dragger')
        assert.equal(await splitterHandle.evaluate((node) => {
          const rect = node.getBoundingClientRect()
          const target = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
          return node === target || node.contains(target)
        }), false, '全局确认仍覆盖分隔条，不能从确认框下拖动页面')
        await globalConfirm.getByRole('button', { name: '继续编辑', exact: true }).click()
        await globalConfirm.waitFor({ state: 'hidden' })

        const originalQuantity = await left.getByLabel('订单数量', { exact: true }).elementHandle()
        await left.getByRole('button', { name: '返回列表', exact: true }).click()
        const modal = page.getByRole('dialog').filter({ hasText: '放弃未保存的修改？' })
        await modal.waitFor()
        await drawer.getByRole('heading', { name: '字段变化' }).waitFor()
        await waitForFiniteAnimations(page)
        const modalRoot = page.locator('.ant-modal-root').filter({ has: modal })
        await within(left, modalRoot.locator('.ant-modal-mask'), '左栏弹窗遮罩')
        await within(left, modal, '左栏离开确认')
        await within(right, drawer.locator('.ant-drawer-mask'), '右栏抽屉遮罩')
        await within(right, drawer.locator('.ant-drawer-content-wrapper'), '右栏抽屉')
        const outsideBox = await outsideCollapseButton(page).boundingBox()
        assert.ok((await drawer.locator('.ant-drawer-content-wrapper').boundingBox()).y >= outsideBox.y + outsideBox.height, '抽屉内容与工作区收起按钮不重叠')
        await expect(modal).toHaveAttribute('aria-modal', 'false')
        await expect(drawer.getByRole('dialog')).toHaveAttribute('aria-modal', 'false')
        assert.equal(await page.locator('#root').getAttribute('inert'), null, '栏内办理不隔离整个应用')
        await page.screenshot({ path: `${outputDir}/business-split-overlays-${themeMode}-both-open.png`, fullPage: true })

        await modal.getByRole('button', { name: '继续编辑', exact: true }).focus()
        await page.locator('.erp-admin-menu').getByText('销售管理', { exact: true }).click()
        const discard = page.getByRole('dialog').filter({ hasText: '放弃未保存的修改？' })
        await discard.waitFor()
        await waitForFiniteAnimations(page)
        await within(left, discard, '浮层草稿离开确认')
        await discard.getByRole('button', { name: '继续编辑', exact: true }).click()
        await discard.waitFor({ state: 'hidden' })
        assert.equal(new URL(page.url()).pathname, '/erp/purchase/material-bom')
        await expect(left.getByLabel('订单数量', { exact: true })).toHaveValue('3030')
        assert.equal(await left.getByLabel('订单数量', { exact: true }).evaluate((node, original) => node === original, originalQuantity), true)
        await left.getByRole('button', { name: '返回列表', exact: true }).click()
        await modal.waitFor()

        await page.setViewportSize({ width: 1920, height: 640 })
        await waitForFiniteAnimations(page)
        await within(left, modalRoot.locator('.ant-modal-mask'), '低窗口弹窗遮罩')
        await modal.locator('.ant-modal-body').evaluate((node) => { node.scrollTop = node.scrollHeight })
        await expect(modal.getByRole('button', { name: '继续编辑', exact: true })).toBeInViewport()
        await within(right, drawer.locator('.ant-drawer-content-wrapper'), '低窗口抽屉')
        await modal.getByRole('button', { name: '继续编辑', exact: true }).click()
        await modal.waitFor({ state: 'hidden' })
        assert.equal(creates.length, 0, '离开确认和继续编辑不写入业务资料')
        await expect(left.getByLabel('订单数量', { exact: true })).toHaveValue('3030')
        await expect(drawer).toBeVisible()
        await drawer.getByRole('button', { name: '完成', exact: true }).focus()
        await page.keyboard.press('Escape')
        await drawer.waitFor({ state: 'hidden' })
        await right.getByRole('button', { name: '查看变化' }).first().click()
        await drawer.getByRole('heading', { name: '字段变化' }).waitFor()
        await businessSplitLayoutButton(page).click()
        await page.getByRole('button', { name: '左右互换' }).click()
        await waitForFiniteAnimations(page)
        await within(right, drawer.locator('.ant-drawer-mask'), '互换后的抽屉')
        assert.ok((await right.boundingBox()).x < (await left.boundingBox()).x)
        await collapseBusinessSplit(page)
        await drawer.waitFor({ state: 'hidden' })
        await page.getByRole('button', { name: '分栏', exact: true }).first().click()
        await drawer.getByRole('heading', { name: '字段变化' }).waitFor()
        await page.setViewportSize({ width: 800, height: 900 })
        await expect(drawer).toBeVisible()
        await waitForFiniteAnimations(page)
        await within(right, drawer.locator('.ant-drawer-content-wrapper'), '窄屏抽屉')
        assert.equal(await collapseButtonIsHittable(page), true, '窄屏抽屉保留外侧收起按钮')
        await outsideCollapseButton(page).focus()
        await page.keyboard.press('Enter')
        await drawer.waitFor({ state: 'hidden' })
        await page.getByRole('button', { name: '分栏', exact: true }).first().click()
        await expect(drawer).toBeVisible()
        await drawer.getByRole('button', { name: '完成', exact: true }).click()
        await drawer.waitFor({ state: 'hidden' })
        await page.locator('.erp-split-switcher').getByText('右栏', { exact: true }).click()
        await expect(left.getByLabel('订单数量', { exact: true })).toHaveValue('3030')
        await assertNoHorizontalOverflow(page, `scoped-overlays-${themeMode}`)
        await originalQuantity.dispose()
      },
    }
  }).concat({
    name: 'business-split-modal-collapse',
    path: '/erp/master/materials',
    auth: 'admin',
    effectiveSession: customerRuntimeEffectiveSession,
    viewport: { width: 1920, height: 640 },
    deviceScaleFactor: 2,
    beforeNavigate: installBOMMaterialMatchingMocks,
    verify: async (page) => {
      page.setDefaultTimeout(12000)
      await page.getByRole('button', { name: '分栏', exact: true }).first().click()
      const right = page.locator('.erp-split-pane--right')
      const picker = right.getByRole('combobox', { name: '选择右栏页面' })
      await picker.click()
      await picker.fill('物料清单')
      await page.locator('.ant-select-dropdown:visible').getByText('物料清单（BOM）', { exact: true }).click()
      await right.getByRole('button', { name: '新建 BOM' }).click()
      await expect(right.getByRole('button', { name: '保存草稿', exact: true })).toBeEnabled()
      const quantity = right.getByLabel('订单数量', { exact: true })
      await quantity.fill('3030')
      await expect(quantity).toHaveValue('3030')
      const identity = await quantity.elementHandle()
      await businessSplitLayoutButton(page).click()
      const menu = page.getByRole('dialog', { name: '分栏布局设置' })
      await expect(menu.getByRole('button', { name: '收起分栏', exact: true })).toHaveCount(0)
      await page.getByRole('spinbutton', { name: '左栏宽度百分比' }).focus()
      await page.keyboard.press('Escape')
      for (const narrow of [false, true]) {
        if (narrow) {
          await businessSplitLayoutButton(page).click()
          await page.getByRole('button', { name: '左右互换' }).click()
          await page.setViewportSize({ width: 800, height: 900 })
          await page.locator('.erp-split-switcher').getByText('左栏', { exact: true }).click()
          await right.getByLabel('订单数量', { exact: true }).click()
        }
        await right.getByRole('button', { name: '返回列表', exact: true }).click()
        const modal = page.getByRole('dialog').filter({ hasText: '放弃未保存的修改？' })
        await modal.waitFor()
        await waitForFiniteAnimations(page)
        assert.equal(await collapseButtonIsHittable(page), true, '栏内确认打开时外侧叉号可点击')
        const box = await outsideCollapseButton(page).boundingBox()
        assert.ok((await modal.boundingBox()).y >= box.y + box.height, '弹窗与外侧叉号不重叠')
        const original = await modal.elementHandle()
        await outsideCollapseButton(page).focus()
        await page.keyboard.press('Enter')
        await modal.waitFor({ state: 'hidden' })
        await page.getByRole('button', { name: '分栏', exact: true }).first().click()
        await expect(modal).toBeVisible()
        assert.equal(await modal.evaluate((node, previous) => node === previous, original), true, '恢复原弹窗实例')
        await modal.getByRole('button', { name: '继续编辑', exact: true }).click()
        await modal.waitFor({ state: 'hidden' })
        await expect(quantity).toHaveValue('3030')
        assert.equal(await quantity.evaluate((node, previous) => node === previous, identity), true, '恢复原草稿输入实例')
        await original.dispose()
      }
      await identity.dispose()
      await page.screenshot({ path: `${outputDir}/business-split-modal-collapse.png`, fullPage: true })
    },
  }, ...createBusinessSplitRecoveryScenarios({ assert, customerRuntimeEffectiveSession, outputDir }))
}
