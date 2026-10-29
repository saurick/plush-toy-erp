import React, { useEffect, useState } from 'react'
import { Alert, Button, Empty, Tag, Typography } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { useSearchParams } from 'react-router-dom'
import Table from '@/common/components/table/AppTable'
import SearchInput from '@/common/components/SearchInput'
import { MermaidDiagram } from '@/common/components/markdown'
import { readIntegrationEvidence } from '../config/devIntegration.mjs'
import {
  BUSINESS_RULE_CATEGORIES,
  BUSINESS_RULE_DIAGRAMS,
  BUSINESS_RULE_STATUS,
  buildBusinessRuleRows,
  filterBusinessRuleRows,
  parseBusinessRuleSearch,
  normalizeBusinessRuleEvidence,
  summarizeBusinessRuleStatus,
} from '../config/devBusinessRules.mjs'
import DevTimestamp from './DevTimestamp.jsx'
import '../styles/dev-business-rules.css'
import FilterSelect from '@/common/components/select/FilterSelect'

const gateLabel = (key) =>
  ({ server: '后端单元与合同', web: '前端数据与打印', postgres: '关键 PostgreSQL' })[key]

function RuleStatus({ status }) {
  const [label, color] =
    BUSINESS_RULE_STATUS[status] || BUSINESS_RULE_STATUS.missing
  return <Tag color={color}>{label}</Tag>
}

