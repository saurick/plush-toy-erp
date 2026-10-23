import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeftOutlined } from '@ant-design/icons'
import { Button, Drawer, Empty, Space, Tag, Typography } from 'antd'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import SearchInput from '@/common/components/SearchInput'
import SlidingTabList from '@/common/components/navigation/SlidingTabList'
import Table from '@/common/components/table/AppTable'
import { Markdown } from '@/common/components/markdown'
import {
  RpcMethod,
  RpcTransport,
} from '@/common/consts/rpcMethods.generated.mjs'
import apiSource from '../../../../server/docs/api.md?raw'
import integrationGuideSource from '../../../../docs/engineering/跨层公共契约与生成规范.md?raw'
import DevPageNav from '../components/DevPageNav.jsx'
import DevProjectGraphView from '../components/DevProjectGraphView.jsx'
import DevTimestamp from '../components/DevTimestamp.jsx'
import DevIntegrationCallDetails from '../components/DevIntegrationCallDetails.jsx'
import DevRPCContractReview from '../components/DevRPCContractReview.jsx'
import DevIntegrationRelationshipExamples, {
  DevIntegrationAccess,
} from '../components/DevIntegrationRelationships.jsx'
import { buildProjectGraph } from '../config/devProjectGraph.mjs'
import { readPermissionRelationshipSnapshot } from '../config/devPermissionRelationshipApi.mjs'
import { createDevQualityGateClient } from '../config/devQualityGates.mjs'
import { qualityGateViewStatus } from '../config/qualityGatePresentation.mjs'
import {
  DEV_PERMISSION_RELATIONSHIPS_ROUTE,
  DEV_QUALITY_GATES_ROUTE,
} from '../config/devRoutes.mjs'
import { buildDevDocsLocation, resolveDevDocsMarkdownHref } from './devDocsNavigation.mjs'
import { DEV_PAGINATION } from '../config/devPagination.mjs'
import {
  INTEGRATION_PAGE_SIZE,
  INTEGRATION_GUIDE_DOCUMENT,
  buildIntegrationEntries,
  filterIntegrationEntries,
  integrationContractLocation,
  integrationEndpoint,
  integrationPermissions,
  parseIntegrationSearch,
  readIntegrationEvidence,
  readIntegrationGuide,
  readIntegrationBoundary,
  readIntegrationRelationshipExamples,
} from '../config/devIntegration.mjs'
import '../styles/dev-integration.css'
import { RpcInspection } from '../config/rpcInspection.generated.mjs'
import FilterSelect from '@/common/components/select/FilterSelect'

const graph = buildProjectGraph('integration')
const entries = buildIntegrationEntries(RpcMethod, apiSource, RpcInspection)
const integrationGuide = readIntegrationGuide(integrationGuideSource)
const integrationBoundary = readIntegrationBoundary(apiSource)
const relationshipExamples = readIntegrationRelationshipExamples(integrationGuideSource)
const identityContractLocation = buildDevDocsLocation({
  path: INTEGRATION_GUIDE_DOCUMENT,
  headingId: '系统接入边界--integration-boundary',
})
const emptyPermissions = new Map()
const views = [
  ['inventory', '接口清单'],
  ['changes', '本轮变更'],
  ['guide', '接入指引'],
]
const domains = [...new Map(entries.map((entry) => [entry.domain, {
  label: entry.domainLabel,
  value: entry.domain,
}])).values()]
const contractLabel = (contract) =>
  contract?.documentation ? '调用合同' :
    contract?.kind === 'detail' ? '明细合同' : '章节说明'
const detailViews = [
  ['request', '请求参数'],
  ['response', '返回结果'],
  ['governance', '权限与证据'],
]

