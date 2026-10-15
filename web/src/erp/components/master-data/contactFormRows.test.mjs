import test from 'node:test'
import assert from 'node:assert/strict'
import {
  contactRowsForForm,
  normalizeContactRows,
  withPrimaryContact,
} from './contactFormRows.mjs'

test('a single active contact becomes primary without changing its saved source', () => {
  const source = [{ id: 8, name: '小陈', is_primary: false, note: '周一联系' }]
  const [row] = contactRowsForForm(source)
  assert.equal(row.is_primary, true)
  assert.equal(row.id, 8)
  assert.equal(row.note, '周一联系')
  assert.equal(source[0].is_primary, false)
  assert.deepEqual(contactRowsForForm([{ name: '停用', is_active: false }]), [
    { is_primary: true },
  ])
})

test('choosing a primary preserves identities and notes and selects exactly one person', () => {
  const rows = [
    { id: 1, name: '小陈', is_primary: true, note: '业务\n联系' },
    { id: 2, name: '小周', is_primary: false, email: 'zhou@example.test' },
  ]
  const selected = withPrimaryContact(rows, 1)
  assert.deepEqual(
    selected.map((row) => row.is_primary),
    [false, true]
  )
  assert.equal(selected[0].note, rows[0].note)
  assert.equal(selected[1].email, rows[1].email)
  assert.deepEqual(
    selected.map((row) => row.id),
    [1, 2]
  )
  assert.equal(rows[0].is_primary, true)
})

test('removing the primary appoints the first survivor and removing another contact keeps the selection', () => {
  const rows = [
    { id: 1, is_primary: false },
    { id: 2, is_primary: true },
    { id: 3, is_primary: false },
  ]
  assert.deepEqual(withPrimaryContact(rows.filter((row) => row.id !== 2)), [
    { id: 1, is_primary: true },
    { id: 3, is_primary: false },
  ])
  assert.deepEqual(withPrimaryContact(rows.filter((row) => row.id !== 1)), [
    { id: 2, is_primary: true },
    { id: 3, is_primary: false },
  ])
})

test('save normalization drops empty new rows and keeps cleared existing fields and internal note line breaks', () => {
  const rows = normalizeContactRows([
    {
      id: '8',
      name: ' 小陈 ',
      mobile: '',
      note: '业务\n仅工作日',
      is_primary: false,
    },
    {},
  ])
  assert.equal(rows.length, 1)
  assert.equal(rows[0].id, 8)
  assert.equal(rows[0].name, '小陈')
  assert.equal(rows[0].mobile, '')
  assert.equal(rows[0].note, '业务\n仅工作日')
  assert.equal(rows[0].is_primary, true)
  assert.deepEqual(normalizeContactRows([]), [])
})

test('duplicate primary flags are reduced to the first selected contact', () => {
  const rows = contactRowsForForm([
    { name: '甲', is_primary: false },
    { name: '乙', is_primary: true },
    { name: '丙', is_primary: true },
  ])
  assert.deepEqual(
    rows.map((row) => row.is_primary),
    [false, true, false]
  )
})
