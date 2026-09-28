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
          } else {
            await route.fallback()
            return
          }
          await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id, result: { code: 0, message: 'OK', data } }) })
        })
      },
      verify: async (page) => {
        const create = page.locator('[data-business-action-key="create-followup"]')
        const dialog = page.getByRole('dialog', { name: '新建跟进任务', exact: true })
        const openCreateDialog = async () => {
          if (!(await create.isVisible())) await page.getByRole('button', { name: /^更多操作，共/ }).click()
          await create.click()
          await dialog.waitFor()
        }
        await page.locator('.ant-table-tbody .ant-table-row').first().waitFor()
        await page.locator('.ant-table-tbody input[type="radio"]').first().check()
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
        await dialog.locator('.ant-form-item').filter({ hasText: '责任岗位' }).locator('.ant-select-selector').click()
        await page.getByTitle('品质', { exact: true }).click()
        await dialog.locator('.ant-form-item').filter({ hasText: '办理人' }).locator('.ant-select-selector').click()
        await page.getByTitle('品质人员', { exact: true }).click()
        await dialog.locator('.ant-form-item').filter({ hasText: '责任岗位' }).locator('.ant-select-selector').click()
        await page.getByTitle('业务', { exact: true }).click()
        assert.match(await dialog.innerText(), /由岗位共同办理/)
        const deadlineInput = dialog.getByLabel('截止时间')
        const deadlinePicker = dialog.locator('.erp-business-date-time-input')
        await deadlinePicker.click({ position: { x: 16, y: 16 } })
        const pickerPopup = page
          .locator('.ant-picker-dropdown:not(.ant-picker-dropdown-hidden)')
          .last()
        await pickerPopup.waitFor()
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
        await drawer.getByRole('button', { name: '关闭', exact: true }).last().click()
        await drawer.waitFor({ state: 'hidden' })
        await related.getByRole('button', { name: '确认包装尺寸' }).waitFor()
        await page.screenshot({ path: path.join(outputDir, `business-followup-related-${page.viewportSize().width}.png`), animations: 'disabled' })
        await related.getByRole('button', { name: '销售订单审批（任务看板）', exact: true }).click()
        await page.waitForURL('**/erp/task-board?*')
        assert.equal(new URL(page.url()).searchParams.get('q'), 'SO-APPROVAL-100')
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
        await frame.locator('[data-action="status"][data-value="closed"]').click()
        await frame.locator('[data-action="select-row"]').first().check()
        assert.equal(await frame.locator('[data-action="open-task-create"]').isDisabled(), true)
        await frame.locator('[data-action="open-related-tasks"]').click()
        const relatedTasks = frame.getByRole('dialog', { name: '相关任务' })
        await relatedTasks.waitFor()
        await clickDialogBackdrop(relatedTasks)
        await relatedTasks.waitFor({ state: 'hidden' })
        await frame.locator('[data-action="status"][data-value="draft"]').click()
        await frame.locator('[data-action="select-row"]').first().check()
        await frame.locator('[data-action="open-task-create"]').click()
        const taskCreate = frame.getByRole('dialog', {
          name: '新建跟进任务',
          exact: true,
        })
        await clickDialogBackdrop(taskCreate)
        await taskCreate.waitFor({ state: 'hidden' })
        await frame.locator('[data-action="open-task-create"]').click()
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
        await frame.locator('#task-create-role').selectOption('采购')
        await frame.locator('#task-create-assignee').selectOption('李倩')
        await frame.locator('#task-create-role').selectOption('销售')
        assert.equal(await frame.locator('#task-create-assignee').inputValue(), 'unassigned')
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
  ]
  return [...scenarios, { ...scenarios[0], name: 'business-followup-dark-compact', themeMode: 'dark', viewport: { width: 390, height: 844 } }]
}
