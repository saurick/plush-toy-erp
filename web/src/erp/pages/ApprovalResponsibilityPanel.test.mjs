import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import test from 'node:test'

const source = readFileSync(
  fileURLToPath(new URL('./ApprovalResponsibilityPanel.jsx', import.meta.url)),
  'utf8'
)

test('approval responsibility panel reuses permission-center accounts and roles', () => {
  assert.match(source, /admins = \[\]/)
  assert.match(source, /roles = \[\]/)
  assert.match(source, /currentAdmin = null/)
  assert.doesNotMatch(source, /adminRpc|rbac_options|admin', \{\}/)
  assert.match(source, /adminRoleKeys\(admin\)/)
  assert.match(source, /adminHasRole\(admin, roleKey\)/)
  assert.match(source, /adminIsActive\(admin\)/)
  assert.match(source, /activeEmployeeCount/)
  assert.match(source, /暂无启用员工/)
  assert.match(source, /岗位已停用/)
  assert.match(source, /未开启审批功能/)
  assert.match(source, /岗位已不存在，请重新选择/)
  assert.match(source, /不可用账号会标明原因/)
  assert.doesNotMatch(
    source,
    /role\.name \|\| role\.display_name \|\| '已配置岗位'/
  )
})

test('approval responsibility panel keeps publish activate and immutable revision boundaries', () => {
  assert.match(source, /previewApprovalSettings\(payload\(\)\)/)
  assert.match(source, /publishApprovalSettings\(payload\(\)\)/)
  assert.match(source, /checkCustomerConfigTransition\(\{/)
  assert.match(source, /activateCustomerConfig\(\{/)
  assert.match(source, /expected_active_revision:\s*settings\.config_revision/)
  assert.match(source, /readback\.config_revision !== published\.revision/)
  assert.match(source, /新设置只影响新启动的流程/)
  assert.match(source, /在途审批继续使用原责任/)
})

test('approval responsibility panel exposes only the three configurable approval items', () => {
  assert.match(
    source,
    /APPROVAL_KEYS = \['sales_order', 'purchase_order', 'shipment_finance'\]/
  )
  assert.match(source, /为三项可配置审批指定主办、备用和升级责任/)
  assert.doesNotMatch(source, /付款审批|客户退货审批|暂不可配置/)
  assert.match(source, /检查并发布/)
  assert.match(source, /启用新设置/)
  assert.match(source, /审批责任加载失败/)
  assert.match(source, /重试/)
  assert.match(source, /同一岗位池或同一指定员工不能重复承担多个责任层级/)
  assert.match(source, /当前只有一个可承接岗位/)
  assert.match(source, /备用和升级可以留空/)
  assert.match(source, /已用于.*责任/)
  assert.match(source, /不参与流程/)
})

test('approval responsibility panel distinguishes unconfigured from disabled', () => {
  assert.match(source, /item\?\.configured === true/)
  assert.match(source, /initializeUnconfigured: false/)
  assert.match(source, /settingsNeedInitialization/)
  assert.match(source, /待设置/)
  assert.match(source, /待初始化/)
  assert.match(source, /推荐责任尚未发布/)
  assert.match(source, /defaultMembers\(approvalKey\)/)
  assert.match(source, /pageDirty = canManage/)
  assert.match(
    source,
    /draftDirty && !preview[\s\S]*item\.blocked_reasons\?\.length/
  )
})

test('approval responsibility panel protects modal and page drafts', () => {
  assert.match(source, /onDirtyChange\?\.\(pageDirty\)/)
  assert.match(source, /draftDirty \|\| Boolean\(published\)/)
  assert.match(source, /放弃本次责任调整/)
  assert.match(source, /discardVersion/)
  assert.match(source, /const requestReload = \(\) =>/)
  assert.match(source, /if \(!pageDirty && !editorDirty\)/)
  assert.match(source, /刷新前要放弃审批责任调整吗/)
  assert.match(source, /onClick=\{requestReload\}/)
})
