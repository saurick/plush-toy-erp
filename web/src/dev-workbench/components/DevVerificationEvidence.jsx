import { useEffect, useState } from 'react'
import { Button, Tag } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'

import DevTestingDetails from './DevTestingDetails.jsx'
import { WorkbenchFacts, WorkbenchNotice, WorkbenchSection } from './WorkbenchPattern.jsx'
import DevTimestamp from './DevTimestamp.jsx'
import { readDevVerificationEvidence } from '../config/devVerificationEvidence.mjs'
import {
  DEV_DELIVERY_TARGETS,
  deliveryStatusPresentation,
} from '../config/devDelivery.mjs'
import '../styles/dev-verification-evidence.css'
import { ServerCiEvidencePanel, SERVER_CI_STATUS } from './quality-gates/ServerCiEvidencePanel.jsx'

const CHECK_LABELS = {
  tests: '运行冒烟',
  migration: '迁移',
  recovery: '备份恢复',
  deployment: '部署读回',
}
const RECEIPT_CHECK_LABELS = {
  releaseIdentity: '制品身份',
  health: '健康检查',
  ready: '就绪检查',
  basicSmoke: '业务基础冒烟',
  publicEntry: '公网入口',
  backupRestore: '新备份与隔离恢复',
  staticConfig: '静态配置',
  dataEnvironment: '数据环境',
}

function ReceiptDetails({ target }) {
  const { operation } = target
  return (
    <div
      className="erp-dev-verification-evidence__details"
      id={`verification-receipt-${target.key}`}
    >
      <strong>
        {target.shortLabel} · {operation ? '执行回执' : '证据缺口'}
      </strong>
      {operation ? (
        <>
          <p>
            操作：<code>{operation.id}</code> · {operation.version} ·{' '}
            {deliveryStatusPresentation(operation.status).label}
          </p>
          <DevTimestamp
            value={operation.evidence?.finishedAt || operation.updatedAt}
            action="执行完成于"
          />
          <p>
            回执 SHA-256：
            <code>{operation.evidence?.receiptSha256 || '未读回'}</code>
          </p>
          <p>
            迁移要求：{operation.evidence?.migration?.required || '未证明'}
            ；实际读回：{operation.evidence?.migration?.readback || '未证明'}
          </p>
          <p>
            备份：{operation.evidence?.backup?.alias || '未读回'}；恢复核验：
            {operation.evidence?.backup?.restoreChecked === true
              ? '通过'
              : '未证明'}
          </p>
          <p>
            备份 SHA-256：
            <code>{operation.evidence?.backup?.sha256 || '未读回'}</code>
          </p>
          <ul>
            {Object.entries(operation.evidence?.checks || {}).map(
              ([key, passed]) => (
                <li key={key}>
                  {RECEIPT_CHECK_LABELS[key] || key}：
                  {passed === true ? '通过' : '未通过'}
                </li>
              )
            )}
          </ul>
          <ol>
            {operation.stages.map((stage) => (
              <li key={stage.id}>
                {stage.label}：{deliveryStatusPresentation(stage.status).label}{' '}
                ·{' '}
                {stage.durationMs === null
                  ? '耗时未证明'
                  : `${stage.durationMs} ms`}
              </li>
            ))}
          </ol>
          {operation.gitlabRecord?.evidenceUrl ? (
            <a
              href={operation.gitlabRecord.evidenceUrl}
              target="_blank"
              rel="noreferrer"
            >
              GitLab 原始交付证据
            </a>
          ) : null}
        </>
      ) : (
        <p>
          没有取得与运行版本对应的完整执行回执，不能以健康检查或 CI 结果代替。
        </p>
      )}
    </div>
  )
}

function TargetStatus({ target, loading, failed }) {
  return <Tag color={loading ? undefined : failed ? 'error' : target.passed ? 'success' : 'warning'}>{loading ? '核对中' : failed ? '读取失败' : target.passed ? '通过' : '未证明'}</Tag>
}

