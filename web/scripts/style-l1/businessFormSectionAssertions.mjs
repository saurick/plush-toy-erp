import assert from 'node:assert/strict'
import { appendFile } from 'node:fs/promises'
import { BUSINESS_FORM_READING_MARGIN } from '../../src/erp/utils/businessFormSections.mjs'
import { chooseSelectOption, readSelectValue } from './selectControlActions.mjs'
import { assertBusinessFormPage } from './businessFormPageAssertions.mjs'
import { waitForFiniteAnimations } from './browserReadiness.mjs'
import { getContrastRatio, parseRgb } from './colorAssertions.mjs'

export async function assertBusinessSectionTitleBands(editor) {
  await waitForFiniteAnimations(editor.page())
  const coverage = await editor.evaluate((root) => [...root.querySelectorAll('[data-form-section]')].filter((section) => section.getClientRects().length).map((section) => ({
    title: section.dataset.formSection,
    headings: [...section.querySelectorAll('.erp-business-form-heading, .erp-line-editor__heading[data-line-items-title="true"]')].filter((heading) => heading.closest('[data-form-section]') === section).map((heading) => heading.querySelector('.erp-business-action-form__section-title-text, h2, strong[role="heading"]')?.textContent.trim()),
  })))
  for (const section of coverage) {
    assert.ok(section.headings.includes(section.title), `every visible section retains its shared title in this mode: ${JSON.stringify(section)}`)
  }
  const { headings, surfaces } = await editor.evaluate((root) => {
    const backgroundLayers = (node) => {
      const layers = []
      for (let ancestor = node; ancestor; ancestor = ancestor.parentElement) {
        layers.unshift(getComputedStyle(ancestor).backgroundColor)
      }
      return layers
    }
    return {
      headings: [...root.querySelectorAll('.erp-business-form-heading')].filter((node) => node.getClientRects().length).map((node) => {
        const style = getComputedStyle(node)
        const label = node.querySelector('.erp-business-action-form__section-title-text, h2, strong[role="heading"]')
        const marker = getComputedStyle(label, '::before')
        return {
          text: (label || node).textContent.trim().slice(0, 80),
          height: node.getBoundingClientRect().height,
          minimumHeight: style.minHeight,
          background: style.backgroundColor,
          foreground: style.color,
          marker: { content: marker.content, width: marker.width, height: marker.height, background: marker.backgroundColor },
          labelLeft: label.getBoundingClientRect().left - node.getBoundingClientRect().left,
          labelTop: label.getBoundingClientRect().top - node.getBoundingClientRect().top,
          divider: getComputedStyle(node, '::after').content,
          singleLineLabel: node.classList.contains('erp-business-action-form__section-title') && label.getBoundingClientRect().height <= 24,
        }
      }),
      surfaces: [...root.querySelectorAll('th, input:disabled, textarea:disabled, input[readonly]')].filter((node) => node.getClientRects().length).slice(0, 12).map(backgroundLayers),
    }
  })
  const backgrounds = surfaces.map((layers) => layers.reduce((surface, layer) => {
    const color = parseRgb(layer)
    assert.ok(color, `readable background color: ${layer}`)
    return color.slice(0, 3).map((channel, index) => channel * color[3] + surface[index] * (1 - color[3]))
  }, [255, 255, 255]))
  for (const heading of headings) {
    const detail = JSON.stringify(heading)
    assert.equal(heading.minimumHeight, '32px', `section titles use the compact shared band: ${detail}`)
    assert.ok(heading.background && !['transparent', 'rgba(0, 0, 0, 0)'].includes(heading.background), `section title is distinct from input and table borders: ${detail}`)
    assert.ok(!['none', 'normal'].includes(heading.marker.content) && heading.marker.width === '3px' && heading.marker.height === '14px', `section titles retain their short marker: ${detail}`)
    assert.ok(heading.labelLeft >= 11 && heading.labelLeft <= 13, `title and marker stay aligned when actions wrap: ${detail}`)
    const fill = parseRgb(heading.background)
    const ink = parseRgb(heading.foreground)
    const marker = parseRgb(heading.marker.background)
    assert.ok(fill && ink && marker, `section heading colors resolve: ${detail}`)
    assert.ok(getContrastRatio(ink, fill) >= 4.5, `section title text remains readable: ${detail}`)
    assert.ok(getContrastRatio(marker, fill) >= 3, `section title marker is visible: ${detail}`)
    for (const background of backgrounds) {
      assert.ok(Math.max(...fill.slice(0, 3).map((channel, index) => Math.abs(channel - background[index]))) >= 8, `section title fill differs from rendered table and readonly surfaces: ${JSON.stringify({ heading, background })}`)
    }
    assert.equal(heading.divider, 'none', `section titles do not retain the decorative long divider: ${detail}`)
    if (heading.singleLineLabel) assert.ok(heading.height >= 32 && heading.height <= 34, `a single-line title stays compact: ${detail}`)
  }
  const editors = await editor.locator('.erp-line-editor__heading[data-line-items-title="true"]').evaluateAll((nodes) => nodes.filter((node) => node.getClientRects().length).map((node) => ({
    title: node.querySelector('strong[role="heading"]')?.textContent.trim(),
    height: node.getBoundingClientRect().height,
    overflow: node.scrollWidth - node.clientWidth,
    color: getComputedStyle(node).color,
    background: getComputedStyle(node).backgroundColor,
  })))
  for (const heading of editors) {
    assert.ok(heading.title, `明细工具栏保留可识别标题：${JSON.stringify(heading)}`)
    assert.ok(heading.height >= 32 && heading.overflow <= 1, `明细标题与动作自然换行：${JSON.stringify(heading)}`)
    assert.ok(getContrastRatio(parseRgb(heading.color), parseRgb(heading.background)) >= 4.5, `中性明细标题保持可读对比度：${JSON.stringify(heading)}`)
  }
}

