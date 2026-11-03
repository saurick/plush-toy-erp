import React from 'react'
import { ExclamationCircleOutlined, LockOutlined } from '@ant-design/icons'
import { Empty, Spin } from 'antd'
import './empty-state.css'

const STATE_IMAGES = {
  error: <ExclamationCircleOutlined aria-hidden="true" />,
  denied: <LockOutlined aria-hidden="true" />,
}
const STATE_DESCRIPTIONS = {
  empty: '暂无记录',
  loading: '正在读取…',
  error: '读取失败，请重试',
  denied: '当前账号无权查看此内容',
}

export default function AppEmpty({
  variant = 'default',
  state = 'empty',
  description = STATE_DESCRIPTIONS[state],
  detail,
  children,
  className = '',
  image,
  ...props
}) {
  const classes = [
    'erp-empty',
    variant !== 'default' && `erp-empty--${variant}`,
    state !== 'empty' && `erp-empty--${state}`,
    className,
  ]
    .filter(Boolean)
    .join(' ')
  const role = state === 'error' ? 'alert' : 'status'
  const copy = detail ? (
    <>
      <div>{description}</div>
      <div className="erp-empty__detail">{detail}</div>
    </>
  ) : (
    description
  )

  if (state === 'loading') {
    return (
      <div
        {...props}
        className={`erp-content-loading erp-content-loading--${variant} ${className}`.trim()}
        role="status"
        aria-busy="true"
        data-read-state="loading"
      >
        <Spin size="small" />
        <span>{description}</span>
      </div>
    )
  }

  if (variant === 'inline') {
    return (
      <div
        {...props}
        className={classes}
        role={role}
        data-empty-state={state}
        data-empty-variant={variant}
      >
        {STATE_IMAGES[state] ? (
          <span className="erp-empty__inline-icon">{STATE_IMAGES[state]}</span>
        ) : null}
        <div className="erp-empty__copy">{copy}</div>
        {children ? <div className="erp-empty__actions">{children}</div> : null}
      </div>
    )
  }

  return (
    <Empty
      {...props}
      className={classes}
      role={role}
      data-empty-state={state}
      data-empty-variant={variant}
      image={image ?? STATE_IMAGES[state] ?? Empty.PRESENTED_IMAGE_SIMPLE}
      description={copy}
    >
      {children}
    </Empty>
  )
}
