import assert from 'node:assert/strict'
import test from 'node:test'
import React, { createElement } from 'react'
import { businessFormHarness } from '../../../../scripts/test/businessFormHarness.mjs'

test('完整筛选组件自行提供标题，空日期类型、显式标签、布局和禁用不会丢失', async (t) => {
  const harness = await businessFormHarness(t)
  const [{ BusinessOperationPanel, SelectFilter }, { default: MobileFilterChoices }, { DateRangeFilter }, { default: FilterSelect }] = await Promise.all([
    import('./BusinessListLayout.jsx'),
    import('../../mobile/components/MobileFilterChoices.jsx'),
    import('./BusinessDateInputs.jsx'),
    import('../../../common/components/select/FilterSelect.jsx'),
  ])
  const options = [{ value: 'first', label: '第一项' }, { value: 'second', label: '第二项' }]
  const changes = []
  const controls = [
    createElement(MobileFilterChoices, { label: '手机范围', options, value: 'first', onChange: (value) => changes.push(value) }),
    createElement(DateRangeFilter, { startValue: '', endValue: '', onRangeChange() {} }),
    createElement(FilterSelect, { label: '处理人', labelPlacement: 'stacked', 'aria-label': '查找处理人', options, value: 'first', className: 'owner-layout', disabled: true }),
    createElement(BusinessOperationPanel, { filtersOpen: true, filters: createElement(SelectFilter, { label: '业务结果', 'aria-label': '内部查询结果', id: 'result-filter', style: { width: 320 }, className: 'result-layout', value: 'first', options, disabled: true }) }),
  ]
  await harness.render(createElement(React.Fragment, null, ...controls))
  const legends = [...document.querySelectorAll('.erp-filter-field > legend')].map((node) => node.textContent)
  assert.deepEqual(legends, ['手机范围', '日期范围', '处理人', '业务结果'])
  const owner = document.querySelector('.owner-layout')
  assert.equal(owner.querySelector('[role="combobox"]').getAttribute('aria-label'), '查找处理人')
  assert.equal(Boolean(owner.querySelector('.app-select__label')), false, '独立标题和输入内前缀不重复')
  const result = document.querySelector('#result-filter')
  assert.equal(result.classList.contains('result-layout'), true)
  assert.equal(result.style.width, '320px')
  assert.equal([...result.querySelectorAll('button')].every((node) => node.disabled), true)
  const mobileGroup = document.querySelector('[role="group"][aria-label="手机范围"]')
  await harness.click([...mobileGroup.querySelectorAll('button')][1])
  assert.deepEqual(changes, ['second'])
})

test('快捷状态显示独立选中反馈，再次选择仅取消该项；加载与指定记录范围保持禁用', async (t) => {
  const harness = await businessFormHarness(t)
  const { default: BusinessStatusFilter } = await import('./BusinessStatusFilter.jsx')
  const selected = []
  const props = { options: [{ value: '', label: '全部' }, { value: 'draft', label: '草稿' }], counts: { draft: 3 }, onChange: (next) => selected.push(next) }
  await harness.render(createElement(BusinessStatusFilter, { ...props, value: 'draft' }))
  const draft = () => document.querySelector('button[aria-label="草稿，共 3 条"]')
  assert.equal(draft().getAttribute('aria-pressed'), 'true')
  assert.ok(draft().querySelector('.erp-filter-chip__clear'))
  await harness.click(draft())
  assert.deepEqual(selected, [''])
  await harness.render(createElement(BusinessStatusFilter, { ...props, value: '' }))
  assert.equal(draft().querySelector('.erp-filter-chip__clear'), null)
  await harness.click(draft())
  assert.deepEqual(selected, ['', 'draft'])
  for (const state of [{ loading: true }, { exact: true }, { disabled: true }]) {
    await harness.render(createElement(BusinessStatusFilter, { ...props, value: 'draft', ...state }))
    assert.ok([...document.querySelectorAll('button')].every((button) => button.disabled))
  }
})

