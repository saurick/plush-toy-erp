import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'

const materialsPath = '/erp/master/materials'
const inventoryPath = '/erp/warehouse/inventory?view=balances'
const imageBytes = readFileSync(new URL('../../src/erp/data/bom-example-images/materials.jpg', import.meta.url))
const attachmentImageBytes = readFileSync(new URL('../../../scripts/qa/fixtures/manual-acceptance-image.png', import.meta.url))
const docName = '供应商色卡及来料颜色对照说明资料.png'

function rpcReply(route, body, data) {
  return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({
    jsonrpc: '2.0', id: body.id, result: { code: 0, message: 'OK', data },
  }) })
}

export function createMaterialMediaScenario(deps) {
  const { assert, customerRuntimeEffectiveSession, gotoScenarioPath } = deps
  const calls = []
  const evidence = []
  let image
  let nextID
  let creates
  let rejectNewImageReadback
  return {
    name: 'material-media-editor-and-inventory',
    path: materialsPath,
    auth: 'admin',
    effectiveSession: customerRuntimeEffectiveSession,
    viewport: { width: 1440, height: 900 },
    beforeNavigate: async (page) => {
      calls.length = 0
      evidence.length = 0
      nextID = 7000
      image = null
      creates = 0
      rejectNewImageReadback = true
      await page.route('**/rpc/masterdata', async (route) => {
        const body = route.request().postDataJSON()
        if (body.method !== 'create_material') return route.fallback()
        creates += 1
        return rpcReply(route, body, { material: { ...body.params, id: 77, is_active: true } })
      })
      await page.route('**/rpc/attachment', async (route) => {
        const body = route.request().postDataJSON()
        const params = body.params || {}
        if (body.method === 'list_material_image_references') {
          if (rejectNewImageReadback && image?.owner_id === 77 && params.material_ids.includes(77)) {
            rejectNewImageReadback = false
            return rpcReply(route, body, { images: [] })
          }
          return rpcReply(route, body, { images: params.material_ids.map((id) => ({
            material_id: id, image_attachment_id: image?.owner_id === id ? image.id : 0,
          })) })
        }
        if (body.method === 'list_attachments' && params.owner_type === 'material') {
          return rpcReply(route, body, { attachments: evidence.filter((item) => item.owner_id === params.owner_id) })
        }
        if (body.method === 'upload_attachment' && params.owner_type === 'material') {
          calls.push({ type: params.attachment_type, ownerID: params.owner_id })
          const bytes = Buffer.from(params.content_base64, 'base64')
          const saved = {
            ...params, id: ++nextID, file_size: bytes.length, created_at: 1794358800,
            sha256: createHash('sha256').update(bytes).digest('hex'), slot_key: params.slot_key ?? null,
          }
          if (params.attachment_type === 'material_image') image = saved
          else evidence.push(saved)
          return rpcReply(route, body, { attachment: saved })
        }
        if (body.method === 'download_attachment' && image?.id === params.id) {
          return rpcReply(route, body, { attachment: image })
        }
        if (body.method === 'clear_material_image') {
          calls.push({ type: 'clear', ownerID: params.material_id })
          if (image?.id === params.id && image?.owner_id === params.material_id) image = null
          return rpcReply(route, body, { cleared: true })
        }
        return route.fallback()
      })
      await page.route('**/rpc/inventory', async (route) => {
        const body = route.request().postDataJSON()
        if (body.method !== 'list_inventory_balances') return route.fallback()
        const row = {
          subject_type: 'MATERIAL', subject_id: 1, warehouse_id: 1, unit_id: 1, stock_category: 'MAIN',
          quantity: '12.5', active_reserved_quantity: '0', available_quantity: '12.5', updated_at: 1794358800,
        }
        return rpcReply(route, body, {
          inventory_balances: [{ ...row, id: 351, lot_id: 401 }, { ...row, id: 352, lot_id: 403 }],
          total: 2, limit: body.params.limit || 50, offset: body.params.offset || 0,
        })
      })
    },
    verify: async (page) => {
      const editor = page.locator('.erp-business-form-page:not([hidden])').filter({ hasText: /(?:编辑|新建)材料/u })
      const showMedia = async () => {
        const tab = editor.getByRole('tab', { name: '图片与附件', exact: true })
        if (await tab.isVisible()) await tab.click()
      }
      const editMaterial = async () => {
        await page.locator('tbody tr').filter({ hasText: 'MAT-STYLE-L1' }).first().dblclick()
        await editor.waitFor({ state: 'visible' })
        await showMedia()
      }
      const save = async () => {
        await editor.getByRole('button', { name: /^保\s*存$/u }).click()
        await editor.waitFor({ state: 'hidden' })
      }
      const inventoryRows = page.locator('tbody tr').filter({ hasText: 'MAT-STYLE-L1' })
      const thumbnails = inventoryRows.getByRole('button', { name: /查看.*样式材料.*参考图大图/u })
      const measureMedia = () => editor.locator('.erp-material-record-media__layout').evaluate((layout) => {
        const reference = layout.querySelector('.erp-material-record-media__reference').getBoundingClientRect()
        const attachments = layout.querySelector('.erp-material-record-media__attachments').getBoundingClientRect()
        return {
          sideBySide: attachments.left > reference.right && Math.abs(attachments.top - reference.top) <= 1,
          stacked: attachments.top > reference.bottom && Math.abs(attachments.left - reference.left) <= 1,
          widerAttachments: attachments.width > reference.width,
          overflow: layout.scrollWidth - layout.clientWidth,
        }
      })
      await editMaterial()
      const reference = editor.getByRole('region', { name: '库存参考图', exact: true })
      const setPhoto = reference.getByRole('button', { name: '设置库存参考图', exact: true })
      const changePhoto = reference.getByRole('button', { name: '更换库存参考图', exact: true })
      await setPhoto.waitFor({ state: 'visible' })
      await reference.getByText('选一张材料实物照，保存后显示在库存列表，供仓库认料。', { exact: true }).waitFor({ state: 'visible' })
      await editor.getByText('放规格书、色卡、包装图样等资料；在库存点材料名查看。', { exact: true }).waitFor({ state: 'visible' })
      assert.deepEqual(await measureMedia(), { sideBySide: true, stacked: false, widerAttachments: true, overflow: 0 })
      const attachments = editor.getByRole('region', { name: '材料附件' })
      await attachments.getByRole('button', { name: '选择附件', exact: true }).waitFor({ state: 'visible' })
      await attachments.locator('input[type="file"]').first().setInputFiles({ name: docName, mimeType: 'image/png', buffer: attachmentImageBytes })
      await attachments.getByText('保存后上传', { exact: true }).waitFor({ state: 'visible' })
      assert.equal(await setPhoto.isVisible(), true, '选择图片附件不应设置库存参考图')
      await reference.getByLabel('选择库存参考图').setInputFiles({ name: '参考图.jpg', mimeType: 'image/jpeg', buffer: imageBytes })
      await changePhoto.waitFor({ state: 'visible' })
      await reference.getByRole('button', { name: /查看.*参考图大图/u }).waitFor({ state: 'visible' })
      const desktopViewport = page.viewportSize()
      await page.setViewportSize({ width: 820, height: desktopViewport.height })
      await showMedia()
      assert.deepEqual(await measureMedia(), { sideBySide: false, stacked: true, widerAttachments: false, overflow: 0 })
      await changePhoto.waitFor({ state: 'visible' })
      await attachments.getByText(docName, { exact: true }).waitFor({ state: 'visible' })
      await page.setViewportSize(desktopViewport)
      await showMedia()
      assert.deepEqual(await measureMedia(), { sideBySide: true, stacked: false, widerAttachments: true, overflow: 0 })
      assert.deepEqual(calls, [], '选图和选文件不得提前写入')
      assert.equal(await attachments.getByRole('button', { name: /上传 \d+ 个文件/u }).count(), 0)
      await save()
      assert.deepEqual(calls, [{ type: 'material_image', ownerID: 1 }, { type: 'evidence', ownerID: 1 }])

      await gotoScenarioPath(page, inventoryPath)
      await thumbnails.last().waitFor({ state: 'visible' })
      assert.equal(await thumbnails.count(), 2, '同一材料的两个批次共用参考图')
      await thumbnails.first().click()
      await page.getByRole('button', { name: '关闭图片预览', exact: true }).click()
      await inventoryRows.first().locator('.erp-inventory-material-identity__link').click()
      const details = page.getByRole('dialog', { name: /材料资料/u })
      await details.getByText(docName, { exact: true }).waitFor({ state: 'visible' })
      assert.equal(await details.getByRole('button', { name: '选择附件' }).count(), 0, '库存入口不得上传附件')
      await details.locator('.ant-modal-close').click()

      await gotoScenarioPath(page, materialsPath)
      await editMaterial()
      await editor.getByRole('button', { name: '移除图片', exact: true }).click()
      await save()
      assert.deepEqual(calls.at(-1), { type: 'clear', ownerID: 1 })
      assert.equal(evidence.length, 1, '移除参考图不得撤销普通附件')
      await gotoScenarioPath(page, inventoryPath)
      await inventoryRows.last().waitFor({ state: 'visible' })
      assert.equal(await thumbnails.count(), 0)
      assert.equal(await inventoryRows.first().locator('.erp-inventory-material-identity__link').count(), 1, '无图材料保留名称和资料入口')

      await gotoScenarioPath(page, materialsPath)
      await page.getByRole('button', { name: /新建材料/u }).click()
      await editor.waitFor({ state: 'visible' })
      await editor.getByRole('textbox', { name: /名称/u }).fill('参考图重试材料')
      await editor.getByRole('combobox', { name: /库存类别/u }).click()
      await page.locator('.ant-select-dropdown:visible').getByText('主料', { exact: true }).click()
      await showMedia()
      await editor.getByLabel('选择库存参考图').setInputFiles({ name: '新材料参考图.jpg', mimeType: 'image/jpeg', buffer: imageBytes })
      await attachments.locator('input[type="file"]').first().setInputFiles({ name: '新材料规格.txt', mimeType: 'text/plain', buffer: Buffer.from('新材料规格') })
      await attachments.getByText('保存后上传', { exact: true }).waitFor({ state: 'visible' })
      await editor.getByRole('button', { name: /查看.*参考图大图/u }).waitFor({ state: 'visible' })
      await editor.getByRole('button', { name: /^保\s*存$/u }).click()
      await page.getByText('材料已保存，图片或附件尚未全部确认，请保留当前内容重试。', { exact: true }).waitFor({ state: 'visible' })
      assert.equal(creates, 1)
      assert.deepEqual(calls.filter((call) => call.ownerID === 77), [{ type: 'material_image', ownerID: 77 }])
      await save()
      assert.equal(creates, 1, '重试不得创建第二份材料')
      assert.deepEqual(calls.filter((call) => call.ownerID === 77), [
        { type: 'material_image', ownerID: 77 }, { type: 'evidence', ownerID: 77 },
      ], '读回失败后只确认已上传参考图并继续绑定附件')
    },
  }
}
