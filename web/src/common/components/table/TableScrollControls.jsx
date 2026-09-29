import React, { useLayoutEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { LeftOutlined, RightOutlined } from '@ant-design/icons'
import { Button, Space } from 'antd'
import './table-scroll-controls.css'

export default function TableScrollControls({
  tableRef,
  revision,
  loading = false,
  useToolbar = false,
}) {
  const id = useId()
  const [hosts, setHosts] = useState(null)
  const [position, setPosition] = useState(null)
  const [verticalScrolling, setVerticalScrolling] = useState(false)
  const scrollerRef = useRef(null)
  const bindingRef = useRef(null)
  const loadingRef = useRef(false)
  const busy =
    typeof loading === 'object' ? Boolean(loading?.spinning) : Boolean(loading)

  // Row and loading updates reuse the same hosts. Rebind only when React
  // replaces the actual table or its toolbar, and measure before painting.
  useLayoutEffect(() => {
    loadingRef.current = busy
    const wrapper = tableRef.current?.nativeElement || tableRef.current
    const isAntTable = wrapper?.matches('.ant-table-wrapper')
    const scroller = isAntTable
      ? Array.from(
          wrapper.querySelectorAll('.ant-table-content, .ant-table-body')
        ).find((node) => node.closest('.ant-table-wrapper') === wrapper)
      : wrapper
    const table = scroller?.querySelector('table')
    const scope = wrapper?.closest('[data-table-scroll-scope]')
    const toolbar =
      useToolbar && scope?.querySelector('[data-table-scroll-toolbar]')
    const binding = bindingRef.current
    if (
      binding &&
      binding.wrapper === wrapper &&
      binding.scroller === scroller &&
      binding.table === table &&
      binding.toolbar === toolbar
    ) {
      binding.refresh()
      return
    }
    binding?.dispose()
    bindingRef.current = null
    if (!table) {
      setHosts(null)
      setPosition(null)
      return
    }

    // Only primary tables opt into the surrounding page toolbar. Nested tables
    // and editors keep their controls next to their own table.
    const topHost = toolbar || document.createElement('div')
    if (!toolbar) {
      topHost.className = 'app-table-scroll-top'
      wrapper.prepend(topHost)
    }
    const bottomHost = document.createElement('div')
    bottomHost.className = 'app-table-scroll-bottom'
    if (isAntTable) scroller.after(bottomHost)
    else wrapper.append(bottomHost)
    wrapper.dataset.tableScrollId = id
    setHosts({ top: topHost, bottom: bottomHost })
    setVerticalScrolling(false)
    scrollerRef.current = scroller

    const ancestors = []
    for (let node = scroller; node; node = node.parentElement) {
      const style = getComputedStyle(node)
      const clipX = /auto|scroll|hidden|clip/.test(style.overflowX)
      const clipY = /auto|scroll|hidden|clip/.test(style.overflowY)
      if (clipX || clipY) ancestors.push({ node, clipX, clipY })
    }
    const scrollTops = new Map(
      ancestors.map(({ node }) => [node, node.scrollTop])
    )
    scrollTops.set(window, window.scrollY)
    let frame = 0
    let settleTimer = 0
    const loadingContainer = isAntTable
      ? wrapper.querySelector('.ant-spin-container')
      : null
    const originalMinHeight = loadingContainer?.style.minHeight
    let contentHeight = 0
    const syncLoadingHeight = () => {
      if (!loadingContainer) return
      // Some lists clear rows while fetching. Keep their scroll extent until
      // the response arrives so the browser does not clamp the page to the top.
      loadingContainer.style.minHeight =
        loadingRef.current && contentHeight
          ? `${contentHeight}px`
          : originalMinHeight
    }
    const measure = () => {
      frame = 0
      syncLoadingHeight()
      if (loadingRef.current) return
      const maxLeft = scroller.scrollWidth - scroller.clientWidth
      const row = table.querySelector(
        isAntTable ? 'tbody > tr.ant-table-row' : 'tbody > tr'
      )
      const enabled = maxLeft > 2 && row && scroller.clientWidth
      scroller.classList.toggle('app-table-scroll-enhanced', Boolean(enabled))
      contentHeight = loadingContainer?.scrollHeight || 0
      if (!enabled) {
        setPosition(null)
        return
      }

      const box = scroller.getBoundingClientRect()
      const tableBox = table.getBoundingClientRect()
      const dockHeight = bottomHost.offsetHeight || 24
      let top = Math.max(0, box.top)
      let bottom = Math.min(
        innerHeight,
        box.top + scroller.clientHeight + (isAntTable ? dockHeight : 0),
        tableBox.bottom + dockHeight
      )
      let left = Math.max(0, box.left)
      let right = Math.min(innerWidth, box.left + scroller.clientWidth)
      ancestors.forEach(({ node, clipX, clipY }) => {
        // The dock sits outside Ant's horizontal scroller, inside the same card.
        if (node === scroller && isAntTable) return
        const rect = node.getBoundingClientRect()
        if (clipY) {
          top = Math.max(top, rect.top + node.clientTop)
          bottom = Math.min(
            bottom,
            rect.top + node.clientTop + node.clientHeight
          )
        }
        if (clipX) {
          left = Math.max(left, rect.left + node.clientLeft)
          right = Math.min(
            right,
            rect.left + node.clientLeft + node.clientWidth
          )
        }
      })
      let fixedWidth = 0
      Array.from(row.cells).forEach((cell) => {
        if (getComputedStyle(cell).position === 'sticky') {
          fixedWidth += cell.getBoundingClientRect().width
        }
      })
      const next = {
        left: Math.max(0, Math.min(maxLeft, scroller.scrollLeft)),
        maxLeft,
        width: scroller.clientWidth,
        step: Math.max(80, (scroller.clientWidth - fixedWidth) * 0.8),
        thumb: Math.max(32, scroller.clientWidth ** 2 / scroller.scrollWidth),
        dockOffset: Math.min(
          0,
          bottom - dockHeight - bottomHost.getBoundingClientRect().top
        ),
        dockVisible: bottom - top > dockHeight + 16 && right - left > 80,
      }
      setPosition((previous) =>
        previous &&
        Object.keys(next).every((key) => previous[key] === next[key])
          ? previous
          : next
      )
    }
    const schedule = () => {
      if (!frame && !settleTimer) frame = requestAnimationFrame(measure)
    }
    const onScroll = (event) => {
      const node = event.currentTarget
      const top = node === window ? window.scrollY : node.scrollTop
      if (top !== scrollTops.get(node)) {
        scrollTops.set(node, top)
        setVerticalScrolling(true)
        cancelAnimationFrame(frame)
        frame = 0
        clearTimeout(settleTimer)
        // Reveal together with the settled geometry; horizontal scrolling keeps
        // updating the thumb without hiding the control being dragged.
        settleTimer = window.setTimeout(() => {
          settleTimer = 0
          measure()
          setVerticalScrolling(false)
        }, 180)
      }
      schedule()
    }
    const observer = new ResizeObserver(schedule)
    ;[wrapper, scroller, table, bottomHost, topHost].forEach((node) =>
      observer.observe(node)
    )
    ancestors.forEach(({ node }) =>
      node.addEventListener('scroll', onScroll, { passive: true })
    )
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', schedule)
    const dispose = () => {
      cancelAnimationFrame(frame)
      clearTimeout(settleTimer)
      observer.disconnect()
      ancestors.forEach(({ node }) =>
        node.removeEventListener('scroll', onScroll)
      )
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', schedule)
      scroller.classList.remove('app-table-scroll-enhanced')
      delete wrapper.dataset.tableScrollId
      if (!toolbar) topHost.remove()
      bottomHost.remove()
      if (loadingContainer) loadingContainer.style.minHeight = originalMinHeight
      scrollerRef.current = null
    }
    bindingRef.current = {
      wrapper,
      scroller,
      table,
      toolbar,
      dispose,
      // Data changes must update the occupied space before paint, even while
      // vertical scrolling keeps the dock hidden until the idle timer ends.
      refresh: measure,
    }
    measure()
  }, [tableRef, revision, useToolbar, id, busy, hosts, position])

  useLayoutEffect(
    () => () => {
      bindingRef.current?.dispose()
      bindingRef.current = null
    },
    []
  )

  if (!hosts || !position) return null
  const scroll = (direction) =>
    scrollerRef.current?.scrollBy({
      left: direction * position.step,
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'auto'
        : 'smooth',
    })
  return (
    <>
      {createPortal(
        <Space.Compact
          className="app-table-scroll-buttons"
          role="group"
          aria-label="表格横向查看"
          data-table-scroll-for={id}
        >
          <Button
            aria-label="向左查看列"
            title="向左查看列"
            icon={<LeftOutlined aria-hidden="true" />}
            disabled={busy || position.left <= 1}
            onClick={() => scroll(-1)}
          />
          <Button
            aria-label="向右查看列"
            title="向右查看列"
            icon={<RightOutlined aria-hidden="true" />}
            disabled={busy || position.left >= position.maxLeft - 1}
            onClick={() => scroll(1)}
          />
        </Space.Compact>,
        hosts.top
      )}
      {createPortal(
        <div
          className="app-table-scroll-dock"
          style={{
            width: position.width,
            transform: `translateY(${position.dockOffset}px)`,
            visibility:
              position.dockVisible && !verticalScrolling && !busy
                ? 'visible'
                : 'hidden',
          }}
        >
          <input
            className="app-table-scroll-range"
            type="range"
            disabled={busy}
            aria-label="横向滚动位置"
            aria-valuetext={`${Math.round((position.left / position.maxLeft) * 100)}%`}
            min={0}
            max={position.maxLeft}
            step="any"
            value={position.left}
            style={{ '--table-scroll-thumb': `${position.thumb}px` }}
            onChange={(event) => {
              if (scrollerRef.current) {
                scrollerRef.current.scrollLeft = Number(event.target.value)
              }
            }}
          />
        </div>,
        hosts.bottom
      )}
    </>
  )
}
