import assert from 'node:assert/strict'

export async function assertTableSemanticAlignment(
  scope,
  { scenarioName, expected, tableSelector = '.app-table' }
) {
  const evidence = await scope.evaluate(
    (root, { expectedTitles, tableSelector }) => {
      const visible = (node) => node.getBoundingClientRect().height > 1
      const normalize = (value) =>
        String(value || '')
          .replace(/\s+/g, ' ')
          .trim()
      const table = [...root.querySelectorAll(tableSelector)].find(
        (candidate) =>
          visible(candidate) &&
          [
            ...candidate.querySelectorAll(
              '.ant-table-tbody > tr.ant-table-row'
            ),
          ].some(visible)
      )
      if (!table) return { tableFound: false, columns: [] }

      const headers = [
        ...table.querySelectorAll('.ant-table-thead > tr > th'),
      ].filter(visible)
      const row = [
        ...table.querySelectorAll('.ant-table-tbody > tr.ant-table-row'),
      ].find(visible)
      const cells = [...(row?.children || [])].filter(
        (cell) => cell.tagName === 'TD'
      )

      return {
        tableFound: true,
        columns: expectedTitles.map((title) => {
          const index = headers.findIndex(
            (header) => normalize(header.textContent) === title
          )
          const header = headers[index]
          const cell = cells[index]
          return {
            title,
            found: Boolean(header && cell),
            headerAlign: header ? getComputedStyle(header).textAlign : null,
            headerVertical: header
              ? getComputedStyle(header).verticalAlign
              : null,
            bodyAlign: cell ? getComputedStyle(cell).textAlign : null,
            bodyVertical: cell ? getComputedStyle(cell).verticalAlign : null,
          }
        }),
      }
    },
    { expectedTitles: Object.keys(expected), tableSelector }
  )

  assert(
    evidence.tableFound,
    `${scenarioName} 未找到可检查的业务表格: ${JSON.stringify(evidence)}`
  )
  for (const column of evidence.columns) {
    assert(
      column.found,
      `${scenarioName} 未找到表格列 ${column.title}: ${JSON.stringify(evidence)}`
    )
    assert.equal(
      column.headerAlign,
      expected[column.title],
      `${scenarioName} ${column.title} 表头应沿对应字段对齐`
    )
    assert.equal(
      column.headerVertical,
      'middle',
      `${scenarioName} ${column.title} 表头应垂直居中`
    )
    assert.equal(
      column.bodyAlign,
      expected[column.title],
      `${scenarioName} ${column.title} 正文对齐不符合字段语义`
    )
    assert.equal(
      column.bodyVertical,
      'middle',
      `${scenarioName} ${column.title} 正文应垂直居中`
    )
  }
}

