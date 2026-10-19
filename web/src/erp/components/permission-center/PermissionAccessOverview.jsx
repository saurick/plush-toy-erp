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
import { QuestionCircleOutlined } from '@ant-design/icons'
import { PermissionCode } from '../../../common/consts/permissions.generated.mjs'
import Table from '@/common/components/table/AppTable'
import FilterChip from '@/common/components/navigation/FilterChip'
import { normalizeStringList } from '../../utils/permissionCenterAccess.mjs'
import {
  buildPermissionNavigationPlacement,
  getPermissionPageAccessReason,
  getPermissionPageEntry,
  groupPermissionPages,
} from '../../utils/permissionNavigation.mjs'

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
  const verified = !loading && access?.is_final === true
  const pages = verified && Array.isArray(access?.pages) ? access.pages : []
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
    <div className="erp-role-effective-access">
      <div className="erp-role-effective-access__summary">
        <div className="erp-role-effective-access__source">
          <Text type="secondary">{sourceLabel}</Text>
          <Popover
            title="页面访问说明"
            content={
              <div className="erp-permission-help">
                岗位授权与公司启用范围共同决定能否进入页面；页面内的操作还会单独校验。
              </div>
            }
            trigger={['hover', 'focus', 'click']}
          >
            <Button
              type="text"
              size="small"
              icon={<QuestionCircleOutlined />}
              aria-label="页面访问说明"
            />
          </Popover>
          {access?.is_preview === true ? (
            <Text type="secondary">当前调整保存后生效</Text>
          ) : null}
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
            <Button type="link" size="small">
              查看配置版本
            </Button>
          </Popover>
        ) : null}
      </div>
      {!verified ? (
        <Alert
          type="warning"
          showIcon
          message={
            loading ? '正在核对页面访问结果' : '页面访问结果尚未完成核对'
          }
          description="当前不展示未经公司启用配置核对的可进入页面；读取完成后再确认访问范围。"
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
        <div
          className="erp-role-effective-access__filters"
          role="group"
          aria-label="筛选页面访问"
        >
          {[
            {
              label: '全部',
              count: selectedPages.length,
              value: ROLE_PAGE_ACCESS_FILTERS.ALL,
            },
            {
              label: '可进入',
              count: effectiveCount,
              value: ROLE_PAGE_ACCESS_FILTERS.EFFECTIVE,
            },
            {
              label: '不可进入',
              count: blockedCount,
              value: ROLE_PAGE_ACCESS_FILTERS.BLOCKED,
            },
          ].map(({ label, count, value }) => (
            <FilterChip
              key={value}
              selected={pageFilter === value}
              count={count}
              onClick={() => setPageFilter(value)}
            >
              {label}
            </FilterChip>
          ))}
        </div>
        <Text type="secondary" className="erp-role-effective-access__count">
          显示 {visibleCount} 页
        </Text>
      </div>
      <div
        className="erp-role-effective-access__results"
        role="region"
        aria-label="页面访问结果"
      >
        <Table
          rowKey="rowID"
          className="erp-role-effective-access__table"
          size="small"
          loading={loading}
          pagination={false}
          dataSource={pageRows}
          sticky
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
              width: 104,
              onCell: pageCell,
              render: (value) => (
                <Text type="secondary">
                  {value === true ? '已授权' : '未授权'}
                </Text>
              ),
            },
            {
              align: 'left',
              title: '页面访问',
              dataIndex: 'effective',
              width: 112,
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
      </div>
    </div>
  )
}

function NavigationPlacementOverview({
  access = null,
  roleKey = '',
  dirty = false,
  loading = false,
}) {
  const normalizedRoleKey = String(roleKey || '').trim()
  const accessRoleKey = String(access?.role_key || '').trim()
  if (loading) {
    return (
      <Text type="secondary" role="status">
        正在读取岗位菜单…
      </Text>
    )
  }

  if (
    access?.is_final !== true ||
    (normalizedRoleKey && accessRoleKey !== normalizedRoleKey)
  ) {
    return (
      <Alert
        type="warning"
        showIcon
        message="暂不能生成岗位菜单"
        description="请先核对页面访问结果，读取完成后再查看菜单。"
      />
    )
  }

  const { sections } = buildPermissionNavigationPlacement({ access })
  return (
    <section className="erp-role-navigation-preview" aria-label="岗位实际菜单">
      <div className="erp-role-navigation-preview__head">
        <div>
          <Text strong>侧栏入口</Text>
          <Paragraph type="secondary">
            菜单按岗位权限和业务模块生成，模块内只显示该岗位获准的页面。
          </Paragraph>
        </div>
        {dirty ? <Tag color="orange">未保存的功能草稿</Tag> : null}
      </div>
      <div className="erp-role-navigation-preview__grid">
        {sections.map((section) => (
          <div
            key={section.key}
            className="erp-role-navigation-preview__group"
            data-navigation-section={section.key}
          >
            <Text strong>{section.title}</Text>
            <div className="erp-role-navigation-preview__items">
              {section.items.map((item, index) => (
                <Tag key={item.path}>
                  {index + 1}. {item.label}
                </Tag>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
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
        设置本岗位可查看和办理的仓库，仍需相应功能权限。
        {disabled ? '当前设置只读。' : '关闭后保留调整，保存岗位设置后生效。'}
      </Paragraph>
      <Space
        direction="vertical"
        className="erp-role-scope-mode"
        style={{ width: '100%' }}
      >
        <Text strong>仓库范围</Text>
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
      </Space>
      {mode === 'ASSIGNED' ? (
        <Space
          direction="vertical"
          className="erp-role-scope-warehouses"
          style={{ width: '100%' }}
        >
          <Text strong>允许的仓库</Text>
          <Select
            aria-label="允许的仓库"
            mode="multiple"
            maxTagCount="responsive"
            value={warehouseIds}
            disabled={disabled}
            status={warehouseIds.length === 0 ? 'error' : undefined}
            style={{ width: '100%' }}
            placeholder="请选择仓库"
            options={warehouseOptions}
            onChange={onWarehouseIdsChange}
          />
          {warehouseIds.length === 0 ? (
            <Text type="danger" role="alert">
              请选择至少一个允许的仓库
            </Text>
          ) : null}
        </Space>
      ) : null}
    </div>
  )
}

function SensitiveFieldOverview({ permissionKeys = [] }) {
  const selected = new Set(normalizeStringList(permissionKeys))
  const groups = [
    [
      PermissionCode.FIELD_PARTY_PRIVATE_READ,
      '客商隐私',
      '电话、地址、税号和账户',
    ],
    [
      PermissionCode.FIELD_SALES_COMMERCIAL_READ,
      '销售商业',
      '销售单价、折扣和金额',
    ],
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
