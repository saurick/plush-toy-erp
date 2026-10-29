import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement as h } from 'react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import {
  TASK_HANDLING_ROWS,
  buildTaskHandlingRows,
  taskHandlingActions,
  validateTaskHandlingSearch,
  patchTaskHandlingSearch,
} from '../config/devTaskHandling.mjs'
import { createReactTestHarness } from '../../../scripts/test/reactRuntime.mjs'
import { DEV_FLOW_STATE_CATALOG } from '../config/devFlowStateCatalog.mjs'

async function mount(t, url = '/__dev/task-handling') {
  const ui = await createReactTestHarness(t)
  const { default: Page } = await import('./DevTaskHandlingPage.jsx')
  const { ERPThemeProvider } = await import('../../common/theme/erpTheme.jsx')
  let location
  let navigate
  function Probe() {
    location = useLocation()
    navigate = useNavigate()
    return h(Page)
  }
  await ui.render(
    h(
      MemoryRouter,
      {
        initialEntries: [url],
        future: { v7_startTransition: true, v7_relativeSplatPath: true },
      },
      h(
        ERPThemeProvider,
        { browserStorageKey: 'task-handling-test-theme' },
        h(Probe)
      )
    )
  )
  const click = async (el) => {
    assert(el)
    await ui.act(() => el.click())
    await ui.flush()
  }
  const choose = async (label, option) => {
    const selector = ui.container
      .querySelector(`[aria-label="${label}"][role="combobox"]`)
      .closest('.ant-select')
    await ui.act(() =>
      selector
        .querySelector('.ant-select-selector')
        .dispatchEvent(
          new ui.runtimeWindow.MouseEvent('mousedown', { bubbles: true })
        )
    )
    await ui.flush()
    const options = [
      ...document.querySelectorAll(
        '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option'
      ),
    ]
    assert(
      !options.some((el) => /^(全部|不限)/u.test(el.textContent)),
      '不应提供伪筛选选项'
    )
    await click(options.find((el) => el.textContent === option))
  }
  const clear = async (label) => {
    const control = ui.container
      .querySelector(`[aria-label="${label}"][role="combobox"]`)
      .closest('.ant-select')
      .querySelector('.ant-select-clear')
    assert(control)
    await ui.act(() =>
      control.dispatchEvent(
        new ui.runtimeWindow.MouseEvent('mousedown', { bubbles: true })
      )
    )
    await ui.flush()
  }
  const button = (text) =>
    [...ui.container.querySelectorAll('button')].find(
      (el) => el.textContent.replace(/\s/gu, '') === text.replace(/\s/gu, '')
    )
  const go = (value) => ui.act(() => navigate(value))
  return {
    ...ui,
    click,
    choose,
    clear,
    button,
    go,
    params: () => new URLSearchParams(location.search),
  }
}

test('任务办理直接显示清单，筛选清空和历史导航恢复时保留页头', async (t) => {
  const v = await mount(t)
  const header = v.container.querySelector('.erp-dev-task-handling__header')
  assert.equal(v.container.querySelector('[role="tab"]'), null)
  assert.doesNotMatch(v.container.textContent, /场景原型|演练任务|重置演练/u)
  await v.choose('办理岗位', '业务')
  assert.equal(v.params().get('role'), 'sales')
  assert.equal(v.container.querySelector('[role="alert"]'), null)
  await v.choose('办理类型', '单据与明细编辑')
  await v.choose('手机支持', '仅查看')
  assert.equal(v.container.querySelector('[role="alert"]'), null)
  await v.clear('手机支持')
  assert.equal(v.params().has('mobile'), false)
  await v.go(-1)
  await v.flush()
  assert.equal(v.params().get('mobile'), 'desktop')
  await v.go(1)
  await v.flush()
  assert.equal(v.params().has('mobile'), false)
  assert.equal(
    v.container.querySelector('.erp-dev-task-handling__header'),
    header
  )
  await v.click(v.button('重置'))
  assert.equal(v.params().has('role'), false)
  assert.equal(v.params().has('kind'), false)
  assert.equal(
    v.container.querySelectorAll('.ant-table-row').length,
    TASK_HANDLING_ROWS.length
  )
})

