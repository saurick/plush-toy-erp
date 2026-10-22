import { UI_DESIGN_PREVIEW_TIMEOUT_MS } from '../../src/dev-workbench/config/devUIDesign.mjs'
import { chooseSelectOption } from './selectControlActions.mjs'

const frameSelector = 'iframe[title="ERP 最新可交互设计"]'

export function createDevUIDesignPreviewScenarios({ assert, assertNoHorizontalOverflow, outputDir, path }) {
  const waitReady = async (page) => {
    const frame = page.frameLocator(frameSelector)
    await page.locator(`${frameSelector}:not([aria-hidden])`).waitFor({ state: 'visible' })
    await frame.locator('.app').waitFor({ state: 'visible' })
    const geometry = await frame.locator('.app').evaluate((node) => {
      const box = node.getBoundingClientRect()
      return { width: box.width, height: box.height }
    })
    assert(geometry.width > 0 && geometry.height > 0, '预览内容完成布局后才算就绪')
    assert.equal(await page.locator('.erp-dev-ui-design-feedback').count(), 0)
    const selectionOverflow = await page.locator('.erp-dev-ui-design-page-select:visible .ant-select-selection-item')
      .evaluate((node) => node.scrollWidth - node.clientWidth)
    assert(selectionOverflow <= 1, `预览入口名称被截断 ${selectionOverflow}px`)
    return frame
  }
  const select = async (page, value) => {
    const label = { login: '登录页', help: '岗位帮助', controls: '控件设计', workbench: '效能工作台', 'production-hub': '生产管理' }[value]
    const control = page.locator('.erp-dev-ui-design-page-select:visible')
    await control.click()
    const listId = await control.getByRole('combobox').getAttribute('aria-controls')
    const popup = page.locator('.ant-select-dropdown').filter({ has: page.locator(`[id=${JSON.stringify(listId)}]`) })
    await popup.getByText(label, { exact: true }).click()
    await popup.waitFor({ state: 'hidden' })
  }
  return [
    {
      name: 'dev-ui-design-production-entry',
      path: '/__dev/ui-design?page=production-hub',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      verify: async (page) => {
        const frame = await waitReady(page)
        const heading = frame.getByRole('heading', { name: '生产管理', exact: true })
        await heading.waitFor()
        assert.equal(await page.locator('.erp-dev-ui-design-page-select').getByText('生产管理', { exact: true }).isVisible(), true)
        for (const name of ['生产订单', '生产执行', '生产记录', '异常处理']) {
          const tab = frame.getByRole('tab', { name, exact: true })
          await tab.click()
          assert.equal(await tab.getAttribute('aria-selected'), 'true')
          await heading.waitFor()
        }
        await page.getByRole('tab', { name: '设计说明', exact: true }).click()
        await page.locator('.erp-design-document-shell').waitFor()
        await page.getByRole('tab', { name: '可交互设计', exact: true }).click()
        await waitReady(page)
        assert.equal(await frame.getByRole('tab', { name: '异常处理', exact: true }).getAttribute('aria-selected'), 'true')
        await page.reload()
        await waitReady(page)
        await heading.waitFor()
        await select(page, 'workbench')
        await waitReady(page)
        await select(page, 'production-hub')
        await waitReady(page)
        await heading.waitFor()
        await assertNoHorizontalOverflow(page)
        await page.screenshot({ path: path.join(outputDir, 'ui-design-production-entry-4k.png') })
      },
    },
    {
      name: 'dev-ui-design-workbench-navigation-sync',
      path: '/__dev/ui-design?page=workbench',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      verify: async (page) => {
        const frame = await waitReady(page)
        const navigation = frame.getByRole('navigation', { name: '效能工作台主导航' })
        const heading = frame.locator('.dev-design-heading')
        assert.equal(await frame.locator('#topbar').isVisible(), false)
        await heading.getByRole('button', { name: '刷新演示', exact: true }).waitFor()
        const footer = frame.locator('.dev-page-tools > summary')
        const footerBox = await footer.evaluate((node) => ({
          width: node.getBoundingClientRect().width,
          height: node.getBoundingClientRect().height,
          overflow: node.scrollWidth - node.clientWidth,
          fontSize: parseFloat(getComputedStyle(node).fontSize),
        }))
        assert(footerBox.width > 100 && footerBox.height <= 44 && footerBox.overflow <= 1, JSON.stringify(footerBox))
        assert.equal(footerBox.fontSize, 14)
        await footer.click()
        await frame.getByRole('button', { name: '复制演示链接', exact: true }).waitFor()
        await footer.click()

        await navigation.getByRole('button', { name: '质量验证', exact: true }).click()
        await frame.getByRole('table', { name: '质量验证工具清单' }).waitFor()
        assert.equal(await heading.getByRole('tab').count(), 0)
        await heading.getByRole('button', { name: '开始验证', exact: true }).click()
        await heading.getByRole('heading', { name: '改动验证', exact: true }).waitFor()
        assert.deepEqual(await heading.getByRole('tab').allTextContents(), ['本轮验证', '证据与覆盖', '压力测试'])
        assert.equal(await navigation.locator('[aria-current="page"]').innerText(), '改动验证')
        await frame.getByRole('button', { name: '演示本轮验证', exact: true }).click()

        const tabs = frame.locator('.dev-design-tabs')
        for (const reduced of [false, true]) {
          await page.emulateMedia({ reducedMotion: reduced ? 'reduce' : 'no-preference' })
          const motion = await tabs.evaluate(async (root, reduced) => {
            const target = root.querySelectorAll('[role="tab"]')[reduced ? 0 : 1]
            const before = root.getBoundingClientRect()
            const start = parseFloat(getComputedStyle(root, '::before').left)
            const samples = []
            target.click()
            const began = performance.now()
            await new Promise((resolve) => {
              const sample = () => {
                const style = getComputedStyle(root, '::before')
                samples.push({ left: parseFloat(style.left), duration: style.transitionDuration, mounted: root.isConnected })
                if (performance.now() - began < 350) requestAnimationFrame(sample)
                else resolve()
              }
              requestAnimationFrame(sample)
            })
            const after = root.getBoundingClientRect()
            return { start, target: target.offsetLeft, samples, selected: target.getAttribute('aria-selected'), drift: ['x', 'y', 'width', 'height'].map((key) => after[key] - before[key]) }
          }, reduced)
          assert.equal(motion.selected, 'true')
          assert(motion.samples.every((sample) => sample.mounted) && motion.drift.every((delta) => Math.abs(delta) <= 1), JSON.stringify(motion))
          assert(Math.abs(motion.samples.at(-1).left - motion.target) <= 1, JSON.stringify(motion))
          if (reduced) assert(motion.samples.every((sample) => sample.duration.split(',').every((value) => parseFloat(value) === 0)))
          else assert(motion.samples.some((sample) => sample.left > Math.min(motion.start, motion.target) + 1 && sample.left < Math.max(motion.start, motion.target) - 1), JSON.stringify(motion))
        }
        await page.emulateMedia({ reducedMotion: 'no-preference' })
        await navigation.getByRole('button', { name: '交付运行', exact: true }).click()
        assert.deepEqual(await heading.getByRole('tab').allTextContents(), ['交付任务', '环境证据'])
        await heading.getByRole('tab', { name: '环境证据', exact: true }).click()
        await frame.getByRole('table', { name: '环境证据样例' }).waitFor()
        assert.equal(await frame.getByRole('table', { name: '环境证据样例' }).getByText('未采集', { exact: true }).count(), 3)
        await heading.getByRole('tab', { name: '交付任务', exact: true }).click()
        await frame.getByRole('button', { name: '管理版本与部署', exact: true }).click()
        await heading.getByRole('heading', { name: '版本发布', exact: true }).waitFor()
        assert.equal(await navigation.locator('[aria-current="page"]').innerText(), '版本发布')
        await frame.getByRole('button', { name: '核对交付条件', exact: true }).click()
        await frame.getByRole('button', { name: '确认样例条件齐备', exact: true }).click()
        await frame.getByRole('button', { name: '核对并准备版本发布', exact: true }).click()
        await frame.getByRole('button', { name: '确认演示', exact: true }).click()
        await navigation.getByRole('button', { name: '交付运行', exact: true }).click()
        await frame.getByRole('button', { name: '读取演示结果', exact: true }).click()
        await frame.getByRole('dialog', { name: '演示操作回执', exact: true }).waitFor()
        await frame.getByRole('button', { name: '返回工作台', exact: true }).click()

        await frame.getByText('演示设置与边界', { exact: true }).click()
        await chooseSelectOption(frame.locator('#dev-design-state'), 'error')
        await frame.getByRole('heading', { name: '证据暂时无法读取', exact: true }).waitFor()
        await frame.getByRole('button', { name: '重新读取', exact: true }).click()
        await frame.getByRole('region', { name: '交付运行任务' }).waitFor()
        await assertNoHorizontalOverflow(page)
        const innerOverflow = await frame.locator('body').evaluate((node) => node.scrollWidth - node.clientWidth)
        assert(innerOverflow <= 1, `设计稿横向溢出 ${innerOverflow}px`)
        await page.screenshot({ path: path.join(outputDir, 'ui-design-workbench-sync-4k.png') })
      },
    },
    {
      name: 'dev-ui-design-preview-lifecycle',
      path: '/__dev/ui-design?page=help&control=feedback',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      verify: async (page) => {
        const preview = page.locator(frameSelector)
        const frame = await waitReady(page)
        await frame.getByRole('heading', { name: '你想完成什么？', exact: true }).waitFor()
        const helpWindow = await preview.elementHandle()
        await select(page, 'login')
        await waitReady(page)
        assert.equal(await helpWindow.evaluate((node) => node.isConnected), false, '切换入口不复用旧文档的浏览上下文')
        const loginWindow = await preview.elementHandle()
        const account = frame.locator('input').first()
        await account.fill('keep-preview-state')

        await page.getByRole('tab', { name: '设计说明', exact: true }).click()
        await page.locator('.erp-design-document-shell').waitFor()
        await page.getByRole('tab', { name: '可交互设计', exact: true }).click()
        await waitReady(page)
        assert.equal(await loginWindow.evaluate((node) => node.isConnected), true)
        assert.equal(await account.inputValue(), 'keep-preview-state')

        await select(page, 'controls')
        await page.getByRole('region', { name: '控件设计', exact: true }).waitFor()
        assert.equal(await preview.isVisible(), false)
        await select(page, 'login')
        await waitReady(page)
        assert.equal(await loginWindow.evaluate((node) => node.isConnected), true)
        assert.equal(await account.inputValue(), 'keep-preview-state')

        for (const entry of ['help', 'login', 'workbench', 'help']) {
          await select(page, entry)
        }
        await waitReady(page)
        await frame.getByRole('heading', { name: '你想完成什么？', exact: true }).waitFor()
        const beforeReset = await preview.elementHandle()
        await page.getByRole('button', { name: /重置演示/u }).click()
        await waitReady(page)
        assert.equal(await beforeReset.evaluate((node) => node.isConnected), false)
        const search = frame.getByRole('searchbox', { name: '搜索操作图解和参考手册' })
        await search.fill('采购')
        const frameBeforeExpand = await preview.elementHandle()
        const normalFrame = await preview.boundingBox()
        await page.getByRole('button', { name: /全屏预览/u }).click()
        await page.getByRole('dialog', { name: 'UI 交互设计全屏预览', exact: true }).waitFor()
        const expandedFrame = await preview.boundingBox()
        assert(expandedFrame.width > normalFrame.width && expandedFrame.height > normalFrame.height, '宿主放大同时增加宽高，不以内容宽度切换代替')
        assert.equal(await frameBeforeExpand.evaluate((node) => node.isConnected), true)
        assert.equal(await search.inputValue(), '采购', '放大保留当前选择')
        await search.fill('采购订单')
        await page.getByRole('button', { name: /退出全屏/u }).click()
        await page.getByRole('dialog', { name: 'UI 交互设计全屏预览', exact: true }).waitFor({ state: 'hidden' })
        assert.equal(await search.inputValue(), '采购订单', '放大后仍可交互，退出保留选择')
        await search.fill('')
        await page.getByRole('button', { name: /全屏预览/u }).click()
        await page.getByRole('dialog', { name: 'UI 交互设计全屏预览', exact: true }).waitFor()
        await search.press('Escape')
        await page.getByRole('dialog', { name: 'UI 交互设计全屏预览', exact: true }).waitFor({ state: 'hidden' })
        await waitReady(page)
        await assertNoHorizontalOverflow(page)
        await page.screenshot({ path: path.join(outputDir, 'ui-preview-help-ready.png') })
      },
    },
    ...[
      { name: 'script', script: "throw new Error('preview-startup-fixture')", expectedConsoleErrorPatterns: [/preview-startup-fixture/u] },
      { name: 'layout', script: "document.querySelector('.app').style.height = '0px'" },
      { name: 'empty', script: "document.querySelector('.app').replaceChildren()" },
      { name: 'timeout', script: 'window.requestAnimationFrame = function () { return 0 }' },
    ].map(({ name, script, expectedConsoleErrorPatterns }) => ({
      name: `dev-ui-design-preview-${name}-recovery`,
      path: '/__dev/ui-design?page=help',
      viewport: { width: 1440, height: 900 },
      expectedConsoleErrorPatterns,
      beforeNavigate: async (page) => {
        const fixture = `<!doctype html><html><head><style>html,body,.app{height:100%;margin:0}.app{overflow:hidden}</style></head><body><div class="app"><h1>预览恢复样例</h1></div><script>if(window.__ERP_UI_DESIGN_PREVIEW_ID__ === 'help-0') {${script}}</script></body></html>`
        await page.route((url) => url.pathname.endsWith('/docs/product/ui-design/index.html') && url.searchParams.has('raw'), (route) => route.fulfill({
          status: 200,
          contentType: 'text/javascript',
          body: `export default ${JSON.stringify(fixture)}`,
        }))
      },
      verify: async (page) => {
        if (name === 'timeout') {
          await page.getByText('正在加载交互预览', { exact: true }).waitFor()
        }
        const retry = page.getByRole('button', { name: /重新加载预览/u })
        await retry.waitFor({ timeout: UI_DESIGN_PREVIEW_TIMEOUT_MS + 5000 })
        await page.getByText('交互预览未能显示', { exact: true }).waitFor()
        assert.equal(await page.locator('.erp-dev-ui-design-stage').getAttribute('data-preview-failure'), name)
        assert.equal(await page.locator(frameSelector).getAttribute('tabindex'), '-1')
        await assertNoHorizontalOverflow(page)
        if (name === 'layout') {
          const original = await page.locator(frameSelector).elementHandle()
          const frame = page.frameLocator(frameSelector)
          await frame.locator('.app').evaluate((node) => { node.style.height = '100%' })
          await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
          await waitReady(page)
          assert.equal(await original.evaluate((node) => node.isConnected), true, '可见性恢复时在原窗口重检布局，不重置健康演示')
          await frame.locator('.app').evaluate((node) => { node.style.height = '0px' })
          await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))
          await retry.waitFor()
          assert.equal(await page.locator('.erp-dev-ui-design-stage').getAttribute('data-preview-failure'), 'layout')
          await page.screenshot({ path: path.join(outputDir, 'ui-preview-layout-error.png') })
          await page.setViewportSize({ width: 390, height: 844 })
          await page.emulateMedia({ colorScheme: 'dark' })
          await assertNoHorizontalOverflow(page)
          assert.equal(await retry.isVisible(), true)
          await page.screenshot({ path: path.join(outputDir, 'ui-preview-layout-error-mobile.png') })
          await page.setViewportSize({ width: 1440, height: 900 })
        }

        await page.evaluate(() => {
          const frame = document.querySelector('iframe')
          for (const data of [
            { type: 'ui-design-preview-status', previewId: 'login-0', status: 'ready' },
            { type: 'ui-design-preview-status', previewId: 'help-0', status: 'unexpected' },
          ]) {
            window.dispatchEvent(new MessageEvent('message', { source: frame.contentWindow, data }))
          }
          window.dispatchEvent(new MessageEvent('message', {
            source: window,
            data: { type: 'ui-design-preview-status', previewId: 'help-0', status: 'ready' },
          }))
        })
        assert.equal(await retry.isVisible(), true, '其他文档、过期入口及未知状态不能覆盖失败结果')
        await retry.click()
        const frame = await waitReady(page)
        await frame.getByRole('heading', { name: '预览恢复样例', exact: true }).waitFor()
        await page.evaluate(() => {
          window.dispatchEvent(new MessageEvent('message', {
            source: document.querySelector('iframe').contentWindow,
            data: { type: 'ui-design-preview-status', previewId: 'help-0', status: 'failed' },
          }))
        })
        assert.equal(await retry.isVisible(), false, '旧重置代次的回执不能污染已恢复的预览')
        await assertNoHorizontalOverflow(page)
      },
    })),
  ]
}
