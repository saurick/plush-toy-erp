import assert from 'node:assert/strict'
import test from 'node:test'
import React, { act, createElement as h } from 'react'
import { businessFormHarness } from '../../../../scripts/test/businessFormHarness.mjs'
import { filterSelectOptions, isEmptyFilterValue } from './filterSelectOptions.mjs'

test('分组单选保留分类语义和勾选标记，自定义图标与字段映射仍生效', async (t) => {
  const harness = await businessFormHarness(t)
  const { default: AppSelect } = await import('./AppSelect.jsx')
  const props = {
    open: true,
    virtual: false,
    value: 'purchase',
    fieldNames: { label: 'name', value: 'key', options: 'children' },
    options: [{ name: '业务单据', children: [{ key: 'purchase', name: '采购订单' }, { key: 'sales', name: '销售订单' }] }],
  }
  await harness.render(h(AppSelect, props))
  const group = document.querySelector('.ant-select-item-group')
  assert.equal(group.textContent, '业务单据')
  assert.notEqual(group.getAttribute('role'), 'option')
  assert.ok(document.querySelector('.ant-select-item-option-selected .ant-select-item-option-state [aria-label="check"]'))
  assert.equal(document.querySelectorAll('.ant-select-item-option-selected').length, 1)
  await harness.render(h(AppSelect, { ...props, menuItemSelectedIcon: h('span', { 'data-custom-selected': true }, '当前') }))
  assert.equal(document.querySelector('[data-custom-selected]')?.textContent, '当前')
  await harness.render(h(AppSelect, { ...props, menuItemSelectedIcon: null }))
  assert.equal(document.querySelector('.ant-select-item-option-state [aria-label="check"]'), null)
})

test('筛选空值按合同处理，保留分组、零、false 与真实业务范围', () => {
  const zero = { value: 0, label: '零' }
  const no = { value: false, label: '否' }
  assert.deepEqual(filterSelectOptions([
    { label: '分类', options: [{ value: 'all', label: '不限' }, zero, no] },
    { label: '空组', options: [{ value: '', label: '全部' }] },
    { value: 'ALL_WAREHOUSES', label: '全部仓库' },
  ], 'all'), [
    { label: '分类', options: [zero, no] },
    { value: 'ALL_WAREHOUSES', label: '全部仓库' },
  ])
  assert.equal(isEmptyFilterValue(0), false)
  assert.equal(isEmptyFilterValue(false), false)
  assert.equal(isEmptyFilterValue('all', 'all'), true)
})

test('筛选选择、清空及重新选择保留字段用途，清空返回声明的查询空值', async (t) => {
  const harness = await businessFormHarness(t)
  const { default: FilterSelect } = await import('./FilterSelect.jsx')
  const changes = []
  function Example() {
    const [value, setValue] = React.useState('all')
    return h(FilterSelect, {
      id: 'supplier',
      label: '供应商',
      value,
      emptyValue: 'all',
      options: [{ value: 'all', label: '全部供应商' }, { value: 0, label: '甲厂' }],
      onChange: (next) => { changes.push(next); setValue(next) },
    })
  }
  await harness.render(h(Example))
  const input = document.querySelector('[role="combobox"]')
  const select = input.closest('.ant-select')
  assert.equal(select.querySelector('.ant-select-selection-placeholder').textContent, '供应商')
  await act(() => input.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true })))
  await harness.flush()
  const options = [...document.querySelectorAll('.ant-select-item-option')]
  assert.deepEqual(options.map((node) => node.textContent), ['甲厂'])
  await harness.click(options[0])
  assert.equal(select.querySelector('.app-select__label').textContent, '供应商')
  assert.ok(select.querySelector('.ant-select-clear'))
  await act(() => select.querySelector('.ant-select-clear').dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true })))
  await harness.flush()
  assert.equal(select.querySelector('.ant-select-selection-placeholder').textContent, '供应商')
  assert.equal(select.querySelector('.ant-select-clear'), null)
  assert.equal(input.getAttribute('aria-expanded'), 'false')
  assert.deepEqual(changes, [0, 'all'])
  await act(() => input.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true })))
  await harness.flush()
  await harness.click(document.querySelector('.ant-select-item-option'))
  assert.deepEqual(changes, [0, 'all', 0])
})

