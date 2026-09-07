import { expandPrintToolSection } from './printToolHelpers.mjs'
import { Buffer } from 'node:buffer'
import { writeFile } from 'node:fs/promises'

const templates = [
  ['material-purchase-contract', '.erp-material-contract-table tbody tr'],
  ['processing-contract', '.erp-processing-contract-table tbody tr'],
  ['engineering-material-detail', '.erp-material-detail-table tbody tr'],
  [
    'engineering-color-card',
    '.erp-color-card-paper__line-row[data-color-line="true"]',
  ],
  [
    'engineering-work-instruction',
    '.erp-work-instruction-paper__step-row--text, .erp-work-instruction-paper__step-row--image',
  ],
]

export function createPrintWorkspaceFeedbackScenarios({
  assert,
  path,
  outputDir,
  gotoScenarioPath,
}) {
  const assertLocalFeedback = async (page, area, title, text) => {
    const feedback = page.locator(`[data-print-feedback="${area}"]`)
    await feedback.filter({ hasText: text }).waitFor()
    assert.equal(await page.locator('[data-print-feedback]').count(), 1)
    assert.equal(await page.locator('.ant-message-notice-content').count(), 0)
    assert.equal(await page.locator('.erp-print-shell__feedback').count(), 0)
    const metrics = await feedback.evaluate((node) => {
      const group = node.closest('.erp-print-shell__tool-section')
      const panel = node.closest('.erp-print-shell__record-panel')
      const box = node.getBoundingClientRect()
      const previous = node.previousElementSibling.getBoundingClientRect()
      const bounds = panel.getBoundingClientRect()
      return {
        title: group.getAttribute('aria-label'),
        gap: box.top - previous.bottom,
        fitsWidth: node.scrollWidth <= node.clientWidth + 1,
        visibleInPanel: box.top >= bounds.top && box.bottom <= bounds.bottom,
        text: node.textContent,
      }
    })
    assert.equal(metrics.title, title)
    assert(metrics.gap >= 0 && metrics.gap <= 12, '反馈紧随所属工具内容')
    assert(metrics.fitsWidth, '长反馈在工具区内换行')
    assert(metrics.visibleInPanel, '新反馈在工具滚动区内可见')
    return metrics
  }
  return [
    {
      name: 'print-workspace-floating-output-feedback',
      path: '/erp/print-workspace/engineering-color-card?draft=fresh',
      auth: 'admin',
      viewport: { width: 1440, height: 960 },
      expectedConsoleErrorPatterns: [
        /^console error \[path=\/erp\/print-workspace\/[^\]]+\]: Failed to load resource: the server responded with a status of 503 .*\/templates\/render-pdf:/u,
      ],
      verify: async (page) => {
        let failOutput = false
        let outputHTML = ''
        let activeTemplate = ''
        await page.route('**/templates/render-pdf', async (route) => {
          outputHTML = route.request().postDataJSON().html
          if (activeTemplate === 'processing-contract') {
            await new Promise((resolve) => setTimeout(resolve, 500))
          }
          await route.fulfill(
            failOutput
              ? {
                  status: 503,
                  contentType: 'application/json',
                  body: JSON.stringify({
                    message: '暂时无法生成 PDF，请稍后重试。',
                  }),
                }
              : { contentType: 'application/pdf', body: '%PDF-1.4\n%%EOF\n' }
          )
        })
        const measure = () =>
          page.evaluate(() => {
            const stage = document
              .querySelector('.erp-print-shell__stage')
              .getBoundingClientRect()
            const toolbar = document
              .querySelector('.erp-print-shell__toolbar')
              .getBoundingClientRect()
            return {
              stageTop: stage.top,
              stageHeight: stage.height,
              toolbarHeight: toolbar.height,
            }
          })
        const assertFeedback = async (before) => {
          const feedback = page.locator('[data-print-feedback="output"]')
          await feedback.waitFor()
          const geometry = await feedback.evaluate((node) => {
            const box = node.getBoundingClientRect()
            return {
              position: getComputedStyle(node).position,
              outsidePaper: !node.closest('.erp-print-shell__workspace'),
              fits:
                box.left >= 0 &&
                box.right <= innerWidth &&
                node.scrollWidth <= node.clientWidth + 1,
            }
          })
          assert.equal(geometry.position, 'fixed')
          assert(
            geometry.outsidePaper && geometry.fits,
            '提示在纸面外，长文案不横向溢出'
          )
          assert.deepEqual(
            await measure(),
            before,
            '提示不能改变工具栏高度或纸面位置'
          )
          await page.emulateMedia({ media: 'print' })
          assert.equal(await feedback.isVisible(), false, '悬浮提示不进入打印')
          await page.emulateMedia({ media: 'screen' })
          return feedback
        }
        for (const [index, [key]] of templates.entries()) {
          activeTemplate = key
          failOutput = false
          await gotoScenarioPath(
            page,
            `/erp/print-workspace/${key}?draft=fresh&state=floating-output`
          )
          await page.locator('.erp-print-shell--ready').waitFor()
          await page.evaluate(() => document.fonts.ready)
          const before = await measure()
          const download = page.waitForEvent('download')
          await page
            .getByRole('button', { name: '下载 PDF', exact: true })
            .click()
          if (key === 'processing-contract') await assertFeedback(before)
          await download
          const feedback = page.locator('[data-print-feedback="output"]')
          if (key !== 'processing-contract') await assertFeedback(before)
          assert(
            !outputHTML.includes('data-print-feedback='),
            '发送给 PDF 服务的快照不含提示'
          )
          if (index === 0) {
            await feedback.waitFor({ state: 'hidden', timeout: 6000 })
            assert.deepEqual(
              await measure(),
              before,
              '成功提示消失后也不推移纸面'
            )
          } else if (key !== 'processing-contract') {
            await page
              .getByRole('button', { name: '关闭提示', exact: true })
              .click()
          } else {
            await feedback.waitFor({ state: 'hidden' })
            assert.deepEqual(
              await measure(),
              before,
              '加工合同进度结束后不保留占位'
            )
          }

          failOutput = true
          await page
            .locator('.erp-print-shell__stage [contenteditable="true"]')
            .first()
            .fill('输出反馈验证')
          if (index === 0) {
            await page.setViewportSize({ width: 760, height: 800 })
            await page.waitForTimeout(150)
          }
          const beforeError = await measure()
          await page
            .getByRole('button', { name: '下载 PDF', exact: true })
            .click()
          await page
            .locator('[data-print-feedback="output"][role="alert"]')
            .waitFor()
          await assertFeedback(beforeError)
          if (index === 0) {
            await page.waitForTimeout(4200)
            assert(await feedback.isVisible(), '错误提示不能自动消失')
          }
          await page.screenshot({
            path: path.join(outputDir, `print-output-feedback-${key}.png`),
          })
          await page
            .getByRole('button', { name: '关闭提示', exact: true })
            .focus()
          await page.keyboard.press('Enter')
          assert.equal(await feedback.count(), 0)
          assert(
            await page
              .getByRole('button', { name: '下载 PDF', exact: true })
              .evaluate((node) => node === document.activeElement),
            '关闭提示后回到原输出按钮'
          )
          await page.reload({ waitUntil: 'networkidle' })
          assert.equal(await feedback.count(), 0, '刷新不恢复已过时的提示')
          await page.setViewportSize({ width: 1440, height: 960 })
        }
      },
    },
    {
      name: 'print-workspace-local-feedback',
      path: '/erp/print-workspace/material-purchase-contract?draft=fresh',
      auth: 'admin',
      viewport: { width: 1440, height: 960 },
      verify: async (page) => {
        const records = []
        for (const [key, rowSelector] of templates) {
          await page.setViewportSize({ width: 1440, height: 960 })
          await gotoScenarioPath(
            page,
            `/erp/print-workspace/${key}?state=local-feedback`
          )
          await page.locator('.erp-print-shell--ready').waitFor()
          await page.evaluate(() => document.fonts.ready)
          await expandPrintToolSection(page, '模板内容')
          const draftTools = page.getByRole('region', {
            name: '模板内容',
            exact: true,
          })
          const stageTop = () =>
            page
              .locator('.erp-print-shell__stage')
              .evaluate((node) => node.getBoundingClientRect().top)
          const beforeTop = await stageTop()
          const signatures = draftTools.getByRole('button', {
            name: '手签留白',
            exact: true,
          })
          if (await signatures.count()) {
            await signatures.click()
            await assertLocalFeedback(
              page,
              'draft',
              '模板内容',
              '已清空签字人，保留日期和手签位置。'
            )
            assert.equal(await stageTop(), beforeTop, '手签反馈不推移纸面')
          }
          await draftTools
            .getByRole('button', { name: '恢复样例', exact: true })
            .click()
          const reset = await assertLocalFeedback(
            page,
            'draft',
            '模板内容',
            '已恢复样例。'
          )
          assert.equal(await stageTop(), beforeTop, '恢复反馈不推移纸面')
          const rowTools = page.getByRole('region', {
            name: '明细行',
            exact: true,
          })
          await rowTools.getByRole('button', { name: /^选择/ }).click()
          assert.equal(
            await page.locator('[data-print-feedback]').count(),
            0,
            '切换操作清除旧反馈'
          )
          await page.locator(rowSelector).first().locator('td').first().click()
          await rowTools
            .getByRole('button', { name: '下插一行', exact: true })
            .click()
          const row = await assertLocalFeedback(page, 'rows', '明细行', /./)
          await page.locator(rowSelector).first().locator('td').first().click()
          assert.equal(
            await page.locator('[data-print-feedback]').count(),
            0,
            '切换选中行清除旧结果'
          )
          await page
            .getByRole('button', { name: '返回编辑', exact: true })
            .click()
          const cells = page.getByRole('region', {
            name: '单元格',
            exact: true,
          })
          if (await cells.count()) {
            await cells
              .getByRole('button', { name: '选择单元格', exact: true })
              .click()
            const rowCells = page.locator(rowSelector).first().locator('td')
            await rowCells.nth(0).click()
            await rowCells.nth(1).click()
            await cells
              .getByRole('button', { name: '合并选区', exact: true })
              .click()
            await assertLocalFeedback(page, 'cells', '单元格', /./)
            await cells
              .getByRole('button', { name: '拆分当前', exact: true })
              .click()
            await assertLocalFeedback(page, 'cells', '单元格', /./)
            await page
              .getByRole('button', { name: '返回编辑', exact: true })
              .click()
          }
          if (key === 'engineering-color-card') {
            const blocks = page.getByRole('region', {
              name: '色卡块',
              exact: true,
            })
            await blocks
              .getByRole('button', { name: '选择色卡块', exact: true })
              .click()
            await page
              .locator(
                '.erp-color-card-paper__block-head-row[data-color-card-block="true"]'
              )
              .first()
              .locator('td')
              .first()
              .click()
            await blocks
              .getByRole('button', { name: '下插色卡块', exact: true })
              .click()
            await assertLocalFeedback(page, 'blocks', '色卡块', /./)
            await page
              .getByRole('button', { name: '返回编辑', exact: true })
              .click()
          }
          await draftTools
            .getByRole('button', { name: '恢复样例', exact: true })
            .click()
          const field = page
            .locator('.erp-print-shell__stage [contenteditable="true"]')
            .first()
          await field.fill('就近反馈回归')
          assert.equal(
            await page.locator('[data-print-feedback]').count(),
            0,
            '继续输入清除旧反馈'
          )
          await field.evaluate((node) => node.blur())
          await page.locator('[data-print-draft-save-status="saved"]').waitFor()
          assert.equal(
            await page
              .locator(
                '.erp-print-shell__toolbar [data-print-draft-save-status]'
              )
              .count(),
            1,
            '自动保存仍在顶部'
          )
          await page.reload({ waitUntil: 'networkidle' })
          await page.locator('.erp-print-shell--ready').waitFor()
          assert.equal(
            await field.textContent(),
            '就近反馈回归',
            '反馈不影响草稿恢复'
          )
          assert.equal(
            await page.locator('[data-print-feedback]').count(),
            0,
            '刷新不恢复过时的操作提示'
          )

          await page.setViewportSize({ width: 1280, height: 560 })
          const input = page.locator('[data-print-appendix-input]')
          await input.setInputFiles({
            name: 'broken.png',
            mimeType: 'image/png',
            buffer: Buffer.from('invalid image'),
          })
          await page
            .locator('[data-print-feedback="appendix"][role="alert"]')
            .waitFor()
          const error = await assertLocalFeedback(
            page,
            'appendix',
            '末尾附图',
            /./
          )
          const imageData = await page.evaluate(() => {
            const canvas = document.createElement('canvas')
            canvas.width = 120
            canvas.height = 80
            const context = canvas.getContext('2d')
            context.fillStyle = '#e0f2fe'
            context.fillRect(0, 0, 120, 80)
            return canvas.toDataURL('image/png').split(',')[1]
          })
          await input.setInputFiles({
            name: 'feedback.png',
            mimeType: 'image/png',
            buffer: Buffer.from(imageData, 'base64'),
          })
          const recovered = await assertLocalFeedback(
            page,
            'appendix',
            '末尾附图',
            /已添加 1 张/
          )
          assert.equal(
            await page.locator('[data-print-feedback][role="alert"]').count(),
            0,
            '新成功结果替换旧失败'
          )
          await page
            .locator('[data-print-appendix-manager-item]')
            .first()
            .getByRole('button', { name: /移除/ })
            .click()
          await assertLocalFeedback(page, 'appendix', '末尾附图', /已移除/)
          await expandPrintToolSection(page, '模板内容')
          await draftTools
            .getByRole('button', { name: '恢复样例', exact: true })
            .click()
          await assertLocalFeedback(page, 'draft', '模板内容', '已恢复样例。')
          await page.screenshot({
            path: path.join(outputDir, `print-feedback-${key}.png`),
          })
          await page.emulateMedia({ media: 'print' })
          assert.equal(
            await page.locator('[data-print-feedback]').isVisible(),
            false,
            '打印不显示工具反馈'
          )
          await page.emulateMedia({ media: 'screen' })
          records.push({ key, reset, row, error, recovered })
        }
        await page.setViewportSize({ width: 760, height: 800 })
        await page
          .getByRole('button', { name: '空白模板', exact: true })
          .click()
        await assertLocalFeedback(page, 'draft', '模板内容', /已生成空白模板/)
        await writeFile(
          path.join(outputDir, 'print-feedback-metrics.json'),
          JSON.stringify(records, null, 2)
        )
      },
    },
    {
      name: 'print-workspace-feedback-output-boundary',
      path: '/erp/print-workspace/material-purchase-contract?draft=fresh',
      auth: 'admin',
      viewport: { width: 1440, height: 960 },
      verify: async (page) => {
        let outputHTML = ''
        await page.route('**/templates/render-pdf', async (route) => {
          outputHTML = route.request().postDataJSON().html
          await route.fulfill({
            contentType: 'application/pdf',
            body: '%PDF-1.4\n%%EOF\n',
          })
        })
        for (const [key, prefix] of [
          ['material-purchase-contract', 'material'],
          ['processing-contract', 'processing'],
        ]) {
          await gotoScenarioPath(
            page,
            `/erp/print-workspace/${key}?draft=fresh&state=feedback-output`
          )
          await page.locator('.erp-print-shell--ready').waitFor()
          await expandPrintToolSection(page, '模板内容')
          await page
            .getByRole('button', { name: '手签留白', exact: true })
            .click()
          const field = page
            .locator(
              `.erp-${prefix}-contract-meta__value[contenteditable="true"]`
            )
            .first()
          await field.fill('')
          await page
            .getByRole('button', { name: '下载 PDF', exact: true })
            .click()
          await page
            .locator('[data-print-feedback="output"][role="alert"]')
            .filter({ hasText: /请先补充/ })
            .waitFor()
          assert.equal(
            await page.locator('.erp-print-shell__tool-feedback').count(),
            0
          )
          assert.equal(
            await page.locator('.ant-message-notice-content').count(),
            0
          )
          await page
            .getByRole('button', { name: '恢复样例', exact: true })
            .click()
          await assertLocalFeedback(page, 'draft', '模板内容', '已恢复样例。')
          const download = page.waitForEvent('download')
          await page
            .getByRole('button', { name: '下载 PDF', exact: true })
            .click()
          await download
          assert(
            outputHTML.includes('data:font/woff2;base64,'),
            '验证实际发送给 PDF 服务的快照'
          )
          const output = await page.evaluate((html) => {
            const document = new DOMParser().parseFromString(html, 'text/html')
            return {
              feedback: document.querySelectorAll('[data-print-feedback]')
                .length,
              text: document.body.textContent,
            }
          }, outputHTML)
          assert.equal(output.feedback, 0, '操作反馈节点不进入 PDF 内容')
          assert(
            !output.text.includes('已恢复样例。'),
            '操作反馈文案不进入 PDF 内容'
          )
        }
      },
    },
  ]
}
