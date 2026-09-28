import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { RpcErrorCode } from '../../src/common/consts/errorCodes.generated.js'
import { verifyMobileNavigationMotion } from './slidingMotionAssertions.mjs'
import { pullToRefresh } from './mobileGestureAssertions.mjs'
import {
  assertSegmentAffordance,
  assertFilterAffordance,
  assertMobileSearchAffordance,
} from './controlAffordanceAssertions.mjs'
import { progressFixtureData } from './businessProgressFixtures.mjs'
import { assertMobileFilterOutsideDismissal } from './mobileFilterPopoverAssertions.mjs'

async function assertMobileDetailSurface(root, assert) {
  await root.locator('.mobile-task-flow-back').click({ trial: true })
  const geometry = await root.evaluate((node) => {
    const header = node.querySelector('.mobile-task-flow-header')
    const main = node.querySelector('.mobile-detail-content')
    const footer = node.querySelector('.mobile-role-action-bar')
    const title = header?.querySelector('h1')
    const box = (element) => {
      const rect = element?.getBoundingClientRect()
      return rect
        ? {
            top: rect.top,
            bottom: rect.bottom,
            left: rect.left,
            width: rect.width,
          }
        : null
    }
    return {
      header: box(header),
      main: box(main),
      footer: box(footer),
      padding: main ? getComputedStyle(main).paddingLeft : '',
      titleSize: title ? getComputedStyle(title).fontSize : '',
      overflow: main ? main.scrollWidth - main.clientWidth : 0,
      height: window.innerHeight,
      smallTargets: [
        ...node.querySelectorAll(
          '.mobile-task-flow-back, .mobile-role-action-bar button'
        ),
      ]
        .filter((button) => button.getBoundingClientRect().height < 44)
        .map((button) => button.textContent),
    }
  })
  assert.equal(geometry.padding, '12px')
  assert.equal(geometry.titleSize, '18px')
  assert(Math.abs(geometry.header.left) <= 1)
  assert(geometry.main.top >= geometry.header.bottom - 1)
  if (geometry.footer) {
    assert(geometry.main.bottom <= geometry.footer.top + 1)
    assert(geometry.footer.bottom <= geometry.height + 1)
  }
  assert(geometry.overflow <= 1)
  assert.deepEqual(geometry.smallTargets, [])
  return geometry
}

