import assert from 'node:assert/strict'

async function observeSlidingNav(
  page,
  selector,
  index,
  { reduced = false } = {}
) {
  const metrics = await page.locator(selector).evaluate(async (root, index) => {
    const target = root.querySelectorAll('[role=tab]')[index]
    const box = root.getBoundingClientRect()
    const read = () => {
      const style = getComputedStyle(root, '::before')
      return {
        x: new DOMMatrixReadOnly(
          style.transform === 'none' ? undefined : style.transform
        ).m41,
        duration: style.transitionDuration,
      }
    }
    const start = read().x
    const frames = []
    target.click()
    const began = performance.now()
    await new Promise((resolve) => {
      const tick = () => {
        frames.push(read())
        if (performance.now() - began < 650) requestAnimationFrame(tick)
        else resolve()
      }
      requestAnimationFrame(tick)
    })
    const after = root.getBoundingClientRect()
    return {
      start,
      end: frames.at(-1).x,
      frames,
      mounted: root.isConnected,
      stable:
        Math.abs(box.width - after.width) < 1 &&
        Math.abs(box.height - after.height) < 1,
      selected: target.getAttribute('aria-selected'),
    }
  }, index)
  assert(
    metrics.mounted && metrics.stable && metrics.selected === 'true',
    JSON.stringify(metrics)
  )
  if (reduced) {
    assert(
      metrics.frames.every((frame) =>
        frame.duration.split(',').every((value) => parseFloat(value) === 0)
      )
    )
  } else {
    assert(
      metrics.frames.some(
        (frame) =>
          frame.x > Math.min(metrics.start, metrics.end) + 1 &&
          frame.x < Math.max(metrics.start, metrics.end) - 1
      ),
      JSON.stringify(metrics)
    )
  }
}

