import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { ERP_ACCENTS, WORKBENCH_APPEARANCE_STORAGE_KEY } from '../../src/common/theme/erpAppearance.mjs'
import { DEV_WORKSPACE_NAV_ITEMS, DEV_SECONDARY_NAV_ITEMS, DEV_VERSION_GUIDE_ROUTE } from '../../src/dev-workbench/config/devRoutes.mjs'
import { renderWorkbenchLoginPage, WORKBENCH_LOGIN_CONTENT_SECURITY_POLICY } from '../../dev-server/workbenchLoginPage.mjs'
import { selectAppearance, assertPaint } from './devWorkbenchThemeScenarios.mjs'
import { assertReadableOnBackground } from './colorAssertions.mjs'
import { assertMermaidEdgeLabelContrast, switchMermaidLayout } from './mermaidViewerAssertions.mjs'
import { installIntegrationWorkspaceMock } from './devProjectGraphAssertions.mjs'
import { installDatabaseMigrationFixture } from './devDeliveryWorkspaceScenarios.mjs'
import { installDeliverySummaryRoute } from './devVersionCenterScenarios.mjs'
import { createDataPreparationBrowserFixture, installDataPreparationBrowserRoutes } from './devDataPreparationScenarios.mjs'

const graphPath = '/__dev/development-resources?view=relationships'
const viewport = { width: 1920, height: 1080 }

async function installReadFixtures(page) {
  await installIntegrationWorkspaceMock(page)
  await installDatabaseMigrationFixture(page)
  await installDeliverySummaryRoute(page)
  await installDataPreparationBrowserRoutes(page, createDataPreparationBrowserFixture())
}

