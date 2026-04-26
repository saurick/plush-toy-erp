import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'

import { chromium } from 'playwright'
import {
  A4_PAGE_HEIGHT_PX,
  CONTINUED_PRINT_PAGE_MARGIN,
  PRINT_PAGE_STYLE_ELEMENT_ID,
} from '../src/erp/utils/printPageMargin.mjs'
import { RpcErrorCode } from '../src/common/consts/errorCodes.generated.js'
import { getNavigationSections } from '../src/erp/config/seedData.mjs'

const webDir = path.resolve(import.meta.dirname, '..')
const outputDir = path.resolve(webDir, 'output', 'playwright', 'style-l1')
const devServerPort = Number(process.env.STYLE_L1_PORT || 4173)
const externalBaseURL = String(process.env.STYLE_L1_BASE_URL || '').trim()
const baseURL = externalBaseURL || `http://127.0.0.1:${devServerPort}`
const headless = process.env.HEADED !== '1'
const scenarioFilter = new Set(
  String(process.env.STYLE_L1_SCENARIOS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
)

let devServerProcess = null
let devServerLogs = ''
const mockPdfBuffer = Buffer.from(
  '%PDF-1.4\\n%plush-style-l1\\n1 0 obj\\n<<>>\\nendobj\\ntrailer\\n<<>>\\n%%EOF\\n',
  'utf8'
)

const assertAntdModalCentered = (...args) =>
  assertAntdModalCenteredImpl(...args)
const assertBatchDeleteModalCountLayout = (...args) =>
  assertBatchDeleteModalCountLayoutImpl(...args)

const scenarios = [
  {
    name: 'root-redirect-desktop',
    path: '/',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await expectHeading(page, '毛绒 ERP 管理后台')
      await expectButton(page, /登\s*录/)
      await expectText(page, '东莞市永绅玩具有限公司')
      await assertAdminLoginLayout(page, { minCardWidth: 520 })
    },
  },
  {
    name: 'root-redirect-mobile',
    path: '/',
    viewport: { width: 390, height: 844 },
    verify: async (page) => {
      await expectHeading(page, '毛绒 ERP 管理后台')
      await expectButton(page, /登\s*录/)
      await expectText(page, '东莞市永绅玩具有限公司')
      await assertAdminLoginLayout(page, { minCardWidth: 320 })
    },
  },
  {
    name: 'admin-login-mobile',
    path: '/admin-login',
    viewport: { width: 390, height: 844 },
    verify: async (page) => {
      await expectText(page, '毛绒 ERP 管理后台')
      await expectButton(page, /登\s*录/)
      await expectText(page, '东莞市永绅玩具有限公司')
      await assertAdminLoginLayout(page, { minCardWidth: 320 })
    },
  },
  {
    name: 'auth-expired-alert-mobile',
    path: '/erp/dashboard',
    auth: 'admin-expired',
    viewport: { width: 390, height: 844 },
    verify: async (page) => {
      await expectText(page, '登录状态已失效')
      await expectButton(page, /重新登录/)
      await assertAppAlertDialogLayout(page, {
        scenarioName: 'auth-expired-alert-mobile',
      })
      await page.screenshot({
        path: path.resolve(outputDir, 'auth-expired-alert-mobile-open.png'),
        fullPage: true,
      })
      await page.getByRole('button', { name: '重新登录' }).click()
      await waitForPath(page, '/admin-login')
      await expectText(page, '毛绒 ERP 管理后台')
    },
  },
  {
    name: 'erp-dashboard-redirect',
    path: '/erp/dashboard',
    viewport: { width: 1280, height: 800 },
    verify: async (page) => {
      await expectText(page, '毛绒 ERP 管理后台')
      await expectButton(page, /登\s*录/)
      await assertAdminLoginLayout(page, { minCardWidth: 520 })
    },
  },
  {
    name: 'erp-dashboard-desktop',
    path: '/erp/dashboard',
    auth: 'admin',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await expectText(page, '东莞市永绅玩具有限公司')
      await expectText(page, '超级管理员')
      await expectText(page, 'style-l1-admin')
      await expectText(page, '看板中心')
      await expectHeading(page, '任务看板')
      await expectText(page, '任务处理统计')
      await expectText(page, '待处理任务数')
      await expectText(page, '即将到期任务数')
      await expectText(page, '任务处理明细')
      await expectButton(page, '去业务看板')
      await assertShellRefreshButton(page, {
        scenarioName: 'erp-dashboard-desktop',
        expectVisible: true,
      })
      await page.evaluate(async () => {
        const response = await fetch('/rpc/workflow', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 'dashboard-task-navigation',
            method: 'create_task',
            params: {
              task_code: 'style-l1-dashboard-task-navigation',
              task_group: 'shipment_release',
              task_name: '看板跳转测试任务',
              source_type: 'shipping-release',
              source_id: 9010,
              source_no: 'OUT-DASH-NAV',
              business_status_key: 'shipment_pending',
              task_status_key: 'ready',
              owner_role_key: 'warehouse',
              payload: {
                notification_type: 'task_created',
                alert_type: 'shipment_pending',
              },
            },
          }),
        })
        return response.json()
      })
      await page.getByRole('button', { name: /刷新当前页/ }).click()
      await expectText(page, '看板跳转测试任务')
      await page.getByRole('button', { name: '看板跳转测试任务' }).click()
      await waitForPath(page, '/erp/warehouse/shipping-release')
      await expectText(page, '待出货/出货放行')
      await page.goBack()
      await waitForPath(page, '/erp/dashboard')
      await expectHeading(page, '任务看板')
    },
  },
  {
    name: 'erp-business-dashboard-desktop',
    path: '/erp/business-dashboard',
    auth: 'admin',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await expectText(page, '东莞市永绅玩具有限公司')
      await expectText(page, '超级管理员')
      await expectText(page, '看板中心')
      await expectHeading(page, '业务看板')
      await expectText(page, '业务记录总数')
      await expectText(page, '业务关注统计')
      await expectText(page, '严重预警数')
      await expectText(page, '一般预警数')
      await expectText(page, '计划物控关注事项')
      await expectText(page, '业务状态分布')
      await expectText(page, '记录数')
      await expectButton(page, '去任务看板')
      await assertShellRefreshButton(page, {
        scenarioName: 'erp-business-dashboard-desktop',
        expectVisible: true,
      })
      await page.getByRole('button', { name: '去任务看板' }).click()
      await waitForPath(page, '/erp/dashboard')
      await expectHeading(page, '任务看板')
      await page.goBack()
      await waitForPath(page, '/erp/business-dashboard')
      await expectHeading(page, '业务看板')
    },
  },
  {
    name: 'erp-layout-scroll-isolated',
    path: '/erp/dashboard',
    auth: 'admin',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await page.locator('.erp-admin-menu').waitFor({ timeout: 10_000 })
      await page.locator('.erp-admin-content').waitFor({ timeout: 10_000 })
      const result = await page.evaluate(() => {
        const menu = document.querySelector('.erp-admin-menu')
        const content = document.querySelector('.erp-admin-content')
        if (!menu || !content) {
          return { ok: false, reason: 'missing menu or content container' }
        }

        const menuStyle = window.getComputedStyle(menu)
        const beforeMenuTop = menu.getBoundingClientRect().top
        const beforeMenuScroll = menu.scrollTop
        content.scrollTop = 480
        const afterMenuTop = menu.getBoundingClientRect().top
        const afterMenuScroll = menu.scrollTop

        return {
          ok:
            menuStyle.overflowY === 'auto' &&
            Math.abs(beforeMenuTop - afterMenuTop) < 1 &&
            beforeMenuScroll === afterMenuScroll,
          reason: {
            overflowY: menuStyle.overflowY,
            beforeMenuTop,
            afterMenuTop,
            beforeMenuScroll,
            afterMenuScroll,
          },
        }
      })

      assert(
        result.ok,
        `侧栏与内容滚动未隔离: ${JSON.stringify(result.reason)}`
      )
    },
  },
  {
    name: 'erp-dashboard-mobile',
    path: '/erp/dashboard',
    auth: 'admin',
    viewport: { width: 390, height: 844 },
    verify: async (page) => {
      await expectText(page, '超级管理员')
      await expectText(page, '毛绒 ERP 管理后台')
      await expectText(page, '任务看板')
      await expectText(page, '任务处理统计')
      await expectText(page, '任务处理明细')
    },
  },
  {
    name: 'erp-business-dashboard-mobile',
    path: '/erp/business-dashboard',
    auth: 'admin',
    viewport: { width: 390, height: 844 },
    verify: async (page) => {
      await expectText(page, '超级管理员')
      await expectText(page, '毛绒 ERP 管理后台')
      await expectText(page, '业务看板')
      await expectText(page, '业务关注统计')
      await expectText(page, '业务状态分布')
    },
  },
  {
    name: 'business-module-workflow-actions',
    path: '/erp/sales/project-orders',
    auth: 'admin',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await expectHeading(page, '客户/款式立项')
      await expectText(page, '新建记录')
      await assertTextAbsent(page, '批量删除')
      await assertBusinessModuleToolbarControlStyle(page, {
        scenarioName: 'business-module-workflow-actions',
      })
      await assertBusinessSelectionActionBarHidden(page, {
        scenarioName: 'business-module-workflow-actions',
      })
      const businessActionToolbar = page.locator(
        '.erp-business-module-current-action'
      )
      await assertTextAbsent(page, '关联表格')
      await expectText(page, '协同任务池')
      await assertBusinessPageRefreshEntrypoint(page, {
        scenarioName: 'business-module-workflow-actions',
      })
      await page.getByRole('button', { name: '刷新当前页' }).click()
      await expectText(page, '当前页面数据已刷新')
      await verifyBusinessModuleColumnOrderDialog(page)
      await assertBusinessModuleCompactWorkspace(page, {
        scenarioName: 'business-module-workflow-actions-empty',
        expectSelectionAction: false,
      })

      await page.getByRole('button', { name: '新建记录' }).click()
      await assertBusinessRecordModalLayout(page, {
        scenarioName: 'business-module-create-modal',
        minModalWidth: 1200,
        expectCompactGrid: true,
      })
      const createDialog = page.getByRole('dialog', {
        name: '新建：客户/款式立项',
      })
      await createDialog
        .getByRole('textbox', { name: '订单编号' })
        .fill('STYLE-L1-001')
      await createDialog
        .getByRole('textbox', { name: '* 客户' })
        .fill('联调客户')
      await createDialog.getByLabel('款式 / 项目名称').fill('毛绒熊立项')
      await page
        .locator(
          '.erp-business-record-item-grid input[placeholder="产品、颜色或款式分行"]'
        )
        .fill('浅棕色毛绒熊')
      await page
        .locator('.erp-business-record-item-grid .ant-input-number-input')
        .nth(0)
        .fill('2')
      await page
        .locator('.erp-business-record-item-grid input[placeholder="单位"]')
        .fill('pcs')
      await page
        .locator('.erp-business-record-item-grid input[aria-label="单位 pcs"]')
        .waitFor({ state: 'visible', timeout: 10_000 })
      await page
        .locator('.erp-business-record-item-grid .ant-input-number-input')
        .nth(1)
        .fill('39.8')
      await page
        .locator('.erp-business-record-item-grid input[aria-label="单位 CNY"]')
        .waitFor({ state: 'visible', timeout: 10_000 })
      await expectText(page, '数量合计 2')
      await expectText(page, '金额合计 39.80')
      await createDialog.getByRole('button', { name: /确\s*定/ }).click()
      await expectText(page, 'STYLE-L1-001')
      await expectText(page, '1 行')
      await expectText(page, '39.80')

      await businessActionToolbar
        .getByRole('button', { name: /关联表格/ })
        .click()
      await page
        .locator(
          '.ant-dropdown:not(.ant-dropdown-hidden) .ant-dropdown-menu-item'
        )
        .filter({ hasText: '材料 BOM' })
        .waitFor({ state: 'visible', timeout: 10_000 })
      await page.keyboard.press('Escape')

      await businessActionToolbar
        .getByRole('button', { name: /流转业务状态|流转/ })
        .click()
      const approveStatusItem = page
        .locator(
          '.ant-dropdown:not(.ant-dropdown-hidden) .ant-dropdown-menu-item'
        )
        .filter({ hasText: '立项已放行' })
        .first()
      await approveStatusItem.waitFor({ state: 'visible', timeout: 10_000 })
      await approveStatusItem.click({ force: true })
      await expectText(page, '业务状态已更新为：立项已放行')
      await expectText(page, '立项已放行')

      await page.getByRole('button', { name: '创建协同任务' }).click()
      await expectText(page, '客户/款式立项：毛绒熊立项')
      await expectText(page, '可执行')

      await businessActionToolbar
        .getByRole('button', { name: /流转业务状态|流转/ })
        .click()
      const blockedStatusItem = page
        .locator(
          '.ant-dropdown:not(.ant-dropdown-hidden) .ant-dropdown-menu-item'
        )
        .filter({ hasText: '业务阻塞' })
        .first()
      await blockedStatusItem.waitFor({ state: 'visible', timeout: 10_000 })
      await blockedStatusItem.evaluate((element) => element.click())
      await expectText(page, '流转业务状态：业务阻塞')
      await assertBusinessRecordModalLayout(page, {
        scenarioName: 'business-status-reason-modal',
        minModalWidth: 480,
        expectCompactGrid: false,
      })
      await page.getByLabel('原因说明').fill('资料未齐，等待客户确认')
      await page.getByRole('button', { name: '确认流转' }).click()
      await expectText(page, '业务状态已更新为：业务阻塞')
      await expectText(page, '业务阻塞')
      await expectText(page, '阻塞')
      await expectText(page, '资料未齐，等待客户确认')
      await assertBusinessModuleCompactWorkspace(page, {
        scenarioName: 'business-module-workflow-actions-filled',
        expectSelectionAction: true,
      })
      await assertTextAbsent(page, '返回当前记录')

      await page.getByRole('button', { name: '批量删除' }).click()
      const batchDeleteDialog = page.getByRole('dialog', {
        name: '批量删除记录',
      })
      await batchDeleteDialog.waitFor({ state: 'visible', timeout: 10_000 })
      await assertAntdModalCentered(
        page,
        batchDeleteDialog,
        'business-module-batch-delete-modal'
      )
      await batchDeleteDialog.getByText('已选择 1 条记录').waitFor({
        state: 'visible',
        timeout: 10_000,
      })
      await assertBatchDeleteModalCountLayout(page, {
        scenarioName: 'business-module-batch-delete-modal-empty',
        screenshotName: 'business-module-batch-delete-modal-open',
      })
      await batchDeleteDialog
        .getByPlaceholder('请输入删除原因（可选）')
        .fill('L1 批量删除回归')
      await assertBatchDeleteModalCountLayout(page, {
        scenarioName: 'business-module-batch-delete-modal-filled',
      })
      await assertVisibleModalInputFocusStyle(page, {
        scenarioName: 'business-module-batch-delete-modal-focus',
        modalText: '批量删除记录',
      })
      await batchDeleteDialog.getByRole('button', { name: '确认删除' }).click()
      await expectText(page, '已批量移入回收站 1 条')

      await page.getByRole('button', { name: '回收站' }).click()
      const recycleDialog = page.getByRole('dialog', { name: '回收站' })
      await recycleDialog.waitFor({ state: 'visible', timeout: 10_000 })
      await assertAntdModalCentered(
        page,
        recycleDialog,
        'business-module-recycle-modal'
      )
      await recycleDialog.getByText('STYLE-L1-001').waitFor({
        state: 'visible',
        timeout: 10_000,
      })
      await recycleDialog.getByText('L1 批量删除回归').waitFor({
        state: 'visible',
        timeout: 10_000,
      })
      await recycleDialog
        .locator('.ant-table-tbody tr')
        .filter({ hasText: 'STYLE-L1-001' })
        .locator('button')
        .last()
        .click()
      await expectText(page, '业务记录已恢复')
      await recycleDialog.getByText('回收站暂无记录').waitFor({
        state: 'visible',
        timeout: 10_000,
      })
      await recycleDialog.locator('.ant-modal-close').click()
      await recycleDialog.waitFor({ state: 'hidden', timeout: 10_000 })
      await assertTextAbsent(page, '返回当前记录')
    },
  },
  {
    name: 'business-module-toolbar-mobile-dropdown',
    path: '/erp/sales/project-orders',
    auth: 'admin',
    viewport: { width: 470, height: 680 },
    verify: async (page) => {
      await expectHeading(page, '客户/款式立项')
      await page
        .locator('.erp-business-date-range-filter input[type="date"]')
        .first()
        .waitFor({ state: 'visible', timeout: 10_000 })
      await assertBusinessModuleStatusDropdownStyle(page, {
        scenarioName: 'business-module-toolbar-mobile-dropdown',
      })
    },
  },
  {
    name: 'business-module-material-bom-modal-style',
    path: '/erp/purchase/material-bom',
    auth: 'admin',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await expectHeading(page, '材料 BOM')
      await page.getByRole('button', { name: '新建记录' }).click()
      const bomDialog = page.getByRole('dialog', {
        name: '新建：材料 BOM',
      })
      await bomDialog.waitFor({ state: 'visible', timeout: 10_000 })
      await assertBusinessRecordModalLayout(page, {
        scenarioName: 'business-module-material-bom-modal-style',
        minModalWidth: 1200,
        expectCompactGrid: true,
      })
      await assertBusinessRecordItemCardLayout(page, {
        scenarioName: 'business-module-material-bom-modal-style',
      })
      await expectText(page, 'BOM 明细')
      await expectText(page, '添加条目')
      await expectText(page, '已录入 1 条')
      await bomDialog.getByRole('button', { name: '复制条目 1' }).click()
      await expectText(page, '条目 2')
      await expectText(page, '已录入 2 条')
      await bomDialog.getByRole('button', { name: '删除条目 2' }).click()
      await assertTextAbsent(page, '条目 2')
      await expectText(page, '已录入 1 条')
      await bomDialog.getByRole('button', { name: '添加条目' }).click()
      await expectText(page, '条目 2')
      await bomDialog.getByRole('button', { name: '删除条目 2' }).click()
      await assertTextAbsent(page, '条目 2')
      await expectText(page, '已录入 1 条')
      await bomDialog.locator('.ant-modal-close').click()
      await bomDialog.waitFor({ state: 'hidden', timeout: 10_000 })
    },
  },
  {
    name: 'business-module-derived-item-amount',
    path: '/erp/purchase/accessories',
    auth: 'admin',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await expectHeading(page, '辅材/包材采购')

      await page.getByRole('button', { name: '新建记录' }).click()
      const purchaseDialog = page.getByRole('dialog', {
        name: '新建：辅材/包材采购',
      })
      await purchaseDialog.waitFor({ state: 'visible', timeout: 10_000 })
      await purchaseDialog.getByLabel('采购单号').fill('PUR-L1-001')
      await purchaseDialog.getByLabel('采购事项').fill('辅料采购自动汇总')
      await purchaseDialog
        .getByRole('textbox', { name: '* 供应商' })
        .fill('联调供应商')
      await purchaseDialog.getByLabel('到料日期').fill('2026-04-28')
      await page
        .locator(
          '.erp-business-record-item-grid input[placeholder="辅材 / 包材名称"]'
        )
        .fill('PP 棉')
      await page
        .locator('.erp-business-record-item-grid .ant-input-number-input')
        .nth(0)
        .fill('3')
      await page
        .locator('.erp-business-record-item-grid .ant-input-number-input')
        .nth(1)
        .fill('12.5')
      await expectText(page, '数量合计 3')
      await expectText(page, '金额合计 37.50')

      await page
        .locator('.erp-business-record-modal:visible')
        .getByRole('button', { name: /确\s*定/ })
        .click()
      await expectText(page, 'PUR-L1-001')
      await expectText(page, '辅料采购自动汇总')
      await expectText(page, '37.50')
      await expectText(page, '1 行')

      const toolbarDateInputs = page.locator(
        '.erp-business-filter-panel input[type="date"]'
      )
      assert.equal(
        await toolbarDateInputs.count(),
        2,
        '业务页工具栏应保留起止两个日期筛选输入'
      )
      const purchaseRecordRow = page
        .locator('.erp-business-module-table-card .ant-table-tbody tr')
        .filter({ hasText: 'PUR-L1-001' })
      await toolbarDateInputs.nth(0).fill('2026-05-01')
      await purchaseRecordRow.waitFor({
        state: 'hidden',
        timeout: 10_000,
      })
      await toolbarDateInputs.nth(0).fill('2026-04-01')
      await purchaseRecordRow.waitFor({
        state: 'visible',
        timeout: 10_000,
      })
      await purchaseRecordRow.click()
      const printPurchaseContractButton = page.getByRole('button', {
        name: '打印采购合同',
      })
      await printPurchaseContractButton.waitFor({
        state: 'visible',
        timeout: 10_000,
      })
      assert.equal(
        await printPurchaseContractButton.isEnabled(),
        true,
        '选中辅材 / 包材采购记录后应允许带值打印采购合同'
      )
      const printWindowPromise = page.waitForEvent('popup')
      await printPurchaseContractButton.click()
      const printWindow = await printWindowPromise
      try {
        await printWindow.waitForLoadState('domcontentloaded')
        await expectText(printWindow, '采购合同')
        await expectText(printWindow, '业务记录带值')
        await expectText(printWindow, 'PUR-L1-001')
        await expectText(printWindow, '联调供应商')
        await expectText(printWindow, 'PP 棉')
      } finally {
        await printWindow.close()
      }
    },
  },
  {
    name: 'permission-center-loading-state',
    path: '/erp/system/permissions?__style_l1_admin_list_delay=900',
    auth: 'admin',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await expectText(page, '权限加载中')
      await expectText(page, '正在同步管理员、角色和权限码，请稍候...')
      await expectHeading(page, '权限管理')
      await assertTextAbsent(page, '权限加载中')
    },
  },
  {
    name: 'permission-center-desktop',
    path: '/erp/system/permissions',
    auth: 'admin',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await expectHeading(page, '权限管理')
      await expectText(page, '创建管理员')
      await expectText(page, '超级管理员')
      await expectText(page, '角色权限')
      const adminSearch =
        page.getByPlaceholder('搜索管理员账号、手机号、角色或权限码')
      await adminSearch.fill('assistant')
      await expectText(page, '命中 1/2 个管理员')
      const filteredTableText = await page
        .locator('.ant-table-tbody')
        .innerText()
      assert(
        filteredTableText.includes('assistant-admin') &&
          !filteredTableText.includes('style-l1-admin'),
        `权限管理搜索结果不符合预期: ${filteredTableText}`
      )
      await adminSearch.fill('')
      await expectText(page, '共 2 个管理员')
      await assertPaginationSizeChangerFocusStyle(page, {
        scenarioName: 'permission-center-desktop',
      })
      await assertShellRefreshButton(page, {
        scenarioName: 'permission-center-desktop',
        expectVisible: true,
      })
      await page.getByRole('button', { name: '刷新当前页' }).click()
      await expectText(page, '当前页面数据已刷新')
      await page.getByRole('button', { name: '创建管理员' }).click()
      await expectText(page, '创建管理员')
      await expectText(page, '初始密码')
      await expectText(page, '角色')
      await expectText(page, '选择一个或多个角色')
      await assertAdminRoleModalLayout(page, {
        scenarioName: 'permission-center-create-modal',
        title: '创建管理员',
      })
      await assertTextAbsent(page, '搜索菜单权限名称或路径')
      await page
        .locator('.ant-modal-content')
        .filter({ hasText: '创建管理员' })
        .last()
        .locator('.ant-modal-footer button')
        .first()
        .click()
      await page
        .getByRole('row', { name: /assistant-admin/ })
        .getByRole('button', { name: '重置密码' })
        .click()
      const resetModal = page
        .locator('.ant-modal-content')
        .filter({ hasText: '重置密码：assistant-admin' })
        .last()
      await resetModal.getByText('新密码').waitFor()
      await assertVisibleModalInputFocusStyle(page, {
        scenarioName: 'permission-center-reset-modal-focus',
        modalText: '重置密码：assistant-admin',
      })
      await resetModal
        .locator('.ant-input-affix-wrapper input')
        .fill('new-secret')
      await page
        .getByRole('button', { name: /重\s*置/ })
        .last()
        .click()
      await expectText(page, '已重置管理员 assistant-admin 的密码')
    },
  },
  {
    name: 'help-center-desktop',
    path: '/erp/help-center',
    auth: 'admin',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await expectHeading(page, '业务操作导航')
      await expectText(page, '新手先看')
      await expectText(page, '按角色找工作')
      await expectText(page, '按业务主线查')
      await expectText(page, '手机端看不到任务怎么办？')
      await expectText(page, '高级文档 / 管理员 / 开发验收')
      await assertNoHorizontalOverflow(page, 'help-center-desktop-before-click')
      await page.getByRole('link', { name: 'ERP 操作教程' }).first().click()
      await expectHeading(page, 'ERP 操作教程')
    },
  },
  {
    name: 'help-center-mobile',
    path: '/erp/help-center',
    auth: 'admin',
    viewport: { width: 390, height: 844 },
    verify: async (page) => {
      await expectHeading(page, '业务操作导航')
      await expectText(page, '新手先看')
      await expectText(page, '按角色找工作')
      await expectText(page, '常见问题')
      await expectText(page, '高级文档 / 管理员 / 开发验收')
    },
  },
  {
    name: 'operation-flow-overview-desktop',
    path: '/erp/docs/operation-flow-overview',
    auth: 'admin',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await expectHeading(page, 'ERP 流程图总览')
      await expectText(page, '流程速览')
      await expectText(page, '来源链路速览')
      await expectText(page, '基础资料与业务立项')
      await expectText(page, '材料与委外准备')
      await expectText(page, '结算与移动端协同')
      await expectText(page, '查看完整版流程文档')
    },
  },
  {
    name: 'role-collaboration-guide-desktop',
    path: '/erp/docs/role-collaboration-guide',
    auth: 'admin',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await expectHeading(page, '角色协同链路')
      await expectText(page, '业务 -> 老板')
      await expectText(page, '采购 -> PMC')
      await expectText(page, '手机端和桌面端怎么衔接')
    },
  },
  {
    name: 'desktop-role-guide-desktop',
    path: '/erp/docs/desktop-role-guide',
    auth: 'admin',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await expectHeading(page, '桌面端角色流程')
      await expectText(page, '桌面端角色总览')
      await expectText(page, '老板')
      await expectText(page, 'PMC')
      await expectText(page, '生产经理')
      await page.locator('.erp-admin-content').evaluate((node) => {
        node.scrollTo({ top: 1200 })
      })
      await expectButton(page, '回顶部')
    },
  },
  {
    name: 'mobile-role-guide-desktop',
    path: '/erp/docs/mobile-role-guide',
    auth: 'admin',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await expectHeading(page, '手机端角色流程')
      await expectText(page, '手机端角色总览')
      await expectText(page, '品质')
      await expectText(page, '财务')
      await expectText(page, '任务分配、任务处理、处理反馈')
    },
  },
  {
    name: 'print-center-desktop',
    path: '/erp/print-center',
    auth: 'admin',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await expectHeading(page, '打印模板中心')
      await expectText(page, '打开可编辑打印窗口')
      await expectText(page, '模板目录')
      await expectText(page, '采购合同')
      await expectText(page, '加工合同')
      await expectText(page, '当前模板')
      await expectText(page, '模板数量')
      await assertTextAbsent(page, '页面结构')
      await assertTextAbsent(page, '适用场景')
      await assertTextAbsent(page, '版式特点')
      await assertTextAbsent(page, '输出方式')
      await assertTextAbsent(page, '模板来源')
      await assertTextAbsent(page, '使用提醒')
    },
  },
  {
    name: 'print-preview-material',
    path: '/erp/print-center/material-purchase-contract',
    auth: 'admin',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await expectHeading(page, '采购合同')
      await expectText(page, '兼容入口')
      await expectText(page, '打开可编辑打印窗口')
      await expectText(page, '返回打印中心')
    },
  },
  {
    name: 'print-preview-processing',
    path: '/erp/print-center/processing-contract',
    auth: 'admin',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await expectHeading(page, '加工合同')
      await expectText(page, '兼容入口')
      await expectText(page, '打开可编辑打印窗口')
      await expectText(page, '返回打印中心')
    },
  },
  {
    name: 'print-workspace-material-shell-refresh',
    path: '/erp/print-center?template=material-purchase-contract',
    auth: 'admin',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await assertEditablePrintWorkspacePopupRefresh(page, {
        expectedTitle: '采购合同',
        editableSelector:
          '.erp-material-contract-table tbody td [contenteditable="true"]',
        editableScenarioLabel: '采购合同弹窗刷新恢复',
      })
    },
  },
  {
    name: 'print-workspace-processing-shell-refresh',
    path: '/erp/print-center?template=processing-contract',
    auth: 'admin',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await assertEditablePrintWorkspacePopupRefresh(page, {
        expectedTitle: '加工合同',
        editableSelector:
          '.erp-processing-contract-table tbody td [contenteditable="true"]',
        editableScenarioLabel: '加工合同弹窗刷新恢复',
      })
    },
  },
  {
    name: 'print-workspace-material',
    path: '/erp/print-workspace/material-purchase-contract',
    auth: 'admin',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await expectText(page, '采购合同')
      await expectText(page, '当前记录字段（可编辑）')
      await expectText(page, '使用默认模板')
      await expectText(page, '在线预览 PDF')
      await expectText(page, '选择明细行')
      await expectText(page, '下载 PDF')
      await assertPrintWorkspacePaginationStyle(page, {
        paperSelector: '.erp-material-contract-paper',
        rowSelector: '.erp-material-contract-table tbody tr',
        theadSelector: '.erp-material-contract-table thead',
      })
      await assertContractTableHeadersStaySingleLine(page, {
        tableSelector: '.erp-material-contract-table',
        expectedHeaders: [
          '采购订单号',
          '产品订单编号',
          '产品编号',
          '产品名称',
          '材料品名',
          '厂商料号',
          '规格',
          '单位',
          '单价',
          '采购数量',
          '采购金额',
          '备注',
        ],
      })
      await assertContractTableEditableAlignment(page, {
        tableSelector: '.erp-material-contract-table',
        editableSelector:
          '.erp-material-contract-table tbody td [contenteditable="true"]',
        scenarioLabel: '采购合同模板表格',
      })
      await assertContractTotalCellsWrapLargeNumbers(page, {
        storageKey: '__plush_erp_material_purchase_contract_print_draft__',
        templateKind: 'material',
        totalValueSelector:
          '.erp-material-contract-table__total .erp-contract-table__total-value',
        scenarioLabel: '采购合同模板合计行',
      })
      await assertMaterialContractMetaAlignment(page)
      await assertWorkspaceContinuedPageMargin(page, {
        storageKey: '__plush_erp_material_purchase_contract_print_draft__',
        paperSelector: '.erp-material-contract-paper',
        clearMerges: true,
      })
    },
  },
  {
    name: 'print-workspace-material-print-media-narrow-viewport',
    path: '/erp/print-workspace/material-purchase-contract',
    auth: 'admin',
    viewport: { width: 760, height: 900 },
    verify: async (page) => {
      await expectText(page, '采购合同')
      await assertMaterialContractPrintMediaIgnoresResponsiveBreakpoints(page)
    },
  },
  {
    name: 'print-workspace-processing',
    path: '/erp/print-workspace/processing-contract',
    auth: 'admin',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await expectText(page, '加工合同')
      await expectText(page, '当前记录字段（可编辑）')
      await expectText(page, '使用默认模板')
      await expectText(page, '在线预览 PDF')
      await expectText(page, '下载 PDF')
      await expectText(page, '选择明细行')
      await expectText(page, '加工明细行: 3/300')
      await expectText(page, '打印')
      await expectButton(page, '上传纸样 / 图样附件位 1')
      await expectButton(page, '上传纸样 / 图样附件位 2')
      await assertProcessingContractPaperRowCount(page)
      await assertProcessingContractSignatureLayout(page)
      await assertPrintWorkspacePaginationStyle(page, {
        paperSelector: '.erp-processing-contract-paper',
        rowSelector: '.erp-processing-contract-table tbody tr',
        theadSelector: '.erp-processing-contract-table thead',
      })
      await assertContractTableHeadersStaySingleLine(page, {
        tableSelector: '.erp-processing-contract-table',
        expectedHeaders: [
          '委外加工订单号',
          '产品订单编号',
          '产品编号',
          '产品名称',
          '工序名称',
          '加工厂商',
          '工序类别',
          '单位',
          '单价',
          '委托加工数量',
          '委托加工金额',
          '备注',
        ],
      })
      await assertContractTableEditableAlignment(page, {
        tableSelector: '.erp-processing-contract-table',
        editableSelector:
          '.erp-processing-contract-table tbody td [contenteditable="true"]',
        scenarioLabel: '加工合同模板表格',
      })
      await assertContractTotalCellsWrapLargeNumbers(page, {
        storageKey: '__plush_erp_processing_contract_print_draft__',
        templateKind: 'processing',
        totalValueSelector:
          '.erp-processing-contract-table__total .erp-contract-table__total-value',
        scenarioLabel: '加工合同模板合计行',
      })
      await assertWorkspaceContinuedPageMargin(page, {
        storageKey: '__plush_erp_processing_contract_print_draft__',
        paperSelector: '.erp-processing-contract-paper',
      })
      const emptyAttachmentState = await page.evaluate(() => ({
        templateAttachmentCount: document.querySelectorAll(
          '.erp-processing-contract-attachments'
        ).length,
        templateAttachmentImageCount: document.querySelectorAll(
          '.erp-processing-contract-attachments__image'
        ).length,
      }))
      assert.equal(
        emptyAttachmentState.templateAttachmentCount,
        0,
        '未上传时纸面不应渲染附件区'
      )
      assert.equal(
        emptyAttachmentState.templateAttachmentImageCount,
        0,
        '未上传时纸面不应渲染附件图片'
      )
      await page
        .locator('.erp-processing-contract-upload-bar__input')
        .first()
        .setInputFiles(path.resolve(webDir, 'public', 'favicon.svg'))
      await expectText(page, '已同步：favicon.svg')
      const attachmentTemplateState = await page.evaluate(() => ({
        uploadPanelCount: document.querySelectorAll(
          '.erp-processing-contract-upload-bar'
        ).length,
        templateAttachmentCount: document.querySelectorAll(
          '.erp-processing-contract-attachments'
        ).length,
        templateAttachmentImageCount: document.querySelectorAll(
          '.erp-processing-contract-attachments__image'
        ).length,
      }))
      assert.equal(
        attachmentTemplateState.uploadPanelCount,
        1,
        '加工合同工作台应显示独立附件上传区'
      )
      assert.equal(
        attachmentTemplateState.templateAttachmentCount,
        1,
        '加工合同纸面模板应渲染页底附件区'
      )
      assert.equal(
        attachmentTemplateState.templateAttachmentImageCount,
        1,
        '上传后的附件应同步显示到纸面附件位'
      )
      await page.getByRole('button', { name: '清空' }).click()
      await expectText(page, '未上传')
      const clearedAttachmentState = await page.evaluate(() => ({
        templateAttachmentCount: document.querySelectorAll(
          '.erp-processing-contract-attachments'
        ).length,
        templateAttachmentImageCount: document.querySelectorAll(
          '.erp-processing-contract-attachments__image'
        ).length,
      }))
      assert.equal(
        clearedAttachmentState.templateAttachmentCount,
        0,
        '清空附件位后不应保留附件区'
      )
      assert.equal(
        clearedAttachmentState.templateAttachmentImageCount,
        0,
        '清空附件位后不应残留旧图'
      )
    },
  },
  {
    name: 'print-workspace-material-row-selection-reset',
    path: '/erp/print-workspace/material-purchase-contract',
    auth: 'admin',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await assertRowSelectionClearsAfterCancel(page, {
        dataRowSelector:
          '.erp-material-contract-table tbody tr:not(.erp-material-contract-table__total)',
        selectedRowSelector: '.erp-material-contract-table__row-selected',
        counterLabel: '采购明细行',
      })
    },
  },
  {
    name: 'print-workspace-processing-row-selection-reset',
    path: '/erp/print-workspace/processing-contract',
    auth: 'admin',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await assertRowSelectionClearsAfterCancel(page, {
        dataRowSelector:
          '.erp-processing-contract-table tbody tr:not(.erp-processing-contract-table__total)',
        selectedRowSelector: '.erp-processing-contract-table__row--selected',
        counterLabel: '加工明细行',
      })
    },
  },
  {
    name: 'print-workspace-material-preview-popup',
    path: '/erp/print-workspace/material-purchase-contract',
    auth: 'admin',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await assertPrintPreviewPopup(page, {
        buttonName: '在线预览 PDF',
        title: '采购合同 PDF 预览',
        screenshotName: 'print-workspace-material-preview-popup-window',
      })
    },
  },
  {
    name: 'print-workspace-processing-preview-popup',
    path: '/erp/print-workspace/processing-contract',
    auth: 'admin',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await assertPrintPreviewPopup(page, {
        buttonName: '在线预览 PDF',
        title: '加工合同 PDF 预览',
        screenshotName: 'print-workspace-processing-preview-popup-window',
      })
    },
  },
  {
    name: 'docs-field-linkage-guide-desktop',
    path: '/erp/docs/field-linkage-guide',
    auth: 'admin',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await page
        .getByRole('heading', { name: 'ERP 字段联动口径' })
        .first()
        .waitFor({ state: 'visible', timeout: 10_000 })
      await expectText(page, 'BOM 真源')
      await assertDocsArticleReadable(page)
    },
  },
  {
    name: 'operation-guide-mobile',
    path: '/erp/docs/operation-guide',
    auth: 'admin',
    viewport: { width: 390, height: 844 },
    verify: async (page) => {
      await expectHeading(page, 'ERP 操作教程')
      await expectText(page, '当前帮助中心怎么读')
      await expectText(page, '角色后台和帮助中心的关系')
    },
  },
  {
    name: 'field-linkage-guide-desktop',
    path: '/erp/docs/field-linkage-guide',
    auth: 'admin',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await expectHeading(page, 'ERP 字段联动口径')
      await expectText(page, '产品订单编号')
      await expectText(page, '材料分析明细表')
    },
  },
  {
    name: 'qa-field-linkage-coverage-desktop',
    path: '/erp/qa/field-linkage-coverage',
    auth: 'admin',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await expectHeading(page, 'ERP 字段联动覆盖状态')
      await expectText(page, 'catalog -> latest JSON -> 页面汇总')
      await expectText(page, '字段覆盖明细')
      await expectText(page, '委托加工金额')
      await page.getByRole('button', { name: '重新读取报告' }).click()
      await expectText(page, '字段覆盖明细')
      await expectText(page, '委托加工金额')
    },
  },
  {
    name: 'qa-acceptance-overview-desktop',
    path: '/erp/qa/acceptance-overview',
    auth: 'admin',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await expectHeading(page, '验收结果总览')
      await expectText(page, '状态总览')
      await expectText(page, '总览与当前工具页')
      await expectText(page, '字段联动字段覆盖')
      await expectText(page, '打印模板覆盖')
      await expectText(page, '当前入口与建议动作')
      await expectText(page, '业务链路调试')
      await expectText(page, '打印模板与合同回归')
      await expectText(page, '已知盲区与使用顺序')
      await expectText(page, '规划表速查')
      await page.getByRole('button', { name: '进入字段联动覆盖' }).click()
      await waitForPath(page, '/erp/qa/field-linkage-coverage')
    },
  },
  {
    name: 'qa-business-chain-debug-desktop',
    path: '/erp/qa/business-chain-debug',
    auth: 'admin',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await expectHeading(page, '业务链路调试')
      await expectText(page, '安全调试中心')
      await expectText(page, '覆盖边界')
      await expectText(page, '链路覆盖矩阵')
      await expectText(page, '已接入 v1 主干闭环')
      await expectText(page, '未覆盖 / 待补扩展链路')
      await expectText(page, '当前不做')
      await expectText(page, '按需生成调试场景')
      await expectText(page, '填入并查询')
      await page.evaluate(async () => {
        const callRpc = async (domain, method, params) => {
          const response = await fetch(`/rpc/${domain}`, {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: `${domain}-${method}`,
              method,
              params,
            }),
          })
          return response.json()
        }

        const recordResult = await callRpc('business', 'create_record', {
          module_key: 'project-orders',
          document_no: 'STYLE-L1-001',
          title: '毛绒熊立项',
          customer_name: '联调客户',
          quantity: 2,
          amount: 39.8,
          business_status_key: 'blocked',
          owner_role_key: 'business',
          payload: {
            status_reason: '资料未齐，等待客户确认',
          },
          items: [
            {
              line_no: 1,
              item_name: '浅棕色毛绒熊',
              quantity: 2,
              amount: 39.8,
            },
          ],
        })
        const record = recordResult?.result?.data?.record
        await callRpc('workflow', 'upsert_business_state', {
          source_type: 'project-orders',
          source_id: record?.id,
          source_no: record?.document_no,
          business_status_key: 'blocked',
          owner_role_key: 'business',
          blocked_reason: '资料未齐，等待客户确认',
          payload: {
            status_reason: '资料未齐，等待客户确认',
          },
        })
        await callRpc('workflow', 'create_task', {
          task_code: 'style-l1-debug-task',
          task_group: 'sales',
          task_name: '客户/款式立项：毛绒熊立项',
          source_type: 'project-orders',
          source_id: record?.id,
          source_no: record?.document_no,
          business_status_key: 'blocked',
          task_status_key: 'blocked',
          owner_role_key: 'business',
          blocked_reason: '资料未齐，等待客户确认',
        })
      })
      await page
        .getByPlaceholder(
          '输入单据号、来源单号、客户、供应商、物料、模块 key 或任务名称'
        )
        .fill('STYLE-L1-001')
      await page.getByRole('button', { name: '查询链路' }).click()
      await expectText(page, 'STYLE-L1-001')
      await expectText(page, '客户/款式立项：毛绒熊立项')
      await expectText(page, '业务阻塞')
      await expectText(page, '资料未齐，等待客户确认')
    },
  },
  {
    name: 'qa-workflow-task-debug-desktop',
    path: '/erp/qa/workflow-task-debug',
    auth: 'admin',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await expectHeading(page, '协同任务调试')
      await expectText(page, 'v1 前端诊断模式')
      await expectText(page, '移动端可见性诊断')
      await page.evaluate(async () => {
        const response = await fetch('/rpc/workflow', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 'workflow-create-debug-task',
            method: 'create_task',
            params: {
              task_code: 'style-l1-workflow-task-debug',
              task_group: 'shipment_release',
              task_name: '协同任务调试：出货资料确认',
              source_type: 'shipping-release',
              source_id: 9001,
              source_no: 'OUT-STYLE-L1',
              business_status_key: 'shipment_pending',
              task_status_key: 'blocked',
              owner_role_key: 'warehouse',
              priority: 3,
              blocked_reason: '客户出货资料未确认',
              payload: {
                notification_type: 'shipment_risk',
                alert_type: 'shipment_due',
                critical_path: true,
                shipment_risk: true,
                urge_count: 1,
                last_urge_reason: '客户催交',
                escalated: true,
                escalate_target_role_key: 'boss',
              },
            },
          }),
        })
        return response.json()
      })
      await page.getByRole('button', { name: '重新读取任务' }).click()
      await expectText(page, 'OUT-STYLE-L1')
      await expectText(page, '协同任务调试：出货资料确认')
      await page.getByLabel('可选 source_no').fill('OUT-STYLE-L1')
      await page.getByLabel('可选 task_group').fill('shipment_release')
      await expectText(page, 'mobileTaskQueries 查询计划')
      await expectText(page, 'PMC 扩展命中 critical_path 任务。')
      await page.getByRole('button', { name: '查看事件' }).first().click()
      await expectText(page, '任务事件接口待接入')
      await expectText(page, '业务、任务、角色绑定关系')
    },
  },
  {
    name: 'business-menu-groups-desktop',
    path: '/erp/sales/project-orders',
    auth: 'admin',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await expectHeading(page, '客户/款式立项')
      await expectText(page, '销售链路')
      await expectText(page, '采购/仓储')
      await expectText(page, '生产环节')
      await expectText(page, '财务环节')
      await expectText(page, '单据模板')
      await page.locator('.erp-admin-menu').evaluate((node) => {
        node.scrollTop = node.scrollHeight
      })
      await expectText(page, '开发与验收')
      await expectText(page, '验收结果总览')
      await expectText(page, '字段联动覆盖')
      assert.equal(
        await page.getByText('基础资料', { exact: true }).count(),
        0,
        '主业务侧栏不应再显示“基础资料”分组'
      )
      assert.equal(
        await page.getByText('流程与真源', { exact: true }).count(),
        0,
        '侧栏不应再显示“流程与真源”分组'
      )
    },
  },
  {
    name: 'business-partners-desktop',
    path: '/erp/master/partners',
    auth: 'admin',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await expectHeading(page, '客户/供应商')
      await expectText(page, '新建记录')
      await assertBusinessSelectionActionBarHidden(page, {
        scenarioName: 'business-partners-desktop',
      })
      await expectText(page, '协同任务池')
    },
  },
  {
    name: 'business-processing-contracts-desktop',
    path: '/erp/purchase/processing-contracts',
    auth: 'admin',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await expectHeading(page, '加工合同/委外下单')
      await expectText(page, '加工合同号')
      await expectText(page, '新建记录')
      await assertBusinessSelectionActionBarHidden(page, {
        scenarioName: 'business-processing-contracts-desktop',
      })
      await assertTextAbsent(page, '打印加工合同')
      await expectText(page, '协同任务池')
    },
  },
  {
    name: 'business-reconciliation-desktop',
    path: '/erp/finance/reconciliation',
    auth: 'admin',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await expectHeading(page, '对账/结算')
      await expectText(page, '对账单号')
      await expectText(page, '导出当前结果')
      await expectText(page, '协同任务池')
    },
  },
]

