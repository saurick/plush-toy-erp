import fs from 'node:fs/promises'
import { assertTaskCopy, assertTaskMenuCopy } from './taskCopyAssertions.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { summaryFixture } from './materialSummaryScenarios.mjs'

export function createTaskCurrentFocusScenarios({ assert, path, outputDir, customerRuntimeEffectiveSession }) {
  return ['desktop', 'mobile'].flatMap((surface) => ['light', 'dark'].map((themeMode) => {
    const mobile = surface === 'mobile'
    const blocked = themeMode === 'dark'
    const sourceNo = blocked ? 'SO-FOCUS-001-LONG-BUSINESS-REFERENCE-20261017' : 'SO-FOCUS-001'
    const productCode = blocked ? '27007#-LONG-PRODUCT-REFERENCE-20261017' : '27007#'
    const ended = [
      { id: 711, node_key: 'submit_sales_order', node_type: 'domain_command', status: 'completed' },
      { id: 712, node_key: 'order_approval', node_type: 'approval', status: 'completed' },
    ].map((node, index) => ({ ...node, process_instance_id: 710, attempt: 1, version: 1, started_at: 1790085600 + index * 20, completed_at: 1790085610 + index * 20 }))
    const current = { id: 713, process_instance_id: 710, node_key: 'engineering_data', node_type: 'human_task', status: blocked ? 'blocked' : 'active', attempt: 1, version: 1 }
    const context = {
      source: { type: 'sales_order', id: 701, no: sourceNo },
      process_instance: { id: 710, process_key: 'sales_order_acceptance', process_version: 'v1', status: blocked ? 'blocked' : 'active', started_at: 1790085600 },
      nodes: [...ended, current],
current_nodes: [current],
completed_nodes: ended,
linked_node: current,
      current_responsibilities: [{ node_instance_id: current.id, owner_role_key: 'engineering' }],
approval_form: null,
    }
    const fixture = {
      id: 714,
version: 2,
task_code: 'STYLE-L1-CURRENT-FOCUS',
task_name: '工程资料',
task_group: 'engineering_data',
      task_status_key: blocked ? 'blocked' : 'ready',
owner_role_key: 'engineering',
assignee_id: null,
      source_type: 'sales_order',
source_id: 701,
source_no: sourceNo,
created_at: 1790085600,
      required_capability_key: 'workflow.task.complete',
process_instance_id: 710,
process_node_instance_id: current.id,
      blocked_reason: blocked ? '物料规格待补齐，需业务岗位核对。' : '',
      display_context: { available: true,
source_no: sourceNo,
items: [
        { kind: 'product', product_id: 7, name: blocked ? '海盐企鹅礼盒（可拆卸挂件、加长规格与多语言包装说明）' : '海盐企鹅', code: productCode, style_no: 'PENGUIN-7', image_attachment_id: blocked ? 0 : 8801 },
        { kind: 'product', product_id: 2, name: '海盐企鹅挂件', code: '27007-GJ', image_attachment_id: 0 },
      ] },
processContext: context,
    }
    const actions = ['workflow.task.read', 'workflow.task.update', 'workflow.task.complete', 'workflow.task.reject', 'workflow.task.urge', 'sales_order.read', 'engineering.material.read', 'product.read', 'mobile.engineering.access']
    const effectiveSession = {
      ...customerRuntimeEffectiveSession,
configRevision: 'style-l1-current-focus',
roles: ['engineering'],
pages: ['task-board', 'sales-orders'],
workPools: ['engineering'],
actions,
      workflow_visible_owner_role_keys_by_capability: Object.fromEntries(actions.filter((key) => key.startsWith('workflow.task.')).map((key) => [key, ['engineering']])),
    }
    let processReads = 0
    let failProcessRead = !blocked
    let handlingReads = 0
    let summaryReads = 0
    const summaryWrites = []
    return {
      name: `task-current-focus-${surface}-${themeMode}`,
      path: mobile ? '/m/engineering/tasks' : '/erp/task-board',
auth: 'admin',
customerKey: 'yoyoosun',
themeMode,
      viewport: mobile ? { width: 390, height: 844 } : { width: 1920, height: 1080 },
deviceScaleFactor: mobile ? 1 : 2,
      effectiveSession,
      adminProfile: { id: 1, username: 'style-l1-current-focus', is_super_admin: false, roles: [{ role_key: 'engineering', name: '工程' }], permissions: actions, menus: [{ key: 'task-board', label: '任务管理', path: '/erp/task-board', required_any: ['workflow.task.read'], required_all: [] }, { key: 'sales-orders', label: '销售订单', path: '/erp/sales/project-orders/sales-orders', required_any: ['sales_order.read'], required_all: [] }] },
      workflowTaskFixtures: [fixture],
      beforeNavigate: async (page) => {
        processReads = 0; handlingReads = 0; failProcessRead = !blocked
        summaryReads = 0; summaryWrites.length = 0
        await page.route('**/rpc/sales_order', async (route) => {
          const body = route.request().postDataJSON()
          if (body?.method !== 'get_engineering_material_request') {
            if (/submit|review|update|create|delete/u.test(body?.method || '')) summaryWrites.push(body.method)
            return route.fallback()
          }
          summaryReads++
          assert.equal(body.params.sales_order_id, fixture.source_id)
          return route.fulfill({ json: { jsonrpc: '2.0', id: body.id, result: { code: 0, data: { ...summaryFixture(), sales_order_id: fixture.source_id, order_no: sourceNo } } } })
        })
        await page.route('**/rpc/workflow', async (route) => {
          const body = route.request().postDataJSON()
          if (body?.method === 'list_task_events' && body.params.task_id === fixture.id) {
            const items = [
              { id: 722, event_type: blocked ? 'status_changed' : 'payload_refreshed', from_status_key: 'ready', to_status_key: fixture.task_status_key, created_at: 1790085690, actor_display_name: '工程演示人员', actor_role_key: 'engineering', task_version: 2, reason: blocked ? fixture.blocked_reason.repeat(5) : '已补充任务资料，原办理记录保留。' },
              { id: 721, event_type: 'created', created_at: 1790085600, to_status_key: 'ready', task_version: 1 },
            ]
            return route.fulfill({ json: { jsonrpc: '2.0', id: body.id, result: { code: 0, data: { items, truncated: false } } } })
          }
          if (body?.method === 'explain_action_access' && body.params.task_id === fixture.id) {
            const permitted = blocked ? ['resume', 'urge'] : ['complete', 'block', 'reject', 'urge']
            const actions = ['complete', 'block', 'reject', 'resume', 'urge'].map((key) => ({ action_key: key, allowed: permitted.includes(key), required_permission: key === 'complete' ? 'workflow.task.complete' : 'workflow.task.update', owner_role_key: 'engineering', reason: permitted.includes(key) ? '' : '当前状态不可办理', reason_code: permitted.includes(key) ? 'allowed' : 'invalid_task_status' }))
            const source_access = { applicable: true, resolved: true, allowed: true, reason: '', reason_code: 'source_access_allowed' }
            return route.fulfill({ json: { jsonrpc: '2.0', id: body.id, result: { code: 0, data: body.params.action_key ? { source_access, action: actions.find((item) => item.action_key === body.params.action_key) } : { task_id: fixture.id, source_access, actions } } } })
          }
          if (body?.method === 'get_task_process_context' && body.params.task_id === fixture.id) {
            processReads++
            if (failProcessRead) { failProcessRead = false; return route.fulfill({ json: { jsonrpc: '2.0', id: body.id, result: { code: 500, message: '读取失败' } } }) }
            return route.fulfill({ json: { jsonrpc: '2.0', id: body.id, result: { code: 0, data: { process_context: context } } } })
          }
          if (body?.method === 'get_task_handling_chain') {
            handlingReads++
            return route.fulfill({ json: { jsonrpc: '2.0', id: body.id, result: { code: 0, data: { items: [fixture], truncated: false } } } })
          }
          return route.fallback()
        })
      },
      verify: async (page) => {
        await page.getByRole('button', { name: '查看工程资料详情', exact: true }).click()
        const detail = mobile ? page.getByTestId('mobile-task-detail-screen') : page.locator('.erp-task-action-drawer')
        const currentSummary = detail.locator('.workflow-task-current')
        await currentSummary.waitFor()
        if (!blocked) {
          await detail.getByText('暂时无法读取任务处理链，请重新读取。', { exact: true }).waitFor()
          await detail.getByRole('button', { name: '重新读取', exact: true }).click()
        } else {
          assert.match(await currentSummary.innerText(), /物料规格待补齐/u)
        }
        const chain = detail.getByTestId(mobile ? 'mobile-task-process-context' : 'workflow-task-handling-chain')
        const track = chain.getByTestId('workflow-process-stage')
        await track.getByText('前序 2 步已完成', { exact: true }).waitFor()
        if (!blocked) assert.equal(processReads, 2, '进度读取失败后只重读进度')
        const history = track.locator('.workflow-process-stage__history')
        assert.equal(await history.evaluate((el) => el.tagName), 'DIV')
        assert.equal(await history.locator(':scope > summary').count(), 0)
        const currentStep = currentSummary.locator('.workflow-task-info-step')
        assert.equal(await currentStep.textContent(), '业务流程：第3步')
        const currentStepStyle = await currentStep.locator('.workflow-task-current__step-number').evaluate((el) => {
          const rect = el.getBoundingClientRect()
          const parent = el.parentElement.getBoundingClientRect()
          const style = getComputedStyle(el)
          return { width: rect.width, height: rect.height, borderWidth: style.borderTopWidth, borderStyle: style.borderTopStyle, radius: style.borderTopLeftRadius, themed: style.borderTopColor === style.color, centerOffset: Math.abs(rect.top + rect.height / 2 - parent.top - parent.height / 2) }
        })
        const { centerOffset, ...circleStyle } = currentStepStyle
        assert.deepEqual(circleStyle, { width: 20, height: 20, borderWidth: '1px', borderStyle: 'solid', radius: '50%', themed: true })
        assert.ok(centerOffset <= 1, JSON.stringify(currentStepStyle))
        assert.doesNotMatch(await history.locator('.workflow-process-stage__history-heading').innerText(), /从早到晚|最近在前/u)
        assert.deepEqual(await history.locator('.workflow-process-stage__marker').allTextContents(), ['2', '1'])
        assert.deepEqual(await history.locator('.workflow-process-stage__label').allTextContents(), ['订单审批', '提交销售订单'])
        assert.equal(await history.locator('.workflow-process-stage__history-toggle').count(), 0)
        assert.equal(await history.locator('.workflow-process-stage__history-heading').evaluate((el) => getComputedStyle(el).cursor), 'auto')
        const stageGeometry = await history.evaluate((el) => [...el.querySelectorAll('li')].map((item, index, items) => {
          const marker = item.querySelector('.workflow-process-stage__marker').getBoundingClientRect()
          const next = items[index + 1]?.querySelector('.workflow-process-stage__marker').getBoundingClientRect()
          const rect = item.getBoundingClientRect()
          const line = getComputedStyle(item, '::after')
          return { arrow: getComputedStyle(item, '::before').content, width: parseFloat(line.width), last: line.display === 'none', aligned: Math.abs(rect.x + parseFloat(line.left) + parseFloat(line.width) / 2 - marker.x - marker.width / 2), start: rect.y + parseFloat(line.top) - marker.bottom, end: next ? next.top - (rect.bottom - parseFloat(line.bottom)) : 0 }
        }))
        assert.ok(stageGeometry.every((item, index) => item.arrow === 'none' && item.width === 1 && item.aligned <= 1 && (index === stageGeometry.length - 1 ? item.last : !item.last && Math.abs(item.start) <= 1 && Math.abs(item.end) <= 1)), JSON.stringify(stageGeometry))
        assert.equal(await track.locator(':scope > ol [data-linked-task="true"]').count(), 0, '本任务当前责任已在上方突出，不再重复一个当前节点卡片')
        assert.equal(handlingReads, 0, '默认详情不请求整单任务链')
        const records = detail.getByTestId('workflow-task-event-trail')
        await records.getByRole('heading', { name: '本任务处理记录', exact: true }).waitFor()
        assert.equal(await records.locator('details, summary').count(), 0)
        assert.match(await records.locator('.workflow-task-event-trail__head').innerText(), /2 条/u)
        assert.doesNotMatch(await records.locator('.workflow-task-event-trail__head').innerText(), /最近在前|从早到晚/u)
        assert.equal(await records.locator('select, [role="combobox"]').count(), 0)
        assert.equal(await records.locator('.workflow-task-event-trail__latest').count(), 0)
        assert.match(await records.locator('li').first().innerText(), blocked ? /任务已阻塞/u : /任务信息已更新/u)
        assert.match(await records.locator('li').last().innerText(), /任务已创建/u)
        await waitForFiniteAnimations(page)
        await detail.locator('.workflow-task-info-card[aria-label="任务信息"]').scrollIntoViewIfNeeded()
        const geometry = await detail.evaluate((el) => {
          const info = el.querySelector('.workflow-task-info-card[aria-label="任务信息"]')
          const card = info.getBoundingClientRect()
          const currentElement = info.querySelector('.workflow-task-current')
          const current = currentElement.getBoundingClientRect()
          const currentStyle = getComputedStyle(currentElement)
          const chain = el.querySelector('[aria-label="任务处理链"]').getBoundingClientRect()
          const footer = el.querySelector('.ant-drawer-footer, .mobile-role-action-bar').getBoundingClientRect()
          const main = el.querySelector('.ant-drawer-body, .mobile-role-tasks-page__detail-main')
          const buttons = [...el.querySelectorAll('.ant-drawer-footer button, .mobile-role-action-bar button')].map((button) => button.getBoundingClientRect().toJSON())
          const image = info.querySelector('.erp-task-product-image').getBoundingClientRect()
          const source = info.querySelector('.erp-task-action-drawer__source, .mobile-detail-source').getBoundingClientRect()
          const guide = el.querySelector('.erp-task-action-drawer__navigation, .mobile-task-flow-steps').getBoundingClientRect()
          const facts = info.querySelectorAll('.workflow-task-info-facts > div').length
          return { card: card.toJSON(), current: current.toJSON(), currentStyle: { background: currentStyle.backgroundColor, padding: currentStyle.padding }, chain: chain.toJSON(), footer: footer.toJSON(), buttons, facts, sourceAfterImage: source.left >= image.right, guideVisible: guide.height >= 38, overflow: main.scrollWidth - main.clientWidth }
        })
        assert.ok(geometry.current.bottom <= geometry.chain.top + 1, JSON.stringify(geometry))
        assert.ok(geometry.guideVisible && geometry.card.top < geometry.footer.top && geometry.overflow <= 1, JSON.stringify(geometry))
        assert.equal(geometry.facts, 2, '原任务信息保留责任、截止两行')
        assert.deepEqual(geometry.currentStyle, { background: 'rgba(0, 0, 0, 0)', padding: '0px' }, '信息卡事实行不叠加旧的当前办理高亮容器')
        assert.ok(geometry.sourceAfterImage, '来源和产品图片在同一行内组织')
        assert.ok(geometry.buttons.length >= 3, '材料汇总与附件、主操作集中到底栏')
        assert.ok(geometry.buttons.every((button) => button.height >= (mobile ? 44 : 32) - 1), JSON.stringify(geometry.buttons))
        assert.ok(geometry.buttons.every((button) => Math.abs(button.top - geometry.buttons[0].top) <= 1 && Math.abs(button.height - geometry.buttons[0].height) <= 1), '底栏按钮同高、同基线')
        assert.equal(await detail.locator('.workflow-task-info-card[aria-label="任务信息"]').getByRole('button', { name: '查看材料汇总', exact: true }).count(), 0)
        assert.equal(await detail.getByRole('button', { name: '复制任务信息', exact: true }).count(), 0)
        assert.equal(await detail.getByRole('button', { name: '复制产品信息', exact: true }).count(), 0)
        const infoCard = detail.locator('.workflow-task-info-card[aria-label="任务信息"]')
        const numberCopies = infoCard.locator('.erp-task-copy')
        const copyGeometry = await numberCopies.evaluateAll((buttons) => buttons.map((button) => {
          const box = button.getBoundingClientRect()
          const value = button.parentElement.querySelector('.erp-task-copy-field__value').getBoundingClientRect()
          return { label: button.getAttribute('aria-label'), width: box.width, height: box.height, centerOffset: Math.abs((box.top + box.bottom - value.top - value.bottom) / 2), gap: box.left - value.right }
        }))
        assert.deepEqual(copyGeometry.map((item) => item.label), ['复制单据编号', '复制产品编号'])
        assert.ok(copyGeometry.every((item) => item.width >= (mobile ? 44 : 28) && item.height >= (mobile ? 44 : 28) && item.centerOffset <= 1 && item.gap >= 0), JSON.stringify(copyGeometry))
        const sourceCopy = infoCard.getByRole('button', { name: '复制单据编号', exact: true })
        const productCopy = infoCard.getByRole('button', { name: '复制产品编号', exact: true })
        if (mobile) {
          const footer = detail.locator('.mobile-role-action-bar')
          assert.equal(await detail.getByRole('button', { name: '进入单据办理', exact: true }).count(), 0)
          assert.equal(await detail.locator('.mobile-detail-source a, .mobile-detail-source .erp-task-source-link').count(), 0)
          assert.equal(await detail.locator('.mobile-detail-source button').count(), 1, '手机来源只提供编号复制')
          assert.equal(await footer.getByRole('button', { name: '选择处理方式', exact: true }).count(), 1)
          const buttons = await footer.locator('button').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().toJSON()))
          assert.equal(buttons.length, 3, '附件、材料汇总与任务主操作在同一底栏')
          assert.ok(buttons.every((button) => button.width >= 44 && button.height >= 44))
          assert.ok(Math.abs(buttons[0].top - buttons[1].top) <= 1 && Math.abs(buttons[0].height - buttons[1].height) <= 1)
        }
        await page.screenshot({ path: path.resolve(outputDir, `task-current-focus-${surface}-${themeMode}-overview.png`) })
        await detail.screenshot({ path: path.resolve(outputDir, `task-current-focus-${surface}-${themeMode}-detail.png`) })
        const previousSteps = history.locator('.workflow-process-stage__step')
        await previousSteps.nth(0).locator('summary').press('Enter')
        assert.notEqual(await previousSteps.nth(0).getAttribute('open'), null)
        assert.match(await previousSteps.nth(0).locator('dl').innerText(), /开始时间.*结束时间/su)
        await previousSteps.nth(1).locator('summary').click()
        assert.equal(await previousSteps.nth(0).getAttribute('open'), null, '一次展开一项步骤详情')
        assert.notEqual(await previousSteps.nth(1).getAttribute('open'), null)
        const recordDetails = records.getByRole('button', { name: '查看任务已创建记录详情', exact: true })
        await recordDetails.press('Enter')
        await page.locator('.workflow-task-event-trail__audit:visible').waitFor()
        await recordDetails.press('Escape')
        await page.locator('.workflow-task-event-trail__audit:visible').waitFor({ state: 'hidden' })
        assert.equal(await recordDetails.evaluate((el) => document.activeElement === el), true)
        await previousSteps.nth(1).locator('summary').click()
        await history.scrollIntoViewIfNeeded()
        await page.screenshot({ path: path.resolve(outputDir, `task-history-${surface}-${themeMode}.png`) })
        const more = detail.getByRole('button', { name: '更多操作', exact: true })
        await more.click()
        const menu = page.locator('.erp-task-copy-menu .ant-dropdown-menu')
        await menu.waitFor()
        await waitForFiniteAnimations(page)
        const menuStyle = await menu.evaluate((el) => ({ width: el.getBoundingClientRect().width, rows: [...el.children].map((node) => ({ shadow: getComputedStyle(node).boxShadow, height: node.getBoundingClientRect().height })), icons: [...el.querySelectorAll('svg')].map((svg) => svg.getAttribute('data-icon')) }))
        assert.ok(Math.abs(menuStyle.width - 180) <= 1 && menuStyle.rows.every((row) => row.shadow === 'none' && row.height >= (mobile ? 44 : 40) - 1), JSON.stringify(menuStyle))
        assert.deepEqual(menuStyle.icons, ['link', 'copy', 'copy'])
        assert.deepEqual((await menu.getByRole('menuitem').allTextContents()).map((label) => label.trim()), ['复制任务链接', '复制任务信息', '复制产品信息'])
        await fs.writeFile(path.resolve(outputDir, `task-current-focus-${surface}-${themeMode}-geometry.json`), JSON.stringify({ geometry, currentStepStyle, copyGeometry, menuStyle }, null, 2))
        await page.screenshot({ path: path.resolve(outputDir, `task-current-focus-${surface}-${themeMode}-menu.png`) })
        await page.keyboard.press('Escape')
        await menu.waitFor({ state: 'hidden' })
        assert.equal(await detail.isVisible(), true, 'Escape 只关闭菜单，保留任务详情')
        const productsTrigger = detail.getByRole('button', { name: '共 2 款产品', exact: true })
        await productsTrigger.click()
        const products = page.getByRole('dialog', { name: '关联产品', exact: true })
        await products.waitFor()
        assert.equal(await products.locator('.erp-task-identity__row').count(), 2)
        assert.ok(await products.evaluate((el) => el.scrollWidth <= el.clientWidth + 1 && el.getBoundingClientRect().right <= window.innerWidth + 1), '关联产品弹窗在窄屏不横向溢出')
        await products.locator('.ant-modal-close').click()
        await products.waitFor({ state: 'hidden' })
        await waitForFiniteAnimations(page)
        assert.equal(await productsTrigger.evaluate((node) => node === document.activeElement), true, '关闭关联产品后焦点返回数量入口')
        await assertTaskMenuCopy(page, detail, '任务信息', ['工程资料', sourceNo, '海盐企鹅'], { keyboard: true })
        await assertTaskMenuCopy(page, detail, '产品信息', ['27007#', '27007-GJ'])
        await assertTaskMenuCopy(page, detail, '任务链接', '', { failure: true })
        await assertTaskMenuCopy(page, detail, '任务链接', `${new URL(page.url()).origin}/task-link/714`, { fallback: true })
        await assertTaskCopy(page, sourceCopy, sourceNo, { keyboard: true })
        await assertTaskCopy(page, productCopy, productCode)
        await assertTaskCopy(page, sourceCopy, sourceNo, { keyboard: true, fallback: true })
        await page.getByText('复制失败，请在任务详情中选中文字复制', { exact: true }).waitFor({ state: 'hidden' })
        await assertTaskCopy(page, productCopy, '', { keyboard: true, failure: true })
        assert.equal(await infoCard.isVisible(), true, '复制不进入来源单据或关闭任务信息')
        if (!blocked) {
          const image = detail.getByRole('button', { name: '查看海盐企鹅大图', exact: true })
          await image.click()
          const preview = page.getByRole('dialog', { name: '海盐企鹅图片预览', exact: true })
          await preview.waitFor()
          await preview.getByRole('button', { name: '关闭图片预览', exact: true }).click()
          await preview.waitFor({ state: 'hidden' })
        }
        const attachmentButton = detail.getByTestId(mobile ? 'mobile-task-attachment-action' : 'workflow-task-attachment-action')
        assert.equal(await attachmentButton.evaluate((el) => Boolean(el.closest('.mobile-role-action-bar, .ant-drawer-footer'))), true)
        await attachmentButton.click()
        const attachments = page.getByRole('dialog', { name: '任务附件', exact: true })
        await attachments.waitFor()
        await attachments.locator('.ant-modal-close').click()
        await attachments.waitFor({ state: 'hidden' })
        await waitForFiniteAnimations(page)
        assert.equal(await attachmentButton.evaluate((el) => document.activeElement === el), true, '附件关闭后焦点回到底栏入口')
        await previousSteps.nth(0).locator('summary').click()
        assert.equal(await history.locator('li').count(), 2)
        await chain.getByRole('button', { name: '查看订单全流程', exact: true }).click()
        await chain.getByRole('heading', { name: '订单全流程', exact: true }).waitFor()
        await chain.locator('.workflow-business-chain').waitFor()
        assert.equal(handlingReads, 1)
        await chain.getByRole('button', { name: '返回本任务', exact: true }).click()
        assert.equal(await previousSteps.nth(0).isVisible(), true, '从全流程返回时前序步骤仍直接可见')
        assert.notEqual(await previousSteps.nth(0).getAttribute('open'), null, '从全流程返回保留单步详情展开状态')
        assert.equal(await records.locator('li').first().isVisible(), true, '从全流程返回时处理记录仍直接可见')
        if (mobile) {
          await page.setViewportSize({ width: 320, height: 720 })
          await waitForFiniteAnimations(page)
          const small = await detail.evaluate((el) => ({ width: el.clientWidth, scroll: el.scrollWidth, buttons: [...el.querySelectorAll('.mobile-role-action-bar button')].map((button) => button.getBoundingClientRect().toJSON()), overflow: [...el.querySelectorAll('*')].filter((node) => node.getBoundingClientRect().right > el.getBoundingClientRect().right + 1).slice(0, 8).map((node) => ({ className: node.className, text: node.textContent.slice(0, 35), right: node.getBoundingClientRect().right })) }))
          assert.ok(small.scroll <= small.width + 1 && small.buttons.every((b) => b.width >= 44 && b.height >= 44), JSON.stringify(small))
          assert.equal(await records.locator('select, [role="combobox"]').count(), 0)
          await detail.screenshot({ path: path.resolve(outputDir, `task-current-focus-${surface}-${themeMode}-320.png`) })
          await page.setViewportSize({ width: 390, height: 844 })
        }
        const resources = detail.locator(mobile ? '.mobile-detail-footer-resources' : '.erp-task-action-drawer__resources')
        const summaryButton = resources.getByRole('button', { name: '查看材料汇总', exact: true })
        assert.equal(await summaryButton.evaluate((el) => Boolean(el.closest('.mobile-role-action-bar, .ant-drawer-footer'))), true)
        assert.equal(summaryReads, 0, '详情和追踪不提前读取材料汇总')
        const taskBody = detail.locator(mobile ? '.mobile-role-tasks-page__detail-main' : '.ant-drawer-body')
        const savedScroll = await taskBody.evaluate((el) => el.scrollTop)
        const savedURL = page.url()
        for (const keyboard of [false, true]) {
          if (keyboard) { await summaryButton.focus(); await summaryButton.press('Enter') }
          else await summaryButton.click()
          const summary = page.locator('.erp-material-summary-modal')
          await (mobile ? summary.getByRole('heading', { name: /米白短毛绒$/u }) : summary.getByText('米白短毛绒', { exact: true })).waitFor()
          await waitForFiniteAnimations(page)
          await summary.locator('.ant-modal-close').focus()
          assert.equal(page.url(), savedURL, '材料汇总在当前任务内打开')
          assert.equal(await summary.getByRole('button', { name: /提交老板审核|批准并生成采购订单|退回工程/u }).count(), 0)
          if (keyboard) await page.keyboard.press('Escape')
          else await summary.locator('.ant-modal-close').click()
          await summary.waitFor({ state: 'hidden' })
          await waitForFiniteAnimations(page)
          assert.equal(await summaryButton.evaluate((el) => el === document.activeElement), true, '关闭汇总后焦点回到底栏')
          assert.ok(Math.abs(await taskBody.evaluate((el) => el.scrollTop) - savedScroll) <= 1, '关闭汇总后保留任务滚动位置')
          assert.equal(page.url(), savedURL)
        }
        assert.equal(summaryReads, 2)
        assert.deepEqual(summaryWrites, [], '查看汇总不提交业务')
        const action = detail.getByRole('button', { name: '选择处理方式', exact: true })
        await action.click()
        const handling = mobile ? page.getByTestId('mobile-task-action-screen') : detail
        if (mobile) await handling.waitFor()
        else await handling.locator('.erp-task-action-drawer__action-prompt').waitFor()
        if (mobile) await handling.getByRole('button', { name: '返回任务详情', exact: true }).click()
        else await handling.getByRole('tab', { name: /核对任务/u }).click()
        await detail.locator('.workflow-task-current').waitFor()
        assert.match(await currentSummary.innerText(), /工程/u)
      },
    }
  }))
}
