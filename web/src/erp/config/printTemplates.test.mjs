import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getPrintTemplateByKey,
  printTemplateCatalog,
  printTemplateStats,
} from './printTemplates.mjs'

test('FL_print_templates_sample__uses_generic_sample_values_without_customer_identity printTemplates: 默认样例补中性字段且不带客户身份', () => {
  assert.equal(printTemplateCatalog.length, 2)
  assert.equal(printTemplateStats.total, printTemplateCatalog.length)
  assert.equal(printTemplateStats.sourceGrounded, printTemplateCatalog.length)

  printTemplateCatalog.forEach((template) => {
    assert(template.sourceFiles.length > 0)
    assert(
      !template.sourceFiles.some((sourceFile) => sourceFile.includes('/Users/'))
    )
    assert(
      !template.sourceFiles.some((sourceFile) => sourceFile.includes('永绅'))
    )
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
  assert.equal(processingTemplate?.sample.supplierName, '示例加工厂')
  assert.equal(processingTemplate?.sample.supplierContact, '加工厂联系人')
  assert.equal(processingTemplate?.sample.supplierPhone, '加工厂联系电话')
  assert.equal(processingTemplate?.sample.supplierAddress, '加工厂地址')
  assert.equal(processingTemplate?.sample.supplierSignDateText, '2025-06-08')
  assert.equal(processingTemplate?.sample.buyerCompany, '本公司')
  assert.equal(processingTemplate?.sample.buyerContact, '委外负责人')
  assert.equal(processingTemplate?.sample.buyerPhone, '公司联系电话')
  assert.equal(processingTemplate?.sample.buyerAddress, '公司地址')
  assert.equal(processingTemplate?.sample.buyerSigner, '签字人')
  assert.equal(processingTemplate?.sample.supplierSigner, '受托方签字人')
  processingTemplate?.sample.lines.forEach((line) => {
    assert.equal(line.supplierAlias, '示例加工厂')
    assert.notEqual(line.remark, '')
  })
  assert.equal(
    processingTemplate?.sample.attachments['attachment-1']?.dataURL,
    ''
  )

  const materialTemplate = getPrintTemplateByKey('material-purchase-contract')
  assert.equal(materialTemplate?.sample.supplierName, '示例供应商')
  assert.equal(materialTemplate?.sample.supplierContact, '供应商联系人')
  assert.equal(materialTemplate?.sample.supplierPhone, '供应商联系电话')
  assert.equal(materialTemplate?.sample.supplierAddress, '供应商地址')
  assert.equal(materialTemplate?.sample.supplierSignDateText, '2026/2/28')
  assert.equal(materialTemplate?.sample.buyerCompany, '本公司')
  assert.equal(materialTemplate?.sample.buyerContact, '采购负责人')
  assert.equal(materialTemplate?.sample.buyerPhone, '公司联系电话')
  assert.equal(materialTemplate?.sample.buyerAddress, '公司地址')
  assert.equal(materialTemplate?.sample.buyerSigner, '签字人')
  materialTemplate?.sample.lines.forEach((line) => {
    assert.notEqual(line.vendorCode, '')
    assert.notEqual(line.spec, '')
    assert.notEqual(line.unitPrice, '')
    assert.notEqual(line.amount, '')
    assert.notEqual(line.remark, '')
  })
})
