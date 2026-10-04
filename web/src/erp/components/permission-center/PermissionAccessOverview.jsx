import {
  Typography,
  Alert,
  Button,
  Empty,
  Popover,
  Select,
  Space,
  Tag,
} from 'antd'
import React, { useState } from 'react'
import { PermissionCode } from '../../../common/consts/permissions.generated.mjs'
import Table from '@/common/components/table/AppTable'
import Segmented from '@/common/components/navigation/SlidingSegmented'
import { normalizeStringList } from '../../utils/permissionCenterAccess.mjs'
import {
  getPermissionPageAccessReason,
  getPermissionPageEntry,
  groupPermissionPages,
} from '../../utils/permissionNavigation.mjs'

import {
  getAuthenticatedNavigationSections,
  getNavigationSections,
} from '../../config/seedData.mjs'
import {
  buildRoleGuidedNavigationPreview,
  ROLE_NAVIGATION_MODES,
} from '../../config/roleGuidedNavigation.mjs'

const ROLE_PAGE_ACCESS_FILTERS = {
  ALL: 'all',
  EFFECTIVE: 'effective',
  BLOCKED: 'blocked',
}

function PermissionImpactMap({ permissions = [], permissionKeys = [] }) {
  const selected = normalizeStringList(permissionKeys)
    .map((key) => permissions.find((item) => item.key === key))
    .filter(Boolean)
  const rows = selected.map((permission, index) => ({
    ...permission,
    rowID: `permission-impact-${index + 1}`,
    pages: Array.isArray(permission.usage?.pages) ? permission.usage.pages : [],
  }))

  const uniqueLabels = (values = []) => [
    ...new Set(values.map((item) => String(item || '').trim()).filter(Boolean)),
  ]

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Paragraph type="secondary" className="erp-business-inline-note">
        页面可进入，不等于页面内所有操作都可用；查看、创建、修改、审核、过账和取消分别控制。
      </Paragraph>
      <Table
        rowKey="rowID"
        size="small"
        pagination={false}
        dataSource={rows}
        locale={{ emptyText: <Empty description="当前岗位尚未选择功能" /> }}
        columns={[
          { align: 'left', title: '功能', dataIndex: 'label', width: 220 },
          {
            align: 'left',
            title: '适用页面',
            dataIndex: 'pages',
            render: (items, record) => {
              const pageLabels = uniqueLabels(
                items.map(
                  (item) =>
                    getPermissionPageEntry({
                      key: item.key,
                      label: item.pageLabel,
                    }).label
                )
              )
              if (pageLabels.length === 0) {
                return record.usage?.backendOnly ? (
                  <Text type="secondary">不对应单独页面</Text>
                ) : (
                  <Text type="secondary">尚未登记明确页面</Text>
                )
              }
              return (
                <Space wrap size={[4, 4]}>
                  {pageLabels.map((label) => (
                    <Tag key={label}>{label}</Tag>
                  ))}
                </Space>
              )
            },
          },
          {
            align: 'left',
            title: '页面区域',
            width: 180,
            render: (_, record) => {
              const sectionLabels = uniqueLabels(
                record.pages.map((item) => item.sectionLabel)
              )
              return sectionLabels.length > 0
                ? sectionLabels.join('、')
                : '页面通用区域'
            },
          },
          {
            align: 'left',
            title: '可用操作',
            width: 190,
            render: (_, record) => {
              const actionLabels = uniqueLabels(
                record.pages.map((item) => item.actionLabel)
              )
              return (
                actionLabels.join('、') ||
                record.usage?.defaultActionLabel ||
                '进入页面后可使用'
              )
            },
          },
          {
            title: '使用限制',
            render: (_, record) => (
              <Text type="secondary">
                {record.usage?.restrictions?.length > 0
                  ? record.usage.restrictions.join('；')
                  : '以公司当前设置、业务状态和任务负责人为准'}
              </Text>
            ),
          },
        ]}
      />
    </Space>
  )
}

