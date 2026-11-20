import assert from 'node:assert/strict'
import { expect as expectLocator } from 'playwright/test'
import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { assertTableStickyHeaderAlignment } from './tableStickyHeaderAssertions.mjs'
import { clickLineItemAction } from './lineEditorActions.mjs'

export async function assertIndependentLineDetails(page, editor, row) {
  const toggle = row.locator('.erp-line-editor__details-toggle')
  if (!(await toggle.count())) return
  const table = row.locator('xpath=ancestor::table[1]')
  assert.deepEqual((await table.locator('thead th').allTextContents()).slice(0, 2), ['补充', '序号'])
  assert.equal((await toggle.innerText()).trim(), '', '展开按钮不再包含序号')
  const host = editor.locator('.erp-line-editor__action-host').first()
  const selected = await host.locator('[data-line-editor-selected="true"]').innerText()
  const panelID = await toggle.getAttribute('aria-controls')
  const panel = row.locator(`[id=${JSON.stringify(panelID)}]`)
  const initial = await toggle.getAttribute('aria-expanded')
  await toggle.focus()
  assert.equal(await host.locator('[data-line-editor-selected="true"]').innerText(), selected, '聚焦展开按钮不切换操作对象')
  await toggle.press('Space')
  await waitForFiniteAnimations(page)
  assert.equal(await toggle.getAttribute('aria-expanded'), initial === 'true' ? 'false' : 'true')
  assert.equal(await panel.isVisible(), initial !== 'true')
  assert.equal(await host.locator('[data-line-editor-selected="true"]').innerText(), selected, '键盘展开不切换顶部操作对象')
  await toggle.click()
  await waitForFiniteAnimations(page)
  assert.equal(await toggle.getAttribute('aria-expanded'), initial)
  assert.equal(await host.locator('[data-line-editor-selected="true"]').innerText(), selected, '鼠标收起不切换顶部操作对象')
  const geometry = await toggle.evaluate((button) => {
    const arrow = button.querySelector('.anticon-right')
    const cell = button.closest('td')
    const sequence = cell.nextElementSibling
    return { cellIndex: cell.cellIndex, sequence: sequence.querySelector('.erp-editable-line-group__number')?.textContent, width: cell.getBoundingClientRect().width, sequenceWidth: sequence.getBoundingClientRect().width, arrowSize: arrow && parseFloat(getComputedStyle(arrow).fontSize), buttonWidth: button.getBoundingClientRect().width, buttonHeight: button.getBoundingClientRect().height }
  })
  assert.equal(geometry.cellIndex, 0)
  assert.ok(Math.abs(geometry.width - 44) <= 1 && Math.abs(geometry.sequenceWidth - 44) <= 1, `补充与序号各占窄列 ${JSON.stringify(geometry)}`)
  assert.equal(geometry.arrowSize, 12, '展开使用现有 Ant 小箭头')
  assert.ok(geometry.sequence && geometry.buttonWidth >= 32 && geometry.buttonHeight >= 32, JSON.stringify(geometry))
}

export async function assertCompactLineNoteDisclosure(page, editor, { persistentSelectors = [] } = {}) {
  await waitForFiniteAnimations(page)
  const row = editor.locator('.erp-compact-field-table__row:visible').first()
  const note = row.locator('textarea').first()
  const compact = await row.evaluate((node) => node.closest('.erp-line-editor')?.dataset.lineEditorCompact === 'true')
  for (const selector of persistentSelectors) assert.equal(await row.locator(selector).isVisible(), true, '办理字段保持可见')
  if (compact) {
    assert.equal(await note.isVisible(), true, '窄区域直接展示备注')
    assert.equal(await row.locator('.erp-line-editor__details-toggle').count(), 0)
    return
  }
  const toggle = row.locator('.erp-line-editor__details-toggle')
  assert.equal(await toggle.getAttribute('aria-expanded'), 'false', '桌面备注默认收起')
  assert.equal(await note.isVisible(), false)
  const node = await note.elementHandle()
  const original = await note.inputValue()
  await toggle.press('Enter')
  await waitForFiniteAnimations(page)
  assert.equal(await note.isVisible(), true, '行号箭头支持键盘展开')
  await note.fill('核对后保留的明细说明')
  await waitForFiniteAnimations(page)
  await toggle.click()
  assert.equal(await note.isVisible(), false)
  assert.equal(await note.inputValue(), '核对后保留的明细说明', '收起保留草稿')
  for (const selector of persistentSelectors) assert.equal(await row.locator(selector).isVisible(), true, '收起不隐藏办理字段')
  await toggle.click()
  assert.equal(await note.evaluate((current, previous) => current === previous, node), true, '展开不重建备注字段')
  await note.fill(original)
  await toggle.click()
  await node.dispose()
}

