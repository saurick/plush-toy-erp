import { RpcErrorCode } from '../../src/common/consts/errorCodes.generated.js'
import { assertTaskCopy, clickTaskCardContent } from './taskCopyAssertions.mjs'
import { clickERPThemeOption } from './themeAssertions.mjs'
import {
  assertReadableOnBackground,
  isDarkControlBackground,
} from './colorAssertions.mjs'

export function createMobileTaskScenarios({
  expectText,
  assertTextAbsent,
  expectButton,
  assert,
  gotoScenarioPath,
  waitForPath,
  path,
  outputDir,
  assertThemeReadable,
  assertDarkThemeContrast,
  customerRuntimeEffectiveSession,
  assertMobileTaskInitialSkeleton,
  assertERPThemeMode,
  assertMobileTaskMainNavigation,
  assertMobileTaskRefreshFeedback,
  assertMobileTaskDarkDetailReadable,
  assertMobileTaskBossDoneList,
  assertNoDuplicatedAdminPageTitle,
  assertDashboardMetricInteractionSemantics,
  assertNoDashboardCenterLocalRefreshButton,
}) {
  return [
    {
      name: 'mobile-task-search-and-product-image',
      path: '/m/engineering/tasks',
      auth: 'admin',
      customerKey: 'yoyoosun',
      viewport: { width: 390, height: 844 },
      adminProfile: {
        username: 'style-l1-product-images',
        is_super_admin: false,
        roles: [{ role_key: 'engineering', name: '工程' }],
        permissions: [
          'mobile.engineering.access',
          'workflow.task.read',
          'product.read',
        ],
        menus: [],
      },
      effectiveSession: {
        configRevision: 'style-l1-image-search',
        configHash: 'style-l1-image-search-hash',
        customer: { key: 'yoyoosun', name: '永绅' },
        pages: [],
        actions: [
          'mobile.engineering.access',
          'workflow.task.read',
          'product.read',
        ],
        workflow_visible_owner_role_keys_by_capability: {
          'workflow.task.read': ['engineering'],
        },
        fieldPolicies: {},
        workPools: [],
        source: 'active_customer_config_revision',
      },
      workflowTaskFixtures: [
        ...Array.from({ length: 55 }, (_, index) => ({
          id: 96000 + index,
          version: 1,
          task_code: `STYLE-L1-IMAGE-${index}`,
          task_name: index === 0 ? '确认兔子样品' : '核对产品资料',
          created_at: 1_788_840_000,
          task_group: 'engineering_check',
          owner_role_key: 'engineering',
          task_status_key: 'ready',
          source_type: 'sales_order',
          source_no: `SO-IMAGE-${index}`,
          payload: {},
          display_context: {
            available: true,
            source_no: `SO-IMAGE-${index}`,
            items: [
              {
                kind: 'product',
                name: '图片识别模拟产品',
                product_id: 7,
                image_attachment_id: 8801,
                style_no: index === 0 ? '唯一款号-RB018' : 'TB025',
                code: 'PRODUCT-7',
                order_no: '',
              },
            ],
          },
        })),
        {
          id: 96100,
          version: 2,
          task_code: 'STYLE-L1-TASK-COMPLETED-TIME',
          task_name: '样品资料已核对',
          task_group: 'engineering_check',
          owner_role_key: 'engineering',
          task_status_key: 'done',
          source_type: 'sales_order',
          source_no: 'SO-COMPLETED-TIME',
          created_at: 1_788_840_000,
          due_at: 1_788_841_000,
          completed_at: 1_788_842_700,
          updated_at: 1_788_846_000,
          payload: {},
        },
        ...[
          {
            id: 95001,
            name: '占位产品',
            kind: 'product',
            product_id: 8,
            image_attachment_id: 0,
          },
          {
            id: 95002,
            name: '占位物料',
            kind: 'material',
            code: 'MAT-95002',
            supplier_item_no: '示例织造AB-001#-02#米白',
          },
          {
            id: 95003,
            name: '占位加载失败',
            kind: 'product',
            product_id: 7,
            image_attachment_id: 8802,
          },
        ].map((item) => ({
          id: item.id,
          version: 1,
          task_code: `STYLE-L1-PLACEHOLDER-${item.id}`,
          task_name: `检查${item.name}`,
          task_group: 'engineering_check',
          owner_role_key: 'engineering',
          task_status_key: 'ready',
          source_type: 'sales_order',
          source_no: `SO-PLACEHOLDER-${item.id}`,
          created_at: 1_700_000_000,
          updated_at: 1_700_000_000,
          payload: {},
          display_context: { available: true, items: [item] },
        })),
      ],
      beforeNavigate: async (page) => {
        page.__imageReads = []
        page.__taskSearchReads = []
        page.on('request', (request) => {
          if (new URL(request.url()).pathname.endsWith('/rpc/attachment')) {
            page.__imageReads.push(request.postDataJSON())
          }
          if (new URL(request.url()).pathname.endsWith('/rpc/workflow')) {
            const body = request.postDataJSON()
            if (body.method === 'list_role_tasks') {
              page.__taskSearchReads.push(body.params.keyword || '')
            }
          }
        })
      },
      verify: async (page) => {
        const rows = page.locator(
          '[data-testid="mobile-role-task-list"] .erp-mobile-list-item'
        )
        await rows.first().waitFor({ state: 'visible' })
        await page.waitForFunction(
          () =>
            document.querySelector('.erp-task-product-image img')
              ?.naturalWidth > 0
        )
        assert.equal(
          page.__imageReads.filter(
            (r) =>
              r.method === 'download_attachment' &&
              r.params.variant === 'thumbnail'
          ).length,
          1
        )
        assert.equal(
          page.__imageReads.filter(
            (r) => r.method === 'download_attachment' && !r.params.variant
          ).length,
          0
        )
        assert.equal(
          await page.getByText('确认兔子样品', { exact: true }).count(),
          0,
          '目标任务不在最初加载的 50 项内'
        )
        const search = page.getByRole('searchbox', {
          name: '搜索订单、产品、物料或款号',
        })
        const assertSearchFocus = async (name) => {
          await search.focus()
          await page.waitForFunction(
            () =>
              !document
                .getAnimations()
                .some(
                  (animation) =>
                    animation.playState !== 'finished' &&
                    Number.isFinite(animation.effect?.getTiming().iterations) &&
                    animation.effect?.target?.closest(
                      '.mobile-role-task-search'
                    )
                )
          )
          const focusStyle = await search.evaluate((input) => {
            const style = getComputedStyle(input)
            const form = input.closest('[role="search"]')
            const wrapper = input.closest('.ant-input-affix-wrapper') || form
            const wrapperStyle = getComputedStyle(wrapper)
            return {
              inputShadow: style.boxShadow,
              inputBorder: style.borderWidth,
              inputOutline: style.outlineWidth,
              inputColor: style.color,
              wrapperBackground: wrapperStyle.backgroundColor,
              wrapperShadow: wrapperStyle.boxShadow,
              wrapperBorder: wrapperStyle.borderColor,
              wrapperHeight: wrapper.getBoundingClientRect().height,
              formOutline: getComputedStyle(form).outlineWidth,
            }
          })
          await page.screenshot({
            path: path.join(outputDir, `${name}.png`),
            fullPage: true,
          })
          assert.equal(
            focusStyle.inputShadow,
            'none',
            `搜索框内部不应叠加第二层焦点边框：${JSON.stringify(focusStyle)}`
          )
          assert.equal(focusStyle.inputBorder, '0px')
          assert.equal(focusStyle.inputOutline, '0px')
          assert.equal(focusStyle.formOutline, '0px')
          assert.equal(focusStyle.wrapperHeight, 48)
          assert.match(focusStyle.wrapperShadow, /inset/u)
          assertReadableOnBackground(
            focusStyle.inputColor,
            focusStyle.wrapperBackground,
            '搜索文字清晰可读'
          )
          if (name.endsWith('dark')) {
            assert.ok(
              isDarkControlBackground(focusStyle.wrapperBackground),
              JSON.stringify(focusStyle)
            )
          }
        }
        await assertSearchFocus('mobile-task-search-focused')
        assert.equal(
          await page.getByRole('button', { name: '搜索', exact: true }).count(),
          0
        )
        const searchedKeywords = () => page.__taskSearchReads.filter(Boolean)

        await search.dispatchEvent('compositionstart')
        await search.fill('wei')
        await search.dispatchEvent('keydown', {
          key: 'Enter',
          keyCode: 229,
          isComposing: true,
        })
        // 等待超过防抖窗口，确认中文候选阶段不会发出查询。
        await page.waitForTimeout(400)
        assert.deepEqual(searchedKeywords(), [])
        await search.fill('唯一')
        await search.dispatchEvent('compositionend', { data: '唯一' })
        await page
          .getByText('确认兔子样品', { exact: true })
          .waitFor({ state: 'visible' })
        assert.deepEqual(searchedKeywords(), ['唯一'])
        const clearSearch = async () => {
          await page.getByRole('button', { name: '清除搜索' }).click()
          await page.waitForFunction(
            () =>
              document.querySelectorAll(
                '[data-testid="mobile-role-task-list"] .erp-mobile-list-item'
              ).length > 1
          )
          assert.equal(await search.inputValue(), '')
          assert.equal(
            await search.evaluate((input) => input === document.activeElement),
            true
          )
        }
        await clearSearch()

        await search.pressSequentially('唯一款号-RB018', { delay: 30 })
        assert.deepEqual(searchedKeywords(), ['唯一'])
        await page
          .getByText('确认兔子样品', { exact: true })
          .waitFor({ state: 'visible' })
        assert.deepEqual(searchedKeywords(), ['唯一', '唯一款号-RB018'])
        assert.equal(
          await search.evaluate((input) => input === document.activeElement),
          true
        )
        assert.equal(await rows.count(), 1)
        const taskTime = rows.first().locator('.erp-task-timing')
        assert.deepEqual(await taskTime.locator('dt').allTextContents(), [
          '进入本岗',
        ])
        assert.equal(
          await taskTime.locator('time').getAttribute('datetime'),
          new Date(1_788_840_000_000).toISOString(),
          '列表入岗时间应使用任务创建值，未设置截止时不添加占位'
        )
        await page.setViewportSize({ width: 320, height: 700 })
        const timeGeometry = await taskTime.evaluate((node) => ({
          width: node.clientWidth,
          scrollWidth: node.scrollWidth,
          pageWidth: document.documentElement.clientWidth,
          pageScrollWidth: document.documentElement.scrollWidth,
          icons: node.querySelectorAll('.erp-task-timing__icon').length,
        }))
        assert(timeGeometry.scrollWidth <= timeGeometry.width + 1)
        assert(timeGeometry.pageScrollWidth <= timeGeometry.pageWidth + 1)
        assert.equal(timeGeometry.icons, 1)
        await page.setViewportSize({ width: 390, height: 844 })
        await search.press('Enter')
        await search.fill('  唯一款号-RB018  ')
        await page.waitForTimeout(400)
        assert.deepEqual(
          searchedKeywords(),
          ['唯一', '唯一款号-RB018'],
          '相同的规范化关键词不重复请求'
        )
        const clearBox = await page
          .getByRole('button', { name: '清除搜索' })
          .boundingBox()
        assert.ok(clearBox.width >= 44 && clearBox.height >= 44)

        await clickERPThemeOption(page, '暗色')
        await assertERPThemeMode(page, {
          scenarioName: 'mobile-task-search',
          expectedMode: 'dark',
          expectedEffectiveTheme: 'dark',
        })
        await assertSearchFocus('mobile-task-search-focused-dark')
        await clickERPThemeOption(page, '浅色')
        await assertERPThemeMode(page, {
          scenarioName: 'mobile-task-search',
          expectedMode: 'light',
          expectedEffectiveTheme: 'light',
        })

        const delayedQuery = async (route) => {
          const body = route.request().postDataJSON()
          if (
            body.method === 'list_role_tasks' &&
            body.params.keyword === 'TB025'
          ) {
            await new Promise((resolve) => setTimeout(resolve, 800))
          }
          await route.fallback()
        }
        await page.route('**/rpc/workflow', delayedQuery)
        let oldResponseReturned = false
        const oldResponse = page.waitForResponse(
          (response) =>
            response.url().endsWith('/rpc/workflow') &&
            response.request().postDataJSON()?.params?.keyword === 'TB025'
        )
        oldResponse.then(() => {
          oldResponseReturned = true
        })
        await search.fill('TB025')
        await search.press('Enter')
        const latestResponse = page.waitForResponse(
          (response) =>
            response.url().endsWith('/rpc/workflow') &&
            response.request().postDataJSON()?.params?.keyword ===
              '唯一款号-RB018'
        )
        await search.fill('唯一款号-RB018')
        await latestResponse
        assert.equal(oldResponseReturned, false, '新查询先于旧查询返回')
        await oldResponse
        await page.waitForTimeout(100)
        await page.unroute('**/rpc/workflow', delayedQuery)
        await page
          .getByText('确认兔子样品', { exact: true })
          .waitFor({ state: 'visible' })
        assert.equal(
          await rows.count(),
          1,
          '慢请求返回后仍只显示最新关键词的结果'
        )
        await page.screenshot({
          path: path.join(outputDir, 'mobile-task-search-product-image.png'),
          fullPage: true,
        })
        const copyStyle = rows
          .first()
          .getByRole('button', { name: '复制产品编号', exact: true })
        await assertTaskCopy(page, copyStyle, 'PRODUCT-7')
        await assertTaskCopy(
          page,
          rows
            .first()
            .getByRole('button', { name: '复制单据编号', exact: true }),
          'SO-IMAGE-0'
        )
        const copySize = await copyStyle.boundingBox()
        assert.ok(
          copySize.width >= 44 && copySize.height >= 44,
          '手机复制按钮点击范围至少 44px'
        )
        await clickTaskCardContent(
          rows.first(),
          rows.first().locator('.erp-task-product-image img')
        )
        await page
          .getByTestId('mobile-task-detail-screen')
          .waitFor({ state: 'visible' })
        const copyDetail = page.getByTestId('mobile-task-detail-screen')
        await assertTaskCopy(
          page,
          copyDetail.getByRole('button', { name: '复制产品信息', exact: true }),
          [
            '产品：图片识别模拟产品',
            '产品编号：PRODUCT-7',
            '内部款号：唯一款号-RB018',
          ]
        )
        await assertTaskCopy(
          page,
          copyDetail.getByRole('button', { name: '复制任务信息', exact: true }),
          ['任务：确认兔子样品', 'SO-IMAGE-0', '进入本岗：2026年']
        )
        await page
          .getByRole('button', { name: '查看图片识别模拟产品大图' })
          .click()
        await page.waitForFunction(
          () =>
            document.querySelector('.erp-task-product-image__preview')
              ?.naturalWidth > 0
        )
        assert.equal(
          page.__imageReads.filter(
            (r) => r.method === 'download_attachment' && !r.params.variant
          ).length,
          1
        )
        await page.locator('.ant-modal-close').click()
        await page.goBack()
        await search.waitFor({ state: 'visible' })
        assert.equal(await search.inputValue(), '唯一款号-RB018')
        assert.equal(await rows.count(), 1)
        await clearSearch()
        const readsBeforeLeave = page.__taskSearchReads.length
        await search.fill('不应触发的搜索')
        await clickTaskCardContent(
          rows.first(),
          rows.first().locator('.mobile-task-list-row__head')
        )
        await page
          .getByTestId('mobile-task-detail-screen')
          .waitFor({ state: 'visible' })
        await page.waitForTimeout(400)
        assert.equal(
          page.__taskSearchReads.length,
          readsBeforeLeave,
          '离开列表取消尚未触发的搜索'
        )
        await page.goBack()
        await search.waitFor({ state: 'visible' })
        assert.equal(await search.inputValue(), '')
        await page.getByRole('button', { name: '已办', exact: true }).click()
        const endedTask = page.getByRole('button', {
          name: '查看样品资料已核对处理结果',
          exact: true,
        })
        await endedTask.waitFor({ state: 'visible' })
        const endedCard = page
          .locator('.erp-task-card')
          .filter({ has: endedTask })
        assert.deepEqual(
          await endedCard.locator('.erp-task-timing dt').allTextContents(),
          ['完成']
        )
        assert.equal(
          await endedCard.locator('time').getAttribute('datetime'),
          new Date(1_788_842_700_000).toISOString()
        )
        assert.doesNotMatch(
          await endedCard.innerText(),
          /更新时间|已超时|进入本岗/u
        )
        await page.screenshot({
          path: path.join(outputDir, 'mobile-task-ended-time.png'),
        })
        await endedTask.click()
        const endedDetail = page.getByTestId('mobile-task-detail-screen')
        await endedDetail.waitFor({ state: 'visible' })
        assert.equal(
          await endedDetail
            .locator('[data-task-time="ended"] time')
            .getAttribute('datetime'),
          new Date(1_788_842_700_000).toISOString()
        )
        assert.equal(
          await endedDetail.locator('.erp-task-timing__row--danger').count(),
          0
        )
        await page.goBack()
        await page.getByRole('button', { name: '待办', exact: true }).click()
        for (const [keyword, label, state] of [
          ['占位产品', '暂无图', 'empty'],
          ['占位物料', '物料', 'empty'],
          ['占位加载失败', '加载失败', 'failed'],
        ]) {
          const readsBefore = page.__imageReads.length
          await search.fill(keyword)
          const placeholderRow = page
            .locator('.mobile-task-list-row')
            .filter({ hasText: `检查${keyword}` })
          const frame = placeholderRow.locator(
            `.erp-task-product-image[data-image-state="${state}"]`
          )
          await frame.waitFor({ state: 'visible' })
          assert.equal((await frame.innerText()).trim(), label)
          assert.equal(await frame.locator('img, button').count(), 0)
          const geometry = await frame.boundingBox()
          assert.equal(geometry.width, 52)
          assert.equal(geometry.height, 52)
          if (state === 'empty') {
            assert.equal(
              page.__imageReads.length,
              readsBefore,
              '默认占位不请求图片'
            )
          }
          await clickTaskCardContent(placeholderRow, frame)
          const placeholderDetail = page.getByTestId(
            'mobile-task-detail-screen'
          )
          await placeholderDetail.waitFor({ state: 'visible' })
          await placeholderDetail
            .locator(`.erp-task-product-image[data-image-state="${state}"]`)
            .waitFor({ state: 'visible' })
          assert.equal(
            await placeholderDetail
              .getByRole('button', { name: /大图/ })
              .count(),
            0
          )
          await page.goBack()
          assert.equal(await search.inputValue(), keyword)
        }
        await search.fill('AB-001#-02#')
        const materialCard = rows.filter({ hasText: '检查占位物料' })
        await materialCard.waitFor({ state: 'visible' })
        assert.equal(await rows.count(), 1)
        assert.equal(
          await materialCard
            .getByText('款号 示例织造AB-001#-02#米白', { exact: true })
            .count(),
          1
        )
        assert.equal(
          await materialCard
            .getByRole('button', { name: '复制系统物料编号', exact: true })
            .count(),
          0
        )
        await assertTaskCopy(
          page,
          materialCard.getByRole('button', {
            name: '复制款号',
            exact: true,
          }),
          '示例织造AB-001#-02#米白'
        )
        await clickTaskCardContent(
          materialCard,
          materialCard.locator('.erp-task-product-image')
        )
        const materialDetail = page.getByTestId('mobile-task-detail-screen')
        await materialDetail.waitFor({ state: 'visible' })
        await assertTaskCopy(
          page,
          materialDetail.getByRole('button', {
            name: '复制物料信息',
            exact: true,
          }),
          ['款号：示例织造AB-001#-02#米白', '系统物料编号：MAT-95002']
        )
        await page.screenshot({
          path: path.join(outputDir, 'mobile-task-supplier-item-no.png'),
          fullPage: true,
        })
        await page.goBack()
        assert.equal(await search.inputValue(), 'AB-001#-02#')
        await search.fill('占位加载失败')
        await page
          .locator('.erp-task-product-image[data-image-state="failed"]')
          .waitFor({ state: 'visible' })
        await clickERPThemeOption(page, '暗色')
        const failedFrame = page.locator(
          '.erp-task-product-image[data-image-state="failed"]'
        )
        const placeholderColors = await failedFrame.evaluate((node) => {
          const style = getComputedStyle(node)
          return { color: style.color, background: style.backgroundColor }
        })
        assertReadableOnBackground(
          placeholderColors.color,
          placeholderColors.background,
          '暗色占位应可辨认'
        )
        await page.screenshot({
          path: path.join(outputDir, 'mobile-task-image-placeholder-dark.png'),
        })
      },
    },
    {
      name: 'mobile-customer-runtime-sync-failure-customer-copy',
      path: '/m/engineering/tasks',
      auth: 'admin',
      customerKey: 'yoyoosun',
      adminProfile: {
        username: 'style-l1-mobile-runtime-failure',
        is_super_admin: true,
        roles: [{ role_key: 'engineering', name: '工程' }],
        permissions: [
          'mobile.engineering.access',
          'workflow.task.read',
          'workflow.task.update',
        ],
        menus: [],
      },
      viewport: { width: 430, height: 900 },
      beforeNavigate: async (page) => {
        page.__customerCopyWorkflowCalls = 0
        page.on('request', (request) => {
          if (new URL(request.url()).pathname.endsWith('/rpc/workflow')) {
            page.__customerCopyWorkflowCalls += 1
          }
        })
        await page.unroute('**/rpc/customer_config')
        await page.route('**/rpc/customer_config', async (route) => {
          const body = route.request().postDataJSON() || {}
          const { id = 'mock-id', method } = body
          if (method === 'get_effective_session') {
            await new Promise((resolve) => setTimeout(resolve, 1200))
          }
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              jsonrpc: '2.0',
              id,
              result: {
                code:
                  method === 'get_effective_session'
                    ? RpcErrorCode.INTERNAL
                    : 0,
                message:
                  method === 'get_effective_session'
                    ? '工作范围同步失败'
                    : 'OK',
                data: {},
              },
            }),
          })
        })
      },
      verify: async (page) => {
        await expectText(page, '正在准备手机待办')
        await expectText(page, '正在确认您的岗位权限和工作范围，请稍候...')
        await assertTextAbsent(page, '当前客户运行环境')
        await expectText(page, '暂时无法进入手机待办')
        await expectText(page, '当前账号的工作范围尚未准备完成')
        await expectButton(page, '选择其他工作入口')
        await expectButton(page, '退出登录')
        await assertTextAbsent(page, '客户运行环境')
        await assertTextAbsent(page, '对应客户入口')
        assert.equal(
          page.__customerCopyWorkflowCalls,
          0,
          '工作范围同步失败时不得请求岗位任务数据'
        )
      },
    },
    {
      name: 'mobile-yoyo-role-task-projection',
      path: '/m/engineering/tasks',
      auth: 'admin',
      customerKey: 'yoyoosun',
      effectiveSession: {
        configRevision: 'style-l1-mobile-yoyo-role-task-projection',
        configHash: 'style-l1-mobile-yoyo-role-task-projection-hash',
        customer: { key: 'yoyoosun', name: '永绅' },
        pages: [],
        actions: [
          'mobile.engineering.access',
          'mobile.production.access',
          'mobile.warehouse.access',
          'mobile.quality.access',
          'mobile.finance.access',
          'workflow.task.create',
          'workflow.task.read',
          'workflow.task.update',
          'workflow.task.complete',
        ],
        workflow_visible_owner_role_keys_by_capability: {
          'workflow.task.read': [
            'engineering',
            'production',
            'warehouse',
            'quality',
            'finance',
          ],
          'workflow.task.update': [
            'engineering',
            'production',
            'warehouse',
            'quality',
            'finance',
          ],
          'workflow.task.complete': [
            'engineering',
            'production',
            'warehouse',
            'quality',
            'finance',
          ],
        },
        fieldPolicies: {},
        workPools: [],
        source: 'active_customer_config_revision',
      },
      adminProfile: {
        username: 'style-l1-yoyo-role-user',
        is_super_admin: false,
        roles: [
          { role_key: 'engineering', name: '工程' },
          { role_key: 'production', name: '生产' },
          { role_key: 'warehouse', name: '仓库' },
          { role_key: 'quality', name: '品质' },
          { role_key: 'finance', name: '财务' },
        ],
        permissions: [
          'mobile.engineering.access',
          'mobile.production.access',
          'mobile.warehouse.access',
          'mobile.quality.access',
          'mobile.finance.access',
          'workflow.task.create',
          'workflow.task.read',
          'workflow.task.update',
          'workflow.task.complete',
        ],
        menus: [],
      },
      workflowTaskFixtures: [
        {
          id: 9201,
          task_code: 'sales-engineering-data-9201',
          task_group: 'engineering_data',
          task_name: '销售订单工程资料办理',
          source_type: 'sales_order',
          source_id: 601,
          source_no: 'SO-L1-601',
          business_status_key: 'engineering_preparing',
          task_status_key: 'ready',
          owner_role_key: 'engineering',
          required_capability_key: 'workflow.task.complete',
          process_instance_id: 801,
          process_node_instance_id: 804,
          version: 1,
          priority: 1,
          payload: {},
        },
      ],
      workflowProcessContextFixtures: [
        {
          taskID: 9201,
          processContext: {
            source: { type: 'sales_order', id: 601, no: 'SO-L1-601' },
            process_instance: {
              id: 801,
              process_key: 'sales_order_acceptance',
              process_version: 'v1',
              status: 'active',
              started_at: 1_800_000_000,
              completed_at: null,
            },
            linked_node: {
              id: 804,
              process_instance_id: 801,
              node_key: 'engineering_data',
              node_type: 'human_task',
              attempt: 1,
              version: 1,
              status: 'active',
              outcome: '',
            },
            approval_form: null,
            nodes: [
              {
                id: 802,
                process_instance_id: 801,
                node_key: 'submit_sales_order',
                node_type: 'domain_command',
                attempt: 1,
                version: 1,
                status: 'completed',
                outcome: 'sales_order.submitted',
              },
              {
                id: 803,
                process_instance_id: 801,
                node_key: 'order_approval',
                node_type: 'approval',
                attempt: 1,
                version: 1,
                status: 'completed',
                outcome: 'approved',
              },
              {
                id: 804,
                process_instance_id: 801,
                node_key: 'engineering_data',
                node_type: 'human_task',
                attempt: 1,
                version: 1,
                status: 'active',
                outcome: '',
              },
            ],
            current_nodes: [
              {
                id: 804,
                process_instance_id: 801,
                node_key: 'engineering_data',
                node_type: 'human_task',
                attempt: 1,
                version: 1,
                status: 'active',
                outcome: '',
              },
            ],
            current_responsibilities: [
              {
                node_instance_id: 804,
                owner_role_key: 'engineering',
              },
            ],
            completed_nodes: [
              {
                id: 802,
                process_instance_id: 801,
                node_key: 'submit_sales_order',
                node_type: 'domain_command',
                attempt: 1,
                version: 1,
                status: 'completed',
                outcome: 'sales_order.submitted',
              },
              {
                id: 803,
                process_instance_id: 801,
                node_key: 'order_approval',
                node_type: 'approval',
                attempt: 1,
                version: 1,
                status: 'completed',
                outcome: 'approved',
              },
            ],
          },
        },
      ],
      viewport: { width: 430, height: 900 },
      verify: async (page) => {
        const roles = [
          {
            key: 'engineering',
            label: '工程',
            taskName: '工程资料与 BOM 待补齐核对任务',
          },
          {
            key: 'production',
            label: '生产',
            taskName: '车缝加工交期与现场进度核对任务',
          },
          {
            key: 'warehouse',
            label: '仓库',
            taskName: '主料仓到料与待检批次交接任务',
          },
          {
            key: 'quality',
            label: '品质',
            taskName: '来料检验判定与不合格品返馈任务',
          },
          {
            key: 'finance',
            label: '财务',
            taskName: '加工合同对账与应付确认任务',
          },
        ]

        await expectText(page, '工程')
        await page.evaluate(async (roleEntries) => {
          const createTask = async (role, index) => {
            const response = await fetch('/rpc/workflow', {
              method: 'POST',
              headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: `mobile-role-projection-${role.key}`,
                method: 'create_task',
                params: {
                  task_code: `STYLE-L1-YOYO-${role.key.toUpperCase()}`,
                  task_group: 'project-orders',
                  task_name: role.taskName,
                  source_type: 'project-orders',
                  source_id: 12_000 + index,
                  source_no: `YOYO-${role.key.toUpperCase()}-超长来源单号-20260710`,
                  business_status_key: 'project_pending',
                  task_status_key: 'ready',
                  owner_role_key: role.key,
                  priority: index + 1,
                  payload: {
                    product_name: '长耳兔抱枕（加长耳朵与可拆洗外套）',
                    product_names: [
                      '长耳兔抱枕（加长耳朵与可拆洗外套）',
                      '云朵小熊',
                    ],
                    customer_name: '永绅试用模拟客户（非真实客户数据）',
                    style_no: `STYLE-${role.key.toUpperCase()}-LONG-VALUE`,
                    due_date: '2026-07-16',
                  },
                },
              }),
            })
            const payload = await response.json()
            if (!response.ok || payload?.result?.code !== 0) {
              throw new Error(`create_task failed: ${JSON.stringify(payload)}`)
            }
          }
          await Promise.all(
            roleEntries.map((role, index) => createTask(role, index))
          )
        }, roles)

        for (const role of roles) {
          await gotoScenarioPath(page, `/m/${role.key}/tasks`, {
            waitUntil: 'domcontentloaded',
          })
          await waitForPath(page, `/m/${role.key}/tasks`)
          await expectText(page, role.label)
          await expectText(page, role.taskName)
          if (role.key === 'engineering') {
            const filterMetrics = await page.evaluate(() => {
              const tabs = document.querySelector('.mobile-role-task-filters')
              const tabsStyle =
                tabs instanceof HTMLElement
                  ? window.getComputedStyle(tabs, '::before')
                  : null
              const buttons = Array.from(
                tabs?.querySelectorAll('.mobile-role-task-filter') || []
              )
              return {
                labels: buttons.map(
                  (button) =>
                    button
                      .querySelector('.mobile-role-task-filter__label')
                      ?.textContent?.trim() || ''
                ),
                counts: buttons.map(
                  (button) =>
                    button
                      .querySelector('.mobile-role-task-filter__count')
                      ?.textContent?.trim() || ''
                ),
                ariaLabels: buttons.map(
                  (button) => button.getAttribute('aria-label') || ''
                ),
                approvalCount: document.querySelectorAll(
                  '[data-testid="mobile-role-filter-approval"]'
                ).length,
                mineCount: document.querySelectorAll(
                  '[data-testid="mobile-role-filter-mine"]'
                ).length,
                standaloneApprovalCopy:
                  document.body?.innerText?.includes('当前岗位的审批事项') ||
                  false,
                widths: buttons.map(
                  (button) => button.getBoundingClientRect().width
                ),
                tabsClientWidth:
                  tabs instanceof HTMLElement ? tabs.clientWidth : 0,
                tabsScrollWidth:
                  tabs instanceof HTMLElement ? tabs.scrollWidth : 0,
                thumbWidth: Number.parseFloat(tabsStyle?.width || '0'),
              }
            })
            const expectedFilterWidth = (filterMetrics.tabsClientWidth - 8) / 3
            assert(
              JSON.stringify(filterMetrics.labels) ===
                JSON.stringify(['全部', '风险', '超时']) &&
                filterMetrics.approvalCount === 0 &&
                filterMetrics.mineCount === 0 &&
                !filterMetrics.standaloneApprovalCopy &&
                filterMetrics.counts.every((count) => /^\d+$/u.test(count)) &&
                filterMetrics.ariaLabels.every((label) =>
                  label.includes('共 ')
                ) &&
                filterMetrics.tabsScrollWidth <=
                  filterMetrics.tabsClientWidth + 1 &&
                Math.abs(filterMetrics.thumbWidth - expectedFilterWidth) <=
                  1.5 &&
                filterMetrics.widths.every(
                  (width) => Math.abs(width - expectedFilterWidth) <= 1.5
                ),
              `无审批权限的 430px 岗位页应首屏显示全部 / 风险 / 超时三项服务端总数并保持等宽: ${JSON.stringify(
                filterMetrics
              )}`
            )
          }
          const metrics = await page.evaluate(() => {
            const root = document.querySelector('.mobile-role-tasks-page')
            const scroller = document.querySelector(
              '.mobile-role-tasks-page__scroll'
            )
            const taskRows = Array.from(
              document.querySelectorAll('.erp-mobile-list-item')
            )
            const rootRect = root?.getBoundingClientRect()
            const readCount = (testID) => {
              const node = document.querySelector(`[data-testid="${testID}"]`)
              const value = node?.querySelector(
                '.mobile-role-metric-button__value'
              )
              return Number(
                value?.textContent?.trim() || node?.textContent?.trim()
              )
            }
            return {
              rootWidth: rootRect?.width || 0,
              rootLeft: rootRect?.left || 0,
              rootRight: rootRect?.right || 0,
              viewportWidth: window.innerWidth,
              documentOverflowX:
                document.documentElement.scrollWidth -
                document.documentElement.clientWidth,
              scrollerOverflowX:
                scroller instanceof HTMLElement
                  ? scroller.scrollWidth - scroller.clientWidth
                  : 0,
              taskRowOverflowX: taskRows.map((row) =>
                row instanceof HTMLElement
                  ? row.scrollWidth - row.clientWidth
                  : 0
              ),
              statusCounts: {
                ready: readCount('mobile-role-progress-ready'),
                blocked: readCount('mobile-role-progress-blocked'),
                rejected: readCount('mobile-role-progress-rejected'),
                done: readCount('mobile-role-progress-done'),
                total: readCount('mobile-role-total-count'),
              },
              conservationNote:
                document
                  .querySelector(
                    '[data-testid="mobile-role-count-conservation-note"]'
                  )
                  ?.textContent?.replace(/\s+/g, ' ')
                  .trim() || '',
            }
          })
          assert(
            metrics.rootWidth > 0 &&
              metrics.rootLeft >= -1 &&
              metrics.rootRight <= metrics.viewportWidth + 1 &&
              metrics.documentOverflowX <= 1 &&
              metrics.scrollerOverflowX <= 1 &&
              metrics.taskRowOverflowX.every((value) => value <= 1),
            `${role.label}岗位任务端长文字不应推宽页面或任务行: ${JSON.stringify(
              metrics
            )}`
          )
          assert.equal(
            await page
              .locator('[data-testid="mobile-loaded-task-overview"]')
              .count(),
            0
          )
          assert.equal(metrics.conservationNote, '')
          await page.waitForTimeout(350)
          await page.screenshot({
            path: path.join(outputDir, `mobile-yoyo-${role.key}-task-list.png`),
            fullPage: true,
          })
          const roleTaskCard = page
            .locator('.erp-mobile-list-item')
            .filter({ hasText: role.taskName })
          await clickTaskCardContent(
            roleTaskCard,
            roleTaskCard.getByText(role.taskName, { exact: true })
          )
          await expectText(page, role.taskName)
          const identity = page.locator('[aria-label="关联产品与物料"]')
          await expectText(identity, '长耳兔抱枕（加长耳朵与可拆洗外套）')
          await identity.locator('summary').click()
          await expectText(identity, '云朵小熊')
          await identity.locator('summary').click()
          const actionDiagnostic = await page.evaluate(async (taskName) => {
            const call = async (domain, method, params = {}) => {
              const response = await fetch(`/rpc/${domain}`, {
                method: 'POST',
                headers: {
                  Accept: 'application/json',
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  jsonrpc: '2.0',
                  id: `mobile-action-diagnostic-${method}`,
                  method,
                  params,
                }),
              })
              return response.json()
            }
            const [sessionPayload, taskPayload] = await Promise.all([
              call('customer_config', 'get_effective_session', {
                customer_key: 'yoyoosun',
              }),
              call('workflow', 'list_tasks', { limit: 200 }),
            ])
            const tasks = taskPayload?.result?.data?.tasks || []
            const selected = tasks.find((task) => task.task_name === taskName)
            const actionAccessPayload = selected
              ? await call('workflow', 'explain_action_access', {
                  task_id: selected.id,
                })
              : null
            return {
              roles: JSON.parse(localStorage.getItem('admin_roles') || '[]'),
              permissions: JSON.parse(
                localStorage.getItem('admin_permissions') || '[]'
              ),
              sessionActions:
                sessionPayload?.result?.data?.session?.actions || [],
              actionAccess: actionAccessPayload?.result || null,
              task: selected
                ? {
                    ownerRoleKey: selected.owner_role_key,
                    statusKey: selected.task_status_key,
                  }
                : null,
            }
          }, role.taskName)
          const processButton = page
            .locator('.mobile-role-action-bar')
            .getByRole('button', {
              name: '处理任务',
              exact: true,
            })
          await processButton
            .waitFor({ state: 'visible', timeout: 10_000 })
            .catch((error) => {
              throw new Error(
                `${error.message}\naction diagnostic: ${JSON.stringify(actionDiagnostic)}`
              )
            })
          assert.equal(
            await processButton.isDisabled(),
            false,
            `${role.label}岗位有角色、RBAC 与 effective-session 动作时应开放处理入口: ${JSON.stringify(
              actionDiagnostic
            )}`
          )
          await processButton.click()
          const actionScreen = page.getByTestId('mobile-task-action-screen')
          await actionScreen
            .waitFor({ state: 'visible', timeout: 10_000 })
            .catch((error) => {
              throw new Error(
                `${error.message}\naction diagnostic: ${JSON.stringify(actionDiagnostic)}`
              )
            })
          await expectText(page, '选择处理方式')
          const actionMetrics = await actionScreen.evaluate((screen) => {
            const card = screen.querySelector(
              '[data-testid="mobile-task-action-options"]'
            )
            const heading = card?.querySelector('h2')
            const cardRect = card?.getBoundingClientRect()
            const headingRect = heading?.getBoundingClientRect()
            return {
              actions: Array.from(
                screen.querySelectorAll('label[data-action-key]')
              ).map((choice) => ({
                text: choice.textContent?.replace(/\s+/g, ' ').trim() || '',
                disabled:
                  choice.querySelector('input[type="radio"]')?.disabled ?? true,
                selected:
                  choice.querySelector('input[type="radio"]')?.checked ?? false,
              })),
              radiogroupCount: screen.querySelectorAll('[role="radiogroup"]')
                .length,
              fakeActionButtonCount: card?.querySelectorAll(
                'button[aria-pressed]'
              ).length,
              cardContainsHeading: Boolean(
                cardRect &&
                  headingRect &&
                  headingRect.top >= cardRect.top - 1 &&
                  headingRect.bottom <= cardRect.bottom + 1 &&
                  headingRect.left >= cardRect.left - 1 &&
                  headingRect.right <= cardRect.right + 1
              ),
              cardOverflowX:
                card instanceof HTMLElement
                  ? card.scrollWidth - card.clientWidth
                  : null,
              documentScrollWidth: document.documentElement.scrollWidth,
              documentClientWidth: document.documentElement.clientWidth,
            }
          })
          assert(
            actionMetrics.actions.some(
              (action) => action.text === '阻塞' && !action.disabled
            ) &&
              actionMetrics.actions.some(
                (action) =>
                  action.text === '完成' && !action.disabled && action.selected
              ) &&
              actionMetrics.radiogroupCount === 1 &&
              actionMetrics.fakeActionButtonCount === 0 &&
              actionMetrics.cardContainsHeading &&
              actionMetrics.cardOverflowX <= 1,
            `${role.label}岗位独立处理页应提供可选的阻塞、完成动作: ${JSON.stringify(
              { actionDiagnostic, actionMetrics }
            )}`
          )
          assert(
            actionMetrics.documentScrollWidth <=
              actionMetrics.documentClientWidth + 1,
            `${role.label}岗位独立处理页不应横向溢出: ${JSON.stringify(actionMetrics)}`
          )
          if (role.key === 'engineering') {
            await actionScreen.screenshot({
              path: path.join(
                outputDir,
                'mobile-yoyo-engineering-task-action-430.png'
              ),
            })
          }
          await page.getByLabel('返回任务详情').click()
          await processButton.waitFor({ state: 'visible', timeout: 10_000 })
          await page.getByRole('button', { name: '任务列表' }).click()
          await expectText(page, role.taskName)
        }
        await gotoScenarioPath(page, '/m/engineering/tasks', {
          waitUntil: 'domcontentloaded',
        })
        const processTaskCard = page
          .locator('.erp-mobile-list-item')
          .filter({ hasText: '销售订单工程资料办理' })
        await clickTaskCardContent(
          processTaskCard,
          processTaskCard.getByText('销售订单工程资料办理', { exact: true })
        )
        const processContextCard = page.getByTestId(
          'mobile-task-process-context'
        )
        await processContextCard.waitFor({
          state: 'visible',
          timeout: 10_000,
        })
        await expectText(processContextCard, '销售订单受理')
        await expectText(page, 'SO-L1-601')
        await expectText(processContextCard, '流程状态')
        await expectText(processContextCard, '办理中')
        const mobileTaskEventTrail = page.getByTestId(
          'workflow-task-event-trail'
        )
        await mobileTaskEventTrail.waitFor({
          state: 'visible',
          timeout: 10_000,
        })
        await expectText(mobileTaskEventTrail, '本任务处理记录')
        await expectText(mobileTaskEventTrail, '任务已创建')
        assert.equal(
          await mobileTaskEventTrail.locator('dl').count(),
          0,
          '手机任务处理记录不应重复任务摘要中的责任信息'
        )
        assert(
          (await mobileTaskEventTrail.getByText('完整审批链').count()) === 0,
          '手机任务处理记录不应常驻显示完整审批链说明'
        )
        const mobileExecutionTrail = processContextCard.getByTestId(
          'workflow-process-stage'
        )
        await expectText(mobileExecutionTrail, '执行轨迹')
        await expectText(mobileExecutionTrail, '提交销售订单')
        await expectText(mobileExecutionTrail, '订单审批')
        await expectText(mobileExecutionTrail, '工程资料')
        const mobileExecutionTrailMetrics = await mobileExecutionTrail.evaluate(
          (element) => ({
            currentCount: element.querySelectorAll('[aria-current="step"]')
              .length,
            linkedCount: element.querySelectorAll('[data-linked-task="true"]')
              .length,
            renderedItems: element.querySelectorAll(
              '.workflow-process-stage__item'
            ).length,
          })
        )
        assert(
          mobileExecutionTrailMetrics.currentCount === 1 &&
            mobileExecutionTrailMetrics.linkedCount === 1 &&
            mobileExecutionTrailMetrics.renderedItems === 3,
          `移动任务执行轨迹状态不完整: ${JSON.stringify(
            mobileExecutionTrailMetrics
          )}`
        )
        const collectMobileTrajectoryMetrics = () =>
          page.getByTestId('mobile-task-detail-screen').evaluate((screen) => {
            const sections = [...screen.querySelectorAll('section')]
            const taskSummary = screen.querySelector(
              '[data-testid="mobile-task-detail-summary"]'
            )
            const processContext = screen.querySelector(
              '[data-testid="mobile-task-process-context"]'
            )
            const taskEvents = screen.querySelector(
              '[data-testid="workflow-task-event-trail"]'
            )
            const businessInformation = sections.find((section) =>
              section.querySelector('h2')?.textContent?.includes('业务信息')
            )
            const relatedDocuments = sections.find((section) =>
              section.querySelector('h2')?.textContent?.includes('相关单据')
            )
            const main = screen.querySelector(
              '.mobile-role-tasks-page__detail-main'
            )
            const sectionOrder = [processContext, taskEvents].map((section) =>
              sections.indexOf(section)
            )
            return {
              documentOverflow:
                document.documentElement.scrollWidth -
                document.documentElement.clientWidth,
              mainOverflow: main ? main.scrollWidth - main.clientWidth : null,
              eventOverflow: taskEvents
                ? taskEvents.scrollWidth - taskEvents.clientWidth
                : null,
              eventItemCount:
                taskEvents?.querySelectorAll('.workflow-task-event-trail__item')
                  .length || 0,
              summaryText:
                taskSummary?.textContent?.replace(/\s+/g, ' ').trim() || '',
              timingText:
                screen.querySelector('.erp-task-timing')?.textContent || '',
              optionalBusinessInformationCount: businessInformation ? 1 : 0,
              optionalRelatedDocumentsCount: relatedDocuments ? 1 : 0,
              ordered: sectionOrder.every(
                (value, index) =>
                  value >= 0 && (index === 0 || value > sectionOrder[index - 1])
              ),
            }
          })
        const mobileTrajectoryMetrics430 =
          await collectMobileTrajectoryMetrics()
        assert(
          mobileTrajectoryMetrics430.documentOverflow <= 1 &&
            mobileTrajectoryMetrics430.mainOverflow <= 1 &&
            mobileTrajectoryMetrics430.eventOverflow <= 1 &&
            mobileTrajectoryMetrics430.eventItemCount === 1 &&
            mobileTrajectoryMetrics430.summaryText.includes('负责：工程') &&
            mobileTrajectoryMetrics430.timingText.includes('进入本岗') &&
            mobileTrajectoryMetrics430.timingText.includes('处理截止') &&
            mobileTrajectoryMetrics430.optionalBusinessInformationCount === 0 &&
            mobileTrajectoryMetrics430.optionalRelatedDocumentsCount === 0 &&
            mobileTrajectoryMetrics430.ordered,
          `430px 移动任务轨迹顺序或布局不完整: ${JSON.stringify(
            mobileTrajectoryMetrics430
          )}`
        )
        await mobileTaskEventTrail.screenshot({
          path: path.join(
            outputDir,
            'mobile-yoyo-engineering-task-event-trail-430.png'
          ),
        })
        await processContextCard.screenshot({
          path: path.join(
            outputDir,
            'mobile-yoyo-engineering-process-context-430.png'
          ),
        })
        await page.screenshot({
          path: path.join(
            outputDir,
            'mobile-yoyo-engineering-task-trajectory-430.png'
          ),
          fullPage: true,
        })
        await page.setViewportSize({ width: 390, height: 844 })
        const mobileTrajectoryMetrics390 =
          await collectMobileTrajectoryMetrics()
        assert(
          mobileTrajectoryMetrics390.documentOverflow <= 1 &&
            mobileTrajectoryMetrics390.mainOverflow <= 1 &&
            mobileTrajectoryMetrics390.eventOverflow <= 1 &&
            mobileTrajectoryMetrics390.eventItemCount === 1 &&
            mobileTrajectoryMetrics390.summaryText.includes('负责：工程') &&
            mobileTrajectoryMetrics390.timingText.includes('进入本岗') &&
            mobileTrajectoryMetrics390.timingText.includes('处理截止') &&
            mobileTrajectoryMetrics390.optionalBusinessInformationCount === 0 &&
            mobileTrajectoryMetrics390.optionalRelatedDocumentsCount === 0 &&
            mobileTrajectoryMetrics390.ordered,
          `390px 移动任务轨迹顺序或布局不完整: ${JSON.stringify(
            mobileTrajectoryMetrics390
          )}`
        )
        await mobileTaskEventTrail.screenshot({
          path: path.join(
            outputDir,
            'mobile-yoyo-engineering-task-event-trail-390.png'
          ),
        })
        await page.screenshot({
          path: path.join(
            outputDir,
            'mobile-yoyo-engineering-task-trajectory-390.png'
          ),
          fullPage: true,
        })
      },
    },
    {
      name: 'mobile-nine-role-request-recovery-matrix',
      path: '/m/engineering/tasks',
      auth: 'admin',
      customerKey: 'yoyoosun',
      effectiveSession: {
        configRevision: 'style-l1-mobile-nine-role-request-recovery-matrix',
        configHash: 'style-l1-mobile-nine-role-request-recovery-matrix-hash',
        customer: { key: 'yoyoosun', name: '永绅' },
        pages: [],
        actions: [
          'mobile.boss.access',
          'mobile.sales.access',
          'mobile.purchase.access',
          'mobile.pmc.access',
          'mobile.production.access',
          'mobile.warehouse.access',
          'mobile.quality.access',
          'mobile.finance.access',
          'mobile.engineering.access',
          'workflow.task.read',
        ],
        workflow_visible_owner_role_keys_by_capability: {
          'workflow.task.read': [
            'boss',
            'sales',
            'purchase',
            'pmc',
            'production',
            'warehouse',
            'quality',
            'finance',
            'engineering',
          ],
        },
        fieldPolicies: {},
        workPools: [],
        source: 'active_customer_config_revision',
      },
      adminProfile: {
        username: 'style-l1-nine-role-recovery-user',
        is_super_admin: false,
        roles: [
          { role_key: 'boss', name: '老板' },
          { role_key: 'sales', name: '业务' },
          { role_key: 'purchase', name: '采购' },
          { role_key: 'pmc', name: 'PMC' },
          { role_key: 'production', name: '生产经理' },
          { role_key: 'warehouse', name: '仓库' },
          { role_key: 'quality', name: '品质' },
          { role_key: 'finance', name: '财务' },
          { role_key: 'engineering', name: '工程' },
        ],
        permissions: [
          'mobile.boss.access',
          'mobile.sales.access',
          'mobile.purchase.access',
          'mobile.pmc.access',
          'mobile.production.access',
          'mobile.warehouse.access',
          'mobile.quality.access',
          'mobile.finance.access',
          'mobile.engineering.access',
          'workflow.task.read',
        ],
        menus: [],
      },
      viewport: { width: 390, height: 844 },
      expectedConsoleErrorPatterns: [
        /console error \[path=\/m\/boss\/tasks\]: Failed to load resource: net::ERR_FAILED/u,
        /console error \[path=\/m\/sales\/tasks\]: Failed to load resource: the server responded with a status of 408/u,
        /console error \[path=\/m\/purchase\/tasks\]: Failed to load resource: the server responded with a status of 503/u,
        /console error \[path=\/m\/warehouse\/tasks\]: Failed to load resource: the server responded with a status of 403/u,
        /console error \[path=\/m\/pmc\/tasks\]: Failed to load resource: net::ERR_FAILED/u,
        /console error \[path=\/m\/quality\/tasks\]: Failed to load resource: the server responded with a status of 408/u,
      ],
      verify: async (page) => {
        const cases = [
          { roleKey: 'boss', roleLabel: '老板', failure: 'network' },
          { roleKey: 'sales', roleLabel: '业务', failure: 'timeout' },
          {
            roleKey: 'purchase',
            roleLabel: '采购',
            failure: 'unavailable',
          },
          {
            roleKey: 'production',
            roleLabel: '生产经理',
            failure: 'invalid-success',
          },
          {
            roleKey: 'warehouse',
            roleLabel: '仓库',
            failure: 'permission',
          },
          { roleKey: 'finance', roleLabel: '财务', failure: 'stale' },
          { roleKey: 'pmc', roleLabel: 'PMC', failure: 'network' },
          { roleKey: 'quality', roleLabel: '品质', failure: 'timeout' },
          {
            roleKey: 'engineering',
            roleLabel: '工程',
            failure: 'invalid-success',
          },
        ]

        for (const testCase of cases) {
          let failureCount = 0
          let allowRecovery = false
          const workflowFailureRoute = async (route) => {
            const body = route.request().postDataJSON() || {}
            const isTargetRequest =
              body.method === 'list_role_tasks' &&
              body.params?.role_key === testCase.roleKey
            if (!isTargetRequest || allowRecovery) {
              await route.fallback()
              return
            }
            failureCount += 1
            if (testCase.failure === 'network') {
              await route.abort('failed')
              return
            }
            if (testCase.failure === 'timeout') {
              await route.fulfill({
                status: 408,
                contentType: 'application/json',
                body: JSON.stringify({
                  code: RpcErrorCode.INTERNAL,
                  message: '请求超时',
                }),
              })
              return
            }
            if (testCase.failure === 'unavailable') {
              await route.fulfill({
                status: 503,
                contentType: 'application/json',
                body: JSON.stringify({
                  code: RpcErrorCode.INTERNAL,
                  message: '服务暂不可用',
                }),
              })
              return
            }
            if (testCase.failure === 'permission') {
              await route.fulfill({
                status: 403,
                contentType: 'application/json',
                body: JSON.stringify({
                  code: RpcErrorCode.PERMISSION_DENIED,
                  message: '当前岗位无权读取任务',
                }),
              })
              return
            }
            if (testCase.failure === 'stale') {
              await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify({
                  jsonrpc: '2.0',
                  id: body.id,
                  result: {
                    code: 40922,
                    message: '任务已被其他处理人更新，请刷新后重试',
                    data: {},
                  },
                }),
              })
              return
            }
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: body.id,
                result: null,
              }),
            })
          }
          await page.route('**/rpc/workflow', workflowFailureRoute)
          try {
            await gotoScenarioPath(
              page,
              `/m/${testCase.roleKey}/tasks?style_l1_failure=${testCase.failure}`,
              { waitUntil: 'domcontentloaded' }
            )
            await waitForPath(page, `/m/${testCase.roleKey}/tasks`)
            await page
              .locator('.mobile-role-load-error')
              .waitFor({ state: 'visible', timeout: 10_000 })
            await expectText(page, testCase.roleLabel)
            await expectText(page, '任务加载失败')
            await expectButton(page, '重新加载')
            allowRecovery = true
            await page.getByRole('button', { name: '重新加载' }).click()
            await page
              .locator('.mobile-role-load-error')
              .waitFor({ state: 'hidden', timeout: 10_000 })
            await page.waitForFunction(
              () =>
                document
                  .querySelector('[data-testid="mobile-role-scroll"]')
                  ?.getAttribute('aria-busy') === 'false',
              undefined,
              { timeout: 10_000 }
            )
            assert.equal(
              failureCount > 0,
              true,
              `${testCase.roleLabel}岗位应命中 ${testCase.failure} 失败注入`
            )
          } finally {
            await page.unroute('**/rpc/workflow', workflowFailureRoute)
          }
        }
      },
    },
    {
      name: 'mobile-yoyo-boss-urge-only',
      path: '/m/boss/tasks',
      auth: 'admin',
      customerKey: 'yoyoosun',
      effectiveSession: {
        configRevision: 'style-l1-mobile-yoyo-boss-urge-only',
        configHash: 'style-l1-mobile-yoyo-boss-urge-only-hash',
        customer: { key: 'yoyoosun', name: '永绅' },
        pages: [],
        actions: [
          'mobile.boss.access',
          'workflow.task.create',
          'workflow.task.read',
          'workflow.task.supervise',
          'workflow.task.update',
        ],
        workflow_visible_owner_role_keys_by_capability: {
          'workflow.task.read': ['engineering'],
          'workflow.task.update': ['boss'],
        },
        fieldPolicies: {},
        workPools: [],
        source: 'active_customer_config_revision',
      },
      adminProfile: {
        username: 'style-l1-yoyo-boss-urge-only',
        is_super_admin: false,
        roles: [{ role_key: 'boss', name: '老板' }],
        permissions: [
          'mobile.boss.access',
          'workflow.task.create',
          'workflow.task.read',
          'workflow.task.supervise',
          'workflow.task.update',
        ],
        menus: [],
      },
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        const taskName = '工程关键资料待催办任务'
        const sourceID = 12_150
        await page.evaluate(
          async ({ sourceID: taskSourceID, taskName: targetTaskName }) => {
            const response = await fetch('/rpc/workflow', {
              method: 'POST',
              headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: 'mobile-yoyo-boss-urge-only-create',
                method: 'create_task',
                params: {
                  task_code: 'STYLE-L1-YOYO-BOSS-URGE-ONLY',
                  task_group: 'project-orders',
                  task_name: targetTaskName,
                  source_type: 'project-orders',
                  source_id: taskSourceID,
                  source_no: 'YOYO-BOSS-URGE-ONLY',
                  business_status_key: 'project_pending',
                  task_status_key: 'ready',
                  owner_role_key: 'engineering',
                  priority: 9,
                  payload: {
                    critical_path: true,
                    due_date: '2026-07-18',
                  },
                },
              }),
            })
            const payload = await response.json()
            if (!response.ok || payload?.result?.code !== 0) {
              throw new Error(`create_task failed: ${JSON.stringify(payload)}`)
            }
          },
          { sourceID, taskName }
        )
        await page.reload({ waitUntil: 'domcontentloaded' })
        await page
          .getByTestId('mobile-role-bottom-nav')
          .waitFor({ state: 'visible', timeout: 15_000 })
          .catch(async (error) => {
            const diagnostic = await page.evaluate(async () => {
              const call = async (domain, method, params = {}) => {
                const response = await fetch(`/rpc/${domain}`, {
                  method: 'POST',
                  headers: {
                    Accept: 'application/json',
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({
                    jsonrpc: '2.0',
                    id: `mobile-yoyo-boss-diagnostic-${method}`,
                    method,
                    params,
                  }),
                })
                return response.json()
              }
              const [profile, effectiveSession] = await Promise.all([
                call('admin', 'me'),
                call('customer_config', 'get_effective_session', {
                  customer_key: 'yoyoosun',
                }),
              ])
              return {
                bodyText:
                  document.body.textContent?.replace(/\s+/g, ' ').trim() || '',
                effectiveSession,
                path: window.location.pathname,
                permissions: JSON.parse(
                  localStorage.getItem('admin_permissions') || '[]'
                ),
                profile,
                roles: JSON.parse(localStorage.getItem('admin_roles') || '[]'),
              }
            })
            throw new Error(
              `仅催办场景未进入岗位任务端: ${JSON.stringify(diagnostic)}`,
              { cause: error }
            )
          })
        await page.getByTestId('mobile-role-nav-messages').click()
        await page.waitForFunction(() => {
          const heading = document.querySelector('.mobile-role-tasks-page h1')
          return heading?.textContent?.trim() === '风险'
        })
        const taskRow = page
          .locator('.mobile-role-message-card')
          .filter({ hasText: taskName })
          .first()
        await taskRow.waitFor({ state: 'visible', timeout: 10_000 })
        await taskRow.click()
        await expectText(page, '这条任务由工程办理，您可以查看并发起催办。')

        const actionDiagnostic = await page.evaluate(async (taskSourceID) => {
          const call = async (method, params = {}) => {
            const response = await fetch('/rpc/workflow', {
              method: 'POST',
              headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: `mobile-yoyo-boss-urge-only-${method}`,
                method,
                params,
              }),
            })
            return response.json()
          }
          const taskPayload = await call('list_tasks', {
            source_id: taskSourceID,
            limit: 10,
          })
          const task = taskPayload?.result?.data?.tasks?.[0]
          const accessPayload = task
            ? await call('explain_action_access', { task_id: task.id })
            : null
          return {
            task: task
              ? {
                  id: task.id,
                  ownerRoleKey: task.owner_role_key,
                  statusKey: task.task_status_key,
                }
              : null,
            actions: accessPayload?.result?.data?.actions || [],
          }
        }, sourceID)
        assert.deepEqual(
          actionDiagnostic.actions
            .filter((action) => action.allowed === true)
            .map((action) => action.action_key),
          ['urge'],
          `仅催办场景的后端允许动作必须精确为 urge: ${JSON.stringify(actionDiagnostic)}`
        )

        const attachmentAction = page.getByTestId(
          'mobile-task-attachment-action'
        )
        const viewTaskAttachments = attachmentAction.getByRole('button', {
          name: '附件（1）',
          exact: true,
        })
        assert.equal(
          await viewTaskAttachments.count(),
          1,
          `仅催办角色应有一个只读任务附件入口: ${JSON.stringify(
            await page.locator('button').allTextContents()
          )}`
        )
        const attachmentActionMetrics = await attachmentAction.evaluate(
          (element) => ({
            insideHero: Boolean(element.closest('.mobile-task-detail-hero')),
            buttonHeight:
              element.querySelector('button')?.getBoundingClientRect().height ||
              0,
          })
        )
        assert(
          attachmentActionMetrics.insideHero &&
            attachmentActionMetrics.buttonHeight >= 44,
          `仅催办角色的任务附件应保持为摘要内的可触控次要动作: ${JSON.stringify(
            attachmentActionMetrics
          )}`
        )
        await viewTaskAttachments.click()
        const attachmentDialog = page.getByRole('dialog', {
          name: '任务附件',
          exact: true,
        })
        await attachmentDialog.waitFor({ state: 'visible', timeout: 10_000 })
        await attachmentDialog.evaluate((dialog) => {
          return new Promise((resolve, reject) => {
            const deadline = performance.now() + 2_000
            const waitForVisibleFrame = () => {
              if (window.getComputedStyle(dialog).opacity === '1') {
                resolve()
                return
              }
              if (performance.now() >= deadline) {
                reject(new Error('任务附件弹窗动画未进入可见态'))
                return
              }
              window.requestAnimationFrame(waitForVisibleFrame)
            }
            waitForVisibleFrame()
          })
        })
        assert.equal(
          await attachmentDialog
            .getByRole('button', { name: '选择附件', exact: true })
            .count(),
          0,
          '仅催办角色的任务附件弹窗不应显示假上传按钮'
        )
        assert.equal(
          await attachmentDialog.locator('input[type="file"]').count(),
          0,
          '仅催办角色的任务附件弹窗不应渲染文件输入'
        )
        await attachmentDialog.screenshot({
          path: path.resolve(
            outputDir,
            'mobile-yoyo-boss-urge-only-task-attachment-390.png'
          ),
        })
        await attachmentDialog.locator('.ant-modal-close').click()
        await attachmentDialog.waitFor({ state: 'hidden', timeout: 10_000 })

        await page
          .locator('.mobile-role-action-bar')
          .getByRole('button', { name: '催办任务', exact: true })
          .click()
        const actionScreen = page.getByTestId('mobile-task-action-screen')
        await actionScreen.waitFor({ state: 'visible', timeout: 10_000 })
        await page.evaluate(() => {
          const currentState = window.history.state || {}
          window.history.replaceState(
            {
              ...currentState,
              mobileRoleTasksAction: 'done',
              mobileRoleTasksReason: '旧的完成反馈不应进入催办原因',
            },
            ''
          )
        })
        await page.reload({ waitUntil: 'domcontentloaded' })
        await actionScreen.waitFor({ state: 'visible', timeout: 15_000 })
        await page.waitForFunction(
          () => window.history.state?.mobileRoleTasksAction === 'urge',
          undefined,
          { timeout: 10_000 }
        )
        await expectText(page, '本次操作')
        await expectText(page, '催办原因')
        assert.equal(
          await actionScreen.getByLabel('现场证据').count(),
          0,
          '仅催办处理页不应显示现场证据输入'
        )
        assert.equal(
          await actionScreen.locator('input[type="file"]').count(),
          0,
          '仅催办处理页不应显示附件上传入口'
        )
        assert.equal(
          await actionScreen.getByLabel('催办原因').inputValue(),
          '',
          '旧处理方式的草稿不能残留到唯一催办动作'
        )
        assert.equal(
          await actionScreen.getByText('选择处理方式', { exact: true }).count(),
          0,
          '仅有催办动作时不应继续提示选择处理方式'
        )
        assert.equal(
          await actionScreen.getByRole('radio').count(),
          0,
          '仅有催办动作时不应渲染单选组'
        )
        assert.equal(
          await actionScreen
            .getByRole('button', { name: '催办', exact: true })
            .count(),
          0,
          '催办摘要不能伪装成单击即执行的按钮'
        )

        const singleActionMetrics = await actionScreen.evaluate((screen) => {
          const card = screen.querySelector(
            '[data-testid="mobile-task-single-action"]'
          )
          const summary = screen.querySelector(
            '[data-testid="mobile-task-single-action-summary"]'
          )
          const heading = card?.querySelector('h2')
          const submit = screen.querySelector('button[type="submit"]')
          const cardRect = card?.getBoundingClientRect()
          const summaryRect = summary?.getBoundingClientRect()
          const headingRect = heading?.getBoundingClientRect()
          const submitRect = submit?.getBoundingClientRect()
          const contained = (outer, inner) =>
            Boolean(
              outer &&
                inner &&
                inner.top >= outer.top - 1 &&
                inner.bottom <= outer.bottom + 1 &&
                inner.left >= outer.left - 1 &&
                inner.right <= outer.right + 1
            )
          return {
            actionOptionsCount: screen.querySelectorAll(
              '[data-testid="mobile-task-action-options"]'
            ).length,
            cardContainsHeading: contained(cardRect, headingRect),
            cardContainsSummary: contained(cardRect, summaryRect),
            cardOverflowX:
              card instanceof HTMLElement
                ? card.scrollWidth - card.clientWidth
                : null,
            screenOverflowX: screen.scrollWidth - screen.clientWidth,
            documentOverflowX:
              document.documentElement.scrollWidth -
              document.documentElement.clientWidth,
            headingText:
              heading?.textContent?.replace(/\s+/g, ' ').trim() || '',
            summaryText:
              summary?.textContent?.replace(/\s+/g, ' ').trim() || '',
            submitText: submit?.textContent?.replace(/\s+/g, ' ').trim() || '',
            submitType: submit?.getAttribute('type') || '',
            submitDisabled: submit?.disabled ?? true,
            submitHeight: submitRect?.height || 0,
          }
        })
        assert(
          singleActionMetrics.actionOptionsCount === 0 &&
            singleActionMetrics.headingText === '本次操作' &&
            singleActionMetrics.summaryText.includes('催办') &&
            singleActionMetrics.cardContainsHeading &&
            singleActionMetrics.cardContainsSummary &&
            singleActionMetrics.cardOverflowX <= 1 &&
            singleActionMetrics.screenOverflowX <= 1 &&
            singleActionMetrics.documentOverflowX <= 1 &&
            singleActionMetrics.submitText === '确认催办' &&
            singleActionMetrics.submitType === 'submit' &&
            !singleActionMetrics.submitDisabled &&
            singleActionMetrics.submitHeight >= 48,
          `仅催办处理页的语义或布局异常: ${JSON.stringify(singleActionMetrics)}`
        )
        await actionScreen.screenshot({
          path: path.join(
            outputDir,
            'mobile-yoyo-boss-urge-only-action-390.png'
          ),
        })

        await page.evaluate(async () => {
          document.documentElement.setAttribute('data-erp-theme', 'dark')
          await document.fonts?.ready
          await new Promise((resolve) => requestAnimationFrame(resolve))
          await new Promise((resolve) => requestAnimationFrame(resolve))
        })
        await assertThemeReadable(page, {
          scenarioName: 'mobile-yoyo-boss-urge-only-dark',
          selector: '[data-testid="mobile-task-single-action"]',
        })
        await assertDarkThemeContrast(page, {
          scenarioName: 'mobile-yoyo-boss-urge-only-dark',
          selector: '[data-testid="mobile-task-single-action"]',
          minRatio: 4.5,
        })
        const darkSubmitMetrics = await actionScreen
          .getByRole('button', { name: '确认催办', exact: true })
          .evaluate((button) => {
            const buttonRect = button.getBoundingClientRect()
            const screenRect = button
              .closest('[data-testid="mobile-task-action-screen"]')
              ?.getBoundingClientRect()
            const textElement = button.querySelector('span:not(.anticon)')
            const textRect = textElement?.getBoundingClientRect() || null
            return {
              actionScreenWidth: screenRect?.width || 0,
              buttonRect: {
                bottom: buttonRect.bottom,
                left: buttonRect.left,
                right: buttonRect.right,
                top: buttonRect.top,
                width: buttonRect.width,
              },
              clientHeight: button.clientHeight,
              clientWidth: button.clientWidth,
              scrollHeight: button.scrollHeight,
              scrollWidth: button.scrollWidth,
              text: button.innerText.trim(),
              textRect: textRect
                ? {
                    bottom: textRect.bottom,
                    left: textRect.left,
                    right: textRect.right,
                    top: textRect.top,
                    width: textRect.width,
                  }
                : null,
            }
          })
        assert(
          darkSubmitMetrics.text === '确认催办' &&
            darkSubmitMetrics.buttonRect.width >=
              darkSubmitMetrics.actionScreenWidth - 24 - 1 &&
            darkSubmitMetrics.scrollWidth <= darkSubmitMetrics.clientWidth &&
            darkSubmitMetrics.scrollHeight <= darkSubmitMetrics.clientHeight &&
            darkSubmitMetrics.textRect?.width >= 56 &&
            darkSubmitMetrics.textRect.left >=
              darkSubmitMetrics.buttonRect.left - 1 &&
            darkSubmitMetrics.textRect.right <=
              darkSubmitMetrics.buttonRect.right + 1 &&
            darkSubmitMetrics.textRect.top >=
              darkSubmitMetrics.buttonRect.top - 1 &&
            darkSubmitMetrics.textRect.bottom <=
              darkSubmitMetrics.buttonRect.bottom + 1,
          `深色模式不能截断真正的催办命令文案: ${JSON.stringify(darkSubmitMetrics)}`
        )
        await page.waitForTimeout(100)
        await page.screenshot({
          path: path.join(
            outputDir,
            'mobile-yoyo-boss-urge-only-action-dark-390.png'
          ),
        })
        await page.evaluate(() => {
          document.documentElement.setAttribute('data-erp-theme', 'light')
        })

        let urgeTaskCalls = 0
        page.on('request', (request) => {
          if (!new URL(request.url()).pathname.endsWith('/rpc/workflow')) return
          if (request.postDataJSON()?.method === 'urge_task') urgeTaskCalls += 1
        })
        const confirmButton = actionScreen.getByRole('button', {
          name: '确认催办',
          exact: true,
        })
        await confirmButton.click()
        await expectText(page, '催办原因为必填项')
        assert.equal(urgeTaskCalls, 0, '催办原因缺失时不得发送催办请求')
        const reasonInput = actionScreen.getByLabel('催办原因')
        assert.equal(
          await reasonInput.evaluate((node) => document.activeElement === node),
          true,
          '催办原因缺失时应聚焦对应输入框'
        )
        await reasonInput.fill('请在今天下班前补齐工程关键资料')
        await confirmButton.click()
        const receiptScreen = page.getByTestId('mobile-task-receipt-screen')
        await receiptScreen.waitFor({ state: 'visible', timeout: 10_000 })
        const receiptText = (await receiptScreen.innerText())
          .replace(/\s+/g, ' ')
          .trim()
        assert(
          receiptText.includes('任务办理已确认'),
          `催办回执未确认: ${JSON.stringify({ receiptText, urgeTaskCalls })}`
        )
        await expectText(page, '催办')
        assert.equal(urgeTaskCalls, 1, '确认催办只应发送一次 urge_task 请求')

        const taskAfterUrge = await page.evaluate(async (taskSourceID) => {
          const response = await fetch('/rpc/workflow', {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 'mobile-yoyo-boss-urge-only-after',
              method: 'list_tasks',
              params: { source_id: taskSourceID, limit: 10 },
            }),
          })
          const payload = await response.json()
          const task = payload?.result?.data?.tasks?.[0]
          return task
            ? {
                statusKey: task.task_status_key,
                urgeCount: task.payload?.urge_count || 0,
                lastUrgeReason: task.payload?.last_urge_reason || '',
              }
            : null
        }, sourceID)
        assert.deepEqual(
          taskAfterUrge,
          {
            statusKey: 'ready',
            urgeCount: 1,
            lastUrgeReason: '请在今天下班前补齐工程关键资料',
          },
          '催办只能记录催办事实，不能替责任岗位完成任务'
        )
      },
    },
    {
      name: 'mobile-yoyo-role-task-readonly-actions',
      path: '/m/engineering/tasks',
      auth: 'admin',
      customerKey: 'yoyoosun',
      effectiveSession: {
        configRevision: 'style-l1-mobile-yoyo-role-task-readonly-actions',
        configHash: 'style-l1-mobile-yoyo-role-task-readonly-actions-hash',
        customer: { key: 'yoyoosun', name: '永绅' },
        pages: [],
        actions: [
          'mobile.engineering.access',
          'workflow.task.create',
          'workflow.task.read',
        ],
        workflow_visible_owner_role_keys_by_capability: {
          'workflow.task.read': ['engineering'],
        },
        fieldPolicies: {},
        workPools: [],
        source: 'active_customer_config_revision',
      },
      adminProfile: {
        username: 'style-l1-yoyo-engineering-readonly',
        is_super_admin: false,
        roles: [{ role_key: 'engineering', name: '工程' }],
        permissions: [
          'mobile.engineering.access',
          'workflow.task.create',
          'workflow.task.read',
          'workflow.task.update',
          'workflow.task.complete',
        ],
        menus: [],
      },
      viewport: { width: 430, height: 900 },
      verify: async (page) => {
        await page.evaluate(async () => {
          const response = await fetch('/rpc/workflow', {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 'mobile-role-readonly-engineering',
              method: 'create_task',
              params: {
                task_code: 'STYLE-L1-YOYO-ENGINEERING-READONLY',
                task_group: 'project-orders',
                task_name: '工程资料只读核对任务',
                source_type: 'project-orders',
                source_id: 12_100,
                source_no: 'YOYO-ENGINEERING-READONLY',
                business_status_key: 'project_pending',
                task_status_key: 'ready',
                owner_role_key: 'engineering',
                priority: 1,
                payload: { due_date: '2026-07-16' },
              },
            }),
          })
          const payload = await response.json()
          if (!response.ok || payload?.result?.code !== 0) {
            throw new Error(`create_task failed: ${JSON.stringify(payload)}`)
          }
        })
        await page.reload({ waitUntil: 'domcontentloaded' })
        await expectText(page, '工程资料只读核对任务')
        await page
          .locator('.erp-mobile-list-item')
          .filter({ hasText: '工程资料只读核对任务' })
          .click()
        const readonlyDiagnostic = await page.evaluate(async (taskName) => {
          const call = async (method, params = {}) => {
            const response = await fetch('/rpc/workflow', {
              method: 'POST',
              headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: `mobile-readonly-diagnostic-${method}`,
                method,
                params,
              }),
            })
            return response.json()
          }
          const taskPayload = await call('list_tasks', { limit: 200 })
          const selected = (taskPayload?.result?.data?.tasks || []).find(
            (task) => task.task_name === taskName
          )
          const actionAccessPayload = selected
            ? await call('explain_action_access', { task_id: selected.id })
            : null
          return {
            task: selected
              ? {
                  id: selected.id,
                  ownerRoleKey: selected.owner_role_key,
                  statusKey: selected.task_status_key,
                }
              : null,
            actions: actionAccessPayload?.result?.data?.actions || [],
          }
        }, '工程资料只读核对任务')
        const deniedReasons = [
          ...new Set(
            readonlyDiagnostic.actions
              .filter((action) => action.allowed !== true && action.reason)
              .map((action) => action.reason)
          ),
        ]
        assert(
          deniedReasons.length > 0,
          `只读岗位应由后端返回不可执行原因: ${JSON.stringify(readonlyDiagnostic)}`
        )
        const guidance = page.getByTestId('mobile-role-action-guidance')
        await guidance.waitFor({ state: 'visible', timeout: 10_000 })
        const guidanceText = (await guidance.textContent())
          ?.replace(/\s+/g, ' ')
          .trim()
        assert(
          deniedReasons.some((reason) => guidanceText?.includes(reason)),
          `只读详情应展示后端动作说明，不应绑定前端固定句: ${JSON.stringify({
            guidanceText,
            readonlyDiagnostic,
          })}`
        )
        assert.equal(
          await page
            .getByTestId('mobile-task-detail-screen')
            .getByRole('button', { name: '返回列表', exact: true })
            .count(),
          0,
          'effective-session 只读详情应使用顶部返回，不再重复底部返回列表'
        )
        assert.equal(
          await page
            .locator('[data-step-key="process"]')
            .getAttribute('data-state'),
          'locked',
          'effective-session 只读详情的处理步骤应保持锁定'
        )
        const factGridMetrics = await page.evaluate(() => {
          const grid = document.querySelector('.mobile-role-detail-fact-grid')
          const rows = Array.from(
            grid?.querySelectorAll('.mobile-role-detail-fact-row') || []
          )
          const gridRect = grid?.getBoundingClientRect()
          const lastRowRect = rows.at(-1)?.getBoundingClientRect()
          return {
            rowCount: rows.length,
            gridWidth: gridRect?.width || 0,
            lastRowWidth: lastRowRect?.width || 0,
          }
        })
        assert(
          factGridMetrics.rowCount === 1 &&
            factGridMetrics.lastRowWidth >= factGridMetrics.gridWidth - 2,
          `只读详情的单个业务字段不应留下半格空白: ${JSON.stringify(factGridMetrics)}`
        )
        await page.screenshot({
          path: path.join(
            outputDir,
            'mobile-yoyo-engineering-readonly-actions.png'
          ),
          fullPage: true,
        })
      },
    },
    {
      name: 'mobile-tasks-dark',
      path: '/m/sales/tasks?__style_l1_workflow_list_delay=1300',
      auth: 'admin',
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        configRevision: 'style-l1-mobile-tasks-dark',
        actions: [
          'mobile.boss.access',
          'mobile.sales.access',
          'workflow.task.create',
          'workflow.task.read',
          'workflow.task.update',
          'workflow.task.complete',
          'workflow.task.reject',
          'workflow.task.approve',
        ],
        workflow_visible_owner_role_keys_by_capability: {
          'workflow.task.read': ['sales', 'boss'],
          'workflow.task.update': ['sales', 'boss'],
          'workflow.task.complete': ['sales', 'boss'],
          'workflow.task.reject': ['sales', 'boss'],
          'workflow.task.approve': ['sales', 'boss'],
        },
      },
      themeMode: 'dark',
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        await assertMobileTaskInitialSkeleton(page, {
          scenarioName: 'mobile-tasks-dark',
        })
        await page.evaluate(async () => {
          const createTask = async (params) => {
            const desiredStatusKey = params.task_status_key || 'ready'
            const blockedReason = params.blocked_reason || ''
            const createParams = {
              ...params,
              task_status_key: 'ready',
            }
            delete createParams.blocked_reason
            const response = await fetch('/rpc/workflow', {
              method: 'POST',
              headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: params.task_code,
                method: 'create_task',
                params: createParams,
              }),
            })
            const payload = await response.json()
            if (!response.ok || payload?.result?.code !== 0) {
              throw new Error(`create_task failed: ${JSON.stringify(payload)}`)
            }
            const task = payload.result.data?.task || null
            if (!task || desiredStatusKey === 'ready') return task
            const operationByStatus = {
              blocked: { method: 'block_task_action', actionKey: 'block' },
              done: { method: 'complete_task_action', actionKey: 'complete' },
            }
            const operation = operationByStatus[desiredStatusKey]
            if (!operation) {
              throw new Error(`unsupported seeded status: ${desiredStatusKey}`)
            }
            const mutationResponse = await fetch('/rpc/workflow', {
              method: 'POST',
              headers: {
                Accept: 'application/json',
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: `${params.task_code}-${operation.actionKey}`,
                method: operation.method,
                params: {
                  task_id: task.id,
                  expected_version: task.version,
                  idempotency_key: `style-l1-seed-${operation.actionKey}-${task.id}`,
                  action_key: operation.actionKey,
                  ...(desiredStatusKey === 'blocked'
                    ? { reason: blockedReason }
                    : {}),
                },
              }),
            })
            const mutationPayload = await mutationResponse.json()
            if (!mutationResponse.ok || mutationPayload?.result?.code !== 0) {
              throw new Error(
                `${operation.method} failed: ${JSON.stringify(mutationPayload)}`
              )
            }
            return mutationPayload.result.data?.task || null
          }

          await Promise.all(
            Array.from({ length: 30 }, (_, index) =>
              createTask({
                task_code: `STYLE-L1-MOBILE-SPARSE-OVERDUE-${String(index + 1).padStart(2, '0')}`,
                task_group: 'project-orders',
                task_name: `稀疏超时任务 ${index + 1}`,
                source_type: 'project-orders',
                source_id: 9050 + index,
                source_no: `STYLE-L1-SPARSE-OVERDUE-${String(index + 1).padStart(2, '0')}`,
                business_status_key: 'project_pending',
                task_status_key: 'ready',
                owner_role_key: 'sales',
                priority: 1,
                due_at: 1780272000,
                payload: {
                  customer_name: `稀疏超时客户 ${index + 1}`,
                  style_no: `SPARSE-OVERDUE-${index + 1}`,
                  due_date: '2026-06-01',
                },
              })
            )
          )

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
            ...Array.from({ length: 120 }, (_, index) => ({
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
            task_status_key: 'ready',
            owner_role_key: 'sales',
            priority: 9,
            payload: {
              critical_path: true,
              material_shortage: true,
              customer_name: '暗色客户',
              style_no: '深色测试款',
              due_date: '2026-06-06',
              mobile_action_evidence_refs: [
                '上一班次处理线索：成品照片已上传，并完成现场交接核对',
              ],
            },
          })
          await createTask({
            task_code: 'STYLE-L1-MOBILE-APPROVAL-001',
            task_group: 'project-orders',
            task_name: '暗色审批验证',
            source_type: 'project-orders',
            source_id: 9002,
            source_no: 'STYLE-L1-MOBILE-APPROVAL-001',
            business_status_key: 'project_pending',
            task_status_key: 'ready',
            owner_role_key: 'sales',
            required_capability_key: 'workflow.task.approve',
            priority: 8,
            payload: {
              customer_name: '暗色审批客户',
              style_no: '深色审批款',
              due_date: '2026-06-06',
            },
          })
        })
        const initialTodoResponsePromise = page.waitForResponse(
          (response) => {
            if (!response.url().includes('/rpc/workflow')) return false
            try {
              const body = response.request().postDataJSON() || {}
              return (
                body.method === 'list_role_tasks' &&
                body.params?.view_key === 'todo' &&
                !String(body.params?.cursor || '').trim()
              )
            } catch {
              return false
            }
          },
          { timeout: 10_000 }
        )
        await page.reload({ waitUntil: 'domcontentloaded' })
        await page.getByTestId('mobile-role-nav-todo').click()
        await page.waitForFunction(() => {
          const heading = document.querySelector('.mobile-role-tasks-page h1')
          return heading?.textContent?.trim() === '待办'
        })
        await page.waitForFunction(
          () =>
            document
              .querySelector('[data-testid="mobile-role-scroll"]')
              ?.getAttribute('aria-busy') === 'false',
          undefined,
          { timeout: 10_000 }
        )
        const initialTodoPayload = await (
          await initialTodoResponsePromise
        ).json()
        const initialTodoCounts = initialTodoPayload?.result?.data?.counts
        const initialFilterCountMetrics = await page.evaluate(() => ({
          renderedTaskCount: document.querySelectorAll('.erp-mobile-list-item')
            .length,
          counts: Object.fromEntries(
            ['all', 'approval', 'risk', 'overdue'].map((key) => {
              const button = document.querySelector(
                `[data-testid="mobile-role-filter-${key}"]`
              )
              return [
                key,
                Number(
                  button
                    ?.querySelector('.mobile-role-task-filter__count')
                    ?.textContent?.trim()
                ),
              ]
            })
          ),
          ariaLabels: Object.fromEntries(
            ['all', 'approval', 'risk', 'overdue'].map((key) => [
              key,
              document
                .querySelector(`[data-testid="mobile-role-filter-${key}"]`)
                ?.getAttribute('aria-label') || '',
            ])
          ),
        }))
        assert.deepEqual(initialFilterCountMetrics.counts, {
          all: initialTodoCounts?.todo,
          approval: initialTodoCounts?.approval,
          risk: initialTodoCounts?.risk,
          overdue: initialTodoCounts?.overdue,
        })
        assert(
          initialFilterCountMetrics.counts.all >
            initialFilterCountMetrics.renderedTaskCount &&
            Object.values(initialFilterCountMetrics.ariaLabels).every((label) =>
              label.includes('共 ')
            ),
          `移动岗位页首屏应直接显示服务端全量计数，不能使用首批 DOM 数量: ${JSON.stringify({ initialTodoCounts, initialFilterCountMetrics })}`
        )
        await page.screenshot({
          path: path.resolve(
            outputDir,
            'mobile-tasks-initial-filter-counts-dark.png'
          ),
          fullPage: true,
        })
        const todoUI = await page.evaluate(() => ({
          heading:
            document
              .querySelector('.mobile-role-tasks-page h1')
              ?.textContent?.trim() || '',
          items: Array.from(
            document.querySelectorAll('.erp-mobile-list-item')
          ).map((item) => item.textContent?.replace(/\s+/g, ' ').trim() || ''),
          loadError:
            document
              .querySelector('.mobile-role-load-error')
              ?.textContent?.replace(/\s+/g, ' ')
              .trim() || '',
        }))
        assert(
          todoUI.items.some((item) => item.includes('暗色任务验证')),
          `移动岗位待办投影未渲染到页面: ${JSON.stringify(todoUI)}`
        )
        const approvalFilter = page.getByTestId('mobile-role-filter-approval')
        await approvalFilter.waitFor({ state: 'visible', timeout: 10_000 })
        const approvalFilterMetrics = await page.evaluate(() => ({
          labels: Array.from(
            document.querySelectorAll('.mobile-role-task-filter__label')
          ).map((label) => label.textContent?.trim() || ''),
          approvalAriaLabel:
            document
              .querySelector('[data-testid="mobile-role-filter-approval"]')
              ?.getAttribute('aria-label') || '',
          standaloneApprovalCopy:
            document.body?.innerText?.includes('当前岗位的审批事项') || false,
          mineCount: document.querySelectorAll(
            '[data-testid="mobile-role-filter-mine"]'
          ).length,
        }))
        assert(
          JSON.stringify(approvalFilterMetrics.labels) ===
            JSON.stringify(['全部', '审批', '跨岗风险', '超时']) &&
            approvalFilterMetrics.approvalAriaLabel.includes('待我审批') &&
            !approvalFilterMetrics.standaloneApprovalCopy &&
            approvalFilterMetrics.mineCount === 0,
          `有审批和监督权限的 390px 岗位页应显示审批与跨岗风险并移除我负责: ${JSON.stringify(
            approvalFilterMetrics
          )}`
        )
        assert.equal(
          await page.locator('[data-testid^="mobile-role-nav-"]').count(),
          4,
          '移动端增加待我审批筛选后仍应只保留 4 个底栏入口'
        )
        const roleTaskViewRequests = []
        const captureRoleTaskViewRequest = (request) => {
          if (!request.url().includes('/rpc/workflow')) return
          let body
          try {
            body = request.postDataJSON()
          } catch {
            return
          }
          if (
            !['list_role_tasks', 'list_workbench_role_tasks'].includes(
              body?.method
            )
          ) {
            return
          }
          roleTaskViewRequests.push({
            method: body.method,
            viewKey: String(body.params?.view_key || ''),
          })
        }
        page.on('request', captureRoleTaskViewRequest)
        await page.evaluate(() => {
          window.__styleL1MobileTaskFilterMarker =
            'mobile-task-filter-local-loading'
          window.__styleL1MobileTaskFilterIdentity = {
            bottomNav: document.querySelector(
              '[data-testid="mobile-role-bottom-nav"]'
            ),
            filters: document.querySelector(
              '[data-testid="mobile-role-task-filters"]'
            ),
            historyLength: window.history.length,
            navigationEntryCount:
              performance.getEntriesByType('navigation').length,
            search: document.querySelector('.mobile-role-task-search'),
            path: `${window.location.pathname}${window.location.search}`,
          }
        })
        await approvalFilter.click()
        const approvalLoading = page.getByTestId(
          'mobile-role-task-list-loading'
        )
        await approvalLoading.waitFor({ state: 'visible', timeout: 10_000 })
        const approvalLoadingMetrics = await page.evaluate(() => {
          const identity = window.__styleL1MobileTaskFilterIdentity || {}
          const search = document.querySelector('.mobile-role-task-search')
          const filters = document.querySelector(
            '[data-testid="mobile-role-task-filters"]'
          )
          const bottomNav = document.querySelector(
            '[data-testid="mobile-role-bottom-nav"]'
          )
          const scroll = document.querySelector(
            '[data-testid="mobile-role-scroll"]'
          )
          const taskList = document.querySelector(
            '[data-testid="mobile-role-task-list"]'
          )
          const loading = document.querySelector(
            '[data-testid="mobile-role-task-list-loading"]'
          )
          return {
            activeFilter: document
              .querySelector('[data-testid="mobile-role-filter-approval"]')
              ?.getAttribute('aria-pressed'),
            bottomNavConnected: identity.bottomNav?.isConnected === true,
            bottomNavStable: identity.bottomNav === bottomNav,
            filtersConnected: identity.filters?.isConnected === true,
            filtersStable: identity.filters === filters,
            fullSkeletonCount: document.querySelectorAll(
              '[data-testid="mobile-role-task-skeleton"]'
            ).length,
            globalBusy: scroll?.getAttribute('aria-busy') || '',
            historyLengthStable:
              identity.historyLength === window.history.length,
            listBusy: taskList?.getAttribute('aria-busy') || '',
            loadingInsideList: loading?.parentElement === taskList,
            loadingText:
              loading?.textContent?.replace(/\s+/g, ' ').trim() || '',
            markerStable:
              window.__styleL1MobileTaskFilterMarker ===
              'mobile-task-filter-local-loading',
            navigationEntryCountStable:
              identity.navigationEntryCount ===
              performance.getEntriesByType('navigation').length,
            searchConnected: identity.search?.isConnected === true,
            searchStable: identity.search === search,
            pathStable:
              identity.path ===
              `${window.location.pathname}${window.location.search}`,
          }
        })
        assert(
          approvalLoadingMetrics.activeFilter === 'true' &&
            approvalLoadingMetrics.bottomNavConnected &&
            approvalLoadingMetrics.bottomNavStable &&
            approvalLoadingMetrics.filtersConnected &&
            approvalLoadingMetrics.filtersStable &&
            approvalLoadingMetrics.fullSkeletonCount === 0 &&
            approvalLoadingMetrics.globalBusy === 'false' &&
            approvalLoadingMetrics.historyLengthStable &&
            approvalLoadingMetrics.listBusy === 'true' &&
            approvalLoadingMetrics.loadingInsideList &&
            approvalLoadingMetrics.loadingText === '正在加载审批任务' &&
            approvalLoadingMetrics.markerStable &&
            approvalLoadingMetrics.navigationEntryCountStable &&
            approvalLoadingMetrics.searchConnected &&
            approvalLoadingMetrics.searchStable &&
            approvalLoadingMetrics.pathStable,
          `移动筛选冷加载只能替换列表区域，不能刷新整页或重建稳定区域: ${JSON.stringify(
            approvalLoadingMetrics
          )}`
        )
        assert.equal(
          roleTaskViewRequests.filter(({ viewKey }) => viewKey === 'approval')
            .length,
          1,
          `首次切换审批筛选应且只应发起一个审批视图请求: ${JSON.stringify(
            roleTaskViewRequests
          )}`
        )
        await page.screenshot({
          path: path.resolve(
            outputDir,
            'mobile-tasks-approval-loading-dark.png'
          ),
          fullPage: true,
        })
        await page.waitForFunction(
          () =>
            [...document.querySelectorAll('.erp-mobile-list-item')].some(
              (item) => item.textContent?.includes('暗色审批验证')
            ),
          undefined,
          { timeout: 10_000 }
        )
        assert.equal(
          await approvalFilter.getAttribute('aria-pressed'),
          'true',
          '移动端待我审批筛选应进入选中态'
        )
        assert.equal(
          await page
            .getByTestId('mobile-role-task-list')
            .getAttribute('aria-busy'),
          'false',
          '审批视图完成后应只解除任务列表忙碌态'
        )
        await page.screenshot({
          path: path.resolve(outputDir, 'mobile-tasks-approval-dark.png'),
          fullPage: true,
        })
        await page.getByTestId('mobile-role-filter-all').click()
        await page.waitForFunction(
          () =>
            document
              .querySelector('[data-testid="mobile-role-filter-all"]')
              ?.getAttribute('aria-pressed') === 'true',
          undefined,
          { timeout: 10_000 }
        )
        await page.waitForTimeout(100)
        assert.equal(
          roleTaskViewRequests.filter(({ viewKey }) => viewKey === 'todo')
            .length,
          0,
          `切回已加载的全部筛选应复用缓存，不应重复请求 todo 视图: ${JSON.stringify(
            roleTaskViewRequests
          )}`
        )
        page.off('request', captureRoleTaskViewRequest)
        await expectText(page, '阻塞原因')
        const blockedTaskItem = page
          .locator('.erp-mobile-list-item')
          .filter({ hasText: '阻塞原因' })
          .first()
        await clickTaskCardContent(
          blockedTaskItem,
          blockedTaskItem.locator('.mobile-task-list-row__head')
        )
        await page
          .getByTestId('mobile-task-detail-screen')
          .waitFor({ state: 'visible', timeout: 10_000 })
        await expectText(page, '请联系 业务岗位，确认卡点和恢复条件。')
        const mobileContactRoleMetrics = await page
          .locator('.mobile-task-exception-contact__role')
          .first()
          .evaluate((node) => {
            const contactStyle = node.parentElement
              ? getComputedStyle(node.parentElement)
              : null
            const roleStyle = getComputedStyle(node)
            return {
              contactColor: contactStyle?.color || '',
              contactWeight: Number(contactStyle?.fontWeight || 0),
              roleColor: roleStyle.color,
              roleWeight: Number(roleStyle.fontWeight || 0),
              text: node.textContent?.trim() || '',
            }
          })
        assert(
          mobileContactRoleMetrics.roleWeight >= 800 &&
            mobileContactRoleMetrics.roleWeight >
              mobileContactRoleMetrics.contactWeight &&
            mobileContactRoleMetrics.roleColor !==
              mobileContactRoleMetrics.contactColor &&
            mobileContactRoleMetrics.text === '业务岗位',
          `移动端应以字重和同色系对比突出联系岗位: ${JSON.stringify(
            mobileContactRoleMetrics
          )}`
        )
        const mobileEventMeta = page
          .getByTestId('workflow-task-event-trail')
          .locator('.workflow-task-event-trail__meta')
          .first()
        await mobileEventMeta.waitFor({ state: 'visible', timeout: 10_000 })
        const mobileEventMetaMetrics = await mobileEventMeta.evaluate(
          (node) => {
            const actorName = node.querySelector(
              '.workflow-task-event-trail__actor-name'
            )
            const actorRole = node.querySelector(
              '.workflow-task-event-trail__actor-role'
            )
            const eventTime = node.querySelector(
              '.workflow-task-event-trail__meta-time'
            )
            const eventVersion = node.querySelector(
              '.workflow-task-event-trail__meta-version'
            )
            return {
              actorNameText: actorName?.textContent?.trim() || '',
              actorRoleText: actorRole?.textContent?.trim() || '',
              actorNameWeight: Number(
                actorName ? getComputedStyle(actorName).fontWeight : 0
              ),
              actorRoleWeight: Number(
                actorRole ? getComputedStyle(actorRole).fontWeight : 0
              ),
              timeWeight: Number(
                eventTime ? getComputedStyle(eventTime).fontWeight : 0
              ),
              versionWeight: Number(
                eventVersion ? getComputedStyle(eventVersion).fontWeight : 0
              ),
            }
          }
        )
        assert(
          mobileEventMetaMetrics.actorNameText &&
            mobileEventMetaMetrics.actorRoleText &&
            mobileEventMetaMetrics.actorNameWeight >= 500 &&
            mobileEventMetaMetrics.actorRoleWeight <= 400 &&
            mobileEventMetaMetrics.timeWeight <= 400 &&
            mobileEventMetaMetrics.versionWeight <= 400,
          `历史记录只应轻微突出经办人，岗位、时间和版本保持次要: ${JSON.stringify(
            mobileEventMetaMetrics
          )}`
        )
        assert.equal(
          await page
            .getByTestId('mobile-task-exception-contact')
            .getByText('异常处理：', { exact: true })
            .count(),
          0,
          '移动端紧凑异常区不应重复“异常处理”前缀'
        )
        assert.equal(
          await page.locator('.mobile-role-detail-risk').count(),
          1,
          '阻塞原因和异常处理应合并为一个紧凑区域'
        )
        await page.getByTestId('mobile-task-detail-screen').screenshot({
          path: path.resolve(
            outputDir,
            'mobile-tasks-dark-blocked-contact.png'
          ),
        })
        await page.getByTestId('workflow-task-event-trail').screenshot({
          path: path.resolve(
            outputDir,
            'mobile-tasks-dark-task-event-history.png'
          ),
        })
        await page.getByLabel('返回任务列表').click()
        await page.waitForFunction(() => {
          const heading = document.querySelector('.mobile-role-tasks-page h1')
          return heading?.textContent?.trim() === '待办'
        })
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
      path: '/m/sales/tasks',
      auth: 'admin',
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        configRevision: 'style-l1-mobile-task-browser-back',
        actions: [
          'mobile.sales.access',
          'workflow.task.create',
          'workflow.task.read',
          'workflow.task.update',
          'workflow.task.complete',
        ],
        workflow_visible_owner_role_keys_by_capability: {
          'workflow.task.read': ['sales'],
          'workflow.task.update': ['sales'],
          'workflow.task.complete': ['sales'],
        },
      },
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        const taskName = '浏览器返回栈验证任务'
        const createdTask = await page.evaluate(async (name) => {
          const response = await fetch('/rpc/workflow', {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 'mobile-task-browser-back-create',
              method: 'create_task',
              params: {
                task_code: 'STYLE-L1-MOBILE-BROWSER-BACK',
                task_group: 'sales-orders',
                task_name: name,
                source_type: 'sales-orders',
                source_id: 12_200,
                source_no: 'YOYO-MOBILE-BROWSER-BACK',
                business_status_key: 'project_pending',
                task_status_key: 'ready',
                owner_role_key: 'sales',
                priority: 1,
                payload: { due_date: '2026-07-19' },
              },
            }),
          })
          const payload = await response.json()
          if (!response.ok || payload?.result?.code !== 0) {
            throw new Error(`create_task failed: ${JSON.stringify(payload)}`)
          }
          return payload.result.data?.task || null
        }, taskName)
        assert(
          createdTask?.id && createdTask?.version,
          `浏览器返回栈场景未取得任务快照: ${JSON.stringify(createdTask)}`
        )
        await page.reload({ waitUntil: 'domcontentloaded' })
        await page.waitForFunction(
          () =>
            document
              .querySelector('[data-testid="mobile-role-scroll"]')
              ?.getAttribute('aria-busy') === 'false',
          undefined,
          { timeout: 10_000 }
        )
        const taskRow = page
          .locator('.erp-mobile-list-item')
          .filter({ hasText: taskName })
          .first()
        await taskRow.waitFor({ state: 'visible', timeout: 10_000 })
        await taskRow.click()
        await expectText(page, taskName)
        const processFlowStep = page
          .getByTestId('mobile-task-flow-steps')
          .getByRole('button', { name: '处理任务', exact: true })
        await processFlowStep.waitFor({ state: 'visible', timeout: 10_000 })
        const processButton = page
          .locator('.mobile-role-action-bar')
          .getByRole('button', { name: '处理任务', exact: true })
        await processButton.waitFor({ state: 'visible', timeout: 10_000 })
        await processButton.click()
        await page
          .getByTestId('mobile-task-action-screen')
          .waitFor({ state: 'visible', timeout: 10_000 })
        await expectText(page, '选择处理方式')

        await page.goBack()
        await waitForPath(page, '/m/sales/tasks')
        await page.waitForFunction(
          () =>
            Boolean(
              document.querySelector('.mobile-role-tasks-page--detail')
            ) &&
            !document.querySelector(
              '[data-testid="mobile-task-action-screen"]'
            ) &&
            !document.querySelector('.erp-admin-sider'),
          null,
          { timeout: 10_000 }
        )
        await expectText(page, taskName)
        await processButton.waitFor({ state: 'visible', timeout: 10_000 })
        const detailMetrics = await page.evaluate(() => ({
          path: window.location.pathname,
          hasDesktopShell: Boolean(document.querySelector('.erp-admin-sider')),
          hasMobileShell: Boolean(
            document.querySelector('.mobile-role-tasks-page')
          ),
          hasDetail: Boolean(
            document.querySelector('.mobile-role-tasks-page--detail')
          ),
          hasAction: Boolean(
            document.querySelector('[data-testid="mobile-task-action-screen"]')
          ),
          historyScreen: window.history.state?.mobileRoleTasksScreen || '',
        }))

        assert.equal(
          detailMetrics.path,
          '/m/sales/tasks',
          `处理页后退不应离开岗位任务端: ${JSON.stringify(detailMetrics)}`
        )
        assert.equal(
          detailMetrics.hasDesktopShell,
          false,
          `处理页后退不应渲染桌面后台壳层: ${JSON.stringify(detailMetrics)}`
        )
        assert(
          detailMetrics.hasMobileShell &&
            detailMetrics.hasDetail &&
            !detailMetrics.hasAction,
          `处理页后退应回到同一任务详情: ${JSON.stringify(detailMetrics)}`
        )

        await page.goBack()
        await waitForPath(page, '/m/sales/tasks')
        await page.waitForFunction(
          (name) => {
            const heading = document.querySelector('.mobile-role-tasks-page h1')
            const rows = Array.from(
              document.querySelectorAll('.erp-mobile-list-item')
            )
            return (
              heading?.textContent?.trim() === '待办' &&
              rows.some((row) => row.textContent?.includes(name)) &&
              !document.querySelector('.mobile-role-tasks-page--detail') &&
              !document.querySelector('.erp-admin-sider')
            )
          },
          taskName,
          { timeout: 10_000 }
        )
        const listMetrics = await page.evaluate(() => ({
          path: window.location.pathname,
          heading:
            document
              .querySelector('.mobile-role-tasks-page h1')
              ?.textContent?.trim() || '',
          hasDesktopShell: Boolean(document.querySelector('.erp-admin-sider')),
          hasMobileShell: Boolean(
            document.querySelector('.mobile-role-tasks-page')
          ),
          hasDetail: Boolean(
            document.querySelector('.mobile-role-tasks-page--detail')
          ),
        }))
        assert(
          listMetrics.path === '/m/sales/tasks' &&
            listMetrics.heading === '待办' &&
            !listMetrics.hasDesktopShell &&
            listMetrics.hasMobileShell &&
            !listMetrics.hasDetail,
          `详情页后退应回到移动端待办列表，不应由 remembered entry 劫持: ${JSON.stringify(listMetrics)}`
        )

        await taskRow.click()
        await processButton.waitFor({ state: 'visible', timeout: 10_000 })
        await processButton.click()
        await page
          .getByTestId('mobile-task-action-screen')
          .waitFor({ state: 'visible', timeout: 10_000 })
        await page.evaluate(async (task) => {
          const response = await fetch('/rpc/workflow', {
            method: 'POST',
            headers: {
              Accept: 'application/json',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              jsonrpc: '2.0',
              id: 'mobile-task-browser-back-complete-externally',
              method: 'complete_task_action',
              params: {
                task_id: task.id,
                expected_version: task.version,
                idempotency_key: `style-l1-browser-back-complete-${task.id}`,
                action_key: 'complete',
                reason: '模拟其它终端已完成',
                payload: {},
              },
            }),
          })
          const payload = await response.json()
          if (!response.ok || payload?.result?.code !== 0) {
            throw new Error(
              `complete_task_action failed: ${JSON.stringify(payload)}`
            )
          }
        }, createdTask)
        await page.reload({ waitUntil: 'domcontentloaded' })
        await page.getByTestId('mobile-role-bottom-nav').waitFor({
          state: 'visible',
          timeout: 10_000,
        })
        await page.waitForFunction(
          (name) => {
            const heading = document.querySelector('.mobile-role-tasks-page h1')
            return (
              heading?.textContent?.trim() === '待办' &&
              !document.querySelector('.mobile-role-tasks-page--detail') &&
              !document.body.textContent?.includes(name)
            )
          },
          taskName,
          { timeout: 10_000 }
        )
        const missingTaskHistory = await page.evaluate(() => ({
          screen: window.history.state?.mobileRoleTasksScreen || '',
          depth: Number(window.history.state?.mobileRoleTasksDepth || 0),
          hasDetail: Boolean(
            document.querySelector('.mobile-role-tasks-page--detail')
          ),
          hasAction: Boolean(
            document.querySelector('[data-testid="mobile-task-action-screen"]')
          ),
        }))
        assert.deepEqual(
          missingTaskHistory,
          { screen: '', depth: 0, hasDetail: false, hasAction: false },
          `已被其它终端处理的任务应一次回到真实列表历史项: ${JSON.stringify(missingTaskHistory)}`
        )
      },
    },
    {
      name: 'erp-business-dashboard-mobile',
      path: '/erp/business-dashboard',
      auth: 'admin',
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        actions: ['workflow.task.read'],
      },
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        await expectText(page, '超级管理员')
        await expectText(page, '业务管理')
        await expectText(page, '业务看板')
        await expectText(page, '业务数据')
        await expectText(page, '需要关注')
        await assertTextAbsent(page, '数字说明')
        await assertNoDuplicatedAdminPageTitle(page, {
          scenarioName: 'erp-business-dashboard-mobile',
        })
        await assertDashboardMetricInteractionSemantics(page, {
          scenarioName: 'erp-business-dashboard-mobile',
          expectBusinessAttention: true,
        })
        await assertNoDashboardCenterLocalRefreshButton(page, {
          scenarioName: 'erp-business-dashboard-mobile',
        })
        await page
          .getByRole('button', { name: '查看客户', exact: true })
          .waitFor({ state: 'visible', timeout: 10_000 })
      },
    },
  ]
}
