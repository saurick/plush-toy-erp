import {
  assertBusinessFormPage,
  closeBusinessFormPage,
} from './businessFormPageAssertions.mjs'
import { styleRpcResult } from './rpcMockResult.mjs'
import { createBOMImportWorkbookFixture } from './bomImportWorkbookFixture.mjs'

async function waitForMaterialDropdown(page) {
  const dropdown = page.locator('.ant-select-dropdown:visible')
  await dropdown.waitFor({ state: 'visible' })
  await page.waitForFunction(() =>
    [...document.querySelectorAll('.ant-select-dropdown')].some(
      (node) =>
        node.getBoundingClientRect().height > 0 &&
        getComputedStyle(node).opacity === '1'
    )
  )
  return dropdown
}

export async function verifyBOMMaterialGroups(
  page,
  { assert, expectHeading, expectText }
) {
  await expectHeading(page, '物料清单（BOM）')
  await expectText(page, 'BOM-STYLE-DRAFT')
  await page.getByText('BOM-STYLE-DRAFT', { exact: true }).dblclick()
  const modal = page
    .locator('.erp-business-form-page:not([hidden])')
    .filter({ hasText: '编辑 BOM 草稿' })
    .last()
  await modal.waitFor({ state: 'visible' })
  const groups = modal.locator('.erp-bom-material-group')
  await groups.first().waitFor({ state: 'visible' })
  assert.equal(await groups.count(), 3)
  assert.equal(
    await page.getByRole('button', { name: /^新建物料/ }).count(),
    0,
    'material creation is only offered inside the open material dropdown'
  )
  assert.equal(
    await modal.getByText('生产工序归属', { exact: true }).count(),
    0
  )
  await modal.locator('input[id$="quantity_text"]').fill('1012')
  const first = groups.first()
  await first.getByLabel('单位用量 1', { exact: true }).fill('0.125')
  await first.getByLabel('损耗 % 1', { exact: true }).fill('10')
  await first.getByText('139.15', { exact: true }).waitFor({ state: 'visible' })
  await first.getByRole('button', { name: '＋ 添加部位', exact: true }).click()
  assert.equal(
    await groups.count(),
    3,
    'adding a part must not ask for the material again'
  )
  assert.equal(await first.locator('tr[data-bom-part-index]').count(), 2)
  assert.equal(await first.locator('input[aria-label^="物料名称 "]').count(), 1)
  await first.getByLabel('部位 2', { exact: true }).fill('耳朵')
  await first.getByLabel('单位用量 2', { exact: true }).fill('0.025')
  await first.getByLabel('损耗 % 2', { exact: true }).fill('5')
  await first.getByLabel('部位 2', { exact: true }).evaluate((input) => {
    const data = new DataTransfer()
    data.setData(
      'text/plain',
      '耳朵\t2\t0.025\t5\t裁片\t车缝\n尾巴\t1\t0.015\t0'
    )
    input.dispatchEvent(
      new ClipboardEvent('paste', {
        clipboardData: data,
        bubbles: true,
        cancelable: true,
      })
    )
  })
  await first
    .getByLabel('部位 3', { exact: true })
    .waitFor({ state: 'visible' })
  assert.equal(
    await first.getByLabel('单位用量 3', { exact: true }).inputValue(),
    '0.015'
  )
  const metrics = await modal.evaluate((node) => {
    const group = node.querySelector('.erp-bom-material-group')
    const scroller = group.closest('.erp-bom-parts-scroll')
    return {
      editorWidth: node.clientWidth,
      scrollWidth: scroller.clientWidth,
      tableHeadCount: node.querySelectorAll('.erp-bom-parts-table thead')
        .length,
      materialRowSpan: group.querySelector('td').rowSpan,
      groupWidth: group.getBoundingClientRect().width,
      scrollable: getComputedStyle(scroller).overflowX,
      ancestors: Array.from(
        (function* parentElements() {
          for (let p = group; p && p !== node; p = p.parentElement) yield p
        })()
      ).map((p) => ({
        class: p.className,
        width: p.getBoundingClientRect().width,
        minWidth: getComputedStyle(p).minWidth,
        display: getComputedStyle(p).display,
        columns: getComputedStyle(p).gridTemplateColumns,
      })),
    }
  })
  assert.ok(metrics.scrollWidth <= metrics.editorWidth, JSON.stringify(metrics))
  assert.equal(metrics.tableHeadCount, 1)
  assert.equal(metrics.materialRowSpan, 4)
  assert.equal(await page.locator('.ant-modal-mask:visible').count(), 0)
  assert.equal(metrics.scrollable, 'auto')
  return modal
}

