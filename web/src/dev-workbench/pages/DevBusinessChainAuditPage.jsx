import React, { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Drawer,
  Empty,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd'
import { useLocation, useSearchParams } from 'react-router-dom'
import { LeftOutlined, ReloadOutlined } from '@ant-design/icons'
import { WorkbenchFacts } from '../components/WorkbenchPattern.jsx'
import { DEV_PAGE_TITLE_BY_ROUTE, DEV_BUSINESS_CHAIN_AUDIT_ROUTE } from '../config/devRoutes.mjs'
import Select from '@/common/components/select/AppSelect'
import Table from '@/common/components/table/AppTable'
import SearchInput from '@/common/components/SearchInput'
import { MermaidDiagram } from '@/common/components/markdown'
import { DEV_PAGINATION } from '../config/devPagination.mjs'
import DevTaskNav from '../components/DevTaskNav.jsx'
import DevChainAuditEvidence, {
  ChainAuditEvidenceLinks,
  ChainAuditFindings,
  ChainAuditState,
} from '../components/DevChainAuditEvidence.jsx'
import {
  CHAIN_AUDIT_STATES,
  CHAIN_DEFINITION_STATES,
  CHAIN_AUDIT_TABS,
  DEV_CHAIN_AUDIT_API,
  buildChainAuditDiagram,
  filterChainAuditSteps,
} from '../config/devBusinessChainAudit.mjs'
import '../styles/dev-business-chain-audit.css'
import FilterSelect from '@/common/components/select/FilterSelect'

const { Title, Text } = Typography
const formatTime = (value) =>
  new Date(value).toLocaleString('zh-CN', { hour12: false })

async function readAuditJSON(url, signal) {
  const response = await fetch(url, {
    signal,
    cache: 'no-store',
    credentials: 'same-origin',
  })
  if (!response.ok) {
    throw new Error(
      response.status === 404
        ? '报告或证据文件不存在'
        : response.status === 401 || response.status === 403
          ? '当前连接无法读取开发工作台报告'
          : '报告读取失败，请核对批次格式与证据清单'
    )
  }
  return response.json()
}

function ChainAuditDiagram({ diagram, label }) {
  const chart = useMemo(() => buildChainAuditDiagram(diagram), [diagram])
  return chart ? (
    <div className="erp-dev-chain-audit__diagram">
      <MermaidDiagram
        chart={chart}
        label={label}
        showSourceOnError={false}
        flowchartHtmlLabels={false}
      />
    </div>
  ) : null
}

function renderStepDetails(row) {
  return (
    <dl className="erp-dev-chain-audit__details">
      <dt>岗位</dt>
      <dd>{row.responsibleRole}</dd>
      <dt>证据层级</dt>
      <dd>{row.level}</dd>
      <dt>交接</dt>
      <dd>
        {row.fromLabel} → {row.toLabel}
      </dd>
      {[
        ['preconditions', '前置条件'],
        ['actions', '登记动作'],
        ['results', '预期结果'],
        ['facts', '事实边界'],
      ].map(([key, label]) => (
        <React.Fragment key={key}>
          <dt>{label}</dt>
          <dd>{row[key].join('；')}</dd>
        </React.Fragment>
      ))}
    </dl>
  )
}

function AuditDisclosure({ title, children }) {
  const [open, setOpen] = useState(false)
  return (
    <details className="erp-dev-disclosure" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary>{title}</summary>
      {open ? children : null}
    </details>
  )
}

function ChainReportContext({ data, chain }) {
  const { report } = data
  const comparison = data.definitionComparison
  const selectedChains = chain === 'all' ? report.chains : report.chains.filter((item) => item.key === chain)
  const scenarioKinds = [...new Map(report.chains.flatMap((item) => item.scenarios).map((row) => [row.key, row.label])).entries()]
  return (
    <div className="erp-dev-chain-audit__stack">
      <p className="erp-dev-chain-audit__verdict">{report.verdict}</p>
      <WorkbenchFacts
        items={[
        { label: '批次', value: data.batch },
        { label: '生成时间', value: formatTime(report.generatedAt) },
        { label: '客户与配置', value: report.scope.customer },
        { label: '数据环境', value: report.scope.data },
        { label: '报告源码', value: <code>{report.scope.sourceCommit}</code> },
        { label: '当前源码', value: <span><code>{data.currentRepository?.commit || '未知'}</code>{data.currentRepository?.dirty ? '（有未提交改动）' : ''}</span> },
        { label: '步骤结果', value: Object.entries(report.metrics.stepStates).map(([status, count]) => `${CHAIN_AUDIT_STATES[status]?.label || status} ${count}`).join(' · ') },
        { label: '执行方式', value: report.scope.mode },
        ]}
      />
      <Text type="secondary">结果仅反映所选批次；提交相同仍不证明完整工作区匹配，也不代表客户验收。</Text>
      <AuditDisclosure title="执行路径与定义核对">
        <section className="erp-dev-chain-audit__section">
          <h2>本批次链路与结果</h2>
          <ChainAuditDiagram
            diagram={data.definitionDiagram || report.diagrams?.overview}
            label={
              data.definitionDiagram
                ? '执行时业务链定义与结果'
                : '历史报告业务路径'
            }
          />
          {data.definitionDiagram ? (
            <Text type="secondary">执行时定义与本批次结果；连线不代表逐单流转。</Text>
          ) : null}
          <p>
            <strong>终点：</strong>
            {report.scope.terminal}
          </p>
          <section>
            <h3>同源读回样本</h3>
            <Table
              size="small"
              pagination={false}
              rowKey="stage"
              dataSource={report.lineage}
              columns={[
                { title: '环节', dataIndex: 'stage', width: 160 },
                { title: '对象', dataIndex: 'record', width: 280 },
                { title: '读回', dataIndex: 'proof' },
              ]}
              scroll={{ x: 820 }}
            />
          </section>
        </section>
        <section
          className="erp-dev-chain-audit__section"
          aria-label="业务链定义核对"
        >
          <h2>与当前业务链定义核对</h2>
          <p>
            <Tag color={comparison?.status === 'unchanged' ? undefined : 'gold'} className={comparison?.status === 'unchanged' ? 'erp-dev-accent-tag' : undefined}>
              {CHAIN_DEFINITION_STATES[comparison?.status] || '定义核对不可用'}
            </Tag>
            历史结果保持原样；定义一致也不代表当前源码已通过实测。
          </p>
          {!comparison ? (
            <Alert
              type="warning"
              showIcon
              message="当前开发服务尚未提供定义核对结果"
              description="重新启动前端开发服务后刷新；历史报告仍按原样显示。"
            />
          ) : null}
          <div>
            <Table
              size="small"
              pagination={false}
              rowKey="key"
              dataSource={comparison?.chains || []}
              scroll={{ x: 800 }}
              columns={[
                { title: '业务链', dataIndex: 'label', width: 220 },
                {
                  title: '定义状态',
                  dataIndex: 'status',
                  width: 210,
                  render: (value) => CHAIN_DEFINITION_STATES[value],
                },
                {
                  title: '本批次覆盖',
                  key: 'coverage',
                  width: 180,
                  render: (_, row) => {
                    if (!row.currentExists) return '仅保留历史记录'
                    if (!row.recorded) return '本批次无该链记录'
                    return row.unrecordedSteps.length
                      ? `未记录 ${row.unrecordedSteps.length} 个当前步骤`
                      : '当前步骤标识均有记录'
                  },
                },
                {
                  title: '变化与待补证据',
                  key: 'changes',
                  render: (_, row) => (
                    <ul>
                      {row.stepChanges.map((step) => (
                        <li key={step.key}>
                          {
                            {
                              added: '新增',
                              removed: '移除',
                              changed: '定义变化',
                            }[step.status]
                          }
                          ：{step.label}
                        </li>
                      ))}
                      {row.unrecordedSteps.map((step) => (
                        <li key={`unrecorded:${step.key}`}>
                          本批次未记录：{step.label}
                        </li>
                      ))}
                      {!row.stepChanges.length && !row.unrecordedSteps.length ? (
                        <li>
                          {row.status === 'changed'
                            ? '节点、链间关系或验证场景已变化'
                            : row.status === 'unverified'
                              ? '缺少冻结定义，无法比较动作、责任与结果条件'
                              : '无步骤差异'}
                        </li>
                      ) : null}
                    </ul>
                  ),
                },
              ]}
            />
          </div>
        </section>
      </AuditDisclosure>
      <AuditDisclosure title="场景覆盖">
        <Table
          size="small"
          rowKey="key"
          pagination={false}
          dataSource={selectedChains}
          scroll={{ x: 1200 }}
          columns={[
            { title: '链路', dataIndex: 'label', width: 200 },
            ...scenarioKinds.map(([key, label]) => ({
              title: label,
              key,
              render: (_, row) =>
                row.scenarios.find((item) => item.key === key)?.result ||
                '未登记',
            })),
          ]}
        />
      </AuditDisclosure>
      <section className="erp-dev-chain-audit__limits">
        <h3>覆盖边界</h3>
        <ul>{report.coverageLimits.map((limit) => <li key={limit}>{limit}</li>)}</ul>
        <p>范围外：{report.scope.notIncluded.join('；')}</p>
      </section>
    </div>
  )
}

function ChainResults({ data, chain, status, keyword, stepKey, updateQuery }) {
  const selectedIndex = data.report.chains.findIndex((item) => item.key === chain)
  const [page, setPage] = useState(() => selectedIndex < 0 ? 1 : Math.floor(selectedIndex / 10) + 1)
  const renderSteps = (row) => <ChainSteps data={data} chain={row.key} status={status} keyword={keyword} stepKey={stepKey} updateQuery={updateQuery} />
  return (
    <>
      <Table
        className="erp-dev-chain-audit__results"
        rowKey="key"
        size="middle"
        dataSource={data.report.chains}
        pagination={{
          ...DEV_PAGINATION,
          current: selectedIndex < 0 ? page : Math.floor(selectedIndex / 10) + 1,
          pageSize: 10,
          hideOnSinglePage: true,
          onChange: (value) => { setPage(value); updateQuery({ chain: null, step: null, scope: null }) },
        }}
        expandable={{
          expandedRowKeys: data.report.chains.some((item) => item.key === chain) ? [chain] : [],
          showExpandColumn: false,
          expandedRowRender: renderSteps,
        }}
        columns={[
          {
            title: '链路',
            dataIndex: 'label',
            width: '38%',
            render: (label, row) => (
              <Button type="link" className="erp-dev-chain-audit__chain-link" aria-expanded={chain === row.key} onClick={() => updateQuery({ chain: chain === row.key ? null : row.key, step: null, status: null, q: null, scope: null })}>{label}</Button>
            ),
          },
          { title: '结果', dataIndex: 'status', width: 110, render: (value) => <ChainAuditState status={value} /> },
          { title: '首个未通过环节', key: 'first', render: (_, row) => row.steps.find((step) => step.status !== 'passed')?.label || '本批次步骤均通过' },
        ]}
      />
      <Button type="link" className="erp-dev-chain-audit__all-steps" onClick={() => updateQuery({ chain: null, step: null, scope: 'steps' })}>查看全部步骤</Button>
    </>
  )
}

function ChainSteps({ data, chain, status, keyword, stepKey, updateQuery }) {
  const rows = useMemo(() => filterChainAuditSteps(data.report, { chain, status, keyword, stepKey }), [data.report, chain, status, keyword, stepKey])
  const selectedChain = data.report.chains.find((item) => item.key === chain)
  return (
    <div className="erp-dev-chain-audit__stack">
      <div className="erp-dev-chain-audit__toolbar">
        <SearchInput allowClear placeholder="搜索环节、岗位或实际读回" value={keyword} onSearch={(value) => updateQuery({ q: value || null })} />
        <FilterSelect
          emptyValue="all"
          label="步骤结果"
          placeholder="步骤结果"
          aria-label="筛选步骤结果"
          value={status}
          className="erp-dev-chain-audit__status-select"
          options={[{ value: 'all', label: '全部结果' }, ...Object.entries(CHAIN_AUDIT_STATES).map(([value, item]) => ({ value, label: item.label }))]}
          onChange={(value) => updateQuery({ status: value === 'all' ? null : value })}
        />
        <Text type="secondary">{rows.length} 个步骤</Text>
        {stepKey ? <Button onClick={() => updateQuery({ step: null })}>取消交接定位</Button> : null}
      </div>
      {stepKey && !data.report.chains.some((item) => (chain === 'all' || item.key === chain) && item.steps.some((step) => step.key === stepKey)) ? (
        <Alert type="warning" showIcon message="所选批次没有这一步的执行记录；旧的合并步骤不能证明当前拆分后的交接。" />
      ) : null}
      {chain !== 'all' && !selectedChain ? (
        <Alert type="warning" showIcon message="所选批次没有这条链路" action={<Button onClick={() => updateQuery({ chain: null, step: null, scope: null, q: null, status: null })}>查看全部链路</Button>} />
      ) : null}
      <Table
        rowKey="rowKey"
        size="middle"
        dataSource={rows}
        pagination={{ ...DEV_PAGINATION, pageSize: 10, hideOnSinglePage: true }}
        columns={[
          { title: '环节', key: 'step', width: '34%', render: (_, row) => <>{!selectedChain ? <Text type="secondary">{row.chainLabel}</Text> : null}<div>{row.number}. {row.label}</div></> },
          { title: '结果', dataIndex: 'status', width: 110, render: (value) => <ChainAuditState status={value} /> },
          { title: '实际操作与读回', dataIndex: 'observed' },
        ]}
        expandable={{ expandedRowRender: renderStepDetails }}
      />
      {selectedChain ? <ChainAuditEvidenceLinks data={data} items={selectedChain.evidence} /> : null}
    </div>
  )
}

export default function DevBusinessChainAuditPage() {
  const { state: navigationState } = useLocation()
  const [searchParams, setSearchParams] = useSearchParams()
  const [revision, setRevision] = useState(0)
  const [catalog, setCatalog] = useState({
    loading: true,
    batches: [],
    error: '',
  })
  const [loaded, setLoaded] = useState({
    batch: '',
    loading: true,
    data: null,
    error: '',
  })
  const requestedBatch = searchParams.get('batch') || ''
  const batch = searchParams.get('batch') === '' ? '' :
    requestedBatch ||
    catalog.batches.find((item) => item.status === 'ready')?.id ||
    catalog.batches[0]?.id ||
    ''
  const view = CHAIN_AUDIT_TABS.some(
    (item) => item.value === searchParams.get('view')
  )
    ? searchParams.get('view')
    : 'chains'
  const chain = searchParams.get('chain') || 'all'
  const status = Object.hasOwn(CHAIN_AUDIT_STATES, searchParams.get('status'))
    ? searchParams.get('status')
    : 'all'
  const keyword = searchParams.get('q') || ''
  const stepKey = searchParams.get('step') || ''
  const detailsOpen = searchParams.get('details') === 'report' || view !== 'chains'
  const showSteps = chain !== 'all' || Boolean(stepKey || keyword) || status !== 'all' || searchParams.get('scope') === 'steps'
  const updateQuery = (patch) => {
    const next = new URLSearchParams(searchParams)
    if (batch) next.set('batch', batch)
    Object.entries(patch).forEach(([key, value]) =>
      value == null ? next.delete(key) : next.set(key, value)
    )
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true, state: navigationState })
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    setCatalog((previous) => ({ ...previous, loading: true, error: '' }))
    readAuditJSON(DEV_CHAIN_AUDIT_API, controller.signal)
      .then((result) => {
        if (!Array.isArray(result.batches)) {
          throw new Error('批次目录格式不完整')
        }
        if (!controller.signal.aborted) {
          setCatalog({ batches: result.batches, loading: false, error: '' })
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setCatalog((previous) => ({
            ...previous,
            loading: false,
            error: error.message,
          }))
        }
      })
    return () => controller.abort()
  }, [revision])

  useEffect(() => {
    if (!batch) return undefined
    const controller = new AbortController()
    setLoaded({ batch, loading: true, data: null, error: '' })
    readAuditJSON(
      `${DEV_CHAIN_AUDIT_API}/report?${new URLSearchParams({ batch })}`,
      controller.signal
    )
      .then((data) => {
        if (
          data.batch !== batch ||
          !Array.isArray(data.report?.chains) ||
          !Array.isArray(data.files)
        ) {
          throw new Error('报告格式不完整')
        }
        if (!controller.signal.aborted) {
          setLoaded({ batch, loading: false, data, error: '' })
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setLoaded({ batch, loading: false, data: null, error: error.message })
        }
      })
    return () => controller.abort()
  }, [batch, revision])

  const data = loaded.batch === batch ? loaded.data : null
  const error = loaded.batch === batch ? loaded.error : ''
  const report = data?.report
  const selectedChain = report?.chains.find((item) => item.key === chain)
  const freshness = data?.freshness === 'historical' ? '历史报告' : data?.freshness === 'unknown' ? '源码身份未知' : '源码匹配未证明'
  const definition = data?.definitionComparison?.status === 'changed' ? '定义已变化，需复验' : data?.definitionComparison?.status !== 'unchanged' ? '定义待核对' : ''
  return (
    <div className="erp-dev-chain-audit" data-dev-chain-audit>
      <header className="erp-dev-chain-audit__header">
        <div className="erp-dev-chain-audit__heading">
          {showSteps ? <Button type="text" icon={<LeftOutlined aria-hidden="true" />} onClick={() => updateQuery({ chain: null, step: null, q: null, status: null, scope: null })}>收起步骤</Button> : null}
          <Title level={2}>{DEV_PAGE_TITLE_BY_ROUTE[DEV_BUSINESS_CHAIN_AUDIT_ROUTE]}</Title>
        </div>
        <Space wrap>
          {catalog.batches.length > 1 || (!batch && catalog.batches.length) || (batch && !catalog.batches.some((item) => item.id === batch)) ? (
            <Select
              label="批次"
              id="chain-audit-batch"
              aria-label="实跑批次"
              value={batch || undefined}
              loading={catalog.loading}
              placeholder="选择实跑批次"
              className="erp-dev-chain-audit__batch-select"
              options={catalog.batches.map((item) => ({ value: item.id, label: `${item.generatedAt ? formatTime(item.generatedAt) : item.id}${item.status === 'invalid' ? ' · 报告不完整' : ''}`, title: item.id }))}
              onChange={(value) => updateQuery({ batch: value ?? '', ...(stepKey ? {} : { chain: null }), q: null, status: null })}
            />
          ) : null}
          {report && !catalog.error ? <Button onClick={() => updateQuery({ details: 'report' })}>报告详情</Button> : null}
          <Button icon={<ReloadOutlined aria-hidden="true" />} onClick={() => setRevision((value) => value + 1)} loading={catalog.loading}>重新读取</Button>
        </Space>
      </header>
      {catalog.error ? <Alert type="error" showIcon message={catalog.error} description="目录读取失败，已停止展示上次报告。可点击重新读取。" /> : null}
      {!catalog.error && error ? <Alert type="error" showIcon message={error} description="未将缺失或损坏的报告判为通过。" /> : null}
      {!catalog.error && !batch && !catalog.loading ? (
        <Empty description={catalog.batches.length ? '请选择实跑批次' : '尚未采集链路实测报告。'} />
      ) : null}
      {!catalog.error && !error && ((catalog.loading && !batch) || (batch && !data)) ? <Spin aria-label="正在读取链路报告" /> : null}
      {!catalog.error && report ? (
        <>
          <p className="erp-dev-chain-audit__context" role="status">
            {catalog.batches.length <= 1 ? <span>{formatTime(report.generatedAt)}</span> : null}
            <span>{[freshness, definition].filter(Boolean).join(' · ')}</span>
            {report.findings.length ? <Button type="link" onClick={() => updateQuery({ view: 'findings', details: 'report' })}>{report.findings.length} 项问题</Button> : null}
          </p>
          <ChainResults data={data} chain={chain} status={status} keyword={keyword} stepKey={stepKey} updateQuery={updateQuery} />
          {showSteps && !selectedChain ? <ChainSteps data={data} chain={chain} status={status} keyword={keyword} stepKey={stepKey} updateQuery={updateQuery} /> : null}
        </>
      ) : null}
      <Drawer title="报告详情" width={960} open={detailsOpen && Boolean(report) && !catalog.error} onClose={() => updateQuery({ details: null, view: null })} rootClassName="erp-dev-chain-audit-drawer" destroyOnHidden>
        {report ? (
          <div className="erp-dev-chain-audit__stack">
            <DevTaskNav compact idPrefix="chain-audit" ariaLabel="链路实测报告视图" items={CHAIN_AUDIT_TABS} value={view} onChange={(value) => updateQuery({ view: value === 'chains' ? null : value, details: 'report' })} />
            <div role="tabpanel" id={`chain-audit-panel-${view}`} aria-labelledby={`chain-audit-tab-${view}`} className="erp-dev-chain-audit__content">
              {view === 'chains' ? <ChainReportContext data={data} chain={chain} /> : null}
              {view === 'findings' ? <><ChainAuditFindings data={data} /><AuditDisclosure title="查看阻断路径图"><ChainAuditDiagram diagram={report.diagrams?.failure} label="报告记录的异常阻断路径" /></AuditDisclosure></> : null}
              {view === 'evidence' ? <DevChainAuditEvidence data={data} /> : null}
            </div>
          </div>
        ) : null}
      </Drawer>
    </div>
  )
}
