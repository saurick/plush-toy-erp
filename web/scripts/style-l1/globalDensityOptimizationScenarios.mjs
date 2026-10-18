import fs from 'node:fs/promises'
import { openBusinessTableTool } from './businessTableTools.mjs'
import { PermissionCode } from '../../src/common/consts/permissions.generated.mjs'
import { assertTaskCopy } from './taskCopyAssertions.mjs'
import { assertTrackingNavigation } from './taskTrackingScenarios.mjs'

// Baseline mode captures the frozen source with identical fixtures and viewport.
// Assertions for the new hierarchy run only against the implementation.
export function createGlobalDensityOptimizationScenarios(scenarios, { assert, outputDir, path, assertNoHorizontalOverflow }) {
  const baseline = process.env.STYLE_L1_DENSITY_BASELINE === '1'
  const find = name => {
    const scenario = scenarios.find(item => item.name === name)
    assert(scenario, `Missing density fixture: ${name}`)
    return scenario
  }
  const capture = async (page, key, region) => {
    await page.evaluate(() => document.fonts.ready)
    await page.mouse.move(2, 2)
    await page.screenshot({ path: path.join(outputDir, `density-${key}.png`), animations: 'disabled' })
    if (region) await region.screenshot({ path: path.join(outputDir, `density-${key}-region.png`), animations: 'disabled' })
    const metrics = await page.evaluate(() => ({
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      bodyText: document.body.innerText,
      tables: [...document.querySelectorAll('.erp-business-data-table-card .ant-table-content')].map(node => ({ width: node.clientWidth, scrollWidth: node.scrollWidth })),
    }))
    await fs.writeFile(path.join(outputDir, `density-${key}.json`), JSON.stringify(metrics, null, 2))
    await assertNoHorizontalOverflow(page, `density-${key}`)
  }
  const help = async (page, trigger, expected, key, region) => {
    if (baseline) return capture(page, key, region)
    await trigger.click()
    const popup = page.locator('.erp-business-inline-help-popover:visible').last()
    await popup.getByText(expected, { exact: false }).waitFor()
    await capture(page, key, region)
    await popup.screenshot({ path: path.join(outputDir, `density-${key}-popover.png`), animations: 'disabled' })
    await trigger.press('Escape')
    await popup.waitFor({ state: 'hidden' })
    assert.equal(await trigger.evaluate(node => node === document.activeElement), true, '帮助关闭应恢复焦点')
  }
  const business = { ...find('information-density-business-desktop'), effectiveSession: { ...find('information-density-business-desktop').effectiveSession, actions: Object.values(PermissionCode) }, workflowTaskFixtures: find('business-core-pages-desktop').workflowTaskFixtures, viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 }
  const goto = async (page, route) => page.goto(new URL(route, page.url()).href, { waitUntil: 'networkidle' })
  const results = []
  const add = (base, key, verify, options = {}) => results.push({ ...base, ...options, name: `global-density-${key}`, verify: async page => { page.setDefaultTimeout(12000); await verify(page) } })

  add(business, 'shipment', async page => {
    await goto(page, '/erp/warehouse/shipments')
    await page.getByRole('button', { name: /新建出货单$/u }).click()
    const form = page.locator('.erp-business-form-page:visible')
    await form.getByText('实际总净重（克）', { exact: true }).waitFor()
    if (!baseline) assert.equal(await form.getByText('预计总净重暂不可计算', { exact: true }).count(), 0, '空白表单不应伪装重量异常')
    await capture(page, 'shipment-empty', form)
    await form.getByRole('button', { name: '从销售订单导入', exact: true }).click()
    const picker = page.locator('.erp-source-import-picker-modal:visible')
    await picker.getByText('SO-STYLE-L1', { exact: true }).first().waitFor()
    await capture(page, 'shipment-picker', picker)
    await help(page, picker.getByRole('button', { name: '查看从销售订单导入出货明细说明', exact: true }), '选择同一张销售订单', 'shipment-picker-help', picker)
    await picker.getByRole('button', { name: /取消/u }).click()
    const weight = form.getByRole('spinbutton').filter({ visible: true }).last()
    // The quantity field participates in the existing weight calculation; no submission is made.
    const quantity = form.locator('input[id$="quantity"]').first()
    await quantity.fill('2')
    await form.getByText('预计总净重暂不可计算', { exact: true }).waitFor()
    await capture(page, 'shipment-missing-weight', form)
    assert.equal(await weight.count(), 1)
    await form.getByRole('button', { name: '返回列表', exact: true }).click()
    const discard = page.getByRole('button', { name: '放弃修改', exact: true })
    if (await discard.isVisible()) await discard.click()
    await form.waitFor({ state: 'hidden' })
  })

  add(business, 'process-notes', async page => {
    await goto(page, '/erp/engineering/processes')
    await page.getByRole('button', { name: /新建加工环节$/u }).click()
    const form = page.locator('.erp-business-form-page:visible')
    await form.getByText('质检参考', { exact: true }).waitFor()
    await capture(page, 'process-form', form)
    for (const [label, expected] of [['标准生产路线位置', '不能根据名称'], ['可委外', '能力'], ['质检参考', '检验']]) {
      const field = form.locator('.ant-form-item').filter({ has: page.getByText(label, { exact: true }) }).first()
      await field.scrollIntoViewIfNeeded()
      await capture(page, `process-${label}`, field)
      await help(page, field.getByRole('button', { name: `查看${label}说明`, exact: true }), expected, `process-${label}-help`, field)
    }
    const internal = form.getByRole('switch')
    assert(await internal.count() >= 1)
  })

  for (const [key, route, record, hiddenLabels] of [
    ['finance-columns', '/erp/finance/receivables', 'AR-STYLE-L1', ['收款分类', '账期', '备注']],
    ['supplier-columns', '/erp/master/partners/suppliers', 'SUP-STYLE-L1', ['简称', '默认发票要求']],
  ]) add(business, key, async page => {
    await goto(page, route)
    await page.locator('.ant-table-tbody tr[data-row-key]').first().waitFor()
    if (key === 'finance-columns') await page.getByText(record, { exact: true }).first().waitFor()
    const headings = await page.locator('.erp-business-data-table-card .ant-table-thead:not([aria-hidden="true"]) th').allTextContents()
    await fs.writeFile(path.join(outputDir, `density-${key}-columns.json`), JSON.stringify(headings, null, 2))
    await capture(page, key)
    await openBusinessTableTool(page, '列设置')
    const dialog = page.getByRole('dialog', { name: /^列设置/u })
    await dialog.waitFor()
    await capture(page, `${key}-settings`, dialog)
    if (!baseline) for (const label of hiddenLabels) assert(await dialog.getByText(label, { exact: true }).count() > 0, `${label} 应可在列设置找回`)
    await dialog.press('Escape')
    await dialog.waitFor({ state: 'hidden' })
    assert.equal(await dialog.isVisible(), false)
    await openBusinessTableTool(page, '列设置')
    const all = dialog.getByRole('button', { name: '全部显示', exact: true })
    if (await all.isEnabled()) await all.click()
    await dialog.getByRole('button', { name: '完成', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    await page.reload({ waitUntil: 'networkidle' })
    await page.locator('.ant-table-tbody tr[data-row-key]').first().waitFor()
    const restored = await page.locator('.erp-business-data-table-card .ant-table-thead:not([aria-hidden="true"]) th').allTextContents()
    for (const label of hiddenLabels) assert(restored.some(text => text.includes(label)), `保存并刷新后应恢复 ${label}`)
    await capture(page, `${key}-saved-columns`)
  })

  add(business, 'details', async page => {
    for (const [key, route] of [
      ['receivables', '/erp/finance/receivables'], ['payables', '/erp/finance/payables'], ['invoices', '/erp/finance/invoices'],
      ['reconciliation', '/erp/finance/reconciliation'], ['payments', '/erp/finance/payments'], ['receipts', '/erp/warehouse/inbound'],
      ['outbound', '/erp/warehouse/outbound'], ['workflow', '/erp/warehouse/shipping-release'],
    ]) {
      await goto(page, route)
      const row = page.locator('.ant-table-tbody tr[data-row-key]').first()
      await row.waitFor()
      await row.click()
      const actionPattern = key === 'workflow' ? /查看任务$/u : /查看(详情)?$/u
      let action = page.getByRole('button', { name: actionPattern }).filter({ visible: true })
      if (!await action.count()) {
        await page.getByRole('button', { name: /^更多操作/u }).first().click()
        action = page.getByRole('button', { name: actionPattern }).filter({ visible: true })
      }
      await action.last().click()
      const dialog = page.locator('.erp-business-details-modal:visible')
      await dialog.waitFor()
      await dialog.getByRole('button', { name: /^关\s*闭$/u }).waitFor()
      await capture(page, `${key}-detail`, dialog)
      await help(page, dialog.locator('.ant-modal-title .erp-business-inline-help-trigger'), key === 'workflow' ? '查看任务来源' : key === 'payments' ? '系统最新记录' : '查看', `${key}-detail-help`, dialog)
      if (key === 'payments' && !baseline) {
        assert.equal(await dialog.locator('.ant-pagination').count(), 0, '空明细不应显示分页')
        assert.equal(await dialog.getByText(/共 0 条/u).count(), 0, '空明细不应重复零条统计')
      }
      await dialog.getByRole('button', { name: /^关\s*闭$/u }).click()
    }
  })

  const cancelReason = '重复登记已核对原单，保留本次取消记录及完整原因供后续追踪。'
  add(business, 'finance-boundary', async page => {
    await goto(page, '/erp/finance/receivables')
    await page.getByText(cancelReason, { exact: false }).waitFor()
    await page.getByText('取消记录信息不完整，请联系管理员核对', { exact: true }).waitFor()
    const reason = page.getByText(cancelReason, { exact: false }).last()
    await reason.scrollIntoViewIfNeeded()
    const metrics = await reason.evaluate(node => {
      const style = getComputedStyle(node)
      return { lineClamp: style.webkitLineClamp, height: node.getBoundingClientRect().height, textOverflow: style.textOverflow }
    })
    assert(!metrics.lineClamp || metrics.lineClamp === 'none', '取消原因不得通过行数截断')
    await capture(page, 'finance-cancelled-long')
    const download = page.waitForEvent('download')
    await openBusinessTableTool(page, '导出筛选结果')
    const file = await download
    const csv = await fs.readFile(await file.path(), 'utf8')
    for (const value of ['手续费', '收款分类', '账期', '备注', cancelReason]) assert(csv.includes(value), `完整导出应保留 ${value}`)
  }, { beforeNavigate: async page => {
    await page.route('**/rpc/operational_fact', async route => {
      const body = route.request().postDataJSON()
      if (body.method !== 'list_finance_facts') return route.fallback()
      const fact = { id: 41, fact_no: 'AR-DENSITY-20261018-000000000000000041', fact_type: 'RECEIVABLE', status: 'CANCELLED', counterparty_type: 'CUSTOMER', counterparty_id: 1, amount: '987654321.12', outstanding_amount: '0', fee_amount: '12.34', currency: 'USD', collection_type: 'OTHER', payment_term: 'IMMEDIATE', source_type: 'SHIPMENT', source_id: 1, occurred_at: 1792000000, cancelled_at: 1792000400, cancelled_by_name: '张敏', cancel_reason: cancelReason, note: '保留完整备注，不写入真实业务。' }
      const facts = [fact, { ...fact, id: 42, fact_no: 'AR-DENSITY-EMPTY-AUDIT', cancelled_at: 0, cancel_reason: '', amount: '0', fee_amount: '0', currency: 'CNY' }]
      await route.fulfill({ json: { jsonrpc: '2.0', id: body.id, result: { code: 0, message: 'OK', data: { finance_facts: facts.slice(Number(body.params.offset || 0), Number(body.params.offset || 0) + Number(body.params.limit || 100)), total: 2, limit: Number(body.params.limit || 100), offset: Number(body.params.offset || 0) } } } })
    })
  } })

  const verifyTracking = async (page, key, mobile) => {
    if (mobile) {
      await page.getByTestId('mobile-role-bottom-nav').getByRole('tab', { name: /任务管理/u }).click()
      await page.getByRole('tab', { name: '流程跟踪', exact: true }).click()
      await page.getByRole('region', { name: '流程跟踪', exact: true }).getByRole('button', { name: '重新读取', exact: true }).click()
      await page.getByText('任务分页记录 1', { exact: true }).waitFor()
      await page.getByRole('group', { name: '流转状态', exact: true }).getByRole('button', { name: /^进行中/u }).click()
      await page.locator('[data-mobile-tracking-entry="process:10"]').waitFor()
      await capture(page, `${key}-list`)
      if (!baseline) assert.equal(await page.getByRole('button', { name: '筛选流程', exact: true }).getAttribute('aria-label'), '筛选流程')
      await page.locator('[data-mobile-tracking-entry="process:10"] .erp-task-card__open').click()
    }
    const dialog = page.getByRole('dialog', { name: '流程跟踪', exact: true })
    await dialog.getByText('全部节点处理记录', { exact: true }).waitFor()
    await capture(page, `${key}-detail`, dialog)
    await assertTrackingNavigation(page, assert, dialog)
    if (!baseline) {
      await dialog.getByRole('button', { name: '更多操作', exact: true }).click()
      assert.equal(await page.getByRole('menuitem', { name: '复制任务链接', exact: true }).count(), 0, '流程编号不能拼成任务链接')
      await capture(page, `${key}-copy-menu`)
      const trigger = dialog.getByRole('button', { name: '更多操作', exact: true })
      const item = page.getByRole('menuitem', { name: '复制产品信息', exact: true })
      await assertTaskCopy(page, item, ['PRODUCT-7', 'PRODUCT-8', '任务识图小熊'], { keyboard: true, returnFocus: trigger })
      await item.waitFor({ state: 'hidden' })
      const copy = dialog.getByRole('button', { name: '复制产品编号', exact: true }).first()
      await assertTaskCopy(page, copy, 'PRODUCT-7')
      await page.waitForFunction(() => !document.querySelector('.ant-message-notice-content'))
    }
    const more = dialog.locator('.erp-task-identity__more > summary')
    await more.click()
    await capture(page, `${key}-products-expanded`, dialog)
    await more.click()
    const timeHelp = dialog.locator('.erp-workflow-tracking-origin .erp-business-inline-help-trigger')
    await help(page, timeHelp, '精确发起时间', `${key}-time-help`, dialog)
    await dialog.getByRole('button', { name: /返回|关闭/u }).first().click()
    if (mobile) {
      await page.locator('[data-mobile-tracking-entry="process:10"]').waitFor()
      await capture(page, `${key}-returned`)
    }
  }
  add(find('erp-task-tracking-access-read-only'), 'tracking-desktop', page => verifyTracking(page, 'tracking-desktop', false), { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 })
  for (const width of [390, 320]) add(find('mobile-workflow-tracking-light'), `tracking-${width}`, page => verifyTracking(page, `tracking-${width}`, true), { viewport: { width, height: 844 }, deviceScaleFactor: 2 })

  for (const [key, base, width] of [['desktop', 'desktop', 1920], ['390', 'narrow', 390], ['320', 'small', 320], ['readonly', 'readonly', 1920]]) {
    add(find(`business-attachment-manager-${base}`), `attachments-${key}`, async page => {
      await page.getByText('style-l1-attachment-review', { exact: true }).first().click()
      let trigger = page.locator('[data-business-action-key="workflow-task-attachments"]:visible')
      if (!await trigger.count()) await page.getByRole('button', { name: /^更多操作，共/u }).click()
      await page.locator('[data-business-action-key="workflow-task-attachments"]:visible').click()
      const dialog = page.getByRole('dialog', { name: '任务附件', exact: true })
      await dialog.getByText('产品正面图.png', { exact: true }).waitFor()
      await dialog.getByText('已撤销', { exact: true }).waitFor()
      await capture(page, `attachments-${key}`, dialog)
      assert(await dialog.getByText(/版本错误/u).count() > 0, '撤销原因必须直接可见')
      await help(page, dialog.getByRole('button', { name: '查看上传记录说明', exact: true }).first(), 'demo_boss', `attachments-${key}-audit`, dialog)
      await help(page, dialog.getByRole('button', { name: '查看附件说明说明', exact: true }), '附件', `attachments-${key}-help`, dialog)
    }, { viewport: { width, height: width > 600 ? 1080 : 844 }, deviceScaleFactor: 2 })
  }

  add(find('dev-page-product-core-desktop-light'), 'product-core', async page => {
    await page.locator('.erp-dev-product-core-table tbody tr').nth(16).waitFor()
    await capture(page, 'product-core')
    assert.equal(await page.locator('.erp-dev-product-core-table tbody tr').count(), 17)
    if (!baseline) {
      const details = page.locator('.erp-dev-product-core-scope').first()
      const keyword = (await details.locator('li').first().innerText()).slice(0, 12)
      await details.locator('summary').click()
      await capture(page, 'product-core-expanded')
      await page.getByPlaceholder('搜索能力、范围或边界').fill(keyword)
      await page.locator('.erp-dev-product-core-scope[open] li').filter({ hasText: keyword }).first().waitFor()
      await capture(page, 'product-core-search')
    } else {
      await capture(page, 'product-core-expanded')
      // Same query is taken from the formal source via the complete row text in baseline.
    }
  }, { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2 })

  add(find('dev-quality-gates-desktop-light'), 'quality-error', async page => {
    await page.getByText('质量门禁状态读取失败', { exact: true }).waitFor()
    await capture(page, 'quality-error')
    if (!baseline) assert.equal(await page.locator('.ant-alert-error').count(), 1, '同源摘要读取失败只显示一块主错误')
    await page.unroute('**/__dev/api/qa/quality-gates', qualityFailure)
    await page.getByRole('button', { name: /刷新状态$/u }).click()
    await page.getByText('GitLab 普通 CI 已通过', { exact: true }).waitFor()
    await capture(page, 'quality-recovered')
    assert.equal(await page.getByText('质量门禁状态读取失败', { exact: true }).count(), 0)
  }, { viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2,
    beforeNavigate: async page => {
      await find('dev-quality-gates-desktop-light').beforeNavigate(page)
      await page.route('**/__dev/api/qa/quality-gates', qualityFailure)
    }, expectedConsoleErrorPatterns: [/503/u],
  })
  async function qualityFailure(route) {
    await route.fulfill({ status: 503, json: { message: '状态来源暂不可用，请稍后重试。' } })
  }
  return results
}
