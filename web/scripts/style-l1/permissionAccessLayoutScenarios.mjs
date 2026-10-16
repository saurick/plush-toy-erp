import assert from 'node:assert/strict'

export function createPermissionAccessLayoutScenarios({
  openControlledAntSelectDropdown,
  selectVirtualizedAntOption,
}) {
  const scenarios = [
    {
      themeMode: 'light',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
    },
    { themeMode: 'dark', viewport: { width: 1280, height: 720 } },
  ].map((display) => ({
    ...display,
    name: `permission-center-page-access-layout-${display.themeMode}`,
    path: '/erp/system/permissions',
    auth: 'admin',
    verify: async (page) => {
      await page
        .locator('.erp-role-template-card')
        .filter({ hasText: '业务' })
        .click()
      await page.getByRole('tab', { name: /岗位导航/u }).click()
      await page.getByRole('tab', { name: '页面访问', exact: true }).click()
      const rows = page.locator('.erp-role-effective-access__page')
      await rows.first().waitFor()
      const allCount = await rows.count()
      const filters = page.getByRole('group', { name: '筛选页面访问' })
      const results = page.getByRole('region', { name: '页面访问结果' })
      const metrics = await page.evaluate(() => {
        const read = (selector) => {
          const node = document.querySelector(selector)
          const rect = node.getBoundingClientRect()
          const style = getComputedStyle(node)
          return {
            x: rect.x,
            y: rect.y,
            right: rect.right,
            bottom: rect.bottom,
            height: rect.height,
            clientHeight: node.clientHeight,
            scrollHeight: node.scrollHeight,
            clientWidth: node.clientWidth,
            scrollWidth: node.scrollWidth,
            overflowY: style.overflowY,
          }
        }
        return {
          select: read('.erp-role-effective-access__toolbar > .ant-select'),
          filters: read('.erp-role-effective-access__filters'),
          results: read('.erp-role-effective-access__results'),
          header: read('.erp-role-effective-access__table .ant-table-thead'),
          module: read('.erp-role-effective-access__module'),
          pageRow: read('.erp-role-effective-access__page'),
          footer: read('.erp-role-center-footer'),
          pageWidth: document.documentElement.clientWidth,
          pageScrollWidth: document.documentElement.scrollWidth,
        }
      })
      assert(
        metrics.filters.x - metrics.select.right <= 16,
        `模块和访问筛选应相邻排列: ${JSON.stringify(metrics)}`
      )
      assert(
        Math.abs(metrics.filters.y - metrics.select.y) <= 4,
        `桌面筛选应保持同一行: ${JSON.stringify(metrics)}`
      )
      assert(
        metrics.module.height < metrics.pageRow.height,
        `模块分组应比数据行紧凑: ${JSON.stringify(metrics)}`
      )
      assert(
        metrics.results.height >= 160 &&
          metrics.results.scrollHeight > metrics.results.clientHeight &&
          metrics.results.bottom <= metrics.footer.y &&
          metrics.pageScrollWidth <= metrics.pageWidth + 1,
        `访问结果应在可用区域独立滚动: ${JSON.stringify(metrics)}`
      )

      await results.evaluate((node) => {
        node.scrollTop = 320
      })
      const scrolled = await page.evaluate(() => ({
        offset: document.querySelector('.erp-role-effective-access__results')
          .scrollTop,
        headerY: document
          .querySelector('.erp-role-effective-access__table .ant-table-thead')
          .getBoundingClientRect().y,
        filtersY: document
          .querySelector('.erp-role-effective-access__filters')
          .getBoundingClientRect().y,
      }))
      assert(
        scrolled.offset > 0 &&
          Math.abs(scrolled.headerY - metrics.header.y) <= 1 &&
          Math.abs(scrolled.filtersY - metrics.filters.y) <= 1,
        `滚动后必须保留访问筛选与表头: ${JSON.stringify(scrolled)}`
      )

      const blockedFilter = filters.getByRole('button', { name: /^不可进入/u })
      await blockedFilter.focus()
      await blockedFilter.press('Enter')
      assert.equal(await blockedFilter.getAttribute('aria-pressed'), 'true')
      const blockedRows = await rows.allTextContents()
      assert(
        blockedRows.length > 0 &&
          blockedRows.length < allCount &&
          blockedRows.every((row) => row.includes('不可进入'))
      )
      assert.equal(
        await page.locator('.erp-role-effective-access__count').innerText(),
        `显示 ${blockedRows.length} 页`
      )

      const moduleSelect = page.locator(
        '.erp-role-effective-access__toolbar > .ant-select'
      )
      let dropdown = await openControlledAntSelectDropdown(
        page,
        moduleSelect,
        '筛选业务模块'
      )
      const moduleLabel = await dropdown
        .locator('.ant-select-item-option')
        .filter({ hasText: '基础资料' })
        .getAttribute('title')
      await selectVirtualizedAntOption(page, dropdown, {
        label: '筛选业务模块',
        optionLabel: moduleLabel,
      })
      await page.keyboard.press('Escape')
      assert.equal(
        await page.locator('.erp-role-effective-access__module').count(),
        1
      )
      assert.match(
        await page.locator('.erp-role-effective-access__module').innerText(),
        /基础资料/u
      )
      dropdown = await openControlledAntSelectDropdown(
        page,
        moduleSelect,
        '筛选业务模块'
      )
      await selectVirtualizedAntOption(page, dropdown, {
        label: '筛选业务模块',
        optionLabel: '全部模块',
      })
      await page.keyboard.press('Escape')
      await filters.getByRole('button', { name: /^全部/u }).click()
      assert.equal(await rows.count(), allCount, '恢复筛选应完整恢复访问结果')

      await page
        .getByText('查看功能与页面操作的对应关系', { exact: true })
        .click()
      assert.equal(
        await page.locator('.erp-role-permission-impact').getAttribute('open'),
        ''
      )
      await page
        .getByText('查看功能与页面操作的对应关系', { exact: true })
        .click()
      await page.getByRole('tab', { name: '菜单排列', exact: true }).click()
      await page.getByRole('tab', { name: '页面访问', exact: true }).click()
      assert.equal(await rows.count(), allCount)
      await results.evaluate((node) => {
        node.scrollTop = 0
      })
    },
  }))
  return [
    ...scenarios,
    {
      name: 'permission-center-page-access-design',
      path: '/__dev/ui-design',
      viewport: { width: 1440, height: 1000 },
      verify: async (page) => {
        const frame = page.frameLocator('iframe[title="ERP 最新可交互设计"]')
        await frame
          .getByRole('button', { name: '权限管理', exact: true })
          .click()
        await frame.getByRole('tab', { name: '岗位导航', exact: true }).click()
        await frame.getByRole('tab', { name: '页面访问', exact: true }).click()
        const filters = frame.getByRole('group', { name: '筛选页面访问' })
        await filters.getByRole('button', { name: /^不可进入/u }).click()
        const blockedRows = await frame
          .locator('.permission-access-table tbody tr:has(td)')
          .allTextContents()
        assert(
          blockedRows.length > 0 &&
            blockedRows.every((row) => row.includes('不可进入'))
        )
        await filters.getByRole('button', { name: /^全部/u }).click()
        await frame
          .getByRole('combobox', { name: '筛选业务模块' })
          .selectOption('基础资料')
        assert.equal(await frame.locator('.permission-access-group').count(), 1)
        await frame
          .getByRole('combobox', { name: '筛选业务模块' })
          .selectOption('')
        await frame.locator('.permission-access-help summary').click()
        assert.equal(
          await frame.locator('.permission-access-help').getAttribute('open'),
          ''
        )
        await frame.locator('.permission-access-help summary').click()
        const results = frame.getByRole('region', { name: '页面访问结果' })
        const geometry = await results.evaluate((node) => ({
          height: node.clientHeight,
          overflow: getComputedStyle(node).overflowY,
        }))
        assert(geometry.height >= 160 && geometry.overflow === 'auto')
      },
    },
  ]
}