async function main() {
  await fs.mkdir(outputDir, { recursive: true })
  const selectedScenarios =
    scenarioFilter.size > 0
      ? scenarios.filter((scenario) => scenarioFilter.has(scenario.name))
      : scenarios
  assert(
    selectedScenarios.length > 0,
    `[style:l1] 未匹配到场景: ${[...scenarioFilter].join(', ')}`
  )

  try {
    if (!externalBaseURL) {
      devServerProcess = startDevServer()
      await waitForServer(baseURL)
    }

    const browser = await chromium.launch({ headless })
    try {
      for (const scenario of selectedScenarios) {
        await runScenario(browser, scenario)
      }
    } finally {
      await browser.close()
    }

    console.log(`[style:l1] 通过，共验证 ${selectedScenarios.length} 个场景`)
  } finally {
    await stopDevServer()
  }
}

function startDevServer() {
  const child = spawn(
    'pnpm',
    [
      'exec',
      'vite',
      '--config',
      'vite.config.mjs',
      '--host',
      '127.0.0.1',
      '--port',
      String(devServerPort),
      '--strictPort',
    ],
    {
      cwd: webDir,
      env: {
        ...process.env,
        BROWSER: 'none',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  )

  child.stdout.on('data', (chunk) => {
    devServerLogs += chunk.toString()
  })
  child.stderr.on('data', (chunk) => {
    devServerLogs += chunk.toString()
  })

  child.on('exit', (code) => {
    if (code !== null && code !== 0) {
      devServerLogs += `\n[vite exited with code ${code}]`
    }
  })

  return child
}

async function stopDevServer() {
  if (!devServerProcess) {
    return
  }

  if (devServerProcess.exitCode === null) {
    devServerProcess.kill('SIGTERM')
    await Promise.race([
      new Promise((resolve) => devServerProcess.once('exit', resolve)),
      delay(3000),
    ])
  }

  if (devServerProcess.exitCode === null) {
    devServerProcess.kill('SIGKILL')
  }

  devServerProcess = null
}

async function waitForServer(url) {
  const deadline = Date.now() + 30_000
  let lastError = 'server did not become ready'

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, {
        redirect: 'manual',
      })
      if (response.ok || response.status === 302 || response.status === 304) {
        return
      }
      lastError = `unexpected status ${response.status}`
    } catch (error) {
      lastError = error.message
    }
    await delay(300)
  }

  throw new Error(
    `[style:l1] 无法启动前端预览：${lastError}\n最近 vite 输出：\n${tailLogs(devServerLogs)}`
  )
}

