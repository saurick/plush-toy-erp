import { readFile, writeFile } from 'node:fs/promises'
import { verifyMobileNavigationMotion } from './slidingMotionAssertions.mjs'

export function createDevToolbarExampleScenarios({ assert, assertNoHorizontalOverflow, outputDir }) {
  const requests = new WeakMap()
  const path = '/__dev/ui-design?page=controls&control=business-toolbar'
  const examples = [['inventory', '库存查询', '仓库'], ['purchase', '采购订单', '供应商'], ['tasks', '工作台待办', '办理人'], ['history', '历史记录', '操作人']]
  const current = (page) => page.locator('.erp-dev-toolbar-example__page:not([hidden])')
  const switchBusiness = async (page, label) => {
    await page.getByLabel('组合示例业务', { exact: true }).getByRole('radio', { name: label, exact: true }).locator('..').click()
    await current(page).getByRole('heading', { name: label, exact: true }).waitFor()
  }
  const choose = async (page, label, option, keyword) => {
    const input = page.getByRole('combobox', { name: label, exact: true })
    await page.locator('.ant-select').filter({ has: input }).locator('.ant-select-selector').click()
    if (keyword) await input.fill(keyword)
    await page.locator('.ant-select-dropdown:visible').getByText(option, { exact: true }).click()
    await page.locator('.ant-select-dropdown:visible').waitFor({ state: 'hidden' })
  }
  const begin = async (page) => {
    const collected = []
    requests.set(page, collected)
    page.on('request', (request) => {
      if (/^\/(?:rpc|api|templates)(?:\/|$)/u.test(new URL(request.url()).pathname)) collected.push(request.url())
    })
    await page.route('**/rpc/**', (route) => route.abort())
  }
  const inspect = async (page, name) => {
    await assertNoHorizontalOverflow(page, name)
    const metrics = await current(page).locator('.erp-business-operation-panel__command').evaluate((element) => {
      const box = element.getBoundingClientRect()
      const groups = [...element.children].flatMap((child) => child.classList.contains('erp-business-operation-panel__command-host') ? [...child.children] : [child])
      return { width: box.width, groups: groups.map((child) => ({ name: child.className, left: child.getBoundingClientRect().left - box.left, right: child.getBoundingClientRect().right - box.left })).filter(({ right, left }) => right - left > 1) }
    })
    for (const group of metrics.groups) assert(group.left >= -1 && group.right <= metrics.width + 1, `${name}: ${JSON.stringify(metrics)}`)
    assert.deepEqual(requests.get(page), [], '从初始导航起不读取、写入或保存业务数据')
    return metrics
  }
  const base = { path, viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2, beforeNavigate: begin }
  return [
    {
      ...base,
      name: 'dev-ui-purchase-production-tabs',
      verify: async (page) => {
        const comparison = page.getByRole('region', { name: '采购与生产页签位置对照', exact: true })
        const purchase = comparison.getByRole('region', { name: '采购页签位置对照', exact: true })
        const production = comparison.getByRole('region', { name: '生产页签位置对照', exact: true })
        const purchaseSearch = purchase.getByRole('textbox', { name: '采购对照搜索', exact: true })
        const productionSearch = production.getByRole('textbox', { name: '生产对照搜索', exact: true })
        const waitForSearch = (name, value) => page.waitForFunction((expected) => document.querySelector(`input[aria-label="${expected.name}"]`)?.value === expected.value, { name, value })
        await purchaseSearch.waitFor()
        const purchaseInput = await purchaseSearch.elementHandle()
        const productionInput = await productionSearch.elementHandle()
        const purchaseNumbers = await purchase.locator('tbody tr.ant-table-row td:first-child').allTextContents()
        await purchaseSearch.fill('PO-DEMO-001')
        assert.equal(await purchase.locator('tbody tr.ant-table-row').count(), 2, '输入仍是草稿')
        await purchaseSearch.press('Enter')
        assert.equal(await purchase.locator('tbody tr.ant-table-row').count(), 1)
        await purchase.getByRole('tab', { name: '采购跟进', exact: true }).click()
        assert.deepEqual(await purchase.locator('tbody tr.ant-table-row td:first-child').allTextContents(), purchaseNumbers, '采购跟进仍围绕同一批单据')
        await purchaseSearch.fill('没有匹配内容')
        await purchaseSearch.press('Enter')
        await purchase.getByText('暂无匹配记录', { exact: true }).waitFor()
        await purchase.getByRole('button', { name: '清除搜索', exact: true }).click()
        assert.equal(await purchase.locator('tbody tr.ant-table-row').count(), 2)
        await purchase.getByRole('button', { name: '查看跟进', exact: true }).first().click()
        const followupDetail = page.getByRole('dialog').filter({ hasText: '采购对照 · 查看跟进' })
        await followupDetail.getByText('示例供应商甲', { exact: true }).waitFor()
        await followupDetail.getByRole('button', { name: '关闭', exact: true }).click()
        await followupDetail.waitFor({ state: 'hidden' })
        await purchase.getByRole('tab', { name: '订单列表', exact: true }).click()
        await waitForSearch('采购对照搜索', 'PO-DEMO-001')
        assert.equal(await purchaseSearch.inputValue(), 'PO-DEMO-001')
        assert.equal(await purchase.locator('tbody tr.ant-table-row').count(), 1)
        await purchaseSearch.fill('未提交草稿')
        await purchase.getByRole('tab', { name: '采购跟进', exact: true }).click()
        await waitForSearch('采购对照搜索', '')
        assert.equal(await purchaseSearch.inputValue(), '', '不同视图不串用未提交草稿')

        for (const [label, object, action] of [
          ['生产订单', '生产单', '查看计划'],
          ['生产执行', '执行批次', '查看批次'],
          ['生产记录', '生产记录', '查看记录'],
          ['异常处理', '处置申请', '查看处置'],
        ]) {
          await production.getByRole('tab', { name: label, exact: true }).click()
          await production.getByRole('columnheader', { name: object, exact: true }).waitFor()
          await production.getByRole('button', { name: action, exact: true }).first().click()
          const detail = page.getByRole('dialog').filter({ hasText: `生产对照 · ${action}` })
          await detail.getByText('本地虚构样例，仅演示查看，不办理真实业务。', { exact: true }).waitFor()
          await detail.getByRole('button', { name: '关闭', exact: true }).click()
          await detail.waitFor({ state: 'hidden' })
        }
        await production.getByRole('tab', { name: '生产执行', exact: true }).click()
        await productionSearch.fill('WIP-DEMO-001')
        await productionSearch.press('Enter')
        assert.equal(await production.locator('tbody tr.ant-table-row').count(), 1)
        await production.getByRole('tab', { name: '异常处理', exact: true }).click()
        await waitForSearch('生产对照搜索', '')
        assert.equal(await productionSearch.inputValue(), '')
        await production.getByRole('tab', { name: '生产执行', exact: true }).click()
        await waitForSearch('生产对照搜索', 'WIP-DEMO-001')
        assert.equal(await productionSearch.inputValue(), 'WIP-DEMO-001')
        await production.getByRole('tab', { name: '生产执行', exact: true }).press('ArrowRight')
        assert.equal(await production.getByRole('tab', { name: '生产记录', exact: true }).getAttribute('aria-selected'), 'true')
        assert.equal(await purchaseSearch.evaluate((node, previous) => node === previous, purchaseInput), true)
        assert.equal(await productionSearch.evaluate((node, previous) => node === previous, productionInput), true)

        const geometry = []
        for (const width of [1920, 1280]) {
          await page.setViewportSize({ width, height: 1080 })
          await comparison.scrollIntoViewIfNeeded()
          for (const [business, region] of [['purchase', purchase], ['production', production]]) {
            const bounds = await region.evaluate((root) => {
              const nav = root.querySelector('[role="tablist"]')
              const header = root.querySelector('.erp-business-page-header-card')
              const toolbar = root.querySelector('.erp-business-operation-panel')
              const box = nav.getBoundingClientRect()
              const parent = (header.contains(nav) ? header : toolbar).getBoundingClientRect()
              return { inHeader: header.contains(nav), inToolbar: toolbar.contains(nav), left: box.left, right: box.right, top: box.top, bottom: box.bottom, parentLeft: parent.left, parentRight: parent.right, parentTop: parent.top, parentBottom: parent.bottom }
            })
            assert.equal(bounds.inHeader, business === 'production')
            assert.equal(bounds.inToolbar, business === 'purchase')
            assert(bounds.left >= bounds.parentLeft - 1 && bounds.right <= bounds.parentRight + 1, JSON.stringify(bounds))
            assert(bounds.top >= bounds.parentTop - 1 && bounds.bottom <= bounds.parentBottom + 1, JSON.stringify(bounds))
            geometry.push({ width, business, ...bounds })
          }
          await assertNoHorizontalOverflow(page, `purchase-production-tabs-${width}`)
        }
        await page.setViewportSize({ width: 1920, height: 1080 })
        await comparison.getByRole('button', { name: '重置对照', exact: true }).click()
        assert.equal(await purchaseSearch.inputValue(), '')
        assert.equal(await productionSearch.inputValue(), '')
        const motion = []
        for (const [selector, target] of [['[aria-label="采购对照查询视角"]', 1], ['[aria-label="生产对照办理入口"]', 3]]) {
          motion.push(await verifyMobileNavigationMotion(page, assert, selector, target))
          motion.push(await verifyMobileNavigationMotion(page, assert, selector, 0, true))
        }
        await purchase.getByRole('tab', { name: '采购跟进', exact: true }).click()
        await production.getByRole('tab', { name: '异常处理', exact: true }).click()
        await comparison.scrollIntoViewIfNeeded()
        await page.screenshot({ path: `${outputDir}/dev-ui-purchase-production-tabs-4k.png` })
        await writeFile(`${outputDir}/dev-ui-purchase-production-tabs.json`, JSON.stringify({ geometry, motion, businessRequests: requests.get(page) }, null, 2))
        assert.deepEqual(requests.get(page), [], '采购与生产对照不读取、写入或保存业务数据')
        await Promise.all([purchaseInput.dispose(), productionInput.dispose()])
      },
    },
    {
      ...base,
      name: 'dev-ui-tab-rule-reference',
      verify: async (page) => {
        for (const [control, title] of [['business-toolbar', '业务工具栏组合'], ['navigation', '页签与视图']]) {
          const url = new URL(path, page.url())
          url.searchParams.set('control', control)
          if (page.url() !== url.href) await page.goto(url.href)
          const controls = page.getByRole('region', { name: '控件设计', exact: true })
          await controls.getByRole('heading', { name: title, exact: true }).waitFor()
          const reference = page.getByRole('link', { name: '页签层级与上下间距规范', exact: true })
          assert.equal(await reference.getAttribute('href'), '/__dev/ui-design?view=specification&read=reference#business-toolbar-composition')
          await reference.click()
          const document = page.getByRole('region', { name: '设计说明', exact: true })
          await document.getByRole('heading', { name: /业务工具栏的组合与差异/u }).waitFor()
          for (const term of ['独立业务入口', '内容切换', '上下间距']) {
            await document.getByRole('cell', { name: term, exact: true }).waitFor()
          }
          assert.equal(new URL(page.url()).hash, '#business-toolbar-composition')
          await page.goBack()
          await controls.getByRole('heading', { name: title, exact: true }).waitFor()
        }
        await page.getByRole('link', { name: '页签层级与上下间距规范', exact: true }).scrollIntoViewIfNeeded()
        await assertNoHorizontalOverflow(page, 'tab-rule-reference')
        assert.deepEqual(requests.get(page), [], '规范入口不读取或写入业务数据')
        await page.screenshot({ path: `${outputDir}/dev-ui-tab-rule-reference-4k.png` })
      },
    },
    {
      ...base,
name: 'dev-ui-toolbar-composition',
      verify: async (page) => {
        const inventory = current(page)
        const search = inventory.getByRole('textbox', { name: '库存查询搜索', exact: true })
        await search.waitFor()
        const inputNode = await search.elementHandle()
        const command = await inventory.locator('.erp-business-operation-panel__command').elementHandle()
        const navigation = await inventory.getByRole('tablist', { name: '库存查询内容分类', exact: true }).elementHandle()
        await search.fill('云朵')
        assert.equal(await inventory.locator('tbody tr.ant-table-row').count(), 5, '输入草稿不自动提交')
        await switchBusiness(page, '采购订单')
        await current(page).getByRole('button', { name: '新建采购订单', exact: true }).click()
        await current(page).getByRole('status', { name: '组合样例操作结果' }).filter({ hasText: '主动作示意' }).waitFor()
        await current(page).getByRole('button', { name: /草稿，共 4 条/u }).click()
        assert.equal(await current(page).locator('tbody tr.ant-table-row').count(), 4)
        await current(page).getByRole('tab', { name: '采购跟进', exact: true }).click()
        assert.equal(await current(page).getByRole('button', { name: '新建采购订单', exact: true }).count(), 0)
        assert.equal(await current(page).getByRole('group', { name: '采购订单快捷条件', exact: true }).count(), 0)
        await switchBusiness(page, '工作台待办')
        await current(page).getByRole('button', { name: /常规待办，共 4 条/u }).click()
        await current(page).getByRole('tab', { name: '日历', exact: true }).click()
        await current(page).getByLabel('本地待办日历', { exact: true }).waitFor()
        assert.equal(await current(page).getByRole('button', { name: '表格工具', exact: true }).count(), 0)
        await current(page).getByRole('tab', { name: '列表', exact: true }).click()
        await switchBusiness(page, '历史记录')
        await choose(page, '历史记录内容分类', '质检记录', '质检')
        assert.equal(await current(page).locator('tbody tr.ant-table-row').count(), 2)
        assert.equal(await current(page).locator('.erp-business-operation-panel__primary').count(), 0)
        await switchBusiness(page, '库存查询')
        assert.equal(await search.inputValue(), '云朵', '往返四业务保留未提交草稿')
        assert.equal(await search.evaluate((node, previous) => node === previous, inputNode), true)
        await search.press('Enter')
        assert.equal(await inventory.locator('tbody tr.ant-table-row').count(), 2)
        await inventory.locator('tbody input[type="radio"]').first().check()
        await page.getByRole('checkbox', { name: '显示职责标注', exact: true }).uncheck()
        assert.equal(await inventory.getByLabel('工具栏职责标注', { exact: true }).count(), 0)
        assert.equal(await inventory.locator('.erp-business-operation-panel__command').evaluate((node, previous) => node === previous, command), true, '关闭标注不重建工具栏')
        await inventory.getByRole('button', { name: '查看明细', exact: true }).click()
        const detail = page.getByRole('dialog').filter({ hasText: '演示记录详情' })
        await detail.getByText('本地虚构记录，仅用于交互设计演示。', { exact: true }).waitFor()
        await detail.getByRole('button', { name: '关闭', exact: true }).click()
        await detail.waitFor({ state: 'hidden' })
        await inventory.getByRole('button', { name: '表格工具', exact: true }).click()
        await page.getByRole('menuitem', { name: /列设置/u }).click()
        const columnDialog = page.getByRole('dialog').filter({ has: page.getByRole('list', { name: '演示库存查询列设置', exact: true }) })
        await columnDialog.locator('[data-column-key="scopeLabel"]').getByRole('checkbox').uncheck()
        await columnDialog.getByRole('button', { name: '完成', exact: true }).click()
        await columnDialog.waitFor({ state: 'hidden' })
        assert.equal(await inventory.getByRole('columnheader', { name: '仓库', exact: true }).count(), 0)
        await inventory.getByRole('button', { name: '表格工具', exact: true }).click()
        const downloadPromise = page.waitForEvent('download')
        await page.getByRole('menuitem', { name: /导出筛选结果/u }).click()
        const download = await downloadPromise
        const csv = await readFile(await download.path(), 'utf8')
        assert.match(csv, /仓库/u, '列隐藏不丢失导出字段')
        assert.equal(csv.trim().split(/\r?\n/u).length, 3, '导出完整筛选范围')
        await search.fill('')
        await search.press('Enter')
        await inventory.locator('.ant-pagination-item-2').click()
        await inventory.getByText('DEMO-INVENTORY-006', { exact: true }).waitFor()
        await inventory.locator('tbody input[type="radio"]').first().check()
        await switchBusiness(page, '采购订单')
        await current(page).getByRole('tab', { name: '订单列表', exact: true }).click()
        assert.equal(await current(page).getByRole('button', { name: /草稿，共 4 条/u }).getAttribute('aria-pressed'), 'true')
        await switchBusiness(page, '库存查询')
        assert.equal(await inventory.locator('tbody input[type="radio"]:checked').count(), 1, '返回保留分页和选择')
        await inventory.getByRole('tab', { name: '库存批次', exact: true }).click()
        assert.equal(await inventory.getByRole('tablist', { name: '库存查询内容分类', exact: true }).evaluate((node, previous) => node === previous, navigation), true)
        await inventory.getByRole('tab', { name: '库存余额', exact: true }).click()
        await inventory.getByLabel('库存余额展示方式').getByRole('radio', { name: '仓库分布', exact: true }).locator('..').click()
        await inventory.getByLabel('演示仓库分布', { exact: true }).waitFor()
        await inventory.getByLabel('库存余额展示方式').getByRole('radio', { name: '余额明细', exact: true }).locator('..').click()
        await page.getByRole('checkbox', { name: '显示职责标注', exact: true }).check()
        await inventory.getByRole('button', { name: '查询 · 共用交互', exact: true }).click()
        assert.equal(await inventory.locator('[data-toolbar-part="query"][data-highlighted="true"]').count(), 1)
        await page.getByRole('button', { name: '恢复示例', exact: true }).click()
        assert.equal(await current(page).getByRole('textbox', { name: '库存查询搜索', exact: true }).inputValue(), '')
        assert.equal(await page.locator('.erp-dev-toolbar-example__page').count(), 1, '恢复示例释放已访问的样例')
        await page.getByRole('navigation', { name: '控件设计目录', exact: true }).getByRole('button', { name: /组件选用/u }).click()
        await page.getByRole('link', { name: '操作业务工具栏组合示例', exact: true }).click()
        assert.equal(new URL(page.url()).searchParams.get('control'), 'business-toolbar', '组件目录直达同一真实组件样例')
        await page.reload({ waitUntil: 'domcontentloaded' })
        await current(page).getByRole('textbox', { name: '库存查询搜索', exact: true }).waitFor()
        await inspect(page, '组合与恢复')
        await page.screenshot({ path: `${outputDir}/dev-toolbar-composition-4k.png` })
        await Promise.all([inputNode.dispose(), command.dispose(), navigation.dispose()])
      },
    },
    {
      ...base,
name: 'dev-ui-toolbar-category-growth',
      verify: async (page) => {
        for (const [_key, label] of examples) {
          await switchBusiness(page, label)
          await choose(page, '组合示例增长场景', '假设：功能分类增多')
          if (label === '工作台待办') {
            assert.equal(await current(page).getByRole('tab', { name: '列表', exact: true }).getAttribute('aria-selected'), 'true')
            assert.equal(await current(page).getByRole('group', { name: '工作台待办快捷条件', exact: true }).getByRole('button').count(), 4)
            await current(page).getByRole('button', { name: /^筛选(?:，|$)/u }).click()
            await choose(page, '扩展待办分类', '扩展分类 F', 'F')
            await page.keyboard.press('Escape')
          } else await choose(page, `${label}内容分类`, '扩展分类 F', 'F')
          assert.equal(await current(page).locator('tbody tr.ant-table-row').count(), 1)
          for (const width of [1366, 1920]) {
            await page.setViewportSize({ width, height: 1080 })
            await inspect(page, `${label}-分类增长-${width}`)
          }
          await choose(page, '组合示例增长场景', '当前分类示意')
          assert.equal(await current(page).locator('tbody tr.ant-table-row').count(), 5, '移除假设分类后不残留不可见条件')
        }
        await page.screenshot({ path: `${outputDir}/dev-toolbar-category-growth-4k.png` })
        assert.deepEqual(requests.get(page), [])
      },
    },
    {
      ...base,
name: 'dev-ui-toolbar-data-growth',
      verify: async (page) => {
        const evidence = []
        for (const [key, label, scope] of examples) {
          await switchBusiness(page, label)
          const classificationCount = await current(page).getByRole('tab').count()
          await choose(page, '组合示例增长场景', '假设：数据选项增多')
          assert.equal(await current(page).getByRole('tab').count(), classificationCount, '30 条数据选项不增加内容分类')
          await current(page).getByRole('button', { name: /^筛选(?:，|$)/u }).click()
          await choose(page, scope, `示例${scope} 30`, '30')
          await page.keyboard.press('Escape')
          assert.equal(await current(page).locator('tbody tr.ant-table-row').count(), 2)
          assert.match(await current(page).locator('tbody').innerText(), new RegExp(`示例${scope} 30`, 'u'))
          await choose(page, '组合示例增长场景', '当前分类示意')
          assert.equal(await current(page).locator('tbody tr.ant-table-row').count(), 5)
          await choose(page, '组合示例增长场景', '假设：数据选项增多')
          assert.equal(await current(page).locator('tbody tr.ant-table-row').count(), 5, '候选减少后清除失效选择，再扩展不恢复隐藏条件')
          await current(page).getByRole('button', { name: /^筛选(?:，|$)/u }).click()
          await choose(page, scope, `示例${scope} 30`, '30')
          await page.keyboard.press('Escape')
          await current(page).getByRole('button', { name: /^筛选(?:，|$)/u }).click()
          await page.getByRole('dialog', { name: '筛选条件', exact: true }).getByRole('button', { name: '清空筛选', exact: true }).click()
          await page.keyboard.press('Escape')
          assert.equal(await current(page).locator('tbody tr.ant-table-row').count(), 5)
          for (const width of [1366, 1920]) {
            await page.setViewportSize({ width, height: 1080 })
            evidence.push({ business: key, width, ...await inspect(page, `${label}-数据增长-${width}`) })
          }
        }
        await writeFile(`${outputDir}/dev-toolbar-data-growth-geometry.json`, JSON.stringify(evidence, null, 2))
        await page.screenshot({ path: `${outputDir}/dev-toolbar-data-growth-4k.png` })
        const reading = page.locator('.erp-control-library-content')
        await reading.evaluate((node) => { node.scrollTop = node.scrollHeight })
        await page.getByRole('heading', { name: '什么时候用，为什么这样设计', exact: true }).scrollIntoViewIfNeeded()
        assert.equal(await page.getByRole('heading', { name: '什么时候用，为什么这样设计', exact: true }).isVisible(), true, '长样例底部规则可达')
      },
    },
  ]
}
