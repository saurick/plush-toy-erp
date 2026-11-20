import React, { lazy, Suspense, useCallback, useState } from 'react'
import { Button, Calendar, Steps, Tag, Timeline, Typography } from 'antd'
import { LeftOutlined, RightOutlined } from '@ant-design/icons'
import dayjs from 'dayjs'
import AppEmpty from '@/common/components/empty/AppEmpty.jsx'
import SlidingSegmented from '@/common/components/navigation/SlidingSegmented'
import AppTable from '@/common/components/table/AppTable'
import { DEV_WORKBENCH_AREA_KEYS, DEV_WORKSPACE_NAV_ITEMS } from '../config/devRoutes.mjs'
import BusinessFlowDiagram from './flow-state/BusinessFlowDiagram.jsx'
import { WorkbenchNotice, WorkbenchSection } from './WorkbenchPattern.jsx'

const { Text } = Typography
const DocumentExample = lazy(() => import('./DevVisualizationDocumentExample.jsx'))
const BusinessExamples = lazy(() => import('./DevUIBusinessExamples.jsx'))

const RECEIPT_RULE = {
  direction: 'LR',
  nodes: [
    { key: 'receipt', diagramType: 'business_action', domain: 'inventory', label: '仓库登记到货', description: '按实际到货登记采购行。' },
    { key: 'quality', diagramType: 'rule', domain: 'quality', label: '核对本行质检', description: '按收货行核对质量结论。' },
    { key: 'inbound', diagramType: 'business_action', domain: 'inventory', label: '仓库确认入库', description: '通过本行质量门禁并确认后，才形成实际入库。' },
    { key: 'waiting', diagramType: 'rule', risk: true, label: '本行暂不入库', description: '待检只阻断对应行；已通过的其他行可先办理入库。' },
    { key: 'rejected', diagramType: 'business_action', domain: 'purchase', risk: true, label: '采购办理处置', description: '采购办理退厂或补换，保留原拒收结论。' },
  ],
  edges: [
    { from: 'receipt', to: 'quality' },
    { from: 'quality', to: 'inbound', label: '合格或允许让步' },
    { from: 'quality', to: 'waiting', label: '待检', branch: true },
    { from: 'quality', to: 'rejected', label: '拒收', branch: true },
  ],
}
const areas = DEV_WORKSPACE_NAV_ITEMS.filter((item) => item.key !== DEV_WORKBENCH_AREA_KEYS.overview)
const WORKBENCH_TREE = {
  direction: 'TB',
  nodes: [
    { key: 'root', label: '研发效能工作台', description: '按各责任区的主要任务分类。' },
    ...areas.map(({ key, label, description }) => ({ key, label, description })),
  ],
  edges: areas.map(({ key }) => ({ from: 'root', to: key })),
}

function GraphExample({ flow, initial, title, legend }) {
  const [selected, setSelected] = useState(initial)
  const node = flow.nodes.find((item) => item.key === selected)
  return (
    <WorkbenchSection title={title} headingLevel={4} description="结构与规则示意">
      <BusinessFlowDiagram flow={flow} label={title} selectedKey={selected} onSelect={setSelected} legend={legend} />
      <p role="status">{node.label}：{node.description}</p>
    </WorkbenchSection>
  )
}

function ReceiptRuleExample() {
  return <GraphExample flow={RECEIPT_RULE} initial="inbound" title="采购收货：规则允许怎么走？" legend="连线表示条件与去向。图中没有实际入库状态。" />
}

function WorkbenchTreeExample() {
  return <GraphExample flow={WORKBENCH_TREE} initial={DEV_WORKBENCH_AREA_KEYS.developmentResources} title="工作台：模块归哪一类？" legend="连线表示归属；同级责任区没有执行先后。" />
}

