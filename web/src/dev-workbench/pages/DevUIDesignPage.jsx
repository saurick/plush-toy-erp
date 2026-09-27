import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  DownloadOutlined,
  FullscreenOutlined,
  ReloadOutlined,
} from '@ant-design/icons'
import { Button, Drawer, Space, Typography } from 'antd'
import { useSearchParams } from 'react-router-dom'
import Tabs from '@/common/components/navigation/SlidingTabs'
import Segmented from '@/common/components/navigation/SlidingSegmented'
import { Markdown } from '@/common/components/markdown'
import DevPageNav from '../components/DevPageNav.jsx'
import DevControlStandards from '../components/DevControlStandards.jsx'
import {
  UI_DESIGN_ASSET,
  prepareUIDesignSandboxSource,
} from '../config/devUIDesign.mjs'
import designHTML from '../../../../docs/product/ui-design/index.html?raw'
import specification from '../../../../docs/product/ui-design/交互设计说明.md?raw'
import rationale from '../../../../docs/product/ui-design/设计依据.md?raw'

const VIEWS = [
  { key: 'preview', label: '可交互设计' },
  { key: 'specification', label: '设计说明' },
  { key: 'rationale', label: '设计依据' },
]

export default function DevUIDesignPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedView = searchParams.get('view') || 'preview'
  const view = VIEWS.some((item) => item.key === requestedView)
    ? requestedView
    : 'preview'
  const [fullscreen, setFullscreen] = useState(false)
  const [previewRevision, setPreviewRevision] = useState(0)
  const pageRef = useRef(null)
  const frameRef = useRef(null)
  const readerRef = useRef(null)
  const fullscreenButtonRef = useRef(null)
  const requestedPage = searchParams.get('page')
  const previewPage = ['login', 'help', 'workbench'].includes(requestedPage)
    ? requestedPage
    : 'workspace'
  const source = useMemo(
    () => prepareUIDesignSandboxSource(designHTML, { page: previewPage }),
    [previewPage]
  )

  const updateQuery = (key, value) => {
    const next = new URLSearchParams(searchParams)
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next)
  }

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
    <div
      ref={pageRef}
      className="erp-dev-ui-design-page erp-dev-workspace-page"
    >
      <DevPageNav sourcePath="docs/product/ui-design/README.md" />
      <header className="erp-dev-ui-design-header">
        <div>
          <Typography.Title level={1}>UI 交互设计</Typography.Title>
          <Typography.Paragraph>
            查看最新界面、操作路径和设计依据；交互稿使用样例数据。
          </Typography.Paragraph>
        </div>
        <Button onClick={() => updateQuery('controls', '1')}>
          交互控件规范
        </Button>
      </header>
      <Tabs
        activeKey={view}
        items={VIEWS}
        onChange={(key) => updateQuery('view', key === 'preview' ? '' : key)}
      />
      <section
        ref={readerRef}
        className={`erp-dev-ui-design-reader${fullscreen ? ' is-fullscreen' : ''}`}
        hidden={view !== 'preview'}
        role={fullscreen ? 'dialog' : 'region'}
        aria-modal={fullscreen ? 'true' : undefined}
        aria-label={fullscreen ? 'UI 交互设计全屏预览' : '最新可交互设计'}
      >
        <div className="erp-dev-ui-design-toolbar">
          <span>
            <strong>{UI_DESIGN_ASSET.title}</strong>
            <small>{UI_DESIGN_ASSET.version} · 唯一交互稿</small>
          </span>
          <Space wrap>
            <Segmented
              aria-label="设计预览入口"
              value={previewPage}
              options={[
                { value: 'workspace', label: '业务界面' },
                { value: 'workbench', label: '效能工作台' },
                { value: 'login', label: '登录页' },
                { value: 'help', label: '岗位帮助' },
              ]}
              onChange={(value) =>
                updateQuery('page', value === 'workspace' ? '' : value)
              }
            />
            <Button
              icon={<ReloadOutlined />}
              onClick={() => setPreviewRevision((value) => value + 1)}
            >
              重置演示
            </Button>
            <Button icon={<DownloadOutlined />} onClick={download}>
              下载 HTML
            </Button>
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
          key={previewRevision}
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
      {view !== 'preview' ? (
        <section
          className="erp-dev-ui-design-document"
          aria-label={view === 'specification' ? '设计说明' : '设计依据'}
        >
          <Markdown
            source={view === 'specification' ? specification : rationale}
          />
        </section>
      ) : null}
      <Drawer
        title="交互控件规范 · 当前共享组件"
        width={880}
        open={searchParams.get('controls') === '1'}
        destroyOnHidden
        onClose={() => updateQuery('controls', '')}
      >
        <DevControlStandards />
      </Drawer>
    </div>
  )
}
