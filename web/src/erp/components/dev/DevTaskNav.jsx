import React from 'react'
import { theme } from 'antd'

export default function DevTaskNav({
  ariaLabel,
  items,
  value,
  onChange,
  disabled = false,
  compact = false,
  className = '',
}) {
  const { token } = theme.useToken()

  return (
    <nav
      className={[
        'erp-dev-task-nav',
        compact ? 'erp-dev-task-nav--compact' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      aria-label={ariaLabel}
      style={{
        '--dev-task-border': token.colorBorder,
        '--dev-task-bg': token.colorBgContainer,
        '--dev-task-active-border': token.colorPrimary,
        '--dev-task-active-bg': token.colorPrimaryBg,
        '--dev-task-secondary': token.colorTextSecondary,
      }}
    >
      {items.map((item) => {
        const isActive = item.value === value
        return (
          <button
            type="button"
            key={item.value}
            className={
              isActive
                ? 'erp-dev-task-nav__item erp-dev-task-nav__item--active'
                : 'erp-dev-task-nav__item'
            }
            aria-current={isActive ? 'step' : undefined}
            disabled={disabled}
            onClick={() => onChange(item.value)}
          >
            <span>{item.label}</span>
            {item.description ? <small>{item.description}</small> : null}
          </button>
        )
      })}
    </nav>
  )
}
