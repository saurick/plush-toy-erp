import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  ArrowRightOutlined,
  ArrowLeftOutlined,
  BookOutlined,
  DownloadOutlined,
  DownOutlined,
} from '@ant-design/icons'
import { Button, Dropdown, Select, Space, Spin, Typography } from 'antd'
import {
  useLocation,
  useNavigationType,
  useOutletContext,
  useSearchParams,
} from 'react-router-dom'
import useBusinessNavigate from '../hooks/useBusinessNavigate.js'
import { mobileBusinessRole } from '../utils/businessTaskRoute.mjs'
import { getRoleHelpGuidesForProfile } from '../config/roleHelpContent.mjs'
import {
  getRoleHelpScenarios,
  resolveHelpScenario,
} from '../config/helpScenarios.mjs'
import { downloadProjectManual } from '../utils/businessHandbookExport.mjs'
import { HELP_VISUAL_EXAMPLES } from '../config/helpScenarioPresentation.mjs'
import HelpScenarioContent from '../components/help/HelpScenarioContent'
import HelpReferenceContent from '../components/help/HelpReferenceContent'
import HelpProjectManualContent from '../components/help/HelpProjectManualContent'
import HelpManualDirectory from '../components/help/HelpManualDirectory'
import HelpGuideDirectory from '../components/help/HelpGuideDirectory'
import useProjectManuals from '../hooks/useProjectManuals.js'
import useHelpContent from '../hooks/useHelpContent.js'
import HelpContributionPanel from '../components/help/HelpContributionPanel'
import { withPublishedSupplements, publishedSupplementFor } from '../config/helpContributions.mjs'
import '../styles/app/help-contributions.css'
import {
  BUSINESS_MANUAL,
  getProjectManualDocuments,
} from '../config/projectManuals.mjs'
import SlidingTabList from '../../common/components/navigation/SlidingTabList'
import SearchInput from '../../common/components/SearchInput'
import {
  getHelpDocumentKindLabel,
  getHelpReadingCatalog,
  getHelpGuideSections,
  helpScenarioTitle,
  resolveHelpGuide,
  resolveHelpReference,
  searchHelpDocuments,
} from '../config/helpManualCatalog.mjs'

const { Text, Title } = Typography
const readHelpLocation = () => new URLSearchParams(window.location.search)

