import React from 'react'
import { DownOutlined, RightOutlined } from '@ant-design/icons'

export function DevDirectoryItem({ className = '', expanded, reserveDisclosure = false, children, ...props }) {
  const hasDisclosure = expanded !== undefined
  const DisclosureIcon = expanded ? DownOutlined : RightOutlined

  return (
    <button
      {...props}
      type="button"
      className={`erp-dev-directory-item ${className}`.trim()}
      aria-expanded={expanded}
    >
      {hasDisclosure || reserveDisclosure ? (
        <span className="erp-dev-directory-disclosure" aria-hidden="true">
          {hasDisclosure ? <DisclosureIcon /> : null}
        </span>
      ) : null}
      {children}
    </button>
  )
}

export function DevDirectoryBranch({ as: Branch = 'div', ...props }) {
  return <Branch {...props} className="erp-dev-directory-branch" />
}
