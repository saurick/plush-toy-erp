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

const READING_VIEWS = [
  { key: 'specification', label: '设计说明' },
  { key: 'rationale', label: '设计依据' },
]

const VIEWS = [
  { key: 'preview', label: '可交互设计' },
  { key: 'samples', label: '设计样例' },
  ...READING_VIEWS,
]

export default function DevUIDesignPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedPage = searchParams.get('page')
  const requestedView = searchParams.get('view')
  const readingView = READING_VIEWS.find(({ key }) => key === requestedView)?.key
  const invalidView = Boolean(requestedView && requestedView !== 'preview' && !readingView)
  const isControlPage = requestedPage === 'controls'
  const view = readingView ?? (isControlPage ? 'samples' : 'preview')
  const activePage = view === 'preview' ? resolveUIDesignPreviewPage(requestedPage) : null
  const activeMode = activePage ? resolveUIDesignPreviewMode(activePage) : null
  const [visited, setVisited] = useState({ mode: 'workspace', pages: {} })
  const [controlRevision, setControlRevision] = useState(0)
  const [fullscreen, setFullscreen] = useState(false)

  useEffect(() => {
    if (!invalidView && !['screen', 'field', 'annotations'].some((key) => searchParams.has(key))) return
    const next = new URLSearchParams(searchParams)
    if (invalidView) next.delete('view')
    for (const key of ['screen', 'field', 'annotations']) next.delete(key)
    setSearchParams(next, { replace: true })
  }, [invalidView, searchParams, setSearchParams])

  useEffect(() => {
    if (!activePage) {
      setFullscreen(false)
      return
    }
    setVisited((current) => current.mode === activeMode && current.pages[activeMode] === activePage
      ? current
      : { mode: activeMode, pages: { ...current.pages, [activeMode]: activePage } })
  }, [activeMode, activePage])

  const updateQuery = (updates) => setSearchParams((previous) => {
    const next = new URLSearchParams(previous)
    for (const [key, value] of Object.entries(updates)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    return next
  })
  const openPage = (page) => updateQuery({
    view: null,
    page: page === 'workspace' ? null : page,
    point: null,
  })
  const openMode = (mode) => openPage(visited.pages[mode] ?? mode)
  const switchEntry = (source, target) => {
    if (source === 'login' || target === 'login') {
      // 在下次打开时按可见画布重新初始化登录表单或已退出的岗位。
      setVisited((current) => {
        const pages = { ...current.pages }
        delete pages[source]
        return { ...current, pages }
      })
    }
    if (source === activeMode) openMode(target)
  }
  const openView = (key) => {
    if (key === 'samples') openPage('controls')
    else if (key === 'preview' && isControlPage) openMode(visited.mode)
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
        tools={view === 'samples' && searchParams.get('control') !== 'components' ? (
          <Button
            icon={<ReloadOutlined aria-hidden="true" />}
            onClick={() => setControlRevision((value) => value + 1)}
          >
            重置演示
          </Button>
        ) : null}
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
            return page ? (
              <DevUIDesignPreview
                key={value}
                active={active}
                page={page}
                onModeChange={(target) => switchEntry(value, target)}
                fullscreen={active && fullscreen}
                setFullscreen={setFullscreen}
              />
            ) : null
          })}
        </Suspense>
        {view === 'samples' ? (
          <section className="erp-dev-ui-design-reader" aria-label="设计样例">
            <Suspense fallback={<Loading title="正在加载组件设计" />}>
              <DevControlStandards key={controlRevision} />
            </Suspense>
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
