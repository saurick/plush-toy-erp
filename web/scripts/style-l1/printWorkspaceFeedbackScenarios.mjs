import { chooseSelectOption } from './selectControlActions.mjs'
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
  assertPrintPreviewPopup,
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
  const assertBlankCount = (notice, count) =>
    notice.getByText(new RegExp(`^当前有 ${count} 处留白，`, 'u')).waitFor()
  const assertBlankFocused = async (editor, message) => {
    assert(
      await editor.evaluate(
        (node) =>
          new Promise((resolve) =>
            requestAnimationFrame(() =>
              resolve(document.activeElement === node)
            )
          )
      ),
      message
    )
  }
  const assertBlankNavigation = async (notice, labels) => {
    const buttons = notice
      .getByRole('group', { name: '留白定位', exact: true })
      .getByRole('button')
    assert.deepEqual(
      (await buttons.allTextContents()).map((text) => text.trim()),
      labels
    )
  }
  const assertBlankNoticeScrollGap = async (page, label) => {
    const metrics = await page.evaluate(async () => {
      const notice = document.querySelector('[data-print-blank-notice]')
      const header = document.querySelector('.erp-print-shell__header')
      const toolbar = document.querySelector('.erp-print-shell__toolbar')
      const stage = document.querySelector('.erp-print-shell__stage')
      const samples = []
      const measure = () => {
        const bounds = notice.getBoundingClientRect()
        const stageBounds = stage.getBoundingClientRect()
        const beneathNotice = document.elementFromPoint(
          Math.min(innerWidth - 1, stageBounds.left + stageBounds.width / 2),
          bounds.bottom + 8
        )
        return {
          gap: bounds.top - toolbar.getBoundingClientRect().bottom,
          bottomGap: header.getBoundingClientRect().bottom - bounds.bottom,
          bottomGapProtected: header.contains(beneathNotice),
          visible: bounds.top >= 0 && bounds.bottom <= innerHeight,
          viewport: { width: innerWidth, height: innerHeight, screen: matchMedia('screen').matches },
          shell: { display: getComputedStyle(document.querySelector('.erp-print-shell')).display, height: getComputedStyle(document.querySelector('.erp-print-shell')).height },
          stage: { box: stageBounds.toJSON(), maxHeight: getComputedStyle(stage).maxHeight, height: getComputedStyle(stage).height },
        }
      }
      for (const target of [0, document.scrollingElement.scrollHeight, 0]) {
        window.scrollTo(0, target)
        await new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        )
        samples.push({
          scrollY,
          ...measure(),
        })
      }
      stage.scrollTop = stage.scrollHeight
      await new Promise((resolve) => requestAnimationFrame(resolve))
      samples.push({
        stageScrollTop: stage.scrollTop,
        ...measure(),
      })
      stage.scrollTop = 0
      return samples
    })
    await writeFile(
      path.join(outputDir, `print-blank-scroll-gap-${label}.json`),
      JSON.stringify(metrics, null, 2)
    )
    if (label.endsWith('-desktop')) {
      assert.deepEqual(metrics.slice(0, 3).map((sample) => sample.scrollY), [0, 0, 0], `桌面工作台不产生整页滚动: ${JSON.stringify(metrics)}`)
      assert(metrics[3].stageScrollTop > 0, '使用实际纸面滚动验证桌面提示条间距')
    } else {
      assert(metrics[1].scrollY > 0, '窄屏使用实际页面滚动验证提示条间距')
    }
    assert(metrics[0].gap >= 8, '提示条与工具栏保留清楚间距')
    assert(
      metrics.every(
        (sample) =>
          Math.abs(sample.gap - metrics[0].gap) <= 1 && sample.visible !== false
      ),
      `页面及纸面滚动后提示条与工具栏保持间距：${JSON.stringify(metrics)}`
    )
    assert(
      metrics.every(
        (sample) => sample.bottomGap >= 10 && sample.bottomGapProtected
      ),
      `页面及纸面滚动后提示下方仍有独立间距，纸面不贴近提示：${JSON.stringify(metrics)}`
    )
    if (label.endsWith('-desktop')) {
      await page.evaluate(
        () =>
          new Promise((resolve) => {
            const stage = document.querySelector('.erp-print-shell__stage')
            stage.scrollTop = stage.scrollHeight
            requestAnimationFrame(() => requestAnimationFrame(resolve))
          })
      )
      await page.screenshot({
        path: path.join(outputDir, `print-blank-bottom-gap-${label}.png`),
        fullPage: false,
      })
      await page.evaluate(
        () =>
          new Promise((resolve) => {
            document.querySelector('.erp-print-shell__stage').scrollTop = 0
            requestAnimationFrame(resolve)
          })
      )
    }
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
          const stageLayout = () => page.evaluate(() => {
            const selectors = ['.erp-print-shell', '.erp-print-shell__header', '.erp-print-shell__toolbar', '.erp-print-shell__blank-notice', '.erp-print-shell__stage', '.erp-print-shell__record-panel']
            return {
              scroll: { x: scrollX, y: scrollY }, fonts: document.fonts.status,
              nodes: selectors.map((selector) => {
                const node = document.querySelector(selector)
                if (!node) return { selector, absent: true }
                const style = getComputedStyle(node)
                return { selector, box: node.getBoundingClientRect().toJSON(), scrollTop: node.scrollTop, marginTop: style.marginTop, paddingTop: style.paddingTop, gap: style.gap, font: style.font, zoom: style.zoom }
              }),
            }
          })
          const beforeLayout = await stageLayout()
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
          assert.equal(await stageTop(), beforeTop, `恢复反馈不推移纸面: ${JSON.stringify({ before: beforeLayout, after: await stageLayout() })}`)
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
      name: 'print-workspace-blank-content-notice',
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
        for (const [key, prefix, title] of [
          ['material-purchase-contract', 'material', '采购合同'],
          ['processing-contract', 'processing', '加工合同'],
        ]) {
          await page.setViewportSize({ width: 1440, height: 960 })
          await gotoScenarioPath(
            page,
            `/erp/print-workspace/${key}?state=blank-notice`
          )
          await page.locator('.erp-print-shell--ready').waitFor()
          const notice = page.locator('[data-print-blank-notice]')
          assert.equal(await notice.count(), 0, '完整明细不提示')
          await expandPrintToolSection(page, '模板内容')
          await page
            .getByRole('button', { name: '手签留白', exact: true })
            .click()
          assert.equal(await notice.count(), 0, '手签留白不提示')
          const row = page
            .locator(`.erp-${prefix}-contract-table tbody tr`)
            .first()
          const price = row.locator(
            '[data-print-blank-field="unitPrice"] [contenteditable="true"]'
          )
          const originalPrice = await price.innerText()
          await price.fill('')
          await notice.waitFor()
          await assertBlankCount(notice, 1)
          await assertBlankNavigation(notice, ['查看留白'])
          assert.equal(await notice.getAttribute('role'), 'status')
          await notice
            .getByRole('button', { name: '查看留白', exact: true })
            .click()
          await assertBlankFocused(price, '定位到当前首个留白')
          await assertBlankCount(notice, 2)
          await assertBlankNavigation(notice, [
            '第一处',
            '上一处',
            '下一处',
            '最后一处',
          ])
          const amount = row.locator(
            '[data-print-blank-field="amount"] [contenteditable="true"]'
          )
          await notice
            .getByRole('button', { name: '下一处', exact: true })
            .click()
          await assertBlankFocused(
            amount,
            '单价清空后，金额留白也按纸面顺序定位'
          )
          await notice
            .getByRole('button', { name: '下一处', exact: true })
            .click()
          await assertBlankFocused(price, '到达末尾后循环回首个单价留白')
          await price.fill('0')
          await assertBlankCount(notice, 1)
          await assertBlankNavigation(notice, ['查看留白'])
          assert(
            await price.evaluate((node) => document.activeElement === node),
            '补齐当前格后计数更新且保留编辑焦点'
          )
          await price.press('Tab')
          await notice.waitFor({ state: 'hidden' })
          await price.fill(originalPrice)
          const reserved = page
            .locator(`.erp-${prefix}-contract-table tbody tr`)
            .nth(1)
          for (const editor of await reserved
            .locator('[contenteditable="true"]')
            .all())
            await editor.fill('')
          await reserved.locator('[contenteditable="true"]').last().press('Tab')
          await notice.waitFor()
          await assertBlankCount(notice, 12)
          const blankRowEditors = reserved.locator(
            '[data-print-blank-field] [contenteditable="true"]'
          )
          const blankRowEditor = reserved
            .locator('td')
            .first()
            .locator('[contenteditable="true"]')
          await notice
            .getByRole('button', { name: '查看留白', exact: true })
            .click()
          await assertBlankFocused(blankRowEditor, '整行留白从最左侧第一格开始')
          await blankRowEditor.fill('补充明细')
          await assertBlankCount(notice, 11)
          await assertBlankFocused(blankRowEditor, '数量更新不打断当前输入')
          for (const index of [
            ...Array.from({ length: 11 }, (_, offset) => offset + 1),
            1,
          ]) {
            await notice
              .getByRole('button', { name: '下一处', exact: true })
              .click()
            await assertBlankFocused(
              blankRowEditors.nth(index),
              '填好当前格后不跳过下一格，剩余留白依次循环'
            )
          }
          await blankRowEditor.fill('')
          await assertBlankCount(notice, 12)
          await price.press('Tab')
          await notice.waitFor()
          await page.getByText('本窗口内容已保存', { exact: true }).waitFor()
          await page.reload()
          await page.locator('.erp-print-shell--ready').waitFor()
          await notice.waitFor()
          await assertBlankCount(notice, 12)
          assert(
            await notice
              .getByRole('button', { name: '查看留白', exact: true })
              .isVisible(),
            '刷新后按当前纸面重新统计，从首处开始定位'
          )
          for (const name of ['在线预览 PDF', '下载 PDF', '打印']) {
            assert(
              await page.getByRole('button', { name, exact: true }).isEnabled(),
              `${name}不因留白禁用`
            )
          }
          await notice
            .getByRole('button', { name: '查看留白', exact: true })
            .click()
          await assertBlankNavigation(notice, [
            '第一处',
            '上一处',
            '下一处',
            '最后一处',
          ])
          await assertBlankNoticeScrollGap(page, `${prefix}-desktop`)
          await page.setViewportSize({ width: 760, height: 800 })
          // 聚焦纸面后浏览器会随视口调整滚动；页首布局检查固定在页首执行。
          await page.evaluate(
            () =>
              new Promise((resolve) => {
                window.scrollTo(0, 0)
                requestAnimationFrame(resolve)
              })
          )
          const geometry = await notice.evaluate((node) => {
            const box = node.getBoundingClientRect()
            const toolbar = document
              .querySelector('.erp-print-shell__toolbar')
              .getBoundingClientRect()
            return {
              belowToolbar: box.top >= toolbar.bottom,
              outsidePaper: !node.closest('.erp-print-shell__workspace'),
              fits:
                box.left >= 0 &&
                box.right <= innerWidth &&
                node.scrollWidth <= node.clientWidth + 1,
              position: getComputedStyle(node).position,
            }
          })
          assert(
            geometry.belowToolbar && geometry.outsidePaper && geometry.fits,
            `提示条应位于工具栏下方并保持完整可见：${JSON.stringify(geometry)}`
          )
          assert.equal(geometry.position, 'static')
          await assertBlankNoticeScrollGap(page, `${prefix}-narrow`)
          await page.screenshot({
            path: path.join(
              outputDir,
              `print-blank-notice-${prefix}-narrow.png`
            ),
            fullPage: true,
          })
          await page.setViewportSize({ width: 360, height: 800 })
          await page.evaluate(
            () =>
              new Promise((resolve) => {
                window.scrollTo(0, 0)
                requestAnimationFrame(resolve)
              })
          )
          const compactNavigationFits = await notice.evaluate((node) => {
            const group = node.querySelector('.erp-print-shell__blank-actions')
            const box = node.getBoundingClientRect()
            return (
              box.left >= 0 &&
              box.right <= innerWidth &&
              node.scrollWidth <= node.clientWidth + 1 &&
              Array.from(group.children).every((button) => {
                const bounds = button.getBoundingClientRect()
                return bounds.left >= box.left && bounds.right <= box.right
              })
            )
          })
          assert(compactNavigationFits, '四个导航按钮在窄屏换行且不溢出')
          await assertBlankNoticeScrollGap(page, `${prefix}-compact`)
          await page.screenshot({
            path: path.join(
              outputDir,
              `print-blank-navigation-${prefix}-compact.png`
            ),
            fullPage: true,
          })
          await page.setViewportSize({ width: 1440, height: 960 })
          await assertPrintPreviewPopup(page, {
            buttonName: '在线预览 PDF',
            title: `${title} PDF 预览`,
            screenshotName: `print-blank-notice-${prefix}-preview`,
          })
          const download = page.waitForEvent('download')
          await page
            .getByRole('button', { name: '下载 PDF', exact: true })
            .click()
          await download
          assert(
            !outputHTML.includes('data-print-blank-notice'),
            '轻提示节点不进入 PDF'
          )
          assert(
            !outputHTML.includes('空白处可打印后手写补充'),
            '轻提示文案不进入 PDF'
          )
          assert(!/当前有 \d+ 处留白/u.test(outputHTML), '留白数量不进入 PDF')
          const outputNavigationCount = await page.evaluate(
            (html) =>
              new DOMParser()
                .parseFromString(html, 'text/html')
                .querySelectorAll('.erp-print-shell__blank-actions').length,
            outputHTML
          )
          assert.equal(outputNavigationCount, 0, '导航按钮不进入 PDF 正文')
          await page.evaluate(() => {
            window.__blankNoticePrintCalls = 0
            window.print = () => {
              window.__blankNoticePrintCalls += 1
            }
          })
          await page.getByRole('button', { name: '打印', exact: true }).click()
          await page.waitForFunction(() => window.__blankNoticePrintCalls === 1)
          assert.equal(
            await page.getByRole('dialog').count(),
            0,
            '不增加确认弹窗'
          )
          await page.emulateMedia({ media: 'print' })
          assert.equal(
            await page.locator('.erp-print-shell__header').isVisible(),
            false,
            '固定区域不进入浏览器打印或占位'
          )
          assert.equal(
            await notice.isVisible(),
            false,
            '轻提示不进入浏览器打印'
          )
          await page.emulateMedia({ media: 'screen' })
          await page.screenshot({
            path: path.join(outputDir, `print-blank-notice-${prefix}.png`),
            fullPage: true,
          })
          await expandPrintToolSection(page, '模板内容')
          await page
            .getByRole('button', { name: '空白模板', exact: true })
            .click()
          await page
            .getByRole('button', { name: '生成空白模板', exact: true })
            .click()
          await notice.waitFor()
          assert.equal(
            await page.locator('[data-print-blank-notice]').count(),
            1,
            '空白模板只显示一条轻提示'
          )
          if (key === 'processing-contract') {
            await page
              .getByRole('button', { name: '恢复样例', exact: true })
              .click()
            await notice.waitFor({ state: 'hidden' })
            await page
              .getByRole('button', { name: '选择明细行', exact: true })
              .click()
            await page
              .locator('.erp-processing-contract-table tbody tr')
              .first()
              .click()
            await page
              .getByRole('button', { name: '下插一行', exact: true })
              .click()
            await page
              .locator('.erp-processing-contract-table tbody tr')
              .nth(3)
              .click()
            await page
              .getByRole('button', { name: '上插一行', exact: true })
              .click()
            await notice.waitFor()
            await assertBlankCount(notice, 24)
            await notice
              .getByRole('button', { name: '查看留白', exact: true })
              .click()
            assert.equal(
              await page
                .locator(
                  '.erp-processing-contract-table tbody tr[data-print-blank-row]'
                )
                .count(),
              5
            )
            const blankRows = await page
              .locator(
                '.erp-processing-contract-table tbody tr[data-print-blank-row]'
              )
              .evaluateAll((rows) => rows.map((row) => row.textContent.trim()))
            assert.deepEqual(
              [blankRows[1], blankRows[3]],
              ['', ''],
              '复现截图五行中第2、4行整行留白'
            )
            const detailRows = page.locator(
              '.erp-processing-contract-table tbody tr[data-print-blank-row]'
            )
            const blankEditors = [
              ...(await detailRows
                .nth(1)
                .locator('td [contenteditable="true"]')
                .all()),
              ...(await detailRows
                .nth(3)
                .locator('td [contenteditable="true"]')
                .all()),
            ]
            assert.equal(blankEditors.length, 24)
            await assertBlankFocused(
              blankEditors[0],
              '退出选行模式后从第2行最左侧委外加工订单号开始'
            )
            for (const editor of [...blankEditors.slice(1), blankEditors[0]]) {
              await notice
                .getByRole('button', { name: '下一处', exact: true })
                .click()
              await assertBlankFocused(
                editor,
                '跨行依次定位全部24处留白，末尾回到最左侧首处'
              )
            }
            await page.setViewportSize({ width: 3840, height: 2160 })
            await assertBlankFocused(blankEditors[0], '宽屏保持首格焦点')
            await page.screenshot({
              path: path.join(outputDir, 'print-blank-first-cell-4k.png'),
            })
            await page.setViewportSize({ width: 1440, height: 960 })
            await page
              .getByRole('button', { name: '打印', exact: true })
              .click()
            await page.waitForFunction(
              () => window.__blankNoticePrintCalls === 2
            )
            await page.screenshot({
              path: path.join(
                outputDir,
                'print-blank-notice-processing-inserted-blank-rows.png'
              ),
              fullPage: true,
            })
          }
        }
      },
    },
    {
      name: 'print-workspace-business-blank-notice',
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
        for (const [key, title, businessSelector, signatureSelector] of [
          [
            'material-purchase-contract',
            '采购合同',
            '.erp-material-contract-meta__value, .erp-material-contract-clause-block__value',
            '.erp-material-contract-signature [contenteditable="true"]',
          ],
          [
            'processing-contract',
            '加工合同',
            '.erp-processing-contract-meta__value, .erp-processing-contract-clauses__editable',
            '.erp-processing-contract-signature [contenteditable="true"]',
          ],
          [
            'engineering-material-detail',
            '物料分析明细表',
            '.erp-material-detail-paper__company, .erp-engineering-print-meta-grid [contenteditable="true"]',
            '.erp-material-detail-paper__footer [contenteditable="true"]',
          ],
          [
            'engineering-color-card',
            '色卡',
            '.erp-color-card-paper__company, .erp-color-card-paper__meta [contenteditable="true"], .erp-color-card-paper__footer [data-print-blank-field]',
            '.erp-color-card-paper__footer [contenteditable="true"]:not([data-print-blank-field])',
          ],
          [
            'engineering-work-instruction',
            '作业指导书',
            '.erp-work-instruction-paper__header [data-print-blank-field]',
            'td.erp-work-instruction-paper__meta-label:has-text("制表") + td [contenteditable="true"], td.erp-work-instruction-paper__meta-label:has-text("审核") + td [contenteditable="true"]',
          ],
        ]) {
          await gotoScenarioPath(
            page,
            `/erp/print-workspace/${key}?state=business-blank-notice`
          )
          await page.locator('.erp-print-shell--ready').waitFor()
          const notice = page.locator('[data-print-blank-notice]')
          const business = page.locator(businessSelector)
          assert(
            (await business.count()) >= 4,
            `${title}覆盖全部非表格业务信息`
          )
          assert(
            await business.evaluateAll((nodes) =>
              nodes.every((node) => node.closest('[data-print-blank-field]'))
            ),
            `${title}的非表格业务字段均进入留白范围`
          )
          const signatures = page.locator(signatureSelector)
          assert((await signatures.count()) >= 2, `${title}包含签署字段`)
          for (const editor of await signatures.all()) await editor.fill('')
          const allBusiness = page.locator(
            '[data-print-blank-field][contenteditable="true"], [data-print-blank-field] [contenteditable="true"]'
          )
          for (const editor of await allBusiness.all()) {
            if (!(await editor.innerText()).trim()) await editor.fill('1')
          }
          await notice.waitFor({ state: 'hidden' })
          assert.equal(
            await signatures.evaluateAll(
              (nodes) => nodes.filter((node) => !node.textContent.trim()).length
            ),
            await signatures.count(),
            '签署字段保持留白且不计数'
          )
          for (const editor of await business.all()) await editor.fill('')
          const count = await business.count()
          await assertBlankCount(notice, count)
          const first = business.first()
          const last = business.last()
          await notice
            .getByRole('button', { name: '查看留白', exact: true })
            .click()
          await assertBlankFocused(first, `${title}从首个非表格业务留白开始`)
          await notice
            .getByRole('button', { name: '最后一处', exact: true })
            .click()
          await assertBlankFocused(last, `${title}定位到最后一个业务留白`)
          await notice
            .getByRole('button', { name: '下一处', exact: true })
            .click()
          await assertBlankFocused(first, `${title}末尾循环到首处`)
          await first.fill('已补齐业务信息')
          await assertBlankCount(notice, count - 1)
          await assertBlankFocused(first, '数量自动更新且不打断输入')
          await notice
            .getByRole('button', { name: '下一处', exact: true })
            .click()
          const next = business.nth(key === 'processing-contract' ? 5 : 1)
          await assertBlankFocused(next, '补齐后继续定位下一处，不跳过相邻字段')
          await page.getByText('本窗口内容已保存', { exact: true }).waitFor()
          await page.reload()
          await page.locator('.erp-print-shell--ready').waitFor()
          await assertBlankCount(notice, count - 1)
          await notice
            .getByRole('button', { name: '查看留白', exact: true })
            .click()
          await assertBlankFocused(next, '刷新恢复留白后从当前首处开始')
          await page.screenshot({
            path: path.join(outputDir, `print-business-blank-${key}.png`),
          })
          await assertPrintPreviewPopup(page, {
            buttonName: '在线预览 PDF',
            title: key.startsWith('engineering-') ? title : `${title} PDF 预览`,
            screenshotName: `print-business-blank-${key}-preview`,
          })
          const download = page.waitForEvent('download')
          await page
            .getByRole('button', { name: '下载 PDF', exact: true })
            .click()
          await download
          assert(
            !outputHTML.includes('data-print-blank-notice'),
            '留白提示不进入 PDF'
          )
          assert.equal(
            await page.evaluate(
              (html) =>
                new DOMParser()
                  .parseFromString(html, 'text/html')
                  .querySelectorAll('.erp-print-shell__blank-actions').length,
              outputHTML
            ),
            0,
            '定位按钮不进入 PDF'
          )
          assert(!/当前有 \d+ 处留白/u.test(outputHTML), '留白数量不进入 PDF')
          await page.evaluate(() => {
            window.__businessBlankPrintCalls = 0
            window.print = () => {
              window.__businessBlankPrintCalls += 1
            }
          })
          await page.getByRole('button', { name: '打印', exact: true }).click()
          await page.waitForFunction(
            () => window.__businessBlankPrintCalls === 1
          )
          assert.equal(
            await page.getByRole('dialog').count(),
            0,
            '留白不增加确认弹窗'
          )
          await page.emulateMedia({ media: 'print' })
          assert.equal(
            await notice.isVisible(),
            false,
            '留白提示不进入浏览器打印'
          )
          await page.emulateMedia({ media: 'screen' })
          for (const editor of await business.all()) {
            await editor.fill('已补齐业务信息')
          }
          await notice.waitFor({ state: 'hidden' })
        }
      },
    },
    {
      name: 'print-workspace-header-blank-notice',
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
        for (const [key, prefix, title, order] of [
          [
            'material-purchase-contract',
            'material',
            '采购合同',
            [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
          ],
          [
            'processing-contract',
            'processing',
            '加工合同',
            [0, 5, 6, 1, 7, 2, 8, 3, 9, 4, 10],
          ],
        ]) {
          await gotoScenarioPath(
            page,
            `/erp/print-workspace/${key}?state=header-blank-notice`
          )
          await page.locator('.erp-print-shell--ready').waitFor()
          const notice = page.locator('[data-print-blank-notice]')
          assert.equal(await notice.count(), 0, '完整业务信息不提示')
          await expandPrintToolSection(page, '模板内容')
          await page
            .getByRole('button', { name: '手签留白', exact: true })
            .click()
          const signatures = page.locator(
            `.erp-${prefix}-contract-signature [contenteditable="true"]`
          )
          assert.equal(await signatures.count(), 4)
          for (const signature of await signatures.all())
            await signature.fill('')
          await signatures.last().press('Tab')
          await page.evaluate(
            () => new Promise((resolve) => requestAnimationFrame(resolve))
          )
          assert.equal(await notice.count(), 0, '签字和签署日期留白不计数')
          const headers = page.locator(`.erp-${prefix}-contract-meta__value`)
          assert.equal(await headers.count(), 11)
          const originals = await headers.allTextContents()
          for (const header of await headers.all()) await header.fill('')
          const detail = page
            .locator(`.erp-${prefix}-contract-table tbody tr`)
            .first()
            .locator('td')
            .first()
            .locator('[contenteditable="true"]')
          const originalDetail = await detail.innerText()
          await detail.fill('')
          await detail.press('Tab')
          await assertBlankCount(notice, 12)
          await page
            .getByRole('button', { name: '选择明细行', exact: true })
            .click()
          await assertBlankCount(notice, 12)
          await notice
            .getByRole('button', { name: '查看留白', exact: true })
            .click()
          const expected = [...order.map((index) => headers.nth(index)), detail]
          await assertBlankFocused(
            expected[0],
            '选行模式返回编辑后从表头编号开始'
          )
          await assertBlankNavigation(notice, [
            '第一处',
            '上一处',
            '下一处',
            '最后一处',
          ])
          for (const editor of [...expected.slice(1), expected[0]]) {
            await notice
              .getByRole('button', { name: '下一处', exact: true })
              .click()
            await assertBlankFocused(
              editor,
              '按纸面同行从左到右、从表头到明细依次定位并循环'
            )
          }
          for (const [name, editor] of [
            ['最后一处', detail],
            ['上一处', expected[10]],
            ['第一处', expected[0]],
            ['上一处', detail],
            ['下一处', expected[0]],
          ]) {
            await notice.getByRole('button', { name, exact: true }).click()
            await assertBlankFocused(
              editor,
              '首尾直达和反向导航均按整张纸顺序定位'
            )
          }
          await page.screenshot({
            path: path.join(
              outputDir,
              `print-header-blank-${prefix}-focus.png`
            ),
          })
          await page.setViewportSize({ width: 3840, height: 2160 })
          await assertBlankFocused(expected[0], '宽屏保留表头首个留白焦点')
          await page.screenshot({
            path: path.join(outputDir, `print-header-blank-${prefix}-4k.png`),
          })
          await page.setViewportSize({ width: 1440, height: 960 })
          await page.getByText('本窗口内容已保存', { exact: true }).waitFor()
          await page.reload()
          await page.locator('.erp-print-shell--ready').waitFor()
          await assertBlankCount(notice, 12)
          await notice
            .getByRole('button', { name: '查看留白', exact: true })
            .click()
          await assertBlankFocused(
            headers.first(),
            '刷新后表头与明细留白恢复，定位从首处开始'
          )
          await assertPrintPreviewPopup(page, {
            buttonName: '在线预览 PDF',
            title: `${title} PDF 预览`,
            screenshotName: `print-header-blank-${prefix}-preview`,
          })
          const download = page.waitForEvent('download')
          await page
            .getByRole('button', { name: '下载 PDF', exact: true })
            .click()
          await download
          assert(
            !outputHTML.includes('data-print-blank-notice'),
            '表头留白提示不进入 PDF'
          )
          assert(
            !/当前有 \d+ 处留白/u.test(outputHTML),
            '表头留白计数不进入 PDF'
          )
          const emptyHeader = await page.evaluate(
            ({ html, prefix }) =>
              new DOMParser()
                .parseFromString(html, 'text/html')
                .querySelector(`.erp-${prefix}-contract-meta__value`)
                .textContent.trim(),
            { html: outputHTML, prefix }
          )
          assert.equal(emptyHeader, '', '表头按当前留白内容输出')
          await page.evaluate(() => {
            window.__headerBlankPrintCalls = 0
            window.print = () => {
              window.__headerBlankPrintCalls += 1
            }
          })
          await page.getByRole('button', { name: '打印', exact: true }).click()
          await page.waitForFunction(() => window.__headerBlankPrintCalls === 1)
          assert.equal(
            await page.getByRole('dialog').count(),
            0,
            '表头留白不增加确认弹窗'
          )
          await page.emulateMedia({ media: 'print' })
          assert.equal(
            await notice.isVisible(),
            false,
            '表头留白提示不进入浏览器打印'
          )
          await page.emulateMedia({ media: 'screen' })
          await chooseSelectOption(page
            .getByRole('combobox', { name: '显示比例', exact: true }), '0.75')
          await notice
            .getByRole('button', { name: '下一处', exact: true })
            .click()
          await assertBlankFocused(
            headers.nth(order[1]),
            '缩放后仍按纸面顺序定位下单日期'
          )
          await headers.nth(order[1]).fill(originals[order[1]])
          await assertBlankCount(notice, 11)
          await assertBlankFocused(
            headers.nth(order[1]),
            '表头补齐后数量更新且保留输入焦点'
          )
          await notice
            .getByRole('button', { name: '下一处', exact: true })
            .click()
          await assertBlankFocused(
            headers.nth(order[2]),
            '补齐下单日期后继续定位回货日期，不跳到下一行'
          )
          for (const [index, value] of originals.entries())
            await headers.nth(index).fill(value)
          await assertBlankCount(notice, 1)
          await assertBlankNavigation(notice, ['查看留白'])
          await notice
            .getByRole('button', { name: '查看留白', exact: true })
            .click()
          await assertBlankFocused(detail, '补齐全部表头后进入剩余明细留白')
          await detail.fill(originalDetail)
          await notice.waitFor({ state: 'hidden' })
          await assertBlankFocused(
            detail,
            '清零隐藏提示不打断当前输入，签署留白不参与'
          )
          await headers.first().fill('')
          await assertBlankCount(notice, 1)
          await notice
            .getByRole('button', { name: '查看留白', exact: true })
            .click()
          await assertBlankFocused(
            headers.first(),
            '再次出现表头留白时从首处重新开始'
          )
          await headers.first().fill(originals[0])
          await notice.waitFor({ state: 'hidden' })
        }
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
          const rows = page.locator(`.erp-${prefix}-contract-table tbody tr`)
          await rows
            .first()
            .locator('[contenteditable="true"]')
            .first()
            .fill('留白打印保留内容')
          for (const cell of await rows
            .nth(1)
            .locator('[contenteditable="true"]')
            .all()) {
            await cell.fill('')
          }
          await rows
            .nth(1)
            .locator('[contenteditable="true"]')
            .last()
            .press('Tab')
          const partialDownload = page.waitForEvent('download')
          await page
            .getByRole('button', { name: '下载 PDF', exact: true })
            .click()
          await partialDownload
          const partialOutput = await page.evaluate(
            ({ html, prefix }) => {
              const document = new DOMParser().parseFromString(
                html,
                'text/html'
              )
              const rows = document.querySelectorAll(
                `.erp-${prefix}-contract-table tbody tr`
              )
              return {
                firstRow: rows[0].textContent,
                blankRow: rows[1].textContent.trim(),
                emptyHeader: document
                  .querySelector(`.erp-${prefix}-contract-meta__value`)
                  .textContent.trim(),
                text: document.body.textContent,
              }
            },
            { html: outputHTML, prefix }
          )
          assert.match(partialOutput.firstRow, /留白打印保留内容/)
          assert.equal(
            partialOutput.blankRow,
            '',
            '主动清空的明细行在输出中保持留白'
          )
          assert.equal(partialOutput.emptyHeader, '', '表头字段留白不阻断输出')
          assert(
            !partialOutput.text.includes('点击填写'),
            '空值提示不进入打印件'
          )
          assert.equal(
            await page
              .locator('[data-print-feedback="output"][role="alert"]')
              .count(),
            0
          )
          await page.evaluate(() => {
            window.__blankContractPrintCalls = 0
            window.print = () => {
              window.__blankContractPrintCalls += 1
            }
          })
          await page.getByRole('button', { name: '打印', exact: true }).click()
          await page.waitForFunction(
            () => window.__blankContractPrintCalls === 1
          )
          await page.screenshot({
            path: path.join(
              outputDir,
              `print-workspace-${prefix}-partial-blank.png`
            ),
            fullPage: true,
          })
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
