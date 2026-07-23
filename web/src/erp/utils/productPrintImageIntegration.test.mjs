import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const readSource = (relativePath) =>
  readFileSync(new URL(relativePath, import.meta.url), 'utf8')

const bomPageSource = readSource('../pages/BOMVersionsPage.jsx')
const outsourcingPageSource = readSource('../pages/V1OutsourcingOrdersPage.jsx')
const workspaceSource = readSource('../pages/EngineeringPrintWorkspacePage.jsx')
const templateSource = readSource('../data/engineeringPrintTemplates.mjs')
const printStyleSource = readSource('../styles/app/engineering-print.css')

test('product print images: BOM material and work instruction drafts freeze product image snapshots before opening', () => {
  const actionSource = bomPageSource.slice(
    bomPageSource.indexOf('const openEngineeringPrint'),
    bomPageSource.indexOf('const openCreate')
  )

  assert.match(
    actionSource,
    /\[\s*MATERIAL_DETAIL_TEMPLATE_KEY,\s*WORK_INSTRUCTION_TEMPLATE_KEY,\s*\]\.includes\(templateKey\)/u
  )
  assert.match(
    actionSource,
    /loadProductPrintImageSnapshots\(detail\.product_id,\s*\{[\s\S]*listAttachments: listBusinessAttachments,[\s\S]*downloadAttachment: downloadBusinessAttachment/u
  )
  assert.match(actionSource, /const initialDraft = builder\(detail,\s*\{/u)
  assert.match(actionSource, /companyName:[\s\S]*productImages,/u)
  assert(
    actionSource.indexOf('loadProductPrintImageSnapshots') <
      actionSource.indexOf('openPrintWorkspaceWindow'),
    '产品图应先下载为草稿快照，再打开打印窗口'
  )
})

test('product print images: BOM print entry reflects template permission and fails closed before image RPC', () => {
  assert.match(
    bomPageSource,
    /const canPrint = hasActionPermission\(\s*adminProfile,\s*'erp\.print_template\.read'\s*\)/u
  )

  const actionSource = bomPageSource.slice(
    bomPageSource.indexOf('const openEngineeringPrint'),
    bomPageSource.indexOf('const openCreate')
  )
  assert.match(
    actionSource,
    /if \(!canPrint\) \{\s*message\.warning\(printPermissionHint\)\s*return\s*\}/u
  )
  assert(
    actionSource.indexOf('if (!canPrint)') <
      actionSource.indexOf('loadProductPrintImageSnapshots'),
    '无打印权限时不得发起产品图 RPC'
  )
  assert.match(
    actionSource,
    /catch \(error\) \{\s*message\.error\(getActionErrorMessage\(error, '打开工程打印模板失败'\)\)\s*\}/u,
    '产品图读取或打印草稿打开失败时应进入统一用户可见错误态'
  )

  const operationSource = bomPageSource.slice(
    bomPageSource.indexOf('<SelectionActionBar'),
    bomPageSource.indexOf('<BusinessDataTable')
  )
  assert.match(
    operationSource,
    /\{canPrint[\s\S]*?MATERIAL_DETAIL_TEMPLATE_KEY[\s\S]*?COLOR_CARD_TEMPLATE_KEY[\s\S]*?WORK_INSTRUCTION_TEMPLATE_KEY[\s\S]*?\.map\(/u,
    '三个 BOM 打印入口都应由打印权限统一投影'
  )
  assert.doesNotMatch(
    operationSource,
    /disabled=\{\s*!canPrint/u,
    '无打印权限时不应渲染永久置灰的打印按钮'
  )
})

test('product print images: outsourcing never borrows the first line image when active products differ', () => {
  const actionSource = outsourcingPageSource.slice(
    outsourcingPageSource.indexOf('const openWorkInstructionPrint'),
    outsourcingPageSource.indexOf('const openPurchaseOrderPrint')
  )

  assert.match(
    actionSource,
    /resolveSharedProductIDForPrintImages\(activeItems\)/u
  )
  assert.match(
    actionSource,
    /productImageSource\.reason === 'single'[\s\S]*loadProductPrintImageSnapshots\(productImageSource\.productID/u
  )
  assert.match(actionSource, /productImages,[\s\S]*openPrintWorkspaceWindow/u)
  assert.match(
    actionSource,
    /productImageSource\.reason === 'multiple'[\s\S]*包含多个产品，未自动带入产品图/u
  )
  assert.doesNotMatch(
    actionSource,
    /loadProductPrintImageSnapshots\(activeItems\[0\]/u
  )
})

test('product print images: work instruction keeps legacy header plus an independently controlled second slot', () => {
  assert.match(
    templateSource,
    /workInstruction:\s*\[[\s\S]*key: 'header'[\s\S]*key: 'header_right'/u
  )
  assert.match(
    workspaceSource,
    /workInstructionHeaderImageInputRefs\.current\[slot\.key\] = node/u
  )
  assert.match(workspaceSource, /uploadInstructionImage\(slot\.key, file\)/u)
  assert.match(workspaceSource, /clearInstructionImage\(slot\.key\)/u)
  assert.match(
    workspaceSource,
    /<WorkInstructionHeaderImages images=\{draft\.images\} \/>/u
  )
  assert.match(
    workspaceSource,
    /<WorkInstructionHeaderImages images=\{headerImages\} \/>/u
  )
  assert.match(
    printStyleSource,
    /\.erp-work-instruction-paper__header-images--count-2\s*\{\s*grid-template-columns: repeat\(2, minmax\(0, 1fr\)\);\s*\}/u
  )
})
