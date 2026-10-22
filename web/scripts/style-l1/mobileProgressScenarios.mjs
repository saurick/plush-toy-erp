import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import { assertMobileBackToTop } from './mobileBackToTopAssertions.mjs'
import { RpcErrorCode } from '../../src/common/consts/errorCodes.generated.js'
import { verifyMobileNavigationMotion } from './slidingMotionAssertions.mjs'
import { pullToRefresh } from './mobileGestureAssertions.mjs'
import {
  assertContentTabAffordance,
  assertSegmentAffordance,
  assertFilterAffordance,
  assertMobileSearchAffordance,
} from './controlAffordanceAssertions.mjs'
import { progressFixtureData } from './businessProgressFixtures.mjs'
import { assertMobileFilterOutsideDismissal } from './mobileFilterPopoverAssertions.mjs'
import { createMobileFilterScrollScenarios } from './mobileFilterScrollScenarios.mjs'
import { assertMobileFilterClearControl } from './mobileFilterConsistencyAssertions.mjs'

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
      taskFlow: node.matches('.mobile-role-tasks-page--detail'),
      taskInfo: node.matches('.mobile-role-tasks-page--task-info'),
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
  assert.equal(geometry.padding, geometry.taskFlow && !geometry.taskInfo ? '16px' : '12px')
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

async function verifyMobilePrimaryTabGeometry(page, assert, outputDir, theme) {
  const progressSelector = '.mobile-progress-view-switch'
  const taskSelector = '.mobile-workspace-task-views .erp-sliding-tab-list'
  const measurements = []
  const read = (selector) => page.locator(selector).evaluate((root) => {
    const box = root.getBoundingClientRect()
    const page = root.closest('.mobile-role-tasks-page').getBoundingClientRect()
    const group = root
    const indicator = getComputedStyle(group, '::before')
    const labels = [...root.querySelectorAll('[role="tab"]')]
    return {
      height: box.height,
      top: box.top - page.top,
      left: box.left - page.left,
      indicatorBottom: group.getBoundingClientRect().top - box.top + new DOMMatrixReadOnly(indicator.transform).m42 + parseFloat(indicator.height),
      labels: labels.map((node) => {
        const style = getComputedStyle(node)
        const range = document.createRange()
        range.selectNodeContents(node)
        const text = range.getBoundingClientRect()
        return { height: node.getBoundingClientRect().height, center: (text.top + text.bottom) / 2 - box.top, font: style.fontSize, lineHeight: style.lineHeight }
      }),
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }
  })
  const equal = (actual, expected, state) => {
    for (const field of ['height', 'top', 'left', 'indicatorBottom']) {
      assert(Math.abs(actual[field] - expected[field]) <= 0.5, `${state} ${field}: ${JSON.stringify({ actual, expected })}`)
    }
    for (const label of actual.labels) {
      assert(label.height >= 44)
      assert(Math.abs(label.center - expected.labels[0].center) <= 0.5, `${state} 文字基线对齐`)
      assert.equal(label.font, expected.labels[0].font)
      assert.equal(label.lineHeight, expected.labels[0].lineHeight)
    }
    assert(actual.overflow <= 1, `${state} 页面不横向溢出`)
  }
  for (const width of [320, 350, 351, 390, 430]) {
    await page.setViewportSize({ width, height: 844 })
    await page.getByTestId('mobile-role-nav-progress').click()
    const progress = page.locator(progressSelector)
    await progress.waitFor()
    await progress.getByText('订单交付', { exact: true }).click()
    await progress.getByRole('tab', { name: '订单交付', exact: true, selected: true }).waitFor()
    await assertContentTabAffordance(progress)
    const expected = await read(progressSelector)
    assert.equal(expected.height, 46, '内容页签保留紧凑高度与 44px 触区')
    assert.equal(expected.top, 2)
    await progress.getByText('生产执行', { exact: true }).click()
    await progress.getByRole('tab', { name: '生产执行', exact: true, selected: true }).waitFor()
    equal(await read(progressSelector), expected, `${width} 生产执行`)
    if (width === 390) await page.screenshot({ path: path.join(outputDir, `primary-tabs-progress-${theme}.png`), clip: { x: 0, y: 0, width, height: 172 } })
    await page.getByTestId('mobile-role-nav-tasks').click()
    const tasks = page.locator(taskSelector)
    for (const state of ['待办', '已办', '流程跟踪']) {
      await tasks.getByText(state, { exact: true }).click()
      await tasks.getByRole('tab', { name: state, selected: true }).waitFor()
      await assertContentTabAffordance(tasks)
      const actual = await read(taskSelector)
      equal(actual, expected, `${width} ${state}`)
      measurements.push({ width, state, ...actual })
      if (state === '待办' && width === 390) await page.screenshot({ path: path.join(outputDir, `primary-tabs-tasks-${theme}.png`), clip: { x: 0, y: 0, width, height: 172 } })
    }
    const tracking = page.locator('.mobile-workspace-tracking-views')
    await tracking.getByText('异常跟踪', { exact: true }).click()
    equal(await read(taskSelector), expected, `${width} 异常跟踪`)
    await tracking.getByText('流程进度', { exact: true }).click()
  }
  await page.setViewportSize({ width: 390, height: 844 })
  await verifyMobileNavigationMotion(page, assert, taskSelector, 1)
  await verifyMobileNavigationMotion(page, assert, taskSelector, 0, true)
  await page.getByTestId('mobile-role-nav-progress').click()
  await verifyMobileNavigationMotion(page, assert, progressSelector, 0)
  await verifyMobileNavigationMotion(page, assert, progressSelector, 1, true)
  await writeFile(path.join(outputDir, `primary-tab-geometry-${theme}.json`), JSON.stringify(measurements, null, 2))
}

