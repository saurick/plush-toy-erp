import assert from 'node:assert/strict'
import { closeBusinessFormPage } from './businessFormPageAssertions.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'

async function readEditorGeometry(editor) {
  return editor.evaluate((root) => {
    const body = root.querySelector('.erp-business-form-page__body')
    const bodyStyle = getComputedStyle(body)
    const contentWidth = body.clientWidth - parseFloat(bodyStyle.paddingLeft) - parseFloat(bodyStyle.paddingRight)
    const box = (node) => { const { left, right, top, bottom, width, height } = node.getBoundingClientRect(); return { left, right, top, bottom, width, height } }
    return {
      contentWidth,
      bodyOverflow: body.scrollWidth - body.clientWidth,
      layouts: [...root.querySelectorAll('[data-field-layout]')].filter((node) => node.getClientRects().length).map((node) => {
        const style = getComputedStyle(node)
        return {
          title: node.closest('[data-form-section]').dataset.formSection,
          layout: node.dataset.fieldLayout,
          box: box(node),
          contentWidth: node.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
          fields: [...node.children].filter((field) => field.matches('.ant-form-item') && field.getClientRects().length).map((field) => ({
            label: field.querySelector('label')?.textContent.trim(),
            size: field.classList.contains('erp-business-action-form__field--short') ? 'short' : field.classList.contains('erp-business-action-form__field--wide') ? 'wide' : 'standard',
            full: field.classList.contains('erp-business-action-form__field--full'),
            box: box(field),
          })),
          support: node.dataset.fieldLayout === 'support' ? [...node.children].filter((field) => field.getClientRects().length).map(box) : [],
        }
      }),
      protectedTables: [...root.querySelectorAll('.erp-line-item-table, .erp-bom-parts-table')].map((table) => ({
        inAdaptiveLayout: Boolean(table.closest('[data-field-layout="adaptive"]')),
        headers: [...table.querySelectorAll('thead th')].map((cell) => cell.textContent.trim()),
      })),
    }
  })
}

