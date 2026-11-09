import { selectWarehouseView } from './warehouseNavigationActions.mjs'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { openBusinessRecordDetails } from './businessDetailsScenarios.mjs'
import { assertVisibleBusinessFormControlHeight } from './inputControlAssertions.mjs'
import { stylePaginatedRpcData } from './rpcMockResult.mjs'
import { openBusinessTableTool } from './businessTableTools.mjs'
import { clickERPThemeOption } from './themeAssertions.mjs'
import { assertSingleSelectValues } from './singleSelectAssertions.mjs'
import { assertProductFieldLayout } from './productFieldLayoutAssertions.mjs'

async function assertProductIdentityLayout(page) {
  const metrics = await page.locator('.ant-table-tbody .erp-product-identity').evaluateAll((nodes) =>
    nodes.map((node) => {
      const image = node.querySelector('.erp-task-product-image').getBoundingClientRect()
      const gallery = node.querySelector('.erp-product-gallery').getBoundingClientRect()
      const text = node.querySelector('.erp-product-identity__text')
      const textBox = text.getBoundingClientRect()
      const content = node.closest('.erp-business-table-copyable-cell__content') || node.closest('td')
      return {
        name: text.textContent,
        gap: textBox.left - image.right,
        imageOverflow: image.right - gallery.right,
        textOverflow: text.scrollWidth - text.clientWidth,
        contentOverflow: textBox.right - content.getBoundingClientRect().right,
      }
    })
  )
  assert.ok(metrics.length > 0, '应存在可核对的产品图片与名称')
  for (const metric of metrics) {
    const detail = JSON.stringify(metric)
    assert.ok(metric.gap >= 11, `图片与名称应保留 12px 间距，不能遮挡文字: ${detail}`)
    assert.ok(metric.imageOverflow <= 1, `图片入口应为完整缩略图保留宽度: ${detail}`)
    assert.ok(metric.textOverflow <= 1 && metric.contentOverflow <= 1, `长名称应在文字区域内换行: ${detail}`)
  }
}

