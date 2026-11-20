import React from 'react'
import './mobileNavigationBadge.css'

export default function MobileNavigationIcon({ Icon, count, risk = false }) {
  const showCount = Number.isSafeInteger(count) && count > 0
  return (
    <span className="mobile-navigation-icon" aria-hidden="true">
      <Icon />
      {showCount && (
        <span
          className={`mobile-navigation-badge${risk ? ' mobile-navigation-badge--risk' : ''}`}
          data-testid={risk ? 'mobile-nav-risk-count' : 'mobile-nav-todo-count'}
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
    </span>
  )
}
