import assert from 'node:assert/strict'

async function seedBusinessCollaborationOverflowTasks(
  page,
  {
    sourceType,
    currentSourceID,
    currentSourceNo = 'PO-STYLE-L1',
    currentTaskLabel = '当前采购订单',
  }
) {
  const taskCodeScope =
    String(sourceType || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/gu, '-')
      .replace(/^-+|-+$/gu, '') || 'source'
  const createTask = async (params) =>
    page.evaluate(async (taskParams) => {
      const response = await fetch('/rpc/workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: `seed-business-collab-${taskParams.task_code}`,
          method: 'create_task',
          params: taskParams,
        }),
      })
      const payload = await response.json()
      if (payload?.result?.code !== 0) {
        throw new Error(`create_task failed: ${JSON.stringify(payload)}`)
      }
      return payload?.result?.data?.task || null
    }, params)
  const blockTask = async (task, reason) =>
    page.evaluate(
      async ({ task, reason }) => {
        const response = await fetch('/rpc/workflow', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: `seed-business-collab-block-${task.task_code}`,
            method: 'block_task_action',
            params: {
              task_id: task.id,
              expected_version: task.version,
              idempotency_key: `seed-block-${task.task_code}`,
              action_key: 'block',
              reason,
            },
          }),
        })
        const payload = await response.json()
        if (payload?.result?.code !== 0) {
          throw new Error(
            `block_task_action failed: ${JSON.stringify(payload)}`
          )
        }
      },
      { task, reason }
    )

  for (let index = 0; index < 12; index += 1) {
    await createTask({
      task_code: `style-l1-business-collab-${taskCodeScope}-other-${index + 1}`,
      task_group: sourceType,
      task_name:
        index === 11
          ? '超长其他记录任务名称用于验证当前记录统计不会混入跨记录任务ABCDEFGHIJKLMN1234567890'
          : `其他记录协同任务 ${index + 1}`,
      source_type: sourceType,
      source_id: 9000 + index,
      source_no: `PO-BULK-${String(index + 1).padStart(3, '0')}`,
      task_status_key: 'ready',
      owner_role_key: index % 2 === 0 ? 'purchase' : 'finance',
      payload:
        index === 1
          ? {
              urged: true,
              urge_count: 18,
              last_urge_reason: '连续催办但仍未反馈',
            }
          : {},
    })
  }

  for (let index = 0; index < 8; index += 1) {
    const task = await createTask({
      task_code: `style-l1-business-collab-${taskCodeScope}-current-${index + 1}`,
      task_group: sourceType,
      task_name:
        index === 7
          ? '超长当前记录协同任务名称用于验证很多任务时不会横向溢出ABCDEFGHIJKLMN1234567890'
          : `${currentTaskLabel}协同任务 ${index + 1}`,
      source_type: sourceType,
      source_id: currentSourceID,
      source_no: currentSourceNo,
      task_status_key: 'ready',
      owner_role_key: index % 2 === 0 ? 'purchase' : 'finance',
      payload: {},
    })
    if (index < 3) {
      await blockTask(task, `当前记录阻塞原因 ${index + 1}`)
    }
  }
}

