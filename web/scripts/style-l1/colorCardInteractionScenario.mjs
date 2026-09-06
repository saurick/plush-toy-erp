import assert from 'node:assert/strict'
import path from 'node:path'
import { expectText } from './pageAssertions.mjs'
async function verifyColorCardPaper({
  page,
  assertPrintWorkspacePaperTopRhythm,
  assertEngineeringPaperScreenPrintBox,
  assertEngineeringEditorRounded,
  assertFullCellEditableCoverage,
  assertPrintEditableFocusBorderStyle,
  assertPrintEditableFocusSurvivesSwitch,
  writeEngineeringPaperReviewScreenshot,
  assertEngineeringServerPdfSnapshotPageBox,
  assertEngineeringRichTextRedToggle,
  assertRichEditableNbspArtifactGuard,
}) {
  await page.locator('.erp-color-card-paper').waitFor({
    state: 'visible',
    timeout: 10_000,
  })

  await assertPrintWorkspacePaperTopRhythm(page, {
    paperSelector: '.erp-color-card-paper',
    scenarioLabel: '色卡',
    screenshotName: 'print-workspace-color-card-paper-top-rhythm',
  })

  await assertEngineeringPaperScreenPrintBox('.erp-color-card-paper', '色卡')

  await assertEngineeringEditorRounded('色卡')

  await assertFullCellEditableCoverage(
    '色卡',
    '.erp-color-card-paper__line-row[data-color-line="true"] .erp-color-card-paper__method-cell',
    '.erp-engineering-print-editable'
  )

  await assertPrintEditableFocusBorderStyle(page, {
    selector:
      '.erp-color-card-paper__line-row[data-color-line="true"] .erp-color-card-paper__method-cell .erp-engineering-print-editable',
    scenarioLabel: '色卡',
  })

  await assertPrintEditableFocusSurvivesSwitch(page, {
    firstSelector:
      '.erp-color-card-paper__line-row[data-color-line="true"] .erp-color-card-paper__position-cell .erp-engineering-print-editable',
    secondSelector:
      '.erp-color-card-paper__line-row[data-color-line="true"] .erp-color-card-paper__method-cell .erp-engineering-print-editable',
    scenarioLabel: '色卡',
  })

  const colorCardMetaOriginalHTML = await page.evaluate(() => {
    const editors = [
      ...document.querySelectorAll(
        '.erp-color-card-paper__meta > .erp-engineering-print-editable'
      ),
    ]
    const samples = [
      '26204#-PRODUCT-NO-LONG-CONTINUOUS-WRAP-CHECK-20260708-ABCDEFGHIJKLMN',
      '抱抱猴子-黑色-产品名称超长连续值不应覆盖相邻区域-ColorCardProductNameLongWrapCheck20260708',
    ]
    return editors.map((editor, index) => {
      const html = editor.innerHTML
      editor.textContent = samples[index] || editor.textContent
      return html
    })
  })

  const colorCardMetaMetrics = await page.evaluate(() => {
    const meta = document.querySelector('.erp-color-card-paper__meta')
    const metaStyle = meta ? window.getComputedStyle(meta) : null
    const children = [...(meta?.children || [])]
    const states = children
      .map((child, index) => ({ child, index }))
      .filter(({ child }) =>
        child.classList.contains('erp-engineering-print-editable')
      )
      .map(({ child, index }) => {
        const previousLabel = children[index - 1]
        const nextLabel = children[index + 1]
        const rect = child.getBoundingClientRect()
        const style = window.getComputedStyle(child)
        const previousLabelRect = previousLabel?.getBoundingClientRect()
        const nextLabelRect = nextLabel?.getBoundingClientRect()
        const metaRect = meta?.getBoundingClientRect()
        const range = document.createRange()
        range.selectNodeContents(child)
        const lineBoxCount = [...range.getClientRects()].filter(
          (lineRect) => lineRect.width > 0 && lineRect.height > 0
        ).length
        range.detach()
        const lineHeight = Number.parseFloat(style.lineHeight || '0')
        return {
          index,
          text: String(child.textContent || '')
            .replace(/\s+/gu, ' ')
            .trim(),
          hasNextLabel: Boolean(nextLabelRect),
          editorWidth: rect.width,
          editorHeight: rect.height,
          labelEditorGap:
            previousLabelRect && rect
              ? rect.left - previousLabelRect.right
              : -1,
          rightGap:
            nextLabelRect && rect
              ? nextLabelRect.left - rect.right
              : metaRect && rect
                ? metaRect.right - rect.right
                : -1,
          display: style.display,
          alignItems: style.alignItems,
          alignSelf: style.alignSelf,
          boxSizing: style.boxSizing,
          whiteSpace: style.whiteSpace,
          overflowWrap: style.overflowWrap,
          wordBreak: style.wordBreak,
          lineHeight,
          lineBoxCount,
          editorClientWidth: child.clientWidth,
          editorScrollWidth: child.scrollWidth,
          editorClientHeight: child.clientHeight,
          editorScrollHeight: child.scrollHeight,
        }
      })
    return {
      checkedCount: states.length,
      metaAlignItems: metaStyle?.alignItems || '',
      metaText: String(meta?.textContent || '').replace(/\s+/gu, ' '),
      nonFillingValueSlots: states.filter(
        (state) =>
          state.editorWidth < 90 ||
          state.editorHeight <= 0 ||
          state.labelEditorGap < 0 ||
          (state.hasNextLabel
            ? state.rightGap < 4 || state.rightGap > 12
            : state.rightGap > 2) ||
          state.display !== 'flex' ||
          state.alignItems !== 'center' ||
          state.alignSelf !== 'baseline' ||
          state.boxSizing !== 'border-box' ||
          state.whiteSpace !== 'normal' ||
          state.overflowWrap !== 'anywhere' ||
          state.editorScrollWidth > state.editorClientWidth + 1 ||
          state.lineBoxCount < 2
      ),
      states,
    }
  })

  assert(
    colorCardMetaMetrics.checkedCount === 2 &&
      colorCardMetaMetrics.metaAlignItems === 'baseline' &&
      colorCardMetaMetrics.metaText.includes('产品编号') &&
      colorCardMetaMetrics.metaText.includes('产品名称') &&
      colorCardMetaMetrics.nonFillingValueSlots.length === 0,
    `色卡顶部产品编号/产品名称值槽应铺满标签右侧区域并允许长值换行: ${JSON.stringify(colorCardMetaMetrics)}`
  )

  await writeEngineeringPaperReviewScreenshot(
    '.erp-color-card-paper',
    'color-card-meta-long-value-wrap-latest.png'
  )

  await page.evaluate((originalHTML) => {
    const editors = [
      ...document.querySelectorAll(
        '.erp-color-card-paper__meta > .erp-engineering-print-editable'
      ),
    ]
    editors.forEach((editor, index) => {
      if (typeof originalHTML[index] === 'string') {
        editor.innerHTML = originalHTML[index]
      }
    })
  }, colorCardMetaOriginalHTML)

  await assertPrintEditableFocusBorderStyle(page, {
    selector:
      '.erp-color-card-paper__meta > .erp-engineering-print-editable:nth-child(4)',
    scenarioLabel: '色卡顶部产品名称',
  })

  await writeEngineeringPaperReviewScreenshot(
    '.erp-color-card-paper',
    'color-card-meta-focus-latest.png'
  )

  const colorCardFooterMetrics = await page.evaluate(() => {
    const footer = document.querySelector('.erp-color-card-paper__footer')
    const items = [...(footer?.children || [])]
    const states = items.map((item, index) => {
      const editor = item.querySelector('.erp-engineering-print-editable')
      const itemRect = item.getBoundingClientRect()
      const itemStyle = window.getComputedStyle(item)
      const editorRect = editor?.getBoundingClientRect()
      const editorStyle = editor ? window.getComputedStyle(editor) : null
      return {
        index,
        text: String(item.textContent || '')
          .replace(/\s+/gu, ' ')
          .trim(),
        itemWidth: itemRect.width,
        itemHeight: itemRect.height,
        itemAlignItems: itemStyle.alignItems,
        editorWidth: editorRect?.width || 0,
        editorHeight: editorRect?.height || 0,
        rightGap: editorRect ? itemRect.right - editorRect.right : -1,
        heightDelta: editorRect
          ? Math.abs(itemRect.height - editorRect.height)
          : -1,
        editorDisplay: editorStyle?.display || '',
        editorAlignItems: editorStyle?.alignItems || '',
        editorAlignSelf: editorStyle?.alignSelf || '',
        editorBoxSizing: editorStyle?.boxSizing || '',
      }
    })
    return {
      checkedCount: states.length,
      footerText: String(footer?.textContent || '').replace(/\s+/gu, ' '),
      compactFooterText: String(footer?.textContent || '').replace(/\s+/gu, ''),
      nonFillingValueSlots: states.filter(
        (state) =>
          state.editorWidth <= 0 ||
          state.editorHeight <= 0 ||
          state.rightGap > 2 ||
          state.heightDelta > 2 ||
          state.itemAlignItems !== 'baseline' ||
          state.editorDisplay !== 'flex' ||
          state.editorAlignItems !== 'center' ||
          state.editorAlignSelf !== 'baseline' ||
          state.editorBoxSizing !== 'border-box'
      ),
      states,
    }
  })

  assert(
    colorCardFooterMetrics.checkedCount === 4 &&
      colorCardFooterMetrics.compactFooterText.includes('审核：审核人') &&
      colorCardFooterMetrics.compactFooterText.includes('复核：复核人') &&
      colorCardFooterMetrics.nonFillingValueSlots.length === 0,
    `色卡页脚非表格字段应有默认审核/复核值，且编辑层铺满标签右侧值槽: ${JSON.stringify(colorCardFooterMetrics)}`
  )

  await assertPrintEditableFocusBorderStyle(page, {
    selector:
      '.erp-color-card-paper__footer > span:nth-child(4) .erp-engineering-print-editable',
    scenarioLabel: '色卡页脚复核',
  })

  await writeEngineeringPaperReviewScreenshot(
    '.erp-color-card-paper',
    'color-card-footer-focus-latest.png'
  )

  await writeEngineeringPaperReviewScreenshot(
    '.erp-color-card-paper',
    'color-card-runtime-latest.png'
  )

  await assertEngineeringServerPdfSnapshotPageBox({
    paperSelector: '.erp-color-card-paper',
    contentSelector: '.erp-color-card-paper__sheet',
    scenarioLabel: '色卡',
    screenshotName: 'color-card-server-pdf-page-box',
  })

  await page.emulateMedia({ media: 'print' })

  try {
    const colorCardPrintFooterMetrics = await page.evaluate(() => {
      const paper = document.querySelector('.erp-color-card-paper')
      const sheet = document.querySelector('.erp-color-card-paper__sheet')
      const footer = document.querySelector('.erp-color-card-paper__footer')
      const gutter = document.querySelector('.erp-color-card-paper__gutter')
      const sides = [
        ...document.querySelectorAll('.erp-color-card-paper__side'),
      ]
      const paperRect = paper?.getBoundingClientRect()
      const sheetRect = sheet?.getBoundingClientRect()
      const footerRect = footer?.getBoundingClientRect()
      const gutterRect = gutter?.getBoundingClientRect()
      const sideHeights = sides.map(
        (side) => side.getBoundingClientRect().height
      )
      const a4PageHeightPx = (297 / 25.4) * 96
      return {
        a4PageHeightPx,
        paperHeight: paperRect?.height || 0,
        sheetHeight: sheetRect?.height || 0,
        footerHeight: footerRect?.height || 0,
        footerTopGap:
          footerRect && sheetRect ? footerRect.top - sheetRect.bottom : null,
        footerBottomGap:
          footerRect && paperRect ? paperRect.bottom - footerRect.bottom : null,
        gutterHeight: gutterRect?.height || 0,
        maxSideHeight: Math.max(0, ...sideHeights),
      }
    })
    assert(
      colorCardPrintFooterMetrics.footerTopGap >= 8 &&
        colorCardPrintFooterMetrics.footerTopGap <= 16 &&
        colorCardPrintFooterMetrics.footerBottomGap >= 0 &&
        colorCardPrintFooterMetrics.footerBottomGap <= 80 &&
        colorCardPrintFooterMetrics.paperHeight <
          colorCardPrintFooterMetrics.a4PageHeightPx &&
        colorCardPrintFooterMetrics.gutterHeight <=
          colorCardPrintFooterMetrics.maxSideHeight + 1 &&
        colorCardPrintFooterMetrics.sheetHeight <
          colorCardPrintFooterMetrics.paperHeight,
      `色卡打印态制卡/日期/审核/复核应贴近色卡表格下方，打印态纸面高度不能触发空白第二页: ${JSON.stringify(colorCardPrintFooterMetrics)}`
    )
    await writeEngineeringPaperReviewScreenshot(
      '.erp-color-card-paper',
      'color-card-print-footer-near-table.png'
    )
  } finally {
    await page.emulateMedia({ media: 'screen' })
  }

  await assertEngineeringRichTextRedToggle(
    '.erp-color-card-paper__line-row[data-color-line="true"] .erp-color-card-paper__method-cell .erp-engineering-print-editable',
    '.erp-color-card-paper__company',
    '色卡'
  )

  await assertRichEditableNbspArtifactGuard('.erp-color-card-paper', '色卡')
}