test('必填输入可暂时清空但仍阻止保存，禁用与固定模式不提供清空', async (t) => {
  const harness = await businessFormHarness(t)
  const [{ default: AppSelect }, { Form }] = await Promise.all([import('./AppSelect.jsx'), import('antd')])
  let form
  function Example() {
    [form] = Form.useForm()
    return h(Form, { form, initialValues: { unit: 'piece' } }, h(Form.Item, { name: 'unit', label: '单位', rules: [{ required: true, message: '请选择单位' }] }, h(AppSelect, { placeholder: '请选择单位', options: [{ value: 'piece', label: '个' }] })), h(AppSelect, { label: '权限模式', allowClear: false, value: 'assigned', options: [{ value: 'assigned', label: '指定范围' }] }), h(AppSelect, { label: '冻结字段', disabled: true, value: 'piece', options: [{ value: 'piece', label: '个' }] }))
  }
  await harness.render(h(Example))
  const selects = document.querySelectorAll('.app-select')
  assert.equal(selects[1].querySelector('.ant-select-clear'), null)
  assert.equal(selects[1].querySelector('.app-select__label').textContent, '权限模式')
  assert.equal(selects[2].querySelector('.ant-select-clear'), null)
  await act(() => selects[0].querySelector('.ant-select-clear').dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true })))
  await harness.flush()
  assert.equal(form.getFieldValue('unit'), undefined)
  await act(async () => { await assert.rejects(form.validateFields(), (error) => error.errorFields[0].errors.includes('请选择单位')) })
})

test('排序清空恢复声明的默认排序，界面显示用途提示', async (t) => {
  const harness = await businessFormHarness(t)
  const { default: FilterSelect } = await import('./FilterSelect.jsx')
  let query
  function Example() {
    const [value, setValue] = React.useState('order_date:asc')
    query = value
    return h(FilterSelect, { label: '排序方式', value, emptyValue: 'updated_at:desc', options: [{ value: 'updated_at:desc', label: '最近更新' }, { value: 'order_date:asc', label: '最早订单' }], onChange: setValue })
  }
  await harness.render(h(Example))
  await act(() => document.querySelector('.ant-select-clear').dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true })))
  await harness.flush()
  assert.equal(query, 'updated_at:desc')
  assert.equal(document.querySelector('.ant-select-selection-placeholder').textContent, '排序方式')
})

test('共享选择框保留公开 ref、非受控默认值和自定义字段映射', async (t) => {
  const harness = await businessFormHarness(t)
  const { default: AppSelect } = await import('./AppSelect.jsx')
  const ref = React.createRef()
  const changes = []
  await harness.render(h(AppSelect, {
    ref,
    'aria-label': '仓库引用',
    defaultValue: 0,
    prefix: h('span', null, '来源'),
    fieldNames: { value: 'id', label: 'name' },
    options: [{ id: 0, name: '零号仓库' }, { id: 1, name: '成品仓库' }],
    onChange: (value) => changes.push(value),
  }))
  const input = document.querySelector('[role="combobox"]')
  const root = input.closest('.ant-select')
  assert.ok(ref.current.nativeElement === root, '公开 ref 仍指向选择框本身')
  assert.equal(root.querySelector('.ant-select-selection-item').textContent, '零号仓库')
  assert.equal(root.querySelector('.ant-select-prefix').textContent, '来源')
  await act(() => ref.current.focus())
  assert.ok(document.activeElement === input)
  await act(() => input.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true })))
  await harness.flush()
  await harness.click([...document.querySelectorAll('.ant-select-item-option')].find((node) => node.textContent === '成品仓库'))
  assert.deepEqual(changes, [1])
  assert.equal(root.querySelector('.ant-select-selection-item').textContent, '成品仓库')
  assert.ok(ref.current.nativeElement === root, '选择后不重建选择框根节点')
})

