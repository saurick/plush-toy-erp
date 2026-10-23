import { styleRpcResult } from './rpcMockResult.mjs'

export function createSearchCompositionScenarios({ assert, assertNoHorizontalOverflow, outputDir, path }) {
  const cases = [
    { name: 'design-reference', path: '/__dev/ui-design?view=specification&read=reference', label: '搜索设计图解或规范', queryKey: 'q' },
    { name: 'design-guide', path: '/__dev/ui-design?view=rationale&read=guide', label: '搜索设计图解或规范', queryKey: 'q', themeMode: 'dark' },
    { name: 'controls', path: '/__dev/ui-design?page=controls&control=components', label: '搜索控件设计', queryKey: 'controlq', width: 1280 },
    { name: 'skills', path: '/__dev/project-skills', label: '搜索任务或 Skill', queryKey: 'q' },
    { name: 'docs', path: '/__dev/docs', label: '搜索项目文档' },
    { name: 'definitions', path: '/__dev/status-flows?view=chain&chain=all', label: '本页 5 个视图的定义总索引，不属于当前 Tab；不搜索具体任务、运行实例或真实业务记录' },
    { name: 'tools', path: '/__dev?view=tools', label: '搜索全部开发工具', queryKey: 'q' },
    { name: 'integration', path: '/__dev/integration', label: '搜索接口名称、方法名或用途', queryKey: 'q' },
    { name: 'product', path: '/__dev/product-core', label: '搜索产品能力', queryKey: 'q' },
    { name: 'usability', path: '/__dev/business-usability', label: '搜索页面说明', queryKey: 'q' },
    { name: 'commands', path: '/__dev/testing?view=commands', label: '搜索命令、来源、验收词', queryKey: 'q' },
    { name: 'presets', path: '/__dev/testing?view=guide&guide=presets', label: '搜索常用检查', queryKey: 'q' },
    { name: 'rules', path: '/__dev/testing?view=coverage&coverage=rules', label: '搜索关键规则', queryKey: 'ruleQuery' },
    { name: 'quality', path: '/__dev/quality-gates?view=governance', label: '搜索门禁名称或风险', queryKey: 'q' },
    { name: 'version-history', path: '/__dev/version-center?view=history', label: '搜索版本、SHA 或操作 ID', queryKey: 'history_q' },
    { name: 'prototype-tools', path: '/__dev/ui-design?page=workbench', inputSelector: '#dev-design-search' },
    { name: 'prototype-integration', path: '/__dev/ui-design?page=workbench', inputSelector: '[data-dev-integration-search]' },
    { name: 'prototype-help', path: '/__dev/ui-design?page=help', inputSelector: '#rh-manualSearch' },
    { name: 'prototype-statistics', path: '/__dev/ui-design', inputSelector: '#statistics-search' },
    { name: 'prototype-visual', path: '/__dev/ui-design', inputSelector: '#visual-search' },
    { name: 'prototype-submitted', path: '/__dev/ui-design', inputSelector: '#list-search' },
  ]
  return cases.map(({ name, label, inputSelector, queryKey, width = 1920, ...options }) => ({
    ...options,
    name: `search-ime-${name}`,
    viewport: { width, height: 1080 },
    deviceScaleFactor: 2,
    verify: async (page) => {
      if (name === 'definitions') await page.getByRole('button', { name: '搜索定义', exact: true }).click()
      const frame = inputSelector ? page.frameLocator('iframe[title="ERP 最新可交互设计"]') : null
      if (frame) {
        await frame.locator('.app').waitFor()
        if (name === 'prototype-integration') await frame.getByRole('table', { name: '开发工具对照' }).getByRole('button', { name: '接口与集成', exact: true }).click()
        if (name === 'prototype-statistics') {
          await frame.locator('[data-action="nav"][data-page="progress"]').click()
          await frame.getByRole('tab', { name: '经营统计', exact: true }).click()
        }
        if (['prototype-visual', 'prototype-submitted'].includes(name)) {
          await frame.locator('[data-action="nav"][data-page="sales"]').click()
          if (name === 'prototype-visual') await frame.locator('[data-action="sales-view"][data-value="delivery"]').click()
        }
      }
      const input = frame ? frame.locator(inputSelector) : page.getByRole('textbox', { name: label, exact: true })
      await input.waitFor()
      const submittedRows = name === 'prototype-submitted' ? frame.locator('.table-wrap [data-action="select-row"]') : null
      const initialRowCount = submittedRows ? await submittedRows.count() : 0
      if (submittedRows) assert(initialRowCount > 0)
      await input.click()
      const client = await page.context().newCDPSession(page)
      const compose = (text) => client.send('Input.imeSetComposition', {
        text, selectionStart: text.length, selectionEnd: text.length,
      })
      const assertQuery = async (value) => {
        if (!queryKey) return
        await page.waitForURL((url) => (url.searchParams.get(queryKey) || '') === value)
      }
      const control = input.locator('xpath=..')
      const searchButton = control.getByRole('button', { name: '搜索', exact: true })
      const clearButton = control.getByRole('button', { name: '清除搜索', exact: true })
      try {
        await searchButton.waitFor()
        assert.equal(await searchButton.count(), 1, 'one shared search button per field')
        const initialURL = page.url()
        await compose('xia')
        assert.equal(await input.inputValue(), 'xia')
        assert.equal(page.url(), initialURL, 'an unfinished syllable must not navigate')
        await compose('xiala')
        assert.equal(await input.inputValue(), 'xiala', 'IME composition replaces the previous syllable')
        await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 229 })
        await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 229 })
        await client.send('Input.insertText', { text: '下拉' })
        await assertQuery('')
        assert.equal(await input.inputValue(), '下拉')
        assert(await input.evaluate((node) => node === document.activeElement))
        await compose('caidan')
        assert.equal(await input.inputValue(), '下拉caidan')
        await client.send('Input.insertText', { text: '菜单' })
        assert.equal(await input.inputValue(), '下拉菜单')
        await assertQuery('')

        await input.press('ArrowLeft')
        await input.press('ArrowLeft')
        await compose('xuanze')
        await client.send('Input.insertText', { text: '选择' })
        assert.equal(await input.inputValue(), '下拉选择菜单', 'editing in the middle preserves the remaining text')
        await assertQuery('')
        if (submittedRows) assert.equal(await submittedRows.count(), initialRowCount, 'candidate confirmation changes only the draft')
        await searchButton.click()
        await assertQuery('下拉选择菜单')
        if (submittedRows) assert.equal(await submittedRows.count(), 0, 'the search button applies the Chinese query')
        if (name === 'prototype-help') await frame.locator('#rh-manualResults').getByRole('heading', {name:'搜索“下拉选择菜单”'}).waitFor()
        if (queryKey) {
          await page.reload()
          await input.waitFor()
          assert.equal(await input.inputValue(), '下拉选择菜单', 'refresh restores only the submitted query')
        }
        await input.fill('')
        await assertQuery('下拉选择菜单')
        await input.press('Enter')
        await assertQuery('')
        if (submittedRows) assert.equal(await submittedRows.count(), initialRowCount, 'Enter applies an empty draft')
        await input.click()
        await compose('zhong')
        await client.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
        await client.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
        assert(await input.isVisible(), 'cancelling a candidate must not close the surrounding view')
        await compose('')
        assert.equal(await input.inputValue(), '', 'cancelling composition restores preceding text')
        await assertQuery('')
        await input.fill('中文搜索恢复')
        await assertQuery('')
        await input.press('Enter')
        await assertQuery('中文搜索恢复')
        if (name === 'prototype-help') await frame.locator('#rh-manualResults').getByRole('heading', {name:'搜索“中文搜索恢复”'}).waitFor()
        await input.fill('放弃草稿')
        await input.press('Escape')
        assert.equal(await input.inputValue(), '中文搜索恢复')
        await clearButton.click()
        await assertQuery('')
        assert.equal(await input.inputValue(), '')
        await input.click()
        await compose('caogao')
        await clearButton.click()
        assert.equal(await input.inputValue(), '', 'clear also discards unfinished composition')
        await assertQuery('')
        await assertNoHorizontalOverflow(page, `search-ime-${name}`)
        const geometry = await input.evaluate((node) => {
          const box = node.getBoundingClientRect()
          const control = node.closest('.erp-search-input, .search, .manual-search')
          const bounds = control.getBoundingClientRect()
          const button = control.querySelector('.erp-search-submit, .demo-search-submit').getBoundingClientRect()
          return { width: box.width, controlHeight: bounds.height, withinBounds: button.right <= bounds.right + 1, noOverlap: box.right <= button.left + 1 }
        })
        assert(geometry.width >= 80 && geometry.controlHeight >= 30 && geometry.withinBounds && geometry.noOverlap, `usable input and button geometry: ${JSON.stringify(geometry)}`)
        if (name === 'design-reference') {
          await input.click()
          await compose('xiala')
          await client.send('Input.insertText', { text: '下拉' })
          await searchButton.click()
          await assertQuery('下拉')
          await page.screenshot({ path: path.join(outputDir, 'search-ime-confirmed-chinese.png') })
        }
      } finally {
        await client.detach()
      }
    },
  })).concat([{
    name: 'search-submit-task-lookup',
    path: '/__dev/status-flows?view=tracking',
    viewport: { width: 1440, height: 900 },
    beforeNavigate: async (page) => {
      page.taskSearchQueries = []
      await page.route('**/rpc/workflow', (route) => {
        const body = route.request().postDataJSON()
        if (body.method !== 'list_tasks') return route.fallback()
        page.taskSearchQueries.push(body.params.keyword)
        const tasks = page.taskSearchQueries.length === 2 ? null : []
        return route.fulfill({ json: { jsonrpc: '2.0', id: body.id, result: styleRpcResult({ tasks, total: 0, limit: body.params.limit, offset: 0 }) } })
      })
    },
    verify: async (page) => {
      const finder = page.locator('.erp-dev-flow-task-finder')
      const input = finder.locator('input')
      const button = finder.getByRole('button', { name: '搜索', exact: true })
      await button.click()
      await finder.getByText('请输入来源单号、任务名称或编号', { exact: true }).waitFor()
      assert.equal(page.taskSearchQueries.length, 0)
      const client = await page.context().newCDPSession(page)
      try {
        await input.click()
        await client.send('Input.imeSetComposition', {text:'renwu',selectionStart:5,selectionEnd:5})
        await client.send('Input.insertText', {text:'任务'})
        assert.equal(page.taskSearchQueries.length, 0)
        await input.press('Enter')
        await finder.getByText('没有找到名称、任务编号或来源单号相符的可见任务', {exact:true}).waitFor()
        await button.click()
        assert.deepEqual(page.taskSearchQueries, ['任务'])
      } finally { await client.detach() }
      await page.getByRole('button', { name: '搜索定义', exact: true }).click()
      const definitions = page.getByRole('dialog', { name: '搜索定义' })
      await definitions.getByRole('textbox').fill('预填任务')
      await definitions.getByRole('textbox').press('Enter')
      await definitions.getByRole('button', { name: '去查真实任务', exact: true }).click()
      await definitions.waitFor({state:'hidden'})
      assert.equal(await input.inputValue(), '预填任务')
      assert.deepEqual(page.taskSearchQueries, ['任务'], 'carrying text into task lookup does not query')
      await button.click()
      await finder.getByText('任务查找失败', {exact:true}).waitFor()
      assert.deepEqual(page.taskSearchQueries, ['任务', '预填任务'])
      await finder.getByRole('button', {name:'重试',exact:true}).click()
      await finder.getByText('没有找到名称、任务编号或来源单号相符的可见任务', {exact:true}).waitFor()
      assert.deepEqual(page.taskSearchQueries, ['任务', '预填任务', '预填任务'])
      await finder.getByRole('button', {name:'清除搜索',exact:true}).click()
      assert.equal(await input.inputValue(), '')
      assert.equal(page.taskSearchQueries.length, 3, 'clearing a lookup does not send an unbounded task query')
      await assertNoHorizontalOverflow(page, 'shared task lookup search')
    },
  }])
}