async function runScenario(browser, scenario) {
  const page = await browser.newPage({ viewport: scenario.viewport })
  const errors = []

  if (scenario.auth === 'admin' || scenario.auth === 'admin-expired') {
    const token = createMockAdminToken()
    if (scenario.auth === 'admin-expired') {
      await installAdminAuthExpiredRpcMocks(page)
    } else {
      await installAdminRpcMocks(page)
    }
    await page.addInitScript((mockToken) => {
      localStorage.setItem('admin_access_token', mockToken)
    }, token)
  }

  page.on('console', (message) => {
    if (message.type() === 'error') {
      const text = message.text()
      if (!isIgnorableDevServerError(text)) {
        errors.push(`console error: ${text}`)
      }
    }
  })
  page.on('pageerror', (error) => {
    errors.push(`page error: ${error.message}`)
  })

  try {
    await page.goto(new URL(scenario.path, `${baseURL}/`).toString(), {
      waitUntil: 'domcontentloaded',
    })
    await delay(300)

    if (scenario.expectPath) {
      await waitForPath(page, scenario.expectPath)
    }

    await scenario.verify(page)
    await assertNoHorizontalOverflow(page, scenario.name)
    assert.deepEqual(errors, [], `${scenario.name} 出现控制台或运行时错误`)

    const screenshotPath = path.resolve(outputDir, `${scenario.name}.png`)
    await page.screenshot({ path: screenshotPath, fullPage: true })
  } catch (error) {
    throw new Error(
      `[style:l1] 场景失败: ${scenario.name}\n${error.message}\n最近 vite 输出：\n${tailLogs(devServerLogs)}`
    )
  } finally {
    await page.close()
  }
}

async function waitForPath(page, expectedPath) {
  const deadline = Date.now() + 10_000
  while (Date.now() < deadline) {
    if (new URL(page.url()).pathname === expectedPath) {
      return
    }
    await delay(100)
  }
  assert.equal(new URL(page.url()).pathname, expectedPath)
}

function resolveDelayFromReferer(request, paramName) {
  const referer = String(request.headers().referer || '').trim()
  if (!referer) {
    return 0
  }

  try {
    const raw = new URL(referer).searchParams.get(paramName)
    const delayMs = Number(raw)
    return Number.isFinite(delayMs) && delayMs > 0 ? delayMs : 0
  } catch {
    return 0
  }
}

async function installAdminRpcMocks(page) {
  const mockMenus = getNavigationSections()
    .flatMap((section) => section.items || [])
    .map((item) => ({
      key: item.key || item.path,
      label: item.label,
      path: item.path,
      required_permissions: item.required_permissions || [],
    }))
    .filter((item) => item.path)
  const mockPermissions = [
    {
      permission_key: 'system.user.read',
      name: '查看管理员',
      module: 'system',
    },
    {
      permission_key: 'system.user.create',
      name: '创建管理员',
      module: 'system',
    },
    {
      permission_key: 'system.user.update',
      name: '更新管理员',
      module: 'system',
    },
    {
      permission_key: 'system.user.disable',
      name: '启停管理员',
      module: 'system',
    },
    { permission_key: 'system.role.read', name: '查看角色', module: 'system' },
    {
      permission_key: 'system.permission.read',
      name: '查看权限',
      module: 'system',
    },
    {
      permission_key: 'system.permission.manage',
      name: '管理角色权限',
      module: 'system',
    },
    { permission_key: 'erp.dashboard.read', name: '查看看板', module: 'erp' },
    {
      permission_key: 'business.record.read',
      name: '查看业务记录',
      module: 'business',
    },
    {
      permission_key: 'workflow.task.read',
      name: '查看协同任务',
      module: 'workflow',
    },
    {
      permission_key: 'mobile.sales.access',
      name: '进入业务移动端',
      module: 'mobile',
    },
  ]
  const allPermissionKeys = mockPermissions.map((item) => item.permission_key)
  const salesRole = {
    role_key: 'sales',
    name: '业务',
    description: '销售 / 业务跟进',
    builtin: true,
    disabled: false,
    sort_order: 20,
    permissions: [
      'erp.dashboard.read',
      'business.record.read',
      'workflow.task.read',
      'mobile.sales.access',
    ],
  }
  const adminRole = {
    role_key: 'admin',
    name: '系统管理员',
    description: '系统账号、角色和权限管理',
    builtin: true,
    disabled: false,
    sort_order: 80,
    permissions: allPermissionKeys.filter((key) => key.startsWith('system.')),
  }
  const adminProfile = {
    id: 1,
    username: 'style-l1-admin',
    phone: '13800138000',
    is_super_admin: true,
    disabled: false,
    roles: [],
    permissions: allPermissionKeys,
    menus: mockMenus,
    erp_preferences: {
      column_orders: {},
    },
  }

  await page.route('**/rpc/admin', async (route) => {
    const body = route.request().postDataJSON() || {}
    const { id = 'mock-id', method, params = {} } = body

    let data = {}
    switch (method) {
      case 'me':
        data = adminProfile
        break
      case 'list':
        data = {
          admins: [
            adminProfile,
            {
              id: 2,
              username: 'assistant-admin',
              phone: '13900139000',
              is_super_admin: false,
              disabled: false,
              roles: [salesRole],
              permissions: salesRole.permissions,
              menus: mockMenus.filter((item) => item.path === '/erp/dashboard'),
            },
          ],
        }
        break
      case 'create':
      case 'set_roles':
      case 'set_disabled':
      case 'reset_password':
        data = {
          admin: {
            id: Number(params.id || 2),
            username: params.username || 'assistant-admin',
            phone: params.phone || '13900139000',
            is_super_admin: false,
            disabled: Boolean(params.disabled),
            roles: Array.isArray(params.role_keys)
              ? params.role_keys.map((roleKey) => ({
                  role_key: roleKey,
                  name: roleKey,
                }))
              : [salesRole],
            permissions: salesRole.permissions,
            menus: mockMenus.filter((item) => item.path === '/erp/dashboard'),
          },
        }
        break
      case 'set_role_permissions':
        data = {
          role: {
            ...salesRole,
            role_key: params.role_key || salesRole.role_key,
            permissions: Array.isArray(params.permission_keys)
              ? params.permission_keys
              : salesRole.permissions,
          },
        }
        break
      case 'set_erp_column_order': {
        const moduleKey = String(params?.module_key || '').trim()
        const order = Array.isArray(params?.order)
          ? params.order
              .map((item) => String(item || '').trim())
              .filter(Boolean)
          : []
        if (moduleKey) {
          if (order.length === 0) {
            delete adminProfile.erp_preferences.column_orders[moduleKey]
          } else {
            adminProfile.erp_preferences.column_orders[moduleKey] = order
          }
        }
        data = {
          erp_preferences: {
            column_orders: {
              ...adminProfile.erp_preferences.column_orders,
            },
          },
        }
        break
      }
      case 'rbac_options':
      case 'menu_options':
        data = {
          roles: [salesRole, adminRole],
          permissions: mockPermissions,
          menus: mockMenus,
          role_options: [salesRole, adminRole],
          permission_options: mockPermissions,
          menu_options: mockMenus,
        }
        break
      default:
        data = {}
        break
    }

    const responseDelayMs =
      method === 'me'
        ? resolveDelayFromReferer(route.request(), '__style_l1_admin_me_delay')
        : method === 'list'
          ? resolveDelayFromReferer(
              route.request(),
              '__style_l1_admin_list_delay'
            )
          : 0

    if (responseDelayMs > 0) {
      await delay(responseDelayMs)
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        result: {
          code: 0,
          message: 'OK',
          data,
        },
      }),
    })
  })

  await page.route('**/rpc/auth', async (route) => {
    const body = route.request().postDataJSON() || {}
    const { id = 'mock-id', method } = body

    if (method === 'logout') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id,
          result: {
            code: 0,
            message: 'OK',
          },
        }),
      })
      return
    }

    await route.fallback()
  })

  await page.route('**/rpc/debug', async (route) => {
    const body = route.request().postDataJSON() || {}
    const { id = 'mock-id' } = body

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        result: {
          code: 0,
          message: 'OK',
          data: {
            environment: 'style-l1',
            seedEnabled: false,
            seedAllowed: false,
            seedDisabledReason: '样式回归环境不执行生成调试数据',
            cleanupEnabled: false,
            cleanupAllowed: false,
            cleanupDisabledReason: '样式回归环境不执行清理调试数据',
            cleanupScope: 'debug_run',
            cleanupOnlyDebugData: true,
            requiresDebugRunId: true,
            destructiveRemoteDenied: true,
          },
        },
      }),
    })
  })

  const workflowTasks = []
  const workflowBusinessStates = []
  const businessRecords = []
  let workflowTaskID = 1
  let workflowBusinessStateID = 1
  let businessRecordID = 1
  const nowUnix = () => Math.floor(Date.now() / 1000)
  const normalizeDateFilterValue = (value) => {
    if (value === null || value === undefined || value === '') return ''
    const text = String(value).trim()
    if (/^\d+$/.test(text)) {
      const date = new Date(Number(text) * 1000)
      if (Number.isNaN(date.getTime())) return ''
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
        2,
        '0'
      )}-${String(date.getDate()).padStart(2, '0')}`
    }
    const matched = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/)
    if (matched) {
      return `${matched[1]}-${String(Number(matched[2])).padStart(
        2,
        '0'
      )}-${String(Number(matched[3])).padStart(2, '0')}`
    }
    const date = new Date(text)
    if (Number.isNaN(date.getTime())) return ''
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(
      2,
      '0'
    )}-${String(date.getDate()).padStart(2, '0')}`
  }

  await page.route('**/rpc/business', async (route) => {
    const body = route.request().postDataJSON() || {}
    const { id = 'mock-id', method, params = {} } = body
    const keyword = String(params.keyword || '').toLowerCase()

    let data = {}
    switch (method) {
      case 'list_records': {
        const records = businessRecords.filter((item) => {
          const dateFilterKey = String(params.date_filter_key || '').trim()
          const dateRangeStart = normalizeDateFilterValue(
            params.date_range_start
          )
          const dateRangeEnd = normalizeDateFilterValue(params.date_range_end)
          const recordDateValue = normalizeDateFilterValue(
            item?.[dateFilterKey]
          )
          const startMatched = dateRangeStart
            ? Boolean(recordDateValue) && recordDateValue >= dateRangeStart
            : true
          const endMatched = dateRangeEnd
            ? Boolean(recordDateValue) && recordDateValue <= dateRangeEnd
            : true
          const keywordMatched =
            !keyword ||
            [
              item.document_no,
              item.source_no,
              item.title,
              item.customer_name,
              item.supplier_name,
              item.style_no,
              item.product_no,
              item.product_name,
              item.material_name,
              item.warehouse_location,
            ]
              .filter(Boolean)
              .some((value) => String(value).toLowerCase().includes(keyword))
          return (
            (!params.module_key || item.module_key === params.module_key) &&
            (!params.business_status_key ||
              item.business_status_key === params.business_status_key) &&
            (params.deleted_only
              ? Boolean(item.deleted_at)
              : params.include_deleted || !item.deleted_at) &&
            startMatched &&
            endMatched &&
            keywordMatched
          )
        })
        data = {
          records,
          total: records.length,
          limit: Number(params.limit || 50),
          offset: Number(params.offset || 0),
        }
        break
      }
      case 'create_record': {
        const record = {
          id: businessRecordID++,
          module_key: params.module_key || 'project-orders',
          document_no: params.document_no || `STYLE-L1-${businessRecordID}`,
          title: params.title || '毛绒熊立项',
          source_no: params.source_no || '',
          customer_name: params.customer_name || '',
          supplier_name: params.supplier_name || '',
          style_no: params.style_no || '',
          product_no: params.product_no || '',
          product_name: params.product_name || '',
          material_name: params.material_name || '',
          warehouse_location: params.warehouse_location || '',
          quantity: params.quantity || null,
          unit: params.unit || '',
          amount: params.amount || null,
          document_date: params.document_date || '',
          due_date: params.due_date || '',
          business_status_key: params.business_status_key || 'project_pending',
          owner_role_key: params.owner_role_key || 'business',
          payload: params.payload || {},
          items: params.items || [],
          row_version: 1,
          created_at: nowUnix(),
          updated_at: nowUnix(),
          deleted_at: null,
        }
        businessRecords.unshift(record)
        data = { record }
        break
      }
      case 'update_record': {
        const record = businessRecords.find(
          (item) => Number(item.id) === Number(params.id)
        )
        if (record) {
          Object.assign(record, {
            ...params,
            row_version: Number(record.row_version || 0) + 1,
            updated_at: nowUnix(),
          })
        }
        data = { record }
        break
      }
      case 'delete_records': {
        const ids = Array.isArray(params.ids) ? params.ids.map(Number) : []
        let affected = 0
        businessRecords.forEach((record) => {
          if (ids.includes(Number(record.id)) && !record.deleted_at) {
            record.deleted_at = nowUnix()
            record.delete_reason = params.delete_reason || '业务页删除'
            affected += 1
          }
        })
        data = { affected }
        break
      }
      case 'restore_record': {
        const record = businessRecords.find(
          (item) => Number(item.id) === Number(params.id)
        )
        if (record) {
          record.deleted_at = null
        }
        data = { record }
        break
      }
      default:
        data = {}
        break
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        result: {
          code: 0,
          message: 'OK',
          data,
        },
      }),
    })
  })

  await page.route('**/rpc/workflow', async (route) => {
    const body = route.request().postDataJSON() || {}
    const { id = 'mock-id', method, params = {} } = body

    let data = {}
    switch (method) {
      case 'list_business_states':
        data = {
          business_states: workflowBusinessStates.filter(
            (item) =>
              !params.source_type || item.source_type === params.source_type
          ),
          total: workflowBusinessStates.length,
          limit: Number(params.limit || 50),
          offset: Number(params.offset || 0),
        }
        break
      case 'upsert_business_state': {
        const existing = workflowBusinessStates.find(
          (item) =>
            item.source_type === params.source_type &&
            Number(item.source_id) === Number(params.source_id)
        )
        const businessState = {
          id: existing?.id || workflowBusinessStateID++,
          source_type: params.source_type,
          source_id: Number(params.source_id || Date.now()),
          source_no: params.source_no || '',
          business_status_key: params.business_status_key || 'project_pending',
          owner_role_key: params.owner_role_key || 'business',
          blocked_reason: params.blocked_reason || '',
          payload: params.payload || {},
          status_changed_at: nowUnix(),
          created_at: existing?.created_at || nowUnix(),
          updated_at: nowUnix(),
        }
        if (existing) {
          Object.assign(existing, businessState)
        } else {
          workflowBusinessStates.unshift(businessState)
        }
        data = { business_state: existing || businessState }
        break
      }
      case 'list_tasks': {
        const tasks = workflowTasks.filter(
          (item) =>
            (!params.source_type || item.source_type === params.source_type) &&
            (!params.source_id ||
              Number(item.source_id) === Number(params.source_id))
        )
        data = {
          tasks,
          total: tasks.length,
          limit: Number(params.limit || 50),
          offset: Number(params.offset || 0),
        }
        break
      }
      case 'create_task': {
        const task = {
          id: workflowTaskID++,
          task_code: params.task_code || `style-l1-task-${Date.now()}`,
          task_group: params.task_group || 'project-orders',
          task_name: params.task_name || '客户/款式立项 跟进',
          source_type: params.source_type || 'project-orders',
          source_id: Number(params.source_id || Date.now()),
          source_no: params.source_no || '',
          business_status_key: params.business_status_key || 'project_pending',
          task_status_key: params.task_status_key || 'ready',
          owner_role_key: params.owner_role_key || 'business',
          assignee_id: params.assignee_id || '',
          priority: Number(params.priority || 0),
          due_at: params.due_at || null,
          blocked_reason: params.blocked_reason || '',
          payload: params.payload || {},
          created_at: nowUnix(),
          updated_at: nowUnix(),
        }
        workflowTasks.unshift(task)
        data = { task }
        break
      }
      case 'update_task_status': {
        const task = workflowTasks.find(
          (item) => Number(item.id) === Number(params.id)
        )
        if (task) {
          task.task_status_key = params.task_status_key || task.task_status_key
          task.business_status_key =
            params.business_status_key || task.business_status_key
          task.blocked_reason = params.reason || task.blocked_reason
          task.updated_at = nowUnix()
        }
        data = { task }
        break
      }
      default:
        data = {}
        break
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        result: {
          code: 0,
          message: 'OK',
          data,
        },
      }),
    })
  })

  await page.route('**/templates/render-pdf', async (route) => {
    const headers = route.request().headers()
    const authorization = String(headers.authorization || '')
    const payload = route.request().postDataJSON() || {}

    if (!authorization.startsWith('Bearer ')) {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 40101,
          message: '需要管理员权限',
        }),
      })
      return
    }

    if (
      !payload ||
      typeof payload.html !== 'string' ||
      !payload.html.includes('<!doctype html>') ||
      typeof payload.template_key !== 'string' ||
      String(payload.base_url || '').trim() !== baseURL
    ) {
      await route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 40053,
          message: '模板渲染请求不合法',
        }),
      })
      return
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/pdf',
      headers: {
        'Content-Disposition': `inline; filename="${payload.file_name || 'style-l1.pdf'}"`,
        'Cache-Control': 'no-store',
      },
      body: mockPdfBuffer,
    })
  })
}

async function installAdminAuthExpiredRpcMocks(page) {
  await page.route('**/rpc/**', async (route) => {
    const body = route.request().postDataJSON() || {}
    const { id = 'mock-id' } = body

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id,
        result: {
          code: RpcErrorCode.AUTH_REQUIRED,
          message: '未登录',
          data: {},
        },
      }),
    })
  })
}

async function expectHeading(page, text) {
  const locator = page.getByRole('heading', { name: text }).first()
  await locator.waitFor({ state: 'visible', timeout: 10_000 })
}