test('快捷筛选保留显式计数口径、完整总数和未知值，失败禁用不表示仍在加载', async (t) => {
  const harness = await businessFormHarness(t)
  const { default: BusinessStatusFilter } = await import('./BusinessStatusFilter.jsx')
  const props = {
    options: [{ value: 'overdue', label: '逾期' }],
    allLabel: '全部明细',
    allCount: 830,
    counts: { overdue: 5, total: 830 },
    countUnit: '条',
  }
  await harness.render(createElement(BusinessStatusFilter, props))
  assert.equal(harness.button('全部明细 830 条').getAttribute('aria-label'), '全部明细，共 830 条')
  assert.equal(harness.button('逾期 5 条').getAttribute('aria-label'), '逾期，共 5 条')
  await harness.render(createElement(BusinessStatusFilter, {
    ...props, allLabel: '全部订单', allCount: 307, countUnit: '张',
  }))
  assert.equal(harness.button('全部订单 307 张').getAttribute('aria-label'), '全部订单，共 307 张')
  await harness.render(createElement(BusinessStatusFilter, {
    ...props, allCount: null, counts: null, disabled: true,
  }))
  assert.equal(harness.button('全部明细 —').getAttribute('aria-label'), '全部明细，数量暂不可用')
  assert.ok([...document.querySelectorAll('button')].every((button) => button.disabled))
  assert.equal(document.querySelector('[role="group"]').getAttribute('aria-busy'), 'false')
})

test('固定单选按选项直接选择、清空和禁用，排序显示实际默认值，只有显式搜索保留下拉', async (t) => {
  const harness = await businessFormHarness(t)
  const { BusinessOperationPanel, SelectFilter } = await import('./BusinessListLayout.jsx')
  const options = [{ value: '', label: '全部' }, { value: 'ready', label: '待处理' }, { value: 'done', label: '已处理' }, { value: 'forbidden', label: '不可用', disabled: true }]
  const selections = []
  const sourceSelections = []
  const sortSelections = []
  function Example({ disabled = false }) {
    const [value, setValue] = React.useState('')
    const [source, setSource] = React.useState(undefined)
    const [sort, setSort] = React.useState('smart')
    return createElement(BusinessOperationPanel, {
      filtersOpen: true,
      filters: createElement(
        React.Fragment,
        null,
        createElement(SelectFilter, { 'aria-label': '任务状态', value, disabled, options, onChange: (next, option) => { selections.push([next, option.label]); setValue(next) } }),
        createElement(SelectFilter, { 'aria-label': '办理人', showSearch: true, value: '', options }),
        createElement(SelectFilter, { 'aria-label': '来源单据', value: source, disabled, allowClear: true, options: Array.from({ length: 8 }, (_, i) => ({ value: i, label: `来源${i}` })), onChange: (next, option) => { sourceSelections.push([next, option.label]); setSource(next) } }),
        createElement(SelectFilter, { 'aria-label': '排序方式', emptyValue: 'smart', purpose: 'sort', value: sort, disabled, options: [{ value: 'smart', label: '智能优先' }, { value: 'new', label: '最新' }, { value: 'old', label: '最早' }], onChange: (next) => { sortSelections.push(next); setSort(next) } })
      ),
    })
  }
  await harness.render(createElement(Example))
  const group = document.querySelector('[role="group"][aria-label="任务状态"]')
  assert.ok(group)
  assert.equal(group.querySelector('input'), null)
  await harness.click(harness.button('待处理'))
  assert.equal(harness.button('待处理').getAttribute('aria-pressed'), 'true')
  await harness.click([...group.querySelectorAll('button')].find((button) => button.textContent === '不限'))
  assert.deepEqual(selections, [['ready', '待处理'], ['', '不限']])
  assert.equal(harness.button('不可用').disabled, true)
  const sourceGroup = document.querySelector('[role="group"][aria-label="来源单据"]')
  assert.ok(sourceGroup)
  assert.equal(sourceGroup.querySelector('input'), null)
  assert.deepEqual([...sourceGroup.querySelectorAll('button')].map((button) => button.textContent), ['不限', ...Array.from({ length: 8 }, (_, i) => `来源${i}`)])
  const sourceButton = (label) => [...sourceGroup.querySelectorAll('button')].find((button) => button.textContent === label)
  for (const i of [0, 5, 7]) {
    await harness.click(sourceButton(`来源${i}`))
    assert.equal(sourceButton(`来源${i}`).getAttribute('aria-pressed'), 'true')
    assert.equal(sourceGroup.querySelectorAll('[aria-pressed="true"]').length, 1)
  }
  await harness.click(sourceButton('不限'))
  assert.deepEqual(sourceSelections, [[0, '来源0'], [5, '来源5'], [7, '来源7'], ['', '不限']])
  assert.equal(document.querySelector('[role="combobox"][aria-label="排序方式"]'), null)
  const sortGroup = document.querySelector('[role="group"][aria-label="排序方式"]')
  assert.deepEqual([...sortGroup.querySelectorAll('button')].map((button) => button.textContent), ['智能优先', '最新', '最早'])
  assert.equal(harness.button('智能优先').getAttribute('aria-pressed'), 'true')
  await harness.click(harness.button('最早'))
  await harness.click(harness.button('智能优先'))
  assert.deepEqual(sortSelections, ['old', 'smart'])
  assert.ok(document.querySelector('[role="combobox"][aria-label="办理人"]').closest('.ant-select-show-search'))
  await harness.render(createElement(Example, { disabled: true }))
  assert.ok([...group.querySelectorAll('button')].every((button) => button.disabled))
  assert.ok([...sourceGroup.querySelectorAll('button')].every((button) => button.disabled))
})

