import path from 'node:path'
import { writeFile } from 'node:fs/promises'
import { pullToRefresh } from './mobileGestureAssertions.mjs'
import { MOBILE_ROLE_TASK_PAGE_LIMIT } from '../../src/erp/utils/mobileTaskQueries.mjs'

function deferred() {
  let release
  const promise = new Promise((resolve) => { release = resolve })
  return { promise, release }
}

async function loadingFrameMetrics(page) {
  return page.evaluate(async () => {
    const intervals = []
    const longTasks = []
    const observer = PerformanceObserver.supportedEntryTypes.includes('longtask')
      ? new PerformanceObserver((list) => longTasks.push(...list.getEntries().map((entry) => entry.duration)))
      : null
    observer?.observe({ type: 'longtask' })
    let previous = await new Promise(requestAnimationFrame)
    for (let index = 0; index < 30; index += 1) {
      const now = await new Promise(requestAnimationFrame)
      intervals.push(now - previous)
      previous = now
    }
    observer?.disconnect()
    intervals.sort((a, b) => a - b)
    return {
      sampledFrames: intervals.length,
      frameP95Ms: intervals[Math.floor(intervals.length * 0.95)],
      longestFrameMs: Math.max(...intervals),
      longestTaskMs: Math.max(0, ...longTasks),
    }
  })
}

async function mobileLoadingGeometry(page) {
  return page.evaluate(() => {
    const rect = (element) => {
      if (!element) return null
      const box = element.getBoundingClientRect()
      return { x: box.x, y: box.y, width: box.width, height: box.height }
    }
    const skeleton = document.querySelector('[data-testid="mobile-role-task-skeleton"]')
    const card = document.querySelector('.mobile-role-skeleton__row, .erp-mobile-list-item')
    return {
      card: rect(card),
      cardParts: ['.erp-task-identity__card-heading', '.erp-task-identity__card-body', '.erp-task-identity__source', '.erp-task-card__footer'].map((selector) => {
        const element = card?.querySelector(selector)
        return { selector, rect: rect(element), lineHeight: element ? getComputedStyle(element).lineHeight : null }
      }),
      toolbar: rect(document.querySelector('.mobile-task-list-toolbar')),
      filters: rect(document.querySelector('[data-testid="mobile-role-task-filters"]')),
      nav: rect(document.querySelector('[data-testid="mobile-role-bottom-nav"]')),
      descendants: skeleton?.querySelectorAll('*').length || 0,
      blocks: skeleton?.querySelectorAll('.mobile-role-skeleton__block').length || 0,
      animations: skeleton?.getAnimations({ subtree: true }).length || 0,
      focusable: skeleton?.querySelectorAll('button,a,input,select,textarea,[tabindex]').length || 0,
      horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    }
  })
}

