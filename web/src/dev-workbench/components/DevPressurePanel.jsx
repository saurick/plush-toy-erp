import React, { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  Alert,
  Button,
  Empty,
  Progress,
  Select,
  Skeleton,
  Space,
  Tag,
  Typography,
} from 'antd'
import {
  PlayCircleOutlined,
  ReloadOutlined,
  FileTextOutlined,
} from '@ant-design/icons'
import DevTimestamp from './DevTimestamp.jsx'
import {
  DEV_PRESSURE_ACTIONS,
  getDevTestingOperationPresentation,
  isDevTestingOperationActive,
} from '../config/devTestingOperation.mjs'
import {
  DEV_PRESSURE_CHECKS,
  DEV_PRESSURE_FINGERPRINTS,
  DEV_PRESSURE_FRESHNESS,
  DEV_PRESSURE_LEDGER,
  DEV_PRESSURE_LEVELS,
  DEV_PRESSURE_PHASES,
  DEV_PRESSURE_STATUS,
  formatPressureNumber as format,
  pressureMainLevel,
  isDevPressureReportID,
  readDevPressureReports,
} from '../config/devPressure.mjs'
import { formatDevTimestamp } from '../config/devTimestamp.mjs'

const { Paragraph, Text, Title } = Typography
function Metric({ label, value, unit, note }) {
  return (
    <article className="erp-dev-pressure-metric">
      <span>{label}</span>
      <strong>
        {value} <small>{unit}</small>
      </strong>
      <small>{note}</small>
    </article>
  )
}
function Verdict({ value }) {
  return (
    <Tag color={value === true ? 'green' : value === false ? 'red' : 'default'}>
      {value === true ? '通过' : value === false ? '未通过' : '未采集'}
    </Tag>
  )
}
function StageChart({ levels }) {
  const maximum = Math.max(
    1,
    ...levels.flatMap((level) => [
      level.operations.successfulRps || 0,
      level.rpc.successfulRps || 0,
    ])
  )
  return (
    <section className="erp-dev-pressure-section" aria-label="各阶段有效吞吐">
      <Title level={3}>各阶段有效吞吐</Title>
      <p className="erp-dev-pressure-note">
        蓝色为混合操作，绿色为实际 API；两种计数分别比较，单位为成功次数 / 秒。
      </p>
      <div
        className="erp-dev-pressure-chart"
        role="img"
        aria-label="升压、主段与恢复的混合操作和 API 有效吞吐对比"
      >
        {levels.map((level) => (
          <div key={level.key} className="erp-dev-pressure-chart-row">
            <strong>
              {DEV_PRESSURE_LEVELS[level.key]}
              <small>{level.concurrency} workers</small>
            </strong>
            <div className="erp-dev-pressure-bars">
              {[
                ['混合操作', 'operations'],
                ['实际 API', 'rpc'],
              ].map(([label, key]) => (
                <div key={key} className="erp-dev-pressure-bar-line">
                  <span>{label}</span>
                  <div className="erp-dev-pressure-track">
                    <span
                      className={`erp-dev-pressure-bar erp-dev-pressure-bar--${key}`}
                      style={{
                        width: `${((level[key].successfulRps || 0) / maximum) * 100}%`,
                      }}
                    />
                  </div>
                  <b>{format(level[key].successfulRps, 2)}</b>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="erp-dev-tool-table-wrap">
        <table className="erp-dev-tool-table" aria-label="业务负载阶段明细">
          <thead>
            <tr>
              <th>阶段</th>
              <th>时长</th>
              <th>混合成功 / 失败</th>
              <th>API 成功 / 失败</th>
              <th>完整流程</th>
              <th>阶段判定</th>
            </tr>
          </thead>
          <tbody>
            {levels.map((level) => (
              <tr key={level.key}>
                <th scope="row">{DEV_PRESSURE_LEVELS[level.key]}</th>
                <td>
                  {format(
                    level.elapsedMs === null ? null : level.elapsedMs / 1000,
                    1
                  )}{' '}
                  秒
                </td>
                <td>
                  {format(level.operations.successes)} /{' '}
                  {format(level.operations.failures)}
                </td>
                <td>
                  {format(level.rpc.successes)} / {format(level.rpc.failures)}
                </td>
                <td>{format(level.completedBusinessFlows)}</td>
                <td>
                  <Verdict value={level.accepted} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
function MethodLatency({ level }) {
  if (!level) return null
  const scale = Math.max(
    level.limits.p99Ms || 1,
    ...level.methods.map((method) => method.p99Ms || 0)
  )
  return (
    <section className="erp-dev-pressure-section" aria-label="主段方法延迟">
      <Title level={3}>主段方法延迟</Title>
      <p className="erp-dev-pressure-note">
        单次 API：p95 ≤ {format(level.limits.p95Ms)} ms，p99 ≤{' '}
        {format(level.limits.p99Ms)} ms，每方法至少{' '}
        {format(level.limits.minMethodSamples)} 个成功样本。蓝色 p95，绿色 p99。
      </p>
      <div className="erp-dev-tool-table-wrap">
        <table
          className="erp-dev-tool-table erp-dev-pressure-methods"
          aria-label="每方法延迟与样本"
        >
          <thead>
            <tr>
              <th>API 方法</th>
              <th>成功 / 失败</th>
              <th>延迟分布</th>
              <th>p95</th>
              <th>p99</th>
            </tr>
          </thead>
          <tbody>
            {level.methods.map((method) => (
              <tr key={method.name}>
                <th scope="row">
                  <code>{method.name}</code>
                  {method.successes < level.limits.minMethodSamples ? (
                    <Tag color="orange">样本不足</Tag>
                  ) : null}
                </th>
                <td>
                  {format(method.successes)} / {format(method.failures)}
                </td>
                <td>
                  <div
                    className="erp-dev-pressure-latency-bars"
                    role="img"
                    aria-label={`${method.name} p95 ${format(method.p95Ms)} ms，p99 ${format(method.p99Ms)} ms`}
                  >
                    <span
                      className="erp-dev-pressure-bar erp-dev-pressure-bar--operations"
                      style={{
                        width: `${((method.p95Ms || 0) / scale) * 100}%`,
                      }}
                    />
                    <span
                      className="erp-dev-pressure-bar erp-dev-pressure-bar--rpc"
                      style={{
                        width: `${((method.p99Ms || 0) / scale) * 100}%`,
                      }}
                    />
                  </div>
                </td>
                <td
                  className={
                    method.p95Ms > level.limits.p95Ms
                      ? 'erp-dev-pressure-over-limit'
                      : ''
                  }
                >
                  {format(method.p95Ms, 1)} ms
                </td>
                <td
                  className={
                    method.p99Ms > level.limits.p99Ms
                      ? 'erp-dev-pressure-over-limit'
                      : ''
                  }
                >
                  {format(method.p99Ms, 1)} ms
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}
function PressureReport({ report }) {
  const main = pressureMainLevel(report)
  const readMain = pressureMainLevel(report, 'reads')
  const p95Values =
    main?.methods.map((method) => method.p95Ms).filter(Number.isFinite) || []
  const p99Values =
    main?.methods.map((method) => method.p99Ms).filter(Number.isFinite) || []
  const maxP95 = p95Values.length ? Math.max(...p95Values) : null
  const maxP99 = p99Values.length ? Math.max(...p99Values) : null
  const status = DEV_PRESSURE_STATUS[report.status]
  const freshness = DEV_PRESSURE_FRESHNESS[report.freshness]
  return (
    <div className="erp-dev-pressure-report" aria-label="压力测试报告">
      <section className="erp-dev-pressure-identity">
        <div>
          <Space wrap>
            <Tag color={status.color}>{status.label}</Tag>
            <Tag color={freshness.color}>{freshness.label}</Tag>
            <Tag>
              {report.profile === 'capacity' ? '10 分钟容量' : '短档回归'}
            </Tag>
          </Space>
          <p>
            候选{' '}
            <code>{report.candidate.commit?.slice(0, 12) || '未记录'}</code> ·{' '}
            {report.candidate.treeState || '源码状态未记录'} ·{' '}
            <DevTimestamp value={report.completedAt} action="完成于" />
          </p>
        </div>
        <details>
          <summary>代码身份与运行环境</summary>
          <dl>
            <dt>完整提交</dt>
            <dd>
              <code>{report.candidate.commit || '未记录'}</code>
            </dd>
            <dt>迁移</dt>
            <dd>{report.candidate.migration || '未记录'}</dd>
            <dt>二进制摘要</dt>
            <dd>
              <code>{report.candidate.binarySHA256 || '未记录'}</code>
            </dd>
            {Object.entries(report.candidate.fingerprints).map(
              ([key, value]) => (
                <React.Fragment key={key}>
                  <dt>{DEV_PRESSURE_FINGERPRINTS[key]}</dt>
                  <dd>
                    <code>{value || '未记录'}</code>
                  </dd>
                </React.Fragment>
              )
            )}
          </dl>
          <p>
            已变化：
            {report.changed
              .map((key) => DEV_PRESSURE_FINGERPRINTS[key])
              .join('、') || '无已识别变化'}
            ；缺少核对证据：
            {report.unknown
              .map((key) => DEV_PRESSURE_FINGERPRINTS[key])
              .join('、') || '无'}
            。
          </p>
          <p>
            后端 GOMAXPROCS {format(report.environment.backend.gomaxprocs)}
            ，连接池 {format(report.environment.backend.maxOpenConnections)}
            ，使用宿主机 CPU 与内存。
          </p>
          {report.environment.containers.map((item) => (
            <p key={item.service}>
              {item.service}：
              {format(item.nanoCPUs === null ? null : item.nanoCPUs / 1e9)} CPU
              /{' '}
              {format(
                item.memoryLimitBytes === null
                  ? null
                  : item.memoryLimitBytes / 1048576
              )}{' '}
              MiB；
              <code>{item.imageID || '镜像身份未记录'}</code>
            </p>
          ))}
        </details>
      </section>
      {report.freshness !== 'matched' ? (
        <p className="erp-dev-pressure-note">
          这是历史候选的运行证据；当前源码的容量结论需要重新运行对应档位。
        </p>
      ) : null}
      {report.status !== 'passed' ? (
        <Alert
          type="error"
          showIcon
          message="该次压力测试未形成完整通过证据"
          description={
            report.failureStage
              ? `停止于：${DEV_PRESSURE_PHASES[report.failureStage] || '未识别阶段'}。已保留可读报告，请核对失败项后重新运行。`
              : '请核对阶段结果、业务对账与资源清理。'
          }
        />
      ) : null}
      <div className="erp-dev-pressure-metrics">
        <Metric
          label="主段混合操作吞吐"
          value={format(main?.operations.successfulRps, 2)}
          unit="次 / 秒"
          note="查询或一次完整办理各算一次操作"
        />
        <Metric
          label="主段实际 API 吞吐"
          value={format(main?.rpc.successfulRps, 2)}
          unit="次 / 秒"
          note="一次完整办理会发出多次 API"
        />
        <Metric
          label="主段完整业务流程"
          value={format(main?.completedBusinessFlows)}
          unit="条"
          note={`流程 p95 ${format(main?.flows.successes ? main.flows.p95Ms : null)} ms / p99 ${format(main?.flows.successes ? main.flows.p99Ms : null)} ms`}
        />
        <Metric
          label="各方法最高 API 延迟"
          value={format(maxP95)}
          unit="ms · p95"
          note={`最高 p99 ${format(maxP99)} ms；门限针对单次 API`}
        />
      </div>
      {report.engineering?.levels.length ? (
        <StageChart levels={report.engineering.levels} />
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description="该次尚无业务负载读数"
        />
      )}
      <MethodLatency level={main} />
      <section
        className="erp-dev-pressure-section"
        aria-label="业务正确性与恢复"
      >
        <Title level={3}>业务正确性与恢复</Title>
        <div className="erp-dev-pressure-checks">
          {Object.entries(DEV_PRESSURE_CHECKS).map(([key, label]) => (
            <div key={key}>
              <span>
                {label}
                {key === 'competition'
                  ? `（${format(report.checks.concurrency)} 路）`
                  : ''}
              </span>
              <Verdict value={report.checks[key]} />
            </div>
          ))}
        </div>
        <details>
          <summary>查看数据库对账和资源采样</summary>
          <div className="erp-dev-tool-table-wrap">
            <table className="erp-dev-tool-table" aria-label="数据库前后对账">
              <thead>
                <tr>
                  <th>核对项</th>
                  <th>负载前</th>
                  <th>负载后</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(DEV_PRESSURE_LEDGER).map(([key, label]) => (
                  <tr key={key}>
                    <th scope="row">{label}</th>
                    <td>{format(report.database.before[key])}</td>
                    <td>{format(report.database.after[key])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>
            数据库采样 {format(report.database.samples)} 次，采样错误{' '}
            {format(report.database.sampleErrors)}，死锁{' '}
            {format(report.database.deadlocks)}，冲突{' '}
            {format(report.database.conflicts)}，最大连接{' '}
            {format(report.database.maxConnections)}，最大等待锁{' '}
            {format(report.database.maxLockWaiters)}。
          </p>
          <p>
            运行采样 {format(report.runtime.samples)} 次，采样错误{' '}
            {format(report.runtime.sampleErrors)}，堆内存峰值{' '}
            {report.runtime.maxHeapBytes === null
              ? '—'
              : format(report.runtime.maxHeapBytes / 1048576, 1)}{' '}
            MiB，连接峰值 {format(report.runtime.maxConnections)}，goroutine
            峰值 {format(report.runtime.maxGoroutines)}。
          </p>
        </details>
      </section>
      <details className="erp-dev-pressure-section">
        <summary>查询基线与生命周期明细</summary>
        {readMain ? (
          <p>
            独立查询基线：{format(readMain.operations.successes)} 次成功，
            {format(readMain.operations.failures)} 次失败，
            {format(readMain.rpc.successfulRps, 2)} API / 秒，p95{' '}
            {format(readMain.rpc.p95Ms)} ms，p99 {format(readMain.rpc.p99Ms)}{' '}
            ms。
          </p>
        ) : (
          <p>该次没有可读查询基线。</p>
        )}
        <ol className="erp-dev-pressure-lifecycle">
          {report.steps.map((step) => (
            <li key={step.key}>
              <span>{DEV_PRESSURE_PHASES[step.key]}</span>
              <span>{format(step.durationMs / 1000, 1)} 秒</span>
              <Verdict value={step.passed} />
            </li>
          ))}
        </ol>
      </details>
    </div>
  )
}

export default function DevPressurePanel({
  summary,
  summaryError,
  actionStarting,
  onRun,
  onReloadTesting,
  onOpenDocs,
}) {
  const [state, setState] = useState(null)
  const [searchParams, setSearchParams] = useSearchParams()
  const reportQuery = searchParams.get('report') || ''
  const selected = isDevPressureReportID(reportQuery) ? reportQuery : ''
  const selectReport = useCallback(
    (id) => {
      setSearchParams((current) => {
        const next = new URLSearchParams(current)
        if (isDevPressureReportID(id)) next.set('report', id)
        else next.delete('report')
        return next
      })
    },
    [setSearchParams]
  )
  const [reload, setReload] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const sequence = useRef(0)
  const selectedActiveID = useRef('')
  const operations = DEV_PRESSURE_ACTIONS.map(
    ({ key }) => summary?.operations?.[key]
  ).filter(Boolean)
  const active = operations.find(isDevTestingOperationActive)
  const latest =
    active ||
    operations.sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
  const activeID = active?.id || ''
  const activeReportID = activeID ? `workbench-${activeID}` : ''
  const terminal = operations
    .map((operation) => `${operation.id}:${operation.revision}`)
    .sort()
    .join(',')
  const presentation = getDevTestingOperationPresentation(latest)
  const requested = selected || activeReportID
  const progress = requested === activeReportID ? state?.progress : null

  useEffect(() => {
    if (activeReportID && selectedActiveID.current !== activeReportID) {
      selectedActiveID.current = activeReportID
      selectReport(activeReportID)
    }
    if (!activeReportID) selectedActiveID.current = ''
  }, [activeReportID, selectReport])
  useEffect(() => {
    const controller = new AbortController()
    const requestSequence = ++sequence.current
    let timer
    setLoading(true)
    async function load() {
      try {
        const next = await readDevPressureReports({
          id: requested,
          signal: controller.signal,
        })
        if (controller.signal.aborted || sequence.current !== requestSequence) {
          return
        }
        setState(next)
        setError('')
      } catch (_error) {
        if (controller.signal.aborted || sequence.current !== requestSequence) {
          return
        }
        setError('压力测试报告读取失败，请重新读取或检查本地开发服务。')
      } finally {
        if (
          !controller.signal.aborted &&
          sequence.current === requestSequence
        ) {
          setLoading(false)
          if (activeID) timer = window.setTimeout(load, 2200)
        }
      }
    }
    load()
    return () => {
      controller.abort()
      if (timer) window.clearTimeout(timer)
    }
  }, [activeID, reload, requested, terminal])

  const report =
    state?.report?.id === requested || !requested ? state?.report : null
  const ready = Boolean(summary) && !summaryError
  const disabled = !ready || summary.busy?.active || Boolean(actionStarting)
  const reloadReports = () => {
    setReload((value) => value + 1)
    onReloadTesting()
  }
  const options = (state?.reports || []).map((item) => ({
    value: item.id,
    label: `${formatDevTimestamp(item.completedAt)} · ${item.profile === 'capacity' ? '容量' : '短档'} · ${DEV_PRESSURE_STATUS[item.status].label} · ${item.id}`,
  }))
  if (
    activeReportID &&
    !options.some((option) => option.value === activeReportID)
  ) {
    options.unshift({ value: activeReportID, label: '本次正在运行' })
  }
  return (
    <div
      className="erp-dev-pressure-panel"
      aria-label="核心业务压力测试"
      aria-busy={loading || Boolean(active)}
    >
      <header className="erp-dev-pressure-heading">
        <div>
          <Title level={2}>核心业务压力测试</Title>
          <Paragraph>
            用料计算 → 提交 → 老板审批 → 财务审批 →
            采购读回；每次新建隔离环境和模拟订单池。
          </Paragraph>
        </div>
        <Tag>隔离 PostgreSQL / S3 / 后端</Tag>
      </header>
      <div className="erp-dev-pressure-actions">
        <Space wrap>
          {DEV_PRESSURE_ACTIONS.map((action) => (
            <Button
              key={action.key}
              type={action.profile === 'quick' ? 'primary' : 'default'}
              icon={<PlayCircleOutlined aria-hidden="true" />}
              disabled={disabled}
              loading={
                actionStarting === action.key || active?.action === action.key
              }
              onClick={() => onRun(action.key)}
            >
              {action.label}
            </Button>
          ))}
          <Button
            icon={<ReloadOutlined aria-hidden="true" />}
            loading={loading}
            onClick={reloadReports}
          >
            重新读取报告
          </Button>
          <Button
            icon={<FileTextOutlined aria-hidden="true" />}
            onClick={onOpenDocs}
          >
            使用说明
          </Button>
        </Space>
        <Text type="secondary">
          {summaryError ||
            (!ready
              ? '正在核对任务状态'
              : summary.busy?.active && !active
                ? '已有其他 QA 任务运行，结束后可启动压测'
                : '构建、造数和清理时间另计；切换页面后任务继续执行。')}
        </Text>
      </div>
      {latest ? (
        <section className="erp-dev-pressure-operation" role="status">
          <Space wrap>
            <Tag
              color={
                presentation.tone === 'danger'
                  ? 'red'
                  : presentation.tone === 'success'
                    ? 'green'
                    : 'blue'
              }
            >
              {presentation.label}
            </Tag>
            <span>{latest.message}</span>
            <DevTimestamp
              value={latest.finishedAt || latest.updatedAt}
              action="更新于"
            />
          </Space>
          {active ? (
            <>
              <Progress
                percent={Math.round(
                  ((progress?.completedSteps?.length || 0) /
                    Object.keys(DEV_PRESSURE_PHASES).length) *
                    100
                )}
                showInfo={false}
              />
              <p>
                {requested !== activeReportID
                  ? '当前显示历史报告，选择“本次正在运行”查看阶段。'
                  : `${DEV_PRESSURE_PHASES[progress?.phase] || '准备启动'}${DEV_PRESSURE_LEVELS[progress?.stage] ? ` · ${DEV_PRESSURE_LEVELS[progress.stage]}` : ''}${progress?.total ? ` · ${progress.completed} / ${progress.total}` : ''}`}
              </p>
              <small>进度条按已完成阶段计数，不是剩余时间估计。</small>
            </>
          ) : null}
        </section>
      ) : null}
      <details className="erp-dev-pressure-guide">
        <summary>档位、指标与维护规则</summary>
        <ol>
          <li>
            逻辑改动后先跑短档回归；源码稳定后按需要跑容量档，主段持续 10 分钟。
          </li>
          <li>
            主段采用等待上次操作完成后再发起的 worker 模型，约 90% 查询 / 10%
            完整办理；20 路同单竞争独立验证。
          </li>
          <li>
            成功检查 JSON-RPC 业务结果、用量和来源关联。p95 / p99 门限针对单次
            API；混合操作、API 请求和完整流程分别计数。
          </li>
          <li>
            默认单次 API p95 ≤ 1000 ms、p99 ≤ 2000 ms，每方法至少 5
            个成功样本，混合成功吞吐 ≥ 1 次 /
            秒，并要求零操作失败、对账、采样、恢复和清理通过。
          </li>
          <li>
            数据、断言、负载和生命周期分别登记依赖摘要。改业务规则时维护对应配方、断言和依赖清单；审批订单池每次新建。
          </li>
          <li>
            当前范围不含库存抵扣、打印、生产硬件容量、固定到达率、数小时稳定性和客户验收。
          </li>
        </ol>
      </details>
      {error ? (
        <Alert
          showIcon
          type="error"
          message={error}
          description={
            state?.report
              ? '保留上次已读结果；本次读取尚未确认。'
              : '没有可展示的已读结果。'
          }
        />
      ) : null}
      <div className="erp-dev-pressure-report-select">
        <label htmlFor="dev-pressure-report">选择运行报告</label>
        <Select
          id="dev-pressure-report"
          aria-label="选择运行报告"
          value={requested || state?.report?.id || undefined}
          options={options}
          onChange={selectReport}
          placeholder="尚无已完成报告"
        />
      </div>
      {state?.invalidCount ? (
        <p className="erp-dev-pressure-note">
          {state.invalidCount}{' '}
          份报告损坏、超限或合同不完整，已跳过；原始文件保留在本地。
        </p>
      ) : null}
      {loading && !state ? (
        <Skeleton active paragraph={{ rows: 6 }} />
      ) : report ? (
        <PressureReport report={report} />
      ) : (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            active
              ? '本次压测正在执行，完成并清理后发布报告。'
              : '尚无可读压力测试报告；运行短档回归生成第一份证据。'
          }
        />
      )}
    </div>
  )
}
