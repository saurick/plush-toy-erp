import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { businessModuleDefinitions } from '../../src/erp/config/businessModules.mjs'
import {
  assertTableHeaderControlsFit,
  assertTableSemanticAlignment,
} from './businessTableAssertions.mjs'

async function measureTables(page) {
  return page.evaluate(() => {
    const visible = (cell) => cell.getBoundingClientRect().height > 1
    const cells = [
      ...document.querySelectorAll('.app-table .ant-table-tbody > tr > td'),
    ].filter(visible)
    const headers = [
      ...document.querySelectorAll(
        '.app-table thead th, .erp-line-item-table th'
      ),
    ].filter(visible)
    const centerOffset = (parent, child) => {
      const outer = parent.getBoundingClientRect()
      const inner = child.getBoundingClientRect()
      return inner.x + inner.width / 2 - outer.x - outer.width / 2
    }
    return {
      overflow: document.documentElement.scrollWidth > innerWidth + 1,
      bodyAlignment: cells.map((cell) => ({
        text: cell.textContent.slice(0, 25),
        vertical: getComputedStyle(cell).verticalAlign,
      })),
      headers: headers.map((cell) => ({
        text: cell.textContent,
        align: getComputedStyle(cell).textAlign,
        expected: cell.dataset.columnAlign || null,
        vertical: getComputedStyle(cell).verticalAlign,
      })),
      labelOffsets: [
        ...document.querySelectorAll(
          '.app-table thead:not([aria-hidden="true"]) .erp-module-column-header-text'
        ),
      ].map((label) => ({
        text: label.textContent,
        left:
          label.getBoundingClientRect().left -
          label.closest('th').getBoundingClientRect().left,
        right:
          label.closest('th').getBoundingClientRect().right -
          label.getBoundingClientRect().right,
      })),
      copyOffsets: [
        ...document.querySelectorAll(
          '[data-align="center"] .erp-business-table-copyable-cell__content'
        ),
      ]
        .filter(visible)
        .map((content) => centerOffset(content.closest('td'), content)),
      material: [
        ...document.querySelectorAll(
          '#material-table .erp-material-sheet__table tr.ant-table-row'
        ),
      ].map((row) =>
        [...row.children].map((cell) => ({
          text: cell.textContent.trim(),
          align: getComputedStyle(cell).textAlign,
          vertical: getComputedStyle(cell).verticalAlign,
        }))
      ),
    }
  })
}

function assertCommonAlignment(evidence) {
  assert.equal(
    evidence.overflow,
    false,
    'table overflow must stay inside its scroll container'
  )
  assert(evidence.bodyAlignment.length > 0, 'expected a rendered table body')
  assert(evidence.headers.length > 0, 'expected rendered table headers')
  for (const cell of evidence.bodyAlignment) {
    assert.equal(cell.vertical, 'middle', cell.text)
  }
  for (const header of evidence.headers) {
    if (header.expected)
      assert.equal(header.align, header.expected, header.text)
    assert.equal(header.vertical, 'middle', header.text)
  }
  for (const label of evidence.labelOffsets) {
    assert(
      label.left >= 6 && label.right >= 6,
      `header label must stay inside its padded column: ${JSON.stringify(label)}`
    )
  }
  for (const offset of evidence.copyOffsets) {
    assert(Math.abs(offset) < 1, `copy control shifted text: ${offset}`)
  }
}

function assertAligned(evidence) {
  assertCommonAlignment(evidence)
  assert(evidence.bodyAlignment.length > 20, 'expected real table rows')
  assert.equal(evidence.material[0][1].text, '1')
  assert.equal(evidence.material[0][1].align, 'left')
  assert.equal(evidence.material[0][2].text, '黑色毛绒')
  assert.equal(evidence.material[0][2].align, 'left')
  assert.equal(evidence.material[0][4].align, 'left')
  assert.equal(evidence.material[0][5].align, 'left')
  assert.equal(evidence.material[0][6].align, 'right')
}

