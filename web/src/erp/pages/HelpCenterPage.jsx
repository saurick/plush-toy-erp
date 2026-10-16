import React, {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  ArrowRightOutlined,
  BookOutlined,
  DownloadOutlined,
  MobileOutlined,
} from '@ant-design/icons'
import { Button, Select, Space, Typography } from 'antd'
import {
  useNavigate,
  useOutletContext,
  useSearchParams,
} from 'react-router-dom'
import {
  getEnabledMobileRoleKeys,
  getEntryConfig,
} from '../config/entryConfig.mjs'
import { getRoleHelpGuidesForProfile } from '../config/roleHelpContent.mjs'
import {
  getRoleHelpScenarios,
  resolveHelpScenario,
} from '../config/helpScenarios.mjs'
import { getAllowedMobileRoleKeys } from '../utils/mobileRolePermissions.mjs'
import { downloadBusinessHandbook } from '../utils/businessHandbookExport.mjs'
import { HELP_VISUAL_EXAMPLES } from '../config/helpScenarioPresentation.mjs'
import HelpScenarioContent from '../components/help/HelpScenarioContent'
import HelpReferenceContent from '../components/help/HelpReferenceContent'
import SlidingTabs from '../../common/components/navigation/SlidingTabs'
import SearchInput from '../../common/components/SearchInput'
import {
  getHelpDocumentKindLabel,
  getHelpReadingCatalog,
  helpScenarioTitle,
  resolveHelpGuide,
  resolveHelpReference,
  searchHelpDocuments,
} from '../config/helpManualCatalog.mjs'

const { Text, Title } = Typography
const manualViews = [
  { key: 'home', label: '找操作' },
  { key: 'reference', label: '完整手册' },
]
const readHelpLocation = () => new URLSearchParams(window.location.search)