test('业务引用自动显示名称且保留表单清空、重选与资料替换', async (t) => {
  const harness = await businessFormHarness(t)
  const [{ default: AppSelect }, { default: Context }, { Form }] = await Promise.all([
    import('./AppSelect.jsx'), import('./SelectPresentationContext.jsx'), import('antd'),
  ])
  let form
  let replaceOptions
  const initial = [
    { value: 1, label: 'WH-1 一号仓', identity: { name: '一号仓', code: 'WH-1' } },
    { value: 2, label: 'WH-2 二号仓', identity: { name: '二号仓', code: 'WH-2' } },
  ]
  function Example() {
    [form] = Form.useForm()
    const [options, setOptions] = React.useState(initial)
    replaceOptions = setOptions
    return h(Form, { form, initialValues: { warehouse: 1 } }, h(Context.Provider, { value: 'reference' }, h(Form.Item, { name: 'warehouse', rules: [{ required: true }] }, h(AppSelect, { options, showSearch: true, optionFilterProp: 'label' })), h(AppSelect, { disabled: true, value: 1, options }), h(AppSelect, { value: 'EA', options: [{ value: 'EA', label: '个' }] })), h(AppSelect, { value: 1, options }))
  }
  await harness.render(h(Example))
  const [editable, locked, unit, filter] = document.querySelectorAll('.app-select')
  assert.equal(editable.querySelector('.app-select__reference-name').textContent, '一号仓')
  assert.equal(editable.querySelector('.app-select__reference-code'), null)
  assert.equal(locked.querySelector('[role="combobox"]').disabled, true)
  assert.equal(locked.querySelector('.ant-select-clear'), null)
  assert.equal(locked.querySelector('.ant-select-arrow'), null)
  assert.equal(unit.classList.contains('app-select--reference'), false)
  assert.equal(filter.classList.contains('app-select--reference'), true, '普通业务字段自动使用名称展示')
  await act(() => editable.querySelector('.ant-select-clear').dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true })))
  await harness.flush()
  assert.equal(form.getFieldValue('warehouse'), undefined)
  assert.equal(editable.querySelector('.app-select__reference-value'), null)
  await act(async () => { await assert.rejects(form.validateFields()) })
  await act(() => editable.querySelector('input').dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true })))
  await harness.flush()
  await harness.click([...document.querySelectorAll('.ant-select-item-option')].find((node) => node.textContent === 'WH-2 二号仓'))
  assert.equal(form.getFieldValue('warehouse'), 2)
  assert.equal(editable.querySelector('.app-select__reference-name').textContent, '二号仓')
  await act(() => replaceOptions([{ value: 2, label: 'WH-2 更新名称', identity: { name: '更新名称', code: 'WH-2' } }]))
  assert.equal(editable.querySelector('.app-select__reference-name').textContent, '更新名称')
  assert.equal(editable.textContent.includes('一号仓'), false)
  await act(() => replaceOptions([initial[0], { value: 2, label: '当前单据已有名称' }]))
  assert.equal(editable.querySelector('.app-select__reference-name').textContent, '当前单据已有名称', '缺少结构化身份时保留现有标签，不拆出猜测编码')
  assert.equal(editable.querySelector('.app-select__reference-code'), null)
  const input = editable.querySelector('input')
  await act(() => input.focus())
  await act(() => replaceOptions([{ value: 2, label: '资料重载后的当前名称' }]))
  assert.ok(document.activeElement === input, '结构化资料暂缺时保留输入节点及焦点')
  assert.equal(editable.querySelector('.ant-select-selection-item').textContent, '资料重载后的当前名称')
})

test('引用资料缺失时不显示内部 ID，加载后恢复真实名称与编码', async (t) => {
  const harness = await businessFormHarness(t)
  const { default: AppSelect } = await import('./AppSelect.jsx')
  let loadSelected
  function Example() {
    const [options, setOptions] = React.useState([
      { value: 1, label: '甲仓 WH-A', identity: { name: '甲仓', code: 'WH-A' } },
    ])
    loadSelected = () => setOptions([
      { value: 2, label: '乙仓 WH-B', identity: { name: '乙仓', code: 'WH-B' } },
    ])
    return h(AppSelect, { presentation: 'reference', value: 2, options })
  }
  await harness.render(h(Example))
  const field = document.querySelector('.app-select')
  const input = field.querySelector('input')
  assert.equal(field.querySelector('.app-select__reference-name').textContent, '资料已关联')
  assert.equal(field.querySelector('.app-select__reference-code'), null)
  await act(() => loadSelected())
  assert.equal(field.querySelector('.app-select__reference-name').textContent, '乙仓')
  assert.equal(field.querySelector('.app-select__reference-name').textContent, '乙仓')
  assert.equal(field.querySelector('.app-select__reference-code'), null)
  assert.ok(field.querySelector('input') === input, '资料补齐不重建选择输入')
})

