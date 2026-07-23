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
  ]
}