export async function assertCurrentBusinessSection(page, editor, title) {
  const id = await editor.locator(`[data-form-section=${JSON.stringify(title)}]`).getAttribute('id')
  await page.waitForFunction((sectionID) => document.getElementById(sectionID)?.dataset.currentFormSection === 'true', id)
  assert.equal(await editor.locator('[data-current-form-section="true"]').count(), 1, 'the current region is exclusive within its page or dialog')
  const metrics = await editor.evaluate((root) => {
    const node = root.querySelector('[data-current-form-section="true"]')
    return {
    background: getComputedStyle(node).backgroundColor,
    border: getComputedStyle(node).borderTopWidth,
    borderColor: getComputedStyle(node).borderTopColor,
    neutralTitle: Boolean(node.querySelector('.erp-line-editor__heading[data-line-items-title="true"]')) && !node.querySelector('.erp-business-form-heading'),
    titleBand: node.querySelector('.erp-business-form-heading') ? getComputedStyle(node.querySelector('.erp-business-form-heading')).backgroundColor : null,
    otherBands: [...root.querySelectorAll('[data-form-section]:not([data-current-form-section="true"]) .erp-business-form-heading')].filter((heading) => heading.getClientRects().length).map((heading) => getComputedStyle(heading).backgroundColor),
    otherBackgrounds: [...root.querySelectorAll('[data-form-section]:not([data-current-form-section="true"])')].filter((section) => section.getClientRects().length).map((section) => ({ title: section.dataset.formSection, background: getComputedStyle(section).backgroundColor, border: getComputedStyle(section).borderTopColor })),
    }
  })
  assert.equal(metrics.border, '1px', JSON.stringify(metrics))
  assert.ok(metrics.background && !['transparent', 'rgba(0, 0, 0, 0)'].includes(metrics.background), JSON.stringify(metrics))
  if (metrics.neutralTitle) {
    const edge = parseRgb(metrics.borderColor)
    const fill = parseRgb(metrics.background)
    assert.ok(edge && fill && edge[3] > 0 && Math.max(...edge.slice(0, 3).map((channel, index) => Math.abs(channel - fill[index]))) >= 8, `中性明细标题通过本分区边框与底色明确当前位置：${JSON.stringify(metrics)}`)
  }
  for (const otherBand of metrics.otherBands) {
    if (metrics.neutralTitle) continue
    const current = parseRgb(metrics.titleBand)
    const other = parseRgb(otherBand)
    assert.ok(current && other && Math.max(...current.slice(0, 3).map((channel, index) => Math.abs(channel - other[index]))) >= 20, `the current section is visibly distinct from ordinary title bands: ${JSON.stringify(metrics)}`)
  }
  for (const other of metrics.otherBackgrounds) {
    assert.equal(parseRgb(other.background)?.[3], 0, `inactive section does not retain a selection background: ${JSON.stringify(other)}`)
    assert.equal(parseRgb(other.border)?.[3], 0, `inactive section does not retain a selection border: ${JSON.stringify(other)}`)
  }
}