export async function assertTableHeaderControlsFit(
  page,
  { scenarioName, tableSelector = '.app-table' }
) {
  const controls = await page.locator(tableSelector).evaluateAll((tables) =>
    tables.flatMap((table) =>
      [...table.querySelectorAll('thead th')].flatMap((cell) => {
        const outer = cell.getBoundingClientRect()
        if (outer.height < 1) return []
        return [
          ...cell.querySelectorAll(
            '.ant-table-column-sorter'
          ),
        ].map((control) => {
          const inner = control.getBoundingClientRect()
          return {
            header:
              cell.querySelector('.erp-module-column-header-text')
                ?.textContent || cell.textContent,
            control: control.getAttribute('aria-label') || '排序图标',
            width: inner.width,
            height: inner.height,
            gaps: [
              inner.left - outer.left,
              outer.right - inner.right,
              inner.top - outer.top,
              outer.bottom - inner.bottom,
            ],
          }
        })
      })
    )
  )
  assert.deepEqual(
    controls.filter(
      (control) =>
        control.width < 1 ||
        control.height < 1 ||
        control.gaps.some((gap) => gap < -1)
    ),
    [],
    `${scenarioName} 表头按钮应完整位于所属单元格内，不能越界或被相邻列遮挡`
  )
  const headers = await page.locator(tableSelector).evaluateAll((tables) =>
    tables.flatMap((table) =>
      [...table.querySelectorAll('thead:not([aria-hidden="true"]) th')]
        .filter((cell) => cell.getBoundingClientRect().height > 1)
        .map((cell) => {
          const style = getComputedStyle(cell)
          const label = cell.querySelector('.erp-module-column-header-text, .ant-table-column-title')
          const sorter = cell.querySelector('.ant-table-column-sorter')
          return {
            label: cell.textContent,
            height: cell.getBoundingClientRect().height,
            split: cell.nextElementSibling
              ? Number.parseFloat(style.borderInlineEndWidth) >= 1 &&
                style.borderInlineEndStyle === 'solid' &&
                style.borderInlineEndColor !== style.backgroundColor
              : true,
            clipped: label ? label.scrollWidth > label.clientWidth + 1 : false,
            sorterGap: label && sorter
              ? sorter.getBoundingClientRect().left - label.getBoundingClientRect().right
              : null,
          }
        })
    )
  )
  assert(headers.length > 0, `${scenarioName} 应有可读表头`)
  assert.deepEqual(
    headers.filter((header) => !header.split || header.clipped || header.height < 39 ||
      (header.sorterGap !== null && (header.sorterGap < 3 || header.sorterGap > 8))),
    [],
    `${scenarioName} 字段边界应清楚，列名完整显示，排序紧邻所属列名`
  )
}

async function assertBusinessMainTableHasNoOperationColumn(
  page,
  { scenarioName }
) {
  const metrics = await page.evaluate(() => {
    const tableCard = document.querySelector('.erp-business-data-table-card')
    const headers = tableCard
      ? Array.from(tableCard.querySelectorAll('.ant-table-thead th')).map(
          (node) =>
            String(node.textContent || '')
              .replace(/\s+/g, ' ')
              .trim()
        )
      : []
    return { headers }
  })

  assert(
    metrics.headers.length > 0,
    `${scenarioName} 未找到业务主表表头: ${JSON.stringify(metrics)}`
  )
  assert(
    !metrics.headers.includes('操作'),
    `${scenarioName} 业务主表不应再出现操作列: ${JSON.stringify(metrics)}`
  )
}

async function assertBusinessMainTableInitialSelectionEmpty(
  page,
  { scenarioName }
) {
  const metrics = await page.evaluate(() => {
    const tableCard = document.querySelector('.erp-business-data-table-card')
    const dataRows = Array.from(
      tableCard?.querySelectorAll('.ant-table-tbody > tr.ant-table-row') || []
    )
    const checkedInputs = Array.from(
      tableCard?.querySelectorAll('.ant-table-selection-column input') || []
    ).filter((input) => input.checked)
    const checkedWrappers = Array.from(
      tableCard?.querySelectorAll(
        '.ant-table-selection-column .ant-checkbox-wrapper-checked, .ant-table-selection-column .ant-radio-wrapper-checked'
      ) || []
    )
    const selectedRows = dataRows.filter((row) =>
      row.classList.contains('ant-table-row-selected')
    )
    const actionBar = document.querySelector(
      '.erp-business-module-current-action'
    )
    return {
      hasTable: Boolean(tableCard),
      dataRowCount: dataRows.length,
      checkedInputCount: checkedInputs.length,
      checkedWrapperCount: checkedWrappers.length,
      selectedRowCount: selectedRows.length,
      actionText: actionBar?.textContent?.replace(/\s+/g, ' ').trim() || '',
      actionHasEmptyClass:
        actionBar?.classList.contains(
          'erp-business-selection-action-bar--empty'
        ) || false,
      actionHasActiveClass:
        actionBar?.classList.contains(
          'erp-business-selection-action-bar--active'
        ) || false,
    }
  })

  assert(
    metrics.hasTable && metrics.dataRowCount > 0,
    `${scenarioName} 业务主表应已有可检查的数据行: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    metrics.checkedInputCount,
    0,
    `${scenarioName} 初始进入不应默认勾选业务记录: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    metrics.checkedWrapperCount,
    0,
    `${scenarioName} 初始进入不应残留选中控件样式: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    metrics.selectedRowCount,
    0,
    `${scenarioName} 初始进入不应默认高亮业务记录: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.actionHasEmptyClass && !metrics.actionHasActiveClass,
    `${scenarioName} 初始当前操作区应为空选择态: ${JSON.stringify(metrics)}`
  )
}

