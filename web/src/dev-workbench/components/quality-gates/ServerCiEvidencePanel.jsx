import React, { useCallback, useRef, useState } from 'react'
import { InfoCircleOutlined } from '@ant-design/icons'
import { Button, Typography } from 'antd'
import SlidingTabList from '@/common/components/navigation/SlidingTabList'
import DevTimestamp from '../DevTimestamp.jsx'
import {
  DEFAULT_SERVER_VIEW,
  DEV_QUALITY_GATE_SERVER_VIEWS,
  buildQualityGateServerTiming,
  formatQualityGateDuration,
} from '../../config/devQualityGates.mjs'
import {
  shortCommit,
  SERVER_VIEW_OPTIONS,
} from '../../config/qualityGatePresentation.mjs'
import { ServerJobPerformance } from './ServerCiPerformance.jsx'
import { ServerCiHistory } from './ServerCiHistory.jsx'
import { ServerJobGuideDrawer } from './ServerCiJobGuideDrawer.jsx'
import { ServerCiPipelineFlow } from './ServerCiPipelineFlow.jsx'

const { Link, Text } = Typography

function ServerCurrentPipelineView({ evidence, timing, onOpenJobGuide }) {
  return (
    <div className="erp-dev-quality-server-view" data-server-view="pipeline">
      <ServerCiPipelineFlow evidence={evidence} timing={timing} onOpenJobGuide={onOpenJobGuide} />
      {evidence.notProven?.length ? (
        <Text type="secondary">尚未证明：{evidence.notProven.join('、')}。</Text>
      ) : null}
    </div>
  )
}

export function ServerCiEvidencePanel({
  summary,
  serverView,
  onServerViewChange,
}) {
  const evidence = summary?.serverEvidence
  const [jobGuideOpen, setJobGuideOpen] = useState(false)
  const [selectedJobName, setSelectedJobName] = useState('')
  const jobGuideTriggerRef = useRef(null)
  const openJobGuide = useCallback((jobName, trigger) => {
    jobGuideTriggerRef.current = trigger
    setSelectedJobName(jobName)
    setJobGuideOpen(true)
  }, [])
  const restoreJobGuideFocus = useCallback((open) => {
    if (open) return
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const trigger = jobGuideTriggerRef.current
        if (trigger?.isConnected) trigger.focus({ preventScroll: true })
        jobGuideTriggerRef.current = null
      })
    })
  }, [])
  if (!evidence) return null
  const timing = buildQualityGateServerTiming(evidence)
  const selectedServerView = DEV_QUALITY_GATE_SERVER_VIEWS.includes(serverView)
    ? serverView
    : DEFAULT_SERVER_VIEW
  const hasHistory = Boolean(evidence.history?.length)
  const hasPerformance = Boolean(
    timing.flowJobs.length || evidence.history?.some((run) => run.jobs?.length)
  )
  const availableViews = SERVER_VIEW_OPTIONS.filter(({ value }) =>
    value === 'pipeline' ||
    value === selectedServerView ||
    (value === 'performance' ? hasPerformance : hasHistory)
  )
  return (
    <section
      className="erp-dev-quality-server-evidence"
      aria-label="GitLab CI 质量证据"
    >
      {evidence.pipeline ? (
        <div className="erp-dev-quality-server-evidence__facts">
          <div>
            <Text type="secondary">绑定提交</Text>
            <Text code>{shortCommit(evidence.gitSha)}</Text>
          </div>
          <div>
            <Text type="secondary">流水线</Text>
            {evidence.pipeline?.url ? (
              <Link href={evidence.pipeline.url} target="_blank" rel="noreferrer">
                #{evidence.pipeline.id}
              </Link>
            ) : (
              <Text>
                {evidence.status === 'missing'
                  ? '当前提交未触发 CI'
                  : evidence.status === 'unavailable'
                    ? '读取失败'
                    : '尚未证明'}
              </Text>
            )}
          </div>
          <div>
            <Text type="secondary">服务器总耗时</Text>
            <Text strong>{formatQualityGateDuration(timing.wallClockMs)}</Text>
          </div>
          <div>
            <Text type="secondary">排队耗时</Text>
            <Text strong>{formatQualityGateDuration(timing.queueMs)}</Text>
          </div>
          <div>
            <Text type="secondary">最长执行 Job</Text>
            <Text strong>
              {timing.longestExecutionJob
                ? `${timing.longestExecutionJob.name} · ${formatQualityGateDuration(
                    timing.longestExecutionJob.durationMs
                  )}`
                : '尚未形成'}
            </Text>
          </div>
          <div>
            <Text type="secondary">完成时间</Text>
            <DevTimestamp
              value={evidence.pipeline?.finishedAt}
              missing="尚未完成"
            />
          </div>
        </div>
      ) : null}
      <div className="erp-dev-quality-server-evidence__view-switch">
        <div hidden={availableViews.length < 2}>
          <SlidingTabList
            aria-label="CI 结果详情"
            options={availableViews}
            value={selectedServerView}
            onChange={(nextView) => {
              if (DEV_QUALITY_GATE_SERVER_VIEWS.includes(nextView)) {
                onServerViewChange(nextView)
              }
            }}
          />
        </div>
        <Button
          aria-label="流程与原理"
          size="small"
          icon={<InfoCircleOutlined />}
          onClick={(event) => openJobGuide('', event.currentTarget)}
        >
          流程与原理
        </Button>
      </div>
      {selectedServerView === 'pipeline' ? (
        <ServerCurrentPipelineView
          evidence={evidence}
          timing={timing}
          onOpenJobGuide={openJobGuide}
        />
      ) : null}
      {selectedServerView === 'performance' ? (
        <div
          className="erp-dev-quality-server-view"
          data-server-view="performance"
        >
          <ServerJobPerformance evidence={evidence} />
        </div>
      ) : null}
      {selectedServerView === 'history' ? (
        <div className="erp-dev-quality-server-view" data-server-view="history">
          <ServerCiHistory
            evidence={evidence}
            currentCommit={summary?.repository?.commit || ''}
          />
        </div>
      ) : null}
      <ServerJobGuideDrawer
        repository={summary.repository}
        evidence={evidence}
        timing={timing}
        open={jobGuideOpen}
        selectedJobName={selectedJobName}
        onSelect={setSelectedJobName}
        onShowAll={() => setSelectedJobName('')}
        onClose={() => setJobGuideOpen(false)}
        onAfterOpenChange={restoreJobGuideFocus}
      />
    </section>
  )
}
