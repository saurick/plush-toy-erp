import React, { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Empty,
  Select,
  Space,
  Spin,
  Tag,
  Typography,
} from 'antd'
import { Link, useSearchParams } from 'react-router-dom'
import Table from '@/common/components/table/AppTable'
import SearchInput from '@/common/components/SearchInput'
import { MermaidDiagram } from '@/common/components/markdown'
import DevPageNav from '../components/DevPageNav.jsx'
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
  chainDefinitionURL,
  filterChainAuditSteps,
} from '../config/devBusinessChainAudit.mjs'
import '../styles/dev-business-chain-audit.css'

const { Title, Text } = Typography
const SOURCE_PATH = 'docs/engineering/研发效能工作台与CI-CD设计.md'
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

function ChainResults({ data, chain, status, keyword, updateQuery }) {
  const { report } = data
  const comparison = data.definitionComparison
  const rows = useMemo(
    () => filterChainAuditSteps(report, { chain, status, keyword }),
    [report, chain, status, keyword]
  )
  const selectedChain = report.chains.find((item) => item.key === chain)
  const selectedChains =
    chain === 'all' ? report.chains : selectedChain ? [selectedChain] : []
  const scenarioKinds = [
    ...new Map(
      report.chains
        .flatMap((item) => item.scenarios)
        .map((row) => [row.key, row.label])
    ).entries(),
  ]
  return (
    <div className="erp-dev-chain-audit__stack">
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
          <p>
            按执行时定义展示链间关系；颜色表示本批次步骤结果，连线不代表逐单已发生流转。
          </p>
        ) : null}
        <p>
          <strong>终点：</strong>
          {report.scope.terminal}
        </p>
        <details>
          <summary>同一来源到财务结清的读回样本</summary>
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
        </details>
      </section>
      <section
        className="erp-dev-chain-audit__section"
        aria-label="业务链定义核对"
      >
        <h2>与当前业务链定义核对</h2>
        <p>
          <Tag color={comparison?.status === 'unchanged' ? 'blue' : 'gold'}>
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
        <details>
          <summary>查看逐链变化与本批次未记录步骤</summary>
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
        </details>
      </section>
      <Table
        size="small"
        pagination={false}
        rowKey="key"
        dataSource={report.chains}
        scroll={{ x: 880 }}
        columns={[
          {
            title: '业务链',
            dataIndex: 'label',
            width: 230,
            render: (label, row) => (
              <Button
                type="link"
                className="erp-dev-chain-audit__chain-link"
                onClick={() =>
                  updateQuery({ chain: row.key, status: null, q: null })
                }
              >
                {label}
              </Button>
            ),
          },
          {
            title: '本批次结果',
            dataIndex: 'status',
            width: 125,
            render: (value) => <ChainAuditState status={value} />,
          },
          { title: '步骤', dataIndex: 'stepCount', width: 70 },
          {
            title: '首个未通过环节',
            key: 'first',
            render: (_, row) =>
              row.steps.find((step) => step.status !== 'passed')?.label ||
              '本批次步骤均通过',
          },
          {
            title: '当前定义',
            key: 'definition',
            width: 120,
            render: (_, row) =>
              comparison?.chains.find((item) => item.key === row.key)
                ?.currentExists === false ? (
                  <Text type="secondary">当前定义已移除</Text>
              ) : (
                <Link to={chainDefinitionURL(row.key)}>业务链观察</Link>
              ),
          },
        ]}
      />
      <section className="erp-dev-chain-audit__section">
        <div className="erp-dev-chain-audit__toolbar">
          <Select
            aria-label="筛选链路"
            value={chain}
            className="erp-dev-chain-audit__chain-select"
            options={[
              { value: 'all', label: '全部链路' },
              ...report.chains.map((item) => ({
                value: item.key,
                label: item.label,
              })),
            ]}
            onChange={(value) =>
              updateQuery({ chain: value === 'all' ? null : value })
            }
          />
          <Select
            aria-label="筛选步骤结果"
            value={status}
            className="erp-dev-chain-audit__status-select"
            options={[
              { value: 'all', label: '全部结果' },
              ...Object.entries(CHAIN_AUDIT_STATES).map(([value, item]) => ({
                value,
                label: item.label,
              })),
            ]}
            onChange={(value) =>
              updateQuery({ status: value === 'all' ? null : value })
            }
          />
          <SearchInput
            allowClear
            placeholder="搜索环节、岗位或实际读回"
            value={keyword}
            onChange={(event) => updateQuery({ q: event.target.value || null })}
          />
          <Text type="secondary">{rows.length} 个步骤</Text>
        </div>
        {chain !== 'all' && !selectedChain ? (
          <Alert
            type="warning"
            showIcon
            message="所选批次没有这条链路"
            action={
              <Button onClick={() => updateQuery({ chain: null })}>
                查看全部链路
              </Button>
            }
          />
        ) : null}
        {selectedChain ? (
          <p>
            {selectedChain.summary}{' '}
            <Link to={chainDefinitionURL(chain)}>查看当前定义</Link>
          </p>
        ) : null}
        <Table
          size="small"
          rowKey="rowKey"
          dataSource={rows}
          pagination={{
            pageSize: 10,
            showSizeChanger: false,
            hideOnSinglePage: true,
          }}
          scroll={{ x: 1050 }}
          columns={[
            {
              title: '链路 / 环节',
              key: 'step',
              width: 260,
              render: (_, row) => (
                <>
                  <Text type="secondary">{row.chainLabel}</Text>
                  <div>
                    {row.number}. {row.label}
                  </div>
                </>
              ),
            },
            { title: '岗位', dataIndex: 'responsibleRole', width: 145 },
            {
              title: '结果',
              dataIndex: 'status',
              width: 105,
              render: (value) => <ChainAuditState status={value} />,
            },
            { title: '执行证据层级', dataIndex: 'level', width: 165 },
            { title: '实际操作与读回', dataIndex: 'observed' },
          ]}
          expandable={{
            expandedRowRender: renderStepDetails,
          }}
        />
        {selectedChain ? (
          <ChainAuditEvidenceLinks data={data} items={selectedChain.evidence} />
        ) : null}
      </section>
      <details>
        <summary>登记场景与实际覆盖 · 保留部分覆盖和未证明项</summary>
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
      </details>
    </div>
  )
}

