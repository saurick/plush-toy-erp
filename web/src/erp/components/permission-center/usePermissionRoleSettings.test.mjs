import assert from 'node:assert/strict'
import test from 'node:test'
import { act, createElement, useLayoutEffect } from 'react'
import { createRoot } from 'react-dom/client'
import {
  installTestDOM,
  registerJSXTestLoader,
} from '../../../../scripts/test/reactRuntime.mjs'

const permissions = [
  {
    permission_key: 'customer.read',
    permission_class: 'business',
    assignable: true,
  },
  {
    permission_key: 'sales_order.read',
    permission_class: 'business',
    assignable: true,
  },
  { permission_key: 'erp.print_template.read', permission_class: 'business', assignable: true },
]
const roles = [
  { role_key: 'sales', name: '业务', permissions: ['customer.read', 'erp.print_template.read'] },
  { role_key: 'finance', name: '财务', permissions: ['sales_order.read'] },
].map((role) => ({
  ...role,
  permission_policy: { template_key: role.role_key, registered: true, required_permissions: role.permissions.filter((key) => key !== 'erp.print_template.read'), optional_permissions: ['erp.print_template.read'] },
  version: 1,
  role_type: 'business_default',
  permissions_editable_by_current_admin: true,
  data_scopes: [{ resource_type: 'warehouse', mode: 'ALL', resource_ids: [] }],
}))

let runtime
async function mountSettings(t, overrides = {}) {
  const dom = installTestDOM()
  runtime ||=
    (registerJSXTestLoader(),
    Promise.all([
      import('./usePermissionRoleSettings.jsx'),
      import('../../hooks/useLatestRequestCoordinator.js'),
      import('../../../common/utils/antdApp.js'),
    ]))
  const [
    { usePermissionRoleSettings },
    { default: useLatestRequestCoordinator },
    { modal },
  ] = await runtime
  const confirmations = []
  t.mock.method(modal, 'confirm', (options) => {
    confirmations.push(options)
    return { destroy() {} }
  })
  let props = {
    permissions: [],
    roles: [],
    permissionMenuOptions: [],
    currentAdmin: { is_super_admin: true },
    admins: [],
    warehouseScopeOptions: [],
    adminRpc: { call: async () => ({ data: {} }) },
    loadData: async () => true,
    setSaving() {},
    onOpenRoleAccounts() {},
    onOpenNavigation() {},
    saving: false,
    ...overrides,
  }
  const committedDirtyStates = []
  let state
  function View() {
    const beginLatestRequest = useLatestRequestCoordinator()
    state = usePermissionRoleSettings({ ...props, beginLatestRequest })
    useLayoutEffect(() => {
      committedDirtyStates.push(state.roleConfigurationDirty)
    })
    return null
  }
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  t.after(async () => {
    await act(async () => root.unmount())
    dom.restore()
  })
  const render = async (nextProps = {}) => {
    props = { ...props, ...nextProps }
    await act(async () => root.render(createElement(View)))
  }
  await render()
  return {
    render,
    confirmations,
    committedDirtyStates,
    get state() {
      return state
    },
  }
}

function findElement(node, predicate) {
  if (Array.isArray(node)) {
    return node.map((child) => findElement(child, predicate)).find(Boolean)
  }
  if (!node?.props) return undefined
  if (predicate(node)) return node
  return findElement(node.props.children, predicate)
}

function checklist(view) {
  return findElement(
    view.state.roleTemplateTab,
    (node) => node.type?.name === 'RolePermissionPolicyPanel'
  ).props
}

async function selectRole(view, name) {
  const button = findElement(
    view.state.roleTemplateTab,
    (node) => node.type === 'button' && node.key === name
  )
  assert.ok(button, `岗位 ${name} 应可选择`)
  await act(async () => button.props.onClick())
}

test('loading saved roles never commits an unsaved-change state', async (t) => {
  const view = await mountSettings(t)
  await view.render({ permissions, roles })
  assert.equal(view.state.roleConfigurationDirty, false)
  assert.equal(
    view.committedDirtyStates.includes(true),
    false,
    '仅加载岗位时，包括初始化的中间帧，都不能注册未保存离开保护'
  )
  let left = false
  view.state.confirmDiscardRoleChanges({
    onDiscard: () => {
      left = true
    },
  })
  assert.equal(left, true)
  assert.equal(view.confirmations.length, 0)
})

test('clean role changes and refreshed or cleared data never commit phantom edits', async (t) => {
  const view = await mountSettings(t)
  await view.render({ permissions, roles })
  for (const roleKey of ['finance', 'sales', 'finance']) {
    await selectRole(view, roleKey)
  }
  await view.render({
    roles: roles.map((role) => ({
      ...role,
      version: 2,
      permissions: [],
      data_scopes: [
        { resource_type: 'warehouse', mode: 'NONE', resource_ids: [] },
      ],
    })),
  })
  await view.render({ roles: [], permissions: [] })
  assert.equal(view.committedDirtyStates.includes(true), false)
  assert.equal(view.confirmations.length, 0)
})

