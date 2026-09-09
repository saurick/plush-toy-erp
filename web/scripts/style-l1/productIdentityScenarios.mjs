import assert from 'node:assert/strict'
import path from 'node:path'

async function installImages(page) {
  const image = await page.evaluate(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 400
    canvas.height = 480
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#e7f0eb'
    ctx.fillRect(0, 0, 400, 480)
    ctx.fillStyle = '#829e8c'
    for (const [x, y, r] of [
      [120, 110, 65],
      [280, 110, 65],
      [200, 230, 130],
      [200, 370, 90],
    ]) {
      ctx.beginPath()
      ctx.arc(x, y, r, 0, Math.PI * 2)
      ctx.fill()
    }
    return canvas.toDataURL('image/png').split(',')[1]
  })
  page.productImageProbe = { requests: [], fail: true, cleared: false }
  await page.route('**/rpc/attachment', async (route) => {
    const body = route.request().postDataJSON()
    const { method, params = {} } = body
    const probe = page.productImageProbe
    if (
      !['list_product_image_references', 'download_attachment'].includes(method)
    ) {
      return route.fallback()
    }
    probe.requests.push({ method, params })
    if (method === 'list_product_image_references') {
      if (probe.failReferences) {
        return route.fulfill({
          json: {
            jsonrpc: '2.0',
            id: body.id,
            result: { code: 500, message: '图片暂不可用' },
          },
        })
      }
      return route.fulfill({
        json: {
          jsonrpc: '2.0',
          id: body.id,
          result: {
            code: 0,
            message: '',
            data: {
              images: params.product_ids.map((id) => ({
                product_id: id,
                image_attachment_id:
                  id === 2 || (id === 1 && probe.cleared) ? 0 : 900000 + id,
              })),
            },
          },
        },
      })
    }
    if (params.id < 900000) return route.fallback()
    const failed = params.id === 900003 && probe.fail
    return route.fulfill({
      json: {
        jsonrpc: '2.0',
        id: body.id,
        result: {
          code: failed ? 500 : 0,
          message: failed ? '图片暂不可用' : '',
          data: failed
            ? {}
            : {
                attachment: {
                  id: params.id,
                  owner_type: 'product',
                  owner_id: params.id - 900000,
                  mime_type: 'image/png',
                  content_base64: image,
                },
              },
        },
      },
    })
  })
}

async function closeImage(page) {
  await page
    .getByRole('button', { name: '关闭图片预览', exact: true })
    .press('Escape')
  await page
    .locator('.erp-task-image-preview__stage')
    .waitFor({ state: 'detached' })
}