function mobileLoadingScenario({ assert, outputDir, width, themeMode }) {
  const name = `mobile-task-loading-${themeMode}-${width}`
  const gates = new Map()
  const reads = []
  let failRisk = false
  const hold = (view) => {
    const gate = deferred()
    gates.set(view, gate)
    return () => { gates.delete(view); gate.release() }
  }
  const permissions = ['mobile.engineering.access', 'workflow.task.read']
  const task = (id, overrides = {}) => ({
    id,
    version: 1,
    task_code: `STYLE-L1-LOADING-${id}`,
    task_name: `核对样品资料 ${id}`,
    task_group: 'engineering_check',
    owner_role_key: 'engineering',
    task_status_key: 'ready',
    source_type: 'sales_order',
    source_id: 1,
    source_no: 'SO-LOADING-01',
    created_at: 1788840000,
    payload: {},
    display_context: {
      available: true,
      source_no: 'SO-LOADING-01',
      items: [{ kind: 'product', product_id: 7, name: '样品小熊', code: 'PRODUCT-7', order_no: 'SO-LOADING-01' }],
    },
    ...overrides,
  })
  return {
    name,
    path: '/m/engineering/tasks',
    auth: 'admin',
    customerKey: 'yoyoosun',
    themeMode,
    viewport: { width, height: 844 },
    adminProfile: {
      username: name,
      is_super_admin: false,
      roles: [{ role_key: 'engineering', name: '工程' }],
      permissions,
      menus: [],
    },
    effectiveSession: {
      configRevision: name,
      configHash: name,
      customer: { key: 'yoyoosun', name: '模拟客户' },
      pages: [],
      actions: permissions,
      workflow_visible_owner_role_keys_by_capability: { 'workflow.task.read': ['engineering'] },
      fieldPolicies: {},
      workPools: [],
      source: 'active_customer_config_revision',
    },
    workflowTaskFixtures: [
      ...Array.from({ length: 80 }, (_, index) => task(97000 + index)),
      task(98001, { task_name: '已完成的样品核对', task_status_key: 'done', completed_at: 1788840100 }),
      task(96001, { task_name: '待补充的样品资料', task_status_key: 'blocked', blocked_reason: '等待尺寸确认。' }),
    ],
    beforeNavigate: async (page) => {
      gates.clear()
      reads.length = 0
      failRisk = false
      hold('todo')
      await page.route('**/rpc/workflow', async (route) => {
        const body = route.request().postDataJSON()
        if (body.method === 'list_role_tasks' && body.params?.limit === MOBILE_ROLE_TASK_PAGE_LIMIT) {
          const view = body.params.view_key
          reads.push({ view, params: body.params })
          await gates.get(view)?.promise
          if (view === 'risk' && failRisk) {
            await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ jsonrpc: '2.0', id: body.id, result: { code: 50000, message: '系统暂时不可用，请稍后重试' } }) })
            return
          }
        }
        await route.fallback()
      })
    },
    verify: async (page) => {
      const report = { viewport: { width, height: 844 }, themeMode }
      try {
        const skeleton = page.getByTestId('mobile-role-task-skeleton')
        await skeleton.waitFor({ state: 'visible' })
        await page.evaluate(() => document.fonts.ready)
        const initial = await mobileLoadingGeometry(page)
        assert.equal(initial.focusable, 0)
        assert.equal(initial.horizontalOverflow, false)
        assert(initial.descendants <= 72 && initial.blocks <= 40, `骨架节点有界: ${JSON.stringify(initial)}`)
        assert.equal(initial.animations, 4, '只对四张卡片的内容做透明度动画')
        assert.equal(await page.locator('.erp-mobile-list-item').count(), 0)
        await page.evaluate(() => {
          window.__loadingStableNodes = {
            filters: document.querySelector('[data-testid="mobile-role-task-filters"]'),
            toolbar: document.querySelector('.mobile-task-list-toolbar'),
            nav: document.querySelector('[data-testid="mobile-role-bottom-nav"]'),
          }
        })
        report.skeleton = initial
        report.frames = await loadingFrameMetrics(page)
        assert(report.frames.frameP95Ms < 50, `骨架绘制帧 P95 应低于 50ms: ${JSON.stringify(report.frames)}`)
        assert(report.frames.longestTaskMs < 100, `骨架稳定展示期间不应产生 100ms 长任务: ${JSON.stringify(report.frames)}`)
        await page.screenshot({ path: path.join(outputDir, `${name}-skeleton.png`) })
        await page.emulateMedia({ reducedMotion: 'reduce' })
        assert.equal((await mobileLoadingGeometry(page)).animations, 0, '减少动态效果时完全停止骨架动画')
        await page.emulateMedia({ reducedMotion: 'no-preference' })
        const releasedAt = performance.now()
        gates.get('todo').release()
        gates.delete('todo')
        await page.locator('.erp-mobile-list-item').first().waitFor()
        report.contentAfterReleaseMs = performance.now() - releasedAt
        assert(report.contentAfterReleaseMs < 1000, `数据返回后内容应在 1 秒内可见: ${report.contentAfterReleaseMs}`)
        const loaded = await mobileLoadingGeometry(page)
        report.loaded = loaded
        await writeFile(path.join(outputDir, `${name}-geometry.json`), JSON.stringify({ initial, loaded }, null, 2))
        for (const region of ['toolbar', 'filters', 'nav']) {
          for (const dimension of ['x', 'y', 'width', 'height']) {
            assert(Math.abs(initial[region][dimension] - loaded[region][dimension]) <= 1, `${region}.${dimension} 在首屏前后应保持稳定`)
          }
        }
        for (const dimension of ['x', 'y', 'width', 'height']) {
          assert(Math.abs(initial.card[dimension] - loaded.card[dimension]) <= 2, `骨架应匹配基准任务卡片 ${dimension}: ${JSON.stringify({ initial: initial.card, loaded: loaded.card })}`)
        }
        assert.equal(await page.evaluate(() => Object.entries(window.__loadingStableNodes).every(([key, element]) => element === document.querySelector({ filters: '[data-testid="mobile-role-task-filters"]', toolbar: '.mobile-task-list-toolbar', nav: '[data-testid="mobile-role-bottom-nav"]' }[key]))), true)
        assert.equal(await skeleton.count(), 0)
        assert.equal(loaded.animations, 0)
        assert.equal(reads.filter(({ view }) => view === 'todo').length, 1, '骨架与恢复不应增加取数')
        assert.equal(await page.locator('.erp-mobile-list-item').count(), 12, '80 条模拟任务仍只展示当前批次')
        await page.screenshot({ path: path.join(outputDir, `${name}-loaded.png`) })

        const releaseRefresh = hold('todo')
        await page.evaluate(() => { window.__loadingFirstTask = document.querySelector('.erp-mobile-list-item') })
        await pullToRefresh(page, page.getByTestId('mobile-role-scroll'))
        await page.getByTestId('mobile-role-task-list').and(page.locator('[aria-busy="true"]')).waitFor()
        assert.equal(await page.evaluate(() => window.__loadingFirstTask === document.querySelector('.erp-mobile-list-item')), true)
        assert.equal(await skeleton.count(), 0)
        releaseRefresh()
        await page.getByTestId('mobile-role-task-list').and(page.locator('[aria-busy="false"]')).waitFor()

        const releaseHistory = hold('history')
        await page.getByRole('tab', { name: /^已办/ }).click()
        const loader = page.getByTestId('mobile-role-task-list-loading')
        await loader.waitFor()
        assert.equal(await loader.innerText(), '正在加载已办任务')
        assert.equal(await page.locator('.mobile-task-history-summary').count(), 0, '读取前不显示零条结果')
        assert.equal(await skeleton.count(), 0)
        await page.emulateMedia({ reducedMotion: 'reduce' })
        assert.equal(await loader.evaluate((element) => element.getAnimations({ subtree: true }).length), 0, '减少动态效果时停止局部等待动画')
        await page.emulateMedia({ reducedMotion: 'no-preference' })
        releaseHistory()
        await page.getByRole('button', { name: '查看已完成的样品核对处理结果' }).waitFor()

        const releaseRisk = hold('risk')
        failRisk = true
        await page.getByRole('tab', { name: '风险', exact: true }).click()
        await loader.waitFor()
        assert.equal(await loader.innerText(), '正在加载风险任务')
        releaseRisk()
        await page.getByText('任务加载失败', { exact: true }).waitFor()
        assert.equal(await loader.count(), 0)
        assert.equal(await page.getByText('暂无风险任务', { exact: true }).count(), 0)
        failRisk = false
        await page.getByRole('button', { name: '重新加载', exact: true }).click()
        await page.getByRole('button', { name: '查看待补充的样品资料详情' }).waitFor()

        const releaseOverdue = hold('risk')
        await page.getByTestId('mobile-role-risk-filter-notice').click()
        await loader.waitFor()
        assert.equal(await loader.innerText(), '正在加载超时任务')
        await page.getByRole('tab', { name: '任务管理', exact: true }).click()
        await page.getByRole('button', { name: '查看已完成的样品核对处理结果' }).waitFor()
        releaseOverdue()
        await page.getByRole('tab', { name: '风险', exact: true }).click()
        await page.getByText('暂无超时任务', { exact: true }).waitFor()
        assert.equal(await loader.count(), 0)
        assert.equal(await page.getByText('任务加载失败', { exact: true }).count(), 0)
        report.listReads = reads.map(({ view, params }) => ({ view, limit: params.limit, cursor: params.cursor || '' }))
        await writeFile(path.join(outputDir, `${name}-performance.json`), JSON.stringify(report, null, 2))
      } finally {
        for (const gate of gates.values()) gate.release()
        gates.clear()
      }
    },
  }
}