export function createBOMMaterialGroupsScenarios(deps) {
  let saves = []
  let releaseSave
  let saveAttempts = 0
  const scenarios = [
    {
      name: 'bom-material-groups-desktop',
      path: '/erp/purchase/material-bom',
      auth: 'admin',
      effectiveSession: deps.customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 900 },
      beforeNavigate: async (page) => {
        saves = []
        await page.route('**/rpc/bom', async (route) => {
          const request = route.request().postDataJSON()
          if (request.method === 'save_bom_with_items') {
            saves.push(request.params)
          }
          await route.fallback()
        })
      },
      verify: async (page) => {
        const modal = await verifyBOMMaterialGroups(page, deps)
        await page.screenshot({
          path: `${deps.outputDir}/bom-material-groups-form${page.viewportSize().width < 600 ? '-mobile' : ''}.png`,
          fullPage: true,
        })
        const material = modal.getByRole('combobox', {
          name: '物料名称 1',
          exact: true,
        })
        await material.press('ArrowDown')
        const dropdown = await waitForMaterialDropdown(page)
        await dropdown
          .getByRole('button', { name: '新建物料并使用', exact: true })
          .waitFor({ state: 'visible' })
        const theme = await page.locator('html').getAttribute('data-erp-theme')
        await page.screenshot({
          path: `${deps.outputDir}/bom-material-dropdown-${theme}-${page.viewportSize().width}.png`,
          fullPage: true,
        })
        await material.press('Escape')
        await dropdown.waitFor({ state: 'hidden' })
        await modal
          .locator('.erp-business-form-page__footer .ant-btn-primary')
          .last()
          .click()
        await modal.waitFor({ state: 'hidden', timeout: 10000 })
        deps.assert.equal(saves.length, 1)
        deps.assert.equal(saves[0].items.length, 5)
        const materialOne = saves[0].items.filter(
          (item) => item.material_id === 1
        )
        deps.assert.equal(materialOne.length, 3)
        deps.assert.equal(materialOne[0].loss_rate, '0.1')
        deps.assert.equal(materialOne[1].loss_rate, '0.05')
        deps.assert.equal(materialOne[0].unit_id, materialOne[1].unit_id)
      },
    },
  ]
  return [
    ...scenarios,
    {
      name: 'bom-xlsx-merged-remarks',
      path: '/erp/purchase/material-bom',
      auth: 'admin',
      effectiveSession: deps.customerRuntimeEffectiveSession,
      viewport: { width: 1920, height: 1080 },
      verify: async (page) => {
        await page
          .locator('button[data-business-action-key="import-bom-xlsx"]:enabled')
          .waitFor()
        await page.getByLabel('选择 BOM Excel 文件').setInputFiles({
          name: 'BOM-MERGED-REMARKS.xlsx',
          mimeType:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          buffer: createBOMImportWorkbookFixture({ mergedNotes: true }),
        })
        const editor = page.locator('.erp-business-form-page:not([hidden])')
        await editor.waitFor({ state: 'visible' })
        deps.assert.equal(
          await editor.locator('tr[data-bom-part-index]').count(),
          2
        )
        deps.assert.equal(
          await editor.getByLabel('加工基础 1', { exact: true }).inputValue(),
          ''
        )
        deps.assert.equal(
          await editor.getByLabel('加工方式 1', { exact: true }).inputValue(),
          ''
        )
        deps.assert.equal(
          await editor.getByLabel('备注 1', { exact: true }).inputValue(),
          '衣片、披肩与腰带按尺寸配套,每端保留缝合位置。'.repeat(3)
        )
        deps.assert.equal(
          await editor.getByLabel('加工基础 2', { exact: true }).inputValue(),
          '布底贴12g衬'
        )
        deps.assert.equal(
          await editor.getByLabel('加工方式 2', { exact: true }).inputValue(),
          ''
        )
        deps.assert.equal(
          await editor.getByLabel('备注 2', { exact: true }).inputValue(),
          '长度61mm,每端留一个孔'
        )
        await page.waitForFunction(() =>
          [...document.querySelectorAll('.erp-bom-parts-table textarea')].every(
            (node) =>
              node.scrollHeight <= node.clientHeight + 1 &&
              node.scrollWidth <= node.clientWidth + 1
          )
        )
        await editor
          .locator('.erp-bom-material-groups')
          .screenshot({
            path: `${deps.outputDir}/bom-xlsx-merged-remarks-expanded.png`,
          })
        await closeBusinessFormPage(page, editor)
      },
    },
    {
      name: 'bom-xlsx-import-material-groups',
      path: '/erp/purchase/material-bom',
      auth: 'admin',
      effectiveSession: deps.customerRuntimeEffectiveSession,
      viewport: { width: 1920, height: 1080 },
      verify: async (page) => {
        const { assert } = deps
        await deps.expectHeading(page, '物料清单（BOM）')
        await page
          .locator('button[data-business-action-key="import-bom-xlsx"]:enabled')
          .waitFor()
        await page.getByLabel('选择 BOM Excel 文件').setInputFiles({
          name: 'BOM-GROUPED-IMPORT.xlsx',
          mimeType:
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          buffer: createBOMImportWorkbookFixture({ grouped: true }),
        })
        const editor = page
          .locator('.erp-business-form-page:not([hidden])')
          .last()
        await editor.waitFor({ state: 'visible' })
        await deps.expectText(page, '已读取 4 条 BOM 明细')
        const groups = editor.locator('.erp-bom-material-group')
        assert.equal(await groups.count(), 3)
        const unresolved = groups.nth(1)
        const parts = unresolved.locator('tr[data-bom-part-index]')
        assert.equal(await parts.count(), 2)
        assert.equal(
          await unresolved
            .getByRole('combobox', { name: /^物料名称 / })
            .count(),
          1
        )
        await unresolved.getByText('尚未建档材料', { exact: true }).waitFor()
        await unresolved.getByText('SUP-MISSING', { exact: true }).waitFor()
        await unresolved.getByText('测试规格', { exact: true }).waitFor()
        assert.equal(
          await unresolved
            .getByLabel('加工基础 3', { exact: true })
            .inputValue(),
          '贴衬'
        )
        assert.equal(
          await unresolved
            .getByLabel('加工方式 3', { exact: true })
            .inputValue(),
          '激光'
        )
        assert.equal(
          await parts.nth(1).locator('.erp-bom-number-cell').innerText(),
          '13.580247'
        )
        assert.ok((await unresolved.innerText()).includes('总用量：113.580247'))
        await unresolved.getByLabel('单位用量 3', { exact: true }).fill('0.25')
        await parts.nth(1).getByText('27.5', { exact: true }).waitFor()

        await unresolved
          .getByRole('button', { name: '＋ 添加部位', exact: true })
          .click()
        assert.equal(await groups.count(), 3)
        assert.equal(await parts.count(), 3)
        await parts
          .last()
          .getByRole('button', { name: '移除', exact: true })
          .click()
        await parts
          .first()
          .getByRole('button', { name: '复制', exact: true })
          .click()
        assert.equal(await groups.count(), 3)
        assert.equal(await parts.count(), 3)
        await parts
          .nth(1)
          .getByRole('button', { name: '移除', exact: true })
          .click()
        assert.equal(await parts.count(), 2)

        await editor
          .locator('.erp-bom-material-groups__heading')
          .scrollIntoViewIfNeeded()
        await editor.locator('.erp-bom-parts-scroll').evaluate((node) => {
          node.scrollLeft = 0
        })
        const metrics = await editor
          .locator('.erp-bom-parts-scroll')
          .evaluate((node) => ({
            overflow:
              document.documentElement.scrollWidth -
              document.documentElement.clientWidth,
            contained:
              node.clientWidth <=
              node.closest('.erp-business-form-page').clientWidth,
            rowSpan: node.querySelectorAll('tbody')[1].querySelector('td')
              .rowSpan,
            overflowX: getComputedStyle(node).overflowX,
          }))
        assert.deepEqual(metrics, {
          overflow: 0,
          contained: true,
          rowSpan: 3,
          overflowX: 'auto',
        })
        await page.screenshot({
          path: `${deps.outputDir}/bom-import-grouped-source.png`,
          fullPage: true,
        })

        const materialSelect = unresolved.getByRole('combobox', {
          name: '物料名称 2',
          exact: true,
        })
        await materialSelect.fill('MAT-STYLE-L1')
        await materialSelect.press('Enter')
        await page.waitForFunction(
          () =>
            document.querySelectorAll('.erp-bom-material-group').length === 2
        )
        assert.equal(
          await groups.first().locator('tr[data-bom-part-index]').count(),
          3
        )
        assert.equal(
          await editor
            .locator('[data-bom-import-row-status="unresolved"]')
            .count(),
          1
        )
        assert.equal(
          await groups
            .first()
            .getByText('SUP-MISSING', { exact: true })
            .count(),
          0
        )

        await groups
          .first()
          .locator('.ant-select-clear')
          .first()
          .click({ force: true })
        await page.waitForFunction(
          () =>
            document.querySelectorAll('.erp-bom-material-group').length === 3
        )
        assert.equal(
          await unresolved.locator('tr[data-bom-part-index]').count(),
          2
        )
        await unresolved.getByText('SUP-MISSING', { exact: true }).waitFor()
        await unresolved.getByText('测试规格', { exact: true }).waitFor()
      },
    },
    {
      ...scenarios[0],
      name: 'bom-page-save-failure-retry',
      beforeNavigate: async (page) => {
        saveAttempts = 0
        releaseSave = null
        await page.route('**/rpc/bom', async (route) => {
          const { id, method } = route.request().postDataJSON()
          if (method !== 'save_bom_with_items') return route.fallback()
          saveAttempts += 1
          if (saveAttempts !== 1) return route.fallback()
          await new Promise((resolve) => {
            releaseSave = resolve
          })
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              jsonrpc: '2.0',
              id,
              result: {
                code: 40010,
                message: '模拟保存失败，请重试',
                data: {},
              },
            }),
          })
        })
      },
      verify: async (page) => {
        const editor = await verifyBOMMaterialGroups(page, deps)
        const save = editor.locator(
          '.erp-business-form-page__footer .ant-btn-primary'
        )
        await save.click()
        await page.waitForFunction(
          () =>
            document
              .querySelector('.erp-business-form-page:not([hidden])')
              ?.getAttribute('aria-busy') === 'true'
        )
        deps.assert.equal(
          await editor
            .getByRole('button', { name: '返回列表', exact: true })
            .isDisabled(),
          true
        )
        await save.click({ force: true })
        await page.getByRole('button', { name: '刷新当前页' }).click()
        deps.assert.equal(saveAttempts, 1)
        deps.assert.equal(
          await editor
            .locator('.erp-business-form-page__body')
            .getAttribute('inert'),
          ''
        )
        releaseSave()
        await page.waitForFunction(
          () =>
            document
              .querySelector('.erp-business-form-page:not([hidden])')
              ?.getAttribute('aria-busy') === 'false'
        )
        deps.assert.equal(await editor.getAttribute('data-unsaved'), 'true')
        deps.assert.equal(
          await editor.getByLabel('单位用量 1', { exact: true }).inputValue(),
          '0.125'
        )
        await save.click()
        await editor.waitFor({ state: 'hidden' })
        deps.assert.equal(saveAttempts, 2)
      },
    },
    {
      ...scenarios[0],
      name: 'bom-page-editing-responsiveness',
      verify: async (page) => {
        await page.getByText('BOM-STYLE-DRAFT', { exact: true }).dblclick()
        const editor = page.locator('.erp-business-form-page:not([hidden])')
        await editor.getByLabel('部位 1', { exact: true }).evaluate((input) => {
          const data = new DataTransfer()
          data.setData(
            'text/plain',
            Array.from(
              { length: 198 },
              (_, i) => `部位${i + 1}\t1\t0.1\t5\t裁片\t激光\t备注`
            ).join('\n')
          )
          input.dispatchEvent(
            new ClipboardEvent('paste', {
              clipboardData: data,
              bubbles: true,
              cancelable: true,
            })
          )
        })
        await editor.getByLabel('部位 200', { exact: true }).waitFor()
        await editor.evaluate((node) => {
          window.__BOM_INPUT_PERFORMANCE__ = { samples: [] }
          node.addEventListener(
            'input',
            (event) => {
              const started = performance.now()
              const label =
                event.target.getAttribute('aria-label') || event.target.id
              requestAnimationFrame(() => {
                window.__BOM_INPUT_PERFORMANCE__.samples.push({
                  label,
                  duration: performance.now() - started,
                })
              })
            },
            true
          )
        })
        const quantity = editor.getByLabel('单位用量 100', { exact: true })
        await quantity.fill('0.')
        await quantity.pressSequentially('123456')
        deps.assert.equal(await quantity.inputValue(), '0.123456')
        const note = editor.locator('textarea').first()
        await note.fill('')
        await note.pressSequentially('typingcheck')
        deps.assert.equal(await note.inputValue(), 'typingcheck')
        const metrics = await page.evaluate(async () => {
          await new Promise((resolve) => requestAnimationFrame(resolve))
          const { samples } = window.__BOM_INPUT_PERFORMANCE__
          return {
            rows: document.querySelectorAll('tr[data-bom-part-index]').length,
            samples,
            averageMs:
              samples.reduce((sum, item) => sum + item.duration, 0) /
              samples.length,
            maxMs: Math.max(...samples.map((item) => item.duration)),
          }
        })
        console.log(
          `[style:l1] bom-editing-performance=${JSON.stringify(metrics)}`
        )
        deps.assert.equal(metrics.rows, 200)
        deps.assert.ok(
          metrics.samples.length >= 16,
          'capture continuous typing, not only a bulk fill'
        )
        deps.assert.ok(
          metrics.averageMs <= 100,
          `typing average exceeded 100 ms: ${JSON.stringify(metrics)}`
        )
        deps.assert.ok(
          metrics.maxMs <= 200,
          `a keystroke exceeded 200 ms: ${JSON.stringify(metrics)}`
        )
        await closeBusinessFormPage(page, editor)
      },
    },
    {
      ...scenarios[0],
      name: 'bom-page-editing-derived-values',
      verify: async (page) => {
        const editor = await verifyBOMMaterialGroups(page, deps)
        const group = editor.locator('.erp-bom-material-group').first()
        const row = (index) =>
          group.locator('tr[data-bom-part-index]').nth(index)
        await editor.getByLabel('单位用量 2', { exact: true }).fill('0.037')
        await editor.getByLabel('备注 2', { exact: true }).fill('修改后复制')
        await row(1).getByText('39.3162', { exact: true }).waitFor()
        await row(1).getByRole('button', { name: '复制', exact: true }).click()
        deps.assert.equal(
          await editor.getByLabel('单位用量 3', { exact: true }).inputValue(),
          '0.037'
        )
        deps.assert.equal(
          await editor.getByLabel('损耗 % 3', { exact: true }).inputValue(),
          '5'
        )
        deps.assert.equal(
          await editor.getByLabel('备注 3', { exact: true }).inputValue(),
          '修改后复制'
        )
        await row(1).getByRole('button', { name: '移除', exact: true }).click()
        await row(1).getByText('39.3162', { exact: true }).waitFor()
        await editor.locator('input[id$="quantity_text"]').fill('2024')
        await row(1).getByText('78.6324', { exact: true }).waitFor()
        await row(0).getByRole('button', { name: '移除', exact: true }).click()
        deps.assert.equal(
          await editor.getByLabel('单位用量 1', { exact: true }).inputValue(),
          '0.037'
        )
        await row(0).getByText('78.6324', { exact: true }).waitFor()
        await group.getByText('0.052', { exact: false }).waitFor()
        deps.assert.equal(
          await group.locator('input[aria-label^="物料名称 "]').count(),
          1
        )
        await closeBusinessFormPage(page, editor)
      },
    },
    {
      ...scenarios[0],
      name: 'bom-page-many-parts-and-readonly',
      verify: async (page) => {
        await page.getByText('BOM-STYLE-DRAFT', { exact: true }).dblclick()
        const editor = page.locator('.erp-business-form-page:not([hidden])')
        await editor.getByLabel('部位 1', { exact: true }).evaluate((input) => {
          const data = new DataTransfer()
          data.setData(
            'text/plain',
            Array.from(
              { length: 198 },
              (_, i) => `部位${i + 1}\t1\t0.1\t5\t裁片\t激光\t长备注边界`
            ).join('\n')
          )
          input.dispatchEvent(
            new ClipboardEvent('paste', {
              clipboardData: data,
              bubbles: true,
              cancelable: true,
            })
          )
        })
        await editor.getByLabel('部位 200', { exact: true }).waitFor()
        deps.assert.equal(
          await editor.locator('tr[data-bom-part-index]').count(),
          200
        )
        deps.assert.equal(
          await editor
            .getByRole('button', { name: '＋ 添加物料', exact: true })
            .isDisabled(),
          true
        )
        deps.assert.equal(
          await editor
            .getByRole('button', { name: '＋ 添加部位', exact: true })
            .first()
            .isDisabled(),
          true
        )
        await assertBusinessFormPage(page, editor)
        await closeBusinessFormPage(page, editor)
        await page.getByText('BOM-STYLE-L1', { exact: true }).dblclick()
        await editor
          .getByRole('heading', { name: '查看 BOM 版本', exact: true })
          .waitFor()
        deps.assert.equal(
          await editor
            .locator('.erp-business-form-page__footer .ant-btn-primary')
            .count(),
          0
        )
        deps.assert.equal(
          await editor
            .getByRole('button', { name: '＋ 添加部位', exact: true })
            .count(),
          0
        )
        deps.assert.equal(
          await editor.getByLabel('单位用量 1', { exact: true }).isDisabled(),
          true
        )
        deps.assert.equal(
          await editor
            .getByRole('combobox', { name: '物料名称 1', exact: true })
            .isDisabled(),
          true
        )
        await closeBusinessFormPage(page, editor)
      },
    },
    {
      ...scenarios[0],
      name: 'bom-page-wide-desktop',
      viewport: { width: 1920, height: 1080 },
      verify: async (page) => {
        const editor = await verifyBOMMaterialGroups(page, deps)
        await editor
          .locator('.erp-business-form-page__body')
          .evaluate((node) => {
            node.scrollTop = 0
          })
        await editor
          .getByRole('heading', { name: '编辑 BOM 草稿', exact: true })
          .focus()
        await assertBusinessFormPage(page, editor)
        await page.screenshot({
          path: `${deps.outputDir}/bom-full-page-editor.png`,
          fullPage: true,
        })
        await closeBusinessFormPage(page, editor)
      },
    },

    {
      ...scenarios[0],
      name: 'bom-material-create-and-reuse-desktop',
      beforeNavigate: async (page) => {
        await scenarios[0].beforeNavigate(page)
        await page.route('**/rpc/masterdata', async (route) => {
          const { id, method, params } = route.request().postDataJSON()
          if (method !== 'create_material') return route.fallback()
          deps.assert.equal(params.supplier_id, 1)
          deps.assert.equal(params.supplier_item_no, 'Q-001')
          deps.assert.equal(params.color, 'C01 米白')
          deps.assert.equal(params.default_unit_id, 1)
          deps.assert.equal(params.stock_category, 'MAIN')
          deps.assert.equal(params.default_warehouse_id, 1)
          return route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              jsonrpc: '2.0',
              id,
              result: styleRpcResult({
                material: {
                  ...params,
                  id: 77,
                  supplier_name: '样式供应商',
                  is_active: true,
                },
              }),
            }),
          })
        })
      },
      verify: async (page) => {
        const modal = await verifyBOMMaterialGroups(page, deps)
        const material = modal.getByRole('combobox', {
          name: '物料名称 1',
          exact: true,
        })
        const selectedMaterial = modal
          .locator('.erp-bom-material-group')
          .first()
          .locator('.ant-select-selection-item')
          .first()
        const originalMaterial = await selectedMaterial.innerText()
        const dropdown = page.locator('.ant-select-dropdown:visible')
        const createButton = dropdown.getByRole('button', {
          name: '新建物料并使用',
          exact: true,
        })
        await material.press('ArrowDown')
        await waitForMaterialDropdown(page)
        await createButton.waitFor({ state: 'visible' })
        deps.assert.equal(await createButton.count(), 1)
        const popupBox = await dropdown.boundingBox()
        const buttonBox = await createButton.boundingBox()
        deps.assert.ok(buttonBox.x >= popupBox.x)
        deps.assert.ok(
          buttonBox.x + buttonBox.width <= popupBox.x + popupBox.width
        )
        deps.assert.ok(
          buttonBox.y + buttonBox.height <= popupBox.y + popupBox.height
        )
        await page.screenshot({
          path: `${deps.outputDir}/bom-material-create-dropdown.png`,
          fullPage: true,
        })
        await material.press('Tab')
        await page.waitForFunction(
          () => document.activeElement?.textContent.trim() === '新建物料并使用'
        )
        await createButton.press('Enter')
        const create = page
          .getByRole('dialog')
          .filter({ hasText: '新建物料并使用' })
          .last()
        await create.waitFor({ state: 'visible' })
        await dropdown.waitFor({ state: 'hidden' })
        await create.locator('.ant-modal-footer .ant-btn-default').click()
        await create.waitFor({ state: 'hidden' })
        await page.waitForFunction(
          () =>
            document.activeElement?.getAttribute('aria-label') === '物料名称 1'
        )
        deps.assert.equal(await selectedMaterial.innerText(), originalMaterial)
        deps.assert.equal(await dropdown.count(), 0)
        await material.fill('找不到的模拟物料')
        await dropdown.locator('.ant-select-item-empty').waitFor()
        await createButton.click()
        await create.waitFor({ state: 'visible' })
        await create.locator('input[id="name"]').fill('模拟新建短毛绒')
        await create
          .locator('.ant-select')
          .filter({ has: page.getByLabel('库存类别', { exact: true }) })
          .locator('.ant-select-selector')
          .click()
        await page
          .locator('.ant-select-dropdown:visible')
          .getByText('主料', { exact: true })
          .click()
        await create.getByLabel('默认入库仓', { exact: true }).click()
        await page
          .locator('.ant-select-dropdown:visible')
          .getByText('样式仓库（主料仓）', { exact: true })
          .click()
        const defaultWarehouse = create
          .locator('.ant-form-item')
          .filter({ has: page.getByLabel('默认入库仓', { exact: true }) })
        deps.assert.equal(
          await defaultWarehouse.locator('.ant-select-selection-item').count(),
          1
        )
        await create
          .locator('.ant-select')
          .filter({ has: page.getByLabel('库存类别', { exact: true }) })
          .locator('.ant-select-selector')
          .click()
        await page
          .locator('.ant-select-dropdown:visible')
          .getByText('辅料', { exact: true })
          .click()
        deps.assert.equal(
          await defaultWarehouse.locator('.ant-select-selection-item').count(),
          0
        )
        await create
          .locator('.ant-select')
          .filter({ has: page.getByLabel('库存类别', { exact: true }) })
          .locator('.ant-select-selector')
          .click()
        await page
          .locator('.ant-select-dropdown:visible')
          .getByText('主料', { exact: true })
          .click()
        await create.getByLabel('默认入库仓', { exact: true }).click()
        await page
          .locator('.ant-select-dropdown:visible')
          .getByText('样式仓库（主料仓）', { exact: true })
          .click()
        await create.getByLabel('厂商', { exact: true }).click()
        await page
          .locator('.ant-select-dropdown:visible')
          .getByText('SUP-STYLE-L1 / 样式供应商', { exact: true })
          .click()
        await create.locator('input[id="supplier_item_no"]').fill('Q-001')
        await create
          .locator('.erp-material-color-suggested-input input')
          .fill('C01 米白')
        await create.locator('input[id="spec"]').fill('1.5 米宽')
        await create.getByLabel('默认单位', { exact: true }).click()
        await create.getByLabel('默认单位', { exact: true }).press('ArrowDown')
        await create.getByLabel('默认单位', { exact: true }).press('Enter')
        await create.locator('input[id="spec"]').focus()
        await page.waitForFunction(() =>
          [...document.querySelectorAll('.ant-select-dropdown')].every(
            (node) => getComputedStyle(node).display === 'none'
          )
        )
        await page.screenshot({
          path: `${deps.outputDir}/bom-material-classification-form.png`,
          fullPage: true,
        })
        await create.locator('.ant-modal-footer .ant-btn-primary').click()
        await create.waitFor({ state: 'hidden', timeout: 10000 })
        const first = modal.locator('.erp-bom-material-group').first()
        await page.screenshot({
          path: `${deps.outputDir}/bom-material-created-and-reused.png`,
          fullPage: true,
        })
        deps.assert.ok(
          (
            await first.locator('.erp-bom-material-cell__context').innerText()
          ).includes('样式供应商'),
          await first.innerText()
        )
        deps.assert.equal(
          await first.locator('tr[data-bom-part-index]').count(),
          3
        )
        deps.assert.equal(
          await first.locator('input[aria-label^="物料名称 "]').count(),
          1
        )
        await first.getByLabel('部位 1', { exact: true }).focus()
        await page.screenshot({
          path: `${deps.outputDir}/bom-material-created-and-reused.png`,
          fullPage: true,
        })
        await modal
          .locator('.erp-business-form-page__footer .ant-btn-primary')
          .last()
          .click()
        await modal.waitFor({ state: 'hidden', timeout: 10000 })
        deps.assert.equal(saves.length, 1)
        const parts = saves[0].items.filter((item) => item.material_id === 77)
        deps.assert.equal(parts.length, 3)
        deps.assert.ok(parts.every((item) => item.unit_id === 1))
        deps.assert.equal(saves[0].items.length, 5)
        deps.assert.equal(
          saves[0].items.filter((item) => item.material_id !== 77).length,
          2
        )
      },
    },
    {
      ...scenarios[0],
      name: 'bom-material-select-without-create-permission',
      adminProfile: {
        is_super_admin: false,
        permissions: deps.customerRuntimeEffectiveSession.actions.filter(
          (action) => action !== 'material.create'
        ),
      },
      verify: async (page) => {
        const editor = await verifyBOMMaterialGroups(page, deps)
        const material = editor.getByRole('combobox', {
          name: '物料名称 1',
          exact: true,
        })
        await material.press('ArrowDown')
        const dropdown = page.locator('.ant-select-dropdown:visible')
        await dropdown.waitFor({ state: 'visible' })
        deps.assert.equal(
          await dropdown.getByRole('button', { name: /^新建物料/ }).count(),
          0
        )
        deps.assert.ok(
          await dropdown.locator('.ant-select-item-option').count()
        )
        await material.press('Escape')
        await dropdown.waitFor({ state: 'hidden' })
        await closeBusinessFormPage(page, editor)
      },
    },
    { ...scenarios[0], name: 'bom-material-groups-dark', themeMode: 'dark' },
    {
      ...scenarios[0],
      name: 'bom-material-groups-mobile',
      viewport: { width: 390, height: 844 },
    },
  ]
}
