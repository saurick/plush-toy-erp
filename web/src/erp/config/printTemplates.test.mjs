import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getPrintTemplateByKey,
  printTemplateCatalog,
  printTemplateStats,
} from './printTemplates.mjs'

test('printTemplates: 首批模板均来自真实资料并保留样例数据', () => {
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
  assert.equal(getPrintTemplateByKey('processing-contract')?.title, '加工合同')
})
