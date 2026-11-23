import { DIAGRAM_DOMAINS, DIAGRAM_NODE_TYPES } from '../../common/components/diagram/diagramSemantics.mjs'

import { ERP_LIGHT_PALETTE } from '../../common/theme/erpThemePalette.mjs'

export const CHAIN_CANVAS_OPERATIONS = '拖空白平移 · Ctrl / ⌘ + 滚轮缩放。全流程地图和阶段排布可切换横竖方向。'
export const CHAIN_CANVAS_RELATIONS = Object.freeze({
  known: '办理 / 推进',
  exception: '异常分支',
  correction: '过账后纠正',
  unknown: '待核对的参考线',
  supplies: '供给关系',
  cross_cuts: '横切影响',
})

const font = 'system-ui, "PingFang SC", "Microsoft YaHei", sans-serif'
const ink = '#24302b'
const muted = '#526259'
const escape = (value) => String(value).replace(/[&<>"']/gu, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char])
const number = (value) => Math.round(value * 1000) / 1000
const relationStyle = (kind) => ({
  color: ({ exception: ERP_LIGHT_PALETTE.warning, correction: ERP_LIGHT_PALETTE.info })[kind] || muted,
  arrow: ['exception', 'correction'].includes(kind) ? kind : 'known',
  dash: ({ exception: '8 5', correction: '9 4 2 4', unknown: '2 5', supplies: '5 4', cross_cuts: '2 4' })[kind] || '',
})
const exceptionNodeStroke = `stroke="${relationStyle('exception').color}" stroke-width="3" stroke-dasharray="9 6"`
const tint = (hex, amount = 0.16) => `#${hex.slice(1).match(/../gu).map((part) => Math.round(parseInt(part, 16) * amount + 255 * (1 - amount)).toString(16).padStart(2, '0')).join('')}`

// Capture the rendered graph in its unscaled coordinates, including off-screen
// and negative positions. No camera change, re-layout or hidden node expansion.
export function captureBusinessChainExport(surface, scale) {
  const document = surface.ownerDocument
  const window = document.defaultView
  const origin = surface.getBoundingClientRect()
  const box = (rect) => ({ x: (rect.x - origin.x) / scale, y: (rect.y - origin.y) / scale, width: rect.width / scale, height: rect.height / scale })
  const bounds = []
  const textRuns = (element, color = ink) => {
    const result = []
    const walker = document.createTreeWalker(element, window.NodeFilter.SHOW_TEXT)
    const segmenter = new Intl.Segmenter('zh', { granularity: 'grapheme' })
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      if ((!element.closest('svg') && node.parentElement.closest('svg')) || !node.textContent.trim()) continue
      const parent = node.parentElement
      const style = window.getComputedStyle(parent)
      const size = parseFloat(style.fontSize)
      const clippedRole = parent.hasAttribute('data-role-label') && parent.scrollWidth > parent.clientWidth
      const clipAt = clippedRole ? box(parent.getBoundingClientRect()).x + parent.clientWidth - size : Infinity
      let line = null
      for (const { segment, index } of segmenter.segment(node.textContent)) {
        const range = document.createRange()
        range.setStart(node, index)
        range.setEnd(node, index + segment.length)
        const rect = box(range.getBoundingClientRect())
        if (!rect.width && !rect.height) continue
        if (rect.x + rect.width > clipAt) {
          if (line) {
            line.text += '…'
            line.width += size
          }
          break
        }
        if (!line || Math.abs(line.y - rect.y) > 1 || rect.x < line.x - 1) {
          line = { ...rect, text: segment, size, weight: style.fontWeight, color }
          result.push(line)
        } else {
          line.text += segment
          line.width = rect.x + rect.width - line.x
        }
      }
    }
    bounds.push(...result)
    return result
  }
  const nodes = [...surface.querySelectorAll('[data-design-node], [data-handoff-chain]')].map((element) => {
    const body = element.querySelector('.erp-chain-design__node-body') || element
    const rect = box(body.getBoundingClientRect())
    bounds.push(rect)
    const texts = [...body.children].filter((child) => ['SMALL', 'STRONG'].includes(child.tagName)).flatMap((child) => textRuns(child, child.tagName === 'SMALL' ? muted : ink))
    const icons = [...body.querySelectorAll('svg')].map((icon) => ({
      ...box(icon.getBoundingClientRect()),
      viewBox: icon.getAttribute('viewBox'),
      paths: [...icon.querySelectorAll('path')].map((path) => path.getAttribute('d')),
    }))
    return { ...rect, id: element.dataset.designNode || element.dataset.handoffChain, type: element.dataset.type || 'group', domain: element.dataset.domain, exception: element.hasAttribute('data-exception-node'), roleHighlight: element.dataset.roleHighlighted, roleLabel: body.querySelector('[data-role-label]')?.textContent, texts, icons }
  })
  const edges = [...surface.querySelectorAll('[data-design-edge]')].map((element) => {
    const path = element.querySelector('.erp-chain-design__edge')
    const b = path.getBBox()
    bounds.push({ x: b.x, y: b.y, width: b.width, height: b.height })
    const label = element.querySelector('text')
    const backdrop = element.querySelector('.erp-chain-design__edge-label rect')?.getBoundingClientRect()
    return {
      from: element.dataset.edgeFrom,
      to: element.dataset.edgeTo,
      kind: ['supplies', 'cross_cuts'].includes(element.dataset.relationKind) ? element.dataset.relationKind : element.dataset.designEdge,
      d: path.getAttribute('d'),
      title: element.querySelector('title')?.textContent || '',
      labelBox: backdrop?.width ? box(backdrop) : null,
      texts: label ? textRuns(label, relationStyle(element.dataset.designEdge).color) : [],
    }
  })
  const lanes = [...surface.querySelectorAll('.erp-chain-design__lane, .erp-chain-design__section-title')].map((element) => {
    const rect = box(element.getBoundingClientRect())
    const style = window.getComputedStyle(element)
    bounds.push(rect)
    return {
      ...rect,
      domain: element.dataset.domain,
      fill: style.backgroundColor,
      border: style.borderTopColor,
      texts: textRuns(element, window.getComputedStyle(element.querySelector('strong')).color),
    }
  })
  return { nodes, edges, lanes, bounds }
}

const rectSvg = (box, attributes = '') => `<rect x="${number(box.x)}" y="${number(box.y)}" width="${number(box.width)}" height="${number(box.height)}" ${attributes}/>`
const textSvg = (run) => `<text x="${number(run.x)}" y="${number(run.y)}" font-size="${run.size}" font-weight="${escape(run.weight || '400')}" fill="${run.color || ink}" dominant-baseline="text-before-edge"${run.width > 0 ? ` textLength="${number(run.width)}" lengthAdjust="spacingAndGlyphs"` : ''}>${escape(run.text)}</text>`

function exportGraph(snapshot) {
  const graph = []
  for (const lane of snapshot.lanes) {
    graph.push(
      `<g data-export-lane="${escape(lane.domain)}">`,
      rectSvg(lane, `fill="${escape(lane.fill)}" stroke="${escape(lane.border)}"`),
      ...lane.texts.map(textSvg),
      '</g>'
    )
  }
  for (const edge of snapshot.edges) {
    const style = relationStyle(edge.kind)
    graph.push(`<g data-export-edge="${escape(edge.kind)}"><title>${escape(edge.title)}</title><path d="${escape(edge.d)}" fill="none" stroke="${style.color}" stroke-width="1.5" stroke-dasharray="${style.dash || 'none'}"${edge.kind !== 'unknown' ? ` marker-end="url(#export-arrow-${style.arrow})"` : ''}/>${edge.labelBox ? rectSvg(edge.labelBox, 'fill="white"') : ''}${edge.texts.map(textSvg).join('')}</g>`)
  }
  for (const node of snapshot.nodes) {
    const color = DIAGRAM_DOMAINS[node.domain]?.color || muted
    const rounded = ['business_action', 'system'].includes(node.type)
    const border = node.exception ? exceptionNodeStroke : `stroke="${color}"`
    const fill = node.roleHighlight ? tint(ERP_LIGHT_PALETTE.info, node.roleHighlight === 'shared' ? 0.21 : 0.10) : tint(color)
    graph.push(`<g data-export-node="${escape(node.id)}">`)
    if (node.roleLabel) graph.push(`<title>${escape(node.roleLabel)}</title>`)
    graph.push(rectSvg(node, `rx="${rounded ? 22 : 4}" ry="${rounded ? 22 : 4}" fill="${fill}" ${border}`))
    if (node.type === 'record' && !node.exception) graph.push(rectSvg({ x: node.x + 3, y: node.y + 3, width: node.width - 6, height: node.height - 6 }, `rx="2" fill="none" stroke="${color}"`))
    for (const icon of node.icons) graph.push(`<svg x="${number(icon.x)}" y="${number(icon.y)}" width="${number(icon.width)}" height="${number(icon.height)}" viewBox="${escape(icon.viewBox)}" fill="${muted}">${icon.paths.map((d) => `<path d="${escape(d)}"/>`).join('')}</svg>`)
    graph.push(...node.texts.map(textSvg), '</g>')
  }
  return graph.join('')
}

function graphBounds(snapshot) {
  const left = Math.min(...snapshot.bounds.map((box) => box.x))
  const top = Math.min(...snapshot.bounds.map((box) => box.y))
  return {
    left,
top,
    width: Math.max(...snapshot.bounds.map((box) => box.x + box.width)) - left,
    height: Math.max(...snapshot.bounds.map((box) => box.y + box.height)) - top,
  }
}

export function renderBusinessChainExport(snapshot, { title, context, exportedAt, includeLegend = true, includeOperations = true }, measureText) {
  const main = snapshot.nodes.length ? graphBounds(snapshot) : null
  const handoffs = snapshot.handoffs && graphBounds(snapshot.handoffs)
  const padding = 28
  const width = Math.ceil(Math.max(720, Math.max(main?.width || 0, handoffs?.width || 0) + padding * 2))
  const blocks = []
  let cursor = padding
  const paragraph = (text, size = 14, weight = '400', color = muted, inset = 0) => {
    let line = ''
    for (const char of new Intl.Segmenter('zh', { granularity: 'grapheme' }).segment(text)) {
      if (line && measureText(line + char.segment, size, weight) > width - padding * 2 - inset) {
        blocks.push(textSvg({ x: padding + inset, y: cursor, text: line, size, weight, color }))
        cursor += size * 1.55
        line = ''
      }
      line += char.segment
    }
    if (line) blocks.push(textSvg({ x: padding + inset, y: cursor, text: line, size, weight, color }))
    cursor += size * 1.55
  }
  paragraph(title || '流程探索', 22, '600', ink)
  paragraph(context)
  paragraph(`规则示意 · ${snapshot.nodes.length} 个节点 · ${snapshot.edges.length} 条关系 · ${exportedAt}`, 12)
  cursor += 22
  if (handoffs) {
    paragraph(`对外交接 · ${snapshot.handoffs.edges.length} 条`, 16, '600', ink)
    blocks.push(`<g data-export-handoffs="true" transform="translate(${number(padding - handoffs.left)} ${number(cursor - handoffs.top)})">${exportGraph(snapshot.handoffs)}</g>`)
    cursor += handoffs.height + 22
    if (main) paragraph('链内步骤', 16, '600', ink)
  }
  if (main) blocks.push(`<g data-export-graph="true" transform="translate(${number(padding - main.left)} ${number(cursor - main.top)})">${exportGraph(snapshot)}</g>`)
  cursor += (main?.height || 0) + 30
  if (snapshot.related?.length) {
    paragraph('本链交接', 16, '600', ink)
    for (const label of snapshot.related) paragraph(label)
  }
  if (includeLegend || includeOperations) {
    blocks.push(`<path d="M ${padding} ${cursor} H ${width - padding}" stroke="#d5dfda"/>`)
    cursor += 18
  }
  if (includeLegend) {
    paragraph('图例', 16, '600', ink)
    for (const domain of new Set(snapshot.nodes.map((node) => node.domain))) {
      const entry = DIAGRAM_DOMAINS[domain]
      if (!entry) continue
      blocks.push(rectSvg({ x: padding, y: cursor + 3, width: 12, height: 12 }, `rx="2" fill="${entry.color}"`))
      paragraph(entry.label, 13, '400', muted, 22)
    }
    paragraph(`节点类型：${[...new Set(snapshot.nodes.map((node) => DIAGRAM_NODE_TYPES[node.type]))].filter(Boolean).join('、')}`, 13)
    if (snapshot.nodes.some((node) => node.exception)) {
      blocks.push(rectSvg({ x: padding, y: cursor + 2, width: 42, height: 16 }, `rx="3" fill="none" ${exceptionNodeStroke}`))
      paragraph('异常分支节点', 13, '400', muted, 62)
    }
    for (const kind of new Set([...snapshot.edges, ...(snapshot.handoffs?.edges || [])].map((edge) => edge.kind))) {
      const style = relationStyle(kind)
      blocks.push(`<path d="M ${padding} ${cursor + 10} h 48" fill="none" stroke="${style.color}" stroke-width="1.5" stroke-dasharray="${style.dash || 'none'}"${kind !== 'unknown' ? ` marker-end="url(#export-arrow-${style.arrow})"` : ''}/>`)
      paragraph(CHAIN_CANVAS_RELATIONS[kind], 13, '400', style.color, 62)
    }
    paragraph('领域颜色用于分类，不代表完成状态；已登记衔接仍需满足办理条件，待核对连线不表示允许或禁止。', 12)
    cursor += 10
  }
  if (includeOperations) {
    paragraph('操作说明（在流程探索页面使用）', 16, '600', ink)
    paragraph('点击节点或连线查看说明。可展开分支或切换展示粒度。', 13)
    paragraph(CHAIN_CANVAS_OPERATIONS, 13)
    paragraph('适应全图可查看当前范围；跨链查看后，“返回来处”恢复原有选择并适应全图。', 13)
  }
  const height = Math.ceil(cursor + padding)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="${escape(font)}"><title>${escape(title || '流程探索')}</title><desc>当前范围的规则示意，保留排布；不代表某笔业务的实际进度。</desc><defs>${['known', 'exception', 'correction'].map((kind) => `<marker id="export-arrow-${kind}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${relationStyle(kind).color}"/></marker>`).join('')}</defs><rect width="100%" height="100%" fill="white"/>${blocks.join('')}</svg>`
  return { svg, width, height }
}

// A bounded 2x raster avoids silent quality loss and unbounded canvas allocations.
// SVG has no raster allocation and remains available when this budget is exceeded.
export function businessChainPngSize({ width, height }) {
  const size = { width: Math.ceil(width * 2), height: Math.ceil(height * 2) }
  if (size.width > 16384 || size.height > 16384 || size.width * size.height > 32_000_000) {
    throw new Error('当前图过大，无法在保持清晰度的情况下导出 PNG。请导出 SVG，或缩小探索范围后重试。')
  }
  return size
}

export async function businessChainExportBlob(artifact, format) {
  const svgBlob = new Blob([artifact.svg], { type: 'image/svg+xml;charset=utf-8' })
  if (format === 'svg') return svgBlob
  const size = businessChainPngSize(artifact)
  const source = URL.createObjectURL(svgBlob)
  const canvas = document.createElement('canvas')
  try {
    const image = new Image()
    image.src = source
    await image.decode()
    canvas.width = size.width
    canvas.height = size.height
    const context = canvas.getContext('2d')
    if (!context) throw new Error('图像生成失败，请重试或导出 SVG。')
    context.drawImage(image, 0, 0, size.width, size.height)
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
    if (!blob) throw new Error('图像生成失败，请重试或导出 SVG。')
    return blob
  } finally {
    URL.revokeObjectURL(source)
    canvas.width = 0
    canvas.height = 0
  }
}

export function createBusinessChainExport(surface, scale, options) {
  const context = document.createElement('canvas').getContext('2d')
  const snapshot = captureBusinessChainExport(surface, scale)
  const handoffs = surface.closest('.erp-chain-design__canvas-area')?.querySelector('.erp-chain-handoffs__plot')
  if (handoffs) snapshot.handoffs = captureBusinessChainExport(handoffs, 1)
  snapshot.related = [...(surface.closest('.erp-chain-design__canvas-area')?.querySelectorAll('.erp-chain-design__handoff-links button') || [])].map((button) => button.getAttribute('aria-label'))
  if (!snapshot.nodes.length && !snapshot.handoffs?.nodes.length && !snapshot.related.length) throw new Error('当前筛选没有可导出的内容。')
  return renderBusinessChainExport(snapshot, options, (text, size, weight) => {
    context.font = `${weight} ${size}px ${font}`
    return context.measureText(text).width
  })
}
