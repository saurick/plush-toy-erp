import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  ApartmentOutlined,
  LoginOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Empty,
  Segmented,
  Select,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography,
} from 'antd'
import { AUTH_SCOPE } from '@/common/auth/auth'
import { Loading } from '@/common/components/loading'
import { MermaidDiagram } from '@/common/components/markdown'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { JsonRpc } from '@/common/utils/jsonRpc'
import { getApprovalSettings } from '../../erp/api/approvalSettingsApi.mjs'
import DevPageNav from '../components/DevPageNav.jsx'
import DevPermissionNavigationOverview from '../components/DevPermissionNavigationOverview.jsx'
import { buildPermissionRelationshipNavigationModel } from '../config/devPermissionNavigation.mjs'
import {
  PERMISSION_RELATIONSHIP_ALL_MODULES,
  PERMISSION_RELATIONSHIP_DETAIL_SCOPE,
  PERMISSION_RELATIONSHIP_VIEW_MODE,
  buildPermissionRelationshipDetailRows,
  buildPermissionRelationshipEvidence,
  buildPermissionRelationshipModel,
  buildPermissionRelationshipModuleOptions,
  buildPermissionRelationshipTargetOptions,
  getPermissionRelationshipRoleKeys,
} from '../config/devPermissionRelationshipGraph.mjs'
import '../styles/dev-permission-relationships.css'

const { Paragraph, Text, Title } = Typography

const adminRpc = new JsonRpc({
  url: 'admin',
  basePath: ADMIN_BASE_PATH,
  authScope: AUTH_SCOPE.ADMIN,
})

const EMPTY_BASE_STATE = Object.freeze({
  accounts: [],
  roles: [],
  permissions: [],
  warehouseOptions: [],
  approvalSettings: null,
})

const PERMISSION_RELATIONSHIP_TAB = Object.freeze({
  MENU: 'menu',
  GRAPH: 'graph',
  DETAILS: 'details',
})

const RELATIONSHIP_KIND_LABELS = Object.freeze({
  account: '账号',
  source: '结果来源',
  scope: '数据范围',
  approval: '审批责任',
  permission: '功能',
  page: '页面',
})

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key)
}

function preferredTargetKey(options) {
  if (options.length === 0) return ''
  return options[0].value
}

function normalizedQueryValue(value) {
  return String(value || '').trim()
}

function evidenceValue(values = [], fallback = '未绑定') {
  return values.length > 0 ? values.join('、') : fallback
}

function formatReadTime(value = '') {
  if (!value) return '尚未读取'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '尚未读取'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date)
}

function resultTag(status = '') {
  if (['已生效', '有可用功能', '已配置'].includes(status)) {
    return <Tag color="green">{status}</Tag>
  }
  if (['受限', '全部受限'].includes(status)) {
    return <Tag color="orange">{status}</Tag>
  }
  if (status === '未授予') {
    return <Tag>{status}</Tag>
  }
  if (status === '特殊账号') {
    return <Tag color="purple">{status}</Tag>
  }
  return <Tag>{status || '待核对'}</Tag>
}

