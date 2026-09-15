import assert from 'node:assert/strict'
import path from 'node:path'
import { createSessionNoticeScenarios } from './sessionNoticeScenarios.mjs'

export function createSessionRecoveryScenarios({
  customerRuntimeEffectiveSession,
  outputDir,
}) {
  const editorScenarios = ['light', 'dark'].map((themeMode) => {
    let offline = false
    const name = `erp-session-recovery-editor-${themeMode}`
    return {
      name,
      path: '/erp/master/partners/customers',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      themeMode,
      viewport:
        themeMode === 'dark'
          ? { width: 900, height: 700 }
          : { width: 1440, height: 900 },
      expectedConsoleErrorPatterns: [/Failed to load resource:.*503/u],
      beforeNavigate: async (page) => {
        offline = false
        await page.route('**/rpc/admin', async (route) => {
          const { id, method } = route.request().postDataJSON()
          if (!offline || method !== 'me') return route.fallback()
          await route.fulfill({
            status: 503,
            json: {
              jsonrpc: '2.0',
              id,
              error: { code: 503, message: 'Service unavailable' },
            },
          })
        })
      },
      verify: async (page) => {
        await page
          .getByRole('button', { name: '新建客户' })
          .click({ timeout: 8000 })
        const editor = page.locator('.erp-business-form-page:not([hidden])')
        const input = editor.getByLabel('名称', { exact: true })
        await input.fill('断连恢复验证：未保存的客户名称')
        const draft = await input.inputValue()
        if (themeMode === 'light') {
          await editor
            .getByRole('button', { name: '返回列表', exact: true })
            .click()
          await page
            .getByRole('button', { name: '继续编辑', exact: true })
            .waitFor()
        }

        offline = true
        await page.evaluate(() =>
          document.dispatchEvent(new Event('visibilitychange'))
        )
        const dialog = page.locator('.erp-session-recovery-dialog')
        await dialog.waitFor({ state: 'visible' })
        await page.keyboard.press('Escape')
        await page.keyboard.press('Tab')
        const metrics = await dialog.evaluate((node) => {
          const rect = node.getBoundingClientRect()
          return {
            modal: node.matches(':modal'),
            focusInside: node.contains(document.activeElement),
            width: rect.width,
            height: rect.height,
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
            viewportWidth: innerWidth,
            viewportHeight: innerHeight,
            overflow: node.scrollWidth - node.clientWidth,
            backdrop: getComputedStyle(node, '::backdrop').backgroundColor,
          }
        })
        await page.screenshot({
          path: path.join(outputDir, `${name}-offline.png`),
          fullPage: true,
        })
        assert.equal(metrics.modal, true, JSON.stringify(metrics))
        assert.equal(metrics.focusInside, true, JSON.stringify(metrics))
        assert(metrics.width > 0 && metrics.height > 0)
        assert(metrics.left >= 0 && metrics.right <= metrics.viewportWidth)
        assert(metrics.top >= 0 && metrics.bottom <= metrics.viewportHeight)
        assert(metrics.overflow <= 1)
        assert.notEqual(metrics.backdrop, 'rgba(0, 0, 0, 0)')
        assert.equal(await input.inputValue(), draft)
        if (themeMode === 'light') {
          await assert.rejects(
            page
              .getByRole('button', { name: '放弃修改', exact: true })
              .click({ timeout: 400 }),
            /Timeout/u
          )
          assert.equal(await input.inputValue(), draft)
        }
        offline = false
        await dialog.getByRole('button', { name: '重试', exact: true }).click()
        await dialog.waitFor({ state: 'hidden' })
        if (themeMode === 'light') {
          await page
            .getByRole('button', { name: '继续编辑', exact: true })
            .click()
        }
        assert.equal(await input.inputValue(), draft)
        await input.fill(`${draft}，恢复后继续编辑`)
        assert.equal(await input.inputValue(), `${draft}，恢复后继续编辑`)
        await input.focus()
        assert.equal(
          await input.evaluate((node) => document.activeElement === node),
          true
        )
        await page.screenshot({
          path: path.join(outputDir, `${name}-recovered.png`),
          fullPage: true,
        })
        await editor
          .getByRole('button', { name: '返回列表', exact: true })
          .click()
        await page
          .getByRole('button', { name: '放弃修改', exact: true })
          .click()
        await editor.waitFor({ state: 'hidden' })
      },
    }
  })
  return [
    ...editorScenarios,
    ...createSessionNoticeScenarios({
      customerRuntimeEffectiveSession,
      outputDir,
    }),
  ]
}
