import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { stylePaginatedRpcData } from './rpcMockResult.mjs'
import { ShipmentFinanceReleaseStatus } from '../../src/common/consts/statuses.generated.mjs'
import { PRODUCT_IMAGES_CHANGED } from '../../src/erp/utils/productImageReferences.mjs'
import { progressFixtureData } from './businessProgressFixtures.mjs'

const photograph = readFileSync(new URL('../../src/erp/data/bom-example-images/product.jpg', import.meta.url)).toString('base64')
const names = ['模拟蓝熊', '模拟粉熊', '模拟无图兔']
const products = names.map((name, index) => ({ id: index + 1, code: `GALLERY-P-${index + 1}`, name, default_unit_id: 1, is_active: true }))
const stamp = 1_800_000_000
const lines = [1, 2, 3, 1].map((productID, index) => ({
  id: index + 1, line_no: index + 1, product_id: productID, unit_id: 1,
  product_name_snapshot: names[productID - 1], product_code_snapshot: products[productID - 1].code,
  ordered_quantity: '10', planned_quantity: '10', outsourcing_quantity: '10', quantity: '10',
  line_status: 'open', subject_type: 'PRODUCT', process_id: 1,
  route_code: 'PLUSH_SEW_HAND_V1', customer_inspection_required: false,
}))
function images(productID) {
  return ![1, 2].includes(productID) ? [] : (productID === 1 ? ['primary', 'secondary'] : ['primary']).map((slot, index) => ({
    id: 8000 + productID * 100 + index + 1, owner_type: 'product', owner_id: productID,
    attachment_type: 'product_image', slot_key: slot, mime_type: 'image/jpeg', file_name: `${slot}.jpg`, file_size: 2000,
  }))
}

async function installGalleryFixture(page) {
  page.__galleryProbe = { calls: [], failOriginal: false, failMetadata: false, holdProduct: 0, release: null }
  const currentImages = (productID) => images(productID).filter((image) => !page.__galleryProbe.clearImages && (!page.__galleryProbe.onlySecondary || image.slot_key === 'secondary'))
  await page.route('**/rpc/**', async (route) => {
    const body = route.request().postDataJSON()
    const { method, params = {}, id } = body
    const probe = page.__galleryProbe
    let data
    let code = 0
    if (method === 'list_document_product_previews') {
      data = { previews: params.document_ids.map((documentID) => ({ document_id: documentID, product_count: 3, product_id: 1, product_name: names[0], product_code: products[0].code })) }
    } else if (method === 'list_product_image_references') {
      data = { images: params.product_ids.map((productID) => ({ product_id: productID, image_attachment_id: currentImages(productID).find((image) => image.slot_key === 'primary')?.id || 0 })) }
    } else if (method === 'list_attachments' && params.owner_type === 'product') {
      data = { attachments: currentImages(params.owner_id) }
      code = probe.failMetadata ? 50000 : 0
    } else if (method === 'download_attachment' && Number(params.id) >= 8101 && Number(params.id) <= 8201) {
      const attachment = [1, 2].flatMap(images).find((image) => image.id === params.id)
      if (!attachment) return route.fallback()
      if (!params.variant && probe.holdProduct === attachment.owner_id) await new Promise((resolve) => { probe.release = resolve; probe.onHold?.() })
      code = !params.variant && probe.failOriginal ? 50000 : 0
      data = { attachment: { ...attachment, content_base64: photograph } }
    } else if (method === 'list_progress') {
      data = progressFixtureData(params)
      data.rows = data.rows.map((row) => row.id === 1 ? { ...row, order_no: 'SO-GALLERY-001', product: names[0], product_id: 1, product_count: 3, product_type_count: 3 } : row)
    } else if (method === 'list_products') {
      data = stylePaginatedRpcData(products, 'products', params)
    } else if (method === 'list_sales_orders') {
      data = stylePaginatedRpcData([{ id: 1, order_no: 'SO-GALLERY-001', customer_id: 1, customer_snapshot: { name: '模拟客户' }, currency: 'CNY', lifecycle_status: 'draft', version: 1, item_count: 4, order_date: stamp, updated_at: stamp }], 'sales_orders', params)
    } else if (method === 'list_sales_order_items') {
      data = stylePaginatedRpcData(lines.map((line) => ({ ...line, sales_order_id: params.sales_order_id })), 'sales_order_items', params)
    } else if (method === 'list_production_orders') {
      data = stylePaginatedRpcData([{ id: 1, order_no: 'MO-GALLERY-001', status: 'DRAFT', version: 1, item_count: 4, created_by: 1, updated_at: stamp }], 'production_orders', params)
    } else if (method === 'get_production_order') {
      data = { production_order: { id: params.production_order_id, order_no: 'MO-GALLERY-001', status: 'DRAFT', version: 1, item_count: 4 }, production_order_items: lines.map((line) => ({ ...line, production_order_id: params.production_order_id })), production_material_requirements: [], material_requirements_state: 'NOT_REQUIRED' }
    } else if (method === 'list_outsourcing_orders') {
      data = stylePaginatedRpcData([{ id: 1, outsourcing_order_no: 'OO-GALLERY-001', supplier_id: 1, supplier_snapshot: { name: '模拟加工厂' }, currency: 'CNY', lifecycle_status: 'draft', version: 1, item_count: 4, order_date: stamp, updated_at: stamp }], 'outsourcing_orders', params)
    } else if (method === 'list_outsourcing_order_items') {
      data = stylePaginatedRpcData(lines.map((line) => ({ ...line, outsourcing_order_id: params.outsourcing_order_id })), 'outsourcing_order_items', params)
    } else if (method === 'list_shipments') {
      data = stylePaginatedRpcData([{ id: 1, shipment_no: 'SHIP-GALLERY-001', status: 'draft', finance_release_status: ShipmentFinanceReleaseStatus.PENDING, finance_release_version: 1, version: 1, customer_id: 1, customer_snapshot: '模拟客户', items: lines.map((line) => ({ ...line, shipment_id: 1, warehouse_id: 1 })), updated_at: stamp }], 'shipments', params)
    } else return route.fallback()
    probe.calls.push({ method, params: { ...params } })
    await route.fulfill({ json: { jsonrpc: '2.0', id, result: { code, message: code ? '模拟读取失败' : 'OK', data: code ? {} : data } } })
  })
}

