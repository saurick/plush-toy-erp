import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { getContrastRatio, parseRgb } from './colorAssertions.mjs'
import { verifyMobileNavigationMotion } from './slidingMotionAssertions.mjs'
import { clickTaskCardContent } from './taskCopyAssertions.mjs'

export function createTaskDrawerAppearanceScenarios({
  assert,
  path,
  outputDir,
  customerRuntimeEffectiveSession,
  assertTaskActionDrawerLayout,
}) {
  const taskName = '核对优先订单排期'
  const effectiveSession = {
    ...customerRuntimeEffectiveSession,
    configRevision: 'style-l1-task-drawer-appearance',
    actions: [
      'workflow.task.read',
      'workflow.task.update',
      'workflow.task.complete',
      'workflow.task.reject',
    ],
    workflow_visible_owner_role_keys_by_capability: {
      'workflow.task.read': ['warehouse'],
      'workflow.task.update': ['warehouse'],
      'workflow.task.complete': ['warehouse'],
      'workflow.task.reject': ['warehouse'],
    },
  }
  const fixture = {
    id: 9410,
    task_code: 'STYLE-L1-TASK-APPEARANCE',
    task_group: 'trial_warehouse_work',
    task_name: taskName,
    source_type: 'shipping-release',
    source_id: 9410,
    source_no: 'OUT-20260926-005',
    task_status_key: 'ready',
    owner_role_key: 'warehouse',
    created_at: 1790085600,
    version: 1,
    payload: {
      product_name: '云朵小熊',
      product_code: '27001#',
      internal_style_no: 'YS-27001',
    },
  }

  const desktopScenarios = ['light', 'dark'].map((themeMode) => ({
    name: `task-drawer-appearance-${themeMode}`,
    path: '/erp/task-board',
    auth: 'admin',
    themeMode,
    effectiveSession,
    workflowTaskFixtures: [
      {
        ...fixture,
        payload: {
          ...fixture.payload,
          product_name:
            themeMode === 'dark'
              ? '云朵小熊组合礼盒（含加长产品名称、双色包装及分批交付补充说明）'
              : fixture.payload.product_name,
        },
      },
    ],
    viewport: { width: 1440, height: 900 },
    verify: async (page) => {
      const trigger = page.getByRole('button', {
        name: `查看${taskName}详情`,
        exact: true,
      })
      await trigger.waitFor()
      const drawer = page.locator('.erp-task-action-drawer')
      const tabs = '.erp-task-action-drawer__guide-steps'
      const shot = (suffix) =>
        page.screenshot({
          path: path.resolve(
            outputDir,
            `task-drawer-${themeMode}-${suffix}.png`
          ),
        })

      for (const [label, key] of [
        ['蓝色', 'blue'],
        ['绿色', 'green'],
        ['黄色', 'yellow'],
        ['粉色', 'pink'],
        ['橙色', 'orange'],
        ['紫色', 'purple'],
      ]) {
        await page
          .getByRole('button', { name: '外观与密度', exact: true })
          .click()
        const appearance = page.getByRole('dialog', { name: '外观与密度' })
        await appearance
          .getByRole('button', { name: label, exact: true })
          .click()
        await page.waitForFunction(
          (accent) => document.documentElement.dataset.erpAccent === accent,
          key
        )
        await appearance
          .getByRole('button', { name: '完成', exact: true })
          .click()
        await appearance.waitFor({ state: 'hidden' })
        await trigger.click()
        await drawer.getByRole('region', { name: '本任务处理记录' }).waitFor()
        await waitForFiniteAnimations(page)
        const geometry = await drawer.evaluate((root) => {
          const rect = (selector) =>
            root.querySelector(selector).getBoundingClientRect()
          const style = (selector) =>
            getComputedStyle(root.querySelector(selector))
          const meta = [
            ...root.querySelectorAll(
              '.erp-task-action-drawer__task-meta > div'
            ),
          ]
          const marker = '.erp-task-action-drawer__step--active > span'
          const stage = '.workflow-process-stage__marker'
          const primary = '.ant-drawer-footer .ant-btn-primary'
          const body = root.querySelector('.ant-drawer-body')
          return {
            headerHeight: rect('.ant-drawer-header').height,
            stepHeight: rect('.erp-task-action-drawer__guide-steps').height,
            cardRadius: style('.erp-task-action-drawer__summary').borderRadius,
            recordRadius: style('.workflow-task-event-trail').borderRadius,
            titleSize: style('.erp-task-action-drawer__task-title').fontSize,
            closeRight: rect('.ant-drawer-close').right,
            titleRight: rect('.erp-task-action-drawer__heading').right,
            metaTopDelta:
              meta[0].getBoundingClientRect().y -
              meta[1].getBoundingClientRect().y,
            markerBackground: style(marker).backgroundColor,
            markerForeground: style(marker).color,
            primaryBackground: style(primary).backgroundColor,
            stageBorder: style(stage).borderTopColor,
            surface: style('.erp-task-action-drawer__summary').backgroundColor,
            pageBackground: getComputedStyle(body).backgroundColor,
            expectedPageBackground: getComputedStyle(body)
              .getPropertyValue('--erp-page-bg')
              .trim(),
            stageHeight: rect('.workflow-process-stage__list').height,
            bodyOverflow: body.scrollWidth - body.clientWidth,
          }
        })
        const context = `${themeMode}/${key}: ${JSON.stringify(geometry)}`
        assert(
          geometry.headerHeight <= 56 && geometry.stepHeight <= 40,
          context
        )
        assert.equal(geometry.cardRadius, '10px', context)
        assert.equal(geometry.recordRadius, '10px', context)
        assert.equal(geometry.titleSize, '16px', context)
        assert(geometry.closeRight > geometry.titleRight, context)
        assert(Math.abs(geometry.metaTopDelta) < 1, context)
        assert.equal(
          geometry.markerBackground,
          geometry.primaryBackground,
          context
        )
        assert.equal(geometry.stageBorder, geometry.primaryBackground, context)
        assert.deepEqual(
          parseRgb(geometry.pageBackground),
          parseRgb(geometry.expectedPageBackground),
          context
        )
        assert(
          getContrastRatio(
            parseRgb(geometry.markerForeground),
            parseRgb(geometry.markerBackground)
          ) >= 4.5,
          context
        )
        assert(geometry.stageHeight < 80 && geometry.bodyOverflow <= 1, context)
        if (key === 'pink' || key === 'yellow') await shot(`${key}-context`)

        await verifyMobileNavigationMotion(page, assert, tabs, 1)
        const options = drawer.getByRole('radio')
        await options.first().click()
        await waitForFiniteAnimations(page)
        const choice = await drawer.evaluate((root) => {
          const items = [...root.querySelectorAll('[role="radio"]')]
          const selected = root.querySelector(
            '[role="radio"][aria-checked="true"]'
          )
          const primary = root.querySelector(
            '.ant-drawer-footer .ant-btn-primary'
          )
          return {
            columns: getComputedStyle(
              root.querySelector('.erp-task-action-drawer__action-options')
            ).gridTemplateColumns.split(' ').length,
            topDelta:
              items[0].getBoundingClientRect().y -
              items[1].getBoundingClientRect().y,
            selectedBorder: getComputedStyle(selected).borderTopColor,
            primaryBackground: getComputedStyle(primary).backgroundColor,
          }
        })
        assert.equal(choice.columns, 2, `${themeMode}/${key} 操作卡应为两列`)
        assert(Math.abs(choice.topDelta) < 1, JSON.stringify(choice))
        assert.equal(
          choice.selectedBorder,
          choice.primaryBackground,
          JSON.stringify(choice)
        )
        if (key === 'pink') await shot('pink-actions')
        if (key === 'blue') {
          assert.equal(await drawer.getByRole('radio').count(), 2)
          const more = drawer.getByRole('button', { name: '更多处理方式', exact: true })
          await more.press('Enter')
          await page.waitForFunction(() => Boolean(document.activeElement?.closest('[role="menu"]')))
          await page.keyboard.press('Escape')
          await page.locator('.ant-dropdown-menu[role="menu"]').waitFor({ state: 'hidden' })
          await waitForFiniteAnimations(page)
          assert.equal(await drawer.isVisible(), true)
          assert.equal(await more.evaluate((node) => node === document.activeElement), true)
          await more.click()
          await page.getByRole('menuitem', { name: '退回任务', exact: true }).click()
          assert.equal(await drawer.getByRole('button', { name: '更多处理方式：退回任务', exact: true }).count(), 1)
          assert.equal(await drawer.getByRole('tab', { name: /确认与结果/ }).isDisabled(), true)
          await drawer.getByRole('radio', { name: /处理完成/ }).click()
        }
        await verifyMobileNavigationMotion(page, assert, tabs, 0, true)
        await drawer.locator('.ant-drawer-close').click()
        await drawer.waitFor({ state: 'hidden' })
        await page.waitForFunction(
          (name) => document.activeElement?.getAttribute('aria-label') === name,
          `查看${taskName}详情`,
          { timeout: 3000 }
        )
        assert(
          await trigger.evaluate((node) => node === document.activeElement),
          '关闭后恢复任务入口焦点'
        )
      }

      await trigger.click()
      await assertTaskActionDrawerLayout(page, {
        scenarioName: `task-drawer-appearance-${themeMode}-context`,
        expectedTaskText: taskName,
        expectReasonInput: false,
      })
      await drawer.getByRole('tab', { name: /选择处理/ }).click()
      await drawer.getByRole('radio', { name: /标记阻塞/ }).click()
      assert(
        await drawer.getByRole('tab', { name: /确认与结果/ }).isDisabled(),
        '缺少原因时不可进入确认'
      )
      await drawer.locator('textarea').fill('等待核对材料齐套和交期。')
      await drawer
        .getByRole('button', { name: '核对并确认', exact: true })
        .click()
      await drawer.getByRole('button', { name: /提交.*阻塞/ }).waitFor()
      await shot('confirmation')
      await drawer.getByRole('button', { name: '上一步', exact: true }).click()
      assert.equal(
        await drawer.locator('textarea').inputValue(),
        '等待核对材料齐套和交期。'
      )
      await page.setViewportSize({ width: 390, height: 844 })
      await waitForFiniteAnimations(page)
      const narrow = await drawer.evaluate((root) => {
        const choices = root.querySelector(
          '.erp-task-action-drawer__action-options'
        )
        const body = root.querySelector('.ant-drawer-body')
        const footer = root
          .querySelector('.ant-drawer-footer')
          .getBoundingClientRect()
        return {
          columns:
            getComputedStyle(choices).gridTemplateColumns.split(' ').length,
          overflow: body.scrollWidth - body.clientWidth,
          footerBottom: footer.bottom,
          screenHeight: innerHeight,
        }
      })
      assert.equal(narrow.columns, 1, '窄屏处理卡恢复单列')
      assert(
        narrow.overflow <= 1 && narrow.footerBottom <= narrow.screenHeight,
        JSON.stringify(narrow)
      )
      await shot('narrow-actions')
      await drawer.locator('textarea').press('Escape')
      await drawer.waitFor({ state: 'hidden' })
      await page.setViewportSize({ width: 1440, height: 900 })
    },
  }))
  return [
    ...desktopScenarios,
    {
      name: 'task-detail-shared-surfaces-mobile-dark',
      path: '/m/warehouse/tasks',
      auth: 'admin',
      themeMode: 'dark',
      viewport: { width: 390, height: 844 },
      effectiveSession: {
        ...effectiveSession,
        actions: [...effectiveSession.actions, 'mobile.warehouse.access'],
      },
      workflowTaskFixtures: [fixture],
      verify: async (page) => {
        const row = page
          .locator('.erp-mobile-list-item')
          .filter({ hasText: taskName })
        await row.waitFor()
        await clickTaskCardContent(
          row,
          row.getByText(taskName, { exact: true })
        )
        const detail = page.getByTestId('mobile-task-detail-screen')
        const history = page.getByTestId('workflow-task-event-trail')
        await history.waitFor()
        await waitForFiniteAnimations(page)
        const paint = await history.evaluate((root) => {
          const style = getComputedStyle(root)
          const title = getComputedStyle(root.querySelector('h3'))
          return {
            radius: style.borderRadius,
            foreground: title.color,
            background: style.backgroundColor,
            expectedBackground: style
              .getPropertyValue('--erp-surface-bg')
              .trim(),
            overflow: root.scrollWidth - root.clientWidth,
          }
        })
        assert.equal(paint.radius, '16px', '共享记录卡保留手机端圆角')
        assert.deepEqual(
          parseRgb(paint.background),
          parseRgb(paint.expectedBackground)
        )
        assert(
          getContrastRatio(
            parseRgb(paint.foreground),
            parseRgb(paint.background)
          ) >= 4.5
        )
        assert(paint.overflow <= 1)
        await detail.screenshot({
          path: path.join(outputDir, 'task-detail-shared-mobile-dark.png'),
        })
        await detail.locator('.mobile-role-action-bar').getByRole('button', { name: '处理任务', exact: true }).click()
        const action = page.getByTestId('mobile-task-action-screen')
        await action.waitFor()
        assert.equal(await action.getByRole('radio').count(), 2)
        const more = action.locator('details')
        assert.equal(await more.getAttribute('open'), null)
        await more.locator('summary').press('Enter')
        await more.locator('input[value="rejected"]').check()
        assert.equal(await more.locator('input[value="rejected"]').isChecked(), true)
        await action.locator('button[type="submit"]').click()
        assert.match(await action.innerText(), /退回原因为必填项/)
        await action.screenshot({ path: path.join(outputDir, 'mobile-task-more-actions-dark.png') })
        await action.getByLabel('返回任务详情').click()
        await page.getByLabel('返回任务列表').click()
        await row.waitFor()
      },
    },
  ]
}
