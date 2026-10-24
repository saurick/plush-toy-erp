import { useEffect, useState } from 'react'
import { Alert, Button, Tag } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { Link } from 'react-router-dom'
import DevTimestamp from './DevTimestamp.jsx'
import { readDevVerificationEvidence } from '../config/devVerificationEvidence.mjs'
import '../styles/dev-verification-evidence.css'
import { ServerCiEvidencePanel } from './quality-gates/ServerCiEvidencePanel.jsx'

const CHECK_LABELS = { tests: '运行冒烟', migration: '迁移', recovery: '备份恢复', deployment: '部署读回' }
const RECEIPT_CHECK_LABELS = { releaseIdentity: '制品身份', health: '健康检查', ready: '就绪检查', basicSmoke: '业务基础冒烟', publicEntry: '公网入口', backupRestore: '新备份与隔离恢复', staticConfig: '静态配置', dataEnvironment: '数据环境' }

function ReceiptDetails({ target }) {
  const { operation } = target
  return (
    <details>
      <summary>{operation ? '查看回执' : '查看缺口'}</summary>
      <div className="erp-dev-verification-evidence__details">
        {operation ? (
          <>
            <p>操作：<code>{operation.id}</code> · {operation.version} · {operation.status}</p>
            <DevTimestamp value={operation.evidence?.finishedAt || operation.updatedAt} action="执行完成于" />
            <p>回执 SHA-256：<code>{operation.evidence?.receiptSha256 || '未读回'}</code></p>
            <p>迁移要求：{operation.evidence?.migration?.required || '未证明'}；实际读回：{operation.evidence?.migration?.readback || '未证明'}</p>
            <p>备份：{operation.evidence?.backup?.alias || '未读回'}；恢复核验：{operation.evidence?.backup?.restoreChecked === true ? '通过' : '未证明'}</p>
            <p>备份 SHA-256：<code>{operation.evidence?.backup?.sha256 || '未读回'}</code></p>
            <ul>
              {Object.entries(operation.evidence?.checks || {}).map(([key, passed]) => (
                <li key={key}>{RECEIPT_CHECK_LABELS[key] || key}：{passed === true ? '通过' : '未通过'}</li>
              ))}
            </ul>
            <ol>
              {operation.stages.map((stage) => (
                <li key={stage.id}>{stage.label}：{stage.status} · {stage.durationMs === null ? '耗时未证明' : `${stage.durationMs} ms`}</li>
              ))}
            </ol>
            {operation.gitlabRecord?.evidenceUrl ? (
              <a href={operation.gitlabRecord.evidenceUrl} target="_blank" rel="noreferrer">GitLab 原始交付证据</a>
            ) : null}
          </>
        ) : <p>没有取得与运行版本对应的完整执行回执，不能以健康检查或 CI 结果代替。</p>}
        <Link to={`/__dev/version-center?target=${target.key}&view=history&history_q=${target.selectedOperationId}`}>查看本环境交付历史</Link>
      </div>
    </details>
  )
}

function TargetRow({ target, loading, failed }) {
  return (
    <tr>
      <th scope="row">{target.shortLabel}</th>
      <td>
        <code>{target.runtimeSha.slice(0, 12) || '未读取'}</code>
        <div>{target.current ? '与工作台源码一致' : target.passed ? '已验证运行版本 · 与工作台源码不同' : '运行版本待核实'}</div>
      </td>
      {Object.keys(CHECK_LABELS).map((key) => (
        <td key={key}>
          <Tag color={!loading && !failed && target.verification[key] ? 'success' : 'warning'}>
            {loading ? '核对中' : !failed && target.verification[key] ? '通过' : '未证明'}
          </Tag>
        </td>
      ))}
      <td><ReceiptDetails target={target} /></td>
    </tr>
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
    readDevVerificationEvidence({ signal: controller.signal }).then((value) => {
      if (!controller.signal.aborted) setState(value)
    }).catch(() => {
      if (!controller.signal.aborted) setFailed(true)
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false)
    })
    return () => controller.abort()
  }, [reload])
  return (
    <section className="erp-dev-verification-evidence" aria-label="服务器测试与交付证据" aria-busy={loading}>
      <div className="erp-dev-verification-evidence__heading">
        <h2>服务器测试与交付证据</h2>
        <Button icon={<ReloadOutlined aria-hidden="true" />} loading={loading} onClick={() => setReload((value) => value + 1)}>重新核对服务器</Button>
      </div>
      <p className="erp-dev-verification-evidence__context">
        当前提交 <code>{state?.repository?.commit?.slice(0, 12) || '未读取'}</code>
        {state?.repository?.dirty ? ' · 工作区有未提交改动；CI 仅覆盖已提交版本，环境结果按实际运行版本核对' : null}
        {' · '}<DevTimestamp value={state?.readAt} action="读取于" />
      </p>
      {failed ? <Alert type="error" showIcon message="服务器证据读取失败，上次结果仅供追溯" /> : null}
      {state?.errors?.map((error) => <Alert key={error} type="error" showIcon message={error} />)}
      {state ? (
        <>
          {!loading && !failed ? <ServerCiEvidencePanel summary={{ repository: state.repository, serverEvidence: state.ci.evidence }} /> : <p role="status">{loading ? '正在核对 GitLab 报告…' : '本次 GitLab 报告尚未核实'}</p>}
          <div className="erp-dev-tool-table-wrap">
            <table className="erp-dev-tool-table" data-table-lines="appearance" aria-label="目标服务器验证结果">
              <thead>
                <tr>
                  <th scope="col">133 环境</th><th scope="col">版本</th>
                  {Object.values(CHECK_LABELS).map((label) => <th scope="col" key={label}>{label}</th>)}
                  <th scope="col">记录</th>
                </tr>
              </thead>
              <tbody>
                {state.targets.map((target) => <TargetRow key={target.key} target={target} loading={loading} failed={failed} />)}
              </tbody>
            </table>
          </div>
          <p className="erp-dev-verification-evidence__context">运行冒烟、新备份的隔离恢复、迁移与部署各按目标回执判定；本执行端测试报告另列。客户验收与生产容量须有各自证据。</p>
        </>
      ) : loading ? <p role="status">正在读取 CI、目标运行状态与执行回执…</p> : null}
    </section>
  )
}
