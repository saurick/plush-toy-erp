import { verifyMobileNavigationMotion } from './slidingMotionAssertions.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { assertTaskCopy } from './taskCopyAssertions.mjs'

function trackingData() {
  const now = 1791367200
  const approval = { task_id: 300, task_name: '订单审批', node_instance_id: 20, owner_role_key: 'boss', assignee_name: '审批负责人', status: 'done', created_at: now, completed_at: now + 100, due_at: null }
  const current = { task_id: 301, task_name: '工程资料', node_instance_id: 21, owner_role_key: 'engineering', assignee_name: '', status: 'ready', created_at: now + 100, completed_at: null, due_at: null }
  const summary = { kind: 'process', id: 10, process_key: 'sales_order_acceptance', title: '', source_type: 'sales_order', source_id: 1, source_no: 'SO-TRACK-001', status: 'active', resolution_kind: null, started_at: now, updated_at: now + 100, completed_at: null, initiator_name: '业务小李', initiator_role_key: 'sales', current_tasks: [current] }
  const product = { kind: 'product', product_id: 7, image_attachment_id: 8801, name: '任务识图长耳兔（可拆卸围巾礼盒款）', code: 'PRODUCT-7', style_no: 'RABBIT-STYLE', supplier_item_no: '', order_no: '' }
  summary.display_context = { available: true, source_no: summary.source_no, source_line_count: null, items: [product, { ...product, product_id: 8, image_attachment_id: 0, name: '任务识图小熊', code: 'PRODUCT-8', style_no: '' }] }
  const detail = {
    summary,
    current_task_access: [{ task_id: 301, can_read: true, can_handle: true }],
tasks: [approval, current],
    nodes: [
      { id: 20, process_instance_id: 10, node_key: 'order_approval', node_type: 'approval', status: 'completed', started_at: now, completed_at: now + 100, completed_by_name: '' },
      { id: 21, process_instance_id: 10, node_key: 'engineering_data', node_type: 'human_task', status: 'active', started_at: now + 100, completed_at: null, completed_by_name: '' },
      { id: 22, process_instance_id: 10, node_key: 'end', node_type: 'end', status: 'waiting', started_at: null, completed_at: null, completed_by_name: '' },
    ],
    events: [{ id: 3, task_id: 300, event_type: 'status_changed', actor_role_key: 'boss', actor_display_name: '审批负责人', from_status_key: 'ready', to_status_key: 'done', reason: '交期和资料已核对', created_at: now + 100 }],
    events_truncated: true,
next_event_id: 3,
  }
  detail.nodes = detail.nodes.map((node) => ({ attempt: 1, version: 1, outcome: '', ...node }))
  return { summary, detail, now }
}

