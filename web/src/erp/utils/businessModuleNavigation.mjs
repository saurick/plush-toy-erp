import { BUSINESS_WORKFLOW_STATES } from '../config/workflowStatus.mjs'

const BUSINESS_STATUS_KEY_SET = new Set(
  BUSINESS_WORKFLOW_STATES.map((state) => state.key)
)

function toText(value) {
  return String(value ?? '').trim()
}

export function normalizeBusinessStatusKeys(values) {
  const source = Array.isArray(values) ? values : [values]
  const seen = new Set()
  return source
    .flatMap((value) =>
      toText(value)
        .split(',')
        .map((item) => toText(item))
    )
    .filter((value) => {
      if (!value || seen.has(value) || !BUSINESS_STATUS_KEY_SET.has(value)) {
        return false
      }
      seen.add(value)
      return true
    })
}

export function buildBusinessModuleQuery({ businessStatusKeys } = {}) {
  const params = new URLSearchParams()
  const normalizedStatusKeys = normalizeBusinessStatusKeys(businessStatusKeys)
  if (normalizedStatusKeys.length === 1) {
    params.set('business_status_key', normalizedStatusKeys[0])
  } else if (normalizedStatusKeys.length > 1) {
    params.set('business_status_keys', normalizedStatusKeys.join(','))
  }
  return params.toString()
}

export function parseBusinessModuleQuery(searchParams) {
  const params =
    searchParams instanceof URLSearchParams
      ? searchParams
      : new URLSearchParams(String(searchParams || '').replace(/^\?/, ''))
  return {
    businessStatusKeys: normalizeBusinessStatusKeys([
      ...params.getAll('business_status_key'),
      ...params.getAll('business_status_keys'),
    ]),
  }
}
