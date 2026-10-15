import React from 'react'
import { Collapse, Typography } from 'antd'
import { Link } from 'react-router-dom'
import { MermaidDiagram } from '@/common/components/markdown'
import { CI_WORKFLOW_SECTIONS, formatCiWorkflowSection } from '../config/devCiWorkflow.mjs'
import { DEV_DOCS_ROUTE } from '../config/devDocs.mjs'
import './dev-ci-workflow.css'

export default function DevCiWorkflowGuide({ initialSection = 'overview' }) {
  return (
    <section className="erp-dev-ci-guide" aria-label="CI/CD 流程与原理">
      <Typography.Title level={4}>CI/CD 流程与原理</Typography.Title>
      <Typography.Paragraph type="secondary">
        流程说明与配置规则，实际执行结果请查看本次流水线和目标回执。
      </Typography.Paragraph>
      <Typography.Paragraph>
        <Link to={`${DEV_DOCS_ROUTE}?path=${encodeURIComponent('scripts/qa/README.md')}`}>打开 QA 命令与证据合同</Link>
        {' · '}
        <Link to="/__dev/quality-gates?view=gaps">查看当前改动的覆盖缺口</Link>
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
              {section.chart ? (
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
              ) : null}
              <ol>
                {section.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ol>
              {section.table ? (
                <div
                  className="erp-dev-ci-guide__table-scroll"
                  role="region"
                  aria-label={`${section.label}明细表`}
                >
                  <table>
                    <caption>{section.label} · 当前合同</caption>
                    <thead>
                      <tr>
                        {section.table.headers.map((header) => (
                          <th key={header} scope="col">{header}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {section.table.rows.map((row) => (
                        <tr key={row[0]}>
                          {row.map((cell, index) => index === 0
                            ? <th key={index} scope="row">{cell}</th>
                            : <td key={index}>{cell}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
              {section.commands ? (
                <div className="erp-dev-ci-guide__commands">
                  <Typography.Text type="secondary">
                    仓库根目录执行；复制不会运行命令，Git 写操作仍需当前任务授权。
                  </Typography.Text>
                  {section.commands.map((command) => (
                    <Typography.Paragraph key={command} copyable={{ text: command }}>
                      <code>{command}</code>
                    </Typography.Paragraph>
                  ))}
                </div>
              ) : null}
              <Typography.Paragraph type="secondary" className="erp-dev-ci-guide__sources">
                定义来源：{(section.sources || ['.gitlab-ci.yml', 'scripts/qa/README.md']).join('、')}
              </Typography.Paragraph>
              <Typography.Paragraph copyable={{ text: formatCiWorkflowSection(section) }}>复制本节排查指引</Typography.Paragraph>
            </div>
          ),
        }))}
      />
    </section>
  )
}
