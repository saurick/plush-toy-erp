import React, { useRef } from 'react'
import { theme } from 'antd'

export default function DevTaskNav({
  ariaLabel,
  items,
  value,
  onChange,
  disabled = false,
  compact = false,
  level = 'secondary',
  className = '',
}) {
  const { token } = theme.useToken()
  const itemRefs = useRef([])

  const moveSelection = (event, currentIndex) => {
    const lastIndex = items.length - 1
    let nextIndex = currentIndex
    if (event.key === 'ArrowRight') {
      nextIndex = currentIndex === lastIndex ? 0 : currentIndex + 1
    } else if (event.key === 'ArrowLeft') {
      nextIndex = currentIndex === 0 ? lastIndex : currentIndex - 1
    } else if (event.key === 'Home') {
      nextIndex = 0
    } else if (event.key === 'End') {
      nextIndex = lastIndex
    } else {
      return
    }

    event.preventDefault()
    const nextItem = items[nextIndex]
    if (!nextItem) return
    onChange(nextItem.value)
    window.requestAnimationFrame(() => itemRefs.current[nextIndex]?.focus())
  }

  return (
    <div
      className={[
        'erp-dev-task-nav',
        level === 'primary' ? 'erp-dev-task-nav--primary' : '',
        compact ? 'erp-dev-task-nav--compact' : '',
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      role="tablist"
      aria-orientation="horizontal"
      aria-label={ariaLabel}
      style={{
        '--dev-task-border': token.colorBorder,
        '--dev-task-bg': token.colorBgContainer,
        '--dev-task-active-border': token.colorPrimary,
        '--dev-task-active-bg': token.colorPrimaryBg,
        '--dev-task-secondary': token.colorTextSecondary,
      }}
    >
      {items.map((item, index) => {
        const isActive = item.value === value
        return (
          <button
            ref={(node) => {
              itemRefs.current[index] = node
            }}
            type="button"
            role="tab"
            key={item.value}
            className={
              isActive
                ? 'erp-dev-task-nav__item erp-dev-task-nav__item--active'
                : 'erp-dev-task-nav__item'
            }
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            disabled={disabled}
            onClick={() => onChange(item.value)}
            onKeyDown={(event) => moveSelection(event, index)}
          >
            {item.englishLabel ? (
              <span className="erp-dev-task-nav__label-with-anchor">
                <span>{item.label}</span>
                <small className="erp-dev-task-nav__english-label" lang="en">
                  {item.englishLabel}
                </small>
              </span>
            ) : (
              <span>{item.label}</span>
            )}
            {item.description ? <small>{item.description}</small> : null}
          </button>
        )
      })}
    </div>
  )
}
