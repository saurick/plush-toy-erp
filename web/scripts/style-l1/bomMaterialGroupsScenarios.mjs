import { styleRpcResult } from './rpcMockResult.mjs'

export async function verifyBOMMaterialGroups(
  page,
  { assert, expectHeading, expectText }
) {
  await expectHeading(page, '物料清单（BOM）')
  await expectText(page, 'BOM-STYLE-DRAFT')
  await page.getByText('BOM-STYLE-DRAFT', { exact: true }).dblclick()
  const modal = page
    .getByRole('dialog')
    .filter({ hasText: '编辑 BOM 草稿' })
    .last()
  await modal.waitFor({ state: 'visible' })
  const groups = modal.locator('.erp-bom-material-group')
  await groups.first().waitFor({ state: 'visible' })
  assert.equal(await groups.count(), 3)
  assert.equal(
    await modal.getByText('生产工序归属', { exact: true }).count(),
    0
  )
  await modal.locator('input[id$="quantity_text"]').fill('1012')
  const first = groups.first()
  await first.getByLabel('单位用量 1', { exact: true }).fill('0.125')
  await first.getByLabel('损耗 % 1', { exact: true }).fill('10')
  await first.getByText('139.15', { exact: true }).waitFor({ state: 'visible' })
  await first.getByRole('button', { name: '添加同料部位', exact: true }).click()
  assert.equal(
    await groups.count(),
    3,
    'adding a part must not ask for the material again'
  )
  assert.equal(await first.locator('tbody tr').count(), 2)
  assert.equal(
    await first.locator('.erp-bom-material-group__header .ant-select').count(),
    1
  )
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
    const scroller = group.querySelector('.erp-bom-parts-scroll')
    return {
      modalWidth: node.clientWidth,
      groupWidth: group.getBoundingClientRect().width,
      scrollable: getComputedStyle(scroller).overflowX,
      ancestors: Array.from(
        (function* () {
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
  assert.ok(metrics.groupWidth <= metrics.modalWidth, JSON.stringify(metrics))
  assert.equal(metrics.scrollable, 'auto')
  return modal
}

export function createBOMMaterialGroupsScenarios(deps) {
  let saves = []
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
          if (request.method === 'save_bom_with_items')
            saves.push(request.params)
          await route.fallback()
        })
      },
      verify: async (page) => {
        const modal = await verifyBOMMaterialGroups(page, deps)
        await page.screenshot({
          path: `${deps.outputDir}/bom-material-groups-form${page.viewportSize().width < 600 ? '-mobile' : ''}.png`,
          fullPage: true,
        })
        await modal.locator('.ant-modal-footer .ant-btn-primary').last().click()
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
        await modal
          .locator('.erp-bom-material-group')
          .first()
          .getByRole('button', { name: '新建物料', exact: true })
          .click()
        const create = page
          .getByRole('dialog')
          .filter({ hasText: '新建物料并使用' })
          .last()
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
            await first.locator('.erp-bom-material-group__identity').innerText()
          ).includes('样式供应商'),
          await first.innerText()
        )
        deps.assert.equal(await first.locator('tbody tr').count(), 3)
        deps.assert.equal(
          await first
            .locator('.erp-bom-material-group__header .ant-select')
            .count(),
          1
        )
        await first.getByLabel('部位 1', { exact: true }).focus()
        await page.screenshot({
          path: `${deps.outputDir}/bom-material-created-and-reused.png`,
          fullPage: true,
        })
        await modal.locator('.ant-modal-footer .ant-btn-primary').last().click()
        await modal.waitFor({ state: 'hidden', timeout: 10000 })
        deps.assert.equal(saves.length, 1)
        const parts = saves[0].items.filter((item) => item.material_id === 77)
        deps.assert.equal(parts.length, 3)
        deps.assert.ok(parts.every((item) => item.unit_id === 1))
      },
    },
    {
      ...scenarios[0],
      name: 'bom-material-groups-mobile',
      viewport: { width: 390, height: 844 },
    },
  ]
}