const TRACE_ITEMS = [
  { color: 'var(--erp-visual-success-text)', children: <><Text strong>09:10 · 仓库登记到货</Text><p>已登记。</p></> },
  { color: 'var(--erp-visual-success-text)', children: <><Text strong>10:25 · 来料质检</Text><p>该行合格。</p></> },
  { color: 'gray', children: <><Text strong>当前 · 仓库确认入库</Text><p>待办理 · 尚无入库结果。</p></> },
]

function ReceiptProgressExample() {
  return (
    <WorkbenchSection title="这笔收货走到哪？" headingLevel={4} description="事件时间线 · 模拟记录">
      <Timeline className="erp-dev-visualization__trace" items={TRACE_ITEMS} />
    </WorkbenchSection>
  )
}

const CI_JOBS = [
  { key: 'prepare', label: '准备', ready: 0, start: 0, end: 2 },
  { key: 'frontend', label: '前端检查', ready: 2, start: 2, end: 6 },
  { key: 'backend', label: '服务端检查', ready: 2, start: 3, end: 5 },
  { key: 'summary', label: '汇总', ready: 6, start: 6, end: 8 },
]
const CI_TOTAL = Math.max(...CI_JOBS.map((item) => item.end))
const CI_TICKS = Array.from({ length: 5 }, (_, index) => CI_TOTAL * index / 4)

function TimingSegment({ from, to, waiting = false }) {
  return (
    <span
      data-waiting={waiting || undefined}
      style={{
        '--dev-example-offset': `${100 * from / CI_TOTAL}%`,
        '--dev-example-duration': `${100 * (to - from) / CI_TOTAL}%`,
      }}
    />
  )
}

function TimingLanesExample() {
  const [selected, setSelected] = useState(CI_JOBS[1])
  const [inspected, setInspected] = useState(null)
  const current = inspected ?? selected
  const waiting = current.start - current.ready
  return (
    <WorkbenchSection
      title="CI：哪些任务同时在跑？"
      headingLevel={4}
      description={`运行耗时轨道 · 模拟记录 · 总耗时 ${CI_TOTAL} 分钟`}
    >
      <div className="erp-dev-visualization__lane-legend"><span data-waiting>等待</span><span>执行</span></div>
      <div className="erp-dev-visualization__lane-axis">
        <span>任务</span>
        <div aria-label="开始后的分钟数">{CI_TICKS.map((tick) => <span key={tick}>{tick}{tick === CI_TOTAL ? ' 分' : ''}</span>)}</div>
      </div>
      {CI_JOBS.map((item) => (
        <button
          key={item.key}
          type="button"
          className="erp-dev-visualization__lane"
          aria-pressed={selected === item}
          onClick={() => setSelected(item)}
          onFocus={() => setInspected(item)}
          onBlur={() => setInspected(null)}
          onPointerEnter={(event) => { if (event.pointerType !== 'touch') setInspected(item) }}
          onPointerLeave={() => setInspected(null)}
          onKeyDown={(event) => { if (event.key === 'Escape') setInspected(null) }}
        >
          <span>{item.label}</span>
          <span className="erp-dev-visualization__track" aria-hidden="true">
            {item.ready < item.start ? <TimingSegment from={item.ready} to={item.start} waiting /> : null}
            <TimingSegment from={item.start} to={item.end} />
          </span>
        </button>
      ))}
      <p role="status">{current.label}：{waiting ? `等待 ${waiting} 分钟，` : ''}执行 {current.end - current.start} 分钟（第 {current.start}–{current.end} 分钟）。</p>
    </WorkbenchSection>
  )
}

