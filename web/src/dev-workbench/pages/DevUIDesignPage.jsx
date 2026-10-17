import React, { Suspense, useEffect, useRef, useState } from 'react'
import { ReloadOutlined } from '@ant-design/icons'
import { Button, Select, Typography } from 'antd'
import { useSearchParams } from 'react-router-dom'
import { Loading } from '@/common/components/loading'
import { lazyWithDynamicImportRetry } from '@/common/utils/lazyImportRetry.mjs'
import Tabs from '@/common/components/navigation/SlidingTabs'
import DevPageNav from '../components/DevPageNav.jsx'

const DevUIDesignPreview = lazyWithDynamicImportRetry(
  () => import('./DevUIDesignPreview.jsx')
)
const DevUIDesignReading = lazyWithDynamicImportRetry(
  () => import('./DevUIDesignReading.jsx')
)
const DevControlStandards = lazyWithDynamicImportRetry(
  () => import('../components/DevControlStandards.jsx')
)

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
  const requestedPage = searchParams.get('page')
  const previewPage = ['login', 'help', 'workbench', 'controls', 'mobile-tasks', 'task-handling'].includes(requestedPage)
    ? requestedPage
    : 'workspace'
  const controlsVisible = previewPage === 'controls'
  const showHTMLPreview = view === 'preview' && !controlsVisible
  const [previewOpened, setPreviewOpened] = useState(showHTMLPreview)
  const [controlRevision, setControlRevision] = useState(0)
  const lastHTMLPage = useRef(controlsVisible ? 'workspace' : previewPage)
  const htmlPage = controlsVisible ? lastHTMLPage.current : previewPage

  useEffect(() => {
    if (showHTMLPreview) {
      lastHTMLPage.current = previewPage
      setPreviewOpened(true)
    }
  }, [showHTMLPreview, previewPage])

  const updateQuery = (key, value) => {
    const next = new URLSearchParams(window.location.search)
    if (value) next.set(key, value)
    else next.delete(key)
    setSearchParams(next)
  }

  const pageSelector = (
    <Select
      className="erp-dev-ui-design-page-select"
      aria-label="设计预览入口"
      value={previewPage}
      options={[
        { value: 'workspace', label: '业务界面' },
        { value: 'task-handling', label: '任务处理' },
        { value: 'mobile-tasks', label: '移动端任务' },
        { value: 'workbench', label: '效能工作台' },
        { value: 'login', label: '登录页' },
        { value: 'help', label: '岗位帮助' },
        { value: 'controls', label: '控件设计' },
      ]}
      onChange={(value) => updateQuery('page', value === 'workspace' ? '' : value)}
    />
  )

  return (
    <div className="erp-dev-ui-design-page erp-dev-workspace-page erp-dev-tool-page">
      <DevPageNav sourcePath="docs/product/ui-design/README.md" />
      <header className="erp-dev-ui-design-header">
        <Typography.Title level={1}>UI 交互设计</Typography.Title>
        <Tabs
          activeKey={view}
          items={VIEWS}
          onChange={(key) => updateQuery('view', key === 'preview' ? '' : key)}
        />
      </header>
      <Suspense fallback={showHTMLPreview ? <Loading title="正在加载交互设计" /> : null}>
        {previewOpened || showHTMLPreview ? (
          <DevUIDesignPreview active={showHTMLPreview} page={htmlPage} pageSelector={pageSelector} />
        ) : null}
      </Suspense>
      {view === 'preview' && controlsVisible ? (
        <section className="erp-dev-ui-design-reader" aria-label="最新可交互设计">
          <div className="erp-dev-ui-design-toolbar">
            {pageSelector}
            <Button icon={<ReloadOutlined />} onClick={() => setControlRevision((value) => value + 1)}>
              重置演示
            </Button>
          </div>
          <Suspense fallback={<Loading title="正在加载控件设计" />}>
            <DevControlStandards key={`controls-${controlRevision}`} />
          </Suspense>
        </section>
      ) : null}
      {view !== 'preview' ? (
        <Suspense fallback={<Loading title="正在加载设计说明" />}>
          <DevUIDesignReading key={view} view={view} />
        </Suspense>
      ) : null}
    </div>
  )
}
