import React from 'react'
import { Empty, Space, Tag, Typography } from 'antd'
import DevTimestamp from '../DevTimestamp.jsx'
import { formatQualityGateDuration } from '../../config/devQualityGates.mjs'
import {
  shortCommit,
  SERVER_HISTORY_STATUS,
  SERVER_JOB_ROLE,
  serverHistoryFailureLabel,
  serverHistoryJobStatusLabel,
} from '../../config/qualityGatePresentation.mjs'

const { Link, Text, Title } = Typography

function ServerHistoryJobList({ jobs }) {
  return (
    <ol className="erp-dev-quality-server-history__jobs-list">
      {jobs.map((job) => (
        <li key={job.id}>
          <Space size={6} wrap>
            <Link href={job.url} target="_blank" rel="noreferrer">
              <Text code>{job.name}</Text>
            </Link>
            <Tag color={SERVER_JOB_ROLE[job.role]?.color || 'default'}>
              {SERVER_JOB_ROLE[job.role]?.label || '执行'}
            </Tag>
            {job.attemptCount > 1 ? (
              <Tag color="warning">重试 {job.attemptCount - 1} 次</Tag>
            ) : null}
          </Space>
          <Text type={job.conclusion === 'failure' ? 'danger' : 'secondary'}>
            {serverHistoryJobStatusLabel(job)} · 运行{' '}
            {formatQualityGateDuration(job.durationMs)} · 等待{' '}
            {formatQualityGateDuration(job.queueMs)}
          </Text>
        </li>
      ))}
    </ol>
  )
}

export function ServerCiHistory({ evidence, currentCommit }) {
  const history = Array.isArray(evidence?.history) ? evidence.history : []
  return (
    <section
      className="erp-dev-quality-server-history"
      aria-labelledby="gitlab-ci-history-title"
    >
      <div className="erp-dev-quality-server-history__heading">
        <div>
          <Title level={3} id="gitlab-ci-history-title">
            最近 CI
          </Title>
          <Text type="secondary">
            GitLab 最近读取到的 push 与手动完整
            CI；文档通过与完整通过分别标示，历史结果不代表当前提交已通过。
          </Text>
        </div>
        <Tag>{history.length} 条</Tag>
      </div>
      {history.length ? (
        <div className="erp-dev-quality-server-history__table-wrap">
          <table
            className="erp-dev-quality-server-history__table"
            data-table-lines="appearance"
            aria-label="最近 GitLab CI 历史"
          >
            <thead>
              <tr>
                <th scope="col">结果</th>
                <th scope="col">提交</th>
                <th scope="col">时间</th>
                <th scope="col">总耗时</th>
                <th scope="col">排队</th>
                <th scope="col">失败环节</th>
                <th scope="col">详情</th>
              </tr>
            </thead>
            <tbody>
              {history.map((run) => {
                const presentation =
                  SERVER_HISTORY_STATUS[run.result] ||
                  SERVER_HISTORY_STATUS.failed
                const current = run.gitSha === currentCommit
                return (
                  <tr key={run.id} data-current={current ? 'true' : undefined}>
                    <td data-label="结果">
                      <Tag color={presentation.color}>{presentation.label}</Tag>
                    </td>
                    <td data-label="提交">
                      <Space size={6} wrap>
                        <Text code>{shortCommit(run.gitSha)}</Text>
                        {current ? <Tag color="blue">当前提交</Tag> : null}
                      </Space>
                    </td>
                    <td data-label="时间">
                      <DevTimestamp
                        value={run.finishedAt || run.createdAt}
                        action={run.finishedAt ? '完成于' : '创建于'}
                      />
                    </td>
                    <td data-label="总耗时">
                      <Text>{formatQualityGateDuration(run.durationMs)}</Text>
                    </td>
                    <td data-label="排队">
                      <Text>{formatQualityGateDuration(run.queueMs)}</Text>
                    </td>
                    <td data-label="失败环节">
                      <Text type={run.failureJob ? 'danger' : 'secondary'}>
                        {serverHistoryFailureLabel(run.failureJob)}
                      </Text>
                    </td>
                    <td data-label="详情">
                      <details className="erp-dev-quality-server-history__jobs">
                        <summary>展开 {run.jobs.length} 个 Job</summary>
                        <Link href={run.url} target="_blank" rel="noreferrer">
                          在 GitLab 查看 #{run.id}
                        </Link>
                        <ServerHistoryJobList jobs={run.jobs} />
                      </details>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            evidence?.status === 'unavailable'
              ? 'GitLab 读取失败，历史 CI 暂不可用'
              : '尚无可展示的普通 push CI 历史'
          }
        />
      )}
    </section>
  )
}
