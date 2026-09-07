import { writeFile } from 'node:fs/promises'
import { printTemplateCatalog } from '../../src/erp/config/printTemplates.mjs'
import { measureEmptyEditorHints } from './printEmptyEditorAssertions.mjs'

export function createPrintWorkspaceControlScenarios({
  assert,
  path,
  outputDir,
  gotoScenarioPath,
}) {
  return [
    {
      name: 'print-workspace-all-empty-fields',
      path: '/erp/print-workspace/material-purchase-contract?draft=fresh',
      auth: 'admin',
      viewport: { width: 1600, height: 1100 },
      verify: async (page) => {
        const reports = []
        for (const template of printTemplateCatalog.filter(
          (item) => item.runtime?.workspace
        )) {
          await gotoScenarioPath(
            page,
            `/erp/print-workspace/${template.key}?draft=fresh&state=all-empty-fields`
          )
          await page.locator('.erp-print-shell--ready').waitFor()
          await page.evaluate(() => document.fonts.ready)
          const editors = page.locator(
            '.erp-print-shell__stage [contenteditable="true"]:not(:has([contenteditable="true"]))'
          )
          const count = await editors.count()
          assert(count > 0, `${template.key} 必须遍历实际编辑字段`)
          const stepNumbers = await editors.evaluateAll((nodes) =>
            nodes.map((node) =>
              node.closest('.erp-work-instruction-paper__step-no')
                ? node.textContent.replace(/\u200b/g, '').trim()
                : null
            )
          )
          const report = { key: template.key, fields: count, states: [] }
          for (const scale of ['1', '0.75', '1.25', '1.5']) {
            await page
              .locator('.erp-print-shell__zoom-control select')
              .selectOption(scale)
            for (let index = 0; index < count; index += 1) {
              const editor = editors.nth(index)
              assert.equal(
                await editors.count(),
                count,
                `${template.key} 清空不能删除字段或移动后续索引`
              )
              assert(
                await editor.isVisible(),
                `${template.key} 字段 ${index} 空值后仍须可见`
              )
              // 每个字段都实际清空，不能按 display / align 抽样漏掉收缩的日期等字段。
              await editor.fill('')
              await editor.press('Backspace')
              report.states.push({
                scale,
                index,
                state: 'focused',
                ...(await measureEmptyEditorHints(editor))[0],
              })
              await page
                .locator('.erp-print-shell__toolbar-copy > strong')
                .click()
              report.states.push({
                scale,
                index,
                state: 'blurred',
                ...(await measureEmptyEditorHints(editor))[0],
              })
              if (scale === '1') {
                await editor.click()
                await editor.fill('12')
                assert.equal(
                  await editor.textContent(),
                  '12',
                  `${template.key} 字段 ${index} 清空失焦后应能点击并重新填写`
                )
                await editor.fill('')
                await page
                  .locator('.erp-print-shell__toolbar-copy > strong')
                  .click()
              }
            }
            if (scale === '1') {
              await page.locator('.erp-print-shell__stage-wrap').screenshot({
                path: path.join(
                  outputDir,
                  `print-${template.key}-all-empty.png`
                ),
              })
            }
          }
          assert.equal(
            report.states.length,
            count * 4 * 2,
            `${template.key} 必须检查全部字段和状态，不能静默跳过`
          )
          assert(
            report.states.every(
              ({ empty, focused, state }) =>
                empty && focused === (state === 'focused')
            ),
            `${template.key} 清空后必须保持空值和预期焦点，不能回填或退出编辑`
          )
          await page.emulateMedia({ media: 'print' })
          const printHints = await editors.evaluateAll(
            (nodes) =>
              nodes.filter(
                (node) => getComputedStyle(node, '::before').content !== 'none'
              ).length
          )
          assert.equal(printHints, 0, `${template.key} 空值提示不能进入打印`)
          await page.emulateMedia({ media: 'screen' })
          await page.locator('[data-print-draft-save-status="saved"]').waitFor()
          const readValues = () =>
            editors.evaluateAll((nodes) =>
              nodes.map((node) =>
                node.textContent.replace(/\u200b/g, '').trim()
              )
            )
          const savedValues = await readValues()
          const restoreURL = new URL(page.url())
          restoreURL.searchParams.delete('draft')
          await page.goto(restoreURL.href, { waitUntil: 'networkidle' })
          await page.locator('.erp-print-shell--ready').waitFor()
          await page.evaluate(() => document.fonts.ready)
          assert.equal(
            await editors.count(),
            count,
            `${template.key} 恢复草稿不能丢失空字段`
          )
          assert.deepEqual(
            await readValues(),
            // 作业序号按行结构自动编号，恢复时沿用既有编号规则。
            savedValues.map((value, index) => stepNumbers[index] ?? value),
            `${template.key} 空值草稿恢复后不能错位或回填样例`
          )
          report.restored = await measureEmptyEditorHints(editors)
          assert(
            report.restored.every((state) => state.textFits),
            `${template.key} 恢复后的空值提示必须完整显示`
          )
          reports.push(report)
          console.log(
            `[print-all-empty] ${template.key}: ${count} fields, ${report.states.filter((state) => !state.textFits).length} clipped states`
          )
        }
        await writeFile(
          path.join(outputDir, 'print-all-empty-fields.json'),
          JSON.stringify(reports, null, 2)
        )
        const failures = reports.flatMap((report) =>
          report.states
            .filter((state) => !state.textFits)
            .map((state) => ({ template: report.key, ...state }))
        )
        assert.equal(
          failures.length,
          0,
          `空字段提示必须完整显示: ${JSON.stringify(failures.slice(0, 12))}`
        )
      },
    },
    {
      name: 'print-workspace-controls-and-empty-hints',
      path: '/erp/print-workspace/material-purchase-contract?draft=fresh',
      auth: 'admin',
      viewport: { width: 1440, height: 960 },
      verify: async (page) => {
        const records = []
        for (const template of printTemplateCatalog.filter(
          (item) => item.runtime?.workspace
        )) {
          await page.setViewportSize({ width: 1440, height: 960 })
          await gotoScenarioPath(
            page,
            `/erp/print-workspace/${template.key}?draft=fresh&state=control-contract`
          )
          await page.locator('.erp-print-shell--ready').waitFor()
          await page.evaluate(() => document.fonts.ready)
          const panel = page.getByRole('complementary', {
            name: '打印编辑工具',
          })
          await panel.waitFor({ state: 'visible' })
          const headings = await panel.getByRole('heading').allTextContents()
          assert.equal(
            new Set(headings).size,
            headings.length,
            '每个工具分组只显示一个标题'
          )
          assert(
            !headings.some((title) =>
              ['编辑工具', '当前草稿', '纸面编辑'].includes(title)
            ),
            '工具区不保留冗余总标题或说明分组'
          )
          assert.equal(
            await page.locator('.erp-print-shell__feedback').count(),
            0,
            '准备成功不生成额外反馈横条'
          )
          assert.equal(
            await page
              .getByRole('button', { name: '返回编辑', exact: true })
              .count(),
            0,
            '默认编辑态不显示重复的返回按钮'
          )

          assert.equal(
            await page.locator('.erp-print-shell__view-bar').count(),
            0,
            '纸面不再被独立模式栏占高'
          )
          assert.equal(
            await page.getByText('点击纸面填写', { exact: true }).count(),
            0
          )
          const tableDetails = panel
            .getByRole('region', { name: '表格操作', exact: true })
            .locator(':scope > details')
          assert(
            await tableDetails.evaluate((node) => node.open),
            '常用表格操作默认展开'
          )
          for (const title of ['末尾附图', '计算规则', '模板内容']) {
            const group = panel
              .getByRole('region', { name: title, exact: true })
              .locator(':scope > details')
            if (await group.count()) {
              assert.equal(
                await group.evaluate((node) => node.open),
                false,
                `${title} 默认收起`
              )
            }
          }
          const zoom = page.getByLabel('显示比例')
          assert(
            await zoom.evaluate((node) =>
              Boolean(node.closest('.erp-print-shell__toolbar-actions'))
            ),
            '显示比例与 PDF 操作同在顶栏'
          )
          await zoom.selectOption('1')
          const controls = await page.evaluate(() => {
            const styles = (node) => {
              const style = getComputedStyle(node)
              return Object.fromEntries(
                [
                  'appearance',
                  'fontFamily',
                  'fontSize',
                  'fontWeight',
                  'lineHeight',
                  'letterSpacing',
                  'height',
                  'width',
                  'padding',
                  'border',
                  'borderRadius',
                  'backgroundColor',
                  'backgroundImage',
                  'boxShadow',
                ].map((key) => [key, style[key]])
              )
            }
            const panel = document.querySelector(
              '.erp-print-shell__record-panel'
            )
            const hint = getComputedStyle(
              document.querySelector('.print-zoom-select'),
              '::after'
            )
            return {
              zoom: styles(document.querySelector('.print-zoom-select select')),
              button: styles(panel.querySelector('.erp-print-shell__button')),
              panel: {
                width: panel.getBoundingClientRect().width,
                padding: getComputedStyle(panel).padding,
              },
              arrow: {
                width: hint.width,
                height: hint.height,
                pointerEvents: hint.pointerEvents,
                borderRight: hint.borderRight,
                borderBottom: hint.borderBottom,
              },
            }
          })
          assert.equal(
            controls.zoom.appearance,
            'none',
            '缩放框不继承宿主原生外观'
          )
          assert.equal(controls.zoom.width, '120px')
          assert.equal(controls.zoom.height, '32px')
          assert.equal(
            controls.zoom.borderRadius,
            '6px',
            '逻辑圆角不能被全局控件样式覆盖'
          )
          assert.equal(controls.zoom.lineHeight, '20px')
          assert.equal(controls.arrow.pointerEvents, 'none', '箭头不截获点击')
          assert.equal(controls.panel.width, 248, '所有模板使用共享侧栏宽度')
          assert.equal(controls.panel.padding, '12px')
          assert.equal(controls.button.fontSize, '13px')
          assert.equal(controls.button.height, '32px')
          await zoom.focus()
          await zoom.press('Space')
          assert(
            await zoom.evaluate((node) => node.matches(':open')),
            '键盘可展开原生缩放列表'
          )
          // macOS headless 不分发原生弹出列表内的按键；选择回调单独验证。
          await zoom.evaluate((node) => node.blur())
          await zoom.selectOption('1.25')
          assert.equal(
            await zoom.inputValue(),
            '1.25',
            '缩放选择能更新当前比例'
          )

          const selector = '.erp-print-shell__stage [contenteditable="true"]'
          const candidates = await page.locator(selector).evaluateAll((nodes) =>
            nodes.map((node, index) => ({
              index,
              text: node.textContent,
              empty: node.dataset.printEmpty === 'true',
              align: getComputedStyle(node).textAlign,
              table: Boolean(node.closest('td, th')),
              width: node.clientWidth,
            }))
          )
          const chosen = new Set(
            [
              0,
              candidates.find((item) => item.table && item.align === 'center')
                ?.index,
              candidates.find(
                (item) => item.empty && ['left', 'start'].includes(item.align)
              )?.index,
              candidates
                .filter((item) => item.empty)
                .sort((a, b) => a.width - b.width)[0]?.index,
            ].filter((index) => index !== undefined)
          )
          const hints = []
          for (const scale of ['1', '1.25']) {
            await zoom.selectOption(scale)
            for (const index of chosen) {
              const field = page.locator(selector).nth(index)
              await field.fill('')
              await field.evaluate((node) => node.blur())
              await page.mouse.move(0, 0)
              const readHint = () =>
                field.evaluate((node) => {
                  const hint = getComputedStyle(node, '::before')
                  const measure = document.createElement('span')
                  measure.textContent = '点击填写'
                  Object.assign(measure.style, {
                    position: 'fixed',
                    visibility: 'hidden',
                    width: hint.width,
                    fontFamily: hint.fontFamily,
                    fontSize: hint.fontSize,
                    fontWeight: hint.fontWeight,
                    lineHeight: hint.lineHeight,
                    whiteSpace: hint.whiteSpace,
                    overflowWrap: hint.overflowWrap,
                  })
                  document.body.append(measure)
                  const requiredHeight = measure.getBoundingClientRect().height
                  measure.remove()
                  return {
                    content: hint.content,
                    fieldText: node.textContent.trim(),
                    fieldWidth: node.clientWidth,
                    fieldHeight: node.clientHeight,
                    fieldAlign: getComputedStyle(node).textAlign,
                    align: hint.textAlign,
                    left: Number.parseFloat(hint.left),
                    right: Number.parseFloat(hint.right),
                    width: Number.parseFloat(hint.width),
                    height: Number.parseFloat(hint.height),
                    requiredHeight,
                    active: document.activeElement === node,
                  }
                })
              const normal = await readHint()
              assert.equal(
                normal.content,
                '"点击填写"',
                `${template.key} 空值提示无需悬停`
              )
              assert.equal(normal.fieldText, '', '提示不是字段值')
              assert.equal(
                normal.align,
                normal.fieldAlign,
                '提示沿用字段对齐方式'
              )
              assert(
                normal.left >= 0 &&
                  normal.right >= 0 &&
                  normal.width + normal.left + normal.right <=
                    normal.fieldWidth + 1,
                '窄字段提示不能越过原编辑框'
              )
              assert(
                normal.height <= normal.fieldHeight + 1,
                '提示不能高过原编辑框'
              )
              assert(
                normal.requiredHeight <= normal.height + 1,
                '窄字段内的四字提示完整显示，不靠裁切隐藏溢出'
              )
              await field.hover()
              const hovered = await readHint()
              assert.equal(
                hovered.content,
                normal.content,
                '悬停不改变提示是否显示'
              )
              assert.equal(
                hovered.fieldHeight,
                normal.fieldHeight,
                '悬停不改变纸面高度'
              )
              await field.click()
              const focused = await readHint()
              assert(focused.active, '空字段整格可进入编辑')
              assert.equal(
                focused.content,
                normal.content,
                '空值焦点态仍保留输入提示'
              )
              await field.fill('输入测试')
              assert.equal(
                (await readHint()).content,
                'none',
                '输入真实值后提示消失'
              )
              await field.fill(candidates[index].text)
              await field.evaluate((node) => node.blur())
              hints.push({ index, scale, normal })
            }
          }

          const selectActions = await panel
            .getByRole('button', {
              name: /^选择(?:明细行|色卡块|色卡行|单元格|行)$/,
            })
            .all()
          for (const action of selectActions) {
            const label = (await action.textContent()).trim()
            await action.click()
            await page
              .getByRole('button', { name: '返回编辑', exact: true })
              .waitFor({ state: 'visible' })
            assert.equal(
              await page
                .locator('[data-print-edit-mode]')
                .getAttribute('data-print-edit-mode'),
              label,
              '所属工具内准确区分行、色卡块和单元格选择'
            )
            assert.equal(
              await page.locator('.erp-print-shell__feedback').count(),
              0,
              '选择状态不另占纸面高度'
            )
            assert.equal(
              await page
                .getByRole('button', { name: '返回编辑', exact: true })
                .count(),
              1,
              '活动组只有一个退出选择入口'
            )
            assert.equal(
              await page
                .getByRole('button', { name: /取消选择|取消选区/ })
                .count(),
              0,
              '不并列同义退出按钮'
            )
            const selection = page.locator('[data-print-edit-mode]')
            assert(
              await selection.evaluate((node) =>
                Boolean(node.closest('[data-print-tool]'))
              ),
              '选择状态和返回入口紧邻当前工具'
            )
            await tableDetails.locator(':scope > summary').click()
            await page.waitForFunction(
              () =>
                document.querySelector('[data-print-workspace-mode]').dataset
                  .printWorkspaceMode === 'edit'
            )
            assert.equal(await selection.count(), 0, '收起表格工具同时退出选择')
            await tableDetails.locator(':scope > summary').focus()
            await tableDetails.locator(':scope > summary').press('Space')
            assert(
              await tableDetails.evaluate((node) => node.open),
              '键盘可重新展开工具'
            )
            await action.click()
            await page.keyboard.press('Escape')
            assert.equal(
              await page
                .getByRole('button', { name: '返回编辑', exact: true })
                .count(),
              0,
              'Esc退出选择，不遗留重复编辑入口'
            )
            assert.equal(
              await page.locator('.erp-print-shell__feedback').count(),
              0,
              '退出后不残留旧选择提示'
            )
          }
          const formula = panel
            .getByRole('region', { name: '计算规则', exact: true })
            .locator('summary')
          if (await formula.count()) {
            await formula.click()
            assert(
              await page.locator('.erp-print-shell__formula-panel').isVisible(),
              '分组标题直接展开计算规则'
            )
            await formula.click()
            assert.equal(
              await page.locator('.erp-print-shell__formula-panel').isVisible(),
              false,
              '同一标题可收起规则'
            )
          }
          await page.emulateMedia({ media: 'print' })
          assert(
            await page
              .locator(selector)
              .evaluateAll((nodes) =>
                nodes.every((node) =>
                  ['none', 'normal'].includes(
                    getComputedStyle(node, '::before').content
                  )
                )
              ),
            '打印不保留空值提示'
          )
          assert.equal(
            await page
              .getByRole('complementary', {
                name: '打印编辑工具',
                includeHidden: true,
              })
              .evaluate((node) => getComputedStyle(node).display),
            'none',
            '打印不输出工具栏'
          )
          await page.emulateMedia({ media: 'screen' })
          await zoom.selectOption('fit')
          await panel.scrollIntoViewIfNeeded()
          await page.screenshot({
            path: path.join(outputDir, `print-controls-${template.key}.png`),
          })

          await page.setViewportSize({ width: 760, height: 960 })
          await zoom.scrollIntoViewIfNeeded()
          assert(
            await page.evaluate(
              () => document.documentElement.scrollWidth <= innerWidth + 1
            ),
            '窄窗口没有整页水平溢出'
          )
          const narrowZoom = await zoom.boundingBox()
          assert(
            Math.abs(narrowZoom.width - 120) < 1,
            '窄窗口的缩放控件保持完整宽度'
          )
          await zoom.selectOption('1.5')
          assert.equal(await zoom.inputValue(), '1.5', '窄窗口仍可调整缩放')
          records.push({ template: template.key, controls, hints })
        }
        await writeFile(
          path.join(outputDir, 'print-workspace-controls.json'),
          JSON.stringify(records, null, 2)
        )
      },
    },
  ]
}