export function createTableAlignmentScenarios({
  outputDir,
  customerRuntimeEffectiveSession,
  gotoScenarioPath,
}) {
  const fixtures = ['light', 'dark', 'mobile'].map((mode) => ({
    name: `global-table-alignment-${mode}`,
    path: '/scripts/test/TableAlignmentFixture.html',
    viewport: { width: mode === 'mobile' ? 390 : 1440, height: 1000 },
    verify: async (page) => {
      await page.locator('#material-table tr[data-row-key="1:1"]').waitFor()
      if (mode === 'dark') await page.locator('#toggle-theme').click()
      if (mode === 'mobile') {
        await page.locator('#toggle-mobile').click()
        await page.getByText('整表对照', { exact: true }).click()
      }
      const materialSheet = page.locator('#material-table')
      const purchaseBasis = materialSheet.locator(
        '.erp-material-sheet__purchase-basis'
      )
      await purchaseBasis.waitFor()
      assert.match(
        await purchaseBasis.textContent(),
        /当前库存仅供参考，未自动抵扣/u
      )
      const calculationBasis = materialSheet.locator(
        '.erp-material-sheet__help'
      )
      assert.equal(await calculationBasis.getAttribute('open'), null)
      await calculationBasis.locator('summary').click()
      assert.notEqual(await calculationBasis.getAttribute('open'), null)
      assert.match(
        await calculationBasis.textContent(),
        /生产数量：订单数量加船头样数量/u
      )
      assert.match(
        await calculationBasis.textContent(),
        /提交审批时会冻结本次订单、BOM.*后续资料变更不会自动改写/u
      )
      const evidence = []
      evidence.push(await measureTables(page))
      assertAligned(evidence.at(-1))
      await assertTableSemanticAlignment(page.locator('#business-table'), {
        scenarioName: `global-table-alignment-${mode}`,
        expected: {
          材料编号: 'left',
          品名: 'left',
          单位: 'left',
          数量: 'right',
          状态: 'left',
          备注: 'left',
        },
      })
      await assertTableHeaderControlsFit(page, {
        scenarioName: `global-table-alignment-${mode}`,
      })
      const plainSort = page.locator('#plain-table th.ant-table-column-has-sorters')
      await plainSort.focus()
      assert(await plainSort.evaluate((node) => {
        const style = getComputedStyle(node)
        return node === document.activeElement && Number.parseFloat(style.outlineWidth) >= 2
      }), '表头键盘焦点必须清晰可见')
      await plainSort.press('Enter')
      assert.equal(await plainSort.getAttribute('aria-sort'), 'ascending')
      await plainSort.press('Enter')
      assert.equal(await plainSort.getAttribute('aria-sort'), 'descending')
      await plainSort.press('Enter')
      assert.equal(await plainSort.getAttribute('aria-sort'), null)
      const filter = page.locator('#plain-table thead .ant-table-filter-trigger')
      await filter.click()
      const filterPanel = page.locator('.ant-table-filter-dropdown')
      await filterPanel.getByRole('checkbox').first().check()
      await filterPanel.getByRole('button', { name: /^(OK|确\s*定)$/u }).click()
      assert.equal(await page.locator('#plain-table tr.ant-table-row').count(), 1)
      await filter.click()
      await filterPanel.getByRole('button', { name: /^(Reset|重\s*置)$/u }).click()
      await filterPanel.getByRole('button', { name: /^(OK|确\s*定)$/u }).click()
      assert.equal(await page.locator('#plain-table tr.ant-table-row').count(), 2)
      const firstRow = page.locator('#business-table tr[data-row-key="1"]')
      await firstRow.getByRole('checkbox').check()
      assert.equal(await page.locator('#selection-count').textContent(), '1')
      await firstRow
        .locator('.erp-business-table-copyable-cell')
        .first()
        .hover()
      await firstRow.getByRole('button', { name: '复制字段值' }).first().click()
      assert.equal(await page.locator('#selection-count').textContent(), '1')
      await firstRow.getByText('黑色毛绒', { exact: true }).dblclick()
      assert.equal(
        await page.locator('#opened-record').textContent(),
        'MAT-001'
      )

      const sorter = page.locator(
        '#business-table thead .ant-table-column-sorters'
      )
      if (mode === 'mobile') {
        await sorter.evaluate((node) => {
          const table = node.closest('.ant-table-container')
          const scroller = table.querySelector(
            '.ant-table-body, .ant-table-content'
          )
          const fixedRight = Math.max(
            ...[
              ...table.querySelectorAll('thead .ant-table-cell-fix-left'),
            ].map((cell) => cell.getBoundingClientRect().right)
          )
          scroller.scrollLeft +=
            node.closest('th').getBoundingClientRect().left - fixedRight - 8
        })
      }
      await sorter.click({ position: { x: 8, y: 10 } })
      await page.waitForFunction(
        () =>
          document
            .querySelector('#business-table th[aria-sort]')
            ?.getAttribute('aria-sort') === 'ascending'
      )
      await sorter.click({ position: { x: 8, y: 10 } })
      await page.waitForFunction(
        () =>
          document
            .querySelector('#business-table th[aria-sort]')
            ?.getAttribute('aria-sort') === 'descending'
      )
      assert.equal(
        await page
          .locator('#business-table .ant-table-row')
          .first()
          .getAttribute('data-row-key'),
        '2'
      )
      await page.getByRole('button', { name: '列设置', exact: true }).click()
      const columnPanel = page.getByRole('dialog', { name: /^列设置/u })
      await columnPanel.getByRole('button', { name: '单位 移到最前' }).click()
      await columnPanel.getByRole('button', { name: /^完\s*成$/u }).click()
      await columnPanel.waitFor({ state: 'hidden' })
      assert.equal(
        await page
          .locator('#business-table thead .erp-module-column-header-text')
          .first()
          .textContent(),
        '单位'
      )

      await page
        .locator('#material-table .ant-table-row-expand-icon')
        .first()
        .click()
      await page.locator('#material-table .erp-material-parts').waitFor()
      const expanded = await measureTables(page)
      assert(expanded.bodyAlignment.every((cell) => cell.vertical === 'middle'))
      await assertTableSemanticAlignment(page.locator('#material-table'), {
        scenarioName: `global-table-alignment-${mode}-parts`,
        tableSelector: '.erp-material-parts',
        expected: {
          '产品 / 订单行': 'left',
          BOM: 'left',
          部位: 'left',
          片数: 'right',
          单位用量: 'right',
          '加工 / 备注': 'left',
        },
      })
      await page
        .locator('#material-table .ant-table-row-expand-icon')
        .first()
        .click()
      await page
        .getByRole('textbox', { name: '编辑数量', exact: true })
        .fill('435')
      assert.equal(
        await page
          .getByRole('textbox', { name: '编辑数量', exact: true })
          .inputValue(),
        '435'
      )

      await page.locator('#toggle-empty').click()
      await page.getByText('暂无匹配记录', { exact: true }).waitFor()
      await page.locator('#toggle-empty').click()
      evidence.push(await measureTables(page))
      assertAligned(evidence.at(-1))
      await assertTableHeaderControlsFit(page, {
        scenarioName: `global-table-alignment-${mode}-restored`,
      })
      await writeFile(
        path.join(outputDir, `global-table-alignment-${mode}.json`),
        JSON.stringify(evidence, null, 2)
      )
      await page.locator('#material-table').screenshot({
        path: path.join(
          outputDir,
          `global-table-alignment-${mode}-material.png`
        ),
      })
    },
  }))
  return [
    ...fixtures,
    {
      name: 'global-table-alignment-business-pages',
      path: businessModuleDefinitions[0].path,
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 1000 },
      verify: async (page) => {
        const routes = [
          ...businessModuleDefinitions.map((module) => module.path),
          '/erp/master/products?catalog=product_skus',
          '/erp/warehouse/inventory?view=lots',
          '/erp/warehouse/inventory?view=txns',
        ]
        const evidence = []
        const failures = []
        for (const route of routes) {
          await gotoScenarioPath(page, route, { waitUntil: 'domcontentloaded' })
          await page.locator('.app-table .ant-table-tbody').first().waitFor()
          await page.waitForFunction(() =>
            [
              ...document.querySelectorAll(
                '.app-table .ant-table-tbody > tr > td'
              ),
            ].some((cell) => cell.getBoundingClientRect().height > 1)
          )
          const measurement = await measureTables(page)
          evidence.push({ route, ...measurement })
          if (route === '/erp/warehouse/inbound') {
            await page.screenshot({ path: path.join(outputDir, 'table-headers-inbound-light.png') })
          }
          try {
            assertCommonAlignment(measurement)
            await assertTableHeaderControlsFit(page, { scenarioName: route })
          } catch (error) {
            failures.push({ route, error: error.message })
          }
        }
        await writeFile(
          path.join(outputDir, 'global-table-alignment-business-pages.json'),
          JSON.stringify(evidence, null, 2)
        )
        assert.deepEqual(failures, [], 'business table alignment regressions')
      },
    },
  ]
}
