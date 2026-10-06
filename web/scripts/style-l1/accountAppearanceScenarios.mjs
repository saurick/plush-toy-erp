import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { assertBusinessModalViewport } from './modalAssertions.mjs'

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
    {
      ...desktop,
      name: 'account-appearance-save-layout',
      beforeNavigate: desktopSave.beforeNavigate,
      verify: async (page) => {
        await page
          .getByRole('button', { name: '外观与密度', exact: true })
          .click()
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
              ['绿色', { accent: 'green' }],
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
        await dialog.getByRole('button', { name: '完成', exact: true }).click()
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
              ['绿色', { accent: 'green' }],
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
        await page
          .getByRole('button', { name: '外观与密度', exact: true })
          .click()
        const dialog = page.getByRole('dialog', { name: '外观与密度' })
        await dialog.getByRole('button', { name: '紫色', exact: true }).click()
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
        await writeFile(
          `${outputDir}/account-appearance-desktop-metrics.json`,
          JSON.stringify(metrics, null, 2)
        )
        await dialog.getByRole('button', { name: '完成', exact: true }).click()
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
        await page
          .getByRole('button', { name: '外观与密度', exact: true })
          .click()
        await dialog.getByText('跟系统', { exact: true }).click()
        await waitForSavedAppearance(page, { theme_mode: 'system' })
        for (const colorScheme of ['light', 'dark']) {
          await page.emulateMedia({ colorScheme })
          await page.waitForFunction(
            (scheme) => document.documentElement.dataset.erpTheme === scheme,
            colorScheme
          )
        }
        await dialog.getByRole('button', { name: '完成', exact: true }).click()
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
        await page
          .getByRole('button', { name: '外观与密度', exact: true })
          .click()
        const dialog = page.getByRole('dialog', { name: '外观与密度' })
        await dialog.getByRole('button', { name: '绿色', exact: true }).click()
        await dialog
          .getByText('外观设置未保存到账号，请重试。', { exact: true })
          .waitFor()
        assert.equal(
          await dialog
            .getByRole('button', { name: '绿色', exact: true })
            .getAttribute('aria-pressed'),
          'true'
        )
        assert.equal(
          await dialog
            .getByRole('button', { name: '完成', exact: true })
            .isEnabled(),
          true
        )
        await dialog.getByRole('button', { name: '重试', exact: true }).click()
        await waitForSavedAppearance(page, { accent: 'green' })
        assert.equal(
          await dialog
            .getByRole('button', { name: '重试', exact: true })
            .count(),
          0
        )
        await dialog.getByRole('button', { name: '蓝色', exact: true }).click()
        await waitForSavedAppearance(page, { accent: 'blue' })
        await dialog.getByRole('button', { name: '完成', exact: true }).click()
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
          .getByRole('button', { name: '黄色', exact: true })
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
            .getByRole('button', { name: '黄色', exact: true })
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
