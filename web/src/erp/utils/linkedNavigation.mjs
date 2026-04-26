import { businessModuleDefinitions } from '../config/businessModules.mjs'

const moduleMap = new Map(
  businessModuleDefinitions.map((moduleItem) => [moduleItem.key, moduleItem])
)

const toText = (value) => String(value ?? '').trim()

const normalizeFields = (fields) => {
  if (!Array.isArray(fields)) return []
  return fields.map((item) => toText(item)).filter(Boolean)
}

const collectMatchTexts = (value, bucket = []) => {
  if (Array.isArray(value)) {
    value.forEach((item) => collectMatchTexts(item, bucket))
    return bucket
  }
  if (value && typeof value === 'object') {
    Object.values(value).forEach((item) => collectMatchTexts(item, bucket))
    return bucket
  }
  const text = toText(value)
  if (text) bucket.push(text)
  return bucket
}

const recordDocumentNo = (record) => record?.document_no
const recordSourceNo = (record) => record?.source_no

// 当前主路径用 document_no 表示当前单据，source_no 表示上游单据快照。
// 这里仅登记字段关系稳定的链路，避免用产品名、客户名等宽泛字段制造误跳转。
const LINKED_TARGET_SPECS = Object.freeze({
  'project-orders': [
    {
      targetKey: 'material-bom',
      matchFields: ['source_no'],
      keywordResolver: recordDocumentNo,
    },
    {
      targetKey: 'accessories-purchase',
      matchFields: ['source_no'],
      keywordResolver: recordDocumentNo,
    },
    {
      targetKey: 'processing-contracts',
      matchFields: ['source_no'],
      keywordResolver: recordDocumentNo,
    },
    {
      targetKey: 'production-scheduling',
      matchFields: ['source_no'],
      keywordResolver: recordDocumentNo,
    },
    {
      targetKey: 'shipping-release',
      matchFields: ['source_no'],
      keywordResolver: recordDocumentNo,
    },
  ],
  'material-bom': [
    {
      targetKey: 'project-orders',
      matchFields: ['document_no'],
      keywordResolver: recordSourceNo,
    },
    {
      targetKey: 'accessories-purchase',
      matchFields: ['source_no'],
      keywordResolver: recordDocumentNo,
    },
    {
      targetKey: 'processing-contracts',
      matchFields: ['source_no'],
      keywordResolver: recordDocumentNo,
    },
    {
      targetKey: 'production-scheduling',
      matchFields: ['source_no'],
      keywordResolver: recordDocumentNo,
    },
  ],
  'accessories-purchase': [
    {
      targetKey: 'project-orders',
      matchFields: ['document_no'],
      keywordResolver: recordSourceNo,
    },
    {
      targetKey: 'material-bom',
      matchFields: ['document_no'],
      keywordResolver: recordSourceNo,
    },
    {
      targetKey: 'inbound',
      matchFields: ['source_no'],
      keywordResolver: recordDocumentNo,
    },
    {
      targetKey: 'reconciliation',
      matchFields: ['source_no'],
      keywordResolver: recordDocumentNo,
    },
  ],
  'processing-contracts': [
    {
      targetKey: 'project-orders',
      matchFields: ['document_no'],
      keywordResolver: recordSourceNo,
    },
    {
      targetKey: 'material-bom',
      matchFields: ['document_no'],
      keywordResolver: recordSourceNo,
    },
    {
      targetKey: 'inbound',
      matchFields: ['source_no'],
      keywordResolver: recordDocumentNo,
    },
    {
      targetKey: 'production-scheduling',
      matchFields: ['source_no'],
      keywordResolver: recordDocumentNo,
    },
    {
      targetKey: 'reconciliation',
      matchFields: ['source_no'],
      keywordResolver: recordDocumentNo,
    },
  ],
  inbound: [
    {
      targetKey: 'accessories-purchase',
      matchFields: ['document_no'],
      keywordResolver: recordSourceNo,
    },
    {
      targetKey: 'processing-contracts',
      matchFields: ['document_no'],
      keywordResolver: recordSourceNo,
    },
    {
      targetKey: 'production-progress',
      matchFields: ['document_no'],
      keywordResolver: recordSourceNo,
    },
  ],
  'shipping-release': [
    {
      targetKey: 'project-orders',
      matchFields: ['document_no'],
      keywordResolver: recordSourceNo,
    },
    {
      targetKey: 'outbound',
      matchFields: ['source_no'],
      keywordResolver: recordDocumentNo,
    },
  ],
  outbound: [
    {
      targetKey: 'shipping-release',
      matchFields: ['document_no'],
      keywordResolver: recordSourceNo,
    },
    {
      targetKey: 'reconciliation',
      matchFields: ['source_no'],
      keywordResolver: recordDocumentNo,
    },
  ],
  'production-scheduling': [
    {
      targetKey: 'project-orders',
      matchFields: ['document_no'],
      keywordResolver: recordSourceNo,
    },
    {
      targetKey: 'material-bom',
      matchFields: ['document_no'],
      keywordResolver: recordSourceNo,
    },
    {
      targetKey: 'processing-contracts',
      matchFields: ['document_no'],
      keywordResolver: recordSourceNo,
    },
    {
      targetKey: 'production-progress',
      matchFields: ['source_no'],
      keywordResolver: recordDocumentNo,
    },
    {
      targetKey: 'production-exceptions',
      matchFields: ['source_no'],
      keywordResolver: recordDocumentNo,
    },
  ],
  'production-progress': [
    {
      targetKey: 'production-scheduling',
      matchFields: ['document_no'],
      keywordResolver: recordSourceNo,
    },
    {
      targetKey: 'project-orders',
      matchFields: ['document_no'],
      keywordResolver: recordSourceNo,
    },
    {
      targetKey: 'inbound',
      matchFields: ['source_no'],
      keywordResolver: recordDocumentNo,
    },
    {
      targetKey: 'shipping-release',
      matchFields: ['source_no'],
      keywordResolver: recordDocumentNo,
    },
    {
      targetKey: 'production-exceptions',
      matchFields: ['source_no'],
      keywordResolver: recordDocumentNo,
    },
  ],
  'production-exceptions': [
    {
      targetKey: 'production-scheduling',
      matchFields: ['document_no'],
      keywordResolver: recordSourceNo,
    },
    {
      targetKey: 'production-progress',
      matchFields: ['document_no'],
      keywordResolver: recordSourceNo,
    },
    {
      targetKey: 'project-orders',
      matchFields: ['document_no'],
      keywordResolver: recordSourceNo,
    },
  ],
  reconciliation: [
    {
      targetKey: 'accessories-purchase',
      matchFields: ['document_no'],
      keywordResolver: recordSourceNo,
    },
    {
      targetKey: 'processing-contracts',
      matchFields: ['document_no'],
      keywordResolver: recordSourceNo,
    },
    {
      targetKey: 'outbound',
      matchFields: ['document_no'],
      keywordResolver: recordSourceNo,
    },
    {
      targetKey: 'payables',
      matchFields: ['source_no'],
      keywordResolver: recordDocumentNo,
    },
  ],
  payables: [
    {
      targetKey: 'reconciliation',
      matchFields: ['document_no'],
      keywordResolver: recordSourceNo,
    },
  ],
})

