import { RpcErrorCode } from '../../src/common/consts/errorCodes.generated.js'

export function createCustomerSessionScenarios({
  expectHeading,
  expectButton,
  assertAdminLoginLayout,
  expectText,
  assertTextAbsent,
  assertNoDuplicatedAdminPageTitle,
  assertShellRefreshButton,
  assertNoDashboardCenterLocalRefreshButton,
  assert,
  waitForPath,
  customerRoleAdminProfile,
  customerRoleRuntimeSession,
  path,
  outputDir,
  assertNoHorizontalOverflow,
  clickERPThemeOption,
  assertERPThemeMode,
  assertDarkThemeContrast,
  assertDashboardWorkbenchEntryNavigation,
  assertDashboardWorkbenchLayout,
  customerRuntimeEffectiveSession,
  assertThemeReadable,
  expectNoButton,
  gotoScenarioPath,
}) {
  const expectEffectiveSessionMode = async (page, mode) => {
    const layout = page.locator('[data-effective-session-mode]').first()
    await layout.waitFor({ state: 'visible', timeout: 10_000 })
    assert.equal(
      await layout.getAttribute('data-effective-session-mode'),
      mode,
      `effective session 诊断模式应为 ${mode}`
    )
  }
  const roleGuidedCustomerConfig = Object.freeze({
    desktopMenu: Object.freeze({
      presentation: 'role_guided',
      hiddenItemKeys: Object.freeze([]),
    }),
  })
  const yoyoosunBrandHomeCustomerConfig = Object.freeze({
    ...roleGuidedCustomerConfig,
    brand: Object.freeze({
      brandMark: '永',
      companyName: '东莞市永绅玩具有限公司',
      systemName: '业务管理',
    }),
  })
  const localCustomerDesktopPreviewEffectiveSession = Object.freeze({
    configRevision: '',
    configHash: '',
    customer: { key: 'yoyoosun', name: '永绅' },
    pages: ['global-dashboard'],
    actions: ['erp.workbench.read', 'workflow.task.read'],
    workflow_visible_owner_role_keys_by_capability: {
      'workflow.task.read': ['boss'],
    },
    fieldPolicies: {},
    workPools: [],
    source: 'builtin_rbac_fallback',
  })
  let localCustomerDesktopPreviewWorkflowRequests = 0
  let transientProfileSyncCustomerConfigRequests = 0
  let transientProfileSyncAdminMeRequests = 0
  let unauthorizedProductionFactRequests = 0
  let permissionSafeProductionReferenceRequests = 0
  let permissionSafeProductionExceptionRequests = 0
  let permissionSafeSupplierProcessRequests = 0
  let permissionSafeInventoryReferenceRequests = []
  let permissionSafeProductReferenceRequests = []
  return [
    {
      name: 'erp-dashboard-redirect',
      path: '/erp/dashboard',
      viewport: { width: 1280, height: 800 },
      verify: async (page) => {
        await expectHeading(page, '毛绒玩具管理系统')
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
        await expectText(page, '毛绒玩具管理系统')
        await expectText(page, '超级管理员')
        await expectText(page, 'style-l1-admin')
        await expectText(page, '功能预览')
        await expectHeading(page, '系统功能总览')
        await expectText(page, '业务功能')
        await expectText(page, '销售订单')
        await expectText(page, '尚未连接客户环境')
        await assertTextAbsent(page, '内部来源')
        await assertTextAbsent(page, '优先处理队列')
        await assertTextAbsent(page, '当前任务上下文')
        await assertNoDuplicatedAdminPageTitle(page, {
          scenarioName: 'erp-dashboard-desktop',
        })
        await assertShellRefreshButton(page, {
          scenarioName: 'erp-dashboard-desktop',
          expectVisible: true,
        })
        await assertNoDashboardCenterLocalRefreshButton(page, {
          scenarioName: 'erp-dashboard-desktop',
        })
        const productCoreMetrics = await page.evaluate(() => {
          const dashboard = document.querySelector(
            '[data-product-core-dashboard="true"]'
          )
          const table = document.querySelector('.ant-table')
          const metrics = Array.from(
            document.querySelectorAll('.erp-product-core-metric')
          ).map((item) => ({
            label:
              item.querySelector('.ant-typography')?.textContent?.trim() || '',
            value: item.querySelector('strong')?.textContent?.trim() || '',
          }))
          const entries = Array.from(
            document.querySelectorAll('.erp-product-core-entry')
          ).map((item) => item.textContent || '')
          const rect = dashboard?.getBoundingClientRect()
          return {
            hasDashboard: Boolean(dashboard),
            hasTable: Boolean(table),
            metrics,
            entries,
            width: rect?.width || 0,
            height: rect?.height || 0,
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
          }
        })
        assert.equal(productCoreMetrics.hasDashboard, true)
        assert.equal(productCoreMetrics.hasTable, false)
        assert.deepEqual(
          productCoreMetrics.metrics,
          [
            { label: '业务功能', value: '11' },
            { label: '系统设置', value: '4' },
          ],
          `Product Core 首页摘要应只保留数值指标: ${JSON.stringify(
            productCoreMetrics
          )}`
        )
        assert(
          productCoreMetrics.entries.some((item) =>
            item.startsWith('销售订单')
          ),
          `Product Core 首页应展示能力总览和审阅入口: ${JSON.stringify(
            productCoreMetrics
          )}`
        )
        assert(
          productCoreMetrics.width > 0 && productCoreMetrics.height > 0,
          `Product Core 首页应有稳定占位: ${JSON.stringify(productCoreMetrics)}`
        )
        assert(
          productCoreMetrics.scrollWidth <= productCoreMetrics.clientWidth + 1,
          `Product Core 首页不应横向溢出: ${JSON.stringify(productCoreMetrics)}`
        )
        await page.getByRole('button', { name: /^销售订单/ }).click()
        await waitForPath(page, '/erp/sales/project-orders/sales-orders')
        await expectText(page, '销售订单 功能预览')
        await page.goBack({ waitUntil: 'domcontentloaded' })
        await expectHeading(page, '系统功能总览')
      },
    },
    {
      name: 'yoyoosun-brand-home-desktop',
      path: '/erp/task-board',
      auth: 'admin',
      customerConfig: yoyoosunBrandHomeCustomerConfig,
      adminProfile: customerRoleAdminProfile('sales', 'brand_home_sales'),
      effectiveSession: customerRoleRuntimeSession(
        ['sales'],
        'style-l1-brand-home-desktop'
      ),
      viewport: { width: 1280, height: 720 },
      verify: async (page) => {
        await waitForPath(page, '/erp/task-board')
        const homeEntry = page.locator(
          '.erp-admin-sider .erp-admin-brand__home'
        )
        await homeEntry.waitFor({ state: 'visible', timeout: 10_000 })
        await homeEntry.focus()
        const homeMetrics = await homeEntry.evaluate((node) => {
          const buttonRect = node.getBoundingClientRect()
          const logoRect = node
            .querySelector('.erp-admin-brand__logo')
            ?.getBoundingClientRect()
          const style = window.getComputedStyle(node)
          return {
            ariaLabel: node.getAttribute('aria-label') || '',
            boxShadow: style.boxShadow,
            buttonHeight: buttonRect.height,
            buttonWidth: buttonRect.width,
            cursor: style.cursor,
            focused: document.activeElement === node,
            logoHeight: logoRect?.height || 0,
            logoWidth: logoRect?.width || 0,
            overflow: node.scrollWidth - node.clientWidth,
            tagName: node.tagName,
            title: node.getAttribute('title') || '',
          }
        })
        assert(
          homeMetrics.ariaLabel === '返回首页：工作台' &&
            homeMetrics.title === '返回工作台' &&
            homeMetrics.tagName === 'BUTTON' &&
            homeMetrics.cursor === 'pointer' &&
            homeMetrics.focused &&
            homeMetrics.boxShadow !== 'none' &&
            homeMetrics.buttonWidth >= homeMetrics.logoWidth &&
            homeMetrics.buttonHeight >= homeMetrics.logoHeight &&
            homeMetrics.overflow <= 1,
          `品牌首页入口的语义、焦点或点击范围异常: ${JSON.stringify(homeMetrics)}`
        )
        await page.screenshot({
          path: path.resolve(
            outputDir,
            'yoyoosun-brand-home-desktop-focus.png'
          ),
          fullPage: true,
        })
        await page.keyboard.press('Enter')
        await waitForPath(page, '/erp/dashboard')
        await page.waitForLoadState('networkidle').catch(() => {})

        const sameRouteRPCMethods = []
        const trackSameRouteRequest = (request) => {
          if (request.method() !== 'POST') return
          try {
            const method = request.postDataJSON()?.method
            if (method) sameRouteRPCMethods.push(method)
          } catch {
            // 非 JSON 请求不参与同路由重复读取断言。
          }
        }
        page.on('request', trackSameRouteRequest)
        try {
          await homeEntry.click()
          await page.waitForTimeout(250)
        } finally {
          page.off('request', trackSameRouteRequest)
        }
        await waitForPath(page, '/erp/dashboard')
        assert.deepEqual(
          sameRouteRPCMethods,
          [],
          `已在工作台时点击品牌区不应重复读取页面: ${JSON.stringify(sameRouteRPCMethods)}`
        )
        await assertNoHorizontalOverflow(page, 'yoyoosun-brand-home-desktop')
      },
    },
    {
      name: 'yoyoosun-brand-home-mobile-dark',
      path: '/erp/master/products',
      auth: 'admin',
      themeMode: 'dark',
      customerConfig: yoyoosunBrandHomeCustomerConfig,
      adminProfile: customerRoleAdminProfile('sales', 'brand_home_sales'),
      effectiveSession: customerRoleRuntimeSession(
        ['sales'],
        'style-l1-brand-home-mobile-dark'
      ),
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        await waitForPath(page, '/erp/master/products')
        const openNavigation = page.getByRole('button', {
          name: '打开导航菜单',
        })
        await openNavigation.focus()
        await page.keyboard.press('Enter')
        const drawer = page.locator('.erp-admin-drawer:visible')
        await drawer.waitFor({ state: 'visible', timeout: 10_000 })
        const homeEntry = drawer.locator('.erp-admin-brand__home')
        await homeEntry.focus()
        await homeEntry.hover()
        await page.waitForTimeout(200)
        const homeMetrics = await homeEntry.evaluate((node) => {
          const rect = node.getBoundingClientRect()
          const brandRect = node.parentElement?.getBoundingClientRect()
          const style = window.getComputedStyle(node)
          return {
            ariaLabel: node.getAttribute('aria-label') || '',
            backgroundColor: style.backgroundColor,
            boxShadow: style.boxShadow,
            contained:
              Boolean(brandRect) &&
              rect.left >= brandRect.left - 1 &&
              rect.right <= brandRect.right + 1,
            focused: document.activeElement === node,
            overflow: node.scrollWidth - node.clientWidth,
          }
        })
        assert(
          homeMetrics.ariaLabel === '返回首页：工作台' &&
            homeMetrics.backgroundColor !== 'rgba(0, 0, 0, 0)' &&
            homeMetrics.boxShadow !== 'none' &&
            homeMetrics.contained &&
            homeMetrics.focused &&
            homeMetrics.overflow <= 1,
          `移动暗色品牌首页入口的焦点、悬停或边界异常: ${JSON.stringify(homeMetrics)}`
        )
        await page.screenshot({
          path: path.resolve(
            outputDir,
            'yoyoosun-brand-home-mobile-dark-focus.png'
          ),
          fullPage: false,
        })
        await page.keyboard.press('Enter')
        await waitForPath(page, '/erp/dashboard')
        await drawer.waitFor({ state: 'hidden', timeout: 10_000 })
        await assertNoHorizontalOverflow(
          page,
          'yoyoosun-brand-home-mobile-dark'
        )
      },
    },
    {
      name: 'erp-yoyo-global-dashboard-desktop',
      path: '/erp/dashboard?__style_l1_workbench_delay=2000',
      auth: 'admin',
      effectiveSession: {
        configRevision: 'style-l1-yoyo-global-dashboard',
        configHash: 'style-l1-yoyo-global-dashboard-hash',
        customer: { key: 'yoyoosun', name: '永绅' },
        pages: ['global-dashboard', 'task-board', 'sales-orders'],
        actions: [
          'erp.workbench.read',
          'workflow.task.create',
          'workflow.task.read',
          'workflow.task.update',
          'workflow.task.complete',
          'workflow.task.approve',
          'sales_order.read',
        ],
        workflow_visible_owner_role_keys_by_capability: {
          'workflow.task.read': ['boss'],
          'workflow.task.update': ['boss'],
          'workflow.task.complete': ['boss'],
          'workflow.task.approve': ['boss'],
        },
        fieldPolicies: {},
        workPools: [],
        source: 'active_customer_config_revision',
      },
      adminProfile: {
        username: 'style-l1-yoyo-boss',
        is_super_admin: false,
        roles: [{ role_key: 'boss', name: '老板' }],
        permissions: [
          'erp.workbench.read',
          'workflow.task.create',
          'workflow.task.read',
          'workflow.task.update',
          'workflow.task.complete',
          'workflow.task.approve',
          'sales_order.read',
        ],
        menus: [
          {
            key: 'global-dashboard',
            label: '全局看板',
            path: '/erp/dashboard',
            required_any: ['erp.workbench.read'],
            required_all: [],
          },
          {
            key: 'task-board',
            label: '任务看板',
            path: '/erp/task-board',
            required_any: ['workflow.task.read'],
            required_all: [],
          },
          {
            key: 'sales-orders',
            label: '销售订单',
            path: '/erp/sales/project-orders/sales-orders',
            required_any: ['sales_order.read'],
            required_all: [],
          },
        ],
      },
      viewport: { width: 1440, height: 600 },
      verify: async (page) => {
        await expectHeading(page, '工作台')
        await expectText(page, '待我处理')
        await expectText(page, '待我审批')
        await expectText(page, '阻塞/逾期')
        await expectText(page, '待我处理')
        await page
          .locator(
            '.erp-workbench-queue-panel[aria-busy="true"] .ant-spin-spinning'
          )
          .waitFor({ state: 'visible', timeout: 5_000 })
        const loadingShell = await page.evaluate(() => {
          const card = document.querySelector('.erp-workbench-command-card')
          const queue = document.querySelector('.erp-workbench-queue-panel')
          const detail = document.querySelector('.erp-workbench-task-detail')
          const cardRect = card?.getBoundingClientRect()
          return {
            cardWidth: cardRect?.width || 0,
            cardHeight: cardRect?.height || 0,
            queueVisible: Boolean(queue?.getBoundingClientRect().height),
            detailVisible: Boolean(detail?.getBoundingClientRect().height),
            queueBusy: queue?.getAttribute('aria-busy'),
            spinnerVisible: Boolean(queue?.querySelector('.ant-spin-spinning')),
            cardSkeletonCount:
              card?.querySelectorAll('.ant-skeleton').length || 0,
            filterLabels: [
              ...(card?.querySelectorAll('.erp-workbench-queue-filter') || []),
            ].map((item) => item.getAttribute('aria-label') || ''),
          }
        })
        assert(
          loadingShell.cardWidth > 0 &&
            loadingShell.cardHeight > 0 &&
            loadingShell.queueVisible &&
            !loadingShell.detailVisible &&
            loadingShell.queueBusy === 'true' &&
            loadingShell.spinnerVisible &&
            loadingShell.cardSkeletonCount === 0 &&
            loadingShell.filterLabels.every((label) =>
              label.includes('数量读取中')
            ),
          `工作台慢响应时应先显示完整页面外壳，只让任务表局部加载: ${JSON.stringify(
            loadingShell
          )}`
        )
        await page.screenshot({
          path: path.resolve(
            outputDir,
            'erp-yoyo-global-dashboard-loading-shell.png'
          ),
        })
        await page
          .locator('.erp-workbench-queue-panel[aria-busy="false"]')
          .waitFor({ state: 'visible', timeout: 10_000 })
        await page.evaluate(() => {
          const url = new URL(window.location.href)
          url.searchParams.delete('__style_l1_workbench_delay')
          window.history.replaceState({}, '', url)
        })
        await assertTextAbsent(page, '当前可见任务概览')
        await assertTextAbsent(page, '等待交接')
        for (const engineeringText of [
          'Product Core',
          'customer key',
          'Workflow',
          'RBAC',
          'source document',
          '内部来源',
        ]) {
          await assertTextAbsent(page, engineeringText)
        }

        const seededTaskCount = await page.evaluate(async () => {
          const now = Math.floor(Date.now() / 1000)
          const createTask = async ({
            index,
            overdue = false,
            blocked = false,
          }) => {
            const suffix = String(index).padStart(2, '0')
            const kind = blocked
              ? 'blocked-overdue'
              : overdue
                ? 'risk'
                : 'actionable'
            const sourceKind = blocked ? 'B' : overdue ? 'R' : 'A'
            const response = await fetch('/rpc/workflow', {
              method: 'POST',
              headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: `workbench-long-queue-${kind}-${suffix}`,
                method: 'create_task',
                params: {
                  task_code: `style-l1-workbench-${kind}-${suffix}`,
                  task_group: 'sales-orders',
                  task_name: `${
                    blocked
                      ? '长队列阻塞逾期'
                      : overdue
                        ? '长队列逾期'
                        : '长队列待办'
                  } ${suffix}`,
                  source_type: 'sales-orders',
                  source_id: 10_000 + index + (overdue ? 1_000 : 0),
                  source_no: `SO-LONG-${sourceKind}-${suffix}`,
                  business_status_key: 'project_pending',
                  task_status_key: 'ready',
                  owner_role_key: 'boss',
                  ...(index === 1 && !overdue
                    ? { required_capability_key: 'workflow.task.approve' }
                    : {}),
                  priority: overdue ? 90 : 1,
                  due_at: overdue
                    ? now - (10 - index) * 60
                    : now + 86_400 + index * 60,
                  payload: { notification_type: 'task_created' },
                },
              }),
            })
            const body = await response.json()
            if (!response.ok || body?.result?.code !== 0) {
              throw new Error(
                `create long workbench task failed: ${JSON.stringify(body)}`
              )
            }
            const task = body.result.data?.task || null
            if (!blocked || !task) return task

            const mutationResponse = await fetch('/rpc/workflow', {
              method: 'POST',
              headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: `workbench-long-queue-block-${suffix}`,
                method: 'block_task_action',
                params: {
                  task_id: task.id,
                  expected_version: task.version,
                  idempotency_key: `style-l1-workbench-block-${task.id}`,
                  action_key: 'block',
                  reason: '等待资料补齐',
                },
              }),
            })
            const mutationBody = await mutationResponse.json()
            if (!mutationResponse.ok || mutationBody?.result?.code !== 0) {
              throw new Error(
                `block long workbench task failed: ${JSON.stringify(
                  mutationBody
                )}`
              )
            }
            return mutationBody.result.data?.task || null
          }

          for (let index = 1; index <= 18; index += 1) {
            await createTask({ index })
          }
          for (let index = 1; index <= 9; index += 1) {
            await createTask({
              index,
              overdue: true,
              blocked: index === 1,
            })
          }
          return 27
        })
        assert.equal(seededTaskCount, 27, '工作台长队列样本应完整创建')
        const workbenchReadMethods = []
        const recordWorkbenchRead = (request) => {
          if (!request.url().includes('/rpc/workflow')) return
          try {
            const method = request.postDataJSON()?.method
            if (
              ['get_workbench', 'list_workbench_role_tasks'].includes(method)
            ) {
              workbenchReadMethods.push(method)
            }
          } catch {
            // Non-JSON requests are outside this RPC assertion.
          }
        }
        page.on('request', recordWorkbenchRead)
        await page.getByRole('button', { name: '刷新当前页' }).click()
        await page
          .locator('.erp-workbench-queue-panel[aria-busy="false"]')
          .waitFor({ state: 'visible', timeout: 10_000 })
        page.off('request', recordWorkbenchRead)
        assert.deepEqual(
          workbenchReadMethods,
          ['get_workbench'],
          `刷新工作台应只有一条有界读取，不再按岗位和视图扇出: ${JSON.stringify(
            workbenchReadMethods
          )}`
        )

        const queuePanel = page.locator('.erp-workbench-queue-panel')
        const waitForWorkbenchRead = (queueKey, offset = 0) =>
          page.waitForResponse((response) => {
            if (!response.url().includes('/rpc/workflow')) return false
            try {
              const body = response.request().postDataJSON()
              return (
                body?.method === 'get_workbench' &&
                body?.params?.queue_key === queueKey &&
                body?.params?.offset === offset
              )
            } catch {
              return false
            }
          })
        const actionableFilter = page.getByRole('button', {
          name: /待我处理，\d+ 项/,
        })
        const approvalFilter = page.getByRole('button', {
          name: /待我审批，\d+ 项/,
        })
        const riskFilter = page.getByRole('button', {
          name: /阻塞\/逾期，\d+ 项/,
        })
        const actionableLabel =
          await actionableFilter.getAttribute('aria-label')
        const actionableTotal = Number(
          String(actionableLabel || '').match(/待我处理，(\d+) 项/u)?.[1] || 0
        )
        assert(
          actionableTotal >= 18,
          `工作台待处理队列应包含新建的 18 条样本: ${actionableLabel}`
        )
        const approvalLabel = await approvalFilter.getAttribute('aria-label')
        const approvalTotal = Number(
          String(approvalLabel || '').match(/待我审批，(\d+) 项/u)?.[1] || 0
        )
        assert(
          approvalTotal >= 1,
          `工作台审批队列应包含显式审批任务: ${approvalLabel}`
        )
        const approvalRead = waitForWorkbenchRead('approval')
        await approvalFilter.click()
        await approvalRead
        await queuePanel
          .getByText('长队列待办 01', { exact: true })
          .waitFor({ state: 'visible', timeout: 10_000 })
        await page.screenshot({
          path: path.resolve(
            outputDir,
            'erp-yoyo-global-dashboard-approval-inbox.png'
          ),
        })
        const actionableRead = waitForWorkbenchRead('actionable')
        await actionableFilter.click()
        await actionableRead
        await page
          .locator('.erp-workbench-queue-panel[aria-busy="false"]')
          .waitFor({ state: 'visible', timeout: 10_000 })
        await queuePanel
          .locator('.ant-table-tbody .ant-table-row')
          .first()
          .waitFor({ state: 'visible', timeout: 10_000 })
        assert.equal(
          await queuePanel.locator('.ant-table-tbody .ant-table-row').count(),
          8,
          '工作台长队列首屏应只展示 8 项'
        )
        const readWorkbenchPaginationLayout = () =>
          page.evaluate(() => {
            const readRect = (selector) => {
              const element = document.querySelector(selector)
              if (!(element instanceof HTMLElement)) return null
              const rect = element.getBoundingClientRect()
              return {
                top: Number(rect.top.toFixed(2)),
                left: Number(rect.left.toFixed(2)),
                width: Number(rect.width.toFixed(2)),
                height: Number(rect.height.toFixed(2)),
              }
            }
            const content = document.querySelector('.erp-admin-content')
            const firstRow = document.querySelector(
              '.erp-workbench-queue-panel .ant-table-tbody .ant-table-row'
            )
            const detailTitle = document.querySelector(
              '.erp-workbench-task-detail .erp-workbench-detail-title'
            )
            return {
              commandCard: readRect('.erp-workbench-command-card'),
              mainGrid: readRect('.erp-workbench-main-grid'),
              queuePanel: readRect('.erp-workbench-queue-panel'),
              table: readRect('.erp-workbench-queue-panel .ant-table-wrapper'),
              pagination: readRect('.erp-task-pagination .ant-pagination'),
              detailPanel: readRect('.erp-workbench-task-detail'),
              content: {
                rect: readRect('.erp-admin-content'),
                clientHeight: content?.clientHeight || 0,
                scrollHeight: content?.scrollHeight || 0,
                scrollTop: content?.scrollTop || 0,
              },
              rowCount: document.querySelectorAll(
                '.erp-workbench-queue-panel .ant-table-tbody .ant-table-row'
              ).length,
              firstRowText: String(firstRow?.textContent || '')
                .replace(/\s+/gu, ' ')
                .trim(),
              detailTitle: String(detailTitle?.textContent || '').trim(),
            }
          })
        const assertWorkbenchPaginationGeometryStable = (
          before,
          after,
          label
        ) => {
          const tolerance = 2
          for (const key of [
            'commandCard',
            'mainGrid',
            'queuePanel',
            'table',
            'pagination',
          ]) {
            assert(before[key], `${label}: 缺少翻页前 ${key} 几何信息`)
            assert(after[key], `${label}: 缺少翻页后 ${key} 几何信息`)
            for (const metric of label === '工作台翻页完成后'
              ? ['left', 'width', 'height']
              : ['top', 'left', 'width', 'height']) {
              const delta = Math.abs(before[key][metric] - after[key][metric])
              assert(
                delta <= tolerance,
                `${label}: ${key}.${metric} 位移 ${delta}px 超过 ${tolerance}px；before=${JSON.stringify(
                  before[key]
                )} after=${JSON.stringify(after[key])}`
              )
            }
          }
          for (const metric of label === '工作台翻页完成后'
            ? ['clientHeight', 'scrollHeight']
            : ['clientHeight', 'scrollHeight', 'scrollTop']) {
            const delta = Math.abs(
              before.content[metric] - after.content[metric]
            )
            assert(
              delta <= tolerance,
              `${label}: content.${metric} 变化 ${delta}px 超过 ${tolerance}px；before=${JSON.stringify(
                before.content
              )} after=${JSON.stringify(after.content)}`
            )
          }
        }
        const actionableSecondPageButton = page.locator(
          '.ant-pagination-item-2'
        )
        await actionableSecondPageButton.scrollIntoViewIfNeeded()
        await page.evaluate(
          () =>
            new Promise((resolve) => {
              requestAnimationFrame(() => {
                requestAnimationFrame(() => resolve())
              })
            })
        )
        const firstPageLayout = await readWorkbenchPaginationLayout()
        await page.evaluate(() => {
          const url = new URL(window.location.href)
          url.searchParams.set('__style_l1_workbench_delay', '1200')
          window.history.replaceState({}, '', url)
        })
        const actionableSecondPageRead = waitForWorkbenchRead(
          'actionable',
          8
        ).then(
          () => null,
          (error) => error
        )
        await actionableSecondPageButton.click()
        await queuePanel
          .locator('.ant-spin-spinning')
          .waitFor({ state: 'visible', timeout: 10_000 })
        const loadingSecondPageLayout = await readWorkbenchPaginationLayout()
        assert.equal(
          loadingSecondPageLayout.rowCount,
          firstPageLayout.rowCount,
          '工作台翻页加载中应保留当前 8 行，而不是先清空表格'
        )
        assert.equal(
          loadingSecondPageLayout.firstRowText,
          firstPageLayout.firstRowText,
          '工作台翻页加载中应保留当前页首行'
        )
        assertWorkbenchPaginationGeometryStable(
          firstPageLayout,
          loadingSecondPageLayout,
          '工作台翻页加载中'
        )
        await page.screenshot({
          path: path.resolve(
            outputDir,
            'erp-yoyo-global-dashboard-pagination-loading-stable.png'
          ),
        })
        const actionableSecondPageReadError = await actionableSecondPageRead
        if (actionableSecondPageReadError) {
          throw actionableSecondPageReadError
        }
        await page
          .locator('.erp-workbench-queue-panel[aria-busy="false"]')
          .waitFor({ state: 'visible', timeout: 10_000 })
        await page
          .locator('.ant-pagination-item-2.ant-pagination-item-active')
          .waitFor({ state: 'visible', timeout: 10_000 })
        const settledSecondPageLayout = await readWorkbenchPaginationLayout()
        assert.equal(
          settledSecondPageLayout.rowCount,
          8,
          '工作台第二页完成后仍应展示 8 行'
        )
        assert.notEqual(
          settledSecondPageLayout.firstRowText,
          firstPageLayout.firstRowText,
          '工作台第二页完成后应原子替换为新页数据'
        )
        assertWorkbenchPaginationGeometryStable(
          firstPageLayout,
          settledSecondPageLayout,
          '工作台翻页完成后'
        )
        const queueStart = await page.evaluate(() => {
          const content = document.querySelector('.erp-admin-content')
          const panel = document.querySelector('.erp-workbench-queue-panel')
          return Math.abs(
            panel.getBoundingClientRect().top -
              content.getBoundingClientRect().top -
              parseFloat(getComputedStyle(content).paddingTop) -
              12
          )
        })
        assert(queueStart <= 2, '工作台翻页后定位列表起点')
        await page.screenshot({
          path: path.resolve(
            outputDir,
            'erp-yoyo-global-dashboard-pagination-settled.png'
          ),
        })
        await page.evaluate(() => {
          const url = new URL(window.location.href)
          url.searchParams.delete('__style_l1_workbench_delay')
          window.history.replaceState({}, '', url)
        })

        const riskLabel = await riskFilter.getAttribute('aria-label')
        const riskTotal = Number(
          String(riskLabel || '').match(/阻塞\/逾期，(\d+) 项/u)?.[1] || 0
        )
        assert(
          riskTotal >= 9,
          `工作台风险队列应包含新建的 9 条样本: ${riskLabel}`
        )
        const riskRead = waitForWorkbenchRead('risk')
        await riskFilter.click()
        await riskRead
        await queuePanel
          .locator('.ant-table-tbody .ant-table-row')
          .first()
          .waitFor({ state: 'visible', timeout: 10_000 })
        const firstRiskRow = queuePanel
          .locator('.ant-table-tbody .ant-table-row')
          .first()
        await firstRiskRow
          .getByText('长队列阻塞逾期 01', { exact: true })
          .waitFor({ state: 'visible', timeout: 10_000 })
        const statusRiskMetrics = await firstRiskRow
          .locator('.erp-workbench-task-status-risk')
          .evaluate((element) => {
            const containerRect = element.getBoundingClientRect()
            const tags = [...element.querySelectorAll('.ant-tag')]
            return {
              labels: tags.map((tag) => String(tag.textContent || '').trim()),
              tagCount: tags.length,
              clientWidth: element.clientWidth,
              scrollWidth: element.scrollWidth,
              tagsInside: tags.every((tag) => {
                const rect = tag.getBoundingClientRect()
                return (
                  rect.left >= containerRect.left - 1 &&
                  rect.right <= containerRect.right + 1
                )
              }),
            }
          })
        assert.deepEqual(
          statusRiskMetrics.labels,
          ['阻塞', '逾期'],
          `阻塞且逾期的工作台任务应同时展示主状态与时间风险: ${JSON.stringify(
            statusRiskMetrics
          )}`
        )
        assert(
          statusRiskMetrics.tagCount === 2 &&
            statusRiskMetrics.clientWidth > 0 &&
            statusRiskMetrics.scrollWidth <=
              statusRiskMetrics.clientWidth + 1 &&
            statusRiskMetrics.tagsInside,
          `工作台状态与风险标签不得溢出单元格: ${JSON.stringify(
            statusRiskMetrics
          )}`
        )
        await queuePanel.screenshot({
          path: path.resolve(
            outputDir,
            'erp-yoyo-global-dashboard-status-risk-desktop.png'
          ),
        })
        const actionableLayoutRead = waitForWorkbenchRead('actionable')
        await actionableFilter.click()
        await actionableLayoutRead
        await page
          .locator('.erp-workbench-queue-panel[aria-busy="false"]')
          .waitFor({ state: 'visible', timeout: 10_000 })

        const queueRows = queuePanel.locator('.ant-table-tbody .ant-table-row')
        assert.equal(
          await queuePanel
            .getByRole('columnheader', { name: '操作', exact: true })
            .count(),
          0
        )
        const queueRowCount = await queueRows.count()
        assert.equal(queueRowCount, 8, '工作台待处理队列首屏应保持 8 条')
        await queueRows
          .first()
          .getByRole('button', { name: '查看长队列待办 01详情', exact: true })
          .focus()
        await page.keyboard.press('Enter')
        const workbenchTaskDrawer = page.locator('.erp-task-action-drawer')
        await workbenchTaskDrawer.waitFor({
          state: 'visible',
          timeout: 10_000,
        })
        await workbenchTaskDrawer
          .getByText('长队列待办 01', { exact: true })
          .waitFor({ state: 'visible', timeout: 10_000 })
        await page.screenshot({
          path: path.resolve(
            outputDir,
            'erp-yoyo-global-dashboard-task-open.png'
          ),
        })
        await workbenchTaskDrawer.locator('.ant-drawer-close').click()
        await workbenchTaskDrawer.waitFor({
          state: 'hidden',
          timeout: 10_000,
        })

        await queueRows.first().locator('td').first().click()
        await workbenchTaskDrawer.waitFor({ state: 'visible', timeout: 10_000 })
        await page.keyboard.press('Escape')
        await workbenchTaskDrawer.waitFor({ state: 'hidden', timeout: 10_000 })
        await queueRows
          .first()
          .getByRole('button', { name: '查看长队列待办 01详情', exact: true })
          .evaluate((button) => {
            if (document.activeElement !== button) {
              throw new Error('整行打开后关闭详情应回到该任务标题')
            }
          })

        await assertDashboardWorkbenchLayout(page, {
          scenarioName: '全宽工作台',
        })
        const mobileRiskRead = waitForWorkbenchRead('risk')
        await riskFilter.click()
        await mobileRiskRead
        await queuePanel
          .getByText('长队列阻塞逾期 01', { exact: true })
          .waitFor({ state: 'visible', timeout: 10_000 })
        await page.setViewportSize({ width: 390, height: 844 })
        await page.waitForFunction(
          () => {
            const grid = document.querySelector('.erp-workbench-main-grid')
            return (
              grid &&
              getComputedStyle(grid).gridTemplateColumns.split(' ').length === 1
            )
          },
          null,
          { timeout: 10_000 }
        )
        await assertDashboardWorkbenchLayout(page, {
          scenarioName: '窄屏工作台',
        })
        await page.screenshot({
          path: path.resolve(
            outputDir,
            'erp-yoyo-global-dashboard-mobile-long-queue-top.png'
          ),
        })
        await page.setViewportSize({ width: 1440, height: 900 })
        await clickERPThemeOption(page, '暗色')
        await assertERPThemeMode(page, {
          scenarioName: 'erp-yoyo-global-dashboard-dark-long-queue',
          expectedMode: 'dark',
          expectedEffectiveTheme: 'dark',
        })
        await assertDarkThemeContrast(page, {
          scenarioName: 'erp-yoyo-global-dashboard-dark-long-queue',
          selector: '.erp-workbench-queue-panel',
        })
        await page.locator('.erp-workbench-command-card').screenshot({
          path: path.resolve(
            outputDir,
            'erp-yoyo-global-dashboard-dark-long-queue.png'
          ),
        })
        await clickERPThemeOption(page, '浅色')
        await assertDashboardWorkbenchEntryNavigation(page, {
          scenarioName: 'erp-yoyo-global-dashboard-source-access',
        })
      },
    },
    {
      name: 'erp-effective-session-super-admin-product-core',
      path: '/erp/warehouse/shipments',
      auth: 'admin',
      effectiveSession: {
        configRevision: 'style-l1-effective-session',
        configHash: 'style-l1-hash',
        customer: { key: 'yoyoosun', name: '永绅' },
        pages: ['global-dashboard', 'shipments'],
        actions: [
          'shipment.read',
          'shipment.create',
          'shipment.cancel',
          'shipment.ship',
          'sales_order.read',
        ],
        fieldPolicies: {},
        workPools: [],
        source: 'active_customer_config_revision',
      },
      expectPath: '/erp/warehouse/shipments',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectText(page, '毛绒玩具管理系统')
        await expectText(page, 'style-l1-admin')
        await expectText(page, '出货单')
        await expectText(page, 'SHIP-STYLE-L1')
        await assertTextAbsent(page, '产品核心评审不读取客户业务数据')
        await expectButton(page, '新建草稿')
        assert.equal(
          await page.getByRole('button', { name: '新建草稿' }).isDisabled(),
          false,
          'super admin 客户运行态应保留业务页动作入口'
        )
        const pageMetrics = await page.evaluate(() => {
          const shell = document.querySelector('.erp-admin-shell')
          const guard = document.querySelector(
            '[data-product-core-business-data-guard="true"]'
          )
          const table = document.querySelector('.ant-table')
          const menu = document.querySelector('.erp-admin-menu')
          const tableRect = table?.getBoundingClientRect()
          return {
            visibilityMode:
              shell?.getAttribute('data-effective-session-mode') || '',
            dataRuntimeScope:
              shell?.getAttribute('data-effective-session-data-scope') || '',
            hasGuard: Boolean(guard),
            hasTable: Boolean(table),
            menuText: menu?.textContent || '',
            tableWidth: tableRect?.width || 0,
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
          }
        })
        assert.equal(pageMetrics.visibilityMode, 'super_admin_product_core')
        assert.equal(pageMetrics.dataRuntimeScope, 'customer_runtime')
        assert.equal(pageMetrics.hasGuard, false)
        assert.equal(pageMetrics.hasTable, true)
        assert(
          pageMetrics.menuText.includes('出货单'),
          `super admin 客户运行态侧栏应显示客户业务导航: ${JSON.stringify(
            pageMetrics
          )}`
        )
        assert(
          pageMetrics.scrollWidth <= pageMetrics.clientWidth + 1,
          `super admin 客户运行态业务页不应横向溢出: ${JSON.stringify(
            pageMetrics
          )}`
        )
      },
    },
    {
      name: 'erp-effective-session-super-admin-product-core-no-customer-business-dashboard',
      path: '/erp/business-dashboard',
      auth: 'admin',
      expectPath: '/erp/business-dashboard',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectText(page, '业务管理')
        await expectText(page, '超级管理员')
        await expectText(page, '业务看板 功能预览')
        await expectText(page, '功能说明')
        await expectText(page, '尚未连接客户环境')
        await assertTextAbsent(page, '产品核心评审不读取客户业务数据')
        await assertTextAbsent(page, '业务对象')
        await assertTextAbsent(page, '对象总量')
        await assertTextAbsent(page, '核心链路健康')
        const pageMetrics = await page.evaluate(() => {
          const guard = document.querySelector(
            '[data-product-core-business-data-guard="true"]'
          )
          const review = document.querySelector(
            '[data-product-core-capability-review="true"]'
          )
          const dashboard = document.querySelector(
            '.erp-business-dashboard-page'
          )
          const table = document.querySelector('.ant-table')
          const menu = document.querySelector('.erp-admin-menu')
          const reviewRect = review?.getBoundingClientRect()
          return {
            hasGuard: Boolean(guard),
            hasReview: Boolean(review),
            hasBusinessDashboard: Boolean(dashboard),
            hasTable: Boolean(table),
            menuText: menu?.textContent || '',
            reviewWidth: reviewRect?.width || 0,
            reviewHeight: reviewRect?.height || 0,
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
          }
        })
        assert.equal(pageMetrics.hasGuard, true)
        assert.equal(pageMetrics.hasReview, true)
        assert.equal(pageMetrics.hasBusinessDashboard, false)
        assert.equal(pageMetrics.hasTable, false)
        assert(
          pageMetrics.menuText.includes('系统功能总览') &&
            pageMetrics.menuText.includes('系统设置') &&
            pageMetrics.menuText.includes('模板打印中心') &&
            pageMetrics.menuText.includes('权限管理'),
          `无客户 Product Core 侧栏应显示控制面导航: ${JSON.stringify(
            pageMetrics
          )}`
        )
        assert(
          !pageMetrics.menuText.includes('业务看板') &&
            !pageMetrics.menuText.includes('BOM 管理') &&
            !pageMetrics.menuText.includes('委外订单'),
          `无客户 Product Core 侧栏不应显示客户业务导航: ${JSON.stringify(
            pageMetrics
          )}`
        )
        assert(
          pageMetrics.reviewWidth > 0 && pageMetrics.reviewHeight > 0,
          `无客户 Product Core 能力审阅页应有稳定占位: ${JSON.stringify(
            pageMetrics
          )}`
        )
        assert(
          pageMetrics.scrollWidth <= pageMetrics.clientWidth + 1,
          `无客户 Product Core 能力审阅页不应横向溢出: ${JSON.stringify(
            pageMetrics
          )}`
        )
      },
    },
    {
      name: 'erp-effective-session-direct-url-local-dev-diagnostic',
      path: '/erp/system/permissions',
      auth: 'admin',
      adminProfile: {
        is_super_admin: false,
        permissions: [
          'system.permission.read',
          'system.role.permission.manage',
        ],
        menus: [{ key: 'permission-center', path: '/erp/system/permissions' }],
      },
      effectiveSession: {
        configRevision: 'style-l1-direct-url',
        configHash: 'style-l1-direct-url-hash',
        customer: { key: 'yoyoosun', name: '永绅' },
        pages: ['global-dashboard'],
        actions: [],
        fieldPolicies: {},
        workPools: [],
        source: 'active_customer_config_revision',
      },
      expectPath: '/erp/system/permissions',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectText(page, '毛绒玩具管理系统')
        await expectEffectiveSessionMode(
          page,
          'local_dev_customer_config_diagnostic'
        )
        await expectHeading(page, '权限管理')
        await expectText(page, '岗位设置')
        await assertTextAbsent(page, '当前账号暂无可见后台入口')
      },
    },
    {
      name: 'erp-effective-session-configured-customer-builtin-fallback-local-preview',
      path: '/erp/dashboard',
      auth: 'admin',
      adminProfile: {
        username: 'style-l1-yoyo-preview-boss',
        is_super_admin: false,
        roles: [{ role_key: 'boss', name: '老板' }],
        permissions: ['erp.workbench.read', 'workflow.task.read'],
        menus: [
          {
            key: 'global-dashboard',
            label: '全局看板',
            path: '/erp/dashboard',
            required_any: ['erp.workbench.read'],
            required_all: [],
          },
        ],
      },
      customerKey: 'yoyoosun',
      effectiveSession: localCustomerDesktopPreviewEffectiveSession,
      expectPath: '/erp/dashboard',
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        localCustomerDesktopPreviewWorkflowRequests = 0
        page.on('request', (request) => {
          if (new URL(request.url()).pathname === '/rpc/workflow') {
            localCustomerDesktopPreviewWorkflowRequests += 1
          }
        })
      },
      verify: async (page) => {
        await page.locator('.erp-admin-shell').waitFor({
          state: 'visible',
          timeout: 10_000,
        })
        await expectText(page, '工作台 功能预览')
        await expectText(page, '本地功能预览')
        await expectText(page, '当前尚未启用客户业务设置')
        await expectText(page, '工作台、任务看板和业务数据暂时不能使用')
        await assertTextAbsent(page, '暂时无法进入工作台')
        await assertTextAbsent(page, '优先处理队列')

        const shellMetrics = await page.evaluate(() => {
          const shell = document.querySelector('.erp-admin-shell')
          const previewNotice = document.querySelector(
            '[data-local-customer-desktop-preview="true"]'
          )
          return {
            source: shell?.getAttribute('data-effective-session-source') || '',
            dataRuntimeScope:
              shell?.getAttribute('data-effective-session-data-scope') || '',
            hasPreviewNotice: Boolean(previewNotice),
            hasBusinessDataGuard: Boolean(
              document.querySelector(
                '[data-product-core-business-data-guard="true"]'
              )
            ),
          }
        })
        assert.deepEqual(shellMetrics, {
          source: 'builtin_rbac_fallback',
          dataRuntimeScope: 'customer_runtime_missing',
          hasPreviewNotice: true,
          hasBusinessDataGuard: true,
        })
        assert.equal(
          localCustomerDesktopPreviewWorkflowRequests,
          0,
          '本地功能预览不得读取或写入 Workflow 任务'
        )
      },
    },
    {
      name: 'erp-effective-session-configured-customer-transient-sync-recovers',
      path: '/erp/dashboard',
      auth: 'admin',
      adminProfile: {
        is_super_admin: false,
        permissions: ['erp.workbench.read', 'workflow.task.read'],
        menus: [{ key: 'global-dashboard', path: '/erp/dashboard' }],
      },
      customerKey: 'yoyoosun',
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        transientProfileSyncCustomerConfigRequests = 0
        transientProfileSyncAdminMeRequests = 0
        page.on('request', (request) => {
          if (new URL(request.url()).pathname !== '/rpc/admin') {
            return
          }
          const body = request.postDataJSON() || {}
          if (body.method === 'me') {
            transientProfileSyncAdminMeRequests += 1
          }
        })
        await page.unroute('**/rpc/customer_config')
        await page.route('**/rpc/customer_config', async (route) => {
          const body = route.request().postDataJSON() || {}
          const { id = 'mock-id', method } = body
          transientProfileSyncCustomerConfigRequests += 1
          const result =
            method === 'get_effective_session' &&
            transientProfileSyncCustomerConfigRequests <= 2
              ? {
                  code: RpcErrorCode.INTERNAL,
                  message: '客户有效配置读取暂时不可用',
                  data: {},
                }
              : {
                  code: 0,
                  message: 'OK',
                  data: {
                    session: {
                      configRevision: 'style-l1-transient-recovery',
                      configHash: 'style-l1-transient-recovery-hash',
                      customer: { key: 'yoyoosun', name: '永绅' },
                      pages: ['global-dashboard'],
                      actions: ['erp.workbench.read', 'workflow.task.read'],
                      fieldPolicies: {},
                      workPools: [],
                      source: 'active_customer_config_revision',
                    },
                  },
                }

          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({ jsonrpc: '2.0', id, result }),
          })
        })
      },
      verify: async (page) => {
        await expectHeading(page, '工作台')
        await expectText(page, '待我处理')
        await assertTextAbsent(page, '暂时无法进入工作台')
        assert.equal(
          transientProfileSyncCustomerConfigRequests,
          3,
          '首次进入工作台应在两次瞬时失败后恢复，不要求用户手动重试'
        )
        assert.equal(
          transientProfileSyncAdminMeRequests,
          1,
          'React StrictMode 首次挂载必须复用同一个 profile single-flight'
        )
      },
    },
    {
      name: 'erp-effective-session-configured-customer-sync-failure-blocked',
      path: '/erp/dashboard',
      auth: 'admin',
      adminProfile: {
        is_super_admin: false,
        permissions: ['erp.workbench.read', 'workflow.task.read'],
        menus: [{ key: 'global-dashboard', path: '/erp/dashboard' }],
      },
      customerKey: 'yoyoosun',
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        await page.unroute('**/rpc/customer_config')
        await page.route('**/rpc/customer_config', async (route) => {
          const body = route.request().postDataJSON() || {}
          const { id = 'mock-id', method } = body
          if (method === 'get_effective_session') {
            await new Promise((resolve) => setTimeout(resolve, 1200))
          }
          const result =
            method === 'get_effective_session'
              ? {
                  code: RpcErrorCode.INTERNAL,
                  message: '客户有效配置同步失败',
                  data: {},
                }
              : {
                  code: 0,
                  message: 'OK',
                  data: {},
                }

          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              jsonrpc: '2.0',
              id,
              result,
            }),
          })
        })
      },
      verify: async (page) => {
        await expectText(page, '正在进入工作台')
        await expectText(page, '正在准备您的工作内容，请稍候...')
        await assertTextAbsent(page, '正在进入客户工作台')
        await expectText(page, '暂时无法进入工作台')
        await expectText(page, '为避免显示错误内容，系统没有加载工作台')
        await assertTextAbsent(page, '当前客户')
        await assertTextAbsent(page, '权限管理')
        await assertTextAbsent(page, '岗位设置')
        const boundaryMetrics = await page.evaluate(() => {
          const boundary = document.querySelector(
            '[data-customer-runtime-boundary="true"]'
          )
          const menu = document.querySelector('.erp-admin-menu')
          const visibleButtonTexts = [...document.querySelectorAll('button')]
            .filter(
              (button) => button.offsetWidth > 0 && button.offsetHeight > 0
            )
            .map((button) =>
              String(button.textContent || '').replace(/\s+/gu, '')
            )
          const rect = boundary?.getBoundingClientRect()
          return {
            boundaryWidth: rect?.width || 0,
            boundaryHeight: rect?.height || 0,
            hasMenu: Boolean(menu),
            visibleButtonTexts,
            overflow:
              document.documentElement.scrollWidth -
              document.documentElement.clientWidth,
          }
        })
        assert(
          boundaryMetrics.boundaryWidth > 0 &&
            boundaryMetrics.boundaryHeight > 0 &&
            boundaryMetrics.hasMenu === false &&
            boundaryMetrics.visibleButtonTexts.includes('重试') &&
            boundaryMetrics.visibleButtonTexts.includes('退出登录') &&
            boundaryMetrics.overflow <= 1,
          `配置客户 effective session 同步失败时应 fail closed 且不挂载业务壳: ${JSON.stringify(
            boundaryMetrics
          )}`
        )
      },
    },
    {
      name: 'erp-effective-session-empty-pages-local-dev-diagnostic',
      path: '/erp/system/permissions',
      auth: 'admin',
      adminProfile: {
        is_super_admin: false,
        permissions: [
          'system.permission.read',
          'system.role.permission.manage',
        ],
        menus: [{ key: 'permission-center', path: '/erp/system/permissions' }],
      },
      effectiveSession: {
        configRevision: 'style-l1-empty-pages',
        configHash: 'style-l1-empty-hash',
        customer: { key: 'yoyoosun', name: '永绅' },
        pages: [],
        actions: [],
        fieldPolicies: {},
        workPools: [],
        source: 'active_customer_config_revision',
      },
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectText(page, '毛绒玩具管理系统')
        await expectEffectiveSessionMode(
          page,
          'local_dev_customer_config_diagnostic'
        )
        await expectHeading(page, '权限管理')
        await expectText(page, '岗位设置')
        await assertTextAbsent(page, '当前账号暂无可见后台入口')
      },
    },
    {
      name: 'erp-no-permission-menu-falls-back-history-center',
      path: '/erp/system/permissions',
      auth: 'admin',
      adminProfile: {
        is_super_admin: false,
        permissions: [],
        menus: [],
      },
      effectiveSession: {
        configRevision: 'style-l1-no-visible-menu',
        configHash: 'style-l1-no-visible-menu-hash',
        customer: { key: 'yoyoosun', name: '永绅' },
        pages: [],
        actions: [],
        fieldPolicies: {},
        workPools: [],
        source: 'active_customer_config_revision',
      },
      expectPath: '/erp/history',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectText(page, '历史记录中心')
        await expectText(page, '当前账号没有可查询的历史记录类型')
        await assertTextAbsent(page, '当前客户有效配置')
        await assertTextAbsent(page, '权限中心')
        await assertTextAbsent(page, '管理员列表')
      },
    },
    {
      name: 'erp-unauthorized-production-route-blocks-before-rpc',
      path: '/erp/production/progress',
      auth: 'admin',
      adminProfile: {
        username: 'style-l1-no-production-fact-read',
        is_super_admin: false,
        roles: [{ role_key: 'sales', name: '业务' }],
        permissions: ['erp.workbench.read'],
        menus: [
          {
            key: 'global-dashboard',
            label: '工作台',
            path: '/erp/dashboard',
            required_any: ['erp.workbench.read'],
            required_all: [],
          },
        ],
      },
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        configRevision: 'style-l1-no-production-fact-read',
        pages: ['global-dashboard'],
        actions: ['erp.workbench.read'],
      },
      expectPath: '/erp/dashboard',
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        unauthorizedProductionFactRequests = 0
        page.on('request', (request) => {
          if (new URL(request.url()).pathname === '/rpc/operational_fact') {
            unauthorizedProductionFactRequests += 1
          }
        })
      },
      verify: async (page) => {
        await expectHeading(page, '工作台')
        assert.equal(
          unauthorizedProductionFactRequests,
          0,
          '无生产记录读取权限时，直达生产进度不得在跳转前挂载页面或调用业务 RPC'
        )
        await assertTextAbsent(page, '权限不足')
        await assertTextAbsent(page, '生产进度')
        await assertNoHorizontalOverflow(
          page,
          'erp-unauthorized-production-route-blocks-before-rpc'
        )
      },
    },
    {
      name: 'erp-production-order-wip-readonly-detail-no-reference-rpc',
      path: '/erp/production/orders',
      auth: 'admin',
      adminProfile: {
        username: 'style-l1-production-wip-readonly',
        is_super_admin: false,
        roles: [{ role_key: 'quality', name: '品质' }],
        permissions: ['production.wip.read'],
        menus: [
          {
            key: 'production-orders',
            label: '生产订单',
            path: '/erp/production/orders',
            required_any: ['production.wip.read'],
            required_all: [],
          },
        ],
      },
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        roles: ['quality'],
        configRevision: 'style-l1-production-wip-readonly',
        pages: ['production-orders'],
        actions: ['production.wip.read'],
      },
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        permissionSafeProductionReferenceRequests = 0
        page.on('request', (request) => {
          if (new URL(request.url()).pathname !== '/rpc/production_order') {
            return
          }
          try {
            if (
              request.postDataJSON()?.method ===
              'list_production_order_reference_options'
            ) {
              permissionSafeProductionReferenceRequests += 1
            }
          } catch {
            // 非 JSON-RPC 请求不参与本断言。
          }
        })
      },
      verify: async (page) => {
        await expectHeading(page, '生产订单')
        const releaseResult = await page.evaluate(async () => {
          const response = await fetch('/rpc/production_order', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 'style-l1-wip-readonly-release',
              method: 'release_production_order',
              params: {
                production_order_id: 71,
                expected_version: 1,
                idempotency_key: 'style-l1-wip-readonly-release',
              },
            }),
          })
          return response.json()
        })
        assert.equal(releaseResult?.result?.code, 0)
        await page.reload()
        await expectHeading(page, '生产订单')
        await page.getByText('MO-STYLE-L1-20260713', { exact: true }).dblclick()
        const detailModal = page
          .locator('.erp-business-form-page:not([hidden])')
          .filter({ hasText: '查看生产订单' })
          .last()
        await detailModal.waitFor({ state: 'visible', timeout: 10_000 })
        assert.equal(
          permissionSafeProductionReferenceRequests,
          0,
          'WIP 只读查看必须只用订单冻结快照，不得调用 PMC 编辑候选接口'
        )
        await assertTextAbsent(page, '权限不足')
        await detailModal.getByRole('button', { name: '返回列表' }).click()
        await page.getByText('MO-STYLE-L1-20260713', { exact: true }).click()

        const viewRouteButton = page.getByRole('button', {
          name: '查看工序',
          exact: true,
        })
        await viewRouteButton.waitFor({ state: 'visible', timeout: 10_000 })
        assert.equal(await viewRouteButton.isEnabled(), true)
        await viewRouteButton.click()

        const routeModal = page
          .locator('.ant-modal:visible')
          .filter({ hasText: '查看生产工序' })
          .last()
        await routeModal.waitFor({ state: 'visible', timeout: 10_000 })
        assert.equal(
          await routeModal.getByRole('button', { name: '安排加工' }).count(),
          0,
          'WIP 只读岗位不得收到生产工序写入口'
        )
        assert.equal(
          await routeModal.getByRole('button', { name: '拆分批次' }).count(),
          0,
          'WIP 只读岗位不得收到批次拆分入口'
        )
      },
    },
    {
      name: 'erp-production-order-unreadable-source-downgrades-to-view',
      path: '/erp/production/orders',
      auth: 'admin',
      adminProfile: {
        username: 'style-l1-production-plan-source-readonly',
        is_super_admin: false,
        roles: [{ role_key: 'pmc', name: 'PMC' }],
        permissions: ['pmc.plan.read', 'pmc.plan.update'],
        menus: [
          {
            key: 'production-orders',
            label: '生产订单',
            path: '/erp/production/orders',
            required_any: ['pmc.plan.read'],
            required_all: [],
          },
        ],
      },
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        roles: ['pmc'],
        configRevision: 'style-l1-production-plan-source-readonly',
        pages: ['production-orders'],
        actions: ['pmc.plan.read', 'pmc.plan.update'],
      },
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        permissionSafeProductionReferenceRequests = 0
        page.on('request', (request) => {
          if (new URL(request.url()).pathname !== '/rpc/production_order') {
            return
          }
          try {
            if (
              request.postDataJSON()?.method ===
              'list_production_order_reference_options'
            ) {
              permissionSafeProductionReferenceRequests += 1
            }
          } catch {
            // 非 JSON-RPC 请求不参与本断言。
          }
        })
      },
      verify: async (page) => {
        await expectHeading(page, '生产订单')
        await page.getByText('MO-STYLE-L1-20260713', { exact: true }).dblclick()
        await expectText(
          page,
          '订单关联的销售订单行、BOM 版本不在当前账号读取范围内，已按只读方式打开'
        )
        await page
          .locator('.erp-business-form-page:not([hidden])')
          .filter({ hasText: '查看生产订单' })
          .last()
          .waitFor({ state: 'visible', timeout: 10_000 })
        assert.equal(
          permissionSafeProductionReferenceRequests,
          0,
          '来源读取条件不完整时不得挂载编辑候选项或提交入口'
        )
        await assertTextAbsent(page, '权限不足')
      },
    },
    {
      name: 'erp-production-exception-optional-panel-skips-unreadable-rpc',
      path: '/erp/production/exceptions',
      auth: 'admin',
      adminProfile: {
        username: 'style-l1-quality-inspection-readonly',
        is_super_admin: false,
        roles: [{ role_key: 'quality', name: '品质' }],
        permissions: ['quality.inspection.read', 'workflow.task.read'],
        menus: [
          {
            key: 'production-exceptions',
            label: '生产异常处置',
            path: '/erp/production/exceptions',
            required_any: ['quality.inspection.read'],
            required_all: [],
          },
        ],
      },
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        roles: ['quality'],
        configRevision: 'style-l1-quality-inspection-readonly',
        pages: ['production-exceptions'],
        actions: ['quality.inspection.read', 'workflow.task.read'],
      },
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        permissionSafeProductionExceptionRequests = 0
        page.on('request', (request) => {
          if (new URL(request.url()).pathname !== '/rpc/operational_fact') {
            return
          }
          try {
            if (
              request.postDataJSON()?.method === 'list_production_exceptions'
            ) {
              permissionSafeProductionExceptionRequests += 1
            }
          } catch {
            // 非 JSON-RPC 请求不参与本断言。
          }
        })
      },
      verify: async (page) => {
        await expectHeading(page, '生产异常处置')
        const taskTab = page.getByRole('tab', { name: '待审批' })
        await taskTab.waitFor({ state: 'visible' })
        assert.equal(await taskTab.getAttribute('aria-selected'), 'true')
        assert.equal(
          await page.getByRole('tab', { name: '处置申请' }).count(),
          0,
          '仅有任务读取权限时不得挂载不可读的处置申请页签'
        )
        await expectText(page, '暂无待审批的生产异常处置申请。')
        assert.equal(
          permissionSafeProductionExceptionRequests,
          0,
          '仅有质检读取权限时可使用复合页面，但不得读取全部生产异常决策'
        )
        await assertTextAbsent(page, '权限不足')
      },
    },
    {
      name: 'erp-supplier-page-skips-unreadable-process-dictionary',
      path: '/erp/master/partners/suppliers',
      auth: 'admin',
      adminProfile: {
        username: 'style-l1-supplier-readonly',
        is_super_admin: false,
        roles: [{ role_key: 'purchase', name: '采购' }],
        permissions: ['supplier.read'],
        menus: [
          {
            key: 'suppliers',
            label: '供应商与加工厂',
            path: '/erp/master/partners/suppliers',
            required_any: ['supplier.read'],
            required_all: [],
          },
        ],
      },
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        roles: ['purchase'],
        configRevision: 'style-l1-supplier-readonly',
        pages: ['suppliers'],
        actions: ['supplier.read'],
      },
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        permissionSafeSupplierProcessRequests = 0
        page.on('request', (request) => {
          if (new URL(request.url()).pathname !== '/rpc/masterdata') return
          try {
            if (request.postDataJSON()?.method === 'list_processes') {
              permissionSafeSupplierProcessRequests += 1
            }
          } catch {
            // 非 JSON-RPC 请求不参与本断言。
          }
        })
      },
      verify: async (page) => {
        await expectHeading(page, '供应商与加工厂')
        assert.equal(
          permissionSafeSupplierProcessRequests,
          0,
          '供应商主列表不得被可选工序字典权限耦合'
        )
        await assertTextAbsent(page, '权限不足')
      },
    },
    {
      name: 'erp-inventory-page-skips-unreadable-reference-dictionaries',
      path: '/erp/warehouse/inventory',
      auth: 'admin',
      adminProfile: {
        username: 'style-l1-inventory-readonly',
        is_super_admin: false,
        roles: [{ role_key: 'warehouse', name: '仓库' }],
        permissions: ['warehouse.inventory.read'],
        menus: [
          {
            key: 'inventory',
            label: '库存台账',
            path: '/erp/warehouse/inventory',
            required_any: ['warehouse.inventory.read'],
            required_all: [],
          },
        ],
      },
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        roles: ['warehouse'],
        configRevision: 'style-l1-inventory-readonly',
        pages: ['inventory'],
        actions: ['warehouse.inventory.read'],
      },
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        permissionSafeInventoryReferenceRequests = []
        page.on('request', (request) => {
          if (new URL(request.url()).pathname !== '/rpc/masterdata') return
          try {
            const method = request.postDataJSON()?.method
            if (
              [
                'list_materials',
                'list_products',
                'list_product_skus',
                'list_units',
              ].includes(method)
            ) {
              permissionSafeInventoryReferenceRequests.push(method)
            }
          } catch {
            // 非 JSON-RPC 请求不参与本断言。
          }
        })
      },
      verify: async (page) => {
        await expectHeading(page, '库存台账')
        assert.deepEqual(
          permissionSafeInventoryReferenceRequests,
          [],
          '库存主页面不得把可选材料、产品、SKU 或单位字典当作进入条件'
        )
        await assertTextAbsent(page, '权限不足')
      },
    },
    {
      name: 'erp-product-sku-only-role-loads-authorized-tab',
      path: '/erp/master/products',
      auth: 'admin',
      adminProfile: {
        username: 'style-l1-product-sku-readonly',
        is_super_admin: false,
        roles: [{ role_key: 'sales', name: '业务' }],
        permissions: ['product_sku.read'],
        menus: [
          {
            key: 'products',
            label: '产品档案',
            path: '/erp/master/products',
            required_any: ['product_sku.read'],
            required_all: [],
          },
        ],
      },
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        roles: ['sales'],
        configRevision: 'style-l1-product-sku-readonly',
        pages: ['products'],
        actions: ['product_sku.read'],
      },
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        permissionSafeProductReferenceRequests = []
        page.on('request', (request) => {
          if (new URL(request.url()).pathname !== '/rpc/masterdata') return
          try {
            const method = request.postDataJSON()?.method
            if (method === 'list_products' || method === 'list_product_skus') {
              permissionSafeProductReferenceRequests.push(method)
            }
          } catch {
            // 非 JSON-RPC 请求不参与本断言。
          }
        })
      },
      verify: async (page) => {
        await expectHeading(page, '产品档案')
        await expectText(page, '产品规格')
        assert.equal(
          permissionSafeProductReferenceRequests.includes('list_products'),
          false,
          'SKU-only 角色不得先请求无权读取的产品列表'
        )
        assert.equal(
          permissionSafeProductReferenceRequests.includes('list_product_skus'),
          true,
          'SKU-only 角色必须加载其获授权的主列表'
        )
        await assertTextAbsent(page, '产品基础信息')
        await assertTextAbsent(page, '权限不足')
      },
    },
    {
      name: 'yoyoosun-sales-role-guided-navigation-help',
      path: '/erp/dashboard',
      auth: 'admin',
      customerConfig: roleGuidedCustomerConfig,
      adminProfile: customerRoleAdminProfile('sales', 'demo_sales'),
      effectiveSession: customerRoleRuntimeSession(
        ['sales'],
        'style-l1-role-guided-sales'
      ),
      viewport: { width: 1280, height: 720 },
      verify: async (page) => {
        await expectText(page, '看板中心')
        await expectText(page, '工作台')
        await expectText(page, '任务看板')
        await expectText(page, '常用工作')
        await expectText(page, '客户档案')
        await expectText(page, '销售订单')
        await expectText(page, '出货单')
        await expectText(page, '更多功能')

        const menu = page.locator('.erp-admin-menu')
        assert.equal(
          await menu.getAttribute('data-navigation-presentation'),
          'role_guided'
        )
        const visibleLeafCount = await menu.evaluate(
          (node) =>
            Array.from(node.querySelectorAll('.ant-menu-item')).filter(
              (item) => item.getClientRects().length > 0
            ).length
        )
        assert.equal(
          visibleLeafCount,
          5,
          `销售岗位首层应先显示两个看板，再显示三个常用业务，实际 ${visibleLeafCount}`
        )
        const visibleLeafTexts = await menu.evaluate((node) =>
          Array.from(node.querySelectorAll('.ant-menu-item'))
            .filter((item) => item.getClientRects().length > 0)
            .map((item) => String(item.textContent || '').trim())
        )
        assert.deepEqual(
          visibleLeafTexts,
          ['工作台', '任务看板', '客户档案', '销售订单', '出货单'],
          `销售岗位导航应按看板、常用工作的顺序展示: ${JSON.stringify(visibleLeafTexts)}`
        )

        const moreFunctions = menu
          .locator('.ant-menu-submenu-title')
          .filter({ hasText: '更多功能' })
        const moreFunctionsRoot = moreFunctions.locator('..')
        const readMoreFunctionsState = () =>
          moreFunctionsRoot.evaluate((node) => {
            const helpItem = Array.from(
              node.querySelectorAll('.ant-menu-item')
            ).find((item) =>
              String(item.textContent || '').includes('岗位使用帮助')
            )
            const submenu = node.querySelector('.ant-menu-sub')
            return {
              open: node.classList.contains('ant-menu-submenu-open'),
              submenuHeight: submenu?.getBoundingClientRect().height || 0,
              helpHeight: helpItem?.getBoundingClientRect().height || 0,
              helpSelected:
                helpItem?.classList.contains('ant-menu-item-selected') === true,
            }
          })
        const moreFunctionsLabel = String(
          await moreFunctions.innerText()
        ).trim()
        const moreFunctionsCountMatch =
          moreFunctionsLabel.match(/^更多功能（(\d+)）$/u)
        assert(
          moreFunctionsCountMatch,
          `更多功能应显示已授权页面数量: ${moreFunctionsLabel}`
        )
        await moreFunctions.click()
        await expectText(page, '产品档案')
        await expectText(page, '库存台账')
        await expectText(page, '岗位使用帮助')
        const expandedVisibleLeafCount = await menu.evaluate(
          (node) =>
            Array.from(node.querySelectorAll('.ant-menu-item')).filter(
              (item) => item.getClientRects().length > 0
            ).length
        )
        assert.equal(
          expandedVisibleLeafCount,
          visibleLeafCount + Number(moreFunctionsCountMatch[1]),
          `更多功能数量应与展开后的页面一致：${moreFunctionsLabel}`
        )
        await page.screenshot({
          path: path.resolve(
            outputDir,
            'yoyoosun-sales-role-guided-navigation-more-expanded.png'
          ),
          fullPage: true,
        })
        const helpMenuItem = menu
          .locator('.ant-menu-item')
          .filter({ hasText: '岗位使用帮助' })
        await helpMenuItem.click()
        await page.waitForURL((url) => url.pathname === '/erp/help-center')
        await expectText(page, '正常办理案例')
        await expectText(page, '完成标准')
        await expectText(page, '遇到异常怎么办')
        await expectText(page, '退回对象')
        await helpMenuItem.scrollIntoViewIfNeeded()
        const activeHelpState = await readMoreFunctionsState()
        assert.equal(
          activeHelpState.open &&
            activeHelpState.submenuHeight > 0 &&
            activeHelpState.helpHeight > 0 &&
            activeHelpState.helpSelected,
          true,
          `进入岗位帮助后更多功能应保持展开并选中帮助入口: ${JSON.stringify(activeHelpState)}`
        )
        await page.screenshot({
          path: path.resolve(
            outputDir,
            'yoyoosun-sales-role-guided-navigation-help-active.png'
          ),
          fullPage: true,
        })

        await page
          .reload({ waitUntil: 'domcontentloaded' })
          .then(() => page.waitForLoadState('networkidle').catch(() => {}))
        await expectText(page, '正常办理案例')
        await helpMenuItem.waitFor({ state: 'visible', timeout: 10_000 })
        const reloadedHelpState = await readMoreFunctionsState()
        assert.equal(
          reloadedHelpState.open &&
            reloadedHelpState.submenuHeight > 0 &&
            reloadedHelpState.helpHeight > 0 &&
            reloadedHelpState.helpSelected,
          true,
          `刷新岗位帮助后更多功能应保持展开并选中帮助入口: ${JSON.stringify(reloadedHelpState)}`
        )
        await page.screenshot({
          path: path.resolve(
            outputDir,
            'yoyoosun-sales-role-guided-navigation-help-reloaded.png'
          ),
          fullPage: true,
        })

        await menu
          .locator('.ant-menu-item')
          .filter({ hasText: '工作台' })
          .first()
          .click()
        await waitForPath(page, '/erp/dashboard')
        await helpMenuItem.waitFor({ state: 'hidden', timeout: 10_000 })
        const dashboardState = await readMoreFunctionsState()
        assert.equal(
          dashboardState.open || dashboardState.helpHeight > 0,
          false,
          `离开岗位帮助返回看板后更多功能应自动收起: ${JSON.stringify(dashboardState)}`
        )
        await page.screenshot({
          path: path.resolve(
            outputDir,
            'yoyoosun-sales-role-guided-navigation-help-return-dashboard.png'
          ),
          fullPage: true,
        })
        await assertNoHorizontalOverflow(
          page,
          'yoyoosun-sales-role-guided-navigation-help'
        )
      },
    },
    {
      name: 'yoyoosun-sales-role-guided-navigation-mobile-dark',
      path: '/erp/dashboard',
      auth: 'admin',
      themeMode: 'dark',
      customerConfig: roleGuidedCustomerConfig,
      adminProfile: customerRoleAdminProfile('sales', 'demo_sales'),
      effectiveSession: customerRoleRuntimeSession(
        ['sales'],
        'style-l1-role-guided-sales-mobile-dark'
      ),
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        await assertERPThemeMode(page, {
          scenarioName: 'yoyoosun-sales-role-guided-navigation-mobile-dark',
          expectedMode: 'dark',
          expectedEffectiveTheme: 'dark',
        })
        await page.getByRole('button', { name: '打开导航菜单' }).click()
        const drawer = page.locator('.erp-admin-drawer:visible')
        await drawer.waitFor({ state: 'visible', timeout: 10_000 })
        const menu = drawer.locator('.erp-admin-menu')
        const moreFunctions = menu
          .locator('.ant-menu-submenu-title')
          .filter({ hasText: '更多功能' })
          .first()
        const moreFunctionsRoot = moreFunctions.locator('..')
        const moreFunctionsLabel = String(
          await moreFunctions.innerText()
        ).trim()
        const countMatch = moreFunctionsLabel.match(/^更多功能（(\d+)）$/u)
        assert(countMatch, `移动端更多功能数量格式异常: ${moreFunctionsLabel}`)
        await moreFunctions.click()
        await page.waitForTimeout(250)

        const groupTitles = moreFunctionsRoot.locator(
          '.erp-role-guided-more-group > .ant-menu-item-group-title'
        )
        assert.deepEqual(await groupTitles.allTextContents(), [
          '基础资料',
          '库存管理',
          '生产管理',
          '运营工具',
          '历史查询',
          '使用帮助',
        ])
        const groupingMetrics = await moreFunctionsRoot.evaluate((node) => {
          const groupTitleNodes = Array.from(
            node.querySelectorAll(
              '.erp-role-guided-more-group > .ant-menu-item-group-title'
            )
          )
          const leaves = Array.from(node.querySelectorAll('.ant-menu-item'))
          const menu = node.closest('.erp-admin-menu')
          return {
            groupTitleCount: groupTitleNodes.length,
            leafCount: leaves.length,
            leafTexts: leaves.map((item) =>
              String(item.textContent || '').trim()
            ),
            interactiveGroupTitleCount: groupTitleNodes.filter(
              (item) =>
                item.matches('a, button, [role="menuitem"]') ||
                item.closest('a, button, [role="menuitem"]')
            ).length,
            focusableGroupTitleCount: groupTitleNodes.filter(
              (item) => item.tabIndex >= 0
            ).length,
            groupTitleStyles: groupTitleNodes.map((item) => {
              const style = window.getComputedStyle(item)
              return {
                color: style.color,
                fontSize: Number.parseFloat(style.fontSize),
                fontWeight: Number.parseInt(style.fontWeight, 10),
              }
            }),
            menuScrollWidth: menu?.scrollWidth || 0,
            menuClientWidth: menu?.clientWidth || 0,
          }
        })
        assert(
          groupingMetrics.groupTitleCount === 6 &&
            groupingMetrics.leafCount === Number(countMatch[1]) &&
            groupingMetrics.leafTexts.at(-1) === '岗位使用帮助' &&
            groupingMetrics.interactiveGroupTitleCount === 0 &&
            groupingMetrics.focusableGroupTitleCount === 0 &&
            groupingMetrics.groupTitleStyles.every(
              (style) =>
                style.color === 'rgb(148, 163, 184)' &&
                style.fontSize >= 11 &&
                style.fontWeight >= 600
            ) &&
            groupingMetrics.menuScrollWidth <=
              groupingMetrics.menuClientWidth + 1,
          `移动端更多功能分组语义或布局异常: ${JSON.stringify(groupingMetrics)}`
        )

        const beforeGroupTitleClickURL = page.url()
        await groupTitles.first().click()
        assert.equal(
          page.url(),
          beforeGroupTitleClickURL,
          '分组标题不可触发页面跳转'
        )
        assert.equal(
          String(
            (await moreFunctionsRoot.getAttribute('class')) || ''
          ).includes('ant-menu-submenu-open'),
          true,
          '分组标题不可折叠更多功能'
        )
        await page.screenshot({
          path: path.resolve(
            outputDir,
            'yoyoosun-sales-role-guided-navigation-mobile-dark-groups-top.png'
          ),
          fullPage: false,
        })
        const helpItem = moreFunctionsRoot
          .locator('.ant-menu-item')
          .filter({ hasText: '岗位使用帮助' })
        await helpItem.scrollIntoViewIfNeeded()
        await assertThemeReadable(page, {
          scenarioName: 'yoyoosun-sales-role-guided-navigation-mobile-dark',
          selector: '.erp-admin-drawer',
        })
        await page.screenshot({
          path: path.resolve(
            outputDir,
            'yoyoosun-sales-role-guided-navigation-mobile-dark-groups-bottom.png'
          ),
          fullPage: false,
        })

        const productItem = moreFunctionsRoot
          .locator('.ant-menu-item')
          .filter({ hasText: '产品档案' })
        await productItem.click()
        await waitForPath(page, '/erp/master/products')
        await page.getByRole('button', { name: '打开导航菜单' }).click()
        await drawer.waitFor({ state: 'visible', timeout: 10_000 })
        await page.waitForFunction(() =>
          Array.from(
            document.querySelectorAll(
              '.erp-admin-drawer .ant-menu-item-selected'
            )
          ).some((item) => String(item.textContent || '').includes('产品档案'))
        )
        const selectedState = await moreFunctionsRoot.evaluate((node) => {
          const selected = node.querySelector('.ant-menu-item-selected')
          return {
            open: node.classList.contains('ant-menu-submenu-open'),
            selectedText: String(selected?.textContent || '').trim(),
          }
        })
        assert.deepEqual(selectedState, {
          open: true,
          selectedText: '产品档案',
        })

        await page
          .reload({ waitUntil: 'domcontentloaded' })
          .then(() => page.waitForLoadState('networkidle').catch(() => {}))
        await page.getByRole('button', { name: '打开导航菜单' }).click()
        await drawer.waitFor({ state: 'visible', timeout: 10_000 })
        await page.waitForFunction(() =>
          Array.from(
            document.querySelectorAll(
              '.erp-admin-drawer .ant-menu-item-selected'
            )
          ).some((item) => String(item.textContent || '').includes('产品档案'))
        )
        const reloadedSelectedState = await moreFunctionsRoot.evaluate(
          (node) => {
            const selected = node.querySelector('.ant-menu-item-selected')
            return {
              open: node.classList.contains('ant-menu-submenu-open'),
              selectedText: String(selected?.textContent || '').trim(),
            }
          }
        )
        assert.deepEqual(reloadedSelectedState, selectedState)
        await assertNoHorizontalOverflow(
          page,
          'yoyoosun-sales-role-guided-navigation-mobile-dark'
        )
      },
    },
    {
      name: 'yoyoosun-boss-role-guided-navigation-desktop',
      path: '/erp/dashboard',
      auth: 'admin',
      customerConfig: roleGuidedCustomerConfig,
      adminProfile: customerRoleAdminProfile('boss', 'demo_boss'),
      effectiveSession: customerRoleRuntimeSession(
        ['boss'],
        'style-l1-role-guided-boss'
      ),
      viewport: { width: 1280, height: 720 },
      verify: async (page) => {
        const menu = page.locator('.erp-admin-menu')
        await expectText(page, '看板中心')
        await expectText(page, '常用工作')
        await expectText(page, '更多功能（16）')
        const visibleLeafTexts = await menu.evaluate((node) =>
          Array.from(node.querySelectorAll('.ant-menu-item'))
            .filter((item) => item.getClientRects().length > 0)
            .map((item) => String(item.textContent || '').trim())
        )
        assert.deepEqual(
          visibleLeafTexts,
          [
            '工作台',
            '任务看板',
            '业务看板',
            '销售订单',
            '采购订单',
            '质量检验',
          ],
          `老板电脑端应有三个看板和三个常用业务: ${JSON.stringify(visibleLeafTexts)}`
        )
        const moreFunctionsRoot = menu
          .locator('.ant-menu-submenu-title')
          .filter({ hasText: '更多功能' })
          .first()
          .locator('..')
        await moreFunctionsRoot.locator('.ant-menu-submenu-title').click()
        await expectText(page, '生产异常处置')
        await expectText(page, '岗位使用帮助')
        assert.deepEqual(
          await moreFunctionsRoot
            .locator('.erp-role-guided-more-group > .ant-menu-item-group-title')
            .allTextContents(),
          [
            '库存管理',
            '委外管理',
            '生产管理',
            '出货管理',
            '财务管理',
            '运营工具',
            '历史查询',
            '使用帮助',
          ]
        )
        const bossMoreItems = await moreFunctionsRoot
          .locator('.ant-menu-item')
          .allTextContents()
        assert.equal(bossMoreItems.length, 16)
        assert.equal(String(bossMoreItems.at(-1) || '').trim(), '岗位使用帮助')
        await page.screenshot({
          path: path.resolve(
            outputDir,
            'yoyoosun-boss-role-guided-navigation-desktop.png'
          ),
          fullPage: true,
        })
        await assertNoHorizontalOverflow(
          page,
          'yoyoosun-boss-role-guided-navigation-desktop'
        )
      },
    },
    {
      name: 'yoyoosun-finance-role-guided-navigation-desktop',
      path: '/erp/dashboard',
      auth: 'admin',
      customerConfig: roleGuidedCustomerConfig,
      adminProfile: customerRoleAdminProfile('finance', 'demo_finance'),
      effectiveSession: customerRoleRuntimeSession(
        ['finance'],
        'style-l1-role-guided-finance'
      ),
      viewport: { width: 1280, height: 720 },
      verify: async (page) => {
        const menu = page.locator('.erp-admin-menu')
        const moreFunctions = menu
          .locator('.ant-menu-submenu-title')
          .filter({ hasText: '更多功能' })
          .first()
        const moreFunctionsRoot = moreFunctions.locator('..')
        const moreFunctionsIsOpen = async () =>
          String(
            (await moreFunctionsRoot.getAttribute('class')) || ''
          ).includes('ant-menu-submenu-open')
        assert.equal(
          await menu.getAttribute('data-navigation-presentation'),
          'role_guided',
          '财务后台必须使用岗位导航分层'
        )
        assert.equal(
          await moreFunctionsIsOpen(),
          false,
          '财务首次进入工作台时更多功能应保持折叠'
        )
        const menuMetrics = await menu.evaluate((node) => {
          const menuRect = node.getBoundingClientRect()
          const moreTitle = Array.from(
            node.querySelectorAll('.ant-menu-submenu-title')
          ).find((item) => String(item.textContent || '').includes('更多功能'))
          const moreTitleRect = moreTitle?.getBoundingClientRect()
          return {
            clientWidth: node.clientWidth,
            scrollWidth: node.scrollWidth,
            menuRight: menuRect.right,
            moreTitleHeight: moreTitleRect?.height || 0,
            moreTitleRight: moreTitleRect?.right || 0,
          }
        })
        assert.equal(
          menuMetrics.scrollWidth <= menuMetrics.clientWidth + 1,
          true,
          `财务侧栏不应产生横向溢出: ${JSON.stringify(menuMetrics)}`
        )
        assert.equal(
          menuMetrics.moreTitleHeight >= 40 &&
            menuMetrics.moreTitleRight <= menuMetrics.menuRight + 1,
          true,
          `更多功能入口应保持可点击且不越界: ${JSON.stringify(menuMetrics)}`
        )
        const visibleLeafTexts = await menu.evaluate((node) =>
          Array.from(node.querySelectorAll('.ant-menu-item'))
            .filter((item) => item.getClientRects().length > 0)
            .map((item) => String(item.textContent || '').trim())
        )
        assert.deepEqual(
          visibleLeafTexts,
          [
            '工作台',
            '任务看板',
            '应收管理',
            '应付管理',
            '发票管理',
            '对账管理',
          ],
          `财务系统推荐应突出应收、应付、发票和对账: ${JSON.stringify(visibleLeafTexts)}`
        )
        await page.screenshot({
          path: path.resolve(
            outputDir,
            'yoyoosun-finance-role-guided-navigation-default.png'
          ),
          fullPage: true,
        })
        await moreFunctions.click()
        const customerItem = menu
          .locator('.ant-menu-item')
          .filter({ hasText: '客户档案' })
          .first()
        await customerItem.waitFor({ state: 'visible', timeout: 10_000 })
        await customerItem.click()
        await waitForPath(page, '/erp/master/partners/customers')
        await page
          .getByRole('heading', { name: '客户档案', exact: true })
          .waitFor({ state: 'visible', timeout: 10_000 })
        assert.equal(
          await moreFunctionsIsOpen(),
          true,
          '访问更多功能里的页面时应保持展开以显示当前位置'
        )
        await page.screenshot({
          path: path.resolve(
            outputDir,
            'yoyoosun-finance-role-guided-navigation-secondary-active.png'
          ),
          fullPage: true,
        })
        await page
          .reload({ waitUntil: 'domcontentloaded' })
          .then(() => page.waitForLoadState('networkidle').catch(() => {}))
        await page
          .getByRole('heading', { name: '客户档案', exact: true })
          .waitFor({ state: 'visible', timeout: 10_000 })
        assert.equal(
          await moreFunctionsIsOpen(),
          true,
          '刷新更多功能页面后仍应展开并显示当前位置'
        )
        await menu
          .locator('.ant-menu-item')
          .filter({ hasText: '工作台' })
          .first()
          .click()
        await waitForPath(page, '/erp/dashboard')
        assert.equal(
          await moreFunctionsIsOpen(),
          false,
          '返回看板或常用工作后更多功能应自动收起'
        )
        await customerItem.waitFor({
          state: 'hidden',
          timeout: 10_000,
        })
        await assertNoHorizontalOverflow(
          page,
          'yoyoosun-finance-role-guided-navigation-desktop'
        )
      },
    },
    {
      name: 'yoyoosun-finance-custom-navigation-desktop',
      path: '/erp/dashboard',
      auth: 'admin',
      customerConfig: roleGuidedCustomerConfig,
      adminProfile: customerRoleAdminProfile('finance', 'demo_finance', {
        navigationMode: 'custom',
        primaryMenuPaths: [
          '/erp/finance/receivables',
          '/erp/finance/payables',
          '/erp/finance/payments',
        ],
      }),
      effectiveSession: customerRoleRuntimeSession(
        ['finance'],
        'style-l1-role-guided-finance-custom'
      ),
      viewport: { width: 1280, height: 720 },
      verify: async (page) => {
        const menu = page.locator('.erp-admin-menu')
        const visibleLeafTexts = await menu.evaluate((node) =>
          Array.from(node.querySelectorAll('.ant-menu-item'))
            .filter((item) => item.getClientRects().length > 0)
            .map((item) => String(item.textContent || '').trim())
        )
        assert.deepEqual(
          visibleLeafTexts,
          ['工作台', '任务看板', '应收管理', '应付管理', '收付款核销'],
          `财务自定义常用入口应按保存顺序显示且不自动补满: ${JSON.stringify(visibleLeafTexts)}`
        )
        assert.equal(
          visibleLeafTexts.includes('收付款与核销'),
          false,
          '菜单名称不应继续显示页面标题“收付款与核销”'
        )
        await page.screenshot({
          path: path.resolve(
            outputDir,
            'yoyoosun-finance-custom-navigation-desktop.png'
          ),
          fullPage: true,
        })
        await assertNoHorizontalOverflow(
          page,
          'yoyoosun-finance-custom-navigation-desktop'
        )
      },
    },
    {
      name: 'yoyoosun-finance-purchase-role-help-mobile-dark',
      path: '/erp/help-center',
      auth: 'admin',
      themeMode: 'dark',
      customerConfig: roleGuidedCustomerConfig,
      adminProfile: {
        is_super_admin: false,
        roles: [
          { role_key: 'purchase', name: '采购' },
          { role_key: 'finance', name: '财务' },
        ],
      },
      effectiveSession: customerRoleRuntimeSession(
        ['purchase', 'finance'],
        'style-l1-role-guided-finance-purchase'
      ),
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        await expectText(page, '切换这里只查看说明，不改变岗位或权限')
        assert.equal(
          await page.locator('.erp-help-center-page .ant-alert').count(),
          0,
          '岗位帮助默认页面不应堆叠 Alert 卡片'
        )
        await expectText(page, '采购')
        await expectText(page, '正常怎么做')
        await expectText(page, '异常完成标准')
        await assertTextAbsent(page, '常见问题')

        await page
          .locator('.erp-help-center-role-picker .ant-select-selector')
          .click()
        await page
          .locator('.ant-select-item-option')
          .filter({ hasText: '财务' })
          .click()
        await page
          .locator('.ant-select-dropdown')
          .waitFor({ state: 'hidden', timeout: 10_000 })
        await page
          .locator('[data-role-help-key="finance"]')
          .waitFor({ state: 'visible', timeout: 10_000 })
        await expectText(page, '办理发票')
        await expectText(page, '发现差异时到对账页面记录')
        await assertTextAbsent(page, '办理收付款与核销')
        await assertTextAbsent(page, '多笔应收或应付核销')
        await assertNoHorizontalOverflow(
          page,
          'yoyoosun-finance-purchase-role-help-mobile-dark'
        )
      },
    },
    {
      name: 'erp-effective-session-action-projection-business-pages',
      path: '/erp/warehouse/shipments',
      auth: 'admin',
      adminProfile: {
        is_super_admin: false,
      },
      effectiveSession: {
        configRevision: 'style-l1-action-projection',
        configHash: 'style-l1-action-projection-hash',
        customer: { key: 'yoyoosun', name: '永绅' },
        pages: [
          'shipments',
          'quality-inspections',
          'inbound',
          'sales-orders',
          'accessories-purchase',
          'processing-contracts',
        ],
        actions: [],
        fieldPolicies: {},
        workPools: [],
        source: 'active_customer_config_revision',
      },
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        const assertEffectiveSessionMenuProjection = async () => {
          const menuText = await page
            .locator('.erp-admin-menu')
            .evaluate((node) => node.textContent.replace(/\s+/g, ' ').trim())
          for (const label of [
            '出货单',
            '质量检验',
            '入库管理',
            '销售订单',
            '采购订单',
            '委外订单',
            '权限管理',
            '系统操作记录',
          ]) {
            assert(
              menuText.includes(label),
              `普通账号菜单应保留 active pages 投影允许的入口 ${label}: ${menuText}`
            )
          }
          for (const label of [
            '模板打印中心',
            '客户档案',
            '供应商与加工厂',
            '产品资料',
          ]) {
            assert(
              !menuText.includes(label),
              `普通账号菜单不应显示 active pages 未投出的入口 ${label}: ${menuText}`
            )
          }
        }

        await assertEffectiveSessionMenuProjection()
        await expectHeading(page, '出货单')
        await expectText(page, 'SHIP-STYLE-L1')
        await expectNoButton(page, '新建草稿')
        await page.getByText('SHIP-STYLE-L1', { exact: true }).click()
        const shipmentDetailButton = page
          .getByRole('button', { name: '查看明细' })
          .first()
        await shipmentDetailButton.waitFor({
          state: 'visible',
          timeout: 10_000,
        })
        assert.equal(
          await shipmentDetailButton.isDisabled(),
          false,
          '出货详情是只读能力，不应被写动作投影禁用'
        )
        await expectNoButton(page, '确认出货')

        await gotoScenarioPath(page, '/erp/production/quality-inspections', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '质量检验')
        await expectText(page, 'QI-STYLE-L1')
        await expectNoButton(page, '补建来料质检')
        await page.getByText('QI-STYLE-L1', { exact: false }).first().click()
        for (const label of [
          '提交质检',
          '判定合格',
          '判定不合格',
          '取消质检',
        ]) {
          await expectNoButton(page, label)
        }

        await gotoScenarioPath(page, '/erp/warehouse/inbound', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '入库管理')
        await expectText(page, 'PR-STYLE-L1-DRAFT')
        await page.getByText('PR-STYLE-L1-DRAFT', { exact: false }).click()
        await expectNoButton(page, '添加明细')
        await expectNoButton(page, '过账入库')

        await gotoScenarioPath(page, '/erp/sales/project-orders/sales-orders', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '销售订单')
        await expectText(page, 'SO-STYLE-L1')
        await expectNoButton(page, '新建订单')
        await page.getByText('SO-STYLE-L1', { exact: false }).first().click()
        await expectNoButton(page, '提交')
        await expectNoButton(page, '取消')

        await gotoScenarioPath(page, '/erp/purchase/accessories', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '采购订单')
        await expectText(page, 'PO-STYLE-L1')
        await expectNoButton(page, '新建采购订单')
        await page.getByText('PO-STYLE-L1', { exact: false }).first().click()
        await expectNoButton(page, '编辑')
        await expectNoButton(page, '生成入库')
        await expectNoButton(page, '提交')
        await expectNoButton(page, '取消')

        await gotoScenarioPath(page, '/erp/purchase/processing-contracts', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '委外订单')
        await expectText(page, 'SIM-OUTSOURCE-CONTRACT-L1')
        await expectNoButton(page, '新建加工合同')
        await page
          .getByRole('row')
          .filter({ hasText: 'SIM-OUTSOURCE-CONTRACT-L1' })
          .click()
        await expectNoButton(page, '编辑')
        await expectNoButton(page, '提交')
        await expectNoButton(page, '确认下单')
      },
    },
  ]
}
