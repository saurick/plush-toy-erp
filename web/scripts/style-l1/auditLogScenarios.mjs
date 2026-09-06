export function createAuditLogScenarios({
  expectHeading,
  expectText,
  assertTextAbsent,
  assertNoHorizontalOverflow,
  assert,
}) {
  const assertAuditLogsCompactDetailDrawer = async (
    page,
    { scenarioName, expectedPanelWidth }
  ) => {
    const feed = page.getByRole('region', { name: '操作记录列表' })
    const trigger = feed.getByRole('button', { name: /员工岗位变更/u }).first()
    await trigger.waitFor({ state: 'visible', timeout: 10_000 })
    await assertNoHorizontalOverflow(page, scenarioName)
    assert.equal(
      await page
        .locator('.erp-audit-workspace > .erp-audit-detail')
        .isVisible(),
      false,
      `${scenarioName} 窄屏不应显示桌面内联详情`
    )

    await trigger.click()
    const drawer = page.locator('.erp-audit-detail-drawer')
    await drawer.waitFor({ state: 'visible', timeout: 10_000 })
    await drawer.getByText('下一步', { exact: true }).waitFor()
    await page.waitForFunction(
      () => {
        const drawerNode = document.querySelector('.erp-audit-detail-drawer')
        return drawerNode?.contains(document.activeElement)
      },
      undefined,
      { timeout: 10_000 }
    )

    const metrics = await drawer.evaluate((node) => {
      const panel = node.querySelector('.ant-drawer-content-wrapper')
      const body = node.querySelector('.ant-drawer-body')
      const detail = node.querySelector('.erp-audit-detail--drawer')
      return {
        panelWidth: panel?.getBoundingClientRect().width || 0,
        bodyClientWidth: body?.clientWidth || 0,
        bodyScrollWidth: body?.scrollWidth || 0,
        detailClientWidth: detail?.clientWidth || 0,
        detailScrollWidth: detail?.scrollWidth || 0,
      }
    })
    assert(
      Math.abs(metrics.panelWidth - expectedPanelWidth) <= 2,
      `${scenarioName} Drawer 宽度异常: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.bodyClientWidth > 0 &&
        metrics.bodyScrollWidth <= metrics.bodyClientWidth + 1 &&
        metrics.detailClientWidth > 0 &&
        metrics.detailScrollWidth <= metrics.detailClientWidth + 1,
      `${scenarioName} Drawer 内容不应横向溢出: ${JSON.stringify(metrics)}`
    )
    await assertNoHorizontalOverflow(page, `${scenarioName}-drawer-open`)

    await page.keyboard.press('Escape')
    await drawer.waitFor({ state: 'hidden', timeout: 10_000 })
    await page.waitForFunction(
      () => {
        const expectedTrigger = Array.from(
          document.querySelectorAll('.erp-audit-event')
        ).find((event) => event.textContent?.includes('员工岗位变更'))
        return document.activeElement === expectedTrigger
      },
      undefined,
      { timeout: 10_000 }
    )
    const focusMetrics = await page.evaluate(() => {
      const { activeElement } = document
      const expectedTrigger = Array.from(
        document.querySelectorAll('.erp-audit-event')
      ).find((event) => event.textContent?.includes('员工岗位变更'))
      return {
        activeClassName: activeElement?.className || '',
        activeTagName: activeElement?.tagName || '',
        activeText:
          activeElement?.textContent?.replace(/\s+/g, ' ').trim() || '',
        expectedTriggerConnected: expectedTrigger?.isConnected === true,
        restored: activeElement === expectedTrigger,
      }
    })
    assert(
      focusMetrics.restored,
      `${scenarioName} Drawer 关闭后焦点未回到事件卡: ${JSON.stringify(focusMetrics)}`
    )
  }
  return [
    {
      name: 'system-audit-logs-phone-390',
      path: '/erp/system/audit-logs',
      auth: 'admin',
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        await expectHeading(page, '系统操作记录')
        await expectText(page, '员工岗位变更')
        await assertAuditLogsCompactDetailDrawer(page, {
          scenarioName: 'system-audit-logs-phone-390',
          expectedPanelWidth: 390,
        })
      },
    },
    {
      name: 'system-audit-logs-tablet-820',
      path: '/erp/system/audit-logs',
      auth: 'admin',
      viewport: { width: 820, height: 1180 },
      verify: async (page) => {
        await expectHeading(page, '系统操作记录')
        await expectText(page, '员工岗位变更')
        await assertAuditLogsCompactDetailDrawer(page, {
          scenarioName: 'system-audit-logs-tablet-820',
          expectedPanelWidth: 560,
        })
      },
    },
    {
      name: 'system-audit-logs-desktop',
      path: '/erp/system/audit-logs',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '系统操作记录')
        await expectText(
          page,
          '查看员工账号、岗位和系统设置的操作记录，需要时按风险和操作类型筛选。'
        )
        await expectText(page, '员工岗位变更')
        await expectText(page, '员工账号已记录')
        await expectText(page, '系统准备未完成，请联系管理员检查系统设置')
        await expectText(page, '下一步')
        await expectText(page, '修改内容')
        await assertTextAbsent(page, '生产环境缺少显式初始化确认')
        await assertTextAbsent(page, '原始 payload')
        await assertTextAbsent(page, 'assistant-admin')
        await assertTextAbsent(page, 'admin_user.roles.set')
        await assertTextAbsent(page, 'admin_bootstrap.blocked')
        await assertTextAbsent(page, 'actor')
        await assertTextAbsent(page, 'target')
        await assertNoHorizontalOverflow(page, 'system-audit-logs-desktop')

        const metrics = await page.evaluate(() => {
          const pageNode = document.querySelector('.erp-audit-page')
          const workspace = document.querySelector('.erp-audit-workspace')
          const detail = document.querySelector('.erp-audit-detail')
          const eventItems = document.querySelectorAll('.erp-audit-event')
          const payloadNode = document.querySelector('.erp-audit-payload')
          const rect = pageNode?.getBoundingClientRect()
          const workspaceRect = workspace?.getBoundingClientRect()
          const detailRect = detail?.getBoundingClientRect()
          return {
            hasPage: Boolean(pageNode),
            hasWorkspace: Boolean(workspace),
            hasDetail: Boolean(detail),
            eventCount: eventItems.length,
            hasPayloadNode: Boolean(payloadNode),
            pageWidth: rect?.width || 0,
            workspaceWidth: workspaceRect?.width || 0,
            detailWidth: detailRect?.width || 0,
            documentScrollWidth: document.documentElement.scrollWidth,
            documentClientWidth: document.documentElement.clientWidth,
          }
        })
        assert(
          metrics.hasPage &&
            metrics.hasWorkspace &&
            metrics.hasDetail &&
            metrics.eventCount >= 2,
          `审计日志默认态缺少关键区域: ${JSON.stringify(metrics)}`
        )
        assert.equal(
          metrics.hasPayloadNode,
          false,
          `审计日志不应挂载原始事件结构区域: ${JSON.stringify(metrics)}`
        )
        assert(
          metrics.workspaceWidth > 900 &&
            metrics.detailWidth >= 300 &&
            metrics.documentScrollWidth <= metrics.documentClientWidth + 2,
          `审计日志桌面布局尺寸异常: ${JSON.stringify(metrics)}`
        )

        const auditActionField = page
          .locator('.erp-audit-field--wide')
          .filter({ hasText: '操作类型' })
        const auditActionSelect = auditActionField.locator('.ant-select')
        await auditActionSelect.locator('.ant-select-selector').click()
        const auditActionDropdown = page.locator('.ant-select-dropdown:visible')
        await auditActionDropdown.waitFor({
          state: 'visible',
          timeout: 10_000,
        })
        const expectedAuditActionGroups = [
          '系统管理',
          '客户业务设置',
          '系统准备',
          '紧急任务处理',
        ]
        const observedAuditActionGroups = new Set()
        const collectVisibleAuditActionGroups = async () => {
          const labels = await auditActionDropdown
            .locator('.ant-select-item-group')
            .allTextContents()
          for (const label of labels) {
            observedAuditActionGroups.add(label.trim())
          }
        }
        const auditActionListHolder = auditActionDropdown.locator(
          '.rc-virtual-list-holder'
        )
        const auditActionScrollMetrics = await auditActionListHolder.evaluate(
          (node) => ({
            clientHeight: node.clientHeight,
            scrollHeight: node.scrollHeight,
          })
        )
        const auditActionMaxScrollTop = Math.max(
          0,
          auditActionScrollMetrics.scrollHeight -
            auditActionScrollMetrics.clientHeight
        )
        const auditActionScrollStep = Math.max(
          1,
          Math.floor(auditActionScrollMetrics.clientHeight / 2)
        )
        for (
          let scrollTop = 0;
          scrollTop < auditActionMaxScrollTop;
          scrollTop += auditActionScrollStep
        ) {
          await auditActionListHolder.evaluate((node, nextScrollTop) => {
            node.scrollTop = nextScrollTop
          }, scrollTop)
          await page.waitForTimeout(50)
          await collectVisibleAuditActionGroups()
        }
        await auditActionListHolder.evaluate((node, nextScrollTop) => {
          node.scrollTop = nextScrollTop
        }, auditActionMaxScrollTop)
        await page.waitForTimeout(50)
        await collectVisibleAuditActionGroups()
        assert.deepEqual(
          [...observedAuditActionGroups],
          expectedAuditActionGroups
        )
        await auditActionListHolder.evaluate((node) => {
          node.scrollTop = 0
          node.dispatchEvent(new Event('scroll', { bubbles: true }))
        })
        await page.waitForTimeout(100)
        await page.keyboard.press('Escape')
        await auditActionDropdown.waitFor({
          state: 'hidden',
          timeout: 10_000,
        })
        await auditActionSelect.locator('.ant-select-selector').click()
        await auditActionDropdown.waitFor({
          state: 'visible',
          timeout: 10_000,
        })
        await auditActionListHolder.evaluate((node) => {
          node.scrollTop = 0
          node.dispatchEvent(new Event('scroll', { bubbles: true }))
        })
        await page.waitForTimeout(100)
        const employeeRoleChangeOption = auditActionDropdown
          .locator('.ant-select-item-option')
          .filter({ hasText: '员工岗位变更' })
        await employeeRoleChangeOption.waitFor({
          state: 'visible',
          timeout: 10_000,
        })
        await employeeRoleChangeOption.click()
        assert.equal(
          String(
            await auditActionSelect
              .locator('.ant-select-selection-item')
              .textContent()
          ).trim(),
          '员工岗位变更'
        )
        await auditActionSelect.locator('.ant-select-selector').click()
        await auditActionDropdown.waitFor({
          state: 'visible',
          timeout: 10_000,
        })
        assert.equal(
          String(
            await auditActionSelect
              .locator('.ant-select-selection-item')
              .textContent()
          ).trim(),
          '员工岗位变更',
          '重新打开操作类型下拉后必须保留已选操作'
        )
        await page.keyboard.press('Escape')
        await auditActionDropdown.waitFor({
          state: 'hidden',
          timeout: 10_000,
        })
        await assertNoHorizontalOverflow(
          page,
          'system-audit-logs-desktop-action-groups'
        )
      },
    },
  ]
}
