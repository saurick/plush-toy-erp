import assert from 'node:assert/strict'
import path from 'node:path'
import { expectText } from './pageAssertions.mjs'
async function verifyWorkInstructionDefaultSheet({ page }) {
  const workInstructionGridState = await page.evaluate(() => {
    const paper = document.querySelector('.erp-work-instruction-paper')
    const stageWrap = document.querySelector(
      '.erp-engineering-print-workspace-shell .erp-print-shell__stage-wrap'
    )
    const headerRow = document.querySelector(
      '.erp-work-instruction-paper__header'
    )
    const imageCell = document.querySelector(
      '.erp-work-instruction-paper__header-image-cell'
    )
    const firstStepRow = document.querySelector(
      '.erp-work-instruction-paper__step-row--text, .erp-work-instruction-paper__step-row--image'
    )
    const companyText = document.querySelector(
      '.erp-work-instruction-paper__company'
    )
    const companyCell = document.querySelector(
      '.erp-work-instruction-paper__company-cell'
    )
    const titleCell = document.querySelector(
      '.erp-work-instruction-paper__title-cell'
    )
    const metaLabel = document.querySelector(
      '.erp-work-instruction-paper__meta-label'
    )
    const sectionTitleCell = document.querySelector(
      '.erp-work-instruction-paper__section-title-row td'
    )
    const firstStepNo = firstStepRow?.querySelector(
      '.erp-work-instruction-paper__step-no'
    )
    const firstStepContent = firstStepRow?.querySelector(
      '.erp-work-instruction-paper__step-content-cell'
    )
    const noticeCell = document.querySelector(
      '.erp-work-instruction-paper__text-row td'
    )
    const sheets = [
      ...document.querySelectorAll('.erp-work-instruction-paper__sheet'),
    ]
    const continuationSheets = [
      ...document.querySelectorAll(
        '.erp-work-instruction-paper__sheet--continuation'
      ),
    ]
    const headerRows = [
      ...document.querySelectorAll('.erp-work-instruction-paper__header'),
    ]
    const sectionTitleRows = [
      ...document.querySelectorAll(
        '.erp-work-instruction-paper__section-title-row'
      ),
    ]
    const fullTextRows = [
      ...document.querySelectorAll(
        [
          '.erp-work-instruction-paper__section-title-row',
          '.erp-work-instruction-paper__text-row',
        ].join(',')
      ),
    ]
    const stepRows = [
      ...document.querySelectorAll(
        '.erp-work-instruction-paper__step-row--text, .erp-work-instruction-paper__step-row--image'
      ),
    ]
    const sumColSpan = (row) =>
      [...(row?.children || [])].reduce(
        (sum, cell) => sum + (Number(cell.getAttribute('colspan')) || 1),
        0
      )
    const rowHeightVar = (row) =>
      row?.style.getPropertyValue('--work-instruction-row-height') || ''
    const normalizedText = (node) =>
      String(node?.textContent || '')
        .replace(/\s+/gu, ' ')
        .trim()
    const companyCellRect = companyCell?.getBoundingClientRect()
    const companyTextRange = document.createRange()
    if (companyText) companyTextRange.selectNodeContents(companyText)
    const companyTextRect = companyText
      ? companyTextRange.getBoundingClientRect()
      : null
    companyTextRange.detach()
    const companyStyle = companyText
      ? window.getComputedStyle(companyText)
      : null
    const continuationSummaries = continuationSheets.map((sheet) => {
      const rows = [
        ...sheet.querySelectorAll(
          '.erp-work-instruction-paper__step-row--text, .erp-work-instruction-paper__step-row--image'
        ),
      ]
      const headers = [
        ...sheet.querySelectorAll('.erp-work-instruction-paper__header'),
      ]
      return {
        text: String(sheet.textContent || '')
          .replace(/\s+/gu, ' ')
          .trim(),
        colCount: sheet.querySelectorAll('colgroup col').length,
        headerHeightVars: headers.map(rowHeightVar),
        stepRowCount: rows.length,
        row2HeightVar:
          rows[1]?.style.getPropertyValue('--instruction-row-min-height') || '',
        buttonCount: sheet.querySelectorAll('button').length,
        breakBefore: window.getComputedStyle(sheet).breakBefore,
        pageBreakBefore: window.getComputedStyle(sheet).pageBreakBefore,
      }
    })
    return {
      sheetCount: sheets.length,
      continuationSheetCount: continuationSheets.length,
      firstSheetColCount: document.querySelectorAll(
        '.erp-work-instruction-paper__sheet colgroup col'
      ).length
        ? sheets[0]?.querySelectorAll('colgroup col').length || 0
        : 0,
      allSheetColCounts: sheets.map(
        (sheet) => sheet.querySelectorAll('colgroup col').length
      ),
      headerFirstRowSpan: sumColSpan(headerRow),
      firstStepRowSpan: sumColSpan(firstStepRow),
      headerImageColSpan: Number(imageCell?.getAttribute('colspan')) || 1,
      headerMetaTexts: [
        ...(sheets[0]?.querySelectorAll(
          '.erp-work-instruction-paper__meta-label'
        ) || []),
      ].map(normalizedText),
      headerSummaryTexts: [
        ...(sheets[0]?.querySelectorAll(
          '.erp-work-instruction-paper__summary-label'
        ) || []),
      ].map(normalizedText),
      processHeader: {
        name: normalizedText(
          sheets[0]?.querySelector('[data-work-instruction-process-name]')
        ),
        date: normalizedText(
          sheets[0]?.querySelector('[data-work-instruction-process-date]')
        ),
        dateEditorCount:
          sheets[0]?.querySelectorAll(
            '[data-work-instruction-process-date] > .erp-engineering-print-editable[contenteditable="true"]'
          ).length || 0,
      },
      companyAlignment: {
        display: companyStyle?.display || '',
        alignItems: companyStyle?.alignItems || '',
        justifyContent: companyStyle?.justifyContent || '',
        textAlign: companyStyle?.textAlign || '',
        xCenterDelta:
          companyCellRect && companyTextRect
            ? Math.abs(
                companyCellRect.left +
                  companyCellRect.width / 2 -
                  (companyTextRect.left + companyTextRect.width / 2)
              )
            : -1,
        yCenterDelta:
          companyCellRect && companyTextRect
            ? Math.abs(
                companyCellRect.top +
                  companyCellRect.height / 2 -
                  (companyTextRect.top + companyTextRect.height / 2)
              )
            : -1,
        clientWidth: companyText?.clientWidth || 0,
        scrollWidth: companyText?.scrollWidth || 0,
      },
      paperPaddingLeft: paper ? window.getComputedStyle(paper).paddingLeft : '',
      stageWrapJustify: stageWrap
        ? window.getComputedStyle(stageWrap).justifyContent
        : '',
      headerRowHeightVars: headerRows.map(rowHeightVar),
      headerRowPixelHeights: headerRows.map(
        (row) => row.getBoundingClientRect().height
      ),
      sectionTitleHeightVars: sectionTitleRows.map(rowHeightVar),
      sectionTitlePixelHeights: sectionTitleRows.map(
        (row) => row.getBoundingClientRect().height
      ),
      fullTextRowHeightVars: fullTextRows.map(rowHeightVar),
      fullTextRowPixelHeights: fullTextRows.map(
        (row) => row.getBoundingClientRect().height
      ),
      stepRowCount: stepRows.length,
      stepNumbers: stepRows.map((row) =>
        String(
          row.querySelector('.erp-work-instruction-paper__step-no')
            ?.textContent || ''
        ).trim()
      ),
      stepRowHeightVars: stepRows.map(
        (row) =>
          row.style.getPropertyValue('--instruction-row-min-height') || ''
      ),
      annotatedStepRowCount: stepRows.filter((row) =>
        row.classList.contains(
          'erp-work-instruction-paper__step-row--annotated'
        )
      ).length,
      defaultStepRowImageCount: stepRows.reduce(
        (sum, row) =>
          sum +
          row.querySelectorAll('.erp-engineering-print-image-slot img').length,
        0
      ),
      firstStepHeightVar:
        stepRows[0]?.style.getPropertyValue('--instruction-row-min-height') ||
        '',
      firstStepPixelHeight: stepRows[0]?.getBoundingClientRect().height || 0,
      fontSizes: {
        paper: paper ? window.getComputedStyle(paper).fontSize : '',
        company: companyText
          ? window.getComputedStyle(companyText).fontSize
          : '',
        title: titleCell ? window.getComputedStyle(titleCell).fontSize : '',
        meta: metaLabel ? window.getComputedStyle(metaLabel).fontSize : '',
        sectionTitle: sectionTitleCell
          ? window.getComputedStyle(sectionTitleCell).fontSize
          : '',
        stepNo: firstStepNo
          ? window.getComputedStyle(firstStepNo).fontSize
          : '',
        stepContent: firstStepContent
          ? window.getComputedStyle(firstStepContent).fontSize
          : '',
        text: noticeCell ? window.getComputedStyle(noticeCell).fontSize : '',
      },
      textHeightVars: [
        ...document.querySelectorAll('.erp-work-instruction-paper__text-row'),
      ].map(rowHeightVar),
      continuationSummaries,
    }
  })

  assert(
    workInstructionGridState.firstSheetColCount === 9 &&
      workInstructionGridState.allSheetColCounts.every(
        (colCount) => colCount === 9
      ) &&
      workInstructionGridState.headerFirstRowSpan === 9 &&
      workInstructionGridState.firstStepRowSpan === 9 &&
      workInstructionGridState.headerImageColSpan === 1 &&
      parseFloat(workInstructionGridState.paperPaddingLeft) <= 12 &&
      workInstructionGridState.stageWrapJustify === 'center',
    `作业指导书应按 Excel Sheet1 A:I 主体合并范围渲染，并保持工程打印模板居中编辑位置: ${JSON.stringify(workInstructionGridState)}`
  )

  assert.deepEqual(
    {
      meta: workInstructionGridState.headerMetaTexts,
      summary: workInstructionGridState.headerSummaryTexts,
      processHeader: workInstructionGridState.processHeader,
    },
    {
      meta: ['产品编号', '版本/版次', '车缝', '制表', '设计师', '审核'],
      summary: ['发放部门：', '订单号：', '产品名称：'],
      processHeader: {
        name: '车缝',
        date: '',
        dateEditorCount: 1,
      },
    },
    `作业指导书头六行字段角色应与原 Excel 一致，G3 显示本页工序且 H3 保持独立日期值槽: ${JSON.stringify(workInstructionGridState)}`
  )

  assert(
    workInstructionGridState.companyAlignment.display === 'flex' &&
      workInstructionGridState.companyAlignment.alignItems === 'center' &&
      workInstructionGridState.companyAlignment.justifyContent === 'center' &&
      workInstructionGridState.companyAlignment.textAlign === 'center' &&
      workInstructionGridState.companyAlignment.xCenterDelta >= 0 &&
      workInstructionGridState.companyAlignment.xCenterDelta <= 2 &&
      workInstructionGridState.companyAlignment.yCenterDelta >= 0 &&
      workInstructionGridState.companyAlignment.yCenterDelta <= 4 &&
      workInstructionGridState.companyAlignment.scrollWidth <=
        workInstructionGridState.companyAlignment.clientWidth + 1,
    `作业指导书公司名称应在 A1:F2 合并单元格内水平和垂直居中: ${JSON.stringify(workInstructionGridState.companyAlignment)}`
  )

  assert.deepEqual(
    {
      headerRowHeightVars: workInstructionGridState.headerRowHeightVars.slice(
        0,
        6
      ),
      sectionTitleHeightVars:
        workInstructionGridState.sectionTitleHeightVars.slice(0, 3),
      fullTextRowHeightVars: workInstructionGridState.fullTextRowHeightVars,
      firstStepHeightVar: workInstructionGridState.firstStepHeightVar,
      textHeightVars: workInstructionGridState.textHeightVars,
    },
    {
      headerRowHeightVars: [
        '8.5mm',
        '8.5mm',
        '8.5mm',
        '8.5mm',
        '8.5mm',
        '8.5mm',
      ],
      sectionTitleHeightVars: ['11.6mm', '11.6mm', '11.6mm'],
      fullTextRowHeightVars: ['11.6mm', '11.6mm', '11.6mm', '11.6mm', '11.6mm'],
      firstStepHeightVar: '11.6mm',
      textHeightVars: ['11.6mm', '11.6mm'],
    },
    `作业指导书统一行模型应让标题、文本和编号行使用一致行高: ${JSON.stringify(workInstructionGridState)}`
  )

  assert(
    workInstructionGridState.sheetCount === 1 &&
      workInstructionGridState.continuationSheetCount === 0 &&
      workInstructionGridState.continuationSummaries.length === 0 &&
      workInstructionGridState.stepRowCount === 5 &&
      workInstructionGridState.stepNumbers[0] !== '' &&
      JSON.stringify(workInstructionGridState.stepNumbers.slice(1)) ===
        JSON.stringify(['2', '1', '1', '2']) &&
      workInstructionGridState.stepRowHeightVars.every(
        (heightVar) => heightVar === '11.6mm'
      ) &&
      workInstructionGridState.annotatedStepRowCount === 0 &&
      workInstructionGridState.defaultStepRowImageCount === 0,
    `作业指导书纸面应按小模块重编 5 条编号行，备注后不渲染重复页块: ${JSON.stringify(workInstructionGridState)}`
  )

  assert(
    workInstructionGridState.headerRowPixelHeights.every(
      (height) => height >= 29 && height <= 36
    ) &&
      workInstructionGridState.fullTextRowPixelHeights.every(
        (height) => height >= 40 && height <= 54
      ) &&
      workInstructionGridState.firstStepPixelHeight >= 40 &&
      workInstructionGridState.firstStepPixelHeight <= 50,
    `作业指导书标题、文本和编号行高度应保持一致: ${JSON.stringify(workInstructionGridState)}`
  )

  const parseFontSize = (value) => parseFloat(String(value || '0'))

  assert(
    parseFontSize(workInstructionGridState.fontSizes.company) >= 21 &&
      parseFontSize(workInstructionGridState.fontSizes.company) <= 22 &&
      parseFontSize(workInstructionGridState.fontSizes.title) >= 21 &&
      parseFontSize(workInstructionGridState.fontSizes.title) <= 22 &&
      parseFontSize(workInstructionGridState.fontSizes.meta) >= 15.5 &&
      parseFontSize(workInstructionGridState.fontSizes.meta) <= 16.5 &&
      parseFontSize(workInstructionGridState.fontSizes.sectionTitle) >= 18 &&
      parseFontSize(workInstructionGridState.fontSizes.sectionTitle) <= 19.5 &&
      parseFontSize(workInstructionGridState.fontSizes.stepNo) >= 15.5 &&
      parseFontSize(workInstructionGridState.fontSizes.stepNo) <= 16.5 &&
      parseFontSize(workInstructionGridState.fontSizes.stepContent) >= 14 &&
      parseFontSize(workInstructionGridState.fontSizes.stepContent) <= 15 &&
      parseFontSize(workInstructionGridState.fontSizes.text) >= 14 &&
      parseFontSize(workInstructionGridState.fontSizes.text) <= 15,
    `作业指导书字号应按 Sheet1 16pt/12pt/14pt/11pt/9pt 比例映射: ${JSON.stringify(workInstructionGridState.fontSizes)}`
  )

  const defaultRichTextState = await page.evaluate(() => {
    const rows = document.querySelectorAll(
      '.erp-work-instruction-paper__step-row--text, .erp-work-instruction-paper__step-row--image'
    )
    const readEditorState = (rowIndex) => {
      const editor = rows[rowIndex]?.querySelector(
        '.erp-work-instruction-paper__step-content-cell > .erp-engineering-print-editable'
      )
      const redNode =
        editor?.querySelector('[style*="red"]') ||
        editor?.querySelector('[style*="255, 0, 0"]')
      const strongNode = editor?.querySelector('strong, b')
      return {
        color: redNode ? window.getComputedStyle(redNode).color : '',
        weight: strongNode
          ? window.getComputedStyle(strongNode).fontWeight
          : '',
      }
    }
    return {
      row2: readEditorState(1),
      row5: readEditorState(4),
    }
  })

  assert.deepEqual(
    defaultRichTextState,
    {
      row2: { color: '', weight: '' },
      row5: { color: '', weight: '' },
    },
    `作业指导书模板默认文字应保持黑色常规字重，红色只作为选中文本后的编辑能力: ${JSON.stringify(defaultRichTextState)}`
  )
}

