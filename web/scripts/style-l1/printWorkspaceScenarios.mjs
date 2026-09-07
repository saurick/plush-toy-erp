import { assertPrintTemplateGuide } from './printTemplateGuideAssertions.mjs'
import { Buffer } from 'node:buffer'
import { createMaterialDetailInteractionScenario } from './materialDetailInteractionScenario.mjs'
import { createColorCardInteractionScenario } from './colorCardInteractionScenario.mjs'
import { createWorkInstructionInteractionScenario } from './workInstructionInteractionScenario.mjs'
import { printTemplateCatalog } from '../../src/erp/config/printTemplates.mjs'
import { createPrintPolishScenarios } from './printPolishScenarios.mjs'
import { createPrintWorkspaceControlScenarios } from './printWorkspaceControlScenarios.mjs'
import { createPrintWorkspaceFeedbackScenarios } from './printWorkspaceFeedbackScenarios.mjs'
import {
  assertEmptyEditorCaret,
  collectEmptyEditorSamples,
} from './printEmptyEditorAssertions.mjs'

export function createPrintWorkspaceScenarios({
  expectHeading,
  expectText,
  assertTextAbsent,
  assertNoDuplicatedAdminPageTitle,
  assert,
  assertNoHorizontalOverflow,
  assertERPThemeMode,
  assertDarkThemeContrast,
  assertEditablePrintWorkspacePopupRefresh,
  assertPrintCenterPreviewPopup,
  assertPrintWorkspacePaginationStyle,
  assertContractTableHeadersStaySingleLine,
  assertContractTableEditableAlignment,
  assertMaterialContractLineCellsWrapLongValues,
  assertContractTotalCellsWrapLargeNumbers,
  assertMaterialContractMetaAlignment,
  assertWorkspaceContinuedPageMargin,
  assertMaterialContractPrintMediaIgnoresResponsiveBreakpoints,
  path,
  outputDir,
  gotoScenarioPath,
  expectButton,
  assertProcessingContractPaperRowCount,
  assertProcessingContractSignatureLayout,
  assertMaterialDetailLineCellsWrapLongValues,
  webDir,
  assertPrintTemplateLongBusinessValuesStayInsidePaper,
  assertRowSelectionClearsAfterCancel,
  assertPrintPreviewPopup,
}) {
  const assertPrintEditableFocusBorderStyle = async (
    page,
    { selector, index = 0, scenarioLabel }
  ) => {
    await page.evaluate(() => document.fonts.ready)
    await page.locator(selector).nth(index).waitFor({
      state: 'visible',
      timeout: 10_000,
    })
    const metrics = await page
      .locator(selector)
      .nth(index)
      .evaluate((element) => {
        const before = element.getBoundingClientRect()
        element.focus()
        const cell = element.closest('td, th')
        const group = element.closest('[data-print-focus-group]')
        const frame = group || cell || element
        const frameStyle = getComputedStyle(frame)
        const box = frame.getBoundingClientRect()
        const after = element.getBoundingClientRect()
        const scale = box.width / frame.offsetWidth
        const outset = Number.parseFloat(frameStyle.outlineOffset) * scale
        const range = document.createRange()
        range.selectNodeContents(element)
        const text = range.getBoundingClientRect()
        const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
        const firstText = walker.nextNode()
        let caret = null
        if (firstText) {
          range.setStart(firstText, 0)
          range.collapse(true)
          caret = range.getBoundingClientRect()
        }
        const clearance = (rect) =>
          rect && rect.height > 0
            ? {
                top: (rect.top - box.top + outset) / scale,
                bottom: (box.bottom + outset - rect.bottom) / scale,
                left: (rect.left - box.left + outset) / scale,
                right: (box.right + outset - rect.right) / scale,
              }
            : null
        const neighboringText = []
        const neighbors = document.createTreeWalker(
          element.closest('.erp-print-shell__stage-wrap'),
          NodeFilter.SHOW_TEXT
        )
        for (
          let node = neighbors.nextNode();
          node;
          node = neighbors.nextNode()
        ) {
          if (
            !node.textContent.trim() ||
            frame.contains(node) ||
            ['STYLE', 'SCRIPT'].includes(node.parentElement.tagName) ||
            getComputedStyle(node.parentElement).visibility === 'hidden'
          ) {
            continue
          }
          const neighborRange = document.createRange()
          neighborRange.selectNodeContents(node)
          for (const rect of neighborRange.getClientRects()) {
            const overlapX =
              Math.min(box.right + outset, rect.right) -
              Math.max(box.left - outset, rect.left)
            const overlapY =
              Math.min(box.bottom + outset, rect.bottom) -
              Math.max(box.top - outset, rect.top)
            if (overlapX > 0.5 * scale && overlapY > 0.5 * scale) {
              neighboringText.push(node.textContent.trim().slice(0, 40))
            }
          }
        }
        return {
          activeElementMatches: document.activeElement === element,
          outlineStyle: frameStyle.outlineStyle,
          outlineColor: frameStyle.outlineColor,
          background: frameStyle.backgroundColor,
          wholeCell: Boolean(cell),
          grouped: Boolean(group),
          frameIsEditable: frame === element,
          cellFrameOutset:
            cell && frame === cell
              ? Number.parseFloat(frameStyle.outlineOffset) +
                Number.parseFloat(frameStyle.outlineWidth)
              : null,
          innerOutlineStyle: getComputedStyle(element).outlineStyle,
          widthChange: after.width - before.width,
          heightChange: after.height - before.height,
          textClearance: clearance(text),
          caretClearance: clearance(caret),
          neighboringText,
        }
      })
    assert(
      metrics.activeElementMatches &&
        metrics.outlineStyle === 'dashed' &&
        metrics.outlineColor === 'rgba(47, 143, 75, 0.82)' &&
        metrics.background === 'rgba(47, 143, 75, 0.08)' &&
        (!(metrics.wholeCell || metrics.grouped) ||
          metrics.frameIsEditable ||
          metrics.innerOutlineStyle === 'none') &&
        (metrics.cellFrameOutset === null ||
          metrics.cellFrameOutset <= -0.99) &&
        Math.abs(metrics.widthChange) < 0.5 &&
        Math.abs(metrics.heightChange) < 0.5,
      `${scenarioLabel} 焦点应显示单一绿色虚线框，表格覆盖整格，聚焦不改变纸面尺寸: ${JSON.stringify(metrics)}`
    )
    // 单元格内框与固定纸面文字至少留半像素净空；独立字段继续向外留白。
    const minimum = metrics.wholeCell ? 0.49 : 1.75
    assert(
      [metrics.textClearance, metrics.caretClearance].every(
        (gaps) => !gaps || Object.values(gaps).every((gap) => gap >= minimum)
      ),
      `${scenarioLabel} 焦点框不能压住文字或光标，左右和上下均须保留空隙: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      metrics.neighboringText.length,
      0,
      `${scenarioLabel} 焦点框不能覆盖相邻标签或其他行文字: ${JSON.stringify(metrics)}`
    )
    return metrics
  }
  const assertPrintEditableFocusSurvivesSwitch = async (
    page,
    { firstSelector, secondSelector, scenarioLabel }
  ) => {
    const first = page.locator(firstSelector).first()
    const second = page.locator(secondSelector).first()
    await first.waitFor({ state: 'visible', timeout: 10_000 })
    await second.waitFor({ state: 'visible', timeout: 10_000 })
    await first.click()
    await page.keyboard.press(
      process.platform === 'darwin' ? 'Meta+A' : 'Control+A'
    )
    await page.keyboard.type('9')
    await second.click()
    await page.waitForTimeout(600)
    const metrics = await second.evaluate((element) => {
      const frame =
        element.closest('[data-print-focus-group]') ||
        element.closest('td, th') ||
        element
      const style = window.getComputedStyle(frame)
      return {
        activeElementMatches: document.activeElement === element,
        outlineStyle: style.outlineStyle,
        background: style.backgroundColor,
        text: String(element.textContent || '').trim(),
      }
    })
    assert(
      metrics.activeElementMatches &&
        metrics.outlineStyle === 'dashed' &&
        metrics.background !== 'rgba(0, 0, 0, 0)',
      `${scenarioLabel} 从一个编辑框切到另一个编辑框后，前一个 blur 提交不应让新焦点和边框消失: ${JSON.stringify(metrics)}`
    )
  }
  const assertContractPaperSidePaddingAndTableWidth = async (
    page,
    { paperSelector, tableSelector, scenarioLabel, screenshotName }
  ) => {
    const metrics = await page.evaluate(
      ({ paperSelector, tableSelector }) => {
        const paper = document.querySelector(paperSelector)
        const table = document.querySelector(tableSelector)
        const paperRect = paper?.getBoundingClientRect()
        const tableRect = table?.getBoundingClientRect()
        const paperStyle = paper ? window.getComputedStyle(paper) : null
        return {
          foundPaper: Boolean(paper),
          foundTable: Boolean(table),
          paperWidth: paperRect?.width || 0,
          tableWidth: tableRect?.width || 0,
          paperPaddingLeft: Number.parseFloat(paperStyle?.paddingLeft || '0'),
          paperPaddingRight: Number.parseFloat(paperStyle?.paddingRight || '0'),
          tableLeftGap:
            paperRect && tableRect ? tableRect.left - paperRect.left : -1,
          tableRightGap:
            paperRect && tableRect ? paperRect.right - tableRect.right : -1,
          tableScrollWidth: table?.scrollWidth || 0,
          tableClientWidth: table?.clientWidth || 0,
          paperScrollWidth: paper?.scrollWidth || 0,
          paperClientWidth: paper?.clientWidth || 0,
        }
      },
      { paperSelector, tableSelector }
    )
    assert(
      metrics.foundPaper &&
        metrics.foundTable &&
        metrics.paperPaddingLeft >= 18 &&
        metrics.paperPaddingLeft <= 22 &&
        metrics.paperPaddingRight >= 18 &&
        metrics.paperPaddingRight <= 22 &&
        metrics.tableLeftGap <= metrics.paperPaddingLeft + 1 &&
        metrics.tableRightGap <= metrics.paperPaddingRight + 1 &&
        metrics.tableWidth >=
          metrics.paperWidth -
            metrics.paperPaddingLeft -
            metrics.paperPaddingRight -
            2 &&
        metrics.tableScrollWidth <= metrics.tableClientWidth + 1 &&
        metrics.paperScrollWidth <= metrics.paperClientWidth + 1,
      `${scenarioLabel} 纸面左右留白应收窄到 5mm 且表格不横向溢出: ${JSON.stringify(metrics)}`
    )
    if (screenshotName) {
      const paperLocator = page.locator(paperSelector).first()
      await paperLocator.screenshot({
        path: path.join(outputDir, `${screenshotName}.png`),
      })
    }
  }
  const assertPrintWorkspacePaperTopRhythm = async (
    page,
    { paperSelector, scenarioLabel, screenshotName = '' }
  ) => {
    const metrics = await page.evaluate((selector) => {
      const toolbar = document.querySelector('.erp-print-shell__toolbar')
      const content = document.querySelector('.erp-print-shell__content')
      const stage = document.querySelector('.erp-print-shell__stage')
      const paper = document.querySelector(selector)
      const toolbarRect = toolbar?.getBoundingClientRect()
      const contentRect = content?.getBoundingClientRect()
      const stageRect = stage?.getBoundingClientRect()
      const paperRect = paper?.getBoundingClientRect()
      const stageStyle = stage ? window.getComputedStyle(stage) : null
      const feedbackRect = document
        .querySelector('.erp-print-shell__feedback')
        ?.getBoundingClientRect()

      return {
        foundToolbar: Boolean(toolbar),
        foundContent: Boolean(content),
        foundStage: Boolean(stage),
        foundPaper: Boolean(paper),
        toolbarToContent:
          toolbarRect && contentRect
            ? contentRect.top - toolbarRect.bottom
            : -1,
        controlsBottom: feedbackRect?.bottom || toolbarRect?.bottom || 0,
        stageTop: stageRect?.top || 0,
        contentToStage:
          contentRect && stageRect ? stageRect.top - contentRect.top : -1,
        stageToPaper:
          stageRect && paperRect ? paperRect.top - stageRect.top : -1,
        toolbarToPaper:
          toolbarRect && paperRect ? paperRect.top - toolbarRect.bottom : -1,
        stagePaddingTop: Number.parseFloat(stageStyle?.paddingTop || '0'),
        stageBorderTop: Number.parseFloat(stageStyle?.borderTopWidth || '0'),
        stageScrollHeight: stage?.scrollHeight || 0,
        stageClientHeight: stage?.clientHeight || 0,
        paperTop: paperRect?.top || 0,
        paperWidth: paperRect?.width || 0,
      }
    }, paperSelector)

    assert(
      metrics.foundToolbar &&
        metrics.foundContent &&
        metrics.foundStage &&
        metrics.foundPaper &&
        Math.abs(metrics.toolbarToContent - 12) <= 1 &&
        metrics.stageTop >= metrics.controlsBottom &&
        metrics.stageTop <= metrics.controlsBottom + 20 &&
        Math.abs(metrics.stagePaddingTop - 24) <= 1 &&
        Math.abs(metrics.stageToPaper - 25) <= 1 &&
        Math.abs(metrics.toolbarToPaper - metrics.contentToStage - 37) <= 1 &&
        metrics.paperWidth > 700,
      `${scenarioLabel} 纸面编辑区到顶部工具栏的外层间距应和五套正式模板一致: ${JSON.stringify(metrics)}`
    )

    if (screenshotName) {
      await page.screenshot({
        path: path.join(outputDir, `${screenshotName}.png`),
        fullPage: false,
      })
    }
  }
  const createAppendixSVGFile = (
    templateKey,
    { index, width = 640, height = 360, label = `Appendix ${index}` }
  ) => {
    const colors = ['#dbeafe', '#dcfce7', '#fef3c7', '#fce7f3', '#ede9fe']
    const color = colors[(Math.max(1, Number(index)) - 1) % colors.length]
    const bandHeight = Math.max(180, Math.min(600, Math.round(height / 4)))
    const bands = Array.from(
      { length: Math.max(1, Math.ceil(height / bandHeight)) },
      (_, bandIndex) => {
        const y = bandIndex * bandHeight
        return [
          `<rect x="0" y="${y}" width="${width}" height="${Math.min(
            bandHeight,
            height - y
          )}" fill="${bandIndex % 2 === 0 ? color : '#ffffff'}"/>`,
          `<text x="${width / 2}" y="${Math.min(
            height - 24,
            y + bandHeight / 2
          )}" text-anchor="middle" font-family="sans-serif" font-size="${Math.max(
            28,
            Math.min(52, Math.round(width / 12))
          )}" fill="#0f172a">${label} · ${bandIndex + 1}</text>`,
        ].join('')
      }
    ).join('')
    const name = `${templateKey}-appendix-${index}.svg`
    const svg = [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
      bands,
      `<rect x="8" y="8" width="${Math.max(1, width - 16)}" height="${Math.max(
        1,
        height - 16
      )}" rx="18" fill="none" stroke="#334155" stroke-width="4"/>`,
      '</svg>',
    ].join('')
    return {
      name,
      mimeType: 'image/svg+xml',
      buffer: Buffer.from(svg),
    }
  }
  const createAppendixSVGFiles = (templateKey, startIndex, count) => {
    const halfWidthHeights = [360, 520, 420, 640, 480]
    return Array.from({ length: count }, (_, offset) => {
      const index = startIndex + offset
      return createAppendixSVGFile(templateKey, {
        index,
        height: halfWidthHeights[(index - 1) % halfWidthHeights.length],
      })
    })
  }
  const waitForPrintAppendixImageCount = async (
    page,
    { paperSelector, expectedCount }
  ) => {
    await page.waitForFunction(
      ({ paperSelector, expectedCount }) => {
        const paper = document.querySelector(paperSelector)
        const appendix = paper?.querySelector('[data-print-appendix-images]')
        const manager = document.querySelector('[data-print-appendix-manager]')
        const logicalImages = Array.from(
          appendix?.querySelectorAll('[data-print-appendix-image-id]') || []
        )
        const renderedSegments = Array.from(
          appendix?.querySelectorAll('[data-print-appendix-segment] img') || []
        )
        return (
          appendix?.getAttribute('data-print-appendix-image-count') ===
            String(expectedCount) &&
          manager?.querySelectorAll('[data-print-appendix-manager-item]')
            .length === expectedCount &&
          logicalImages.length === expectedCount &&
          renderedSegments.length >= expectedCount &&
          renderedSegments.every(
            (image) => image.complete && image.naturalWidth > 0
          )
        )
      },
      { paperSelector, expectedCount },
      { timeout: 20_000 }
    )
  }
  const assertPrintAppendixImageLayout = async (
    page,
    {
      templateTitle,
      paperSelector,
      expectedNames,
      expectedLayouts = expectedNames.map(() => 'half'),
      expectedRequestedLayouts = expectedNames.map(() => 'auto'),
      expectedSegmentCounts = expectedNames.map(() => 1),
    }
  ) => {
    await page.waitForFunction(
      ({ paperSelector, expectedNames }) => {
        const paper = document.querySelector(paperSelector)
        const appendix = paper?.querySelector('[data-print-appendix-images]')
        const names = Array.from(
          appendix?.querySelectorAll('[data-print-appendix-image-id]') || []
        ).map((image) => image.getAttribute('data-print-appendix-image-name'))
        return JSON.stringify(names) === JSON.stringify(expectedNames)
      },
      { paperSelector, expectedNames },
      { timeout: 10_000 }
    )
    const metrics = await page.evaluate((paperSelector) => {
      const paper = document.querySelector(paperSelector)
      const appendix = paper?.querySelector('[data-print-appendix-images]')
      const manager = document.querySelector('[data-print-appendix-manager]')
      const rows = Array.from(
        appendix?.querySelectorAll('[data-print-appendix-row]') || []
      )
      const images = Array.from(
        appendix?.querySelectorAll('[data-print-appendix-image-id]') || []
      )
      const rowMetrics = rows.map((row) => {
        const rowRect = row.getBoundingClientRect()
        const rowImages = Array.from(
          row.querySelectorAll('[data-print-appendix-image-id]')
        )
        const itemRects = rowImages.map((item) => item.getBoundingClientRect())
        return {
          layout: row.getAttribute('data-print-appendix-row-layout'),
          itemCount: rowImages.length,
          gridColumnCount: window
            .getComputedStyle(row)
            .gridTemplateColumns.split(/\s+/u)
            .filter(Boolean).length,
          top: rowRect.top,
          bottom: rowRect.bottom,
          itemTops: itemRects.map((rect) => rect.top),
          itemBottoms: itemRects.map((rect) => rect.bottom),
        }
      })
      const imageMetrics = images.map((item) => {
        const segmentImages = Array.from(item.querySelectorAll('img'))
        return {
          name: item.getAttribute('data-print-appendix-image-name'),
          requestedLayout: item.getAttribute(
            'data-print-appendix-requested-layout'
          ),
          resolvedLayout: item.getAttribute(
            'data-print-appendix-resolved-layout'
          ),
          column: item.getAttribute('data-print-appendix-column'),
          segmentCount: Number(
            item.getAttribute('data-print-appendix-segment-count') || 0
          ),
          objectFits: segmentImages.map(
            (image) => window.getComputedStyle(image).objectFit
          ),
          segmentRatios: segmentImages.map((image) => {
            const rect = image.getBoundingClientRect()
            return {
              rendered: rect.width > 0 ? rect.height / rect.width : 0,
              natural:
                image.naturalWidth > 0
                  ? image.naturalHeight / image.naturalWidth
                  : 0,
            }
          }),
        }
      })
      return {
        managerCount: document.querySelectorAll('[data-print-appendix-manager]')
          .length,
        managerInRecordPanel: Boolean(
          manager?.closest('.erp-print-shell__record-panel')
        ),
        managerInStage: Boolean(manager?.closest('.erp-print-shell__stage')),
        appendixCount: paper?.querySelectorAll('[data-print-appendix-images]')
          .length,
        declaredImageCount: appendix?.getAttribute(
          'data-print-appendix-image-count'
        ),
        rows: rowMetrics,
        images: imageMetrics,
        managerInsidePaper: Boolean(
          paper?.querySelector('[data-print-appendix-manager]')
        ),
        managerActionButtonsInsidePaper:
          paper?.querySelectorAll(
            '.erp-print-appendix-manager__item-actions button'
          ).length || 0,
      }
    }, paperSelector)
    const expectedRows = []
    let pendingHalf = []
    const flushHalf = () => {
      if (!pendingHalf.length) return
      expectedRows.push({ layout: 'half', indexes: pendingHalf })
      pendingHalf = []
    }
    expectedLayouts.forEach((layout, imageIndex) => {
      if (layout === 'full') {
        flushHalf()
        expectedRows.push({ layout: 'full', indexes: [imageIndex] })
        return
      }
      pendingHalf.push(imageIndex)
      if (pendingHalf.length === 2) flushHalf()
    })
    flushHalf()
    const expectedColumns = expectedRows.flatMap((row) =>
      row.indexes.map((_, columnIndex) =>
        row.layout === 'full' ? 'full' : columnIndex === 0 ? 'left' : 'right'
      )
    )

    assert.equal(
      metrics.managerCount,
      1,
      `${templateTitle} 应只有一个末尾附图管理区: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      metrics.managerInRecordPanel,
      true,
      `${templateTitle} 末尾附图管理区应位于左侧控制面: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      metrics.managerInStage,
      false,
      `${templateTitle} 末尾附图管理区不应进入右侧纸面: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      metrics.appendixCount,
      1,
      `${templateTitle} 纸面应渲染一个末尾附图区: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      metrics.declaredImageCount,
      String(expectedNames.length),
      `${templateTitle} 纸面末尾附图数量不符: ${JSON.stringify(metrics)}`
    )
    assert.deepEqual(
      metrics.rows.map((row) => ({
        layout: row.layout,
        itemCount: row.itemCount,
      })),
      expectedRows.map((row) => ({
        layout: row.layout,
        itemCount: row.indexes.length,
      })),
      `${templateTitle} 末尾附图混排行结构不符: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.rows.every(
        (row) =>
          row.gridColumnCount === (row.layout === 'full' ? 1 : 2) &&
          row.itemTops.every((top) => Math.abs(top - row.top) <= 1) &&
          Math.abs(Math.max(...row.itemBottoms) - row.bottom) <= 1
      ),
      `${templateTitle} 半宽行应顶部对齐并由较高图片决定行高，整行图片应独占一列: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.rows.some(
        (row) =>
          row.layout === 'half' &&
          row.itemBottoms.length === 2 &&
          Math.abs(row.itemBottoms[0] - row.itemBottoms[1]) >= 10
      ),
      `${templateTitle} 场景必须包含一组不同高度的半宽图片，才能真实证明下一行按较高图片换行: ${JSON.stringify(metrics)}`
    )
    assert.deepEqual(
      metrics.images.map((image) => image.name),
      expectedNames,
      `${templateTitle} 末尾附图纸面顺序应和控制面顺序一致: ${JSON.stringify(metrics)}`
    )
    assert.deepEqual(
      metrics.images.map((image) => image.column),
      expectedColumns,
      `${templateTitle} 末尾附图列位置不符: ${JSON.stringify(metrics)}`
    )
    assert.deepEqual(
      metrics.images.map((image) => image.requestedLayout),
      expectedRequestedLayouts,
      `${templateTitle} 末尾附图手动排版偏好不符: ${JSON.stringify(metrics)}`
    )
    assert.deepEqual(
      metrics.images.map((image) => image.resolvedLayout),
      expectedLayouts,
      `${templateTitle} 末尾附图实际排版不符: ${JSON.stringify(metrics)}`
    )
    assert.deepEqual(
      metrics.images.map((image) => image.segmentCount),
      expectedSegmentCounts,
      `${templateTitle} 末尾附图切片数量不符: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.images.every(
        (image) =>
          image.objectFits.every((objectFit) => objectFit === 'contain') &&
          image.segmentRatios.every(
            (ratio) => Math.abs(ratio.rendered - ratio.natural) <= 0.02
          )
      ),
      `${templateTitle} 末尾附图应保持原始比例且不裁切: ${JSON.stringify(metrics)}`
    )
    assert(
      metrics.rows.every(
        (row, rowIndex) =>
          rowIndex === metrics.rows.length - 1 ||
          metrics.rows[rowIndex + 1].top >= row.bottom
      ),
      `${templateTitle} 下一行必须从上一行最高图片下方开始: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      metrics.managerInsidePaper,
      false,
      `${templateTitle} 纸面 DOM 不应包含末尾附图管理区: ${JSON.stringify(metrics)}`
    )
    assert.equal(
      metrics.managerActionButtonsInsidePaper,
      0,
      `${templateTitle} 纸面 DOM 不应包含前移、后移或移除按钮: ${JSON.stringify(metrics)}`
    )
  }
  return [
    ...createPrintWorkspaceFeedbackScenarios({
      assert,
      path,
      outputDir,
      gotoScenarioPath,
    }),
    ...createPrintWorkspaceControlScenarios({
      assert,
      path,
      outputDir,
      gotoScenarioPath,
    }),
    ...createPrintPolishScenarios({
      assert,
      path,
      outputDir,
      gotoScenarioPath,
    }),
    {
      name: 'print-center-desktop',
      path: '/erp/print-center',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '模板打印中心')
        await expectText(page, '打开编辑与打印')
        await expectText(page, '模板')
        await expectText(page, '采购合同')
        await expectText(page, '加工合同')
        await assertTextAbsent(page, '样品确认单')
        await assertTextAbsent(page, '候选模板 / 未启用')
        await expectText(page, '版式示意')
        await assertTextAbsent(page, '字段映射')
        await assertTextAbsent(page, '字段核对')
        await assertTextAbsent(page, '运营中枢')
        await assertTextAbsent(page, '模板数量')
        await assertTextAbsent(page, '示例记录')
        await assertTextAbsent(page, '打开可编辑打印窗口')
        await assertTextAbsent(page, '打开当前模板')
        await assertNoDuplicatedAdminPageTitle(page, {
          scenarioName: 'print-center-desktop',
        })
        const printCenterLayout = await page.evaluate(() => {
          const root = document.querySelector('.erp-print-center-page')
          const workbench = document.querySelector(
            '.erp-print-center-workbench'
          )
          const panels = [
            '.erp-print-center-nav-panel',
            '.erp-print-center-preview-panel',
          ].map((selector) => document.querySelector(selector))

          return {
            commandRailInPage: Boolean(
              root?.querySelector('.erp-command-center-rail')
            ),
            oldHero: Boolean(
              root?.querySelector('.erp-print-center-hero-card')
            ),
            oldSampleCard: Boolean(
              root?.querySelector('.erp-print-center-sample-card')
            ),
            panelCount: panels.filter(Boolean).length,
            gridTemplateColumns:
              workbench &&
              window.getComputedStyle(workbench).gridTemplateColumns,
          }
        })
        assert.equal(
          printCenterLayout.commandRailInPage,
          false,
          `打印中心不应再嵌套运营中枢导航: ${JSON.stringify(printCenterLayout)}`
        )
        assert.equal(
          printCenterLayout.oldHero,
          false,
          `打印中心不应保留旧 hero 卡: ${JSON.stringify(printCenterLayout)}`
        )
        assert.equal(
          printCenterLayout.oldSampleCard,
          false,
          `打印中心右栏不应保留示例记录卡: ${JSON.stringify(printCenterLayout)}`
        )
        assert.equal(
          printCenterLayout.panelCount,
          2,
          `打印中心应保持模板导航和纸面预览两栏: ${JSON.stringify(printCenterLayout)}`
        )
        const templateButtonSemantics = await page.evaluate(() =>
          [...document.querySelectorAll('.erp-print-center-template-btn')].map(
            (button) => {
              const style = window.getComputedStyle(button)
              return {
                tagName: button.tagName,
                cursor: style.cursor,
                ariaPressed: button.getAttribute('aria-pressed'),
                iconCount: button.querySelectorAll('.anticon').length,
                text: button.textContent?.replace(/\s+/g, ' ').trim() || '',
                scrollWidth: button.scrollWidth,
                clientWidth: button.clientWidth,
              }
            }
          )
        )
        assert.equal(
          templateButtonSemantics.length,
          5,
          `打印模板目录应展示五套正式模板按钮: ${JSON.stringify(templateButtonSemantics)}`
        )
        assert(
          templateButtonSemantics.every(
            (item) =>
              item.tagName === 'BUTTON' &&
              item.cursor === 'pointer' &&
              ['true', 'false'].includes(item.ariaPressed) &&
              item.iconCount === (item.ariaPressed === 'true' ? 1 : 0) &&
              item.scrollWidth <= item.clientWidth + 1
          ),
          `打印模板目录按钮应明确暴露选择动作和当前态: ${JSON.stringify(templateButtonSemantics)}`
        )
        await page
          .locator('.erp-print-center-template-list')
          .getByRole('button', { name: /^加工合同/ })
          .click()
        assert.match(
          page.url(),
          /[?&]template=processing-contract(?:&|$)/,
          '切换打印模板应写入 URL 以便刷新恢复'
        )
        for (const title of [
          '采购合同',
          '加工合同',
          '物料分析明细表',
          '色卡',
          '作业指导书',
        ]) {
          await page
            .locator('.erp-print-center-template-list')
            .getByRole('button', { name: title, exact: true })
            .click()
          await assertPrintTemplateGuide(page)
        }
        await page.reload()
        await page
          .getByRole('heading', { name: '作业指导书', exact: true })
          .waitFor({ state: 'visible' })
        await assertPrintTemplateGuide(page)
        const lastTemplateButton = page
          .locator('.erp-print-center-template-list')
          .getByRole('button', { name: '作业指导书', exact: true })
        await lastTemplateButton.press('Tab')
        const focusInPreview = await page.evaluate(() =>
          Boolean(document.activeElement?.closest('.erp-template-guide__paper'))
        )
        assert.equal(focusInPreview, false, 'Tab 不应进入只读缩略图的编辑字段')
        await assertTextAbsent(page, '页面结构')
        await assertTextAbsent(page, '适用场景')
        await assertTextAbsent(page, '版式特点')
        await assertTextAbsent(page, '输出方式')
        await assertTextAbsent(page, '模板来源')
        await assertTextAbsent(page, '使用提醒')
        await assertNoHorizontalOverflow(page, 'print-center-desktop')
      },
    },
    {
      name: 'print-center-dark-desktop',
      path: '/erp/print-center',
      auth: 'admin',
      themeMode: 'dark',
      viewport: { width: 2048, height: 1024 },
      verify: async (page) => {
        await expectHeading(page, '模板打印中心')
        await expectText(page, '打开编辑与打印')
        await expectText(page, '模板')
        await expectText(page, '采购合同')
        await expectText(page, '加工合同')
        await assertTextAbsent(page, '样品确认单')
        await expectText(page, '版式示意')
        await assertTextAbsent(page, '字段映射')
        await assertTextAbsent(page, '运营中枢')
        await assertTextAbsent(page, '示例记录')
        for (const title of [
          '采购合同',
          '加工合同',
          '物料分析明细表',
          '色卡',
          '作业指导书',
        ]) {
          await page
            .locator('.erp-print-center-template-list')
            .getByRole('button', { name: title, exact: true })
            .click()
          await assertPrintTemplateGuide(page)
        }
        await assertERPThemeMode(page, {
          scenarioName: 'print-center-dark-desktop',
          expectedMode: 'dark',
          expectedEffectiveTheme: 'dark',
        })
        await assertDarkThemeContrast(page, {
          scenarioName: 'print-center-dark-desktop',
          selector: '.erp-print-center-page',
        })
        await assertNoHorizontalOverflow(page, 'print-center-dark-desktop')
      },
    },
    {
      name: 'print-center-engineering-preview-tablet',
      path: '/erp/print-center?template=engineering-material-detail',
      auth: 'admin',
      themeMode: 'dark',
      viewport: { width: 968, height: 534 },
      verify: async (page) => {
        await expectHeading(page, '模板打印中心')
        await expectText(page, '版式示意')
        const templateButtons = [
          { name: /^物料分析明细表/, title: '物料分析明细表' },
          { name: /^色卡/, title: '色卡' },
          { name: /^作业指导书/, title: '作业指导书' },
        ]
        for (const template of templateButtons) {
          await page
            .locator('.erp-print-center-template-list')
            .getByRole('button', { name: template.name })
            .click()
          await page
            .locator('.erp-print-center-preview-panel')
            .getByRole('heading', { name: template.title, exact: true })
            .waitFor({ state: 'visible' })
          await assertPrintTemplateGuide(page)
          const metrics = await page.evaluate((expectedTitle) => {
            const workbench = document.querySelector(
              '.erp-print-center-workbench'
            )
            const navPanel = document.querySelector(
              '.erp-print-center-nav-panel'
            )
            const previewPanel = document.querySelector(
              '.erp-print-center-preview-panel'
            )
            const previewPaper = document.querySelector(
              '.erp-template-guide__thumbnail'
            )
            const navRect = navPanel?.getBoundingClientRect()
            const previewRect = previewPanel?.getBoundingClientRect()
            const paperRect = previewPaper?.getBoundingClientRect()
            return {
              gridTemplateColumns:
                workbench &&
                window.getComputedStyle(workbench).gridTemplateColumns,
              navRect: navRect
                ? {
                    x: navRect.x,
                    y: navRect.y,
                    width: navRect.width,
                    height: navRect.height,
                  }
                : null,
              previewRect: previewRect
                ? {
                    x: previewRect.x,
                    y: previewRect.y,
                    width: previewRect.width,
                    height: previewRect.height,
                  }
                : null,
              paperRect: paperRect
                ? {
                    width: paperRect.width,
                    height: paperRect.height,
                  }
                : null,
              previewText:
                previewPanel?.textContent?.replace(/\s+/gu, ' ').trim() || '',
              viewportHeight: window.innerHeight,
              documentScrollWidth: document.documentElement.scrollWidth,
              documentClientWidth: document.documentElement.clientWidth,
              expectedTitle,
            }
          }, template.title)
          assert(
            metrics.gridTemplateColumns &&
              metrics.gridTemplateColumns.split(' ').length >= 2,
            `968px 下工程模板预览不应被过早堆到列表下方: ${JSON.stringify(
              metrics
            )}`
          )
          assert(
            metrics.navRect &&
              metrics.previewRect &&
              metrics.previewRect.x > metrics.navRect.x &&
              metrics.previewRect.y <= metrics.navRect.y + 4 &&
              metrics.previewRect.y < metrics.viewportHeight - 160,
            `968px 下工程模板纸面预览应与模板列表同屏可见: ${JSON.stringify(
              metrics
            )}`
          )
          assert(
            metrics.paperRect?.width >= 190 &&
              metrics.paperRect?.height >= 260 &&
              metrics.previewText.includes(template.title),
            `工程模板纸面预览应渲染当前模板样例: ${JSON.stringify(metrics)}`
          )
          assert(
            metrics.documentScrollWidth <= metrics.documentClientWidth + 2,
            `工程模板预览不应产生横向溢出: ${JSON.stringify(metrics)}`
          )
        }
        await assertERPThemeMode(page, {
          scenarioName: 'print-center-engineering-preview-tablet',
          expectedMode: 'dark',
          expectedEffectiveTheme: 'dark',
        })
        await assertNoHorizontalOverflow(
          page,
          'print-center-engineering-preview-tablet'
        )
      },
    },
    {
      name: 'print-center-mobile',
      path: '/erp/print-center?template=engineering-color-card',
      auth: 'admin',
      viewport: { width: 390, height: 844 },
      verify: async (page) => {
        await expectHeading(page, '模板打印中心')
        for (const title of [
          '采购合同',
          '加工合同',
          '物料分析明细表',
          '色卡',
          '作业指导书',
        ]) {
          await page
            .locator('.erp-print-center-template-list')
            .getByRole('button', { name: title, exact: true })
            .click()
          await assertPrintTemplateGuide(page)
          await assertNoHorizontalOverflow(page, 'print-center-mobile')
        }
      },
    },
    {
      name: 'print-preview-material',
      path: '/erp/print-center/material-purchase-contract',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '采购合同')
        await expectText(page, '模板预览入口')
        await expectText(page, '打开可编辑打印窗口')
        await expectText(page, '返回打印中心')
      },
    },
    {
      name: 'print-preview-material-dark-desktop',
      path: '/erp/print-center/material-purchase-contract',
      auth: 'admin',
      themeMode: 'dark',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '采购合同')
        await expectText(page, '模板预览入口')
        await expectText(page, '打开可编辑打印窗口')
        await expectText(page, '返回打印中心')
        await assertERPThemeMode(page, {
          scenarioName: 'print-preview-material-dark-desktop',
          expectedMode: 'dark',
          expectedEffectiveTheme: 'dark',
        })
        await assertDarkThemeContrast(page, {
          scenarioName: 'print-preview-material-dark-desktop',
          selector: '.erp-admin-content',
        })
      },
    },
    {
      name: 'print-preview-processing',
      path: '/erp/print-center/processing-contract',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectHeading(page, '加工合同')
        await expectText(page, '模板预览入口')
        await expectText(page, '打开可编辑打印窗口')
        await expectText(page, '返回打印中心')
        await expectText(page, '受托方签字人')
        await expectText(page, '加工项目')
        await expectText(page, '面*1')
        const totalRow = page.locator('.erp-print-table__total')
        await totalRow.getByText('300', { exact: true }).waitFor()
        await totalRow.getByText('45', { exact: true }).waitFor()
      },
    },
    {
      name: 'print-workspace-material-shell-refresh',
      path: '/erp/print-center?template=material-purchase-contract',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await assertEditablePrintWorkspacePopupRefresh(page, {
          expectedTitle: '采购合同',
          editableSelector:
            '.erp-material-contract-table tbody td [contenteditable="true"]',
          editableScenarioLabel: '采购合同弹窗刷新恢复',
          signatureValueSelector:
            '.erp-material-contract-signature__name, .erp-material-contract-signature__date-value',
          signatureTextsToClear: ['签字人', '供应商签字人'],
          signatureTextsToRetain: ['2026/2/28'],
        })
      },
    },
    {
      name: 'print-workspace-processing-shell-refresh',
      path: '/erp/print-center?template=processing-contract',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await assertEditablePrintWorkspacePopupRefresh(page, {
          expectedTitle: '加工合同',
          editableSelector:
            '.erp-processing-contract-table tbody td [contenteditable="true"]',
          editableScenarioLabel: '加工合同弹窗刷新恢复',
          signatureValueSelector:
            '.erp-processing-contract-signature__name-value, .erp-processing-contract-signature__date-value',
          signatureTextsToClear: ['签字人', '受托方签字人'],
          signatureTextsToRetain: ['2025-06-08'],
        })
      },
    },
    {
      name: 'print-workspace-engineering-material-detail-shell-refresh',
      path: '/erp/print-center?template=engineering-material-detail',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await assertEditablePrintWorkspacePopupRefresh(page, {
          expectedTitle: '物料分析明细表',
          editableSelector:
            '.erp-material-detail-table tbody td .erp-engineering-print-editable[contenteditable="true"]',
          editableScenarioLabel: '物料分析明细表弹窗刷新恢复',
        })
      },
    },
    {
      name: 'print-workspace-engineering-color-card-shell-refresh',
      path: '/erp/print-center?template=engineering-color-card',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await assertEditablePrintWorkspacePopupRefresh(page, {
          expectedTitle: '色卡',
          editableSelector:
            '.erp-color-card-paper__position-cell .erp-engineering-print-editable[contenteditable="true"]',
          editableScenarioLabel: '色卡弹窗刷新恢复',
        })
      },
    },
    {
      name: 'print-workspace-engineering-work-instruction-shell-refresh',
      path: '/erp/print-center?template=engineering-work-instruction',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await assertEditablePrintWorkspacePopupRefresh(page, {
          expectedTitle: '作业指导书',
          editableSelector:
            '.erp-work-instruction-paper__step-content-cell .erp-engineering-print-editable[contenteditable="true"]',
          editableScenarioLabel: '作业指导书弹窗刷新恢复',
        })
      },
    },
    {
      name: 'print-center-processing-preview-popup',
      path: '/erp/print-center?template=processing-contract',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await assertPrintCenterPreviewPopup(page, {
          expectedWorkspaceTitle: '加工合同',
          buttonName: '在线预览 PDF',
          title: '加工合同 PDF 预览',
          screenshotName: 'print-center-processing-preview-popup-window',
        })
      },
    },
    {
      name: 'print-workspace-material',
      path: '/erp/print-workspace/material-purchase-contract',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectText(page, '采购合同')
        await page
          .getByRole('complementary', { name: '打印编辑工具' })
          .waitFor({ state: 'visible' })
        await expectText(page, '使用默认模板')
        await expectText(page, '在线预览 PDF')
        await expectText(page, '选择明细行')
        await expectText(page, '下载 PDF')
        await assertPrintWorkspacePaginationStyle(page, {
          paperSelector: '.erp-material-contract-paper',
          rowSelector: '.erp-material-contract-table tbody tr',
          theadSelector: '.erp-material-contract-table thead',
        })
        await assertPrintWorkspacePaperTopRhythm(page, {
          paperSelector: '.erp-material-contract-paper',
          scenarioLabel: '采购合同模板',
          screenshotName: 'print-workspace-material-paper-top-rhythm',
        })
        await assertContractPaperSidePaddingAndTableWidth(page, {
          paperSelector: '.erp-material-contract-paper',
          tableSelector: '.erp-material-contract-table',
          scenarioLabel: '采购合同模板',
          screenshotName: 'print-workspace-material-contract-narrow-padding',
        })
        await assertContractTableHeadersStaySingleLine(page, {
          tableSelector: '.erp-material-contract-table',
          expectedHeaders: [
            '采购订单号',
            '产品订单编号',
            '产品编号',
            '产品名称',
            '材料品名',
            '厂商料号',
            '规格',
            '单位',
            '单价',
            '采购数量',
            '采购金额',
            '备注',
          ],
        })
        await assertContractTableEditableAlignment(page, {
          tableSelector: '.erp-material-contract-table',
          editableSelector:
            '.erp-material-contract-table tbody td [contenteditable="true"]',
          scenarioLabel: '采购合同模板表格',
        })
        await assertPrintEditableFocusBorderStyle(page, {
          selector:
            '.erp-material-contract-table tbody td [contenteditable="true"]',
          scenarioLabel: '采购合同模板表格',
        })
        await assertMaterialContractLineCellsWrapLongValues(page, {
          scenarioLabel: '采购合同明细长编号带值',
        })
        await assertContractTotalCellsWrapLargeNumbers(page, {
          templateKind: 'material',
          totalValueSelector:
            '.erp-material-contract-table__total .erp-contract-table__total-value',
          scenarioLabel: '采购合同模板合计行',
        })
        await assertMaterialContractMetaAlignment(page)
        await assertWorkspaceContinuedPageMargin(page, {
          paperSelector: '.erp-material-contract-paper',
          clearMerges: true,
        })
      },
    },
    {
      name: 'print-workspace-material-print-media-narrow-viewport',
      path: '/erp/print-workspace/material-purchase-contract',
      auth: 'admin',
      viewport: { width: 760, height: 900 },
      verify: async (page) => {
        await expectText(page, '采购合同')
        const paper = page.locator('.erp-material-contract-paper').first()
        const readPaperSize = () =>
          paper.evaluate((node) => ({
            layoutWidth: node.offsetWidth,
            visibleWidth: node.getBoundingClientRect().width,
            flexShrink: window.getComputedStyle(node).flexShrink,
            wrapperWidth: node.parentElement.getBoundingClientRect().width,
          }))
        const zoom = page.getByLabel('显示比例')
        await zoom.selectOption('1')
        const original = await readPaperSize()
        assert(
          Math.abs(original.layoutWidth - (210 * 96) / 25.4) <= 1,
          '窄视口仍应使用 A4 的固定布局宽度'
        )
        await zoom.selectOption('1.5')
        const enlarged = await readPaperSize()
        assert.equal(
          enlarged.layoutWidth,
          original.layoutWidth,
          `缩放前后纸面布局应一致: ${JSON.stringify({ original, enlarged })}`
        )
        assert(
          Math.abs(enlarged.visibleWidth / original.visibleWidth - 1.5) < 0.01,
          '显示比例应只放大纸面视图，不改变纸张布局宽度'
        )
        await page.emulateMedia({ media: 'print' })
        try {
          const printed = await readPaperSize()
          assert(
            Math.abs(printed.visibleWidth - printed.layoutWidth) <= 1,
            '打印态不应继承屏幕的 150% 缩放'
          )
        } finally {
          await page.emulateMedia({ media: 'screen' })
        }
        await zoom.selectOption('fit')
        await assertNoHorizontalOverflow(page, '采购合同适应宽度')
        await assertMaterialContractPrintMediaIgnoresResponsiveBreakpoints(page)
      },
    },
    {
      name: 'print-workspace-contract-title-parity',
      path: '/erp/print-workspace/material-purchase-contract',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        const readTitleMetrics = async (selector) =>
          page
            .locator(selector)
            .first()
            .evaluate((node) => {
              const style = window.getComputedStyle(node)
              const rect = node.getBoundingClientRect()
              return {
                text: String(node.textContent || '').trim(),
                fontFamily: style.fontFamily,
                fontSize: style.fontSize,
                fontWeight: style.fontWeight,
                letterSpacing: style.letterSpacing,
                height: rect.height,
              }
            })

        await expectText(page, '合同订单')
        const materialTitle = await readTitleMetrics(
          '.erp-material-contract-paper__title'
        )
        await page
          .locator('.erp-material-contract-paper__title')
          .first()
          .screenshot({
            path: path.join(
              outputDir,
              'print-workspace-material-title-parity.png'
            ),
          })

        await gotoScenarioPath(page, '/erp/print-workspace/processing-contract')
        await expectText(page, '加工合同')
        const processingTitle = await readTitleMetrics(
          '.erp-processing-contract-paper__title'
        )
        await page
          .locator('.erp-processing-contract-paper__title')
          .first()
          .screenshot({
            path: path.join(
              outputDir,
              'print-workspace-processing-title-parity.png'
            ),
          })

        assert.deepEqual(
          {
            fontFamily: processingTitle.fontFamily,
            fontSize: processingTitle.fontSize,
            fontWeight: processingTitle.fontWeight,
            letterSpacing: processingTitle.letterSpacing,
          },
          {
            fontFamily: materialTitle.fontFamily,
            fontSize: materialTitle.fontSize,
            fontWeight: materialTitle.fontWeight,
            letterSpacing: materialTitle.letterSpacing,
          },
          `加工合同纸面标题应和采购合同纸面标题使用同一套字体规则: ${JSON.stringify(
            { materialTitle, processingTitle }
          )}`
        )
        assert(
          Math.abs(processingTitle.height - materialTitle.height) <= 1,
          `加工合同纸面标题高度应和采购合同纸面标题接近: ${JSON.stringify({
            materialTitle,
            processingTitle,
          })}`
        )
      },
    },
    {
      name: 'print-workspace-processing',
      path: '/erp/print-workspace/processing-contract',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await expectText(page, '加工合同')
        await page
          .getByRole('complementary', { name: '打印编辑工具' })
          .waitFor({ state: 'visible' })
        await expectText(page, '使用默认模板')
        await expectText(page, '在线预览 PDF')
        await expectText(page, '下载 PDF')
        await expectText(page, '选择明细行')
        await expectText(page, '加工明细行: 3/300')
        await expectText(page, '打印')
        await expectButton(page, '添加末尾图片')
        await assertProcessingContractPaperRowCount(page)
        await assertProcessingContractSignatureLayout(page)
        await assertPrintWorkspacePaginationStyle(page, {
          paperSelector: '.erp-processing-contract-paper',
          rowSelector: '.erp-processing-contract-table tbody tr',
          theadSelector: '.erp-processing-contract-table thead',
        })
        await assertPrintWorkspacePaperTopRhythm(page, {
          paperSelector: '.erp-processing-contract-paper',
          scenarioLabel: '加工合同模板',
          screenshotName: 'print-workspace-processing-paper-top-rhythm',
        })
        await assertContractPaperSidePaddingAndTableWidth(page, {
          paperSelector: '.erp-processing-contract-paper',
          tableSelector: '.erp-processing-contract-table',
          scenarioLabel: '加工合同模板',
          screenshotName: 'print-workspace-processing-contract-narrow-padding',
        })
        await assertContractTableHeadersStaySingleLine(page, {
          tableSelector: '.erp-processing-contract-table',
          expectedHeaders: [
            '委外加工订单号',
            '来源订单编号',
            '产品 / 材料编号',
            '产品 / 材料名称',
            '加工项目',
            '加工厂商',
            '工序类别',
            '单位',
            '单价',
            '委托加工数量',
            '委托加工金额',
            '备注',
          ],
        })
        await assertContractTableEditableAlignment(page, {
          tableSelector: '.erp-processing-contract-table',
          editableSelector:
            '.erp-processing-contract-table tbody td [contenteditable="true"]',
          scenarioLabel: '加工合同模板表格',
        })
        await assertPrintEditableFocusBorderStyle(page, {
          selector:
            '.erp-processing-contract-table tbody td [contenteditable="true"]',
          scenarioLabel: '加工合同模板表格',
        })
        await assertContractTotalCellsWrapLargeNumbers(page, {
          templateKind: 'processing',
          totalValueSelector:
            '.erp-processing-contract-table__total .erp-contract-table__total-value',
          scenarioLabel: '加工合同模板合计行',
        })
        await assertWorkspaceContinuedPageMargin(page, {
          paperSelector: '.erp-processing-contract-paper',
        })
        const emptyAppendixState = await page.evaluate(() => {
          const manager = document.querySelector(
            '[data-print-appendix-manager]'
          )
          return {
            managerCount: document.querySelectorAll(
              '[data-print-appendix-manager]'
            ).length,
            managerInPanel: Boolean(
              manager?.closest('.erp-print-shell__record-panel')
            ),
            managerInStage: Boolean(
              manager?.closest('.erp-print-shell__stage')
            ),
            paperAppendixCount: document.querySelectorAll(
              '.erp-processing-contract-paper [data-print-appendix-images]'
            ).length,
            legacyAttachmentCount: document.querySelectorAll(
              '.erp-processing-contract-attachments'
            ).length,
          }
        })
        assert.deepEqual(
          emptyAppendixState,
          {
            managerCount: 1,
            managerInPanel: true,
            managerInStage: false,
            paperAppendixCount: 0,
            legacyAttachmentCount: 0,
          },
          `加工合同应使用左侧共享末尾附图管理区，未添加时不占纸面: ${JSON.stringify(emptyAppendixState)}`
        )
      },
    },
    createMaterialDetailInteractionScenario({
      assertPrintWorkspacePaperTopRhythm,
      assertMaterialDetailLineCellsWrapLongValues,
      assertPrintEditableFocusBorderStyle,
      assertPrintEditableFocusSurvivesSwitch,
      assert,
      path,
      outputDir,
    }),
    createColorCardInteractionScenario({
      assertPrintWorkspacePaperTopRhythm,
      assertPrintEditableFocusBorderStyle,
      assertPrintEditableFocusSurvivesSwitch,
      assert,
      path,
      outputDir,
    }),
    createWorkInstructionInteractionScenario({
      assertPrintWorkspacePaperTopRhythm,
      assertPrintEditableFocusBorderStyle,
      assertPrintEditableFocusSurvivesSwitch,
      assert,
      path,
      webDir,
      expectText,
      outputDir,
      assertNoHorizontalOverflow,
    }),
    {
      name: 'engineering-material-detail-long-value-wrap',
      path: '/erp/print-workspace/engineering-material-detail?draft=fresh',
      auth: 'admin',
      viewport: { width: 1600, height: 1100 },
      verify: async (page) => {
        await page.locator('.erp-material-detail-paper').waitFor({
          state: 'visible',
          timeout: 10_000,
        })
        await assertMaterialDetailLineCellsWrapLongValues(page)
      },
    },
    {
      name: 'print-workspace-all-template-appendix-images',
      path: '/erp/print-workspace/material-purchase-contract',
      auth: 'admin',
      viewport: { width: 1600, height: 1600 },
      verify: async (page) => {
        const templates = [
          {
            key: 'material-purchase-contract',
            title: '采购合同',
            paperSelector: '.erp-material-contract-paper',
          },
          {
            key: 'processing-contract',
            title: '加工合同',
            paperSelector: '.erp-processing-contract-paper',
          },
          {
            key: 'engineering-material-detail',
            title: '物料分析明细表',
            paperSelector: '.erp-material-detail-paper',
          },
          {
            key: 'engineering-color-card',
            title: '色卡',
            paperSelector: '.erp-color-card-paper',
          },
          {
            key: 'engineering-work-instruction',
            title: '作业指导书',
            paperSelector: '.erp-work-instruction-paper',
          },
        ]

        for (const [templateIndex, template] of templates.entries()) {
          if (templateIndex > 0) {
            await gotoScenarioPath(page, `/erp/print-workspace/${template.key}`)
          }
          await page.locator(template.paperSelector).first().waitFor({
            state: 'visible',
            timeout: 10_000,
          })
          await expectText(page, template.title)
          await page
            .locator('[data-print-appendix-manager]')
            .waitFor({ state: 'visible', timeout: 10_000 })

          const firstBatch = createAppendixSVGFiles(template.key, 1, 5)
          const firstBatchNames = firstBatch.map((file) => file.name)
          await page
            .locator('[data-print-appendix-input]')
            .setInputFiles(firstBatch)
          await waitForPrintAppendixImageCount(page, {
            paperSelector: template.paperSelector,
            expectedCount: 5,
          })
          await assertPrintAppendixImageLayout(page, {
            templateTitle: template.title,
            paperSelector: template.paperSelector,
            expectedNames: firstBatchNames,
          })
          const appendix = page
            .locator(`${template.paperSelector} [data-print-appendix-images]`)
            .first()
          await appendix.scrollIntoViewIfNeeded()
          await appendix.screenshot({
            path: path.join(
              outputDir,
              `print-workspace-${template.key}-appendix-five.png`
            ),
          })

          const longImage = createAppendixSVGFile(template.key, {
            index: 50,
            width: 640,
            height: 3200,
            label: 'Long appendix',
          })
          const namesWithLongImage = [...firstBatchNames, longImage.name]
          await page
            .locator('[data-print-appendix-input]')
            .setInputFiles([longImage])
          await waitForPrintAppendixImageCount(page, {
            paperSelector: template.paperSelector,
            expectedCount: 6,
          })
          await assertPrintAppendixImageLayout(page, {
            templateTitle: `${template.title}长图自动整行`,
            paperSelector: template.paperSelector,
            expectedNames: namesWithLongImage,
            expectedLayouts: ['half', 'half', 'half', 'half', 'half', 'full'],
            expectedSegmentCounts: [1, 1, 1, 1, 1, 4],
          })
          if (templateIndex !== 0) {
            await page.getByRole('button', { name: '移除末尾图片 6' }).click()
            await waitForPrintAppendixImageCount(page, {
              paperSelector: template.paperSelector,
              expectedCount: 5,
            })
            continue
          }

          await page
            .locator('[data-print-appendix-manager-item]')
            .nth(5)
            .screenshot({
              path: path.join(
                outputDir,
                'print-workspace-appendix-layout-controls.png'
              ),
            })
          const longImageItem = page
            .locator(
              `${template.paperSelector} [data-print-appendix-image-name="${longImage.name}"]`
            )
            .first()
          await longImageItem
            .locator('[data-print-appendix-segment="1"]')
            .screenshot({
              path: path.join(
                outputDir,
                'print-workspace-appendix-long-first-segment.png'
              ),
            })

          await page
            .getByRole('button', { name: '将末尾图片 6 设为半宽' })
            .click()
          await assertPrintAppendixImageLayout(page, {
            templateTitle: `${template.title}长图手动半宽`,
            paperSelector: template.paperSelector,
            expectedNames: namesWithLongImage,
            expectedLayouts: ['half', 'half', 'half', 'half', 'half', 'half'],
            expectedRequestedLayouts: [
              'auto',
              'auto',
              'auto',
              'auto',
              'auto',
              'half',
            ],
            expectedSegmentCounts: [1, 1, 1, 1, 1, 4],
          })
          await page
            .getByRole('button', { name: '将末尾图片 6 设为整行' })
            .click()
          await assertPrintAppendixImageLayout(page, {
            templateTitle: `${template.title}长图手动整行`,
            paperSelector: template.paperSelector,
            expectedNames: namesWithLongImage,
            expectedLayouts: ['half', 'half', 'half', 'half', 'half', 'full'],
            expectedRequestedLayouts: [
              'auto',
              'auto',
              'auto',
              'auto',
              'auto',
              'full',
            ],
            expectedSegmentCounts: [1, 1, 1, 1, 1, 4],
          })

          await page.reload({ waitUntil: 'domcontentloaded' })
          await page.locator(template.paperSelector).first().waitFor({
            state: 'visible',
            timeout: 10_000,
          })
          await waitForPrintAppendixImageCount(page, {
            paperSelector: template.paperSelector,
            expectedCount: 6,
          })
          await assertPrintAppendixImageLayout(page, {
            templateTitle: `${template.title}手动整行刷新恢复`,
            paperSelector: template.paperSelector,
            expectedNames: namesWithLongImage,
            expectedLayouts: ['half', 'half', 'half', 'half', 'half', 'full'],
            expectedRequestedLayouts: [
              'auto',
              'auto',
              'auto',
              'auto',
              'auto',
              'full',
            ],
            expectedSegmentCounts: [1, 1, 1, 1, 1, 4],
          })
          await page
            .getByRole('button', { name: '将末尾图片 6 设为自动' })
            .click()
          await assertPrintAppendixImageLayout(page, {
            templateTitle: `${template.title}恢复自动排版`,
            paperSelector: template.paperSelector,
            expectedNames: namesWithLongImage,
            expectedLayouts: ['half', 'half', 'half', 'half', 'half', 'full'],
            expectedSegmentCounts: [1, 1, 1, 1, 1, 4],
          })
          await page.emulateMedia({ media: 'print' })
          const printSegmentMetrics = await page
            .locator(
              `${template.paperSelector} [data-print-appendix-image-name="${longImage.name}"]`
            )
            .evaluate((item) => ({
              segmentBreaks: Array.from(
                item.querySelectorAll('[data-print-appendix-segment]')
              ).map((segment) => window.getComputedStyle(segment).breakBefore),
              managerDisplay: window.getComputedStyle(
                document.querySelector('[data-print-appendix-manager]')
              ).display,
            }))
          assert(
            printSegmentMetrics.managerDisplay === 'none' &&
              printSegmentMetrics.segmentBreaks
                .slice(1)
                .every((value) => value === 'page'),
            `超长图后续片段应逐页输出且管理区不进入打印件: ${JSON.stringify(
              printSegmentMetrics
            )}`
          )
          await page.emulateMedia({ media: 'screen' })
          await page.getByRole('button', { name: '移除末尾图片 6' }).click()
          await waitForPrintAppendixImageCount(page, {
            paperSelector: template.paperSelector,
            expectedCount: 5,
          })

          await page.getByRole('button', { name: '将末尾图片 2 前移' }).click()
          await assertPrintAppendixImageLayout(page, {
            templateTitle: `${template.title}前移`,
            paperSelector: template.paperSelector,
            expectedNames: [
              firstBatchNames[1],
              firstBatchNames[0],
              ...firstBatchNames.slice(2),
            ],
          })
          await page.getByRole('button', { name: '将末尾图片 1 后移' }).click()
          await assertPrintAppendixImageLayout(page, {
            templateTitle: `${template.title}后移`,
            paperSelector: template.paperSelector,
            expectedNames: firstBatchNames,
          })

          await page.getByRole('button', { name: '移除末尾图片 3' }).click()
          await waitForPrintAppendixImageCount(page, {
            paperSelector: template.paperSelector,
            expectedCount: 4,
          })
          const namesAfterRemove = [
            ...firstBatchNames.slice(0, 2),
            ...firstBatchNames.slice(3),
          ]
          await assertPrintAppendixImageLayout(page, {
            templateTitle: `${template.title}移除`,
            paperSelector: template.paperSelector,
            expectedNames: namesAfterRemove,
          })

          const additionalBatch = createAppendixSVGFiles(template.key, 6, 5)
          const nineImageNames = [
            ...namesAfterRemove,
            ...additionalBatch.map((file) => file.name),
          ]
          await page
            .locator('[data-print-appendix-input]')
            .setInputFiles(additionalBatch)
          await waitForPrintAppendixImageCount(page, {
            paperSelector: template.paperSelector,
            expectedCount: 9,
          })
          await assertPrintAppendixImageLayout(page, {
            templateTitle: `${template.title}九张`,
            paperSelector: template.paperSelector,
            expectedNames: nineImageNames,
          })

          await page.reload({ waitUntil: 'domcontentloaded' })
          await page.locator(template.paperSelector).first().waitFor({
            state: 'visible',
            timeout: 10_000,
          })
          await waitForPrintAppendixImageCount(page, {
            paperSelector: template.paperSelector,
            expectedCount: 9,
          })
          await assertPrintAppendixImageLayout(page, {
            templateTitle: `${template.title}刷新恢复`,
            paperSelector: template.paperSelector,
            expectedNames: nineImageNames,
          })
          const refreshedAppendix = page
            .locator(`${template.paperSelector} [data-print-appendix-images]`)
            .first()
          await refreshedAppendix.scrollIntoViewIfNeeded()
          await refreshedAppendix.screenshot({
            path: path.join(
              outputDir,
              `print-workspace-${template.key}-appendix-nine-refreshed.png`
            ),
          })
        }
      },
    },
    {
      name: 'print-workspace-empty-editor-delete',
      path: '/erp/print-workspace/material-purchase-contract?draft=fresh',
      auth: 'admin',
      viewport: { width: 1600, height: 1100 },
      verify: async (page) => {
        for (const template of printTemplateCatalog.filter(
          (entry) => entry.runtime?.workspace
        )) {
          await gotoScenarioPath(
            page,
            `/erp/print-workspace/${template.key}?draft=fresh&state=empty-editor-delete`
          )
          const editors = page.locator(
            '.erp-print-shell__stage [contenteditable="true"]'
          )
          await editors.first().waitFor({ state: 'visible' })
          await page.evaluate(() => document.fonts.ready)
          const samples = await collectEmptyEditorSamples(editors)
          for (const scale of ['1', '1.25']) {
            await page
              .locator('.erp-print-shell__zoom-control select')
              .selectOption(scale)
            for (const sample of samples) {
              await assertEmptyEditorCaret(
                page,
                editors.nth(sample.index),
                `${template.title} ${scale} ${sample.kind}`
              )
            }
          }
          console.log(
            `[print-empty-editor] ${template.key}: ${samples.length * 2} delete / undo / retype checks passed`
          )
        }
      },
    },
    {
      name: 'print-workspace-all-template-edit-focus-clearance',
      path: '/erp/print-workspace/material-purchase-contract?draft=fresh',
      auth: 'admin',
      viewport: { width: 1600, height: 1100 },
      verify: async (page) => {
        const selector = '.erp-print-shell__stage [contenteditable="true"]'
        for (const template of printTemplateCatalog.filter(
          (entry) => entry.runtime?.workspace
        )) {
          await gotoScenarioPath(
            page,
            `/erp/print-workspace/${template.key}?draft=fresh&state=focus-clearance`
          )
          await page.locator(selector).first().waitFor({ state: 'visible' })
          await page.evaluate(() => document.fonts.ready)
          const samples = await page
            .locator(selector)
            .evaluateAll((elements) => {
              const groups = new Set()
              return elements.flatMap((element, index) => {
                const parent = element.parentElement
                const group = `${parent.tagName} ${parent.className} ${element.className}`
                if (groups.has(group)) return []
                groups.add(group)
                return [
                  {
                    index,
                    text: element.textContent,
                    cell: Boolean(element.closest('td, th')),
                  },
                ]
              })
            })
          let checks = 0
          for (const scale of [1, 1.25]) {
            await page.locator('.erp-print-shell').evaluate((shell, value) => {
              shell.style.setProperty('--print-view-scale', String(value))
            }, scale)
            for (const sample of samples) {
              await assertPrintEditableFocusBorderStyle(page, {
                selector,
                index: sample.index,
                scenarioLabel: `${template.title} ${scale * 100}% 字段 ${sample.index}`,
              })
              checks += 1
            }
            const editableSamples = [
              samples.find((sample) => !sample.cell),
              samples.find((sample) => sample.cell),
            ].filter(Boolean)
            for (const sample of editableSamples) {
              const editable = page.locator(selector).nth(sample.index)
              for (const text of [
                '',
                '中文编辑留白与长内容换行测试 Mixed English 0123456789',
              ]) {
                await editable.fill(text)
                await assertPrintEditableFocusBorderStyle(page, {
                  selector,
                  index: sample.index,
                  scenarioLabel: `${template.title} ${scale * 100}% ${text ? '长值' : '空值'}`,
                })
                checks += 1
              }
              await editable.fill(sample.text)
            }
          }
          await page.locator('.erp-print-shell__stage-wrap').screenshot({
            path: path.join(outputDir, `print-edit-focus-${template.key}.png`),
          })
          await page.emulateMedia({ media: 'print' })
          const printFocus = await page
            .locator(selector)
            .evaluateAll((elements) =>
              elements
                .flatMap((element) => [element, element.parentElement])
                .every((element) => {
                  const style = getComputedStyle(element)
                  return (
                    style.outlineStyle !== 'dashed' &&
                    style.boxShadow === 'none'
                  )
                })
            )
          assert(printFocus, `${template.title} 打印不能保留编辑虚线或焦点底色`)
          await page.emulateMedia({ media: 'screen' })
          console.log(
            `[print-edit-focus] ${template.key}: ${checks} focus checks and print isolation passed`
          )
        }
      },
    },
    {
      name: 'print-workspace-all-template-long-business-values',
      path: '/erp/print-workspace/material-purchase-contract?draft=fresh',
      auth: 'admin',
      viewport: { width: 1600, height: 1100 },
      verify: async (page) => {
        const templates = [
          {
            key: 'material-purchase-contract',
            title: '采购合同',
            paperSelector: '.erp-material-contract-paper',
          },
          {
            key: 'processing-contract',
            title: '加工合同',
            paperSelector: '.erp-processing-contract-paper',
          },
          {
            key: 'engineering-material-detail',
            title: '物料分析明细表',
            paperSelector: '.erp-material-detail-paper',
          },
          {
            key: 'engineering-color-card',
            title: '色卡',
            paperSelector: '.erp-color-card-paper',
          },
          {
            key: 'engineering-work-instruction',
            title: '作业指导书',
            paperSelector: '.erp-work-instruction-paper',
          },
        ]

        for (const [index, template] of templates.entries()) {
          if (index > 0) {
            await gotoScenarioPath(
              page,
              `/erp/print-workspace/${template.key}?draft=fresh`
            )
          }
          await page.locator(template.paperSelector).waitFor({
            state: 'visible',
            timeout: 10_000,
          })
          await expectText(page, template.title)
          await assertPrintTemplateLongBusinessValuesStayInsidePaper(page, {
            paperSelector: template.paperSelector,
            scenarioLabel: template.title,
            screenshotName: `print-workspace-${template.key}-long-business-values`,
          })
          await assertNoHorizontalOverflow(
            page,
            `print-workspace-${template.key}-long-business-values`
          )
        }
      },
    },
    {
      name: 'print-workspace-material-row-selection-reset',
      path: '/erp/print-workspace/material-purchase-contract',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await assertRowSelectionClearsAfterCancel(page, {
          dataRowSelector:
            '.erp-material-contract-table tbody tr:not(.erp-material-contract-table__total)',
          selectedRowSelector: '.erp-material-contract-table__row-selected',
          counterLabel: '采购明细行',
        })
        for (const exitAction of ['button', 'escape']) {
          await page.getByRole('button', { name: '选择明细行' }).click()
          await page
            .locator('.erp-material-contract-table tbody tr')
            .first()
            .click()
          const selection = page.locator('[data-print-edit-mode]')
          assert.match(
            await selection.textContent(),
            /已选择 1 个目标.*第 1 行/su
          )
          if (exitAction === 'button') {
            await page.getByRole('button', { name: '返回编辑' }).click()
          } else {
            await page.keyboard.press('Escape')
          }
          assert.equal(
            await page
              .locator('[data-print-workspace-mode]')
              .getAttribute('data-print-workspace-mode'),
            'edit'
          )
          assert.equal(
            await page
              .locator('.erp-material-contract-table__row-selected')
              .count(),
            0,
            `${exitAction} 返回编辑后不应残留选中行`
          )
          assert(
            await page.getByRole('button', { name: '上插一行' }).isDisabled()
          )
        }
      },
    },
    {
      name: 'print-workspace-processing-row-selection-reset',
      path: '/erp/print-workspace/processing-contract',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await assertRowSelectionClearsAfterCancel(page, {
          dataRowSelector:
            '.erp-processing-contract-table tbody tr:not(.erp-processing-contract-table__total)',
          selectedRowSelector: '.erp-processing-contract-table__row--selected',
          counterLabel: '加工明细行',
        })
      },
    },
    {
      name: 'print-workspace-material-preview-popup',
      path: '/erp/print-workspace/material-purchase-contract',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await assertPrintPreviewPopup(page, {
          buttonName: '在线预览 PDF',
          title: '采购合同 PDF 预览',
          screenshotName: 'print-workspace-material-preview-popup-window',
        })
      },
    },
    {
      name: 'print-workspace-processing-preview-popup',
      path: '/erp/print-workspace/processing-contract',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        await assertPrintPreviewPopup(page, {
          buttonName: '在线预览 PDF',
          title: '加工合同 PDF 预览',
          screenshotName: 'print-workspace-processing-preview-popup-window',
        })
      },
    },
    {
      name: 'print-workspace-engineering-preview-popups',
      path: '/erp/print-workspace/engineering-material-detail?draft=fresh',
      auth: 'admin',
      viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        const templates = [
          {
            key: 'engineering-material-detail',
            title: '物料分析明细表',
            screenshotName:
              'print-workspace-engineering-material-detail-preview-popup-window',
          },
          {
            key: 'engineering-color-card',
            title: '色卡',
            screenshotName:
              'print-workspace-engineering-color-card-preview-popup-window',
          },
          {
            key: 'engineering-work-instruction',
            title: '作业指导书',
            screenshotName:
              'print-workspace-engineering-work-instruction-preview-popup-window',
          },
        ]

        for (const [index, template] of templates.entries()) {
          if (index > 0) {
            await page.goto(
              new URL(
                `/erp/print-workspace/${template.key}?draft=fresh`,
                page.url()
              ).toString(),
              {
                waitUntil: 'domcontentloaded',
              }
            )
          }
          await assertPrintPreviewPopup(page, {
            buttonName: '在线预览 PDF',
            title: template.title,
            screenshotName: template.screenshotName,
          })
        }
      },
    },
  ]
}