const stage = '.erp-task-image-preview__stage'
async function imageReady(page) {
  await page.waitForFunction((selector) => document.querySelector(`${selector} img`)?.naturalWidth === 1200, stage)
  await page.waitForFunction(() => {
    const preview = document.querySelector('.erp-task-image-preview .ant-image-preview')
    return preview && getComputedStyle(preview).transform === 'none' && getComputedStyle(preview).opacity === '1'
  })
}
async function closeAndRestore(page, trigger) {
  await page.getByRole('button', { name: '关闭图片预览', exact: true }).press('Escape')
  await page.locator(stage).waitFor({ state: 'detached' })
  assert.equal(await trigger.evaluate((element) => element === document.activeElement), true)
}
async function verifyGalleryGeometry(page) {
  const boxes = await page.evaluate(() => {
    const stageBox = document.querySelector('.erp-task-image-preview__stage').getBoundingClientRect()
    const head = document.querySelector('.erp-task-image-preview__header').getBoundingClientRect()
    const foot = document.querySelector('.erp-task-image-preview__footer').getBoundingClientRect()
    return { stageTop: stageBox.top, stageBottom: stageBox.bottom, headerBottom: head.bottom, footerTop: foot.top, footerBottom: foot.bottom, viewport: innerHeight }
  })
  assert.equal(boxes.headerBottom <= boxes.stageTop + 1 && boxes.stageBottom <= boxes.footerTop + 1 && boxes.footerBottom <= boxes.viewport + 1, true, JSON.stringify(boxes))
}
async function verifyDocumentGallery(page, outputDir, name) {
  const trigger = page.getByRole('button', { name: /查看.*的 3 款产品图片/ }).first()
  await trigger.waitFor()
  await trigger.scrollIntoViewIfNeeded()
  const checkedBefore = await page.locator('.ant-table-tbody input:checked').count()
  const before = await page.evaluate(() => ({ path: location.pathname, top: document.querySelector('.erp-main-content')?.scrollTop || 0 }))
  assert.equal(page.__galleryProbe.calls.some((call) => call.method === 'download_attachment' && !call.params.variant), false)
  await trigger.press('Enter')
  await imageReady(page)
  await verifyGalleryGeometry(page)
  assert.equal(await page.locator('.erp-product-gallery-preview__products button').count(), 3, 'repeated product lines share one gallery entry')
  await page.getByText('主图 · 1 / 2 张', { exact: true }).waitFor()
  await page.getByRole('button', { name: '下一张图片', exact: true }).click()
  await page.getByText('辅图 · 2 / 2 张', { exact: true }).waitFor()
  await imageReady(page)
  await page.getByRole('button', { name: '放大图片', exact: true }).click()
  await page.waitForFunction(() => document.querySelector('button[aria-label="缩小图片"]')?.disabled === false)
  assert.equal(await page.getByRole('button', { name: '缩小图片', exact: true }).isEnabled(), true)
  await page.locator('.erp-product-gallery-preview__products button').nth(1).click()
  await imageReady(page)
  await page.getByText('主图 · 1 / 1 张', { exact: true }).waitFor()
  assert.equal(page.__galleryProbe.calls.some((call) => call.method === 'download_attachment' && call.params.id === 8201 && !call.params.variant), true)
  await page.locator('.erp-product-gallery-preview__products button').nth(2).click()
  await page.getByText('该产品暂无图片', { exact: true }).waitFor()
  assert.equal(await page.getByRole('button', { name: '下一张图片', exact: true }).isDisabled(), true)
  await page.locator('.erp-product-gallery-preview__products button').nth(0).click()
  await imageReady(page)
  await page.screenshot({ path: path.join(outputDir, `${name}-gallery.png`) })
  await closeAndRestore(page, trigger)
  assert.equal(await page.locator('.ant-table-tbody input:checked').count(), checkedBefore)
  assert.deepEqual(await page.evaluate(() => ({ path: location.pathname, top: document.querySelector('.erp-main-content')?.scrollTop || 0 })), before)
  const summaryCalls = page.__galleryProbe.calls.filter((call) => call.method === 'list_document_product_previews')
  assert.equal(summaryCalls.every((call) => call.params.document_ids.length <= 80), true)
}

