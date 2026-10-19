import React, { useEffect, useRef, useState } from 'react'
import { CopyOutlined, ReloadOutlined } from '@ant-design/icons'
import {
  Alert,
  Button,
  Empty,
  Pagination,
  Select,
  Space,
  Tag,
  Typography,
} from 'antd'
import { Link, useSearchParams } from 'react-router-dom'
import SlidingTabList from '@/common/components/navigation/SlidingTabList'
import Table from '@/common/components/table/AppTable'
import { message } from '@/common/utils/antdApp'
import {
  DEV_INTEGRATION_ROUTE,
  DEV_TESTING_ROUTE,
} from '../config/devRoutes.mjs'
import {
  parseRPCReviewSearch,
  readRPCContractReview,
  RPC_EXAMPLE_VERIFY_COMMAND,
  RPC_REVIEW_STATUS,
} from '../config/devRPCContractReview.mjs'
import DevTimestamp from './DevTimestamp.jsx'
import '../styles/dev-rpc-contract-review.css'

const CHECK_LABELS = {
  catalog: '接口目录完整性',
  generated: '字段与生成物同步',
  staging: '暂存合同同步',
  examples: '样例执行核对',
}
const KIND_LABELS = {
  added: '方法新增',
  removed: '方法删除',
  changed: '合同变化',
  implementation: '实现变化',
}
const DETAIL_VIEWS = [
  ['diff', '合同差异'],
  ['checks', '检查详情'],
  ['sample', '样例核对'],
]
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

function Status({ status, historical = false }) {
  const [label, color] = RPC_REVIEW_STATUS[status] || RPC_REVIEW_STATUS.missing
  return (
    <Tag color={historical && status === 'passed' ? 'gold' : color}>
      {historical && status === 'passed' ? '历史通过' : label}
    </Tag>
  )
}

function ExampleResult({
  report,
  selected,
  onRunExamples,
  runningExamples,
  examplesDisabled,
  executionOperation,
}) {
  const evidence = report.execution
  const evidenceError =
    typeof evidence.message === 'string' ? evidence.message : ''
  const row = evidence.methods.find((method) => method.key === selected?.key)
  const registered = selected
    ? evidence.registered.includes(selected.key)
    : evidence.registered.length > 0
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
        <strong>实际执行结果</strong>
        <Status
          status={
            evidenceError
              ? 'failed'
              : row?.status || (selected ? 'missing' : evidence.status)
          }
          historical={!evidenceError && !evidence.current}
        />
      </div>
      <p>
        {evidenceError ||
          (selected && !registered
            ? '该接口当前只有样例来源或字段结构校验，尚未登记可执行的文档样例。'
            : !evidence.receipt
              ? '尚无样例执行回执；关联测试名称不能代替实际执行。'
              : !evidence.current
                ? '这份工作区样例回执未覆盖当前比较对象，保留为历史结果。'
                : '请求已送入隔离夹具，实际序列化响应与文档样例的主要字段逐项核对。')}
      </p>
      {row?.cases?.length ? (
        <div className="erp-dev-rpc-review__case-list">
          {row.cases.map((item) => (
            <span key={item.name}>
              <Status status={item.status} historical={!evidence.current} />
              {CASE_LABELS[item.name] || item.name}
            </span>
          ))}
        </div>
      ) : null}
      {row?.failureFields?.length ? (
        <p role="alert">
          不一致字段：
          {row.failureFields.map((field) => (
            <code key={field}>{field} </code>
          ))}
        </p>
      ) : null}
      <Typography.Text type="secondary">
        登记可执行样例：{evidence.registered.length}{' '}
        个接口；其余接口不推断为执行通过。
      </Typography.Text>
      {evidence.status === 'failed' ? (
        <p role="alert">本次样例执行未整体通过，请查看失败或缺失结果。</p>
      ) : null}
      {executionOperation ? (
        <p role="status">工作区执行记录 · {executionOperation.message}</p>
      ) : null}
      <Space wrap>
        {onRunExamples ? (
          <Button
            type="primary"
            loading={runningExamples}
            disabled={examplesDisabled || report.range === 'staged'}
            onClick={onRunExamples}
          >
            运行样例核对
          </Button>
        ) : (
          <Link
            to={`${DEV_TESTING_ROUTE}?view=contracts&contractRange=${report.range}${selected ? `&change=${encodeURIComponent(selected.key)}` : ''}`}
          >
            到改动验证执行样例核对
          </Link>
        )}
        <Button icon={<CopyOutlined aria-hidden="true" />} onClick={copy}>
          复制核对命令
        </Button>
      </Space>
      {report.range === 'staged' ? (
        <Typography.Text type="secondary">
          执行动作只核对工作区，请切回工作区运行；回执不代替暂存快照验证。
        </Typography.Text>
      ) : null}
      <details>
        <summary>命令与证据来源</summary>
        <code>{RPC_EXAMPLE_VERIFY_COMMAND}</code>
        {evidence.receipt ? <code>{evidence.receipt}</code> : null}
        {evidence.finishedAt ? (
          <DevTimestamp value={evidence.finishedAt} action="执行完成于" />
        ) : null}
        <span>
          仅运行登记的 Go
          服务夹具，不连接业务数据库；库存、财务事务和第三方接入仍按原专项验证。
        </span>
      </details>
    </section>
  )
}

