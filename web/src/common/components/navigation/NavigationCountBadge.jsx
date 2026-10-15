import React from 'react'
import { theme } from 'antd'
import './navigation-count-badge.css'

export function navigationCountDescription({ count, error, loading, label = '待我处理' }) {
  if (Number.isSafeInteger(count) && count >= 0) {
    return `${label} ${count} 项${error ? '，数量待更新，请刷新重试' : loading ? '，正在更新' : ''}`
  }
  return `${label}：${error ? '数量暂不可用，请刷新重试' : '数量读取中'}`
}

export default function NavigationCountBadge({ count, error = false, loading = false, risk = false, label = '待我处理' }) {
  const { token } = theme.useToken()
  const known = Number.isSafeInteger(count) && count >= 0
  if (known && count === 0 && !error) return null
  const text = known && count > 0 ? (count > 99 ? '99+' : count) : error ? '?' : '…'
  return (
    <span
      className={`navigation-count-badge${error ? ' navigation-count-badge--stale' : ''}`}
      data-count-state={error ? 'stale' : loading ? 'loading' : 'ready'}
      title={navigationCountDescription({ count, error, loading, label })}
      aria-label={navigationCountDescription({ count, error, loading, label })}
      style={{
        '--navigation-count-bg': risk ? token.colorErrorBg : token.colorFillSecondary,
        '--navigation-count-color': risk ? token.colorErrorTextActive : token.colorTextSecondary,
      }}
    >
      {text}{error && known && count > 0 ? <small aria-hidden="true">↻</small> : null}
    </span>
  )
}
