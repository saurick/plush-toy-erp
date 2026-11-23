import React, { useId, useLayoutEffect, useRef, useState } from 'react'
import Directory, { DirectoryItem } from '@/common/components/navigation/Directory.jsx'
import { activeFormSectionIndex } from '../../utils/businessFormSections.mjs'
import './workflowTaskInformation.css'

export function WorkflowTaskInformationSection({ label, children }) {
  const id = useId()
  return <div id={id} data-task-information-section={label}>{children}</div>
}

function readableSections(body) {
  return [...body.children].filter((node) =>
    node.hasAttribute('data-task-information-section') &&
    !node.hidden &&
    (node.textContent.trim() || node.querySelector('img, input, [role="status"]')) &&
    node.getClientRects().length
  )
}

function moveToSection(scroller, section, inset) {
  scroller.scrollTop += section.getBoundingClientRect().top - scroller.getBoundingClientRect().top - inset - 8
  return { id: section.id, top: scroller.scrollTop }
}

export default function WorkflowTaskInformation({ active = true, children }) {
  const rootRef = useRef(null)
  const navigationRef = useRef(null)
  const bodyRef = useRef(null)
  const anchorRef = useRef(null)
  const [sections, setSections] = useState([])
  const [activeID, setActiveID] = useState('')

  useLayoutEffect(() => {
    if (!active) return undefined
    const root = rootRef.current
    const body = bodyRef.current
    const scroller = root.closest('.ant-drawer-body, .mobile-role-tasks-page__detail-main')
    if (!scroller) return undefined
    const taskSteps = scroller.querySelector('.erp-task-action-drawer__navigation')
    let frame = 0
    let restoreFrame = 0
    let disposed = false
    const savedAnchor = anchorRef.current
    let restoring = Boolean(savedAnchor)
    const update = () => {
      frame = 0
      const stickyTop = taskSteps?.offsetHeight || 0
      root.style.setProperty('--erp-task-information-top', `${stickyTop}px`)
      const nodes = readableSections(body)
      const scrollerTop = scroller.getBoundingClientRect().top
      const canJump = nodes.length >= 3 && body.offsetHeight > scroller.clientHeight - stickyTop + 2
      const next = canJump ? nodes.map((node) => ({ id: node.id, name: node.dataset.taskInformationSection })) : []
      setSections((previous) => previous.length === next.length && previous.every((section, index) =>
        section.id === next[index].id && section.name === next[index].name) ? previous : next)
      if (restoring) return
      const { scrollTop } = scroller
      const anchor = anchorRef.current
      if (anchor && Math.abs(scrollTop - anchor.top) <= 2 && nodes.some((node) => node.id === anchor.id)) {
        setActiveID(anchor.id)
        return
      }
      anchorRef.current = null
      const top = stickyTop + (navigationRef.current.offsetHeight || 0)
      const offsets = nodes.map((node) => node.getBoundingClientRect().top - scrollerTop + scrollTop)
      const index = activeFormSectionIndex(offsets, scrollTop, scroller.clientHeight, scroller.scrollHeight, top)
      setActiveID(nodes[index]?.id || '')
    }
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule)
    for (const element of [scroller, body, navigationRef.current, taskSteps].filter(Boolean)) resize?.observe(element)
    const mutation = new MutationObserver(schedule)
    mutation.observe(body, { childList: true, subtree: true, attributes: true, attributeFilter: ['hidden', 'open'] })
    scroller.addEventListener('scroll', schedule, { passive: true })
    update()
    if (savedAnchor) {
      restoreFrame = requestAnimationFrame(async () => {
        const drawer = scroller.closest('.ant-drawer-content-wrapper')
        const animations = drawer?.getAnimations().filter((animation) => animation.transitionProperty === 'width') || []
        await Promise.allSettled(animations.map((animation) => animation.finished))
        if (disposed) return
        restoreFrame = requestAnimationFrame(() => {
          const section = readableSections(body).find((node) => node.id === savedAnchor.id)
          if (section) {
            const inset = (taskSteps?.offsetHeight || 0) + navigationRef.current.offsetHeight
            anchorRef.current = moveToSection(scroller, section, inset)
          }
          restoring = false
          schedule()
        })
      })
    }
    return () => {
      disposed = true
      resize?.disconnect()
      mutation.disconnect()
      scroller.removeEventListener('scroll', schedule)
      cancelAnimationFrame(frame)
      cancelAnimationFrame(restoreFrame)
    }
  }, [active])

  const jumpTo = (id) => {
    const root = rootRef.current
    const scroller = root.closest('.ant-drawer-body, .mobile-role-tasks-page__detail-main')
    const section = readableSections(bodyRef.current).find((node) => node.id === id)
    if (!scroller || !section) return
    const topBar = scroller.querySelector('.erp-task-action-drawer__navigation')
    const inset = (topBar?.offsetHeight || 0) + navigationRef.current.offsetHeight
    anchorRef.current = moveToSection(scroller, section, inset)
    setActiveID(id)
    const heading = section.querySelector('h2, h3, [role="heading"]') || section
    if (!heading.hasAttribute('tabindex')) heading.setAttribute('tabindex', '-1')
    heading.focus({ preventScroll: true })
  }

  return (
    <div ref={rootRef} className="workflow-task-information">
      <Directory ref={navigationRef} className="erp-directory-list--inline workflow-task-information__navigation" aria-label="任务信息目录" hidden={sections.length === 0}>
        {sections.map(({ id, name }) => (
          <DirectoryItem key={id} aria-current={activeID === id ? 'location' : undefined} aria-controls={id} onClick={() => jumpTo(id)}>{name}</DirectoryItem>
        ))}
      </Directory>
      <div ref={bodyRef} className="workflow-task-information__sections">{children}</div>
    </div>
  )
}
