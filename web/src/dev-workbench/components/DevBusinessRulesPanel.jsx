import React, { useEffect, useState } from 'react'
import { Alert, Button, Empty, Space, Tag, Typography } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import { Link, useSearchParams } from 'react-router-dom'
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
} from '../config/devBusinessRules.mjs'
import {
  DEV_DOCS_ROUTE,
  DEV_QUALITY_GATES_ROUTE,
  DEV_VERSION_CENTER_ROUTE,
} from '../config/devRoutes.mjs'
import DevTimestamp from './DevTimestamp.jsx'
import '../styles/dev-business-rules.css'
import FilterSelect from '@/common/components/select/FilterSelect'

const categoryLabel = (key) =>
  BUSINESS_RULE_CATEGORIES.find((entry) => entry.value === key)?.label
const gateLabel = (key) =>
  ({ server: '后端单元与合同', web: '前端数据与打印', postgres: '关键 PostgreSQL' })[key]
const docsLink = (path) => `${DEV_DOCS_ROUTE}?path=${encodeURIComponent(path)}`

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
  const filters = parseBusinessRuleSearch(params)
  const rows = buildBusinessRuleRows({ report, reportCurrent, evidence })
  const filtered = filterBusinessRuleRows(rows, filters)
  const selected = filtered.find((entry) => entry.id === filters.rule)
  const diagram = selected ? BUSINESS_RULE_DIAGRAMS[selected.category] : null

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
    if (key !== 'rule') next.delete('rule')
    setParams(next, { replace: key === 'ruleQuery' })
  }
  const columns = [
    {
      title: '关键规则',
      key: 'rule',
      render: (_, entry) => (
        <>
          <strong>{entry.label}</strong>
          <p className="erp-dev-business-rules__standard">{entry.standard}</p>
        </>
      ),
    },
    { title: '专项', dataIndex: 'category', width: 130, render: categoryLabel },
    {
      title: '用例证据',
      key: 'evidence',
      width: 155,
      render: (_, entry) => (
        <>
          <RuleStatus status={entry.status} />
          <small className="erp-dev-business-rules__count">
            {entry.tests.filter((test) => test.status === 'passed').length} /{' '}
            {entry.tests.length} 个用例当前通过
          </small>
        </>
      ),
    },
    {
      title: '门禁与详情',
      key: 'detail',
      width: 160,
      render: (_, entry) => (
        <Button
          size="small"
          aria-label={`查看${entry.label}的测试与门禁`}
          onClick={() => update('rule', entry.id)}
        >
          查看测试与门禁
        </Button>
      ),
    },
  ]

  return (
    <section
      className="erp-dev-business-rules"
      aria-label="关键规则与发布门禁"
      aria-busy={loading}
    >
      <Typography.Title level={3}>关键规则与发布门禁</Typography.Title>
      <Typography.Paragraph type="secondary">
        {rows.length} 条规则关联{' '}
        {
          new Set(rows.flatMap((entry) => entry.tests.map((test) => test.id)))
            .size
        }{' '}
        个关键用例。普通测试读取所选覆盖报告，数据库测试复用隔离运行回执；静态关联和历史结果均不代表当前版本通过。
      </Typography.Paragraph>
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
          icon={<ReloadOutlined />}
          loading={loading}
          onClick={() => setReload((value) => value + 1)}
        >
          重新读取数据库证据
        </Button>
      </div>
      {filters.category === 'consistency' ? <Typography.Paragraph type="secondary">专项运行前端与后端用例；PostgreSQL 复用隔离数据库门禁。命令：<code>node scripts/qa/business-data-consistency.mjs --write</code>。缺失、跳过及历史证据不能计为当前通过。</Typography.Paragraph> : null}
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
        pagination={{
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
      {selected ? (
        <section
          className="erp-dev-business-rules__detail"
          aria-label={`${selected.label}详情`}
        >
          <Typography.Title level={4}>{selected.label}</Typography.Title>
          <p>{selected.standard}</p>
          <Space wrap>
            <RuleStatus status={selected.status} />
            <Link to={`${DEV_QUALITY_GATES_ROUTE}?view=server`}>
              核对当前提交的 CI 结果
            </Link>
            <Link to={DEV_VERSION_CENTER_ROUTE}>查看版本发布</Link>
          </Space>
          <div className="erp-dev-business-rules__tests">
            <table data-table-lines="appearance" aria-label={`${selected.label}测试对应关系`}>
              <thead>
                <tr>
                  <th scope="col">测试与来源</th>
                  <th scope="col">执行门禁</th>
                  <th scope="col">证据</th>
                </tr>
              </thead>
              <tbody>
                {selected.tests.map((test) => (
                  <tr key={test.id}>
                    <td>
                      <code>{test.name}</code>
                      <small>{test.file}</small>
                    </td>
                    <td>{gateLabel(test.gate)}</td>
                    <td>
                      <RuleStatus status={test.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details
            className="erp-dev-disclosure"
            key={selected.id}
            onToggle={(event) =>
              setDiagramRule(event.currentTarget.open ? selected.id : '')
            }
          >
            <summary>查看校验与恢复图</summary>
            {diagramRule === selected.id ? (
              <MermaidDiagram chart={diagram.chart} label={diagram.label} />
            ) : null}
            <p>
              这是校验边界示意；具体事务、锁顺序和权限以所列实现与测试为准，图中没有运行状态。
            </p>
          </details>
        </section>
      ) : null}
      <details className="erp-dev-disclosure erp-dev-business-rules__policy">
        <summary>部署前执行范围与维护入口</summary>
        <p>
          每个候选提交的后端单元与合同、关键 PostgreSQL
          必须执行登记用例；缺失、失败、跳过或零执行会阻断正式门禁。发布复用同一提交的合格
          CI 证据，目标部署另做预检、迁移、配置、健康与业务冒烟。
        </p>
        <p>
          持续
          fuzz、内存竞争检测、长时间压测与恢复演练按相关变化和风险执行。固定
          fuzz 种子随普通测试执行；这些结果各自绑定实际范围，不外推生产容量。
        </p>
        <Space wrap>
          <Link to={`${DEV_QUALITY_GATES_ROUTE}?view=run`}>
            {import.meta.env.PLUSH_STANDALONE_WORKBENCH ? '查看服务端诊断历史' : '运行本机正式门禁'}
          </Link>
          <Link to={docsLink('docs/product/自动化测试策略.md')}>
            测试策略与规则维护
          </Link>
          <Link to={docsLink('docs/product/业务公式与计算口径.md')}>
            正式业务公式
          </Link>
          <Link to={docsLink('docs/product/发布门禁.md')}>发布证据要求</Link>
        </Space>
      </details>
    </section>
  )
}
