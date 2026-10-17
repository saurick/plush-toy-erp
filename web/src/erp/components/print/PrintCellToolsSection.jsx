import React from 'react'
import { PrintWorkspaceToolSection } from './PrintWorkspaceShell.jsx'
import {
  getPrintToolbarButtonClassName,
  PrintToolButton,
} from './PrintWorkspaceTools.jsx'

export default function PrintCellToolsSection({
  feedback,
  cellSelectionMode,
  canApplyMerge,
  canSplitMerge,
  onToggleSelection,
  onApplyMerge,
  onSplitMerge,
}) {
  return (
    <PrintWorkspaceToolSection title="单元格" tool="cells" feedback={feedback}>
      <div className="erp-print-shell__toolbar-group">
        <PrintToolButton
          icon="cells"
          wide
          className={getPrintToolbarButtonClassName({
            active: cellSelectionMode,
          })}
          onClick={onToggleSelection}
        >
          {cellSelectionMode ? '返回编辑' : '选择单元格'}
        </PrintToolButton>
        <PrintToolButton
          icon="merge"
          className={getPrintToolbarButtonClassName()}
          onClick={onApplyMerge}
          disabled={!canApplyMerge}
        >
          合并选区
        </PrintToolButton>
        <PrintToolButton
          icon="split"
          className={getPrintToolbarButtonClassName()}
          onClick={onSplitMerge}
          disabled={!canSplitMerge}
        >
          拆分当前
        </PrintToolButton>
      </div>
    </PrintWorkspaceToolSection>
  )
}
