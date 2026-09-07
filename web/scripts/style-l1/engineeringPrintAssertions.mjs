import { Buffer } from 'node:buffer'
import fs from 'node:fs/promises'
export async function createEngineeringPrintAssertions({
  page,
  assert,
  path,
  outputDir,
}) {
  const collectToolbarGroups = async () =>
    page.evaluate(() =>
      [
        ...document.querySelectorAll(
          '.erp-print-shell__panel .erp-print-shell__toolbar-group'
        ),
        ...document.querySelectorAll(
          '.erp-print-shell__toolbar .erp-print-shell__toolbar-group'
        ),
      ].map((group) => ({
        buttons: [...group.querySelectorAll('button')].map((button) => ({
          text: String(button.textContent || '')
            .replace(/\s+/gu, ' ')
            .trim(),
          disabled: button.disabled,
        })),
      }))
    )

  const assertButtonTexts = (group, expectedTexts, scenarioLabel) => {
    const actualTexts = (group?.buttons || []).map((button) => button.text)
    assert.deepEqual(
      actualTexts,
      expectedTexts,
      `${scenarioLabel} 按钮文案应对齐打印合同工作台: ${JSON.stringify(actualTexts)}`
    )
  }

  const assertNoLegacyEngineeringRowButtonText = async (scenarioLabel) => {
    const text = await page.evaluate(() => document.body?.innerText || '')
    assert(
      !/追加|块内加行|段落加行|移除色卡行|移除作业行|上插作业行|下插作业行|选择作业行|选择段落行|上插段落行|下插段落行/u.test(
        text
      ),
      `${scenarioLabel} 不应保留旧行操作按钮文案: ${text}`
    )
  }

  const assertEngineeringEditorRounded = async (scenarioLabel) => {
    const metrics = await page.evaluate(() => {
      const panel = document.querySelector('.erp-print-shell__record-panel')
      const paper = document.querySelector('.erp-engineering-print-paper')
      return {
        panelRadius: parseFloat(getComputedStyle(panel).borderTopLeftRadius),
        paperRadius: parseFloat(getComputedStyle(paper).borderTopLeftRadius),
        panelFits: panel.scrollWidth <= panel.clientWidth + 1,
        paperFits: paper.scrollWidth <= paper.clientWidth + 1,
        sections: panel.querySelectorAll('.erp-print-shell__tool-section')
          .length,
        duplicateFields: panel.querySelectorAll(
          'input:not([type="file"]), textarea, [contenteditable="true"]'
        ).length,
      }
    })
    assert(
      metrics.panelRadius >= 8 &&
        metrics.paperRadius >= 10 &&
        metrics.panelFits &&
        metrics.paperFits &&
        metrics.sections >= 2 &&
        metrics.duplicateFields === 0,
      `${scenarioLabel} 工具分组和纸面应完整且不重复业务字段: ${JSON.stringify(metrics)}`
    )
  }

  const collectEngineeringPaperBox = async (paperSelector) =>
    page.evaluate((selector) => {
      const stage = document.querySelector('.erp-print-shell__stage')
      const paper = document.querySelector(selector)
      const style = paper && window.getComputedStyle(paper)
      const stageRect = stage?.getBoundingClientRect()
      const paperRect = paper?.getBoundingClientRect()
      return {
        foundPaper: Boolean(paper),
        boxSizing: style?.boxSizing || '',
        marginLeft: style?.marginLeft || '',
        marginRight: style?.marginRight || '',
        paddingLeft: style?.paddingLeft || '',
        paddingRight: style?.paddingRight || '',
        borderLeftWidth: style?.borderLeftWidth || '',
        borderRightWidth: style?.borderRightWidth || '',
        backgroundColor: style?.backgroundColor || '',
        paperWidth: paperRect?.width || 0,
        stageWidth: stageRect?.width || 0,
        paperLeftGap:
          stageRect && paperRect ? paperRect.left - stageRect.left : -1,
        paperRightGap:
          stageRect && paperRect ? stageRect.right - paperRect.right : -1,
      }
    }, paperSelector)

  const assertEngineeringPaperScreenPrintBox = async (
    paperSelector,
    scenarioLabel
  ) => {
    const screenMetrics = await collectEngineeringPaperBox(paperSelector)
    await page.emulateMedia({ media: 'print' })
    const printMetrics = await collectEngineeringPaperBox(paperSelector)
    await page.emulateMedia({ media: 'screen' })
    const parsePx = (value) => Number.parseFloat(value) || 0
    assert(
      screenMetrics.foundPaper &&
        printMetrics.foundPaper &&
        screenMetrics.boxSizing === 'border-box' &&
        printMetrics.boxSizing === 'border-box' &&
        Math.abs(
          parsePx(screenMetrics.paddingLeft) -
            parsePx(screenMetrics.paddingRight)
        ) <= 1 &&
        Math.abs(
          parsePx(printMetrics.paddingLeft) - parsePx(printMetrics.paddingRight)
        ) <= 1 &&
        Math.abs(screenMetrics.paperWidth - printMetrics.paperWidth) <= 2 &&
        Math.abs(
          parsePx(screenMetrics.paddingLeft) - parsePx(printMetrics.paddingLeft)
        ) <= 1 &&
        Math.abs(
          parsePx(screenMetrics.paddingRight) -
            parsePx(printMetrics.paddingRight)
        ) <= 1 &&
        Math.abs(screenMetrics.paperLeftGap - screenMetrics.paperRightGap) <=
          4 &&
        printMetrics.stageWidth >= printMetrics.paperWidth - 1 &&
        printMetrics.stageWidth <= printMetrics.paperWidth + 1 &&
        Math.abs(printMetrics.paperLeftGap) <= 1 &&
        Math.abs(printMetrics.paperRightGap) <= 1 &&
        printMetrics.borderLeftWidth === '0px' &&
        printMetrics.borderRightWidth === '0px' &&
        printMetrics.backgroundColor === 'rgb(255, 255, 255)',
      `${scenarioLabel} 工程模板纸面 screen/print 左右留白和纸张盒模型应一致: ${JSON.stringify({ screenMetrics, printMetrics })}`
    )
  }

  const capturedEngineeringPdfRequests = []

  const diagnosticPdfBuffer = Buffer.from(
    '%PDF-1.4\n%plush-style-l1-engineering\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n'
  )

  await page.route('**/templates/render-pdf', async (route) => {
    const payload = route.request().postDataJSON() || {}
    capturedEngineeringPdfRequests.push(payload)
    await fs.writeFile(
      path.join(outputDir, `print-snapshot-${payload.template_key}.html`),
      payload.html
    )
    await route.fulfill({
      status: 200,
      contentType: 'application/pdf',
      headers: {
        'Content-Disposition': `inline; filename="${payload.file_name || 'style-l1.pdf'}"`,
        'Cache-Control': 'no-store',
      },
      body: diagnosticPdfBuffer,
    })
  })

  const assertEngineeringServerPdfSnapshotPageBox = async ({
    paperSelector,
    contentSelector,
    scenarioLabel,
    screenshotName,
  }) => {
    const requestCountBefore = capturedEngineeringPdfRequests.length
    const [popup] = await Promise.all([
      page.waitForEvent('popup', { timeout: 10_000 }).catch(() => null),
      page.getByRole('button', { name: '在线预览 PDF' }).click(),
    ])
    const deadline = Date.now() + 10_000
    while (
      capturedEngineeringPdfRequests.length <= requestCountBefore &&
      Date.now() < deadline
    ) {
      await page.waitForTimeout(100)
    }
    if (popup && !popup.isClosed()) {
      await popup.close().catch(() => {})
    }
    const payload = capturedEngineeringPdfRequests.at(-1)
    assert(payload?.html, `${scenarioLabel} 应发起服务端 PDF HTML 快照请求`)

    const snapshotPage = await page.context().newPage()
    try {
      await snapshotPage.setViewportSize({ width: 1440, height: 900 })
      await snapshotPage.setContent(payload.html, { waitUntil: 'load' })
      await snapshotPage.emulateMedia({ media: 'print' })
      await snapshotPage
        .locator('[data-server-pdf-root="true"]')
        .waitFor({ state: 'visible', timeout: 10_000 })
      const metrics = await snapshotPage.evaluate(
        ({ paperSelector, contentSelector }) => {
          const paper = document.querySelector('[data-server-pdf-root="true"]')
          const expectedPaper = document.querySelector(paperSelector)
          const content = paper?.querySelector(contentSelector)
          const bodyRect = document.body.getBoundingClientRect()
          const paperRect = paper?.getBoundingClientRect()
          const contentRect = content?.getBoundingClientRect()
          const paperStyle = paper ? window.getComputedStyle(paper) : null
          return {
            foundPaper: Boolean(paper),
            foundExpectedPaper: paper === expectedPaper,
            foundContent: Boolean(content),
            bodyWidth: bodyRect.width,
            paperLeft: paperRect?.left || 0,
            paperRight: paperRect?.right || 0,
            paperWidth: paperRect?.width || 0,
            paperPaddingLeft: parseFloat(paperStyle?.paddingLeft || '0'),
            paperPaddingRight: parseFloat(paperStyle?.paddingRight || '0'),
            paperMarginLeft: paperStyle?.marginLeft || '',
            paperMarginRight: paperStyle?.marginRight || '',
            contentLeftGap:
              paperRect && contentRect
                ? contentRect.left - paperRect.left
                : null,
            contentRightGap:
              paperRect && contentRect
                ? paperRect.right - contentRect.right
                : null,
            inlineCssHasEngineering: /erp-engineering-print-paper/u.test(
              document.querySelector('[data-server-pdf-inline-styles]')
                ?.textContent || ''
            ),
            overrideCss: document.querySelector('[data-server-pdf-style]')
              ?.textContent,
          }
        },
        { paperSelector, contentSelector }
      )
      assert(
        metrics.foundPaper &&
          metrics.foundExpectedPaper &&
          metrics.foundContent &&
          metrics.inlineCssHasEngineering &&
          metrics.bodyWidth >= 792 &&
          metrics.bodyWidth <= 795 &&
          Math.abs(metrics.paperLeft) <= 1 &&
          Math.abs(metrics.paperRight - metrics.bodyWidth) <= 1 &&
          metrics.paperWidth >= 792 &&
          metrics.paperWidth <= 795 &&
          Math.abs(metrics.paperPaddingLeft - metrics.paperPaddingRight) <= 1 &&
          Math.abs(metrics.contentLeftGap - metrics.contentRightGap) <= 1 &&
          metrics.paperMarginLeft === '0px' &&
          metrics.paperMarginRight === '0px',
        `${scenarioLabel} 服务端 PDF 快照应以 A4 宽 body 从页面原点输出，不能在 1440px viewport 内居中导致左右留白不一致: ${JSON.stringify(metrics)}`
      )
      await snapshotPage.screenshot({
        path: path.join(outputDir, `${screenshotName}.png`),
        fullPage: false,
      })
    } finally {
      await snapshotPage.close().catch(() => {})
    }
  }

  const assertFullCellEditableCoverage = async (
    scenarioLabel,
    cellSelector,
    editorSelector
  ) => {
    const metrics = await page.evaluate(
      ({ cellSelector, editorSelector }) => {
        const cell = document.querySelector(cellSelector)
        const editor = cell?.querySelector(editorSelector)
        const cellRect = cell?.getBoundingClientRect()
        const editorRect = editor?.getBoundingClientRect()
        return {
          foundCell: Boolean(cell),
          foundEditor: Boolean(editor),
          cellWidth: cellRect?.width || 0,
          cellHeight: cellRect?.height || 0,
          editorWidth: editorRect?.width || 0,
          editorHeight: editorRect?.height || 0,
          leftGap:
            cellRect && editorRect ? editorRect.left - cellRect.left : null,
          rightGap:
            cellRect && editorRect ? cellRect.right - editorRect.right : null,
          topGap: cellRect && editorRect ? editorRect.top - cellRect.top : null,
          bottomGap:
            cellRect && editorRect ? cellRect.bottom - editorRect.bottom : null,
          editorDisplay: editor ? window.getComputedStyle(editor).display : '',
          editorBoxSizing: editor
            ? window.getComputedStyle(editor).boxSizing
            : '',
        }
      },
      { cellSelector, editorSelector }
    )
    assert(
      metrics.foundCell &&
        metrics.foundEditor &&
        metrics.editorDisplay !== 'inline' &&
        metrics.editorBoxSizing === 'border-box' &&
        metrics.editorWidth >= metrics.cellWidth - 3 &&
        metrics.editorHeight >= metrics.cellHeight - 3 &&
        Math.abs(metrics.leftGap) <= 2 &&
        Math.abs(metrics.rightGap) <= 2 &&
        Math.abs(metrics.topGap) <= 2 &&
        Math.abs(metrics.bottomGap) <= 2,
      `${scenarioLabel} 可编辑层应像加工合同一样占满所在单元格: ${JSON.stringify(metrics)}`
    )
  }

  const writeEngineeringPaperReviewScreenshot = async (selector, fileName) => {
    const fs = await import('node:fs/promises')
    const reviewDir = path.join(
      outputDir,
      'engineering-template-review',
      'runtime'
    )
    await fs.mkdir(reviewDir, { recursive: true })
    const paperLocator = page.locator(selector).first()
    await paperLocator.evaluate((node) => {
      node.scrollIntoView({ block: 'center', inline: 'nearest' })
    })
    await page.waitForTimeout(100)
    const box = await paperLocator.boundingBox()
    assert(box, `${fileName} 应能获取纸面截图区域`)
    await page.evaluate(() => {
      document
        .querySelector('#engineering-template-review-screenshot-style')
        ?.remove()
      const style = document.createElement('style')
      style.id = 'engineering-template-review-screenshot-style'
      style.textContent =
        '.erp-print-shell__toolbar { display: none !important; }'
      document.head.appendChild(style)
    })
    await paperLocator.screenshot({
      path: path.join(reviewDir, fileName),
    })
    await page.evaluate(() => {
      document
        .querySelector('#engineering-template-review-screenshot-style')
        ?.remove()
    })
  }

  const assertWorkInstructionRemarkStaysInSheet = async ({
    scenarioLabel,
    paperSelector,
    screenshotName,
  }) => {
    await page.emulateMedia({ media: 'print' })
    try {
      const metrics = await page.evaluate(
        ({ paperSelector }) => {
          const paper = document.querySelector(paperSelector)
          const sheet = paper?.querySelector(
            '.erp-work-instruction-paper__sheet:not(.erp-work-instruction-paper__sheet--continuation)'
          )
          const remarkTable = paper?.querySelector(
            '.erp-work-instruction-paper__remark-table'
          )
          const remark = [
            ...(sheet?.querySelectorAll(
              'tbody > tr.erp-work-instruction-paper__text-row'
            ) || []),
          ].find((row) => row.textContent.includes('备注：'))
          const lastRow = sheet?.querySelector('tbody > tr:last-child')
          const paperRect = paper?.getBoundingClientRect()
          const sheetRect = sheet?.getBoundingClientRect()
          const remarkRect = remark?.getBoundingClientRect()
          const paperStyle = paper ? window.getComputedStyle(paper) : null
          const a4PageHeightPx = (297 / 25.4) * 96
          return {
            foundPaper: Boolean(paper),
            foundSheet: Boolean(sheet),
            foundRemark: Boolean(remark),
            hasSeparateRemarkTable: Boolean(remarkTable),
            remarkIsLastRow: remark === lastRow,
            a4PageHeightPx,
            paperHeight: paperRect?.height || 0,
            sheetHeight: sheetRect?.height || 0,
            remarkHeight: remarkRect?.height || 0,
            remarkBottomDelta:
              remarkRect && paperRect
                ? remarkRect.bottom - paperRect.bottom
                : null,
            remarkInsideSheet:
              remarkRect && sheetRect
                ? remarkRect.top >= sheetRect.top - 1 &&
                  remarkRect.bottom <= sheetRect.bottom + 1
                : false,
            paperBoxSizing: paperStyle?.boxSizing || '',
          }
        },
        { paperSelector }
      )
      assert(
        metrics.foundPaper &&
          metrics.foundSheet &&
          metrics.foundRemark &&
          !metrics.hasSeparateRemarkTable &&
          metrics.remarkIsLastRow &&
          metrics.paperBoxSizing === 'border-box' &&
          metrics.remarkHeight > 0 &&
          metrics.remarkInsideSheet &&
          metrics.remarkBottomDelta <= 1 &&
          metrics.paperHeight < metrics.a4PageHeightPx &&
          metrics.sheetHeight < metrics.paperHeight,
        `${scenarioLabel} 打印态备注应作为主表最后一行留在第一页纸面内，不能渲染成独立备注表: ${JSON.stringify(metrics)}`
      )
      await writeEngineeringPaperReviewScreenshot(paperSelector, screenshotName)
    } finally {
      await page.emulateMedia({ media: 'screen' })
    }
  }

  const assertEngineeringRichTextRedToggle = async (
    editorSelector,
    blurSelector,
    scenarioLabel
  ) => {
    const selectEditorText = async () => {
      await page.evaluate((selector) => {
        const editor = document.querySelector(selector)
        if (!editor) return
        editor.focus()
        const range = document.createRange()
        range.selectNodeContents(editor)
        const selection = window.getSelection()
        selection?.removeAllRanges()
        selection?.addRange(range)
      }, editorSelector)
    }
    const readRichTextState = async () =>
      page.evaluate((selector) => {
        const editor = document.querySelector(selector)
        const redNode =
          editor?.querySelector('[style*="red"]') ||
          editor?.querySelector('[style*="255, 0, 0"]')
        return {
          html: editor?.innerHTML || '',
          color: redNode ? window.getComputedStyle(redNode).color : '',
        }
      }, editorSelector)

    await selectEditorText()
    await page.getByRole('button', { name: '文字标红/取消' }).click()
    await page.locator(blurSelector).first().click()
    let richTextState = await readRichTextState()
    assert(
      richTextState.color === 'rgb(255, 0, 0)',
      `${scenarioLabel} 选中文字标红后应保存红色: ${JSON.stringify(richTextState)}`
    )

    await selectEditorText()
    await page.getByRole('button', { name: '文字标红/取消' }).click()
    await page.locator(blurSelector).first().click()
    richTextState = await readRichTextState()
    assert(
      richTextState.color === '',
      `${scenarioLabel} 已标红文字再次点击应取消红色: ${JSON.stringify(richTextState)}`
    )
  }

  const assertRichEditableNbspArtifactGuard = async (
    rootSelector,
    scenarioLabel
  ) => {
    const prepareState = await page.evaluate((selector) => {
      const root = document.querySelector(selector)
      const editor = [
        ...(root?.querySelectorAll(
          '.erp-engineering-print-editable[contenteditable="true"]'
        ) || []),
      ].find(
        (node) =>
          String(node.textContent || '')
            .replace(/\u00a0/g, ' ')
            .trim() === ''
      )
      if (!editor) return { found: false }
      editor.setAttribute('data-nbsp-artifact-probe', 'true')
      editor.focus()
      return {
        found: true,
        text: String(editor.textContent || ''),
        html: String(editor.innerHTML || ''),
      }
    }, rootSelector)
    assert(
      prepareState.found,
      `${scenarioLabel} 应存在一个空白富文本单元格用于验证转义占位: ${JSON.stringify(prepareState)}`
    )
    await page.locator('[data-nbsp-artifact-probe]').click()
    await page
      .locator(
        `${rootSelector} .erp-engineering-print-editable[contenteditable="true"]:not([data-nbsp-artifact-probe])`
      )
      .first()
      .click()

    let artifactState = await page.evaluate((selector) => {
      const root = document.querySelector(selector)
      const editor = root?.querySelector('[data-nbsp-artifact-probe]')
      const text = String(root?.textContent || '').replace(/\u00a0/g, ' ')
      return {
        rootTextHasArtifact: /(?:amp;)?nbsp/i.test(text),
        probeText: String(editor?.textContent || '')
          .replace(/\u00a0/g, ' ')
          .trim(),
        probeHtml: String(editor?.innerHTML || ''),
      }
    }, rootSelector)
    assert(
      !artifactState.rootTextHasArtifact &&
        artifactState.probeText === '' &&
        !/(?:&amp;|amp;)+nbsp/i.test(artifactState.probeHtml),
      `${scenarioLabel} 空白富文本进入后离开不应显示或保存 nbsp 转义: ${JSON.stringify(artifactState)}`
    )

    await page.locator('[data-nbsp-artifact-probe]').click()
    await page.keyboard.press(
      process.platform === 'darwin' ? 'Meta+A' : 'Control+A'
    )
    await page.keyboard.type('&amp;nbsp;')
    await page
      .locator(
        `${rootSelector} .erp-engineering-print-editable[contenteditable="true"]:not([data-nbsp-artifact-probe])`
      )
      .first()
      .click()
    await page.waitForTimeout(50)

    artifactState = await page.evaluate((selector) => {
      const root = document.querySelector(selector)
      const text = String(root?.textContent || '').replace(/\u00a0/g, ' ')
      return {
        rootText: text.replace(/\s+/gu, ' ').trim(),
        rootTextHasArtifact: /(?:amp;)?nbsp/i.test(text),
        rootHtmlHasEscapedArtifact: /(?:&amp;|amp;)+nbsp/i.test(
          String(root?.innerHTML || '')
        ),
      }
    }, rootSelector)
    assert(
      !artifactState.rootTextHasArtifact &&
        !artifactState.rootHtmlHasEscapedArtifact,
      `${scenarioLabel} 历史坏值 &amp;nbsp; 失焦后应被清成空白: ${JSON.stringify(artifactState)}`
    )
  }
  return {
    collectToolbarGroups,
    assertButtonTexts,
    assertNoLegacyEngineeringRowButtonText,
    assertEngineeringEditorRounded,
    assertEngineeringPaperScreenPrintBox,
    assertEngineeringServerPdfSnapshotPageBox,
    assertFullCellEditableCoverage,
    writeEngineeringPaperReviewScreenshot,
    assertWorkInstructionRemarkStaysInSheet,
    assertEngineeringRichTextRedToggle,
    assertRichEditableNbspArtifactGuard,
  }
}