export function createProductGalleryScenarios({ outputDir, customerRuntimeEffectiveSession }) {
  const common = { auth: 'admin', customerKey: 'yoyoosun', effectiveSession: customerRuntimeEffectiveSession, beforeNavigate: installGalleryFixture }
  const documents = [
    ['sales', '/erp/sales/project-orders/sales-orders'],
    ['production', '/erp/production/orders'],
    ['outsourcing', '/erp/purchase/processing-contracts'],
    ['shipment', '/erp/warehouse/shipments'],
  ]
  return [
    ...documents.map(([module, url]) => ({
      ...common, name: `product-gallery-${module}`, path: url,
      viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2,
      verify: (page) => verifyDocumentGallery(page, outputDir, `product-gallery-${module}`),
    })),
    {
      ...common, name: 'product-gallery-progress', path: '/erp/business-dashboard', viewport: { width: 1440, height: 900 },
      verify: async (page) => {
        const trigger = page.getByRole('button', { name: `查看${names[0]}大图`, exact: true }).first()
        await trigger.waitFor()
        await trigger.click()
        await imageReady(page)
        assert.equal(await page.locator('.erp-product-gallery-preview__products button').count(), 3)
        await page.locator('.erp-product-gallery-preview__products button').nth(1).click()
        await imageReady(page)
        assert.equal(await page.locator('.erp-progress-detail:visible').count(), 0, 'viewing product photos does not open progress details')
        await closeAndRestore(page, trigger)
        assert.equal(page.__galleryProbe.calls.some((call) => call.method === 'list_document_product_previews'), false, 'progress reuses its existing representative product and count')
      },
    },
    ...[
      ['desktop', { width: 1440, height: 900 }, 'light'],
      ['dark', { width: 1440, height: 900 }, 'dark'],
      ['mobile', { width: 390, height: 844 }, 'light'],
    ].map(([device, viewport, themeMode]) => ({
      ...common, name: `product-gallery-single-${device}`, path: '/erp/master/products', viewport, themeMode,
      verify: async (page) => {
        const trigger = page.getByRole('button', { name: `查看${names[0]}大图`, exact: true }).first()
        await trigger.waitFor()
        await trigger.click()
        await imageReady(page)
        await verifyGalleryGeometry(page)
        await page.getByRole('button', { name: '下一张图片', exact: true }).click()
        await page.getByText('辅图 · 2 / 2 张', { exact: true }).waitFor()
        await imageReady(page)
        page.__galleryProbe.onlySecondary = true
        await page.evaluate((name) => window.dispatchEvent(new CustomEvent(name, { detail: 1 })), PRODUCT_IMAGES_CHANGED)
        await page.getByText('辅图 · 1 / 1 张', { exact: true }).waitFor()
        await imageReady(page)
        page.__galleryProbe.clearImages = true
        await page.evaluate((name) => window.dispatchEvent(new CustomEvent(name, { detail: 1 })), PRODUCT_IMAGES_CHANGED)
        await page.getByText('该产品暂无图片', { exact: true }).waitFor()
        assert.equal(await page.locator(`${stage} img`).count(), 0)
        await closeAndRestore(page, trigger)
        page.__galleryProbe.clearImages = false
        await trigger.click()
        await page.getByText('辅图 · 1 / 1 张', { exact: true }).waitFor()
        await imageReady(page)
        await page.screenshot({ path: path.join(outputDir, `product-gallery-single-${device}.png`) })
        await closeAndRestore(page, trigger)
      },
    })),
    {
      ...common, name: 'product-gallery-recovery', path: documents[0][1], viewport: { width: 1280, height: 800 },
      verify: async (page) => {
        const trigger = page.getByRole('button', { name: /查看.*的 3 款产品图片/ }).first()
        await trigger.waitFor()
        page.__galleryProbe.failMetadata = true
        await trigger.click()
        await page.getByText('图片读取失败，请重试', { exact: true }).waitFor()
        page.__galleryProbe.failMetadata = false
        page.__galleryProbe.failOriginal = true
        await page.getByRole('button', { name: '重新加载', exact: true }).click()
        await page.getByText('图片加载失败，请重试', { exact: true }).waitFor()
        page.__galleryProbe.failOriginal = false
        await page.getByRole('button', { name: '重新加载', exact: true }).click()
        await imageReady(page)
        page.__galleryProbe.holdProduct = 2
        const heldRead = new Promise((resolve) => { page.__galleryProbe.onHold = resolve })
        await page.locator('.erp-product-gallery-preview__products button').nth(1).click()
        await heldRead
        await page.getByText('正在加载图片', { exact: true }).waitFor()
        await page.locator('.erp-product-gallery-preview__products button').nth(2).click()
        await page.getByText('该产品暂无图片', { exact: true }).waitFor()
        const lateImage = page.waitForResponse((response) => {
          const request = response.request().postDataJSON()
          return request?.method === 'download_attachment' && request.params?.id === 8201 && !request.params.variant
        })
        if (page.__galleryProbe.release) page.__galleryProbe.release()
        await (await lateImage).finished()
        await page.getByText('该产品暂无图片', { exact: true }).waitFor()
        assert.equal(await page.locator(`${stage} img`).count(), 0, 'a late original cannot replace the current empty product')
        await closeAndRestore(page, trigger)
      },
    },
    {
      name: 'product-gallery-design', path: '/__dev/ui-design', viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 2,
      verify: async (page) => {
        const frame = page.frameLocator('iframe[title="ERP 最新可交互设计"]')
        await frame.locator('.app').waitFor({ state: 'visible' })
        await frame.getByRole('button', { name: '销售管理', exact: true }).click()
        const trigger = frame.locator('[data-action="product-gallery-preview"][data-count="3"]').first()
        await trigger.click()
        const preview = frame.locator('.product-image-preview')
        await preview.waitFor({ state: 'visible' })
        assert.equal(await preview.locator('[data-action="product-gallery-product"]').count(), 3)
        await preview.getByRole('button', { name: '下一张图片', exact: true }).click()
        await preview.getByText('辅图 · 2 / 2 张', { exact: true }).waitFor()
        await preview.locator('[data-action="product-gallery-product"]').nth(2).click()
        await preview.getByText('该产品暂无图片', { exact: true }).waitFor()
        await page.screenshot({ path: path.join(outputDir, 'product-gallery-design.png') })
        await preview.getByRole('button', { name: '关闭图片预览', exact: true }).click()
        await preview.waitFor({ state: 'detached' })
      },
    },
  ]
}
