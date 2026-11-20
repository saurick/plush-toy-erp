export function createMaterialDetailAssertions({
  page,
  assert,
  path,
  outputDir,
  writeEngineeringPaperReviewScreenshot,
}) {
  const assertMaterialDetailTableVerticalCentering = async () => {
    const metrics = await page.evaluate(() => {
      const measureTextRect = (node) => {
        if (!node) return null
        const range = document.createRange()
        range.selectNodeContents(node)
        const rect = range.getBoundingClientRect()
        range.detach()
        return rect.width || rect.height ? rect : null
      }
      const cells = [
        ...document.querySelectorAll(
          '.erp-material-detail-table th, .erp-material-detail-table td'
        ),
      ]
      const states = cells.map((cell, index) => {
        const editor = cell.querySelector(
          '.erp-material-detail-table__editable'
        )
        const cellRect = cell.getBoundingClientRect()
        const editorRect = editor?.getBoundingClientRect()
        const textRect = measureTextRect(editor)
        const editorStyle = editor ? window.getComputedStyle(editor) : null
        return {
          index,
          text: String(editor?.textContent || cell.textContent || '')
            .replace(/\s+/gu, ' ')
            .trim(),
          cellHeight: cellRect.height,
          editorHeight: editorRect?.height || 0,
          textHeight: textRect?.height || 0,
          editorDisplay: editorStyle?.display || '',
          editorAlignItems: editorStyle?.alignItems || '',
          centerDelta:
            cellRect && textRect
              ? Math.abs(
                  cellRect.top +
                    cellRect.height / 2 -
                    (textRect.top + textRect.height / 2)
                )
              : -1,
          fillDelta:
            cellRect && editorRect
              ? Math.abs(cellRect.height - editorRect.height)
              : -1,
        }
      })
      return {
        checkedCount: states.length,
        offCenterStates: states.filter(
          (state) =>
            state.text &&
            state.cellHeight > 0 &&
            state.textHeight > 0 &&
            state.centerDelta > 6
        ),
        nonFillStates: states.filter(
          (state) => state.text && state.editorHeight > 0 && state.fillDelta > 3
        ),
      }
    })
    assert(
      metrics.checkedCount >= 28 &&
        metrics.offCenterStates.length === 0 &&
        metrics.nonFillStates.length === 0,
      `物料分析明细表所有表头和明细单元格内容都应上下居中且编辑层铺满单元格: ${JSON.stringify(metrics)}`
    )
  }

  const assertMaterialDetailMetaGridFieldValueTextAlignment = async () => {
    const metrics = await page.evaluate(() => {
      const measureTextRect = (node) => {
        if (!node) return null
        const range = document.createRange()
        range.selectNodeContents(node)
        const rect = range.getBoundingClientRect()
        range.detach()
        return rect.width || rect.height ? rect : null
      }
      const cells = [
        ...document.querySelectorAll(
          '.erp-material-detail-paper .erp-engineering-print-meta-grid > div'
        ),
      ]
      const states = cells.map((cell, index) => {
        const label = cell.querySelector(
          '.erp-engineering-print-meta-grid__label'
        )
        const editor = cell.querySelector('.erp-engineering-print-editable')
        const cellRect = cell.getBoundingClientRect()
        const labelRect = measureTextRect(label)
        const editorTextRect = measureTextRect(editor)
        const editorBoxRect = editor?.getBoundingClientRect()
        const style = window.getComputedStyle(cell)
        const editorCenter = editorTextRect
          ? editorTextRect.top + editorTextRect.height / 2
          : 0
        const editorBoxCenter = editorBoxRect
          ? editorBoxRect.top + editorBoxRect.height / 2
          : 0
        return {
          index,
          text: String(cell.textContent || '')
            .replace(/\s+/gu, ' ')
            .trim(),
          display: style.display,
          alignItems: style.alignItems,
          cellHeight: cellRect.height,
          textTopDelta:
            labelRect && editorTextRect
              ? Math.abs(labelRect.top - editorTextRect.top)
              : -1,
          editorBoxHeight: editorBoxRect?.height || 0,
          editorBoxWidth: editorBoxRect?.width || 0,
          editorTextHeight: editorTextRect?.height || 0,
          label: label?.textContent || '',
          value: editor?.textContent || '',
          shortValue: /^(数量|备品|日期)[：:]/u.test(label?.textContent || ''),
          editorTextCenterDelta: editorTextRect
            ? Math.abs(editorCenter - editorBoxCenter)
            : -1,
        }
      })
      return {
        checkedCount: states.length,
        quantityField: states.find((state) => /^数量[：:]/u.test(state.label)),
        offTextAlignmentStates: states.filter(
          (state) => state.text && state.textTopDelta > 2
        ),
        offEditorTextCenterStates: states.filter(
          (state) => state.text && state.editorTextCenterDelta > 4
        ),
        smallEditorBoxStates: states.filter(
          (state) =>
            state.text &&
            (state.shortValue
              ? state.editorBoxHeight < state.editorTextHeight ||
                state.editorBoxWidth < state.editorTextHeight * 3
              : state.editorBoxHeight < 20)
        ),
        wideShortValueStates: states.filter(
          (state) =>
            state.shortValue &&
            state.editorBoxWidth > state.editorTextHeight * 6
        ),
        nonGridBaselineStates: states.filter(
          (state) =>
            state.text &&
            (state.display !== 'grid' || state.alignItems !== 'baseline')
        ),
      }
    })
    assert.equal(metrics.quantityField?.label, '数量：', '数量标签只包含字段名')
    assert.equal(
      metrics.quantityField?.value,
      '(PCS) 200',
      '数量单位和数字应位于同一个可编辑值槽中'
    )
    assert(
      metrics.checkedCount === 9 &&
        metrics.offTextAlignmentStates.length === 0 &&
        metrics.offEditorTextCenterStates.length === 0 &&
        metrics.smallEditorBoxStates.length === 0 &&
        metrics.wideShortValueStates.length === 0 &&
        metrics.nonGridBaselineStates.length === 0,
      `物料分析明细表顶部信息格字段名文字和值文字应对齐，值槽内部文字应上下居中: ${JSON.stringify(metrics)}`
    )
  }

  const assertMaterialDetailMetaValueEditableCoverage = async () => {
    const metrics = await page.evaluate(() => {
      const cells = [
        ...document.querySelectorAll(
          '.erp-material-detail-paper .erp-engineering-print-meta-grid > div'
        ),
      ]
      const states = cells.map((cell, index) => {
        const labels = [
          ...cell.querySelectorAll('.erp-engineering-print-meta-grid__label'),
        ]
        const editors = [
          ...cell.querySelectorAll('.erp-engineering-print-editable'),
        ]
        const cellRect = cell.getBoundingClientRect()
        const cellStyle = window.getComputedStyle(cell)
        const paddingTop = parseFloat(cellStyle.paddingTop || '0')
        const paddingRight = parseFloat(cellStyle.paddingRight || '0')
        const paddingBottom = parseFloat(cellStyle.paddingBottom || '0')
        const contentHeight = cellRect.height - paddingTop - paddingBottom
        const pairs = editors.map((editor, pairIndex) => {
          const label = labels[pairIndex]
          const labelRect = label?.getBoundingClientRect()
          const editorRect = editor?.getBoundingClientRect()
          const editorStyle = window.getComputedStyle(editor)
          const nextLabelRect = labels[pairIndex + 1]?.getBoundingClientRect()
          return {
            pairIndex,
            isCompoundCell: editors.length > 1,
            label: String(label?.textContent || '')
              .replace(/\s+/gu, '')
              .trim(),
            editorText: String(editor?.textContent || '')
              .replace(/\s+/gu, ' ')
              .trim(),
            labelRight: labelRect?.right || 0,
            editorLeft: editorRect?.left || 0,
            editorRight: editorRect?.right || 0,
            editorWidth: editorRect?.width || 0,
            editorHeight: editorRect?.height || 0,
            rightGap:
              pairIndex === editors.length - 1 && editorRect
                ? cellRect.right - paddingRight - editorRect.right
                : 0,
            nextPairGap:
              nextLabelRect && editorRect
                ? nextLabelRect.left - editorRect.right
                : 0,
            labelEditorGap:
              labelRect && editorRect ? editorRect.left - labelRect.right : -1,
            heightDelta: editorRect
              ? Math.abs(contentHeight - editorRect.height)
              : -1,
            editorDisplay: editorStyle.display,
            editorAlignItems: editorStyle.alignItems,
            editorAlignSelf: editorStyle.alignSelf,
            editorBoxSizing: editorStyle.boxSizing,
          }
        })
        return {
          index,
          text: String(cell.textContent || '')
            .replace(/\s+/gu, ' ')
            .trim(),
          cellWidth: cellRect.width,
          cellHeight: cellRect.height,
          contentHeight,
          pairCount: pairs.length,
          pairs,
        }
      })
      const pairStates = states.flatMap((state) =>
        state.pairs.map((pair) => ({
          ...pair,
          cellIndex: state.index,
          cellText: state.text,
        }))
      )
      return {
        checkedCount: states.length,
        pairCount: pairStates.length,
        headerText: String(
          document.querySelector('.erp-material-detail-paper__header')
            ?.textContent || ''
        ).replace(/\s+/gu, ' '),
        metaText: String(
          document.querySelector('.erp-engineering-print-meta-grid')
            ?.textContent || ''
        ).replace(/\s+/gu, ' '),
        narrowOrInlineStates: states.filter(
          (state) =>
            state.text &&
            state.pairs.some(
              (pair) =>
                pair.editorDisplay !== 'flex' ||
                pair.editorAlignItems !== 'center' ||
                pair.editorBoxSizing !== 'border-box' ||
                pair.editorAlignSelf !== 'baseline'
            )
        ),
        nonFillingValueSlots: pairStates.filter(
          (pair) =>
            pair.editorWidth <= 0 ||
            pair.editorHeight <= 0 ||
            (!/^(数量|备品|日期)[：:]/u.test(pair.label) &&
              pair.rightGap > 2) ||
            pair.labelEditorGap < 0 ||
            (!pair.isCompoundCell && pair.nextPairGap < 0)
        ),
        states,
        pairStates,
      }
    })
    assert(
      metrics.checkedCount === 9 &&
        metrics.pairCount === 9 &&
        !metrics.headerText.includes('毛向') &&
        metrics.metaText.includes('毛向') &&
        metrics.narrowOrInlineStates.length === 0 &&
        metrics.nonFillingValueSlots.length === 0,
      `物料分析明细表顶部短字段使用紧凑值槽，长字段铺满标签右侧空间；毛向应位于顶部信息区: ${JSON.stringify(metrics)}`
    )
  }

  const assertMaterialDetailMetaSourceHeaderVisual = async () => {
    const metrics = await page.evaluate(() => {
      const meta = document.querySelector(
        '.erp-material-detail-paper .erp-engineering-print-meta-grid'
      )
      const table = document.querySelector('.erp-material-detail-table')
      const metaRect = meta?.getBoundingClientRect()
      const tableRect = table?.getBoundingClientRect()
      const metaStyle = meta ? window.getComputedStyle(meta) : null
      const cells = [
        ...document.querySelectorAll(
          '.erp-material-detail-paper .erp-engineering-print-meta-grid > div'
        ),
      ]
      const states = cells.map((cell, index) => {
        const style = window.getComputedStyle(cell)
        return {
          index,
          text: String(cell.textContent || '')
            .replace(/\s+/gu, ' ')
            .trim(),
          left: cell.getBoundingClientRect().left,
          borderTopWidth: parseFloat(style.borderTopWidth || '0'),
          borderRightWidth: parseFloat(style.borderRightWidth || '0'),
          borderBottomWidth: parseFloat(style.borderBottomWidth || '0'),
          borderLeftWidth: parseFloat(style.borderLeftWidth || '0'),
        }
      })
      const firstCellRect = cells[0]?.getBoundingClientRect()
      const hairCell = cells.find((cell) =>
        cell.classList.contains('erp-engineering-print-meta-grid__hair-cell')
      )
      const hairCellStyle = hairCell ? window.getComputedStyle(hairCell) : null
      const hairCellRect = hairCell?.getBoundingClientRect()
      const metaBorderWidths = metaStyle
        ? [
            metaStyle.borderTopWidth,
            metaStyle.borderRightWidth,
            metaStyle.borderBottomWidth,
            metaStyle.borderLeftWidth,
          ].map((value) => parseFloat(value || '0'))
        : []
      return {
        foundMeta: Boolean(meta),
        foundTable: Boolean(table),
        checkedCount: states.length,
        metaBorderWidths,
        hairGridColumnStart: hairCellStyle?.gridColumnStart || '',
        hairLeftDelta:
          firstCellRect && hairCellRect
            ? Math.abs(hairCellRect.left - firstCellRect.left)
            : -1,
        tableTopGap:
          metaRect && tableRect
            ? Math.max(0, tableRect.top - metaRect.bottom)
            : -1,
        borderedStates: states.filter(
          (state) =>
            state.text &&
            (state.borderTopWidth > 0 ||
              state.borderRightWidth > 0 ||
              state.borderBottomWidth > 0 ||
              state.borderLeftWidth > 0)
        ),
        states,
      }
    })
    assert(
      metrics.foundMeta &&
        metrics.foundTable &&
        metrics.checkedCount === 9 &&
        metrics.metaBorderWidths.every((width) => width === 0) &&
        metrics.hairGridColumnStart === '1' &&
        metrics.hairLeftDelta <= 2 &&
        metrics.borderedStates.length === 0 &&
        metrics.tableTopGap <= 6,
      `物料分析明细表顶部信息区应按源 Excel 保持非格子打印视觉，毛向单独换行后应居左，主表格才开始画边框: ${JSON.stringify(metrics)}`
    )
  }

  const assertMaterialDetailTableWidthAndUnitWrapPolicy = async () => {
    const metrics = await page.evaluate(() => {
      const paper = document.querySelector('.erp-material-detail-paper')
      const table = document.querySelector('.erp-material-detail-table')
      const unitCell = [
        ...document.querySelectorAll(
          '.erp-material-detail-table tbody td:nth-child(6)'
        ),
      ].find((cell) =>
        String(cell.textContent || '')
          .replace(/\s+/gu, '')
          .toUpperCase()
          .includes('PCS')
      )
      const unitEditor = unitCell?.querySelector(
        '.erp-material-detail-table__editable'
      )
      const measureTextRect = (node) => {
        if (!node) return null
        const range = document.createRange()
        range.selectNodeContents(node)
        const rect = range.getBoundingClientRect()
        range.detach()
        return rect.width || rect.height ? rect : null
      }
      const paperRect = paper?.getBoundingClientRect()
      const tableRect = table?.getBoundingClientRect()
      const unitCellRect = unitCell?.getBoundingClientRect()
      const unitTextRect = measureTextRect(unitEditor)
      const paperStyle = paper ? window.getComputedStyle(paper) : null
      const unitStyle = unitEditor ? window.getComputedStyle(unitEditor) : null
      return {
        paperWidth: paperRect?.width || 0,
        tableWidth: tableRect?.width || 0,
        paddingLeft: parseFloat(paperStyle?.paddingLeft || '0'),
        paddingRight: parseFloat(paperStyle?.paddingRight || '0'),
        unitText: String(unitEditor?.textContent || '')
          .replace(/\s+/gu, ' ')
          .trim(),
        unitCellWidth: unitCellRect?.width || 0,
        unitTextWidth: unitTextRect?.width || 0,
        unitTextHeight: unitTextRect?.height || 0,
        unitLineHeight: parseFloat(unitStyle?.lineHeight || '0'),
        unitWhiteSpace: unitStyle?.whiteSpace || '',
        unitOverflowWrap: unitStyle?.overflowWrap || '',
        unitWordBreak: unitStyle?.wordBreak || '',
      }
    })
    assert(
      metrics.paperWidth > 0 &&
        metrics.tableWidth >= metrics.paperWidth - 24 &&
        metrics.paddingLeft <= 11 &&
        metrics.paddingRight <= 11 &&
        metrics.unitText === 'PCS' &&
        metrics.unitCellWidth >= metrics.unitTextWidth + 6 &&
        metrics.unitTextHeight <= metrics.unitLineHeight * 1.35 &&
        metrics.unitWhiteSpace === 'normal' &&
        metrics.unitOverflowWrap === 'anywhere' &&
        metrics.unitWordBreak === 'break-word',
      `物料分析明细表应收窄纸面左右留白，且单位列使用可换行策略，常规 PCS 仍应自然单行显示: ${JSON.stringify(metrics)}`
    )
  }

  const assertMaterialDetailPageBreakBottomBorder = async () => {
    await page.emulateMedia({ media: 'print' })
    try {
      const metrics = await page.evaluate(() => {
        const paper = document.querySelector('.erp-material-detail-paper')
        const table = document.querySelector('.erp-material-detail-table')
        const tbody = table?.querySelector('tbody')
        const sourceRow = tbody?.querySelector('tr')
        if (tbody && sourceRow) {
          while (tbody.querySelectorAll('tr').length < 72) {
            const clone = sourceRow.cloneNode(true)
            clone.classList.remove('erp-engineering-print-row--selected')
            clone
              .querySelectorAll('.erp-engineering-print-cell--selected')
              .forEach((cell) =>
                cell.classList.remove('erp-engineering-print-cell--selected')
              )
            tbody.appendChild(clone)
          }
        }

        const paperRect = paper?.getBoundingClientRect()
        const tableRect = table?.getBoundingClientRect()
        const tableStyle = table ? window.getComputedStyle(table) : null
        const rows = [...(tbody?.querySelectorAll('tr') || [])]
        const a4PageHeightPx = (297 / 25.4) * 96
        const firstPageBottom =
          paperRect && Number.isFinite(paperRect.top)
            ? paperRect.top + a4PageHeightPx
            : 0
        const rowStates = rows.map((row, index) => {
          const rect = row.getBoundingClientRect()
          return {
            index,
            top: rect.top,
            bottom: rect.bottom,
            height: rect.height,
          }
        })
        const pageTailRow = rowStates
          .filter((row) => row.bottom <= firstPageBottom - 1)
          .sort((left, right) => right.bottom - left.bottom)[0]
        const pageTailNode = rows[pageTailRow?.index ?? -1]
        const cells = [...(pageTailNode?.children || [])]
        const cellStates = cells.map((cell, index) => {
          const style = window.getComputedStyle(cell)
          return {
            index,
            text: String(cell.textContent || '')
              .replace(/\s+/gu, ' ')
              .trim(),
            borderBottomWidth: parseFloat(style.borderBottomWidth || '0'),
            borderLeftWidth: parseFloat(style.borderLeftWidth || '0'),
            borderRightWidth: parseFloat(style.borderRightWidth || '0'),
            borderBottomStyle: style.borderBottomStyle,
          }
        })
        return {
          foundPaper: Boolean(paper),
          foundTable: Boolean(table),
          rowCount: rows.length,
          a4PageHeightPx,
          firstPageBottom,
          tableBottom: tableRect?.bottom || 0,
          tableBorderCollapse: tableStyle?.borderCollapse || '',
          tableBorderSpacing: tableStyle?.borderSpacing || '',
          pageTailRow,
          pageTailDistance:
            pageTailRow && firstPageBottom
              ? firstPageBottom - pageTailRow.bottom
              : null,
          pageTailCellCount: cellStates.length,
          pageTailMissingBottomBorders: cellStates.filter(
            (cell) =>
              cell.borderBottomWidth < 1 || cell.borderBottomStyle === 'none'
          ),
          pageTailMissingSideBorders: cellStates.filter(
            (cell, index) =>
              cell.borderRightWidth < 1 ||
              (index === 0 && cell.borderLeftWidth < 1)
          ),
          cellStates,
        }
      })
      assert(
        metrics.foundPaper &&
          metrics.foundTable &&
          metrics.rowCount >= 72 &&
          metrics.tableBottom > metrics.firstPageBottom + 80 &&
          metrics.tableBorderCollapse === 'separate' &&
          /^0px(?: 0px)?$/u.test(metrics.tableBorderSpacing) &&
          metrics.pageTailRow &&
          metrics.pageTailCellCount > 0 &&
          metrics.pageTailDistance >= 0 &&
          metrics.pageTailDistance <= metrics.pageTailRow.height + 2 &&
          metrics.pageTailMissingBottomBorders.length === 0 &&
          metrics.pageTailMissingSideBorders.length === 0,
        `物料分析明细表跨页时上一页页尾行必须由单元格自身绘制底边线，不能依赖 collapsed table border: ${JSON.stringify(metrics)}`
      )
      const clip = await page.evaluate(() => {
        const paper = document.querySelector('.erp-material-detail-paper')
        const paperRect = paper?.getBoundingClientRect()
        const a4PageHeightPx = (297 / 25.4) * 96
        if (!paperRect) return null
        return {
          x: Math.max(0, paperRect.left),
          y: Math.max(0, paperRect.top + a4PageHeightPx - 68),
          width: Math.max(1, paperRect.width),
          height: 136,
        }
      })
      if (clip) {
        const fs = await import('node:fs/promises')
        const reviewDir = path.join(
          outputDir,
          'engineering-template-review',
          'runtime'
        )
        await fs.mkdir(reviewDir, { recursive: true })
        await page.screenshot({
          path: path.join(
            reviewDir,
            'material-detail-page-break-border-latest.png'
          ),
          clip,
        })
      }
    } finally {
      await page.emulateMedia({ media: 'screen' })
    }
  }

  const assertMaterialDetailFooterFieldsCompact = async () => {
    const metrics = await page.evaluate(() =>
      [
        ...document.querySelectorAll(
          '.erp-material-detail-paper__footer-field'
        ),
      ].map((field) => {
        const label = field.querySelector(
          '.erp-material-detail-paper__footer-label'
        )
        const value = field.querySelector(
          '.erp-material-detail-paper__footer-value'
        )
        const labelRect = label?.getBoundingClientRect()
        const valueRect = value?.getBoundingClientRect()
        const fieldRect = field.getBoundingClientRect()
        const fieldStyle = window.getComputedStyle(field)
        const valueStyle = value ? window.getComputedStyle(value) : null
        return {
          text: String(field.textContent || '').replace(/\s+/gu, ''),
          fieldDisplay: fieldStyle.display,
          fieldAlignItems: fieldStyle.alignItems,
          fieldHeight: fieldRect.height,
          labelRight: labelRect?.right || 0,
          valueLeft: valueRect?.left || 0,
          valueRight: valueRect?.right || 0,
          valueWidth: valueRect?.width || 0,
          valueHeight: valueRect?.height || 0,
          fieldWidth: fieldRect.width,
          labelValueGap:
            labelRect && valueRect ? valueRect.left - labelRect.right : -1,
          valueDisplay: valueStyle?.display || '',
          valueAlignItems: valueStyle?.alignItems || '',
          valueAlignSelf: valueStyle?.alignSelf || '',
          valueBoxSizing: valueStyle?.boxSizing || '',
        }
      })
    )
    assert.equal(
      metrics.length,
      2,
      `物料明细底部应保留审核和制表两个字段组: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.every(
        (item) =>
          item.fieldDisplay === 'grid' &&
          item.fieldAlignItems === 'baseline' &&
          item.fieldHeight >= 24 &&
          item.labelValueGap >= 0 &&
          item.labelValueGap <= 8 &&
          item.valueRight <= item.labelRight + item.fieldWidth &&
          item.valueDisplay === 'flex' &&
          item.valueAlignItems === 'center' &&
          item.valueAlignSelf === 'baseline' &&
          item.valueBoxSizing === 'border-box' &&
          item.valueWidth >= 100 &&
          item.valueHeight >= 24
      ),
      `物料明细底部字段名和值应紧邻排列，值槽应有稳定点击高度并沿用顶部信息区焦点命中口径: ${JSON.stringify(metrics)}`
    )
  }

  const assertMaterialDetailSourceNoiseExcluded = async () => {
    const metrics = await page.evaluate(() => {
      const paper = document.querySelector('.erp-material-detail-paper')
      const paperText = String(paper?.textContent || '').replace(/\s+/gu, '')
      return {
        summaryRowCount: document.querySelectorAll(
          '.erp-material-detail-paper__summary-row'
        ).length,
        hasSourceNoiseFooter: paperText.includes(
          '日期订单产品编号产品名称数量备品交期审核'
        ),
      }
    })
    assert.deepEqual(
      metrics,
      { summaryRowCount: 0, hasSourceNoiseFooter: false },
      `物料明细不应实现源 Excel 底部日期/订单/产品编号噪点行: ${JSON.stringify(metrics)}`
    )
  }

  const assertMaterialDetailFooterTracksTableInPrint = async () => {
    await page.emulateMedia({ media: 'print' })
    try {
      const metrics = await page.evaluate(() => {
        const paper = document.querySelector('.erp-material-detail-paper')
        const table = document.querySelector('.erp-material-detail-table')
        const footer = document.querySelector(
          '.erp-material-detail-paper__footer'
        )
        const paperRect = paper?.getBoundingClientRect()
        const tableRect = table?.getBoundingClientRect()
        const footerRect = footer?.getBoundingClientRect()
        const paperStyle = paper ? window.getComputedStyle(paper) : null
        const a4PageHeightPx = (297 / 25.4) * 96
        return {
          foundPaper: Boolean(paper),
          foundTable: Boolean(table),
          foundFooter: Boolean(footer),
          a4PageHeightPx,
          paperHeight: paperRect?.height || 0,
          tableHeight: tableRect?.height || 0,
          footerHeight: footerRect?.height || 0,
          footerTopGap:
            footerRect && tableRect ? footerRect.top - tableRect.bottom : null,
          footerBottomGap:
            footerRect && paperRect
              ? paperRect.bottom - footerRect.bottom
              : null,
          paperBoxSizing: paperStyle?.boxSizing || '',
        }
      })
      assert(
        metrics.foundPaper &&
          metrics.foundTable &&
          metrics.foundFooter &&
          metrics.paperBoxSizing === 'border-box' &&
          metrics.tableHeight > 0 &&
          metrics.footerHeight > 0 &&
          metrics.footerTopGap >= -1 &&
          metrics.footerTopGap <= 12 &&
          metrics.footerBottomGap >= 0 &&
          metrics.footerBottomGap <= 80 &&
          metrics.paperHeight < metrics.a4PageHeightPx,
        `物料分析明细表审核/制表应按源表贴近明细表下方，打印态纸面高度不能触发空白第二页: ${JSON.stringify(metrics)}`
      )
      await writeEngineeringPaperReviewScreenshot(
        '.erp-material-detail-paper',
        'material-detail-print-footer-near-table.png'
      )
    } finally {
      await page.emulateMedia({ media: 'screen' })
    }
  }
  return {
    assertMaterialDetailTableVerticalCentering,
    assertMaterialDetailMetaGridFieldValueTextAlignment,
    assertMaterialDetailMetaValueEditableCoverage,
    assertMaterialDetailMetaSourceHeaderVisual,
    assertMaterialDetailTableWidthAndUnitWrapPolicy,
    assertMaterialDetailPageBreakBottomBorder,
    assertMaterialDetailFooterFieldsCompact,
    assertMaterialDetailSourceNoiseExcluded,
    assertMaterialDetailFooterTracksTableInPrint,
  }
}