export function createPermissionUnifiedScenarios({
  assert,
  assertNoHorizontalOverflow,
}) {
  const readSelection = (page) =>
    page.locator('.erp-permission-row').evaluateAll((rows) =>
      rows
        .filter((row) => row.querySelector('input')?.checked)
        .map(
          (row) =>
            row.querySelector('[data-permission-key]')?.dataset.permissionKey
        )
        .sort()
    )
  return [
    ...['light', 'dark'].map((themeMode) => ({
      name: `permission-navigation-ui-design-${themeMode}`,
      path: '/__dev/ui-design',
      themeMode,
      viewport:
        themeMode === 'dark'
          ? { width: 390, height: 844 }
          : { width: 1486, height: 1000 },
      verify: async (page) => {
        if (themeMode === 'dark') {
          await page.getByRole('button', { name: /全屏预览/ }).click()
        }
        const frame = page.frameLocator('iframe[title="ERP 最新可交互设计"]')
        await frame
          .getByRole('button', { name: '外观设置', exact: true })
          .click()
        await frame
          .locator(`[data-action="set-mode"][data-value="${themeMode}"]`)
          .click()
        assert.equal(
          await frame.locator('body').getAttribute('data-mode'),
          themeMode
        )
        await frame
          .locator('.modal-foot')
          .getByRole('button', { name: '关闭', exact: true })
          .click()
        if (themeMode === 'dark') {
          await frame.locator('[data-action="open-nav"]').click()
        }
        await frame
          .getByRole('button', { name: '全部模块', exact: true })
          .click()
        await frame
          .locator('[data-action="catalog-nav"][data-page="permissions"]')
          .click()
        await frame
          .locator('[data-action="permission-role"][data-value="finance"]')
          .click()
        await frame.getByRole('tab', { name: '岗位导航', exact: true }).click()
        await frame
          .getByRole('combobox', { name: '岗位导航排列方式' })
          .selectOption('custom')
        const finance = frame.locator('[data-navigation-module="财务管理"]')
        assert.equal(await finance.count(), 1)
        const defaultPage = frame.getByRole('combobox', {
          name: '财务管理默认页面',
        })
        assert.equal(await defaultPage.locator('option').count(), 5)
        await defaultPage.selectOption('payments')
        await frame
          .getByRole('button', { name: '移到其他 财务管理', exact: true })
          .click()
        await frame
          .getByRole('button', { name: '移到常用 财务管理', exact: true })
          .click()
        assert.equal(await defaultPage.inputValue(), 'payments')
        await frame.getByRole('tab', { name: '页面访问', exact: true }).click()
        await frame
          .getByRole('combobox', { name: '筛选业务模块' })
          .selectOption('财务管理')
        assert.equal(
          await frame
            .locator(
              '.permission-access-table tbody tr:not(.permission-group-row)'
            )
            .count(),
          5
        )
        await frame
          .getByRole('button', { name: '不可进入 0', exact: true })
          .click()
        await frame.getByText('此筛选下暂无页面', { exact: true }).waitFor()
        await frame.getByRole('tab', { name: '菜单排列', exact: true }).click()
        assert.equal(await defaultPage.inputValue(), 'payments')
        await frame
          .getByRole('button', { name: '保存岗位设置', exact: true })
          .click()
        await frame
          .locator('[data-action="permission-role"][data-value="sales"]')
          .click()
        await frame
          .locator('[data-action="permission-role"][data-value="finance"]')
          .click()
        assert.equal(await defaultPage.inputValue(), 'payments')
        assert.equal(
          await frame
            .getByRole('button', { name: '保存岗位设置', exact: true })
            .isDisabled(),
          true
        )
        assert(
          (await frame
            .locator('body')
            .evaluate((node) => node.scrollWidth - node.clientWidth)) <= 1
        )
        await page.screenshot({
          path: `output/playwright/style-l1/permission-navigation-ui-design-${themeMode}.png`,
          fullPage: true,
        })
      },
    })),

    ...[
      {
        name: 'permission-center-matrix-desktop',
        viewport: { width: 1440, height: 1000 },
        themeMode: 'light',
      },
      {
        name: 'permission-center-matrix-mobile-dark',
        viewport: { width: 390, height: 844 },
        themeMode: 'dark',
      },
      {
        name: 'permission-center-matrix-short-desktop',
        viewport: { width: 1280, height: 720 },
        themeMode: 'light',
      },
    ].map((variant) => ({
      ...variant,
      path: '/erp/system/permissions',
      auth: 'admin',
      verify: async (page) => {
        await page
          .locator('.erp-role-template-card')
          .filter({ hasText: '财务' })
          .click()
        const matrix = page.getByRole('table', { name: '岗位功能权限' })
        await matrix.waitFor()
        if (variant.viewport.height < 800) {
          const tableHeight = await page
            .locator('.erp-permission-checklist')
            .evaluate((node) => node.clientHeight)
          assert(tableHeight >= 220, `权限表被压缩到 ${tableHeight}px`)
          await page
            .locator('.erp-role-settings-row')
            .getByText('仓库范围', { exact: true })
            .scrollIntoViewIfNeeded()
        }
        const settingsHeight = await page
          .locator('.erp-role-settings-row')
          .evaluate((node) => node.getBoundingClientRect().height)
        assert(
          settingsHeight <= (variant.viewport.width < 800 ? 130 : 54),
          `底部设置不应挤占权限表：${settingsHeight}px`
        )
        const inputs = await page
          .locator('.erp-permission-row [data-permission-key]')
          .evaluateAll((items) =>
            items.map((item) => item.dataset.permissionKey)
          )
        assert.equal(
          new Set(inputs).size,
          inputs.length,
          '每项权限只能渲染一个控件'
        )
        const invoice = page.locator('.erp-permission-matrix__row').filter({
          has: page.getByRole('rowheader', { name: '发票', exact: true }),
        })
        assert.equal(await invoice.count(), 1)
        assert.equal(
          await invoice
            .getByRole('checkbox', { name: '查看发票', exact: true })
            .count(),
          1
        )
        assert.equal(
          await invoice
            .getByRole('checkbox', { name: '确认发票', exact: true })
            .count(),
          1
        )
        assert.equal(
          await invoice.locator('td[data-label="新建"] input').count(),
          0
        )
        assert.equal(
          await invoice
            .locator('td[data-label="新建"]')
            .getAttribute('data-empty'),
          'true'
        )
        const before = await readSelection(page)
        const search = page.getByRole('textbox', { name: '搜索功能或页面' })
        await search.fill('处理对账')
        assert.equal(
          await page.locator('.erp-permission-matrix__row > th').innerText(),
          '对账'
        )
        assert.equal(
          await page
            .locator('.erp-permission-matrix__row td[data-label="查看"]')
            .getAttribute('data-filtered'),
          'true'
        )
        const target = page.getByRole('checkbox', {
          name: '处理对账',
          exact: true,
        })
        assert.equal(await target.isChecked(), true)
        await target.focus()
        await page.keyboard.press('Space')
        const changed = before.filter(
          (key) => key !== 'finance.reconciliation.confirm'
        )
        await page
          .getByRole('button', { name: '新增 0 项 · 撤销 1 项', exact: true })
          .click()
        await page
          .locator('.erp-permission-changes')
          .getByText('处理对账', { exact: false })
          .waitFor()
        await page
          .getByRole('button', { name: '新增 0 项 · 撤销 1 项', exact: true })
          .click()
        await search.fill('')
        assert.deepEqual(
          await readSelection(page),
          changed,
          '筛选后的单项勾选必须保留所有隐藏权限'
        )
        const request = page.waitForRequest(
          (req) =>
            req.url().includes('/rpc/admin') &&
            req.postDataJSON()?.method === 'set_role_settings'
        )
        await page
          .getByRole('button', { name: '保存岗位设置', exact: true })
          .click()
        const payload = (await request).postDataJSON().params
        assert.deepEqual([...payload.permission_keys].sort(), changed)
        await page
          .getByText('岗位设置已更新，相关账号刷新后生效', { exact: true })
          .waitFor()
        await page.waitForFunction(
          () =>
            document.querySelectorAll('.erp-permission-row__change').length ===
            0
        )
        assert.deepEqual(
          await readSelection(page),
          changed,
          '保存读回应保留本次结果'
        )
        await page.locator('.erp-role-scope-mode .ant-select-selector').click()
        await page
          .locator('.ant-select-dropdown:visible')
          .getByText('指定仓库', { exact: true })
          .click()
        const allowedWarehouses = page.getByRole('combobox', {
          name: '允许的仓库',
          exact: true,
        })
        await page
          .locator('.erp-role-scope-warehouses .ant-select-selector')
          .click()
        await page
          .locator('.ant-select-dropdown:visible')
          .getByText(/原料仓/)
          .click()
        await page
          .locator('.ant-select-dropdown:visible')
          .getByText(/成品仓/)
          .click()
        await allowedWarehouses.press('Escape')
        const selectedScopeHeight = await page
          .locator('.erp-role-settings-row')
          .evaluate((node) => node.getBoundingClientRect().height)
        assert(
          selectedScopeHeight <= (variant.viewport.width < 800 ? 140 : 54),
          `指定仓库也应紧凑显示：${selectedScopeHeight}px`
        )
        await page.locator('.erp-role-scope-mode .ant-select-selector').click()
        await page
          .locator('.ant-select-dropdown:visible')
          .getByText('全部仓库', { exact: true })
          .click()
        assert.equal(await allowedWarehouses.count(), 0)
        await page.locator('.erp-role-scope-mode .ant-select-selector').click()
        await page
          .locator('.ant-select-dropdown:visible')
          .getByText('指定仓库', { exact: true })
          .click()
        assert.equal(
          await page
            .locator('.erp-role-scope-warehouses .ant-select-selection-item')
            .count(),
          0,
          '范围切换应清空旧仓库'
        )
        assert.equal(
          await page
            .getByRole('button', { name: '保存岗位设置', exact: true })
            .isEnabled(),
          false
        )
        await page.locator('.erp-role-scope-mode .ant-select-selector').click()
        await page
          .locator('.ant-select-dropdown:visible')
          .getByText('全部仓库', { exact: true })
          .click()
        await search.fill('财务')
        const geometry = await matrix.evaluate((table) => {
          const rows = [
            ...table.querySelectorAll('.erp-permission-matrix__row'),
          ]
          const boxes = rows.map((row) => ({
            box: row.getBoundingClientRect().toJSON(),
            scroll: row.scrollWidth,
            width: row.clientWidth,
          }))
          return {
            alignment: [
              ...table.querySelectorAll(
                '.erp-permission-matrix__row td:not(:last-child) input'
              ),
            ].map((input) => {
              const cell = input.closest('td').getBoundingClientRect()
              const box = input.getBoundingClientRect()
              return Math.abs(box.x + box.width / 2 - cell.x - cell.width / 2)
            }),
            columns: table.querySelectorAll('thead th').length,
            boxes,
            display: getComputedStyle(rows[0]).display,
          }
        })
        assert.equal(geometry.columns, 5)
        if (variant.viewport.width >= 800) {
          assert(
            geometry.alignment.every((offset) => offset < 1),
            JSON.stringify(geometry)
          )
        }
        assert.equal(
          geometry.display,
          variant.viewport.width < 800 ? 'grid' : 'table-row'
        )
        assert(
          geometry.boxes.every((row) => row.scroll <= row.width + 1),
          JSON.stringify(geometry)
        )
        await assertNoHorizontalOverflow(page, variant.name)
      },
    })),
    {
      name: 'permission-center-unified-interactions',
      path: '/erp/system/permissions',
      auth: 'admin',
      viewport: { width: 1440, height: 1000 },
      verify: async (page) => {
        await page
          .locator('.erp-role-template-card')
          .filter({ hasText: '财务' })
          .click()
        const search = page.getByRole('textbox', { name: '搜索功能或页面' })
        await search.waitFor()
        await page.screenshot({
          path: 'output/playwright/style-l1/permission-center-unified-roles.png',
        })
        const geometry = await page.evaluate(() => {
          const box = (selector) => {
            const node = document.querySelector(selector)
            const rect = node.getBoundingClientRect()
            return {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
              bottom: rect.bottom,
              columns: getComputedStyle(node).gridTemplateColumns,
            }
          }
          return {
            toolbar: box('.erp-permission-toolbar'),
            sidebar: box('.erp-role-center-sidebar'),
            groups: box('.erp-permission-checklist'),
            matrix: box('.erp-permission-matrix'),
            matrixColumns: document.querySelectorAll(
              '.erp-permission-matrix thead th'
            ).length,
            settings: box('.erp-role-settings-row'),
            footer: box('.erp-role-center-footer'),
            viewport: innerHeight,
            outerHeight: document.documentElement.scrollHeight,
          }
        })
        assert(
          geometry.sidebar.width >= 256 && geometry.sidebar.width <= 264,
          JSON.stringify(geometry)
        )
        assert.equal(geometry.matrixColumns, 5)
        assert(geometry.matrix.width <= geometry.groups.width + 1)
        assert(
          geometry.settings.bottom <= geometry.footer.y + 1 &&
            geometry.footer.bottom <= geometry.viewport,
          JSON.stringify(geometry)
        )
        assert.equal(await page.locator('.erp-role-policy-tabs').count(), 0)
        assert.equal(
          await page
            .getByRole('tablist', { name: '权限管理', exact: true })
            .getByRole('tab')
            .count(),
          4
        )
        const groupGeometry = await page
          .locator('.erp-permission-checklist__section')
          .evaluateAll((groups) =>
            groups.map((group) => group.getBoundingClientRect().toJSON())
          )
        for (let i = 1; i < groupGeometry.length; i++) {
          assert(
            groupGeometry[i].top >= groupGeometry[i - 1].bottom - 1,
            JSON.stringify(groupGeometry)
          )
        }
        const before = await readSelection(page)
        await search.fill('没有这样的功能')
        await page
          .getByText('没有匹配的功能，请调整搜索或关闭只看已选', {
            exact: true,
          })
          .waitFor()
        await search.fill('处理对账')
        const matchingKeys = await page
          .locator('.erp-permission-row [data-permission-key]')
          .evaluateAll((rows) => rows.map((row) => row.dataset.permissionKey))
        assert(matchingKeys.length > 0 && matchingKeys.length < 5)
        const clear = page
          .locator('.erp-permission-checklist__section')
          .getByRole('button', { name: '清空结果', exact: true })
        assert.equal(await clear.isEnabled(), true)
        await clear.click()
        await search.fill('')
        const expected = before.filter((key) => !matchingKeys.includes(key))
        await page.waitForFunction((expected) => {
          const selected = [...document.querySelectorAll('.erp-permission-row')]
            .filter((row) => row.querySelector('input')?.checked)
            .map(
              (row) =>
                row.querySelector('[data-permission-key]')?.dataset
                  .permissionKey
            )
            .sort()
          return JSON.stringify(selected) === JSON.stringify(expected)
        }, expected)
        assert.deepEqual(
          await readSelection(page),
          expected,
          '清空搜索结果不得撤销隐藏功能'
        )
        await page
          .getByRole('button', { name: '全部收起', exact: true })
          .click()
        assert.equal(
          await page.locator('.erp-permission-row:visible').count(),
          0
        )
        await page
          .locator(
            '[data-permission-module="finance"] .erp-permission-checklist__header'
          )
          .getByRole('button', { name: /财务/ })
          .click()
        await page
          .locator('[data-permission-module="finance"] .erp-permission-row')
          .first()
          .waitFor()
        await page
          .getByRole('button', { name: '全部展开', exact: true })
          .click()
        await page.getByRole('tab', { name: /岗位导航/ }).click()
        assert.equal(await page.getByRole('dialog').count(), 0)
        assert.equal(
          await page
            .getByRole('button', { name: '保存岗位设置', exact: true })
            .isEnabled(),
          true
        )
        await page.getByRole('tab', { name: /岗位设置/ }).click()
        await page.waitForFunction(
          (expected) =>
            JSON.stringify(
              [...document.querySelectorAll('.erp-permission-row')]
                .filter((row) => row.querySelector('input')?.checked)
                .map(
                  (row) =>
                    row.querySelector('[data-permission-key]').dataset
                      .permissionKey
                )
                .sort()
            ) === JSON.stringify(expected),
          expected
        )
        assert.deepEqual(
          await readSelection(page),
          expected,
          '岗位与岗位导航切换必须保留同一份草稿'
        )
        await page.getByRole('tab', { name: /员工账号/ }).click()
        const confirm = page.getByRole('dialog').filter({ hasText: '未保存' })
        await confirm.waitFor()
        await confirm.getByRole('button', { name: /继续/ }).click()
        await page.getByRole('textbox', { name: '搜索功能或页面' }).waitFor()
        await page.getByRole('tab', { name: /员工账号/ }).click()
        await page
          .getByRole('button', { name: '放弃修改', exact: true })
          .click()
        await page.getByRole('textbox', { name: '搜索员工账号' }).waitFor()
        await observeSlidingNav(page, '.erp-permission-tabs', 0)
        await page.getByRole('textbox', { name: '搜索功能或页面' }).waitFor()
        await page.emulateMedia({ reducedMotion: 'reduce' })
        await observeSlidingNav(page, '.erp-permission-tabs', 1, {
          reduced: true,
        })
        await page.emulateMedia({ reducedMotion: 'no-preference' })
        await assertNoHorizontalOverflow(
          page,
          'permission-center-unified-interactions'
        )
        await page.screenshot({
          path: 'output/playwright/style-l1/permission-center-unified-accounts.png',
        })
        await page.getByRole('tab', { name: /岗位设置/ }).click()
        await page
          .locator('.erp-role-template-card')
          .filter({ hasText: '系统管理员' })
          .click()
        await page.getByText('系统内置岗位只能查看', { exact: true }).waitFor()
        assert.equal(
          await page
            .getByRole('button', { name: '保存岗位设置', exact: true })
            .isEnabled(),
          false
        )
        assert.equal(
          await page
            .locator('.erp-permission-row input:not(:disabled)')
            .count(),
          0
        )
      },
    },
    {
      name: 'permission-center-ui-design-short-desktop',
      path: '/__dev/ui-design',
      viewport: { width: 1280, height: 720 },
      verify: async (page) => {
        const frame = page.frameLocator('iframe[title="ERP 最新可交互设计"]')
        await frame
          .getByRole('button', { name: '全部模块', exact: true })
          .click()
        await frame
          .locator('[data-action="catalog-nav"][data-page="permissions"]')
          .click()
        const geometry = await frame
          .locator('.permission-groups')
          .evaluate((node) => {
            const viewport = node.getBoundingClientRect()
            const row = node
              .querySelector('.permission-object-row')
              .getBoundingClientRect()
            const workspace = node.parentElement.getBoundingClientRect()
            return {
              height: viewport.height,
              firstRowVisible:
                row.top >= viewport.top &&
                row.bottom <= Math.min(viewport.bottom, workspace.bottom),
            }
          })
        assert(geometry.height >= 220, JSON.stringify(geometry))
        assert(geometry.firstRowVisible, JSON.stringify(geometry))
        const scopeMode = frame.locator('#permission-scope-type')
        const settingsGeometry = await scopeMode.evaluate((node) => {
          const row = node
            .closest('.permission-settings-row')
            .getBoundingClientRect()
          return {
            height: row.height,
            width: row.width,
            controlHeight: node.getBoundingClientRect().height,
          }
        })
        assert(
          settingsGeometry.controlHeight >= 32,
          JSON.stringify(settingsGeometry)
        )
        assert(
          settingsGeometry.height <= (settingsGeometry.width < 640 ? 92 : 54),
          JSON.stringify(settingsGeometry)
        )
        await scopeMode.scrollIntoViewIfNeeded()
        const scopeVisible = await scopeMode.evaluate((node) => {
          const scope = node.getBoundingClientRect()
          const workspace = node
            .closest('.permission-settings-workspace')
            .getBoundingClientRect()
          return scope.top >= workspace.top && scope.bottom <= workspace.bottom
        })
        assert(scopeVisible, '小窗口下仓库范围控件必须能滚动到可见位置')
        await scopeMode.selectOption('all')
        assert.equal(await frame.locator('#permission-scope-value').count(), 0)
        await frame
          .getByRole('button', { name: '保存岗位设置', exact: true })
          .click()
        await frame.getByText('当前设置已保存', { exact: true }).waitFor()
        await frame
          .getByRole('button', { name: '全部展开', exact: true })
          .click()
        const overflow = await frame
          .locator('body')
          .evaluate((node) => node.scrollWidth - node.clientWidth)
        assert(overflow <= 1)
      },
    },
    {
      name: 'permission-center-ui-design',
      path: '/__dev/ui-design',
      viewport: { width: 1486, height: 1000 },
      verify: async (page) => {
        const frame = page.frameLocator('iframe[title="ERP 最新可交互设计"]')
        await frame
          .getByRole('button', { name: '全部模块', exact: true })
          .click()
        await frame
          .locator('[data-action="catalog-nav"][data-page="permissions"]')
          .click()
        const tabs = frame.getByRole('tablist', {
          name: '权限管理',
          exact: true,
        })
        assert.equal(await tabs.getByRole('tab').count(), 4)
        assert.equal(
          await frame
            .getByRole('button', { name: '新建岗位', exact: true })
            .count(),
          0
        )
        assert.equal(
          await frame
            .getByRole('button', { name: '复制岗位', exact: true })
            .count(),
          0
        )
        assert.equal(
          await frame.locator('.permission-function-matrix thead th').count(),
          5
        )
        const alignment = await frame
          .locator('.permission-object-row td')
          .evaluateAll((cells) =>
            cells.flatMap((cell) => {
              const input = cell.querySelector(
                '.permission-capability--compact input'
              )
              if (!input) return []
              const column = cell.getBoundingClientRect()
              const control = input.getBoundingClientRect()
              return Math.abs(
                column.x + column.width / 2 - control.x - control.width / 2
              )
            })
          )
        assert(alignment.length > 0 && alignment.every((offset) => offset < 1))
        const engineering = frame.locator(
          '[data-permission-module="engineering"]'
        )
        assert.equal(
          await engineering
            .getByRole('checkbox', { name: '审核工程用料', exact: true })
            .count(),
          1
        )
        assert.equal(
          await engineering
            .getByRole('checkbox', { name: '审核批准工程采购', exact: true })
            .count(),
          1
        )
        assert.equal(
          await frame
            .locator('.permission-object-row')
            .filter({ hasText: 'BOM' })
            .count(),
          1
        )
        const bomGroup = frame.locator('[data-permission-module="bom"]')
        await bomGroup
          .getByRole('checkbox', {
            name: '物料清单（BOM）全部功能',
            exact: true,
          })
          .check()
        assert.equal(
          await bomGroup
            .getByRole('checkbox', { name: '激活 BOM 版本', exact: true })
            .isChecked(),
          true
        )
        await bomGroup
          .getByRole('checkbox', { name: '激活 BOM 版本', exact: true })
          .uncheck()
        assert.equal(
          await bomGroup
            .getByRole('checkbox', {
              name: '物料清单（BOM）全部功能',
              exact: true,
            })
            .evaluate((input) => input.indeterminate),
          true
        )
        await frame.getByPlaceholder('搜索功能名称或页面').fill('查看应付')
        const checkbox = frame.getByRole('checkbox', {
          name: '查看应付',
          exact: true,
        })
        await checkbox.click()
        await tabs.getByRole('tab', { name: /员工账号/ }).click()
        await frame.getByText('放弃未保存修改？', { exact: true }).waitFor()
        await frame.getByRole('button', { name: '取消', exact: true }).click()
        await frame
          .getByRole('button', { name: '保存岗位设置', exact: true })
          .click()
        await frame.getByRole('tab', { name: /岗位导航/, exact: false }).click()
        await frame
          .getByRole('tab', { name: '菜单排列', exact: true })
          .waitFor()
        await tabs.getByRole('tab', { name: /岗位设置/ }).click()
        await frame.locator('#permission-scope-type').waitFor()
        assert.equal(
          await frame.getByText('本人及下属', { exact: true }).count(),
          0
        )
        const scopeMode = frame.locator('#permission-scope-type')
        const warehouses = frame.locator('#permission-scope-value')
        await scopeMode.selectOption('all')
        assert.equal(await warehouses.count(), 0)
        await scopeMode.selectOption('warehouses')
        await frame
          .getByRole('button', { name: '保存岗位设置', exact: true })
          .click()
        await frame
          .getByText('请选择至少一个允许的仓库', { exact: true })
          .waitFor()
        await warehouses.click()
        const warehousePicker = frame.getByRole('group', {
          name: '允许的仓库',
          exact: true,
        })
        assert.equal(await warehousePicker.locator('input:checked').count(), 0)
        await warehousePicker
          .getByRole('checkbox', { name: '原料仓', exact: true })
          .check()
        assert.equal(
          await warehousePicker
            .getByRole('checkbox', { name: '原料仓', exact: true })
            .isChecked(),
          true
        )
        await warehousePicker
          .getByRole('checkbox', { name: '原料仓', exact: true })
          .press('Escape')
        assert.equal(
          await warehouses.evaluate(
            (node) => node === node.ownerDocument.activeElement
          ),
          true
        )
        assert.match(await warehouses.innerText(), /原料仓/)
        await frame
          .getByRole('button', { name: '保存岗位设置', exact: true })
          .click()
        await tabs.getByRole('tab', { name: /员工账号/ }).click()
        await frame
          .getByRole('button', { name: '创建员工账号', exact: true })
          .click()
        await frame.locator('#permission-account-form').waitFor()
        await frame
          .getByRole('textbox', { name: '姓名', exact: true })
          .fill('演示员工')
        await frame
          .getByRole('button', { name: '返回列表', exact: true })
          .click()
        await frame.getByText('放弃未保存修改？', { exact: true }).waitFor()
        await frame
          .getByRole('button', { name: '放弃调整', exact: true })
          .click()
        await tabs.getByRole('tab', { name: /审批责任/ }).click()
        assert.equal(
          await frame
            .getByRole('button', { name: '调整设置', exact: true })
            .count(),
          3
        )
        assert.equal(
          await frame
            .getByRole('button', { name: '新建责任规则', exact: true })
            .count(),
          0
        )
        const overflow = await frame
          .locator('body')
          .evaluate((node) => node.scrollWidth - node.clientWidth)
        assert(overflow <= 1)
        await tabs.getByRole('tab', { name: /岗位设置/ }).click()
        await frame.getByPlaceholder('搜索功能名称或页面').fill('')
        await page.screenshot({
          path: 'output/playwright/style-l1/permission-center-unified-design.png',
        })
      },
    },
  ]
}
