import assert from 'node:assert/strict'
import test from 'node:test'
import { act, createElement as h } from 'react'
import { businessFormHarness } from '../../../../scripts/test/businessFormHarness.mjs'

async function compactForm(t, { mobile = false, note = '原备注' } = {}) {
  const harness = await businessFormHarness(t)
  const [{ Form, Input }, { default: Table, BusinessCompactFieldRow: Row }, { default: Groups }, { BusinessPageContext }, { revealBusinessLineItemErrors }] = await Promise.all([
    import('antd'), import('./BusinessCompactFieldTable.jsx'), import('./BusinessGroupedLineItems.jsx'),
    import('../../hooks/useBusinessPageContext.js'), import('./businessLineItemDisclosure.mjs'),
  ])
  let form
  function Example() {
    const [currentForm] = Form.useForm()
    form = currentForm
    const renderRow = (field, index) => {
      const noteField = h(Form.Item, { name: [field.name, 'note'], label: '明细备注', rules: [{ max: 4, message: '备注过长' }] }, h(Input.TextArea))
      return h(Row, {
        key: field.key,
        sequence: index + 1,
        label: `生产明细 ${index + 1}`,
        detailsToggleLabel: '明细备注',
        actions: h('button', { type: 'button' }, '移除'),
        cells: [h(Form.Item, { key: 'quantity', name: [field.name, 'quantity'], label: '数量' }, h(Input))],
        persistentFields: h(Form.Item, { name: [field.name, 'route'], label: '生产路线' }, h(Input)),
      }, noteField)
    }
    const list = h(Form.List, { name: 'items' }, (fields) => h(Groups, {
      fields,
      form,
      table: Table,
      title: '生产明细',
      getGroup: () => ({ key: 'product', label: '同一产品' }),
      tableProps: { label: '生产明细', showSequence: true, expandableDetails: true, columns: [{ label: '数量' }, { actions: true, label: '操作' }] },
    }, renderRow))
    const initialValues = { items: [{ quantity: '12', route: '标准路线', note }, { quantity: '8', route: '标准路线', note: '' }] }
    return h(BusinessPageContext.Provider, { value: { taskBusiness: mobile ? { device: 'mobile' } : null } }, h(Form, { form, initialValues }, list))
  }

  await harness.render(h(Example))
  return { ...harness, form, revealBusinessLineItemErrors }
}

test('桌面紧凑明细只收起备注，办理字段常显且展开保留节点和值', async (t) => {
  const harness = await compactForm(t)
  const rows = document.querySelectorAll('.erp-compact-field-table__row')
  const first = rows[0]
  const toggle = first.querySelector('.erp-line-editor__details-toggle')
  const note = first.querySelector('textarea')
  const route = first.querySelector('input[id$="_route"]')
  assert.equal(toggle.getAttribute('aria-expanded'), 'false')
  assert.equal(toggle.getAttribute('aria-label'), '展开第 1 行明细备注')
  assert.equal(Boolean(note.closest('[hidden]')), true)
  assert.equal(Boolean(route.closest('[hidden]')), false)
  assert.equal(first.querySelector('.erp-editable-line-group__sequence').rowSpan, 2)
  await act(() => toggle.focus())
  assert.equal(first.hasAttribute('data-line-editor-row-selected'), false, '箭头聚焦不提前重排选中行工具栏')
  await harness.click(toggle)
  assert.equal(first.hasAttribute('data-line-editor-row-selected'), false, '展开只改变补充资料可见性')
  assert.equal(toggle.closest('td').cellIndex, 0)
  assert.equal(first.querySelector('.erp-editable-line-group__sequence').cellIndex, 1)
  assert.equal(toggle.querySelector('.anticon-right') !== null, true)
  assert.equal(toggle.getAttribute('aria-controls'), note.closest('tr').id)
  assert.equal(toggle.getAttribute('aria-expanded'), 'true')
  assert.equal(first.querySelector('.erp-editable-line-group__sequence').rowSpan, 3)
  assert.equal(Boolean(note.closest('[hidden]')), false)
  await harness.fill(note, '新备注')
  await act(() => rows[1].querySelector('input').focus())
  assert.equal(rows[1].getAttribute('data-line-editor-row-selected'), 'true')
  await harness.click(toggle)
  assert.equal(rows[1].getAttribute('data-line-editor-row-selected'), 'true', '收起另一行不切换顶部操作对象')
  assert.equal(first.querySelector('textarea') === note, true)
  assert.equal(first.querySelector('input[id$="_route"]') === route, true)
  assert.equal(rows[1].querySelector('.erp-line-editor__details-toggle').getAttribute('aria-expanded'), 'false')
  let values
  await act(async () => { values = await harness.form.validateFields() })
  assert.deepEqual(values.items[0], { quantity: '12', route: '标准路线', note: '新备注' })
})

test('隐藏备注校验失败时同步展开错误行，重复定位仍可重新打开', async (t) => {
  const harness = await compactForm(t, { note: '这条备注超过限制' })
  const row = document.querySelector('.erp-compact-field-table__row')
  const toggle = row.querySelector('.erp-line-editor__details-toggle')
  let failure
  await act(async () => { failure = await harness.form.validateFields().catch((error) => error) })
  assert.equal(failure.errorFields[0].errors[0], '备注过长')
  await act(async () => harness.revealBusinessLineItemErrors(harness.form, failure.errorFields))
  assert.equal(toggle.getAttribute('aria-expanded'), 'true')
  assert.equal(Boolean(row.querySelector('textarea').closest('[hidden]')), false)
  assert.match(row.querySelector('[role="status"]').textContent, /1 项待修改/u)
  await harness.click(toggle)
  assert.equal(toggle.getAttribute('aria-expanded'), 'false')
  await act(async () => harness.revealBusinessLineItemErrors(harness.form, failure.errorFields))
  assert.equal(toggle.getAttribute('aria-expanded'), 'true')
  assert.equal(document.querySelectorAll('.erp-line-editor__details-toggle')[1].getAttribute('aria-expanded'), 'false')
})

test('手机任务的紧凑明细直接显示完整资料，不叠加行内折叠', async (t) => {
  await compactForm(t, { mobile: true })
  assert.equal(document.querySelectorAll('.erp-line-editor__details-toggle').length, 0)
  assert.equal(Boolean(document.querySelector('textarea').closest('[hidden]')), false)
  assert.equal(Boolean(document.querySelector('input[id$="_route"]').closest('[hidden]')), false)
})
