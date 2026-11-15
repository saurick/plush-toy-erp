import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import DiagramNodeIcon from '../diagram/DiagramNodeIcon.jsx'
import { DIAGRAM_NODE_TYPES } from '../diagram/diagramSemantics.mjs'

// Mermaid's inline icon syntax uses registered packs. Reuse our local Ant icons;
// no icon font, network request or second copy of the SVG paths is needed.
export const mermaidIconPack = {
  prefix: 'fa',
  width: 1024,
  height: 1024,
  icons: Object.fromEntries(Object.keys(DIAGRAM_NODE_TYPES).map((type) => {
    const markup = renderToStaticMarkup(<DiagramNodeIcon type={type} />)
    const body = /<svg[^>]*>([\s\S]*?)<\/svg>/u.exec(markup)?.[1]
    if (!body) throw new Error(`Missing diagram SVG: ${type}`)
    return [`erp-${type.replaceAll('_', '-')}`, { body }]
  })),
}
