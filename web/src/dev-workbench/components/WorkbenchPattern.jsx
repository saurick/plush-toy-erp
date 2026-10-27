import React, { useId } from 'react'
import {
  CheckCircleOutlined,
  CloseCircleOutlined,
  ExclamationCircleOutlined,
  InfoCircleOutlined,
  LoadingOutlined,
} from '@ant-design/icons'
import '../styles/dev-workbench-pattern.css'

// Page families compose these parts; data identity, permissions and operations stay with the caller.
export function WorkbenchSection({
  title,
  titleId,
  headingLevel = 2,
  description,
  actions,
  tools,
  footer,
  flat = false,
  className = '',
  children,
  ...props
}) {
  const generatedId = useId()
  const id = titleId || generatedId
  const Heading = `h${headingLevel}`
  return (
    <section
      aria-labelledby={title && !props['aria-label'] ? id : undefined}
      {...props}
      className={`erp-workbench-section${flat ? ' erp-workbench-section--flat' : ''} ${className}`}
    >
      {title || actions || tools ? (
        <header className="erp-workbench-section__heading">
          <div className="erp-workbench-section__title">
            {title ? <Heading id={id}>{title}</Heading> : null}
            {description ? (
              <div className="erp-workbench-section__description">
                {description}
              </div>
            ) : null}
          </div>
          {actions ? (
            <div className="erp-workbench-section__actions">{actions}</div>
          ) : null}
          {tools ? (
            <div className="erp-workbench-section__tools">{tools}</div>
          ) : null}
        </header>
      ) : description ? (
        <div className="erp-workbench-section__description">{description}</div>
      ) : null}
      {children}
      {footer ? (
        <footer className="erp-workbench-section__footer">{footer}</footer>
      ) : null}
    </section>
  )
}

export function WorkbenchToolbar({
  children,
  actions,
  className = '',
  ...props
}) {
  return (
    <div {...props} className={`erp-workbench-toolbar ${className}`}>
      <div className="erp-workbench-toolbar__controls">{children}</div>
      {actions ? (
        <div className="erp-workbench-toolbar__actions">{actions}</div>
      ) : null}
    </div>
  )
}

export function WorkbenchFacts({ items, className = '', ...props }) {
  return (
    <dl {...props} className={`erp-workbench-facts ${className}`}>
      {items.map(({ key, label, value }) => (
        <div key={key || label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  )
}

const NOTICE_ICONS = {
  success: CheckCircleOutlined,
  warning: ExclamationCircleOutlined,
  error: CloseCircleOutlined,
  info: InfoCircleOutlined,
  loading: LoadingOutlined,
}

export function WorkbenchNotice({
  title,
  description,
  tone = 'info',
  action,
  details,
  detailsLabel = '判断依据与边界',
  className = '',
  ...props
}) {
  const Icon = NOTICE_ICONS[tone] || InfoCircleOutlined
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      {...props}
      className={`erp-workbench-notice ${className}`}
      data-tone={tone}
    >
      <div className="erp-workbench-notice__summary">
        <Icon aria-hidden="true" />
        <div className="erp-workbench-notice__copy">
          <strong>{title}</strong>
          {description ? <div>{description}</div> : null}
        </div>
        {action ? (
          <div className="erp-workbench-notice__action">{action}</div>
        ) : null}
      </div>
      {details ? (
        <details className="erp-workbench-notice__details">
          <summary>{detailsLabel}</summary>
          <div>{details}</div>
        </details>
      ) : null}
    </div>
  )
}

export function WorkbenchEmpty({ title, description, action, className = '' }) {
  return (
    <div className={`erp-workbench-empty ${className}`} role="status">
      <strong>{title}</strong>
      {description ? <div>{description}</div> : null}
      {action || null}
    </div>
  )
}
