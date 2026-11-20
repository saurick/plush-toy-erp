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

  useLayoutEffect(() => {
    if (!enabled) {
      setPullHeight(0)
      setRefreshing(false)
    }
  }, [enabled])

  useEffect(() => {
    const container = scrollContainerRef.current
    if (!enabled || !container) return undefined
    let gesture = null
    let height = 0
    let inFlight = false
    let disposed = false
    let frame = 0
    let finishTimer = 0

    const cancel = () => {
      cancelAnimationFrame(frame)
      frame = 0
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
      const distance = Math.max(0, dy - 8) * 0.5
      // 达到释放距离后逐渐增加阻力，避免拖到上限突然停住。
      height =
        distance <= RELEASE_HEIGHT
          ? distance
          : RELEASE_HEIGHT +
            28 * (1 - Math.exp(-(distance - RELEASE_HEIGHT) / 28))
      if (!frame) {
        frame = requestAnimationFrame(() => {
          frame = 0
          setPullHeight(height)
        })
      }
    }
    const end = () => {
      const shouldRefresh =
        gesture && height >= RELEASE_HEIGHT && !latest.current.busy && !inFlight
      cancel()
      if (!shouldRefresh) return
      inFlight = true
      setRefreshing(true)
      const startedAt = performance.now()
      const finish = () => {
        if (disposed) return
        // 只让指示器走完松手收拢；请求和数据呈现不等待动画。
        const hold = window.matchMedia('(prefers-reduced-motion: reduce)')
          .matches
          ? 0
          : Math.max(0, 260 - (performance.now() - startedAt))
        finishTimer = window.setTimeout(() => {
          inFlight = false
          if (!disposed) setRefreshing(false)
        }, hold)
      }
      // 列表入口负责数据、错误提示与过期请求保护；手势组件只控制局部反馈。
      Promise.resolve()
        .then(() => latest.current.onRefresh({ showRefreshFeedback: true }))
        .then(finish, finish)
    }

    container.addEventListener('touchstart', start, { passive: true })
    container.addEventListener('touchmove', move, { passive: false })
    container.addEventListener('touchend', end)
    container.addEventListener('touchcancel', cancel)
    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      clearTimeout(finishTimer)
      container.removeEventListener('touchstart', start)
      container.removeEventListener('touchmove', move)
      container.removeEventListener('touchend', end)
      container.removeEventListener('touchcancel', cancel)
    }
  }, [enabled, scrollContainerRef])

  // Keep the zero-height host in the layout when a filter disables gestures.
  const ready = pullHeight >= RELEASE_HEIGHT
  const state = !enabled
    ? 'idle'
    : refreshing
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
      style={{
        height: enabled ? (refreshing ? RELEASE_HEIGHT : pullHeight) : 0,
      }}
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
