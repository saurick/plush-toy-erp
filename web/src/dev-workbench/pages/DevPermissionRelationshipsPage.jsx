import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  ReloadOutlined,
  SafetyCertificateOutlined,
  ArrowRightOutlined,
} from '@ant-design/icons'
import { Alert, Button, Drawer, Empty, Tag, Typography } from 'antd'
import Select from '@/common/components/select/AppSelect'
import Table from '@/common/components/table/AppTable'
import SearchInput from '@/common/components/SearchInput'
import Segmented from '@/common/components/navigation/SlidingSegmented'
import Tabs from '@/common/components/navigation/SlidingTabs'
import FilterChip from '@/common/components/navigation/FilterChip'
import { Loading } from '@/common/components/loading'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import DevPageHeader from '../components/DevPageHeader.jsx'
import DevPageNav from '../components/DevPageNav.jsx'
import DevPermissionNavigationOverview from '../components/DevPermissionNavigationOverview.jsx'
import DevPermissionRelationshipGraph from '../components/DevPermissionRelationshipGraph.jsx'
import DevRoleResponsibilityGraph from '../components/DevRoleResponsibilityGraph.jsx'
import { buildRoleResponsibilityModel } from '../config/devRoleResponsibilities.mjs'
import { WorkbenchEmpty } from '../components/WorkbenchPattern.jsx'
import { readPermissionRelationshipSnapshot } from '../config/devPermissionRelationshipApi.mjs'
import { buildPermissionRelationshipNavigationModel } from '../config/devPermissionNavigation.mjs'
import {
  PERMISSION_RELATIONSHIP_ALL_MODULES,
  PERMISSION_RELATIONSHIP_DETAIL_SCOPE,
  PERMISSION_RELATIONSHIP_VIEW_MODE,
  buildPermissionCapabilityGroups,
  buildPermissionRelationshipDetailRows,
  buildPermissionRelationshipEvidence,
  buildPermissionRelationshipModel,
  buildPermissionRelationshipModuleOptions,
  buildPermissionRelationshipTargetOptions,
  getPermissionRelationshipContext,
} from '../config/devPermissionRelationshipGraph.mjs'
import { DEV_PAGINATION } from '../config/devPagination.mjs'
import { DEV_FLOW_STATE_QUERY_KEYS } from './devFlowStateQuery.mjs'
import { DEV_FLOW_STATE_CATALOG } from '../config/devFlowStateCatalog.mjs'
import { buildFulfillmentRelations } from '../config/devFulfillmentRelations.mjs'
import '../styles/dev-permission-relationships.css'

const { Text, Title } = Typography
const linkedPermissions = new Set(
  buildFulfillmentRelations(DEV_FLOW_STATE_CATALOG).flatMap(({ actions }) =>
    actions.flatMap((action) => action.permissionKeys)
  )
)
const { ROLE } = PERMISSION_RELATIONSHIP_VIEW_MODE
const ALL = PERMISSION_RELATIONSHIP_ALL_MODULES
const EMPTY = {
  roles: [],
  accounts: [],
  permissions: [],
  access_by_role_key: {},
  warehouse_options: [],
  approval_settings: null,
}
const resultTag = (status) => (
  <Tag
    color={
      ['可用', '已生效', '已配置'].includes(status)
        ? 'green'
        : ['受限', '未授予'].includes(status)
          ? 'orange'
          : undefined
    }
  >
    {status}
  </Tag>
)