export function createDevWorkbenchThemeAuditScenarios({ assertNoHorizontalOverflow, outputDir }) {
  return [
    {
      name: 'dev-workbench-accent-route-audit',
      path: '/__dev',
      viewport,
      deviceScaleFactor: 2,
      beforeNavigate: installReadFixtures,
      verify: async (page) => {
        const origin = page.url()
        const routes = [...new Set([
          ...DEV_WORKSPACE_NAV_ITEMS.map(({ route }) => route),
          ...DEV_SECONDARY_NAV_ITEMS.map(({ route }) => route),
          DEV_VERSION_GUIDE_ROUTE,
          graphPath,
          '/__dev/testing?view=commands',
          '/__dev/customer-config?view=assets',
          '/__dev/ui-design?page=controls',
          '/__dev/ui-design?view=rationale&topic=dialogs&read=guide',
        ])]
        const evidence = []
        for (const mode of ['light', 'dark']) {
          for (const accent of ['blue', 'pink']) {
            await selectAppearance(page, mode, accent)
            for (const route of routes) {
              const result = { route, mode, accent, status: 'loading' }
              evidence.push(result)
              await writeFile(`${outputDir}/workbench-accent-route-audit.json`, JSON.stringify(evidence, null, 2))
              await page.goto(new URL(route, origin).href)
              await page.getByRole('heading', { level: 1 }).first().waitFor()
              await page.waitForFunction(({ mode, accent }) => document.documentElement.dataset.erpTheme === mode && document.documentElement.dataset.erpAccent === accent, { mode, accent })
              const tags = await page.locator('.erp-dev-accent-tag:visible').count()
              if (tags) await assertPaint(page, '.erp-dev-accent-tag:visible', { color: '--erp-primary-strong', backgroundColor: '--erp-primary-soft' })
              if (route === '/__dev/customer-config?view=assets') {
                await assertPaint(page, '.erp-dev-customer-brand-mark', { backgroundColor: '--erp-primary', color: '--erp-on-accent' })
              }
              if (route.includes('topic=dialogs')) {
                await assertPaint(page, '.erp-feedback-sketch-actions b', { backgroundColor: '--erp-primary', color: '--erp-on-accent' })
              }
              await assertNoHorizontalOverflow(page, `${route}/${mode}/${accent}`)
              Object.assign(result, { status: 'passed', themedTags: tags })
            }
          }
        }
        await writeFile(`${outputDir}/workbench-accent-route-audit.json`, JSON.stringify(evidence, null, 2))
        await page.goto(new URL(graphPath, origin).href)
      },
    },
    {
      name: 'dev-workbench-mermaid-accent',
      path: graphPath,
      viewport,
      deviceScaleFactor: 2,
      verify: async (page) => {
        const evidence = []
        for (const mode of ['light', 'dark']) {
          for (const accent of Object.keys(ERP_ACCENTS)) {
            await selectAppearance(page, mode, accent)
            const diagram = `[data-mermaid-status="rendered"][data-mermaid-theme="${mode}"][data-mermaid-accent="${accent}"]`
            await page.locator(diagram).waitFor()
            await assertPaint(page, `${diagram} g.node .label-container`, { stroke: '--erp-primary' })
            const labels = await assertMermaidEdgeLabelContrast(page.locator(diagram), assert)
            evidence.push({ mode, accent, labels: labels.length, minimumContrast: Math.min(...labels.map(({ ratio }) => ratio)) })
            await assertPaint(page, '[data-project-graph-classification]', { color: '--erp-primary-strong', backgroundColor: '--erp-primary-soft' })
            if (accent === 'blue') await page.screenshot({ path: `${outputDir}/mermaid-label-${mode}.png` })
          }
        }
        await page.getByRole('button', { name: '全屏查看项目关系图', exact: true }).click()
        await page.locator('.erp-markdown-mermaid--fullscreen').waitFor()
        await assertPaint(page, '.erp-markdown-mermaid--fullscreen g.node .label-container', { stroke: '--erp-primary' })
        const viewer = page.locator('.erp-markdown-mermaid')
        await assertMermaidEdgeLabelContrast(viewer, assert)
        await switchMermaidLayout(page, viewer, assert)
        await assertMermaidEdgeLabelContrast(viewer, assert)
        await page.getByRole('button', { name: '退出项目关系图全屏', exact: true }).click()
        await assertMermaidEdgeLabelContrast(viewer, assert)
        await writeFile(`${outputDir}/mermaid-label-contrast.json`, JSON.stringify(evidence, null, 2))
        await assertNoHorizontalOverflow(page, 'mermaid-accent-restored')
      },
    },
    {
      name: 'dev-workbench-login-accent',
      path: '/__dev/product-engineering',
      viewport,
      deviceScaleFactor: 2,
      beforeNavigate: async (page) => {
        await page.route('**/__dev/login', (route) => route.fulfill({
          contentType: 'text/html', headers: { 'content-security-policy': WORKBENCH_LOGIN_CONTENT_SECURITY_POLICY }, body: renderWorkbenchLoginPage('/__dev'),
        }))
        await page.route('**/favicon-dev.svg', (route) => route.fulfill({ contentType: 'image/svg+xml', body: readFileSync(new URL('../../src/dev-workbench/assets/favicon-dev.svg', import.meta.url)) }))
      },
      verify: async (page) => {
        const appURL = page.url()
        const loginURL = new URL('/__dev/login', appURL).href
        for (const mode of ['light', 'dark']) {
          for (const accent of Object.keys(ERP_ACCENTS)) {
            await selectAppearance(page, mode, accent)
            await page.goto(loginURL)
            await page.getByRole('heading', { name: '研发效能工作台', exact: true }).waitFor()
            assert.equal(await page.locator('html').getAttribute('data-erp-accent'), accent)
            assert.equal(await page.locator('html').getAttribute('data-erp-theme'), mode)
            await assertPaint(page, 'form button', { backgroundColor: '--erp-primary', color: '--erp-on-accent' })
            const paint = await page.locator('form button').evaluate((element) => ({ color: getComputedStyle(element).color, background: getComputedStyle(element).backgroundColor }))
            assertReadableOnBackground(paint.color, paint.background, `登录主按钮 ${mode}/${accent}`)
            await page.locator('form button').hover()
            await assertPaint(page, 'form button', { backgroundColor: '--erp-primary-hover' })
            await page.goto(appURL)
          }
        }
        await page.evaluate((key) => {
          localStorage.setItem('admin_erp_preferences', JSON.stringify({ appearance: { accent: 'pink', theme_mode: 'dark' } }))
          localStorage.setItem(key, 'invalid JSON')
        }, WORKBENCH_APPEARANCE_STORAGE_KEY)
        await page.goto(loginURL)
        assert.equal(await page.locator('html').getAttribute('data-erp-accent'), 'blue', '存储损坏回到工作台默认色，不读取 ERP 账号')
        for (const scheme of ['dark', 'light']) {
          await page.emulateMedia({ colorScheme: scheme })
          await page.waitForFunction((expected) => document.documentElement.dataset.erpTheme === expected, scheme)
        }
        const peer = await page.context().newPage()
        try {
          await peer.goto(appURL)
          await selectAppearance(peer, 'light', 'pink')
          await page.waitForFunction(() => document.documentElement.dataset.erpAccent === 'pink' && document.documentElement.dataset.erpThemeMode === 'light')
        } finally {
          await peer.close()
        }
        await page.reload()
        assert.equal(await page.locator('html').getAttribute('data-erp-accent'), 'pink', '登录页刷新恢复同源工作台偏好')
        await assertNoHorizontalOverflow(page, 'workbench-login-default')
      },
    },
  ]
}
