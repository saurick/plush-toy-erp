import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ApartmentOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Empty,
  Modal,
  Segmented,
  Select,
  Space,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd'
import { AUTH_SCOPE } from '@/common/auth/auth'
import { Loading } from '@/common/components/loading'
import { MermaidDiagram } from '@/common/components/markdown'
import { ADMIN_BASE_PATH } from '@/common/utils/adminRpc'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { JsonRpc } from '@/common/utils/jsonRpc'
import { getApprovalSettings } from '../api/approvalSettingsApi.mjs'
import {
  PERMISSION_RELATIONSHIP_ALL_MODULES,
  PERMISSION_RELATIONSHIP_VIEW_MODE,
  buildPermissionRelationshipModel,
  buildPermissionRelationshipModuleOptions,
  buildPermissionRelationshipTargetOptions,
  getPermissionRelationshipRoleKeys,
} from '../utils/permissionRelationshipGraph.mjs'
import { getPermissionCenterRoleKey } from '../utils/permissionCenterAccess.mjs'

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

function hasOwn(object, key) {
  return Object.prototype.hasOwnProperty.call(object, key)
}

function roleKeysOfProfile(profile = {}) {
  return (Array.isArray(profile?.roles) ? profile.roles : [])
    .map(getPermissionCenterRoleKey)
    .filter(Boolean)
}

function preferredTargetKey(viewMode, options, profile = {}) {
  if (options.length === 0) return ''
  if (viewMode === PERMISSION_RELATIONSHIP_VIEW_MODE.ACCOUNT) {
    const profileID = String(profile?.id || '').trim()
    if (profileID && options.some((option) => option.value === profileID)) {
      return profileID
    }
    return options[0].value
  }
  const profileRoleKeys = roleKeysOfProfile(profile)
  return (
    profileRoleKeys.find((key) =>
      options.some((option) => option.value === key)
    ) || options[0].value
  )
}

function resultTag(status = '') {
  if (['已生效', '有可用功能', '已配置'].includes(status)) {
    return <Tag color="green">{status}</Tag>
  }
  if (['受限', '全部受限'].includes(status)) {
    return <Tag color="orange">{status}</Tag>
  }
  if (status === '特殊账号') {
    return <Tag color="purple">{status}</Tag>
  }
  return <Tag>{status || '待核对'}</Tag>
}