export default function DevIntegrationPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const inventorySurface = useRef(null)
  const detailOpener = useRef(null)
  const closeButton = useRef(null)
  const query = parseIntegrationSearch(params)
  const guideSurface = useRef(null)
  const pendingParams = useRef(params)
  const [permissionState, setPermissionState] = useState({
    loading: true,
    data: null,
    error: false,
  })
  const [permissionReload, setPermissionReload] = useState(0)
  const [gateState, setGateState] = useState({
    loading: false,
    data: null,
    error: false,
  })
  const [gateReload, setGateReload] = useState(0)
  const [evidenceState, setEvidenceState] = useState({
    loading: false,
    data: null,
    error: false,
  })
  const [evidenceReload, setEvidenceReload] = useState(0)
  const [graphOpen, setGraphOpen] = useState(Boolean(query.node))
  const [evidenceOpen, setEvidenceOpen] = useState(false)
  const gateClient = useMemo(() => createDevQualityGateClient(), [])

  useEffect(() => {
    pendingParams.current = params
  }, [params])

  useEffect(() => {
    if (query.view !== 'inventory') return undefined
    const controller = new AbortController()
    setPermissionState({ loading: true, data: null, error: false })
    readPermissionRelationshipSnapshot({ signal: controller.signal })
      .then((snapshot) => {
        if (!controller.signal.aborted) {
          setPermissionState({
            loading: false,
            error: false,
            data: {
              associations: integrationPermissions(snapshot.permissions),
              readAt: snapshot.read_at,
            },
          })
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setPermissionState({ loading: false, data: null, error: true })
        }
      })
    return () => controller.abort()
  }, [permissionReload, query.view])

  useEffect(() => {
    if (!gateReload) return undefined
    const controller = new AbortController()
    setGateState({ loading: true, data: null, error: false })
    gateClient
      .summary({ signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) {
          setGateState({ loading: false, data, error: false })
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setGateState({ loading: false, data: null, error: true })
        }
      })
    return () => controller.abort()
  }, [gateClient, gateReload])

  useEffect(() => {
    if (query.node) setGraphOpen(true)
  }, [query.node])

  useEffect(() => {
    if (!evidenceReload) return undefined
    const controller = new AbortController()
    setEvidenceState({ loading: true, data: null, error: false })
    readIntegrationEvidence({ signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted) {
          setEvidenceState({ loading: false, data, error: false })
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setEvidenceState({ loading: false, data: null, error: true })
        }
      })
    return () => controller.abort()
  }, [evidenceReload])

  useEffect(() => {
    const container = guideSurface.current
    if (!container) return undefined
    const followGuideLink = (event) => {
      const anchor = event.target?.closest?.('a[href]')
      if (!anchor || !container.contains(anchor)) return
      const target = resolveDevDocsMarkdownHref(anchor.getAttribute('href'), INTEGRATION_GUIDE_DOCUMENT)
      if (!target) return
      event.preventDefault()
      navigate(buildDevDocsLocation({ path: target.path, headingId: target.headingId }))
    }
    container.addEventListener('click', followGuideLink)
    return () => container.removeEventListener('click', followGuideLink)
  }, [navigate, query.view])

  const updateQuery = useCallback(
    (values, replace = false) => {
      // Router search updates do not queue; merge rapid filter changes before
      // the preceding navigation has rendered. The URL remains the saved state.
      const next = new URLSearchParams(pendingParams.current)
      for (const [key, value] of Object.entries(values)) {
        next.delete(key)
        if (value) next.set(key, String(value))
      }
      pendingParams.current = next
      setParams(next, { replace })
    },
    [setParams]
  )
  const selectNode = useCallback((node) => updateQuery({ node }), [updateQuery])
  const openMethod = (event, entry) => {
    detailOpener.current = { element: event.currentTarget, key: entry.key }
    updateQuery({ rpc: entry.key, detail: '', section: '' })
  }
  const closeDetails = () => updateQuery({ rpc: '', detail: '', section: '' })
  const updateFilters = (values, replace = false) =>
    updateQuery({ ...values, page: query.rpc ? 1 : '' }, replace)
  const clearFilters = () => updateFilters({ domain: '', q: '' })
  const permissionMap = permissionState.data?.associations || emptyPermissions
  const filtered = filterIntegrationEntries(entries, query)
  const selected = query.view === 'inventory'
    ? entries.find((entry) => entry.key === query.rpc)
    : undefined
  const selectedPosition = selected ? filtered.findIndex((entry) => entry.key === selected.key) : -1
  const page = Math.min(
    selectedPosition >= 0 && !params.has('page')
      ? Math.floor(selectedPosition / INTEGRATION_PAGE_SIZE) + 1 : query.page,
    Math.max(1, Math.ceil(filtered.length / INTEGRATION_PAGE_SIZE))
  )
  useEffect(() => {
    if (selectedPosition >= 0 && query.page !== page) {
      updateQuery({ page: page === 1 ? '' : page }, true)
    }
  }, [page, query.page, selectedPosition, updateQuery])
  const selectedPermissions = selected
    ? permissionMap.get(selected.key) || []
    : []
  useEffect(() => {
    if (selected && detailOpener.current?.key !== selected.key) detailOpener.current = null
  }, [selected])
  useLayoutEffect(() => {
    const panel = inventorySurface.current?.querySelector('.erp-dev-integration__detail-panel')
    const section = query.detail === 'governance' && query.section
      ? panel?.querySelector(`[data-integration-section="${query.section}"]`)
      : null
    panel?.scrollTo(0, section?.offsetTop || 0)
    section?.focus({ preventScroll: true })
  }, [selected, query.detail, query.section])
  useLayoutEffect(() => {
    const surface = inventorySurface.current
    if (!selected || !surface) return undefined
    const fitDrawer = () => {
      const bounds = surface.getBoundingClientRect()
      const top = Math.max(0, 12 - bounds.top)
      const available = Math.max(240, window.innerHeight - Math.max(12, bounds.top) - 12)
      const height = Math.min(bounds.height - top, available)
      surface.style.setProperty('--integration-available-height', `${available}px`)
      surface.style.setProperty('--integration-drawer-top', `${top}px`)
      surface.style.setProperty('--integration-drawer-height', `${Math.max(240, height)}px`)
    }
    fitDrawer()
    const observer = new ResizeObserver(fitDrawer)
    observer.observe(surface)
    window.addEventListener('resize', fitDrawer)
    window.addEventListener('scroll', fitDrawer, { passive: true, capture: true })
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', fitDrawer)
      window.removeEventListener('scroll', fitDrawer, true)
    }
  }, [selected])
  const gateStatus = gateState.data
    ? qualityGateViewStatus(gateState.data, 'server', '')
    : null
  const scenarioStatus = (status) =>
    ({
      passed: evidenceState.data?.current ? '通过' : '历史通过',
      failed: '失败',
      skipped: '跳过',
      missing: '未执行或缺少完整结果',
    })[status]
  const associatedScenarios =
    evidenceState.data?.scenarios.filter((row) =>
      row.methods.includes(selected?.key)
    ) || []
  const permissionText = (entry) => {
    if (permissionState.loading) return '正在读取'
    if (permissionState.error) return '读取失败'
    const values = permissionMap.get(entry.key) || []
    return values.length
      ? values
          .slice(0, 2)
          .map((item) => item.name)
          .join('、') + (values.length > 2 ? ` 等 ${values.length} 项` : '')
      : '未登记'
  }
  const columns = [
    {
      title: '方法',
      dataIndex: 'method',
      width: '46%',
      render: (method, entry) => (
        <Button type="link" onClick={(event) => openMethod(event, entry)}>
          <span className="erp-dev-integration__identity">
            {entry.label ? <span>{entry.label}</span> : null}
            <code>{entry.domain}.{method}</code>
          </span>
        </Button>
      ),
    },
    {
      title: '关联权限',
      key: 'permissions',
      width: '24%',
      render: (_, entry) => (
        <span>
          {!permissionState.loading && !permissionState.error && (permissionMap.get(entry.key)?.length || 0) > 1
            ? `${permissionMap.get(entry.key).length} 项权限`
            : permissionText(entry)}
        </span>
      ),
    },
    {
      title: '合同与验证',
      key: 'contract',
      width: '30%',
      render: (_, entry) => (
        <Space wrap>
          <span className={!entry.contract || entry.contract.kind === 'chapter' ? 'erp-dev-integration__contract--missing' : ''}>
            {entry.contract ? contractLabel(entry.contract) : '未逐项登记'}
          </span>
          <span className="erp-dev-integration__note">
            {entry.contract?.references.length ? `${entry.contract.references.length} 项来源` : '未关联来源'}
          </span>
        </Space>
      ),
    },
  ]

  return (
    <div className="erp-dev-workspace-page erp-dev-tool-page erp-dev-integration">
      <DevPageNav sourcePath="server/docs/api.md" />
      <header className="erp-dev-integration__header">
        <Typography.Title level={1}>接口与集成</Typography.Title>
        <SlidingTabList
          className="erp-navigation-tabs erp-navigation-tabs--options erp-dev-integration__tabs"
          aria-label="接口与集成查看方式"
        >
          {views.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              id={`integration-tab-${key}`}
              aria-controls={`integration-panel-${key}`}
              aria-selected={query.view === key}
              onClick={() => {
                if (query.view !== key) updateQuery({ view: key, rpc: '', detail: '', section: '' })
              }}
            >
              {label}
            </button>
          ))}
        </SlidingTabList>
      </header>
      <main className="erp-dev-integration__main">
        <div
          className="erp-dev-integration__panel"
          role="tabpanel"
          id={`integration-panel-${query.view}`}
          aria-labelledby={`integration-tab-${query.view}`}
        >
          {query.view === 'inventory' ? (
            <>
              <div className="erp-dev-integration__filters">
                <div className="erp-dev-integration__filter-controls">
                  <div className="erp-dev-integration__filter">
                    <label htmlFor="integration-domain">业务域</label>
                    <FilterSelect
                      id="integration-domain"
                      aria-label="筛选业务域"
                      allowClear
                      showSearch
                      virtual={false}
                      filterOption={(input, option) => `${option.label} ${option.value}`.toLowerCase().includes(input.toLowerCase())}
                      value={query.domain || undefined}
                      placeholder="业务域"
                      options={[{ label: '全部业务域', value: '' }, ...domains]}
                      onChange={(domain) => updateFilters({ domain })}
                    />
                  </div>
                  <div className="erp-dev-integration__filter erp-dev-integration__filter--search">
                    <SearchInput
                      id="integration-search"
                      aria-label="搜索接口名称、方法名或用途"
                      placeholder="搜索接口名称、方法名或用途"
                      allowClear
                      value={query.q}
                      onSearch={(value) =>
                        updateFilters({ q: value }, true)
                      }
                    />
                  </div>
                </div>
                <div className="erp-dev-integration__filter-summary">
                  <span className="erp-dev-integration__count" role="status">
                    {query.domain || query.q
                      ? `找到 ${filtered.length} 个接口 · 共 ${entries.length} 个`
                      : `共 ${entries.length} 个接口`}
                  </span>
                  {query.domain || query.q ? (
                    <Button type="text" aria-label="重置筛选" onClick={clearFilters}>
                      重置
                    </Button>
                  ) : null}
                </div>
              </div>
              <div className={`erp-dev-integration__inventory-surface${selected ? ' erp-dev-integration__inventory-surface--open' : ''}`} ref={inventorySurface}>
                <section aria-label="接口清单" className="erp-dev-integration__table">
                  <Table
                    rowKey="key"
                    rowClassName={(entry) => entry.key === selected?.key ? 'erp-dev-integration__row--selected' : ''}
                    onRow={(entry) => ({ 'aria-selected': entry.key === selected?.key })}
                    size="middle"
                    bordered
                    columns={columns}
                    dataSource={filtered}
                    scroll={{ x: 700 }}
                    pagination={{
                    ...DEV_PAGINATION,
                    current: page,
                    pageSize: INTEGRATION_PAGE_SIZE,
                    showSizeChanger: false,
                    hideOnSinglePage: true,
                    onChange: (nextPage) => updateQuery({ page: nextPage === 1 && !query.rpc ? '' : nextPage }),
                  }}
                    locale={{
                    emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="没有匹配的接口，请调整或清除筛选" />,
                  }}
                  />
                  <div className="erp-dev-integration__source erp-dev-integration__permission-source" aria-label="权限来源">
                    {permissionState.loading ? (
                      <span>正在读取登记开发库的权限关联，接口清单仍可查询。</span>
                ) : null}
                    {permissionState.error ? (
                      <span role="alert">权限关联读取失败，当前不能判断是否已登记。</span>
                ) : null}
                    {permissionState.data ? (
                      <DevTimestamp
                        value={permissionState.data.readAt}
                        action="权限登记读取于"
                      />
                ) : null}
                    <Button
                      size="small"
                      loading={permissionState.loading}
                      onClick={() => setPermissionReload((value) => value + 1)}
                    >
                      {permissionState.error ? '重试权限读取' : '刷新权限关联'}
                    </Button>
                  </div>
                </section>
                <Drawer
                  rootClassName="erp-dev-integration-drawer"
                  title={
          selected ? (
            <div className="erp-dev-integration__drawer-identity">
              <h2>{selected.label || selected.method}</h2>
              <span>{selected.domainLabel}</span>
              <code>{selected.domain} / {selected.method}</code>
              <p>{selected.description || '当前方法用途尚未登记。'}</p>
            </div>
          ) : '接口依据'
        }
                  open={Boolean(selected)}
                  getContainer={false}
                  rootStyle={{ position: 'absolute' }}
                  styles={{ wrapper: { top: 'var(--integration-drawer-top, 0px)', bottom: 'auto', height: 'var(--integration-drawer-height, 600px)', maxWidth: '100%' } }}
                  width={640}
                  closable={false}
                  extra={<Button ref={closeButton} type="text" icon={<ArrowLeftOutlined aria-hidden="true" />} onClick={closeDetails}>返回接口清单</Button>}
                  onClose={closeDetails}
                  afterOpenChange={(open) => {
                    if (document.activeElement?.closest('.erp-dev-integration__filters')) return
                    if (open) {
                      const target = query.detail === 'governance' && query.section
                        ? inventorySurface.current?.querySelector(`[data-integration-section="${query.section}"]`)
                        : closeButton.current
                      if (target?.dataset?.integrationSection) {
                        inventorySurface.current?.querySelector('.erp-dev-integration__detail-panel')?.scrollTo(0, target.offsetTop)
                      }
                      target?.focus({ preventScroll: true })
                    } else if (query.view === 'inventory') {
                      const target = detailOpener.current?.element.isConnected
                        ? detailOpener.current.element : document.getElementById('integration-search')
                      target?.focus({ preventScroll: true })
                    }
                  }}
                >
                  {selected ? (
                    <div className="erp-dev-integration__detail">
                      <div className="erp-dev-integration__endpoint">
                        <strong>{RpcTransport.method}</strong>
                        <code>{integrationEndpoint(selected.domain, RpcTransport)}</code>
                        <span className="erp-dev-integration__note">JSON-RPC</span>
                        <Tag>业务接口</Tag>
                      </div>
                      <div className="erp-dev-integration__access-summary">
                        <span>按正式合同鉴权 · 未关联实际适配器</span>
                      </div>
                      {selectedPosition < 0 ? (
                        <div className="erp-dev-integration__access-summary" role="status">
                          <span>当前接口不在筛选结果中。</span>
                          <Button type="link" onClick={() => updateQuery({ domain: selected.domain, q: '', page: '' })}>在清单中定位接口</Button>
                        </div>
                      ) : null}
                      <SlidingTabList
                        className="erp-navigation-tabs erp-navigation-tabs--options erp-dev-integration__detail-tabs"
                        aria-label="接口详情资料"
                      >
                        {detailViews.map(([key, label]) => (
                          <button
                            key={key}
                            type="button"
                            role="tab"
                            id={`integration-detail-tab-${key}`}
                            aria-controls={`integration-detail-panel-${key}`}
                            aria-selected={query.detail === key}
                            onClick={() => {
                    if (query.detail !== key) updateQuery({ detail: key, section: '' })
                  }}
                          >
                            {label}
                          </button>
              ))}
                      </SlidingTabList>
                      <div
                        className="erp-dev-integration__detail-panel"
                        role="tabpanel"
                        id={`integration-detail-panel-${query.detail}`}
                        aria-labelledby={`integration-detail-tab-${query.detail}`}
                      >
                        {query.detail === 'governance' ? (
                          <div className="erp-dev-integration__governance-detail">
                            <section data-integration-section="access" tabIndex={-1} className={query.section === 'access' ? 'erp-dev-integration__section--target' : ''}>
                              <DevIntegrationAccess
                                boundary={integrationBoundary}
                                method
                                guide={integrationGuide}
                              />
                            </section>
                            <section data-integration-section="permissions" tabIndex={-1} className={query.section === 'permissions' ? 'erp-dev-integration__section--target' : ''}>
                              <div className="erp-dev-integration__section-heading">
                                <h2>权限登记</h2>
                                <Tag>{permissionState.loading ? '正在读取' : permissionState.error ? '读取失败' : selectedPermissions.length ? '已关联登记' : '未登记'}</Tag>
                              </div>
                              <p>{permissionText(selected)}</p>
                              {permissionState.error ? <Button size="small" onClick={() => setPermissionReload((value) => value + 1)}>重试权限读取</Button> : null}
                              <div className="erp-dev-integration__permission-codes">
                                {selectedPermissions.map((permission) => <code key={permission.key}>{permission.key}</code>)}
                              </div>
                              {selected.contract?.kind === 'detail' ? (
                                <div className="erp-dev-integration__method-authorization">
                                  <Markdown source={selected.contract.authorization} />
                                </div>
                    ) : null}
                              {selectedPermissions.some((permission) => permission.conditions.length) ? (
                                <details className="erp-dev-disclosure erp-dev-integration__permission-conditions">
                                  <summary>权限登记的补充条件</summary>
                                  {selectedPermissions.filter((permission) => permission.conditions.length).map((permission) => (
                                    <div key={permission.key}>
                                      <strong>{permission.name}</strong>
                                      {[...new Set(permission.conditions)].map((condition) => <p key={condition}>{condition}</p>)}
                                    </div>
                        ))}
                                </details>
                    ) : null}
                              <p>
                                <Link to={`${DEV_PERMISSION_RELATIONSHIPS_ROUTE}?mode=account`}>
                                  按账号核对权限
                                </Link>
                                {' · '}
                                <Link to={identityContractLocation}>身份与授权规则</Link>
                              </p>
                            </section>
                            <section data-integration-section="contract" tabIndex={-1} className={query.section === 'contract' ? 'erp-dev-integration__section--target' : ''}>
                              <div className="erp-dev-integration__section-heading">
                                <h2>正式合同</h2>
                                <Tag>{selected.contract ? contractLabel(selected.contract) : '未逐项登记'}</Tag>
                              </div>
                              {selected.contract ? (
                                <Link to={integrationContractLocation(selected.contract)}>
                                  打开{contractLabel(selected.contract)}：
                                  {selected.contract.documentation?.heading.title || selected.contract.heading.title}
                                </Link>
                    ) : (
                      <>
                        <p>未逐项登记，需回到所属 handler 与领域合同核对。</p>
                        {selected.purposeLocation ? <Link to={selected.purposeLocation}>查看名称与用途说明</Link> : null}
                      </>
                    )}
                              {selected.contract?.kind === 'detail' ? (
                                <>
                                  {!selected.contract.documentation ? (
                                    <>
                                      <h3>入参与边界</h3>
                                      <Markdown source={selected.contract.fields} />
                                    </>
                        ) : null}
                                  <h3>并发与重试</h3>
                                  <Markdown source={selected.contract.retry} />
                                </>
                    ) : selected.contract ? (
                      <p>当前仅关联方法所在章节，不能据此认定字段合同完整。</p>
                    ) : null}
                            </section>
                            <section data-integration-section="evidence" tabIndex={-1} className={query.section === 'evidence' ? 'erp-dev-integration__section--target' : ''}>
                              <div className="erp-dev-integration__section-heading">
                                <h2>验证依据</h2>
                                <Tag>需核对运行证据</Tag>
                              </div>
                              {evidenceState.error ? <p role="alert">场景运行证据读取失败，请重试或到质量门禁核对。</p> : null}
                              {evidenceState.loading ? <p role="status">正在读取关联场景证据。</p> : null}
                              {selected.contract?.references.length ? (
                                <ul>
                                  {selected.contract.references.map((reference) => (
                                    <li key={reference}>
                                      <code>{reference}</code>
                                    </li>
                        ))}
                                </ul>
                    ) : (
                      <p>未关联回归来源。</p>
                    )}
                              {associatedScenarios.length ? (
                                <ul>
                                  {associatedScenarios.map((row) => (
                                    <li key={row.test}>
                                      {row.label}：{scenarioStatus(row.status)}
                                    </li>
                        ))}
                                </ul>
                    ) : (
                      <p>
                        {evidenceState.data
                          ? '未关联场景运行结果，当前接口验证结果为未验证。'
                          : '尚未读取场景运行证据，当前接口验证结果为未验证。'}
                      </p>
                    )}
                              <p>关联场景不等于该接口全部参数和授权条件已验证。</p>
                              {evidenceState.data?.run ? (
                                <p className="erp-dev-integration__note">
                                  {evidenceState.data.current ? '源码身份与当前工作区一致' : '历史证据，未覆盖当前工作区'}
                                  {evidenceState.data.run.finishedAt ? <DevTimestamp value={evidenceState.data.run.finishedAt} action=" · 运行完成于" /> : null}
                                </p>
                              ) : null}
                              <Button size="small" loading={evidenceState.loading} onClick={() => setEvidenceReload((value) => value + 1)}>
                                {evidenceState.error ? '重试关联场景证据' : evidenceState.data ? '刷新关联场景证据' : '读取关联场景证据'}
                              </Button>
                              <Link to={DEV_QUALITY_GATES_ROUTE}>核对原始门禁与源码身份</Link>
                            </section>
                          </div>
              ) : (
                <DevIntegrationCallDetails
                  entry={selected}
                  view={query.detail}
                  format={query.format}
                  onFormatChange={(format) => updateQuery({ format: format === 'json' ? '' : format })}
                  onContract={() => updateQuery({ detail: 'governance', section: 'contract' })}
                />
              )}
                      </div>
                    </div>
        ) : null}
                </Drawer>
              </div>
              {query.rpc && !selected ? (
                <p role="status">
                  该接口未在当前生成物中登记。
                  <Button type="link" onClick={closeDetails}>
                    清除选择
                  </Button>
                </p>
              ) : null}
            </>
          ) : query.view === 'changes' ? (
            <DevRPCContractReview />
          ) : (
            <>
              <section className="erp-dev-integration__table erp-dev-integration__guide" aria-label="接入方式选择" ref={guideSurface}>
                <h2>接入方式选择</h2>
                {integrationGuide ? (
                  <>
                    <Markdown source={integrationGuide.selectionSource} />
                    {integrationGuide.boundarySource ? <div className="erp-dev-integration__note"><Markdown source={integrationGuide.boundarySource} /></div> : null}
                    <details className="erp-dev-disclosure erp-dev-integration__guide-notes">
                      <summary>登记与验收说明</summary>
                      <Markdown source={integrationGuide.detailsSource} />
                      <Link to={integrationGuide.location}>查看正式接入规范</Link>
                    </details>
                  </>
                ) : (
                  <p role="status">接入方式选择指引缺失，请核对正式规范。</p>
                )}
              </section>
              <section className="erp-dev-integration__table erp-dev-integration__relationships">
                <DevIntegrationAccess
                  boundary={integrationBoundary}
                />
              </section>
              <DevIntegrationRelationshipExamples examples={relationshipExamples} value={query.example} onChange={(example) => updateQuery({ example })} />
              <details
                className="erp-dev-disclosure erp-dev-integration__graph"
                open={graphOpen}
                onToggle={(event) => setGraphOpen(event.currentTarget.open)}
              >
                <summary>接入边界图</summary>
                {graphOpen ? (
                  <div className="erp-dev-project-relationships">
                    <DevProjectGraphView
                      graph={graph}
                      selectedNodeId={query.node}
                      onNodeSelect={selectNode}
                    />
                  </div>
                ) : null}
              </details>
            </>
          )}
        </div>
        <details
          className="erp-dev-disclosure erp-dev-integration__table erp-dev-integration__evidence-disclosure"
          open={evidenceOpen}
          onToggle={(event) => setEvidenceOpen(event.currentTarget.open)}
        >
          <summary>正式文档与验证依据</summary>
          <div className="erp-dev-integration__evidence-content">
            <nav className="erp-dev-project-relationships__links" aria-label="合同与验证入口">
              {graph.destinations.map((destination) => (
                <Link key={destination.route} to={destination.route}>{destination.label}</Link>
              ))}
            </nav>
            <p className="erp-dev-integration__note">
              权限登记供核对，回归来源与整体门禁不能证明逐接口验证通过。
            </p>
            <section
              className="erp-dev-integration__source"
              aria-label="门禁整体证据"
            >
              <strong>门禁整体证据</strong>
              {!gateState.data && !gateState.error ? (
                <span>{gateState.loading ? '正在读取' : '尚未读取'}</span>
                ) : null}
              {gateState.error ? (
                <span role="alert">门禁证据读取失败，结果未验证。</span>
                ) : null}
              {gateStatus ? (
                <span>
                  {gateStatus.title} ·{' '}
                  {gateState.data.serverEvidence.gitSha
                      ? `证据提交 ${gateState.data.serverEvidence.gitSha.slice(0, 12)}`
                      : '缺少证据提交'}
                  {!gateState.data.serverEvidence.current
                      ? ' · 未匹配当前提交'
                      : ''}
                  {!gateState.data.serverEvidence.coversWorkingTree
                      ? ' · 未覆盖当前工作区'
                      : ''}
                  {gateState.data.repository.dirty ? ' · 工作区有未提交改动' : ''}
                </span>
                ) : null}
              {gateState.data ? (
                <DevTimestamp value={gateState.data.generatedAt} action="读取于" />
                ) : null}
              <Button
                size="small"
                loading={gateState.loading}
                onClick={() => setGateReload((value) => value + 1)}
              >
                {gateReload ? '刷新门禁证据' : '读取门禁证据'}
              </Button>
              <Link to={DEV_QUALITY_GATES_ROUTE}>到质量门禁核对</Link>
            </section>
            <section
              className="erp-dev-integration__table"
              aria-label="模拟接入运行证据"
            >
              <div className="erp-dev-integration__source">
                <h2>模拟接入运行证据</h2>
                <Button
                  size="small"
                  loading={evidenceState.loading}
                  onClick={() => setEvidenceReload((value) => value + 1)}
                >
                  {evidenceReload ? '刷新场景证据' : '读取场景运行证据'}
                </Button>
              </div>
              {evidenceState.error ? (
                <p role="alert">场景运行证据读取失败，请核对原始报告后重试。</p>
                ) : null}
              {!evidenceReload ? (
                <p>按需读取现有隔离数据库门禁的原始用例结果。</p>
                ) : null}
              {evidenceState.data ? (
                <>
                  <p>
                    {evidenceState.data.run ? (
                      <>
                        {evidenceState.data.current
                            ? '源码身份与当前工作区一致'
                            : '历史证据，未覆盖当前工作区'}
                        {evidenceState.data.run.repository
                            ? ` · 提交 ${evidenceState.data.run.repository.commit.slice(0, 12)} · 指纹 ${evidenceState.data.run.repository.fingerprint.slice(0, 12)}`
                            : ' · 缺少源码身份'}
                        {` · 门禁${evidenceState.data.run.status === 'passed' ? '通过' : '未通过'} · 清理${evidenceState.data.run.cleanupComplete ? '完成' : '未证明完成'}`}
                      </>
                      ) : (
                        '尚无可关联的隔离数据库运行回执。'
                      )}
                  </p>
                  {evidenceState.data.run?.finishedAt ? (
                    <DevTimestamp
                      value={evidenceState.data.run.finishedAt}
                      action="运行完成于"
                    />
                    ) : null}
                  <Table
                    rowKey="test"
                    size="small"
                    pagination={false}
                    dataSource={evidenceState.data.scenarios}
                    columns={[
                        { title: '模拟场景', dataIndex: 'label' },
                        {
                          title: '执行结果',
                          dataIndex: 'status',
                          render: scenarioStatus,
                        },
                        {
                          title: '回归用例',
                          dataIndex: 'test',
                          render: (test) => <code>{test}</code>,
                        },
                      ]}
                  />
                  {evidenceState.data.run ? (
                    <p>
                      原始回执：<code>{evidenceState.data.run.receipt}</code>
                    </p>
                    ) : null}
                  <p className="erp-dev-integration__note">
                    结果只证明对应模拟场景；不代表全部接口、外部合作方授权或真实第三方验收通过。
                  </p>
                </>
                ) : null}
            </section>
          </div>
        </details>
      </main>

    </div>
  )
}
