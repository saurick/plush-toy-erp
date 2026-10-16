import React, { useEffect, useState } from 'react'
import {
  Alert,
  Button,
  Descriptions,
  List,
  Progress,
  Space,
  Tag,
  Typography,
} from 'antd'
import { Link as RouterLink } from 'react-router-dom'
import Table from '@/common/components/table/AppTable'
import Segmented from '@/common/components/navigation/SlidingSegmented'
import SearchInput from '@/common/components/SearchInput'
import { formatQualityGateDuration } from '../../config/devQualityGates.mjs'
import {
  SECURITY_GUIDE_HREF,
  GOVERNANCE_FILTER_OPTIONS,
  GAP_RANGE_OPTIONS,
  GAP_RISK_OPTIONS,
} from '../../config/qualityGatePresentation.mjs'
import { QualityGateCoverageMatrix } from './QualityGateEvidenceCharts.jsx'

const { Paragraph, Text, Title } = Typography

function renderGovernanceEvidence(row) {
  return (
    <Descriptions
      size="small"
      column={1}
      bordered
      items={[
        {
          key: 'key',
          label: 'Stable key',
          children: <Text code>{row.key}</Text>,
        },
        { key: 'risk', label: '风险等级', children: row.riskLevel },
        {
          key: 'profiles',
          label: '适用 profile',
          children: row.profiles.join(' / '),
        },
        {
          key: 'sources',
          label: '正式执行入口引用',
          children: row.sources.join('；'),
        },
        { key: 'evidence', label: '唯一验证记录', children: row.evidence },
        { key: 'blocks', label: '失败阻断', children: row.blocks },
        {
          key: 'median',
          label: '中位数',
          children: formatQualityGateDuration(row.statistics?.medianDurationMs),
        },
        {
          key: 'slower',
          label: '较慢运行参考',
          children: row.statistics?.enoughSamples
            ? formatQualityGateDuration(row.statistics.slowerDurationMs)
            : '暂无足够样本',
        },
        {
          key: 'relationship',
          label: '与其他门禁关系',
          children: row.relationship,
        },
        {
          key: 'exit-condition',
          label: '替代或退出条件',
          children: row.exitCondition,
        },
      ]}
    />
  )
}

function SecurityGuideLink() {
  return (
    <Paragraph type="secondary">
      查看<RouterLink to={SECURITY_GUIDE_HREF}>应用安全与验证边界</RouterLink>：
      核对权限控制、扫描范围和带日期的审计摘要。
    </Paragraph>
  )
}

export function GovernanceView({
  data,
  loading,
  error,
  values,
  onSearch,
  onFilter,
}) {
  const [draft, setDraft] = useState(values.q || '')
  useEffect(() => setDraft(values.q || ''), [values.q])
  const columns = [
    {
      align: 'left',
      title: '门禁',
      dataIndex: 'label',
      key: 'label',
      width: 160,
    },
    {
      align: 'left',
      title: '防什么问题',
      dataIndex: 'prevents',
      key: 'prevents',
      width: 260,
    },
    {
      align: 'left',
      title: '什么时候跑',
      dataIndex: 'trigger',
      key: 'trigger',
      width: 260,
    },
    {
      title: '最近耗时',
      key: 'duration',
      width: 140,
      render: (_, row) =>
        formatQualityGateDuration(row.statistics?.medianDurationMs),
    },
    {
      title: '最近结果',
      key: 'result',
      width: 120,
      render: (_, row) => (
        <Tag color={row.current ? 'success' : 'warning'}>
          {row.current
            ? '属于当前改动'
            : row.recentResult === 'missing'
              ? '尚未运行'
              : '不可用于当前改动'}
        </Tag>
      ),
    },
    {
      align: 'left',
      title: '建议',
      dataIndex: 'advice',
      key: 'advice',
      width: 220,
    },
  ]

  return (
    <div className="erp-dev-quality-governance-view">
      <div className="erp-dev-quality-view-tools">
        <form
          className="erp-dev-quality-view-search"
          onSubmit={(event) => {
            event.preventDefault()
            onSearch(draft)
          }}
        >
          <SearchInput
            allowClear
            value={draft}
            placeholder="搜索门禁或风险"
            searchHint="输入门禁名称或风险后按回车搜索"
            onChange={(event) => {
              const nextDraft = event.target.value
              setDraft(nextDraft)
              if (!nextDraft && values.q) onSearch('')
            }}
          />
          <Button type="primary" htmlType="submit">
            搜索
          </Button>
        </form>
        <Segmented
          aria-label="门禁范围"
          options={GOVERNANCE_FILTER_OPTIONS}
          value={values.filter}
          onChange={onFilter}
        />
      </div>
      <SecurityGuideLink />
      {error ? (
        <Alert
          type="error"
          showIcon
          message="门禁治理读取失败"
          description={error}
        />
      ) : null}
      <Table
        rowKey="key"
        size="small"
        loading={loading}
        pagination={false}
        dataSource={data?.rows || []}
        columns={columns}
        scroll={{ x: 1160 }}
        locale={{ emptyText: '当前筛选下没有相关门禁' }}
        expandable={{ expandedRowRender: renderGovernanceEvidence }}
      />

      <section
        className="erp-dev-quality-complexity"
        aria-labelledby="quality-complexity-title"
      >
        <div className="erp-dev-quality-section-heading">
          <Title id="quality-complexity-title" level={2}>
            客观复杂度候选
          </Title>
          <Text type="secondary">
            只给出可解释信号，不计算健康总分，也不自动删除门禁。
          </Text>
        </div>
        <List
          dataSource={data?.complexity || []}
          locale={{ emptyText: '当前没有客观复杂度候选' }}
          renderItem={(item) => (
            <List.Item>
              <List.Item.Meta
                title={
                  <Space wrap>
                    <Text strong>{item.signal}</Text>
                    <Tag
                      color={
                        item.severity === 'success'
                          ? 'success'
                          : item.severity === 'warning'
                            ? 'warning'
                            : 'default'
                      }
                    >
                      {item.recommendation}
                    </Tag>
                  </Space>
                }
                description={item.detail}
              />
            </List.Item>
          )}
        />
      </section>
    </div>
  )
}

