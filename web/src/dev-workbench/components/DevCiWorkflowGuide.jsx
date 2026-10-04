import React from 'react'
import { Collapse, Typography } from 'antd'
import { MermaidDiagram } from '@/common/components/markdown'
import { CI_WORKFLOW_SECTIONS } from '../config/devCiWorkflow.mjs'
import './dev-ci-workflow.css'

export default function DevCiWorkflowGuide({ initialSection = 'overview' }) {
  return (
    <section className="erp-dev-ci-guide" aria-label="CI/CD 流程与原理">
      <Typography.Title level={4}>CI/CD 流程与原理</Typography.Title>
      <Typography.Paragraph type="secondary">
        流程说明与配置规则，实际执行结果请查看本次流水线和目标回执。
      </Typography.Paragraph>
      <Collapse
        defaultActiveKey={[initialSection]}
        destroyOnHidden
        items={CI_WORKFLOW_SECTIONS.map((section) => ({
          key: section.key,
          label: section.label,
          children: (
            <div className="erp-dev-ci-guide__section">
              <Typography.Paragraph type="secondary">
                {section.description}
              </Typography.Paragraph>
              <div
                className="erp-dev-ci-guide__diagram"
                data-section={section.key}
              >
                <MermaidDiagram
                  chart={section.chart}
                  label={`${section.label}原理图`}
                  showSourceOnError={false}
                  flowchartHtmlLabels={false}
                />
              </div>
              <ol>
                {section.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ol>
            </div>
          ),
        }))}
      />
    </section>
  )
}
