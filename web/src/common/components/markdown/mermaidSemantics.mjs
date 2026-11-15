import { ERP_DARK_PALETTE, ERP_LIGHT_PALETTE } from '../../theme/erpThemePalette.mjs'
import { DIAGRAM_DOMAINS, DIAGRAM_NODE_TYPES } from '../diagram/diagramSemantics.mjs'
import { getMermaidDirection } from './mermaidViewport.mjs'

export function prepareMermaidSource(source, { mode, htmlLabels = true } = {}) {
  if (!getMermaidDirection(source)) return source
  const palette = mode === 'dark' ? ERP_DARK_PALETTE : ERP_LIGHT_PALETTE
  const styles = {
    diagramSuccess: `stroke:${palette.success},stroke-width:2px`,
    diagramWarning: `stroke:${palette.warning},stroke-width:2px`,
    diagramDanger: `stroke:${palette.danger},stroke-width:2px`,
    diagramMuted: `stroke:${palette.textMuted},stroke-dasharray:2 4`,
    diagramBranch: `stroke:${palette.warning},stroke-dasharray:6 4`,
  }
  for (const [domain, { color }] of Object.entries(DIAGRAM_DOMAINS)) {
    styles[`diagramDomain_${domain}`] = `stroke:${color},stroke-width:1.5px`
  }
  const definitions = Object.entries(styles)
    .filter(([name]) => source.includes(name))
    .map(([name, style]) => `classDef ${name} fill:${palette.surfaceSoft},color:${palette.text},${style}`)
  // SVG text labels (paper/export) retain the written type without icon-font syntax.
  const chart = htmlLabels ? source : source.replace(/fa:fa-erp-([a-z-]+)\s*/gu, (match, name) =>
    Object.hasOwn(DIAGRAM_NODE_TYPES, name.replaceAll('-', '_')) ? '' : match)
  return [chart, ...definitions].join('\n')
}
