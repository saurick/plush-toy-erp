async function assertMobileNavigationFitsViewport(page, assert) {
  const geometry = await page.evaluate(() => {
    const nav = document.querySelector('[data-testid="mobile-role-bottom-nav"]')
    const describe = (element) => {
      const box = element.getBoundingClientRect()
      const style = getComputedStyle(element)
      return {
        className: element.className,
        top: box.top,
        bottom: box.bottom,
        left: box.left,
        right: box.right,
        height: box.height,
        minHeight: style.minHeight,
        paddingTop: style.paddingTop,
        paddingBottom: style.paddingBottom,
        overflowY: style.overflowY,
      }
    }
    const ancestors = []
    for (
      let element = nav.parentElement;
      element;
      element = element.parentElement
    ) {
      ancestors.push(describe(element))
    }
    return {
      viewport: { width: innerWidth, height: innerHeight },
      nav: describe(nav),
      labels: [...nav.querySelectorAll('.mobile-role-bottom-nav__label')].map(
        describe
      ),
      ancestors,
    }
  })
  const diagnostic = JSON.stringify(geometry)
  assert(
    geometry.nav.top >= 0 &&
      geometry.nav.bottom <= geometry.viewport.height + 1,
    diagnostic
  )
  for (const label of geometry.labels) {
    assert(
      label.top >= geometry.nav.top && label.bottom <= geometry.nav.bottom,
      diagnostic
    )
    assert(
      label.left >= 0 && label.right <= geometry.viewport.width + 1,
      diagnostic
    )
  }
  return geometry
}

