import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'

import {
  getPrintTemplateByKey,
  printTemplateCatalog,
  printTemplateStats,
} from './printTemplates.mjs'

const repoRoot = path.resolve(import.meta.dirname, '../../../..')

function read(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8')
}

test('FL_print_templates_sample__uses_generic_sample_values_without_customer_identity printTemplates: 默认样例补中性字段且不带客户身份', () => {
  assert.equal(printTemplateCatalog.length, 5)
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
    assert(template.fieldRequirements.length > 0)
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

  const materialDetailTemplate = getPrintTemplateByKey(
    'engineering-material-detail'
  )
  assert.equal(materialDetailTemplate?.sample.companyName, '本公司')
  assert.equal(materialDetailTemplate?.sample.images.header_left.dataURL, '')
  assert(materialDetailTemplate?.sample.lines.length > 0)

  const colorCardTemplate = getPrintTemplateByKey('engineering-color-card')
  assert.equal(colorCardTemplate?.sample.companyName, '本公司')
  assert.deepEqual(colorCardTemplate?.moduleKeys, ['material_bom'])
  assert(colorCardTemplate?.sample.blocks.length > 0)

  const workInstructionTemplate = getPrintTemplateByKey(
    'engineering-work-instruction'
  )
  assert.equal(workInstructionTemplate?.sample.companyName, '本公司')
  assert.deepEqual(workInstructionTemplate?.moduleKeys, ['material_bom'])
  assert.match(workInstructionTemplate?.notes.join('\n') || '', /BOM 管理/)
  assert.doesNotMatch(
    workInstructionTemplate?.notes.join('\n') || '',
    /委外订单页面/
  )
  assert.equal(workInstructionTemplate?.sample.images.header.dataURL, '')
  const workInstructionStepRows = workInstructionTemplate?.sample.rows.filter(
    (row) => row.type === 'step'
  )
  assert(workInstructionStepRows.length >= 2)
  assert(workInstructionStepRows.length <= 5)
})

test('FL_print_templates_contract__declares_field_requirements_and_pdf_module_guard printTemplates: 正式模板声明字段合同和 PDF 模块门禁', () => {
  const templatePDFServer = read('server/internal/server/template_pdf.go')

  printTemplateCatalog.forEach((template) => {
    assert.equal(template.runtimeStatus, 'official_template')
    assert.equal(template.readiness, 'source_grounded')
    assert.equal(template.factBoundary, 'read_snapshot_only')
    assert(template.moduleKeys.length > 0, `${template.key} moduleKeys`)
    assert(
      template.fieldRequirements.length > 0,
      `${template.key} fieldRequirements`
    )

    assert.match(
      templatePDFServer,
      new RegExp(`case "${template.key}"`),
      `${template.key} must be registered in template_pdf.go`
    )

    template.moduleKeys.forEach((moduleKey) => {
      assert.match(
        templatePDFServer,
        new RegExp(`"${moduleKey}"`),
        `${template.key} module ${moduleKey} must be guarded by server PDF rendering`
      )
    })

    template.fieldRequirements.forEach((requirement) => {
      assert(requirement.key, `${template.key} requirement key`)
      assert(requirement.label, `${template.key} requirement label`)
      assert(requirement.source, `${template.key} requirement source`)
      assert(requirement.boundary, `${template.key} requirement boundary`)
      assert.doesNotMatch(
        requirement.key,
        /(^|_)id($|_)/i,
        `${template.key} requirement keys must not be raw id display contracts`
      )
    })
  })
})

test('printTemplates: 预览 renderer 只保留正式目录登记的模板分支', () => {
  const renderer = read(
    'web/src/erp/components/print/PrintTemplateRenderer.jsx'
  )
  const registeredTemplateKeys = printTemplateCatalog.map(
    (template) => template.key
  )
  const rendererTemplateKeys = Array.from(
    renderer.matchAll(/template\.key === '([^']+)'/gu),
    (match) => match[1]
  )

  assert.deepEqual(rendererTemplateKeys.sort(), registeredTemplateKeys.sort())
  assert.doesNotMatch(renderer, /material-summary/u)
  assert.doesNotMatch(renderer, /processing-summary/u)
  assert.doesNotMatch(renderer, /production-order-report/u)
  assert.doesNotMatch(renderer, /function SummaryTemplate/u)
  assert.doesNotMatch(renderer, /function ProductionReportTemplate/u)
})

test('FL_print_templates_processing_preview__uses_processing_signature_and_totals printTemplates: 加工合同静态预览读取加工合同草稿字段', () => {
  const renderer = read(
    'web/src/erp/components/print/PrintTemplateRenderer.jsx'
  )
  const previewPage = read('web/src/erp/pages/PrintTemplatePreviewPage.jsx')
  const printCenterPage = read('web/src/erp/pages/PrintCenterPage.jsx')

  assert.match(renderer, /resolvePrintTemplateTotals/u)
  assert.match(renderer, /buildPrintTemplateLineCells/u)
  assert.match(renderer, /totals\.quantityText/u)
  assert.match(renderer, /totals\.amountText/u)
  assert.doesNotMatch(renderer, /data\.totalQuantity/u)
  assert.doesNotMatch(renderer, /data\.totalAmount/u)
  assert.doesNotMatch(renderer, /function resolveLineTotals/u)
  assert.match(renderer, /coalescePrintValues\(data\.buyerSigner/u)
  assert.match(renderer, /data\.buyerSignDateText/u)
  assert.match(renderer, /renderPrintValue\(data\.supplierSigner\)/u)
  assert.match(previewPage, /<PrintTemplateRenderer template=\{template\} \/>/u)
  assert.match(printCenterPage, /activeSample\.buyerSignDateText/u)
})

test('printTemplates: 打印中心模板选择以 URL 为单一真源', () => {
  const printCenterPage = read('web/src/erp/pages/PrintCenterPage.jsx')

  assert.match(
    printCenterPage,
    /const activeKey = isSupportedPrintWorkspaceTemplate\(requestedTemplateKey\)/u
  )
  assert.match(
    printCenterPage,
    /nextSearchParams\.set\('template', template\.key\)/u
  )
  assert.doesNotMatch(printCenterPage, /\[activeKey, setActiveKey\]/u)
  assert.doesNotMatch(printCenterPage, /setActiveKey\(/u)
})

test('FL_print_templates_output_zero__does_not_use_falsy_fallback_for_paper_values printTemplates: 纸面输出层不使用 falsy fallback 吞掉 0 值', () => {
  const renderer = read(
    'web/src/erp/components/print/PrintTemplateRenderer.jsx'
  )
  const processingPaper = read(
    'web/src/erp/components/print/ProcessingContractPaper.jsx'
  )

  assert.match(renderer, /renderPrintValue/u)
  assert.match(renderer, /coalescePrintValues/u)
  assert.doesNotMatch(renderer, /\|\| ''/u)
  assert.doesNotMatch(renderer, /\|\| '\\u00A0'/u)
  assert.doesNotMatch(processingPaper, /String\(value \|\| ''\)/u)
  assert.doesNotMatch(processingPaper, /value \|\| '\\u00A0'/u)
})
