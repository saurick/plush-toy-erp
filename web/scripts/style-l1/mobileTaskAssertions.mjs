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
    })
    await assertMobileTaskScrollTopControl(page, { scenarioName })
    await assertMobileTaskFilterTabsSticky(page, { scenarioName })

    await page.getByTestId('mobile-role-nav-messages').click()
    await page.waitForFunction(() => {
      const heading = document.querySelector('.mobile-role-tasks-page h1')
      return heading?.textContent?.trim() === '消息'
    })
    const messageMetrics = await readMobileTaskLayoutMetrics(page)
    assertMobileTaskBottomNavLayout(messageMetrics, scenarioName)
    assert(
      messageMetrics.sectionHeadings.includes('预警') &&
        !messageMetrics.sectionHeadings.includes('任务提醒'),
      `${scenarioName} 消息分区默认应先显示预警且不把提醒压在预警列表后: ${JSON.stringify(messageMetrics)}`
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
    await assertMobileMineMetricButtonsVisible(page, { scenarioName })

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
    await assertMobileSummaryMetricsReadonly(page, { scenarioName })

    await page.getByTestId('mobile-role-filter-risk').click()
    let visibleText = await readVisibleMobileTaskListText(page)
    await assertMobileTaskFilterSelected(page, 'mobile-role-filter-risk', {
      scenarioName,
      label: '风险',
    })
    assert(
      visibleText.includes('暗色任务验证') &&
        !visibleText.includes('批量待办任务 1'),
      `${scenarioName} 点击“风险”后未进入风险筛选: ${visibleText}`
    )

    await page.getByTestId('mobile-role-nav-mine').click()
    await page.waitForFunction(() => {
      const heading = document.querySelector('.mobile-role-tasks-page h1')
      return heading?.textContent?.trim() === '我的'
    })
    await page.getByTestId('mobile-role-mine-metric-risk').click()
    await page.waitForFunction(() => {
      const heading = document.querySelector('.mobile-role-tasks-page h1')
      return heading?.textContent?.trim() === '待办'
    })
    visibleText = await readVisibleMobileTaskListText(page)
    await assertMobileTaskFilterSelected(page, 'mobile-role-filter-risk', {
      scenarioName,
      label: '我的/风险跳转后的风险',
    })
    assert(
      visibleText.includes('暗色任务验证') &&
        !visibleText.includes('批量待办任务 1'),
      `${scenarioName} 点击“我的/风险”后未进入风险筛选: ${visibleText}`
    )

    await page.getByTestId('mobile-role-nav-mine').click()
    await page.waitForFunction(() => {
      const heading = document.querySelector('.mobile-role-tasks-page h1')
      return heading?.textContent?.trim() === '我的'
    })
    await page.getByTestId('mobile-role-mine-metric-overdue').click()
    await page.waitForFunction(() => {
      const heading = document.querySelector('.mobile-role-tasks-page h1')
      return heading?.textContent?.trim() === '待办'
    })
    visibleText = await readVisibleMobileTaskListText(page)
    await assertMobileTaskFilterSelected(page, 'mobile-role-filter-overdue', {
      scenarioName,
      label: '我的/超时跳转后的超时',
    })
    assert(
      visibleText.includes('批量超时任务') &&
        !visibleText.includes('批量待办任务 1'),
      `${scenarioName} 点击“我的/超时”后未进入超时筛选: ${visibleText}`
    )

    await page.getByTestId('mobile-role-nav-mine').click()
    await page.waitForFunction(() => {
      const heading = document.querySelector('.mobile-role-tasks-page h1')
      return heading?.textContent?.trim() === '我的'
    })
    await page.getByTestId('mobile-role-mine-metric-done').click()
    await page.waitForFunction(() => {
      const heading = document.querySelector('.mobile-role-tasks-page h1')
      return heading?.textContent?.trim() === '已办'
    })
    visibleText = await readVisibleMobileTaskListText(page)
    assert(
      visibleText.includes('批量已办任务') &&
        !visibleText.includes('暂无已办任务'),
      `${scenarioName} 点击“我的/已办”后未进入已办列表: ${visibleText}`
    )

    await page.getByTestId('mobile-role-nav-todo').click()
    await page.waitForFunction(() => {
      const heading = document.querySelector('.mobile-role-tasks-page h1')
      return heading?.textContent?.trim() === '待办'
    })
  }

  async function assertMobileTaskBossDoneList(page, { scenarioName }) {
    await gotoScenarioPath(page, '/m/boss/tasks', {
      waitUntil: 'domcontentloaded',
    })
    await expectText(page, '待办')
    await page.getByTestId('mobile-role-nav-done').click()
    await page.waitForFunction(() => {
      const heading = document.querySelector('.mobile-role-tasks-page h1')
      return heading?.textContent?.trim() === '已办'
    })

    const visibleText = await readVisibleMobileTaskListText(page)
    assert(
      visibleText.includes('批量老板已办任务') &&
        !visibleText.includes('暂无已办任务'),
      `${scenarioName} 老板端已办列表未渲染造数任务: ${visibleText}`
    )
    await assertMobileTaskListToggle(page, {
      scenarioName: `${scenarioName} boss`,
      listKey: 'done',
      itemSelector: '.erp-mobile-list-item',
      collapsedMax: 10,
    })
  }

  async function assertMobileSummaryMetricsReadonly(page, { scenarioName }) {
    const expectedValueClassByTestID = {
      'mobile-role-metric-alerts': 'text-orange-500',
      'mobile-role-metric-overdue': 'text-red-500',
      'mobile-role-metric-due-soon': 'text-slate-600',
      'mobile-role-metric-risk': 'text-red-500',
    }
    const metrics = await page.evaluate(() =>
      [
        'mobile-role-metric-alerts',
        'mobile-role-metric-overdue',
        'mobile-role-metric-due-soon',
        'mobile-role-metric-risk',
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
          valueClassName: value?.className || '',
          valueColor: valueStyle?.color || '',
          labelColor: labelStyle?.color || '',
          text: node?.textContent?.replace(/\s+/g, ' ').trim() || '',
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
        `${scenarioName} 顶部统计应是只读摘要，不应继续作为按钮: ${JSON.stringify(metrics)}`
      )
      assert(
        String(item.className).includes('mobile-role-summary-metric'),
        `${scenarioName} 顶部统计缺少摘要样式: ${JSON.stringify(metrics)}`
      )
      assert.equal(
        item.ariaPressed,
        null,
        `${scenarioName} 顶部统计不应暴露选中态: ${JSON.stringify(metrics)}`
      )
      assert(
        item.scrollWidth <= item.clientWidth + 1,
        `${scenarioName} 顶部统计摘要出现横向溢出: ${JSON.stringify(metrics)}`
      )
      assert(
        !String(item.className).includes('mobile-role-summary-metric--'),
        `${scenarioName} 待办页顶部风险摘要不应套用进度摘要 tone class: ${JSON.stringify(metrics)}`
      )
      assert(
        String(item.valueClassName).includes(
          expectedValueClassByTestID[item.testID]
        ),
        `${scenarioName} 待办页顶部风险摘要丢失原始状态色 class: ${JSON.stringify(metrics)}`
      )
      if (item.testID !== 'mobile-role-metric-due-soon') {
        assert.notEqual(
          item.valueColor,
          item.labelColor,
          `${scenarioName} 风险/超时摘要数字不应退回中性标签色: ${JSON.stringify(metrics)}`
        )
      }
    })
  }

  async function assertMobileMineMetricButtonsVisible(page, { scenarioName }) {
    const expectedToneByTestID = {
      'mobile-role-mine-metric-todo': 'todo',
      'mobile-role-mine-metric-done': 'done',
      'mobile-role-mine-metric-overdue': 'overdue',
      'mobile-role-mine-metric-risk': 'risk',
    }
    const metrics = await page.evaluate(() =>
      [
        'mobile-role-mine-metric-todo',
        'mobile-role-mine-metric-done',
        'mobile-role-mine-metric-overdue',
        'mobile-role-mine-metric-risk',
      ].map((testID) => {
        const node = document.querySelector(`[data-testid="${testID}"]`)
        const style = node ? window.getComputedStyle(node) : null
        const beforeStyle = node
          ? window.getComputedStyle(node, '::before')
          : null
        const value = node?.querySelector(
          '.mobile-role-mine-metric-button__value'
        )
        const icon = node?.querySelector(
          '.mobile-role-mine-metric-button__head .anticon'
        )
        const valueStyle = value ? window.getComputedStyle(value) : null
        const iconStyle = icon ? window.getComputedStyle(icon) : null
        const rect = node?.getBoundingClientRect()
        return {
          testID,
          tagName: node?.tagName || '',
          className: node?.className || '',
          backgroundColor: style?.backgroundColor || '',
          borderColor: style?.borderColor || '',
          borderStyle: style?.borderStyle || '',
          borderWidth: style?.borderWidth || '',
          boxShadow: style?.boxShadow || '',
          cursor: style?.cursor || '',
          beforeBackgroundColor: beforeStyle?.backgroundColor || '',
          beforeWidth: beforeStyle?.width || '',
          valueColor: valueStyle?.color || '',
          iconColor: iconStyle?.color || '',
          ariaLabel: node?.getAttribute('aria-label') || '',
          headText: String(
            node?.querySelector('.mobile-role-mine-metric-button__head')
              ?.textContent || ''
          )
            .replace(/\s+/g, ' ')
            .trim(),
          iconCount:
            node?.querySelectorAll(
              '.mobile-role-mine-metric-button__head .anticon'
            ).length || 0,
          hintText: String(
            node?.querySelector('.mobile-role-mine-metric-button__hint')
              ?.textContent || ''
          )
            .replace(/\s+/g, ' ')
            .trim(),
          width: rect?.width || 0,
          height: rect?.height || 0,
          scrollWidth: node?.scrollWidth || 0,
          clientWidth: node?.clientWidth || 0,
        }
      })
    )

    metrics.forEach((item) => {
      const borderWidth = Number.parseFloat(item.borderWidth) || 0
      assert.equal(
        item.tagName,
        'BUTTON',
        `${scenarioName} 我的统计入口应保持可点击按钮: ${JSON.stringify(metrics)}`
      )
      assert(
        item.width >= 64 && item.height >= 58,
        `${scenarioName} 我的统计入口点击区域过小: ${JSON.stringify(metrics)}`
      )
      assert(
        item.borderStyle !== 'none' &&
          borderWidth >= 1 &&
          !isTransparentColor(item.borderColor),
        `${scenarioName} 我的统计入口缺少可见边框: ${JSON.stringify(metrics)}`
      )
      assert(
        !isTransparentColor(item.backgroundColor),
        `${scenarioName} 我的统计入口背景透明，边界会融入外层: ${JSON.stringify(metrics)}`
      )
      assert(
        item.boxShadow && item.boxShadow !== 'none',
        `${scenarioName} 我的统计入口缺少外层阴影分离: ${JSON.stringify(metrics)}`
      )
      assert.equal(
        item.cursor,
        'pointer',
        `${scenarioName} 我的统计入口应明确暴露可点击光标: ${JSON.stringify(metrics)}`
      )
      assert(
        item.ariaLabel.startsWith('查看') &&
          item.ariaLabel.endsWith('任务') &&
          item.hintText === '查看任务' &&
          item.iconCount === 1 &&
          item.headText.length > 0,
        `${scenarioName} 我的统计入口缺少动作提示或进入箭头: ${JSON.stringify(metrics)}`
      )
      assert(
        item.scrollWidth <= item.clientWidth + 1,
        `${scenarioName} 我的统计入口出现横向溢出: ${JSON.stringify(metrics)}`
      )
      assert(
        String(item.className).includes(
          `mobile-role-mine-metric-button--${expectedToneByTestID[item.testID]}`
        ),
        `${scenarioName} 我的统计入口缺少语义色 tone class: ${JSON.stringify(metrics)}`
      )
      assert(
        Number.parseFloat(item.beforeWidth) >= 3 &&
          !isTransparentColor(item.beforeBackgroundColor),
        `${scenarioName} 我的统计入口缺少左侧语义色条: ${JSON.stringify(metrics)}`
      )
      assert(
        item.valueColor === item.beforeBackgroundColor &&
          item.iconColor === item.beforeBackgroundColor,
        `${scenarioName} 我的统计入口数字和箭头应跟随语义色条: ${JSON.stringify(metrics)}`
      )
    })
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
    { scenarioName, listKey, itemSelector, collapsedMax }
  ) {
    const toggle = page.getByTestId(`mobile-role-list-toggle-${listKey}`)
    await toggle.waitFor({ state: 'visible', timeout: 10_000 })
    const toggleCount = await toggle.count()
    assert.equal(
      toggleCount,
      1,
      `${scenarioName} ${listKey} 长列表应出现唯一展开控制，实际 ${toggleCount}`
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
        collapsedMetrics.toggleText.includes('剩余'),
      `${scenarioName} ${listKey} 分批展开控制缺少批次数或剩余提示: ${JSON.stringify(collapsedMetrics)}`
    )
    assert(
      collapsedMetrics.documentScrollWidth <=
        collapsedMetrics.documentClientWidth + 1,
      `${scenarioName} ${listKey} 默认收起态横向溢出: ${JSON.stringify(collapsedMetrics)}`
    )

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
        expandedMetrics.toggleText.includes('再显示'),
      `${scenarioName} ${listKey} 未到最后一批时应继续显示分批展开入口: ${JSON.stringify(expandedMetrics)}`
    )

    let finalMetrics = expandedMetrics
    for (
      let index = 0;
      index < 20 && !finalMetrics.toggleText.includes('收起');
      index += 1
    ) {
      await toggle.click()
      finalMetrics = await readMobileTaskVisibleListMetrics(page, itemSelector)
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
      `${scenarioName} 消息 tab 缺少平滑选中态过渡: ${JSON.stringify(noticeMetrics)}`
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
      `${scenarioName} 消息二级 tab 盒模型异常: ${JSON.stringify(noticeMetrics)}`
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
      `${scenarioName} 消息可读性断言必须在暗色模式执行: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.sections.length === 1 && metrics.sections[0].heading === '预警',
      `${scenarioName} 消息页默认应只渲染当前预警区块: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.cards.length >= 1,
      `${scenarioName} 消息页缺少可验证卡片或空态: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.cards.some((card) => card.isWarning),
      `${scenarioName} 消息页缺少预警卡片: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.documentScrollWidth <= metrics.documentClientWidth + 1,
      `${scenarioName} 消息页出现横向溢出: ${JSON.stringify(metrics)}`
    )

    metrics.sections.forEach((section) => {
      assert(
        !isLightSurfaceColor(section.backgroundColor),
        `${scenarioName} 消息分区仍是浅色背景: ${JSON.stringify(section)}`
      )
      assertReadableOnBackground(
        section.headingColor,
        section.backgroundColor,
        `${scenarioName} 消息分区标题对比度不足`
      )
    })

    metrics.cards.forEach((card) => {
      assert(
        card.rect && card.rect.width > 280 && card.rect.height >= 40,
        `${scenarioName} 消息卡片尺寸异常: ${JSON.stringify(card)}`
      )
      assert(
        !isLightSurfaceColor(card.backgroundColor),
        `${scenarioName} 消息卡片仍是浅色背景: ${JSON.stringify(card)}`
      )
      assert(
        isDarkNeutralBorderColor(card.borderColor) ||
          isWarningBorderColor(card.borderColor),
        `${scenarioName} 消息卡片边框不够清楚: ${JSON.stringify(card)}`
      )
      card.textNodes.forEach((node) => {
        if (!node.text) return
        assertReadableOnBackground(
          node.color,
          card.backgroundColor,
          `${scenarioName} 消息卡片文字对比度不足`
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
    await expectText(page, '现场留痕')
    await expectText(page, '可选')
    await expectText(page, '最近动态')
    await page
      .getByTestId('mobile-role-evidence-input')
      .fill('STYLE-L1-EVIDENCE-001\nhttps://example.invalid/style-l1')
    await page.getByRole('button', { name: '完成' }).click()
    await expectText(page, '完成反馈')
    await expectText(page, '必填')
    await expectText(page, '完成说明（可选）')
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
      selector: '[data-testid="mobile-role-evidence-input"]',
    })
    await assertDarkThemeContrast(page, {
      scenarioName,
      selector: '.mobile-role-tasks-page--detail',
      minRatio: 4.5,
    })

    const metrics = await page.evaluate(() => {
      const shell = document.querySelector('.mobile-role-tasks-page--detail')
      const header = document.querySelector('.mobile-role-detail-header')
      const actionBar = document.querySelector('.mobile-role-action-bar')
      const shellRect = shell?.getBoundingClientRect()
      const headerRect = header?.getBoundingClientRect()
      const actionBarRect = actionBar?.getBoundingClientRect()
      const detailButtons = Array.from(
        shell?.querySelectorAll('button') || []
      ).map((button) => button.textContent?.replace(/\s+/g, ' ').trim() || '')
      const detailMeta = Array.from(
        shell?.querySelectorAll('.mobile-role-detail-meta') || []
      ).map((node) => node.textContent?.replace(/\s+/g, ' ').trim() || '')
      const relatedItem = shell?.querySelector(
        '.mobile-role-detail-related-item'
      )
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
        detailButtons,
        detailMeta,
        relatedItem: relatedItem
          ? {
              text: relatedItem.textContent?.replace(/\s+/g, ' ').trim() || '',
              interactiveCount: relatedItem.querySelectorAll('button,a').length,
              scrollWidth: relatedItem.scrollWidth,
              clientWidth: relatedItem.clientWidth,
            }
          : null,
        actionGuidanceCount: document.querySelectorAll(
          '[data-testid="mobile-role-action-guidance"]'
        ).length,
        buttons,
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

    assert(metrics.shell, `${scenarioName} 详情页容器未渲染`)
    assert(metrics.header, `${scenarioName} 详情页标题栏未渲染`)
    assert(metrics.actionBar, `${scenarioName} 详情页动作栏未渲染`)
    assert.equal(
      metrics.buttons.length,
      4,
      `${scenarioName} 详情页动作栏应只保留已接后端合同的主按钮: ${JSON.stringify(metrics)}`
    )
    assert.deepEqual(
      metrics.buttons.map((button) => button.text),
      ['阻塞', '完成', '催办', '退回当前任务'],
      `${scenarioName} 详情页动作栏不应保留 unsupported processing 按钮: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      metrics.scrollTopButtonCount,
      0,
      `${scenarioName} 详情页不应显示回到顶部按钮: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.documentScrollWidth <= metrics.documentClientWidth + 1,
      `${scenarioName} 详情页出现横向溢出: ${JSON.stringify(metrics)}`
    )
    assert(
      Math.abs(metrics.actionBar.bottom - metrics.shell.bottom) <= 1.5,
      `${scenarioName} 详情页动作栏未贴住容器底部: ${JSON.stringify(metrics)}`
    )
    metrics.buttons.forEach((button) => {
      assert(
        button.width >= 72 && button.height >= 52,
        `${scenarioName} 详情页动作按钮尺寸不稳定: ${JSON.stringify(metrics)}`
      )
    })
    assert.equal(
      metrics.actionGuidanceCount,
      0,
      `${scenarioName} 本岗位可处理任务不应显示不可代办提示: ${JSON.stringify(metrics)}`
    )
    assert(
      !metrics.detailButtons.some((text) => /编辑查看详情|查看全部/.test(text)),
      `${scenarioName} 详情页仍存在没有真实动作的查看按钮: ${JSON.stringify(metrics)}`
    )
    assert.deepEqual(
      metrics.detailMeta,
      ['摘要', '来源', '最近一条'],
      `${scenarioName} 详情页应将无动作入口降级为只读元信息: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.relatedItem &&
        metrics.relatedItem.interactiveCount === 0 &&
        !metrics.relatedItem.text.includes('>') &&
        metrics.relatedItem.scrollWidth <= metrics.relatedItem.clientWidth + 1,
      `${scenarioName} 关联来源没有真实跳转时不应呈现可点击箭头或溢出: ${JSON.stringify(metrics)}`
    )

    await page.getByRole('button', { name: /阻塞/u }).click()
    const reasonInput = page.getByTestId('mobile-role-detail-reason-input')
    await reasonInput.waitFor({ state: 'visible', timeout: 10_000 })
    const reasonPlaceholder = await reasonInput.getAttribute('placeholder')
    assert(
      reasonPlaceholder &&
        reasonPlaceholder.includes('原因') &&
        !reasonPlaceholder.includes('至少 5 个字'),
      `${scenarioName} 原因输入提示应只表达必填语义: ${reasonPlaceholder || '-'}`
    )
    await page.getByRole('button', { name: '提交' }).click()
    await reasonInput.waitFor({ state: 'visible', timeout: 10_000 })
    await page.getByRole('button', { name: /收起/u }).click()

    await gotoScenarioPath(page, '/m/boss/tasks', {
      waitUntil: 'domcontentloaded',
    })
    await page.getByTestId('mobile-role-nav-messages').click()
    await page.waitForFunction(() => {
      const heading = document.querySelector('.mobile-role-tasks-page h1')
      return heading?.textContent?.trim() === '消息'
    })
    await expectText(page, '暗色任务验证')
    await page
      .getByRole('button', { name: /暗色任务验证/ })
      .first()
      .click()
    await page
      .locator('.mobile-role-tasks-page--detail')
      .waitFor({ state: 'visible', timeout: 10_000 })
    await page.waitForFunction(() => {
      const buttons = Array.from(
        document.querySelectorAll('.mobile-role-action-bar__button')
      )
      return (
        buttons.length === 4 &&
        buttons.every((button) =>
          button instanceof HTMLButtonElement ? !button.disabled : false
        )
      )
    })
    await assertMobileTaskVisibleTextNoTechnicalFields(page, {
      scenarioName,
      scope: '跨岗位详情',
    })

    const crossRoleMetrics = await page.evaluate(() => {
      const guidance = document.querySelector(
        '[data-testid="mobile-role-action-guidance"]'
      )
      const guidanceRect = guidance?.getBoundingClientRect()
      const buttons = Array.from(
        document.querySelectorAll('.mobile-role-action-bar__button')
      ).map((button) => ({
        text: button.textContent?.replace(/\s+/g, ' ').trim() || '',
        disabled: button.disabled,
      }))
      return {
        guidanceText: guidance?.textContent?.replace(/\s+/g, ' ').trim() || '',
        guidanceRect: guidanceRect
          ? {
              width: guidanceRect.width,
              height: guidanceRect.height,
            }
          : null,
        guidanceScrollWidth: guidance?.scrollWidth || 0,
        guidanceClientWidth: guidance?.clientWidth || 0,
        buttons,
        documentScrollWidth: document.documentElement.scrollWidth,
        documentClientWidth: document.documentElement.clientWidth,
      }
    })
    assert.equal(
      crossRoleMetrics.guidanceText,
      '',
      `${scenarioName} 后端已授权的账号不应被移动端路径角色二次拦截: ${JSON.stringify(crossRoleMetrics)}`
    )
    assert(
      !crossRoleMetrics.buttons.some((button) => button.text === '处理') &&
        crossRoleMetrics.buttons.some(
          (button) => button.text === '阻塞' && !button.disabled
        ) &&
        crossRoleMetrics.buttons.some(
          (button) => button.text === '完成' && !button.disabled
        ) &&
        crossRoleMetrics.buttons.some(
          (button) => button.text === '退回当前任务' && !button.disabled
        ) &&
        crossRoleMetrics.buttons.some(
          (button) => button.text === '催办' && !button.disabled
        ),
      `${scenarioName} 移动端动作必须与后端授权投影一致: ${JSON.stringify(crossRoleMetrics)}`
    )
    assert(
      crossRoleMetrics.documentScrollWidth <=
        crossRoleMetrics.documentClientWidth + 1,
      `${scenarioName} 路径切换后任务详情造成横向溢出: ${JSON.stringify(crossRoleMetrics)}`
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
    assertMobileSummaryMetricsReadonly,
    assertMobileMineMetricButtonsVisible,
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
