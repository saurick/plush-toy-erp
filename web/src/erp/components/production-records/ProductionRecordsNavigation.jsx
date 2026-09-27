import React from 'react'
import Tabs from '@/common/components/navigation/SlidingTabs'
import { PRODUCTION_RECORD_VIEW_KEYS } from '../../utils/productionRecordViews.mjs'

const VIEW_LABELS = Object.freeze({
  [PRODUCTION_RECORD_VIEW_KEYS.RECORDS]: '记录明细',
  [PRODUCTION_RECORD_VIEW_KEYS.PROCESS]: '生产工序',
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
  if (items.length < 2) return null

  return (
    <Tabs
      aria-label="生产记录工作区"
      className="erp-production-record-tabs"
      activeKey={activeKey}
      items={items}
      onChange={onChange}
    />
  )
}