export function createProductIdentityScenarios({
  customerRuntimeEffectiveSession,
  outputDir,
}) {
  return [
    {
      name: 'product-identification-catalog',
      path: '/erp/master/products',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 1000 },
      beforeNavigate: async (page) => {
        await installImages(page)
        await page.route('**/rpc/masterdata', async (route) => {
          const body = route.request().postDataJSON()
          if (body.method !== 'list_products') return route.fallback()
          const products = Array.from({ length: 20 }, (_, i) => ({
            id: i + 1,
            code: `PRODUCT-${i + 1}`,
            name:
              i === 0 ? '识图长耳兔（可拆卸围巾礼盒款）' : `识图产品 ${i + 1}`,
            default_unit_id: 1,
            is_active: true,
          }))
          return route.fulfill({
            json: {
              jsonrpc: '2.0',
              id: body.id,
              result: { code: 0, message: '', data: { products, total: 20 } },
            },
          })
        })
      },
      verify: async (page) => {
        const row = page
          .locator('.ant-table-tbody tr')
          .filter({ hasText: 'PRODUCT-1' })
          .first()
        const button = row.getByRole('button', {
          name: '查看识图长耳兔（可拆卸围巾礼盒款）大图',
          exact: true,
        })
        await button.waitFor()
        const initialURL = page.url()
        assert.equal(
          page.productImageProbe.requests.some(
            (r) => r.method === 'download_attachment' && !r.params.variant
          ),
          false
        )
        await button.click()
        await page
          .getByRole('button', { name: '放大图片', exact: true })
          .waitFor()
        assert.equal(
          await page.locator('.ant-table-row-selected').count(),
          0,
          'preview must not select or open the product'
        )
        await closeImage(page)
        assert.equal(page.url(), initialURL)
        assert.equal(
          await button.evaluate((node) => node === document.activeElement),
          true
        )
        assert.ok(
          page.productImageProbe.requests
            .filter((r) => r.method === 'list_product_image_references')
            .some((r) => r.params.product_ids.length > 1),
          'visible rows are batched'
        )
        assert.ok(
          page.productImageProbe.requests
            .filter((r) => r.method === 'list_product_image_references')
            .every((r) => r.params.product_ids.length <= 80)
        )
        const empty = page
          .locator('.ant-table-tbody tr')
          .filter({ hasText: '识图产品 2' })
          .first()
        assert.equal(
          await empty.locator('.erp-task-product-image button').count(),
          0
        )
        const geometry = await row
          .locator('.erp-task-product-image')
          .evaluate((node) => ({
            width: node.getBoundingClientRect().width,
            height: node.getBoundingClientRect().height,
          }))
        assert.deepEqual(geometry, { width: 48, height: 48 })
        await page.screenshot({
          path: path.join(
            outputDir,
            'product-identification-catalog-desktop.png'
          ),
          fullPage: false,
        })
        page.productImageProbe.cleared = true
        await page
          .getByRole('button', { name: '刷新当前页', exact: false })
          .click()
        await button.waitFor({ state: 'detached' })
        assert.equal(
          await row.locator('.erp-task-product-image button').count(),
          0,
          'refresh must discard cleared image'
        )
        page.productImageProbe.cleared = false
        await page
          .getByRole('button', { name: '刷新当前页', exact: false })
          .click()
        await button.waitFor()
        await page.setViewportSize({ width: 520, height: 900 })
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1
          )
        )
      },
    },
    {
      name: 'product-identification-bom-selection',
      path: '/erp/purchase/material-bom',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 1000 },
      beforeNavigate: installImages,
      verify: async (page) => {
        await page
          .locator('.ant-table-tbody .erp-product-identity button')
          .first()
          .click()
        await closeImage(page)
        await page.getByRole('button', { name: '新建草稿' }).click()
        const modal = page
          .locator('.erp-business-action-modal--form.ant-modal:visible')
          .last()
        await modal.waitFor()
        await modal.getByRole('combobox', { name: /产品$/ }).click()
        const option = page
          .locator('.ant-select-dropdown:visible .ant-select-item-option')
          .first()
        await option.locator('.erp-task-product-image img').waitFor()
        assert.equal(
          await option.locator('.erp-task-product-image button').count(),
          0,
          'option images select the product instead of opening a nested dialog'
        )
        await option.click()
        const preview = modal
          .locator('.erp-product-identity .erp-task-product-image button')
          .first()
        await preview.click()
        await closeImage(page)
        await modal.screenshot({
          path: path.join(
            outputDir,
            'product-identification-bom-selection.png'
          ),
        })
        await modal
          .getByRole('combobox', { name: /产品$/ })
          .locator('..')
          .locator('..')
          .hover()
        await modal.locator('.ant-select-clear').first().click()
        assert.equal(
          await modal.locator('.erp-product-identity').count(),
          0,
          'clearing association removes the old image'
        )
        await modal.getByRole('button', { name: /取\s*消/ }).click()
      },
    },
    {
      name: 'product-identification-inventory',
      path: '/erp/warehouse/inventory',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 1000 },
      beforeNavigate: installImages,
      verify: async (page) => {
        for (const tab of [null, '库存批次', '库存变动记录']) {
          if (tab) {
            await page.getByRole('tab', { name: tab, exact: true }).click()
          }
          const button = page
            .locator('.ant-table-tbody .erp-product-identity button')
            .first()
          await button.click()
          await closeImage(page)
          assert.equal(await page.locator('.ant-table-row-selected').count(), 0)
          if (tab === '库存批次') {
            const material = page
              .locator('.ant-table-tbody tr')
              .filter({ hasText: 'INV-LOT-001' })
              .first()
            assert.equal(
              await material.locator('.erp-product-identity').count(),
              0,
              'material lots cannot borrow product images'
            )
          }
        }
        await page.screenshot({
          path: path.join(
            outputDir,
            'product-identification-inventory-desktop.png'
          ),
        })
      },
    },
    ...[
      { key: 'production', path: '/erp/production/orders' },
      { key: 'outsourcing', path: '/erp/purchase/processing-contracts' },
    ].map(({ key, path: route }) => ({
      name: `product-identification-${key}`,
      path: route,
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 1000 },
      beforeNavigate: installImages,
      verify: async (page) => {
        await page
          .getByRole('button', { name: /^展开.+明细/ })
          .first()
          .click()
        const image = page
          .getByRole('region', { name: '明细快速预览' })
          .locator('.erp-product-identity button')
          .first()
        await image.click()
        await closeImage(page)
        await page.screenshot({
          path: path.join(
            outputDir,
            `product-identification-${key}-desktop.png`
          ),
        })
      },
    })),
    {
      name: 'product-identification-shipment',
      path: '/erp/warehouse/shipments',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 1000 },
      beforeNavigate: installImages,
      verify: async (page) => {
        await page
          .locator('.ant-table-tbody tr')
          .filter({ hasText: 'SHIP-STYLE-L1' })
          .first()
          .click()
        await page.getByRole('button', { name: '查看明细' }).click()
        const modal = page.locator('.ant-modal:visible').last()
        await modal
          .locator('.erp-product-identity')
          .first()
          .scrollIntoViewIfNeeded()
        await modal.locator('.erp-product-identity button').first().click()
        await closeImage(page)
        assert.equal(await page.locator('.ant-modal:visible').count(), 1)
        await modal.screenshot({
          path: path.join(
            outputDir,
            'product-identification-shipment-desktop.png'
          ),
        })
      },
    },
    {
      name: 'product-identification-quality',
      path: '/erp/production/quality-inspections',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 1000 },
      beforeNavigate: async (page) => {
        await installImages(page)
        await page.route('**/rpc/quality', async (route) => {
          const body = route.request().postDataJSON()
          if (body.method !== 'list_quality_inspections') {
            return route.fallback()
          }
          const quality_inspections = [
            {
              id: 701,
              inspection_no: 'QI-PRODUCT-IMAGE',
              inspection_type: 'FINISHED_GOODS',
              subject_type: 'PRODUCT',
              subject_id: 1,
            },
            {
              id: 702,
              inspection_no: 'QI-WIP-IMAGE',
              inspection_type: 'PRODUCTION_STAGE',
              subject_type: 'PRODUCTION_WIP',
              subject_id: 91,
              product_id: 1,
            },
            {
              id: 703,
              inspection_no: 'QI-MATERIAL-IMAGE',
              inspection_type: 'INCOMING',
              subject_type: 'MATERIAL',
              subject_id: 1,
            },
          ].map((r) => ({
            ...r,
            status: 'SUBMITTED',
            source_type: 'MANUAL',
            warehouse_id: 1,
            inventory_lot_id: 402,
          }))
          return route.fulfill({
            json: {
              jsonrpc: '2.0',
              id: body.id,
              result: { code: 0, data: { quality_inspections, total: 3 } },
            },
          })
        })
      },
      verify: async (page) => {
        for (const number of ['QI-PRODUCT-IMAGE', 'QI-WIP-IMAGE']) {
          const row = page
            .locator('.ant-table-tbody tr')
            .filter({ hasText: number })
            .first()
          await row.locator('.erp-product-identity button').click()
          await closeImage(page)
        }
        const material = page
          .locator('.ant-table-tbody tr')
          .filter({ hasText: 'QI-MATERIAL-IMAGE' })
          .first()
        assert.equal(await material.locator('.erp-product-identity').count(), 0)
        assert.ok(
          page.productImageProbe.requests
            .filter((r) => r.method === 'list_product_image_references')
            .every((r) => r.params.product_ids.every((id) => id === 1)),
          'WIP batch IDs must never be used as product IDs'
        )
        await page.screenshot({
          path: path.join(
            outputDir,
            'product-identification-quality-desktop.png'
          ),
        })
      },
    },
    ...['retry', 'no-permission'].map((state) => ({
      name: `product-identification-${state}`,
      path: '/erp/warehouse/inventory',
      auth: 'admin',
      effectiveSession:
        state === 'no-permission'
          ? {
              ...customerRuntimeEffectiveSession,
              actions: customerRuntimeEffectiveSession.actions.filter(
                (key) => key !== 'product.read'
              ),
            }
          : customerRuntimeEffectiveSession,
      viewport: { width: 1440, height: 1000 },
      beforeNavigate: async (page) => {
        await installImages(page)
        page.productImageProbe.failReferences = state === 'retry'
      },
      verify: async (page) => {
        const identity = page
          .locator('.ant-table-tbody .erp-product-identity')
          .first()
        await identity.waitFor()
        if (state === 'no-permission') {
          assert.equal(await identity.locator('button').count(), 0)
          assert.equal(
            page.productImageProbe.requests.length,
            0,
            'unreadable product metadata and thumbnails must not be requested'
          )
        } else {
          const retry = identity.getByRole('button', { name: /^重试.+图片$/ })
          await retry.waitFor()
          page.productImageProbe.failReferences = false
          await retry.press('Enter')
          await identity.locator('.erp-task-product-image img').waitFor()
          assert.equal(
            await identity.locator('.erp-product-identity__retry').count(),
            0
          )
          assert.equal(await page.locator('.ant-table-row-selected').count(), 0)
          assert.equal(await page.locator('.ant-modal:visible').count(), 0)
        }
      },
    })),
  ]
}
