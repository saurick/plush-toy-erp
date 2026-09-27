import { writeFile } from 'node:fs/promises'
import { ERP_ACCENTS } from '../../src/common/theme/erpAppearance.mjs'
import { printTemplateCatalog } from '../../src/erp/config/printTemplates.mjs'
import { assertReadableOnBackground } from './colorAssertions.mjs'

const rgb = (hex) =>
  `rgb(${hex
    .match(/[\da-f]{2}/gi)
    .map((value) => Number.parseInt(value, 16))
    .join(', ')})`

const rowSelectors = {
  'material-purchase-contract': '.erp-material-contract-table tbody tr',
  'processing-contract': '.erp-processing-contract-table tbody tr',
  'engineering-material-detail': '.erp-material-detail-table tbody tr',
  'engineering-color-card': '.erp-color-card-paper__position-cell',
  'engineering-work-instruction':
    '.erp-work-instruction-paper__step-content-cell',
}

export function createPrintWorkspaceThemeScenario({
  assert,
  path,
  outputDir,
  gotoScenarioPath,
}) {
  return {
    name: 'print-workspace-theme-sync',
    path: '/erp/print-workspace/engineering-work-instruction?draft=fresh',
    auth: 'admin',
    viewport: { width: 1440, height: 960 },
    verify: async (page) => {
      const reports = []
      const preferences = await page.context().newPage()
      // A second same-origin window exercises the real storage event without reloading the draft.
      await preferences.route('**/print-theme-preference-source', (route) =>
        route.fulfill({
          contentType: 'text/html',
          body: '<title>Theme preferences test</title>',
        })
      )
      await preferences.goto(
        new URL('/print-theme-preference-source', page.url()).href
      )
      try {
        for (const template of printTemplateCatalog.filter(
          (item) => item.runtime?.workspace
        )) {
          await gotoScenarioPath(
            page,
            `/erp/print-workspace/${template.key}?draft=fresh&state=theme-sync`
          )
          await page.locator('.erp-print-shell--ready').waitFor()
          await page.evaluate(() => document.fonts.ready)
          const paper = page
            .locator('.erp-print-shell__stage-wrap > div')
            .first()
          const before = await paper.boundingBox()
          const editor = page
            .locator('.erp-print-shell__stage [contenteditable="true"]')
            .first()
          const content = await editor.textContent()
          for (const mode of ['light', 'dark']) {
            for (const [accent, palette] of Object.entries(ERP_ACCENTS)) {
              await preferences.evaluate(
                ({ mode, accent }) => {
                  localStorage.setItem('plush_erp_theme_mode', mode)
                  localStorage.setItem(
                    'plush_erp_appearance',
                    JSON.stringify({ accent, density: 'standard' })
                  )
                },
                { mode, accent }
              )
              const primary = rgb(
                mode === 'dark' ? palette.dark : palette.primary
              )
              const onPrimary = rgb(
                mode === 'dark' ? '#111713' : palette.onPrimary
              )
              await page.waitForFunction(
                ({ mode, accent, primary, onPrimary }) => {
                  const root = document.documentElement
                  const button = document.querySelector(
                    '.erp-print-shell__button--primary'
                  )
                  return (
                    button &&
                    root.dataset.erpTheme === mode &&
                    root.dataset.erpAccent === accent &&
                    getComputedStyle(button).backgroundColor === primary &&
                    getComputedStyle(button).color === onPrimary
                  )
                },
                { mode, accent, primary, onPrimary }
              )
              const metrics = await page.evaluate(() => {
                const style = (selector) => {
                  const node = document.querySelector(selector)
                  const computed = getComputedStyle(node)
                  return {
                    color: computed.color,
                    background: computed.backgroundColor,
                  }
                }
                return {
                  button: style('.erp-print-shell__button--primary'),
                  toolbar: style('.erp-print-shell__toolbar'),
                  panel: style('.erp-print-shell__record-panel'),
                  paper: style('.erp-print-shell__stage-wrap > div'),
                  icon: style(
                    '.erp-print-shell__record-panel .erp-print-tool-icon'
                  ),
                  overflow:
                    document.documentElement.scrollWidth -
                    document.documentElement.clientWidth,
                }
              })
              const label = `${template.key} ${mode} ${accent}`
              assert.equal(
                metrics.button.color,
                rgb(mode === 'dark' ? '#111713' : palette.onPrimary),
                `${label} 主按钮文字`
              )
              assert.equal(
                metrics.icon.color,
                rgb(mode === 'dark' ? palette.dark : palette.strong),
                `${label} 工具图标`
              )
              for (const surface of ['button', 'toolbar', 'panel']) {
                assertReadableOnBackground(
                  metrics[surface].color,
                  metrics[surface].background,
                  `${label} ${surface} 可读性`
                )
              }
              assert.equal(
                metrics.paper.background,
                'rgb(255, 255, 255)',
                `${label} 纸面保留白底`
              )
              assert.equal(
                metrics.paper.color,
                'rgb(17, 24, 39)',
                `${label} 正文不随主题染色`
              )
              assert(metrics.overflow <= 1, `${label} 无页面横向溢出`)
              assert.equal(
                await editor.textContent(),
                content,
                `${label} 不改变当前草稿`
              )
              reports.push({ template: template.key, mode, accent, ...metrics })
              if (
                template.key === 'engineering-work-instruction' &&
                mode === 'light' &&
                accent === 'pink'
              ) {
                await page.screenshot({
                  path: path.join(outputDir, 'print-theme-pink-light.png'),
                  fullPage: true,
                })
              }
            }
          }
          const after = await paper.boundingBox()
          assert(
            Math.abs(before.width - after.width) < 1 &&
              Math.abs(before.height - after.height) < 1,
            `${template.key} 切换主题不改变纸张尺寸`
          )

          await page
            .getByRole('button', { name: /^选择(明细|色卡)?行$/, exact: true })
            .click()
          await page.locator(rowSelectors[template.key]).first().click()
          const selected = page
            .locator(
              [
                '.erp-material-contract-table__row-selected td',
                '.erp-processing-contract-table__row--selected td',
                '.erp-engineering-print-row--selected > td:not(.erp-color-card-paper__swatch-cell)',
              ].join(',')
            )
            .first()
          await selected.waitFor()
          const selection = await selected.evaluate((node) => {
            const color = getComputedStyle(node).backgroundColor
            const canvas = document.createElement('canvas')
            const ctx = canvas.getContext('2d')
            ctx.fillStyle = color
            ctx.fillRect(0, 0, 1, 1)
            return [...ctx.getImageData(0, 0, 1, 1).data]
          })
          assert(
            selection[0] > selection[1] && selection[2] > selection[0],
            `${template.key} 选中行使用紫色主题浅底: ${selection}`
          )
          await page
            .getByRole('button', { name: '返回编辑', exact: true })
            .click()
          await editor.click()
          const focus = await editor.evaluate((node) => {
            const frame =
              node.closest('[data-print-focus-group]') ||
              node.closest('td, th') ||
              node
            const style = getComputedStyle(frame)
            const canvas = document.createElement('canvas')
            const ctx = canvas.getContext('2d')
            ctx.fillStyle = style.outlineColor
            ctx.fillRect(0, 0, 1, 1)
            return {
              style: style.outlineStyle,
              color: [...ctx.getImageData(0, 0, 1, 1).data],
            }
          })
          assert.equal(focus.style, 'dashed', `${template.key} 保留编辑虚线`)
          assert(
            focus.color[0] > focus.color[1] && focus.color[2] > focus.color[0],
            `${template.key} 编辑焦点跟随紫色主题: ${focus.color}`
          )

          await page.emulateMedia({ media: 'print' })
          const printed = await page.evaluate(() => {
            const paper = document.querySelector(
              '.erp-print-shell__stage-wrap > div'
            )
            return {
              background: getComputedStyle(paper).backgroundColor,
              color: getComputedStyle(paper).color,
              toolbar: getComputedStyle(
                document.querySelector('.erp-print-shell__toolbar')
              ).display,
              panel: getComputedStyle(
                document.querySelector('.erp-print-shell__panel')
              ).display,
              outlines: [...paper.querySelectorAll('*')].filter(
                (node) => getComputedStyle(node).outlineStyle !== 'none'
              ).length,
            }
          })
          assert.deepEqual(
            printed,
            {
              background: 'rgb(255, 255, 255)',
              color: 'rgb(17, 24, 39)',
              toolbar: 'none',
              panel: 'none',
              outlines: 0,
            },
            `${template.key} 打印保持白纸且不带编辑工具和焦点`
          )
          await page.emulateMedia({ media: 'screen' })
          await page.locator('.erp-print-shell__toolbar-copy > strong').click()
          if (template.key === 'engineering-work-instruction') {
            await page.screenshot({
              path: path.join(outputDir, 'print-theme-purple-dark.png'),
              fullPage: true,
            })
          }
        }
        assert.equal(reports.length, 60, '五种模板必须覆盖六种主色和明暗模式')
        await writeFile(
          path.join(outputDir, 'print-theme-sync.json'),
          JSON.stringify(reports, null, 2)
        )
      } finally {
        await preferences.close()
      }
    },
  }
}
