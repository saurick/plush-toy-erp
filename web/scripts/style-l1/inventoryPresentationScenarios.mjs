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
      name: 'inventory-visible-copy-desktop',
      path: '/erp/warehouse/inventory',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '库存台账')
        await assertBusinessHeaderCompact(page, {
          scenarioName: 'inventory-compact-header-balance-desktop',
        })
        await assertTextAbsent(page, '查看内容')
        await page.getByRole('tab', { name: '库存批次' }).click()
        await assertBusinessHeaderCompact(page, {
          scenarioName: 'inventory-compact-header-lots-desktop',
        })
        await page.getByRole('tab', { name: '库存变动记录' }).click()
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
        await page.getByRole('tab', { name: '库存变动记录' }).click()
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
