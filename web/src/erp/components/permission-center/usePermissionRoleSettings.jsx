import { Typography, Alert, Button, Card, Empty, Popover, Tag } from 'antd'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  QuestionCircleOutlined,
  ReloadOutlined,
  SaveOutlined,
  BankOutlined,
  SafetyCertificateOutlined,
  TeamOutlined,
  FullscreenOutlined,
  FullscreenExitOutlined,
} from '@ant-design/icons'
import Tabs from '@/common/components/navigation/SlidingTabs'
import BusinessModal from '../business-list/BusinessModal.jsx'
import {
  IS_PRODUCTION_BUILD,
  READ_USER_PERMISSION,
  READ_ROLE_PERMISSION,
  READ_PERMISSION_PERMISSION,
  READ_CUSTOMER_CONFIG_PERMISSION,
  MANAGE_ROLE_PERMISSION,
  ROLE_NAVIGATION_VIEW_KEYS,
  buildPermissionSignature,
  getRoleWarehouseScope,
  buildWarehouseScopeSignature,
  getPermissionKey,
  permissionKeysForRole,
  hasPermission,
  buildPermissionGroups,
  buildPermissionDetailMap,
  adminsForRole,
  summarizeRolePermissions,
} from './permissionCenterModel.mjs'
import {
  getPermissionCenterRoleKey as getRoleKey,
  getPermissionCenterRoleName as getRoleVisibleName,
  filterAssignableBusinessPermissions,
  getPermissionCenterRoleVersion,
  getMatchingRoleAccess,
  getRolePermissionReadOnlyReason,
  getRoleTypeLabel,
  normalizeStringList,
  getPermissionLabel,
} from '../../utils/permissionCenterAccess.mjs'
import { RoleAssociatedAccounts } from './RoleAssociatedAccounts.jsx'
import {
  PermissionImpactMap,
  EffectiveRoleAccessOverview,
  NavigationPlacementOverview,
  DataScopeOverview,
  SensitiveFieldOverview,
} from './PermissionAccessOverview.jsx'
import { PermissionChecklist } from './PermissionChecklist.jsx'
import { usePermissionFullscreen } from './usePermissionFullscreen.jsx'
import { RpcErrorCode } from '@/common/consts/errorCodes'
import { message, modal } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isRpcAbortError } from '@/common/utils/jsonRpc'
import {
  buildLocalPermissionDraftAccess,
  getMenuPlacementMap,
  normalizePermissionMenuOptions,
  reconcilePermissionSelection,
} from '../../utils/permissionMenuProjection.mjs'
import { buildPermissionNavigationPlacement } from '../../utils/permissionNavigation.mjs'
import { ROLE_NAVIGATION_MODES } from '../../config/roleGuidedNavigation.mjs'

const { Paragraph, Text, Title } = Typography

