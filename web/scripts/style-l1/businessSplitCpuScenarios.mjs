import { businessSplitLayoutButton } from './businessSplitActions.mjs'
import { writeFile } from 'node:fs/promises'
import { installBOMMaterialMatchingMocks } from './bomMaterialMatchingScenarios.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'

const percentile = (values, fraction) => {
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] || 0
}

export function createBusinessSplitCpuScenarios({ assert, customerRuntimeEffectiveSession, outputDir }) {
  return [4, 6].map((rate) => ({
    name: `business-split-cpu-${rate}x`,
    path: '/erp/master/materials',
    auth: 'admin',
    effectiveSession: customerRuntimeEffectiveSession,
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    beforeNavigate: async (page) => {
      const records = await installBOMMaterialMatchingMocks(page)
      while (records.length < 50) {
        const id = 1000 + records.length
        records.push({ id, code: `MAT-CPU-${id}`, name: `模拟面料 ${id}`, default_unit_id: 1, is_active: true })
      }
    },
    verify: async (page) => {
      assert.equal(page.context().browser().browserType().name(), 'chromium', 'CPU 降速由 Chromium CDP 提供')
      const session = await page.context().newCDPSession(page)
      const evidence = { cpuSlowdown: rate, datasetRowsPerPane: 50, viewport: '1920x1080 CSS px; DPR2', samples: [], scope: 'CPU simulation on one host; not a low-end device or GPU/memory benchmark' }
      const left = page.locator('.erp-split-pane--left')
      const right = page.locator('.erp-split-pane--right')
      const panels = page.locator('.erp-split-panels')
      const metrics = async () => Object.fromEntries((await session.send('Performance.getMetrics')).metrics.map(({ name, value }) => [name, value]))
      const reset = async () => {
        await businessSplitLayoutButton(page).click()
        const input = page.locator('.erp-split-layout-options input')
        await input.fill('50')
        await input.blur()
        await businessSplitLayoutButton(page).click()
        await waitForFiniteAnimations(page)
        await page.waitForTimeout(250)
      }
      const drag = async (order, repetition) => {
        const bounds = await panels.boundingBox()
        const handle = await panels.locator(':scope > .ant-splitter-bar .ant-splitter-bar-dragger').boundingBox()
        const originalWidth = (await left.boundingBox()).width
        await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
        await page.evaluate(() => {
          const probe = { frames: [], phase: 'drag', releaseAt: 0, frame: 0 }
          const tick = (time) => {
            probe.frames.push({ time, phase: probe.phase })
            probe.frame = requestAnimationFrame(tick)
          }
          probe.frame = requestAnimationFrame(tick)
          window.addEventListener('mouseup', () => { probe.phase = 'release'; probe.releaseAt = performance.now() }, { once: true, capture: true })
          window.__splitCpuProbe = probe
        })
        const before = await metrics()
        await page.mouse.down()
        await page.mouse.move(bounds.x + bounds.width * 0.63, handle.y + handle.height / 2, { steps: 60 })
        const duringWidth = (await left.boundingBox()).width
        const beforeRelease = await metrics()
        await page.mouse.up()
        await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
        const afterRelease = await metrics()
        await page.waitForTimeout(160)
        const probe = await page.evaluate(() => {
          const result = window.__splitCpuProbe
          cancelAnimationFrame(result.frame)
          delete window.__splitCpuProbe
          return { frames: result.frames, releaseAt: result.releaseAt }
        })
        const endWidth = (await left.boundingBox()).width
        const during = []
        const release = []
        for (let index = 1; index < probe.frames.length; index += 1) {
          const current = probe.frames[index]
          const interval = current.time - probe.frames[index - 1].time
          ;(current.phase === 'drag' ? during : release).push(interval)
        }
        const sample = {
          order,
          repetition,
          originalWidth,
          duringWidth,
          endWidth,
          dragFrameP95Ms: percentile(during, 0.95),
          dragFrameMaxMs: Math.max(0, ...during),
          releaseFrameMaxMs: Math.max(0, ...release),
          releaseFirstFrameMs: (probe.frames.find(({ phase }) => phase === 'release')?.time || probe.releaseAt) - probe.releaseAt,
          dragTaskMs: (beforeRelease.TaskDuration - before.TaskDuration) * 1000,
          releaseTaskMs: (afterRelease.TaskDuration - beforeRelease.TaskDuration) * 1000,
          releaseLayoutMs: (afterRelease.LayoutDuration - beforeRelease.LayoutDuration) * 1000,
          releaseStyleMs: (afterRelease.RecalcStyleDuration - beforeRelease.RecalcStyleDuration) * 1000,
          releaseLayouts: afterRelease.LayoutCount - beforeRelease.LayoutCount,
          releaseRecalcs: afterRelease.RecalcStyleCount - beforeRelease.RecalcStyleCount,
        }
        evidence.samples.push(sample)
        assert.ok(Math.abs(duringWidth - originalWidth) < 1, '拖动中保留原页面宽度，只移动预览')
        assert.ok(Math.abs(endWidth - originalWidth) > 100, '松手后提交页面宽度')
        assert.equal(await panels.locator(':scope > .ant-splitter-mask').count(), 0, '松手后移除拖动保护层')
        return sample
      }
      const traceDrag = async () => {
        await reset()
        await session.send('Tracing.start', { categories: 'devtools.timeline,blink.user_timing', transferMode: 'ReturnAsStream' })
        await drag('swapped-trace', 0)
        const complete = new Promise((resolve) => session.once('Tracing.tracingComplete', resolve))
        await session.send('Tracing.end')
        const { stream } = await complete
        let trace = ''
        for (;;) {
          const chunk = await session.send('IO.read', { handle: stream })
          trace += chunk.data
          if (chunk.eof) break
        }
        await session.send('IO.close', { handle: stream })
        await writeFile(`${outputDir}/business-split-cpu-${rate}x-trace.json`, trace)
        const totals = {}
        for (const event of JSON.parse(trace).traceEvents) {
          if (!['Layout', 'UpdateLayoutTree', 'FunctionCall', 'EventDispatch'].includes(event.name) || !event.dur) continue
          const entry = totals[event.name] ||= { count: 0, totalMs: 0, maxMs: 0 }
          entry.count += 1
          entry.totalMs += event.dur / 1000
          entry.maxMs = Math.max(entry.maxMs, event.dur / 1000)
        }
        evidence.traceTotals = totals
      }
      try {
        await session.send('Performance.enable')
        await page.getByRole('button', { name: '分栏', exact: true }).first().click()
        const picker = right.getByRole('combobox', { name: '选择右栏页面' })
        await picker.click()
        await picker.fill('材料档案')
        await page.locator('.ant-select-dropdown:visible').getByText('材料档案', { exact: true }).click()
        await right.getByRole('button', { name: '新建材料' }).waitFor()
        await page.waitForLoadState('networkidle')
        await page.evaluate(() => document.fonts.ready)
        await waitForFiniteAnimations(page)
        await session.send('Emulation.setCPUThrottlingRate', { rate })
        for (const order of ['original', 'swapped']) {
          if (order === 'swapped') {
            await businessSplitLayoutButton(page).click()
            await page.getByRole('button', { name: '左右互换' }).click()
          }
          await reset()
          await drag(`${order}-warmup`, 0)
          for (let repetition = 1; repetition <= 3; repetition += 1) {
            await reset()
            await drag(order, repetition)
          }
        }
        if (rate === 6) await traceDrag()
        await reset()
        await right.getByRole('button', { name: '新建材料' }).click()
        const editor = right.locator('.erp-business-form-page:not([hidden])')
        await editor.getByLabel('名称', { exact: true }).fill('降速测试未保存草稿')
        await businessSplitLayoutButton(page).click()
        await page.locator('.erp-split-layout-options input').fill('40')
        await page.locator('.erp-split-layout-options input').blur()
        await businessSplitLayoutButton(page).click()
        assert.equal(await editor.getByLabel('名称', { exact: true }).inputValue(), '降速测试未保存草稿')
        await page.screenshot({ path: `${outputDir}/business-split-cpu-${rate}x-draft-viewport.png`, fullPage: false })
      } finally {
        await session.send('Emulation.setCPUThrottlingRate', { rate: 1 })
        await writeFile(`${outputDir}/business-split-cpu-${rate}x.json`, JSON.stringify(evidence, null, 2))
        await session.detach()
      }
    },
  }))
}
