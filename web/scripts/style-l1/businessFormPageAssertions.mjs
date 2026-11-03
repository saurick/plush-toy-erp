import assert from 'node:assert/strict'
import { assertLineItemGroupHeaderInteraction } from './businessLineItemDisclosureAssertions.mjs'

const pageTitles = new Set([
  '新建客户档案', '编辑客户',
  '新建供应商或加工厂', '编辑供应商',
  '新建材料档案', '编辑材料',
  '新建产品', '编辑产品', '新建产品规格', '编辑产品规格',
  '新建加工环节', '编辑加工环节',
  '新建生产订单', '编辑生产订单', '查看生产订单',
  '生成来料质检草稿', '登记收付款', '登记红冲',
  '编辑生产领料草稿', '核对成品收仓草稿', '编辑返工草稿',
  '创建员工账号',
  '新建销售订单',
  '编辑销售订单',
  '新建采购订单',
  '编辑采购订单',
  '新建加工合同',
  '编辑加工合同',
  '新建出货单',
  '编辑出货草稿',
  '查看出货明细',
  '新建 BOM 草稿',
  '编辑 BOM 草稿',
  '查看 BOM 版本',
  '复制 BOM 新版本',
  '检查并保存导入草稿',
])

export function isBusinessFormPageTitle(title) {
  return pageTitles.has(title) || title.startsWith('修改资料：')
}

export async function assertBusinessFormPage(page, editor) {
  await assertFormInputsExposed(editor)
  await assertBusinessNoteTextAreas(editor)
  await assertEditorTableHeadersCentered(editor)
  assert.equal(await editor.getByRole('button', { name: '刷新当前页', exact: true }).count(), 0, '整页表单不提供会丢弃编辑内容的常驻刷新')
  const fullscreen = editor.getByRole('button', { name: /^(全屏编辑|全屏查看|退出全屏)$/u })
  const desktop = page.viewportSize().width >= 768 && !new URL(page.url()).pathname.startsWith('/m/')
  await fullscreen.waitFor({ state: desktop ? 'visible' : 'hidden' })
  assert.equal(await fullscreen.count(), desktop ? 1 : 0)
  const editorHandle = await editor.elementHandle()
  await page
    .waitForFunction(
      (node) => {
        const body = node.querySelector('.erp-business-form-page__body')
        const visibleList = [...node.parentElement.children].some(
          (child) =>
            child !== node &&
            child.matches('.erp-business-data-table-card') &&
            child.getClientRects().length > 0
        )
        return (
          body &&
          body.scrollWidth - body.clientWidth <= 1 &&
          !visibleList
        )
      },
      editorHandle,
      { timeout: 10_000 }
    )
    .catch(() => {})
  const metrics = await editor.evaluate((node) => {
    const rect = node.getBoundingClientRect()
    const body = node.querySelector('.erp-business-form-page__body')
    const footer = node
      .querySelector('.erp-business-form-page__footer')
      ?.getBoundingClientRect()
    return {
      page: node.matches('.erp-business-form-page:not([hidden])'),
      dialog: Boolean(node.closest('[role="dialog"]')),
      masks: document.querySelectorAll('.ant-modal-mask').length,
      viewport: { width: window.innerWidth, height: window.innerHeight },
      rect: {
        left: rect.left,
        right: rect.right,
        top: rect.top,
        bottom: rect.bottom,
      },
      bodyOverflow: body ? body.scrollWidth - body.clientWidth : -1,
      footer: footer ? { top: footer.top, bottom: footer.bottom } : null,
      ancestors: (() => {
        const entries = []
        for (let parent = node; parent && entries.length < 8; parent = parent.parentElement) {
          const style = getComputedStyle(parent)
          const bounds = parent.getBoundingClientRect()
          entries.push({ className: parent.className, height: bounds.height, display: style.display, flex: style.flex, minHeight: style.minHeight, overflow: style.overflow, rows: style.gridTemplateRows })
        }
        return entries
      })(),
      visibleList: [...node.parentElement.children].some(
        (child) =>
          child !== node &&
          child.matches('.erp-business-data-table-card') &&
          child.getClientRects().length > 0
      ),
    }
  })
  assert.equal(metrics.page, true, JSON.stringify(metrics))
  assert.equal(metrics.dialog, false)
  assert.equal(metrics.masks, 0)
  assert.equal(metrics.visibleList, false)
  assert.ok(
    metrics.rect.left >= 0 && metrics.rect.right <= metrics.viewport.width + 1,
    JSON.stringify(metrics)
  )
  assert.ok(
    metrics.bodyOverflow >= 0 && metrics.bodyOverflow <= 1,
    JSON.stringify(metrics)
  )
  assert.ok(
    metrics.footer &&
      metrics.footer.top > metrics.rect.top &&
      metrics.footer.bottom <= metrics.viewport.height + 1,
    JSON.stringify(metrics)
  )
  const inTask = /^\/m\/[a-z_]+\/tasks$/u.test(new URL(page.url()).pathname)
  await editor.getByRole('button', { name: inTask ? '返回办理' : '返回列表', exact: true }).waitFor()
  await assertLineItemGroupHeaderInteraction(page, editor)
}

