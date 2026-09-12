import { assertBusinessFormPage, closeBusinessFormPage } from './businessFormPageAssertions.mjs'
import { createBusinessColumnPriorityScenarios } from './businessColumnPriorityScenarios.mjs'
export function createBusinessPageContractScenarios({
  customerRuntimeEffectiveSession,
  expectHeading,
  gotoScenarioPath,
  clickERPThemeOption,
  assertERPThemeMode,
  openControlledAntSelectDropdown,
  assert,
  selectVirtualizedAntOption,
  expectButton,
  expectText,
  verifyBusinessModuleColumnOrderDialog,
  assertNoHorizontalOverflow,
  assertDarkThemeContrast,
  path,
  outputDir,
}) {
  const expectAdminMenuText = async (page, text) => {
    const menu = page.locator('.erp-admin-menu').first()
    await menu.waitFor({ state: 'visible', timeout: 10_000 })
    const menuText = await menu.evaluate((node) =>
      String(node.textContent || '')
        .replace(/\s+/gu, ' ')
        .trim()
    )
    assert(
      menuText.includes(text),
      `后台菜单应展示“${text}”，当前菜单文本：${menuText}`
    )
  }
  const assertClassifiedBusinessFormPage = async (
    page,
    {
      buttonName,
      titleText,
      expectedHeadings,
      scenarioName,
      expectDark = false,
    }
  ) => {
    const stableURL = page.url()
    await page.getByRole('button', { name: buttonName }).click()
    const modal = page
      .locator('.erp-business-form-page:not([hidden])')
      .last()
    await modal.waitFor({ state: 'visible', timeout: 10_000 })
    await expectText(modal, titleText)
    await assertBusinessFormPage(page, modal)

    const metrics = await modal.evaluate((node) => {
      const form = node.querySelector('.erp-business-action-form')
      const formRect = form?.getBoundingClientRect()
      const sections = Array.from(
        form?.querySelectorAll('.erp-business-action-form__section-title') || []
      ).map((section) => {
        const rect = section.getBoundingClientRect()
        const style = window.getComputedStyle(section)
        const dividerStyle = window.getComputedStyle(section, '::after')
        return {
          text: String(section.textContent || '').trim(),
          role: section.getAttribute('role') || '',
          ariaLevel: section.getAttribute('aria-level') || '',
          top: rect.top,
          left: rect.left,
          right: rect.right,
          width: rect.width,
          color: style.color,
          dividerWidth: Number.parseFloat(dividerStyle.width || '0'),
          dividerHeight: Number.parseFloat(dividerStyle.height || '0'),
          dividerColor: dividerStyle.backgroundColor,
        }
      })
      const modalBody = node.querySelector('.erp-business-form-page__body')
      return {
        form: formRect
          ? {
              left: formRect.left,
              right: formRect.right,
              width: formRect.width,
            }
          : null,
        sections,
        modalOverflow: node.scrollWidth - node.clientWidth,
        bodyOverflow: modalBody
          ? modalBody.scrollWidth - modalBody.clientWidth
          : 0,
        documentOverflow:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      }
    })

    assert.deepEqual(
      metrics.sections.map((section) => section.text),
      expectedHeadings,
      `${scenarioName} 分区标题顺序错误`
    )
    assert(metrics.form, `${scenarioName} 缺少业务表单网格`)
    assert(
      metrics.sections.every(
        (section, index) =>
          section.role === 'heading' &&
          section.ariaLevel === '3' &&
          Math.abs(section.left - metrics.form.left) <= 1 &&
          Math.abs(section.right - metrics.form.right) <= 1 &&
          Math.abs(section.width - metrics.form.width) <= 2 &&
          section.dividerWidth >= 24 &&
          section.dividerHeight >= 1 &&
          !['transparent', 'rgba(0, 0, 0, 0)'].includes(section.dividerColor) &&
          Boolean(section.color) &&
          (index === 0 || section.top > metrics.sections[index - 1].top)
      ),
      `${scenarioName} 分区标题语义、跨列、分隔线或顺序异常: ${JSON.stringify(
        metrics
      )}`
    )
    assert(
      metrics.modalOverflow <= 1 &&
        metrics.bodyOverflow <= 1 &&
        metrics.documentOverflow <= 1,
      `${scenarioName} 表单或页面出现横向溢出: ${JSON.stringify(metrics)}`
    )

    const firstControl = modal
      .locator(
        'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), [role="combobox"]:not([aria-disabled="true"])'
      )
      .first()
    await firstControl.focus()
    assert.equal(
      await firstControl.evaluate(
        (node) =>
          node === document.activeElement ||
          node.contains(document.activeElement)
      ),
      true,
      `${scenarioName} 首个可编辑控件无法获得焦点`
    )
    if (expectDark) {
      await assertDarkThemeContrast(page, {
        scenarioName,
        selector: '.erp-business-form-page:not([hidden])',
      })
    }
    await assertNoHorizontalOverflow(page, scenarioName)
    await modal.screenshot({
      path: path.resolve(outputDir, `${scenarioName}.png`),
    })
    await closeBusinessFormPage(page, modal)
    assert.equal(page.url(), stableURL, `${scenarioName} 返回列表不应改写 URL`)
  }
  return [
    ...createBusinessColumnPriorityScenarios({
      assert,
      customerRuntimeEffectiveSession,
      gotoScenarioPath,
      assertNoHorizontalOverflow,
      outputDir,
      path,
    }),
    {
      name: 'business-form-section-classification-readonly',
      path: '/erp/sales/project-orders/sales-orders',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        const salesHeadings = [
          '订单与客户', '联系人与负责人', '结算条件',
          '税费与运费条件', '交付与收货', '其他说明',
        ]
        const paymentHeadings = ['往来与金额', '账户与凭据']

        await expectHeading(page, '销售订单')
        await assertClassifiedBusinessFormPage(page, {
          buttonName: '新建订单',
          titleText: '新建销售订单',
          expectedHeadings: salesHeadings,
          scenarioName: 'business-form-sections-sales-desktop',
        })
        await assertClassifiedBusinessFormPage(page, {
          buttonName: '新建订单',
          titleText: '新建销售订单',
          expectedHeadings: salesHeadings,
          scenarioName: 'business-form-sections-sales-desktop-reopen',
        })

        await gotoScenarioPath(page, '/erp/finance/payments', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '收付款与核销')
        await assertClassifiedBusinessFormPage(page, {
          buttonName: '登记收付款',
          titleText: '登记收付款',
          expectedHeadings: paymentHeadings,
          scenarioName: 'business-form-sections-payment-desktop',
        })

        await page.setViewportSize({ width: 720, height: 900 })
        await clickERPThemeOption(page, '暗色')
        await gotoScenarioPath(page, '/erp/sales/project-orders/sales-orders', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '销售订单')
        await assertERPThemeMode(page, {
          scenarioName: 'business-form-sections-tablet-dark',
          expectedMode: 'dark',
          expectedEffectiveTheme: 'dark',
        })
        await assertClassifiedBusinessFormPage(page, {
          buttonName: '新建订单',
          titleText: '新建销售订单',
          expectedHeadings: salesHeadings,
          scenarioName: 'business-form-sections-sales-tablet-dark',
          expectDark: true,
        })

        await gotoScenarioPath(page, '/erp/finance/payments', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '收付款与核销')
        await assertClassifiedBusinessFormPage(page, {
          buttonName: '登记收付款',
          titleText: '登记收付款',
          expectedHeadings: paymentHeadings,
          scenarioName: 'business-form-sections-payment-tablet-dark',
          expectDark: true,
        })
      },
    },
    {
      name: 'history-source-selector-classification-readonly',
      path: '/erp/history',
      auth: 'admin',
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        pages: [
          ...new Set([
            ...customerRuntimeEffectiveSession.pages,
            'history-records',
          ]),
        ],
      },
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '历史记录中心')
        const historySelect = page.getByRole('combobox', {
          name: '历史记录类型',
        })
        const historySelectRoot = historySelect.locator(
          'xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " ant-select ")][1]'
        )
        const historyDropdown = await openControlledAntSelectDropdown(
          page,
          historySelectRoot,
          '历史记录类型'
        )
        await historyDropdown
          .locator('.ant-select-item-group')
          .filter({ hasText: '业务单据与版本' })
          .waitFor({ state: 'visible', timeout: 10_000 })
        assert.deepEqual(
          (
            await historyDropdown
              .locator('.ant-select-item-group')
              .allTextContents()
          ).map((label) => label.trim()),
          ['基础资料', '业务单据与版本']
        )
        const expectedHistoryOptionLabels = [
          '客户档案',
          '供应商与加工厂',
          '材料档案',
          '产品档案',
          '产品规格',
          '加工环节',
          '销售订单',
          '采购订单',
          '委外订单',
          '生产订单',
          'BOM 版本',
        ]
        const observedHistoryOptionLabels = []
        const observedHistoryOptionLabelSet = new Set()
        const collectVisibleHistoryOptions = async () => {
          const labels = await historyDropdown
            .locator('.ant-select-item-option')
            .allTextContents()
          for (const label of labels) {
            const normalizedLabel = label.trim()
            if (!observedHistoryOptionLabelSet.has(normalizedLabel)) {
              observedHistoryOptionLabelSet.add(normalizedLabel)
              observedHistoryOptionLabels.push(normalizedLabel)
            }
          }
        }
        const historyListHolder = historyDropdown.locator(
          '.rc-virtual-list-holder'
        )
        const historyScrollMetrics = await historyListHolder.evaluate(
          (node) => ({
            clientHeight: node.clientHeight,
            scrollHeight: node.scrollHeight,
          })
        )
        const historyMaxScrollTop = Math.max(
          0,
          historyScrollMetrics.scrollHeight - historyScrollMetrics.clientHeight
        )
        const historyScrollStep = Math.max(
          1,
          Math.floor(historyScrollMetrics.clientHeight / 2)
        )
        for (
          let scrollTop = 0;
          scrollTop < historyMaxScrollTop;
          scrollTop += historyScrollStep
        ) {
          await historyListHolder.evaluate((node, nextScrollTop) => {
            node.scrollTop = nextScrollTop
          }, scrollTop)
          await page.waitForTimeout(50)
          await collectVisibleHistoryOptions()
        }
        await historyListHolder.evaluate((node, nextScrollTop) => {
          node.scrollTop = nextScrollTop
        }, historyMaxScrollTop)
        await page.waitForTimeout(50)
        await collectVisibleHistoryOptions()
        assert.deepEqual(
          observedHistoryOptionLabels,
          expectedHistoryOptionLabels,
          '历史记录类型分组必须按正式顺序精确覆盖 11 个可读来源'
        )
        await historyListHolder.evaluate((node) => {
          node.scrollTop = 0
          node.dispatchEvent(new Event('scroll', { bubbles: true }))
        })
        await page.waitForTimeout(100)
        await historySelect.press('Escape')
        await historyDropdown.waitFor({ state: 'hidden', timeout: 10_000 })
        await historySelectRoot.locator('.ant-select-selector').click()
        await historyDropdown.waitFor({ state: 'visible', timeout: 10_000 })
        await selectVirtualizedAntOption(page, historyDropdown, {
          label: '历史记录类型',
          optionLabel: '销售订单',
        })
        await page.waitForFunction(
          () =>
            new URLSearchParams(window.location.search).get('source') ===
            'sales_orders'
        )
        assert.equal(
          String(
            await historySelectRoot
              .locator('.ant-select-selection-item')
              .textContent()
          ).trim(),
          '销售订单'
        )
        await historySelectRoot.locator('.ant-select-selector').click()
        await historyDropdown.waitFor({ state: 'visible', timeout: 10_000 })
        assert.equal(
          String(
            await historySelectRoot
              .locator('.ant-select-selection-item')
              .textContent()
          ).trim(),
          '销售订单',
          '重新打开历史来源下拉后必须保留 URL 对应选项'
        )
        await historySelect.press('Escape')
        await historyDropdown.waitFor({ state: 'hidden', timeout: 10_000 })
      },
    },
    {
      name: 'workflow-assignment-selector-classification-readonly',
      path: '/erp/task-board',
      auth: 'admin',
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        pages: ['task-board'],
        actions: [
          'erp.workbench.read',
          'workflow.task.read',
          'workflow.task.update',
          'workflow.task.complete',
          'workflow.task.assign',
        ],
        workflow_visible_owner_role_keys_by_capability: {
          'workflow.task.read': ['warehouse'],
          'workflow.task.update': ['warehouse'],
          'workflow.task.complete': ['warehouse'],
        },
      },
      workflowTaskFixtures: [
        {
          id: 9811,
          task_code: 'STYLE-L1-CLASSIFICATION-9811',
          task_group: 'workflow-contract',
          task_name: '下拉分类只读验收任务',
          source_type: 'workflow-contract',
          source_id: 9811,
          source_no: 'CLASSIFICATION-9811',
          task_status_key: 'ready',
          owner_role_key: 'warehouse',
          assignee_id: 1,
          version: 1,
          payload: { source_snapshot: 'unchanged' },
        },
      ],
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '任务看板')
        const assignmentTaskCard = page
          .locator('.erp-task-board-card')
          .filter({ hasText: '下拉分类只读验收任务' })
          .first()
        await assignmentTaskCard.waitFor({ state: 'visible', timeout: 10_000 })
        await assignmentTaskCard.click()
        const assignmentDrawer = page.locator('.erp-task-action-drawer')
        await assignmentDrawer.waitFor({ state: 'visible', timeout: 10_000 })
        await assignmentDrawer.getByRole('tab', { name: /选择处理/u }).click()
        await assignmentDrawer.getByRole('radio', { name: /转交任务/u }).click()
        const assignmentSelect = assignmentDrawer.getByRole('combobox', {
          name: '转交去向',
        })
        await assignmentSelect.click()
        const assignmentDropdown = page.locator('.ant-select-dropdown:visible')
        await assignmentDropdown.waitFor({ state: 'visible', timeout: 10_000 })
        assert.deepEqual(
          await assignmentDropdown
            .locator('.ant-select-item-group')
            .allTextContents(),
          ['岗位共同待办', '指定员工']
        )
        assert.equal(
          await assignmentDropdown.locator('.ant-select-item-option').count(),
          2,
          '转交去向必须同时展示岗位共同待办和合格员工'
        )
        await assignmentSelect.press('Escape')
        await assignmentDropdown.waitFor({ state: 'hidden', timeout: 10_000 })
        await assignmentSelect.click()
        await assignmentDropdown.waitFor({ state: 'visible', timeout: 10_000 })
        await assignmentDropdown
          .locator('.ant-select-item-option')
          .filter({ hasText: 'warehouse-backup · 仓库' })
          .click()
        assert.equal(
          String(
            await assignmentDrawer
              .locator('.erp-task-action-drawer__assignment')
              .locator('.ant-select-selection-item')
              .textContent()
          ).trim(),
          'warehouse-backup · 仓库'
        )
        await assignmentSelect
          .locator(
            'xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " ant-select ")][1]'
          )
          .locator('.ant-select-selector')
          .click()
        await assignmentDropdown.waitFor({ state: 'visible', timeout: 10_000 })
        await assignmentSelect.press('Escape')
        await assignmentDropdown.waitFor({ state: 'hidden', timeout: 10_000 })
        await assignmentDrawer.locator('.ant-drawer-close').click()
        await assignmentDrawer.waitFor({ state: 'hidden', timeout: 10_000 })
      },
    },
    {
      name: 'business-menu-groups-desktop',
      path: '/erp/sales/project-orders/sales-orders',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectButton(page, '新建订单')
        await expectText(page, '当前操作')
        await expectText(page, '订单明细')
        await expectText(page, '工作台')
        await expectText(page, '任务看板')
        await expectText(page, '业务看板')
        await expectText(page, '基础资料')
        await expectText(page, '客户档案')
        await expectText(page, '供应商与加工厂')
        await expectText(page, '产品档案')
        await expectText(page, '销售管理')
        await expectText(page, '销售订单')
        await expectText(page, '产品工程')
        await expectText(page, '物料清单（BOM）')
        await expectText(page, '采购管理')
        await expectText(page, '采购订单')
        await expectText(page, '质检管理')
        await expectText(page, '质量检验')
        await expectText(page, '库存管理')
        await expectText(page, '入库管理')
        await expectText(page, '库存台账')
        await expectText(page, '委外管理')
        await expectText(page, '委外订单')
        await expectText(page, '生产管理')
        await expectText(page, '生产排程')
        await expectText(page, '生产异常处置')
        await expectText(page, '出货管理')
        await expectText(page, '出货放行')
        await expectText(page, '财务管理')
        await expectText(page, '应收管理')
        await expectText(page, '导出筛选结果')
        await expectText(page, '列顺序')
        await expectText(page, '运营工具')
        await expectText(page, '模板打印中心')
        await verifyBusinessModuleColumnOrderDialog(page, {
          moduleKey: 'sales-orders',
          heading: '销售订单',
        })
        await page.locator('.erp-admin-menu').evaluate((node) => {
          node.scrollTop = node.scrollHeight
        })
        await expectAdminMenuText(page, '系统管理')
        await expectText(page, '权限管理')
        const menu = page.locator('.erp-admin-menu')
        assert.equal(
          await menu.getByText('异常处理', { exact: true }).count(),
          0,
          '侧栏不应再显示已并入工作台和任务看板的“异常处理”入口'
        )
        assert.equal(
          await menu.getByText('客户/供应商', { exact: true }).count(),
          0,
          '侧栏不应再显示旧“客户/供应商”正式入口'
        )
        assert.equal(
          await menu.getByText('订单/款式立项', { exact: true }).count(),
          0,
          '侧栏不应再显示旧“订单/款式立项”正式入口'
        )
        for (const retiredGroup of ['采购/仓储', '生产环节', '财务环节']) {
          assert.equal(
            await page.getByText(retiredGroup, { exact: true }).count(),
            0,
            `侧栏不应再显示旧“${retiredGroup}”组合业务分组`
          )
        }
        assert.equal(
          await page.getByText('流程与真源', { exact: true }).count(),
          0,
          '侧栏不应再显示“流程与真源”分组'
        )
        assert.equal(
          await page.getByText('开发与验收', { exact: true }).count(),
          0,
          '侧栏不应再显示“开发与验收”分组'
        )
        await expectText(page, '使用帮助')
        await expectText(page, '岗位使用帮助')
        assert.equal(
          await page.getByText('高级文档', { exact: true }).count(),
          0,
          '侧栏不应再显示“高级文档”入口'
        )
      },
    },
    {
      name: 'print-template-business-entry-ownership',
      path: '/erp/purchase/material-bom',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '物料清单（BOM）')
        await expectText(page, '当前操作')
        for (const label of ['打印物料明细', '打印色卡', '打印作业指导书']) {
          await expectButton(page, label)
        }
        const bomActionMetrics = await page.evaluate(() => {
          const bar = document.querySelector(
            '.erp-business-selection-action-bar__actions'
          )
          const buttons = Array.from(bar?.querySelectorAll('button') || []).map(
            (button) => ({
              text: String(button.textContent || '')
                .replace(/\s+/g, ' ')
                .trim(),
              disabled: button.disabled,
            })
          )
          return {
            found: Boolean(bar),
            clientWidth: bar?.clientWidth || 0,
            scrollWidth: bar?.scrollWidth || 0,
            buttons,
          }
        })
        assert(
          bomActionMetrics.found &&
            bomActionMetrics.scrollWidth <= bomActionMetrics.clientWidth + 1,
          `BOM 当前操作区应容纳三套工程资料打印入口: ${JSON.stringify(
            bomActionMetrics
          )}`
        )

        await gotoScenarioPath(page, '/erp/purchase/processing-contracts', {
          waitUntil: 'domcontentloaded',
        })
        await expectHeading(page, '委外订单')
        await expectButton(page, '加工合同打印')
        await expectButton(page, '作业指导书打印')
        const outsourcingActionMetrics = await page.evaluate(() => {
          const bar = document.querySelector(
            '.erp-business-selection-action-bar__actions'
          )
          return {
            found: Boolean(bar),
            text: String(bar?.textContent || '')
              .replace(/\s+/g, ' ')
              .trim(),
            clientWidth: bar?.clientWidth || 0,
            scrollWidth: bar?.scrollWidth || 0,
          }
        })
        assert(
          outsourcingActionMetrics.found &&
            outsourcingActionMetrics.text.includes('加工合同打印') &&
            outsourcingActionMetrics.text.includes('作业指导书打印') &&
            outsourcingActionMetrics.scrollWidth <=
              outsourcingActionMetrics.clientWidth + 1,
          `委外当前操作区应容纳加工合同和作业指导书打印入口: ${JSON.stringify(
            outsourcingActionMetrics
          )}`
        )
        await assertNoHorizontalOverflow(
          page,
          'print-template-business-entry-ownership'
        )
      },
    },
  ]
}