async function verifyColorCardExistingLineInsertion({
  page,
  writeEngineeringPaperReviewScreenshot,
}) {
  await page.getByRole('button', { name: '选择色卡行' }).click()

  await page
    .locator('.erp-color-card-paper__line-row[data-color-line="true"]')
    .first()
    .dispatchEvent('mousedown', { bubbles: true, cancelable: true })

  const persistedLineSelectionState = await page.evaluate(() => ({
    selectedRows: document.querySelectorAll(
      '.erp-color-card-paper__line-row.erp-engineering-print-row--selected'
    ).length,
    blockSelectedRows: document.querySelectorAll(
      '.erp-color-card-paper__block-row--selected'
    ).length,
    swatchBoxShadow:
      window.getComputedStyle(
        document.querySelector(
          '.erp-color-card-paper__line-row.erp-engineering-print-row--selected .erp-color-card-paper__swatch-cell'
        )
      ).boxShadow || '',
    swatchBackground:
      window.getComputedStyle(
        document.querySelector(
          '.erp-color-card-paper__line-row.erp-engineering-print-row--selected .erp-color-card-paper__swatch-cell'
        )
      ).backgroundColor || '',
    positionBackground:
      window.getComputedStyle(
        document.querySelector(
          '.erp-color-card-paper__line-row.erp-engineering-print-row--selected .erp-color-card-paper__position-cell'
        )
      ).backgroundColor || '',
  }))

  assert(
    persistedLineSelectionState.selectedRows === 1 &&
      persistedLineSelectionState.blockSelectedRows === 0 &&
      persistedLineSelectionState.swatchBoxShadow === 'none' &&
      persistedLineSelectionState.swatchBackground !==
        persistedLineSelectionState.positionBackground,
    `色卡选择具体行时应只高亮部位/做法行，不能继续高亮整块或跨行图片区: ${JSON.stringify(persistedLineSelectionState)}`
  )

  await writeEngineeringPaperReviewScreenshot(
    '.erp-color-card-paper',
    'color-card-line-selection-persisted.png'
  )

  const colorLineRowsBefore = await page
    .locator('.erp-color-card-paper__side')
    .first()
    .locator('.erp-color-card-paper__line-row[data-color-line="true"]')
    .count()

  await page.getByRole('button', { name: '下插一行' }).click()

  assert.equal(
    await page
      .locator('.erp-color-card-paper__side')
      .first()
      .locator('.erp-color-card-paper__line-row[data-color-line="true"]')
      .count(),
    colorLineRowsBefore + 1,
    '色卡行下插一行应新增块内行'
  )

  const downInsertPositionState = await page.evaluate(() => {
    const firstBlockRows = [
      ...(document
        .querySelector('.erp-color-card-paper__side')
        ?.querySelectorAll(
          '.erp-color-card-paper__line-row[data-color-line="true"]'
        ) || []),
    ].slice(0, 4)
    return {
      selectedIndex: firstBlockRows.findIndex((row) =>
        row.classList.contains('erp-engineering-print-row--selected')
      ),
      rowTexts: firstBlockRows.map((row) =>
        String(row.textContent || '')
          .replace(/\s+/gu, '')
          .trim()
      ),
    }
  })

  assert(
    downInsertPositionState.selectedIndex === 1 &&
      downInsertPositionState.rowTexts[1] === '',
    `色卡下插一行应插在当前选中行正下方并选中新空白行: ${JSON.stringify(downInsertPositionState)}`
  )

  await writeEngineeringPaperReviewScreenshot(
    '.erp-color-card-paper',
    'color-card-line-insert-after-selected-row.png'
  )

  await page
    .locator('.erp-print-shell__toolbar-group')
    .nth(1)
    .getByRole('button', { name: '移除当前行' })
    .click()

  assert.equal(
    await page
      .locator('.erp-color-card-paper__side')
      .first()
      .locator('.erp-color-card-paper__line-row[data-color-line="true"]')
      .count(),
    colorLineRowsBefore,
    '色卡行移除当前行后行数应恢复'
  )

  await page
    .locator('.erp-color-card-paper__side')
    .first()
    .locator('.erp-color-card-paper__line-row[data-color-line="true"]')
    .nth(1)
    .dispatchEvent('mousedown', { bubbles: true, cancelable: true })

  await page
    .locator('.erp-print-shell__toolbar-group')
    .nth(1)
    .getByRole('button', { name: '上插一行' })
    .click()

  const upInsertPositionState = await page.evaluate(() => {
    const firstBlockRows = [
      ...(document
        .querySelector('.erp-color-card-paper__side')
        ?.querySelectorAll(
          '.erp-color-card-paper__line-row[data-color-line="true"]'
        ) || []),
    ].slice(0, 4)
    return {
      selectedIndex: firstBlockRows.findIndex((row) =>
        row.classList.contains('erp-engineering-print-row--selected')
      ),
      rowTexts: firstBlockRows.map((row) =>
        String(row.textContent || '')
          .replace(/\s+/gu, '')
          .trim()
      ),
    }
  })

  assert(
    upInsertPositionState.selectedIndex === 1 &&
      upInsertPositionState.rowTexts[1] === '' &&
      /后头\*2热裁-1/u.test(upInsertPositionState.rowTexts[2] || ''),
    `色卡上插一行应插在当前选中行正上方并选中新空白行: ${JSON.stringify(upInsertPositionState)}`
  )

  await writeEngineeringPaperReviewScreenshot(
    '.erp-color-card-paper',
    'color-card-line-insert-before-selected-row.png'
  )

  await page
    .locator('.erp-print-shell__toolbar-group')
    .nth(1)
    .getByRole('button', { name: '移除当前行' })
    .click()

  assert.equal(
    await page
      .locator('.erp-color-card-paper__side')
      .first()
      .locator('.erp-color-card-paper__line-row[data-color-line="true"]')
      .count(),
    colorLineRowsBefore,
    '色卡行上插新增行移除后行数应恢复'
  )
}

