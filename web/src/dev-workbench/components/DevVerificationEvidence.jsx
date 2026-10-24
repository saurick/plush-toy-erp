import { useEffect, useState } from 'react'
import { Button, Tag } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { Link } from 'react-router-dom'
import { WorkbenchFacts, WorkbenchNotice, WorkbenchSection } from './WorkbenchPattern.jsx'
import DevTimestamp from './DevTimestamp.jsx'
import { readDevVerificationEvidence } from '../config/devVerificationEvidence.mjs'
import {
  DEV_DELIVERY_TARGETS,
  deliveryStatusPresentation,
} from '../config/devDelivery.mjs'
import '../styles/dev-verification-evidence.css'
import { ServerCiEvidencePanel } from './quality-gates/ServerCiEvidencePanel.jsx'

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
      <Link
        to={`/__dev/version-center?target=${target.key}&view=history&history_q=${target.selectedOperationId}`}
      >
        查看本环境交付历史
      </Link>
    </div>
  )
}

function TargetRow({ target, loading, failed, initial }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <>
      <tr>
        <th scope="row">{target.shortLabel}</th>
        <td>
          <code>{target.runtimeSha?.slice(0, 12) || '未读取'}</code>
          <div className="erp-dev-verification-evidence__version-note">
            {initial
              ? '等待读取运行版本'
              : loading || failed
                ? '上次读取版本 · 本次待核对'
                : target.current
                  ? '与工作台源码一致'
                  : target.passed
                    ? '已验证运行版本 · 与工作台源码不同'
                    : '运行版本待核实'}
          </div>
        </td>
        {Object.keys(CHECK_LABELS).map((key) => (
          <td key={key}>
            <Tag
              color={
                loading
                  ? undefined
                  : !failed && target.verification?.[key]
                    ? 'success'
                    : 'warning'
              }
            >
              {loading
                ? '核对中'
                : !failed && target.verification?.[key]
                  ? '通过'
                  : '未证明'}
            </Tag>
          </td>
        ))}
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
          <td colSpan={7}>
            <ReceiptDetails target={target} />
          </td>
        </tr>
      ) : null}
    </>
  )
}

export default function DevVerificationEvidence() {
  const [state, setState] = useState(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)
  const [reload, setReload] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setFailed(false)
    readDevVerificationEvidence({ signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) setState(value)
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [reload])
  const stale = Boolean(state && (loading || failed))
  return (
    <WorkbenchSection
      className="erp-dev-verification-evidence"
      title="服务器测试与交付证据"
      aria-label="服务器测试与交付证据"
      aria-busy={loading}
      actions={<Button icon={<ReloadOutlined aria-hidden="true" />} loading={loading} onClick={() => setReload((value) => value + 1)}>重新核对服务器</Button>}
    >
      <WorkbenchFacts
        className="erp-dev-verification-evidence__context"
        items={[
        { label: '工作台源码', value: <code>{state?.repository?.commit?.slice(0, 12) || '未读取'}</code> },
        ...(state?.repository ? [{ label: '工作区', value: state.repository.dirty ? '有未提交改动（不在 CI 范围内）' : '干净' }] : []),
        { label: '读取于', value: <DevTimestamp value={state?.readAt} missing="尚未取得读取时间" /> },
      ]}
      />
      {loading ? (
        <WorkbenchNotice
          className="erp-dev-verification-evidence__notice"
          tone="loading"
          title={state
            ? '正在重新核对；以下 CI 记录来自上次读取，当前状态尚未核实。'
            : '正在读取 GitLab CI、目标运行版本与执行回执…'}
        />
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
      {!loading && !failed && state?.errors?.length ? (
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
      <div className="erp-dev-verification-evidence__body">
        <WorkbenchSection
          flat
          headingLevel={3}
          className="erp-dev-verification-evidence__ci"
          title="GitLab CI"
          aria-label="GitLab CI 记录"
          actions={stale ? <Tag>上次读取</Tag> : null}
        >
          {state?.ci.evidence ? (
            <ServerCiEvidencePanel
              summary={{
                repository: state.repository,
                serverEvidence: state.ci.evidence,
              }}
            />
          ) : (
            <div className="erp-dev-verification-evidence__placeholder">
              <p>
                {loading
                  ? '正在核对流水线、测试报告与覆盖率。'
                  : '尚未取得 GitLab CI 证据。'}
              </p>
              <p>CI 对应已提交版本；工作区改动与目标部署分别核对。</p>
              {!loading ? (
                <Link to="/__dev/quality-gates?view=server">前往质量门禁</Link>
              ) : null}
            </div>
          )}
        </WorkbenchSection>
        <WorkbenchSection
          flat
          headingLevel={3}
          className="erp-dev-verification-evidence__targets"
          title="目标环境"
          aria-label="目标环境核验"
          description="按运行版本与执行回执判定"
        >
          <div className="erp-dev-tool-table-wrap">
            <table
              className="erp-dev-tool-table erp-dev-verification-evidence__table"
              data-table-lines="appearance"
              aria-label="目标服务器验证结果"
            >
              <colgroup>
                <col className="erp-dev-verification-evidence__target-column" />
                <col />
                {Object.keys(CHECK_LABELS).map((key) => (
                  <col
                    key={key}
                    className="erp-dev-verification-evidence__check-column"
                  />
                ))}
                <col className="erp-dev-verification-evidence__record-column" />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">环境</th>
                  <th scope="col">运行版本</th>
                  {Object.values(CHECK_LABELS).map((label) => (
                    <th scope="col" key={label}>
                      {label}
                    </th>
                  ))}
                  <th scope="col">记录</th>
                </tr>
              </thead>
              <tbody>
                {(state?.targets || DEV_DELIVERY_TARGETS).map((target) => (
                  <TargetRow
                    key={target.key}
                    target={target}
                    loading={loading}
                    failed={failed}
                    initial={!state}
                  />
                ))}
              </tbody>
            </table>
          </div>
        </WorkbenchSection>
      </div>
      <p className="erp-dev-verification-evidence__boundary">
        运行冒烟、迁移、新备份隔离恢复与部署分别留证；本执行端专项报告、客户验收与生产容量另行核验。
      </p>
    </WorkbenchSection>
  )
}