export function createMobileProgressScenarios({
  assert,
  assertNoHorizontalOverflow,
  customerRuntimeEffectiveSession,
  outputDir,
}) {
  return ['boss', 'pmc', 'warehouse'].map((role) => {
    let fail = false
    let failDetail = false
    let longDetail = false
    let failRecent = false
    let failureCode = RpcErrorCode.INTERNAL
    let heldListResponse = null
    const calls = []
    const imageCalls = []
    const allowed = role !== 'warehouse'
    const permissions = [
      `mobile.${role}.access`,
      'workflow.task.read',
      ...(role === 'boss'
        ? ['workflow.task.update', 'workflow.task.complete']
        : []),
      ...(allowed
        ? [
            'erp.business_dashboard.read',
            'sales_order.read',
            'sales_order_item.read',
            'pmc.plan.read',
            'production.wip.read',
            'product.read',
          ]
        : []),
    ]
    return {
      name: `mobile-progress-${role}`,
      path: `/m/${role}/tasks`,
      auth: 'admin',
      customerKey: 'yoyoosun',
      hasTouch: true,
      themeMode: role === 'pmc' ? 'dark' : 'light',
      viewport: { width: role === 'warehouse' ? 360 : 390, height: 844 },
      adminProfile: {
        username: `mobile-progress-${role}`,
        is_super_admin: false,
        roles: [{ role_key: role }],
        permissions,
        menus: [],
      },
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        actions: permissions,
        workflow_visible_owner_role_keys_by_capability: {
          'workflow.task.read': [role],
          ...(role === 'boss'
            ? {
                'workflow.task.update': [role],
                'workflow.task.complete': [role],
              }
            : {}),
        },
      },
      workflowTaskFixtures: [
        {
          id: 100,
          version: 1,
          task_code: 'TASK-0100',
          task_name: '确认面料交期',
          task_group: 'material_check',
          owner_role_key: role,
          task_status_key: 'blocked',
          source_type: 'sales_order',
          source_id: 1,
          source_no: 'SO-0001',
          created_at: 1788840000,
          payload: {},
          block_reason: '面料交期尚未确认',
        },
      ],
      beforeNavigate: async (page) => {
        page.on('pageerror', (error) =>
          console.error('mobile-progress runtime error:', error.message)
        )
        calls.length = 0
        imageCalls.length = 0
        fail = false
        failDetail = false
        longDetail = false
        failRecent = false
        failureCode = RpcErrorCode.INTERNAL
        heldListResponse = null
        await page.route('**/rpc/workflow', async (route) => {
          const { id, method } = route.request().postDataJSON()
          if (method !== 'list_task_events' || !failRecent)
            return route.fallback()
          return route.fulfill({
            json: {
              jsonrpc: '2.0',
              id,
              result: { code: RpcErrorCode.INTERNAL, message: '读取失败' },
            },
          })
        })
        const productImage = await page.evaluate(() => {
          const canvas = document.createElement('canvas')
          canvas.width = 128
          canvas.height = 128
          const context = canvas.getContext('2d')
          context.fillStyle = '#e7f0eb'
          context.fillRect(0, 0, 128, 128)
          context.fillStyle = '#829e8c'
          for (const [x, y, radius] of [
            [38, 36, 22],
            [90, 36, 22],
            [64, 67, 43],
            [64, 111, 29],
          ]) {
            context.beginPath()
            context.arc(x, y, radius, 0, Math.PI * 2)
            context.fill()
          }
          return canvas.toDataURL('image/png').split(',')[1]
        })
        await page.route('**/rpc/attachment', async (route) => {
          const body = route.request().postDataJSON() || {}
          const { id = 'mobile-progress-image', method, params = {} } = body
          if (
            !['list_product_image_references', 'download_attachment'].includes(
              method
            )
          ) {
            return route.fallback()
          }
          imageCalls.push({ method, params })
          const data =
            method === 'list_product_image_references'
              ? {
                  images: (params.product_ids || []).map((productID) => ({
                    product_id: productID,
                    image_attachment_id: 880000 + productID,
                  })),
                }
              : {
                  attachment: {
                    id: Number(params.id),
                    owner_type: 'product',
                    owner_id: Number(params.id) - 880000,
                    mime_type: 'image/png',
                    content_base64: productImage,
                  },
                }
          await route.fulfill({
            json: {
              jsonrpc: '2.0',
              id,
              result: { code: 0, message: '', data },
            },
          })
        })
        await page.route('**/rpc/business', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (!['list_progress', 'get_progress'].includes(method)) {
            return route.fallback()
          }
          calls.push({ method, params })
          if (method === 'list_progress' && heldListResponse) {
            const pending = heldListResponse
            heldListResponse = null
            await pending
          }
          if (params.keyword === '迟到响应') await delay(500)
          const data = progressFixtureData(params, {
            detail: method === 'get_progress',
          })
          if (method === 'get_progress' && longDetail) {
            Object.assign(data.row, {
              product:
                '模拟长名称产品：可拆洗服装与展示底座的周年庆联名毛绒公仔'.repeat(
                  3
                ),
              customer: '模拟客户采购中心与跨区域产品确认负责人',
              attention_reason:
                '模拟异常说明：交期和包装资料仍待责任岗位确认。'.repeat(5),
              product_count: 3,
              ordered_quantity: null,
              shipped_quantity: null,
              completed_quantity: null,
              delivery_known: false,
              unit: '',
            })
          }
          return route.fulfill({
            contentType: 'application/json',
            body: JSON.stringify({
              jsonrpc: '2.0',
              id,
              result:
                fail || (failDetail && method === 'get_progress')
                  ? { code: failureCode, message: '查询失败' }
                  : {
                      code: 0,
                      data,
                    },
            }),
          })
        })
      },
      verify: async (page) => {
        const nav = page.getByTestId('mobile-role-bottom-nav')
        await nav.waitFor({ timeout: 10000 }).catch(async (error) => {
          console.error(await page.locator('body').innerText())
          throw error
        })
        assert.deepEqual(
          await nav
            .getByRole('tab')
            .evaluateAll((items) =>
              items.map(
                (item) => item.getAttribute('aria-label')?.split('，')[0]
              )
            ),
          allowed ? ['进度', '任务', '风险', '我的'] : ['任务', '风险', '我的']
        )
        if (!allowed) {
          assert.equal(calls.length, 0)
          assert.equal(imageCalls.length, 0)
          assert.equal(
            await page.getByTestId('mobile-progress-panel').count(),
            0
          )
          await page
            .getByLabel('任务状态', { exact: true })
            .getByText('已办', { exact: true })
            .click()
          await page.getByText('已办任务', { exact: true }).waitFor()
          await page
            .getByLabel('任务状态', { exact: true })
            .getByText('待办', { exact: true })
            .click()
          await page.getByTestId('mobile-role-nav-messages').click()
          await page.getByTestId('mobile-role-nav-tasks').click()
          await assertNoHorizontalOverflow(page, 'three-tabs')
          await page.screenshot({
            path: path.join(outputDir, 'mobile-progress-three-tabs.png'),
          })
          return
        }
        const panel = page.getByTestId('mobile-progress-panel')
        const prefix = role === 'pmc' ? 'MO' : 'SO'
        await panel
          .getByRole('button', {
            name: `查看 ${prefix}-0001 进度`,
            exact: true,
          })
          .waitFor()
        assert.equal(
          calls[0].params.view,
          role === 'pmc' ? 'production' : 'orders'
        )
        const firstProductImage = panel
          .locator('.mobile-progress-product-image img')
          .first()
        await firstProductImage.waitFor()
        await page.waitForFunction(
          () =>
            document.querySelector(
              '[data-testid="mobile-progress-panel"] .mobile-progress-product-image img'
            )?.naturalWidth > 0
        )
        const productMetrics = await panel
          .locator('.mobile-progress-card')
          .first()
          .evaluate((card) => {
            const summary = card.querySelector(
              '.mobile-progress-product-summary'
            )
            const image = card.querySelector('.erp-task-product-image')
            return {
              summaryHeight: summary.getBoundingClientRect().height,
              imageWidth: image.getBoundingClientRect().width,
              imageHeight: image.getBoundingClientRect().height,
              overflow: card.scrollWidth - card.clientWidth,
            }
          })
        assert(
          productMetrics.summaryHeight <= 72 &&
            Math.abs(productMetrics.imageWidth - 56) < 1 &&
            Math.abs(productMetrics.imageHeight - 56) < 1 &&
            productMetrics.overflow <= 1,
          `产品缩略图应嵌入原信息区且不撑宽卡片：${JSON.stringify(productMetrics)}`
        )
        assert(
          imageCalls.some(
            ({ method, params }) =>
              method === 'list_product_image_references' &&
              params.product_ids?.includes(7)
          ) &&
            imageCalls.some(
              ({ method, params }) =>
                method === 'download_attachment' &&
                params.id === 880007 &&
                params.variant === 'thumbnail'
            ),
          '进度卡应通过产品图片引用和缩略图接口读取首款图片'
        )
        assert.equal(
          await panel
            .locator('.mobile-progress-card')
            .nth(2)
            .locator('.mobile-progress-product-count')
            .textContent(),
          '+2'
        )
        await panel
          .locator('.mobile-progress-card')
          .nth(2)
          .getByText('云朵小熊 等 3 项', { exact: true })
          .waitFor()
        await assertNoHorizontalOverflow(page, role)
        await assertSegmentAffordance(panel.locator('.erp-sliding-segmented'))
        await assertFilterAffordance(
          panel.locator('.mobile-progress-risks button'),
          34
        )
        const controlMetrics = await panel.evaluate((root) => {
          const read = (element, pseudo) => {
            const style = getComputedStyle(element, pseudo)
            const box = element.getBoundingClientRect()
            return {
              text: element.textContent,
              background: style.backgroundColor,
              border: style.borderColor,
              borderWidth: style.borderWidth,
              color: style.color,
              shadow: style.boxShadow,
              width: box.width,
              height: box.height,
              scrollWidth: element.scrollWidth,
              clientWidth: element.clientWidth,
            }
          }
          const segment = root.querySelector('.ant-segmented')
          return {
            segment: read(segment),
            indicator: read(
              segment.querySelector('.ant-segmented-group'),
              '::before'
            ),
            items: [...segment.querySelectorAll('.ant-segmented-item')].map(
              (item) => read(item)
            ),
            chips: [
              ...root.querySelectorAll('.mobile-progress-risks button'),
            ].map((item) => read(item)),
          }
        })
        await writeFile(
          path.join(outputDir, `mobile-progress-${role}-controls.json`),
          JSON.stringify(controlMetrics, null, 2)
        )
        const navBounds = await nav.boundingBox()
        assert(navBounds.y + navBounds.height <= 844)
        const smallTargets = await panel
          .locator('button')
          .evaluateAll((nodes) =>
            nodes
              .filter(
                (node) =>
                  node.offsetParent &&
                  getComputedStyle(node).visibility !== 'hidden' &&
                  node.getBoundingClientRect().height <
                    (node.matches('.erp-filter-chip') ? 34 : 42)
              )
              .map((node) => node.textContent)
          )
        assert.deepEqual(smallTargets, [])
        await page.screenshot({
          path: path.join(outputDir, `mobile-progress-${role}-overview.png`),
        })
        await panel
          .getByRole('button', {
            name: `查看 ${prefix}-0001 进度`,
            exact: true,
          })
          .click()
        const drawer = page.locator('.erp-progress-drawer--mobile')
        await drawer
          .getByRole('heading', { name: `${prefix}-0001`, exact: true })
          .waitFor()
        await page.waitForFunction(() => {
          const header = document.querySelector(
            '.erp-progress-drawer--mobile .mobile-task-flow-header'
          )
          return header && Math.abs(header.getBoundingClientRect().left) <= 1
        })
        const detailGeometry = await assertMobileDetailSurface(drawer, assert)
        const stageRegion = drawer.getByRole('region', { name: '阶段进度' })
        assert.equal(
          await stageRegion.locator('[data-progress-stage]').count(),
          role === 'pmc' ? 3 : 5
        )
        const factualStage = role === 'pmc' ? 'production' : 'shipment'
        assert.equal(
          await stageRegion
            .locator(
              `[data-progress-stage="${factualStage}"] [role="progressbar"]`
            )
            .getAttribute('aria-valuenow'),
          role === 'pmc' ? '70' : '50'
        )
        assert.equal(
          await stageRegion
            .locator('[data-progress-stage="quality"] [role="progressbar"]')
            .count(),
          0
        )
        const overviewGeometry = await drawer.evaluate((root) => {
          const content = root.querySelector('.mobile-detail-content')
          const summary = root.querySelector('[aria-label="单据摘要"]')
          const stages = root.querySelector('[aria-label="阶段进度"]')
          const footer = root.querySelector('.mobile-progress-detail-actions')
          const buttons = [...footer.querySelectorAll('button')].map((button) =>
            button.getBoundingClientRect()
          )
          return {
            sections: [
              ...content.querySelectorAll(':scope > .mobile-detail-section'),
            ]
              .filter((section) => section.getClientRects().length > 0)
              .map((section) => section.getAttribute('aria-label')),
            summaryRows: summary.querySelectorAll('.mobile-detail-fact').length,
            stageHeight: stages.getBoundingClientRect().height,
            backWidth: buttons[0].width,
            primaryWidth: buttons[1].width,
            buttonHeight: buttons[1].height,
          }
        })
        assert.deepEqual(overviewGeometry.sections, [
          '单据摘要',
          '阶段进度',
          '最近记录',
        ])
        assert.equal(overviewGeometry.summaryRows, 4)
        assert(
          overviewGeometry.stageHeight < 220,
          JSON.stringify(overviewGeometry)
        )
        assert(
          overviewGeometry.primaryWidth > overviewGeometry.backWidth * 2,
          JSON.stringify(overviewGeometry)
        )
        assert.equal(overviewGeometry.buttonHeight, 44)
        assert.equal(await stageRegion.getByRole('button').count(), 0)
        await page.screenshot({
          path: path.join(outputDir, `mobile-progress-${role}-detail.png`),
        })
        await drawer
          .getByRole('button', { name: '查看关联任务', exact: true })
          .click()
        assert.equal(
          await drawer
            .getByRole('tab', { name: '关联任务', exact: true })
            .getAttribute('aria-selected'),
          'true'
        )
        await page.waitForTimeout(350)
        await page.screenshot({
          path: path.join(outputDir, `mobile-progress-${role}-tasks.png`),
        })
        await drawer.getByRole('button', { name: '查看任务 TASK-0100' }).click()
        await page.getByTestId('mobile-task-detail-screen').waitFor()
        const taskGeometry = await assertMobileDetailSurface(
          page.getByTestId('mobile-task-detail-screen'),
          assert
        )
        const taskSurface = page.getByTestId('mobile-task-detail-screen')
        await taskSurface
          .getByRole('heading', { name: '任务信息', exact: true })
          .waitFor()
        const taskLayout = await taskSurface.evaluate((root) => {
          const hero = root.querySelector('.mobile-task-detail-hero')
          const attachment = hero.querySelector(
            '[data-testid="mobile-task-attachment-action"] button'
          )
          return {
            heroRows: hero.querySelectorAll('.mobile-detail-fact').length,
            productDetailsInHero:
              hero.querySelectorAll('.erp-task-identity').length,
            heroWidth: hero.getBoundingClientRect().width,
            attachmentWidth: attachment.getBoundingClientRect().width,
            steps: [
              ...root.querySelectorAll('.mobile-task-flow-step__title'),
            ].map((node) => node.textContent),
          }
        })
        assert.equal(taskLayout.heroRows, 2)
        assert.equal(taskLayout.productDetailsInHero, 0)
        assert(
          taskLayout.attachmentWidth < taskLayout.heroWidth / 2,
          JSON.stringify(taskLayout)
        )
        assert.deepEqual(taskLayout.steps, ['任务信息', '任务办理', '结果回执'])
        await writeFile(
          path.join(outputDir, `mobile-progress-${role}-detail-geometry.json`),
          JSON.stringify(
            { progress: detailGeometry, task: taskGeometry },
            null,
            2
          )
        )
        await page.screenshot({
          path: path.join(outputDir, `mobile-progress-${role}-task-detail.png`),
        })
        assert.equal(
          await page.getByTestId('mobile-role-bottom-nav').count(),
          0
        )
        await page.goBack()
        await drawer
          .getByRole('tab', { name: '关联任务', exact: true, selected: true })
          .waitFor()
        await page.goBack()
        await drawer.waitFor({ state: 'hidden' })
        failDetail = true
        await panel
          .getByRole('button', {
            name: `查看 ${prefix}-0001 进度`,
            exact: true,
          })
          .click()
        await drawer.getByRole('alert').waitFor()
        assert.equal(
          await drawer
            .getByRole('button', { name: '查看关联任务', exact: true })
            .count(),
          0
        )
        failDetail = false
        longDetail = true
        failRecent = true
        await drawer.getByRole('button', { name: '重试', exact: true }).click()
        await drawer
          .getByRole('button', { name: '重新读取记录', exact: true })
          .waitFor()
        failRecent = false
        await drawer
          .getByRole('button', { name: '重新读取记录', exact: true })
          .click()
        await drawer
          .getByRole('button', { name: '重新读取记录', exact: true })
          .waitFor({ state: 'hidden' })
        await drawer
          .getByRole('heading', { name: `${prefix}-0001`, exact: true })
          .waitFor()
        for (const width of [320, 430]) {
          await page.setViewportSize({ width, height: 844 })
          await assertMobileDetailSurface(drawer, assert)
          assert.equal(
            await drawer
              .locator(
                '[data-progress-stage="shipment"] [role="progressbar"], [data-progress-stage="production"] [role="progressbar"]'
              )
              .count(),
            0
          )
          await page.screenshot({
            path: path.join(
              outputDir,
              `mobile-progress-${role}-long-detail-${width}.png`
            ),
          })
        }
        await page.setViewportSize({ width: 390, height: 844 })
        await drawer
          .getByRole('button', { name: '查看业务明细', exact: true })
          .click()
        await drawer
          .getByRole('region', { name: '进度明细', exact: true })
          .waitFor()
        await drawer
          .locator('.mobile-task-flow-header')
          .getByRole('button', { name: '返回进度', exact: true })
          .click()
        await drawer.waitFor({ state: 'hidden' })
        longDetail = false
        await panel
          .getByRole('button', {
            name: `查看 ${prefix}-0001 的关联任务`,
            exact: true,
          })
          .click()
        await drawer
          .getByRole('tab', { name: '关联任务', exact: true, selected: true })
          .waitFor()
        await drawer.getByRole('tab', { name: '生产单', exact: true }).click()
        await drawer
          .getByRole('button', { name: '查看生产进度', exact: true })
          .click()
        await drawer.getByText('MO-0010', { exact: true }).first().waitFor()
        assert(
          calls.some(
            ({ method, params }) =>
              method === 'get_progress' &&
              params.view === 'production' &&
              params.id === 10
          )
        )
        await page.goBack()
        await drawer
          .getByRole('tab', { name: '生产单', exact: true, selected: true })
          .waitFor()
        await page.goBack()
        await drawer.waitFor({ state: 'hidden' })
        assert.equal(
          await panel
            .getByRole('button', { name: /^(上一页|下一页)$/u })
            .count(),
          0,
          '移动进度不应暴露桌面分页按钮'
        )
        fail = true
        await panel.locator('.mobile-progress-scroll').evaluate((node) => {
          node.scrollTop = node.scrollHeight
          node.dispatchEvent(new Event('scroll', { bubbles: true }))
        })
        await panel.getByText('继续加载失败', { exact: true }).waitFor()
        assert.equal(
          await panel.locator('.mobile-progress-card').count(),
          20,
          '追加失败时必须保留已经读取的记录'
        )
        fail = false
        await panel.getByRole('button', { name: '重试', exact: true }).click()
        await panel
          .getByRole('button', {
            name: `查看 ${prefix}-0025 进度`,
            exact: true,
          })
          .waitFor()
        assert(
          calls.some(
            ({ method, params }) =>
              method === 'list_progress' && params.offset === 20
          ),
          '下滑到列表底部应自动读取下一批'
        )
        assert.equal(
          await panel.locator('.mobile-progress-card').count(),
          24,
          '下一批应追加在原列表后而不是替换首批记录'
        )
        await panel.locator('.mobile-progress-scroll').evaluate((node) => {
          node.scrollTop = node.scrollHeight
        })
        await page.waitForTimeout(120)
        await page.screenshot({
          path: path.join(
            outputDir,
            `mobile-progress-${role}-continuous-list.png`
          ),
        })
        await panel.getByLabel('搜索进度').fill('查找目标客户')
        await page.waitForTimeout(380)
        await assertMobileSearchAffordance(
          panel.locator('.erp-mobile-search'),
          panel.getByRole('button', { name: '筛选进度', exact: true })
        )
        await panel
          .getByRole('button', {
            name: `查看 ${prefix}-0025 进度`,
            exact: true,
          })
          .waitFor()
        assert(calls.some(({ params }) => params.keyword === '查找目标客户'))
        assert.equal(await panel.locator('.mobile-progress-card').count(), 1)
        await page.reload()
        await panel
          .getByRole('button', {
            name: `查看 ${prefix}-0025 进度`,
            exact: true,
          })
          .waitFor()
        await page.getByTestId('mobile-role-nav-tasks').click()
        await page
          .getByLabel('任务状态', { exact: true })
          .getByText('已办', { exact: true })
          .click()
        await page.getByText('已办任务', { exact: true }).waitFor()
        await page.getByTestId('mobile-role-nav-progress').click()
        assert.equal(
          await panel.getByLabel('搜索进度').inputValue(),
          '查找目标客户'
        )
        await panel
          .getByRole('button', { name: '清除搜索', exact: true })
          .click()
        await panel
          .getByRole('button', {
            name: `查看 ${prefix}-0001 进度`,
            exact: true,
          })
          .waitFor()
        const filterPanel = page.getByRole('dialog', {
          name: '筛选进度',
          exact: true,
        })
        await assertMobileFilterOutsideDismissal({
          page,
          assert,
          trigger: panel.getByRole('button', {
            name: '筛选进度',
            exact: true,
          }),
          dialog: filterPanel,
        })
        await panel
          .getByRole('button', { name: '筛选进度', exact: true })
          .click()
        await filterPanel.waitFor({ state: 'visible' })
        await page.waitForTimeout(350)
        for (const segment of await filterPanel
          .locator('.erp-sliding-segmented')
          .all()) {
          await assertSegmentAffordance(segment)
        }
        await page.screenshot({
          path: path.join(outputDir, `mobile-progress-${role}-filter.png`),
        })
        assert.equal(
          await filterPanel.locator('select').count(),
          0,
          '进度下拉层的有限互斥条件使用共享分段与筛选按钮'
        )
        assert.equal(
          await filterPanel.locator('.ant-picker, input[type="date"]').count(),
          0,
          '移动进度不显示精确日期输入'
        )
        await page.setViewportSize({ width: 320, height: 568 })
        await page.waitForTimeout(200)
        const narrowFilter = await page
          .locator('.mobile-filter-popover')
          .evaluate((node) => ({
            viewportHeight: document.documentElement.clientHeight,
            viewportWidth: document.documentElement.clientWidth,
            scrollWidth: document.documentElement.scrollWidth,
            bounds: node.getBoundingClientRect().toJSON(),
            panelHeight: node
              .querySelector('.mobile-filter-panel')
              .getBoundingClientRect().height,
          }))
        assert(
          narrowFilter.scrollWidth <= 320 &&
            narrowFilter.bounds.x >= 0 &&
            narrowFilter.bounds.y >= 0 &&
            narrowFilter.bounds.x + narrowFilter.bounds.width <=
              narrowFilter.viewportWidth + 1 &&
            narrowFilter.bounds.y + narrowFilter.bounds.height <=
              narrowFilter.viewportHeight + 1 &&
            narrowFilter.panelHeight <= narrowFilter.viewportHeight * 0.52 + 2,
          `窄屏进度筛选下拉层应保持在视口内：${JSON.stringify(narrowFilter)}`
        )
        await page.screenshot({
          path: path.join(
            outputDir,
            `mobile-progress-${role}-filter-dropdown-320.png`
          ),
        })
        await filterPanel.getByText('全部', { exact: true }).click()
        await panel.getByText('全部记录', { exact: true }).waitFor()
        const appliedFilter = panel.locator('.mobile-filter-trigger')
        assert.equal(
          await appliedFilter.getAttribute('aria-label'),
          '筛选进度，已应用 1 项'
        )
        await filterPanel.getByText('在执行', { exact: true }).click()
        await page.setViewportSize({ width: 390, height: 844 })
        assert.equal(
          await filterPanel.getByRole('textbox').count(),
          0,
          '筛选下拉层不应要求用户二次搜索'
        )
        await filterPanel
          .getByRole('button', { name: '关闭筛选', exact: true })
          .click()
        await filterPanel.waitFor({ state: 'hidden' })
        assert.equal(
          await appliedFilter.getAttribute('data-active'),
          'false',
          '恢复默认记录范围后不应保留隐藏条件'
        )
        await panel.getByLabel('搜索进度').fill('模拟业务员')
        await page.waitForTimeout(380)
        await panel
          .getByRole('button', {
            name: `查看 ${prefix}-0001 进度`,
            exact: true,
          })
          .waitFor()
        assert(
          calls.some(
            ({ params }) => params.keyword === '模拟业务员' && !params.owner
          ),
          '主搜索应直接查询负责人且不再发送二次负责人条件'
        )
        await panel
          .getByRole('button', { name: '清除搜索', exact: true })
          .click()
        await panel
          .getByRole('button', {
            name: `查看 ${prefix}-0001 进度`,
            exact: true,
          })
          .waitFor()
        const snapshotCards = () =>
          panel.locator('.mobile-progress-card').evaluateAll((cards) =>
            cards.map((card) => {
              const copy = card.cloneNode(true)
              copy.querySelector('.mobile-progress-product-image')?.remove()
              return copy.textContent
            })
          )
        const previousCards = await snapshotCards()
        fail = true
        await pullToRefresh(page, panel.locator('.mobile-progress-scroll'))
        await panel.getByRole('button', { name: '重试', exact: true }).waitFor()
        assert.deepEqual(
          await snapshotCards(),
          previousCards,
          '刷新失败保留同一筛选下已加载的进度'
        )
        await panel.getByLabel('搜索进度').fill('查找目标客户')
        await page.waitForTimeout(380)
        await panel.getByRole('button', { name: '重试', exact: true }).waitFor()
        assert.equal(
          await panel.locator('.mobile-progress-card').count(),
          0,
          '新查询失败不能显示旧条件的结果'
        )
        await panel
          .getByRole('button', { name: '清除搜索', exact: true })
          .click()
        await page.waitForTimeout(380)
        fail = false
        await panel.getByRole('button', { name: '重试', exact: true }).click()
        await panel
          .getByRole('button', {
            name: `查看 ${prefix}-0001 进度`,
            exact: true,
          })
          .waitFor()
        fail = true
        failureCode = RpcErrorCode.PERMISSION_DENIED
        await pullToRefresh(page, panel.locator('.mobile-progress-scroll'))
        await panel.getByRole('button', { name: '重试', exact: true }).waitFor()
        assert.equal(
          await panel.locator('.mobile-progress-card').count(),
          0,
          '明确撤权后清除旧进度，不使用失败保留规则'
        )
        fail = false
        failureCode = RpcErrorCode.INTERNAL
        await panel.getByRole('button', { name: '重试', exact: true }).click()
        await panel
          .getByRole('button', {
            name: `查看 ${prefix}-0001 进度`,
            exact: true,
          })
          .waitFor()
        let releaseListResponse
        heldListResponse = new Promise((resolve) => {
          releaseListResponse = resolve
        })
        await pullToRefresh(page, panel.locator('.mobile-progress-scroll'))
        await page.waitForFunction(
          () =>
            document.querySelector('[data-testid="mobile-progress-panel"]')
              .dataset.refreshing === 'true'
        )
        await page.getByTestId('mobile-role-nav-mine').click()
        releaseListResponse()
        await page.getByTestId('mobile-role-nav-progress').click()
        await panel
          .getByRole('button', {
            name: `查看 ${prefix}-0001 进度`,
            exact: true,
          })
          .waitFor()
        await page.waitForFunction(() => {
          const panel = document.querySelector(
            '[data-testid="mobile-progress-panel"]'
          )
          const indicator = panel.querySelector(
            '[data-testid="mobile-task-pull-refresh"]'
          )
          return (
            panel.dataset.refreshing === 'false' &&
            indicator?.dataset.state === 'idle' &&
            indicator.getBoundingClientRect().height === 0
          )
        })
        await panel.getByLabel('搜索进度').fill('迟到响应')
        await page.waitForTimeout(330)
        await panel.getByLabel('搜索进度').fill('查找目标客户')
        await panel
          .getByRole('button', {
            name: `查看 ${prefix}-0025 进度`,
            exact: true,
          })
          .waitFor()
        await page.waitForTimeout(600)
        assert.equal(await panel.locator('.mobile-progress-card').count(), 1)
        await assertNoHorizontalOverflow(page, `${role}-after`)
        if (role === 'boss') {
          await verifyMobileNavigationMotion(
            page,
            assert,
            '[data-testid="mobile-role-bottom-nav"]',
            1
          )
          await verifyMobileNavigationMotion(
            page,
            assert,
            '[data-testid="mobile-role-bottom-nav"]',
            2,
            true
          )
          await page.getByTestId('mobile-role-nav-tasks').click()
          await page
            .getByLabel('任务状态', { exact: true })
            .getByText('待办', { exact: true })
            .click()
          await page.waitForTimeout(350)
          await verifyMobileNavigationMotion(
            page,
            assert,
            '.mobile-workspace-task-views',
            1
          )
          await verifyMobileNavigationMotion(
            page,
            assert,
            '.mobile-workspace-task-views',
            0,
            true
          )
          await page.getByTestId('mobile-role-nav-progress').click()
          await panel.getByLabel('搜索进度').fill('未匹配的模拟订单')
          await panel.getByText('没有符合条件的记录', { exact: true }).waitFor()
          for (const width of [320, 430]) {
            await page.setViewportSize({ width, height: 844 })
            await assertNoHorizontalOverflow(page, `progress-width-${width}`)
          }
          await panel
            .getByRole('button', { name: '清除搜索', exact: true })
            .click()
          await panel
            .getByRole('button', {
              name: '查看 SO-0001 的关联任务',
              exact: true,
            })
            .click()
          await drawer
            .getByRole('button', { name: '查看任务 TASK-0100' })
            .click()
          await page
            .getByTestId('mobile-task-detail-screen')
            .locator('.mobile-role-action-bar')
            .getByRole('button', { name: '处理任务', exact: true })
            .click()
          const action = page.getByTestId('mobile-task-action-screen')
          await assertMobileDetailSurface(action, assert)
          await page.screenshot({
            path: path.join(outputDir, `mobile-progress-${role}-action.png`),
          })
          const resume = action.locator('[data-action-key="resume"]')
          if (await resume.count()) await resume.click()
          await action
            .locator('textarea')
            .fill('模拟核验：交期已确认，恢复协同处理。')
          const posted = page.waitForResponse(
            (response) =>
              response.url().endsWith('/rpc/workflow') &&
              response.request().postDataJSON().method === 'resume_task_action'
          )
          await action.locator('button[type="submit"]').click()
          assert.equal((await (await posted).json()).result.code, 0)
          const receipt = page.getByTestId('mobile-task-receipt-screen')
          await receipt.waitFor()
          await assertMobileDetailSurface(receipt, assert)
          await page.screenshot({
            path: path.join(outputDir, `mobile-progress-${role}-receipt.png`),
          })
          await receipt
            .locator('.mobile-role-action-bar')
            .getByRole('button', { name: '返回任务列表', exact: true })
            .click()
          await drawer.waitFor()
          const rereadResponse = page.waitForResponse(
            (response) =>
              response.url().endsWith('/rpc/workflow') &&
              response.request().postDataJSON().method === 'get_task'
          )
          await drawer
            .getByRole('button', { name: '查看任务 TASK-0100' })
            .click()
          const reread = (await (await rereadResponse).json()).result.data.task
          assert.equal(reread.task_status_key, 'ready')
          assert.equal(reread.version, 2)
          await page.getByTestId('mobile-task-detail-screen').waitFor()
          await page.goBack()
          await page.goBack()
        }
      },
    }
  })
}
