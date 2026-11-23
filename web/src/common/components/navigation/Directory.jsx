import React, { forwardRef } from 'react'
import { Button } from 'antd'
import './directory.css'

export function DirectoryHeader({ children, actions, allExpanded, onToggleAll, className = '' }) {
  return (
    <div className={`erp-directory-header ${className}`.trim()}>
      {children}
      {onToggleAll || actions ? (
        <div className="erp-directory-header__actions">
          {onToggleAll ? (
            <Button size="small" type="default" onClick={onToggleAll}>
              {allExpanded ? '收起全部' : '展开全部'}
            </Button>
          ) : null}
          {actions}
        </div>
      ) : null}
    </div>
  )
}

const Directory = forwardRef(({
  as: Root = 'nav', title, actions, allExpanded, onToggleAll, headerClassName, className = '', children, ...props
}, ref) => {
  return (
    <Root {...props} ref={ref} className={`erp-directory ${className}`.trim()}>
      {title || actions || onToggleAll ? (
        <DirectoryHeader className={headerClassName} allExpanded={allExpanded} onToggleAll={onToggleAll} actions={actions}>
          {title}
        </DirectoryHeader>
      ) : null}
      {children}
    </Root>
  )
})
Directory.displayName = 'Directory'

export default Directory

export function DirectoryItem({ className = '', href, expanded, children, ...props }) {
  const Element = href ? 'a' : 'button'

  return (
    <Element
      {...props}
      type={href ? undefined : 'button'}
      href={href}
      className={`erp-directory-item ${className}`.trim()}
      aria-expanded={expanded}
    >
      {expanded !== undefined ? (
        <span className="erp-directory-disclosure" aria-hidden="true" />
      ) : null}
      {children}
    </Element>
  )
}

export function DirectoryBranch({ as: Branch = 'div', className = '', ...props }) {
  return <Branch {...props} className={`erp-directory-branch ${className}`.trim()} />
}
