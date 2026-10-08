import { Typography, Alert } from 'antd'
import React, { useCallback, useEffect, useState } from 'react'
import { useOutletContext, useSearchParams } from 'react-router-dom'
import SearchInput from '@/common/components/SearchInput.jsx'
import SlidingTabList from '@/common/components/navigation/SlidingTabList'
import { usePermissionRoleSettings } from '../components/permission-center/usePermissionRoleSettings.jsx'
import PermissionAdminAccounts from '../components/permission-center/PermissionAdminAccounts.jsx'
import { usePermissionCenterData } from '../components/permission-center/usePermissionCenterData.mjs'
import {
  READ_ROLE_PERMISSION,
  READ_PERMISSION_PERMISSION,
  canReadApprovalResponsibilities as canReadApprovalSettings,
  PUBLISH_CUSTOMER_CONFIG_PERMISSION,
  ACTIVATE_CUSTOMER_CONFIG_PERMISSION,
  UPDATE_USER_PERMISSION,
  ASSIGN_USER_ROLE_PERMISSION,
  CREATE_USER_PERMISSION,
  DISABLE_USER_PERMISSION,
  REVOKE_USER_PERMISSION,
  PERMISSION_CENTER_TAB_KEYS,
  hasPermission,
} from '../components/permission-center/permissionCenterModel.mjs'

import { getPermissionCenterRoleName as getRoleVisibleName } from '../utils/permissionCenterAccess.mjs'

import { Loading } from '@/common/components/loading'

import { modal } from '@/common/utils/antdApp'

import ApprovalResponsibilityPanel from './ApprovalResponsibilityPanel.jsx'

