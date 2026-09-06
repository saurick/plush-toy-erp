import {
  Typography,
  Alert,
  Button,
  Empty,
  Popover,
  Segmented,
  Select,
  Space,
  Table,
  Tag,
} from 'antd'
import React, { useState } from 'react'
import { normalizeStringList } from '../../utils/permissionCenterAccess.mjs'

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
          { title: '功能', dataIndex: 'label', width: 220 },
          {
            title: '适用页面',
            dataIndex: 'pages',
            render: (items, record) => {
              const pageLabels = uniqueLabels(
                items.map((item) => item.pageLabel)
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
  const pages = Array.isArray(access?.pages) ? access.pages : []
  const effectiveCount = pages.filter((item) => item?.effective === true).length
  const blockedCount = pages.length - effectiveCount
  const pageRows = pages
    .map((item, index) => ({
      ...item,
      rowID: `effective-page-${index + 1}`,
    }))
    .filter((item) => {
      if (pageFilter === ROLE_PAGE_ACCESS_FILTERS.EFFECTIVE) {
        return item.effective === true
      }
      if (pageFilter === ROLE_PAGE_ACCESS_FILTERS.BLOCKED) {
        return item.effective !== true
      }
      return true
    })
  const sourceLabel =
    access?.source === 'local_permission_draft'
      ? '岗位菜单草稿'
      : access?.is_preview === true
        ? '未保存岗位草稿'
        : access?.source === 'active_customer_config_revision'
          ? '当前客户已启用版本'
          : access?.source === 'control_plane_rbac'
            ? '系统管理权限'
            : access?.source === 'builtin_rbac_fallback'
              ? '产品默认权限预览'
              : access?.source === 'role_disabled'
                ? '岗位已停用'
                : '缺少当前客户启用版本'

  return (
    <Space
      className="erp-role-effective-access"
      direction="vertical"
      size={12}
      style={{ width: '100%' }}
    >
      <Alert
        type={access?.is_final === true ? 'success' : 'warning'}
        showIcon
        message={`${sourceLabel}：${effectiveCount} 个最终可进入页面`}
        description={
          access?.is_preview === true
            ? '已按公司当前启用设置核对；这是未保存草稿，保存后才生效。页面内每项操作仍会单独校验。'
            : access?.config_revision
              ? '已按公司当前启用设置核对。可进入只表示具备页面入口，页面内每项操作仍会单独校验。'
              : '这里不会把岗位基础权限或未保存的勾选冒充为客户最终权限。'
        }
        action={
          access?.config_revision ? (
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
          ) : null
        }
      />
      <div className="erp-role-effective-access__toolbar">
        <Segmented
          aria-label="筛选页面可用范围"
          value={pageFilter}
          onChange={setPageFilter}
          options={[
            {
              label: `全部 ${pages.length}`,
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
          当前显示 {pageRows.length} / {pages.length} 个页面
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
        locale={{ emptyText: <Empty description="暂无最终权限解释" /> }}
        columns={[
          { title: '页面', dataIndex: 'label', width: 190 },
          {
            title: '岗位已选功能',
            dataIndex: 'rbac_granted',
            width: 130,
            render: (value) =>
              value === true ? (
                <Tag color="blue">已具备</Tag>
              ) : (
                <Tag>未具备</Tag>
              ),
          },
          {
            title: '当前页面结果',
            dataIndex: 'effective',
            width: 130,
            render: (value) =>
              value === true ? (
                <Tag color="green">可进入</Tag>
              ) : (
                <Tag color="red">不可进入</Tag>
              ),
          },
          {
            title: '原因',
            dataIndex: 'reasons',
            render: (reasons = []) =>
              Array.isArray(reasons) && reasons.length > 0
                ? reasons
                    .map((reason) => reason?.label)
                    .filter(Boolean)
                    .join('；')
                : '已符合公司当前设置和岗位功能要求',
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
  const moreItems = placement.secondaryItems
  const groups = [
    {
      key: 'dashboards',
      title: '看板中心',
      description: '每天开始工作的统一入口',
      items: placement.dashboardItems,
    },
    {
      key: 'primary',
      title: '常用工作',
      description: '岗位高频业务',
      items: placement.primaryItems,
    },
    {
      key: 'more',
      title: `更多功能（${moreItems.length}）`,
      description: '其余页面沿用管理员菜单分组，岗位帮助固定在最后',
      items: moreItems,
      sections: placement.secondarySections,
    },
  ]
  const moreItemOrder = new Map(
    placement.secondarySections
      .flatMap((section) => section.items)
      .map((item, index) => [item.path, index + 1])
  )

  return (
    <div className="erp-role-navigation-preview">
      <div className="erp-role-navigation-preview__head">
        <div>
          <Text strong>导航位置预览</Text>
          <Paragraph type="secondary">
            看板固定在最前；常用入口只从当前最终可进入页面中排列，更多功能沿用管理员菜单分组且不会增加权限。
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
          <div key={group.key} className="erp-role-navigation-preview__group">
            <Text strong>{group.title}</Text>
            <Text type="secondary">{group.description}</Text>
            {group.key === 'more' && group.sections.length > 0 ? (
              <div className="erp-role-navigation-preview__subgroups">
                {group.sections.map((section) => (
                  <div
                    key={section.key}
                    className="erp-role-navigation-preview__subgroup"
                    data-navigation-section={section.key}
                  >
                    <Text strong>{section.title}</Text>
                    <div className="erp-role-navigation-preview__items">
                      {section.items.map((item) => (
                        <Tag key={item.path}>
                          {moreItemOrder.get(item.path)}. {item.label}
                        </Tag>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="erp-role-navigation-preview__items">
                {group.items.length > 0 ? (
                  group.items.map((item, index) => (
                    <Tag key={item.path} color="blue">
                      {index + 1}. {item.label}
                    </Tag>
                  ))
                ) : (
                  <Text type="secondary">当前没有可显示页面</Text>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function DataScopeOverview({
  mode,
  warehouseIds,
  warehouseOptions,
  disabled,
  onModeChange,
  onWarehouseIdsChange,
}) {
  return (
    <div className="erp-role-policy-boundary">
      <Paragraph type="secondary" className="erp-business-inline-note">
        库存范围可设为全部仓库、指定仓库或不允许查看；选择指定仓库时必须勾选具体仓库。
      </Paragraph>
      <div className="erp-role-policy-boundary__grid">
        <div>
          <Text strong>仓库范围模式</Text>
          <Select
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
        <div>
          <Text strong>允许的仓库</Text>
          <Select
            mode="multiple"
            value={warehouseIds}
            disabled={disabled || mode !== 'ASSIGNED'}
            style={{ width: '100%' }}
            placeholder="请选择仓库"
            options={warehouseOptions}
            onChange={onWarehouseIdsChange}
          />
        </div>
        <div>
          <Text strong>任务范围</Text>
          <Tag color="green">按负责人限制</Tag>
          <Text type="secondary">继续由责任岗位、责任池或指定处理人控制</Text>
        </div>
        <div>
          <Text strong>其他业务单据</Text>
          <Tag color="gold">按可用功能</Tag>
          <Text type="secondary">本轮不虚构本人、部门或客户集合范围</Text>
        </div>
      </div>
    </div>
  )
}

function SensitiveFieldOverview({ permissionKeys = [] }) {
  const selected = new Set(normalizeStringList(permissionKeys))
  const groups = [
    ['field.party_private.read', '客商隐私', '电话、地址、税号和账户'],
    ['field.sales_commercial.read', '销售商业', '销售单价、折扣和金额'],
    [
      'field.procurement_commercial.read',
      '采购商业',
      '采购与委外单价、折扣和金额',
    ],
    [
      'field.finance_settlement.read',
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
