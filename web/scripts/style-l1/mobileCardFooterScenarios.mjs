import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import { progressFixtureData, progressFixtureRow } from './businessProgressFixtures.mjs'

const shortOwner = '小李'
const mediumOwner = '欧阳司徒小明'
const longOwner = '华东区域客户资料与包装确认负责人张小明'
const unbrokenOwner = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.repeat(3)
const owners = [shortOwner, mediumOwner, longOwner, unbrokenOwner, '']

export function createMobileCardFooterScenarios({ base, assert, assertNoHorizontalOverflow, outputDir }) {
  const now = Math.floor(Date.now() / 1000)
  const task = (id, status, extra = {}) => ({
    ...base.workflowTaskFixtures[0],
    id,
    task_code: `TASK-${id}`,
    source_id: id,
    task_name: `核对资料 ${id}`,
    task_status_key: status,
    due_at: now - 60,
    completed_at: status === 'done' ? now : null,
    priority: 3,
    payload: {},
    blocked_reason: '',
    ...extra,
  })
  const fixtures = [
    task(100, 'blocked', { task_name: '订单审批', blocked_reason: '等待客户补充资料。' }),
    task(103, 'blocked', { assignee_id: 8, discovery: { assignee_name: longOwner } }),
    task(101, 'ready', { due_at: null, assignee_id: 9, discovery: { assignee_name: shortOwner } }),
    task(114, 'ready', { assignee_id: 10, discovery: { assignee_name: unbrokenOwner } }),
    task(115, 'blocked', { task_name: '看一下报价', due_at: now - 7 * 24 * 3600 }),
    task(109, 'done', { assignee_id: 9, discovery: { assignee_name: shortOwner } }),
    task(110, 'done', { assignee_id: 8, discovery: { assignee_name: longOwner } }),
  ]
  const activeTasks = fixtures.filter((item) => item.task_status_key !== 'done')
  const historyTasks = fixtures.filter((item) => item.task_status_key === 'done')
  return ['light', 'dark'].map((themeMode) => ({
    ...base,
    name: `mobile-card-footer-${themeMode}`,
    themeMode,
    workflowTaskFixtures: fixtures,
    beforeNavigate: async (page) => {
      await base.beforeNavigate(page)
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
          attention_reason: fixtures[index].blocked_reason,
          attention_role: 'boss',
          attention_owner: index === 1 ? longOwner : '',
        }))
        owners.forEach((owner, index) => rows.push({
          ...progressFixtureRow(index + 5, params.view || 'orders'), sales_owner: owner,
        }))
        data.rows = rows
        data.total = rows.length
        await route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 0, message: '', data } } })
      })
    },
    verify: async (page) => {
      const footerMeasurements = []
      const verifyFooter = async (root, view, width, id, { singleLine = false, wrapped = false, owner } = {}) => {
        const footer = root.locator('.erp-progress-attention-heading, .mobile-task-list-row__footer')
        const metrics = await footer.evaluate((node) => {
          const rect = node.getBoundingClientRect()
          const groups = [...node.children].map((group) => {
            const box = group.getBoundingClientRect()
            const walker = document.createTreeWalker(group, NodeFilter.SHOW_TEXT)
            const textRects = []
            for (let text = walker.nextNode(); text; text = walker.nextNode()) {
              if (!text.textContent.trim()) continue
              const range = document.createRange()
              range.selectNodeContents(text)
              textRects.push(...range.getClientRects())
            }
            return {
              text: group.textContent,
              left: box.left, right: box.right, top: box.top, bottom: box.bottom,
              overflow: group.scrollWidth - group.clientWidth,
              clipped: group.scrollHeight > group.clientHeight + 1,
              textOutside: textRects.some((r) => r.left < box.left - 1 || r.right > box.right + 1 || r.bottom > box.bottom + 1),
            }
          })
          return { left: rect.left, right: rect.right, width: rect.width, groups }
        })
        assert.equal(metrics.groups.length, 2, `${view}/${id} 普通底栏包含两组信息`)
        const [left, right] = metrics.groups
        const sameRow = right.top < left.bottom - 1
        assert(Math.abs(left.left - metrics.left) <= 1, `${view}/${id} 左组贴齐底栏边界：${JSON.stringify(metrics)}`)
        assert(metrics.groups.every((group) => group.overflow <= 1 && !group.clipped && !group.textOutside), `${view}/${id} 长文本完整且不溢出：${JSON.stringify(metrics)}`)
        if (sameRow) {
          assert(right.left - left.right >= 11.5 && Math.abs(right.right - metrics.right) <= 1, `${view}/${id} 同行两端对齐且至少留 12px`)
        } else {
          assert(right.top - left.bottom >= 3.5, `${view}/${id} 换行后两组不重叠`)
          assert(Math.abs(right.left - metrics.left) <= 1, `${view}/${id} 换行后上下左对齐，不形成斜向排列：${JSON.stringify(metrics)}`)
        }
        if (singleLine) assert(sameRow, `${view}/${id} 空间足够时保持同行：${JSON.stringify(metrics)}`)
        if (wrapped) assert(!sameRow, `${view}/${id} 空间不足时右组整体换行`)
        if (owner) assert(metrics.groups.some((group) => group.text.includes(owner)), `${view}/${id} 姓名完整显示`)
        footerMeasurements.push({ view, themeMode, viewportWidth: width, id, sameRow, ...metrics })
      }
      const verifyCards = async (root, tasks, view, width) => {
        for (const item of tasks) {
          const card = root.locator(`[data-mobile-task-id="${item.id}"]`)
          await card.waitFor()
          await verifyFooter(card, view, width, item.id, {
            singleLine: item.id === 101,
            wrapped: item.id === 115 && width <= 393,
            owner: item.discovery?.assignee_name,
          })
          if (view === 'todo' && item.id === 115 && [393, 320].includes(width)) {
            await card.screenshot({ path: path.join(outputDir, `footer-unassigned-${themeMode}-${width}.png`) })
          }
        }
        await assertNoHorizontalOverflow(page, `footer-${view}-${width}`)
      }
      const progress = page.getByTestId('mobile-progress-panel')
      for (const width of [393, 320, 360, 430]) {
        await page.setViewportSize({ width, height: 852 })
        await page.getByTestId('mobile-role-nav-progress').click()
        for (const view of ['订单交付', '生产执行']) {
          await progress.getByRole('tab', { name: view, exact: true }).click()
          const entries = progress.locator('button.mobile-progress-task-entry')
          await entries.nth(2).waitFor()
          for (let index = 0; index < 3; index++) {
            await verifyFooter(entries.nth(index), `progress-${view}`, width, index, {
              singleLine: index === 0, owner: index === 1 ? longOwner : undefined,
            })
          }
          const emptyEntries = progress.locator('.mobile-progress-task-entry--empty')
          for (const [index, owner] of owners.entries()) {
            await verifyFooter(emptyEntries.nth(index), `progress-empty-${view}`, width, index, {
              singleLine: index === 0 || index === 4 || (index === 1 && width >= 360),
              wrapped: index === 1 && width === 320,
              owner: owner || '业务负责人未提供',
            })
          }
          await assertNoHorizontalOverflow(page, `footer-progress-${view}-${width}`)
        }
        await page.getByTestId('mobile-role-nav-tasks').click()
        await page.getByRole('tab', { name: /^待办(?:\s|$)/ }).click()
        await verifyCards(page.getByTestId('mobile-role-task-list'), activeTasks, 'todo', width)
        await page.getByRole('tab', { name: /^已办(?:\s|$)/ }).click()
        await verifyCards(page.getByRole('region', { name: '已办任务', exact: true }), historyTasks, 'history', width)
        await page.getByTestId('mobile-role-nav-messages').click()
        await page.getByTestId('mobile-role-risk-filter-warning').click()
        await verifyCards(page.getByRole('region', { name: /^(跨岗风险任务|风险任务)$/ }), activeTasks, 'risk', width)
        await page.getByTestId('mobile-role-risk-filter-notice').click()
        await verifyCards(page.getByRole('region', { name: '超时任务', exact: true }), activeTasks.filter((item) => item.due_at), 'overdue', width)
      }
      await writeFile(path.join(outputDir, `footer-geometry-${themeMode}.json`), JSON.stringify(footerMeasurements, null, 2))
    },
  }))
}
