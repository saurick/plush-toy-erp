import { writeFile } from 'node:fs/promises'
import { createMobileTaskHandlingCoverageScenarios } from './mobileTaskHandlingCoverageScenarios.mjs'
import { createTaskBusinessReturnScenarios } from './taskBusinessReturnScenarios.mjs'
import { createTaskFusedFlowScenarios } from './taskFusedFlowScenarios.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { stylePaginatedRpcData } from './rpcMockResult.mjs'
import { clickTaskCardContent } from './taskCopyAssertions.mjs'
import { createBusinessFollowupScenarios } from './businessFollowupScenarios.mjs'

const writeMethod = /^(?:save_|post_|create_|execute_|submit_|ship_|complete_task|reject_task|resume_task|block_task|urge_task|reassign_task|cancel_|update_|delete_|release_|confirm_)/u

async function openTask(page, task, mobile, historical = false) {
  if (mobile) {
    await page.getByTestId('mobile-role-nav-tasks').click()
    if (historical) await page.getByRole('tab', { name: /^已办(?:\s|$)/u }).click()
  }
  try {
    if (mobile && historical) {
      const card = page.locator(`[data-mobile-task-id="${task.id}"]`)
      await card.waitFor()
      await clickTaskCardContent(card, card.getByText(task.task_name, { exact: true }))
    } else {
      await page.getByRole('button', { name: `查看${task.task_name}详情`, exact: true }).click({ timeout: 8000 })
    }
  } catch (error) {
    throw new Error(`${error.message}\n${(page.taskUnifiedErrors || []).join('\n')}`)
  }
  return page.getByRole('tablist', { name: '任务处理步骤', exact: true })
}

function rpcResponder(route, id, data) {
  return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 0, data } } })
}

async function stableSteps(page, steps, assert, to = 0) {
  await waitForFiniteAnimations(page)
  const handle = await steps.elementHandle()
  const before = await steps.boundingBox()
  await steps.getByRole('tab').nth(to).click()
  await steps.getByRole('tab').nth(1).click()
  const after = await steps.boundingBox()
  assert.equal(await steps.evaluate((node, previous) => node === previous, handle), true, 'step navigation retains the original strip')
  for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(before[key] - after[key]) <= 1, `${key}: ${before[key]} -> ${after[key]}`)
}

