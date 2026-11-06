import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { openERPAppearance } from './themeAssertions.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { assertReadableOnBackground } from './colorAssertions.mjs'
import { openUIDesignAppearance } from './devUIDesignNavigation.mjs'

const labels = ['表格密度', '表格线条', '编辑页显示']
const notes = [
  '紧凑减少行高和留白，同屏可显示更多记录。',
  '简洁弱化分隔线；网格突出行列边界，方便逐格核对。',
  '适用于长编辑页：目录整页展示并定位分区；页签按分区切换。',
]

async function readHelpGeometry(page, popup, trigger) {
  return popup.evaluate((node, triggerLabel) => {
    const rect = (element) => element.getBoundingClientRect().toJSON()
    const button = document.querySelector(`button[aria-label="${triggerLabel}"]`)
    const content = node.querySelector('.erp-appearance-help-content')
    const legends = [...document.querySelectorAll('.erp-appearance-settings legend')]
    const paint = getComputedStyle(content)
    return {
      popup: rect(node),
      trigger: rect(button),
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      overflow: content.scrollWidth - content.clientWidth,
      scrollHeight: content.scrollHeight,
      clientHeight: content.clientHeight,
      legends: legends.map((legend) => ({ box: rect(legend), text: rect(legend.querySelector('span') || legend) })),
      examples: [...content.querySelectorAll('figure')].map((figure) => ({
        box: rect(figure), overflow: figure.scrollWidth - figure.clientWidth,
      })),
      editors: [...content.querySelectorAll('.erp-appearance-help-editor')].map((editor) => ({
        clipped: editor.scrollHeight - editor.clientHeight,
      })),
      rows: [...content.querySelectorAll('tbody tr:first-child')].map(rect),
      background: getComputedStyle(node.querySelector('.ant-popover-inner')).backgroundColor,
      text: paint.color,
    }
  }, await trigger.getAttribute('aria-label'))
}

function assertHelpGeometry(metrics, narrow) {
  const { popup, trigger, viewport } = metrics
  assert.ok(popup.x >= 8 && popup.right <= viewport.width - 8, '说明气泡限制在视口宽度内')
  assert.ok(popup.y >= 8 && popup.bottom <= viewport.height - 8, '说明气泡限制在视口高度内')
  assert.ok(popup.right <= trigger.x || popup.x >= trigger.right || popup.bottom <= trigger.y || popup.y >= trigger.bottom, '说明不遮挡自身入口')
  assert.ok(trigger.width >= (narrow ? 44 : 28) && trigger.height >= (narrow ? 44 : 28), '帮助入口保留点击区域')
  assert.ok(metrics.overflow <= 1 && metrics.examples.every((example) => example.overflow <= 1), '示意图没有横向裁剪')
  assert.ok(metrics.editors.every((editor) => editor.clipped <= 1), '目录示意完整展示三组内容')
  const legendHeights = metrics.legends.map(({ box }) => box.height)
  assert.ok(Math.max(...legendHeights) - Math.min(...legendHeights) <= 1, '有无图标的标题行等高')
  assertReadableOnBackground(metrics.text, metrics.background, '外观帮助正文')
}