test('质检让步接收的按钮内说明不改变筛选，禁用与清空仍独立生效', async (t) => {
  const ui = await businessFormHarness(t)
  const [{ BusinessOperationPanel, SelectFilter }, { QUALITY_RESULT_FILTER_OPTIONS }] = await Promise.all([
    import('./BusinessListLayout.jsx'),
    import('../quality-inspections/qualityInspectionColumns.jsx'),
  ])
  const changes = []
  function Example({ disabled = false }) {
    const [value, setValue] = React.useState('')
    return createElement(BusinessOperationPanel, {
      filtersOpen: true,
      filters: createElement(SelectFilter, {
        'aria-label': '检验结果',
        value,
        disabled,
        options: QUALITY_RESULT_FILTER_OPTIONS,
        onChange: (next) => { changes.push(next); setValue(next) },
      }),
    })
  }
  await ui.render(createElement(Example))
  const group = document.querySelector('[role="group"][aria-label="检验结果"]')
  const help = group.querySelector('[aria-label="查看让步接收说明"]')
  assert.ok(help.closest('.erp-filter-chip--with-help'))
  assert.equal(group.querySelector('button button'), null)
  await ui.click(help)
  assert.equal(help.getAttribute('aria-expanded'), 'true')
  assert.deepEqual(changes, [])
  await ui.click(ui.button('让步接收'))
  assert.deepEqual(changes, ['CONCESSION'])
  assert.equal(help.closest('.erp-filter-chip--with-help').getAttribute('data-selected'), 'true')
  await ui.click(help)
  assert.deepEqual(changes, ['CONCESSION'])
  await ui.click(ui.button('不限'))
  assert.deepEqual(changes, ['CONCESSION', ''])
  await ui.render(createElement(Example, { disabled: true }))
  assert.ok([...group.querySelectorAll('button')].every((button) => button.disabled || Boolean(button.closest('fieldset[disabled]'))))
  assert.equal(help.closest('fieldset').disabled, true)
})