async function expectRole(page, role, name) {
  const locator = page.getByRole(role, { name })
  await locator.waitFor({ state: 'visible', timeout: 10_000 })
}

async function expectButton(page, name) {
  const locator = page.getByRole('button', { name })
  await locator.waitFor({ state: 'visible', timeout: 10_000 })
}

async function expectText(page, text) {
  const locator = page.getByText(text, { exact: false })
  const timeoutAt = Date.now() + 10_000

  while (Date.now() < timeoutAt) {
    const count = await locator.count()

    for (let index = 0; index < count; index += 1) {
      if (await locator.nth(index).isVisible()) {
        return
      }
    }

    await delay(100)
  }

  const matches = await locator.evaluateAll((nodes) =>
    nodes.map((node) => ({
      text: String(node.textContent || '').trim(),
      visible:
        node instanceof HTMLElement
          ? (() => {
              const style = window.getComputedStyle(node)
              const rect = node.getBoundingClientRect()
              return (
                style.display !== 'none' &&
                style.visibility !== 'hidden' &&
                rect.width > 0 &&
                rect.height > 0
              )
            })()
          : false,
    }))
  )

  throw new Error(
    `未找到可见文案“${text}”，当前命中：${JSON.stringify(matches)}`
  )
}

async function assertTextAbsent(page, text) {
  const count = await page.getByText(text, { exact: false }).count()
  assert.equal(count, 0, `页面不应继续出现文案“${text}”，当前命中 ${count} 处`)
}

async function assertBusinessSelectionActionBarHidden(page, { scenarioName }) {
  const metrics = await page.evaluate(() => {
    const actionBar = document.querySelector(
      '.erp-business-module-current-action'
    )
    if (!actionBar) return { exists: false, visible: false }

    const rect = actionBar.getBoundingClientRect()
    const style = window.getComputedStyle(actionBar)
    return {
      exists: true,
      visible:
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        rect.width > 0 &&
        rect.height > 0,
      text: actionBar.textContent?.replace(/\s+/g, ' ').trim() || '',
      width: rect.width,
      height: rect.height,
    }
  })

  assert(
    !metrics.visible,
    `${scenarioName} 未选中记录时不应渲染选中操作卡片: ${JSON.stringify(metrics)}`
  )
}

async function assertShellRefreshButton(page, { scenarioName, expectVisible }) {
  const metrics = await page.evaluate(() => {
    const isVisible = (node) => {
      if (!(node instanceof HTMLElement)) return false
      const rect = node.getBoundingClientRect()
      const style = window.getComputedStyle(node)
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        rect.width > 0 &&
        rect.height > 0
      )
    }
    const buttons = Array.from(
      document.querySelectorAll('.erp-admin-header button')
    ).filter(
      (button) =>
        isVisible(button) &&
        String(button.textContent || '').trim() === '刷新当前页'
    )

    return {
      count: buttons.length,
      hasIcon: buttons.some((button) =>
        Boolean(button.querySelector('.anticon'))
      ),
    }
  })

  if (!expectVisible) {
    assert.equal(
      metrics.count,
      0,
      `${scenarioName} 壳层不应显示全局刷新按钮: ${JSON.stringify(metrics)}`
    )
    return
  }

  assert.equal(
    metrics.count,
    1,
    `${scenarioName} 壳层刷新按钮数量异常: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.hasIcon,
    `${scenarioName} 壳层刷新按钮缺少图标: ${JSON.stringify(metrics)}`
  )
}

async function verifyBusinessModuleColumnOrderDialog(page) {
  const storageKey = 'erp.module.column-order.project-orders'
  await page
    .locator('.erp-business-module-toolbar__actions')
    .getByRole('button', { name: /列顺序/ })
    .click()
  const dialog = page.getByRole('dialog', { name: '调整列表列顺序' })
  await dialog.waitFor({ state: 'visible', timeout: 10_000 })
  await assertAntdModalCentered(page, dialog, 'business-column-order-modal')

  const moveFirstButtons = dialog.locator('button[aria-label$="移到最前"]')
  const moveLastButtons = dialog.locator('button[aria-label$="移到最后"]')
  const buttonCount = await moveFirstButtons.count()
  assert(buttonCount >= 2, '列顺序面板未渲染“移到最前”按钮')
  assert.equal(
    await moveLastButtons.count(),
    buttonCount,
    '列顺序面板“移到最前/最后”按钮数量不一致'
  )
  assert(
    await moveFirstButtons.nth(0).isDisabled(),
    '首列“移到最前”边界禁用异常'
  )
  assert(
    await moveLastButtons.nth(buttonCount - 1).isDisabled(),
    '末列“移到最后”边界禁用异常'
  )

  const moveFirstLabel = await moveFirstButtons
    .nth(1)
    .getAttribute('aria-label')
  assert(Boolean(moveFirstLabel), '未读取到可移动列的“移到最前”标签')
  const firstColumnOrderSync = waitForAdminColumnOrderSync(page)
  await moveFirstButtons.nth(1).click()
  await firstColumnOrderSync
  await page.waitForFunction((label) => {
    const target = [...document.querySelectorAll('button[aria-label]')].find(
      (button) => button.getAttribute('aria-label') === label
    )
    return Boolean(target?.disabled)
  }, moveFirstLabel)

  const moveLastLabel = await moveLastButtons.nth(0).getAttribute('aria-label')
  assert(Boolean(moveLastLabel), '未读取到可移动列的“移到最后”标签')
  const secondColumnOrderSync = waitForAdminColumnOrderSync(page)
  await moveLastButtons.nth(0).click()
  await secondColumnOrderSync
  await page.waitForFunction((label) => {
    const target = [...document.querySelectorAll('button[aria-label]')].find(
      (button) => button.getAttribute('aria-label') === label
    )
    return Boolean(target?.disabled)
  }, moveLastLabel)

  const storedOrder = await page.evaluate((key) => {
    return window.localStorage.getItem(key)
  }, storageKey)
  assert(Boolean(storedOrder), '列顺序面板调整后未写入本地缓存兜底')

  const persistedBoundaryLabels = await page.evaluate(() => {
    return {
      firstDisabled:
        document
          .querySelector('button[aria-label$="移到最前"]:disabled')
          ?.getAttribute('aria-label') || '',
      lastDisabled:
        document
          .querySelector('button[aria-label$="移到最后"]:disabled')
          ?.getAttribute('aria-label') || '',
    }
  })
  assert(
    persistedBoundaryLabels.firstDisabled &&
      persistedBoundaryLabels.lastDisabled,
    '列顺序面板未读取到当前边界列标签'
  )

  await dialog.locator('.ant-modal-close').click()
  await dialog.waitFor({ state: 'hidden', timeout: 10_000 })

  await page.evaluate((key) => {
    window.localStorage.removeItem(key)
  }, storageKey)
  await page.reload({ waitUntil: 'networkidle' })
  await expectHeading(page, '客户/款式立项')
  await page
    .locator('.erp-business-module-toolbar__actions')
    .getByRole('button', { name: /列顺序/ })
    .click()
  await dialog.waitFor({ state: 'visible', timeout: 10_000 })
  await assertAntdModalCentered(
    page,
    dialog,
    'business-column-order-modal-restored'
  )

  const restoredBoundaryLabels = await page.evaluate(() => {
    return {
      firstDisabled:
        document
          .querySelector('button[aria-label$="移到最前"]:disabled')
          ?.getAttribute('aria-label') || '',
      lastDisabled:
        document
          .querySelector('button[aria-label$="移到最后"]:disabled')
          ?.getAttribute('aria-label') || '',
    }
  })
  assert.equal(
    restoredBoundaryLabels.firstDisabled,
    persistedBoundaryLabels.firstDisabled,
    '清空本地缓存后未从账号偏好恢复首列顺序'
  )
  assert.equal(
    restoredBoundaryLabels.lastDisabled,
    persistedBoundaryLabels.lastDisabled,
    '清空本地缓存后未从账号偏好恢复末列顺序'
  )
  await dialog.locator('.ant-modal-close').click()
  await dialog.waitFor({ state: 'hidden', timeout: 10_000 })
}

function waitForAdminColumnOrderSync(page) {
  return page.waitForResponse((response) => {
    if (!response.url().includes('/rpc/admin')) {
      return false
    }
    try {
      return (
        response.request().postDataJSON()?.method === 'set_erp_column_order'
      )
    } catch {
      return false
    }
  })
}

async function assertBusinessPageRefreshEntrypoint(page, { scenarioName }) {
  const metrics = await page.evaluate(() => {
    const isVisible = (node) => {
      if (!(node instanceof HTMLElement)) return false
      const rect = node.getBoundingClientRect()
      const style = window.getComputedStyle(node)
      return (
        style.display !== 'none' &&
        style.visibility !== 'hidden' &&
        rect.width > 0 &&
        rect.height > 0
      )
    }
    const refreshButtons = Array.from(
      document.querySelectorAll('button')
    ).filter(
      (button) =>
        isVisible(button) &&
        String(button.textContent || '').trim() === '刷新当前页'
    )
    const headerButtons = refreshButtons.filter((button) =>
      button.closest('.erp-admin-header')
    )
    const toolbarButtons = refreshButtons.filter((button) =>
      button.closest('.erp-business-module-toolbar__actions')
    )

    return {
      refreshButtonCount: refreshButtons.length,
      headerRefreshButtonCount: headerButtons.length,
      headerRefreshHasIcon: headerButtons.some((button) =>
        Boolean(button.querySelector('.anticon'))
      ),
      toolbarRefreshButtonCount: toolbarButtons.length,
      toolbarRefreshHasIcon: toolbarButtons.some((button) =>
        Boolean(button.querySelector('.anticon'))
      ),
    }
  })

  assert.equal(
    metrics.refreshButtonCount,
    1,
    `${scenarioName} 业务页应只保留一个刷新当前页入口: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    metrics.headerRefreshButtonCount,
    1,
    `${scenarioName} 业务页应复用壳层刷新按钮: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    metrics.toolbarRefreshButtonCount,
    0,
    `${scenarioName} 业务页工具栏不应重复显示刷新按钮: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.headerRefreshHasIcon,
    `${scenarioName} 业务页壳层刷新按钮缺少图标: ${JSON.stringify(metrics)}`
  )
}

async function assertPrintPreviewPopup(
  page,
  { buttonName, title, screenshotName }
) {
  const [popup] = await Promise.all([
    page.waitForEvent('popup', { timeout: 10_000 }),
    page.getByRole('button', { name: buttonName }).click(),
  ])

  const popupErrors = []
  popup.on('console', (message) => {
    if (message.type() === 'error') {
      popupErrors.push(`popup console error: ${message.text()}`)
    }
  })
  popup.on('pageerror', (error) => {
    popupErrors.push(`popup page error: ${error.message}`)
  })

  try {
    await popup.waitForLoadState('domcontentloaded')
    await popup.waitForFunction(
      (expectedTitle) =>
        document.title === expectedTitle &&
        Boolean(document.querySelector('iframe.pdf-preview-frame')),
      title,
      { timeout: 30_000 }
    )
    assert.deepEqual(popupErrors, [], `${title} 预览窗口出现控制台或运行时错误`)

    if (screenshotName) {
      await popup.screenshot({
        path: path.resolve(outputDir, `${screenshotName}.png`),
      })
    }
  } finally {
    if (!popup.isClosed()) {
      await popup.close()
    }
  }
}

async function assertEditablePrintWorkspacePopupRefresh(
  page,
  { expectedTitle, editableSelector = '', editableScenarioLabel = '' }
) {
  const [popup] = await Promise.all([
    page.waitForEvent('popup', { timeout: 10_000 }),
    page.getByRole('button', { name: '打开可编辑打印窗口' }).click(),
  ])
  const mockToken = createMockAdminToken()
  await installAdminRpcMocks(popup)
  await popup.addInitScript((token) => {
    localStorage.setItem('admin_access_token', token)
  }, mockToken)
  const popupErrors = []

  popup.on('console', (message) => {
    if (message.type() === 'error') {
      popupErrors.push(`popup console error: ${message.text()}`)
    }
  })
  popup.on('pageerror', (error) => {
    popupErrors.push(`popup page error: ${error.message}`)
  })

  try {
    await popup.waitForLoadState('domcontentloaded')
    await setPopupAdminToken(popup, mockToken)
    await popup.getByText(expectedTitle, { exact: false }).first().waitFor({
      state: 'visible',
      timeout: 15_000,
    })

    const openedURL = new URL(popup.url())
    assert(
      isValidPrintWorkspacePopupPath(openedURL.pathname),
      `打印窗口首次打开落在了非法路径: ${popup.url()}`
    )
    assert(
      openedURL.searchParams.get('state'),
      `打印窗口首次打开缺少 state: ${popup.url()}`
    )

    await popup.reload({ waitUntil: 'domcontentloaded' })
    await popup.getByText(expectedTitle, { exact: false }).first().waitFor({
      state: 'visible',
      timeout: 15_000,
    })
    await popup
      .waitForLoadState('networkidle', { timeout: 5_000 })
      .catch(() => {})
    await popup.waitForTimeout(150)

    const reloadedURL = new URL(popup.url())
    assert(
      isValidPrintWorkspacePopupPath(reloadedURL.pathname),
      `打印窗口刷新后落在了非法路径: ${popup.url()}`
    )
    assert(
      reloadedURL.searchParams.get('state'),
      `打印窗口刷新后缺少 state: ${popup.url()}`
    )
    if (editableSelector) {
      await assertEditablePopupCellInputAfterReload(popup, {
        editableSelector,
        scenarioLabel: editableScenarioLabel || expectedTitle,
      })
    }
    assert.deepEqual(
      popupErrors,
      [],
      `${expectedTitle} 打印窗口刷新后出现控制台或运行时错误`
    )
  } finally {
    if (!popup.isClosed()) {
      await popup.close()
    }
  }
}

async function setPopupAdminToken(popup, mockToken) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await popup.evaluate((token) => {
        localStorage.setItem('admin_access_token', token)
      }, mockToken)
      return
    } catch (error) {
      if (
        attempt >= 2 ||
        !String(error?.message || '').includes(
          'Execution context was destroyed'
        )
      ) {
        throw error
      }
      await popup.waitForLoadState('domcontentloaded').catch(() => {})
      await popup.waitForTimeout(250)
    }
  }
}

function isValidPrintWorkspacePopupPath(pathname = '') {
  return (
    pathname === '/print-window-shell.html' ||
    pathname.startsWith('/erp/print-workspace/')
  )
}

function normalizeInlineText(value) {
  return String(value || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

async function assertEditablePopupCellInputAfterReload(
  page,
  { editableSelector, scenarioLabel }
) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const editableCell = page.locator(editableSelector).first()
      await editableCell.waitFor({ state: 'visible', timeout: 15_000 })

      const originalText = normalizeInlineText(await editableCell.textContent())
      const insertedText = '__popup_reload__'

      await editableCell.click()
      await page.waitForFunction(
        (selector) =>
          document.activeElement === document.querySelector(selector),
        editableSelector,
        {
          timeout: 5_000,
        }
      )
      await page.keyboard.press('End')
      await page.keyboard.type(insertedText)
      await page.keyboard.press('Tab')

      const nextText = normalizeInlineText(await editableCell.textContent())
      assert(
        nextText.includes(insertedText),
        `${scenarioLabel} 刷新后右侧表格仍不可编辑: ${JSON.stringify({
          editableSelector,
          originalText,
          nextText,
        })}`
      )
      return
    } catch (error) {
      if (
        attempt >= 2 ||
        !String(error?.message || '').includes(
          'Execution context was destroyed'
        )
      ) {
        throw error
      }
      await page.waitForLoadState('domcontentloaded').catch(() => {})
      await page.waitForTimeout(250)
    }
  }
}