function EffectiveRoleAccessOverview({ access = null, loading = false }) {
  const [pageFilter, setPageFilter] = useState(ROLE_PAGE_ACCESS_FILTERS.ALL)
  const [moduleFilter, setModuleFilter] = useState('all')
  const pages = Array.isArray(access?.pages) ? access.pages : []
  const groups = groupPermissionPages(pages)
  const selectedModule = groups.some((group) => group.key === moduleFilter)
    ? moduleFilter
    : 'all'
  const selectedGroups = groups.filter(
    (group) => selectedModule === 'all' || group.key === selectedModule
  )
  const selectedPages = selectedGroups.flatMap((group) => group.items)
  const effectiveCount = selectedPages.filter(
    (page) => page.effective === true
  ).length
  const blockedCount = selectedPages.length - effectiveCount
  const matchesFilter = (page) =>
    pageFilter === ROLE_PAGE_ACCESS_FILTERS.ALL ||
    (pageFilter === ROLE_PAGE_ACCESS_FILTERS.EFFECTIVE
      ? page.effective === true
      : page.effective !== true)
  const pageRows = selectedGroups.flatMap((group) => {
    const items = group.items.filter(matchesFilter)
    return items.length
      ? [
          {
            rowID: `group-${group.key}`,
            group: true,
            label: group.title,
            count: items.length,
          },
          ...items.map((page) => ({ ...page, rowID: page.key || page.path })),
        ]
      : []
  })
  const visibleCount = pageRows.filter((row) => !row.group).length
  const sourceLabel =
    access?.is_preview === true || access?.source === 'local_permission_draft'
      ? '未保存的岗位设置'
      : access?.source === 'role_disabled'
        ? '岗位已停用'
        : access?.source === 'control_plane_rbac'
          ? '系统管理权限'
          : access?.is_final === true
            ? '已按公司当前启用配置核对'
            : '尚未完成公司配置核对'
  const pageCell = (row) => ({ colSpan: row.group ? 0 : 1 })

  return (
    <Space
      className="erp-role-effective-access"
      direction="vertical"
      size={12}
      style={{ width: '100%' }}
    >
      <div className="erp-role-effective-access__summary">
        <div>
          <Text strong>{sourceLabel}</Text>
          <Paragraph type="secondary">
            岗位授权与公司启用范围共同决定能否进入页面；页面内的操作还会单独校验。
            {access?.is_preview === true ? '当前调整保存后生效。' : ''}
          </Paragraph>
        </div>
        {access?.config_revision ? (
          <Popover
            title="当前配置版本"
            content={
              <div className="erp-role-effective-access__revision">
                <Text copyable={{ text: access.config_revision }}>
                  {access.config_revision}
                </Text>
              </div>
            }
            trigger="click"
          >
            <Button size="small">查看配置版本</Button>
          </Popover>
        ) : null}
      </div>
      {access?.is_final !== true ? (
        <Alert
          type="warning"
          showIcon
          message="页面访问结果尚未完成核对"
          description="请先核对公司启用配置；当前结果不能作为正式访问范围。"
        />
      ) : null}
      <div className="erp-role-effective-access__toolbar">
        <Select
          aria-label="筛选业务模块"
          value={selectedModule}
          onChange={setModuleFilter}
          options={[
            { value: 'all', label: '全部模块' },
            ...groups.map((group) => ({
              value: group.key,
              label: `${group.title}（${group.items.length}）`,
            })),
          ]}
        />
        <Segmented
          aria-label="筛选页面访问"
          value={pageFilter}
          onChange={setPageFilter}
          options={[
            {
              label: `全部 ${selectedPages.length}`,
              value: ROLE_PAGE_ACCESS_FILTERS.ALL,
            },
            {
              label: `可进入 ${effectiveCount}`,
              value: ROLE_PAGE_ACCESS_FILTERS.EFFECTIVE,
            },
            {
              label: `不可进入 ${blockedCount}`,
              value: ROLE_PAGE_ACCESS_FILTERS.BLOCKED,
            },
          ]}
        />
        <Text type="secondary">
          显示 {visibleCount} / {pages.length} 个页面
        </Text>
      </div>
      <Table
        rowKey="rowID"
        className="erp-role-effective-access__table"
        size="small"
        loading={loading}
        pagination={false}
        dataSource={pageRows}
        scroll={{ x: 720 }}
        rowClassName={(row) =>
          row.group
            ? 'erp-role-effective-access__module'
            : 'erp-role-effective-access__page'
        }
        locale={{ emptyText: <Empty description="此筛选下暂无页面" /> }}
        columns={[
          {
            align: 'left',
            title: '模块 / 页面',
            dataIndex: 'label',
            width: 190,
            onCell: (row) => ({ colSpan: row.group ? 4 : 1 }),
            render: (label, row) =>
              row.group ? (
                <Space size={8}>
                  <Text strong>{label}</Text>
                  <Text type="secondary">{row.count} 页</Text>
                </Space>
              ) : (
                label
              ),
          },
          {
            align: 'left',
            title: '岗位授权',
            dataIndex: 'rbac_granted',
            width: 120,
            onCell: pageCell,
            render: (value) =>
              value === true ? (
                <Tag color="blue">已授权</Tag>
              ) : (
                <Tag>未授权</Tag>
              ),
          },
          {
            align: 'left',
            title: '页面访问',
            dataIndex: 'effective',
            width: 120,
            onCell: pageCell,
            render: (value) =>
              value === true ? (
                <Tag color="green">可进入</Tag>
              ) : (
                <Tag color="red">不可进入</Tag>
              ),
          },
          {
            align: 'left',
            title: '受限原因 / 核对方向',
            onCell: pageCell,
            render: (_, page) => getPermissionPageAccessReason(page),
          },
        ]}
      />
    </Space>
  )
}

