import { verifyMobileNavigationMotion } from './slidingMotionAssertions.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { assertTaskCopy } from './taskCopyAssertions.mjs'

export async function assertTrackingNavigation(page, assert, drawer) {
  await waitForFiniteAnimations(page)
  const header = drawer.locator('.ant-drawer-header')
  const back = header.getByRole('button', { name: '返回列表', exact: true })
  const footer = drawer.locator('.ant-drawer-footer')
  assert.equal(await header.getByRole('button', { name: '关闭', exact: true }).count(), 0)
  assert.equal(await footer.getByRole('button', { name: /^返回/ }).count(), 0)
  const geometry = await drawer.evaluate((element) => {
    const box = element.getBoundingClientRect()
    const back = element.querySelector('.ant-drawer-header button').getBoundingClientRect()
    const title = element.querySelector('.ant-drawer-title').getBoundingClientRect()
    const footer = element.querySelector('.ant-drawer-footer')
    return {
      backOffset: back.left - box.left,
      backWidth: back.width,
      backHeight: back.height,
      centeredTitle: Math.abs(title.left + title.width / 2 - box.left - box.width / 2) < 1,
      footerOverflow: footer.scrollWidth - footer.clientWidth,
      buttonHeights: [...footer.querySelectorAll('button')].map((button) => button.getBoundingClientRect().height),
    }
  })
  assert.ok(geometry.backOffset >= 0 && geometry.backOffset <= 16, JSON.stringify(geometry))
  assert.ok(geometry.backWidth >= 44 && geometry.backHeight >= 44 && geometry.centeredTitle, JSON.stringify(geometry))
  assert.ok(geometry.footerOverflow < 2 && geometry.buttonHeights.every((height) => height >= 44), JSON.stringify(geometry))
  await back.focus()
  assert.equal(await back.evaluate((element) => element === document.activeElement), true)
}