export function createEditorDensityScenarios(deps, documentScenarios, documents) {
  const variants = [
    ...['customers', 'suppliers', 'materials', 'products', 'product-skus', 'processes', 'production', 'payment', 'sales', 'purchase', 'outsourcing', 'shipment'].map((key) => [key, 'wide', { width: 1920, height: 1080 }]),
    ['sales', 'ultrawide', { width: 3840, height: 2160 }],
    ['production', 'short', { width: 1024, height: 600 }],
    ['customers', 'mobile', { width: 390, height: 844 }],
    ['sales', 'mobile', { width: 390, height: 844 }],
    ['shipment', 'mobile', { width: 390, height: 844 }],
    ['purchase', 'dark', { width: 1440, height: 900 }, 'dark'],
  ]
  const scenarios = variants.map(([key, variant, viewport, themeMode]) => {
    const source = documentScenarios.find((scenario) => scenario.name === `business-form-page-${key}-desktop`)
    const [, , triggerName, title] = documents.find(([name]) => name === key)
    return {
      ...source,
      name: `editor-density-${key}-${variant}`,
      viewport,
      deviceScaleFactor: variant === 'wide' ? 2 : 1,
      themeMode,
      beforeNavigate: async (page) => {
        await source.beforeNavigate?.(page)
        page.on('requestfailed', (request) => {
          if (request.url().includes('/src/')) console.log(`[editor-density] failed module=${new URL(request.url()).pathname} reason=${request.failure()?.errorText}`)
        })
      },
      verify: async (page) => {
        await page.getByRole('button', { name: triggerName }).click()
        const editor = page.locator('.erp-business-form-page:not([hidden])')
        await editor.getByRole('heading', { name: title, exact: true }).waitFor()
        await page.waitForFunction((root) => root.getAttribute('aria-busy') !== 'true', await editor.elementHandle())
        await waitForFiniteAnimations(page)
        const metrics = await readEditorGeometry(editor)
        const detail = JSON.stringify(metrics)
        assert.ok(metrics.layouts.some((layout) => layout.layout === 'adaptive'), `${key} uses the shared field layout`)
        assert.ok(metrics.bodyOverflow <= 1, detail)
        for (const layout of metrics.layouts) {
          for (const field of layout.fields) {
            assert.ok(field.box.left >= layout.box.left - 1 && field.box.right <= layout.box.right + 1, detail)
            if (layout.layout !== 'adaptive' || field.full) continue
            if (metrics.contentWidth <= 520) assert.ok(Math.abs(field.box.width - layout.contentWidth) <= 1, detail)
            else assert.ok(field.box.width <= ({ standard: 420, short: 240, wide: 680 }[field.size] || 420) + 1, detail)
          }
          if (layout.support.length === 2) {
            const [note, attachments] = layout.support
            if (metrics.contentWidth > 720) assert.ok(note.right <= attachments.left + 1 && Math.abs(note.top - attachments.top) <= 1, detail)
            else assert.ok(note.bottom <= attachments.top + 1, detail)
          }
        }
        assert.ok(metrics.protectedTables.every((table) => !table.inAdaptiveLayout), 'original document tables stay outside the adaptive header layout')
        console.log(`[style:l1] editor-density=${JSON.stringify({ key, variant, ...metrics })}`)
        const draft = editor.locator('input.ant-input:visible:not([type="hidden"]):not([role="combobox"]):not([readonly]):not([disabled])').first()
        const value = `布局核对-${key}`
        const longField = editor.locator('.ant-form-item.erp-business-action-form__field--wide input.ant-input:visible:not([role="combobox"]):not([readonly]):not([disabled])').first()
        const longValue = '长内容宽度核对'.repeat(6)
        if (await longField.count()) await longField.fill(longValue)
        if (await draft.count()) {
          await draft.fill(value)
          const node = await draft.elementHandle()
          const links = editor.locator('.erp-business-form-page__section-links:visible button')
          if (await links.count()) {
            await links.last().click()
            await links.first().click()
          }
          assert.equal(await draft.inputValue(), value, 'section navigation preserves the draft')
          if (await longField.count()) assert.equal(await longField.inputValue(), longValue, 'long text remains intact')
          assert.equal(await node.evaluate((field) => field.isConnected), true, 'layout changes retain the same input node')
          await node.dispose()
        }
        const after = await readEditorGeometry(editor)
        assert.ok(after.bodyOverflow <= 1, 'long input stays inside the editor')
        await editor.locator('.erp-business-form-page__body').evaluate((body) => { body.scrollTop = 0 })
        await page.screenshot({ path: `${deps.outputDir}/editor-density-${key}-${variant}-editing.png` })
        if (await editor.getAttribute('data-unsaved') === 'true') {
          await editor.getByRole('button', { name: '返回列表', exact: true }).click()
          const confirmation = page.locator('.ant-modal-confirm:visible')
          await confirmation.waitFor({ state: 'visible' })
          await waitForFiniteAnimations(page)
          await confirmation.getByRole('button', { name: '放弃修改', exact: true }).click()
          await confirmation.waitFor({ state: 'hidden' })
          await editor.waitFor({ state: 'hidden' })
        } else await closeBusinessFormPage(page, editor)
      },
    }
  })
  return [...scenarios, {
    name: 'editor-density-formal-design',
    path: '/__dev/ui-design',
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 2,
    verify: async (page) => {
      await page.getByRole('button', { name: /全屏预览/u }).click()
      const frame = page.frameLocator('iframe[title="ERP 最新可交互设计"]')
      await frame.locator('.nav-item[data-page="sales"]').click()
      await frame.locator('[data-action="new-record"]').click()
      const editor = frame.locator('.form-view')
      await editor.locator('.form-grid--adaptive').first().waitFor()
      const reference = editor.locator('[data-form-field="reference"]')
      await reference.fill('原型布局保留')
      const rows = editor.locator('tbody[data-form-row]')
      if (!(await rows.count())) await editor.getByRole('button', { name: '添加订货明细', exact: true }).first().click()
      const count = await rows.count()
      const headers = await editor.locator('table thead th').allTextContents()
      await rows.first().locator('td').first().click()
      await editor.locator('.line-editor-toolbar').getByRole('button', { name: /^复制/u }).click()
      assert.equal(await rows.count(), count + 1)
      assert.deepEqual(await editor.locator('table thead th').allTextContents(), headers, 'formal design retains the original line columns')
      assert.equal(await reference.inputValue(), '原型布局保留')
      const geometry = await editor.evaluate((root) => {
        const children = [...root.querySelector('.form-grid--support').children].map((node) => node.getBoundingClientRect().toJSON())
        return { overflow: root.scrollWidth - root.clientWidth, children }
      })
      assert.equal(geometry.overflow, 0)
      assert.ok(geometry.children[0].right <= geometry.children[1].left + 1)
      await page.screenshot({ path: `${deps.outputDir}/editor-density-formal-design-editing.png` })
    },
  }]
}