async function verifyColorCardPlaceholderInsertion({
  page,
  collectToolbarGroups,
  writeEngineeringPaperReviewScreenshot,
}) {
  const firstColorBlockPlaceholderRows = page.locator(
    '.erp-color-card-paper__line-row[data-color-card-block-index="0"][data-color-line-placeholder="true"]'
  )

  assert(
    (await firstColorBlockPlaceholderRows.count()) > 0,
    '色卡应保留可选择的空白占位行，方便从纸面继续上插 / 下插'
  )

  const readFirstColorBlockLineState = async () =>
    page.evaluate(() => {
      const rows = [
        ...document.querySelectorAll(
          '.erp-color-card-paper__line-row[data-color-card-block-index="0"]'
        ),
      ]
      const selectedIndex = rows.findIndex((row) =>
        row.classList.contains('erp-engineering-print-row--selected')
      )
      const selectedRow = selectedIndex >= 0 ? rows[selectedIndex] : null
      return {
        visibleRows: rows.length,
        selectedIndex,
        selectedRows: rows.filter((row) =>
          row.classList.contains('erp-engineering-print-row--selected')
        ).length,
        blockSelectedRows: document.querySelectorAll(
          '.erp-color-card-paper__block-row--selected'
        ).length,
        selectedPersisted:
          selectedRow?.getAttribute('data-color-line') === 'true',
        selectedPlaceholder:
          selectedRow?.getAttribute('data-color-line-placeholder') === 'true',
        rowTexts: rows.map((row) =>
          String(row.textContent || '')
            .replace(/\s+/gu, '')
            .trim()
        ),
      }
    })

  await firstColorBlockPlaceholderRows
    .first()
    .dispatchEvent('mousedown', { bubbles: true, cancelable: true })

  let toolbarGroups = await collectToolbarGroups()

  assert.equal(
    toolbarGroups[1].buttons[0].disabled,
    false,
    '色卡选择空白占位行后，上插一行应可用'
  )

  assert.equal(
    toolbarGroups[1].buttons[1].disabled,
    false,
    '色卡选择空白占位行后，下插一行应可用'
  )

  assert.equal(
    toolbarGroups[1].buttons[2].disabled,
    true,
    '色卡空白占位行不是已存在明细行，不应直接移除'
  )

  const placeholderSelectionState = await readFirstColorBlockLineState()

  assert(
    placeholderSelectionState.selectedRows === 1 &&
      placeholderSelectionState.blockSelectedRows === 0 &&
      placeholderSelectionState.selectedPlaceholder,
    `色卡空白占位行应被准确高亮为当前行: ${JSON.stringify(placeholderSelectionState)}`
  )

  const placeholderUpSourceIndex = placeholderSelectionState.selectedIndex

  const visibleRowsBeforePlaceholderUp = placeholderSelectionState.visibleRows

  await writeEngineeringPaperReviewScreenshot(
    '.erp-color-card-paper',
    'color-card-line-selection-placeholder.png'
  )

  await page
    .locator('.erp-print-shell__toolbar-group')
    .nth(1)
    .getByRole('button', { name: '上插一行' })
    .click()

  const placeholderUpInsertState = await readFirstColorBlockLineState()

  assert(
    placeholderUpInsertState.visibleRows ===
      visibleRowsBeforePlaceholderUp + 1 &&
      placeholderUpInsertState.selectedRows === 1 &&
      placeholderUpInsertState.blockSelectedRows === 0 &&
      placeholderUpInsertState.selectedPersisted &&
      placeholderUpInsertState.selectedIndex === placeholderUpSourceIndex &&
      placeholderUpInsertState.rowTexts[placeholderUpSourceIndex] === '',
    `色卡空白占位行上插后应新增可见空白行并选中新行: ${JSON.stringify(placeholderUpInsertState)}`
  )

  await writeEngineeringPaperReviewScreenshot(
    '.erp-color-card-paper',
    'color-card-placeholder-insert-before.png'
  )

  await page
    .locator('.erp-print-shell__toolbar-group')
    .nth(1)
    .getByRole('button', { name: '移除当前行' })
    .click()

  assert.equal(
    (await readFirstColorBlockLineState()).visibleRows,
    visibleRowsBeforePlaceholderUp,
    '色卡空白占位行上插新增行移除后可见行数应恢复'
  )

  await page
    .locator(
      '.erp-color-card-paper__line-row[data-color-card-block-index="0"][data-color-line-placeholder="true"]'
    )
    .first()
    .dispatchEvent('mousedown', { bubbles: true, cancelable: true })

  const placeholderDownSelectionState = await readFirstColorBlockLineState()

  assert(
    placeholderDownSelectionState.selectedRows === 1 &&
      placeholderDownSelectionState.selectedPlaceholder,
    `色卡空白占位行下插前应先选中一个空白占位行: ${JSON.stringify(placeholderDownSelectionState)}`
  )

  const placeholderDownSourceIndex = placeholderDownSelectionState.selectedIndex

  const visibleRowsBeforePlaceholderDown =
    placeholderDownSelectionState.visibleRows

  await page
    .locator('.erp-print-shell__toolbar-group')
    .nth(1)
    .getByRole('button', { name: '下插一行' })
    .click()

  const placeholderDownInsertState = await readFirstColorBlockLineState()

  assert(
    placeholderDownInsertState.visibleRows ===
      visibleRowsBeforePlaceholderDown + 1 &&
      placeholderDownInsertState.selectedRows === 1 &&
      placeholderDownInsertState.blockSelectedRows === 0 &&
      placeholderDownInsertState.selectedPersisted &&
      placeholderDownInsertState.selectedIndex ===
        placeholderDownSourceIndex + 1 &&
      placeholderDownInsertState.rowTexts[placeholderDownSourceIndex] === '' &&
      placeholderDownInsertState.rowTexts[placeholderDownSourceIndex + 1] ===
        '',
    `色卡空白占位行下插后应保留原空白行、在其下新增可见空白行并选中新行: ${JSON.stringify(placeholderDownInsertState)}`
  )

  await writeEngineeringPaperReviewScreenshot(
    '.erp-color-card-paper',
    'color-card-placeholder-insert-after.png'
  )

  await page
    .locator('.erp-print-shell__toolbar-group')
    .nth(1)
    .getByRole('button', { name: '移除当前行' })
    .click()

  assert.equal(
    (await readFirstColorBlockLineState()).visibleRows,
    visibleRowsBeforePlaceholderDown,
    '色卡空白占位行下插新增行移除后可见行数应恢复'
  )

  const targetVisibleColorRows = 13

  for (let attempt = 0; attempt < targetVisibleColorRows; attempt += 1) {
    const currentColorLineState = await readFirstColorBlockLineState()
    if (currentColorLineState.visibleRows >= targetVisibleColorRows) {
      break
    }
    await page
      .locator(
        '.erp-color-card-paper__line-row[data-color-card-block-index="0"]'
      )
      .last()
      .dispatchEvent('mousedown', { bubbles: true, cancelable: true })
    await page
      .locator('.erp-print-shell__toolbar-group')
      .nth(1)
      .getByRole('button', { name: '下插一行' })
      .click()
  }

  const overTwelveColorLineState = await readFirstColorBlockLineState()

  assert(
    overTwelveColorLineState.visibleRows >= targetVisibleColorRows,
    `色卡行数应允许超过 12 行，不应被源表样例长度锁死: ${JSON.stringify(overTwelveColorLineState)}`
  )

  assert.equal(
    await page.getByText('每个色卡块最多支持 12 行。').count(),
    0,
    '色卡超过 12 行时不应再出现旧的 12 行限制提示'
  )

  await writeEngineeringPaperReviewScreenshot(
    '.erp-color-card-paper',
    'color-card-more-than-12-lines.png'
  )
}

