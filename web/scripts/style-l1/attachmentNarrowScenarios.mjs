import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { waitForFiniteAnimations } from './browserReadiness.mjs'

async function assertAttachmentToolbar(panel, name) {
  await waitForFiniteAnimations(panel.page())
  const metrics = await panel.evaluate((root) => {
    const toolbar = root.querySelector('.business-attachment-panel__toolbar')
    const bounds = (node) => { const r = node.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height } }
    const controls = [...toolbar.querySelectorAll('.erp-sliding-segmented, button')].filter((node) => node.getClientRects().length).map((node) => ({ text: node.textContent.trim(), ...bounds(node) }))
    return { panel: bounds(root), toolbar: bounds(toolbar), overflow: toolbar.scrollWidth - toolbar.clientWidth, panelOverflow: root.scrollWidth - root.clientWidth, controls, fileNames: [...root.querySelectorAll('.business-attachment-panel__file-name')].map((node) => ({ width: node.getBoundingClientRect().width, height: node.getBoundingClientRect().height })), labels: [...toolbar.querySelectorAll('.ant-segmented-item-label')].map((node) => ({ text: node.textContent, width: node.clientWidth, scroll: node.scrollWidth })), style: { minWidth: getComputedStyle(toolbar).minWidth, wrap: getComputedStyle(toolbar).flexWrap } }
  })
  const detail = `${name}: ${JSON.stringify(metrics)}`
  assert.ok(metrics.overflow <= 1 && metrics.panelOverflow <= 1, detail)
  assert.ok(metrics.toolbar.left >= metrics.panel.left - 1 && metrics.toolbar.right <= metrics.panel.right + 1, detail)
  assert.ok(metrics.controls.every((control) => control.left >= metrics.toolbar.left - 1 && control.right <= metrics.toolbar.right + 1 && control.top >= metrics.toolbar.top - 1 && control.bottom <= metrics.toolbar.bottom + 1), detail)
  for (let index = 0; index < metrics.controls.length; index += 1) {
    const current = metrics.controls[index]
    for (const previous of metrics.controls.slice(0, index)) assert.ok(current.left >= previous.right - 1 || current.right <= previous.left + 1 || current.top >= previous.bottom - 1 || current.bottom <= previous.top + 1, `附件分类、说明和刷新不能重叠 ${detail}`)
  }
  assert.ok(metrics.labels.every((label) => label.scroll <= label.width + 1), `分类与数量完整可读 ${detail}`)
  assert.ok(metrics.fileNames.every((file) => file.width > 0 && file.height > 0), `附件操作不能将文件名挤成零宽 ${detail}`)
  console.log(`[attachment-toolbar] ${detail}`)
}

export function createAttachmentNarrowScenarios({ outputDir }, base) {
  return [
    ['bom-720', 720, 'light', 'draft'],
    ['bom-dark-720', 720, 'dark', 'draft'],
    ['bom-390', 390, 'light', 'draft'],
    ['bom-320', 320, 'light', 'draft'],
    ['bom-readonly-720', 720, 'light', 'readonly'],
    ['bom-new-720', 720, 'light', 'new'],
  ].map(([name, width, themeMode, mode]) => ({
    ...base,
    name: `attachment-toolbar-${name}`,
    viewport: { width, height: 1000 },
    themeMode,
    verify: async (page) => {
      if (mode === 'new') await page.getByRole('button', { name: /新建 BOM$/u }).click()
      else await page.getByText(mode === 'readonly' ? 'BOM-STYLE-L1' : 'BOM-STYLE-DRAFT', { exact: true }).dblclick()
      const editor = page.locator('.erp-bom-editor:visible')
      await editor.getByRole('radio', { name: '目录', exact: true }).check()
      const panel = editor.getByRole('region', { name: 'BOM 附件', exact: true })
      await panel.waitFor()
      await panel.scrollIntoViewIfNeeded()
      if (mode !== 'new') await panel.getByText(mode === 'readonly' ? '生效版工艺说明.txt' : '草稿工艺说明.txt', { exact: true }).waitFor({ state: 'attached' })
      await assertAttachmentToolbar(panel, `${name}-initial`)
      const fileInput = panel.locator('input[type="file"]').first()
      const field = editor.getByLabel('部位 1', { exact: true })
      const fieldNode = await field.count() ? await field.elementHandle() : null
      const before = fieldNode ? await field.inputValue() : null
      const uploadCalls = []
      page.on('request', (request) => {
        if (request.method() === 'POST' && request.url().includes('/rpc/attachment') && request.postDataJSON()?.method === 'upload_attachment') uploadCalls.push(true)
      })
      if (mode !== 'readonly') {
        const inputNode = await fileInput.elementHandle()
        await fileInput.setInputFiles({ name: '窄屏待保存说明.txt', mimeType: 'text/plain', buffer: Buffer.from('附件工具栏布局回归') })
        await panel.getByText('窄屏待保存说明.txt', { exact: true }).waitFor()
        await assertAttachmentToolbar(panel, `${name}-pending`)
        assert.equal(await fileInput.evaluate((node, old) => node === old, inputNode), true)
        await inputNode.dispose()
      }
      await panel.locator('.ant-segmented-item').filter({ hasText: /^图片\s+\d+$/u }).click()
      assert.equal(await panel.getByRole('radio', { name: /^图片/u }).isChecked(), true)
      await assertAttachmentToolbar(panel, `${name}-images`)
      await panel.locator('.ant-segmented-item').filter({ hasText: /^文件\s+\d+$/u }).click()
      assert.equal(await panel.getByRole('radio', { name: /^文件/u }).isChecked(), true)
      if (mode !== 'readonly') await panel.getByText('窄屏待保存说明.txt', { exact: true }).waitFor()
      await assertAttachmentToolbar(panel, `${name}-files`)
      if (mode !== 'new') {
        await panel.getByRole('button', { name: '刷新列表', exact: true }).click()
        await panel.locator('[aria-label="附件列表"][aria-busy="false"]').waitFor({ state: 'attached' })
        if (mode !== 'readonly') await panel.getByText('窄屏待保存说明.txt', { exact: true }).waitFor()
        await assertAttachmentToolbar(panel, `${name}-refreshed`)
      }
      assert.equal(uploadCalls.length, 0, '筛选、刷新与选择附件均不自动上传')
      if (fieldNode) {
        assert.equal(await field.inputValue(), before, '附件操作不改写 BOM 字段')
        assert.equal(await field.evaluate((node, old) => node === old, fieldNode), true)
        await fieldNode.dispose()
      }
      const overflow = await editor.evaluate((node) => { const body = node.querySelector('.erp-business-form-page__body'); return body.scrollWidth - body.clientWidth })
      assert.ok(overflow <= 1, `${name}: BOM 正文不横向溢出 ${overflow}`)
      await page.setViewportSize({ width: 1440, height: 1000 })
      await assertAttachmentToolbar(panel, `${name}-restored`)
      if (mode !== 'readonly') await panel.getByText('窄屏待保存说明.txt', { exact: true }).waitFor()
      await page.setViewportSize({ width, height: 1000 })
      await panel.scrollIntoViewIfNeeded()
      await assertAttachmentToolbar(panel, `${name}-resized`)
      await page.screenshot({ path: `${outputDir}/attachment-toolbar-${name}.png` })
    },
  }))
}
