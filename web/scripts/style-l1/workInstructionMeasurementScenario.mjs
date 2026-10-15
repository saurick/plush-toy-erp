import { Buffer } from 'node:buffer'
import { writeFile } from 'node:fs/promises'

export function createWorkInstructionMeasurementScenario({
  assert,
  path,
  outputDir,
  captureSnapshot,
}) {
  return {
    name: 'work-instruction-measurement-labels',
    path: '/erp/print-workspace/engineering-work-instruction?state=measurement-labels',
    auth: 'admin',
    viewport: { width: 1440, height: 1000 },
    verify: async (page) => {
      const input = page
        .locator('.erp-work-instruction-paper__row-image-input')
        .first()
      await input.setInputFiles({
        name: 'measurement-fixture.svg',
        mimeType: 'image/svg+xml',
        buffer: Buffer.from(
          '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="480"><rect width="100%" height="100%" fill="#e2e8f0"/><circle cx="50%" cy="50%" r="25%" fill="#fbbf24"/></svg>'
        ),
      })
      const openEditor = async () => {
        await page.getByRole('button', { name: '选择行', exact: true }).click()
        await input.locator('..').click()
        await page
          .getByRole('button', { name: '标注当前行图片', exact: true })
          .click()
      }
      await openEditor()
      const modal = page.locator('.erp-work-instruction-annotation-modal')
      const canvas = modal.locator('[data-work-instruction-annotation-canvas]')
      const list = modal.getByRole('region', {
        name: '当前图片的标注',
        exact: true,
      })
      await modal
        .getByRole('button', { name: '添加说明框', exact: true })
        .click()
      await modal.locator('textarea[data-annotation-id]').fill('123')
      await modal
        .getByRole('button', { name: '添加距离标注', exact: true })
        .click()
      const field = modal.getByLabel('距离文字', { exact: true })
      await field.fill('123')
      assert.equal(
        await list
          .getByRole('button', { name: '说明框 1 123', exact: true })
          .count(),
        1
      )
      assert.equal(
        await list
          .getByRole('button', { name: '距离标注 2 123', exact: true })
          .count(),
        1
      )

      const label = modal.locator(
        '[data-work-instruction-annotation-kind="measurement"]'
      )
      const slider = modal.getByLabel('距离文字位置', { exact: true })
      const dragTo = async (handle, point) => {
        const surface = await canvas.boundingBox()
        const box = await modal
          .locator(`[data-work-instruction-annotation-handle="${handle}"]`)
          .boundingBox()
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
        await page.mouse.down()
        await page.mouse.move(
          surface.x + (surface.width * point.x) / 100,
          surface.y + (surface.height * point.y) / 100,
          { steps: 5 }
        )
        await page.mouse.up()
      }
      const metrics = []
      const checkGeometry = async (root, state) => {
        const result = await root.evaluate((node) => {
          const layer = node.querySelector(
            '.erp-work-instruction-image-annotations'
          )
          const line = layer.querySelector(
            '[data-work-instruction-annotation-measurement]'
          )
          const text = layer.querySelector(
            '[data-work-instruction-annotation-kind="measurement"]'
          )
          const transform = line.getScreenCTM()
          const a = new DOMPoint(
            line.x1.baseVal.value,
            line.y1.baseVal.value
          ).matrixTransform(transform)
          const b = new DOMPoint(
            line.x2.baseVal.value,
            line.y2.baseVal.value
          ).matrixTransform(transform)
          const dx = b.x - a.x
          const dy = b.y - a.y
          const length = Math.hypot(dx, dy)
          const normal = { x: -dy / length, y: dx / length }
          const rect = text.getBoundingClientRect()
          const surface = layer.getBoundingClientRect()
          const distance = Math.abs(
            (rect.x + rect.width / 2 - a.x) * normal.x +
              (rect.y + rect.height / 2 - a.y) * normal.y
          )
          const extent =
            (Math.abs(normal.x) * rect.width +
              Math.abs(normal.y) * rect.height) /
            2
          return {
            gap: distance - extent,
            contained:
              rect.left >= surface.left - 1 &&
              rect.right <= surface.right + 1 &&
              rect.top >= surface.top - 1 &&
              rect.bottom <= surface.bottom + 1,
            text: text.textContent,
            position: { left: text.style.left, top: text.style.top },
            endpoints: { a: { x: a.x, y: a.y }, b: { x: b.x, y: b.y } },
          }
        })
        assert(
          result.gap >= 1,
          `${state} 距离文字不能与对应线段重叠：${JSON.stringify(result)}`
        )
        assert(result.contained, `${state} 距离文字不能被画布裁掉`)
        metrics.push({ state, ...result })
        return result
      }
      const segments = [
        ['horizontal', { x: 20, y: 45 }, { x: 80, y: 45 }],
        ['vertical', { x: 35, y: 15 }, { x: 35, y: 85 }],
        ['diagonal', { x: 15, y: 20 }, { x: 80, y: 80 }],
        ['top-edge', { x: 15, y: 2 }, { x: 85, y: 2 }],
        ['right-edge', { x: 98, y: 15 }, { x: 98, y: 85 }],
      ]
      for (const [name, start, end] of segments) {
        await dragTo('start', start)
        await dragTo('end', end)
        for (const offset of [-24, -7, 0, 24]) {
          await slider.fill(String(offset))
          assert.equal(
            await slider.inputValue(),
            String(offset),
            '零值不能跳回默认位置'
          )
          await checkGeometry(canvas, `${name}/${offset}`)
        }
      }

      await dragTo('start', { x: 35, y: 15 })
      await dragTo('end', { x: 35, y: 85 })
      await slider.fill('-7')
      const before = await checkGeometry(canvas, 'before-label-drag')
      const box = await label.boundingBox()
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.down()
      await page.mouse.move(
        box.x + box.width / 2 + 35,
        box.y + box.height / 2,
        { steps: 5 }
      )
      await page.mouse.up()
      const dragged = await checkGeometry(canvas, 'after-label-drag')
      assert.notEqual(
        dragged.position.left,
        before.position.left,
        '拖动文字必须实际改变位置'
      )
      assert.deepEqual(
        dragged.endpoints,
        before.endpoints,
        '移动文字不移动测量端点'
      )
      await label.focus()
      await label.press('ArrowRight')
      const nudged = await checkGeometry(canvas, 'keyboard-label-nudge')
      assert.notEqual(nudged.position.left, dragged.position.left)
      assert(
        await label.evaluate((node) => node === document.activeElement),
        '微调后应保持焦点'
      )

      for (const width of [1440, 760]) {
        await page.setViewportSize({ width, height: 1000 })
        await field.fill('45±2 mm\n测量接缝至边缘')
        await checkGeometry(canvas, `multiline/${width}`)
        assert(
          await modal.evaluate(
            (node) => node.scrollWidth <= node.clientWidth + 1
          ),
          '标注面板不能横向溢出'
        )
        await modal.screenshot({
          path: path.join(outputDir, `measurement-labels-${width}.png`),
        })
      }
      await page.setViewportSize({ width: 1440, height: 1000 })
      await field.fill('45±2 mm')
      await slider.fill('0')
      await modal.getByRole('button', { name: '保存标注', exact: true }).click()
      await modal.waitFor({ state: 'hidden' })
      await page.locator('[data-print-draft-save-status="saved"]').waitFor()
      await page.reload({ waitUntil: 'networkidle' })
      const output = page
        .locator(
          '.erp-print-shell__stage .erp-engineering-print-image-slot--annotated'
        )
        .first()
      for (const scale of ['1', '1.25']) {
        await page
          .locator('.erp-print-shell__zoom-control select')
          .selectOption(scale)
        await checkGeometry(output, `restored-paper/${scale}`)
      }
      await openEditor()
      await list
        .getByRole('button', { name: '距离标注 2 45±2 mm', exact: true })
        .click()
      assert.equal(await slider.inputValue(), '0', '零值位置应保存并恢复')
      await slider.fill('12')
      await modal.getByRole('button', { name: '取消', exact: true }).click()
      await checkGeometry(output, 'cancel-keeps-paper')
      const html = await captureSnapshot(page, 'measurement-labels')
      assert(html.includes('45±2 mm'))
      assert(!html.includes('移动距离文字'), '输出不能带入编辑按钮的标签')
      const pdfPage = await page.context().newPage()
      try {
        await pdfPage.setContent(html, { waitUntil: 'networkidle' })
        await pdfPage.emulateMedia({ media: 'print' })
        await pdfPage.evaluate(() => document.fonts.ready)
        await checkGeometry(
          pdfPage
            .locator('.erp-engineering-print-image-slot--annotated')
            .first(),
          'print-html'
        )
        await pdfPage.pdf({
          path: path.join(outputDir, 'measurement-labels.pdf'),
          preferCSSPageSize: true,
          printBackground: true,
        })
      } finally {
        await pdfPage.close()
      }
      await writeFile(
        path.join(outputDir, 'measurement-labels.json'),
        JSON.stringify(metrics, null, 2)
      )
    },
  }
}
