import { requestWorkbenchJson } from './devWorkbenchRequest.mjs'

export const QUALITY_GATE_TEST_DIRECTORY_API =
  '/__dev/api/qa/quality-gates/test-directory'
export const QUALITY_GATE_TEST_PAGE_SIZE = 10
export const QUALITY_GATE_TEST_GROUP_LABELS = Object.freeze({
  fast: '脚本 · 快速合同',
  database: '脚本 · 数据库合同',
  browser: '脚本 · 浏览器合同',
  release: '脚本 · 交付与运维',
  resource_sensitive: '脚本 · 资源敏感',
  explicit: '仅专项执行',
  web: 'Web 自动化',
  go: 'Go 后端',
  unregistered: '未登记分组',
  duplicate: '重复登记',
})

export function normalizeQualityGateTestDirectory(value) {
  if (
    value?.kind !== 'plush.quality-gate-test-directory' ||
    typeof value.readAt !== 'string' ||
    !Number.isFinite(Date.parse(value.readAt)) ||
    !Array.isArray(value.missingRoots) ||
    value.missingRoots.some(
      (item) => !['scripts', 'web', 'server'].includes(item)
    ) ||
    !Array.isArray(value.files)
  )
    { throw new Error('测试目录返回内容无效') }
  const seen = new Set()
  const files = value.files.map((file) => {
    if (
      typeof file.path !== 'string' ||
      !/^(scripts|web|server)\//u.test(file.path) ||
      file.path.includes('\\') ||
      Array.from(file.path).some((character) => character.codePointAt(0) < 32 || character.codePointAt(0) === 127) ||
      file.path
        .split('/')
        .some((part) => !part || part === '.' || part === '..') ||
      typeof file.group !== 'string' ||
      !/^[a-z_]+$/u.test(file.group) ||
      typeof file.present !== 'boolean' ||
      seen.has(file.path)
    )
      { throw new Error('测试目录返回内容无效') }
    seen.add(file.path)
    return { path: file.path, group: file.group, present: file.present }
  })
  return {
    kind: value.kind,
    readAt: value.readAt,
    missingRoots: [...value.missingRoots],
    files,
  }
}

export async function readQualityGateTestDirectory({ signal, fetchImpl = globalThis.fetch } = {}) {
  const value = await requestWorkbenchJson(fetchImpl, QUALITY_GATE_TEST_DIRECTORY_API, {
    method: 'GET',
    cache: 'no-store',
    credentials: 'same-origin',
    signal,
    headers: { Accept: 'application/json' },
  })
  return normalizeQualityGateTestDirectory(value)
}

export function selectQualityGateTests(
  directory,
  { query = '', group = 'all', page = 1 } = {}
) {
  const search = query.trim().toLocaleLowerCase()
  const rows = (directory?.files || []).filter(
    (file) =>
      (group === 'all' || file.group === group) &&
      (!search ||
        `${file.path} ${QUALITY_GATE_TEST_GROUP_LABELS[file.group] || file.group}`
          .toLocaleLowerCase()
          .includes(search))
  )
  const currentPage = Math.min(
    Math.max(1, page),
    Math.max(1, Math.ceil(rows.length / QUALITY_GATE_TEST_PAGE_SIZE))
  )
  return {
    total: rows.length,
    page: currentPage,
    rows: rows.slice(
      (currentPage - 1) * QUALITY_GATE_TEST_PAGE_SIZE,
      currentPage * QUALITY_GATE_TEST_PAGE_SIZE
    ),
  }
}
