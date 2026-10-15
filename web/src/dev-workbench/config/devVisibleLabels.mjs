const ENGLISH_ANCHOR_LABELS = Object.freeze({
  Acceptance: '验收',
  API: '接口',
  Architecture: '架构',
  Audit: '审计',
  BOM: '物料清单',
  'Customer Config': '客户配置',
  'Customer Extension': '客户扩展',
  'Customer Material': '客户资料',
  'Data Import': '数据导入',
  Deferred: '延后',
  Delivery: '交付',
  Deployment: '部署',
  'Engineering Data': '工程数据',
  Evidence: '证据',
  Finance: '财务',
  Help: '帮助',
  'Industry Template': '行业模板',
  'Industry Template Candidate': '行业模板候选',
  Integration: '集成',
  Inventory: '库存',
  MasterData: '主数据',
  Menu: '菜单',
  Mobile: '移动端',
  Order: '订单',
  Outsourcing: '委外',
  'Outsourcing Source Document': '委外源单据',
  Product: '产品',
  'Product Core': '产品内核',
  Productization: '产品化',
  'Print Template Candidate': '打印模板候选',
  Production: '生产',
  Purchase: '采购',
  QA: '质量保障',
  Quality: '质检',
  RBAC: '权限控制',
  Reporting: '报表',
  SaaS: '软件服务',
  Shipment: '出货',
  SKU: '产品规格',
  'Source Document': '源单据',
  UI: '界面',
  Workflow: '工作流',
  'Multi-tenant': '多租户',
})

const FORMAT_LABELS = Object.freeze({
  HTML: '网页原型 / HTML',
  PNG: '图片方案 / PNG',
})

function hasChinese(value = '') {
  return /[\u3400-\u9fff]/u.test(value)
}

export function formatDevEnglishAnchor(value = '') {
  const normalized = String(value || '').trim()
  if (!normalized || hasChinese(normalized)) return normalized
  if (FORMAT_LABELS[normalized]) return FORMAT_LABELS[normalized]

  const parts = normalized.split(/\s+\/\s+/u)
  const translatedParts = parts.map((part) => {
    const chinese = ENGLISH_ANCHOR_LABELS[part]
    return chinese ? `${chinese} / ${part}` : part
  })
  return translatedParts.join(' · ')
}

export function isUnexplainedEnglishDevLabel(value = '') {
  const normalized = String(value || '').trim()
  return (
    Boolean(normalized) &&
    !hasChinese(normalized) &&
    /[A-Za-z]/u.test(normalized)
  )
}