async function verifyWorkInstructionHeaderImages({
  page,
  webDir,
  writeEngineeringPaperReviewScreenshot,
}) {
  let workInstructionHeaderImageState = await page.evaluate(() => ({
    uploadBarInPanel: Boolean(
      document
        .querySelector('.erp-processing-contract-upload-bar')
        ?.closest('.erp-print-shell__record-panel')
    ),
    uploadBarInStage: Boolean(
      document
        .querySelector('.erp-processing-contract-upload-bar')
        ?.closest('.erp-print-shell__stage')
    ),
    headerImageActionCount: document.querySelectorAll(
      '.erp-work-instruction-paper__header .erp-engineering-print-image-slot__actions'
    ).length,
    headerImageCount: document.querySelectorAll(
      '.erp-work-instruction-paper__header .erp-engineering-print-image-slot img'
    ).length,
    sheetHeaderImageCounts: [
      ...document.querySelectorAll('.erp-work-instruction-paper__sheet'),
    ].map(
      (sheet) =>
        sheet.querySelectorAll(
          '.erp-work-instruction-paper__header .erp-engineering-print-image-slot img'
        ).length
    ),
    emptyHeaderImageBackground: window.getComputedStyle(
      document.querySelector(
        '.erp-work-instruction-paper__header .erp-engineering-print-image-slot'
      )
    ).backgroundColor,
    emptyHeaderImageBorderStyle: window.getComputedStyle(
      document.querySelector(
        '.erp-work-instruction-paper__header .erp-engineering-print-image-slot'
      )
    ).borderStyle,
  }))

  assert(
    workInstructionHeaderImageState.uploadBarInPanel &&
      !workInstructionHeaderImageState.uploadBarInStage &&
      workInstructionHeaderImageState.headerImageActionCount === 0 &&
      workInstructionHeaderImageState.headerImageCount === 0 &&
      workInstructionHeaderImageState.sheetHeaderImageCounts.length === 1 &&
      workInstructionHeaderImageState.sheetHeaderImageCounts.every(
        (count) => count === 0
      ) &&
      workInstructionHeaderImageState.emptyHeaderImageBackground ===
        'rgb(255, 255, 255)' &&
      workInstructionHeaderImageState.emptyHeaderImageBorderStyle === 'solid',
    `作业指导书右上产品图应由左侧上传栏维护，纸面 header 不应出现上传/清空按钮: ${JSON.stringify(workInstructionHeaderImageState)}`
  )

  await page
    .locator('.erp-processing-contract-upload-bar__input')
    .first()
    .setInputFiles(path.resolve(webDir, 'public', 'favicon.svg'))

  await expectText(page, '已同步：favicon.svg')

  await page.waitForFunction(
    () =>
      document.querySelectorAll(
        '.erp-work-instruction-paper__header .erp-engineering-print-image-slot img'
      ).length === 1
  )

  workInstructionHeaderImageState = await page.evaluate(() => ({
    headerImageActionCount: document.querySelectorAll(
      '.erp-work-instruction-paper__header .erp-engineering-print-image-slot__actions'
    ).length,
    headerImageCount: document.querySelectorAll(
      '.erp-work-instruction-paper__header .erp-engineering-print-image-slot img'
    ).length,
    sheetHeaderImageCounts: [
      ...document.querySelectorAll('.erp-work-instruction-paper__sheet'),
    ].map(
      (sheet) =>
        sheet.querySelectorAll(
          '.erp-work-instruction-paper__header .erp-engineering-print-image-slot img'
        ).length
    ),
  }))

  assert(
    workInstructionHeaderImageState.headerImageActionCount === 0 &&
      workInstructionHeaderImageState.headerImageCount === 1 &&
      workInstructionHeaderImageState.sheetHeaderImageCounts.length === 1 &&
      workInstructionHeaderImageState.sheetHeaderImageCounts.every(
        (count) => count === 1
      ),
    `作业指导书右上产品图上传后应只在纸面 header 输出图片: ${JSON.stringify(workInstructionHeaderImageState)}`
  )

  await page
    .locator('.erp-processing-contract-upload-bar__input')
    .nth(1)
    .setInputFiles(path.resolve(webDir, 'public', 'favicon.svg'))

  await page.waitForFunction(
    () =>
      document.querySelectorAll(
        '.erp-work-instruction-paper__header .erp-engineering-print-image-slot img'
      ).length === 2
  )

  const workInstructionDualHeaderImageState = await page.evaluate(() => {
    const cell = document.querySelector(
      '.erp-work-instruction-paper__header-image-cell'
    )
    const wrapper = cell?.querySelector(
      '.erp-work-instruction-paper__header-images--count-2'
    )
    const slots = [
      ...(wrapper?.querySelectorAll('.erp-engineering-print-image-slot') || []),
    ]
    const cellRect = cell?.getBoundingClientRect()
    const wrapperRect = wrapper?.getBoundingClientRect()
    const slotRects = slots.map((slot) => {
      const rect = slot.getBoundingClientRect()
      return {
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        width: rect.width,
        height: rect.height,
      }
    })
    const wrapperStyle = wrapper && window.getComputedStyle(wrapper)
    return {
      imageCount: wrapper?.querySelectorAll('img').length || 0,
      snapshotCount:
        wrapper?.getAttribute('data-work-instruction-header-image-count') || '',
      gridColumns: wrapperStyle?.gridTemplateColumns || '',
      wrapperClientWidth: wrapper?.clientWidth || 0,
      wrapperScrollWidth: wrapper?.scrollWidth || 0,
      wrapperClientHeight: wrapper?.clientHeight || 0,
      wrapperScrollHeight: wrapper?.scrollHeight || 0,
      cellRect: cellRect
        ? {
            top: cellRect.top,
            right: cellRect.right,
            bottom: cellRect.bottom,
            left: cellRect.left,
          }
        : null,
      wrapperRect: wrapperRect
        ? {
            top: wrapperRect.top,
            right: wrapperRect.right,
            bottom: wrapperRect.bottom,
            left: wrapperRect.left,
          }
        : null,
      slotRects,
    }
  })

  const dualImageCell = workInstructionDualHeaderImageState.cellRect

  const dualImageWrapper = workInstructionDualHeaderImageState.wrapperRect

  const dualImageSlots = workInstructionDualHeaderImageState.slotRects

  assert(
    workInstructionDualHeaderImageState.imageCount === 2 &&
      workInstructionDualHeaderImageState.snapshotCount === '2' &&
      workInstructionDualHeaderImageState.gridColumns.trim().split(/\s+/u)
        .length === 2 &&
      workInstructionDualHeaderImageState.wrapperScrollWidth <=
        workInstructionDualHeaderImageState.wrapperClientWidth + 1 &&
      workInstructionDualHeaderImageState.wrapperScrollHeight <=
        workInstructionDualHeaderImageState.wrapperClientHeight + 1 &&
      dualImageCell &&
      dualImageWrapper &&
      dualImageSlots.length === 2 &&
      dualImageWrapper.left >= dualImageCell.left - 1 &&
      dualImageWrapper.right <= dualImageCell.right + 1 &&
      dualImageWrapper.top >= dualImageCell.top - 1 &&
      dualImageWrapper.bottom <= dualImageCell.bottom + 1 &&
      dualImageSlots.every(
        (rect) =>
          rect.width > 0 &&
          rect.height > 0 &&
          rect.left >= dualImageWrapper.left - 1 &&
          rect.right <= dualImageWrapper.right + 1 &&
          rect.top >= dualImageWrapper.top - 1 &&
          rect.bottom <= dualImageWrapper.bottom + 1
      ) &&
      dualImageSlots[0].right <= dualImageSlots[1].left + 1,
    `作业指导书右上两张产品图应在同一单元格内横向并列且不溢出: ${JSON.stringify(workInstructionDualHeaderImageState)}`
  )

  await writeEngineeringPaperReviewScreenshot(
    '.erp-work-instruction-paper',
    'work-instruction-header-two-product-images.png'
  )

  await page
    .locator('.erp-processing-contract-upload-bar__item')
    .nth(1)
    .getByRole('button', { name: '清空' })
    .click()

  await page.waitForFunction(
    () =>
      document.querySelectorAll(
        '.erp-work-instruction-paper__header .erp-engineering-print-image-slot img'
      ).length === 1
  )

  await page
    .locator('.erp-processing-contract-upload-bar__item')
    .first()
    .getByRole('button', { name: '清空' })
    .click()

  await page.waitForFunction(
    () =>
      document.querySelectorAll(
        '.erp-work-instruction-paper__header .erp-engineering-print-image-slot img'
      ).length === 0
  )
}