export default function DevPermissionRelationshipsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedViewMode = normalizedQueryValue(searchParams.get('mode'))
  const viewMode =
    requestedViewMode === PERMISSION_RELATIONSHIP_VIEW_MODE.ACCOUNT
      ? PERMISSION_RELATIONSHIP_VIEW_MODE.ACCOUNT
      : PERMISSION_RELATIONSHIP_VIEW_MODE.ROLE
  const requestedTargetKey = normalizedQueryValue(searchParams.get('target'))
  const requestedModuleKey =
    normalizedQueryValue(searchParams.get('module')) ||
    PERMISSION_RELATIONSHIP_ALL_MODULES
  const requestedTabKey = normalizedQueryValue(searchParams.get('tab'))
  const tabKey = Object.values(PERMISSION_RELATIONSHIP_TAB).includes(
    requestedTabKey
  )
    ? requestedTabKey
    : PERMISSION_RELATIONSHIP_TAB.MENU
  const requestedDetailScope = normalizedQueryValue(searchParams.get('scope'))
  const detailScope = Object.values(
    PERMISSION_RELATIONSHIP_DETAIL_SCOPE
  ).includes(requestedDetailScope)
    ? requestedDetailScope
    : PERMISSION_RELATIONSHIP_DETAIL_SCOPE.RELATED
  const [baseState, setBaseState] = useState(EMPTY_BASE_STATE)
  const [baseLoading, setBaseLoading] = useState(false)
  const [baseError, setBaseError] = useState('')
  const [baseReadAt, setBaseReadAt] = useState('')
  const [accessByRoleKey, setAccessByRoleKey] = useState({})
  const [accessReadAtByRoleKey, setAccessReadAtByRoleKey] = useState({})
  const [accessLoading, setAccessLoading] = useState(false)
  const [accessError, setAccessError] = useState('')
  const baseRequestRef = useRef(0)
  const accessRequestRef = useRef(0)

  const targetOptions = useMemo(
    () =>
      buildPermissionRelationshipTargetOptions({
        viewMode,
        roles: baseState.roles,
        accounts: baseState.accounts,
      }),
    [baseState.accounts, baseState.roles, viewMode]
  )
  const moduleOptions = useMemo(
    () => buildPermissionRelationshipModuleOptions(baseState.permissions),
    [baseState.permissions]
  )
  const targetKey = targetOptions.some(
    (option) => option.value === requestedTargetKey
  )
    ? requestedTargetKey
    : preferredTargetKey(targetOptions)
  const moduleKey = moduleOptions.some(
    (option) => option.value === requestedModuleKey
  )
    ? requestedModuleKey
    : PERMISSION_RELATIONSHIP_ALL_MODULES
  const updateSearch = useCallback(
    (patch, { replace = false } = {}) => {
      const next = new URLSearchParams(searchParams)
      Object.entries(patch).forEach(([key, value]) => {
        const normalized = normalizedQueryValue(value)
        if (normalized) next.set(key, normalized)
        else next.delete(key)
      })
      setSearchParams(next, { replace })
    },
    [searchParams, setSearchParams]
  )

  const loadBaseData = useCallback(async () => {
    const requestID = baseRequestRef.current + 1
    baseRequestRef.current = requestID
    accessRequestRef.current += 1
    setBaseLoading(true)
    setBaseError('')
    setBaseReadAt('')
    setAccessError('')
    setAccessByRoleKey({})
    setAccessReadAtByRoleKey({})
    try {
      const approvalPromise = getApprovalSettings({})
        .then((value) => ({ value, error: '' }))
        .catch((error) => ({
          value: { items: [], partial: true },
          error: getActionErrorMessage(error, '加载审批责任'),
        }))
      const [listResult, optionsResult, approvalResult] = await Promise.all([
        adminRpc.call('list', {}),
        adminRpc.call('rbac_options', {}),
        approvalPromise,
      ])
      if (baseRequestRef.current !== requestID) {
        return
      }
      const nextState = {
        accounts: Array.isArray(listResult?.data?.admins)
          ? listResult.data.admins
          : [],
        roles: Array.isArray(optionsResult?.data?.roles)
          ? optionsResult.data.roles
          : [],
        permissions: Array.isArray(optionsResult?.data?.permissions)
          ? optionsResult.data.permissions
          : [],
        warehouseOptions: Array.isArray(
          optionsResult?.data?.warehouse_scope_options
        )
          ? optionsResult.data.warehouse_scope_options
          : [],
        approvalSettings: approvalResult.value,
      }
      setBaseState(nextState)
      setBaseReadAt(new Date().toISOString())
      if (approvalResult.error) {
        setAccessError('审批责任暂未汇入；账号、岗位、功能和数据范围仍可查看。')
      }
    } catch (error) {
      if (baseRequestRef.current === requestID) {
        setBaseState(EMPTY_BASE_STATE)
        setBaseError(getActionErrorMessage(error, '加载权限关系图'))
      }
    } finally {
      if (baseRequestRef.current === requestID) {
        setBaseLoading(false)
      }
    }
  }, [])

  useEffect(() => {
    loadBaseData()
    return () => {
      baseRequestRef.current += 1
      accessRequestRef.current += 1
    }
  }, [loadBaseData])

  useEffect(() => {
    if (
      baseLoading ||
      baseError ||
      (baseState.roles.length === 0 && baseState.accounts.length === 0)
    ) {
      return
    }
    const next = new URLSearchParams(searchParams)
    next.delete('view')
    next.delete('focus')
    if (viewMode === PERMISSION_RELATIONSHIP_VIEW_MODE.ROLE) {
      next.delete('mode')
    } else {
      next.set('mode', viewMode)
    }
    if (targetKey) next.set('target', targetKey)
    else next.delete('target')
    if (
      tabKey === PERMISSION_RELATIONSHIP_TAB.MENU ||
      moduleKey === PERMISSION_RELATIONSHIP_ALL_MODULES
    ) {
      next.delete('module')
    } else {
      next.set('module', moduleKey)
    }
    if (tabKey === PERMISSION_RELATIONSHIP_TAB.MENU) {
      next.delete('tab')
    } else {
      next.set('tab', tabKey)
    }
    if (
      tabKey === PERMISSION_RELATIONSHIP_TAB.DETAILS &&
      detailScope === PERMISSION_RELATIONSHIP_DETAIL_SCOPE.ALL
    ) {
      next.set('scope', detailScope)
    } else {
      next.delete('scope')
    }
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true })
    }
  }, [
    baseError,
    baseLoading,
    baseState.accounts.length,
    baseState.roles.length,
    detailScope,
    moduleKey,
    searchParams,
    setSearchParams,
    tabKey,
    targetKey,
    viewMode,
  ])

  const requiredRoleKeys = useMemo(
    () =>
      getPermissionRelationshipRoleKeys({
        viewMode,
        targetKey,
        accounts: baseState.accounts,
      }),
    [baseState.accounts, targetKey, viewMode]
  )
  useEffect(() => {
    if (baseLoading || baseError) {
      setAccessLoading(false)
      return undefined
    }
    const missingRoleKeys = requiredRoleKeys.filter(
      (roleKey) => !hasOwn(accessByRoleKey, roleKey)
    )
    if (missingRoleKeys.length === 0) {
      setAccessLoading(false)
      return undefined
    }

    const requestID = accessRequestRef.current + 1
    accessRequestRef.current = requestID
    setAccessLoading(true)
    setAccessError('')
    Promise.allSettled(
      missingRoleKeys.map(async (roleKey) => {
        const result = await adminRpc.call('effective_role_access', {
          role_key: roleKey,
        })
        return [roleKey, result?.data?.effective_access || null]
      })
    ).then((results) => {
      if (accessRequestRef.current !== requestID) return
      const fulfilled = results
        .filter((result) => result.status === 'fulfilled')
        .map((result) => result.value)
      if (fulfilled.length > 0) {
        const readAt = new Date().toISOString()
        setAccessByRoleKey((current) => ({
          ...current,
          ...Object.fromEntries(fulfilled),
        }))
        setAccessReadAtByRoleKey((current) => ({
          ...current,
          ...Object.fromEntries(
            fulfilled.map(([roleKey]) => [roleKey, readAt])
          ),
        }))
      }
      const failed = results.find((result) => result.status === 'rejected')
      if (failed) {
        setAccessError(getActionErrorMessage(failed.reason, '加载岗位最终权限'))
      }
      setAccessLoading(false)
    })

    return () => {
      if (accessRequestRef.current === requestID) {
        accessRequestRef.current += 1
      }
    }
  }, [accessByRoleKey, baseError, baseLoading, requiredRoleKeys])

  const globalModel = useMemo(
    () =>
      buildPermissionRelationshipModel({
        viewMode,
        targetKey,
        moduleKey: PERMISSION_RELATIONSHIP_ALL_MODULES,
        accounts: baseState.accounts,
        roles: baseState.roles,
        permissions: baseState.permissions,
        warehouseOptions: baseState.warehouseOptions,
        accessByRoleKey,
        approvalSettings: baseState.approvalSettings,
      }),
    [accessByRoleKey, baseState, targetKey, viewMode]
  )
  const graphModel = useMemo(
    () =>
      buildPermissionRelationshipModel({
        viewMode,
        targetKey,
        moduleKey,
        accounts: baseState.accounts,
        roles: baseState.roles,
        permissions: baseState.permissions,
        warehouseOptions: baseState.warehouseOptions,
        accessByRoleKey,
        approvalSettings: baseState.approvalSettings,
      }),
    [accessByRoleKey, baseState, moduleKey, targetKey, viewMode]
  )
  const permissionDetailRows = useMemo(
    () =>
      buildPermissionRelationshipDetailRows({
        viewMode,
        targetKey,
        moduleKey,
        detailScope,
        accounts: baseState.accounts,
        roles: baseState.roles,
        permissions: baseState.permissions,
        accessByRoleKey,
      }),
    [
      accessByRoleKey,
      baseState.accounts,
      baseState.permissions,
      baseState.roles,
      detailScope,
      moduleKey,
      targetKey,
      viewMode,
    ]
  )
  const navigationModel = useMemo(
    () =>
      buildPermissionRelationshipNavigationModel({
        viewMode,
        targetKey,
        accounts: baseState.accounts,
        roles: baseState.roles,
        accessByRoleKey,
      }),
    [accessByRoleKey, baseState.accounts, baseState.roles, targetKey, viewMode]
  )
  const relationshipEvidence = useMemo(
    () =>
      buildPermissionRelationshipEvidence({
        roleKeys: requiredRoleKeys,
        accessByRoleKey,
        approvalSettings: baseState.approvalSettings,
      }),
    [accessByRoleKey, baseState.approvalSettings, requiredRoleKeys]
  )
  const currentReadAt = useMemo(() => {
    const roleReadTimes = requiredRoleKeys
      .map((roleKey) => accessReadAtByRoleKey[roleKey])
      .filter(Boolean)
      .sort()
    return roleReadTimes.at(-1) || baseReadAt
  }, [accessReadAtByRoleKey, baseReadAt, requiredRoleKeys])
  const detailRows = useMemo(
    () => [...globalModel.contextRows, ...permissionDetailRows],
    [globalModel.contextRows, permissionDetailRows]
  )
  const ungrantedDetailCount = detailRows.filter(
    (row) => row.status === '未授予'
  ).length

  const changeViewMode = (nextMode) => {
    const nextOptions = buildPermissionRelationshipTargetOptions({
      viewMode: nextMode,
      roles: baseState.roles,
      accounts: baseState.accounts,
    })
    updateSearch({
      mode: nextMode === PERMISSION_RELATIONSHIP_VIEW_MODE.ROLE ? '' : nextMode,
      target: preferredTargetKey(nextOptions),
      module: '',
      scope: '',
    })
    setAccessError('')
  }

  const changeTab = (nextTab) => {
    updateSearch({
      tab: nextTab === PERMISSION_RELATIONSHIP_TAB.MENU ? '' : nextTab,
      module: nextTab === PERMISSION_RELATIONSHIP_TAB.MENU ? '' : moduleKey,
      scope:
        nextTab === PERMISSION_RELATIONSHIP_TAB.DETAILS &&
        detailScope === PERMISSION_RELATIONSHIP_DETAIL_SCOPE.ALL
          ? detailScope
          : '',
    })
  }

  const summaryItems = [
    {
      key: 'accounts',
      label: '关联账号',
      value: globalModel.summary.accounts,
    },
    { key: 'roles', label: '关联岗位', value: globalModel.summary.roles },
    {
      key: 'effective',
      label: '最终可用功能',
      value: globalModel.summary.effectivePermissions,
    },
    {
      key: 'blocked',
      label: '岗位已选但受限',
      value: globalModel.summary.blockedPermissions,
    },
    { key: 'pages', label: '可进入页面', value: globalModel.summary.pages },
    {
      key: 'approvals',
      label: '审批责任',
      value: globalModel.summary.approvals,
    },
  ]

  const columns = [
    { title: '来源', dataIndex: 'source', width: 180 },
    {
      title: '类型',
      dataIndex: 'kind',
      width: 100,
      render: (value) => RELATIONSHIP_KIND_LABELS[value] || '其他',
    },
    { title: '关系', dataIndex: 'relation', width: 140 },
    { title: '结果对象', dataIndex: 'target', width: 220 },
    {
      title: '生效说明',
      dataIndex: 'result',
      render: (value) => <Text>{value}</Text>,
    },
    {
      title: '状态',
      dataIndex: 'status',
      width: 120,
      render: resultTag,
    },
  ]

  return (
    <div className="erp-dev-permission-relationships-page erp-dev-workspace-page">
      <DevPageNav sourcePath="docs/product/配置与权限策略.md" />
      <header className="erp-dev-permission-relationships-header">
        <div className="erp-dev-permission-relationships-header__copy">
          <span
            className="erp-dev-permission-relationships-header__icon"
            aria-hidden="true"
          >
            <SafetyCertificateOutlined />
          </span>
          <div>
            <Text className="erp-dev-permission-relationships-eyebrow">
              权限核对 · 当前运行投影 · 只读
            </Text>
            <Title level={1}>权限关系 / Effective Access</Title>
            <Paragraph>
              按岗位或账号查看最终可用功能、页面、实际菜单、仓库数据范围和审批责任，定位“为什么能用、从哪里进入、为什么受限”。
            </Paragraph>
          </div>
        </div>
        <Space
          wrap
          className="erp-dev-permission-relationships-header__actions"
        >
          <Button
            icon={<ReloadOutlined />}
            loading={baseLoading}
            onClick={loadBaseData}
          >
            刷新结果
          </Button>
          <Button
            type="primary"
            icon={<SettingOutlined />}
            href="/erp/system/permissions"
            target="_blank"
            rel="noreferrer"
          >
            打开正式权限配置
          </Button>
        </Space>
      </header>

      <main className="erp-dev-permission-relationships-shell">
        <section className="erp-permission-relationship">
          <div className="erp-permission-relationship__intro">
            <div>
              <Title level={2}>从账号到最终可用范围，一页看清</Title>
              <Paragraph>
                菜单、图和明细使用同一份最终页面结果；停用账号、停用岗位、超级管理员和部分读取失败会明确标识。
              </Paragraph>
            </div>
            <Tag color="blue">只读结果</Tag>
          </div>

          <div
            className="erp-permission-relationship__boundary-note"
            role="note"
          >
            <Text type="secondary">
              关系图是只读结果，不是新的权限配置入口；本页核对“岗位权限 ×
              当前启用配置”的只读结果；不代表某张单据在当前状态一定可操作，也不在这里保存权限配置。
            </Text>
          </div>

          {baseError ? (
            <Alert
              type="error"
              showIcon
              message="权限关系加载失败"
              description={baseError}
              action={
                <Space wrap>
                  <Button size="small" onClick={loadBaseData}>
                    重试
                  </Button>
                  <Button
                    size="small"
                    icon={<LoginOutlined />}
                    href="/admin-login"
                  >
                    打开后台登录
                  </Button>
                </Space>
              }
            />
          ) : null}

          {baseLoading ? (
            <Loading
              title="正在汇聚权限关系"
              description="正在读取账号、岗位和最终生效结果，请稍候..."
            />
          ) : null}

          {!baseLoading && !baseError ? (
            <>
              <div
                className="erp-permission-relationship__toolbar"
                aria-label="权限关系图筛选"
              >
                <div className="erp-permission-relationship__control">
                  <Text strong>查看方式</Text>
                  <Segmented
                    aria-label="选择按岗位或按员工查看"
                    value={viewMode}
                    onChange={changeViewMode}
                    options={[
                      {
                        label: '按岗位',
                        value: PERMISSION_RELATIONSHIP_VIEW_MODE.ROLE,
                      },
                      {
                        label: '按员工',
                        value: PERMISSION_RELATIONSHIP_VIEW_MODE.ACCOUNT,
                      },
                    ]}
                  />
                </div>
                <div className="erp-permission-relationship__control">
                  <Text strong>
                    {viewMode === PERMISSION_RELATIONSHIP_VIEW_MODE.ROLE
                      ? '选择岗位'
                      : '选择员工'}
                  </Text>
                  <Select
                    showSearch
                    aria-label={
                      viewMode === PERMISSION_RELATIONSHIP_VIEW_MODE.ROLE
                        ? '选择要查看的岗位'
                        : '选择要查看的员工'
                    }
                    value={targetKey || undefined}
                    options={targetOptions}
                    optionFilterProp="label"
                    placeholder={
                      viewMode === PERMISSION_RELATIONSHIP_VIEW_MODE.ROLE
                        ? '请选择岗位'
                        : '请选择员工'
                    }
                    onChange={(value) => {
                      updateSearch({ target: value, module: '', scope: '' })
                      setAccessError('')
                    }}
                  />
                </div>
              </div>

              {accessError ? (
                <Alert
                  type="warning"
                  showIcon
                  message={accessError}
                  action={
                    <Button size="small" onClick={loadBaseData}>
                      重新读取
                    </Button>
                  }
                />
              ) : null}

              {globalModel.warnings.map((warning) => (
                <Alert
                  key={warning}
                  type="warning"
                  showIcon
                  message={warning}
                />
              ))}

              <div className="erp-permission-relationship__summary-head">
                <Text strong>当前对象全局结果</Text>
                <Text type="secondary">
                  始终按全部功能统计，不随关系图或明细中的模块筛选变化。
                </Text>
              </div>
              <div
                className="erp-permission-relationship__summary"
                aria-label="权限关系汇总"
              >
                {summaryItems.map((item) => (
                  <Statistic
                    key={item.key}
                    title={item.label}
                    value={item.value}
                  />
                ))}
              </div>

              <section
                className="erp-permission-relationship__evidence"
                aria-label="当前权限证据版本"
              >
                <div>
                  <Text type="secondary">结果性质</Text>
                  <Text strong>
                    {relationshipEvidence.allFinal
                      ? '最终生效结果'
                      : '预览或读取不完整'}
                  </Text>
                </div>
                <div>
                  <Text type="secondary">权限结果来源</Text>
                  <Text strong>
                    {evidenceValue(
                      relationshipEvidence.sources,
                      '最终结果尚未读取'
                    )}
                  </Text>
                </div>
                <div>
                  <Text type="secondary">客户配置版本</Text>
                  <Text strong>
                    {evidenceValue(relationshipEvidence.configRevisions)}
                  </Text>
                </div>
                <div>
                  <Text type="secondary">产品版本</Text>
                  <Text strong>
                    {evidenceValue([
                      ...new Set(
                        [
                          ...relationshipEvidence.productVersions,
                          relationshipEvidence.approvalProductVersion,
                        ].filter(Boolean)
                      ),
                    ])}
                  </Text>
                </div>
                <div>
                  <Text type="secondary">岗位版本</Text>
                  <Text strong>
                    {evidenceValue(relationshipEvidence.roleVersions)}
                  </Text>
                </div>
                <div>
                  <Text type="secondary">审批设置版本</Text>
                  <Text strong>
                    {relationshipEvidence.approvalRevision ||
                      (relationshipEvidence.approvalPartial
                        ? '读取不完整'
                        : '未绑定')}
                  </Text>
                </div>
                <div>
                  <Text type="secondary">最近读取时间</Text>
                  <Text strong>{formatReadTime(currentReadAt)}</Text>
                </div>
              </section>

              <Tabs
                className="erp-permission-relationship__tabs"
                aria-label="权限核对视图"
                activeKey={tabKey}
                onChange={changeTab}
                destroyOnHidden
                items={[
                  {
                    key: PERMISSION_RELATIONSHIP_TAB.MENU,
                    label: '实际菜单',
                    children: (
                      <DevPermissionNavigationOverview
                        model={navigationModel}
                        loading={accessLoading}
                      />
                    ),
                  },
                  {
                    key: PERMISSION_RELATIONSHIP_TAB.GRAPH,
                    label: '关系图',
                    children: (
                      <div className="erp-permission-relationship__tab-panel">
                        <div className="erp-permission-relationship__tab-toolbar">
                          <div className="erp-permission-relationship__control">
                            <Text strong>图中功能范围</Text>
                            <Select
                              aria-label="选择关系图功能模块"
                              value={moduleKey}
                              options={moduleOptions}
                              onChange={(value) =>
                                updateSearch({
                                  module:
                                    value ===
                                    PERMISSION_RELATIONSHIP_ALL_MODULES
                                      ? ''
                                      : value,
                                })
                              }
                            />
                          </div>
                          <Text type="secondary">
                            只缩小关系图，顶部统计和实际菜单保持全局口径。
                          </Text>
                        </div>
                        <div className="erp-permission-relationship__legend">
                          <Text type="secondary">图例</Text>
                          <Space wrap size={[6, 6]}>
                            <Tag color="blue">账号</Tag>
                            <Tag color="purple">岗位</Tag>
                            <Tag color="green">最终可用</Tag>
                            <Tag color="orange">岗位已选但受限</Tag>
                            <Tag color="cyan">数据范围</Tag>
                            <Tag color="gold">审批责任</Tag>
                          </Space>
                        </div>
                        <section
                          className="erp-permission-relationship__graph"
                          aria-labelledby="permission-relationship-graph-title"
                          aria-busy={accessLoading}
                        >
                          <div className="erp-permission-relationship__section-head">
                            <div>
                              <Title
                                id="permission-relationship-graph-title"
                                level={5}
                              >
                                有向关系图
                              </Title>
                              <Text type="secondary">
                                箭头表示“分配、约束、获得、影响或承担”；可用右上角工具放大和全屏查看。
                              </Text>
                            </div>
                            {accessLoading ? (
                              <Tag color="processing">正在核对</Tag>
                            ) : null}
                          </div>
                          {targetOptions.length === 0 ? (
                            <Empty
                              image={<ApartmentOutlined />}
                              description="当前没有可查看的岗位或账号"
                            />
                          ) : (
                            <MermaidDiagram
                              chart={graphModel.chart}
                              label="权限生效关系图"
                              showSourceOnError={false}
                            />
                          )}
                        </section>
                      </div>
                    ),
                  },
                  {
                    key: PERMISSION_RELATIONSHIP_TAB.DETAILS,
                    label: '明细核对',
                    children: (
                      <section
                        className="erp-permission-relationship__details"
                        aria-labelledby="permission-relationship-detail-title"
                      >
                        <div className="erp-permission-relationship__detail-toolbar">
                          <div className="erp-permission-relationship__control">
                            <Text strong>明细功能范围</Text>
                            <Select
                              aria-label="选择明细功能模块"
                              value={moduleKey}
                              options={moduleOptions}
                              onChange={(value) =>
                                updateSearch({
                                  module:
                                    value ===
                                    PERMISSION_RELATIONSHIP_ALL_MODULES
                                      ? ''
                                      : value,
                                })
                              }
                            />
                          </div>
                          <div className="erp-permission-relationship__control">
                            <Text strong>核对范围</Text>
                            <Segmented
                              aria-label="选择权限明细范围"
                              value={detailScope}
                              onChange={(value) =>
                                updateSearch({
                                  scope:
                                    value ===
                                    PERMISSION_RELATIONSHIP_DETAIL_SCOPE.ALL
                                      ? value
                                      : '',
                                })
                              }
                              options={[
                                {
                                  label: '仅岗位相关',
                                  value:
                                    PERMISSION_RELATIONSHIP_DETAIL_SCOPE.RELATED,
                                },
                                {
                                  label: '包含未授予',
                                  value:
                                    PERMISSION_RELATIONSHIP_DETAIL_SCOPE.ALL,
                                },
                              ]}
                            />
                          </div>
                        </div>
                        <div className="erp-permission-relationship__section-head">
                          <div>
                            <Title
                              id="permission-relationship-detail-title"
                              level={5}
                            >
                              关系明细
                            </Title>
                            <Text type="secondary">
                              “包含未授予”会把产品权限全集中该岗位没有选择的功能一并列出。
                            </Text>
                          </div>
                          <Text type="secondary">
                            共 {detailRows.length} 条
                            {ungrantedDetailCount > 0
                              ? `，未授予 ${ungrantedDetailCount} 条`
                              : ''}
                          </Text>
                        </div>
                        <Table
                          rowKey="rowKey"
                          size="small"
                          columns={columns}
                          dataSource={detailRows}
                          loading={accessLoading}
                          scroll={{ x: 1020 }}
                          pagination={{
                            pageSize: 12,
                            hideOnSinglePage: true,
                            showSizeChanger: false,
                          }}
                          locale={{
                            emptyText: (
                              <Empty description="当前选择没有可展示的权限关系" />
                            ),
                          }}
                        />
                      </section>
                    ),
                  },
                ]}
              />
            </>
          ) : null}
        </section>
      </main>
    </div>
  )
}
