import assert from 'node:assert/strict'
import test from 'node:test'
import { getCustomerPackage, getCustomerPackageSourcePath } from '../../../../../config/customers/index.mjs'
import { yoyoosunFieldNumberingConfig } from '../../../../../config/customers/yoyoosun/fieldNumberingConfig.mjs'
import { yoyoosunMenuConfig } from '../../../../../config/customers/yoyoosun/menuConfig.mjs'
import { buildCustomerConfigDevOverviewFromSearch } from '../../config/devCustomerConfig.mjs'
import { buildCustomerConfigDeclarationExport } from './customerConfigDeclarationExport.mjs'
import { buildCustomerConfigDeclarationPreview } from './customerConfigDeclarationPreview.mjs'
import { resolveCustomerConfigLocation } from './navigation.mjs'

test('永绅配置 JSON 按实际文件路径保留键和值，区分未声明和空数组', () => {
  const customerKey = 'yoyoosun'
  const packagePath = getCustomerPackageSourcePath(customerKey)
  const { filename, json } = buildCustomerConfigDeclarationExport(customerKey)
  const decoded = JSON.parse(json)
  assert.equal(filename, 'yoyoosun-配置声明.json')
  assert.deepEqual(decoded, {
    [packagePath]: getCustomerPackage(customerKey),
    'config/customers/yoyoosun/menuConfig.mjs': yoyoosunMenuConfig,
    'config/customers/yoyoosun/fieldNumberingConfig.mjs': yoyoosunFieldNumberingConfig,
  })
  assert.equal(Object.hasOwn(decoded[packagePath], 'moduleStates'), false)
  assert.deepEqual(decoded[packagePath].extensionPoints, [])
})

test('工程参考包只导出自身声明，保留布尔值和空数组', () => {
  const customerKey = 'reference-customer'
  const packagePath = getCustomerPackageSourcePath(customerKey)
  const { filename, json } = buildCustomerConfigDeclarationExport(customerKey)
  const decoded = JSON.parse(json)
  assert.equal(filename, 'reference-customer-配置声明.json')
  assert.deepEqual(decoded, { [packagePath]: getCustomerPackage(customerKey) })
  assert.equal(decoded[packagePath].fieldPolicyOverrides[0].visible, false)
  assert.deepEqual(decoded[packagePath].processPolicies, [])
  assert.throws(() => buildCustomerConfigDeclarationExport('missing-customer'), /客户配置包未登记/u)
})

test('JSONC 预览按实际记录标注字段所在行，保留原 JSON 的键、值和排版', () => {
  const overview = buildCustomerConfigDevOverviewFromSearch('customer=yoyoosun')
  const { json } = buildCustomerConfigDeclarationExport(overview.customerKey)
  const { lines: annotated } = buildCustomerConfigDeclarationPreview(overview, json)
  const source = (lines) => lines.map(({ line }) => line).join('\n')
  const commentOn = (lines, field, after = '') => {
    const start = lines.findIndex(({ line }) => line.includes(after))
    assert(start >= 0)
    return lines.slice(start).find(({ line }) => line.includes(field))?.comment
  }
  assert.equal(source(annotated), json)
  assert.match(annotated[2].line, /"customerKey": "yoyoosun"/u)
  assert.match(annotated[2].comment, /^客户标识/u)
  assert.match(commentOn(annotated, '"buyerCompany": "永绅"', '"templateKey": "material-purchase-contract"'), /^采购合同/u)
  assert.match(commentOn(annotated, '"buyerCompany": "永绅"', '"templateKey": "processing-contract"'), /^加工合同/u)
  assert.match(commentOn(annotated, '"decision": "manual_review_required"'), /^跳过策略。可选评审未配置时，进入人工评审。/u)
  assert.equal(commentOn(annotated, '"extensionPoints": []'), '这个客户包目前没有登记扩展。')
  assert.match(commentOn(annotated, '"brandMark": "永"'), /^品牌简称。/u)
  assert.match(commentOn(annotated, '"decision": "review_required"'), /^客户编码。待客户确认/u)
  assert.equal(annotated.some(({ line, comment }) => line.includes('"moduleStates"') || comment?.startsWith('生产订单。')), false)

  const reference = buildCustomerConfigDevOverviewFromSearch('customer=reference-customer')
  const { json: referenceJson } = buildCustomerConfigDeclarationExport(reference.customerKey)
  const { lines: annotatedReference } = buildCustomerConfigDeclarationPreview(reference, referenceJson)
  assert.equal(source(annotatedReference), referenceJson)
  assert.match(commentOn(annotatedReference, '"visible": false', '"fieldKey": "supplier_type"'), /供应商分类。隐藏/u)
  assert.equal(annotatedReference.some(({ line, comment }) => line.includes('"brandMark"') || comment?.includes('可选评审未配置时')), false)
})