const SAMPLE_DAY = dayjs('2026-11-13')
const SAMPLE_TODAY = dayjs('2026-11-12')
const SAMPLE_TODAY_KEY = SAMPLE_TODAY.format('YYYY-MM-DD')
const TASKS = [
  { key: 'count', date: '2026-11-11', title: '登记到货点数', role: '仓库' },
  { key: 'production', date: '2026-11-13', title: '确认生产任务', role: '生产' },
  { key: 'inbound', date: '2026-11-13', title: '复核入库单', role: '仓库' },
  { key: 'due', date: '2026-11-16', title: '核对订单交期', role: '跟单' },
  { key: 'receipt', date: '2026-11-19', title: '确认收货明细', role: '采购' },
  { key: 'material', date: null, title: '补齐用料资料', role: '工程' },
]
const UNDATED = TASKS.filter((item) => !item.date)
const OVERDUE = TASKS.filter((item) => item.date && item.date < SAMPLE_TODAY_KEY)

function renderCalendarHeader({ value, onChange }) {
  return (
    <div className="erp-dev-visualization__calendar-header">
      <strong aria-live="polite">{value.format('YYYY 年 M 月')}</strong>
      <div>
        <Button size="small" aria-label="上个月" icon={<LeftOutlined />} onClick={() => onChange(value.subtract(1, 'month').startOf('month'))} />
        <Button size="small" aria-label="下个月" icon={<RightOutlined />} onClick={() => onChange(value.add(1, 'month').startOf('month'))} />
        <Button size="small" onClick={() => onChange(SAMPLE_DAY)}>回到示例月</Button>
      </div>
    </div>
  )
}

function CalendarExample() {
  const [date, setDate] = useState(SAMPLE_DAY)
  const [scope, setScope] = useState('date')
  const dateKey = date.format('YYYY-MM-DD')
  const month = date.format('YYYY-MM')
  const current = scope === 'overdue' ? OVERDUE : scope === 'undated' ? UNDATED :
    TASKS.filter((item) => item.date === dateKey)
  const heading = scope === 'overdue' ? '已逾期待办' : scope === 'undated' ? '未设置截止日期' : `${date.format('M 月 D 日')}到期`
  const renderDay = useCallback((value) => {
    const key = value.format('YYYY-MM-DD')
    const count = TASKS.filter((item) => item.date === key).length
    return (
      <button
        type="button"
        className="erp-dev-visualization__calendar-day"
        aria-label={`${value.format('M 月 D 日')}，${count} 项待办`}
        aria-pressed={scope === 'date' && key === dateKey}
        data-reference={key === SAMPLE_TODAY_KEY || undefined}
        data-outside={!key.startsWith(month) || undefined}
      >
        <span className="erp-dev-visualization__calendar-number">{value.date()}</span>
        {count ? <small>{count} 项</small> : null}
      </button>
    )
  }, [dateKey, month, scope])
  const select = (value) => {
    setDate(value)
    setScope('date')
  }
  return (
    <WorkbenchSection title="哪天有哪些待办到期？" headingLevel={4} description={`待办日历 · 演示数据，以 ${SAMPLE_TODAY.format('M 月 D 日')}为基准`}>
      <div className="erp-dev-visualization__calendar">
        <section aria-label="待办日历">
          <Calendar
            fullscreen={false}
            value={date}
            mode="month"
            onSelect={select}
            headerRender={renderCalendarHeader}
            fullCellRender={renderDay}
          />
        </section>
        <WorkbenchSection flat title={heading} headingLevel={5} tools={<Text type="secondary" role="status">{current.length} 项待办</Text>}>
          <div className="erp-dev-visualization__calendar-actions">
            <Button size="small" aria-pressed={scope === 'overdue'} onClick={() => setScope('overdue')}>已逾期 {OVERDUE.length}</Button>
            <Button size="small" aria-pressed={scope === 'undated'} onClick={() => setScope('undated')}>未设日期 {UNDATED.length}</Button>
          </div>
          {current.length ? (
            <ul className="erp-dev-visualization__tasks">
              {current.map((item) => <li key={item.key}><strong>{item.title}</strong><Text type="secondary">{item.role}</Text></li>)}
            </ul>
          ) : <AppEmpty description="所选范围没有示例待办" />}
        </WorkbenchSection>
      </div>
    </WorkbenchSection>
  )
}