function createBOMProductListScenarios({ customerRuntimeEffectiveSession, outputDir }) {
  return ['list', 'retry', 'no-permission'].map((mode) => ({
    name: `product-identification-bom-${mode}`,
    path: '/erp/purchase/material-bom',
    auth: 'admin',
    effectiveSession: mode === 'no-permission'
      ? { ...customerRuntimeEffectiveSession, actions: customerRuntimeEffectiveSession.actions.filter((key) => key !== 'product.read') }
      : customerRuntimeEffectiveSession,
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    beforeNavigate: async (page) => {
      await installImages(page)
      const products = [
        { id: 1, code: 'BOM-P-001', name: '模拟长耳兔可拆卸围巾礼盒与多配件组合款产品', is_active: true },
        { id: 2, code: 'BOM-P-INACTIVE-WITH-A-LONG-PRODUCT-CODE', name: '模拟停用产品', is_active: false },
        { id: 4, code: 'BOM-P-004', name: '模拟第二页产品', is_active: true },
      ]
      const records = Array.from({ length: 51 }, (_, index) => ({
        id: 51 - index,
        product_id: index === 50 ? 4 : index === 2 ? 3 : index === 1 ? 2 : 1,
        version: `BOM-VIEW-${51 - index}`,
        status: 'DRAFT',
      }))
      page.bomProductProbe = { products, requests: [], details: 0, fail: mode === 'retry' }
      await page.route('**/rpc/**', async (route) => {
        const { id, method, params = {} } = route.request().postDataJSON()
        const reply = (data) => route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 0, data } } })
        if (method === 'list_bom_versions') return reply(stylePaginatedRpcData(records, 'bom_versions', params))
        if (method === 'get_bom_version') page.bomProductProbe.details += 1
        if (method !== 'list_products') return route.fallback()
        page.bomProductProbe.requests.push(params)
        if (page.bomProductProbe.fail) {
          page.bomProductProbe.fail = false
          return route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 50000, message: '关联资料读取失败' } } })
        }
        return reply(stylePaginatedRpcData(products, 'products', params))
      })
    },
    verify: async (page) => {
      const rows = page.locator('.erp-business-data-table-card tr[data-row-key]')
      const first = rows.filter({ hasText: 'BOM-VIEW-51' })
      await first.waitFor()
      if (mode === 'no-permission') {
        assert.equal(await first.locator('.erp-product-identity__text').innerText(), '产品已关联')
        assert.equal(page.bomProductProbe.requests.length, 0, '无产品读取权限时不能请求产品资料')
        assert.equal(page.productImageProbe.requests.length, 0, '无产品读取权限时不能请求产品图片')
        assert.equal(await first.locator('.erp-product-gallery__trigger').count(), 0)
        return
      }
      if (mode === 'retry') {
        await page.locator('.ant-message-error').first().waitFor()
        assert.equal(await first.locator('.erp-product-identity__text').innerText(), '产品已关联')
        await page.getByRole('button', { name: '刷新当前页' }).click()
      }
      const name = page.bomProductProbe.products[0].name
      await first.getByText(name).waitFor()
      await rows.filter({ hasText: 'BOM-VIEW-50' }).getByText('模拟停用产品').waitFor()
      assert.equal(page.bomProductProbe.details, 0, '产品名称不依赖选中记录或打开详情')
      assert.ok(page.bomProductProbe.requests.every((params) => JSON.stringify(params.ids) === '[1,2,3]' && params.active_only !== true), '首屏只批量读取当前页的去重产品，并保留停用产品')
      assert.equal(await rows.filter({ hasText: 'BOM-VIEW-49' }).locator('.erp-product-identity__text').innerText(), '产品已关联', '缺失资料不补造产品名称')
      const geometry = async () => first.locator('.erp-product-identity').evaluate((node) => {
        const cell = node.closest('td')
        const image = node.querySelector('.erp-task-product-image').getBoundingClientRect()
        const text = node.querySelector('.erp-product-identity__text')
        return { cellWidth: cell.getBoundingClientRect().width, width: image.width, height: image.height, overflow: text.scrollWidth - text.clientWidth }
      })
      const wide = await geometry()
      assert.deepEqual([wide.width, wide.height], [64, 64])
      assert.ok(wide.cellWidth >= 200 && wide.cellWidth <= 305, `产品列应收紧到约 300px: ${JSON.stringify(wide)}`)
      assert.ok(wide.overflow <= 1, '长产品名称应完整换行')
      const preview = first.getByRole('button', { name: `查看${name}大图`, exact: true })
      await preview.click()
      await page.locator('.erp-task-image-preview__stage img').waitFor()
      await closeImage(page)
      assert.equal(await page.locator('.ant-table-row-selected').count(), 0)
      assert.equal(await preview.evaluate((node) => node === document.activeElement), true)
      if (mode === 'retry') return
      await page.screenshot({ path: path.join(outputDir, 'bom-product-list-4k.png'), animations: 'disabled' })
      await page.locator('.ant-pagination-item-2').click()
      await rows.filter({ hasText: 'BOM-VIEW-1' }).getByText('模拟第二页产品').waitFor()
      assert.deepEqual(page.bomProductProbe.requests.at(-1).ids, [4], '翻页只补读该页产品')
      await page.locator('.ant-pagination-item-1').click()
      await first.getByText(name).waitFor()
      page.bomProductProbe.products[0].name = '模拟刷新后的长耳兔'
      await page.getByRole('button', { name: '刷新当前页' }).click()
      await first.getByText('模拟刷新后的长耳兔').waitFor()
      assert.equal(await first.getByText(name).count(), 0, '刷新不能残留旧名称')
      const download = page.waitForEvent('download')
      await openBusinessTableTool(page, '导出筛选结果')
      const csv = await readFile(await (await download).path(), 'utf8')
      assert.ok(csv.includes('模拟刷新后的长耳兔') && csv.includes('模拟第二页产品') && csv.includes('模拟停用产品'), '完整筛选导出包含未访问页与停用产品的真实名称')
      assert.deepEqual(page.bomProductProbe.requests.at(-1).ids, [1, 2, 3, 4])
      await page.setViewportSize({ width: 1440, height: 900 })
      await clickERPThemeOption(page, '暗色')
      const narrow = await geometry()
      assert.deepEqual([narrow.width, narrow.height], [64, 64])
      assert.ok(narrow.overflow <= 1)
      await page.screenshot({ path: path.join(outputDir, 'bom-product-list-dark.png'), animations: 'disabled' })
      await page.setViewportSize({ width: 520, height: 900 })
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), '窄屏只在表格内横向滚动')
    },
  }))
}

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
      !['list_product_image_references', 'list_attachments', 'download_attachment'].includes(method)
    ) {
      return route.fallback()
    }
    probe.requests.push({ method, params })
    if (method === 'list_attachments') {
      if (params.owner_type !== 'product') return route.fallback()
      const productID = Number(params.owner_id)
      const attachments = productID === 2 || (productID === 1 && probe.cleared) ? [] : [{ id: 900000 + productID, owner_type: 'product', owner_id: productID, attachment_type: 'product_image', slot_key: 'primary', mime_type: 'image/png', file_name: '模拟主图.png' }]
      return route.fulfill({ json: { jsonrpc: '2.0', id: body.id, result: { code: 0, message: '', data: { attachments } } } })
    }
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
  await page.locator('.erp-task-image-preview').waitFor({ state: 'detached' })
}