async function assertBusinessCollaborationPanelCollapsedByDefault(
  page,
  {
    scenarioName,
    checkDesktopResize = true,
    checkResizeHandleHover = true,
    expectedOverflowNote = '',
    expectedTabTexts = null,
  }
) {
  const compactText = (text) => String(text || '').replace(/\s+/gu, '')
  const parseRgb = (value) => {
    const match = String(value || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/iu)
    if (!match) return null
    return match.slice(1, 4).map((part) => Number(part))
  }
  const assertSubtleSurfaceDifference = (metrics, label) => {
    const panelRgb = parseRgb(metrics.panelBackground)
    const tableRgb = parseRgb(metrics.tableCardBackground)
    assert(
      panelRgb && tableRgb,
      `${scenarioName} ${label} 无法读取协同面板和主表卡片背景色: ${JSON.stringify(
        metrics
      )}`
    )
    const maxDelta = Math.max(
      ...panelRgb.map((channel, index) => Math.abs(channel - tableRgb[index]))
    )
    assert.notEqual(
      metrics.panelBackground,
      metrics.tableCardBackground,
      `${scenarioName} ${label} 协同面板背景不应和主业务表卡片完全相同: ${JSON.stringify(
        metrics
      )}`
    )
    assert(
      maxDelta >= 2 && maxDelta <= 28,
      `${scenarioName} ${label} 协同面板背景应只做轻微层级区分，不能和主业务卡片差异过大: ${JSON.stringify(
        { ...metrics, maxDelta }
      )}`
    )
  }
  const panel = page.locator('.erp-business-collaboration-task-panel').first()
  await panel.waitFor({ state: 'visible', timeout: 10_000 })
  const toggle = panel.locator('button[aria-expanded]').first()
  await toggle.waitFor({ state: 'attached', timeout: 10_000 })

  const collapsedMetrics = await panel.evaluate((node) => {
    const toggleButton = node.querySelector('button[aria-expanded]')
    const panelBody = node.querySelector(
      '.erp-business-collaboration-task-panel__body'
    )
    const pageLayout = node.closest('.erp-business-page-layout')
    const tableCard = pageLayout?.querySelector('.erp-business-data-table-card')
    const panelStyle = getComputedStyle(node)
    const tableCardStyle = tableCard ? getComputedStyle(tableCard) : null
    return {
      className: node.className,
      ariaExpanded: toggleButton?.getAttribute('aria-expanded') || null,
      toggleText: String(toggleButton?.textContent || '').trim(),
      titleLineText: String(
        node.querySelector('.erp-business-collaboration-task-panel__title-line')
          ?.textContent || ''
      ).trim(),
      hasExpandedPanel: Boolean(
        node.querySelector('.erp-business-collaboration-task-panel__panel')
      ),
      hasActiveHead: Boolean(
        node.querySelector(
          '.erp-business-collaboration-task-panel__active-head'
        )
      ),
      tabCount: node.querySelectorAll(
        '.erp-business-collaboration-task-panel__tab'
      ).length,
      summaryItems: [
        ...node.querySelectorAll(
          '.erp-business-collaboration-task-panel__summary-item'
        ),
      ].map((item) => String(item.textContent || '').trim()),
      actionTagTexts: [
        ...node.querySelectorAll(
          '.erp-business-collaboration-task-panel__actions .ant-tag'
        ),
      ].map((item) => String(item.textContent || '').trim()),
      actionButtonTexts: [
        ...node.querySelectorAll(
          '.erp-business-collaboration-task-panel__actions button'
        ),
      ].map((item) => String(item.textContent || '').trim()),
      bodyHeight: panelBody?.getBoundingClientRect().height || 0,
      panelBackground: panelStyle.backgroundColor,
      tableCardBackground: tableCardStyle?.backgroundColor || '',
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
    }
  })

  assert.equal(
    collapsedMetrics.ariaExpanded,
    'false',
    `${scenarioName} 本页协同默认应收起: ${JSON.stringify(collapsedMetrics)}`
  )
  assert.equal(
    collapsedMetrics.hasExpandedPanel,
    false,
    `${scenarioName} 默认收起态不应渲染协同任务面板: ${JSON.stringify(collapsedMetrics)}`
  )
  assert.equal(
    collapsedMetrics.tabCount,
    0,
    `${scenarioName} 默认收起态不应显示任务 tab: ${JSON.stringify(collapsedMetrics)}`
  )
  assert.equal(
    collapsedMetrics.hasActiveHead,
    false,
    `${scenarioName} 默认收起态不应渲染展开态说明行: ${JSON.stringify(collapsedMetrics)}`
  )
  const collapsedSummaryText = collapsedMetrics.summaryItems.map(compactText)
  assert(
    collapsedSummaryText.some((text) => text.startsWith('待办')) &&
      collapsedSummaryText.some((text) => text.startsWith('阻塞')),
    `${scenarioName} 默认收起态应保留待办和阻塞摘要: ${JSON.stringify(
      collapsedMetrics
    )}`
  )
  assert(
    collapsedSummaryText.some((text) => text.startsWith('当前')),
    `${scenarioName} 收起态应显示当前记录摘要: ${JSON.stringify(
      collapsedMetrics
    )}`
  )
  assert.equal(
    collapsedMetrics.actionTagTexts.length,
    0,
    `${scenarioName} 默认收起态不应在右侧重复展示任务计数 tag: ${JSON.stringify(
      collapsedMetrics
    )}`
  )
  assert(
    compactText(collapsedMetrics.titleLineText).includes('当前记录任务') &&
      compactText(collapsedMetrics.titleLineText).includes(
        '这里只处理当前记录待办'
      ),
    `${scenarioName} 当前记录任务面板应保留标题和业务处理边界短句: ${JSON.stringify(
      collapsedMetrics
    )}`
  )
  assert(
    collapsedMetrics.actionButtonTexts.includes('任务中心'),
    `${scenarioName} 当前记录任务面板应提供前往全局任务中心的入口: ${JSON.stringify(
      collapsedMetrics
    )}`
  )
  assert(
    compactText(collapsedMetrics.toggleText).includes('展开'),
    `${scenarioName} 默认收起态按钮应提示展开: ${JSON.stringify(collapsedMetrics)}`
  )
  assert(
    collapsedMetrics.scrollWidth <= collapsedMetrics.clientWidth + 1,
    `${scenarioName} 默认收起态出现横向溢出: ${JSON.stringify(collapsedMetrics)}`
  )
  assertSubtleSurfaceDifference(collapsedMetrics, '默认收起态')

  await toggle.evaluate((button) => button.click())
  await panel
    .locator('.erp-business-collaboration-task-panel__panel')
    .waitFor({ state: 'visible', timeout: 10_000 })

  const expandedMetrics = await panel.evaluate((node) => {
    const toggleButton = node.querySelector('button[aria-expanded]')
    const tabList = node.querySelector(
      '.erp-business-collaboration-task-panel__tabs'
    )
    const tabPanel = node.querySelector(
      '.erp-business-collaboration-task-panel__list'
    )
    const panelBody = node.querySelector(
      '.erp-business-collaboration-task-panel__body'
    )
    const tabRects = [
      ...node.querySelectorAll('.erp-business-collaboration-task-panel__tab'),
    ].map((item) => item.getBoundingClientRect())
    const activeTaskTab = node.querySelector(
      '.erp-business-collaboration-task-panel__tab--active'
    )
    const activeTaskTabStyle =
      activeTaskTab instanceof HTMLElement
        ? getComputedStyle(activeTaskTab)
        : null
    const activeTaskTabBeforeStyle =
      activeTaskTab instanceof HTMLElement
        ? getComputedStyle(activeTaskTab, '::before')
        : null
    const pageLayout = node.closest('.erp-business-page-layout')
    const rectFor = (selector) => {
      const target = pageLayout?.querySelector(selector)
      if (!target) return null
      const rect = target.getBoundingClientRect()
      const style = getComputedStyle(target)
      if (
        rect.width <= 0 ||
        rect.height <= 0 ||
        style.display === 'none' ||
        style.visibility === 'hidden'
      ) {
        return null
      }
      return {
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      }
    }
    const panelRect = node.getBoundingClientRect()
    const tableCard = pageLayout?.querySelector('.erp-business-data-table-card')
    const panelStyle = getComputedStyle(node)
    const tableCardStyle = tableCard ? getComputedStyle(tableCard) : null
    const panelBounds = {
      top: panelRect.top,
      right: panelRect.right,
      bottom: panelRect.bottom,
      left: panelRect.left,
      width: panelRect.width,
      height: panelRect.height,
    }
    const criticalRects = [
      {
        key: 'tablePagination',
        rect: rectFor('.erp-business-data-table-card .ant-pagination'),
      },
      {
        key: 'selectionActionBar',
        rect: rectFor('.erp-business-selection-action-bar'),
      },
      {
        key: 'listToolbar',
        rect: rectFor('.erp-business-list-toolbar'),
      },
    ].filter((item) => item.rect)
    const overlaps = criticalRects
      .filter((item) => {
        const { rect } = item
        return !(
          rect.right <= panelBounds.left ||
          rect.left >= panelBounds.right ||
          rect.bottom <= panelBounds.top ||
          rect.top >= panelBounds.bottom
        )
      })
      .map((item) => ({
        key: item.key,
        rect: item.rect,
      }))
    return {
      ariaExpanded: toggleButton?.getAttribute('aria-expanded') || null,
      toggleText: String(toggleButton?.textContent || '').trim(),
      textContent: String(node.textContent || '').trim(),
      hasExpandedPanel: Boolean(
        node.querySelector('.erp-business-collaboration-task-panel__panel')
      ),
      hasActiveHead: Boolean(
        node.querySelector(
          '.erp-business-collaboration-task-panel__active-head'
        )
      ),
      bodyHeight: panelBody?.getBoundingClientRect().height || 0,
      tabListRole: tabList?.getAttribute('role') || '',
      tabListLabel: tabList?.getAttribute('aria-label') || '',
      tabListDisplay: tabList ? getComputedStyle(tabList).display : '',
      tabTexts: [
        ...node.querySelectorAll('.erp-business-collaboration-task-panel__tab'),
      ].map((item) => String(item.textContent || '').trim()),
      activeTabTransitionDuration: activeTaskTabStyle?.transitionDuration || '',
      activeTabFillContent: activeTaskTabBeforeStyle?.content || '',
      activeTabFillTransitionDuration:
        activeTaskTabBeforeStyle?.transitionDuration || '',
      taskItemCount: node.querySelectorAll(
        '.erp-business-collaboration-task-panel__item'
      ).length,
      moreNoteTexts: [
        ...node.querySelectorAll(
          '.erp-business-collaboration-task-panel__more-note'
        ),
      ].map((item) => String(item.textContent || '').trim()),
      summaryItems: [
        ...node.querySelectorAll(
          '.erp-business-collaboration-task-panel__summary-item'
        ),
      ].map((item) => String(item.textContent || '').trim()),
      maxTabHeight: Math.max(0, ...tabRects.map((rect) => rect.height)),
      tabA11y: [
        ...node.querySelectorAll('.erp-business-collaboration-task-panel__tab'),
      ].map((item) => ({
        role: item.getAttribute('role') || '',
        selected: item.getAttribute('aria-selected') || '',
        controls: item.getAttribute('aria-controls') || '',
        id: item.id || '',
      })),
      tabPanelRole: tabPanel?.getAttribute('role') || '',
      tabPanelLabelledBy: tabPanel?.getAttribute('aria-labelledby') || '',
      panelBounds,
      panelBackground: panelStyle.backgroundColor,
      tableCardBackground: tableCardStyle?.backgroundColor || '',
      criticalRects,
      overlaps,
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
    }
  })

  assert.equal(
    expandedMetrics.ariaExpanded,
    'true',
    `${scenarioName} 点击展开后 aria-expanded 应为 true: ${JSON.stringify(expandedMetrics)}`
  )
  assert.equal(
    expandedMetrics.hasActiveHead,
    false,
    `${scenarioName} 展开态不应在 tab 和列表之间插入重复说明行: ${JSON.stringify(
      expandedMetrics
    )}`
  )
  if (expectedTabTexts) {
    assert.deepEqual(
      expandedMetrics.tabTexts.map(compactText),
      expectedTabTexts.map(compactText),
      `${scenarioName} 展开后任务 tab 计数不正确: ${JSON.stringify(
        expandedMetrics
      )}`
    )
  } else {
    assert.deepEqual(
      expandedMetrics.tabTexts.map((text) =>
        compactText(text).replace(/\d+$/u, '')
      ),
      ['当前记录', '阻塞异常'],
      `${scenarioName} 展开后任务 tab 不完整: ${JSON.stringify(expandedMetrics)}`
    )
  }
  if (expectedOverflowNote) {
    assert(
      expandedMetrics.moreNoteTexts
        .map(compactText)
        .includes(compactText(expectedOverflowNote)),
      `${scenarioName} 多任务截断提示不正确: ${JSON.stringify(expandedMetrics)}`
    )
    assert.equal(
      expandedMetrics.taskItemCount,
      6,
      `${scenarioName} 多任务展开态应只渲染前 6 条任务: ${JSON.stringify(
        expandedMetrics
      )}`
    )
  } else {
    assert.deepEqual(
      expandedMetrics.moreNoteTexts,
      [],
      `${scenarioName} 未超出可见上限时不应显示截断提示: ${JSON.stringify(
        expandedMetrics
      )}`
    )
  }
  assert.deepEqual(
    expandedMetrics.summaryItems,
    [],
    `${scenarioName} 展开态不应在标题行重复展示任务摘要计数: ${JSON.stringify(
      expandedMetrics
    )}`
  )
  assert.equal(
    expandedMetrics.tabListRole,
    'tablist',
    `${scenarioName} 协同任务分类缺少 tablist 语义: ${JSON.stringify(expandedMetrics)}`
  )
  assert.equal(
    expandedMetrics.tabListLabel,
    '当前记录任务分类',
    `${scenarioName} 协同任务分类 aria-label 不正确: ${JSON.stringify(expandedMetrics)}`
  )
  assert.equal(
    expandedMetrics.tabListDisplay,
    'flex',
    `${scenarioName} 展开态任务分类应使用紧凑分段控件布局: ${JSON.stringify(
      expandedMetrics
    )}`
  )
  assert(
    expandedMetrics.activeTabFillContent !== 'none' &&
      expandedMetrics.activeTabFillContent !== 'normal' &&
      String(expandedMetrics.activeTabTransitionDuration)
        .split(',')
        .some((part) => Number.parseFloat(part) > 0) &&
      String(expandedMetrics.activeTabFillTransitionDuration)
        .split(',')
        .some((part) => Number.parseFloat(part) > 0),
    `${scenarioName} 协同任务分类缺少平滑选中态过渡: ${JSON.stringify(
      expandedMetrics
    )}`
  )
  assert(
    expandedMetrics.maxTabHeight > 0 && expandedMetrics.maxTabHeight <= 36,
    `${scenarioName} 展开态任务分类高度过高: ${JSON.stringify(expandedMetrics)}`
  )
  assert(
    expandedMetrics.tabA11y.every((item) => item.role === 'tab'),
    `${scenarioName} 协同任务分类按钮缺少 tab 语义: ${JSON.stringify(expandedMetrics)}`
  )
  assert.equal(
    expandedMetrics.tabA11y.filter((item) => item.selected === 'true').length,
    1,
    `${scenarioName} 协同任务分类应只有一个 aria-selected=true: ${JSON.stringify(
      expandedMetrics
    )}`
  )
  assert.equal(
    expandedMetrics.tabPanelRole,
    'tabpanel',
    `${scenarioName} 协同任务列表缺少 tabpanel 语义: ${JSON.stringify(expandedMetrics)}`
  )
  assert.equal(
    expandedMetrics.tabPanelLabelledBy,
    expandedMetrics.tabA11y.find((item) => item.selected === 'true')?.id,
    `${scenarioName} 协同任务 tabpanel 未绑定当前 tab: ${JSON.stringify(
      expandedMetrics
    )}`
  )
  assert(
    compactText(expandedMetrics.toggleText).includes('收起'),
    `${scenarioName} 展开态按钮应提示收起: ${JSON.stringify(expandedMetrics)}`
  )
  assert(
    !expandedMetrics.textContent.includes(
      '按当前业务模块读取现有 workflow 任务'
    ),
    `${scenarioName} 展开态不应保留解释性占位文案: ${JSON.stringify(expandedMetrics)}`
  )
  assert(
    expandedMetrics.scrollWidth <= expandedMetrics.clientWidth + 1,
    `${scenarioName} 展开态出现横向溢出: ${JSON.stringify(expandedMetrics)}`
  )
  assertSubtleSurfaceDifference(expandedMetrics, '展开态')

  const viewportSize = page.viewportSize()
  if ((viewportSize?.width || 0) >= 769) {
    assert.deepEqual(
      expandedMetrics.overlaps,
      [],
      `${scenarioName} 桌面展开态本页协同不应遮挡分页、表格工具栏或当前操作区: ${JSON.stringify(
        expandedMetrics
      )}`
    )
  }
  const shouldInspectResizeHandle =
    (viewportSize?.width || 0) >= 769 &&
    (checkDesktopResize || checkResizeHandleHover)
  if (shouldInspectResizeHandle) {
    const resizeHandle = panel.locator(
      '.erp-business-collaboration-task-panel__resize-handle'
    )
    await resizeHandle.waitFor({ state: 'visible', timeout: 10_000 })

    const readResizeHandleVisualMetrics = async () =>
      panel.evaluate((node) => {
        const handle = node.querySelector(
          '.erp-business-collaboration-task-panel__resize-handle'
        )
        const grip = node.querySelector(
          '.erp-business-collaboration-task-panel__grip-bar'
        )
        const panelBody = node.querySelector(
          '.erp-business-collaboration-task-panel__body'
        )
        const handleRect = handle?.getBoundingClientRect()
        const gripRect = grip?.getBoundingClientRect()
        const panelBodyRect = panelBody?.getBoundingClientRect()
        const handleStyle = handle ? getComputedStyle(handle) : null
        const gripStyle = grip ? getComputedStyle(grip) : null
        return {
          panelBodyHeight: panelBodyRect?.height || 0,
          panelBodyTop: panelBodyRect?.top || 0,
          panelBodyBottom: panelBodyRect?.bottom || 0,
          handleTop: handleRect?.top || 0,
          handleBottom: handleRect?.bottom || 0,
          handleCursor: handleStyle?.cursor || '',
          handleBackground: handleStyle?.backgroundColor || '',
          handleHeight: handleRect?.height || 0,
          gripWidth: gripRect?.width || 0,
          gripHeight: gripRect?.height || 0,
          gripTop: gripRect?.top || 0,
          gripBottom: gripRect?.bottom || 0,
          gripBackground: gripStyle?.backgroundColor || '',
          gripBoxShadow: gripStyle?.boxShadow || '',
        }
      })

    if (checkResizeHandleHover) {
      const idleHandleMetrics = await readResizeHandleVisualMetrics()
      assert.equal(
        idleHandleMetrics.handleCursor,
        'default',
        `${scenarioName} 协同入口拖拽手柄未拖动时不应显示上下拖拽光标: ${JSON.stringify(
          idleHandleMetrics
        )}`
      )
      assert(
        idleHandleMetrics.handleHeight >= 14 &&
          idleHandleMetrics.handleHeight <= 18,
        `${scenarioName} 协同入口拖拽手柄命中区应便于鼠标拖拽且不应变成大块横杆: ${JSON.stringify(
          idleHandleMetrics
        )}`
      )
      assert(
        idleHandleMetrics.handleTop >= idleHandleMetrics.panelBodyTop - 0.5 &&
          idleHandleMetrics.gripTop >= idleHandleMetrics.panelBodyTop - 0.5 &&
          idleHandleMetrics.gripBottom <=
            idleHandleMetrics.panelBodyBottom + 0.5,
        `${scenarioName} 协同入口拖拽横杆必须在面板可见区域内，不能被卡片顶部裁切: ${JSON.stringify(
          idleHandleMetrics
        )}`
      )
      assert(
        idleHandleMetrics.gripHeight >= 5 && idleHandleMetrics.gripHeight <= 5,
        `${scenarioName} 协同入口拖拽短线应保持 5px 可见握柄: ${JSON.stringify(
          idleHandleMetrics
        )}`
      )
      assert.equal(
        idleHandleMetrics.gripBoxShadow,
        'none',
        `${scenarioName} 协同入口拖拽短线默认不应有阴影加粗: ${JSON.stringify(
          idleHandleMetrics
        )}`
      )

      await resizeHandle.hover()
      const hoverHandleMetrics = await readResizeHandleVisualMetrics()
      assert.equal(
        hoverHandleMetrics.handleCursor,
        'ns-resize',
        `${scenarioName} 协同入口拖拽手柄 hover 应提示可上下拖拽: ${JSON.stringify(
          { idleHandleMetrics, hoverHandleMetrics }
        )}`
      )
      assert.equal(
        hoverHandleMetrics.handleBackground,
        idleHandleMetrics.handleBackground,
        `${scenarioName} 协同入口拖拽手柄 hover 不应改变背景: ${JSON.stringify({
          idleHandleMetrics,
          hoverHandleMetrics,
        })}`
      )
      assert.equal(
        hoverHandleMetrics.gripBackground,
        idleHandleMetrics.gripBackground,
        `${scenarioName} 协同入口拖拽短线 hover 不应变色: ${JSON.stringify({
          idleHandleMetrics,
          hoverHandleMetrics,
        })}`
      )
      assert.equal(
        hoverHandleMetrics.gripHeight,
        idleHandleMetrics.gripHeight,
        `${scenarioName} 协同入口拖拽短线 hover 不应变粗: ${JSON.stringify({
          idleHandleMetrics,
          hoverHandleMetrics,
        })}`
      )
      assert(
        Math.abs(
          hoverHandleMetrics.panelBodyHeight - idleHandleMetrics.panelBodyHeight
        ) <= 0.5,
        `${scenarioName} 协同入口拖拽手柄 hover 不应改变面板高度: ${JSON.stringify(
          {
            idleHandleMetrics,
            hoverHandleMetrics,
          }
        )}`
      )
    }

    if (!checkDesktopResize) {
      await page.mouse.move(1, 1)
    }

    if (checkDesktopResize) {
      const beforeResizeMetrics = await panel.evaluate((node) => {
        const cardBody = node.querySelector('.ant-card-body')
        const panelBody = node.querySelector(
          '.erp-business-collaboration-task-panel__body'
        )
        const taskList = node.querySelector('.erp-business-module-task-list')
        return {
          cardBodyHeight: cardBody?.getBoundingClientRect().height || 0,
          bodyHeight: panelBody?.getBoundingClientRect().height || 0,
          listClientHeight: taskList?.clientHeight || 0,
          listScrollHeight: taskList?.scrollHeight || 0,
          scrollWidth: node.scrollWidth,
          clientWidth: node.clientWidth,
        }
      })
      assert(
        beforeResizeMetrics.bodyHeight >= 240 &&
          beforeResizeMetrics.bodyHeight <= 300,
        `${scenarioName} 协同入口默认高度应保持紧凑且可处理任务: ${JSON.stringify(
          beforeResizeMetrics
        )}`
      )

      const growHandleBox = await resizeHandle.boundingBox()
      assert(
        growHandleBox,
        `${scenarioName} 协同入口桌面拖拽手柄缺少可点击区域`
      )
      await page.mouse.move(
        growHandleBox.x + growHandleBox.width / 2,
        growHandleBox.y + growHandleBox.height / 2
      )
      await page.mouse.down()
      await page.mouse.move(
        growHandleBox.x + growHandleBox.width / 2,
        growHandleBox.y + growHandleBox.height / 2 - 120,
        { steps: 6 }
      )
      await page.mouse.up()

      const grownMetrics = await panel.evaluate((node) => {
        const cardBody = node.querySelector('.ant-card-body')
        const panelBody = node.querySelector(
          '.erp-business-collaboration-task-panel__body'
        )
        const taskList = node.querySelector('.erp-business-module-task-list')
        return {
          cardBodyHeight: cardBody?.getBoundingClientRect().height || 0,
          bodyHeight: panelBody?.getBoundingClientRect().height || 0,
          listClientHeight: taskList?.clientHeight || 0,
          listScrollHeight: taskList?.scrollHeight || 0,
          scrollWidth: node.scrollWidth,
          clientWidth: node.clientWidth,
        }
      })
      assert(
        grownMetrics.bodyHeight >= beforeResizeMetrics.bodyHeight + 80,
        `${scenarioName} 向上拖动后协同入口高度未增加: ${JSON.stringify({
          beforeResizeMetrics,
          grownMetrics,
        })}`
      )
      assert(
        grownMetrics.scrollWidth <= grownMetrics.clientWidth + 1,
        `${scenarioName} 拖高后协同入口出现横向溢出: ${JSON.stringify(grownMetrics)}`
      )

      const shrinkHandleBox = await resizeHandle.boundingBox()
      assert(shrinkHandleBox, `${scenarioName} 协同入口拖高后手柄丢失`)
      await page.mouse.move(
        shrinkHandleBox.x + shrinkHandleBox.width / 2,
        shrinkHandleBox.y + shrinkHandleBox.height / 2
      )
      await page.mouse.down()
      await page.mouse.move(
        shrinkHandleBox.x + shrinkHandleBox.width / 2,
        shrinkHandleBox.y + shrinkHandleBox.height / 2 + 100,
        { steps: 6 }
      )
      await page.mouse.up()

      const shrunkMetrics = await panel.evaluate((node) => {
        const cardBody = node.querySelector('.ant-card-body')
        const panelBody = node.querySelector(
          '.erp-business-collaboration-task-panel__body'
        )
        const taskList = node.querySelector('.erp-business-module-task-list')
        return {
          cardBodyHeight: cardBody?.getBoundingClientRect().height || 0,
          bodyHeight: panelBody?.getBoundingClientRect().height || 0,
          listClientHeight: taskList?.clientHeight || 0,
          listScrollHeight: taskList?.scrollHeight || 0,
          scrollWidth: node.scrollWidth,
          clientWidth: node.clientWidth,
        }
      })
      assert(
        shrunkMetrics.bodyHeight <= grownMetrics.bodyHeight - 70,
        `${scenarioName} 向下拖动后协同入口高度未缩小: ${JSON.stringify({
          grownMetrics,
          shrunkMetrics,
        })}`
      )
      assert(
        shrunkMetrics.bodyHeight >= 240,
        `${scenarioName} 拖动后协同入口低于最小高度: ${JSON.stringify(shrunkMetrics)}`
      )
      assert(
        shrunkMetrics.listScrollHeight >= shrunkMetrics.listClientHeight,
        `${scenarioName} 协同任务列表没有保持面板内滚动边界: ${JSON.stringify(shrunkMetrics)}`
      )
      assert(
        shrunkMetrics.scrollWidth <= shrunkMetrics.clientWidth + 1,
        `${scenarioName} 拖低后协同入口出现横向溢出: ${JSON.stringify(shrunkMetrics)}`
      )
    }
  }

  await toggle.evaluate((button) => button.click())
  const restoredMetrics = await panel.evaluate((node) => {
    const toggleButton = node.querySelector('button[aria-expanded]')
    return {
      ariaExpanded: toggleButton?.getAttribute('aria-expanded') || null,
      toggleText: String(toggleButton?.textContent || '').trim(),
      hasExpandedPanel: Boolean(
        node.querySelector('.erp-business-collaboration-task-panel__panel')
      ),
    }
  })
  assert.equal(
    restoredMetrics.ariaExpanded,
    'false',
    `${scenarioName} 收起后 aria-expanded 应恢复 false: ${JSON.stringify(restoredMetrics)}`
  )
  assert.equal(
    restoredMetrics.hasExpandedPanel,
    false,
    `${scenarioName} 收起后不应继续显示任务面板: ${JSON.stringify(restoredMetrics)}`
  )
  assert(
    compactText(restoredMetrics.toggleText).includes('展开'),
    `${scenarioName} 收起后按钮应恢复展开: ${JSON.stringify(restoredMetrics)}`
  )
}
export {
  seedBusinessCollaborationOverflowTasks,
  assertBusinessCollaborationPanelCollapsedByDefault,
}
