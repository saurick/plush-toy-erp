import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getPrintTemplateByKey,
  printTemplateCatalog,
  printTemplateStats,
} from './printTemplates.mjs'

test('FL_print_templates_sample__keeps_supplier_snapshot_fields_blank_by_default printTemplates: 首批模板均来自真实资料并保留样例数据', () => {
  assert.equal(printTemplateCatalog.length, 2)
  assert.equal(printTemplateStats.total, printTemplateCatalog.length)
  assert.equal(printTemplateStats.sourceGrounded, printTemplateCatalog.length)

  printTemplateCatalog.forEach((template) => {
    assert(template.sourceFiles.length > 0)
    assert(template.fieldTruth.length > 0)
    assert(template.helpNotes.length > 0)
    assert(template.sample)
    assert.equal(getPrintTemplateByKey(template.key)?.title, template.title)
  })

  assert.equal(getPrintTemplateByKey('missing-template'), null)
  assert.equal(
    getPrintTemplateByKey('material-purchase-contract')?.title,
    '采购合同'
  )
  const processingTemplate = getPrintTemplateByKey('processing-contract')
  assert.equal(processingTemplate?.title, '加工合同')
  assert.deepEqual(Object.keys(processingTemplate?.sample.attachments || {}), [
    'attachment-1',
    'attachment-2',
  ])
  assert.equal(processingTemplate?.sample.supplierName, '')
  assert.equal(processingTemplate?.sample.supplierContact, '')
  assert.equal(processingTemplate?.sample.supplierPhone, '')
  assert.equal(processingTemplate?.sample.supplierAddress, '')
  assert.equal(processingTemplate?.sample.supplierSignDateText, '')
  processingTemplate?.sample.lines.forEach((line) => {
    assert.equal(line.supplierAlias, '')
  })
  assert.equal(
    processingTemplate?.sample.attachments['attachment-1']?.dataURL,
    ''
  )

  const materialTemplate = getPrintTemplateByKey('material-purchase-contract')
  assert.equal(materialTemplate?.sample.supplierName, '')
  assert.equal(materialTemplate?.sample.supplierContact, '')
  assert.equal(materialTemplate?.sample.supplierPhone, '')
  assert.equal(materialTemplate?.sample.supplierAddress, '')
  assert.equal(materialTemplate?.sample.supplierSignDateText, '')
  materialTemplate?.sample.lines.forEach((line) => {
    assert.equal(line.vendorCode, '')
  })
})
