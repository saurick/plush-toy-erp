import {
  ADMIN_ACCOUNT_STATUS,
  getAdminAccountStatus,
} from '../../erp/utils/permissionCenterSearch.mjs'
import {
  getPermissionCenterRoleKey,
  getPermissionCenterRoleName,
  normalizePermissionUsage,
} from '../../erp/utils/permissionCenterAccess.mjs'
import { getPermissionModuleTitle } from '../../erp/utils/permissionModuleLabels.mjs'
import { formatAdminIdentity } from '../../erp/utils/adminIdentity.mjs'
import { getApprovalSettingsBlockerLabel } from '../../erp/utils/approvalSettingsActivation.mjs'

export const PERMISSION_RELATIONSHIP_VIEW_MODE = Object.freeze({
  ROLE: 'role',
  ACCOUNT: 'account',
})

export const PERMISSION_RELATIONSHIP_DETAIL_SCOPE = Object.freeze({
  RELATED: 'related',
  ALL: 'all',
})

export const PERMISSION_RELATIONSHIP_ALL_MODULES = 'all'

const ACCOUNT_STATUS_LABELS = Object.freeze({
  [ADMIN_ACCOUNT_STATUS.ACTIVE]: '启用',
  [ADMIN_ACCOUNT_STATUS.SUSPENDED]: '临时停用',
  [ADMIN_ACCOUNT_STATUS.REVOKED]: '已注销',
})

const ACCESS_SOURCE_LABELS = Object.freeze({
  active_customer_config_revision: '当前客户已启用设置',
  control_plane_rbac: '系统管理权限',
  builtin_rbac_fallback: '产品默认预览',
  role_disabled: '岗位已停用',
  active_revision_missing: '缺少已启用设置',
})

function normalizeText(value = '') {
  return String(value || '').trim()
}

function normalizeList(values = []) {
  return Array.isArray(values) ? values : []
}

function unique(values = []) {
  return [...new Set(values.filter(Boolean))]
}

function permissionKey(permission = {}) {
  return normalizeText(
    permission?.permission_key || permission?.key || permission
  )
}

function permissionName(permission = {}) {
  return normalizeText(permission?.name) || '其他功能'
}

function accountKey(account = {}) {
  return normalizeText(account?.id)
}

function accountName(account = {}) {
  return formatAdminIdentity(account) || '未命名账号'
}

function accountStatus(account = {}) {
  if (account?.is_super_admin === true) {
    return '始终启用'
  }
  return ACCOUNT_STATUS_LABELS[getAdminAccountStatus(account)] || '状态待刷新'
}

function roleKeysOfAccount(account = {}) {
  return unique(
    normalizeList(account?.roles)
      .map(getPermissionCenterRoleKey)
      .filter(Boolean)
  )
}

export function getPermissionRelationshipRoleKeys({
  viewMode = PERMISSION_RELATIONSHIP_VIEW_MODE.ROLE,
  targetKey = '',
  accounts = [],
} = {}) {
  if (viewMode === PERMISSION_RELATIONSHIP_VIEW_MODE.ROLE) {
    return normalizeText(targetKey) ? [normalizeText(targetKey)] : []
  }
  const selectedAccount = normalizeList(accounts).find(
    (account) => accountKey(account) === normalizeText(targetKey)
  )
  return roleKeysOfAccount(selectedAccount)
}

export function buildPermissionRelationshipTargetOptions({
  viewMode = PERMISSION_RELATIONSHIP_VIEW_MODE.ROLE,
  roles = [],
  accounts = [],
} = {}) {
  if (viewMode === PERMISSION_RELATIONSHIP_VIEW_MODE.ACCOUNT) {
    return normalizeList(accounts)
      .filter((account) => accountKey(account))
      .map((account) => ({
        value: accountKey(account),
        label: `${accountName(account)} · ${
          account?.is_super_admin === true
            ? '超级管理员'
            : accountStatus(account)
        }`,
        disabled: false,
      }))
      .sort((left, right) => left.label.localeCompare(right.label, 'zh-CN'))
  }

  return normalizeList(roles)
    .filter((role) => getPermissionCenterRoleKey(role))
    .map((role) => ({
      value: getPermissionCenterRoleKey(role),
      label:
        getPermissionCenterRoleName(role) +
        (role?.disabled === true ? '（已停用）' : ''),
      disabled: false,
    }))
    .sort((left, right) => left.label.localeCompare(right.label, 'zh-CN'))
}