export function createMobileProgressScenarios({
  assert,
  assertNoHorizontalOverflow,
  customerRuntimeEffectiveSession,
  outputDir,
}) {
  const scenarios = ['boss', 'pmc', 'warehouse'].map((role) => {
    let fail = false
    let failDetail = false
    let longDetail = false
    let failRecent = false
    let sparseDetail = false
    let failLinkedTask = false
    let hideTaskAccess = false
    let failureCode = RpcErrorCode.INTERNAL
    let heldListResponse = null
    const calls = []
    const workflowCalls = []
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
      deviceScaleFactor: 3,
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
        {
          id: 101,
          version: 1,
          task_code: 'TASK-0101',
          task_name: 'engineering_data',
          task_group: 'engineering_data',
          owner_role_key: role,
          assignee_user_id: 1,
          assignee_name: '模拟经办人',
          task_status_key: 'ready',
          source_type: role === 'pmc' ? 'production_order' : 'sales_order',
          source_id: 2,
          source_no: role === 'pmc' ? 'MO-0002' : 'SO-0002',
          created_at: 1788840000,
          payload: {},
        },
      ],
      beforeNavigate: async (page) => {
        page.on('pageerror', (error) =>
          console.error('mobile-progress runtime error:', error.message)
        )
        calls.length = 0
        workflowCalls.length = 0
        imageCalls.length = 0
        fail = false
        failDetail = false
        longDetail = false
        failRecent = false
        sparseDetail = false
        failLinkedTask = false
        hideTaskAccess = false
        failureCode = RpcErrorCode.INTERNAL
        heldListResponse = null
        await page.route('**/rpc/workflow', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          workflowCalls.push({ method, params })
          if (
            method === 'get_task' &&
            params.task_id === 101 &&
            failLinkedTask
          ) {
            return route.fulfill({
              json: {
                jsonrpc: '2.0',
                id,
                result: { code: RpcErrorCode.INTERNAL, message: '读取失败' },
              },
            })
          }
          if (method !== 'list_task_events' || !failRecent) {
            return route.fallback()
          }
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
          data.access.tasks = !hideTaskAccess
          for (const row of method === 'get_progress'
            ? [data.row]
            : data.rows) {
            if (row.id === 5) Object.assign(row, { customer: '', product: '', sales_owner: '' })
            if (row.id === 2) {
              Object.assign(row, {
                open_tasks: 1,
                attention_task_id: 101,
                attention_task: 'engineering_data',
                attention_role: role,
                attention_owner: '模拟经办人',
              })
            }
            if (row.id === 4) {
              Object.assign(row, {
                open_tasks: 3,
                attention_task_id: 100,
                attention_task:
                  '确认长名称面料及包装资料的多岗位协同交接与责任归属'.repeat(
                    3
                  ),
                attention_role: 'purchase',
                attention_owner: '模拟跨区域采购负责人',
              })
            }
          }
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
          if (method === 'get_progress' && sparseDetail) {
            data.sections.production = []
            data.sections.batches = []
            data.sections.materials = []
            data.sections.tasks = []
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
          allowed ? ['进度', '任务管理', '风险', '我的'] : ['任务管理', '风险', '我的']
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
          await page.getByRole('region', { name: '已办任务', exact: true }).waitFor()
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
        const firstCardImage = panel.locator('.mobile-progress-card').first().locator('.erp-product-identity img')
        const missing = panel.locator('.mobile-progress-card').filter({ hasText: `${prefix}-0005` })
        for (const label of ['产品名称未填写', '未定交期', '业务负责人未提供']) await missing.getByText(label, { exact: true }).waitFor()
        assert.match(await missing.locator('.erp-progress-customer').innerText(), /^客户未填写/u)
        await firstCardImage.waitFor()
        await page.waitForFunction(() => {
          const image = document.querySelector('.mobile-progress-card .erp-product-identity img')
          return image?.complete && image.naturalWidth > 0
        })
        assert(imageCalls.some(({ method, params }) => method === 'list_product_image_references' && params.product_ids?.includes(7)), '默认进度列表读取实际产品图片，不依赖搜索命中')
        assert.equal(await panel.locator('.erp-task-product-image__zoom').count(), 0, '缩略图不覆盖放大镜角标')
        const listImageButton = panel.locator('.mobile-progress-card').first().getByRole('button', { name: /查看.+大图/ })
        await listImageButton.click()
        await page.getByRole('button', { name: '关闭图片预览', exact: true }).waitFor()
        assert.equal(await page.locator('.erp-progress-drawer--mobile').count(), 0, '点图只打开图片，不同时打开进度详情')
        await page.keyboard.press('Escape')
        await page.getByRole('button', { name: '关闭图片预览', exact: true }).waitFor({ state: 'hidden' })
        await panel.locator('.mobile-progress-card').nth(2).getByText('云朵小熊 等 3 项', { exact: true }).waitFor()
        const cardGeometry = await panel.locator('.mobile-progress-card').evaluateAll((cards) => cards.slice(0, 3).map((card) => {
          const delivery = card.querySelector('.erp-progress-delivery')
          const footer = card.querySelector('.mobile-progress-task-entry').getBoundingClientRect()
          const identity = card.querySelector('.mobile-progress-card-identity').getBoundingClientRect()
          const action = delivery.querySelector('button')?.getBoundingClientRect()
          const walker = document.createTreeWalker(delivery, NodeFilter.SHOW_TEXT)
          const textBottoms = []
          for (let node = walker.nextNode(); node; node = walker.nextNode()) {
            if (!node.textContent.trim()) continue
            const range = document.createRange()
            range.selectNodeContents(node)
            textBottoms.push(range.getBoundingClientRect().bottom)
          }
          return {
            height: card.getBoundingClientRect().height,
            main: card.querySelector('.mobile-progress-card-main').getBoundingClientRect().height,
            reason: card.querySelector('.erp-progress-attention-reason')?.getBoundingClientRect().height || 0,
            imageSize: card.querySelector('.erp-task-product-image').getBoundingClientRect().width,
            deliveryGap: footer.top - delivery.getBoundingClientRect().bottom,
            textGap: footer.top - Math.max(...textBottoms),
            touchHeight: action?.height ?? null,
            touchOverlapsAdjacent: action ? action.top < identity.bottom - 0.5 || action.bottom > footer.top + 0.5 : false,
            overflow: card.scrollWidth - card.clientWidth,
          }
        }))
        assert(cardGeometry[1].height < 210 && cardGeometry.every((card) => card.overflow <= 1), JSON.stringify(cardGeometry))
        assert(cardGeometry.every((card) => card.imageSize === 64 && card.deliveryGap >= 0 && card.deliveryGap <= 4.5), `图片可辨认，出货进度后不叠加空白：${JSON.stringify(cardGeometry)}`)
        assert(cardGeometry.every((card) => card.textGap >= 6 && card.textGap <= 16.5), `按文字到分隔线核验数量行留白：${JSON.stringify(cardGeometry)}`)
        assert(cardGeometry.every((card) => (card.touchHeight === null || card.touchHeight >= 44) && !card.touchOverlapsAdjacent), `紧凑数量行保留独立且不侵入相邻区域的触区：${JSON.stringify(cardGeometry)}`)
        await writeFile(path.join(outputDir, `progress-quantity-spacing-${role}.json`), JSON.stringify(cardGeometry, null, 2))
        assert(Math.max(...cardGeometry.map((card) => card.main)) - Math.min(...cardGeometry.map((card) => card.main)) <= 1, `进度身份和数量分区应对齐：${JSON.stringify(cardGeometry)}`)
        assert(cardGeometry[0].height <= cardGeometry[1].height + cardGeometry[0].reason + 4, `异常只按真实原因增高：${JSON.stringify(cardGeometry)}`)
        await assertNoHorizontalOverflow(page, role)
        await assertContentTabAffordance(panel.locator('.mobile-progress-view-switch'))
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
          const segment = root.querySelector('.mobile-progress-view-switch')
          return {
            segment: read(segment),
            indicator: read(
              segment,
              '::before'
            ),
            items: [...segment.querySelectorAll('[role="tab"]')].map(
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
        assert(await assertMobileBackToTop(page, panel.locator('.mobile-progress-scroll')), '长进度列表支持回到顶部')
        const taskEntries = panel.locator('.mobile-progress-task-entry')
        assert.equal(
          await taskEntries.nth(0).locator('strong').textContent(),
          '受阻 · 确认面料交期'
        )
        assert(
          (await taskEntries.nth(0).innerText()).includes(
            '采购 · 办理人未提供 · 共 2 项待办'
          )
        )
        assert.equal(
          await taskEntries.nth(1).locator('strong').textContent(),
          '工程资料'
        )
        assert((await taskEntries.nth(1).innerText()).includes('模拟经办人'))
        const emptyEntry = taskEntries.nth(2)
        assert((await emptyEntry.textContent()).includes('暂无可见待办'))
        assert.equal(await emptyEntry.evaluate((node) => node.tagName), 'DIV')
        assert.equal(await emptyEntry.locator('button, .anticon').count(), 0)

        const longTaskEntry = taskEntries.nth(3)
        for (const width of [320, 430]) {
          await page.setViewportSize({ width, height: 844 })
          await longTaskEntry.scrollIntoViewIfNeeded()
          const geometry = await longTaskEntry.evaluate((node) => {
            const arrow = node.querySelector('.anticon')
            const box = node.getBoundingClientRect()
            const arrowBox = arrow.getBoundingClientRect()
            return {
              height: box.height,
              overflow: node.scrollWidth - node.clientWidth,
              arrowWidth: arrowBox.width,
              right: box.right - arrowBox.right,
            }
          })
          assert(
            geometry.height >= 44 &&
              geometry.overflow <= 1 &&
              geometry.arrowWidth > 0 &&
              geometry.right >= -1,
            JSON.stringify(geometry)
          )
          await assertNoHorizontalOverflow(page, `${role}-task-entry-${width}`)
          await page.screenshot({
            path: path.join(
              outputDir,
              `mobile-progress-${role}-long-task-${width}.png`
            ),
          })
        }
        await page.setViewportSize({ width: 390, height: 844 })
        await panel.getByLabel('搜索进度').fill('模拟客户')
        await page.waitForFunction(
          () => window.history.state?.mobileProgress?.query.q === '模拟客户'
        )
        const singleEntry = panel.getByRole('button', {
          name: `查看 ${prefix}-0002 的任务：工程资料`,
          exact: true,
        })
        await singleEntry.waitFor()
        await singleEntry.scrollIntoViewIfNeeded()
        const beforeDirect = await panel.evaluate((node) => ({
          query: window.history.state.mobileProgress.query,
          scrollTop: node.querySelector('.mobile-progress-scroll').scrollTop,
        }))
        const progressDetailCalls = calls.filter(
          ({ method }) => method === 'get_progress'
        ).length
        failLinkedTask = true
        await singleEntry.click()
        const linkedFeedback = page.getByRole('region', {
          name: '关联任务',
          exact: true,
        })
        await linkedFeedback.getByRole('alert').waitFor()
        await linkedFeedback
          .getByRole('button', { name: '返回进度', exact: true })
          .waitFor()
        assert.equal(
          await page.locator('.erp-progress-drawer--mobile').count(),
          0
        )
        assert.equal(
          calls.filter(({ method }) => method === 'get_progress').length,
          progressDetailCalls
        )
        assert(
          workflowCalls.some(
            ({ method, params }) =>
              method === 'get_task' && params.task_id === 101
          )
        )
        failLinkedTask = false
        await linkedFeedback
          .getByRole('button', { name: '重试', exact: true })
          .click()
        const directTask = page.getByTestId('mobile-task-detail-screen')
        await directTask
          .getByRole('heading', { name: '工程资料', exact: true })
          .waitFor()
        await directTask
          .getByRole('button', { name: '返回进度', exact: true })
          .waitFor()
        if (role === 'pmc') {
          assert.equal(
            await directTask
              .getByRole('button', { name: '选择处理方式', exact: true })
              .count(),
            0
          )
        } else {
          await directTask
            .getByRole('button', { name: '选择处理方式', exact: true })
            .waitFor()
        }
        await page.screenshot({
          path: path.join(outputDir, `mobile-progress-${role}-direct-task.png`),
        })
        await directTask
          .getByRole('button', { name: '返回进度', exact: true })
          .click()
        await singleEntry.waitFor()
        await page.waitForFunction((expected) => {
          const scroll = document.querySelector(
            '[data-testid="mobile-progress-panel"] .mobile-progress-scroll'
          )
          return scroll && Math.abs(scroll.scrollTop - expected) <= 1
        }, beforeDirect.scrollTop)
        assert.deepEqual(
          await page.evaluate(() => window.history.state.mobileProgress.query),
          beforeDirect.query
        )
        assert.equal(
          await page.locator('.erp-progress-drawer--mobile').count(),
          0
        )
        assert.equal(
          await panel.getByLabel('搜索进度').inputValue(),
          '模拟客户'
        )

        await panel.getByRole('button', { name: /7天内/ }).click()
        await singleEntry.waitFor()
        await singleEntry.click()
        await directTask
          .getByRole('heading', { name: '工程资料', exact: true })
          .waitFor()
        if (role === 'boss') {
          await directTask
            .getByRole('button', { name: '选择处理方式', exact: true })
            .click()
          const directAction = page.getByTestId('mobile-task-action-screen')
          await directAction.waitFor()
          await directAction
            .locator('textarea')
            .fill('模拟核验：工程资料已经核对完成。')
          const completed = page.waitForResponse(
            (response) =>
              response.url().endsWith('/rpc/workflow') &&
              response.request().postDataJSON().method ===
                'complete_task_action' &&
              response.request().postDataJSON().params.task_id === 101
          )
          await directAction.locator('button[type="submit"]').click()
          assert.equal((await (await completed).json()).result.code, 0)
          const directReceipt = page.getByTestId('mobile-task-receipt-screen')
          await directReceipt.waitFor()
          await directReceipt
            .getByRole('heading', { name: '任务办理已确认', exact: true })
            .waitFor()
          await page.screenshot({
            path: path.join(
              outputDir,
              `mobile-progress-${role}-direct-receipt.png`
            ),
          })
          await directReceipt
            .locator('.mobile-role-action-bar')
            .getByRole('button', { name: '返回进度', exact: true })
            .click()
        } else {
          await page.goBack()
        }
        await singleEntry.waitFor()
        assert.equal(
          await page.evaluate(
            () => window.history.state.mobileProgress.query.due_status
          ),
          'due_soon'
        )
        assert.equal(await panel.locator('.mobile-progress-card').count(), 1)
        hideTaskAccess = true
        await pullToRefresh(page, panel.locator('.mobile-progress-scroll'))
        await page.waitForFunction(
          () =>
            document.querySelector('[data-testid="mobile-progress-panel"] .mobile-progress-task-entry')?.textContent.includes('任务无查看权限')
        )
        assert.equal(
          await panel.locator('button.mobile-progress-task-entry').count(),
          0
        )
        hideTaskAccess = false
        await pullToRefresh(page, panel.locator('.mobile-progress-scroll'))
        await singleEntry.waitFor()
        await panel.getByRole('button', { name: /^不限交期/ }).click()
        await panel
          .getByRole('button', { name: '清除搜索', exact: true })
          .click()
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
        await drawer.locator('.mobile-progress-overview-product img').first().waitFor()
        await page.waitForFunction(() => document.querySelector('.erp-progress-drawer--mobile .mobile-progress-overview-product img')?.naturalWidth > 0)
        assert(imageCalls.some(({ method, params }) => method === 'list_product_image_references' && params.product_ids?.includes(7)))
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
          .getByRole('button', { name: '查看业务明细', exact: true })
          .click()
        const detailGroupNames = await drawer
          .locator('.mobile-progress-detail-group-trigger')
          .evaluateAll((buttons) =>
            buttons.map((button) => button.getAttribute('aria-label'))
          )
        assert.deepEqual(detailGroupNames, [
          '产品信息，1 项',
          '生产执行，1 单 · 1 批次 · 1 项领料',
          '关联任务，1 项',
        ])
        const detailGroupGeometry = await drawer
          .locator('.mobile-progress-detail-groups')
          .evaluate((root) => {
            const rootRect = root.getBoundingClientRect()
            return {
              overflow: root.scrollWidth - root.clientWidth,
              buttons: [
                ...root.querySelectorAll(
                  '.mobile-progress-detail-group-trigger'
                ),
              ].map((button) => {
                const rect = button.getBoundingClientRect()
                return {
                  height: rect.height,
                  left: rect.left - rootRect.left,
                  right: rootRect.right - rect.right,
                  width: rect.width,
                }
              }),
            }
          })
        assert(
          detailGroupGeometry.overflow <= 1 &&
            detailGroupGeometry.buttons.every(
              ({ height, left, right, width }) =>
                height >= 52 && left >= -1 && right >= -1 && width > 280
            ),
          JSON.stringify(detailGroupGeometry)
        )
        assert.equal(
          await drawer
            .getByRole('button', { name: '产品信息，1 项', exact: true })
            .getAttribute('aria-expanded'),
          'true'
        )
        assert.equal(
          await drawer
            .getByRole('button', { name: '打开原单', exact: true })
            .count(),
          0
        )
        assert.equal(
          await drawer
            .getByRole('button', { name: '查看 1', exact: true })
            .count(),
          0
        )
        await drawer
          .getByRole('button', {
            name: '生产执行，1 单 · 1 批次 · 1 项领料',
            exact: true,
          })
          .click()
        assert.equal(
          await drawer
            .getByRole('button', {
              name: '生产执行，1 单 · 1 批次 · 1 项领料',
              exact: true,
            })
            .getAttribute('aria-expanded'),
          'true'
        )
        const productionGroup = drawer.getByRole('region', {
          name: '生产执行，1 单 · 1 批次 · 1 项领料',
        })
        assert.deepEqual(
          await productionGroup.getByRole('heading').allTextContents(),
          ['生产单', '工序批次', '领料']
        )
        assert.equal(
          await productionGroup
            .getByRole('button', { name: '查看生产进度', exact: true })
            .count(),
          1
        )
        await drawer
          .getByRole('button', { name: '产品信息，1 项', exact: true })
          .click()
        assert.equal(
          await drawer
            .getByRole('button', { name: '收起业务明细', exact: true })
            .count(),
          1
        )
        assert.equal(
          await drawer
            .getByRole('button', { name: '产品信息，1 项', exact: true })
            .getAttribute('aria-expanded'),
          'true'
        )
        await drawer
          .getByRole('button', {
            name: '生产执行，1 单 · 1 批次 · 1 项领料',
            exact: true,
          })
          .click()
        await drawer
          .getByRole('button', { name: '查看关联任务', exact: true })
          .click()
        assert.equal(
          await drawer
            .getByRole('button', { name: '关联任务，1 项', exact: true })
            .getAttribute('aria-expanded'),
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
          .getByRole('heading', { name: '确认面料交期', exact: true })
          .waitFor()
        const taskActionAllowed = permissions.includes('workflow.task.update')
        await page.waitForFunction((expectedGrow) => {
          const attachment = document.querySelector('button[data-testid="mobile-task-attachment-action"]')
          return attachment && getComputedStyle(attachment).flexGrow === expectedGrow
        }, taskActionAllowed ? '0' : '1')
        const taskLayout = await taskSurface.evaluate((root) => {
          const hero = root.querySelector('.workflow-task-info-card[aria-label="任务信息"]')
          const attachment = root.querySelector(
            'button[data-testid="mobile-task-attachment-action"]'
          )
          const footer = root.querySelector('.mobile-role-action-bar')
          return {
            heroRows: hero.querySelectorAll('.workflow-task-info-facts > div').length,
            currentSummaryCount: hero.querySelectorAll('.workflow-task-current').length,
            attachmentInHero: hero.contains(attachment),
            attachmentInFooter: Boolean(attachment.closest('.mobile-role-action-bar')),
            heroWidth: hero.getBoundingClientRect().width,
            attachmentWidth: attachment.getBoundingClientRect().width,
            attachmentHeight: attachment.getBoundingClientRect().height,
            footerWidth: footer.clientWidth - parseFloat(getComputedStyle(footer).paddingLeft) - parseFloat(getComputedStyle(footer).paddingRight),
            footerButtons: [...footer.querySelectorAll('button')].map((button) => {
              const box = button.getBoundingClientRect()
              return { text: button.textContent, top: box.top, height: box.height, width: box.width }
            }),
            steps: [
              ...root.querySelectorAll('.mobile-task-flow-step__title'),
            ].map((node) => node.textContent),
          }
        })
        assert.equal(taskLayout.heroRows, 2)
        assert.equal(taskLayout.currentSummaryCount, 1)
        assert.equal(taskLayout.attachmentInHero, false)
        assert.equal(taskLayout.attachmentInFooter, true)
        assert(taskLayout.attachmentHeight >= 44, JSON.stringify(taskLayout))
        assert.equal(taskLayout.footerButtons.length, taskActionAllowed ? 2 : 1)
        if (taskActionAllowed) {
          assert(Math.abs(taskLayout.footerButtons[0].top - taskLayout.footerButtons[1].top) <= 1, JSON.stringify(taskLayout))
          assert(Math.abs(taskLayout.footerButtons[0].height - taskLayout.footerButtons[1].height) <= 1, JSON.stringify(taskLayout))
          assert(taskLayout.attachmentWidth < taskLayout.heroWidth / 2, JSON.stringify(taskLayout))
        } else {
          assert(Math.abs(taskLayout.attachmentWidth - taskLayout.footerWidth) <= 1, JSON.stringify(taskLayout))
        }
        assert.deepEqual(taskLayout.steps, ['任务信息', '任务办理', '结果回执'], '任务详情首屏保留完整三步引导')
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
          .getByRole('button', { name: '关联任务，1 项', exact: true })
          .waitFor()
        assert.equal(
          await drawer
            .getByRole('button', { name: '关联任务，1 项', exact: true })
            .getAttribute('aria-expanded'),
          'true'
        )
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
          await drawer
            .getByRole('button', { name: '查看业务明细', exact: true })
            .click()
          assert(await assertMobileBackToTop(page, drawer.locator('.ant-drawer-body'), { screenshotPath: path.join(outputDir, `mobile-back-top-${role}-detail-${width}.png`), keyboard: true }), '长进度详情支持回到顶部')
          const narrowGroupGeometry = await drawer
            .locator('.mobile-progress-detail-groups')
            .evaluate((root) => {
              const rootRect = root.getBoundingClientRect()
              return {
                overflow: root.scrollWidth - root.clientWidth,
                buttons: [
                  ...root.querySelectorAll(
                    '.mobile-progress-detail-group-trigger'
                  ),
                ].map((button) => {
                  const rect = button.getBoundingClientRect()
                  return {
                    height: rect.height,
                    left: rect.left - rootRect.left,
                    right: rootRect.right - rect.right,
                    width: rect.width,
                  }
                }),
              }
            })
          assert(
            narrowGroupGeometry.overflow <= 1 &&
              narrowGroupGeometry.buttons.every(
                ({ height, left, right, width: buttonWidth }) =>
                  height >= 52 &&
                  left >= -1 &&
                  right >= -1 &&
                  buttonWidth >= width - 64
              ),
            `${width}: ${JSON.stringify(narrowGroupGeometry)}`
          )
          await page.screenshot({
            path: path.join(
              outputDir,
              `mobile-progress-${role}-business-detail-${width}.png`
            ),
          })
          await drawer
            .getByRole('button', { name: '收起业务明细', exact: true })
            .click()
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
        assert.equal(
          await drawer
            .getByRole('button', { name: '关联任务，1 项', exact: true })
            .getAttribute('aria-expanded'),
          'true'
        )
        await drawer
          .getByRole('button', {
            name: '生产执行，1 单 · 1 批次 · 1 项领料',
            exact: true,
          })
          .click()
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
          .getByRole('button', {
            name: '生产执行，1 单 · 1 批次 · 1 项领料',
            exact: true,
          })
          .waitFor()
        assert.equal(
          await drawer
            .getByRole('button', {
              name: '生产执行，1 单 · 1 批次 · 1 项领料',
              exact: true,
            })
            .getAttribute('aria-expanded'),
          'true'
        )
        await page.goBack()
        await drawer.waitFor({ state: 'hidden' })
        sparseDetail = true
        await panel
          .getByRole('button', {
            name: `查看 ${prefix}-0001 进度`,
            exact: true,
          })
          .click()
        await drawer
          .getByRole('heading', { name: `${prefix}-0001`, exact: true })
          .waitFor()
        assert.equal(
          await drawer
            .getByRole('button', { name: '查看关联任务', exact: true })
            .count(),
          0
        )
        await drawer
          .getByRole('button', { name: '查看业务明细', exact: true })
          .click()
        assert.deepEqual(
          await drawer
            .locator('.mobile-progress-detail-group-trigger')
            .evaluateAll((buttons) =>
              buttons.map((button) => button.getAttribute('aria-label'))
            ),
          ['产品信息，1 项']
        )
        await drawer
          .locator('.mobile-task-flow-header')
          .getByRole('button', { name: '返回进度', exact: true })
          .click()
        await drawer.waitFor({ state: 'hidden' })
        sparseDetail = false
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
          panel.locator('.mobile-filter-control')
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
        await page.getByRole('region', { name: '已办任务', exact: true }).waitFor()
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
        await panel.getByLabel('搜索进度').focus()
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
          '移动进度通过独立日期窗口选择，不使用两个小日期输入框'
        )
        await page.setViewportSize({ width: 320, height: 568 })
        await page.waitForTimeout(200)
        const narrowFilter = await page
          .locator('.mobile-filter-popover')
          .evaluate((node) => {
            const panel = node.querySelector('.mobile-filter-panel')
            const rect = (element) => element.getBoundingClientRect().toJSON()
            return {
              viewportHeight: document.documentElement.clientHeight,
              viewportWidth: document.documentElement.clientWidth,
              scrollWidth: document.documentElement.scrollWidth,
              bounds: rect(node),
              panel: rect(panel),
              footer: rect(panel.querySelector('footer')),
              fields: rect(panel.querySelector('.mobile-filter-fields')),
            }
          })
        assert(
          narrowFilter.scrollWidth <= 320 &&
            narrowFilter.bounds.x >= 0 &&
            narrowFilter.bounds.y >= 0 &&
            narrowFilter.bounds.x + narrowFilter.bounds.width <=
              narrowFilter.viewportWidth + 1 &&
            narrowFilter.bounds.y + narrowFilter.bounds.height <=
              narrowFilter.viewportHeight + 1 &&
            narrowFilter.panel.top >= 11 &&
            narrowFilter.panel.bottom <= narrowFilter.viewportHeight - 11 &&
            narrowFilter.fields.top >= narrowFilter.panel.top &&
            narrowFilter.footer.bottom <= narrowFilter.panel.bottom &&
            narrowFilter.fields.height > 0 &&
            narrowFilter.fields.top >= narrowFilter.panel.top &&
            narrowFilter.fields.bottom <= narrowFilter.footer.top,
          `窄屏进度筛选下拉层应保持在视口内：${JSON.stringify(narrowFilter)}`
        )
        const fields = filterPanel.locator('.mobile-filter-fields')
        await fields.evaluate((node) => { node.scrollTop = node.scrollHeight })
        const pinnedActions = await filterPanel.evaluate((node) => ({
          footerBottom: node.querySelector('footer').getBoundingClientRect().bottom,
        }))
        assert.equal(pinnedActions.footerBottom, narrowFilter.footer.bottom, '浏览更多条件时重置入口保持原位')
        await filterPanel.getByRole('button', { name: '关闭筛选', exact: true }).click({ trial: true })
        await filterPanel.getByRole('button', { name: '重置筛选', exact: true }).click({ trial: true })
        await fields.evaluate((node) => { node.scrollTop = 0 })
        await page.screenshot({
          path: path.join(
            outputDir,
            `mobile-progress-${role}-filter-dropdown-320.png`
          ),
        })
        await filterPanel.getByText('全部记录', { exact: true }).click()
        const appliedFilter = panel.locator('.mobile-filter-trigger')
        assert.equal(
          await appliedFilter.getAttribute('aria-label'),
          '筛选进度，已应用 1 项'
        )
        assert.equal(
          Number((await appliedFilter.getAttribute('title')).includes('记录范围：全部记录')),
          1,
          '非默认范围具名显示，关闭筛选后仍可核对'
        )
        await filterPanel.getByText('未结束', { exact: true }).click()
        await page.setViewportSize({ width: 390, height: 844 })
        assert.equal(
          await filterPanel.getByRole('textbox', { name: '处理人或业务负责人' }).count(),
          0,
          '手机进度只保留一个主搜索，负责人包含在主搜索中'
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
              copy.querySelector('.erp-product-identity__picture')?.remove()
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
            '.mobile-workspace-task-views .mobile-workspace-primary-tabs',
            1
          )
          await verifyMobileNavigationMotion(
            page,
            assert,
            '.mobile-workspace-task-views .mobile-workspace-primary-tabs',
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
            .getByRole('button', { name: '选择处理方式', exact: true })
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
            .getByRole('button', { name: '返回进度详情', exact: true })
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
  return [...scenarios, ...['light', 'dark'].map((themeMode) => ({
    ...scenarios.find((scenario) => scenario.name === 'mobile-progress-boss'),
    name: `mobile-primary-tab-geometry-${themeMode}`,
    themeMode,
    verify: (page) => verifyMobilePrimaryTabGeometry(page, assert, outputDir, themeMode),
  })), ...createMobileFilterScrollScenarios({ scenarios, assert, outputDir }), {
    ...scenarios.find((scenario) => scenario.name === 'mobile-progress-pmc'),
    name: 'mobile-progress-status-counts',
    verify: async (page) => {
      const panel = page.getByTestId('mobile-progress-panel')
      await panel.getByRole('button', { name: '查看 MO-0001 进度', exact: true }).waitFor()
      await panel.getByRole('button', { name: '筛选进度', exact: true }).click()
      const filters = page.getByRole('dialog', { name: '筛选进度', exact: true })
      const conditions = filters.locator('.erp-progress-filter-fields')
      const counts = () => conditions.locator('.erp-filter-chip__count').allTextContents()
      const original = await counts()
      assert.equal(original.length, 6)
      assert(original.every((count) => /^\d[\d,]*$/.test(count)), original.join(','))
      assert.equal(await conditions.getByRole('button', { name: /^仅看未关联销售/ }).locator('.erp-filter-chip__count').innerText(), '1')
      await conditions.getByRole('button', { name: /^仅看未关联销售/ }).click()
      await panel.getByRole('button', { name: '查看 MO-0003 进度', exact: true }).waitFor()
      assert.deepEqual(await counts(), ['1', '0', '0', '0', '0', '1'], '数量保留未关联销售条件计算')
      for (const width of [320, 390, 430]) {
        await page.setViewportSize({ width, height: 844 })
        await assertNoHorizontalOverflow(page, `mobile-progress-counts-${width}`)
        const geometry = await conditions.evaluate((node) => ({ width: node.clientWidth, scroll: node.scrollWidth }))
        assert(geometry.scroll <= geometry.width + 1)
      }
      await page.screenshot({ path: path.join(outputDir, 'mobile-progress-state-counts.png') })
      await filters.getByRole('button', { name: '重置筛选', exact: true }).click()
      await filters.getByRole('button', { name: '关闭筛选', exact: true }).click()
      const quick = panel.getByRole('group', { name: '进度快捷筛选', exact: true })
      const dueSoon = quick.getByRole('button', { name: /7天内到期/ })
      await dueSoon.click()
      assert.equal(await dueSoon.getAttribute('aria-pressed'), 'true')
      assert.equal(await dueSoon.locator('.erp-filter-chip__clear').count(), 1)
      assert.equal(await panel.getByLabel('当前进度筛选').count(), 0, '快捷筛选不重复生成摘要标签')
      await dueSoon.click()
      assert.equal(await dueSoon.getAttribute('aria-pressed'), 'false')
      const search = panel.getByRole('searchbox', { name: '搜索进度', exact: true })
      await search.fill('MO-0001')
      await search.press('Enter')
      await dueSoon.click()
      const blocked = quick.getByRole('button', { name: /任务受阻/ })
      await blocked.click()
      const applied = panel.getByRole('group', { name: '当前进度筛选', exact: true })
      assert.equal(await applied.count(), 0, '仅有快捷条件时不额外生成条件行')
      await assertMobileFilterClearControl({ assert, trigger: panel.locator('.mobile-filter-trigger') })
      await panel.getByRole('button', { name: '清空进度筛选', exact: true }).tap()
      assert.equal(await search.inputValue(), 'MO-0001', '清空进度条件保留搜索')
      assert.equal(await dueSoon.getAttribute('aria-pressed'), 'false')
      assert.equal(await blocked.getAttribute('aria-pressed'), 'false')
      assert.equal(await applied.count(), 0, '清空纯快捷条件后不留空条件行')
      assert.equal(await panel.getByRole('button', { name: '筛选进度', exact: true }).count(), 1)
      await panel.getByRole('button', { name: '查看 MO-0001 进度', exact: true }).waitFor()
      await panel.getByRole('button', { name: '清除搜索', exact: true }).click()
      await panel.getByRole('button', { name: '筛选进度', exact: true }).click()
      assert.equal(await filters.locator('input, select, textarea').count(), 0)
      assert.equal(await filters.getByRole('button', { name: '自定义交期日期', exact: true }).count(), 0)
      await filters.getByRole('button', { name: '关闭筛选', exact: true }).click()
      await page.evaluate(() => {
        const history = window.history.state
        history.mobileProgress.query = { ...history.mobileProgress.query, owner: '旧负责人', from: '2026-09-01', to: '2026-09-30' }
        window.history.replaceState(history, '')
      })
      await page.reload()
      await panel.getByRole('button', { name: /^筛选进度/ }).waitFor()
      await page.waitForFunction(() => {
        const query = window.history.state?.mobileProgress?.query
        return query && !query.owner && !query.from && !query.to
      })
      await page.screenshot({ path: path.join(outputDir, 'mobile-progress-simple-filters.png') })
    },
  }]
}
