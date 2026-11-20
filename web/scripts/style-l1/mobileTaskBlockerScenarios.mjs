import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { progressFixtureData, progressFixtureRow } from './businessProgressFixtures.mjs'
import { unixSecondsToBusinessDate } from '../../src/erp/utils/businessDate.mjs'
import { getContrastRatio, parseRgb } from './colorAssertions.mjs'

const shortReason = '等待客户补充资料。'
const longReason = `${'客户尚未确认包装色稿与吊牌资料，需要业务核对版本、采购确认补料交期后再恢复审批。'.repeat(3)
   }\n待核对文件：PACKAGING_CONFIRMATION_REFERENCE_20261023_WITHOUT_SPACES_ABCDEFGHIJKLMNOPQRSTUVWXYZ`
const shortNote = '按订单要求核对并处理。'
const longNote = `${'请核对产品数量、包装版本与到货记录，完成后补充处理说明。'.repeat(3)
   }\n资料编号：HANDLING_REFERENCE_WITHOUT_SPACES_ABCDEFGHIJKLMNOPQRSTUVWXYZ_0123456789`
const rejectedReason = '资料不完整，请补充后重新提交。'
const longRejectedReason = `${'申请资料中的包装版次、标签内容和客户确认记录不完整，请补齐后重新提交审核。'.repeat(3)}\nRETURN_REFERENCE_ABCDEFGHIJKLMNOPQRSTUVWXYZ_0123456789`
const withdrawnReason = '来源单据已取消。'
const longOwner = '华东区域客户资料与包装确认负责人张小明'

