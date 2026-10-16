import { expandPrintToolSection } from './printToolHelpers.mjs'

export function createPrintWorkspaceGroupScenarios({
  assert,
  path,
  outputDir,
  gotoScenarioPath,
  assertPrintPreviewPopup,
}) {
  const expectBlanks = async (page, count) => {
    const notice = page.locator('[data-print-blank-notice]')
    if (!count) await notice.waitFor({ state: 'hidden' })
    else {
      await notice
        .getByText(new RegExp(`^当前有 ${count} 处留白，`, 'u'))
        .waitFor()
    }
  }
  const exercise = async (page, prefix, label, batch = false) => {
    const payloads = []
    await page.route('**/templates/render-pdf', async (route) => {
      payloads.push(route.request().postDataJSON())
      await route.fulfill({
        contentType: 'application/pdf',
        body: '%PDF-1.4\n%%EOF\n',
      })
    })
    const paper = page.locator(`.erp-${prefix}-contract-paper`).first()
    const other = batch
      ? page.locator(`.erp-${prefix}-contract-paper`).nth(1)
      : null
    const untouched = other ? await other.innerText() : ''
    const tools = page.locator('[data-print-tool="clauses"]')
    const select = tools.getByRole('combobox', {
      name: '条款分组',
      exact: true,
    })
    const name = tools.getByRole('textbox', { name: '分组名称', exact: true })
    const group = (key) => paper.locator(`[data-print-clause-group="${key}"]`)
    const title = (key) =>
      group(key).locator('.erp-contract-clause-title__value')
    const items = (key) =>
      group(key).locator('[data-print-clause-index] [contenteditable="true"]')
    const values = async (key) =>
      (await items(key).allTextContents()).map((value) => value.trim())
    const visibleKeys = () =>
      paper
        .locator('[data-print-clause-group]')
        .evaluateAll((nodes) =>
          nodes.map((node) => node.dataset.printClauseGroup)
        )
    const notice = page.locator('[data-print-blank-notice]')
    const baseline = (await notice.count())
      ? Number((await notice.innerText()).match(/当前有 (\d+) 处留白/u)[1])
      : 0
    assert.equal(baseline, 0, '本场景使用完整中性样例，留白增量可精确核对')
    await expandPrintToolSection(page, '条款编辑')
    await tools.getByRole('button', { name: '新增分组', exact: true }).click()
    const fastKey = await select.inputValue()
    await name.fill('快速分组')
    await items(fastKey).first().fill('正文保留在条目中')
    await page.evaluate(
      () =>
        new Promise((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(resolve))
        )
    )
    assert.equal(
      await name.inputValue(),
      '快速分组',
      '新增后的定位不抢走已进入正文的输入'
    )
    assert.deepEqual(await values(fastKey), ['正文保留在条目中'])
    await tools.getByRole('button', { name: '删除分组', exact: true }).click()
    await expectBlanks(page, 0)
    await select.selectOption('delivery')
    await tools.getByRole('button', { name: '新增分组', exact: true }).click()
    const key = await select.inputValue()
    assert(key.startsWith('group-'))
    await page.waitForFunction(
      () => document.activeElement?.getAttribute('aria-label') === '分组名称'
    )
    await expectBlanks(page, 2)
    await notice.getByRole('button', { name: '查看留白', exact: true }).click()
    await page.waitForFunction(
      (groupKey) =>
        document.activeElement?.classList.contains(
          'erp-contract-clause-title__value'
        ) &&
        document.activeElement.closest('[data-print-clause-group]')?.dataset
          .printClauseGroup === groupKey,
      key
    )
    await title(key).fill('包装要求')
    await title(key).press('Tab')
    await select
      .getByRole('option', { name: '包装要求（1 条）', exact: true })
      .waitFor({ state: 'attached' })
    assert.equal(await name.inputValue(), '包装要求', '纸面改名同步左侧')
    await name.fill('验收与包装')
    await page.waitForFunction(
      (groupKey) =>
        Array.from(document.querySelectorAll('[data-print-clause-group]'))
          .find((node) => node.dataset.printClauseGroup === groupKey)
          ?.querySelector('.erp-contract-clause-title__value')
          ?.textContent.trim() === '验收与包装',
      key
    )
    await expectBlanks(page, 1)
    await items(key).first().fill('分组条目甲')
    await expectBlanks(page, 0)
    await tools.getByRole('button', { name: '下插一条', exact: true }).click()
    await items(key).nth(1).fill('随后清空')
    await tools.getByRole('button', { name: '清空当前条', exact: true }).click()
    await expectBlanks(page, 1)
    await tools.getByRole('button', { name: '上移分组', exact: true }).click()
    assert.deepEqual(await visibleKeys(), [
      key,
      'delivery',
      'contract',
      'settlement',
    ])
    assert.deepEqual(await values(key), ['分组条目甲', ''])
    assert.equal(
      await tools
        .getByRole('button', { name: '上移分组', exact: true })
        .isEnabled(),
      false
    )
    for (let index = 0; index < 3; index += 1) {
      await tools.getByRole('button', { name: '下移分组', exact: true }).click()
    }
    assert.deepEqual(await visibleKeys(), [
      'delivery',
      'contract',
      'settlement',
      key,
    ])
    assert.equal(
      await tools
        .getByRole('button', { name: '下移分组', exact: true })
        .isEnabled(),
      false
    )
    const titles = await paper
      .locator(
        `.erp-${prefix === 'material' ? 'material-contract-clause-block' : 'processing-contract-clauses'}__title`
      )
      .allTextContents()
    assert.deepEqual(
      titles.map((value) => value.replace(/\s+/gu, '')),
      ['一、来货要求：', '二、合同约定：', '三、结算方式：', '四、验收与包装：']
    )
    await name.fill('')
    await expectBlanks(page, 2)
    await notice.getByRole('button', { name: '查看留白', exact: true }).click()
    await page.waitForFunction(() =>
      document.activeElement?.classList.contains(
        'erp-contract-clause-title__value'
      )
    )
    await notice.getByRole('button', { name: '下一处', exact: true }).click()
    await page.waitForFunction(
      () =>
        document.activeElement?.closest('[data-print-clause-index]')?.dataset
          .printClauseIndex === '1'
    )
    await notice.getByRole('button', { name: '第一处', exact: true }).click()
    await page.waitForFunction(() =>
      document.activeElement?.classList.contains(
        'erp-contract-clause-title__value'
      )
    )
    await notice.getByRole('button', { name: '最后一处', exact: true }).click()
    await page.waitForFunction(
      () =>
        document.activeElement?.closest('[data-print-clause-index]')?.dataset
          .printClauseIndex === '1'
    )
    await name.fill('验收与包装')
    await expectBlanks(page, 1)
    await name.fill('验收与包装要求'.repeat(15))
    const geometry = await title(key).evaluate((node) => ({
      width: node.getBoundingClientRect().width,
      scrollWidth: node.scrollWidth,
      clientWidth: node.clientWidth,
      paperRight: node
        .closest('.erp-material-contract-paper, .erp-processing-contract-paper')
        .getBoundingClientRect().right,
      right: node.getBoundingClientRect().right,
    }))
    assert(
      geometry.width > 0 &&
        geometry.right <= geometry.paperRight + 1 &&
        geometry.scrollWidth <= geometry.clientWidth + 1,
      '长分组名称在纸面内换行'
    )
    await name.fill('验收与包装')
    await page.getByText('本窗口内容已保存', { exact: true }).waitFor()
    await page.reload()
    await page.locator('.erp-print-shell--ready').waitFor()
    await expandPrintToolSection(page, '条款编辑')
    await select.selectOption(key)
    assert.equal(await name.inputValue(), '验收与包装')
    assert.deepEqual(await visibleKeys(), [
      'delivery',
      'contract',
      'settlement',
      key,
    ])
    assert.deepEqual(await values(key), ['分组条目甲', ''])
    await expectBlanks(page, 1)
    for (let index = 0; index < 2; index += 1) {
      await tools
        .getByRole('button', { name: '删除当前条', exact: true })
        .click()
    }
    assert.equal(await group(key).count(), 0, '空组不输出标题')
    await expectBlanks(page, 0)
    await name.fill('暂存空组')
    await page.getByText('本窗口内容已保存', { exact: true }).waitFor()
    await page.reload()
    await page.locator('.erp-print-shell--ready').waitFor()
    await expandPrintToolSection(page, '条款编辑')
    await select.selectOption(key)
    assert.equal(await name.inputValue(), '暂存空组')
    assert.equal(await group(key).count(), 0)
    await tools.getByRole('button', { name: '新增条目', exact: true }).click()
    await expectBlanks(page, 1)
    await tools.getByRole('button', { name: '删除分组', exact: true }).click()
    await expectBlanks(page, 0)
    assert.equal(await select.locator(`option[value="${key}"]`).count(), 0)
    for (let index = 0; index < 3; index += 1) {
      await tools.getByRole('button', { name: '删除分组', exact: true }).click()
    }
    assert.equal(await paper.locator('[data-print-clause-group]').count(), 0)
    assert.equal(await select.isEnabled(), false)
    assert.equal(await name.count(), 0)
    assert.equal(
      await tools
        .getByRole('button', { name: '新增条目', exact: true })
        .count(),
      0
    )
    await page.getByText('本窗口内容已保存', { exact: true }).waitFor()
    await page.reload()
    await page.locator('.erp-print-shell--ready').waitFor()
    assert.equal(
      await paper.locator('[data-print-clause-group]').count(),
      0,
      '刷新不补回已删除的所有分组'
    )
    await expandPrintToolSection(page, '条款编辑')
    await tools.getByRole('button', { name: '新增分组', exact: true }).click()
    const restoredKey = await select.inputValue()
    await name.fill('补充要求')
    await expectBlanks(page, 1)
    assert.equal((await title(restoredKey).innerText()).trim(), '补充要求')
    if (other) {
      assert.equal(
        await other.innerText(),
        untouched,
        '批量分组操作仅影响当前合同'
      )
    }
    await page.screenshot({
      path: path.join(outputDir, `print-groups-${label}.png`),
    })
    if (prefix === 'processing') {
      await page.setViewportSize({ width: 3840, height: 2160 })
      await page.screenshot({
        path: path.join(outputDir, 'print-groups-processing-4k.png'),
      })
      await page.setViewportSize({ width: 1440, height: 960 })
    }
    await assertPrintPreviewPopup(page, {
      buttonName: '在线预览 PDF',
      title: batch
        ? '采购合同批量 PDF 预览'
        : `${prefix === 'material' ? '采购合同' : '加工合同'} PDF 预览`,
      screenshotName: `print-groups-${label}-preview`,
    })
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: '下载 PDF', exact: true }).click()
    await download
    for (const { html } of payloads) {
      const data = await page.evaluate((source) => {
        const doc = new DOMParser().parseFromString(source, 'text/html')
        const first = doc.querySelector(
          '.erp-material-contract-paper, .erp-processing-contract-paper'
        )
        return {
          controls: doc.body.querySelectorAll(
            'button,input,select,[data-print-tool],[data-print-editor-only],[data-print-blank-notice]'
          ).length,
          text: first.textContent,
          groupCount: first.querySelectorAll('[data-print-clause-group]')
            .length,
        }
      }, html)
      assert.equal(data.controls, 0)
      if (html === payloads.at(-1).html) {
        assert.equal(data.groupCount, 1)
        assert(data.text.includes('补充要求'))
        assert(!/来货要求|合同约定|结算方式|点击填写|查看留白/u.test(data.text))
      }
    }
    await page.evaluate(() => {
      window.__GROUP_PRINT_CALLS__ = 0
      window.print = () => {
        window.__GROUP_PRINT_CALLS__ += 1
      }
    })
    await page.getByRole('button', { name: '打印', exact: true }).click()
    await page.waitForFunction(() => window.__GROUP_PRINT_CALLS__ === 1)
    await page.emulateMedia({ media: 'print' })
    assert.equal(await tools.isVisible(), false)
    assert.equal(await notice.isVisible(), false)
    await page.emulateMedia({ media: 'screen' })
  }

  return [
    {
      name: 'print-workspace-custom-clause-groups',
      path: '/erp/print-workspace/material-purchase-contract?state=groups-purchase',
      auth: 'admin',
      viewport: { width: 1440, height: 960 },
      verify: async (page) => {
        for (const [key, prefix] of [
          ['material-purchase-contract', 'material'],
          ['processing-contract', 'processing'],
        ]) {
          await gotoScenarioPath(
            page,
            `/erp/print-workspace/${key}?state=custom-groups-${prefix}`
          )
          await page.locator('.erp-print-shell--ready').waitFor()
          await exercise(page, prefix, prefix)
        }
      },
    },
    {
      name: 'print-workspace-batch-custom-clause-groups',
      path: '/erp/print-workspace/material-purchase-contract?state=group-batch-launcher',
      auth: 'admin',
      viewport: { width: 1440, height: 960 },
      verify: async (launcher) => {
        let page
        try {
          const popup = launcher.waitForEvent('popup')
          await launcher.evaluate(async () => {
            const root = '/src/erp'
            const { openPrintWorkspaceWindow } = await import(
              `${root}/utils/printWorkspace.js`
            )
            const { getPrintWorkspaceDraftScope } = await import(
              `${root}/utils/printWorkspaceScope.mjs`
            )
            const { getPrintTemplateByKey } = await import(
              `${root}/config/printTemplates.mjs`
            )
            const { sample } = getPrintTemplateByKey(
              'material-purchase-contract'
            )
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
                  orderNo: `QA-GROUP-${id}`,
                  draft: {
                    ...structuredClone(sample),
                    contractNo: `QA-GROUP-${id}`,
                  },
                })),
              },
            })
          })
          page = await popup
          await page.locator('.erp-print-shell--ready').waitFor()
          await exercise(page, 'material', 'batch', true)
        } finally {
          if (page && !page.isClosed()) await page.close()
        }
      },
    },
  ]
}
