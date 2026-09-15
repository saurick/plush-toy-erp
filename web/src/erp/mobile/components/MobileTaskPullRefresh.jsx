import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ArrowDownOutlined, ReloadOutlined } from '@ant-design/icons'

const RELEASE_HEIGHT = 56

export default function MobileTaskPullRefresh({
  scrollContainerRef,
  enabled,
  busy,
  onRefresh,
  lastUpdated,
}) {
  const latest = useRef({ busy, onRefresh })
  const [pullHeight, setPullHeight] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  useLayoutEffect(() => {
    latest.current = { busy, onRefresh }
  }, [busy, onRefresh])

  useEffect(() => {
    const container = scrollContainerRef.current
    if (!enabled || !container) return undefined
    let gesture = null
    let height = 0
    let inFlight = false
    let disposed = false

    const cancel = () => {
      gesture = null
      height = 0
      setPullHeight(0)
    }
    const start = (event) => {
      cancel()
      if (
        latest.current.busy ||
        inFlight ||
        container.scrollTop > 0 ||
        event.touches.length !== 1 ||
        event.target.closest(
          'input, textarea, select, [contenteditable="true"]'
        )
      ) {
        return
      }
      const touch = event.touches[0]
      gesture = { id: touch.identifier, x: touch.clientX, y: touch.clientY }
    }
    const move = (event) => {
      if (!gesture) return
      const touch = Array.from(event.touches).find(
        (item) => item.identifier === gesture.id
      )
      if (
        !touch ||
        event.touches.length !== 1 ||
        latest.current.busy ||
        container.scrollTop > 0
      ) {
        cancel()
        return
      }
      const dx = Math.abs(touch.clientX - gesture.x)
      const dy = touch.clientY - gesture.y
      if (dy < -8 || (dx > 8 && dx > Math.abs(dy))) {
        cancel()
        return
      }
      if (dy <= 8 && height === 0) return
      if (!event.cancelable) {
        cancel()
        return
      }
      // 只接管列表顶部的向下手势，保留正常滚动、横向手势与表单操作。
      event.preventDefault()
      height = Math.round(Math.min(84, Math.max(0, dy) * 0.5))
      setPullHeight(height)
    }
    const end = () => {
      const shouldRefresh =
        gesture && height >= RELEASE_HEIGHT && !latest.current.busy && !inFlight
      cancel()
      if (!shouldRefresh) return
      inFlight = true
      setRefreshing(true)
      const finish = () => {
        inFlight = false
        if (!disposed) setRefreshing(false)
      }
      // 列表入口负责数据、错误提示与过期请求保护；手势组件只控制局部反馈。
      latest.current
        .onRefresh({ showRefreshFeedback: true })
        .then(finish, finish)
    }

    container.addEventListener('touchstart', start, { passive: true })
    container.addEventListener('touchmove', move, { passive: false })
    container.addEventListener('touchend', end)
    container.addEventListener('touchcancel', cancel)
    return () => {
      disposed = true
      container.removeEventListener('touchstart', start)
      container.removeEventListener('touchmove', move)
      container.removeEventListener('touchend', end)
      container.removeEventListener('touchcancel', cancel)
    }
  }, [enabled, scrollContainerRef])

  if (!enabled) return null
  const ready = pullHeight >= RELEASE_HEIGHT
  const state = refreshing
    ? 'refreshing'
    : ready
      ? 'ready'
      : pullHeight
        ? 'pulling'
        : 'idle'
  return (
    <div
      className="mobile-task-pull-refresh"
      data-testid="mobile-task-pull-refresh"
      data-state={state}
      style={{ height: refreshing ? RELEASE_HEIGHT : pullHeight }}
      aria-hidden={state === 'idle'}
    >
      <div
        className="mobile-task-pull-refresh__feedback"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {refreshing ? (
          <ReloadOutlined className="animate-spin" aria-hidden="true" />
        ) : (
          <ArrowDownOutlined
            className={ready ? 'mobile-task-pull-refresh__ready' : ''}
            aria-hidden="true"
          />
        )}
        <div>
          <div>{refreshing ? '正在刷新' : ready ? '松开刷新' : '下拉刷新'}</div>
          {lastUpdated && lastUpdated !== '—' ? (
            <div className="mobile-task-pull-refresh__time">
              更新于 {lastUpdated}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
