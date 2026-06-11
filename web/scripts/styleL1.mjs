import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import net from 'node:net'
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
const baseURL = externalBaseURL || `http://localhost:${devServerPort}`
const headless = process.env.HEADED !== '1'
const scenarioFilter = new Set(
  String(process.env.STYLE_L1_SCENARIOS || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
)
const scenarioMaxAttempts = 2

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
    mockAdminRpc: true,
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await expectHeading(page, '毛绒 ERP 管理后台')
      await expectButton(page, /^登\s*录$/)
      await expectText(page, '毛绒玩具 ERP')
      await assertAdminLoginLayout(page, { minCardWidth: 520 })
    },
  },
  {
    name: 'root-redirect-mobile',
    path: '/',
    mockAdminRpc: true,
    viewport: { width: 390, height: 844 },
    verify: async (page) => {
      await expectHeading(page, '毛绒 ERP 管理后台')
      await expectButton(page, /^登\s*录$/)
      await expectText(page, '毛绒玩具 ERP')
      await assertAdminLoginLayout(page, { minCardWidth: 320 })
    },
  },
  {
    name: 'admin-login-mobile',
    path: '/admin-login',
    mockAdminRpc: true,
    viewport: { width: 390, height: 844 },
    verify: async (page) => {
      await expectText(page, '毛绒 ERP 管理后台')
      await expectButton(page, /^登\s*录$/)
      await expectText(page, '毛绒玩具 ERP')
      await assertAdminLoginLayout(page, { minCardWidth: 320 })
    },
  },
  {
    name: 'admin-login-theme-modes-desktop',
    path: '/admin-login',
    mockAdminRpc: true,
    viewport: { width: 1280, height: 800 },
    verify: async (page) => {
      await expectText(page, '毛绒 ERP 管理后台')
      await assertERPThemeMode(page, {
        scenarioName: 'admin-login-theme-modes-desktop',
        expectedMode: 'system',
        expectedEffectiveTheme: 'light',
      })
      await clickERPThemeOption(page, '暗色')
      await assertERPThemeMode(page, {
        scenarioName: 'admin-login-theme-modes-desktop',
        expectedMode: 'dark',
        expectedEffectiveTheme: 'dark',
      })
      await assertThemeReadable(page, {
        scenarioName: 'admin-login-theme-modes-desktop',
        selector: '.erp-login-card',
      })
      await assertLoginSegmentedReadable(page, {
        scenarioName: 'admin-login-theme-modes-desktop',
      })
      await page.evaluate(() => {
        window.localStorage.setItem('plush_erp_theme_mode', 'light')
        window.dispatchEvent(new Event('focus'))
      })
      await page.waitForFunction(
        () => document.documentElement.dataset.erpThemeMode === 'light',
        null,
        { timeout: 10_000 }
      )
      await assertERPThemeMode(page, {
        scenarioName: 'admin-login-theme-modes-desktop-storage-sync',
        expectedMode: 'light',
        expectedEffectiveTheme: 'light',
      })
      await clickERPThemeOption(page, '暗色')
      await page.reload({ waitUntil: 'domcontentloaded' })
      await expectText(page, '毛绒 ERP 管理后台')
      await assertERPThemeMode(page, {
        scenarioName: 'admin-login-theme-modes-desktop',
        expectedMode: 'dark',
        expectedEffectiveTheme: 'dark',
      })
      await clickERPThemeOption(page, '跟系统')
      await assertERPThemeMode(page, {
        scenarioName: 'admin-login-theme-modes-desktop',
        expectedMode: 'system',
        expectedEffectiveTheme: 'light',
      })
    },
  },
  {
    name: 'admin-login-mobile-source-desktop-choice',
    path: '/m/sales/tasks',
    expectPath: '/admin-login',
    mockAdminRpc: true,
    viewport: { width: 1280, height: 800 },
    verify: async (page) => {
      await expectText(page, '毛绒 ERP 管理后台')
      await page.getByText('后台管理', { exact: true }).click()
      await page.getByLabel('管理员账号').fill('style-l1-admin')
      await page.locator('#password').fill('style-l1-password')
      await page.getByRole('button', { name: /^登\s*录$/ }).click()
      await waitForPath(page, '/erp/dashboard')
      await expectHeading(page, '后台首页 / 工作台')

      const rememberedEntry = await page.evaluate(() =>
        window.localStorage.getItem('erp:last_entry_target')
      )
      assert.equal(
        rememberedEntry,
        'desktop',
        '从任务端来源手动选择后台登录后，应记住后台入口'
      )
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
      await expectButton(page, /^登\s*录$/)
      await assertAdminLoginLayout(page, { minCardWidth: 520 })
    },
  },
  {
    name: 'erp-dashboard-desktop',
    path: '/erp/dashboard',
    auth: 'admin',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await expectText(page, '毛绒玩具 ERP')
      await expectText(page, '超级管理员')
      await expectText(page, 'style-l1-admin')
      await expectText(page, '看板中心')
      await expectHeading(page, '后台首页 / 工作台')
      await expectText(page, '今天先处理协同卡点')
      await expectText(page, '今日焦点')
      await expectText(page, '业务状态摘要')
      await expectText(page, '常用入口')
      await expectText(page, '角色提醒')
      await expectText(page, '运营工具')
      await expectButton(page, '看全部任务')
      await assertShellRefreshButton(page, {
        scenarioName: 'erp-dashboard-desktop',
        expectVisible: true,
      })
      await page.getByRole('button', { name: '看全部任务' }).click()
      await waitForPath(page, '/erp/task-board')
      await expectHeading(page, '任务看板')
      await page.goBack()
      await waitForPath(page, '/erp/dashboard')
      await expectHeading(page, '后台首页 / 工作台')
      await page.getByRole('button', { name: '异常 / 阻塞闭环' }).last().click()
      await waitForPath(page, '/erp/operations/exceptions')
      await expectHeading(page, '异常 / 阻塞闭环')
      await page.goBack()
      await waitForPath(page, '/erp/dashboard')
      await expectHeading(page, '后台首页 / 工作台')
    },
  },
  {
    name: 'erp-task-board-desktop',
    path: '/erp/task-board',
    auth: 'admin',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await expectText(page, '毛绒玩具 ERP')
      await expectText(page, '超级管理员')
      await expectText(page, 'style-l1-admin')
      await expectText(page, '看板中心')
      await expectHeading(page, '任务看板')
      await expectText(page, '本页待办')
      await expectText(page, '阻塞异常')
      await expectText(page, '今日到期')
      await expectText(page, '任务处理明细')
      await expectButton(page, '看业务状态')
      await assertDashboardTaskBoardLayout(page, {
        scenarioName: 'erp-dashboard-desktop',
      })
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
      await page.getByRole('button', { name: /刷新任务/ }).click()
      await expectText(page, '看板跳转测试任务')
      await page
        .getByPlaceholder('搜索任务、单号、来源、阻塞原因')
        .fill('OUT-DASH-NAV')
      await page.getByText('全部角色').click()
      await page.getByTitle('仓库', { exact: true }).click()
      await page.reload({ waitUntil: 'domcontentloaded' })
      await waitForPath(page, '/erp/task-board')
      assert.match(
        page.url(),
        /[?&]q=OUT-DASH-NAV(?:&|$)/,
        '任务看板关键词筛选应写入 URL'
      )
      assert.match(
        page.url(),
        /[?&]role=warehouse(?:&|$)/,
        '任务看板角色筛选应写入 URL'
      )
      await expectText(page, '看板跳转测试任务')
      const restoredKeyword = await page
        .getByPlaceholder('搜索任务、单号、来源、阻塞原因')
        .inputValue()
      assert.equal(restoredKeyword, 'OUT-DASH-NAV')
      const clearFiltersButton = page.getByRole('button', { name: '清空筛选' })
      assert.equal(
        await clearFiltersButton.isEnabled(),
        true,
        '任务看板存在 URL 筛选时清空按钮应可用'
      )
      await clearFiltersButton.click()
      assert.doesNotMatch(
        page.url(),
        /[?&](q|role)=/,
        '清空筛选后应移除任务看板 URL 筛选参数'
      )
      await page.waitForFunction(
        () =>
          document.querySelector(
            'input[placeholder="搜索任务、单号、来源、阻塞原因"]'
          )?.value === ''
      )
      const clearedKeyword = await page
        .getByPlaceholder('搜索任务、单号、来源、阻塞原因')
        .inputValue()
      assert.equal(clearedKeyword, '')
      assert.equal(
        await clearFiltersButton.isDisabled(),
        true,
        '任务看板回到默认筛选后清空按钮应禁用'
      )
      await page
        .getByRole('button', { name: '看板跳转测试任务', exact: true })
        .click()
      await waitForPath(page, '/erp/warehouse/shipping-release')
      await expectText(page, '待出货/出货放行')
      await page.goBack()
      await waitForPath(page, '/erp/task-board')
      await expectHeading(page, '任务看板')
    },
  },
  {
    name: 'erp-exception-flow-desktop',
    path: '/erp/operations/exceptions',
    auth: 'admin',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await expectText(page, '毛绒玩具 ERP')
      await expectText(page, '超级管理员')
      await expectText(page, '运营工具')
      await expectHeading(page, '异常 / 阻塞闭环')
      await expectText(page, '阻塞记录')
      await expectText(page, '责任分派')
      await expectText(page, '处理跟进')
      await expectText(page, '验证恢复')
      await expectText(page, '关闭归档')
      await expectText(page, '闭环队列')
      await expectButton(page, '回任务看板')
      await page.getByRole('button', { name: '回任务看板' }).click()
      await waitForPath(page, '/erp/task-board')
      await expectHeading(page, '任务看板')
    },
  },
  {
    name: 'erp-business-dashboard-desktop',
    path: '/erp/business-dashboard',
    auth: 'admin',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await expectText(page, '毛绒玩具 ERP')
      await expectText(page, '超级管理员')
      await expectText(page, '看板中心')
      await expectHeading(page, '按业务模块看运行状态，不把摘要当事实真源')
      await expectText(page, '业务记录总数')
      await expectText(page, '业务关注统计')
      await expectText(page, '严重预警数')
      await expectText(page, '一般预警数')
      await expectText(page, '计划物控关注事项')
      await expectText(page, '业务状态分布')
      await expectText(page, '模块健康明细')
      await expectText(page, '记录数')
      await expectButton(page, '去任务看板')
      await assertShellRefreshButton(page, {
        scenarioName: 'erp-business-dashboard-desktop',
        expectVisible: true,
      })
      await page.getByRole('button', { name: '去任务看板' }).click()
      await waitForPath(page, '/erp/task-board')
      await expectHeading(page, '任务看板')
      await page.goBack()
      await waitForPath(page, '/erp/business-dashboard')
      await expectHeading(page, '按业务模块看运行状态，不把摘要当事实真源')
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
      await expectText(page, '后台首页 / 工作台')
      await expectText(page, '今天先处理协同卡点')
      await expectText(page, '今日焦点')
      await expectText(page, '业务状态摘要')
      await expectText(page, '运营工具')
    },
  },
  {
    name: 'erp-task-board-mobile',
    path: '/erp/task-board',
    auth: 'admin',
    viewport: { width: 390, height: 844 },
    verify: async (page) => {
      await expectText(page, '超级管理员')
      await expectText(page, '毛绒 ERP 管理后台')
      await expectText(page, '任务看板')
      await expectText(page, '本页待办')
      await expectText(page, '今日到期')
      await expectText(page, '任务处理明细')
    },
  },
  {
    name: 'erp-dashboard-dark-desktop',
    path: '/erp/dashboard',
    auth: 'admin',
    themeMode: 'dark',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await expectText(page, '毛绒 ERP 管理后台')
      await expectText(page, '后台首页 / 工作台')
      await expectText(page, '今日焦点')
      await expectText(page, '业务状态摘要')
      await assertERPThemeMode(page, {
        scenarioName: 'erp-dashboard-dark-desktop',
        expectedMode: 'dark',
        expectedEffectiveTheme: 'dark',
      })
      await assertThemeReadable(page, {
        scenarioName: 'erp-dashboard-dark-desktop',
        selector: '.erp-admin-header',
      })
      await assertThemeReadable(page, {
        scenarioName: 'erp-dashboard-dark-desktop',
        selector: '.erp-dashboard-card',
      })
      await assertDarkThemeContrast(page, {
        scenarioName: 'erp-dashboard-dark-desktop',
        selector: '.erp-admin-shell',
      })
    },
  },
  {
    name: 'erp-task-board-dark-wide-desktop',
    path: '/erp/task-board',
    auth: 'admin',
    themeMode: 'dark',
    viewport: { width: 2048, height: 1024 },
    verify: async (page) => {
      await expectText(page, '毛绒 ERP 管理后台')
      await expectText(page, '任务看板')
      await expectText(page, '本页待办')
      await page.evaluate(async () => {
        const response = await fetch('/rpc/workflow', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 'dashboard-wide-layout-task',
            method: 'create_task',
            params: {
              task_code: 'style-l1-dashboard-wide-layout',
              task_group: 'shipment_release',
              task_name: '宽屏重叠回归任务',
              source_type: 'shipping-release',
              source_id: 9020,
              source_no: 'OUT-DASH-WIDE-LAYOUT',
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
      await page.getByRole('button', { name: /刷新任务/ }).click()
      await expectText(page, '宽屏重叠回归任务')
      await assertERPThemeMode(page, {
        scenarioName: 'erp-task-board-dark-wide-desktop',
        expectedMode: 'dark',
        expectedEffectiveTheme: 'dark',
      })
      await page.locator('.erp-dashboard-table-card').scrollIntoViewIfNeeded()
      await assertDashboardTaskBoardLayout(page, {
        scenarioName: 'erp-task-board-dark-wide-desktop',
      })
      await assertDarkThemeContrast(page, {
        scenarioName: 'erp-task-board-dark-wide-desktop',
        selector: '.erp-admin-shell',
      })
    },
  },
  {
    name: 'business-module-dark-products-modal-desktop',
    path: '/erp/master/products',
    auth: 'admin',
    themeMode: 'dark',
    viewport: { width: 2048, height: 1024 },
    verify: async (page) => {
      await expectHeading(page, '产品')
      await expectText(page, '导出当前结果')
      await expectText(page, 'ARCH-PROD-001')
      await expectText(page, '本页协同入口')
      await assertBusinessArchiveReadonlyToolbar(page, {
        scenarioName: 'business-module-dark-products-modal-desktop',
      })
      await assertBusinessCollaborationPanelCollapsedByDefault(page, {
        scenarioName: 'business-module-dark-products-modal-desktop',
      })
      await assertAntdTableHeaderTextFlow(page, {
        scenarioName: 'business-module-dark-products-table-header',
      })
      await assertERPThemeMode(page, {
        scenarioName: 'business-module-dark-products-modal-desktop',
        expectedMode: 'dark',
        expectedEffectiveTheme: 'dark',
      })
      await assertDarkThemeContrast(page, {
        scenarioName: 'business-module-dark-products-modal-desktop',
        selector: '.erp-business-page-layout',
      })
      await assertDarkThemeNeutralInteractions(page, {
        scenarioName: 'business-module-dark-products-modal-desktop',
      })
      await openBusinessArchiveRecordModal(page, {
        scenarioName: 'business-module-dark-products-modal-desktop',
        recordText: 'ARCH-PROD-001',
      })
      await assertBusinessRecordModalLayout(page, {
        scenarioName: 'business-module-dark-products-modal',
        minModalWidth: 1200,
        expectCompactGrid: false,
        expectDarkChrome: true,
      })
      await assertAntdFormLabelTextFlow(page, {
        scenarioName: 'business-module-dark-products-modal-label',
        rootSelector: '.erp-business-record-modal',
      })
    },
  },
  {
    name: 'business-module-dark-customers-desktop',
    path: '/erp/master/partners/customers',
    auth: 'admin',
    themeMode: 'dark',
    viewport: { width: 2048, height: 1024 },
    verify: async (page) => {
      await expectHeading(page, '客户档案')
      await expectText(page, '正式 MasterData')
      await expectText(page, '当前操作')
      await expectText(page, '当前联系人')
      await expectText(page, '新建主体')
      await assertERPThemeMode(page, {
        scenarioName: 'business-module-dark-customers-desktop',
        expectedMode: 'dark',
        expectedEffectiveTheme: 'dark',
      })
      await assertDarkThemeContrast(page, {
        scenarioName: 'business-module-dark-customers-desktop',
        selector: '.erp-business-page-layout',
      })
      await assertDarkThemeNeutralInteractions(page, {
        scenarioName: 'business-module-dark-customers-desktop',
        checks: [
          {
            label: '主数据搜索输入 hover',
            selector: '.erp-business-page-layout .erp-business-filter-control',
            action: 'hover',
          },
          {
            label: '主数据搜索输入 focus',
            selector: '.erp-business-page-layout .erp-business-filter-control',
            action: 'click',
          },
          {
            label: '主数据普通按钮 hover',
            selector:
              '.erp-business-page-layout .ant-btn:not(.ant-btn-primary)',
            action: 'hover',
          },
          {
            label: '主数据表头 hover',
            selector: '.erp-business-page-layout .ant-table-thead > tr > th',
            action: 'hover',
            index: 1,
          },
        ],
      })
    },
  },
  {
    name: 'mobile-tasks-dark',
    path: '/m/sales/tasks',
    auth: 'admin',
    themeMode: 'dark',
    viewport: { width: 390, height: 844 },
    verify: async (page) => {
      await page.evaluate(async () => {
        const createTask = async (params) =>
          fetch('/rpc/workflow', {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: params.task_code,
              method: 'create_task',
              params,
            }),
          })

        const bulkTasks = [
          ...Array.from({ length: 30 }, (_, index) => ({
            task_code: `STYLE-L1-MOBILE-BULK-${String(index + 1).padStart(2, '0')}`,
            task_group: 'project-orders',
            task_name: `批量待办任务 ${index + 1}`,
            source_type: 'project-orders',
            source_id: 9100 + index,
            source_no: `STYLE-L1-BULK-${String(index + 1).padStart(2, '0')}`,
            business_status_key: 'project_pending',
            task_status_key: 'ready',
            owner_role_key: 'sales',
            priority: 1,
            payload: {
              customer_name: `批量客户 ${index + 1}`,
              style_no: `BULK-${index + 1}`,
              due_date: '2026-06-08',
            },
          })),
          ...Array.from({ length: 30 }, (_, index) => ({
            task_code: `STYLE-L1-MOBILE-WARN-${String(index + 1).padStart(2, '0')}`,
            task_group: 'project-orders',
            task_name: `批量预警任务 ${index + 1}`,
            source_type: 'project-orders',
            source_id: 9300 + index,
            source_no: `STYLE-L1-WARN-${String(index + 1).padStart(2, '0')}`,
            business_status_key: 'project_pending',
            task_status_key: 'blocked',
            owner_role_key: 'sales',
            priority: 3,
            blocked_reason: `批量阻塞原因 ${index + 1}`,
            payload: {
              critical_path: true,
              customer_name: `预警客户 ${index + 1}`,
              style_no: `WARN-${index + 1}`,
              due_date: '2026-06-07',
            },
          })),
          ...Array.from({ length: 30 }, (_, index) => ({
            task_code: `STYLE-L1-MOBILE-DONE-${String(index + 1).padStart(2, '0')}`,
            task_group: 'project-orders',
            task_name: `批量已办任务 ${index + 1}`,
            source_type: 'project-orders',
            source_id: 9500 + index,
            source_no: `STYLE-L1-DONE-${String(index + 1).padStart(2, '0')}`,
            business_status_key: 'project_pending',
            task_status_key: 'done',
            owner_role_key: 'sales',
            priority: 1,
            payload: {
              customer_name: `已办客户 ${index + 1}`,
              style_no: `DONE-${index + 1}`,
            },
          })),
          ...Array.from({ length: 30 }, (_, index) => ({
            task_code: `STYLE-L1-MOBILE-BOSS-DONE-${String(index + 1).padStart(2, '0')}`,
            task_group: 'boss-review',
            task_name: `批量老板已办任务 ${index + 1}`,
            source_type: 'project-orders',
            source_id: 9800 + index,
            source_no: `STYLE-L1-BOSS-DONE-${String(index + 1).padStart(2, '0')}`,
            business_status_key: 'project_pending',
            task_status_key: 'done',
            owner_role_key: 'boss',
            priority: 1,
            payload: {
              customer_name: `老板已办客户 ${index + 1}`,
              style_no: `BOSS-DONE-${index + 1}`,
            },
          })),
          {
            task_code: 'STYLE-L1-MOBILE-PROCESSING-001',
            task_group: 'project-orders',
            task_name: '批量处理中任务',
            source_type: 'project-orders',
            source_id: 9701,
            source_no: 'STYLE-L1-PROCESSING-001',
            business_status_key: 'project_pending',
            task_status_key: 'processing',
            owner_role_key: 'sales',
            priority: 1,
            payload: {
              customer_name: '处理中客户',
              style_no: 'PROCESSING-1',
              due_date: '2026-06-09',
            },
          },
          {
            task_code: 'STYLE-L1-MOBILE-OVERDUE-001',
            task_group: 'project-orders',
            task_name: '批量超时任务',
            source_type: 'project-orders',
            source_id: 9702,
            source_no: 'STYLE-L1-OVERDUE-001',
            business_status_key: 'project_pending',
            task_status_key: 'ready',
            owner_role_key: 'sales',
            priority: 1,
            due_at: 1780272000,
            payload: {
              customer_name: '超时客户',
              style_no: 'OVERDUE-1',
              due_date: '2026-06-01',
            },
          },
        ]

        await Promise.all(bulkTasks.map((params) => createTask(params)))
        await createTask({
          task_code: 'STYLE-L1-MOBILE-DARK-001',
          task_group: 'project-orders',
          task_name: '暗色任务验证',
          source_type: 'project-orders',
          source_id: 9001,
          source_no: 'STYLE-L1-MOBILE-DARK-001',
          business_status_key: 'project_pending',
          task_status_key: 'blocked',
          owner_role_key: 'sales',
          priority: 3,
          blocked_reason: '暗色模式阻塞原因回显',
          payload: {
            critical_path: true,
            customer_name: '暗色客户',
            style_no: '深色测试款',
            due_date: '2026-06-06',
          },
        })
      })
      await page.reload({ waitUntil: 'domcontentloaded' })
      await expectText(page, '待办')
      await expectText(page, '暗色任务验证')
      await expectText(page, '阻塞原因')
      await assertERPThemeMode(page, {
        scenarioName: 'mobile-tasks-dark',
        expectedMode: 'dark',
        expectedEffectiveTheme: 'dark',
      })
      await assertThemeReadable(page, {
        scenarioName: 'mobile-tasks-dark',
        selector: '.mobile-app-layout .surface-panel',
      })
      await assertThemeReadable(page, {
        scenarioName: 'mobile-tasks-dark',
        selector: '.erp-mobile-list-item',
      })
      await assertDarkThemeContrast(page, {
        scenarioName: 'mobile-tasks-dark',
        selector: '.mobile-app-layout',
      })
      await assertMobileTaskMainNavigation(page, {
        scenarioName: 'mobile-tasks-dark',
      })
      await assertMobileTaskRefreshFeedback(page, {
        scenarioName: 'mobile-tasks-dark',
      })
      await assertMobileTaskDarkDetailReadable(page, {
        scenarioName: 'mobile-tasks-dark',
      })
      await assertMobileTaskBossDoneList(page, {
        scenarioName: 'mobile-tasks-dark',
      })
    },
  },
  {
    name: 'mobile-tasks-browser-back-stays-mobile',
    path: '/erp/dashboard',
    auth: 'admin',
    viewport: { width: 390, height: 844 },
    verify: async (page) => {
      await expectHeading(page, '后台首页 / 工作台')
      await gotoScenarioPath(page, '/m/sales/tasks', {
        waitUntil: 'domcontentloaded',
      })
      await waitForPath(page, '/m/sales/tasks')
      await expectText(page, '待办')
      await expectText(page, '任务')

      await page.goBack()
      await waitForPath(page, '/m/sales/tasks')
      await page.waitForFunction(
        () =>
          Boolean(document.querySelector('.mobile-role-tasks-page')) &&
          !document.querySelector('.erp-admin-sider'),
        null,
        { timeout: 10_000 }
      )
      await expectText(page, '待办')
      const metrics = await page.evaluate(() => ({
        path: window.location.pathname,
        hasDesktopShell: Boolean(document.querySelector('.erp-admin-sider')),
        hasMobileShell: Boolean(
          document.querySelector('.mobile-role-tasks-page')
        ),
        heading:
          document
            .querySelector('.mobile-role-tasks-page h1')
            ?.textContent?.trim() || '',
      }))

      assert.equal(
        metrics.path,
        '/m/sales/tasks',
        `浏览器后退不应离开岗位任务端: ${JSON.stringify(metrics)}`
      )
      assert.equal(
        metrics.hasDesktopShell,
        false,
        `浏览器后退不应渲染桌面后台壳层: ${JSON.stringify(metrics)}`
      )
      assert.equal(
        metrics.hasMobileShell,
        true,
        `浏览器后退后应保持移动任务页壳层: ${JSON.stringify(metrics)}`
      )
      assert.equal(
        metrics.heading,
        '待办',
        `浏览器后退后应保持移动任务页默认分区: ${JSON.stringify(metrics)}`
      )
    },
  },
  {
    name: 'dev-docs-dark-desktop',
    path: '/__dev/docs',
    themeMode: 'dark',
    viewport: { width: 1536, height: 900 },
    verify: async (page) => {
      await page.evaluate(() => {
        window.localStorage.removeItem('plush_erp_dev_docs_expanded_dirs')
        window.localStorage.setItem(
          'plush_erp_dev_docs_selected_path',
          'docs/product/implementation-governance.md'
        )
      })
      await page.reload({ waitUntil: 'domcontentloaded' })
      await expectHeading(page, '开发文档查看器 / Dev Docs Viewer')
      await expectText(page, '目录树 / Directory Tree')
      await expectText(page, '模块实施治理 / Implementation Governance')
      await expectText(page, '标准闭环图 / Standard Delivery Gate Diagram')
      await page
        .locator('.erp-markdown-mermaid[data-mermaid-status="rendered"] svg')
        .first()
        .waitFor({ state: 'visible', timeout: 12000 })
      const mermaidMetrics = await page.evaluate(() => {
        const diagram = document.querySelector(
          '.erp-markdown-mermaid[data-mermaid-status="rendered"] svg'
        )
        const sourceBlocks = [...document.querySelectorAll('pre code')].filter(
          (node) => node.textContent.includes('flowchart LR')
        )
        const diagramRect = diagram?.getBoundingClientRect()
        const containerRect = document
          .querySelector('.erp-markdown-mermaid')
          ?.getBoundingClientRect()
        return {
          rendered: Boolean(diagram),
          width: diagramRect?.width || 0,
          height: diagramRect?.height || 0,
          containerWidth: containerRect?.width || 0,
          sourceBlockCount: sourceBlocks.length,
        }
      })
      assert.equal(
        mermaidMetrics.rendered,
        true,
        `Mermaid 图表应渲染为 SVG: ${JSON.stringify(mermaidMetrics)}`
      )
      assert.ok(
        mermaidMetrics.width > 240 && mermaidMetrics.height > 80,
        `Mermaid SVG 应有稳定可见尺寸: ${JSON.stringify(mermaidMetrics)}`
      )
      assert.equal(
        mermaidMetrics.sourceBlockCount,
        0,
        `Mermaid 源码块不应继续作为普通代码块展示: ${JSON.stringify(
          mermaidMetrics
        )}`
      )
      const productDir = page.locator('[data-dev-doc-dir="docs/product"]')
      const warehouseDir = page.locator('[data-dev-doc-dir="docs/warehouse"]')
      assert.equal(
        await productDir.getAttribute('aria-expanded'),
        'false',
        '产品文档目录默认不应展开'
      )
      assert.equal(
        await warehouseDir.getAttribute('aria-expanded'),
        'false',
        '仓库文档目录默认不应展开'
      )
      await productDir.click()
      await warehouseDir.click()
      assert.equal(
        await productDir.getAttribute('aria-expanded'),
        'true',
        '点击后产品文档目录应展开'
      )
      assert.equal(
        await warehouseDir.getAttribute('aria-expanded'),
        'true',
        '点击后仓库文档目录应展开'
      )
      await page.reload({ waitUntil: 'domcontentloaded' })
      await expectHeading(page, '开发文档查看器 / Dev Docs Viewer')
      assert.equal(
        await productDir.getAttribute('aria-expanded'),
        'true',
        '刷新后产品文档目录应保持展开'
      )
      assert.equal(
        await warehouseDir.getAttribute('aria-expanded'),
        'true',
        '刷新后仓库文档目录应保持展开'
      )
      assert.equal(
        await page
          .locator('[data-dev-doc-key="docs-product-test-strategy-md"]')
          .count(),
        1,
        '刷新后产品目录内文档应保持可见'
      )
      assert.equal(
        await page
          .locator('[data-dev-doc-key="docs-warehouse-README-md"]')
          .count(),
        1,
        '刷新后仓库目录内文档应保持可见'
      )
      await assertERPThemeMode(page, {
        scenarioName: 'dev-docs-dark-desktop',
        expectedMode: 'dark',
        expectedEffectiveTheme: 'dark',
      })
      await assertDarkThemeContrast(page, {
        scenarioName: 'dev-docs-dark-desktop',
        selector: '.erp-dev-docs-page',
      })
    },
  },
  {
    name: 'dev-customer-config-dark-desktop',
    path: '/__dev/customer-config?customer=yoyoosun',
    themeMode: 'dark',
    viewport: { width: 1536, height: 900 },
    verify: async (page) => {
      await expectHeading(page, '客户配置开发总控 / Customer Config Hub')
      await expectText(page, '当前 URL customer / Query')
      await expectText(page, 'yoyoosun')
      await expectText(page, '已接运行时')
      await expectText(page, '真实客户数据导入')
      await assertERPThemeMode(page, {
        scenarioName: 'dev-customer-config-dark-desktop',
        expectedMode: 'dark',
        expectedEffectiveTheme: 'dark',
      })
      await assertDarkThemeContrast(page, {
        scenarioName: 'dev-customer-config-dark-desktop',
        selector: '.erp-dev-customer-page',
      })
      const faviconHref = await page.evaluate(() =>
        document.querySelector('link[rel~="icon"]')?.getAttribute('href')
      )
      assert.equal(
        faviconHref,
        '/favicon-customer-config.svg',
        `客户配置开发页 favicon 异常: ${faviconHref}`
      )
      await assertDevPageUsesGlobalThemeOnly(page, {
        scenarioName: 'dev-customer-config-dark-desktop',
        selector: '.erp-dev-customer-page',
        expectedMode: 'dark',
        expectedEffectiveTheme: 'dark',
        expectDarkContrast: true,
      })

      await page
        .locator('.erp-dev-customer-view-switch .ant-segmented-item')
        .filter({ hasText: '字段编号 / Fields' })
        .click()
      await expectText(page, '边界守卫 / Boundary Guards')
      await expectText(page, 'runtimeEnabled')
      await expectText(page, '客户编码')

      await page
        .locator('.erp-dev-customer-view-switch .ant-segmented-item')
        .filter({ hasText: '导入工具 / Import Tools' })
        .click()
      await expectText(page, 'canExecuteRealImport')
      await expectText(page, 'false')
      await expectText(page, 'customerImportDryRun.mjs')
      await assertNoHorizontalOverflow(page, 'dev-customer-config-import-view')

      await gotoScenarioPath(
        page,
        '/__dev/customer-config?customer=missing-customer',
        {
          waitUntil: 'domcontentloaded',
        }
      )
      await expectHeading(page, '客户配置开发总控 / Customer Config Hub')
      await expectText(page, '未登记客户配置包 / Missing Customer Package')
      await expectText(page, 'missing-customer')
      await expectText(page, '已登记客户包 / Registered Packages')
      await expectText(page, '永绅 yoyoosun')
      await assertTextAbsent(page, '东莞市永绅玩具有限公司')

      await page.locator('.erp-dev-customer-selector .ant-select').click()
      await page.getByText('永绅 yoyoosun (yoyoosun)', { exact: true }).click()
      const switchedUrl = new URL(page.url())
      assert.equal(switchedUrl.pathname, '/__dev/customer-config')
      assert.equal(switchedUrl.searchParams.get('customer'), 'yoyoosun')
      assert(!switchedUrl.pathname.startsWith('/erp'))
      await page
        .locator('.erp-dev-customer-view-switch .ant-segmented-item')
        .filter({ hasText: '菜单品牌 / Menu Brand' })
        .click()
      await expectText(page, '东莞市永绅玩具有限公司')
      await assertNoHorizontalOverflow(page, 'dev-customer-config-missing-view')
    },
  },
  {
    name: 'dev-customer-config-light-desktop',
    path: '/__dev/customer-config?customer=yoyoosun',
    themeMode: 'light',
    viewport: { width: 1536, height: 900 },
    verify: async (page) => {
      await expectHeading(page, '客户配置开发总控 / Customer Config Hub')
      await expectText(page, '当前 URL customer / Query')
      await expectText(page, 'yoyoosun')
      await assertDevPageUsesGlobalThemeOnly(page, {
        scenarioName: 'dev-customer-config-light-desktop',
        selector: '.erp-dev-customer-page',
        expectedMode: 'light',
        expectedEffectiveTheme: 'light',
      })
    },
  },
  {
    name: 'dev-customer-config-mobile',
    path: '/__dev/customer-config',
    viewport: { width: 390, height: 844 },
    verify: async (page) => {
      await expectHeading(page, '客户配置开发总控 / Customer Config Hub')
      await expectText(page, '菜单分组 / Menu Groups')
      await expectText(page, '字段候选 / Field Candidates')
      await page
        .locator('.erp-dev-customer-view-switch .ant-segmented-item')
        .filter({ hasText: '菜单品牌 / Menu Brand' })
        .click()
      await expectText(page, '东莞市永绅玩具有限公司')
      await expectText(page, '采购/仓储')
      const metrics = await page.evaluate(() => {
        const panel = document.querySelector('.erp-dev-customer-panel-grid')
        const style = panel ? getComputedStyle(panel) : null
        return {
          gridTemplateColumns: style?.gridTemplateColumns || '',
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        }
      })
      assert(
        metrics.gridTemplateColumns &&
          !metrics.gridTemplateColumns.includes('420px'),
        `移动端客户配置页不应保持桌面双列布局: ${JSON.stringify(metrics)}`
      )
      assert(
        metrics.scrollWidth <= metrics.clientWidth + 1,
        `移动端客户配置页出现横向溢出: ${JSON.stringify(metrics)}`
      )
    },
  },
  {
    name: 'dev-hub-dark-desktop',
    path: '/__dev',
    themeMode: 'dark',
    viewport: { width: 1536, height: 900 },
    verify: async (page) => {
      await expectHeading(page, '开发入口总控 / Dev Hub')
      await expectText(page, '开发文档 / Dev Docs')
      await expectText(page, '测试入口 / Test Entry')
      await expectText(page, '产品原型 / Prototypes')
      await expectText(page, '能力台账 / Capability Ledger')
      await expectText(page, '客户配置 / Customer Config')
      await expectText(page, '入口台账规则 / Registry Rules')
      await expectText(page, '置顶入口 / Pinned')
      await expectText(page, '用入口卡片右上角图钉把常用页面固定在这里。')
      await expectText(page, '最近访问 / Recent')
      await expectText(page, '点击任一入口后会在这里保留最近访问记录。')
      const defaultMetrics = await page.evaluate(() => ({
        cardCount: document.querySelectorAll(
          '.erp-dev-hub-grid .erp-dev-hub-card'
        ).length,
        guardrailCount: document.querySelectorAll(
          '.erp-dev-hub-grid .erp-dev-hub-card__guards span'
        ).length,
        pinButtonCount: document.querySelectorAll(
          '.erp-dev-hub-grid .erp-dev-hub-card__pin'
        ).length,
        firstHref: document
          .querySelector('.erp-dev-hub-grid .erp-dev-hub-card__link')
          ?.getAttribute('href'),
        firstTarget: document
          .querySelector('.erp-dev-hub-grid .erp-dev-hub-card__link')
          ?.getAttribute('target'),
        firstRel: document
          .querySelector('.erp-dev-hub-grid .erp-dev-hub-card__link')
          ?.getAttribute('rel'),
        faviconHref: document
          .querySelector('link[rel~="icon"]')
          ?.getAttribute('href'),
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))
      assert.equal(
        defaultMetrics.faviconHref,
        '/favicon-dev.svg',
        `开发入口总控 favicon 异常: ${JSON.stringify(defaultMetrics)}`
      )
      assert.equal(
        defaultMetrics.cardCount,
        5,
        `开发入口总控应渲染 5 个入口: ${JSON.stringify(defaultMetrics)}`
      )
      assert(
        defaultMetrics.guardrailCount >= 10,
        `开发入口总控应展示入口边界标签: ${JSON.stringify(defaultMetrics)}`
      )
      assert.equal(
        defaultMetrics.pinButtonCount,
        5,
        `开发入口总控应为每个入口提供置顶按钮: ${JSON.stringify(defaultMetrics)}`
      )
      assert(
        defaultMetrics.firstHref?.startsWith('/__dev/'),
        `开发入口总控卡片链接应指向 /__dev 子路径: ${JSON.stringify(defaultMetrics)}`
      )
      assert.equal(
        defaultMetrics.firstTarget,
        '_blank',
        `开发入口总控卡片链接应新标签打开: ${JSON.stringify(defaultMetrics)}`
      )
      assert.equal(
        defaultMetrics.firstRel,
        'noreferrer',
        `开发入口总控卡片链接应隔离 opener: ${JSON.stringify(defaultMetrics)}`
      )
      assert(
        defaultMetrics.scrollWidth <= defaultMetrics.clientWidth + 1,
        `开发入口总控默认态不应横向溢出: ${JSON.stringify(defaultMetrics)}`
      )

      await page.evaluate(() => {
        localStorage.setItem(
          'plush_erp_dev_hub_recent_routes',
          JSON.stringify(['/__dev/testing', '/__dev/docs', '/erp/dashboard'])
        )
        localStorage.setItem(
          'plush_erp_dev_hub_pinned_routes',
          JSON.stringify([
            '/__dev/customer-config',
            '/__dev/prototypes',
            '/erp/dashboard',
          ])
        )
      })
      await page.reload({ waitUntil: 'domcontentloaded' })
      await expectText(page, '保存在当前浏览器 / Local browser')
      const recentMetrics = await page.evaluate(() => ({
        pinnedCount: document.querySelectorAll(
          '.erp-dev-hub-pinned .erp-dev-hub-card'
        ).length,
        pinnedHrefs: Array.from(
          document.querySelectorAll(
            '.erp-dev-hub-pinned .erp-dev-hub-card__link'
          )
        ).map((link) => link.getAttribute('href')),
        recentCount: document.querySelectorAll(
          '.erp-dev-hub-recent .erp-dev-hub-card'
        ).length,
        recentHrefs: Array.from(
          document.querySelectorAll(
            '.erp-dev-hub-recent .erp-dev-hub-card__link'
          )
        ).map((link) => link.getAttribute('href')),
        overflow:
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth + 1,
      }))
      assert.deepEqual(
        recentMetrics,
        {
          pinnedCount: 2,
          pinnedHrefs: ['/__dev/customer-config', '/__dev/prototypes'],
          recentCount: 2,
          recentHrefs: ['/__dev/testing', '/__dev/docs'],
          overflow: false,
        },
        `开发入口总控最近访问应过滤非法路径并保持顺序: ${JSON.stringify(recentMetrics)}`
      )

      await page
        .locator('.erp-dev-hub-grid .erp-dev-hub-card')
        .filter({ hasText: '测试入口 / Test Entry' })
        .locator('.erp-dev-hub-card__pin')
        .click()
      const pinnedAfterClick = await page.evaluate(() => ({
        storedRoutes: JSON.parse(
          localStorage.getItem('plush_erp_dev_hub_pinned_routes') || '[]'
        ),
        firstPinnedHref: document
          .querySelector('.erp-dev-hub-pinned .erp-dev-hub-card__link')
          ?.getAttribute('href'),
        overflow:
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth + 1,
      }))
      assert.deepEqual(
        pinnedAfterClick,
        {
          storedRoutes: [
            '/__dev/testing',
            '/__dev/customer-config',
            '/__dev/prototypes',
          ],
          firstPinnedHref: '/__dev/testing',
          overflow: false,
        },
        `开发入口总控置顶入口应写入本地偏好并移动到首位: ${JSON.stringify(pinnedAfterClick)}`
      )

      await page
        .locator('.erp-dev-hub-group-filter .ant-segmented-item')
        .filter({ hasText: '产品治理 / Product Governance' })
        .click()
      await expectText(page, '当前匹配 / Matches 1 / 5')
      const groupMetrics = await page.evaluate(() => ({
        cardCount: document.querySelectorAll(
          '.erp-dev-hub-grid .erp-dev-hub-card'
        ).length,
        onlyHref: document
          .querySelector('.erp-dev-hub-grid .erp-dev-hub-card__link')
          ?.getAttribute('href'),
        overflow:
          document.documentElement.scrollWidth >
          document.documentElement.clientWidth + 1,
      }))
      assert.deepEqual(
        groupMetrics,
        {
          cardCount: 1,
          onlyHref: '/__dev/capability-ledger',
          overflow: false,
        },
        `开发入口总控分组筛选应只保留能力台账: ${JSON.stringify(groupMetrics)}`
      )

      await page
        .locator('.erp-dev-hub-group-filter .ant-segmented-item')
        .filter({ hasText: '全部 / All' })
        .click()
      await page.getByPlaceholder('搜索入口、路径或资料来源').fill('测试')
      await expectText(page, '当前匹配 / Matches 1 / 5')
      const filteredMetrics = await page.evaluate(() => ({
        cardCount: document.querySelectorAll(
          '.erp-dev-hub-grid .erp-dev-hub-card'
        ).length,
        onlyHref: document
          .querySelector('.erp-dev-hub-grid .erp-dev-hub-card__link')
          ?.getAttribute('href'),
      }))
      assert.deepEqual(filteredMetrics, {
        cardCount: 1,
        onlyHref: '/__dev/testing',
      })
      await assertERPThemeMode(page, {
        scenarioName: 'dev-hub-dark-desktop',
        expectedMode: 'dark',
        expectedEffectiveTheme: 'dark',
      })
      await assertDarkThemeContrast(page, {
        scenarioName: 'dev-hub-dark-desktop',
        selector: '.erp-dev-hub-page',
      })
    },
  },
  {
    name: 'dev-prototypes-dark-desktop',
    path: '/__dev/prototypes',
    themeMode: 'dark',
    viewport: { width: 1536, height: 900 },
    verify: async (page) => {
      await page.evaluate(() => {
        window.localStorage.removeItem('plush_erp_dev_prototype_selected_key')
        window.localStorage.removeItem('plush_erp_dev_prototype_status_filter')
      })
      await page.reload({ waitUntil: 'domcontentloaded' })
      await expectHeading(page, '产品原型与样板查看器 / Prototype Viewer')
      await expectText(page, '待实现 / To Implement')
      await expectText(page, '参考资料 / Reference')
      await expectText(page, '参照范围只说明可借鉴的页面 / 菜单类型')
      await expectText(page, '顶部筛选只用于判断当前、待实现和参考资料')
      await assertERPThemeMode(page, {
        scenarioName: 'dev-prototypes-dark-desktop',
        expectedMode: 'dark',
        expectedEffectiveTheme: 'dark',
      })

      await page
        .getByRole('button', { name: '当前实现 / Current', exact: true })
        .click()
      await expectText(page, '岗位任务端当前实现参考')
      const currentMetrics = await page.evaluate(() => ({
        activeText:
          document
            .querySelector('.erp-dev-prototypes-filter__item--active')
            ?.textContent?.replace(/\s+/g, ' ')
            .trim() || '',
        visibleCards: document.querySelectorAll('.erp-dev-prototypes-card')
          .length,
        currentTagCount: Array.from(
          document.querySelectorAll(
            '.erp-dev-prototypes-list .erp-dev-prototypes-status'
          )
        ).filter((item) => item.textContent?.includes('当前实现')).length,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))
      assert.equal(
        currentMetrics.activeText,
        '当前实现 / Current',
        `原型查看器当前实现筛选应激活: ${JSON.stringify(currentMetrics)}`
      )
      assert.equal(
        currentMetrics.visibleCards,
        1,
        `原型查看器当前实现筛选只应展示岗位任务端资产: ${JSON.stringify(currentMetrics)}`
      )
      assert.equal(
        currentMetrics.currentTagCount,
        1,
        `原型查看器当前实现标签数量异常: ${JSON.stringify(currentMetrics)}`
      )
      assert(
        currentMetrics.scrollWidth <= currentMetrics.clientWidth + 1,
        `原型查看器当前实现筛选不应横向溢出: ${JSON.stringify(currentMetrics)}`
      )

      await page
        .getByRole('button', {
          name: '待实现 / To Implement',
          exact: true,
        })
        .click()
      await expectText(page, '后台工作台样板')
      await expectText(page, '业务模块标准页样板')
      await expectText(page, '业务页协同入口组件样板')
      await expectText(page, '业务详情页标准样板')
      await expectText(page, '新建 / 编辑表单标准样板')
      await expectText(page, '弹窗 / 抽屉动作标准样板')
      await expectText(page, '参照范围：客户档案、供应商档案、产品、销售订单')
      const implementMetrics = await page.evaluate(() => ({
        activeText:
          document
            .querySelector('.erp-dev-prototypes-filter__item--active')
            ?.textContent?.replace(/\s+/g, ' ')
            .trim() || '',
        visibleCards: document.querySelectorAll('.erp-dev-prototypes-card')
          .length,
        appliesCount: document.querySelectorAll(
          '.erp-dev-prototypes-card__applies'
        ).length,
        visibleTitles: Array.from(
          document.querySelectorAll('.erp-dev-prototypes-card__title')
        ).map((item) => item.textContent?.trim() || ''),
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))
      assert.equal(
        implementMetrics.activeText,
        '待实现 / To Implement',
        `原型查看器待实现筛选应激活: ${JSON.stringify(implementMetrics)}`
      )
      assert.equal(
        implementMetrics.visibleCards,
        6,
        `原型查看器待实现筛选应展示 6 个产品内核 HTML 样板: ${JSON.stringify(implementMetrics)}`
      )
      assert.equal(
        implementMetrics.appliesCount,
        6,
        `原型查看器待实现筛选应为每张卡片展示参照范围: ${JSON.stringify(implementMetrics)}`
      )
      assert(
        implementMetrics.scrollWidth <= implementMetrics.clientWidth + 1,
        `原型查看器待实现筛选不应横向溢出: ${JSON.stringify(implementMetrics)}`
      )

      await page
        .locator(
          '[data-dev-prototype-key="business-task-collab-entry"] .erp-dev-prototypes-card__body'
        )
        .click()
      await page.waitForFunction(
        () =>
          window.localStorage.getItem(
            'plush_erp_dev_prototype_selected_key'
          ) === 'business-task-collab-entry'
      )
      await page.reload({ waitUntil: 'domcontentloaded' })
      await expectHeading(page, '产品原型与样板查看器 / Prototype Viewer')
      const restoredSelectionMetrics = await page.evaluate(() => ({
        activeText:
          document
            .querySelector('.erp-dev-prototypes-filter__item--active')
            ?.textContent?.replace(/\s+/g, ' ')
            .trim() || '',
        activeCardKey:
          document
            .querySelector('.erp-dev-prototypes-card--active')
            ?.getAttribute('data-dev-prototype-key') || '',
        readerPath:
          document
            .querySelector('.erp-dev-prototypes-reader__path')
            ?.textContent?.trim() || '',
        readerApplies:
          document
            .querySelector('.erp-dev-prototypes-reader__applies')
            ?.textContent?.replace(/\s+/g, ' ')
            .trim() || '',
        storedFilter:
          window.localStorage.getItem(
            'plush_erp_dev_prototype_status_filter'
          ) || '',
        storedSelected:
          window.localStorage.getItem('plush_erp_dev_prototype_selected_key') ||
          '',
      }))
      assert.deepEqual(
        restoredSelectionMetrics,
        {
          activeText: '待实现 / To Implement',
          activeCardKey: 'business-task-collab-entry',
          readerPath:
            'business-module-page-standard-v1/task-collab-entry-v2.html',
          readerApplies:
            '参照范围：嵌入有 Workflow 协同任务的业务页可参照；它是页内组件，不是独立菜单、路由或权限入口。',
          storedFilter: 'to-implement',
          storedSelected: 'business-task-collab-entry',
        },
        `原型查看器刷新后应恢复左侧筛选和当前资产: ${JSON.stringify(restoredSelectionMetrics)}`
      )

      await page
        .getByRole('button', { name: '参考资料 / Reference', exact: true })
        .click()
      await expectText(page, '方向 1：右侧当前记录协同侧栏')
      const referenceMetrics = await page.evaluate(() => ({
        activeText:
          document
            .querySelector('.erp-dev-prototypes-filter__item--active')
            ?.textContent?.replace(/\s+/g, ' ')
            .trim() || '',
        visibleCards: document.querySelectorAll('.erp-dev-prototypes-card')
          .length,
        draftTagCount: Array.from(
          document.querySelectorAll(
            '.erp-dev-prototypes-list .erp-dev-prototypes-status'
          )
        ).filter((item) => item.textContent?.includes('起草阶段')).length,
        evidenceTagCount: Array.from(
          document.querySelectorAll(
            '.erp-dev-prototypes-list .erp-dev-prototypes-status'
          )
        ).filter((item) => item.textContent?.includes('截图证据')).length,
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))
      assert.equal(
        referenceMetrics.activeText,
        '参考资料 / Reference',
        `原型查看器参考资料筛选应激活: ${JSON.stringify(referenceMetrics)}`
      )
      assert.equal(
        referenceMetrics.visibleCards,
        6,
        `原型查看器参考资料筛选应展示 6 个参考资产: ${JSON.stringify(referenceMetrics)}`
      )
      assert.equal(
        referenceMetrics.draftTagCount,
        3,
        `原型查看器参考资料起草阶段标签数量异常: ${JSON.stringify(referenceMetrics)}`
      )
      assert.equal(
        referenceMetrics.evidenceTagCount,
        3,
        `原型查看器参考资料截图证据标签数量异常: ${JSON.stringify(referenceMetrics)}`
      )
      assert(
        referenceMetrics.scrollWidth <= referenceMetrics.clientWidth + 1,
        `原型查看器参考资料筛选不应横向溢出: ${JSON.stringify(referenceMetrics)}`
      )
      await assertDarkThemeContrast(page, {
        scenarioName: 'dev-prototypes-dark-desktop',
        selector: '.erp-dev-prototypes-page',
      })
    },
  },
  {
    name: 'dev-testing-dark-desktop',
    path: '/__dev/testing',
    themeMode: 'dark',
    viewport: { width: 1536, height: 900 },
    verify: async (page) => {
      await expectHeading(page, '开发测试入口 / Dev Test Entry')
      await expectText(page, '测试分层 / Tiers')
      await expectText(page, '命令入口 / Commands')
      await expectText(page, 'docs/product/test-strategy.md')
      const defaultMetrics = await page.evaluate(() => {
        const root = document.querySelector('.erp-dev-testing-page')
        return {
          tierCount: document.querySelectorAll('.erp-dev-testing-tier').length,
          tierCopyButtonCount: document.querySelectorAll(
            '.erp-dev-testing-tier .ant-btn'
          ).length,
          presetCount: document.querySelectorAll('.erp-dev-testing-preset')
            .length,
          docCount: document.querySelectorAll('.erp-dev-testing-doc-row')
            .length,
          overflow:
            root && document.documentElement.scrollWidth > root.clientWidth + 1,
        }
      })
      assert.equal(
        defaultMetrics.overflow,
        false,
        `测试入口默认态不应横向溢出: ${JSON.stringify(defaultMetrics)}`
      )
      assert(
        defaultMetrics.tierCount >= 8,
        `测试入口应渲染测试分层: ${JSON.stringify(defaultMetrics)}`
      )
      assert(
        defaultMetrics.docCount > 0,
        `测试入口应渲染相关文档: ${JSON.stringify(defaultMetrics)}`
      )
      assert.equal(
        defaultMetrics.presetCount,
        3,
        `测试入口应渲染常用复制预设: ${JSON.stringify(defaultMetrics)}`
      )
      assert(
        defaultMetrics.tierCopyButtonCount >= defaultMetrics.tierCount,
        `每个测试层级应提供复制按钮: ${JSON.stringify(defaultMetrics)}`
      )
      const faviconHref = await page.evaluate(() =>
        document.querySelector('link[rel~="icon"]')?.getAttribute('href')
      )
      assert.equal(
        faviconHref,
        '/favicon-testing.svg',
        `测试入口 favicon 异常: ${faviconHref}`
      )
      await assertDevPageUsesGlobalThemeOnly(page, {
        scenarioName: 'dev-testing-dark-desktop',
        selector: '.erp-dev-testing-page',
        expectedMode: 'dark',
        expectedEffectiveTheme: 'dark',
        expectDarkContrast: true,
      })
      await page
        .locator('.erp-dev-testing-preset')
        .filter({ hasText: '本轮前端验证 / Frontend Check' })
        .click()
      const frontendPresetClipboard = await page.evaluate(() =>
        navigator.clipboard.readText()
      )
      assert(
        frontendPresetClipboard.includes('pnpm style:l1'),
        `前端验证预设应复制 style:l1 命令: ${frontendPresetClipboard}`
      )
      await page
        .locator('.erp-dev-testing-tier')
        .filter({ hasText: 'T5 Frontend UI / 样式' })
        .getByRole('button', { name: '复制' })
        .click()
      const tierClipboard = await page.evaluate(() =>
        navigator.clipboard.readText()
      )
      assert(
        tierClipboard.includes('cd web && pnpm style:l1'),
        `T5 层级复制内容应包含前端 L1 命令: ${tierClipboard}`
      )

      await page
        .locator('.erp-dev-testing-reader__toolbar .ant-segmented-item')
        .filter({ hasText: '命令入口 / Commands' })
        .click()
      await expectText(page, 'pnpm style:l1')
      const commandMetrics = await page.evaluate(() => ({
        commandBlocks: document.querySelectorAll(
          '.erp-dev-testing-command-block'
        ).length,
        hasCommandPre: Boolean(
          document.querySelector('.erp-dev-testing-command-block pre')
        ),
      }))
      assert(
        commandMetrics.commandBlocks > 0 && commandMetrics.hasCommandPre,
        `测试入口命令视图应渲染命令块: ${JSON.stringify(commandMetrics)}`
      )
      await assertERPThemeMode(page, {
        scenarioName: 'dev-testing-dark-desktop',
        expectedMode: 'dark',
        expectedEffectiveTheme: 'dark',
      })
      await assertDarkThemeContrast(page, {
        scenarioName: 'dev-testing-dark-desktop',
        selector: '.erp-dev-testing-page',
      })
    },
  },
  {
    name: 'dev-testing-light-desktop',
    path: '/__dev/testing',
    themeMode: 'light',
    viewport: { width: 1536, height: 900 },
    verify: async (page) => {
      await expectHeading(page, '开发测试入口 / Dev Test Entry')
      await expectText(page, '测试分层 / Tiers')
      await expectText(page, '命令入口 / Commands')
      await assertDevPageUsesGlobalThemeOnly(page, {
        scenarioName: 'dev-testing-light-desktop',
        selector: '.erp-dev-testing-page',
        expectedMode: 'light',
        expectedEffectiveTheme: 'light',
      })
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
      await expectText(page, '按业务模块看运行状态')
      await expectText(page, '业务关注统计')
      await expectText(page, '业务状态分布')
    },
  },
  {
    name: 'business-module-workflow-actions',
    path: '/erp/purchase/accessories',
    auth: 'admin',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await expectHeading(page, '辅材/包材采购')
      await expectText(page, '归档只读')
      await expectText(page, 'ARCH-PUR-001')
      await assertBusinessArchiveReadonlyToolbar(page, {
        scenarioName: 'business-module-workflow-actions',
      })
      await assertBusinessModuleToolbarControlStyle(page, {
        scenarioName: 'business-module-workflow-actions',
      })
      await assertBusinessSelectionActionBarEmpty(page, {
        scenarioName: 'business-module-workflow-actions',
      })
      const businessActionToolbar = page.locator(
        '.erp-business-module-current-action'
      )
      await expectText(page, '本页协同入口')
      await assertBusinessCollaborationPanelCollapsedByDefault(page, {
        scenarioName: 'business-module-workflow-actions',
      })
      await assertBusinessPageRefreshEntrypoint(page, {
        scenarioName: 'business-module-workflow-actions',
      })
      await page.getByRole('button', { name: '刷新当前页' }).click()
      await expectText(page, '当前页面数据已刷新')
      await verifyBusinessModuleColumnOrderDialog(page, {
        moduleKey: 'accessories-purchase',
        heading: '辅材/包材采购',
      })
      await assertBusinessModuleCompactWorkspace(page, {
        scenarioName: 'business-module-workflow-actions-empty',
        expectSelectionAction: true,
      })

      await page
        .locator('.erp-business-module-table-card .ant-table-tbody tr')
        .filter({ hasText: 'ARCH-PUR-001' })
        .first()
        .click()
      const readonlyButtons = await businessActionToolbar.evaluate((element) =>
        Array.from(element.querySelectorAll('button')).map((button) => ({
          text: String(button.textContent || '')
            .replace(/\s+/g, ' ')
            .trim(),
          ariaLabel: button.getAttribute('aria-label') || '',
          disabled: button.disabled,
        }))
      )
      for (const label of ['创建协同任务', '删除', '批量删除']) {
        const button = readonlyButtons.find((item) => item.text === label)
        assert(
          button?.disabled,
          `business-module-workflow-actions ${label} 应保持只读禁用: ${JSON.stringify(
            readonlyButtons
          )}`
        )
      }
      const flowButton = readonlyButtons.find(
        (item) => item.text === '流转' || item.ariaLabel === '流转业务状态'
      )
      assert(
        flowButton?.disabled,
        `business-module-workflow-actions 流转应保持只读禁用: ${JSON.stringify(
          readonlyButtons
        )}`
      )
      await assertBusinessModuleCompactWorkspace(page, {
        scenarioName: 'business-module-workflow-actions-filled',
        expectSelectionAction: true,
      })
      await assertBusinessSelectionActionBarBoxModel(page, {
        scenarioName: 'business-module-workflow-actions-filled',
        expectedMode: 'active',
      })
      await assertTextAbsent(page, '返回当前记录')
      const archiveDialog = await openBusinessArchiveRecordModal(page, {
        scenarioName: 'business-module-workflow-actions-archive-modal',
        recordText: 'ARCH-PUR-001',
      })
      await assertBusinessRecordModalLayout(page, {
        scenarioName: 'business-module-workflow-actions-archive-modal',
        minModalWidth: 1200,
        expectCompactGrid: true,
        expectReadonly: true,
      })
      await archiveDialog.locator('.ant-modal-close').click()
      await archiveDialog.waitFor({ state: 'hidden', timeout: 10_000 })

      await page.getByRole('button', { name: '回收站' }).click()
      const recycleDialog = page.getByRole('dialog', { name: '回收站' })
      await recycleDialog.waitFor({ state: 'visible', timeout: 10_000 })
      await assertAntdModalCentered(
        page,
        recycleDialog,
        'business-module-recycle-modal'
      )
      await recycleDialog.getByText('回收站暂无记录').waitFor({
        state: 'visible',
        timeout: 10_000,
      })
      await recycleDialog.locator('.ant-modal-close').click()
      await recycleDialog.waitFor({ state: 'hidden', timeout: 10_000 })
    },
  },
  {
    name: 'business-module-toolbar-mobile-dropdown',
    path: '/erp/purchase/accessories',
    auth: 'admin',
    viewport: { width: 470, height: 680 },
    verify: async (page) => {
      await expectHeading(page, '辅材/包材采购')
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
      await expectText(page, 'ARCH-BOM-001')
      await assertBusinessArchiveReadonlyToolbar(page, {
        scenarioName: 'business-module-material-bom-modal-style',
      })
      const bomDialog = await openBusinessArchiveRecordModal(page, {
        scenarioName: 'business-module-material-bom-modal-style',
        recordText: 'ARCH-BOM-001',
      })
      await assertBusinessRecordModalLayout(page, {
        scenarioName: 'business-module-material-bom-modal-style',
        minModalWidth: 1200,
        expectCompactGrid: true,
        expectReadonly: true,
      })
      await assertBusinessRecordItemCardLayout(page, {
        scenarioName: 'business-module-material-bom-modal-style',
      })
      await expectText(page, 'BOM 明细')
      await expectText(page, '已录入 1 条')
      await bomDialog.locator('.ant-modal-close').click()
      await bomDialog.waitFor({ state: 'hidden', timeout: 10_000 })
    },
  },
  {
    name: 'business-special-variant-shells-desktop',
    path: '/erp/purchase/material-bom',
    auth: 'admin',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await expectHeading(page, '材料 BOM')
      await expectText(page, '标准页 + BOM 明细变体')
      await expectText(page, 'BOM 版本、物料明细和损耗口径')
      await expectText(page, '不新增 BOM 事实写入')
      await assertNoHorizontalOverflow(page, 'business-special-bom-variant')

      await gotoScenarioPath(page, '/erp/warehouse/inbound', {
        waitUntil: 'domcontentloaded',
      })
      await expectHeading(page, '入库通知/检验/入库')
      await expectText(page, '标准页 + 到仓 / IQC / 入库变体')
      await expectText(page, '到仓通知、质检结论和允许入库是三段边界')
      await expectText(page, '质检完成不等于库存入账')
      await assertNoHorizontalOverflow(page, 'business-special-inbound-variant')

      await gotoScenarioPath(page, '/erp/warehouse/inventory', {
        waitUntil: 'domcontentloaded',
      })
      await expectHeading(page, '库存')
      await expectText(page, '独立库存观察变体')
      await expectText(page, '库存余额、批次和流水只读分区')
      await expectText(page, '真实数量只来自 InventoryUsecase')
      await assertNoHorizontalOverflow(
        page,
        'business-special-inventory-variant'
      )

      await gotoScenarioPath(page, '/erp/warehouse/outbound', {
        waitUntil: 'domcontentloaded',
      })
      await expectHeading(page, '出库')
      await expectText(page, '独立出库变体')
      await expectText(page, '出库动作必须从待出货放行进入事实边界')
      await expectText(page, '出库记录不会在前端直接扣减库存')
      await assertNoHorizontalOverflow(
        page,
        'business-special-outbound-variant'
      )
    },
  },
  {
    name: 'business-module-derived-item-amount',
    path: '/erp/purchase/accessories',
    auth: 'admin',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await expectHeading(page, '辅材/包材采购')
      await assertBusinessArchiveReadonlyToolbar(page, {
        scenarioName: 'business-module-derived-item-amount',
      })
      await expectText(page, 'ARCH-PUR-001')
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
        .filter({ hasText: 'ARCH-PUR-001' })
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
        await expectText(printWindow, 'ARCH-PUR-001')
        await expectText(printWindow, 'Archive 供应商')
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
    themeMode: 'dark',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await expectText(page, '权限加载中')
      await expectText(page, '正在同步管理员、角色和权限码，请稍候...')
      await assertERPThemeMode(page, {
        scenarioName: 'permission-center-loading-state',
        expectedMode: 'dark',
        expectedEffectiveTheme: 'dark',
      })
      await assertDarkLoadingState(page, {
        scenarioName: 'permission-center-loading-state',
      })
      await expectHeading(page, '权限管理')
      await assertTextAbsent(page, '权限加载中')
      await assertDarkAntdStateSurfaces(page, {
        scenarioName: 'permission-center-loading-state',
      })
      await assertPermissionSectionVisualSeparation(page, {
        scenarioName: 'permission-center-loading-state',
      })
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
      await expectText(page, '当前客户角色模板')
      await expectText(page, 'Product Core 权限码稳定')
      await expectText(page, '影响管理员')
      await expectText(page, '客户角色可以不同，职责权限保持统一')
      await expectText(page, '保存角色权限')
      const roleCenterMetrics = await page.evaluate(() => {
        const adminSection = document.querySelector(
          '.erp-permission-section--admins'
        )
        const roleSection = document.querySelector(
          '.erp-permission-section--roles'
        )
        const layout = document.querySelector('.erp-role-center-layout')
        const heroCreateButton = document.querySelector(
          '.erp-permission-hero button'
        )
        const sidebar = document.querySelector('.erp-role-center-sidebar')
        const detail = document.querySelector('.erp-role-center-detail')
        const checklist = document.querySelector('.erp-permission-checklist')
        const createRect = heroCreateButton?.getBoundingClientRect()
        const adminRect = adminSection?.getBoundingClientRect()
        const roleRect = roleSection?.getBoundingClientRect()
        const layoutRect = layout?.getBoundingClientRect()
        const sidebarRect = sidebar?.getBoundingClientRect()
        const detailRect = detail?.getBoundingClientRect()
        return {
          hasAdminSection: Boolean(adminSection),
          hasRoleSection: Boolean(roleSection),
          adminTop: adminRect?.top || 0,
          roleTop: roleRect?.top || 0,
          hasHeroCreateButton: Boolean(heroCreateButton),
          createTop: createRect?.top || 0,
          createBottom: createRect?.bottom || 0,
          hasLayout: Boolean(layout),
          layoutWidth: layoutRect?.width || 0,
          sidebarWidth: sidebarRect?.width || 0,
          detailWidth: detailRect?.width || 0,
          documentScrollWidth: document.documentElement.scrollWidth,
          documentClientWidth: document.documentElement.clientWidth,
          checklistScrollWidth: checklist?.scrollWidth || 0,
          checklistClientWidth: checklist?.clientWidth || 0,
        }
      })
      assert(
        roleCenterMetrics.hasAdminSection &&
          roleCenterMetrics.hasRoleSection &&
          roleCenterMetrics.adminTop < roleCenterMetrics.roleTop,
        `权限管理模块顺序异常，管理员模块应在角色权限模块前: ${JSON.stringify(roleCenterMetrics)}`
      )
      assert(
        roleCenterMetrics.hasHeroCreateButton &&
          roleCenterMetrics.createBottom < roleCenterMetrics.adminTop,
        `创建管理员按钮应位于首屏 hero 操作区且早于管理员模块: ${JSON.stringify(roleCenterMetrics)}`
      )
      assert(
        roleCenterMetrics.hasLayout &&
          roleCenterMetrics.sidebarWidth >= 220 &&
          roleCenterMetrics.detailWidth >= 640,
        `权限管理角色中心布局宽度异常: ${JSON.stringify(roleCenterMetrics)}`
      )
      assert(
        roleCenterMetrics.documentScrollWidth <=
          roleCenterMetrics.documentClientWidth + 1,
        `权限管理页面出现横向溢出: ${JSON.stringify(roleCenterMetrics)}`
      )
      assert(
        roleCenterMetrics.checklistScrollWidth <=
          roleCenterMetrics.checklistClientWidth + 1,
        `权限管理权限矩阵出现横向溢出: ${JSON.stringify(roleCenterMetrics)}`
      )
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
    name: 'print-center-desktop',
    path: '/erp/print-center',
    auth: 'admin',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await expectHeading(page, '模板打印中心')
      await expectText(page, '打印当前模板')
      await expectText(page, '模板')
      await expectText(page, '采购合同')
      await expectText(page, '加工合同')
      await expectText(page, '样品确认单')
      await expectText(page, '候选模板 / 未启用')
      await expectText(page, '纸面预览')
      await expectText(page, '字段映射')
      await expectText(page, '字段核对')
      await assertTextAbsent(page, '运营中枢')
      await assertTextAbsent(page, '模板数量')
      await assertTextAbsent(page, '示例记录')
      await assertTextAbsent(page, '打开可编辑打印窗口')
      await assertTextAbsent(page, '打开当前模板')
      const candidateTemplateButton = page.getByRole('button', {
        name: /样品确认单/,
      })
      assert.equal(
        await candidateTemplateButton.isDisabled(),
        true,
        '样品确认单候选模板不应开放打印动作'
      )
      const printCenterLayout = await page.evaluate(() => {
        const root = document.querySelector('.erp-print-center-page')
        const workbench = document.querySelector('.erp-print-center-workbench')
        const panels = [
          '.erp-print-center-nav-panel',
          '.erp-print-center-preview-panel',
          '.erp-print-center-mapping-panel',
        ].map((selector) => document.querySelector(selector))

        return {
          commandRailInPage: Boolean(
            root?.querySelector('.erp-command-center-rail')
          ),
          oldHero: Boolean(root?.querySelector('.erp-print-center-hero-card')),
          oldSampleCard: Boolean(
            root?.querySelector('.erp-print-center-sample-card')
          ),
          panelCount: panels.filter(Boolean).length,
          gridTemplateColumns:
            workbench && window.getComputedStyle(workbench).gridTemplateColumns,
        }
      })
      assert.equal(
        printCenterLayout.commandRailInPage,
        false,
        `打印中心不应再嵌套运营中枢导航: ${JSON.stringify(printCenterLayout)}`
      )
      assert.equal(
        printCenterLayout.oldHero,
        false,
        `打印中心不应保留旧 hero 卡: ${JSON.stringify(printCenterLayout)}`
      )
      assert.equal(
        printCenterLayout.oldSampleCard,
        false,
        `打印中心右栏不应保留示例记录卡: ${JSON.stringify(printCenterLayout)}`
      )
      assert.equal(
        printCenterLayout.panelCount,
        3,
        `打印中心应保持三栏工作台: ${JSON.stringify(printCenterLayout)}`
      )
      await page
        .locator('.erp-print-center-template-list')
        .getByRole('button', { name: /^加工合同/ })
        .click()
      assert.match(
        page.url(),
        /[?&]template=processing-contract(?:&|$)/,
        '切换打印模板应写入 URL 以便刷新恢复'
      )
      await assertTextAbsent(page, '页面结构')
      await assertTextAbsent(page, '适用场景')
      await assertTextAbsent(page, '版式特点')
      await assertTextAbsent(page, '输出方式')
      await assertTextAbsent(page, '模板来源')
      await assertTextAbsent(page, '使用提醒')
      await assertNoHorizontalOverflow(page, 'print-center-desktop')
    },
  },
  {
    name: 'print-center-dark-desktop',
    path: '/erp/print-center',
    auth: 'admin',
    themeMode: 'dark',
    viewport: { width: 2048, height: 1024 },
    verify: async (page) => {
      await expectHeading(page, '模板打印中心')
      await expectText(page, '打印当前模板')
      await expectText(page, '模板')
      await expectText(page, '采购合同')
      await expectText(page, '加工合同')
      await expectText(page, '样品确认单')
      await expectText(page, '纸面预览')
      await expectText(page, '字段映射')
      await assertTextAbsent(page, '运营中枢')
      await assertTextAbsent(page, '示例记录')
      await assertERPThemeMode(page, {
        scenarioName: 'print-center-dark-desktop',
        expectedMode: 'dark',
        expectedEffectiveTheme: 'dark',
      })
      await assertDarkThemeContrast(page, {
        scenarioName: 'print-center-dark-desktop',
        selector: '.erp-print-center-page',
      })
      await assertNoHorizontalOverflow(page, 'print-center-dark-desktop')
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
    name: 'print-preview-material-dark-desktop',
    path: '/erp/print-center/material-purchase-contract',
    auth: 'admin',
    themeMode: 'dark',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await expectHeading(page, '采购合同')
      await expectText(page, '兼容入口')
      await expectText(page, '打开可编辑打印窗口')
      await expectText(page, '返回打印中心')
      await assertERPThemeMode(page, {
        scenarioName: 'print-preview-material-dark-desktop',
        expectedMode: 'dark',
        expectedEffectiveTheme: 'dark',
      })
      await assertDarkThemeContrast(page, {
        scenarioName: 'print-preview-material-dark-desktop',
        selector: '.erp-admin-content',
      })
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
    name: 'business-menu-groups-desktop',
    path: '/erp/sales/project-orders/sales-orders',
    auth: 'admin',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await expectButton(page, '新建订单')
      await expectText(page, '正式 sales_orders')
      await expectText(page, '当前操作')
      await expectText(page, '当前订单行')
      await expectText(page, '不写出货 / 库存 / 财务事实')
      await expectText(page, '工作台')
      await expectText(page, '任务看板')
      await expectText(page, '业务看板')
      await expectText(page, '基础资料')
      await expectText(page, '客户档案')
      await expectText(page, '供应商档案')
      await expectText(page, '产品')
      await expectText(page, '销售链路')
      await expectText(page, '销售订单')
      await expectText(page, '采购/仓储')
      await expectText(page, '生产环节')
      await expectText(page, '财务环节')
      await expectText(page, '运营工具')
      await expectText(page, '模板打印中心')
      await expectText(page, '异常 / 阻塞闭环')
      await page.locator('.erp-admin-menu').evaluate((node) => {
        node.scrollTop = node.scrollHeight
      })
      await expectText(page, '系统管理')
      await expectText(page, '权限管理')
      const menu = page.locator('.erp-admin-menu')
      assert.equal(
        await menu.getByText('客户/供应商', { exact: true }).count(),
        0,
        '侧栏不应再显示旧“客户/供应商”正式入口'
      )
      assert.equal(
        await menu.getByText('订单/款式立项', { exact: true }).count(),
        0,
        '侧栏不应再显示旧“订单/款式立项”正式入口'
      )
      assert.equal(
        await page.getByText('流程与真源', { exact: true }).count(),
        0,
        '侧栏不应再显示“流程与真源”分组'
      )
      assert.equal(
        await page.getByText('开发与验收', { exact: true }).count(),
        0,
        '侧栏不应再显示“开发与验收”分组'
      )
      assert.equal(
        await page.getByText('帮助中心', { exact: true }).count(),
        0,
        '侧栏不应再显示“帮助中心”分组'
      )
      assert.equal(
        await page.getByText('高级文档', { exact: true }).count(),
        0,
        '侧栏不应再显示“高级文档”分组'
      )
    },
  },
  {
    name: 'business-processing-contracts-desktop',
    path: '/erp/purchase/processing-contracts',
    auth: 'admin',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await expectHeading(page, '加工合同/委外下单')
      await expectText(page, '委外加工订单号')
      await expectText(page, '归档只读')
      await assertBusinessArchiveReadonlyToolbar(page, {
        scenarioName: 'business-processing-contracts-desktop',
      })
      await assertBusinessSelectionActionBarEmpty(page, {
        scenarioName: 'business-processing-contracts-desktop',
      })
      await expectText(page, '本页协同入口')
      await assertBusinessCollaborationPanelCollapsedByDefault(page, {
        scenarioName: 'business-processing-contracts-desktop',
      })
    },
  },
  {
    name: 'business-standard-module-shells-desktop',
    path: '/erp/master/partners/suppliers',
    auth: 'admin',
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      await expectHeading(page, '供应商档案')
      await expectText(page, '正式 MasterData')
      await expectText(page, '当前操作')
      await expectText(page, '本页协同入口')
      await assertNoHorizontalOverflow(page, 'business-standard-suppliers')

      await gotoScenarioPath(page, '/erp/master/products', {
        waitUntil: 'domcontentloaded',
      })
      await expectHeading(page, '产品')
      await expectText(page, '导出当前结果')
      await expectText(page, '本页协同入口')
      await assertNoHorizontalOverflow(page, 'business-standard-products')

      await gotoScenarioPath(page, '/erp/sales/project-orders/sales-orders', {
        waitUntil: 'domcontentloaded',
      })
      await expectHeading(page, '销售订单')
      await expectText(page, '正式 sales_orders')
      await expectText(page, '当前操作')
      await expectText(page, '当前订单行')
      await expectText(page, '本页协同入口')
      await assertNoHorizontalOverflow(page, 'business-standard-sales-orders')

      await gotoScenarioPath(page, '/erp/purchase/accessories', {
        waitUntil: 'domcontentloaded',
      })
      await expectHeading(page, '辅材/包材采购')
      await expectText(page, '归档只读')
      await expectText(page, '本页协同入口')
      await assertNoHorizontalOverflow(page, 'business-standard-accessories')

      await gotoScenarioPath(page, '/erp/purchase/processing-contracts', {
        waitUntil: 'domcontentloaded',
      })
      await expectHeading(page, '加工合同/委外下单')
      await expectText(page, '归档只读')
      await expectText(page, '本页协同入口')
      await assertNoHorizontalOverflow(page, 'business-standard-processing')

      await gotoScenarioPath(page, '/erp/warehouse/shipping-release', {
        waitUntil: 'domcontentloaded',
      })
      await expectHeading(page, '待出货/出货放行')
      await expectText(page, '归档只读')
      await expectText(page, '本页协同入口')
      await assertNoHorizontalOverflow(
        page,
        'business-standard-shipping-release'
      )
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
      await expectText(page, '本页协同入口')
      await assertBusinessCollaborationPanelCollapsedByDefault(page, {
        scenarioName: 'business-reconciliation-desktop',
      })
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

    const browser = await chromium.launch({
      headless,
      args: ['--no-proxy-server', '--proxy-bypass-list=<-loopback>'],
    })
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
      'localhost',
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
      detached: true,
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

  const devServerPID = devServerProcess.pid
  const killDevServer = (signal) => {
    if (!devServerPID) return
    try {
      process.kill(-devServerPID, signal)
    } catch {
      // Fall through to direct child kill when the process group is gone.
    }
    try {
      process.kill(devServerPID, signal)
    } catch {
      // The process already exited.
    }
    try {
      devServerProcess.kill(signal)
    } catch {
      // The child handle is already closed.
    }
  }

  if (devServerProcess.exitCode === null) {
    killDevServer('SIGTERM')
    await Promise.race([
      new Promise((resolve) => devServerProcess.once('exit', resolve)),
      delay(3000),
    ])
  }

  if (devServerProcess.exitCode === null) {
    killDevServer('SIGKILL')
    await delay(500)
  }

  devServerProcess.stdout?.destroy()
  devServerProcess.stderr?.destroy()
  devServerProcess.unref()
  devServerProcess = null
  await killDevServerPortListeners()
}

async function killDevServerPortListeners() {
  const pids = await listDevServerPortPIDs()
  await Promise.all(
    pids.map(async (pid) => {
      try {
        process.kill(pid, 'SIGTERM')
      } catch {
        return
      }
      await delay(300)
      try {
        process.kill(pid, 0)
      } catch {
        return
      }
      try {
        process.kill(pid, 'SIGKILL')
      } catch {
        // The process exited between checks.
      }
    })
  )
}

function listDevServerPortPIDs() {
  return new Promise((resolve) => {
    const child = spawn('lsof', [
      '-tiTCP:' + String(devServerPort),
      '-sTCP:LISTEN',
    ])
    let output = ''
    child.stdout.on('data', (chunk) => {
      output += chunk.toString()
    })
    child.once('error', () => resolve([]))
    child.once('close', () => {
      resolve(
        output
          .split('\n')
          .map((item) => Number(item.trim()))
          .filter((pid) => Number.isInteger(pid) && pid > 0)
      )
    })
  })
}

async function waitForServer(url) {
  const deadline = Date.now() + 30_000
  let lastError = 'server did not become ready'

  while (Date.now() < deadline) {
    if (devServerProcess?.exitCode !== null) {
      throw new Error(
        `[style:l1] 前端预览进程已退出，无法继续使用可能残留的旧服务\n最近 vite 输出：\n${tailLogs(devServerLogs)}`
      )
    }

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
      if (await canConnectToLocalServer(url)) {
        return
      }
    }
    await delay(300)
  }

  throw new Error(
    `[style:l1] 无法启动前端预览：${lastError}\n最近 vite 输出：\n${tailLogs(devServerLogs)}`
  )
}

function canConnectToLocalServer(url) {
  return new Promise((resolve) => {
    let settled = false
    const { hostname, port, protocol } = new URL(url)
    if (protocol !== 'http:' && protocol !== 'https:') {
      resolve(false)
      return
    }

    const socket = net.createConnection({
      host: hostname,
      port: Number(port || (protocol === 'https:' ? 443 : 80)),
    })
    const timeout = setTimeout(() => {
      if (settled) return
      settled = true
      socket.destroy()
      resolve(false)
    }, 500)

    socket.once('connect', () => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      socket.end()
      resolve(true)
    })
    socket.once('error', () => {
      if (settled) return
      settled = true
      clearTimeout(timeout)
      resolve(false)
    })
  })
}