async function verifyWorkInstructionRowImages({
  page,
  collectToolbarGroups,
  webDir,
  outputDir,
}) {
  await page.getByRole('button', { name: '选择行' }).click()

  await page
    .locator(
      '.erp-work-instruction-paper__step-row--text, .erp-work-instruction-paper__step-row--image'
    )
    .nth(1)
    .dispatchEvent('mousedown', { bubbles: true, cancelable: true })

  let toolbarGroups = await collectToolbarGroups()

  assert.equal(
    toolbarGroups[0].buttons.find((button) => button.text === '给当前行加图')
      .disabled,
    false,
    '作业指导书选择编号行后，给当前行加图应可用'
  )

  assert.equal(
    toolbarGroups[0].buttons.find((button) => button.text === '上插一行')
      .disabled,
    false,
    '作业指导书选择编号作业行后，上插一行应可用'
  )

  assert.equal(
    toolbarGroups[0].buttons.find((button) => button.text === '下插一行')
      .disabled,
    false,
    '作业指导书选择编号作业行后，下插一行应可用'
  )

  assert.equal(
    toolbarGroups[0].buttons.find((button) => button.text === '清空当前行图片')
      .disabled,
    true,
    '作业指导书选中无图片行时，清空当前行图片仍应禁用'
  )

  assert.equal(
    toolbarGroups[0].buttons.find((button) => button.text === '标注当前行图片')
      .disabled,
    true,
    '作业指导书选中无图片行时，标注当前行图片仍应禁用'
  )

  let workInstructionRowImageControlState = await page.evaluate(() => ({
    visibleUploadButtons: [
      ...document.querySelectorAll(
        '.erp-work-instruction-paper__row-image-button'
      ),
    ].filter((node) => window.getComputedStyle(node).display !== 'none').length,
    visibleEmptyImageRows: [
      ...document.querySelectorAll(
        '.erp-work-instruction-paper__row-images--empty'
      ),
    ].filter((node) => window.getComputedStyle(node).display !== 'none').length,
  }))

  assert.deepEqual(
    workInstructionRowImageControlState,
    {
      visibleUploadButtons: 0,
      visibleEmptyImageRows: 0,
    },
    `作业指导书纸面行内不应显示加图按钮或空图片槽: ${JSON.stringify(workInstructionRowImageControlState)}`
  )

  const textRowLayoutState = await page.evaluate(() => {
    const row = document.querySelectorAll(
      '.erp-work-instruction-paper__step-row--text, .erp-work-instruction-paper__step-row--image'
    )[1]
    const cell = row?.querySelector(
      '.erp-work-instruction-paper__step-content-cell'
    )
    const editor = cell?.querySelector(
      ':scope > .erp-engineering-print-editable'
    )
    const emptyControls = cell?.querySelector(
      '.erp-work-instruction-paper__row-images--empty'
    )
    const cellRect = cell?.getBoundingClientRect()
    const editorRect = editor?.getBoundingClientRect()
    return {
      isTextRow: row?.classList.contains(
        'erp-work-instruction-paper__step-row--text'
      ),
      isImageRow: row?.classList.contains(
        'erp-work-instruction-paper__step-row--image'
      ),
      emptyControlsPosition: emptyControls
        ? window.getComputedStyle(emptyControls).position
        : '',
      emptyControlsDisplay: emptyControls
        ? window.getComputedStyle(emptyControls).display
        : '',
      centerDelta:
        cellRect && editorRect
          ? Math.abs(
              cellRect.top +
                cellRect.height / 2 -
                (editorRect.top + editorRect.height / 2)
            )
          : -1,
    }
  })

  assert(
    textRowLayoutState.isTextRow &&
      !textRowLayoutState.isImageRow &&
      textRowLayoutState.emptyControlsDisplay === 'none' &&
      textRowLayoutState.centerDelta >= 0 &&
      textRowLayoutState.centerDelta <= 3,
    `作业指导书文字行内容应上下居中，纸面不渲染空加图入口: ${JSON.stringify(textRowLayoutState)}`
  )

  const workInstructionCellVerticalState = await page.evaluate(() => {
    const mainSheet = document.querySelector(
      '.erp-work-instruction-paper__sheet:not(.erp-work-instruction-paper__sheet--continuation)'
    )
    const textRows = [
      ...(mainSheet?.querySelectorAll(
        '.erp-work-instruction-paper__step-row--text'
      ) || []),
    ]
    const measureTextRect = (node) => {
      if (!node) return null
      const range = document.createRange()
      range.selectNodeContents(node)
      const rect = range.getBoundingClientRect()
      range.detach()
      return rect.width || rect.height ? rect : null
    }
    const measure = (label, cellSelector, contentSelector = null) => {
      const cell = mainSheet?.querySelector(cellSelector)
      const content = contentSelector
        ? cell?.querySelector(contentSelector)
        : cell
      const cellRect = cell?.getBoundingClientRect()
      const contentRect = measureTextRect(content)
      const editable = content?.classList?.contains(
        'erp-engineering-print-editable'
      )
        ? content
        : content?.querySelector?.('.erp-engineering-print-editable')
      const editableStyle = editable ? window.getComputedStyle(editable) : null
      return {
        label,
        text: String(content?.textContent || '')
          .replace(/\s+/gu, ' ')
          .trim(),
        cellHeight: cellRect?.height || 0,
        textHeight: contentRect?.height || 0,
        centerDelta:
          cellRect && contentRect
            ? Math.abs(
                cellRect.top +
                  cellRect.height / 2 -
                  (contentRect.top + contentRect.height / 2)
              )
            : -1,
        cellVerticalAlign: cell
          ? window.getComputedStyle(cell).verticalAlign
          : '',
        editableDisplay: editableStyle?.display || '',
        editableAlignItems: editableStyle?.alignItems || '',
      }
    }
    const secondTextRow = textRows[1] || textRows[0]
    const textRowIndex = secondTextRow ? textRows.indexOf(secondTextRow) : -1
    const textRowSelector =
      textRowIndex >= 0
        ? `.erp-work-instruction-paper__step-row--text:nth-of-type(${
            [...mainSheet.querySelectorAll('tr')].indexOf(secondTextRow) + 1
          })`
        : ''
    const states = [
      measure(
        'company',
        '.erp-work-instruction-paper__company-cell',
        ':scope > .erp-engineering-print-editable'
      ),
      measure('product-label', '.erp-work-instruction-paper__meta-label'),
      measure(
        'product-value',
        '.erp-work-instruction-paper__meta-value',
        ':scope > .erp-engineering-print-editable'
      ),
      measure(
        'summary-value',
        '.erp-work-instruction-paper__summary-value',
        ':scope > .erp-engineering-print-editable'
      ),
      measure(
        'section-title',
        '.erp-work-instruction-paper__section-title-row td',
        ':scope > .erp-engineering-print-editable'
      ),
      textRowSelector
        ? measure(
            'step-no',
            `${textRowSelector} .erp-work-instruction-paper__step-no`,
            ':scope > .erp-engineering-print-editable'
          )
        : null,
      textRowSelector
        ? measure(
            'step-content',
            `${textRowSelector} .erp-work-instruction-paper__step-content-cell`,
            ':scope > .erp-engineering-print-editable'
          )
        : null,
      measure(
        'text-row',
        '.erp-work-instruction-paper__sheet:not(.erp-work-instruction-paper__sheet--continuation) .erp-work-instruction-paper__text-row td',
        ':scope > .erp-engineering-print-editable'
      ),
    ].filter(Boolean)
    return {
      states,
      offCenterStates: states.filter(
        (state) =>
          state.cellHeight > 0 && state.textHeight > 0 && state.centerDelta > 6
      ),
      nonMiddleCells: states.filter(
        (state) => state.cellVerticalAlign !== 'middle'
      ),
      nonCenteredEditables: states.filter(
        (state) =>
          state.editableDisplay &&
          (state.editableDisplay !== 'flex' ||
            state.editableAlignItems !== 'center')
      ),
    }
  })

  assert(
    workInstructionCellVerticalState.states.length >= 8 &&
      workInstructionCellVerticalState.offCenterStates.length === 0 &&
      workInstructionCellVerticalState.nonMiddleCells.length === 0 &&
      workInstructionCellVerticalState.nonCenteredEditables.length === 0,
    `作业指导书头部、段落、编号、正文和文本单元格内容都应上下居中: ${JSON.stringify(workInstructionCellVerticalState)}`
  )

  await page
    .locator(
      '.erp-work-instruction-paper__step-row--text, .erp-work-instruction-paper__step-row--image'
    )
    .nth(1)
    .locator('.erp-work-instruction-paper__row-image-input')
    .setInputFiles([
      path.resolve(webDir, 'public', 'favicon.svg'),
      path.resolve(webDir, 'public', 'favicon-docs.svg'),
      path.resolve(webDir, 'public', 'favicon-dev.svg'),
      path.resolve(webDir, 'public', 'favicon-testing.svg'),
    ])

  await page.waitForFunction(
    () =>
      document.querySelectorAll(
        '.erp-work-instruction-paper__step-row--image .erp-engineering-print-image-slot img'
      ).length === 4
  )

  workInstructionRowImageControlState = await page.evaluate(() => ({
    selectedRowImageCount: document.querySelectorAll(
      '.erp-work-instruction-paper__step-row--image .erp-engineering-print-image-slot img'
    ).length,
    selectedRowDirectTextEditorCount: document.querySelectorAll(
      '.erp-work-instruction-paper__step-row--image .erp-work-instruction-paper__step-content-cell > .erp-engineering-print-editable'
    ).length,
    isImageRow: document
      .querySelector('.erp-work-instruction-paper__step-row--image')
      ?.classList.contains('erp-work-instruction-paper__step-row--image'),
    rowHeight: document
      .querySelector('.erp-work-instruction-paper__step-row--image')
      ?.getBoundingClientRect().height,
    rowImagesWrap: window.getComputedStyle(
      document.querySelector('.erp-work-instruction-paper__row-images')
    ).flexWrap,
    visibleUploadButtons: [
      ...document.querySelectorAll(
        '.erp-work-instruction-paper__row-image-button'
      ),
    ].filter((node) => window.getComputedStyle(node).display !== 'none').length,
    visibleImageActionCount: [
      ...document.querySelectorAll(
        '.erp-work-instruction-paper__row-images .erp-engineering-print-image-slot__actions'
      ),
    ].filter((node) => window.getComputedStyle(node).visibility !== 'hidden')
      .length,
    imageSources: [
      ...document.querySelectorAll(
        '.erp-work-instruction-paper__step-row--image .erp-engineering-print-image-slot img'
      ),
    ].map((image) => image.src),
  }))

  assert.deepEqual(
    {
      selectedRowImageCount:
        workInstructionRowImageControlState.selectedRowImageCount,
      selectedRowDirectTextEditorCount:
        workInstructionRowImageControlState.selectedRowDirectTextEditorCount,
      isImageRow: workInstructionRowImageControlState.isImageRow,
      visibleUploadButtons:
        workInstructionRowImageControlState.visibleUploadButtons,
      visibleImageActionCount:
        workInstructionRowImageControlState.visibleImageActionCount,
      rowImagesWrap: workInstructionRowImageControlState.rowImagesWrap,
    },
    {
      selectedRowImageCount: 4,
      selectedRowDirectTextEditorCount: 1,
      isImageRow: true,
      visibleUploadButtons: 0,
      visibleImageActionCount: 0,
      rowImagesWrap: 'wrap',
    },
    `作业指导书行内图片上传后应保留文字编辑器、纸面不显示图片按钮且支持横向换行: ${JSON.stringify(workInstructionRowImageControlState)}`
  )

  assert(
    workInstructionRowImageControlState.rowHeight >= 150,
    `作业指导书图片行高度应接近 Excel 大图行比例: ${JSON.stringify(workInstructionRowImageControlState)}`
  )

  toolbarGroups = await collectToolbarGroups()

  assert.equal(
    toolbarGroups[0].buttons.find((button) => button.text === '清空当前行图片')
      .disabled,
    false,
    '作业指导书图片上传后，清空当前行图片应可用'
  )

  assert.equal(
    toolbarGroups[0].buttons.find((button) => button.text === '标注当前行图片')
      .disabled,
    false,
    '作业指导书图片上传后，标注当前行图片应可用'
  )

  const instructionImageManager = page.locator(
    '.erp-work-instruction-annotation-modal'
  )

  await page
    .getByRole('button', { name: '标注当前行图片', exact: true })
    .click()

  await instructionImageManager.waitFor({
    state: 'visible',
    timeout: 10_000,
  })

  await instructionImageManager
    .getByRole('tab', { name: '图片 2', exact: true })
    .click()

  await page.waitForFunction(() => {
    const modal = document.querySelector(
      '.erp-work-instruction-annotation-modal'
    )
    return (modal?.getBoundingClientRect().width || 0) >= 1000
  })

  await page.waitForTimeout(350)

  const instructionImageManagerLayout = await instructionImageManager.evaluate(
    (modal) => {
      const tabs = modal.querySelector(
        '.erp-work-instruction-annotation-modal__image-tabs'
      )
      const activeTab = tabs?.querySelector('[aria-selected="true"]')
      const canvas = modal.querySelector(
        '[data-work-instruction-annotation-canvas="true"]'
      )
      const modalRect = modal.getBoundingClientRect()
      return {
        modalWidth: modalRect.width,
        tabsFit: Boolean(tabs) && tabs.scrollWidth <= tabs.clientWidth + 1,
        tabCount: tabs?.querySelectorAll('[role="tab"]').length || 0,
        activeTabText: activeTab?.textContent?.trim() || '',
        canvasVisible: Boolean(canvas?.getBoundingClientRect().width),
      }
    }
  )

  assert(
    instructionImageManagerLayout.modalWidth >= 1000 &&
      instructionImageManagerLayout.tabsFit &&
      instructionImageManagerLayout.tabCount === 4 &&
      instructionImageManagerLayout.activeTabText === '图片 2' &&
      instructionImageManagerLayout.canvasVisible,
    `作业指导书多图标注弹窗应完整显示并允许切换图片: ${JSON.stringify(instructionImageManagerLayout)}`
  )

  await instructionImageManager.screenshot({
    path: path.resolve(
      outputDir,
      'work-instruction-image-annotation-multiple.png'
    ),
  })

  await instructionImageManager
    .getByRole('button', { name: '取消', exact: true })
    .click()

  await instructionImageManager.waitFor({
    state: 'hidden',
    timeout: 10_000,
  })

  assert.equal(
    await page
      .getByRole('button', { name: '标注当前行图片', exact: true })
      .evaluate((button) => document.activeElement === button),
    true,
    '取消图片标注后焦点应返回标注当前行图片按钮'
  )

  assert.equal(
    await page
      .locator(
        '.erp-work-instruction-paper__step-row--image .erp-engineering-print-image-slot img'
      )
      .count(),
    4,
    '取消图片标注后不应修改当前行图片'
  )

  await page
    .getByRole('button', { name: '清空当前行图片', exact: true })
    .click()

  await page.waitForFunction(
    () =>
      document.querySelectorAll(
        '.erp-work-instruction-paper__step-row--image .erp-engineering-print-image-slot img'
      ).length === 0
  )

  workInstructionRowImageControlState = await page.evaluate(() => {
    const row = document.querySelectorAll(
      '.erp-work-instruction-paper__step-row--text, .erp-work-instruction-paper__step-row--image'
    )[1]
    const editor = row?.querySelector(
      '.erp-work-instruction-paper__step-content-cell > .erp-engineering-print-editable'
    )
    return {
      isTextRow: row?.classList.contains(
        'erp-work-instruction-paper__step-row--text'
      ),
      imageCount: row?.querySelectorAll('.erp-engineering-print-image-slot img')
        .length,
      directTextEditorCount: row?.querySelectorAll(
        '.erp-work-instruction-paper__step-content-cell > .erp-engineering-print-editable'
      ).length,
      textAfterRemoval: String(editor?.textContent || '')
        .replace(/\u00a0/gu, '')
        .trim(),
    }
  })

  assert(
    workInstructionRowImageControlState.isTextRow &&
      workInstructionRowImageControlState.imageCount === 0 &&
      workInstructionRowImageControlState.directTextEditorCount === 1 &&
      workInstructionRowImageControlState.textAfterRemoval.length > 0,
    `作业指导书清空当前行图片后应保留当前行文字: ${JSON.stringify(workInstructionRowImageControlState)}`
  )
}