export async function assertBusinessSectionSpacing(editor, previous) {
  await waitForFiniteAnimations(editor.page())
  const layout = await editor.evaluate((root) => [...root.querySelectorAll('[data-form-section]')]
    .filter((node) => node.getClientRects().length && !node.parentElement.closest('[data-form-section]'))
    .map((node) => {
      const rect = node.getBoundingClientRect()
      const origin = root.getBoundingClientRect()
      let top = rect.top - origin.top
      let left = rect.left - origin.left
      // 点击标题或目录可以滚动；比较内容坐标，避免将正常定位误判为布局跳动。
      for (let ancestor = node.parentElement; ancestor; ancestor = ancestor.parentElement) {
        top += ancestor.scrollTop
        left += ancestor.scrollLeft
        if (ancestor === root) break
      }
      const style = getComputedStyle(node)
      return {
        title: node.dataset.formSection,
        top,
        left,
        width: rect.width,
        height: rect.height,
        borders: [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth],
      }
    }))
  for (const [index, section] of layout.entries()) {
    assert.deepEqual(section.borders, ['1px', '1px', '1px', '1px'], `all selection states reserve the same section border: ${JSON.stringify(section)}`)
    if (index) {
      const before = layout[index - 1]
      const gap = section.top - before.top - before.height
      assert.ok(Math.abs(gap - 12) <= 0.5, `adjacent sections retain 12px of external space: ${JSON.stringify({ before: before.title, after: section.title, gap })}`)
    }
    if (previous) {
      const before = previous.find((entry) => entry.title === section.title)
      assert.ok(before, `section remains mounted while selection changes: ${section.title}`)
      for (const property of ['top', 'left', 'width', 'height']) {
        assert.ok(Math.abs(section[property] - before[property]) <= 0.5, `selection does not move or resize sections: ${JSON.stringify({ title: section.title, property, before: before[property], after: section[property] })}`)
      }
    }
  }
  if (previous) assert.equal(layout.length, previous.length, 'selection keeps the same visible sections')
  if (process.env.STYLE_L1_OUTPUT_DIR) {
    await appendFile(`${process.env.STYLE_L1_OUTPUT_DIR}/section-spacing.jsonl`, `${JSON.stringify({
      path: new URL(editor.page().url()).pathname,
      viewport: editor.page().viewportSize(),
      selectionCompared: Boolean(previous),
      sections: layout,
    })}\n`)
  }
  return layout
}

export async function assertBusinessSectionInteractions(page, editor) {
  await assertBusinessSectionTitleBands(editor)
  const layout = await assertBusinessSectionSpacing(editor)
  const titles = await editor.locator('[data-form-section]:visible').evaluateAll((nodes) => nodes.map((node) => node.dataset.formSection))
  for (const title of [...titles, ...titles.slice(0, 1)]) {
    const section = editor.locator(`[data-form-section=${JSON.stringify(title)}]`)
    const heading = section.locator('.erp-business-form-heading, .erp-line-editor__heading[data-line-items-title="true"]').first()
    await heading.locator('.erp-business-action-form__section-title-text, h2, strong[role="heading"]').first().click()
    await assertCurrentBusinessSection(page, editor, title)
    await assertBusinessSectionSpacing(editor, layout)
  }
  await assertBusinessFormScrollTracking(page, editor)
  return titles
}

