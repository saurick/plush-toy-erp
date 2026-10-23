import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import { progressFixtureData, progressFixtureRow } from './businessProgressFixtures.mjs'
import { getContrastRatio, parseRgb } from './colorAssertions.mjs'

const shortReason = '等待客户补充资料。'
const longReason = '客户尚未确认包装色稿与吊牌资料，需要业务核对版本、采购确认补料交期后再恢复审批。'.repeat(3)
  + '\n待核对文件：PACKAGING_CONFIRMATION_REFERENCE_20261023_WITHOUT_SPACES_ABCDEFGHIJKLMNOPQRSTUVWXYZ'
const longOwner = '华东区域客户资料与包装确认负责人张小明'

export function createMobileTaskBlockerScenarios({ base, assert, assertNoHorizontalOverflow, outputDir }) {
  const fixtures = [
    { ...base.workflowTaskFixtures[0], task_name: '订单审批', blocked_reason: shortReason },
    { ...base.workflowTaskFixtures[0], id: 103, task_code: 'TASK-0103', source_id: 4, source_no: 'SO-0004', task_name: '确认面料交期与包装资料', blocked_reason: longReason, assignee_id: 8, discovery: { assignee_name: longOwner } },
    base.workflowTaskFixtures[1],
  ]
  return ['light', 'dark'].map((themeMode) => ({
    ...base,
    name: `mobile-task-blocker-${themeMode}`,
    themeMode,
    workflowTaskFixtures: fixtures,
    beforeNavigate: async (page) => {
      await base.beforeNavigate(page)
      await page.route('**/rpc/business', async (route) => {
        const { id, method, params = {} } = route.request().postDataJSON()
        if (method !== 'list_progress') return route.fallback()
        const data = progressFixtureData(params)
        const rows = [progressFixtureRow(0), progressFixtureRow(3)]
        rows.forEach((row, index) => Object.assign(row, {
          open_tasks: 1,
          blocked_tasks: 1,
          unassigned_tasks: index ? 0 : 1,
          blocked: true,
          attention_task_id: fixtures[index].id,
          attention_task: fixtures[index].task_name,
          attention_reason: fixtures[index].blocked_reason,
          attention_role: 'boss',
          attention_owner: index ? longOwner : '',
        }))
        data.rows = rows
        data.total = rows.length
        await route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 0, message: '', data } } })
      })
    },
    verify: async (page) => {
      const progress = page.getByTestId('mobile-progress-panel')
      const entries = progress.locator('button.mobile-progress-task-entry')
      await entries.nth(1).waitFor()
      const measurements = []
      const readTag = (root) => root.locator('.erp-task-blocked-tag').evaluate((node) => {
        const style = getComputedStyle(node)
        return Object.fromEntries(['color', 'backgroundColor', 'fontSize', 'lineHeight', 'padding', 'borderRadius'].map((key) => [key, style[key]]))
      })
      const readReason = async (reason) => reason.evaluate((node) => {
        const style = getComputedStyle(node)
        const rect = node.getBoundingClientRect()
        const range = document.createRange()
        range.selectNodeContents(node)
        return {
          text: node.textContent,
          height: rect.height,
          width: rect.width,
          color: style.color,
          background: style.backgroundColor,
          fontSize: style.fontSize,
          lineHeight: style.lineHeight,
          padding: style.padding,
          overflow: node.scrollWidth - node.clientWidth,
          clipped: node.scrollHeight > node.clientHeight + 1,
          textOutside: [...range.getClientRects()].some((r) => r.left < rect.left - 1 || r.right > rect.right + 1 || r.bottom > rect.bottom + 1),
          lastInContent: node.parentElement.lastElementChild === node,
          afterSummary: rect.top >= node.previousElementSibling.getBoundingClientRect().bottom,
        }
      })
      for (const width of [393, 320, 360, 430]) {
        await page.setViewportSize({ width, height: 852 })
        await page.getByTestId('mobile-role-nav-progress').click()
        await entries.nth(1).waitFor()
        const progressReasons = []
        const progressTags = []
        for (const [index, expected] of [shortReason, longReason].entries()) {
          const entry = entries.nth(index)
          assert.equal(await entry.locator('.erp-task-blocked-tag').innerText(), '受阻')
          const reason = await readReason(entry.locator('.erp-task-blocked-reason'))
          assert.equal(reason.text, expected)
          assert(reason.overflow <= 1 && !reason.clipped && !reason.textOutside, JSON.stringify(reason))
          assert(reason.lastInContent && reason.afterSummary, '进度卡受阻原因固定在任务和责任摘要之后、卡片末尾')
          const entryBox = await entry.boundingBox()
          assert(entryBox.height >= 44, '压缩阅读高度仍保留 44px 任务触区')
          if (index === 0) assert(entryBox.height <= 70, '常见短原因在窄屏仍由三行压为标题与原因两行')
          assert.equal(await entry.locator('button, a').count(), 0, '提示条不引入嵌套操作')
          progressReasons.push(reason)
          const tag = await readTag(entry)
          assert(getContrastRatio(parseRgb(tag.color), parseRgb(tag.backgroundColor)) >= 4.5, '受阻标签在当前主题下可辨认')
          assert(getContrastRatio(parseRgb(reason.color), parseRgb(reason.background)) >= 4.5, '受阻原因在当前主题下可阅读')
          progressTags.push(tag)
          measurements.push({ page: 'progress', themeMode, viewportWidth: width, index, entryHeight: entryBox.height, ...reason })
        }
        assert((await entries.nth(1).innerText()).includes(longOwner))
        await assertNoHorizontalOverflow(page, `blocker-progress-${width}`)
        if ([393, 320].includes(width)) await page.screenshot({ path: path.join(outputDir, `blocker-progress-${themeMode}-${width}.png`) })

        await entries.nth(0).focus()
        await page.keyboard.press('Enter')
        const detail = page.getByTestId('mobile-task-detail-screen')
        await detail.getByRole('heading', { name: '订单审批', exact: true }).waitFor()
        assert((await detail.innerText()).includes(shortReason))
        await detail.getByRole('button', { name: '返回进度', exact: true }).click()
        await entries.nth(0).waitFor()

        await page.getByTestId('mobile-role-nav-tasks').click()
        const list = page.getByTestId('mobile-role-task-list')
        await list.waitFor()
        for (const [index, task] of fixtures.slice(0, 2).entries()) {
          const card = list.locator(`[data-mobile-task-id="${task.id}"]`)
          await card.waitFor()
          assert.equal(await card.locator('.erp-task-blocked-tag').innerText(), '受阻')
          assert.deepEqual(await readTag(card), progressTags[index], '两页受阻标签的颜色、字号、间距和形状一致')
          const reason = await readReason(card.locator('.erp-task-blocked-reason'))
          assert.equal(reason.text, `受阻原因：${task.blocked_reason}`)
          assert(reason.overflow <= 1 && !reason.clipped && !reason.textOutside, JSON.stringify(reason))
          assert(reason.lastInContent && reason.afterSummary, '任务卡受阻原因固定在办理人和截止时间之后、卡片末尾')
          for (const field of ['color', 'background', 'fontSize', 'lineHeight', 'padding']) assert.equal(reason[field], progressReasons[index][field], `两页原因条共用 ${field}`)
          measurements.push({ page: 'tasks', themeMode, viewportWidth: width, index, ...reason })
        }
        assert.equal(await list.locator('[data-mobile-task-id="101"] .erp-task-blocked-reason').count(), 0, '正常任务不显示受阻提示')
        assert((await list.locator('[data-mobile-task-id="103"]').innerText()).includes(longOwner), '长办理人名称完整保留')
        await assertNoHorizontalOverflow(page, `blocker-tasks-${width}`)
        if ([393, 320].includes(width)) await page.screenshot({ path: path.join(outputDir, `blocker-tasks-${themeMode}-${width}.png`) })
        await list.locator('[data-mobile-task-id="103"] .erp-task-card__open').click()
        await detail.getByRole('heading', { name: fixtures[1].task_name, exact: true }).waitFor()
        assert((await detail.textContent()).includes(longReason))
        await detail.getByRole('button', { name: '返回任务列表', exact: true }).click()
        await list.waitFor()
      }
      await writeFile(path.join(outputDir, `blocker-geometry-${themeMode}.json`), JSON.stringify(measurements, null, 2))
    },
  }))
}