async function verifyColorCardBlockInsertion({ page }) {
  await page.getByRole('button', { name: '选择色卡块' }).click()

  await page
    .locator(
      '.erp-color-card-paper__block-head-row[data-color-card-block="true"]'
    )
    .first()
    .dispatchEvent('mousedown', { bubbles: true, cancelable: true })

  const colorBlocksBefore = await page
    .locator(
      '.erp-color-card-paper__block-head-row[data-color-card-block="true"]'
    )
    .count()

  await page.getByRole('button', { name: '上插色卡块' }).click()

  assert.equal(
    await page
      .locator(
        '.erp-color-card-paper__block-head-row[data-color-card-block="true"]'
      )
      .count(),
    colorBlocksBefore + 1,
    '色卡块上插色卡块应新增色卡块'
  )

  await page.getByRole('button', { name: '移除当前块' }).click()

  assert.equal(
    await page
      .locator(
        '.erp-color-card-paper__block-head-row[data-color-card-block="true"]'
      )
      .count(),
    colorBlocksBefore,
    '色卡块移除当前块后块数应恢复'
  )

  const rightSide = page.locator('.erp-color-card-paper__side').nth(1)

  await rightSide
    .locator('.erp-color-card-paper__line-row[data-color-line="true"]')
    .first()
    .dispatchEvent('mousedown', { bubbles: true, cancelable: true })

  const rightBlocksBefore = await rightSide
    .locator(
      '.erp-color-card-paper__block-head-row[data-color-card-block="true"]'
    )
    .count()

  await page.getByRole('button', { name: '下插色卡块' }).click()

  assert.equal(
    await rightSide
      .locator(
        '.erp-color-card-paper__block-head-row[data-color-card-block="true"]'
      )
      .count(),
    rightBlocksBefore + 1,
    '色卡右侧普通行在块选择模式下应能选中并下插色卡块'
  )

  await page.getByRole('button', { name: '移除当前块' }).click()

  assert.equal(
    await rightSide
      .locator(
        '.erp-color-card-paper__block-head-row[data-color-card-block="true"]'
      )
      .count(),
    rightBlocksBefore,
    '色卡右侧新增块移除后右栏块数应恢复'
  )
}

