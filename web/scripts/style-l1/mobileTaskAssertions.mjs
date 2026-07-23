export function createMobileTaskAssertions(deps) {
  const {
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
  } = deps

  async function assertMobileTaskMainNavigation(page, { scenarioName }) {
    const todoMetrics = await readMobileTaskLayoutMetrics(page)
    assertMobileTaskBottomNavLayout(todoMetrics, scenarioName)
    assert.equal(
      todoMetrics.heading,
      '待办',
      `${scenarioName} 默认分区应为待办: ${JSON.stringify(todoMetrics)}`
    )
    assert.equal(
      todoMetrics.logoutVisible,
      false,
      `${scenarioName} 退出登录不应出现在待办分区: ${JSON.stringify(todoMetrics)}`
    )
    assert(
      !todoMetrics.sectionHeadings.includes('已加载任务进度') &&
        !todoMetrics.sectionHeadings.includes('任务提醒') &&
        !todoMetrics.sectionHeadings.includes('预警'),
      `${scenarioName} 待办分区仍混入进度/预警/提醒区块: ${JSON.stringify(todoMetrics)}`
    )
    await assertMobileTaskListToggle(page, {
      scenarioName,
      listKey: 'todo',
      itemSelector: '.erp-mobile-list-item',
      collapsedMax: 12,
      expectServerPagination: true,
    })
    await assertMobileTaskScrollTopControl(page, { scenarioName })
    await assertMobileTaskFilterTabsSticky(page, { scenarioName })

    await page.getByTestId('mobile-role-nav-messages').click()
    await page.waitForFunction(() => {
      const heading = document.querySelector('.mobile-role-tasks-page h1')
      return heading?.textContent?.trim() === '提醒'
    })
    const reminderMetrics = await readMobileTaskLayoutMetrics(page)
    assertMobileTaskBottomNavLayout(reminderMetrics, scenarioName)
    assert(
      reminderMetrics.sectionHeadings.includes('预警') &&
        !reminderMetrics.sectionHeadings.includes('任务提醒'),
      `${scenarioName} 提醒分区默认应先显示预警且不把普通提醒压在预警列表后: ${JSON.stringify(reminderMetrics)}`
    )
    await assertMobileTaskMessageTabsSwitch(page, { scenarioName })
    await assertMobileTaskDarkMessagesReadable(page, { scenarioName })

    await page.getByTestId('mobile-role-nav-done').click()
    await page.waitForFunction(() => {
      const heading = document.querySelector('.mobile-role-tasks-page h1')
      return heading?.textContent?.trim() === '已办'
    })
    const doneMetrics = await readMobileTaskLayoutMetrics(page)
    assertMobileTaskBottomNavLayout(doneMetrics, scenarioName)
    assert(
      doneMetrics.sectionHeadings.includes('已加载任务进度') &&
        doneMetrics.sectionHeadings.includes('已办任务'),
      `${scenarioName} 已办分区应承载进度和已办任务: ${JSON.stringify(doneMetrics)}`
    )
    await assertMobileTaskProgressSummary(page, { scenarioName })
    await assertMobileTaskListToggle(page, {
      scenarioName,
      listKey: 'done',
      itemSelector: '.erp-mobile-list-item',
      collapsedMax: 10,
    })

    await page.getByTestId('mobile-role-nav-mine').click()
    await page.waitForFunction(() => {
      const heading = document.querySelector('.mobile-role-tasks-page h1')
      return heading?.textContent?.trim() === '我的'
    })
    const mineMetrics = await readMobileTaskLayoutMetrics(page)
    assertMobileTaskBottomNavLayout(mineMetrics, scenarioName)
    assert(
      mineMetrics.logoutVisible,
      `${scenarioName} 退出登录应只在我的分区出现: ${JSON.stringify(mineMetrics)}`
    )
    await assertMobileMinePanelLayout(page, { scenarioName })

    await page.getByTestId('mobile-role-nav-todo').click()
    await page.waitForFunction(() => {
      const heading = document.querySelector('.mobile-role-tasks-page h1')
      return heading?.textContent?.trim() === '待办'
    })
    const restoredMetrics = await readMobileTaskLayoutMetrics(page)
    assertMobileTaskBottomNavLayout(restoredMetrics, scenarioName)
    assert.equal(
      restoredMetrics.logoutVisible,
      false,
      `${scenarioName} 从我的返回待办后不应残留退出登录: ${JSON.stringify(restoredMetrics)}`
    )
    await assertMobileTaskPrimaryFilterNavigation(page, { scenarioName })
  }

  async function readVisibleMobileTaskListText(page) {
    return page.locator('.erp-mobile-list-item').evaluateAll((items) =>
      items
        .filter((item) => {
          const rect = item.getBoundingClientRect()
          return rect.width > 0 && rect.height > 0
        })
        .map((item) => item.textContent?.replace(/\s+/g, ' ').trim() || '')
        .join('\n')
    )
  }

  async function assertMobileTaskVisibleTextNoTechnicalFields(
    page,
    { scenarioName, scope = '页面' } = {}
  ) {
    const metrics = await page.evaluate(() => {
      const text = document.body?.innerText?.replace(/\s+/g, ' ').trim() || ''
      const patterns = [
        'owner_role_key',
        'task_status_key',
        'task_group',
        'source_type',
        'source_id',
        'assignee_id',
        'payload',
        'business_status_key',
        'unknown_task_group',
        'unknown_source',
        'project-orders',
        'boss-review',
        'TASK-\\d+',
        '#\\d+',
      ]
      const matches = patterns.filter((pattern) =>
        new RegExp(pattern, 'iu').test(text)
      )
      return {
        matches,
        sample: text.slice(0, 1200),
      }
    })
    assert.equal(
      metrics.matches.length,
      0,
      `${scenarioName} ${scope} 泄漏技术字段或内部编号 fallback: ${JSON.stringify(metrics)}`
    )
  }

  async function assertMobileTaskProgressSummary(page, { scenarioName }) {
    const expectedToneByTestID = {
      'mobile-role-progress-ready': 'ready',
      'mobile-role-progress-blocked': 'blocked',
      'mobile-role-progress-rejected': 'rejected',
      'mobile-role-progress-done': 'done',
    }
    const metrics = await page.evaluate(() =>
      [
        'mobile-role-progress-ready',
        'mobile-role-progress-blocked',
        'mobile-role-progress-rejected',
        'mobile-role-progress-done',
      ].map((testID) => {
        const node = document.querySelector(`[data-testid="${testID}"]`)
        const value = node?.querySelector('.mobile-role-metric-button__value')
        const label = node?.querySelector('.mobile-role-metric-button__label')
        const valueStyle = value ? window.getComputedStyle(value) : null
        const labelStyle = label ? window.getComputedStyle(label) : null
        const rect = node?.getBoundingClientRect()
        return {
          testID,
          tagName: node?.tagName || '',
          role: node?.getAttribute('role') || '',
          ariaPressed: node?.getAttribute('aria-pressed'),
          className: node?.className || '',
          text: node?.textContent?.replace(/\s+/g, ' ').trim() || '',
          valueText: value?.textContent?.trim() || '',
          valueColor: valueStyle?.color || '',
          labelColor: labelStyle?.color || '',
          width: rect?.width || 0,
          height: rect?.height || 0,
          scrollWidth: node?.scrollWidth || 0,
          clientWidth: node?.clientWidth || 0,
        }
      })
    )
    metrics.forEach((item) => {
      assert.equal(
        item.tagName,
        'DIV',
        `${scenarioName} 进度项应是只读摘要，不应继续作为按钮: ${JSON.stringify(metrics)}`
      )
      assert.equal(
        item.ariaPressed,
        null,
        `${scenarioName} 进度摘要不应暴露选中态: ${JSON.stringify(metrics)}`
      )
      assert(
        item.scrollWidth <= item.clientWidth + 1,
        `${scenarioName} 进度摘要出现横向溢出: ${JSON.stringify(metrics)}`
      )
      assert.match(
        item.valueText,
        /^\d+$/u,
        `${scenarioName} 进度摘要必须显示服务端状态计数: ${JSON.stringify(metrics)}`
      )
      assert(
        String(item.className).includes(
          `mobile-role-summary-metric--${expectedToneByTestID[item.testID]}`
        ),
        `${scenarioName} 进度摘要缺少语义色 tone class: ${JSON.stringify(metrics)}`
      )
      assert(
        !isTransparentColor(item.valueColor) &&
          item.valueColor === item.labelColor,
        `${scenarioName} 进度摘要数字和标签应使用同一语义色: ${JSON.stringify(metrics)}`
      )
    })
  }

  async function assertMobileTaskPrimaryFilterNavigation(
    page,
    { scenarioName }
  ) {
    await assertMobileTaskFocusSummary(page, { scenarioName })

    await page.getByTestId('mobile-role-filter-risk').click()
    const visibleText = await readVisibleMobileTaskListText(page)
    await assertMobileTaskFilterSelected(page, 'mobile-role-filter-risk', {
      scenarioName,
      label: '风险',
    })
    assert(
      visibleText.includes('暗色任务验证') &&
        !visibleText.includes('批量待办任务 1'),
      `${scenarioName} 点击“风险”后未进入风险筛选: ${visibleText}`
    )

    await page.getByTestId('mobile-role-filter-all').click()
    await assertMobileTaskFilterSelected(page, 'mobile-role-filter-all', {
      scenarioName,
      label: '全部',
    })
  }

  async function assertMobileTaskBossDoneList(page, { scenarioName }) {
    await gotoScenarioPath(page, '/m/boss/tasks', {
      waitUntil: 'domcontentloaded',
    })
    await expectText(page, '待办')
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="mobile-role-scroll"]')
          ?.getAttribute('aria-busy') === 'false',
      undefined,
      { timeout: 10_000 }
    )
    await page.getByTestId('mobile-role-nav-done').click()
    await page.waitForFunction(() => {
      const heading = document.querySelector('.mobile-role-tasks-page h1')
      return heading?.textContent?.trim() === '已办'
    })
    await page
      .locator('.erp-mobile-list-item')
      .filter({ hasText: '批量老板已办任务' })
      .first()
      .waitFor({ state: 'visible', timeout: 10_000 })

    const visibleText = await readVisibleMobileTaskListText(page)
    const bossDoneMetrics = await page.evaluate(() => ({
      url: window.location.href,
      heading:
        document
          .querySelector('.mobile-role-tasks-page h1')
          ?.textContent?.trim() || '',
      ariaBusy:
        document
          .querySelector('[data-testid="mobile-role-scroll"]')
          ?.getAttribute('aria-busy') || '',
      loadError:
        document
          .querySelector('.mobile-role-load-error')
          ?.textContent?.replace(/\s+/g, ' ')
          .trim() || '',
      emptyText:
        document
          .querySelector('.erp-mobile-empty-state')
          ?.textContent?.replace(/\s+/g, ' ')
          .trim() || '',
    }))
    assert(
      visibleText.includes('批量老板已办任务') &&
        !visibleText.includes('暂无已办任务'),
      `${scenarioName} 老板端已办列表未渲染造数任务: ${JSON.stringify({
        ...bossDoneMetrics,
        visibleText,
      })}`
    )
    await assertMobileTaskListToggle(page, {
      scenarioName: `${scenarioName} boss`,
      listKey: 'done',
      itemSelector: '.erp-mobile-list-item',
      collapsedMax: 10,
    })
  }

  async function assertMobileTaskFocusSummary(page, { scenarioName }) {
    const focusCard = page.getByTestId('mobile-role-focus-card')
    await focusCard.waitFor({ state: 'visible', timeout: 10_000 })
    const metrics = await focusCard.evaluate((node) => {
      const rect = node.getBoundingClientRect()
      const removedMetricTestIDs = [
        'mobile-role-metric-alerts',
        'mobile-role-metric-overdue',
        'mobile-role-metric-due-soon',
        'mobile-role-metric-risk',
      ]
      return {
        tagName: node.tagName,
        text: node.textContent?.replace(/\s+/g, ' ').trim() || '',
        width: rect.width,
        height: rect.height,
        scrollWidth: node.scrollWidth,
        clientWidth: node.clientWidth,
        removedMetricCount: removedMetricTestIDs.filter((testID) =>
          document.querySelector(`[data-testid="${testID}"]`)
        ).length,
        documentScrollWidth: document.documentElement.scrollWidth,
        documentClientWidth: document.documentElement.clientWidth,
      }
    })

    assert.equal(
      metrics.tagName,
      'BUTTON',
      `${scenarioName} 当前优先事项应是可操作的任务入口: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.text.includes('当前优先事项') &&
        metrics.text.includes('先处理') &&
        metrics.text.includes('超时任务') &&
        metrics.text.includes('待办') &&
        metrics.text.includes('风险') &&
        metrics.text.includes('超时'),
      `${scenarioName} 当前优先事项没有解释先做什么及原因: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.height >= 44 &&
        metrics.scrollWidth <= metrics.clientWidth + 1 &&
        metrics.documentScrollWidth <= metrics.documentClientWidth + 1,
      `${scenarioName} 当前优先事项点击区或长文布局异常: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      metrics.removedMetricCount,
      0,
      `${scenarioName} 待办首屏不应恢复已删除的四张统计指标: ${JSON.stringify(metrics)}`
    )

    await focusCard.click()
    await assertMobileTaskFilterSelected(page, 'mobile-role-filter-overdue', {
      scenarioName,
      label: '当前优先事项跳转后的超时',
    })
    const visibleText = await readVisibleMobileTaskListText(page)
    assert(
      visibleText.includes('批量超时任务') &&
        !visibleText.includes('批量待办任务 1'),
      `${scenarioName} 当前优先事项没有进入超时任务: ${visibleText}`
    )
    await page.getByTestId('mobile-role-filter-all').click()
  }

  async function assertMobileMinePanelLayout(page, { scenarioName }) {
    const metrics = await page.evaluate(() => {
      const scroll = document.querySelector(
        '[data-testid="mobile-role-scroll"]'
      )
      const cards = Array.from(
        scroll?.querySelectorAll('.erp-mobile-card') || []
      ).map((card) => {
        const style = window.getComputedStyle(card)
        const rect = card.getBoundingClientRect()
        return {
          text: card.textContent?.replace(/\s+/g, ' ').trim() || '',
          backgroundColor: style.backgroundColor,
          width: rect.width,
          height: rect.height,
          scrollWidth: card.scrollWidth,
          clientWidth: card.clientWidth,
        }
      })
      const actionButtons = Array.from(scroll?.querySelectorAll('button') || [])
        .filter((button) =>
          ['进入电脑端', '切换工作入口', '退出登录'].includes(
            button.textContent?.replace(/\s+/g, ' ').trim() || ''
          )
        )
        .map((button) => {
          const rect = button.getBoundingClientRect()
          return {
            text: button.textContent?.replace(/\s+/g, ' ').trim() || '',
            disabled: button.disabled,
            width: rect.width,
            height: rect.height,
          }
        })
      return {
        cards,
        actionButtons,
        removedMetricCount: document.querySelectorAll(
          '[data-testid^="mobile-role-mine-metric-"]'
        ).length,
        documentScrollWidth: document.documentElement.scrollWidth,
        documentClientWidth: document.documentElement.clientWidth,
      }
    })

    assert.equal(
      metrics.removedMetricCount,
      0,
      `${scenarioName} 我的页不应恢复已删除的重复任务指标: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.cards.length === 2 &&
        metrics.cards.some(
          (card) =>
            card.text.includes('账号岗位') && card.text.includes('可用范围')
        ) &&
        metrics.cards.some((card) => card.text.includes('入口与安全')),
      `${scenarioName} 我的页应聚焦账号岗位、可用范围和入口安全: ${JSON.stringify(metrics)}`
    )
    metrics.cards.forEach((card) => {
      assert(
        card.width > 280 &&
          card.height >= 44 &&
          card.scrollWidth <= card.clientWidth + 1 &&
          !isTransparentColor(card.backgroundColor),
        `${scenarioName} 我的页信息卡布局或主题背景异常: ${JSON.stringify(metrics)}`
      )
    })
    const actionButtonTexts = metrics.actionButtons.map(
      (button) => button.text
    )
    assert(
      actionButtonTexts.length === 2 &&
        ['进入电脑端', '切换工作入口'].includes(actionButtonTexts[0]) &&
        actionButtonTexts[1] === '退出登录',
      `${scenarioName} 我的页应保留可用入口与退出动作: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.actionButtons.every(
        (button) =>
          !button.disabled && button.width > 280 && button.height >= 44
      ) && metrics.documentScrollWidth <= metrics.documentClientWidth + 1,
      `${scenarioName} 我的页操作点击区或横向布局异常: ${JSON.stringify(metrics)}`
    )
  }

  async function assertMobileTaskFilterSelected(
    page,
    testID,
    { scenarioName, label }
  ) {
    const metrics = await page.getByTestId(testID).evaluate((node) => {
      const style = window.getComputedStyle(node)
      const rect = node.getBoundingClientRect()
      const filters = node.closest('.mobile-role-task-filters')
      const filterThumbStyle =
        filters instanceof HTMLElement
          ? window.getComputedStyle(filters, '::before')
          : null
      return {
        testID: node.getAttribute('data-testid'),
        ariaPressed: node.getAttribute('aria-pressed'),
        className: node.className,
        filtersClassName: filters?.className || '',
        filterThumbContent: filterThumbStyle?.content || '',
        filterThumbTransform: filterThumbStyle?.transform || '',
        filterThumbTransitionDuration:
          filterThumbStyle?.transitionDuration || '',
        filterTransitionDuration: style.transitionDuration || '',
        backgroundColor: style.backgroundColor,
        color: style.color,
        boxShadow: style.boxShadow,
        width: rect.width,
        height: rect.height,
        scrollWidth: node.scrollWidth,
        clientWidth: node.clientWidth,
      }
    })
    assert.equal(
      metrics.ariaPressed,
      'true',
      `${scenarioName} ${label} 缺少 aria-pressed 选中态: ${JSON.stringify(metrics)}`
    )
    assert(
      String(metrics.className).includes('mobile-role-task-filter--active'),
      `${scenarioName} ${label} 筛选选中态缺少 active class: ${JSON.stringify(metrics)}`
    )
    const expectedFilterKey = String(testID).replace('mobile-role-filter-', '')
    assert(
      String(metrics.filtersClassName).includes(
        `mobile-role-task-filters--${expectedFilterKey}`
      ) &&
        metrics.filterThumbContent !== 'none' &&
        metrics.filterThumbContent !== 'normal' &&
        String(metrics.filterThumbTransitionDuration)
          .split(',')
          .some((part) => Number.parseFloat(part) > 0) &&
        String(metrics.filterTransitionDuration)
          .split(',')
          .some((part) => Number.parseFloat(part) > 0),
      `${scenarioName} ${label} 筛选缺少滑动选中态过渡: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.scrollWidth <= metrics.clientWidth + 1,
      `${scenarioName} ${label} 筛选选中态造成按钮内容横向溢出: ${JSON.stringify(metrics)}`
    )
  }

  async function assertMobileTaskListToggle(
    page,
    {
      scenarioName,
      listKey,
      itemSelector,
      collapsedMax,
      expectServerPagination = false,
    }
  ) {
    const toggle = page.getByTestId(`mobile-role-list-toggle-${listKey}`)
    const captureUnifiedMoreState = async (stateKey) => {
      if (
        !expectServerPagination ||
        !outputDir ||
        typeof path?.join !== 'function'
      ) {
        return
      }
      await toggle.scrollIntoViewIfNeeded()
      await page.screenshot({
        path: path.join(
          outputDir,
          `${scenarioName}-${listKey}-unified-more-${stateKey}.png`
        ),
        fullPage: true,
      })
    }
    await toggle.waitFor({ state: 'visible', timeout: 10_000 })
    const toggleCount = await toggle.count()
    assert.equal(
      toggleCount,
      1,
      `${scenarioName} ${listKey} 长列表应出现唯一展开控制，实际 ${toggleCount}`
    )
    assert.equal(
      await page.getByTestId(`mobile-role-server-load-more-${listKey}`).count(),
      0,
      `${scenarioName} ${listKey} 不应再显示第二个服务端加载按钮`
    )

    const collapsedMetrics = await readMobileTaskVisibleListMetrics(
      page,
      itemSelector
    )
    assert(
      collapsedMetrics.itemCount > 0 &&
        collapsedMetrics.itemCount <= collapsedMax,
      `${scenarioName} ${listKey} 默认收起数量异常: ${JSON.stringify(collapsedMetrics)}`
    )
    assert(
      collapsedMetrics.toggleText.includes(`再显示 ${collapsedMax}`) &&
        !collapsedMetrics.toggleText.includes('当前只显示已加载内容'),
      `${scenarioName} ${listKey} 统一显示更多控制文案异常: ${JSON.stringify(collapsedMetrics)}`
    )
    assert(
      collapsedMetrics.documentScrollWidth <=
        collapsedMetrics.documentClientWidth + 1,
      `${scenarioName} ${listKey} 默认收起态横向溢出: ${JSON.stringify(collapsedMetrics)}`
    )
    await captureUnifiedMoreState('collapsed')

    await toggle.click()
    const expandedMetrics = await readMobileTaskVisibleListMetrics(
      page,
      itemSelector
    )
    const expectedFirstBatchCount = Math.min(
      collapsedMetrics.totalItemCount,
      collapsedMetrics.itemCount + collapsedMax
    )
    assert(
      expandedMetrics.itemCount === expectedFirstBatchCount,
      `${scenarioName} ${listKey} 首次展开后没有按批次增加: ${JSON.stringify({ collapsedMetrics, expandedMetrics, expectedFirstBatchCount })}`
    )
    assert(
      expandedMetrics.itemCount === expandedMetrics.totalItemCount ||
        expandedMetrics.toggleText.includes('显示'),
      `${scenarioName} ${listKey} 未到最后一批时应继续显示分批展开入口: ${JSON.stringify(expandedMetrics)}`
    )

    const appendRequests = []
    const captureAppendRequest = (request) => {
      if (!request.url().includes('/rpc/workflow')) return
      let body = null
      try {
        body = request.postDataJSON()
      } catch {
        return
      }
      if (
        body?.method === 'list_role_tasks' &&
        String(body?.params?.cursor || '').trim()
      ) {
        appendRequests.push(body)
      }
    }
    page.on('request', captureAppendRequest)
    let finalMetrics = expandedMetrics
    let serverBoundaryMetrics = null
    try {
      for (
        let index = 0;
        index < 20 && !finalMetrics.toggleText.includes('收起');
        index += 1
      ) {
        const beforeClickMetrics = finalMetrics
        const appendRequestCount = appendRequests.length
        await toggle.click()
        await page.waitForFunction(
          ({
            beforeItemCount,
            beforeTotalItemCount,
            itemSelector,
            listToggleTestID,
          }) => {
            const node = document.querySelector(
              `[data-testid="${listToggleTestID}"]`
            )
            const itemCount = document.querySelectorAll(itemSelector).length
            const totalItemCount = Number(node?.dataset?.totalItemCount || 0)
            const settled = node?.getAttribute('aria-busy') !== 'true'
            const collapsed = node?.textContent?.includes('收起') === true
            return (
              settled &&
              (itemCount > beforeItemCount ||
                totalItemCount > beforeTotalItemCount ||
                collapsed)
            )
          },
          {
            beforeItemCount: beforeClickMetrics.itemCount,
            beforeTotalItemCount: beforeClickMetrics.totalItemCount,
            itemSelector,
            listToggleTestID: `mobile-role-list-toggle-${listKey}`,
          },
          { timeout: 15_000 }
        )
        finalMetrics = await readMobileTaskVisibleListMetrics(
          page,
          itemSelector
        )
        if (
          appendRequests.length > appendRequestCount &&
          !serverBoundaryMetrics
        ) {
          serverBoundaryMetrics = {
            before: beforeClickMetrics,
            after: finalMetrics,
          }
          await captureUnifiedMoreState('server-page')
        }
      }
    } finally {
      page.off('request', captureAppendRequest)
    }
    if (expectServerPagination) {
      assert(
        appendRequests.length > 0 &&
          appendRequests.every((body) =>
            String(body?.params?.cursor || '').trim()
          ),
        `${scenarioName} ${listKey} 统一入口没有用游标续取服务端下一页: ${JSON.stringify(appendRequests)}`
      )
      assert(
        serverBoundaryMetrics &&
          serverBoundaryMetrics.after.totalItemCount >
            serverBoundaryMetrics.before.totalItemCount &&
          serverBoundaryMetrics.after.itemCount >
            serverBoundaryMetrics.before.itemCount,
        `${scenarioName} ${listKey} 跨服务端分页的同次点击没有增加可见任务: ${JSON.stringify(serverBoundaryMetrics)}`
      )
    }
    assert(
      finalMetrics.toggleText.includes('收起') &&
        finalMetrics.itemCount === finalMetrics.totalItemCount,
      `${scenarioName} ${listKey} 展开到最后后缺少收起入口: ${JSON.stringify(finalMetrics)}`
    )

    await toggle.click()
    const restoredMetrics = await readMobileTaskVisibleListMetrics(
      page,
      itemSelector
    )
    assert.equal(
      restoredMetrics.itemCount,
      collapsedMetrics.itemCount,
      `${scenarioName} ${listKey} 收起后没有恢复默认数量: ${JSON.stringify({ collapsedMetrics, restoredMetrics })}`
    )
  }

  async function assertMobileTaskScrollTopControl(page, { scenarioName }) {
    const button = page.getByTestId('mobile-role-scroll-top')
    await page.evaluate(() => {
      const scroll = document.querySelector(
        '[data-testid="mobile-role-scroll"]'
      )
      if (scroll instanceof HTMLElement) {
        scroll.scrollTop = 0
        scroll.dispatchEvent(new Event('scroll', { bubbles: true }))
      }
    })
    await page.waitForTimeout(100)
    assert.equal(
      await button.count(),
      0,
      `${scenarioName} 回到顶部按钮默认不应显示`
    )

    const scrolled = await page.evaluate(() => {
      const scroll = document.querySelector(
        '[data-testid="mobile-role-scroll"]'
      )
      if (!(scroll instanceof HTMLElement)) return null
      const maxScrollTop = Math.max(
        0,
        scroll.scrollHeight - scroll.clientHeight
      )
      scroll.scrollTop = Math.min(720, maxScrollTop)
      scroll.dispatchEvent(new Event('scroll', { bubbles: true }))
      const nav = document.querySelector(
        '[data-testid="mobile-role-bottom-nav"]'
      )
      return {
        scrollTop: scroll.scrollTop,
        scrollHeight: scroll.scrollHeight,
        clientHeight: scroll.clientHeight,
        navTop: nav?.getBoundingClientRect().top || 0,
      }
    })
    assert(
      scrolled && scrolled.scrollTop >= 280,
      `${scenarioName} 回到顶部控制缺少可滚动距离: ${JSON.stringify(scrolled)}`
    )

    await button.waitFor({ state: 'visible', timeout: 10_000 })
    const visibleMetrics = await page.evaluate(() => {
      const buttonNode = document.querySelector(
        '[data-testid="mobile-role-scroll-top"]'
      )
      const nav = document.querySelector(
        '[data-testid="mobile-role-bottom-nav"]'
      )
      const buttonRect = buttonNode?.getBoundingClientRect()
      const navRect = nav?.getBoundingClientRect()
      return {
        button: buttonRect
          ? {
              top: buttonRect.top,
              right: buttonRect.right,
              bottom: buttonRect.bottom,
              width: buttonRect.width,
              height: buttonRect.height,
            }
          : null,
        nav: navRect
          ? {
              top: navRect.top,
              bottom: navRect.bottom,
            }
          : null,
        ariaLabel: buttonNode?.getAttribute('aria-label') || '',
        documentScrollWidth: document.documentElement.scrollWidth,
        documentClientWidth: document.documentElement.clientWidth,
      }
    })
    assert.equal(
      visibleMetrics.ariaLabel,
      '回到顶部',
      `${scenarioName} 回到顶部按钮缺少 aria-label: ${JSON.stringify(visibleMetrics)}`
    )
    assert(
      visibleMetrics.button &&
        visibleMetrics.button.width === 44 &&
        visibleMetrics.button.height === 44,
      `${scenarioName} 回到顶部按钮尺寸异常: ${JSON.stringify(visibleMetrics)}`
    )
    assert(
      visibleMetrics.button &&
        visibleMetrics.nav &&
        visibleMetrics.button.bottom <= visibleMetrics.nav.top - 8,
      `${scenarioName} 回到顶部按钮遮挡底部导航: ${JSON.stringify(visibleMetrics)}`
    )
    assert(
      visibleMetrics.documentScrollWidth <=
        visibleMetrics.documentClientWidth + 1,
      `${scenarioName} 回到顶部按钮造成横向溢出: ${JSON.stringify(visibleMetrics)}`
    )

    await button.click()
    await page.waitForFunction(() => {
      const scroll = document.querySelector(
        '[data-testid="mobile-role-scroll"]'
      )
      return scroll instanceof HTMLElement && scroll.scrollTop <= 2
    })
    assert.equal(
      await button.count(),
      0,
      `${scenarioName} 回到顶部后按钮应隐藏`
    )
  }

  async function assertMobileTaskMessageTabsSwitch(page, { scenarioName }) {
    const noticeTab = page.getByTestId('mobile-role-message-tab-notice')
    const warningTab = page.getByTestId('mobile-role-message-tab-warning')

    await noticeTab.waitFor({ state: 'visible', timeout: 10_000 })
    await warningTab.waitFor({ state: 'visible', timeout: 10_000 })
    await assertMobileTaskListToggle(page, {
      scenarioName,
      listKey: 'warning',
      itemSelector: '.mobile-role-message-card',
      collapsedMax: 8,
      expectServerPagination: true,
    })
    await noticeTab.click()
    await page.waitForFunction(() => {
      const headings = Array.from(
        document.querySelectorAll('.mobile-role-tasks-page h2')
      ).map((heading) => heading.textContent?.trim() || '')
      return headings.includes('任务提醒') && !headings.includes('预警')
    })

    const noticeMetrics = await readMobileTaskMessageTabMetrics(page)
    assert(
      noticeMetrics.activeTab === '提醒',
      `${scenarioName} 点击提醒后未激活提醒 tab: ${JSON.stringify(noticeMetrics)}`
    )
    assert(
      noticeMetrics.tabsClassName.includes('mobile-role-message-tabs--notice'),
      `${scenarioName} 提醒 tab 缺少滑动选中态类名: ${JSON.stringify(noticeMetrics)}`
    )
    assert(
      noticeMetrics.tabsThumbContent !== 'none' &&
        noticeMetrics.tabsThumbContent !== 'normal' &&
        String(noticeMetrics.tabsThumbTransitionDuration)
          .split(',')
          .some((part) => Number.parseFloat(part) > 0) &&
        String(noticeMetrics.activeTabTransitionDuration)
          .split(',')
          .some((part) => Number.parseFloat(part) > 0),
      `${scenarioName} 提醒 tab 缺少平滑选中态过渡: ${JSON.stringify(noticeMetrics)}`
    )
    assert(
      noticeMetrics.sectionHeadings.length === 1 &&
        noticeMetrics.sectionHeadings[0] === '任务提醒',
      `${scenarioName} 提醒 tab 不应继续被预警列表挤到下方: ${JSON.stringify(noticeMetrics)}`
    )
    assert(
      noticeMetrics.tabsSticky &&
        noticeMetrics.tabs &&
        noticeMetrics.tabs.width > 280 &&
        noticeMetrics.tabs.scrollWidth <= noticeMetrics.tabs.clientWidth + 1,
      `${scenarioName} 提醒二级 tab 盒模型异常: ${JSON.stringify(noticeMetrics)}`
    )
    assert(
      noticeMetrics.cards.length > 0 &&
        noticeMetrics.cards.every(
          (card) => card.width > 280 && card.scrollWidth <= card.clientWidth + 1
        ),
      `${scenarioName} 提醒卡片出现横向溢出: ${JSON.stringify(noticeMetrics)}`
    )
    await assertMobileTaskListToggle(page, {
      scenarioName,
      listKey: 'notice',
      itemSelector: '.mobile-role-message-card',
      collapsedMax: 8,
    })

    await warningTab.click()
    await page.waitForFunction(() => {
      const headings = Array.from(
        document.querySelectorAll('.mobile-role-tasks-page h2')
      ).map((heading) => heading.textContent?.trim() || '')
      return headings.includes('预警') && !headings.includes('任务提醒')
    })
    const warningMetrics = await readMobileTaskMessageTabMetrics(page)
    assert(
      warningMetrics.activeTab === '预警' &&
        warningMetrics.tabsClassName.includes(
          'mobile-role-message-tabs--warning'
        ),
      `${scenarioName} 回到预警 tab 后滑动选中态未恢复: ${JSON.stringify(warningMetrics)}`
    )
  }

  async function assertMobileTaskDarkMessagesReadable(page, { scenarioName }) {
    const metrics = await page.evaluate(() => {
      const readRect = (element) => {
        const rect = element?.getBoundingClientRect?.()
        return rect
          ? {
              width: rect.width,
              height: rect.height,
              top: rect.top,
              bottom: rect.bottom,
            }
          : null
      }
      const readColor = (element) => {
        const style = window.getComputedStyle(element)
        return {
          color: style.color,
          backgroundColor: style.backgroundColor,
          borderColor: style.borderColor,
        }
      }
      const textSelectors = [
        '.mobile-role-message-card__tone',
        '.mobile-role-message-card__title',
        '.mobile-role-message-card__source',
        '.mobile-role-message-card__reason',
        '.mobile-role-message-card__time',
      ].join(',')

      const sections = Array.from(
        document.querySelectorAll('.mobile-role-message-section')
      ).map((section) => {
        const heading = section.querySelector('h2')
        return {
          heading: heading?.textContent?.trim() || '',
          rect: readRect(section),
          ...readColor(section),
          headingColor: heading ? window.getComputedStyle(heading).color : '',
        }
      })

      const cards = Array.from(
        document.querySelectorAll(
          '.mobile-role-message-card, .mobile-role-message-empty'
        )
      ).map((card) => {
        const textNodes = Array.from(card.querySelectorAll(textSelectors))
        if (textNodes.length === 0 && card.textContent?.trim()) {
          textNodes.push(card)
        }
        return {
          text: card.textContent?.replace(/\s+/g, ' ').trim() || '',
          isWarning: card.classList.contains(
            'mobile-role-message-card--warning'
          ),
          isNotice: card.classList.contains('mobile-role-message-card--notice'),
          isEmpty: card.classList.contains('mobile-role-message-empty'),
          rect: readRect(card),
          ...readColor(card),
          textNodes: textNodes.map((node) => ({
            text: node.textContent?.replace(/\s+/g, ' ').trim() || '',
            color: window.getComputedStyle(node).color,
          })),
        }
      })

      return {
        effectiveTheme: document.documentElement.dataset.erpTheme || '',
        sections,
        cards,
        documentScrollWidth: document.documentElement.scrollWidth,
        documentClientWidth: document.documentElement.clientWidth,
      }
    })

    assert.equal(
      metrics.effectiveTheme,
      'dark',
      `${scenarioName} 提醒可读性断言必须在暗色模式执行: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.sections.length === 1 && metrics.sections[0].heading === '预警',
      `${scenarioName} 提醒页默认应只渲染当前预警区块: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.cards.length >= 1,
      `${scenarioName} 提醒页缺少可验证卡片或空态: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.cards.some((card) => card.isWarning),
      `${scenarioName} 提醒页缺少预警卡片: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.documentScrollWidth <= metrics.documentClientWidth + 1,
      `${scenarioName} 提醒页出现横向溢出: ${JSON.stringify(metrics)}`
    )

    metrics.sections.forEach((section) => {
      assert(
        !isLightSurfaceColor(section.backgroundColor),
        `${scenarioName} 提醒分区仍是浅色背景: ${JSON.stringify(section)}`
      )
      assertReadableOnBackground(
        section.headingColor,
        section.backgroundColor,
        `${scenarioName} 提醒分区标题对比度不足`
      )
    })

    metrics.cards.forEach((card) => {
      assert(
        card.rect && card.rect.width > 280 && card.rect.height >= 40,
        `${scenarioName} 提醒卡片尺寸异常: ${JSON.stringify(card)}`
      )
      assert(
        !isLightSurfaceColor(card.backgroundColor),
        `${scenarioName} 提醒卡片仍是浅色背景: ${JSON.stringify(card)}`
      )
      assert(
        isDarkNeutralBorderColor(card.borderColor) ||
          isWarningBorderColor(card.borderColor),
        `${scenarioName} 提醒卡片边框不够清楚: ${JSON.stringify(card)}`
      )
      card.textNodes.forEach((node) => {
        if (!node.text) return
        assertReadableOnBackground(
          node.color,
          card.backgroundColor,
          `${scenarioName} 提醒卡片文字对比度不足`
        )
      })
    })
  }

  async function assertMobileTaskDarkDetailReadable(page, { scenarioName }) {
    await page
      .getByRole('button', { name: /暗色任务验证/ })
      .first()
      .click()
    await page
      .locator('.mobile-role-tasks-page--detail')
      .waitFor({ state: 'visible', timeout: 10_000 })
    await expectText(page, '任务关键信息')
    await expectText(page, '关联来源')
    await expectText(page, '任务附件')
    await expectText(page, '历史处理线索')
    await expectText(page, '查看与补充附件')
    await expectText(page, '当前办理状态')
    await page
      .getByRole('button', { name: '处理任务', exact: true })
      .waitFor({ state: 'visible', timeout: 10_000 })
    await assertMobileTaskVisibleTextNoTechnicalFields(page, {
      scenarioName,
      scope: '本岗位详情',
    })
    await assertThemeReadable(page, {
      scenarioName,
      selector: '.mobile-role-detail-header',
    })
    await assertThemeReadable(page, {
      scenarioName,
      selector: '.mobile-role-tasks-page--detail',
    })

    const detailMetrics = await page.evaluate(() => {
      const shell = document.querySelector('.mobile-role-tasks-page--detail')
      const header = document.querySelector('.mobile-role-detail-header')
      const actionBar = document.querySelector('.mobile-role-action-bar')
      const shellRect = shell?.getBoundingClientRect()
      const headerRect = header?.getBoundingClientRect()
      const actionBarRect = actionBar?.getBoundingClientRect()
      const buttons = Array.from(
        actionBar?.querySelectorAll('.mobile-role-action-bar__button') || []
      ).map((button) => {
        const rect = button.getBoundingClientRect()
        const style = window.getComputedStyle(button)
        return {
          text: button.textContent?.replace(/\s+/g, ' ').trim() || '',
          width: rect.width,
          height: rect.height,
          color: style.color,
          backgroundColor: style.backgroundColor,
          opacity: style.opacity,
        }
      })
      const flowSteps = Array.from(
        document.querySelectorAll(
          '[data-testid="mobile-task-flow-steps"] [data-step-key]'
        )
      ).map((step) => ({
        key: step.dataset.stepKey || '',
        state: step.dataset.state || '',
        current: step.getAttribute('aria-current') || '',
        disabled: step.disabled,
        height: step.getBoundingClientRect().height,
      }))
      return {
        shell: shellRect
          ? {
              bottom: shellRect.bottom,
              height: shellRect.height,
            }
          : null,
        header: headerRect
          ? {
              top: headerRect.top,
              height: headerRect.height,
            }
          : null,
        actionBar: actionBarRect
          ? {
              top: actionBarRect.top,
              bottom: actionBarRect.bottom,
              height: actionBarRect.height,
            }
          : null,
        inlineActionInputCount: shell?.querySelectorAll('textarea').length || 0,
        actionGuidanceCount: document.querySelectorAll(
          '[data-testid="mobile-role-action-guidance"]'
        ).length,
        buttons,
        flowSteps,
        scrollTopButtonCount: document.querySelectorAll(
          '[data-testid="mobile-role-scroll-top"]'
        ).length,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
        },
        documentScrollWidth: document.documentElement.scrollWidth,
        documentClientWidth: document.documentElement.clientWidth,
      }
    })

    assert(detailMetrics.shell, `${scenarioName} 详情页容器未渲染`)
    assert(detailMetrics.header, `${scenarioName} 详情页标题栏未渲染`)
    assert(detailMetrics.actionBar, `${scenarioName} 详情页动作栏未渲染`)
    assert.equal(
      detailMetrics.buttons.length,
      2,
      `${scenarioName} 详情页动作栏应保留返回列表和唯一处理入口: ${JSON.stringify(detailMetrics)}`
    )
    assert.deepEqual(
      detailMetrics.buttons.map((button) => button.text),
      ['返回列表', '处理任务'],
      `${scenarioName} 详情页不应继续平铺全部写动作: ${JSON.stringify(detailMetrics)}`
    )
    assert.deepEqual(
      detailMetrics.flowSteps.map((step) => step.key),
      ['detail', 'process', 'result'],
      `${scenarioName} 详情页必须展示完整三步任务流程: ${JSON.stringify(detailMetrics)}`
    )
    assert(
      detailMetrics.flowSteps[0]?.current === 'step' &&
        detailMetrics.flowSteps[2]?.state === 'locked' &&
        detailMetrics.flowSteps[2]?.disabled &&
        detailMetrics.flowSteps.every((step) => step.height >= 44),
      `${scenarioName} 详情页步骤状态或触控尺寸异常: ${JSON.stringify(detailMetrics)}`
    )
    assert.equal(
      detailMetrics.inlineActionInputCount,
      0,
      `${scenarioName} 详情页不应残留内嵌处理表单: ${JSON.stringify(detailMetrics)}`
    )
    assert.equal(
      detailMetrics.scrollTopButtonCount,
      0,
      `${scenarioName} 详情页不应显示回到顶部按钮: ${JSON.stringify(detailMetrics)}`
    )
    assert(
      detailMetrics.documentScrollWidth <=
        detailMetrics.documentClientWidth + 1,
      `${scenarioName} 详情页出现横向溢出: ${JSON.stringify(detailMetrics)}`
    )
    assert(
      Math.abs(detailMetrics.actionBar.bottom - detailMetrics.shell.bottom) <=
        1.5,
      `${scenarioName} 详情页动作栏未贴住容器底部: ${JSON.stringify(detailMetrics)}`
    )
    detailMetrics.buttons.forEach((button) => {
      assert(
        button.width >= 120 && button.height >= 48,
        `${scenarioName} 详情页主动作点击区不稳定: ${JSON.stringify(detailMetrics)}`
      )
    })
    assert.equal(
      detailMetrics.actionGuidanceCount,
      0,
      `${scenarioName} 本岗位可处理任务不应显示不可代办提示: ${JSON.stringify(detailMetrics)}`
    )

    await page.getByRole('button', { name: '处理任务', exact: true }).click()
    const actionScreen = page.getByTestId('mobile-task-action-screen')
    await actionScreen.waitFor({ state: 'visible', timeout: 10_000 })
    await expectText(page, '选择处理方式')
    const actionLabels = (
      await actionScreen.locator('label[data-action-key]').allTextContents()
    ).map((label) => label.replace(/\s+/g, ' ').trim())
    assert(
      actionLabels.includes('完成') && actionLabels.includes('阻塞'),
      `${scenarioName} 独立处理页没有展示后端授权的完成和阻塞动作: ${JSON.stringify({ actionLabels, screenText: (await actionScreen.innerText()).replace(/\s+/g, ' ').trim() })}`
    )
    const doneRadio = actionScreen.getByRole('radio', {
      name: '完成',
      exact: true,
    })
    const blockedRadio = actionScreen.getByRole('radio', {
      name: '阻塞',
      exact: true,
    })
    assert.equal(
      await doneRadio.count(),
      1,
      `${scenarioName} 独立处理页应有且仅有一个完成动作`
    )
    assert.equal(
      await blockedRadio.count(),
      1,
      `${scenarioName} 独立处理页应有且仅有一个阻塞动作`
    )
    assert.equal(
      await doneRadio.isChecked(),
      true,
      `${scenarioName} 进入处理页后应选中推荐的完成动作`
    )
    assert.equal(
      await actionScreen
        .getByTestId('mobile-task-action-options')
        .locator('button[aria-pressed]')
        .count(),
      0,
      `${scenarioName} 处理方式必须是单选项，不能继续伪装成命令按钮`
    )
    assert.equal(
      await actionScreen
        .getByRole('button', { name: '完成', exact: true })
        .count(),
      0,
      `${scenarioName} 完成动作不能渲染成单击即执行的按钮`
    )
    await doneRadio.focus()
    await doneRadio.press('ArrowRight')
    assert.equal(
      await blockedRadio.isChecked(),
      true,
      `${scenarioName} 多动作选择应支持原生方向键切换`
    )
    await doneRadio.check()
    await page.getByRole('button', { name: '确认完成' }).click()
    const completionFeedbackInput = page.getByLabel('完成反馈')
    assert.equal(
      await page.getByLabel('现场证据').count(),
      0,
      `${scenarioName} 处理页不应继续显示自由文本现场证据`
    )
    const feedbackError = '完成反馈为必填项'
    await expectText(page, feedbackError)
    assert.equal(
      await completionFeedbackInput.evaluate(
        (node) => document.activeElement === node
      ),
      true,
      `${scenarioName} 完成反馈缺失时应聚焦首个错误字段`
    )
    const draftFeedback = '已完成核对并交接下一岗位'
    await page.evaluate(() => {
      window.__styleL1OriginalHistoryReplaceState =
        window.history.replaceState.bind(window.history)
      window.__styleL1HistoryReplaceStateCount = 0
      window.history.replaceState = (...args) => {
        window.__styleL1HistoryReplaceStateCount += 1
        return window.__styleL1OriginalHistoryReplaceState(...args)
      }
    })
    await completionFeedbackInput.pressSequentially(draftFeedback)
    await page.waitForFunction(
      (expectedFeedback) =>
        window.history.state?.mobileRoleTasksReason === expectedFeedback,
      draftFeedback,
      { timeout: 3_000 }
    )
    const draftHistoryWrites = await page.evaluate(
      () => window.__styleL1HistoryReplaceStateCount
    )
    assert(
      draftHistoryWrites <= 3,
      `${scenarioName} 草稿输入不应逐字同步写入浏览器历史: ${draftHistoryWrites}`
    )
    const finalDraftFeedback = `${draftFeedback}｜反馈尾字已保留`
    await completionFeedbackInput.pressSequentially('｜反馈尾字已保留')
    await page.goBack({ waitUntil: 'domcontentloaded' })
    await page
      .getByTestId('mobile-task-detail-screen')
      .waitFor({ state: 'visible', timeout: 10_000 })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page
      .getByTestId('mobile-task-detail-screen')
      .waitFor({ state: 'visible', timeout: 10_000 })
    await page.goForward({ waitUntil: 'domcontentloaded' })
    await page
      .getByTestId('mobile-task-action-screen')
      .waitFor({ state: 'visible', timeout: 10_000 })
    assert.equal(
      await page.getByLabel('完成反馈').inputValue(),
      finalDraftFeedback,
      `${scenarioName} 系统返回、刷新详情再前进后应恢复完成反馈草稿`
    )
    assert.equal(
      await page.getByLabel('现场证据').count(),
      0,
      `${scenarioName} 历史恢复后不能重新出现已移除的证据输入`
    )
    assert(
      !(await page.getByText(feedbackError, { exact: true }).count()),
      `${scenarioName} 补齐完成反馈后应清除字段错误`
    )
    await assertThemeReadable(page, {
      scenarioName,
      selector: '[data-testid="mobile-task-action-screen"]',
    })
    await assertThemeReadable(page, {
      scenarioName,
      selector: 'textarea[placeholder^="说明已完成什么"]',
    })
    await assertDarkThemeContrast(page, {
      scenarioName,
      selector: '[data-testid="mobile-task-action-screen"]',
      minRatio: 4.5,
    })
    const actionMetrics = await actionScreen.evaluate((screen) => {
      const actionChoices = Array.from(
        screen.querySelectorAll('label[data-action-key]')
      ).map((choice) => {
        const input = choice.querySelector('input[type="radio"]')
        const rect = choice.getBoundingClientRect()
        const style = window.getComputedStyle(choice)
        const inputStyle = input ? window.getComputedStyle(input) : null
        return {
          text: choice.textContent?.replace(/\s+/g, ' ').trim() || '',
          width: rect.width,
          height: rect.height,
          disabled: input?.disabled ?? true,
          selected: input?.checked ?? false,
          backgroundColor: style.backgroundColor,
          radioAppearance: inputStyle?.appearance || '',
          radioBorderRadius: inputStyle?.borderRadius || '',
        }
      })
      const optionsCard = screen.querySelector(
        '[data-testid="mobile-task-action-options"]'
      )
      const optionsHeading = optionsCard?.querySelector('h2')
      const cardRect = optionsCard?.getBoundingClientRect()
      const headingRect = optionsHeading?.getBoundingClientRect()
      const flowSteps = Array.from(
        screen.querySelectorAll(
          '[data-testid="mobile-task-flow-steps"] [data-step-key]'
        )
      ).map((step) => ({
        key: step.dataset.stepKey || '',
        state: step.dataset.state || '',
        current: step.getAttribute('aria-current') || '',
        disabled: step.disabled,
      }))
      return {
        actionChoices,
        cardContainsHeading: Boolean(
          cardRect &&
            headingRect &&
            headingRect.top >= cardRect.top - 1 &&
            headingRect.bottom <= cardRect.bottom + 1 &&
            headingRect.left >= cardRect.left - 1 &&
            headingRect.right <= cardRect.right + 1
        ),
        cardHasNoHorizontalOverflow: Boolean(
          optionsCard && optionsCard.scrollWidth <= optionsCard.clientWidth + 1
        ),
        flowSteps,
        documentScrollWidth: document.documentElement.scrollWidth,
        documentClientWidth: document.documentElement.clientWidth,
      }
    })
    assert(
      actionMetrics.actionChoices.some(
        (choice) => choice.text === '完成' && !choice.disabled
      ) &&
        actionMetrics.actionChoices.some(
          (choice) => choice.text === '阻塞' && !choice.disabled
        ) &&
        actionMetrics.actionChoices.every(
          (choice) => choice.width >= 120 && choice.height >= 48
        ) &&
        actionMetrics.actionChoices.every(
          (choice) =>
            choice.radioAppearance === 'none' &&
            Number.parseFloat(choice.radioBorderRadius) >= 10
        ) &&
        actionMetrics.actionChoices.find((choice) => choice.selected)
          ?.backgroundColor !==
          actionMetrics.actionChoices.find((choice) => !choice.selected)
            ?.backgroundColor &&
        actionMetrics.cardContainsHeading &&
        actionMetrics.cardHasNoHorizontalOverflow &&
        actionMetrics.flowSteps.find((step) => step.key === 'process')
          ?.current === 'step' &&
        actionMetrics.flowSteps.find((step) => step.key === 'result')?.state ===
          'locked' &&
        actionMetrics.documentScrollWidth <=
          actionMetrics.documentClientWidth + 1,
      `${scenarioName} 独立处理页动作或布局异常: ${JSON.stringify(actionMetrics)}`
    )
    await actionScreen.screenshot({
      path: path.join(outputDir, `${scenarioName}-multi-action.png`),
    })
    await page.getByLabel('返回任务详情').click()
    await page
      .getByRole('button', { name: '处理任务', exact: true })
      .waitFor({ state: 'visible', timeout: 10_000 })
    await page.getByLabel('返回任务列表').click()
    await page.waitForFunction(() => {
      const heading = document.querySelector('.mobile-role-tasks-page h1')
      return heading?.textContent?.trim() === '待办'
    })

    await gotoScenarioPath(page, '/m/boss/tasks', {
      waitUntil: 'domcontentloaded',
    })
    await page.getByTestId('mobile-role-nav-messages').click()
    await page.waitForFunction(() => {
      const heading = document.querySelector('.mobile-role-tasks-page h1')
      return heading?.textContent?.trim() === '提醒'
    })
    await expectText(page, '暗色任务验证')
    await page
      .getByRole('button', { name: /暗色任务验证/ })
      .first()
      .click()
    await page
      .locator('.mobile-role-tasks-page--detail')
      .waitFor({ state: 'visible', timeout: 10_000 })
    await page
      .getByRole('button', { name: '处理任务', exact: true })
      .waitFor({ state: 'visible', timeout: 10_000 })
    await assertMobileTaskVisibleTextNoTechnicalFields(page, {
      scenarioName,
      scope: '跨岗位详情',
    })

    const crossRoleDetailMetrics = await page.evaluate(() => {
      const guidance = document.querySelector(
        '[data-testid="mobile-role-action-guidance"]'
      )
      return {
        guidanceText: guidance?.textContent?.replace(/\s+/g, ' ').trim() || '',
        documentScrollWidth: document.documentElement.scrollWidth,
        documentClientWidth: document.documentElement.clientWidth,
      }
    })
    assert.equal(
      crossRoleDetailMetrics.guidanceText,
      '',
      `${scenarioName} 后端已授权的账号不应被移动端路径角色二次拦截: ${JSON.stringify(crossRoleDetailMetrics)}`
    )
    await page.getByRole('button', { name: '处理任务', exact: true }).click()
    await page
      .getByTestId('mobile-task-action-screen')
      .waitFor({ state: 'visible', timeout: 10_000 })
    const crossRoleMetrics = await page.evaluate(() => ({
      actionChoices: Array.from(
        document.querySelectorAll(
          '[data-testid="mobile-task-action-screen"] label[data-action-key]'
        )
      ).map((choice) => ({
        text: choice.textContent?.replace(/\s+/g, ' ').trim() || '',
        disabled: choice.querySelector('input[type="radio"]')?.disabled ?? true,
      })),
      documentScrollWidth: document.documentElement.scrollWidth,
      documentClientWidth: document.documentElement.clientWidth,
    }))
    assert(
      crossRoleMetrics.actionChoices.some(
        (choice) => choice.text === '阻塞' && !choice.disabled
      ) &&
        crossRoleMetrics.actionChoices.some(
          (choice) => choice.text === '完成' && !choice.disabled
        ) &&
        crossRoleMetrics.actionChoices.some(
          (choice) => choice.text === '退回' && !choice.disabled
        ) &&
        crossRoleMetrics.actionChoices.some(
          (choice) => choice.text === '催办' && !choice.disabled
        ),
      `${scenarioName} 跨岗位处理页动作必须与后端授权投影一致: ${JSON.stringify(crossRoleMetrics)}`
    )
    assert(
      crossRoleMetrics.documentScrollWidth <=
        crossRoleMetrics.documentClientWidth + 1,
      `${scenarioName} 路径切换后任务详情造成横向溢出: ${JSON.stringify(crossRoleMetrics)}`
    )
    await page.getByLabel('完成反馈').fill('暗色任务已完成并核对')
    await page.getByRole('button', { name: '确认完成', exact: true }).click()
    const receiptScreen = page.getByTestId('mobile-task-receipt-screen')
    await receiptScreen.waitFor({ state: 'visible', timeout: 10_000 })
    await expectText(page, '任务办理已确认')
    const receiptMetrics = await receiptScreen.evaluate((screen) => {
      const steps = Array.from(
        screen.querySelectorAll(
          '[data-testid="mobile-task-flow-steps"] [data-step-key]'
        )
      ).map((step) => ({
        key: step.dataset.stepKey || '',
        current: step.getAttribute('aria-current') || '',
      }))
      const actionBar = screen.querySelector('.mobile-role-action-bar')
      const screenRect = screen.getBoundingClientRect()
      const actionBarRect = actionBar?.getBoundingClientRect()
      return {
        steps,
        screenBottom: screenRect.bottom,
        actionBarBottom: actionBarRect?.bottom || 0,
        text: screen.textContent?.replace(/\s+/g, ' ').trim() || '',
        documentScrollWidth: document.documentElement.scrollWidth,
        documentClientWidth: document.documentElement.clientWidth,
      }
    })
    assert(
      receiptMetrics.steps.find((step) => step.key === 'result')?.current ===
        'step' &&
        receiptMetrics.text.includes('完成') &&
        receiptMetrics.text.includes('暗色任务已完成并核对') &&
        !receiptMetrics.text.includes('历史处理线索') &&
        Math.abs(
          receiptMetrics.screenBottom - receiptMetrics.actionBarBottom
        ) <= 1.5 &&
        receiptMetrics.documentScrollWidth <=
          receiptMetrics.documentClientWidth + 1,
      `${scenarioName} 独立回执页的反馈或布局异常: ${JSON.stringify(receiptMetrics)}`
    )
    await receiptScreen
      .getByRole('button', { name: '返回列表', exact: true })
      .click()
    await page.waitForFunction(() => {
      const heading = document.querySelector('.mobile-role-tasks-page h1')
      return heading?.textContent?.trim() === '提醒'
    })

    await gotoScenarioPath(page, '/m/sales/tasks', {
      waitUntil: 'domcontentloaded',
    })
    await page.getByTestId('mobile-role-nav-todo').click()
    await page.getByTestId('mobile-role-filter-overdue').click()
    await page.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="mobile-role-scroll"]')
          ?.getAttribute('aria-busy') === 'false',
      undefined,
      { timeout: 10_000 }
    )
    const deepTaskName = '稀疏超时任务 30'
    const deepTaskButton = page
      .locator('[data-mobile-task-id]')
      .filter({ hasText: deepTaskName })
      .first()
    let expansionCount = 0
    while (!(await deepTaskButton.isVisible().catch(() => false))) {
      expansionCount += 1
      assert(
        expansionCount <= 10,
        `${scenarioName} 未能通过分页找到深层任务 ${deepTaskName}`
      )
      const toggle = page.getByTestId('mobile-role-list-toggle-todo')
      await toggle.waitFor({ state: 'visible', timeout: 10_000 })
      await toggle.click()
      await page.waitForFunction(
        () =>
          document
            .querySelector('[data-testid="mobile-role-scroll"]')
            ?.getAttribute('aria-busy') === 'false',
        undefined,
        { timeout: 10_000 }
      )
    }
    assert(expansionCount > 0, `${scenarioName} 深分页恢复场景没有触发列表扩展`)
    await deepTaskButton.scrollIntoViewIfNeeded()
    const deepTaskID = await deepTaskButton.getAttribute('data-mobile-task-id')
    const deepListScrollTop = await page.evaluate(
      () =>
        document.querySelector('.mobile-role-tasks-page__scroll')?.scrollTop ||
        0
    )
    assert(
      deepListScrollTop > 0,
      `${scenarioName} 深分页任务未形成可恢复的滚动位置`
    )
    await deepTaskButton.click()
    const deepDetail = page.getByTestId('mobile-task-detail-screen')
    await deepDetail.waitFor({ state: 'visible', timeout: 10_000 })
    await deepDetail
      .getByRole('heading', { name: deepTaskName, exact: true })
      .waitFor({ state: 'visible', timeout: 10_000 })
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page
      .getByTestId('mobile-task-detail-screen')
      .waitFor({ state: 'visible', timeout: 20_000 })
    await page
      .getByRole('heading', { name: deepTaskName, exact: true })
      .waitFor({ state: 'visible', timeout: 20_000 })
    const restoredHistory = await page.evaluate(() => ({
      screen: window.history.state?.mobileRoleTasksScreen || '',
      taskID: String(window.history.state?.mobileRoleTasksTaskID || ''),
      visibleTodoLimit: Number(
        window.history.state?.mobileRoleTasksListLimits?.todo || 0
      ),
      loadedRiskCount: Number(
        window.history.state?.mobileRoleTasksLoadedCountsByView?.risk || 0
      ),
      activeFilter: window.history.state?.mobileRoleTasksFilter || '',
    }))
    assert(
      restoredHistory.screen === 'detail' &&
        restoredHistory.taskID === String(deepTaskID) &&
        restoredHistory.visibleTodoLimit >= 24 &&
        restoredHistory.loadedRiskCount >= 150 &&
        restoredHistory.activeFilter === 'overdue',
      `${scenarioName} 稀疏筛选深分页详情刷新后没有恢复任务、服务端批次与筛选: ${JSON.stringify(restoredHistory)}`
    )
    await page.getByLabel('返回任务列表').click()
    await page.getByTestId('mobile-role-bottom-nav').waitFor({
      state: 'visible',
      timeout: 10_000,
    })
    await page.waitForFunction(
      ({ expectedScrollTop, taskID }) => {
        const main = document.querySelector('.mobile-role-tasks-page__scroll')
        const focusedTask = document.activeElement?.closest?.(
          '[data-mobile-task-id]'
        )
        return (
          Math.abs((main?.scrollTop || 0) - expectedScrollTop) <= 2 &&
          focusedTask?.getAttribute('data-mobile-task-id') === taskID
        )
      },
      { expectedScrollTop: deepListScrollTop, taskID: String(deepTaskID) },
      { timeout: 10_000 }
    )

    let failureIssued = false
    let refreshListCalls = 0
    const deterministicFailureRoute = async (route) => {
      const requestBody = route.request().postDataJSON?.() || {}
      if (
        requestBody.method === 'complete_task_action' &&
        Number(requestBody.params?.task_id) === Number(deepTaskID) &&
        !failureIssued
      ) {
        failureIssued = true
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: requestBody.id,
            result: {
              code: 40010,
              message: '模拟确定失败',
            },
          }),
        })
        return
      }
      if (failureIssued && requestBody.method === 'list_role_tasks') {
        refreshListCalls += 1
      }
      await route.fallback()
    }
    await page.route('**/rpc/workflow', deterministicFailureRoute)
    try {
      await deepTaskButton.click()
      await page.getByRole('button', { name: '处理任务', exact: true }).click()
      const recoveryActionScreen = page.getByTestId('mobile-task-action-screen')
      await recoveryActionScreen.waitFor({
        state: 'visible',
        timeout: 10_000,
      })
      await recoveryActionScreen
        .getByLabel('完成反馈')
        .fill('深页任务已完成并核对')
      await recoveryActionScreen
        .getByRole('button', { name: '确认完成', exact: true })
        .click()
      const failedReceipt = page.getByTestId('mobile-task-receipt-screen')
      await failedReceipt.waitFor({ state: 'visible', timeout: 10_000 })
      await expectText(page, '本次操作未完成')
      try {
        await failedReceipt
          .getByRole('button', { name: '重新确认结果', exact: true })
          .waitFor({ state: 'visible', timeout: 10_000 })
      } catch (error) {
        const recoveryMetrics = await failedReceipt.evaluate((screen) => ({
          buttons: Array.from(screen.querySelectorAll('button')).map(
            (button) => button.textContent?.replace(/\s+/g, ' ').trim() || ''
          ),
          historyState: window.history.state,
          text: screen.textContent?.replace(/\s+/g, ' ').trim() || '',
        }))
        throw new Error(
          `${scenarioName} 深分页失败回执未恢复重试入口: ${JSON.stringify(recoveryMetrics)}`,
          { cause: error }
        )
      }
      assert.equal(
        refreshListCalls,
        0,
        `${scenarioName} 确定失败后应保留深分页缓存，不应重扫任务队列`
      )
      await failedReceipt
        .getByRole('button', { name: '查看任务', exact: true })
        .waitFor({ state: 'visible', timeout: 10_000 })
    } finally {
      await page.unroute('**/rpc/workflow', deterministicFailureRoute)
    }
    await page
      .getByRole('button', { name: '重新确认结果', exact: true })
      .click()
    await expectText(page, '任务办理已确认')
    const confirmedReceipt = page.getByTestId('mobile-task-receipt-screen')
    await confirmedReceipt
      .getByRole('button', { name: '查看任务', exact: true })
      .click()
    const confirmedDetail = page.getByTestId('mobile-task-detail-screen')
    await confirmedDetail.waitFor({ state: 'visible', timeout: 10_000 })
    await confirmedDetail
      .getByRole('heading', { name: deepTaskName, exact: true })
      .waitFor({ state: 'visible', timeout: 10_000 })
    assert.equal(
      await confirmedDetail
        .getByRole('button', { name: '处理任务', exact: true })
        .count(),
      0,
      `${scenarioName} 终态回执详情必须只读，不能重新开放处理动作`
    )
    await expectText(page, '本次办理已经结束，当前按可信结果回执只读展示。')
    await confirmedDetail.locator('[data-step-key="result"]').click()
    await page
      .getByTestId('mobile-task-receipt-screen')
      .waitFor({ state: 'visible', timeout: 10_000 })
    await page
      .getByTestId('mobile-task-receipt-screen')
      .getByRole('button', { name: '返回列表', exact: true })
      .click()
    await page.getByTestId('mobile-role-bottom-nav').waitFor({
      state: 'visible',
      timeout: 10_000,
    })
    await page.waitForFunction(
      ({ completedTaskID, minimumVisibleTasks }) => {
        const scroll = document.querySelector(
          '[data-testid="mobile-role-scroll"]'
        )
        const visibleTasks = Array.from(
          document.querySelectorAll('[data-mobile-task-id]')
        ).filter((task) => task.getBoundingClientRect().height > 0)
        return (
          scroll?.getAttribute('aria-busy') === 'false' &&
          visibleTasks.length >= minimumVisibleTasks &&
          !visibleTasks.some(
            (task) =>
              task.getAttribute('data-mobile-task-id') === completedTaskID
          ) &&
          (scroll?.scrollTop || 0) > 0 &&
          document.activeElement?.getAttribute('data-testid') ===
            'mobile-role-list-heading'
        )
      },
      { completedTaskID: String(deepTaskID), minimumVisibleTasks: 24 },
      { timeout: 10_000 }
    )
  }

  async function assertMobileTaskInitialSkeleton(page, { scenarioName }) {
    const skeleton = page.getByTestId('mobile-role-task-skeleton')
    await skeleton.waitFor({ state: 'visible', timeout: 10_000 })

    const defaultMetrics = await page.evaluate(() => {
      const scroll = document.querySelector(
        '[data-testid="mobile-role-scroll"]'
      )
      const skeletonNode = document.querySelector(
        '[data-testid="mobile-role-task-skeleton"]'
      )
      const firstBlock = skeletonNode?.querySelector(
        '.mobile-role-skeleton__block'
      )
      const firstBlockStyle =
        firstBlock instanceof HTMLElement
          ? window.getComputedStyle(firstBlock)
          : null
      const list = skeletonNode?.querySelector('.mobile-role-skeleton__list')
      const listRect = list?.getBoundingClientRect()
      const skeletonRect = skeletonNode?.getBoundingClientRect()
      return {
        scrollAriaBusy: scroll?.getAttribute('aria-busy') || '',
        ariaHidden: skeletonNode?.getAttribute('aria-hidden') || '',
        rowCount: Number(skeletonNode?.dataset?.skeletonRowCount || 0),
        blockCount:
          skeletonNode?.querySelectorAll('.mobile-role-skeleton__block')
            .length || 0,
        descendantCount: skeletonNode?.querySelectorAll('*').length || 0,
        focusableCount:
          skeletonNode?.querySelectorAll('button,a,input,textarea,select')
            .length || 0,
        firstBlockStyle: {
          animationDuration: firstBlockStyle?.animationDuration || '',
          backgroundColor: firstBlockStyle?.backgroundColor || '',
          filter: firstBlockStyle?.filter || '',
          backdropFilter: firstBlockStyle?.backdropFilter || '',
        },
        skeletonRect: skeletonRect
          ? {
              width: skeletonRect.width,
              height: skeletonRect.height,
            }
          : null,
        list: listRect
          ? {
              width: listRect.width,
              height: listRect.height,
              clientWidth: list instanceof HTMLElement ? list.clientWidth : 0,
              scrollWidth: list instanceof HTMLElement ? list.scrollWidth : 0,
            }
          : null,
        documentScrollWidth: document.documentElement.scrollWidth,
        documentClientWidth: document.documentElement.clientWidth,
      }
    })

    assert.equal(
      defaultMetrics.scrollAriaBusy,
      'true',
      `${scenarioName} 首屏加载时滚动区应标记 aria-busy: ${JSON.stringify(defaultMetrics)}`
    )
    assert.equal(
      defaultMetrics.ariaHidden,
      'true',
      `${scenarioName} 骨架屏占位不应作为业务内容朗读: ${JSON.stringify(defaultMetrics)}`
    )
    assert.equal(
      defaultMetrics.rowCount,
      4,
      `${scenarioName} 首屏骨架任务行数量应固定为 4 行: ${JSON.stringify(defaultMetrics)}`
    )
    assert(
      defaultMetrics.blockCount > 0 && defaultMetrics.blockCount <= 40,
      `${scenarioName} 首屏骨架占位块数量应受控: ${JSON.stringify(defaultMetrics)}`
    )
    assert(
      defaultMetrics.descendantCount <= 72,
      `${scenarioName} 首屏骨架 DOM 节点过多: ${JSON.stringify(defaultMetrics)}`
    )
    assert.equal(
      defaultMetrics.focusableCount,
      0,
      `${scenarioName} 首屏骨架不应包含可聚焦假控件: ${JSON.stringify(defaultMetrics)}`
    )
    assert(
      defaultMetrics.skeletonRect &&
        defaultMetrics.skeletonRect.width >= 320 &&
        defaultMetrics.skeletonRect.height >= 420,
      `${scenarioName} 首屏骨架尺寸不足以稳定占位: ${JSON.stringify(defaultMetrics)}`
    )
    assert(
      defaultMetrics.list &&
        defaultMetrics.list.scrollWidth <= defaultMetrics.list.clientWidth + 1,
      `${scenarioName} 首屏骨架列表出现横向溢出: ${JSON.stringify(defaultMetrics)}`
    )
    assert(
      defaultMetrics.documentScrollWidth <=
        defaultMetrics.documentClientWidth + 1,
      `${scenarioName} 首屏骨架导致页面横向溢出: ${JSON.stringify(defaultMetrics)}`
    )
    assert(
      !isLightSurfaceColor(defaultMetrics.firstBlockStyle.backgroundColor) &&
        defaultMetrics.firstBlockStyle.filter === 'none' &&
        defaultMetrics.firstBlockStyle.backdropFilter === 'none',
      `${scenarioName} 暗色首屏骨架不应使用浅色块或高成本滤镜: ${JSON.stringify(defaultMetrics)}`
    )

    await page.emulateMedia({ reducedMotion: 'reduce' })
    const reducedMotionMetrics = await page.evaluate(() => {
      const block = document.querySelector('.mobile-role-skeleton__block')
      const style =
        block instanceof HTMLElement ? window.getComputedStyle(block) : null
      return {
        animationDuration: style?.animationDuration || '',
      }
    })
    await page.emulateMedia({ reducedMotion: 'no-preference' })
    assert(
      String(reducedMotionMetrics.animationDuration)
        .split(',')
        .every((part) => Number.parseFloat(part) <= 0.01),
      `${scenarioName} reduced-motion 下骨架动画未降级: ${JSON.stringify(reducedMotionMetrics)}`
    )

    await skeleton.waitFor({ state: 'detached', timeout: 10_000 })
    await expectText(page, '当前筛选下暂无任务')
    const afterLoadMetrics = await page.evaluate(() => ({
      skeletonCount: document.querySelectorAll(
        '[data-testid="mobile-role-task-skeleton"]'
      ).length,
      scrollAriaBusy:
        document
          .querySelector('[data-testid="mobile-role-scroll"]')
          ?.getAttribute('aria-busy') || '',
      listItemCount: document.querySelectorAll('.erp-mobile-list-item').length,
      documentScrollWidth: document.documentElement.scrollWidth,
      documentClientWidth: document.documentElement.clientWidth,
    }))
    assert.equal(
      afterLoadMetrics.skeletonCount,
      0,
      `${scenarioName} 首屏加载完成后不应残留骨架屏: ${JSON.stringify(afterLoadMetrics)}`
    )
    assert.equal(
      afterLoadMetrics.scrollAriaBusy,
      'false',
      `${scenarioName} 首屏加载完成后 aria-busy 应恢复: ${JSON.stringify(afterLoadMetrics)}`
    )
    assert.equal(
      afterLoadMetrics.listItemCount,
      0,
      `${scenarioName} 无数据加载完成后不应同时渲染真实任务行和骨架屏: ${JSON.stringify(afterLoadMetrics)}`
    )
    assert(
      afterLoadMetrics.documentScrollWidth <=
        afterLoadMetrics.documentClientWidth + 1,
      `${scenarioName} 首屏加载恢复态出现横向溢出: ${JSON.stringify(afterLoadMetrics)}`
    )
  }

  async function readMobileTaskLayoutMetrics(page) {
    return page.evaluate(() => {
      const shell = document.querySelector('.mobile-role-tasks-page')
      const scroll = document.querySelector(
        '[data-testid="mobile-role-scroll"]'
      )
      const nav = document.querySelector(
        '[data-testid="mobile-role-bottom-nav"]'
      )
      const logout = document.querySelector(
        '[data-testid="mobile-role-logout-button"]'
      )
      const shellRect = shell?.getBoundingClientRect()
      const scrollRect = scroll?.getBoundingClientRect()
      const navRect = nav?.getBoundingClientRect()
      const logoutRect = logout?.getBoundingClientRect()
      const navBeforeStyle =
        nav instanceof HTMLElement
          ? window.getComputedStyle(nav, '::before')
          : null
      const activeNavItem = nav?.querySelector(
        '.mobile-role-bottom-nav__item--active'
      )
      const activeNavItemStyle =
        activeNavItem instanceof HTMLElement
          ? window.getComputedStyle(activeNavItem)
          : null
      const sectionHeadings = Array.from(
        document.querySelectorAll('.mobile-role-tasks-page h2')
      ).map((heading) => heading.textContent?.trim() || '')

      return {
        heading:
          document
            .querySelector('.mobile-role-tasks-page h1')
            ?.textContent?.trim() || '',
        sectionHeadings,
        shell: shellRect
          ? {
              top: shellRect.top,
              bottom: shellRect.bottom,
              height: shellRect.height,
            }
          : null,
        scroll: scrollRect
          ? {
              top: scrollRect.top,
              bottom: scrollRect.bottom,
              height: scrollRect.height,
              scrollHeight: scroll?.scrollHeight || 0,
            }
          : null,
        nav: navRect
          ? {
              top: navRect.top,
              bottom: navRect.bottom,
              height: navRect.height,
            }
          : null,
        navButtonCount: nav?.querySelectorAll('button').length || 0,
        navClassName: nav?.className || '',
        activeNavText:
          activeNavItem?.textContent?.replace(/\s+/g, '').trim() || '',
        navThumbContent: navBeforeStyle?.content || '',
        navThumbTransitionDuration: navBeforeStyle?.transitionDuration || '',
        activeNavItemTransitionDuration:
          activeNavItemStyle?.transitionDuration || '',
        logoutVisible:
          Boolean(logout) &&
          Boolean(logoutRect) &&
          logoutRect.width > 0 &&
          logoutRect.height > 0,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
        },
        documentScrollWidth: document.documentElement.scrollWidth,
        documentClientWidth: document.documentElement.clientWidth,
        windowScrollY: window.scrollY,
      }
    })
  }

  async function readMobileTaskMessageTabMetrics(page) {
    return page.evaluate(() => {
      const tabs = document.querySelector('.mobile-role-message-tabs')
      const tabsRect = tabs?.getBoundingClientRect()
      const tabsStyle =
        tabs instanceof HTMLElement ? window.getComputedStyle(tabs) : null
      const tabsBeforeStyle =
        tabs instanceof HTMLElement
          ? window.getComputedStyle(tabs, '::before')
          : null
      const sectionHeadings = Array.from(
        document.querySelectorAll('.mobile-role-tasks-page h2')
      ).map((heading) => heading.textContent?.trim() || '')
      const activeTab = Array.from(
        document.querySelectorAll('.mobile-role-message-tabs__item')
      ).find((item) => item.getAttribute('aria-selected') === 'true')
      const activeTabStyle =
        activeTab instanceof HTMLElement
          ? window.getComputedStyle(activeTab)
          : null
      const cards = Array.from(
        document.querySelectorAll(
          '.mobile-role-message-card, .mobile-role-message-empty'
        )
      ).map((card) => {
        const rect = card.getBoundingClientRect()
        return {
          text: card.textContent?.replace(/\s+/g, ' ').trim() || '',
          width: rect.width,
          height: rect.height,
          clientWidth: card instanceof HTMLElement ? card.clientWidth : 0,
          scrollWidth: card instanceof HTMLElement ? card.scrollWidth : 0,
        }
      })

      return {
        activeTab: activeTab?.textContent?.replace(/\d+/g, '').trim() || '',
        tabsClassName: tabs?.className || '',
        sectionHeadings,
        tabsSticky: tabsStyle?.position === 'sticky',
        tabsThumbContent: tabsBeforeStyle?.content || '',
        tabsThumbTransform: tabsBeforeStyle?.transform || '',
        tabsThumbTransitionDuration: tabsBeforeStyle?.transitionDuration || '',
        activeTabTransitionDuration: activeTabStyle?.transitionDuration || '',
        tabs: tabsRect
          ? {
              width: tabsRect.width,
              height: tabsRect.height,
              clientWidth: tabs instanceof HTMLElement ? tabs.clientWidth : 0,
              scrollWidth: tabs instanceof HTMLElement ? tabs.scrollWidth : 0,
            }
          : null,
        cards,
        documentScrollWidth: document.documentElement.scrollWidth,
        documentClientWidth: document.documentElement.clientWidth,
      }
    })
  }

  async function assertMobileTaskFilterTabsSticky(page, { scenarioName }) {
    const scrollResult = await page.evaluate(() => {
      const scroll = document.querySelector(
        '[data-testid="mobile-role-scroll"]'
      )
      if (!(scroll instanceof HTMLElement)) return null
      const maxScrollTop = Math.max(
        0,
        scroll.scrollHeight - scroll.clientHeight
      )
      scroll.scrollTop = Math.min(640, maxScrollTop)
      return {
        maxScrollTop,
        scrollTop: scroll.scrollTop,
      }
    })
    assert(
      scrollResult && scrollResult.scrollTop > 0,
      `${scenarioName} 待办筛选 sticky 回归缺少可滚动长列表: ${JSON.stringify(scrollResult)}`
    )
    await page.waitForTimeout(80)

    const metrics = await page.evaluate(() => {
      const scroll = document.querySelector(
        '[data-testid="mobile-role-scroll"]'
      )
      const tabs = document.querySelector('.mobile-role-task-filters')
      const activeTab = Array.from(
        document.querySelectorAll('.mobile-role-task-filter')
      ).find((item) => item.getAttribute('aria-pressed') === 'true')
      const scrollRect = scroll?.getBoundingClientRect()
      const tabsRect = tabs?.getBoundingClientRect()
      const tabsStyle =
        tabs instanceof HTMLElement ? window.getComputedStyle(tabs) : null
      const tabsBeforeStyle =
        tabs instanceof HTMLElement
          ? window.getComputedStyle(tabs, '::before')
          : null
      const activeTabStyle =
        activeTab instanceof HTMLElement
          ? window.getComputedStyle(activeTab)
          : null
      return {
        activeLabel: activeTab?.textContent?.replace(/\s+/g, '').trim() || '',
        buttonCount: tabs?.querySelectorAll('button').length || 0,
        tabsClassName: tabs?.className || '',
        tabsSticky: tabsStyle?.position === 'sticky',
        tabsThumbContent: tabsBeforeStyle?.content || '',
        tabsThumbTransform: tabsBeforeStyle?.transform || '',
        tabsThumbTransitionDuration: tabsBeforeStyle?.transitionDuration || '',
        activeTabTransitionDuration: activeTabStyle?.transitionDuration || '',
        scroll: scrollRect
          ? {
              top: scrollRect.top,
              bottom: scrollRect.bottom,
              height: scrollRect.height,
              scrollTop: scroll instanceof HTMLElement ? scroll.scrollTop : 0,
            }
          : null,
        tabs: tabsRect
          ? {
              top: tabsRect.top,
              bottom: tabsRect.bottom,
              width: tabsRect.width,
              height: tabsRect.height,
              clientWidth: tabs instanceof HTMLElement ? tabs.clientWidth : 0,
              scrollWidth: tabs instanceof HTMLElement ? tabs.scrollWidth : 0,
            }
          : null,
        documentScrollWidth: document.documentElement.scrollWidth,
        documentClientWidth: document.documentElement.clientWidth,
      }
    })

    assert(
      metrics.tabs,
      `${scenarioName} 缺少待办筛选 sticky tab: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      metrics.buttonCount,
      4,
      `${scenarioName} 待办筛选 sticky tab 应保留四项: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.activeLabel.includes('全部'),
      `${scenarioName} 待办筛选 sticky tab 选中态错误: ${JSON.stringify(metrics)}`
    )
    assert(
      String(metrics.tabsClassName).includes('mobile-role-task-filters--all') &&
        metrics.tabsThumbContent !== 'none' &&
        metrics.tabsThumbContent !== 'normal' &&
        String(metrics.tabsThumbTransitionDuration)
          .split(',')
          .some((part) => Number.parseFloat(part) > 0) &&
        String(metrics.activeTabTransitionDuration)
          .split(',')
          .some((part) => Number.parseFloat(part) > 0),
      `${scenarioName} 待办筛选默认态缺少滑动选中态过渡: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.tabsSticky,
      `${scenarioName} 待办筛选 tab 未设置 sticky: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.scroll && Math.abs(metrics.tabs.top - metrics.scroll.top) <= 2,
      `${scenarioName} 待办筛选 tab 滚动后未贴住正文滚动区顶部: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.tabs.scrollWidth <= metrics.tabs.clientWidth + 1,
      `${scenarioName} 待办筛选 sticky tab 横向溢出: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.documentScrollWidth <= metrics.documentClientWidth + 1,
      `${scenarioName} 待办筛选 sticky tab 导致页面横向溢出: ${JSON.stringify(metrics)}`
    )

    await page.evaluate(() => {
      const scroll = document.querySelector(
        '[data-testid="mobile-role-scroll"]'
      )
      if (scroll instanceof HTMLElement) {
        scroll.scrollTop = 0
      }
    })
  }

  async function readMobileTaskVisibleListMetrics(page, itemSelector) {
    return page.evaluate((selector) => {
      const items = Array.from(document.querySelectorAll(selector)).map(
        (item) => {
          const rect = item.getBoundingClientRect()
          return {
            text: item.textContent?.replace(/\s+/g, ' ').trim() || '',
            width: rect.width,
            height: rect.height,
            clientWidth: item instanceof HTMLElement ? item.clientWidth : 0,
            scrollWidth: item instanceof HTMLElement ? item.scrollWidth : 0,
          }
        }
      )
      const toggle = document.querySelector('.mobile-role-list-control__button')
      const totalItemCount = Number(
        toggle?.dataset?.totalItemCount || items.length
      )
      return {
        itemCount: items.length,
        totalItemCount,
        items,
        toggleText: toggle?.textContent?.replace(/\s+/g, ' ').trim() || '',
        documentScrollWidth: document.documentElement.scrollWidth,
        documentClientWidth: document.documentElement.clientWidth,
      }
    }, itemSelector)
  }

  function assertMobileTaskBottomNavLayout(metrics, scenarioName) {
    assert(metrics.shell, `${scenarioName} 未找到岗位任务页容器`)
    assert(metrics.scroll, `${scenarioName} 未找到移动端正文滚动容器`)
    assert(metrics.nav, `${scenarioName} 未找到移动端底部导航`)
    assert.equal(
      metrics.navButtonCount,
      4,
      `${scenarioName} 底部导航应固定为四项: ${JSON.stringify(metrics)}`
    )
    assert(
      String(metrics.navClassName).includes('mobile-role-bottom-nav--') &&
        metrics.navThumbContent !== 'none' &&
        metrics.navThumbContent !== 'normal' &&
        String(metrics.navThumbTransitionDuration)
          .split(',')
          .some((part) => Number.parseFloat(part) > 0) &&
        String(metrics.activeNavItemTransitionDuration)
          .split(',')
          .some((part) => Number.parseFloat(part) > 0),
      `${scenarioName} 底部导航缺少平滑滑块选中态: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.shell.bottom <= metrics.viewport.height + 1,
      `${scenarioName} 任务页容器超出视口导致底部导航不固定: ${JSON.stringify(metrics)}`
    )
    assert(
      Math.abs(metrics.nav.bottom - metrics.shell.bottom) <= 1.5,
      `${scenarioName} 底部导航未贴住任务页容器底部: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.scroll.bottom <= metrics.nav.top + 1.5,
      `${scenarioName} 正文滚动区与底部导航发生覆盖: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.documentScrollWidth <= metrics.documentClientWidth + 1,
      `${scenarioName} 岗位任务页出现横向溢出: ${JSON.stringify(metrics)}`
    )
  }

  return {
    assertMobileTaskMainNavigation,
    assertMobileTaskInitialSkeleton,
    readVisibleMobileTaskListText,
    assertMobileTaskProgressSummary,
    assertMobileTaskPrimaryFilterNavigation,
    assertMobileTaskBossDoneList,
    assertMobileTaskFocusSummary,
    assertMobileMinePanelLayout,
    assertMobileTaskFilterSelected,
    assertMobileTaskListToggle,
    assertMobileTaskScrollTopControl,
    assertMobileTaskMessageTabsSwitch,
    assertMobileTaskDarkMessagesReadable,
    assertMobileTaskDarkDetailReadable,
    readMobileTaskLayoutMetrics,
    readMobileTaskMessageTabMetrics,
    assertMobileTaskFilterTabsSticky,
    readMobileTaskVisibleListMetrics,
    assertMobileTaskBottomNavLayout,
  }
}
