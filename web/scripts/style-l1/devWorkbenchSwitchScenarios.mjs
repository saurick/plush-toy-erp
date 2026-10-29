import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import {
  DEV_WORKSPACE_NAV_ITEMS,
  DEV_SECONDARY_NAV_ITEMS,
  DEV_VERSION_GUIDE_ROUTE,
} from '../../src/dev-workbench/config/devRoutes.mjs'
import { createDevWorkbenchDesktopScenarios } from './devWorkbenchDesktopScenarios.mjs'
import { createDevQualityGateScenarios } from './devQualityGateScenarios.mjs'
import { installSummaryRoute } from './devVersionCenterScenarios.mjs'
import { installDrillRecoveryRoutes } from './devDrillRecoveryScenarios.mjs'
import { installDatabaseMigrationFixture } from './devDeliveryWorkspaceScenarios.mjs'
import {
  createDataPreparationBrowserFixture,
  installDataPreparationBrowserRoutes,
} from './devDataPreparationScenarios.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'

const groupSelector =
  '[role="tablist"], .erp-sliding-segmented .ant-segmented-group, [role="group"]:has(.erp-filter-chip)'
const itemSelector = '[role="tab"], .ant-segmented-item, .erp-filter-chip'

async function visibleGroups(page) {
  return page
    .locator(`.erp-dev-workspace-page :is(${groupSelector})`)
    .evaluateAll(
      (groups, itemsSelector) =>
        groups
          .filter((group) => group.getClientRects().length > 0)
          .map((group) => {
            const items = [...group.querySelectorAll(itemsSelector)]
            const labels = items.map((item) => item.textContent.trim())
            return {
              key: JSON.stringify([
                group.id,
                group.getAttribute('aria-label'),
                group.className,
                labels,
              ]),
              label:
                group.getAttribute('aria-label') ||
                group.closest('[aria-label]')?.getAttribute('aria-label') ||
                labels.join(' / '),
              labels,
            }
          }),
      itemSelector
    )
}

function groupLocator(page, group) {
  return page
    .locator(`.erp-dev-workspace-page :is(${groupSelector})`)
    .filter({ visible: true })
    .filter({ hasText: group.labels[0] })
    .filter({
      has: page.locator(itemSelector).filter({ hasText: group.labels.at(-1) }),
    })
    .first()
}

async function sampleSwitch(group, targetIndex) {
  return group.evaluate(
    async (root, { targetIndex, itemSelector }) => {
      const items = [...root.querySelectorAll(itemSelector)]
      const target = items[targetIndex]
      const selected = (item) =>
        item.getAttribute('aria-selected') === 'true' ||
        item.getAttribute('aria-pressed') === 'true' ||
        item.classList.contains('erp-segmented-item-selected')
      if (
        target.matches(
          ':disabled, [aria-disabled="true"], .ant-segmented-item-disabled'
        )
      )
        return { skipped: true }
      const nodes = [root, ...items]
      // 吸顶后核对视口位置，普通流位置排除页面滚动的影响。
      const pinned =
        getComputedStyle(root).position === 'sticky' &&
        Math.abs(
          root.getBoundingClientRect().top -
            parseFloat(getComputedStyle(root).top)
        ) <= 1
      const read = () =>
        nodes.map((node) => {
          const rect = node.getBoundingClientRect()
          return {
            x: rect.x + (pinned ? 0 : window.scrollX),
            y: rect.y + (pinned ? 0 : window.scrollY),
            width: rect.width,
            height: rect.height,
          }
        })
      const before = read()
      const frames = []
      const start = performance.now()
      target.click()
      await new Promise((resolve) => {
        const frame = () => {
          frames.push({
            boxes: read(),
            mounted: nodes.every((node) => node.isConnected),
            selected: selected(target),
          })
          if (performance.now() - start < 300) requestAnimationFrame(frame)
          else resolve()
        }
        requestAnimationFrame(frame)
      })
      const shifts = []
      let selectedOnce = false
      let selectionReverted = false
      for (const frame of frames) {
        if (selectedOnce && !frame.selected) selectionReverted = true
        selectedOnce ||= frame.selected
        for (const [index, box] of frame.boxes.entries()) {
          for (const dimension of ['x', 'y', 'width', 'height']) {
            const delta = Math.abs(box[dimension] - before[index][dimension])
            if (
              delta > 1 &&
              !shifts.some(
                (shift) =>
                  shift.index === index && shift.dimension === dimension
              )
            )
              shifts.push({
                index,
                dimension,
                delta,
                before: before[index][dimension],
                after: box[dimension],
              })
          }
        }
      }
      return {
        frames: frames.length,
        mounted: frames.every((frame) => frame.mounted),
        selected: selectedOnce,
        selectionReverted,
        shifts,
      }
    },
    { targetIndex, itemSelector }
  )
}

