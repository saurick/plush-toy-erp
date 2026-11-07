import { writeFile } from 'node:fs/promises'
import { expect } from 'playwright/test'
import { businessSplitLayoutButton } from './businessSplitActions.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'

export function createBusinessSplitRecoveryScenarios({ assert, customerRuntimeEffectiveSession, outputDir }) {
  return ['light', 'dark'].map((themeMode) => ({
    name: `business-split-task-drawer-recovery-${themeMode}`,
    path: '/erp/warehouse/inbound',
    auth: 'admin',
    themeMode,
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    effectiveSession: {
      ...customerRuntimeEffectiveSession,
      workflow_visible_owner_role_keys_by_capability: {
        'workflow.task.read': ['warehouse'],
        'workflow.task.update': ['warehouse'],
        'workflow.task.complete': ['warehouse'],
      },
    },
    workflowTaskFixtures: Array.from({ length: 20 }, (_, index) => ({
      id: 9410 + index,
      version: 1,
      task_code: `STYLE-L1-SPLIT-${index + 1}`,
      task_name: `模拟分栏任务 ${index + 1}`,
      task_group: 'trial_warehouse_work',
      source_type: 'shipping-release',
      source_id: 9410 + index,
      source_no: `OUT-STYLE-L1-${index + 1}`,
      task_status_key: 'ready',
      owner_role_key: 'warehouse',
      created_at: 1790085600,
      payload: { product_name: '模拟云朵小熊', product_code: 'STYLE-PRODUCT-01' },
    })),
    verify: async (page) => {
      const evidence = { cycles: [], openDrags: [], geometryMutations: 0 }
      const session = page.context().browser().browserType().name() === 'chromium' ? await page.context().newCDPSession(page) : null
      const snapshot = async (label) => {
        await session?.send('HeapProfiler.collectGarbage')
        const counters = await session?.send('Memory.getDOMCounters')
        return { label, ...counters }
      }
      try {
        await page.getByRole('button', { name: '分栏', exact: true }).first().click()
        const primary = page.locator('.erp-split-pane--left')
        const secondary = page.locator('.erp-split-pane--right')
        const picker = secondary.getByRole('combobox', { name: '选择右栏页面' })
        await picker.click()
        await picker.fill('任务管理')
        await page.locator('.ant-select-dropdown:visible').getByText('任务管理', { exact: true }).click()
        const trigger = secondary.getByRole('button', { name: '查看模拟分栏任务 1详情', exact: true })
        await trigger.waitFor()
        await businessSplitLayoutButton(page).click()
        await page.getByRole('button', { name: '左右互换' }).click()
        await expect(secondary).toHaveAttribute('aria-label', '左栏页面')
        await primary.locator('.ant-table-tbody > tr.ant-table-row').first().dblclick()
        const detail = page.getByRole('dialog', { name: /采购入库详情/u })
        await detail.waitFor()
        await page.evaluate(() => {
          const observer = new MutationObserver((entries) => { window.__splitGeometryProbe.count += entries.length })
          window.__splitGeometryProbe = { observer, count: 0 }
          document.querySelectorAll('.app-overlay-scope').forEach((node) => observer.observe(node, { attributes: true, attributeFilter: ['style'] }))
        })
        evidence.start = await snapshot('opened-pages')
        const panels = page.locator('.erp-split-panels')
        for (let index = 0; index < 12; index += 1) {
          for (const ratio of [0.4, 0.6]) {
            const bar = await panels.locator(':scope > .ant-splitter-bar .ant-splitter-bar-dragger').boundingBox()
            const bounds = await panels.boundingBox()
            await page.mouse.move(bar.x + bar.width / 2, bar.y + 12)
            await page.mouse.down()
            await page.mouse.move(bounds.x + bounds.width * ratio, bar.y + 12, { steps: 6 })
            await page.mouse.up()
          }
          await trigger.click()
          const drawer = page.locator('.erp-task-action-drawer-root.ant-drawer-open')
          await expect(drawer).toHaveClass(/ant-drawer-open/u)
          const drawerNode = await drawer.elementHandle()
          await waitForFiniteAnimations(page)
          if (index === 0) {
            for (const ratio of [0.45, 0.6]) {
              const bounds = await panels.boundingBox()
              const bar = await panels.locator(':scope > .ant-splitter-bar .ant-splitter-bar-dragger').boundingBox()
              const start = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.getAttribute('class'), { x: bar.x + bar.width / 2, y: bar.y + bar.height / 2 })
              await page.evaluate(() => window.getSelection()?.removeAllRanges())
              await page.mouse.move(bar.x + bar.width / 2, bar.y + bar.height / 2)
              await page.mouse.down()
              await page.mouse.move(bounds.x + bounds.width * ratio, bar.y + bar.height / 2, { steps: 8 })
              const probe = await panels.locator(':scope > .ant-splitter-bar .ant-splitter-bar-preview').evaluate((node) => {
                const rect = node.getBoundingClientRect()
                const pointerOwner = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)?.getAttribute('class')
                const previous = node.style.pointerEvents
                const masks = [...document.querySelectorAll('.ant-splitter-mask')].map((mask) => [mask, mask.style.pointerEvents])
                masks.forEach(([mask]) => { mask.style.pointerEvents = 'none' })
                node.style.pointerEvents = 'auto'
                const top = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
                node.style.pointerEvents = previous
                masks.forEach(([mask, value]) => { mask.style.pointerEvents = value })
                const stack = []
                for (let parent = node; parent && stack.length < 12; parent = parent.parentElement) {
                  const style = getComputedStyle(parent)
                  stack.push({ class: parent.getAttribute('class'), position: style.position, z: style.zIndex, contain: style.contain, containerType: style.containerType, isolation: style.isolation, transform: style.transform })
                }
                return { x: rect.x, width: rect.width, offset: node.style.getPropertyValue('--ant-splitter-bar-preview-offset'), paintedAbove: top === node, blocker: top?.getAttribute('class'), pointerOwner, selectionCollapsed: window.getSelection()?.isCollapsed !== false, stack }
              })
              evidence.openDrags.push({ ratio, start, probe })
              assert.ok(Math.abs(Number.parseFloat(probe.offset)) > 40, `浮层打开时拖动必须更新预览位置：${JSON.stringify(probe)}`)
              assert.equal(probe.paintedAbove, true, `拖动预览线必须显示在浮层上方：${JSON.stringify(probe)}`)
              assert.match(probe.pointerOwner || '', /ant-splitter-mask/u)
              assert.equal(probe.selectionCollapsed, true, '拖动分隔条不能选择抽屉中的文字')
              await page.screenshot({ path: `${outputDir}/business-split-open-drag-${themeMode}-${ratio === 0.45 ? 'left' : 'right'}.png`, fullPage: true })
              await page.mouse.up()
              await expect.poll(async () => (await secondary.boundingBox()).width / bounds.width).toBeCloseTo(ratio, 2)
              await expect(panels.locator(':scope > .ant-splitter-bar')).toHaveCSS('z-index', 'auto')
              await expect(panels.locator(':scope > .ant-splitter-mask')).toHaveCount(0)
              await expect(drawer).toHaveClass(/ant-drawer-open/u)
              await expect(detail).toBeVisible()
            }
          }
          if (index === 0) await page.screenshot({ path: `${outputDir}/business-split-recovery-${themeMode}-both-open.png`, fullPage: true })
          if (index % 3 === 1) {
            await drawer.getByRole('button', { name: '返回列表', exact: true }).focus()
            await page.keyboard.press('Escape')
          } else if (index % 3 === 2) {
            await drawer.locator('.ant-drawer-mask').click({ position: { x: 8, y: 24 } })
          } else {
            await drawer.getByRole('button', { name: '返回列表', exact: true }).click()
          }
          await expect(drawer).toHaveCount(0)
          await waitForFiniteAnimations(page)
          const retained = await drawerNode.evaluate((node) => ({ connected: node.isConnected, scoped: Boolean(node.closest('.app-overlay-scope')), pointerEvents: getComputedStyle(node).pointerEvents }))
          const hit = await trigger.evaluate((node) => {
            const rect = node.getBoundingClientRect()
            const element = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
            return { targetHit: node === element || node.contains(element), blocker: element?.getAttribute('class'), inert: Boolean(node.closest('[inert]')), splitterMasks: document.querySelectorAll('.ant-splitter-mask').length, closedDrawers: [...document.querySelectorAll('.erp-task-action-drawer-root')].map((drawer) => ({ scoped: Boolean(drawer.closest('.app-overlay-scope')), pointerEvents: getComputedStyle(drawer).pointerEvents, left: drawer.getBoundingClientRect().left })) }
          })
          evidence.cycles.push({ index, hit, retained })
          await drawerNode.dispose()
          assert.equal(hit.targetHit, true, `关闭任务抽屉后必须能点击原页面：${JSON.stringify(hit)}`)
          assert.equal(hit.inert, false)
          assert.equal(retained.connected, true)
          assert.equal(retained.pointerEvents, 'none')
          await secondary.getByRole('button', { name: '刷新当前页', exact: true }).click()
          await page.waitForLoadState('networkidle')
          await trigger.waitFor()
          await expect(detail).toBeVisible()
          if (index === 2) evidence.warm = await snapshot('three-cycles')
        }
        evidence.end = await snapshot('twelve-cycles')
        if (session) assert.ok(evidence.end.jsEventListeners - evidence.warm.jsEventListeners < 120, '反复拖动和开关抽屉不能持续累积监听')
        await detail.getByRole('button', { name: '关闭', exact: true }).click()
        await detail.waitFor({ state: 'hidden' })
        await primary.getByRole('button', { name: '刷新当前页', exact: true }).click()
        await page.waitForLoadState('networkidle')
        await expect(primary.getByRole('button', { name: '刷新当前页', exact: true })).not.toHaveClass(/ant-btn-loading/u)
        await expect(primary.locator('.ant-spin-spinning')).toHaveCount(0)
        await expect(primary.getByRole('textbox', { name: /可搜索：入库单号/u })).toHaveAttribute('aria-label', /来源产品名称或编号/u)
        evidence.restored = await snapshot('all-overlays-closed')
        await page.screenshot({ path: `${outputDir}/business-split-recovery-${themeMode}-restored.png`, fullPage: true })
      } finally {
        evidence.geometryMutations = await page.evaluate(() => {
          const probe = window.__splitGeometryProbe
          probe?.observer.disconnect()
          delete window.__splitGeometryProbe
          return probe?.count || 0
        })
        await writeFile(`${outputDir}/business-split-recovery-${themeMode}.json`, JSON.stringify(evidence, null, 2))
        await session?.detach()
      }
    },
  }))
}
