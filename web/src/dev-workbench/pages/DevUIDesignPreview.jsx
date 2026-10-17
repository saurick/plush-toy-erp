import React, { useEffect, useMemo, useRef, useState } from 'react'
import { DownloadOutlined, FullscreenOutlined, ReloadOutlined } from '@ant-design/icons'
import { Button, Space } from 'antd'
import { TaskFulfillmentGuideButton } from '../components/flow-state/TaskFulfillmentGuide.jsx'
import { prepareUIDesignSandboxSource } from '../config/devUIDesign.mjs'
import designHTML from '../../../../docs/product/ui-design/index.html?raw'

export default function DevUIDesignPreview({ active, page, pageSelector }) {
  const [fullscreen, setFullscreen] = useState(false)
  const [previewRevision, setPreviewRevision] = useState(0)
  const frameRef = useRef(null)
  const readerRef = useRef(null)
  const fullscreenButtonRef = useRef(null)
  const source = useMemo(
    () => prepareUIDesignSandboxSource(designHTML, { page }),
    [page]
  )

  useEffect(() => {
    if (!active) setFullscreen(false)
  }, [active])

  useEffect(() => {
    if (!fullscreen) return undefined
    const reader = readerRef.current
    const trigger = fullscreenButtonRef.current
    const hidden = []
    for (
      let element = reader;
      element?.parentElement;
      element = element.parentElement
    ) {
      hidden.push(
        ...[...element.parentElement.children].filter(
          (sibling) => sibling !== element
        )
      )
      if (element.parentElement === document.body) break
    }
    const previous = hidden.map((element) => [element, element.inert])
    hidden.forEach((element) => {
      element.inert = true
    })
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    fullscreenButtonRef.current?.focus()
    const onKey = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setFullscreen(false)
      }
      if (event.key !== 'Tab') return
      const controls = [
        ...reader.querySelectorAll(
          'button:not([disabled]),iframe,[data-design-focus-guard]'
        ),
      ]
      const first = controls[0]
      const last = controls.at(-1)
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    const onMessage = (event) => {
      if (
        event.source === frameRef.current?.contentWindow &&
        event.data?.type === 'ui-design-escape'
      ) {
        setFullscreen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('message', onMessage)
    return () => {
      document.body.style.overflow = overflow
      previous.forEach(([element, inert]) => {
        element.inert = inert
      })
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('message', onMessage)
      trigger?.focus({ preventScroll: true })
    }
  }, [fullscreen])

  const download = () => {
    const url = URL.createObjectURL(
      new Blob([designHTML], { type: 'text/html;charset=utf-8' })
    )
    const link = document.createElement('a')
    link.href = url
    link.download = 'erp-ui-interaction-design.html'
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }

  return (
    <section
      ref={readerRef}
      className={`erp-dev-ui-design-reader${fullscreen ? ' is-fullscreen' : ''}`}
      hidden={!active}
      role={fullscreen ? 'dialog' : 'region'}
      aria-modal={fullscreen ? 'true' : undefined}
      aria-label={fullscreen ? 'UI 交互设计全屏预览' : '最新可交互设计'}
    >
      <div className="erp-dev-ui-design-toolbar">
        {pageSelector}
        <Space wrap>
          {['task-handling', 'mobile-tasks'].includes(page) ? <TaskFulfillmentGuideButton /> : null}
          <Button icon={<ReloadOutlined />} onClick={() => setPreviewRevision((value) => value + 1)}>
            重置演示
          </Button>
          <Button icon={<DownloadOutlined />} onClick={download}>下载 HTML</Button>
          <Button
            ref={fullscreenButtonRef}
            icon={<FullscreenOutlined />}
            onClick={() => setFullscreen((value) => !value)}
          >
            {fullscreen ? '退出全屏' : '全屏预览'}
          </Button>
        </Space>
      </div>
      <iframe
        ref={frameRef}
        key={`html-${previewRevision}`}
        title="ERP 最新可交互设计"
        sandbox="allow-scripts allow-downloads"
        srcDoc={source}
        className="erp-dev-ui-design-frame"
      />
      {fullscreen ? (
        <button
          type="button"
          className="erp-dev-ui-design-focus-guard"
          data-design-focus-guard
          aria-label="返回全屏操作区"
          onFocus={() => fullscreenButtonRef.current?.focus()}
        />
      ) : null}
    </section>
  )
}