test('有筛选的独立深链直接打开，动作清空不回选且保留环节', async (t) => {
  const v = await mount(
    t,
    '/__dev/task-handling?role=production&kind=authoring&mobile=desktop'
  )
  assert.equal(v.container.querySelector('[role="alert"]'), null)
  await v.click(v.container.querySelector('[data-row-key="sewing_execute"] button'))
  assert.equal(v.params().get('stage'), 'sewing_execute')
  await v.clear('关联动作')
  assert.equal(v.params().get('action'), '')
  assert.equal(v.container.querySelector('[data-relation-action]'), null)
  assert(v.container.querySelector('[aria-label="关联动作"]'))
  await v.go(`/__dev/task-handling?${v.params()}`)
  await v.flush()
  assert.equal(v.container.querySelector('[data-relation-action]'), null)
})

test('非法、重复和跨环节动作参数停止显示，清空不是字符串 undefined', () => {
  for (const query of [
    'role=no-such-role',
    'role=sales&role=finance',
    'surprise=1',
    'stage=engineering_data&action=wrong',
    'tab=preview',
    'tab=matrix',
    'scene=bom',
    'identity=handler',
    'condition=ready',
    'device=mobile',
  ]) {
    assert(
      validateTaskHandlingSearch(
        new URLSearchParams(query),
        DEV_FLOW_STATE_CATALOG
      )
    )
  }
  const params = patchTaskHandlingSearch(
    new URLSearchParams('role=sales&action=selected'),
    { role: undefined, action: '' }
  )
  assert.equal(params.has('role'), false)
  assert.equal(params.get('action'), '')
  assert.equal(params.toString().includes('undefined'), false)
})

test('审核清单展示具体事项及办理岗位，岗位和类型组合筛选可刷新恢复', async (t) => {
  const v = await mount(t, '/__dev/task-handling?kind=decision')
  assert.match(v.container.textContent, /办理岗位/)
  for (const label of [
    '订单审批',
    '订单评审',
    '采购订单审批',
    '出货财务审批',
    '收付款审批',
    '人工库存调整审批',
    '老板审核用料',
    '另一位财务复核',
  ]) {
    assert(v.button(label), label)
  }
  for (const [role, label] of [
    ['PMC', '订单评审'],
    ['财务', '出货财务审批'],
    ['老板', '订单审批'],
  ]) {
    await v.choose('办理岗位', role)
    const dataRows = [...v.container.querySelectorAll('.ant-table-row')]
    assert(dataRows.length > 0)
    assert(
      dataRows.every(
        (row) =>
          row.querySelector('[data-col="roles"]')?.textContent.startsWith(role) ||
          row.children[1]?.textContent.startsWith(role)
      )
    )
    assert(v.button(label))
    await v.go(`/__dev/task-handling?${v.params()}`)
    await v.flush()
    assert.equal(v.container.querySelector('[role="alert"]'), null)
    assert(v.button(label))
  }
  await v.clear('办理岗位')
  assert.equal(v.params().has('role'), false)
  assert.equal(v.params().get('kind'), 'decision')
  assert(v.button('订单评审'))
})

test('审批事项和默认岗位来自正式节点，流程变体去重且不能遗漏固定两级用料审核', () => {
  for (const definition of DEV_FLOW_STATE_CATALOG.processDefinitions) {
    for (const node of definition.nodes.filter(
      (item) => item.type === 'approval'
    )) {
      const rows = TASK_HANDLING_ROWS.filter((row) =>
        row.processRefs?.some(
          (ref) =>
            ref.definition.key === definition.key && ref.node.key === node.key
        )
      )
      assert(rows.length > 0, `${definition.key}/${node.key}`)
      assert(
        rows.every((row) => row.kind === 'decision' && row.mobile === 'full')
      )
    }
  }
  assert.equal(
    TASK_HANDLING_ROWS.filter(
      (row) => row.key === 'process/sales_order_acceptance/order_approval'
    ).length,
    1
  )
  for (const substep of ['boss_review', 'finance_review']) {
    const key = `source/sales_order/${substep}`
    const row = TASK_HANDLING_ROWS.find((item) => item.key === key)
    assert.equal(row.kind, 'decision')
    assert.equal(taskHandlingActions(DEV_FLOW_STATE_CATALOG, key).length, 2)
  }
  const changed = {
    ...DEV_FLOW_STATE_CATALOG,
    processDefinitions: DEV_FLOW_STATE_CATALOG.processDefinitions.map(
      (definition) => ({
        ...definition,
        nodes: definition.nodes.map((node) =>
          node.key === 'order_approval'
            ? { ...node, ownerPool: 'finance' }
            : node
        ),
      })
    ),
  }
  const row = buildTaskHandlingRows(changed).find(
    (item) => item.key === 'process/sales_order_acceptance/order_approval'
  )
  assert.deepEqual(
    row.roleKeys,
    ['finance'],
    '读取节点责任，不能按订单审批名称写死老板'
  )
})

