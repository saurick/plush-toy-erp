import { assertNoHorizontalOverflow } from './pageAssertions.mjs'

export function createTaskIdentitySearchScenarios({ assert }) {
  const task = {
    id: 97201,
    version: 1,
    task_code: 'STYLE-L1-MATCH-IDENTITY',
    task_name: '核对产品资料',
    task_group: 'engineering_check',
    owner_role_key: 'engineering',
    task_status_key: 'ready',
    source_type: 'sales_order',
    source_no: 'SO-MATCH-IDENTITY',
    created_at: 1_788_840_000,
    payload: {},
    display_context: {
      available: true,
      source_no: 'SO-MATCH-IDENTITY',
      items: [
        {
          kind: 'product',
          product_id: 8,
          name: '雪花小鹿',
          code: 'DEER-14',
          image_attachment_id: 0,
        },
        {
          kind: 'product',
          product_id: 7,
          name: '饼干小熊',
          code: 'BEAR-17',
          style_no: 'STYLE-BEAR',
          image_attachment_id: 8801,
        },
        {
          kind: 'product',
          product_id: 9,
          name: '云朵小熊',
          code: 'BEAR-01',
          image_attachment_id: 0,
        },
      ],
    },
  }
  return [false, true].map((mobile) => ({
    name: `${mobile ? 'mobile' : 'erp'}-task-matched-product-search`,
    path: mobile ? '/m/engineering/tasks' : '/erp/task-board',
    auth: 'admin',
    viewport: mobile
      ? { width: 390, height: 844 }
      : { width: 1440, height: 900 },
    deviceScaleFactor: mobile ? 3 : 3840 / 1440,
    ...(mobile
      ? {
          adminProfile: {
            username: 'style-l1-match-search',
            is_super_admin: false,
            roles: [{ role_key: 'engineering', name: '工程' }],
            permissions: [
              'mobile.engineering.access',
              'workflow.task.read',
              'product.read',
            ],
            menus: [],
          },
        }
      : {}),
    effectiveSession: {
      configRevision: 'style-l1-match-search',
      configHash: 'style-l1-match-search-hash',
      customer: { key: 'yoyoosun', name: '永绅' },
      pages: ['global-dashboard', 'task-board'],
      actions: [
        'mobile.engineering.access',
        'workflow.task.read',
        'product.read',
      ],
      workflow_visible_owner_role_keys_by_capability: {
        'workflow.task.read': ['engineering'],
      },
      fieldPolicies: {},
      workPools: [],
      source: 'active_customer_config_revision',
    },
    workflowTaskFixtures: [task],
    verify: async (page) => {
      const row = page
        .locator(
          mobile ? '[data-mobile-task-id="97201"]' : '.erp-task-table-row'
        )
        .filter({ hasText: 'SO-MATCH-IDENTITY' })
      await row
        .getByText('雪花小鹿共 3 款产品', { exact: true })
        .waitFor()
      for (const width of mobile ? [320, 390, 1440] : [390, 1440]) {
        await page.setViewportSize({ width, height: 900 })
        const metrics = await row.evaluate((node) => {
          const image = node.querySelector('.erp-task-product-image').getBoundingClientRect()
          const heading = node.querySelector('.erp-task-identity__card-heading')
          const body = node.querySelector('.erp-task-identity__card-body')
          const status = node.querySelector('.erp-task-identity__status')
          return {
            image: { width: image.width, height: image.height },
            tagName: node.tagName,
            taskTitle: heading?.textContent.trim(),
            productTitle: node.querySelector('.erp-task-identity__product')?.textContent.trim(),
            headingBottom: heading?.getBoundingClientRect().bottom,
            bodyTop: body?.getBoundingClientRect().top,
            statusRight: status?.getBoundingClientRect().right,
            rowRight: node.getBoundingClientRect().right,
            footer: Boolean(node.querySelector('.erp-task-card__footer [aria-label^="办理人"]')),
          }
        })
        assert.equal(metrics.tagName, mobile ? 'DIV' : 'TR', `工作入口与视口宽度分开：${width}px`)
        assert.match(metrics.taskTitle, /核对产品资料/u)
        assert.doesNotMatch(metrics.taskTitle, /雪花小鹿/u)
        assert.equal(metrics.productTitle, '雪花小鹿共 3 款产品')
        assert.equal(metrics.image.width, 64)
        assert.equal(metrics.image.height, 64)
        if (mobile) {
          assert.equal(metrics.bodyTop - metrics.headingBottom, 4, JSON.stringify(metrics))
          assert(metrics.statusRight <= metrics.rowRight - 8, JSON.stringify(metrics))
          assert(metrics.footer, '手机版办理人集中在卡片底部')
          assert(new URL(page.url()).pathname.startsWith('/m/'))
        } else {
          assert.equal(await page.getByTestId('mobile-role-nav-tasks').count(), 0, '电脑版窄屏仍保持电脑版入口')
          assert(new URL(page.url()).pathname.startsWith('/erp/'))
        }
        await assertNoHorizontalOverflow(page)
      }
      await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 })
      const search = mobile
        ? page.getByRole('searchbox', {
            name: '搜索订单、产品、物料或款号',
            exact: true,
          })
        : page.getByPlaceholder('订单 / 产品 / 物料 / 款号')
      const submit = async (keyword) => {
        await search.fill(keyword)
        await search.press('Enter')
      }
      for (const keyword of ['熊', 'bear-17', 'style-bear']) {
        await submit(keyword)
        const count = keyword === '熊' ? 2 : 1
        await row
          .getByText(`饼干小熊命中 ${count} 款，共 3 款`, { exact: true })
          .waitFor()
        const image = row.getByRole('img', {
          name: '饼干小熊主图',
          exact: true,
        })
        await image.waitFor()
        assert(
          await image.evaluate(
            (node) => node.complete && node.naturalWidth > 0
          ),
          '命中产品必须使用自己的有效图片'
        )
        await assertNoHorizontalOverflow(page)
      }
      await submit('')
      await row
        .getByText('雪花小鹿共 3 款产品', { exact: true })
        .waitFor()
      assert.equal(await row.getByText(/命中 \d/u).count(), 0)
      await submit('SO-MATCH-IDENTITY')
      await row
        .getByText('雪花小鹿共 3 款产品', { exact: true })
        .waitFor()
      assert.equal(
        await row.getByText(/命中 \d/u).count(),
        0,
        '单号命中不能冒充产品命中'
      )
      await submit('熊')
      await row
        .getByText('饼干小熊命中 2 款，共 3 款', { exact: true })
        .waitFor()
      if (mobile) {
        await page.setViewportSize({ width: 320, height: 700 })
        await assertNoHorizontalOverflow(page)
      }
    },
  }))
}
