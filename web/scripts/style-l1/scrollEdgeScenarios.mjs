import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'

const fixturePath = '/__scroll-edge-fixture'
const fixtureHTML = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<script type="module">import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>(type)=>type; window.__vite_plugin_react_preamble_installed__=true;</script>
</head><body><div id="root"></div><script type="module" src="/scripts/test/ScrollEdgesFixture.jsx"></script></body></html>`

async function assertEdges(page, selector, expected) {
  await page
    .waitForFunction(
      ({ selector, expected }) => {
        const region = document.querySelector(selector)
        const frame = region?.querySelector(':scope > .app-scroll-edges')
        return (
          frame &&
          !frame.hidden &&
          Object.entries(expected).every(
            ([key, value]) => frame.dataset[key] === String(value)
          )
        )
      },
      { selector, expected }
    )
    .catch(async (error) => {
      const actual = await page
        .locator(selector)
        .evaluate((node) => ({
          width: node.clientWidth,
          height: node.clientHeight,
          scrollWidth: node.scrollWidth,
          scrollHeight: node.scrollHeight,
          left: node.scrollLeft,
          top: node.scrollTop,
          frames: [...node.querySelectorAll(':scope > .app-scroll-edges')].map(
            (frame) => ({
              ...frame.dataset,
              hidden: frame.hidden,
              style: frame.getAttribute('style'),
            })
          ),
        }))
      throw new Error(
        `${selector}: ${JSON.stringify({ expected, actual })}\n${error.message}`
      )
    })
  const metrics = await page.locator(selector).evaluate((region) => {
    const frame = region.querySelector(':scope > .app-scroll-edges')
    const rect = frame.getBoundingClientRect()
    const edges = [...frame.children].map((node) => ({
      direction: node.className.split('--').at(-1),
      blur: getComputedStyle(node).backdropFilter,
      pointerEvents: getComputedStyle(node).pointerEvents,
      width: node.getBoundingClientRect().width,
      height: node.getBoundingClientRect().height,
    }))
    return {
      count: region.querySelectorAll(':scope > .app-scroll-edges').length,
      ariaHidden: frame.getAttribute('aria-hidden'),
      width: rect.width,
      height: rect.height,
      edges,
    }
  })
  assert.equal(metrics.count, 1, '同一容器只有一套滚动提示')
  assert.equal(metrics.ariaHidden, 'true')
  assert(metrics.width > 0 && metrics.height > 0)
  assert(
    metrics.edges.every(
      (edge) => edge.pointerEvents === 'none' && edge.blur === 'blur(3px)'
    ),
    JSON.stringify(metrics)
  )
  for (const edge of metrics.edges) {
    if (expected[edge.direction])
      assert(
        edge.width > 0 && edge.height > 0,
        `提示必须有可见面积: ${JSON.stringify(metrics)}`
      )
  }
  return metrics
}

async function scroll(page, selector, left, top) {
  await page
    .locator(selector)
    .evaluate(
      (node, point) => node.scrollTo({ ...point, behavior: 'instant' }),
      { left, top }
    )
}

async function fixtureChecks(page, themeMode, outputDir) {
  page.setDefaultTimeout(12000)
  const table = '#fixture-table .ant-table-body'
  await page.locator(`${table} tr[data-row-key="24"]`).waitFor()
  await assertEdges(page, table, {
    left: false,
    right: true,
    top: false,
    bottom: true,
  })
  await scroll(page, table, 220, 160)
  await assertEdges(page, table, {
    left: true,
    right: true,
    top: true,
    bottom: true,
  })
  const fixed = await page.locator(table).evaluate((root) => {
    const frame = root.querySelector(':scope > .app-scroll-edges')
    const style = getComputedStyle(frame)
    return {
      left: parseFloat(style.getPropertyValue('--scroll-edge-left-inset')),
      right: parseFloat(style.getPropertyValue('--scroll-edge-right-inset')),
    }
  })
  assert(
    fixed.left >= 139 && fixed.right >= 99,
    `固定列不被过渡遮挡: ${JSON.stringify(fixed)}`
  )
  await scroll(page, table, 1e6, 1e6)
  await assertEdges(page, table, {
    left: true,
    right: false,
    top: true,
    bottom: false,
  })
  await scroll(page, table, 0, 0)
  await assertEdges(page, table, {
    left: false,
    right: true,
    top: false,
    bottom: true,
  })

  await assertEdges(page, '#fixture-filters', {
    left: false,
    right: true,
    top: false,
    bottom: false,
  })
  await scroll(page, '#fixture-filters', 1e6, 0)
  await assertEdges(page, '#fixture-filters', { left: true, right: false })
  await page.getByRole('button', { name: '切换内容宽度', exact: true }).click()
  await page.locator('#fixture-dynamic').scrollIntoViewIfNeeded()
  await assertEdges(page, '#fixture-dynamic', { right: true, bottom: true })
  await page.getByRole('button', { name: '切换内容宽度', exact: true }).click()
  await page.waitForFunction(() => {
    const frame = document.querySelector('#fixture-dynamic > .app-scroll-edges')
    return !frame || frame.hidden
  })
  await page.getByRole('button', { name: '切换内容宽度', exact: true }).click()
  await page.locator('#fixture-dynamic').scrollIntoViewIfNeeded()
  await assertEdges(page, '#fixture-dynamic', { right: true, bottom: true })
  const recovery = await page.locator('#fixture-dynamic').evaluate((node) => {
    const root = node.getBoundingClientRect()
    const frame = node
      .querySelector('.app-scroll-edges')
      .getBoundingClientRect()
    return {
      x: Math.abs(root.left + node.clientLeft - frame.left),
      y: Math.abs(root.top + node.clientTop - frame.top),
    }
  })
  assert(recovery.x < 1 && recovery.y < 1, JSON.stringify(recovery))
  await page.locator('#fixture-transformed').scrollIntoViewIfNeeded()
  await assertEdges(page, '#fixture-transformed', { right: true, bottom: true })
  const clipped = await page
    .locator('#fixture-transformed')
    .evaluate((node) => {
      const root = node.getBoundingClientRect()
      const parent = node.parentElement.getBoundingClientRect()
      const frame = node
        .querySelector('.app-scroll-edges')
        .getBoundingClientRect()
      return {
        root: { left: root.left, top: root.top },
        frame: { left: frame.left, top: frame.top, right: frame.right },
        parentRight: parent.right,
      }
    })
  assert(
    Math.abs(clipped.root.left - clipped.frame.left) < 1 &&
      Math.abs(clipped.root.top - clipped.frame.top) < 1,
    JSON.stringify(clipped)
  )
  assert(
    clipped.frame.right <= clipped.parentRight + 1,
    '过渡不超出父级裁切边界'
  )
  await page.locator('#fixture-rtl').scrollIntoViewIfNeeded()
  await assertEdges(page, '#fixture-rtl', { left: true, right: false })
  assert.equal(
    await page
      .locator('#fixture-excluded .app-scroll-edges,textarea .app-scroll-edges')
      .count(),
    0
  )

  await page.getByRole('button', { name: '打开弹窗', exact: true }).click()
  await assertEdges(page, '#fixture-modal-scroll', {
    right: true,
    bottom: true,
  })
  await scroll(page, '#fixture-modal-scroll', 1e6, 1e6)
  await assertEdges(page, '#fixture-modal-scroll', {
    right: false,
    bottom: false,
    left: true,
    top: true,
  })
  await page
    .getByRole('dialog', { name: '滚动弹窗' })
    .getByRole('button', { name: '确定', exact: true })
    .click()
  await page
    .getByRole('dialog', { name: '滚动弹窗' })
    .waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: '打开抽屉', exact: true }).click()
  await assertEdges(page, '.ant-drawer-body', { bottom: true, top: false })
  await scroll(page, '.ant-drawer-body', 0, 1e6)
  await assertEdges(page, '.ant-drawer-body', { bottom: false, top: true })
  await page.locator('.ant-drawer-close').click()
  await page.locator('.ant-drawer-body').waitFor({ state: 'hidden' })
  await page.getByRole('button', { name: '开关滚动增强', exact: true }).click()
  assert.equal(
    await page.locator('.app-scroll-edges').count(),
    0,
    '卸载清理所有效果与观察器'
  )
  await page.getByRole('button', { name: '开关滚动增强', exact: true }).click()
  await page.locator(table).scrollIntoViewIfNeeded()
  await assertEdges(page, table, { right: true, bottom: true })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  assert.equal(
    await page
      .locator(`${table} > .app-scroll-edges > .app-scroll-edge`)
      .first()
      .evaluate((node) => getComputedStyle(node).transitionDuration),
    '0s'
  )
  await page.emulateMedia({ media: 'print' })
  assert.equal(
    await page
      .locator(`${table} > .app-scroll-edges`)
      .evaluate((node) => getComputedStyle(node).display),
    'none',
    '打印不含屏幕过渡'
  )
  await page.emulateMedia({ media: 'screen', reducedMotion: 'no-preference' })
  await page.locator('#fixture-dynamic').scrollIntoViewIfNeeded()
  await assertEdges(page, '#fixture-dynamic', { right: true, bottom: true })
  const surface = page.locator('#fixture-dynamic > .app-scroll-edges')
  const originalSurface = await surface.evaluate(node => node.style.getPropertyValue('--scroll-edge-surface'))
  await page.evaluate(mode => { document.documentElement.dataset.erpTheme = mode }, themeMode === 'dark' ? 'light' : 'dark')
  await page.waitForFunction(color => document.querySelector('#fixture-dynamic > .app-scroll-edges').style.getPropertyValue('--scroll-edge-surface') !== color, originalSurface)
  await page.evaluate(mode => { document.documentElement.dataset.erpTheme = mode }, themeMode)
  await page.waitForFunction(color => document.querySelector('#fixture-dynamic > .app-scroll-edges').style.getPropertyValue('--scroll-edge-surface') === color, originalSurface)
  await page.locator(table).scrollIntoViewIfNeeded()
  await page.screenshot({
    path: path.join(outputDir, `scroll-edges-surfaces-${themeMode}.png`),
  })
}

export function createScrollEdgeScenarios(scenarios, { outputDir }) {
  const tables = scenarios
    .filter((scenario) =>
      /^business-table-scroll-(desktop|dark|short|mobile)$/u.test(scenario.name)
    )
    .map((base) => ({
      ...base,
      name: `global-scroll-edges-${base.name.replace('business-table-scroll-', 'table-')}`,
      ...(base.name.endsWith('desktop')
        ? { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 }
        : {}),
      verify: async (page) => {
        await base.verify(page).catch(async (error) => {
          const metrics = await page
            .locator('.erp-business-data-table-card .ant-table-wrapper')
            .evaluate((node) => ({
              top: node.scrollTop,
              max: node.scrollHeight - node.clientHeight,
              wrapper: node.getBoundingClientRect().toJSON(),
              pagination: node
                .querySelector('.ant-pagination')
                ?.getBoundingClientRect()
                .toJSON(),
              viewport: innerHeight,
              frames: document.querySelectorAll('.app-scroll-edges').length,
              body: document.body.getBoundingClientRect().toJSON(),
            }))
          throw new Error(`${error.message}: ${JSON.stringify(metrics)}`)
        })
        const wrapper = '.erp-business-data-table-card .ant-table-wrapper'
        const content = `${wrapper} .ant-table-content`
        await page.locator(wrapper).scrollIntoViewIfNeeded()
        await scroll(page, wrapper, 0, 0)
        await scroll(page, content, 0, 0)
        await assertEdges(page, wrapper, { top: false, bottom: true })
        await assertEdges(page, content, { left: false, right: true })
        await scroll(page, content, 1e6, 0)
        await assertEdges(page, content, { left: true, right: false })
        await scroll(page, wrapper, 0, 1e6)
        await assertEdges(page, wrapper, { top: true, bottom: false })
        await page.screenshot({
          path: path.join(outputDir, `${base.name}-edges.png`),
        })
      await page.keyboard.press('Tab')
      await page.mouse.move(5, 5)
      for (const selector of [wrapper, content]) {
        await page.locator(selector).evaluate(node => node.scrollTo({ left: (node.scrollWidth - node.clientWidth) / 2, top: (node.scrollHeight - node.clientHeight) / 2, behavior: 'instant' }))
      }
      await assertEdges(page, wrapper, { top: true, bottom: true })
      await assertEdges(page, content, { left: true, right: true })
      await page.screenshot({ path: path.join(outputDir, `${base.name}-edges-middle.png`) })
        const metrics = await page
          .locator('.app-scroll-edges')
          .evaluateAll((nodes) =>
            nodes
              .filter((node) => !node.hidden)
              .map((node) => ({
                container: node.parentElement.className,
                edges: { ...node.dataset },
                width: node.getBoundingClientRect().width,
                height: node.getBoundingClientRect().height,
              }))
          )
        await writeFile(
          path.join(outputDir, `${base.name}-edges.json`),
          JSON.stringify(metrics, null, 2)
        )
      },
    }))
  const fixtures = ['light', 'dark'].map((themeMode) => ({
    name: `global-scroll-edges-surfaces-${themeMode}`,
    path: `${fixturePath}?theme=${themeMode}`,
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    beforeNavigate: (page) =>
      page.route(`**${fixturePath}?*`, (route) =>
        route.fulfill({ contentType: 'text/html', body: fixtureHTML })
      ),
    verify: (page) => fixtureChecks(page, themeMode, outputDir),
  }))
  return [...fixtures, ...tables]
}