async function verifyWorkInstructionLastRowImages({
  page,
  collectToolbarGroups,
  webDir,
}) {
  const mainInstructionSheet = page.locator(
    '.erp-work-instruction-paper__sheet:not(.erp-work-instruction-paper__sheet--continuation)'
  )

  const mainInstructionRows = mainInstructionSheet.locator(
    '.erp-work-instruction-paper__step-row--text, .erp-work-instruction-paper__step-row--image'
  )

  const lastInstructionRowIndex = (await mainInstructionRows.count()) - 1

  await mainInstructionRows
    .nth(lastInstructionRowIndex)
    .locator(
      '.erp-work-instruction-paper__step-content-cell > .erp-engineering-print-editable'
    )
    .click()

  const rowSelectionFromCellTextState = await page.evaluate((rowIndex) => {
    const rows = [
      ...document.querySelectorAll(
        '.erp-work-instruction-paper__step-row--text, .erp-work-instruction-paper__step-row--image'
      ),
    ]
    const row = rows[rowIndex]
    const editor = row?.querySelector(
      '.erp-work-instruction-paper__step-content-cell > .erp-engineering-print-editable'
    )
    return {
      selected: row?.classList.contains('erp-engineering-print-row--selected'),
      activeIsEditor: document.activeElement === editor,
      activeIsContentEditable:
        document.activeElement?.getAttribute('contenteditable') === 'true',
      rowNo: String(
        row?.querySelector('.erp-work-instruction-paper__step-no')
          ?.textContent || ''
      ).trim(),
    }
  }, lastInstructionRowIndex)

  assert(
    rowSelectionFromCellTextState.selected &&
      !rowSelectionFromCellTextState.activeIsEditor &&
      !rowSelectionFromCellTextState.activeIsContentEditable &&
      rowSelectionFromCellTextState.rowNo !== '',
    `作业指导书选择模式点击单元格文字应选中行而不是进入编辑: ${JSON.stringify(rowSelectionFromCellTextState)}`
  )

  let toolbarGroups = await collectToolbarGroups()

  assert.equal(
    toolbarGroups[0].buttons.find((button) => button.text === '给当前行加图')
      .disabled,
    false,
    '作业指导书最后一条作业行选中后，给当前行加图应可用'
  )

  await mainInstructionRows
    .nth(lastInstructionRowIndex)
    .locator('.erp-work-instruction-paper__row-image-input')
    .setInputFiles([
      path.resolve(webDir, 'public', 'favicon.svg'),
      path.resolve(webDir, 'public', 'favicon.svg'),
      path.resolve(webDir, 'public', 'favicon.svg'),
      path.resolve(webDir, 'public', 'favicon.svg'),
    ])

  await page.waitForFunction((rowIndex) => {
    const sheet = document.querySelector(
      '.erp-work-instruction-paper__sheet:not(.erp-work-instruction-paper__sheet--continuation)'
    )
    const row = sheet?.querySelectorAll(
      '.erp-work-instruction-paper__step-row--text, .erp-work-instruction-paper__step-row--image'
    )[rowIndex]
    return (
      row?.querySelectorAll('.erp-engineering-print-image-slot img').length ===
      4
    )
  }, lastInstructionRowIndex)

  const lastRowImageUploadState = await page.evaluate((rowIndex) => {
    const sheet = document.querySelector(
      '.erp-work-instruction-paper__sheet:not(.erp-work-instruction-paper__sheet--continuation)'
    )
    const row = sheet?.querySelectorAll(
      '.erp-work-instruction-paper__step-row--text, .erp-work-instruction-paper__step-row--image'
    )[rowIndex]
    const rowImages = row?.querySelector(
      '.erp-work-instruction-paper__row-images'
    )
    const imageSlots = [
      ...(row?.querySelectorAll(
        '.erp-work-instruction-paper__row-images .erp-engineering-print-image-slot'
      ) || []),
    ]
    const imageTops = imageSlots.map((slot) => slot.getBoundingClientRect().top)
    return {
      imageCount:
        row?.querySelectorAll('.erp-engineering-print-image-slot img').length ||
        0,
      buttonCount: row?.querySelectorAll('button').length || 0,
      rowImagesWrap: rowImages
        ? window.getComputedStyle(rowImages).flexWrap
        : '',
      rowHeight: row?.getBoundingClientRect().height || 0,
      rowMinHeightVar:
        row?.style.getPropertyValue('--instruction-row-min-height') || '',
      selected: row?.classList.contains('erp-engineering-print-row--selected'),
      wrappedLineCount: new Set(imageTops.map((top) => Math.round(top))).size,
    }
  }, lastInstructionRowIndex)

  assert(
    lastRowImageUploadState.imageCount === 4 &&
      lastRowImageUploadState.buttonCount === 0 &&
      lastRowImageUploadState.rowImagesWrap === 'wrap' &&
      lastRowImageUploadState.rowHeight >= 150 &&
      lastRowImageUploadState.rowMinHeightVar === '11.6mm' &&
      lastRowImageUploadState.selected &&
      lastRowImageUploadState.wrappedLineCount >= 2,
    `作业指导书最后一条作业行应支持顶部选中后多图横排并自动换行: ${JSON.stringify(lastRowImageUploadState)}`
  )

  await page
    .locator('.erp-print-shell__panel .erp-print-shell__toolbar-group')
    .first()
    .getByRole('button', { name: '清空当前行图片', exact: true })
    .click()

  await page.waitForFunction((rowIndex) => {
    const sheet = document.querySelector(
      '.erp-work-instruction-paper__sheet:not(.erp-work-instruction-paper__sheet--continuation)'
    )
    const row = sheet?.querySelectorAll(
      '.erp-work-instruction-paper__step-row--text, .erp-work-instruction-paper__step-row--image'
    )[rowIndex]
    return (
      row?.querySelectorAll('.erp-engineering-print-image-slot img').length ===
      0
    )
  }, lastInstructionRowIndex)
}