export async function assertLineItemToolbarLayout(page, editor) {
  const controls = editor.locator('.erp-line-item-group-controls:visible').first()
  if (!(await controls.count())) return
  const metrics = await controls.evaluate((node) => {
    const header = node.closest('.erp-sales-order-lines-form__head')
    if (!header) return { merged: false }
    const box = header.getBoundingClientRect()
    const buttons = [...header.querySelectorAll('button')].map((button) => {
      const rect = button.getBoundingClientRect()
      return { label: button.getAttribute('aria-label') || button.textContent.trim(), left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, width: rect.width, height: rect.height, fontSize: parseFloat(getComputedStyle(button).fontSize) }
    }).filter((button) => button.width > 0 && button.height > 0)
    const scope = header.closest('[data-table-scroll-scope]')
    const regions = scope ? [...scope.querySelectorAll('[data-table-scroll-id]')].filter((region) => region.closest('[data-table-scroll-scope]') === scope).map((region) => {
      const id = region.dataset.tableScrollId
      const target = [...document.querySelectorAll('[data-table-scroll-for]')].find((candidate) => candidate.dataset.tableScrollFor === id)
      return { overflowing: region.scrollWidth > region.clientWidth + 1, pairedInHeader: Boolean(target && header.contains(target)), fallbackRows: region.querySelectorAll('.app-table-scroll-top').length, gapAbove: region.getBoundingClientRect().top - box.bottom }
    }) : []
    return { merged: true, title: header.querySelector('[role="heading"]')?.textContent.trim() || '', count: header.querySelector('.erp-line-items-form__group-count')?.textContent.trim(), width: box.width, height: box.height, left: box.left, right: box.right, top: box.top, bottom: box.bottom, touch: matchMedia('(pointer: coarse)').matches || innerWidth < 768, buttons, regions, bom: Boolean(header.closest('.erp-bom-material-groups')) }
  })
  assert.equal(metrics.merged, true, '分组操作属于同一明细标题工具栏')
  assert.match(metrics.count, /^\d+ 组$/u)
  for (const button of metrics.buttons) {
    assert.ok(button.left >= metrics.left - 1 && button.right <= metrics.right + 1 && button.top >= metrics.top - 1 && button.bottom <= metrics.bottom + 1, `操作不溢出工具栏：${JSON.stringify({ metrics, button })}`)
    assert.ok(button.height >= (metrics.touch ? 44 : 32), `保留正常按钮触区：${JSON.stringify(button)}`)
    assert.ok(button.fontSize >= 13, `工具栏不靠缩小字号收口：${JSON.stringify(button)}`)
  }
  for (const region of metrics.regions) {
    assert.equal(region.fallbackRows, 0, '横向查看不另占一排')
    if (region.overflowing) assert.equal(region.pairedInHeader, true, '横向按钮绑定所属明细工具栏')
    if (metrics.bom) assert.ok(region.gapAbove <= 1, `表格直接接在工具栏下方：${JSON.stringify(region)}`)
  }
  if (metrics.bom && metrics.width >= 1100) assert.ok(metrics.height <= 52, `宽屏 BOM 工具栏保持一排：${JSON.stringify(metrics)}`)
  console.log(`[style:l1] line-toolbar-layout=${JSON.stringify({ title: metrics.title, width: metrics.width, height: metrics.height, touch: metrics.touch, regions: metrics.regions.length })}`)
  await assertTableStickyHeaderAlignment(editor)
}

