export function createProductionSourceInboundLotScenarios(deps) {
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
  let completionCreateParams = []

  return [
    {
      name: 'production-source-completion-new-lot-desktop',
      path: '/erp/production/orders',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      adminProfile: {
        username: 'style-l1-production-completion-new-lot',
        is_super_admin: true,
        permissions: [
          'pmc.plan.read',
          'pmc.plan.update',
          'production.fact.read',
          'production.completion.create',
          'production.wip.read',
        ],
      },
      effectiveSession: {
        ...customerRuntimeEffectiveSession,
        actions: [
          ...(customerRuntimeEffectiveSession?.actions || []),
          'pmc.plan.read',
          'pmc.plan.update',
          'production.fact.read',
          'production.completion.create',
          'production.wip.read',
        ],
      },
      beforeNavigate: async (page) => {
        operationalFactMethods = []
        completionCreateParams = []
        page.on('request', (request) => {
          if (!request.url().includes('/rpc/operational_fact')) return
          try {
            const body = request.postDataJSON() || {}
            if (body.method) operationalFactMethods.push(body.method)
            if (body.method === 'create_production_completion_from_order') {
              completionCreateParams.push(body.params || {})
            }
          } catch {
            // 非 JSON-RPC 请求不参与本场景断言。
          }
        })
      },
      verify: async (page) => {
        await expectHeading(page, '生产订单')
        await page.getByText('MO-STYLE-L1-20260713', { exact: true }).click()
        const releaseButton = page.getByRole('button', { name: /发\s*布/u })
        for (let attempt = 0; attempt < 40; attempt += 1) {
          if (await releaseButton.isEnabled()) break
          await page.waitForTimeout(100)
        }
        assert.equal(await releaseButton.isEnabled(), true)
        await releaseButton.click()
        await page.getByRole('button', { name: '确认发布' }).click()
        await expectText(page, '生产订单已发布，排程任务已进入 PMC 待办')

        const completionButton = page.getByRole('button', {
          name: '登记完工入库',
        })
        await completionButton.waitFor({ state: 'visible', timeout: 10_000 })
        await completionButton.click()
        const modal = page
          .locator('.ant-modal:visible')
          .filter({ hasText: '登记完工入库' })
          .last()
        await modal.waitFor({ state: 'visible', timeout: 10_000 })
        const modalText = String((await modal.innerText()) || '').replace(
          /\s+/gu,
          ' '
        )
        for (const copy of [
          'MO-STYLE-L1-20260713',
          '入库批次方式',
          '选择已有批次',
          '填写新批次号',
          '新批次号',
        ]) {
          assert(modalText.includes(copy), `完工入库弹窗缺少 ${copy}`)
        }
        for (const technicalCopy of [
          'lot_id',
          'new_lot_no',
          'source_id',
          'idempotency_key',
        ]) {
          assert.equal(
            await modal.getByText(technicalCopy, { exact: true }).count(),
            0,
            `完工入库弹窗不应显示技术字段 ${technicalCopy}`
          )
        }
        const newLotRadio = modal.getByRole('radio', {
          name: '填写新批次号',
        })
        for (let attempt = 0; attempt < 20; attempt += 1) {
          if (await newLotRadio.isChecked()) break
          await page.waitForTimeout(100)
        }
        assert.equal(
          await newLotRadio.isChecked(),
          true,
          '没有匹配的已有产品批次时应默认填写新批次号'
        )
        await modal.getByLabel('本次完工数量').fill('2')
        await modal
          .getByRole('textbox', { name: /新批次号/u })
          .fill('PROD-NEW-LOT-REREAD-L1')
        await modal.locator('textarea').fill('本次完工新建批次')
        await modal.screenshot({
          path: path.resolve(
            outputDir,
            'production-source-completion-new-lot-modal-desktop.png'
          ),
        })
        await modal
          .getByRole('button', { name: /生\s*成\s*完\s*工\s*记\s*录/u })
          .click()
        await expectText(
          page,
          '已重新读取并确认完工草稿，请到生产记录核对并过账'
        )

        assert.equal(completionCreateParams.length, 1)
        const params = completionCreateParams[0]
        const allowedKeys = new Set([
          'customer_key',
          'fact_no',
          'production_order_id',
          'production_order_item_id',
          'warehouse_id',
          'new_lot_no',
          'quantity',
          'idempotency_key',
          'occurred_at',
          'note',
        ])
        assert(
          Object.keys(params).every((key) => allowedKeys.has(key)),
          `完工入库请求包含越界字段: ${JSON.stringify(params)}`
        )
        assert.equal(params.customer_key, 'yoyoosun')
        assert.equal(params.production_order_id, 71)
        assert.equal(params.production_order_item_id, 7100)
        assert.equal(params.warehouse_id, 1)
        assert.equal(params.new_lot_no, 'PROD-NEW-LOT-REREAD-L1')
        assert.equal(params.quantity, '2')
        assert.equal(Object.hasOwn(params, 'lot_id'), false)
        assert.equal(typeof params.idempotency_key, 'string')
        assert.equal(
          operationalFactMethods.filter(
            (method) => method === 'list_production_facts'
          ).length >= 3,
          true,
          `未知结果及成功刷新应重读生产记录: ${JSON.stringify(
            operationalFactMethods
          )}`
        )

        await completionButton.click()
        const reopened = page
          .locator('.ant-modal:visible')
          .filter({ hasText: '登记完工入库' })
          .last()
        await reopened.waitFor({ state: 'visible', timeout: 10_000 })
        assert.equal(
          await reopened
            .getByRole('textbox', { name: /新批次号/u })
            .inputValue(),
          '',
          '关闭后重新打开不得残留上次新批次号'
        )
        await page.keyboard.press('Escape')
        await reopened.waitFor({ state: 'hidden', timeout: 10_000 })
        await assertNoHorizontalOverflow(
          page,
          'production-source-completion-new-lot-desktop'
        )
      },
    },
  ]
}