test('PMC 评审展开只显示本节点责任、权限和真实后继，刷新保留节点', async (t) => {
  const v = await mount(t, '/__dev/task-handling?kind=decision&role=pmc')
  await v.click(v.button('订单评审'))
  const facts = v.container.querySelector('[aria-label="当前任务节点"]')
  assert(facts)
  assert.match(facts.textContent, /PMC/)
  assert.match(facts.textContent, /完成.*任务/)
  assert.doesNotMatch(facts.textContent, /老板|生效销售订单/)
  assert.equal(v.container.querySelector('[data-relation-action]'), null)
  assert.deepEqual(
    taskHandlingActions(
      DEV_FLOW_STATE_CATALOG,
      'process/sales_order_acceptance/order_review'
    ),
    []
  )
  await v.go(`/__dev/task-handling?${v.params()}`)
  await v.flush()
  assert(v.container.querySelector('[aria-label="当前任务节点"]'))
})

test('同一生产异常审批合并一项并保留适用工序，不按显示名称合并不同节点', () => {
  const rows = TASK_HANDLING_ROWS.filter(
    (row) => row.label === '生产异常决策审批'
  )
  assert.equal(rows.length, 1)
  const [row] = rows
  assert.deepEqual(row.roleKeys, ['boss'])
  assert.equal(row.group, '适用：裁片、车缝、手工')
  assert.equal(
    row.key,
    'process/production_exception_approval/production_exception_decision_approval'
  )
  assert.equal(
    validateTaskHandlingSearch(
      new URLSearchParams({ kind: 'decision', role: 'boss', stage: row.key }),
      DEV_FLOW_STATE_CATALOG
    ),
    ''
  )
  const changed = {
    ...DEV_FLOW_STATE_CATALOG,
    processDefinitions: DEV_FLOW_STATE_CATALOG.processDefinitions.map(
      (definition) => ({
        ...definition,
        nodes: definition.nodes.map((node) =>
          node.key === 'purchase_order_approval'
            ? { ...node, label: row.label }
            : node
        ),
      })
    ),
  }
  const sameLabel = buildTaskHandlingRows(changed).filter(
    (item) => item.label === row.label
  )
  assert.equal(sameLabel.length, 2)
  assert.equal(new Set(sameLabel.map((item) => item.key)).size, 2)
})

test('合并后的异常审批可展开与刷新，岗位筛选保留适用范围', async (t) => {
  const v = await mount(t, '/__dev/task-handling?kind=decision&role=boss')
  assert.equal(
    [...v.container.querySelectorAll('button')].filter(
      (button) => button.textContent === '生产异常决策审批'
    ).length,
    1
  )
  await v.click(v.button('生产异常决策审批'))
  assert.match(v.container.textContent, /适用：裁片、车缝、手工/)
  assert(v.container.querySelector('[aria-label="当前任务节点"]'))
  await v.go(`/__dev/task-handling?${v.params()}`)
  await v.flush()
  assert.equal(v.container.querySelector('[role="alert"]'), null)
  assert(v.container.querySelector('[aria-label="当前任务节点"]'))
})

test('已移除的演示参数提供明确恢复入口，重新选择后直接显示清单', async (t) => {
  const v = await mount(
    t,
    '/__dev/task-handling?tab=preview&scene=bom&identity=handler&condition=ready'
  )
  assert(v.container.querySelector('[role="alert"]'))
  await v.click(v.button('重新选择'))
  assert.equal(v.params().toString(), '')
  assert.equal(v.container.querySelector('[role="alert"]'), null)
  assert.equal(v.container.querySelector('[role="tab"]'), null)
  assert.equal(
    v.container.querySelectorAll('.ant-table-row').length,
    TASK_HANDLING_ROWS.length
  )
})
