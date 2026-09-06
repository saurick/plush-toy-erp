import {
  assertThemeReadable,
  assertDarkThemeContrast,
} from './themeAssertions.mjs'
import { expectText } from './pageAssertions.mjs'
import assert from 'node:assert/strict'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
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
      expectTaskMetrics = false,
      expectBusinessSummary = false,
    } = {}
  ) {
    const metrics = await page.evaluate(
      ({ expectTaskMetrics, expectBusinessSummary }) => {
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
            text: String(node.textContent || '')
              .replace(/\s+/g, ' ')
              .trim(),
          }
        }
        const taskMetrics = expectTaskMetrics
          ? Array.from(document.querySelectorAll('.erp-task-center-metric'))
              .filter(isVisible)
              .map((node) => ({
                ...describeNode(node),
                iconCount: node.querySelectorAll(
                  '.erp-task-center-metric__icon'
                ).length,
                hintCount: node.querySelectorAll('small').length,
                active: node.classList.contains(
                  'erp-task-center-metric--active'
                ),
              }))
          : []
        const businessSummary = expectBusinessSummary
          ? Array.from(
              document.querySelectorAll('.erp-business-board-summary-card')
            )
              .filter(isVisible)
              .map((node) => ({
                ...describeNode(node),
                buttonCount: node.querySelectorAll('button').length,
                badgeText:
                  node
                    .querySelector('.erp-metric-readonly-card__badge')
                    ?.textContent?.trim() || '',
              }))
          : []

        return {
          taskMetrics,
          businessSummary,
        }
      },
      { expectTaskMetrics, expectBusinessSummary }
    )

    if (expectTaskMetrics) {
      assert.equal(
        metrics.taskMetrics.length,
        4,
        `${scenarioName} 任务中心应有 4 个动作指标按钮: ${JSON.stringify(metrics)}`
      )
      for (const item of metrics.taskMetrics) {
        assert.equal(
          item.tagName,
          'BUTTON',
          `${scenarioName} 动作指标必须是真实 button: ${JSON.stringify(item)}`
        )
        assert.equal(
          item.iconCount,
          1,
          `${scenarioName} 动作指标必须带进入箭头: ${JSON.stringify(item)}`
        )
        assert.equal(
          item.hintCount,
          1,
          `${scenarioName} 动作指标必须带动作提示文案: ${JSON.stringify(item)}`
        )
        assert(
          item.ariaPressed === 'true' || item.ariaPressed === 'false',
          `${scenarioName} 动作指标必须声明 aria-pressed: ${JSON.stringify(item)}`
        )
        assert(
          item.height >= 72,
          `${scenarioName} 动作指标高度过低，容易退化成普通统计块: ${JSON.stringify(item)}`
        )
        if (item.disabled) {
          assert.notEqual(
            item.cursor,
            'pointer',
            `${scenarioName} 禁用动作指标不应露出可点光标: ${JSON.stringify(item)}`
          )
        } else {
          assert.equal(
            item.cursor,
            'pointer',
            `${scenarioName} 可用动作指标必须露出 pointer 光标: ${JSON.stringify(item)}`
          )
        }
      }
      assert(
        metrics.taskMetrics.some((item) => !item.disabled),
        `${scenarioName} 动作指标应至少有一个可用入口: ${JSON.stringify(metrics)}`
      )
    }

    if (expectBusinessSummary) {
      assert.equal(
        metrics.businessSummary.length,
        4,
        `${scenarioName} 业务看板应有 4 个只读摘要卡: ${JSON.stringify(metrics)}`
      )
      for (const item of metrics.businessSummary) {
        assert.equal(
          item.tagName,
          'DIV',
          `${scenarioName} 只读摘要卡不应渲染成 button: ${JSON.stringify(item)}`
        )
        assert.equal(
          item.role,
          '',
          `${scenarioName} 只读摘要卡不应声明 button 角色: ${JSON.stringify(item)}`
        )
        assert.equal(
          item.buttonCount,
          0,
          `${scenarioName} 只读摘要卡内部不应有按钮: ${JSON.stringify(item)}`
        )
        assert.equal(
          item.cursor,
          'default',
          `${scenarioName} 只读摘要卡必须使用 default 光标: ${JSON.stringify(item)}`
        )
        assert(
          item.badgeText.length > 0,
          `${scenarioName} 只读摘要卡必须露出用途标签: ${JSON.stringify(item)}`
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
          display: style.display,
          gridTemplateColumns: style.gridTemplateColumns,
          overflowX: style.overflowX,
          overflowY: style.overflowY,
        }
      }
      const overlaps = (left, right) => {
        if (!left || !right) return false
        return (
          left.left < right.right - 1 &&
          left.right > right.left + 1 &&
          left.top < right.bottom - 1 &&
          left.bottom > right.top + 1
        )
      }
      const commandCard = rectOf('.erp-workbench-command-card')
      const mainGrid = rectOf('.erp-workbench-main-grid')
      const queuePanel = rectOf('.erp-workbench-queue-panel')
      const detailPanel = rectOf('.erp-workbench-task-detail')
      const detailHead = rectOf(
        '.erp-workbench-task-detail .erp-workbench-panel-head'
      )
      const detailBody = rectOf('.erp-workbench-detail-body')
      const detailTitle = rectOf('.erp-workbench-detail-title')
      const detailDescriptions = rectOf(
        '.erp-workbench-task-detail .ant-descriptions'
      )
      const detailActions = rectOf('.erp-workbench-detail-actions')
      const detailEmpty = rectOf('.erp-workbench-detail-empty')
      const detailEmptyContent = rectOf(
        '.erp-workbench-detail-empty .ant-empty'
      )
      const queueFilters = Array.from(
        document.querySelectorAll('.erp-workbench-queue-filter')
      )
        .map((node) => rectOf(node))
        .filter(Boolean)
      const activeQueueFilters = document.querySelectorAll(
        '.erp-workbench-queue-filter[aria-pressed="true"]'
      ).length
      const roleRows = Array.from(
        document.querySelectorAll('.erp-workbench-role-row')
      )
        .map((node) => rectOf(node))
        .filter(Boolean)
      const activeRows = document.querySelectorAll(
        '.erp-workbench-task-row--active'
      ).length
      return {
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          documentScrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
        },
        commandCard,
        mainGrid,
        queuePanel,
        detailPanel,
        detailHead,
        detailBody,
        detailTitle,
        detailDescriptions,
        detailActions,
        detailEmpty,
        detailEmptyContent,
        queueFilters,
        activeQueueFilters,
        roleRows,
        activeRows,
        queueDetailOverlap: overlaps(queuePanel, detailPanel),
      }
    })

    assert(
      metrics.commandCard?.width > 0 && metrics.commandCard?.height > 0,
      `${scenarioName} 工作台主卡片不可见: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      metrics.queueFilters.length,
      3,
      `${scenarioName} 工作台应保留 3 个队列筛选入口: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      metrics.activeQueueFilters,
      1,
      `${scenarioName} 工作台应只有一个当前队列入口: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.queuePanel?.width > 0 && metrics.detailPanel?.width > 0,
      `${scenarioName} 工作台队列和当前任务上下文应同时可见: ${JSON.stringify(metrics)}`
    )
    assert(
      !metrics.queueDetailOverlap,
      `${scenarioName} 工作台主列与当前任务上下文不应重叠: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.detailHead?.height > 0,
      `${scenarioName} 工作台任务上下文头部应可见: ${JSON.stringify(metrics)}`
    )
    if (metrics.detailBody) {
      assert(
        metrics.detailTitle?.height > 0 &&
          metrics.detailDescriptions?.height > 0 &&
          metrics.detailActions?.height > 0,
        `${scenarioName} 工作台任务上下文正文、字段和动作区应同时可见: ${JSON.stringify(metrics)}`
      )
      assert(
        metrics.detailTitle.left >= metrics.detailPanel.left + 12 &&
          metrics.detailDescriptions.left >= metrics.detailPanel.left + 12 &&
          metrics.detailActions.left >= metrics.detailPanel.left + 12,
        `${scenarioName} 工作台任务上下文正文不应贴左边框: ${JSON.stringify(metrics)}`
      )
      assert(
        metrics.detailTitle.top >= metrics.detailHead.bottom + 12,
        `${scenarioName} 工作台任务上下文标题不应贴住头部分割线: ${JSON.stringify(metrics)}`
      )
      assert(
        metrics.detailActions.right <= metrics.detailPanel.right - 12 + 1 &&
          metrics.detailActions.bottom <= metrics.detailPanel.bottom - 12 + 1,
        `${scenarioName} 工作台任务上下文动作区不应贴边或溢出: ${JSON.stringify(metrics)}`
      )
    } else {
      assert(
        metrics.detailEmpty?.height > 0,
        `${scenarioName} 工作台任务上下文空态应可见: ${JSON.stringify(metrics)}`
      )
      assert(
        metrics.detailEmptyContent?.height > 0 &&
          metrics.detailEmptyContent.left >= metrics.detailPanel.left + 12 &&
          metrics.detailEmptyContent.top >= metrics.detailHead.bottom + 12 &&
          metrics.detailEmptyContent.right <=
            metrics.detailPanel.right - 12 + 1 &&
          metrics.detailEmptyContent.bottom <=
            metrics.detailPanel.bottom - 12 + 1,
        `${scenarioName} 工作台任务上下文空态不应贴边或溢出: ${JSON.stringify(metrics)}`
      )
    }
    assert(
      metrics.viewport.documentScrollWidth <= metrics.viewport.clientWidth + 1,
      `${scenarioName} 工作台出现页面级横向溢出: ${JSON.stringify(metrics)}`
    )
    if (metrics.viewport.width >= 1280) {
      assert(
        metrics.queuePanel.width > metrics.detailPanel.width,
        `${scenarioName} 桌面工作台应是左侧主队列、右侧上下文: ${JSON.stringify(metrics)}`
      )
    } else {
      assert(
        metrics.detailPanel.top >= metrics.queuePanel.bottom - 1,
        `${scenarioName} 窄屏工作台应改为上下排列: ${JSON.stringify(metrics)}`
      )
    }
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
    const detailPanel = page.locator('.erp-workbench-task-detail')
    await expectText(page, 'SO-STYLE-L1')
    assert.equal(
      await detailPanel
        .getByRole('button', { name: '查看相关单据', exact: true })
        .count(),
      0,
      `${scenarioName} 仅有来源标签和 source_id 的普通任务不得显示相关单据入口`
    )
    await formalRow.dblclick({ position: { x: 24, y: 20 } })
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
      const lanes = rectOf('.erp-task-board-lanes')
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
        lanes,
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
    assert(
      metrics.laneRects.length === 4,
      `${scenarioName} 任务看板应渲染四个泳道: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.laneRects.every((lane) => lane.width >= 180 && lane.height > 0),
      `${scenarioName} 任务看板泳道尺寸异常: ${JSON.stringify(metrics)}`
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
      3,
      `${scenarioName} 任务详情摘要应只展示来源、负责人和截止时间: ${JSON.stringify(metrics)}`
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