async function verifyWorkInstructionRichText({ page }) {
  await page.evaluate(() => {
    const editor = document
      .querySelectorAll(
        '.erp-work-instruction-paper__step-row--text, .erp-work-instruction-paper__step-row--image'
      )[0]
      ?.querySelector(
        '.erp-work-instruction-paper__step-content-cell > .erp-engineering-print-editable'
      )
    if (!editor) return
    editor.focus()
    const range = document.createRange()
    range.selectNodeContents(editor)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  })

  await page
    .locator('.erp-print-shell__panel .erp-print-shell__toolbar-group')
    .nth(1)
    .getByRole('button', { name: '文字标红/取消' })
    .click()

  await page.locator('.erp-work-instruction-paper__title-cell').first().click()

  let richTextPersistedState = await page.evaluate(() => {
    const editor = document
      .querySelectorAll(
        '.erp-work-instruction-paper__step-row--text, .erp-work-instruction-paper__step-row--image'
      )[0]
      ?.querySelector(
        '.erp-work-instruction-paper__step-content-cell > .erp-engineering-print-editable'
      )
    const redNode =
      editor?.querySelector('[style*="red"]') ||
      editor?.querySelector('[style*="255, 0, 0"]')
    const strongNode = editor?.querySelector('strong, b')
    return {
      html: editor?.innerHTML || '',
      color: redNode ? window.getComputedStyle(redNode).color : '',
      strongCount: strongNode ? 1 : 0,
    }
  })

  assert(
    richTextPersistedState.color === 'rgb(255, 0, 0)' &&
      richTextPersistedState.strongCount === 0,
    `作业指导书选中文字标红后失焦保存应保留红色且不再产生加粗标签: ${JSON.stringify(richTextPersistedState)}`
  )

  await page.evaluate(() => {
    const editor = document
      .querySelectorAll(
        '.erp-work-instruction-paper__step-row--text, .erp-work-instruction-paper__step-row--image'
      )[0]
      ?.querySelector(
        '.erp-work-instruction-paper__step-content-cell > .erp-engineering-print-editable'
      )
    if (!editor) return
    editor.focus()
    const range = document.createRange()
    range.selectNodeContents(editor)
    const selection = window.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  })

  await page
    .locator('.erp-print-shell__panel .erp-print-shell__toolbar-group')
    .nth(1)
    .getByRole('button', { name: '文字标红/取消' })
    .click()

  await page.locator('.erp-work-instruction-paper__title-cell').first().click()

  richTextPersistedState = await page.evaluate(() => {
    const editor = document
      .querySelectorAll(
        '.erp-work-instruction-paper__step-row--text, .erp-work-instruction-paper__step-row--image'
      )[0]
      ?.querySelector(
        '.erp-work-instruction-paper__step-content-cell > .erp-engineering-print-editable'
      )
    const redNode =
      editor?.querySelector('[style*="red"]') ||
      editor?.querySelector('[style*="255, 0, 0"]')
    const strongNode = editor?.querySelector('strong, b')
    return {
      html: editor?.innerHTML || '',
      color: redNode ? window.getComputedStyle(redNode).color : '',
      strongCount: strongNode ? 1 : 0,
    }
  })

  assert(
    richTextPersistedState.color === '' &&
      richTextPersistedState.strongCount === 0,
    `作业指导书选中已标红文字再次点击应取消标红: ${JSON.stringify(richTextPersistedState)}`
  )
}