async function sampleFilter(page, control, action) {
  await control.evaluate((element) => {
    const toolbar = element.closest(
      '[class*="toolbar"], [class*="filters"], [class*="controls"]'
    )
    const nodes = [
      ...new Set(
        [
          element,
          toolbar,
          document.querySelector('.erp-dev-workspace-page > header'),
        ].filter(Boolean)
      ),
    ]
    const read = () =>
      nodes.map((node) => {
        const { x, y, width, height } = node.getBoundingClientRect()
        return { x: x + window.scrollX, y: y + window.scrollY, width, height }
      })
    const sample = { nodes, before: read(), frames: [], active: true }
    window.__workbenchFilterSample = sample
    const frame = () => {
      if (!sample.active) return
      sample.frames.push({
        boxes: read(),
        mounted: nodes.every((node) => node.isConnected),
      })
      requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
  })
  await action()
  return page.evaluate(async () => {
    const sample = window.__workbenchFilterSample
    const start = performance.now()
    await new Promise((resolve) => {
      const frame = () =>
        performance.now() - start < 300
          ? requestAnimationFrame(frame)
          : resolve()
      requestAnimationFrame(frame)
    })
    sample.active = false
    delete window.__workbenchFilterSample
    const shifts = []
    for (const frame of sample.frames) {
      for (const [index, box] of frame.boxes.entries()) {
        for (const dimension of ['x', 'y', 'width', 'height']) {
          const delta = Math.abs(
            box[dimension] - sample.before[index][dimension]
          )
          if (
            delta > 1 &&
            !shifts.some(
              (shift) => shift.index === index && shift.dimension === dimension
            )
          )
            shifts.push({
              index,
              dimension,
              delta,
              before: sample.before[index][dimension],
              after: box[dimension],
            })
        }
      }
    }
    return {
      frames: sample.frames.length,
      mounted: sample.frames.every((frame) => frame.mounted),
      selected: true,
      selectionReverted: false,
      shifts,
    }
  })
}

async function inspectFilters(page, evidence, seen) {
  const searches = page.locator(
    '.erp-dev-workspace-page .erp-search-input:visible'
  )
  for (const search of await searches.all()) {
    const input = search.locator('input')
    const label =
      (await input.getAttribute('aria-label')) ||
      (await input.getAttribute('placeholder'))
    if (seen.has(`search:${label}`) || !(await input.isEnabled())) continue
    seen.add(`search:${label}`)
    const original = await input.inputValue()
    for (const value of ['不存在的筛选内容', original]) {
      const result = await sampleFilter(page, search, async () => {
        if (
          !value &&
          (await search.getByRole('button', { name: '清除搜索' }).count())
        ) {
          await search.getByRole('button', { name: '清除搜索' }).click()
        } else {
          await input.fill(value)
          await input.press('Enter')
        }
      })
      evidence.push({ group: label, target: value || '恢复搜索', ...result })
    }
  }
  const selects = page.locator('.erp-dev-workspace-page .ant-select:visible')
  for (const select of await selects.all()) {
    const input = select.locator('input[role="combobox"]')
    if (!(await input.count())) continue
    const label =
      (await input.getAttribute('aria-label')) ||
      (await select.getAttribute('aria-label')) ||
      ''
    if (
      !/筛选|分组|范围|推荐|职责|业务域|功能模块|岗位|员工|关键规则专项|记录归属|业务专题|关系图目录方式/u.test(
        label
      ) ||
      seen.has(`select:${label}`) ||
      !(await input.isEnabled())
    )
      continue
    seen.add(`select:${label}`)
    const selection = select.locator('.ant-select-selection-item')
    const original = (await selection.count())
      ? await selection.textContent()
      : ''
    const listId = await input.getAttribute('aria-controls')
    const popup = page
      .locator('.ant-select-dropdown')
      .filter({ has: page.locator(`[id=${JSON.stringify(listId)}]`) })
    await select.locator('.ant-select-selector').click()
    await popup.waitFor({ state: 'visible' })
    const option = popup
      .locator(
        '.ant-select-item-option:not(.ant-select-item-option-selected):not(.ant-select-item-option-disabled)'
      )
      .first()
    if (!(await option.count())) {
      await input.press('Escape')
      continue
    }
    const target = await option.innerText()
    const result = await sampleFilter(page, select, () => option.click())
    await popup.waitFor({ state: 'hidden' })
    evidence.push({ group: label, target, ...result })
    const clear = select.locator('.ant-select-clear')
    if (!original && (await clear.count())) {
      const restored = await sampleFilter(page, select, () => clear.click())
      evidence.push({ group: label, target: '恢复筛选', ...restored })
    } else if (original) {
      await select.locator('.ant-select-selector').click()
      const restored = await sampleFilter(page, select, () =>
        popup
          .locator('.ant-select-item-option')
          .filter({ hasText: original })
          .first()
          .click()
      )
      await popup.waitFor({ state: 'hidden' })
      evidence.push({ group: label, target: '恢复筛选', ...restored })
    }
  }
}

async function inspectGroups(page, evidence, seen = new Set()) {
  await inspectFilters(page, evidence, seen)
  for (const group of await visibleGroups(page)) {
    if (seen.has(group.key) || group.labels.length < 2) continue
    seen.add(group.key)
    const locator = groupLocator(page, group)
    for (const index of [...group.labels.keys(), 0]) {
      if (!(await locator.isVisible())) break
      await waitForFiniteAnimations(page)
      const result = await sampleSwitch(locator, index)
      evidence.push({
        group: group.label,
        target: group.labels[index],
        content: (await page.locator('.erp-dev-workspace-page').innerText()).slice(0, 3000),
        ...result,
      })
      await inspectGroups(page, evidence, seen)
    }
  }
}

export function createDevWorkbenchSwitchScenarios(deps) {
  const ordinary = createDevWorkbenchDesktopScenarios(deps)
  const quality = createDevQualityGateScenarios(deps)[0]
  const routes = [
    ...new Set(
      [...DEV_WORKSPACE_NAV_ITEMS, ...DEV_SECONDARY_NAV_ITEMS]
        .map((item) => item.route)
        .concat(DEV_VERSION_GUIDE_ROUTE)
    ),
  ]
  const writesByPage = new WeakMap()
  return [1024, 1200, 1280, 1920].map((width) => ({
    name: `dev-workbench-switches-${width}`,
    path: '/__dev',
    auth: 'admin',
    viewport: { width, height: 900 },
    beforeNavigate: async (page) => {
      const writes = []
      writesByPage.set(page, writes)
      page.on('request', (request) => {
        if (
          request.url().includes('/__dev/api/') &&
          ['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method())
        )
          writes.push({ method: request.method(), url: request.url() })
      })
      await installDatabaseMigrationFixture(page)
      await installSummaryRoute(page)
      await installDrillRecoveryRoutes(page)
      await installDataPreparationBrowserRoutes(
        page,
        createDataPreparationBrowserFixture()
      )
      await quality.beforeNavigate(page)
      for (const scenario of ordinary) await scenario.beforeNavigate?.(page)
      await page.route(/\/__dev\/api\/qa\/coverage(?:\/snapshot)?$/u, (route) =>
        route.fulfill({
          json: { status: 'missing', message: '尚未采集覆盖报告' },
        })
      )
    },
    verify: async (page) => {
      const origin = page.url()
      const evidence = []
      for (const route of routes) {
        await page.goto(new URL(route, origin).href)
        await page.getByRole('heading', { level: 1 }).first().waitFor()
        await page.evaluate(() => document.fonts.ready)
        const result = { route, switches: [] }
        evidence.push(result)
        try {
          await inspectGroups(page, result.switches)
          await deps.assertNoHorizontalOverflow(page)
        } catch (error) {
          result.error = error.message
        }
        await writeFile(
          `${deps.outputDir}/workbench-switches-${width}.json`,
          JSON.stringify(evidence, null, 2)
        )
      }
      const issues = evidence.flatMap((route) => [
        ...(route.error ? [{ route: route.route, error: route.error }] : []),
        ...route.switches
          .filter(
            (item) =>
              !item.skipped &&
              (item.frames < 5 ||
                !item.mounted ||
                !item.selected ||
                item.selectionReverted ||
                item.shifts.length)
          )
          .map((item) => ({ route: route.route, ...item })),
      ])
      assert.deepEqual(
        writesByPage.get(page),
        [],
        '页签与筛选检查不触发工作台执行操作'
      )
      assert.equal(
        issues.length,
        0,
        `工作台 ${width}px 页签与筛选切换存在 ${issues.length} 处问题；逐帧证据见 workbench-switches-${width}.json：${JSON.stringify(issues.slice(0, 3))}`
      )
    },
  }))
}
