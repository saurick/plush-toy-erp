import fs from 'node:fs/promises'
import { expect } from 'playwright/test'
import { chooseChainScope, chooseGranularity, chooseLayout, chooseExplorerAction } from './devFlowExplorerControls.mjs'

const workingKey = 'plush-workbench:business-chain-design:working'
const draft = {
  nodes: [
    { id: 'node:sales_order', x: -220, y: -80, manual: true },
    { id: 'node:purchase_order', x: 420, y: 1440, manual: true },
    { id: 'node:purchase_lot', x: 900, y: 80, manual: true },
  ],
  edges: [{ from: 'node:sales_order', to: 'node:purchase_lot', kind: 'unknown' }],
  presentation: { mode: 'all', highlightedRoles: ['sales', 'warehouse', 'boss', 'engineering', 'pmc'], layout: 'lanes' },
}

export function createFlowExplorerExportScenario({ assert, assertNoHorizontalOverflow, startNoWriteAudit }) {
  const writes = new WeakMap()
  return {
    name: 'dev-flow-explorer-export-desktop',
    path: '/__dev/flow-explorer',
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    beforeNavigate: async (page) => {
      startNoWriteAudit(page, writes)
      await page.addInitScript(({ workingKey, draft }) => {
        if (!sessionStorage.getItem(workingKey)) sessionStorage.setItem(workingKey, JSON.stringify({ draft }))
      }, { workingKey, draft })
    },
    verify: async (page) => {
      const more = page.getByRole('button', { name: '更多视图操作' })
      const exportButton = page.getByRole('menuitem', { name: '导出当前范围', exact: true })
      await more.click()
      await expect(exportButton).toBeEnabled()
      await page.keyboard.press('Escape')
      await expect(page.locator('[data-design-node]')).toHaveCount(3)
      await expect(page.getByRole('button', { name: '适应画布全图', exact: true })).toHaveAttribute('aria-pressed', 'true')
      await page.getByRole('button', { name: '重置画布为 100%', exact: true }).click()
      const before = await page.evaluate((key) => ({
        working: sessionStorage.getItem(key),
        surface: document.querySelector('.erp-chain-design__surface').style.transform,
        nodes: [...document.querySelectorAll('[data-design-node]')].map((node) => [node.dataset.designNode, node.style.left, node.style.top]),
      }), workingKey)
      const dialog = page.getByRole('dialog', { name: '导出当前范围', exact: true })
      const openExport = async () => {
        await chooseExplorerAction(page, '导出当前范围')
        await expect(dialog.getByRole('checkbox', { name: '附带图例', exact: true })).toBeFocused()
      }
      const exportFile = async (format) => {
        const [download] = await Promise.all([
          page.waitForEvent('download'),
          dialog.getByRole('button', { name: `导出 ${format}`, exact: true }).click(),
        ])
        await expect(dialog).toBeHidden()
        await expect(more).toBeFocused()
        return fs.readFile(await download.path())
      }
      await openExport()
      await expect(page.getByRole('checkbox', { name: '附带图例', exact: true })).toBeChecked()
      await expect(page.getByRole('checkbox', { name: '附带操作说明', exact: true })).toBeChecked()
      const svg = (await exportFile('SVG')).toString()
      assert(svg.includes('操作说明（在流程探索页面使用）'))
      assert(svg.includes('图例'))
      assert(svg.includes('业务全流程地图'))
      assert(svg.includes('高亮岗位：业务、仓库、老板、工程、PMC'))
      assert.match(svg, /data-export-node="node:sales_order"><title>共同 · 业务、仓库、老板、工程、PMC<\/title>(?:(?!<\/g>)[\s\S])*…<\/text>/u)
      assert.match(svg, /data-export-node="node:purchase_order"><title>仓库<\/title>/u)
      assert.equal((svg.match(/data-export-node=/gu) || []).length, 3)
      const laneStyles = await page.locator('.erp-chain-design__lane').evaluateAll((lanes) => lanes.map((lane) => ({ domain: lane.dataset.domain, fill: getComputedStyle(lane).backgroundColor, border: getComputedStyle(lane).borderTopColor })))
      assert.equal((svg.match(/data-export-lane=/gu) || []).length, laneStyles.length)
      for (const lane of laneStyles) {
        assert(svg.includes(`data-export-lane="${lane.domain}"`))
        assert(svg.includes(`fill="${lane.fill}" stroke="${lane.border}"`), '导出沿用屏幕泳道的底色和边框')
      }
      assert(!svg.includes('foreignObject'))
      assert.match(svg, /data-export-edge="unknown"[^]*?<text[^>]*>待核对的参考线<\/text>/u)
      const dimensions = svg.match(/<svg[^>]+width="(\d+)" height="(\d+)"/u)
      assert(dimensions)
      assert(Number(dimensions[2]) > 1528, '包含屏幕外节点以及页尾说明')
      await openExport()
      const png = await exportFile('PNG')
      assert.equal(png.subarray(1, 4).toString(), 'PNG')
      assert.equal(png.readUInt32BE(16), Number(dimensions[1]) * 2)
      assert.equal(png.readUInt32BE(20), Number(dimensions[2]) * 2)
      if (process.env.STYLE_L1_OUTPUT_DIR) {
        await fs.writeFile(`${process.env.STYLE_L1_OUTPUT_DIR}/flow-explorer-export.svg`, svg)
        await fs.writeFile(`${process.env.STYLE_L1_OUTPUT_DIR}/flow-explorer-export.png`, png)
      }
      const after = await page.evaluate((key) => ({
        working: sessionStorage.getItem(key),
        surface: document.querySelector('.erp-chain-design__surface').style.transform,
        nodes: [...document.querySelectorAll('[data-design-node]')].map((node) => [node.dataset.designNode, node.style.left, node.style.top]),
      }), workingKey)
      assert.deepEqual(after, before, '导出不改动草稿、排布与镜头')
      await openExport()
      await page.getByRole('checkbox', { name: '附带图例', exact: true }).uncheck()
      await page.getByRole('checkbox', { name: '附带操作说明', exact: true }).uncheck()
      const plain = (await exportFile('SVG')).toString()
      assert(!plain.includes('操作说明（在流程探索页面使用）'))
      assert(!plain.includes('>图例<'))
      assert.equal((plain.match(/data-export-node=/gu) || []).length, 3)

      // Moving one node well outside the viewport exercises the bounded PNG path
      // without asking the browser to allocate an oversized bitmap.
      await page.evaluate((key) => {
        const value = JSON.parse(sessionStorage.getItem(key))
        value.draft.nodes[1].y = 20000
        sessionStorage.setItem(key, JSON.stringify(value))
      }, workingKey)
      await page.reload()
      await expect(page.locator('[data-design-node]')).toHaveCount(3)
      await openExport()
      await page.getByRole('button', { name: '导出 PNG', exact: true }).click()
      await expect(page.getByRole('alert').filter({ hasText: '当前图过大' })).toBeVisible()
      const largeSvg = (await exportFile('SVG')).toString()
      assert(Number(largeSvg.match(/<svg[^>]+width="(\d+)" height="(\d+)"/u)[2]) > 20000)
      await openExport()
      await page.getByRole('checkbox', { name: '附带图例', exact: true }).press('Escape')
      await expect(page.getByRole('dialog', { name: '导出当前范围', exact: true })).toBeHidden()
      await page.goto(new URL('/__dev/flow-explorer?new=blank', page.url()).href)
      await more.click()
      await expect(exportButton).toBeDisabled()
      await page.keyboard.press('Escape')
      await chooseChainScope(page, '销售受理到生产准备')
      await chooseLayout(page, '业务泳道')
      await chooseGranularity(page, '业务步骤')
      await expect(page.locator('.erp-chain-design__lane').first()).toBeVisible()
      const count = await page.locator('[data-design-node]').count()
      await openExport()
      const salesSvg = (await exportFile('SVG')).toString()
      assert.equal((salesSvg.match(/data-export-node=/gu) || []).length, count)
      await openExport()
      const salesPng = await exportFile('PNG')
      if (process.env.STYLE_L1_OUTPUT_DIR) {
        await fs.writeFile(`${process.env.STYLE_L1_OUTPUT_DIR}/sales-lanes-export.svg`, salesSvg)
        await fs.writeFile(`${process.env.STYLE_L1_OUTPUT_DIR}/sales-lanes-export.png`, salesPng)
      }
      await chooseGranularity(page, '节点明细')
      const exceptions = page.getByRole('checkbox', { name: '异常与回接', exact: true })
      await exceptions.check()
      const frames = [
        ['驳回销售订单', 'dashed'],
        ['销售订单审批驳回结束', 'dashed'],
        ['订单审批', 'solid'],
        ['生效销售订单', 'solid'],
      ]
      await openExport()
      const branchSvg = (await exportFile('SVG')).toString()
      const exportBorders = await page.evaluate((source) => {
        const doc = new DOMParser().parseFromString(source, 'image/svg+xml')
        return Object.fromEntries([...doc.querySelectorAll('[data-export-node]')].map((node) => [
          node.getAttribute('data-export-node'), node.querySelector('rect').hasAttribute('stroke-dasharray'),
        ]))
      }, branchSvg)
      for (const [label, border] of frames) {
        const body = page.getByRole('button', { name: `查看节点：${label}`, exact: true }).first()
        await expect(body).toHaveCSS('border-top-style', border)
        const id = await body.locator('..').getAttribute('data-design-node')
        assert.equal(exportBorders[id], border === 'dashed', id)
      }
      await exceptions.uncheck()
      await chooseGranularity(page, '业务步骤')
      await chooseChainScope(page, '首款、结算与退款')
      await exceptions.check()
      const corrections = page.getByRole('checkbox', { name: '过账后纠正', exact: true })
      await corrections.check()
      await page.getByRole('button', { name: '图例与操作说明', exact: true }).click()
      const legend = page.getByRole('dialog', { name: '画布图例', exact: true })
      for (const [kind, example, label, dash] of [
        ['correction', '冲正后恢复未结余额', '过账后纠正', '9px, 4px, 2px, 4px'],
        ['exception', '驳回收付款', '异常分支', '8px, 5px'],
      ]) {
        const sample = legend.locator(`[data-legend-edge="${kind}"]`)
        await expect(sample).toHaveText(label)
        const color = await sample.evaluate((el) => getComputedStyle(el).color)
        const edge = page.locator(`[data-design-edge="${kind}"]`).filter({ hasText: example }).first()
        for (const group of [edge, sample]) {
          const path = group.locator('.erp-chain-design__edge')
          await expect(path).toHaveCSS('stroke-dasharray', dash)
          await expect(path).toHaveCSS('stroke', color)
          const fill = await path.evaluate((el) => {
            const id = el.getAttribute('marker-end').slice(5, -1)
            return getComputedStyle(document.getElementById(id).querySelector('path')).fill
          })
          assert.equal(fill, color)
        }
        await expect(edge.locator('text')).toHaveCSS('fill', color)
      }
      await legend.press('Escape')
      await openExport()
      const financeSvg = (await exportFile('SVG')).toString()
      assert.match(financeSvg, /data-export-edge="correction"[^]*?stroke-dasharray="9 4 2 4" marker-end="url\(#export-arrow-correction\)"/u)
      assert(financeSvg.includes('>过账后纠正</text>'))
      await corrections.uncheck()
      await expect(page.locator('[data-design-edge="correction"]')).toHaveCount(0)
      await expect(page.locator('[data-design-edge="exception"]').first()).toBeVisible()
      await exceptions.uncheck()
      await chooseChainScope(page, '采购下单到入库应付')
      const impact = page.getByRole('checkbox', { name: '横切影响', exact: true })
      await impact.check()
      await page.getByRole('checkbox', { name: '主线与供给' }).uncheck()
      await expect(page.locator('[data-design-node]')).toHaveCount(0)
      await openExport()
      const impactSvg = (await exportFile('SVG')).toString()
      assert(impactSvg.includes('横切修正采购库存') && !impactSvg.includes('NaN') && !impactSvg.includes('Infinity'))
      await impact.uncheck()
      await page.getByRole('button', { name: '跨链交接', exact: true }).click()
      await page.getByRole('checkbox', { name: '异常与回接' }).check()
      await page.getByRole('checkbox', { name: '主线与供给' }).uncheck()
      await openExport()
      const handoffSvg = (await exportFile('SVG')).toString()
      assert(handoffSvg.includes('data-export-handoffs="true"'))
      assert(handoffSvg.includes('采购下单到入库应付 → 采购拒收处置：质检拒绝进入处置'))
      assert(handoffSvg.includes('采购拒收处置 → 采购下单到入库应付：补换待收重新进入收货与检验'))
      assert(!handoffSvg.includes('用料批准后按厂商生成采购单'))
      await page.getByRole('button', { name: '全屏探索', exact: true }).click()
      await openExport()
      await page.getByRole('checkbox', { name: '附带图例', exact: true }).press('Escape')
      await expect(page.getByRole('dialog', { name: '导出当前范围', exact: true })).toBeHidden()
      await expect(page.getByRole('dialog', { name: '流程探索全屏', exact: true })).toBeVisible()
      await page.getByRole('button', { name: '退出全屏', exact: true }).click()
      await openExport()
      await assertNoHorizontalOverflow(page)
      assert.deepEqual(writes.get(page), [], '导出只生成本地文件，不调用业务写接口')
    },
  }
}
