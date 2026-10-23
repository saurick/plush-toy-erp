import React, { useEffect, useRef, useState } from 'react'
import { CopyOutlined, ReloadOutlined } from '@ant-design/icons'
import { Alert, Button, Space, Tag } from 'antd'
import { Link, useSearchParams } from 'react-router-dom'
import Select from '@/common/components/select/AppSelect'
import Pagination from '@/common/components/pagination/AppPagination'
import Table from '@/common/components/table/AppTable'
import { message } from '@/common/utils/antdApp'
import { DEV_INTEGRATION_ROUTE } from '../config/devRoutes.mjs'
import {
  getRPCExecutionPresentation,
  parseRPCReviewSearch,
  readRPCContractReview,
  RPC_EXAMPLE_VERIFY_COMMAND,
  RPC_REVIEW_STATUS,
} from '../config/devRPCContractReview.mjs'
import { isDevTestingOperationActive } from '../config/devTestingOperation.mjs'
import useDevTestingOperations from '../hooks/useDevTestingOperations.mjs'
import DevTimestamp from './DevTimestamp.jsx'
import '../styles/dev-rpc-contract-review.css'

const CHECK_LABELS = {
  catalog: '接口目录完整性',
  generated: '字段与生成物同步',
  staging: '暂存合同同步',
}
const KIND_LABELS = {
  added: '方法新增',
  removed: '方法删除',
  changed: '合同变化',
  implementation: '实现变化',
}
const PAGE_SIZE = 8
const CASE_LABELS = {
  documented: '文档请求与返回',
  anonymous: '未登录',
  permission_or_account_boundary: '权限与账号边界',
  invalid_date: '非法日期',
  stale_version: '过期版本',
  missing_version: '缺少版本',
  null_version: '空版本',
}

function Status({ status, historical = false, label: override }) {
  const [label, color] = RPC_REVIEW_STATUS[status] || RPC_REVIEW_STATUS.missing
  return (
    <Tag color={historical && status === 'passed' ? 'gold' : color}>
      {override || (historical ? `历史${label}` : label)}
    </Tag>
  )
}

function ExampleResult({ report, selected, execution }) {
  const evidence = report.execution
  const result = getRPCExecutionPresentation(report)
  const operation = execution.testingOperations['rpc-examples']
  const running = execution.testingActionStarting === 'rpc-examples' ||
    isDevTestingOperationActive(operation)
  const disabled = !execution.testingSummary || Boolean(execution.testingSummaryError) ||
    execution.testingBusy.active || execution.testingHasActive ||
    Boolean(execution.testingActionStarting) || report.range === 'staged' || !report.current
  const row = evidence.methods.find((method) => method.key === selected?.key)
  const registered = selected && evidence.registered.includes(selected.key)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(RPC_EXAMPLE_VERIFY_COMMAND)
      message.success('样例核对命令已复制')
    } catch {
      message.error('复制失败，请从下方命令手动复制')
    }
  }
  return (
    <section className="erp-dev-rpc-review__examples" aria-label="样例执行核对">
      <div className="erp-dev-rpc-review__section-head">
        <Space wrap>
          <strong>样例执行核对</strong>
          {running ? <Tag color="blue">运行中</Tag> : (
            <Status status={result.status} label={result.label} />
          )}
        </Space>
        <Space wrap>
          <Button
            type="primary"
            loading={running}
            disabled={disabled}
            onClick={() => execution.runTestingAction('rpc-examples')}
          >
            运行样例核对
          </Button>
          <Button icon={<CopyOutlined aria-hidden="true" />} onClick={copy}>
            复制核对命令
          </Button>
        </Space>
      </div>
      <p role={evidence.message ? 'alert' : undefined}>
        {running ? '正在核对登记的接口样例，完成后读取本次回执。' : result.message}
        {' '}登记可执行样例：{evidence.registered.length} / {report.methodCount} 个接口。
      </p>
      {execution.testingSummaryError ? (
        <Alert
          type="error"
          showIcon
          message={execution.testingSummaryError}
          action={<Button onClick={execution.reloadTestingSummary}>重试执行状态</Button>}
        />
      ) : null}
      {execution.testingBusy.active && !running ? (
        <p role="status">其他验证正在占用执行通道，结束后可重新读取状态。</p>
      ) : null}
      {report.range === 'staged' ? (
        <p>切回工作区后运行样例；工作区执行回执不代替暂存快照验证。</p>
      ) : null}
      {selected ? (
        <details className="erp-dev-rpc-review__method-examples">
          <summary>所选接口样例 · {selected.label}</summary>
          <p>
            {!registered ? '该接口尚未登记可执行的文档样例。' : !row
              ? '该接口尚无执行结果。' : (
                <Status status={row.status} historical={!result.current} />
              )}
          </p>
          {row?.cases?.length ? (
            <div className="erp-dev-rpc-review__case-list">
              {row.cases.map((item) => (
                <span key={item.name}>
                  <Status status={item.status} historical={!result.current} />
                  {CASE_LABELS[item.name] || item.name}
                </span>
              ))}
            </div>
          ) : null}
          {row?.failureFields?.length ? (
            <p role="alert">不一致字段：{row.failureFields.map((field) => (
              <code key={field}>{field} </code>
            ))}
            </p>
          ) : null}
        </details>
      ) : null}
      <details className="erp-dev-rpc-review__evidence">
        <summary>{result.historical ? '历史回执与来源' : '命令与证据来源'}</summary>
        {result.historical ? (
          <p><Status status={evidence.status} historical />未覆盖当前比较对象。</p>
        ) : null}
        <code>{RPC_EXAMPLE_VERIFY_COMMAND}</code>
        {evidence.receipt ? <code>{evidence.receipt}</code> : null}
        {evidence.finishedAt ? <DevTimestamp value={evidence.finishedAt} action="执行完成于" /> : null}
        <span>仅运行登记的 Go 服务夹具，不连接业务数据库；其余接口、业务事务和第三方接入分别验证。</span>
      </details>
    </section>
  )
}

