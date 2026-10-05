import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { createDevVersionCenterScenarios } from './devVersionCenterScenarios.mjs'

async function selectSegment(dialog, name, label) {
  const control = dialog.getByRole('radiogroup', { name })
  await control.getByText(label, { exact: true }).click()
  assert(
    await control.getByRole('radio', { name: label, exact: true }).isChecked()
  )
}

async function setTableLines(page, label) {
  const trigger = page.getByRole('button', { name: '外观与密度', exact: true })
  await trigger.click()
  const dialog = page.getByRole('dialog', { name: '外观与密度' })
  await selectSegment(dialog, '表格线条', label)
  await dialog.getByRole('button', { name: /^完\s*成$/u }).click()
  await dialog.waitFor({ state: 'hidden' })
  await waitForFiniteAnimations(page)
  assert(await trigger.evaluate((node) => node === document.activeElement))
}

async function measure(table) {
  return table.evaluate((node) => {
    const cells = [
      ...node.querySelectorAll('.ant-table-tbody > .ant-table-row > td'),
    ]
    return {
      text: cells.map((cell) => cell.textContent),
      cells: cells.map((cell) => ({
        width: cell.getBoundingClientRect().width,
        height: cell.getBoundingClientRect().height,
        verticalLine: getComputedStyle(cell).borderInlineEndWidth,
        lineColor: getComputedStyle(cell).borderInlineEndColor,
        isLast: cell === cell.parentElement.lastElementChild,
      })),
      summary: [...node.querySelectorAll('.ant-table-summary > tr > td')].map(
        (cell) => ({
          line: getComputedStyle(cell).borderInlineEndWidth,
          isLast: cell === cell.parentElement.lastElementChild,
        })
      ),
    }
  })
}

function assertGrid(metric) {
  assert(metric.cells.length > 0, '需要已渲染的数据单元格')
  for (const cell of metric.cells.filter((item) => !item.isLast)) {
    assert.equal(cell.verticalLine, '1px', '每个相邻数据列都有淡分隔线')
  }
  for (const cell of metric.summary.filter((item) => !item.isLast)) {
    assert.equal(cell.line, '1px', '合计行沿真实单元格边界分隔')
  }
}

async function assertLineSwitchMotion(dialog, reduced = false) {
  await dialog
    .page()
    .waitForFunction(
      () =>
        !document.querySelector(
          '.ant-modal[class*="-zoom-appear"], .ant-modal[class*="-zoom-enter"]'
        )
    )
  const control = dialog.getByRole('radiogroup', { name: '表格线条' })
  const result = await control.evaluate(async (root) => {
    const group = root.querySelector('.ant-segmented-group')
    const target = group.lastElementChild
    const box = root.getBoundingClientRect().toJSON()
    const read = () => {
      const css = getComputedStyle(group, '::before')
      return {
        x: new DOMMatrixReadOnly(
          css.transform === 'none' ? undefined : css.transform
        ).m41,
        duration: css.transitionDuration,
      }
    }
    const first = read()
    const samples = []
    target.click()
    const start = document.timeline.currentTime
    await new Promise((resolve) => {
      const frame = (now) => {
        samples.push(read().x)
        if (now - start < 500) requestAnimationFrame(frame)
        else resolve()
      }
      requestAnimationFrame(frame)
    })
    return {
      first,
      samples,
      final: read(),
      targetX: target.offsetLeft,
      mounted:
        group.isConnected &&
        root.querySelector('.ant-segmented-group') === group,
      before: box,
      after: root.getBoundingClientRect().toJSON(),
    }
  })
  assert(result.mounted, '切换时保留同一分段控件')
  assert.deepEqual(result.after, result.before, '切换不挤动控件')
  assert(Math.abs(result.final.x - result.targetX) < 1.5)
  if (reduced) {
    assert(
      result.final.duration
        .split(',')
        .every((duration) => Number.parseFloat(duration) === 0),
      '减少动态效果时所有过渡均关闭'
    )
  } else {
    assert(
      result.samples.some(
        (x) => x > result.first.x + 2 && x < result.targetX - 2
      ),
      '滑块有真实中间位置'
    )
  }
}

