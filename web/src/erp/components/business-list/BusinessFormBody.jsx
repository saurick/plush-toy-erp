import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react'
import Select from '@/common/components/select/AppSelect'
import MobileBackToTop from '@/common/components/scroll/MobileBackToTop'
import SlidingTabList from '@/common/components/navigation/SlidingTabList'
import { activeFormSectionIndex } from '../../utils/businessFormSections.mjs'
import { BusinessFormSectionContext } from './BusinessFormSectionContext.js'

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

const BusinessFormBody = forwardRef(({ open, active: presented = true, loading, busy, children, navigation = true, formDisplay = 'all' }, ref) => {
  const bodyRef = useRef(null)
  const navigationAnchor = useRef(null)
  const rememberedScroll = useRef(0)
  const sectionPositions = useRef(new Map())
  const positionKeyRef = useRef('all')
  const [sections, setSections] = useState([])
  const [active, setActive] = useState('')
  const [scrollArea, setScrollArea] = useState({ shared: false, top: 0, height: 0, readingTop: 0 })
  const showNavigation = navigation && open && !loading && sections.length >= 3
  const sectionMode = showNavigation && formDisplay === 'section'
  const activeRef = useRef(active)
  activeRef.current = active
  const sectionModeRef = useRef(sectionMode)
  sectionModeRef.current = sectionMode
  const rememberPosition = useCallback(() => {
    const body = bodyRef.current
    if (!body) return
    const scroller = formSectionScroller(body)
    sectionPositions.current.set(positionKeyRef.current, scroller.scrollTop)
  }, [])
  const activateSection = useCallback((id) => {
    const body = bodyRef.current
    if (!body) return
    if (id !== activeRef.current) rememberPosition()
    const scroller = formSectionScroller(body)
    navigationAnchor.current = { id, top: scroller.scrollTop }
    setActive(id)
  }, [rememberPosition])
  const sectionNavigation = useMemo(() => ({
    activeSectionID: open && presented && !loading ? active : '',
    activateSection: open && presented && !loading ? activateSection : null,
    sectionMode: sectionMode && presented,
  }), [active, activateSection, loading, open, presented, sectionMode])

  useImperativeHandle(ref, () => ({
    revealValidationErrors() {
      const firstError = bodyRef.current?.querySelector('.ant-form-item-has-error')
      const section = firstError?.closest('[data-form-section]')
      if (section) activateSection(section.id)
    },
  }), [activateSection])

  const positionKey = sectionMode ? active : 'all'
  useLayoutEffect(() => {
    if (!sectionMode || !presented) return
    const tabs = bodyRef.current?.parentElement.querySelector('.erp-business-form-page__section-tabs')
    const tab = tabs?.querySelector('[aria-selected="true"]')
    if (!tab) return
    const reveal = () => {
      if (tab.offsetLeft < tabs.scrollLeft) tabs.scrollLeft = tab.offsetLeft
      else if (tab.offsetLeft + tab.offsetWidth > tabs.scrollLeft + tabs.clientWidth) {
        tabs.scrollLeft = tab.offsetLeft + tab.offsetWidth - tabs.clientWidth
      }
    }
    const resize = new ResizeObserver(reveal)
    resize.observe(tabs)
    resize.observe(tab)
    reveal()
    return () => resize.disconnect()
  }, [active, presented, sectionMode])

  useLayoutEffect(() => {
    if (!open || !presented || !bodyRef.current) return
    const scroller = formSectionScroller(bodyRef.current)
    positionKeyRef.current = positionKey
    const top = sectionPositions.current.get(positionKey) ?? 0
    scroller.scrollTop = top
    rememberedScroll.current = top
    navigationAnchor.current = { id: activeRef.current, top: scroller.scrollTop }
  }, [open, positionKey, presented])

  useEffect(() => {
    if (!open) {
      rememberedScroll.current = 0
      sectionPositions.current.clear()
      setActive('')
    }
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
      const sectionNavigation = body.parentElement.querySelector(':scope > .erp-business-form-page__navigation')
      const horizontalNavigation = sectionModeRef.current || sectionNavigation?.querySelector('.erp-business-form-page__section-picker')?.getClientRects().length
      const navigationHeight = shared && horizontalNavigation ? sectionNavigation?.offsetHeight || 0 : 0
      const readingInset = shared ? top + navigationHeight : 0
      setScrollArea((previous) => previous.shared === shared && previous.top === top && previous.height === height && previous.readingTop === readingInset ? previous : { shared, top, height, readingTop: readingInset })
      const nodes = [...body.querySelectorAll('[data-form-section]')].filter((node) =>
        node.closest('[data-business-form-page]') === page
      )
      const next = nodes.map((node) => ({
        id: node.id,
        title: node.dataset.formSection,
        errors: node.querySelectorAll('.ant-form-item-has-error').length,
      }))
      setSections((previous) =>
        previous.length === next.length &&
        previous.every(
          (section, index) =>
            section.id === next[index].id && section.title === next[index].title && section.errors === next[index].errors
        )
          ? previous
          : next
      )
      if (sectionModeRef.current) {
        if (!next.some((section) => section.id === activeRef.current)) setActive(next[0]?.id || '')
        return
      }
      const scrollerTop = scroller.getBoundingClientRect().top
      const index = activeFormSectionIndex(
        nodes.map(
          (node) => node.getBoundingClientRect().top - scrollerTop + scroller.scrollTop
        ),
        scroller.scrollTop,
        scroller.clientHeight,
        scroller.scrollHeight,
        readingInset
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
      rememberPosition()
      schedule()
    }
    const mutation = new MutationObserver(schedule)
    mutation.observe(body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['hidden', 'class', 'data-form-section'],
    })
    const resize = new ResizeObserver(schedule)
    resize.observe(body)
    if (scroller !== body) resize.observe(scroller)
    const sectionNavigation = body.parentElement.querySelector(':scope > .erp-business-form-page__navigation')
    if (sectionNavigation) resize.observe(sectionNavigation)
    if (body.firstElementChild) resize.observe(body.firstElementChild)
    scroller.addEventListener('scroll', onScroll, { passive: true })
    navigationAnchor.current = { id: activeRef.current, top: rememberedScroll.current }
    scroller.scrollTop = rememberedScroll.current
    update()
    return () => {
      mutation.disconnect()
      resize.disconnect()
      scroller.removeEventListener('scroll', onScroll)
      window.cancelAnimationFrame(frame)
    }
  }, [loading, open, presented, navigation, formDisplay, rememberPosition])

  const navigate = (id, focusHeading = true) => {
    const body = bodyRef.current
    const scroller = formSectionScroller(body)
    const section = [...body.querySelectorAll('[data-form-section]')].find(
      (node) => node.id === id
    )
    if (!section) return
    activateSection(id)
    window.requestAnimationFrame(() => {
      if (!section.isConnected) return
      if (sectionModeRef.current) {
        if (focusHeading) {
          const heading = section.querySelector('[role="heading"][tabindex]') || section
          heading.focus({ preventScroll: true })
        }
        return
      }
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
  return (
    <div
      className="erp-business-form-page__main"
      data-section-navigation={showNavigation ? 'true' : undefined}
      data-shared-scroll={scrollArea.shared ? 'true' : undefined}
      data-form-display={sectionMode ? 'section' : 'all'}
      style={scrollArea.shared ? { '--erp-form-section-top': `${scrollArea.top}px`, '--erp-form-section-height': `${scrollArea.height}px`, '--erp-form-reading-top': `${scrollArea.readingTop}px` } : undefined}
    >
      {showNavigation ? (
        <nav
          className="erp-business-form-page__navigation"
          aria-label="表单分区"
          inert={busy ? '' : undefined}
        >
          <div className="erp-business-form-page__navigation-content">
            <SlidingTabList
              className="erp-navigation-tabs erp-business-form-page__section-tabs"
              aria-label="表单页签"
              hidden={!sectionMode}
            >
              {sections.map((section) => (
                <button
                  key={section.id}
                  id={`${section.id}-tab`}
                  type="button"
                  role="tab"
                  aria-selected={section.id === active}
                  aria-controls={section.id}
                  disabled={busy}
                  onClick={() => navigate(section.id, false)}
                >
                  {section.title}
                  {section.errors > 0 ? <span className="erp-business-form-page__section-errors">{section.errors} 项待修改</span> : null}
                </button>
              ))}
            </SlidingTabList>
            <div className="erp-business-form-page__section-links" hidden={sectionMode}>
              {sections.map((section) => (
                <button
                  key={section.id}
                  type="button"
                  aria-current={section.id === active ? 'location' : undefined}
                  aria-controls={section.id}
                  onClick={() => navigate(section.id)}
                >
                  {section.title}
                  {section.errors > 0 ? <span className="erp-business-form-page__section-errors">{section.errors} 项待修改</span> : null}
                </button>
              ))}
            </div>
            <label className="erp-business-form-page__section-picker" hidden={sectionMode}>
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
                options={sections.map(({ id, title, errors }) => ({
                  value: id,
                  label: errors ? `${title}（${errors} 项待修改）` : title,
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
        <BusinessFormSectionContext.Provider value={sectionNavigation}>
          {children}
        </BusinessFormSectionContext.Provider>
        <MobileBackToTop mobileOnly enabled={open && !loading && !busy} />
      </div>
    </div>
  )
})

BusinessFormBody.displayName = 'BusinessFormBody'

export default BusinessFormBody