export default function DevRPCContractReview() {
  const [params, setParams] = useSearchParams()
  const query = parseRPCReviewSearch(params)
  const pendingParams = useRef(params)
  const observedParams = useRef(params.toString())
  const requestSequence = useRef(0)
  const [state, setState] = useState({ loading: true, data: null, error: false })
  const [reload, setReload] = useState(0)
  const [page, setPage] = useState(1)
  const execution = useDevTestingOperations()
  const lastCompletion = useRef(null)
  const executionReady = Boolean(execution.testingSummary)
  const finishedAt = execution.testingOperations['rpc-examples']?.finishedAt || ''
  useEffect(() => {
    if (!executionReady) return
    if (lastCompletion.current !== null && lastCompletion.current !== finishedAt) {
      setReload((value) => value + 1)
    }
    lastCompletion.current = finishedAt
  }, [executionReady, finishedAt])
  if (observedParams.current !== params.toString()) {
    observedParams.current = params.toString()
    pendingParams.current = params
  }
  const update = (values) => {
    const next = new URLSearchParams(pendingParams.current)
    for (const [key, value] of Object.entries(values)) {
      if (value) next.set(key, value)
      else next.delete(key)
    }
    pendingParams.current = next
    setParams(next, { replace: true })
  }
  useEffect(() => {
    const controller = new AbortController()
    const sequence = ++requestSequence.current
    setState({ loading: true, data: null, error: false })
    readRPCContractReview({ range: query.range, signal: controller.signal })
      .then((data) => {
        if (!controller.signal.aborted && sequence === requestSequence.current) {
          setState({ loading: false, data, error: false })
        }
      })
      .catch(() => {
        if (!controller.signal.aborted && sequence === requestSequence.current) {
          setState({ loading: false, data: null, error: true })
        }
      })
    return () => controller.abort()
  }, [query.range, reload])
  useEffect(() => {
    const index = state.data?.changes.findIndex((row) => row.key === query.method) ?? -1
    setPage(index < 0 ? 1 : Math.floor(index / PAGE_SIZE) + 1)
  }, [query.range, state.data, query.method])

  const report = state.data
  const selected = report?.changes.find((row) => row.key === query.method) || report?.changes[0] || null
  const failed = report?.checks.filter((check) => check.status === 'failed') || []
  const stagedEmpty = report?.range === 'staged' && !report.files.some((file) => file.staged)
  const reloadReview = () => {
    setReload((value) => value + 1)
    execution.reloadTestingSummary()
  }
  return (
    <section className="erp-dev-rpc-review" aria-label="本轮接口变更">
      <div className="erp-dev-rpc-review__toolbar">
        <label>
          比较范围{' '}
          <Select
            allowClear={false /* 不可清空：差异比较必须明确工作区或暂存快照，不能展示无比较对象的结果。 */}
            placeholder="接口合同比较范围"
            aria-label="接口合同比较范围"
            value={query.range}
            options={[
              { value: 'worktree', label: 'HEAD → 工作区' },
              { value: 'staged', label: 'HEAD → 暂存快照' },
            ]}
            onChange={(range) => update({ contractRange: range === 'worktree' ? '' : range, change: '' })}
          />
        </label>
        <Button icon={<ReloadOutlined aria-hidden="true" />} loading={state.loading} onClick={reloadReview}>
          重新读取
        </Button>
      </div>
      {state.loading ? <p role="status">正在核对接口合同与执行回执…</p> : null}
      {state.error ? (
        <Alert
          type="error"
          showIcon
          message="接口合同检查读取失败"
          description="请确认 Git 基线、Go 工具链与本地开发服务可用后重试。"
          action={<Button onClick={reloadReview}>重试</Button>}
        />
      ) : null}
      {report ? (
        <>
          {!report.current || failed.length ? (
            <Alert
              type={!report.current ? 'warning' : 'error'}
              showIcon
              message={!report.current ? '读取期间源码已变化，请重新读取' : `${failed.length} 项合同检查需要修正`}
            />
          ) : null}
          <div className="erp-dev-rpc-review__summary">
            <strong>{stagedEmpty ? '暂无暂存的接口改动' : report.changes.length
              ? `${report.changes.length} 个接口有变化` : '本轮无接口合同变化'}
            </strong>
            <span>共 {report.methodCount} 个接口</span>
            <div className="erp-dev-rpc-review__identity">
              <code>基线 {report.base.slice(0, 12)}</code>
              <DevTimestamp value={report.readAt} action="读取于" />
            </div>
          </div>
          <div className="erp-dev-rpc-review__checks" aria-label="本轮合同检查">
            {report.checks.map((check) => (
              <section key={check.key}>
                <strong>{CHECK_LABELS[check.key]}</strong>
                <Status
                  status={check.status}
                  historical={!report.current}
                  label={check.key === 'staging' && check.status === 'missing' && !report.files.some((file) => file.staged)
                    ? '暂无相关暂存' : undefined}
                />
                <p>{check.message}</p>
                {check.issues?.length ? (
                  <ul>
                    {check.issues.map((issue, index) => (
                      <li key={`${issue.key}:${index}`}><code>{issue.key}</code> · {issue.reason}</li>
                    ))}
                  </ul>
                ) : null}
              </section>
            ))}
          </div>
          <ExampleResult report={report} selected={selected} execution={execution} />
          {report.changes.length ? (
            <div className="erp-dev-rpc-review__workspace">
              <aside className="erp-dev-rpc-review__methods" aria-label="变更接口">
                <div className="erp-dev-rpc-review__section-head"><strong>变更接口</strong><span>{report.changes.length} 个方法</span></div>
                {report.changes.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((row) => (
                  <button
                    type="button"
                    key={row.key}
                    className="erp-dev-rpc-review__method"
                    aria-pressed={selected?.key === row.key}
                    onClick={() => update({ change: row.key })}
                  >
                    <strong>{row.label}</strong><code>{row.key}</code>
                    <span>{KIND_LABELS[row.kind]}{row.fields.length ? ` · ${row.fields.length} 处` : ''}</span>
                  </button>
                ))}
                <Pagination current={page} pageSize={PAGE_SIZE} total={report.changes.length} onChange={setPage} hideOnSinglePage />
              </aside>
              <section className="erp-dev-rpc-review__detail" aria-label={`${selected.label}变更详情`}>
                <div className="erp-dev-rpc-review__detail-heading">
                  <strong>{selected.label}</strong><code>{selected.key}</code>
                  {selected.kind !== 'removed' ? <Link to={`${DEV_INTEGRATION_ROUTE}?view=inventory&rpc=${encodeURIComponent(selected.key)}`}>查看正式合同</Link> : null}
                </div>
                <div className="erp-dev-rpc-review__diff">
                  {selected.fields.length ? (
                    <Table
                      rowKey="path"
                      size="middle"
                      bordered
                      columns={[
                            {
                              title: '变更项',
                              dataIndex: 'path',
                              render: (value) => (
                                <code>
                                  {value
                                    .replace(/^parameters\./u, 'params.')
                                    .replace(/^response\./u, '')}
                                </code>
                              ),
                            },
                            {
                              title: '基线',
                              dataIndex: 'before',
                              render: (value) => (
                                <code>{value ?? '未定义'}</code>
                              ),
                            },
                            {
                              title: '本轮',
                              dataIndex: 'after',
                              render: (value) => (
                                <code>{value ?? '已删除'}</code>
                              ),
                            },
                          ]}
                      dataSource={selected.fields}
                      pagination={false}
                    />
                      ) : (
                        <p>
                          相关实现有变化，字段结构未变；仍需核对权限、状态、幂等、错误及业务约束。
                        </p>
                      )}
                  <div className="erp-dev-rpc-review__consumers">
                    <strong>静态识别的调用方</strong>
                    {selected.consumers.length ? (
                          selected.consumers.map((consumer) => (
                            <code key={`${consumer.path}:${consumer.line}`}>
                              {consumer.path}:{consumer.line}
                            </code>
                          ))
                        ) : (
                          <span>
                            未发现可静态识别的直接引用；动态调用仍需人工核对。
                          </span>
                        )}
                  </div>
                  <details>
                    <summary>来源与比较范围</summary>
                    <code>{selected.source || '见正式接口分发'}</code>
                    <span>
                      忽略源码行号，比较字段类型、必填、可空、条件与解析器默认值；业务语义仍由领域测试核对。
                    </span>
                  </details>
                </div>
              </section>
            </div>
          ) : null}
          <details className="erp-dev-rpc-review__files">
            <summary>合同相关改动与暂存范围 · {report.files.length} 个文件</summary>
            <Table
              rowKey="path"
              size="middle"
              bordered
              columns={[
              { title: '文件', dataIndex: 'path', render: (value) => <code>{value}</code> },
              { title: '工作区', dataIndex: 'worktreeChanged', width: 110, render: (value) => value ? '有改动' : '与基线一致' },
              { title: '暂存快照', dataIndex: 'staged', width: 110, render: (value) => <Tag color={value ? 'green' : 'default'}>{value ? '已包含' : '未暂存'}</Tag> },
            ]}
              dataSource={report.files}
              pagination={{ pageSize: 10, showSizeChanger: false, hideOnSinglePage: true }}
            />
          </details>
        </>
      ) : null}
    </section>
  )
}