import { createEngineeringPrintAssertions } from './engineeringPrintAssertions.mjs'
export function createColorCardInteractionScenario({
  assertPrintWorkspacePaperTopRhythm,
  assertPrintEditableFocusBorderStyle,
  assertPrintEditableFocusSurvivesSwitch,
  assert,
  path,
  outputDir,
}) {
  return {
    name: 'engineering-color-card-interactions',
    path: '/erp/print-workspace/engineering-color-card?draft=fresh',
    auth: 'admin',
    viewport: { width: 1600, height: 1100 },
    verify: async (page) => {
      const {
        assertEngineeringPaperScreenPrintBox,
        assertEngineeringEditorRounded,
        assertFullCellEditableCoverage,
        writeEngineeringPaperReviewScreenshot,
        assertEngineeringServerPdfSnapshotPageBox,
        assertEngineeringRichTextRedToggle,
        assertRichEditableNbspArtifactGuard,
        collectToolbarGroups,
        assertButtonTexts,
        assertNoLegacyEngineeringRowButtonText,
      } = await createEngineeringPrintAssertions({
        page,
        assert,
        path,
        outputDir,
      })

      await verifyColorCardPaper({
        page,
        assertPrintWorkspacePaperTopRhythm,
        assertEngineeringPaperScreenPrintBox,
        assertEngineeringEditorRounded,
        assertFullCellEditableCoverage,
        assertPrintEditableFocusBorderStyle,
        assertPrintEditableFocusSurvivesSwitch,
        writeEngineeringPaperReviewScreenshot,
        assertEngineeringServerPdfSnapshotPageBox,
        assertEngineeringRichTextRedToggle,
        assertRichEditableNbspArtifactGuard,
      })

      let toolbarGroups = await collectToolbarGroups()

      assertButtonTexts(
        toolbarGroups[0],
        ['上插色卡块', '下插色卡块', '移除当前块', '选择色卡块'],
        '色卡块'
      )

      assertButtonTexts(
        toolbarGroups[1],
        ['上插一行', '下插一行', '移除当前行', '选择色卡行'],
        '色卡行'
      )

      assert.equal(
        toolbarGroups[0].buttons[0].disabled,
        true,
        '色卡未选择色卡块前，上插色卡块应禁用'
      )

      assert.equal(
        toolbarGroups[1].buttons[0].disabled,
        true,
        '色卡未选择色卡行前，上插一行应禁用'
      )

      assert.equal(
        await page.locator('.erp-color-card-paper__side').count(),
        2,
        '色卡应按 Excel 原表渲染左右两张连续表格'
      )

      assert.equal(
        await page.locator('.erp-color-card-paper__gutter').count(),
        1,
        '色卡左右表之间应保留 Excel 原表窄隔栏'
      )

      assert.ok(
        (await page
          .locator('.erp-color-card-paper__swatch-cell[rowspan]')
          .count()) > 0,
        '色卡物料图片区应通过 rowSpan 合并多行'
      )

      await assertNoLegacyEngineeringRowButtonText('色卡')

      await verifyColorCardExistingLineInsertion({
        page,
        writeEngineeringPaperReviewScreenshot,
      })

      await verifyColorCardPlaceholderInsertion({
        page,
        collectToolbarGroups,
        writeEngineeringPaperReviewScreenshot,
      })

      await verifyColorCardBlockInsertion({ page })
    },
  }
}