export default function DevBusinessRulesPanel({ report, reportCurrent, onRunConsistency, consistencyBusy }) {
  const [params, setParams] = useSearchParams()
  const [evidence, setEvidence] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)
  const [diagramRule, setDiagramRule] = useState('')
  const [page, setPage] = useState(1)
  const filters = parseBusinessRuleSearch(params)
  const rows = buildBusinessRuleRows({ report, reportCurrent, evidence })
  const filtered = filterBusinessRuleRows(rows, filters)
  const selected = filtered.find((entry) => entry.id === filters.rule)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError('')
    setEvidence(null)
    readIntegrationEvidence({ signal: controller.signal })
      .then((value) => {
        if (!controller.signal.aborted) {
          setEvidence(normalizeBusinessRuleEvidence(value))
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setError(
            '数据库场景证据读取失败，请重新读取；规则与测试关联仍可查看。'
          )
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [reload])

  const update = (key, value) => {
    const next = new URLSearchParams(params)
    if (value) next.set(key, value)
    else next.delete(key)
    if (key !== 'rule') { next.delete('rule'); setPage(1) }
    setParams(next, { replace: key === 'ruleQuery' })
  }
  const columns = [
    {
      title: '关键规则',
      key: 'rule',
      render: (_, entry) => <Button type="link" aria-expanded={selected?.id === entry.id} aria-label={`查看${entry.label}的测试与门禁`} onClick={() => { setPage(Math.floor(filtered.indexOf(entry) / 8) + 1); update('rule', selected?.id === entry.id ? '' : entry.id) }}>{entry.label}</Button>,
    },
    {
      title: '用例证据',
      key: 'evidence',
      width: 155,
      render: (_, entry) => (
        <RuleStatus status={entry.status} />
      ),
    },
  ]

  const renderDetails = (entry) => {
    const diagram = BUSINESS_RULE_DIAGRAMS[entry.category]
    return (
      <section
        className="erp-dev-business-rules__detail"
        aria-label={`${entry.label}详情`}
      >
        <Typography.Title level={4}>{entry.label}</Typography.Title>
        <p>{entry.standard}</p>
        <RuleStatus status={entry.status} />
        <div className="erp-dev-business-rules__tests">
          <table data-table-lines="appearance" aria-label={`${entry.label}验证范围`}>
            <thead><tr><th scope="col">验证范围</th><th scope="col">结果</th><th scope="col">检查项</th></tr></thead>
            <tbody>
              {[...new Set(entry.tests.map((item) => item.gate))].map((gate) => {
                  const tests = entry.tests.filter((item) => item.gate === gate)
                  return <tr key={gate}><td>{gateLabel(gate)}</td><td><RuleStatus status={summarizeBusinessRuleStatus(tests.map((item) => item.status))} /></td><td>{tests.length} 项</td></tr>
                })}
            </tbody>
          </table>
          {entry.tests.some((item) => item.status === 'failed') ? (
            <ul aria-label="失败检查">
              {entry.tests.filter((item) => item.status === 'failed').map((item) => <li key={item.id}><code>{item.name}</code></li>)}
            </ul>
            ) : null}
        </div>
        <details
          className="erp-dev-disclosure"
          key={entry.id}
          onToggle={(event) =>
              setDiagramRule(event.currentTarget.open ? entry.id : '')
            }
        >
          <summary>查看校验与恢复图</summary>
          {diagramRule === entry.id ? (
            <MermaidDiagram chart={diagram.chart} label={diagram.label} />
            ) : null}
          <p>
            这是校验边界示意；具体事务、锁顺序和权限以所列实现与测试为准，图中没有运行状态。
          </p>
        </details>
      </section>
    )
  }

  return (
    <section
      className="erp-dev-business-rules"
      aria-label="关键规则与发布门禁"
      aria-busy={loading}
    >
      <p className="erp-dev-business-rules__run">
        前端与后端证据：<Tag>{!report ? '未采集' : reportCurrent ? '当前工作区' : '历史报告'}</Tag>
        {report ? <DevTimestamp value={report.generatedAt} missing="采集时间未证明" /> : null}
      </p>
      <div className="erp-dev-business-rules__toolbar">
        <Button disabled={consistencyBusy || !onRunConsistency} onClick={onRunConsistency}>运行业务数据一致性专项</Button>
        <FilterSelect
          label="关键规则专项"
          placeholder="关键规则专项"
          aria-label="关键规则专项"
          value={filters.category}
          onChange={(value) => update('ruleCategory', value)}
          options={[
            { value: '', label: '全部专项' },
            ...BUSINESS_RULE_CATEGORIES.map(({ value, label }) => ({
              value,
              label,
            })),
          ]}
        />
        <SearchInput
          aria-label="搜索关键规则"
          placeholder="搜索规则、业务或测试名"
          value={filters.query}
          onSearch={(value) => update('ruleQuery', value)}
          allowClear
        />
        <Button
          icon={<ReloadOutlined aria-hidden="true" />}
          loading={loading}
          onClick={() => setReload((value) => value + 1)}
        >
          重新读取数据库证据
        </Button>
      </div>

      {error ? <Alert type="error" showIcon message={error} /> : null}
      {evidence?.run ? (
        <p className="erp-dev-business-rules__run">
          数据库运行：<Tag>{evidence.current ? '源码一致' : '历史源码'}</Tag>
          <DevTimestamp
            value={evidence.run.finishedAt}
            missing="完成时间未证明"
          />
          <span>
            {evidence.run.cleanupComplete ? '清理已读回' : '清理未证明'}
          </span>
        </p>
      ) : !loading && !error ? (
        <p>尚无可读取的隔离数据库运行证据。</p>
      ) : null}
      <Table
        rowKey="id"
        columns={columns}
        dataSource={filtered}
        expandable={{
            expandedRowKeys: selected ? [selected.id] : [],
            expandedRowRender: renderDetails,
            showExpandColumn: false,
          }}
        pagination={{
          current: selected ? Math.floor(filtered.indexOf(selected) / 8) + 1 : page,
          onChange: (value) => { setPage(value); update('rule', '') },
          pageSize: 8,
          showSizeChanger: false,
          hideOnSinglePage: true,
        }}
        locale={{
          emptyText: (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="没有匹配的关键规则"
            />
          ),
        }}
      />

    </section>
  )
}