export function createTaskUnifiedHandlingScenarios(deps) {
  const { assert, path, outputDir, assertNoHorizontalOverflow } = deps
  const historyBases = createMobileTaskHandlingCoverageScenarios(deps).filter((scenario) => !scenario.name.endsWith('-pending'))
  const shipmentDrafts = [false, true].flatMap((mobile) => [{ identity: 'handler' }, { identity: 'supervisor' }, ...(mobile ? [{ identity: 'handler', approved: true }, { identity: 'handler', approved: true, retryShip: true }] : [])].map(({ identity, approved = false, retryShip = false }, index) => {
    const caseIdentity = `${identity}${approved ? '-approved' : ''}${retryShip ? '-retry' : ''}`
    const base = historyBases.find((scenario) => scenario.name === 'mobile-task-handling-shipment')
    const task = { ...base.workflowTaskFixtures[0], id: 99880 + index, task_status_key: 'ready', completed_at: null, task_group: 'handoff_shipment_execute', task_code: 'source-handoff-shipment-execute-1', owner_role_key: 'sales', process_instance_id: null, discovery: { stage_key: 'shipment' }, payload: { source_task_contract: 'workflow.source-task/v1', source_task_producer: 'fulfillment.source', source_record_id: 1, source_task_intent_hash: 'a'.repeat(64), entry_path: '/erp/warehouse/shipments?shipment_id=1' } }
    const initialRecord = { id: 1, shipment_no: task.source_no, status: 'DRAFT', version: 1, finance_release_status: approved ? 'APPROVED' : 'PENDING', finance_release_version: 1, sales_order_id: 1, customer_id: 1, customer_snapshot: '模拟客户', currency: 'CNY', planned_ship_at: 1793116800, shipping_mark: '本次唛头', note: '分批出货', items: Array.from({ length: 25 }, (_, row) => ({ id: row + 11, shipment_id: 1, sales_order_item_id: row + 1, product_id: 1, product_sku_id: 1, warehouse_id: 1, unit_id: 1, lot_id: 1, quantity: '10' })) }
    let reads
    let record
    let shipAttempts
    let releaseFirstShip
    return {
      ...base,
      name: `task-step-source-shipment-${mobile ? 'mobile' : 'desktop'}-${caseIdentity}`,
      path: mobile ? '/m/all/tasks' : '/erp/task-board',
      viewport: mobile ? { width: 393, height: 852 } : { width: 1920, height: 1080 },
      workflowTaskFixtures: [task],
      beforeNavigate: async (page) => {
        reads = 0
        record = structuredClone(initialRecord)
        shipAttempts = 0
        releaseFirstShip = null
        await base.beforeNavigate(page)
        await page.route('**/rpc/operational_fact', async (route) => {
          const { id, method, params } = route.request().postDataJSON()
          if (method === 'get_shipment') { reads += 1; return rpcResponder(route, id, { shipment: record }) }
          if (method === 'ship_shipment') {
            assert.equal(approved, true)
            assert.equal(params.id, record.id)
            shipAttempts += 1
            if (retryShip && shipAttempts === 1) {
              await new Promise((resolve) => { releaseFirstShip = resolve })
              return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 500, message: '模拟出货暂时失败' } } })
            }
            record.status = 'SHIPPED'
            record.version += 1
            return rpcResponder(route, id, { shipment: record })
          }
          if (method === 'list_shipments') return rpcResponder(route, id, stylePaginatedRpcData([record], 'shipments', params))
          return route.fallback()
        })
        await page.route('**/rpc/workflow', async (route) => {
          const { id, method } = route.request().postDataJSON()
          if (method === 'get_task') return rpcResponder(route, id, { task: record.status === 'SHIPPED' ? { ...task, task_status_key: 'done', version: 2 } : task })
          if (method === 'list_task_events') return rpcResponder(route, id, { items: [{ id: task.id * 10, task_id: task.id, event_type: record.status === 'SHIPPED' ? 'status_changed' : 'created', from_status_key: record.status === 'SHIPPED' ? 'ready' : null, to_status_key: record.status === 'SHIPPED' ? 'done' : 'ready', actor_role_key: 'sales', actor_display_name: '模拟业务', task_version: record.status === 'SHIPPED' ? 2 : 1, created_at: task.created_at }], total: 1, truncated: false })
          if (method === 'explain_action_access') return rpcResponder(route, id, { source_access: { applicable: true, resolved: true, allowed: true }, actions: ['complete', 'block', 'urge', 'reassign'].map((action_key) => ({ action_key, allowed: identity === 'handler' ? action_key === 'block' : ['urge', 'reassign'].includes(action_key), owner_role_matched: identity === 'handler' })) })
          return route.fallback()
        })
      },
      verify: async (page) => {
        const steps = await openTask(page, task, mobile)
        const information = page.getByTestId('workflow-task-business-information')
        await information.getByText(task.source_no, { exact: true }).first().waitFor()
        await page.waitForFunction(() => !document.querySelector('.erp-task-action-drawer [data-business-form-page][aria-busy="true"]'))
        if (mobile) await information.getByRole('heading', { name: '出货明细 · 25 项', exact: true }).waitFor()
        await page.screenshot({ path: path.join(outputDir, `shipment-${mobile ? 'mobile' : 'desktop'}-${caseIdentity}-information.png`) })
        await waitForFiniteAnimations(page)
        await steps.getByRole('tab').nth(1).click()
        const business = page.getByTestId('mobile-task-fact-form')
        await business.waitFor()
        const sourceReads = reads
        await steps.getByRole('tab').nth(1).click()
        assert.equal(await information.isVisible(), false)
        assert.equal(await business.getByTestId('mobile-task-business-source').count(), 0, 'the source summary is independent of whether an editor is open')
        if (mobile) {
          assert.equal(await business.getByRole('heading', { name: /^本次出货明细/u }).count(), approved ? 1 : 0, 'only the current executable shipment shows its work checklist')
          assert.equal(await business.getByRole('heading', { name: '本次业务资料', exact: true }).count(), 0)
          assert.equal(await page.getByTestId('mobile-task-action-screen').locator('.mobile-task-context-card').count(), 0)
          assert.equal(await page.getByRole('button', { name: '提交出货审批', exact: true }).filter({ visible: true }).count(), 0, 'mobile cannot bypass the desktop authoring boundary')
        }
        await steps.getByRole('tab').nth(0).click()
        await information.getByText(task.source_no, { exact: true }).first().waitFor()
        await steps.getByRole('tab').nth(1).click()
        assert.equal(reads, sourceReads, 'step navigation does not reload source data')
        assert.equal(await steps.getByRole('tab').nth(2).isEnabled(), false)
        assert.deepEqual(page.taskUnifiedMutations, [])
        await waitForFiniteAnimations(page)
        await assertNoHorizontalOverflow(page, 'shipment-step-separation')
        await page.screenshot({ path: path.join(outputDir, `shipment-${mobile ? 'mobile' : 'desktop'}-${caseIdentity}-handling.png`) })
        if (approved) {
          await business.getByRole('heading', { name: '本次出货明细 · 25 项', exact: true }).waitFor()
          const checklist = business.getByRole('region', { name: '本次出货明细', exact: true })
          assert.equal(await checklist.locator('.erp-business-row-item-card').count(), 25)
          if (retryShip) await checklist.locator('.erp-business-row-item-card').nth(20).scrollIntoViewIfNeeded()
          const checklistInstance = await checklist.elementHandle()
          const scroller = page.getByTestId('mobile-task-action-screen').locator('.mobile-role-tasks-page__detail-main')
          const scrollBefore = await scroller.evaluate((node) => node.scrollTop)
          if (retryShip) assert.ok(scrollBefore > 280, 'recovery is tested after reading later shipment rows')
          await page.locator('[data-business-action-key="shipment-ship"]').filter({ visible: true }).click()
          await page.locator('.ant-popconfirm:visible').getByRole('button', { name: '确认', exact: true }).click()
          if (retryShip) {
            await page.waitForFunction(() => document.querySelector('[data-testid="mobile-task-action-screen"]')?.getAttribute('aria-busy') === 'true')
            try {
              const visible = await checklist.isVisible()
              const sameNode = visible ? await checklist.evaluate((node, previous) => node === previous, checklistInstance) : false
              const scrollAfter = await scroller.evaluate((node) => node.scrollTop)
              await writeFile(path.join(outputDir, 'shipment-retry-pending.json'), JSON.stringify({ visible, sameNode, scrollBefore, scrollAfter, status: record.status, version: record.version }, null, 2))
              await page.screenshot({ path: path.join(outputDir, 'shipment-mobile-handler-approved-retry-pending.png') })
              assert.equal(visible, true, 'request processing preserves the current shipment checklist')
              assert.equal(sameNode, true)
              assert.ok(Math.abs(scrollAfter - scrollBefore) <= 1)
            } finally { releaseFirstShip?.() }
            await page.waitForFunction(() => document.querySelector('[data-testid="mobile-task-action-screen"]')?.getAttribute('aria-busy') === 'false')
            assert.equal(record.status, 'DRAFT')
            assert.equal(await steps.getByRole('tab').nth(2).isEnabled(), false)
            assert.equal(await checklist.isVisible(), true)
            assert.ok(Math.abs(await scroller.evaluate((node) => node.scrollTop) - scrollBefore) <= 1, 'a failed shipment preserves the current reading position')
            await page.screenshot({ path: path.join(outputDir, 'shipment-mobile-handler-approved-retry-failed.png') })
            await page.locator('[data-business-action-key="shipment-ship"]').filter({ visible: true }).click()
            await page.locator('.ant-popconfirm:visible').getByRole('button', { name: '确认', exact: true }).click()
          }
          await page.waitForFunction(() => [...document.querySelectorAll('[data-result-state]')].some((node) => node.dataset.resultState === 'ready'))
          assert.equal(record.status, 'SHIPPED')
          assert.equal(record.version, 2)
          assert.deepEqual(page.taskUnifiedMutations.map((entry) => entry.method), Array.from({ length: retryShip ? 2 : 1 }, () => 'ship_shipment'))
          await steps.getByRole('tab').nth(2).click()
          await page.getByTestId('workflow-task-action-receipt').filter({ visible: true }).getByText('确认出货已完成', { exact: true }).waitFor()
          await page.waitForFunction(() => !document.querySelector('.ant-message-notice'))
          await page.screenshot({ path: path.join(outputDir, `shipment-mobile-${caseIdentity}-receipt.png`) })
        }
      },
    }
  }))
  const histories = historyBases.flatMap((base) => [true, false].map((mobile) => {
    const task = base.workflowTaskFixtures[0]
    task.created_at = Math.floor(Date.now() / 1000) - 120
    task.completed_at = Math.floor(Date.now() / 1000) - 60
    return {
      ...base,
      name: `task-unified-history-${mobile ? 'mobile' : 'desktop'}-${task.source_type}`,
      path: mobile ? base.path : '/erp/task-board?lane=finished',
      viewport: mobile ? { width: 320, height: 568 } : { width: 1920, height: 1080 },
      beforeNavigate: async (page) => {
        await base.beforeNavigate(page)
        await page.route('**/rpc/workflow', async (route) => {
          const { id, method, params } = route.request().postDataJSON()
          if (method !== 'list_task_events' || params.task_id !== task.id) return route.fallback()
          return rpcResponder(route, id, {
            items: [
              { id: task.id * 10 + 2, task_id: task.id, event_type: 'payload_refreshed', task_version: task.version, created_at: task.completed_at + 30, reason: '资料整理不能替换办理结果' },
              { id: task.id * 10 + 1, task_id: task.id, event_type: 'status_changed', from_status_key: 'ready', to_status_key: 'done', actor_role_key: task.owner_role_key, actor_display_name: '历史办理人', actor_username: 'sim_handler', reason: `已核对${task.source_no}并完成本次任务`, task_version: task.version, created_at: task.completed_at },
            ],
            truncated: false,
            total: 2,
            limit: params.limit,
            offset: 0,
          })
        })
      },
      verify: async (page) => {
        const methods = []
        page.on('request', (request) => { if (request.url().includes('/rpc/')) methods.push(request.postDataJSON()?.method) })
        const steps = await openTask(page, task, mobile, true)
        await steps.getByRole('tab').nth(1).click()
        await page.locator('[data-testid="mobile-task-fact-form"]').waitFor()
        await page.waitForFunction(() => document.querySelector('[data-task-business-page]')?.getAttribute('aria-busy') !== 'true')
        const business = page.getByTestId('mobile-task-fact-form')
        const inventory = task.source_type === 'inventory_operation'
        if (!inventory) await steps.getByRole('tab').nth(0).click()
        const sourceView = inventory
          ? business.locator('.erp-inventory-ledger-page')
          : page.getByTestId('workflow-task-business-information').getByTestId('mobile-task-business-source')
        await sourceView.waitFor()
        await sourceView.getByText(task.source_no, { exact: true }).first().waitFor()
        const fields = await sourceView.locator(inventory ? '.ant-descriptions-item-label, .ant-descriptions-item-content' : 'dt, dd').allTextContents()
        assert.ok(fields.length >= 6, `${task.source_type}: actual read-only fields are present`)
        assert.ok(fields.some((field) => field.includes(task.source_no)), 'source identity is read from the original business record')
        await writeFile(path.join(outputDir, `task-unified-history-${mobile ? 'mobile' : 'desktop'}-${task.source_type}-fields.json`), JSON.stringify(fields, null, 2))
        await steps.getByRole('tab').nth(1).click()
        assert.equal(await business.locator('input:not(:disabled):not([readonly]):not([type="range"]), textarea:not(:disabled):not([readonly])').filter({ visible: true }).count(), 0)
        if (!inventory) {
          assert.equal(await sourceView.isVisible(), false, 'full source fields belong to information, including historical and readonly tasks')
          assert.equal(await business.getByTestId('mobile-task-business-source').count(), 0)
        }
        await stableSteps(page, steps, assert)
        await steps.getByRole('tab').nth(2).click()
        const receipt = page.getByTestId('workflow-task-action-receipt').filter({ visible: true })
        await receipt.getByText(`已核对${task.source_no}并完成本次任务`, { exact: true }).waitFor()
        await receipt.getByText(/历史办理人/u).waitFor()
        const expectedTime = new Date(task.completed_at * 1000).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
        await receipt.getByText(expectedTime, { exact: true }).waitFor()
        assert.equal(await receipt.getByText('资料整理不能替换办理结果', { exact: true }).count(), 0)
        await writeFile(path.join(outputDir, `task-unified-history-${mobile ? 'mobile' : 'desktop'}-${task.source_type}-receipt.json`), JSON.stringify({ actor: '历史办理人', completedAt: task.completed_at, reason: `已核对${task.source_no}并完成本次任务`, rendered: await receipt.innerText() }, null, 2))
        await steps.getByRole('tab').nth(1).click()
        assert.equal(await steps.getByRole('tab').nth(2).isEnabled(), true)
        const writes = methods.filter((method) => writeMethod.test(method))
        assert.deepEqual(writes, [], 'historical records cannot trigger business mutations')
        assert.equal(await page.locator('[data-business-action-role="primary"]:visible:not(:disabled)').count(), 0)
        if (mobile) assert.equal(await page.locator('.mobile-task-flow-header').count(), 1)
        await assertNoHorizontalOverflow(page, `history-${task.source_type}`)
        await page.screenshot({ path: path.join(outputDir, `task-unified-history-${mobile ? 'mobile' : 'desktop'}-${task.source_type}.png`) })
      },
    }
  }))

  const capture = [false, true].map((mobile) => {
    const base = createTaskBusinessReturnScenarios(deps).find((scenario) => scenario.name === `task-business-return-${mobile ? 'mobile' : 'desktop'}`)
    const task = base.workflowTaskFixtures[0]
    let attempts = 0
    const writes = []
    return {
      ...base,
      name: `task-unified-capture-${mobile ? 'mobile' : 'desktop'}`,
      viewport: mobile ? { width: 320, height: 568 } : base.viewport,
      beforeNavigate: async (page) => {
        attempts = 0
        writes.length = 0
        await base.beforeNavigate(page)
        await page.route('**/rpc/workflow', async (route) => {
          const { id, method } = route.request().postDataJSON()
          if (method !== 'explain_action_access') return route.fallback()
          return rpcResponder(route, id, { source_access: { applicable: true, resolved: true, allowed: true }, actions: [{ action_key: 'complete', allowed: false, owner_role_matched: true }] })
        })
        await page.route('**/rpc/production_wip', async (route) => {
          const { id, method, params } = route.request().postDataJSON()
          if (method !== 'execute_production_wip_action') return route.fallback()
          attempts += 1
          writes.push(params)
          if (attempts === 1) return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 500, message: '模拟保存失败' } } })
          return route.fallback()
        })
      },
      verify: async (page) => {
        const steps = await openTask(page, task, mobile)
        assert.equal(await steps.getByRole('tab').nth(2).isEnabled(), false)
        await steps.getByRole('tab').nth(1).click()
        const field = page.getByLabel('包装版本', { exact: true })
        await field.fill('彩盒与唛头已核对')
        await stableSteps(page, steps, assert)
        assert.equal(await field.inputValue(), '彩盒与唛头已核对')
        await page.getByRole('button', { name: '确认办理', exact: true }).click()
        await page.waitForFunction(() => !document.querySelector('.ant-btn-loading'))
        assert.equal(attempts, 1)
        assert.equal(await field.inputValue(), '彩盒与唛头已核对')
        assert.equal(await steps.getByRole('tab').nth(2).isEnabled(), false)
        await writeFile(path.join(outputDir, 'capture-before-retry.json'), JSON.stringify(await page.locator('button').filter({ hasText: /^确认办理$/u }).evaluateAll((nodes) => nodes.map((node) => ({ disabled: node.disabled, hidden: Boolean(node.closest('[hidden]')), inert: Boolean(node.closest('[inert]')), ariaHidden: Boolean(node.closest('[aria-hidden="true"]')), rect: node.getBoundingClientRect().toJSON() }))), null, 2))
        await page.getByRole('button', { name: '确认办理', exact: true }).click()
        try {
          await page.waitForFunction(() => {
            const tab = document.querySelector('.mobile-task-flow-step[data-step-key="result"], #erp-task-action-step-confirm-tab')
            return tab && !tab.disabled
          }, { timeout: 8000 })
        } catch (error) {
          await writeFile(path.join(outputDir, 'capture-result-debug.json'), JSON.stringify({ attempts, writes, errors: page.taskUnifiedErrors, view: await page.evaluate(() => ({ workspace: [...document.querySelectorAll('[data-task-business-page]')].map((node) => ({ ...node.dataset })), text: document.body.innerText.slice(-5000) })) }, null, 2))
          throw error
        }
        assert.equal(attempts, 2)
        assert.equal(writes[0].idempotency_key, writes[1].idempotency_key)
        await steps.getByRole('tab').nth(2).click()
        const receipt = page.getByTestId('workflow-task-action-receipt').filter({ visible: true })
        await receipt.getByText('彩盒与唛头已核对', { exact: true }).waitFor()
        assert.match(await receipt.innerText(), /已完成/u)
        await steps.getByRole('tab').nth(0).click()
        await steps.getByRole('tab').nth(1).click()
        await steps.getByRole('tab').nth(2).click()
        await receipt.getByText('彩盒与唛头已核对', { exact: true }).waitFor()
        assert.equal(attempts, 2)
        await assertNoHorizontalOverflow(page, 'task-unified-capture')
        await page.screenshot({ path: path.join(outputDir, `task-unified-capture-${mobile ? 'mobile' : 'desktop'}.png`) })
      },
    }
  })

  const onsite = [false, true].map((mobile) => {
    const base = historyBases.find((scenario) => scenario.name === 'mobile-task-handling-receipt')
    const task = { ...base.workflowTaskFixtures[0],
task_status_key: 'ready',
completed_at: null,
task_group: 'handoff_receipt_inbound',
task_code: 'source-handoff-receipt-inbound-603',
owner_role_key: 'warehouse',
process_instance_id: null,
      payload: { source_task_contract: 'workflow.source-task/v1', source_task_producer: 'fulfillment.source', source_record_id: 603, source_task_intent_hash: 'a'.repeat(64), entry_path: '/erp/warehouse/inbound?receipt_id=603' } }
    let posted = 0
    return {
      ...base,
      name: `task-unified-onsite-${mobile ? 'mobile' : 'desktop'}`,
      path: mobile ? '/m/all/tasks' : '/erp/task-board',
      workflowTaskFixtures: [task],
      viewport: mobile ? { width: 393, height: 852 } : { width: 1920, height: 1080 },
      beforeNavigate: async (page) => {
        posted = 0
        await base.beforeNavigate(page)
        page.on('request', (request) => { if (request.url().includes('/rpc/') && request.postDataJSON()?.method === 'post_purchase_receipt') posted += 1 })
        await page.route('**/rpc/workflow', async (route) => {
          const { id, method } = route.request().postDataJSON()
          if (method === 'get_task') return rpcResponder(route, id, { task: posted ? { ...task, task_status_key: 'done', version: 2 } : task })
          if (method === 'explain_action_access') return rpcResponder(route, id, { source_access: { applicable: true, resolved: true, allowed: true }, actions: [{ action_key: 'complete', allowed: false, owner_role_matched: true }] })
          return route.fallback()
        })
      },
      verify: async (page) => {
        const steps = await openTask(page, task, mobile)
        await steps.getByRole('tab').nth(1).click()
        await page.locator('[data-business-action-key="post"]:visible').click()
        await page.getByRole('button', { name: '确认', exact: true }).click()
        await page.waitForFunction(() => document.querySelector('[data-step-key="result"], #erp-task-action-step-confirm-tab')?.disabled === false)
        await steps.getByRole('tab').nth(2).click()
        const receipt = page.getByTestId('workflow-task-action-receipt').filter({ visible: true })
        await receipt.getByText('已过账', { exact: true }).waitFor()
        assert.match(await receipt.innerText(), /PR-STYLE-L1-DRAFT/u)
        assert.equal(posted, 1)
        await assertNoHorizontalOverflow(page, 'task-unified-onsite')
        await page.screenshot({ path: path.join(outputDir, `task-unified-onsite-${mobile ? 'mobile' : 'desktop'}.png`) })
      },
    }
  })

  const decisions = ['decision', 'coordination'].flatMap((kind) => [false, true].map((mobile) => {
    const base = createTaskFusedFlowScenarios(deps).find((scenario) => scenario.name === `task-fused-flow-${mobile ? 'mobile' : 'desktop'}-light`)
    const task = { ...base.workflowTaskFixtures[0], task_group: kind === 'decision' ? 'order_review' : 'business_followup', task_status_key: 'ready', required_capability_key: kind === 'decision' ? 'workflow.task.approve' : 'workflow.task.complete' }
    const submissions = []
    return {
      ...base,
      name: `task-unified-${kind}-${mobile ? 'mobile' : 'desktop'}`,
      workflowTaskFixtures: [task],
      beforeNavigate: async (page) => {
        submissions.length = 0
        await base.beforeNavigate(page)
        await page.route('**/rpc/workflow', async (route) => {
          const { method, params } = route.request().postDataJSON()
          if (method === 'complete_task_action') submissions.push(params)
          return route.fallback()
        })
      },
      verify: async (page) => {
        const steps = await openTask(page, task, mobile)
        assert.equal(await steps.getByRole('tab').nth(2).isEnabled(), false)
        await steps.getByRole('tab').nth(1).click()
        if (!mobile) await page.getByRole('radio', { name: kind === 'decision' ? '审批通过' : '完成跟进任务', exact: true }).check()
        const reason = page.locator('textarea:visible').first()
        if (await reason.count()) {
          await reason.fill('本次核对意见')
          await stableSteps(page, steps, assert)
          assert.equal(await reason.inputValue(), '本次核对意见')
        }
        assert.equal(await page.getByTestId('mobile-task-fact-form').count(), 0)
        if (mobile) {
          await page.locator('button[type="submit"]:visible').click()
        } else {
          await page.getByRole('button', { name: '核对并确认', exact: true }).click()
          await page.locator('.ant-drawer-footer').getByRole('button', { name: kind === 'decision' ? /^(?:send )?确认通过$/u : /^(?:send )?确认完成$/u }).click()
        }
        await page.getByTestId('workflow-task-action-receipt').filter({ visible: true }).waitFor()
        assert.equal(submissions.length, 1)
        assert.equal(submissions[0].task_id, task.id)
        assert.equal(submissions[0].expected_version, 1)
        assert.equal(mobile ? submissions[0].payload.feedback : submissions[0].reason, '本次核对意见')
        assert.ok(submissions[0].idempotency_key)
        await stableSteps(page, steps, assert)
        await steps.getByRole('tab').nth(2).click()
        assert.equal(submissions.length, 1, 'reviewing the confirmed result never repeats a task write')
        await assertNoHorizontalOverflow(page, `task-unified-${kind}`)
        await waitForFiniteAnimations(page)
        await page.screenshot({ path: path.join(outputDir, `task-unified-${kind}-${mobile ? 'mobile' : 'desktop'}.png`) })
      },
    }
  }))
  const authoring = [false, true].map((mobile) => {
    const base = historyBases.find((scenario) => scenario.name === 'mobile-task-handling-sales')
    const task = { ...base.workflowTaskFixtures[0], task_group: 'engineering_data', task_status_key: 'ready', completed_at: null, owner_role_key: 'engineering', process_node_instance_id: 20, required_capability_key: 'sales_order.engineering.update' }
    const row = { id: 11, sales_order_id: 1, line_no: 1, line_status: 'open', order_category: 'NEW', product_id: 1, product_sku_id: 1, bom_id: 2, unit_id: 1, quantity: '20' }
    let version = 1
    return {
      ...base,
      name: `task-unified-authoring-${mobile ? 'mobile' : 'desktop'}`,
      path: mobile ? '/m/all/tasks' : '/erp/task-board',
      workflowTaskFixtures: [task],
      viewport: mobile ? { width: 320, height: 568 } : { width: 1920, height: 1080 },
      beforeNavigate: async (page) => {
        await base.beforeNavigate(page)
        version = 1
        await page.route('**/rpc/workflow', async (route) => {
          const { id, method } = route.request().postDataJSON()
          if (method === 'explain_action_access') return rpcResponder(route, id, { source_access: { applicable: true, resolved: true, allowed: true }, actions: [{ action_key: 'complete', allowed: false, owner_role_matched: true }] })
          return route.fallback()
        })
        await page.route('**/rpc/sales_order', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (method === 'list_sales_order_items') return rpcResponder(route, id, stylePaginatedRpcData([row], 'sales_order_items', params))
          if (method === 'save_sales_order_engineering') {
            assert.equal(params.id, 1)
            assert.equal(params.expected_version, version)
            version += 1
            return rpcResponder(route, id, { sales_order_id: 1, version })
          }
          if (method === 'get_sales_order') return rpcResponder(route, id, { sales_order: { id: 1, order_no: task.source_no, lifecycle_status: 'draft', version, customer_id: 1, currency: 'CNY' } })
          return route.fallback()
        })
      },
      verify: async (page) => {
        const steps = await openTask(page, task, mobile)
        await steps.getByRole('tab').nth(1).click()
        await page.locator('.erp-bom-editor:visible').getByLabel('BOM 版本', { exact: true }).waitFor()
        assert.equal(await page.locator('.erp-sales-order-engineering-form:visible').count(), 0, 'BOM authoring is the main task editor')
        const editor = page.locator('.erp-bom-editor:visible')
        assert.equal(await page.getByRole('button', { name: /^订单关联与打样|整理用料汇总/u }).count(), 0)
        if (mobile) {
          assert.equal(await editor.getAttribute('data-readonly'), 'true')
          assert.equal(await page.getByRole('button', { name: '保存草稿', exact: true }).filter({ visible: true }).count(), 0)
          await stableSteps(page, steps, assert)
        } else {
          assert.equal(new URL(page.url()).pathname, '/erp/task-board')
          await editor.getByLabel('BOM 版本', { exact: true }).fill('BOM-本次任务草稿')
          await steps.getByRole('tab').nth(0).click()
          await steps.getByRole('tab').nth(1).click()
          assert.equal(await editor.getByLabel('BOM 版本', { exact: true }).inputValue(), 'BOM-本次任务草稿')
          await page.getByRole('button', { name: '保存草稿', exact: true }).click()
          await page.waitForFunction(() => document.querySelector('#erp-task-action-step-confirm-tab')?.disabled === false)
          await steps.getByRole('tab').nth(2).click()
          await page.getByTestId('workflow-task-action-receipt').getByText('BOM 草稿已保存', { exact: false }).first().waitFor()
          assert.equal(task.task_status_key, 'ready', 'saving a BOM does not fabricate task completion')
          assert.equal(version, 1, 'an existing association is not rewritten')
        }
        await assertNoHorizontalOverflow(page, 'task-unified-authoring')
        await page.screenshot({ path: path.join(outputDir, `task-unified-authoring-${mobile ? 'mobile' : 'desktop'}.png`) })
      },
    }
  })
  const permissions = ['supervisor', 'assignee', 'denied'].flatMap((kind) => [false, true].map((mobile) => {
    const base = onsite[mobile ? 1 : 0]
    const task = { ...base.workflowTaskFixtures[0], ...(kind === 'assignee' ? { assignee_id: 2 } : {}) }
    return {
      ...base,
      name: `task-unified-permission-${kind}-${mobile ? 'mobile' : 'desktop'}`,
      workflowTaskFixtures: [task],
      beforeNavigate: async (page) => {
        await base.beforeNavigate(page)
        await page.route('**/rpc/workflow', async (route) => {
          const { id, method } = route.request().postDataJSON()
          if (method === 'get_task') return rpcResponder(route, id, { task })
          if (method === 'explain_action_access') return rpcResponder(route, id, { source_access: { applicable: true, resolved: true, allowed: kind !== 'denied' }, actions: [{ action_key: 'complete', allowed: false, owner_role_matched: kind !== 'supervisor' }] })
          return route.fallback()
        })
      },
      verify: async (page) => {
        const steps = await openTask(page, task, mobile)
        if (mobile && kind === 'denied') {
          assert.equal(await steps.getByRole('tab').nth(1).isEnabled(), false)
          assert.equal(await page.locator('[data-task-business-page]').count(), 0)
          assert.equal(await steps.getByRole('tab').nth(2).isEnabled(), false)
          return
        }
        await steps.getByRole('tab').nth(1).click()
        await page.locator('[data-task-business-page][data-readonly="true"]').waitFor()
        if (kind === 'denied') await page.getByText('暂时无法确认任务办理资料或权限，请重新读取。', { exact: true }).waitFor()
        assert.equal(await page.locator('[data-business-action-key="post"]:visible').count(), 0)
        assert.equal(await steps.getByRole('tab').nth(2).isEnabled(), false)
        await assertNoHorizontalOverflow(page, `task-unified-permission-${kind}`)
      },
    }
  }))
  const formalApprovals = [
    { key: 'finance', capability: 'finance.payment.approve', profile: 'finance_payment_approval', source: 'finance_payment', id: 41 },
    { key: 'inventory', capability: 'warehouse.adjustment.approve', profile: 'inventory_adjustment_approval', source: 'inventory_operation', id: 51 },
    { key: 'exception', capability: 'production.exception.approve', profile: 'production_exception_approval', source: 'production_exception_decision', id: 61 },
  ].flatMap((definition) => [false, true].map((mobile) => {
    const base = createTaskFusedFlowScenarios(deps).find((scenario) => scenario.name === `task-fused-flow-${mobile ? 'mobile' : 'desktop'}-light`)
    const task = { ...base.workflowTaskFixtures[0], task_name: `核对${definition.key}审批`, task_group: `${definition.key}_approval`, task_status_key: 'ready', source_type: definition.source, source_id: definition.id, source_no: `APPROVAL-${definition.key}`, required_capability_key: definition.capability, owner_role_key: 'boss', process_instance_id: 10, process_node_instance_id: 20 }
    const node = { id: 20, process_instance_id: 10, node_key: 'approval', node_type: 'approval', form_profile_key: definition.profile, attempt: 1, version: 1, status: 'active' }
    const context = { source: { type: task.source_type, id: task.source_id, no: task.source_no }, process_instance: { id: 10, process_key: definition.profile, process_version: 'v1', status: 'active', started_at: Math.floor(Date.now() / 1000) - 120 }, approval_form: { profile_key: definition.profile, reason_required: true, ...(definition.key === 'exception' ? { approved_quantity: { required: false, precision: 20, scale: 6 } } : {}) }, linked_node: node, nodes: [node], current_nodes: [node], completed_nodes: [], current_responsibilities: [{ node_instance_id: 20, owner_role_key: 'boss' }] }
    const submissions = []
    return {
      ...base,
      name: `task-unified-formal-${definition.key}-${mobile ? 'mobile' : 'desktop'}`,
      path: mobile ? '/m/boss/tasks' : base.path,
      adminProfile: { ...base.adminProfile, is_super_admin: false, roles: [{ role_key: 'boss' }] },
      effectiveSession: { ...base.effectiveSession, roles: ['boss'], workPools: ['boss'], workflow_visible_owner_role_keys_by_capability: Object.fromEntries(base.effectiveSession.actions.filter((key) => key.startsWith('workflow.task.') || key === definition.capability).map((key) => [key, ['boss']])) },
      workflowTaskFixtures: [task],
      beforeNavigate: async (page) => {
        submissions.length = 0
        if (definition.key === 'inventory') { await page.route('**/rpc/inventory', async (route) => {
          const { id, method } = route.request().postDataJSON()
          if (method !== 'get_inventory_operation') return route.fallback()
          return rpcResponder(route, id, { inventory_operation: { id: task.source_id, operation_no: task.source_no, operation_type: 'CYCLE_COUNT', status: 'SUBMITTED', reason: '盘点差异待核对', version: 1, items: [{ id: 1, subject_type: 'MATERIAL', subject_id: 1, warehouse_name: '模拟仓库', subject_name: '模拟材料', unit_name: '米', expected_quantity: '10', counted_quantity: '11', adjustment_quantity: '1' }] } })
        }) }
        await page.route('**/rpc/workflow', async (route) => {
          const { id, method, params } = route.request().postDataJSON()
          if (method === 'get_task_process_context') return rpcResponder(route, id, { process_context: context })
          if (method === 'complete_task_action') submissions.push(params)
          return route.fallback()
        })
      },
      verify: async (page) => {
        const steps = await openTask(page, task, mobile)
        if (definition.key === 'inventory' && !mobile) await page.getByText(task.source_no, { exact: true }).filter({ visible: true }).last().waitFor()
        await steps.getByRole('tab').nth(1).click()
        if (!mobile) await page.getByRole('radio', { name: '审批通过', exact: true }).check()
        const reason = page.locator('textarea:visible').first()
        await reason.fill('已核对本次申请和原始依据')
        if (definition.key === 'exception') await page.getByLabel(/^批准数量/u).fill('8.25')
        if (definition.key === 'inventory' && mobile) await page.getByText('盘点差异待核对', { exact: true }).filter({ visible: true }).waitFor()
        if (mobile) await page.locator('button[type="submit"]:visible').click()
        else {
          await page.getByRole('button', { name: '核对并确认', exact: true }).click()
          await page.locator('.ant-drawer-footer').getByRole('button', { name: /^(?:send )?确认通过$/u }).click()
        }
        await page.getByTestId('workflow-task-action-receipt').filter({ visible: true }).waitFor()
        assert.equal(submissions.length, 1)
        assert.deepEqual(submissions[0].payload.process_decision, { reason: '已核对本次申请和原始依据', ...(definition.key === 'exception' ? { approved_quantity: '8.25' } : {}) })
        assert.equal(submissions[0].task_id, task.id)
        assert.equal(submissions[0].expected_version, 1)
        assert.ok(submissions[0].idempotency_key)
        await stableSteps(page, steps, assert)
        await steps.getByRole('tab').nth(2).click()
        assert.equal(submissions.length, 1)
        await assertNoHorizontalOverflow(page, `formal-${definition.key}`)
        await page.screenshot({ path: path.join(outputDir, `task-unified-formal-${definition.key}-${mobile ? 'mobile' : 'desktop'}.png`) })
      },
    }
  }))
  const informationAndCollaboration = [false, true].map((mobile) => {
    const base = authoring.find((scenario) => scenario.name === `task-unified-authoring-${mobile ? 'mobile' : 'desktop'}`)
    const task = base.workflowTaskFixtures[0]
    return {
      ...base,
      name: `task-unified-information-collaboration-${mobile ? 'mobile' : 'desktop'}`,
      deviceScaleFactor: mobile ? base.deviceScaleFactor : 2,
      beforeNavigate: async (page) => {
        await base.beforeNavigate(page)
        await page.route('**/rpc/workflow', async (route) => {
          const { id, method } = route.request().postDataJSON()
          if (method !== 'explain_action_access') return route.fallback()
          return rpcResponder(route, id, { source_access: { applicable: true, resolved: true, allowed: true }, actions: [{ action_key: 'complete', allowed: false, owner_role_matched: true }, { action_key: 'urge', allowed: true, owner_role_matched: true }] })
        })
      },
      verify: async (page) => {
        const methods = []
        page.on('request', (request) => { if (request.url().includes('/rpc/')) methods.push(request.postDataJSON()?.method) })
        const steps = await openTask(page, task, mobile)
        const information = page.getByTestId('workflow-task-business-information').filter({ visible: true })
        await information.getByRole('region', { name: '本次业务资料', exact: true }).waitFor()
        assert.match(await information.innerText(), new RegExp(task.source_no, 'u'))
        await steps.getByRole('tab').nth(1).click()
        const editor = page.locator('.erp-bom-editor').filter({ visible: true })
        await editor.waitFor()
        const editorHandle = await editor.elementHandle()
        const actionPanel = mobile ? page.locator('[data-task-panel="action"]') : page.locator('#erp-task-action-step-action')
        assert.equal(await actionPanel.getByTestId('mobile-task-business-source').count(), 0, 'source metadata belongs only to step one')
        let input
        if (!mobile) {
          input = editor.getByLabel('BOM 版本', { exact: true })
          await input.fill('未保存的 BOM，协作关闭后继续编辑')
        }
        const location = page.url()
        const box = await steps.boundingBox()
        if (mobile) {
          const geometry = await page.locator('.mobile-task-flow-topbar:visible').evaluate((bar) => {
            const title = bar.querySelector('h1').getBoundingClientRect()
            const area = bar.getBoundingClientRect()
            const trigger = bar.querySelector('[aria-label="更多操作"]').getBoundingClientRect()
            return { offset: Math.abs(title.x + title.width / 2 - area.x - area.width / 2), width: trigger.width, height: trigger.height }
          })
          assert.ok(geometry.offset <= 1)
          assert.ok(geometry.width >= 44 && geometry.height >= 44)
        }
        assert.equal(await page.getByRole('button', { name: '通用任务协作', exact: true }).count(), 0)
        const more = page.getByRole('button', { name: '更多操作', exact: true }).filter({ visible: true })
        await more.click()
        const menuItems = await page.locator('.erp-task-copy-menu:visible').getByRole('menuitem').allTextContents()
        assert.ok(menuItems.length >= 2 && menuItems.every((label) => label.startsWith('复制')), 'the header only contains copies')
        await more.press('Escape')
        const urge = page.getByRole('button', { name: '更多', exact: true }).filter({ visible: true })
        await urge.click()
        await page.getByRole('menuitem', { name: '催办任务', exact: true }).click()
        const collaboration = page.getByRole('dialog', { name: '催办任务', exact: true })
        await collaboration.waitFor()
        assert.equal(await collaboration.getByRole('radiogroup').count(), 0)
        assert.equal(await collaboration.getByRole('tablist', { name: '任务处理步骤', exact: true }).count(), 0, 'collaboration is a local action dialog')
        assert.equal(await steps.getByRole('tab').nth(1).getAttribute('aria-selected'), 'true')
        assert.equal(await page.getByRole('dialog').filter({ hasText: '放弃未保存' }).count(), 0)
        await waitForFiniteAnimations(page)
        await page.screenshot({ path: path.join(outputDir, `task-information-collaboration-${mobile ? 'mobile' : 'desktop'}.png`) })
        await collaboration.locator('.ant-modal-close').click()
        await collaboration.waitFor({ state: 'hidden' })
        await waitForFiniteAnimations(page)
        await page.waitForFunction(() => document.activeElement?.closest('.erp-task-secondary-actions')?.textContent.includes('更多'))
        assert.equal(await urge.evaluate((node) => node === document.activeElement), true, 'closing collaboration restores focus to its handling button')
        assert.equal(page.url(), location)
        assert.equal(await editor.evaluate((node, before) => node === before, editorHandle), true, 'the business editor is never replaced by collaboration')
        if (input) assert.equal(await input.inputValue(), '未保存的 BOM，协作关闭后继续编辑')
        const after = await steps.boundingBox()
        for (const key of ['x', 'y', 'width', 'height']) assert.ok(Math.abs(box[key] - after[key]) <= 1, key)
        assert.deepEqual(methods.filter((method) => writeMethod.test(method)), [])
        await stableSteps(page, steps, assert)
        await assertNoHorizontalOverflow(page, 'task-information-and-collaboration')
      },
    }
  })
  const contextualActions = informationAndCollaboration.map((base) => {
    const mobile = base.name.endsWith('-mobile')
    const task = { ...base.workflowTaskFixtures[0], assignee_id: 1 }
    return {
      ...base,
      name: `task-unified-context-actions-${mobile ? 'mobile' : 'desktop'}`,
      workflowTaskFixtures: [task],
      beforeNavigate: async (page) => {
        await base.beforeNavigate(page)
        page.on('response', async (response) => {
          if (response.url().includes('/rpc/workflow') && response.request().postDataJSON()?.method === 'block_task_action') {
            await writeFile(path.join(outputDir, `task-block-response-${mobile ? 'mobile' : 'desktop'}.json`), JSON.stringify(await response.json(), null, 2))
          }
        })
        await page.route('**/rpc/workflow', async (route) => {
          const { id, method } = route.request().postDataJSON()
          if (method === 'block_task_action') {
            await new Promise((resolve) => { page.releaseTaskBlock = resolve })
            return route.fallback()
          }
          if (method !== 'explain_action_access') return route.fallback()
          return rpcResponder(route, id, { source_access: { applicable: true, resolved: true, allowed: true }, actions: ['complete', 'block', 'reject', 'urge'].map((action_key) => ({ action_key, allowed: true, owner_role_matched: true })) })
        })
      },
      verify: async (page) => {
        const writes = []
        page.on('request', (request) => { if (request.url().includes('/rpc/')) { const body = request.postDataJSON(); if (writeMethod.test(body?.method || '')) writes.push(body) } })
        const steps = await openTask(page, task, mobile)
        assert.equal(await page.getByRole('group', { name: '通用任务协作', exact: true }).filter({ visible: true }).count(), 0)
        await steps.getByRole('tab').nth(1).click()
        const actions = page.getByRole('button', { name: '更多', exact: true }).filter({ visible: true })
        await actions.waitFor()
        const geometry = await actions.boundingBox()
        assert.ok(geometry.height >= (mobile ? 44 : 32))
        await actions.click()
        const menu = page.locator('.erp-task-secondary-menu:visible')
        assert.deepEqual(await menu.getByRole('menuitem').allTextContents(), ['标记任务受阻', '转交任务'])
        const heights = await menu.getByRole('menuitem').evaluateAll((items) => items.map((item) => item.getBoundingClientRect().height))
        assert.ok(heights.every((height) => height >= (mobile ? 44 : 32)))
        await actions.press('Escape')
        assert.equal(await page.getByRole('button', { name: '退回任务', exact: true }).filter({ visible: true }).count(), 0)
        assert.equal(await page.getByRole('button', { name: '催办任务', exact: true }).filter({ visible: true }).count(), 0)
        const editor = page.locator('.erp-bom-editor').filter({ visible: true })
        await editor.waitFor()
        if (mobile) {
          const toolbar = page.locator('[data-business-editor-navigation]:visible')
          assert.ok(await toolbar.evaluate((node) => node.getBoundingClientRect().height) <= 76, 'the product selector and supplement entry share one mobile toolbar row')
        } else {
          const group = page.getByRole('group', { name: '业务办理', exact: true }).filter({ visible: true })
          await group.getByRole('button', { name: '保存草稿', exact: true }).waitFor()
          assert.equal(await group.locator('.erp-task-operation-group__label').count(), 0)
        }
        const before = await editor.elementHandle()
        const block = async () => { await actions.click(); await page.getByRole('menuitem', { name: '标记任务受阻', exact: true }).click() }
        await block()
        const dialog = page.getByRole('dialog', { name: '标记任务受阻', exact: true })
        await dialog.waitFor()
        const choices = dialog.getByRole('radiogroup', { name: '受阻原因', exact: true })
        const detail = dialog.getByLabel('补充说明（选填）', { exact: true })
        const submit = dialog.getByRole('button', { name: '标记受阻', exact: true })
        assert.equal(await choices.getByRole('radio').count(), 7)
        assert.equal(await dialog.getByRole('button', { name: '核对并确认', exact: true }).count(), 0)
        assert.equal(await submit.isEnabled(), false, 'a reason choice is required')
        await detail.fill('等待补齐本次工程资料')
        assert.equal(await submit.isEnabled(), false, 'free text does not silently choose a category')
        await choices.getByRole('radio', { name: '等资料', exact: true }).check()
        assert.equal(await submit.isEnabled(), true)
        await choices.getByRole('radio', { name: '等确认', exact: true }).check()
        assert.equal(await detail.inputValue(), '等待补齐本次工程资料')
        await detail.fill('')
        for (const name of ['其他', '原因待查']) {
          await choices.getByRole('radio', { name, exact: true }).check()
          assert.equal(await submit.isEnabled(), true, `${name} does not require free text`)
        }
        const bounds = await dialog.evaluate((node) => {
          const box = node.getBoundingClientRect()
          const fields = [...node.querySelectorAll('.ant-radio-wrapper, textarea, .ant-modal-footer button')].map((field) => {
            const rect = field.getBoundingClientRect()
            return { x: rect.x, right: rect.right, height: rect.height }
          })
          return { x: box.x, right: box.right, width: node.clientWidth, scrollWidth: node.scrollWidth, fields }
        })
        assert.ok(bounds.scrollWidth <= bounds.width + 1, 'the reason form has no horizontal overflow')
        assert.ok(bounds.fields.every((field) => field.x >= bounds.x && field.right <= bounds.right + 1))
        const targetHeights = await choices.locator('.ant-radio-wrapper').evaluateAll((nodes) => nodes.map((node) => node.getBoundingClientRect().height))
        assert.ok(targetHeights.every((height) => height >= (mobile ? 44 : 32)))
        await waitForFiniteAnimations(page)
        await page.screenshot({ path: path.join(outputDir, `task-block-reason-${mobile ? 'mobile' : 'desktop'}.png`) })
        await writeFile(path.join(outputDir, `task-block-reason-${mobile ? 'mobile' : 'desktop'}-geometry.json`), JSON.stringify(bounds, null, 2))
        await dialog.locator('.ant-modal-close').click()
        await dialog.waitFor({ state: 'hidden' })
        await waitForFiniteAnimations(page)
        await page.waitForFunction(() => document.activeElement?.textContent.trim() === '更多')
        assert.equal(await editor.evaluate((node, previous) => node === previous, before), true)
        assert.equal(await actions.evaluate((node) => node === document.activeElement), true)
        assert.equal(await actions.count(), 1)
        assert.deepEqual(writes, [])
        await assertNoHorizontalOverflow(page, 'task-context-actions')
        await block()
        await dialog.waitFor()
        assert.equal(await detail.inputValue(), '', 'cancelled explanations do not leak into the next action')
        assert.equal(await submit.isEnabled(), false)
        const selectedReason = mobile ? '原因待查' : '等资料：缺少最终图纸'
        await choices.getByRole('radio', { name: mobile ? '原因待查' : '等资料', exact: true }).check()
        if (!mobile) await detail.fill('缺少最终图纸')
        const blockRequest = page.waitForRequest((request) => request.url().includes('/rpc/workflow') && request.postDataJSON()?.method === 'block_task_action', { timeout: 8000 })
        await submit.click()
        try {
          await blockRequest
          await page.waitForFunction(() => Boolean(document.querySelector('.workflow-task-block-reason textarea:disabled')))
          assert.equal(await dialog.locator('.ant-modal-footer .ant-btn-primary').isEnabled(), false, 'a pending request cannot be submitted twice')
          assert.equal(await detail.isEnabled(), false)
          assert.equal(await choices.getByRole('radio').first().isEnabled(), false)
          assert.equal(await dialog.locator('.ant-modal-close').count(), 0, 'a pending action cannot close')
          assert.equal(writes.length, 1)
        } finally {
          page.releaseTaskBlock?.()
        }
        const receipt = page.getByTestId('workflow-task-action-receipt').filter({ visible: true })
        await receipt.getByText(selectedReason, { exact: true }).waitFor()
        assert.equal(writes.length, 1)
        assert.equal(writes[0].method, 'block_task_action')
        assert.equal(writes[0].params.task_id, task.id)
        assert.equal(writes[0].params.expected_version, 1)
        assert.equal(writes[0].params.reason, selectedReason)
        assert.ok(writes[0].params.idempotency_key)
        await assertNoHorizontalOverflow(page, 'task-block-receipt')
      },
    }
  })
  const transfers = informationAndCollaboration.map((base) => {
    const mobile = base.name.endsWith('-mobile')
    const task = base.workflowTaskFixtures[0]
    return {
      ...base,
      name: `task-unified-collaboration-transfer-${mobile ? 'mobile' : 'desktop'}`,
      verify: async (page) => {
        const writes = []
        page.on('request', (request) => {
          if (!request.url().includes('/rpc/')) return
          const body = request.postDataJSON()
          if (writeMethod.test(body?.method || '')) writes.push(body)
        })
        const steps = await openTask(page, task, mobile)
        await steps.getByRole('tab').nth(1).click()
        await page.getByRole('button', { name: '更多', exact: true }).filter({ visible: true }).click()
        await page.getByRole('menuitem', { name: '转交任务', exact: true }).click()
        const dialog = page.getByRole('dialog', { name: '转交任务', exact: true })
        const target = 70000 + task.id % 10000
        await dialog.locator('#erp-task-assignment-target').click()
        await page.locator('.ant-select-dropdown:visible').getByText(`${task.owner_role_key}-backup · 工程`, { exact: true }).click()
        await dialog.locator('textarea').fill('请同岗位同事接手本次工程资料')
        await dialog.getByRole('button', { name: '核对并确认', exact: true }).click()
        await dialog.getByRole('button', { name: '确认转交', exact: true }).click()
        const receipt = mobile ? dialog.getByTestId('workflow-task-action-receipt') : page.getByTestId('workflow-task-action-receipt').filter({ visible: true })
        await receipt.getByText('任务已转交', { exact: true }).waitFor()
        assert.equal(writes.length, 1)
        assert.equal(writes[0].method, 'reassign_task')
        assert.equal(writes[0].params.task_id, task.id)
        assert.equal(writes[0].params.expected_version, 1)
        assert.equal(writes[0].params.assignee_id, target)
        assert.equal(writes[0].params.reason, '请同岗位同事接手本次工程资料')
        assert.ok(writes[0].params.idempotency_key)
        if (mobile) {
          await dialog.locator('.ant-modal-close').click()
          await dialog.waitFor({ state: 'hidden' })
        } else await steps.getByRole('tab').nth(1).click()
        await page.locator('[data-task-business-page][data-readonly="true"]').waitFor()
        assert.equal(writes.length, 1, 'transfer does not save, submit or post the source business record')
        await assertNoHorizontalOverflow(page, 'task-collaboration-transfer')
      },
    }
  })
  const nativeTransfers = [false, true].map((mobile) => {
    const base = decisions.find((scenario) => scenario.name === `task-unified-coordination-${mobile ? 'mobile' : 'desktop'}`)
    const task = base.workflowTaskFixtures[0]
    return {
      ...base,
      name: `task-unified-followup-transfer-${mobile ? 'mobile' : 'desktop'}`,
      verify: async (page) => {
        const writes = []
        page.on('request', (request) => {
          if (!request.url().includes('/rpc/')) return
          const body = request.postDataJSON()
          if (writeMethod.test(body?.method || '')) writes.push(body)
        })
        const steps = await openTask(page, task, mobile)
        await steps.getByRole('tab').nth(1).click()
        await page.getByRole('button', { name: '更多', exact: true }).filter({ visible: true }).click()
        await page.getByRole('menuitem', { name: '转交任务', exact: true }).click()
        const editor = page.getByRole('dialog', { name: '转交任务', exact: true })
        await editor.locator('#erp-task-assignment-target').click()
        await page.locator('.ant-select-dropdown:visible .ant-select-item-option').first().click()
        await editor.locator('textarea').fill('请同岗位同事继续本次跟进')
        await editor.getByRole('button', { name: '核对并确认', exact: true }).click()
        await editor.getByRole('button', { name: /确认转交/u }).click()
        await page.getByTestId('workflow-task-action-receipt').filter({ visible: true }).getByText('任务已转交', { exact: true }).waitFor()
        assert.equal(writes.length, 1)
        assert.equal(writes[0].method, 'reassign_task')
        assert.equal(writes[0].params.task_id, task.id)
        assert.equal(writes[0].params.expected_version, 1)
        assert.equal(writes[0].params.assignee_id, 70000 + task.id % 10000)
        assert.equal(writes[0].params.reason, '请同岗位同事继续本次跟进')
        assert.ok(writes[0].params.idempotency_key)
        await assertNoHorizontalOverflow(page, 'followup-transfer')
      },
    }
  })
  const initiationBase = createBusinessFollowupScenarios(deps).find((scenario) => scenario.name === 'business-followup-create-retry-and-track')
  const initiationCalls = []
  const initiation = {
    ...initiationBase,
    name: 'task-unified-business-initiation',
    beforeNavigate: async (page) => {
      initiationCalls.length = 0
      await initiationBase.beforeNavigate(page)
      await page.route('**/rpc/workflow', async (route) => {
        const { method, params } = route.request().postDataJSON()
        if (['create_followup_task', 'complete_task_action'].includes(method)) initiationCalls.push({ method, params })
        return route.fallback()
      })
    },
    verify: async (page) => {
      await page.locator('.ant-table-tbody input[type="radio"]').first().check()
      assert.equal(initiationCalls.length, 0, 'opening and selecting a source record cannot create a task')
      const relatedEntry = page.locator('[data-business-action-key="related-tasks"]').first()
      if (!(await relatedEntry.isVisible())) await page.getByRole('button', { name: /^更多操作，共/u }).click()
      await relatedEntry.click()
      const related = page.getByRole('dialog', { name: '相关任务', exact: true })
      await related.locator('[data-business-action-key="create-followup"]').click()
      const create = page.getByRole('dialog', { name: '新建跟进任务', exact: true })
      await create.getByLabel('任务事项').fill('确认包装尺寸')
      await create.getByLabel('需要对方完成什么').fill('请核对最终包装尺寸，并反馈结果。')
      await create.locator('.ant-form-item').filter({ hasText: '责任岗位' }).locator('.ant-select-selector').click()
      await page.getByTitle('业务', { exact: true }).click()
      await create.getByLabel('截止时间').fill('2099/01/01 10:00')
      await create.getByLabel('截止时间').press('Enter')
      await create.getByLabel('任务事项').click()
      await create.getByRole('button', { name: '新建跟进任务', exact: true }).click()
      await create.getByText('创建结果暂未确认，内容已保留。请使用原内容重试，系统会核对已有结果。', { exact: true }).waitFor()
      await create.getByText('重试并确认结果', { exact: true }).click()
      const created = page.getByRole('dialog', { name: '跟进任务已创建', exact: true })
      await created.getByRole('button', { name: '查看相关任务', exact: true }).click()
      await related.getByRole('button', { name: '确认包装尺寸', exact: true }).click()
      const steps = page.getByRole('tablist', { name: '任务处理步骤', exact: true })
      await steps.getByRole('tab').nth(1).click()
      const drawer = page.locator('.erp-task-action-drawer')
      await drawer.getByRole('radio', { name: '完成跟进任务', exact: true }).check()
      await drawer.locator('textarea:visible').fill('已核对最终尺寸，与包装稿一致。')
      await drawer.getByRole('button', { name: '核对并确认', exact: true }).click()
      await drawer.getByRole('button', { name: /^(?:send )?确认完成$/u }).click()
      const receipt = drawer.getByTestId('workflow-task-action-receipt').filter({ visible: true })
      await receipt.getByText('已核对最终尺寸，与包装稿一致。', { exact: true }).waitFor()
      const creates = initiationCalls.filter((call) => call.method === 'create_followup_task')
      assert.equal(creates.length, 2)
      assert.deepEqual(creates[0].params, creates[1].params, 'an uncertain creation response reuses the exact same intent and idempotency key')
      assert.equal(initiationCalls.filter((call) => call.method === 'complete_task_action').length, 1)
      assert.equal(new URL(page.url()).pathname, initiationBase.path)
      await assertNoHorizontalOverflow(page, 'source-initiation-to-receipt')
      await page.screenshot({ path: path.join(outputDir, 'task-unified-business-initiation.png') })
    },
  }
  return [...capture, ...onsite, ...authoring, ...decisions, ...permissions, ...formalApprovals, ...histories, ...shipmentDrafts, ...informationAndCollaboration, ...contextualActions, ...transfers, ...nativeTransfers, initiation].map((scenario) => ({
    ...scenario,
    beforeNavigate: async (page) => {
      page.taskUnifiedErrors = []
      page.taskUnifiedMutations = []
      page.on('request', (request) => {
        if (!request.url().includes('/rpc/')) return
        const body = request.postDataJSON()
        if (writeMethod.test(body?.method || '')) page.taskUnifiedMutations.push({ method: body.method, params: body.params })
      })
      page.on('console', (message) => { if (message.type() === 'error') page.taskUnifiedErrors.push(message.text().slice(0, 2500)) })
      page.on('pageerror', (error) => page.taskUnifiedErrors.push(String(error.stack || error).slice(0, 2500)))
      await scenario.beforeNavigate?.(page)
    },
    verify: async (page) => {
      await scenario.verify(page)
      await writeFile(path.join(outputDir, `${scenario.name}-mutations.json`), JSON.stringify(page.taskUnifiedMutations, null, 2))
    },
  }))
}
