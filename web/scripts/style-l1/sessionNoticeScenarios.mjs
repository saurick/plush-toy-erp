import assert from 'node:assert/strict'
import path from 'node:path'

export function createSessionNoticeScenarios({
  customerRuntimeEffectiveSession,
  outputDir,
}) {
  return [
    {
      name: 'desktop-dark',
      mobile: false,
      width: 1440,
      height: 900,
      theme: 'dark',
    },
    {
      name: 'desktop-narrow',
      mobile: false,
      width: 390,
      height: 844,
      theme: 'light',
    },
    {
      name: 'mobile-dark',
      mobile: true,
      width: 390,
      height: 844,
      theme: 'dark',
    },
    {
      name: 'mobile-small',
      mobile: true,
      width: 320,
      height: 640,
      theme: 'light',
    },
    {
      name: 'entry',
      entry: true,
      width: 390,
      height: 844,
      theme: 'light',
    },
  ].map(({ name: variant, mobile, entry, width, height, theme }) => {
    const name = `session-notice-${variant}`
    let failure = 'all'
    let acknowledgements = 0
    return {
      name,
      path: entry
        ? '/entry'
        : mobile
          ? '/m/boss/tasks'
          : '/erp/business-dashboard',
      auth: 'admin',
      themeMode: theme,
      viewport: { width, height },
      effectiveSession: customerRuntimeEffectiveSession,
      ...(mobile
        ? {
            adminProfile: {
              username: 'style-l1-notice-boss',
              is_super_admin: false,
              roles: [{ role_key: 'boss', name: '负责人' }],
              permissions: ['mobile.boss.access', 'workflow.task.read'],
              menus: [],
            },
          }
        : {}),
      expectedConsoleErrorPatterns: [/Failed to load resource:.*503/u],
      beforeNavigate: async (page) => {
        failure = entry ? 'notice' : 'all'
        acknowledgements = 0
        await page.route('**/rpc/admin', async (route) => {
          const { id, method } = route.request().postDataJSON()
          if (method === 'acknowledge_legal_notice') acknowledgements += 1
          if (
            (failure === 'all' && method === 'me') ||
            (failure && method === 'legal_notice_status')
          ) {
            await route.fulfill({
              status: 503,
              json: {
                jsonrpc: '2.0',
                id,
                error: { code: 503, message: 'Service unavailable' },
              },
            })
            return
          }
          if (method === 'legal_notice_status') {
            await route.fulfill({
              json: {
                jsonrpc: '2.0',
                id,
                result: {
                  code: 0,
                  data: { acknowledged: acknowledgements > 0 },
                },
              },
            })
            return
          }
          await route.fallback()
        })
      },
      verify: async (page) => {
        const boundary = page.locator(
          mobile
            ? '[data-mobile-customer-runtime-guard="true"]'
            : '[data-customer-runtime-boundary="true"]'
        )
        const notice = page.locator('.legal-notice-status-banner')
        if (!entry) {
          await boundary.waitFor({ state: 'visible' })
          await page.screenshot({
            path: path.join(outputDir, `${name}-offline.png`),
            fullPage: true,
          })
          assert.equal(
            await notice.count(),
            0,
            '主故障页不应再叠加规则核对提示'
          )
          assert.equal(
            await page.locator('.legal-notice-gate-modal:visible').count(),
            0
          )
          failure = 'notice'
          await boundary
            .getByRole('button', {
              name: mobile ? '重新连接' : '重试',
              exact: true,
            })
            .click()
          await boundary.waitFor({ state: 'hidden' })
        }
        await notice.waitFor({ state: 'visible' })
        const geometry = await notice.evaluate((node) => {
          const box = node.getBoundingClientRect()
          const root = node.closest(
            '.mobile-app-layout, .erp-admin-content, .erp-entry-card'
          )
          const content = root?.querySelector(
            '.mobile-role-tasks-page, .erp-admin-outlet, .erp-login-logo'
          )
          const contentBox = content?.getBoundingClientRect()
          const controls = [...node.querySelectorAll('a, button')].map(
            (control) => {
              const rect = control.getBoundingClientRect()
              return {
                left: rect.left,
                right: rect.right,
                top: rect.top,
                bottom: rect.bottom,
              }
            }
          )
          return {
            position: getComputedStyle(node).position,
            left: box.left,
            right: box.right,
            bottom: box.bottom,
            contentTop: contentBox?.top,
            controls,
            viewportWidth: innerWidth,
            viewportHeight: innerHeight,
            bottomNavBottom: root
              ?.querySelector('.mobile-role-bottom-nav')
              ?.getBoundingClientRect().bottom,
            overflow: node.scrollWidth - node.clientWidth,
          }
        })
        assert.equal(geometry.position, 'static', JSON.stringify(geometry))
        assert(geometry.bottom <= geometry.contentTop, JSON.stringify(geometry))
        assert(geometry.left >= 0 && geometry.right <= geometry.viewportWidth)
        assert(geometry.overflow <= 1)
        if (mobile) {
          assert(
            geometry.bottomNavBottom <= geometry.viewportHeight,
            JSON.stringify(geometry)
          )
        }
        for (const control of geometry.controls) {
          assert(
            control.left >= geometry.left && control.right <= geometry.right,
            JSON.stringify(geometry)
          )
        }
        await page.screenshot({
          path: path.join(outputDir, `${name}-notice.png`),
          fullPage: true,
        })
        await notice
          .getByRole('button', { name: '重新核对', exact: true })
          .click()
        await notice.waitFor({ state: 'visible' })
        assert.equal(acknowledgements, 0)
        failure = ''
        await notice
          .getByRole('button', { name: '重新核对', exact: true })
          .click()
        const modal = page.locator('.legal-notice-gate-modal')
        await modal.waitFor({ state: 'visible' })
        assert.equal(acknowledgements, 0, '核对恢复不能伪造已知悉')
        await modal
          .getByRole('button', { name: '我已阅读并知悉', exact: true })
          .click()
        await modal.waitFor({ state: 'hidden' })
        assert.equal(acknowledgements, 1)
        assert.equal(await notice.count(), 0)
      },
    }
  })
}