function TargetRow({ target, loading, failed }) {
  const [expanded, setExpanded] = useState(false)
  const initial = !target.runtimeSha && loading
  return (
    <>
      <tr>
        <th scope="row">{target.shortLabel}</th>
        <td>
          <code>{target.runtimeSha?.slice(0, 12) || '未读取'}</code>
          <div className="erp-dev-verification-evidence__version-note">
            {initial
              ? '等待读取运行版本'
              : !target.runtimeSha
                ? '运行版本未读回'
              : loading || failed
                ? '上次读取版本 · 本次待核对'
                : target.current
                  ? '与工作台源码一致'
                  : target.passed
                    ? '已验证运行版本 · 与工作台源码不同'
                    : '运行版本待核实'}
          </div>
        </td>
        <td><TargetStatus target={target} loading={loading} failed={failed} /></td>
        <td>
          {initial ? (
            '—'
          ) : (
            <Button
              type="link"
              size="small"
              aria-expanded={expanded}
              aria-controls={`verification-receipt-${target.key}`}
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded
                ? '收起详情'
                : target.operation
                  ? '查看回执'
                  : '查看缺口'}
            </Button>
          )}
        </td>
      </tr>
      {expanded && !initial ? (
        <tr className="erp-dev-verification-evidence__receipt-row">
          <td colSpan={4}>
            <dl className="erp-dev-verification-evidence__checks">{Object.entries(CHECK_LABELS).map(([key, label]) => <div key={key}><dt>{label}</dt><dd><Tag color={!failed && target.verification?.[key] ? 'success' : 'warning'}>{!failed && target.verification?.[key] ? '通过' : '未证明'}</Tag></dd></div>)}</dl>
            <ReceiptDetails target={target} />
          </td>
        </tr>
      ) : null}
    </>
  )
}

