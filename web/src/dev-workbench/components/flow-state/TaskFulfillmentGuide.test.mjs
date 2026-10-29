import assert from 'node:assert/strict'
import test from 'node:test'
import { createElement as h } from 'react'
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom'
import { createReactTestHarness } from '../../../../scripts/test/reactRuntime.mjs'
import { WorkflowTaskDiscoveryCatalog as catalog } from '../../../common/consts/workflowTaskDiscovery.generated.mjs'

async function mount(t, url = '/__dev/status-flows?view=chain&chain=all', props = {}) {
  const harness = await createReactTestHarness(t)
  const { default: Guide } = await import('./TaskFulfillmentGuide.jsx')
  const navigation = {}
  function Probe() { Object.assign(navigation, { location: useLocation(), navigate: useNavigate() }); return h(Guide, { showViewSwitch: true, ...props }) }
  await harness.render(h(MemoryRouter, { initialEntries: [url], future: { v7_startTransition: true, v7_relativeSplatPath: true } }, h(Probe)))
  const root = harness.container
  const click = async (selector) => { const el = typeof selector === 'string' ? root.querySelector(selector) : selector; assert(el, selector); await harness.act(() => { el.focus(); el.click() }); await harness.flush() }
  const choose = async (name, label) => {
    const control = root.querySelector(`[aria-label="${name}"][role="combobox"]`).closest('.ant-select')
    await harness.act(() => control.querySelector('.ant-select-selector').dispatchEvent(new harness.runtimeWindow.MouseEvent('mousedown', { bubbles: true })))
    await harness.flush()
    const option = [...harness.runtimeWindow.document.querySelectorAll('.ant-select-item-option')].find((item) => item.textContent === label)
    assert(option, label)
    await harness.act(() => option.click())
    await harness.flush()
  }
  return { harness, root, navigation, click, choose, params: () => new URLSearchParams(navigation.location.search) }
}

test('总图只展示已登记的专项分支，普通受阻说明不生成异常按钮', async (t) => {
  const { root, click, params } = await mount(t)
  assert.equal(root.querySelectorAll('[data-chain-stage]').length, 17)
  assert.equal(root.querySelectorAll('[data-stage-exception]').length, catalog.fulfillment_flow.reduce((sum, step) => sum + step.handling.guides.length, 0))
  for (const step of catalog.fulfillment_flow) {
    const branches = [...root.querySelectorAll(`[data-stage-exception="${step.stage}"]`)]
    assert.deepEqual(branches.map((item) => item.dataset.stageGuide), step.handling.guides)
    assert(branches.every((item) => item.textContent !== '异常'))
  }
  await click('[data-chain-stage="handwork_execute"] [data-stage-card]')
  assert(root.querySelector('[data-stage-normal="handwork_execute"] [data-business-flow]'))
  assert.equal(params().get('flow_stage'), 'handwork_execute')
  assert.equal(root.querySelector('[aria-label="环节办理方式"]'), null)
  await click('[data-stage-exception="cutting_quality"]')
  assert.equal(params().get('flow_exception_origin'), 'cutting_quality')
  assert.equal(params().has('flow_decision'), false)
  assert(root.querySelector('[data-exception-guide="production_quality"] [data-business-flow]'))
  await click('[aria-label="返回 9 · 裁片颜色 / 尺寸检验"]')
  assert.equal(params().has('flow_exception'), false)
  assert(root.querySelector('[data-stage-normal="cutting_quality"] [data-business-flow]'))
  assert.equal(root.ownerDocument.activeElement, root.querySelector('[data-stage-exception="cutting_quality"]'))
})

test('两个独立异常均可返回原首付流程及子步骤，关联任务和单据不串入原环节', async (t) => {
  const explored = []
  const { root, click, params } = await mount(t, '/__dev/status-flows?view=chain&chain=all&flow_stage=supplier_advance&flow_substep=actual', {
    onExploreStage: (key) => explored.push(key),
  })
  const open = (label) => click([...root.querySelectorAll('.erp-dev-chain__independent button')].find((button) => button.textContent === label))
  for (const [key, label] of [['outsourcing_rejection', '委外产品回货拒收'], ['over_issue', '生产超领材料']]) {
    await open(label)
    assert(root.querySelector(`[data-exception-guide="${key}"] [data-business-flow]`))
    assert.equal(params().get('flow_stage'), 'supplier_advance')
    assert.equal(params().get('flow_substep'), 'actual')
    assert.equal(params().has('flow_exception_origin'), false, '返回位置不是独立异常的业务来源')
    assert.equal(root.querySelector('[aria-label="相关任务"] a[href$="stage_key=payment"]'), null)
    assert.equal(root.querySelector('.erp-dev-fulfillment-guide__detail-actions'), null)
    assert.deepEqual(explored, [])
    await click('[aria-label="返回 4 · 采购 / 委外首付"]')
    assert(root.querySelector('[data-stage-normal="supplier_advance"] [data-business-flow]'))
    assert.equal(root.querySelector('[data-selected-substep]').dataset.selectedSubstep, 'actual')
    assert.equal(params().has('flow_exception'), false)
    assert.equal(root.ownerDocument.activeElement.textContent, label)
  }
  await open('委外产品回货拒收')
  await open('生产超领材料')
  await click('[aria-label="返回 4 · 采购 / 委外首付"]')
  assert.equal(root.querySelector('[data-selected-substep]').dataset.selectedSubstep, 'actual')
})

