import React, { Suspense, useEffect, useState } from 'react'
import { ReloadOutlined } from '@ant-design/icons'
import { Button, Typography } from 'antd'
import { useSearchParams } from 'react-router-dom'
import { DEV_PAGE_TITLE_BY_ROUTE, DEV_UI_DESIGN_ROUTE } from '../config/devRoutes.mjs'
import { Loading } from '@/common/components/loading'
import { lazyWithDynamicImportRetry } from '@/common/utils/lazyImportRetry.mjs'
import Tabs from '@/common/components/navigation/SlidingTabs'
import Segmented from '@/common/components/navigation/SlidingSegmented'
import DevPageHeader from '../components/DevPageHeader.jsx'
import DevPageNav from '../components/DevPageNav.jsx'
import { resolveUIDesignPreviewMode, resolveUIDesignPreviewPage, UI_DESIGN_PREVIEW_MODES } from '../config/devUIDesign.mjs'

const DevUIDesignPreview = lazyWithDynamicImportRetry(
  () => import('./DevUIDesignPreview.jsx')
)
const DevUIDesignReading = lazyWithDynamicImportRetry(
  () => import('./DevUIDesignReading.jsx')
)
const DevControlStandards = lazyWithDynamicImportRetry(
  () => import('../components/DevControlStandards.jsx')
)
const DevWorkbenchStandards = lazyWithDynamicImportRetry(
  () => import('../components/DevWorkbenchStandards.jsx')
)

const READING_VIEWS = [
  { key: 'specification', label: '设计说明' },
  { key: 'rationale', label: '设计依据' },
]

const VIEWS = [
  { key: 'preview', label: '可交互设计' },
  { key: 'samples', label: '设计样例' },
  ...READING_VIEWS,
]

const DESIGN_SAMPLES = [
  { value: 'controls', label: '控件设计' },
  { value: 'workbench', label: '统一页面样板' },
]

export default function DevUIDesignPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedPage = searchParams.get('page')
  const requestedView = searchParams.get('view')
  const readingView = READING_VIEWS.find(({ key }) => key === requestedView)?.key
  const invalidView = Boolean(requestedView && requestedView !== 'preview' && !readingView)
  const samplePage = requestedPage === 'controls' ||
    (requestedPage === 'workbench' && searchParams.get('workbenchMode') !== 'preview')
    ? requestedPage
    : null
  const view = readingView ?? (samplePage ? 'samples' : 'preview')
  const activePage = view === 'preview' ? resolveUIDesignPreviewPage(requestedPage) : null
  const activeMode = activePage ? resolveUIDesignPreviewMode(activePage) : null
  const [visited, setVisited] = useState({ mode: 'workspace', pages: {} })
  const [lastSamplePage, setLastSamplePage] = useState(DESIGN_SAMPLES[0].value)
  const [controlRevision, setControlRevision] = useState(0)
  const [workbenchRevision, setWorkbenchRevision] = useState(0)

  useEffect(() => {
    if (!invalidView && !['screen', 'field', 'annotations'].some((key) => searchParams.has(key))) return
    const next = new URLSearchParams(searchParams)
    if (invalidView) next.delete('view')
    for (const key of ['screen', 'field', 'annotations']) next.delete(key)
    setSearchParams(next, { replace: true })
  }, [invalidView, searchParams, setSearchParams])

  useEffect(() => {
    if (!activePage) return
    setVisited((current) => current.mode === activeMode && current.pages[activeMode] === activePage
      ? current
      : { mode: activeMode, pages: { ...current.pages, [activeMode]: activePage } })
  }, [activeMode, activePage])

  useEffect(() => {
    if (view === 'samples') setLastSamplePage(samplePage)
  }, [samplePage, view])

  const updateQuery = (updates) => setSearchParams((previous) => {
    const next = new URLSearchParams(previous)
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    return next
  })
  const openPage = (page, workbenchPreview = false) => updateQuery({
    view: null,
    page: page === 'workspace' ? null : page,
    workbenchMode: workbenchPreview ? 'preview' : null,
    point: null,
  })
  const openMode = (mode) => {
    const page = visited.pages[mode] ?? mode
    openPage(page, page === 'workbench')
  }
  const openView = (key) => {
    if (key === 'samples') openPage(samplePage ?? lastSamplePage)
    else if (key === 'preview' && samplePage) openMode(visited.mode)
    else updateQuery({ view: key === 'preview' ? null : key })
  }

  return (
    <div className="erp-dev-ui-design-page erp-dev-workspace-page erp-dev-tool-page">
      <DevPageNav />
      <DevPageHeader
        className="erp-dev-ui-design-header"
        title={
          <Typography.Title level={1}>
            {DEV_PAGE_TITLE_BY_ROUTE[DEV_UI_DESIGN_ROUTE]}
          </Typography.Title>
        }
        navigation={
          <Tabs
            activeKey={view}
            items={VIEWS}
            onChange={openView}
          />
        }
      />

      <div className="erp-dev-ui-design-preview-shell" hidden={Boolean(readingView)}>
        <div className="erp-dev-ui-design-preview-navigation" hidden={view !== 'preview'}>
          <Segmented
            aria-label="设计预览界面"
            hierarchy="secondary"
            options={UI_DESIGN_PREVIEW_MODES}
            value={activeMode ?? visited.mode}
            onChange={openMode}
          />
        </div>
        <Suspense fallback={activePage ? <Loading title="正在加载交互设计" /> : null}>
          {UI_DESIGN_PREVIEW_MODES.map(({ value }) => {
            const active = activeMode === value
            const page = active ? activePage : visited.pages[value]
            return page ? <DevUIDesignPreview key={value} active={active} page={page} /> : null
          })}
        </Suspense>
        {view === 'samples' ? (
          <section className="erp-dev-ui-design-reader" aria-label="设计样例">
            <div className="erp-dev-ui-design-toolbar">
              <Segmented aria-label="设计样例分类" value={samplePage} options={DESIGN_SAMPLES} onChange={(page) => openPage(page)} />
              {(samplePage === 'workbench' || searchParams.get('control') !== 'components') && (
                <Button
                  icon={<ReloadOutlined aria-hidden="true" />}
                  onClick={() => {
                    if (samplePage === 'workbench') {
                      updateQuery({ sampleState: null })
                      setWorkbenchRevision((value) => value + 1)
                    } else setControlRevision((value) => value + 1)
                  }}
                >
                  重置演示
                </Button>
              )}
            </div>
            {samplePage === 'workbench' ? (
              <div className="erp-dev-ui-design-patterns">
                <Suspense fallback={<Loading title="正在加载工作台统一设计" />}>
                  <DevWorkbenchStandards key={workbenchRevision} />
                </Suspense>
              </div>
            ) : (
              <Suspense fallback={<Loading title="正在加载控件设计" />}>
                <DevControlStandards key={controlRevision} />
              </Suspense>
            )}
          </section>
        ) : null}
      </div>
      {readingView ? (
        <Suspense fallback={<Loading title="正在加载设计说明" />}>
          <DevUIDesignReading key={readingView} view={readingView} />
        </Suspense>
      ) : null}
    </div>
  )
}
