import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)))
const projectRoot = resolve(rootDir, '../../..')
const webSourceRoot = resolve(rootDir, '..')

const scanDirs = ['pages', 'components', 'mobile'].map((dir) =>
  join(rootDir, dir)
)
const scanFiles = ['utils/referenceSelectOptions.mjs'].map((file) =>
  join(rootDir, file)
)
scanFiles.push(join(rootDir, 'utils/dashboardTaskDisplay.mjs'))
scanFiles.push(join(rootDir, 'utils/workflowDashboardStats.mjs'))
scanFiles.push(join(rootDir, 'utils/masterDataOrderView.mjs'))
scanFiles.push(join(rootDir, 'data/processingContractTemplate.mjs'))

const sourceExtensions = new Set(['.js', '.jsx', '.mjs'])
const businessVisibleScanDirs = ['pages', 'components'].map((dir) =>
  join(rootDir, dir)
)
const businessVisibleConfigFiles = [
  'config/businessModules.mjs',
  'config/devPrototypes.mjs',
].map((file) => join(rootDir, file))
const formalVisibleConfigFiles = [
  'config/businessModules.mjs',
  'config/commandCenter.mjs',
  'config/dashboardModules.mjs',
  'config/printTemplates.mjs',
  'config/seedData.mjs',
].map((file) => join(rootDir, file))
const formalVisibleUtilityFiles = [
  'utils/businessDashboardContract.mjs',
  'utils/financeBusinessSourceAction.mjs',
  'utils/outsourcingOrderFactAction.mjs',
  'utils/productionCompletionAction.mjs',
  'utils/productionMaterialIssueAction.mjs',
  'utils/productionOrderModel.mjs',
  'utils/productionReworkAction.mjs',
  'utils/purchaseReceiptMutation.mjs',
  'utils/shipmentWeight.mjs',
  'utils/sourceBusinessAction.mjs',
].map((file) => join(rootDir, file))
const formalOutsideErpVisibleDirs = [join(webSourceRoot, 'pages/AdminLogin')]
const formalOutsideErpVisibleFiles = [
  join(webSourceRoot, 'App.jsx'),
  join(webSourceRoot, 'common/consts/brand.js'),
  join(webSourceRoot, 'common/consts/errorCodes.js'),
]
const errorCodeVisibleFile = join(webSourceRoot, 'common/consts/errorCodes.js')
const currentCustomerVisibleConfigFiles = [
  'config/customers/yoyoosun/menuConfig.mjs',
  'config/customers/yoyoosun/customer-config.example.js',
].map((file) => join(projectRoot, file))
const forbiddenUserVisibleText = [
  '幂等键',
  '内部引用',
  '内部主键',
  '内部流水',
  '内部批次',
  '内部余额',
  '内部记录',
  '内部来源',
  '客户 #',
  '供应商 #',
  '材料 #',
  '产品 #',
  'SKU #',
  '单位 #',
  '仓库 #',
  '销售订单 #',
  '销售订单行 #',
  '采购订单 #',
  '采购订单行 #',
  '采购入库 #',
  '采购入库单 #',
  '加工合同 ${',
  '出货单 #',
  '入库行 #',
  '批次 #',
  '管理员 #',
  '未知单位 #',
  '主键',
  'sales_order_item_id 追溯',
  '关联来源必须',
  '填写关联来源记录',
  '缺少出货单 ID',
  '来源选择器',
  'active revision',
]
const forbiddenBusinessArchitectureText = ['生命周期']
const forbiddenBusinessSystemTimestampText = [
  '创建时间',
  '更新时间',
  '创建日期',
  '更新日期',
]
const visibleStringAttributePattern =
  /\b(?:label|shortLabel|title|shortTitle|placeholder|exportTitle|createLabel|description|summary|scene|layout|output|boundary|formBoundary|boundaryText|selectionBoundaryText|pageSummary|searchHint|hint|note|emptyText|panelDescription|emptyDescription|missingOwnerDescription|missingOwnerEmptyText|brandMark|companyName|systemName|aria-label|message)\s*(?:=|:)\s*(['"`])([^'"`]*?)\1/giu
const technicalSnakeCasePattern =
  /\b(?:expected_version|idempotency_key|intent_hash|task_version|owner_role_key|task_status_key|source_type|source_id|source_line_id|payload|[a-z][a-z0-9]*_(?:id|key))\b/iu
const visibleArrayPropertyPattern =
  /\b(?:currentScope|helpNotes|notes|previewLines|tags)\s*:\s*\[([\s\S]*?)\]/giu
const quotedStringPattern = /(['"`])([^'"`]*?)\1/gu
const jsxTextPattern = />\s*([^<>{}]*[\u3400-\u9fff][^<>{}]*)\s*</gu
const returnStringPattern = /\breturn\s+(['"`])([^'"`]*?)\1/gu
const errorStringPattern =
  /\b(?:new\s+)?(?:Error|TypeError)\s*\(\s*(['"`])([^'"`]*?)\1/gu
const userFeedbackStringPattern =
  /\bmessage\.(?:error|warning|success|info)\s*\(\s*(['"`])([^'"`]*?)\1/gu
const actionErrorFallbackPattern =
  /\bgetActionErrorMessage\s*\(\s*[^,\n]+,\s*(['"`])([^'"`]*?)\1/gu
const userFacingErrorFallbackPattern =
  /\bgetUserFacingErrorMessage\s*\(\s*[^,\n]+,\s*(['"`])([^'"`]*?)\1/gu
const userStateFeedbackStringPattern =
  /\bset(?:Error|SmsHint)\s*\(\s*(['"`])([^'"`]*?)\1/gu
const brandConstantStringPattern =
  /\b(?:ERP_BRAND_MARK|ERP_COMPANY_NAME|ERP_ADMIN_SYSTEM_NAME)\s*=\s*(['"`])([^'"`]*?)\1/gu
const invalidFeedbackStringPattern =
  /\b(?:invalidContract|invalidResponse|invalidSelection)\s*\(\s*(['"`])([^'"`]*?)\1/gu
const invalidFeedbackDefaultPattern =
  /\bfunction\s+(?:invalidContract|invalidResponse|invalidSelection)\s*\([^)]*=\s*(['"`])([^'"`]*?)\1/gu
const mappedErrorMessagePattern = /\[[^\]\n]+\]\s*:\s*(['"`])([^'"`]*?)\1/gu
const formalFeedbackStringPatterns = Object.freeze([
  returnStringPattern,
  errorStringPattern,
  userFeedbackStringPattern,
  actionErrorFallbackPattern,
  userFacingErrorFallbackPattern,
  userStateFeedbackStringPattern,
  brandConstantStringPattern,
  invalidFeedbackStringPattern,
  invalidFeedbackDefaultPattern,
])
const forbiddenFormalVisibleCopyPatterns = Object.freeze([
  ['OUT', /\bOUT\b/u],
  ['HOLD', /\bHOLD\b/u],
  ['SHIPPED', /\bSHIPPED\b/u],
  ['decimal', /\bdecimal\b/iu],
  ['RBAC', /\bRBAC\b/iu],
  ['Workflow', /\bWorkflow\b/iu],
  ['Fact', /\bFact\b/iu],
  ['业务源单', /业务源单/u],
  ['事实记录', /事实记录/u],
  ['对象族', /对象族/u],
  ['数据口径', /数据口径/u],
  ['业务口径', /业务口径/u],
  ['权限码', /权限码/u],
  ['运行态', /运行态/u],
  ['投影', /投影/u],
  ['上下文', /上下文/u],
  ['泳道', /泳道/u],
  ['服务端', /服务端/u],
  ['Product Core', /Product Core/iu],
  ['customer key', /customer key/iu],
  ['客户运行态', /客户运行态/u],
  ['控制面', /控制面/u],
  ['主数据', /主数据/u],
  ['协同任务', /协同任务/u],
  ['业务事实', /业务事实/u],
  ['财务事实', /财务事实/u],
  ['业务对象', /业务对象/u],
  ['核心对象', /核心对象/u],
  ['对象类型', /对象类型/u],
  ['关联对象', /关联对象/u],
  ['当前结果', /当前结果/u],
  ['责任角色', /责任角色/u],
  ['SLA', /\bSLA\b/iu],
  ['数据真源', /数据真源/u],
  ['快照', /快照/u],
  ['主链路', /主链路/u],
  ['前端', /前端/u],
  ['后端', /后端/u],
  ['API', /\bAPI\b/u],
  ['usecase', /\busecase\b/iu],
  ['payload', /\bpayload\b/iu],
  ['schema', /\bschema\b/iu],
  ['runtime', /\bruntime\b/iu],
  ['revision', /\brevision\b/iu],
  ['fallback', /\bfallback\b/iu],
  ['请求参数', /(?:请求|操作|批次)参数/u],
  ['响应无效', /响应无效/u],
  ['安全请求标识', /安全请求标识/u],
  ['不允许的字段', /不允许的字段/u],
  ['引用数据', /引用数据/u],
  ['保留本次请求', /已保留本次请求/u],
  ['使用原请求', /使用原请求核对|保留原请求/u],
  ['写库存', /(?:不写|会写|才会写|并写|后写)库存/u],
  ['写入库存', /写入库存|库存写入/u],
  ['库存流水', /库存流水/u],
  ['状态动作', /状态动作/u],
  ['对应业务模块', /对应业务模块/u],
  ['当前接入', /当前接入/u],
  ['抽象对象称谓', /(?:加工|领料|返工|质检|检验)对象/u],
  ['角色', /角色/u],
  ['动作', /动作/u],
  ['队列', /队列/u],
  ['兜底', /兜底/u],
  ['派生', /派生/u],
  ['收口', /收口/u],
  ['链路', /链路/u],
])

function isSourceFile(filePath) {
  return [...sourceExtensions].some((extension) => filePath.endsWith(extension))
}

function collectSourceFiles(dir) {
  const entries = readdirSync(dir, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) {
      return collectSourceFiles(path)
    }
    if (!entry.isFile() || !isSourceFile(path) || path.endsWith('.test.mjs')) {
      return []
    }
    return [path]
  })
}

function isDevOnlySource(filePath) {
  const relativePath = relative(rootDir, filePath).replaceAll('\\', '/')
  return (
    basename(filePath).startsWith('Dev') ||
    relativePath.startsWith('config/dev') ||
    relativePath.includes('/dev-only/')
  )
}

function collectFormalVisibleText(
  content,
  { includeMappedErrorMessages = false } = {}
) {
  const visibleText = []
  for (const match of content.matchAll(visibleStringAttributePattern)) {
    visibleText.push(match[2])
  }
  for (const match of content.matchAll(visibleArrayPropertyPattern)) {
    for (const stringMatch of match[1].matchAll(quotedStringPattern)) {
      visibleText.push(stringMatch[2])
    }
  }
  for (const match of content.matchAll(jsxTextPattern)) {
    visibleText.push(match[1].replace(/\s+/gu, ' ').trim())
  }
  for (const pattern of formalFeedbackStringPatterns) {
    for (const match of content.matchAll(pattern)) {
      visibleText.push(match[2])
    }
  }
  if (includeMappedErrorMessages) {
    for (const match of content.matchAll(mappedErrorMessagePattern)) {
      visibleText.push(match[2])
    }
  }
  return visibleText.filter(Boolean)
}

test('业务前端页面不暴露技术实现字段文案', () => {
  const violations = []
  for (const dir of scanDirs) {
    if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) continue
    for (const filePath of collectSourceFiles(dir)) {
      const content = readFileSync(filePath, 'utf8')
      for (const text of forbiddenUserVisibleText) {
        if (content.includes(text)) {
          violations.push(`${relative(rootDir, filePath)}: ${text}`)
        }
      }
    }
  }
  for (const filePath of scanFiles) {
    if (!statSync(filePath, { throwIfNoEntry: false })?.isFile()) continue
    const content = readFileSync(filePath, 'utf8')
    for (const text of forbiddenUserVisibleText) {
      if (content.includes(text)) {
        violations.push(`${relative(rootDir, filePath)}: ${text}`)
      }
    }
  }

  assert.deepEqual(violations, [])
})

test('正式页面可见文案不暴露开发实现和分析口径术语', () => {
  const files = new Set([
    ...formalVisibleConfigFiles,
    ...formalVisibleUtilityFiles,
    ...formalOutsideErpVisibleFiles,
    ...currentCustomerVisibleConfigFiles,
    ...scanFiles,
  ])
  for (const dir of [...scanDirs, ...formalOutsideErpVisibleDirs]) {
    if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) continue
    for (const filePath of collectSourceFiles(dir)) {
      if (!isDevOnlySource(filePath)) files.add(filePath)
    }
  }

  const violations = []
  for (const filePath of files) {
    if (!statSync(filePath, { throwIfNoEntry: false })?.isFile()) continue
    const content = readFileSync(filePath, 'utf8')
    for (const visibleText of collectFormalVisibleText(content, {
      includeMappedErrorMessages: filePath === errorCodeVisibleFile,
    })) {
      for (const [term, pattern] of forbiddenFormalVisibleCopyPatterns) {
        if (pattern.test(visibleText)) {
          violations.push(
            `${relative(rootDir, filePath)}: ${term} -> ${visibleText}`
          )
        }
      }
    }
  }

  assert.deepEqual(violations, [])
})

test('正式文案扫描覆盖外层入口、异常反馈和当前客户配置', () => {
  const sample = `
    function fallback() { return '业务看板响应无效' }
    const first = new Error('当前浏览器无法生成安全请求标识')
    message.warning('已保留本次请求，请使用相同内容重试')
    message.error(getActionErrorMessage(error, '加载库存引用数据'))
    setError('后台响应无效，请稍后重试')
    getUserFacingErrorMessage(error, '登录接口暂时不可用')
    const ERP_COMPANY_NAME = 'Product Core 运行态品牌'
    function invalidContract(message = '完工入库请求参数无效') {}
    throw invalidContract('完工入库请求包含不允许的字段')
    const messages = { [RpcErrorCode.INTERNAL]: '服务器运行时异常' }
  `
  const visibleText = collectFormalVisibleText(sample, {
    includeMappedErrorMessages: true,
  })

  for (const expected of [
    '业务看板响应无效',
    '当前浏览器无法生成安全请求标识',
    '已保留本次请求，请使用相同内容重试',
    '加载库存引用数据',
    '后台响应无效，请稍后重试',
    '登录接口暂时不可用',
    'Product Core 运行态品牌',
    '完工入库请求参数无效',
    '完工入库请求包含不允许的字段',
    '服务器运行时异常',
  ]) {
    assert.ok(visibleText.includes(expected), `未扫描到：${expected}`)
  }
  for (const customerConfigFile of currentCustomerVisibleConfigFiles) {
    assert.ok(
      statSync(customerConfigFile, { throwIfNoEntry: false })?.isFile(),
      `缺少当前客户可见配置：${relative(projectRoot, customerConfigFile)}`
    )
  }
  for (const filePath of formalOutsideErpVisibleFiles) {
    assert.ok(
      statSync(filePath, { throwIfNoEntry: false })?.isFile(),
      `缺少外层可见文案文件：${relative(webSourceRoot, filePath)}`
    )
  }
  for (const dir of formalOutsideErpVisibleDirs) {
    assert.ok(
      statSync(dir, { throwIfNoEntry: false })?.isDirectory(),
      `缺少外层可见文案目录：${relative(webSourceRoot, dir)}`
    )
  }
})

test('业务事实选中标签不把内部 ID 当业务编号 fallback', () => {
  const filePath = join(
    rootDir,
    'components/operational-facts/OperationalFactForms.jsx'
  )
  const content = readFileSync(filePath, 'utf8')

  assert.doesNotMatch(
    content,
    /record\.(?:shipment_no|reservation_no|fact_no)\s*\|\|\s*record\.id/u
  )
  assert.match(content, /出货单已关联/u)
  assert.match(content, /库存预留已关联/u)
  assert.match(content, /业务记录已关联/u)
})

test('业务事实页面不把 source_type 和 counterparty_type 原始 key 当可见 fallback', () => {
  const pageConfigPath = join(
    rootDir,
    'components/operational-facts/operationalFactPageConfig.mjs'
  )
  const formsPath = join(
    rootDir,
    'components/operational-facts/OperationalFactForms.jsx'
  )
  const pageConfig = readFileSync(pageConfigPath, 'utf8')
  const forms = readFileSync(formsPath, 'utf8')

  assert.doesNotMatch(pageConfig, /FACT_TYPE_LABELS\[value\]\s*\|\|\s*value/u)
  assert.doesNotMatch(pageConfig, /SOURCE_TYPE_LABELS\[value\]\s*\|\|\s*value/u)
  assert.doesNotMatch(
    pageConfig,
    /COUNTERPARTY_TYPE_LABELS\[value\]\s*\|\|\s*value/u
  )
  assert.match(pageConfig, /return SOURCE_TYPE_LABELS\[value\] \|\| '来源'/u)
  assert.match(
    pageConfig,
    /return COUNTERPARTY_TYPE_LABELS\[value\] \|\| '往来方'/u
  )
  assert.match(forms, /function factTypeText/u)
  assert.match(forms, /function counterpartyTypeText/u)
  assert.doesNotMatch(forms, /record\.counterparty_type\s*\|\|\s*'-'/u)
  assert.doesNotMatch(forms, /record\.fact_type\s*\|\|\s*'-'/u)
})

test('业务事实来源列优先展示业务来源号且不把 source_id 当可见 fallback', () => {
  const pageConfigPath = join(
    rootDir,
    'components/operational-facts/operationalFactPageConfig.mjs'
  )
  const pageConfig = readFileSync(pageConfigPath, 'utf8')

  assert.match(pageConfig, /function sourceDocumentRef/u)
  assert.match(pageConfig, /normalizeText\(record\.source_no\)/u)
  assert.match(pageConfig, /normalizeText\(record\.source_document_no\)/u)
  assert.match(pageConfig, /normalizeText\(record\.document_no\)/u)
  const sourceDocumentRefBody =
    pageConfig.match(/function sourceDocumentRef[\s\S]*?\n\}/u)?.[0] || ''
  assert.match(sourceDocumentRefBody, /'来源单据已关联'/u)
  assert.doesNotMatch(sourceDocumentRefBody, /source_id/u)
  assert.doesNotMatch(pageConfig, /readableRef\('来源', record\.source_id\)/u)
  assert.doesNotMatch(
    pageConfig,
    /record\.source_no\s*\|\|\s*record\.source_id/u
  )
  assert.doesNotMatch(
    pageConfig,
    /record\.document_no\s*\|\|\s*record\.source_id/u
  )
  assert.doesNotMatch(
    pageConfig,
    /\$\{record\.source_type\s*\|\|\s*''\}-\$\{record\.source_id\s*\|\|\s*''\}/u
  )
  assert.match(pageConfig, /function sourceColumnText\(record = \{\}\)/u)
  assert.match(pageConfig, /sortValue:\s*sourceColumnText/u)
  assert.match(pageConfig, /exportValue:\s*sourceColumnText/u)
})

test('Workflow 相关单据可见编号不把内部 ID 当 fallback', () => {
  const flowFiles = [
    {
      file: 'utils/finishedGoodsFlow.mjs',
      helper: 'resolveFinishedGoodsSourceNo',
    },
    {
      file: 'utils/shipmentFinanceFlow.mjs',
      helper: 'resolveShipmentFinanceSourceNo',
    },
    {
      file: 'utils/payableReconciliationFlow.mjs',
      helper: 'resolvePayableSourceNo',
    },
    {
      file: 'utils/purchaseInboundFlow.mjs',
      helper: 'resolveInboundSourceNo',
    },
    {
      file: 'utils/outsourceReturnFlow.mjs',
      helper: 'resolveOutsourceReturnSourceNo',
    },
  ]

  for (const { file, helper } of flowFiles) {
    const content = readFileSync(join(rootDir, file), 'utf8')
    const helperBody =
      content.match(
        new RegExp(`function ${helper}[\\s\\S]*?\\n\\}`, 'u')
      )?.[0] ||
      content.match(
        new RegExp(`export function ${helper}[\\s\\S]*?\\n\\}`, 'u')
      )?.[0] ||
      ''

    assert.notEqual(helperBody, '', `${file} 缺少 ${helper}`)
    assert.doesNotMatch(helperBody, /record\.id/u)
    assert.doesNotMatch(helperBody, /normalizeText\([^)]*id[^)]*\)/u)
    assert.match(helperBody, /resolveReadableWorkflowSourceNo\(record\)/u)
    assert.match(content, /formatWorkflowRelatedDocumentRef/u)
    assert.doesNotMatch(
      content,
      /record\.source_no \? `[^`]+：\$\{record\.source_no\}`/u
    )
  }
})

test('业务事实对象和往来方列不把内部 ID 当排序或导出值', () => {
  const pageConfigPath = join(
    rootDir,
    'components/operational-facts/operationalFactPageConfig.mjs'
  )
  const pageConfig = readFileSync(pageConfigPath, 'utf8')

  for (const helperName of [
    'subjectColumnText',
    'stockContextText',
    'supplierColumnText',
    'customerColumnText',
    'counterpartyColumnText',
  ]) {
    assert.match(pageConfig, new RegExp(`function ${helperName}\\(`, 'u'))
    assert.match(pageConfig, new RegExp(`sortValue:\\s*${helperName}`, 'u'))
    assert.match(pageConfig, new RegExp(`exportValue:\\s*${helperName}`, 'u'))
  }

  for (const rawIDFallback of [
    /record\.supplier_name\s*\|\|\s*record\.supplier_id/u,
    /record\.customer_snapshot\s*\|\|\s*record\.customer_id/u,
    /\$\{record\.counterparty_type\s*\|\|\s*''\}-\$\{record\.counterparty_id\s*\|\|\s*''\}/u,
    /\$\{record\.subject_type\s*\|\|\s*'PRODUCT'\}-\$\{\s*record\.subject_id\s*\|\|\s*record\.product_id/u,
    /\$\{record\.warehouse_id\s*\|\|\s*''\}-\$\{record\.lot_id\s*\|\|\s*''\}-\$\{\s*record\.unit_id/u,
  ]) {
    assert.doesNotMatch(pageConfig, rawIDFallback)
  }
  assert.match(pageConfig, /safeRefText\('供应商', record\.supplier_id\)/u)
  assert.match(pageConfig, /safeRefText\('客户', record\.customer_id\)/u)
  assert.match(pageConfig, /safeRefText\('往来方', record\.counterparty_id\)/u)
  assert.match(pageConfig, /const SUBJECT_TYPE_LABELS/u)
  assert.match(
    pageConfig,
    /SUBJECT_TYPE_LABELS\[record\.subject_type\]\s*\|\|\s*'业务记录'/u
  )
  assert.doesNotMatch(
    pageConfig,
    /safeRefText\(\s*record\.subject_type\s*\|\|/u
  )
})

test('销售订单客户选项不把客户 ID 当客户编码 fallback', () => {
  const filePath = join(rootDir, 'components/sales-orders/SalesOrderForm.jsx')
  const content = readFileSync(filePath, 'utf8')

  assert.doesNotMatch(content, /customer\.code\s*\|\|\s*customer\.id/u)
  assert.match(content, /未命名客户/u)
  assert.match(content, /客户已关联/u)
})

test('采购订单来源供应商不把 supplier_id 当供应商名称 fallback', () => {
  const filePath = join(rootDir, 'pages/V1PurchaseOrdersPage.jsx')
  const content = readFileSync(filePath, 'utf8')

  assert.doesNotMatch(content, /source\.supplier_id\s*\|\|/u)
  assert.match(content, /供应商已关联/u)
})

test('采购和委外订单选中摘要不把生命周期状态 key 当可见 fallback', () => {
  const purchaseConfigPath = join(
    rootDir,
    'components/purchase-orders/purchaseOrderPageConfig.mjs'
  )
  const outsourcingPagePath = join(rootDir, 'pages/V1OutsourcingOrdersPage.jsx')
  const purchaseConfig = readFileSync(purchaseConfigPath, 'utf8')
  const outsourcingPage = readFileSync(outsourcingPagePath, 'utf8')

  assert.doesNotMatch(
    purchaseConfig,
    /PURCHASE_ORDER_STATUS_LABELS\[record\.lifecycle_status\]\s*\|\|\s*record\.lifecycle_status/u
  )
  assert.doesNotMatch(
    outsourcingPage,
    /OUTSOURCING_ORDER_STATUS_LABELS\[selectedRow\.lifecycle_status\]\s*\|\|\s*selectedRow\.lifecycle_status/u
  )
  assert.match(purchaseConfig, /'采购订单状态'/u)
  assert.match(outsourcingPage, /'委外订单状态'/u)
})

test('权限中心角色展示不把 role_key 当用户可见 fallback', () => {
  const filePath = join(rootDir, 'pages/PermissionCenterPage.jsx')
  const content = readFileSync(filePath, 'utf8')

  assert.match(content, /getRoleDisplayName/u)
  assert.match(content, /function getRoleVisibleName/u)
  assert.match(
    content,
    /getRoleDisplayName\(getRoleKey\(role\), '已配置岗位'\)/u
  )
  assert.doesNotMatch(content, /role\.name\s*\|\|\s*getRoleKey\(role\)/u)
  assert.doesNotMatch(content, /role\.name\s*\|\|\s*roleKey/u)
  assert.doesNotMatch(content, /selectedRole\.name\s*\|\|\s*selectedRoleKey/u)
  assert.doesNotMatch(content, /<Text type="secondary">\{roleKey\}<\/Text>/u)
  assert.doesNotMatch(content, /<Tag>\{selectedRoleKey\}<\/Tag>/u)
  assert.match(content, /该岗位决定可使用的页面、手机待办和业务操作/u)
  assert.doesNotMatch(content, /岗位任务端/u)
})

test('权限中心权限名称不把 permission key 当用户可见 fallback', () => {
  const filePath = join(rootDir, 'pages/PermissionCenterPage.jsx')
  const content = readFileSync(filePath, 'utf8')

  assert.match(content, /function getPermissionVisibleName/u)
  assert.match(content, /return name \|\| '其他功能'/u)
  assert.doesNotMatch(content, /label:\s*permission\.name \|\| permissionKey/u)
  assert.doesNotMatch(content, /erp-permission-option__key/u)
  assert.doesNotMatch(content, /搜索权限码/u)
  assert.doesNotMatch(content, /搜索管理员账号、手机号、角色或权限码/u)
  assert.doesNotMatch(content, /角色名称可按岗位调整，职责权限保持统一/u)
  assert.match(content, /搜索功能名称或业务分类/u)
  assert.match(
    content,
    /const ASSIGN_USER_ROLE_PERMISSION = 'system\.user\.role\.assign'/u
  )
  assert.match(
    content,
    /const MANAGE_ROLE_PERMISSION = 'system\.role\.permission\.manage'/u
  )
  assert.doesNotMatch(
    content,
    /const MANAGE_ROLE_PERMISSION = 'system\.permission\.manage'/u
  )
  assert.match(
    content,
    /role_keys: canAssignUserRoles\s*\?\s*normalizeStringList/u
  )
  assert.doesNotMatch(
    content,
    /role_keys: canManageUsers\s*\?\s*normalizeStringList/u
  )
})

test('权限中心功能影响只展示业务页面、区域、动作和限制', () => {
  const filePath = join(rootDir, 'pages/PermissionCenterPage.jsx')
  const content = readFileSync(filePath, 'utf8')
  const impactMap = content.slice(
    content.indexOf('function PermissionImpactMap'),
    content.indexOf('function EffectiveRoleAccessOverview')
  )

  for (const visibleTechnicalDetail of [
    '技术详情',
    '权限标识：',
    '页面路径：',
    '接口定位：',
    '满足任一：',
    '必须同时满足：',
  ]) {
    assert.doesNotMatch(content, new RegExp(visibleTechnicalDetail, 'u'))
  }
  assert.doesNotMatch(content, /record\.key\}.*<\/Text>/u)
  assert.match(impactMap, /rowKey="rowID"/u)
  assert.doesNotMatch(impactMap, /rowKey="key"/u)
  assert.doesNotMatch(impactMap, /\.pagePath\b/u)
  assert.doesNotMatch(impactMap, /\.backendMethods\b/u)
  assert.doesNotMatch(impactMap, /\.requiredAny\b/u)
  assert.doesNotMatch(impactMap, /\.requiredAll\b/u)
  assert.match(impactMap, /title: '适用页面'/u)
  assert.match(impactMap, /title: '页面区域'/u)
  assert.match(impactMap, /title: '可用操作'/u)
  assert.match(impactMap, /title: '使用限制'/u)
  assert.match(content, /label: '最终有效权限'/u)
})

test('权限中心账号动作统一 account_status 三态并提供可聚焦受限原因', () => {
  const filePath = join(rootDir, 'pages/PermissionCenterPage.jsx')
  const content = readFileSync(filePath, 'utf8')

  assert.match(content, /dataIndex: 'account_status'/u)
  assert.doesNotMatch(content, /dataIndex: 'disabled'/u)
  assert.match(content, /ADMIN_ACCOUNT_STATUS\.ACTIVE/u)
  assert.match(content, /ADMIN_ACCOUNT_STATUS\.SUSPENDED/u)
  assert.match(content, /ADMIN_ACCOUNT_STATUS\.REVOKED/u)
  assert.match(content, /操作受限：\{operationBlockReasons\.join\('；'\)\}/u)
  assert.match(content, /role="note" tabIndex=\{0\}/u)
  assert.doesNotMatch(content, /title=\{roleBlockReason/u)
  assert.match(content, /注销不可恢复/u)
  assert.match(content, /必须创建新账号/u)
})

test('权限中心按后端业务元数据收窄角色权限并保留并发冲突草稿', () => {
  const filePath = join(rootDir, 'pages/PermissionCenterPage.jsx')
  const content = readFileSync(filePath, 'utf8')

  assert.match(content, /buildAssignableRoleOptions/u)
  assert.match(content, /filterAssignableBusinessPermissions/u)
  assert.match(content, /getRolePermissionReadOnlyReason/u)
  assert.match(content, /expected_version: nextVersion/u)
  assert.match(content, /RpcErrorCode\.RESOURCE_VERSION_CONFLICT/u)
  assert.match(content, /当前勾选已保留/u)
  assert.match(content, /刷新并保留当前勾选/u)
  assert.match(content, /roleSaveConflict\?\.roleKey === selectedRoleKey/u)
})

test('BOM 页面导出和选中项不把内部 ID 当业务字段', () => {
  const filePath = join(rootDir, 'pages/BOMVersionsPage.jsx')
  const content = readFileSync(filePath, 'utf8')

  assert.doesNotMatch(content, /产品ID/u)
  assert.doesNotMatch(content, /`BOM \$\{record\.id\}`/u)
  assert.match(
    content,
    /referenceLabel\(productOptions, row\.product_id, '产品'\)/u
  )
  assert.match(content, /BOM 已关联/u)
})

test('委外订单表单引用选项缺字段时保留业务可读 fallback', () => {
  const filePath = join(
    rootDir,
    'components/outsourcing-orders/OutsourcingOrderForm.jsx'
  )
  const content = readFileSync(filePath, 'utf8')

  assert.match(content, /供应商已关联/u)
  assert.match(content, /产品已关联/u)
  assert.match(content, /材料已关联/u)
  assert.match(content, /工序已关联/u)
  assert.match(content, /单位已关联/u)
})

test('采购订单表单引用选项缺字段时保留业务可读 fallback', () => {
  const filePath = join(
    rootDir,
    'components/purchase-orders/PurchaseOrderForm.jsx'
  )
  const content = readFileSync(filePath, 'utf8')

  assert.match(content, /供应商已关联/u)
  assert.match(content, /材料已关联/u)
})

test('采购和委外订单行表单初始化保留显式 0 值', () => {
  const purchaseForm = readFileSync(
    join(rootDir, 'components/purchase-orders/PurchaseOrderForm.jsx'),
    'utf8'
  )
  const outsourcingForm = readFileSync(
    join(rootDir, 'components/outsourcing-orders/OutsourcingOrderForm.jsx'),
    'utf8'
  )
  const orderView = readFileSync(
    join(rootDir, 'utils/masterDataOrderView.mjs'),
    'utf8'
  )

  for (const [content, quantityField] of [
    [purchaseForm, 'purchased_quantity'],
    [orderView, 'outsourcing_quantity'],
  ]) {
    assert.match(content, /function optionalFormValue\(value\)/u)
    assert.match(
      content,
      new RegExp(
        `${quantityField}: optionalFormValue\\(item\\.${quantityField}\\)`,
        'u'
      )
    )
    assert.match(content, /unit_price: optionalFormValue\(item\.unit_price\)/u)
    assert.match(content, /amount: optionalFormValue\(item\.amount\)/u)
    assert.doesNotMatch(
      content,
      new RegExp(`${quantityField}: item\\.${quantityField} \\|\\| ''`, 'u')
    )
    assert.doesNotMatch(content, /unit_price: item\.unit_price \|\| ''/u)
    assert.doesNotMatch(content, /amount: item\.amount \|\| ''/u)
  }
  assert.match(outsourcingForm, /label="金额预览"/u)
  assert.match(outsourcingForm, /<Input\s+readOnly/u)
  assert.doesNotMatch(outsourcingForm, /name=\{\[field\.name, 'amount'\]\}/u)
})

test('采购订单生成入库草稿弹窗不把订单 ID 当来源单号 fallback', () => {
  const filePath = join(
    rootDir,
    'components/purchase-orders/PurchaseOrderInboundDraftModal.jsx'
  )
  const content = readFileSync(filePath, 'utf8')

  assert.doesNotMatch(
    content,
    /order\?\.purchase_order_no\s*\|\|\s*order\?\.id/u
  )
  assert.match(content, /采购订单已关联/u)
})

test('来源导入选中摘要不把内部 ID 当业务标签 fallback', () => {
  const sourcePickerPath = join(
    rootDir,
    'components/business-list/SourceImportPickerModal.jsx'
  )
  const salesOrderFormPath = join(
    rootDir,
    'components/sales-orders/SalesOrderForm.jsx'
  )
  const purchaseOrderFormPath = join(
    rootDir,
    'components/purchase-orders/PurchaseOrderForm.jsx'
  )
  const sourcePickerContent = readFileSync(sourcePickerPath, 'utf8')
  const salesOrderContent = readFileSync(salesOrderFormPath, 'utf8')
  const purchaseOrderContent = readFileSync(purchaseOrderFormPath, 'utf8')

  assert.doesNotMatch(sourcePickerContent, /row\.id\s*\|\|/u)
  assert.doesNotMatch(salesOrderContent, /sku\?\.id\s*\|\|/u)
  assert.doesNotMatch(purchaseOrderContent, /material\?\.id\s*\|\|/u)
  assert.match(sourcePickerContent, /记录已关联/u)
  assert.match(salesOrderContent, /SKU 已关联/u)
  assert.match(salesOrderContent, /联系人已关联/u)
  assert.match(purchaseOrderContent, /getSelectedLabel=\{materialLabel\}/u)
})

test('来源导入默认单位列不把 default_unit_id 当可见值', () => {
  const salesOrderFormPath = join(
    rootDir,
    'components/sales-orders/SalesOrderForm.jsx'
  )
  const purchaseOrderFormPath = join(
    rootDir,
    'components/purchase-orders/PurchaseOrderForm.jsx'
  )
  const combined = [salesOrderFormPath, purchaseOrderFormPath]
    .map((filePath) => readFileSync(filePath, 'utf8'))
    .join('\n')

  assert.doesNotMatch(
    combined,
    /\{\s*title:\s*'默认单位',\s*dataIndex:\s*'default_unit_id'/u
  )
  assert.match(combined, /function sourceDefaultUnitText/u)
  assert.match(
    combined,
    /sourceDefaultUnitText\(unitOptions, sku\.default_unit_id\)/u
  )
  assert.match(
    combined,
    /sourceDefaultUnitText\(unitOptions, material\.default_unit_id\)/u
  )
  assert.match(combined, /'单位已关联'/u)
})

test('采购入库和质量检验选中标签不把内部 ID 当业务单号 fallback', () => {
  const purchaseReceiptPath = join(rootDir, 'pages/V1PurchaseReceiptsPage.jsx')
  const qualityInspectionPath = join(
    rootDir,
    'pages/V1QualityInspectionsPage.jsx'
  )
  const purchaseReceiptContent = readFileSync(purchaseReceiptPath, 'utf8')
  const qualityInspectionContent = readFileSync(qualityInspectionPath, 'utf8')

  assert.doesNotMatch(
    purchaseReceiptContent,
    /selectedRow\.receipt_no\s*\|\|\s*selectedRow\.id/u
  )
  assert.doesNotMatch(
    qualityInspectionContent,
    /selectedRow\.inspection_no\s*\|\|\s*selectedRow\.id/u
  )
  assert.match(purchaseReceiptContent, /采购入库单已关联/u)
  assert.match(qualityInspectionContent, /质量检验单已关联/u)
})

test('质量检验原批次状态不把批次状态 key 当用户可见 fallback', () => {
  const filePath = join(
    rootDir,
    'components/quality-inspections/qualityInspectionColumns.jsx'
  )
  const content = readFileSync(filePath, 'utf8')

  assert.match(content, /function lotStatusText/u)
  assert.match(
    content,
    /原批次状态 \$\{lotStatusText\(record\.original_lot_status\)\}/u
  )
  assert.doesNotMatch(content, /render:\s*\(value\)\s*=>\s*value \|\| '-'/u)
  assert.doesNotMatch(content, /原批次状态 \$\{record\.original_lot_status\}/u)
})

test('库存台账引用列不把内部 ID 当来源单号或对象编号 fallback', () => {
  const filePath = join(rootDir, 'pages/V1InventoryLedgerPage.jsx')
  const content = readFileSync(filePath, 'utf8')

  assert.doesNotMatch(content, /function internalRef/u)
  assert.doesNotMatch(content, /dataIndex:\s*'source_type'/u)
  assert.doesNotMatch(content, /dataIndex:\s*'source_id'/u)
  assert.doesNotMatch(
    content,
    /exportValue:\s*\(record\)\s*=>\s*record\?\.source_id/u
  )
  assert.doesNotMatch(content, /render:\s*\(value\)\s*=>\s*value/u)
  assert.match(content, /function linkedBusinessRef/u)
  assert.match(content, /function formatSourceDocumentRef/u)
  const sourceDocumentRefBody =
    content.match(/function formatSourceDocumentRef[\s\S]*?\n\}/u)?.[0] || ''
  assert.match(sourceDocumentRefBody, /'未提供业务单号'/u)
  assert.doesNotMatch(sourceDocumentRefBody, /source_id/u)
  assert.doesNotMatch(
    content,
    /linkedBusinessRef\('来源单据', record\.source_id\)/u
  )
  assert.match(content, /function canOpenSourceDocument/u)
  assert.match(
    content,
    /linkedBusinessRef\(\s*subjectTypeText\(record\?\.subject_type\) \|\| '存货'/u
  )
  assert.match(content, /relationRef\('来源明细', record\?\.source_line_id\)/u)
})

test('库存台账按真实 SKU grain 查询并区分未分规格库存', () => {
  const filePath = join(rootDir, 'pages/V1InventoryLedgerPage.jsx')
  const content = readFileSync(filePath, 'utf8')

  assert.match(content, /product_sku_id:\s*productSkuID \|\| undefined/u)
  assert.match(content, /listProductSKUs/u)
  assert.match(content, /dataIndex:\s*'product_sku_id'/u)
  assert.match(content, /return '未分规格'/u)
  assert.match(content, /disabled=\{subjectType !== 'PRODUCT'\}/u)
  assert.match(
    content,
    /listProductSKUs\(\s*\{\s*limit:\s*500\s*\}/u,
    '库存历史台账应加载停用 SKU 引用，保证旧规格库存仍可读和可筛选'
  )
  assert.doesNotMatch(content, /product_sku_id:\s*subjectID/u)
})

test('路由来源筛选标签使用业务口径并可按上下文单独清除', () => {
  const inventoryLedgerContent = readFileSync(
    join(rootDir, 'pages/V1InventoryLedgerPage.jsx'),
    'utf8'
  )
  const operationalFactsContent = readFileSync(
    join(rootDir, 'pages/OperationalFactsPage.jsx'),
    'utf8'
  )
  const shipmentsContent = readFileSync(
    join(rootDir, 'pages/ShipmentsPage.jsx'),
    'utf8'
  )
  const purchaseReceiptsContent = readFileSync(
    join(rootDir, 'pages/V1PurchaseReceiptsPage.jsx'),
    'utf8'
  )
  const qualityInspectionsContent = readFileSync(
    join(rootDir, 'pages/V1QualityInspectionsPage.jsx'),
    'utf8'
  )

  assert.match(
    inventoryLedgerContent,
    /已按\{sourceTypeText\(routeSourceType\)\}筛选/u
  )
  assert.match(
    inventoryLedgerContent,
    /clearRouteContext\(\['source_type', 'source_id'\]\)/u
  )
  assert.match(inventoryLedgerContent, /clearRouteContext\(\['lot_id'\]\)/u)

  assert.match(
    operationalFactsContent,
    /已按\{sourceTypeLabel\(routeSourceType\)\}筛选/u
  )
  assert.match(
    operationalFactsContent,
    /clearRouteContext\(\['sales_order_id'\]\)/u
  )
  assert.match(
    operationalFactsContent,
    /clearRouteContext\(\['source_type', 'source_id'\]\)/u
  )

  assert.match(shipmentsContent, /clearRouteContext\(\['sales_order_id'\]\)/u)
  assert.match(
    shipmentsContent,
    /clearRouteContext\(\['shipment_id', 'source_type', 'source_id'\]\)/u
  )
  assert.match(
    purchaseReceiptsContent,
    /clearRouteContext\(\['purchase_order_id'\]\)/u
  )
  assert.match(
    purchaseReceiptsContent,
    /clearRouteContext\(\['receipt_id', 'source_type', 'source_id'\]\)/u
  )
  assert.match(
    qualityInspectionsContent,
    /clearRouteContext\(\['purchase_order_id'\]\)/u
  )
  assert.match(
    qualityInspectionsContent,
    /clearRouteContext\(\['purchase_receipt_id'\]\)/u
  )
})

test('Workflow 任务列不把 task_status_key / owner_role_key 作为用户可见列字段', () => {
  const workflowModulePath = join(
    rootDir,
    'pages/WorkflowBusinessModulePage.jsx'
  )
  const dashboardPath = join(rootDir, 'pages/DashboardPage.jsx')
  const dashboardTaskDisplayPath = join(
    rootDir,
    'utils/dashboardTaskDisplay.mjs'
  )
  const workflowModuleContent = readFileSync(workflowModulePath, 'utf8')
  const dashboardContent = readFileSync(dashboardPath, 'utf8')
  const dashboardTaskDisplayContent = readFileSync(
    dashboardTaskDisplayPath,
    'utf8'
  )

  assert.doesNotMatch(workflowModuleContent, /dataIndex:\s*'task_status_key'/u)
  assert.doesNotMatch(workflowModuleContent, /key:\s*'task_status_key'/u)
  assert.doesNotMatch(workflowModuleContent, /dataIndex:\s*'owner_role_key'/u)
  assert.doesNotMatch(workflowModuleContent, /key:\s*'owner_role_key'/u)
  assert.doesNotMatch(dashboardContent, /dataIndex:\s*'task_status_key'/u)
  assert.doesNotMatch(dashboardContent, /key:\s*'task_status_key'/u)
  assert.doesNotMatch(dashboardContent, /dataIndex:\s*'owner_role_key'/u)
  assert.doesNotMatch(dashboardContent, /key:\s*'owner_role_key'/u)
  assert.doesNotMatch(workflowModuleContent, /function formatTaskSource/u)
  assert.doesNotMatch(
    workflowModuleContent,
    /task\.source_no\) return task\.source_no/u
  )
  assert.match(workflowModuleContent, /formatWorkflowTaskSource/u)
  assert.match(dashboardTaskDisplayContent, /resolveReadableWorkflowSourceNo/u)
  assert.match(dashboardTaskDisplayContent, /isInternalWorkflowDocumentRef/u)
  assert.doesNotMatch(
    dashboardTaskDisplayContent,
    /function isInternalSourceNoFallback/u
  )
  assert.doesNotMatch(dashboardTaskDisplayContent, /`TASK-\$\{task\.id/u)
})

test('业务可见文案不暴露架构状态机术语', () => {
  const violations = []
  const files = []
  for (const dir of scanDirs) {
    if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) continue
    files.push(...collectSourceFiles(dir))
  }
  for (const filePath of businessVisibleConfigFiles) {
    if (statSync(filePath, { throwIfNoEntry: false })?.isFile()) {
      files.push(filePath)
    }
  }

  for (const filePath of files) {
    const content = readFileSync(filePath, 'utf8')
    for (const text of forbiddenBusinessArchitectureText) {
      if (content.includes(text)) {
        violations.push(`${relative(rootDir, filePath)}: ${text}`)
      }
    }
  }

  assert.deepEqual(violations, [])
})

test('正式业务边界文案不展示后端实现术语', () => {
  const files = [
    'pages/PermissionCenterPage.jsx',
    'pages/DashboardPage.jsx',
    'pages/V1OperationalFactPage.jsx',
    'pages/OperationalFactsPage.jsx',
    'pages/V1OutsourcingOrdersPage.jsx',
    'pages/V1PurchaseOrdersPage.jsx',
    'pages/V1PurchaseReceiptsPage.jsx',
    'pages/V1QualityInspectionsPage.jsx',
    'pages/BOMVersionsPage.jsx',
    'pages/V1InventoryLedgerPage.jsx',
    'pages/EngineeringPrintWorkspacePage.jsx',
    'pages/ProcessingContractPrintWorkspacePage.jsx',
    'pages/ShipmentsPage.jsx',
    'pages/WorkflowBusinessModulePage.jsx',
    'pages/PrintCenterPage.jsx',
    'pages/PrintTemplatePreviewPage.jsx',
    'config/businessModules.mjs',
    'config/dashboardModules.mjs',
    'config/printTemplates.mjs',
    'data/processingContractTemplate.mjs',
    'components/operational-facts/operationalFactPageConfig.mjs',
    'components/operational-facts/OperationalFactForms.jsx',
    'components/business-list/BusinessAttachmentPanel.jsx',
    'components/sales-orders/SalesOrderBusinessModal.jsx',
    'components/sales-orders/salesOrderPageConfig.mjs',
    'components/purchase-orders/PurchaseOrderBusinessModal.jsx',
    'components/purchase-orders/purchaseOrderPageConfig.mjs',
    'components/purchase-orders/PurchaseOrderInboundDraftModal.jsx',
    'components/purchase-orders/PurchaseOrderForm.jsx',
    'components/outsourcing-orders/outsourcingOrderPageConfig.mjs',
    'components/master-data/masterDataPageConfig.mjs',
    'components/master-data/MasterDataForm.jsx',
    'components/print/MaterialPurchaseContractWorkbench.jsx',
    'components/shipments/ShipmentBusinessModal.jsx',
    'components/workflow/WorkflowTaskActionDrawer.jsx',
  ].map((file) => join(rootDir, file))
  const combined = files
    .map((filePath) => readFileSync(filePath, 'utf8'))
    .join('\n')

  for (const staleVisibleText of [
    'RBAC：',
    '领域 usecase',
    '后端 usecase',
    'operational_fact 后端 usecase',
    'finance_facts 后端 usecase',
    '领域 API',
    'API 和 RBAC',
    'Source Document：',
    'Operational Fact：',
    'RECEIVABLE 业务事实',
    'PAYABLE 业务事实',
    'INVOICE 业务事实',
    'RECONCILIATION 业务事实',
    'finance_facts 的',
    'Workflow / Fact',
    'Workflow V1',
    'QualityUsecase',
    '后端业务规则',
    '后端财务规则',
    '后端采购入库规则',
    '后端协同任务规则',
    '只调用后端',
    '纸面 DOM',
    '当前主链路',
    '尚未接入 PDF',
    '前端不本地',
    '不写事实层',
    '源单：加工合同',
    '委外源单',
    '库存出库事实',
    '入库单：入库事实',
    '接口动作能力',
    '受保护页面和接口',
    '后台接口统一按权限码控制',
    '不在此写出货、库存或财务事实',
    '销售订单源单',
    '不替代采购入库、退货、质检或应付事实',
    '不在此写库存、质检或应付事实',
    '附件不替代采购订单事实',
    '不会自动写入库、质检、库存或财务事实',
    '采购订单源单',
    '不会自动写发料、回货、库存或财务事实',
    '合同源单',
    '对应事实模块',
    '不写库存、采购或成本事实',
    '附件不写库存、采购或成本事实',
    '本页不写库存事实',
    '产品归属使用 product_id',
    '不生成订单、出货、库存或财务事实',
    '生产事实已关联',
    '委外事实已关联',
    '财务事实已关联',
    '业务事实已关联',
    '业务事实状态',
    '客户快照',
    '材料编码快照',
    '材料名称快照',
    '颜色快照',
    '当前图片快照',
    '合同快照已有确认金额',
  ]) {
    assert.doesNotMatch(combined, new RegExp(staleVisibleText, 'u'))
  }

  for (const readableText of [
    '根据已选功能预览这个岗位可进入的页面',
    '系统按业务规则',
    '正式业务记录',
    '系统过账 / 撤销调整',
    '业务单据：加工合同',
    '实际出货记录',
    '库存出库记录',
    '待办任务：入库跟进',
    '入库单：正式入库记录',
    '作业草稿只有过账后才会形成库存变动',
    '单据客户名称',
    '下单材料编码',
  ]) {
    assert.match(combined, new RegExp(readableText, 'u'))
  }
})

test('出货和入库正式页头不展示底层表名或状态 key', () => {
  const shipmentPageContent = readFileSync(
    join(rootDir, 'pages/ShipmentsPage.jsx'),
    'utf8'
  )
  const purchaseReceiptPageContent = readFileSync(
    join(rootDir, 'pages/V1PurchaseReceiptsPage.jsx'),
    'utf8'
  )

  for (const staleShipmentHeaderPattern of [
    /description="[^"]*shipments \/ shipment_items/u,
    /description="[^"]*SHIPPED/u,
    /description="[^"]*inventory_txns\.OUT/u,
  ]) {
    assert.doesNotMatch(shipmentPageContent, staleShipmentHeaderPattern)
  }
  for (const stalePurchaseReceiptHeaderPattern of [
    /description="[^"]*purchase_receipts \/ purchase_receipt_items/u,
    /description="[^"]*Workflow/u,
    />\s*Workflow：协同入库/u,
    />\s*PurchaseReceipt：入库事实/u,
    />\s*过账后写 inventory_txns/u,
  ]) {
    assert.doesNotMatch(
      purchaseReceiptPageContent,
      stalePurchaseReceiptHeaderPattern
    )
  }

  for (const readableShipmentHeaderText of [
    '出货单维护出货信息和明细',
    '库存出库记录',
  ]) {
    assert.match(
      shipmentPageContent,
      new RegExp(readableShipmentHeaderText, 'u')
    )
  }
  for (const readablePurchaseReceiptHeaderText of [
    '从已审核采购订单生成的入库草稿',
    '不提供脱离采购来源的手工入库明细',
    '待办任务：入库跟进',
    '入库单：正式入库记录',
    '过账后更新库存记录',
  ]) {
    assert.match(
      purchaseReceiptPageContent,
      new RegExp(readablePurchaseReceiptHeaderText, 'u')
    )
  }
})

test('正式质量页和业务模块文案不暴露内部表名', () => {
  const qualityInspectionPageContent = readFileSync(
    join(rootDir, 'pages/V1QualityInspectionsPage.jsx'),
    'utf8'
  )
  const businessModulesContent = readFileSync(
    join(rootDir, 'config/businessModules.mjs'),
    'utf8'
  )

  for (const staleQualityHeaderPattern of [
    /description="[^"]*quality_inspections/u,
    /description="[^"]*HOLD/u,
    /description="[^"]*ACTIVE/u,
    /description="[^"]*REJECTED/u,
    />\s*SUBMITTED：/u,
    />\s*PASSED：/u,
    />\s*REJECTED：/u,
  ]) {
    assert.doesNotMatch(qualityInspectionPageContent, staleQualityHeaderPattern)
  }

  for (const readableQualityHeaderText of [
    '质量检验集中办理采购到货',
    '已提交：等待判定',
    '通过：按来源规则继续',
    '不合格：阻止对应后续',
  ]) {
    assert.match(
      qualityInspectionPageContent,
      new RegExp(readableQualityHeaderText, 'u')
    )
  }

  for (const staleVisibleConfigText of [
    '表入口',
    'Source Document',
    'Business Commitment',
    'quality_inspections 判定',
    'warehouse_inbound done',
    'purchase_receipt posted',
    '库存 OUT',
    'REVERSAL',
    '真实 shipped',
    'operational facts 内部入口',
  ]) {
    assert.doesNotMatch(
      businessModulesContent,
      new RegExp(staleVisibleConfigText, 'u')
    )
  }
})

test('普通业务页面不默认展示系统创建更新时间', () => {
  const violations = []
  for (const dir of businessVisibleScanDirs) {
    if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) continue
    for (const filePath of collectSourceFiles(dir)) {
      const content = readFileSync(filePath, 'utf8')
      for (const text of forbiddenBusinessSystemTimestampText) {
        if (content.includes(text)) {
          violations.push(`${relative(rootDir, filePath)}: ${text}`)
        }
      }
    }
  }

  assert.deepEqual(violations, [])
})

test('业务可见属性不直接展示 snake_case 技术字段名', () => {
  const violations = []
  const files = []
  for (const dir of scanDirs) {
    if (!statSync(dir, { throwIfNoEntry: false })?.isDirectory()) continue
    files.push(
      ...collectSourceFiles(dir).filter((filePath) => {
        const fileName = filePath.split('/').pop() || ''
        return !/^Dev/u.test(fileName)
      })
    )
  }
  for (const filePath of [join(rootDir, 'config/businessModules.mjs')]) {
    if (statSync(filePath, { throwIfNoEntry: false })?.isFile()) {
      files.push(filePath)
    }
  }

  for (const filePath of files) {
    const content = readFileSync(filePath, 'utf8')
    for (const match of content.matchAll(visibleStringAttributePattern)) {
      const visibleText = match[2]
      if (technicalSnakeCasePattern.test(visibleText)) {
        violations.push(`${relative(rootDir, filePath)}: ${visibleText}`)
      }
    }
  }

  assert.deepEqual(violations, [])
})

test('销售订单日期字段使用业务可见口径并保留弹窗日期控件', () => {
  const salesOrderFiles = [
    'components/sales-orders/SalesOrderForm.jsx',
    'components/sales-orders/salesOrderColumns.jsx',
    'components/sales-orders/salesOrderPageConfig.mjs',
  ].map((file) => join(rootDir, file))
  const combined = salesOrderFiles
    .map((filePath) => readFileSync(filePath, 'utf8'))
    .join('\n')

  assert.match(combined, /label="签约日期"/u)
  assert.match(combined, /name="order_date"[\s\S]*?<DateInput/u)
  assert.match(combined, /label="计划交付日期"/u)
  assert.match(combined, /name="planned_delivery_date"[\s\S]*?<DateInput/u)
  assert.match(combined, /title: '签约日期'/u)
  assert.match(combined, /title: '计划交付日期'/u)
  assert.match(combined, /label: '签约日期'/u)
  assert.match(combined, /label: '计划交付日期'/u)
  assert.doesNotMatch(combined, /订单日期/u)
  assert.doesNotMatch(combined, /title: '计划交付'/u)
  assert.doesNotMatch(combined, /label: '计划交付'/u)
})

test('业务日期字段使用完整且一致的用户可见口径', () => {
  const businessDateFiles = [
    'components/purchase-orders/PurchaseOrderForm.jsx',
    'components/purchase-orders/purchaseOrderColumns.jsx',
    'components/purchase-orders/purchaseOrderPageConfig.mjs',
    'components/outsourcing-orders/OutsourcingOrderForm.jsx',
    'components/outsourcing-orders/outsourcingOrderColumns.jsx',
    'components/outsourcing-orders/outsourcingOrderPageConfig.mjs',
    'components/shipments/ShipmentBusinessModal.jsx',
    'components/shipments/shipmentColumns.jsx',
    'components/operational-facts/operationalFactPageConfig.mjs',
    'config/businessModules.mjs',
  ].map((file) => join(rootDir, file))
  const combined = businessDateFiles
    .map((filePath) => readFileSync(filePath, 'utf8'))
    .join('\n')

  assert.match(combined, /label="下单日期"/u)
  assert.match(combined, /name="purchase_date"[\s\S]*?<DateInput/u)
  assert.match(combined, /label="预计到货日期"/u)
  assert.match(combined, /name="expected_arrival_date"[\s\S]*?<DateInput/u)
  assert.match(combined, /label="预计回货日期"/u)
  assert.match(combined, /name="expected_return_date"[\s\S]*?<DateInput/u)
  assert.match(combined, /label="计划出货日期"/u)
  assert.match(combined, /title: '计划出货日期 \/ 实际出货日期'/u)
  assert.doesNotMatch(combined, /采购日期/u)
  assert.doesNotMatch(combined, /['"`]预计到货['"`]/u)
  assert.doesNotMatch(combined, /['"`]预计回货['"`]/u)
  assert.doesNotMatch(combined, /['"`]计划出货['"`]/u)
  assert.doesNotMatch(combined, /['"`]实际出货['"`]/u)
  assert.doesNotMatch(combined, /计划 \/ 实际出货/u)
})

test('审计日志页使用业务可读摘要，不展示原始事件结构', () => {
  const filePath = join(rootDir, 'pages/AuditLogsPage.jsx')
  const content = readFileSync(filePath, 'utf8')

  assert.doesNotMatch(content, /原始 payload/u)
  assert.doesNotMatch(content, /payload 判断动作含义/u)
  assert.doesNotMatch(content, /动作或 payload/u)
  assert.doesNotMatch(content, /before\/after/u)
  assert.doesNotMatch(
    content,
    /next:\s*['"`][^'"`]*after\.disabled[^'"`]*['"`]/u
  )
  assert.doesNotMatch(content, /BOOTSTRAP_ADMIN_ONCE/u)
  assert.doesNotMatch(
    content,
    /next:\s*['"`][^'"`]*(?:role_keys|permission_keys)[^'"`]*['"`]/u
  )
  assert.doesNotMatch(content, /<pre>\{formatPayload/u)
  assert.doesNotMatch(content, /<span>\{record\.event_key\}<\/span>/u)
  assert.doesNotMatch(content, /return event\.actor_key \|\|/u)
  assert.doesNotMatch(content, /event\.target_key \|\|/u)
  assert.doesNotMatch(content, /fieldLabelMap\[key\] \|\| key/u)
  assert.doesNotMatch(content, /JSON\.stringify\(value\)/u)
  assert.match(content, /function isTechnicalAuditValueKey/u)
  assert.match(content, /owner_role_key/u)
  assert.match(content, /task_status_key/u)
  assert.match(content, /source_type/u)
  assert.match(content, /source_id/u)
  assert.match(
    content,
    /return isTechnicalAuditValueKey\(key\) \? '已记录' : String\(value\)/u
  )
  assert.match(content, /<Text type="secondary">下一步<\/Text>/u)
  assert.match(content, /placeholder="操作人、相关账号或岗位、操作类型或说明"/u)
  assert.match(content, /<span>\{meta\.label\}<\/span>/u)
  assert.match(content, /event\.target_label \|\| event\.target_name/u)
  assert.match(content, /fieldLabelMap\[key\] \|\| '字段变更'/u)
  assert.match(content, /return '已记录'/u)
})

test('后台布局岗位标签不把 role key 当用户可见文案', () => {
  const filePath = join(rootDir, 'components/ERPLayout.jsx')
  const content = readFileSync(filePath, 'utf8')

  assert.match(content, /role\?\.name \|\|/u)
  assert.match(content, /'已配置岗位'/u)
  assert.doesNotMatch(content, /role\?\.name \|\| role\?\.role_key/u)
  assert.doesNotMatch(content, /role\?\.name \|\| role\?\.key/u)
})

test('岗位展示 helper 默认不把未知 role key 当用户可见 fallback', () => {
  const filePath = join(rootDir, 'utils/roleKeys.mjs')
  const content = readFileSync(filePath, 'utf8')

  assert.match(content, /return normalized \? '已配置岗位' : ''/u)
  assert.doesNotMatch(content, /fallback \|\| normalized/u)
})

test('协同任务面板责任角色不把 owner_role_key 当用户可见 fallback', () => {
  const filePath = join(
    rootDir,
    'components/business-list/CollaborationTaskPanel.jsx'
  )
  const content = readFileSync(filePath, 'utf8')
  const actionDrawerContent = readFileSync(
    join(rootDir, 'components/workflow/WorkflowTaskActionDrawer.jsx'),
    'utf8'
  )
  const workflowPageContent = readFileSync(
    join(rootDir, 'pages/WorkflowBusinessModulePage.jsx'),
    'utf8'
  )

  assert.match(
    content,
    /<Tag>\{getWorkflowTaskOwnerRoleLabel\(task\)\}<\/Tag>/u
  )
  assert.match(
    actionDrawerContent,
    /const ownerRoleLabel = task \? getWorkflowTaskOwnerRoleLabel\(task\) : ''/u
  )
  assert.match(
    workflowPageContent,
    /value: getWorkflowTaskOwnerRoleLabel\(selectedTask\)/u
  )
  assert.doesNotMatch(content, /roleLabelMap/u)
  assert.doesNotMatch(actionDrawerContent, /roleLabelMap/u)
  assert.doesNotMatch(workflowPageContent, /WORKFLOW_ROLE_LABELS/u)
  assert.doesNotMatch(
    content,
    /roleLabels\.get\(task\.owner_role_key\)\s*\|\|\s*getWorkflowTaskOwnerRoleLabel\(task\)/u
  )
  assert.doesNotMatch(content, /\{task\.owner_role_key\}/u)
  assert.doesNotMatch(
    actionDrawerContent,
    /roleLabelMap\?\.get\?\.\(ownerRoleKey\)/u
  )
})

test('移动端任务详情用来源口径，不把所有任务误称为订单或单号', () => {
  const filePath = join(rootDir, 'mobile/components/MobileTaskDetailScreen.jsx')
  const content = readFileSync(filePath, 'utf8')

  assert.match(content, /resolveTaskRelatedSourceLabel\(selectedTask\)/u)
  assert.match(content, /来源：/u)
  assert.match(content, /关联来源（\{relatedDocuments\.length \+ 1\}）/u)
  assert.doesNotMatch(content, /单号：/u)
  assert.doesNotMatch(content, /订单：\{relatedSource\}/u)
  assert.doesNotMatch(content, /关联单据（/u)
})

test('移动端任务办理与回执优先展示动作中文标签而不是 raw action key', () => {
  const actionContent = readFileSync(
    join(rootDir, 'mobile/components/MobileTaskActionScreen.jsx'),
    'utf8'
  )
  const receiptContent = readFileSync(
    join(rootDir, 'mobile/components/MobileTaskReceiptScreen.jsx'),
    'utf8'
  )

  assert.match(actionContent, /resolveMobileActionLabel\(option\.key\)/u)
  assert.match(receiptContent, /resolveMobileActionDisplayLabel\(candidate\)/u)
  assert.match(receiptContent, /\{actionLabel\}/u)
  assert.doesNotMatch(receiptContent, /<dd[^>]*>\s*\{action\}\s*<\/dd>/u)
  assert.doesNotMatch(receiptContent, /mobile_action_label\s*\|\|/u)
})

test('移动端任务详情事实行不把显式 0 当空态', () => {
  const filePath = join(rootDir, 'mobile/components/MobileTaskDetailScreen.jsx')
  const content = readFileSync(filePath, 'utf8')

  assert.match(content, /function mobileFactValueText\(value\)/u)
  assert.match(content, /typeof value === 'string' && value\.trim\(\) === ''/u)
  assert.match(content, /\{mobileFactValueText\(value\)\}/u)
  assert.doesNotMatch(content, /\{value \|\| '-'\}/u)
})

test('移动端任务列表不直接透出 raw due_status_label', () => {
  const listScreen = readFileSync(
    join(rootDir, 'mobile/components/MobileTaskListScreen.jsx'),
    'utf8'
  )
  const taskModel = readFileSync(
    join(rootDir, 'mobile/utils/mobileRoleTaskModel.mjs'),
    'utf8'
  )

  assert.match(listScreen, /resolveMobileTaskDueLabel\(task\)/u)
  assert.doesNotMatch(
    listScreen,
    /task\.due_at_label\s*\|\|\s*task\.due_status_label/u
  )
  assert.match(taskModel, /export function resolveMobileTaskDueLabel/u)
  assert.match(taskModel, /getMobileTaskDueStatusLabel\(dueStatus\)/u)
  assert.doesNotMatch(
    taskModel,
    /task\.alert_label\s*\|\|\s*task\.due_status_label/u
  )
})

test('任务看板来源筛选不把 source_type 原始 key 当选项文案', () => {
  const filePath = join(rootDir, 'pages/DashboardPage.jsx')
  const content = readFileSync(filePath, 'utf8')

  assert.match(content, /getWorkflowTaskSourceTypeLabel/u)
  assert.doesNotMatch(content, /label:\s*sourceType/u)
})

test('任务看板预警模型提供业务来源标签，不要求页面消费 raw source_no', () => {
  const statsPath = join(rootDir, 'utils/workflowDashboardStats.mjs')
  const content = readFileSync(statsPath, 'utf8')

  assert.match(content, /import \{ formatWorkflowTaskSource \}/u)
  assert.match(content, /source_label:\s*formatWorkflowTaskSource\(task\)/u)
  assert.doesNotMatch(content, /source_label:\s*task\.source_no/u)
  assert.doesNotMatch(content, /source_label:\s*`\$\{sourceType\}/u)
})

test('菜单权限标签 helper 不把未知 path 或 role key 当可见 fallback', () => {
  const content = readFileSync(
    join(rootDir, 'config/menuPermissions.mjs'),
    'utf8'
  )

  assert.doesNotMatch(content, /return matched\?\.label \|\| key/u)
  assert.match(
    content,
    /return matched\?\.label \|\| \(key \? '菜单权限' : ''\)/u
  )
  assert.match(
    content,
    /return matched\?\.label \|\| \(key \? '岗位入口' : ''\)/u
  )
})

test('权限中心模块标签不把未知 module key 当可见 fallback', () => {
  const content = readFileSync(
    join(rootDir, 'utils/permissionModuleLabels.mjs'),
    'utf8'
  )

  assert.match(content, /return label \|\| '其他功能'/u)
  assert.doesNotMatch(content, /\$\{normalizedKey\}/u)
  assert.doesNotMatch(content, /:\s*normalizedKey/u)
})

test('Workflow 动作模式不把未知 action key 当可提交或可见 fallback', () => {
  const content = readFileSync(
    join(rootDir, 'utils/workflowTaskActionAccess.mjs'),
    'utf8'
  )

  assert.doesNotMatch(content, /ACTION_MODE_ALIASES/u)
  assert.match(
    content,
    /return WORKFLOW_ACTION_MODE_SET\.has\(key\) \? key : ''/u
  )
})

test('任务派生 source_no 不把内部 ID 当业务来源编号 fallback', () => {
  const files = [
    'utils/purchaseInboundFlow.mjs',
    'utils/outsourceReturnFlow.mjs',
    'utils/finishedGoodsFlow.mjs',
    'utils/shipmentFinanceFlow.mjs',
    'utils/payableReconciliationFlow.mjs',
  ].map((file) => join(rootDir, file))

  for (const filePath of files) {
    const content = readFileSync(filePath, 'utf8')
    const functionBodies = content.match(
      /export function resolve[A-Za-z]+SourceNo\(record = \{\}\) \{[\s\S]*?\n\}/gu
    )
    assert(
      functionBodies?.length > 0,
      `${relative(rootDir, filePath)} missing source no resolver`
    )
    for (const body of functionBodies) {
      assert.doesNotMatch(body, /normalizeText\(record\.id\)/u)
      assert.match(body, /resolveReadableWorkflowSourceNo\(record\)/u)
    }
    const taskCodeBody = content.match(
      /function taskCode\(prefix, record = \{\}, options = \{\}\) \{[\s\S]*?\n\}/u
    )?.[0]
    assert(
      taskCodeBody,
      `${relative(rootDir, filePath)} missing taskCode helper`
    )
    assert.doesNotMatch(taskCodeBody, /normalizeText\(record\.id\)/u)
    assert.match(taskCodeBody, /normalizeText\(record\.document_no\)/u)
    assert.match(taskCodeBody, /normalizeText\(record\.source_no\)/u)
    assert.match(taskCodeBody, /normalizeText\(record\.title\)/u)
    assert.match(taskCodeBody, /'no-readable-ref'/u)
  }
})

test('产品档案用业务文案展示单重并在默认单位变化后清除残值', () => {
  const formSource = readFileSync(
    join(rootDir, 'components/master-data/MasterDataForm.jsx'),
    'utf8'
  )
  const columnSource = readFileSync(
    join(rootDir, 'components/master-data/masterDataColumns.jsx'),
    'utf8'
  )
  const pageSource = readFileSync(
    join(rootDir, 'pages/V1MasterDataPage.jsx'),
    'utf8'
  )

  assert.match(formSource, /label="产品单重（净重）"/u)
  assert.match(formSource, /<FieldWithUnitSuffix/u)
  assert.match(formSource, /unitText="克"/u)
  assert.doesNotMatch(formSource, /addonAfter=/u)
  assert.match(columnSource, /title:\s*'产品单重（净重）'/u)
  assert.match(columnSource, /formatProductUnitNetWeight\(/u)
  assert.match(
    pageSource,
    /recordForm\.setFieldValue\('unit_net_weight_g', undefined\)/u
  )
  assert.match(pageSource, /onValuesChange=\{handleRecordValuesChange\}/u)
})

test('业务状态和类型列不把未知枚举 raw key 作为用户可见 fallback', () => {
  const files = [
    'components/operational-facts/OperationalFactForms.jsx',
    'components/operational-facts/operationalFactPageConfig.mjs',
    'components/sales-orders/salesOrderColumns.jsx',
    'components/purchase-orders/purchaseOrderColumns.jsx',
    'components/outsourcing-orders/outsourcingOrderColumns.jsx',
    'components/StatusPill.jsx',
    'pages/V1InventoryLedgerPage.jsx',
    'pages/V1PurchaseReceiptsPage.jsx',
    'pages/BOMVersionsPage.jsx',
    'pages/DevCustomerConfigPage.jsx',
    'components/bom/BOMVersionColumns.jsx',
    'components/quality-inspections/qualityInspectionColumns.jsx',
    'components/shipments/shipmentColumns.jsx',
    'components/master-data/masterDataColumns.jsx',
    'utils/masterDataOrderView.mjs',
    'utils/mobileTaskView.mjs',
  ].map((file) => join(rootDir, file))
  const combined = files
    .map((filePath) => readFileSync(filePath, 'utf8'))
    .join('\n')

  for (const rawFallback of [
    /STATUS_LABELS\[key\]\s*\|\|\s*key/u,
    /BOM_STATUS_LABELS\[key\]\s*\|\|\s*key/u,
    /BOM_STATUS_LABELS\[row\.status\]\s*\|\|\s*row\.status/u,
    /BOM_STATUS_LABELS\[record\.status\]\s*\|\|\s*record\.status/u,
    /QUALITY_STATUS_LABELS\[key\]\s*\|\|\s*key/u,
    /QUALITY_RESULT_LABELS\[key\]\s*\|\|\s*key/u,
    /SHIPMENT_STATUS_LABELS\[key\]\s*\|\|\s*key/u,
    /SHIPMENT_STATUS_LABELS\[record\.status\]\s*\|\|\s*record\.status/u,
    /SUBJECT_TYPE_LABELS\[key\]\s*\|\|\s*key/u,
    /LOT_STATUS_LABELS\[key\]\s*\|\|\s*key/u,
    /TXN_TYPE_LABELS\[key\]\s*\|\|\s*key/u,
    /FINANCE_COLLECTION_TYPE_LABELS\[value\]\s*\|\|\s*value/u,
    /FINANCE_PAYMENT_TERM_LABELS\[value\]\s*\|\|\s*value/u,
    /FINANCE_INVOICE_CATEGORY_LABELS\[value\]\s*\|\|\s*value/u,
    /SUPPLIER_TYPE_LABELS\[value\]\s*\|\|\s*value/u,
    /SUPPLIER_TYPE_LABELS\[record\?\.supplier_type\]\s*\|\|\s*record\?\.supplier_type/u,
    /STATUS_LABELS\[record\?\.status\]\s*\|\|\s*record\?\.status/u,
    /QUALITY_STATUS_LABELS\[record\?\.status\]\s*\|\|\s*record\?\.status/u,
    /QUALITY_RESULT_LABELS\[record\?\.result\]\s*\|\|\s*record\?\.result/u,
    /SHIPMENT_STATUS_LABELS\[record\?\.status\]\s*\|\|\s*record\?\.status/u,
    /LOT_STATUS_LABELS\[row\.status\]\s*\|\|\s*row\.status/u,
    /STATUS_LABELS\[status\]\s*\|\|\s*status/u,
    /STATUS_LABELS\[normalizedStatus\]\s*\|\|\s*normalizedStatus/u,
    /DUE_STATUS_LABELS\[dueStatus\]\s*\|\|\s*dueStatus/u,
    /STATUS_OPTIONS\.find\(\(item\) => item\.value === record\.business_status\)[\s\S]*?\?\.label\s*\|\|\s*record\.business_status/u,
    /return labels\[key\]\s*\|\|\s*key\s*\|\|\s*'-'/u,
  ]) {
    assert.doesNotMatch(combined, rawFallback)
  }

  assert.match(combined, /return labels\[key\] \|\| fallback/u)
  for (const visibleFallback of [
    '业务状态',
    '收款分类',
    '账期',
    '发票类别',
    '对象',
    '批次状态',
    '库存变动',
    '入库状态',
    'BOM 状态',
    '质检状态',
    '质检结果',
    '出货状态',
    '供应商类型',
    '到期状态',
  ]) {
    assert.match(combined, new RegExp(visibleFallback, 'u'))
  }
})

test('__dev/customer-config 边界列表不把 raw key 当可见 fallback', () => {
  const filePath = join(rootDir, 'pages/DevCustomerConfigPage.jsx')
  const content = readFileSync(filePath, 'utf8')

  assert.match(content, /function guardItemLabel\(item, fallbackLabel\)/u)
  assert.match(content, /guardItemLabel\(item, '字段编号边界'\)/u)
  assert.match(content, /guardItemLabel\(item, '客户配置包边界'\)/u)
  assert.doesNotMatch(content, /item\.label\s*\|\|\s*item\.key/u)
})

test('应付协同任务相关单据不把质检 raw key 拼成可见结果', () => {
  const content = readFileSync(
    join(rootDir, 'utils/payableReconciliationFlow.mjs'),
    'utf8'
  )

  assert.doesNotMatch(content, /IQC 结果：\$\{payload\.iqc_result\}/u)
  assert.doesNotMatch(content, /检验结果：\$\{payload\.qc_result\}/u)
  assert.match(content, /function qualityResultLabel\(value\)/u)
  assert.match(content, /QUALITY_RESULT_LABELS\[key\] \|\| '质检已记录'/u)
})

test('成品任务相关单据不把抽检 raw key 拼成可见结果', () => {
  const content = readFileSync(
    join(rootDir, 'utils/finishedGoodsFlow.mjs'),
    'utf8'
  )

  assert.doesNotMatch(content, /成品抽检结果：\$\{options\.qcResult\}/u)
  assert.match(content, /function finishedGoodsQcResultLabel\(value\)/u)
  assert.match(
    content,
    /FINISHED_GOODS_QC_RESULT_LABELS\[key\] \|\| '抽检已记录'/u
  )
})

test('移动任务相关单据结果类文案不原样透传 raw key', () => {
  const content = readFileSync(
    join(rootDir, 'utils/mobileTaskView.mjs'),
    'utf8'
  )

  assert.doesNotMatch(
    content,
    /return value\.filter\(Boolean\)\.map\(String\)/u
  )
  assert.match(content, /function normalizeRelatedDocumentText\(value\)/u)
  assert.match(content, /RELATED_DOCUMENT_RESULT_LABELS\[key\]/u)
  assert.match(content, /relatedDocumentResultFallback\(prefix\)/u)
})

test('加工合同打印追溯不把底层 type 和内部 ID 当可见备注', () => {
  const filePath = join(rootDir, 'data/processingContractTemplate.mjs')
  const content = readFileSync(filePath, 'utf8')

  assert.doesNotMatch(content, /事实类型/u)
  assert.doesNotMatch(content, /业务事实/u)
  assert.doesNotMatch(content, /#\$\{subjectID\}/u)
  assert.doesNotMatch(content, /#\$\{sourceID\}/u)
  assert.match(
    content,
    /PROCESSING_FACT_TYPE_LABELS\[factType\] \|\| '业务来源已关联'/u
  )
  assert.match(content, /subjectNo \|\| '已关联'/u)
  assert.match(content, /sourceNo \|\| '来源单据已关联'/u)
  assert.match(content, /业务来源:/u)
  assert.match(content, /产品 \/ 材料：/u)
  assert.match(content, /来源单据:/u)
})

test('打印工作台字段表不把显式 0 当空态', () => {
  const filePath = join(rootDir, 'components/print/PrintWorkspaceShell.jsx')
  const content = readFileSync(filePath, 'utf8')

  assert.match(
    content,
    /import \{ renderPrintValue \} from '\.\/printValue\.mjs'/u
  )
  assert.match(
    content,
    /\$\{row\.label \?\? ''\} \$\{row\.value \?\? ''\} \$\{row\.key \?\? ''\}/u
  )
  assert.match(content, /renderPrintValue\(row\.value, '-'\)/u)
  assert.doesNotMatch(content, /row\.value\s*\|\|\s*'-'/u)
  assert.doesNotMatch(content, /row\.value\s*\|\|\s*''/u)
})
