import React from 'react'
import { Link } from 'react-router-dom'
import { MermaidDiagram } from '@/common/components/diagram/MermaidDiagram.jsx'
import { Markdown } from '@/common/components/markdown'
import { PROJECT_SKILL_STEP_FIELDS } from '../config/devProjectSkills.mjs'
import { buildDevDocsLocation } from '../pages/devDocsNavigation.mjs'

export default function DevProjectSkillsExecutionGuide({ topic, sourcePath, value, onChange }) {
  const note = topic.nodes.find((node) => node.id === value) || topic.nodes[0]

  return (
    <div className="erp-dev-skills__flow-content">
      <div className="erp-dev-skills__flow-chart">
        <MermaidDiagram
          chart={topic.chart}
          label="Skill 执行流程"
          flowchartHtmlLabels={false}
          showSourceOnError={false}
          interactiveNodes={topic.nodes.map((node) => ({ ...node, description: `前置条件：${node.preconditions} 具体操作：${node.operation}` }))}
          selectedNodeId={note.id}
          onNodeSelect={onChange}
        />
      </div>
      <section className="erp-dev-skills__step" aria-label="执行步骤详情" aria-live="polite">
        <strong>{note.label}</strong>
        <dl>
          {PROJECT_SKILL_STEP_FIELDS.map((field) => (
            <div key={field.key} className="erp-dev-skills__step-field" data-step-field={field.key}>
              <dt>{field.label}</dt>
              <dd><Markdown source={note[field.key]} /></dd>
            </div>
          ))}
        </dl>
        <Link to={buildDevDocsLocation({ path: sourcePath, headingId: note.headingId })}>
          查看 Skill 正文
        </Link>
      </section>
    </div>
  )
}
