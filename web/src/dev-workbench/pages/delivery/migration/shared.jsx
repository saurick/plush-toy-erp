import { Tag } from 'antd'
import { databaseMigrationStatusPresentation } from '../../../config/devDatabaseMigration.mjs'

export const MIGRATION_VIEW_ITEMS = [
  { value: 'migration', label: '数据库升级' },
  { value: 'runtime', label: '运行检查' },
  { value: 'history', label: '操作记录' },
]

export const OPERATION_POLL_INTERVAL_MS = 1500

export const DATABASE_MIGRATION_SNAPSHOT_KEY = 'database-migration'

export function StatusTag({ status, issues }) {
  const presentation = databaseMigrationStatusPresentation(status, issues)
  return <Tag color={presentation.color}>{presentation.label}</Tag>
}

export function operationUpdateAction(operation) {
  return ['passed', 'failed', 'blocked', 'not_proven'].includes(
    operation?.status
  )
    ? '完成于'
    : '更新于'
}

export function shortHash(value) {
  return typeof value === 'string' && value.length >= 12
    ? value.slice(0, 12)
    : '未证明'
}

export function formatBytes(value) {
  if (!Number.isFinite(value) || value < 0) return '未证明'
  if (value < 1024) return `${value} B`
  const units = ['KiB', 'MiB', 'GiB']
  let size = value
  let unit = -1
  do {
    size /= 1024
    unit += 1
  } while (size >= 1024 && unit < units.length - 1)
  return `${size.toFixed(size >= 10 ? 1 : 2)} ${units[unit]}`
}

export function issueText(issues = []) {
  return Array.isArray(issues)
    ? issues.map((issue) => issue.message).join('；')
    : ''
}

export function upsertOperation(operations, operation) {
  if (!operation) return operations
  return [operation, ...operations.filter((item) => item.id !== operation.id)]
}

export function runtimePresentation(runtime) {
  if (runtime?.available) {
    return { color: 'success', label: 'health / ready 通过' }
  }
  if (
    runtime?.health?.status === 'unavailable' &&
    runtime?.ready?.status === 'unavailable'
  ) {
    return { color: 'default', label: '本地后端未运行' }
  }
  return { color: 'warning', label: '本地后端未就绪' }
}

export function toolReadinessPresentation(tools) {
  return tools?.status === 'ready'
    ? { color: 'success', label: '迁移准备环境已就绪' }
    : { color: 'error', label: '迁移准备环境未就绪' }
}
