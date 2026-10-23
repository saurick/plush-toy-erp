import fs from 'node:fs/promises'
import { installPermissionRelationshipMock } from './permissionRelationshipScenarios.mjs'
import { createDataPreparationBrowserFixture, installDataPreparationBrowserRoutes } from './devDataPreparationScenarios.mjs'

async function geometry(summary) {
  return summary.evaluate((node) => {
    const box = node.getBoundingClientRect()
    const parent = node.parentElement
    const parentBox = parent.getBoundingClientRect()
    const style = getComputedStyle(node)
    const parentStyle = getComputedStyle(parent)
    return {
      x: box.x - parentBox.x,
      y: box.y - parentBox.y,
      width: box.width,
      height: box.height,
      available: parent.clientWidth - parseFloat(parentStyle.paddingLeft) - parseFloat(parentStyle.paddingRight),
      padding: style.padding,
      border: [style.borderTopWidth, style.borderBottomWidth],
      focus: document.activeElement === node,
      open: parent.open,
    }
  })
}

export async function assertDevDisclosureInteraction(page, summary, assert) {
  await summary.scrollIntoViewIfNeeded()
  const initial = await geometry(summary)
  const label = (await summary.innerText()).trim().slice(0, 80)
  assert(initial.height >= 38, `${label}标题触区至少 38px`)
  assert(Math.abs(initial.width - initial.available) <= 1, `${label}覆盖所属区域整行`)
  // 点击远离文字的右侧留白，避免仅验证原有的文字触区。
  await summary.click({ position: { x: initial.width - 8, y: initial.height / 2 } })
  const toggled = await geometry(summary)
  assert.equal(toggled.open, !initial.open, `${label}右侧留白可切换`)
  for (const key of ['x', 'y', 'width', 'height']) {
    assert(Math.abs(initial[key] - toggled[key]) <= 1, `${label}展开收起不改变标题 ${key}`)
  }
  assert.deepEqual(toggled.padding, initial.padding, `${label}内边距固定`)
  assert.deepEqual(toggled.border, initial.border, `${label}边框占位固定`)
  await summary.press('Enter')
  assert.equal((await geometry(summary)).open, initial.open, `${label}Enter 恢复原状态`)
  await summary.press('Space')
  assert.equal((await geometry(summary)).open, !initial.open, `${label}Space 切换`)
  await summary.press('Space')
  const restored = await geometry(summary)
  assert.equal(restored.open, initial.open, `${label}可再次收起或展开`)
  assert.equal(restored.focus, true, `${label}保留标题焦点`)
  return { label, ...initial }
}

export function createDevDisclosureScenarios({ assert, assertNoHorizontalOverflow, outputDir, path }) {
  return [{
    name: 'dev-disclosure-desktop-light',
    path: '/__dev/testing?view=coverage&coverage=gates&reportSource=snapshot',
    viewport: { width: 1440, height: 1000 },
    deviceScaleFactor: 2,
    beforeNavigate: async (page) => {
      await installPermissionRelationshipMock(page)
      await installDataPreparationBrowserRoutes(page, createDataPreparationBrowserFixture())
      const report = {
        schemaVersion: 'plush-test-coverage-report/v1',
        snapshot: { kind: 'isolated' },
        generatedAt: '2026-10-23T00:00:00Z',
        repository: { commit: 'a'.repeat(40), fingerprint: 'b'.repeat(64), dirty: false },
        gates: [{
          key: 'T0',
          label: '现场与静态',
          status: 'passed',
          total: 1,
          executed: 1,
          passed: 1,
          failed: 0,
          evidence: [`output/qa/${'long-evidence-path-'.repeat(12)}report.json`],
          note: '已执行项目全部通过，且无失败、跳过或阻塞。' }],
      }
      await page.route('**/__dev/api/qa/coverage', (route) => route.fulfill({ json: { status: 'missing' } }))
      await page.route('**/__dev/api/qa/coverage/snapshot', (route) => route.fulfill({ json: { status: 'snapshot', report } }))
    },
    verify: async (page) => {
      const measurements = []
      const routes = [
        '/__dev/testing?view=coverage&coverage=gates&reportSource=snapshot',
        '/__dev/testing?view=guide&guide=presets',
        '/__dev/data-preparation',
        '/__dev/permission-relationships',
        '/__dev/status-flows?view=chain',
        '/__dev/docs',
        '/__dev/project-skills',
        '/__dev/customer-config?view=assets',
        '/__dev/drill-recovery?view=security',
      ]
      for (const route of routes) {
        console.log(`[disclosure] ${route}`)
        await page.goto(new URL(route, page.url()).href)
        await page.locator('.erp-dev-workspace-page > header h1').waitFor()
        if (route.includes('coverage=gates')) await page.locator('.erp-dev-testing-coverage-card__details > summary').waitFor()
        if (route.includes('/status-flows')) await page.locator('[data-stage-card]').first().click()
        await page.locator('details.erp-dev-disclosure > summary:visible').first().waitFor()
        assert.equal(await page.locator('details:not(.erp-dev-disclosure)').count(), 0, `${route}原生折叠全部使用共享入口`)
        const summaries = page.locator('details.erp-dev-disclosure > summary:visible')
        const count = await summaries.count()
        for (let index = 0; index < count; index += 1) {
          const summary = summaries.nth(index)
          if (!await summary.isVisible()) continue
          measurements.push({ route, ...await assertDevDisclosureInteraction(page, summary, assert) })
        }
        await assertNoHorizontalOverflow(page, route)
      }
      // 同一真实长证据在较窄桌面下换行，触区和标题仍稳定。
      await page.setViewportSize({ width: 1024, height: 900 })
      await page.goto(new URL(routes[0], page.url()).href)
      const evidence = page.locator('.erp-dev-testing-coverage-card__details > summary')
      await evidence.waitFor()
      await assertDevDisclosureInteraction(page, evidence, assert)
      await evidence.click()
      await assertNoHorizontalOverflow(page, '长证据展开')
      await page.setViewportSize({ width: 1920, height: 1080 })
      await page.screenshot({ path: path.join(outputDir, 'dev-disclosure-expanded.png') })
      await fs.writeFile(path.join(outputDir, 'dev-disclosure-measurements.json'), JSON.stringify(measurements, null, 2))
      assert(measurements.length >= routes.length, '每类页面都有真实交互证据')
    },
  }]
}