const PRINT_STEPS = [
  { title: '选择采购合同模板', description: '右侧切到所选模板。' },
  { title: '查看分区编号', description: '核对各处填什么。' },
  { title: '打开编辑与打印', description: '进入所选模板工作区。' },
]

function StepsExample() {
  return (
    <WorkbenchSection title="采购合同：按什么顺序查看？" headingLevel={4} description="编号步骤">
      <Steps current={-1} direction="vertical" size="small" items={PRINT_STEPS} />
    </WorkbenchSection>
  )
}

function InteractionExample() {
  return (
    <WorkbenchSection title="来源选择：怎样操作和恢复？" headingLevel={4} description="共享控件 · 本地虚构清单">
      <Suspense fallback={<WorkbenchNotice tone="loading" title="正在载入来源选择演示" />}>
        <BusinessExamples type="source-picker" />
      </Suspense>
    </WorkbenchSection>
  )
}

const DELIVERIES = [
  { key: 'on-time', label: '按期', quantity: 8 },
  { key: 'late', label: '延迟', quantity: 2 },
]
const DELIVERY_TOTAL = DELIVERIES.reduce((sum, item) => sum + item.quantity, 0)
const share = (item) => item.quantity / DELIVERY_TOTAL * 100
const DELIVERY_COLUMNS = [
  { title: '交付结果', dataIndex: 'label' },
  { title: '订单数', dataIndex: 'quantity', align: 'right', render: (value) => `${value} 单` },
  { title: '占比', key: 'share', align: 'right', render: (_, item) => `${share(item)}%` },
]

function ChartExample() {
  const [view, setView] = useState('chart')
  const [selected, setSelected] = useState(DELIVERIES[0])
  const [inspected, setInspected] = useState(null)
  const current = inspected ?? selected
  return (
    <WorkbenchSection
      title="交付结果：数量差多少？"
      headingLevel={4}
      description={`11 月 1–7 日 · 已交付 ${DELIVERY_TOTAL} 单 · 演示数据`}
      actions={<SlidingSegmented aria-label="交付结果查看方式" value={view} onChange={setView} options={[{ value: 'chart', label: '图表' }, { value: 'table', label: '表格' }]} />}
    >
      {view === 'table' ? <AppTable size="small" pagination={false} columns={DELIVERY_COLUMNS} dataSource={DELIVERIES} /> : (
        <>
          {DELIVERIES.map((item) => (
            <button
              key={item.key}
              type="button"
              className="erp-dev-visualization__bar"
              aria-pressed={selected === item}
              onClick={() => setSelected(item)}
              onFocus={() => setInspected(item)}
              onBlur={() => setInspected(null)}
              onPointerEnter={(event) => { if (event.pointerType !== 'touch') setInspected(item) }}
              onPointerLeave={() => setInspected(null)}
              onKeyDown={(event) => { if (event.key === 'Escape') setInspected(null) }}
            >
              <span>{item.label}</span>
              <span className="erp-dev-visualization__track" aria-hidden="true">
                <span style={{ '--dev-example-offset': '0%', '--dev-example-duration': `${share(item)}%` }} />
              </span>
              <strong>{item.quantity} 单</strong>
            </button>
          ))}
          <p role="status">{current.label} {current.quantity} / {DELIVERY_TOTAL} 单，占 {share(current)}%。</p>
        </>
      )}
    </WorkbenchSection>
  )
}

const DIFF_ROWS = [
  { key: 'inventory', label: '库存查询', base: '停用', candidate: '启用' },
  { key: 'notes', label: '列表备注', base: '显示', candidate: '隐藏' },
  { key: 'purchase', label: '采购管理', base: '启用', candidate: '启用' },
]
const changed = (row) => row.base !== row.candidate
const DIFF_COLUMNS = [
  { title: '对照项', dataIndex: 'label' },
  { title: '产品默认', dataIndex: 'base' },
  { title: '候选配置', dataIndex: 'candidate', render: (value, row) => changed(row) ? <Tag color="blue">{value}</Tag> : value },
  { title: '差异', key: 'difference', render: (_, row) => changed(row) ? '改值' : '无变化' },
]

