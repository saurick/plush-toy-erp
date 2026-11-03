import path from 'node:path'
import { InventoryOperationStatus, ProcessKey, ProcessNodeStatus, ProcessNodeType, ProcessStatus, WorkflowTaskStatus } from '../../src/common/consts/statuses.generated.mjs'
import { RpcMethod } from '../../src/common/consts/rpcMethods.generated.mjs'
import { styleRpcResult } from './rpcMockResult.mjs'
import { assertVisibleBusinessFormControlHeight } from './inputControlAssertions.mjs'

export function createTransactionFormRecoveryScenarios({
  assert,
  customerRuntimeEffectiveSession,
  expectHeading,
  expectText,
  outputDir,
  assertNoHorizontalOverflow,
}) {
  let createCalls = []
  let postedCalls = 0
  let operation
  const processCalls = []
  const processID = 1811
  const submitNodeID = 1812
  const approvalNodeID = 1813
  const processData = () => {
    const submitted = operation.status === InventoryOperationStatus.SUBMITTED
    const submitNode = {
      id: submitNodeID,
      process_instance_id: processID,
      node_key: 'submit_inventory_adjustment',
      node_type: ProcessNodeType.DOMAIN_COMMAND,
      status: submitted ? ProcessNodeStatus.COMPLETED : ProcessNodeStatus.ACTIVE,
      version: submitted ? 2 : 1,
    }
    const approvalNode = { id: approvalNodeID, process_instance_id: processID, node_key: 'inventory_adjustment_approval', node_type: ProcessNodeType.APPROVAL, status: ProcessNodeStatus.ACTIVE, version: 1 }
    return {
      process_context: {
        process_instance: { id: processID, process_key: ProcessKey.INVENTORY_ADJUSTMENT_APPROVAL, business_ref_type: 'inventory_operation', business_ref_id: operation.id, status: ProcessStatus.ACTIVE },
        nodes: submitted ? [submitNode, approvalNode] : [submitNode],
        active_nodes: submitted ? [approvalNode] : [submitNode],
        settled_nodes: submitted ? [submitNode] : [],
      },
      started_node: submitNode,
      ...(submitted ? { completed_node: submitNode } : {}),
      source_readback: operation,
    }
  }
  return [
    {
      name: 'inventory-operation-create-recovery',
      path: '/erp/warehouse/inventory',
      auth: 'admin',
      viewport: { width: 1600, height: 900 },
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        pages: [...customerRuntimeEffectiveSession.pages, 'inventory'],
        actions: [
          ...customerRuntimeEffectiveSession.actions,
          'warehouse.adjustment.create',
        ],
      },
      beforeNavigate: async (page) => {
        createCalls = []
        postedCalls = 0
        processCalls.length = 0
        operation = null
        await page.route('**/rpc/inventory', async (route) => {
          const body = route.request().postDataJSON()
          if (body.method === RpcMethod.inventory.POST_INVENTORY_OPERATION) postedCalls += 1
          if (body.method !== RpcMethod.inventory.CREATE_INVENTORY_OPERATION) {
            return route.fallback()
          }
          createCalls.push(body.params)
          operation ??= {
            ...body.params,
            id: 811,
            status: InventoryOperationStatus.DRAFT,
            version: 1,
            created_by: 1,
            items: body.params.items.map((item, index) => ({
              ...item,
              id: 911 + index,
            })),
          }
          // The draft exists, but its first response omits the receipt. The retry must reuse the intent key.
          await route.fulfill({
            json: {
              jsonrpc: '2.0',
              id: body.id,
              result: styleRpcResult(
                createCalls.length === 1
                  ? {}
                  : { inventory_operation: operation }
              ),
            },
          })
        })
        await page.route('**/rpc/customer_config', async (route) => {
          const body = route.request().postDataJSON()
          if (body.method === RpcMethod.customer_config.EXECUTE_INVENTORY_ADJUSTMENT_POST) postedCalls += 1
          if (![RpcMethod.customer_config.START_INVENTORY_ADJUSTMENT_APPROVAL_PROCESS, RpcMethod.customer_config.EXECUTE_INVENTORY_ADJUSTMENT_SUBMIT].includes(body.method)) return route.fallback()
          assert.equal(body.params.inventory_operation_id, operation.id)
          processCalls.push(body)
          if (body.method === RpcMethod.customer_config.EXECUTE_INVENTORY_ADJUSTMENT_SUBMIT) {
            assert.equal(body.params.process_instance_id, processID)
            assert.equal(body.params.process_node_instance_id, submitNodeID)
            assert.equal(body.params.expected_version, 1)
            operation = { ...operation, status: InventoryOperationStatus.SUBMITTED, version: 2 }
          }
          return route.fulfill({ json: { jsonrpc: '2.0', id: body.id, result: styleRpcResult(processData()) } })
        })
        await page.route('**/rpc/workflow', async (route) => {
          const body = route.request().postDataJSON()
          if (body.method !== RpcMethod.workflow.GET_TRACKING || body.params.kind !== 'process' || body.params.id !== processID) return route.fallback()
          const now = 1_750_000_000
          const task = { task_id: 1814, task_name: '库存盘点复核', node_instance_id: approvalNodeID, owner_role_key: 'boss', assignee_name: '复核负责人', status: WorkflowTaskStatus.READY, created_at: now, completed_at: null, due_at: null }
          const tracking = {
            summary: { kind: 'process', id: processID, process_key: ProcessKey.INVENTORY_ADJUSTMENT_APPROVAL, title: '', source_type: 'inventory_operation', source_id: operation.id, source_no: operation.operation_no, display_context: null, status: ProcessStatus.ACTIVE, resolution_kind: null, started_at: now, updated_at: now, completed_at: null, initiator_name: '仓库人员', initiator_role_key: 'warehouse', current_tasks: [task] },
            tasks: [task],
            current_task_access: [{ task_id: task.task_id, can_read: true, can_handle: false }],
            nodes: processData().process_context.nodes.map((node) => ({ ...node, started_at: now, completed_at: node.status === ProcessNodeStatus.COMPLETED ? now : null, completed_by_name: '' })),
            events: [],
            events_truncated: false,
            next_event_id: 0,
          }
          return route.fulfill({ json: { jsonrpc: '2.0', id: body.id, result: styleRpcResult({ tracking }) } })
        })
      },
      verify: async (page) => {
        await expectHeading(page, '库存查询')
        await page.locator('.ant-table-row').first().click()
        await page
          .locator('button:visible')
          .filter({ hasText: /盘\s*点/u })
          .first()
          .click()
        const dialog = page.getByRole('dialog').filter({
          has: page.getByText('登记库存盘点', { exact: true }),
        })
        await dialog.waitFor()
        const submit = dialog.getByRole('button', {
          name: '提交盘点复核',
          exact: true,
        })
        await submit.click()
        await expectText(dialog, '请填写作业单号')
        await expectText(dialog, '请填写业务原因')
        assert.equal(
          createCalls.length,
          0,
          'incomplete form must not write a draft'
        )
        await dialog
          .getByLabel('作业单号', { exact: true })
          .fill('CC-BROWSER-RECOVERY')
        await dialog
          .getByLabel('业务原因', { exact: true })
          .fill('盘点后核对差异')
        const counted = dialog.getByLabel('实盘数量', { exact: true })
        await counted.fill('-1')
        await submit.click()
        await expectText(dialog, '实盘数量必须是非负数')
        assert.equal(
          createCalls.length,
          0,
          'negative count must not reach the RPC'
        )
        await counted.fill('8')
        await submit.click()
        await expectText(page, '提交结果暂时无法确认，请保持填写内容不变后重试')
        assert.equal(createCalls.length, 1)
        assert.equal(processCalls.length, 0, 'an unconfirmed draft receipt must not start approval')
        assert.equal(await counted.inputValue(), '8')
        assert.equal(
          await dialog.getByLabel('作业单号', { exact: true }).inputValue(),
          'CC-BROWSER-RECOVERY'
        )
        assert.equal(
          await dialog.getByLabel('业务原因', { exact: true }).inputValue(),
          '盘点后核对差异'
        )
        await submit.click()
        await dialog.waitFor({ state: 'hidden' })
        assert.equal(createCalls.length, 2)
        assert.deepEqual(processCalls.map((call) => call.method), [RpcMethod.customer_config.START_INVENTORY_ADJUSTMENT_APPROVAL_PROCESS, RpcMethod.customer_config.EXECUTE_INVENTORY_ADJUSTMENT_SUBMIT])
        assert.equal(processCalls[0].params.idempotency_key, 'inventory-adjustment-approval/811')
        assert.equal(processCalls[1].params.idempotency_key, `inventory-adjustment-submit/811/${submitNodeID}`)
        assert.equal(operation.status, InventoryOperationStatus.SUBMITTED)
        assert.deepEqual(
          createCalls[1],
          createCalls[0],
          'unknown response retry must preserve the complete intent and key'
        )
        const { idempotency_key: key, ...payload } = createCalls[0]
        assert.match(key, /^.{1,128}$/u)
        assert.deepEqual(payload, {
          operation_no: 'CC-BROWSER-RECOVERY',
          operation_type: 'CYCLE_COUNT',
          reason: '盘点后核对差异',
          items: [
            {
              line_no: '1',
              subject_type: 'PRODUCT',
              subject_id: 1,
              product_sku_id: 1,
              from_warehouse_id: 1,
              from_lot_id: 402,
              unit_id: 1,
              expected_quantity: '12.5',
              counted_quantity: '8',
            },
          ],
        })
        assert.equal(postedCalls, 0, 'submitting a count for review must not post inventory')
        await expectText(page, '库存盘点已提交复核')
        const receipt = page.locator('.erp-inventory-operation-receipt')
        await expectText(receipt, '等待另一位有权人员批准或驳回；审批本身不会改变库存。')
        assert.match(await receipt.innerText(), /CC-BROWSER-RECOVERY/u)
        assert.equal(await receipt.getByRole('button', { name: '过账', exact: true }).count(), 0)
        await expectText(page, '复核负责人')
        await assertNoHorizontalOverflow(
          page,
          'inventory-operation-create-recovery'
        )
        await page.screenshot({
          path: path.join(outputDir, 'inventory-operation-create-recovery.png'),
          fullPage: false,
        })
      },
    },
    {
      name: 'business-form-control-height-css-token',
      path: '/erp/finance/payments',
      auth: 'admin',
      viewport: { width: 1600, height: 900 },
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        pages: [...customerRuntimeEffectiveSession.pages, 'finance-payments'],
        actions: [
          ...customerRuntimeEffectiveSession.actions,
          'finance.payment.read',
          'finance.payment.create',
        ],
      },
      verify: async (page) => {
        await expectHeading(page, '收付款')
        await page
          .getByRole('button', { name: '登记收付款', exact: true })
          .click()
        const form = page.locator('.erp-business-action-form:visible')
        await form.waitFor()
        const input = form.getByLabel('收付款单号', { exact: true })
        const originalStyle = await input.getAttribute('style')
        const originalHeight = await input.evaluate((node) => node.offsetHeight)
        await assertVisibleBusinessFormControlHeight(page, 'css-token-original')
        try {
          await input.evaluate((node) =>
            node.style.setProperty(
              'height',
              'calc(var(--erp-control-height) + 4px)',
              'important'
            )
          )
          await page.waitForFunction(
            ({ id, height }) => document.getElementById(id)?.offsetHeight === height,
            { id: await input.getAttribute('id'), height: originalHeight + 4 }
          )
          await assert.rejects(
            () =>
              assertVisibleBusinessFormControlHeight(
                page,
                'css-token-negative-control'
              ),
            /业务表单单行输入控件高度未统一/u,
            'the resolved CSS token must still reject a real 4px mismatch'
          )
        } finally {
          await input.evaluate((node, style) => {
            if (style === null) node.removeAttribute('style')
            else node.setAttribute('style', style)
          }, originalStyle)
          await page.waitForFunction(
            ({ id, height }) => document.getElementById(id)?.offsetHeight === height,
            { id: await input.getAttribute('id'), height: originalHeight }
          )
        }
        await assertVisibleBusinessFormControlHeight(page, 'css-token-restored')
      },
    },
  ]
}