export function createTaskTrackingScenarios({ assert, path, outputDir, assertNoHorizontalOverflow, customerRuntimeEffectiveSession }, { readonly = false } = {}) {
  const scenarios = [{ themeMode: 'light', images: true }, { themeMode: 'dark', images: true }, { themeMode: 'light', images: false }].map(({ themeMode, images }) => {
    const { summary, detail, now } = trackingData()
    detail.current_task_access[0].can_handle = !readonly
    const records = Array.from({ length: 161 }, (_, index) => index === 20 ? summary : { ...summary, kind: 'task', id: 1000 + index, process_key: '', title: `任务分页记录 ${index + 1}`, source_no: `FOLLOW-TRACK-${index + 1}`, display_context: null, initiator_role_key: index === 0 ? '' : index === 1 ? 'admin' : 'sales', status: 'done', current_tasks: [] })
    let failFirst = true
    let failPage = true
    let failTask = true
    const calls = []
    const imageReads = []
    const actions = ['workflow.task.read', 'workflow.task.update', 'workflow.task.complete', ...(images ? ['product.read'] : [])]
    return {
      name: images ? `erp-task-tracking-${themeMode}` : 'erp-task-tracking-without-product-access',
      path: '/erp/task-board',
auth: 'admin',
themeMode,
      adminProfile: { is_super_admin: false, roles: [{ role_key: 'engineering', name: '工程' }], permissions: actions },
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        configRevision: 'style-l1-task-tracking',
        actions,
        workflow_visible_owner_role_keys_by_capability: {
          'workflow.task.read': ['engineering'],
          'workflow.task.update': ['engineering'],
          'workflow.task.complete': ['engineering'],
        },
      },
      viewport: { width: 1920, height: 1080 },
deviceScaleFactor: 2,
      workflowTaskFixtures: [{
        id: 301,
task_code: 'PROC-10-NODE-21-A1',
task_group: 'engineering_data',
task_name: 'engineering_data',
        source_type: 'sales_order',
source_id: 1,
source_no: 'SO-TRACK-001',
task_status_key: 'ready',
        owner_role_key: 'engineering',
required_capability_key: 'workflow.task.complete',
        process_instance_id: 10,
process_node_instance_id: 21,
process_definition_revision_id: 11,
        version: 7,
created_at: now,
payload: {},
      }],
      workflowProcessContextFixtures: [{ taskID: 301,
processContext: {
        source: { type: 'sales_order', id: 1, no: 'SO-TRACK-001' },
        process_instance: { id: 10, process_key: 'sales_order_acceptance', process_version: 'v1', status: 'active', started_at: now, completed_at: null },
        nodes: detail.nodes,
        current_nodes: [detail.nodes[1]],
completed_nodes: [detail.nodes[0]],
linked_node: detail.nodes[1],
        current_responsibilities: [{ node_instance_id: 21, owner_role_key: 'engineering' }],
approval_form: null,
      } }],
      beforeNavigate: async (page) => {
        failFirst = true
        failPage = true
        failTask = true
        calls.length = 0
        imageReads.length = 0
        await page.route('**/rpc/attachment', async (route) => {
          const body = route.request().postDataJSON()
          if (body.method === 'download_attachment') imageReads.push(body.params)
          return route.fallback()
        })
        await page.route('**/rpc/workflow', async (route) => {
          const body = route.request().postDataJSON()
          if (body.method === 'get_task' && failTask) {
            failTask = false
            return route.fulfill({ json: { jsonrpc: '2.0', id: body.id, result: { code: 500, message: '任务暂时无法读取，请重试', data: {} } } })
          }
          if (!['list_tracking', 'get_tracking'].includes(body.method)) return route.fallback()
          const params = body.params || {}
          calls.push({ method: body.method, params })
          let data
          if (body.method === 'get_tracking') {
            data = { tracking: params.before_event_id ? { ...detail, events: [{ id: 2, task_id: 300, event_type: 'created', actor_role_key: 'sales', actor_display_name: '业务小李', from_status_key: null, to_status_key: 'ready', reason: null, created_at: now }], events_truncated: false, next_event_id: 0 } : detail }
          } else if (failFirst || (params.offset === 20 && failPage)) {
            failFirst = false
            if (params.offset === 20) failPage = false
            return route.fulfill({ json: { jsonrpc: '2.0', id: body.id, result: { code: 500, message: '读取暂不可用', data: {} } } })
          } else {
            const filtered = params.keyword ? [] : records
            const limit = params.limit ?? 20
            const offset = params.offset ?? 0
            data = { items: filtered.slice(offset, offset + limit), total: filtered.length, limit, offset }
          }
          return route.fulfill({ json: { jsonrpc: '2.0', id: body.id, result: { code: 0, message: '', data } } })
        })
      },
      verify: async (page) => {
        const scopeSelector = '.erp-task-management-scope .ant-segmented'
        const scopeIndex = async (label) => (await page.locator(`${scopeSelector} .ant-segmented-item`).allTextContents()).findIndex((text) => text.trim() === label)
        await page.locator(scopeSelector).getByText('流程跟踪', { exact: true }).waitFor()
        await verifyMobileNavigationMotion(page, assert, scopeSelector, await scopeIndex('流程跟踪'))
        await page.getByText('任务进度加载失败', { exact: true }).waitFor()
        await page.getByRole('button', { name: '重新读取', exact: true }).click()
        const panel = page.locator('.erp-workflow-tracking-panel')
        const pager = panel.getByRole('navigation', { name: '流转记录分页' })
        await panel.getByText('任务分页记录 1', { exact: true }).waitFor()
        const historicalInitiator = panel.locator('.ant-table-row').nth(0).locator('.erp-workflow-initiator')
        assert.equal(await historicalInitiator.innerText(), '业务小李')
        assert.equal(await historicalInitiator.locator('small').count(), 0)
        assert.equal(await historicalInitiator.locator('strong').getAttribute('title'), '发起时岗位未留存')
        assert.match(await panel.locator('.ant-table-row').nth(1).innerText(), /发起岗位：管理员/)
        assert.match(await pager.innerText(), /第 1–20 条，共 161 条/)
        assert.equal(await panel.getByRole('button', { name: '加载更多', exact: true }).count(), 0)
        await pager.getByRole('button', { name: '下一页', exact: true }).click()
        await panel.getByText('任务进度加载失败', { exact: true }).waitFor()
        assert.equal(await panel.getByText('任务分页记录 1', { exact: true }).count(), 0, 'failed page must not be presented as earlier rows')
        await panel.getByRole('button', { name: '重新读取', exact: true }).click()
        await panel.getByText('SO-TRACK-001', { exact: true }).waitFor()
        assert.match(await panel.innerText(), /岗位：工程 · 待处理/s)
        const roleLabel = panel.locator('.erp-workflow-responsibilities__role').first()
        assert.equal(await roleLabel.textContent(), '岗位：工程')
        const roleStyle = await roleLabel.evaluate((element) => {
          const style = getComputedStyle(element)
          return { weight: Number(style.fontWeight), background: style.backgroundColor, border: style.borderTopWidth, interactive: Boolean(element.closest('button, a, [role="button"]')) }
        })
        assert.ok(roleStyle.weight >= 600, JSON.stringify(roleStyle))
        assert.notEqual(roleStyle.background, 'rgba(0, 0, 0, 0)')
        assert.equal(roleStyle.border, '1px')
        assert.equal(roleStyle.interactive, false)
        assert.match(await pager.innerText(), /第 21–40 条，共 161 条/)
        assert.equal(new URL(page.url()).searchParams.get('track_page_started'), '2')
        const firstRowBox = await panel.locator('.ant-table-row').first().boundingBox()
        assert.ok(firstRowBox.y >= 0 && firstRowBox.y + firstRowBox.height < 1080, 'new page starts at the first record')
        const jump = pager.locator('.ant-pagination-options-quick-jumper input')
        await jump.fill('9')
        await jump.press('Enter')
        await panel.getByText('任务分页记录 161', { exact: true }).waitFor()
        assert.equal(await panel.locator('.ant-table-row').count(), 1)
        assert.match(await pager.innerText(), /第 161–161 条，共 161 条/)
        await pager.getByRole('button', { name: '上一页', exact: true }).click()
        await panel.getByText('任务分页记录 141', { exact: true }).waitFor()
        await pager.locator('.ant-select[aria-label="每页流转记录数"]').click()
        await page.locator('.ant-select-dropdown:visible').getByText('8 条 / 页', { exact: true }).click()
        await panel.getByText('任务分页记录 1', { exact: true }).waitFor()
        assert.equal(await panel.locator('.ant-table-row').count(), 8)
        await waitForFiniteAnimations(page)
        assert.equal(new URL(page.url()).searchParams.get('track_page_started'), '1')
        await pager.locator('.ant-select[aria-label="每页流转记录数"]').click()
        await page.locator('.ant-select-dropdown:visible').getByText('20 条 / 页', { exact: true }).click()
        await page.waitForFunction(() => document.querySelectorAll('.erp-workflow-tracking-panel .ant-table-row').length === 20)
        await pager.locator('.ant-pagination-item-2').click()
        await panel.getByText('SO-TRACK-001', { exact: true }).waitFor()
        const row = page.locator('.erp-workflow-tracking-panel .ant-table-row').filter({ hasText: 'SO-TRACK-001' })
        assert.equal(await row.locator('.erp-workflow-tracking-title a, .erp-workflow-tracking-title .ant-btn-link').count(), 0)
        assert.match(await row.innerText(), /共 2 项关联内容/)
        assert.match(await row.innerText(), /内部款号 RABBIT-STYLE/)
        const initiator = row.locator('.erp-workflow-initiator')
        assert.match(await initiator.innerText(), /业务小李.*发起岗位：业务/s)
        const initiatorGeometry = await initiator.evaluate((element) => {
          const name = element.querySelector('strong').getBoundingClientRect()
          const role = element.querySelector('small').getBoundingClientRect()
          return { nameBottom: name.bottom, roleTop: role.top, width: element.clientWidth, scrollWidth: element.scrollWidth }
        })
        assert.ok(initiatorGeometry.roleTop >= initiatorGeometry.nameBottom, JSON.stringify(initiatorGeometry))
        assert.ok(initiatorGeometry.scrollWidth <= initiatorGeometry.width + 1, JSON.stringify(initiatorGeometry))
        await page.screenshot({ path: path.resolve(outputDir, `erp-task-tracking-${themeMode}-initiator-4k.png`) })
        const drawer = page.locator('.erp-workflow-tracking-drawer')
        const copy = row.getByRole('button', { name: '复制单据编号', exact: true })
        await assertTaskCopy(page, copy, 'SO-TRACK-001', { keyboard: true })
        await assertTaskCopy(page, copy, 'SO-TRACK-001', { fallback: true })
        await assertTaskCopy(page, copy, '', { failure: true })
        assert.equal(await drawer.isVisible(), false, 'copy must not open progress')
        const image = row.getByRole('button', { name: '查看任务识图长耳兔（可拆卸围巾礼盒款）大图', exact: true })
        if (images) {
          await image.click()
          await page.getByRole('button', { name: '关闭图片预览', exact: true }).waitFor()
          assert.equal(await drawer.isVisible(), false, 'image preview must not open progress')
          await page.getByRole('button', { name: '关闭图片预览', exact: true }).click()
          await page.locator('.erp-task-image-preview__stage').waitFor({ state: 'detached' })
          assert.equal(await image.evaluate((element) => element === document.activeElement), true)
        } else {
          assert.equal(await image.count(), 0)
          assert.equal(imageReads.length, 0, 'a tracking reader without product access must not download images')
        }
        await row.locator('td').nth(3).evaluate((element) => {
          const selection = window.getSelection()
          const range = document.createRange()
          range.selectNodeContents(element)
          selection.removeAllRanges(); selection.addRange(range)
          element.click()
        })
        assert.equal(await drawer.isVisible(), false, 'selecting row text must not open the drawer')
        await page.evaluate(() => window.getSelection().removeAllRanges())
        await row.locator('td').nth(3).click()
        await drawer.getByText('审批已通过', { exact: true }).waitFor()
        assert.match(await drawer.locator('.erp-workflow-initiator').innerText(), /业务小李.*发起岗位：业务/s)
        await assertTaskCopy(page, drawer.getByRole('button', { name: '复制单据编号', exact: true }), 'SO-TRACK-001')
        await drawer.getByText('展开其余 1 项关联内容', { exact: true }).click()
        await drawer.getByText('任务识图小熊', { exact: true }).waitFor()
        assert.equal(await drawer.getByRole('img', { name: '任务识图小熊：暂无可显示的图片', exact: true }).count(), 1)
        assert.match(await drawer.innerText(), /审批负责人.*老板/s)
        assert.match(await drawer.innerText(), /交期和资料已核对/)
        assert.equal(await drawer.getByText('流程结束', { exact: true }).count(), 0)
        assert.equal(await drawer.locator('[aria-current="step"]').count(), 1)
        assert.equal(await drawer.getByRole('region', { name: '流程概况', exact: true }).getByRole('group', { name: '当前进度', exact: true }).getByRole('button').count(), 0)
        const entryAction = drawer.locator('.ant-drawer-footer').getByRole('button', { name: '去处理工程资料', exact: true })
        const beforeScroll = await entryAction.boundingBox()
        await drawer.locator('.ant-drawer-body').evaluate((element) => { element.scrollTop = element.scrollHeight })
        assert.deepEqual(await entryAction.boundingBox(), beforeScroll, 'task entry remains fixed while progress scrolls')
        await entryAction.click()
        await drawer.getByRole('alert').waitFor()
        assert.equal(await drawer.locator('.ant-drawer-footer [role="alert"]').count(), 1)
        await entryAction.click()
        const handling = page.locator('.erp-task-action-drawer')
        await handling.getByRole('button', { name: '返回流程', exact: true }).waitFor()
        await waitForFiniteAnimations(page)
        assert.equal(await drawer.isVisible(), false, 'handling must replace the progress drawer')
        await handling.locator('[aria-label="任务处理步骤"]').waitFor()
        assert.match(await handling.innerText(), /核对任务.*选择处理.*确认/s)
        await handling.getByRole('button', { name: '返回流程', exact: true }).click()
        await drawer.getByText('审批已通过', { exact: true }).waitFor()
        await waitForFiniteAnimations(page)
        assert.equal(await handling.isVisible(), false)
        await drawer.getByRole('button', { name: '加载更早记录', exact: true }).click()
        await drawer.locator('.ant-timeline').getByText(/业务小李.*业务.*2026/).waitFor()
        await waitForFiniteAnimations(page)
        if (images) await page.screenshot({ path: path.resolve(outputDir, `erp-task-tracking-${themeMode}-detail-4k.png`) })
        await assertNoHorizontalOverflow(page)
        await drawer.locator('.erp-workflow-initiator > strong').evaluate((element) => { element.textContent = '跨部门协作的流程发起人姓名用于窄屏换行核验' })
        for (const width of [390, 320]) {
          await page.setViewportSize({ width, height: 844 })
          await waitForFiniteAnimations(page)
          const geometry = await drawer.evaluate((element) => {
            const body = element.querySelector('.ant-drawer-body')
            const footer = element.querySelector('.ant-drawer-footer').getBoundingClientRect()
            return { width: element.getBoundingClientRect().width, bodyWidth: body.clientWidth, bodyScrollWidth: body.scrollWidth, footerBottom: footer.bottom, viewportHeight: innerHeight }
          })
          assert.ok(geometry.width <= width, JSON.stringify(geometry))
          assert.ok(geometry.bodyScrollWidth <= geometry.bodyWidth + 1, JSON.stringify(geometry))
          assert.ok(geometry.footerBottom <= geometry.viewportHeight + 1, JSON.stringify(geometry))
          await assertNoHorizontalOverflow(page)
        }
        if (images) await page.screenshot({ path: path.resolve(outputDir, `erp-task-tracking-${themeMode}-narrow.png`) })
        await page.setViewportSize({ width: 1920, height: 1080 })
        await page.keyboard.press('Escape')
        await drawer.waitFor({ state: 'hidden' })
        const title = row.getByRole('button', { name: /销售订单受理/ })
        assert.equal(await title.evaluate((element) => element === document.activeElement), true, 'returning from handling and closing progress restores the original row entry')
        await page.keyboard.press('Enter')
        await drawer.getByText('审批已通过', { exact: true }).waitFor()
        await page.keyboard.press('Escape')
        await drawer.waitFor({ state: 'hidden' })
        assert.equal(await title.evaluate((element) => element === document.activeElement), true)
        const chooseScope = async (label) => {
          const scope = label === '我参与的' ? 'participated' : 'started'
          await Promise.all([
            page.waitForRequest((request) => request.url().endsWith('/rpc/workflow') && request.method() === 'POST' && request.postDataJSON().method === 'list_tracking' && request.postDataJSON().params.scope === scope),
            page.locator('.erp-task-tracking-scope').getByText(label, { exact: true }).click(),
          ])
        }
        await chooseScope('我参与的')
        await panel.getByText('任务分页记录 1', { exact: true }).waitFor()
        await waitForFiniteAnimations(page)
        const search = page.getByPlaceholder('单号 / 任务 / 产品 / 款号')
        await search.fill('不存在的单号')
        await page.getByText('当前筛选下没有匹配记录', { exact: true }).waitFor()
        await chooseScope('我发起的')
        await page.getByText('SO-TRACK-001', { exact: true }).waitFor()
        assert.equal(await search.inputValue(), '')
        assert.equal(new URL(page.url()).searchParams.get('track_page_started'), '2')
        assert.match(await pager.innerText(), /第 21–40 条，共 161 条/)
        assert(calls.filter((call) => call.method === 'list_tracking').every((call) => !('cursor' in call.params)))
        const paginationBoxes = await pager.evaluate((element) => ({ client: element.clientWidth, scroll: element.scrollWidth, bottom: element.getBoundingClientRect().bottom, viewportHeight: innerHeight }))
        assert.ok(paginationBoxes.scroll <= paginationBoxes.client + 1 && paginationBoxes.bottom <= paginationBoxes.viewportHeight + 1, JSON.stringify(paginationBoxes))
        assert(calls.some((call) => call.params.scope === 'participated'))
        assert(calls.every((call) => !('actor_id' in call.params)))
        if (images) await page.screenshot({ path: path.resolve(outputDir, `erp-task-tracking-${themeMode}-list-4k.png`) })
        if (!images) assert.equal(imageReads.length, 0)
      },
    }
  })
  const accessScenarios = ['summary-only', 'read-only', 'multiple', 'multiple-narrow'].map((mode) => {
    const base = scenarios[0]
    const { detail } = trackingData()
    const multiple = mode.startsWith('multiple')
    detail.current_task_access[0] = { task_id: 301, can_read: mode !== 'summary-only', can_handle: multiple }
    if (multiple) {
      const parallel = { ...detail.tasks[1], task_id: 302, task_name: '核对毛绒产品工程技术规格与客户最终确认样品的全部材料和尺寸要求' }
      const hidden = { ...detail.tasks[1], task_id: 303, task_name: '订单审批', owner_role_key: 'boss', required_capability_key: 'workflow.task.approve' }
      detail.tasks.push(parallel, hidden)
      detail.summary.current_tasks.push(parallel, hidden)
      detail.current_task_access.push({ task_id: 302, can_read: true, can_handle: false }, { task_id: 303, can_read: false, can_handle: false })
    }
    const taskReads = []
    const actions = base.adminProfile.permissions.filter((permission) => mode !== 'read-only' || !['workflow.task.complete', 'workflow.task.update'].includes(permission))
    return {
      ...base,
      name: `erp-task-tracking-access-${mode}`,
      path: '/erp/task-board?tracking=visible&track_kind=process&track_id=10',
      viewport: mode === 'multiple-narrow' ? { width: 320, height: 844 } : base.viewport,
      adminProfile: { ...base.adminProfile, permissions: actions },
      effectiveSession: { ...base.effectiveSession, actions },
      beforeNavigate: async (page) => {
        taskReads.length = 0
        await base.beforeNavigate(page)
        await page.route('**/rpc/workflow', async (route) => {
          const body = route.request().postDataJSON()
          if (body.method === 'get_task') taskReads.push(body.params.task_id)
          if (body.method !== 'get_tracking') return route.fallback()
          return route.fulfill({ json: { jsonrpc: '2.0', id: body.id, result: { code: 0, message: '', data: { tracking: detail } } } })
        })
      },
      verify: async (page) => {
        const drawer = page.getByRole('dialog', { name: '流程跟踪', exact: true })
        await drawer.getByRole('region', { name: '流程概况', exact: true }).getByRole('group', { name: '当前进度', exact: true }).waitFor()
        const footer = drawer.locator('.ant-drawer-footer')
        assert.equal(await drawer.locator('.ant-drawer-header').getByRole('button', { name: /刷新进度/ }).count(), 0, 'refresh must not return to the drawer header')
        assert.equal(await footer.getByRole('button', { name: /刷新进度/ }).count(), 1, 'refresh shares the fixed footer with task entry actions')
        const action = footer.locator('.erp-workflow-tracking-open-task')
        assert.equal(await drawer.getByRole('region', { name: '流程概况', exact: true }).getByRole('group', { name: '当前进度', exact: true }).getByRole('button').count(), 0)
        assert.deepEqual(taskReads, [])
        if (mode === 'summary-only') {
          assert.equal(await action.count(), 0, 'tracking-only reader has no task entry')
          assert.match(await drawer.innerText(), /岗位：工程.*待处理/s)
        } else if (multiple) {
          assert.equal(await action.isDisabled(), true, 'parallel tasks need an explicit choice')
          const select = footer.locator('.ant-select[aria-label="选择当前任务"]')
          await select.click()
          const options = page.locator('.ant-select-dropdown:visible .ant-select-item-option')
          assert.equal(await options.count(), 2, 'unreadable tasks are excluded from choices')
          await options.nth(1).click()
          assert.match(await action.innerText(), /^查看核对毛绒产品/)
          const geometry = await footer.evaluate((element) => {
            const action = element.querySelector('.erp-workflow-tracking-open-task')
            const back = element.querySelector('button')
            const a = action.getBoundingClientRect()
            const b = back.getBoundingClientRect()
            const f = element.getBoundingClientRect()
            return { width: element.clientWidth, scrollWidth: element.scrollWidth, footerBottom: f.bottom, viewport: innerHeight, actionTop: a.top, actionBottom: a.bottom, actionLeft: a.left, backRight: b.right }
          })
          assert.ok(geometry.scrollWidth <= geometry.width && geometry.footerBottom <= geometry.viewport && geometry.actionLeft >= geometry.backRight && geometry.actionBottom <= geometry.footerBottom, JSON.stringify(geometry))
          await drawer.locator('.ant-drawer-body').evaluate((element) => { element.scrollTop = element.scrollHeight })
          assert.equal((await action.boundingBox()).y, geometry.actionTop, 'long selected action stays fixed')
          await waitForFiniteAnimations(page)
          await page.screenshot({ path: path.resolve(outputDir, `erp-task-tracking-access-${mode}-selected.png`) })
          await select.click()
          await page.locator('.ant-select-dropdown:visible .ant-select-item-option').first().click()
          assert.equal(await action.innerText(), '去处理工程资料')
        } else {
          assert.equal(await action.innerText(), '查看任务')
        }
        if (mode !== 'summary-only') {
          await action.click()
          await footer.getByRole('alert').waitFor()
          await action.click()
          await page.locator('.erp-task-action-drawer').getByRole('button', { name: '返回流程', exact: true }).waitFor()
          if (mode === 'read-only') assert.equal(await page.locator('.erp-task-action-drawer .ant-drawer-footer .ant-btn-primary').count(), 0, 'read-only entry does not expose a handling action')
          assert.deepEqual(taskReads, [301, 301], 'only the chosen task is read; failure permits retry')
          await page.locator('.erp-task-action-drawer').getByRole('button', { name: '返回流程', exact: true }).click()
          await drawer.getByRole('region', { name: '流程概况', exact: true }).getByRole('group', { name: '当前进度', exact: true }).waitFor()
          if (multiple) assert.equal(await action.isDisabled(), true, 'return rechecks permissions and task selection')
        }
        if (!multiple) await page.screenshot({ path: path.resolve(outputDir, `erp-task-tracking-access-${mode}-4k.png`) })
        await assertNoHorizontalOverflow(page, `任务入口权限 ${mode}`)
      },
    }
  })
  return [...scenarios, ...accessScenarios]
}