export async function assertEditorTableHeadersCentered(editor) {
  const headers = await editor.evaluate((root) => {
    const tables = root.querySelectorAll('.erp-line-item-table, .erp-compact-field-table > table, .erp-bom-parts-table, .erp-contact-editor__table')
    return [...tables].flatMap((table) => [...table.querySelectorAll('thead th')].flatMap((cell) => {
      const style = getComputedStyle(cell)
      const box = cell.getBoundingClientRect()
      if (style.display !== 'table-cell' || !box.width || !box.height) return []
      const range = document.createRange()
      range.selectNodeContents(cell)
      const content = range.getBoundingClientRect()
      return [{
        table: table.className || table.getAttribute('aria-label'),
        text: cell.textContent.trim(),
        textAlign: style.textAlign,
        verticalAlign: style.verticalAlign,
        horizontalOffset: content.left + content.width / 2 - box.left - box.width / 2,
        verticalOffset: content.top + content.height / 2 - box.top - box.height / 2,
      }]
    }))
  })
  for (const header of headers) {
    const detail = JSON.stringify(header)
    assert.equal(header.textAlign, 'center', `编辑表头水平居中：${detail}`)
    assert.equal(header.verticalAlign, 'middle', `编辑表头上下居中：${detail}`)
    assert.ok(Math.abs(header.horizontalOffset) <= 2, `列名、必填标记和帮助入口整体水平居中：${detail}`)
    assert.ok(Math.abs(header.verticalOffset) <= 2, `列名、必填标记和帮助入口整体上下居中：${detail}`)
  }
  if (headers.length) console.log(`[style:l1] editor-table-headers=${JSON.stringify({ columns: headers.length, tables: [...new Set(headers.map((header) => header.table))], maxHorizontalOffset: Math.max(...headers.map((header) => Math.abs(header.horizontalOffset))), maxVerticalOffset: Math.max(...headers.map((header) => Math.abs(header.verticalOffset))) })}`)
}

export async function assertBusinessNoteTextAreas(root) {
  const notes = await root.locator('input, textarea').evaluateAll((nodes) => nodes
    .filter((node) => node.getClientRects().length > 0 && node.clientWidth > 0)
    .filter((node) => /备注/u.test([
      node.getAttribute('aria-label'),
      ...[...(node.labels || [])].map((label) => label.textContent),
      node.closest('.field')?.querySelector('label')?.textContent,
    ].join(' ')) || /(?:^|_)(?:note|decision_note|price_condition_note)$/u.test(node.id))
    .map((node) => {
      const style = getComputedStyle(node)
      return {
        label: node.getAttribute('aria-label') || node.id,
        tag: node.tagName,
        height: node.clientHeight,
        padding: parseFloat(style.paddingTop) + parseFloat(style.paddingBottom),
        lineHeight: parseFloat(style.lineHeight),
        overflow: node.scrollHeight - node.clientHeight,
        fontSize: style.fontSize,
        inline: node.getAttribute('style'),
      }
    }))
  for (const note of notes) {
    assert.equal(note.tag, 'TEXTAREA', `备注使用多行文本域：${JSON.stringify(note)}`)
    assert.ok(note.height - note.padding >= note.lineHeight * 2 - 1, `所有备注至少两行：${JSON.stringify(note)}`)
    assert.ok(note.overflow <= 1, `备注随内容增高：${JSON.stringify(note)}`)
  }
}

export async function closeBusinessFormPage(page, editor) {
  const root = await editor.elementHandle()
  const inTask = /^\/m\/[a-z_]+\/tasks$/u.test(new URL(page.url()).pathname)
  await editor.getByRole('button', { name: inTask ? '返回办理' : '返回列表', exact: true }).click()
  // 退出动作会重新核对表单值，等待实际确认结果，避免读取尚未更新的 dirty 标记。
  await page.waitForFunction((element) =>
    !element.isConnected || element.hidden || !element.getClientRects().length ||
    [...document.querySelectorAll('.ant-modal-confirm button')].some((button) =>
      button.textContent.trim() === '放弃修改' && button.getClientRects().length > 0
    ), root)
  if (await editor.isVisible()) {
    await page.getByRole('button', { name: '放弃修改', exact: true }).click()
  }
  await root.dispose()
  await editor.waitFor({ state: 'hidden' })
}

export async function assertFormInputsExposed(editor) {
  const hiddenByDisclosure = await editor.evaluate((root) =>
    [...root.querySelectorAll('details input, details textarea, details select')]
      .filter((input) => input.type !== 'hidden' && !input.closest('.ant-form-item-hidden'))
      .map((input) => input.id || input.getAttribute('aria-label') || input.tagName)
  )
  assert.deepEqual(hiddenByDisclosure, [], '业务输入不能放在可折叠区域')
  for (const field of await editor.locator('.erp-line-item-details__fields .ant-form-item:not(.ant-form-item-hidden), .erp-contact-editor__note-editor textarea, .erp-production-order-line__supplement .ant-form-item').all()) {
    if (await field.isVisible()) continue
    const panelID = await field.evaluate((node) => node.closest('.erp-line-item-table__details-row[hidden], .erp-contact-editor__note-editor[hidden]')?.id || '')
    assert.ok(panelID, '办理字段直接可见，补充资料必须有明确的逐行展开入口')
    const toggle = editor.locator(`button[aria-controls=${JSON.stringify(panelID)}]`)
    assert.equal(await toggle.getAttribute('aria-expanded'), 'false')
    assert.ok(await toggle.isVisible(), '收起资料的入口可发现')
    const node = await field.elementHandle()
    await toggle.click()
    assert.ok(await field.isVisible(), '逐行展开后字段可实际编辑')
    await toggle.click()
    assert.equal(await node.evaluate((element) => element.isConnected), true, '收起不卸载字段')
    await node.dispose()
  }
  for (const panel of await editor.locator('.business-attachment-panel').all()) {
    assert.ok(await panel.locator('.business-attachment-panel__content').isVisible(), '空附件与已有附件均直接显示')
    const upload = panel.getByRole('button', { name: '选择附件', exact: true })
    if (await upload.count()) assert.ok(await upload.isVisible(), '有上传权限时入口直接可见')
  }
}