async function assertPrintWorkspacePaginationStyle(
  page,
  { paperSelector, rowSelector, theadSelector }
) {
  await page.emulateMedia({ media: 'print' })

  try {
    const metrics = await page.evaluate(
      ({
        resolvedPaperSelector,
        resolvedRowSelector,
        resolvedTheadSelector,
      }) => {
        const paper = document.querySelector(resolvedPaperSelector)
        const row = document.querySelector(resolvedRowSelector)
        const thead = document.querySelector(resolvedTheadSelector)
        const paperStyle = paper ? window.getComputedStyle(paper) : null
        const rowStyle = row ? window.getComputedStyle(row) : null
        const theadStyle = thead ? window.getComputedStyle(thead) : null

        return {
          paperWidth: paper?.getBoundingClientRect().width || 0,
          paperPaddingTop: Number.parseFloat(paperStyle?.paddingTop || '0'),
          rowBreakInside: String(rowStyle?.breakInside || ''),
          rowPageBreakInside: String(rowStyle?.pageBreakInside || ''),
          theadDisplay: String(theadStyle?.display || ''),
        }
      },
      {
        resolvedPaperSelector: paperSelector,
        resolvedRowSelector: rowSelector,
        resolvedTheadSelector: theadSelector,
      }
    )

    assert(
      metrics.paperWidth >= 780 && metrics.paperWidth <= 810,
      `打印纸面宽度未收口到 A4: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.paperPaddingTop >= 30,
      `打印纸面未保留合同页边距: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.rowBreakInside !== 'auto' ||
        metrics.rowPageBreakInside !== 'auto',
      `打印态明细行仍允许页内截断: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      metrics.theadDisplay,
      'table-header-group',
      `打印态表头未开启续页重绘: ${JSON.stringify(metrics)}`
    )
  } finally {
    await page.emulateMedia({ media: 'screen' })
  }
}

async function assertProcessingContractPaperRowCount(page) {
  const counts = await page.evaluate(() => {
    const detailEditorRows = document.querySelectorAll(
      '.erp-print-shell__detail-table tbody tr'
    ).length
    const paperRows = document.querySelectorAll(
      '.erp-processing-contract-table tbody tr'
    ).length
    const totalRows = document.querySelectorAll(
      '.erp-processing-contract-table__total'
    ).length

    return {
      detailEditorRows,
      paperRows,
      totalRows,
    }
  })

  assert.equal(
    counts.totalRows,
    1,
    `加工合同纸面合计行数量异常: ${JSON.stringify(counts)}`
  )
  assert.equal(
    counts.paperRows,
    counts.detailEditorRows + counts.totalRows,
    `加工合同纸面仍存在多余占位空白行: ${JSON.stringify(counts)}`
  )
}

async function assertProcessingContractSignatureLayout(page) {
  const metrics = await page.evaluate(() => {
    return Array.from(
      document.querySelectorAll('.erp-processing-contract-signature__block')
    ).map((block) => {
      const label = block.querySelector(
        '.erp-processing-contract-signature__label'
      )
      const date = block.querySelector(
        '.erp-processing-contract-signature__date'
      )
      const blockRect = block.getBoundingClientRect()
      const labelRect = label?.getBoundingClientRect()
      const dateRect = date?.getBoundingClientRect()

      return {
        blockTop: blockRect.top,
        labelTop: labelRect?.top || 0,
        labelBottom: labelRect?.bottom || 0,
        dateTop: dateRect?.top || 0,
        labelOffset: labelRect ? labelRect.top - blockRect.top : 0,
        labelToDate:
          labelRect && dateRect ? dateRect.top - labelRect.bottom : 0,
        valueCount: block.querySelectorAll(
          '.erp-processing-contract-signature__value'
        ).length,
      }
    })
  })

  assert.equal(
    metrics.length,
    2,
    `加工合同签章区列数异常: ${JSON.stringify(metrics)}`
  )

  metrics.forEach((metric) => {
    assert.equal(
      metric.valueCount,
      0,
      `加工合同签章区不应再渲染上方编辑框: ${JSON.stringify(metric)}`
    )
    assert(
      metric.labelOffset >= 24,
      `加工合同签章标签仍贴在顶部，未下移到日期附近: ${JSON.stringify(metric)}`
    )
    assert(
      metric.labelToDate > 0 && metric.labelToDate <= 12,
      `加工合同签章标签与日期间距异常: ${JSON.stringify(metric)}`
    )
  })
}

async function assertContractTableHeadersStaySingleLine(
  page,
  { tableSelector, expectedHeaders = [] }
) {
  const metrics = await page.evaluate((resolvedTableSelector) => {
    return Array.from(
      document.querySelectorAll(`${resolvedTableSelector} thead th`)
    ).map((th) => {
      const style = window.getComputedStyle(th)
      return {
        text: String(th.textContent || '').trim(),
        whiteSpace: style.whiteSpace,
        overflowWrap: style.overflowWrap,
        scrollWidth: th.scrollWidth,
        clientWidth: th.clientWidth,
      }
    })
  }, tableSelector)

  assert(metrics.length > 0, `未找到合同表头: ${tableSelector}`)

  if (expectedHeaders.length > 0) {
    assert.deepEqual(
      metrics.map((metric) => metric.text),
      expectedHeaders,
      `${tableSelector} 表头文案异常: ${JSON.stringify(metrics)}`
    )
  }

  metrics.forEach((metric) => {
    assert.equal(
      metric.whiteSpace,
      'nowrap',
      `${tableSelector} 表头未强制单行: ${JSON.stringify(metric)}`
    )
    assert.equal(
      metric.overflowWrap,
      'normal',
      `${tableSelector} 表头仍允许断词: ${JSON.stringify(metric)}`
    )
    assert(
      metric.scrollWidth <= metric.clientWidth + 1,
      `${tableSelector} 表头内容仍超出单元格宽度: ${JSON.stringify(metric)}`
    )
  })
}

async function assertWorkspaceContinuedPageMargin(
  page,
  { storageKey, paperSelector, minimumLineCount = 32, clearMerges = false }
) {
  const originalRaw = await page.evaluate(
    (resolvedStorageKey) => window.localStorage.getItem(resolvedStorageKey),
    storageKey
  )

  try {
    await page.evaluate(
      ({ resolvedStorageKey, resolvedMinimumLineCount, shouldClearMerges }) => {
        const rawDraft = window.localStorage.getItem(resolvedStorageKey)
        const draft = rawDraft ? JSON.parse(rawDraft) : {}
        const baseLines =
          Array.isArray(draft.lines) && draft.lines.length > 0
            ? draft.lines
            : [{}]

        draft.lines = Array.from(
          { length: Math.max(resolvedMinimumLineCount, baseLines.length) },
          (_, index) => {
            const sourceLine = baseLines[index % baseLines.length] || {}
            return {
              ...sourceLine,
              contractNo: sourceLine.contractNo
                ? `${sourceLine.contractNo}-${index + 1}`
                : sourceLine.contractNo,
              productOrderNo: sourceLine.productOrderNo
                ? `${sourceLine.productOrderNo}-${index + 1}`
                : sourceLine.productOrderNo,
              remark: `${String(
                sourceLine.remark ||
                  sourceLine.processName ||
                  sourceLine.materialName ||
                  '续页页边距回归'
              )} ${index + 1}`,
            }
          }
        )

        if (shouldClearMerges) {
          draft.merges = []
        }

        window.localStorage.setItem(resolvedStorageKey, JSON.stringify(draft))
      },
      {
        resolvedStorageKey: storageKey,
        resolvedMinimumLineCount: minimumLineCount,
        shouldClearMerges: clearMerges,
      }
    )

    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.locator(paperSelector).waitFor({
      state: 'visible',
      timeout: 10_000,
    })
    await page.waitForFunction(
      ({ resolvedPaperSelector, minPaperHeight }) => {
        const paper = document.querySelector(resolvedPaperSelector)
        const paperHeight = Math.max(
          paper?.scrollHeight || 0,
          paper?.offsetHeight || 0,
          paper?.getBoundingClientRect?.().height || 0
        )

        return paperHeight > minPaperHeight
      },
      {
        resolvedPaperSelector: paperSelector,
        minPaperHeight: A4_PAGE_HEIGHT_PX + 2,
      },
      { timeout: 10_000 }
    )

    const metrics = await page.evaluate(
      ({ resolvedPaperSelector, resolvedStyleID }) => {
        const paper = document.querySelector(resolvedPaperSelector)
        const styleNode = document.getElementById(resolvedStyleID)

        return {
          paperHeight: Math.max(
            paper?.scrollHeight || 0,
            paper?.offsetHeight || 0,
            paper?.getBoundingClientRect?.().height || 0
          ),
          styleText: styleNode?.textContent || '',
        }
      },
      {
        resolvedPaperSelector: paperSelector,
        resolvedStyleID: PRINT_PAGE_STYLE_ELEMENT_ID,
      }
    )

    assert(
      metrics.paperHeight > A4_PAGE_HEIGHT_PX + 2,
      `工作台未进入续页高度，无法验证第 2 页顶部留白: ${JSON.stringify(metrics)}`
    )
    assert.match(
      metrics.styleText,
      new RegExp(
        `margin: ${CONTINUED_PRINT_PAGE_MARGIN.replaceAll('/', '\\/')};`
      ),
      `工作台跨页后未切到统一续页页边距: ${JSON.stringify(metrics)}`
    )
  } finally {
    await page.evaluate(
      ({ resolvedStorageKey, resolvedOriginalRaw }) => {
        if (typeof resolvedOriginalRaw !== 'string') {
          window.localStorage.removeItem(resolvedStorageKey)
          return
        }

        window.localStorage.setItem(resolvedStorageKey, resolvedOriginalRaw)
      },
      {
        resolvedStorageKey: storageKey,
        resolvedOriginalRaw: originalRaw,
      }
    )
  }
}

async function assertMaterialContractMetaAlignment(page) {
  const draftStorageKey = '__plush_erp_material_purchase_contract_print_draft__'
  await page.evaluate((storageKey) => {
    const rawDraft = window.localStorage.getItem(storageKey)
    const draft = rawDraft ? JSON.parse(rawDraft) : {}
    draft.supplierName =
      '东莞市永绅玩具有限公司辅料供应中心东城联络处长期备料专线'
    draft.buyerCompany = '东莞茶山发水电费三大发永绅采购与仓配协同办公室'
    window.localStorage.setItem(storageKey, JSON.stringify(draft))
  }, draftStorageKey)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await delay(300)

  const metrics = await page.evaluate(() => {
    const pairs = Array.from(
      document.querySelectorAll(
        '.erp-material-contract-paper .erp-material-contract-meta__pair'
      )
    ).map((pair) => {
      const pairRect = pair.getBoundingClientRect()
      const cells = Array.from(
        pair.querySelectorAll(':scope > .erp-material-contract-meta__cell')
      ).map((cell) => {
        const rect = cell.getBoundingClientRect()
        return {
          top: rect.top,
          left: rect.left,
          height: rect.height,
          width: rect.width,
        }
      })

      return {
        top: pairRect.top,
        bottom: pairRect.bottom,
        cellCount: cells.length,
        cells,
      }
    })

    return {
      pairCount: pairs.length,
      pairs,
    }
  })

  assert.equal(
    metrics.pairCount,
    5,
    `采购合同头部信息行数异常: ${JSON.stringify(metrics)}`
  )

  metrics.pairs.forEach((pair, index) => {
    assert.equal(
      pair.cellCount,
      2,
      `采购合同第 ${index + 1} 行未保持左右配对: ${JSON.stringify(pair)}`
    )

    const [leftCell, rightCell] = pair.cells
    assert(
      Math.abs(leftCell.top - rightCell.top) < 1,
      `采购合同第 ${index + 1} 行左右未对齐: ${JSON.stringify(pair)}`
    )

    if (index > 0) {
      const previousPair = metrics.pairs[index - 1]
      assert(
        pair.top >= previousPair.bottom - 1,
        `采购合同第 ${index + 1} 行与上一行发生重叠: ${JSON.stringify({
          previousPair,
          pair,
        })}`
      )
    }
  })
}

async function assertContractTableEditableAlignment(
  page,
  { tableSelector, editableSelector, scenarioLabel }
) {
  const metrics = await page.evaluate(
    ({ resolvedTableSelector, resolvedEditableSelector }) => {
      const table = document.querySelector(resolvedTableSelector)
      const editableNodes = Array.from(
        document.querySelectorAll(resolvedEditableSelector)
      )

      const normalizeText = (node) =>
        String(node?.innerText || '')
          .replace(/\u00a0/g, '')
          .trim()

      const extractStyle = (node) => {
        const style = window.getComputedStyle(node)
        return {
          display: style.display,
          alignItems: style.alignItems,
          justifyContent: style.justifyContent,
          textAlign: style.textAlign,
        }
      }

      const filledNode = editableNodes.find(
        (node) => normalizeText(node) !== ''
      )
      const emptyNode = editableNodes.find((node) => normalizeText(node) === '')

      const focusEmptyCaret = (node) => {
        if (!node) {
          return null
        }

        node.focus()
        const selection = window.getSelection()
        selection.removeAllRanges()

        const range = document.createRange()
        const textNode = node.firstChild
        const offset = textNode?.textContent?.length ?? 0
        range.setStart(textNode || node, offset)
        range.collapse(true)
        selection.addRange(range)

        const caretRect = range.getBoundingClientRect()
        const cellRect = node.closest('td')?.getBoundingClientRect()
        if (!cellRect) {
          return null
        }

        return {
          offsetX:
            caretRect.left +
            caretRect.width / 2 -
            (cellRect.left + cellRect.width / 2),
          offsetY:
            caretRect.top +
            caretRect.height / 2 -
            (cellRect.top + cellRect.height / 2),
        }
      }

      return {
        hasTable: Boolean(table),
        editableCount: editableNodes.length,
        filledStyle: filledNode ? extractStyle(filledNode) : null,
        emptyStyle: emptyNode ? extractStyle(emptyNode) : null,
        emptyCaretOffset: focusEmptyCaret(emptyNode),
      }
    },
    {
      resolvedTableSelector: tableSelector,
      resolvedEditableSelector: editableSelector,
    }
  )

  assert(metrics.hasTable, `${scenarioLabel} 未找到表格: ${tableSelector}`)
  assert(metrics.editableCount > 0, `${scenarioLabel} 未找到可编辑单元格`)
  assert(metrics.filledStyle, `${scenarioLabel} 缺少非空可编辑单元格`)
  assert(metrics.emptyStyle, `${scenarioLabel} 缺少空白可编辑单元格`)
  assert(metrics.emptyCaretOffset, `${scenarioLabel} 缺少空白光标位置`)

  for (const [label, style] of [
    ['非空单元格', metrics.filledStyle],
    ['空白单元格', metrics.emptyStyle],
  ]) {
    assert.equal(
      style.display,
      'flex',
      `${scenarioLabel}${label} display 未保持 flex: ${JSON.stringify(style)}`
    )
    assert.equal(
      style.alignItems,
      'center',
      `${scenarioLabel}${label} align-items 未保持居中: ${JSON.stringify(style)}`
    )
    assert.equal(
      style.justifyContent,
      'center',
      `${scenarioLabel}${label} justify-content 未保持居中: ${JSON.stringify(style)}`
    )
    assert.equal(
      style.textAlign,
      'center',
      `${scenarioLabel}${label} text-align 未保持居中: ${JSON.stringify(style)}`
    )
  }

  assert(
    Math.abs(metrics.emptyCaretOffset.offsetX) <= 3,
    `${scenarioLabel}空白单元格光标未保持水平居中: ${JSON.stringify(metrics.emptyCaretOffset)}`
  )
  assert(
    Math.abs(metrics.emptyCaretOffset.offsetY) <= 2,
    `${scenarioLabel}空白单元格光标未保持垂直居中: ${JSON.stringify(metrics.emptyCaretOffset)}`
  )
}

async function assertContractTotalCellsWrapLargeNumbers(
  page,
  { storageKey, templateKind, totalValueSelector, scenarioLabel }
) {
  const originalRaw = await page.evaluate(
    (resolvedStorageKey) => window.localStorage.getItem(resolvedStorageKey),
    storageKey
  )

  try {
    await page.evaluate(
      ({ resolvedStorageKey, resolvedTemplateKind }) => {
        const rawDraft = window.localStorage.getItem(resolvedStorageKey)
        const draft = rawDraft ? JSON.parse(rawDraft) : {}
        const sourceLine =
          Array.isArray(draft.lines) && draft.lines.length > 0
            ? draft.lines[0]
            : {}
        const largeQuantity = '400013111'
        const largeAmount = '400013111.22'

        draft.lines = [
          {
            ...sourceLine,
            quantity: largeQuantity,
            amount: largeAmount,
            ...(resolvedTemplateKind === 'processing'
              ? { unitPrice: '1' }
              : {}),
          },
        ]
        draft.merges = []
        window.localStorage.setItem(resolvedStorageKey, JSON.stringify(draft))
      },
      {
        resolvedStorageKey: storageKey,
        resolvedTemplateKind: templateKind,
      }
    )

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expectText(page, '当前记录字段（可编辑）')
    await page.waitForFunction(
      (selector) => document.querySelectorAll(selector).length >= 2,
      totalValueSelector,
      { timeout: 10_000 }
    )

    const metrics = await page.evaluate((selector) => {
      return Array.from(document.querySelectorAll(selector)).map((node) => {
        const style = window.getComputedStyle(node)
        const rect = node.getBoundingClientRect()
        return {
          text: String(node.textContent || '')
            .replace(/\u00a0/g, ' ')
            .trim(),
          clientWidth: node.clientWidth,
          scrollWidth: node.scrollWidth,
          width: rect.width,
          height: rect.height,
          whiteSpace: style.whiteSpace,
          overflowWrap: style.overflowWrap,
          wordBreak: style.wordBreak,
        }
      })
    }, totalValueSelector)

    assert(
      metrics.length >= 2,
      `${scenarioLabel} 缺少数量或金额合计单元格: ${JSON.stringify(metrics)}`
    )

    metrics.forEach((metric) => {
      assert(
        metric.text.length >= 9,
        `${scenarioLabel} 未写入大数值边界样本: ${JSON.stringify(metric)}`
      )
      assert.equal(
        metric.whiteSpace,
        'normal',
        `${scenarioLabel} 大数值不应保持单行: ${JSON.stringify(metric)}`
      )
      assert.equal(
        metric.overflowWrap,
        'anywhere',
        `${scenarioLabel} 大数值未允许任意断行: ${JSON.stringify(metric)}`
      )
      assert(
        metric.scrollWidth <= metric.clientWidth + 1,
        `${scenarioLabel} 大数值仍横向溢出单元格: ${JSON.stringify(metric)}`
      )
    })
  } finally {
    await page.evaluate(
      ({ resolvedStorageKey, resolvedOriginalRaw }) => {
        if (typeof resolvedOriginalRaw === 'string') {
          window.localStorage.setItem(resolvedStorageKey, resolvedOriginalRaw)
          return
        }
        window.localStorage.removeItem(resolvedStorageKey)
      },
      {
        resolvedStorageKey: storageKey,
        resolvedOriginalRaw: originalRaw,
      }
    )
    await page.reload({ waitUntil: 'domcontentloaded' })
    await expectText(page, '当前记录字段（可编辑）')
  }
}

async function assertMaterialContractPrintMediaIgnoresResponsiveBreakpoints(
  page
) {
  await page.emulateMedia({ media: 'print' })

  try {
    const metrics = await page.evaluate(() => {
      const countGridColumns = (value) => {
        const normalized = String(value || '').trim()
        if (!normalized || normalized === 'none') {
          return 0
        }
        return normalized.split(/\s+/).length
      }

      const paper = document.querySelector('.erp-material-contract-paper')
      const table = document.querySelector('.erp-material-contract-table')
      const signature = document.querySelector(
        '.erp-material-contract-signature'
      )
      const metaPairs = Array.from(
        document.querySelectorAll('.erp-material-contract-meta__pair')
      )

      return {
        viewportWidth: window.innerWidth,
        paperPaddingLeft: Number.parseFloat(
          window.getComputedStyle(paper).paddingLeft || '0'
        ),
        tableFontSize: Number.parseFloat(
          window.getComputedStyle(table).fontSize || '0'
        ),
        signatureColumnCount: countGridColumns(
          window.getComputedStyle(signature).gridTemplateColumns
        ),
        metaPairColumnCounts: metaPairs.map((pair) =>
          countGridColumns(window.getComputedStyle(pair).gridTemplateColumns)
        ),
      }
    })

    assert.equal(
      metrics.signatureColumnCount,
      2,
      `采购合同打印态签字区不应在窄视口塌成单列: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.metaPairColumnCounts.length > 0 &&
        metrics.metaPairColumnCounts.every((count) => count === 2),
      `采购合同打印态头部信息不应在窄视口塌成单列: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.paperPaddingLeft >= 30,
      `采购合同打印态页边距不应退回移动端紧凑值: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.tableFontSize >= 13.5,
      `采购合同打印态表格字号不应退回移动端紧凑值: ${JSON.stringify(metrics)}`
    )
  } finally {
    await page.emulateMedia({ media: 'screen' })
  }
}

async function assertAdminLoginLayout(page, { minCardWidth }) {
  const metrics = await page.evaluate(() => {
    const card = document.querySelector('.erp-login-card')
    const logo = document.querySelector('.erp-login-logo')
    const usernameInput = document.querySelector(
      'input[autocomplete="username"]'
    )
    const passwordInput = document.querySelector('.ant-input-affix-wrapper')
    const submitButton = document.querySelector('button[type="submit"]')
    const cardStyle = card ? window.getComputedStyle(card) : null
    const submitStyle = submitButton
      ? window.getComputedStyle(submitButton)
      : null

    return {
      cardWidth: card?.getBoundingClientRect?.().width || 0,
      cardRadius: Number.parseFloat(cardStyle?.borderTopLeftRadius || '0'),
      logoWidth: logo?.getBoundingClientRect?.().width || 0,
      usernameHeight: usernameInput?.getBoundingClientRect?.().height || 0,
      passwordHeight: passwordInput?.getBoundingClientRect?.().height || 0,
      submitHeight: submitButton?.getBoundingClientRect?.().height || 0,
      submitRadius: Number.parseFloat(submitStyle?.borderTopLeftRadius || '0'),
      descriptionCount: document.querySelectorAll(
        '.erp-login-card__description'
      ).length,
      tagCount: document.querySelectorAll('.erp-login-card__tags .ant-tag')
        .length,
      footerText:
        document
          .querySelector(
            '.erp-login-card .ant-typography.ant-typography-secondary'
          )
          ?.textContent?.trim() || '',
    }
  })

  assert(
    metrics.cardWidth >= minCardWidth,
    `登录卡片宽度异常: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.cardRadius >= 16,
    `登录卡片圆角回退: ${JSON.stringify(metrics)}`
  )
  assert(metrics.logoWidth > 0, `登录品牌头未渲染: ${JSON.stringify(metrics)}`)
  assert(
    metrics.logoWidth <= metrics.cardWidth,
    `登录品牌头溢出卡片: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.usernameHeight >= 54,
    `登录账号输入框高度异常: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.passwordHeight >= 54,
    `登录密码输入框高度异常: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.submitHeight >= 54,
    `登录按钮高度异常: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.submitRadius >= 20,
    `登录按钮圆角回退: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    metrics.descriptionCount,
    0,
    `登录描述文案未移除: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    metrics.tagCount,
    0,
    `登录标签区未移除: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    metrics.footerText,
    '',
    `登录页底部补充文案未移除: ${JSON.stringify(metrics)}`
  )
}

async function assertAppAlertDialogLayout(page, { scenarioName }) {
  await page
    .locator('.app-alert-dialog')
    .waitFor({ state: 'visible', timeout: 10_000 })

  const metrics = await page.evaluate(() => {
    const parseRgb = (value) => {
      const match = String(value || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
      if (!match) return null
      return match.slice(1, 4).map(Number)
    }
    const channel = (value) => {
      const normalized = value / 255
      return normalized <= 0.03928
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4
    }
    const luminance = (rgb) =>
      rgb
        ? 0.2126 * channel(rgb[0]) +
          0.7152 * channel(rgb[1]) +
          0.0722 * channel(rgb[2])
        : 0
    const contrastRatio = (foreground, background) => {
      const lighter = Math.max(luminance(foreground), luminance(background))
      const darker = Math.min(luminance(foreground), luminance(background))
      return (lighter + 0.05) / (darker + 0.05)
    }
    const rectOf = (element) => {
      if (!element) return null
      const rect = element.getBoundingClientRect()
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      }
    }
    const visibleElement = (selector) =>
      Array.from(document.querySelectorAll(selector)).find((element) => {
        const rect = element.getBoundingClientRect()
        const style = window.getComputedStyle(element)
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden'
        )
      }) || null

    const dialog = visibleElement('.app-alert-dialog')
    const overlay = dialog?.parentElement || null
    const title = dialog?.querySelector('[data-app-alert-title]') || null
    const message = dialog?.querySelector('[data-app-alert-message]') || null
    const confirm = dialog?.querySelector('[data-app-alert-confirm]') || null
    const dialogStyle = dialog ? window.getComputedStyle(dialog) : null
    const titleStyle = title ? window.getComputedStyle(title) : null
    const messageStyle = message ? window.getComputedStyle(message) : null
    const confirmStyle = confirm ? window.getComputedStyle(confirm) : null
    const backgroundColor = parseRgb(dialogStyle?.backgroundColor)

    return {
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      overlay: {
        position: overlay ? window.getComputedStyle(overlay).position : '',
        width: overlay?.getBoundingClientRect().width || 0,
        height: overlay?.getBoundingClientRect().height || 0,
      },
      dialog: rectOf(dialog),
      title: {
        rect: rectOf(title),
        text: title?.textContent?.trim() || '',
        fontSize: Number.parseFloat(titleStyle?.fontSize || '0'),
        contrast: contrastRatio(parseRgb(titleStyle?.color), backgroundColor),
        scrollWidth: title?.scrollWidth || 0,
        clientWidth: title?.clientWidth || 0,
      },
      message: {
        rect: rectOf(message),
        text: message?.textContent?.trim() || '',
        fontSize: Number.parseFloat(messageStyle?.fontSize || '0'),
        contrast: contrastRatio(parseRgb(messageStyle?.color), backgroundColor),
        scrollWidth: message?.scrollWidth || 0,
        clientWidth: message?.clientWidth || 0,
      },
      confirm: {
        rect: rectOf(confirm),
        text: confirm?.textContent?.trim() || '',
        fontSize: Number.parseFloat(confirmStyle?.fontSize || '0'),
        backgroundColor: confirmStyle?.backgroundColor || '',
        contrast: contrastRatio(
          parseRgb(confirmStyle?.color),
          parseRgb(confirmStyle?.backgroundColor)
        ),
        scrollWidth: confirm?.scrollWidth || 0,
        clientWidth: confirm?.clientWidth || 0,
      },
    }
  })

  assert(
    metrics.dialog,
    `${scenarioName} 缺少通用提示弹窗: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.title.rect && metrics.message.rect && metrics.confirm.rect,
    `${scenarioName} 通用提示弹窗内部元素缺失: ${JSON.stringify(metrics)}`
  )
  assert.equal(metrics.title.text, '登录状态已失效')
  assert.equal(metrics.message.text, '未登录')
  assert.equal(metrics.confirm.text, '重新登录')
  assert.equal(
    metrics.overlay.position,
    'fixed',
    `${scenarioName} 遮罩层不再固定覆盖视口: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.overlay.width >= metrics.viewport.width &&
      metrics.overlay.height >= metrics.viewport.height,
    `${scenarioName} 遮罩层未覆盖移动视口: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.dialog.width >= 320 &&
      metrics.dialog.width <= metrics.viewport.width - 24,
    `${scenarioName} 移动端弹窗宽度异常: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.dialog.height <= metrics.viewport.height - 48,
    `${scenarioName} 移动端弹窗高度溢出: ${JSON.stringify(metrics)}`
  )
  assert(
    Math.abs(
      metrics.dialog.left +
        metrics.dialog.width / 2 -
        metrics.viewport.width / 2
    ) <= 2 &&
      Math.abs(
        metrics.dialog.top +
          metrics.dialog.height / 2 -
          metrics.viewport.height / 2
      ) <= 8,
    `${scenarioName} 通用提示弹窗未上下左右居中: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.title.fontSize >= 20 && metrics.message.fontSize >= 14,
    `${scenarioName} 弹窗字号过小: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.title.contrast >= 7 && metrics.message.contrast >= 4.5,
    `${scenarioName} 弹窗文字对比度不足: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.confirm.contrast >= 4.5,
    `${scenarioName} 弹窗按钮文字对比度不足: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.title.scrollWidth <= metrics.title.clientWidth + 1 &&
      metrics.message.scrollWidth <= metrics.message.clientWidth + 1 &&
      metrics.confirm.scrollWidth <= metrics.confirm.clientWidth + 1,
    `${scenarioName} 弹窗文字出现横向溢出: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.title.rect.bottom < metrics.message.rect.top &&
      metrics.message.rect.bottom < metrics.confirm.rect.top,
    `${scenarioName} 弹窗内部文字和按钮发生重叠: ${JSON.stringify(metrics)}`
  )
}

async function assertAdminRoleModalLayout(page, { scenarioName, title }) {
  const modal = page.locator('.ant-modal').filter({ hasText: title }).last()
  await modal.waitFor({ state: 'visible', timeout: 10_000 })
  await assertAntdModalCentered(page, modal, scenarioName)

  const metrics = await modal.evaluate((node) => {
    const body = node.querySelector('.ant-modal-body')
    const formItems = [...node.querySelectorAll('.ant-form-item')]
    const controls = [
      ...node.querySelectorAll(
        '.ant-input, .ant-input-affix-wrapper, .ant-select-selector'
      ),
    ]
      .filter(
        (control) =>
          !(
            control.matches('.ant-input') &&
            control.closest('.ant-input-affix-wrapper')
          )
      )
      .map((control) => {
        const rect = control.getBoundingClientRect()
        return {
          text: control.textContent?.trim()?.slice(0, 32) || '',
          width: rect.width,
          height: rect.height,
        }
      })
    const bodyRect = body?.getBoundingClientRect()

    return {
      body: bodyRect
        ? {
            width: bodyRect.width,
            height: bodyRect.height,
            scrollWidth: body.scrollWidth,
            scrollHeight: body.scrollHeight,
            clientHeight: body.clientHeight,
          }
        : null,
      formItemCount: formItems.length,
      hasRoleSelect: Boolean(
        [...node.querySelectorAll('.ant-select-selection-placeholder')].some(
          (item) => item.textContent?.includes('选择一个或多个角色')
        )
      ),
      controls,
    }
  })

  assert(
    metrics.body,
    `${scenarioName} 缺少弹窗 body: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.formItemCount >= 4 && metrics.hasRoleSelect,
    `${scenarioName} 创建管理员弹窗缺少账号/手机号/密码/角色字段: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.body.scrollWidth <= metrics.body.width + 8,
    `${scenarioName} 创建管理员弹窗出现横向滚动: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.controls.every(
      (control) => control.width >= 120 && control.height >= 30
    ),
    `${scenarioName} 创建管理员弹窗控件尺寸异常: ${JSON.stringify(metrics)}`
  )
}