async function assertBusinessMainTableSortableColumns(
  page,
  { scenarioName, unsortableHeaders = [] }
) {
  await assertTableHeaderControlsFit(page, { scenarioName })
  await page.mouse.move(0, 0)
  await page.waitForTimeout(220)
  const metrics = await page.evaluate(() => {
    const tableCard = document.querySelector('.erp-business-data-table-card')
    const headers = tableCard
      ? Array.from(tableCard.querySelectorAll('.ant-table-thead th')).map(
          (node) => ({
            text: String(node.textContent || '')
              .replace(/\s+/g, ' ')
              .trim(),
            isSelectionColumn: node.classList.contains(
              'ant-table-selection-column'
            ),
            isExpandColumn: node.classList.contains(
              'ant-table-row-expand-icon-cell'
            ),
            hasSelectionControl: Boolean(
              node.querySelector(
                '.ant-checkbox, .ant-radio, input[type="checkbox"], input[type="radio"]'
              )
            ),
            whiteSpace: window.getComputedStyle(node).whiteSpace,
            verticalAlign: window.getComputedStyle(node).verticalAlign,
            textAlign: window.getComputedStyle(node).textAlign,
            hasSorter: Boolean(
              node.querySelector(
                '.ant-table-column-sorters, .ant-table-column-sorter'
              )
            ),
            sorterAlignItems:
              node.querySelector('.ant-table-column-sorters') &&
              window.getComputedStyle(
                node.querySelector('.ant-table-column-sorters')
              ).alignItems,
          })
        )
      : []
    const columnHeaderTexts = tableCard
      ? Array.from(
          tableCard.querySelectorAll(
            '.ant-table-thead th .erp-module-column-header-text'
          )
        ).map((node) => {
          const style = window.getComputedStyle(node)
          const textRect = node.getBoundingClientRect()
          const cellRect = node.closest('th').getBoundingClientRect()
          const sorterRect = node
            .closest('.ant-table-column-sorters')
            ?.querySelector('.ant-table-column-sorter')
            ?.getBoundingClientRect()
          return {
            text: String(node.textContent || '')
              .replace(/\s+/g, ' ')
              .trim(),
            centerOffset:
              textRect.x + textRect.width / 2 - cellRect.x - cellRect.width / 2,
            clientWidth: node.clientWidth,
            scrollWidth: node.scrollWidth,
            textOverflow: style.textOverflow,
            overflow: style.overflow,
            whiteSpace: style.whiteSpace,
            sorterGap: sorterRect ? sorterRect.left - textRect.right : null,
            outsideCell: textRect.left < cellRect.left || textRect.right > cellRect.right,

          }
        })
      : []
    const ellipsisCells = tableCard
      ? Array.from(tableCard.querySelectorAll('.ant-table-cell-ellipsis')).map(
          (node) =>
            String(node.textContent || '')
              .replace(/\s+/g, ' ')
              .trim()
        )
      : []
    const currentAction = document.querySelector(
      '.erp-business-module-current-action'
    )
    return {
      headers,
      columnHeaderTexts,
      ellipsisCells,
      hasCurrentAction: Boolean(currentAction),
    }
  })
  const selectionHeaders = metrics.headers.filter(
    (header) => header.isSelectionColumn
  )
  const selectionHeadersWithChoiceText = selectionHeaders.filter(
    (header) => header.text === '选择'
  )
  const skippedHeaders = new Set(unsortableHeaders)
  const sortableHeaders = metrics.headers.filter(
    (header) =>
      header.text &&
      !header.isSelectionColumn &&
      !header.isExpandColumn &&
      !skippedHeaders.has(header.text)
  )
  const missingSorters = sortableHeaders.filter((header) => !header.hasSorter)
  const unstableHeaders = sortableHeaders.filter(
    (header) =>
      header.whiteSpace !== 'nowrap' ||
      header.verticalAlign !== 'middle' ||
      !['left', 'right', 'center'].includes(header.textAlign)
  )
  const unstableSorters = sortableHeaders.filter(
    (header) => header.hasSorter && header.sorterAlignItems !== 'center'
  )
  const ellipsisHeaderTexts = metrics.columnHeaderTexts.filter(
    (node) =>
      node.text &&
      (node.textOverflow === 'ellipsis' ||
        node.overflow === 'hidden' ||
        node.scrollWidth > node.clientWidth + 1)
  )
  const wrappedHeaderTexts = metrics.columnHeaderTexts.filter(
    (node) => node.text && node.whiteSpace !== 'nowrap'
  )
  const overlappingHeaderTexts = metrics.columnHeaderTexts.filter(
    (node) => node.outsideCell || (node.sorterGap !== null && node.sorterGap < 3)
  )

  assert(
    sortableHeaders.length > 0,
    `${scenarioName} 未找到可排序业务主表列: ${JSON.stringify(metrics)}`
  )
  if (metrics.hasCurrentAction) {
    assert(
      selectionHeaders.length > 0,
      `${scenarioName} 当前操作业务主表应保留选择列: ${JSON.stringify(metrics)}`
    )
    assert.deepEqual(
      selectionHeadersWithChoiceText,
      [],
      `${scenarioName} 选择控制列不应显示“选择”二字: ${JSON.stringify(metrics)}`
    )
  }
  assert.deepEqual(
    missingSorters,
    [],
    `${scenarioName} 业务主表数据列缺少排序入口: ${JSON.stringify(metrics)}`
  )
  assert.deepEqual(
    unstableHeaders,
    [],
    `${scenarioName} 业务主表表头应统一单行、垂直居中: ${JSON.stringify(metrics)}`
  )
  assert.deepEqual(
    unstableSorters,
    [],
    `${scenarioName} 业务主表排序控件应与标题垂直居中: ${JSON.stringify(metrics)}`
  )
  assert.deepEqual(
    wrappedHeaderTexts,
    [],
    `${scenarioName} 业务主表列标题文字应保持单行: ${JSON.stringify(metrics)}`
  )
  assert.deepEqual(
    overlappingHeaderTexts,
    [],
    `${scenarioName} 业务主表列名和排序应清楚分开且完整位于所属列内: ${JSON.stringify(metrics)}`
  )
  assert.deepEqual(
    ellipsisHeaderTexts,
    [],
    `${scenarioName} 业务主表列标题不应再省略或裁切: ${JSON.stringify(metrics)}`
  )
  assert.deepEqual(
    metrics.ellipsisCells,
    [],
    `${scenarioName} 业务主表数据列不应使用 AntD 省略单元格: ${JSON.stringify(metrics)}`
  )
}

