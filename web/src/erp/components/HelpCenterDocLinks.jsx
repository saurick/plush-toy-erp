import React from 'react'
import { Link } from 'react-router-dom'
import { helpCenterNavItems } from '../config/seedData.mjs'

const helpCenterLinks = helpCenterNavItems.map((item) => ({
  key: item.key,
  label: item.label,
  path: item.path,
}))

export default function HelpCenterDocLinks({ currentPath = '' }) {
  const visibleLinks = helpCenterLinks.filter(
    (item) => item.path !== currentPath
  )

  if (!visibleLinks.length) {
    return null
  }

  return (
    <div className="erp-help-doc-links">
      {visibleLinks.map((item) => (
        <Link key={item.key} className="erp-secondary-button" to={item.path}>
          {item.label}
        </Link>
      ))}
    </div>
  )
}
