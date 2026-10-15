import { clickTaskCardContent } from './taskCopyAssertions.mjs'
import { WORKFLOW_TASK_BOARD_LANE_KEYS } from '../../src/erp/utils/workflowTaskBoardContract.mjs'

export function createTaskBusinessReturnScenarios({ assert, path, outputDir, customerRuntimeEffectiveSession, assertNoHorizontalOverflow }) {
  const returnScenarios = [false, true].map((mobile) => {
    const taskName = '确认包装版本'
    const task = {
      id: 98901,
task_code: 'source-handoff-production-packaging-93000',
task_group: 'handoff_production_packaging',
task_name: taskName,
      source_type: 'production_packaging_confirmation',
source_id: 93000,
source_no: 'MO-STYLE-L1-20260713',
      owner_role_key: 'sales',
owner_pool_key: 'sales',
required_capability_key: 'production.packaging_material.confirm',
      task_status_key: 'ready',
version: 1,
created_at: 1791648000,
priority: 0,
      payload: { source_task_contract: 'workflow.source-task/v1', source_task_producer: 'fulfillment.source', source_record_id: 93000, source_task_intent_hash: 'a'.repeat(64), entry_path: '/erp/production/orders?production_order_id=71&production_order_item_id=7101', complete_condition: '确认包材版本后自动更新待办' },
    }
    const permissions = ['workflow.task.read', 'production.wip.read', 'production.packaging_material.confirm', 'mobile.sales.access']
    let saved = false
    let detailReads = 0
    let chainReads = 0
    return {
      name: `task-business-return-${mobile ? 'mobile' : 'desktop'}`,
      path: mobile ? '/m/sales/tasks' : '/erp/task-board',
      auth: 'admin',
productionOrderReleased: true,
      viewport: mobile ? { width: 390, height: 844 } : { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      adminProfile: { is_super_admin: false,
roles: [{ role_key: 'sales', name: '业务' }],
permissions,
menus: [
        { key: 'task-board', path: '/erp/task-board', label: '任务中心', required_any: ['workflow.task.read'], required_all: [] },
        { key: 'production-orders', path: '/erp/production/orders', label: '生产订单', required_any: ['production.wip.read'], required_all: [] },
      ] },
      effectiveSession: { ...customerRuntimeEffectiveSession, pages: ['task-board', 'production-orders'], actions: permissions, workflow_visible_owner_role_keys_by_capability: { 'workflow.task.read': ['sales'] } },
      workflowTaskFixtures: [task],
      beforeNavigate: async (page) => {
        saved = false
        detailReads = 0
        chainReads = 0
        await page.route('**/rpc/production_wip', async (route) => {
          const { params } = route.request().postDataJSON()
          if (params?.action === 'CONFIRM_PACKAGING_MATERIAL') {
            assert.equal(params.packaging_version_snapshot, '彩盒与唛头已核对')
            saved = true
          }
          return route.fallback()
        })
        await page.route('**/rpc/workflow', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          let data
          if (method === 'get_task_handling_chain') {
            chainReads += 1
            if (chainReads === 1) return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 500, message: '读取失败' } } })
            const item = (id, task_name, patch = {}) => ({ id, task_name, task_group: '', task_status_key: 'ready', owner_role_key: 'sales', source_type: 'production_wip_batch', source_no: 'MO-STYLE-L1-20260713', discovery: { stage_key: 'packaging_version' }, operation_code: '', batch_no: '', exception_id: 0, ...patch })
            data = { truncated: false,
items: [
              item(98001, '成品正式入库', { task_group: 'handoff_production_completion', discovery: { stage_key: 'finished_inbound' }, task_status_key: 'done', owner_role_key: 'warehouse' }),
              item(task.id, taskName, { task_group: task.task_group }),
              ...Array.from({ length: 5 }, (_, index) => item(98100 + index, '其他单据包材确认', { task_group: task.task_group, source_no: `MO-PARALLEL-${index + 1}` })),
              item(98002, '业务发货', { source_type: 'shipment', discovery: { stage_key: 'shipment' }, task_status_key: 'blocked' }),
              item(98003, '裁片不合格处理方案', { discovery: { stage_key: 'cutting_exception' }, exception_id: 7, exception_no: 'EX-007', exception_operation_code: 'FABRIC_PROCESSING', task_status_key: 'done' }),
              item(98004, '换厂返工回货复检', { discovery: { stage_key: 'cutting_exception' }, exception_id: 7, exception_no: 'EX-007', exception_operation_code: 'FABRIC_PROCESSING', operation_code: 'SEWING', task_status_key: 'blocked', batch_no: '返工批次-尺寸颜色规格核对-'.repeat(4) }),
            ] }
            if (params.view === 'task') data.items = data.items.filter((item) => item.id === task.id)
          } else if (method === 'explain_action_access') {
            data = { task_id: task.id, source_access: { applicable: true, resolved: true, allowed: true, reason_code: 'source_access_allowed', reason: '' }, actions: [{ action_key: 'complete', allowed: false, reason: '办理来源单据后自动更新待办', reason_code: 'source_owned_task', required_permission: 'production.packaging_material.confirm', owner_role_key: 'sales' }] }
          } else if (method === 'get_task') {
            detailReads += 1
            data = { task: { ...task, ...(saved ? { task_status_key: 'done', version: 2, completed_at: 1791648100 } : {}) } }
          } else if (saved && method === 'list_role_tasks') {
            data = { items: [], next_cursor: '', has_more: false, server_time: 1791648100, counts: { approval: 0, blocked: 0, done: 1, history: 1, overdue: 0, ready: 0, rejected: 0, risk: 0, todo: 0, total: 1, withdrawn: 0 } }
          } else if (saved && method === 'get_task_board') {
            data = { snapshot_at: 1791648100, total: 0, counts: Object.fromEntries(WORKFLOW_TASK_BOARD_LANE_KEYS.map((key) => [key, 0])), lanes: (params.lane_key ? [params.lane_key] : WORKFLOW_TASK_BOARD_LANE_KEYS).map((key) => ({ key, total: 0, limit: Number(params.limit || 10), offset: Number(params.offset || 0), tasks: [] })), source_types: [], owner_role_keys: [] }
          } else return route.fallback()
          return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 0, message: '', data } } })
        })
      },
      verify: async (page) => {
        if (mobile) {
          const card = page.locator('.erp-mobile-list-item').filter({ hasText: taskName })
          await clickTaskCardContent(card, card.getByText(taskName, { exact: true }))
        }
        else await page.getByRole('button', { name: `查看${taskName}详情`, exact: true }).click()
        const focus = page.getByLabel('本任务处理进度', { exact: true })
        await focus.getByRole('button', { name: '重新读取', exact: true }).click()
        await focus.getByText(taskName, { exact: true }).waitFor()
        assert.equal(await focus.locator('li').count(), 1)
        assert.equal(await focus.locator('details').count(), 0)
        assert.equal(await page.getByLabel('订单任务链', { exact: true }).count(), 0)
        await page.screenshot({ path: path.join(outputDir, `task-chain-focused-${mobile ? 'mobile' : 'desktop-4k'}.png`) })
        await page.getByRole('button', { name: '查看订单全流程', exact: true }).click()
        const chain = page.getByLabel('订单任务链', { exact: true })
        await chain.getByText('换厂返工回货复检', { exact: true }).waitFor()
        assert.equal(await chain.getByLabel('异常分支', { exact: true }).locator('.workflow-business-chain__group').count(), 1)
        const labels = await chain.locator('.workflow-business-chain__main .workflow-business-chain__node > strong').allTextContents()
        assert.equal(labels.length, 14, '主链骨架始终完整可见')
        assert.ok(labels.includes('正式成品入库') && labels.includes('查货与包装') && labels.includes('放行与实际发货'))
        assert.equal(await chain.locator('.workflow-business-chain__main > details').count(), 0, '主链节点不折叠')
        const related = chain.locator('.workflow-business-chain__related')
        assert.equal(await related.getAttribute('open'), null)
        assert.ok((await related.locator('summary').boundingBox()).height >= 44, '关联任务展开入口保留触控尺寸')
        assert.equal(await chain.getByText('MO-PARALLEL-2', { exact: true }).isVisible(), false)
        const steps = page.getByRole(mobile ? 'navigation' : 'tablist', { name: '任务处理步骤', exact: true })
        assert.equal(await steps.isVisible(), false, '只读任务信息不显示办理步骤')
        await page.screenshot({ path: path.join(outputDir, `task-chain-compact-${mobile ? 'mobile' : 'desktop-4k'}.png`) })
        await related.locator('summary').click()
        await chain.getByText('MO-PARALLEL-2', { exact: true }).waitFor()
        await related.locator('summary').click()
        assert.equal(await chain.getByText('MO-PARALLEL-2', { exact: true }).isVisible(), false)
        await chain.locator('.ant-select-selector').click()
        await page.locator('.ant-select-dropdown:visible').getByText('仓库', { exact: true }).click()
        await page.locator('.ant-select-dropdown:visible').waitFor({ state: 'hidden' })
        await chain.locator('.workflow-business-chain__group[data-role-match="true"]').filter({ hasText: '正式成品入库' }).waitFor()
        assert.equal(await chain.locator('.workflow-business-chain__main .workflow-business-chain__node').count(), 14, '岗位筛选不裁掉上下游骨架')
        assert.equal(await chain.getByText(taskName, { exact: true }).isVisible(), true, '关注其他岗位仍保留本任务')
        assert.equal(await chain.getByText('业务发货', { exact: true }).count(), 0, '收起其他岗位的任务明细')
        await chain.locator('.ant-select-selector').click()
        await page.locator('.ant-select-dropdown:visible').getByText('全部岗位', { exact: true }).click()
        await page.locator('.ant-select-dropdown:visible').waitFor({ state: 'hidden' })
        await chain.getByText('业务发货', { exact: true }).waitFor()
        const chainGeometry = await chain.evaluate((node) => ({ width: node.clientWidth, scroll: node.scrollWidth }))
        assert.ok(chainGeometry.scroll <= chainGeometry.width + 1, '任务链长批次号不能撑破办理区域')
        await page.getByRole('button', { name: '返回本任务', exact: true }).click()
        await focus.getByText(taskName, { exact: true }).waitFor()
        assert.equal(await page.getByLabel('订单任务链', { exact: true }).count(), 0)
        await page.getByRole('button', { name: /进入单据办理$/u }).click()
        await page.waitForURL(mobile ? /\/m\/sales\/handle\/production\/orders/u : /\/erp\/production\/orders/u)
        const modal = page.getByRole('dialog').filter({ hasText: '生产工序办理' }).last()
        await modal.getByRole('button', { name: '确认包材要求', exact: true }).click()
        await modal.getByLabel('包装版本', { exact: true }).fill('彩盒与唛头已核对')
        await modal.getByRole('button', { name: '确认办理', exact: true }).click()
        await page.getByText('包材要求已确认', { exact: true }).waitFor()
        assert.equal(saved, true)
        await modal.locator('.ant-modal-footer').getByRole('button', { name: '关闭', exact: true }).click()
        await modal.waitFor({ state: 'hidden' })
        const beforeReturnReads = detailReads
        await page.getByRole('button', { name: '返回任务', exact: true }).click()
        await page.waitForURL(mobile ? /\/m\/sales\/tasks/u : /\/erp\/task-board/u)
        const detail = mobile ? page.getByTestId('mobile-task-detail-screen') : page.locator('.ant-drawer:visible')
        await detail.getByText(taskName, { exact: true }).first().waitFor()
        await detail.getByText('已完成', { exact: true }).first().waitFor()
        assert.ok(detailReads > beforeReturnReads, '返回时须重新读取任务，即使已从待办列表移除')
        assert.equal(await page.evaluate(() => window.history.state?.usr?.workflowTaskReturn ?? null), null)
        await assertNoHorizontalOverflow(page, `task-business-return-${mobile ? 'mobile' : 'desktop'}`)
      },
    }
  })
  const mobileReturn = {
    ...returnScenarios.find((scenario) => scenario.name === 'task-business-return-mobile'),
    name: 'mobile-business-back-top-return',
    verify: async (page) => {
      const taskName = '确认包装版本'
      const card = page.locator('.erp-mobile-list-item').filter({ hasText: taskName })
      await clickTaskCardContent(card, card.getByText(taskName, { exact: true }))
      await page.getByRole('button', { name: /进入单据办理$/u }).click()
      await page.waitForURL(/\/m\/sales\/handle\/production\/orders/u)
      const modal = page.getByRole('dialog').filter({ hasText: '生产工序办理' }).last()
      await modal.locator('.ant-modal-footer').getByRole('button', { name: '关闭', exact: true }).click()
      await modal.waitFor({ state: 'hidden' })
      await assertNoHorizontalOverflow(page, '手机业务办理独立滚动区')
      await page.getByRole('button', { name: '返回任务', exact: true }).click()
      await page.waitForURL(/\/m\/sales\/tasks/u)
      const detail = page.getByTestId('mobile-task-detail-screen')
      await detail.getByRole('heading', { name: taskName, exact: true }).waitFor()
      assert.equal(await page.evaluate(() => window.history.state?.usr?.workflowTaskReturn ?? null), null)
      await assertNoHorizontalOverflow(page, '手机业务返回原任务')
    },
  }
  return [...returnScenarios, mobileReturn, ...createFocusedExceptionScenarios({ assert, path, outputDir, customerRuntimeEffectiveSession, assertNoHorizontalOverflow })]
}