async function assertAntdModalCenteredImpl(page, modalLocator, scenarioName) {
  await modalLocator.waitFor({ state: 'visible', timeout: 10_000 })
  await delay(350)

  const metrics = await modalLocator.evaluate((node) => {
    const modal =
      node instanceof HTMLElement && node.classList.contains('ant-modal')
        ? node
        : node.closest('.ant-modal')
    const wrap = modal?.closest('.ant-modal-wrap')
    const modalRect = modal?.getBoundingClientRect()
    const wrapRect = wrap?.getBoundingClientRect()

    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      wrap: wrapRect
        ? {
            width: wrapRect.width,
            height: wrapRect.height,
          }
        : null,
      wrapClassName: String(wrap?.className || ''),
      modal: modalRect
        ? {
            left: modalRect.left,
            right: modalRect.right,
            top: modalRect.top,
            bottom: modalRect.bottom,
            width: modalRect.width,
            height: modalRect.height,
            centerX: modalRect.left + modalRect.width / 2,
            centerY: modalRect.top + modalRect.height / 2,
          }
        : null,
    }
  })

  assert(
    metrics.modal,
    `${scenarioName} 缺少可验证的 Ant Design 弹窗: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.wrapClassName.includes('ant-modal-centered'),
    `${scenarioName} Ant Design 弹窗未启用 centered: ${JSON.stringify(metrics)}`
  )
  assert(
    Math.abs(metrics.modal.centerX - metrics.viewport.width / 2) <= 2,
    `${scenarioName} 弹窗未水平居中: ${JSON.stringify(metrics)}`
  )
  assert(
    Math.abs(metrics.modal.centerY - metrics.viewport.height / 2) <= 8,
    `${scenarioName} 弹窗未垂直居中: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.modal.top >= -1 &&
      metrics.modal.bottom <= metrics.viewport.height + 1,
    `${scenarioName} 弹窗垂直居中后溢出视口: ${JSON.stringify(metrics)}`
  )
}

async function assertBatchDeleteModalCountLayoutImpl(
  page,
  { scenarioName, screenshotName = '' }
) {
  await page
    .locator('.erp-business-batch-delete-modal:visible .ant-input-data-count')
    .last()
    .waitFor({ state: 'visible', timeout: 10_000 })
  await delay(100)

  const metrics = await page.evaluate(() => {
    const isVisibleModal = (modal) => {
      const rect = modal.getBoundingClientRect()
      const wrap = modal.closest('.ant-modal-wrap')
      const style = window.getComputedStyle(modal)
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        !wrap?.classList.contains('ant-modal-wrap-hidden') &&
        style.display !== 'none' &&
        style.visibility !== 'hidden'
      )
    }
    const rectOf = (node) => {
      if (!node) return null
      const rect = node.getBoundingClientRect()
      return {
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        width: rect.width,
        height: rect.height,
      }
    }
    const intersects = (left, right) => {
      if (!left || !right) return false
      return !(
        left.right <= right.left ||
        right.right <= left.left ||
        left.bottom <= right.top ||
        right.bottom <= left.top
      )
    }

    const modal = Array.from(
      document.querySelectorAll('.erp-business-batch-delete-modal.ant-modal')
    )
      .filter(isVisibleModal)
      .at(-1)
    const body = modal?.querySelector('.ant-modal-body')
    const footer = modal?.querySelector('.ant-modal-footer')
    const textareaWrapper = modal?.querySelector(
      '.erp-business-batch-delete-modal__reason'
    )
    const textarea = textareaWrapper?.querySelector('textarea')
    const count = textareaWrapper?.querySelector('.ant-input-data-count')
    const wrapperStyle = textareaWrapper
      ? window.getComputedStyle(textareaWrapper)
      : null
    const bodyStyle = body ? window.getComputedStyle(body) : null
    const footerStyle = footer ? window.getComputedStyle(footer) : null
    const modalRect = rectOf(modal)
    const bodyRect = rectOf(body)
    const footerRect = rectOf(footer)
    const wrapperRect = rectOf(textareaWrapper)
    const textareaRect = rectOf(textarea)
    const countRect = rectOf(count)
    const buttonRects = Array.from(
      footer?.querySelectorAll('button') || []
    ).map((button) => ({
      text: button.textContent?.replace(/\s+/g, ' ').trim() || '',
      rect: rectOf(button),
    }))

    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      modal: modalRect,
      body: bodyRect
        ? {
            ...bodyRect,
            clientWidth: body.clientWidth,
            scrollWidth: body.scrollWidth,
            overflowX: bodyStyle?.overflowX,
            overflowY: bodyStyle?.overflowY,
          }
        : null,
      footer: footerRect
        ? {
            ...footerRect,
            marginTop: Number.parseFloat(footerStyle?.marginTop || '0'),
          }
        : null,
      textareaWrapper: wrapperRect
        ? {
            ...wrapperRect,
            marginBottom: Number.parseFloat(wrapperStyle?.marginBottom || '0'),
            position: wrapperStyle?.position || '',
          }
        : null,
      textarea: textareaRect
        ? {
            ...textareaRect,
            clientWidth: textarea.clientWidth,
            scrollWidth: textarea.scrollWidth,
          }
        : null,
      count: countRect
        ? {
            ...countRect,
            text: count.textContent?.replace(/\s+/g, ' ').trim() || '',
            intersectsButtons: buttonRects
              .filter((button) => intersects(countRect, button.rect))
              .map((button) => button.text),
          }
        : null,
      buttonRects,
    }
  })

  assert(
    metrics.modal &&
      metrics.body &&
      metrics.footer &&
      metrics.textareaWrapper &&
      metrics.textarea &&
      metrics.count,
    `${scenarioName} 批量删除弹窗缺少可验证的输入区、计数或 footer: ${JSON.stringify(metrics)}`
  )
  assert.match(
    metrics.count.text,
    /\/\s*255$/,
    `${scenarioName} 删除原因字数统计文案异常: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.textareaWrapper.marginBottom >= metrics.count.height + 4,
    `${scenarioName} 删除原因字数统计未预留独立底部空间: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.textarea.bottom <= metrics.count.top + 2,
    `${scenarioName} 删除原因字数统计压进了输入框内容区: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.count.bottom + 8 <= metrics.footer.top,
    `${scenarioName} 删除原因字数统计与 Modal footer 间距不足: ${JSON.stringify(metrics)}`
  )
  assert.deepEqual(
    metrics.count.intersectsButtons,
    [],
    `${scenarioName} 删除原因字数统计被 footer 按钮覆盖: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.body.scrollWidth <= metrics.body.clientWidth + 1 &&
      metrics.textarea.scrollWidth <= metrics.textarea.clientWidth + 1,
    `${scenarioName} 批量删除弹窗输入区出现横向溢出: ${JSON.stringify(metrics)}`
  )

  if (screenshotName) {
    await page
      .locator('.erp-business-batch-delete-modal:visible')
      .last()
      .screenshot({
        path: path.resolve(outputDir, `${screenshotName}.png`),
      })
  }
}

async function assertPermissionModalLayout(page, { scenarioName }) {
  await page
    .locator('.erp-permission-modal .ant-modal-content')
    .waitFor({ state: 'visible', timeout: 10_000 })
  await assertAntdModalCentered(
    page,
    page.locator('.erp-permission-modal:visible').last(),
    scenarioName
  )
  await page.waitForFunction(() => {
    const modal = document.querySelector('.erp-permission-modal')
    const rect = modal?.getBoundingClientRect()
    return Boolean(rect && rect.width >= 940)
  })
  await page.waitForFunction(() => {
    const nodes = [
      document.querySelector('.erp-permission-modal'),
      document.querySelector('.erp-permission-modal .ant-modal-content'),
    ].filter(Boolean)
    return nodes.every((node) => {
      const { transform } = window.getComputedStyle(node)
      if (!transform || transform === 'none') return true
      const match = transform.match(/^matrix\(([^,]+)/)
      return Boolean(match && Number(match[1]) >= 0.995)
    })
  })

  const metrics = await page.evaluate(() => {
    const modal = document.querySelector('.erp-permission-modal')
    const modalContent = document.querySelector(
      '.erp-permission-modal .ant-modal-content'
    )
    const modalHeader = document.querySelector(
      '.erp-permission-modal .ant-modal-header'
    )
    const modalBody = document.querySelector(
      '.erp-permission-modal .ant-modal-body'
    )
    const modalFooter = document.querySelector(
      '.erp-permission-modal .ant-modal-footer'
    )
    const fields = document.querySelector('.erp-permission-modal__fields')
    const checklist = document.querySelector('.erp-permission-checklist')
    const sectionList = [
      ...document.querySelectorAll('.erp-permission-checklist__section'),
    ]
    const checkboxList = [
      ...document.querySelectorAll(
        '.erp-permission-grid .ant-checkbox-wrapper'
      ),
    ]
    const controls = modal
      ? Array.from(
          modal.querySelectorAll(
            '.ant-input, .ant-input-affix-wrapper, .ant-select-selector, .ant-btn'
          )
        ).map((control) => {
          const rect = control.getBoundingClientRect()
          const style = window.getComputedStyle(control)
          return {
            tagName: control.tagName,
            className: String(control.className || ''),
            text: control.textContent?.trim()?.slice(0, 32) || '',
            isNestedInAffixInput: Boolean(
              control.matches('.ant-input') &&
                control.closest('.ant-input-affix-wrapper')
            ),
            width: rect.width,
            height: rect.height,
            borderRadius: style.borderRadius,
            backgroundColor: style.backgroundColor,
            borderColor: style.borderColor,
          }
        })
      : []

    const countGridColumns = (gridTemplateColumns) =>
      String(gridTemplateColumns || '')
        .split(' ')
        .filter(Boolean).length

    const modalRect = modal?.getBoundingClientRect()
    const contentStyle = modalContent
      ? window.getComputedStyle(modalContent)
      : null
    const headerStyle = modalHeader
      ? window.getComputedStyle(modalHeader)
      : null
    const bodyStyle = modalBody ? window.getComputedStyle(modalBody) : null
    const footerStyle = modalFooter
      ? window.getComputedStyle(modalFooter)
      : null
    const fieldsStyle = fields ? window.getComputedStyle(fields) : null
    const checklistStyle = checklist ? window.getComputedStyle(checklist) : null
    const modalBodyRect = modalBody?.getBoundingClientRect()
    const checklistRect = checklist?.getBoundingClientRect()
    const sectionSpillCount = sectionList.filter((section) => {
      const rect = section.getBoundingClientRect()
      return (
        checklistRect &&
        (rect.left < checklistRect.left - 1 ||
          rect.right > checklistRect.right + 1)
      )
    }).length
    const checkboxSpillCount = checkboxList.filter((checkbox) => {
      const rect = checkbox.getBoundingClientRect()
      const section = checkbox.closest('.erp-permission-checklist__section')
      const sectionRect = section?.getBoundingClientRect()
      return (
        sectionRect &&
        (rect.left < sectionRect.left - 1 || rect.right > sectionRect.right + 1)
      )
    }).length

    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      modal: modalRect
        ? {
            top: modalRect.top,
            width: modalRect.width,
            height: modalRect.height,
          }
        : null,
      modalChrome: modalContent
        ? {
            content: {
              borderTopWidth: contentStyle?.borderTopWidth,
              borderRightWidth: contentStyle?.borderRightWidth,
              borderBottomWidth: contentStyle?.borderBottomWidth,
              borderLeftWidth: contentStyle?.borderLeftWidth,
              borderRadius: contentStyle?.borderRadius,
              boxShadow: contentStyle?.boxShadow,
              paddingTop: contentStyle?.paddingTop,
              paddingRight: contentStyle?.paddingRight,
              paddingBottom: contentStyle?.paddingBottom,
              paddingLeft: contentStyle?.paddingLeft,
            },
            header: {
              borderBottomWidth: headerStyle?.borderBottomWidth,
            },
            footer: {
              borderTopWidth: footerStyle?.borderTopWidth,
            },
          }
        : null,
      modalBody: modalBodyRect
        ? {
            clientHeight: modalBody.clientHeight,
            scrollHeight: modalBody.scrollHeight,
            scrollWidth: modalBody.scrollWidth,
            width: modalBodyRect.width,
            height: modalBodyRect.height,
            overflowY: bodyStyle?.overflowY,
          }
        : null,
      fieldsColumnCount: countGridColumns(fieldsStyle?.gridTemplateColumns),
      checklistColumnCount: countGridColumns(
        checklistStyle?.gridTemplateColumns
      ),
      sectionCount: sectionList.length,
      checkboxCount: checkboxList.length,
      sectionSpillCount,
      checkboxSpillCount,
      controls,
    }
  })

  assert(
    metrics.modal,
    `${scenarioName} 缺少权限弹窗: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.modal.width >= 840 &&
      metrics.modal.width <= metrics.viewport.width - 32,
    `${scenarioName} 弹窗宽度没有脱离窄长条: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.modal.height <= metrics.viewport.height - 48,
    `${scenarioName} 弹窗高度溢出视口: ${JSON.stringify(metrics)}`
  )
  assertTradeLikeModalChrome(metrics, scenarioName)
  assert(
    metrics.modalBody?.overflowY === 'auto',
    `${scenarioName} 权限内容滚动容器未收口到弹窗 body: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    metrics.fieldsColumnCount,
    2,
    `${scenarioName} 账号字段未保持两列布局: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    metrics.checklistColumnCount,
    2,
    `${scenarioName} 权限分组未保持两列布局: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.sectionCount >= 4 && metrics.checkboxCount >= 8,
    `${scenarioName} 权限分组或选项缺失: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    metrics.sectionSpillCount,
    0,
    `${scenarioName} 权限分组溢出容器: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    metrics.checkboxSpillCount,
    0,
    `${scenarioName} 权限选项文字溢出分组: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.modalBody.scrollWidth <= metrics.modalBody.width + 8,
    `${scenarioName} 弹窗 body 出现横向滚动: ${JSON.stringify(metrics)}`
  )
  assertTradeLikeModalControls(metrics, scenarioName)

  await assertPermissionModalFocusStyle(page, scenarioName)
}

async function assertPermissionModalFocusStyle(page, scenarioName) {
  const focusTargets = [
    {
      label: '账号输入框',
      selector: '.erp-permission-modal input.ant-input:not([disabled])',
      action: 'focus',
    },
    {
      label: '密码输入框',
      selector:
        '.erp-permission-modal .ant-input-affix-wrapper input:not([disabled])',
      action: 'focus',
    },
    {
      label: '等级下拉框',
      selector: '.erp-permission-modal .ant-select-selector',
      action: 'click',
    },
  ]

  const checked = []
  for (const target of focusTargets) {
    const locator = page.locator(target.selector).first()
    if ((await locator.count()) === 0) {
      continue
    }

    if (target.action === 'click') {
      await locator.click()
    } else {
      await locator.evaluate((node) => node.focus({ preventScroll: true }))
    }
    await page.waitForTimeout(80)
    const metrics = await locator.evaluate((node, label) => {
      const sourceStyle = window.getComputedStyle(node)
      const focusedControl =
        node.matches('.ant-select-selector') ||
        node.matches('.ant-input-affix-wrapper')
          ? node
          : node.closest('.ant-input-affix-wrapper') ||
            node.closest('.ant-input-number') ||
            node
      const style = window.getComputedStyle(focusedControl)
      return {
        label,
        tagName: focusedControl.tagName,
        className: String(focusedControl.className || ''),
        activeElementTagName: document.activeElement?.tagName || '',
        isFocused: document.activeElement === node,
        matchesFocus: node.matches(':focus'),
        borderColor: style.borderColor,
        boxShadow: style.boxShadow,
        sourceBorderColor: sourceStyle.borderColor,
        sourceBoxShadow: sourceStyle.boxShadow,
      }
    }, target.label)
    checked.push(metrics)
    const selectSearchMetrics = await readActiveSelectSearchFocusMetric(
      page,
      target.label
    )
    if (selectSearchMetrics) {
      checked.push(selectSearchMetrics)
    }
    if (target.action === 'click') {
      await page.keyboard.press('Escape').catch(() => {})
    }
  }

  assert(
    checked.length > 0,
    `${scenarioName} 未找到可验证 focus 的权限弹窗控件`
  )
  checked.forEach((metrics) => {
    assert(
      isAcceptedFocusBorder(metrics),
      `${scenarioName} ${metrics.label} focus 边框未统一到绿色主题: ${JSON.stringify(metrics)}`
    )
    assertNoBlueFocusStyle(metrics, scenarioName)
  })
}

async function assertVisibleModalInputFocusStyle(
  page,
  { scenarioName, modalText }
) {
  const activeModal = page
    .locator('.ant-modal:visible')
    .filter({ hasText: modalText })
    .last()
  await activeModal.waitFor({ state: 'visible', timeout: 10_000 })

  const focusTargets = [
    {
      label: '弹窗文本输入框',
      selector: 'input.ant-input:not([disabled])',
      action: 'focus',
    },
    {
      label: '弹窗多行输入框',
      selector: 'textarea.ant-input:not([disabled])',
      action: 'focus',
    },
    {
      label: '弹窗数字输入框',
      selector: '.ant-input-number-input:not([disabled])',
      action: 'focus',
    },
    {
      label: '弹窗下拉框',
      selector: '.ant-select-selector',
      action: 'click',
    },
  ]

  const checked = []
  for (const target of focusTargets) {
    const locator = activeModal.locator(target.selector).first()
    if ((await locator.count()) === 0) {
      continue
    }

    if (target.action === 'click') {
      await locator.click()
    } else {
      await locator.focus()
    }
    await page.waitForTimeout(80)
    const metrics = await locator.evaluate((node, label) => {
      const sourceStyle = window.getComputedStyle(node)
      const focusedControl =
        node.matches('.ant-select-selector') ||
        node.matches('.ant-input-affix-wrapper')
          ? node
          : node.closest('.ant-input-affix-wrapper') ||
            node.closest('.ant-input-number') ||
            node.closest('.ant-picker') ||
            node
      const style = window.getComputedStyle(focusedControl)
      return {
        label,
        tagName: focusedControl.tagName,
        className: String(focusedControl.className || ''),
        borderColor: style.borderColor,
        boxShadow: style.boxShadow,
        sourceBorderColor: sourceStyle.borderColor,
        sourceBoxShadow: sourceStyle.boxShadow,
      }
    }, target.label)
    checked.push(metrics)
    const selectSearchMetrics = await readActiveSelectSearchFocusMetric(
      page,
      target.label
    )
    if (selectSearchMetrics) {
      checked.push(selectSearchMetrics)
    }
    if (target.action === 'click') {
      await page.keyboard.press('Escape').catch(() => {})
    }
  }

  assert(
    checked.length > 0,
    `${scenarioName} 未找到可验证 focus 的弹窗输入控件`
  )
  checked.forEach((metrics) => {
    assert(
      isAcceptedFocusBorder(metrics),
      `${scenarioName} ${metrics.label} focus 边框未统一到绿色主题: ${JSON.stringify(metrics)}`
    )
    assertNoBlueFocusStyle(metrics, scenarioName)
  })
}

