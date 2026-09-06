import assert from 'node:assert/strict'

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
    const columnHeaderTriggers = tableCard
      ? Array.from(
          tableCard.querySelectorAll(
            '.ant-table-thead th .erp-module-column-header-trigger'
          )
        ).map((node) => ({
          label: node.getAttribute('aria-label') || '',
          opacity: Number(window.getComputedStyle(node).opacity || 1),
          display: window.getComputedStyle(node).display,
          visibility: window.getComputedStyle(node).visibility,
          width: node.getBoundingClientRect().width,
          height: node.getBoundingClientRect().height,
        }))
      : []
    const columnHeaderTexts = tableCard
      ? Array.from(
          tableCard.querySelectorAll(
            '.ant-table-thead th .erp-module-column-header-text'
          )
        ).map((node) => {
          const style = window.getComputedStyle(node)
          const textRect = node.getBoundingClientRect()
          const triggerRect = node
            .closest('.erp-module-column-header')
            ?.querySelector('.erp-module-column-header-trigger')
            ?.getBoundingClientRect()
          const titleRect = node
            .closest('.ant-table-column-title')
            ?.getBoundingClientRect()
          const sorterRect = node
            .closest('.ant-table-column-sorters')
            ?.querySelector('.ant-table-column-sorter')
            ?.getBoundingClientRect()
          return {
            text: String(node.textContent || '')
              .replace(/\s+/g, ' ')
              .trim(),
            clientWidth: node.clientWidth,
            scrollWidth: node.scrollWidth,
            textOverflow: style.textOverflow,
            overflow: style.overflow,
            whiteSpace: style.whiteSpace,
            triggerOverlap: triggerRect
              ? textRect.right > triggerRect.left + 1
              : false,
            triggerRightGap:
              triggerRect && titleRect
                ? titleRect.right - triggerRect.right
                : null,
            triggerSorterGap:
              triggerRect && sorterRect
                ? sorterRect.left - triggerRect.right
                : null,
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
      columnHeaderTriggers,
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
      header.whiteSpace !== 'nowrap' || header.verticalAlign !== 'middle'
  )
  const unstableSorters = sortableHeaders.filter(
    (header) => header.hasSorter && header.sorterAlignItems !== 'center'
  )
  const hiddenColumnHeaderTriggers = metrics.columnHeaderTriggers.filter(
    (node) =>
      node.display === 'none' ||
      node.visibility === 'hidden' ||
      node.opacity < 0.95
  )
  const oversizedColumnHeaderTriggers = metrics.columnHeaderTriggers.filter(
    (node) => node.width > 24 || node.height > 24
  )
  const undersizedColumnHeaderTriggers = metrics.columnHeaderTriggers.filter(
    (node) => node.width < 23.5 || node.height < 23.5
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
    (node) => node.text && node.triggerOverlap
  )
  const misplacedHeaderTriggers = metrics.columnHeaderTexts.filter(
    (node) =>
      node.text &&
      Number.isFinite(node.triggerRightGap) &&
      Math.abs(node.triggerRightGap) > 1
  )
  const crowdedHeaderControls = metrics.columnHeaderTexts.filter(
    (node) =>
      node.text &&
      Number.isFinite(node.triggerSorterGap) &&
      node.triggerSorterGap < 7
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
  assert(
    metrics.columnHeaderTriggers.length > 0,
    `${scenarioName} 业务主表应默认展示列设置快捷入口: ${JSON.stringify(metrics)}`
  )
  assert.deepEqual(
    hiddenColumnHeaderTriggers,
    [],
    `${scenarioName} 业务主表列设置快捷入口默认态应可见可点: ${JSON.stringify(metrics)}`
  )
  assert.deepEqual(
    oversizedColumnHeaderTriggers,
    [],
    `${scenarioName} 业务主表列设置快捷入口应保持紧凑尺寸: ${JSON.stringify(metrics)}`
  )
  assert.deepEqual(
    undersizedColumnHeaderTriggers,
    [],
    `${scenarioName} 业务主表列设置快捷入口应保留 24px 点击范围: ${JSON.stringify(metrics)}`
  )
  assert.deepEqual(
    wrappedHeaderTexts,
    [],
    `${scenarioName} 业务主表列标题文字应保持单行: ${JSON.stringify(metrics)}`
  )
  assert.deepEqual(
    overlappingHeaderTexts,
    [],
    `${scenarioName} 业务主表列标题不应与列设置按钮重叠: ${JSON.stringify(metrics)}`
  )
  assert.deepEqual(
    misplacedHeaderTriggers,
    [],
    `${scenarioName} 业务主表列设置按钮应贴住标题区右侧: ${JSON.stringify(metrics)}`
  )
  assert.deepEqual(
    crowdedHeaderControls,
    [],
    `${scenarioName} 业务主表列设置与排序入口之间应保留 8px 间距: ${JSON.stringify(metrics)}`
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

async function assertBusinessHeaderStatsSingleLine(
  page,
  {
    scenarioName,
    expectedLabels = ['总记录', '本页显示', '待处理'],
    allowWrappedStats = false,
  }
) {
  await page
    .locator('.erp-business-page-header-card .erp-business-module-stats')
    .waitFor({ state: 'visible', timeout: 20000 })
  const metrics = await page.evaluate(() => {
    const header = document.querySelector('.erp-business-page-header-card')
    const headerRect = header?.getBoundingClientRect()
    const grid = document.querySelector('.erp-business-page-header-card__grid')
    const gridStyle = grid ? window.getComputedStyle(grid) : null
    const main = document.querySelector('.erp-business-page-header-card__main')
    const mainRect = main?.getBoundingClientRect()
    const stats = document.querySelector('.erp-business-module-stats')
    const statsRect = stats?.getBoundingClientRect()
    const statsStyle = stats ? window.getComputedStyle(stats) : null
    const tiles = Array.from(
      document.querySelectorAll(
        '.erp-business-module-stats .erp-business-page-header-card__stat'
      )
    ).map((tile) => {
      const rect = tile.getBoundingClientRect()
      const label = tile.querySelector('.ant-typography')
      const value = tile.querySelector('strong')
      const labelRect = label?.getBoundingClientRect()
      const labelStyle = label ? window.getComputedStyle(label) : null
      const tileStyle = window.getComputedStyle(tile)
      return {
        tagName: tile.tagName,
        role: tile.getAttribute('role'),
        cursor: tileStyle.cursor,
        text: tile.textContent?.replace(/\s+/g, ' ').trim() || '',
        labelText: label?.textContent?.replace(/\s+/g, ' ').trim() || '',
        valueText: value?.textContent?.replace(/\s+/g, ' ').trim() || '',
        ariaLabel: tile.getAttribute('aria-label') || '',
        hasButton: Boolean(tile.querySelector('button')),
        top: rect.top,
        bottom: rect.bottom,
        left: rect.left,
        right: rect.right,
        width: rect.width,
        height: rect.height,
        labelWidth: labelRect?.width || 0,
        labelScrollWidth: label?.scrollWidth || 0,
        labelWhiteSpace: labelStyle?.whiteSpace || '',
        labelTextOverflow: labelStyle?.textOverflow || '',
        labelOverflow: labelStyle?.overflow || '',
      }
    })
    return {
      viewportWidth: window.innerWidth,
      bodyScrollWidth: document.body.scrollWidth,
      docScrollWidth: document.documentElement.scrollWidth,
      headerSummaryCount: document.querySelectorAll(
        '.erp-business-page-header-card__summary, .erp-business-module-hero__footer'
      ).length,
      header: headerRect
        ? {
            left: headerRect.left,
            right: headerRect.right,
            width: headerRect.width,
          }
        : null,
      grid: gridStyle
        ? {
            gridTemplateColumns: gridStyle.gridTemplateColumns,
            alignItems: gridStyle.alignItems,
          }
        : null,
      main: mainRect
        ? {
            top: mainRect.top,
            bottom: mainRect.bottom,
            left: mainRect.left,
            right: mainRect.right,
            width: mainRect.width,
          }
        : null,
      stats: statsRect
        ? {
            top: statsRect.top,
            bottom: statsRect.bottom,
            left: statsRect.left,
            right: statsRect.right,
            width: statsRect.width,
            scrollWidth: stats?.scrollWidth || 0,
            clientWidth: stats?.clientWidth || 0,
            display: statsStyle?.display || '',
            flexWrap: statsStyle?.flexWrap || '',
            gridAutoFlow: statsStyle?.gridAutoFlow || '',
            gridTemplateColumns: statsStyle?.gridTemplateColumns || '',
            justifySelf: statsStyle?.justifySelf || '',
            justifyContent: statsStyle?.justifyContent || '',
          }
        : null,
      tiles,
    }
  })

  assert(
    metrics.stats,
    `${scenarioName} 缺少业务页头部统计区: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.header,
    `${scenarioName} 缺少业务页头部卡片: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    metrics.headerSummaryCount,
    0,
    `${scenarioName} 业务页头不应再渲染底部 summary 区域: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    metrics.tiles.length,
    expectedLabels.length,
    `${scenarioName} formal 业务页统计项数量不符合当前口径: ${JSON.stringify(metrics)}`
  )
  assert.deepEqual(
    metrics.tiles.map((tile) => tile.labelText),
    expectedLabels,
    `${scenarioName} 业务页头部统计项不符合当前口径: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.tiles.every((tile) => /^(0|[1-9]\d*)$/u.test(tile.valueText)),
    `${scenarioName} 业务页头部统计主值必须是非负整数，文字上下文应放在页签、标签或说明中: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.tiles.every(
      (tile) =>
        tile.tagName === 'DIV' &&
        tile.role === null &&
        tile.cursor === 'default' &&
        /只读摘要/u.test(tile.ariaLabel) &&
        tile.hasButton === false
    ),
    `${scenarioName} 业务页头部统计应保持只读摘要，不应伪装成按钮: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.grid?.gridTemplateColumns &&
      ['center', 'start'].includes(metrics.grid?.alignItems),
    `${scenarioName} 业务页头部应使用共享 grid 布局: ${JSON.stringify(metrics)}`
  )
  const statsBesideMain =
    metrics.main &&
    metrics.stats &&
    metrics.stats.left >= metrics.main.right + 8 &&
    metrics.stats.top < metrics.main.bottom &&
    metrics.stats.bottom > metrics.main.top
  const statsBelowMain =
    metrics.main &&
    metrics.stats &&
    metrics.stats.top >= metrics.main.bottom + 6 &&
    metrics.stats.left >= metrics.header.left - 1 &&
    metrics.stats.right <= metrics.header.right + 1
  assert(
    statsBesideMain || statsBelowMain,
    `${scenarioName} 业务页头部摘要组不应覆盖标题说明区: ${JSON.stringify(metrics)}`
  )
  assert.equal(
    metrics.stats.display,
    'grid',
    `${scenarioName} 业务页头部统计区应使用 grid 稳定列宽: ${JSON.stringify(metrics)}`
  )
  assert(
    statsBelowMain ||
      (metrics.header.right - metrics.stats.right <= 24 &&
        metrics.stats.justifySelf === 'end' &&
        metrics.stats.justifyContent === 'end'),
    `${scenarioName} 桌面业务页头部摘要组应在空间足够时右对齐: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.stats.scrollWidth <= metrics.stats.clientWidth + 1,
    `${scenarioName} 业务页头部统计区内部不应横向溢出: ${JSON.stringify(metrics)}`
  )
  const compactViewport = metrics.viewportWidth <= 768
  if (!compactViewport) {
    assert.equal(
      metrics.stats.gridAutoFlow,
      'column',
      `${scenarioName} 桌面业务页头部摘要应横向排列，不能竖排占用高度: ${JSON.stringify(metrics)}`
    )
  }
  if (!allowWrappedStats && !compactViewport) {
    assert(
      metrics.tiles.every(
        (tile) => Math.abs(tile.top - metrics.tiles[0].top) <= 1
      ),
      `${scenarioName} 业务页头部统计卡不应掉到第二行: ${JSON.stringify(metrics)}`
    )
  }
  assert(
    metrics.tiles.every(
      (tile) =>
        tile.width >= 104 &&
        tile.width <= (metrics.viewportWidth <= 480 ? 180 : 130) &&
        tile.height >= 48 &&
        tile.height <= 72
    ),
    `${scenarioName} 业务页头部统计卡尺寸异常: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.tiles.every(
      (tile) =>
        tile.labelWhiteSpace === 'normal' &&
        tile.labelTextOverflow !== 'ellipsis' &&
        tile.labelOverflow === 'visible'
    ),
    `${scenarioName} 业务页头部统计标签不应再用省略号裁切: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.tiles.every((tile) => !tile.text.includes('...')),
    `${scenarioName} 业务页头部统计标签不应出现省略号: ${JSON.stringify(metrics)}`
  )
  assert(
    metrics.bodyScrollWidth <= metrics.viewportWidth + 2 &&
      metrics.docScrollWidth <= metrics.viewportWidth + 2,
    `${scenarioName} 业务页头部统计修复后不应产生页面横向溢出: ${JSON.stringify(metrics)}`
  )
}

export {
  assertBusinessMainTableHasNoOperationColumn,
  assertBusinessMainTableInitialSelectionEmpty,
  assertBusinessMainTableSortableColumns,
  assertBusinessHeaderHasNoSectionTitle,
  assertBusinessHeaderStatsSingleLine,
}