function NavigationPlacementOverview({
  access = null,
  roleKey = '',
  navigationMode = ROLE_NAVIGATION_MODES.RECOMMENDED,
  primaryMenuPaths = [],
  secondaryMenuPaths = [],
  dirty = false,
  loading = false,
}) {
  const normalizedRoleKey = String(roleKey || '').trim()
  const accessRoleKey = String(access?.role_key || '').trim()
  if (
    loading ||
    (normalizedRoleKey && accessRoleKey && normalizedRoleKey !== accessRoleKey)
  ) {
    return (
      <Alert
        type="info"
        showIcon
        message="正在读取已保存的导航位置"
        description="读取完成后再按该岗位当前草稿的页面权限生成预览。"
      />
    )
  }

  if (access?.is_final !== true) {
    return (
      <Alert
        type="warning"
        showIcon
        message="暂不能生成岗位导航预览"
        description="需要先核对公司当前启用范围，完成后会显示岗位导航预览。"
      />
    )
  }

  const placement = buildRoleGuidedNavigationPreview({
    navigationSections: [
      ...getNavigationSections(),
      ...getAuthenticatedNavigationSections(),
    ],
    effectiveAccess: access,
    roleKey,
    navigationMode,
    primaryMenuPaths,
    secondaryMenuPaths,
  })
  const groups = [
    {
      key: 'dashboards',
      title: '工作中心',
      description: '每天开始工作的统一入口',
      items: placement.dashboardItems,
    },
    {
      key: 'primary',
      title: '常用工作',
      description: '岗位高频业务',
      items: placement.primaryItems,
    },
    ...placement.secondarySections.map((section) => ({
      ...section,
      description: '侧栏直接显示',
    })),
  ].filter((group) => group.items.length > 0)

  return (
    <div className="erp-role-navigation-preview">
      <div className="erp-role-navigation-preview__head">
        <div>
          <Text strong>导航位置预览</Text>
          <Paragraph type="secondary">
            工作中心固定在最前，常用工作优先排列，其余入口按业务分组直接显示；模块内保留该岗位获准的页面。
          </Paragraph>
        </div>
        <Tag
          color={
            navigationMode === ROLE_NAVIGATION_MODES.CUSTOM ? 'purple' : 'green'
          }
        >
          {navigationMode === ROLE_NAVIGATION_MODES.CUSTOM
            ? '自定义布局'
            : '系统推荐'}
        </Tag>
      </div>
      {dirty ? (
        <Alert
          type="warning"
          showIcon
          message="当前显示尚未保存的布局草稿"
          description="功能权限、常用入口和顺序都会立即预览；保存岗位设置后才会对相关账号生效。"
        />
      ) : null}
      <div className="erp-role-navigation-preview__grid">
        {groups.map((group) => (
          <div
            key={group.key}
            className="erp-role-navigation-preview__group"
            data-navigation-section={group.key}
          >
            <Text strong>{group.title}</Text>
            <Text type="secondary">{group.description}</Text>
            <div className="erp-role-navigation-preview__items">
              {group.items.map((item, index) => (
                <Tag
                  key={item.path}
                  color={
                    group.key === 'dashboards' || group.key === 'primary'
                      ? 'blue'
                      : undefined
                  }
                >
                  {index + 1}. {item.label}
                </Tag>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function DataScopeOverview({
  compact = false,
  mode,
  warehouseIds,
  warehouseOptions,
  disabled,
  onModeChange,
  onWarehouseIdsChange,
}) {
  return (
    <div
      className={`erp-role-policy-boundary${compact ? ' erp-role-policy-boundary--compact' : ''}`}
    >
      {!compact ? (
        <Paragraph type="secondary" className="erp-business-inline-note">
          库存范围可设为全部仓库、指定仓库或不允许查看；选择指定仓库时必须勾选具体仓库。
        </Paragraph>
      ) : null}
      <div className="erp-role-policy-boundary__grid">
        <div className="erp-role-scope-mode">
          <Text strong>{compact ? '仓库范围' : '仓库范围模式'}</Text>
          <Select
            aria-label="仓库范围模式"
            value={mode}
            disabled={disabled}
            style={{ width: '100%' }}
            options={[
              { value: 'ALL', label: '全部仓库' },
              { value: 'ASSIGNED', label: '指定仓库' },
              { value: 'NONE', label: '不允许查看' },
            ]}
            onChange={onModeChange}
          />
        </div>
        {!compact || mode === 'ASSIGNED' ? (
          <div className="erp-role-scope-warehouses">
            {!compact ? <Text strong>允许的仓库</Text> : null}
            <Select
              aria-label="允许的仓库"
              mode="multiple"
              maxTagCount={compact ? 'responsive' : undefined}
              value={warehouseIds}
              disabled={disabled || mode !== 'ASSIGNED'}
              style={{ width: '100%' }}
              placeholder="请选择仓库"
              options={warehouseOptions}
              onChange={onWarehouseIdsChange}
            />
          </div>
        ) : null}
        {!compact ? (
          <div>
            <Text strong>任务范围</Text>
            <Tag color="green">按负责人限制</Tag>
            <Text type="secondary">继续由责任岗位、责任池或指定处理人控制</Text>
          </div>
        ) : null}
        {!compact ? (
          <div>
            <Text strong>其他业务单据</Text>
            <Tag color="gold">按可用功能</Tag>
            <Text type="secondary">本轮不虚构本人、部门或客户集合范围</Text>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function SensitiveFieldOverview({ permissionKeys = [] }) {
  const selected = new Set(normalizeStringList(permissionKeys))
  const groups = [
    [PermissionCode.FIELD_PARTY_PRIVATE_READ, '客商隐私', '电话、地址、税号和账户'],
    [PermissionCode.FIELD_SALES_COMMERCIAL_READ, '销售商业', '销售单价、折扣和金额'],
    [
      PermissionCode.FIELD_PROCUREMENT_COMMERCIAL_READ,
      '采购商业',
      '采购与委外单价、折扣和金额',
    ],
    [
      PermissionCode.FIELD_FINANCE_SETTLEMENT_READ,
      '财务结算',
      '应收、应付、发票、核销和结算账户',
    ],
  ]
  return (
    <div className="erp-role-policy-boundary">
      <Paragraph type="secondary" className="erp-business-inline-note">
        电话、地址、单价、金额和结算资料由独立权限控制，请在“可用功能”中勾选对应字段组。
      </Paragraph>
      <div className="erp-role-policy-boundary__grid">
        {groups.map(([key, label, description]) => (
          <div key={key}>
            <Text strong>{label}</Text>
            <Tag color={selected.has(key) ? 'green' : 'default'}>
              {selected.has(key) ? '允许查看' : '不可查看'}
            </Tag>
            <Text type="secondary">{description}</Text>
          </div>
        ))}
      </div>
    </div>
  )
}

export {
  PermissionImpactMap,
  EffectiveRoleAccessOverview,
  NavigationPlacementOverview,
  DataScopeOverview,
  SensitiveFieldOverview,
}

const { Paragraph, Text } = Typography