export async function assertBusinessFormScrollTracking(page, editor) {
  await page.waitForFunction((root) => root.getAttribute('aria-busy') !== 'true', await editor.elementHandle())
  if (page.viewportSize().width <= 767) {
    // 视口尺寸先更新，AntD 的手机主题随后提交；先等字号合同生效再固定滚动范围。
    await page.waitForFunction((root) => [...root.querySelectorAll('.ant-select-selector')]
      .filter((node) => node.getClientRects().length)
      .every((node) => Number.parseFloat(getComputedStyle(node).fontSize) >= 16), await editor.elementHandle())
  }
  await waitForFiniteAnimations(page)
  const result = await editor.evaluate(async (root) => {
    const body = root.querySelector('.erp-business-form-page__body')
    const nav = body?.parentElement.querySelector(':scope > nav')
    if (!nav) return null
    const owner = body.closest('[data-business-form-page]')
    const sections = [...body.querySelectorAll('[data-form-section]')].filter((node) =>
      node.getClientRects().length && node.closest('[data-business-form-page]') === owner
    )
    sections[0].focus({ preventScroll: true })
    await new Promise(requestAnimationFrame)
    await new Promise(requestAnimationFrame)
    let scroller = body
    while (scroller.parentElement && !/(auto|scroll)/u.test(getComputedStyle(scroller).overflowY)) {
      scroller = scroller.parentElement
    }
    const controls = [...body.querySelectorAll('textarea,.ant-select')]
    let previousBounds = ''
    let stableFrames = 0
    for (let frame = 0; frame < 60 && stableFrames < 3; frame += 1) {
      await new Promise(requestAnimationFrame)
      const bounds = JSON.stringify([scroller.scrollHeight, ...sections.map((node) => [node.offsetTop, node.offsetHeight]), ...controls.map((node) => [node.offsetWidth, node.offsetHeight])])
      stableFrames = bounds === previousBounds ? stableFrames + 1 : 0
      previousBounds = bounds
    }
    if (stableFrames < 3) throw new Error('Responsive form layout did not settle before scroll sampling')
    const max = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
    if (max <= 2) return { titles: sections.map((node) => node.dataset.formSection), max, scrollable: false }
    const fields = [...body.querySelectorAll('input,textarea,select')]
    const values = fields.map((node) => [node.value, node.checked])
    const identities = fields.map((node) => node.getAttribute('aria-label') || node.id || node.name || node.tagName)
    const geometry = () => sections.map((node) => [node.offsetTop, node.offsetHeight, node.offsetWidth])
    const before = JSON.stringify(geometry())
    const measured = [...body.querySelectorAll('tr,td,textarea,.ant-select,.ant-select-selector,.ant-form-item')].map((node) => ({
      node,
      className: node.className,
      height: node.getBoundingClientRect().height,
      cssHeight: getComputedStyle(node).height,
      borderTop: getComputedStyle(node).borderTopWidth,
      borderBottom: getComputedStyle(node).borderBottomWidth,
      fontSize: getComputedStyle(node).fontSize,
      lineHeight: getComputedStyle(node).lineHeight,
      padding: getComputedStyle(node).padding,
    }))
    const positions = new Set([0, max])
    for (let step = 0; step <= 16; step += 1) positions.add(max * step / 16)
    for (let top = Math.max(0, max - scroller.clientHeight); top < max; top += 8) positions.add(top)
    for (const section of sections) {
      const top = section.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
      for (const offset of [-40, 0, 40]) positions.add(Math.min(max, Math.max(0, top + offset)))
    }
    const sorted = [...positions].sort((a, b) => a - b)
    // 每个采样跨两次 rAF，间隔用于定位停顿，不代表单帧绘制时间。
    const intervals = []
    const errors = []
    const checkpoints = []
    const sweep = async (tops) => {
      const visited = []
      let previous
      for (const top of tops) {
        scroller.scrollTo({ top, behavior: 'instant' })
        await new Promise(requestAnimationFrame)
        const now = await new Promise(requestAnimationFrame)
        if (previous !== undefined) intervals.push(now - previous)
        previous = now
        const active = sections.filter((node) => node.dataset.currentFormSection === 'true')
        const current = active[0]
        const title = current?.dataset.formSection
        const link = nav.querySelector('button[aria-current="location"]')
        const picker = nav.querySelector('.ant-select')
        if (active.length !== 1 || link?.getAttribute('aria-controls') !== current?.id || picker?.dataset.value !== current?.id) {
          if (errors.length < 8) errors.push({ top: scroller.scrollTop, active: active.map((node) => node.dataset.formSection), directory: link?.textContent })
        }
        if (visited.at(-1) !== title) {
          visited.push(title)
          checkpoints.push(scroller.scrollTop)
        }
      }
      return visited
    }
    const forward = await sweep(sorted)
    const reversePositions = [max, ...checkpoints.toReversed(), 0]
    const backward = await sweep(reversePositions)
    const afterFields = [...body.querySelectorAll('input,textarea,select')]
    intervals.sort((a, b) => a - b)
    return {
      titles: sections.map((node) => node.dataset.formSection),
      max,
      scrollable: true,
      shared: scroller !== body,
      forward,
      backward,
      errors,
      geometryStable: before === JSON.stringify(geometry()),
      geometryBefore: JSON.parse(before),
      geometryAfter: geometry(),
      changedHeights: measured.flatMap(({ node, ...initial }) => {
        const after = { className: node.className, height: node.getBoundingClientRect().height, cssHeight: getComputedStyle(node).height, borderTop: getComputedStyle(node).borderTopWidth, borderBottom: getComputedStyle(node).borderBottomWidth, fontSize: getComputedStyle(node).fontSize, lineHeight: getComputedStyle(node).lineHeight, padding: getComputedStyle(node).padding }
        return Math.abs(initial.height - after.height) < 0.1 ? [] : [{ tag: node.tagName, label: node.getAttribute('aria-label') || node.className, initial, after }]
      }).slice(0, 8),
      inputsStable: fields.length === afterFields.length && fields.every((node, index) => node === afterFields[index]),
      valuesStable: JSON.stringify(values) === JSON.stringify(afterFields.map((node) => [node.value, node.checked])),
      changedFields: afterFields.flatMap((node, index) => node === fields[index] ? [] : [{ index, before: identities[index], after: node.getAttribute('aria-label') || node.id || node.name || node.tagName }]).slice(0, 8),
      samples: sorted.length + reversePositions.length,
      frameIntervalP95: intervals[Math.floor(intervals.length * 0.95)],
      frameIntervalMax: intervals.at(-1),
    }
  })
  if (!result) return null
  if (result.scrollable) {
    const detail = JSON.stringify(result)
    const expected = result.max <= BUSINESS_FORM_READING_MARGIN ? result.titles.slice(0, 1) : result.titles
    assert.deepEqual(result.forward, expected, `scrolling down follows the readable sections: ${detail}`)
    assert.deepEqual(result.backward, expected.toReversed(), `scrolling up restores the readable sections: ${detail}`)
    assert.deepEqual(result.errors, [], `directory and highlight stay exclusive and aligned: ${detail}`)
    assert.equal(result.geometryStable, true, `section switches preserve layout: ${detail}`)
    assert.equal(result.inputsStable && result.valuesStable, true, `scrolling preserves mounted fields and draft values: ${detail}`)
  }
  const client = page.context().browser().browserType().name() === 'chromium'
    ? await page.context().newCDPSession(page) : null
  try {
    await client?.send('Performance.enable')
    const before = await client?.send('Performance.getMetrics')
    const switches = await editor.evaluate(async (root) => {
      const sections = [...root.querySelectorAll('[data-form-section]')].filter((node) => node.getClientRects().length)
      const largest = sections.toSorted((a, b) => b.querySelectorAll('*').length - a.querySelectorAll('*').length)[0]
      const other = sections.find((node) => node !== largest)
      const targets = document.activeElement === largest ? [other, largest] : [largest, other]
      const intervals = []
      for (let index = 0; index < 10; index += 1) {
        const started = await new Promise(requestAnimationFrame)
        const section = targets[index % 2]
        section.focus({ preventScroll: true })
        await new Promise(requestAnimationFrame)
        const ended = await new Promise(requestAnimationFrame)
        intervals.push(ended - started)
      }
      sections[0].focus({ preventScroll: true })
      return { count: intervals.length, maxInterval: Math.max(...intervals), totalInterval: intervals.reduce((a, b) => a + b, 0), largestSectionElements: largest.querySelectorAll('*').length }
    })
    const after = await client?.send('Performance.getMetrics')
    if (client) {
      const start = Object.fromEntries(before.metrics.map(({ name, value }) => [name, value]))
      switches.styleRecalculationMs = (after.metrics.find(({ name }) => name === 'RecalcStyleDuration').value - start.RecalcStyleDuration) * 1000
    }
    const evidence = { url: page.url(), title: await editor.getAttribute('aria-label'), viewport: page.viewportSize(), fullscreen: await editor.getAttribute('data-fullscreen'), ...result, switches }
    if (process.env.STYLE_L1_OUTPUT_DIR) await appendFile(`${process.env.STYLE_L1_OUTPUT_DIR}/section-scroll.jsonl`, `${JSON.stringify(evidence)}\n`)
    return evidence
  } finally {
    await client?.detach()
  }
}

