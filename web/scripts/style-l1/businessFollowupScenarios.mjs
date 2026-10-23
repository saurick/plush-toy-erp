import { chooseSelectOption, readSelectValue } from './selectControlActions.mjs'

async function clickDialogBackdrop(dialog) {
  await dialog.locator('xpath=..').click({ position: { x: 4, y: 4 } })
}

export function createBusinessFollowupScenarios({ assert, outputDir, path, assertNoHorizontalOverflow, customerRuntimeEffectiveSession }) {
  const requests = []
  let created = null
  const scenarios = [
    {
      name: 'business-followup-create-retry-and-track',
      path: '/erp/sales/project-orders/sales-orders',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        requests.length = 0
        created = null
        await page.route('**/rpc/workflow', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          let data
          if (method === 'get_task_create_options') {
            assert.deepEqual(params, { source_type: 'sales_order', source_id: 1 })
            data = {
              ...params,
              source_no: 'SO-STYLE-L1',
              can_create: true,
              roles: [
                { role_key: 'quality', label: '品质', assignees: [{ admin_id: 8, display_name: '品质人员' }] },
                { role_key: 'sales', label: '业务', assignees: [{ admin_id: 9, display_name: '业务人员' }] },
              ],
            }
          } else if (method === 'create_followup_task') {
            requests.push(params)
            created ||= { ...params, id: 99, version: 1, task_group: 'business_followup', task_status_key: 'ready', source_no: 'SO-STYLE-L1', payload: { description: params.description }, created_by: 1, created_at: Math.floor(Date.now() / 1000), updated_at: Math.floor(Date.now() / 1000) }
            data = { task: requests.length === 1 ? { id: 99 } : created }
          } else if (method === 'get_task' && params.task_id === 99) {
            data = { task: created }
          } else if (method === 'list_task_events' && params.task_id === 99) {
            data = { items: [], truncated: false }
          } else if (method === 'explain_action_access' && params.task_id === 99) {
            const actions = ['complete', 'block', 'urge'].map((key) => ({ action_key: key, allowed: created.task_status_key === 'ready', reason: '', reason_code: 'allowed', required_permission: key === 'complete' ? 'workflow.task.complete' : 'workflow.task.update', status_key: key === 'complete' ? 'done' : key === 'block' ? 'blocked' : 'ready' }))
            const source_access = { applicable: true, resolved: true, allowed: true, reason_code: 'allowed', reason: '' }
            data = params.action_key ? { source_access, action: actions.find((action) => action.action_key === params.action_key) } : { task_id: 99, source_access, actions }
          } else if (method === 'complete_task_action' && params.task_id === 99) {
            assert.equal(params.reason, '已核对最终尺寸，与包装稿一致。')
            created = { ...created, task_status_key: 'done', version: created.version + 1, payload: { ...created.payload, feedback: params.reason } }
            data = { task: created }
          } else if (method === 'list_tasks' && params.source_type === 'sales_order' && params.source_id === 1) {
            const approval = { id: 100, version: 1, task_code: 'SO-APPROVAL-100', task_name: '销售订单审批', task_group: 'sales_order_approval', source_type: 'sales_order', source_id: 1, owner_role_key: 'sales', task_status_key: 'ready' }
            data = { tasks: created ? [created, approval] : [approval], total: created ? 2 : 1, limit: params.limit, offset: params.offset }
          } else if (method === 'get_tracking' && params.kind === 'task' && params.id === created?.id) {
            data = { tracking: {
              summary: {
                kind: 'task', id: created.id, process_key: '', title: created.task_name,
                source_type: created.source_type, source_id: created.source_id, source_no: created.source_no,
                display_context: null, status: created.task_status_key, resolution_kind: null,
                started_at: created.created_at, updated_at: created.updated_at, completed_at: created.updated_at,
                initiator_name: '业务人员', initiator_role_key: 'sales', current_tasks: [],
              },
              tasks: [{
                task_id: created.id, task_name: created.task_name, node_instance_id: null,
                owner_role_key: created.owner_role_key, assignee_name: '', status: created.task_status_key,
                created_at: created.created_at, completed_at: created.updated_at, due_at: created.due_at || null,
              }],
              nodes: [], events: [], current_task_access: [], events_truncated: false, next_event_id: 0,
            } }
          } else if (method === 'list_tracking') {
            assert.equal(params.scope, 'visible')
            assert.equal(params.source_type, 'sales_order')
            assert.equal(params.source_id, 1)
            assert.equal(created?.task_status_key, 'done')
            data = {
              items: [{
                kind: 'task',
                id: created.id,
                process_key: '',
                title: created.task_name,
                source_type: created.source_type,
                source_id: created.source_id,
                source_no: created.source_no,
                display_context: null,
                status: created.task_status_key,
                resolution_kind: null,
                started_at: created.created_at,
                updated_at: created.updated_at,
                completed_at: created.updated_at,
                initiator_name: '业务人员',
                initiator_role_key: 'sales',
                current_tasks: [],
              }],
              total: 1,
              status_counts: { active: 1, completed: 0 },
              limit: params.limit,
              offset: params.offset,
            }
          } else {
            await route.fallback()
            return
          }
          await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id, result: { code: 0, message: 'OK', data } }) })
        })
      },
      verify: async (page) => {
        const dialog = page.getByRole('dialog', { name: '新建跟进任务', exact: true })
        const openCreateDialog = async () => {
          const relatedEntry = page.locator('[data-business-action-key="related-tasks"]').first()
          if (!(await relatedEntry.isVisible())) await page.getByRole('button', { name: /^更多操作，共/ }).click()
          await relatedEntry.click()
          const relatedPanel = page.getByRole('dialog', { name: '相关任务', exact: true })
          await relatedPanel.getByRole('button', { name: '流程跟踪', exact: true }).waitFor()
          await relatedPanel.locator('[data-business-action-key="create-followup"]').click()
          await dialog.waitFor()
        }
        await page.locator('.ant-table-tbody .ant-table-row').first().waitFor()
        await page.locator('.ant-table-tbody input[type="radio"]').first().check()
        assert.equal(await page.locator('[data-business-action-key="create-followup"]:visible').count(), 0, '业务操作区只保留相关任务入口')
        assert.equal(await page.locator('[data-business-action-key="workflow-progress"]:visible').count(), 0)
        await openCreateDialog()
        await dialog.getByRole('button', { name: '返回相关任务', exact: true }).click()
        await page.getByRole('dialog', { name: '相关任务', exact: true }).getByRole('button', { name: '关闭', exact: true }).click()
        await openCreateDialog()
        await clickDialogBackdrop(dialog)
        await dialog.waitFor({ state: 'hidden' })
        await openCreateDialog()
        await dialog.getByLabel('任务事项').fill('确认包装尺寸')
        await clickDialogBackdrop(dialog)
        const discard = page.getByRole('dialog').filter({ hasText: '放弃未创建的跟进任务？' })
        await discard.waitFor()
        await clickDialogBackdrop(discard)
        await discard.waitFor({ state: 'hidden' })
        assert.equal(await dialog.getByLabel('任务事项').inputValue(), '确认包装尺寸')
        await dialog.getByLabel('需要对方完成什么').fill('请核对最终包装尺寸，并反馈结果。')
        if (page.viewportSize().width < 576) {
          await page.setViewportSize({ width: 844, height: 390 })
          assert.equal(await dialog.getByLabel('任务事项').inputValue(), '确认包装尺寸', '横屏切换保留未提交任务')
          await page.setViewportSize({ width: 390, height: 844 })
          assert.equal(await dialog.getByLabel('需要对方完成什么').inputValue(), '请核对最终包装尺寸，并反馈结果。')
        }
        await dialog.locator('.ant-form-item').filter({ hasText: '责任岗位' }).locator('.ant-select-selector').click()
        await page.getByTitle('品质', { exact: true }).click()
        await dialog.locator('.ant-form-item').filter({ hasText: '办理人' }).locator('.ant-select-selector').click()
        await page.getByTitle('品质人员', { exact: true }).click()
        await dialog.locator('.ant-form-item').filter({ hasText: '责任岗位' }).locator('.ant-select-selector').click()
        await page.getByTitle('业务', { exact: true }).click()
        assert.match(await dialog.innerText(), /由岗位人员处理/)
        const deadlineInput = dialog.getByLabel('截止时间')
        const deadlinePicker = dialog.locator('.erp-business-date-time-input')
        await deadlinePicker.click({ position: { x: 16, y: 16 } })
        const pickerPopup = page
          .locator('.ant-picker-dropdown:not(.ant-picker-dropdown-hidden)')
          .last()
        await pickerPopup.waitFor()
        assert.equal(await pickerPopup.locator('.ant-picker-ok').count(), 0, '日期时间不需要额外确认')
        const dateCell = pickerPopup.locator('.ant-picker-cell-in-view:not(.ant-picker-cell-disabled)[title]').nth(10)
        const selectedDay = await dateCell.getAttribute('title')
        await dateCell.click()
        await page.waitForFunction(({ expected }) => document.querySelector('.erp-business-date-time-input input')?.value.startsWith(expected), { expected: selectedDay.replaceAll('-', '/') })
        const timeColumn = pickerPopup.locator('.ant-picker-time-panel-column').last()
        await timeColumn.locator('.ant-picker-time-panel-cell').filter({ hasText: /^37$/ }).click()
        await page.mouse.move(0, 0)
        await page.waitForFunction(() => document.querySelector('.erp-business-date-time-input input')?.value.endsWith(':37'))
        assert.equal(
          await deadlineInput.getAttribute('readonly'),
          null,
          '日期时间控件应保留键盘录入能力'
        )
        assert.equal(
          await pickerPopup.locator('.ant-picker-now-btn').count(),
          0,
          '截止时间不应显示会立即失效的“此刻”'
        )
        for (const label of [
          '今天 23:59',
          '明天此时',
          '7 天后',
          '15 天后',
          '30 天后',
        ]) {
          await pickerPopup.getByRole('button', { name: label, exact: true }).waitFor()
        }
        const quickOptionMetrics = await pickerPopup
          .locator('.erp-business-date-picker-quick-options')
          .evaluate((element) => ({
            clientWidth: element.clientWidth,
            scrollWidth: element.scrollWidth,
          }))
        assert(
          quickOptionMetrics.scrollWidth <= quickOptionMetrics.clientWidth + 1,
          '快捷截止选项不应水平溢出'
        )
        const popupBounds = await pickerPopup.boundingBox()
        const viewportWidth = page.viewportSize().width
        const popupPartMetrics = await pickerPopup.evaluate((popup) =>
          [
            '.ant-picker-panel-layout',
            '.ant-picker-panel',
            '.ant-picker-datetime-panel',
            '.ant-picker-date-panel',
            '.ant-picker-time-panel',
            '.ant-picker-footer',
          ].map((selector) => ({
            selector,
            rect: (() => {
              const bounds = popup.querySelector(selector)?.getBoundingClientRect()
              return bounds
                ? { width: bounds.width, height: bounds.height }
                : null
            })(),
          }))
        )
        assert(
          popupBounds &&
            popupBounds.x >= -1 &&
            popupBounds.x + popupBounds.width <= viewportWidth + 1,
          `日期时间面板应完整位于视口内，实际为 ${JSON.stringify({ popupBounds, popupPartMetrics, viewportWidth })}`
        )
        await page.screenshot({
          path: path.join(
            outputDir,
            `business-followup-deadline-shortcuts-${page.viewportSize().width}.png`
          ),
          animations: 'disabled',
        })
        await pickerPopup
          .getByRole('button', { name: '7 天后', exact: true })
          .click()
        await pickerPopup.waitFor({ state: 'hidden' })
        const quickDeadlineValue = await deadlineInput.inputValue()
        assert(
          /^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/u.test(quickDeadlineValue),
          `快捷选择应回填可读的本地日期时间，实际为 ${JSON.stringify(quickDeadlineValue)}`
        )
        await deadlinePicker.click({ position: { x: 16, y: 16 } })
        await pickerPopup.waitFor()
        await deadlineInput.fill('2099/01/01 10:00')
        await deadlineInput.press('Enter')
        assert.equal(await deadlineInput.inputValue(), '2099/01/01 10:00')
        await dialog.getByLabel('任务事项').click()
        await page.locator('.ant-select-dropdown:visible').first().waitFor({ state: 'hidden' })
        await page.screenshot({ path: path.join(outputDir, `business-followup-form-${page.viewportSize().width}.png`), animations: 'disabled' })
        await dialog.getByRole('button', { name: '新建跟进任务', exact: true }).click()
        await dialog.getByText('创建结果暂未确认，内容已保留。请使用原内容重试，系统会核对已有结果。').waitFor()
        assert.equal(await dialog.getByLabel('任务事项').isDisabled(), true)
        assert.equal(await deadlineInput.isDisabled(), true)
        await dialog.getByRole('button', { name: '关闭', exact: true }).click()
        const pendingEntry = page.locator('[data-business-action-key="related-tasks"]').first()
        if (!(await pendingEntry.isVisible())) await page.getByRole('button', { name: /^更多操作，共/ }).click()
        assert.match(await pendingEntry.innerText(), /确认任务创建结果/u)
        await pendingEntry.click()
        await dialog.waitFor()
        assert.equal(await dialog.getByLabel('任务事项').inputValue(), '确认包装尺寸')
        await dialog.getByRole('button', { name: '重试并确认结果' }).click()
        const receipt = page.getByRole('dialog', { name: '跟进任务已创建', exact: true })
        await receipt.waitFor()
        assert.equal(requests.length, 2)
        assert.deepEqual(requests[0], requests[1], '响应不完整时保留同一内容和幂等键')
        assert.equal(requests[0].assignee_id, null, '切岗位后清空旧办理人')
        await receipt.getByRole('button', { name: '查看相关任务' }).click()
        const related = page.getByRole('dialog', { name: '相关任务', exact: true })
        await related.getByRole('button', { name: '确认包装尺寸' }).waitFor()
        assert.match(await related.innerText(), /可执行|待处理/)
        await related.getByRole('button', { name: '确认包装尺寸' }).click()
        const drawer = page.locator('.erp-task-action-drawer')
        await drawer.getByText('请核对最终包装尺寸，并反馈结果。', { exact: true }).waitFor()
        await drawer.getByRole('button', { name: '选择处理方式', exact: true }).click()
        await drawer.getByRole('radio', { name: /处理完成/ }).click()
        assert.equal(await drawer.getByRole('button', { name: '核对并确认' }).isDisabled(), true)
        await drawer.getByPlaceholder('填写处理结果和需要发起人了解的情况').fill('已核对最终尺寸，与包装稿一致。')
        await drawer.getByRole('button', { name: '核对并确认' }).click()
        await drawer.getByRole('button', { name: '确认完成' }).click()
        await drawer.getByRole('button', { name: '完成并关闭' }).click()
        await related.getByRole('button', { name: '确认包装尺寸' }).click()
        await drawer.getByText('已核对最终尺寸，与包装稿一致。', { exact: true }).waitFor()
        await drawer.getByRole('button', { name: '返回列表', exact: true }).click()
        await drawer.waitFor({ state: 'hidden' })
        await related.getByRole('button', { name: '确认包装尺寸' }).waitFor()
        await page.screenshot({ path: path.join(outputDir, `business-followup-related-${page.viewportSize().width}.png`), animations: 'disabled' })
        const sourceURL = page.url()
        await related.getByRole('button', { name: '流程跟踪', exact: true }).click()
        const tracking = page.getByRole('dialog', { name: '流程跟踪', exact: true })
        await tracking.getByRole('region', { name: '流程概况', exact: true }).waitFor()
        await related.waitFor({ state: 'hidden' })
        assert.equal(page.url(), sourceURL, '查看流程保留当前单据页面')
        assert.equal(await page.getByRole('dialog').count(), 1, '相关任务与流程查看只保留一个活动面板')
        await tracking.getByText('确认包装尺寸', { exact: true }).first().waitFor()
        await tracking.getByRole('button', { name: '返回当前单据', exact: true }).click()
        await tracking.waitFor({ state: 'hidden' })
        await related.waitFor()
        await related.getByRole('button', { name: '确认包装尺寸', exact: true }).waitFor()
        await page.waitForFunction(() => document.activeElement?.textContent === '流程跟踪')
        assert.equal(page.url(), sourceURL, '返回恢复同一单据的任务窗口')
        assert.equal(await page.locator('[data-selection-layout-locked="true"]').count(), 1, '返回任务窗口后继续保护操作栏，避免窄屏重排卸载窗口')
        await assertNoHorizontalOverflow(page, 'business-followup-create-retry-and-track')
      },
    },
    {
      name: 'dev-ui-design-business-followup',
      path: '/__dev/ui-design',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        const frame = page.frameLocator('iframe[title="ERP 最新可交互设计"]')
        await frame.getByRole('button', { name: '销售管理', exact: true }).click()
        const unselectedBar = frame.locator('.business-record-row')
        assert.equal(await unselectedBar.locator('[data-action="open-related-tasks"]').isDisabled(), true)
        await frame.getByRole('group', { name: '状态筛选', exact: true }).getByRole('button', { name: /^已关闭，/u }).click()
        await frame.locator('[data-action="select-row"]').first().check()
        assert.equal(await frame.locator('[data-action="open-task-create"]').count(), 0)
        await frame.locator('[data-action="open-related-tasks"]').click()
        const relatedTasks = frame.getByRole('dialog', { name: '相关任务' })
        await relatedTasks.waitFor()
        assert.equal(await relatedTasks.locator('[data-action="open-task-create"]').isDisabled(), true)
        await clickDialogBackdrop(relatedTasks)
        await relatedTasks.waitFor({ state: 'hidden' })
        await frame.getByRole('group', { name: '状态筛选', exact: true }).getByRole('button', { name: /^已生效，/u }).click()
        await frame.locator('[data-action="select-row"]').first().check()
        await frame.locator('[data-action="open-related-tasks"]').click()
        await frame.locator('[data-action="open-task-create"]').click()
        const taskCreate = frame.getByRole('dialog', {
          name: '新建跟进任务',
          exact: true,
        })
        await clickDialogBackdrop(taskCreate)
        await taskCreate.waitFor({ state: 'hidden' })
        await relatedTasks.waitFor()
        await relatedTasks.locator('[data-action="open-task-create"]').click()
        await frame.locator('#task-create-name').fill('补充包装稿')
        await clickDialogBackdrop(taskCreate)
        const discard = frame.getByRole('dialog', {
          name: '放弃未创建的跟进任务？',
          exact: true,
        })
        await discard.waitFor()
        await clickDialogBackdrop(discard)
        await discard.waitFor({ state: 'hidden' })
        assert.equal(await frame.locator('#task-create-name').inputValue(), '补充包装稿')
        await chooseSelectOption(frame.locator('#task-create-role'), '采购')
        await chooseSelectOption(frame.locator('#task-create-assignee'), '李倩')
        await chooseSelectOption(frame.locator('#task-create-role'), '销售')
        assert.equal(await readSelectValue(frame.locator('#task-create-assignee')), 'unassigned')
        await frame
          .getByRole('button', { name: '7 天后', exact: true })
          .click()
        assert.match(
          await frame.locator('#task-create-deadline').inputValue(),
          /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/u
        )
        await frame.locator('#task-create-deadline').fill('2099-01-01T10:00')
        await frame.locator('#task-create-note').fill('请补充最终包装稿，附尺寸说明。')
        await frame.locator('[data-action="confirm-task-create"]').click()
        await frame.getByRole('button', { name: '查看相关任务' }).click()
        await frame.getByRole('button', { name: '补充包装稿', exact: true }).click()
        await frame.getByText('请补充最终包装稿，附尺寸说明。', { exact: true }).waitFor()
        await frame.locator('[data-action="task-next"]').click()
        await frame.locator('[data-action="task-next"]').click()
        await frame.locator('[data-action="task-next"]').click()
        assert.match(await frame.locator('.error-text').innerText(), /处理结果/)
        await frame.locator('#task-note').fill('已补齐包装稿，尺寸 20×30 厘米。')
        await frame.locator('[data-action="task-next"]').click()
        await frame.getByText('已补齐包装稿，尺寸 20×30 厘米。', { exact: true }).waitFor()
        await page.screenshot({ path: path.join(outputDir, 'ui-design-followup-receipt.png'), animations: 'disabled' })
      },
    },
    {
      name: 'dev-ui-design-bom-task-entry',
      path: '/__dev/ui-design',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      verify: async (page) => {
        await page.getByRole('button', { name: /全屏预览/u }).click()
        const frame = page.frameLocator('iframe[title="ERP 最新可交互设计"]')
        await frame.locator('.nav-item[data-page="engineering-hub"]').click()
        await frame.locator('.table-wrap [data-action="select-row"][data-id="bom-1"]').check()
        await frame.locator('.business-record-actions [data-action="open-related-tasks"]').first().click()
        const related = frame.getByRole('dialog', { name: '相关任务', exact: true })
        const picker = related.getByLabel('关联销售订单', { exact: true })
        const orders = await picker.locator('option[value]:not([value=""])').evaluateAll((items) => items.map((item) => ({ value: item.value, label: item.label })))
        assert(orders.length > 0)
        if (orders.length === 1) assert.equal(await readSelectValue(picker), orders[0].value, '唯一关联订单自动选中')
        else {
          assert.equal(await related.locator('[data-action="open-task-create"]').isDisabled(), true)
          await chooseSelectOption(picker, orders[0].value)
        }
        const orderNo = orders[0].label
        assert.equal(await frame.locator('[role="dialog"]:visible').count(), 1)
        await related.locator('[data-action="open-task-create"]').click()
        const create = frame.getByRole('dialog', { name: '新建跟进任务', exact: true })
        await create.getByText(orderNo, { exact: true }).waitFor()
        await create.getByRole('button', { name: '取消', exact: true }).click()
        assert.equal(await readSelectValue(picker), orders[0].value, '新建返回保留 BOM 和关联订单')
        await related.getByRole('button', { name: '流程跟踪', exact: true }).click()
        const tracking = frame.getByRole('dialog', { name: '流程跟踪', exact: true })
        await tracking.getByRole('heading', { name: orderNo, exact: true }).waitFor()
        await tracking.getByRole('button', { name: '返回相关任务', exact: true }).click()
        assert.equal(await readSelectValue(picker), orders[0].value)
        await page.screenshot({ path: path.join(outputDir, 'ui-design-bom-task-entry-panel.png'), animations: 'disabled' })
      },
    },
  ]
  const groupedEntries = [
    ['sales', 'sales_order', '/erp/sales/project-orders/sales-orders'],
    ['purchase', 'purchase_order', '/erp/purchase/accessories'],
    ['outsourcing', 'outsourcing_order', '/erp/purchase/processing-contracts'],
    ['production', 'production_order', '/erp/production/orders'],
    ['shipment', 'shipment', '/erp/warehouse/shipments'],
  ].map(([key, sourceType, pagePath]) => {
    let sourceID = null
    return {
      name: `business-task-entry-${key}`,
      path: pagePath,
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      beforeNavigate: async (page) => {
        await page.route('**/rpc/workflow', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (method === 'list_tracking') {
            assert.equal(params.scope, 'visible')
            assert.equal(params.source_type, sourceType)
            assert.equal(params.source_id, sourceID)
            return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 0, message: 'OK', data: { items: [], total: 0, status_counts: {}, limit: params.limit, offset: params.offset } } } })
          }
          if (method !== 'list_tasks' || !params.source_id || params.source_type !== sourceType) return route.fallback()
          assert.equal(params.source_type, sourceType)
          assert(Number.isSafeInteger(params.source_id) && params.source_id > 0)
          sourceID = params.source_id
          await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id, result: { code: 0, message: 'OK', data: { tasks: [], total: 0 } } }) })
        })
      },
      verify: async (page) => {
        const rowSelector = page.locator('.ant-table-tbody .ant-table-row input[type="radio"]:visible, .ant-table-tbody .ant-table-row input[type="checkbox"]:visible').first()
        await rowSelector.check()
        const entry = page.locator('[data-business-action-key="related-tasks"]').first()
        assert.equal(await entry.isVisible(), true, `${key} 的任务协作应直接可见`)
        if (key === 'sales') {
          await page.screenshot({ path: path.join(outputDir, 'compact-sales-toolbar-4k.png'), animations: 'disabled' })
        }
        assert.equal(await page.locator('[data-business-action-key="create-followup"]:visible').count(), 0)
        assert.equal(await page.locator('[data-business-action-key="workflow-progress"]:visible').count(), 0)
        await entry.click()
        const related = page.getByRole('dialog', { name: '相关任务', exact: true })
        await related.getByText('当前单据暂无可见任务', { exact: true }).waitFor()
        await related.locator('[data-business-action-key="create-followup"]').waitFor()
        await related.getByRole('button', { name: '流程跟踪', exact: true }).waitFor()
        const bounds = await related.evaluate((node) => ({ width: node.clientWidth, scrollWidth: node.scrollWidth }))
        assert(bounds.scrollWidth <= bounds.width + 1, `${key} 任务面板不能横向溢出`)
        await page.screenshot({ path: path.join(outputDir, `business-task-entry-${key}-panel.png`), animations: 'disabled' })
        await related.getByRole('button', { name: '流程跟踪', exact: true }).click()
        await page.waitForURL('**/erp/task-board?*')
        assert.equal(new URL(page.url()).searchParams.get('track_source_type'), sourceType)
        assert.equal(new URL(page.url()).searchParams.get('track_source_id'), String(sourceID))
        await page.getByText('当前筛选下没有匹配记录', { exact: true }).waitFor()
        await assertNoHorizontalOverflow(page, `business-task-entry-${key}`)
      },
    }
  })
  const pagedTasks = Array.from({ length: 21 }, (_, index) => ({
    id: 99100 + index,
    version: 1,
    task_code: `FOLLOWUP-PAGED-${index + 1}`,
    task_name: index === 0 ? '核对包装尺寸、色卡、车缝位置及不同批次产品规格，确认全部资料后反馈处理结果' : `核对任务 ${index + 1}`,
    task_group: 'business_followup',
    source_type: 'sales_order',
    source_id: 1,
    source_no: 'SO-STYLE-L1',
    owner_role_key: 'sales',
    task_status_key: 'ready',
    payload: { description: '检查资料并反馈处理结果' },
  }))
  let appendFailed = false
  const mobilePagination = {
    name: 'business-related-tasks-mobile-pagination',
    path: '/erp/sales/project-orders/sales-orders',
    auth: 'admin',
    effectiveSession: customerRuntimeEffectiveSession,
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    workflowTaskFixtures: pagedTasks,
    beforeNavigate: async (page) => {
      appendFailed = false
      pagedTasks[0].task_status_key = 'ready'
      await page.route('**/rpc/workflow', async (route) => {
        const { id, method, params = {} } = route.request().postDataJSON()
        if (method !== 'list_tasks' || params.source_type !== 'sales_order' || params.source_id !== 1) return route.fallback()
        if (params.offset === 10 && !appendFailed) {
          appendFailed = true
          return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 500, message: '暂时无法读取' } } })
        }
        return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 0, message: 'OK', data: { tasks: pagedTasks.slice(params.offset, params.offset + params.limit), total: pagedTasks.length, offset: params.offset, limit: params.limit } } } })
      })
    },
    verify: async (page) => {
      await page.locator('.ant-table-tbody input[type="radio"]').first().check()
      const entry = page.locator('[data-business-action-key="related-tasks"]').first()
      if (!(await entry.isVisible())) await page.getByRole('button', { name: /^更多操作，共/ }).click()
      await entry.click()
      const panel = page.getByRole('dialog', { name: '相关任务', exact: true })
      const cards = panel.getByRole('listitem')
      await cards.first().waitFor()
      await panel.locator('.business-task-panel__more').scrollIntoViewIfNeeded()
      const retry = panel.locator('.business-task-panel__more').getByRole('button', { name: '重新读取', exact: true })
      await retry.waitFor()
      assert.equal(await cards.count(), 10, '追加失败保留已加载任务')
      await retry.click()
      await panel.getByRole('button', { name: '核对任务 20', exact: true }).waitFor()
      await panel.locator('.business-task-panel__more').scrollIntoViewIfNeeded()
      await panel.getByRole('button', { name: '核对任务 21', exact: true }).waitFor()
      assert.equal(await cards.count(), 21, '重试后连续追加，不能重复或丢失任务')
      assert.equal(await panel.locator('.ant-pagination:visible').count(), 0)
      pagedTasks[0].task_status_key = 'done'
      await panel.getByRole('button', { name: '核对任务 21', exact: true }).click()
      const drawer = page.locator('.erp-task-action-drawer:visible')
      await drawer.locator('.ant-drawer-close').click()
      await cards.first().getByText('已完成', { exact: true }).waitFor()
      await page.setViewportSize({ width: 844, height: 390 })
      await panel.getByRole('cell', { name: pagedTasks[0].task_name, exact: true }).waitFor()
      await page.setViewportSize({ width: 390, height: 844 })
      await cards.first().getByText('已完成', { exact: true }).waitFor()
      const bounds = await panel.evaluate((node) => ({ width: node.clientWidth, scrollWidth: node.scrollWidth }))
      assert(bounds.scrollWidth <= bounds.width + 1, '长任务名称与手机横竖屏切换不能产生横向溢出')
      await page.screenshot({ path: path.join(outputDir, 'business-related-tasks-mobile-long-title.png'), animations: 'disabled' })
    },
  }
  return [...scenarios, ...groupedEntries, mobilePagination, { ...scenarios[0], name: 'business-followup-dark-compact', themeMode: 'dark', viewport: { width: 390, height: 844 } }]
}
