import React from 'react'
import {
  Button,
  Descriptions,
  Drawer,
  List,
  Space,
  Tag,
  Typography,
} from 'antd'
import DevCiWorkflowGuide from '../DevCiWorkflowGuide.jsx'
import { buildCiDiagnosticText } from '../../config/devCiWorkflow.mjs'
import { formatQualityGateDuration } from '../../config/devQualityGates.mjs'
import {
  SERVER_PIPELINE_JOB_STATUS,
  SERVER_JOB_ROLE,
  SERVER_JOB_GROUP,
  SERVER_JOB_ROLE_HELP,
  SERVER_JOB_GROUP_HELP,
  serverJobFlowGroup,
} from '../../config/qualityGatePresentation.mjs'

const { Paragraph, Text } = Typography

export function ServerJobGuideDrawer({
  repository,
  evidence,
  timing,
  open,
  selectedJobName,
  onSelect,
  onShowAll,
  onClose,
  onAfterOpenChange,
}) {
  const guideByName = new Map(
    (evidence.jobGuides || []).map((guide) => [guide.name, guide])
  )
  const selectedJob = timing.flowJobs.find(
    (job) => job.name === selectedJobName
  )
  const selectedGuide = selectedJob ? guideByName.get(selectedJob.name) : null
  const topologyJob =
    evidence.topology?.status === 'available' && selectedJob
      ? evidence.topology.jobs.find((job) => job.name === selectedJob.name)
      : null
  const selectedGroup = selectedJob ? serverJobFlowGroup(selectedJob) : ''
  const selectedRole = selectedJob
    ? SERVER_JOB_ROLE[selectedJob.role] || SERVER_JOB_ROLE.execution
    : null

  const dependencyContent = (() => {
    if (evidence.topology?.status !== 'available') {
      return (
        <Text type="secondary">
          当前依赖暂不可读；以 GitLab Pipeline 为准。
        </Text>
      )
    }
    if (!topologyJob?.needs.length) return <Text>无前置依赖</Text>
    return (
      <Space size={[4, 4]} wrap>
        {topologyJob.needs.map((name) => (
          <Text key={name} code>
            {name}
          </Text>
        ))}
      </Space>
    )
  })()

  return (
    <Drawer
      title={selectedGuide?.label || 'Job 说明'}
      open={open}
      width="min(1000px, calc(100vw - 16px))"
      rootClassName="erp-dev-quality-job-guide-drawer"
      onClose={onClose}
      afterOpenChange={onAfterOpenChange}
      destroyOnHidden
    >
      {selectedJob && selectedGuide ? (
        <div className="erp-dev-quality-job-guide-drawer__detail">
          <Space size={6} wrap>
            <Tag color={selectedRole.color}>{selectedRole.label}</Tag>
            <Tag>{SERVER_JOB_GROUP[selectedGroup] || selectedGroup}</Tag>
            {!selectedGuide.registered ? (
              <Tag color="warning">说明待登记</Tag>
            ) : null}
          </Space>
          <Paragraph>{selectedGuide.summary}</Paragraph>
          <Descriptions
            size="small"
            column={1}
            bordered
            items={[
              {
                key: 'job',
                label: 'Job',
                children: <Text code>{selectedJob.name}</Text>,
              },
              {
                key: 'role',
                label: '类型',
                children: (
                  <div className="erp-dev-quality-job-guide-drawer__stack">
                    <Text strong>{selectedRole.label}</Text>
                    <Text type="secondary">
                      {SERVER_JOB_ROLE_HELP[selectedJob.role]}
                    </Text>
                  </div>
                ),
              },
              {
                key: 'group',
                label: '所属阶段',
                children: (
                  <div className="erp-dev-quality-job-guide-drawer__stack">
                    <Text strong>
                      {SERVER_JOB_GROUP[selectedGroup] || selectedGroup}
                    </Text>
                    <Text type="secondary">
                      {SERVER_JOB_GROUP_HELP[selectedGroup]}
                    </Text>
                  </div>
                ),
              },
              {
                key: 'current',
                label: '本次结果',
                children: (
                  <Space size={[8, 4]} wrap>
                    <Tag>{SERVER_PIPELINE_JOB_STATUS[selectedJob.status]}</Tag>
                    <Text>
                      运行 {formatQualityGateDuration(selectedJob.durationMs)}
                    </Text>
                    <Text>
                      等待 {formatQualityGateDuration(selectedJob.queueMs)}
                    </Text>
                    {selectedJob.attemptCount > 1 ? (
                      <Text>重试 {selectedJob.attemptCount - 1} 次</Text>
                    ) : null}
                  </Space>
                ),
              },
              {
                key: 'checks',
                label: '包含检查',
                children: (
                  <ul className="erp-dev-quality-job-guide-drawer__checks">
                    {selectedGuide.checks.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                ),
              },
              {
                key: 'needs',
                label: '前置依赖',
                children: dependencyContent,
              },
              {
                key: 'outcome',
                label: '结果用途',
                children: selectedGuide.outcome,
              },
            ]}
          />
          <Space size={8} wrap>
            <Button href={selectedJob.url} target="_blank">
              在 GitLab 查看日志
            </Button>
            <Button type="link" onClick={onShowAll}>
              查看全部 Job 说明
            </Button>
          </Space>
          <Paragraph type="secondary">
            以下说明来自当前工作区，历史运行按对应 SHA 的配置核对。CI
            专用入口只用于定位，不在本机伪造环境执行。
          </Paragraph>
          {selectedGuide.diagnostics ? (
            <Descriptions
              size="small"
              column={1}
              bordered
              items={[
                {
                  key: 'entry',
                  label: '定义入口',
                  children: (
                    <Text code copyable>
                      {selectedGuide.diagnostics.entry}
                    </Text>
                  ),
                },
                {
                  key: 'environment',
                  label: '环境要求',
                  children: selectedGuide.diagnostics.environment,
                },
                {
                  key: 'steps',
                  label: '执行步骤',
                  children: (
                    <ol>
                      {selectedGuide.diagnostics.steps.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                  ),
                },
                {
                  key: 'evidence',
                  label: '证据位置',
                  children: (
                    <ul>
                      {selectedGuide.diagnostics.evidence.map((file) => (
                        <li key={file}>
                          <Text code>{file}</Text>
                        </li>
                      ))}
                    </ul>
                  ),
                },
                {
                  key: 'triage',
                  label: '失败排查',
                  children: (
                    <ol>
                      {selectedGuide.diagnostics.triage.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                  ),
                },
                {
                  key: 'sources',
                  label: '说明来源',
                  children: selectedGuide.diagnostics.sources.join('、'),
                },
              ]}
            />
          ) : (
            <Paragraph type="secondary">
              详细排查说明尚未登记，请查看该 Job 的完整日志。
            </Paragraph>
          )}
        </div>
      ) : (
        <div className="erp-dev-quality-job-guide-drawer__catalog">
          <DevCiWorkflowGuide />
          <Text type="secondary">
            先看阶段，再按需查看单个 Job；依赖、状态与耗时仍以当前 GitLab
            流水线为准。
          </Text>
          {timing.flowGroups.map((group) => (
            <section
              key={group.key}
              className="erp-dev-quality-job-guide-drawer__group"
            >
              <div className="erp-dev-quality-job-guide-drawer__group-heading">
                <Text strong>{SERVER_JOB_GROUP[group.key] || group.key}</Text>
                <Text type="secondary">{SERVER_JOB_GROUP_HELP[group.key]}</Text>
              </div>
              <List
                size="small"
                dataSource={group.jobs}
                renderItem={(job) => {
                  const guide = guideByName.get(job.name)
                  if (!guide) return null
                  return (
                    <List.Item
                      actions={[
                        <Button
                          key="open"
                          type="link"
                          aria-label={`查看 ${job.name} 说明`}
                          onClick={() => onSelect(job.name)}
                        >
                          查看
                        </Button>,
                      ]}
                    >
                      <List.Item.Meta
                        title={
                          <Space size={6} wrap>
                            <Text strong>{guide.label}</Text>
                            <Text code>{job.name}</Text>
                            {!guide.registered ? (
                              <Tag color="warning">说明待登记</Tag>
                            ) : null}
                          </Space>
                        }
                        description={guide.summary}
                      />
                    </List.Item>
                  )
                }}
              />
            </section>
          ))}
        </div>
      )}
      <details className="erp-dev-ci-diagnostic">
        <summary>
          查看与复制{selectedJob ? '本 Job' : '本次流水线'}排查信息
        </summary>
        <Paragraph
          className="erp-dev-ci-diagnostic__text"
          copyable={{
            text: buildCiDiagnosticText({
              repository,
              evidence,
              job: selectedJob,
            }),
          }}
        >
          {buildCiDiagnosticText({ repository, evidence, job: selectedJob })}
        </Paragraph>
      </details>
    </Drawer>
  )
}
