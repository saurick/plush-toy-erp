import { verifyMobileNavigationMotion as verifySlidingMotion } from './slidingMotionAssertions.mjs'

export function createInventoryPresentationScenarios(deps) {
  const {
    assert,
    assertBusinessHeaderCompact,
    assertERPThemeMode,
    assertNoHorizontalOverflow,
    assertTextAbsent,
    expectHeading,
    expectText,
    outputDir,
    path,
    customerRuntimeEffectiveSession,
  } = deps
  return [
    {
      name: 'inventory-toolbar-density-responsive',
      path: '/erp/warehouse/inventory?view=balances',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      verify: async (page) => {
        await expectHeading(page, '库存台账')
        const command = page.locator('.erp-inventory-ledger-page .erp-business-operation-panel__command')
        await command.getByRole('tab', { name: '库存余额' }).waitFor()
        for (const width of [1920, 1366, 820, 390]) {
          await page.setViewportSize({ width, height: 1080 })
          const metrics = await command.evaluate((element) => {
            const bounds = element.getBoundingClientRect()
            const controls = [...element.children].filter((node) => node.getBoundingClientRect().width > 0)
              .map((node) => ({ class: node.className, ...node.getBoundingClientRect().toJSON() }))
            const search = element.querySelector('.erp-business-operation-panel__search').getBoundingClientRect()
            return {
              bounds: bounds.toJSON(),
              controls,
              searchWidth: search.width,
              secondaryHeaders: document.querySelectorAll('.erp-inventory-ledger-page .erp-business-page-header-card--secondary').length,
            }
          })
          assert.equal(metrics.secondaryHeaders, 0, '库存分类应与查询操作共用一行，不再另设二级页头')
          assert.ok(metrics.controls.every((box) => box.left >= metrics.bounds.left && box.right <= metrics.bounds.right + 1), `库存工具栏控件须位于自身边界内: ${JSON.stringify(metrics)}`)
          for (let i = 0; i < metrics.controls.length; i += 1) {
            for (const peer of metrics.controls.slice(i + 1)) {
              const current = metrics.controls[i]
              const overlapX = Math.min(current.right, peer.right) - Math.max(current.left, peer.left)
              const overlapY = Math.min(current.bottom, peer.bottom) - Math.max(current.top, peer.top)
              assert.ok(overlapX <= 1 || overlapY <= 1, `库存工具栏换行后不能重叠: ${JSON.stringify(metrics)}`)
            }
          }
          if (width === 1920) {
            assert.ok(metrics.bounds.height <= 56, `宽屏库存工具栏应保持单行: ${JSON.stringify(metrics)}`)
            assert.ok(metrics.searchWidth >= 240 && metrics.searchWidth <= 321, `库存搜索框应保留可用宽度且不铺满页面: ${JSON.stringify(metrics)}`)
            const centers = metrics.controls.map((box) => box.top + box.height / 2)
            assert.ok(Math.max(...centers) - Math.min(...centers) <= 1, '宽屏分类、视图与查询操作应垂直居中对齐')
          }
          await assertNoHorizontalOverflow(page, `inventory-toolbar-${width}`)
          await page.screenshot({ path: path.join(outputDir, `inventory-toolbar-${width}.png`), fullPage: false })
        }
        await page.setViewportSize({ width: 1920, height: 1080 })
        const search = command.locator('.erp-business-operation-panel__search input')
        await search.fill('SKU')
        await command.getByRole('button', { name: /^筛选(?:，已应用 \d+ 项)?$/u }).click()
        await page.getByRole('dialog', { name: '筛选条件' }).waitFor()
        await page.getByRole('dialog', { name: '筛选条件' }).getByRole('button', { name: '完成', exact: true }).click()
        assert.equal(await search.inputValue(), 'SKU', '打开和关闭筛选应保留搜索词')
        await search.fill('')
        await verifySlidingMotion(page, assert, '.erp-inventory-ledger-view-bar .erp-sliding-segmented', 1)
        await page.getByRole('region', { name: '仓库库存分布', exact: true }).waitFor()
        await verifySlidingMotion(page, assert, '.erp-inventory-ledger-view-bar .erp-sliding-segmented', 0, true)
        await command.getByRole('button', { name: '库存作业', exact: true }).click()
        await page.getByRole('dialog', { name: /库存作业记录/u }).waitFor()
      },
    },
    {
      name: 'inventory-visible-copy-desktop',
      path: '/erp/warehouse/inventory?view=balances',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '库存台账')
        await assertBusinessHeaderCompact(page, {
          scenarioName: 'inventory-compact-header-balance-desktop',
        })
        await assertTextAbsent(page, '查看内容')
        const selector = '.erp-inventory-ledger-view-bar > .ant-tabs'
        await verifySlidingMotion(page, assert, selector, 1)
        assert.equal(new URL(page.url()).searchParams.get('view'), 'lots')
        await assertBusinessHeaderCompact(page, {
          scenarioName: 'inventory-compact-header-lots-desktop',
        })
        await verifySlidingMotion(page, assert, selector, 2)
        assert.equal(new URL(page.url()).searchParams.get('view'), 'txns')
        await page.goBack()
        await page
          .getByRole('tab', { name: '库存批次', selected: true })
          .waitFor()
        assert.equal(
          await page
            .getByRole('tab', { name: '库存批次' })
            .getAttribute('aria-selected'),
          'true'
        )
        await page.goForward()
        await page.reload()
        await page
          .getByRole('tab', { name: '库存变动记录', selected: true })
          .waitFor()
        assert.equal(
          await page
            .getByRole('tab', { name: '库存变动记录' })
            .getAttribute('aria-selected'),
          'true'
        )
        await assertBusinessHeaderCompact(page, {
          scenarioName: 'inventory-compact-header-transactions-desktop',
        })
        await expectText(page, '撤销调整')
        await assertTextAbsent(page, '库存流水')
        await assertTextAbsent(page, '流水')
        await assertTextAbsent(page, '冲正')
        await page.screenshot({
          path: path.join(outputDir, 'inventory-visible-copy-desktop.png'),
          fullPage: true,
        })
        await assertNoHorizontalOverflow(page, 'inventory-visible-copy-desktop')
      },
    },
    {
      name: 'inventory-compact-header-dark-mobile',
      path: '/erp/warehouse/inventory?view=balances',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      themeMode: 'dark',
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        await expectHeading(page, '库存台账')
        await page.getByRole('tab', { name: '库存余额' }).click()
        await assertERPThemeMode(page, {
          scenarioName: 'inventory-compact-header-dark-mobile',
          expectedMode: 'dark',
          expectedEffectiveTheme: 'dark',
        })
        await assertBusinessHeaderCompact(page, {
          scenarioName: 'inventory-compact-header-dark-mobile',
        })
        await assertTextAbsent(page, '查看内容')
        await page
          .locator('.erp-admin-content')
          .evaluate((node) => node.scrollTo({ top: 0, behavior: 'auto' }))
        const mobileHeaderMetrics = await page.evaluate(() => {
          const content = document.querySelector('.erp-admin-content')
          const header = document.querySelector(
            '.erp-business-page-header-card'
          )
          const title = header?.querySelector('h1')
          const tabs = Array.from(
            header?.querySelectorAll(
              '.erp-business-module-tabs [role="tab"]'
            ) || []
          )
          const contentRect = content?.getBoundingClientRect()
          const headerRect = header?.getBoundingClientRect()
          const titleRect = title?.getBoundingClientRect()
          return {
            scrollTop: content?.scrollTop ?? null,
            content: contentRect?.toJSON() || null,
            header: headerRect?.toJSON() || null,
            title: title
              ? {
                  text: title.textContent?.trim() || '',
                  rect: titleRect?.toJSON() || null,
                  color: window.getComputedStyle(title).color,
                }
              : null,
            tabs: tabs.map((value) => ({
              text: value.textContent?.trim() || '',
              rect: value.getBoundingClientRect().toJSON(),
              color: window.getComputedStyle(value).color,
            })),
          }
        })
        assert.equal(
          mobileHeaderMetrics.scrollTop,
          0,
          `库存暗色手机页头截图前应回到内容顶部: ${JSON.stringify(
            mobileHeaderMetrics
          )}`
        )
        assert(
          mobileHeaderMetrics.title?.text === '库存管理' &&
            mobileHeaderMetrics.tabs.length === 2 &&
            mobileHeaderMetrics.tabs.every(
              (item) =>
                item.rect.top >= mobileHeaderMetrics.content.top &&
                item.rect.bottom <= mobileHeaderMetrics.content.bottom
            ),
          `库存暗色手机页头标题和页签应在可视内容区内: ${JSON.stringify(
            mobileHeaderMetrics
          )}`
        )
        await page.screenshot({
          path: path.join(
            outputDir,
            'inventory-compact-header-dark-mobile.png'
          ),
          fullPage: true,
        })
        await page.locator('.erp-business-module-header').screenshot({
          path: path.join(
            outputDir,
            'inventory-compact-header-dark-mobile-header.png'
          ),
        })
        await verifySlidingMotion(
          page,
          assert,
          '.erp-inventory-ledger-view-bar > .ant-tabs',
          2
        )
        assert.equal(new URL(page.url()).searchParams.get('view'), 'txns')
        await assertBusinessHeaderCompact(page, {
          scenarioName: 'inventory-compact-header-transactions-dark-mobile',
        })
        await assertNoHorizontalOverflow(
          page,
          'inventory-compact-header-dark-mobile'
        )
      },
    },
  ]
}
