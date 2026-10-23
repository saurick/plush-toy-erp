import React, { useState } from 'react'
import { Button, Empty, Space, Tag, Typography } from 'antd'
import { MermaidDiagram } from '@/common/components/markdown'
import {
  buildQualityGateServerDag,
  formatQualityGateDuration,
} from '../../config/devQualityGates.mjs'
import {
  SERVER_PIPELINE_JOB_STATUS,
  SERVER_PIPELINE_JOB_LEGEND,
  SERVER_JOB_ROLE,
  SERVER_JOB_GROUP,
} from '../../config/qualityGatePresentation.mjs'

const { Text } = Typography

export function ServerCiPipelineFlow({ evidence, timing, onOpenJobGuide }) {
  const [fullDagOpen, setFullDagOpen] = useState(false)
  const dag = buildQualityGateServerDag(evidence)
  const visibleStatuses = new Set(timing.flowJobs.map((job) => job.status))
  if (!dag.chart && !timing.flowJobs.length) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前提交尚无实际 Job" />
  }
  return (
    <section
      className="erp-dev-quality-server-pipeline"
      aria-labelledby="gitlab-pipeline-flow-title"
    >
      <div id="gitlab-pipeline-flow-title" className="erp-dev-quality-server-pipeline__relationship">
        <div>
          <Text strong>
            {dag.status === 'available' ? '实际依赖已读取' : '依赖图尚未形成'}
          </Text>
          <Text type="secondary">{dag.message}</Text>
        </div>
        {dag.status === 'available' ? (
          <Space size={6} wrap>
            <Tag className="erp-dev-accent-tag">{dag.nodeCount} 个 Job</Tag>
            <Tag>{dag.edgeCount} 条依赖</Tag>
          </Space>
        ) : (
          <Tag>未证明</Tag>
        )}
      </div>
      {dag.chart ? (
        <div className="erp-dev-quality-server-pipeline__dag">
          <MermaidDiagram
            chart={dag.overviewChart}
            label="当前 GitLab Pipeline 阶段依赖总览"
            showSourceOnError={false}
            flowchartHtmlLabels={false}
          />
          <Text type="secondary">
            {dag.nodeCount} 个 Job；阶段内依赖见完整图。
          </Text>
          <details
            className="erp-dev-disclosure erp-dev-static-guidance"
            onToggle={(event) => setFullDagOpen(event.currentTarget.open)}
          >
            <summary>查看完整 Job 依赖图（{dag.nodeCount} 个节点）</summary>
            {fullDagOpen ? (
              <MermaidDiagram
                chart={dag.chart}
                label="当前 GitLab Pipeline Job 依赖图"
                showSourceOnError={false}
                flowchartHtmlLabels={false}
              />
            ) : null}
          </details>
        </div>
      ) : timing.flowJobs.length ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            evidence?.topology?.status === 'missing'
              ? '当前提交尚未触发实际 Pipeline，依赖图等待服务器运行'
              : '当前 Pipeline 的依赖关系暂不可读；下方 Job 明细仍可核对'
          }
        />
      ) : null}
      <div className="erp-dev-quality-server-pipeline__mapping">
        <div className="erp-dev-quality-server-pipeline__mapping-heading">
          <div>
            <Text strong>当前 Job 明细</Text>
          </div>
          {timing.flowJobs.length ? <Tag>{timing.flowJobs.length} 个</Tag> : null}
        </div>
        {timing.flowGroups.length ? (
          <div className="erp-dev-quality-server-pipeline__track">
            {timing.flowGroups.map((group) => (
              <details
                key={group.key}
                className="erp-dev-disclosure erp-dev-quality-server-pipeline__phase"
                data-phase={group.key}
                open={group.jobs.some(
                  (job) =>
                    !['passed', 'skipped'].includes(job.status) ||
                    job.name === timing.longestExecutionJob?.name
                )}
              >
                <summary className="erp-dev-quality-server-pipeline__phase-heading">
                  <Text strong>{SERVER_JOB_GROUP[group.key] || group.key}</Text>
                  <Tag>{group.jobs.length} 个</Tag>
                </summary>
                <div className="erp-dev-quality-server-pipeline__nodes">
                  {group.jobs.map((job) => (
                    <article
                      key={job.id}
                      className={`erp-dev-quality-server-pipeline__node erp-dev-quality-server-pipeline__status--${job.status}`}
                      data-status={job.status}
                    >
                      <div className="erp-dev-quality-server-pipeline__node-heading">
                        <span
                          className="erp-dev-quality-server-pipeline__status-indicator"
                          aria-hidden="true"
                        />
                        <Button
                          type="link"
                          className="erp-dev-quality-server-pipeline__job-button"
                          aria-label={`查看 ${job.name} 说明`}
                          onClick={(event) =>
                            onOpenJobGuide(job.name, event.currentTarget)
                          }
                        >
                          <Text
                            className="erp-dev-quality-server-pipeline__node-text"
                            code
                            strong
                          >
                            {job.name}
                          </Text>
                        </Button>
                      </div>
                      <Space size={4} wrap>
                        <Tag
                          color={SERVER_JOB_ROLE[job.role]?.color || 'default'}
                        >
                          {SERVER_JOB_ROLE[job.role]?.label || '执行'}
                        </Tag>
                        {job.attemptCount > 1 ? (
                          <Tag color="warning">重试 {job.attemptCount - 1}</Tag>
                        ) : null}
                      </Space>
                      <Text
                        className="erp-dev-quality-server-pipeline__node-text"
                        type="secondary"
                      >
                        {SERVER_PIPELINE_JOB_STATUS[job.status] || '状态未证明'}{' '}
                        · 运行 {formatQualityGateDuration(job.durationMs)} ·
                        等待 {formatQualityGateDuration(job.queueMs)}
                      </Text>
                    </article>
                  ))}
                </div>
              </details>
            ))}
          </div>
        ) : (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description="当前提交尚无实际 Job"
          />
        )}
      </div>
      {visibleStatuses.size ? (
        <div className="erp-dev-quality-server-pipeline__legend">
          {SERVER_PIPELINE_JOB_LEGEND.filter((status) =>
            visibleStatuses.has(status)
          ).map((status) => (
            <span
              key={status}
              className={`erp-dev-quality-server-pipeline__legend-item erp-dev-quality-server-pipeline__status--${status}`}
              data-status={status}
            >
              <i
                className="erp-dev-quality-server-pipeline__status-indicator"
                aria-hidden="true"
              />
              {SERVER_PIPELINE_JOB_STATUS[status]}
            </span>
          ))}
        </div>
      ) : null}
      <details className="erp-dev-disclosure erp-dev-tool-disclosure">
        <summary>依赖与证据来源</summary>
        <Text type="secondary">
          依赖来自同一 SHA 的 CI 配置，状态与耗时来自实际
          Pipeline。依赖不可读时不绘制推测连线。
        </Text>
      </details>
    </section>
  )
}