export async function assertTrackingExceptionContext(page, assert, drawer, screenshotPath) {
  const details = drawer.locator('.erp-workflow-tracking-exceptions')
  const summary = details.locator(':scope > summary')
  assert.equal(await details.getAttribute('open'), null)
  assert.equal(await details.locator('.workflow-exceptions').count(), 0)
  await summary.click()
  await details.getByText('EX-TRACK-010', { exact: true }).waitFor()
  assert.equal(await details.locator('.workflow-exceptions__query, .workflow-exceptions__states, .workflow-exceptions__summary').count(), 0)
  assert.equal(await details.getByText('EX-UNRELATED', { exact: true }).count(), 0)
  assert.equal(await details.locator('details[open]').count(), 0)
  assert.equal(await details.locator('.workflow-exceptions__pending').count(), 1)
  assert.match(await details.innerText(), /当前待办.*工程资料/s)
  const geometry = await details.evaluate((element) => ({ width: element.clientWidth, scroll: element.scrollWidth, touch: element.querySelector('summary').getBoundingClientRect().height }))
  assert.ok(geometry.scroll <= geometry.width + 1 && geometry.touch >= 44, JSON.stringify(geometry))
  if (screenshotPath) {
    await page.waitForFunction(() => !document.querySelector('.ant-message-notice-content'))
    await page.screenshot({ path: screenshotPath })
  }
  await summary.click()
  await details.locator('.workflow-exceptions').waitFor({ state: 'detached' })
}

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
          if (body.method === 'list_exceptions') {
            const scoped = body.params?.tracking_kind === 'process' && body.params?.tracking_id === 10
            const task = { id: 301, task_name: '工程资料', task_status_key: 'ready', owner_role_key: 'engineering', discovery: { assignee_name: '', path: '订单履约 / 工程资料' } }
            const data = { items: [{ key: 'quality:10', number: scoped ? 'EX-TRACK-010' : 'EX-UNRELATED', state: 'open', reason: '确认样与工艺说明不一致', batch_no: 'WIP-TRACK-010', occurred_at: '2026-10-13T08:00:00Z', tasks: [task], task_ids: [301], orders: [{ id: 1, number: 'SO-TRACK-001' }], quality_photo_sources: [] }], tasks: [], orders: [], total: 1, view_total: 1, open: 1, closed: 0, pending_plan: 1, executing: 0, pending_tasks: 1, affected_orders: 1 }
            return route.fulfill({ json: { jsonrpc: '2.0', id: body.id, result: { code: 0, data } } })
          }
          if (body.method === 'get_task' && failTask) {
            failTask = false
            return route.fulfill({ json: { jsonrpc: '2.0', id: body.id, result: { code: 500, message: '任务暂时无法读取，请重试', data: {} } } })
          }
          if (!['list_tracking', 'get_tracking'].includes(body.method)) return route.fallback()
          const params = body.params || {}
          calls.push({ method: body.method, params })
          let data
          if (body.method === 'get_tracking') {
            const selected = records.find((entry) => entry.kind === params.kind && entry.id === params.id)
            data = { tracking: params.kind === 'task'
              ? { summary: selected, nodes: [], tasks: [], current_task_access: [], events: [], events_truncated: false, next_event_id: 0 }
              : params.before_event_id ? { ...detail, events: [{ id: 2, task_id: 300, event_type: 'created', actor_role_key: 'sales', actor_display_name: '业务小李', from_status_key: null, to_status_key: 'ready', reason: null, created_at: now }], events_truncated: false, next_event_id: 0 } : detail }
          } else if (failFirst || (params.offset === 20 && failPage)) {
            failFirst = false
            if (params.offset === 20) failPage = false
            return route.fulfill({ json: { jsonrpc: '2.0', id: body.id, result: { code: 500, message: '读取暂不可用', data: {} } } })
          } else {
            const facets = params.keyword ? [] : records
            const status_counts = { active: facets.filter((row) => !['completed', 'done', 'rejected', 'withdrawn'].includes(row.status)).length, completed: facets.filter((row) => ['completed', 'done', 'rejected', 'withdrawn'].includes(row.status)).length }
            const filtered = facets.filter((row) => !params.status || (['completed', 'done', 'rejected', 'withdrawn'].includes(row.status) ? 'completed' : 'active') === params.status)
            const limit = params.limit ?? 20
            const offset = params.offset ?? 0
            data = { items: filtered.slice(offset, offset + limit), total: filtered.length, status_counts, limit, offset }
          }
          return route.fulfill({ json: { jsonrpc: '2.0', id: body.id, result: { code: 0, message: '', data } } })
        })
      },
      verify: async (page) => {
        const scopeSelector = '.erp-task-management-scope .erp-sliding-tab-list'
        const scopeIndex = async (label) => (await page.locator(`${scopeSelector} [role="tab"]`).allTextContents()).findIndex((text) => text.trim() === label)
        await page.locator(scopeSelector).getByText('流程跟踪', { exact: true }).waitFor()
        await verifyMobileNavigationMotion(page, assert, scopeSelector, await scopeIndex('流程跟踪'))
        await page.getByText('任务进度加载失败', { exact: true }).waitFor()
        await page.getByRole('button', { name: '重新读取', exact: true }).click()
        const panel = page.locator('.erp-workflow-tracking-panel')
        const list = panel.getByRole('region', { name: '流程记录', exact: true })
        const pane = panel.getByRole('region', { name: '流程详情', exact: true })
        const rows = list.locator('.erp-workflow-tracking-entry')
        const pager = panel.getByRole('navigation', { name: '流转记录分页' })
        await pane.getByRole('heading', { name: '任务分页记录 1', exact: true }).waitFor()
        assert.equal(await list.locator('.erp-workflow-initiator').count(), 0, '发起人位于右侧详情')
        assert.equal(await page.getByRole('dialog', { name: '流程跟踪', exact: true }).count(), 0)
        const splitBoxes = await panel.evaluate((element) => {
          const listBox = element.querySelector('.erp-workflow-tracking-list').getBoundingClientRect()
          const paneBox = element.querySelector('.erp-workflow-tracking-pane').getBoundingClientRect()
          return { listRight: listBox.right, paneLeft: paneBox.left, topDifference: Math.abs(listBox.top - paneBox.top), paneBottom: paneBox.bottom, viewportHeight: innerHeight }
        })
        assert.ok(splitBoxes.listRight < splitBoxes.paneLeft && splitBoxes.topDifference <= 1 && splitBoxes.paneBottom <= splitBoxes.viewportHeight + 1, JSON.stringify(splitBoxes))
        assert.equal(new URL(page.url()).searchParams.has('track_id'), false, '自动预览不改变查询地址')
        assert.match(await pager.innerText(), /第 1-20 条 \/ 共 161 条/)
        assert.equal(await panel.getByRole('button', { name: '加载更多', exact: true }).count(), 0)
        await pager.locator('.ant-pagination-next button').click()
        await panel.getByText('任务进度加载失败', { exact: true }).waitFor()
        assert.equal(await panel.getByText('任务分页记录 1', { exact: true }).count(), 0, 'failed page must not be presented as earlier rows')
        await panel.getByRole('button', { name: '重新读取', exact: true }).click()
        await list.getByText('SO-TRACK-001', { exact: true }).waitFor()
        assert.match(await list.innerText(), /岗位：工程 · 待处理/s)
        const roleLabel = list.locator('.erp-workflow-responsibilities__role').first()
        assert.equal(await roleLabel.textContent(), '岗位：工程')
        const roleStyle = await roleLabel.evaluate((element) => {
          const style = getComputedStyle(element)
          return { weight: Number(style.fontWeight), background: style.backgroundColor, border: style.borderTopWidth, interactive: Boolean(element.closest('button, a, [role="button"]')) }
        })
        assert.ok(roleStyle.weight >= 600, JSON.stringify(roleStyle))
        assert.notEqual(roleStyle.background, 'rgba(0, 0, 0, 0)')
        assert.equal(roleStyle.border, '1px')
        assert.equal(roleStyle.interactive, false)
        assert.match(await pager.innerText(), /第 21-40 条 \/ 共 161 条/)
        assert.equal(new URL(page.url()).searchParams.get('track_page_visible'), '2')
        const firstRowBox = await rows.first().boundingBox()
        assert.ok(firstRowBox.y >= 0 && firstRowBox.y + firstRowBox.height < 1080, 'new page starts at the first record')
        await pager.locator('.ant-pagination-item-9').click()
        await list.getByText('任务分页记录 161', { exact: true }).waitFor()
        assert.equal(await rows.count(), 1)
        assert.match(await pager.innerText(), /第 161-161 条 \/ 共 161 条/)
        await pager.locator('.ant-pagination-prev button').click()
        await list.getByText('任务分页记录 141', { exact: true }).waitFor()
        await pager.locator('.ant-select-selector').click()
        const pageSizeOptions = await page.locator('.ant-select-dropdown:visible .ant-select-item-option-content').evaluateAll((options) => options.map((option) => ({
          height: option.getBoundingClientRect().height,
          lineHeight: Number.parseFloat(getComputedStyle(option).lineHeight),
          overflow: option.scrollWidth - option.clientWidth,
        })))
        assert(pageSizeOptions.length > 0 && pageSizeOptions.every((option) => option.height <= option.lineHeight + 1 && option.overflow <= 1), '每页条数选项应完整显示在一行内')
        await page.locator('.ant-select-dropdown:visible').getByText('100 条/页', { exact: true }).click()
        await list.getByText('任务分页记录 1', { exact: true }).waitFor()
        assert.equal(await rows.count(), 100)
        await waitForFiniteAnimations(page)
        assert.equal(new URL(page.url()).searchParams.get('track_page_visible'), '1')
        await pager.locator('.ant-select-selector').click()
        await page.locator('.ant-select-dropdown:visible').getByText('20 条/页', { exact: true }).click()
        await page.waitForFunction(() => document.querySelectorAll('.erp-workflow-tracking-panel .erp-workflow-tracking-entry').length === 20)
        await pager.locator('.ant-pagination-item-2').click()
        await list.getByText('SO-TRACK-001', { exact: true }).waitFor()
        const row = rows.filter({ hasText: 'SO-TRACK-001' })
        const sourceHeading = row.locator('.erp-workflow-tracking-document')
        assert.match(await sourceHeading.innerText(), /销售订单 · SO-TRACK-001/u)
        assert.equal(await sourceHeading.locator('a, .ant-btn-link').count(), 0)
        assert.match(await row.innerText(), /共 2 款产品/)
        assert.doesNotMatch(await row.innerText(), /内部款号 RABBIT-STYLE/)
        assert.equal(await row.locator('img, .erp-product-gallery').count(), 0)
        const progress = row.locator('.erp-workflow-tracking-progress')
        assert.match(await progress.innerText(), /工程资料.*岗位：工程 · 待处理/s)
        assert.equal((await row.innerText()).match(/待处理/gu)?.length, 1)
        assert.match(await row.locator('.erp-workflow-tracking-started-at').innerText(), /\d{2}:\d{2}$/u)
        if (images) await panel.screenshot({ path: path.resolve(outputDir, `erp-task-tracking-${themeMode}-document-list.png`) })
        const drawer = page.locator('.erp-workflow-tracking-drawer')
        const copy = row.getByRole('button', { name: '复制单据编号', exact: true })
        assert.equal(await sourceHeading.locator('.erp-task-source__number').innerText(), 'SO-TRACK-001')
        await assertTaskCopy(page, copy, 'SO-TRACK-001', { keyboard: true })
        await assertTaskCopy(page, copy, 'SO-TRACK-001', { fallback: true })
        await assertTaskCopy(page, copy, '', { failure: true })
        assert.equal(await drawer.isVisible(), false, 'copy must not open progress')
        const association = pane.locator('.erp-workflow-tracking-identity > summary')
        await association.waitFor()
        assert.equal(await pane.locator('.erp-workflow-tracking-identity img').count(), 0)
        assert.equal(await pane.getByText('RABBIT-STYLE', { exact: true }).count(), 0, '打开流程直接看进度，关联资料按需读取')
        const image = pane.getByRole('button', { name: /^查看.*(?:大图|产品图片)$/u })
        if (images) {
          await association.click()
          await pane.getByText('RABBIT-STYLE', { exact: true }).waitFor()
          await image.click()
          await page.getByRole('button', { name: '关闭图片预览', exact: true }).waitFor()
          assert.equal(await drawer.isVisible(), false, 'image preview must not open progress')
          await page.getByRole('button', { name: '关闭图片预览', exact: true }).click()
          await page.locator('.erp-task-image-preview__stage').waitFor({ state: 'detached' })
          assert.equal(await image.evaluate((element) => element === document.activeElement), true)
          await association.click()
        } else {
          assert.equal(await image.count(), 0)
          assert.equal(imageReads.length, 0, 'a tracking reader without product access must not download images')
        }
        await row.locator('.erp-workflow-tracking-started-at').evaluate((element) => {
          const selection = window.getSelection()
          const range = document.createRange()
          range.selectNodeContents(element)
          selection.removeAllRanges(); selection.addRange(range)
          element.click()
        })
        assert.equal(await drawer.isVisible(), false, 'selecting row text must not open the drawer')
        await page.evaluate(() => window.getSelection().removeAllRanges())
        assert.equal(new URL(page.url()).searchParams.has('track_id'), false, '选择文字不会选中流程')
        const another = rows.filter({ hasText: '任务分页记录 22' }).getByRole('button', { name: /流程跟踪：/u })
        await another.click()
        await pane.getByRole('heading', { name: '任务分页记录 22', exact: true }).waitFor()
        assert.equal(await another.getAttribute('aria-current'), 'true')
        await progress.click()
        const current = pane.getByRole('group', { name: '当前进度', exact: true })
        await current.getByText('下一步', { exact: true }).waitFor()
        assert.match(await current.innerText(), /工程资料.*岗位：工程.*待处理.*下一步.*核对任务要求并提交办理结果/su)
        if (images) {
          await page.locator('.ant-message-notice-content').first().waitFor({ state: 'hidden' })
          await page.screenshot({ path: path.resolve(outputDir, `workflow-split-${themeMode}-4k.png`) })
        }
        const steps = pane.getByRole('region', { name: '已发生的流程节点', exact: true })
        const approvalStep = steps.getByRole('button', { name: /订单审批/u })
        const engineeringStep = steps.getByRole('button', { name: /工程资料/u })
        assert.equal(await engineeringStep.getAttribute('aria-pressed'), 'true')
        await approvalStep.press('Enter')
        const inspected = pane.getByRole('group', { name: '所选环节', exact: true })
        await inspected.getByText('结束时间', { exact: true }).waitFor()
        assert.match(await inspected.innerText(), /审批负责人.*交期和资料已核对/su)
        assert.match(await current.innerText(), /工程资料.*岗位：工程/su, '查看历史仍能看到当前责任')
        await engineeringStep.press('Enter')
        await current.waitFor()
        const history = pane.locator('.erp-workflow-tracking-history')
        assert.equal(await history.getAttribute('open'), null)
        await history.locator('summary').click()
        await pane.getByText('审批已通过', { exact: true }).waitFor()
        assert.equal(await drawer.isVisible(), false)
        await assertTrackingExceptionContext(page, assert, pane, path.join(outputDir, `tracking-exceptions-${themeMode}-4k.png`))
        assert.match(await pane.locator('.erp-workflow-initiator').innerText(), /业务小李.*发起岗位：业务/s)
        await assertTaskCopy(page, pane.getByRole('button', { name: '复制单据编号', exact: true }), 'SO-TRACK-001')
        await association.click()
        await pane.getByText('RABBIT-STYLE', { exact: true }).waitFor()
        const detailStack = pane.locator('.erp-workflow-tracking-identity .erp-product-gallery__stack')
        assert.equal(await detailStack.count(), images ? 1 : 0)
        if (images) {
          const detailGallery = pane.getByRole('button', { name: '查看SO-TRACK-001的 2 款产品图片', exact: true })
          await detailGallery.click()
          const strip = page.getByRole('group', { name: '切换产品', exact: true })
          const secondProduct = strip.getByRole('button', { name: /任务识图小熊/u })
          await secondProduct.click()
          assert.equal(await secondProduct.getAttribute('aria-pressed'), 'true')
          await page.getByRole('button', { name: '关闭图片预览', exact: true }).click()
          await page.locator('.erp-task-image-preview__stage').waitFor({ state: 'detached' })
          assert.equal(await detailGallery.evaluate((button) => document.activeElement === button), true)
        }
        await pane.getByText('展开其余 1 项关联内容', { exact: true }).click()
        await pane.getByText('任务识图小熊', { exact: true }).waitFor()
        const imageDescription = images ? '暂无可显示的图片' : '无图片读取权限'
        await pane.getByRole('img', { name: `任务识图小熊：${imageDescription}`, exact: true }).waitFor()
        assert.match(await pane.innerText(), /审批负责人.*老板/s)
        assert.match(await pane.innerText(), /交期和资料已核对/)
        assert.equal(await pane.getByText('流程结束', { exact: true }).count(), 0)
        assert.equal(await pane.locator('[aria-current="step"]').count(), 1)
        assert.equal(await current.getByRole('button').count(), 0)
        const entryAction = pane.getByRole('button', { name: '去处理工程资料', exact: true })
        const beforeScroll = await entryAction.boundingBox()
        const paneBody = pane.locator('.erp-workflow-tracking-pane-body')
        const listBody = list.locator('.erp-workflow-tracking-list-body')
        await listBody.evaluate((element) => { element.scrollTop = 160 })
        const listPosition = await listBody.evaluate((element) => element.scrollTop)
        assert.ok(listPosition > 0)
        await paneBody.evaluate((element) => { element.scrollTop = element.scrollHeight })
        assert.equal(await listBody.evaluate((element) => element.scrollTop), listPosition, '右栏滚动不移动清单')
        assert.deepEqual(await entryAction.boundingBox(), beforeScroll, 'task entry remains fixed while progress scrolls')
        await entryAction.click()
        await pane.getByRole('alert').waitFor()
        assert.equal(await pane.locator('.erp-workflow-tracking-pane-footer [role="alert"]').count(), 1)
        await entryAction.click()
        const handling = page.locator('.erp-task-action-drawer')
        await handling.locator('.ant-drawer-header').getByRole('button', { name: '返回流程', exact: true }).waitFor()
        await handling.getByRole('button', { name: '查看此流程详情', exact: true }).waitFor()
        await handling.getByRole('heading', { name: '本任务处理记录', exact: true }).waitFor()
        assert.equal(await handling.locator('.workflow-process-stage__list').count(), 0)
        assert.equal(await handling.locator('.ant-drawer-footer').getByRole('button', { name: '返回流程', exact: true }).count(), 0)
        await waitForFiniteAnimations(page)
        assert.equal(await panel.locator('[data-tracking-entry="process:10"]').getAttribute('aria-current'), 'true', '进入任务保留流程选择')
        assert.equal(await handling.getByRole('tablist', { name: '任务处理步骤', exact: true }).isVisible(), true, '核对任务打开时保留现有三步引导')
        if (images) {
          await page.locator('.ant-message-notice-content').first().waitFor({ state: 'hidden' })
          await page.screenshot({ path: path.resolve(outputDir, `workflow-task-${themeMode}-4k.png`) })
        }
        await handling.getByRole('button', { name: '任务办理', exact: true }).click()
        await handling.getByRole('tab', { name: '任务办理', selected: true }).waitFor()
        await handling.getByRole('button', { name: '返回流程', exact: true }).click()
        await pane.getByText('审批已通过', { exact: true }).waitFor()
        await waitForFiniteAnimations(page)
        assert.equal(await handling.isVisible(), false)
        assert.equal(await listBody.evaluate((element) => element.scrollTop), listPosition, '从任务返回保留清单滚动位置')
        await pane.getByRole('button', { name: '加载更早记录', exact: true }).click()
        await pane.locator('.ant-timeline').getByText(/业务小李.*业务.*2026/).waitFor()
        await waitForFiniteAnimations(page)
        if (images) await page.screenshot({ path: path.resolve(outputDir, `erp-task-tracking-${themeMode}-detail-4k.png`) })
        await assertNoHorizontalOverflow(page)
        for (const width of [390, 320]) {
          await page.setViewportSize({ width, height: 844 })
          await drawer.getByRole('group', { name: '当前进度', exact: true }).waitFor()
          await drawer.locator('.erp-workflow-initiator > strong').evaluate((element) => { element.textContent = '跨部门协作的流程发起人姓名用于窄屏换行核验' })
          await assertTrackingNavigation(page, assert, drawer)
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
        await drawer.locator('.ant-drawer-header').getByRole('button', { name: '返回列表', exact: true }).click()
        await drawer.waitFor({ state: 'hidden' })
        const title = row.getByRole('button', { name: /销售订单受理/ })
        await page.waitForFunction((element) => element === document.activeElement, await title.elementHandle(), { timeout: 1000 })
        assert.equal(await title.evaluate((element) => element === document.activeElement), true, 'returning from handling and closing progress restores the original row entry')
        await page.keyboard.press('Enter')
        await drawer.getByText('下一步', { exact: true }).waitFor()
        assert.equal(await drawer.locator('.erp-workflow-tracking-history').getAttribute('open'), null)
        await page.keyboard.press('Escape')
        await drawer.waitFor({ state: 'hidden' })
        await page.waitForFunction((element) => element === document.activeElement, await title.elementHandle(), { timeout: 1000 })
        assert.equal(await title.evaluate((element) => element === document.activeElement), true)
        await page.setViewportSize({ width: 1920, height: 1080 })
        await pane.getByRole('group', { name: '当前进度', exact: true }).waitFor()
        const chooseScope = async (label) => {
          const scope = label === '我参与的' ? 'participated' : label === '相关流程' ? 'visible' : 'started'
          await Promise.all([
            page.waitForRequest((request) => request.url().endsWith('/rpc/workflow') && request.method() === 'POST' && request.postDataJSON().method === 'list_tracking' && request.postDataJSON().params.scope === scope),
            (async () => {
              await page.locator('.erp-task-tracking-toolbar')
                .getByRole('group', { name: '跟踪范围', exact: true })
                .getByRole('button', { name: label, exact: true }).click()
              assert.equal(new URL(page.url()).searchParams.get('tracking'), scope, '跟踪范围应立即更新 URL')
            })(),
          ])
        }
        await chooseScope('我参与的')
        await list.getByText('任务分页记录 1', { exact: true }).waitFor()
        await waitForFiniteAnimations(page)
        const search = page.getByPlaceholder('搜单号、任务、产品')
        await search.fill('不存在的单号')
        await search.press('Enter')
        await page.getByText('当前筛选下没有匹配记录', { exact: true }).waitFor()
        await chooseScope('相关流程')
        await list.getByText('SO-TRACK-001', { exact: true }).waitFor()
        assert.equal(await search.inputValue(), '')
        assert.equal(new URL(page.url()).searchParams.get('track_page_visible'), '2')
        assert.match(await pager.innerText(), /第 21-40 条 \/ 共 161 条/)
        assert(calls.filter((call) => call.method === 'list_tracking').every((call) => !('cursor' in call.params)))
        const paginationBoxes = await pager.evaluate((element) => ({ client: element.clientWidth, scroll: element.scrollWidth, bottom: element.getBoundingClientRect().bottom, viewportHeight: innerHeight }))
        assert.ok(paginationBoxes.scroll <= paginationBoxes.client + 1 && paginationBoxes.bottom <= paginationBoxes.viewportHeight + 1, JSON.stringify(paginationBoxes))
        assert(calls.some((call) => call.params.scope === 'participated'))
        assert(calls.every((call) => !('actor_id' in call.params)))
        if (images) await page.screenshot({ path: path.resolve(outputDir, `erp-task-tracking-${themeMode}-list-4k.png`) })
        if (!images) assert.equal(imageReads.length, 0)
        await page.goto(new URL('/erp/task-board?task_id=301', page.url()).href)
        const viewFlow = handling.getByRole('button', { name: '查看此流程详情', exact: true })
        await viewFlow.click()
        await drawer.getByRole('group', { name: '当前进度', exact: true }).getByText('下一步', { exact: true }).waitFor()
        await drawer.getByRole('button', { name: '返回任务', exact: true }).click()
        await drawer.waitFor({ state: 'hidden' })
        await viewFlow.waitFor()
      },
    }
  })
  const accessScenarios = ['summary-only', 'read-only', 'multiple', 'multiple-narrow'].map((mode) => {
    const base = scenarios[0]
    const { detail } = trackingData()
    const multiple = mode.startsWith('multiple')
    detail.current_task_access[0] = { task_id: 301, can_read: mode !== 'summary-only', can_handle: multiple }
    if (multiple) {
      const parallel = { ...detail.tasks[1], task_id: 302, task_name: '核对毛绒产品工程技术规格与客户最终确认样品的全部材料和尺寸要求', status: 'blocked' }
      const hidden = { ...detail.tasks[1], task_id: 303, task_name: '订单审批', owner_role_key: 'boss', required_capability_key: 'workflow.task.approve' }
      detail.tasks.push(parallel, hidden)
      detail.summary.current_tasks.push(parallel, hidden)
      detail.current_task_access.push({ task_id: 302, can_read: true, can_handle: false }, { task_id: 303, can_read: false, can_handle: false })
      detail.events.unshift({ ...detail.events[0], id: 4, task_id: 302, actor_role_key: 'engineering', actor_display_name: '工程负责人', to_status_key: 'blocked', reason: '缺少客户确认的样品规格' })
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
        const narrow = mode === 'multiple-narrow'
        const drawer = narrow
          ? page.getByRole('dialog', { name: '流程跟踪', exact: true })
          : page.getByRole('region', { name: '流程详情', exact: true })
        await drawer.getByRole('region', { name: '流程概况', exact: true }).getByRole('group', { name: '当前进度', exact: true }).waitFor()
        if (narrow) await assertTrackingNavigation(page, assert, drawer)
        const footer = drawer.locator(narrow ? '.ant-drawer-footer' : '.erp-workflow-tracking-pane-footer')
        assert.equal(await drawer.locator('.ant-drawer-header').getByRole('button', { name: /刷新进度/ }).count(), 0, 'refresh must not return to the drawer header')
        assert.equal(await footer.getByRole('button', { name: /刷新进度/ }).count(), 1, 'refresh shares the fixed footer with task entry actions')
        const action = footer.locator('.erp-workflow-tracking-open-task')
        assert.equal(await drawer.getByRole('region', { name: '流程概况', exact: true }).getByRole('group', { name: '当前进度', exact: true }).getByRole('button').count(), 0)
        assert.deepEqual(taskReads, [])
        if (mode === 'summary-only') {
          assert.equal(await action.count(), 0, 'tracking-only reader has no task entry')
          assert.match(await drawer.innerText(), /岗位：工程.*待处理/s)
        } else if (multiple) {
          const risk = drawer.locator('.erp-workflow-tracking-current-step').first()
          assert.match(await risk.innerText(), /核对毛绒产品.*受阻原因.*缺少客户确认的样品规格.*下一步.*解决受阻事项/su)
          assert.equal(await action.isDisabled(), true, 'parallel tasks need an explicit choice')
          const select = footer.locator('.ant-select[aria-label="选择当前任务"]')
          await select.click()
          const options = page.locator('.ant-select-dropdown:visible .ant-select-item-option')
          await options.first().waitFor()
          assert.equal(await options.count(), 2, 'unreadable tasks are excluded from choices')
          await options.nth(1).click()
          assert.match(await action.innerText(), /^查看核对毛绒产品/)
          const geometry = await footer.evaluate((element) => {
            const action = element.querySelector('.erp-workflow-tracking-open-task')
            const refresh = element.querySelector('button')
            const a = action.getBoundingClientRect()
            const b = refresh.getBoundingClientRect()
            const f = element.getBoundingClientRect()
            return { width: element.clientWidth, scrollWidth: element.scrollWidth, footerBottom: f.bottom, viewport: innerHeight, actionTop: a.top, actionBottom: a.bottom, actionLeft: a.left, refreshRight: b.right }
          })
          assert.ok(geometry.scrollWidth <= geometry.width && geometry.footerBottom <= geometry.viewport && geometry.actionLeft >= geometry.refreshRight && geometry.actionBottom <= geometry.footerBottom, JSON.stringify(geometry))
          await drawer.locator(narrow ? '.ant-drawer-body' : '.erp-workflow-tracking-pane-body').evaluate((element) => { element.scrollTop = element.scrollHeight })
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
          assert.deepEqual(taskReads, [301], 'entry failure only reads the selected task')
          await action.click()
          await page.locator('.erp-task-action-drawer').getByRole('button', { name: '返回流程', exact: true }).waitFor()
          if (mode === 'read-only') assert.equal(await page.locator('.erp-task-action-drawer .ant-drawer-footer .ant-btn-primary').count(), 0, 'read-only entry does not expose a handling action')
          assert.deepEqual(taskReads.slice(0, 2), [301, 301], 'entry retries the same task')
          assert.ok(taskReads.every((taskID) => taskID === 301), 'the source workspace may reread the selected task without reading other choices')
          await page.locator('.erp-task-action-drawer').getByRole('button', { name: '返回流程', exact: true }).click()
          await drawer.getByRole('region', { name: '流程概况', exact: true }).getByRole('group', { name: '当前进度', exact: true }).waitFor()
          if (multiple) await footer.locator('.erp-workflow-tracking-open-task:disabled').waitFor()
        }
        await waitForFiniteAnimations(page)
        if (!multiple) await page.screenshot({ path: path.resolve(outputDir, `erp-task-tracking-access-${mode}-4k.png`) })
        await assertNoHorizontalOverflow(page, `任务入口权限 ${mode}`)
      },
    }
  })
  return [...scenarios, ...accessScenarios]
}
