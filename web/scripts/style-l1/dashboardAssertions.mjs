import assert from 'node:assert/strict'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import {
  assertThemeReadable,
  assertDarkThemeContrast,
} from './themeAssertions.mjs'
import { expectText } from './pageAssertions.mjs'
import {
  assertReadableOnBackground,
  isDarkNeutralBorderColor,
  isLightSurfaceColor,
  isTransparentColor,
  isWarningBorderColor,
} from './colorAssertions.mjs'
import { createMobileTaskAssertions } from './mobileTaskAssertions.mjs'

export function createDashboardAssertions({ outputDir, baseURL }) {
  async function gotoScenarioPath(page, scenarioPath, options = {}) {
    const url = new URL(scenarioPath, `${baseURL}/`).toString()
    const maxAttempts = 3
    let lastError = null

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await page.goto(url, options)
        return
      } catch (error) {
        lastError = error
        if (
          !isRetryableLocalNavigationError(error) ||
          attempt === maxAttempts
        ) {
          throw error
        }
        await delay(250 * attempt)
      }
    }

    throw lastError
  }

  function isRetryableLocalNavigationError(error) {
    const message = String(error?.message || '')
    return (
      message.includes('net::ERR_ADDRESS_INVALID') ||
      message.includes('net::ERR_CONNECTION_REFUSED')
    )
  }

  async function assertNoDashboardCenterLocalRefreshButton(
    page,
    { scenarioName }
  ) {
    const metrics = await page.evaluate(() => {
      const forbiddenLabels = new Set(['刷新', '刷新任务', '刷新业务数据'])
      const isVisible = (node) => {
        if (!(node instanceof HTMLElement)) return false
        const rect = node.getBoundingClientRect()
        const style = window.getComputedStyle(node)
        return (
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          rect.width > 0 &&
          rect.height > 0
        )
      }
      const buttons = Array.from(
        document.querySelectorAll('.erp-admin-content button')
      )
        .filter(isVisible)
        .map((button) => ({
          text: String(button.textContent || '').trim(),
          className: String(button.className || ''),
        }))
        .filter((button) => forbiddenLabels.has(button.text))

      return {
        forbiddenButtonCount: buttons.length,
        forbiddenButtons: buttons,
      }
    })

    assert.equal(
      metrics.forbiddenButtonCount,
      0,
      `${scenarioName} 看板中心内容区不应重复显示局部刷新按钮: ${JSON.stringify(metrics)}`
    )
  }

  async function assertDashboardMetricInteractionSemantics(
    page,
    {
      scenarioName,
      expectTaskCategories = false,
      expectBusinessAttention = false,
    } = {}
  ) {
    const metrics = await page.evaluate(
      ({ expectTaskCategories, expectBusinessAttention }) => {
        const isVisible = (node) => {
          if (!(node instanceof HTMLElement)) return false
          const rect = node.getBoundingClientRect()
          const style = window.getComputedStyle(node)
          return (
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            rect.width > 0 &&
            rect.height > 0
          )
        }
        const describeNode = (node) => {
          const rect = node.getBoundingClientRect()
          const style = window.getComputedStyle(node)
          return {
            tagName: node.tagName,
            role: node.getAttribute('role') || '',
            ariaPressed: node.getAttribute('aria-pressed') || '',
            disabled: Boolean(node.disabled),
            cursor: style.cursor,
            width: rect.width,
            height: rect.height,
            contentFits: node.scrollWidth <= node.clientWidth + 1,
            text: String(node.textContent || '')
              .replace(/\s+/g, ' ')
              .trim(),
          }
        }
        const taskMetrics = expectTaskCategories
          ? Array.from(document.querySelectorAll('.erp-task-board-lane'))
              .filter(isVisible)
              .map((node) => ({
                count: Number(
                  node.querySelector('.erp-task-board-lane-count')?.textContent
                ),
                entries: [
                  ...node.querySelectorAll(
                    '.erp-task-board-lane-footer button'
                  ),
                ].map((button) => ({
                  ...describeNode(button),
                  accessibleName: button.getAttribute('aria-label'),
                })),
                oldMetrics: document.querySelectorAll('.erp-task-center-metric')
                  .length,
              }))
          : []
        const businessAttention = expectBusinessAttention
          ? {
              items: [
                ...document.querySelectorAll('.erp-business-board-alert-item'),
              ]
                .filter(isVisible)
                .map(describeNode),
              summaryCount: document.querySelectorAll(
                '.erp-business-board-summary-card'
              ).length,
              attention: document
                .querySelector('.erp-business-board-attention-card')
                ?.getBoundingClientRect()
                .toJSON(),
              table: document
                .querySelector('.erp-dashboard-table-card')
                ?.getBoundingClientRect()
                .toJSON(),
              explanationOpen: document.querySelector(
                '.erp-business-board-boundary-summary'
              )?.open,
            }
          : null

        return {
          taskMetrics,
          businessAttention,
        }
      },
      { expectTaskCategories, expectBusinessAttention }
    )

    if (expectTaskCategories) {
      assert.equal(
        metrics.taskMetrics.length,
        4,
        `${scenarioName} 应展示四类任务`
      )
      for (const lane of metrics.taskMetrics) {
        assert.equal(lane.oldMetrics, 0, '概览不应重复渲染四个大指标')
        assert(
          Number.isInteger(lane.count) && lane.count >= 0,
          '分类标题应显示真实数量'
        )
        assert.equal(lane.entries.length, lane.count > 0 ? 1 : 0)
        for (const entry of lane.entries) {
          assert.equal(entry.tagName, 'BUTTON')
          assert(
            entry.contentFits && entry.accessibleName?.includes('查看全部')
          )
        }
      }
    }

    if (expectBusinessAttention) {
      const attention = metrics.businessAttention
      assert.equal(
        attention.items.length,
        2,
        `${scenarioName} 应直接展示阻塞和到期事项`
      )
      assert.equal(
        attention.summaryCount,
        0,
        `${scenarioName} 不应保留重复汇总卡`
      )
      assert.equal(
        attention.explanationOpen,
        false,
        `${scenarioName} 统计说明默认按需展开`
      )
      assert(
        attention.attention &&
          attention.table &&
          attention.attention.bottom <= attention.table.top &&
          Math.abs(attention.attention.width - attention.table.width) < 2,
        `${scenarioName} 关注事项应在业务数据之前并使用内容全宽: ${JSON.stringify(attention)}`
      )
      for (const item of attention.items) {
        assert(
          item.width > 0 && item.height > 0 && item.role === 'group',
          `${scenarioName} 关注项应可见并有分组语义`
        )
      }
    }
  }

  async function assertDarkDashboardLinkButtonsUnboxed(page, { scenarioName }) {
    const metrics = await page.evaluate(() => {
      const buttons = Array.from(
        document.querySelectorAll(
          '.erp-business-dashboard-page .erp-dashboard-table-card .erp-business-board-source-entry.ant-btn'
        )
      )
        .slice(0, 24)
        .map((button) => {
          const style = window.getComputedStyle(button)
          const rect = button.getBoundingClientRect()
          return {
            text: String(button.textContent || '').trim(),
            ariaLabel: String(button.getAttribute('aria-label') || ''),
            disabled: button.disabled,
            backgroundColor: style.backgroundColor,
            borderColor: style.borderColor,
            borderStyle: style.borderStyle,
            borderWidth: style.borderWidth,
            className: String(button.className || ''),
            cursor: style.cursor,
            height: rect.height,
            width: rect.width,
          }
        })

      return {
        effectiveTheme: document.documentElement.dataset.erpTheme || '',
        buttons,
      }
    })

    assert.equal(
      metrics.effectiveTheme,
      'dark',
      `${scenarioName} link 按钮无框断言必须在暗色模式执行: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.buttons.some((button) => button.ariaLabel === '查看客户') &&
        metrics.buttons.some((button) => button.ariaLabel === '查看发票记录'),
      `${scenarioName} 缺少业务看板对象入口按钮样本: ${JSON.stringify(metrics)}`
    )

    for (const button of metrics.buttons) {
      assert(
        button.width > 0 && button.height > 0,
        `${scenarioName} link 按钮尺寸异常: ${JSON.stringify(button)}`
      )
      assert(
        isTransparentColor(button.backgroundColor),
        `${scenarioName} link 按钮默认态不应有暗色底框: ${JSON.stringify(button)}`
      )
      assert(
        button.borderStyle === 'none' ||
          Number.parseFloat(button.borderWidth) === 0 ||
          isTransparentColor(button.borderColor),
        `${scenarioName} link 按钮默认态不应有可见边框: ${JSON.stringify(button)}`
      )
    }
  }

  async function assertMobileTaskRefreshFeedback(page, { scenarioName }) {
    const refreshButton = page
      .locator('.mobile-role-tasks-page header button')
      .filter({ hasText: '刷新' })
      .first()
    await refreshButton.waitFor({ state: 'visible', timeout: 10_000 })
    const refreshRequestPromise = page.waitForRequest(
      (request) => {
        if (!request.url().includes('/rpc/workflow')) return false
        try {
          return request.postDataJSON()?.method === 'list_role_tasks'
        } catch {
          return false
        }
      },
      { timeout: 10_000 }
    )
    await refreshButton.click()
    const refreshRequestBody =
      (await refreshRequestPromise).postDataJSON() || {}
    assert(
      !String(refreshRequestBody?.params?.cursor || '').trim(),
      `${scenarioName} 顶部刷新应重新获取最新快照，不应携带续页游标: ${JSON.stringify(refreshRequestBody)}`
    )
    await expectText(page, '数据已刷新')
    const beforeFailureMetrics = await readMobileTaskVisibleListMetrics(
      page,
      '.erp-mobile-list-item'
    )

    let failedOnce = false
    await page.route('**/rpc/workflow', async (route) => {
      const body = route.request().postDataJSON() || {}
      if (!failedOnce && body.method === 'list_role_tasks') {
        failedOnce = true
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: body.id || 'mobile-refresh-failed',
            result: {
              code: 500123,
              message: 'refresh failed',
              data: null,
            },
          }),
        })
        return
      }
      await route.fallback()
    })

    await refreshButton.click()
    await expectText(page, '刷新任务失败，已保留上次数据')
    const afterFailureMetrics = await readMobileTaskVisibleListMetrics(
      page,
      '.erp-mobile-list-item'
    )
    assert.equal(
      afterFailureMetrics.itemCount,
      beforeFailureMetrics.itemCount,
      `${scenarioName} 刷新失败后没有保留上次任务列表: ${JSON.stringify({ beforeFailureMetrics, afterFailureMetrics })}`
    )
  }

  async function assertDashboardWorkbenchLayout(page, { scenarioName }) {
    await page.locator('.erp-workbench-command-card').waitFor({
      timeout: 10_000,
    })

    const metrics = await page.evaluate(() => {
      const grid = document
        .querySelector('.erp-workbench-main-grid')
        ?.getBoundingClientRect()
      const queue = document
        .querySelector('.erp-workbench-queue-panel')
        ?.getBoundingClientRect()
      return {
        gridWidth: grid?.width,
        queueWidth: queue?.width,
        permanentDetail: Boolean(
          document.querySelector('.erp-workbench-task-detail')
        ),
        selectedRows: document.querySelectorAll(
          '.erp-workbench-task-row--active'
        ).length,
        filters: document.querySelectorAll('.erp-workbench-queue-filter')
          .length,
        activeFilters: document.querySelectorAll(
          '.erp-workbench-queue-filter[aria-pressed="true"]'
        ).length,
        overflow:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      }
    })
    assert(
      metrics.queueWidth > 0 &&
        Math.abs(metrics.gridWidth - metrics.queueWidth) < 2 &&
        !metrics.permanentDetail &&
        !metrics.selectedRows &&
        metrics.filters === 3 &&
        metrics.activeFilters === 1 &&
        metrics.overflow <= 1,
      `${scenarioName} 工作台应全宽展示任务并保留队列筛选: ${JSON.stringify(metrics)}`
    )
  }

  async function assertDashboardWorkbenchEntryNavigation(
    page,
    { scenarioName }
  ) {
    const nowSec = Math.floor(Date.now() / 1000)
    const createTask = async (params) =>
      page.evaluate(async (taskParams) => {
        const response = await fetch('/rpc/workflow', {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: `dashboard-workbench-entry-${taskParams.task_code}`,
            method: 'create_task',
            params: taskParams,
          }),
        })
        const payload = await response.json()
        if (payload?.result?.code !== 0) {
          throw new Error(`create_task failed: ${JSON.stringify(payload)}`)
        }
      }, params)

    await createTask({
      task_code: 'style-l1-dashboard-entry-sales-order',
      task_group: 'sales-orders',
      task_name: '工作台来源标签非真实关联任务',
      source_type: 'sales-orders',
      source_id: 1,
      source_no: 'SO-STYLE-L1',
      business_status_key: 'project_pending',
      task_status_key: 'ready',
      owner_role_key: 'boss',
      due_at: nowSec + 3_600,
      payload: { notification_type: 'task_created' },
    })
    await page.getByRole('button', { name: '刷新当前页' }).click()
    await page.getByRole('button', { name: /待我处理，\d+ 项/ }).click()
    await expectText(page, '工作台来源标签非真实关联任务')

    const formalRow = page
      .locator('.erp-workbench-queue-panel .ant-table-row')
      .filter({ hasText: '工作台来源标签非真实关联任务' })
      .first()
    await formalRow.click()
    const drawer = page.locator('.erp-task-action-drawer')
    await drawer.waitFor({ state: 'visible', timeout: 10_000 })
    assert.equal(
      await drawer
        .getByRole('button', { name: '查看相关单据', exact: true })
        .count(),
      0,
      `${scenarioName} 任务抽屉不得恢复未授权的相关单据入口`
    )
    await drawer.locator('.ant-drawer-close').click()
    await drawer.waitFor({ state: 'hidden', timeout: 10_000 })
  }

  async function assertDashboardTaskBoardLayout(page, { scenarioName }) {
    await page.locator('.erp-dashboard-task-board-card').waitFor({
      timeout: 10_000,
    })

    const metrics = await page.evaluate(() => {
      const isVisible = (node) => {
        if (!(node instanceof HTMLElement)) return false
        const rect = node.getBoundingClientRect()
        const style = window.getComputedStyle(node)
        return (
          rect.width > 0 &&
          rect.height > 0 &&
          style.display !== 'none' &&
          style.visibility !== 'hidden'
        )
      }
      const rectOf = (selectorOrNode) => {
        const element =
          typeof selectorOrNode === 'string'
            ? document.querySelector(selectorOrNode)
            : selectorOrNode
        if (!(element instanceof HTMLElement)) return null
        const rect = element.getBoundingClientRect()
        const style = window.getComputedStyle(element)
        return {
          top: rect.top,
          bottom: rect.bottom,
          left: rect.left,
          right: rect.right,
          width: rect.width,
          height: rect.height,
          overflowX: style.overflowX,
          overflowY: style.overflowY,
          position: style.position,
          gridTemplateColumns: style.gridTemplateColumns,
        }
      }
      const boardCard = rectOf('.erp-dashboard-task-board-card')
      const boardContent = rectOf(
        '.erp-dashboard-task-board-card .erp-dashboard-block'
      )
      const lanes = rectOf('.erp-task-board-lanes')
      const currentTaskPanelCount = document.querySelectorAll(
        '.erp-task-center-current'
      ).length
      const filters = rectOf('.erp-task-board-filters')
      const tableCard = rectOf('.erp-dashboard-table-card')
      const visiblePageHeads = Array.from(
        document.querySelectorAll('.erp-admin-page-head')
      ).filter(isVisible).length
      const laneRects = Array.from(
        document.querySelectorAll('.erp-task-board-lane')
      )
        .map((node) => rectOf(node))
        .filter(Boolean)
      const laneVisuals = Array.from(
        document.querySelectorAll('.erp-task-board-lane')
      ).map((node) => {
        const head = node.querySelector('.ant-card-head')
        const laneStyle = window.getComputedStyle(node)
        const headStyle =
          head instanceof HTMLElement ? window.getComputedStyle(head) : null
        const tone = Array.from(node.classList)
          .find((className) => className.startsWith('erp-task-board-lane--'))
          ?.replace('erp-task-board-lane--', '')
        return {
          tone: tone || '',
          cardBorderRadius: laneStyle.borderRadius,
          cardOverflow: laneStyle.overflow,
          headBackgroundColor: headStyle?.backgroundColor || '',
          headBoxShadow: headStyle?.boxShadow || '',
        }
      })
      const overlappingLanePairs = []
      for (let i = 0; i < laneRects.length; i += 1) {
        for (let j = i + 1; j < laneRects.length; j += 1) {
          const left = laneRects[i]
          const right = laneRects[j]
          const xOverlap =
            left.left < right.right - 1 && left.right > right.left + 1
          const yOverlap =
            left.top < right.bottom - 1 && left.bottom > right.top + 1
          if (xOverlap && yOverlap) {
            overlappingLanePairs.push([i, j])
          }
        }
      }

      return {
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          documentScrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        },
        boardCard,
        boardContent,
        lanes,
        currentTaskPanelCount,
        filters,
        laneRects,
        laneVisuals,
        overlappingLanePairs,
        tableCard,
        visiblePageHeads,
      }
    })

    assert(
      metrics.boardCard && metrics.lanes && metrics.filters,
      `${scenarioName} 缺少任务看板布局关键节点: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      metrics.currentTaskPanelCount,
      0,
      `${scenarioName} 任务看板不应保留重复的当前选中任务侧栏`
    )
    assert(
      metrics.boardContent &&
        Math.abs(metrics.lanes.width - metrics.boardContent.width) <= 2,
      `${scenarioName} 分类区域应使用全部内容宽度: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.laneRects.length === 4,
      `${scenarioName} 任务看板应渲染四个泳道: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.laneRects.every((lane) => lane.width >= 180 && lane.height > 0),
      `${scenarioName} 任务看板泳道尺寸异常: ${JSON.stringify(metrics)}`
    )
    const expectedColumns =
      metrics.lanes.width >= 1200 ? 4 : metrics.lanes.width >= 600 ? 2 : 1
    assert.equal(
      new Set(metrics.laneRects.map((rect) => Math.round(rect.top))).size,
      4 / expectedColumns,
      `${scenarioName} 应按可用宽度显示 ${expectedColumns} 列`
    )
    assert(
      metrics.lanes.top - metrics.boardContent.top <=
        (metrics.viewport.width < 768 ? 280 : 140),
      `${scenarioName} 默认顶部不应占满首屏: ${JSON.stringify(metrics)}`
    )
    assert.deepEqual(
      metrics.laneVisuals.map(({ tone }) => tone).sort(),
      ['actionable', 'due', 'exception', 'finished'],
      `${scenarioName} 任务看板四个泳道应保留稳定语义色调: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      new Set(
        metrics.laneVisuals.map(
          ({ headBackgroundColor }) => headBackgroundColor
        )
      ).size,
      4,
      `${scenarioName} 任务看板四个泳道标题背景应可区分: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.laneVisuals.every(
        ({ headBoxShadow }) => headBoxShadow && headBoxShadow !== 'none'
      ),
      `${scenarioName} 任务看板泳道标题应保留轻量语义色条: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.laneVisuals.every(
        ({ cardBorderRadius, cardOverflow }) =>
          Number.parseFloat(cardBorderRadius || '0') >= 12 &&
          cardOverflow === 'hidden'
      ),
      `${scenarioName} 任务看板泳道内容应按卡片外圆角裁切: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.overlappingLanePairs.length === 0,
      `${scenarioName} 任务看板泳道之间发生重叠: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.filters.right <= metrics.boardCard.right + 2,
      `${scenarioName} 任务看板筛选区溢出卡片: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      metrics.visiblePageHeads,
      0,
      `${scenarioName} 任务看板不应再渲染独立页面说明卡: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      metrics.tableCard,
      null,
      `${scenarioName} 任务看板不应再重复渲染明细表: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.viewport.documentScrollWidth <= metrics.viewport.clientWidth + 2,
      `${scenarioName} 任务看板产生页面级横向滚动: ${JSON.stringify(metrics)}`
    )
  }

  async function assertTaskActionDrawerLayout(
    page,
    {
      scenarioName,
      expectedTaskText,
      expectedActionText = '',
      expectReasonInput = false,
    }
  ) {
    const drawer = page.locator('.erp-task-action-drawer').filter({
      hasText: expectedTaskText,
    })
    await drawer.waitFor({ state: 'visible', timeout: 10_000 })
    if (expectedActionText) {
      await expectText(page, expectedActionText)
    }
    await page.waitForFunction(
      ({ expectedTaskText: taskText }) => {
        const drawerElement = Array.from(
          document.querySelectorAll('.erp-task-action-drawer')
        ).find((node) => {
          const rect = node.getBoundingClientRect()
          const style = getComputedStyle(node)
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            style.display !== 'none' &&
            style.visibility !== 'hidden' &&
            String(node.textContent || '').includes(taskText)
          )
        })
        return (
          drawerElement?.querySelectorAll(
            '.erp-task-action-drawer__footer button'
          ).length >= 1
        )
      },
      { expectedTaskText },
      { timeout: 10_000 }
    )

    const metrics = await page.evaluate(
      ({ expectedTaskText: taskText }) => {
        const isVisible = (node) => {
          if (!(node instanceof HTMLElement)) return false
          const rect = node.getBoundingClientRect()
          const style = window.getComputedStyle(node)
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            style.display !== 'none' &&
            style.visibility !== 'hidden'
          )
        }
        const rectOf = (selectorOrNode) => {
          const element =
            typeof selectorOrNode === 'string'
              ? document.querySelector(selectorOrNode)
              : selectorOrNode
          if (!(element instanceof HTMLElement)) return null
          const rect = element.getBoundingClientRect()
          const style = window.getComputedStyle(element)
          return {
            top: rect.top,
            bottom: rect.bottom,
            left: rect.left,
            right: rect.right,
            width: rect.width,
            height: rect.height,
            overflowX: style.overflowX,
            overflowY: style.overflowY,
            display: style.display,
            gridTemplateColumns: style.gridTemplateColumns,
          }
        }
        const drawerElement = Array.from(
          document.querySelectorAll('.erp-task-action-drawer')
        )
          .filter(isVisible)
          .find((node) => String(node.textContent || '').includes(taskText))
        const scopeRect = rectOf(drawerElement)
        const rectInDrawer = (selector) =>
          drawerElement instanceof HTMLElement
            ? rectOf(drawerElement.querySelector(selector))
            : null
        const activeStepPanel =
          drawerElement instanceof HTMLElement
            ? Array.from(
                drawerElement.querySelectorAll(
                  '.erp-task-action-drawer__step-panel'
                )
              ).find(isVisible)
            : null
        const rectInActiveStepPanel = (selector) =>
          activeStepPanel instanceof HTMLElement
            ? rectOf(activeStepPanel.querySelector(selector))
            : null
        const summary = rectInDrawer('.erp-task-action-drawer__summary--task')
        const metaGrid = rectInDrawer('.erp-task-action-drawer__task-meta')
        const guide = rectInDrawer('.erp-task-action-drawer__guide')
        const guideSteps = rectInDrawer('.erp-task-action-drawer__guide-steps')
        const guideNoteCount =
          drawerElement?.querySelectorAll('.erp-task-action-drawer__guide-note')
            .length || 0
        const actionPanel =
          rectInActiveStepPanel('.erp-task-action-drawer__action-panel') ||
          rectInActiveStepPanel('.erp-task-action-drawer__action-prompt') ||
          rectInActiveStepPanel('.erp-task-action-drawer__confirm-panel') ||
          rectOf(activeStepPanel)
        const footer = rectInDrawer('.ant-drawer-footer')
        const body = rectInDrawer('.ant-drawer-body')
        const textArea = rectInActiveStepPanel('textarea')
        const metaItems =
          drawerElement?.querySelectorAll(
            '.erp-task-action-drawer__task-meta > div'
          ).length || 0
        const stepItems =
          drawerElement?.querySelectorAll('.erp-task-action-drawer__step')
            .length || 0
        const footerButtons =
          drawerElement?.querySelectorAll(
            '.erp-task-action-drawer__footer button'
          ).length || 0
        const selectedTabs =
          drawerElement?.querySelectorAll(
            '.erp-task-action-drawer__step[role="tab"][aria-selected="true"]'
          ).length || 0
        const tabList = rectInDrawer(
          '.erp-task-action-drawer__guide-steps[role="tablist"]'
        )
        return {
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight,
            documentScrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
          },
          scopeRect,
          summary,
          metaGrid,
          guide,
          guideSteps,
          guideNoteCount,
          actionPanel,
          footer,
          body,
          textArea,
          metaItems,
          timingKeys: Array.from(
            drawerElement?.querySelectorAll(
              '.erp-task-timing [data-task-time]'
            ) || []
          ).map((row) => row.dataset.taskTime),
          stepItems,
          selectedTabs,
          tabList,
          footerButtons,
        }
      },
      { expectedTaskText }
    )

    assert(
      metrics.scopeRect?.width > 0 && metrics.scopeRect?.height > 0,
      `${scenarioName} 任务处理抽屉不可见: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.scopeRect.width <= Math.min(650, metrics.viewport.width) + 2,
      `${scenarioName} 任务处理抽屉宽度超出预期: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.summary?.height > 0 &&
        metrics.metaGrid?.height > 0 &&
        metrics.guide?.height > 0 &&
        metrics.guideSteps?.height > 0 &&
        metrics.actionPanel?.height > 0 &&
        metrics.footer?.height > 0,
      `${scenarioName} 任务处理抽屉缺少关键分区: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      metrics.metaItems,
      2,
      `${scenarioName} 任务详情基础摘要应展示来源和负责人，日期集中展示: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.timingKeys.includes('arrived') &&
        metrics.timingKeys.includes('due'),
      `${scenarioName} 任务详情应同时显示入岗和处理截止时间: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      metrics.guideNoteCount,
      0,
      `${scenarioName} 任务详情不应重复展示通用处理范围说明: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      metrics.stepItems,
      3,
      `${scenarioName} 任务处理抽屉应展示 3 个处理步骤: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      metrics.selectedTabs,
      1,
      `${scenarioName} 任务处理步骤应只有一个当前步骤: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.tabList?.height > 0,
      `${scenarioName} 任务处理步骤缺少可访问的 tablist: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.footerButtons >= 1,
      `${scenarioName} 任务详情底部缺少当前步骤操作: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      Boolean(metrics.textArea),
      expectReasonInput,
      `${scenarioName} 原因输入显示状态不符合当前动作: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.summary.right <= metrics.scopeRect.right + 2 &&
        metrics.metaGrid.right <= metrics.scopeRect.right + 2 &&
        metrics.guide.right <= metrics.scopeRect.right + 2 &&
        metrics.guideSteps.right <= metrics.scopeRect.right + 2 &&
        metrics.actionPanel.right <= metrics.scopeRect.right + 2,
      `${scenarioName} 任务处理抽屉内容横向溢出: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.footer.top >= metrics.body.top &&
        metrics.footer.bottom <= metrics.scopeRect.bottom + 2,
      `${scenarioName} 任务处理抽屉底部动作区位置异常: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.viewport.documentScrollWidth <= metrics.viewport.clientWidth + 2,
      `${scenarioName} 打开任务处理抽屉后页面产生横向滚动: ${JSON.stringify(metrics)}`
    )
  }

  const {
    assertMobileTaskMainNavigation,
    assertMobileTaskInitialSkeleton,
    assertMobileTaskBossDoneList,
    assertMobileTaskDarkDetailReadable,
    readMobileTaskVisibleListMetrics,
  } = createMobileTaskAssertions({
    assert,
    assertDarkThemeContrast,
    assertReadableOnBackground,
    assertThemeReadable,
    expectText,
    gotoScenarioPath,
    isDarkNeutralBorderColor,
    isLightSurfaceColor,
    isTransparentColor,
    isWarningBorderColor,
    outputDir,
    path,
  })
  return {
    gotoScenarioPath,
    assertNoDashboardCenterLocalRefreshButton,
    assertDashboardMetricInteractionSemantics,
    assertDarkDashboardLinkButtonsUnboxed,
    assertMobileTaskRefreshFeedback,
    assertDashboardWorkbenchLayout,
    assertDashboardWorkbenchEntryNavigation,
    assertDashboardTaskBoardLayout,
    assertTaskActionDrawerLayout,
    assertMobileTaskMainNavigation,
    assertMobileTaskInitialSkeleton,
    assertMobileTaskBossDoneList,
    assertMobileTaskDarkDetailReadable,
  }
}
