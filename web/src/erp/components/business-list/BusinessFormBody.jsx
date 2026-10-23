import React, { useEffect, useRef, useState } from 'react'
import Select from '@/common/components/select/AppSelect'
import MobileBackToTop from '@/common/components/scroll/MobileBackToTop'
import { activeFormSectionIndex } from '../../utils/businessFormSections.mjs'

function renderSectionPopup(menu) {
  // 跳转后由分区标题接收焦点，阻止弹层再次聚焦选择框。
  return <div onMouseDown={(event) => event.stopPropagation()}>{menu}</div>
}

export default function BusinessFormBody({ open, loading, busy, children }) {
  const bodyRef = useRef(null)
  const navigationAnchor = useRef(null)
  const [sections, setSections] = useState([])
  const [active, setActive] = useState('')

  useEffect(() => {
    if (!open || loading) return undefined
    const body = bodyRef.current
    let frame = 0
    const update = () => {
      frame = 0
      const nodes = [...body.querySelectorAll('[data-form-section]')].filter(
        (node) => node.getClientRects().length > 0
      )
      const next = nodes.map((node) => ({
        id: node.id,
        title: node.dataset.formSection,
      }))
      setSections((previous) =>
        previous.length === next.length &&
        previous.every(
          (section, index) =>
            section.id === next[index].id && section.title === next[index].title
        )
          ? previous
          : next
      )
      const { top } = body.getBoundingClientRect()
      const index = activeFormSectionIndex(
        nodes.map(
          (node) => node.getBoundingClientRect().top - top + body.scrollTop
        ),
        body.scrollTop,
        body.clientHeight,
        body.scrollHeight
      )
      const anchor = navigationAnchor.current
      if (anchor && Math.abs(body.scrollTop - anchor.top) <= 2) {
        setActive(anchor.id)
      } else {
        navigationAnchor.current = null
        setActive(next[index]?.id || '')
      }
    }
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update)
    }
    const mutation = new MutationObserver(schedule)
    mutation.observe(body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['hidden', 'data-form-section'],
    })
    const resize = new ResizeObserver(schedule)
    resize.observe(body)
    if (body.firstElementChild) resize.observe(body.firstElementChild)
    body.addEventListener('scroll', schedule, { passive: true })
    navigationAnchor.current = null
    body.scrollTop = 0
    update()
    return () => {
      mutation.disconnect()
      resize.disconnect()
      body.removeEventListener('scroll', schedule)
      window.cancelAnimationFrame(frame)
    }
  }, [loading, open])

  const navigate = (id) => {
    const body = bodyRef.current
    const section = [...body.querySelectorAll('[data-form-section]')].find(
      (node) => node.id === id
    )
    if (!section) return
    window.requestAnimationFrame(() => {
      if (!section.isConnected) return
      const top = Math.max(
        0,
        Math.min(
          section.getBoundingClientRect().top -
            body.getBoundingClientRect().top +
            body.scrollTop -
            12,
          body.scrollHeight - body.clientHeight
        )
      )
      // Keep the chosen section active when the viewport cannot align it at the top.
      navigationAnchor.current = { id, top }
      body.scrollTo({ top, behavior: 'instant' })
      setActive(id)
      const heading =
        section.querySelector('[role="heading"][tabindex]') || section
      heading?.focus({ preventScroll: true })
    })
  }
  const showNavigation = open && !loading && sections.length >= 3

  return (
    <div
      className="erp-business-form-page__main"
      data-section-navigation={showNavigation ? 'true' : undefined}
    >
      {showNavigation ? (
        <nav
          className="erp-business-form-page__navigation"
          aria-label="表单分区"
          inert={busy ? '' : undefined}
        >
          <div className="erp-business-form-page__section-links">
            {sections.map((section) => (
              <button
                key={section.id}
                type="button"
                aria-current={section.id === active ? 'location' : undefined}
                aria-controls={section.id}
                onClick={() => navigate(section.id)}
              >
                {section.title}
              </button>
            ))}
          </div>
          <label className="erp-business-form-page__section-picker">
            跳转到
            <Select
              allowClear={false /* 不可清空：此值反映当前滚动位置，文档分区始终存在，清空不会改变当前位置。 */}
              placeholder="跳转到"
              aria-label="跳转到"
              disabled={busy}
              virtual={false}
              data-value={active}
              value={active}
              onSelect={navigate}
              popupRender={renderSectionPopup}
              options={sections.map(({ id, title }) => ({
                value: id,
                label: title,
                'data-select-value': id,
              }))}
            />
          </label>
        </nav>
      ) : null}
      <div
        ref={bodyRef}
        className="erp-business-form-page__body"
        inert={busy || loading ? '' : undefined}
      >
        {children}
        <MobileBackToTop mobileOnly enabled={open && !loading && !busy} />
      </div>
    </div>
  )
}
