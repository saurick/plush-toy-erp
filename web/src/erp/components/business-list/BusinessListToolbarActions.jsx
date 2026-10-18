import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { DownOutlined, DownloadOutlined, SettingOutlined, TableOutlined } from '@ant-design/icons'
import { Dropdown, Tooltip } from 'antd'
import { message } from '@/common/utils/antdApp'
import { AUTH_SCOPE, getToken } from '@/common/auth/auth'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { setERPColumnOrder } from '../../api/erpPreferenceApi.mjs'
import { applyEffectiveFieldPolicyFlags } from '../../utils/adminProfileSync.mjs'
import {
  applyModuleColumnOrder,
  applyModuleColumnVisibility,
  buildModuleColumnSettings,
  resolveModuleHiddenColumns,
  sanitizeModuleColumnOrder,
} from '../../utils/moduleTableColumns.mjs'
import { downloadCSVRows } from '../../utils/csvExport.mjs'
import { ToolbarButton } from './BusinessListLayout.jsx'
import {
  ColumnOrderModal,
  getColumnDisplayLabel,
  getColumnLabel,
} from './ColumnOrderModal.jsx'

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
  const header = exportColumns.map((column) => getColumnLabel(column))
  const body = (Array.isArray(rows) ? rows : []).map((row) =>
    exportColumns.map((column) => getColumnRawValue(row, column))
  )
  downloadCSVRows({ filename, rows: [header, ...body] })
}

export function useBusinessColumnOrder({
  adminProfile,
  moduleKey,
  moduleTitle,
  columns,
}) {
  const outletContext = useOutletContext()
  const scopeKey = `${adminProfile?.id || adminProfile?.user_id || ''}:${moduleKey}`
  const [savedSettings, setSavedSettings] = useState(null)
  const [panelScope, setPanelScope] = useState(null)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const currentScopeRef = useRef(scopeKey)
  currentScopeRef.current = scopeKey
  useEffect(() => {
    currentScopeRef.current = scopeKey
    return () => {
      currentScopeRef.current = null
    }
  }, [scopeKey])

  const normalizedColumns = useMemo(() => {
    const next = (Array.isArray(columns) ? columns : []).map((column) => ({
      ...column,
    }))
    applyEffectiveFieldPolicyFlags({ adminProfile, moduleKey, columns: next })
    return next
  }, [adminProfile, columns, moduleKey])
  const orderableColumns = useMemo(
    () => normalizedColumns.filter((column) => column?.hidden !== true),
    [normalizedColumns]
  )
  const preferences =
    savedSettings?.scopeKey === scopeKey
      ? savedSettings.preferences
      : adminProfile?.erp_preferences
  const effectiveOrder = useMemo(
    () =>
      sanitizeModuleColumnOrder(
        preferences?.column_orders?.[moduleKey],
        orderableColumns
      ),
    [moduleKey, orderableColumns, preferences]
  )
  const hiddenColumns = useMemo(
    () =>
      resolveModuleHiddenColumns(
        preferences?.column_orders?.[moduleKey],
        preferences?.hidden_columns?.[moduleKey],
        orderableColumns
      ),
    [moduleKey, orderableColumns, preferences]
  )
  const visibleColumns = useMemo(
    () => applyModuleColumnOrder(orderableColumns, effectiveOrder),
    [effectiveOrder, orderableColumns]
  )
  const exportColumns = useMemo(
    () => [
      ...visibleColumns,
      ...normalizedColumns.filter(
        (column) =>
          column?.hidden === true &&
          column?.hiddenByEffectiveFieldPolicy !== true
      ),
    ],
    [normalizedColumns, visibleColumns]
  )

  const persistColumnOrder = useCallback(
    async (nextOrder, nextHidden = hiddenColumns) => {
      if (savingRef.current) return false
      const { order, hidden_columns: hidden } = buildModuleColumnSettings(
        nextOrder,
        nextHidden,
        orderableColumns
      )
      savingRef.current = true
      setSaving(true)
      const saveToken = getToken(AUTH_SCOPE.ADMIN)
      try {
        const erpPreferences = await setERPColumnOrder({
          module_key: moduleKey,
          order,
          hidden_columns: hidden,
        })
        if (currentScopeRef.current !== scopeKey || getToken(AUTH_SCOPE.ADMIN) !== saveToken) return false
        setSavedSettings({ scopeKey, preferences: erpPreferences })
        outletContext?.updateAdminERPPreferences?.(erpPreferences)
        message.success(
          order.length || hidden.length ? '列设置已保存' : '列设置已恢复默认'
        )
        return true
      } catch (error) {
        if (currentScopeRef.current === scopeKey) {
          message.error(getActionErrorMessage(error, '保存列设置'))
        }
        return false
      } finally {
        savingRef.current = false
        setSaving(false)
      }
    },
    [hiddenColumns, moduleKey, orderableColumns, outletContext, scopeKey]
  )

  const tableColumns = useMemo(() => {
    const displayed = new Set(
      applyModuleColumnVisibility(orderableColumns, hiddenColumns)
    )
    return visibleColumns
      .filter((column) => displayed.has(column))
      .map((column) => ({
        ...column,
        exportTitle: getColumnLabel(column),
        title: (
          <span className="erp-module-column-header-text">
            {React.isValidElement(column.title)
              ? column.title
              : getColumnDisplayLabel(column)}
          </span>
        ),
      }))
  }, [hiddenColumns, orderableColumns, visibleColumns])

  return {
    effectiveOrder,
    exportColumns,
    saving,
    visibleColumns,
    tableColumns,
    openColumnOrder: () => setPanelScope(scopeKey),
    columnOrderModal: (
      <ColumnOrderModal
        key={scopeKey}
        open={panelScope === scopeKey}
        columns={orderableColumns}
        order={effectiveOrder}
        hiddenColumns={hiddenColumns}
        saving={saving}
        moduleTitle={moduleTitle}
        onChange={persistColumnOrder}
        onClose={() => setPanelScope(null)}
      />
    ),
  }
}

