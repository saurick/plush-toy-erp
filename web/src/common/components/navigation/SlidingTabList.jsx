import React from 'react'
import useSlidingIndicator from './useSlidingIndicator'

export default function SlidingTabList({
  className = '',
  children,
  onKeyDown,
  options,
  value,
  onChange,
  block = false,
  disabled = false,
  ...props
}) {
  const ref = useSlidingIndicator({
    itemSelector: ':scope > [role="tab"]',
    selectedSelector: ':scope > [role="tab"][aria-selected="true"]',
  })
  const content = options ? options.map((option) => (
    <button
      key={option.value}
      type="button"
      role="tab"
      aria-selected={option.value === value}
      disabled={disabled || option.disabled}
      className={option.className}
      onClick={() => {
        if (option.value !== value) onChange?.(option.value)
      }}
    >
      {option.icon && <span aria-hidden="true">{option.icon}</span>}
      {option.label}
    </button>
  )) : children
  return (
    <div
      {...props}
      ref={ref}
      role="tablist"
      tabIndex={-1}
      className={`erp-sliding-tab-list ${options ? 'erp-navigation-tabs erp-navigation-tabs--options' : ''} ${block ? 'erp-navigation-tabs--block' : ''} ${className}`}
      onKeyDown={(event) => {
        onKeyDown?.(event)
        if (event.defaultPrevented) return
        const tabs = [
          ...event.currentTarget.querySelectorAll(':scope > [role="tab"]'),
        ].filter(
          (tab) => !tab.disabled && tab.getAttribute('aria-disabled') !== 'true'
        )
        const index = tabs.indexOf(event.target.closest('[role="tab"]'))
        if (index < 0) return
        const vertical = props['aria-orientation'] === 'vertical'
        const previous = vertical ? 'ArrowUp' : 'ArrowLeft'
        const next = vertical ? 'ArrowDown' : 'ArrowRight'
        let target
        if (event.key === previous) {
          target = (index - 1 + tabs.length) % tabs.length
        }
        if (event.key === next) target = (index + 1) % tabs.length
        if (event.key === 'Home') target = 0
        if (event.key === 'End') target = tabs.length - 1
        if (target === undefined) return
        event.preventDefault()
        tabs[target].focus()
        tabs[target].click()
      }}
    >
      {React.Children.map(content, (child) =>
        React.isValidElement(child) && child.props.role === 'tab'
          ? React.cloneElement(child, {
              tabIndex:
                child.props.tabIndex ?? (child.props['aria-selected'] ? 0 : -1),
            })
          : child
      )}
    </div>
  )
}