export function createMobileAdminReviewScenarios({
  assert,
  expectText,
  waitForPath,
  customerRuntimeEffectiveSession,
}) {
  const reviewScenarios = [
    {
      name: 'light',
      themeMode: 'light',
      viewport: { width: 390, height: 844 },
    },
    { name: 'dark', themeMode: 'dark', viewport: { width: 320, height: 844 } },
    {
      name: 'desktop',
      themeMode: 'light',
      viewport: { width: 1024, height: 600 },
    },
  ].map(({ name, themeMode, viewport }) => ({
    name: `mobile-admin-review-${name}`,
    path: '/m/all/tasks',
    auth: 'admin',
    customerKey: 'yoyoosun',
    themeMode,
    viewport,
    adminProfile: {
      id: 1,
      username: 'mobile-review-admin',
      is_super_admin: true,
      roles: [{ role_key: 'admin', name: '系统管理员' }],
      permissions: [],
      menus: [],
    },
    effectiveSession: {
      ...customerRuntimeEffectiveSession,
      roles: ['sales', 'warehouse', 'finance'],
      actions: [
        'mobile.sales.access',
        'mobile.warehouse.access',
        'workflow.task.read',
        'workflow.task.approve',
      ],
    },
    workflowTaskFixtures: [
      {
        id: 97001,
        owner_role_key: 'sales',
        task_name: '业务全局查看任务',
        task_status_key: 'ready',
      },
      {
        id: 97002,
        owner_role_key: 'warehouse',
        task_name: '仓库全局查看任务',
        task_status_key: 'blocked',
      },
      {
        id: 97003,
        owner_role_key: 'sales',
        task_name: '业务已办查看记录',
        task_status_key: 'done',
      },
      {
        id: 97004,
        owner_role_key: 'finance',
        task_name: '未开放的财务任务',
        task_status_key: 'ready',
      },
    ].map((task) => ({
      ...task,
      version: 1,
      task_code: `MOBILE-REVIEW-${task.id}`,
      task_group: 'review',
      source_type: 'review',
      source_id: task.id,
      source_no: `REVIEW-${task.id}`,
      required_capability_key: 'workflow.task.approve',
      assignee_id: 9,
      created_at: 1_788_840_000,
      payload: {},
    })),
    verify: async (page) => {
      await expectText(page, '业务全局查看任务')
      await expectText(page, '仓库全局查看任务')
      await assertMobileNavigationFitsViewport(page, assert)
      assert.equal(
        await page.getByText('未开放的财务任务', { exact: true }).count(),
        0
      )
      const rows = page.locator('.erp-mobile-list-item')
      const search = page.getByRole('searchbox', {
        name: '搜索订单、产品、物料或款号',
      })
      await search.fill('仓库全局查看')
      await page.waitForFunction(
        () => document.querySelectorAll('.erp-mobile-list-item').length === 1
      )
      await expectText(page, '仓库全局查看任务')
      await page.getByRole('button', { name: '清除搜索' }).click()
      await expectText(page, '业务全局查看任务')
      await rows.filter({ hasText: '业务全局查看任务' }).click()
      await page
        .locator('[data-testid="mobile-task-detail-screen"]')
        .waitFor({ state: 'visible' })
      assert.equal(
        await page
          .getByRole('button', { name: '确认完成', exact: true })
          .count(),
        0
      )
      assert.equal(
        await page
          .locator('[data-step-key="process"]')
          .getAttribute('data-state'),
        'locked'
      )
      await page.goBack()
      await expectText(page, '仓库全局查看任务')
      await page.locator('.mobile-admin-review .ant-select-selector').click()
      assert.equal(
        await page
          .locator('.ant-select-item-option')
          .filter({ hasText: '财务' })
          .count(),
        0
      )
      await page
        .locator('.ant-select-item-option')
        .filter({ hasText: '业务' })
        .click()
      await waitForPath(page, '/m/sales/tasks')
      await page
        .locator('.mobile-admin-review .ant-select-selection-item')
        .filter({ hasText: /^业务$/ })
        .waitFor({ state: 'visible' })
      assert.equal(
        await page.getByText('仓库全局查看任务', { exact: true }).count(),
        0
      )
      await expectText(page, '业务全局查看任务')
      await page.getByText('已办', { exact: true }).click()
      await expectText(page, '业务已办查看记录')
      await page.reload()
      await expectText(page, '管理员视角')
      await waitForPath(page, '/m/sales/tasks')
      const geometry = await page.evaluate(() => {
        const selector = document
          .querySelector('.mobile-admin-review .ant-select')
          .getBoundingClientRect()
        const nav = document
          .querySelector('[data-testid="mobile-role-bottom-nav"]')
          .getBoundingClientRect()
        return {
          selectorHeight: selector.height,
          navBottom: nav.bottom,
          height: innerHeight,
        }
      })
      assert(geometry.selectorHeight >= 44, JSON.stringify(geometry))
      assert(
        geometry.navBottom <= geometry.height + 1,
        JSON.stringify(geometry)
      )
      await assertMobileNavigationFitsViewport(page, assert)
      const keyboardSelector = page.getByRole('combobox', { name: '查看岗位' })
      await keyboardSelector.focus()
      await keyboardSelector.press('ArrowDown')
      await keyboardSelector.press('Escape')
      assert.equal(
        await keyboardSelector.getAttribute('aria-expanded'),
        'false'
      )
      assert.equal(
        await keyboardSelector.evaluate(
          (element) => element === document.activeElement
        ),
        true
      )
    },
  }))
  return [
    ...reviewScenarios,
    {
      ...reviewScenarios[0],
      name: 'mobile-admin-review-four-tabs-responsive',
      effectiveSession: {
        ...reviewScenarios[0].effectiveSession,
        actions: [
          ...reviewScenarios[0].effectiveSession.actions,
          'erp.business_dashboard.read',
          'pmc.plan.read',
        ],
      },
      workflowTaskFixtures: Array.from({ length: 124 }, (_, index) => ({
        ...reviewScenarios[0].workflowTaskFixtures[0],
        id: 98000 + index,
        task_code: `MOBILE-NAV-${index + 1}`,
        task_name: `导航布局待处理任务 ${index + 1}`,
        task_status_key: 'blocked',
      })),
      verify: async (page) => {
        const nav = page.getByTestId('mobile-role-bottom-nav')
        await nav.waitFor({ state: 'visible' })
        await page
          .getByTestId('mobile-nav-todo-count')
          .getByText('99+', { exact: true })
          .waitFor()
        await page
          .getByTestId('mobile-nav-risk-count')
          .getByText('99+', { exact: true })
          .waitFor()
        const labels = ['进度', '任务', '风险', '我的']
        assert.deepEqual(
          await nav.locator('.mobile-role-bottom-nav__label').allTextContents(),
          labels
        )
        const originalNav = await nav.elementHandle()
        const samples = []
        for (const viewport of [
          { width: 390, height: 844 },
          { width: 320, height: 568 },
          { width: 767, height: 480 },
          { width: 768, height: 480 },
          { width: 1024, height: 600 },
          { width: 1440, height: 900 },
        ]) {
          await page.setViewportSize(viewport)
          for (const label of labels) {
            await nav.getByRole('tab', { name: label, exact: true }).click()
            assert.equal(
              await nav
                .getByRole('tab', { name: label, exact: true })
                .getAttribute('aria-selected'),
              'true'
            )
            await assertMobileNavigationFitsViewport(page, assert)
          }
          const geometry = await assertMobileNavigationFitsViewport(
            page,
            assert
          )
          samples.push({
            ...viewport,
            navBottom: geometry.nav.bottom,
            labelBottom: geometry.labels[0].bottom,
          })
        }
        assert.equal(
          await originalNav.evaluate((element) => element.isConnected),
          true
        )
        await page.locator('.mobile-admin-review .ant-select-selector').click()
        await page
          .locator('.ant-select-item-option')
          .filter({ hasText: /^业务$/ })
          .click()
        await waitForPath(page, '/m/sales/tasks')
        await page.reload()
        await page
          .getByTestId('mobile-role-bottom-nav')
          .waitFor({ state: 'visible' })
        await assertMobileNavigationFitsViewport(page, assert)
        await page.getByTestId('mobile-role-nav-tasks').click()
        await page
          .locator('.erp-mobile-list-item')
          .first()
          .waitFor({ state: 'visible' })
        await assertMobileNavigationFitsViewport(page, assert)
        console.info(
          `[style:l1] mobile admin navigation geometry ${JSON.stringify(samples)}`
        )
      },
    },
    {
      name: 'dev-ui-design-admin-mobile-review',
      path: '/__dev/ui-design',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        const frame = page.frameLocator('iframe[title="ERP 最新可交互设计"]')
        await frame.getByRole('button', { name: '手机端', exact: true }).click()
        const selector = frame.getByLabel('查看岗位', { exact: true })
        await selector.selectOption({ index: 1 })
        const scopedCount = await frame.locator('.rm-task-card').count()
        assert(scopedCount > 0)
        await selector.selectOption('all')
        assert((await frame.locator('.rm-task-card').count()) >= scopedCount)
        const nav = await frame.locator('.rm-bottom-nav').boundingBox()
        const device = await frame.locator('.role-mobile-device').boundingBox()
        assert(nav.y + nav.height <= device.y + device.height)
      },
    },
  ]
}
