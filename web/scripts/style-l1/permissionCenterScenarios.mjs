import {
  assertBusinessFormPage,
  closeBusinessFormPage,
} from './businessFormPageAssertions.mjs'
import { createPermissionUnifiedScenarios } from './permissionUnifiedScenarios.mjs'
import { createPermissionRelationshipScenarios } from './permissionRelationshipScenarios.mjs'

export function createPermissionCenterScenarios({
  expectText,
  assertERPThemeMode,
  assertDarkLoadingState,
  expectHeading,
  assertTextAbsent,
  assertDarkAntdStateSurfaces,
  assertPermissionSectionVisualSeparation,
  expectButton,
  assertNoHorizontalOverflow,
  assertAntdModalCentered,
  assert,
  assertNoDuplicatedAdminPageTitle,
  assertPermissionChecklistItemLayout,
  assertPaginationSizeChangerFocusStyle,
  assertShellRefreshButton,
  assertAdminRoleModalLayout,
  assertVisibleModalInputFocusStyle,
  openControlledAntSelectDropdown,
  selectVirtualizedAntOption,
}) {
  const waitForApprovalResponsibilityInputs = async (page) => {
    await expectText(page.locator('.erp-role-center-sidebar'), 'PMC')
    const adminTab = page.getByRole('tab', { name: /员工账号/u })
    await adminTab.waitFor({ state: 'visible', timeout: 10_000 })
    await expectText(adminTab, '7')
  }
  const selectApprovalRoleOption = async (
    page,
    selectRoot,
    { label, roleLabel }
  ) => {
    const dropdown = await openControlledAntSelectDropdown(
      page,
      selectRoot,
      label
    )
    await selectVirtualizedAntOption(page, dropdown, {
      label,
      optionLabel: roleLabel,
    })
  }
  const assertApprovalHeaderHelp = async (
    page,
    { triggerName, expectedText }
  ) => {
    const trigger = page.getByRole('button', {
      name: triggerName,
      exact: true,
    })
    await trigger.waitFor({ state: 'visible', timeout: 10_000 })
    await trigger.hover()
    let tooltip = page.locator('.ant-tooltip:visible').last()
    await tooltip.waitFor({ state: 'visible', timeout: 10_000 })
    assert.match(String(await tooltip.textContent()).trim(), expectedText)

    await page.mouse.move(0, 0)
    await tooltip.waitFor({ state: 'hidden', timeout: 10_000 })
    await trigger.focus()
    assert.equal(
      await trigger.evaluate((node) => node === document.activeElement),
      true,
      `${triggerName}应支持键盘聚焦`
    )
    tooltip = page.locator('.ant-tooltip:visible').last()
    await tooltip.waitFor({ state: 'visible', timeout: 10_000 })
    assert.match(String(await tooltip.textContent()).trim(), expectedText)
    await trigger.evaluate((node) => node.blur())
    await tooltip.waitFor({ state: 'hidden', timeout: 10_000 })
  }
  return [
    ...createPermissionRelationshipScenarios({ assert, assertNoHorizontalOverflow }),
    ...createPermissionUnifiedScenarios({ assert, assertNoHorizontalOverflow }),
    ...['light', 'dark'].map((themeMode) => ({
      name: `permission-center-approval-design-${themeMode}`,
      path: '/__dev/ui-design',
      themeMode,
      viewport: { width: 1440, height: 1000 },
      verify: async (page) => {
        const frame = page.frameLocator('iframe[title="ERP 最新可交互设计"]')
        await frame
          .getByRole('button', { name: '权限管理', exact: true })
          .click()
        await frame.getByRole('tab', { name: /审批责任/ }).click()
        const row = frame.getByRole('row', { name: /销售订单审批/ })
        await expectText(row, '全部审批')
        const edit = async () => {
          await row
            .getByRole('button', { name: '调整设置', exact: true })
            .click()
          return frame.getByRole('dialog', {
            name: '调整销售订单审批',
            exact: true,
          })
        }
        let dialog = await edit()
        await dialog
          .getByRole('radio', { name: '按金额审批', exact: true })
          .check()
        const bounds = await dialog
          .getByRole('radio', { name: '按金额审批', exact: true })
          .evaluate((el) => ({
            width: el.getBoundingClientRect().width,
            height: el.getBoundingClientRect().height,
            labelDisplay: getComputedStyle(el.parentElement).display,
          }))
        assert(
          bounds.width <= 24 &&
            bounds.height <= 24 &&
            ['flex', 'inline-flex'].includes(bounds.labelDisplay),
          `审批方式控件布局异常：${JSON.stringify(bounds)}`
        )
        await dialog
          .getByRole('textbox', { name: '审批起始金额', exact: true })
          .fill('-1')
        await dialog
          .getByRole('button', { name: '保留调整', exact: true })
          .click()
        await expectText(frame.locator('body'), '请输入非负金额')
        await dialog
          .getByRole('textbox', { name: '审批起始金额', exact: true })
          .fill('10000.01')
        await dialog
          .getByRole('button', { name: '保留调整', exact: true })
          .click()
        await expectText(row, 'CNY 10,000.01 起需审批')
        await frame
          .getByRole('button', { name: '保存并生效', exact: true })
          .click()
        dialog = await edit()
        assert.equal(
          await dialog
            .getByRole('textbox', { name: '审批起始金额', exact: true })
            .inputValue(),
          '10000.01'
        )
        await dialog
          .getByRole('textbox', { name: '审批起始金额', exact: true })
          .fill('0')
        await dialog
          .getByRole('button', { name: '保留调整', exact: true })
          .click()
        await expectText(row, '全部审批')
        await frame
          .getByRole('button', { name: '保存并生效', exact: true })
          .click()
        dialog = await edit()
        assert.equal(
          await dialog
            .getByRole('radio', { name: '全部审批', exact: true })
            .isChecked(),
          true
        )
        await dialog
          .getByRole('radio', { name: '按金额审批', exact: true })
          .check()
        assert.equal(
          await dialog
            .getByRole('textbox', { name: '审批起始金额', exact: true })
            .inputValue(),
          ''
        )
        await dialog
          .getByRole('textbox', { name: '审批起始金额', exact: true })
          .fill('10000')
        await dialog
          .getByRole('button', { name: '保留调整', exact: true })
          .click()
        await frame
          .getByRole('button', { name: '保存并生效', exact: true })
          .click()
        await edit()
      },
    })),
    {
      name: 'permission-center-loading-state',
      path: '/erp/system/permissions?__style_l1_admin_list_delay=900',
      auth: 'admin',
      themeMode: 'dark',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectText(page, '岗位设置加载中')
        await expectText(page, '正在加载员工账号和岗位，请稍候...')
        await assertERPThemeMode(page, {
          scenarioName: 'permission-center-loading-state',
          expectedMode: 'dark',
          expectedEffectiveTheme: 'dark',
        })
        await assertDarkLoadingState(page, {
          scenarioName: 'permission-center-loading-state',
        })
        await expectHeading(page, '权限管理')
        await assertTextAbsent(page, '岗位设置加载中')
        await assertDarkAntdStateSurfaces(page, {
          scenarioName: 'permission-center-loading-state',
        })
        await assertPermissionSectionVisualSeparation(page, {
          scenarioName: 'permission-center-loading-state',
        })
      },
    },
    {
      name: 'permission-center-approval-unconfigured',
      path: '/erp/system/permissions',
      auth: 'admin',
      approvalSettingsMode: 'unconfigured',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '权限管理')
        await waitForApprovalResponsibilityInputs(page)
        await page.getByRole('tab', { name: /审批责任/ }).click()
        await expectText(page, '待初始化')
        const salesRow = page.getByRole('row', { name: /销售订单审批/ })
        const purchaseRow = page.getByRole('row', { name: /采购订单审批/ })
        const shipmentRow = page.getByRole('row', { name: /出货财务放行/ })
        await expectText(salesRow, '待设置')
        await expectText(salesRow, '主办 · 业务')
        await expectText(salesRow, '升级 · 老板')
        await expectText(purchaseRow, '待设置')
        await expectText(purchaseRow, '主办 · 采购')
        await expectText(purchaseRow, '升级 · 老板')
        await expectText(shipmentRow, '待设置')
        await expectText(shipmentRow, '主办 · 财务')
        await expectText(shipmentRow, '升级 · 老板')
        await expectText(page, '推荐责任等待保存')
        await expectText(page, '保存前自动检查')
        await assertTextAbsent(page, '尚未发布审批责任')
        await expectButton(page, '保存并生效')
        await assertNoHorizontalOverflow(
          page,
          'permission-center-approval-unconfigured'
        )
      },
    },
    {
      name: 'permission-center-approval-responsibility',
      path: '/erp/system/permissions',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '权限管理')
        await waitForApprovalResponsibilityInputs(page)
        await page.getByRole('tab', { name: /审批责任/ }).click()
        await expectText(page, '设置审批条件，以及主办、备用和升级责任')
        await expectText(page, '销售订单审批')
        await expectText(page, '采购订单审批')
        await expectText(page, '出货财务放行')
        await assertTextAbsent(page, '付款审批')
        await expectText(page, '业务')
        await expectText(page, '老板')
        await assertApprovalHeaderHelp(page, {
          triggerName: '审批条件说明',
          expectedText: /同币种金额低于门槛免审/u,
        })
        await assertApprovalHeaderHelp(page, {
          triggerName: '责任顺序说明',
          expectedText: /不是多人逐级会签/u,
        })
        const disabledShipmentRow = page.getByRole('row', {
          name: /出货财务放行/,
        })
        await expectText(disabledShipmentRow, '停用')
        await expectText(disabledShipmentRow, '不参与流程')
        await page
          .getByRole('row', { name: /销售订单审批/ })
          .getByRole('button', { name: '调整' })
          .click()
        const dialog = page
          .getByRole('dialog')
          .filter({ hasText: '调整销售订单审批' })
        await expectText(dialog, '主要由谁审批')
        await expectText(dialog, '主办无人可处理时')
        await expectText(dialog, '超时或需要升级时')
        const primaryTier = dialog
          .locator('.erp-approval-responsibility-form__tier')
          .first()
        await primaryTier.locator('.ant-select').nth(1).click()
        await page
          .locator('.ant-select-dropdown:visible')
          .getByText('指定一名员工', { exact: true })
          .click()
        await primaryTier.locator('.ant-select').nth(2).click()
        const employeeOptions = page.locator('.ant-select-dropdown:visible')
        await employeeOptions
          .getByText('综合跟单（multi-role-employee）', { exact: true })
          .waitFor({ state: 'visible' })
        await employeeOptions
          .getByText('业务助理（assistant-admin）', { exact: true })
          .waitFor({ state: 'visible' })
        await employeeOptions
          .getByText('suspended-finance', { exact: true })
          .waitFor({ state: 'detached' })
        await employeeOptions
          .getByText('综合跟单（multi-role-employee）', { exact: true })
          .click()
        const backupTier = dialog
          .locator('.erp-approval-responsibility-form__tier')
          .nth(1)
        const backupRoleSelect = backupTier.locator('.ant-select').first()
        await selectApprovalRoleOption(page, backupRoleSelect, {
          label: '审批备用岗位',
          roleLabel: 'PMC',
        })
        await assertAntdModalCentered(
          page,
          dialog,
          'permission-center-approval-responsibility'
        )
        await dialog
          .getByRole('button', { name: '保存调整', exact: true })
          .click()
        await expectText(
          page.getByRole('row', { name: /销售订单审批/ }),
          '备用 · PMC'
        )
        await expectButton(page, '保存并生效')
        await page
          .getByRole('button', { name: '保存并生效', exact: true })
          .click()
        await expectText(page, '已生效')
        await assertTextAbsent(page, '确认并生效')
      },
    },
    {
      name: 'permission-center-approval-amount-condition',
      path: '/erp/system/permissions',
      auth: 'admin',
      viewport: { width: 1280, height: 900 },
      verify: async (page) => {
        const applied = []
        page.on('request', (request) => {
          if (
            !request.url().includes('/rpc/customer_config') ||
            request.method() !== 'POST'
          ) {
            return
          }
          const body = request.postDataJSON()
          if (body?.method === 'apply_approval_settings') {
            applied.push(body.params)
          }
        })
        await expectHeading(page, '权限管理')
        await waitForApprovalResponsibilityInputs(page)
        await page.getByRole('tab', { name: /审批责任/ }).click()
        const row = page.getByRole('row', { name: /销售订单审批/ })
        await expectText(row, '全部审批')
        const edit = async () => {
          await row.getByRole('button', { name: '调整', exact: true }).click()
          return page
            .getByRole('dialog')
            .filter({ hasText: '调整销售订单审批' })
        }
        const apply = async () => {
          await page
            .getByRole('button', { name: '保存并生效', exact: true })
            .click()
          await expectText(
            page.locator('.erp-approval-responsibility__header'),
            '已生效'
          )
        }
        let dialog = await edit()
        await dialog
          .getByRole('radio', { name: '按金额审批', exact: true })
          .check()
        await dialog
          .getByLabel('审批起始金额', { exact: true })
          .fill('10000.01')
        await expectText(dialog, '金额不完整或币种不匹配时仍需审批')
        await assertAntdModalCentered(
          page,
          dialog,
          'permission-center-approval-amount-condition'
        )
        await dialog
          .getByRole('button', { name: '保存调整', exact: true })
          .click()
        await expectText(row, 'CNY 10,000.01 起需审批')
        await apply()
        assert.deepEqual(
          applied
            .at(-1)
            .items.find((item) => item.approval_key === 'sales_order')
            .condition,
          { mode: 'amount', amount: '10000.01', currency: 'CNY' }
        )
        dialog = await edit()
        assert.equal(
          await dialog.getByLabel('审批起始金额', { exact: true }).inputValue(),
          '10000.01'
        )
        await dialog.getByLabel('审批起始金额', { exact: true }).fill('0')
        await dialog
          .getByRole('button', { name: '保存调整', exact: true })
          .click()
        await expectText(row, '全部审批')
        await apply()
        assert.deepEqual(
          applied
            .at(-1)
            .items.find((item) => item.approval_key === 'sales_order')
            .condition,
          { mode: 'all', amount: '', currency: '' }
        )
        dialog = await edit()
        assert.equal(
          await dialog
            .getByRole('radio', { name: '全部审批', exact: true })
            .isChecked(),
          true
        )
        assert.equal(
          await dialog.getByLabel('审批起始金额', { exact: true }).count(),
          0
        )
        await dialog
          .getByRole('radio', { name: '按金额审批', exact: true })
          .check()
        await dialog.getByLabel('审批起始金额', { exact: true }).fill('50000')
        await dialog.getByRole('button', { name: '取消', exact: true }).click()
        const confirm = page
          .getByRole('dialog')
          .filter({ hasText: '放弃本次审批设置调整' })
        await confirm
          .getByRole('button', { name: '放弃调整', exact: true })
          .click()
        await expectText(row, '全部审批')
        await page
          .getByRole('row', { name: /出货财务放行/ })
          .getByRole('button', { name: '调整', exact: true })
          .click()
        const shipment = page
          .getByRole('dialog')
          .filter({ hasText: '调整出货财务放行' })
        await expectText(shipment, '出货财务确认保持全部审批')
        assert.equal(
          await shipment.getByRole('radio', { name: '按金额审批' }).count(),
          0
        )
        await shipment
          .getByRole('button', { name: '取消', exact: true })
          .click()
        dialog = await edit()
        await dialog
          .getByRole('radio', { name: '按金额审批', exact: true })
          .check()
        await dialog
          .getByLabel('审批起始金额', { exact: true })
          .fill('10000.01')
        await dialog
          .getByRole('button', { name: '保存调整', exact: true })
          .click()
        await apply()
        await expectText(row, 'CNY 10,000.01 起需审批')
        await assertNoHorizontalOverflow(
          page,
          'permission-center-approval-amount-condition'
        )
        const geometry = await row
          .locator('td')
          .first()
          .evaluate((cell) => {
            const table = cell.closest('.ant-table-content')
            return {
              cellLeft: cell.getBoundingClientRect().left,
              tableLeft: table.getBoundingClientRect().left,
              width: table.clientWidth,
              scrollWidth: table.scrollWidth,
              scrollLeft: table.scrollLeft,
              position: getComputedStyle(cell).position,
            }
          })
        assert(
          geometry.cellLeft >= geometry.tableLeft - 1,
          `审批事项列被截断：${JSON.stringify(geometry)}`
        )
      },
    },
    {
      name: 'permission-center-approval-confirmation-recovery',
      path: '/erp/system/permissions',
      auth: 'admin',
      approvalSettingsMode: 'confirmation_recovery',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        const approvalReadRequests = new Set()
        let lastApprovalReadActivity = Date.now()
        const approvalReadMethod = (request) => {
          if (!request.url().includes('/rpc/customer_config')) return ''
          return request.postDataJSON()?.method || ''
        }
        const trackApprovalRead = (request) => {
          if (approvalReadMethod(request) !== 'get_approval_settings') return
          approvalReadRequests.add(request)
          lastApprovalReadActivity = Date.now()
        }
        const finishApprovalRead = (request) => {
          if (!approvalReadRequests.delete(request)) return
          lastApprovalReadActivity = Date.now()
        }
        page.on('request', trackApprovalRead)
        page.on('requestfinished', finishApprovalRead)
        page.on('requestfailed', finishApprovalRead)
        const waitForApprovalReadsIdle = async () => {
          const deadline = Date.now() + 5_000
          while (
            approvalReadRequests.size > 0 ||
            Date.now() - lastApprovalReadActivity < 250
          ) {
            assert(
              Date.now() < deadline,
              `审批责任读取未在 5 秒内稳定: in_flight=${approvalReadRequests.size}`
            )
            await page.waitForTimeout(25)
          }
        }
        const waitForApprovalResponse = (method, predicate = () => true) =>
          page.waitForResponse(async (response) => {
            if (
              !response.url().includes('/rpc/customer_config') ||
              response.status() !== 200
            ) {
              return false
            }
            const requestBody = response.request().postDataJSON() || {}
            if (requestBody.method !== method) return false
            const responseBody = await response.json()
            return predicate(responseBody)
          })
        await expectHeading(page, '权限管理')
        await waitForApprovalResponsibilityInputs(page)
        const initialSettingsRead = waitForApprovalResponse(
          'get_approval_settings',
          (body) => Array.isArray(body?.result?.data?.approval_settings?.items)
        )
        await page.getByRole('tab', { name: /审批责任/ }).click()
        await initialSettingsRead
        await waitForApprovalReadsIdle()
        await page
          .getByRole('row', { name: /销售订单审批/ })
          .getByRole('button', { name: '调整' })
          .click()
        const dialog = page
          .getByRole('dialog')
          .filter({ hasText: '调整销售订单审批' })
        await dialog.waitFor({ state: 'visible', timeout: 10_000 })
        await dialog.evaluate(async (node) => {
          await Promise.all(
            node
              .getAnimations({ subtree: true })
              .map((animation) => animation.finished.catch(() => undefined))
          )
        })
        const backupTier = dialog
          .locator('.erp-approval-responsibility-form__tier')
          .nth(1)
        const backupRoleSelect = backupTier.locator('.ant-select').first()
        await selectApprovalRoleOption(page, backupRoleSelect, {
          label: '审批恢复备用岗位',
          roleLabel: 'PMC',
        })
        await dialog
          .getByRole('button', { name: '保存调整', exact: true })
          .click()
        await page
          .getByRole('button', { name: '保存并生效', exact: true })
          .click({ trial: true })
        const applyResponse = waitForApprovalResponse(
          'apply_approval_settings',
          (body) => body?.result?.data?.revision?.status === 'active'
        )
        const failedReadbackResponse = waitForApprovalResponse(
          'get_approval_settings',
          (body) => !Array.isArray(body?.result?.data?.approval_settings?.items)
        )
        await page
          .getByRole('button', { name: '保存并生效', exact: true })
          .click()
        await Promise.all([applyResponse, failedReadbackResponse])
        await expectText(page, '正在等待确认生效结果')
        const confirmButton = page
          .locator('.erp-approval-responsibility__actions button:visible')
          .filter({ hasText: /^确认并生效$/u })
        await confirmButton.waitFor({ state: 'visible', timeout: 10_000 })
        await page.waitForFunction(() => {
          const button = Array.from(
            document.querySelectorAll(
              '.erp-approval-responsibility__actions button'
            )
          ).find(
            (candidate) =>
              String(candidate.textContent || '').trim() === '确认并生效'
          )
          return (
            button instanceof HTMLButtonElement &&
            !button.disabled &&
            !button.classList.contains('ant-btn-loading')
          )
        })
        const confirmedReadbackResponse = waitForApprovalResponse(
          'get_approval_settings',
          (body) => Array.isArray(body?.result?.data?.approval_settings?.items)
        )
        await confirmButton.click()
        await confirmedReadbackResponse
        await expectText(page, '审批设置已保存并生效')
        await expectText(page, '已生效')
      },
    },
    {
      name: 'permission-center-approval-role-permission-drift',
      path: '/erp/system/permissions',
      auth: 'admin',
      approvalSettingsMode: 'role_permission_drift',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '权限管理')
        await waitForApprovalResponsibilityInputs(page)
        await page.getByRole('tab', { name: /审批责任/ }).click()
        await page
          .getByRole('row', { name: /销售订单审批/ })
          .getByRole('button', { name: '调整' })
          .click()
        const dialog = page
          .getByRole('dialog')
          .filter({ hasText: '调整销售订单审批' })
        await expectText(dialog, '当前设置包含不可用岗位')
        await expectText(dialog, '业务：未开启审批功能')
        await expectText(dialog, '当前只有“老板”具备审批资格')
        await assertTextAbsent(dialog, 'sales')

        const primaryRoleSelect = dialog
          .locator('.erp-approval-responsibility-form__tier')
          .first()
          .locator('.ant-select')
          .first()
        await expectText(primaryRoleSelect, '业务（未开启审批功能）')
        await primaryRoleSelect.click()
        const dropdown = page.locator('.ant-select-dropdown:visible')
        await dropdown.waitFor({ state: 'visible' })
        await dropdown
          .locator('.ant-select-item-option-disabled')
          .filter({ hasText: /^业务（未开启审批功能）$/u })
          .waitFor({ state: 'visible' })
        await dropdown
          .locator('.ant-select-item-option-disabled')
          .filter({ hasText: /^老板（已用于升级责任）$/u })
          .waitFor({ state: 'visible' })
        const disabledRoleLabels = await dropdown
          .locator(
            '.ant-select-item-option-disabled .ant-select-item-option-content'
          )
          .allTextContents()
        const normalizedDisabledRoleLabels = disabledRoleLabels.map((label) =>
          label.trim()
        )
        assert.equal(
          normalizedDisabledRoleLabels.filter(
            (label) => label === '业务（未开启审批功能）'
          ).length,
          1,
          `业务岗位应唯一标记为缺少审批资格: ${JSON.stringify(disabledRoleLabels)}`
        )
        assert.equal(
          normalizedDisabledRoleLabels.filter(
            (label) => label === '老板（已用于升级责任）'
          ).length,
          1,
          `老板岗位应唯一标记为升级责任冲突: ${JSON.stringify(disabledRoleLabels)}`
        )
        const visibleRoleLabels = await dropdown
          .locator('.ant-select-item-option-content')
          .allTextContents()
        assert.equal(
          visibleRoleLabels.some((label) => label.trim() === 'sales'),
          false,
          `岗位候选不应显示原始 role key: ${JSON.stringify(visibleRoleLabels)}`
        )
        await page.keyboard.press('Escape')

        await dialog
          .getByRole('button', { name: '保存调整', exact: true })
          .click()
        await expectText(dialog, '当前岗位未开启审批功能，请先在岗位设置中开启')
        await assertAntdModalCentered(
          page,
          dialog,
          'permission-center-approval-role-permission-drift'
        )
        await assertNoHorizontalOverflow(
          page,
          'permission-center-approval-role-permission-drift'
        )
      },
    },
    {
      name: 'permission-center-desktop',
      path: '/erp/system/permissions?__style_l1_permission_draft_delay=900',
      auth: 'admin',
      viewport: { width: 1486, height: 1058 },
      verify: async (page) => {
        await expectHeading(page, '权限管理')
        await expectText(page, '岗位设置')
        await expectText(page, '员工账号')
        await expectText(page, '项功能已授权')
        await expectText(page, '仓库范围')
        await expectText(page, '敏感字段')
        await expectText(page, '岗位导航')
        await assertTextAbsent(page, '先设置岗位，再分配账号')
        await assertTextAbsent(page, '已分配账号')
        await assertTextAbsent(page, '重点功能')
        await assertTextAbsent(page, '先看菜单结果，再选择页内操作')
        await assertTextAbsent(page, '菜单入口和页内操作分开控制')
        const financeEffectiveAccessRead = page.waitForResponse((response) => {
          if (
            !response.url().includes('/rpc/admin') ||
            response.status() !== 200
          ) {
            return false
          }
          const body = response.request().postDataJSON()
          return (
            body?.method === 'effective_role_access' &&
            body?.params?.role_key === 'finance' &&
            !Array.isArray(body?.params?.permission_keys)
          )
        })
        await page
          .locator('.erp-role-template-card')
          .filter({ hasText: '财务' })
          .click()
        await financeEffectiveAccessRead
        await page.evaluate(
          () =>
            new Promise((resolve) =>
              requestAnimationFrame(() => requestAnimationFrame(resolve))
            )
        )
        await expectText(
          page.locator('.erp-permission-capability-summary'),
          '项功能'
        )
        await expectText(
          page.locator('.erp-role-center-detail__head'),
          '关联账号'
        )
        assert.equal(
          await page.locator('.erp-role-center-metrics').count(),
          0,
          '权限中心不应保留重复的四块统计卡'
        )
        const permissionHelpTrigger = page.getByRole('button', {
          name: '菜单与操作说明',
        })
        // 全量串行运行会继承上一场景的鼠标位置；先清除 hover，再用 focus
        // 确定性打开浮层。AntD 可能替换 portal 节点，后续始终解析当前可见节点。
        await page.mouse.move(20, 20)
        await permissionHelpTrigger.blur()
        await page.waitForFunction(() =>
          [...document.querySelectorAll('.erp-permission-help-popover')].every(
            (node) => !node.checkVisibility()
          )
        )
        await permissionHelpTrigger.focus()
        await page.waitForFunction(() => {
          const popovers = [
            ...document.querySelectorAll('.erp-permission-help-popover'),
          ]
          return popovers.some((node) => {
            const rect = node.getBoundingClientRect()
            return (
              node.checkVisibility() && rect.width >= 240 && rect.height >= 90
            )
          })
        })
        const permissionHelpPopover = page
          .locator('.erp-permission-help-popover:visible')
          .filter({ hasText: '当前调整仅预览，保存岗位设置后生效' })
          .last()
        await permissionHelpPopover.waitFor({ state: 'visible' })
        await expectText(permissionHelpPopover, '菜单与操作')
        await expectText(permissionHelpPopover, '查看类功能决定菜单是否出现')
        await expectText(
          permissionHelpPopover,
          '当前调整仅预览，保存岗位设置后生效'
        )
        const permissionHelpBox = await permissionHelpPopover.boundingBox()
        assert(
          permissionHelpBox &&
            permissionHelpBox.width >= 240 &&
            permissionHelpBox.height >= 90,
          `菜单与操作浮层尺寸异常: ${JSON.stringify(permissionHelpBox)}`
        )
        await permissionHelpPopover.screenshot({
          path: 'output/playwright/style-l1/permission-center-help-popover-card.png',
        })
        await page.screenshot({
          path: 'output/playwright/style-l1/permission-center-help-popover.png',
          fullPage: false,
        })
        await permissionHelpTrigger.blur()
        await page.mouse.move(20, 20)
        await permissionHelpPopover.waitFor({
          state: 'hidden',
          timeout: 5000,
        })
        await page.getByRole('button', { name: '关联账号（3）' }).click()
        const associatedAccounts = page.locator('.erp-role-associated-accounts')
        await expectText(associatedAccounts, '当前岗位账号')
        await expectText(associatedAccounts, '只读核对')
        await expectText(associatedAccounts, 'style-l1-admin')
        await expectText(associatedAccounts, '始终启用')
        await expectText(associatedAccounts, '超级管理员')
        await expectText(associatedAccounts, 'multi-role-employee')
        await expectText(associatedAccounts, '启用')
        await expectText(associatedAccounts, '业务')
        await expectText(associatedAccounts, 'suspended-finance')
        await expectText(associatedAccounts, '临时停用')
        await associatedAccounts.screenshot({
          path: 'output/playwright/style-l1/permission-center-associated-accounts.png',
        })
        await associatedAccounts
          .getByRole('button', { name: '去员工账号管理' })
          .click()
        const filteredAdminSearch =
          page.getByPlaceholder('搜索姓名、员工账号、手机号或岗位')
        assert.equal(
          await filteredAdminSearch.inputValue(),
          '财务',
          '从岗位详情进入员工账号时应按当前岗位筛选'
        )
        await expectText(page, '命中 3/7 个员工账号')
        await page.getByRole('tab', { name: /岗位设置/u }).click()
        await page.getByRole('tab', { name: /岗位设置/u }).click()
        assert.equal(
          await page.getByRole('textbox', { name: '搜索功能或页面' }).count(),
          1,
          '权限中心应提供按业务名称查找功能的入口'
        )
        const selectedOnlySwitch = page.getByRole('switch', {
          name: '只看已选',
        })
        await selectedOnlySwitch.click()
        assert.equal(
          await page.locator('.erp-permission-checklist__section').count(),
          2,
          '只看已选保留已选功能所在业务域'
        )
        await selectedOnlySwitch.click()
        const productionToggle = page.locator(
          '[data-permission-module="production"] .erp-permission-checklist__toggle'
        )
        await productionToggle.focus()
        await page.keyboard.press('Enter')
        assert.equal(
          await productionToggle.getAttribute('aria-expanded'),
          'false'
        )
        await page.keyboard.press('Enter')
        assert.equal(
          await productionToggle.getAttribute('aria-expanded'),
          'true'
        )
        const permissionModuleTitles = await page
          .locator('.erp-permission-checklist__toggle .ant-typography')
          .allTextContents()
        for (const expectedTitle of [
          '敏感字段',
          '物料清单（BOM）',
          '生产执行',
        ]) {
          assert(
            permissionModuleTitles.includes(expectedTitle),
            `权限中心缺少业务分类“${expectedTitle}”: ${JSON.stringify(permissionModuleTitles)}`
          )
        }
        assert(
          !permissionModuleTitles.includes('其他功能') &&
            !permissionModuleTitles.includes('未分类功能') &&
            new Set(permissionModuleTitles).size ===
              permissionModuleTitles.length,
          `权限中心不应出现重复或未分类模块: ${JSON.stringify(permissionModuleTitles)}`
        )
        assert.equal(
          await page
            .locator(
              '[data-permission-module="system"], [data-permission-module="customer_config"], [data-permission-module="process_runtime"]'
            )
            .count(),
          0,
          '控制面权限不得出现在业务岗位可用功能中'
        )
        const financePermissionSection = page.locator(
          '.erp-permission-checklist__section[data-permission-module="finance"]'
        )
        await expectText(financePermissionSection, '确认应收')
        const receivablesMenuRow = financePermissionSection
          .locator(
            '.erp-permission-row__content[data-menu-key="receivables"][data-permission-kind="menu"]'
          )
          .filter({ hasText: '查看应收' })
          .first()
        const receivablesActionRow = financePermissionSection
          .locator(
            '.erp-permission-row__content[data-permission-kind="action"]'
          )
          .filter({ hasText: '确认应收' })
          .first()
        assert.match(
          await receivablesMenuRow.getAttribute('title'),
          /菜单入口/u
        )
        assert.match(
          await receivablesMenuRow.getAttribute('title'),
          /应收管理不显示/u
        )
        assert.match(
          await receivablesActionRow.getAttribute('title'),
          /页内操作/u
        )
        assert.match(
          await receivablesActionRow.getAttribute('title'),
          /需先开启：查看应收/u
        )
        await assertTextAbsent(receivablesActionRow, '常用工作')
        await assertTextAbsent(receivablesActionRow, '更多功能')
        const receivableConfirmCheckbox = page.getByRole('checkbox', {
          name: /确认应收/u,
        })
        await receivableConfirmCheckbox.click()
        await receivableConfirmCheckbox.click()
        await expectText(
          page,
          '为避免有操作却进不了页面，已同时开启“应收管理”入口（查看应收）'
        )
        assert.match(
          await receivablesMenuRow.getAttribute('title'),
          /应收管理待核对/u
        )
        assert.doesNotMatch(
          await receivablesMenuRow.getAttribute('title'),
          /常用工作/u
        )
        await assertTextAbsent(page, '预计显示')
        await assertTextAbsent(page, '草稿会显示')
        const pendingStatusBox = await receivablesMenuRow
          .locator('xpath=ancestor::td[1]')
          .boundingBox()
        assert(pendingStatusBox, '菜单状态标签应有可测量尺寸')
        await financePermissionSection.screenshot({
          path: 'output/playwright/style-l1/permission-center-finance-inline-results.png',
        })
        assert.equal(
          await receivablesMenuRow
            .locator('xpath=ancestor::label[1]')
            .getByRole('checkbox')
            .isChecked(),
          true,
          '选择确认应收后应自动补齐查看应收页面入口'
        )
        await page.waitForTimeout(1300)
        assert.match(
          await receivablesMenuRow.getAttribute('title'),
          /应收管理显示/u
        )
        assert.match(
          await receivablesMenuRow.getAttribute('title'),
          /常用工作/u
        )
        await assertTextAbsent(page, '预计显示')
        const settledStatusBox = await receivablesMenuRow
          .locator('xpath=ancestor::td[1]')
          .boundingBox()
        assert(settledStatusBox, '后端核对后的菜单状态标签应有可测量尺寸')
        assert(
          Math.abs(settledStatusBox.width - pendingStatusBox.width) < 0.5,
          `菜单状态标签宽度不应抖动：${pendingStatusBox.width} -> ${settledStatusBox.width}`
        )
        assert(
          Math.abs(settledStatusBox.height - pendingStatusBox.height) < 0.5,
          `菜单状态标签高度不应抖动：${pendingStatusBox.height} -> ${settledStatusBox.height}`
        )
        await selectedOnlySwitch.click()
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'auto' }))
        await page.waitForTimeout(400)
        const latestMessage = page.locator('.ant-message-notice').last()
        if (await latestMessage.count()) {
          await latestMessage.waitFor({ state: 'detached', timeout: 5000 })
        }
        await page.screenshot({
          path: 'output/playwright/style-l1/permission-center-final-desktop.png',
          fullPage: false,
        })
        await selectedOnlySwitch.click()
        await page
          .locator('.erp-role-template-card')
          .filter({ hasText: '业务' })
          .click()
        await expectText(page, '放弃未保存的岗位调整？')
        await page.getByRole('button', { name: '放弃修改' }).click()
        await page.getByRole('tab', { name: /岗位设置/u }).click()
        await page.getByRole('combobox', { name: '仓库范围模式' }).waitFor()
        await expectText(page, '仓库范围')
        await page
          .getByRole('button', { name: '敏感字段', exact: true })
          .click()
        await expectText(page, '电话、地址、单价、金额和结算资料由独立权限控制')
        await expectText(page, '销售商业')
        await page.waitForTimeout(350)
        await page.screenshot({
          path: 'output/playwright/style-l1/permission-center-policy-tabs.png',
          fullPage: true,
        })
        await page
          .getByRole('dialog')
          .getByRole('button', { name: '关闭', exact: true })
          .click()
        await page.getByRole('tab', { name: /岗位导航/u }).click()
        const navigationWorkspaceTabs = page.locator(
          '.erp-role-navigation-workspace-tabs'
        )
        const navigationLayoutTab = navigationWorkspaceTabs.getByRole('tab', {
          name: '菜单排列',
        })
        const pageAccessTab = navigationWorkspaceTabs.getByRole('tab', {
          name: /^页面访问$/u,
        })
        assert.equal(
          await navigationLayoutTab.getAttribute('aria-selected'),
          'true',
          '页面与导航应默认进入岗位导航'
        )
        await pageAccessTab.waitFor({ state: 'visible' })
        await expectText(page, '设置岗位导航')
        await expectText(page, '系统按岗位推荐常用模块')
        await expectText(page, '导航位置预览')
        await expectText(page, '工作中心')
        await expectText(page, '常用工作')
        await expectText(page, '工具与查询')
        await expectText(page, '系统与帮助')
        await assertTextAbsent(page, '更多功能')
        await expectText(page, '工作台')
        await expectText(page, '任务看板')
        await expectText(page, '基础资料')
        await expectText(page, '销售管理')
        await expectText(page, '库存管理')
        await expectText(page, '历史记录中心')
        await expectText(page, '帮助中心')
        await pageAccessTab.click()
        await expectText(page, '已按公司当前启用配置核对')
        await expectText(page, '页面内的操作还会单独校验')
        await expectText(page, '显示')
        const permissionMapMetrics = await page.evaluate(() => {
          const table = document.querySelector(
            '.erp-role-effective-access .ant-table'
          )
          const holder = table?.querySelector('.ant-table-container')
          return {
            width: table?.getBoundingClientRect().width || 0,
            scrollWidth: holder?.scrollWidth || 0,
            clientWidth: holder?.clientWidth || 0,
          }
        })
        assert(
          permissionMapMetrics.width > 0 &&
            permissionMapMetrics.scrollWidth <=
              permissionMapMetrics.clientWidth + 1,
          `权限地图表格出现横向溢出: ${JSON.stringify(permissionMapMetrics)}`
        )
        await navigationLayoutTab.click()
        const navigationPreviewMetrics = await page.evaluate(() => {
          const preview = document.querySelector('.erp-role-navigation-preview')
          const grid = preview?.querySelector(
            '.erp-role-navigation-preview__grid'
          )
          const groups = grid?.querySelectorAll(
            '.erp-role-navigation-preview__group'
          )
          const columns = grid
            ? window.getComputedStyle(grid).gridTemplateColumns
            : ''
          return {
            hasPreview: Boolean(preview),
            groupCount: groups?.length || 0,
            columns,
            scrollWidth: preview?.scrollWidth || 0,
            clientWidth: preview?.clientWidth || 0,
          }
        })
        assert(
          navigationPreviewMetrics.hasPreview &&
            navigationPreviewMetrics.groupCount === 5 &&
            navigationPreviewMetrics.columns.split(' ').length === 3 &&
            navigationPreviewMetrics.scrollWidth <=
              navigationPreviewMetrics.clientWidth + 1,
          `权限中心导航预览桌面布局异常: ${JSON.stringify(navigationPreviewMetrics)}`
        )
        await page.locator('.erp-role-navigation-preview').screenshot({
          path: 'output/playwright/style-l1/permission-center-navigation-preview.png',
        })
        await page
          .locator(
            '.erp-role-navigation-editor__head > .ant-select .ant-select-selector'
          )
          .click()
        await page
          .locator('.ant-select-dropdown:visible .ant-select-item-option')
          .filter({ hasText: '自定义布局' })
          .click()
        await page.keyboard.press('Escape')
        await page.waitForTimeout(350)
        const moveToSecondary = page.getByRole('button', {
          name: '移到其他 库存管理',
        })
        await moveToSecondary.focus()
        await page.keyboard.press('Enter')
        await page.getByRole('button', { name: '移到常用 库存管理' }).focus()
        await page.keyboard.press('Enter')
        await page.getByRole('button', { name: '上移 库存管理' }).click()
        await page.getByRole('button', { name: '上移 库存管理' }).click()
        const customPrimaryOrder = await page.evaluate(() => {
          const groups = Array.from(
            document.querySelectorAll('.erp-role-navigation-preview__group')
          )
          const primaryGroup = groups.find((group) =>
            String(group.textContent || '').includes('常用工作')
          )
          return Array.from(
            primaryGroup?.querySelectorAll('.ant-tag') || []
          ).map((item) =>
            String(item.textContent || '')
              .trim()
              .replace(/^\d+\.\s*/u, '')
          )
        })
        assert.deepEqual(
          customPrimaryOrder,
          ['库存管理', '基础资料', '销售管理'],
          `权限中心应即时按自定义顺序预览常用入口: ${JSON.stringify(customPrimaryOrder)}`
        )
        await page.locator('.erp-role-navigation-editor').screenshot({
          path: 'output/playwright/style-l1/permission-center-navigation-custom.png',
        })
        await page.getByRole('button', { name: '保存岗位设置' }).click()
        await expectText(page, '岗位设置已更新，相关账号刷新后生效')
        await expectText(page, '自定义布局')
        await expectText(page, '已保存')
        await page.waitForTimeout(350)
        await pageAccessTab.click()
        await page.screenshot({
          path: 'output/playwright/style-l1/permission-center-permission-map.png',
          fullPage: true,
        })
        await expectText(page, '查看功能与页面操作的对应关系')
        await expectText(page, '可进入')
        await expectText(page, '不可进入')
        await page.getByRole('tab', { name: /岗位设置/u }).click()
        await assertTextAbsent(page, '当前角色权限尚未保存')
        await assertTextAbsent(page, '角色名称可按岗位调整，职责权限保持统一')
        await assertTextAbsent(page, 'system.role.permission.manage')
        await assertTextAbsent(page, '当前客户角色模板')
        await assertTextAbsent(page, '客户模板')
        await assertTextAbsent(page, '不同甲方')
        await expectText(page, '保存岗位设置')
        await assertNoDuplicatedAdminPageTitle(page, {
          scenarioName: 'permission-center-desktop',
        })
        const roleCenterMetrics = await page.evaluate(() => {
          const activeTab = document.querySelector(
            '.erp-permission-tabs [role=tab][aria-selected=true]'
          )
          const tabIndicator = document.querySelector('.erp-permission-tabs')
          const activeTabStyle =
            activeTab instanceof HTMLElement
              ? window.getComputedStyle(activeTab)
              : null
          const tabIndicatorStyle =
            tabIndicator instanceof HTMLElement
              ? window.getComputedStyle(tabIndicator, '::before')
              : null
          const adminSection = document.querySelector(
            '.erp-permission-section--admins'
          )
          const roleSection = document.querySelector(
            '.erp-permission-section--roles'
          )
          const layout = document.querySelector('.erp-role-center-layout')
          const sidebar = document.querySelector('.erp-role-center-sidebar')
          const detail = document.querySelector('.erp-role-center-detail')
          const checklist = document.querySelector('.erp-permission-checklist')
          const capabilityOverview = document.querySelector(
            '.erp-role-capability-overview'
          )
          const adminRect = adminSection?.getBoundingClientRect()
          const roleRect = roleSection?.getBoundingClientRect()
          const layoutRect = layout?.getBoundingClientRect()
          const sidebarRect = sidebar?.getBoundingClientRect()
          const detailRect = detail?.getBoundingClientRect()
          return {
            hasAdminSection: Boolean(adminSection),
            hasRoleSection: Boolean(roleSection),
            activeTabText: String(activeTab?.textContent || '').trim(),
            activeTabTransitionDuration:
              activeTabStyle?.transitionDuration || '',
            tabIndicatorReady:
              tabIndicator?.getAttribute('data-sliding-ready') === 'true',
            tabIndicatorTransitionDuration:
              tabIndicatorStyle?.transitionDuration || '',
            adminTop: adminRect?.top || 0,
            adminHeight: adminRect?.height || 0,
            roleTop: roleRect?.top || 0,
            roleHeight: roleRect?.height || 0,
            hasLayout: Boolean(layout),
            layoutWidth: layoutRect?.width || 0,
            sidebarWidth: sidebarRect?.width || 0,
            detailWidth: detailRect?.width || 0,
            documentScrollWidth: document.documentElement.scrollWidth,
            documentClientWidth: document.documentElement.clientWidth,
            checklistScrollWidth: checklist?.scrollWidth || 0,
            checklistClientWidth: checklist?.clientWidth || 0,
            matrixColumns: document.querySelectorAll(
              '.erp-permission-matrix thead th'
            ).length,
            capabilityScrollWidth: capabilityOverview?.scrollWidth || 0,
            capabilityClientWidth: capabilityOverview?.clientWidth || 0,
          }
        })
        assert(
          roleCenterMetrics.activeTabText.includes('岗位设置') &&
            roleCenterMetrics.hasRoleSection &&
            roleCenterMetrics.roleHeight > 0,
          `权限管理默认应先显示岗位设置 tab: ${JSON.stringify(roleCenterMetrics)}`
        )
        assert(
          String(roleCenterMetrics.activeTabTransitionDuration)
            .split(',')
            .some((part) => Number.parseFloat(part) > 0) &&
            roleCenterMetrics.tabIndicatorReady &&
            String(roleCenterMetrics.tabIndicatorTransitionDuration)
              .split(',')
              .some((part) => Number.parseFloat(part) > 0),
          `权限管理 tab 缺少全局平滑过渡: ${JSON.stringify(roleCenterMetrics)}`
        )
        assert(
          roleCenterMetrics.hasLayout &&
            roleCenterMetrics.sidebarWidth >= 256 &&
            roleCenterMetrics.sidebarWidth <= 264 &&
            roleCenterMetrics.detailWidth >= 640,
          `权限管理角色中心布局宽度异常: ${JSON.stringify(roleCenterMetrics)}`
        )
        assert(
          roleCenterMetrics.documentScrollWidth <=
            roleCenterMetrics.documentClientWidth + 1,
          `权限管理页面出现横向溢出: ${JSON.stringify(roleCenterMetrics)}`
        )
        assert(
          roleCenterMetrics.matrixColumns === 5 &&
            roleCenterMetrics.checklistScrollWidth <=
              roleCenterMetrics.checklistClientWidth + 1,
          `权限管理权限矩阵出现横向溢出: ${JSON.stringify(roleCenterMetrics)}`
        )
        assert(
          roleCenterMetrics.capabilityScrollWidth <=
            roleCenterMetrics.capabilityClientWidth + 1,
          `权限管理岗位能力视图出现横向溢出: ${JSON.stringify(roleCenterMetrics)}`
        )
        await assertPermissionChecklistItemLayout(page, {
          scenarioName: 'permission-center-desktop',
        })
        await expectText(page, '只看已选')
        await page
          .locator(
            '.erp-permission-checklist__actions input[type=checkbox]:not(:disabled):not(:checked)'
          )
          .first()
          .click()
        await expectText(page, '有未保存调整')
        const roleCards = page.locator('.erp-role-template-card')
        if ((await roleCards.count()) > 1) {
          await page
            .locator('.erp-role-template-card[aria-pressed="false"]')
            .first()
            .click()
          await expectText(page, '放弃未保存的岗位调整？')
          await page.getByRole('button', { name: '继续编辑' }).click()
          await expectText(page, '有未保存调整')
        }
        await page.getByRole('tab', { name: /员工账号/ }).click()
        await expectText(page, '切换页面前要放弃未保存的修改吗？')
        await page.getByRole('button', { name: '放弃修改' }).click()
        await page.getByRole('textbox', { name: '搜索员工账号' }).waitFor()
        await expectText(page, '创建员工账号')
        await expectText(page, '超级管理员')
        const adminTabMetrics = await page.evaluate(() => {
          const activeTab = document.querySelector(
            '.erp-permission-tabs [role=tab][aria-selected=true]'
          )
          const adminSection = document.querySelector(
            '.erp-permission-section--admins'
          )
          const table = document.querySelector(
            '.erp-permission-section--admins .ant-table'
          )
          const adminRect = adminSection?.getBoundingClientRect()
          const tableRect = table?.getBoundingClientRect()
          return {
            activeTabText: String(activeTab?.textContent || '').trim(),
            hasAdminSection: Boolean(adminSection),
            adminTop: adminRect?.top || 0,
            adminHeight: adminRect?.height || 0,
            tableWidth: tableRect?.width || 0,
            documentScrollWidth: document.documentElement.scrollWidth,
            documentClientWidth: document.documentElement.clientWidth,
          }
        })
        assert(
          adminTabMetrics.activeTabText.includes('员工账号') &&
            adminTabMetrics.hasAdminSection &&
            adminTabMetrics.adminHeight > 0,
          `权限管理切换员工账号 tab 后应显示账号表: ${JSON.stringify(adminTabMetrics)}`
        )
        assert(
          adminTabMetrics.documentScrollWidth <=
            adminTabMetrics.documentClientWidth + 1,
          `权限管理员工账号 tab 出现横向溢出: ${JSON.stringify(adminTabMetrics)}`
        )
        const adminSearch =
          page.getByPlaceholder('搜索姓名、员工账号、手机号或岗位')
        await adminSearch.fill('assistant')
        await expectText(page, '命中 1/7 个员工账号')
        const filteredTableText = await page
          .locator('.erp-permission-section--admins .ant-table-tbody')
          .innerText()
        assert(
          filteredTableText.includes('assistant-admin') &&
            !filteredTableText.includes('style-l1-admin'),
          `权限管理搜索结果不符合预期: ${filteredTableText}`
        )
        await adminSearch.fill('')
        await expectText(page, '共 7 个员工账号')
        await assertPaginationSizeChangerFocusStyle(page, {
          scenarioName: 'permission-center-desktop',
        })
        await assertShellRefreshButton(page, {
          scenarioName: 'permission-center-desktop',
          expectVisible: true,
        })
        await page.getByRole('button', { name: '刷新当前页' }).click()
        await expectText(page, '当前页面数据已刷新')
        await page.getByRole('button', { name: '创建员工账号' }).click()
        await expectText(page, '创建员工账号')
        await expectText(page, '初始密码')
        await expectText(page, '岗位')
        await expectText(page, '选择一个或多个岗位')
        await assertAdminRoleModalLayout(page, {
          scenarioName: 'permission-center-create-modal',
          title: '创建员工账号',
        })
        await assertTextAbsent(page, '搜索菜单权限名称或路径')
        await page
          .locator('.erp-business-form-page:not([hidden])')
          .filter({ hasText: '创建员工账号' })
          .last()
          .getByRole('button', { name: '返回列表' })
          .click()
        await page
          .getByRole('row', { name: /assistant-admin/ })
          .getByRole('button', { name: '重置密码' })
          .click()
        const resetModal = page
          .locator('.ant-modal-content')
          .filter({ hasText: '重置密码：业务助理（assistant-admin）' })
          .last()
        await resetModal.getByText('新密码').waitFor()
        await assertVisibleModalInputFocusStyle(page, {
          scenarioName: 'permission-center-reset-modal-focus',
          modalText: '重置密码：业务助理（assistant-admin）',
        })
        await resetModal
          .locator('.ant-input-affix-wrapper input')
          .fill('new-secret')
        await page
          .getByRole('button', { name: /重\s*置/ })
          .last()
          .click()
        await expectText(page, '已重置 业务助理（assistant-admin） 的密码')
        await page
          .getByRole('row', { name: /assistant-admin/ })
          .getByRole('button', { name: '离职注销' })
          .click()
        await expectText(page, '未完成的个人待办将退回原负责岗位')
        await expectText(page, '注销原因')
        await page
          .locator('.ant-modal-content')
          .filter({ hasText: '离职注销账号' })
          .last()
          .locator('textarea')
          .fill('员工离职')
        await page
          .locator('.ant-modal-content')
          .filter({ hasText: '离职注销账号' })
          .last()
          .getByRole('button', { name: '确认注销' })
          .click()
        await expectText(page, '账号已注销，1 项未完成待办已退回原岗位')
        const revokedRow = page.getByRole('row', { name: /assistant-admin/ })
        await expectText(revokedRow, '已注销')
        await expectText(revokedRow, '员工离职')
        await expectText(revokedRow, '已注销')
        const revokeButton = revokedRow.getByRole('button', { name: '已注销' })
        assert.equal(
          await revokeButton.isDisabled(),
          true,
          '已注销账号不能再次执行注销或通过普通启停恢复'
        )
      },
    },
    {
      name: 'permission-center-admin-dialogs',
      path: '/erp/system/permissions',
      auth: 'admin',
      viewport: { width: 1486, height: 1058 },
      verify: async (page) => {
        await expectHeading(page, '权限管理')
        await page.getByRole('tab', { name: /员工账号/u }).click()
        await expectText(page, '共 7 个员工账号')

        await page.getByRole('button', { name: '创建员工账号' }).click()
        const createModal = page
          .locator('.erp-business-form-page:not([hidden])')
          .filter({ hasText: '创建员工账号' })
          .last()
        await expectText(createModal, '初始密码')
        await assertAdminRoleModalLayout(page, {
          scenarioName: 'permission-center-admin-dialogs-create',
          title: '创建员工账号',
        })
        await closeBusinessFormPage(page, createModal)

        const assistantRow = page.getByRole('row', { name: /assistant-admin/ })
        await assistantRow.getByRole('button', { name: '分配岗位' }).click()
        const roleModal = page
          .locator('.ant-modal-content')
          .filter({ hasText: '分配岗位：业务助理（assistant-admin）' })
          .last()
        await expectText(
          roleModal,
          '选择多个岗位时，账号会合并这些岗位已开放的页面和操作。'
        )
        assert.equal(
          await roleModal.locator('.ant-alert').count(),
          0,
          '普通岗位说明不应使用 Alert 卡片'
        )
        await roleModal.locator('.ant-modal-footer button').first().click()

        await assistantRow.getByRole('button', { name: '修改资料' }).click()
        const phoneModal = page
          .locator('.erp-business-form-page:not([hidden])')
          .filter({ hasText: '修改资料：业务助理（assistant-admin）' })
          .last()
        await phoneModal.locator('input[inputmode="tel"]').fill('13700137000')
        await assertBusinessFormPage(page, phoneModal)
        await phoneModal.getByRole('button', { name: '返回列表' }).click()
        await page
          .getByRole('button', { name: '继续编辑', exact: true })
          .click()
        await page.locator('.ant-modal-confirm').waitFor({ state: 'hidden' })
        assert.equal(
          await phoneModal.locator('input[inputmode="tel"]').inputValue(),
          '13700137000'
        )
        await closeBusinessFormPage(page, phoneModal)

        await assistantRow.getByRole('button', { name: '重置密码' }).click()
        const resetModal = page
          .locator('.ant-modal-content')
          .filter({ hasText: '重置密码：业务助理（assistant-admin）' })
          .last()
        await resetModal.getByText('新密码').waitFor()
        await assertVisibleModalInputFocusStyle(page, {
          scenarioName: 'permission-center-admin-dialogs-reset',
          modalText: '重置密码：业务助理（assistant-admin）',
        })
        await resetModal
          .locator('.ant-input-affix-wrapper input')
          .fill('new-secret')
        await resetModal.getByRole('button', { name: /^重\s*置$/u }).click()
        await expectText(page, '已重置 业务助理（assistant-admin） 的密码')

        await assistantRow.getByRole('switch').click()
        const statusModal = page
          .locator('.ant-modal-content')
          .filter({ hasText: '临时停用账号' })
          .last()
        await expectText(statusModal, '将立即无法继续访问后台')
        await statusModal.locator('.ant-modal-footer button').first().click()

        await assistantRow.getByRole('button', { name: '离职注销' }).click()
        const revokeModal = page
          .locator('.ant-modal-content')
          .filter({ hasText: '离职注销账号' })
          .last()
        await expectText(revokeModal, '未完成的个人待办将退回原负责岗位')
        await revokeModal.locator('textarea').fill('员工离职')
        await revokeModal.getByRole('button', { name: '确认注销' }).click()
        await expectText(page, '账号已注销，1 项未完成待办已退回原岗位')

        const revokedRow = page.getByRole('row', { name: /assistant-admin/ })
        await expectText(revokedRow, '已注销')
        assert.equal(
          await revokedRow.getByRole('button', { name: '已注销' }).isDisabled(),
          true,
          '已注销账号不能重复注销'
        )
        await assertNoHorizontalOverflow(
          page,
          'permission-center-admin-dialogs'
        )
        await page.screenshot({
          path: 'output/playwright/style-l1/permission-center-admin-dialogs.png',
          fullPage: false,
        })
      },
    },
    ...['light', 'dark'].map((themeMode) => ({
      name: `permission-center-module-default-${themeMode}`,
      path: '/erp/system/permissions',
      auth: 'admin',
      themeMode,
      viewport:
        themeMode === 'dark'
          ? { width: 390, height: 844 }
          : { width: 1486, height: 1000 },
      verify: async (page) => {
        await page
          .locator('.erp-role-template-card')
          .filter({ hasText: '财务' })
          .click()
        for (const name of [
          '查看应收',
          '查看应付',
          '查看收付款',
          '查看对账',
          '查看发票',
        ]) {
          await page.getByRole('checkbox', { name, exact: true }).check()
        }
        await page.getByRole('tab', { name: '岗位导航', exact: true }).click()
        await page.locator('.erp-role-navigation-preview__grid').waitFor()
        const modeDropdown = await openControlledAntSelectDropdown(page, page.locator('.erp-role-navigation-editor__head > .ant-select:not(.ant-select-disabled)'), '岗位导航排列方式')
        await modeDropdown.locator('.ant-select-item-option').filter({ hasText: '自定义布局' }).click()
        await page.keyboard.press('Escape')
        const finance = page.locator(
          '[data-navigation-module="module:finance"]'
        )
        assert.equal(await finance.count(), 1)
        const defaultDropdown = await openControlledAntSelectDropdown(page, finance.locator('.ant-select'), '财务管理默认页面')
        const choices = defaultDropdown.locator('.ant-select-item-option')
        assert.equal(await choices.count(), 5)
        await choices.filter({ hasText: '收付款核销' }).click()
        await page.keyboard.press('Escape')
        assert.equal(
          await finance.getAttribute('data-navigation-path'),
          '/erp/finance/payments'
        )
        await page.getByRole('tab', { name: '页面访问', exact: true }).click()
        const moduleDropdown = await openControlledAntSelectDropdown(
          page,
          page.locator('.erp-role-effective-access__toolbar > .ant-select'),
          '筛选业务模块'
        )
        await selectVirtualizedAntOption(page, moduleDropdown, {
          label: '筛选业务模块',
          optionLabel: '财务管理（5）',
        })
        await page.keyboard.press('Escape')
        assert.equal(
          await page.locator('.erp-role-effective-access__page').count(),
          5
        )
        assert.equal(
          await page.locator('.erp-role-effective-access__module').count(),
          1
        )
        await page.getByRole('tab', { name: '菜单排列', exact: true }).click()
        const save = page.waitForRequest(
          (request) =>
            request.url().includes('/rpc/admin') &&
            request.postDataJSON()?.method === 'set_role_settings'
        )
        await page
          .getByRole('button', { name: '保存岗位设置', exact: true })
          .click()
        const { params } = (await save).postDataJSON()
        const allPaths = [
          ...params.primary_menu_paths,
          ...params.secondary_menu_paths,
        ]
        const financialPaths = allPaths.filter((value) =>
          value.startsWith('/erp/finance/')
        )
        assert.equal(financialPaths.length, 5)
        assert.equal(new Set(financialPaths).size, 5)
        assert.deepEqual(
          params.primary_menu_paths.filter((value) =>
            value.startsWith('/erp/finance/')
          ),
          ['/erp/finance/payments']
        )
        await expectText(page, '岗位设置已更新，相关账号刷新后生效')
        await page.reload()
        await page
          .locator('.erp-role-template-card')
          .filter({ hasText: '财务' })
          .click()
        await page.getByRole('tab', { name: '岗位导航', exact: true }).click()
        await page
          .locator(
            '[data-navigation-module="module:finance"][data-navigation-path="/erp/finance/payments"]'
          )
          .waitFor()
        assert.equal(await finance.count(), 1)
        await assertNoHorizontalOverflow(
          page,
          `permission-center-module-default-${themeMode}`
        )
        await page.screenshot({
          path: `output/playwright/style-l1/permission-center-module-default-${themeMode}.png`,
          fullPage: true,
        })
      },
    })),
    {
      name: 'permission-center-role-navigation-desktop',
      path: '/erp/system/permissions',
      auth: 'admin',
      viewport: { width: 1486, height: 1058 },
      verify: async (page) => {
        let effectiveAccessRequestCount = 0
        page.on('request', (request) => {
          if (
            request.url().includes('/rpc/admin') &&
            request.postDataJSON()?.method === 'effective_role_access'
          ) {
            effectiveAccessRequestCount += 1
          }
        })
        const readNavigationPreview = () =>
          page.evaluate(() => {
            return Array.from(
              document.querySelectorAll('.erp-role-navigation-preview__group')
            ).map((group) => ({
              title: String(
                group.querySelector('.ant-typography')?.textContent || ''
              ).trim(),
              items: Array.from(group.querySelectorAll('.ant-tag')).map(
                (item) =>
                  String(item.textContent || '')
                    .trim()
                    .replace(/^\d+\.\s*/u, '')
              ),
            }))
          })

        await expectHeading(page, '权限管理')
        await page
          .locator('.erp-role-template-card')
          .filter({ hasText: '业务' })
          .click()
        await page.getByRole('tab', { name: /岗位导航/u }).click()
        assert.equal(
          await page
            .getByRole('tab', { name: '菜单排列' })
            .getAttribute('aria-selected'),
          'true',
          '页面与导航应默认进入岗位导航'
        )
        await page.getByRole('tab', { name: /页面访问/u }).waitFor({
          state: 'visible',
        })
        await expectText(page, '设置岗位导航')
        await expectText(page, '系统按岗位推荐常用模块')
        await expectText(page, '导航位置预览')

        await page
          .locator(
            '.erp-role-navigation-editor__head > .ant-select .ant-select-selector'
          )
          .click()
        await page
          .locator('.ant-select-dropdown:visible .ant-select-item-option')
          .filter({ hasText: '自定义布局' })
          .click()
        await page.keyboard.press('Escape')
        await expectText(page, '常用工作需保留 1–5 个入口')

        const customLayoutMetrics = await page.evaluate(() => {
          const editor = document.querySelector('.erp-role-navigation-editor')
          const columns = editor?.querySelector(
            '.erp-role-navigation-editor__columns'
          )
          const columnItems = columns?.querySelectorAll(
            '.erp-role-navigation-editor__column'
          )
          return {
            columnCount: columnItems?.length || 0,
            gridTemplateColumns: columns
              ? window.getComputedStyle(columns).gridTemplateColumns
              : '',
            editorScrollWidth: editor?.scrollWidth || 0,
            editorClientWidth: editor?.clientWidth || 0,
          }
        })
        assert(
          customLayoutMetrics.columnCount === 2 &&
            customLayoutMetrics.gridTemplateColumns.split(' ').length === 2 &&
            customLayoutMetrics.editorScrollWidth <=
              customLayoutMetrics.editorClientWidth + 1,
          `权限中心双列表桌面布局异常: ${JSON.stringify(customLayoutMetrics)}`
        )

        const moveSalesOrderToSecondary = page.getByRole('button', {
          name: '移到其他 销售管理',
        })
        await moveSalesOrderToSecondary.focus()
        await page.keyboard.press('Enter')
        assert.equal(
          await page
            .getByRole('button', { name: '移到常用 销售管理' })
            .evaluate((node) => node === document.activeElement),
          true
        )
        await page.getByRole('button', { name: '移到其他 基础资料' }).click()
        await page.getByRole('button', { name: '上移 基础资料' }).click()
        await page.getByRole('button', { name: '上移 基础资料' }).click()
        await page.getByRole('button', { name: '上移 销售管理' }).click()
        assert.equal(
          await page
            .getByRole('button', { name: '上移 基础资料' })
            .isDisabled(),
          true,
          '同一导航区中第一项不可继续上移'
        )

        const draftPreview = await readNavigationPreview()
        assert.deepEqual(
          draftPreview.map((group) => group.title),
          ['工作中心', '常用工作', '业务模块', '工具与查询', '系统与帮助'],
          `权限中心自定义预览分组异常: ${JSON.stringify(draftPreview)}`
        )
        assert.deepEqual(
          draftPreview[1].items,
          ['库存管理'],
          `权限中心常用工作顺序异常: ${JSON.stringify(draftPreview)}`
        )
        assert.deepEqual(
          draftPreview.slice(2),
          [
            { title: '业务模块', items: ['基础资料', '销售管理', '出货管理'] },
            { title: '工具与查询', items: ['历史记录中心'] },
            { title: '系统与帮助', items: ['帮助中心'] },
          ],
          `权限中心其余入口应按同级业务分组预览: ${JSON.stringify(draftPreview)}`
        )
        await page.waitForTimeout(250)
        const accessRequestsBeforeTabSwitch = effectiveAccessRequestCount
        await page.getByRole('tab', { name: /页面访问/u }).click()
        await expectText(page, '显示')
        assert.equal(
          await page.getByText(/yoyoosun-customer-pack/u).count(),
          0,
          '配置版本不应继续占据页面访问主视觉'
        )
        await page.getByRole('button', { name: '查看配置版本' }).click()
        await expectText(page, '当前配置版本')
        await page.keyboard.press('Escape')
        await page
          .locator('.erp-role-effective-access__toolbar .ant-segmented-item')
          .filter({ hasText: '不可进入' })
          .click()
        const blockedRows = await page
          .locator(
            '.erp-role-effective-access__table .erp-role-effective-access__page'
          )
          .evaluateAll((rows) =>
            rows.map((row) => String(row.textContent || '').trim())
          )
        assert(
          blockedRows.length > 0 &&
            blockedRows.every((row) => row.includes('不可进入')),
          `页面访问筛选没有只保留不可进入页面: ${JSON.stringify(blockedRows)}`
        )
        await page.locator('.erp-role-effective-access').screenshot({
          path: 'output/playwright/style-l1/permission-center-role-navigation-desktop-access.png',
        })
        await page.getByRole('tab', { name: '菜单排列' }).click()
        await page.waitForTimeout(250)
        assert.equal(
          effectiveAccessRequestCount,
          accessRequestsBeforeTabSwitch,
          '岗位导航与页面访问切换不应重复请求权限解释'
        )
        const draftPreviewAfterTabSwitch = await readNavigationPreview()
        assert.deepEqual(
          draftPreviewAfterTabSwitch,
          draftPreview,
          `二级 Tab 切换后不应丢失菜单草稿: ${JSON.stringify(draftPreviewAfterTabSwitch)}`
        )
        await page.locator('.erp-role-navigation-editor').screenshot({
          path: 'output/playwright/style-l1/permission-center-role-navigation-desktop-editor.png',
        })

        const saveRequestPromise = page.waitForRequest((request) => {
          if (!request.url().includes('/rpc/admin')) return false
          return request.postDataJSON()?.method === 'set_role_settings'
        })
        await page.getByRole('button', { name: '保存岗位设置' }).click()
        const saveRequest = await saveRequestPromise
        const saveParams = saveRequest.postDataJSON()?.params || {}
        assert.equal(saveParams.role_key, 'sales')
        assert.equal(saveParams.navigation_mode, 'custom')
        assert.deepEqual(saveParams.primary_menu_paths, [
          '/erp/warehouse/inventory',
        ])
        assert.deepEqual(saveParams.secondary_menu_paths, [
          '/erp/master/partners/customers',
          '/erp/sales/project-orders/sales-orders',
          '/erp/warehouse/shipping-release',
        ])
        assert(
          Array.isArray(saveParams.permission_keys) &&
            saveParams.permission_keys.length > 0 &&
            Array.isArray(saveParams.data_scopes) &&
            saveParams.data_scopes.length === 1 &&
            Number(saveParams.expected_version) > 0,
          `岗位设置必须整包提交权限、范围、布局和版本: ${JSON.stringify(saveParams)}`
        )
        await expectText(page, '岗位设置已更新，相关账号刷新后生效')
        await expectText(page, '已保存')

        const reopenedRBACResponsePromise = page.waitForResponse((response) => {
          if (!response.url().includes('/rpc/admin')) return false
          return response.request().postDataJSON()?.method === 'rbac_options'
        })
        await page.reload()
        const reopenedRBACResponse = await reopenedRBACResponsePromise
        const reopenedRBACPayload = await reopenedRBACResponse.json()
        const reopenedSalesRole =
          reopenedRBACPayload?.result?.data?.roles?.find(
            (role) => role?.role_key === 'sales'
          ) || null
        assert.equal(reopenedSalesRole?.navigation_mode, 'custom')
        assert.deepEqual(reopenedSalesRole?.primary_menu_paths, [
          '/erp/warehouse/inventory',
        ])
        assert.deepEqual(reopenedSalesRole?.secondary_menu_paths, [
          '/erp/master/partners/customers',
          '/erp/sales/project-orders/sales-orders',
          '/erp/warehouse/shipping-release',
        ])
        await expectHeading(page, '权限管理')
        await page
          .locator('.erp-role-template-card')
          .filter({ hasText: '业务' })
          .click()
        await page.getByRole('tab', { name: /岗位导航/u }).click()
        assert.equal(
          await page
            .getByRole('tab', { name: '菜单排列' })
            .getAttribute('aria-selected'),
          'true',
          '整页刷新后页面与导航仍应默认进入岗位导航'
        )
        await page
          .locator('.erp-role-navigation-preview__head .ant-tag')
          .filter({ hasText: '自定义布局' })
          .waitFor({ state: 'visible', timeout: 10_000 })
        const reopenedPreview = await readNavigationPreview()
        assert.deepEqual(
          reopenedPreview[1].items,
          ['库存管理'],
          `重新打开后常用工作顺序未读回: ${JSON.stringify(reopenedPreview)}`
        )
        assert.deepEqual(
          reopenedPreview,
          draftPreview,
          `重新打开后完整导航位置未读回: ${JSON.stringify(reopenedPreview)}`
        )
        await assertNoHorizontalOverflow(
          page,
          'permission-center-role-navigation-desktop'
        )
        await page.screenshot({
          path: 'output/playwright/style-l1/permission-center-role-navigation-desktop-readback.png',
          fullPage: true,
        })
      },
    },
    {
      name: 'permission-center-navigation-mobile-dark',
      path: '/erp/system/permissions',
      auth: 'admin',
      themeMode: 'dark',
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        await expectHeading(page, '权限管理')
        await page
          .locator('.erp-role-template-card')
          .filter({ hasText: '财务' })
          .click()
        assert.equal(
          await page.getByRole('textbox', { name: '搜索功能或页面' }).count(),
          1,
          '移动端权限中心应提供与桌面一致的功能搜索'
        )
        const mobileSearch = page.getByRole('textbox', {
          name: '搜索功能或页面',
        })
        await mobileSearch.fill('生产执行')
        assert.equal(
          await page.locator('.erp-permission-checklist__section').count(),
          1
        )
        await expectText(page.locator('.erp-permission-checklist'), '生产执行')
        await mobileSearch.fill('')
        const financePermissionSection = page.locator(
          '.erp-permission-checklist__section[data-permission-module="finance"]'
        )
        await financePermissionSection.scrollIntoViewIfNeeded()
        const financeMenuMetrics = await financePermissionSection.evaluate(
          (section) => {
            const list = section.querySelector('.erp-permission-matrix__row')
            const rows = section.querySelectorAll('.erp-permission-row')
            return {
              display: list ? window.getComputedStyle(list).display : '',
              rowCount: rows.length,
              scrollWidth: list?.scrollWidth || 0,
              clientWidth: list?.clientWidth || 0,
            }
          }
        )
        assert(
          financeMenuMetrics.display === 'grid' &&
            financeMenuMetrics.rowCount > 0 &&
            financeMenuMetrics.scrollWidth <=
              financeMenuMetrics.clientWidth + 1,
          `权限中心权限行移动端布局异常: ${JSON.stringify(financeMenuMetrics)}`
        )
        await financePermissionSection.screenshot({
          path: 'output/playwright/style-l1/permission-center-finance-inline-mobile-dark.png',
        })
        await page.getByRole('button', { name: '关联账号（3）' }).click()
        const mobileAssociatedAccounts = page.locator(
          '.erp-role-associated-accounts'
        )
        await expectText(mobileAssociatedAccounts, '当前岗位账号')
        await expectText(mobileAssociatedAccounts, 'style-l1-admin')
        await assertNoHorizontalOverflow(
          page,
          'permission-center-associated-accounts-mobile-dark'
        )
        await mobileAssociatedAccounts.screenshot({
          path: 'output/playwright/style-l1/permission-center-associated-accounts-mobile-dark.png',
        })
        await page
          .getByRole('dialog')
          .getByRole('button', { name: '关闭', exact: true })
          .click()
        await page
          .locator('.erp-role-template-card')
          .filter({ hasText: '业务' })
          .click()
        await page.getByRole('tab', { name: /岗位导航/u }).click()
        assert.equal(
          await page
            .getByRole('tab', { name: '菜单排列' })
            .getAttribute('aria-selected'),
          'true',
          '移动端页面与导航应默认进入岗位导航'
        )
        await page.getByRole('tab', { name: /页面访问/u }).click()
        await expectText(page, '显示')
        await page
          .locator('.erp-role-effective-access__toolbar .ant-segmented-item')
          .filter({ hasText: /^可进入/u })
          .first()
          .click()
        const mobileAccessMetrics = await page.evaluate(() => {
          const nestedTabs = document.querySelector(
            '.erp-role-navigation-workspace-tabs > .ant-tabs-nav'
          )
          const segmented = document.querySelector(
            '.erp-role-effective-access__toolbar .ant-segmented'
          )
          const table = document.querySelector(
            '.erp-role-effective-access__table .ant-table-content'
          )
          return {
            tabsScrollWidth: nestedTabs?.scrollWidth || 0,
            tabsClientWidth: nestedTabs?.clientWidth || 0,
            segmentedScrollWidth: segmented?.scrollWidth || 0,
            segmentedClientWidth: segmented?.clientWidth || 0,
            tableScrollWidth: table?.scrollWidth || 0,
            tableClientWidth: table?.clientWidth || 0,
            documentScrollWidth: document.documentElement.scrollWidth,
            documentClientWidth: document.documentElement.clientWidth,
          }
        })
        assert(
          mobileAccessMetrics.tabsScrollWidth <=
            mobileAccessMetrics.tabsClientWidth + 1 &&
            mobileAccessMetrics.segmentedScrollWidth <=
              mobileAccessMetrics.segmentedClientWidth + 1 &&
            mobileAccessMetrics.tableScrollWidth >=
              mobileAccessMetrics.tableClientWidth &&
            mobileAccessMetrics.documentScrollWidth <=
              mobileAccessMetrics.documentClientWidth + 1,
          `页面访问移动端布局异常: ${JSON.stringify(mobileAccessMetrics)}`
        )
        await page.locator('.erp-role-effective-access').screenshot({
          path: 'output/playwright/style-l1/permission-center-navigation-mobile-dark-access.png',
        })
        await page.getByRole('tab', { name: '菜单排列' }).click()
        await expectText(page, '设置岗位导航')
        await expectText(page, '导航位置预览')
        await expectText(page, '工具与查询')
        await expectText(page, '系统与帮助')
        await assertTextAbsent(page, '更多功能')
        await expectText(page, '历史记录中心')
        await expectText(page, '帮助中心')
        await page
          .locator(
            '.erp-role-navigation-editor__head > .ant-select .ant-select-selector'
          )
          .click()
        await page
          .locator('.ant-select-dropdown:visible .ant-select-item-option')
          .filter({ hasText: '自定义布局' })
          .click()
        await page.keyboard.press('Escape')
        await page.waitForTimeout(350)
        await expectText(page, '常用工作需保留 1–5 个入口')
        const metrics = await page.evaluate(() => {
          const preview = document.querySelector('.erp-role-navigation-preview')
          const editor = document.querySelector('.erp-role-navigation-editor')
          const orderItem = editor?.querySelector(
            '.erp-role-navigation-editor__order-item'
          )
          const grid = preview?.querySelector(
            '.erp-role-navigation-preview__grid'
          )
          const previewRect = preview?.getBoundingClientRect()
          return {
            columns: grid
              ? window.getComputedStyle(grid).gridTemplateColumns
              : '',
            previewScrollWidth: preview?.scrollWidth || 0,
            previewClientWidth: preview?.clientWidth || 0,
            previewLeft: previewRect?.left || 0,
            previewRight: previewRect?.right || 0,
            previewWidth: previewRect?.width || 0,
            viewportWidth: window.innerWidth,
            documentScrollWidth: document.documentElement.scrollWidth,
            documentClientWidth: document.documentElement.clientWidth,
            editorScrollWidth: editor?.scrollWidth || 0,
            editorClientWidth: editor?.clientWidth || 0,
            orderItemDirection: orderItem
              ? window.getComputedStyle(orderItem).flexDirection
              : '',
          }
        })
        assert(
          metrics.columns.split(' ').length === 1 &&
            metrics.previewScrollWidth <= metrics.previewClientWidth + 1 &&
            metrics.previewLeft >= -1 &&
            metrics.previewRight <= metrics.viewportWidth + 1 &&
            metrics.previewWidth <= metrics.viewportWidth + 1 &&
            metrics.documentScrollWidth <= metrics.documentClientWidth + 1,
          `权限中心导航预览移动端布局异常: ${JSON.stringify(metrics)}`
        )
        assert(
          metrics.editorScrollWidth <= metrics.editorClientWidth + 1 &&
            metrics.orderItemDirection === 'column',
          `权限中心常用入口编辑器移动端布局异常: ${JSON.stringify(metrics)}`
        )
        await assertERPThemeMode(page, {
          scenarioName: 'permission-center-navigation-mobile-dark',
          expectedMode: 'dark',
          expectedEffectiveTheme: 'dark',
        })
        await assertNoHorizontalOverflow(
          page,
          'permission-center-navigation-mobile-dark'
        )
        await page.locator('.erp-role-navigation-preview').screenshot({
          path: 'output/playwright/style-l1/permission-center-navigation-mobile-dark-preview.png',
        })
        await page.locator('.erp-role-navigation-editor').screenshot({
          path: 'output/playwright/style-l1/permission-center-navigation-mobile-dark-editor.png',
        })
      },
    },
  ]
}