export function usePermissionRoleSettings({
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
  onOpenNavigation,
  navigationMode = false,
  settingsVisible = true,
  searchKeyword = '',
  onSearchChange,
  setSaving,
  saving,
}) {
  const [detailView, setDetailView] = useState(null)
  const [openPopover, setOpenPopover] = useState(null)
  const {
    fullscreen,
    setFullscreen,
    enterFullscreen,
    workspaceRef,
    enterRef,
    exitRef,
  } = usePermissionFullscreen({
    enabled: settingsVisible,
    dismissPopup: () => {
      if (detailView) {
        setDetailView(null)
        return true
      }
      if (openPopover) {
        setOpenPopover(null)
        return true
      }
      return false
    },
  })
  const popoverProps = (key) => ({
    open: openPopover === key,
    onOpenChange: (open) =>
      setOpenPopover((current) =>
        open ? key : current === key ? null : current
      ),
  })
  const [effectiveRoleAccess, setEffectiveRoleAccess] = useState(null)

  const [effectiveRoleAccessLoading, setEffectiveRoleAccessLoading] =
    useState(false)

  const [permissionDraftAccess, setPermissionDraftAccess] = useState(null)

  const permissionDraftAccessRequestRef = useRef(0)

  const [permissionDraftAccessLoading, setPermissionDraftAccessLoading] =
    useState(false)

  const [permissionDraftAccessError, setPermissionDraftAccessError] =
    useState('')

  const [selectedRoleKey, setSelectedRoleKey] = useState('')

  const [selectedRolePermissionKeys, setSelectedRolePermissionKeys] = useState(
    []
  )

  const [selectedWarehouseScopeMode, setSelectedWarehouseScopeMode] =
    useState('NONE')

  const [selectedWarehouseScopeIDs, setSelectedWarehouseScopeIDs] = useState([])

  const [roleSaveConflict, setRoleSaveConflict] = useState(null)

  const [roleNavigationViewKey, setRoleNavigationViewKey] = useState(
    ROLE_NAVIGATION_VIEW_KEYS.MENU
  )

  const assignablePermissions = useMemo(
    () =>
      filterAssignableBusinessPermissions(permissions, {
        isProduction: IS_PRODUCTION_BUILD,
      }),
    [permissions]
  )

  const assignablePermissionKeySet = useMemo(
    () => new Set(assignablePermissions.map(getPermissionKey)),
    [assignablePermissions]
  )

  const normalizedPermissionMenus = useMemo(
    () => normalizePermissionMenuOptions(permissionMenuOptions),
    [permissionMenuOptions]
  )

  const permissionGroups = useMemo(
    () =>
      buildPermissionGroups(assignablePermissions, normalizedPermissionMenus),
    [assignablePermissions, normalizedPermissionMenus]
  )

  const permissionDetailMap = useMemo(
    () =>
      buildPermissionDetailMap(
        assignablePermissions,
        normalizedPermissionMenus
      ),
    [assignablePermissions, normalizedPermissionMenus]
  )

  const selectedRole = useMemo(
    () => roles.find((role) => getRoleKey(role) === selectedRoleKey) || null,
    [roles, selectedRoleKey]
  )

  const selectedRoleSavedPermissionKeys = useMemo(
    () =>
      permissionKeysForRole(selectedRole || {}).filter((permissionKey) =>
        assignablePermissionKeySet.has(permissionKey)
      ),
    [assignablePermissionKeySet, selectedRole]
  )

  const rolePermissionsDirty =
    buildPermissionSignature(selectedRolePermissionKeys) !==
    buildPermissionSignature(selectedRoleSavedPermissionKeys)

  const selectedRolePermissionSignature = useMemo(
    () => buildPermissionSignature(selectedRolePermissionKeys),
    [selectedRolePermissionKeys]
  )

  const selectedRoleVersion = Number(selectedRole?.version || 0)

  const selectedRoleSavedWarehouseScope = useMemo(
    () => getRoleWarehouseScope(selectedRole || {}),
    [selectedRole]
  )

  const roleDataScopeDirty =
    buildWarehouseScopeSignature(
      selectedWarehouseScopeMode,
      selectedWarehouseScopeIDs
    ) !==
    buildWarehouseScopeSignature(
      selectedRoleSavedWarehouseScope.mode,
      selectedRoleSavedWarehouseScope.warehouseIds
    )

  const roleConfigurationDirty = rolePermissionsDirty || roleDataScopeDirty

  const roleDataScopeInvalid =
    selectedWarehouseScopeMode === 'ASSIGNED' &&
    selectedWarehouseScopeIDs.length === 0

  const canReadEffectiveRoleAccess =
    hasPermission(currentAdmin, READ_ROLE_PERMISSION) &&
    hasPermission(currentAdmin, READ_PERMISSION_PERMISSION) &&
    hasPermission(currentAdmin, READ_CUSTOMER_CONFIG_PERMISSION)

  const warehouseScopeSelectOptions = useMemo(
    () =>
      warehouseScopeOptions
        .map((warehouse) => ({
          value: Number(warehouse?.id),
          label: [warehouse?.code, warehouse?.name].filter(Boolean).join(' · '),
        }))
        .filter((option) => option.value > 0),
    [warehouseScopeOptions]
  )

  const localPermissionDraftAccess = useMemo(
    () =>
      buildLocalPermissionDraftAccess({
        menuOptions: normalizedPermissionMenus,
        permissionKeys: selectedRolePermissionKeys,
        roleKey: selectedRoleKey,
      }),
    [normalizedPermissionMenus, selectedRoleKey, selectedRolePermissionKeys]
  )

  const matchingPermissionDraftAccess =
    permissionDraftAccess?.roleKey === selectedRoleKey &&
    permissionDraftAccess?.signature === selectedRolePermissionSignature
      ? getMatchingRoleAccess(selectedRole, permissionDraftAccess.access)
      : null

  const roleAccessForCurrentDraft = rolePermissionsDirty
    ? matchingPermissionDraftAccess || localPermissionDraftAccess
    : getMatchingRoleAccess(selectedRole, effectiveRoleAccess)

  const roleAccessForCurrentDraftLoading = rolePermissionsDirty
    ? permissionDraftAccessLoading && !matchingPermissionDraftAccess
    : effectiveRoleAccessLoading

  const effectiveRolePageCount = useMemo(() => {
    if (
      roleAccessForCurrentDraft?.is_final !== true ||
      roleAccessForCurrentDraftLoading
    ) {
      return null
    }
    return (
      Array.isArray(roleAccessForCurrentDraft?.pages)
        ? roleAccessForCurrentDraft.pages
        : []
    ).filter((page) => page?.effective === true).length
  }, [roleAccessForCurrentDraft, roleAccessForCurrentDraftLoading])

  const roleNavigationPlacement = useMemo(
    () =>
      buildPermissionNavigationPlacement({ access: roleAccessForCurrentDraft }),
    [roleAccessForCurrentDraft]
  )

  const permissionMenuPlacementByPath = useMemo(
    () => getMenuPlacementMap(roleNavigationPlacement),
    [roleNavigationPlacement]
  )

  const confirmDiscardRoleChanges = useCallback(
    ({ title, content, onDiscard, onKeepEditing }) => {
      if (!roleConfigurationDirty) {
        onDiscard?.()
        return
      }
      modal.confirm({
        maskClosable: true,
        centered: true,
        title,
        content,
        okText: '放弃修改',
        cancelText: '继续编辑',
        onOk: () => {
          setSelectedRolePermissionKeys(selectedRoleSavedPermissionKeys)
          setSelectedWarehouseScopeMode(selectedRoleSavedWarehouseScope.mode)
          setSelectedWarehouseScopeIDs(
            selectedRoleSavedWarehouseScope.warehouseIds
          )
          setRoleSaveConflict(null)
          onDiscard?.()
        },
        onCancel: onKeepEditing,
      })
    },
    [
      roleConfigurationDirty,
      selectedRoleSavedPermissionKeys,
      selectedRoleSavedWarehouseScope,
    ]
  )

  const roleSummaries = useMemo(
    () =>
      roles.map((role) => {
        const roleKey = getRoleKey(role)
        const rolePermissionKeys = permissionKeysForRole(role)
        const permissionSummary = summarizeRolePermissions(
          rolePermissionKeys,
          permissionDetailMap
        )
        return {
          key: roleKey,
          adminCount: adminsForRole(admins, roleKey).length,
          permissionSummary,
        }
      }),
    [admins, permissionDetailMap, roles]
  )

  const selectedRoleAdmins = useMemo(
    () => adminsForRole(admins, selectedRoleKey),
    [admins, selectedRoleKey]
  )

  const canReadUsers = hasPermission(currentAdmin, READ_USER_PERMISSION)

  const canManageRolePermissions = hasPermission(
    currentAdmin,
    MANAGE_ROLE_PERMISSION
  )

  const selectedRoleReadOnlyReason = getRolePermissionReadOnlyReason(
    selectedRole || {},
    { isProduction: IS_PRODUCTION_BUILD, currentAdmin }
  )

  const selectedRoleReadOnly = Boolean(selectedRoleReadOnlyReason)

  const selectedRoleConflict =
    roleSaveConflict?.roleKey === selectedRoleKey ? roleSaveConflict : null

  const loadEffectiveRoleAccess = useCallback(
    async (roleKey) => {
      const request = beginLatestRequest('effective-role-access')
      const normalizedRoleKey = getRoleKey({ role_key: roleKey })
      if (!normalizedRoleKey || !canReadEffectiveRoleAccess) {
        setEffectiveRoleAccess(null)
        setEffectiveRoleAccessLoading(false)
        request.finish()
        return false
      }
      setEffectiveRoleAccessLoading(true)
      setEffectiveRoleAccess(null)
      try {
        const result = await adminRpc.call(
          'effective_role_access',
          {
            role_key: normalizedRoleKey,
          },
          { signal: request.signal }
        )
        if (!request.isCurrent()) {
          return false
        }
        setEffectiveRoleAccess(result?.data?.effective_access || null)
        return true
      } catch (err) {
        if (isRpcAbortError(err) || !request.isCurrent()) {
          return false
        }
        setEffectiveRoleAccess(null)
        message.error(getActionErrorMessage(err, '加载岗位最终权限'))
        return false
      } finally {
        if (request.isCurrent()) {
          setEffectiveRoleAccessLoading(false)
          request.finish()
        }
      }
    },
    [adminRpc, beginLatestRequest, canReadEffectiveRoleAccess]
  )

  const changeSelectedRolePermissions = useCallback(
    (requestedPermissionKeys = []) => {
      const result = reconcilePermissionSelection({
        previousKeys: selectedRolePermissionKeys,
        requestedKeys: requestedPermissionKeys,
        permissions: assignablePermissions,
        menuOptions: normalizedPermissionMenus,
      })
      setSelectedRolePermissionKeys(result.permissionKeys)

      const menuByKey = new Map(
        normalizedPermissionMenus.map((menu) => [menu.key, menu])
      )
      const autoAddedLabels = result.autoAdded.map((item) => {
        const menuLabel = menuByKey.get(item.menuKey)?.label || '对应页面'
        const permissionLabel = getPermissionLabel(
          permissionDetailMap,
          item.permissionKey
        )
        return `“${menuLabel}”入口（${permissionLabel}）`
      })
      const autoRemovedLabels = result.autoRemoved.map((item) => {
        const menuLabel = menuByKey.get(item.menuKey)?.label || '对应页面'
        const permissionLabel = getPermissionLabel(
          permissionDetailMap,
          item.permissionKey
        )
        return `“${menuLabel}”操作（${permissionLabel}）`
      })
      const notices = []
      if (autoAddedLabels.length > 0) {
        notices.push(
          `为避免有操作却进不了页面，已同时开启${autoAddedLabels.join('、')}`
        )
      }
      if (autoRemovedLabels.length > 0) {
        notices.push(
          `关闭页面入口后，已同时取消仅在该页使用的${autoRemovedLabels.join('、')}`
        )
      }
      if (notices.length > 0) {
        message.info(notices.join('；'))
      }
    },
    [
      assignablePermissions,
      normalizedPermissionMenus,
      permissionDetailMap,
      selectedRolePermissionKeys,
    ]
  )

  const selectRoleTemplate = (roleKey) => {
    const nextRoleKey = getRoleKey({ role_key: roleKey })
    if (!nextRoleKey || nextRoleKey === selectedRoleKey) {
      return
    }
    confirmDiscardRoleChanges({
      title: '放弃未保存的岗位调整？',
      content:
        '切换岗位会丢弃当前未保存的勾选结果。请先保存，或确认放弃本次调整。',
      onDiscard: () => {
        setRoleSaveConflict(null)
        setSelectedRoleKey(nextRoleKey)
      },
    })
  }

  const refreshConflictedRole = async () => {
    if (!selectedRoleConflict) return
    const loaded = await loadData()
    if (!loaded) return
    setRoleSaveConflict((current) =>
      current?.roleKey === selectedRoleKey
        ? { ...current, refreshed: true }
        : current
    )
  }

  const openSelectedRoleAdminAccounts = () => {
    confirmDiscardRoleChanges({
      title: '切换页面前要放弃未保存的修改吗？',
      content: '切换到员工账号后，当前岗位尚未保存的功能调整会丢失。',
      onDiscard: () => {
        setDetailView(null)
        onOpenRoleAccounts(selectedRole)
      },
    })
  }

  useEffect(() => {
    if (!selectedRole) {
      setSelectedRolePermissionKeys([])
      return
    }
    if (roleSaveConflict?.roleKey === selectedRoleKey) {
      return
    }
    setSelectedRolePermissionKeys(selectedRoleSavedPermissionKeys)
    setSelectedWarehouseScopeMode(selectedRoleSavedWarehouseScope.mode)
    setSelectedWarehouseScopeIDs(selectedRoleSavedWarehouseScope.warehouseIds)
  }, [
    roleSaveConflict,
    selectedRole,
    selectedRoleKey,
    selectedRoleSavedPermissionKeys,
    selectedRoleSavedWarehouseScope,
    selectedRoleVersion,
  ])

  useEffect(() => {
    if (roles.length === 0) {
      setSelectedRoleKey('')
      return
    }
    if (roles.some((role) => getRoleKey(role) === selectedRoleKey)) {
      return
    }
    setSelectedRoleKey(getRoleKey(roles[0]))
  }, [roles, selectedRoleKey])

  useEffect(() => {
    loadEffectiveRoleAccess(selectedRoleKey)
  }, [loadEffectiveRoleAccess, selectedRoleKey, selectedRoleVersion])

  useEffect(() => {
    const requestID = permissionDraftAccessRequestRef.current + 1
    permissionDraftAccessRequestRef.current = requestID
    setPermissionDraftAccessError('')
    if (
      !rolePermissionsDirty ||
      !selectedRoleKey ||
      !canReadEffectiveRoleAccess
    ) {
      setPermissionDraftAccessLoading(false)
      if (!rolePermissionsDirty) {
        setPermissionDraftAccess(null)
      }
      return undefined
    }

    setPermissionDraftAccessLoading(true)
    const signature = selectedRolePermissionSignature
    const timer = window.setTimeout(async () => {
      try {
        const result = await adminRpc.call('effective_role_access', {
          role_key: selectedRoleKey,
          permission_keys: normalizeStringList(selectedRolePermissionKeys),
        })
        if (permissionDraftAccessRequestRef.current === requestID) {
          setPermissionDraftAccess({
            roleKey: selectedRoleKey,
            signature,
            access: result?.data?.effective_access || null,
          })
        }
      } catch (err) {
        if (permissionDraftAccessRequestRef.current === requestID) {
          setPermissionDraftAccessError(
            getActionErrorMessage(err, '核对岗位菜单草稿')
          )
        }
      } finally {
        if (permissionDraftAccessRequestRef.current === requestID) {
          setPermissionDraftAccessLoading(false)
        }
      }
    }, 180)

    return () => {
      window.clearTimeout(timer)
      if (permissionDraftAccessRequestRef.current === requestID) {
        permissionDraftAccessRequestRef.current += 1
      }
    }
  }, [
    adminRpc,
    canReadEffectiveRoleAccess,
    rolePermissionsDirty,
    selectedRoleKey,
    selectedRoleVersion,
    selectedRolePermissionKeys,
    selectedRolePermissionSignature,
  ])

  const saveRolePermissions = async () => {
    const expectedVersion = getPermissionCenterRoleVersion(selectedRole || {})
    if (
      !selectedRoleKey ||
      selectedRoleReadOnly ||
      !expectedVersion ||
      !roleConfigurationDirty
    ) {
      if (selectedRoleReadOnlyReason) {
        message.info(selectedRoleReadOnlyReason)
      }
      return
    }
    setSaving(true)
    try {
      const result = await adminRpc.call('set_role_settings', {
        role_key: selectedRoleKey,
        permission_keys: normalizeStringList(selectedRolePermissionKeys),
        data_scopes: [
          {
            resource_type: 'warehouse',
            mode: selectedWarehouseScopeMode,
            resource_ids:
              selectedWarehouseScopeMode === 'ASSIGNED'
                ? selectedWarehouseScopeIDs
                : [],
          },
        ],
        navigation_mode: ROLE_NAVIGATION_MODES.RECOMMENDED,
        primary_menu_paths: [],
        secondary_menu_paths: [],
        expected_version: expectedVersion,
      })
      const nextVersion = Number(result?.data?.role?.version || 0)
      if (nextVersion !== expectedVersion + 1) {
        throw new Error('岗位版本回读失败')
      }
      message.success('岗位设置已更新，相关账号刷新后生效')
      setRoleSaveConflict(null)
      await loadData()
      await loadEffectiveRoleAccess(selectedRoleKey)
    } catch (err) {
      if (Number(err?.code) === RpcErrorCode.RESOURCE_VERSION_CONFLICT) {
        setRoleSaveConflict({
          roleKey: selectedRoleKey,
          refreshed: false,
        })
        message.warning(
          '该岗位已被其他人修改，当前勾选已保留，请刷新最新岗位后核对再保存'
        )
        return
      }
      message.error(getActionErrorMessage(err, '更新岗位设置'))
    } finally {
      setSaving(false)
    }
  }

  const roleNavigationContent = (
    <Tabs
      className="erp-role-navigation-workspace-tabs"
      type="card"
      size="small"
      activeKey={roleNavigationViewKey}
      destroyOnHidden={false}
      onChange={setRoleNavigationViewKey}
      items={[
        {
          key: ROLE_NAVIGATION_VIEW_KEYS.MENU,
          label: '实际菜单',
          className: 'erp-role-navigation-menu-tab',
          children: (
            <NavigationPlacementOverview
              access={roleAccessForCurrentDraft}
              roleKey={selectedRoleKey}
              dirty={rolePermissionsDirty}
              loading={roleAccessForCurrentDraftLoading}
            />
          ),
        },
        {
          key: ROLE_NAVIGATION_VIEW_KEYS.ACCESS,
          label: '页面访问',
          className: 'erp-role-access-tab',
          children: (
            <div className="erp-role-access-workspace">
              <EffectiveRoleAccessOverview
                access={roleAccessForCurrentDraft}
                loading={roleAccessForCurrentDraftLoading}
              />
              <details className="erp-role-permission-impact">
                <summary>查看功能与页面操作的对应关系</summary>
                <Paragraph type="secondary">
                  查看已选功能对应的页面与操作；最终能否进入以上方页面访问结果为准。
                </Paragraph>
                <PermissionImpactMap
                  permissions={[...permissionDetailMap.values()]}
                  permissionKeys={selectedRolePermissionKeys}
                />
              </details>
            </div>
          ),
        },
      ]}
    />
  )
  const roleTemplateTab = (
    <Card
      className="erp-permission-section erp-permission-section--roles"
      variant="borderless"
    >
      <div className="erp-role-center-layout">
        <aside className="erp-role-center-sidebar" aria-label="岗位列表">
          {roles.length === 0 ? (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="暂无岗位"
            />
          ) : (
            roles.map((role) => {
              const roleKey = getRoleKey(role)
              const summary =
                roleSummaries.find((item) => item.key === roleKey) || {}
              const selected = roleKey === selectedRoleKey
              return (
                <button
                  key={roleKey}
                  type="button"
                  className={`erp-role-template-card${
                    selected ? ' erp-role-template-card--active' : ''
                  }`}
                  aria-pressed={selected}
                  onClick={() => selectRoleTemplate(roleKey)}
                >
                  <span className="erp-role-template-card__main">
                    <Text strong>{getRoleVisibleName(role)}</Text>
                  </span>
                  <span className="erp-role-template-card__meta">
                    <Text type="secondary">
                      {summary.permissionSummary?.total || 0} 项功能
                      {canReadUsers
                        ? ` · ${summary.adminCount || 0} 个账号`
                        : ''}
                    </Text>
                    {role.disabled ? <Tag>已停用</Tag> : null}
                  </span>
                </button>
              )
            })
          )}
        </aside>

        <section
          ref={workspaceRef}
          className={`erp-role-center-detail${fullscreen ? ' erp-role-center-detail--fullscreen' : ''}`}
          role={fullscreen ? 'dialog' : undefined}
          aria-modal={fullscreen ? 'true' : undefined}
          aria-label={
            fullscreen
              ? `${getRoleVisibleName(selectedRole)}岗位设置`
              : undefined
          }
        >
          {selectedRole ? (
            <>
              <div className="erp-role-center-detail__head">
                <div className="erp-role-center-detail__identity">
                  <Title level={5}>{getRoleVisibleName(selectedRole)}</Title>
                  <Text type="secondary">{getRoleTypeLabel(selectedRole)}</Text>
                  <Popover
                    {...popoverProps('help')}
                    placement="bottomRight"
                    trigger={['hover', 'focus']}
                    rootClassName="erp-permission-help-popover"
                    content={
                      <div className="erp-permission-help">
                        <Text strong>菜单与操作</Text>
                        <Text>
                          查看类功能决定菜单是否出现；办理类功能决定进入页面后能做什么。
                        </Text>
                        <Text strong>操作如何生效</Text>
                        <Text>
                          岗位可用操作 = 系统允许 ∩ 模块已启用 ∩ 当前版本已开放
                          − 岗位撤销
                        </Text>
                        <Text type="secondary">
                          “∩”表示这些条件必须同时满足，“−”表示从结果中明确扣除。
                        </Text>
                        <Text type="secondary">
                          员工有多个岗位时，系统先分别计算每个岗位，再合并结果；某一岗位撤销的操作，不会删掉另一个岗位正式拥有的操作。
                        </Text>
                        <Text type="secondary">
                          具体办理时还会继续检查数据范围、负责岗位、单据状态和前置审批等条件。
                        </Text>
                        <Text type="secondary">
                          当前调整仅预览，保存岗位设置后生效。
                        </Text>
                      </div>
                    }
                  >
                    <Button
                      type="text"
                      shape="circle"
                      icon={<QuestionCircleOutlined />}
                      aria-label="菜单与操作说明"
                      className="erp-permission-help-trigger"
                    />
                  </Popover>
                </div>
                <div className="erp-role-center-actions">
                  <Text
                    className="erp-role-center-save-status"
                    type={roleDataScopeInvalid ? 'danger' : 'secondary'}
                    role="status"
                  >
                    {roleDataScopeInvalid
                      ? '请配置允许的仓库'
                      : roleConfigurationDirty
                        ? '有未保存调整'
                        : '当前设置已保存'}
                  </Text>
                  {fullscreen ? (
                    <Button
                      ref={exitRef}
                      icon={<FullscreenExitOutlined aria-hidden="true" />}
                      onClick={() => setFullscreen(false)}
                    >
                      退出全屏
                    </Button>
                  ) : null}
                  <Button
                    icon={<SaveOutlined aria-hidden="true" />}
                    type="primary"
                    className="erp-role-center-save erp-action-button"
                    loading={saving}
                    disabled={
                      !canManageRolePermissions ||
                      !selectedRoleKey ||
                      !roleConfigurationDirty ||
                      roleDataScopeInvalid ||
                      selectedRoleReadOnly
                    }
                    onClick={saveRolePermissions}
                  >
                    保存岗位设置
                  </Button>
                </div>
              </div>
              <div
                className="erp-role-center-tools"
                role="group"
                aria-label="岗位辅助设置"
              >
                <Button
                  icon={<BankOutlined aria-hidden="true" />}
                  onClick={() => setDetailView('scope')}
                >
                  配置数据范围
                </Button>
                <Button
                  icon={<SafetyCertificateOutlined aria-hidden="true" />}
                  onClick={() => setDetailView('fields')}
                >
                  查看敏感字段
                </Button>
                <Button
                  icon={<TeamOutlined aria-hidden="true" />}
                  onClick={() => setDetailView('accounts')}
                >
                  关联账号
                  {canReadUsers ? `（${selectedRoleAdmins.length}）` : ''}
                </Button>
              </div>

              {selectedRoleConflict ? (
                <Alert
                  type="warning"
                  showIcon
                  message={
                    selectedRoleConflict.refreshed
                      ? '已载入最新岗位，当前勾选仍为你的草稿'
                      : '该岗位已被其他人修改'
                  }
                  description={
                    selectedRoleConflict.refreshed
                      ? '请核对当前勾选与最新岗位设置的差异，确认后可再次保存；页面没有覆盖你的草稿。'
                      : '当前勾选已经保留。请先刷新最新岗位资料，再核对并重新保存，避免覆盖他人的调整。'
                  }
                  action={
                    <Button
                      icon={<ReloadOutlined aria-hidden="true" />}
                      className="erp-action-button"
                      size="small"
                      onClick={refreshConflictedRole}
                    >
                      刷新并保留当前勾选
                    </Button>
                  }
                />
              ) : null}

              {selectedRoleReadOnly ? (
                <Alert
                  type="warning"
                  showIcon
                  message={
                    selectedRole.role_type === 'system'
                      ? '系统内置岗位只能查看'
                      : '当前岗位只能查看'
                  }
                  description={selectedRoleReadOnlyReason}
                />
              ) : null}

              {navigationMode ? (
                roleNavigationContent
              ) : (
                <div className="erp-role-settings-workspace">
                  <div className="erp-role-policy-tab-content">
                    {permissionDraftAccessError ? (
                      <Alert
                        type="warning"
                        showIcon
                        message="公司当前启用范围暂时核对失败"
                        description={`${permissionDraftAccessError}。页面先按当前岗位权限显示，保存前请重试。`}
                      />
                    ) : null}
                    <PermissionChecklist
                      fullscreenAction={
                        !fullscreen ? (
                          <Button
                            ref={enterRef}
                            size="small"
                            icon={<FullscreenOutlined aria-hidden="true" />}
                            onClick={enterFullscreen}
                          >
                            {selectedRoleReadOnly || !canManageRolePermissions
                              ? '全屏查看'
                              : '全屏编辑'}
                          </Button>
                        ) : null
                      }
                      changeSummaryPopoverProps={popoverProps('changes')}
                      searchKeyword={searchKeyword}
                      onSearchChange={onSearchChange}
                      groups={permissionGroups}
                      access={roleAccessForCurrentDraft}
                      accessLoading={roleAccessForCurrentDraftLoading}
                      placementByPath={permissionMenuPlacementByPath}
                      permissionDetailMap={permissionDetailMap}
                      value={selectedRolePermissionKeys}
                      savedValue={selectedRoleSavedPermissionKeys}
                      disabled={
                        !canManageRolePermissions ||
                        !selectedRoleKey ||
                        selectedRoleReadOnly
                      }
                      onChange={changeSelectedRolePermissions}
                    />
                  </div>
                  <div
                    className="erp-role-settings-row"
                    role="group"
                    aria-label="岗位页面入口"
                  >
                    <div className="erp-role-settings-links">
                      <Button
                        type="link"
                        onClick={() => {
                          setRoleNavigationViewKey(
                            ROLE_NAVIGATION_VIEW_KEYS.ACCESS
                          )
                          onOpenNavigation?.()
                        }}
                      >
                        {effectiveRolePageCount === null
                          ? '页面访问待核对'
                          : `可访问 ${effectiveRolePageCount} 页`}
                      </Button>
                      <Button
                        type="link"
                        onClick={() => {
                          setRoleNavigationViewKey(
                            ROLE_NAVIGATION_VIEW_KEYS.MENU
                          )
                          onOpenNavigation?.()
                        }}
                      >
                        岗位导航
                      </Button>
                      <Popover
                        {...popoverProps('entry')}
                        content="页面入口按最终可访问范围显示；隐藏菜单不会撤销权限。"
                        trigger={['hover', 'focus']}
                      >
                        <Button
                          type="text"
                          icon={<QuestionCircleOutlined />}
                          aria-label="页面入口说明"
                        />
                      </Popover>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="请选择一个岗位"
            />
          )}
        </section>
      </div>
      <BusinessModal
        title={
          detailView === 'scope'
            ? `数据范围 · ${getRoleVisibleName(selectedRole || {})}`
            : detailView === 'fields'
              ? '敏感字段'
              : `关联账号 · ${getRoleVisibleName(selectedRole || {})}`
        }
        open={Boolean(detailView)}
        onCancel={() => setDetailView(null)}
        footer={<Button onClick={() => setDetailView(null)}>关闭</Button>}
        width={detailView === 'scope' ? 560 : 960}
        destroyOnHidden
      >
        {detailView === 'scope' ? (
          <DataScopeOverview
            mode={selectedWarehouseScopeMode}
            warehouseIds={selectedWarehouseScopeIDs}
            warehouseOptions={warehouseScopeSelectOptions}
            disabled={
              !canManageRolePermissions || selectedRoleReadOnly || saving
            }
            onModeChange={(nextMode) => {
              setSelectedWarehouseScopeMode(nextMode)
              if (nextMode !== 'ASSIGNED') {
                setSelectedWarehouseScopeIDs([])
              }
            }}
            onWarehouseIdsChange={setSelectedWarehouseScopeIDs}
          />
        ) : detailView === 'fields' ? (
          <SensitiveFieldOverview permissionKeys={selectedRolePermissionKeys} />
        ) : detailView === 'accounts' ? (
          <RoleAssociatedAccounts
            admins={selectedRoleAdmins}
            currentRoleKey={selectedRoleKey}
            canReadUsers={canReadUsers}
            onOpenAdminAccounts={openSelectedRoleAdminAccounts}
          />
        ) : null}
      </BusinessModal>
    </Card>
  )
  return {
    roleConfigurationDirty,
    confirmDiscardRoleChanges,
    canReadUsers,
    canManageRolePermissions,
    roleTemplateTab,
  }
}
