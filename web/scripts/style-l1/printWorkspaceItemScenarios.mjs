import { chooseSelectOption, readSelectValue } from './selectControlActions.mjs'
import { expandPrintToolSection } from './printToolHelpers.mjs'

export function createPrintWorkspaceItemScenarios({
  assert,
  path,
  outputDir,
  gotoScenarioPath,
  assertPrintPreviewPopup,
}) {
  const blankCount = async (page) => {
    const notice = page.locator('[data-print-blank-notice]')
    return (await notice.count())
      ? Number((await notice.innerText()).match(/当前有 (\d+) 处留白/u)[1])
      : 0
  }
  const expectBlanks = async (page, count) => {
    if (!count) {
      await page
        .locator('[data-print-blank-notice]')
        .waitFor({ state: 'hidden' })
    } else {
      await page
        .locator('[data-print-blank-notice]')
        .getByText(new RegExp(`^当前有 ${count} 处留白，`, 'u'))
        .waitFor()
    }
  }
  const installPDF = async (page) => {
    const payloads = []
    await page.route('**/templates/render-pdf', async (route) => {
      payloads.push(route.request().postDataJSON())
      await route.fulfill({
        contentType: 'application/pdf',
        body: '%PDF-1.4\n%%EOF\n',
      })
    })
    return payloads
  }
  const checkOutput = async (page, title, label, payloads) => {
    await assertPrintPreviewPopup(page, {
      buttonName: '在线预览 PDF',
      title,
      screenshotName: `print-items-${label}-preview`,
    })
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: '下载 PDF', exact: true }).click()
    await download
    assert(payloads.length > 0, '预览和下载正常生成输出')
    for (const { html } of payloads) {
      const result = await page.evaluate((source) => {
        const doc = new DOMParser().parseFromString(source, 'text/html')
        return {
          controls: doc.body.querySelectorAll(
            "[data-print-tool], [data-print-editor-only], [data-print-blank-notice], .erp-print-shell__blank-actions, button, .ant-select"
          ).length,
          text: doc.body.textContent,
        }
      }, html)
      assert.equal(result.controls, 0, '条款操作、条目操作和留白导航不进入 PDF')
      assert(!/当前有 \d+ 处留白|点击填写/u.test(result.text))
    }
    await page.evaluate(() => {
      window.__ITEM_PRINT_CALLS__ = 0
      window.print = () => {
        window.__ITEM_PRINT_CALLS__ += 1
      }
    })
    await page.getByRole('button', { name: '打印', exact: true }).click()
    await page.waitForFunction(() => window.__ITEM_PRINT_CALLS__ === 1)
    assert.equal(
      await page.getByRole('dialog').count(),
      0,
      '条目编辑和留白不增加输出确认弹窗'
    )
    await page.emulateMedia({ media: 'print' })
    assert.equal(
      await page.locator('.erp-print-shell__record-panel').isVisible(),
      false
    )
    for (const editorOnly of await page
      .locator('[data-print-editor-only]')
      .all()) {
      assert.equal(
        await editorOnly.isVisible(),
        false,
        '编辑专用内容不进入浏览器打印'
      )
    }
    await page.emulateMedia({ media: 'screen' })
  }
  const exerciseClauses = async (page, prefix, label, batch = false) => {
    const payloads = await installPDF(page)
    const paper = page.locator(`.erp-${prefix}-contract-paper`).first()
    const tools = page.locator('[data-print-tool="clauses"]')
    const group = (key) => paper.locator(`[data-print-clause-group="${key}"]`)
    const editors = (key) =>
      group(key).locator('[data-print-clause-index] [contenteditable="true"]')
    const values = async () =>
      (await editors('delivery').allTextContents()).map((text) => text.trim())
    await expandPrintToolSection(page, '条款编辑')
    await chooseSelectOption(tools
      .getByRole('combobox', { name: '条款分组', exact: true }), 'delivery')
    const source = ['条款甲', '条款乙', '条款丙']
    for (let index = 0; index < source.length; index += 1) {
      await editors('delivery').nth(index).fill(source[index])
    }
    const other = batch
      ? page.locator('.erp-material-contract-paper').nth(1)
      : null
    const untouched = other ? await other.innerText() : ''
    const baseline = await blankCount(page)
    await editors('delivery').first().click()
    await tools.getByRole('button', { name: '下插一条', exact: true }).click()
    assert.deepEqual(await values(), ['条款甲', '', '条款乙', '条款丙'])
    await expectBlanks(page, baseline + 1)
    await editors('delivery').nth(1).fill('新增条目')
    await expectBlanks(page, baseline)
    await tools.getByRole('button', { name: '上移一条', exact: true }).click()
    assert.deepEqual(await values(), ['新增条目', '条款甲', '条款乙', '条款丙'])
    assert.equal(
      await tools
        .getByRole('button', { name: '上移一条', exact: true })
        .isEnabled(),
      false
    )
    await tools.getByRole('button', { name: '下移一条', exact: true }).click()
    assert.deepEqual(await values(), ['条款甲', '新增条目', '条款乙', '条款丙'])
    await tools.getByRole('button', { name: '清空当前条', exact: true }).click()
    assert.deepEqual(await values(), ['条款甲', '', '条款乙', '条款丙'])
    await expectBlanks(page, baseline + 1)
    await tools.getByRole('button', { name: '删除当前条', exact: true }).click()
    assert.deepEqual(await values(), source)
    await expectBlanks(page, baseline)
    assert.deepEqual(
      (
        await group('delivery')
          .locator(
            '[class$="__index"], .erp-processing-contract-clauses__item-index'
          )
          .allTextContents()
      ).map((text) => text.trim()),
      ['1、', '2、', '3、']
    )
    for (let index = 0; index < 3; index += 1) {
      await tools
        .getByRole('button', { name: '删除当前条', exact: true })
        .click()
    }
    assert.equal(await group('delivery').count(), 0, '删空后不保留纸面标题')
    assert((await paper.innerText()).includes('一、合同约定'))
    assert((await paper.innerText()).includes('二、结算方式'))
    await page.getByText('本窗口内容已保存', { exact: true }).waitFor()
    await page.reload()
    await page.locator('.erp-print-shell--ready').waitFor()
    assert.equal(await group('delivery').count(), 0, '刷新不补回已删组')
    await expandPrintToolSection(page, '条款编辑')
    await chooseSelectOption(tools
      .getByRole('combobox', { name: '条款分组', exact: true }), 'delivery')
    await tools.getByRole('button', { name: '新增条目', exact: true }).click()
    assert.deepEqual(await values(), [''])
    await expectBlanks(page, baseline + 1)
    await page
      .locator('[data-print-blank-notice]')
      .getByRole('button', { name: '查看留白', exact: true })
      .click()
    if (!baseline) {
      await page.waitForFunction(
        () =>
          document.activeElement?.closest('[data-print-clause-group]')?.dataset
            .printClauseGroup === 'delivery'
      )
    }
    await editors('delivery').first().fill('恢复条目')
    await expectBlanks(page, baseline)
    await tools.getByRole('button', { name: '清空当前条', exact: true }).click()
    const groupSelect = tools.getByRole('combobox', {
      name: '条款分组',
      exact: true,
    })
    await chooseSelectOption(groupSelect, 'contract')
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        )
    )
    assert.equal(
      await readSelectValue(groupSelect),
      'contract',
      '旧定位不抢回已切换的分组'
    )
    await chooseSelectOption(groupSelect, 'delivery')
    await editors('delivery').first().fill('恢复条目')
    await expectBlanks(page, baseline)
    for (const key of ['delivery', 'contract', 'settlement']) {
      await chooseSelectOption(tools
        .getByRole('combobox', { name: '条款分组', exact: true }), key)
      const length = await editors(key).count()
      for (let index = 0; index < length; index += 1) {
        await tools
          .getByRole('button', { name: '删除当前条', exact: true })
          .click()
      }
    }
    assert.equal(
      await paper.locator(`[class="erp-${prefix}-contract-clauses"]`).count(),
      0,
      '全部删空后不留条款区占位'
    )
    if (other) {
      assert.equal(await other.innerText(), untouched, '批量操作只影响当前合同')
    }
    await tools.getByRole('button', { name: '新增条目', exact: true }).click()
    assert.equal(
      await group('settlement').locator('[data-print-clause-index]').count(),
      1
    )
    assert((await paper.innerText()).includes('一、结算方式'))
    await expectBlanks(page, baseline + 1)
    await page.screenshot({
      path: path.join(outputDir, `print-items-${label}.png`),
    })
    if (prefix === 'processing') {
      await page.setViewportSize({ width: 3840, height: 2160 })
      await page.screenshot({
        path: path.join(outputDir, 'print-items-processing-4k.png'),
      })
      await page.setViewportSize({ width: 1440, height: 960 })
    }
    await checkOutput(
      page,
      batch
        ? '采购合同批量 PDF 预览'
        : `${prefix === 'material' ? '采购合同' : '加工合同'} PDF 预览`,
      label,
      payloads
    )
    const snapshot = await page.evaluate((html) => {
      const doc = new DOMParser().parseFromString(html, 'text/html')
      const paper = doc.querySelector(
        '.erp-material-contract-paper, .erp-processing-contract-paper'
      )
      return {
        groups: paper.querySelectorAll('[data-print-clause-group]').length,
        text: paper.textContent,
      }
    }, payloads.at(-1).html)
    assert.equal(snapshot.groups, 1)
    assert(!snapshot.text.includes('来货要求'))
    assert(!snapshot.text.includes('合同约定'))
  }

  return [
    {
      name: 'print-workspace-contract-clause-items',
      path: '/erp/print-workspace/material-purchase-contract?draft=fresh',
      auth: 'admin',
      viewport: { width: 1440, height: 960 },
      verify: async (page) => {
        for (const [key, prefix] of [
          ['material-purchase-contract', 'material'],
          ['processing-contract', 'processing'],
        ]) {
          await gotoScenarioPath(
            page,
            `/erp/print-workspace/${key}?state=item-editing-${prefix}`
          )
          await page.locator('.erp-print-shell--ready').waitFor()
          await exerciseClauses(page, prefix, prefix)
        }
      },
    },
    {
      name: 'print-workspace-batch-clause-items',
      path: '/erp/print-workspace/material-purchase-contract?draft=fresh',
      auth: 'admin',
      viewport: { width: 1440, height: 960 },
      verify: async (launcher) => {
        let page
        try {
          const popup = launcher.waitForEvent('popup')
          await launcher.evaluate(async () => {
            const moduleRoot = '/src/erp'
            const { openPrintWorkspaceWindow } = await import(
              `${moduleRoot}/utils/printWorkspace.js`
            )
            const { getPrintWorkspaceDraftScope } = await import(
              `${moduleRoot}/utils/printWorkspaceScope.mjs`
            )
            const { getPrintTemplateByKey } = await import(
              `${moduleRoot}/config/printTemplates.mjs`
            )
            const { sample } = getPrintTemplateByKey(
              'material-purchase-contract'
            ).sample
            openPrintWorkspaceWindow('material-purchase-contract', {
              ...getPrintWorkspaceDraftScope(
                new URLSearchParams(location.search)
              ),
              entrySource: 'business',
              initialDraft: {
                kind: 'material-purchase-contract-batch',
                version: 1,
                contracts: [1, 2].map((id) => ({
                  purchaseOrderID: id,
                  orderNo: `QA-CLAUSE-${id}`,
                  draft: {
                    ...structuredClone(sample),
                    contractNo: `QA-CLAUSE-${id}`,
                    clauses: {
                      delivery: ['甲', '乙', '丙'],
                      contract: ['保留约定'],
                      settlement: ['保留结算'],
                    },
                  },
                })),
              },
            })
          })
          page = await popup
          await page.locator('.erp-print-shell--ready').waitFor()
          await exerciseClauses(page, 'material', 'batch', true)
        } finally {
          if (page && !page.isClosed()) await page.close()
        }
      },
    },
    {
      name: 'print-workspace-row-item-order-clear',
      path: '/erp/print-workspace/material-purchase-contract?draft=fresh',
      auth: 'admin',
      viewport: { width: 1440, height: 960 },
      verify: async (page) => {
        for (const [key, selector] of [
          [
            'material-purchase-contract',
            '.erp-material-contract-table tbody tr[data-print-blank-row]',
          ],
          [
            'processing-contract',
            '.erp-processing-contract-table tbody tr[data-print-blank-row]',
          ],
          [
            'engineering-material-detail',
            '.erp-material-detail-table tbody tr',
          ],
        ]) {
          await gotoScenarioPath(
            page,
            `/erp/print-workspace/${key}?draft=fresh&state=row-items-${key}`
          )
          await page.locator('.erp-print-shell--ready').waitFor()
          const rows = page.locator(selector)
          const texts = await rows.allTextContents()
          const initialBlanks = await blankCount(page)
          const rowBlanks = await rows
            .nth(1)
            .locator('[contenteditable="true"]')
            .evaluateAll(
              (nodes) => nodes.filter((node) => !node.textContent.trim()).length
            )
          const fieldCount = await rows
            .nth(1)
            .locator('[contenteditable="true"]')
            .count()
          await page
            .getByRole('button', { name: '选择明细行', exact: true })
            .click()
          await rows.nth(1).locator('td').first().click()
          await page
            .getByRole('button', { name: '上移一行', exact: true })
            .click()
          assert.deepEqual(await rows.allTextContents(), [
            texts[1],
            texts[0],
            ...texts.slice(2),
          ])
          assert.equal(
            await page
              .getByRole('button', { name: '上移一行', exact: true })
              .isEnabled(),
            false
          )
          await page
            .getByRole('button', { name: '下移一行', exact: true })
            .click()
          assert.deepEqual(await rows.allTextContents(), texts)
          await page
            .getByRole('button', { name: '清空当前行', exact: true })
            .click()
          assert.equal(await rows.count(), texts.length)
          assert(
            (
              await rows
                .nth(1)
                .locator('[contenteditable="true"]')
                .allTextContents()
            ).every((text) => !text.trim())
          )
          await expectBlanks(page, initialBlanks + fieldCount - rowBlanks)
          await page
            .locator('[data-print-blank-notice]')
            .getByRole('button', { name: '查看留白', exact: true })
            .click()
          await page
            .getByRole('button', { name: '选择明细行', exact: true })
            .click()
          await rows.nth(1).locator('td').first().click()
          await page
            .getByRole('button', { name: '移除当前行', exact: true })
            .click()
          assert.equal(await rows.count(), texts.length - 1)
          await expectBlanks(page, initialBlanks - rowBlanks)
          if (initialBlanks > rowBlanks) {
            assert.deepEqual(
              await page
                .locator('[data-print-blank-notice] button')
                .allTextContents(),
              ['查看留白']
            )
          }
        }
      },
    },
    {
      name: 'print-workspace-engineering-item-order-clear',
      path: '/erp/print-workspace/engineering-color-card?draft=fresh',
      auth: 'admin',
      viewport: { width: 1440, height: 960 },
      verify: async (page) => {
        await page.locator('.erp-print-shell--ready').waitFor()
        await page
          .getByRole('button', { name: '选择色卡块', exact: true })
          .click()
        const left = page
          .locator('.erp-color-card-paper__side')
          .first()
          .locator('[data-color-card-block="true"]')
        const right = page
          .locator('.erp-color-card-paper__side')
          .last()
          .locator('[data-color-card-block="true"]')
        const leftTexts = await left.allTextContents()
        const rightTexts = await right.allTextContents()
        await left.first().locator('td').first().click()
        await page
          .getByRole('button', { name: '下移色卡块', exact: true })
          .click()
        assert.deepEqual(await left.allTextContents(), [
          leftTexts[1],
          leftTexts[0],
        ])
        assert.deepEqual(await right.allTextContents(), rightTexts)
        await page
          .getByRole('button', { name: '上移色卡块', exact: true })
          .click()
        assert.deepEqual(await left.allTextContents(), leftTexts)
        const initialBlanks = await blankCount(page)
        const blockIndex = await left
          .first()
          .getAttribute('data-color-card-block-index')
        const blockFields = page.locator(
          `[data-color-card-block-index="${blockIndex}"] [data-print-blank-field]`
        )
        const blockFieldCount = await blockFields.count()
        const oldBlockBlanks = await blockFields.evaluateAll(
          (nodes) =>
            nodes.filter(
              (node) =>
                !(
                  node.querySelector('[contenteditable]') || node
                ).textContent.trim()
            ).length
        )
        await page
          .getByRole('button', { name: '清空当前块', exact: true })
          .click()
        const clearedBlanks = initialBlanks + blockFieldCount - oldBlockBlanks
        await expectBlanks(page, clearedBlanks)
        await page
          .getByRole('button', { name: '移除当前块', exact: true })
          .click()
        assert.equal(await left.count(), leftTexts.length - 1)
        await expectBlanks(page, clearedBlanks - blockFieldCount)
        await gotoScenarioPath(
          page,
          '/erp/print-workspace/engineering-color-card?draft=fresh&state=color-row-items'
        )
        await page.locator('.erp-print-shell--ready').waitFor()
        const lines = page.locator('[data-color-line="true"]')
        const texts = await lines.allTextContents()
        await page
          .getByRole('button', { name: '选择色卡行', exact: true })
          .click()
        await lines.nth(1).locator('td').first().click()
        await page
          .getByRole('button', { name: '上移一行', exact: true })
          .click()
        assert.deepEqual((await lines.allTextContents()).slice(0, 2), [
          texts[1],
          texts[0],
        ])
        await page
          .getByRole('button', { name: '清空当前行', exact: true })
          .click()
        assert(
          (
            await lines
              .first()
              .locator('[contenteditable="true"]')
              .allTextContents()
          ).every((text) => !text.trim())
        )
        await gotoScenarioPath(
          page,
          '/erp/print-workspace/engineering-work-instruction?draft=fresh&state=instruction-row-items'
        )
        await page.locator('.erp-print-shell--ready').waitFor()
        const steps = page.locator(
          '.erp-work-instruction-paper__step-row--text'
        )
        const content = page.locator(
          '.erp-work-instruction-paper__step-row--text .erp-work-instruction-paper__step-content-cell [contenteditable="true"]'
        )
        const before = await content.allTextContents()
        await page.getByRole('button', { name: '选择行', exact: true }).click()
        await steps.nth(1).locator('td').first().click()
        await page
          .getByRole('button', { name: '上移一行', exact: true })
          .click()
        assert.deepEqual((await content.allTextContents()).slice(0, 2), [
          before[1],
          before[0],
        ])
        await page
          .getByRole('button', { name: '下移一行', exact: true })
          .click()
        await page
          .getByRole('button', { name: '清空当前行', exact: true })
          .click()
        assert.equal((await content.nth(1).innerText()).trim(), '')
        await page
          .getByRole('button', { name: '移除当前行', exact: true })
          .click()
        await steps.first().locator('td').first().click()
        await page
          .getByRole('button', { name: '移除当前行', exact: true })
          .click()
        const orphan = page
          .locator('tr[data-print-editor-only]')
          .filter({ hasText: '裁床' })
          .first()
        assert.equal(await orphan.getAttribute('data-print-editor-only'), '')
        const payloads = await installPDF(page)
        await checkOutput(
          page,
          '作业指导书',
          'instruction-empty-group',
          payloads
        )
        const bodyText = await page.evaluate(
          (html) =>
            new DOMParser().parseFromString(html, 'text/html').body.textContent,
          payloads.at(-1).html
        )
        assert(!bodyText.includes('裁床'), '没有条目的作业分组不输出标题')
        await page.screenshot({
          path: path.join(outputDir, 'print-items-engineering.png'),
        })
      },
    },
  ]
}
