import React from 'react'
import { Space, Typography } from 'antd'
import { SelectedItemsSummaryTag, SelectionClearAction } from './BusinessListLayout.jsx'
import './maintenanceSelectionBar.css'

// A local directory owns its selection independently of the source page or task.
export default function MaintenanceSelectionBar({
  selectionLabel,
  selectedLabel,
  emptyText = `请选择一条${selectionLabel}`,
  disabled = false,
  onClear,
  children,
}) {
  return (
    <div className="erp-maintenance-selection-bar" role="group" aria-label={`选中${selectionLabel}操作`}>
      <div className="erp-maintenance-selection-bar__identity" role="status">
        {selectedLabel ? (
          <>
            <SelectedItemsSummaryTag selectedCount={1} selectedLabel={selectedLabel} />
            <SelectionClearAction selectedCount={1} selectionLabel={selectionLabel} label="取消选择" disabled={disabled} onClear={onClear} />
          </>
        ) : <Typography.Text type="secondary">{emptyText}</Typography.Text>}
      </div>
      <Space wrap className="erp-maintenance-selection-bar__actions">{children}</Space>
    </div>
  )
}