test('面板外固定筛选也直接点选，共享选项保留查询空值、零、false 和禁用状态', async (t) => {
  const ui = await businessFormHarness(t)
  const [{ SelectFilter }, { default: FilterChipGroup }] = await Promise.all([
    import('./BusinessListLayout.jsx'),
    import('../../../common/components/navigation/FilterChipGroup.jsx'),
  ])
  const changes = []
  function Example({ disabled = false, loading = false }) {
    const [value, setValue] = React.useState(undefined)
    return createElement(React.Fragment, null, createElement(SelectFilter, { 'aria-label': '行内状态', value: 'open', options: [{ value: 'open', label: '启用' }, { value: 'closed', label: '停用' }] }), createElement(FilterChipGroup, { label: '数值范围', allowClear: true, emptyValue: 'all', disabled, loading, value, options: [{ value: 'all', label: '全部值' }, { value: 0, label: '零值' }, { value: false, label: '否值' }], onChange: (next) => { changes.push(next); setValue(next) } }),
    )
  }
  await ui.render(createElement(Example))
  assert.ok(document.querySelector('[role="group"][aria-label="行内状态"]'))
  assert.equal(document.querySelector('[role="combobox"]'), null)
  const group = () => document.querySelector('[role="group"][aria-label="数值范围"]')
  const selected = () => group().querySelector('[aria-pressed="true"]').textContent
  assert.equal(selected(), '不限')
  for (const label of ['零值', '否值', '否值', '不限']) await ui.click([...group().querySelectorAll('button')].find((button) => button.textContent === label))
  assert.deepEqual(changes, [0, false, 'all'])
  assert.equal(selected(), '不限')
  for (const state of [{ disabled: true }, { loading: true }]) {
    await ui.render(createElement(Example, state))
    assert.ok([...group().querySelectorAll('button')].every((node) => node.disabled))
  }
})

test('手机单据类型超过四项仍直接点选，保留当前选择和清空', async (t) => {
  const ui = await businessFormHarness(t)
  const { default: MobileTaskExtraFilters } = await import('../../mobile/components/MobileTaskExtraFilters.jsx')
  const changes = []
  function Example() {
    const [options, setOptions] = React.useState({ sourceType: 'sales_order' })
    return createElement(MobileTaskExtraFilters, { options, showDue: false, sourceTypes: ['sales_order', 'purchase_order', 'purchase_receipt', 'shipment', 'inventory_operation', 'quality_inspection'], onChange: (next) => { changes.push(next); setOptions(next) } })
  }
  await ui.render(createElement(Example))
  const group = document.querySelector('[role="group"][aria-label="单据类型"]')
  assert.equal(group.querySelectorAll('button').length, 7)
  assert.equal(document.querySelector('[role="combobox"]'), null)
  assert.equal(ui.button('销售订单').getAttribute('aria-pressed'), 'true')
  await ui.click(ui.button('采购订单'))
  await ui.click(ui.button('全部'))
  assert.deepEqual(changes, [{ sourceType: 'purchase_order' }, { sourceType: '' }])
})

test('日期快捷项成对提交、清空和回显，自定义保留单边日期，财务期间须选日期', async (t) => {
  const ui = await businessFormHarness(t)
  const { DateRangeFilter } = await import('./BusinessDateInputs.jsx')
  const { currentBusinessDate } = await import('../../utils/businessDate.mjs')
  const changes = []
  const render = (startValue, endValue, required = false) => ui.render(createElement(DateRangeFilter, {
    startValue,
    endValue,
    required,
    onRangeChange: (from, to) => changes.push([from, to]),
    value: 'due',
    options: [{ value: 'due', label: '交期', upcoming: true }],
  }))
  const today = currentBusinessDate()
  await render('', '')
  assert.equal(document.querySelectorAll('.ant-picker').length, 0)
  await ui.click(ui.button('今天'))
  assert.deepEqual(changes, [[today, today]])
  await render(today, today)
  assert.equal(ui.button('今天').getAttribute('aria-pressed'), 'true')
  await ui.click(ui.button('自定义日期'))
  assert.equal(document.querySelectorAll('.ant-picker').length, 2)
  assert.equal(changes.length, 1)
  await ui.click(ui.button('不限'))
  assert.deepEqual(changes.at(-1), ['', ''])
  await render('', '2026-10-03')
  assert.equal(ui.button('自定义日期').getAttribute('aria-pressed'), 'true')
  assert.equal(document.querySelector('[aria-label="结束日期"]').value, '2026/10/03')
  await render('', '')
  assert.equal(ui.button('不限').getAttribute('aria-pressed'), 'true')
  await render('', '', true)
  assert.equal(Boolean(ui.button('不限')), false)
  assert.equal(document.querySelectorAll('.ant-picker').length, 2)
})
