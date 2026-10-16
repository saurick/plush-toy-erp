import { act, createElement } from 'react'
import assert from 'node:assert/strict'
import test from 'node:test'
import { businessFormHarness } from '../../../../scripts/test/businessFormHarness.mjs'

async function setup(t, props = {}) {
  const ui = await businessFormHarness(t)
  const [{ Form }, components] = await Promise.all([
    import('antd'),
    import('./QualityInspectionForms.jsx'),
  ])
  let form
  function DecisionForm() {
    [form] = Form.useForm()
    return createElement(components.QualityInspectionDecisionForm, { form, mode: 'pass', ...props })
  }
  return {
    ...ui,
    ...components,
    props,
    values: () => form.getFieldsValue(true),
    async validate() {
      let result
      let error
      await act(async () => {
        try { result = await form.validateFields() } catch (failure) { error = failure }
      })
      return { result, error }
    },
    radio(value) { return document.querySelector(`input[type="radio"][value="${value}"]`) },
    render: () => ui.render(createElement(DecisionForm)),
  }
}

test('quality decision validates the actual form and clears custom defect percentages when switching presets', async (t) => {
  const ui = await setup(t)
  await ui.render()
  const empty = await ui.validate()
  assert.deepEqual(empty.error.errorFields.map(({ name }) => name[0]).sort(), ['defect_rate_selection', 'result'])
  await ui.select('判定结果', '合格')
  await ui.click(ui.radio('CUSTOM'))
  await ui.fill(document.querySelector('input[aria-label="自定义不良比例"]'), '100.01')
  assert.match(JSON.stringify((await ui.validate()).error.errorFields), /0% 到 100%/u)
  await ui.fill(document.querySelector('input[aria-label="自定义不良比例"]'), '12.345')
  assert.match(JSON.stringify((await ui.validate()).error.errorFields), /最多保留两位小数/u)
  await ui.fill(document.querySelector('input[aria-label="自定义不良比例"]'), '12.30')
  const valid = await ui.validate()
  assert.equal(valid.error, undefined)
  assert.deepEqual(ui.buildDecisionParams(7, valid.result), { id: 7, result: 'PASS', defect_rate_operator: 'APPROX', defect_rate_percent: '12.3' })
  await ui.click(ui.radio('GT:50'))
  assert.equal(ui.values().defect_rate_custom_percent, undefined)
  assert.equal(document.querySelector('input[aria-label="自定义不良比例"]'), null)
  const preset = await ui.validate()
  assert.deepEqual(ui.buildDecisionParams(7, preset.result), { id: 7, result: 'PASS', defect_rate_operator: 'GT', defect_rate_percent: '50' })
  await ui.click(ui.radio('CUSTOM'))
  assert.equal(document.querySelector('input[aria-label="自定义不良比例"]').value, '')
  assert.ok((await ui.validate()).error)
})

test('strict quality decisions do not offer concession and cancellation does not require decision evidence', async (t) => {
  const props = { allowConcession: false }
  const ui = await setup(t, props)
  await ui.render()
  assert.deepEqual((await ui.options('判定结果')).map((node) => node.textContent), ['合格'])
  await ui.select('判定结果', '合格')
  await ui.click(ui.radio('APPROX:0'))
  assert.equal((await ui.validate()).error, undefined)
  props.mode = 'cancel'
  await ui.render()
  assert.equal(document.querySelector('input[type="radio"]'), null)
  assert.doesNotMatch(document.body.textContent, /检验日期|判定结果/u)
  await ui.fill('判定备注', '来源单据已取消')
  const cancelled = await ui.validate()
  assert.equal(cancelled.error, undefined)
  assert.deepEqual(ui.buildDecisionParams(7, cancelled.result), { id: 7, decision_note: '来源单据已取消' })
})

test('incoming checks retain unchecked status until the operator records evidence and support removing draft rows', async (t) => {
  const ui = await setup(t, { incoming: true })
  await ui.render()
  await ui.click(ui.button('添加检查项'))
  assert.equal(ui.values().check_items[0].result, 'NOT_CHECKED')
  await ui.fill('检查项目 1', '外观')
  await ui.fill('要求 / 依据', '与确认样一致')
  await ui.select('检查结果', '异常')
  await ui.fill('实际情况', '缝线开口')
  await ui.select('检查范围', '抽检')
  await ui.fill('说明 / 抽检范围', '抽检 10 件')
  await ui.select('判定结果', '让步接收')
  await ui.fill('判定备注', '按经办确认保留整改记录')
  await ui.click(ui.radio('APPROX:10'))
  const accepted = await ui.validate()
  assert.equal(accepted.error, undefined)
  const params = ui.buildDecisionParams(7, accepted.result)
  assert.equal(params.result, 'CONCESSION')
  assert.deepEqual(params.check_items, [{ name: '外观', result: 'FAIL', requirement: '与确认样一致', observation: '缝线开口', scope: 'SAMPLE', note: '抽检 10 件' }])
  await ui.click(document.querySelector('button[aria-label="移除此检查项 1"]'))
  assert.deepEqual(ui.values().check_items, [])
})

test('quality creation submits only authoritative purchase source identifiers and a note', async (t) => {
  const ui = await setup(t)
  const values = {
    inspection_no: ' QI-7 ',
purchase_receipt_id: '8',
purchase_receipt_item_id: '9',
decision_note: ' 需要复核 ',
    inventory_lot_id: 999,
material_id: 999,
warehouse_id: 999,
source_type: 'manual',
source_id: 999,
    inspector_id: 999,
defect_rate_selection: 'APPROX:0',
  }
  assert.deepEqual(ui.buildInspectionParams(values), { inspection_no: 'QI-7', purchase_receipt_id: 8, purchase_receipt_item_id: 9, decision_note: '需要复核' })
  assert.deepEqual(ui.buildInspectionParams({ inspection_no: '  ', purchase_receipt_id: undefined, purchase_receipt_item_id: 0, decision_note: null }), {})
  assert.equal(values.inventory_lot_id, 999)
})