export default function HelpCenterPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [directoryOpen, setDirectoryOpen] = useState(
    () =>
      searchParams.get('view') === 'reference' &&
      window.matchMedia('(min-width: 900px)').matches
  )
  const [downloadError, setDownloadError] = useState('')
  const articleRef = useRef(null)
  const articleFocusPending = useRef(false)
  const { adminProfile = null, visibleMenuPaths = [] } =
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
  const { referencePages, references } = catalog
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
    () => searchHelpDocuments(catalog, query),
    [catalog, query]
  )
  const chapters = references.filter((reference) => !reference.item)
  const allowedMobileRoleKeys = useMemo(
    () =>
      new Set(
        getAllowedMobileRoleKeys(
          adminProfile,
          getEnabledMobileRoleKeys(getEntryConfig())
        )
      ),
    [adminProfile]
  )

  useEffect(() => {
    if (!selectedGuide) return
    const next = new URLSearchParams(searchParams)
    next.set('role', selectedGuide.key)
    next.set('view', view)
    next.delete('page')
    if (view === 'guide' && selectedScenario) {
      next.set('scene', selectedScenario.key)
    } else next.delete('scene')
    if (view === 'reference' && selectedReference) {
      next.set('ref', selectedReference.id)
    } else next.delete('ref')
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
    view,
    query,
    setSearchParams,
  ])

  useLayoutEffect(() => {
    if (articleFocusPending.current && !searching && articleRef.current) {
      articleRef.current.focus()
      articleFocusPending.current = false
    }
  })
  const focusArticle = () => {
    articleFocusPending.current = true
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
    next.delete('q')
    focusArticle()
    setSearchParams(next)
  }
  const handleReferenceChange = (id) => {
    const next = readHelpLocation()
    next.set('view', 'reference')
    next.set('ref', id)
    next.delete('scene')
    next.delete('q')
    if (
      view !== 'reference' &&
      window.matchMedia('(min-width: 900px)').matches
    ) {
      setDirectoryOpen(true)
    }
    focusArticle()
    setSearchParams(next)
  }
  const handleViewChange = (nextView) => {
    const next = readHelpLocation()
    next.set('view', nextView)
    next.delete('scene')
    next.delete('q')
    if (nextView === 'reference') next.set('ref', 'handbook:start')
    else next.delete('ref')
    if (
      nextView === 'reference' &&
      window.matchMedia('(min-width: 900px)').matches
    ) {
      setDirectoryOpen(true)
    }
    setSearchParams(next)
  }
  const relatedScenario =
    selectedReference?.page &&
    catalog.scenarios.find(
      (scene) => scene.pageKey === selectedReference.page.key
    )
  const handleDownload = () => {
    try {
      downloadBusinessHandbook({ guides, pages: referencePages })
      setDownloadError('')
    } catch {
      setDownloadError('手册下载未完成，请重试或使用浏览器打印当前章节。')
    }
  }
  if (!selectedGuide) return null

  return (
    <div
      className="erp-help-center-page"
      data-role-help-key={selectedGuide.key}
      data-help-view={view}
    >
      <header className="erp-help-center-heading">
        <Title level={2}>帮助中心</Title>
        <div
          className={
            guides.length > 1
              ? 'erp-help-center-role-picker erp-help-heading-role'
              : 'erp-help-current-role erp-help-heading-role'
          }
        >
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
      </header>
      <div className="erp-help-center-toolbar">
        <Space.Compact className="erp-help-center-search">
          <SearchInput
            type="search"
            aria-label="搜索操作图解和参考手册"
            placeholder="搜操作或问题"
            value={query}
            maxLength={200}
            allowClear
            onChange={(event) => handleQueryChange(event.target.value)}
            onPressEnter={() => handleQueryChange(query)}
          />
          <Button onClick={() => handleQueryChange(query)}>搜索</Button>
        </Space.Compact>
        <Text type="secondary">搜索全部可读业务帮助</Text>
      </div>
      <div className="erp-help-center-nav">
        <SlidingTabs
          aria-label="帮助阅读方式"
          activeKey={view === 'reference' ? 'reference' : 'home'}
          items={manualViews}
          onChange={handleViewChange}
          onTabClick={(key) => {
            if (key === 'home' && view === 'guide') handleViewChange('home')
          }}
        />
        {view !== 'home' && !searching ? (
          <Button
            icon={<BookOutlined aria-hidden="true" />}
            aria-label="目录"
            aria-expanded={directoryOpen}
            aria-controls="erp-help-directory"
            onClick={() => setDirectoryOpen(!directoryOpen)}
          >
            目录
          </Button>
        ) : null}
        {view === 'reference' && !searching ? (
          <Button
            icon={<DownloadOutlined aria-hidden="true" />}
            onClick={handleDownload}
          >
            下载离线手册
          </Button>
        ) : null}
      </div>
      {downloadError ? <p role="alert">{downloadError}</p> : null}
      <div
        className="erp-help-mobile-picker"
        hidden={view === 'home' || searching}
      >
        <label htmlFor="erp-help-scene-select">
          {view === 'guide' ? '办事场景' : '手册章节'}
        </label>
        <Select
          id="erp-help-scene-select"
          value={
            view === 'guide'
              ? selectedScenario?.key
              : selectedReference?.item
                ? selectedReference.page.key
                : selectedReference?.id
          }
          options={
            view === 'guide'
              ? catalog.scenarios.map((scene) => ({
                  value: scene.key,
                  label: helpScenarioTitle(scene),
                }))
              : chapters.map((reference) => ({
                  value: reference.id,
                  label: reference.title,
                }))
          }
          onChange={
            view === 'guide' ? handleScenarioChange : handleReferenceChange
          }
          virtual={false}
        />
      </div>
      <div
        className="erp-help-center-workspace"
        data-directory-open={directoryOpen && view !== 'home' && !searching}
      >
        <aside
          id="erp-help-directory"
          className="erp-help-sidebar"
          aria-label="岗位与场景"
          hidden={!directoryOpen || view === 'home' || searching}
        >
          {view === 'guide' ? (
            <nav className="erp-help-topics" aria-label="办事场景">
              <h2>全部可读图解</h2>
              {catalog.scenarios.map((scene) => (
                <button
                  type="button"
                  key={scene.key}
                  className="erp-help-topic"
                  aria-current={
                    scene.key === selectedScenario?.key ? 'page' : undefined
                  }
                  onClick={() => handleScenarioChange(scene.key)}
                >
                  <span className="erp-help-topic__label">
                    {helpScenarioTitle(scene)}
                  </span>
                  <ArrowRightOutlined aria-hidden="true" />
                </button>
              ))}
            </nav>
          ) : (
            <nav className="erp-help-topics" aria-label="参考目录">
              <h2>业务使用手册</h2>
              {[
                ...new Set(
                  chapters.map(
                    (chapter) =>
                      chapter.sectionTitle || chapter.page.sectionTitle
                  )
                ),
              ].map((section) => (
                <details key={section} open>
                  <summary>{section}</summary>
                  {chapters
                    .filter(
                      (chapter) =>
                        (chapter.sectionTitle || chapter.page.sectionTitle) ===
                        section
                    )
                    .map((chapter) => (
                      <button
                        type="button"
                        key={chapter.id}
                        className="erp-help-topic"
                        aria-current={
                          selectedReference?.id === chapter.id ||
                          selectedReference?.page?.key === chapter.id
                            ? 'page'
                            : undefined
                        }
                        onClick={() => handleReferenceChange(chapter.id)}
                      >
                        {chapter.kind === 'page'
                          ? chapter.page.title
                          : chapter.title}
                      </button>
                    ))}
                </details>
              ))}
            </nav>
          )}
          <div className="erp-help-sidebar__footer">
            {visibleMenuPaths.includes('/erp/dashboard') ? (
              <Button block onClick={() => navigate('/erp/dashboard')}>
                返回工作台
              </Button>
            ) : null}
            {allowedMobileRoleKeys.has(selectedGuide.key) ? (
              <Button
                block
                icon={<MobileOutlined aria-hidden="true" />}
                onClick={() => navigate(`/m/${selectedGuide.key}/tasks`)}
              >
                打开{selectedGuide.label}手机待办
              </Button>
            ) : null}
          </div>
        </aside>
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
                        {result.page?.title || '业务帮助'}
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
              <h3>你想完成什么？</h3>
              <Text type="secondary">按{selectedGuide.label}常用工作推荐</Text>
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
            <p className="erp-help-home__note">
              岗位用于推荐说明，办理入口仍按当前账号权限显示。
            </p>
          </section>
        ) : view === 'reference' && selectedReference ? (
          <article
            className="erp-help-article erp-help-article--reference"
            data-help-reference={selectedReference.id}
          >
            <header className="erp-help-article__heading">
              <div>
                <Text type="secondary">
                  业务使用手册 /{' '}
                  {selectedReference.page?.sectionTitle ||
                    selectedReference.sectionTitle}
                </Text>
                <Title level={3} ref={articleRef} tabIndex={-1}>
                  {selectedReference.title}
                </Title>
              </div>
              {selectedReference.page ? (
                selectedReference.page.available ? (
                  <Button onClick={() => navigate(selectedReference.page.path)}>
                    打开业务页面 <ArrowRightOutlined aria-hidden="true" />
                  </Button>
                ) : (
                  <Text type="secondary">
                    当前账号未开放此页面，可查看办理说明。
                  </Text>
                )
              ) : null}
            </header>
            <HelpReferenceContent
              document={selectedReference}
              roleKey={selectedGuide.key}
              onGuide={
                relatedScenario
                  ? () => handleScenarioChange(relatedScenario.key)
                  : null
              }
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
              {selectedScenario.available ? (
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
              ) : null}
            </header>
            <HelpScenarioContent
              key={`${selectedGuide.key}:${selectedScenario.key}`}
              scenario={selectedScenario}
              roleKey={selectedGuide.key}
            />
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
  )
}
