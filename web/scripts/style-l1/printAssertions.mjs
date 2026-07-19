import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import path from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'

import {
  A4_PAGE_HEIGHT_PX,
  CONTINUED_PRINT_PAGE_MARGIN,
  PRINT_PAGE_STYLE_ELEMENT_ID,
} from '../../src/erp/utils/printPageMargin.mjs'

import { createMockAdminToken, installAdminRpcMocks } from './adminRpcMocks.mjs'

export function createPrintAssertions({
  baseURL,
  outputDir,
  expectText,
  isIgnorableDevServerError,
}) {
  async function resolveCurrentPrintWorkspaceDraftStorageKeys(
    page,
    legacyStorageKey
  ) {
    return page.evaluate((fallbackKey) => {
      const keys = []
      const pathParts = window.location.pathname.split('/').filter(Boolean)
      const workspaceIndex = pathParts.indexOf('print-workspace')
      const templateKey =
        workspaceIndex >= 0 ? pathParts[workspaceIndex + 1] : ''
      const stateID = new URLSearchParams(window.location.search).get('state')

      if (templateKey) {
        keys.push(
          stateID
            ? `__plush_erp_print_workspace_draft__:${templateKey}:${stateID}`
            : `__plush_erp_print_workspace_draft__:${templateKey}`
        )
      }

      if (fallbackKey && !keys.includes(fallbackKey)) {
        keys.push(fallbackKey)
      }

      return keys
    }, legacyStorageKey)
  }

  async function snapshotLocalStorageValues(page, storageKeys) {
    return page.evaluate((keys) => {
      return keys.map((key) => ({
        key,
        value: window.localStorage.getItem(key),
      }))
    }, storageKeys)
  }

  async function restoreLocalStorageValues(page, entries) {
    await page.evaluate((items) => {
      items.forEach((item) => {
        if (typeof item.value === 'string') {
          window.localStorage.setItem(item.key, item.value)
          return
        }
        window.localStorage.removeItem(item.key)
      })
    }, entries)
  }

  async function installDraftInjectionOnNextLoad(page, markerKey) {
    await page.addInitScript((storageMarkerKey) => {
      try {
        const rawPayload = window.localStorage.getItem(storageMarkerKey)
        if (!rawPayload) {
          return
        }
        const payload = JSON.parse(rawPayload)
        const draftJSON = String(payload?.draftJSON || '')
        if (!draftJSON) {
          return
        }
        const targetKeys = Array.isArray(payload?.keys) ? payload.keys : []
        targetKeys.forEach((key) => {
          if (key) {
            window.localStorage.setItem(key, draftJSON)
          }
        })
      } catch {
        // L1 injection is best-effort; the assertion after reload reports drift.
      }
    }, markerKey)
  }

  function createDraftInjectionMarkerKey(label = 'draft') {
    return `__plush_erp_style_l1_${label}_injection__:${Date.now()}:${Math.random()
      .toString(36)
      .slice(2)}`
  }

  async function assertPrintPreviewPopup(
    page,
    { buttonName, title, screenshotName }
  ) {
    const [popup] = await Promise.all([
      page.waitForEvent('popup', { timeout: 10_000 }),
      page.getByRole('button', { name: buttonName }).click(),
    ])

    const popupErrors = []
    popup.on('console', (message) => {
      if (message.type() === 'error') {
        const text = message.text()
        if (!isIgnorableDevServerError(text)) {
          popupErrors.push(`popup console error: ${text}`)
        }
      }
    })
    popup.on('pageerror', (error) => {
      popupErrors.push(`popup page error: ${error.message}`)
    })

    try {
      await popup.waitForLoadState('domcontentloaded')
      const deadline = Date.now() + 30_000
      while (Date.now() < deadline) {
        if (popup.url().startsWith('blob:')) {
          break
        }
        const iframeCount = await popup
          .locator('iframe.pdf-preview-frame')
          .count()
          .catch(() => 0)
        if (iframeCount > 0) {
          await popup
            .locator('iframe.pdf-preview-frame')
            .waitFor({ state: 'visible', timeout: 1_000 })
          break
        }
        await popup.waitForTimeout(100)
      }

      if (popup.url().startsWith('blob:')) {
        assert.deepEqual(
          popupErrors,
          [],
          `${title} 预览窗口出现控制台或运行时错误`
        )
        if (screenshotName) {
          await popup.screenshot({
            path: path.resolve(outputDir, `${screenshotName}.png`),
          })
        }
        return
      }

      await popup.waitForFunction(
        (expectedTitle) =>
          document.title === expectedTitle &&
          Boolean(document.querySelector('iframe.pdf-preview-frame')),
        title,
        { timeout: 1_000 }
      )
      const popupState = await popup.evaluate(() => {
        const iframe = document.querySelector('iframe.pdf-preview-frame')
        return {
          url: location.href,
          bodyText: document.body?.textContent?.trim() || '',
          iframeCount: document.querySelectorAll('iframe.pdf-preview-frame')
            .length,
          iframeSrc: iframe?.getAttribute('src') || '',
        }
      })
      assert.equal(
        popupState.iframeCount,
        1,
        `${title} 预览窗口应只包含一个 PDF iframe: ${JSON.stringify(popupState)}`
      )
      assert.match(
        popupState.iframeSrc,
        /^blob:/,
        `${title} 预览窗口 iframe 应指向 blob PDF: ${JSON.stringify(popupState)}`
      )
      assert.doesNotMatch(
        popupState.bodyText,
        /正在等待 PDF 预览结果|PDF 预览不存在或已过期/,
        `${title} 预览窗口不应停留在等待或过期状态: ${JSON.stringify(popupState)}`
      )
      assert.deepEqual(
        popupErrors,
        [],
        `${title} 预览窗口出现控制台或运行时错误`
      )

      if (screenshotName) {
        await popup.screenshot({
          path: path.resolve(outputDir, `${screenshotName}.png`),
        })
      }
    } finally {
      if (!popup.isClosed()) {
        await popup.close()
      }
    }
  }

  async function assertPrintCenterPreviewPopup(
    page,
    { expectedWorkspaceTitle, buttonName, title, screenshotName }
  ) {
    const [workspacePopup] = await Promise.all([
      page.waitForEvent('popup', { timeout: 10_000 }),
      page.getByRole('button', { name: '打印当前模板' }).click(),
    ])
    const mockToken = createMockAdminToken()
    await installAdminRpcMocks(workspacePopup, { baseURL })
    await workspacePopup.addInitScript((token) => {
      localStorage.setItem('admin_access_token', token)
    }, mockToken)
    const workspacePopupErrors = []

    workspacePopup.on('console', (message) => {
      if (message.type() === 'error') {
        const text = message.text()
        if (!isIgnorableDevServerError(text)) {
          workspacePopupErrors.push(`workspace popup console error: ${text}`)
        }
      }
    })
    workspacePopup.on('pageerror', (error) => {
      workspacePopupErrors.push(`workspace popup page error: ${error.message}`)
    })

    try {
      await workspacePopup.waitForLoadState('domcontentloaded')
      await setPopupAdminToken(workspacePopup, mockToken)
      await expectPrintWorkspaceToolbarTitle(
        workspacePopup,
        expectedWorkspaceTitle
      )
      await workspacePopup
        .getByRole('button', { name: buttonName })
        .waitFor({ state: 'visible', timeout: 15_000 })

      await assertPrintPreviewPopup(workspacePopup, {
        buttonName,
        title,
        screenshotName,
      })
      assert.deepEqual(
        workspacePopupErrors,
        [],
        `${expectedWorkspaceTitle} 打印中心弹窗出现控制台或运行时错误`
      )
    } finally {
      if (!workspacePopup.isClosed()) {
        await workspacePopup.close()
      }
    }
  }

  async function assertEditablePrintWorkspacePopupRefresh(
    page,
    {
      expectedTitle,
      editableSelector = '',
      editableScenarioLabel = '',
      signatureValueSelector = '',
      signatureTextsToClear = [],
      signatureTextsToRetain = [],
    }
  ) {
    const [popup] = await Promise.all([
      page.waitForEvent('popup', { timeout: 10_000 }),
      page.getByRole('button', { name: '打印当前模板' }).click(),
    ])
    const mockToken = createMockAdminToken()
    await installAdminRpcMocks(popup, { baseURL })
    await popup.addInitScript((token) => {
      localStorage.setItem('admin_access_token', token)
    }, mockToken)
    const popupErrors = []

    popup.on('console', (message) => {
      if (message.type() === 'error') {
        const text = message.text()
        if (!isIgnorableDevServerError(text)) {
          popupErrors.push(`popup console error: ${text}`)
        }
      }
    })
    popup.on('pageerror', (error) => {
      popupErrors.push(`popup page error: ${error.message}`)
    })

    try {
      await popup.waitForLoadState('domcontentloaded')
      await setPopupAdminToken(popup, mockToken)
      await expectPrintWorkspaceToolbarTitle(popup, expectedTitle)

      const openedURL = new URL(popup.url())
      assert(
        isValidPrintWorkspacePopupPath(openedURL.pathname),
        `打印窗口首次打开落在了非法路径: ${popup.url()}`
      )
      assert(
        openedURL.searchParams.get('state'),
        `打印窗口首次打开缺少 state: ${popup.url()}`
      )

      if (editableSelector) {
        await assertEditablePrintWorkspaceRefreshCycle(popup, {
          expectedTitle,
          editableSelector,
          insertedText: 'ZZPERSISTONE',
          scenarioLabel: `${editableScenarioLabel || expectedTitle} 第 1 轮`,
        })
        await assertEditablePrintWorkspaceRefreshCycle(popup, {
          expectedTitle,
          editableSelector,
          insertedText: 'ZZPERSISTTWO',
          scenarioLabel: `${editableScenarioLabel || expectedTitle} 第 2 轮`,
        })
      } else {
        await popup.reload({ waitUntil: 'domcontentloaded' })
        await expectPrintWorkspaceToolbarTitle(popup, expectedTitle)
        await popup
          .waitForLoadState('networkidle', { timeout: 5_000 })
          .catch(() => {})
        await popup.waitForTimeout(150)
      }

      const reloadedURL = new URL(popup.url())
      assert(
        isValidPrintWorkspacePopupPath(reloadedURL.pathname),
        `打印窗口刷新后落在了非法路径: ${popup.url()}`
      )
      assert(
        reloadedURL.searchParams.get('state'),
        `打印窗口刷新后缺少 state: ${popup.url()}`
      )
      if (signatureValueSelector) {
        await assertPrintWorkspaceSignatureBlankAction(popup, {
          expectedTitle,
          signatureValueSelector,
          signatureTextsToClear,
          signatureTextsToRetain,
        })
      }
      assert.deepEqual(
        popupErrors,
        [],
        `${expectedTitle} 打印窗口刷新后出现控制台或运行时错误`
      )
    } finally {
      if (!popup.isClosed()) {
        await popup.close()
      }
    }
  }

  async function assertEditablePrintWorkspaceRefreshCycle(
    page,
    { expectedTitle, editableSelector, insertedText, scenarioLabel }
  ) {
    await appendTextToEditablePopupCell(page, {
      editableSelector,
      insertedText,
      scenarioLabel,
      commit: false,
    })
    await assertEditablePopupCellContainsText(page, {
      editableSelector,
      expectedText: insertedText,
      scenarioLabel: `${scenarioLabel} 刷新前`,
      requirePersistedDraft: false,
    })

    await page.reload({ waitUntil: 'domcontentloaded' })
    await expectPrintWorkspaceToolbarTitle(page, expectedTitle)
    await page
      .waitForLoadState('networkidle', { timeout: 5_000 })
      .catch(() => {})
    await page.waitForTimeout(150)

    await assertEditablePopupCellContainsText(page, {
      editableSelector,
      expectedText: insertedText,
      scenarioLabel,
    })
    const reloadInsertedText = await assertEditablePopupCellInputAfterReload(
      page,
      {
        editableSelector,
        scenarioLabel,
      }
    )
    await assertPrintWorkspaceRestoreSampleAction(page, {
      editableSelector,
      staleTexts: [insertedText, reloadInsertedText],
      scenarioLabel,
    })
  }

  async function assertPrintWorkspaceSignatureBlankAction(
    page,
    {
      expectedTitle,
      signatureValueSelector,
      signatureTextsToClear = [],
      signatureTextsToRetain = [],
    }
  ) {
    await page.getByRole('button', { name: '手签留白' }).waitFor({
      state: 'visible',
      timeout: 10_000,
    })

    const beforeClear = await page.evaluate(
      ({ selector }) =>
        Array.from(document.querySelectorAll(selector)).map((node) =>
          (node.textContent || '').replace(/\u00a0/g, ' ').trim()
        ),
      { selector: signatureValueSelector }
    )

    assert(
      beforeClear.length >= 4,
      `${expectedTitle} 手签留白前应能定位甲乙方签字和日期字段: ${JSON.stringify(beforeClear)}`
    )
    ;[...signatureTextsToClear, ...signatureTextsToRetain].forEach((text) => {
      assert(
        beforeClear.includes(text),
        `${expectedTitle} 手签留白前应保留样例签字值 ${text}: ${JSON.stringify(beforeClear)}`
      )
    })

    const toolbarMetricsBefore = await page.evaluate(() => {
      const toolbar = document.querySelector('.erp-print-shell__toolbar')
      const actionGroups = Array.from(
        document.querySelectorAll('.erp-print-shell__toolbar-group')
      )
      return {
        toolbarScrollWidth: toolbar?.scrollWidth || 0,
        toolbarClientWidth: toolbar?.clientWidth || 0,
        actionGroupOverflow: actionGroups.map((group) => ({
          text: group.textContent?.replace(/\s+/g, ' ').trim() || '',
          scrollWidth: group.scrollWidth,
          clientWidth: group.clientWidth,
        })),
      }
    })
    assert(
      toolbarMetricsBefore.toolbarScrollWidth <=
        toolbarMetricsBefore.toolbarClientWidth + 1,
      `${expectedTitle} 增加手签留白后工具栏不应横向溢出: ${JSON.stringify(toolbarMetricsBefore)}`
    )

    await page.getByRole('button', { name: '手签留白' }).click()
    await expectText(page, '已清空签字人，纸面保留日期和甲乙方手签位置。')

    const afterClear = await page.evaluate(
      ({ selector }) =>
        Array.from(document.querySelectorAll(selector)).map((node) =>
          (node.textContent || '').replace(/\u00a0/g, ' ').trim()
        ),
      { selector: signatureValueSelector }
    )
    assert(
      afterClear.length === beforeClear.length,
      `${expectedTitle} 手签留白不应改变签字区字段数量: before=${JSON.stringify(beforeClear)} after=${JSON.stringify(afterClear)}`
    )
    signatureTextsToClear.forEach((text) => {
      assert(
        !afterClear.includes(text),
        `${expectedTitle} 手签留白应清空签字人 ${text}: before=${JSON.stringify(beforeClear)} after=${JSON.stringify(afterClear)}`
      )
    })
    signatureTextsToRetain.forEach((text) => {
      assert(
        afterClear.includes(text),
        `${expectedTitle} 手签留白应保留日期 ${text}: before=${JSON.stringify(beforeClear)} after=${JSON.stringify(afterClear)}`
      )
    })
    assert(
      afterClear.filter((text) => text === '').length >=
        signatureTextsToClear.length,
      `${expectedTitle} 手签留白后应出现签字人留白: before=${JSON.stringify(beforeClear)} after=${JSON.stringify(afterClear)}`
    )
  }

  async function expectPrintWorkspaceToolbarTitle(page, title) {
    await page
      .locator('.erp-print-shell__toolbar-copy')
      .getByText(title, { exact: false })
      .first()
      .waitFor({
        state: 'visible',
        timeout: 15_000,
      })
  }

  async function setPopupAdminToken(popup, mockToken) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await popup.evaluate((token) => {
          localStorage.setItem('admin_access_token', token)
        }, mockToken)
        return
      } catch (error) {
        if (
          attempt >= 2 ||
          !String(error?.message || '').includes(
            'Execution context was destroyed'
          )
        ) {
          throw error
        }
        await popup.waitForLoadState('domcontentloaded').catch(() => {})
        await popup.waitForTimeout(250)
      }
    }
  }

  function isValidPrintWorkspacePopupPath(pathname = '') {
    return (
      pathname === '/print-window-shell.html' ||
      pathname.startsWith('/erp/print-workspace/')
    )
  }

  function normalizeInlineText(value) {
    return String(value || '')
      .replace(/\u00a0/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
  }

  async function appendTextToEditablePopupCell(
    page,
    { editableSelector, insertedText, scenarioLabel, commit = true }
  ) {
    const editableCell = page.locator(editableSelector).first()
    await editableCell.waitFor({ state: 'visible', timeout: 15_000 })
    await page.waitForFunction(
      (selector) =>
        document.querySelector(selector)?.dataset?.printWorkspaceDraftReady ===
        'true',
      editableSelector,
      { timeout: 5_000 }
    )

    await editableCell.click()
    await page.waitForFunction(
      (selector) => document.activeElement === document.querySelector(selector),
      editableSelector,
      {
        timeout: 5_000,
      }
    )
    await editableCell.press('End')
    await editableCell.pressSequentially(insertedText)
    await page.evaluate(
      () =>
        new Promise((resolve) => {
          queueMicrotask(resolve)
        })
    )
    if (commit) {
      await editableCell.press('Tab')
    }

    const nextText = normalizeInlineText(await editableCell.textContent())
    assert(
      nextText.includes(insertedText),
      `${scenarioLabel} 右侧表格未写入刷新前标记: ${JSON.stringify({
        editableSelector,
        insertedText,
        nextText,
      })}`
    )
  }

  async function assertEditablePopupCellContainsText(
    page,
    {
      editableSelector,
      expectedText,
      scenarioLabel,
      requirePersistedDraft = true,
    }
  ) {
    const editableCell = page.locator(editableSelector).first()
    await editableCell.waitFor({ state: 'visible', timeout: 15_000 })

    const nextText = normalizeInlineText(await editableCell.textContent())
    const pageState = await page.evaluate((text) => {
      const bodyText = document.body?.textContent || ''
      const persistedMatches = Array.from(
        { length: localStorage.length },
        (_, index) => {
          const key = localStorage.key(index) || ''
          const value = localStorage.getItem(key) || ''
          let draftPreview = null
          if (key.includes('print_workspace_draft')) {
            try {
              const parsed = JSON.parse(value)
              draftPreview = {
                contractNo: parsed?.lines?.[0]?.contractNo,
                processingOrderNo: parsed?.rows?.[0]?.orderNo,
                productNo: parsed?.productNo,
                firstMaterialName: parsed?.materials?.[0]?.name,
              }
            } catch {
              draftPreview = null
            }
          }
          return {
            key,
            hasExpectedText: value.includes(text),
            valueLength: value.length,
            draftPreview,
          }
        }
      ).filter(
        ({ key }) => key.includes('draft') || key.includes('print_window_state')
      )
      return {
        url: location.href,
        bodyHasExpectedText: bodyText.includes(text),
        persistedMatches,
      }
    }, expectedText)
    assert.equal(
      pageState.bodyHasExpectedText,
      true,
      `${scenarioLabel} 刷新后页面正文未包含刷新前编辑内容: ${JSON.stringify({
        editableSelector,
        expectedText,
        nextText,
        pageState,
      })}`
    )
    if (requirePersistedDraft) {
      assert(
        pageState.persistedMatches.some(
          ({ hasExpectedText }) => hasExpectedText
        ),
        `${scenarioLabel} 刷新后结构化草稿未保存刷新前编辑内容: ${JSON.stringify(
          {
            editableSelector,
            expectedText,
            nextText,
            pageState,
          }
        )}`
      )
    }
    assert(
      nextText.includes(expectedText),
      `${scenarioLabel} 刷新后丢失刷新前编辑内容: ${JSON.stringify({
        editableSelector,
        expectedText,
        nextText,
        pageState,
      })}`
    )
  }

  async function assertEditablePopupCellInputAfterReload(
    page,
    { editableSelector, scenarioLabel }
  ) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const insertedText = 'ZZRELOAD'
        await appendTextToEditablePopupCell(page, {
          editableSelector,
          insertedText,
          scenarioLabel,
        })
        return insertedText
      } catch (error) {
        if (
          attempt >= 2 ||
          !String(error?.message || '').includes(
            'Execution context was destroyed'
          )
        ) {
          throw error
        }
        await page.waitForLoadState('domcontentloaded').catch(() => {})
        await page.waitForTimeout(250)
      }
    }
    return ''
  }

  async function assertPrintWorkspaceRestoreSampleAction(
    page,
    { editableSelector, staleTexts, scenarioLabel }
  ) {
    const filteredStaleTexts = staleTexts.filter(Boolean)
    await page.getByRole('button', { name: '恢复样例' }).click()
    await page.waitForFunction(
      ({ selector, texts }) => {
        const cell = document.querySelector(selector)
        const cellText = String(cell?.textContent || '')
        const bodyText = String(document.body?.textContent || '')
        return texts.every(
          (text) => !cellText.includes(text) && !bodyText.includes(text)
        )
      },
      { selector: editableSelector, texts: filteredStaleTexts },
      { timeout: 5_000 }
    )

    const afterRestore = await page.evaluate(
      ({ selector, texts }) => {
        const cell = document.querySelector(selector)
        const cellText = String(cell?.textContent || '')
        const bodyText = String(document.body?.textContent || '')
        return {
          cellText,
          bodyHasStaleText: texts.some((text) => bodyText.includes(text)),
        }
      },
      { selector: editableSelector, texts: filteredStaleTexts }
    )
    assert.equal(
      afterRestore.bodyHasStaleText,
      false,
      `${scenarioLabel} 点击恢复样例后仍残留编辑标记: ${JSON.stringify({
        editableSelector,
        staleTexts: filteredStaleTexts,
        afterRestore,
      })}`
    )
  }

  async function assertPrintWorkspacePaginationStyle(
    page,
    { paperSelector, rowSelector, theadSelector }
  ) {
    await page.emulateMedia({ media: 'print' })

    try {
      const metrics = await page.evaluate(
        ({
          resolvedPaperSelector,
          resolvedRowSelector,
          resolvedTheadSelector,
        }) => {
          const paper = document.querySelector(resolvedPaperSelector)
          const row = document.querySelector(resolvedRowSelector)
          const thead = document.querySelector(resolvedTheadSelector)
          const paperStyle = paper ? window.getComputedStyle(paper) : null
          const rowStyle = row ? window.getComputedStyle(row) : null
          const theadStyle = thead ? window.getComputedStyle(thead) : null

          return {
            paperWidth: paper?.getBoundingClientRect().width || 0,
            paperPaddingTop: Number.parseFloat(paperStyle?.paddingTop || '0'),
            rowBreakInside: String(rowStyle?.breakInside || ''),
            rowPageBreakInside: String(rowStyle?.pageBreakInside || ''),
            theadDisplay: String(theadStyle?.display || ''),
          }
        },
        {
          resolvedPaperSelector: paperSelector,
          resolvedRowSelector: rowSelector,
          resolvedTheadSelector: theadSelector,
        }
      )

      assert(
        metrics.paperWidth >= 780 && metrics.paperWidth <= 810,
        `打印纸面宽度未收口到 A4: ${JSON.stringify(metrics)}`
      )
      assert(
        metrics.paperPaddingTop >= 30,
        `打印纸面未保留合同页边距: ${JSON.stringify(metrics)}`
      )
      assert(
        metrics.rowBreakInside !== 'auto' ||
          metrics.rowPageBreakInside !== 'auto',
        `打印态明细行仍允许页内截断: ${JSON.stringify(metrics)}`
      )
      assert.equal(
        metrics.theadDisplay,
        'table-header-group',
        `打印态表头未开启续页重绘: ${JSON.stringify(metrics)}`
      )
    } finally {
      await page.emulateMedia({ media: 'screen' })
    }
  }

  async function assertProcessingContractPaperRowCount(page) {
    const counts = await page.evaluate(() => {
      const detailEditorRows = document.querySelectorAll(
        '.erp-print-shell__detail-table tbody tr'
      ).length
      const paperRows = document.querySelectorAll(
        '.erp-processing-contract-table tbody tr'
      ).length
      const totalRows = document.querySelectorAll(
        '.erp-processing-contract-table__total'
      ).length

      return {
        detailEditorRows,
        paperRows,
        totalRows,
      }
    })

    assert.equal(
      counts.totalRows,
      1,
      `加工合同纸面合计行数量异常: ${JSON.stringify(counts)}`
    )
    assert.equal(
      counts.paperRows,
      counts.detailEditorRows + counts.totalRows,
      `加工合同纸面仍存在多余占位空白行: ${JSON.stringify(counts)}`
    )
  }

  async function assertProcessingContractSignatureLayout(page) {
    const metrics = await page.evaluate(() => {
      return Array.from(
        document.querySelectorAll('.erp-processing-contract-signature__block')
      ).map((block) => {
        const label = block.querySelector(
          '.erp-processing-contract-signature__label'
        )
        const date = block.querySelector(
          '.erp-processing-contract-signature__date'
        )
        const blockRect = block.getBoundingClientRect()
        const labelRect = label?.getBoundingClientRect()
        const dateRect = date?.getBoundingClientRect()

        return {
          blockTop: blockRect.top,
          labelTop: labelRect?.top || 0,
          labelBottom: labelRect?.bottom || 0,
          dateTop: dateRect?.top || 0,
          labelOffset: labelRect ? labelRect.top - blockRect.top : 0,
          labelToDate:
            labelRect && dateRect ? dateRect.top - labelRect.bottom : 0,
          valueCount: block.querySelectorAll(
            '.erp-processing-contract-signature__value'
          ).length,
        }
      })
    })

    assert.equal(
      metrics.length,
      2,
      `加工合同签章区列数异常: ${JSON.stringify(metrics)}`
    )

    metrics.forEach((metric) => {
      assert.equal(
        metric.valueCount,
        0,
        `加工合同签章区不应再渲染上方编辑框: ${JSON.stringify(metric)}`
      )
      assert(
        metric.labelOffset >= 24,
        `加工合同签章标签仍贴在顶部，未下移到日期附近: ${JSON.stringify(metric)}`
      )
      assert(
        metric.labelToDate > 0 && metric.labelToDate <= 12,
        `加工合同签章标签与日期间距异常: ${JSON.stringify(metric)}`
      )
    })
  }

  async function assertContractTableHeadersStaySingleLine(
    page,
    { tableSelector, expectedHeaders = [] }
  ) {
    const metrics = await page.evaluate((resolvedTableSelector) => {
      return Array.from(
        document.querySelectorAll(`${resolvedTableSelector} thead th`)
      ).map((th) => {
        const style = window.getComputedStyle(th)
        return {
          text: String(th.textContent || '').trim(),
          whiteSpace: style.whiteSpace,
          overflowWrap: style.overflowWrap,
          scrollWidth: th.scrollWidth,
          clientWidth: th.clientWidth,
        }
      })
    }, tableSelector)

    assert(metrics.length > 0, `未找到合同表头: ${tableSelector}`)

    if (expectedHeaders.length > 0) {
      assert.deepEqual(
        metrics.map((metric) => metric.text),
        expectedHeaders,
        `${tableSelector} 表头文案异常: ${JSON.stringify(metrics)}`
      )
    }

    metrics.forEach((metric) => {
      assert.equal(
        metric.whiteSpace,
        'nowrap',
        `${tableSelector} 表头未强制单行: ${JSON.stringify(metric)}`
      )
      assert.equal(
        metric.overflowWrap,
        'normal',
        `${tableSelector} 表头仍允许断词: ${JSON.stringify(metric)}`
      )
      assert(
        metric.scrollWidth <= metric.clientWidth + 1,
        `${tableSelector} 表头内容仍超出单元格宽度: ${JSON.stringify(metric)}`
      )
    })
  }

  async function assertWorkspaceContinuedPageMargin(
    page,
    { storageKey, paperSelector, minimumLineCount = 32, clearMerges = false }
  ) {
    const storageKeys = await resolveCurrentPrintWorkspaceDraftStorageKeys(
      page,
      storageKey
    )
    const originalEntries = await snapshotLocalStorageValues(page, storageKeys)
    const injectionMarkerKey = createDraftInjectionMarkerKey('continued_page')
    await installDraftInjectionOnNextLoad(page, injectionMarkerKey)

    try {
      await page.evaluate(
        ({
          resolvedStorageKeys,
          resolvedMinimumLineCount,
          shouldClearMerges,
          resolvedInjectionMarkerKey,
        }) => {
          const rawDraft = resolvedStorageKeys
            .map((key) => window.localStorage.getItem(key))
            .find((value) => typeof value === 'string')
          const draft = rawDraft ? JSON.parse(rawDraft) : {}
          const baseLines =
            Array.isArray(draft.lines) && draft.lines.length > 0
              ? draft.lines
              : [{}]

          draft.lines = Array.from(
            { length: Math.max(resolvedMinimumLineCount, baseLines.length) },
            (_, index) => {
              const sourceLine = baseLines[index % baseLines.length] || {}
              return {
                ...sourceLine,
                contractNo: sourceLine.contractNo
                  ? `${sourceLine.contractNo}-${index + 1}`
                  : sourceLine.contractNo,
                productOrderNo: sourceLine.productOrderNo
                  ? `${sourceLine.productOrderNo}-${index + 1}`
                  : sourceLine.productOrderNo,
                remark: `${String(
                  sourceLine.remark ||
                    sourceLine.processingItem ||
                    sourceLine.materialName ||
                    '续页页边距回归'
                )} ${index + 1}`,
              }
            }
          )

          if (shouldClearMerges) {
            draft.merges = []
          }

          resolvedStorageKeys.forEach((key) => {
            window.localStorage.setItem(key, JSON.stringify(draft))
          })
          window.localStorage.setItem(
            resolvedInjectionMarkerKey,
            JSON.stringify({
              keys: resolvedStorageKeys,
              draftJSON: JSON.stringify(draft),
            })
          )
        },
        {
          resolvedStorageKeys: storageKeys,
          resolvedMinimumLineCount: minimumLineCount,
          shouldClearMerges: clearMerges,
          resolvedInjectionMarkerKey: injectionMarkerKey,
        }
      )

      await page.reload({ waitUntil: 'domcontentloaded' })
      await page.locator(paperSelector).waitFor({
        state: 'visible',
        timeout: 10_000,
      })
      await page.waitForFunction(
        ({ resolvedPaperSelector, minPaperHeight }) => {
          const paper = document.querySelector(resolvedPaperSelector)
          const paperHeight = Math.max(
            paper?.scrollHeight || 0,
            paper?.offsetHeight || 0,
            paper?.getBoundingClientRect?.().height || 0
          )

          return paperHeight > minPaperHeight
        },
        {
          resolvedPaperSelector: paperSelector,
          minPaperHeight: A4_PAGE_HEIGHT_PX + 2,
        },
        { timeout: 10_000 }
      )

      const metrics = await page.evaluate(
        ({ resolvedPaperSelector, resolvedStyleID }) => {
          const paper = document.querySelector(resolvedPaperSelector)
          const styleNode = document.getElementById(resolvedStyleID)

          return {
            paperHeight: Math.max(
              paper?.scrollHeight || 0,
              paper?.offsetHeight || 0,
              paper?.getBoundingClientRect?.().height || 0
            ),
            styleText: styleNode?.textContent || '',
          }
        },
        {
          resolvedPaperSelector: paperSelector,
          resolvedStyleID: PRINT_PAGE_STYLE_ELEMENT_ID,
        }
      )

      assert(
        metrics.paperHeight > A4_PAGE_HEIGHT_PX + 2,
        `工作台未进入续页高度，无法验证第 2 页顶部留白: ${JSON.stringify(metrics)}`
      )
      assert.match(
        metrics.styleText,
        new RegExp(
          `margin: ${CONTINUED_PRINT_PAGE_MARGIN.replaceAll('/', '\\/')};`
        ),
        `工作台跨页后未切到统一续页页边距: ${JSON.stringify(metrics)}`
      )
    } finally {
      await page.evaluate(
        (resolvedInjectionMarkerKey) =>
          window.localStorage.removeItem(resolvedInjectionMarkerKey),
        injectionMarkerKey
      )
      await restoreLocalStorageValues(page, originalEntries)
    }
  }

  async function assertMaterialContractMetaAlignment(page) {
    const draftStorageKey =
      '__plush_erp_material_purchase_contract_print_draft__'
    await page.evaluate((storageKey) => {
      const rawDraft = window.localStorage.getItem(storageKey)
      const draft = rawDraft ? JSON.parse(rawDraft) : {}
      draft.supplierName =
        '东莞市永绅玩具有限公司辅料供应中心东城联络处长期备料专线'
      draft.buyerCompany = '东莞茶山发水电费三大发永绅采购与仓配协同办公室'
      window.localStorage.setItem(storageKey, JSON.stringify(draft))
    }, draftStorageKey)
    await page.reload({ waitUntil: 'domcontentloaded' })
    await delay(300)

    const metrics = await page.evaluate(() => {
      const pairs = Array.from(
        document.querySelectorAll(
          '.erp-material-contract-paper .erp-material-contract-meta__pair'
        )
      ).map((pair) => {
        const pairRect = pair.getBoundingClientRect()
        const cells = Array.from(
          pair.querySelectorAll(':scope > .erp-material-contract-meta__cell')
        ).map((cell) => {
          const rect = cell.getBoundingClientRect()
          return {
            top: rect.top,
            left: rect.left,
            height: rect.height,
            width: rect.width,
          }
        })

        return {
          top: pairRect.top,
          bottom: pairRect.bottom,
          cellCount: cells.length,
          cells,
        }
      })

      return {
        pairCount: pairs.length,
        pairs,
      }
    })

    assert.equal(
      metrics.pairCount,
      5,
      `采购合同头部信息行数异常: ${JSON.stringify(metrics)}`
    )

    metrics.pairs.forEach((pair, index) => {
      assert.equal(
        pair.cellCount,
        2,
        `采购合同第 ${index + 1} 行未保持左右配对: ${JSON.stringify(pair)}`
      )

      const [leftCell, rightCell] = pair.cells
      assert(
        Math.abs(leftCell.top - rightCell.top) < 1,
        `采购合同第 ${index + 1} 行左右未对齐: ${JSON.stringify(pair)}`
      )

      if (index > 0) {
        const previousPair = metrics.pairs[index - 1]
        assert(
          pair.top >= previousPair.bottom - 1,
          `采购合同第 ${index + 1} 行与上一行发生重叠: ${JSON.stringify({
            previousPair,
            pair,
          })}`
        )
      }
    })
  }

  async function assertContractTableEditableAlignment(
    page,
    { tableSelector, editableSelector, scenarioLabel }
  ) {
    const metrics = await page.evaluate(
      ({ resolvedTableSelector, resolvedEditableSelector }) => {
        const table = document.querySelector(resolvedTableSelector)
        const editableNodes = Array.from(
          document.querySelectorAll(resolvedEditableSelector)
        )

        const normalizeText = (node) =>
          String(node?.innerText || '')
            .replace(/\u00a0/g, '')
            .trim()

        const extractStyle = (node) => {
          const style = window.getComputedStyle(node)
          return {
            display: style.display,
            alignItems: style.alignItems,
            justifyContent: style.justifyContent,
            textAlign: style.textAlign,
          }
        }

        const filledNode = editableNodes.find(
          (node) => normalizeText(node) !== ''
        )
        let emptyNode = editableNodes.find((node) => normalizeText(node) === '')
        let restoredText = null

        if (!emptyNode && filledNode) {
          emptyNode =
            editableNodes.find((node) => node !== filledNode) || filledNode
          restoredText = emptyNode.textContent
          emptyNode.textContent = '\u200b'
        }

        const focusEmptyCaret = (node) => {
          if (!node) {
            return null
          }

          node.focus()
          const selection = window.getSelection()
          selection.removeAllRanges()

          const range = document.createRange()
          const textNode = node.firstChild
          const offset = textNode?.textContent?.length ?? 0
          range.setStart(textNode || node, offset)
          range.collapse(true)
          selection.addRange(range)

          const caretRect = range.getBoundingClientRect()
          const cellRect = node.closest('td')?.getBoundingClientRect()
          if (!cellRect) {
            return null
          }

          return {
            offsetX:
              caretRect.left +
              caretRect.width / 2 -
              (cellRect.left + cellRect.width / 2),
            offsetY:
              caretRect.top +
              caretRect.height / 2 -
              (cellRect.top + cellRect.height / 2),
          }
        }

        const result = {
          hasTable: Boolean(table),
          editableCount: editableNodes.length,
          filledStyle: filledNode ? extractStyle(filledNode) : null,
          emptyStyle: emptyNode ? extractStyle(emptyNode) : null,
          emptyCaretOffset: focusEmptyCaret(emptyNode),
        }

        if (restoredText !== null && emptyNode) {
          emptyNode.textContent = restoredText
        }

        return result
      },
      {
        resolvedTableSelector: tableSelector,
        resolvedEditableSelector: editableSelector,
      }
    )

    assert(metrics.hasTable, `${scenarioLabel} 未找到表格: ${tableSelector}`)
    assert(metrics.editableCount > 0, `${scenarioLabel} 未找到可编辑单元格`)
    assert(metrics.filledStyle, `${scenarioLabel} 缺少非空可编辑单元格`)
    assert(metrics.emptyStyle, `${scenarioLabel} 缺少空白可编辑单元格`)
    assert(metrics.emptyCaretOffset, `${scenarioLabel} 缺少空白光标位置`)

    for (const [label, style] of [
      ['非空单元格', metrics.filledStyle],
      ['空白单元格', metrics.emptyStyle],
    ]) {
      assert.equal(
        style.display,
        'flex',
        `${scenarioLabel}${label} display 未保持 flex: ${JSON.stringify(style)}`
      )
      assert.equal(
        style.alignItems,
        'center',
        `${scenarioLabel}${label} align-items 未保持居中: ${JSON.stringify(style)}`
      )
      assert.equal(
        style.justifyContent,
        'center',
        `${scenarioLabel}${label} justify-content 未保持居中: ${JSON.stringify(style)}`
      )
      assert.equal(
        style.textAlign,
        'center',
        `${scenarioLabel}${label} text-align 未保持居中: ${JSON.stringify(style)}`
      )
    }

    assert(
      Math.abs(metrics.emptyCaretOffset.offsetX) <= 3,
      `${scenarioLabel}空白单元格光标未保持水平居中: ${JSON.stringify(metrics.emptyCaretOffset)}`
    )
    assert(
      Math.abs(metrics.emptyCaretOffset.offsetY) <= 2,
      `${scenarioLabel}空白单元格光标未保持垂直居中: ${JSON.stringify(metrics.emptyCaretOffset)}`
    )
  }

  async function assertMaterialContractLineCellsWrapLongValues(
    page,
    { storageKey, scenarioLabel }
  ) {
    const originalRaw = await page.evaluate(
      (resolvedStorageKey) => window.localStorage.getItem(resolvedStorageKey),
      storageKey
    )

    try {
      await page.evaluate((resolvedStorageKey) => {
        const rawDraft = window.localStorage.getItem(resolvedStorageKey)
        const draft = rawDraft ? JSON.parse(rawDraft) : {}
        const sourceLine =
          Array.isArray(draft.lines) && draft.lines.length > 0
            ? draft.lines[0]
            : {}

        draft.lines = [
          {
            ...sourceLine,
            contractNo:
              'SIM-YOYOOSUN-BULK-PO-03-LONG-CONTINUOUS-ORDER-20260703',
            productOrderNo:
              'SIM-PRODUCT-ORDER-LONG-CONTINUOUS-20260703-PRIMARY',
            unit: 'M',
            quantity: '330000000000',
            amount: '165000000000.88',
            remark: 'SIM bulk purchase order item.',
          },
        ]
        draft.merges = []
        window.localStorage.setItem(resolvedStorageKey, JSON.stringify(draft))
      }, storageKey)

      await page.reload({ waitUntil: 'domcontentloaded' })
      await expectText(page, '打印内容')
      await expectText(page, 'SIM-YOYOOSUN-BULK-PO-03')

      const metrics = await page.evaluate(() => {
        const table = document.querySelector('.erp-material-contract-table')
        const paper = document.querySelector('.erp-material-contract-paper')
        const row = table?.querySelector(
          'tbody tr:not(.erp-material-contract-table__total)'
        )
        const tableRect = table?.getBoundingClientRect()
        const paperRect = paper?.getBoundingClientRect()
        const targetColumns = [
          { index: 0, key: 'contractNo' },
          { index: 1, key: 'productOrderNo' },
          { index: 7, key: 'unit' },
          { index: 9, key: 'quantity' },
          { index: 10, key: 'amount' },
          { index: 11, key: 'remark' },
        ]

        const cells = targetColumns.map(({ index, key }) => {
          const cell = row?.children?.[index] || null
          const editable = cell?.querySelector(
            '.erp-material-contract-table__editable'
          )
          const node = editable || cell
          const cellRect = cell?.getBoundingClientRect()
          const nodeRect = node?.getBoundingClientRect()
          const cellStyle = cell ? window.getComputedStyle(cell) : null
          const nodeStyle = node ? window.getComputedStyle(node) : null

          return {
            key,
            text: String(node?.textContent || '')
              .replace(/\u00a0/g, ' ')
              .trim(),
            cellClientWidth: cell?.clientWidth || 0,
            cellScrollWidth: cell?.scrollWidth || 0,
            nodeClientWidth: node?.clientWidth || 0,
            nodeScrollWidth: node?.scrollWidth || 0,
            cellLeft: cellRect?.left || 0,
            cellRight: cellRect?.right || 0,
            nodeLeft: nodeRect?.left || 0,
            nodeRight: nodeRect?.right || 0,
            cellWhiteSpace: cellStyle?.whiteSpace || '',
            cellOverflowWrap: cellStyle?.overflowWrap || '',
            nodeWhiteSpace: nodeStyle?.whiteSpace || '',
            nodeOverflowWrap: nodeStyle?.overflowWrap || '',
            nodeWordBreak: nodeStyle?.wordBreak || '',
          }
        })

        return {
          hasTable: Boolean(table),
          hasRow: Boolean(row),
          tableLeft: tableRect?.left || 0,
          tableRight: tableRect?.right || 0,
          paperLeft: paperRect?.left || 0,
          paperRight: paperRect?.right || 0,
          cells,
        }
      })

      assert(metrics.hasTable, `${scenarioLabel} 未找到采购合同表格`)
      assert(metrics.hasRow, `${scenarioLabel} 未找到采购合同明细行`)

      metrics.cells.forEach((metric) => {
        assert(
          metric.text.length > 0,
          `${scenarioLabel} ${metric.key} 未写入边界样本: ${JSON.stringify(metric)}`
        )
        assert.equal(
          metric.cellWhiteSpace,
          'normal',
          `${scenarioLabel} ${metric.key} 单元格不应强制单行: ${JSON.stringify(metric)}`
        )
        assert.equal(
          metric.nodeWhiteSpace,
          'normal',
          `${scenarioLabel} ${metric.key} 内容块不应强制单行: ${JSON.stringify(metric)}`
        )
        assert.equal(
          metric.nodeOverflowWrap,
          'anywhere',
          `${scenarioLabel} ${metric.key} 内容块未允许任意断行: ${JSON.stringify(metric)}`
        )
        assert(
          metric.cellScrollWidth <= metric.cellClientWidth + 1,
          `${scenarioLabel} ${metric.key} 单元格仍横向溢出: ${JSON.stringify(metric)}`
        )
        assert(
          metric.nodeScrollWidth <= metric.nodeClientWidth + 1,
          `${scenarioLabel} ${metric.key} 内容块仍横向溢出: ${JSON.stringify(metric)}`
        )
        assert(
          metric.cellLeft >= metrics.tableLeft - 1 &&
            metric.cellRight <= metrics.tableRight + 1,
          `${scenarioLabel} ${metric.key} 单元格越过表格边界: ${JSON.stringify({
            metric,
            tableLeft: metrics.tableLeft,
            tableRight: metrics.tableRight,
          })}`
        )
        assert(
          metric.nodeLeft >= metric.cellLeft - 1 &&
            metric.nodeRight <= metric.cellRight + 1,
          `${scenarioLabel} ${metric.key} 内容块越过单元格边界: ${JSON.stringify(metric)}`
        )
        if (metric.key === 'unit') {
          assert.equal(
            metric.text,
            '米',
            `${scenarioLabel} unit 列应统一显示中文单位: ${JSON.stringify(metric)}`
          )
        }
      })

      assert(
        metrics.tableLeft >= metrics.paperLeft - 1 &&
          metrics.tableRight <= metrics.paperRight + 1,
        `${scenarioLabel} 表格越过纸面边界: ${JSON.stringify(metrics)}`
      )
    } finally {
      await page.evaluate(
        ({ resolvedStorageKey, resolvedOriginalRaw }) => {
          if (typeof resolvedOriginalRaw === 'string') {
            window.localStorage.setItem(resolvedStorageKey, resolvedOriginalRaw)
            return
          }
          window.localStorage.removeItem(resolvedStorageKey)
        },
        {
          resolvedStorageKey: storageKey,
          resolvedOriginalRaw: originalRaw,
        }
      )
      await page.reload({ waitUntil: 'domcontentloaded' })
      await expectText(page, '打印内容')
    }
  }

  async function assertMaterialDetailLineCellsWrapLongValues(page) {
    const scenarioLabel = '物料分析明细表长业务值换行'
    const screenshotPath = path.join(
      outputDir,
      'engineering-template-review',
      'runtime',
      'material-detail-long-value-wrap-latest.png'
    )
    const injectedTexts = {
      category: '材料类别超长连续值CATEGORY-LONG-WRAP-CHECK-20260707',
      materialName:
        '核心演示超长连续中文物料名称不应覆盖相邻列核心演示超长连续中文物料名称',
      vendorCode:
        'SIM-PLUSH-CORE-MATERIAL-DETAIL-LONG-CONTINUOUS-FACTORY-NO-20260707',
      spec: '150cm幅宽超长规格值连续不换行回归样本',
      color: '颜色超长连续值COLOR-LONG-WRAP-CHECK-20260707',
      unit: '核心演示单位-米-LONG-UNIT-CONTINUOUS-WRAP-CHECK',
      position: '核心演示单体车缝装配部位长文本SHOULD-WRAP-IN-CELL',
      pieces: '1234567890PIECES-LONG-WRAP-CHECK',
      unitUsage: '0.650000000000-UNIT-USAGE-LONG-WRAP-CHECK',
      lossRate: '0.050000000000-LOSS-RATE-LONG-WRAP-CHECK',
      totalUsage: '999999999999-TOTAL-USAGE-LONG-WRAP-CHECK',
      processBase: '加工方式基础超长连续值PROCESS-BASE-LONG-WRAP-CHECK',
      processMethod: '加工方式方法超长连续值PROCESS-METHOD-LONG-WRAP-CHECK',
      remark: '备注井25251纸样色卡SIM-LONG-REMARK-CONTINUOUS-TEXT-WRAP-CHECK',
    }
    const originalTexts = await page.evaluate((texts) => {
      const row = document.querySelector('.erp-material-detail-table tbody tr')
      const targets = [
        { key: 'category', index: 0 },
        { key: 'materialName', index: 1 },
        { key: 'vendorCode', index: 2 },
        { key: 'spec', index: 3 },
        { key: 'color', index: 4 },
        { key: 'unit', index: 5 },
        { key: 'position', index: 6 },
        { key: 'pieces', index: 7 },
        { key: 'unitUsage', index: 8 },
        { key: 'lossRate', index: 9 },
        { key: 'totalUsage', index: 10 },
        { key: 'processBase', index: 11 },
        { key: 'processMethod', index: 12 },
        { key: 'remark', index: 13 },
      ]
      const originals = []
      targets.forEach(({ key, index }) => {
        const cell = row?.children?.[index] || null
        const editable = cell?.querySelector(
          '.erp-material-detail-table__editable'
        )
        originals.push({
          key,
          html: editable?.innerHTML ?? null,
        })
        if (editable) {
          editable.textContent = texts[key]
        }
      })
      return originals
    }, injectedTexts)

    try {
      await page.waitForTimeout(50)
      const metrics = await page.evaluate((expectedTexts) => {
        const table = document.querySelector('.erp-material-detail-table')
        const paper = document.querySelector('.erp-material-detail-paper')
        const row = table?.querySelector('tbody tr')
        const tableRect = table?.getBoundingClientRect()
        const paperRect = paper?.getBoundingClientRect()
        const targetColumns = [
          { key: 'category', index: 0 },
          { key: 'materialName', index: 1 },
          { key: 'vendorCode', index: 2 },
          { key: 'spec', index: 3 },
          { key: 'color', index: 4 },
          { key: 'unit', index: 5 },
          { key: 'position', index: 6 },
          { key: 'pieces', index: 7 },
          { key: 'unitUsage', index: 8 },
          { key: 'lossRate', index: 9 },
          { key: 'totalUsage', index: 10 },
          { key: 'processBase', index: 11 },
          { key: 'processMethod', index: 12 },
          { key: 'remark', index: 13 },
        ]

        const cells = targetColumns.map(({ key, index }) => {
          const cell = row?.children?.[index] || null
          const editable = cell?.querySelector(
            '.erp-material-detail-table__editable'
          )
          const node = editable || cell
          const cellRect = cell?.getBoundingClientRect()
          const nodeRect = node?.getBoundingClientRect()
          const cellStyle = cell ? window.getComputedStyle(cell) : null
          const nodeStyle = node ? window.getComputedStyle(node) : null
          const lineHeight = Number.parseFloat(nodeStyle?.lineHeight || '0')
          const range = node ? document.createRange() : null
          if (range && node) {
            range.selectNodeContents(node)
          }
          const lineBoxCount = range
            ? [...range.getClientRects()].filter(
                (rect) => rect.width > 0 && rect.height > 0
              ).length
            : 0
          range?.detach()
          return {
            key,
            expectedText: expectedTexts[key],
            text: String(node?.textContent || '')
              .replace(/\u00a0/g, ' ')
              .trim(),
            cellClientWidth: cell?.clientWidth || 0,
            cellScrollWidth: cell?.scrollWidth || 0,
            nodeClientWidth: node?.clientWidth || 0,
            nodeScrollWidth: node?.scrollWidth || 0,
            cellLeft: cellRect?.left || 0,
            cellRight: cellRect?.right || 0,
            nodeLeft: nodeRect?.left || 0,
            nodeRight: nodeRect?.right || 0,
            nodeHeight: nodeRect?.height || 0,
            lineHeight,
            lineBoxCount,
            cellWhiteSpace: cellStyle?.whiteSpace || '',
            cellOverflowWrap: cellStyle?.overflowWrap || '',
            cellWordBreak: cellStyle?.wordBreak || '',
            nodeWhiteSpace: nodeStyle?.whiteSpace || '',
            nodeOverflowWrap: nodeStyle?.overflowWrap || '',
            nodeWordBreak: nodeStyle?.wordBreak || '',
            nodeLineBreak: nodeStyle?.lineBreak || '',
          }
        })

        return {
          hasTable: Boolean(table),
          hasRow: Boolean(row),
          tableLeft: tableRect?.left || 0,
          tableRight: tableRect?.right || 0,
          paperLeft: paperRect?.left || 0,
          paperRight: paperRect?.right || 0,
          cells,
        }
      }, injectedTexts)

      assert(metrics.hasTable, `${scenarioLabel} 未找到物料明细表格`)
      assert(metrics.hasRow, `${scenarioLabel} 未找到物料明细行`)

      metrics.cells.forEach((metric) => {
        assert.equal(
          metric.text,
          metric.expectedText,
          `${scenarioLabel} ${metric.key} 未写入边界样本: ${JSON.stringify(metric)}`
        )
        assert.equal(
          metric.cellWhiteSpace,
          'normal',
          `${scenarioLabel} ${metric.key} 单元格不应强制单行: ${JSON.stringify(metric)}`
        )
        assert.equal(
          metric.nodeWhiteSpace,
          'normal',
          `${scenarioLabel} ${metric.key} 内容块不应强制单行: ${JSON.stringify(metric)}`
        )
        assert.equal(
          metric.nodeOverflowWrap,
          'anywhere',
          `${scenarioLabel} ${metric.key} 内容块未允许任意断行: ${JSON.stringify(metric)}`
        )
        assert(
          metric.cellScrollWidth <= metric.cellClientWidth + 1,
          `${scenarioLabel} ${metric.key} 单元格仍横向溢出: ${JSON.stringify(metric)}`
        )
        assert(
          metric.nodeScrollWidth <= metric.nodeClientWidth + 1,
          `${scenarioLabel} ${metric.key} 内容块仍横向溢出: ${JSON.stringify(metric)}`
        )
        assert(
          metric.cellLeft >= metrics.tableLeft - 1 &&
            metric.cellRight <= metrics.tableRight + 1,
          `${scenarioLabel} ${metric.key} 单元格越过表格边界: ${JSON.stringify({
            metric,
            tableLeft: metrics.tableLeft,
            tableRight: metrics.tableRight,
          })}`
        )
        assert(
          metric.nodeLeft >= metric.cellLeft - 1 &&
            metric.nodeRight <= metric.cellRight + 1,
          `${scenarioLabel} ${metric.key} 内容块越过单元格边界: ${JSON.stringify(metric)}`
        )
        assert(
          metric.lineBoxCount >= 2 ||
            metric.nodeHeight > metric.lineHeight * 1.5,
          `${scenarioLabel} ${metric.key} 长文本应在格内形成多行: ${JSON.stringify(metric)}`
        )
      })

      assert(
        metrics.tableLeft >= metrics.paperLeft - 1 &&
          metrics.tableRight <= metrics.paperRight + 1,
        `${scenarioLabel} 表格越过纸面边界: ${JSON.stringify(metrics)}`
      )

      await fs.mkdir(path.dirname(screenshotPath), { recursive: true })
      await page
        .locator('.erp-material-detail-paper')
        .screenshot({ path: screenshotPath })
    } finally {
      await page.evaluate((originals) => {
        const row = document.querySelector(
          '.erp-material-detail-table tbody tr'
        )
        const targetIndexes = {
          category: 0,
          materialName: 1,
          vendorCode: 2,
          spec: 3,
          color: 4,
          unit: 5,
          position: 6,
          pieces: 7,
          unitUsage: 8,
          lossRate: 9,
          totalUsage: 10,
          processBase: 11,
          processMethod: 12,
          remark: 13,
        }
        originals.forEach(({ key, html }) => {
          const index = targetIndexes[key]
          const cell = row?.children?.[index] || null
          const editable = cell?.querySelector(
            '.erp-material-detail-table__editable'
          )
          if (editable && typeof html === 'string') {
            editable.innerHTML = html
          }
        })
      }, originalTexts)
    }
  }

  async function assertPrintTemplateLongBusinessValuesStayInsidePaper(
    page,
    { paperSelector, scenarioLabel, screenshotName }
  ) {
    const injectedState = await page.evaluate(
      ({ resolvedPaperSelector, resolvedScenarioLabel }) => {
        const paper = document.querySelector(resolvedPaperSelector)
        const paperRect = paper?.getBoundingClientRect()
        const editors = [
          ...(paper?.querySelectorAll('[contenteditable="true"]') || []),
        ]
          .filter((editor) => {
            const rect = editor.getBoundingClientRect()
            return rect.width > 0 && rect.height > 0
          })
          .slice(0, 120)

        return {
          hasPaper: Boolean(paper),
          paperWidth: paperRect?.width || 0,
          count: editors.length,
          originals: editors.map((editor, index) => {
            const marker = `style-l1-long-business-value-${index}`
            const originalHTML = editor.innerHTML
            editor.setAttribute('data-style-l1-long-business-value', marker)
            editor.textContent = `${resolvedScenarioLabel}长业务带值-${index}-LONG-CONTINUOUS-WRAP-CHECK-20260708-ABCDEFGHIJKLMNOPQRSTUVWXYZ`
            return {
              marker,
              originalHTML,
            }
          }),
        }
      },
      {
        resolvedPaperSelector: paperSelector,
        resolvedScenarioLabel: scenarioLabel,
      }
    )

    assert(
      injectedState.hasPaper,
      `${scenarioLabel} 未找到纸面: ${paperSelector}`
    )
    assert(
      injectedState.count > 0,
      `${scenarioLabel} 未找到可编辑业务值槽: ${JSON.stringify(injectedState)}`
    )

    try {
      await page.waitForTimeout(80)
      const metrics = await page.evaluate(
        ({ resolvedPaperSelector }) => {
          const paper = document.querySelector(resolvedPaperSelector)
          const paperRect = paper?.getBoundingClientRect()
          const editors = [
            ...(paper?.querySelectorAll(
              '[data-style-l1-long-business-value]'
            ) || []),
          ]
          const states = editors.map((editor, index) => {
            const editorRect = editor.getBoundingClientRect()
            const container =
              editor.closest('td, th') ||
              editor.closest(
                [
                  '.erp-material-contract-meta__row',
                  '.erp-processing-contract-meta__row',
                  '.erp-processing-contract-clauses__item',
                  '.erp-processing-contract-signature__label',
                  '.erp-processing-contract-signature__date',
                  '.erp-engineering-print-meta-grid > div',
                  '.erp-material-detail-paper__footer-field',
                  '.erp-color-card-paper__meta',
                  '.erp-color-card-paper__footer > span',
                  '.erp-work-instruction-paper__summary-item',
                ].join(',')
              ) ||
              editor.parentElement
            const containerRect = container?.getBoundingClientRect()
            const editorStyle = window.getComputedStyle(editor)
            const containerStyle = container
              ? window.getComputedStyle(container)
              : null
            const range = document.createRange()
            range.selectNodeContents(editor)
            const lineBoxCount = [...range.getClientRects()].filter(
              (rect) => rect.width > 0 && rect.height > 0
            ).length
            range.detach()
            return {
              index,
              marker: editor.getAttribute('data-style-l1-long-business-value'),
              text: String(editor.textContent || '').trim(),
              editorWidth: editorRect.width,
              editorHeight: editorRect.height,
              editorLeft: editorRect.left,
              editorRight: editorRect.right,
              editorClientWidth: editor.clientWidth,
              editorScrollWidth: editor.scrollWidth,
              containerTag: container?.tagName || '',
              containerWidth: containerRect?.width || 0,
              containerHeight: containerRect?.height || 0,
              containerLeft: containerRect?.left || 0,
              containerRight: containerRect?.right || 0,
              containerClientWidth: container?.clientWidth || 0,
              containerScrollWidth: container?.scrollWidth || 0,
              paperLeft: paperRect?.left || 0,
              paperRight: paperRect?.right || 0,
              whiteSpace: editorStyle.whiteSpace,
              overflowWrap: editorStyle.overflowWrap,
              wordBreak: editorStyle.wordBreak,
              display: editorStyle.display,
              containerWhiteSpace: containerStyle?.whiteSpace || '',
              containerOverflowWrap: containerStyle?.overflowWrap || '',
              containerWordBreak: containerStyle?.wordBreak || '',
              lineBoxCount,
            }
          })
          return {
            hasPaper: Boolean(paper),
            checkedCount: states.length,
            paperLeft: paperRect?.left || 0,
            paperRight: paperRect?.right || 0,
            issues: states.filter((state) => {
              const isTableContainer =
                state.containerTag === 'TD' || state.containerTag === 'TH'
              return (
                !state.text ||
                state.editorWidth <= 0 ||
                state.editorHeight <= 0 ||
                state.editorScrollWidth > state.editorClientWidth + 1 ||
                state.editorLeft < state.paperLeft - 1 ||
                state.editorRight > state.paperRight + 1 ||
                state.editorLeft < state.containerLeft - 1 ||
                state.editorRight > state.containerRight + 1 ||
                (isTableContainer &&
                  state.containerScrollWidth > state.containerClientWidth + 1)
              )
            }),
            states,
          }
        },
        { resolvedPaperSelector: paperSelector }
      )

      assert(metrics.hasPaper, `${scenarioLabel} 未找到纸面`)
      assert.equal(
        metrics.checkedCount,
        injectedState.count,
        `${scenarioLabel} 注入值槽数量前后不一致: ${JSON.stringify(metrics)}`
      )
      assert.deepEqual(
        metrics.issues,
        [],
        `${scenarioLabel} 长业务带值不应横向溢出、覆盖邻区或越过纸面: ${JSON.stringify(metrics)}`
      )

      if (screenshotName) {
        await page.locator(paperSelector).screenshot({
          path: path.resolve(outputDir, `${screenshotName}.png`),
        })
      }
    } finally {
      await page.evaluate(
        ({ resolvedPaperSelector, originals }) => {
          const paper = document.querySelector(resolvedPaperSelector)
          originals.forEach(({ marker, originalHTML }) => {
            const editor = paper?.querySelector(
              `[data-style-l1-long-business-value="${marker}"]`
            )
            if (editor) {
              editor.innerHTML = originalHTML
              editor.removeAttribute('data-style-l1-long-business-value')
            }
          })
        },
        {
          resolvedPaperSelector: paperSelector,
          originals: injectedState.originals,
        }
      )
    }
  }

  async function assertContractTotalCellsWrapLargeNumbers(
    page,
    { storageKey, templateKind, totalValueSelector, scenarioLabel }
  ) {
    const storageKeys = await resolveCurrentPrintWorkspaceDraftStorageKeys(
      page,
      storageKey
    )
    const originalEntries = await snapshotLocalStorageValues(page, storageKeys)
    const injectionMarkerKey = createDraftInjectionMarkerKey('large_total')
    await installDraftInjectionOnNextLoad(page, injectionMarkerKey)

    try {
      await page.evaluate(
        ({
          resolvedStorageKeys,
          resolvedTemplateKind,
          resolvedInjectionMarkerKey,
        }) => {
          const rawDraft = resolvedStorageKeys
            .map((key) => window.localStorage.getItem(key))
            .find((value) => typeof value === 'string')
          const draft = rawDraft ? JSON.parse(rawDraft) : {}
          const sourceLine =
            Array.isArray(draft.lines) && draft.lines.length > 0
              ? draft.lines[0]
              : {}
          const largeQuantity = '400013111'
          const largeAmount = '400013111.22'

          draft.lines = [
            {
              ...sourceLine,
              quantity: largeQuantity,
              amount: largeAmount,
              ...(resolvedTemplateKind === 'processing'
                ? { unitPrice: '1' }
                : {}),
            },
          ]
          draft.merges = []
          resolvedStorageKeys.forEach((key) => {
            window.localStorage.setItem(key, JSON.stringify(draft))
          })
          window.localStorage.setItem(
            resolvedInjectionMarkerKey,
            JSON.stringify({
              keys: resolvedStorageKeys,
              draftJSON: JSON.stringify(draft),
            })
          )
        },
        {
          resolvedStorageKeys: storageKeys,
          resolvedTemplateKind: templateKind,
          resolvedInjectionMarkerKey: injectionMarkerKey,
        }
      )

      await page.reload({ waitUntil: 'domcontentloaded' })
      await expectText(page, '打印内容')
      await page.waitForFunction(
        (selector) => document.querySelectorAll(selector).length >= 2,
        totalValueSelector,
        { timeout: 10_000 }
      )

      const metrics = await page.evaluate((selector) => {
        return Array.from(document.querySelectorAll(selector)).map((node) => {
          const style = window.getComputedStyle(node)
          const rect = node.getBoundingClientRect()
          return {
            text: String(node.textContent || '')
              .replace(/\u00a0/g, ' ')
              .trim(),
            clientWidth: node.clientWidth,
            scrollWidth: node.scrollWidth,
            width: rect.width,
            height: rect.height,
            whiteSpace: style.whiteSpace,
            overflowWrap: style.overflowWrap,
            wordBreak: style.wordBreak,
          }
        })
      }, totalValueSelector)

      assert(
        metrics.length >= 2,
        `${scenarioLabel} 缺少数量或金额合计单元格: ${JSON.stringify(metrics)}`
      )

      metrics.forEach((metric) => {
        assert(
          metric.text.length >= 9,
          `${scenarioLabel} 未写入大数值边界样本: ${JSON.stringify(metric)}`
        )
        assert.equal(
          metric.whiteSpace,
          'normal',
          `${scenarioLabel} 大数值不应保持单行: ${JSON.stringify(metric)}`
        )
        assert.equal(
          metric.overflowWrap,
          'anywhere',
          `${scenarioLabel} 大数值未允许任意断行: ${JSON.stringify(metric)}`
        )
        assert(
          metric.scrollWidth <= metric.clientWidth + 1,
          `${scenarioLabel} 大数值仍横向溢出单元格: ${JSON.stringify(metric)}`
        )
      })
    } finally {
      await page.evaluate(
        (resolvedInjectionMarkerKey) =>
          window.localStorage.removeItem(resolvedInjectionMarkerKey),
        injectionMarkerKey
      )
      await restoreLocalStorageValues(page, originalEntries)
      await page.reload({ waitUntil: 'domcontentloaded' })
      await expectText(page, '打印内容')
    }
  }

  async function assertMaterialContractPrintMediaIgnoresResponsiveBreakpoints(
    page
  ) {
    await page.emulateMedia({ media: 'print' })

    try {
      const metrics = await page.evaluate(() => {
        const countGridColumns = (value) => {
          const normalized = String(value || '').trim()
          if (!normalized || normalized === 'none') {
            return 0
          }
          return normalized.split(/\s+/).length
        }

        const paper = document.querySelector('.erp-material-contract-paper')
        const table = document.querySelector('.erp-material-contract-table')
        const signature = document.querySelector(
          '.erp-material-contract-signature'
        )
        const metaPairs = Array.from(
          document.querySelectorAll('.erp-material-contract-meta__pair')
        )

        return {
          viewportWidth: window.innerWidth,
          paperPaddingLeft: Number.parseFloat(
            window.getComputedStyle(paper).paddingLeft || '0'
          ),
          tableFontSize: Number.parseFloat(
            window.getComputedStyle(table).fontSize || '0'
          ),
          signatureColumnCount: countGridColumns(
            window.getComputedStyle(signature).gridTemplateColumns
          ),
          metaPairColumnCounts: metaPairs.map((pair) =>
            countGridColumns(window.getComputedStyle(pair).gridTemplateColumns)
          ),
        }
      })

      assert.equal(
        metrics.signatureColumnCount,
        2,
        `采购合同打印态签字区不应在窄视口塌成单列: ${JSON.stringify(metrics)}`
      )
      assert(
        metrics.metaPairColumnCounts.length > 0 &&
          metrics.metaPairColumnCounts.every((count) => count === 2),
        `采购合同打印态头部信息不应在窄视口塌成单列: ${JSON.stringify(metrics)}`
      )
      assert(
        metrics.paperPaddingLeft >= 18 && metrics.paperPaddingLeft <= 22,
        `采购合同打印态左右页边距应保持 5mm 量级: ${JSON.stringify(metrics)}`
      )
      assert(
        metrics.tableFontSize >= 13.5,
        `采购合同打印态表格字号不应退回移动端紧凑值: ${JSON.stringify(metrics)}`
      )
    } finally {
      await page.emulateMedia({ media: 'screen' })
    }
  }

  return {
    assertPrintPreviewPopup,
    assertPrintCenterPreviewPopup,
    assertEditablePrintWorkspacePopupRefresh,
    assertPrintWorkspacePaginationStyle,
    assertProcessingContractPaperRowCount,
    assertProcessingContractSignatureLayout,
    assertContractTableHeadersStaySingleLine,
    assertWorkspaceContinuedPageMargin,
    assertMaterialContractMetaAlignment,
    assertContractTableEditableAlignment,
    assertMaterialContractLineCellsWrapLongValues,
    assertMaterialDetailLineCellsWrapLongValues,
    assertPrintTemplateLongBusinessValuesStayInsidePaper,
    assertContractTotalCellsWrapLargeNumbers,
    assertMaterialContractPrintMediaIgnoresResponsiveBreakpoints,
  }
}