async function verifyWorkInstructionRowInsertion({
  page,
  collectToolbarGroups,
}) {
  await page
    .locator(
      '.erp-work-instruction-paper__sheet:not(.erp-work-instruction-paper__sheet--continuation) .erp-work-instruction-paper__step-row--text, .erp-work-instruction-paper__sheet:not(.erp-work-instruction-paper__sheet--continuation) .erp-work-instruction-paper__step-row--image'
    )
    .nth(1)
    .dispatchEvent('mousedown', { bubbles: true, cancelable: true })

  const instructionRowsBefore = await page
    .locator(
      '.erp-work-instruction-paper__sheet:not(.erp-work-instruction-paper__sheet--continuation) .erp-work-instruction-paper__step-row--text, .erp-work-instruction-paper__sheet:not(.erp-work-instruction-paper__sheet--continuation) .erp-work-instruction-paper__step-row--image'
    )
    .count()

  await page.getByRole('button', { name: '下插一行' }).click()

  const instructionInsertState = await page.evaluate(() => {
    const mainSheet = document.querySelector(
      '.erp-work-instruction-paper__sheet:not(.erp-work-instruction-paper__sheet--continuation)'
    )
    const rows = [
      ...(mainSheet?.querySelectorAll(
        '.erp-work-instruction-paper__step-row--text > .erp-work-instruction-paper__step-no, .erp-work-instruction-paper__step-row--image > .erp-work-instruction-paper__step-no'
      ) || []),
    ].map((node) => String(node.textContent || '').trim())
    const stepRows = [
      ...(mainSheet?.querySelectorAll(
        '.erp-work-instruction-paper__step-row--text, .erp-work-instruction-paper__step-row--image'
      ) || []),
    ]
    const insertedRow = stepRows[2]
    const selectedSourceRow = stepRows[1]
    const shiftedAnnotationRow = stepRows[3]
    return {
      rows,
      insertedText: String(insertedRow?.textContent || '')
        .replace(/\s+/gu, ' ')
        .trim(),
      selectedSourceHeightVar:
        selectedSourceRow?.style.getPropertyValue(
          '--instruction-row-min-height'
        ) || '',
      insertedHeightVar:
        insertedRow?.style.getPropertyValue('--instruction-row-min-height') ||
        '',
      insertedPixelHeight: insertedRow?.getBoundingClientRect().height || 0,
      insertedImageCount:
        insertedRow?.querySelectorAll('.erp-engineering-print-image-slot img')
          .length || 0,
      insertedNoteCount:
        insertedRow?.querySelectorAll(
          '.erp-work-instruction-paper__annotation-note'
        ).length || 0,
      insertedCalloutCount:
        insertedRow?.querySelectorAll(
          '.erp-work-instruction-paper__annotation-callouts line'
        ).length || 0,
      insertedSelected: insertedRow?.classList.contains(
        'erp-engineering-print-row--selected'
      ),
      shiftedAnnotationNo: String(
        shiftedAnnotationRow?.querySelector(
          '.erp-work-instruction-paper__step-no'
        )?.textContent || ''
      ).trim(),
      shiftedAnnotationStillAnnotated:
        shiftedAnnotationRow?.classList.contains(
          'erp-work-instruction-paper__step-row--annotated'
        ) || false,
      shiftedAnnotationCalloutCount:
        shiftedAnnotationRow?.querySelectorAll(
          '.erp-work-instruction-paper__annotation-callouts line'
        ).length || 0,
    }
  })

  assert.deepEqual(
    instructionInsertState.rows,
    ['1', '2', '3', '1', '1', '2'],
    `作业指导书插行后应按小模块重编行号: ${JSON.stringify(instructionInsertState)}`
  )

  assert(
    /^3$/u.test(instructionInsertState.insertedText) &&
      instructionInsertState.selectedSourceHeightVar === '11.6mm' &&
      instructionInsertState.insertedHeightVar === '11.6mm' &&
      instructionInsertState.insertedPixelHeight >= 40 &&
      instructionInsertState.insertedPixelHeight <= 50 &&
      instructionInsertState.insertedImageCount === 0 &&
      instructionInsertState.insertedNoteCount === 0 &&
      instructionInsertState.insertedCalloutCount === 0 &&
      instructionInsertState.insertedSelected &&
      instructionInsertState.shiftedAnnotationNo === '1' &&
      !instructionInsertState.shiftedAnnotationStillAnnotated &&
      instructionInsertState.shiftedAnnotationCalloutCount === 0,
    `作业指导书下插应在已选编号行后插入同高空白普通行，不复制图片或批注: ${JSON.stringify(instructionInsertState)}`
  )

  assert.equal(
    await page
      .locator(
        '.erp-work-instruction-paper__sheet:not(.erp-work-instruction-paper__sheet--continuation) .erp-work-instruction-paper__step-row--text, .erp-work-instruction-paper__sheet:not(.erp-work-instruction-paper__sheet--continuation) .erp-work-instruction-paper__step-row--image'
      )
      .count(),
    instructionRowsBefore + 1,
    '作业指导书下插一行应新增作业行'
  )

  await page
    .locator('.erp-print-shell__panel .erp-print-shell__toolbar-group')
    .first()
    .getByRole('button', { name: '移除当前行' })
    .click()

  assert.equal(
    await page
      .locator(
        '.erp-work-instruction-paper__sheet:not(.erp-work-instruction-paper__sheet--continuation) .erp-work-instruction-paper__step-row--text, .erp-work-instruction-paper__sheet:not(.erp-work-instruction-paper__sheet--continuation) .erp-work-instruction-paper__step-row--image'
      )
      .count(),
    instructionRowsBefore,
    '作业指导书移除当前作业行后行数应恢复'
  )

  const instructionMainBodyRowSelector =
    '.erp-work-instruction-paper__sheet:not(.erp-work-instruction-paper__sheet--continuation) .erp-work-instruction-paper__section-title-row, .erp-work-instruction-paper__sheet:not(.erp-work-instruction-paper__sheet--continuation) .erp-work-instruction-paper__text-row, .erp-work-instruction-paper__sheet:not(.erp-work-instruction-paper__sheet--continuation) .erp-work-instruction-paper__step-row--text, .erp-work-instruction-paper__sheet:not(.erp-work-instruction-paper__sheet--continuation) .erp-work-instruction-paper__step-row--image'

  const firstTitleRow = page
    .locator(
      '.erp-work-instruction-paper__sheet:not(.erp-work-instruction-paper__sheet--continuation) .erp-work-instruction-paper__section-title-row'
    )
    .first()

  await firstTitleRow.dispatchEvent('mousedown', {
    bubbles: true,
    cancelable: true,
  })

  const titleSelectionFromCellTextState = await page.evaluate(() => {
    const row = document.querySelector(
      '.erp-work-instruction-paper__sheet:not(.erp-work-instruction-paper__sheet--continuation) .erp-work-instruction-paper__section-title-row'
    )
    const editor = row?.querySelector('td > .erp-engineering-print-editable')
    return {
      selected: row?.classList.contains('erp-engineering-print-row--selected'),
      activeIsEditor: document.activeElement === editor,
      activeIsContentEditable:
        document.activeElement?.getAttribute('contenteditable') === 'true',
      text: String(editor?.textContent || '').trim(),
    }
  })

  assert(
    titleSelectionFromCellTextState.selected &&
      !titleSelectionFromCellTextState.activeIsEditor &&
      !titleSelectionFromCellTextState.activeIsContentEditable &&
      titleSelectionFromCellTextState.text.length > 0,
    `作业指导书选择模式点击标题行应选中行而不是进入编辑: ${JSON.stringify(titleSelectionFromCellTextState)}`
  )

  let toolbarGroups = await collectToolbarGroups()

  assert.equal(
    toolbarGroups[0].buttons.find((button) => button.text === '给当前行加图')
      .disabled,
    true,
    '作业指导书标题行选中后，给当前行加图仍应禁用'
  )

  await page.getByRole('button', { name: '设为文本行' }).click()

  await page.waitForFunction(() =>
    Boolean(
      document.querySelector(
        '.erp-work-instruction-paper__text-row.erp-engineering-print-row--selected'
      )
    )
  )

  await page.getByRole('button', { name: '设为标题行' }).click()

  await page.waitForFunction(() =>
    Boolean(
      document.querySelector(
        '.erp-work-instruction-paper__section-title-row.erp-engineering-print-row--selected'
      )
    )
  )

  const instructionBodyRowsBefore = await page
    .locator(instructionMainBodyRowSelector)
    .count()

  await page.getByRole('button', { name: '下插一行' }).click()

  assert.equal(
    await page.locator(instructionMainBodyRowSelector).count(),
    instructionBodyRowsBefore + 1,
    '作业指导书标题行下插一行应新增统一正文行'
  )

  const titleInsertHeightState = await page.evaluate(() => {
    const insertedRow = document.querySelector(
      '.erp-work-instruction-paper__step-row--text.erp-engineering-print-row--selected, .erp-work-instruction-paper__step-row--image.erp-engineering-print-row--selected'
    )
    return {
      insertedRowHeightVar:
        insertedRow?.style.getPropertyValue('--instruction-row-min-height') ||
        '',
      insertedPixelHeight: insertedRow?.getBoundingClientRect().height || 0,
      insertedEditableText: String(
        insertedRow?.querySelector(
          '.erp-work-instruction-paper__step-content-cell > .erp-engineering-print-editable'
        )?.textContent || ''
      )
        .replace(/\s+/gu, '')
        .trim(),
      insertedHtml: String(
        insertedRow?.querySelector(
          '.erp-work-instruction-paper__step-content-cell > .erp-engineering-print-editable'
        )?.innerHTML || ''
      ),
      insertedNo: String(
        insertedRow?.querySelector('.erp-work-instruction-paper__step-no')
          ?.textContent || ''
      ).trim(),
      insertedImageCount:
        insertedRow?.querySelectorAll('.erp-engineering-print-image-slot img')
          .length || 0,
      insertedSelected: insertedRow?.classList.contains(
        'erp-engineering-print-row--selected'
      ),
    }
  })

  assert(
    titleInsertHeightState.insertedRowHeightVar === '11.6mm' &&
      titleInsertHeightState.insertedPixelHeight >= 40 &&
      titleInsertHeightState.insertedPixelHeight <= 54 &&
      titleInsertHeightState.insertedEditableText === '' &&
      !/amp|nbsp/u.test(titleInsertHeightState.insertedEditableText) &&
      !/amp;amp|amp;nbsp/u.test(titleInsertHeightState.insertedHtml) &&
      titleInsertHeightState.insertedNo.length > 0 &&
      titleInsertHeightState.insertedImageCount === 0 &&
      titleInsertHeightState.insertedSelected,
    `作业指导书标题行后新增行应继承相邻普通文本行高，但不复制图片或转义占位: ${JSON.stringify(titleInsertHeightState)}`
  )

  await page.getByRole('button', { name: '移除当前行' }).click()

  assert.equal(
    await page.locator(instructionMainBodyRowSelector).count(),
    instructionBodyRowsBefore,
    '作业指导书移除标题行后新增行后行数应恢复'
  )
}