async function assertBusinessRecordModalLayout(
  page,
  { scenarioName, minModalWidth, expectCompactGrid }
) {
  await page
    .locator('.erp-business-record-modal:visible .ant-modal-content')
    .last()
    .waitFor({ state: 'visible', timeout: 10_000 })
  await assertAntdModalCentered(
    page,
    page.locator('.erp-business-record-modal:visible').last(),
    scenarioName
  )

  const metrics = await page.evaluate((shouldCheckCompactGrid) => {
    const visibleModals = Array.from(
      document.querySelectorAll('.erp-business-record-modal.ant-modal')
    ).filter((modal) => {
      const rect = modal.getBoundingClientRect()
      const wrap = modal.closest('.ant-modal-wrap')
      const style = window.getComputedStyle(modal)
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        !wrap?.classList.contains('ant-modal-wrap-hidden') &&
        style.display !== 'none' &&
        style.visibility !== 'hidden'
      )
    })
    const modal = visibleModals.at(-1)
    const content = modal?.querySelector('.ant-modal-content')
    const header = modal?.querySelector('.ant-modal-header')
    const body = modal?.querySelector('.ant-modal-body')
    const footer = modal?.querySelector('.ant-modal-footer')
    const form = modal?.querySelector('.erp-business-record-form')
    const fieldCols = form
      ? Array.from(form.querySelectorAll(':scope > .ant-row > .ant-col')).map(
          (col) => {
            const rect = col.getBoundingClientRect()
            return {
              className: String(col.className || ''),
              text: col.textContent?.trim()?.slice(0, 32) || '',
              width: rect.width,
              height: rect.height,
            }
          }
        )
      : []
    const controls = modal
      ? Array.from(
          modal.querySelectorAll(
            '.ant-input, .ant-input-affix-wrapper, .ant-input-number, .ant-picker, .ant-select-selector, .ant-btn'
          )
        ).map((control) => {
          const rect = control.getBoundingClientRect()
          const style = window.getComputedStyle(control)
          return {
            tagName: control.tagName,
            className: String(control.className || ''),
            text: control.textContent?.trim()?.slice(0, 32) || '',
            isNestedInAffixInput: Boolean(
              control.matches('.ant-input') &&
                control.closest('.ant-input-affix-wrapper')
            ),
            isTextareaAffixWrapper: Boolean(
              control.className.includes('ant-input-textarea-affix-wrapper')
            ),
            width: rect.width,
            height: rect.height,
            borderRadius: style.borderRadius,
            backgroundColor: style.backgroundColor,
            borderColor: style.borderColor,
            overflowX: style.overflowX,
            overflowY: style.overflowY,
            whiteSpace: style.whiteSpace,
          }
        })
      : []
    const addItemButton = controls.find((control) =>
      control.className.includes('erp-business-record-form__add-item-button')
    )
    const firstRowCols = fieldCols.slice(0, 6)
    const modalRect = modal?.getBoundingClientRect()
    const contentStyle = content ? window.getComputedStyle(content) : null
    const headerStyle = header ? window.getComputedStyle(header) : null
    const bodyRect = body?.getBoundingClientRect()
    const bodyStyle = body ? window.getComputedStyle(body) : null
    const footerStyle = footer ? window.getComputedStyle(footer) : null
    const nestedHorizontalScrollContainers = body
      ? Array.from(
          body.querySelectorAll(
            '.erp-item-card-horizontal-scroll .ant-card-body'
          )
        ).map((node) => {
          const rect = node.getBoundingClientRect()
          const style = window.getComputedStyle(node)
          return {
            width: rect.width,
            clientWidth: node.clientWidth,
            scrollWidth: node.scrollWidth,
            overflowX: style.overflowX,
          }
        })
      : []

    return {
      shouldCheckCompactGrid,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      modal: modalRect
        ? {
            width: modalRect.width,
            height: modalRect.height,
            top: modalRect.top,
            bottom: modalRect.bottom,
          }
        : null,
      modalChrome: content
        ? {
            content: {
              borderTopWidth: contentStyle?.borderTopWidth,
              borderRightWidth: contentStyle?.borderRightWidth,
              borderBottomWidth: contentStyle?.borderBottomWidth,
              borderLeftWidth: contentStyle?.borderLeftWidth,
              borderRadius: contentStyle?.borderRadius,
              boxShadow: contentStyle?.boxShadow,
              paddingTop: contentStyle?.paddingTop,
              paddingRight: contentStyle?.paddingRight,
              paddingBottom: contentStyle?.paddingBottom,
              paddingLeft: contentStyle?.paddingLeft,
            },
            header: {
              borderBottomWidth: headerStyle?.borderBottomWidth,
            },
            footer: {
              borderTopWidth: footerStyle?.borderTopWidth,
            },
          }
        : null,
      body: bodyRect
        ? {
            width: bodyRect.width,
            height: bodyRect.height,
            clientHeight: body.clientHeight,
            scrollHeight: body.scrollHeight,
            scrollWidth: body.scrollWidth,
            overflowX: bodyStyle?.overflowX,
            overflowY: bodyStyle?.overflowY,
          }
        : null,
      fieldCols,
      firstRowCols,
      controls,
      addItemButton,
      nestedHorizontalScrollContainers,
    }
  }, expectCompactGrid)

  assert(
    metrics.modal,
    `${scenarioName} 缺少业务弹窗: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.modal.width >= minModalWidth &&
      metrics.modal.width <= metrics.viewport.width - 32,
    `${scenarioName} 弹窗宽度未按当前 ERP 宽弹窗基线收口: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.modal.height <= metrics.viewport.height - 32,
    `${scenarioName} 弹窗高度溢出视口: ${JSON.stringify(metrics)}`
  )
  assertTradeLikeModalChrome(metrics, scenarioName)
  assert(
    metrics.body?.overflowY === 'auto',
    `${scenarioName} 弹窗 body 未接管纵向滚动: ${JSON.stringify(metrics)}`
  )
  const hasManagedNestedHorizontalScroll =
    metrics.body?.overflowX === 'hidden' &&
    metrics.nestedHorizontalScrollContainers?.some(
      (container) =>
        container.overflowX === 'auto' &&
        container.width <= metrics.body.width + 8 &&
        container.scrollWidth > container.clientWidth + 8
    )
  assert(
    metrics.body.scrollWidth <= metrics.body.width + 8 ||
      hasManagedNestedHorizontalScroll,
    `${scenarioName} 弹窗 body 出现未受控横向滚动: ${JSON.stringify(metrics)}`
  )

  const roundedControls = metrics.controls.filter(
    (control) =>
      control.width > 0 &&
      control.height > 0 &&
      !control.isNestedInAffixInput &&
      !String(control.className || '').includes('erp-item-field-unit-suffix') &&
      !String(control.className || '').includes('ant-btn-link')
  )
  assert(
    roundedControls.length > 0,
    `${scenarioName} 未找到可检查的业务弹窗控件: ${JSON.stringify(metrics)}`
  )
  roundedControls.forEach((control) => {
    const radius = Number.parseFloat(control.borderRadius)
    assert(
      Number.isFinite(radius) && radius >= 9,
      `${scenarioName} 控件圆角未符合当前 ERP 表单基线: ${JSON.stringify(control)}`
    )
  })
  assertTradeLikeModalControls(metrics, scenarioName)

  await assertBusinessRecordModalFocusStyle(page, scenarioName)

  if (!expectCompactGrid) {
    return
  }

  assert(
    metrics.firstRowCols.length >= 3,
    `${scenarioName} 表单首行字段不足，无法验证紧凑栅格: ${JSON.stringify(metrics)}`
  )
  metrics.firstRowCols.slice(0, 3).forEach((col) => {
    assert(
      col.width <= 460,
      `${scenarioName} 表头字段仍是两列宽输入: ${JSON.stringify(metrics)}`
    )
  })
  assert(
    metrics.addItemButton?.width > 0 && metrics.addItemButton.width <= 180,
    `${scenarioName} 添加明细按钮不应被 grid 拉伸: ${JSON.stringify(metrics)}`
  )
}

async function assertBusinessRecordItemCardLayout(page, { scenarioName }) {
  const metrics = await page.evaluate(() => {
    const modal = Array.from(
      document.querySelectorAll('.erp-business-record-modal.ant-modal')
    )
      .filter((item) => {
        const rect = item.getBoundingClientRect()
        const wrap = item.closest('.ant-modal-wrap')
        const style = window.getComputedStyle(item)
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          !wrap?.classList.contains('ant-modal-wrap-hidden') &&
          style.display !== 'none' &&
          style.visibility !== 'hidden'
        )
      })
      .at(-1)
    const body = modal?.querySelector('.ant-modal-body')
    const cards = modal
      ? Array.from(modal.querySelectorAll('.erp-item-card')).map((card) => {
          const rect = card.getBoundingClientRect()
          const cardStyle = window.getComputedStyle(card)
          const head = card.querySelector('.ant-card-head')
          const headStyle = head ? window.getComputedStyle(head) : null
          const cardBody = card.querySelector('.ant-card-body')
          const bodyStyle = cardBody ? window.getComputedStyle(cardBody) : null
          const row = card.querySelector('.erp-item-card-row')
          const rowStyle = row ? window.getComputedStyle(row) : null
          return {
            width: rect.width,
            borderRadius: cardStyle.borderRadius,
            backgroundColor: cardStyle.backgroundColor,
            headMinHeight: Number.parseFloat(headStyle?.minHeight || '0'),
            bodyOverflowX: bodyStyle?.overflowX || '',
            rowFlexWrap: rowStyle?.flexWrap || '',
            rowMinWidth: row ? row.scrollWidth : 0,
            bodyClientWidth: cardBody ? cardBody.clientWidth : 0,
          }
        })
      : []
    return {
      body: body
        ? {
            width: body.getBoundingClientRect().width,
            scrollWidth: body.scrollWidth,
          }
        : null,
      cardCount: cards.length,
      cards,
      legacyItemHeaders: modal
        ? modal.querySelectorAll('.erp-business-record-item-grid__head').length
        : 0,
      itemHelpVisible: Boolean(
        modal?.querySelector('.erp-business-record-form__items-help')
      ),
      addItemButtonWidth:
        modal
          ?.querySelector('.erp-business-record-form__add-item-button')
          ?.getBoundingClientRect().width || 0,
    }
  })

  assert(
    metrics.cardCount >= 1,
    `${scenarioName} 未渲染本项目条目卡片: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    metrics.legacyItemHeaders,
    0,
    `${scenarioName} 仍残留旧表格状明细头: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.itemHelpVisible,
    `${scenarioName} 缺少本项目明细帮助区: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.addItemButtonWidth > 0 && metrics.addItemButtonWidth <= 180,
    `${scenarioName} 添加条目按钮不应被拉伸: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.body && metrics.body.scrollWidth <= metrics.body.width + 8,
    `${scenarioName} 条目横向滚动泄漏到弹窗 body: ${JSON.stringify(metrics)}`
  )
  metrics.cards.forEach((card) => {
    assert(
      Number.parseFloat(card.borderRadius) >= 9,
      `${scenarioName} 条目卡片圆角不符合本项目样式: ${JSON.stringify(metrics)}`
    )
    assert(
      card.headMinHeight >= 40,
      `${scenarioName} 条目卡片头部高度不符合本项目样式: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      card.bodyOverflowX,
      'auto',
      `${scenarioName} 条目卡片内部未接管横向滚动: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      card.rowFlexWrap,
      'nowrap',
      `${scenarioName} 条目字段未保持单行横向风格: ${JSON.stringify(metrics)}`
    )
    assert(
      card.rowMinWidth >= card.bodyClientWidth,
      `${scenarioName} 条目行宽未形成卡片内横向预算: ${JSON.stringify(metrics)}`
    )
  })
}

async function assertBusinessRecordModalFocusStyle(page, scenarioName) {
  const activeModal = page
    .locator('.erp-business-record-modal:visible .ant-modal-content')
    .last()
  const focusTargets = [
    {
      label: '文本输入框',
      selector: '.erp-business-record-form input.ant-input:not([disabled])',
      action: 'focus',
    },
    {
      label: '多行输入框',
      selector: 'textarea.ant-input:not([disabled])',
      action: 'focus',
    },
    {
      label: '数字输入框',
      selector:
        '.erp-business-record-form .ant-input-number-input:not([disabled])',
      action: 'focus',
    },
    {
      label: '下拉框',
      selector: '.erp-business-record-form .ant-select-selector',
      action: 'click',
    },
  ]

  const checked = []
  for (const target of focusTargets) {
    const locator = activeModal.locator(target.selector).first()
    if ((await locator.count()) === 0) {
      continue
    }

    if (target.action === 'click') {
      await locator.click()
    } else {
      await locator.focus()
    }
    await page.waitForTimeout(80)
    const metrics = await locator.evaluate((node, label) => {
      const sourceStyle = window.getComputedStyle(node)
      const focusedControl =
        node.matches('.ant-select-selector') ||
        node.matches('.ant-input-affix-wrapper')
          ? node
          : node.closest('.ant-input-affix-wrapper') ||
            node.closest('.ant-input-number') ||
            node.closest('.ant-picker') ||
            node
      const style = window.getComputedStyle(focusedControl)
      const itemCard = node.closest('.erp-item-card')
      const itemCardStyle = itemCard ? window.getComputedStyle(itemCard) : null
      const itemCardHead = itemCard?.querySelector('.ant-card-head')
      const itemCardHeadStyle = itemCardHead
        ? window.getComputedStyle(itemCardHead)
        : null
      return {
        label,
        tagName: focusedControl.tagName,
        className: String(focusedControl.className || ''),
        borderColor: style.borderColor,
        boxShadow: style.boxShadow,
        sourceBorderColor: sourceStyle.borderColor,
        sourceBoxShadow: sourceStyle.boxShadow,
        itemCard: itemCard
          ? {
              borderColor: itemCardStyle?.borderColor,
              boxShadow: itemCardStyle?.boxShadow,
              backgroundColor: itemCardStyle?.backgroundColor,
              headBackgroundColor: itemCardHeadStyle?.backgroundColor,
              headBorderColor: itemCardHeadStyle?.borderBottomColor,
            }
          : null,
      }
    }, target.label)
    checked.push(metrics)
    const selectSearchMetrics = await readActiveSelectSearchFocusMetric(
      page,
      target.label
    )
    if (selectSearchMetrics) {
      checked.push(selectSearchMetrics)
    }
    if (target.action === 'click') {
      await page.keyboard.press('Escape').catch(() => {})
    }
  }

  assert(
    checked.length > 0,
    `${scenarioName} 未找到可验证 focus 的业务弹窗控件`
  )
  checked.forEach((metrics) => {
    assert(
      isAcceptedFocusBorder(metrics),
      `${scenarioName} ${metrics.label} focus 边框未统一到绿色主题: ${JSON.stringify(metrics)}`
    )
    assertNoBlueFocusStyle(metrics, scenarioName)
    if (metrics.itemCard) {
      assert(
        isGreenFocusColor(metrics.itemCard.borderColor),
        `${scenarioName} 条目卡片 focus 边框未统一到绿色主题: ${JSON.stringify(metrics)}`
      )
      assert(
        !hasBlueFocusRing(metrics.itemCard.boxShadow) &&
          !hasBlueFocusRing(metrics.itemCard.backgroundColor) &&
          !hasBlueFocusRing(metrics.itemCard.headBackgroundColor) &&
          !hasBlueFocusRing(metrics.itemCard.headBorderColor),
        `${scenarioName} 条目卡片 focus 仍残留蓝色高亮: ${JSON.stringify(metrics)}`
      )
    }
  })
}

async function readActiveSelectSearchFocusMetric(page, label) {
  return page.evaluate((sourceLabel) => {
    const { activeElement } = document
    if (
      !activeElement?.classList?.contains('ant-select-selection-search-input')
    ) {
      return null
    }

    const style = window.getComputedStyle(activeElement)
    return {
      label: `${sourceLabel}内部搜索输入`,
      tagName: activeElement.tagName,
      className: String(activeElement.className || ''),
      borderColor: style.borderColor,
      boxShadow: style.boxShadow,
      allowTransparentBorder: true,
      skipBorderColor: true,
    }
  }, label)
}

function assertTradeLikeModalChrome(metrics, scenarioName) {
  const chrome = metrics.modalChrome
  assert(
    chrome?.content,
    `${scenarioName} 缺少可检查的弹窗壳层样式: ${JSON.stringify(metrics)}`
  )

  const pixel = (value) => Number.parseFloat(String(value || '0'))
  const contentBorderWidth =
    pixel(chrome.content.borderTopWidth) +
    pixel(chrome.content.borderRightWidth) +
    pixel(chrome.content.borderBottomWidth) +
    pixel(chrome.content.borderLeftWidth)
  assert.equal(
    contentBorderWidth,
    0,
    `${scenarioName} 弹窗壳层不应额外叠加边框: ${JSON.stringify(chrome)}`
  )
  assert.equal(
    pixel(chrome.header?.borderBottomWidth),
    0,
    `${scenarioName} 弹窗头部不应额外叠加分割线: ${JSON.stringify(chrome)}`
  )
  assert.equal(
    pixel(chrome.footer?.borderTopWidth),
    0,
    `${scenarioName} 弹窗底部不应额外叠加分割线: ${JSON.stringify(chrome)}`
  )

  const radius = pixel(chrome.content.borderRadius)
  assert(
    Number.isFinite(radius) && radius >= 9 && radius <= 16,
    `${scenarioName} 弹窗圆角未沿用 Ant Design / 当前 ERP 基线: ${JSON.stringify(chrome)}`
  )
  assert(
    pixel(chrome.content.paddingTop) >= 16 &&
      pixel(chrome.content.paddingRight) >= 20 &&
      pixel(chrome.content.paddingBottom) >= 16 &&
      pixel(chrome.content.paddingLeft) >= 20,
    `${scenarioName} 弹窗内容不应回退到 padding=0 的重定制壳层: ${JSON.stringify(chrome)}`
  )
  assert(
    !String(chrome.content.boxShadow || '').includes('24px 54px'),
    `${scenarioName} 弹窗不应回退到本项目旧重阴影: ${JSON.stringify(chrome)}`
  )
}

function assertTradeLikeModalControls(metrics, scenarioName) {
  const visibleControls = (metrics.controls || []).filter(
    (control) =>
      control.width > 0 &&
      control.height > 0 &&
      !control.isNestedInAffixInput &&
      !String(control.className || '').includes('erp-item-field-unit-suffix') &&
      !String(control.className || '').includes('ant-btn-link')
  )
  assert(
    visibleControls.length > 0,
    `${scenarioName} 未找到可检查的弹窗控件: ${JSON.stringify(metrics)}`
  )
  visibleControls.forEach((control) => {
    const radius = Number.parseFloat(control.borderRadius)
    assert(
      Number.isFinite(radius) && radius >= 9,
      `${scenarioName} 控件圆角未符合当前 ERP 表单基线: ${JSON.stringify(control)}`
    )
  })

  const fieldControls = visibleControls.filter(
    (control) => !control.className.includes('ant-btn')
  )
  fieldControls.forEach((control) => {
    assert(
      !isTailwindFormsResetBorderColor(control.borderColor),
      `${scenarioName} 弹窗控件仍被 Tailwind/forms 默认边框接管: ${JSON.stringify(control)}`
    )
    assert(
      isNeutralModalControlBorderColor(control.borderColor) ||
        isGreenFocusColor(control.borderColor),
      `${scenarioName} 弹窗控件边框未统一到 AntD 浅灰 / ERP 绿色焦点态: ${JSON.stringify(control)}`
    )
    assert(
      control.backgroundColor === 'rgb(255, 255, 255)',
      `${scenarioName} 弹窗控件背景未统一为白底输入框: ${JSON.stringify(control)}`
    )
  })

  const singleLineControls = fieldControls.filter(
    (control) =>
      control.tagName !== 'TEXTAREA' &&
      !control.isTextareaAffixWrapper &&
      !control.className.includes('ant-input-number-input')
  )
  singleLineControls.forEach((control) => {
    assert(
      control.height >= 31 && control.height <= 33,
      `${scenarioName} 弹窗单行控件高度未统一到 32px 基线: ${JSON.stringify(control)}`
    )
  })

  const primaryButtons = visibleControls.filter((control) =>
    control.className.includes('ant-btn-primary')
  )
  primaryButtons.forEach((control) => {
    assert(
      isGreenFocusColor(control.backgroundColor) ||
        isGreenFocusColor(control.borderColor),
      `${scenarioName} 主按钮未沿用当前 ERP 绿色主题: ${JSON.stringify(control)}`
    )
  })
}