async function assertBusinessHeaderHasNoSectionTitle(page, { scenarioName }) {
  const metrics = await page.evaluate(() => {
    const isVisible = (node) => {
      if (!(node instanceof HTMLElement)) return false
      const rect = node.getBoundingClientRect()
      const style = window.getComputedStyle(node)
      return (
        rect.width > 0 &&
        rect.height > 0 &&
        style.display !== 'none' &&
        style.visibility !== 'hidden'
      )
    }
    const header = document.querySelector('.erp-business-page-header-card')
    const directSectionLabels = header
      ? Array.from(
          header.querySelectorAll(
            '.erp-business-page-header-card__main > div > .ant-typography'
          )
        )
          .filter(isVisible)
          .map((node) =>
            String(node.textContent || '')
              .replace(/\s+/g, ' ')
              .trim()
          )
      : []
    const forbiddenLabels = ['基础资料', '销售链路', '正式业务入口']
    const forbiddenLabelsInHeader = header
      ? Array.from(header.querySelectorAll('*'))
          .filter(
            (node) =>
              isVisible(node) &&
              node.children.length === 0 &&
              !node.closest('h1') &&
              forbiddenLabels.includes(
                String(node.textContent || '')
                  .replace(/\s+/g, ' ')
                  .trim()
              )
          )
          .map((node) =>
            String(node.textContent || '')
              .replace(/\s+/g, ' ')
              .trim()
          )
      : []

    return {
      hasHeader: Boolean(header),
      directSectionLabels,
      forbiddenLabelsInHeader,
    }
  })

  assert(
    metrics.hasHeader,
    `${scenarioName} 缺少业务页头部卡片: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    metrics.directSectionLabels.length,
    0,
    `${scenarioName} 业务页头部不应显示分组小标题: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    metrics.forbiddenLabelsInHeader.length,
    0,
    `${scenarioName} 业务页头部仍出现重复分组文案: ${JSON.stringify(metrics)}`
  )
}

