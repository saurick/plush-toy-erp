function productionWipPermissions() {
  return [
    'pmc.plan.read',
    'pmc.plan.update',
    'production.fact.read',
    'production.completion.create',
    'production.wip.read',
    'production.wip.assign',
    'production.wip.execute',
    'production.wip.rework',
    'production.packaging_material.confirm',
    'outsourcing.order.read',
  ]
}

async function clickVisibleAction(page, text) {
  const pattern = text instanceof RegExp ? text : new RegExp(`^${text}$`, 'u')
  let action = page.locator('button:visible', { hasText: pattern }).first()
  if ((await action.count()) === 0) {
    await page
      .locator('button:visible', { hasText: /更多操作/u })
      .first()
      .click()
    const drawer = page
      .locator('.erp-business-selection-action-drawer:visible')
      .last()
    await drawer.waitFor({ state: 'visible', timeout: 10_000 })
    action = drawer.locator('button:visible', { hasText: pattern }).first()
  }
  await action.waitFor({ state: 'visible', timeout: 10_000 })
  await action.click()
}

async function releaseProductionOrder(page, expectText) {
  await page.getByText('MO-STYLE-L1-20260713', { exact: true }).first().click()
  await clickVisibleAction(page, /发\s*布/u)
  await page.getByRole('button', { name: '确认发布' }).click()
  await expectText(page, '生产订单已发布，排程任务已进入 PMC 待办')
}