function createFocusedExceptionScenarios({
  assert,
  path,
  outputDir,
  customerRuntimeEffectiveSession,
  assertNoHorizontalOverflow,
}) {
  return [
    { mobile: false, dark: false },
    { mobile: true, dark: false },
    { mobile: true, dark: true },
  ].map(({ mobile, dark }) => {
    const task = {
      id: 98941,
      version: 1,
      task_code: 'source-production_exception-941',
      task_group: 'production_exception',
      task_name: '处理返工异常 RW-FOCUS-041',
      source_type: 'production_fact',
      source_id: 941,
      source_no: 'RW-FOCUS-041',
      task_status_key: 'ready',
      owner_role_key: 'production',
      owner_pool_key: 'production',
      required_capability_key: 'workflow.task.complete',
      created_at: 1791648000,
      priority: 0,
      payload: {
        source_task_contract: 'workflow.source-task/v1',
        source_task_producer: 'production_rework.post',
        source_task_intent_hash: 'a'.repeat(64),
        record_title: '返工记录 RW-FOCUS-041',
        production_fact_id: 941,
        product_name: '月亮小兔',
        handling_note: '缝线不合格，需要返工复检',
        entry_path: '/erp/production/progress',
      },
    }
    const permissions = [
      'workflow.task.read',
      'workflow.task.complete',
      'production.fact.read',
      'mobile.production.access',
    ]
    let views = []
    return {
      name: `task-exception-focus-${mobile ? (dark ? 'mobile-dark' : 'mobile') : 'desktop'}`,
      path: mobile ? '/m/production/tasks' : '/erp/task-board',
      auth: 'admin',
      themeMode: dark ? 'dark' : 'light',
      viewport: mobile
        ? { width: dark ? 320 : 390, height: 844 }
        : { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      adminProfile: {
        is_super_admin: false,
        roles: [{ role_key: 'production', name: '生产经理' }],
        permissions,
        menus: [
          {
            key: 'task-board',
            path: '/erp/task-board',
            label: '任务管理',
            required_any: ['workflow.task.read'],
            required_all: [],
          },
        ],
      },
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        pages: ['task-board'],
        actions: permissions,
        workflow_visible_owner_role_keys_by_capability: {
          'workflow.task.read': ['production'],
        },
      },
      workflowTaskFixtures: [task],
      beforeNavigate: async (page) => {
        views = []
        await page.route('**/rpc/workflow', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (method !== 'get_task_handling_chain') return route.fallback()
          views.push(params.view)
          assert.ok(['task', 'order'].includes(params.view))
          const items = [
            { ...task, exception_id: 0 },
            {
              ...task,
              id: 98942,
              task_name: '安排本次返工',
              task_status_key: 'done',
              source_type: 'production_wip_batch',
              operation_code: 'HANDWORK',
              batch_no: 'RW-041-01',
            },
            {
              ...task,
              id: 98943,
              task_name: '本次返工回货复检',
              task_status_key: 'blocked',
              source_type: 'quality_inspection',
              owner_role_key: 'quality',
              operation_code: 'HANDWORK',
              batch_no: 'RW-041-01-尺寸颜色规格核对-'.repeat(3),
            },
          ]
          if (params.view === 'order')
            { items.push(
              ...Array.from({ length: 65 }, (_, index) => ({
                ...task,
                id: 99000 + index,
                task_name: `同订单其他单据任务 ${index + 1}`,
                source_type: 'purchase_order',
                source_no: `PO-PARALLEL-${index + 1}`,
                task_status_key: 'blocked',
              }))
            ) }
          return route.fulfill({
            json: {
              jsonrpc: '2.0',
              id,
              result: {
                code: 0,
                message: '',
                data: { items, truncated: false },
              },
            },
          })
        })
      },
      verify: async (page) => {
        if (mobile) {
          const card = page
            .locator('.erp-mobile-list-item')
            .filter({ hasText: task.task_name })
          await clickTaskCardContent(
            card,
            card.getByText(task.task_name, { exact: true })
          )
        } else {
          const card = page
            .locator('.erp-task-card')
            .filter({ hasText: task.task_name })
          await clickTaskCardContent(
            card,
            card.getByText(task.task_name, { exact: true })
          )
        }
        const focus = page.getByLabel('本任务处理进度', { exact: true })
        await focus.getByText('本次返工回货复检', { exact: true }).waitFor()
        assert.deepEqual(views, ['task'])
        assert.equal(await focus.locator('li').count(), 3)
        const history = focus.locator('.workflow-business-chain__history')
        assert.equal(await history.getAttribute('open'), null)
        assert.equal(await focus.getByText('安排本次返工', { exact: true }).isVisible(), false)
        await history.locator('summary').click()
        await focus.getByText('安排本次返工', { exact: true }).waitFor()
        await history.locator('summary').click()
        assert.equal(await focus.getByText('安排本次返工', { exact: true }).isVisible(), false)
        assert.equal(
          await page.getByText('同订单其他单据任务 1', { exact: true }).count(),
          0,
          '无关任务不能藏在本任务详情的折叠内'
        )
        const metrics = await focus.evaluate((node) => ({
          width: node.clientWidth,
          scroll: node.scrollWidth,
          height: node.getBoundingClientRect().height,
        }))
        assert.ok(metrics.scroll <= metrics.width + 1)
        assert.ok(metrics.height < 550, '本次异常进度无需翻阅整单业务环节')
        const toggle = page.getByRole('button', {
          name: '查看订单全流程',
          exact: true,
        })
        assert.ok((await toggle.boundingBox()).height >= 44)
        await focus.scrollIntoViewIfNeeded()
        await page.screenshot({
          animations: 'disabled',
          path: path.join(
            outputDir,
            `task-exception-focus-${mobile ? (dark ? 'mobile-dark' : 'mobile') : 'desktop-4k'}.png`
          ),
        })
        await focus
          .locator('..')
          .screenshot({
            animations: 'disabled',
            path: path.join(
              outputDir,
              `task-exception-focus-${mobile ? (dark ? 'mobile-dark' : 'mobile') : 'desktop'}-progress.png`
            ),
          })
        await toggle.focus()
        await page.keyboard.press('Enter')
        await page
          .getByLabel('订单任务链', { exact: true })
          .getByText('同订单其他单据任务 1', { exact: true })
          .waitFor()
        assert.deepEqual(views, ['task', 'order'])
        const back = page.getByRole('button', {
          name: '返回本任务',
          exact: true,
        })
        await back.focus()
        await page.keyboard.press('Enter')
        await focus.getByText('本次返工回货复检', { exact: true }).waitFor()
        assert.equal(
          await page.getByText('同订单其他单据任务 1', { exact: true }).count(),
          0
        )
        assert.equal(
          await page
            .getByRole('button', { name: '查看订单全流程', exact: true })
            .evaluate((button) => button === document.activeElement),
          true
        )
        await assertNoHorizontalOverflow(page, 'focused-exception-chain')
      },
    }
  })
}
