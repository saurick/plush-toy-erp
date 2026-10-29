import assert from 'node:assert/strict'
import test from 'node:test'
import { buildRoleResponsibilityModel } from './devRoleResponsibilities.mjs'

const fixture = () => {
  const roles = ['warehouse', 'quality'].map((key) => ({
    role_key: key,
    name: key === 'warehouse' ? '仓库' : '品质',
    version: 1,
    permissions: [
      key === 'warehouse'
        ? 'warehouse.inbound.confirm'
        : 'quality.inspection.update',
    ],
    permission_policy: {
      template_key: key,
      registered: true,
      required_permissions: [
        key === 'warehouse'
          ? 'warehouse.inbound.confirm'
          : 'quality.inspection.update',
      ],
      optional_permissions: ['erp.print_template.read'],
    },
  }))
  return {
    targetKey: 'warehouse',
    roles,
    accounts: [
      { id: 10, account_status: 'active', roles: [{ role_key: 'warehouse' }] },
    ],
    permissions: [
      {
        permission_key: 'warehouse.inbound.confirm',
        name: '确认入库',
        module: 'warehouse',
        module_name: '仓储',
      },
    ],
    accessByRoleKey: Object.fromEntries(
      roles.map((role) => [
        role.role_key,
        {
          role_key: role.role_key,
          role_version: 1,
          is_final: true,
          config_revision: 'one',
          permissions: role.permissions.map((key) => ({
            permission_key: key,
            effective: true,
          })),
        },
      ])
    ),
  }
}

test('responsibilities resolve canonical conditions, preserve optional ungranted abilities and expose staffing gaps', () => {
  const model = buildRoleResponsibilityModel(fixture())
  assert.equal(model.registered, true)
  assert.equal(model.roles[0].optional[0].status, '未启用')
  const inbound = model.duties.find(
    (duty) => duty.stageKey === 'incoming_quality'
  )
  assert.ok(
    inbound.actions.some((action) =>
      action.permissionKeys.includes('warehouse.inbound.confirm')
    )
  )
  assert.ok(
    inbound.actions.every((action) => action.roleKeys.includes('warehouse'))
  )
  assert.ok(inbound.actions.every((action) => action.sourceRefs.length))
  assert.deepEqual(
    model.gaps.map((gap) => gap.name),
    ['品质']
  )
  assert.ok(model.gaps[0].reasons.includes('未分配启用账号'))
})

test('stale, preview, disabled and multi-role evidence cannot be presented as executable authority', () => {
  for (const patch of [
    { role_version: 2 },
    { is_preview: true },
    { is_final: false },
  ]) {
    const input = fixture()
    Object.assign(input.accessByRoleKey.warehouse, patch)
    const model = buildRoleResponsibilityModel(input)
    assert.equal(model.context.ready, false)
    assert.equal(model.roles[0].core[0].status, '待核对')
  }
  const disabled = fixture()
  disabled.roles[0].disabled = true
  assert.equal(
    buildRoleResponsibilityModel(disabled).roles[0].core[0].status,
    '已停用'
  )
  const multiple = fixture()
  multiple.accounts[0].roles.push({ role_key: 'quality' })
  const model = buildRoleResponsibilityModel({
    ...multiple,
    viewMode: 'account',
    targetKey: '10',
  })
  assert.equal(model.context.projectionOnly, true)
  assert.equal(model.roles.length, 2)
  assert.equal(model.gaps.length, 0)
  const empty = buildRoleResponsibilityModel({
    ...fixture(),
    moduleKey: 'finance',
  })
  assert.equal(empty.roles[0].core.length, 0)
  assert.equal(empty.duties.length, 0)
})
