import React from 'react'
import DiagramNodeIcon from './DiagramNodeIcon.jsx'
import { DIAGRAM_DOMAINS, DIAGRAM_NODE_TYPES } from './diagramSemantics.mjs'

export default function DiagramTypeLegend({ types, domains = [] }) {
  if (!types.length && !domains.length) return null
  return (
    <div className="erp-diagram-type-legend" aria-label="节点图例">
      {types.map((type) => <span key={type}><DiagramNodeIcon type={type} />{DIAGRAM_NODE_TYPES[type]}</span>)}
      {domains.map((domain) => <span key={domain}><i className="erp-diagram-type-legend__domain" style={{ borderColor: DIAGRAM_DOMAINS[domain].color }} aria-hidden="true" />{DIAGRAM_DOMAINS[domain].label}</span>)}
    </div>
  )
}
