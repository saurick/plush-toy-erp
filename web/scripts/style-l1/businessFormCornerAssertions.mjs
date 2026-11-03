import assert from 'node:assert/strict'
import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { chooseSelectOption } from './selectControlActions.mjs'
import { assertCurrentBusinessSection } from './businessFormSectionAssertions.mjs'
import { parseRgb } from './colorAssertions.mjs'

const sectionHeading = '.erp-business-form-heading, .erp-line-editor__heading[data-line-items-title="true"]'

async function inspectSectionEdge(section, edge) {
  await section.evaluate((node, side) => node.scrollIntoView({ block: side, inline: 'nearest', behavior: 'instant' }), edge)
  await waitForFiniteAnimations(section.page())
  // 滚动会按阅读位置切换分区；重新聚焦被检查的分区，且不改变边缘位置。
  await section.evaluate((node) => { node.blur(); node.focus({ preventScroll: true }) })
  await section.page().waitForFunction((node) => node.dataset.currentFormSection === 'true', await section.elementHandle())
  return section.evaluate((node, { side, headingSelector }) => {
    const rect = node.getBoundingClientRect()
    const style = getComputedStyle(node)
    const heading = node.querySelector(headingSelector)
    const headingStyle = heading && getComputedStyle(heading)
    const headingRect = heading?.getBoundingClientRect()
    const clip = { left: 0, top: 0, right: innerWidth, bottom: innerHeight }
    for (let parent = node.parentElement; parent; parent = parent.parentElement) {
      const bounds = parent.getBoundingClientRect()
      const parentStyle = getComputedStyle(parent)
      // display: contents 不生成裁剪盒，不能把它的零尺寸当作可视边界。
      if (parentStyle.display === 'contents') continue
      if (/(auto|scroll|hidden|clip)/u.test(parentStyle.overflowX)) {
        clip.left = Math.max(clip.left, bounds.left + parent.clientLeft)
        clip.right = Math.min(clip.right, bounds.left + parent.clientLeft + parent.clientWidth)
      }
      if (/(auto|scroll|hidden|clip)/u.test(parentStyle.overflowY)) {
        clip.top = Math.max(clip.top, bounds.top + parent.clientTop)
        clip.bottom = Math.min(clip.bottom, bounds.top + parent.clientTop + parent.clientHeight)
      }
    }
    const inset = 1.25
    const y = side === 'start' ? rect.top + inset : rect.bottom - inset
    const corners = [rect.left + inset, rect.right - inset].map((x) => {
      const hits = document.elementsFromPoint(x, y)
      const hit = hits[0]
      const paintedLayers = []
      // 透明后代可以溢出圆角；只检查实际命中的背景层，不把未覆盖采样点的祖先计入。
      for (const layer of hits.filter((candidate) => candidate !== node && node.contains(candidate))) {
        const paint = getComputedStyle(layer)
        if (!['transparent', 'rgba(0, 0, 0, 0)'].includes(paint.backgroundColor) || paint.backgroundImage !== 'none') {
          paintedLayers.push({ className: layer.className, background: paint.backgroundColor, image: paint.backgroundImage })
        }
      }
      return { x, y, hitFound: Boolean(hit), hit: hit?.className, paintedLayers, paintedByChild: paintedLayers.length > 0 }
    })
    return {
      title: node.dataset.formSection,
      selected: node.dataset.currentFormSection === 'true',
      mode: node.dataset.heading,
      edge: side,
      rect: rect.toJSON(),
      clip,
      corners,
      borders: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth],
      borderColors: [style.borderTopColor, style.borderRightColor, style.borderBottomColor, style.borderLeftColor],
      radii: [style.borderTopLeftRadius, style.borderTopRightRadius, style.borderBottomRightRadius, style.borderBottomLeftRadius],
      background: style.backgroundColor,
      heading: headingRect ? {
        className: heading.className,
        topInset: headingRect.top - rect.top,
        leftInset: headingRect.left - rect.left,
        rightInset: rect.right - headingRect.right,
        radii: [headingStyle.borderTopLeftRadius, headingStyle.borderTopRightRadius],
        background: headingStyle.backgroundColor,
      } : null,
    }
  }, { side: edge, headingSelector: sectionHeading })
}

