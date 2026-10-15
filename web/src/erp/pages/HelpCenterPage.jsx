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
import { HELP_VISUAL_EXAMPLES } from '../config/helpScenarioPresentation.mjs'
import HelpScenarioContent from '../components/help/HelpScenarioContent'
import HelpReferenceContent from '../components/help/HelpReferenceContent'
import SlidingTabs from '../../common/components/navigation/SlidingTabs'
import SearchInput from '../../common/components/SearchInput'
import {
  getHelpDocumentKindLabel,
  getHelpReferenceDocuments,
  getHelpReferencePages,
  helpScenarioTitle,
  resolveHelpGuide,
  resolveHelpReference,
  searchHelpDocuments,
} from '../config/helpManualCatalog.mjs'

const { Text, Title } = Typography
// 连续切换和输入时读取已更新的地址，避免旧渲染覆盖刚选中的视图。
const readHelpLocation = () => new URLSearchParams(window.location.search)
const manualViews = [
  { key: 'guide', label: '岗位操作图解' },
  { key: 'reference', label: '操作参考手册' },
]

export default function HelpCenterPage() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [directoryOpen, setDirectoryOpen] = useState(false)
  const articleRef = useRef(null)
  const articleFocusPending = useRef(false)
  const { adminProfile = null, visibleMenuPaths = [] } =
    useOutletContext() || {}
  const guides = useMemo(
    () => getRoleHelpGuidesForProfile(adminProfile || {}),
    [adminProfile]
  )
  const requestedRoleKey = String(searchParams.get('role') || '').trim()
  const selectedGuide = resolveHelpGuide(
    guides,
    requestedRoleKey,
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
  const selectedScenario = resolveHelpScenario(
    scenarios,
    searchParams.get('scene') ||
      scenarios.find((scene) => scene.pageKey === searchParams.get('page'))?.key
  )
  const referencePages = useMemo(
    () =>
      getHelpReferencePages(selectedGuide, {
        allowedMenuPaths: visibleMenuPaths,
      }),
    [selectedGuide, visibleMenuPaths]
  )
  const references = useMemo(
    () => getHelpReferenceDocuments(referencePages),
    [referencePages]
  )
  const selectedReference = resolveHelpReference(
    references,
    searchParams.get('ref'),
    selectedScenario?.pageKey
  )
  const view = searchParams.get('view') === 'reference' ? 'reference' : 'guide'
  const query = String(searchParams.get('q') || '').slice(0, 200)
  const searching = Boolean(query.trim())
  const results = useMemo(
    () => searchHelpDocuments({ scenarios, references }, query),
    [scenarios, references, query]
  )

  useEffect(() => {
    if (!selectedGuide || !selectedScenario) return
    const next = new URLSearchParams(searchParams)
    next.set('role', selectedGuide.key)
    next.set('scene', selectedScenario.key)
    next.set('view', view)
    next.delete('page')
    if (selectedReference && (view === 'reference' || next.has('ref'))) {
      next.set('ref', selectedReference.id)
    } else {
      next.delete('ref')
    }
    if (query) {
      next.set('q', query)
    } else {
      next.delete('q')
    }
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

  const handleRoleChange = (roleKey) => {
    const next = readHelpLocation()
    next.set('role', roleKey)
    next.delete('scene')
    next.delete('ref')
    next.delete('page')
    setSearchParams(next)
  }
  const handleQueryChange = (nextQuery) => {
    const next = readHelpLocation()
    if (nextQuery) next.set('q', nextQuery)
    else next.delete('q')
    setSearchParams(next, { replace: true })
  }
  const handleScenarioChange = (scenarioKey) => {
    const next = readHelpLocation()
    next.set('scene', scenarioKey)
    next.set('view', 'guide')
    next.delete('ref')
    next.delete('q')
    setSearchParams(next)
  }
  useLayoutEffect(() => {
    if (articleFocusPending.current && !searching && articleRef.current) {
      articleRef.current.focus()
      articleFocusPending.current = false
    }
  })
  const focusArticle = () => {
    articleFocusPending.current = true
  }
  const handleReferenceChange = (id) => {
    const next = readHelpLocation()
    next.set('view', 'reference')
    next.set('ref', id)
    next.delete('q')
    setSearchParams(next)
    focusArticle()
  }
  const handleViewChange = (nextView) => {
    const next = readHelpLocation()
    next.set('view', nextView)
    setSearchParams(next)
  }
  const relatedScenario =
    selectedReference &&
    scenarios.find((scene) => scene.pageKey === selectedReference.page.key)

  if (!selectedGuide || !selectedScenario) return null

  return (
    <div
      className="erp-help-center-page"
      data-role-help-key={selectedGuide.key}
    >
      <div className="erp-help-center-toolbar">
        <div
          className={
            guides.length > 1
              ? 'erp-help-center-role-picker'
              : 'erp-help-current-role'
          }
        >
          {guides.length > 1 ? (
            <>
              <label htmlFor="erp-help-center-role-select">查看岗位</label>
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
            </>
          ) : (
            <>
              <span className="erp-help-sidebar__label">查看岗位</span>
              <strong>{selectedGuide.label}</strong>
            </>
          )}
        </div>
        <Space.Compact className="erp-help-center-search">
          <SearchInput
            type="search"
            aria-label="搜索操作图解和参考手册"
            placeholder="搜任务、字段、状态，或直接输入问题"
            value={query}
            maxLength={200}
            allowClear
            onChange={(event) => handleQueryChange(event.target.value)}
            onPressEnter={() => handleQueryChange(query)}
          />
          <Button onClick={() => handleQueryChange(query)}>
            搜索
          </Button>
        </Space.Compact>
      </div>
      <div className="erp-help-center-nav">
        <SlidingTabs
          aria-label="手册类型"
          activeKey={view}
          items={manualViews}
          onChange={handleViewChange}
        />
        <Button
          icon={<BookOutlined aria-hidden="true" />}
          aria-label="目录"
          aria-expanded={directoryOpen}
          aria-controls="erp-help-directory"
          onClick={() => setDirectoryOpen(!directoryOpen)}
        >
          目录
        </Button>
      </div>
      {guides.length > 1 ? (
        <p className="erp-help-role-note">
          切换这里只查看说明，不改变岗位或权限。
        </p>
      ) : null}
      <div className="erp-help-mobile-picker">
        <label htmlFor="erp-help-scene-select">
          {view === 'guide' ? '我要办什么' : '查阅章节与词条'}
        </label>
        <Select
          id="erp-help-scene-select"
          value={
            view === 'guide' ? selectedScenario.key : selectedReference?.id
          }
          options={
            view === 'guide'
              ? scenarios.map((scenario) => ({
                  value: scenario.key,
                  label: helpScenarioTitle(scenario),
                }))
              : referencePages.map((page) => ({
                  label: page.title,
                  options: references
                    .filter((reference) => reference.page.key === page.key)
                    .map((reference) => ({
                      value: reference.id,
                      label: reference.title,
                    })),
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
        data-directory-open={directoryOpen}
      >
        <aside
          id="erp-help-directory"
          className="erp-help-sidebar"
          aria-label="岗位与场景"
          hidden={!directoryOpen}
        >
          {view === 'guide' ? (
            <nav className="erp-help-topics" aria-label="办事场景">
              <h2>我要办什么</h2>
              {scenarios.map((scenario) => (
                <button
                  key={scenario.key}
                  type="button"
                  className="erp-help-topic"
                  aria-current={
                    scenario.key === selectedScenario.key ? 'page' : undefined
                  }
                  onClick={() => handleScenarioChange(scenario.key)}
                >
                  <span className="erp-help-topic__label">
                    {helpScenarioTitle(scenario)}
                  </span>
                  <ArrowRightOutlined aria-hidden="true" />
                </button>
              ))}
            </nav>
          ) : (
            <nav className="erp-help-topics" aria-label="参考目录">
              <h2>按业务查阅</h2>
              {[
                ...new Set(referencePages.map((page) => page.sectionTitle)),
              ].map((section) => (
                <details
                  key={section}
                  open={selectedReference?.page.sectionTitle === section}
                >
                  <summary>{section}</summary>
                  {referencePages
                    .filter((page) => page.sectionTitle === section)
                    .map((page) => (
                      <div key={page.key}>
                        <button
                          type="button"
                          className="erp-help-topic"
                          aria-current={
                            selectedReference?.id === page.key
                              ? 'page'
                              : undefined
                          }
                          onClick={() => handleReferenceChange(page.key)}
                        >
                          {page.title}
                        </button>
                        {selectedReference?.page.key === page.key
                          ? page.items.map((item) => (
                            <button
                              type="button"
                              className="erp-help-topic erp-help-topic--entry"
                              key={item.key}
                              aria-current={
                                  selectedReference?.item?.key === item.key
                                    ? 'page'
                                    : undefined
                                }
                              onClick={() =>
                                  handleReferenceChange(
                                    `${page.key}:${item.key}`
                                  )
                                }
                            >
                              {item.title}
                            </button>
                            ))
                          : null}
                      </div>
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
                icon={<MobileOutlined />}
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
                      onClick={() => {
                        if (result.kind === 'guide') {
                          handleScenarioChange(result.id)
                          focusArticle()
                        } else handleReferenceChange(result.id)
                      }}
                    >
                      <span className="erp-help-search-results__kind">
                        {getHelpDocumentKindLabel(result.kind)} ·{' '}
                        {result.page?.title || selectedGuide.label}
                      </span>
                      <strong>{result.title}</strong>
                      <span>{result.summary}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p>
                没有找到相关说明。可尝试单据名称、字段名称，或打开目录查阅。
              </p>
            )}
          </section>
        ) : view === 'reference' ? (
          selectedReference ? (
            <article
              className="erp-help-article erp-help-article--reference"
              data-help-reference={selectedReference.id}
            >
              <header className="erp-help-article__heading">
                <div>
                  <Text type="secondary">
                    {selectedReference.page.sectionTitle} /{' '}
                    {selectedReference.page.title} ·{' '}
                    {getHelpDocumentKindLabel(selectedReference.kind)}
                  </Text>
                  <Title level={3} ref={articleRef} tabIndex={-1}>
                    {selectedReference.title}
                  </Title>
                </div>
                {selectedReference.page.available ? (
                  <Button onClick={() => navigate(selectedReference.page.path)}>
                    打开业务页面 <ArrowRightOutlined aria-hidden="true" />
                  </Button>
                ) : (
                  <Text type="secondary">
                    当前账号未开放此页面，可查看办理说明。
                  </Text>
                )}
              </header>
              <HelpReferenceContent
                document={selectedReference}
                roleKey={selectedGuide.key}
                onGuide={
                  relatedScenario
                    ? () => {
                        handleScenarioChange(relatedScenario.key)
                        focusArticle()
                      }
                    : null
                }
              />
            </article>
          ) : (
            <section>
              <p>当前岗位暂无业务参考章节，可先查看岗位操作图解。</p>
            </section>
          )
        ) : (
          <article
            className="erp-help-article"
            data-help-scenario={selectedScenario.key}
          >
            <header className="erp-help-article__heading">
              <div>
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
                      reference.page.key === selectedScenario.pageKey &&
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
        )}
      </div>
    </div>
  )
}