export default function DevRPCContractReview({
  mode = 'changes',
  onRunExamples,
  runningExamples = false,
  examplesDisabled = false,
  executionOperation = null,
  refreshKey = '',
}) {
  const [params, setParams] = useSearchParams()
  const query = parseRPCReviewSearch(params)
  const pendingParams = useRef(params)
  const observedParams = useRef(params.toString())
  const requestSequence = useRef(0)
  const [state, setState] = useState({
    loading: true,
    data: null,
    error: false,
  })
  const [reload, setReload] = useState(0)
  const [page, setPage] = useState(1)
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
        if (
          !controller.signal.aborted &&
          sequence === requestSequence.current
        ) {
          setState({ loading: false, data, error: false })
        }
      })
      .catch(() => {
        if (
          !controller.signal.aborted &&
          sequence === requestSequence.current
        ) {
          setState({ loading: false, data: null, error: true })
        }
      })
    return () => controller.abort()
  }, [query.range, reload, refreshKey])
  useEffect(() => {
    const index =
      state.data?.changes.findIndex((row) => row.key === query.method) ?? -1
    setPage(index < 0 ? 1 : Math.floor(index / PAGE_SIZE) + 1)
  }, [query.range, state.data, query.method])

  const report = state.data
  const selected =
    report?.changes.find((row) => row.key === query.method) ||
    report?.changes[0] ||
    null
  const checks = report
    ? [
        ...report.checks,
        {
          key: 'examples',
          status: report.execution.message
            ? 'failed'
            : report.execution.current
              ? report.execution.status
              : 'missing',
          message:
            report.execution.message ||
            (!report.execution.receipt
              ? '尚无实际执行回执'
              : !report.execution.current
                ? '历史工作区回执，未覆盖当前比较对象'
                : `${report.execution.methods.length} 个接口具有本次执行结果`),
        },
      ]
    : []
  const failed = checks.filter((check) => check.status === 'failed')
  const stagedEmpty =
    report?.range === 'staged' && !report.files.some((file) => file.staged)
  const selectedLabel = selected?.label || ''
  const qualityLink = `${DEV_TESTING_ROUTE}?view=contracts&contractRange=${query.range}${selected ? `&change=${encodeURIComponent(selected.key)}` : ''}`
  const changesLink = `${DEV_INTEGRATION_ROUTE}?view=changes&contractRange=${query.range}${selected ? `&change=${encodeURIComponent(selected.key)}` : ''}`
  const checkContent = () => (
    <div className="erp-dev-rpc-review__checks" aria-label="本轮合同检查">
      {checks.map((check) => (
        <section key={check.key}>
          <div>
            <strong>{CHECK_LABELS[check.key]}</strong>
            <Status status={check.status} historical={!report.current} />
          </div>
          <p>{check.message}</p>
          {check.issues?.length ? (
            <ul>
              {check.issues.map((issue, index) => (
                <li key={`${issue.key}:${index}`}>
                  <code>{issue.key}</code> · {issue.reason}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ))}
    </div>
  )
  return (
    <section
      className="erp-dev-rpc-review"
      aria-label={mode === 'checks' ? '接口合同检查' : '本轮接口变更'}
    >
      <div className="erp-dev-rpc-review__toolbar">
        <label>
          比较范围{' '}
          <Select
            aria-label="接口合同比较范围"
            value={query.range}
            options={[
              { value: 'worktree', label: 'HEAD → 工作区' },
              { value: 'staged', label: 'HEAD → 暂存快照' },
            ]}
            onChange={(range) =>
              update({
                contractRange: range === 'worktree' ? '' : range,
                change: '',
              })
            }
          />
        </label>
        <Space wrap>
          <Link to={mode === 'checks' ? changesLink : qualityLink}>
            {mode === 'checks' ? '回到合同差异' : '到改动验证查看检查'}
          </Link>
          <Button
            icon={<ReloadOutlined aria-hidden="true" />}
            loading={state.loading}
            onClick={() => setReload((value) => value + 1)}
          >
            重新读取
          </Button>
        </Space>
      </div>
      {state.loading ? (
        <p role="status">正在只读核对后端声明、正式合同与暂存范围…</p>
      ) : null}
      {state.error ? (
        <Alert
          type="error"
          showIcon
          message="接口合同检查读取失败"
          description="请确认 Git 基线、Go 工具链与本地开发服务可用后重试。"
          action={
            <Button onClick={() => setReload((value) => value + 1)}>
              重试
            </Button>
          }
        />
      ) : null}
      {report ? (
        <>
          <Alert
            type={
              !report.current
                ? 'warning'
                : stagedEmpty
                  ? 'info'
                  : failed.length
                    ? 'error'
                    : 'success'
            }
            showIcon
            message={
              !report.current
                ? '读取期间源码已变化，请重新读取'
                : stagedEmpty
                  ? '暂无暂存的接口改动'
                  : failed.length
                    ? `${failed.length} 项合同检查需要修正`
                    : '目录与字段检查未发现阻断项'
            }
            description={
              report.range === 'staged' && !report.changes.length
                ? '当前暂存范围没有接口合同变化；可切换工作区查看尚未暂存的变更。'
                : `${report.changes.length} 个方法受影响 · 共 ${report.methodCount} 个接口。生成一致、样例执行和完整业务验证分别判定。`
            }
          />
          <div className="erp-dev-rpc-review__identity">
            <code>基线 {report.base.slice(0, 12)}</code>
            <DevTimestamp value={report.readAt} action="读取于" />
          </div>
          {mode === 'checks' ? (
            <>
              {checkContent()}
              <ExampleResult
                report={report}
                selected={null}
                onRunExamples={onRunExamples}
                runningExamples={runningExamples}
                examplesDisabled={examplesDisabled}
                executionOperation={executionOperation}
              />
              <details className="erp-dev-rpc-review__files" open>
                <summary>
                  合同相关改动与暂存范围 · {report.files.length} 个文件
                </summary>
                <Table
                  rowKey="path"
                  size="middle"
                  bordered
                  columns={[
                    {
                      title: '文件',
                      dataIndex: 'path',
                      render: (value) => <code>{value}</code>,
                    },
                    {
                      title: '工作区',
                      dataIndex: 'worktreeChanged',
                      width: 110,
                      render: (value) => (value ? '有改动' : '与基线一致'),
                    },
                    {
                      title: '暂存快照',
                      dataIndex: 'staged',
                      width: 110,
                      render: (value) => (
                        <Tag color={value ? 'green' : 'default'}>
                          {value ? '已包含' : '未暂存'}
                        </Tag>
                      ),
                    },
                  ]}
                  dataSource={report.files}
                  pagination={{
                    pageSize: 10,
                    showSizeChanger: false,
                    hideOnSinglePage: true,
                  }}
                />
              </details>
            </>
          ) : report.changes.length ? (
            <div className="erp-dev-rpc-review__workspace">
              <aside
                className="erp-dev-rpc-review__methods"
                aria-label="变更接口"
              >
                <div className="erp-dev-rpc-review__section-head">
                  <strong>变更接口</strong>
                  <span>{report.changes.length} 个方法</span>
                </div>
                {report.changes
                  .slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)
                  .map((row) => (
                    <button
                      type="button"
                      key={row.key}
                      className="erp-dev-rpc-review__method"
                      aria-pressed={selected?.key === row.key}
                      onClick={() => update({ change: row.key })}
                    >
                      <strong>{row.label}</strong>
                      <code>{row.key}</code>
                      <span>
                        {KIND_LABELS[row.kind]}
                        {row.fields.length ? ` · ${row.fields.length} 处` : ''}
                      </span>
                    </button>
                  ))}
                <Pagination
                  simple
                  current={page}
                  pageSize={PAGE_SIZE}
                  total={report.changes.length}
                  onChange={setPage}
                  hideOnSinglePage
                />
              </aside>
              <section
                className="erp-dev-rpc-review__detail"
                aria-label={`${selectedLabel}变更详情`}
              >
                <div className="erp-dev-rpc-review__detail-heading">
                  <strong>{selectedLabel}</strong>
                  <code>{selected.key}</code>
                  {selected.kind !== 'removed' ? (
                    <Link
                      to={`${DEV_INTEGRATION_ROUTE}?view=inventory&rpc=${encodeURIComponent(selected.key)}`}
                    >
                      查看正式合同
                    </Link>
                  ) : null}
                </div>
                <SlidingTabList
                  className="erp-navigation-tabs erp-navigation-tabs--options erp-dev-rpc-review__tabs"
                  role="tablist"
                  aria-label="接口变更详情"
                >
                  {DETAIL_VIEWS.map(([key, label]) => (
                    <button
                      key={key}
                      id={`rpc-review-tab-${key}`}
                      role="tab"
                      aria-selected={query.detail === key}
                      aria-controls="rpc-review-detail"
                      data-tab-key={key}
                      type="button"
                      onClick={() =>
                        update({ contractDetail: key === 'diff' ? '' : key })
                      }
                    >
                      {label}
                    </button>
                  ))}
                </SlidingTabList>
                <div
                  id="rpc-review-detail"
                  role="tabpanel"
                  aria-labelledby={`rpc-review-tab-${query.detail}`}
                >
                  {query.detail === 'diff' ? (
                    <>
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
                    </>
                  ) : query.detail === 'checks' ? (
                    checkContent()
                  ) : (
                    <ExampleResult report={report} selected={selected} />
                  )}
                </div>
              </section>
            </div>
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="此比较范围没有接口合同或相关实现变化"
            />
          )}
        </>
      ) : null}
    </section>
  )
}
