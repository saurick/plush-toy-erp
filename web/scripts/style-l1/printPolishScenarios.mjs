import { writeFile } from 'node:fs/promises'
import { Buffer } from 'node:buffer'
import { createWorkInstructionMeasurementScenario } from './workInstructionMeasurementScenario.mjs'

export function createPrintPolishScenarios({
  assert,
  path,
  outputDir,
  gotoScenarioPath,
}) {
  const captureSnapshot = async (page, key) => {
    let html
    await page.route('**/templates/render-pdf', async (route) => {
      html = route.request().postDataJSON().html
      await route.fulfill({
        contentType: 'application/pdf',
        body: '%PDF-1.4\n%%EOF\n',
      })
    })
    const downloaded = page.waitForEvent('download')
    await page.getByRole('button', { name: '下载 PDF', exact: true }).click()
    await downloaded
    assert(html?.includes('data:font/woff2;base64,'), '输出应内嵌当前字体')
    await writeFile(path.join(outputDir, `print-snapshot-${key}.html`), html)
    return html
  }
  return [
    createWorkInstructionMeasurementScenario({
      assert,
      path,
      outputDir,
      captureSnapshot,
    }),
    {
      name: 'print-workspace-contract-edit-continuity',
      path: '/erp/print-workspace/material-purchase-contract?state=edit-start',
      auth: 'admin',
      viewport: { width: 1600, height: 1100 },
      verify: async (page) => {
        for (const [key, prefix] of [
          ['material-purchase-contract', 'material'],
          ['processing-contract', 'processing'],
        ]) {
          await gotoScenarioPath(
            page,
            `/erp/print-workspace/${key}?state=edit-continuity`
          )
          const meta = page.locator(
            `.erp-${prefix}-contract-meta__value[contenteditable="true"]`
          )
          await meta.first().waitFor()
          for (const scale of ['1', '1.25']) {
            await page
              .locator('.erp-print-shell__zoom-control select')
              .selectOption(scale)
            const entries = [
              meta.first(),
              meta.nth(1),
              page
                .locator(
                  `.erp-${prefix}-contract-table tbody [contenteditable="true"]`
                )
                .first(),
              meta.nth(2),
            ]
            for (const [index, field] of entries.entries()) {
              await field.click()
              await field.fill(`连续输入-${index}-${scale}`)
              for (const wait of [50, 300, 650]) {
                await page.waitForTimeout(wait)
                assert(
                  await field.evaluate(
                    (node) => document.activeElement === node
                  ),
                  `${key} ${scale} 第 ${index} 个字段在后台预热后仍应保持编辑`
                )
              }
            }
            assert(
              await meta
                .first()
                .evaluate((node) => !node.closest('[data-print-focus-group]')),
              `${key} 顶部焦点框只包含值`
            )
          }
          await page
            .getByRole('button', { name: '选择明细行', exact: true })
            .click()
          await page.waitForTimeout(1000)
          assert(
            await page.evaluate(
              () => !document.activeElement?.isContentEditable
            ),
            '主动选择行后应保持退出文字编辑'
          )
          await page
            .getByRole('button', { name: '返回编辑', exact: true })
            .click()
          await meta.nth(2).fill('最后一笔未失焦输入')
          const html = await captureSnapshot(page, key)
          assert(
            html.includes('最后一笔未失焦输入'),
            '显式输出仍须收口最后一笔输入'
          )
          await page.reload({ waitUntil: 'networkidle' })
          assert.equal(
            await meta.nth(2).textContent(),
            '最后一笔未失焦输入',
            '输出后的草稿刷新应恢复最后一笔输入'
          )
        }
      },
    },
    {
      name: 'print-workspace-material-header-layout',
      path: '/erp/print-workspace/engineering-material-detail?state=header-layout',
      auth: 'admin',
      viewport: { width: 1600, height: 1100 },
      verify: async (page) => {
        const expected = [
          ['材料', '类别'],
          ['物料名称'],
          ['厂商', '料号'],
          ['规格'],
          ['颜色'],
          ['单位'],
          ['组装部位'],
          ['片数'],
          ['单位', '用量'],
          ['损耗', '%'],
          ['总用量', '含损耗'],
          ['加工', '方式'],
          ['加工', '方式'],
          ['备注:', '共25251#纸样/色卡'],
        ]
        await page.locator('.erp-material-detail-table th').first().waitFor()
        await page.evaluate(() => document.fonts.ready)
        for (const media of ['screen', 'print']) {
          await page.emulateMedia({ media })
          const metrics = await page
            .locator('.erp-material-detail-table th')
            .evaluateAll((cells) =>
              cells.map((cell) => {
                const lines = new Map()
                const rect = cell.getBoundingClientRect()
                let fits = true
                const walker = document.createTreeWalker(
                  cell,
                  NodeFilter.SHOW_TEXT
                )
                for (
                  let node = walker.nextNode();
                  node;
                  node = walker.nextNode()
                ) {
                  for (let index = 0; index < node.length; index += 1) {
                    if (!node.textContent[index].trim()) continue
                    const range = document.createRange()
                    range.setStart(node, index)
                    range.setEnd(node, index + 1)
                    const glyph = range.getBoundingClientRect()
                    const line = Math.round(glyph.top)
                    lines.set(
                      line,
                      (lines.get(line) || '') + node.textContent[index]
                    )
                    fits &&=
                      glyph.left >= rect.left &&
                      glyph.right <= rect.right + 0.5 &&
                      glyph.top >= rect.top &&
                      glyph.bottom <= rect.bottom
                  }
                }
                return {
                  lines: Array.from(lines.values()),
                  width: rect.width,
                  fits,
                }
              })
            )
          assert.deepEqual(
            metrics.map((cell) => cell.lines),
            expected,
            `${media} 表头按词组换行，短表头保持一行`
          )
          assert(
            metrics.every((cell) => cell.fits),
            `${media} 表头不能裁字或越过单元格`
          )
          // The source widths of the two widest business columns retain their ratio.
          assert(
            Math.abs(metrics[13].width / metrics[1].width - 47.75 / 34.6667) <
              0.015,
            '列宽应保留源表备注与物料名称的比例'
          )
        }
        await page.emulateMedia({ media: 'screen' })
        await page.locator('.erp-material-detail-paper').screenshot({
          path: path.join(outputDir, 'material-header-layout.png'),
        })
        await captureSnapshot(page, 'engineering-material-detail')
        const header = page
          .locator('.erp-material-detail-table th [contenteditable="true"]')
          .nth(11)
        await header.fill('自定义\n加工说明')
        await header.press('Tab')
        await page.locator('[data-print-draft-save-status="saved"]').waitFor()
        await page.reload({ waitUntil: 'networkidle' })
        assert(
          (await header.innerText()).includes('自定义'),
          '自定义表头不能被默认折行文案覆盖'
        )
      },
    },
    {
      name: 'work-instruction-annotation-editing',
      path: '/erp/print-workspace/engineering-work-instruction?state=annotation-polish',
      auth: 'admin',
      viewport: { width: 1440, height: 1000 },
      verify: async (page) => {
        const input = page
          .locator('.erp-work-instruction-paper__row-image-input')
          .first()
        const image = (width, height, name) => ({
          name,
          mimeType: 'image/svg+xml',
          buffer: Buffer.from(
            `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#e2e8f0"/><circle cx="50%" cy="50%" r="25%" fill="#fbbf24"/></svg>`
          ),
        })
        await input.setInputFiles([
          image(640, 480, 'wide.svg'),
          image(240, 640, 'tall.svg'),
        ])
        await page.getByRole('button', { name: '选择行', exact: true }).click()
        await input.locator('..').click()
        const open = page.getByRole('button', {
          name: '标注当前行图片',
          exact: true,
        })
        await open.click()
        const modal = page.locator('.erp-work-instruction-annotation-modal')
        const callouts = modal.locator(
          '[data-work-instruction-annotation-kind="callout"]'
        )
        const selectedText = modal.locator(
          'textarea[data-annotation-id].is-selected'
        )
        const add = modal.getByRole('button', {
          name: '添加说明框',
          exact: true,
        })
        const viewport = modal.locator(
          '.erp-work-instruction-annotation-modal__image-viewport'
        )
        const initialViewport = await viewport.boundingBox()
        for (const text of [
          '接缝平整，针距均匀',
          '左右位置对称',
          '边缘不可露底',
        ]) {
          await add.click()
          assert.equal(
            await selectedText.getAttribute('placeholder'),
            '点击填写'
          )
          assert(
            await selectedText.evaluate(
              (node) => document.activeElement === node
            ),
            '新增后应直接输入说明'
          )
          await selectedText.fill(text)
        }
        const boxes = await callouts.evaluateAll((nodes) =>
          nodes.map((node) => node.getBoundingClientRect().toJSON())
        )
        assert(
          boxes.every(
            (box, index) => index === 0 || box.top >= boxes[index - 1].bottom
          ),
          '新框应依次使用右侧空位，避免重叠'
        )
        assert.equal(
          await modal
            .locator('.erp-work-instruction-annotation-modal__form textarea')
            .count(),
          0,
          '说明框直接输入，不保留侧栏的第二个说明文字输入框'
        )
        const firstCallout = callouts.first()
        await firstCallout.click()
        await firstCallout.fill('')
        await firstCallout.pressSequentially('A B')
        await firstCallout.press('Enter')
        await page.keyboard.insertText('中文')
        assert.equal(await firstCallout.inputValue(), 'A B\n中文')
        const beforeCaret = await firstCallout.boundingBox()
        await firstCallout.press('ArrowLeft')
        assert.deepEqual(
          await firstCallout.boundingBox(),
          beforeCaret,
          '文字方向键应移动光标，不移动说明框'
        )
        await firstCallout.fill('接缝平整，针距均匀')
        const move = modal.getByRole('button', {
          name: '移动说明框 1',
          exact: true,
        })
        await move.focus()
        await move.press('ArrowRight')
        assert(
          (await firstCallout.boundingBox()).x > beforeCaret.x,
          '移动手柄方向键应调整位置'
        )
        await move.press('ArrowLeft')
        const moveBox = await move.boundingBox()
        await page.mouse.move(
          moveBox.x + moveBox.width / 2,
          moveBox.y + moveBox.height / 2
        )
        await page.mouse.down()
        await page.mouse.move(
          moveBox.x + moveBox.width / 2 + 12,
          moveBox.y + moveBox.height / 2,
          { steps: 3 }
        )
        await page.mouse.up()
        assert(
          (await firstCallout.boundingBox()).x > beforeCaret.x + 10,
          '独立手柄应能拖动说明框'
        )
        assert.equal(await firstCallout.inputValue(), '接缝平整，针距均匀')
        await callouts.last().click()
        await modal.locator('select').nth(1).selectOption('blue-fill')
        assert.equal(
          await callouts
            .last()
            .evaluate((node) => getComputedStyle(node).backgroundColor),
          'rgb(59, 120, 200)',
          '说明框配色不能被普通按钮样式覆盖'
        )
        const handle = modal
          .locator('[data-work-instruction-annotation-handle="target"]')
          .last()
        const handleRect = await handle.boundingBox()
        assert.equal(handleRect.width, 12)
        assert.equal(handleRect.height, 12)
        await handle.focus()
        await handle.press('ArrowRight')
        assert(
          await handle.evaluate((node) => document.activeElement === node),
          '方向键微调不应被输入框抢焦点'
        )
        await modal
          .getByRole('button', { name: '删除标注 2', exact: true })
          .click()
        assert.equal(await callouts.count(), 2)
        await modal
          .getByRole('button', { name: '撤销删除', exact: true })
          .click()
        assert.equal(await callouts.count(), 3)
        await modal
          .getByRole('checkbox', { name: '选择标注 1', exact: true })
          .check()
        await modal
          .getByRole('checkbox', { name: '选择标注 3', exact: true })
          .check()
        await modal
          .getByRole('button', { name: '删除所选 (2)', exact: true })
          .click()
        assert.equal(await callouts.count(), 1)
        await modal
          .getByRole('button', { name: '撤销删除', exact: true })
          .click()
        assert.equal(await callouts.count(), 3)
        await modal.getByRole('checkbox', { name: '全选', exact: true }).check()
        await modal
          .getByRole('button', { name: '删除所选 (3)', exact: true })
          .click()
        assert.equal(await callouts.count(), 0)
        assert.deepEqual(
          await viewport.boundingBox(),
          initialViewport,
          '删除最后一个说明框不能改变图片区域'
        )
        await modal
          .getByRole('button', { name: '撤销删除', exact: true })
          .click()
        await selectedText.fill('超长说明'.repeat(100))
        await modal
          .getByRole('button', { name: '保存标注', exact: true })
          .click()
        assert(
          await modal.isVisible(),
          '说明超框应引导调整，不能静默裁掉后保存'
        )
        await selectedText.fill('接缝平整，针距均匀')
        await modal.getByRole('tab', { name: '图片 2', exact: true }).click()
        await add.click()
        await modal
          .getByRole('button', { name: '保存标注', exact: true })
          .click()
        assert(await modal.isVisible(), '空说明应定位到对应图片等待填写')
        await selectedText.fill('检查纵向边缘')
        assert(
          await viewport
            .locator('img')
            .evaluate(
              (node) =>
                node.getBoundingClientRect().height <=
                node.parentElement.getBoundingClientRect().height + 1
            ),
          '竖图应完整缩放到画布内，不能被 Grid 固有尺寸撑出后裁掉'
        )
        await modal.screenshot({
          path: path.join(outputDir, 'annotation-tall-image.png'),
        })
        await modal.getByRole('tab', { name: '图片 1', exact: true }).click()
        for (let index = 4; index <= 12; index += 1) {
          await add.click()
          await selectedText.fill(`说明 ${index}`)
        }
        assert(await add.isDisabled(), '达到每图 12 个标注后应停止添加')
        for (const size of [
          { width: 1440, height: 800 },
          { width: 760, height: 1000 },
        ]) {
          await page.setViewportSize(size)
          const layout = await modal.evaluate((node) => {
            const list = node.querySelector(
              '.erp-work-instruction-annotation-modal__annotation-list'
            )
            const section = node.querySelector(
              '.erp-work-instruction-annotation-modal__list-section'
            )
            const form = node.querySelector(
              '.erp-work-instruction-annotation-modal__form'
            )
            return {
              listBottom: list.getBoundingClientRect().bottom,
              sectionBottom: section.getBoundingClientRect().bottom,
              formTop: form.getBoundingClientRect().top,
              scrollable: list.scrollHeight > list.clientHeight,
            }
          })
          assert(layout.scrollable, '多标注列表应在自身区域滚动')
          assert(
            layout.listBottom <= layout.sectionBottom + 1 &&
              layout.listBottom + 8 <= layout.formTop,
            '列表不可压缩外层后覆盖下方设置'
          )
        }
        await page.setViewportSize({ width: 1440, height: 800 })
        await modal.screenshot({
          path: path.join(outputDir, 'annotation-inline-twelve.png'),
        })
        for (let index = 4; index <= 12; index += 1) {
          await modal
            .getByRole('checkbox', { name: `选择标注 ${index}`, exact: true })
            .check()
        }
        await modal
          .getByRole('button', { name: '删除所选 (9)', exact: true })
          .click()
        assert.equal(await callouts.count(), 3)
        await page.setViewportSize({ width: 1440, height: 1000 })
        await modal.screenshot({
          path: path.join(outputDir, 'annotation-list-delete-undo.png'),
        })
        assert(
          await modal.evaluate((node) => node.scrollWidth <= node.clientWidth),
          '标注列表不能挤掉删除按钮或横向溢出'
        )
        await page.setViewportSize({ width: 760, height: 1000 })
        assert(
          await modal.evaluate((node) => node.scrollWidth <= node.clientWidth),
          '窄窗口标注面板应完整显示'
        )
        await modal.screenshot({
          path: path.join(outputDir, 'annotation-narrow.png'),
        })
        await page.setViewportSize({ width: 1440, height: 1000 })
        await modal
          .getByRole('button', { name: '保存标注', exact: true })
          .click()
        await modal.waitFor({ state: 'hidden' })
        await page.locator('[data-print-draft-save-status="saved"]').waitFor()
        await page.reload({ waitUntil: 'networkidle' })
        const outputCallouts = page.locator(
          '.erp-print-shell__stage [data-work-instruction-annotation-kind="callout"]'
        )
        assert.equal(
          await outputCallouts.count(),
          4,
          '保存刷新后应完整恢复两张图片的标注'
        )
        assert(
          await page
            .locator(
              '.erp-work-instruction-paper__row-images .erp-engineering-print-image-slot__viewport img'
            )
            .evaluateAll((nodes) =>
              nodes.every(
                (node) =>
                  node.getBoundingClientRect().height <=
                  node.parentElement.getBoundingClientRect().height + 1
              )
            ),
          '保存后的纸面也应完整显示横图和竖图'
        )
        assert(
          await outputCallouts.evaluateAll((nodes) =>
            nodes.every(
              (node) =>
                node.scrollWidth <= node.clientWidth + 1 &&
                node.scrollHeight <= node.clientHeight + 1
            )
          ),
          '纸面上的说明文字也应完整显示'
        )
        await page.getByRole('button', { name: '选择行', exact: true }).click()
        await input.locator('..').click()
        await open.click()
        await modal.getByRole('checkbox', { name: '全选', exact: true }).check()
        await modal
          .getByRole('button', { name: '删除所选 (3)', exact: true })
          .click()
        await modal.getByRole('button', { name: '取消', exact: true }).click()
        assert.equal(
          await outputCallouts.count(),
          4,
          '取消标注编辑应丢弃本次删除'
        )
        const seededOverflow = await page.evaluate(async () => {
          const db = await new Promise((resolve, reject) => {
            const request = indexedDB.open('__plush_erp_print_drafts__')
            request.onsuccess = () => resolve(request.result)
            request.onerror = () => reject(request.error)
          })
          try {
            return await new Promise((resolve, reject) => {
              let changed = false
              const transaction = db.transaction('drafts', 'readwrite')
              const request = transaction.objectStore('drafts').openCursor()
              request.onsuccess = () => {
                const cursor = request.result
                if (!cursor) return
                if (
                  !cursor.key.endsWith(
                    ':engineering-work-instruction:annotation-polish'
                  )
                ) {
                  cursor.continue()
                  return
                }
                const record = cursor.value
                const callout = record.draft.rows
                  .flatMap((row) => row.images || [])
                  .flatMap((item) => item.annotations || [])
                  .find((item) => item.type === 'callout')
                if (!callout) return
                callout.text = '旧草稿中的长说明'.repeat(50)
                record.updatedAt = Date.now()
                cursor.update(record)
                changed = true
              }
              transaction.oncomplete = () => resolve(changed)
              transaction.onerror = () => reject(transaction.error)
              transaction.onabort = () => reject(transaction.error)
            })
          } finally {
            db.close()
          }
        })
        assert(seededOverflow, '应在当前隔离窗口的已存草稿中准备超框说明')
        await page.reload({ waitUntil: 'networkidle' })
        await page
          .getByRole('button', { name: '下载 PDF', exact: true })
          .click()
        await page
          .getByText(
            '有说明文字超出说明框，请在“标注当前行图片”中扩大说明框或拆分说明后再输出。',
            { exact: true }
          )
          .first()
          .waitFor()
        await page.getByRole('button', { name: '选择行', exact: true }).click()
        await input.locator('..').click()
        await open.click()
        await modal
          .getByRole('region', { name: '当前图片的标注', exact: true })
          .getByRole('button', { name: /旧草稿中的长说明/ })
          .click()
        await selectedText.fill('接缝平整，针距均匀')
        await modal
          .getByRole('button', { name: '保存标注', exact: true })
          .click()
        await modal.waitFor({ state: 'hidden' })
        const html = await captureSnapshot(page, 'engineering-work-instruction')
        assert(
          html.includes('接缝平整，针距均匀') && html.includes('检查纵向边缘'),
          'PDF快照应包含两张图片的说明'
        )
        assert(
          !html.includes('data-annotation-control='),
          '输出不能携带拖动点和标注操作按钮'
        )
      },
    },
  ]
}