import { createEngineeringPrintAssertions } from './engineeringPrintAssertions.mjs'
export function createWorkInstructionInteractionScenario({
  assertPrintWorkspacePaperTopRhythm,
  assertPrintEditableFocusBorderStyle,
  assertPrintEditableFocusSurvivesSwitch,
  assert,
  path,
  webDir,
  expectText,
  outputDir,
  assertNoHorizontalOverflow,
}) {
  return {
    name: 'engineering-work-instruction-interactions',
    path: '/erp/print-workspace/engineering-work-instruction?draft=fresh',
    auth: 'admin',
    viewport: { width: 1600, height: 1100 },
    verify: async (page) => {
      const {
        assertEngineeringPaperScreenPrintBox,
        assertEngineeringEditorRounded,
        assertFullCellEditableCoverage,
        writeEngineeringPaperReviewScreenshot,
        assertEngineeringServerPdfSnapshotPageBox,
        assertWorkInstructionRemarkStaysInSheet,
        collectToolbarGroups,
        assertButtonTexts,
        assertRichEditableNbspArtifactGuard,
        assertNoLegacyEngineeringRowButtonText,
      } = await createEngineeringPrintAssertions({
        page,
        assert,
        path,
        outputDir,
      })

      await page.locator('.erp-work-instruction-paper').waitFor({
        state: 'visible',
        timeout: 10_000,
      })

      await assertPrintWorkspacePaperTopRhythm(page, {
        paperSelector: '.erp-work-instruction-paper',
        scenarioLabel: '作业指导书',
        screenshotName: 'print-workspace-work-instruction-paper-top-rhythm',
      })

      await assertEngineeringPaperScreenPrintBox(
        '.erp-work-instruction-paper',
        '作业指导书'
      )

      await assertEngineeringEditorRounded('作业指导书')

      await assertFullCellEditableCoverage(
        '作业指导书',
        '.erp-work-instruction-paper__step-content-cell',
        '.erp-engineering-print-editable'
      )

      await assertPrintEditableFocusBorderStyle(page, {
        selector:
          '.erp-work-instruction-paper__step-content-cell .erp-engineering-print-editable',
        scenarioLabel: '作业指导书',
      })

      await assertPrintEditableFocusSurvivesSwitch(page, {
        firstSelector:
          '.erp-work-instruction-paper__step-no .erp-engineering-print-editable',
        secondSelector:
          '.erp-work-instruction-paper__step-content-cell .erp-engineering-print-editable',
        scenarioLabel: '作业指导书',
      })

      await writeEngineeringPaperReviewScreenshot(
        '.erp-work-instruction-paper',
        'work-instruction-runtime-latest.png'
      )

      await assertEngineeringServerPdfSnapshotPageBox({
        paperSelector: '.erp-work-instruction-paper',
        contentSelector: '.erp-work-instruction-paper__sheet',
        scenarioLabel: '作业指导书',
        screenshotName: 'work-instruction-server-pdf-page-box',
      })

      await assertWorkInstructionRemarkStaysInSheet({
        scenarioLabel: '作业指导书',
        paperSelector: '.erp-work-instruction-paper',
        screenshotName: 'work-instruction-print-remark-first-page.png',
      })

      let toolbarGroups = await collectToolbarGroups()

      assertButtonTexts(
        toolbarGroups[0],
        [
          '选择行',
          '上插一行',
          '下插一行',
          '移除当前行',
          '设为标题行',
          '设为编号行',
          '设为文本行',
          '给当前行加图',
          '清空当前行图片',
          '标注当前行图片',
        ],
        '作业指导书纸面行'
      )

      assertButtonTexts(
        toolbarGroups[1],
        ['文字标红/取消'],
        '作业指导书文字格式'
      )

      await assertRichEditableNbspArtifactGuard(
        '.erp-work-instruction-paper',
        '作业指导书'
      )

      assert.equal(
        toolbarGroups[0].buttons.find((button) => button.text === '上插一行')
          .disabled,
        true,
        '作业指导书未选择纸面行前，上插一行应禁用'
      )

      assert.equal(
        toolbarGroups[0].buttons.find((button) => button.text === '下插一行')
          .disabled,
        true,
        '作业指导书未选择纸面行前，下插一行应禁用'
      )

      await assertNoLegacyEngineeringRowButtonText('作业指导书')

      let workInstructionRowImageControlState = await page.evaluate(() => ({
        visibleUploadButtons: [
          ...document.querySelectorAll(
            '.erp-work-instruction-paper__row-image-button'
          ),
        ].filter((node) => window.getComputedStyle(node).display !== 'none')
          .length,
        visibleEmptyImageRows: [
          ...document.querySelectorAll(
            '.erp-work-instruction-paper__row-images--empty'
          ),
        ].filter((node) => window.getComputedStyle(node).display !== 'none')
          .length,
        rowImageSlotCount: document.querySelectorAll(
          '.erp-work-instruction-paper__row-images .erp-engineering-print-image-slot'
        ).length,
      }))

      assert.deepEqual(
        workInstructionRowImageControlState,
        {
          visibleUploadButtons: 0,
          visibleEmptyImageRows: 0,
          rowImageSlotCount: 0,
        },
        `作业指导书作业行未选中时不应常驻行内加图按钮或空图片槽: ${JSON.stringify(workInstructionRowImageControlState)}`
      )

      assert.equal(
        toolbarGroups[0].buttons.find(
          (button) => button.text === '给当前行加图'
        ).disabled,
        true,
        '作业指导书未选择纸面行前，给当前行加图应禁用'
      )

      assert.equal(
        toolbarGroups[0].buttons.find(
          (button) => button.text === '清空当前行图片'
        ).disabled,
        true,
        '作业指导书未选择纸面行前，清空当前行图片应禁用'
      )

      assert.equal(
        toolbarGroups[0].buttons.find(
          (button) => button.text === '标注当前行图片'
        ).disabled,
        true,
        '作业指导书未选择纸面行前，标注当前行图片应禁用'
      )

      await verifyWorkInstructionHeaderImages({
        page,
        webDir,
        writeEngineeringPaperReviewScreenshot,
      })

      await verifyWorkInstructionDefaultSheet({ page })

      await verifyWorkInstructionRowImages({
        page,
        collectToolbarGroups,
        webDir,
        outputDir,
      })

      await verifyWorkInstructionLastRowImages({
        page,
        collectToolbarGroups,
        webDir,
      })

      await verifyWorkInstructionRichText({ page })

      await verifyWorkInstructionRowInsertion({ page, collectToolbarGroups })

      await assertNoHorizontalOverflow(
        page,
        'engineering-work-instruction-interactions'
      )
    },
  }
}
