import React from 'react'
import { Button } from 'antd'

export default function DevDirectoryHeader({ children, allExpanded, onToggleAll, className = '' }) {
  return (
    <div className={`erp-dev-directory-header ${className}`.trim()}>
      {children}
      {onToggleAll ? (
        <Button size="small" type="default" onClick={onToggleAll}>
          {allExpanded ? '收起全部' : '展开全部'}
        </Button>
      ) : null}
    </div>
  )
}