export async function assertBusinessFormNavigationSurface(page, editor) {
  await waitForFiniteAnimations(page)
  const metrics = await editor.evaluate((node) => {
    const main = node.querySelector('.erp-business-form-page__main')
    const nav = main?.querySelector(':scope > nav')
    const links = nav?.querySelector('.erp-business-form-page__section-links')
    const picker = nav?.querySelector('.erp-business-form-page__section-picker')
    const body = main?.querySelector('.erp-business-form-page__body')
    const box = (element) => element?.getBoundingClientRect().toJSON()
    const visible = (element) => Boolean(element?.getClientRects().length)
    return {
      title: node.getAttribute('aria-label'),
      sectionCount: [...node.querySelectorAll('[data-form-section]')].filter((section) => visible(section) && section.closest('[data-business-form-page]') === node).length,
      main: box(main),
      nav: box(nav),
      body: box(body),
      sidebar: visible(links),
      picker: visible(picker),
      background: nav ? getComputedStyle(nav).backgroundColor : null,
      border: nav ? getComputedStyle(nav).borderRightWidth : null,
      bottomBorder: nav ? getComputedStyle(nav).borderBottomWidth : null,
      topNavigation: Boolean(nav && body && Math.abs(nav.getBoundingClientRect().left - body.getBoundingClientRect().left) <= 1 && Math.abs(nav.getBoundingClientRect().width - body.getBoundingClientRect().width) <= 1),
      stickyNavigation: nav ? getComputedStyle(nav).position === 'sticky' : false,
      bodyOverflow: body ? body.scrollWidth - body.clientWidth : null,
    }
  })
  const detail = JSON.stringify(metrics)
  assert.ok(metrics.bodyOverflow <= 1, `editor body keeps horizontal overflow inside its detail table: ${detail}`)
  if (metrics.sectionCount < 3) {
    assert.equal(metrics.nav, undefined, `short forms do not add an empty directory: ${detail}`)
    return metrics
  }
  assert.ok(metrics.nav, `complete forms retain their shared directory: ${detail}`)
  assert.ok(metrics.background && !['transparent', 'rgba(0, 0, 0, 0)'].includes(metrics.background), `directory has an opaque theme surface: ${detail}`)
  if (metrics.sidebar && !metrics.topNavigation) {
    assert.ok(Math.abs(metrics.nav.top - metrics.main.top) <= 1 && Math.abs(metrics.nav.bottom - metrics.main.bottom) <= 1, `directory background and divider cover the full editor column: ${detail}`)
    assert.ok(Math.abs(metrics.nav.right - metrics.body.left) <= 1, `directory divider meets the body without a gap: ${detail}`)
    assert.equal(metrics.border, '1px', detail)
  } else {
    if (!metrics.sidebar) assert.equal(metrics.picker, true, `narrow editors retain an accessible section picker: ${detail}`)
    assert.equal(metrics.topNavigation, true, `horizontal navigation stays above the editor body: ${detail}`)
    assert.ok(Math.abs(metrics.nav.width - metrics.main.width) <= 1 && Math.abs(metrics.nav.left - metrics.main.left) <= 1, `horizontal directory background spans the editor: ${detail}`)
    if (metrics.stickyNavigation) {
      assert.ok(Math.abs(metrics.body.top - metrics.main.top - metrics.nav.height) <= 1, `sticky directory retains its place in the document flow: ${detail}`)
      assert.ok(metrics.nav.top >= metrics.main.top - 1 && metrics.nav.bottom <= metrics.main.bottom + 1, `sticky directory remains inside its editor: ${detail}`)
    } else {
      assert.ok(Math.abs(metrics.nav.bottom - metrics.body.top) <= 1, `horizontal directory divider meets the body without a gap: ${detail}`)
    }
    assert.equal(metrics.bottomBorder, '1px', detail)
  }
  return metrics
}