export function createAppearanceHelpScenarios({ desktop, outputDir }) {
  const scenarios = [
    { key: 'desktop', viewport: { width: 1440, height: 1000 }, themeMode: 'light' },
    { key: 'dark', viewport: { width: 1024, height: 768 }, themeMode: 'dark' },
    { key: 'touch', viewport: { width: 390, height: 844 }, themeMode: 'light' },
    { key: 'small', viewport: { width: 320, height: 568 }, themeMode: 'dark' },
    { key: 'short', viewport: { width: 390, height: 420 }, themeMode: 'light' },
  ].map(({ key, viewport, themeMode }) => ({
    ...desktop,
    name: `account-appearance-help-${key}`,
    viewport,
    themeMode,
    verify: async (page) => {
      const narrow = viewport.width <= 767
      const saves = []
      page.on('request', (request) => {
        if (!request.url().endsWith('/rpc/admin') || request.method() !== 'POST') return
        const body = request.postDataJSON()
        if (body.method === 'set_erp_appearance') saves.push(body.params)
      })
      await openERPAppearance(page)
      const dialog = page.getByRole('dialog', { name: '外观与密度', exact: true })
      await dialog.waitFor()
      await waitForFiniteAnimations(page)
      const preferences = await page.evaluate(() => localStorage.getItem('admin_erp_preferences'))
      const popup = page.locator('.erp-appearance-help-popover:visible')
      const evidence = []
      for (const [index, label] of labels.entries()) {
        const trigger = dialog.getByRole('button', { name: `查看${label}说明`, exact: true })
        if (narrow) await trigger.tap()
        else await trigger.hover()
        await popup.waitFor()
        await popup.getByText(notes[index], { exact: true }).waitFor()
        await waitForFiniteAnimations(page)
        assert.equal(await popup.count(), 1, '一次只展示一组说明')
        assert.equal(await popup.locator('figure').count(), 2)
        const metrics = await readHelpGeometry(page, popup, trigger)
        evidence.push({ label, ...metrics })
        await writeFile(`${outputDir}/account-appearance-help-${key}-metrics.json`, JSON.stringify(evidence, null, 2))
        assertHelpGeometry(metrics, narrow)
        if (metrics.scrollHeight > metrics.clientHeight + 1) {
          await popup.locator('.erp-appearance-help-note').scrollIntoViewIfNeeded()
          const lastLine = await popup.locator('.erp-appearance-help-note').boundingBox()
          assert.ok(lastLine.y + lastLine.height <= metrics.popup.bottom, '滚动可读到说明末尾')
        }
        if (index === 0) assert.ok(metrics.rows[0].height > metrics.rows[1].height, '紧凑示意只收紧数据行')
        if (index === 1) {
          const borders = await popup.locator('tbody td:first-child').evaluateAll((cells) => cells.map((cell) => getComputedStyle(cell).borderRightWidth))
          assert.equal(borders[0], '0px')
          assert.equal(borders[3], '1px')
        }
        if (index === 2 || key === 'desktop') await page.screenshot({ path: `${outputDir}/account-appearance-help-${key}-${index}.png` })
        if (!narrow) {
          await popup.hover()
          await page.waitForTimeout(250)
          assert.equal(await popup.isVisible(), true, '鼠标可以移入气泡阅读')
        } else {
          await trigger.tap()
          await popup.waitFor({ state: 'hidden' })
          await trigger.tap()
          await popup.waitFor()
        }
        await page.keyboard.press('Escape')
        await popup.waitFor({ state: 'hidden' })
        assert.equal(await dialog.isVisible(), true, 'Escape 只关闭说明')
        assert.equal(await trigger.getAttribute('aria-expanded'), 'false')
        if (index === 0 && !narrow) {
          await page.mouse.move(0, 0)
          await page.keyboard.press('Tab')
          await page.keyboard.press('Shift+Tab')
          await trigger.focus()
          await popup.waitFor()
          await page.keyboard.press('Escape')
          await popup.waitFor({ state: 'hidden' })
        }
      }
      assert.deepEqual(saves, [], '查看说明不保存账号偏好')
      assert.equal(await page.evaluate(() => localStorage.getItem('admin_erp_preferences')), preferences)

      const first = dialog.getByRole('button', { name: '查看表格密度说明', exact: true })
      await first.click()
      await popup.waitFor()
      await page.mouse.move(0, 0)
      await page.waitForTimeout(250)
      assert.equal(await popup.isVisible(), true, '点击固定后移开鼠标仍可阅读')
      if (narrow) {
        await first.tap()
        await popup.waitFor({ state: 'hidden' })
      }
      await dialog.getByRole('button', { name: '查看表格线条说明', exact: true }).click()
      await popup.getByText(notes[1], { exact: true }).waitFor()
      await waitForFiniteAnimations(page)
      assert.equal(await popup.count(), 1)
      await dialog.getByText('主题色', { exact: true }).click()
      await popup.waitFor({ state: 'hidden' })

      for (const [group, label, field, value] of [
        ['表格密度', '标准', 'density', 'standard'],
        ['表格线条', '简洁', 'tableLines', 'simple'],
        ['编辑页显示', '页签', 'formDisplay', 'section'],
      ]) {
        const start = saves.length
        await dialog.locator(`[aria-label="${group}"]`).getByRole('radio', { name: label, exact: true }).locator('..').click()
        await page.waitForFunction(({ field, value }) => JSON.parse(localStorage.getItem('admin_erp_preferences') || '{}').appearance?.[field] === value, { field, value })
        assert.deepEqual(saves.slice(start), [{ [field]: value }], '只有实际选项操作才保存对应偏好')
      }
      await first.click()
      await popup.waitFor()
      await dialog.locator('.ant-modal-footer').getByRole('button', { name: '关闭', exact: true }).click()
      await dialog.waitFor({ state: 'hidden' })
      assert.equal(await popup.count(), 0)
      await openERPAppearance(page)
      await dialog.waitFor()
      assert.equal(await popup.count(), 0, '重开不恢复过期说明')
      assert.equal(await dialog.locator('[aria-label="编辑页显示"]').getByRole('radio', { name: '页签', exact: true }).isChecked(), true)
      await dialog.locator('.ant-modal-footer').getByRole('button', { name: '关闭', exact: true }).click()
    },
  }))
  return [
    ...scenarios,
    {
      ...desktop,
      name: 'workbench-appearance-help-scope',
      path: '/__dev/product-engineering',
      viewport: { width: 1440, height: 1000 },
      verify: async (page) => {
        const before = await page.evaluate(() => localStorage.getItem('admin_erp_preferences'))
        await openERPAppearance(page)
        const dialog = page.getByRole('dialog', { name: '外观与密度', exact: true })
        const popup = page.locator('.erp-appearance-help-popover:visible')
        for (const [index, label] of labels.entries()) {
          const trigger = dialog.getByRole('button', { name: `查看${label}说明`, exact: true })
          await trigger.hover()
          await popup.getByText(notes[index], { exact: true }).waitFor()
          await waitForFiniteAnimations(page)
          assert.equal(await popup.evaluate((node) => getComputedStyle(node).getPropertyValue('--erp-text') === getComputedStyle(document.documentElement).getPropertyValue('--erp-text')), true, '工作台说明沿用当前外观变量')
          assertHelpGeometry(await readHelpGeometry(page, popup, trigger), false)
          await page.keyboard.press('Escape')
          await popup.waitFor({ state: 'hidden' })
          assert.equal(await dialog.isVisible(), true)
        }
        assert.equal(await page.evaluate(() => localStorage.getItem('admin_erp_preferences')), before)
        await dialog.locator('.ant-modal-footer').getByRole('button', { name: '关闭', exact: true }).click()
      },
    },
    {
      name: 'dev-ui-design-appearance-help',
      path: '/__dev/ui-design',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      themeMode: 'light',
      verify: async (page) => {
        const frame = page.frameLocator('iframe[title="ERP 最新可交互设计"]')
        await frame.locator('.app').waitFor()
        await openUIDesignAppearance(frame)
        const modal = frame.locator('.modal').filter({ has: frame.locator('.theme-density') })
        await modal.waitFor()
        assert.deepEqual(await modal.locator('.theme-density button').allTextContents(), ['标准', '紧凑'])
        const selectedBefore = await modal.locator('.theme-mode button.active').allTextContents()
        const popup = frame.locator('.appearance-setting-help-popup')
        for (const [index, label] of labels.entries()) {
          const trigger = modal.getByRole('button', { name: `查看${label}说明`, exact: true })
          await trigger.hover()
          await popup.getByText(notes[index], { exact: true }).waitFor()
          assert.equal(await popup.locator('figure').count(), 2)
          await popup.hover()
          assert.equal(await popup.isVisible(), true)
          await page.keyboard.press('Escape')
          await popup.waitFor({ state: 'hidden' })
          assert.equal(await modal.isVisible(), true)
        }
        assert.deepEqual(await modal.locator('.theme-mode button.active').allTextContents(), selectedBefore)
        await modal.getByRole('button', { name: '查看编辑页显示说明', exact: true }).click()
        await popup.getByText(notes[2], { exact: true }).waitFor()
        await page.screenshot({ path: `${outputDir}/dev-ui-design-appearance-help-4k.png` })
        await modal.locator('.modal-head').getByRole('button', { name: '关闭', exact: true }).click()
        await modal.waitFor({ state: 'hidden' })
        assert.equal(await popup.count(), 0)
      },
    },
  ]
}
