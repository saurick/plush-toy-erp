import assert from 'node:assert/strict'
import test from 'node:test'
import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { Linter } from 'eslint'
import { BusinessTextPolicy } from '../../common/consts/policies.generated.mjs'
import { normalizeProductionMaterialIssueCreateRequest } from './productionMaterialIssueAction.mjs'
import { normalizeProductionCompletionCreateRequest } from './productionCompletionAction.mjs'
import { OUTSOURCING_SOURCE_ACTIONS, normalizeOutsourcingSourceFactCreateRequest } from './outsourcingOrderFactAction.mjs'
import { OPERATIONAL_FACT_DRAFT_SAVE_ACTIONS, normalizeProductionFactDraftSaveRequest } from './operationalFactDraftEdit.mjs'
import { buildPurchaseReceiptPayablePayload } from './financeBusinessSourceAction.mjs'
import { buildShipmentFinanceSourcePayload } from './shipmentFinanceSourceAction.mjs'

const sourceFields = { fact_no: 'NOTE-1', warehouse_id: 1, lot_id: 1, quantity: '1', idempotency_key: 'note-limit' }
const productionFields = { ...sourceFields, production_order_id: 1, production_order_item_id: 1 }
const consumers = {
  'production issue': (note) => normalizeProductionMaterialIssueCreateRequest({ ...productionFields, production_order_material_requirement_id: 1, note }),
  'production completion': (note) => normalizeProductionCompletionCreateRequest({ ...productionFields, note }),
  'outsourcing issue': (note) => normalizeOutsourcingSourceFactCreateRequest(OUTSOURCING_SOURCE_ACTIONS.MATERIAL_ISSUE, { ...sourceFields, outsourcing_order_id: 1, outsourcing_order_item_id: 1, note }),
  'draft edit': (note) => normalizeProductionFactDraftSaveRequest(OPERATIONAL_FACT_DRAFT_SAVE_ACTIONS.PRODUCTION_COMPLETION, { id: 1, expected_version: 1, warehouse_id: 1, lot_id: 1, quantity: '1', occurred_at: '2026-10-31T01:00:00+08:00', note }),
  'receipt payable': (note) => buildPurchaseReceiptPayablePayload({ fact_no: 'NOTE-1', note }, { id: 1, receipt_no: 'RC-1', status: 'POSTED' }),
  'shipment receivable': (note) => buildShipmentFinanceSourcePayload({ note }, { id: 1, shipment_no: 'SHIP-1', status: 'SHIPPED' }),
}

const noteEditors = new Linter()
const noteEditorConfig = [{
  files: ['**/*.jsx'],
  languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } },
  plugins: { notes: { rules: { textarea: {
    create(context) {
      const source = context.sourceCode
      const tagName = (node) => node.type === 'JSXMemberExpression'
        ? `${tagName(node.object)}.${tagName(node.property)}` : node.name
      const noteAttribute = (attribute) => attribute.type === 'JSXAttribute' && (
        ['label', 'aria-label'].includes(attribute.name.name) && /备注/u.test(source.getText(attribute)) ||
        ['name', 'key'].includes(attribute.name.name) && /['"](?:note|[a-z_]+_note)['"]/u.test(source.getText(attribute.value))
      )
      return { JSXElement(node) {
        const tag = tagName(node.openingElement.name)
        if (!node.openingElement.attributes.some(noteAttribute)) return
        const control = tag === 'Form.Item'
          ? node.children.find((child) => child.type === 'JSXElement')?.openingElement
          : /^(?:Input(?:\.TextArea)?|input|textarea|BusinessTextArea)$/u.test(tag) ? node.openingElement : null
        if (!control) return
        if (tagName(control.name) !== 'BusinessTextArea') {
          context.report({ node: control, message: '备注必须使用随内容增高的 BusinessTextArea' })
          return
        }
        const rows = control.attributes.find((attribute) => attribute.name?.name === 'minRows')?.value
        if (rows && Number(rows.expression?.value ?? rows.value) < 2) {
          context.report({ node: control, message: '明细和整单备注均至少两行起步' })
        }
      } }
    },
  } } } },
  rules: { 'notes/textarea': 'error' },
}]

test('remark editor guard rejects single inputs and one-row details', () => {
  for (const control of ['<Input />', '<Input.TextArea rows={2} />', '<BusinessTextArea minRows={1} />']) {
    assert.equal(noteEditors.verify(`<Form.Item name="note">${control}</Form.Item>`, noteEditorConfig, 'fixture.jsx').length, 1)
  }
  assert.equal(noteEditors.verify('<Form.Item name="note"><BusinessTextArea /></Form.Item>', noteEditorConfig, 'fixture.jsx').length, 0)
})

test('every business and workbench remark editor uses the shared multiline control', () => {
  const root = path.resolve(import.meta.dirname, '../..')
  let fields = 0
  for (const entry of readdirSync(root, { recursive: true })) {
    if (!entry.endsWith('.jsx')) continue
    const source = readFileSync(path.join(root, entry), 'utf8')
    if (!/备注|['"](?:note|[a-z_]+_note)['"]/u.test(source)) continue
    fields++
    const errors = noteEditors.verify(source, noteEditorConfig, entry)
    assert.deepEqual(errors.map(({ line, message }) => ({ file: entry, line, message })), [])
  }
  assert.ok(fields > 30, '审查真实业务及工作台调用，不能只验证共享组件')
})

for (const [name, consume] of Object.entries(consumers)) {
  test(`${name} preserves long Unicode remarks, rejects overflow and clears empty text`, () => {
    for (const character of ['注', 'a', '😀']) {
      const note = character.repeat(BusinessTextPolicy.noteMaxCharacters)
      assert.equal(consume(note).note, note)
      assert.throws(() => consume(note + character))
    }
    assert.equal(Object.hasOwn(consume(''), 'note'), false)
  })
}