export default function HelpCenterPage() {
  const navigate = useBusinessNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [directoryOpen, setDirectoryOpen] = useState(false)
  const directoryOpenRef = useRef(false)
  directoryOpenRef.current = directoryOpen
  const [directoryCollapsed, setDirectoryCollapsed] = useState(false)
  const [narrowScreen, setNarrowScreen] = useState(() =>
    window.matchMedia('(max-width: 899px)').matches
  )
  const location = useLocation()
  const mobileShell = Boolean(mobileBusinessRole(location.pathname))
  const navigationType = useNavigationType()
  const pageRef = useRef(null)
  const headerRef = useRef(null)
  const readerRef = useRef(null)
  const directoryTriggerRef = useRef(null)
  const restoreDirectoryFocus = useRef(false)
  const directoryScrollOrigin = useRef(0)
  const readingLocations = useRef(new Map())
  const lastScene = useRef('')
  const scrollPositions = useRef(new Map())
  const scrollKey = `${location.key}:${location.search}:${location.hash}`
  const committedScrollLocation = useRef({
    key: scrollKey,
    search: location.search,
    hash: location.hash,
  })
  const [downloadError, setDownloadError] = useState('')
  const articleRef = useRef(null)
  const directoryRef = useRef(null)
  const articleFocusPending = useRef(false)
  const { adminProfile = null, visibleMenuPaths = [], mobileHelpBack } =
    useOutletContext() || {}
  const guides = useMemo(
    () => getRoleHelpGuidesForProfile(adminProfile || {}),
    [adminProfile]
  )
  const selectedGuide = resolveHelpGuide(
    guides,
    String(searchParams.get('role') || '').trim(),
    searchParams.get('page') ||
      String(searchParams.get('ref') || '').split(':')[0]
  )
  const scenarios = useMemo(
    () =>
      getRoleHelpScenarios(selectedGuide, {
        allowedMenuPaths: visibleMenuPaths,
      }),
    [visibleMenuPaths, selectedGuide]
  )
  const catalog = useMemo(
    () => getHelpReadingCatalog(guides, { allowedMenuPaths: visibleMenuPaths }),
    [guides, visibleMenuPaths]
  )
  const projectManuals = useProjectManuals(adminProfile)
  const helpContent = useHelpContent(adminProfile)
  const books = useMemo(
    () => [BUSINESS_MANUAL, ...projectManuals.manuals],
    [projectManuals.manuals]
  )
  const remoteReferences = useMemo(
    () => withPublishedSupplements(projectManuals.manuals.flatMap(getProjectManualDocuments), helpContent.published),
    [projectManuals.manuals, helpContent.published]
  )
  const readingCatalog = useMemo(
    () => ({
      ...catalog,
      references: [...withPublishedSupplements(catalog.references, helpContent.published), ...remoteReferences],
    }),
    [catalog, remoteReferences, helpContent.published]
  )
  const requestedBookKey =
    searchParams.get('book') ||
    /^manual:([^:]+):/u.exec(searchParams.get('ref') || '')?.[1] ||
    'business'
  const selectedBook = books.find((book) => book.key === requestedBookKey)
  const { referencePages } = catalog
  const references =
    requestedBookKey === 'business'
      ? readingCatalog.references.filter((reference) => !reference.manualKey)
      : remoteReferences.filter(
          (reference) => reference.manualKey === requestedBookKey
        )
  const readingScenarios = catalog.scenarios.map(
    (scene) => scenarios.find((entry) => entry.key === scene.key) || scene
  )
  const selectedScenario = resolveHelpScenario(
    readingScenarios,
    searchParams.get('scene') ||
      catalog.scenarios.find(
        (scene) => scene.pageKey === searchParams.get('page')
      )?.key ||
      scenarios[0]?.key
  )
  const selectedReference = resolveHelpReference(
    references,
    searchParams.get('ref'),
    searchParams.has('ref') ? '' : selectedScenario?.pageKey
  )
  const requestedView = searchParams.get('view')
  const view =
    requestedView === 'reference'
      ? 'reference'
      : requestedView === 'guide' ||
          (!requestedView &&
            (searchParams.has('scene') || searchParams.has('page')))
        ? 'guide'
        : 'home'
  const query = String(searchParams.get('q') || '').slice(0, 200)
  const searching = Boolean(query.trim())
  const results = useMemo(
    () => searchHelpDocuments(readingCatalog, query),
    [readingCatalog, query]
  )
  const chapters = references.filter((reference) => !reference.item)
  const chapterIndex = chapters.findIndex(
    (chapter) => chapter.id === selectedReference?.id
  )
  const previousChapter = chapterIndex > 0 ? chapters[chapterIndex - 1] : null
  const nextChapter = chapterIndex >= 0 ? chapters[chapterIndex + 1] : null
  const guideSections = useMemo(() => getHelpGuideSections(catalog), [catalog])
  const category = view === 'reference' ? requestedBookKey : 'guides'

  useEffect(() => {
    if (!selectedGuide) return
    const next = new URLSearchParams(searchParams)
    next.set('role', selectedGuide.key)
    next.set('view', view)
    next.delete('page')
    if (view === 'guide' && selectedScenario) {
      next.set('scene', selectedScenario.key)
    } else next.delete('scene')
    if (view === 'reference') {
      if (selectedReference) next.set('ref', selectedReference.id)
      if (selectedBook) next.set('book', selectedBook.key)
    } else {
      next.delete('ref')
      next.delete('book')
    }
    if (query) next.set('q', query)
    else next.delete('q')
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true })
    }
  }, [
    searchParams,
    selectedGuide,
    selectedScenario,
    selectedReference,
    selectedBook,
    view,
    query,
    setSearchParams,
  ])

  useLayoutEffect(() => {
    if (
      articleFocusPending.current &&
      !directoryOpen &&
      !searching &&
      articleRef.current
    ) {
      articleRef.current.focus({ preventScroll: true })
      articleFocusPending.current = false
    }
  })
  useEffect(() => {
    const media = window.matchMedia('(max-width: 899px)')
    const change = () => {
      setNarrowScreen(media.matches)
      if (!media.matches) setDirectoryOpen(false)
    }
    media.addEventListener('change', change)
    return () => media.removeEventListener('change', change)
  }, [])
  useLayoutEffect(() => {
    const outer = pageRef.current?.closest(
      '.erp-admin-content, .mobile-business-layout__content'
    )
    if (directoryOpen) {
      if (outer) outer.scrollTop = 0
      const selected = directoryRef.current?.querySelector('[aria-current="page"]')
      selected?.focus({ preventScroll: true })
      selected?.scrollIntoView({ block: 'nearest' })
    } else if (restoreDirectoryFocus.current) {
      if (outer) outer.scrollTop = directoryScrollOrigin.current
      directoryTriggerRef.current?.focus({ preventScroll: true })
      restoreDirectoryFocus.current = false
    }
  }, [directoryOpen])
  useLayoutEffect(() => {
    const sidebar = directoryRef.current
    const selected = sidebar?.querySelector('[aria-current="page"]')
    if (selected && window.matchMedia('(min-width: 900px)').matches) {
      const row = selected.getBoundingClientRect()
      const box = sidebar.getBoundingClientRect()
      if (row.top < box.top || row.bottom > box.bottom) {
        sidebar.scrollTop += row.top - box.top - sidebar.clientHeight / 3
      }
    }
  }, [view, searching, selectedReference?.id, selectedScenario?.key])

  useEffect(() => {
    if (searching) return
    if (view === 'reference' && selectedBook && selectedReference) {
      readingLocations.current.set(selectedBook.key, selectedReference.id)
    }
    if (view === 'guide' && selectedScenario) {
      lastScene.current = selectedScenario.key
    }
  }, [view, searching, selectedBook, selectedReference, selectedScenario])

  useLayoutEffect(() => {
    const outer = pageRef.current?.closest(
      '.erp-admin-content, .mobile-business-layout__content'
    )
    const desktop = window.matchMedia('(min-width: 900px)').matches
    if (desktop && outer) outer.scrollTop = 0
    const scroll = desktop ? readerRef.current : outer
    if (scroll && !location.hash) {
      scroll.scrollTop =
        navigationType === 'POP'
          ? scrollPositions.current.get(scrollKey) || 0
          : 0
    }
    committedScrollLocation.current = {
      key: scrollKey,
      search: location.search,
      hash: location.hash,
    }
  }, [scrollKey, navigationType, location.search, location.hash])

  useEffect(() => {
    const outer = pageRef.current?.closest(
      '.erp-admin-content, .mobile-business-layout__content'
    )
    const reader = readerRef.current
    const remember = (event) => {
      if (directoryOpenRef.current) return
      const desktop = window.matchMedia('(min-width: 900px)').matches
      if (event.target !== (desktop ? reader : outer)) return
      const { current } = committedScrollLocation
      if (
        current.search !== window.location.search ||
        current.hash !== window.location.hash
      ) return
      const positions = scrollPositions.current
      positions.set(current.key, event.target.scrollTop)
      if (positions.size > 128) positions.delete(positions.keys().next().value)
    }
    outer?.addEventListener('scroll', remember, { passive: true })
    reader?.addEventListener('scroll', remember, { passive: true })
    return () => {
      outer?.removeEventListener('scroll', remember)
      reader?.removeEventListener('scroll', remember)
    }
  }, [])

  useLayoutEffect(() => {
    const header = headerRef.current
    const page = pageRef.current
    if (!header || !page) return undefined
    const measure = () => {
      page.style.setProperty('--erp-help-header-height', `${header.offsetHeight}px`)
    }
    const observer = new ResizeObserver(measure)
    observer.observe(header)
    measure()
    return () => observer.disconnect()
  }, [])

  useLayoutEffect(() => {
    if (!location.hash || searching) return
    let anchor
    try {
      anchor = decodeURIComponent(location.hash.slice(1))
    } catch {
      return
    }
    const target = [...(readerRef.current?.querySelectorAll('[id]') || [])].find(
      (element) => element.id === anchor
    )
    target?.scrollIntoView({ block: 'start' })
  }, [
    location.hash,
    searching,
    view,
    selectedReference?.id,
    selectedScenario?.key,
    projectManuals.status,
  ])

  const focusArticle = () => {
    articleFocusPending.current = true
    restoreDirectoryFocus.current = false
    setDirectoryOpen(false)
  }
  const toggleDirectory = () => {
    if (!narrowScreen) {
      setDirectoryCollapsed((value) => !value)
      return
    }
    if (!directoryOpen) {
      const outer = pageRef.current?.closest(
        '.erp-admin-content, .mobile-business-layout__content'
      )
      directoryScrollOrigin.current = outer?.scrollTop || 0
    }
    restoreDirectoryFocus.current = directoryOpen
    setDirectoryOpen((value) => !value)
  }
  const handleRoleChange = (roleKey) => {
    const next = readHelpLocation()
    next.set('role', roleKey)
    if (view !== 'reference') {
      next.set('view', 'home')
      next.delete('scene')
    }
    setSearchParams(next)
  }
  const handleQueryChange = (nextQuery) => {
    setDirectoryOpen(false)
    const next = readHelpLocation()
    if (nextQuery) next.set('q', nextQuery)
    else next.delete('q')
    setSearchParams(next, { replace: true })
  }
  const handleScenarioChange = (scenarioKey) => {
    const scene = catalog.scenarios.find((entry) => entry.key === scenarioKey)
    if (!scene) return
    const next = readHelpLocation()
    if (!scene.roleKeys.includes(selectedGuide.key)) {
      next.set('role', scene.roleKeys[0])
    }
    next.set('scene', scene.key)
    next.set('view', 'guide')
    next.delete('ref')
    next.delete('book')
    next.delete('q')
    focusArticle()
    setSearchParams(next)
  }
  const handleReferenceChange = (id) => {
    const next = readHelpLocation()
    next.set('view', 'reference')
    next.set('ref', id)
    next.set('book', /^manual:([^:]+):/u.exec(id)?.[1] || 'business')
    next.delete('scene')
    next.delete('q')
    focusArticle()
    setSearchParams(next)
  }
  const handleViewChange = (nextView) => {
    const next = readHelpLocation()
    next.set('view', nextView)
    next.delete('scene')
    next.delete('q')
    if (nextView === 'reference') {
      next.set('ref', 'handbook:start')
      next.set('book', 'business')
    } else {
      next.delete('ref')
      next.delete('book')
    }
    focusArticle()
    setSearchParams(next)
  }
  const relatedScenario =
    selectedReference?.page &&
    catalog.scenarios.find(
      (scene) => scene.pageKey === selectedReference.page.key
    )
  const handleBookChange = (bookKey, focus = false) => {
    if (category === bookKey && !searching) return
    const next = readHelpLocation()
    next.set('view', 'reference')
    next.set('book', bookKey)
    const saved = readingLocations.current.get(bookKey)
    const bookReferences =
      bookKey === 'business'
        ? catalog.references
        : remoteReferences.filter(
            (reference) => reference.manualKey === bookKey
          )
    next.set(
      'ref',
      bookReferences.some((reference) => reference.id === saved)
        ? saved
        : bookKey === 'business'
          ? 'handbook:start'
          : `manual:${bookKey}:overview`
    )
    next.delete('scene')
    next.delete('q')
    setDownloadError('')
    if (focus) focusArticle()
    setDirectoryOpen(false)
    setSearchParams(next)
  }
  const handleCategoryChange = (key) => {
    if (key !== 'guides') {
      handleBookChange(key)
      return
    }
    if (category === 'guides' && !searching) return
    const next = readHelpLocation()
    const scene = catalog.scenarios.find(
      (entry) => entry.key === lastScene.current
    )
    next.set('view', category === 'guides' ? view : scene ? 'guide' : 'home')
    if (scene && category !== 'guides') next.set('scene', scene.key)
    next.delete('ref')
    next.delete('book')
    next.delete('q')
    setDirectoryOpen(false)
    setSearchParams(next)
  }
  const handleDownload = (format) => {
    if (!selectedBook || helpContent.status !== 'ready') return
    try {
      downloadProjectManual({
        manual: selectedBook,
        guides,
        pages: referencePages,
        format,
        supplements: helpContent.published,
      })
      setDownloadError('')
    } catch {
      setDownloadError('手册下载未完成，请重试或使用浏览器打印当前章节。')
    }
  }
  if (!selectedGuide) return null

  const rolePicker = (
    <div className="erp-help-role-picker">
      {guides.length > 1 ? (
        <label htmlFor="erp-help-center-role-select">推荐岗位</label>
      ) : (
        <span>推荐岗位</span>
      )}
      {guides.length > 1 ? (
        <Select
          id="erp-help-center-role-select"
          value={selectedGuide.key}
          options={guides.map((guide) => ({
            value: guide.key,
            label: guide.label,
          }))}
          onChange={handleRoleChange}
          virtual={false}
        />
      ) : (
        <strong>{selectedGuide.label}</strong>
      )}
    </div>
  )
  const directory =
    view === 'reference' ? (
      <HelpManualDirectory
        chapters={chapters}
        selectedReference={selectedReference}
        onChange={handleReferenceChange}
        grouped={requestedBookKey === 'business'}
      />
    ) : (
      <HelpGuideDirectory
        sections={guideSections}
        selectedScenario={selectedScenario}
        home={view === 'home'}
        onHome={() => handleViewChange('home')}
        onChange={handleScenarioChange}
      />
    )

  return (
    <div
      className="erp-help-center-page"
      ref={pageRef}
      data-role-help-key={selectedGuide.key}
      data-help-view={view}
      data-help-shell={mobileShell ? 'mobile' : 'desktop'}
      data-directory-collapsed={directoryCollapsed}
      data-directory-open={directoryOpen}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && directoryOpen) {
          event.preventDefault()
          toggleDirectory()
        }
      }}
    >
      <header className="erp-help-navigation-header" ref={headerRef}>
        <div className="erp-help-center-heading">
          {mobileShell && mobileHelpBack ? (
            <Button
              type="text"
              icon={<ArrowLeftOutlined aria-hidden="true" />}
              aria-label="返回任务列表"
              onClick={mobileHelpBack}
            />
          ) : null}
          <Title level={2}>帮助中心</Title>
        </div>
        <div className="erp-help-heading-actions">
          {view === 'reference' && selectedBook && !searching ? (
            <Dropdown
              disabled={helpContent.status !== 'ready'}
              trigger={['click']}
              menu={{
                  items: [
                    { key: 'html', label: 'HTML · 离线阅读' },
                    { key: 'markdown', label: 'Markdown · 文本手册' },
                  ],
                  onClick: ({ key }) => handleDownload(key),
                }}
            >
              <Button
                className="erp-help-download-button"
                disabled={helpContent.status !== 'ready'}
                icon={<DownloadOutlined aria-hidden="true" />}
                aria-haspopup="menu"
              >
                下载手册 <DownOutlined aria-hidden="true" />
              </Button>
            </Dropdown>
            ) : null}
        </div>
        <div className="erp-help-search-tools">
          <SearchInput
            className="erp-help-center-search"
            type="search"
            aria-label="搜索操作图解和参考手册"
            placeholder={narrowScreen ? '搜索帮助内容' : '搜索操作、字段或问题'}
            value={query}
            maxLength={200}
            allowClear
            onChange={(event) => handleQueryChange(event.target.value)}
          />
          <Button
            ref={directoryTriggerRef}
            className="erp-help-mobile-directory-button"
            icon={<BookOutlined aria-hidden="true" />}
            aria-label="目录"
            aria-expanded={narrowScreen ? directoryOpen : !directoryCollapsed}
            aria-controls="erp-help-directory"
            onClick={toggleDirectory}
            disabled={searching}
          >
            <span className="erp-help-directory-button-label">目录</span>
          </Button>
        </div>
        <nav className="erp-help-center-nav" aria-label="帮助内容">
          <SlidingTabList
            className="erp-navigation-tabs erp-help-navigation-tabs"
            aria-label="帮助内容分类"
          >
            {[{ key: 'guides', title: '操作图解' }, ...books].map((entry) => (
              <button
                key={entry.key}
                type="button"
                role="tab"
                id={`erp-help-category-${entry.key}`}
                aria-label={entry.title}
                aria-selected={entry.key === category}
                aria-controls="erp-help-reading-panel"
                onClick={() => handleCategoryChange(entry.key)}
              >
                {
                  {
                    guides: '操作图解',
                    business: '业务手册',
                    administration: '管理实施',
                    operations: '技术运维',
                  }[entry.key]
                }
              </button>
            ))}
          </SlidingTabList>
        </nav>
      </header>
      {projectManuals.status === 'error' ? (
        <div className="erp-help-load-error" role="alert">
          项目手册未能读取。
          <Button type="link" onClick={projectManuals.reload}>
            重新读取手册
          </Button>
        </div>
      ) : null}
      {downloadError ? <p role="alert">{downloadError}</p> : null}
      {helpContent.status === 'error' ? <div className="erp-help-load-error" role="alert">企业补充未能读取，暂不能确认完整内容。<Button onClick={helpContent.reload}>重新读取企业补充</Button></div> : helpContent.status === 'loading' ? <p role="status">正在读取企业补充…</p> : null}
      <div
        className="erp-help-center-workspace"
        data-searching={searching}
        data-directory-collapsed={!narrowScreen && directoryCollapsed}
      >
        <aside
          ref={directoryRef}
          id="erp-help-directory"
          className="erp-help-sidebar"
          aria-label="帮助目录"
          hidden={searching || (narrowScreen ? !directoryOpen : directoryCollapsed)}
        >
          <div className="erp-help-directory-heading">
            <h2>{view === 'reference' ? '章节目录' : '场景目录'}</h2>
            <Button type="text" size="small" onClick={toggleDirectory}>
              {narrowScreen ? '返回正文' : '收起目录'}
            </Button>
          </div>
          {directory}
        </aside>
        <div
          className="erp-help-reader"
          ref={readerRef}
          id="erp-help-reading-panel"
          hidden={narrowScreen && directoryOpen && !searching}
          role="tabpanel"
          aria-labelledby={
            category === 'guides' || selectedBook
              ? `erp-help-category-${category}`
              : undefined
          }
          aria-label={
            category !== 'guides' && !selectedBook ? '帮助阅读区' : undefined
          }
        >
          {searching ? (
            <section
              className="erp-help-search-results"
              aria-label="帮助搜索结果"
            >
              <h3>搜索“{query.trim()}”</h3>
              <p role="status">找到 {results.length} 条操作图解和参考说明</p>
              {results.length ? (
                <ul>
                  {results.map((result) => (
                    <li key={`${result.kind}:${result.id}`}>
                      <button
                        type="button"
                        onClick={() =>
                          result.kind === 'guide'
                            ? handleScenarioChange(result.id)
                            : handleReferenceChange(result.id)
                        }
                      >
                        <span className="erp-help-search-results__kind">
                          {getHelpDocumentKindLabel(result.kind)} ·{' '}
                          {result.manualTitle ||
                            result.page?.title ||
                            '业务帮助'}
                        </span>
                        <strong>{result.title}</strong>
                        <span>{result.summary}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div>
                  <p>
                    没有找到相关说明。可尝试单据名称、字段名称，或浏览手册目录。
                  </p>
                  <Space wrap>
                    <Button onClick={() => handleQueryChange('')}>
                      清空搜索
                    </Button>
                    <Button onClick={() => handleViewChange('reference')}>
                      浏览完整手册
                    </Button>
                  </Space>
                </div>
              )}
            </section>
          ) : view === 'home' ? (
            <section className="erp-help-home" aria-label="帮助首页">
              <div className="erp-help-home__heading">
                <div>
                  <h3 ref={articleRef} tabIndex={-1}>
                    你想完成什么？
                  </h3>
                  <Text type="secondary">按岗位常用工作推荐</Text>
                </div>
                {rolePicker}
              </div>
              <nav className="erp-help-home__tasks" aria-label="推荐办事场景">
                {scenarios.map((scene) => (
                  <button
                    type="button"
                    className="erp-help-home-task"
                    key={scene.key}
                    onClick={() => handleScenarioChange(scene.key)}
                  >
                    <span className="erp-help-home-task-body">
                      <strong className="erp-help-home-task-title">
                        {helpScenarioTitle(scene)}
                      </strong>
                      <span className="erp-help-home-task-description">
                        {scene.description}
                      </span>
                    </span>
                    <ArrowRightOutlined aria-hidden="true" />
                  </button>
                ))}
              </nav>
              <section className="erp-help-home__reading">
                <h3>从这里系统了解</h3>
                {[
                  ['handbook:start', '第一次使用，从头了解'],
                  ['handbook:roles', '岗位责任和上下游交接'],
                  ['handbook:problems', '看不到、办不了或结果不确定'],
                ].map(([id, title]) => (
                  <button
                    type="button"
                    className="erp-help-home-reading-link"
                    key={id}
                    onClick={() => handleReferenceChange(id)}
                  >
                    {title}
                    <ArrowRightOutlined aria-hidden="true" />
                  </button>
                ))}
              </section>
              {!mobileShell ? (
                <p className="erp-help-home__note">
                  岗位用于推荐说明，办理入口仍按当前账号权限显示。
                </p>
              ) : null}
            </section>
          ) : view === 'reference' &&
            requestedBookKey !== 'business' &&
            projectManuals.status !== 'ready' ? (
              <section
                className="erp-help-manual-state"
                aria-label="手册读取状态"
              >
                {projectManuals.status === 'loading' ? (
                  <Spin tip="正在读取项目手册">
                    <div className="erp-help-manual-loading" />
                  </Spin>
              ) : (
                <p>当前手册暂时无法读取，请重新读取后继续。</p>
              )}
              </section>
          ) : view === 'reference' && !selectedBook ? (
            <section
              className="erp-help-manual-state"
              aria-label="手册阅读权限"
            >
              <h3>当前账号不能阅读这本手册</h3>
              <p>请从已开放的手册中选择；岗位推荐不会改变账号的阅读权限。</p>
              <Button onClick={() => handleBookChange('business', true)}>
                阅读业务使用手册
              </Button>
            </section>
          ) : view === 'reference' && selectedReference ? (
            <article
              className="erp-help-article erp-help-article--reference"
              data-help-reference={selectedReference.id}
            >
              <header className="erp-help-article__heading">
                <div>
                  <Title level={3} ref={articleRef} tabIndex={-1}>
                    {selectedReference.kind === 'page'
                      ? selectedReference.page.title
                      : selectedReference.title}
                  </Title>
                </div>
                <div className="erp-help-article-actions">
                  {chapterIndex >= 0 ? (
                    <span className="erp-help-chapter-position" aria-label={`第 ${chapterIndex + 1} 章，共 ${chapters.length} 章`}>
                      {chapterIndex + 1} / {chapters.length}
                    </span>
                  ) : null}
                  {relatedScenario ? (
                    <Button
                      onClick={() => handleScenarioChange(relatedScenario.key)}
                    >
                      查看相关操作图解 →
                    </Button>
                  ) : null}
                  {!mobileShell && (selectedReference.page?.available ? (
                    <Button
                      onClick={() => navigate(selectedReference.page.path)}
                    >
                      打开业务页面 <ArrowRightOutlined aria-hidden="true" />
                    </Button>
                  ) : selectedReference.page ? (
                    <Text type="secondary">
                      当前账号未开放此页面，可查看办理说明。
                    </Text>
                  ) : null)}
                </div>
              </header>
              {selectedReference.kind === 'manual' ? (
                <HelpProjectManualContent
                  key={selectedReference.id}
                  document={selectedReference}
                  allowedBooks={books.map((book) => book.key)}
                  references={readingCatalog.references}
                />
              ) : (
                <HelpReferenceContent
                  document={selectedReference}
                  roleKey={selectedGuide.key}
                />
              )}
              <HelpContributionPanel
                key={`contribution:${selectedReference.id}`}
                document={helpContent.documents.find((entry) => entry.id === selectedReference.id)}
                published={selectedReference.supplement}
                onPublished={helpContent.reload}
                navigation={previousChapter || nextChapter ? (
                  <nav
                    className="erp-help-chapter-pagination"
                    aria-label="手册章节翻页"
                  >
                    {previousChapter ? (
                      <Button
                        type="text"
                        className="erp-help-chapter-pagination__previous"
                        aria-label={`上一章：${previousChapter.title}`}
                        onClick={() => handleReferenceChange(previousChapter.id)}
                      >
                        ← 上一章
                      </Button>
                  ) : null}
                    {nextChapter ? (
                      <Button
                        type="text"
                        className="erp-help-chapter-pagination__next"
                        aria-label={`下一章：${nextChapter.title}`}
                        onClick={() => handleReferenceChange(nextChapter.id)}
                      >
                        {nextChapter.title} →
                      </Button>
                  ) : null}
                  </nav>
                ) : null}
              />
            </article>
          ) : selectedScenario ? (
            <article
              className="erp-help-article"
              data-help-scenario={selectedScenario.key}
            >
              <header className="erp-help-article__heading">
                <div>
                  <Button
                    type="link"
                    className="erp-help-back-home"
                    onClick={() => handleViewChange('home')}
                  >
                    ← 帮助首页
                  </Button>
                  <Title level={3} ref={articleRef} tabIndex={-1}>
                    {helpScenarioTitle(selectedScenario)}
                  </Title>
                  <Text type="secondary">
                    {HELP_VISUAL_EXAMPLES[selectedScenario.key]?.description ||
                      selectedScenario.description}
                  </Text>
                </div>
                {!mobileShell && (selectedScenario.available ? (
                  <Button
                    type="primary"
                    onClick={() => navigate(selectedScenario.path)}
                  >
                    {selectedScenario.actionLabel}
                    <ArrowRightOutlined aria-hidden="true" />
                  </Button>
                ) : selectedScenario.path ? (
                  <Text type="secondary">
                    当前账号未开放此页面，可查看办理说明。
                  </Text>
                ) : null)}
              </header>
              <HelpScenarioContent
                key={`${selectedGuide.key}:${selectedScenario.key}`}
                scenario={selectedScenario}
                roleKey={selectedGuide.key}
              />
              <HelpContributionPanel key={`contribution:guide:${selectedScenario.key}`} document={helpContent.documents.find((entry) => entry.id === `guide:${selectedScenario.key}`)} published={publishedSupplementFor(helpContent.published, `guide:${selectedScenario.key}`)} onPublished={helpContent.reload} />
              {references.some(
                (reference) => reference.id === selectedScenario.pageKey
              ) ? (
                <nav
                  className="erp-help-reference-index"
                  aria-label="相关参考词条"
                >
                  <strong>查清字段与规则</strong>
                  <button
                    type="button"
                    onClick={() =>
                      handleReferenceChange(selectedScenario.pageKey)
                    }
                  >
                    查看完整参考章节
                  </button>
                  {references
                    .filter(
                      (reference) =>
                        reference.page?.key === selectedScenario.pageKey &&
                        reference.item
                    )
                    .map((reference) => (
                      <button
                        type="button"
                        key={reference.id}
                        onClick={() => handleReferenceChange(reference.id)}
                      >
                        {reference.title}
                      </button>
                    ))}
                </nav>
              ) : null}
              <details className="erp-help-role-context">
                <summary>了解岗位交接与提醒</summary>
                <p>{selectedGuide.handoff}</p>
                <p>{selectedGuide.caution}</p>
              </details>
            </article>
          ) : null}
        </div>
      </div>
    </div>
  )
}
