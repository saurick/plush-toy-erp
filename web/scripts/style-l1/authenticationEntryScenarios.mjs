import {
  assertVisibleInputControlRadius,
  assertVisibleInputFocusRingNotClipped,
} from './inputControlAssertions.mjs'
import { RpcErrorCode } from '../../src/common/consts/errorCodes.generated.js'
import { createMockAdminToken } from './adminRpcMocks.mjs'
import { createMobileAdminReviewScenarios } from './mobileAdminReviewScenarios.mjs'

export function createAuthenticationEntryScenarios({
  expectHeading,
  expectButton,
  assertAdminLoginLayout,
  assert,
  assertERPThemeMode,
  clickERPThemeOption,
  assertThemeReadable,
  assertLoginSegmentedReadable,
  expectText,
  assertAdminLoginSmsHintLayout,
  assertAdminLoginSmsCodeErrorHintSpacing,
  customerRuntimeEffectiveSession,
  waitForPath,
  customerRoleAdminProfile,
  customerRoleRuntimeSession,
  path,
  outputDir,
  expectNoButton,
  assertTextAbsent,
  assertAppAlertDialogLayout,
}) {
  const multiMobileRoleAdminProfile = Object.freeze({
    username: 'style-l1-sales-quality',
    is_super_admin: false,
    roles: [
      { role_key: 'sales', name: '业务' },
      { role_key: 'quality', name: '品质' },
    ],
    permissions: [
      'mobile.sales.access',
      'mobile.quality.access',
      'workflow.task.read',
    ],
    menus: [{ path: '/erp/dashboard' }],
    erp_preferences: { column_orders: {} },
  })
  const adminOnlySuperProfile = Object.freeze({
    id: 1,
    username: 'style-l1-admin-only',
    is_super_admin: true,
    roles: [{ role_key: 'admin', name: '系统管理员' }],
    permissions: [
      'system.user.read',
      'mobile.boss.access',
      'mobile.sales.access',
    ],
    menus: [{ path: '/erp/dashboard' }],
    erp_preferences: { column_orders: {} },
  })
  const multiMobileRoleEffectiveSession = Object.freeze({
    ...customerRuntimeEffectiveSession,
    configRevision: 'style-l1-entry-multi-role',
    actions: [
      'mobile.sales.access',
      'mobile.quality.access',
      'workflow.task.read',
    ],
    workflow_visible_owner_role_keys_by_capability: {
      'workflow.task.read': ['sales', 'quality'],
    },
  })
  return [
    ...createMobileAdminReviewScenarios({ assert, expectText, waitForPath, customerRuntimeEffectiveSession }),
    {
      name: 'admin-login-small-screen-disabled-entries',
      path: '/admin-login',
      mockAdminRpc: true,
      viewport: { width: 320, height: 420 },
      themeMode: 'dark',
      customerConfig: {
        brand: {
          brandMark: '样',
          companyName: '用于验证长名称换行的毛绒玩具生产与贸易示例有限公司',
        },
      },
      beforeNavigate: async (page) => {
        await page.addInitScript(() => {
          window.__PLUSH_ERP_ENTRY_CONFIG__ = {
            desktop: false,
            mobileTasks: false,
          }
        })
      },
      verify: async (page) => {
        await page
          .getByText('暂时无法登录，请联系系统管理员', { exact: true })
          .waitFor()
        assert.equal(
          await page.getByRole('button', { name: /^登\s*录$/ }).isDisabled(),
          true
        )
        assert.equal(
          await page.getByRole('radiogroup', { name: '工作方式' }).count(),
          0
        )
        const geometry = await page.evaluate(() => {
          const title = document
            .querySelector('.erp-login-logo__title')
            .getBoundingClientRect()
          const appearance = document
            .querySelector('.erp-login-card__theme-toggle')
            .getBoundingClientRect()
          const card = document
            .querySelector('.erp-login-card')
            .getBoundingClientRect()
          return {
            titleRight: title.right,
            buttonLeft: appearance.left,
            top: card.top,
            scrollHeight: document.documentElement.scrollHeight,
            bottom: card.bottom,
            viewport: innerHeight,
          }
        })
        assert(
          geometry.titleRight <= geometry.buttonLeft - 6,
          '长公司名称不能挤压外观按钮'
        )
        assert(geometry.top >= 0, '短屏不能裁掉卡片顶部')
        assert(
          geometry.scrollHeight >= geometry.bottom,
          '超高卡片必须能滚动到底部'
        )
        await page
          .getByRole('link', { name: '系统使用规则' })
          .scrollIntoViewIfNeeded()
        await page.getByRole('link', { name: '系统使用规则' }).click()
        await waitForPath(page, '/legal/system-rules')
      },
    },
    {
      name: 'admin-login-late-response',
      path: '/admin-login',
      mockAdminRpc: true,
      viewport: { width: 1280, height: 800 },
      verify: async (page) => {
        await page.getByLabel('账号').fill('style-l1-admin')
        await page.getByLabel('密码', { exact: true }).fill('style-l1-password')
        let release
        let markRequested
        const requested = new Promise((resolve) => {
          markRequested = resolve
        })
        await page.route('**/rpc/auth', async (route) => {
          const { id, method } = route.request().postDataJSON()
          if (method !== 'admin_login') {
            await route.fallback()
            return
          }
          markRequested()
          await new Promise((done) => {
            release = done
          })
          await route.fulfill({
            json: {
              jsonrpc: '2.0',
              id,
              result: {
                code: 0,
                data: {
                  access_token: createMockAdminToken(),
                  username: 'style-l1-admin',
                  is_super_admin: true,
                },
              },
            },
          })
        })
        await page.getByRole('button', { name: /^登\s*录$/ }).click()
        await requested
        await page.getByRole('link', { name: '个人信息处理规则' }).click()
        await waitForPath(page, '/legal/privacy')
        const response = page.waitForResponse(
          (response) =>
            response.url().endsWith('/rpc/auth') &&
            response.request().postDataJSON().method === 'admin_login'
        )
        release()
        await response
        await page.evaluate(
          () =>
            new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve))
            )
        )
        assert.equal(
          new URL(page.url()).pathname,
          '/legal/privacy',
          '离开登录页后迟到响应不能改变页面'
        )
        assert.equal(
          await page.evaluate(() => localStorage.getItem('admin_access_token')),
          null,
          '离开登录页后迟到响应不能保存登录态'
        )
      },
    },
    {
      name: 'admin-login-interactions',
      path: '/admin-login',
      mockAdminRpc: true,
      viewport: { width: 1280, height: 800 },
      verify: async (page) => {
        await page.getByRole('tab', { name: '短信登录' }).waitFor()
        await page
          .getByLabel('密码', { exact: true })
          .fill('temporary-password')
        await page.getByRole('button', { name: '显示密码' }).press('Enter')
        assert.equal(
          await page.getByLabel('密码', { exact: true }).getAttribute('type'),
          'text'
        )
        const motion = await page
          .locator('.erp-login-methods')
          .evaluate(async (strip) => {
            const samples = []
            const box = () => {
              const r = strip.getBoundingClientRect()
              return [r.x, r.y, r.width, r.height]
            }
            const before = box()
            const tabs = [...strip.querySelectorAll('[role="tab"]')]
            const x = () =>
              new DOMMatrixReadOnly(
                getComputedStyle(strip, '::before').transform
              ).m41
            samples.push(x())
            tabs[1].click()
            for (let i = 0; i < 18; i += 1) {
              await new Promise(requestAnimationFrame)
              samples.push(x())
            }
            return {
              samples,
              before,
              after: box(),
              stable: strip.isConnected && tabs.every((tab) => tab.isConnected),
            }
          })
        assert.equal(motion.stable, true)
        assert.deepEqual(motion.before, motion.after)
        assert(
          motion.samples.some(
            (x) => x > motion.samples[0] + 1 && x < motion.samples.at(-1) - 1
          ),
          '登录方式切换应有真实中间帧'
        )
        let sends = 0
        let logins = 0
        let releaseSend
        let releaseLogin
        let sentPhone
        await page.route('**/rpc/auth', async (route) => {
          const { id, method, params } = route.request().postDataJSON()
          if (method === 'send_sms_code') {
            sends += 1
            sentPhone = params.phone
            await new Promise((resolve) => {
              releaseSend = resolve
            })
            await route.fulfill({
              json: {
                jsonrpc: '2.0',
                id,
                result: {
                  code: 0,
                  data: {
                    resend_after: Math.floor(Date.now() / 1000) + 60,
                    mock_delivery: true,
                    mock_code: '123456',
                  },
                },
              },
            })
          } else if (method === 'admin_login') {
            logins += 1
            await new Promise((resolve) => {
              releaseLogin = resolve
            })
            await route.fulfill({
              json: {
                jsonrpc: '2.0',
                id,
                result: {
                  code: RpcErrorCode.AUTH_INVALID_PASSWORD,
                  message: '密码错误',
                  data: null,
                },
              },
            })
          } else await route.fallback()
        })
        await page.getByLabel('手机号').fill('123')
        await page.getByRole('button', { name: '获取验证码' }).click()
        await page.getByText('请输入有效手机号', { exact: true }).waitFor()
        assert.equal(sends, 0, '无效手机号不能触发发码请求')
        await page.getByLabel('手机号').fill('+86 13800000000')
        await page.getByRole('button', { name: '获取验证码' }).click()
        await page.waitForFunction(
          () =>
            document.querySelector('form').getAttribute('aria-busy') === 'true'
        )
        assert.equal(await page.getByLabel('手机号').isDisabled(), true)
        assert.equal(
          await page.getByRole('tab', { name: '密码登录' }).isDisabled(),
          true
        )
        assert.equal(
          await page.getByRole('button', { name: /^登\s*录$/ }).isDisabled(),
          true
        )
        assert.equal(sends, 1)
        assert.equal(sentPhone, '13800000000')
        releaseSend()
        await page.getByText('本次登录验证码：123456').waitFor()
        await page.getByLabel('验证码', { exact: true }).fill('123456')
        await page.getByLabel('手机号').fill('13900000000')
        assert.equal(
          await page.getByLabel('验证码', { exact: true }).inputValue(),
          ''
        )
        assert.equal(await page.getByText('本次登录验证码：123456').count(), 0)
        await page.getByRole('tab', { name: '密码登录' }).click()
        assert.equal(
          await page.getByLabel('密码', { exact: true }).inputValue(),
          ''
        )
        assert.equal(
          await page.getByLabel('密码', { exact: true }).getAttribute('type'),
          'password'
        )
        await page.getByLabel('账号').fill('style-l1-admin')
        await page.getByLabel('密码', { exact: true }).fill('wrong-password')
        await page.getByRole('button', { name: /^登\s*录$/ }).click()
        await page.waitForFunction(
          () =>
            document.querySelector('form').getAttribute('aria-busy') === 'true'
        )
        await page.locator('form').evaluate((form) => {
          form.requestSubmit()
          form.requestSubmit()
        })
        assert.equal(logins, 1, '连续提交只发出一次登录请求')
        assert.equal(
          await page.getByRole('tab', { name: '短信登录' }).isDisabled(),
          true
        )
        releaseLogin()
        await page.getByText('密码错误', { exact: true }).waitFor()
        assert.equal(
          await page.getByLabel('密码', { exact: true }).inputValue(),
          'wrong-password'
        )
        assert.equal(
          await page.getByRole('button', { name: /^登\s*录$/ }).isEnabled(),
          true
        )
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await page.getByRole('tab', { name: '密码登录' }).press('ArrowRight')
        assert.equal(
          await page
            .getByRole('tab', { name: '短信登录' })
            .getAttribute('aria-selected'),
          'true'
        )
        const duration = await page
          .locator('.erp-login-methods')
          .evaluate((el) => getComputedStyle(el, '::before').transitionDuration)
        assert(duration.split(',').every((value) => parseFloat(value) === 0))
      },
    },
    {
      name: 'root-redirect-desktop',
      path: '/',
      mockAdminRpc: true,
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '毛绒玩具管理系统')
        await expectButton(page, /^登\s*录$/)
        await assertAdminLoginLayout(page, { minCardWidth: 456 })
      },
    },
    {
      name: 'root-redirect-mobile',
      path: '/',
      mockAdminRpc: true,
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        await expectHeading(page, '毛绒玩具管理系统')
        await expectButton(page, /^登\s*录$/)
        await assertAdminLoginLayout(page, { minCardWidth: 320 })
      },
    },
    {
      name: 'admin-login-mobile',
      path: '/admin-login',
      mockAdminRpc: true,
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        await expectHeading(page, '毛绒玩具管理系统')
        await expectButton(page, /^登\s*录$/)
        await assertAdminLoginLayout(page, { minCardWidth: 320 })
      },
    },
    {
      name: 'admin-login-password-errors-desktop',
      path: '/admin-login',
      mockAdminRpc: true,
      viewport: { width: 1280, height: 800 },
      beforeNavigate: async (page) => {
        await page.unroute('**/rpc/auth')
        await page.route('**/rpc/auth', async (route) => {
          const body = route.request().postDataJSON() || {}
          const { id = 'password-error-mock', method, params = {} } = body
          if (method === 'capabilities') {
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                jsonrpc: '2.0',
                id,
                result: {
                  code: 0,
                  message: 'OK',
                  data: { sms_login: { enabled: false, mode: 'disabled' } },
                },
              }),
            })
            return
          }

          const failures = {
            missing: [RpcErrorCode.AUTH_USER_NOT_FOUND, '账号不存在'],
            wrong: [RpcErrorCode.AUTH_INVALID_PASSWORD, '密码错误'],
            disabled: [RpcErrorCode.AUTH_USER_DISABLED, '账号已停用'],
            revoked: [RpcErrorCode.AUTH_ACCOUNT_REVOKED, '账号已注销'],
            changed: [
              RpcErrorCode.AUTH_CREDENTIALS_CHANGED,
              '账号信息已变更，请重新登录',
            ],
          }
          const [code, message] = failures[String(params.username)] || [
            RpcErrorCode.INTERNAL,
            '服务器内部错误',
          ]
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              jsonrpc: '2.0',
              id,
              result: { code, message, data: null },
            }),
          })
        })
      },
      verify: async (page) => {
        await expectHeading(page, '毛绒玩具管理系统')
        const username = page.getByLabel('账号')
        const password = page.getByLabel('密码', { exact: true })
        const submit = page.locator('.erp-login-card button[type="submit"]')
        const alert = page.locator('.erp-login-card .ant-alert-message')
        for (const [account, message] of [
          ['missing', '账号不存在'],
          ['wrong', '密码错误'],
          ['disabled', '账号已停用'],
          ['revoked', '账号已注销'],
          ['changed', '账号信息已变更，请重新登录'],
        ]) {
          await username.fill(account)
          await password.fill('style-l1-password')
          await submit.click()
          await alert.filter({ hasText: message }).waitFor({
            state: 'visible',
            timeout: 10_000,
          })
          assert.equal((await alert.textContent())?.trim(), message)
        }
        await assertAdminLoginLayout(page, { minCardWidth: 320 })
      },
    },
    {
      name: 'admin-login-theme-modes-desktop',
      path: '/admin-login',
      mockAdminRpc: true,
      viewport: { width: 1280, height: 800 },
      verify: async (page) => {
        await expectHeading(page, '毛绒玩具管理系统')
        await assertERPThemeMode(page, {
          scenarioName: 'admin-login-theme-modes-desktop',
          expectedMode: 'system',
          expectedEffectiveTheme: 'light',
        })
        await clickERPThemeOption(page, '暗色')
        await assertERPThemeMode(page, {
          scenarioName: 'admin-login-theme-modes-desktop',
          expectedMode: 'dark',
          expectedEffectiveTheme: 'dark',
        })
        await assertThemeReadable(page, {
          scenarioName: 'admin-login-theme-modes-desktop',
          selector: '.erp-login-card',
        })
        await assertLoginSegmentedReadable(page, {
          scenarioName: 'admin-login-theme-modes-desktop',
        })
        await page.getByText('手机版', { exact: true }).click()
        await assertLoginSegmentedReadable(page, {
          scenarioName: 'admin-login-theme-modes-desktop-entry-switch',
        })
        await page.getByRole('tab', { name: '短信登录' }).click()
        await assertLoginSegmentedReadable(page, {
          scenarioName: 'admin-login-theme-modes-desktop-login-mode-switch',
        })
        await page.getByPlaceholder('请输入手机号').fill('13794566255')
        await page.getByRole('button', { name: '获取验证码' }).click()
        await expectText(page, '本次登录验证码')
        await assertAdminLoginSmsHintLayout(page, {
          scenarioName: 'admin-login-theme-modes-desktop-dark-sms-hint',
        })
        await page.getByRole('button', { name: /^登\s*录$/ }).click()
        await assertAdminLoginSmsCodeErrorHintSpacing(page, {
          scenarioName: 'admin-login-theme-modes-desktop-dark-sms-code-error',
        })
        await page.reload({ waitUntil: 'domcontentloaded' })
        await page
          .getByRole('tab', { name: '短信登录' })
          .waitFor({ state: 'visible', timeout: 10_000 })
        await page.waitForFunction(
          () =>
            document.querySelector('input[placeholder="请输入手机号"]')
              ?.value === '13794566255',
          null,
          { timeout: 10_000 }
        )
        const persistedLoginState = await page.evaluate(() => {
          const selectedTexts = [
            ...document.querySelectorAll(
              '.erp-login-card .ant-segmented-item-selected, .erp-login-methods [aria-selected="true"]'
            ),
          ].map((item) => item.textContent.replace(/\s+/g, ' ').trim())
          const codeButton = document.querySelector(
            '.erp-login-card .erp-login-sms-code-compact button'
          )

          return {
            selectedTexts,
            phoneValue:
              document.querySelector('input[placeholder="请输入手机号"]')
                ?.value || '',
            codeButtonText: codeButton?.textContent?.trim() || '',
            codeButtonDisabled: Boolean(codeButton?.disabled),
          }
        })
        assert(
          persistedLoginState.selectedTexts.includes('手机版'),
          `工作方式刷新后未保持手机版: ${JSON.stringify(persistedLoginState)}`
        )
        assert(
          persistedLoginState.selectedTexts.includes('短信登录'),
          `登录方式刷新后未保持短信登录: ${JSON.stringify(persistedLoginState)}`
        )
        assert.equal(
          persistedLoginState.phoneValue,
          '13794566255',
          `短信手机号刷新后未恢复: ${JSON.stringify(persistedLoginState)}`
        )
        assert(
          persistedLoginState.codeButtonDisabled,
          `短信倒计时刷新后未保持禁用: ${JSON.stringify(persistedLoginState)}`
        )
        assert.match(
          persistedLoginState.codeButtonText,
          /^\d+s$/,
          `短信倒计时刷新后未恢复秒数: ${JSON.stringify(persistedLoginState)}`
        )
        await assertAdminLoginSmsHintLayout(page, {
          scenarioName: 'admin-login-theme-modes-desktop-refresh-sms-hint',
        })
        await page.evaluate(() => {
          window.localStorage.setItem('plush_erp_theme_mode', 'light')
          window.dispatchEvent(new Event('focus'))
        })
        await page.waitForFunction(
          () => document.documentElement.dataset.erpThemeMode === 'light',
          null,
          { timeout: 10_000 }
        )
        await assertERPThemeMode(page, {
          scenarioName: 'admin-login-theme-modes-desktop-storage-sync',
          expectedMode: 'light',
          expectedEffectiveTheme: 'light',
        })
        await assertAdminLoginSmsHintLayout(page, {
          scenarioName: 'admin-login-theme-modes-desktop-light-sms-hint',
        })
        await clickERPThemeOption(page, '暗色')
        await page.reload({ waitUntil: 'domcontentloaded' })
        await expectHeading(page, '毛绒玩具管理系统')
        await assertERPThemeMode(page, {
          scenarioName: 'admin-login-theme-modes-desktop',
          expectedMode: 'dark',
          expectedEffectiveTheme: 'dark',
        })
        await assertVisibleInputFocusRingNotClipped(page, 'login-dark-compact')
        await clickERPThemeOption(page, '跟系统')
        await assertERPThemeMode(page, {
          scenarioName: 'admin-login-theme-modes-desktop',
          expectedMode: 'system',
          expectedEffectiveTheme: 'light',
        })
        const compact = page.locator('.erp-login-sms-code-compact')
        const initialStyle = await compact.getAttribute('style')
        let brokenFocusStyle
        await assertVisibleInputControlRadius(page, 'login-clipped-compact')
        await assertVisibleInputFocusRingNotClipped(
          page,
          'login-clipped-compact'
        )
        try {
          for (const brokenStyle of [
            'border-radius: 0px',
            'overflow: visible',
          ]) {
            await compact.evaluate(
              (node, style) => node.setAttribute('style', style),
              brokenStyle
            )
            await assert.rejects(
              () =>
                assertVisibleInputControlRadius(page, 'login-invalid-compact'),
              /圆角或组合接缝未达到 ERP 基线/u
            )
          }
          await compact.evaluate((node, style) => {
            if (style === null) node.removeAttribute('style')
            else node.setAttribute('style', style)
          }, initialStyle)
          brokenFocusStyle = await page.addStyleTag({
            content:
              '.erp-login-card .erp-login-sms-code-compact.ant-space-compact:focus-within::after { content: none !important; box-shadow: none !important; outline: none !important; }',
          })
          await assert.rejects(
            () =>
              assertVisibleInputFocusRingNotClipped(
                page,
                'login-invalid-compact-focus'
              ),
            /输入控件焦点环应在控件内部完整绘制/u
          )
        } finally {
          await brokenFocusStyle?.evaluate((node) => node.remove())
          await compact.evaluate((node, style) => {
            if (style === null) node.removeAttribute('style')
            else node.setAttribute('style', style)
          }, initialStyle)
        }
      },
    },
    {
      name: 'admin-login-mobile-source-desktop-choice',
      path: '/m/sales/tasks',
      expectPath: '/admin-login',
      mockAdminRpc: true,
      customerKey: 'yoyoosun',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1280, height: 800 },
      verify: async (page) => {
        await expectHeading(page, '毛绒玩具管理系统')
        await page.getByText('电脑版', { exact: true }).click()
        await page.getByLabel('账号').fill('style-l1-admin')
        await page.locator('#password').fill('style-l1-password')
        await page.getByRole('button', { name: /^登\s*录$/ }).click()
        await waitForPath(page, '/erp/dashboard')
        await expectHeading(page, '工作台')

        const rememberedEntry = await page.evaluate(() =>
          window.localStorage.getItem('erp:last_entry_target')
        )
        assert.equal(
          rememberedEntry,
          'desktop',
          '从任务端来源手动选择后台登录后，应记住后台入口'
        )
      },
    },
    {
      name: 'entry-multi-role-login-direct',
      path: '/admin-login',
      mockAdminRpc: true,
      customerKey: 'yoyoosun',
      adminProfile: multiMobileRoleAdminProfile,
      effectiveSession: multiMobileRoleEffectiveSession,
      viewport: { width: 390, height: 844 },
      beforeNavigate: async (page) => {
        await page.addInitScript(() => {
          const roleButtonLabels = new Set([
            '老板手机待办',
            '业务手机待办',
            '采购手机待办',
            '生产手机待办',
            '生产经理手机待办',
            '仓库手机待办',
            '财务手机待办',
            'PMC手机待办',
            '品质手机待办',
            '工程手机待办',
          ])
          const evidence = {
            maxEntryButtonCount: 0,
            sawRoleButton: false,
            sawRolePrompt: false,
          }
          window.__entryRoutingEvidence = evidence
          const collect = () => {
            const entryButtons = Array.from(
              document.querySelectorAll('.erp-entry-card__button')
            )
            evidence.maxEntryButtonCount = Math.max(
              evidence.maxEntryButtonCount,
              entryButtons.length
            )
            evidence.sawRoleButton ||= entryButtons.some((button) =>
              roleButtonLabels.has(
                String(button.textContent || '')
                  .replace(/\s+/gu, '')
                  .trim()
              )
            )
            evidence.sawRolePrompt ||=
              document.body?.innerText.includes(
                '请选择这次要处理的岗位待办'
              ) === true
          }
          new MutationObserver(collect).observe(document, {
            childList: true,
            subtree: true,
            characterData: true,
          })
          window.addEventListener('DOMContentLoaded', collect, { once: true })
        })
      },
      verify: async (page) => {
        await page.getByText('手机版', { exact: true }).click()
        await page.getByLabel('账号').fill('style-l1-sales-quality')
        await page.locator('#password').fill('style-l1-password')
        await page.getByRole('button', { name: /^登\s*录$/u }).click()
        await waitForPath(page, '/m/sales/tasks')
        await expectText(page, '待办')

        const evidence = await page.evaluate(
          () => window.__entryRoutingEvidence || null
        )
        assert.deepEqual(
          evidence,
          {
            maxEntryButtonCount: 0,
            sawRoleButton: false,
            sawRolePrompt: false,
          },
          `多岗位登录不应经过岗位选择页: ${JSON.stringify(evidence)}`
        )
        assert.equal(
          await page.locator('.erp-entry-card').count(),
          0,
          '多岗位登录完成后不应停留在入口选择卡片'
        )
      },
    },
    {
      name: 'demo-boss-symmetric-work-entry-switch',
      path: '/m/boss/tasks',
      auth: 'admin',
      customerKey: 'yoyoosun',
      adminProfile: customerRoleAdminProfile('boss', 'demo_boss'),
      effectiveSession: customerRoleRuntimeSession(
        ['boss'],
        'style-l1-demo-boss-mobile-desktop-entry'
      ),
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        await page.waitForFunction(
          () =>
            Boolean(
              document.querySelector('.mobile-role-tasks-page') ||
              document.querySelector(
                '[data-mobile-customer-runtime-guard="true"]'
              )
            ),
          null,
          { timeout: 10_000 }
        )
        const entryEvidence = await page.evaluate(() => ({
          path: window.location.pathname,
          text: String(document.body?.innerText || '')
            .replace(/\s+/gu, ' ')
            .trim()
            .slice(0, 600),
          storedMenus: JSON.parse(
            window.localStorage.getItem('admin_menus') || '[]'
          ).map((item) => item?.path || item),
          buttonLabels: Array.from(document.querySelectorAll('button')).map(
            (button) =>
              String(
                button.getAttribute('aria-label') || button.textContent || ''
              )
                .replace(/\s+/gu, '')
                .trim()
          ),
        }))
        assert.equal(
          await page.locator('.mobile-role-tasks-page').count(),
          1,
          `demo_boss 应进入老板手机待办: ${JSON.stringify(entryEvidence)}`
        )
        assert.equal(
          await page.getByTestId('mobile-role-desktop-entry').count(),
          0,
          `demo_boss 页头不应重复显示工作入口切换: ${JSON.stringify(entryEvidence)}`
        )
        await page.getByTestId('mobile-role-nav-mine').click()
        const mobileEntrySwitch = page.getByTestId(
          'mobile-role-work-entry-switch'
        )
        await mobileEntrySwitch.waitFor({ state: 'visible', timeout: 10_000 })
        const mobileMetrics = await mobileEntrySwitch.evaluate((node) => {
          const rect = node.getBoundingClientRect()
          return {
            width: rect.width,
            height: rect.height,
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
          }
        })
        assert(
          mobileMetrics.width >= 280 &&
            mobileMetrics.height >= 44 &&
            mobileMetrics.scrollWidth <= mobileMetrics.clientWidth + 1,
          `老板手机待办的工作入口切换尺寸或横向布局异常: ${JSON.stringify(mobileMetrics)}`
        )
        await page.screenshot({
          path: path.resolve(
            outputDir,
            'demo-boss-symmetric-work-entry-switch-mobile.png'
          ),
          fullPage: true,
        })
        await mobileEntrySwitch.click()
        await waitForPath(page, '/entry')
        await page
          .locator('.erp-entry-card')
          .waitFor({ state: 'visible', timeout: 10_000 })
        const entrySelectorEvidence = await page.evaluate(() => ({
          path: window.location.pathname,
          text: String(document.body?.innerText || '')
            .replace(/\s+/gu, ' ')
            .trim(),
          storedMenus: JSON.parse(
            window.localStorage.getItem('admin_menus') || '[]'
          ).map((item) => item?.path || item),
          buttons: Array.from(document.querySelectorAll('button')).map(
            (button) =>
              String(button.textContent || '')
                .replace(/\s+/gu, '')
                .trim()
          ),
        }))
        const desktopEntry = page
          .locator('.erp-entry-card__button')
          .filter({ hasText: '电脑端' })
        assert.equal(
          await desktopEntry.count(),
          1,
          `统一入口页应保留电脑端入口: ${JSON.stringify(entrySelectorEvidence)}`
        )
        await desktopEntry.click()
        await waitForPath(page, '/erp/dashboard')
        await page.setViewportSize({ width: 1440, height: 900 })
        await expectHeading(page, '工作台')
        assert.equal(
          await page.evaluate(() =>
            window.localStorage.getItem('erp:last_entry_target')
          ),
          'desktop'
        )
        assert.equal(
          await page.getByTestId('desktop-work-entry-switch').count(),
          0,
          '电脑端页头不应常驻展示低频工作入口切换'
        )
        const accountMenuTrigger = page.getByTestId(
          'desktop-account-menu-trigger'
        )
        await accountMenuTrigger.focus()
        await page.keyboard.press('Enter')
        const desktopSystemVersionEntry = page.getByTestId(
          'desktop-system-version-entry'
        )
        await desktopSystemVersionEntry.waitFor({
          state: 'visible',
          timeout: 10_000,
        })
        await desktopSystemVersionEntry.click()
        const systemVersionModal = page.getByTestId('system-version-modal')
        await systemVersionModal.waitFor({ state: 'visible', timeout: 10_000 })
        const systemVersionDialog = page
          .locator('.ant-modal')
          .filter({ has: systemVersionModal })
        await systemVersionDialog.waitFor({
          state: 'visible',
          timeout: 10_000,
        })
        const systemVersionDialogHandle =
          await systemVersionDialog.elementHandle()
        assert(
          systemVersionDialogHandle,
          '系统信息弹窗缺少可等待动画结束的外层节点'
        )
        try {
          await page.waitForFunction(
            (node) => {
              if (!(node instanceof HTMLElement) || !node.isConnected) {
                return false
              }
              const className = String(node.className || '')
              return (
                !className.includes('ant-zoom-enter') &&
                !className.includes('ant-zoom-appear')
              )
            },
            systemVersionDialogHandle,
            { timeout: 10_000 }
          )
        } finally {
          await systemVersionDialogHandle.dispose()
        }
        await expectText(page, 'yoyoosun-20260810-20c96d38-amd64')
        await expectText(page, '前后台版本一致')
        const versionModalMetrics = await systemVersionDialog.evaluate(
          (node) => {
            const rect = node.getBoundingClientRect()
            return {
              width: rect.width,
              height: rect.height,
              right: rect.right,
              viewportWidth: window.innerWidth,
              scrollWidth: document.documentElement.scrollWidth,
              clientWidth: document.documentElement.clientWidth,
            }
          }
        )
        assert(
          versionModalMetrics.width >= 480 &&
            versionModalMetrics.height >= 260 &&
            versionModalMetrics.right <=
              versionModalMetrics.viewportWidth + 1 &&
            versionModalMetrics.scrollWidth <=
              versionModalMetrics.clientWidth + 1,
          `系统信息弹窗尺寸或横向布局异常: ${JSON.stringify(versionModalMetrics)}`
        )
        await page.screenshot({
          path: path.resolve(
            outputDir,
            'demo-boss-system-version-modal-desktop.png'
          ),
          fullPage: false,
        })
        const systemVersionCloseButton = systemVersionModal
          .locator('xpath=ancestor::div[contains(@class, "ant-modal-content")]')
          .locator('.ant-modal-footer button')
          .filter({ hasText: /关\s*闭/u })
        await systemVersionCloseButton.focus()
        await page.keyboard.press('Escape')
        await systemVersionModal.waitFor({ state: 'hidden', timeout: 10_000 })
        await accountMenuTrigger.click()
        const desktopEntrySwitch = page.getByTestId('desktop-work-entry-switch')
        await desktopEntrySwitch.waitFor({ state: 'visible', timeout: 10_000 })
        await expectText(page, '退出登录')
        await page.keyboard.press('Escape')
        await desktopEntrySwitch.waitFor({ state: 'hidden', timeout: 10_000 })
        assert.equal(
          await accountMenuTrigger.evaluate(
            (node) => document.activeElement === node
          ),
          true,
          '账号菜单关闭后应把焦点还给触发按钮'
        )
        await accountMenuTrigger.click()
        await desktopEntrySwitch.waitFor({ state: 'visible', timeout: 10_000 })
        await page.waitForFunction(
          () => {
            const switchLabel = document.querySelector(
              '[data-testid="desktop-work-entry-switch"]'
            )
            const popup = switchLabel?.closest('.ant-dropdown')
            return (
              popup &&
              Number.parseFloat(getComputedStyle(popup).opacity) >= 0.99
            )
          },
          undefined,
          { timeout: 10_000 }
        )
        const desktopMetrics = await desktopEntrySwitch.evaluate((node) => {
          const menuItem = node.closest('[role="menuitem"]')
          const rect = menuItem?.getBoundingClientRect()
          const triggerRect = document
            .querySelector('[data-testid="desktop-account-menu-trigger"]')
            ?.getBoundingClientRect()
          return {
            menuItemWidth: rect?.width || 0,
            menuItemHeight: rect?.height || 0,
            triggerWidth: triggerRect?.width || 0,
            triggerHeight: triggerRect?.height || 0,
            triggerRight: triggerRect?.right || 0,
            viewportWidth: window.innerWidth,
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
          }
        })
        assert(
          desktopMetrics.menuItemWidth >= 120 &&
            desktopMetrics.menuItemHeight >= 31.5 &&
            desktopMetrics.triggerWidth >= 100 &&
            desktopMetrics.triggerHeight >= 32 &&
            desktopMetrics.triggerRight <= desktopMetrics.viewportWidth + 1 &&
            desktopMetrics.scrollWidth <= desktopMetrics.clientWidth + 1,
          `电脑端账号菜单尺寸或布局异常: ${JSON.stringify(desktopMetrics)}`
        )
        await page.screenshot({
          path: path.resolve(
            outputDir,
            'demo-boss-symmetric-work-entry-switch-desktop.png'
          ),
          fullPage: false,
        })
        await desktopEntrySwitch.click()
        await waitForPath(page, '/entry')
        await page.setViewportSize({ width: 390, height: 844 })
        await page
          .locator('.erp-entry-card')
          .waitFor({ state: 'visible', timeout: 10_000 })
        await page
          .locator('.erp-entry-card__button')
          .filter({ hasText: '手机待办' })
          .click()
        await waitForPath(page, '/m/boss/tasks')
        await expectText(page, '待办')
        assert.equal(
          await page.evaluate(() =>
            window.localStorage.getItem('erp:last_entry_target')
          ),
          'mobileTasks'
        )
      },
    },
    {
      name: 'admin-only-mobile-login-global-review',
      path: '/admin-login',
      mockAdminRpc: true,
      customerKey: 'yoyoosun',
      adminProfile: adminOnlySuperProfile,
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        await page.getByText('手机版', { exact: true }).click()
        await page.getByLabel('账号').fill('style-l1-admin-only')
        await page.locator('#password').fill('style-l1-password')
        await page.getByRole('button', { name: /^登\s*录$/u }).click()
        await waitForPath(page, '/m/all/tasks')
        await expectText(page, '全部岗位')
        await expectText(page, '管理员视角')
        await page.locator('.mobile-admin-review .ant-select-selector').click()
        await page.locator('.ant-select-item-option').filter({ hasText: '仓库' }).click()
        await waitForPath(page, '/m/warehouse/tasks')
        await expectText(page, '管理员视角')
        await page.reload()
        await expectText(page, '管理员视角')
        await waitForPath(page, '/m/warehouse/tasks')
      },
    },
    {
      name: 'admin-only-mobile-deep-link-review',
      path: '/m/boss/tasks',
      auth: 'admin',
      adminProfile: adminOnlySuperProfile,
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        await expectText(page, '管理员视角')
        await waitForPath(page, '/m/boss/tasks')
        await page.locator('.mobile-admin-review .ant-select-selector').click()
        await page.locator('.ant-select-item-option').filter({ hasText: '全部岗位' }).click()
        await waitForPath(page, '/m/all/tasks')
      },
    },
    {
      name: 'ordinary-admin-mobile-global-review-denied',
      path: '/m/all/tasks',
      auth: 'admin',
      adminProfile: { ...adminOnlySuperProfile, is_super_admin: false, permissions: ['system.user.read'] },
      effectiveSession: { ...customerRuntimeEffectiveSession, roles: ['admin'], actions: ['system.user.read'] },
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        await page.waitForURL(
          (url) =>
            url.pathname === '/entry' &&
            url.searchParams.get('reason') === 'mobile-role-unassigned',
          { timeout: 10_000 }
        )
        await expectText(page, '当前账号未分配业务岗位')
        await expectButton(page, '电脑端')
        await expectButton(page, '退出登录')
        await expectNoButton(page, '手机待办')
        await assertTextAbsent(page, '老板手机待办')
      },
    },
    {
      name: 'entry-recovery-actions-mobile',
      path: '/entry?reason=mobile-runtime-unavailable',
      auth: 'admin',
      mockAdminRpc: true,
      adminProfile: multiMobileRoleAdminProfile,
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        await expectText(page, '手机待办暂时无法连接')
        await expectButton(page, '电脑端')
        await expectButton(page, '手机待办')
        await expectButton(page, '退出登录')

        const metrics = await page.evaluate(() => {
          const card = document.querySelector('.erp-entry-card')
          const entryButtons = Array.from(
            document.querySelectorAll('.erp-entry-card__button')
          )
          const allButtons = Array.from(
            document.querySelectorAll('.erp-entry-card button')
          )
          const rectFor = (node) => {
            const rect = node.getBoundingClientRect()
            return {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
              right: rect.right,
              bottom: rect.bottom,
            }
          }
          return {
            viewport: { width: window.innerWidth, height: window.innerHeight },
            documentWidth: {
              client: document.documentElement.clientWidth,
              scroll: document.documentElement.scrollWidth,
            },
            card: card ? rectFor(card) : null,
            entryButtons: entryButtons.map((button) => ({
              text: String(button.textContent || '')
                .replace(/\s+/gu, '')
                .trim(),
              ...rectFor(button),
            })),
            allButtonTexts: allButtons.map((button) =>
              String(button.textContent || '')
                .replace(/\s+/gu, '')
                .trim()
            ),
          }
        })

        assert.deepEqual(
          metrics.allButtonTexts,
          ['电脑端', '手机待办', '退出登录'],
          `恢复页只应提供工作方式和退出登录: ${JSON.stringify(metrics)}`
        )
        assert.equal(
          metrics.entryButtons.length,
          2,
          `恢复页应只有两个工作入口按钮: ${JSON.stringify(metrics)}`
        )
        assert(
          metrics.entryButtons.every(
            (button) =>
              button.height >= 56 &&
              Math.abs(button.width - metrics.entryButtons[0].width) <= 1
          ),
          `工作入口按钮应等宽且保持触控高度: ${JSON.stringify(metrics)}`
        )
        assert(
          metrics.card &&
            metrics.card.x >= 0 &&
            metrics.card.y >= 0 &&
            metrics.card.right <= metrics.viewport.width + 1 &&
            metrics.card.bottom <= metrics.viewport.height + 1,
          `入口卡片应完整位于手机视口内: ${JSON.stringify(metrics)}`
        )
        assert(
          metrics.documentWidth.scroll <= metrics.documentWidth.client + 1,
          `入口恢复页不应横向溢出: ${JSON.stringify(metrics)}`
        )
        assert.equal(
          await page
            .getByRole('button', {
              name: /^(老板|业务|采购|生产|生产经理|仓库|财务|PMC|品质|工程)手机待办$/u,
            })
            .count(),
          0,
          '恢复页不应展示任何角色命名的岗位按钮'
        )
        await page.locator('.erp-entry-card').screenshot({
          path: path.join(outputDir, 'entry-recovery-actions-mobile-card.png'),
        })
      },
    },
    {
      name: 'app-alert-dialog-keyboard-contract',
      path: '/admin-login',
      mockAdminRpc: true,
      viewport: { width: 1280, height: 800 },
      verify: async (page) => {
        await expectHeading(page, '毛绒玩具管理系统')
        const focusOrigin = page
          .getByRole('button', { name: /^登\s*录$/ })
          .first()
        await focusOrigin.focus()
        await page.evaluate(async () => {
          const { appAlert } =
            await import('../../../../../../../src/common/components/modal/alertBridge.js')
          appAlert({
            title: '登录状态已失效',
            message: '请先登录',
            confirmText: '重新登录',
          })
        })
        await assertAppAlertDialogLayout(page, {
          scenarioName: 'app-alert-dialog-keyboard-contract',
          exerciseEscape: true,
        })
        assert.equal(
          await focusOrigin.evaluate((node) => document.activeElement === node),
          true,
          '通用提示弹窗通过 Escape 关闭后，焦点应回到打开前的控件'
        )

        await page.evaluate(async () => {
          const { appAlert } =
            await import('../../../../../../../src/common/components/modal/alertBridge.js')
          window.__appAlertConfirmCount = 0
          appAlert({
            title: '登录状态已失效',
            message: '请先登录',
            confirmText: '重新登录',
            onConfirm: () => {
              window.__appAlertConfirmCount += 1
            },
          })
        })
        await assertAppAlertDialogLayout(page, {
          scenarioName: 'app-alert-dialog-keyboard-contract-reopened',
        })
        await page.screenshot({
          path: path.resolve(
            outputDir,
            'app-alert-dialog-keyboard-contract-open.png'
          ),
          fullPage: true,
        })
        await page
          .getByRole('button', { name: '重新登录' })
          .evaluate((button) => {
            button.click()
            button.click()
          })
        await page
          .getByRole('alertdialog')
          .waitFor({ state: 'hidden', timeout: 10_000 })
        await page.waitForFunction(
          () => {
            const appRoot = document.getElementById('root')
            return (
              appRoot &&
              !appRoot.hasAttribute('inert') &&
              !appRoot.hasAttribute('aria-hidden')
            )
          },
          undefined,
          { timeout: 10_000 }
        )
        assert.equal(
          await page.evaluate(() => window.__appAlertConfirmCount),
          1,
          '通用提示弹窗的确认动作必须防止快速重复提交'
        )
        assert.equal(
          await focusOrigin.evaluate((node) => document.activeElement === node),
          true,
          '通用提示弹窗确认关闭后，焦点应回到打开前的控件'
        )
      },
    },
    {
      name: 'auth-expired-alert-mobile',
      path: '/erp/dashboard',
      auth: 'admin-expired',
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        await expectText(page, '登录状态已失效')
        await expectButton(page, /重新登录/)
        await assertAppAlertDialogLayout(page, {
          scenarioName: 'auth-expired-alert-mobile',
        })
        await page.screenshot({
          path: path.resolve(outputDir, 'auth-expired-alert-mobile-open.png'),
          fullPage: true,
        })
        await page.getByRole('button', { name: '重新登录' }).click()
        await waitForPath(page, '/admin-login')
        await expectHeading(page, '毛绒玩具管理系统')
      },
    },
    {
      name: 'auth-disabled-alert-desktop',
      path: '/erp/dashboard',
      auth: 'admin-disabled',
      viewport: { width: 1280, height: 800 },
      verify: async (page) => {
        await expectText(page, '登录状态已失效')
        await expectText(page, '账号已停用')
        await expectButton(page, /重新登录/)
        await assertAppAlertDialogLayout(page, {
          scenarioName: 'auth-disabled-alert-desktop',
          expectedMessage: '账号已停用',
        })
        await assertTextAbsent(page, '今日焦点')
        await assertTextAbsent(page, '待我处理')
        await page.getByRole('button', { name: '重新登录' }).click()
        await waitForPath(page, '/admin-login')
        await expectHeading(page, '毛绒玩具管理系统')
      },
    },
    {
      name: 'auth-disabled-alert-mobile-dark',
      path: '/erp/dashboard',
      auth: 'admin-disabled',
      themeMode: 'dark',
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        await expectText(page, '登录状态已失效')
        await expectText(page, '账号已停用')
        await expectButton(page, /重新登录/)
        await assertAppAlertDialogLayout(page, {
          scenarioName: 'auth-disabled-alert-mobile-dark',
          expectedMessage: '账号已停用',
        })
        await page.screenshot({
          path: path.resolve(
            outputDir,
            'auth-disabled-alert-mobile-dark-open.png'
          ),
          fullPage: true,
        })
        await assertTextAbsent(page, '今日焦点')
        await assertTextAbsent(page, '待我处理')
        await page.getByRole('button', { name: '重新登录' }).click()
        await waitForPath(page, '/admin-login')
        await expectHeading(page, '毛绒玩具管理系统')
      },
    },
  ]
}