export default function PermissionCenterPage() {
  const [searchParams] = useSearchParams()
  const [editorContainer, setEditorContainer] = useState(null)
  const [toolbarContainer, setToolbarContainer] = useState(null)
  const [permissionSearch, setPermissionSearch] = useState('')
  const outletContext = useOutletContext()
  const onOpenRoleAccounts = useCallback((role) => {
    setAdminFilterRequest({ keyword: getRoleVisibleName(role || {}) })
    setActiveTabKey(PERMISSION_CENTER_TAB_KEYS.ADMINS)
  }, [])
  const [adminFilterRequest, setAdminFilterRequest] = useState(null)

  const {
    beginLatestRequest,
    adminRpc,
    loading,
    currentAdmin,
    admins,
    roles,
    permissions,
    permissionMenuOptions,
    warehouseScopeOptions,
    loadData,
  } = usePermissionCenterData()
  const [saving, setSaving] = useState(false)

  const [activeTabKey, setActiveTabKey] = useState(
    () => Object.values(PERMISSION_CENTER_TAB_KEYS).includes(searchParams.get('tab'))
      ? searchParams.get('tab')
      : PERMISSION_CENTER_TAB_KEYS.ROLES
  )

  const [approvalResponsibilityDirty, setApprovalResponsibilityDirty] =
    useState(false)
  const [approvalDiscardVersion, setApprovalDiscardVersion] = useState(0)
  const [approvalRefreshVersion, setApprovalRefreshVersion] = useState(0)

  const {
    roleConfigurationDirty,
    confirmDiscardRoleChanges,
    canReadUsers,
    canManageRolePermissions,
    roleTemplateTab,
  } = usePermissionRoleSettings({
    permissions,
    permissionMenuOptions,
    roles,
    currentAdmin,
    warehouseScopeOptions,
    admins,
    beginLatestRequest,
    adminRpc,
    loadData,
    onOpenRoleAccounts,
    onOpenNavigation: () =>
      setActiveTabKey(PERMISSION_CENTER_TAB_KEYS.NAVIGATION),
    navigationMode: activeTabKey === PERMISSION_CENTER_TAB_KEYS.NAVIGATION,
    searchKeyword: permissionSearch,
    setSaving,
    saving,
  })
  const confirmDiscardApprovalChanges = useCallback(
    ({ title, content, onDiscard, onKeepEditing }) => {
      if (!approvalResponsibilityDirty) {
        onDiscard?.()
        return
      }
      modal.confirm({
        maskClosable: true,
        centered: true,
        title,
        content,
        okText: '放弃调整',
        cancelText: '继续处理',
        onOk: () => {
          setApprovalDiscardVersion((current) => current + 1)
          setApprovalResponsibilityDirty(false)
          onDiscard?.()
        },
        onCancel: onKeepEditing,
      })
    },
    [approvalResponsibilityDirty]
  )

  const confirmLeavePermissionCenter = useCallback(
    () =>
      new Promise((resolve) => {
        if (
          activeTabKey === PERMISSION_CENTER_TAB_KEYS.APPROVALS &&
          approvalResponsibilityDirty
        ) {
          confirmDiscardApprovalChanges({
            title: '离开前要放弃审批责任调整吗？',
            content:
              '尚未发布的调整或已经发布但尚未启用的新设置，离开后需要重新处理。',
            onDiscard: () => resolve(true),
            onKeepEditing: () => resolve(false),
          })
          return
        }
        confirmDiscardRoleChanges({
          title: '离开前要放弃未保存的修改吗？',
          content: '离开权限管理后，当前岗位尚未保存的功能调整会丢失。',
          onDiscard: () => resolve(true),
          onKeepEditing: () => resolve(false),
        })
      }),
    [
      activeTabKey,
      approvalResponsibilityDirty,
      confirmDiscardApprovalChanges,
      confirmDiscardRoleChanges,
    ]
  )

  const canReadRoleTemplates =
    hasPermission(currentAdmin, READ_ROLE_PERMISSION) &&
    hasPermission(currentAdmin, READ_PERMISSION_PERMISSION)
  const canCreateUsers = hasPermission(currentAdmin, CREATE_USER_PERMISSION)
  const canManageUsers = hasPermission(currentAdmin, UPDATE_USER_PERMISSION)
  const canAssignUserRoles = hasPermission(
    currentAdmin,
    ASSIGN_USER_ROLE_PERMISSION
  )
  const canDisableUsers = hasPermission(currentAdmin, DISABLE_USER_PERMISSION)
  const canRevokeUsers = hasPermission(currentAdmin, REVOKE_USER_PERMISSION)

  const canReadApprovalResponsibilities = canReadApprovalSettings(currentAdmin)
  const canManageApprovalResponsibilities =
    canReadApprovalResponsibilities &&
    hasPermission(currentAdmin, PUBLISH_CUSTOMER_CONFIG_PERMISSION) &&
    hasPermission(currentAdmin, ACTIVATE_CUSTOMER_CONFIG_PERMISSION)
  const approvalReadOnlyReason = !canReadApprovalResponsibilities
    ? '当前账号不能同时读取员工、岗位和审批责任。'
    : !hasPermission(currentAdmin, PUBLISH_CUSTOMER_CONFIG_PERMISSION) ||
        !hasPermission(currentAdmin, ACTIVATE_CUSTOMER_CONFIG_PERMISSION)
      ? '调整审批责任需要同时具备发布和启用客户设置的权限。'
      : ''

  const permissionWarningMessages = [
    !canReadRoleTemplates ? '您不能查看岗位设置' : '',
    !canReadUsers ? '您不能查看员工账号' : '',
    !canManageRolePermissions ? '您不能调整岗位的可用功能' : '',
    !canAssignUserRoles ? '您不能给员工账号分配岗位' : '',
    !canManageUsers ? '您不能修改手机号或重置密码' : '',
    !canDisableUsers ? '您不能启用或停用员工账号' : '',
    !canRevokeUsers ? '您不能办理员工账号离职注销' : '',
    !canCreateUsers ? '您不能创建员工账号' : '',
  ].filter(Boolean)

  const changePermissionCenterTab = (nextTabKey) => {
    if (nextTabKey === activeTabKey) {
      return
    }
    if (
      activeTabKey === PERMISSION_CENTER_TAB_KEYS.APPROVALS &&
      approvalResponsibilityDirty
    ) {
      confirmDiscardApprovalChanges({
        title: '切换前要放弃审批责任调整吗？',
        content:
          '尚未发布的调整或已经发布但尚未启用的新设置，切换后需要重新处理。',
        onDiscard: () => setActiveTabKey(nextTabKey),
      })
      return
    }
    if (
      [
        PERMISSION_CENTER_TAB_KEYS.ROLES,
        PERMISSION_CENTER_TAB_KEYS.NAVIGATION,
      ].includes(activeTabKey) &&
      [
        PERMISSION_CENTER_TAB_KEYS.ROLES,
        PERMISSION_CENTER_TAB_KEYS.NAVIGATION,
      ].includes(nextTabKey)
    ) {
      setActiveTabKey(nextTabKey)
      return
    }
    confirmDiscardRoleChanges({
      title: '切换页面前要放弃未保存的修改吗？',
      content: '切换后，当前岗位尚未保存的功能调整会丢失。',
      onDiscard: () => setActiveTabKey(nextTabKey),
    })
  }

  const refreshPermissionCenter = useCallback(
    () =>
      new Promise((resolve) => {
        const refresh = async () => {
          const loaded = await loadData()
          if (loaded) {
            setApprovalRefreshVersion((current) => current + 1)
          }
          resolve(loaded)
        }
        if (
          activeTabKey === PERMISSION_CENTER_TAB_KEYS.APPROVALS &&
          approvalResponsibilityDirty
        ) {
          confirmDiscardApprovalChanges({
            title: '刷新前要放弃审批责任调整吗？',
            content:
              '刷新会重新读取当前生效设置，未发布或尚未启用的调整需要重新处理。',
            onDiscard: refresh,
            onKeepEditing: () => resolve(false),
          })
          return
        }
        confirmDiscardRoleChanges({
          title: '刷新前要放弃未保存的修改吗？',
          content: '刷新会重新加载权限数据，当前岗位尚未保存的功能调整会丢失。',
          onDiscard: refresh,
          onKeepEditing: () => resolve(false),
        })
      }),
    [
      activeTabKey,
      approvalResponsibilityDirty,
      confirmDiscardApprovalChanges,
      confirmDiscardRoleChanges,
      loadData,
    ]
  )

  useEffect(() => {
    return outletContext?.registerPageRefresh?.(refreshPermissionCenter)
  }, [outletContext, refreshPermissionCenter])

  useEffect(() => {
    return outletContext?.registerPageLeaveGuard?.(
      roleConfigurationDirty || approvalResponsibilityDirty
        ? confirmLeavePermissionCenter
        : null
    )
  }, [
    approvalResponsibilityDirty,
    confirmLeavePermissionCenter,
    outletContext,
    roleConfigurationDirty,
  ])

  useEffect(() => {
    if (!roleConfigurationDirty && !approvalResponsibilityDirty) {
      return undefined
    }
    const warnBeforeUnload = (event) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [approvalResponsibilityDirty, roleConfigurationDirty])

  useEffect(() => {
    if (
      activeTabKey === PERMISSION_CENTER_TAB_KEYS.APPROVALS &&
      currentAdmin && !loading && !canReadApprovalResponsibilities
    ) {
      setApprovalDiscardVersion((current) => current + 1)
      setApprovalResponsibilityDirty(false)
      setActiveTabKey(PERMISSION_CENTER_TAB_KEYS.ROLES)
    }
  }, [activeTabKey, canReadApprovalResponsibilities, currentAdmin, loading])

  if (loading && admins.length === 0 && !currentAdmin) {
    return (
      <Loading
        title="岗位设置加载中"
        description="正在加载员工账号和岗位，请稍候..."
      />
    )
  }

  const adminAccountTab = (
    <PermissionAdminAccounts
      editorContainer={editorContainer}
      toolbarContainer={toolbarContainer}
      active={activeTabKey === PERMISSION_CENTER_TAB_KEYS.ADMINS}
      currentAdmin={currentAdmin}
      roles={roles}
      setSaving={setSaving}
      adminRpc={adminRpc}
      loadData={loadData}
      admins={admins}
      loading={loading}
      saving={saving}
      filterRequest={adminFilterRequest}
    />
  )

  const tabs = [
    {
      key: PERMISSION_CENTER_TAB_KEYS.ROLES,
      label: '岗位设置',
      count: roles.length,
    },
    {
      key: PERMISSION_CENTER_TAB_KEYS.ADMINS,
      label: '员工账号',
      count: canReadUsers ? admins.length : null,
    },
    ...(canReadApprovalResponsibilities
      ? [
          {
            key: PERMISSION_CENTER_TAB_KEYS.APPROVALS,
            label: '审批责任',
            count: 3,
          },
        ]
      : []),
    {
      key: PERMISSION_CENTER_TAB_KEYS.NAVIGATION,
      label: '岗位导航',
    },
  ]
  const roleView = [
    PERMISSION_CENTER_TAB_KEYS.ROLES,
    PERMISSION_CENTER_TAB_KEYS.NAVIGATION,
  ].includes(activeTabKey)
  return (
    <div className="erp-business-page-layout" ref={setEditorContainer}>
      <div className="erp-permission-page">
        <Title level={1} className="erp-permission-page__title">
          权限管理
        </Title>
        {permissionWarningMessages.length > 0 ? (
          <Alert
            type="warning"
            showIcon
            message="当前账号部分操作受限"
            description={`${permissionWarningMessages.join(
              '；'
            )}。超级管理员账号只能由超级管理员维护。`}
          />
        ) : null}
        <div className="erp-permission-toolbar">
          <SlidingTabList
            className="erp-permission-tabs erp-navigation-tabs"
            aria-label="权限管理"
          >
            {tabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={activeTabKey === tab.key}
                aria-controls={
                  [
                    PERMISSION_CENTER_TAB_KEYS.ROLES,
                    PERMISSION_CENTER_TAB_KEYS.NAVIGATION,
                  ].includes(tab.key)
                    ? 'permission-roles-panel'
                    : `permission-${tab.key}-panel`
                }
                onClick={() => changePermissionCenterTab(tab.key)}
              >
                {tab.label}
                {tab.count !== null ? (
                  <span className="erp-permission-tabs__count">
                    {tab.count}
                  </span>
                ) : null}
              </button>
            ))}
          </SlidingTabList>
          {activeTabKey === PERMISSION_CENTER_TAB_KEYS.ROLES ? (
            <SearchInput
              className="erp-permission-toolbar__search"
              aria-label="搜索功能或页面"
              placeholder="搜索功能名称或页面"
              allowClear
              value={permissionSearch}
              onChange={(event) => setPermissionSearch(event.target.value)}
            />
          ) : null}
          <div
            className="erp-permission-toolbar__account"
            ref={setToolbarContainer}
            hidden={activeTabKey !== PERMISSION_CENTER_TAB_KEYS.ADMINS}
          />
        </div>
        <div id="permission-roles-panel" role="tabpanel" hidden={!roleView}>
          {roleTemplateTab}
        </div>
        <div
          id="permission-admins-panel"
          role="tabpanel"
          hidden={activeTabKey !== PERMISSION_CENTER_TAB_KEYS.ADMINS}
        >
          {adminAccountTab}
        </div>
        {canReadApprovalResponsibilities ? (
          <div
            id="permission-approvals-panel"
            role="tabpanel"
            hidden={activeTabKey !== PERMISSION_CENTER_TAB_KEYS.APPROVALS}
          >
            <ApprovalResponsibilityPanel
              active={activeTabKey === PERMISSION_CENTER_TAB_KEYS.APPROVALS}
              admins={admins}
              roles={roles}
              currentAdmin={currentAdmin}
              canRead={canReadApprovalResponsibilities}
              canManage={canManageApprovalResponsibilities}
              readOnlyReason={approvalReadOnlyReason}
              discardVersion={approvalDiscardVersion}
              refreshVersion={approvalRefreshVersion}
              onDirtyChange={setApprovalResponsibilityDirty}
            />
          </div>
        ) : null}
      </div>
    </div>
  )
}
const { Title } = Typography