export default function DevPermissionRelationshipsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const [snapshot, setSnapshot] = useState(EMPTY)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const requestRef = useRef(0)
  const abortRef = useRef(null)
  const evidenceRef = useRef(null)
  const responsibilityRef = useRef(null)
  const lastDrawerRef = useRef('')
  const viewMode =
    searchParams.get('mode') === PERMISSION_RELATIONSHIP_VIEW_MODE.ACCOUNT
      ? PERMISSION_RELATIONSHIP_VIEW_MODE.ACCOUNT
      : ROLE
  const keyword = searchParams.get('q') || ''
  const restrictedOnly = searchParams.get('status') === 'restricted'
  const tabKey = ['menu', 'details'].includes(searchParams.get('tab'))
    ? searchParams.get('tab')
    : 'graph'
  const panel = ['evidence', 'responsibilities'].includes(
    searchParams.get('panel')
  )
    ? searchParams.get('panel')
    : ''
  const evidenceOpen = panel === 'evidence'
  const requestedModule = searchParams.has('module')
    ? searchParams.get('module')
    : ALL
  const targetOptions = useMemo(
    () =>
      buildPermissionRelationshipTargetOptions({
        viewMode,
        roles: snapshot.roles,
        accounts: snapshot.accounts,
      }),
    [viewMode, snapshot.roles, snapshot.accounts]
  )
  const requestedTarget = searchParams.get('target')
  const targetKey =
    requestedTarget === ''
      ? ''
      : targetOptions.some((option) => option.value === requestedTarget)
        ? requestedTarget
        : targetOptions[0]?.value || ''
  const targetLabel =
    targetOptions.find((option) => option.value === targetKey)?.label || ''
  const contextInput = useMemo(
    () => ({
      viewMode,
      targetKey,
      roles: snapshot.roles,
      accounts: snapshot.accounts,
      permissions: snapshot.permissions,
      accessByRoleKey: snapshot.access_by_role_key,
    }),
    [viewMode, targetKey, snapshot]
  )
  const context = useMemo(
    () => getPermissionRelationshipContext(contextInput),
    [contextInput]
  )
  const allRows = useMemo(
    () =>
      buildPermissionRelationshipDetailRows({
        ...contextInput,
        detailScope: PERMISSION_RELATIONSHIP_DETAIL_SCOPE.ALL,
      }),
    [contextInput]
  )
  const groups = useMemo(
    () => buildPermissionCapabilityGroups(allRows, { keyword, restrictedOnly }),
    [allRows, keyword, restrictedOnly]
  )
  const selectedGroup =
    requestedModule === ALL
      ? groups[0]
      : groups.find((group) => group.key === requestedModule)
  const moduleOptions = useMemo(
    () => buildPermissionRelationshipModuleOptions(snapshot.permissions),
    [snapshot.permissions]
  )
  const requestedModuleLabel =
    moduleOptions.find((option) => option.value === requestedModule)?.label ||
    '所选业务能力'
  const navigationModel = useMemo(
    () =>
      tabKey === 'menu'
        ? buildPermissionRelationshipNavigationModel(contextInput)
        : null,
    [tabKey, contextInput]
  )
  const evidence = useMemo(
    () =>
      evidenceOpen
        ? buildPermissionRelationshipEvidence({
            roleKeys: context.roleKeys,
            accessByRoleKey: snapshot.access_by_role_key,
            approvalSettings: snapshot.approval_settings,
          })
        : null,
    [evidenceOpen, context, snapshot]
  )
  // Full account, scope and approval diagnostics are computed only on request.
  const evidenceRows = useMemo(() => {
    if (!evidenceOpen) return []
    const model = buildPermissionRelationshipModel({
      ...contextInput,
      moduleKey: ALL,
      warehouseOptions: snapshot.warehouse_options,
      approvalSettings: snapshot.approval_settings,
    })
    const rows =
      searchParams.get('scope') === PERMISSION_RELATIONSHIP_DETAIL_SCOPE.ALL
        ? allRows
        : allRows.filter((row) => row.status !== '未授予')
    return [...model.contextRows, ...rows]
  }, [evidenceOpen, contextInput, snapshot, allRows, searchParams])

  const globalModel = useMemo(
    () =>
      buildPermissionRelationshipModel({
        ...contextInput,
        moduleKey: ALL,
        warehouseOptions: snapshot.warehouse_options,
        approvalSettings: snapshot.approval_settings,
      }),
    [contextInput, snapshot]
  )
  const graphModel = useMemo(
    () =>
      tabKey !== 'graph' || !requestedModule || requestedModule === ALL
        ? globalModel
        : buildPermissionRelationshipModel({
            ...contextInput,
            moduleKey: requestedModule,
            warehouseOptions: snapshot.warehouse_options,
            approvalSettings: snapshot.approval_settings,
          }),
    [tabKey, requestedModule, globalModel, contextInput, snapshot]
  )
  const responsibilityModel = useMemo(
    () =>
      panel === 'responsibilities'
        ? buildRoleResponsibilityModel({
            ...contextInput,
            permissions: snapshot.permissions,
            moduleKey: ALL,
          })
        : null,
    [panel, contextInput, snapshot.permissions]
  )

  const updateSearch = useCallback(
    (patch, { replace = false } = {}) => {
      const next = new URLSearchParams(searchParams)
      Object.entries(patch).forEach(([key, value]) => {
        if (key === 'module') {
          if (value === ALL || value == null) next.delete(key)
          else next.set(key, value)
        } else if (key === 'target' || value) next.set(key, value)
        else next.delete(key)
      })
      setSearchParams(next, { replace })
    },
    [searchParams, setSearchParams]
  )

  const load = useCallback(async () => {
    const request = ++requestRef.current
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true)
    setError('')
    try {
      const next = await readPermissionRelationshipSnapshot({
        signal: controller.signal,
      })
      if (request === requestRef.current) setSnapshot(next)
    } catch (failure) {
      if (request === requestRef.current) {
        setError(
          failure.userMessage || getActionErrorMessage(failure, '读取权限结果')
        )
      }
    } finally {
      if (request === requestRef.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    return () => {
      requestRef.current += 1
      abortRef.current?.abort()
    }
  }, [load])

  useEffect(() => {
    if (loading || error || !targetOptions.length) return
    const next = new URLSearchParams(searchParams)
    for (const key of ['view', 'focus']) next.delete(key)
    next.set('target', targetKey)
    if (viewMode === ROLE) next.delete('mode')
    if (requestedModule === ALL) next.delete('module')
    if (tabKey === 'graph') next.delete('tab')
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true })
    }
  }, [
    loading,
    error,
    targetOptions.length,
    searchParams,
    targetKey,
    viewMode,
    requestedModule,
    tabKey,
    setSearchParams,
  ])

  useEffect(() => {
    if (panel) lastDrawerRef.current = panel
  }, [panel])

  const changeTarget = (mode, target) =>
    updateSearch({
      mode: mode === ROLE ? '' : mode,
      target,
      module: ALL,
      q: '',
      status: '',
      panel: '',
      duty: '',
      activity: '',
      scope: '',
    })
  const closePanel = () => updateSearch({ panel: '' })
  const changeTab = (tab) =>
    updateSearch({ tab: tab === 'graph' ? '' : tab, panel: '' })
  const openRoleSettings = (roleKey) =>
    navigate(
      `/erp/system/permissions?tab=roles&role=${encodeURIComponent(roleKey)}`
    )
  const openChain = (item) => {
    const params = new URLSearchParams({
      view: 'chain',
      chain: 'all',
      [DEV_FLOW_STATE_QUERY_KEYS.relationPermission]: item.key,
    })
    const roleKey =
      viewMode === ROLE
        ? targetKey
        : context.roleKeys.length === 1
          ? context.roleKeys[0]
          : ''
    if (roleKey) params.set(DEV_FLOW_STATE_QUERY_KEYS.role, roleKey)
    navigate(`/__dev/status-flows?${params}`)
  }
  const openDutyChain = (duty, selectedAction) => {
    const action =
      duty.actions.find((item) => item.key === selectedAction) ||
      duty.actions[0]
    if (!action) return
    const params = new URLSearchParams({
      view: 'chain',
      chain: 'all',
      [DEV_FLOW_STATE_QUERY_KEYS.role]: duty.roleKey,
      [DEV_FLOW_STATE_QUERY_KEYS.roleStage]: duty.stageKey,
      [DEV_FLOW_STATE_QUERY_KEYS.relationAction]: action.key,
    })
    navigate(`/__dev/status-flows?${params}`)
  }
  const notice = context.special
    ? '系统保留账号没有独立会话结果，不能按普通岗位推导可用能力。'
    : context.blocked
      ? context.blockedReason
      : context.issues.length
        ? context.issues.join('；')
        : context.projectionOnly
          ? '当前为多岗位合并参考，实际可用范围以员工登录后的权限结果为准。'
          : ''
  const capabilityColumns = [
    {
      title: '功能',
      dataIndex: 'label',
      render: (label, item) => (
        <span className="erp-dev-permission-function">
          <Text>{label}</Text>
          {keyword && item.status === '未授予' ? (
            <Text type="secondary">{item.result}</Text>
          ) : null}
        </span>
      ),
    },
    {
      title: '结果',
      dataIndex: 'status',
      width: 240,
      render: (status, item) => (
        <span className="erp-dev-permission-function">
          {resultTag(status)}
          {status === '受限' ? <Text>{item.result}</Text> : null}
        </span>
      ),
    },
    {
      title: '职责',
      key: 'responsibility',
      width: 100,
      render: (_, item) =>
        [...new Set(item.grants.map((grant) => grant.relation))].join('、'),
    },
    {
      title: '关联',
      key: 'flow',
      width: 96,
      render: (_, item) =>
        linkedPermissions.has(item.key) ? (
          <Button type="link" onClick={() => openChain(item)}>
            业务链路
          </Button>
        ) : null,
    },
  ]
  const evidenceColumns = [
    { title: '来源', dataIndex: 'source', width: 130 },
    { title: '关系', dataIndex: 'relation', width: 120 },
    { title: '对象', dataIndex: 'target', width: 180 },
    { title: '说明', dataIndex: 'result' },
    { title: '状态', dataIndex: 'status', width: 100, render: resultTag },
  ]

  const detailsView = (
    <>
      <div className="erp-dev-permission-search">
        <SearchInput
          aria-label="搜索功能"
          placeholder="搜索功能"
          allowClear
          value={keyword}
          onSearch={(q) => updateSearch({ q: q.trim(), module: ALL })}
        />
        <FilterChip
          selected={restrictedOnly}
          onClick={() =>
            updateSearch({
              status: restrictedOnly ? '' : 'restricted',
              module: ALL,
            })
          }
        >
          只看受限
        </FilterChip>
      </div>
      <div
        className="erp-dev-permission-capabilities"
        aria-label="岗位与业务能力"
      >
        <nav
          className="erp-dev-permission-capabilities__groups"
          aria-label="业务能力"
        >
          {groups.map((group) => (
            <button
              key={group.key}
              type="button"
              aria-pressed={selectedGroup?.key === group.key}
              onClick={() => updateSearch({ module: group.key })}
            >
              <span>{group.label}</span>
              <ArrowRightOutlined aria-hidden="true" />
              <small>
                {group.available ? `${group.available} 项可用` : ''}
                {group.available && group.restricted ? ' · ' : ''}
                {group.restricted
                  ? `${group.restricted} 项${group.items.every((item) => item.status === '未授予') ? '未授予' : '受限'}`
                  : ''}
              </small>
            </button>
          ))}
        </nav>
        <section
          className="erp-dev-permission-capabilities__results"
          aria-label="功能与可用结果"
        >
          {selectedGroup ? (
            <>
              <div className="erp-permission-relationship__section-head">
                <Text strong>
                  {targetLabel} <span aria-hidden="true">→</span>{' '}
                  {selectedGroup.label}
                </Text>
              </div>
              <Table
                key={`${viewMode}/${targetKey}/${selectedGroup.key}/${keyword}/${restrictedOnly}`}
                rowKey="key"
                size="small"
                columns={capabilityColumns}
                dataSource={selectedGroup.items}
                scroll={{ x: 680 }}
                pagination={{
                  ...DEV_PAGINATION,
                  pageSize: 10,
                  hideOnSinglePage: true,
                }}
              />
            </>
          ) : (
            <WorkbenchEmpty
              title={
                requestedModule !== ALL && !keyword && !restrictedOnly
                  ? `${targetLabel}未授予“${requestedModuleLabel}”模块权限`
                  : '没有匹配的功能'
              }
              action={
                <Button
                  onClick={() =>
                    updateSearch({
                      q: '',
                      status: '',
                      module: ALL,
                    })
                  }
                >
                  查看全部能力
                </Button>
              }
            />
          )}
        </section>
      </div>
    </>
  )
  const summaryItems = [
    ['accounts', '关联账号'],
    ['roles', '关联岗位'],
    [
      'effectivePermissions',
      context.projectionOnly ? '岗位合并可用功能' : '最终可用功能',
    ],
    ['blockedPermissions', '岗位已选但受限'],
    ['pages', '可进入页面'],
    ['approvals', '审批责任'],
  ]
  const renderPanel = (content) => {
    if (error) {
      return (
        <Alert
          type="error"
          showIcon
          message="权限结果读取失败"
          description={error}
          action={<Button onClick={load}>重试</Button>}
        />
      )
    }
    if (loading) return <Loading title="正在读取权限结果" description={null} />
    if (!targetKey) return <WorkbenchEmpty title="请选择要查看的岗位或员工" />
    if (context.blocked || context.special || !context.ready) {
      return notice ? null : (
        <Empty description="当前对象没有可核对的岗位结果" />
      )
    }
    return (
      <div className="erp-permission-relationship__active-panel">{content}</div>
    )
  }

  return (
    <div className="erp-dev-permission-relationships-page erp-dev-workspace-page erp-dev-tool-page">
      <DevPageNav />
      <DevPageHeader
        className="erp-dev-permission-relationships-header"
        title={
          <div className="erp-dev-permission-relationships-header__copy">
            <span
              className="erp-dev-permission-relationships-header__icon"
              aria-hidden="true"
            >
              <SafetyCertificateOutlined />
            </span>
            <Title level={1}>权限关系</Title>
          </div>
        }
        tools={
          <Button
            className="erp-dev-workbench-tools"
            icon={<ReloadOutlined aria-hidden="true" />}
            loading={loading}
            onClick={load}
          >
            刷新结果
          </Button>
        }
      />
      <main className="erp-dev-permission-relationships-shell">
        <Text type="secondary">登记开发库 · 只读查询</Text>
        <section className="erp-permission-relationship">
          <div
            className="erp-permission-relationship__toolbar"
            aria-label="选择查看对象"
          >
            <Segmented
              aria-label="选择按岗位或按员工查看"
              value={viewMode}
              options={[
                { label: '按岗位', value: ROLE },
                {
                  label: '按员工',
                  value: PERMISSION_RELATIONSHIP_VIEW_MODE.ACCOUNT,
                },
              ]}
              onChange={(mode) => {
                const options = buildPermissionRelationshipTargetOptions({
                  viewMode: mode,
                  roles: snapshot.roles,
                  accounts: snapshot.accounts,
                })
                changeTarget(mode, options[0]?.value || '')
              }}
            />
            <Select
              showSearch
              aria-label={
                viewMode === ROLE ? '选择要查看的岗位' : '选择要查看的员工'
              }
              value={targetKey || undefined}
              options={targetOptions}
              optionFilterProp="label"
              placeholder={viewMode === ROLE ? '选择岗位' : '选择员工'}
              onChange={(target) => changeTarget(viewMode, target || '')}
            />
            <div className="erp-dev-permission-lookups">
              <Button
                ref={responsibilityRef}
                disabled={!targetKey || !context.roles.length}
                onClick={() => updateSearch({ panel: 'responsibilities' })}
              >
                岗位职责
              </Button>
              <Button
                ref={evidenceRef}
                disabled={!targetKey}
                onClick={() => updateSearch({ panel: 'evidence' })}
              >
                查看依据
              </Button>
            </div>
          </div>
          {notice && !loading ? (
            <Alert type="warning" showIcon message={notice} />
          ) : null}
          <Tabs
            className="erp-permission-relationship__tabs"
            aria-label="权限核对视图"
            activeKey={tabKey}
            onChange={changeTab}
            destroyOnHidden
            items={[
              {
                key: 'graph',
                label: '关系图',
                children: renderPanel(
                  <DevPermissionRelationshipGraph
                    model={graphModel}
                    moduleKey={requestedModule}
                    moduleOptions={moduleOptions}
                    targetLabel={targetLabel}
                    onChangeModule={(module) => updateSearch({ module })}
                  />
                ),
              },
              {
                key: 'menu',
                label: '实际菜单',
                children: renderPanel(
                  navigationModel ? (
                    <DevPermissionNavigationOverview
                      model={navigationModel}
                      loading={loading}
                    />
                  ) : null
                ),
              },
              {
                key: 'details',
                label: '明细核对',
                children: renderPanel(detailsView),
              },
            ]}
          />
        </section>
      </main>
      <Drawer
        title={`${targetLabel || '当前对象'} · ${panel === 'responsibilities' ? '岗位职责' : '权限依据'}`}
        open={Boolean(panel)}
        onClose={closePanel}
        width="min(1080px, 100vw)"
        afterOpenChange={(open) => {
          if (!open) {
            const trigger =
              lastDrawerRef.current === 'responsibilities'
                ? responsibilityRef
                : evidenceRef
            trigger.current?.focus({ preventScroll: true })
          }
        }}
      >
        {error ? (
          <Alert
            type="error"
            showIcon
            message="权限结果读取失败"
            description={error}
          />
        ) : null}
        {evidenceOpen && loading ? (
          <Loading title="正在读取权限依据" description={null} />
        ) : null}
        {evidenceOpen && evidence && !loading && !error ? (
          <div className="erp-dev-permission-evidence">
            {targetKey && context.ready ? (
              <div
                className="erp-permission-relationship__summary"
                aria-label="权限关系汇总"
              >
                <Text type="secondary">全部模块汇总</Text>
                {summaryItems.map(([key, label]) => (
                  <span key={key}>
                    {label}{' '}
                    <strong>{globalModel.summary[key] ?? '待核对'}</strong>
                  </span>
                ))}
              </div>
            ) : null}
            <dl
              className="erp-permission-relationship__evidence"
              aria-label="当前权限证据版本"
            >
              {[
                ['权限结果来源', evidence.sources.join('、') || '尚未读取'],
                [
                  '客户配置版本',
                  evidence.configRevisions.join('、') || '未绑定',
                ],
                ['产品版本', evidence.productVersions.join('、') || '未绑定'],
                [
                  '审批设置版本',
                  evidence.approvalRevision ||
                    (evidence.approvalPartial ? '读取不完整' : '未绑定'),
                ],
                [
                  '最近读取时间',
                  snapshot.read_at
                    ? new Date(snapshot.read_at).toLocaleString('zh-CN')
                    : '尚未读取',
                ],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            {snapshot.approval_settings?.partial ? (
              <Text type="warning">审批责任读取不完整。</Text>
            ) : null}
            <div className="erp-dev-permission-evidence__head">
              <Text strong>权限明细</Text>
              <FilterChip
                selected={
                  searchParams.get('scope') ===
                  PERMISSION_RELATIONSHIP_DETAIL_SCOPE.ALL
                }
                onClick={() =>
                  updateSearch({
                    scope:
                      searchParams.get('scope') ===
                      PERMISSION_RELATIONSHIP_DETAIL_SCOPE.ALL
                        ? ''
                        : PERMISSION_RELATIONSHIP_DETAIL_SCOPE.ALL,
                  })
                }
              >
                包含未授予
              </FilterChip>
            </div>
            <Table
              rowKey="rowKey"
              size="small"
              columns={evidenceColumns}
              scroll={{ x: 760 }}
              dataSource={evidenceRows}
              pagination={{
                ...DEV_PAGINATION,
                pageSize: 12,
                hideOnSinglePage: true,
              }}
            />
            <Text type="secondary">
              本页只读。修改权限请进入权限配置；单据能否操作还需满足业务状态与责任条件。
            </Text>
          </div>
        ) : null}
        {panel === 'responsibilities' && responsibilityModel && !error ? (
          <DevRoleResponsibilityGraph
            model={responsibilityModel}
            selectedKey={searchParams.get('duty') || ''}
            actionKey={searchParams.get('activity') || ''}
            onSelect={(duty) => updateSearch({ duty, activity: '' })}
            onSelectAction={(activity) => updateSearch({ activity })}
            onOpenRole={openRoleSettings}
            onOpenChain={openDutyChain}
            onViewRole={(role) =>
              updateSearch({
                mode: '',
                target: role,
                tab: 'details',
                panel: '',
                module: ALL,
                q: '',
                status: '',
              })
            }
          />
        ) : null}
      </Drawer>
    </div>
  )
}
