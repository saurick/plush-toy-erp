import { WORKBENCH_APPEARANCE_STORAGE_KEY, normalizeERPAccountAppearance } from '../../src/common/theme/erpAppearance.mjs'

export function createDevBusinessComponentScenarios({ assert, assertNoHorizontalOverflow, customerRuntimeEffectiveSession }) {
  const verifyForm = async (page) => {
    const businessRequests = []
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/rpc/')) businessRequests.push(request.url())
    })
    const stage = page.locator('.erp-control-library-stage')
    const editor = stage.getByRole('region', { name: '演示采购草稿', exact: true })
    const subject = editor.getByLabel('草稿名称', { exact: true })
    await stage.getByRole('radio', { name: '首次失败后重试', exact: true }).locator('..').click()
    await stage.getByRole('button', { name: '编辑演示草稿', exact: true }).click()
    await editor.waitFor()
    await subject.fill('')
    await editor.getByRole('button', { name: '保存', exact: true }).click()
    await editor.getByText('请填写草稿名称', { exact: true }).waitFor()
    assert(await subject.evaluate((node) => node === document.activeElement), '校验失败定位字段')
    await subject.fill('多行材料演示')
    await editor.getByRole('button', { name: '添加明细', exact: true }).click()
    await editor.getByLabel('第 2 条材料名称', { exact: true }).fill('加长材料名称\n补充规格与颜色')
    const second = editor.getByRole('rowgroup', { name: '第 2 条明细', exact: true })
    await second.locator('summary').click()
    const note = editor.getByLabel('第 2 条备注', { exact: true })
    const longNote = '包装要求与分批安排。\n'.repeat(8)
    await note.fill(longNote)
    await page.waitForFunction(() => document.querySelector('textarea[aria-label="第 2 条备注"]')?.clientHeight > 100)
    assert((await note.boundingBox()).height > 100, '长文本随内容增高')

    if (page.viewportSize().width >= 768) {
      await editor.getByRole('button', { name: '全屏编辑', exact: true }).click()
      const bounds = await editor.boundingBox()
      assert.equal(Math.round(bounds.width), page.viewportSize().width)
      await note.press('Escape')
      await editor.getByRole('button', { name: '全屏编辑', exact: true }).waitFor()
      assert.equal(await note.inputValue(), longNote, '退出全屏保留明细与输入')
    }
    await editor.getByRole('button', { name: '移除第 2 条明细', exact: true }).click()
    await editor.getByRole('button', { name: '移除第 1 条明细', exact: true }).click()
    await editor.getByText('暂无演示明细，可添加一条继续操作', { exact: true }).waitFor()
    await editor.getByRole('button', { name: '添加明细', exact: true }).click()
    await editor.getByLabel('第 1 条材料名称', { exact: true }).fill('恢复后的演示材料')
    await editor.getByRole('button', { name: '返回列表', exact: true }).click()
    const confirm = page.getByRole('dialog').filter({ hasText: '放弃未保存的修改？' })
    await confirm.getByRole('button', { name: '继续编辑', exact: true }).click()
    await confirm.waitFor({ state: 'hidden' })
    assert.equal(await subject.inputValue(), '多行材料演示')
    await page.getByRole('navigation', { name: '控件设计目录' }).getByRole('button', { name: /来源选择/u }).click()
    await confirm.getByRole('button', { name: '继续编辑', exact: true }).click()
    await confirm.waitFor({ state: 'hidden' })
    assert.equal(new URL(page.url()).searchParams.get('control'), 'business-form', '目录切换也受未保存保护')
    await editor.getByRole('button', { name: '保存', exact: true }).click()
    await editor.getByRole('alert').filter({ hasText: '演示保存失败' }).waitFor()
    assert.equal(await subject.inputValue(), '多行材料演示')
    assert.equal(await editor.getByLabel('第 1 条材料名称', { exact: true }).inputValue(), '恢复后的演示材料')
    await editor.getByRole('button', { name: '保存', exact: true }).click()
    await editor.waitFor({ state: 'hidden' })
    assert.equal(await stage.getByLabel('业务表单示例结果').innerText(), '演示草稿已保存：多行材料演示，1 条明细')
    await stage.getByRole('button', { name: '编辑演示草稿', exact: true }).click()
    assert.equal(await subject.inputValue(), '毛绒材料采购', '重开演示恢复初始草稿')
    await subject.fill('待放弃修改')
    await editor.getByRole('button', { name: '返回列表', exact: true }).click()
    await confirm.getByRole('button', { name: '放弃修改', exact: true }).click()
    await editor.waitFor({ state: 'hidden' })
    await page.waitForFunction(() => document.activeElement?.textContent === '编辑演示草稿')
    assert(await stage.getByRole('button', { name: '编辑演示草稿', exact: true }).evaluate((node) => node === document.activeElement), '返回恢复入口焦点')
    assert.deepEqual(businessRequests, [], '表单演示不读取或写入业务数据')
    await stage.getByRole('button', { name: '编辑演示草稿', exact: true }).click()
    await editor.waitFor()
    await assertNoHorizontalOverflow(page)
  }

  const verifyPicker = async (page) => {
    const businessRequests = []
    page.on('request', (request) => {
      if (new URL(request.url()).pathname.startsWith('/rpc/')) businessRequests.push(request.url())
    })
    const stage = page.locator('.erp-control-library-stage')
    const trigger = stage.getByRole('button', { name: '选择演示材料', exact: true })
    const dialog = page.getByRole('dialog').filter({ hasText: '从演示材料库添加' })
    const confirm = dialog.getByRole('button', { name: '添加到演示结果', exact: true })
    const rows = dialog.locator('tbody tr.ant-table-row')
    const result = stage.getByLabel('来源选择示例结果', { exact: true })
    await trigger.click()
    await dialog.waitFor()
    assert(await confirm.isDisabled())
    assert(await rows.nth(2).getByRole('checkbox').isDisabled(), '停用材料不可选择')
    await rows.first().getByRole('checkbox').check()
    await dialog.locator('.ant-pagination-item-2').click()
    await rows.first().getByRole('checkbox').check()
    await dialog.getByText('演示材料 6', { exact: true }).first().waitFor()
    assert.equal(await dialog.locator('.erp-source-import-picker__selection-tag').count(), 2, '跨页保留已选材料')
    await confirm.click()
    await dialog.waitFor({ state: 'hidden' })
    assert.equal(await result.innerText(), '已添加 2 条：短毛绒、演示材料 6')
    assert(await trigger.evaluate((node) => node === document.activeElement), '关闭弹窗恢复入口焦点')
    await trigger.click()
    await dialog.waitFor()
    assert(await confirm.isDisabled(), '重新打开清空临时选择')
    const search = dialog.getByRole('textbox', { name: '搜索演示材料', exact: true })
    await search.fill('演示材料 12')
    assert.equal(await rows.count(), 5, '输入草稿不立即搜索')
    await search.press('Enter')
    await rows.getByText('演示材料 12', { exact: true }).waitFor()
    assert.equal(await rows.count(), 1)
    await dialog.getByRole('button', { name: '清空筛选', exact: true }).click()
    await rows.nth(4).waitFor()
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    assert.equal(await result.innerText(), '已添加 2 条：短毛绒、演示材料 6', '取消不覆盖已确认结果')
    const setState = async (name) => stage.getByRole('radio', { name, exact: true }).locator('..').click()
    await setState('加载中')
    await trigger.click()
    assert(await confirm.isDisabled(), '加载中禁止确认')
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    await setState('空列表')
    await trigger.click()
    await dialog.getByText('暂无可选演示材料', { exact: true }).waitFor()
    assert(await confirm.isDisabled())
    await dialog.getByRole('button', { name: '重新加载', exact: true }).click()
    await rows.nth(4).waitFor()
    await dialog.getByRole('button', { name: '取消', exact: true }).click()
    await dialog.waitFor({ state: 'hidden' })
    await setState('读取失败')
    await trigger.click()
    await dialog.getByRole('alert').waitFor()
    await rows.first().getByRole('checkbox').check()
    assert(await confirm.isDisabled(), '失败清单禁止确认')
    await dialog.getByRole('button', { name: '重新加载', exact: true }).click()
    await dialog.getByRole('alert').waitFor({ state: 'hidden' })
    assert(await confirm.isEnabled())
    await confirm.click()
    await dialog.waitFor({ state: 'hidden' })
    assert.equal(await result.innerText(), '已添加 1 条：短毛绒')
    await stage.getByRole('button', { name: '清空演示结果', exact: true }).click()
    assert.equal(await result.innerText(), '尚未添加材料')
    await trigger.click()
    assert(await confirm.isDisabled(), '显式清空后不自动回选')
    await search.press('Escape')
    await dialog.waitFor({ state: 'hidden' })
    assert.deepEqual(businessRequests, [], '来源示例不请求业务接口')
    await assertNoHorizontalOverflow(page)
  }

  return [
    ...['business-form', 'source-picker'].flatMap((type) => [
      { name: `dev-ui-shared-${type}`, path: `/__dev/ui-design?page=controls&control=${type}`, viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2, verify: type === 'business-form' ? verifyForm : verifyPicker },
      {
        name: `dev-ui-shared-${type}-narrow-dark`,
        path: `/__dev/ui-design?page=controls&control=${type}`,
        viewport: { width: 1024, height: 900 },
        themeMode: 'dark',
        beforeNavigate: (page) => page.addInitScript(({ key, appearance }) => localStorage.setItem(key, JSON.stringify(appearance)), {
          key: WORKBENCH_APPEARANCE_STORAGE_KEY,
          appearance: normalizeERPAccountAppearance({ theme_mode: 'dark' }),
        }),
        verify: async (page) => {
          await page.waitForFunction(() => document.documentElement.dataset.erpTheme === 'dark' && document.querySelector('.erp-control-library-stage')?.dataset.erpTheme === 'dark')
          await (type === 'business-form' ? verifyForm : verifyPicker)(page)
        },
      },
    ]),
    {
      name: 'dev-ui-shared-consumer-entry',
      path: '/__dev/ui-design?page=controls&control=business-form',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1920, height: 1080 },
      verify: async (page) => {
        const link = page.getByRole('link', { name: '采购订单', exact: true })
        const href = await link.getAttribute('href')
        assert.equal(await link.getAttribute('target'), '_blank', '真实入口保留演示现场')
        assert.equal(href, '/erp/purchase/accessories')
        const writes = []
        page.on('request', (request) => {
          if (!new URL(request.url()).pathname.startsWith('/rpc/') || request.method() !== 'POST') return
          const method = request.postDataJSON()?.method || ''
          if (/^(?:save|create|update|delete|post|submit|confirm|cancel|complete)_/u.test(method)) writes.push(method)
        })
        await page.goto(new URL(href, page.url()).href)
        await page.getByRole('heading', { name: '采购订单', exact: true }).waitFor()
        const create = page.getByRole('button', { name: /新建采购订单/u })
        await create.waitFor()
        await create.click()
        const editor = page.getByRole('region', { name: '新建采购订单', exact: true })
        await editor.waitFor()
        await editor.getByRole('button', { name: '从材料库添加', exact: true }).click()
        const picker = page.getByRole('dialog').filter({ hasText: '从材料库添加' })
        await picker.locator('tbody tr.ant-table-row').first().waitFor()
        await picker.getByRole('button', { name: '取消', exact: true }).click()
        await picker.waitFor({ state: 'hidden' })
        await editor.getByRole('button', { name: '返回列表', exact: true }).click()
        await editor.waitFor({ state: 'hidden' })
        assert.deepEqual(writes, [], '真实消费者核对只读加载与取消，不提交业务数据')
        await assertNoHorizontalOverflow(page)
      },
    },
  ]
}