test('permission edits still require confirmation and reverting or discarding clears them', async (t) => {
  const view = await mountSettings(t)
  await view.render({ permissions, roles })
  await act(async () => checklist(view).onChange(['customer.read']))
  assert.equal(view.state.roleConfigurationDirty, true)
  let kept = false
  let left = false
  view.state.confirmDiscardRoleChanges({
    onDiscard: () => {
      left = true
    },
    onKeepEditing: () => {
      kept = true
    },
  })
  assert.equal(left, false)
  view.confirmations.at(-1).onCancel()
  assert.equal(kept, true)
  assert.equal(view.state.roleConfigurationDirty, true)

  await act(async () => checklist(view).onChange(['customer.read', 'erp.print_template.read']))
  assert.equal(view.state.roleConfigurationDirty, false)
  await act(async () => checklist(view).onChange(['customer.read']))
  await selectRole(view, 'finance')
  await act(async () => view.confirmations.at(-1).onOk())
  assert.equal(view.state.roleConfigurationDirty, false)
  assert.deepEqual(checklist(view).value, ['sales_order.read'])
  await selectRole(view, 'sales')
  assert.deepEqual(checklist(view).value, ['customer.read', 'erp.print_template.read'])
})

test('warehouse edits participate in dirty protection and revert with the whole draft', async (t) => {
  const view = await mountSettings(t)
  await view.render({ permissions, roles })
  const scopeButton = findElement(
    view.state.roleTemplateTab,
    (node) => node.props.children === '配置数据范围'
  )
  await act(async () => scopeButton.props.onClick())
  const scope = () =>
    findElement(
      view.state.roleTemplateTab,
      (node) => node.type?.name === 'DataScopeOverview'
    ).props
  await act(async () => scope().onModeChange('ASSIGNED'))
  await act(async () => scope().onWarehouseIdsChange([7]))
  assert.equal(view.state.roleConfigurationDirty, true)
  await act(async () => scope().onModeChange('ALL'))
  assert.deepEqual(scope().warehouseIds, [])
  assert.equal(view.state.roleConfigurationDirty, false)
  await act(async () => scope().onModeChange('NONE'))
  view.state.confirmDiscardRoleChanges({})
  await act(async () => view.confirmations.at(-1).onOk())
  assert.equal(scope().mode, 'ALL')
  assert.equal(view.state.roleConfigurationDirty, false)
})

test('conflict refresh preserves an actual draft until the user discards it', async (t) => {
  const view = await mountSettings(t, {
    adminRpc: {
      call: async (method) => {
        if (method === 'set_role_settings') {
          const { RpcErrorCode } =
            await import('../../../common/consts/errorCodes.js')
          throw Object.assign(new Error('version conflict'), {
            code: RpcErrorCode.RESOURCE_VERSION_CONFLICT,
          })
        }
        return { data: {} }
      },
    },
  })
  const { message } = await import('../../../common/utils/antdApp.js')
  t.mock.method(message, 'warning', () => {})
  await view.render({ permissions, roles })
  await act(async () => checklist(view).onChange(['customer.read']))
  const save = findElement(
    view.state.roleTemplateTab,
    (node) => node.props.children === '保存岗位设置'
  )
  await act(async () => save.props.onClick())
  await view.render({
    roles: roles.map((role) => ({
      ...role,
      version: 2,
      permissions: ['customer.read', 'sales_order.read'],
    })),
  })
  assert.deepEqual(checklist(view).value, ['customer.read'])
  assert.equal(view.state.roleConfigurationDirty, true)
  view.state.confirmDiscardRoleChanges({})
  await act(async () => view.confirmations.at(-1).onOk())
  assert.deepEqual(checklist(view).value, ['customer.read', 'sales_order.read'])
  assert.equal(view.state.roleConfigurationDirty, false)
})

test('role deep link survives asynchronous option loading', async (t) => {
  const view = await mountSettings(t, { initialRoleKey: 'finance' })
  await view.render({ permissions, roles })
  assert.deepEqual(checklist(view).value, ['sales_order.read'])
})

test('missing server responsibility policy keeps permissions and data scopes read-only', async (t) => {
  const view = await mountSettings(t)
  await view.render({ permissions, roles: [{ ...roles[0], permission_policy: undefined }] })
  assert.equal(checklist(view).disabled, true)
  const scopeButton = findElement(view.state.roleTemplateTab, (node) => node.props.children === '配置数据范围')
  await act(async () => scopeButton.props.onClick())
  const scope = findElement(view.state.roleTemplateTab, (node) => node.type?.name === 'DataScopeOverview')
  assert.equal(scope.props.disabled, true)
  const save = findElement(view.state.roleTemplateTab, (node) => node.props.children === '保存岗位设置')
  assert.equal(save.props.disabled, true)
  assert.equal(view.state.roleConfigurationDirty, false)
})
