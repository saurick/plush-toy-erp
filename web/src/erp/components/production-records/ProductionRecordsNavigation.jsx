import React from 'react'
import { Tabs } from 'antd'

export const PRODUCTION_RECORD_VIEW_KEYS = Object.freeze({
  RECORDS: 'records',
  DECISIONS: 'decisions',
  TASKS: 'tasks',
})

const VIEW_LABELS = Object.freeze({
  [PRODUCTION_RECORD_VIEW_KEYS.RECORDS]: '生产记录',
  [PRODUCTION_RECORD_VIEW_KEYS.DECISIONS]: '异常处理',
  [PRODUCTION_RECORD_VIEW_KEYS.TASKS]: '待审批',
})

export function buildProductionRecordViewItems(availableKeys = []) {
  const available = new Set(availableKeys)
  return Object.values(PRODUCTION_RECORD_VIEW_KEYS)
    .filter((key) => available.has(key))
    .map((key) => ({ key, label: VIEW_LABELS[key] }))
}

export default function ProductionRecordsNavigation({
  activeKey,
  availableKeys,
  onChange,
}) {
  const items = buildProductionRecordViewItems(availableKeys)
  if (items.length === 0) return null

  return (
    <Tabs
      aria-label="生产记录工作区"
      className="erp-business-view-tabs"
      activeKey={activeKey}
      items={items}
      onChange={onChange}
    />
  )
}
