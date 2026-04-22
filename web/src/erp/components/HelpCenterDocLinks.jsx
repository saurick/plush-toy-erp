import React from 'react'
import { Link } from 'react-router-dom'
import { helpCenterNavItems } from '../config/seedData.mjs'

const helpCenterLinks = helpCenterNavItems.map((item) => ({
  key: item.key,
  label: item.label,
  path: item.path,
}))

export default function HelpCenterDocLinks({
  currentPath = '',
  variant = 'button',
}) {
  const visibleLinks = helpCenterLinks.filter(
    (item) => item.path !== currentPath
  )

  if (!visibleLinks.length) {
    return null
  }

  return (
    <div
      className={`erp-help-doc-links${variant === 'inline' ? ' erp-help-doc-links--inline' : ''}`}
    >
      {visibleLinks.map((item) => (
        <Link
          key={item.key}
          className={
            variant === 'inline'
              ? 'erp-help-doc-links__text-link'
              : 'erp-secondary-button'
          }
          to={item.path}
        >
          {variant === 'inline' ? `查看 ${item.label}` : item.label}
        </Link>
      ))}
    </div>
  )
}
