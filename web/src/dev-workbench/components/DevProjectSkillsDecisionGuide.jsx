import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { MermaidDiagram } from '@/common/components/markdown'
import { buildDevDocsLocation } from '../pages/devDocsNavigation.mjs'

function DecisionContent({ guide, sourcePath, selected, onChange }) {
  const [inspectedId, setInspectedId] = useState(null)
  const note = guide.nodes.find((node) => node.id === inspectedId) || selected

  return (
    <div className="erp-dev-skills__decision-content">
      <div className="erp-dev-skills__decision-chart" onPointerLeave={() => setInspectedId(null)}>
        <MermaidDiagram
          chart={guide.chart}
          label="Skill 决策图"
          flowchartHtmlLabels={false}
          showSourceOnError={false}
          interactiveNodes={guide.nodes}
          selectedNodeId={selected.id}
          onNodeInspect={setInspectedId}
          onNodeSelect={onChange}
        />
      </div>
      <section className="erp-dev-skills__decision-note" aria-label="决策图节点说明" aria-live="polite">
        <strong>{note.label}</strong>
        <p>{note.description}</p>
        <Link to={buildDevDocsLocation({ path: sourcePath, headingId: note.headingId })}>
          查看 Skill 正文
        </Link>
      </section>
    </div>
  )
}

export default function DevProjectSkillsDecisionGuide({ guide, sourcePath, value, onChange }) {
  const selected = guide.nodes.find((node) => node.id === value)
  return (
    <details
      className="erp-dev-disclosure"
      open={Boolean(selected)}
      onToggle={(event) => {
        const { open } = event.currentTarget
        if (open !== Boolean(selected)) onChange(open ? guide.nodes[0].id : '')
      }}
    >
      <summary>查看决策图</summary>
      {selected ? (
        <DecisionContent guide={guide} sourcePath={sourcePath} selected={selected} onChange={onChange} />
      ) : null}
    </details>
  )
}