async function runScenario(browser, scenario) {
  let lastError = null

  for (let attempt = 1; attempt <= scenarioMaxAttempts; attempt += 1) {
    try {
      await runScenarioOnce(browser, scenario)
      return
    } catch (error) {
      lastError = error
      if (
        attempt === scenarioMaxAttempts ||
        !isRetryableScenarioFailure(error)
      ) {
        break
      }

      const reason = String(error?.message || error).split('\n')[0]
      devServerLogs += `\n[style:l1] retry ${scenario.name} ${attempt + 1}/${scenarioMaxAttempts}: ${reason}\n`
      await delay(500 * attempt)
    }
  }

  throw new Error(
    `[style:l1] 场景失败: ${scenario.name}\n${lastError?.message || lastError}\n最近 vite 输出：\n${tailLogs(devServerLogs)}`
  )
}

async function runScenarioOnce(browser, scenario) {
  const context = await browser.newContext({ viewport: scenario.viewport })
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: baseURL,
  })
  const page = await context.newPage()
  const errors = []

  if (scenario.mockAdminRpc) {
    await installAdminRpcMocks(page)
  }

  if (scenario.auth === 'admin' || scenario.auth === 'admin-expired') {
    const token = createMockAdminToken()
    if (scenario.auth === 'admin-expired') {
      await installAdminAuthExpiredRpcMocks(page)
    } else {
      await installAdminRpcMocks(page)
    }
    await page.addInitScript((mockToken) => {
      localStorage.setItem('admin_access_token', mockToken)
      localStorage.setItem('admin_is_super_admin', 'true')
      localStorage.setItem('admin_roles', '[]')
      localStorage.setItem('admin_permissions', '[]')
      localStorage.setItem('admin_menus', '[]')
      localStorage.setItem('erp:last_entry_target', 'desktop')
      localStorage.setItem(
        'admin_erp_preferences',
        JSON.stringify({ column_orders: {} })
      )
    }, token)
  }

  if (scenario.themeMode) {
    await page.addInitScript((themeMode) => {
      localStorage.setItem('plush_erp_theme_mode', themeMode)
    }, scenario.themeMode)
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
    await gotoScenarioPath(page, scenario.path, {
      waitUntil: 'domcontentloaded',
    })
    await waitForScenarioDocumentReady(page)
    await delay(300)

    if (scenario.expectPath) {
      await waitForPath(page, scenario.expectPath)
    }

    await scenario.verify(page)
    await assertNoHorizontalOverflow(page, scenario.name)
    assert.deepEqual(errors, [], `${scenario.name} 出现控制台或运行时错误`)

    const screenshotPath = path.resolve(outputDir, `${scenario.name}.png`)
    await page.screenshot({ path: screenshotPath, fullPage: true })
  } finally {
    await page
      .evaluate(() => {
        localStorage.removeItem('plush_erp_theme_mode')
      })
      .catch(() => {})
    await context.close()
  }
}