function DifferenceExample() {
  const [onlyChanges, setOnlyChanges] = useState(false)
  const rows = onlyChanges ? DIFF_ROWS.filter(changed) : DIFF_ROWS
  return (
    <WorkbenchSection
      title="候选配置改了什么？"
      headingLevel={4}
      description="基线：产品默认 · 目标：候选配置 · 演示值"
      actions={<Button size="small" aria-pressed={onlyChanges} onClick={() => setOnlyChanges((previous) => !previous)}>只看改动</Button>}
    >
      <AppTable size="small" pagination={false} columns={DIFF_COLUMNS} dataSource={rows} />
      <p role="status">显示 {rows.length} 项，其中 {rows.filter(changed).length} 项有变更。</p>
    </WorkbenchSection>
  )
}

const VERIFICATION_COLUMNS = [['rules', '规则检查'], ['browser', '浏览器'], ['print', '打印核对']]
const VERIFICATION_ROWS = [
  { key: 'receipt', label: '收货分支', rules: ['已通过', '样例覆盖合格、待检、拒收三个去向。'], browser: ['未验证', '还没有本轮点击各分支的记录。'], print: ['不适用', '本例没有修改打印版式。'] },
  { key: 'print', label: '打印版式', rules: ['已通过', '讲解标注不进入正式打印。'], browser: ['已通过', '点击编号联动对应区域。'], print: ['失败', '样例签字区被截断，需要重新核对。'] },
]
const RESULT_COLORS = { 已通过: 'success', 未验证: 'warning', 失败: 'error', 不适用: 'default' }

function VerificationMatrixExample() {
  const [selected, setSelected] = useState({ row: VERIFICATION_ROWS[0], column: VERIFICATION_COLUMNS[1] })
  const columns = [
    { title: '改动项', dataIndex: 'label' },
    ...VERIFICATION_COLUMNS.map((column) => {
      const [key, title] = column
      return {
        title,
        dataIndex: key,
        render: ([result], row) => (
          <Button type="text" size="small" aria-label={[row.label, title, result].join('，')} aria-pressed={selected.row === row && selected.column === column} onClick={() => setSelected({ row, column })}>
            <Tag color={RESULT_COLORS[result]}>{result}</Tag>
          </Button>
        ),
      }
    }),
  ]
  const [result, detail] = selected.row[selected.column[0]]
  return (
    <WorkbenchSection title="这轮还有什么没验证？" headingLevel={4} description="验证覆盖矩阵 · 模拟结果">
      <AppTable size="small" pagination={false} columns={columns} dataSource={VERIFICATION_ROWS} />
      <p role="status">{selected.row.label} · {selected.column[1]} · {result}：{detail}</p>
    </WorkbenchSection>
  )
}

function AnnotationExample() {
  return (
    <Suspense fallback={<WorkbenchNotice tone="loading" title="正在载入区域标注演示" />}>
      <DocumentExample />
    </Suspense>
  )
}

export const VISUALIZATION_EXAMPLES = Object.freeze({
  flow: [ReceiptRuleExample],
  relations: [WorkbenchTreeExample],
  progress: [ReceiptProgressExample, TimingLanesExample],
  planning: [CalendarExample],
  steps: [StepsExample],
  annotations: [AnnotationExample],
  interaction: [InteractionExample],
  charts: [ChartExample],
  tables: [DifferenceExample, VerificationMatrixExample],
})

export function VisualizationExamples({ type }) {
  return (
    <div className="erp-dev-visualization__examples">
      {VISUALIZATION_EXAMPLES[type].map((Example) => <Example key={Example.name} />)}
    </div>
  )
}
