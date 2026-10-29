import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement as h } from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { TASK_HANDLING_ROWS } from '../../config/devTaskHandling.mjs'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'
import { DEV_FLOW_STATE_CATALOG } from '../../config/devFlowStateCatalog.mjs'

async function mount(t) {
  const ui = await createReactTestHarness(t)
  const { default: Component } = await import('./TaskHandlingMatrix.jsx')
  let location
  function Probe() {
    location = useLocation()
    return h(Component, { businessCatalog: DEV_FLOW_STATE_CATALOG })
  }
  await ui.render(
    h(
      MemoryRouter,
      {
        initialEntries: ['/__dev/task-handling'],
        future: { v7_startTransition: true, v7_relativeSplatPath: true },
      },
      h(Probe)
    )
  )
  const root = ui.container
  const click = async (el) => {
    assert(el)
    await ui.act(() => el.click())
    await ui.flush()
  }
  const button = (label) =>
    [...root.querySelectorAll('button')].find(
      (el) => el.textContent.replace(/\s/gu, '') === label.replace(/\s/gu, '')
    )
  const choose = async (label, text) => {
    const control = root
      .querySelector(`[aria-label="${label}"][role="combobox"]`)
      .closest('.ant-select')
    await ui.act(() =>
      control
        .querySelector('.ant-select-selector')
        .dispatchEvent(
          new ui.runtimeWindow.MouseEvent('mousedown', { bubbles: true })
        )
    )
    await ui.flush()
    const option = [
      ...document.querySelectorAll('.ant-select-item-option'),
    ].find((el) => el.textContent === text)
    assert(option, text)
    await click(option)
  }
  return {
    ui,
    root,
    click,
    button,
    choose,
    params: () => new URLSearchParams(location.search),
  }
}

test('矩阵筛选及重置保留工作台入口，展开后选择动作不会关闭详情', async (t) => {
  const v = await mount(t)
  assert.match(
    v.root.querySelector('[role="status"]').textContent,
    new RegExp(`${TASK_HANDLING_ROWS.length}.*${TASK_HANDLING_ROWS.length}`)
  )
  await v.choose('办理类型', '单据与明细编辑')
  assert.equal(v.params().get('kind'), 'authoring')
  assert(v.root.querySelectorAll('.ant-table-row').length < 53)
  await v.click(v.button('工程资料与 BOM'))
  assert.equal(v.params().get('stage'), 'engineering_data')
  const actions = v.root.querySelector(
    '[aria-label="关联动作"][role="combobox"]'
  )
  assert(actions)
  await v.ui.act(() =>
    actions
      .closest('.ant-select')
      .querySelector('.ant-select-selector')
      .dispatchEvent(
        new v.ui.runtimeWindow.MouseEvent('mousedown', { bubbles: true })
      )
  )
  await v.ui.flush()
  const options = [
    ...document.querySelectorAll(
      '.ant-select-dropdown:not(.ant-select-dropdown-hidden) .ant-select-item-option'
    ),
  ]
  await v.click(options.at(-1))
  assert.equal(v.params().get('stage'), 'engineering_data')
  assert(v.params().has('action'))
  assert(v.root.querySelector('[data-relation-action]'))
  await v.click(v.button('重置'))
  assert.equal(v.params().has('tab'), false)
  assert.equal(v.params().has('kind'), false)
  assert.equal(v.params().has('action'), false)
  assert.equal(
    v.root.querySelectorAll('.ant-table-row').length,
    TASK_HANDLING_ROWS.length
  )
})

test('工程筛选直接说明编制、自动送审与审批交接，不出现订单审批或其他岗位动作', async (t) => {
  const v = await mount(t)
  await v.choose('办理岗位', '工程')
  const rows = [...v.root.querySelectorAll('.ant-table-row')]
  assert.equal(rows.length, 2)
  assert.match(v.root.textContent, /本次办理.*审批与交接/u)
  assert(rows.every((row) => row.children[1]?.textContent === '工程'))
  assert.match(rows.find((row) => row.textContent.includes('工程资料修订与自动送审')).textContent,
    /修改原工程资料并保存.*自动送审.*退回后继续修订原资料.*老板审核.*另一位财务复核/u)
  assert.equal(v.button('销售订单编制与提交'), undefined)
  assert.equal(v.button('老板审核用料'), undefined)
  await v.click(v.button('工程资料与 BOM'))
  assert.match(v.root.querySelector('[data-relation-action]').textContent, /工程/)
  assert.doesNotMatch(v.root.querySelector('[data-relation-action]').textContent, /老板|财务/u)
})

test('岗位切换核对九岗位完整集合，清空后恢复固定执行和按任务分派事项', async (t) => {
  const v = await mount(t)
  for (const [key, label] of [
    ['sales', '业务'], ['engineering', '工程'], ['purchase', '采购'],
    ['warehouse', '仓库'], ['quality', '品质'], ['production', '生产经理'],
    ['finance', '财务'], ['pmc', 'PMC'], ['boss', '老板'],
  ]) {
    await v.choose('办理岗位', label)
    const keys = [...v.root.querySelectorAll('.ant-table-row')].map((row) => row.getAttribute('data-row-key'))
    assert.deepEqual(keys, TASK_HANDLING_ROWS.filter((row) => row.roleKeys.includes(key)).map((row) => row.key))
    assert(keys.length > 0, label)
    assert.equal(v.params().has('stage'), false)
  }
  await v.click(v.button('重置'))
  assert(v.button('收付款执行'))
  assert(v.button('人工库存调整执行'))
  assert.match(v.root.textContent, /按任务分派/)
})

test('任务协作只说明后端条件，审批动作明确属于对应办理事项', async (t) => {
  const v = await mount(t)
  const conditions = v.root.querySelector('[aria-label="通用任务协作条件"]')
  assert.deepEqual([...conditions.querySelectorAll('dt')].map((node) => node.textContent), ['标记任务受阻', '解除任务阻塞', '转交任务', '催办任务'])
  assert.equal(conditions.querySelector('button'), null, 'the workbench never grants live task operations')
  assert.match(conditions.textContent, /任务处于受阻状态.*后端允许改派.*不能代为办理/su)
  const approval = v.root.querySelector('[data-row-key="process/sales_order_acceptance/order_approval"]')
  assert.match(approval.textContent, /审批通过 \/ 审批退回/u)
  assert.doesNotMatch(approval.textContent, /标记任务受阻/u)
  const material = v.root.querySelector('[data-row-key="source/sales_order/finance_review"]')
  assert.match(material.textContent, /批准并生成采购订单 \/ 确认退回工程/u)
})