export async function assertLineItemGroupHeaderInteraction(page, editor) {
  const heading = editor.locator('.erp-line-item-disclosure-heading:visible').filter({ has: page.locator('.erp-line-item-disclosure-heading__toggle') }).first()
  if (!(await heading.count())) return
  await waitForFiniteAnimations(page)
  await assertLineItemToolbarLayout(page, editor)
  const toggle = heading.locator('.erp-line-item-disclosure-heading__toggle')
  const original = await toggle.getAttribute('aria-expanded')
  const changed = original === 'true' ? 'false' : 'true'
  const inputs = editor.locator('input, textarea, select')
  const firstInput = await inputs.first().elementHandle()
  const values = await inputs.evaluateAll((nodes) => JSON.stringify(nodes.map((node) => node.value)))
  assert.equal(await toggle.evaluate((node) => node.tagName === 'BUTTON' && node.type === 'button'), true)
  assert.equal((await toggle.textContent()).trim(), '', '分组标题没有独立的展开或收起文字按钮')
  assert.equal(await heading.locator('button button').count(), 0, '标题与产品图片预览不嵌套按钮')
  const coverage = await heading.evaluate((node) => {
    const header = node.getBoundingClientRect()
    const button = node.querySelector('.erp-line-item-disclosure-heading__toggle').getBoundingClientRect()
    return { width: header.width, height: header.height, edges: [header.left - button.left, header.right - button.right, header.top - button.top, header.bottom - button.bottom], touch: matchMedia('(pointer: coarse)').matches }
  })
  assert.ok(coverage.edges.every((edge) => Math.abs(edge) <= 1), `整条标题都在点击范围内：${JSON.stringify(coverage)}`)
  assert.ok(coverage.height >= (coverage.touch || page.viewportSize().width < 768 ? 44 : 38), `分组标题保留足够的点击高度：${JSON.stringify(coverage)}`)
  const controls = editor.locator('.erp-line-item-group-controls:visible').first()
  assert.equal(await controls.getByRole('button', { name: '全部展开', exact: true }).count(), 1)
  assert.equal(await controls.getByRole('button', { name: '全部收起', exact: true }).count(), 1)
  const clickAt = async (area) => {
    await heading.locator('.erp-line-item-disclosure-heading__summary').scrollIntoViewIfNeeded()
    const point = await heading.evaluate((node, target) => {
      const summary = node.querySelector('.erp-line-item-disclosure-heading__summary')
      const bounds = summary.getBoundingClientRect()
      if (target === 'blank') return { x: bounds.left + 3, y: bounds.top + bounds.height / 2 }
      if (target === 'arrow') {
        const arrow = summary.querySelector('.erp-line-item-disclosure-heading__arrow').getBoundingClientRect()
        return { x: arrow.left + arrow.width / 2, y: arrow.top + arrow.height / 2 }
      }
      const title = summary.querySelector('.erp-line-item-disclosure-heading__title')
      const walker = document.createTreeWalker(title, NodeFilter.SHOW_TEXT)
      for (let text = walker.nextNode(); text; text = walker.nextNode()) {
        if (!text.textContent.trim() || text.parentElement.closest('button, [aria-hidden="true"]')) continue
        const range = document.createRange()
        range.selectNodeContents(text)
        const rect = range.getClientRects()[0]
        if (rect?.width > 0) return { x: rect.left + Math.min(4, rect.width / 2), y: rect.top + rect.height / 2 }
      }
      return null
    }, area)
    assert.ok(point, '标题有可点击的业务名称')
    const bounds = await toggle.boundingBox()
    await toggle.click({ position: { x: point.x - bounds.x, y: point.y - bounds.y } })
  }
  await clickAt('title')
  await expectLocator(toggle).toHaveAttribute('aria-expanded', changed)
  await clickAt('blank')
  await expectLocator(toggle).toHaveAttribute('aria-expanded', original)
  await clickAt('arrow')
  await expectLocator(toggle).toHaveAttribute('aria-expanded', changed)
  await toggle.press('Enter')
  await expectLocator(toggle).toHaveAttribute('aria-expanded', original)
  await toggle.press('Space')
  await expectLocator(toggle).toHaveAttribute('aria-expanded', changed)
  await toggle.press('Space')
  await expectLocator(toggle).toHaveAttribute('aria-expanded', original)
  assert.equal(await toggle.evaluate((node) => document.activeElement === node && getComputedStyle(node).outlineStyle !== 'none'), true, '键盘焦点清晰可见')
  assert.equal(await inputs.evaluateAll((nodes) => JSON.stringify(nodes.map((node) => node.value))) === values, true, '切换标题不改写草稿')
  assert.equal(await firstInput.evaluate((node) => node.isConnected), true, '切换标题不重建输入节点')
  await firstInput.dispose()
}

