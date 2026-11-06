import { writeFile } from 'node:fs/promises'
import { businessSplitLayoutButton, collapseBusinessSplit } from './businessSplitActions.mjs'
import { installBOMMaterialMatchingMocks } from './bomMaterialMatchingScenarios.mjs'
import { stylePaginatedRpcData, styleRpcResult } from './rpcMockResult.mjs'

export function createBusinessSplitPerformanceScenarios({ assert, customerRuntimeEffectiveSession, outputDir }) {
  const calls = []
  return [{
    name: 'business-split-performance',
    path: '/erp/master/materials',
    auth: 'admin',
    effectiveSession: customerRuntimeEffectiveSession,
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    beforeNavigate: async (page) => {
      calls.length = 0
      const records = await installBOMMaterialMatchingMocks(page)
      while (records.length < 50) {
        const id = 1000 + records.length
        records.push({ id, code: `MAT-PERF-${id}`, name: `模拟面料 ${id}`, default_unit_id: 1, is_active: true })
      }
      await page.route('**/rpc/masterdata', async (route) => {
        const { id, method, params = {} } = route.request().postDataJSON()
        calls.push(method)
        let data
        if (method === 'create_material') {
          const material = { ...params, id: 2000 + records.length, is_active: true }
          records.unshift(material)
          data = { material }
        } else if (method === 'get_material') data = { material: records.find((row) => row.id === params.id) }
        else if (method === 'list_materials') data = stylePaginatedRpcData(records, 'materials', params)
        else return route.fallback()
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id, result: styleRpcResult(data) }) })
      })
    },
    verify: async (page) => {
      const session = page.context().browser().browserType().name() === 'chromium'
        ? await page.context().newCDPSession(page) : null
      const evidence = { datasetRows: 50, viewport: '1920x1080 CSS px; DPR 2', samples: [], operations: {} }
      const count = (method) => calls.filter((value) => value === method).length
      const snapshot = async (state) => {
        await session?.send('HeapProfiler.collectGarbage')
        const dom = await session?.send('Memory.getDOMCounters')
        const { metrics = [] } = await session?.send('Performance.getMetrics') || {}
        const values = Object.fromEntries(metrics.map((entry) => [entry.name, entry.value]))
        const sample = {
          state,
          documentElements: await page.locator('*').count(),
          domNodes: dom?.nodes,
          listeners: dom?.jsEventListeners,
          heapUsedBytes: values.JSHeapUsedSize,
          taskSeconds: values.TaskDuration,
          listRequests: count('list_materials'),
        }
        evidence.samples.push(sample)
        return sample
      }
      const resizeSample = async (state) => {
        const panels = page.locator('.erp-split-panels')
        const bar = panels.locator(':scope > .ant-splitter-bar .ant-splitter-bar-dragger')
        const bounds = await panels.boundingBox()
        const handle = await bar.boundingBox()
        const before = await session?.send('Performance.getMetrics')
        await page.evaluate(() => {
          const pane = document.querySelector('.erp-split-pane--left')
          const sample = { frames: [], frame: 0 }
          window.__splitResizeSample = sample
          const tick = (time) => {
            if (sample.frames.length < 240) sample.frames.push({ time, width: pane.getBoundingClientRect().width })
            sample.frame = requestAnimationFrame(tick)
          }
          sample.frame = requestAnimationFrame(tick)
        })
        const started = performance.now()
        await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
        await page.mouse.down()
        await page.mouse.move(bounds.x + bounds.width * 0.63, handle.y + handle.height / 2, { steps: 60 })
        const duringWidth = (await page.locator('.erp-split-pane--left').boundingBox()).width
        await page.mouse.up()
        await page.waitForTimeout(100)
        const frames = await page.evaluate(() => {
          const sample = window.__splitResizeSample
          cancelAnimationFrame(sample.frame)
          delete window.__splitResizeSample
          return sample.frames
        })
        const metrics = Object.fromEntries((await session?.send('Performance.getMetrics'))?.metrics?.map((entry) => [entry.name, entry.value]) || [])
        const previous = Object.fromEntries(before?.metrics?.map((entry) => [entry.name, entry.value]) || [])
        const intervals = frames.slice(1).map((frame, index) => frame.time - frames[index].time).sort((a, b) => a - b)
        const sample = { state, pointerSteps: 60, durationMs: performance.now() - started, changedFrames: frames.slice(1).filter((frame, index) => Math.abs(frame.width - frames[index].width) > 0.5).length, frameCount: frames.length, p95FrameMs: intervals[Math.floor(intervals.length * 0.95)], maxFrameMs: intervals.at(-1), duringWidth, endWidth: (await page.locator('.erp-split-pane--left').boundingBox()).width, taskSeconds: metrics.TaskDuration - previous.TaskDuration, layoutCount: metrics.LayoutCount - previous.LayoutCount, recalcCount: metrics.RecalcStyleCount - previous.RecalcStyleCount }
        evidence.operations.resize ||= []
        evidence.operations.resize.push(sample)
        await businessSplitLayoutButton(page).click()
        await page.locator('.erp-split-layout-options input').fill('50')
        await page.locator('.erp-split-layout-options input').blur()
        await businessSplitLayoutButton(page).click()
      }
      const open = () => page.getByRole('button', { name: '分栏', exact: true }).first().click()
      const right = page.getByRole('region', { name: '右栏页面', exact: true })
      const left = page.locator('.erp-split-pane--left')
      const collapse = () => collapseBusinessSplit(page)
      const create = async (pane, name) => {
        await pane.getByRole('button', { name: '新建材料' }).click()
        const editor = pane.locator('.erp-business-form-page:not([hidden])')
        await editor.getByLabel('名称', { exact: true }).fill(name)
        await editor.getByLabel('库存类别', { exact: true }).click()
        await page.locator('.ant-select-dropdown:visible').getByText('主料', { exact: true }).click()
        await editor.getByRole('button', { name: '保存', exact: true }).click()
        await editor.waitFor({ state: 'hidden' })
        await left.getByText(name, { exact: true }).waitFor()
        await page.waitForLoadState('networkidle')
      }
      try {
        await session?.send('Performance.enable')
        await page.getByRole('button', { name: '新建材料' }).waitFor()
        await page.waitForLoadState('networkidle')
        await snapshot('single-page')
        const beforeEmpty = count('list_materials')
        await open()
        await right.waitFor()
        assert.equal(count('list_materials'), beforeEmpty, '空分栏不读取另一份业务列表')
        await snapshot('empty-split')
        await right.getByRole('combobox', { name: '选择右栏页面' }).click()
        await right.getByRole('combobox', { name: '选择右栏页面' }).fill('材料档案')
        await page.locator('.ant-select-dropdown:visible').getByText('材料档案', { exact: true }).click()
        await right.getByRole('button', { name: '新建材料' }).waitFor()
        await page.waitForLoadState('networkidle')
        await snapshot('two-pages')
        await resizeSample('original-order')
        await businessSplitLayoutButton(page).click()
        await page.getByRole('button', { name: '左右互换' }).click()
        await resizeSample('swapped-order')
        await businessSplitLayoutButton(page).click()
        await page.getByRole('button', { name: '左右互换' }).click()
        const idleBefore = count('list_materials')
        const idleStart = await snapshot('idle-start')
        await page.waitForTimeout(1000)
        const idleEnd = await snapshot('idle-end')
        assert.equal(count('list_materials'), idleBefore, '静置不应轮询业务列表')
        evidence.operations.idleTaskSeconds = idleEnd.taskSeconds - idleStart.taskSeconds
        let reads = count('list_materials')
        await create(right, '双栏保存模拟物料')
        evidence.operations.visibleSaveListReads = count('list_materials') - reads
        await snapshot('visible-save')
        await collapse()
        await right.waitFor({ state: 'hidden' })
        await snapshot('collapsed')
        reads = count('list_materials')
        await create(left, '收起后保存模拟物料')
        evidence.operations.collapsedSaveListReads = count('list_materials') - reads
        await snapshot('collapsed-save')
        reads = count('list_materials')
        let cycles = 0
        for (const batch of [3, 9, 12]) {
          for (let index = 0; index < batch; index += 1) {
            await open()
            await right.waitFor()
            await collapse()
          }
          cycles += batch
          await page.waitForTimeout(1000)
          await snapshot(`after-${cycles}-toggle-cycles`)
        }
        await page.waitForLoadState('networkidle')
        assert.equal(count('list_materials'), reads, '重复展开收起保留页面，不重复查询')
        evidence.operations.toggleCycles = cycles
        await open()
        await right.locator('.erp-split-page-title:visible .ant-select-clear').click()
        await right.getByText('点击标题选择页面，或将左侧菜单拖到这里', { exact: true }).waitFor()
        await page.waitForLoadState('networkidle')
        await snapshot('right-page-cleared')
        await page.waitForTimeout(1000)
        await snapshot('right-page-cleared-settled')
        await page.screenshot({ path: `${outputDir}/business-split-performance.png`, fullPage: true })
      } finally {
        await writeFile(`${outputDir}/business-split-performance.json`, JSON.stringify(evidence, null, 2))
        await session?.detach()
      }
    },
  }]
}
