import React from 'react'
import { Spin } from 'antd'
import './loading.css'

// 通用页面加载占位，统一收口路由切页与异步取数时的加载体验。
export const Loading = ({
  title = '加载中',
  description = '正在准备当前页面，请稍候...',
  fullscreen = false,
  className = '',
}) => {
  const rootClassName = [
    'loading-page',
    fullscreen ? 'loading-page--fullscreen' : 'loading-page--inline',
    className,
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={rootClassName} role="status" aria-live="polite">
      <div className="loading-page__panel">
        <Spin size="large" />
        <div className="loading-page__copy">
          <div className="loading-page__title">{title}</div>
          {description ? (
            <div className="loading-page__description">{description}</div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