const expectedSections = {
  customers: ['基本资料', '联系人', '默认收货信息', '结算方式', '备注'],
  suppliers: ['基本资料', '联系人', '结算与发票', '加工能力', '备注'],
  materials: ['基本资料', '采购与库存', '备注'],
  products: ['基本资料', '外贸信息', '计量信息', '产品图片'],
  'product-skus': ['归属与编号', '规格属性', '计量信息', '附件'],
  processes: ['基本资料', '路线与加工能力', '补充资料'],
  production: ['生产计划', '生产明细', '备注'],
  outsourcing: ['合同与加工厂', '加工明细', '合同双方信息', '备注与附件'],
  shipment: ['单据与客户', '出货明细', '收货信息', '运输与费用', '备注与附件'],
  completion: ['完工来源与数量', '待核对的入库仓库与批次', '备注'],
  bom: ['版本信息', '材料分析明细表', '订单与制表资料', '备注与附件'],
  purchase: [
    '订单与供应商',
    '采购明细',
    '交付与结算',
    '合同订购方信息',
    '备注与附件',
  ],
  sales: ['订单与客户', '订货明细', '联系与交付', '结算与报价', '备注与附件'],
}

async function assertInlineAttachmentPanel(attachment) {
  const header = attachment.locator('.business-attachment-panel__compact-header')
  const content = attachment.locator('.business-attachment-panel__content')
  assert.ok(await header.isVisible())
  assert.ok(await content.isVisible(), '附件内容直接展示')
  assert.ok(await attachment.getByRole('button', { name: '选择附件', exact: true }).isVisible(), '空附件区也保留上传入口')
  assert.equal(await attachment.getByRole('button', { name: /(展开|收起)附件$/u }).count(), 0)
  const metrics = await header.evaluate((node) => ({
    width: node.getBoundingClientRect().width,
    panelWidth: node.parentElement.clientWidth,
    overflow: node.parentElement.scrollWidth - node.parentElement.clientWidth,
    fontSize: getComputedStyle(node).fontSize,
  }))
  assert.ok(Math.abs(metrics.width - metrics.panelWidth) <= 1 && metrics.overflow <= 1, JSON.stringify(metrics))
  assert.ok(Number.parseFloat(metrics.fontSize) >= 14, `附件分组使用可读的正文字号: ${JSON.stringify(metrics)}`)
}

