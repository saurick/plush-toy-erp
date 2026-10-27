import { openERPAppearance } from './themeAssertions.mjs'
import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { ERP_ACCENTS, WORKBENCH_APPEARANCE_STORAGE_KEY } from '../../src/common/theme/erpAppearance.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { assertBusinessModalViewport } from './modalAssertions.mjs'
import { assertReadableOnBackground } from './colorAssertions.mjs'
import { installAdminRpcMocks } from './adminRpcMocks.mjs'
import { createMockAdminSessionToken } from '../mockAdminSessionToken.mjs'

async function waitForSavedAppearance(page, expected) {
  await page.waitForFunction((expected) => {
    const value = JSON.parse(
      localStorage.getItem('admin_erp_preferences') || '{}'
    ).appearance
    return (
      value &&
      Object.entries(expected).every(([key, setting]) => value[key] === setting)
    )
  }, expected)
  await page
    .locator('.erp-appearance-save-status')
    .waitFor({ state: 'hidden' })
}

function holdAppearanceSaves() {
  let release
  return {
    beforeNavigate: async (page) => {
      await page.route('**/rpc/admin', async (route) => {
        if (route.request().postDataJSON().method === 'set_erp_appearance') {
          await new Promise((resolve) => {
            release = resolve
          })
        }
        await route.fallback()
      })
    },
    release: () => {
      release?.()
      release = null
    },
  }
}

async function readAppearanceGeometry(surface) {
  return surface.evaluate((node) => {
    const box = (element) => element?.getBoundingClientRect().toJSON()
    const settings = node.querySelector('.erp-appearance-settings')
    const footer = node.querySelector('.ant-modal-footer')
    return {
      surface: box(node),
      fields: [...settings.querySelectorAll('fieldset')].map(box),
      footer: box(footer),
      complete: box(footer?.querySelector('button')),
      adjacent: footer ? null : box(node.nextElementSibling),
      overflow: settings.scrollWidth - settings.clientWidth,
      settingsDisplay: getComputedStyle(settings).display,
      settingsGap: getComputedStyle(settings).gap,
    }
  })
}

function assertAppearanceGeometryStable(before, after, state) {
  assert.ok(after.overflow <= 1, `${state}没有横向溢出`)
  const compare = (left, right, part) => {
    if (!left && !right) return
    for (const key of ['x', 'y', 'width', 'height']) {
      assert.ok(
        Math.abs(left[key] - right[key]) <= 1,
        `${state} ${part}.${key} 位移：${left[key]} → ${right[key]}`
      )
    }
  }
  for (const part of ['surface', 'footer', 'complete', 'adjacent']) {
    compare(before[part], after[part], part)
  }
  assert.equal(before.fields.length, after.fields.length)
  before.fields.forEach((field, index) => {
    compare(field, after.fields[index], `field-${index}`)
  })
}

async function verifyAppearanceSaveGeometry({
  page,
  surface,
  heldSave,
  steps,
  outputFile,
}) {
  const evidence = []
  await surface.waitFor({ state: 'visible' })
  for (const { label, patch, click } of steps) {
    await waitForFiniteAnimations(page)
    const before = await readAppearanceGeometry(surface)
    await click()
    try {
      await surface.getByText('正在保存外观设置…', { exact: true }).waitFor()
      await waitForFiniteAnimations(page)
      const saving = await readAppearanceGeometry(surface)
      evidence.push({ label, before, saving })
      await writeFile(outputFile, JSON.stringify(evidence, null, 2))
      if (label === '暗色') {
        await page.screenshot({
          path: outputFile.replace('.json', '-saving.png'),
        })
      }
      assertAppearanceGeometryStable(before, saving, `${label}/保存中`)
    } finally {
      heldSave.release()
    }
    await waitForSavedAppearance(page, patch)
    const saved = await readAppearanceGeometry(surface)
    evidence.at(-1).saved = saved
    await writeFile(outputFile, JSON.stringify(evidence, null, 2))
    assertAppearanceGeometryStable(before, saved, `${label}/保存完成`)
  }
}