export function createTableLinesScenarios(deps) {
  const { outputDir, customerRuntimeEffectiveSession } = deps
  const fixtures = ['light', 'dark'].map((themeMode) => ({
    name: `table-lines-fixture-${themeMode}`,
    path: '/scripts/test/TableAlignmentFixture.html',
    themeMode,
    viewport: { width: 960, height: 1000 },
    verify: async (page) => {
      const business = page.locator('#business-table .app-table')
      const plain = page.locator('#plain-table .app-table')
      await business.locator('tr[data-row-key="1"]').waitFor()
      assert.equal(
        await page.locator('html').getAttribute('data-erp-table-lines'),
        'simple'
      )
      const before = await measure(business)
      const nativeBefore = await page
        .locator('#native-table')
        .evaluate((node) => node.innerHTML)
      const borderedBefore = await measure(
        page.locator('#material-table .app-table')
      )
      assert(before.cells.every((cell) => cell.verticalLine === '0px'))

      await page
        .getByRole('button', { name: '外观与密度', exact: true })
        .click()
      const dialog = page.getByRole('dialog', { name: '外观与密度' })
      await waitForFiniteAnimations(page)
      await assertLineSwitchMotion(dialog)
      await dialog.press('Escape')
      await dialog.waitFor({ state: 'hidden' })
      await waitForFiniteAnimations(page)
      const grid = await measure(business)
      assertGrid(grid)
      assertGrid(await measure(plain))
      assert.deepEqual(
        await measure(page.locator('#material-table .app-table')),
        borderedBefore,
        '网格偏好保留专用表格自身边框'
      )
      assert.deepEqual(grid.text, before.text, '线条切换保留长文本与数值')
      assert.deepEqual(
        grid.cells.map(({ width, height }) => [width, height]),
        before.cells.map(({ width, height }) => [width, height]),
        '线条不改变列宽与行高'
      )
      await business
        .locator('tr[data-row-key="1"]')
        .getByRole('checkbox')
        .check()
      await business.locator('tr[data-row-key="1"]').hover()
      assertGrid(await measure(business))
      assert.equal(await page.locator('#selection-count').textContent(), '1')

      await plain.locator('.ant-table-row-expand-icon').first().click()
      const expandedCell = plain.locator('.ant-table-expanded-row > td')
      await expandedCell.waitFor()
      assert.equal(
        await expandedCell.evaluate(
          (node) => getComputedStyle(node).borderInlineEndWidth
        ),
        '0px',
        '展开说明不增加虚构列线'
      )
      const scroll = business
        .locator('.ant-table-body, .ant-table-content')
        .first()
      const fixed = business.locator('tbody .ant-table-cell-fix-left').first()
      const fixedBefore = await fixed.boundingBox()
      await scroll.evaluate((node) => {
        node.scrollLeft = 240
      })
      assert(await scroll.evaluate((node) => node.scrollLeft > 0))
      assert(Math.abs((await fixed.boundingBox()).x - fixedBefore.x) < 1)
      assertGrid(await measure(business))
      assert.equal(
        await page.locator('#native-table').evaluate((node) => node.innerHTML),
        nativeBefore,
        '编辑明细沿用自身版式'
      )
      await page.emulateMedia({ media: 'print' })
      assert(
        (await measure(business)).cells.every(
          (cell) => cell.verticalLine === '0px'
        ),
        '屏幕网格偏好不进入纸面'
      )
      await page.emulateMedia({ media: 'screen' })

      await page.reload()
      await business.locator('tr[data-row-key="1"]').waitFor()
      assert.equal(
        await page.locator('html').getAttribute('data-erp-table-lines'),
        'grid'
      )
      assertGrid(await measure(business))
      await setTableLines(page, '简洁')
      assert.deepEqual(await measure(business), before, '关闭网格恢复原样式')
      assert.deepEqual(
        await measure(page.locator('#material-table .app-table')),
        borderedBefore,
        '已有边框表格保留原样式'
      )
      await page.locator('#toggle-empty').click()
      await business.getByText('暂无匹配记录', { exact: true }).waitFor()
      await setTableLines(page, '网格')
      assert.equal(
        await business
          .locator('.ant-table-placeholder > td')
          .evaluate((node) => getComputedStyle(node).borderInlineEndWidth),
        '0px'
      )
      await page.locator('#toggle-empty').click()
      assertGrid(await measure(business))
      await setTableLines(page, '简洁')
      await page.emulateMedia({ reducedMotion: 'reduce' })
      await page
        .getByRole('button', { name: '外观与密度', exact: true })
        .click()
      await assertLineSwitchMotion(dialog, true)
      await dialog.getByRole('button', { name: /^完\s*成$/u }).click()
      await writeFile(
        path.join(outputDir, `table-lines-${themeMode}-metrics.json`),
        JSON.stringify({ before, grid }, null, 2)
      )
    },
  }))
  const version = createDevVersionCenterScenarios(deps)[0]
  return [
    ...fixtures,
    {
      name: 'table-lines-business',
      path: '/erp/sales/project-orders/sales-orders',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      themeMode: 'light',
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      verify: async (page) => {
        const table = page
          .locator('.erp-business-data-table-card .app-table')
          .first()
        await table.locator('.ant-table-row').first().waitFor()
        await setTableLines(page, '网格')
        for (const label of ['暗色', '浅色']) {
          await page
            .getByRole('button', { name: '外观与密度', exact: true })
            .click()
          const dialog = page.getByRole('dialog', { name: '外观与密度' })
          await selectSegment(dialog, '主题模式', label)
          await dialog
            .getByRole('button', { name: '粉色', exact: true })
            .click()
          await dialog.getByRole('button', { name: /^完\s*成$/u }).click()
          await dialog.waitFor({ state: 'hidden' })
          await waitForFiniteAnimations(page)
          assertGrid(await measure(table))
          await page.screenshot({
            path: path.join(
              outputDir,
              `table-lines-sales-${label === '暗色' ? 'dark' : 'light'}-4k.png`
            ),
          })
        }
        await page
          .getByRole('button', { name: '外观与密度', exact: true })
          .click()
        const dialog = page.getByRole('dialog', { name: '外观与密度' })
        await selectSegment(dialog, '表格密度', '紧凑')
        await dialog.getByRole('button', { name: /^完\s*成$/u }).click()
        await page.reload()
        await table.locator('.ant-table-row').first().waitFor()
        assertGrid(await measure(table))
        assert.equal(
          await page.locator('html').getAttribute('data-erp-density'),
          'compact'
        )
        assert.equal(
          await page.locator('html').getAttribute('data-erp-accent'),
          'pink'
        )
        await page
          .getByRole('button', { name: '外观与密度', exact: true })
          .click()
        await dialog.waitFor()
        await waitForFiniteAnimations(page)
        assert(
          await dialog
            .getByRole('radio', { name: '网格', exact: true })
            .isChecked()
        )
        await page.screenshot({
          path: path.join(outputDir, 'table-lines-settings-4k.png'),
        })
        await dialog.screenshot({
          path: path.join(outputDir, 'table-lines-settings-detail.png'),
        })
        await selectSegment(dialog, '表格密度', '标准')
        await selectSegment(dialog, '表格线条', '简洁')
        await dialog.getByRole('button', { name: '蓝色', exact: true }).click()
        await dialog.getByRole('button', { name: /^完\s*成$/u }).click()
        await dialog.waitFor({ state: 'hidden' })
        await waitForFiniteAnimations(page)
        assert(
          (await measure(table)).cells.every(
            (cell) => cell.verticalLine === '0px'
          )
        )
      },
    },
    {
      ...version,
      name: 'table-lines-dev-versions',
      themeMode: 'light',
      verify: async (page) => {
        const table = page
          .locator('.erp-dev-version-workspace .app-table')
          .first()
        await table.locator('.ant-table-row').first().waitFor()
        const before = await measure(table)
        await setTableLines(page, '网格')
        assertGrid(await measure(table))
        await setTableLines(page, '简洁')
        assert.deepEqual(await measure(table), before)
      },
    },
  ]
}