export function createMobileTaskBlockerScenarios({ base, assert, assertNoHorizontalOverflow, outputDir }) {
  const now = Math.floor(Date.now() / 1000)
  const task = (id, status, extra) => ({
    ...base.workflowTaskFixtures[0],
id,
task_code: `TASK-${id}`,
source_id: id,
    task_name: `核对资料 ${id}`,
task_status_key: status,
due_at: now - 60,
    completed_at: ['done', 'rejected', 'withdrawn'].includes(status) ? now : null,
    priority: 3,
payload: {},
blocked_reason: '',
...extra,
  })
  const fixtures = [
    task(100, 'blocked', { task_name: '订单审批', blocked_reason: shortReason }),
    task(103, 'blocked', { task_name: '确认面料交期与包装资料', blocked_reason: longReason, assignee_id: 8, discovery: { assignee_name: longOwner } }),
    task(101, 'ready', { task_name: '处理返工异常', due_at: null, handling_note: shortNote, blocked_reason: '不可回显的旧受阻原因' }),
    task(104, 'ready', { payload: { business_status_reason: longNote, rejected_reason: '不可回显的旧退回原因' } }),
    task(105, 'ready', { handling_note: ' \n ', blocked_reason: '不可回显的旧受阻原因', rejected_reason: '不可回显的旧退回原因' }),
    task(106, 'blocked', {}),
    task(107, 'rejected', { rejected_reason: rejectedReason, blocked_reason: '不可回显的旧受阻原因' }),
    task(108, 'rejected', { payload: { rejected_reason: longRejectedReason } }),
    task(109, 'done', { handling_note: shortNote, blocked_reason: '不可回显的旧受阻原因' }),
    task(110, 'done', { payload: { completion_summary: longNote, rejected_reason: '不可回显的旧退回原因' } }),
    task(111, 'withdrawn', { blocked_reason: withdrawnReason }),
    task(112, 'withdrawn', { payload: { business_status_reason: longNote } }),
    task(113, 'done', { blocked_reason: '不可回显的旧受阻原因', payload: { rejected_reason: '不可回显的旧退回原因' } }),
  ]
  const expectedNotes = new Map([
    [100, ['受阻原因', shortReason, true]], [103, ['受阻原因', longReason, true]],
    [101, ['处理说明', shortNote, false]], [104, ['处理说明', longNote, false]],
    [105, null], [106, null], [107, ['退回原因', rejectedReason, true]],
    [108, ['退回原因', longRejectedReason, true]], [109, ['处理说明', shortNote, false]],
    [110, ['处理说明', longNote, false]], [111, ['撤回原因', withdrawnReason, false]],
    [112, ['撤回原因', longNote, false]], [113, null],
  ])
  const activeTasks = fixtures.filter(({ task_status_key: status }) => ['ready', 'blocked'].includes(status))
  const datedTasks = activeTasks.filter((item) => item.due_at)
  const historyTasks = fixtures.filter((item) => !activeTasks.includes(item))
  return ['light', 'dark'].map((themeMode) => ({
    ...base,
    name: `mobile-task-blocker-${themeMode}`,
    themeMode,
    workflowTaskFixtures: fixtures,
    beforeNavigate: async (page) => {
      await base.beforeNavigate(page)
      await page.route('**/rpc/workflow', async (route) => {
        const { id, params: q = {} } = route.request().postDataJSON()
        if (!q.calendar_month) return route.fallback()
        const day = unixSecondsToBusinessDate(now - 60)
        const selected = q.calendar_selection === day || q.calendar_selection === 'overdue' ? datedTasks : q.calendar_selection === 'undated' ? activeTasks.filter((item) => !item.due_at) : []
        const data = { calendar: {
          month: q.calendar_month,
selection: q.calendar_selection,
          days: { [day]: datedTasks.length },
overdue: datedTasks.length,
undated: activeTasks.length - datedTasks.length,
          total: selected.length,
offset: 0,
limit: q.limit,
snapshot_at: now,
          revision: createHash('sha256').update(JSON.stringify(selected)).digest('hex'),
items: selected,
        } }
        await route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 0, message: '', data } } })
      })
      await page.route('**/rpc/business', async (route) => {
        const { id, method, params = {} } = route.request().postDataJSON()
        if (method !== 'list_progress') return route.fallback()
        const data = progressFixtureData(params)
        const rows = [0, 3, 4].map((index) => progressFixtureRow(index, params.view || 'orders'))
        rows.forEach((row, index) => Object.assign(row, {
          open_tasks: 1,
blocked_tasks: index < 2 ? 1 : 0,
          unassigned_tasks: index === 1 ? 0 : 1,
blocked: index < 2,
          attention_task_id: fixtures[index].id,
attention_task: fixtures[index].task_name,
          attention_reason: index < 2 ? fixtures[index].blocked_reason : '',
          attention_role: 'boss',
attention_owner: index === 1 ? longOwner : '',
        }))
        data.rows = rows
        data.total = rows.length
        await route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 0, message: '', data } } })
      })
    },
    verify: async (page) => {
      const progress = page.getByTestId('mobile-progress-panel')
      const entries = progress.locator('button.mobile-progress-task-entry')
      const detail = page.getByTestId('mobile-task-detail-screen')
      const measurements = []
      let dangerStyle
      let neutralStyle
      const readReason = (reason) => reason.evaluate((node) => {
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
          labelWeight: node.querySelector('.erp-task-reason__label') ? Number(getComputedStyle(node.querySelector('.erp-task-reason__label')).fontWeight) : null,
          cardBackground: node.closest('.erp-task-card') ? getComputedStyle(node.closest('.erp-task-card')).backgroundColor : null,
          lineHeight: style.lineHeight,
padding: style.padding,
          danger: node.classList.contains('erp-task-reason--danger'),
          overflow: node.scrollWidth - node.clientWidth,
          clipped: node.scrollHeight > node.clientHeight + 1,
          textOutside: [...range.getClientRects()].some((r) => r.left < rect.left - 1 || r.right > rect.right + 1 || r.bottom > rect.bottom + 1),
          lastInContent: node.parentElement.lastElementChild === node,
          afterSummary: rect.top >= node.previousElementSibling.getBoundingClientRect().bottom,
          footerBeforeReason: Boolean(node.previousElementSibling.matches('.erp-task-card__footer, .erp-progress-attention-heading')),
        }
      })
      const verifyReason = async (root, expected, view, width, id, showLabel = true) => {
        const locator = root.locator('.erp-task-reason')
        if (!expected) {
          assert.equal(await locator.count(), 0, `${view}/${id} 无说明不占位，旧异常原因不回显`)
          assert(!(await root.innerText()).includes('不可回显'))
          measurements.push({ view, themeMode, viewportWidth: width, id, empty: true })
          return
        }
        assert.equal(await locator.count(), 1, `${view}/${id} 说明只出现一次`)
        const [label, value, danger] = expected
        const reason = await readReason(locator)
        assert.equal(reason.text, `${showLabel ? `${label}：` : ''}${value}`)
        assert.equal(reason.danger, danger, `${view}/${id} 颜色由原因种类决定`)
        if (showLabel) assert(reason.labelWeight >= 600, `${view}/${id} 标签清晰强调`)
        assert(reason.overflow <= 1 && !reason.clipped && !reason.textOutside, JSON.stringify(reason))
        assert(reason.lastInContent && reason.afterSummary && reason.footerBeforeReason, `${view}/${id} 说明固定在责任时间之后、卡片末尾`)
        const style = Object.fromEntries(['color', 'background', 'fontSize', 'lineHeight', 'padding'].map((key) => [key, reason[key]]))
        if (danger) {
          dangerStyle ??= style
          assert.deepEqual(style, dangerStyle, `${view}/${id} 警示说明共用样式`)
        } else {
          neutralStyle ??= style
          assert.deepEqual(style, neutralStyle, `${view}/${id} 普通、完成、撤回说明共用中性样式`)
          assert.notEqual(reason.color, dangerStyle.color, '普通说明不染成警示色')
          assert.notEqual(reason.background, dangerStyle.background, '普通说明不套警示底色')
          assert(getContrastRatio(parseRgb(reason.background), parseRgb(reason.cardBackground)) >= 1.1, `${view}/${id} 中性说明底色与卡片可区分`)
        }
        assert(getContrastRatio(parseRgb(reason.color), parseRgb(reason.background)) >= 4.5, `${view}/${id} 当前主题说明文字可阅读`)
        const box = await root.boundingBox()
        assert(box.height >= 44, `${view}/${id} 保留触控高度`)
        measurements.push({ view, themeMode, viewportWidth: width, id, ...reason })
      }
      const verifyCards = async (root, tasks, view, width, calendar = false) => {
        for (const item of tasks) {
          const card = root.locator(`[data-${calendar ? 'task' : 'mobile-task'}-id="${item.id}"]`)
          await card.waitFor()
          await verifyReason(card, expectedNotes.get(item.id), view, width, item.id)
          if (themeMode === 'light' && [393, 320].includes(width) && ((view === 'risk' && item.id === 101) || (view === 'history' && item.id === 107))) {
            await card.screenshot({ path: path.join(outputDir, `notes-${view}-card-${width}.png`) })
          }
          if (themeMode === 'light' && width === 320 && ((view === 'todo' && item.id === 104) || (view === 'history' && item.id === 108))) {
            await card.screenshot({ path: path.join(outputDir, `notes-${view}-long-320.png`) })
          }
        }
        await assertNoHorizontalOverflow(page, `notes-${view}-${width}`)
      }
      const screenshot = async (view, width) => {
        if ([393, 320].includes(width)) await page.screenshot({ path: path.join(outputDir, `notes-${view}-${themeMode}-${width}.png`) })
      }
      for (const width of [393, 320, 360, 430]) {
        await page.setViewportSize({ width, height: 852 })
        await page.getByTestId('mobile-role-nav-progress').click()
        for (const view of ['订单交付', '生产执行']) {
          await progress.getByRole('tab', { name: view, exact: true }).click()
          await entries.nth(2).waitFor()
          assert((await progress.innerText()).includes(view === '订单交付' ? '已出货 / 订购' : '有效完工 / 计划'), '两个进度视图使用对应业务数据')
          for (let index = 0; index < 3; index++) {
            const entry = entries.nth(index)
            await verifyReason(entry, index < 2 ? expectedNotes.get(fixtures[index].id) : null, `progress-${view}`, width, index, false)
          }
          const shortBox = await entries.nth(0).boundingBox()
          assert(shortBox.height <= 70, '短受阻说明在窄屏仍保留紧凑的两行结构')
          assert((await entries.nth(1).innerText()).includes(longOwner), '长办理人保留完整内容')
          await assertNoHorizontalOverflow(page, `notes-progress-${view}-${width}`)
        }
        if (themeMode === 'light' && width === 320) await entries.nth(1).screenshot({ path: path.join(outputDir, 'notes-progress-long-320.png') })
        await screenshot('progress', width)
        await entries.nth(0).focus()
        await page.keyboard.press('Enter')
        await detail.getByRole('heading', { name: '订单审批', exact: true }).waitFor()
        assert((await detail.innerText()).includes(shortReason))
        await detail.getByRole('button', { name: '返回进度', exact: true }).click()
        await entries.nth(0).waitFor()

        await page.getByTestId('mobile-role-nav-tasks').click()
        await page.getByRole('tab', { name: /^待办(?:\s|$)/ }).click()
        const list = page.getByTestId('mobile-role-task-list')
        await verifyCards(list, activeTasks, 'todo', width)
        assert.equal(await list.locator('[data-mobile-task-id="106"] .erp-task-blocked-tag').innerText(), '受阻', '受阻无原因时仍保留状态标签')
        await screenshot('todo', width)
        await list.locator('[data-mobile-task-id="103"] .erp-task-card__open').click()
        await detail.getByRole('heading', { name: fixtures[1].task_name, exact: true }).waitFor()
        assert((await detail.textContent()).includes(longReason))
        await detail.getByRole('button', { name: '返回任务列表', exact: true }).click()

        await page.getByRole('button', { name: '切换到日历', exact: true }).click()
        const calendar = page.getByRole('region', { name: '待办日历', exact: true })
        await verifyCards(calendar, datedTasks, 'calendar', width, true)
        await screenshot('calendar', width)
        await page.getByRole('button', { name: '切换到列表', exact: true }).click()
        await page.getByRole('tab', { name: /^已办(?:\s|$)/ }).click()
        const history = page.getByRole('region', { name: '已办任务', exact: true })
        await verifyCards(history, historyTasks, 'history', width)
        await screenshot('history', width)

        await page.getByTestId('mobile-role-nav-messages').click()
        await page.getByTestId('mobile-role-risk-filter-warning').click()
        const risk = page.getByRole('region', { name: /^(跨岗风险任务|风险任务)$/ })
        await verifyCards(risk, activeTasks, 'risk', width)
        assert.equal(await risk.locator('[data-mobile-task-id="101"] .mobile-task-list-status').innerText(), '预警', '预警任务的普通说明仍用中性样式')
        await screenshot('risk', width)
        await risk.locator('[data-mobile-task-id="101"] .erp-task-card__open').click()
        await detail.getByRole('heading', { name: '处理返工异常', exact: true }).waitFor()
        assert((await detail.innerText()).includes(shortNote), '普通风险说明在详情仍可查看')
        await detail.getByRole('button', { name: '返回任务列表', exact: true }).click()
        await risk.waitFor()
        await page.getByTestId('mobile-role-risk-filter-notice').click()
        const overdue = page.getByRole('region', { name: '超时任务', exact: true })
        await verifyCards(overdue, datedTasks, 'overdue', width)
        await screenshot('overdue', width)
      }
      await writeFile(path.join(outputDir, `notes-geometry-${themeMode}.json`), JSON.stringify(measurements, null, 2))
    },
  }))
}