export default function DevVerificationEvidence({ compact = false }) {
  const [state, setState] = useState(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setFailed(false)
    setState((current) => current ? { ...current, pending: { ci: true, targets: DEV_DELIVERY_TARGETS.map(({ key }) => key) } } : current)
    readDevVerificationEvidence({
      signal: controller.signal,
      onUpdate: (next) => {
        if (controller.signal.aborted) return
        setState((current) => ({
          ...next,
          ci: (next.pending.ci || next.failed.ci) && current?.ci.evidence ? current.ci : next.ci,
          ciRepository: (next.pending.ci || next.failed.ci) && current?.ci.evidence ? current.ciRepository : next.ciRepository,
          targets: next.targets.map((target) => next.pending.targets.includes(target.key) || next.failed.targets.includes(target.key)
            ? current?.targets.find((previous) => previous.key === target.key) || target : target),
        }))
      },
    })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [reload])
  const ciLoading = loading && (!state || state.pending?.ci)
  const stale = Boolean(state?.ci.evidence && (ciLoading || failed || state?.failed?.ci))
  const ciResult = <Tag color={ciLoading || stale ? undefined : state?.ci.passed ? 'success' : state?.ci.evidence?.status === 'failed' ? 'error' : 'warning'}>{ciLoading ? '核对中' : stale ? '上次读取' : state?.ci.evidence ? state.ci.passed ? SERVER_CI_STATUS.passed : state.ci.evidence.status === 'passed' ? '历史 CI 通过' : SERVER_CI_STATUS[state.ci.evidence.status] || '未证明' : '未取得证据'}</Tag>
  const targets = (state?.targets || DEV_DELIVERY_TARGETS).map((target) => ({
    target,
    loading: loading && (!state || state.pending?.targets.includes(target.key)),
    failed: failed || state?.failed?.targets.includes(target.key),
  }))
  const unalignedTargets = targets
    .filter(({ target }) => target.runtimeSha && !target.current)
    .map(({ target }) => target.shortLabel)
  const details = (
    <>
      <div className="erp-dev-tool-table-wrap">
        <table className="erp-dev-tool-table erp-dev-verification-evidence__table" data-table-lines="appearance" aria-label="目标服务器验证结果">
          <thead><tr><th scope="col">来源</th><th scope="col">版本</th><th scope="col">结果</th><th scope="col">详情</th></tr></thead>
          <tbody>
            <tr>
              <th scope="row">GitLab CI</th>
              <td><code>{state?.ci.evidence?.gitSha?.slice(0, 12) || '未读取'}</code></td>
              <td>{ciResult}</td>
              <td>
                <DevTestingDetails id="server-ci" label="查看 CI" title="GitLab CI 证据">
                  {stale ? <p role="status">上次读取记录，仅供追溯；本次状态尚未确认。</p> : !state?.ci.passed ? <p>本条是对应提交的 CI 记录，未证明当前工作区通过。</p> : null}
                  {state?.ci.evidence ? <ServerCiEvidencePanel summary={{ repository: state.ciRepository || state.repository, serverEvidence: state.ci.evidence }} /> : <p>尚未取得 GitLab CI 证据。</p>}
                </DevTestingDetails>
              </td>
            </tr>
            {targets.map((props) => <TargetRow key={props.target.key} {...props} />)}
          </tbody>
        </table>
      </div>
      <DevTestingDetails id="server-context" label="来源信息" title="服务器证据来源">
        <p>工作台源码：<code>{state?.repository?.commit || '未读取'}</code></p>
        <p>工作区：{state?.repository ? state.repository.dirty ? '有未提交改动（不在 CI 范围内）' : '干净' : '未读取'}</p>
        <DevTimestamp value={state?.readAt} action="读取于" missing="尚未取得读取时间" />
        <p>运行冒烟、迁移、新备份隔离恢复与部署分别留证；本执行端专项报告、客户验收与生产容量另行核验。</p>
      </DevTestingDetails>
    </>
  )
  return (
    <WorkbenchSection
      className="erp-dev-verification-evidence"
      title="服务器测试与交付证据"
      aria-label="服务器测试与交付证据"
      aria-busy={loading}
      tools={<Button icon={<ReloadOutlined aria-hidden="true" />} loading={loading} onClick={() => setReload((value) => value + 1)}>重新核对服务器</Button>}
    >
      <p className="erp-dev-verification-evidence__source">源码 <code>{state?.repository?.commit?.slice(0, 12) || '未读取'}</code>{state?.repository?.dirty ? ' · 有未提交改动' : ''} · <DevTimestamp value={state?.readAt} action="读取于" missing="尚未取得读取时间" /></p>
      {compact ? (
        <>
          <WorkbenchFacts
            aria-label="服务器证据摘要"
            items={[
              { label: 'GitLab CI', value: ciResult },
              ...targets.map((props) => ({
                label: props.target.shortLabel,
                value: <TargetStatus {...props} />,
              })),
            ]}
          />
          {unalignedTargets.length > 0 ? (
            <p className="erp-dev-verification-evidence__source">
              {unalignedTargets.join('、')}的运行版本未证明与工作台源码一致
            </p>
          ) : null}
        </>
      ) : null}
      {failed ? (
        <WorkbenchNotice
          tone="error"
          title={
            state
              ? '服务器证据读取失败；上次记录仅供追溯，请重新核对。'
              : '服务器证据读取失败，请重新核对。'
          }
        />
      ) : null}
      {!failed && state?.errors?.length ? (
        <WorkbenchNotice
          tone="error"
          title={
            <div>
              {state.errors.map((error) => (
                <div key={error}>{error}</div>
              ))}
            </div>
          }
        />
      ) : null}
      {compact ? (
        <details className="erp-dev-disclosure">
          <summary>核验详情</summary>
          {details}
        </details>
      ) : details}
    </WorkbenchSection>
  )
}
