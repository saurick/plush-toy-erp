import React, { useCallback, useMemo, useState } from 'react'
import { DownloadOutlined, SettingOutlined } from '@ant-design/icons'
import { Space, Tooltip } from 'antd'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { setERPColumnOrder } from '../../api/erpPreferenceApi.mjs'
import { applyEffectiveFieldPolicyFlags } from '../../utils/adminProfileSync.mjs'
import {
  applyModuleColumnOrder,
  sanitizeModuleColumnOrder,
} from '../../utils/moduleTableColumns.mjs'
import { ToolbarButton } from './BusinessListLayout.jsx'
import {
  ColumnOrderHeaderMenu,
  ColumnOrderModal,
  getColumnLabel,
} from './ColumnOrderModal.jsx'

const COLUMN_ORDER_STORAGE_PREFIX = 'erp.module.column-order.'

function readStoredColumnOrder(moduleKey) {
  if (typeof window === 'undefined') {
    return []
  }

  try {
    const raw = window.localStorage.getItem(
      `${COLUMN_ORDER_STORAGE_PREFIX}${moduleKey}`
    )
    const parsed = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeStoredColumnOrder(moduleKey, order = []) {
  if (typeof window === 'undefined') {
    return
  }

  const storageKey = `${COLUMN_ORDER_STORAGE_PREFIX}${moduleKey}`
  if (!Array.isArray(order) || order.length === 0) {
    window.localStorage.removeItem(storageKey)
    return
  }
  window.localStorage.setItem(storageKey, JSON.stringify(order))
}

function getPreferredColumnOrder({
  adminProfile,
  moduleKey,
  columns,
  localOrder,
}) {
  applyEffectiveFieldPolicyFlags({ adminProfile, moduleKey, columns })
  const orderableColumns = columns.filter((column) => column?.hidden !== true)
  if (Array.isArray(localOrder)) {
    return sanitizeModuleColumnOrder(localOrder, orderableColumns)
  }

  const accountOrder = adminProfile?.erp_preferences?.column_orders?.[moduleKey]
  const sanitizedAccountOrder = sanitizeModuleColumnOrder(
    accountOrder,
    orderableColumns
  )
  if (sanitizedAccountOrder.length > 0) {
    return sanitizedAccountOrder
  }
  return sanitizeModuleColumnOrder(
    readStoredColumnOrder(moduleKey),
    orderableColumns
  )
}

function csvEscape(value) {
  const text = String(value ?? '')
  if (/[",\n\r]/u.test(text)) {
    return `"${text.replace(/"/g, '""')}"`
  }
  return text
}

function getColumnRawValue(row, column = {}) {
  if (typeof column.exportValue === 'function') {
    return column.exportValue(row)
  }
  const { dataIndex } = column
  if (Array.isArray(dataIndex)) {
    return dataIndex.reduce((current, key) => current?.[key], row)
  }
  if (typeof dataIndex === 'string' && dataIndex.includes('.')) {
    return dataIndex.split('.').reduce((current, key) => current?.[key], row)
  }
  return dataIndex ? row?.[dataIndex] : ''
}

export function downloadBusinessListCSV({ filename, columns, rows }) {
  const exportColumns = (Array.isArray(columns) ? columns : []).filter(
    (column) => column && column.exportable !== false
  )
  const header = exportColumns.map((column) =>
    csvEscape(getColumnLabel(column))
  )
  const body = (Array.isArray(rows) ? rows : []).map((row) =>
    exportColumns.map((column) => csvEscape(getColumnRawValue(row, column)))
  )
  const csv = [header, ...body].map((line) => line.join(',')).join('\n')
  const blob = new Blob([`\uFEFF${csv}`], {
    type: 'text/csv;charset=utf-8',
  })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export function useBusinessColumnOrder({
  adminProfile,
  moduleKey,
  moduleTitle,
  columns,
}) {
  const normalizedColumns = useMemo(
    () => (Array.isArray(columns) ? columns : []),
    [columns]
  )
  const [localOrder, setLocalOrder] = useState(null)
  const [panelOpen, setPanelOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const orderableColumns = useMemo(
    () => normalizedColumns.filter((column) => column?.hidden !== true),
    [normalizedColumns]
  )

  const effectiveOrder = useMemo(
    () =>
      getPreferredColumnOrder({
        adminProfile,
        moduleKey,
        columns: normalizedColumns,
        localOrder,
      }),
    [adminProfile, localOrder, moduleKey, normalizedColumns]
  )

  const visibleColumns = useMemo(
    () => applyModuleColumnOrder(orderableColumns, effectiveOrder),
    [effectiveOrder, orderableColumns]
  )

  const exportColumns = useMemo(() => {
    applyEffectiveFieldPolicyFlags({
      adminProfile,
      moduleKey,
      columns: normalizedColumns,
    })
    return [
      ...visibleColumns,
      ...normalizedColumns.filter(
        (column) =>
          column?.hidden === true &&
          column?.hiddenByEffectiveFieldPolicy !== true
      ),
    ]
  }, [adminProfile, moduleKey, normalizedColumns, visibleColumns])

  const persistColumnOrder = useCallback(
    async (nextOrder) => {
      const sanitizedOrder = sanitizeModuleColumnOrder(
        nextOrder,
        orderableColumns
      )
      writeStoredColumnOrder(moduleKey, sanitizedOrder)
      setLocalOrder(sanitizedOrder)
      setSaving(true)
      try {
        const erpPreferences = await setERPColumnOrder({
          module_key: moduleKey,
          order: sanitizedOrder,
        })
        setLocalOrder(
          erpPreferences?.column_orders?.[moduleKey] || sanitizedOrder
        )
        message.success(
          sanitizedOrder.length > 0 ? '列顺序已保存' : '列顺序已恢复默认'
        )
      } catch (error) {
        message.warning(
          `${getActionErrorMessage(error, '保存列顺序')}，已保留本地设置`
        )
      } finally {
        setSaving(false)
      }
    },
    [moduleKey, orderableColumns]
  )

  const tableColumns = useMemo(
    () =>
      visibleColumns.map((column) => ({
        ...column,
        title: (
          <ColumnOrderHeaderMenu
            column={column}
            columns={orderableColumns}
            order={effectiveOrder}
            saving={saving}
            onChange={persistColumnOrder}
            onOpenPanel={() => setPanelOpen(true)}
          />
        ),
      })),
    [
      effectiveOrder,
      orderableColumns,
      persistColumnOrder,
      saving,
      visibleColumns,
    ]
  )

  return {
    effectiveOrder,
    exportColumns,
    saving,
    visibleColumns,
    tableColumns,
    openColumnOrder: () => setPanelOpen(true),
    columnOrderModal: (
      <ColumnOrderModal
        open={panelOpen}
        columns={orderableColumns}
        order={effectiveOrder}
        saving={saving}
        moduleTitle={moduleTitle}
        onChange={persistColumnOrder}
        onClose={() => setPanelOpen(false)}
      />
    ),
  }
}

function TooltipButton({ title, children }) {
  if (!title) return children
  return (
    <Tooltip title={title}>
      <span>{children}</span>
    </Tooltip>
  )
}

export function BusinessListToolbarActions({
  onExport,
  exportDisabled = false,
  exportDisabledReason = '',
  onOpenColumnOrder,
  columnOrderDisabled = false,
  columnOrderDisabledReason = '',
}) {
  const normalizedExportReason =
    exportDisabledReason || (exportDisabled ? '当前没有可导出的列表数据' : '')
  const normalizedColumnReason =
    columnOrderDisabledReason ||
    (columnOrderDisabled ? '当前列表暂不支持安全调整列顺序' : '')

  return (
    <Space size={8} wrap>
      <TooltipButton title={normalizedExportReason}>
        <ToolbarButton
          icon={<DownloadOutlined />}
          disabled={exportDisabled || !onExport}
          onClick={onExport}
        >
          导出筛选结果
        </ToolbarButton>
      </TooltipButton>
      <TooltipButton title={normalizedColumnReason}>
        <ToolbarButton
          icon={<SettingOutlined />}
          disabled={columnOrderDisabled || !onOpenColumnOrder}
          onClick={onOpenColumnOrder}
        >
          列顺序
        </ToolbarButton>
      </TooltipButton>
    </Space>
  )
}