export function createProductIdentityScenarios({
  customerRuntimeEffectiveSession,
  outputDir,
}) {
  const shipmentSkuName = '模拟米白小号配套款，含独立礼盒包装、替换围巾与同色挂件'
  return [
    ...createBOMProductListScenarios({ customerRuntimeEffectiveSession, outputDir }),
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
          .locator('.ant-table-tbody tr[data-row-key]')
          .filter({ hasText: 'PRODUCT-1' })
          .first()
        const button = row.getByRole('button', {
          name: '查看识图长耳兔（可拆卸围巾礼盒款）大图',
          exact: true,
        })
        await button.waitFor()
        await assertProductIdentityLayout(page)
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
          .locator('.ant-table-tbody tr[data-row-key]')
          .filter({ hasText: '识图产品 2' })
          .first()
        assert.equal(
          await empty.locator('.erp-task-product-image img').count(),
          0
        )
        const geometry = await button
          .locator('.erp-task-product-image')
          .evaluate((node) => ({
            width: node.getBoundingClientRect().width,
            height: node.getBoundingClientRect().height,
          }))
        assert.deepEqual(geometry, { width: 64, height: 64 })
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
        await row.locator('.erp-task-product-image[data-image-state="empty"]').waitFor()
        assert.equal(
          await row.locator('.erp-task-product-image img').count(),
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
        await page.getByRole('button', { name: '新建 BOM' }).click()
        const modal = page
          .locator('.erp-business-form-page:not([hidden])')
          .last()
        await modal.waitFor()
        await modal.getByRole('combobox', { name: /产品$/ }).press('ArrowDown')
        const option = page
          .locator('.ant-select-dropdown:visible .ant-select-item-option')
          .filter({ hasText: 'PROD-STYLE-L1' })
          .first()
        await option.locator('.erp-task-product-image img').waitFor()
        assert.equal(
          await option.locator('.erp-task-product-image button').count(),
          0,
          'option images select the product instead of opening a nested dialog'
        )
        await option.click()
        const preview = modal
          .locator('.erp-product-field-control .erp-product-gallery__trigger')
          .first()
        await preview.locator('.erp-task-product-image img').waitFor()
        const header = modal.locator('.erp-bom-header-primary')
        const headerPeers = ['input[id$="quantity_text"]', 'input[id$="source_order_no"]']
        const aligned = await assertProductFieldLayout(header, headerPeers)
        await header.screenshot({ path: path.join(outputDir, 'bom-header-product-alignment.png'), animations: 'disabled' })
        assert.deepEqual(await preview.locator('.erp-task-product-image').evaluate((node) => ({
          width: node.getBoundingClientRect().width,
          height: node.getBoundingClientRect().height,
        })), { width: 48, height: 48 }, '表单产品控件保留紧凑尺寸')
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
          await modal.locator('.erp-product-field-control .erp-task-product-image').count(),
          0,
          'clearing association removes the old image'
        )
        const cleared = await assertProductFieldLayout(header, headerPeers, { hasImage: false })
        assert.ok(Math.abs(aligned.fields[0].top - cleared.fields[0].top) <= 1, '清空产品不推移同行控件')
        await modal
          .getByRole('button', { name: '返回列表', exact: true })
          .click()
      },
    },
    {
      name: 'product-identification-inventory',
      path: '/erp/warehouse/inventory',
      auth: 'admin',
      effectiveSession: customerRuntimeEffectiveSession,
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
      beforeNavigate: async (page) => {
        await installImages(page)
        await page.route('**/rpc/masterdata', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (method !== 'list_products') return route.fallback()
          const products = [{
            id: 1,
            code: 'PRODUCT-OVERLAP-LONG-CODE-001',
            name: '模拟长耳兔可拆卸围巾礼盒与多配件组合款产品',
            default_unit_id: 1,
            is_active: true,
          }]
          return route.fulfill({ json: {
            jsonrpc: '2.0', id,
            result: { code: 0, data: stylePaginatedRpcData(products, 'products', params) },
          } })
        })
      },
      verify: async (page) => {
        for (const tab of [null, '库存批次', '库存变动记录']) {
          if (tab) {
            await selectWarehouseView(page, tab)
          }
          const button = page
            .locator('.ant-table-tbody .erp-product-identity button')
            .first()
          await button.waitFor()
          await assertProductIdentityLayout(page)
          await button.click()
          await closeImage(page)
          await assertProductIdentityLayout(page)
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
        await page.setViewportSize({ width: 960, height: 900 })
        await assertProductIdentityLayout(page)
        await clickERPThemeOption(page, '暗色')
        await assertProductIdentityLayout(page)
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
        const production = key === 'production'
        await openBusinessRecordDetails(page, production ? 'MO-STYLE-L1-20260713' : 'SIM-OUTSOURCE-CONTRACT-L1', production ? '查看' : '查看详情')
        const identityRoot = page.locator(
          production
            ? '.erp-business-form-page:visible'
            : '.erp-business-details-modal:visible'
        )
        if (production) {
          await identityRoot.locator('.erp-product-field-control:visible').first().waitFor({ state: 'visible' })
        }
        const image = identityRoot
          .locator(production ? '.erp-product-field-control:visible .erp-product-gallery__trigger' : '.erp-product-identity button')
          .first()
        await image.click().catch(async (error) => {
          const identities = await identityRoot
            .locator('.erp-product-identity')
            .evaluateAll((nodes) =>
              nodes.slice(0, 3).map((node) => ({
                imageState: node
                  .querySelector('.erp-task-product-image')
                  ?.getAttribute('data-image-state'),
                text: node.textContent?.replace(/\s+/g, ' ').trim() || '',
                visible: node.getBoundingClientRect().height > 0,
              }))
            )
          throw new Error(
            `${error.message}\n产品识别现场：${JSON.stringify({ identities, requests: page.productImageProbe.requests })}`
          )
        })
        await closeImage(page)
        if (production) {
          const main = identityRoot.locator('.erp-product-field-control:visible').first()
          assert.ok((await main.boundingBox()).height < 140, '长产品名与图片不应挤成高列')
          await assertProductFieldLayout(identityRoot.locator('.erp-compact-field-table__fields').first(),
            ['sales_order_item_id', 'product_sku_id', 'planned_quantity', 'unit_id', 'bom_header_id'].map((name) => `input[id$="_${name}"]`))
          await assertVisibleBusinessFormControlHeight(page, '图集旁的自然换行业务引用')
          for (const kind of ['plain', 'undersized-select']) {
            await page.evaluate((type) => {
              const form = [...document.querySelectorAll('.erp-business-action-form')].find((node) => node.getBoundingClientRect().width > 0)
              const probe = type === 'plain' ? document.createElement('input') : form.querySelector('.ant-select-single').cloneNode(true)
              probe.dataset.galleryHeightProbe = type
              if (type === 'plain') probe.className = 'ant-input'
              probe.setAttribute('aria-label', '图片回归高度反例')
              const height = type === 'plain' ? '54px' : '20px'
              for (const [property, value] of Object.entries({ height, 'min-height': '0', 'max-height': height, width: '200px', display: 'block', overflow: 'hidden' })) probe.style.setProperty(property, value, 'important')
              form.append(probe)
            }, kind)
            try {
              await assert.rejects(() => assertVisibleBusinessFormControlHeight(page, '高度反例必须拒绝'), /高度未统一/)
            } finally {
              await page.locator('[data-gallery-height-probe]').evaluateAll((nodes) => nodes.forEach((node) => node.remove()))
            }
          }
        }
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
      deviceScaleFactor: 2,
      beforeNavigate: async (page) => {
        await installImages(page)
        await page.route('**/rpc/masterdata', async (route) => {
          const { id, method, params = {} } = route.request().postDataJSON()
          if (method !== 'list_product_skus') return route.fallback()
          const skus = [{ id: 1, product_id: 1, sku_code: 'SKU-STYLE-L1', sku_name: shipmentSkuName, is_active: true }]
          await route.fulfill({ json: { jsonrpc: '2.0', id, result: { code: 0, data: stylePaginatedRpcData(skus, 'product_skus', params) } } })
        })
      },
      verify: async (page) => {
        const shipmentRow = page
          .locator('.ant-table-tbody tr')
          .filter({ hasText: 'SHIP-STYLE-L1' })
          .first()
        await shipmentRow.getByRole('radio').check()
        await page.getByRole('button', { name: '查看明细' }).click()
        const modal = page
          .locator('.erp-business-form-page:not([hidden])')
          .last()
        await modal
          .locator('.erp-product-identity')
          .first()
          .scrollIntoViewIfNeeded()
        await modal.locator('.erp-product-identity button').first().click()
        await closeImage(page)
        assert.equal(await page.locator('.ant-modal:visible').count(), 0)
        assert.equal(await modal.isVisible(), true)
        await modal.screenshot({
          path: path.join(
            outputDir,
            'product-identification-shipment-desktop.png'
          ),
        })
        await modal.getByRole('button', { name: '返回列表', exact: true }).click()
        await modal.waitFor({ state: 'hidden' })

        await page.setViewportSize({ width: 1920, height: 1080 })
        await page.getByRole('button', { name: /新建出货单$/u }).click()
        const editor = page.getByRole('region', { name: '新建出货单', exact: true })
        const line = editor.locator('.erp-line-item-table__main-row').first()
        const product = line.getByRole('combobox', { name: '第 1 行产品', exact: true })
        const sku = line.getByRole('combobox', { name: 'SKU', exact: true })
        const thumbnail = line.locator('.erp-task-product-image')
        const region = editor.locator('.erp-sales-order-lines-form__list')
        const peerFields = ['product_sku_id', 'warehouse_id', 'lot_id', 'quantity', 'unit_id'].map((name) => `input[id$="_${name}"]`)
        const initial = await assertProductFieldLayout(line, peerFields, { hasImage: false })
        const assertFieldAlignment = async (hasImage) => {
          const layout = await assertProductFieldLayout(line, peerFields, { hasImage })
          const [productBox, skuBox] = layout.fields
          assert.ok(productBox.right <= skuBox.left, '产品和 SKU 应各自成列')
          assert.ok(Math.abs(productBox.top - initial.fields[0].top) <= 1, '选择、清空、换行和校验不改变同行录入起点')
        }

        await product.press('ArrowDown')
        const dropdown = page.locator('.ant-select-dropdown:visible')
        await dropdown.locator('.ant-select-item-option').filter({ hasText: 'PROD-STYLE-L1' }).first().click()
        await dropdown.waitFor({ state: 'hidden' })
        await thumbnail.locator('img').waitFor()
        await region.screenshot({ path: path.join(outputDir, 'shipment-line-alignment.png'), animations: 'disabled' })
        await assertFieldAlignment(true)
        await thumbnail.locator('xpath=ancestor::button[1]').click()
        await page.locator('.erp-task-image-preview__stage img').waitFor()
        await closeImage(page)

        await sku.press('ArrowDown')
        await dropdown.locator('.ant-select-item-option').filter({ hasText: 'SKU-STYLE-L1' }).first().click()
        await dropdown.waitFor({ state: 'hidden' })
        await assertFieldAlignment(true)
        const selectedSKU = line.locator('.app-select__reference-name').filter({ hasText: shipmentSkuName })
        assert.equal(await selectedSKU.innerText(), shipmentSkuName)
        await assertSingleSelectValues(line, 'shipment-line-long-sku', 2)

        await page.setViewportSize({ width: 1440, height: 900 })
        assert.ok(await region.evaluate((node) => node.scrollWidth - node.clientWidth <= 1), '普通桌面应能同时看到数量和单位')
        await assertFieldAlignment(true)
        await assertSingleSelectValues(line, 'shipment-line-desktop-long-sku', 2)
        const quantity = line.locator('input[id$="_quantity"]')
        await quantity.fill('1')
        await quantity.fill('')
        await line.getByText('请填写数量', { exact: true }).waitFor()
        await assertFieldAlignment(true)

        await page.setViewportSize({ width: 1024, height: 900 })
        const scroll = await region.evaluate((node) => {
          node.scrollLeft = node.scrollWidth
          return { left: node.scrollLeft, remaining: node.scrollWidth - node.clientWidth - node.scrollLeft, pageOverflow: document.documentElement.scrollWidth - innerWidth }
        })
        assert.ok(scroll.left > 0 && scroll.remaining <= 1 && scroll.pageOverflow <= 1, `窄桌面只在明细区横向滚动并能看到末列：${JSON.stringify(scroll)}`)
        await assertFieldAlignment(true)
        await page.setViewportSize({ width: 1920, height: 1080 })

        const productControl = product.locator('xpath=ancestor::div[contains(concat(" ", normalize-space(@class), " "), " ant-select ")][1]')
        await productControl.hover()
        await productControl.locator('.ant-select-clear').click()
        assert.equal(await sku.isDisabled(), true, '清空产品后规格回到未选产品状态')
        assert.equal(await selectedSKU.count(), 0, '不残留原规格')
        await assertFieldAlignment(false)
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
          await identity.locator('.erp-task-product-image[data-image-state="failed"]').waitFor()
          const preview = identity.getByRole('button', { name: /^查看.+大图$/ })
          page.productImageProbe.failReferences = false
          await preview.press('Enter')
          await page.waitForFunction(() => document.querySelector('.erp-task-image-preview__stage img')?.naturalWidth === 400)
          await closeImage(page)
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
