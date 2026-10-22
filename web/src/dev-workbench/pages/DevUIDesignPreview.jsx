import React, { useEffect, useMemo, useRef, useState } from 'react'
import { DownloadOutlined, FullscreenOutlined, ReloadOutlined } from '@ant-design/icons'
import { Button, Dropdown, Result, Space } from 'antd'
import { Loading } from '@/common/components/loading'
import { TaskFulfillmentGuideButton } from '../components/flow-state/TaskFulfillmentGuide.jsx'
import { prepareUIDesignSandboxSource, UI_DESIGN_PREVIEW_TIMEOUT_MS } from '../config/devUIDesign.mjs'
import designHTML from '../../../../docs/product/ui-design/index.html?raw'

export default function DevUIDesignPreview({ active, page, pageSelector }) {
  const [fullscreen, setFullscreen] = useState(false)
  const [previewRevision, setPreviewRevision] = useState(0)
  const previewId = `${page}-${previewRevision}`
  const [previewState, setPreviewState] = useState(null)
  const previewStatus = previewState?.id === previewId ? previewState.status : 'loading'
  const frameRef = useRef(null)
  const readerRef = useRef(null)
  const fullscreenButtonRef = useRef(null)
  const source = useMemo(
    () => prepareUIDesignSandboxSource(designHTML, { page, revision: previewRevision }),
    [page, previewRevision]
  )

  useEffect(() => {
    if (!active) return undefined
    const frame = frameRef.current
    let timeout
    const finish = (status, reason) => {
      window.clearTimeout(timeout)
      setPreviewState({
        id: previewId,
        status,
        reason: ['script', 'empty', 'layout', 'timeout'].includes(reason) ? reason : undefined,
      })
    }
    const check = () => {
      window.clearTimeout(timeout)
      if (document.hidden) return
      setPreviewState({ id: previewId, status: 'loading' })
      timeout = window.setTimeout(() => finish('failed', 'timeout'), UI_DESIGN_PREVIEW_TIMEOUT_MS)
      frame?.contentWindow?.postMessage({ type: 'ui-design-preview-check', previewId }, '*')
    }
    const onMessage = (event) => {
      if (
        document.hidden ||
        event.source !== frame?.contentWindow ||
        event.data?.type !== 'ui-design-preview-status' ||
        event.data.previewId !== previewId ||
        !['ready', 'failed'].includes(event.data.status)
      ) return
      finish(event.data.status, event.data.reason)
    }
    window.addEventListener('message', onMessage)
    document.addEventListener('visibilitychange', check)
    frame?.addEventListener('load', check)
    check()
    return () => {
      window.clearTimeout(timeout)
      window.removeEventListener('message', onMessage)
      document.removeEventListener('visibilitychange', check)
      frame?.removeEventListener('load', check)
    }
  }, [active, previewId])

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
      aria-label={fullscreen ? '交互设计全屏预览' : '最新可交互设计'}
    >
      <div className="erp-dev-ui-design-toolbar">
        {pageSelector}
        <Space wrap>
          {page === 'workspace' ? (
            <Dropdown
              trigger={['click']}
              getPopupContainer={(trigger) => trigger.parentElement}
              menu={{
                items: [
                  ['data', '正常'], ['loading', '加载中'], ['empty', '空结果'],
                  ['error', '读取失败'], ['forbidden', '无权限'], ['stress', '边界压力'],
                ].map(([key, label]) => ({ key, label })),
                onClick: ({ key }) => frameRef.current?.contentWindow?.postMessage(
                  { type: 'ui-design-data-state', value: key }, '*'
                ),
              }}
            >
              <Button disabled={previewStatus !== 'ready'}>状态模拟</Button>
            </Dropdown>
          ) : null}
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
      <div
        className="erp-dev-ui-design-stage"
        aria-busy={previewStatus === 'loading'}
        data-preview-failure={previewStatus === 'failed' ? previewState?.reason : undefined}
      >
        <iframe
          ref={frameRef}
          key={previewId}
          title="ERP 最新可交互设计"
          tabIndex={previewStatus === 'ready' ? 0 : -1}
          aria-hidden={previewStatus !== 'ready' || undefined}
          sandbox="allow-scripts allow-downloads"
          srcDoc={source}
          className="erp-dev-ui-design-frame"
        />
        {previewStatus !== 'ready' ? (
          <div className="erp-dev-ui-design-feedback">
            {previewStatus === 'loading' ? (
              <Loading title="正在加载交互预览" description="正在准备设计内容，请稍候…" />
            ) : (
              <Result
                status="warning"
                title="交互预览未能显示"
                subTitle="请重新加载预览后继续查看。"
                extra={(
                  <Button icon={<ReloadOutlined />} onClick={() => setPreviewRevision((value) => value + 1)}>
                    重新加载预览
                  </Button>
                )}
              />
            )}
          </div>
        ) : null}
      </div>
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
