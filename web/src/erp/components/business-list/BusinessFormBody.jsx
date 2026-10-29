import React, { useEffect, useRef, useState } from 'react'
import Select from '@/common/components/select/AppSelect'
import MobileBackToTop from '@/common/components/scroll/MobileBackToTop'
import { activeFormSectionIndex } from '../../utils/businessFormSections.mjs'

function renderSectionPopup(menu) {
  // 跳转后由分区标题接收焦点，阻止弹层再次聚焦选择框。
  return <div onMouseDown={(event) => event.stopPropagation()}>{menu}</div>
}

function formSectionScroller(body) {
  let candidate = body
  while (candidate && candidate !== document.body) {
    if (/(auto|scroll)/u.test(window.getComputedStyle(candidate).overflowY)) return candidate
    candidate = candidate.parentElement
  }
  return body
}

export default function BusinessFormBody({ open, active: presented = true, loading, busy, children, navigation = true }) {
  const bodyRef = useRef(null)
  const navigationAnchor = useRef(null)
  const rememberedScroll = useRef(0)
  const [sections, setSections] = useState([])
  const [active, setActive] = useState('')
  const [scrollArea, setScrollArea] = useState({ shared: false, top: 0, height: 0 })

  useEffect(() => {
    if (!open) rememberedScroll.current = 0
    if (!open || !presented || loading || !navigation) return undefined
    const body = bodyRef.current
    const page = body.closest('[data-business-form-page]')
    const scroller = formSectionScroller(body)
    let frame = 0
    const update = () => {
      frame = 0
      const workspaceNavigation = page?.closest('[data-business-editor-workspace]')?.querySelector(':scope > [data-business-editor-navigation]')
      const top = (scroller.querySelector('.erp-task-action-drawer__navigation')?.offsetHeight || 0) + (scroller !== body ? workspaceNavigation?.offsetHeight || 0 : 0)
      const height = Math.max(0, scroller.clientHeight - top)
      const shared = scroller !== body
      setScrollArea((previous) => previous.shared === shared && previous.top === top && previous.height === height ? previous : { shared, top, height })
      const nodes = [...body.querySelectorAll('[data-form-section]')].filter((node) =>
        node.getClientRects().length > 0 &&
        node.closest('[data-business-form-page]') === page
      )
      const next = nodes.map((node) => ({ id: node.id, title: node.dataset.formSection }))
      setSections((previous) =>
        previous.length === next.length &&
        previous.every(
          (section, index) =>
            section.id === next[index].id && section.title === next[index].title
        )
          ? previous
          : next
      )
      const scrollerTop = scroller.getBoundingClientRect().top
      const sectionNavigation = body.parentElement.querySelector(':scope > .erp-business-form-page__navigation')
      const picker = sectionNavigation?.querySelector('.erp-business-form-page__section-picker')
      const pickerHeight = shared && picker?.getClientRects().length ? sectionNavigation.offsetHeight : 0
      const readingInset = shared ? top + pickerHeight : 0
      const index = activeFormSectionIndex(
        nodes.map(
          (node) => node.getBoundingClientRect().top - scrollerTop + scroller.scrollTop
        ),
        scroller.scrollTop + readingInset,
        Math.max(0, scroller.clientHeight - readingInset),
        scroller.scrollHeight
      )
      const anchor = navigationAnchor.current
      if (anchor && Math.abs(scroller.scrollTop - anchor.top) <= 2) {
        setActive(anchor.id)
      } else {
        navigationAnchor.current = null
        setActive(next[index]?.id || '')
      }
    }
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update)
    }
    const onScroll = () => {
      rememberedScroll.current = scroller.scrollTop
      schedule()
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
    if (scroller !== body) resize.observe(scroller)
    if (body.firstElementChild) resize.observe(body.firstElementChild)
    scroller.addEventListener('scroll', onScroll, { passive: true })
    navigationAnchor.current = null
    scroller.scrollTop = rememberedScroll.current
    update()
    return () => {
      mutation.disconnect()
      resize.disconnect()
      scroller.removeEventListener('scroll', onScroll)
      window.cancelAnimationFrame(frame)
    }
  }, [loading, open, presented, navigation])

  const navigate = (id) => {
    const body = bodyRef.current
    const scroller = formSectionScroller(body)
    const section = [...body.querySelectorAll('[data-form-section]')].find(
      (node) => node.id === id
    )
    if (!section) return
    window.requestAnimationFrame(() => {
      if (!section.isConnected) return
      const navigation = scroller.querySelector('.erp-task-action-drawer__navigation')
      const workspaceNavigation = body.closest('[data-business-editor-workspace]')?.querySelector(':scope > [data-business-editor-navigation]')
      const sectionNavigation = body.parentElement.querySelector(':scope > .erp-business-form-page__navigation')
      const picker = sectionNavigation?.querySelector('.erp-business-form-page__section-picker')
      const pickerHeight = scroller !== body && picker?.getClientRects().length ? sectionNavigation.offsetHeight : 0
      const fixedBottom = Math.max(navigation?.getBoundingClientRect().bottom || 0, scroller !== body ? workspaceNavigation?.getBoundingClientRect().bottom || 0 : 0)
      const offset = Math.max(12, fixedBottom ? fixedBottom - scroller.getBoundingClientRect().top + pickerHeight + 12 : pickerHeight + 12)
      const top = Math.max(
        0,
        Math.min(
          section.getBoundingClientRect().top -
            scroller.getBoundingClientRect().top +
            scroller.scrollTop -
            offset,
          scroller.scrollHeight - scroller.clientHeight
        )
      )
      // Keep the chosen section active when the viewport cannot align it at the top.
      navigationAnchor.current = { id, top }
      rememberedScroll.current = top
      scroller.scrollTo({ top, behavior: 'instant' })
      setActive(id)
      const heading =
        section.querySelector('h2[tabindex], [role="heading"][tabindex]') || section
      heading?.focus({ preventScroll: true })
    })
  }
  const showNavigation = navigation && open && !loading && sections.length >= 3

  return (
    <div
      className="erp-business-form-page__main"
      data-section-navigation={showNavigation ? 'true' : undefined}
      data-shared-scroll={scrollArea.shared ? 'true' : undefined}
      style={scrollArea.shared ? { '--erp-form-section-top': `${scrollArea.top}px`, '--erp-form-section-height': `${scrollArea.height}px` } : undefined}
    >
      {showNavigation ? (
        <nav
          className="erp-business-form-page__navigation"
          aria-label="表单分区"
          inert={busy ? '' : undefined}
        >
          <div className="erp-business-form-page__navigation-content">
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
          </div>
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