export async function assertBusinessFormCorners(page, editor) {
  await waitForFiniteAnimations(page)
  const initialUnsaved = await editor.getAttribute('data-unsaved')
  const sections = await editor.locator('[data-form-section]').evaluateAll((nodes) => nodes.map((node) => ({ id: node.id, title: node.dataset.formSection })))
  const evidence = []
  for (const { id, title } of sections) {
    const section = editor.locator(`[id=${JSON.stringify(id)}]`)
    const nav = editor.getByRole('navigation', { name: '表单分区' })
    if (!(await section.isVisible())) {
      const button = nav.locator(`button[aria-controls=${JSON.stringify(id)}]`).filter({ visible: true })
      if (await button.isVisible()) await button.click()
      else await chooseSelectOption(nav.getByRole('combobox'), id)
    }
    await section.locator(sectionHeading).first()
      .locator('.erp-business-action-form__section-title-text, h2, strong[role="heading"]').first()
      .click()
    await assertCurrentBusinessSection(page, editor, title)
    const edges = []
    for (const edge of ['start', 'end']) {
      const metrics = await inspectSectionEdge(section, edge)
      const detail = JSON.stringify(metrics)
      assert.equal(metrics.selected, true, `the inspected region is selected: ${detail}`)
      assert.deepEqual(metrics.borders, ['1px', '1px', '1px', '1px'], `selected section keeps its complete border: ${detail}`)
      assert.ok(metrics.radii.every((value) => Number.parseFloat(value) >= 6), `all four section corners remain rounded: ${detail}`)
      assert.ok(metrics.borderColors.every((value) => parseRgb(value)?.[3] > 0), `all four border edges remain painted: ${detail}`)
      assert.ok(parseRgb(metrics.background)?.[3] > 0, `the selected section retains its background: ${detail}`)
      assert.ok(metrics.rect.left >= metrics.clip.left - 0.5 && metrics.rect.right <= metrics.clip.right + 0.5, `section sides are not clipped by their ancestors: ${detail}`)
      const borderY = edge === 'start' ? metrics.rect.top : metrics.rect.bottom
      assert.ok(borderY >= metrics.clip.top - 0.5 && borderY <= metrics.clip.bottom + 0.5, `the inspected border is reachable without clipping: ${detail}`)
      assert.ok(metrics.corners.every((corner) => corner.hitFound && !corner.paintedByChild), `child surfaces do not fill the rounded corner cutouts: ${detail}`)
      if (edge === 'start' && metrics.heading?.topInset <= 1.5) {
        for (const [index, inset] of [metrics.heading.leftInset, metrics.heading.rightInset].entries()) {
          if (inset <= 1.5) assert.ok(Math.abs(Number.parseFloat(metrics.heading.radii[index]) - (Number.parseFloat(metrics.radii[index]) - 1)) <= 0.5, `flush headings follow the inside of the section border: ${detail}`)
        }
      }
      edges.push(metrics)
    }
    const field = section.locator('input:not([type="hidden"]):not(:disabled):not([readonly]), textarea:not(:disabled):not([readonly])').filter({ visible: true }).first()
    let focus = null
    if (await field.count()) {
      await field.scrollIntoViewIfNeeded()
      await field.focus()
      await assertCurrentBusinessSection(page, editor, title)
      focus = await field.evaluate((node) => ({ active: document.activeElement === node, id: node.id || node.getAttribute('aria-label'), sectionOverflow: getComputedStyle(node.closest('[data-form-section]')).overflow }))
      assert.equal(focus.active, true, 'editable fields retain keyboard focus')
      assert.equal(focus.sectionOverflow, 'visible', 'section rounding must not clip the field focus indicator')
    }
    evidence.push({ title, edges, focus })
  }
  assert.equal(await editor.getAttribute('data-unsaved'), initialUnsaved, 'corner inspection does not change the draft')
  return { sections: evidence, initialUnsaved, flat: sections.length === 0 }
}