async function waitForScenarioDocumentReady(page) {
  await page.waitForLoadState('domcontentloaded', { timeout: 20_000 })
  await page.waitForFunction(
    () =>
      document.readyState !== 'loading' &&
      document.body &&
      document.body.innerText.trim().length > 0,
    null,
    { timeout: 20_000 }
  )
}

function isRetryableScenarioFailure(error) {
  const message = String(error?.message || '')
  return (
    message.includes('Timeout') ||
    message.includes('未找到可见文案') ||
    message.includes('Execution context was destroyed') ||
    message.includes('net::ERR_ADDRESS_INVALID') ||
    message.includes('net::ERR_CONNECTION_REFUSED')
  )
}

async function gotoScenarioPath(page, scenarioPath, options = {}) {
  const url = new URL(scenarioPath, `${baseURL}/`).toString()
  const maxAttempts = 3
  let lastError = null

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await page.goto(url, options)
      return
    } catch (error) {
      lastError = error
      if (!isRetryableLocalNavigationError(error) || attempt === maxAttempts) {
        throw error
      }
      await delay(250 * attempt)
    }
  }

  throw lastError
}

function isRetryableLocalNavigationError(error) {
  const message = String(error?.message || '')
  return (
    message.includes('net::ERR_ADDRESS_INVALID') ||
    message.includes('net::ERR_CONNECTION_REFUSED')
  )
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
      name: '进入业务岗位任务端',
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

    if (method === 'capabilities') {
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
              sms_login: {
                enabled: true,
                mode: 'mock',
                mock_delivery: true,
                disabled_reason: '',
              },
            },
          },
        }),
      })
      return
    }

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

    if (method === 'admin_login') {
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
              ...adminProfile,
              access_token: createMockAdminToken(),
              token_type: 'Bearer',
              expires_at: Math.floor(Date.now() / 1000) + 3600,
            },
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

  await page.route('**/rpc/masterdata', async (route) => {
    const body = route.request().postDataJSON() || {}
    const { id = 'mock-id', method, params = {} } = body
    const customer = {
      id: 1,
      code: 'CUS-STYLE-L1',
      name: '暗色客户',
      short_name: '暗色',
      tax_no: 'TAX-STYLE-L1',
      note: '',
      is_active: true,
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }
    const supplier = {
      id: 1,
      code: 'SUP-STYLE-L1',
      name: '样式供应商',
      short_name: '样式供',
      supplier_type: '加工厂',
      tax_no: '',
      note: '',
      is_active: true,
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }
    const contact = {
      id: 1,
      owner_type: params.owner_type || 'CUSTOMER',
      owner_id: Number(params.owner_id || 1),
      name: '样式联系人',
      mobile: '13800138000',
      phone: '',
      email: '',
      title: '业务',
      is_primary: true,
      is_active: true,
      note: '',
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }

    let data = {}
    switch (method) {
      case 'list_customers':
        data = { customers: [customer], total: 1, limit: 100, offset: 0 }
        break
      case 'list_suppliers':
        data = { suppliers: [supplier], total: 1, limit: 100, offset: 0 }
        break
      case 'list_contacts_by_owner':
        data = { contacts: [contact], total: 1, limit: 100, offset: 0 }
        break
      case 'create_customer':
      case 'update_customer':
      case 'set_customer_active':
      case 'get_customer':
        data = { customer: { ...customer, ...params } }
        break
      case 'create_supplier':
      case 'update_supplier':
      case 'set_supplier_active':
      case 'get_supplier':
        data = { supplier: { ...supplier, ...params } }
        break
      case 'create_contact':
      case 'update_contact':
      case 'set_primary_contact':
      case 'disable_contact':
        data = { contact: { ...contact, ...params } }
        break
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

  await page.route('**/rpc/sales_order', async (route) => {
    const body = route.request().postDataJSON() || {}
    const { id = 'mock-id', method, params = {} } = body
    const salesOrder = {
      id: 1,
      order_no: 'SO-STYLE-L1',
      customer_id: 1,
      customer_snapshot: { id: 1, code: 'CUS-STYLE-L1', name: '暗色客户' },
      customer_order_no: 'PO-STYLE-L1',
      title: '样式销售订单',
      order_date: nowUnix(),
      expected_ship_date: nowUnix() + 86_400,
      lifecycle_status: 'draft',
      note: '',
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }
    const salesOrderItem = {
      id: 1,
      sales_order_id: 1,
      line_no: 1,
      product_id: 1,
      product_snapshot: { id: 1, code: 'PROD-STYLE-L1', name: '样式产品' },
      ordered_quantity: '10',
      unit_id: 1,
      unit_snapshot: { id: 1, code: 'PCS', name: '只' },
      unit_price: '12.50',
      amount: '125.00',
      line_status: 'open',
      note: '',
      created_at: nowUnix(),
      updated_at: nowUnix(),
    }

    let data = {}
    switch (method) {
      case 'list_sales_orders':
        data = { sales_orders: [salesOrder], total: 1, limit: 100, offset: 0 }
        break
      case 'list_sales_order_items':
        data = {
          sales_order_items: [salesOrderItem],
          total: 1,
          limit: 100,
          offset: 0,
        }
        break
      case 'create_sales_order':
      case 'update_sales_order':
      case 'get_sales_order':
      case 'submit_sales_order':
      case 'activate_sales_order':
      case 'close_sales_order':
      case 'cancel_sales_order':
        data = { sales_order: { ...salesOrder, ...params } }
        break
      case 'add_sales_order_item':
      case 'update_sales_order_item':
      case 'remove_sales_order_item':
        data = { sales_order_item: { ...salesOrderItem, ...params } }
        break
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

  const workflowTasks = []
  const workflowBusinessStates = []
  const businessRecords = [
    {
      id: 9001,
      module_key: 'products',
      document_no: 'ARCH-PROD-001',
      title: 'Archive 样品小熊',
      product_no: 'SKU-ARCH-001',
      product_name: 'Archive 样品小熊',
      customer_name: 'Archive 客户',
      quantity: 1,
      unit: '只',
      amount: 0,
      business_status_key: 'closed',
      owner_role_key: 'business',
      payload: { archive_fixture: true },
      items: [],
      created_at: 1714000000,
      updated_at: 1714000000,
    },
    {
      id: 9002,
      module_key: 'material-bom',
      document_no: 'ARCH-BOM-001',
      title: 'Archive 小熊 BOM',
      product_name: 'Archive 样品小熊',
      material_name: 'PP 棉',
      quantity: 3,
      unit: 'kg',
      amount: 37.5,
      business_status_key: 'closed',
      owner_role_key: 'pmc',
      payload: { archive_fixture: true },
      items: [
        {
          id: 1,
          name: 'PP 棉',
          quantity: 3,
          unit: 'kg',
          amount: 37.5,
          payload: { archive_fixture: true },
        },
      ],
      created_at: 1714000100,
      updated_at: 1714000100,
    },
    {
      id: 9003,
      module_key: 'accessories-purchase',
      document_no: 'ARCH-PUR-001',
      title: 'Archive 辅料采购',
      supplier_name: 'Archive 供应商',
      material_name: 'PP 棉',
      purchase_date: '2026-04-28',
      return_date: '2026-04-30',
      quantity: 3,
      unit: 'kg',
      amount: 37.5,
      business_status_key: 'closed',
      owner_role_key: 'purchase',
      payload: {
        archive_fixture: true,
        purchase_date: '2026-04-28',
        return_date: '2026-04-30',
      },
      items: [
        {
          id: 1,
          name: 'PP 棉',
          quantity: 3,
          unit: 'kg',
          unit_price: 12.5,
          amount: 37.5,
          payload: { archive_fixture: true },
        },
      ],
      created_at: 1714000200,
      updated_at: 1714000200,
    },
    {
      id: 9004,
      module_key: 'processing-contracts',
      document_no: 'ARCH-PC-001',
      title: 'Archive 委外加工',
      supplier_name: 'Archive 加工商',
      product_name: 'Archive 样品小熊',
      quantity: 100,
      unit: '只',
      amount: 1200,
      business_status_key: 'closed',
      owner_role_key: 'production',
      payload: { archive_fixture: true },
      items: [],
      created_at: 1714000300,
      updated_at: 1714000300,
    },
    {
      id: 9005,
      module_key: 'shipping-release',
      document_no: 'ARCH-OUT-001',
      title: 'Archive 出货放行',
      source_no: 'SO-ARCH-001',
      customer_name: 'Archive 客户',
      product_name: 'Archive 样品小熊',
      quantity: 60,
      unit: '箱',
      amount: 3600,
      business_status_key: 'shipping_released',
      owner_role_key: 'warehouse',
      payload: { archive_fixture: true, shipment_release_result: 'done' },
      items: [],
      created_at: 1714000400,
      updated_at: 1714000400,
    },
  ]
  let workflowTaskID = 1
  let workflowBusinessStateID = 1
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
      case 'create_record':
      case 'update_record':
      case 'delete_records':
      case 'restore_record':
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            jsonrpc: '2.0',
            id,
            result: {
              code: 400,
              message: 'business_records 已归档为只读，请使用对应领域入口',
              data: null,
            },
          }),
        })
        return
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
          task_name: params.task_name || '订单/款式立项 跟进',
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
  await locator.waitFor({ state: 'visible', timeout: 20_000 })
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

async function assertBusinessSelectionActionBarEmpty(page, { scenarioName }) {
  const actionBar = page.locator('.erp-business-module-current-action')
  await actionBar.waitFor({ state: 'visible', timeout: 10_000 })
  await actionBar.getByText('已选 0 条').waitFor({
    state: 'visible',
    timeout: 10_000,
  })
  await actionBar.getByText('请先单击或勾选一条记录').waitFor({
    state: 'visible',
    timeout: 10_000,
  })

  const disabledButtonChecks = [
    { label: '清空已选' },
    { label: '查看' },
    { label: '关联表格' },
    { label: '创建协同任务' },
    { label: '流转', ariaLabel: '流转业务状态' },
    { label: '删除' },
    { label: '批量删除' },
  ]
  const buttonMetrics = await actionBar.evaluate((element) =>
    Array.from(element.querySelectorAll('button')).map((button) => ({
      text: String(button.textContent || '')
        .replace(/\s+/g, ' ')
        .trim(),
      ariaLabel: button.getAttribute('aria-label') || '',
      disabled: button.disabled,
    }))
  )
  for (const { label, ariaLabel } of disabledButtonChecks) {
    const button = buttonMetrics.find(
      (item) => item.text === label || item.ariaLabel === ariaLabel
    )
    assert(
      button,
      `${scenarioName} 未选中记录时缺少 ${label} 按钮: ${JSON.stringify(buttonMetrics)}`
    )
    assert(
      button.disabled,
      `${scenarioName} 未选中记录时 ${label} 应保持禁用: ${JSON.stringify(buttonMetrics)}`
    )
  }

  await assertBusinessSelectionActionBarBoxModel(page, {
    scenarioName,
    expectedMode: 'empty',
  })
}

async function assertBusinessArchiveReadonlyToolbar(page, { scenarioName }) {
  const archiveButton = page.getByRole('button', { name: '归档只读' })
  await archiveButton.waitFor({ state: 'visible', timeout: 10_000 })
  assert.equal(
    await archiveButton.isDisabled(),
    true,
    `${scenarioName} 旧业务页新建入口应禁用为归档只读`
  )
}

async function openBusinessArchiveRecordModal(
  page,
  { scenarioName, recordText }
) {
  const row = page
    .locator('.erp-business-module-table-card .ant-table-tbody tr')
    .filter({ hasText: recordText })
    .first()
  await row.waitFor({ state: 'visible', timeout: 10_000 })
  await row.click()
  await page
    .locator('.erp-business-module-current-action')
    .getByRole('button', { name: '查看' })
    .click()
  const dialog = page.locator('.erp-business-record-modal:visible').last()
  await dialog.waitFor({ state: 'visible', timeout: 10_000 })
  await expectText(page, '归档查看')
  await expectText(page, 'business_records 已归档为 legacy/archive 只读')

  const readonlyMetrics = await dialog.evaluate((element) => {
    const disabledControls = element.querySelectorAll(
      'input:disabled, textarea:disabled, button:disabled, .ant-select-disabled, .ant-input-number-disabled'
    )
    const okButton = Array.from(
      element.querySelectorAll('.ant-modal-footer button')
    ).find((button) =>
      String(button.textContent || '')
        .replace(/\s+/g, '')
        .includes('只读归档')
    )
    return {
      disabledControlCount: disabledControls.length,
      okButtonText: okButton?.textContent?.replace(/\s+/g, ' ').trim() || '',
      okButtonDisabled: Boolean(okButton?.disabled),
    }
  })
  assert(
    readonlyMetrics.disabledControlCount > 0,
    `${scenarioName} 归档查看弹窗应存在禁用表单控件: ${JSON.stringify(
      readonlyMetrics
    )}`
  )
  assert.equal(
    readonlyMetrics.okButtonDisabled,
    true,
    `${scenarioName} 归档查看确认按钮应禁用: ${JSON.stringify(readonlyMetrics)}`
  )

  return dialog
}

async function assertBusinessSelectionActionBarBoxModel(
  page,
  { scenarioName, expectedMode }
) {
  const metrics = await page.evaluate(() => {
    const rectOf = (selector, root = document) => {
      const element = root.querySelector(selector)
      if (!(element instanceof HTMLElement)) return null
      const rect = element.getBoundingClientRect()
      const style = window.getComputedStyle(element)
      return {
        className: element.className,
        text: element.textContent?.replace(/\s+/g, ' ').trim() || '',
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
        clientWidth: element.clientWidth,
        scrollWidth: element.scrollWidth,
        overflowX: style.overflowX,
        overflowY: style.overflowY,
        display: style.display,
        flexWrap: style.flexWrap,
      }
    }
    const actionBar = document.querySelector(
      '.erp-business-module-current-action'
    )
    const actionBarMetrics =
      actionBar instanceof HTMLElement
        ? {
            ...rectOf('.erp-business-module-current-action'),
            hasEmptyClass: actionBar.classList.contains(
              'erp-business-selection-action-bar--empty'
            ),
            hasActiveClass: actionBar.classList.contains(
              'erp-business-selection-action-bar--active'
            ),
          }
        : null

    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      documentWidth: document.documentElement.scrollWidth,
      actionBar: actionBarMetrics,
      row: actionBar
        ? rectOf('.erp-business-selection-action-bar__row', actionBar)
        : null,
      copy: actionBar
        ? rectOf('.erp-business-selection-action-bar__copy', actionBar)
        : null,
      tag: actionBar
        ? rectOf('.erp-business-selection-action-bar__tag', actionBar)
        : null,
      actions: actionBar
        ? rectOf('.erp-business-selection-action-bar__actions', actionBar)
        : null,
      tableCard: rectOf('.erp-business-module-table-card'),
    }
  })

  assert(
    metrics.actionBar,
    `${scenarioName} 缺少业务选中操作条: ${JSON.stringify(metrics)}`
  )
  assert(
    expectedMode === 'empty'
      ? metrics.actionBar.hasEmptyClass && !metrics.actionBar.hasActiveClass
      : metrics.actionBar.hasActiveClass,
    `${scenarioName} 选中操作条状态类异常: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.row?.flexWrap === 'nowrap' || metrics.row?.display === 'flex',
    `${scenarioName} 选中操作条行布局异常: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.actionBar.scrollWidth <= metrics.actionBar.clientWidth + 2,
    `${scenarioName} 选中操作条出现横向溢出: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.actions.scrollWidth <= metrics.actions.clientWidth + 2,
    `${scenarioName} 选中操作按钮区出现横向溢出: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.documentWidth <= metrics.viewport.width + 2,
    `${scenarioName} 页面出现横向滚动: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.tableCard?.top > metrics.actionBar.bottom,
    `${scenarioName} 表格卡片与选中操作条发生重叠: ${JSON.stringify(metrics)}`
  )
}

async function assertOpenDropdownInViewport(page, { scenarioName }) {
  const metrics = await page.evaluate(() => {
    const dropdown = document.querySelector(
      '.ant-dropdown:not(.ant-dropdown-hidden)'
    )
    if (!(dropdown instanceof HTMLElement)) return null
    const rect = dropdown.getBoundingClientRect()
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      width: rect.width,
      height: rect.height,
      text: dropdown.textContent?.replace(/\s+/g, ' ').trim() || '',
    }
  })

  assert(metrics, `${scenarioName} 未找到打开的下拉菜单`)
  assert(
    metrics.top >= 0 &&
      metrics.left >= 0 &&
      metrics.bottom <= metrics.viewport.height + 1 &&
      metrics.right <= metrics.viewport.width + 1,
    `${scenarioName} 下拉菜单超出视口: ${JSON.stringify(metrics)}`
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

async function assertMobileTaskRefreshFeedback(page, { scenarioName }) {
  const refreshButton = page
    .locator('.mobile-role-tasks-page header button')
    .filter({ hasText: '刷新' })
    .first()
  await refreshButton.waitFor({ state: 'visible', timeout: 10_000 })
  await refreshButton.click()
  await expectText(page, '数据已刷新')
  const beforeFailureMetrics = await readMobileTaskVisibleListMetrics(
    page,
    '.erp-mobile-list-item'
  )

  let failedOnce = false
  await page.route('**/rpc/workflow', async (route) => {
    const body = route.request().postDataJSON() || {}
    if (!failedOnce && body.method === 'list_tasks') {
      failedOnce = true
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: body.id || 'mobile-refresh-failed',
          result: {
            code: 500123,
            message: 'refresh failed',
            data: null,
          },
        }),
      })
      return
    }
    await route.fallback()
  })

  await refreshButton.click()
  await expectText(page, '刷新移动端任务失败，已保留上次数据')
  const afterFailureMetrics = await readMobileTaskVisibleListMetrics(
    page,
    '.erp-mobile-list-item'
  )
  assert.equal(
    afterFailureMetrics.itemCount,
    beforeFailureMetrics.itemCount,
    `${scenarioName} 刷新失败后没有保留上次任务列表: ${JSON.stringify({ beforeFailureMetrics, afterFailureMetrics })}`
  )
}

async function verifyBusinessModuleColumnOrderDialog(
  page,
  { moduleKey = 'project-orders', heading = '订单/款式立项' } = {}
) {
  const storageKey = `erp.module.column-order.${moduleKey}`
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
  await expectHeading(page, heading)
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
      const text = message.text()
      if (!isIgnorableDevServerError(text)) {
        popupErrors.push(`popup console error: ${text}`)
      }
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
    page.getByRole('button', { name: '打印当前模板' }).click(),
  ])
  const mockToken = createMockAdminToken()
  await installAdminRpcMocks(popup)
  await popup.addInitScript((token) => {
    localStorage.setItem('admin_access_token', token)
  }, mockToken)
  const popupErrors = []

  popup.on('console', (message) => {
    if (message.type() === 'error') {
      const text = message.text()
      if (!isIgnorableDevServerError(text)) {
        popupErrors.push(`popup console error: ${text}`)
      }
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
        const style = window.getComputedStyle(control)
        return {
          text: control.textContent?.trim()?.slice(0, 32) || '',
          width: rect.width,
          height: rect.height,
          borderRadius: style.borderRadius,
          borderColor: style.borderColor,
        }
      })
    const bodyRect = body?.getBoundingClientRect()

    return {
      hasPermissionModalClass: node.classList.contains('erp-permission-modal'),
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
    metrics.hasPermissionModalClass,
    `${scenarioName} 权限弹窗未挂载 erp-permission-modal，输入控件无法继承统一样式: ${JSON.stringify(metrics)}`
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
  const controlRadii = [
    ...new Set(metrics.controls.map((control) => control.borderRadius)),
  ]
  assert(
    controlRadii.length === 1 && controlRadii[0] === '10px',
    `${scenarioName} 创建管理员弹窗输入框圆角不一致: ${JSON.stringify(metrics)}`
  )
}

async function assertAntdModalCenteredImpl(page, modalLocator, scenarioName) {
  await modalLocator.waitFor({ state: 'visible', timeout: 10_000 })
  await modalLocator
    .waitFor({
      state: 'visible',
      timeout: 10_000,
    })
    .catch(() => {})
  await page.waitForFunction(
    (selector) => {
      const modals = Array.from(document.querySelectorAll(selector)).filter(
        (node) => {
          const rect = node.getBoundingClientRect()
          const style = window.getComputedStyle(node)
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            style.display !== 'none' &&
            style.visibility !== 'hidden'
          )
        }
      )
      const modal = modals.at(-1)
      if (!modal) return false
      const className = String(modal.className || '')
      return (
        !className.includes('ant-zoom-enter') &&
        !className.includes('ant-zoom-appear')
      )
    },
    '.ant-modal',
    { timeout: 10_000 }
  )

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
      modalClassName: String(modal?.className || ''),
      modalTitle: String(
        modal?.querySelector('.ant-modal-title')?.textContent || ''
      ).trim(),
      modalStyle: modal?.getAttribute('style') || '',
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
  const horizontalCenterTolerance =
    metrics.modal.width >= metrics.viewport.width * 0.85 ? 20 : 3
  assert(
    Math.abs(metrics.modal.centerX - metrics.viewport.width / 2) <=
      horizontalCenterTolerance,
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

async function assertPermissionSectionVisualSeparation(page, { scenarioName }) {
  const metrics = await page.evaluate(() => {
    const adminSection = document.querySelector(
      '.erp-permission-section--admins'
    )
    const roleSection = document.querySelector('.erp-permission-section--roles')
    const read = (node) => {
      if (!node) return null
      const style = window.getComputedStyle(node)
      const rect = node.getBoundingClientRect()
      return {
        top: rect.top,
        background: style.background,
        backgroundColor: style.backgroundColor,
        borderColor: style.borderColor,
      }
    }
    return {
      admin: read(adminSection),
      role: read(roleSection),
    }
  })
  assert(
    metrics.admin && metrics.role,
    `${scenarioName} 未找到权限管理两个主模块: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.admin.top < metrics.role.top,
    `${scenarioName} 管理员模块应在角色权限模块前: ${JSON.stringify(metrics)}`
  )
  assert.notEqual(
    metrics.admin.borderColor,
    metrics.role.borderColor,
    `${scenarioName} 暗色下两个模块边框颜色不可相同: ${JSON.stringify(metrics)}`
  )
  assert.notEqual(
    metrics.admin.background,
    metrics.role.background,
    `${scenarioName} 暗色下两个模块背景不可相同: ${JSON.stringify(metrics)}`
  )
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
  {
    scenarioName,
    minModalWidth,
    expectCompactGrid,
    expectDarkChrome = false,
    expectReadonly = false,
  }
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
    const mask = document.querySelector('.ant-modal-mask')
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
            disabled: Boolean(
              control.matches(':disabled') ||
                control.className.includes(
                  'ant-input-affix-wrapper-disabled'
                ) ||
                control.closest(
                  '.ant-select-disabled, .ant-input-number-disabled, .ant-picker-disabled'
                )
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
    const itemSummaryMetrics = modal
      ? Array.from(modal.querySelectorAll('.erp-item-summary-metric')).map(
          (metric) => {
            const style = window.getComputedStyle(metric)
            const label = metric.querySelector('.ant-typography')
            const labelStyle = label ? window.getComputedStyle(label) : null
            const value = metric.querySelector('.erp-item-summary-value')
            const valueStyle = value ? window.getComputedStyle(value) : null
            const rect = metric.getBoundingClientRect()
            return {
              text: metric.textContent?.replace(/\s+/g, ' ').trim() || '',
              width: rect.width,
              height: rect.height,
              backgroundColor: style.backgroundColor,
              borderColor: style.borderColor,
              color: style.color,
              labelColor: labelStyle?.color || '',
              valueColor: valueStyle?.color || '',
            }
          }
        )
      : []
    const headerFieldCols = fieldCols.filter(
      (col) => !String(col.text || '').startsWith('来源带值')
    )
    const firstRowCols = headerFieldCols.slice(0, 6)
    const modalRect = modal?.getBoundingClientRect()
    const contentStyle = content ? window.getComputedStyle(content) : null
    const headerStyle = header ? window.getComputedStyle(header) : null
    const bodyRect = body?.getBoundingClientRect()
    const bodyStyle = body ? window.getComputedStyle(body) : null
    const footerStyle = footer ? window.getComputedStyle(footer) : null
    const maskStyle = mask ? window.getComputedStyle(mask) : null
    const nestedHorizontalScrollContainers = body
      ? Array.from(
          body.querySelectorAll(
            '.erp-business-record-form__items-scroll, .erp-item-card-horizontal-scroll .ant-card-body'
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
            mask: {
              backgroundColor: maskStyle?.backgroundColor,
              backdropFilter: maskStyle?.backdropFilter,
            },
            content: {
              borderTopWidth: contentStyle?.borderTopWidth,
              borderRightWidth: contentStyle?.borderRightWidth,
              borderBottomWidth: contentStyle?.borderBottomWidth,
              borderLeftWidth: contentStyle?.borderLeftWidth,
              borderTopColor: contentStyle?.borderTopColor,
              borderRadius: contentStyle?.borderRadius,
              backgroundColor: contentStyle?.backgroundColor,
              boxShadow: contentStyle?.boxShadow,
              paddingTop: contentStyle?.paddingTop,
              paddingRight: contentStyle?.paddingRight,
              paddingBottom: contentStyle?.paddingBottom,
              paddingLeft: contentStyle?.paddingLeft,
            },
            header: {
              borderBottomWidth: headerStyle?.borderBottomWidth,
              borderBottomColor: headerStyle?.borderBottomColor,
              backgroundColor: headerStyle?.backgroundColor,
            },
            footer: {
              borderTopWidth: footerStyle?.borderTopWidth,
              borderTopColor: footerStyle?.borderTopColor,
              backgroundColor: footerStyle?.backgroundColor,
            },
          }
        : null,
      body: bodyRect
        ? {
            width: bodyRect.width,
            clientWidth: body.clientWidth,
            height: bodyRect.height,
            clientHeight: body.clientHeight,
            scrollHeight: body.scrollHeight,
            scrollWidth: body.scrollWidth,
            overflowX: bodyStyle?.overflowX,
            overflowY: bodyStyle?.overflowY,
          }
        : null,
      fieldCols,
      headerFieldCols,
      firstRowCols,
      controls,
      addItemButton,
      itemSummaryMetrics,
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
  if (expectDarkChrome) {
    assertDarkModalChrome(metrics, scenarioName)
  } else {
    assertTradeLikeModalChrome(metrics, scenarioName)
  }
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
  const bodyHorizontalOverflow =
    metrics.body.scrollWidth - (metrics.body.clientWidth || metrics.body.width)
  const hasOnlyClippedScrollbarOverflow =
    metrics.body?.overflowX === 'hidden' && bodyHorizontalOverflow <= 16
  assert(
    bodyHorizontalOverflow <= 8 ||
      hasOnlyClippedScrollbarOverflow ||
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
  if (expectDarkChrome) {
    assertDarkModalControls(metrics, scenarioName)
    assertDarkItemSummaryMetrics(metrics, scenarioName)
  } else {
    assertTradeLikeModalControls(metrics, scenarioName)
    if (!expectReadonly) {
      await assertBusinessRecordModalFocusStyle(page, scenarioName)
    }
  }

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
    const itemsScroll = modal?.querySelector(
      '.erp-business-record-form__items-scroll'
    )
    const itemsScrollStyle = itemsScroll
      ? window.getComputedStyle(itemsScroll)
      : null
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
          const fields = Array.from(
            card.querySelectorAll('.erp-item-field-stack')
          ).map((field) => {
            const fieldRect = field.getBoundingClientRect()
            const label =
              field
                .querySelector('.erp-item-field-label')
                ?.textContent?.trim() || ''
            const control = field.querySelector(
              '.ant-input, .ant-input-number, .ant-picker, .ant-select-selector, .ant-space-compact'
            )
            const controlRect = control?.getBoundingClientRect()
            return {
              label,
              width: fieldRect.width,
              controlWidth: controlRect?.width || 0,
            }
          })
          return {
            width: rect.width,
            borderRadius: cardStyle.borderRadius,
            backgroundColor: cardStyle.backgroundColor,
            headMinHeight: Number.parseFloat(headStyle?.minHeight || '0'),
            bodyOverflowX: bodyStyle?.overflowX || '',
            rowFlexWrap: rowStyle?.flexWrap || '',
            rowMinWidth: row ? row.scrollWidth : 0,
            bodyClientWidth: cardBody ? cardBody.clientWidth : 0,
            fields,
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
      itemsScroll: itemsScroll
        ? {
            width: itemsScroll.getBoundingClientRect().width,
            clientWidth: itemsScroll.clientWidth,
            scrollWidth: itemsScroll.scrollWidth,
            overflowX: itemsScrollStyle?.overflowX || '',
            overflowY: itemsScrollStyle?.overflowY || '',
          }
        : null,
      cardCount: cards.length,
      cards,
      perCardScrollClassCount: modal
        ? modal.querySelectorAll('.erp-item-card-horizontal-scroll').length
        : 0,
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
  assert(
    metrics.itemsScroll,
    `${scenarioName} 缺少整组条目滚动容器: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    metrics.perCardScrollClassCount,
    0,
    `${scenarioName} 仍残留逐条滚动卡片类名: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.itemsScroll.width <= metrics.body.width + 8 &&
      metrics.itemsScroll.overflowX === 'auto' &&
      metrics.itemsScroll.scrollWidth > metrics.itemsScroll.clientWidth + 8,
    `${scenarioName} 整组条目容器未接管横向滚动: ${JSON.stringify(metrics)}`
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
    assert.notEqual(
      card.bodyOverflowX,
      'auto',
      `${scenarioName} 条目卡片仍在逐条接管横向滚动: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      card.rowFlexWrap,
      'nowrap',
      `${scenarioName} 条目字段未保持单行横向风格: ${JSON.stringify(metrics)}`
    )
    assert(
      card.width >= card.rowMinWidth &&
        card.rowMinWidth >= card.bodyClientWidth - 24,
      `${scenarioName} 条目行宽未形成整组横向预算: ${JSON.stringify(metrics)}`
    )
    card.fields.forEach((field) => {
      assert(
        field.width <= 360 && field.controlWidth <= 360,
        `${scenarioName} 条目输入框宽度未按短字段预算收口: ${JSON.stringify(metrics)}`
      )
    })
    const colorField = card.fields.find((field) => field.label === '颜色')
    if (colorField) {
      assert(
        colorField.width <= 220 && colorField.controlWidth <= 220,
        `${scenarioName} 颜色字段仍然过宽: ${JSON.stringify(metrics)}`
      )
    }
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

async function assertPartnerContactItemFocusConsistency(
  page,
  dialog,
  { scenarioName }
) {
  const contactTargets = [
    {
      label: '联系人',
      value: '超长联系人姓名ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789',
    },
    { label: '办公室电话', value: '0571-88888888-1234567890' },
    { label: '手机', value: '138001380001234567890' },
    {
      label: '邮箱',
      value: 'very-long-contact-email-address-for-style-l1@example.com',
    },
  ]

  const checked = []
  for (const target of contactTargets) {
    const fieldStack = dialog
      .locator('.erp-item-field-stack')
      .filter({ hasText: target.label })
      .first()
    await fieldStack.waitFor({ state: 'visible', timeout: 10_000 })
    const input = fieldStack.locator('input.ant-input:not([disabled])').first()
    await input.fill(target.value)
    await input.focus()
    await page.waitForTimeout(220)

    const metrics = await input.evaluate((node, label) => {
      const focusedControl =
        node.closest('.ant-input-affix-wrapper') ||
        node.closest('.ant-input-number') ||
        node.closest('.ant-picker') ||
        node
      const controlStyle = window.getComputedStyle(focusedControl)
      const sourceStyle = window.getComputedStyle(node)
      const fieldStackNode = node.closest('.erp-item-field-stack')
      const itemCardStack = node.closest(
        '.erp-business-record-form__item-card-stack'
      )
      const itemCardStackStyle = itemCardStack
        ? window.getComputedStyle(itemCardStack)
        : null
      const itemsScroll = node.closest(
        '.erp-business-record-form__items-scroll'
      )
      const itemsScrollStyle = itemsScroll
        ? window.getComputedStyle(itemsScroll)
        : null
      const itemCard = node.closest('.erp-item-card')
      const itemCardStyle = itemCard ? window.getComputedStyle(itemCard) : null
      const itemCardHead = itemCard?.querySelector('.ant-card-head')
      const itemCardHeadStyle = itemCardHead
        ? window.getComputedStyle(itemCardHead)
        : null
      const itemCardBody = itemCard?.querySelector('.ant-card-body')
      const itemCardBodyStyle = itemCardBody
        ? window.getComputedStyle(itemCardBody)
        : null
      const row = itemCard?.querySelector('.erp-item-card-row')
      const rowStyle = row ? window.getComputedStyle(row) : null
      const fieldRect = fieldStackNode?.getBoundingClientRect()
      const controlRect = focusedControl.getBoundingClientRect()

      return {
        label,
        borderColor: controlStyle.borderColor,
        boxShadow: controlStyle.boxShadow,
        sourceBorderColor: sourceStyle.borderColor,
        sourceBoxShadow: sourceStyle.boxShadow,
        control: {
          width: controlRect.width,
          height: controlRect.height,
          overflowX: controlStyle.overflowX,
          textOverflow: controlStyle.textOverflow,
          whiteSpace: controlStyle.whiteSpace,
        },
        field: fieldRect
          ? {
              width: fieldRect.width,
              scrollWidth: fieldStackNode.scrollWidth,
            }
          : null,
        row: row
          ? {
              clientWidth: row.clientWidth,
              scrollWidth: row.scrollWidth,
              flexWrap: rowStyle?.flexWrap || '',
            }
          : null,
        body: itemCardBody
          ? {
              clientWidth: itemCardBody.clientWidth,
              scrollWidth: itemCardBody.scrollWidth,
              overflowX: itemCardBodyStyle?.overflowX || '',
              overflowY: itemCardBodyStyle?.overflowY || '',
              backgroundColor: itemCardBodyStyle?.backgroundColor || '',
            }
          : null,
        stack: itemCardStack
          ? {
              overflowX: itemCardStackStyle?.overflowX || '',
              overflowY: itemCardStackStyle?.overflowY || '',
            }
          : null,
        itemsScroll: itemsScroll
          ? {
              clientWidth: itemsScroll.clientWidth,
              scrollWidth: itemsScroll.scrollWidth,
              overflowX: itemsScrollStyle?.overflowX || '',
              overflowY: itemsScrollStyle?.overflowY || '',
            }
          : null,
        itemCard: itemCard
          ? {
              borderColor: itemCardStyle?.borderColor,
              boxShadow: itemCardStyle?.boxShadow,
              backgroundColor: itemCardStyle?.backgroundColor,
              transform: itemCardStyle?.transform,
              headBackgroundColor: itemCardHeadStyle?.backgroundColor,
              headBorderColor: itemCardHeadStyle?.borderBottomColor,
              bodyBackgroundColor: itemCardBodyStyle?.backgroundColor,
            }
          : null,
      }
    }, target.label)

    checked.push(metrics)
  }

  assert.equal(
    checked.length,
    contactTargets.length,
    `${scenarioName} 未完整验证联系人明细 focus: ${JSON.stringify(checked)}`
  )

  checked.forEach((metrics) => {
    assert(
      isAcceptedFocusBorder(metrics),
      `${scenarioName} ${metrics.label} 输入框 focus 边框未统一到绿色主题: ${JSON.stringify(metrics)}`
    )
    assertNoBlueFocusStyle(metrics, scenarioName)
    assert(
      metrics.itemCard && isGreenFocusColor(metrics.itemCard.borderColor),
      `${scenarioName} ${metrics.label} 条目卡片 focus 边框未统一到绿色主题: ${JSON.stringify(metrics)}`
    )
    assert(
      sameCSSColor(metrics.borderColor, metrics.itemCard.borderColor),
      `${scenarioName} ${metrics.label} 条目卡片边框和输入框 focus 边框不一致: ${JSON.stringify(metrics)}`
    )
    assert(
      sameCSSColor(
        metrics.itemCard.backgroundColor,
        metrics.itemCard.headBackgroundColor
      ) &&
        sameCSSColor(
          metrics.itemCard.backgroundColor,
          metrics.itemCard.bodyBackgroundColor
        ),
      `${scenarioName} ${metrics.label} 条目卡片 focus 头部和内容底色不一致: ${JSON.stringify(metrics)}`
    )
    assert(
      !hasBlueFocusRing(metrics.itemCard.boxShadow) &&
        !hasBlueFocusRing(metrics.itemCard.backgroundColor) &&
        !hasBlueFocusRing(metrics.itemCard.headBackgroundColor) &&
        !hasBlueFocusRing(metrics.itemCard.headBorderColor),
      `${scenarioName} ${metrics.label} 条目卡片 focus 仍残留蓝色高亮: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.field &&
        metrics.control.width <= metrics.field.width + 2 &&
        metrics.field.scrollWidth <= metrics.field.width + 2,
      `${scenarioName} ${metrics.label} 长文本撑开了明细字段: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.body?.overflowX !== 'auto' &&
        metrics.itemsScroll?.overflowX === 'auto' &&
        metrics.itemsScroll.scrollWidth >= metrics.itemsScroll.clientWidth,
      `${scenarioName} ${metrics.label} 整组条目横向滚动容器异常: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.stack?.overflowX === 'visible' &&
        metrics.stack?.overflowY === 'visible',
      `${scenarioName} ${metrics.label} 条目卡片外圈被父容器裁剪: ${JSON.stringify(metrics)}`
    )
  })

  const firstFocusStyle = {
    borderColor: checked[0].borderColor,
    boxShadow: checked[0].boxShadow,
    itemCard: checked[0].itemCard,
  }
  checked.slice(1).forEach((metrics) => {
    assert.deepEqual(
      {
        borderColor: metrics.borderColor,
        boxShadow: metrics.boxShadow,
        itemCard: metrics.itemCard,
      },
      firstFocusStyle,
      `${scenarioName} ${metrics.label} focus 样式与联系人不一致: ${JSON.stringify(checked)}`
    )
  })

  await page.evaluate(() => {
    document.activeElement?.blur?.()
  })
  await page.waitForTimeout(220)
  const recovered = await dialog
    .locator('.erp-item-card')
    .first()
    .evaluate((node) => {
      const style = window.getComputedStyle(node)
      const head = node.querySelector('.ant-card-head')
      const headStyle = head ? window.getComputedStyle(head) : null
      return {
        borderColor: style.borderColor,
        boxShadow: style.boxShadow,
        backgroundColor: style.backgroundColor,
        transform: style.transform,
        headBackgroundColor: headStyle?.backgroundColor || '',
        bodyBackgroundColor:
          window.getComputedStyle(node.querySelector('.ant-card-body'))
            ?.backgroundColor || '',
      }
    })
  assert(
    !isGreenFocusColor(recovered.borderColor) &&
      recovered.boxShadow === 'none' &&
      !isGreenFocusColor(recovered.headBackgroundColor),
    `${scenarioName} blur 后条目卡片未恢复默认态: ${JSON.stringify(recovered)}`
  )
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

function assertDarkModalChrome(metrics, scenarioName) {
  const chrome = metrics.modalChrome
  assert(
    chrome?.content,
    `${scenarioName} 缺少可检查的暗色弹窗壳层样式: ${JSON.stringify(metrics)}`
  )

  const pixel = (value) => Number.parseFloat(String(value || '0'))
  const maskAlpha = readCssAlpha(chrome.mask?.backgroundColor)
  assert(
    maskAlpha >= 0.55,
    `${scenarioName} 暗色弹窗遮罩过浅，背景和弹窗容易融在一起: ${JSON.stringify(chrome)}`
  )
  assert(
    String(chrome.mask?.backdropFilter || '') !== 'none',
    `${scenarioName} 暗色弹窗遮罩缺少背景虚化层级: ${JSON.stringify(chrome)}`
  )
  assert(
    pixel(chrome.content.borderTopWidth) >= 1 &&
      pixel(chrome.content.borderRightWidth) >= 1 &&
      pixel(chrome.content.borderBottomWidth) >= 1 &&
      pixel(chrome.content.borderLeftWidth) >= 1,
    `${scenarioName} 暗色弹窗壳层缺少可见边框: ${JSON.stringify(chrome)}`
  )
  assert(
    isLightSlateBorderColor(chrome.content.borderTopColor),
    `${scenarioName} 暗色弹窗边框颜色不够清楚: ${JSON.stringify(chrome)}`
  )
  assert(
    String(chrome.content.boxShadow || '') !== 'none',
    `${scenarioName} 暗色弹窗缺少浮层阴影: ${JSON.stringify(chrome)}`
  )
  assert(
    pixel(chrome.header?.borderBottomWidth) >= 1,
    `${scenarioName} 暗色弹窗头部缺少分割线: ${JSON.stringify(chrome)}`
  )
  assert(
    pixel(chrome.footer?.borderTopWidth) >= 1,
    `${scenarioName} 暗色弹窗底部缺少分割线: ${JSON.stringify(chrome)}`
  )
  assert(
    !sameCSSColor(
      chrome.content.backgroundColor,
      chrome.header.backgroundColor
    ) ||
      !sameCSSColor(
        chrome.content.backgroundColor,
        chrome.footer.backgroundColor
      ) ||
      pixel(chrome.header.borderBottomWidth) >= 1,
    `${scenarioName} 暗色弹窗标题区、内容区和底部缺少层级区分: ${JSON.stringify(chrome)}`
  )

  const radius = pixel(chrome.content.borderRadius)
  assert(
    Number.isFinite(radius) && radius >= 10 && radius <= 18,
    `${scenarioName} 暗色弹窗圆角异常: ${JSON.stringify(chrome)}`
  )
  assert(
    pixel(chrome.content.paddingTop) === 0 &&
      pixel(chrome.content.paddingRight) === 0 &&
      pixel(chrome.content.paddingBottom) === 0 &&
      pixel(chrome.content.paddingLeft) === 0,
    `${scenarioName} 暗色弹窗壳层应由 header/body/footer 管理间距: ${JSON.stringify(chrome)}`
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
      control.disabled
        ? control.backgroundColor === 'rgb(255, 255, 255)' ||
            isLightReadonlyDisabledBackground(control.backgroundColor)
        : control.backgroundColor === 'rgb(255, 255, 255)',
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

  const primaryButtons = visibleControls.filter(
    (control) =>
      control.className.includes('ant-btn-primary') && !control.disabled
  )
  primaryButtons.forEach((control) => {
    assert(
      isGreenFocusColor(control.backgroundColor) ||
        isGreenFocusColor(control.borderColor),
      `${scenarioName} 主按钮未沿用当前 ERP 绿色主题: ${JSON.stringify(control)}`
    )
  })
}

function assertDarkModalControls(metrics, scenarioName) {
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
    `${scenarioName} 未找到可检查的暗色弹窗控件: ${JSON.stringify(metrics)}`
  )

  const fieldControls = visibleControls.filter(
    (control) => !control.className.includes('ant-btn')
  )
  fieldControls.forEach((control) => {
    assert(
      control.disabled
        ? isDarkControlBackground(control.backgroundColor) ||
            isDarkReadonlyDisabledBackground(control.backgroundColor)
        : isDarkControlBackground(control.backgroundColor),
      `${scenarioName} 暗色弹窗控件未使用深色输入面: ${JSON.stringify(control)}`
    )
    assert(
      isDarkNeutralBorderColor(control.borderColor),
      `${scenarioName} 暗色弹窗控件边框不够清楚: ${JSON.stringify(control)}`
    )
    assert(
      !containsGreenDominantColor(control.backgroundColor) &&
        !containsGreenDominantColor(control.borderColor),
      `${scenarioName} 暗色弹窗普通控件残留绿色边界或背景: ${JSON.stringify(control)}`
    )
  })

  const primaryButtons = visibleControls.filter(
    (control) =>
      control.className.includes('ant-btn-primary') && !control.disabled
  )
  primaryButtons.forEach((control) => {
    assert(
      isGreenFocusColor(control.backgroundColor) ||
        isGreenFocusColor(control.borderColor) ||
        isBluePrimaryColor(control.backgroundColor) ||
        isBluePrimaryColor(control.borderColor),
      `${scenarioName} 暗色弹窗主按钮应保留可辨认的品牌或蓝色主操作强调: ${JSON.stringify(control)}`
    )
  })
}

function assertDarkItemSummaryMetrics(metrics, scenarioName) {
  const summaries = (metrics.itemSummaryMetrics || []).filter(
    (summary) => summary.width > 0 && summary.height > 0
  )
  assert(
    summaries.length >= 3,
    `${scenarioName} 缺少可检查的暗色明细统计胶囊: ${JSON.stringify(metrics)}`
  )

  summaries.forEach((summary) => {
    assert(
      isDarkControlBackground(summary.backgroundColor),
      `${scenarioName} 明细统计胶囊仍是浅色背景: ${JSON.stringify(summary)}`
    )
    assert(
      isDarkNeutralBorderColor(summary.borderColor) ||
        isBluePrimaryColor(summary.borderColor),
      `${scenarioName} 明细统计胶囊边框不够清楚: ${JSON.stringify(summary)}`
    )
    assertReadableOnDark(
      summary.labelColor || summary.color,
      summary.backgroundColor,
      `${scenarioName} 明细统计胶囊 label 对比度不足`
    )
    assertReadableOnDark(
      summary.valueColor,
      summary.backgroundColor,
      `${scenarioName} 明细统计胶囊数值对比度不足`
    )
  })
}

function isGreenFocusColor(color) {
  const match = String(color || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
  if (!match) return false
  const [, red, green, blue] = match.map(Number)
  return green > red && green >= blue
}

function readCssAlpha(color) {
  const match = String(color || '').match(
    /rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\s*\)/i
  )
  if (!match) return 0
  return match[4] === undefined ? 1 : Number(match[4])
}

function isLightSlateBorderColor(color) {
  const match = String(color || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
  if (!match) return false
  const [, red, green, blue] = match.map(Number)
  return red >= 140 && green >= 150 && blue >= 160
}

function isDarkControlBackground(color) {
  const match = String(color || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
  if (!match) return false
  const [, red, green, blue] = match.map(Number)
  return red <= 32 && green <= 44 && blue <= 64
}

function isDarkReadonlyDisabledBackground(color) {
  const match = String(color || '').match(
    /rgba\((\d+),\s*(\d+),\s*(\d+),\s*([.\d]+)\)/i
  )
  if (!match) return false
  const [, red, green, blue, alpha] = match
  return (
    Number(red) >= 240 &&
    Number(green) >= 240 &&
    Number(blue) >= 240 &&
    Number(alpha) > 0 &&
    Number(alpha) <= 0.16
  )
}

function isLightReadonlyDisabledBackground(color) {
  const match = String(color || '').match(
    /rgba\((\d+),\s*(\d+),\s*(\d+),\s*([.\d]+)\)/i
  )
  if (!match) return false
  const [, red, green, blue, alpha] = match
  return (
    Number(red) <= 16 &&
    Number(green) <= 16 &&
    Number(blue) <= 16 &&
    Number(alpha) > 0 &&
    Number(alpha) <= 0.08
  )
}

function isDarkNeutralBorderColor(color) {
  const match = String(color || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
  if (!match) return false
  const [, red, green, blue] = match.map(Number)
  return red >= 45 && green >= 55 && blue >= 70 && blue >= red
}

function isBluePrimaryColor(color) {
  const match = String(color || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
  if (!match) return false
  const [, red, green, blue] = match.map(Number)
  return blue >= 140 && blue > red * 1.25 && blue >= green
}

function isWarningBorderColor(color) {
  const match = String(color || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i)
  if (!match) return false
  const [, red, green, blue] = match.map(Number)
  return red >= 120 && green >= 70 && green <= 160 && blue <= 90 && red >= green
}

function isLightSurfaceColor(color) {
  const rgb = parseRgb(color)
  if (!rgb) return false
  return rgb[0] >= 220 && rgb[1] >= 220 && rgb[2] >= 220
}

function assertReadableOnBackground(foreground, background, message) {
  const color = parseRgb(foreground)
  const bg = parseRgb(background)
  assert(
    color && bg,
    `${message}: ${JSON.stringify({ foreground, background })}`
  )
  const ratio = getContrastRatio(color, bg)
  assert(
    ratio >= 4.5,
    `${message}: ${JSON.stringify({
      foreground,
      background,
      ratio: Number(ratio.toFixed(2)),
    })}`
  )
}

function assertReadableOnDark(foreground, background, message) {
  const color = parseRgb(foreground)
  const bg = parseRgb(background)
  assert(
    color && bg,
    `${message}: ${JSON.stringify({ foreground, background })}`
  )
  const ratio = getContrastRatio(color, bg)
  assert(
    ratio >= 3,
    `${message}: ${JSON.stringify({
      foreground,
      background,
      ratio: Number(ratio.toFixed(2)),
    })}`
  )
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
  const rgb = parseRgb(color)
  if (!rgb) return false
  const [red, green, blue] = rgb
  const maxChannelGap = Math.max(
    Math.abs(red - green),
    Math.abs(red - blue),
    Math.abs(green - blue)
  )
  return red >= 190 && red <= 225 && maxChannelGap <= 4
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

function sameCSSColor(left, right) {
  return (
    String(left || '').replaceAll(' ', '') ===
    String(right || '').replaceAll(' ', '')
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
  { scenarioName, expectSelectionAction = true }
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
    const listToolbarText =
      document
        .querySelector('.erp-business-list-toolbar')
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
      listToolbarText,
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
    /(?:金额合计|数量合计)/.test(metrics.listToolbarText),
    `${scenarioName} 金额/数量合计应保留在表格工具栏: ${JSON.stringify(metrics)}`
  )
  assert(
    !/(?:金额合计|数量合计)/.test(metrics.filterSummaryText),
    `${scenarioName} 筛选区不应重复展示金额/数量合计: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.hero.height <= 300,
    `${scenarioName} 业务页头部过高，挤占表格和本页协同入口空间: ${JSON.stringify(metrics)}`
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
      `${scenarioName} 当前操作区可见性不符合预期: ${JSON.stringify(metrics)}`
    )
  }
  assert(
    taskCardVisible,
    `${scenarioName} 本页协同入口未在首屏边界内出现: ${JSON.stringify(metrics)}`
  )
}

async function assertBusinessCollaborationPanelCollapsedByDefault(
  page,
  { scenarioName }
) {
  const compactText = (text) => String(text || '').replace(/\s+/gu, '')
  const panel = page.locator('.erp-business-collaboration-task-panel').first()
  await panel.waitFor({ state: 'visible', timeout: 10_000 })
  const toggle = panel.locator('button[aria-expanded]').first()
  await toggle.waitFor({ state: 'attached', timeout: 10_000 })

  const collapsedMetrics = await panel.evaluate((node) => {
    const toggleButton = node.querySelector('button[aria-expanded]')
    return {
      className: node.className,
      ariaExpanded: toggleButton?.getAttribute('aria-expanded') || null,
      toggleText: String(toggleButton?.textContent || '').trim(),
      hasExpandedPanel: Boolean(
        node.querySelector('.erp-business-collaboration-task-panel__panel')
      ),
      tabCount: node.querySelectorAll(
        '.erp-business-collaboration-task-panel__tab'
      ).length,
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
    }
  })

  assert.equal(
    collapsedMetrics.ariaExpanded,
    'false',
    `${scenarioName} 本页协同入口默认应收起: ${JSON.stringify(collapsedMetrics)}`
  )
  assert.equal(
    collapsedMetrics.hasExpandedPanel,
    false,
    `${scenarioName} 默认收起态不应渲染协同任务面板: ${JSON.stringify(collapsedMetrics)}`
  )
  assert.equal(
    collapsedMetrics.tabCount,
    0,
    `${scenarioName} 默认收起态不应显示任务 tab: ${JSON.stringify(collapsedMetrics)}`
  )
  assert(
    compactText(collapsedMetrics.toggleText).includes('展开'),
    `${scenarioName} 默认收起态按钮应提示展开: ${JSON.stringify(collapsedMetrics)}`
  )
  assert(
    collapsedMetrics.scrollWidth <= collapsedMetrics.clientWidth + 1,
    `${scenarioName} 默认收起态出现横向溢出: ${JSON.stringify(collapsedMetrics)}`
  )

  await toggle.evaluate((button) => button.click())
  await panel
    .locator('.erp-business-collaboration-task-panel__panel')
    .waitFor({ state: 'visible', timeout: 10_000 })

  const expandedMetrics = await panel.evaluate((node) => {
    const toggleButton = node.querySelector('button[aria-expanded]')
    return {
      ariaExpanded: toggleButton?.getAttribute('aria-expanded') || null,
      toggleText: String(toggleButton?.textContent || '').trim(),
      hasExpandedPanel: Boolean(
        node.querySelector('.erp-business-collaboration-task-panel__panel')
      ),
      tabTexts: [
        ...node.querySelectorAll('.erp-business-collaboration-task-panel__tab'),
      ].map((item) => String(item.textContent || '').trim()),
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
    }
  })

  assert.equal(
    expandedMetrics.ariaExpanded,
    'true',
    `${scenarioName} 点击展开后 aria-expanded 应为 true: ${JSON.stringify(expandedMetrics)}`
  )
  assert.deepEqual(
    expandedMetrics.tabTexts.map((text) =>
      compactText(text).replace(/\d+$/u, '')
    ),
    ['本页待办', '当前记录', '阻塞异常', '已完成'],
    `${scenarioName} 展开后任务 tab 不完整: ${JSON.stringify(expandedMetrics)}`
  )
  assert(
    compactText(expandedMetrics.toggleText).includes('收起'),
    `${scenarioName} 展开态按钮应提示收起: ${JSON.stringify(expandedMetrics)}`
  )
  assert(
    expandedMetrics.scrollWidth <= expandedMetrics.clientWidth + 1,
    `${scenarioName} 展开态出现横向溢出: ${JSON.stringify(expandedMetrics)}`
  )

  const viewportSize = page.viewportSize()
  if ((viewportSize?.width || 0) >= 769) {
    const resizeHandle = panel.locator(
      '.erp-business-collaboration-task-panel__resize-handle'
    )
    await resizeHandle.waitFor({ state: 'visible', timeout: 10_000 })

    const beforeResizeMetrics = await panel.evaluate((node) => {
      const cardBody = node.querySelector('.ant-card-body')
      const taskList = node.querySelector('.erp-business-module-task-list')
      return {
        bodyHeight: cardBody?.getBoundingClientRect().height || 0,
        listClientHeight: taskList?.clientHeight || 0,
        listScrollHeight: taskList?.scrollHeight || 0,
        scrollWidth: node.scrollWidth,
        clientWidth: node.clientWidth,
      }
    })
    assert(
      beforeResizeMetrics.bodyHeight >= 320,
      `${scenarioName} 协同入口默认高度过低: ${JSON.stringify(beforeResizeMetrics)}`
    )

    const growHandleBox = await resizeHandle.boundingBox()
    assert(growHandleBox, `${scenarioName} 协同入口桌面拖拽手柄缺少可点击区域`)
    await page.mouse.move(
      growHandleBox.x + growHandleBox.width / 2,
      growHandleBox.y + growHandleBox.height / 2
    )
    await page.mouse.down()
    await page.mouse.move(
      growHandleBox.x + growHandleBox.width / 2,
      growHandleBox.y + growHandleBox.height / 2 - 120,
      { steps: 6 }
    )
    await page.mouse.up()

    const grownMetrics = await panel.evaluate((node) => {
      const cardBody = node.querySelector('.ant-card-body')
      const taskList = node.querySelector('.erp-business-module-task-list')
      return {
        bodyHeight: cardBody?.getBoundingClientRect().height || 0,
        listClientHeight: taskList?.clientHeight || 0,
        listScrollHeight: taskList?.scrollHeight || 0,
        scrollWidth: node.scrollWidth,
        clientWidth: node.clientWidth,
      }
    })
    assert(
      grownMetrics.bodyHeight >= beforeResizeMetrics.bodyHeight + 80,
      `${scenarioName} 向上拖动后协同入口高度未增加: ${JSON.stringify({
        beforeResizeMetrics,
        grownMetrics,
      })}`
    )
    assert(
      grownMetrics.scrollWidth <= grownMetrics.clientWidth + 1,
      `${scenarioName} 拖高后协同入口出现横向溢出: ${JSON.stringify(grownMetrics)}`
    )

    const shrinkHandleBox = await resizeHandle.boundingBox()
    assert(shrinkHandleBox, `${scenarioName} 协同入口拖高后手柄丢失`)
    await page.mouse.move(
      shrinkHandleBox.x + shrinkHandleBox.width / 2,
      shrinkHandleBox.y + shrinkHandleBox.height / 2
    )
    await page.mouse.down()
    await page.mouse.move(
      shrinkHandleBox.x + shrinkHandleBox.width / 2,
      shrinkHandleBox.y + shrinkHandleBox.height / 2 + 100,
      { steps: 6 }
    )
    await page.mouse.up()

    const shrunkMetrics = await panel.evaluate((node) => {
      const cardBody = node.querySelector('.ant-card-body')
      const taskList = node.querySelector('.erp-business-module-task-list')
      return {
        bodyHeight: cardBody?.getBoundingClientRect().height || 0,
        listClientHeight: taskList?.clientHeight || 0,
        listScrollHeight: taskList?.scrollHeight || 0,
        scrollWidth: node.scrollWidth,
        clientWidth: node.clientWidth,
      }
    })
    assert(
      shrunkMetrics.bodyHeight <= grownMetrics.bodyHeight - 70,
      `${scenarioName} 向下拖动后协同入口高度未缩小: ${JSON.stringify({
        grownMetrics,
        shrunkMetrics,
      })}`
    )
    assert(
      shrunkMetrics.bodyHeight >= 320,
      `${scenarioName} 拖动后协同入口低于最小高度: ${JSON.stringify(shrunkMetrics)}`
    )
    assert(
      shrunkMetrics.listScrollHeight >= shrunkMetrics.listClientHeight,
      `${scenarioName} 协同任务列表没有保持面板内滚动边界: ${JSON.stringify(shrunkMetrics)}`
    )
    assert(
      shrunkMetrics.scrollWidth <= shrunkMetrics.clientWidth + 1,
      `${scenarioName} 拖低后协同入口出现横向溢出: ${JSON.stringify(shrunkMetrics)}`
    )
  }

  await toggle.evaluate((button) => button.click())
  const restoredMetrics = await panel.evaluate((node) => {
    const toggleButton = node.querySelector('button[aria-expanded]')
    return {
      ariaExpanded: toggleButton?.getAttribute('aria-expanded') || null,
      toggleText: String(toggleButton?.textContent || '').trim(),
      hasExpandedPanel: Boolean(
        node.querySelector('.erp-business-collaboration-task-panel__panel')
      ),
    }
  })
  assert.equal(
    restoredMetrics.ariaExpanded,
    'false',
    `${scenarioName} 收起后 aria-expanded 应恢复 false: ${JSON.stringify(restoredMetrics)}`
  )
  assert.equal(
    restoredMetrics.hasExpandedPanel,
    false,
    `${scenarioName} 收起后不应继续显示任务面板: ${JSON.stringify(restoredMetrics)}`
  )
  assert(
    compactText(restoredMetrics.toggleText).includes('展开'),
    `${scenarioName} 收起后按钮应恢复展开: ${JSON.stringify(restoredMetrics)}`
  )
}

async function assertDashboardTaskBoardLayout(page, { scenarioName }) {
  await page.locator('.erp-dashboard-task-board-card').waitFor({
    timeout: 10_000,
  })

  const metrics = await page.evaluate(() => {
    const rectOf = (selectorOrNode) => {
      const element =
        typeof selectorOrNode === 'string'
          ? document.querySelector(selectorOrNode)
          : selectorOrNode
      if (!(element instanceof HTMLElement)) return null
      const rect = element.getBoundingClientRect()
      const style = window.getComputedStyle(element)
      return {
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        width: rect.width,
        height: rect.height,
        overflowX: style.overflowX,
        overflowY: style.overflowY,
        position: style.position,
        gridTemplateColumns: style.gridTemplateColumns,
      }
    }
    const boardCard = rectOf('.erp-dashboard-task-board-card')
    const lanes = rectOf('.erp-task-board-lanes')
    const filters = rectOf('.erp-task-board-filters')
    const tableCard = rectOf('.erp-dashboard-table-card')
    const tableBody = rectOf('.erp-dashboard-table-card .ant-card-body')
    const tableContent = rectOf('.erp-dashboard-table-card .ant-table-content')
    const laneRects = Array.from(
      document.querySelectorAll('.erp-task-board-lane')
    )
      .map((node) => rectOf(node))
      .filter(Boolean)
    const overlappingLanePairs = []
    for (let i = 0; i < laneRects.length; i += 1) {
      for (let j = i + 1; j < laneRects.length; j += 1) {
        const left = laneRects[i]
        const right = laneRects[j]
        const xOverlap =
          left.left < right.right - 1 && left.right > right.left + 1
        const yOverlap =
          left.top < right.bottom - 1 && left.bottom > right.top + 1
        if (xOverlap && yOverlap) {
          overlappingLanePairs.push([i, j])
        }
      }
    }

    return {
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
        documentScrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      },
      boardCard,
      lanes,
      filters,
      laneRects,
      overlappingLanePairs,
      tableCard,
      tableBody,
      tableContent,
    }
  })

  assert(
    metrics.boardCard && metrics.lanes && metrics.filters && metrics.tableCard,
    `${scenarioName} 缺少任务看板布局关键节点: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.laneRects.length === 4,
    `${scenarioName} 任务看板应渲染四个泳道: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.laneRects.every((lane) => lane.width >= 180 && lane.height > 0),
    `${scenarioName} 任务看板泳道尺寸异常: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.overlappingLanePairs.length === 0,
    `${scenarioName} 任务看板泳道之间发生重叠: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.filters.right <= metrics.boardCard.right + 2,
    `${scenarioName} 任务看板筛选区溢出卡片: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.tableCard.overflowX !== 'visible' ||
      metrics.tableBody?.overflowX !== 'visible' ||
      metrics.tableContent?.overflowX !== 'visible',
    `${scenarioName} 任务表格未提供可控横向滚动容器: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.viewport.documentScrollWidth <= metrics.viewport.clientWidth + 2,
    `${scenarioName} 任务看板产生页面级横向滚动: ${JSON.stringify(metrics)}`
  )
}

async function assertAntdTableHeaderTextFlow(page, { scenarioName }) {
  const metrics = await page.evaluate(() => {
    const isVisible = (node) => {
      if (!(node instanceof HTMLElement)) return false
      const rect = node.getBoundingClientRect()
      const style = window.getComputedStyle(node)
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden'
      )
    }
    const rectOf = (node) => {
      if (!(node instanceof HTMLElement)) return null
      const rect = node.getBoundingClientRect()
      return {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      }
    }

    return Array.from(
      document.querySelectorAll('.ant-table-wrapper .ant-table-thead th')
    )
      .filter(isVisible)
      .map((cell) => {
        const title =
          cell.querySelector('.ant-table-column-title') ||
          cell.querySelector('.erp-module-column-header') ||
          cell
        const text =
          cell.querySelector('.erp-module-column-header-text') || title
        const sorter = cell.querySelector('.ant-table-column-sorter')
        const cellStyle = window.getComputedStyle(cell)
        const titleStyle = window.getComputedStyle(title)
        const textStyle = window.getComputedStyle(text)
        return {
          text: String(text.textContent || '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 80),
          cellRect: rectOf(cell),
          titleRect: rectOf(title),
          textRect: rectOf(text),
          sorterRect: rectOf(sorter),
          cellWhiteSpace: cellStyle.whiteSpace,
          titleWhiteSpace: titleStyle.whiteSpace,
          titleOverflow: titleStyle.overflow,
          textWhiteSpace: textStyle.whiteSpace,
          textOverflow: textStyle.overflow,
          textOverflowWrap: textStyle.overflowWrap,
          textWordBreak: textStyle.wordBreak,
          textClientWidth: text.clientWidth,
          textScrollWidth: text.scrollWidth,
          textClientHeight: text.clientHeight,
          textScrollHeight: text.scrollHeight,
        }
      })
      .filter((item) => item.text)
  })

  assert(
    metrics.length > 0,
    `${scenarioName} 未找到可检查的 AntD 表头文案: ${JSON.stringify(metrics)}`
  )

  const clippedHeaders = metrics.filter((item) => {
    const horizontalClip =
      item.textScrollWidth > item.textClientWidth + 1 &&
      item.textOverflow === 'hidden' &&
      item.textOverflowWrap !== 'anywhere'
    const verticalClip =
      item.textScrollHeight > item.textClientHeight + 1 &&
      item.textOverflow === 'hidden'
    return (
      item.cellWhiteSpace === 'nowrap' ||
      item.titleWhiteSpace === 'nowrap' ||
      item.textWhiteSpace === 'nowrap' ||
      horizontalClip ||
      verticalClip
    )
  })
  assert.equal(
    clippedHeaders.length,
    0,
    `${scenarioName} 表头仍存在 nowrap 或 hidden 裁切: ${JSON.stringify(clippedHeaders)}`
  )

  const sorterOverlaps = metrics.filter((item) => {
    if (!item.sorterRect || !item.textRect) return false
    const horizontalOverlap =
      item.textRect.left < item.sorterRect.right &&
      item.textRect.right > item.sorterRect.left
    const verticalOverlap =
      item.textRect.top < item.sorterRect.bottom &&
      item.textRect.bottom > item.sorterRect.top
    return horizontalOverlap && verticalOverlap
  })
  assert.equal(
    sorterOverlaps.length,
    0,
    `${scenarioName} 表头标题与排序器发生覆盖: ${JSON.stringify(sorterOverlaps)}`
  )
}

async function assertAntdFormLabelTextFlow(
  page,
  { scenarioName, rootSelector = '.ant-modal' } = {}
) {
  const metrics = await page.evaluate((selector) => {
    const root = document.querySelector(selector)
    const isVisible = (node) => {
      if (!(node instanceof HTMLElement)) return false
      const rect = node.getBoundingClientRect()
      const style = window.getComputedStyle(node)
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden'
      )
    }

    return Array.from(
      (root || document).querySelectorAll('.ant-form-item-label > label')
    )
      .filter(isVisible)
      .map((label) => {
        const style = window.getComputedStyle(label)
        const rect = label.getBoundingClientRect()
        return {
          text: String(label.textContent || '')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 80),
          width: rect.width,
          height: rect.height,
          whiteSpace: style.whiteSpace,
          overflow: style.overflow,
          overflowWrap: style.overflowWrap,
          wordBreak: style.wordBreak,
          lineHeight: style.lineHeight,
          clientWidth: label.clientWidth,
          scrollWidth: label.scrollWidth,
          clientHeight: label.clientHeight,
          scrollHeight: label.scrollHeight,
        }
      })
      .filter((item) => item.text)
  }, rootSelector)

  assert(
    metrics.length > 0,
    `${scenarioName} 未找到可检查的 AntD 表单标签: ${JSON.stringify(metrics)}`
  )

  const clippedLabels = metrics.filter((item) => {
    const horizontalClip =
      item.scrollWidth > item.clientWidth + 1 &&
      item.overflow === 'hidden' &&
      item.overflowWrap !== 'anywhere'
    const verticalClip =
      item.scrollHeight > item.clientHeight + 1 && item.overflow === 'hidden'
    return (
      item.whiteSpace === 'nowrap' ||
      item.width <= 0 ||
      item.height <= 0 ||
      horizontalClip ||
      verticalClip
    )
  })
  assert.equal(
    clippedLabels.length,
    0,
    `${scenarioName} 表单标签仍存在 nowrap 或 hidden 裁切: ${JSON.stringify(clippedLabels)}`
  )
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
    text.includes('net::ERR_CONNECTION_REFUSED') ||
    text.includes('[vite] failed to connect to websocket') ||
    (text.includes("WebSocket connection to 'ws://127.0.0.1:") &&
      text.includes('net::ERR_ADDRESS_INVALID'))
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

async function assertERPThemeMode(
  page,
  { scenarioName, expectedMode, expectedEffectiveTheme }
) {
  const metrics = await page.evaluate(() => ({
    mode: document.documentElement.dataset.erpThemeMode || '',
    effectiveTheme: document.documentElement.dataset.erpTheme || '',
    colorScheme: document.documentElement.style.colorScheme || '',
    storedMode: window.localStorage.getItem('plush_erp_theme_mode') || '',
  }))

  assert.equal(
    metrics.mode,
    expectedMode,
    `${scenarioName} 主题模式不符合预期: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    metrics.effectiveTheme,
    expectedEffectiveTheme,
    `${scenarioName} 生效主题不符合预期: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    metrics.colorScheme,
    expectedEffectiveTheme,
    `${scenarioName} color-scheme 未同步: ${JSON.stringify(metrics)}`
  )
  assert(
    expectedMode === 'system' || metrics.storedMode === expectedMode,
    `${scenarioName} 手动主题未持久化: ${JSON.stringify(metrics)}`
  )
}

async function assertDevPageUsesGlobalThemeOnly(
  page,
  {
    scenarioName,
    selector,
    expectedMode,
    expectedEffectiveTheme,
    expectDarkContrast = false,
  }
) {
  const toggleCount = await page.evaluate(
    (targetSelector) =>
      document.querySelectorAll(`${targetSelector} .erp-theme-toggle`).length,
    selector
  )
  assert.equal(toggleCount, 0, `${scenarioName} 开发页不应重复放置主题切换控件`)
  await assertERPThemeMode(page, {
    scenarioName,
    expectedMode,
    expectedEffectiveTheme,
  })
  if (expectDarkContrast) {
    await assertDarkThemeContrast(page, {
      scenarioName,
      selector,
    })
  }
  await assertThemeReadable(page, {
    scenarioName,
    selector,
  })
  await assertNoHorizontalOverflow(page, `${scenarioName}-theme`)
}

async function clickERPThemeOption(page, label) {
  const expectedModeByLabel = {
    跟系统: 'system',
    浅色: 'light',
    暗色: 'dark',
  }
  const expectedMode = expectedModeByLabel[label]
  const segmentedOption = page
    .locator('.erp-theme-toggle .ant-segmented-item')
    .filter({ hasText: label })
  if ((await segmentedOption.count()) > 0) {
    await segmentedOption.click()
  } else {
    const menuToggle = page.locator('.erp-theme-menu-toggle')
    assert.equal(
      await menuToggle.count(),
      1,
      `主题菜单按钮数量异常，无法切换到 ${label}`
    )
    await menuToggle.click()
    await assertNoERPThemeTooltip(page, '主题菜单打开后不应显示 tooltip')
    const menuItem = page
      .locator(
        '.ant-dropdown:not(.ant-dropdown-hidden) .ant-dropdown-menu-item'
      )
      .filter({ hasText: label })
    await menuItem.waitFor({ state: 'visible', timeout: 10_000 })
    await menuItem.click()
    await page.keyboard.press('Escape')
    await page
      .locator('.ant-dropdown:not(.ant-dropdown-hidden)')
      .waitFor({ state: 'hidden', timeout: 10_000 })
      .catch(() => {})
  }
  if (expectedMode) {
    await page.waitForFunction(
      (mode) => document.documentElement.dataset.erpThemeMode === mode,
      expectedMode
    )
  }
}

async function assertNoERPThemeTooltip(page, message) {
  const tooltip = page
    .locator('.ant-tooltip:not(.ant-tooltip-hidden)')
    .filter({ hasText: /主题/ })
  assert.equal(await tooltip.count(), 0, message)
}

async function assertMobileTaskMainNavigation(page, { scenarioName }) {
  const todoMetrics = await readMobileTaskLayoutMetrics(page)
  assertMobileTaskBottomNavLayout(todoMetrics, scenarioName)
  assert.equal(
    todoMetrics.heading,
    '待办',
    `${scenarioName} 默认分区应为待办: ${JSON.stringify(todoMetrics)}`
  )
  assert.equal(
    todoMetrics.logoutVisible,
    false,
    `${scenarioName} 退出登录不应出现在待办分区: ${JSON.stringify(todoMetrics)}`
  )
  assert(
    !todoMetrics.sectionHeadings.includes('进度') &&
      !todoMetrics.sectionHeadings.includes('通知') &&
      !todoMetrics.sectionHeadings.includes('预警'),
    `${scenarioName} 待办分区仍混入旧进度/预警/通知区块: ${JSON.stringify(todoMetrics)}`
  )
  await assertMobileTaskListToggle(page, {
    scenarioName,
    listKey: 'todo',
    itemSelector: '.erp-mobile-list-item',
    collapsedMax: 12,
  })
  await assertMobileTaskScrollTopControl(page, { scenarioName })
  await assertMobileTaskFilterTabsSticky(page, { scenarioName })

  await page.getByTestId('mobile-role-nav-messages').click()
  await page.waitForFunction(() => {
    const heading = document.querySelector('.mobile-role-tasks-page h1')
    return heading?.textContent?.trim() === '消息'
  })
  const messageMetrics = await readMobileTaskLayoutMetrics(page)
  assertMobileTaskBottomNavLayout(messageMetrics, scenarioName)
  assert(
    messageMetrics.sectionHeadings.includes('预警') &&
      !messageMetrics.sectionHeadings.includes('通知'),
    `${scenarioName} 消息分区默认应先显示预警且不把通知压在预警列表后: ${JSON.stringify(messageMetrics)}`
  )
  await assertMobileTaskMessageTabsSwitch(page, { scenarioName })
  await assertMobileTaskDarkMessagesReadable(page, { scenarioName })

  await page.getByTestId('mobile-role-nav-done').click()
  await page.waitForFunction(() => {
    const heading = document.querySelector('.mobile-role-tasks-page h1')
    return heading?.textContent?.trim() === '已办'
  })
  const doneMetrics = await readMobileTaskLayoutMetrics(page)
  assertMobileTaskBottomNavLayout(doneMetrics, scenarioName)
  assert(
    doneMetrics.sectionHeadings.includes('进度') &&
      doneMetrics.sectionHeadings.includes('已办任务'),
    `${scenarioName} 已办分区应承载进度和已办任务: ${JSON.stringify(doneMetrics)}`
  )
  await assertMobileTaskProgressSummary(page, { scenarioName })
  await assertMobileTaskListToggle(page, {
    scenarioName,
    listKey: 'done',
    itemSelector: '.erp-mobile-list-item',
    collapsedMax: 10,
  })

  await page.getByTestId('mobile-role-nav-mine').click()
  await page.waitForFunction(() => {
    const heading = document.querySelector('.mobile-role-tasks-page h1')
    return heading?.textContent?.trim() === '我的'
  })
  const mineMetrics = await readMobileTaskLayoutMetrics(page)
  assertMobileTaskBottomNavLayout(mineMetrics, scenarioName)
  assert(
    mineMetrics.logoutVisible,
    `${scenarioName} 退出登录应只在我的分区出现: ${JSON.stringify(mineMetrics)}`
  )
  await assertMobileMineMetricButtonsVisible(page, { scenarioName })

  await page.getByTestId('mobile-role-nav-todo').click()
  await page.waitForFunction(() => {
    const heading = document.querySelector('.mobile-role-tasks-page h1')
    return heading?.textContent?.trim() === '待办'
  })
  const restoredMetrics = await readMobileTaskLayoutMetrics(page)
  assertMobileTaskBottomNavLayout(restoredMetrics, scenarioName)
  assert.equal(
    restoredMetrics.logoutVisible,
    false,
    `${scenarioName} 从我的返回待办后不应残留退出登录: ${JSON.stringify(restoredMetrics)}`
  )
  await assertMobileTaskPrimaryFilterNavigation(page, { scenarioName })
}

async function readVisibleMobileTaskListText(page) {
  return page.locator('.erp-mobile-list-item').evaluateAll((items) =>
    items
      .filter((item) => {
        const rect = item.getBoundingClientRect()
        return rect.width > 0 && rect.height > 0
      })
      .map((item) => item.textContent?.replace(/\s+/g, ' ').trim() || '')
      .join('\n')
  )
}

async function assertMobileTaskProgressSummary(page, { scenarioName }) {
  const metrics = await page.evaluate(() =>
    [
      'mobile-role-progress-pending',
      'mobile-role-progress-processing',
      'mobile-role-progress-blocked',
      'mobile-role-progress-done',
    ].map((testID) => {
      const node = document.querySelector(`[data-testid="${testID}"]`)
      const rect = node?.getBoundingClientRect()
      return {
        testID,
        tagName: node?.tagName || '',
        role: node?.getAttribute('role') || '',
        ariaPressed: node?.getAttribute('aria-pressed'),
        className: node?.className || '',
        text: node?.textContent?.replace(/\s+/g, ' ').trim() || '',
        width: rect?.width || 0,
        height: rect?.height || 0,
        scrollWidth: node?.scrollWidth || 0,
        clientWidth: node?.clientWidth || 0,
      }
    })
  )
  metrics.forEach((item) => {
    assert.equal(
      item.tagName,
      'DIV',
      `${scenarioName} 进度项应是只读摘要，不应继续作为按钮: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      item.ariaPressed,
      null,
      `${scenarioName} 进度摘要不应暴露选中态: ${JSON.stringify(metrics)}`
    )
    assert(
      item.scrollWidth <= item.clientWidth + 1,
      `${scenarioName} 进度摘要出现横向溢出: ${JSON.stringify(metrics)}`
    )
  })
}

async function assertMobileTaskPrimaryFilterNavigation(page, { scenarioName }) {
  await assertMobileSummaryMetricsReadonly(page, { scenarioName })

  await page.getByTestId('mobile-role-filter-risk').click()
  let visibleText = await readVisibleMobileTaskListText(page)
  await assertMobileTaskFilterSelected(page, 'mobile-role-filter-risk', {
    scenarioName,
    label: '风险',
  })
  assert(
    visibleText.includes('暗色任务验证') &&
      !visibleText.includes('批量待办任务 1'),
    `${scenarioName} 点击“风险”后未进入风险筛选: ${visibleText}`
  )

  await page.getByTestId('mobile-role-nav-mine').click()
  await page.waitForFunction(() => {
    const heading = document.querySelector('.mobile-role-tasks-page h1')
    return heading?.textContent?.trim() === '我的'
  })
  await page.getByTestId('mobile-role-mine-metric-risk').click()
  await page.waitForFunction(() => {
    const heading = document.querySelector('.mobile-role-tasks-page h1')
    return heading?.textContent?.trim() === '待办'
  })
  visibleText = await readVisibleMobileTaskListText(page)
  await assertMobileTaskFilterSelected(page, 'mobile-role-filter-risk', {
    scenarioName,
    label: '我的/风险跳转后的风险',
  })
  assert(
    visibleText.includes('暗色任务验证') &&
      !visibleText.includes('批量待办任务 1'),
    `${scenarioName} 点击“我的/风险”后未进入风险筛选: ${visibleText}`
  )

  await page.getByTestId('mobile-role-nav-mine').click()
  await page.waitForFunction(() => {
    const heading = document.querySelector('.mobile-role-tasks-page h1')
    return heading?.textContent?.trim() === '我的'
  })
  await page.getByTestId('mobile-role-mine-metric-overdue').click()
  await page.waitForFunction(() => {
    const heading = document.querySelector('.mobile-role-tasks-page h1')
    return heading?.textContent?.trim() === '待办'
  })
  visibleText = await readVisibleMobileTaskListText(page)
  await assertMobileTaskFilterSelected(page, 'mobile-role-filter-overdue', {
    scenarioName,
    label: '我的/超时跳转后的超时',
  })
  assert(
    visibleText.includes('批量超时任务') &&
      !visibleText.includes('批量待办任务 1'),
    `${scenarioName} 点击“我的/超时”后未进入超时筛选: ${visibleText}`
  )

  await page.getByTestId('mobile-role-nav-mine').click()
  await page.waitForFunction(() => {
    const heading = document.querySelector('.mobile-role-tasks-page h1')
    return heading?.textContent?.trim() === '我的'
  })
  await page.getByTestId('mobile-role-mine-metric-done').click()
  await page.waitForFunction(() => {
    const heading = document.querySelector('.mobile-role-tasks-page h1')
    return heading?.textContent?.trim() === '已办'
  })
  visibleText = await readVisibleMobileTaskListText(page)
  assert(
    visibleText.includes('批量已办任务') &&
      !visibleText.includes('暂无已办任务'),
    `${scenarioName} 点击“我的/已办”后未进入已办列表: ${visibleText}`
  )

  await page.getByTestId('mobile-role-nav-todo').click()
  await page.waitForFunction(() => {
    const heading = document.querySelector('.mobile-role-tasks-page h1')
    return heading?.textContent?.trim() === '待办'
  })
}

async function assertMobileTaskBossDoneList(page, { scenarioName }) {
  await gotoScenarioPath(page, '/m/boss/tasks', {
    waitUntil: 'domcontentloaded',
  })
  await expectText(page, '待办')
  await page.getByTestId('mobile-role-nav-done').click()
  await page.waitForFunction(() => {
    const heading = document.querySelector('.mobile-role-tasks-page h1')
    return heading?.textContent?.trim() === '已办'
  })

  const visibleText = await readVisibleMobileTaskListText(page)
  assert(
    visibleText.includes('批量老板已办任务') &&
      !visibleText.includes('暂无已办任务'),
    `${scenarioName} 老板端已办列表未渲染造数任务: ${visibleText}`
  )
  await assertMobileTaskListToggle(page, {
    scenarioName: `${scenarioName} boss`,
    listKey: 'done',
    itemSelector: '.erp-mobile-list-item',
    collapsedMax: 10,
  })
}

async function assertMobileSummaryMetricsReadonly(page, { scenarioName }) {
  const metrics = await page.evaluate(() =>
    [
      'mobile-role-metric-alerts',
      'mobile-role-metric-overdue',
      'mobile-role-metric-due-soon',
      'mobile-role-metric-risk',
    ].map((testID) => {
      const node = document.querySelector(`[data-testid="${testID}"]`)
      const rect = node?.getBoundingClientRect()
      return {
        testID,
        tagName: node?.tagName || '',
        role: node?.getAttribute('role') || '',
        ariaPressed: node?.getAttribute('aria-pressed'),
        className: node?.className || '',
        text: node?.textContent?.replace(/\s+/g, ' ').trim() || '',
        width: rect?.width || 0,
        height: rect?.height || 0,
        scrollWidth: node?.scrollWidth || 0,
        clientWidth: node?.clientWidth || 0,
      }
    })
  )
  metrics.forEach((item) => {
    assert.equal(
      item.tagName,
      'DIV',
      `${scenarioName} 顶部统计应是只读摘要，不应继续作为按钮: ${JSON.stringify(metrics)}`
    )
    assert(
      String(item.className).includes('mobile-role-summary-metric'),
      `${scenarioName} 顶部统计缺少摘要样式: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      item.ariaPressed,
      null,
      `${scenarioName} 顶部统计不应暴露选中态: ${JSON.stringify(metrics)}`
    )
    assert(
      item.scrollWidth <= item.clientWidth + 1,
      `${scenarioName} 顶部统计摘要出现横向溢出: ${JSON.stringify(metrics)}`
    )
  })
}

async function assertMobileMineMetricButtonsVisible(page, { scenarioName }) {
  const metrics = await page.evaluate(() =>
    [
      'mobile-role-mine-metric-todo',
      'mobile-role-mine-metric-done',
      'mobile-role-mine-metric-overdue',
      'mobile-role-mine-metric-risk',
    ].map((testID) => {
      const node = document.querySelector(`[data-testid="${testID}"]`)
      const style = node ? window.getComputedStyle(node) : null
      const rect = node?.getBoundingClientRect()
      return {
        testID,
        tagName: node?.tagName || '',
        className: node?.className || '',
        backgroundColor: style?.backgroundColor || '',
        borderColor: style?.borderColor || '',
        borderStyle: style?.borderStyle || '',
        borderWidth: style?.borderWidth || '',
        boxShadow: style?.boxShadow || '',
        width: rect?.width || 0,
        height: rect?.height || 0,
        scrollWidth: node?.scrollWidth || 0,
        clientWidth: node?.clientWidth || 0,
      }
    })
  )

  metrics.forEach((item) => {
    const borderWidth = Number.parseFloat(item.borderWidth) || 0
    assert.equal(
      item.tagName,
      'BUTTON',
      `${scenarioName} 我的统计入口应保持可点击按钮: ${JSON.stringify(metrics)}`
    )
    assert(
      item.width >= 64 && item.height >= 58,
      `${scenarioName} 我的统计入口点击区域过小: ${JSON.stringify(metrics)}`
    )
    assert(
      item.borderStyle !== 'none' &&
        borderWidth >= 1 &&
        !isTransparentColor(item.borderColor),
      `${scenarioName} 我的统计入口缺少可见边框: ${JSON.stringify(metrics)}`
    )
    assert(
      !isTransparentColor(item.backgroundColor),
      `${scenarioName} 我的统计入口背景透明，边界会融入外层: ${JSON.stringify(metrics)}`
    )
    assert(
      item.boxShadow && item.boxShadow !== 'none',
      `${scenarioName} 我的统计入口缺少外层阴影分离: ${JSON.stringify(metrics)}`
    )
    assert(
      item.scrollWidth <= item.clientWidth + 1,
      `${scenarioName} 我的统计入口出现横向溢出: ${JSON.stringify(metrics)}`
    )
  })
}

async function assertMobileTaskFilterSelected(
  page,
  testID,
  { scenarioName, label }
) {
  const metrics = await page.getByTestId(testID).evaluate((node) => {
    const style = window.getComputedStyle(node)
    const rect = node.getBoundingClientRect()
    return {
      testID: node.getAttribute('data-testid'),
      ariaPressed: node.getAttribute('aria-pressed'),
      className: node.className,
      backgroundColor: style.backgroundColor,
      color: style.color,
      boxShadow: style.boxShadow,
      width: rect.width,
      height: rect.height,
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
    }
  })
  assert.equal(
    metrics.ariaPressed,
    'true',
    `${scenarioName} ${label} 缺少 aria-pressed 选中态: ${JSON.stringify(metrics)}`
  )
  assert(
    String(metrics.className).includes('mobile-role-task-filter--active'),
    `${scenarioName} ${label} 筛选选中态缺少 active class: ${JSON.stringify(metrics)}`
  )
  assert(
    !isTransparentColor(metrics.backgroundColor) ||
      (metrics.boxShadow && metrics.boxShadow !== 'none'),
    `${scenarioName} ${label} 筛选选中态缺少可见背景或阴影: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.scrollWidth <= metrics.clientWidth + 1,
    `${scenarioName} ${label} 筛选选中态造成按钮内容横向溢出: ${JSON.stringify(metrics)}`
  )
}

async function assertMobileTaskListToggle(
  page,
  { scenarioName, listKey, itemSelector, collapsedMax }
) {
  const toggle = page.getByTestId(`mobile-role-list-toggle-${listKey}`)
  const toggleCount = await toggle.count()
  assert.equal(
    toggleCount,
    1,
    `${scenarioName} ${listKey} 长列表应出现唯一展开控制，实际 ${toggleCount}`
  )

  const collapsedMetrics = await readMobileTaskVisibleListMetrics(
    page,
    itemSelector
  )
  assert(
    collapsedMetrics.itemCount > 0 &&
      collapsedMetrics.itemCount <= collapsedMax,
    `${scenarioName} ${listKey} 默认收起数量异常: ${JSON.stringify(collapsedMetrics)}`
  )
  assert(
    collapsedMetrics.toggleText.includes(`再显示 ${collapsedMax}`) &&
      collapsedMetrics.toggleText.includes('剩余'),
    `${scenarioName} ${listKey} 分批展开控制缺少批次数或剩余提示: ${JSON.stringify(collapsedMetrics)}`
  )
  assert(
    collapsedMetrics.documentScrollWidth <=
      collapsedMetrics.documentClientWidth + 1,
    `${scenarioName} ${listKey} 默认收起态横向溢出: ${JSON.stringify(collapsedMetrics)}`
  )

  await toggle.click()
  const expandedMetrics = await readMobileTaskVisibleListMetrics(
    page,
    itemSelector
  )
  const expectedFirstBatchCount = Math.min(
    collapsedMetrics.totalItemCount,
    collapsedMetrics.itemCount + collapsedMax
  )
  assert(
    expandedMetrics.itemCount === expectedFirstBatchCount,
    `${scenarioName} ${listKey} 首次展开后没有按批次增加: ${JSON.stringify({ collapsedMetrics, expandedMetrics, expectedFirstBatchCount })}`
  )
  assert(
    expandedMetrics.itemCount === expandedMetrics.totalItemCount ||
      expandedMetrics.toggleText.includes('再显示'),
    `${scenarioName} ${listKey} 未到最后一批时应继续显示分批展开入口: ${JSON.stringify(expandedMetrics)}`
  )

  let finalMetrics = expandedMetrics
  for (
    let index = 0;
    index < 20 && !finalMetrics.toggleText.includes('收起');
    index += 1
  ) {
    await toggle.click()
    finalMetrics = await readMobileTaskVisibleListMetrics(page, itemSelector)
  }
  assert(
    finalMetrics.toggleText.includes('收起') &&
      finalMetrics.itemCount === finalMetrics.totalItemCount,
    `${scenarioName} ${listKey} 展开到最后后缺少收起入口: ${JSON.stringify(finalMetrics)}`
  )

  await toggle.click()
  const restoredMetrics = await readMobileTaskVisibleListMetrics(
    page,
    itemSelector
  )
  assert.equal(
    restoredMetrics.itemCount,
    collapsedMetrics.itemCount,
    `${scenarioName} ${listKey} 收起后没有恢复默认数量: ${JSON.stringify({ collapsedMetrics, restoredMetrics })}`
  )
}

async function assertMobileTaskScrollTopControl(page, { scenarioName }) {
  const button = page.getByTestId('mobile-role-scroll-top')
  await page.evaluate(() => {
    const scroll = document.querySelector('[data-testid="mobile-role-scroll"]')
    if (scroll instanceof HTMLElement) {
      scroll.scrollTop = 0
      scroll.dispatchEvent(new Event('scroll', { bubbles: true }))
    }
  })
  await page.waitForTimeout(100)
  assert.equal(
    await button.count(),
    0,
    `${scenarioName} 回到顶部按钮默认不应显示`
  )

  const scrolled = await page.evaluate(() => {
    const scroll = document.querySelector('[data-testid="mobile-role-scroll"]')
    if (!(scroll instanceof HTMLElement)) return null
    const maxScrollTop = Math.max(0, scroll.scrollHeight - scroll.clientHeight)
    scroll.scrollTop = Math.min(720, maxScrollTop)
    scroll.dispatchEvent(new Event('scroll', { bubbles: true }))
    const nav = document.querySelector('[data-testid="mobile-role-bottom-nav"]')
    return {
      scrollTop: scroll.scrollTop,
      scrollHeight: scroll.scrollHeight,
      clientHeight: scroll.clientHeight,
      navTop: nav?.getBoundingClientRect().top || 0,
    }
  })
  assert(
    scrolled && scrolled.scrollTop >= 280,
    `${scenarioName} 回到顶部控制缺少可滚动距离: ${JSON.stringify(scrolled)}`
  )

  await button.waitFor({ state: 'visible', timeout: 10_000 })
  const visibleMetrics = await page.evaluate(() => {
    const buttonNode = document.querySelector(
      '[data-testid="mobile-role-scroll-top"]'
    )
    const nav = document.querySelector('[data-testid="mobile-role-bottom-nav"]')
    const buttonRect = buttonNode?.getBoundingClientRect()
    const navRect = nav?.getBoundingClientRect()
    return {
      button: buttonRect
        ? {
            top: buttonRect.top,
            right: buttonRect.right,
            bottom: buttonRect.bottom,
            width: buttonRect.width,
            height: buttonRect.height,
          }
        : null,
      nav: navRect
        ? {
            top: navRect.top,
            bottom: navRect.bottom,
          }
        : null,
      ariaLabel: buttonNode?.getAttribute('aria-label') || '',
      documentScrollWidth: document.documentElement.scrollWidth,
      documentClientWidth: document.documentElement.clientWidth,
    }
  })
  assert.equal(
    visibleMetrics.ariaLabel,
    '回到顶部',
    `${scenarioName} 回到顶部按钮缺少 aria-label: ${JSON.stringify(visibleMetrics)}`
  )
  assert(
    visibleMetrics.button &&
      visibleMetrics.button.width === 44 &&
      visibleMetrics.button.height === 44,
    `${scenarioName} 回到顶部按钮尺寸异常: ${JSON.stringify(visibleMetrics)}`
  )
  assert(
    visibleMetrics.button &&
      visibleMetrics.nav &&
      visibleMetrics.button.bottom <= visibleMetrics.nav.top - 8,
    `${scenarioName} 回到顶部按钮遮挡底部导航: ${JSON.stringify(visibleMetrics)}`
  )
  assert(
    visibleMetrics.documentScrollWidth <=
      visibleMetrics.documentClientWidth + 1,
    `${scenarioName} 回到顶部按钮造成横向溢出: ${JSON.stringify(visibleMetrics)}`
  )

  await button.click()
  await page.waitForFunction(() => {
    const scroll = document.querySelector('[data-testid="mobile-role-scroll"]')
    return scroll instanceof HTMLElement && scroll.scrollTop <= 2
  })
  assert.equal(await button.count(), 0, `${scenarioName} 回到顶部后按钮应隐藏`)
}

async function assertMobileTaskMessageTabsSwitch(page, { scenarioName }) {
  const noticeTab = page.getByTestId('mobile-role-message-tab-notice')
  const warningTab = page.getByTestId('mobile-role-message-tab-warning')

  await noticeTab.waitFor({ state: 'visible', timeout: 10_000 })
  await warningTab.waitFor({ state: 'visible', timeout: 10_000 })
  await assertMobileTaskListToggle(page, {
    scenarioName,
    listKey: 'warning',
    itemSelector: '.mobile-role-message-card',
    collapsedMax: 8,
  })
  await noticeTab.click()
  await page.waitForFunction(() => {
    const headings = Array.from(
      document.querySelectorAll('.mobile-role-tasks-page h2')
    ).map((heading) => heading.textContent?.trim() || '')
    return headings.includes('通知') && !headings.includes('预警')
  })

  const noticeMetrics = await readMobileTaskMessageTabMetrics(page)
  assert(
    noticeMetrics.activeTab === '通知',
    `${scenarioName} 点击通知后未激活通知 tab: ${JSON.stringify(noticeMetrics)}`
  )
  assert(
    noticeMetrics.sectionHeadings.length === 1 &&
      noticeMetrics.sectionHeadings[0] === '通知',
    `${scenarioName} 通知 tab 不应继续被预警列表挤到下方: ${JSON.stringify(noticeMetrics)}`
  )
  assert(
    noticeMetrics.tabsSticky &&
      noticeMetrics.tabs &&
      noticeMetrics.tabs.width > 280 &&
      noticeMetrics.tabs.scrollWidth <= noticeMetrics.tabs.clientWidth + 1,
    `${scenarioName} 消息二级 tab 盒模型异常: ${JSON.stringify(noticeMetrics)}`
  )
  assert(
    noticeMetrics.cards.length > 0 &&
      noticeMetrics.cards.every(
        (card) => card.width > 280 && card.scrollWidth <= card.clientWidth + 1
      ),
    `${scenarioName} 通知卡片出现横向溢出: ${JSON.stringify(noticeMetrics)}`
  )
  await assertMobileTaskListToggle(page, {
    scenarioName,
    listKey: 'notice',
    itemSelector: '.mobile-role-message-card',
    collapsedMax: 8,
  })

  await warningTab.click()
  await page.waitForFunction(() => {
    const headings = Array.from(
      document.querySelectorAll('.mobile-role-tasks-page h2')
    ).map((heading) => heading.textContent?.trim() || '')
    return headings.includes('预警') && !headings.includes('通知')
  })
}

async function assertMobileTaskDarkMessagesReadable(page, { scenarioName }) {
  const metrics = await page.evaluate(() => {
    const readRect = (element) => {
      const rect = element?.getBoundingClientRect?.()
      return rect
        ? {
            width: rect.width,
            height: rect.height,
            top: rect.top,
            bottom: rect.bottom,
          }
        : null
    }
    const readColor = (element) => {
      const style = window.getComputedStyle(element)
      return {
        color: style.color,
        backgroundColor: style.backgroundColor,
        borderColor: style.borderColor,
      }
    }
    const textSelectors = [
      '.mobile-role-message-card__tone',
      '.mobile-role-message-card__title',
      '.mobile-role-message-card__source',
      '.mobile-role-message-card__reason',
      '.mobile-role-message-card__time',
    ].join(',')

    const sections = Array.from(
      document.querySelectorAll('.mobile-role-message-section')
    ).map((section) => {
      const heading = section.querySelector('h2')
      return {
        heading: heading?.textContent?.trim() || '',
        rect: readRect(section),
        ...readColor(section),
        headingColor: heading ? window.getComputedStyle(heading).color : '',
      }
    })

    const cards = Array.from(
      document.querySelectorAll(
        '.mobile-role-message-card, .mobile-role-message-empty'
      )
    ).map((card) => {
      const textNodes = Array.from(card.querySelectorAll(textSelectors))
      if (textNodes.length === 0 && card.textContent?.trim()) {
        textNodes.push(card)
      }
      return {
        text: card.textContent?.replace(/\s+/g, ' ').trim() || '',
        isWarning: card.classList.contains('mobile-role-message-card--warning'),
        isNotice: card.classList.contains('mobile-role-message-card--notice'),
        isEmpty: card.classList.contains('mobile-role-message-empty'),
        rect: readRect(card),
        ...readColor(card),
        textNodes: textNodes.map((node) => ({
          text: node.textContent?.replace(/\s+/g, ' ').trim() || '',
          color: window.getComputedStyle(node).color,
        })),
      }
    })

    return {
      effectiveTheme: document.documentElement.dataset.erpTheme || '',
      sections,
      cards,
      documentScrollWidth: document.documentElement.scrollWidth,
      documentClientWidth: document.documentElement.clientWidth,
    }
  })

  assert.equal(
    metrics.effectiveTheme,
    'dark',
    `${scenarioName} 消息可读性断言必须在暗色模式执行: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.sections.length === 1 && metrics.sections[0].heading === '预警',
    `${scenarioName} 消息页默认应只渲染当前预警区块: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.cards.length >= 1,
    `${scenarioName} 消息页缺少可验证卡片或空态: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.cards.some((card) => card.isWarning),
    `${scenarioName} 消息页缺少预警卡片: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.documentScrollWidth <= metrics.documentClientWidth + 1,
    `${scenarioName} 消息页出现横向溢出: ${JSON.stringify(metrics)}`
  )

  metrics.sections.forEach((section) => {
    assert(
      !isLightSurfaceColor(section.backgroundColor),
      `${scenarioName} 消息分区仍是浅色背景: ${JSON.stringify(section)}`
    )
    assertReadableOnBackground(
      section.headingColor,
      section.backgroundColor,
      `${scenarioName} 消息分区标题对比度不足`
    )
  })

  metrics.cards.forEach((card) => {
    assert(
      card.rect && card.rect.width > 280 && card.rect.height >= 40,
      `${scenarioName} 消息卡片尺寸异常: ${JSON.stringify(card)}`
    )
    assert(
      !isLightSurfaceColor(card.backgroundColor),
      `${scenarioName} 消息卡片仍是浅色背景: ${JSON.stringify(card)}`
    )
    assert(
      isDarkNeutralBorderColor(card.borderColor) ||
        isWarningBorderColor(card.borderColor),
      `${scenarioName} 消息卡片边框不够清楚: ${JSON.stringify(card)}`
    )
    card.textNodes.forEach((node) => {
      if (!node.text) return
      assertReadableOnBackground(
        node.color,
        card.backgroundColor,
        `${scenarioName} 消息卡片文字对比度不足`
      )
    })
  })
}

async function assertMobileTaskDarkDetailReadable(page, { scenarioName }) {
  await page
    .getByRole('button', { name: /暗色任务验证/ })
    .first()
    .click()
  await page
    .locator('.mobile-role-tasks-page--detail')
    .waitFor({ state: 'visible', timeout: 10_000 })
  await expectText(page, '任务关键信息')
  await expectText(page, '关联单据')
  await expectText(page, '现场留痕')
  await expectText(page, '最近动态')
  await page
    .getByTestId('mobile-role-evidence-input')
    .fill('STYLE-L1-EVIDENCE-001\nhttps://example.invalid/style-l1')
  await assertThemeReadable(page, {
    scenarioName,
    selector: '.mobile-role-detail-header',
  })
  await assertThemeReadable(page, {
    scenarioName,
    selector: '[data-testid="mobile-role-evidence-input"]',
  })
  await assertDarkThemeContrast(page, {
    scenarioName,
    selector: '.mobile-role-tasks-page--detail',
    minRatio: 4.5,
  })

  const metrics = await page.evaluate(() => {
    const shell = document.querySelector('.mobile-role-tasks-page--detail')
    const header = document.querySelector('.mobile-role-detail-header')
    const actionBar = document.querySelector('.mobile-role-action-bar')
    const shellRect = shell?.getBoundingClientRect()
    const headerRect = header?.getBoundingClientRect()
    const actionBarRect = actionBar?.getBoundingClientRect()
    const buttons = Array.from(
      actionBar?.querySelectorAll('.mobile-role-action-bar__button') || []
    ).map((button) => {
      const rect = button.getBoundingClientRect()
      const style = window.getComputedStyle(button)
      return {
        text: button.textContent?.replace(/\s+/g, ' ').trim() || '',
        width: rect.width,
        height: rect.height,
        color: style.color,
        backgroundColor: style.backgroundColor,
        opacity: style.opacity,
      }
    })
    return {
      shell: shellRect
        ? {
            bottom: shellRect.bottom,
            height: shellRect.height,
          }
        : null,
      header: headerRect
        ? {
            top: headerRect.top,
            height: headerRect.height,
          }
        : null,
      actionBar: actionBarRect
        ? {
            top: actionBarRect.top,
            bottom: actionBarRect.bottom,
            height: actionBarRect.height,
          }
        : null,
      buttons,
      scrollTopButtonCount: document.querySelectorAll(
        '[data-testid="mobile-role-scroll-top"]'
      ).length,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      documentScrollWidth: document.documentElement.scrollWidth,
      documentClientWidth: document.documentElement.clientWidth,
    }
  })

  assert(metrics.shell, `${scenarioName} 详情页容器未渲染`)
  assert(metrics.header, `${scenarioName} 详情页标题栏未渲染`)
  assert(metrics.actionBar, `${scenarioName} 详情页动作栏未渲染`)
  assert.equal(
    metrics.buttons.length,
    4,
    `${scenarioName} 详情页动作栏应保留四个主按钮: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    metrics.scrollTopButtonCount,
    0,
    `${scenarioName} 详情页不应显示回到顶部按钮: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.documentScrollWidth <= metrics.documentClientWidth + 1,
    `${scenarioName} 详情页出现横向溢出: ${JSON.stringify(metrics)}`
  )
  assert(
    Math.abs(metrics.actionBar.bottom - metrics.shell.bottom) <= 1.5,
    `${scenarioName} 详情页动作栏未贴住容器底部: ${JSON.stringify(metrics)}`
  )
  metrics.buttons.forEach((button) => {
    assert(
      button.width >= 72 && button.height >= 52,
      `${scenarioName} 详情页动作按钮尺寸不稳定: ${JSON.stringify(metrics)}`
    )
  })
}

async function readMobileTaskLayoutMetrics(page) {
  return page.evaluate(() => {
    const shell = document.querySelector('.mobile-role-tasks-page')
    const scroll = document.querySelector('[data-testid="mobile-role-scroll"]')
    const nav = document.querySelector('[data-testid="mobile-role-bottom-nav"]')
    const logout = document.querySelector(
      '[data-testid="mobile-role-logout-button"]'
    )
    const shellRect = shell?.getBoundingClientRect()
    const scrollRect = scroll?.getBoundingClientRect()
    const navRect = nav?.getBoundingClientRect()
    const logoutRect = logout?.getBoundingClientRect()
    const sectionHeadings = Array.from(
      document.querySelectorAll('.mobile-role-tasks-page h2')
    ).map((heading) => heading.textContent?.trim() || '')

    return {
      heading:
        document
          .querySelector('.mobile-role-tasks-page h1')
          ?.textContent?.trim() || '',
      sectionHeadings,
      shell: shellRect
        ? {
            top: shellRect.top,
            bottom: shellRect.bottom,
            height: shellRect.height,
          }
        : null,
      scroll: scrollRect
        ? {
            top: scrollRect.top,
            bottom: scrollRect.bottom,
            height: scrollRect.height,
            scrollHeight: scroll?.scrollHeight || 0,
          }
        : null,
      nav: navRect
        ? {
            top: navRect.top,
            bottom: navRect.bottom,
            height: navRect.height,
          }
        : null,
      navButtonCount: nav?.querySelectorAll('button').length || 0,
      logoutVisible:
        Boolean(logout) &&
        Boolean(logoutRect) &&
        logoutRect.width > 0 &&
        logoutRect.height > 0,
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight,
      },
      documentScrollWidth: document.documentElement.scrollWidth,
      documentClientWidth: document.documentElement.clientWidth,
      windowScrollY: window.scrollY,
    }
  })
}

async function readMobileTaskMessageTabMetrics(page) {
  return page.evaluate(() => {
    const tabs = document.querySelector('.mobile-role-message-tabs')
    const tabsRect = tabs?.getBoundingClientRect()
    const tabsStyle =
      tabs instanceof HTMLElement ? window.getComputedStyle(tabs) : null
    const sectionHeadings = Array.from(
      document.querySelectorAll('.mobile-role-tasks-page h2')
    ).map((heading) => heading.textContent?.trim() || '')
    const activeTab = Array.from(
      document.querySelectorAll('.mobile-role-message-tabs__item')
    ).find((item) => item.getAttribute('aria-selected') === 'true')
    const cards = Array.from(
      document.querySelectorAll(
        '.mobile-role-message-card, .mobile-role-message-empty'
      )
    ).map((card) => {
      const rect = card.getBoundingClientRect()
      return {
        text: card.textContent?.replace(/\s+/g, ' ').trim() || '',
        width: rect.width,
        height: rect.height,
        clientWidth: card instanceof HTMLElement ? card.clientWidth : 0,
        scrollWidth: card instanceof HTMLElement ? card.scrollWidth : 0,
      }
    })

    return {
      activeTab: activeTab?.textContent?.replace(/\d+/g, '').trim() || '',
      sectionHeadings,
      tabsSticky: tabsStyle?.position === 'sticky',
      tabs: tabsRect
        ? {
            width: tabsRect.width,
            height: tabsRect.height,
            clientWidth: tabs instanceof HTMLElement ? tabs.clientWidth : 0,
            scrollWidth: tabs instanceof HTMLElement ? tabs.scrollWidth : 0,
          }
        : null,
      cards,
      documentScrollWidth: document.documentElement.scrollWidth,
      documentClientWidth: document.documentElement.clientWidth,
    }
  })
}

async function assertMobileTaskFilterTabsSticky(page, { scenarioName }) {
  const scrollResult = await page.evaluate(() => {
    const scroll = document.querySelector('[data-testid="mobile-role-scroll"]')
    if (!(scroll instanceof HTMLElement)) return null
    const maxScrollTop = Math.max(0, scroll.scrollHeight - scroll.clientHeight)
    scroll.scrollTop = Math.min(640, maxScrollTop)
    return {
      maxScrollTop,
      scrollTop: scroll.scrollTop,
    }
  })
  assert(
    scrollResult && scrollResult.scrollTop > 0,
    `${scenarioName} 待办筛选 sticky 回归缺少可滚动长列表: ${JSON.stringify(scrollResult)}`
  )
  await page.waitForTimeout(80)

  const metrics = await page.evaluate(() => {
    const scroll = document.querySelector('[data-testid="mobile-role-scroll"]')
    const tabs = document.querySelector('.mobile-role-task-filters')
    const activeTab = Array.from(
      document.querySelectorAll('.mobile-role-task-filter')
    ).find((item) => item.getAttribute('aria-pressed') === 'true')
    const scrollRect = scroll?.getBoundingClientRect()
    const tabsRect = tabs?.getBoundingClientRect()
    const tabsStyle =
      tabs instanceof HTMLElement ? window.getComputedStyle(tabs) : null
    return {
      activeLabel: activeTab?.textContent?.replace(/\s+/g, '').trim() || '',
      buttonCount: tabs?.querySelectorAll('button').length || 0,
      tabsSticky: tabsStyle?.position === 'sticky',
      scroll: scrollRect
        ? {
            top: scrollRect.top,
            bottom: scrollRect.bottom,
            height: scrollRect.height,
            scrollTop: scroll instanceof HTMLElement ? scroll.scrollTop : 0,
          }
        : null,
      tabs: tabsRect
        ? {
            top: tabsRect.top,
            bottom: tabsRect.bottom,
            width: tabsRect.width,
            height: tabsRect.height,
            clientWidth: tabs instanceof HTMLElement ? tabs.clientWidth : 0,
            scrollWidth: tabs instanceof HTMLElement ? tabs.scrollWidth : 0,
          }
        : null,
      documentScrollWidth: document.documentElement.scrollWidth,
      documentClientWidth: document.documentElement.clientWidth,
    }
  })

  assert(
    metrics.tabs,
    `${scenarioName} 缺少待办筛选 sticky tab: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    metrics.buttonCount,
    4,
    `${scenarioName} 待办筛选 sticky tab 应保留四项: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.activeLabel.includes('全部'),
    `${scenarioName} 待办筛选 sticky tab 选中态错误: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.tabsSticky,
    `${scenarioName} 待办筛选 tab 未设置 sticky: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.scroll && Math.abs(metrics.tabs.top - metrics.scroll.top) <= 2,
    `${scenarioName} 待办筛选 tab 滚动后未贴住正文滚动区顶部: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.tabs.scrollWidth <= metrics.tabs.clientWidth + 1,
    `${scenarioName} 待办筛选 sticky tab 横向溢出: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.documentScrollWidth <= metrics.documentClientWidth + 1,
    `${scenarioName} 待办筛选 sticky tab 导致页面横向溢出: ${JSON.stringify(metrics)}`
  )

  await page.evaluate(() => {
    const scroll = document.querySelector('[data-testid="mobile-role-scroll"]')
    if (scroll instanceof HTMLElement) {
      scroll.scrollTop = 0
    }
  })
}

async function readMobileTaskVisibleListMetrics(page, itemSelector) {
  return page.evaluate((selector) => {
    const items = Array.from(document.querySelectorAll(selector)).map(
      (item) => {
        const rect = item.getBoundingClientRect()
        return {
          text: item.textContent?.replace(/\s+/g, ' ').trim() || '',
          width: rect.width,
          height: rect.height,
          clientWidth: item instanceof HTMLElement ? item.clientWidth : 0,
          scrollWidth: item instanceof HTMLElement ? item.scrollWidth : 0,
        }
      }
    )
    const toggle = document.querySelector('.mobile-role-list-control__button')
    const totalItemCount = Number(
      toggle?.dataset?.totalItemCount || items.length
    )
    return {
      itemCount: items.length,
      totalItemCount,
      items,
      toggleText: toggle?.textContent?.replace(/\s+/g, ' ').trim() || '',
      documentScrollWidth: document.documentElement.scrollWidth,
      documentClientWidth: document.documentElement.clientWidth,
    }
  }, itemSelector)
}

function assertMobileTaskBottomNavLayout(metrics, scenarioName) {
  assert(metrics.shell, `${scenarioName} 未找到岗位任务页容器`)
  assert(metrics.scroll, `${scenarioName} 未找到移动端正文滚动容器`)
  assert(metrics.nav, `${scenarioName} 未找到移动端底部导航`)
  assert.equal(
    metrics.navButtonCount,
    4,
    `${scenarioName} 底部导航应固定为四项: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.shell.bottom <= metrics.viewport.height + 1,
    `${scenarioName} 任务页容器超出视口导致底部导航不固定: ${JSON.stringify(metrics)}`
  )
  assert(
    Math.abs(metrics.nav.bottom - metrics.shell.bottom) <= 1.5,
    `${scenarioName} 底部导航未贴住任务页容器底部: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.scroll.bottom <= metrics.nav.top + 1.5,
    `${scenarioName} 正文滚动区与底部导航发生覆盖: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.documentScrollWidth <= metrics.documentClientWidth + 1,
    `${scenarioName} 岗位任务页出现横向溢出: ${JSON.stringify(metrics)}`
  )
}

async function assertThemeReadable(page, { scenarioName, selector }) {
  const metrics = await page.evaluate((targetSelector) => {
    const target = document.querySelector(targetSelector)
    if (!target) {
      return null
    }
    const style = window.getComputedStyle(target)
    const textNode =
      target.querySelector(
        'h1, h2, h3, .ant-typography, .ant-card-head-title, .erp-mobile-strong, .erp-mobile-page-title, button, input'
      ) || target
    const textStyle = window.getComputedStyle(textNode)
    return {
      selector: targetSelector,
      backgroundColor: style.backgroundColor,
      color: textStyle.color,
      rect: target.getBoundingClientRect().toJSON(),
    }
  }, selector)

  assert(metrics, `${scenarioName} 缺少主题可读性目标: ${selector}`)
  assert(
    !isTransparentColor(metrics.backgroundColor),
    `${scenarioName} 主题目标背景透明，无法验证可读性: ${JSON.stringify(metrics)}`
  )
  const background = parseRgb(metrics.backgroundColor)
  const color = parseRgb(metrics.color)
  assert(
    background && color,
    `${scenarioName} 无法解析主题颜色: ${JSON.stringify(metrics)}`
  )
  const ratio = getContrastRatio(color, background)
  assert(
    ratio >= 3,
    `${scenarioName} 主题文字对比度不足: ${JSON.stringify({
      ...metrics,
      contrastRatio: ratio,
    })}`
  )
}

async function assertLoginSegmentedReadable(page, { scenarioName }) {
  const metrics = await page.evaluate(() =>
    Array.from(
      document.querySelectorAll(
        '.erp-login-card .ant-segmented .ant-segmented-item-selected'
      )
    ).map((item) => {
      const label = item.querySelector('.ant-segmented-item-label') || item
      const itemStyle = window.getComputedStyle(item)
      const labelStyle = window.getComputedStyle(label)
      return {
        text: label.textContent?.replace(/\s+/g, ' ').trim() || '',
        backgroundColor: itemStyle.backgroundColor,
        color: labelStyle.color,
      }
    })
  )

  assert(
    metrics.length >= 2,
    `${scenarioName} 登录页缺少主题或入口 Segmented 选中项: ${JSON.stringify(metrics)}`
  )
  metrics.forEach((item) => {
    const background = parseRgb(item.backgroundColor)
    const color = parseRgb(item.color)
    assert(
      background && color,
      `${scenarioName} 无法解析登录页 Segmented 颜色: ${JSON.stringify(metrics)}`
    )
    const ratio = getContrastRatio(color, background)
    assert(
      ratio >= 4.5,
      `${scenarioName} 登录页 Segmented 选中项对比度不足: ${JSON.stringify({
        ...item,
        contrastRatio: ratio,
      })}`
    )
  })
}

async function assertDarkThemeContrast(
  page,
  { scenarioName, selector = 'body', minRatio = 3 }
) {
  const issues = await page.evaluate(
    ({ targetSelector, minContrastRatio }) => {
      const target = document.querySelector(targetSelector)
      if (!target) {
        return [{ reason: 'missing-target', selector: targetSelector }]
      }

      const parseColor = (value) => {
        const match = String(value || '').match(
          /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)/
        )
        if (!match) return null
        const alpha = match[4] === undefined ? 1 : Number(match[4])
        if (alpha === 0) return null
        return [Number(match[1]), Number(match[2]), Number(match[3]), alpha]
      }
      const luminance = ([red, green, blue]) => {
        const values = [red, green, blue].map((value) => {
          const channel = value / 255
          return channel <= 0.03928
            ? channel / 12.92
            : ((channel + 0.055) / 1.055) ** 2.4
        })
        return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722
      }
      const contrast = (foreground, background) => {
        const lighter = Math.max(luminance(foreground), luminance(background))
        const darker = Math.min(luminance(foreground), luminance(background))
        return (lighter + 0.05) / (darker + 0.05)
      }
      const compositeColor = (top, bottom) => {
        const topAlpha = top[3] ?? 1
        const bottomAlpha = bottom[3] ?? 1
        const alpha = topAlpha + bottomAlpha * (1 - topAlpha)
        if (alpha === 0) return [0, 0, 0, 0]
        return [
          (top[0] * topAlpha + bottom[0] * bottomAlpha * (1 - topAlpha)) /
            alpha,
          (top[1] * topAlpha + bottom[1] * bottomAlpha * (1 - topAlpha)) /
            alpha,
          (top[2] * topAlpha + bottom[2] * bottomAlpha * (1 - topAlpha)) /
            alpha,
          alpha,
        ]
      }
      const backgroundFor = (element) => {
        const layers = []
        let current = element
        while (current && current instanceof Element) {
          const parsed = parseColor(
            window.getComputedStyle(current).backgroundColor
          )
          if (parsed) layers.push(parsed)
          current = current.parentElement
        }
        const bodyColor = parseColor(
          window.getComputedStyle(document.body).backgroundColor
        ) || [255, 255, 255, 1]
        return layers
          .reverse()
          .reduce(
            (background, layer) => compositeColor(layer, background),
            bodyColor
          )
      }
      const isVisible = (element) => {
        const style = window.getComputedStyle(element)
        const rect = element.getBoundingClientRect()
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          Number(style.opacity || 1) > 0.05 &&
          rect.width > 0 &&
          rect.height > 0 &&
          rect.bottom >= 0 &&
          rect.right >= 0 &&
          rect.top <= window.innerHeight &&
          rect.left <= window.innerWidth
        )
      }
      const describe = (element) => {
        const classes =
          element.className && typeof element.className === 'string'
            ? `.${element.className.trim().split(/\s+/).slice(0, 4).join('.')}`
            : ''
        return `${element.tagName.toLowerCase()}${classes}`
      }
      const ignoredSelector = [
        '.anticon',
        '.ant-empty-img-default',
        '.ant-empty-image',
        '.ant-select-arrow',
        '.ant-table-column-sorter',
        '.erp-module-column-header-trigger',
      ].join(',')
      const visibleTextSelector =
        'a, button, label, th, td, h1, h2, h3, h4, p, span, strong, small, input, textarea, .ant-typography, .ant-tag, .ant-btn, .ant-select-selection-item, .ant-select-selection-placeholder, .ant-empty-description'
      const semanticCandidates = Array.from(
        target.querySelectorAll(visibleTextSelector)
      )
      const directTextCandidates = Array.from(
        target.querySelectorAll('*')
      ).filter((element) =>
        Array.from(element.childNodes).some(
          (node) =>
            node.nodeType === Node.TEXT_NODE &&
            String(node.textContent || '')
              .replace(/\s+/g, ' ')
              .trim()
        )
      )
      const candidates = Array.from(
        new Set([...semanticCandidates, ...directTextCandidates])
      )
      const failures = []
      for (const element of candidates) {
        if (!(element instanceof HTMLElement)) continue
        if (
          element.matches(ignoredSelector) ||
          element.closest(ignoredSelector)
        ) {
          continue
        }
        if (!isVisible(element)) continue
        const text =
          element instanceof HTMLInputElement ||
          element instanceof HTMLTextAreaElement
            ? element.placeholder || element.value || ''
            : element.textContent || ''
        const normalizedText = text.replace(/\s+/g, ' ').trim()
        if (!normalizedText) continue
        const style = window.getComputedStyle(element)
        const color = parseColor(style.color)
        const background = backgroundFor(element)
        if (!color || !background) continue
        const ratio = contrast(color, background)
        if (ratio < minContrastRatio) {
          failures.push({
            element: describe(element),
            text: normalizedText.slice(0, 80),
            color: style.color,
            backgroundColor: window.getComputedStyle(element).backgroundColor,
            effectiveBackground: `rgb(${Math.round(background[0])}, ${Math.round(
              background[1]
            )}, ${Math.round(background[2])})`,
            ratio: Number(ratio.toFixed(2)),
          })
        }
      }
      return failures.slice(0, 12)
    },
    { targetSelector: selector, minContrastRatio: minRatio }
  )

  assert.deepEqual(
    issues,
    [],
    `${scenarioName} 暗色主题存在低对比可见文本: ${JSON.stringify(issues)}`
  )
}

async function assertDarkThemeNeutralInteractions(
  page,
  { scenarioName, checks }
) {
  const interactionChecks = checks || [
    {
      label: '搜索输入 hover',
      selector: '.erp-business-filter-control--search',
      action: 'hover',
    },
    {
      label: '搜索输入 focus',
      selector: '.erp-business-filter-control--search',
      action: 'click',
    },
    {
      label: '业务状态筛选 hover',
      selector: '.erp-business-filter-control--status .ant-select-selector',
      action: 'hover',
    },
    {
      label: '日期筛选 hover',
      selector: '.erp-business-date-range-filter',
      action: 'hover',
    },
    {
      label: '普通工具按钮 hover',
      selector: '.erp-business-toolbar-button:not(.ant-btn-primary)',
      action: 'hover',
    },
    {
      label: '表头工具按钮 hover',
      selector: '.erp-module-column-header-trigger.ant-btn',
      action: 'hover',
    },
    {
      label: '表头单元格 hover',
      selector: '.erp-business-data-table-card .ant-table-thead > tr > th',
      action: 'hover',
      index: 2,
    },
  ]

  const metrics = []
  for (const check of interactionChecks) {
    const locator =
      check.index === undefined
        ? page.locator(check.selector).first()
        : page.locator(check.selector).nth(check.index)
    await locator.waitFor({ state: 'visible', timeout: 10_000 })
    if (check.action === 'click') {
      await locator.click()
    } else {
      await locator.hover()
    }
    await page.waitForTimeout(160)
    metrics.push(
      await locator.evaluate((node, label) => {
        const style = window.getComputedStyle(node)
        return {
          label,
          selector:
            node.className && typeof node.className === 'string'
              ? `${node.tagName.toLowerCase()}.${node.className
                  .trim()
                  .split(/\s+/)
                  .slice(0, 4)
                  .join('.')}`
              : node.tagName.toLowerCase(),
          backgroundColor: style.backgroundColor,
          borderColor: style.borderColor,
          borderTopColor: style.borderTopColor,
          boxShadow: style.boxShadow,
          outlineColor: style.outlineColor,
        }
      }, check.label)
    )
    if (check.action === 'click') {
      await page.keyboard.press('Escape').catch(() => {})
      await page.evaluate(() => document.activeElement?.blur?.())
    }
  }

  const greenIssues = metrics.filter((metric) =>
    hasGreenDominantInteractivePaint(metric)
  )
  assert.deepEqual(
    greenIssues,
    [],
    `${scenarioName} 暗色主题交互态仍残留绿色 hover/focus 面: ${JSON.stringify(
      greenIssues
    )}`
  )
}

async function assertDarkLoadingState(page, { scenarioName }) {
  const metrics = await page.evaluate(() => {
    const readNode = (selector) => {
      const node = document.querySelector(selector)
      if (!node) return null
      const style = window.getComputedStyle(node)
      const rect = node.getBoundingClientRect()
      return {
        selector,
        text: node.textContent?.replace(/\s+/g, ' ').trim() || '',
        backgroundColor: style.backgroundColor,
        borderColor: style.borderColor,
        boxShadow: style.boxShadow,
        color: style.color,
        width: rect.width,
        height: rect.height,
      }
    }
    return {
      page: readNode('.loading-page'),
      panel: readNode('.loading-page__panel'),
      title: readNode('.loading-page__title'),
      description: readNode('.loading-page__description'),
      dot: readNode('.loading-page .ant-spin-dot-item'),
    }
  })

  assert(
    metrics.page &&
      metrics.panel &&
      metrics.title &&
      metrics.description &&
      metrics.dot,
    `${scenarioName} 缺少可检查的暗色加载态: ${JSON.stringify(metrics)}`
  )
  assert(
    isDarkControlBackground(metrics.panel.backgroundColor),
    `${scenarioName} 加载态面板仍是浅色背景: ${JSON.stringify(metrics)}`
  )
  assert(
    isDarkNeutralBorderColor(metrics.panel.borderColor),
    `${scenarioName} 加载态面板边框未接入暗色主题: ${JSON.stringify(metrics)}`
  )
  assert(
    String(metrics.panel.boxShadow || '') !== 'none',
    `${scenarioName} 加载态面板缺少浮层阴影: ${JSON.stringify(metrics)}`
  )
  assert(
    isBluePrimaryColor(metrics.dot.backgroundColor),
    `${scenarioName} 加载态 Spin 未使用暗色主题主交互色: ${JSON.stringify(metrics)}`
  )
  assertReadableOnDark(
    metrics.title.color,
    metrics.panel.backgroundColor,
    `${scenarioName} 加载态标题对比度不足`
  )
  assertReadableOnDark(
    metrics.description.color,
    metrics.panel.backgroundColor,
    `${scenarioName} 加载态说明对比度不足`
  )
}

async function assertDarkAntdStateSurfaces(page, { scenarioName }) {
  const metrics = await page.evaluate(() => {
    const readNode = (selector) => {
      const node = document.querySelector(selector)
      if (!node) return null
      const style = window.getComputedStyle(node)
      return {
        selector,
        text: node.textContent?.replace(/\s+/g, ' ').trim().slice(0, 100) || '',
        backgroundColor: style.backgroundColor,
        borderColor: style.borderColor,
        color: style.color,
      }
    }
    return {
      empty: readNode('.ant-empty'),
      emptyDescription: readNode('.ant-empty-description'),
      tag: readNode('.ant-tag'),
      paginationItem: readNode('.ant-pagination .ant-pagination-item'),
      tablePlaceholder: readNode('.ant-table-placeholder > td'),
    }
  })

  const visibleStates = Object.values(metrics).filter(Boolean)
  assert(
    visibleStates.length >= 1,
    `${scenarioName} 缺少可检查的 AntD 状态组件: ${JSON.stringify(metrics)}`
  )

  visibleStates.forEach((item) => {
    const background = isTransparentColor(item.backgroundColor)
      ? 'rgb(17, 24, 39)'
      : item.backgroundColor
    if (!isTransparentColor(item.backgroundColor)) {
      assert(
        !isLightSurfaceColor(item.backgroundColor),
        `${scenarioName} ${item.selector} 仍是浅色背景: ${JSON.stringify(metrics)}`
      )
    }
    assertReadableOnDark(
      item.color,
      background,
      `${scenarioName} ${item.selector} 文字对比度不足`
    )
  })
}

function hasGreenDominantInteractivePaint(metric) {
  return [
    metric.backgroundColor,
    metric.borderColor,
    metric.borderTopColor,
    metric.boxShadow,
    metric.outlineColor,
  ].some((value) => containsGreenDominantColor(value))
}

function containsGreenDominantColor(value) {
  const matches = String(value || '').matchAll(
    /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)/gi
  )
  for (const match of matches) {
    const red = Number(match[1])
    const green = Number(match[2])
    const blue = Number(match[3])
    const alpha = match[4] === undefined ? 1 : Number(match[4])
    if (alpha <= 0.05) continue
    if (green >= 72 && green > red * 1.18 && green > blue * 1.08) {
      return true
    }
  }
  return false
}

function getContrastRatio(foreground, background) {
  const lighter = Math.max(getLuminance(foreground), getLuminance(background))
  const darker = Math.min(getLuminance(foreground), getLuminance(background))
  return (lighter + 0.05) / (darker + 0.05)
}

function parseRgb(value) {
  const match = String(value || '').match(
    /rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([0-9.]+))?\)/
  )
  if (!match) return null
  if (match[4] !== undefined && Number(match[4]) === 0) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function getLuminance([red, green, blue]) {
  const values = [red, green, blue].map((value) => {
    const channel = value / 255
    return channel <= 0.03928
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4
  })
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722
}

function isTransparentColor(color) {
  return (
    String(color || '').replaceAll(' ', '') === 'rgba(0,0,0,0)' ||
    String(color || '').trim() === 'transparent'
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
