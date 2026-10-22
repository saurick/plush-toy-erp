import { assertNoHorizontalOverflow } from './pageAssertions.mjs'

export function createTaskItemSemanticsScenarios({ assert }) {
  const now = Math.floor(Date.now() / 1000)
  const shared = {
    version: 1,
    task_group: 'engineering_check',
    owner_role_key: 'sales',
    task_status_key: 'blocked',
    task_status_label: '阻塞',
    business_status_key: 'blocked',
    business_status_label: '业务阻塞',
    source_id: null,
    source_type: null,
    source_no: null,
    created_at: now - 86400 * 8,
    due_at: now - 86400 * 5,
    due_status: 'overdue',
    alert_level: 'warning',
    assignee_id: 0,
    discovery: { assignee_name: '不应显示的旧姓名' },
    payload: {},
    display_context: {
      available: true,
      source_no: '',
      items: [{ kind: 'product', name: '示例星星挂兔', code: 'RABBIT-17' }],
    },
  }
  const tasks = [
    { ...shared, id: 97301, task_code: 'STYLE-L1-ITEM-COLOR', task_name: '确认颜色', blocked_reason: '客户尚未确认产品颜色。' },
    {
      ...shared,
      id: 97302,
      task_code: 'STYLE-L1-ITEM-CUSTOMER',
      task_name: '补齐客户资料',
      blocked_reason: '客户联系人和收货地址尚未补齐。',
      assignee_id: 99931,
      discovery: { assignee_name: '' },
      source_type: 'sales_order',
      source_id: 431,
      display_context: { ...shared.display_context, source_no: 'SO-DEMO-0431' },
    },
    {
      ...shared,
      id: 97303,
      task_code: 'STYLE-L1-ITEM-UNAVAILABLE',
      task_name: '重新核对资料',
      display_context: { available: false, source_no: 'STALE-SOURCE', items: [{ kind: 'product', name: '不应显示的旧产品', code: 'STALE-CODE' }] },
    },
    {
      ...shared,
      id: 97304,
      task_code: 'STYLE-L1-ITEM-NAME',
      task_name: '资料复核',
      payload: {},
      source_type: 'sales_order',
      display_context: { available: true, source_no: 'SO-DEMO-0432', items: [] },
    },
  ]
  tasks.forEach((task, index) => { task.created_at = shared.created_at - index })
  tasks.push({ ...shared, id: 97305, task_code: 'STYLE-L1-ITEM-DONE', task_name: '已完成资料核对', task_status_key: 'done', completed_at: now - 60 })
  tasks.push({ ...shared, id: 97306, task_code: 'STYLE-L1-ITEM-DONE-UNDATED', task_name: '已完成收款核对', task_status_key: 'done', completed_at: null })
  const semantics = [
    { mobile: true, theme: 'light' },
    { mobile: true, theme: 'dark' },
    { mobile: false, theme: 'light' },
  ].map(({ mobile, theme }) => ({
    name: `task-item-semantics-${mobile ? 'mobile' : 'desktop'}-${theme}`,
    path: mobile ? '/m/sales/tasks' : '/erp/task-board?lane=exception',
    auth: 'admin',
    themeMode: theme,
    viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 },
    deviceScaleFactor: mobile ? 3 : 3840 / 1440,
    ...(mobile ? {
      adminProfile: {
        username: 'style-l1-item-semantics',
        is_super_admin: false,
        roles: [{ role_key: 'sales', name: '业务' }],
        permissions: ['mobile.sales.access', 'workflow.task.read', 'product.read'],
        menus: [],
      },
    } : {}),
    effectiveSession: {
      configRevision: 'style-l1-item-semantics',
      configHash: 'style-l1-item-semantics-hash',
      customer: { key: 'yoyoosun', name: '永绅' },
      pages: ['global-dashboard', 'task-board'],
      actions: ['mobile.sales.access', 'workflow.task.read', 'product.read'],
      workflow_visible_owner_role_keys_by_capability: { 'workflow.task.read': ['sales'] },
      fieldPolicies: {},
      workPools: [],
      source: 'active_customer_config_revision',
    },
    workflowTaskFixtures: tasks,
    verify: async (page) => {
      const row = (id) => page.locator(mobile ? `[data-mobile-task-id="${id}"]` : `tr[data-task-id="${id}"]`)
      const color = row(97301)
      const customer = row(97302)
      await color.getByText('确认颜色', { exact: true }).waitFor()
      assert.equal(await color.locator('.erp-task-simulation').count(), 0)
      const source = mobile ? color.locator('.erp-task-identity__source') : color.locator('td').nth(1)
      assert.match(await source.innerText(), /未关联业务单据/u)
      assert.doesNotMatch(await source.innerText(), /模拟任务|业务阻塞|样例-业务-01/u)
      assert.equal(await source.getByRole('button', { name: '复制单据编号', exact: true }).count(), 0)
      assert.match(await color.innerText(), /待领取/u)
      assert.doesNotMatch(await color.innerText(), /岗位待领取|不应显示的旧姓名/u)
      assert.match(await customer.innerText(), /已指定办理人/u)
      assert.equal(await customer.locator('.erp-task-source__number').innerText(), 'SO-DEMO-0431')
      assert.equal(await customer.locator('.erp-task-simulation').count(), 0)
      assert.equal(await row(97304).locator('.erp-task-simulation').count(), 0, '任务名称不能决定模拟标记')
      assert.match(await row(97303).innerText(), /关联单据已不可用/u)
      if (mobile) assert.equal((await row(97303).innerText()).match(/关联单据已不可用/gu).length, 1)
      assert.doesNotMatch(await row(97303).innerText(), /不应显示的旧产品|STALE-SOURCE|STALE-CODE/u)
      if (mobile) {
        assert.equal(await color.locator('.mobile-task-list-row__business').innerText(), '所属业务：业务阻塞')
        const footer = await color.locator('.erp-task-card__footer').evaluate((node) => {
          const assignee = node.querySelector('[aria-label^="办理人"]')
          const time = node.querySelector('.erp-task-timing')
          const box = (element) => element.getBoundingClientRect()
          return { assigneeTop: box(assignee).top, timeTop: box(time).top, width: box(node).width }
        })
        assert(Math.abs(footer.assigneeTop - footer.timeTop) <= 4, `390px 常规责任与截止应同排：${JSON.stringify(footer)}`)
      }
      const field = await color.locator('.erp-task-identity__card-body').evaluate((node) => {
        const label = getComputedStyle(node.querySelector('.erp-task-identity__field-label'))
        const value = getComputedStyle(node.querySelector('.erp-task-identity__field-value'))
        return { labelColor: label.color, valueColor: value.color, labelStyle: label.fontStyle, valueStyle: value.fontStyle }
      })
      assert.notEqual(field.labelColor, field.valueColor)
      assert.equal(field.labelStyle, 'normal')
      assert.equal(field.valueStyle, 'normal')
      for (const width of mobile ? [320, 390, 1440] : [390, 1440]) {
        await page.setViewportSize({ width, height: 900 })
        await assertNoHorizontalOverflow(page)
        assert.equal(await color.evaluate((node) => node.tagName), mobile ? 'DIV' : 'TR')
        assert.match(await color.innerText(), /客户尚未确认产品颜色/u)
      }
      if (mobile) {
        const tabs = page.getByRole('tablist', { name: '任务状态', exact: true })
        await tabs.getByRole('tab', { name: /已办/ }).click()
        await row(97305).waitFor()
        await row(97306).getByText('结束时间未记录', { exact: true }).waitFor()
        assert.equal(await row(97306).locator('.erp-task-timing time, .erp-task-timing__row--danger').count(), 0)
        assert.match(await row(97305).innerText(), /未指定办理人/u)
        assert.doesNotMatch(await row(97305).innerText(), /待领取|不应显示的旧姓名/u)
        await tabs.getByRole('tab', { name: /待办/ }).click()
        await color.waitFor()
      }
      await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 })
    },
  }))
  return [...semantics, ...createTaskItemLayoutScenarios({ assert })]
}

