import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import path from 'node:path'
import { openBusinessTableTool } from './businessTableTools.mjs'
import { businessModuleDefinitions } from '../../src/erp/config/businessModules.mjs'
import { assertLineItemGrouping } from './lineItemGroupingAssertions.mjs'
import { assertVisibleBusinessFormControlHeight } from './inputControlAssertions.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'
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
      overflowElements: document.documentElement.scrollWidth > innerWidth + 1 ? [...document.querySelectorAll('body *')].filter((node) => node.getBoundingClientRect().right > innerWidth + 1 && !node.closest('.ant-table-body, .ant-table-content')).slice(0, 10).map((node) => ({ tag: node.tagName, id: node.id, className: typeof node.className === 'string' ? node.className : '', width: node.getBoundingClientRect().width, right: node.getBoundingClientRect().right, overflowX: getComputedStyle(node).overflowX })) : [],
      selectionColumns: [
        ...document.querySelectorAll('.app-table .ant-table-selection-column'),
      ].filter(visible).map((cell) => {
        const control = cell.querySelector('.ant-radio-inner, .ant-checkbox-inner')
        return {
          tag: cell.tagName,
          width: cell.getBoundingClientRect().width,
          controlOffset: control ? centerOffset(cell, control) : null,
        }
      }),
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
    `table overflow must stay inside its scroll container: ${JSON.stringify(evidence.overflowElements)}`
  )
  assert(evidence.bodyAlignment.length > 0, 'expected a rendered table body')
  assert(evidence.headers.length > 0, 'expected rendered table headers')
  for (const cell of evidence.selectionColumns) {
    assert(Math.abs(cell.width - 52) <= 1, `行选择列应保持 52px: ${JSON.stringify(cell)}`)
    if (cell.controlOffset !== null) {
      assert(Math.abs(cell.controlOffset) <= 1, `选择控件应居中: ${JSON.stringify(cell)}`)
    }
  }
  for (const cell of evidence.bodyAlignment) {
    assert.equal(cell.vertical, 'middle', cell.text)
  }
  for (const header of evidence.headers) {
    if (header.expected) {
      assert.equal(header.align, header.expected, header.text)
    }
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
  assertLineItemsUnifiedHorizontalScroll,
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
        /自动送审时会冻结本次订单、BOM.*后续资料变更不会自动改写/u
      )
      const evidence = []
      evidence.push(await measureTables(page))
      assertAligned(evidence.at(-1))
      assert(evidence.at(-1).selectionColumns.length >= 6, '需要单选、多选的表头与正文尺寸')
      if (mode === 'light') {
        for (const width of [1920, 768, 1440]) {
          await page.setViewportSize({ width, height: 1000 })
          await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))))
          evidence.push(await measureTables(page))
          assertAligned(evidence.at(-1))
        }
      }
      const radio = page.locator('#selection-table tr[data-row-key="1"]').getByRole('radio')
      await radio.focus()
      await radio.press('Space')
      assert.equal(await page.locator('#radio-selection-count').textContent(), '1')
      assert(await page.locator('#selection-table tr[data-row-key="2"]').getByRole('radio').isDisabled())
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
      await openBusinessTableTool(page, '列设置')
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
      assertCommonAlignment(await measureTables(page))
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
  const groupingFixtures = ['light', 'dark', 'narrow'].map((mode) => ({
    name: `business-line-grouping-${mode}`,
    path: '/scripts/test/TableAlignmentFixture.html',
    viewport: { width: mode === 'narrow' ? 390 : 1440, height: 1000 },
    verify: async (page) => {
      await page.locator('#native-table .erp-editable-line-group').last().waitFor()
      if (mode === 'dark') await page.locator('#toggle-theme').click()
      const evidence = {
        document: await assertLineItemGrouping(page.locator('#native-table')),
        compact: await assertLineItemGrouping(page.locator('#compact-table')),
      }
      await page.getByRole('button', { name: '复制联系人条目 1', exact: true }).click()
      evidence.contacts = await assertLineItemGrouping(page.locator('#contact-table'))
      await page.getByRole('button', { name: '移除联系人条目 2', exact: true }).click()
      assert.equal(await page.locator('#contact-table .erp-editable-line-group').count(), 1)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false, '明细溢出应保持在自身滚动区内')
      await writeFile(
        path.join(outputDir, `business-line-grouping-${mode}.json`),
        JSON.stringify(evidence, null, 2)
      )
      for (const table of ['native', 'compact', 'contact']) {
        await page.locator(`#${table}-table`).screenshot({
          path: path.join(outputDir, `business-line-grouping-${mode}-${table}.png`),
        })
      }
    },
  }))
  const groupedDocuments = [
    ['purchase', '/erp/purchase/accessories', '新建采购订单', '添加采购明细'],
    ['sales', '/erp/sales/project-orders/sales-orders', '新建订单', '添加订货明细'],
    ['outsourcing', '/erp/purchase/processing-contracts', '新建加工合同', '添加加工明细'],
    ['shipment', '/erp/warehouse/shipments', '新建出货单', '添加出货明细'],
    ['production', '/erp/production/orders', '新建生产订单', '添加生产明细'],
  ].map(([kind, route, trigger, addLabel]) => ({
    name: `business-line-grouping-${kind}`,
    path: route,
    auth: 'admin',
    effectiveSession: {
      ...customerRuntimeEffectiveSession,
      pages: [...customerRuntimeEffectiveSession.pages, 'production-orders'],
    },
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    verify: async (page) => {
      await page.getByRole('button', { name: trigger }).click()
      const editor = page.locator('.erp-business-form-page:not([hidden])')
      const table = editor.locator(kind === 'production' ? '.erp-compact-field-table' : '.erp-sales-order-lines-form__list')
      const groups = table.locator('.erp-editable-line-group')
      await editor.waitFor()
      for (let count = await groups.count(); count < 2; count += 1) {
        await editor.getByRole('button', { name: addLabel, exact: true }).first().click()
        await groups.nth(count).waitFor()
      }
      await assertLineItemGrouping(table)
      await groups.nth(1).getByRole('textbox').last().fill('保留第二条明细备注')
      await groups.first().getByRole('button', { name: /移除/u }).click()
      assert.equal(await groups.count(), 1)
      assert.equal(await groups.first().getByRole('textbox').last().inputValue(), '保留第二条明细备注', '移除后保留原条目的输入与归属')
      assert.equal(await groups.first().locator('.erp-editable-line-group__number').textContent(), '1')
      await editor.getByRole('button', { name: addLabel, exact: true }).first().click()
      await page.setViewportSize({ width: 720, height: 1000 })
      if (kind === 'purchase') {
        await assertLineItemsUnifiedHorizontalScroll(editor, {
          scenarioName: 'business-line-grouping-purchase',
          minRows: 2,
        })
      }
      await assertLineItemGrouping(table)
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1), false)
      await page.setViewportSize({ width: 1920, height: 1080 })
      await groups.nth(1).getByRole('textbox').last().fill('这条备注与上方主字段属于同一条明细。')
      await table.screenshot({ path: path.join(outputDir, `business-line-grouping-${kind}-items.png`) })
    },
  }))
  return [
    ...fixtures,
    {
      name: 'business-textarea-height-responsive',
      path: '/scripts/test/TableAlignmentFixture.html',
      viewport: { width: 390, height: 1000 },
      deviceScaleFactor: 2,
      verify: async (page) => {
        const stage = page.locator('#textarea-controls')
        await stage.waitFor()
        await page.locator('#contact-table').screenshot({ path: path.join(outputDir, 'textarea-contact-default.png') })
        await stage.screenshot({ path: path.join(outputDir, 'textarea-minimum-rows.png') })
        const evidence = []
        const measure = async (state) => {
          await waitForFiniteAnimations(page)
          await assertVisibleBusinessFormControlHeight(page, `文本域-${state}`)
          const metrics = await stage.locator('textarea').evaluateAll((nodes) => nodes.map((node) => {
            const style = getComputedStyle(node)
            const owner = node.closest('.ant-input-textarea-affix-wrapper') || node
            return {
              label: node.getAttribute('aria-label'),
              value: node.value,
              height: owner.getBoundingClientRect().height,
              lineHeight: style.lineHeight,
              padding: style.padding,
              overflow: node.scrollHeight - node.clientHeight,
              disabled: node.disabled,
              readOnly: node.readOnly,
            }
          }))
          assert.equal(metrics.length, 9)
          assert(metrics.every((item) => item.overflow <= 1), JSON.stringify(metrics))
          evidence.push({ state, viewport: page.viewportSize(), metrics })
          return metrics
        }
        const initial = await measure('手机初始')
        const longValue = '包装要求与分批安排，每项都应完整显示。\n'.repeat(8)
        for (const label of ['plain-1', 'clear-2', 'count-3']) {
          const control = stage.getByRole('textbox', { name: label, exact: true })
          const original = initial.find((item) => item.label === label)
          await control.fill(longValue)
          const expanded = await measure(`${label}-长文本`)
          assert(expanded.find((item) => item.label === label).height > original.height)
          await control.fill('短说明')
          const shortened = await measure(`${label}-改短`)
          assert(Math.abs(shortened.find((item) => item.label === label).height - original.height) <= 1)
          if (label.startsWith('plain')) await control.fill('')
          else await control.locator('..').getByRole('button', { name: 'close-circle', exact: true }).click()
          assert.equal(await control.inputValue(), '')
          await measure(`${label}-清空`)
        }
        await stage.getByRole('textbox', { name: 'count-2', exact: true }).fill('切换状态保留这段说明')
        for (const [state, disabled, readOnly] of [['只读', false, true], ['禁用', true, false], ['可编辑', false, false]]) {
          await page.locator('#textarea-state-toggle').click()
          assert.equal(await page.locator('#textarea-state').textContent(), state)
          const metrics = await measure(state)
          assert(metrics.every((item) => item.disabled === disabled && item.readOnly === readOnly))
          assert.equal(metrics.find((item) => item.label === 'count-2').value, '切换状态保留这段说明')
          assert.equal(await stage.locator('.ant-input-data-count').count(), state === '可编辑' ? 3 : 0)
        }
        await stage.getByRole('textbox', { name: 'count-2', exact: true }).fill('')
        await page.locator('#textarea-placeholder-toggle').click()
        await measure('多行提示')
        await page.locator('#textarea-placeholder-toggle').click()
        await measure('提示清空')
        for (const width of [360, 768, 1440, 390]) {
          await page.setViewportSize({ width, height: 1000 })
          await measure(`屏宽-${width}`)
        }
        await page.locator('#toggle-theme').click()
        await measure('手机深色')
        await stage.screenshot({ path: path.join(outputDir, 'textarea-mobile-dark.png') })
        await page.locator('#toggle-theme').click()
        await measure('手机浅色恢复')
        await stage.screenshot({ path: path.join(outputDir, 'textarea-mobile-light.png') })
        await writeFile(path.join(outputDir, 'business-textarea-height-responsive.json'), JSON.stringify(evidence, null, 2))
      },
    },
    ...groupingFixtures,
    ...groupedDocuments,
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