test('声明表格保留实际值、源文件与数组位置，定位到同一份 JSON', () => {
  const overview = buildCustomerConfigDevOverviewFromSearch('customer=yoyoosun')
  const { json } = buildCustomerConfigDeclarationExport(overview.customerKey)
  const document = JSON.parse(json)
  const { lines, rows, sources } = buildCustomerConfigDeclarationPreview(overview, json)
  const buyers = rows.filter(({ path }) => path.endsWith('.buyerCompany'))
  assert.deepEqual(sources, Object.keys(document))
  assert.deepEqual(buyers.map(({ sourcePath, path, conditions, value }) => ({ sourcePath, path, conditions, value })), [
    {
      sourcePath: overview.customerPackageSummary.sourcePath,
      path: 'printTemplateDefaults[0].partyDefaults.buyerCompany',
      conditions: ['templateKey = material-purchase-contract'],
      value: '"永绅"',
    },
    {
      sourcePath: overview.customerPackageSummary.sourcePath,
      path: 'printTemplateDefaults[1].partyDefaults.buyerCompany',
      conditions: ['templateKey = processing-contract'],
      value: '"永绅"',
    },
  ])
  assert.notEqual(buyers[0].lineIndex, buyers[1].lineIndex)
  assert.match(lines[buyers[0].lineIndex].comment, /^采购合同/u)
  assert.match(lines[buyers[1].lineIndex].comment, /^加工合同/u)
  assert(rows.some(({ path, value }) => path.endsWith('.buyerPhone') && value === '""'))
  assert(rows.some(({ path, value }) => path === 'extensionPoints' && value === '[]'))
  assert(rows.some(({ path, value }) => path === 'desktopMenu.routeOnlyItemKeys' && JSON.parse(value).includes('production-scheduling')))
  assert.equal(rows.some(({ path }) => path.startsWith('moduleStates')), false)

  const reference = buildCustomerConfigDevOverviewFromSearch('customer=reference-customer')
  const { json: referenceJson } = buildCustomerConfigDeclarationExport(reference.customerKey)
  const referencePreview = buildCustomerConfigDeclarationPreview(reference, referenceJson)
  const visibility = referencePreview.rows.find(({ path }) => path === 'fieldPolicyOverrides[0].visible')
  assert.equal(visibility.value, 'false')
  assert.deepEqual(visibility.conditions, ['surfaceKey = suppliers.default', 'fieldKey = supplier_type'])
  assert.match(referencePreview.lines[visibility.lineIndex].line, /"visible": false/u)
})

test('配置 JSON 深链保留核对页签及客户，其他任务清除 JSON 面板', () => {
  const query = 'customer=reference-customer&view=preflight&section=flow&detail=export'
  const review = resolveCustomerConfigLocation(query)
  assert.equal(review.activeDetail, 'export')
  assert.equal(review.activeSection, 'flow')
  assert.equal(review.canonicalSearch, query)
  assert.equal(resolveCustomerConfigLocation('view=import&detail=export').activeDetail, '')
})