test('非受控引用名称随默认值、重选和清空更新，公开 ref 仍指向 Select', async (t) => {
  const harness = await businessFormHarness(t)
  const { default: AppSelect } = await import('./AppSelect.jsx')
  const ref = React.createRef()
  await harness.render(h(AppSelect, {
    ref,
    presentation: 'reference',
    defaultValue: 1,
    options: [
      { value: 1, label: '甲仓 WH-A', identity: { name: '甲仓', code: 'WH-A' } },
      { value: 2, label: '乙仓 WH-B', identity: { name: '乙仓', code: 'WH-B' } },
    ],
  }))
  const root = document.querySelector('.app-select')
  const field = root
  assert.equal(field.querySelector('.app-select__reference-name').textContent, '甲仓')
  assert.equal(field.querySelector('.app-select__reference-code'), null)
  assert.ok(ref.current.nativeElement === root)
  await act(() => root.querySelector('input').dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true })))
  await harness.flush()
  await harness.click([...document.querySelectorAll('.ant-select-item-option')].find((node) => node.textContent === '乙仓 WH-B'))
  assert.equal(field.querySelector('.app-select__reference-name').textContent, '乙仓')
  assert.equal(field.querySelector('.app-select__reference-code'), null)
  await act(() => root.querySelector('.ant-select-clear').dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true })))
  await harness.flush()
  assert.equal(field.querySelector('.app-select__reference-code'), null)
})

for (const mode of ['multiple', 'tags']) {
  test(`${mode} 保留多值选择与清空`, async (t) => {
    const harness = await businessFormHarness(t)
    const { default: AppSelect } = await import('./AppSelect.jsx')
    const changes = []
    const ref = React.createRef()
    function Example() {
      const [value, setValue] = React.useState(['sales'])
      return h(AppSelect, {
        ref,
        mode,
        'aria-label': '员工岗位',
        value,
        options: [{ value: 'sales', label: '业务' }, { value: 'warehouse', label: '仓库' }],
        onChange: (next) => { changes.push(next); setValue(next) },
      })
    }
    await harness.render(h(Example))
    const input = document.querySelector('[role="combobox"]')
    const root = input.closest('.app-select')
    assert.ok(ref.current.nativeElement === root)
    assert.equal(root.querySelectorAll('.ant-select-selection-item').length, 1)
    await act(() => input.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true })))
    await harness.flush()
    await harness.click([...document.querySelectorAll('.ant-select-item-option')].find((node) => node.textContent === '仓库'))
    assert.deepEqual(changes.at(-1), ['sales', 'warehouse'])
    assert.equal(root.querySelectorAll('.ant-select-selection-item').length, 2)
    assert.equal(root.querySelector('.app-select__inspect'), null)
    await act(() => root.querySelector('.ant-select-clear').dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true })))
    await harness.flush()
    assert.deepEqual(changes.at(-1), [])
    assert.equal(root.querySelectorAll('.ant-select-selection-item').length, 0)
    assert.ok(ref.current.nativeElement === root)
  })
}

for (const kind of ['AppSelect', 'FilterSelect']) {
  test(`${kind} 数量更新后由外部清空，不回显旧标签或产生选中值告警`, async (t) => {
    const harness = await businessFormHarness(t)
    const { default: Select } = await import(`./${kind}.jsx`)
    const emptyValue = kind === 'FilterSelect' ? 'all' : undefined
    const warnings = []
    t.mock.method(console, 'error', (...args) => warnings.push(args.map(String).join(' ')))
    let changeCount
    let resetFilter
    function Example() {
      const [value, setValue] = React.useState(emptyValue)
      const [count, setCount] = React.useState(1)
      changeCount = setCount
      resetFilter = () => setValue(emptyValue)
      return h(Select, {
        label: '核对状态',
        placeholder: '按核对状态筛选',
        value,
        ...(kind === 'FilterSelect' ? { emptyValue } : {}),
        onChange: setValue,
        options: [{ value: 'review', label: `待核对（${count}）` }],
      })
    }
    await harness.render(h(Example))
    const input = document.querySelector('[role="combobox"]')
    const control = input.closest('.ant-select')
    await act(() => input.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true })))
    await harness.flush()
    await harness.click(document.querySelector('.ant-select-item-option'))
    await act(() => changeCount(0))
    await harness.flush()
    assert.equal(control.querySelector('.ant-select-selection-item').textContent, '待核对（0）')
    await act(() => resetFilter())
    await harness.flush()
    assert.equal(control.querySelector('.ant-select-selection-placeholder').textContent, '按核对状态筛选')
    assert.equal(Boolean(control.querySelector('.ant-select-selection-item')), false)
    assert.deepEqual(warnings, [])
  })
}