export function GapsView({ data, loading, error, values, onRange, onRisk }) {
  return (
    <div className="erp-dev-quality-gaps-view">
      <div className="erp-dev-quality-view-tools">
        <Segmented
          aria-label="改动范围"
          options={GAP_RANGE_OPTIONS}
          value={values.range}
          onChange={onRange}
        />
        <Segmented
          aria-label="风险范围"
          options={GAP_RISK_OPTIONS}
          value={values.risk}
          onChange={onRisk}
        />
      </div>
      <SecurityGuideLink />
      {error ? (
        <Alert
          type="error"
          showIcon
          message="覆盖缺口读取失败"
          description={error}
        />
      ) : null}
      {loading ? (
        <Progress percent={35} status="active" showInfo={false} />
      ) : null}
      {data && !data.matched ? (
        <Alert
          type="warning"
          showIcon
          message="当前改动没有匹配门禁"
          description="未知改动不能据此视为安全；请回到改动验证核对 affected 计划，必要时运行完整门禁。"
        />
      ) : null}
      <div className="erp-dev-quality-gap-flow" aria-label="覆盖缺口判断路径">
        <span>当前改动</span>
        <span aria-hidden="true">→</span>
        <span>涉及风险</span>
        <span aria-hidden="true">→</span>
        <span>应运行门禁</span>
        <span aria-hidden="true">→</span>
        <span>当前结果</span>
        <span aria-hidden="true">→</span>
        <span>仍缺证据</span>
      </div>
      <QualityGateCoverageMatrix categories={data?.categories || []} />
      <div className="erp-dev-quality-gap-categories">
        {(data?.categories || []).map((category) => (
          <section key={category.key} className="erp-dev-quality-gap-category">
            <div>
              <Space wrap>
                <Title level={3}>{category.label}</Title>
                <Tag color={category.highRisk ? 'error' : 'warning'}>
                  {category.highRisk ? '高风险' : '需核对'}
                </Tag>
                <Tag
                  color={category.status === 'covered' ? 'success' : 'warning'}
                >
                  {category.status === 'covered'
                    ? '当前证据齐全'
                    : '仍缺必需门禁'}
                </Tag>
              </Space>
              <Paragraph>{category.risk}</Paragraph>
            </div>
            <div className="erp-dev-quality-gap-category__grid">
              <div>
                <Text type="secondary">应运行门禁</Text>
                <Text>
                  {category.gateResults.map((item) => item.label).join('、')}
                </Text>
              </div>
              <div>
                <Text type="secondary">当前结果</Text>
                <Text>
                  {category.gateResults
                    .map(
                      (item) =>
                        `${item.label}：${item.status === 'current' ? '当前有效' : item.status === 'stale' ? '旧结果' : '未运行'}`
                    )
                    .join('；')}
                </Text>
              </div>
              <div>
                <Text type="secondary">还缺什么</Text>
                <Text>
                  {category.missing.length
                    ? category.gateResults
                        .filter((item) => item.status !== 'current')
                        .map((item) => item.label)
                        .join('、')
                    : '没有自动化缺口'}
                </Text>
              </div>
            </div>
            <details>
              <summary>查看该风险的证据清单</summary>
              <ul>
                {category.evidence.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </details>
          </section>
        ))}
      </div>
      {data ? (
        <Alert
          type="info"
          showIcon
          message="自动化证据边界"
          description={data.boundaries.join('；')}
        />
      ) : null}
    </div>
  )
}
