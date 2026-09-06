import { Typography, Alert, Button, Empty, Space, Table, Tag } from 'antd'

import React from 'react'
import {
  getPermissionCenterRoleKey as getRoleKey,
  getPermissionCenterRoleName as getRoleVisibleName,
} from '../../utils/permissionCenterAccess.mjs'
import {
  ADMIN_ACCOUNT_STATUS,
  getAdminAccountStatus,
} from '../../utils/permissionCenterSearch.mjs'
import {
  formatAdminIdentity,
  getAdminDisplayName,
} from '../../utils/adminIdentity.mjs'

const DEFAULT_TABLE_PAGE_SIZE = 8

const ASSOCIATED_ADMIN_STATUS_ORDER = Object.freeze({
  [ADMIN_ACCOUNT_STATUS.ACTIVE]: 0,
  [ADMIN_ACCOUNT_STATUS.SUSPENDED]: 1,
  [ADMIN_ACCOUNT_STATUS.REVOKED]: 2,
})

function compareAssociatedAdmins(left = {}, right = {}) {
  const leftOrder =
    ASSOCIATED_ADMIN_STATUS_ORDER[getAdminAccountStatus(left)] ?? 3
  const rightOrder =
    ASSOCIATED_ADMIN_STATUS_ORDER[getAdminAccountStatus(right)] ?? 3
  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder
  }
  const nameOrder = getAdminDisplayName(left).localeCompare(
    getAdminDisplayName(right),
    'zh-CN'
  )
  return (
    nameOrder ||
    String(left.username || '').localeCompare(
      String(right.username || ''),
      'zh-CN'
    )
  )
}

function renderAssociatedAdminStatus(admin = {}) {
  if (admin.is_super_admin) {
    return <Tag color="gold">始终启用</Tag>
  }
  switch (getAdminAccountStatus(admin)) {
    case ADMIN_ACCOUNT_STATUS.ACTIVE:
      return <Tag color="green">启用</Tag>
    case ADMIN_ACCOUNT_STATUS.SUSPENDED:
      return <Tag color="red">临时停用</Tag>
    case ADMIN_ACCOUNT_STATUS.REVOKED:
      return <Tag>已注销</Tag>
    default:
      return <Tag color="gold">状态待刷新</Tag>
  }
}

function getAdminPhoneSuffix(phone = '') {
  const digits = String(phone || '').replace(/\D/gu, '')
  return digits.length >= 4 ? digits.slice(-4) : ''
}

function DuplicateAdminNameWarning({ matches = [], style }) {
  if (!Array.isArray(matches) || matches.length === 0) {
    return null
  }

  const sortedMatches = [...matches].sort(compareAssociatedAdmins)
  const visibleMatches = sortedMatches.slice(0, 3)
  const hiddenCount = sortedMatches.length - visibleMatches.length
  const hasRevokedAccount = sortedMatches.some(
    (admin) => getAdminAccountStatus(admin) === ADMIN_ACCOUNT_STATUS.REVOKED
  )

  return (
    <Alert
      type="warning"
      showIcon
      style={style}
      message={`发现 ${sortedMatches.length} 个同名账号，请先核对`}
      description={
        <Space direction="vertical" size={6} style={{ width: '100%' }}>
          <Text>
            同一个人兼任多个岗位，请维护原账号；确为同名不同人可以继续本次操作。
          </Text>
          {visibleMatches.map((admin) => {
            const roleLabels = [
              ...new Set(
                (Array.isArray(admin.roles) ? admin.roles : [])
                  .map(getRoleVisibleName)
                  .filter(Boolean)
              ),
            ]
            const phoneSuffix = getAdminPhoneSuffix(admin.phone)
            return (
              <Space key={admin.id || admin.username} wrap size={[4, 4]}>
                <Text strong>{formatAdminIdentity(admin)}</Text>
                {renderAssociatedAdminStatus(admin)}
                {roleLabels.map((roleLabel) => (
                  <Tag key={`${admin.id || admin.username}-${roleLabel}`}>
                    {roleLabel}
                  </Tag>
                ))}
                {phoneSuffix ? (
                  <Text type="secondary">手机号尾号 {phoneSuffix}</Text>
                ) : null}
              </Space>
            )
          })}
          {hiddenCount > 0 ? (
            <Text type="secondary">另有 {hiddenCount} 个同名账号</Text>
          ) : null}
          {hasRevokedAccount ? (
            <Text type="secondary">
              已注销账号不可恢复；如果是员工返聘，请按新账号办理。
            </Text>
          ) : null}
        </Space>
      }
    />
  )
}

function RoleAssociatedAccounts({
  admins = [],
  currentRoleKey = '',
  canReadUsers = false,
  onOpenAdminAccounts,
}) {
  if (!canReadUsers) {
    return (
      <Alert
        type="info"
        showIcon
        message="您不能查看关联账号"
        description="当前账号没有员工账号查看权限，不能据此判断该岗位是否无人使用。"
      />
    )
  }

  const sortedAdmins = [...admins].sort(compareAssociatedAdmins)
  const columns = [
    {
      title: '关联员工',
      dataIndex: 'display_name',
      width: 220,
      render: (_, record) => formatAdminIdentity(record),
    },
    {
      title: '状态',
      dataIndex: 'account_status',
      width: 140,
      render: (_, record) => renderAssociatedAdminStatus(record),
    },
    {
      title: '同时拥有的其他岗位',
      dataIndex: 'roles',
      render: (_, record) => {
        if (record.is_super_admin) {
          return <Tag color="gold">超级管理员</Tag>
        }
        const otherRoles = (Array.isArray(record.roles) ? record.roles : [])
          .filter((role) => getRoleKey(role) !== currentRoleKey)
          .filter((role) => getRoleKey(role))
        if (otherRoles.length === 0) {
          return <Text type="secondary">仅当前岗位</Text>
        }
        return (
          <Space wrap size={[4, 6]}>
            {otherRoles.map((role) => (
              <Tag key={getRoleKey(role)}>{getRoleVisibleName(role)}</Tag>
            ))}
          </Space>
        )
      },
    },
  ]

  return (
    <div className="erp-role-associated-accounts">
      <div className="erp-role-associated-accounts__head">
        <div>
          <Text strong>当前岗位账号</Text>
          <Text type="secondary">只读核对；岗位设置保存后对这些账号生效。</Text>
        </div>
        <Button onClick={onOpenAdminAccounts}>去员工账号管理</Button>
      </div>
      <Table
        rowKey="id"
        className="erp-role-associated-accounts__table"
        columns={columns}
        dataSource={sortedAdmins}
        size="small"
        pagination={
          sortedAdmins.length > DEFAULT_TABLE_PAGE_SIZE
            ? {
                pageSize: DEFAULT_TABLE_PAGE_SIZE,
                showSizeChanger: false,
                showTotal: (total) => `共 ${total} 个账号`,
              }
            : false
        }
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="当前岗位暂无关联账号"
            />
          ),
        }}
        scroll={{ x: 640 }}
      />
    </div>
  )
}

export {
  DEFAULT_TABLE_PAGE_SIZE,
  DuplicateAdminNameWarning,
  RoleAssociatedAccounts,
}

const { Text } = Typography