export function createProductionWipScenarios(deps) {
  const {
    assert,
    assertNoHorizontalOverflow,
    customerRuntimeEffectiveSession,
    expectHeading,
    expectText,
    outputDir,
    path,
  } = deps
  const permissions = productionWipPermissions()
  const effectiveSession = {
    ...customerRuntimeEffectiveSession,
    actions: [
      ...(customerRuntimeEffectiveSession?.actions || []),
      ...permissions,
    ],
  }

  return [
    {
      name: 'production-wip-route-execution-desktop',
      path: '/erp/production/orders',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      adminProfile: {
        username: 'style-l1-production-wip-desktop',
        is_super_admin: true,
        permissions,
      },
      effectiveSession,
      verify: async (page) => {
        await expectHeading(page, '生产订单')
        await expectText(page, '先车缝、后手工')
        await releaseProductionOrder(page, expectText)
        await clickVisibleAction(page, '工序办理')

        const routeModal = page
          .locator('.ant-modal:visible')
          .filter({ hasText: '生产工序办理' })
          .last()
        await routeModal.waitFor({ state: 'visible', timeout: 10_000 })
        for (const copy of [
          '布料加工 → 车缝 → 手工 → 包装',
          '先车缝、后手工',
          '正常首道布料加工固定按生产明细整单外发',
          '车缝、手工两道分别独立决定',
          '包装在本厂完成',
          '车间移交 / WIP 转移',
          '外发完成返回才叫回仓',
          '在制批次',
          '当前批次工序',
        ]) {
          assert(
            String((await routeModal.innerText()) || '').includes(copy),
            `生产工序弹窗缺少业务口径：${copy}`
          )
        }
        for (const technicalCopy of [
          'production_order_id',
          'production_wip_batch_id',
          'target_operation_id',
          'expected_version',
          'idempotency_key',
        ]) {
          assert.equal(
            await routeModal.getByText(technicalCopy, { exact: true }).count(),
            0,
            `生产工序弹窗不应显示技术字段 ${technicalCopy}`
          )
        }

        const splitButton = routeModal.getByRole('button', {
          name: '拆分批次',
        })
        const assignButton = routeModal.getByRole('button', {
          name: '安排加工',
        })
        assert.equal(await splitButton.isEnabled(), true)
        assert.equal(await assignButton.isEnabled(), true)
        await splitButton.click()
        await routeModal.getByLabel('拆出数量').waitFor({ state: 'visible' })
        await routeModal.getByRole('button', { name: '返回工序' }).click()

        await assignButton.click()
        const inhouse = routeModal.getByRole('radio', { name: '本厂生产' })
        const outsourced = routeModal.getByRole('radio', { name: '外发加工' })
        assert.equal(await inhouse.isEnabled(), true)
        assert.equal(await outsourced.isEnabled(), true)
        assert.equal(await inhouse.isChecked(), true)
        await outsourced.check()
        await expectText(
          page,
          '已按产品、规格、工序、单位和当前批次数量筛出 1 条候选'
        )
        const outsourcingSelect = routeModal.getByLabel('关联加工合同明细')
        await outsourcingSelect.click()
        await page
          .getByText(/SIM-OUTSOURCE-SEWING-CONFIRMED.*永绅车缝加工厂/u)
          .last()
          .click()
        await routeModal
          .getByText('安排本厂或外发加工', { exact: true })
          .click()
        await expectText(
          page,
          '匹配核对：产品 PROD-STYLE-L1 / 超长产品名称用于验证生产订单明细可读换行；规格 SKU-STYLE-L1-LONG；工序 车缝；数量 20 只'
        )
        await routeModal.screenshot({
          path: path.resolve(
            outputDir,
            'production-wip-outsourcing-contract-candidate-desktop.png'
          ),
        })
        await inhouse.check()
        await expectText(
          page,
          '本厂生产使用车间移交 / WIP 转移；只有外发加工完成返回才登记回仓。'
        )
        await routeModal.getByRole('button', { name: '返回工序' }).click()

        await routeModal
          .getByText(/WIP-STYLE-91021/u)
          .first()
          .click()
        await expectText(page, '当前：布料加工')
        assert.equal(
          await routeModal.getByRole('button', { name: '拆分批次' }).count(),
          0,
          '正常首道布料加工不应提供拆批入口'
        )
        await routeModal.getByRole('button', { name: '安排加工' }).click()
        await expectText(page, '安排布料整单外发')
        await expectText(page, '已找到 1 份可完整覆盖 2 项布料需求的合同')
        const fabricContractSelect = routeModal.getByLabel('布料加工合同')
        await fabricContractSelect.click()
        await page
          .getByText(/SIM-OUTSOURCE-SEWING-CONFIRMED.*覆盖 2 项布料/u)
          .last()
          .click()
        await page.keyboard.press('Escape')
        const fabricMainSelect = routeModal.getByLabel(
          'MAT-STYLE-L1 / 样式短毛绒布'
        )
        await fabricMainSelect.click()
        await page
          .getByText(/第 4 行.*MAT-STYLE-L1.*10\.2 米/u)
          .last()
          .click()
        const fabricLiningSelect = routeModal.getByLabel(
          'MAT-LINING-L1 / 样式里布'
        )
        await fabricLiningSelect.click()
        await page
          .getByText(/第 5 行.*MAT-LINING-L1.*5 米/u)
          .last()
          .click()
        await routeModal.getByText('安排布料整单外发', { exact: true }).click()
        await expectText(page, 'MAT-STYLE-L1 / 样式短毛绒布')
        await expectText(page, 'MAT-LINING-L1 / 样式里布')
        assert.match(await fabricMainSelect.innerText(), /第 4 行/u)
        assert.match(await fabricLiningSelect.innerText(), /第 5 行/u)
        await expectText(page, '外发开工前还必须把合同对应材料发料过账')
        await routeModal.screenshot({
          path: path.resolve(
            outputDir,
            'production-wip-fabric-contract-allocation-desktop.png'
          ),
        })
        await routeModal.getByRole('button', { name: '返回工序' }).click()
        await routeModal
          .getByText(/WIP-STYLE-91012/u)
          .first()
          .click()
        await expectText(page, '当前：车缝')

        await routeModal.getByRole('button', { name: '确认包材要求' }).click()
        const packagingVersionItem = routeModal
          .locator('.ant-form-item')
          .filter({ hasText: '包装版本' })
          .first()
        assert.equal(
          await packagingVersionItem.locator('.ant-form-item-required').count(),
          1,
          '包材确认的包装版本必须显示为必填字段'
        )
        assert.equal(
          await packagingVersionItem.locator('input').inputValue(),
          '',
          '未填写包装版本时不得预造确认值'
        )
        await routeModal.getByRole('button', { name: '返回工序' }).click()

        await splitButton.click()
        await routeModal.getByLabel('拆出数量').fill('0.1')
        await routeModal.getByRole('button', { name: '确认办理' }).click()
        await expectText(page, '在制批次已拆分')
        await expectText(page, '19.9')

        const desktopMetrics = await routeModal.evaluate((element) => {
          const rect = element.getBoundingClientRect()
          return {
            documentOverflow:
              document.documentElement.scrollWidth -
              document.documentElement.clientWidth,
            left: rect.left,
            right: rect.right,
            viewportWidth: window.innerWidth,
            visibleButtons: Array.from(
              element.querySelectorAll('button:not([disabled])')
            ).map((button) => ({
              text: String(button.textContent || '')
                .replace(/\s+/gu, ' ')
                .trim(),
              writingMode: window.getComputedStyle(button).writingMode,
            })),
          }
        })
        assert(
          desktopMetrics.documentOverflow <= 1 &&
            desktopMetrics.left >= 0 &&
            desktopMetrics.right <= desktopMetrics.viewportWidth + 1 &&
            desktopMetrics.visibleButtons.every(
              (button) => !button.writingMode.startsWith('vertical')
            ),
          `生产工序桌面弹窗发生页面级溢出或按钮竖排: ${JSON.stringify(
            desktopMetrics
          )}`
        )
        await routeModal.screenshot({
          path: path.resolve(
            outputDir,
            'production-wip-route-modal-desktop.png'
          ),
        })
        await routeModal.locator('button.ant-modal-close').click()
        await routeModal.waitFor({ state: 'hidden', timeout: 10_000 })

        await clickVisibleAction(page, '登记完工入库')
        const completionModal = page
          .locator('.ant-modal:visible')
          .filter({ hasText: '登记完工入库' })
          .last()
        await completionModal.waitFor({ state: 'visible', timeout: 10_000 })
        await expectText(page, '部分路线明细暂不可登记')
        const selectedCompletionItem = String(
          (await completionModal
            .locator('.ant-select-selection-item')
            .first()
            .innerText()) || ''
        )
        assert.match(
          selectedCompletionItem,
          /PROD-STYLE-L1/u,
          `完工入库只应默认选择已完成包装且已确认包材的明细: ${selectedCompletionItem}`
        )
        await page.keyboard.press('Escape')
        await completionModal.waitFor({ state: 'hidden', timeout: 10_000 })
        await assertNoHorizontalOverflow(page, 'production-wip-route-desktop')
      },
    },
    {
      name: 'production-wip-route-execution-mobile',
      path: '/erp/production/orders',
      auth: 'admin',
      viewport: { width: 390, height: 844 },
      adminProfile: {
        username: 'style-l1-production-wip-mobile',
        is_super_admin: true,
        permissions,
      },
      effectiveSession,
      verify: async (page) => {
        await expectHeading(page, '生产订单')
        await releaseProductionOrder(page, expectText)
        await clickVisibleAction(page, '工序办理')
        const routeModal = page
          .locator('.ant-modal:visible')
          .filter({ hasText: '生产工序办理' })
          .last()
        await routeModal.waitFor({ state: 'visible', timeout: 10_000 })
        await expectText(page, '固定顺序：布料加工 → 车缝 → 手工 → 包装')
        const mobileMetrics = await routeModal.evaluate((element) => {
          const rect = element.getBoundingClientRect()
          const table = element.querySelector('.ant-table-content')
          return {
            documentClientWidth: document.documentElement.clientWidth,
            documentScrollWidth: document.documentElement.scrollWidth,
            modalLeft: rect.left,
            modalRight: rect.right,
            viewportWidth: window.innerWidth,
            tableClientWidth: table?.clientWidth || 0,
            tableScrollWidth: table?.scrollWidth || 0,
            verticalButtons: Array.from(
              element.querySelectorAll('button')
            ).filter((button) =>
              window.getComputedStyle(button).writingMode.startsWith('vertical')
            ).length,
          }
        })
        assert(
          mobileMetrics.documentScrollWidth <=
            mobileMetrics.documentClientWidth + 1 &&
            mobileMetrics.modalLeft >= 0 &&
            mobileMetrics.modalRight <= mobileMetrics.viewportWidth + 1 &&
            mobileMetrics.tableScrollWidth >= mobileMetrics.tableClientWidth &&
            mobileMetrics.verticalButtons === 0,
          `生产工序窄屏布局异常: ${JSON.stringify(mobileMetrics)}`
        )
        await routeModal.screenshot({
          path: path.resolve(
            outputDir,
            'production-wip-route-modal-mobile.png'
          ),
        })
        await assertNoHorizontalOverflow(page, 'production-wip-route-mobile')
      },
    },
  ]
}
