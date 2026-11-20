import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { getNavigationSections } from '../../src/erp/config/seedData.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'

const entries = [
  ...getNavigationSections()
    .flatMap((section) => section.items)
    .filter((item) => item.sidebarVisible !== false),
  { key: 'production-execution', path: '/erp/production/progress?display=process' },
  { key: 'production-exceptions', path: '/erp/production/exceptions' },
  { key: 'history', path: '/erp/history' },
  { key: 'help', path: '/erp/help-center' },
]
const narrowKeys = new Set([
  'global-dashboard', 'task-board', 'business-dashboard', 'customers',
  'sales-orders', 'production-execution', 'production-exceptions',
  'finance-payments', 'help',
])

export function createCompactPageScenarios({
  customerRuntimeEffectiveSession,
  gotoScenarioPath,
  assertNoHorizontalOverflow,
  outputDir,
}) {
  const scenarios = [
    {
      name: 'desktop-compact-layout-all-pages',
      themeMode: 'light',
      width: 1440,
      pages: entries,
    },
    {
      name: 'desktop-compact-layout-narrow-dark',
      themeMode: 'dark',
      width: 1024,
      pages: entries.filter((item) => narrowKeys.has(item.key)),
    },
  ].map(({ name, themeMode, width, pages }) => ({
    name,
    path: pages[0].path,
    auth: 'admin',
    themeMode,
    productionOrderReleased: true,
    effectiveSession: customerRuntimeEffectiveSession,
    viewport: { width, height: 900 },
    verify: async (page) => {
      const measurements = []
      for (const entry of pages) {
        const url = new URL(page.url())
        if (url.pathname + url.search !== entry.path) {
          await gotoScenarioPath(page, entry.path, {
            waitUntil: 'domcontentloaded',
          })
        }
        await page.locator('.erp-admin-content').getByRole('heading').first().waitFor()
        assert.equal(
          new URL(page.url()).pathname,
          entry.path.split('?')[0],
          `${entry.key}: 核对真实入口`
        )
        await waitForFiniteAnimations(page)
        const geometry = await page.locator('.erp-admin-content').evaluate((content) => {
          const style = getComputedStyle(content)
          const headers = [...content.querySelectorAll('.erp-business-page-header-card')]
            .filter((node) => node.getBoundingClientRect().height > 0)
          return {
            padding: style.padding,
            gap: style.rowGap,
            headers: headers.map((header) => ({
              height: header.getBoundingClientRect().height,
              marginBottom: getComputedStyle(header).marginBottom,
              module: header.classList.contains('erp-business-module-header'),
            })),
            controls: [...content.querySelectorAll('.erp-business-operation-panel__search > .ant-input-affix-wrapper')]
              .map((node) => node.getBoundingClientRect().height),
          }
        })
        assert.equal(geometry.padding, '8px', `${entry.key}: 共用紧凑页面边距`)
        assert.equal(geometry.gap, '6px', `${entry.key}: 共用页面间隔`)
        if (width >= 1280) {
          assert.ok(
            geometry.headers.every((header) => header.height <= 54),
            `${entry.key}: 页头紧凑 ${JSON.stringify(geometry)}`
          )
        }
        assert.ok(
          geometry.headers.filter((header) => header.module)
            .every((header) => header.marginBottom === '0px'),
          `${entry.key}: 模块页头不重复叠加间距`
        )
        assert.ok(
          geometry.controls.every((height) => height >= 32 && height <= 36),
          `${entry.key}: 保留正常控件高度`
        )
        await assertNoHorizontalOverflow(page, `${name}-${entry.key}`)
        measurements.push({ key: entry.key, path: entry.path, ...geometry })
        if (['sales-orders', 'production-execution'].includes(entry.key)) {
          await page.screenshot({
            path: path.join(outputDir, `${name}-${entry.key}.png`),
          })
        }
      }
      assert.equal(measurements.length, pages.length)
      await writeFile(
        path.join(outputDir, `${name}-metrics.json`),
        JSON.stringify(measurements, null, 2)
      )
    },
  }))
  return [
    ...scenarios,
    {
      name: 'dev-ui-design-compact-spacing',
      path: '/__dev/ui-design?view=rationale',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await page.getByRole('tab', { name: '设计依据', exact: true }).click()
        await page.getByRole('navigation', { name: '设计阅读目录' })
          .getByRole('button', { name: '间距与密度', exact: true }).click()
        await page.getByRole('heading', { name: '为什么采用 8 px 的紧凑页面边距？' }).waitFor()
        const slider = page.getByRole('slider', { name: '对比页面边距' })
        await slider.focus()
        await slider.press('Home')
        assert.equal(await slider.getAttribute('aria-valuenow'), '4')
        await page.getByRole('button', { name: '对齐当前基准' }).click()
        assert.equal(await slider.getAttribute('aria-valuenow'), '8')
        const samples = await page.locator('.erp-design-spacing-page')
          .evaluateAll((nodes) => nodes.map((node) => getComputedStyle(node).paddingLeft))
        assert.deepEqual(samples, ['8px', '8px'])
        await assertNoHorizontalOverflow(page, 'dev-ui-design-compact-spacing')
      },
    },
  ]
}