export async function assertBusinessFormSections(page, editor, key) {
  await assertBusinessSectionTitleBands(editor)
  const titles = expectedSections[key]
  if (!titles) {
    assert.equal(
      await editor.getByRole('navigation', { name: '表单分区' }).count(),
      0
    )
    await assertBusinessSectionInteractions(page, editor)
    return
  }
  const initialViewport = page.viewportSize()
  await page.setViewportSize({ width: 1440, height: 900 })
  const nav = editor.getByRole('navigation', { name: '表单分区' })
  await nav.getByRole('button', { name: titles[0], exact: true }).waitFor()
  assert.deepEqual(await nav.getByRole('button').allTextContents(), titles)
  await assertBusinessFormNavigationSurface(page, editor)
  await assertCurrentBusinessSection(page, editor, titles[0])
  const layout = await assertBusinessSectionSpacing(editor)
  const sections = editor.locator('[data-form-section]')
  const body = editor.locator('.erp-business-form-page__body')
  assert.equal(
    await editor.locator('details[data-form-section]').count(),
    0,
    `${key}: business form sections must stay expanded`
  )
  const originalInput = await editor
    .locator('input:not([type="hidden"])')
    .first()
    .inputValue()
  if (['outsourcing', 'shipment', 'production'].includes(key)) {
    const detail = await sections.nth(1).boundingBox()
    const viewport = await body.boundingBox()
    assert(
      detail.y < viewport.y + viewport.height - 100,
      `${key}: details must start in the first screen`
    )
  }
  await assertBusinessFormScrollTracking(page, editor)
  const lastLink = nav.getByRole('button', { name: titles.at(-1), exact: true })
  await lastLink.focus()
  await page.keyboard.press('Enter')
  await page.waitForFunction((title) => {
    const current = document.querySelector(
      '.erp-business-form-page:not([hidden]) nav button[aria-current="location"]'
    )
    return current?.textContent === title
  }, titles.at(-1))
  await assertCurrentBusinessSection(page, editor, titles.at(-1))
  await assertBusinessSectionSpacing(editor, layout)
  assert.equal(
    await body.evaluate(
      () =>
        document.activeElement?.closest('[data-form-section]')?.dataset
          .formSection
    ),
    titles.at(-1)
  )
  const attachment = editor.locator('.business-attachment-panel')
  if (await attachment.count()) {
    await assertInlineAttachmentPanel(attachment)
  }
  // Native scrolling, without clicking the directory, must also update its position.
  if (await body.evaluate((node) => node.scrollTop > 0)) {
    await body.evaluate((node) =>
      node.scrollTo({ top: 0, behavior: 'instant' })
    )
  } else {
    await nav.getByRole('button', { name: titles[0], exact: true }).click()
  }
  await page.waitForFunction(
    (title) =>
      document.querySelector(
        '.erp-business-form-page:not([hidden]) nav button[aria-current="location"]'
      )?.textContent === title,
    titles[0]
  )
  await assertCurrentBusinessSection(page, editor, titles[0])
  await assertBusinessSectionSpacing(editor, layout)
  const lastField = sections.last().locator('input:not(:disabled):not([type="hidden"]), textarea:not(:disabled), button:not(:disabled)').first()
  if (await lastField.count()) {
    await lastField.focus()
    await assertCurrentBusinessSection(page, editor, titles.at(-1))
    assert.equal(await editor.getAttribute('data-unsaved'), 'false', 'focus and section changes do not alter the draft')
  }
  for (const width of [1024, 390]) {
    await page.setViewportSize({ width, height: 844 })
    const picker = nav.getByRole('combobox', { name: '跳转到', exact: true })
    await picker.waitFor({ state: 'visible' })
    await assertBusinessFormNavigationSurface(page, editor)
    assert.equal(await lastLink.isVisible(), false)
    const target = await sections.nth(1).getAttribute('id')
    await chooseSelectOption(picker, target)
    await page.waitForFunction(
      (id) =>
        document.activeElement?.closest('[data-form-section]')?.id === id &&
        document.querySelector('.erp-business-form-page__section-picker .ant-select')
          ?.dataset.value === id,
      target,
      { timeout: 5000 }
    ).catch(async (error) => {
      const diagnostic = await picker.evaluate((node) => ({
        selected: node.closest('.ant-select')?.dataset.value,
        focused: document.activeElement?.outerHTML?.slice(0, 600),
        focusedSection: document.activeElement?.closest('[data-form-section]')?.id,
      }))
      throw new Error(`${error.message}; target=${target}; ${JSON.stringify(diagnostic)}`)
    })
    await assertBusinessFormPage(page, editor)
    await assertBusinessSectionTitleBands(editor)
    await assertBusinessSectionSpacing(editor)
    await assertCurrentBusinessSection(page, editor, titles[1])
    assert.equal(await readSelectValue(picker), target)
    if (width === 390 && (await attachment.count())) {
      await assertInlineAttachmentPanel(attachment)
    }
    await assertBusinessFormScrollTracking(page, editor)
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await nav.getByRole('button', { name: titles[0], exact: true }).click()
  await page.waitForFunction(
    (title) =>
      document.querySelector(
        '.erp-business-form-page:not([hidden]) nav button[aria-current="location"]'
      )?.textContent === title,
    titles[0]
  )
  await page.emulateMedia({ reducedMotion: 'no-preference' })
  assert.equal(
    await editor.locator('input:not([type="hidden"])').first().inputValue(),
    originalInput
  )
  assert.equal(await editor.getAttribute('data-unsaved'), 'false')
  await page.setViewportSize(initialViewport)
}