export default function DevBusinessChainAuditPage() {
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
  const batch =
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
  const updateQuery = (patch) => {
    const next = new URLSearchParams(searchParams)
    if (batch) next.set('batch', batch)
    Object.entries(patch).forEach(([key, value]) =>
      value == null ? next.delete(key) : next.set(key, value)
    )
    if (next.toString() !== searchParams.toString()) {
      setSearchParams(next, { replace: true })
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
  return (
    <div
      className="erp-dev-chain-audit erp-dev-workspace-page"
      data-dev-chain-audit
    >
      <DevPageNav sourcePath={SOURCE_PATH} />
      <header className="erp-dev-chain-audit__header">
        <Title level={1}>链路实测</Title>
        <Space wrap>
          <Link to={chainDefinitionURL(chain)}>业务链观察</Link>
          <Button
            onClick={() => setRevision((value) => value + 1)}
            loading={catalog.loading}
          >
            重新读取
          </Button>
        </Space>
      </header>
      <div className="erp-dev-chain-audit__toolbar">
        <label htmlFor="chain-audit-batch">实跑批次</label>
        <Select
          id="chain-audit-batch"
          aria-label="实跑批次"
          value={batch || undefined}
          loading={catalog.loading}
          placeholder="暂无报告"
          className="erp-dev-chain-audit__batch-select"
          options={catalog.batches.map((item) => ({
            value: item.id,
            label: `${item.id}${item.status === 'invalid' ? ' · 报告不完整' : ''}`,
          }))}
          onChange={(value) =>
            updateQuery({ batch: value, q: null, status: null })
          }
        />
        {report ? (
          <>
            <Text type="secondary">生成于 {formatTime(report.generatedAt)}</Text>
            <Tag>{report.scope.customer}</Tag>
            <Text>{report.scope.data}</Text>
          </>
        ) : null}
      </div>
      <DevTaskNav
        level="primary"
        compact
        idPrefix="chain-audit"
        ariaLabel="链路实测视图"
        items={CHAIN_AUDIT_TABS}
        value={view}
        onChange={(value) =>
          updateQuery({ view: value === 'chains' ? null : value })
        }
      />
      {catalog.error ? (
        <Alert
          type="error"
          showIcon
          message={catalog.error}
          description="目录读取失败，已停止展示上次报告。可点击重新读取。"
        />
      ) : null}
      {!catalog.error && error ? (
        <Alert
          type="error"
          showIcon
          message={error}
          description="未将缺失或损坏的报告判为通过。"
        />
      ) : null}
      {!catalog.error && !batch && !catalog.loading ? (
        <Empty description="尚无链路实跑报告。将完整批次及证据清单放入本地报告目录后重新读取。" />
      ) : null}
      {!catalog.error &&
      !error &&
      ((catalog.loading && !batch) || (batch && !data && !error)) ? (
        <Spin aria-label="正在读取链路报告" />
      ) : null}
      {!catalog.error && report ? (
        <>
          <Alert
            type={data.freshness === 'historical' ? 'warning' : 'info'}
            showIcon
            message={
              data.freshness === 'historical'
                ? '历史证据：报告源码与当前工作区不同'
                : data.freshness === 'unknown'
                  ? '当前源码身份读取失败，匹配状态未证明'
                  : '提交相同，完整工作区匹配仍未证明'
            }
            description={
              <>
                报告 <code>{report.scope.sourceCommit.slice(0, 12)}</code> ·
                当前{' '}
                <code>
                  {data.currentRepository?.commit?.slice(0, 12) || '未知'}
                </code>
                {data.currentRepository?.dirty ? '（有未提交改动）' : ''}
                。结果只描述所选批次，不作为当前版本或客户验收结论。
              </>
            }
          />
          <div className="erp-dev-chain-audit__summary" aria-label="批次计数">
            {[
              [report.scope.chainCount, '登记链路'],
              [report.scope.stepCount, '步骤'],
              [report.metrics.stepStates.passed || 0, '通过'],
              [report.metrics.stepStates.failed || 0, '阻断'],
              [report.metrics.stepStates.drift || 0, '口径失配'],
            ].map(([value, label]) => (
              <div key={label}>
                <strong>{value}</strong>
                <span>{label}</span>
              </div>
            ))}
          </div>
          <p className="erp-dev-chain-audit__verdict">
            <strong>本批次结论：</strong>
            {report.verdict}
          </p>
          <main
            role="tabpanel"
            id={`chain-audit-panel-${view}`}
            aria-labelledby={`chain-audit-tab-${view}`}
            className="erp-dev-chain-audit__content"
          >
            {view === 'chains' ? (
              <ChainResults
                data={data}
                chain={chain}
                status={status}
                keyword={keyword}
                updateQuery={updateQuery}
              />
            ) : null}
            {view === 'findings' ? (
              <>
                <ChainAuditDiagram
                  diagram={report.diagrams?.failure}
                  label="报告记录的异常阻断路径"
                />
                <ChainAuditFindings data={data} />
              </>
            ) : null}
            {view === 'evidence' ? <DevChainAuditEvidence data={data} /> : null}
          </main>
          <details className="erp-dev-chain-audit__limits">
            <summary>
              覆盖范围与未证明项 · {report.scope.registeredScenarioCount}{' '}
              个登记场景不等于全部端到端通过
            </summary>
            <ul>
              {report.coverageLimits.map((limit) => (
                <li key={limit}>{limit}</li>
              ))}
            </ul>
            <p>
              <strong>范围外：</strong>
              {report.scope.notIncluded.join('；')}
            </p>
            <Text type="secondary">执行方式：{report.scope.mode}</Text>
          </details>
        </>
      ) : null}
    </div>
  )
}
