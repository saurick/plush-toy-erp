export function createProductionReworkScenarios(deps) {
  const {
    assert,
    assertNoHorizontalOverflow,
    customerRuntimeEffectiveSession,
    expectHeading,
    expectText,
    outputDir,
    path,
  } = deps

  let operationalFactMethods = []
  let createParams = []

  return [
    {
      name: 'production-posted-completion-rework-desktop',
      path: '/erp/production/progress',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      adminProfile: {
        username: 'style-l1-production-rework',
        is_super_admin: false,
        roles: [{ role_key: 'production', name: '生产' }],
        permissions: ['production.fact.read', 'production.rework.create'],
        menus: [
          {
            key: 'production-progress',
            label: '生产进度',
            path: '/erp/production/progress',
            required_any: ['production.fact.read'],
            required_all: [],
          },
        ],
        erp_preferences: {
          column_orders: {},
        },
      },
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        pages: ['production-progress'],
        actions: ['production.fact.read', 'production.rework.create'],
      },
      beforeNavigate: async (page) => {
        operationalFactMethods = []
        createParams = []
        page.on('request', (request) => {
          if (!request.url().includes('/rpc/operational_fact')) return
          try {
            const body = request.postDataJSON() || {}
            if (body.method) operationalFactMethods.push(body.method)
            if (body.method === 'create_production_rework_from_completion') {
              createParams.push(body.params || {})
            }
          } catch {
            // 非 JSON-RPC 请求不参与本场景断言。
          }
        })
      },
      verify: async (page) => {
        await expectHeading(page, '生产进度')
        await page
          .getByText('PROD-FG-POSTED-L1', { exact: true })
          .first()
          .click()

        const reworkButton = page.getByRole('button', { name: '发起返工' })
        await reworkButton.waitFor({ state: 'visible', timeout: 10_000 })
        assert.equal(await reworkButton.isEnabled(), true)
        assert.equal(
          await page.getByRole('button', { name: '过账' }).count(),
          0,
          '仅具备返工权限时不应展示生产过账入口'
        )
        await reworkButton.click()

        const modal = page
          .locator('.ant-modal:visible')
          .filter({ hasText: '发起返工' })
          .last()
        await modal.waitFor({ state: 'visible', timeout: 10_000 })
        const modalText = String((await modal.innerText()) || '').replace(
          /\s+/gu,
          ' '
        )
        for (const copy of [
          'PROD-FG-POSTED-L1',
          '原完工记录',
          '原完工数量',
          '剩余可返工',
          '返工业务编号',
          '本次返工数量',
          '发生时间',
          '返工原因',
        ]) {
          assert(modalText.includes(copy), `返工弹窗缺少 ${copy}`)
        }
        for (const technicalCopy of [
          'source_completion_fact_id',
          'source_type',
          'source_id',
          'lot_id',
          'idempotency_key',
        ]) {
          assert.equal(
            await modal.getByText(technicalCopy, { exact: true }).count(),
            0,
            `返工弹窗不应显示技术字段 ${technicalCopy}`
          )
        }

        assert.equal(
          await modal.getByLabel('返工业务编号').inputValue(),
          'RW-PROD-FG-POSTED-L1'
        )
        assert.equal(await modal.getByLabel('本次返工数量').inputValue(), '6')
        await modal.getByLabel('本次返工数量').fill('2')
        await modal.getByLabel('返工原因').fill('STYLE-L1-REWORK-REREAD')
        await modal.screenshot({
          path: path.resolve(
            outputDir,
            'production-posted-completion-rework-modal-desktop.png'
          ),
        })
        await modal.getByRole('button', { name: '生成返工草稿' }).click()
        await expectText(page, '已重新读取并确认返工草稿，请核对后过账')

        assert.equal(createParams.length, 1)
        const params = createParams[0]
        const allowedKeys = new Set([
          'customer_key',
          'fact_no',
          'source_completion_fact_id',
          'quantity',
          'idempotency_key',
          'occurred_at',
          'reason',
        ])
        assert(
          Object.keys(params).every((key) => allowedKeys.has(key)),
          `返工请求包含越界字段: ${JSON.stringify(params)}`
        )
        assert.equal(params.customer_key, 'yoyoosun')
        assert.equal(params.fact_no, 'RW-PROD-FG-POSTED-L1')
        assert.equal(params.source_completion_fact_id, 81)
        assert.equal(params.quantity, '2')
        assert.equal(params.reason, 'STYLE-L1-REWORK-REREAD')
        assert.equal(typeof params.idempotency_key, 'string')
        for (const forbidden of [
          'fact_type',
          'subject_id',
          'warehouse_id',
          'lot_id',
          'source_type',
          'source_id',
          'note',
        ]) {
          assert.equal(forbidden in params, false, forbidden)
        }
        assert.equal(
          operationalFactMethods.filter(
            (method) => method === 'list_production_facts'
          ).length >= 4,
          true,
          `打开、未知结果重读和成功刷新都应读取生产记录: ${JSON.stringify(
            operationalFactMethods
          )}`
        )

        await page
          .getByText('PROD-FG-POSTED-L1', { exact: true })
          .first()
          .click()
        await reworkButton.click()
        const reopened = page
          .locator('.ant-modal:visible')
          .filter({ hasText: '发起返工' })
          .last()
        await reopened.waitFor({ state: 'visible', timeout: 10_000 })
        assert.equal(
          await reopened.getByLabel('返工原因').inputValue(),
          '',
          '返工成功关闭后重新打开不得残留上次原因'
        )
        await assertNoHorizontalOverflow(
          page,
          'production-posted-completion-rework-desktop'
        )
      },
    },
    {
      name: 'production-completion-warehouse-inbound-permissions-desktop',
      path: '/erp/production/progress',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      adminProfile: {
        username: 'style-l1-warehouse-inbound',
        is_super_admin: false,
        roles: [{ role_key: 'warehouse', name: '仓库' }],
        permissions: [
          'production.fact.read',
          'production.wip.read',
          'warehouse.inbound.confirm',
        ],
        menus: [
          {
            key: 'production-progress',
            label: '生产进度',
            path: '/erp/production/progress',
            required_any: ['production.fact.read'],
            required_all: [],
          },
        ],
        erp_preferences: {
          column_orders: {},
        },
      },
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        pages: ['production-progress'],
        actions: [
          'production.fact.read',
          'production.wip.read',
          'warehouse.inbound.confirm',
        ],
      },
      verify: async (page) => {
        await expectHeading(page, '生产进度')
        await expectText(page, '生产岗位在这里维护领料、返工和待入库完工报告')

        const draftCompletionRow = page
          .locator(
            '.erp-business-data-table-card .ant-table-tbody .ant-table-row'
          )
          .filter({ hasText: 'PROD-FACT-L1' })
          .first()
        await draftCompletionRow.click()
        await draftCompletionRow
          .and(page.locator('.ant-table-row-selected'))
          .waitFor({ state: 'visible', timeout: 10_000 })
        const confirmInboundButton = page
          .locator('button:visible')
          .filter({ hasText: '确认成品入库' })
          .last()
        const withdrawDraftButton = page
          .locator('button:visible')
          .filter({ hasText: '作废完工报告' })
          .last()
        const visibleActionLabels = await page
          .locator('button:visible')
          .allInnerTexts()
        assert(
          (await confirmInboundButton.count()) > 0,
          `仓库选择待入库完工报告后缺少确认入口: ${JSON.stringify(visibleActionLabels)}`
        )
        await confirmInboundButton.waitFor({
          state: 'visible',
          timeout: 10_000,
        })
        await withdrawDraftButton.waitFor({ state: 'visible', timeout: 10_000 })
        assert.equal(await confirmInboundButton.isEnabled(), true)
        assert.equal(
          await withdrawDraftButton.isDisabled(),
          true,
          '仓库可以确认待入库完工报告，但不能代替生产撤回报告'
        )

        const postedCompletionRow = page
          .locator(
            '.erp-business-data-table-card .ant-table-tbody .ant-table-row'
          )
          .filter({ hasText: 'PROD-FG-POSTED-L1' })
          .first()
        await postedCompletionRow.click()
        await postedCompletionRow
          .and(page.locator('.ant-table-row-selected'))
          .waitFor({ state: 'visible', timeout: 10_000 })
        const reverseInboundButton = page
          .locator('button:visible')
          .filter({ hasText: '撤销成品入库' })
          .last()
        await reverseInboundButton.waitFor({
          state: 'visible',
          timeout: 10_000,
        })
        assert.equal(await reverseInboundButton.isEnabled(), true)
        assert.equal(
          await confirmInboundButton.isDisabled(),
          true,
          '已入库记录不能重复确认'
        )

        await page.screenshot({
          path: path.resolve(
            outputDir,
            'production-completion-warehouse-inbound-permissions-desktop.png'
          ),
          fullPage: true,
        })
        await assertNoHorizontalOverflow(
          page,
          'production-completion-warehouse-inbound-permissions-desktop'
        )
      },
    },
    {
      name: 'production-completion-reporting-permissions-desktop',
      path: '/erp/production/progress',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      adminProfile: {
        username: 'style-l1-production-reporting',
        is_super_admin: false,
        roles: [{ role_key: 'production', name: '生产' }],
        permissions: [
          'production.fact.read',
          'production.fact.post',
          'production.fact.cancel',
          'production.completion.create',
          'production.wip.read',
        ],
        menus: [
          {
            key: 'production-progress',
            label: '生产进度',
            path: '/erp/production/progress',
            required_any: ['production.fact.read'],
            required_all: [],
          },
        ],
        erp_preferences: {
          column_orders: {},
        },
      },
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        pages: ['production-progress'],
        actions: [
          'production.fact.read',
          'production.fact.post',
          'production.fact.cancel',
          'production.completion.create',
          'production.wip.read',
        ],
      },
      verify: async (page) => {
        await expectHeading(page, '生产进度')
        const draftCompletionRow = page
          .locator(
            '.erp-business-data-table-card .ant-table-tbody .ant-table-row'
          )
          .filter({ hasText: 'PROD-FACT-L1' })
          .first()
        await draftCompletionRow.click()
        await draftCompletionRow
          .and(page.locator('.ant-table-row-selected'))
          .waitFor({ state: 'visible', timeout: 10_000 })

        const confirmInboundButton = page
          .locator('button:visible')
          .filter({ hasText: '确认成品入库' })
          .last()
        const withdrawDraftButton = page
          .locator('button:visible')
          .filter({ hasText: '作废完工报告' })
          .last()
        await confirmInboundButton.waitFor({
          state: 'visible',
          timeout: 10_000,
        })
        await withdrawDraftButton.waitFor({ state: 'visible', timeout: 10_000 })
        assert.equal(
          await confirmInboundButton.isDisabled(),
          true,
          '生产提交完工报告后不能自行确认成品入库'
        )
        assert.equal(await withdrawDraftButton.isEnabled(), true)

        await withdrawDraftButton.click()
        const withdrawModal = page
          .locator('.ant-modal:visible')
          .filter({ hasText: '作废生产完工报告' })
          .last()
        await withdrawModal.waitFor({ state: 'visible', timeout: 10_000 })
        await expectText(page, '完工报告尚未由仓库确认，作废不会变更成品库存')
        await withdrawModal.screenshot({
          path: path.resolve(
            outputDir,
            'production-completion-reporting-withdraw-desktop.png'
          ),
        })
        await withdrawModal.getByRole('button', { name: '暂不取消' }).click()
        await withdrawModal.waitFor({ state: 'hidden', timeout: 10_000 })

        const postedCompletionRow = page
          .locator(
            '.erp-business-data-table-card .ant-table-tbody .ant-table-row'
          )
          .filter({ hasText: 'PROD-FG-POSTED-L1' })
          .first()
        await postedCompletionRow.click()
        await postedCompletionRow
          .and(page.locator('.ant-table-row-selected'))
          .waitFor({ state: 'visible', timeout: 10_000 })
        const reverseInboundButton = page
          .locator('button:visible')
          .filter({ hasText: '撤销成品入库' })
          .last()
        await reverseInboundButton.waitFor({
          state: 'visible',
          timeout: 10_000,
        })
        assert.equal(
          await reverseInboundButton.isDisabled(),
          true,
          '生产不能撤销仓库已经确认的成品入库'
        )
        await assertNoHorizontalOverflow(
          page,
          'production-completion-reporting-permissions-desktop'
        )
      },
    },
  ]
}