function createTaskItemLayoutScenarios({ assert }) {
  return [
    { mobile: true, width: 390, theme: 'light' },
    { mobile: true, width: 320, theme: 'light' },
    { mobile: true, width: 390, theme: 'dark' },
    { mobile: false, width: 1440, theme: 'light' },
    { mobile: true, width: 390, theme: 'light', restricted: true },
  ].map(({ mobile, width, theme, restricted = false }) => {
    const now = Math.floor(Date.now() / 1000)
    const product = { kind: 'product', name: '示例狐狸', code: 'FOX-1', product_id: 1, image_attachment_id: 880001, order_no: 'SO-001' }
    const rabbit = { kind: 'product', name: '示例挂兔', code: 'RABBIT-2', product_id: 2, image_attachment_id: 0 }
    const bear = { kind: 'product', name: '示例小熊', code: 'BEAR-3', product_id: 3, image_attachment_id: 880003 }
    const material = { kind: 'material', name: '黑色塑料眼', code: 'MAT-8', supplier_item_no: 'EY-08' }
    const base = { version: 1, owner_role_key: 'sales', task_group: 'engineering_check', task_status_key: 'ready', business_status_key: '', business_status_label: '', alert_level: 'info', assignee_id: 0, source_type: 'shipment', source_id: 410, source_no: 'SHIP-001', created_at: now, payload: {} }
    const entries = [
      { id: 97401, task_name: '准备并办理发货', due_at: now + 86400 * 3, display_context: { available: true, source_no: 'SHIP-001', items: [product] } },
      { id: 97402, task_name: '核对多款产品资料', display_context: { available: true, source_no: 'SHIP-002', items: [product, rabbit, bear] } },
      { id: 97403, task_name: '核对辅料到货差异', source_type: 'purchase_order', display_context: { available: true, source_no: 'PO-003', source_line_count: 1, items: [material] } },
      { id: 97404, task_name: '核对包装齐套资料', source_type: 'production_order', display_context: { available: true, source_no: 'PROD-004', items: [product, material] } },
      { id: 97405, task_name: '核对收款说明', source_type: 'finance_payment', display_context: { available: true, source_no: 'PAY-005', items: [] } },
      { id: 97406, task_name: '重新核对关联资料', display_context: { available: false, source_no: 'STALE-SOURCE', items: [{ ...product, name: '不可展示的旧产品', code: 'STALE-CODE' }] } },
      { id: 97407, task_name: '核对联名周年限定礼盒的包装与海外交付资料', blocked_reason: mobile ? '等待客户确认多语言说明、收货地址及包装资料。'.repeat(3) : '', task_status_key: mobile ? 'blocked' : 'ready', display_context: { available: true, source_no: 'SO-2026-OVERSEAS-LONG-007', items: [{ ...product, name: '森林系列刺绣公仔与可拆卸背包配件套装'.repeat(mobile ? 2 : 5) }] } },
      { id: 97408, task_name: '核对产品图片', display_context: { available: true, source_no: 'SHIP-008', items: [{ ...product, product_id: 8, image_attachment_id: 880008, name: '失败重试产品' }] } },
    ].map((entry, index) => ({ ...base, ...entry, created_at: now - index, task_code: `STYLE-L1-ITEM-LAYOUT-${entry.id}` }))
    const downloads = new Map()
    const actions = ['workflow.task.read', 'mobile.sales.access', ...(restricted ? [] : ['product.read'])]
    return {
      name: `task-item-layout-${mobile ? 'mobile' : 'desktop'}-${width}-${theme}${restricted ? '-restricted' : ''}`,
      path: mobile ? '/m/sales/tasks' : '/erp/task-board?mode=todo&lane=actionable',
      auth: 'admin',
      themeMode: theme,
      viewport: { width, height: mobile ? 844 : 1000 },
      deviceScaleFactor: mobile ? 3 : 3840 / 1440,
      ...(mobile ? { adminProfile: { username: 'style-l1-item-layout', is_super_admin: false, roles: [{ role_key: 'sales', name: '业务' }], permissions: actions, menus: [] } } : {}),
      effectiveSession: { configRevision: 'style-l1-item-layout', configHash: 'style-l1-item-layout-hash', customer: { key: 'yoyoosun', name: '永绅' }, pages: ['global-dashboard', 'task-board'], actions, workflow_visible_owner_role_keys_by_capability: { 'workflow.task.read': ['sales'] }, fieldPolicies: {}, workPools: [], source: 'active_customer_config_revision' },
      workflowTaskFixtures: entries,
      beforeNavigate: async (page) => {
        downloads.clear()
        const content = await page.evaluate(() => {
          const canvas = document.createElement('canvas')
          canvas.width = 96; canvas.height = 96
          const context = canvas.getContext('2d')
          context.fillStyle = '#729885'; context.fillRect(0, 0, 96, 96)
          return canvas.toDataURL('image/png').split(',')[1]
        })
        await page.route('**/rpc/attachment', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (method !== 'download_attachment') return route.fallback()
          const attachmentID = Number(params.id)
          downloads.set(attachmentID, (downloads.get(attachmentID) || 0) + 1)
          const result = attachmentID === 880008 && downloads.get(attachmentID) === 1
            ? { code: 50000, message: '暂不可用' }
            : { code: 0, message: '', data: { attachment: { id: attachmentID, owner_type: 'product', owner_id: attachmentID - 880000, mime_type: 'image/png', content_base64: content } } }
          await route.fulfill({ json: { jsonrpc: '2.0', id, result } })
        })
      },
      verify: async (page) => {
        const row = (id) => page.locator(mobile ? `[data-mobile-task-id="${id}"]` : `tr[data-task-id="${id}"]`)
        await row(97405).getByText('未关联产品／物料', { exact: true }).waitFor()
        assert.equal(await row(97405).locator('.erp-task-identity__code').count(), 0)
        await row(97405).getByText('未设置截止', { exact: true }).waitFor()
        assert.equal(await row(97405).locator('.erp-task-timing time').count(), 0)
        assert.equal(await row(97406).getByText('关联单据已不可用', { exact: true }).count(), 1)
        assert.doesNotMatch(await row(97406).innerText(), /不可展示的旧产品|STALE-/u)
        const boxes = []
        for (const id of [97401, 97402, 97403, 97404, 97405]) {
          boxes.push(await row(id).evaluate((node) => {
            const rect = node.getBoundingClientRect()
            const relative = (selector) => { const part = node.querySelector(selector)?.getBoundingClientRect(); return part ? part.top - rect.top : null }
            const footer = node.querySelector('.erp-task-card__footer')
            const textBounds = (element) => {
              const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
              const bounds = []
              for (let text = walker.nextNode(); text; text = walker.nextNode()) {
                if (!text.textContent.trim()) continue
                const range = document.createRange()
                range.selectNodeContents(text)
                bounds.push(range.getBoundingClientRect())
              }
              return { top: Math.min(...bounds.map((box) => box.top)), bottom: Math.max(...bounds.map((box) => box.bottom)) }
            }
            const image = node.querySelector('.erp-task-product-image').getBoundingClientRect()
            const body = node.querySelector('.erp-task-identity__card-body')
            const item = body.querySelector('.erp-task-identity__item').getBoundingClientRect()
            const spacing = footer ? {
              sourceToDivider: footer.getBoundingClientRect().top - textBounds(node.querySelector('.erp-task-identity__source')).bottom,
              dividerToText: textBounds(footer).top - footer.getBoundingClientRect().top,
              bottomSpace: rect.bottom - textBounds(footer).bottom,
              imageToSummaryCenter: Math.abs(image.top + image.height / 2 - item.top - item.height / 2),
            } : null
            return { height: rect.height, imageSize: image.width, association: body.getBoundingClientRect().height, source: relative('.erp-task-identity__source'), footer: relative('.erp-task-card__footer'), spacing, overflow: node.scrollWidth > node.clientWidth + 1 }
          }))
        }
        const compactTable = !mobile && await page.evaluate(() => document.documentElement.dataset.erpDensity === 'compact')
        if (compactTable) {
          assert(boxes.every((box) => box.height >= 76 && box.height <= 80), `紧凑表格保留关联清单触区，普通行维持 76–80px：${JSON.stringify(boxes)}`)
        } else {
          assert(Math.max(...boxes.map((box) => box.height)) - Math.min(...boxes.map((box) => box.height)) <= 1, `五类常规条目应等高：${JSON.stringify(boxes)}`)
        }
        const imageSize = compactTable ? 48 : 64
        assert(boxes.every((box) => !box.overflow && box.association >= imageSize && box.imageSize === imageSize))
        assert.equal(await page.locator('.erp-task-product-image__zoom').count(), 0)
        if (mobile) for (const part of ['source', 'footer']) assert(Math.max(...boxes.map((box) => box[part])) - Math.min(...boxes.map((box) => box[part])) <= 1, `${part} 应对齐：${JSON.stringify(boxes)}`)
        if (mobile) {
          assert(boxes.every((box) => box.spacing.sourceToDivider <= 10.5 && box.spacing.dividerToText <= 10.5 && box.spacing.bottomSpace <= 18), `按文字边界校验留白，窄屏不预留空白第二行：${JSON.stringify(boxes)}`)
          assert(boxes.every((box) => box.spacing.imageToSummaryCenter <= 1), `图像与关联摘要在占位区内居中：${JSON.stringify(boxes)}`)
        }
        assert((await row(97407).boundingBox()).height > boxes[0].height, '长名称与受阻原因应自然增高')
        assert.equal(await page.locator('button button').count(), 0)
        await assertNoHorizontalOverflow(page)
        if (restricted) {
          await row(97401).getByLabel('示例狐狸：无图片读取权限', { exact: true }).waitFor()
          assert.equal(await row(97401).getByRole('button', { name: /大图|重试/u }).count(), 0)
          assert.equal(downloads.size, 0)
          return
        }
        const trigger = row(97402).getByRole('button', { name: '查看3 款产品', exact: true })
        await trigger.click()
        const list = page.locator('.erp-task-linked-items-modal')
        await list.getByText('示例挂兔', { exact: true }).waitFor()
        assert.equal(await list.locator('.erp-task-identity__row').count(), 3)
        assert.equal(await list.getByLabel('示例挂兔：暂无可显示的图片', { exact: true }).count(), 1)
        await list.getByRole('button', { name: '查看示例狐狸大图', exact: true }).click()
        await page.getByRole('button', { name: '关闭图片预览', exact: true }).waitFor()
        await page.getByRole('button', { name: '关闭图片预览', exact: true }).click()
        await page.getByRole('button', { name: '关闭图片预览', exact: true }).waitFor({ state: 'hidden' })
        await list.getByText('示例挂兔', { exact: true }).waitFor()
        await page.keyboard.press('Escape')
        await list.waitFor({ state: 'hidden' })
        assert.equal(await trigger.evaluate((node) => node === document.activeElement), true, '清单关闭后焦点回到数量入口')
        await row(97404).getByRole('button', { name: '查看2 项关联内容', exact: true }).click()
        await list.getByText('黑色塑料眼', { exact: true }).waitFor()
        assert.match(await list.innerText(), /款号.*EY-08/u)
        await page.waitForFunction(() => document.activeElement?.closest('.ant-modal-wrap')?.querySelector('.erp-task-linked-items-modal'), null, { timeout: 5000 })
        await page.keyboard.press('Escape')
        await list.waitFor({ state: 'hidden' })
        const retry = row(97408).getByRole('button', { name: '重试失败重试产品图片', exact: true })
        await row(97408).scrollIntoViewIfNeeded()
        await retry.click()
        await row(97408).getByRole('button', { name: '查看失败重试产品大图', exact: true }).waitFor()
        assert.equal(downloads.get(880008), 2)
        assert.equal(await row(97401).evaluate((node) => node.tagName), mobile ? 'DIV' : 'TR')
      },
    }
  })
}