export function buildPermissionRelationshipModuleOptions(permissions = []) {
  const modules = new Map()
  normalizeList(permissions).forEach((permission) => {
    const key = normalizeText(permission?.module) || 'unclassified'
    if (!modules.has(key)) {
      modules.set(key, getPermissionModuleTitle(permission?.module_name))
    }
  })
  return [
    { value: PERMISSION_RELATIONSHIP_ALL_MODULES, label: '全部功能模块' },
    ...[...modules.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((left, right) => left.label.localeCompare(right.label, 'zh-CN')),
  ]
}

function graphLabel(value = '') {
  return normalizeText(value)
    .replaceAll('&', '和')
    .replaceAll('"', '”')
    .replaceAll('<', '＜')
    .replaceAll('>', '＞')
    .replaceAll('|', '｜')
    .replace(/\s*\n+\s*/gu, ' ')
}

function createGraphBuilder() {
  const lines = ['flowchart LR']
  let sequence = 0

  const addNode = (label, className = 'source') => {
    sequence += 1
    const id = `N${sequence}`
    lines.push(`  ${id}["${graphLabel(label)}"]:::${className}`)
    return id
  }

  const addEdge = (from, to, label = '') => {
    if (!from || !to) return
    lines.push(
      `  ${from}${label ? ` -->|"${graphLabel(label)}"| ` : ' --> '}${to}`
    )
  }

  const finish = () => {
    lines.push(
      '  classDef account fill:#eff6ff,stroke:#2563eb,color:#1e3a8a,stroke-width:1.5px'
    )
    lines.push(
      '  classDef inactive fill:#fff1f2,stroke:#e11d48,color:#881337,stroke-width:1.5px'
    )
    lines.push(
      '  classDef role fill:#f5f3ff,stroke:#7c3aed,color:#4c1d95,stroke-width:1.5px'
    )
    lines.push(
      '  classDef source fill:#f8fafc,stroke:#64748b,color:#334155,stroke-dasharray:4 3'
    )
    lines.push(
      '  classDef effective fill:#ecfdf5,stroke:#059669,color:#065f46,stroke-width:1.5px'
    )
    lines.push(
      '  classDef blocked fill:#fff7ed,stroke:#ea580c,color:#9a3412,stroke-width:1.5px'
    )
    lines.push('  classDef scope fill:#f0fdfa,stroke:#0f766e,color:#134e4a')
    lines.push('  classDef approval fill:#fefce8,stroke:#ca8a04,color:#713f12')
    lines.push(
      '  classDef system fill:#fdf4ff,stroke:#c026d3,color:#701a75,stroke-width:2px'
    )
    return lines.join('\n')
  }

  return { addNode, addEdge, finish }
}

function accessForRole(accessByRoleKey = {}, roleKey = '') {
  if (accessByRoleKey instanceof Map) {
    return accessByRoleKey.get(roleKey) || null
  }
  return accessByRoleKey?.[roleKey] || null
}

function accessSourceLabel(access = {}) {
  return (
    ACCESS_SOURCE_LABELS[normalizeText(access?.source)] || '最终结果尚未读取'
  )
}

export function buildPermissionRelationshipEvidence({
  roleKeys = [],
  accessByRoleKey = {},
  approvalSettings = null,
} = {}) {
  const normalizedRoleKeys = unique(
    normalizeList(roleKeys).map(normalizeText).filter(Boolean)
  )
  const accesses = normalizedRoleKeys
    .map((roleKey) => accessForRole(accessByRoleKey, roleKey))
    .filter(Boolean)
  const valuesOf = (key) =>
    unique(
      accesses.map((access) => normalizeText(access?.[key])).filter(Boolean)
    )
  const roleVersions = unique(
    accesses
      .map((access) => Number(access?.role_version || 0))
      .filter((value) => Number.isSafeInteger(value) && value > 0)
      .map(String)
  )

  return {
    sources: unique(accesses.map(accessSourceLabel)),
    configRevisions: valuesOf('config_revision'),
    productVersions: valuesOf('product_version'),
    roleVersions,
    approvalRevision: normalizeText(approvalSettings?.config_revision),
    approvalProductVersion: normalizeText(approvalSettings?.product_version),
    approvalPartial: approvalSettings?.partial === true,
    allFinal:
      normalizedRoleKeys.length > 0 &&
      accesses.length === normalizedRoleKeys.length &&
      accesses.every((access) => access?.is_final === true),
  }
}

function getRoleWarehouseScope(role = {}, warehouseOptions = []) {
  const scope = normalizeList(role?.data_scopes).find(
    (item) => normalizeText(item?.resource_type) === 'warehouse'
  )
  const mode = normalizeText(scope?.mode).toUpperCase()
  if (mode === 'ALL') {
    return '全部仓库'
  }
  if (mode !== 'ASSIGNED') {
    return '无仓库范围'
  }
  const selectedIDs = new Set(
    normalizeList(scope?.resource_ids).map((item) => Number(item))
  )
  const labels = normalizeList(warehouseOptions)
    .filter((warehouse) => selectedIDs.has(Number(warehouse?.id)))
    .map(
      (warehouse) =>
        normalizeText(warehouse?.name) ||
        normalizeText(warehouse?.warehouse_name)
    )
    .filter(Boolean)
  return labels.length > 0
    ? `指定仓库：${labels.join('、')}`
    : '指定仓库（名称待刷新）'
}

function permissionDetailMap(permissions = []) {
  return new Map(
    normalizeList(permissions)
      .filter((permission) => permissionKey(permission))
      .map((permission) => {
        const rawPages = normalizeList(permission?.usage?.pages)
        return [
          permissionKey(permission),
          {
            key: permissionKey(permission),
            name: permissionName(permission),
            moduleKey: normalizeText(permission?.module) || 'unclassified',
            moduleName: getPermissionModuleTitle(permission?.module_name),
            usage: normalizePermissionUsage(permission?.usage || {}),
            rawPages,
          },
        ]
      })
  )
}

function accessPermissionMap(access = {}) {
  return new Map(
    normalizeList(access?.permissions)
      .filter((decision) => permissionKey(decision))
      .map((decision) => [permissionKey(decision), decision])
  )
}

function accessPageMap(access = {}) {
  return new Map(
    normalizeList(access?.pages)
      .filter((page) => normalizeText(page?.key))
      .map((page) => [normalizeText(page?.key), page])
  )
}

function decisionReason(decision = {}, fallback = '') {
  const reason = normalizeList(decision?.reasons)
    .map((item) => normalizeText(item?.label))
    .filter(Boolean)
    .join('；')
  return reason || fallback
}

function permissionPageDetailMap(permissions = []) {
  const pages = new Map()
  permissionDetailMap(permissions).forEach((permission) => {
    normalizeList(permission.rawPages).forEach((page) => {
      const key = normalizeText(page?.key)
      if (!key) return
      const current = pages.get(key) || {
        key,
        name: normalizeText(page?.name) || '相关页面',
        moduleKeys: new Set(),
      }
      current.moduleKeys.add(permission.moduleKey)
      if (current.name === '相关页面' && normalizeText(page?.name)) {
        current.name = normalizeText(page.name)
      }
      pages.set(key, current)
    })
  })
  return pages
}

export function buildPermissionRelationshipDetailRows({
  viewMode = PERMISSION_RELATIONSHIP_VIEW_MODE.ROLE,
  targetKey = '',
  moduleKey = PERMISSION_RELATIONSHIP_ALL_MODULES,
  detailScope = PERMISSION_RELATIONSHIP_DETAIL_SCOPE.RELATED,
  accounts = [],
  roles = [],
  permissions = [],
  accessByRoleKey = {},
} = {}) {
  const roleByKey = new Map(
    normalizeList(roles)
      .filter((role) => getPermissionCenterRoleKey(role))
      .map((role) => [getPermissionCenterRoleKey(role), role])
  )
  const selectedRoleKeys = getPermissionRelationshipRoleKeys({
    viewMode,
    targetKey,
    accounts,
  }).filter((roleKey) => roleByKey.has(roleKey))
  const detailByKey = permissionDetailMap(permissions)
  const pageDetailByKey = permissionPageDetailMap(permissions)
  const selectedModule = normalizeText(moduleKey)
  const exactModule =
    selectedModule && selectedModule !== PERMISSION_RELATIONSHIP_ALL_MODULES
  const includeUngranted =
    detailScope === PERMISSION_RELATIONSHIP_DETAIL_SCOPE.ALL
  const rows = []
  let sequence = 0
  const addRow = (row) => {
    sequence += 1
    rows.push({ ...row, rowKey: `detail-${sequence}` })
  }

  selectedRoleKeys.forEach((roleKey) => {
    const role = roleByKey.get(roleKey)
    const roleName = getPermissionCenterRoleName(role)
    const access = accessForRole(accessByRoleKey, roleKey)
    const permissionDecisions = accessPermissionMap(access)
    const pageDecisions = accessPageMap(access)
    const permissionKeys = includeUngranted
      ? [...detailByKey.keys()]
      : [...permissionDecisions.keys()]

    permissionKeys
      .map((key) => ({ key, detail: detailByKey.get(key) }))
      .filter(({ detail }) => detail)
      .filter(
        ({ detail }) => !exactModule || detail.moduleKey === selectedModule
      )
      .sort((left, right) =>
        `${left.detail.moduleName}:${left.detail.name}`.localeCompare(
          `${right.detail.moduleName}:${right.detail.name}`,
          'zh-CN'
        )
      )
      .forEach(({ key, detail }) => {
        const decision = permissionDecisions.get(key)
        const effective = decision?.effective === true
        const ungranted = !decision
        addRow({
          kind: 'permission',
          source: roleName,
          relation: '获得功能',
          target: detail.name,
          result: ungranted
            ? '岗位未授予该功能'
            : effective
              ? '最终可用'
              : decisionReason(decision, '当前设置未放行'),
          status: ungranted ? '未授予' : effective ? '已生效' : '受限',
        })
      })

    const pageKeys = includeUngranted
      ? unique([...pageDetailByKey.keys(), ...pageDecisions.keys()])
      : [...pageDecisions.keys()]
    pageKeys
      .map((key) => ({
        key,
        detail: pageDetailByKey.get(key),
        decision: pageDecisions.get(key),
      }))
      .filter(
        ({ detail }) =>
          !exactModule || detail?.moduleKeys?.has(selectedModule) === true
      )
      .sort((left, right) =>
        (
          normalizeText(left.decision?.label) ||
          left.detail?.name ||
          ''
        ).localeCompare(
          normalizeText(right.decision?.label) || right.detail?.name || '',
          'zh-CN'
        )
      )
      .forEach(({ detail, decision }) => {
        const effective = decision?.effective === true
        const ungranted = !decision
        addRow({
          kind: 'page',
          source: roleName,
          relation: '进入页面',
          target: normalizeText(decision?.label) || detail?.name || '相关页面',
          result: ungranted
            ? '岗位未授予该页面所需功能'
            : effective
              ? '可进入'
              : decisionReason(decision, '页面当前不可进入'),
          status: ungranted ? '未授予' : effective ? '已生效' : '受限',
        })
      })
  })

  return rows
}

function approvalRoleKeys(item = {}) {
  const effective = normalizeList(item?.effective_role_keys)
    .map(normalizeText)
    .filter(Boolean)
  if (effective.length > 0) {
    return unique(effective)
  }
  return unique(
    normalizeList(item?.members)
      .filter((member) => member?.enabled !== false)
      .map((member) => normalizeText(member?.role_key))
      .filter(Boolean)
  )
}

function approvalAppliesToAccountRole(item = {}, account = {}, roleKey = '') {
  const targetID = Number(account?.id)
  const normalizedRoleKey = normalizeText(roleKey)
  if (!Number.isSafeInteger(targetID) || targetID <= 0 || !normalizedRoleKey) {
    return false
  }
  return normalizeList(item?.members).some(
    (member) =>
      member?.enabled !== false &&
      normalizeText(member?.role_key) === normalizedRoleKey &&
      [0, targetID].includes(Number(member?.user_id))
  )
}

function emptyModel(message = '请选择要查看的岗位或账号') {
  const graph = createGraphBuilder()
  graph.addNode(message, 'source')
  return {
    chart: graph.finish(),
    rows: [],
    contextRows: [],
    warnings: [],
    summary: {
      accounts: 0,
      roles: 0,
      permissions: 0,
      effectivePermissions: 0,
      blockedPermissions: 0,
      pages: 0,
      approvals: 0,
    },
  }
}

export function buildPermissionRelationshipModel({
  viewMode = PERMISSION_RELATIONSHIP_VIEW_MODE.ROLE,
  targetKey = '',
  moduleKey = PERMISSION_RELATIONSHIP_ALL_MODULES,
  accounts = [],
  roles = [],
  permissions = [],
  warehouseOptions = [],
  accessByRoleKey = {},
  approvalSettings = null,
} = {}) {
  const roleByKey = new Map(
    normalizeList(roles)
      .filter((role) => getPermissionCenterRoleKey(role))
      .map((role) => [getPermissionCenterRoleKey(role), role])
  )
  const selectedAccount =
    viewMode === PERMISSION_RELATIONSHIP_VIEW_MODE.ACCOUNT
      ? normalizeList(accounts).find(
          (account) => accountKey(account) === normalizeText(targetKey)
        )
      : null
  const selectedRoleKeys =
    viewMode === PERMISSION_RELATIONSHIP_VIEW_MODE.ROLE
      ? normalizeText(targetKey)
        ? [normalizeText(targetKey)]
        : []
      : roleKeysOfAccount(selectedAccount)
  const selectedRoles = selectedRoleKeys
    .map((key) => roleByKey.get(key))
    .filter(Boolean)

  if (
    viewMode === PERMISSION_RELATIONSHIP_VIEW_MODE.ACCOUNT &&
    !selectedAccount
  ) {
    return emptyModel('请选择要查看的员工账号')
  }
  if (
    viewMode === PERMISSION_RELATIONSHIP_VIEW_MODE.ROLE &&
    selectedRoles.length === 0
  ) {
    return emptyModel('请选择要查看的岗位')
  }

  const graph = createGraphBuilder()
  const rows = []
  const warnings = []
  const seenRows = new Set()
  const detailByKey = permissionDetailMap(permissions)
  const selectedModule = normalizeText(moduleKey)
  const exactModule =
    selectedModule && selectedModule !== PERMISSION_RELATIONSHIP_ALL_MODULES
  const effectivePermissionKeys = new Set()
  const blockedPermissionKeys = new Set()
  const effectivePageKeys = new Set()
  const approvalKeys = new Set()
  const relatedAccountKeys = new Set()
  const relatedRoleKeys = new Set()
  let rowSequence = 0

  const addRow = (row) => {
    const signature = [
      row.source,
      row.relation,
      row.target,
      row.result,
      row.status,
    ].join('|')
    if (seenRows.has(signature)) return
    seenRows.add(signature)
    rowSequence += 1
    rows.push({ ...row, rowKey: `relationship-${rowSequence}` })
  }

  let accountNode = ''
  if (selectedAccount) {
    const enabled =
      selectedAccount?.is_super_admin === true ||
      getAdminAccountStatus(selectedAccount) === ADMIN_ACCOUNT_STATUS.ACTIVE
    accountNode = graph.addNode(
      `账号：${accountName(selectedAccount)}｜${accountStatus(
        selectedAccount
      )}`,
      selectedAccount?.is_super_admin === true
        ? 'system'
        : enabled
          ? 'account'
          : 'inactive'
    )
    relatedAccountKeys.add(accountKey(selectedAccount))

    if (selectedAccount?.is_super_admin === true) {
      const systemNode = graph.addNode(
        '系统保留：全部权限｜不由岗位汇总',
        'system'
      )
      graph.addEdge(accountNode, systemNode, '系统保护')
      addRow({
        kind: 'account',
        source: accountName(selectedAccount),
        relation: '系统保护',
        target: '全部系统权限',
        result: '始终启用，不由岗位配置生成',
        status: '特殊账号',
      })
      warnings.push(
        '超级管理员是系统保留账号，不能把其全部权限误认为来自某个岗位。'
      )
    } else if (!enabled) {
      warnings.push(
        `该账号当前${accountStatus(
          selectedAccount
        )}；岗位分配仍保留，但登录和实际使用受账号状态阻断。`
      )
    } else if (selectedRoles.length === 0) {
      const emptyRoleNode = graph.addNode('未分配岗位', 'blocked')
      graph.addEdge(accountNode, emptyRoleNode, '当前分配')
      addRow({
        kind: 'account',
        source: accountName(selectedAccount),
        relation: '分配岗位',
        target: '未分配岗位',
        result: '没有岗位可汇总',
        status: '受限',
      })
    }
  }

  selectedRoles.forEach((role) => {
    const roleKey = getPermissionCenterRoleKey(role)
    const roleName = getPermissionCenterRoleName(role)
    const access = accessForRole(accessByRoleKey, roleKey)
    const roleDisabled = role?.disabled === true
    const roleNode = graph.addNode(
      `岗位：${roleName}${roleDisabled ? '｜已停用' : ''}`,
      roleDisabled ? 'inactive' : 'role'
    )
    relatedRoleKeys.add(roleKey)

    if (accountNode) {
      graph.addEdge(accountNode, roleNode, '分配')
      addRow({
        kind: 'account',
        source: accountName(selectedAccount),
        relation: '分配岗位',
        target: roleName,
        result: roleDisabled ? '岗位已停用' : '岗位已分配',
        status: roleDisabled ? '受限' : '已配置',
      })
    } else {
      const associatedAccounts = normalizeList(accounts).filter((account) =>
        roleKeysOfAccount(account).includes(roleKey)
      )
      const usableAccountCount = associatedAccounts.filter(
        (account) =>
          account?.is_super_admin === true ||
          getAdminAccountStatus(account) === ADMIN_ACCOUNT_STATUS.ACTIVE
      ).length
      const accountNames = associatedAccounts
        .map(accountName)
        .slice(0, 3)
        .join('、')
      const accountSummaryNode = graph.addNode(
        associatedAccounts.length > 0
          ? `关联账号（${associatedAccounts.length}）：${accountNames}${
              associatedAccounts.length > 3 ? '等' : ''
            }｜可用 ${usableAccountCount}`
          : '关联账号：暂无',
        associatedAccounts.length > 0 ? 'account' : 'source'
      )
      graph.addEdge(accountSummaryNode, roleNode, '分配')
      associatedAccounts.forEach((account) => {
        const usable =
          account?.is_super_admin === true ||
          getAdminAccountStatus(account) === ADMIN_ACCOUNT_STATUS.ACTIVE
        relatedAccountKeys.add(accountKey(account))
        addRow({
          kind: 'account',
          source: accountName(account),
          relation: '分配岗位',
          target: roleName,
          result: usable ? '账号可使用该岗位' : '账号状态阻断使用',
          status: usable ? '已配置' : '受限',
        })
      })
    }

    const sourceNode = graph.addNode(
      accessSourceLabel(access),
      access?.is_final === true ? 'source' : 'blocked'
    )
    graph.addEdge(sourceNode, roleNode, '共同决定')

    if (!access) {
      warnings.push(`${roleName}的最终权限解释尚未读取。`)
    } else if (access?.is_final !== true) {
      warnings.push(
        `${roleName}当前只有${accessSourceLabel(
          access
        )}，不能当作客户最终生效结果。`
      )
    }

    addRow({
      kind: 'source',
      source: accessSourceLabel(access),
      relation: '约束岗位',
      target: roleName,
      result: access?.is_final === true ? '已形成最终结果' : '尚无最终生效结果',
      status: access?.is_final === true ? '已生效' : '需核对',
    })

    const scopeLabel = getRoleWarehouseScope(role, warehouseOptions)
    const scopeNode = graph.addNode(`数据范围：${scopeLabel}`, 'scope')
    graph.addEdge(roleNode, scopeNode, '限制')
    addRow({
      kind: 'scope',
      source: roleName,
      relation: '限制数据范围',
      target: '仓库数据',
      result: scopeLabel,
      status: scopeLabel === '无仓库范围' ? '受限' : '已配置',
    })

    const decisions = accessPermissionMap(access)
    const matchingDecisions = [...decisions.entries()].filter(
      ([key]) =>
        !exactModule || detailByKey.get(key)?.moduleKey === selectedModule
    )

    if (exactModule) {
      matchingDecisions.forEach(([key, decision]) => {
        const detail = detailByKey.get(key) || {
          name: '其他功能',
          usage: { pages: [], backendOnly: true },
          rawPages: [],
        }
        const effective = decision?.effective === true
        const permissionNode = graph.addNode(
          `功能：${detail.name}｜${effective ? '最终可用' : '当前受限'}`,
          effective ? 'effective' : 'blocked'
        )
        graph.addEdge(roleNode, permissionNode, '最终结果')
        if (effective) {
          effectivePermissionKeys.add(key)
        } else {
          blockedPermissionKeys.add(key)
        }
        addRow({
          kind: 'permission',
          source: roleName,
          relation: '获得功能',
          target: detail.name,
          result: effective
            ? '最终可用'
            : decisionReason(decision, '当前设置未放行'),
          status: effective ? '已生效' : '受限',
        })

        const pages = unique(
          normalizeList(detail.rawPages)
            .map((page) => normalizeText(page?.key))
            .filter(Boolean)
        )
        if (pages.length === 0) {
          const backendNode = graph.addNode('无独立页面的受控操作', 'source')
          graph.addEdge(permissionNode, backendNode, '控制')
          addRow({
            kind: 'action',
            source: detail.name,
            relation: '控制',
            target: '无独立页面的受控操作',
            result: effective ? '操作可用' : '操作受限',
            status: effective ? '已生效' : '受限',
          })
          return
        }

        const pageDecisions = accessPageMap(access)
        pages.forEach((pageKey) => {
          const rawPage = normalizeList(detail.rawPages).find(
            (page) => normalizeText(page?.key) === pageKey
          )
          const pageDecision = pageDecisions.get(pageKey)
          const pageName =
            normalizeText(pageDecision?.label) ||
            normalizeText(rawPage?.name) ||
            '相关页面'
          const pageEffective = pageDecision?.effective === true
          const pageNode = graph.addNode(
            `页面：${pageName}｜${pageEffective ? '可进入' : '不可进入'}`,
            pageEffective ? 'effective' : 'blocked'
          )
          graph.addEdge(permissionNode, pageNode, '影响')
          if (pageEffective) {
            effectivePageKeys.add(pageKey)
          }
          addRow({
            kind: 'page',
            source: detail.name,
            relation: '影响页面',
            target: pageName,
            result: pageEffective
              ? '可进入'
              : decisionReason(pageDecision, '页面当前不可进入'),
            status: pageEffective ? '已生效' : '受限',
          })
        })
      })
    } else {
      const modules = new Map()
      matchingDecisions.forEach(([key, decision]) => {
        const detail = detailByKey.get(key) || {
          moduleKey: 'unclassified',
          moduleName: '未分类功能',
        }
        const current = modules.get(detail.moduleKey) || {
          name: detail.moduleName,
          total: 0,
          effective: 0,
        }
        current.total += 1
        if (decision?.effective === true) {
          current.effective += 1
          effectivePermissionKeys.add(key)
        } else {
          blockedPermissionKeys.add(key)
        }
        modules.set(detail.moduleKey, current)
      })
      const moduleSummaries = [...modules.values()].sort((left, right) =>
        left.name.localeCompare(right.name, 'zh-CN')
      )
      const moduleTotal = moduleSummaries.reduce(
        (sum, module) => sum + module.total,
        0
      )
      const moduleEffectiveTotal = moduleSummaries.reduce(
        (sum, module) => sum + module.effective,
        0
      )
      if (moduleSummaries.length > 0) {
        const moduleNode = graph.addNode(
          `功能汇总：${moduleSummaries.length} 个模块｜可用 ${moduleEffectiveTotal} / 已选 ${moduleTotal}`,
          moduleEffectiveTotal > 0 ? 'effective' : 'blocked'
        )
        graph.addEdge(roleNode, moduleNode, '汇总')
      }
      moduleSummaries.forEach((module) => {
        addRow({
          kind: 'module',
          source: roleName,
          relation: '汇总功能模块',
          target: module.name,
          result: `最终可用 ${module.effective} / 岗位已选 ${module.total}`,
          status: module.effective > 0 ? '有可用功能' : '全部受限',
        })
      })

      normalizeList(access?.pages).forEach((page) => {
        if (page?.effective === true && normalizeText(page?.key)) {
          effectivePageKeys.add(normalizeText(page.key))
        }
      })
    }

    normalizeList(approvalSettings?.items)
      .filter((item) => item?.enabled === true)
      .filter((item) =>
        selectedAccount
          ? approvalAppliesToAccountRole(item, selectedAccount, roleKey)
          : approvalRoleKeys(item).includes(roleKey)
      )
      .forEach((item) => {
        const approvalName = normalizeText(item?.label) || '审批事项'
        const blocked = normalizeList(item?.blocked_reasons).length > 0
        const blockedReason = normalizeList(item?.blocked_reasons)
          .map(getApprovalSettingsBlockerLabel)
          .join('、')
        const approvalNode = graph.addNode(
          `审批责任：${approvalName}｜${blocked ? '当前受限' : '已配置'}`,
          blocked ? 'blocked' : 'approval'
        )
        graph.addEdge(roleNode, approvalNode, '承担')
        approvalKeys.add(normalizeText(item?.approval_key) || approvalName)
        addRow({
          kind: 'approval',
          source: roleName,
          relation: '承担审批责任',
          target: approvalName,
          result: blocked ? blockedReason : '已配置',
          status: blocked ? '受限' : '已配置',
        })
      })
  })

  if (approvalSettings?.partial === true) {
    warnings.push('审批责任读取不完整，本图其余权限关系仍可核对。')
  }

  return {
    chart: graph.finish(),
    rows,
    contextRows: rows.filter((row) =>
      ['account', 'source', 'scope', 'approval'].includes(row.kind)
    ),
    warnings: unique(warnings),
    summary: {
      accounts: relatedAccountKeys.size,
      roles: relatedRoleKeys.size,
      permissions: effectivePermissionKeys.size + blockedPermissionKeys.size,
      effectivePermissions: effectivePermissionKeys.size,
      blockedPermissions: blockedPermissionKeys.size,
      pages: effectivePageKeys.size,
      approvals: approvalKeys.size,
    },
  }
}