function desktopLoadingScenario({ assert, outputDir, customerRuntimeEffectiveSession }) {
  let moduleGate
  return {
    name: 'desktop-route-loading',
    path: '/erp/dashboard',
    auth: 'admin',
    customerKey: 'yoyoosun',
    effectiveSession: customerRuntimeEffectiveSession,
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    beforeNavigate: async (page) => {
      moduleGate = deferred()
      await page.route('**/src/erp/pages/HelpCenterPage.jsx*', async (route) => {
        await moduleGate.promise
        await route.continue()
      })
    },
    verify: async (page) => {
      try {
        await page.getByRole('heading', { name: '工作台', exact: true }).waitFor()
        await page.evaluate(() => { window.__loadingSidebar = document.querySelector('.ant-layout-sider') })
        const started = performance.now()
        await page.getByRole('menuitem', { name: '帮助中心', exact: true }).click()
        const loading = page.locator('.erp-route-loading')
        await loading.waitFor()
        const feedbackMs = performance.now() - started
        assert(feedbackMs < 1000, `切页后应在 1 秒内明确反馈: ${feedbackMs}`)
        assert.match(await loading.innerText(), /正在加载帮助中心/u)
        assert.equal(await page.getByRole('heading', { name: '工作台', exact: true }).isVisible(), false)
        assert.equal(await page.evaluate(() => window.__loadingSidebar === document.querySelector('.ant-layout-sider') && Boolean(document.querySelector('.erp-admin-outlet .erp-route-loading'))), true)
        await page.screenshot({ path: path.join(outputDir, 'desktop-route-loading-pending.png') })
        await page.getByRole('menuitem', { name: '工作台', exact: true }).click()
        await page.getByRole('heading', { name: '工作台', exact: true }).waitFor()
        assert.equal(await loading.count(), 0)
        moduleGate.release()
        await page.getByRole('menuitem', { name: '帮助中心', exact: true }).click()
        await page.locator('.erp-help-center-page').waitFor()
        assert.equal(await loading.count(), 0)
        await page.getByRole('menuitem', { name: '工作台', exact: true }).click()
        await page.getByRole('heading', { name: '工作台', exact: true }).waitFor()
        assert.equal(await page.evaluate(() => window.__loadingSidebar === document.querySelector('.ant-layout-sider')), true)
        await writeFile(path.join(outputDir, 'desktop-route-loading-performance.json'), JSON.stringify({ feedbackMs, sidebarRetained: true, pendingNavigationCancellable: true }, null, 2))
      } finally {
        moduleGate.release()
      }
    },
  }
}

export function createPageLoadingScenarios(deps) {
  return [
    mobileLoadingScenario({ ...deps, width: 390, themeMode: 'light' }),
    mobileLoadingScenario({ ...deps, width: 390, themeMode: 'dark' }),
    mobileLoadingScenario({ ...deps, width: 320, themeMode: 'light' }),
    desktopLoadingScenario(deps),
  ]
}
