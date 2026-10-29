import React from 'react'

export default function DevPageHeader({
  title,
  navigation,
  tools,
  context,
  children,
  className = '',
  ...props
}) {
  return (
    <header {...props} className={`erp-dev-page-header ${className}`.trim()}>
      <div className="erp-dev-page-header__title">{title}</div>
      {navigation ? (
        <div className="erp-dev-page-header__navigation">{navigation}</div>
      ) : null}
      {children}
      {tools ? (
        <div className="erp-dev-page-header__tools erp-dev-workbench-tools">
          {tools}
        </div>
      ) : null}
      {context ? (
        <div className="erp-dev-page-header__context">{context}</div>
      ) : null}
    </header>
  )
}