async function assertBusinessHeaderCompact(page, { scenarioName }) {
  await page.locator('.erp-business-page-header-card').first().waitFor()
  const metrics = await page.evaluate(() => {
    const visible = (node) => node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0
    const headers = [...document.querySelectorAll('.erp-business-page-header-card')].filter(visible)
    const primary = headers.filter((node) => !node.classList.contains('erp-business-page-header-card--secondary'))
    return {
      primaryCount: primary.length,
      titles: headers.flatMap((node) => [...node.querySelectorAll('h1')].map((title) => title.textContent)),
      redundantStats: headers.reduce((count, node) => count + node.querySelectorAll('.erp-business-module-stats, .erp-business-page-header-card__stat, .erp-business-page-header-card__summary').length, 0),
      headers: headers.map((node) => {
        const rect = node.getBoundingClientRect()
        return { left: rect.left, right: rect.right, height: rect.height, empty: !node.textContent.trim() }
      }),
      viewportWidth: innerWidth,
      pageWidth: Math.max(document.body.scrollWidth, document.documentElement.scrollWidth),
      pagination: [...document.querySelectorAll('.ant-pagination-total-text')].filter(visible).map((node) => node.textContent),
    }
  })
  assert.equal(metrics.primaryCount, 1, `${scenarioName} 应仅显示一个主页面标题: ${JSON.stringify(metrics)}`)
  assert.equal(metrics.titles.length, 1, `${scenarioName} 不应重复显示模块与当前页标题: ${JSON.stringify(metrics)}`)
  assert.equal(metrics.redundantStats, 0, `${scenarioName} 页头不应保留重复统计: ${JSON.stringify(metrics)}`)
  assert(metrics.headers.every((item) => !item.empty && item.left >= -1 && item.right <= metrics.viewportWidth + 1), `${scenarioName} 页头应有内容且不溢出: ${JSON.stringify(metrics)}`)
  assert(metrics.pageWidth <= metrics.viewportWidth + 2, `${scenarioName} 页面不应横向溢出: ${JSON.stringify(metrics)}`)
  assert(metrics.pagination.every((text) => /第.*条.*共.*条/u.test(text)), `${scenarioName} 分页应保留当前范围和查询总数: ${JSON.stringify(metrics)}`)
}

export {
  assertBusinessMainTableHasNoOperationColumn,
  assertBusinessMainTableInitialSelectionEmpty,
  assertBusinessMainTableSortableColumns,
  assertBusinessHeaderHasNoSectionTitle,
  assertBusinessHeaderCompact,
}