test('异常链接刷新后仍可返回，改选主环节清理旧异常与子步骤', async (t) => {
  const { root, click, params } = await mount(t, '/__dev/status-flows?view=chain&chain=all&flow_stage=supplier_advance&flow_substep=actual&flow_exception=over_issue&flow_exception_step=approval')
  await click('[aria-label="返回 4 · 采购 / 委外首付"]')
  assert.equal(root.querySelector('[data-selected-substep]').dataset.selectedSubstep, 'actual')
  assert.equal(params().has('flow_exception_step'), false)
  await click('[data-stage-exception="cutting_quality"]')
  assert.equal(params().get('flow_stage'), 'cutting_quality')
  assert.equal(params().has('flow_substep'), false)
  await click('[data-chain-stage="supplier_advance"] [data-stage-card]')
  assert(root.querySelector('[data-stage-normal="supplier_advance"]'))
  assert.equal(params().has('flow_exception'), false)
  assert.equal(params().has('flow_exception_origin'), false)
})

test('未选主环节的独立异常关闭详情，不补造返回位置', async (t) => {
  const { root, click, params } = await mount(t)
  await click([...root.querySelectorAll('.erp-dev-chain__independent button')].find((button) => button.textContent === '生产超领材料'))
  assert.equal(params().has('flow_stage'), false)
  assert.equal(root.querySelector('button[aria-label^="返回 "]'), null)
  await click('[aria-label="收起详情"]')
  assert.equal(root.querySelector('[aria-label="流程详情"]'), null)
})

test('专题内异常保留原环节与返回，同页不附加跨页操作', async (t) => {
  const explored = []
  const { root, click } = await mount(t, '/__dev/status-flows?flow_stage=cutting_quality&flow_exception=production_quality&flow_exception_origin=cutting_quality', {
    scoped: true,
    steps: [{ ...catalog.fulfillment_flow.find((step) => step.stage === 'cutting_quality'), nodeKey: 'quality_source' }],
    onExploreNode: (key) => explored.push(key),
  })
  assert.equal(root.querySelector('.erp-dev-fulfillment-guide__detail-actions'), null)
  assert.deepEqual(explored, [])
  await click('[aria-label="返回 1 · 裁片颜色 / 尺寸检验"]')
  assert(root.querySelector('[data-stage-normal="cutting_quality"]'))
})

test('固定导航保持挂载，异常目录只保留正式类型且不猜测发生环节', async (t) => {
  const { root, click, choose, params } = await mount(t)
  const tabs = root.querySelector('[aria-label="流程视图"]')
  await click(tabs.querySelectorAll('input')[1])
  assert.equal(root.querySelector('[aria-label="流程视图"]'), tabs)
  assert(root.querySelector('[aria-label="异常类型"]'))
  assert.equal(root.querySelectorAll('[data-handling-entry]').length, 0)
  await choose('异常类型', '裁片、皮套与成品不合格')
  assert.equal(params().has('flow_exception_origin'), false)
  assert.equal(params().has('flow_stage'), false)
  await choose('异常类型', '生产超领材料')
  assert.equal(root.querySelector('[aria-label="发生环节"]'), null, '独立业务不显示空的发生环节选择器')
  assert(root.querySelector('[data-exception-guide]').textContent.includes('独立业务'))
  await click(tabs.querySelectorAll('input')[0])
  assert.equal(root.querySelector('[aria-label="流程视图"]'), tabs)
  assert.equal(params().has('flow_exception'), false)
  assert(root.querySelector('[data-fulfillment-chain]'))
  assert(!root.textContent.includes('返回完整流程'))
})

test('方案及选中节点随链接恢复，非法来源显式失败', async (t) => {
  const { root, navigation, harness } = await mount(t, '/__dev/status-flows?flow_tab=exceptions&flow_exception=production_quality&flow_exception_origin=shell_quality&flow_decision=remake&flow_exception_step=end:original')
  assert.equal(root.querySelector('[data-selected-exception-node]').dataset.selectedExceptionNode, 'end:original')
  assert(root.querySelector('[data-exception-plan="remake"] [data-business-flow]'))
  await harness.act(() => navigation.navigate('/__dev/status-flows?flow_exception=production_quality&flow_exception_origin=sales_order'))
  assert(root.querySelector('[role="alert"]').textContent.includes('不适用'))
  assert.equal(root.querySelector('[data-exception-handling]'), null)
})
