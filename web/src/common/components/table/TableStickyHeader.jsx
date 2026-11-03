import React, { useLayoutEffect, useRef } from 'react'
import { findTableScrollToolbar } from './tableScrollToolbar.mjs'
import './table-scroll-controls.css'

function scrollContainer(node) {
  for (let parent = node.parentElement; parent; parent = parent.parentElement) {
    if (/(auto|scroll)/u.test(getComputedStyle(parent).overflowY)) return parent
  }
  return document.documentElement
}

export function useTableStickyToolbar(ref, enabled, offset = '0px') {
  useLayoutEffect(() => {
    const toolbar = ref.current
    if (!enabled || !toolbar) return undefined
    const scope = toolbar.parentElement
    scope.style.setProperty('--app-table-sticky-offset', offset)
    const container = scrollContainer(toolbar)
    const desktop = window.matchMedia('(min-width: 768px) and (min-height: 501px)')
    const measure = () => {
      const { height } = toolbar.getBoundingClientRect()
      // 换行后的多排按钮和低窗口不占用持续阅读空间。
      const active = desktop.matches && height > 0 && height <= 64 && container.clientHeight - height >= 240
      toolbar.dataset.tableStickyToolbar = String(active)
      scope.style.setProperty('--app-table-toolbar-height', `${active ? height : 0}px`)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(toolbar)
    observer.observe(container)
    desktop.addEventListener('change', measure)
    measure()
    return () => {
      observer.disconnect()
      desktop.removeEventListener('change', measure)
      delete toolbar.dataset.tableStickyToolbar
      scope.style.removeProperty('--app-table-toolbar-height')
      scope.style.removeProperty('--app-table-sticky-offset')
    }
  }, [enabled, offset, ref])
}

const CELL_STYLES = [
  'box-sizing', 'height', 'padding', 'border-top', 'border-right', 'border-bottom', 'border-left',
  'background-color', 'color', 'font-family', 'font-size', 'font-weight', 'font-style',
  'line-height', 'letter-spacing', 'font-variant-numeric', 'text-align', 'vertical-align', 'white-space',
  'overflow-wrap', 'position', 'left', 'right', 'z-index', 'box-shadow',
]

// 横向滚动容器会截断原生纵向 sticky。只镜像静态列名；真实表头及字段留在原表，
// 吸顶层不进入无障碍树、不接收输入，并和原表共用实测列宽及横向位置。
export default function TableStickyHeader({ tableRef, revision }) {
  const hostRef = useRef(null)
  const viewportRef = useRef(null)
  const mirrorRef = useRef(null)
  const bindingRef = useRef(null)
  useLayoutEffect(() => {
    const scroller = tableRef.current
    const table = scroller?.querySelector('table')
    const head = table?.tHead
    const host = hostRef.current
    const toolbar = findTableScrollToolbar(scroller)
    const binding = bindingRef.current
    if (binding && binding.scroller === scroller && binding.head === head && binding.toolbar === toolbar) return
    binding?.dispose()
    bindingRef.current = null
    if (!host || !head || !toolbar) return
    const region = host.parentElement
    const container = scrollContainer(region)
    const viewport = viewportRef.current
    const mirror = mirrorRef.current
    mirror.dataset.tableLines = table.dataset.tableLines
    let frame = 0
    let dirty = true
    let signature = ''
    const syncScroll = () => { viewport.scrollLeft = scroller.scrollLeft }
    const syncVisibility = () => {
      if (host.hidden) return
      // 原表头在位时保留真实控件，吸顶后由静态镜像阻挡下方数据行。
      const visibility = head.getBoundingClientRect().top < host.getBoundingClientRect().top - 1 ? 'visible' : 'hidden'
      if (host.style.visibility !== visibility) host.style.visibility = visibility
    }
    const measure = () => {
      frame = 0
      const { height } = head.getBoundingClientRect()
      const active = height > 0 && container.clientHeight >= 280 && getComputedStyle(table).display === 'table'
      host.hidden = !active
      if (!active) {
        signature = ''
        region.style.removeProperty('--app-table-header-height')
        return
      }
      const cells = [...head.rows[0].cells]
      const widths = cells.map((cell) => cell.getBoundingClientRect().width)
      const { width } = table.getBoundingClientRect()
      const next = `${height}:${width}:${scroller.clientWidth}:${scroller.clientLeft}:${scroller.clientTop}:${widths.join(',')}`
      if (dirty || signature !== next) {
        signature = next
        dirty = false
        const copy = head.cloneNode(true)
        copy.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'))
        copy.querySelectorAll('button').forEach((node) => node.replaceWith(document.createTextNode(node.textContent)))
        const sourceCells = [...head.querySelectorAll('th, td')]
        copy.querySelectorAll('th, td').forEach((cell, index) => {
          const style = getComputedStyle(sourceCells[index])
          CELL_STYLES.forEach((property) => cell.style.setProperty(property, style.getPropertyValue(property)))
        })
        const columns = document.createElement('colgroup')
        widths.forEach((cellWidth) => {
          const column = document.createElement('col')
          column.style.width = `${cellWidth}px`
          columns.append(column)
        })
        const style = getComputedStyle(table)
        mirror.style.width = `${width}px`
        mirror.style.borderCollapse = style.borderCollapse
        mirror.style.borderSpacing = style.borderSpacing
        mirror.replaceChildren(columns, copy)
        viewport.style.width = `${scroller.clientWidth}px`
        viewport.style.marginInlineStart = `${scroller.clientLeft}px`
        host.style.paddingBlockStart = `${scroller.clientTop}px`
        region.style.setProperty('--app-table-header-height', `${height + scroller.clientTop}px`)
      }
      syncScroll()
      syncVisibility()
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure)
    }
    const refresh = () => { dirty = true; schedule() }
    const resize = new ResizeObserver(schedule)
    ;[scroller, table, head, container].forEach((node) => resize.observe(node))
    const mutation = new MutationObserver(refresh)
    mutation.observe(head, { childList: true, characterData: true, subtree: true })
    const columns = table.querySelector(':scope > colgroup')
    if (columns) mutation.observe(columns, { childList: true, attributes: true, attributeFilter: ['style', 'class', 'span'], subtree: true })
    const theme = new MutationObserver(refresh)
    for (let node = scroller; node; node = node.parentElement) {
      theme.observe(node, { attributes: true, attributeFilter: ['class', 'data-erp-theme', 'data-erp-density', 'data-erp-table-lines', ...(node.matches('html, body, [data-erp-theme]') ? ['style'] : [])] })
    }
    scroller.addEventListener('scroll', syncScroll, { passive: true })
    const scrollTarget = container === document.documentElement ? window : container
    scrollTarget.addEventListener('scroll', syncVisibility, { passive: true })
    measure()
    const dispose = () => {
      cancelAnimationFrame(frame)
      resize.disconnect()
      mutation.disconnect()
      theme.disconnect()
      scroller.removeEventListener('scroll', syncScroll)
      scrollTarget.removeEventListener('scroll', syncVisibility)
      region.style.removeProperty('--app-table-header-height')
      mirror.replaceChildren()
      host.hidden = true
      host.style.removeProperty('visibility')
    }
    bindingRef.current = { scroller, head, toolbar, dispose }
  }, [revision, tableRef])
  useLayoutEffect(() => () => {
    bindingRef.current?.dispose()
    bindingRef.current = null
  }, [])
  return (
    <div ref={hostRef} className="app-table-sticky-header" data-table-sticky-header aria-hidden="true" hidden>
      <div ref={viewportRef} className="app-table-sticky-header__viewport">
        <table ref={mirrorRef} className="app-table-sticky-header__table" data-table-lines="appearance" inert="" />
      </div>
    </div>
  )
}