function isGreenFocusColor(color) {
  const match = String(color || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
  if (!match) return false
  const [, red, green, blue] = match.map(Number)
  return green > red && green >= blue
}

function hasBlueFocusRing(value) {
  const normalized = String(value || '')
  return (
    normalized.includes('37, 99, 235') ||
    normalized.includes('22, 119, 255') ||
    normalized.includes('rgb(37 99 235') ||
    normalized.includes('rgb(22 119 255')
  )
}

function assertNoBlueFocusStyle(metrics, scenarioName) {
  assert(
    !hasBlueFocusRing(metrics.boxShadow) &&
      !hasBlueFocusRing(metrics.sourceBoxShadow) &&
      !hasBlueFocusRing(metrics.borderColor) &&
      !hasBlueFocusRing(metrics.sourceBorderColor),
    `${scenarioName} ${metrics.label} focus 仍残留蓝色 ring 或边框: ${JSON.stringify(metrics)}`
  )
}

function isNeutralModalControlBorderColor(color) {
  return String(color || '').replaceAll(' ', '') === 'rgb(217,217,217)'
}

function isTailwindFormsResetBorderColor(color) {
  const normalized = String(color || '').replaceAll(' ', '')
  return normalized === 'rgb(107,114,128)' || normalized === 'rgba(0,0,0,0.88)'
}

function isAcceptedFocusBorder(metrics) {
  if (metrics.skipBorderColor) return true
  if (metrics.allowTransparentBorder) {
    return (
      isGreenFocusColor(metrics.borderColor) ||
      isTransparentFocusColor(metrics.borderColor)
    )
  }
  return isGreenFocusColor(metrics.borderColor)
}

function isTransparentFocusColor(color) {
  return (
    color === 'transparent' ||
    String(color || '').replaceAll(' ', '') === 'rgba(0,0,0,0)'
  )
}

async function assertBusinessModuleToolbarControlStyle(page, { scenarioName }) {
  const metrics = await page.evaluate(() => {
    const readControlFromElement = (element, selector = '') => {
      const rect = element.getBoundingClientRect()
      const style = window.getComputedStyle(element)
      return {
        selector,
        text: String(
          element.textContent || element.getAttribute('placeholder') || ''
        ).trim(),
        cursor: style.cursor,
        borderRadius: style.borderRadius,
        borderTopLeftRadius: style.borderTopLeftRadius,
        borderTopRightRadius: style.borderTopRightRadius,
        borderBottomLeftRadius: style.borderBottomLeftRadius,
        borderBottomRightRadius: style.borderBottomRightRadius,
        borderColor: style.borderTopColor,
        height: rect.height,
        top: rect.top,
        bottom: rect.bottom,
        centerY: rect.top + rect.height / 2,
        width: rect.width,
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
      }
    }
    const readControl = (selector) => {
      const element = document.querySelector(selector)
      return element ? readControlFromElement(element, selector) : null
    }
    const dateControls = Array.from(
      document.querySelectorAll(
        '.erp-business-filter-panel .erp-business-date-range-filter'
      )
    ).map((node) => readControlFromElement(node))
    const selectControls = Array.from(
      document.querySelectorAll(
        '.erp-business-filter-panel__grid > .ant-select .ant-select-selector'
      )
    ).map((node) => readControlFromElement(node))
    const filterControls = [
      readControl('.erp-business-filter-panel .ant-input-affix-wrapper'),
      ...selectControls,
      ...dateControls,
    ].filter(Boolean)

    return {
      search: readControl(
        '.erp-business-filter-panel .ant-input-affix-wrapper'
      ),
      dateInput: readControl('.erp-business-filter-panel input[type="date"]'),
      dateControl: readControl(
        '.erp-business-filter-panel .erp-business-date-range-filter'
      ),
      dateInputs: Array.from(
        document.querySelectorAll(
          '.erp-business-filter-panel input[type="date"]'
        )
      ).map((node) => readControlFromElement(node)),
      dateControls,
      selectControls,
      filterControls,
      statusSelector: readControl(
        '.erp-business-filter-control--status .ant-select-selector'
      ),
      statusPlaceholder: readControl(
        '.erp-business-filter-control--status .ant-select-selection-placeholder'
      ),
      statusSearchInput: readControl(
        '.erp-business-filter-control--status .ant-select-selection-search-input'
      ),
      statusArrow: readControl(
        '.erp-business-filter-control--status .ant-select-arrow'
      ),
      actionButton: readControl('.erp-business-module-toolbar .ant-btn'),
    }
  })

  assert(
    metrics.search &&
      metrics.dateInput &&
      metrics.dateControl &&
      metrics.dateInputs.length === 2 &&
      metrics.statusSelector &&
      metrics.statusPlaceholder &&
      metrics.statusSearchInput &&
      metrics.statusArrow &&
      metrics.actionButton,
    `${scenarioName} 工具栏控件缺失: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    metrics.dateControls.length,
    1,
    `${scenarioName} 日期范围控件应收口为一个整体: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.dateInputs.every(
      (item) => item.scrollWidth <= item.clientWidth + 1
    ),
    `${scenarioName} 起止日期文字出现裁切: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.dateInputs.every((item) => item.width >= 136),
    `${scenarioName} 起止日期输入宽度不足以完整显示 yyyy/mm/dd: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.filterControls.every(
      (item) => Math.abs(item.height - metrics.search.height) <= 1
    ),
    `${scenarioName} 筛选输入框高度未统一: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    metrics.dateInput.cursor,
    'pointer',
    `${scenarioName} 日期输入 cursor 未统一为 pointer: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    metrics.actionButton.cursor,
    'pointer',
    `${scenarioName} 工具栏按钮 cursor 未统一为 pointer: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    metrics.dateControl.borderTopLeftRadius,
    metrics.search.borderTopLeftRadius,
    `${scenarioName} 日期控件左上圆角未对齐搜索框: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    metrics.dateControl.borderBottomLeftRadius,
    metrics.search.borderBottomLeftRadius,
    `${scenarioName} 日期控件左下圆角未对齐搜索框: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    metrics.dateControl.borderTopRightRadius,
    metrics.search.borderTopRightRadius,
    `${scenarioName} 日期控件右上圆角未对齐搜索框: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    metrics.dateControl.borderBottomRightRadius,
    metrics.search.borderBottomRightRadius,
    `${scenarioName} 日期控件右下圆角未对齐搜索框: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    metrics.dateControl.borderColor,
    metrics.search.borderColor,
    `${scenarioName} 日期控件边框颜色未对齐搜索框: ${JSON.stringify(metrics)}`
  )
  assert(
    Math.abs(metrics.dateControl.height - metrics.search.height) <= 1,
    `${scenarioName} 日期控件高度未对齐搜索框: ${JSON.stringify(metrics)}`
  )
  assert(
    Math.abs(
      metrics.statusPlaceholder.centerY - metrics.statusSelector.centerY
    ) <= 1,
    `${scenarioName} 状态筛选 placeholder 未上下居中: ${JSON.stringify(metrics)}`
  )
  assert(
    Math.abs(
      metrics.statusSearchInput.centerY - metrics.statusSelector.centerY
    ) <= 1,
    `${scenarioName} 状态筛选内部搜索 input 未上下居中: ${JSON.stringify(metrics)}`
  )
  assert(
    Math.abs(metrics.statusArrow.centerY - metrics.statusSelector.centerY) <= 1,
    `${scenarioName} 状态筛选箭头未上下居中: ${JSON.stringify(metrics)}`
  )
}

async function assertBusinessModuleStatusDropdownStyle(page, { scenarioName }) {
  await page
    .locator('.erp-business-filter-panel .erp-business-filter-control--status')
    .click()
  const popup = page.locator(
    '.erp-business-module-select-popup:not(.ant-select-dropdown-hidden)'
  )
  await popup.waitFor({ state: 'visible', timeout: 10_000 })
  await page.waitForTimeout(450)

  const metrics = await page.evaluate(() => {
    const readElement = (element) => {
      if (!element) return null
      const rect = element.getBoundingClientRect()
      const style = window.getComputedStyle(element)
      return {
        text: String(
          element.textContent || element.getAttribute('placeholder') || ''
        ).trim(),
        cursor: style.cursor,
        borderColor: style.borderTopColor,
        boxShadow: style.boxShadow,
        borderRadius: style.borderRadius,
        backgroundColor: style.backgroundColor,
        fontSize: style.fontSize,
        fontWeight: style.fontWeight,
        height: rect.height,
        width: rect.width,
        top: rect.top,
        bottom: rect.bottom,
        centerY: rect.top + rect.height / 2,
        left: rect.left,
        right: rect.right,
        clientHeight: element.clientHeight,
        clientWidth: element.clientWidth,
        scrollHeight: element.scrollHeight,
        scrollWidth: element.scrollWidth,
      }
    }

    const popupElement = document.querySelector(
      '.erp-business-module-select-popup:not(.ant-select-dropdown-hidden)'
    )
    const activeSelector = document.querySelector(
      '.erp-business-filter-panel .ant-select-open .ant-select-selector'
    )
    const activePlaceholder = document.querySelector(
      '.erp-business-filter-panel .ant-select-open .ant-select-selection-placeholder'
    )
    const internalSearchInput = document.querySelector(
      '.erp-business-filter-panel .ant-select-open .ant-select-selection-search-input'
    )
    const activeArrow = document.querySelector(
      '.erp-business-filter-panel .ant-select-open .ant-select-arrow'
    )
    return {
      viewportWidth: window.innerWidth,
      documentScrollWidth: document.documentElement.scrollWidth,
      activeSelector: readElement(activeSelector),
      activePlaceholder: readElement(activePlaceholder),
      internalSearchInput: readElement(internalSearchInput),
      activeArrow: readElement(activeArrow),
      popup: readElement(popupElement),
      options: Array.from(
        popupElement?.querySelectorAll('.ant-select-item-option') || []
      )
        .slice(0, 8)
        .map(readElement),
    }
  })

  assert(
    metrics.activeSelector &&
      metrics.activePlaceholder &&
      metrics.internalSearchInput &&
      metrics.activeArrow &&
      metrics.popup &&
      metrics.options.length > 0,
    `${scenarioName} 状态筛选下拉层缺少可检查节点: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    metrics.activeSelector.cursor,
    'pointer',
    `${scenarioName} 状态筛选控件 cursor 未统一为 pointer: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    metrics.internalSearchInput.cursor,
    'pointer',
    `${scenarioName} 状态筛选内部搜索 input cursor 未统一为 pointer: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    metrics.internalSearchInput.boxShadow,
    'none',
    `${scenarioName} 状态筛选内部搜索 input 暴露了浏览器焦点框: ${JSON.stringify(metrics)}`
  )
  assert(
    Math.abs(
      metrics.activePlaceholder.centerY - metrics.activeSelector.centerY
    ) <= 1,
    `${scenarioName} 状态筛选 placeholder 未上下居中: ${JSON.stringify(metrics)}`
  )
  assert(
    Math.abs(
      metrics.internalSearchInput.centerY - metrics.activeSelector.centerY
    ) <= 1,
    `${scenarioName} 状态筛选内部搜索 input 未上下居中: ${JSON.stringify(metrics)}`
  )
  assert(
    Math.abs(metrics.activeArrow.centerY - metrics.activeSelector.centerY) <= 1,
    `${scenarioName} 状态筛选箭头未上下居中: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.popup.top >= metrics.activeSelector.bottom - 2,
    `${scenarioName} 状态筛选下拉层不应向上遮挡前置筛选项: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.popup.width <= metrics.viewportWidth - 24 + 1,
    `${scenarioName} 状态筛选下拉层不应超过移动端视口: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.options.every(
      (option) =>
        option.cursor === 'pointer' &&
        option.clientHeight >= 34 &&
        option.clientHeight <= 42 &&
        option.fontSize === '14px'
    ),
    `${scenarioName} 状态筛选选项行尺寸或 cursor 不一致: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.documentScrollWidth <= metrics.viewportWidth + 1,
    `${scenarioName} 状态筛选展开后不应产生页面横向滚动: ${JSON.stringify(metrics)}`
  )
}

async function assertPaginationSizeChangerFocusStyle(page, { scenarioName }) {
  const sizeChanger = page
    .locator('.ant-pagination-options .ant-select')
    .first()
  await sizeChanger.waitFor({ state: 'visible', timeout: 10_000 })
  await sizeChanger.click()
  const popup = page.locator(
    '.ant-select-dropdown:not(.ant-select-dropdown-hidden)'
  )
  await popup.waitFor({ state: 'visible', timeout: 10_000 })
  await page.waitForTimeout(150)

  const metrics = await page.evaluate(() => {
    const readElement = (element) => {
      if (!element) return null
      const rect = element.getBoundingClientRect()
      const style = window.getComputedStyle(element)
      return {
        boxShadow: style.boxShadow,
        borderColor: style.borderTopColor,
        outlineStyle: style.outlineStyle,
        ringColor: style.getPropertyValue('--tw-ring-color').trim(),
        width: rect.width,
        height: rect.height,
        active: element === document.activeElement,
      }
    }
    const select = document.querySelector('.ant-pagination-options .ant-select')
    const selector = select?.querySelector('.ant-select-selector')
    const searchInput = select?.querySelector(
      '.ant-select-selection-search-input'
    )
    const dropdown = document.querySelector(
      '.ant-select-dropdown:not(.ant-select-dropdown-hidden)'
    )

    return {
      selector: readElement(selector),
      searchInput: readElement(searchInput),
      dropdown: readElement(dropdown),
    }
  })

  assert(
    metrics.selector && metrics.searchInput && metrics.dropdown,
    `${scenarioName} 分页条数选择器缺少可检查节点: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    metrics.searchInput.active,
    true,
    `${scenarioName} 分页条数选择器内部 input 未获得焦点，无法验证焦点态: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    metrics.searchInput.boxShadow,
    'none',
    `${scenarioName} 分页条数选择器内部 input 暴露了 Tailwind 蓝色焦点框: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    metrics.searchInput.outlineStyle,
    'none',
    `${scenarioName} 分页条数选择器内部 input 暴露了浏览器 outline: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.searchInput.ringColor === 'transparent' ||
      metrics.searchInput.ringColor === 'rgba(0, 0, 0, 0)',
    `${scenarioName} 分页条数选择器内部 input 未清理 Tailwind ring: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.dropdown.width >= metrics.selector.width,
    `${scenarioName} 分页条数下拉层宽度不应小于触发器: ${JSON.stringify(metrics)}`
  )

  await page.keyboard.press('Escape')
  await popup.waitFor({ state: 'hidden', timeout: 10_000 })
}

async function assertBusinessModuleCompactWorkspace(
  page,
  { scenarioName, expectSelectionAction = false }
) {
  const metrics = await page.evaluate(() => {
    const rectOf = (selector) => {
      const element = document.querySelector(selector)
      if (!element) return null
      const rect = element.getBoundingClientRect()
      const style = window.getComputedStyle(element)
      return {
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        width: rect.width,
        height: rect.height,
        display: style.display,
        gridTemplateColumns: style.gridTemplateColumns,
        overflowX: style.overflowX,
        overflowY: style.overflowY,
      }
    }

    const statTiles = Array.from(
      document.querySelectorAll('.erp-business-module-stats > div')
    ).map((tile) => {
      const rect = tile.getBoundingClientRect()
      return {
        text: tile.textContent?.replace(/\s+/g, ' ').trim() || '',
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      }
    })
    const summaryText =
      document
        .querySelector('.erp-business-module-hero__footer')
        ?.textContent?.replace(/\s+/g, ' ')
        .trim() || ''
    const filterSummaryText =
      document
        .querySelector('.erp-business-filter-panel__summary')
        ?.textContent?.replace(/\s+/g, ' ')
        .trim() || ''

    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      pageHead: rectOf('.erp-admin-page-head'),
      hero: rectOf('.erp-business-module-hero'),
      heroGrid: rectOf('.erp-business-module-hero__grid'),
      toolbar: rectOf('.erp-business-module-toolbar'),
      tableCard: rectOf('.erp-business-module-table-card'),
      taskCard: rectOf('.erp-business-module-task-card'),
      currentAction: rectOf('.erp-business-module-current-action'),
      filters: rectOf('.erp-business-module-toolbar__filters'),
      actions: rectOf('.erp-business-module-toolbar__actions'),
      statTiles,
      summaryText,
      filterSummaryText,
    }
  })

  assert(
    metrics.hero,
    `${scenarioName} 缺少业务页头部: ${JSON.stringify(metrics)}`
  )
  assert(
    !metrics.pageHead,
    `${scenarioName} 业务页不应再显示通用页面说明区: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.heroGrid?.gridTemplateColumns?.split(' ').filter(Boolean).length >=
      2,
    `${scenarioName} 桌面头部未保持当前 ERP 左文案右统计布局: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    metrics.statTiles.length,
    3,
    `${scenarioName} 主统计卡应只保留总记录/当前结果/已选记录三项: ${JSON.stringify(metrics)}`
  )
  assert(
    !/(?:金额合计|数量合计)/.test(metrics.summaryText),
    `${scenarioName} 头部摘要不应重复展示金额/数量合计: ${JSON.stringify(metrics)}`
  )
  assert(
    /(?:金额合计|数量合计)/.test(metrics.filterSummaryText),
    `${scenarioName} 金额/数量合计应只保留在筛选工具卡摘要区: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.hero.height <= 300,
    `${scenarioName} 业务页头部过高，挤占表格和协同任务池空间: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.toolbar?.height <= 240,
    `${scenarioName} 工具栏高度未保持当前 ERP 双行工作台范围: ${JSON.stringify(metrics)}`
  )
  const workspaceTopSpan =
    metrics.hero && metrics.tableCard
      ? metrics.tableCard.top - metrics.hero.top
      : Number.POSITIVE_INFINITY
  const taskCardVisible =
    metrics.taskCard &&
    metrics.taskCard.width > 0 &&
    metrics.taskCard.top <= metrics.viewport.height + 20
  assert(
    workspaceTopSpan <= 560,
    `${scenarioName} 业务页头部到表格起点未保持当前 ERP 工作台范围: ${JSON.stringify(metrics)}`
  )
  if (expectSelectionAction) {
    assert(
      metrics.currentAction?.top > metrics.filters?.top &&
        metrics.currentAction?.top > metrics.actions?.top,
      `${scenarioName} 当前操作区未位于筛选和主按钮下方: ${JSON.stringify(metrics)}`
    )
  } else {
    assert(
      !metrics.currentAction,
      `${scenarioName} 未选中时不应渲染当前操作区: ${JSON.stringify(metrics)}`
    )
  }
  assert(
    taskCardVisible,
    `${scenarioName} 协同任务池未在首屏边界内出现: ${JSON.stringify(metrics)}`
  )
}

async function assertDocsArticleReadable(page) {
  const metrics = await page.evaluate(() => {
    const article = document.querySelector('.erp-docs-article')
    const paragraph = article?.querySelector('p')
    const listItem = article?.querySelector('li')
    const link = article?.querySelector('a')
    const inlineCode = article?.querySelector('code')

    const parseColor = (value) => {
      if (!value) return null
      const match = value.match(/\d+(\.\d+)?/g)
      if (!match || match.length < 3) return null
      const [r, g, b, a] = match.map(Number)
      return { r, g, b, a: Number.isFinite(a) ? a : 1 }
    }

    const toLinear = (channel) => {
      const normalized = channel / 255
      if (normalized <= 0.03928) {
        return normalized / 12.92
      }
      return ((normalized + 0.055) / 1.055) ** 2.4
    }

    const luminance = (color) => {
      if (!color) return 0
      return (
        0.2126 * toLinear(color.r) +
        0.7152 * toLinear(color.g) +
        0.0722 * toLinear(color.b)
      )
    }

    const resolveBackground = (element) => {
      let current = element
      while (current && current !== document.documentElement) {
        const background = parseColor(getComputedStyle(current).backgroundColor)
        if (background && background.a > 0) {
          return background
        }
        current = current.parentElement
      }
      return { r: 255, g: 255, b: 255, a: 1 }
    }

    const describe = (element) => {
      if (!element) return null
      const style = getComputedStyle(element)
      const color = parseColor(style.color)
      const background = resolveBackground(element)
      const contrast =
        (Math.max(luminance(color), luminance(background)) + 0.05) /
        (Math.min(luminance(color), luminance(background)) + 0.05)

      return {
        text: element.textContent?.trim().slice(0, 80) || '',
        color: style.color,
        background: `rgb(${background.r}, ${background.g}, ${background.b})`,
        contrast: Number(contrast.toFixed(2)),
      }
    }

    return {
      paragraph: describe(paragraph),
      listItem: describe(listItem),
      link: describe(link),
      inlineCode: describe(inlineCode),
    }
  })

  for (const [name, item] of Object.entries(metrics)) {
    if (name === 'link' && !item) {
      continue
    }
    assert(item, `文档页缺少 ${name} 节点: ${JSON.stringify(metrics)}`)
    assert(
      item.contrast >= 4.5,
      `文档页 ${name} 对比度不足: ${JSON.stringify(item)}`
    )
  }
}

function createMockAdminToken() {
  const header = encodeBase64URL({ alg: 'none', typ: 'JWT' })
  const payload = encodeBase64URL({
    uid: 1,
    uname: 'style-l1-admin',
    role: 1,
    exp: Math.floor(Date.now() / 1000) + 3600,
  })
  return `${header}.${payload}.stylel1`
}

function encodeBase64URL(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function isIgnorableDevServerError(text) {
  return (
    text.includes('Outdated Request') ||
    text.includes('[hmr] Failed to reload') ||
    text.includes('net::ERR_CONNECTION_REFUSED')
  )
}

async function assertNoHorizontalOverflow(page, scenarioName) {
  const metrics = await page.evaluate(() => ({
    bodyScrollWidth: document.body.scrollWidth,
    docScrollWidth: document.documentElement.scrollWidth,
    viewportWidth: window.innerWidth,
  }))

  assert(
    metrics.bodyScrollWidth <= metrics.viewportWidth + 2,
    `${scenarioName} body 出现横向溢出: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.docScrollWidth <= metrics.viewportWidth + 2,
    `${scenarioName} document 出现横向溢出: ${JSON.stringify(metrics)}`
  )
}

async function assertRowSelectionClearsAfterCancel(
  page,
  { dataRowSelector, selectedRowSelector, counterLabel }
) {
  const rows = page.locator(dataRowSelector)
  const rowCountBefore = await readLineCounter(page, counterLabel)

  assert(rowCountBefore > 0, `未找到可用明细计数: ${counterLabel}`)
  assert(await rows.count(), `未找到可选明细行: ${dataRowSelector}`)

  await page.getByRole('button', { name: '选择明细行' }).click()
  await rows.first().click()

  assert.equal(
    await page.locator(selectedRowSelector).count(),
    1,
    `进入选择模式后应只有 1 行高亮: ${selectedRowSelector}`
  )

  await page.getByRole('button', { name: '下插一行' }).click()

  assert.equal(
    await readLineCounter(page, counterLabel),
    rowCountBefore + 1,
    '插入空白行后明细行数应增加 1'
  )
  assert.equal(
    await page.locator(selectedRowSelector).count(),
    1,
    `插入空白行后应仍只有 1 行高亮: ${selectedRowSelector}`
  )

  await page.getByRole('button', { name: '取消选择' }).click()

  assert.equal(
    await page.locator(selectedRowSelector).count(),
    0,
    `取消选择后不应残留高亮行: ${selectedRowSelector}`
  )
  await assertButtonDisabled(page, '上插一行')
  await assertButtonDisabled(page, '下插一行')
  await assertButtonDisabled(page, '删除当前行')
}

async function assertButtonDisabled(page, name) {
  const button = page.getByRole('button', { name })
  assert(await button.isDisabled(), `按钮应为禁用状态: ${name}`)
}

async function readLineCounter(page, label) {
  const counter = page.locator('.erp-print-shell__counter')
  const text = (await counter.textContent()) || ''
  const match = text.match(new RegExp(`${label}:\\s*(\\d+)\\/300`))

  assert(match, `未找到 ${label} 计数: ${text}`)
  return Number(match[1])
}

function tailLogs(text) {
  return text.trim().split('\n').slice(-20).join('\n')
}

await main()