test('显式空值不回选默认值，非受控默认值及零、false、业务空字符串保留', async (t) => {
  const harness = await businessFormHarness(t)
  const { default: AppSelect } = await import('./AppSelect.jsx')
  const options = [
    { value: 'one', label: '默认对象' },
    { value: 0, label: '零' },
    { value: false, label: '否' },
    { value: '', label: '未填写客户' },
  ]
  const examples = [
    h(AppSelect, { key: 'default', defaultValue: 'one', options }),
    h(AppSelect, { key: 'empty', defaultValue: 'one', value: undefined, options, placeholder: '选择对象' }),
    ...[0, false, ''].map((value) => h(AppSelect, { key: String(value), value, options })),
  ]
  await harness.render(h(React.Fragment, null, ...examples))
  const controls = [...document.querySelectorAll('.app-select')]
  assert.equal(controls[0].querySelector('.ant-select-selection-item').textContent, '默认对象')
  assert.equal(controls[1].querySelector('.ant-select-selection-placeholder').textContent, '选择对象')
  assert.deepEqual(controls.slice(2).map((control) => control.querySelector('.ant-select-selection-item').textContent), ['零', '否', '未填写客户'])
})

for (const variant of ['business', 'filter', 'multiple']) {
  test(`结构化选项 ${variant} 选中名称与候选详细标签分离`, async (t) => {
    const harness = await businessFormHarness(t)
    const { default: AppSelect } = await import('./AppSelect.jsx')
    const { default: FilterSelect } = await import('./FilterSelect.jsx')
    const Control = variant === 'filter' ? FilterSelect : AppSelect
    const changes = []
    const inputProps = {
      options: [
        { value: 1, label: 'WH-1 一号仓 甲区', identity: { name: '一号仓', code: 'WH-1' } },
        { value: 2, label: 'WH-2 二号仓 乙区', identity: { name: '二号仓', code: 'WH-2' } },
      ],
      onChange: (next) => changes.push(next),
    }
    function Example() {
      const [value, setValue] = React.useState(variant === 'multiple' ? [1] : 1)
      return h(Control, { ...inputProps, value, ...(variant === 'multiple' ? { mode: 'multiple' } : {}), onChange: (next) => { changes.push(next); setValue(next) } })
    }
    await harness.render(h(Example))
    const root = document.querySelector('.app-select')
    assert.equal(root.querySelector('.ant-select-selection-item').textContent.trim(), '一号仓')
    assert.equal(root.classList.contains('app-select--reference'), variant === 'business')
    await act(() => root.querySelector('input').dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true })))
    await harness.flush()
    const candidate = [...document.querySelectorAll('.ant-select-item-option')].find((node) => node.textContent === 'WH-2 二号仓 乙区')
    assert.ok(Boolean(candidate), '候选标签保留编码和附加识别信息')
    await harness.click(candidate)
    assert.deepEqual(changes.at(-1), variant === 'multiple' ? [1, 2] : 2)
    const text = [...root.querySelectorAll('.ant-select-selection-item')].map((node) => node.textContent.trim())
    assert.deepEqual(text, variant === 'multiple' ? ['一号仓', '二号仓'] : ['二号仓'])
    assert.equal(root.querySelector('.app-select__reference-code'), null)
  })
}

test('远程选项首次出现时保留输入根节点、焦点和展开状态', async (t) => {
  const harness = await businessFormHarness(t)
  const { default: AppSelect } = await import('./AppSelect.jsx')
  const ref = React.createRef()
  let receive
  function Example() {
    const [options, setOptions] = React.useState([])
    receive = setOptions
    return h(AppSelect, { ref, showSearch: true, options })
  }
  await harness.render(h(Example))
  const root = ref.current.nativeElement
  const input = root.querySelector('input')
  await act(() => input.dispatchEvent(new window.MouseEvent('mousedown', { bubbles: true })))
  await harness.flush()
  await act(() => input.focus())
  await act(() => receive([{ value: 7, label: 'CUS-7 晴空品牌 晴空', identity: { name: '晴空品牌', code: 'CUS-7' } }]))
  await harness.flush()
  assert.ok(ref.current.nativeElement === root, '选项到达不重建 Select 根节点')
  assert.ok(document.activeElement === input, '键盘焦点仍在原输入框')
  assert.equal(root.classList.contains('ant-select-open'), true, '选项加载后仍可继续选择')
  assert.equal(document.querySelector('.ant-select-item-option-content').textContent, 'CUS-7 晴空品牌 晴空')
})