export default function PermissionRelationshipGraphModal({
  open = false,
  adminProfile = {},
  onClose,
  onManagePermissions,
}) {
  const [viewMode, setViewMode] = useState(
    PERMISSION_RELATIONSHIP_VIEW_MODE.ROLE
  )
  const [targetKey, setTargetKey] = useState('')
  const [moduleKey, setModuleKey] = useState(
    PERMISSION_RELATIONSHIP_ALL_MODULES
  )
  const [baseState, setBaseState] = useState(EMPTY_BASE_STATE)
  const [baseLoading, setBaseLoading] = useState(false)
  const [baseError, setBaseError] = useState('')
  const [accessByRoleKey, setAccessByRoleKey] = useState({})
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

  const loadBaseData = useCallback(async () => {
    const requestID = baseRequestRef.current + 1
    baseRequestRef.current = requestID
    accessRequestRef.current += 1
    setBaseLoading(true)
    setBaseError('')
    setAccessError('')
    setAccessByRoleKey({})
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
    if (!open) {
      baseRequestRef.current += 1
      accessRequestRef.current += 1
      return undefined
    }
    loadBaseData()
    return () => {
      baseRequestRef.current += 1
      accessRequestRef.current += 1
    }
  }, [loadBaseData, open])

  useEffect(() => {
    if (!open || baseLoading) return
    if (
      targetKey &&
      targetOptions.some((option) => option.value === targetKey)
    ) {
      return
    }
    setTargetKey(preferredTargetKey(viewMode, targetOptions, adminProfile))
  }, [adminProfile, baseLoading, open, targetKey, targetOptions, viewMode])

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
    if (!open || baseLoading || baseError) {
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
        setAccessByRoleKey((current) => ({
          ...current,
          ...Object.fromEntries(fulfilled),
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
  }, [accessByRoleKey, baseError, baseLoading, open, requiredRoleKeys])

  const model = useMemo(
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

  const changeViewMode = (nextMode) => {
    const nextOptions = buildPermissionRelationshipTargetOptions({
      viewMode: nextMode,
      roles: baseState.roles,
      accounts: baseState.accounts,
    })
    setViewMode(nextMode)
    setTargetKey(preferredTargetKey(nextMode, nextOptions, adminProfile))
    setModuleKey(PERMISSION_RELATIONSHIP_ALL_MODULES)
    setAccessError('')
  }

  const summaryItems = [
    { key: 'accounts', label: '关联账号', value: model.summary.accounts },
    { key: 'roles', label: '关联岗位', value: model.summary.roles },
    {
      key: 'effective',
      label: '最终可用功能',
      value: model.summary.effectivePermissions,
    },
    {
      key: 'blocked',
      label: '当前受限功能',
      value: model.summary.blockedPermissions,
    },
    { key: 'pages', label: '可进入页面', value: model.summary.pages },
    { key: 'approvals', label: '审批责任', value: model.summary.approvals },
  ]

  const columns = [
    { title: '来源', dataIndex: 'source', width: 180 },
    { title: '关系', dataIndex: 'relation', width: 150 },
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
    <Modal
      open={open}
      className="erp-permission-relationship-modal"
      width="min(1600px, calc(100vw - 48px))"
      title={
        <div className="erp-permission-relationship-modal__title">
          <SafetyCertificateOutlined />
          <span>权限关系图</span>
          <Tag color="blue">只读</Tag>
        </div>
      }
      onCancel={onClose}
      destroyOnHidden
      footer={[
        <Button key="manage" onClick={onManagePermissions}>
          打开权限配置
        </Button>,
        <Button key="close" type="primary" onClick={onClose}>
          关闭
        </Button>,
      ]}
    >
      <div className="erp-permission-relationship">
        <div className="erp-permission-relationship__intro">
          <div>
            <Title level={4}>从账号到最终可用范围，一张图看清</Title>
            <Paragraph>
              汇总账号、岗位、功能、页面、仓库数据范围和审批责任。这里不包含任务、单据或业务运行状态。
            </Paragraph>
          </div>
          <Button
            icon={<ReloadOutlined />}
            loading={baseLoading}
            onClick={loadBaseData}
          >
            刷新结果
          </Button>
        </div>

        {baseError ? (
          <Alert
            type="error"
            showIcon
            message="权限关系图加载失败"
            description={baseError}
            action={
              <Button size="small" onClick={loadBaseData}>
                重试
              </Button>
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
                    setTargetKey(value)
                    setModuleKey(PERMISSION_RELATIONSHIP_ALL_MODULES)
                    setAccessError('')
                  }}
                />
              </div>
              <div className="erp-permission-relationship__control">
                <Text strong>功能范围</Text>
                <Select
                  aria-label="选择功能模块"
                  value={moduleKey}
                  options={moduleOptions}
                  onChange={setModuleKey}
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

            {model.warnings.map((warning) => (
              <Alert key={warning} type="warning" showIcon message={warning} />
            ))}

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

            <div className="erp-permission-relationship__legend">
              <Text type="secondary">图例</Text>
              <Space wrap size={[6, 6]}>
                <Tag color="blue">账号</Tag>
                <Tag color="purple">岗位</Tag>
                <Tag color="green">最终可用</Tag>
                <Tag color="orange">当前受限</Tag>
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
                  <Title id="permission-relationship-graph-title" level={5}>
                    有向关系图
                  </Title>
                  <Text type="secondary">
                    箭头表示“分配、约束、获得、影响或承担”；可用右上角工具放大和全屏查看。
                  </Text>
                </div>
                {accessLoading ? <Tag color="processing">正在核对</Tag> : null}
              </div>
              {targetOptions.length === 0 ? (
                <Empty
                  image={<ApartmentOutlined />}
                  description="当前没有可查看的岗位或账号"
                />
              ) : (
                <MermaidDiagram
                  chart={model.chart}
                  label="权限生效关系图"
                  showSourceOnError={false}
                />
              )}
            </section>

            <section
              className="erp-permission-relationship__details"
              aria-labelledby="permission-relationship-detail-title"
            >
              <div className="erp-permission-relationship__section-head">
                <div>
                  <Title id="permission-relationship-detail-title" level={5}>
                    关系明细
                  </Title>
                  <Text type="secondary">
                    用表格逐条核对图中关系；这里只显示业务名称和使用状态。
                  </Text>
                </div>
                <Text type="secondary">共 {model.rows.length} 条</Text>
              </div>
              <Table
                rowKey="rowKey"
                size="small"
                columns={columns}
                dataSource={model.rows}
                loading={accessLoading}
                scroll={{ x: 920 }}
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

            <Alert
              type="info"
              showIcon
              message="关系图是只读结果，不是新的权限配置入口"
              description="岗位功能、员工岗位、数据范围和审批责任仍在“系统管理 → 权限配置”维护；保存后刷新本图即可核对。"
            />
          </>
        ) : null}
      </div>
    </Modal>
  )
}