export async function assertBusinessLineItemDisclosure(page, editor) {
  await assertLineItemGroupHeaderInteraction(page, editor)
  const rows = editor.locator('.erp-editable-line-group')
  const first = editor.getByLabel('第 1 条材料名称', { exact: true })
  const second = editor.getByLabel('第 2 条材料名称', { exact: true })
  const firstNode = await first.elementHandle()
  const secondValue = await second.inputValue()
  const note = editor.getByLabel('第 2 条备注', { exact: true })
  const noteValue = await note.inputValue()
  await second.fill('')
  await editor.getByRole('button', { name: '全部收起', exact: true }).click()
  assert.equal(await rows.count(), 2, '折叠保留所有表单行')
  assert.equal(await rows.first().isVisible(), false)
  assert.equal(await rows.last().isVisible(), false)
  assert.equal(await first.inputValue(), '短毛绒')
  assert.equal(await note.inputValue(), noteValue)
  await editor.getByRole('button', { name: '保存', exact: true }).click()
  await second.waitFor({ state: 'visible' })
  await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === '第 2 条材料名称', undefined, { timeout: 5000 })
  assert(await second.evaluate((node) => node === document.activeElement), '整单校验展开并聚焦隐藏组中的错误')
  assert.equal(await rows.first().isVisible(), false, '错误定位不展开无关组')
  await second.fill(secondValue)
  await editor.getByRole('button', { name: '全部展开', exact: true }).click()
  assert.equal(await firstNode.evaluate((node) => node.isConnected), true, '折叠和错误恢复不重建输入节点')
  assert.equal(await note.inputValue(), noteValue)
  await firstNode.dispose()

  const target = page.viewportSize().width >= 768 ? 60 : 8
  for (let index = 3; index <= target; index += 1) {
    await editor.getByRole('button', { name: '添加明细', exact: true }).click()
    await editor.getByLabel(`第 ${index} 条材料名称`, { exact: true }).fill(`演示长单材料 ${index}`)
  }
  assert.equal(await rows.count(), target)
  await editor.getByRole('button', { name: '全部收起', exact: true }).click()
  const hiddenCount = await rows.evaluateAll((nodes) => nodes.filter((node) => getComputedStyle(node).display === 'none').length)
  assert.equal(hiddenCount, target, '长单所有组均可收起，字段仍注册')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)
  assert.equal(overflow, 0, '分组标题和操作不造成整页横向溢出')
  await editor.getByRole('button', { name: '全部展开', exact: true }).click()
  for (let index = target; index >= 3; index -= 1) {
    await clickLineItemAction(rows.nth(index - 1), `移除第 ${index} 条明细`)
  }
  assert.equal(await rows.count(), 2)
  assert.equal(await first.inputValue(), '短毛绒')
  assert.equal(await second.inputValue(), secondValue)
  assert.equal(await note.inputValue(), noteValue)
}