export function createAccountAppearanceScenarios({
  customerRuntimeEffectiveSession,
  outputDir,
}) {
  const desktop = {
    auth: 'admin',
    path: '/erp/system/permissions',
    themeMode: 'light',
    effectiveSession: customerRuntimeEffectiveSession,
    viewport: { width: 3840, height: 2160 },
    deviceScaleFactor: 1,
  }
  const desktopSave = holdAppearanceSaves()
  const mobileSave = holdAppearanceSaves()
  return [
    ...[false, true].map((mobile) => ({
      name: `account-appearance-logout-${mobile ? 'mobile' : 'desktop'}`,
      path: '/admin-login',
      mockAdminRpc: true,
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: mobile ? { width: 390, height: 844 } : desktop.viewport,
      deviceScaleFactor: 1,
      beforeNavigate: async (page) => {
        await page.addInitScript((mobile) => {
          if (localStorage.getItem('plush_erp_theme_mode') === null) {
            localStorage.setItem('plush_erp_theme_mode', 'light')
            localStorage.setItem('plush_erp_appearance', JSON.stringify({ accent: 'orange' }))
          }
          localStorage.setItem('erp:last_entry_target', mobile ? 'mobileTasks' : 'desktop')
        }, mobile)
      },
      verify: async (page) => {
        const saves = []
        page.on('request', (request) => {
          if (request.url().endsWith('/rpc/admin') && request.method() === 'POST') {
            const body = request.postDataJSON()
            if (body.method === 'set_erp_appearance') saves.push(body.params)
          }
        })
        const expectTheme = async (theme_mode, accent) => {
          await page.waitForFunction(
            (expected) => document.documentElement.dataset.erpThemeMode === expected.theme_mode &&
              document.documentElement.dataset.erpAccent === expected.accent,
            { theme_mode, accent }
          )
        }
        const login = async (id, appearance) => {
          const profile = {
            id,
            user_id: id,
            username: `style-l1-appearance-${id}`,
            display_name: '外观测试',
            is_super_admin: true,
            roles: [{ role_key: 'boss', name: '老板' }],
            permissions: ['workflow.task.read', 'mobile.boss.access'],
            menus: [{ path: '/erp/dashboard' }],
            erp_preferences: { appearance },
          }
          await installAdminRpcMocks(page, {
            baseURL: new URL(page.url()).origin,
            adminProfileOverride: profile,
            effectiveSessionOverride: customerRuntimeEffectiveSession,
          })
          await page.route('**/rpc/auth', async (route) => {
            const body = route.request().postDataJSON()
            if (body.method !== 'admin_login') return route.fallback()
            assert.equal(body.params.username, profile.username)
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                jsonrpc: '2.0', id: body.id,
                result: { code: 0, message: 'OK', data: {
                  ...profile,
                  access_token: createMockAdminSessionToken({ userID: id }),
                } },
              }),
            })
          })
          await page.getByLabel('账号').fill(profile.username)
          await page.getByLabel('密码', { exact: true }).fill('style-l1-password')
          await page.getByRole('button', { name: '登录', exact: true }).click()
          await page.locator(mobile ? '.mobile-role-tasks-page' : '.erp-admin-shell').waitFor()
          await waitForFiniteAnimations(page)
        }
        const logout = async () => {
          if (mobile) {
            await page.getByTestId('mobile-role-nav-mine').click()
            await page.getByRole('button', { name: '退出登录', exact: true }).click()
          } else {
            await page.getByTestId('desktop-account-menu-trigger').click()
            await page.getByRole('menuitem', { name: /退出登录$/u }).click()
          }
          await page.locator('.erp-login-page').waitFor()
          assert.equal(await page.evaluate(() => localStorage.getItem('admin_access_token')), null)
        }
        const firstAppearance = { theme_mode: 'dark', accent: 'purple', density: 'standard', tableLines: 'simple' }
        await expectTheme('light', 'orange')
        await login(1, firstAppearance)
        await expectTheme('dark', 'purple')
        await logout()
        await expectTheme('dark', 'purple')
        await page.reload()
        await page.getByLabel('账号').waitFor({ state: 'visible' })
        await expectTheme('dark', 'purple')
        await waitForFiniteAnimations(page)
        await page.screenshot({ path: `${outputDir}/account-appearance-logout-${mobile ? 'mobile' : 'desktop'}-login.png` })
        await openERPAppearance(page)
        const dialog = page.getByRole('dialog', { name: '外观设置' })
        await dialog.getByText('浅色', { exact: true }).click()
        await dialog.getByRole('button', { name: ERP_ACCENTS.teal.label, exact: true }).click()
        await dialog.getByRole('button', { name: '关闭', exact: true }).click()
        await expectTheme('light', 'teal')
        await login(2, { theme_mode: 'system', accent: 'pink' })
        await expectTheme('system', 'pink')
        await logout()
        await expectTheme('system', 'pink')
        for (const colorScheme of ['dark', 'light']) {
          await page.emulateMedia({ colorScheme })
          await page.waitForFunction((scheme) => document.documentElement.dataset.erpTheme === scheme, colorScheme)
        }
        await login(3, {})
        await expectTheme('system', 'blue')
        await logout()
        await login(1, firstAppearance)
        await expectTheme('dark', 'purple')
        assert.deepEqual(saves, [], '登录页调整和切换账号不能改写账号外观')
      },
    })),
    ...[false, true].map((standalone) => {
      const saves = []
      return {
        auth: 'admin',
        path: '/__dev/product-engineering',
        name: standalone ? 'workbench-appearance-standalone-isolation' : 'workbench-appearance-account-isolation',
        effectiveSession: customerRuntimeEffectiveSession,
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 2,
        adminProfile: {
          erp_preferences: {
            appearance: { theme_mode: 'dark', accent: 'pink', density: 'standard', tableLines: 'simple' },
          },
        },
        beforeNavigate: async (page) => {
          page.on('request', (request) => {
            if (request.url().endsWith('/rpc/admin') && request.method() === 'POST') {
              const body = request.postDataJSON()
              if (body.method === 'set_erp_appearance') saves.push(body.params)
            }
          })
          if (standalone) {
            await page.route('**/__dev/**', async (route) => {
              if (route.request().resourceType() !== 'document') return route.fallback()
              const response = await page.request.get(new URL('/workbench.html', route.request().url()).href)
              assert.equal(response.status(), 200, '独立工作台 HTML 入口必须可用')
              await route.fulfill({ response })
            })
          }
        },
        verify: async (page) => {
          const expectAppearance = async (expected) => {
            await page.waitForFunction((expected) => {
              const root = document.documentElement.dataset
              return root.erpThemeMode === expected.theme_mode &&
                root.erpAccent === expected.accent && root.erpDensity === expected.density &&
                root.erpTableLines === expected.tableLines
            }, expected)
          }
          const initial = { theme_mode: 'system', accent: 'blue', density: 'compact', tableLines: 'grid' }
          const chosen = { theme_mode: 'light', accent: 'teal', density: 'standard', tableLines: 'simple' }
          await page.getByRole('heading', { name: '产品与业务', exact: true }).waitFor()
          await expectAppearance(initial)
          const accountBefore = await page.evaluate(() => localStorage.getItem('admin_erp_preferences'))
          await openERPAppearance(page)
          const dialog = page.getByRole('dialog', { name: '外观与密度' })
          await dialog.getByRole('button', { name: '青绿', exact: true }).click()
          await dialog.getByText('浅色', { exact: true }).click()
          await dialog.getByText('标准', { exact: true }).click()
          await dialog.getByText('简洁', { exact: true }).click()
          await expectAppearance(chosen)
          assert.deepEqual(await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), WORKBENCH_APPEARANCE_STORAGE_KEY), chosen)
          assert.equal(await page.evaluate(() => localStorage.getItem('admin_erp_preferences')), accountBefore)
          assert.deepEqual(saves, [], '工作台操作不能写入 ERP 账号')
          await dialog.getByRole('button', { name: '关闭', exact: true }).click()
          await page.reload()
          await expectAppearance(chosen)
          const nav = page.getByRole('navigation', { name: '开发页面导航' })
          await nav.getByRole('link', { name: '测试验证', exact: true }).click()
          await page.getByRole('heading', { name: '测试验证', exact: true }).waitFor()
          await expectAppearance(chosen)
          await page.goBack()
          await page.getByRole('heading', { name: '产品与业务', exact: true }).waitFor()
          await expectAppearance(chosen)

          await page.goto(new URL('/erp/system/permissions', page.url()).href)
          await expectAppearance({ theme_mode: 'dark', accent: 'pink', density: 'standard', tableLines: 'simple' })
          await page.locator('.erp-admin-shell').waitFor({ state: 'visible' })
          await openERPAppearance(page)
          await dialog.getByRole('button', { name: '橙色', exact: true }).click()
          await waitForSavedAppearance(page, { accent: 'orange' })
          assert.deepEqual(saves, [{ accent: 'orange' }], 'ERP 自身仍按账号保存外观')
          await dialog.getByRole('button', { name: '关闭', exact: true }).click()
          await page.goto(new URL('/__dev/product-engineering', page.url()).href)
          await expectAppearance(chosen)
          await openERPAppearance(page)
          await dialog.getByText('跟系统', { exact: true }).click()
          for (const colorScheme of ['dark', 'light']) {
            await page.emulateMedia({ colorScheme })
            await page.waitForFunction((scheme) => document.documentElement.dataset.erpTheme === scheme, colorScheme)
          }
          await dialog.getByRole('button', { name: '关闭', exact: true }).click()
          await expectAppearance({ ...chosen, theme_mode: 'system' })
          await dialog.waitFor({ state: 'hidden' })
          assert.deepEqual(saves, [{ accent: 'orange' }])
          const geometry = await nav.evaluate((node) => ({
            width: node.getBoundingClientRect().width,
            overflow: document.documentElement.scrollWidth - innerWidth,
            expandedGroups: node.querySelectorAll('.erp-dev-workspace-nav__secondary').length,
          }))
          assert.equal(geometry.width, 206)
          assert(geometry.overflow <= 1, '独立偏好不得引入页面横向溢出')
          assert.equal(geometry.expandedGroups, 4, '保持四个侧栏分组展开')
        },
      }
    }),
    ...[
      {
        name: 'account-appearance-defaults',
        saved: {},
        expected: { density: 'compact', tableLines: 'grid', rowHeight: 42 },
      },
      {
        name: 'account-appearance-saved-standard',
        saved: {
          appearance: {
            theme_mode: 'system',
            accent: 'blue',
            density: 'standard',
            tableLines: 'simple',
          },
        },
        expected: { density: 'standard', tableLines: 'simple', rowHeight: 52 },
      },
    ].map(({ name, saved, expected }) => ({
      ...desktop,
      name,
      path: '/erp/master/partners/customers',
      adminProfile: { erp_preferences: saved },
      verify: async (page) => {
        for (let load = 0; load < 2; load += 1) {
          if (load) await page.reload()
          await page.waitForFunction(
            ({ density, tableLines }) =>
              document.documentElement.dataset.erpDensity === density &&
              document.documentElement.dataset.erpTableLines === tableLines,
            expected
          )
          const row = page
            .locator('.app-table .ant-table-tbody > .ant-table-row')
            .first()
          await row.waitFor({ state: 'visible' })
          const metrics = await row.evaluate((node) => ({
            height: node.getBoundingClientRect().height,
            divider: getComputedStyle(node.querySelectorAll('td')[1]).boxShadow,
          }))
          assert.ok(
            Math.abs(metrics.height - expected.rowHeight) <= 1,
            JSON.stringify(metrics)
          )
          assert.equal(
            metrics.divider !== 'none',
            expected.tableLines === 'grid',
            JSON.stringify(metrics)
          )
        }
      },
    })),
    {
      ...desktop,
      name: 'account-appearance-save-layout',
      adminProfile: {
        erp_preferences: {
          appearance: {
            theme_mode: 'light',
            accent: 'blue',
            density: 'standard',
            tableLines: 'simple',
          },
        },
      },
      beforeNavigate: desktopSave.beforeNavigate,
      verify: async (page) => {
        await openERPAppearance(page)
        const dialog = page.getByRole('dialog', { name: '外观与密度' })
        for (const width of [3840, 1440]) {
          await page.setViewportSize({
            width,
            height: width === 3840 ? 2160 : 1000,
          })
          await assertBusinessModalViewport(page, dialog, {
            label: '外观与密度',
            maxWidth: 470,
          })
          await verifyAppearanceSaveGeometry({
            page,
            surface: dialog,
            heldSave: desktopSave,
            outputFile: `${outputDir}/account-appearance-save-layout-${width}.json`,
            steps: [
              [ERP_ACCENTS.teal.label, { accent: 'teal' }],
              ['暗色', { theme_mode: 'dark' }],
              ['紧凑', { density: 'compact' }],
              ['网格', { tableLines: 'grid' }],
              ['蓝色', { accent: 'blue' }],
              ['浅色', { theme_mode: 'light' }],
              ['标准', { density: 'standard' }],
              ['简洁', { tableLines: 'simple' }],
            ].map(([label, patch]) => ({
              label,
              patch,
              click: () => dialog.getByText(label, { exact: true }).click(),
            })),
          })
        }
        await dialog
          .locator('.ant-modal-footer')
          .getByRole('button', { name: '关闭', exact: true })
          .click()
        await dialog.waitFor({ state: 'hidden' })
        await waitForFiniteAnimations(page)
      },
    },
    {
      auth: 'admin',
      path: '/m/boss/tasks',
      name: 'account-appearance-mobile-save-layout',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 390, height: 844 },
      beforeNavigate: mobileSave.beforeNavigate,
      verify: async (page) => {
        await page.getByTestId('mobile-role-nav-mine').click()
        const settings = page.locator('.mobile-task-display-settings')
        for (const width of [320, 430]) {
          await page.setViewportSize({ width, height: 844 })
          await verifyAppearanceSaveGeometry({
            page,
            surface: settings,
            heldSave: mobileSave,
            outputFile: `${outputDir}/account-appearance-mobile-save-layout-${width}.json`,
            steps: [
              [ERP_ACCENTS.green.label, { accent: 'green' }],
              ['暗色', { theme_mode: 'dark' }],
              ['蓝色', { accent: 'blue' }],
              ['浅色', { theme_mode: 'light' }],
            ].map(([label, patch]) => ({
              label,
              patch,
              click: () => settings.getByText(label, { exact: true }).click(),
            })),
          })
        }
      },
    },
    {
      ...desktop,
      name: 'account-appearance-desktop',
      verify: async (page) => {
        await openERPAppearance(page)
        const dialog = page.getByRole('dialog', { name: '外观与密度' })
        const primary = dialog.locator('.ant-modal-footer .ant-btn-primary')
        const primaryPaints = []
        for (const [mode, label] of [['light', '浅色'], ['dark', '暗色']]) {
          await dialog.getByText(label, { exact: true }).click()
          for (const [accent, palette] of Object.entries(ERP_ACCENTS)) {
            await dialog.getByRole('button', { name: palette.label, exact: true }).click()
            await waitForSavedAppearance(page, { theme_mode: mode, accent })
            await waitForFiniteAnimations(page)
            const normal = await primary.evaluate((node) => {
              const css = getComputedStyle(node)
              return { color: css.color, background: css.backgroundColor }
            })
            assertReadableOnBackground(normal.color, normal.background, `${mode}/${accent} 标准主按钮`)
            await primary.hover()
            await waitForFiniteAnimations(page)
            const hover = await primary.evaluate((node) => {
              const css = getComputedStyle(node)
              return { color: css.color, background: css.backgroundColor }
            })
            assertReadableOnBackground(hover.color, hover.background, `${mode}/${accent} 悬停主按钮`)
            primaryPaints.push({ mode, accent, normal, hover })
          }
        }
        await page.mouse.move(0, 0)
        await writeFile(`${outputDir}/account-appearance-primary-paints.json`, JSON.stringify(primaryPaints, null, 2))
        await dialog
          .getByRole('button', { name: ERP_ACCENTS.purple.label, exact: true })
          .click()
        await dialog.getByText('暗色', { exact: true }).click()
        await dialog.getByText('紧凑', { exact: true }).click()
        await dialog.getByText('网格', { exact: true }).click()
        await waitForSavedAppearance(page, {
          theme_mode: 'dark',
          accent: 'purple',
          density: 'compact',
          tableLines: 'grid',
        })
        const metrics = await dialog.evaluate((node) => ({
          viewport: {
            width: innerWidth,
            height: innerHeight,
            dpr: devicePixelRatio,
          },
          box: node.getBoundingClientRect().toJSON(),
          width: node.clientWidth,
          scrollWidth: node.scrollWidth,
          root: { ...document.documentElement.dataset },
        }))
        assert.equal(metrics.viewport.width, 3840)
        assert.equal(metrics.viewport.height, 2160)
        assert.equal(metrics.viewport.dpr, 1)
        assert.ok(metrics.scrollWidth <= metrics.width + 1)
        assert.equal(metrics.root.erpTheme, 'dark')
        await page.screenshot({
          path: `${outputDir}/account-appearance-desktop-settings.png`,
        })
        await dialog.screenshot({
          path: `${outputDir}/account-appearance-desktop-settings-detail.png`,
        })
        await writeFile(
          `${outputDir}/account-appearance-desktop-metrics.json`,
          JSON.stringify(metrics, null, 2)
        )
        await dialog
          .locator('.ant-modal-footer')
          .getByRole('button', { name: '关闭', exact: true })
          .click()
        await dialog.waitFor({ state: 'hidden' })
        await waitForFiniteAnimations(page)
        await page.evaluate(() => {
          localStorage.removeItem('plush_erp_appearance:admin:1')
          localStorage.removeItem('admin_erp_preferences')
        })
        await page.reload()
        await page.waitForFunction(
          () =>
            document.documentElement.dataset.erpAccent === 'purple' &&
            document.documentElement.dataset.erpThemeMode === 'dark' &&
            document.documentElement.dataset.erpDensity === 'compact' &&
            document.documentElement.dataset.erpTableLines === 'grid'
        )
        await waitForSavedAppearance(page, {
          theme_mode: 'dark',
          accent: 'purple',
          density: 'compact',
          tableLines: 'grid',
        })
        await openERPAppearance(page)
        await dialog.getByText('跟系统', { exact: true }).click()
        await waitForSavedAppearance(page, { theme_mode: 'system' })
        for (const colorScheme of ['light', 'dark']) {
          await page.emulateMedia({ colorScheme })
          await page.waitForFunction(
            (scheme) => document.documentElement.dataset.erpTheme === scheme,
            colorScheme
          )
        }
        await dialog
          .locator('.ant-modal-footer')
          .getByRole('button', { name: '关闭', exact: true })
          .click()
        await dialog.waitFor({ state: 'hidden' })
        await waitForFiniteAnimations(page)
      },
    },
    {
      ...desktop,
      name: 'account-appearance-save-retry',
      viewport: { width: 1440, height: 1000 },
      beforeNavigate: async (page) => {
        let failed = false
        await page.route('**/rpc/admin', async (route) => {
          const body = route.request().postDataJSON()
          if (body.method === 'set_erp_appearance' && !failed) {
            failed = true
            await route.fulfill({
              status: 200,
              contentType: 'application/json',
              body: JSON.stringify({
                jsonrpc: '2.0',
                id: body.id,
                result: { code: 500, message: 'save unavailable', data: {} },
              }),
            })
          } else await route.fallback()
        })
      },
      verify: async (page) => {
        await openERPAppearance(page)
        const dialog = page.getByRole('dialog', { name: '外观与密度' })
        await dialog
          .getByRole('button', { name: ERP_ACCENTS.teal.label, exact: true })
          .click()
        await dialog
          .getByText('外观设置未保存到账号，请重试。', { exact: true })
          .waitFor()
        assert.equal(
          await dialog
            .getByRole('button', { name: ERP_ACCENTS.teal.label, exact: true })
            .getAttribute('aria-pressed'),
          'true'
        )
        assert.equal(
          await dialog
            .locator('.ant-modal-footer')
            .getByRole('button', { name: '关闭', exact: true })
            .isEnabled(),
          true
        )
        await dialog.getByRole('button', { name: '重试', exact: true }).click()
        await waitForSavedAppearance(page, { accent: 'teal' })
        assert.equal(
          await dialog
            .getByRole('button', { name: '重试', exact: true })
            .count(),
          0
        )
        await dialog.getByRole('button', { name: '蓝色', exact: true }).click()
        await waitForSavedAppearance(page, { accent: 'blue' })
        await dialog
          .locator('.ant-modal-footer')
          .getByRole('button', { name: '关闭', exact: true })
          .click()
        await dialog.waitFor({ state: 'hidden' })
        await waitForFiniteAnimations(page)
      },
    },
    {
      auth: 'admin',
      path: '/m/boss/tasks',
      name: 'account-appearance-mobile',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 390, height: 844 },
      adminProfile: {
        erp_preferences: {
          column_orders: {},
          hidden_columns: {},
          appearance: {
            theme_mode: 'dark',
            accent: 'purple',
            density: 'compact',
            tableLines: 'grid',
          },
        },
      },
      verify: async (page) => {
        await page.getByTestId('mobile-role-nav-mine').click()
        const settings = page.locator('.mobile-task-display-settings')
        await settings
          .getByRole('button', { name: ERP_ACCENTS.yellow.label, exact: true })
          .click()
        await settings.getByText('跟系统', { exact: true }).click()
        await waitForSavedAppearance(page, {
          theme_mode: 'system',
          accent: 'yellow',
          density: 'compact',
          tableLines: 'grid',
        })
        assert.equal(
          await settings.getByText('表格密度', { exact: true }).count(),
          0
        )
        await page.reload()
        await page.getByTestId('mobile-role-nav-mine').click()
        await waitForSavedAppearance(page, {
          theme_mode: 'system',
          accent: 'yellow',
          density: 'compact',
          tableLines: 'grid',
        })
        assert.equal(
          await settings
            .getByRole('button', { name: ERP_ACCENTS.yellow.label, exact: true })
            .getAttribute('aria-pressed'),
          'true'
        )
        for (const width of [320, 430]) {
          await page.setViewportSize({ width, height: 844 })
          const bounds = await settings.evaluate((node) => ({
            width: node.clientWidth,
            scrollWidth: node.scrollWidth,
          }))
          assert.ok(
            bounds.scrollWidth <= bounds.width + 1,
            JSON.stringify(bounds)
          )
        }
      },
    },
  ]
}