export const matchesLinkedRecord = (record, keyword, matchFields = []) => {
  const normalizedKeyword = toText(keyword).toLowerCase()
  if (!normalizedKeyword) return true

  const normalizedFields = normalizeFields(matchFields)
  if (normalizedFields.length === 0) {
    return String(JSON.stringify(record) || '')
      .toLowerCase()
      .includes(normalizedKeyword)
  }

  return normalizedFields.some((field) =>
    collectMatchTexts(record?.[field]).some((text) =>
      text.toLowerCase().includes(normalizedKeyword)
    )
  )
}

export const getLinkedTargets = (moduleKey, record) => {
  const normalizedModuleKey = toText(moduleKey)
  if (!normalizedModuleKey || !record) return []

  const sourceModule = moduleMap.get(normalizedModuleKey)

  const specs = LINKED_TARGET_SPECS[normalizedModuleKey] || []

  return specs
    .map((spec) => {
      const targetModule = moduleMap.get(spec.targetKey)
      if (!targetModule) return null

      const keyword = toText(spec.keywordResolver?.(record))
      if (!keyword) return null

      return {
        sourceKey: normalizedModuleKey,
        sourceTitle: sourceModule?.title || normalizedModuleKey,
        targetKey: spec.targetKey,
        targetTitle: targetModule.title,
        targetPath: targetModule.path,
        keyword,
        matchFields: normalizeFields(spec.matchFields),
      }
    })
    .filter(Boolean)
}

export const buildModuleTableQuery = ({
  keyword,
  sourceKey,
  matchFields,
} = {}) => {
  const params = new URLSearchParams()
  const normalizedKeyword = toText(keyword)
  if (normalizedKeyword) {
    params.set('link_keyword', normalizedKeyword)
  }

  const normalizedSourceKey = toText(sourceKey)
  if (normalizedSourceKey) {
    params.set('link_source', normalizedSourceKey)
  }

  const normalizedMatchFields = normalizeFields(matchFields)
  if (normalizedMatchFields.length > 0) {
    params.set('link_fields', normalizedMatchFields.join(','))
  }

  return params.toString()
}

export const buildLinkedNavigationQuery = (linkTarget) => {
  if (!toText(linkTarget?.keyword)) return ''
  return buildModuleTableQuery({
    keyword: linkTarget.keyword,
    sourceKey: linkTarget.sourceKey,
    matchFields: linkTarget.matchFields,
  })
}

export const parseModuleTableQuery = (search) => {
  const query = String(search || '').replace(/^\?/, '')
  const params = new URLSearchParams(query)
  const fieldsRaw = toText(params.get('link_fields'))

  return {
    keyword: toText(params.get('link_keyword')),
    sourceKey: toText(params.get('link_source')),
    matchFields: fieldsRaw
      ? fieldsRaw
          .split(',')
          .map((item) => toText(item))
          .filter(Boolean)
      : [],
  }
}

export const parseLinkedNavigationQuery = (search) => {
  const parsed = parseModuleTableQuery(search)
  return {
    keyword: parsed.keyword,
    sourceKey: parsed.sourceKey,
    matchFields: parsed.matchFields,
  }
}
