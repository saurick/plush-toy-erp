import { clickTaskCardContent } from './taskCopyAssertions.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'

export function createProcessRuntimeClosureScenarios({
  assert,
  customerRuntimeEffectiveSession,
}) {
  return [
    ['desktop', 'succeeded', 'light'],
    ['desktop', 'rejected', 'light'],
    ['desktop', 'cancelled', 'light'],
    ['desktop', 'compensated', 'dark'],
    ['mobile', 'cancelled', 'light'],
    ['mobile', 'compensated', 'dark'],
  ].map(([surface, kind, themeMode]) => {
    const withdrawn = ['cancelled', 'compensated'].includes(kind)
    const compensated = kind === 'compensated'
    const role = compensated ? 'finance' : 'boss'
    const processID = 9510
    const taskName = compensated ? '核对收付款执行交接' : '核对订单审批结果'
    const sourceType = compensated ? 'finance_payment' : 'sales_order'
    const sourceNo = compensated ? 'PAY-L1-501' : 'SO-L1-601'
    const reason = `本次${kind === 'cancelled' ? '来源取消' : compensated ? '补偿终止' : kind === 'rejected' ? '审批退回' : '正常结束'}已记录。${'核对原单及已记录的处理依据；'.repeat(16)}`
    const completedNode = {
      id: 9511,
      process_instance_id: processID,
      node_key: compensated ? 'approve_finance_payment' : 'submit_sales_order',
      node_type: 'domain_command',
      attempt: 1,
      version: 2,
      status: 'completed',
    }
    const linkedNode = {
      id: 9512,
      process_instance_id: processID,
      node_key: compensated ? 'finance_payment_execution' : 'order_approval',
      node_type: compensated ? 'human_task' : 'approval',
      attempt: 1,
      version: 2,
      status: withdrawn ? 'withdrawn' : 'completed',
      outcome: withdrawn
        ? 'source.cancelled_withdrawal'
        : kind === 'rejected'
          ? 'rejected'
          : 'approved',
    }
    const processContext = {
      source: { type: sourceType, id: 601, no: sourceNo },
      process_instance: {
        id: processID,
        process_key: compensated
          ? 'finance_payment_approval'
          : 'sales_order_acceptance',
        process_version: 'v1',
        status: 'completed',
        started_at: 1_800_000_000,
        completed_at: 1_800_000_100,
        resolution_kind: kind,
        resolution_reason: reason,
        resolved_at: 1_800_000_100,
      },
      nodes: [completedNode, linkedNode],
      linked_node: linkedNode,
      current_nodes: [],
      completed_nodes: withdrawn
        ? [completedNode]
        : [completedNode, linkedNode],
      current_responsibilities: [],
      approval_form: null,
    }
    const statusLabel = {
      succeeded: '正常结束',
      rejected: '已退回结束',
      cancelled: '已取消',
      compensated: '已补偿结束',
    }[kind]
    return {
      name: `workflow-process-closure-${surface}-${kind}`,
      path:
        surface === 'mobile'
          ? `/m/${role}/tasks`
          : '/erp/task-board?lane=finished',
      viewport:
        surface === 'mobile'
          ? { width: 390, height: 844 }
          : { width: 1440, height: 900 },
      auth: 'admin',
      themeMode,
      customerKey: 'yoyoosun',
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        configRevision: 'style-l1-process-closure',
        roles: [role],
        pages: ['task-board'],
        workPools: [role],
        actions: [
          'workflow.task.read',
          'mobile.boss.access',
          'mobile.finance.access',
        ],
        workflow_visible_owner_role_keys_by_capability: {
          'workflow.task.read': [role],
        },
      },
      adminProfile: {
        id: 1,
        username: 'style-l1-process-closure',
        is_super_admin: false,
        roles: [{ role_key: role, name: role === 'boss' ? '老板' : '财务' }],
        permissions: ['workflow.task.read', `mobile.${role}.access`],
        menus: [
          {
            key: 'task-board',
            label: '任务看板',
            path: '/erp/task-board',
            required_any: ['workflow.task.read'],
            required_all: [],
          },
        ],
      },
      workflowTaskFixtures: [
        {
          id: 9513,
          task_code: `STYLE-L1-PROCESS-CLOSURE-${kind}`,
          task_group: compensated
            ? 'finance_payment_execution'
            : 'order_approval',
          task_name: taskName,
          source_type: sourceType,
          source_id: 601,
          source_no: sourceNo,
          process_instance_id: processID,
          process_node_instance_id: linkedNode.id,
          task_status_key: withdrawn
            ? 'withdrawn'
            : kind === 'rejected'
              ? 'rejected'
              : 'done',
          owner_role_key: role,
          created_at: 1_800_000_000,
          completed_at: 1_800_000_100,
          version: 2,
          payload: {},
        },
      ],
      workflowProcessContextFixtures: [{ taskID: 9513, processContext }],
      verify: async (page) => {
        if (surface === 'mobile') {
          await page.getByText('已办', { exact: true }).click()
          const card = page
            .locator('.erp-mobile-list-item')
            .filter({ hasText: taskName })
          await clickTaskCardContent(
            card,
            card.getByText(taskName, { exact: true })
          )
        } else {
          await page
            .getByRole('button', { name: `查看${taskName}详情`, exact: true })
            .click()
        }
        const stage = page.getByTestId('workflow-process-stage')
        await stage.waitFor({ state: 'visible' })
        await waitForFiniteAnimations(page)
        if (surface === 'mobile') await stage.scrollIntoViewIfNeeded()
        const parent =
          surface === 'mobile'
            ? page.getByTestId('mobile-task-process-context')
            : page.locator('.erp-task-action-drawer')
        assert.match(await parent.innerText(), new RegExp(statusLabel, 'u'))
        assert.match(
          await stage.innerText(),
          new RegExp(`结束原因：${reason}`, 'u')
        )
        assert.equal(await stage.getAttribute('data-handoff-kind'), 'end')
        assert.equal(await stage.locator('[aria-current="step"]').count(), 0)
        assert.equal(
          await stage
            .locator('.workflow-process-stage__item--withdrawn')
            .count(),
          withdrawn ? 1 : 0
        )
        assert.equal(
          await stage
            .locator('.workflow-process-stage__item--completed')
            .count(),
          withdrawn || kind === 'rejected' ? 1 : 2
        )
        if (withdrawn) {
          assert.match(await stage.innerText(), /已撤回步骤 1/u)
          assert.equal(
            await stage
              .locator(
                '.workflow-process-stage__item--withdrawn .workflow-process-stage__marker'
              )
              .innerText(),
            '−'
          )
        }
        const geometry = await stage.evaluate((root) => {
          const handoff = root.querySelector('.workflow-process-stage__handoff')
          const summary = root.querySelector('.workflow-process-stage__summary')
          const list = root.querySelector('.workflow-process-stage__list')
          const marker = root.querySelector('.workflow-process-stage__marker')
          return {
            documentOverflow:
              document.documentElement.scrollWidth -
              document.documentElement.clientWidth,
            handoffOverflow: handoff.scrollWidth - handoff.clientWidth,
            stageRight: root.getBoundingClientRect().right,
            viewportWidth: window.innerWidth,
            summaryBeforeList:
              summary.getBoundingClientRect().bottom <=
              list.getBoundingClientRect().top + 1,
            handoffAfterList:
              handoff.getBoundingClientRect().top >=
              list.getBoundingClientRect().bottom - 1,
            markerWidth: marker.getBoundingClientRect().width,
            markerHeight: marker.getBoundingClientRect().height,
          }
        })
        assert(
          geometry.documentOverflow <= 1 &&
            geometry.handoffOverflow <= 1 &&
            geometry.stageRight <= geometry.viewportWidth + 1,
          JSON.stringify(geometry)
        )
        assert(
          geometry.summaryBeforeList && geometry.handoffAfterList,
          JSON.stringify(geometry)
        )
        assert(
          geometry.markerWidth > 0 && geometry.markerHeight > 0,
          JSON.stringify(geometry)
        )
        assert.equal(
          await parent
            .getByRole('button', { name: '处理任务', exact: true })
            .count(),
          0
        )
      },
    }
  })
}
