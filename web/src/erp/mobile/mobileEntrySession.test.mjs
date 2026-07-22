import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'

const mobileDir = dirname(fileURLToPath(import.meta.url))
const erpDir = dirname(mobileDir)

function readSource(...parts) {
  return readFileSync(join(erpDir, ...parts), 'utf8')
}

test('mobile entry session: admin.me 和 effective session 共用单飞刷新', () => {
  const source = readSource('mobile', 'MobileAppLayout.jsx')

  assert.match(source, /const profileSyncInFlightRef = useRef\(null\)/u)
  assert.match(
    source,
    /if \(profileSyncInFlightRef\.current\) \{\s*return profileSyncInFlightRef\.current\s*\}/u
  )
  assert.match(source, /adminRpc\.call\('me', \{\}\)/u)
  assert.doesNotMatch(source, /authRpc\.call\('me', \{\}\)/u)
  assert.match(
    source,
    /getEffectiveSession\(\{ customer_key: customerKey \}\)/u
  )
  assert.match(source, /persistMobileAdminProfile\(nextProfile\)/u)
  assert.match(
    source,
    /document\.visibilityState === 'visible'[\s\S]*?loadProfile\(\)/u
  )
  assert.match(
    source,
    /window\.setInterval\([\s\S]*?loadProfile\(\)[\s\S]*?PROFILE_SYNC_INTERVAL_MS/u
  )
  assert.doesNotMatch(source, /requestSeq/u)
})

test('mobile entry session: 后台瞬时失败保留有效客户投影并暴露重试', () => {
  const source = readSource('mobile', 'MobileAppLayout.jsx')

  assert.match(
    source,
    /const cachedSession =\s*adminProfileRef\.current\?\.effective_session \|\| null/u
  )
  assert.match(
    source,
    /isTransientProfileSyncError\(sessionError\)[\s\S]*?canMountCustomerRuntime\(adminProfileRef\.current\)[\s\S]*?\? attachEffectiveSessionToAdminProfile/u
  )
  assert.match(source, /setProfileSyncIssue\(true\)/u)
  assert.match(source, /profileSyncing \? '重新连接中' : '重新连接'/u)
  assert.match(
    source,
    /\u5f53\u524d\u663e\u793a\u4e0a\u6b21\u5df2\u786e\u8ba4\u7684\u5de5\u4f5c\u8303\u56f4/u
  )
})

test('mobile entry session: 岗位入口按账号权限直达且可退出', () => {
  const source = readSource('pages', 'EntrySelectionPage.jsx')

  assert.match(
    source,
    /preferredTarget === ENTRY_TARGET\.MOBILE_TASKS && mobileVisible[\s\S]*?resolveMobileTasksPath\(defaultMobileRoleKey\)/u
  )
  assert.match(source, /onClick=\{enterMobileTasks\}[\s\S]*?>\s*手机待办\s*</u)
  assert.doesNotMatch(source, /请选择这次要处理的岗位待办/u)
  assert.doesNotMatch(source, /allowedMobileRoleKeys\.map\(\(roleKey\) =>/u)
  assert.match(source, /authRpc\.call\('logout'\)/u)
  assert.match(source, />\s*退出登录\s*</u)
  assert.match(source, /当前账号未分配业务岗位/u)
  assert.match(source, /手机待办只向明确分配的业务岗位开放/u)
})

test('mobile entry session: 直接访问未分配岗位时按账号业务岗位情况返回入口页', () => {
  const source = readSource('mobile', 'MobileAppLayout.jsx')

  assert.match(
    source,
    /allowedMobileRoleKeys\.length > 0[\s\S]*?'mobile-role-unavailable'[\s\S]*?'mobile-role-unassigned'/u
  )
})

test('mobile entry session: 显式桌面和手机深链不再被入口记忆劫持', () => {
  const source = readSource('router.jsx')

  assert.doesNotMatch(source, /shouldUseRememberedDesktopEntry/u)
  assert.doesNotMatch(source, /readLastMobileEntryPath/u)
  assert.doesNotMatch(source, /getLastEntryTarget/u)
  assert.match(
    source,
    /function MobileShellRoute\(\) \{\s*return \(\s*<AuthGuard requireAdmin>/u
  )
  assert.match(source, /resolveAllowedMobileEntryPath\(allowedMobileRoles\)/u)
})