export function BusinessListToolbarActions({
  onExport,
  showExport = true,
  exportDisabled = false,
  exportDisabledReason = '',
  onOpenColumnOrder,
  columnOrderDisabled = false,
  columnOrderDisabledReason = '',
}) {
  const triggerRef = useRef(null)
  const [open, setOpen] = useState(false)
  const normalizedExportReason =
    exportDisabledReason || (exportDisabled ? '当前没有可导出的列表数据' : '')
  const normalizedColumnReason =
    columnOrderDisabledReason ||
    (columnOrderDisabled ? '当前列表暂不支持列设置' : '')
  const items = [
    ...(showExport ? [{
      key: 'export',
      icon: <DownloadOutlined />,
      label: <Tooltip title={normalizedExportReason}><span>导出筛选结果</span></Tooltip>,
      title: normalizedExportReason,
      disabled: exportDisabled || !onExport,
      onClick: onExport,
    }] : []),
    {
      key: 'columns',
      icon: <SettingOutlined />,
      label: <Tooltip title={normalizedColumnReason}><span>列设置</span></Tooltip>,
      title: normalizedColumnReason,
      disabled: columnOrderDisabled || !onOpenColumnOrder,
      onClick: () => {
        // The menu closes before the dialog; return focus to its stable trigger.
        triggerRef.current?.focus({ preventScroll: true })
        onOpenColumnOrder?.()
      },
    },
  ]

  return (
    <Dropdown trigger={['click']} open={open} onOpenChange={(next, info) => setOpen(info.source === 'menu' ? false : next)} menu={{ items }}>
      <ToolbarButton ref={triggerRef} icon={<TableOutlined />} aria-label="表格工具" aria-haspopup="menu" aria-expanded={open}>
        表格工具 <DownOutlined />
      </ToolbarButton>
    </Dropdown>
  )
}
