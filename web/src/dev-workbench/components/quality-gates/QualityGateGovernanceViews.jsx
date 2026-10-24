import React from 'react'
import {
  Alert,
  Button,
  Descriptions,
  List,
  Spin,
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
  return <RouterLink to={SECURITY_GUIDE_HREF}>应用安全与验证边界</RouterLink>
}

export function GovernanceView({
  data,
  loading,
  error,
  values,
  onSearch,
  onFilter,
}) {
  const columns = [
    {
      align: 'left',
      title: '门禁',
      dataIndex: 'label',
      key: 'label',
      width: 144,
    },
    {
      align: 'left',
      title: '防什么问题',
      dataIndex: 'prevents',
      key: 'prevents',
      width: 220,
    },
    {
      align: 'left',
      title: '什么时候跑',
      dataIndex: 'trigger',
      key: 'trigger',
      width: 200,
    },
    {
      title: '耗时中位数',
      key: 'duration',
      width: 100,
      render: (_, row) =>
        formatQualityGateDuration(row.statistics?.medianDurationMs),
    },
    {
      title: '最近结果',
      key: 'result',
      width: 132,
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
      width: 180,
    },
  ]

  return (
    <div className="erp-dev-quality-governance-view">
      <div className="erp-dev-quality-view-tools">
        <div className="erp-dev-quality-view-search">
          <SearchInput
            allowClear
            value={values.q || ''}
            placeholder="搜索门禁或风险"
            searchHint="搜索门禁名称或风险"
            onSearch={onSearch}
          />
        </div>
        <Segmented
          aria-label="门禁范围"
          options={GOVERNANCE_FILTER_OPTIONS}
          value={values.filter}
          onChange={onFilter}
        />
      </div>
      {error ? (
        <Alert
          type="error"
          showIcon
          message="门禁目录读取失败"
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
        scroll={{ x: 1024 }}
        locale={{
          emptyText:
            loading || error ? (
              '尚未取得门禁目录'
            ) : (
              <div className="erp-dev-quality-empty">
                <Text>
                  {data?.changedCount === 0 &&
                  values.filter === 'relevant' &&
                  !values.q
                    ? '当前没有待核对的改动'
                    : '当前筛选下没有相关门禁'}
                </Text>
                {values.filter !== 'all' || values.q ? (
                  <Button
                    type="link"
                    onClick={() => (values.q ? onSearch('') : onFilter('all'))}
                  >
                    {values.q ? '清除搜索' : '查看全部门禁'}
                  </Button>
                ) : null}
              </div>
            ),
        }}
        expandable={{ expandedRowRender: renderGovernanceEvidence }}
      />

      {!loading && !error && data?.complexity?.length ? (
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
            dataSource={data.complexity}
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
      ) : null}
      <div className="erp-dev-quality-view-footnote">
        {!loading && !error && data && !data.complexity?.length ? (
          <Text type="secondary">当前没有客观复杂度候选</Text>
        ) : null}
        <SecurityGuideLink />
      </div>
    </div>
  )
}

export function GapsView({ data, loading, error, values, onRange, onRisk }) {
  const categories = data?.categories || []
  const noChanges = data?.changedCount === 0
  const emptyTitle = noChanges
    ? values.range === 'staged'
      ? '当前没有已暂存改动'
      : '当前没有待核对的改动'
    : values.risk === 'high'
      ? '当前筛选下没有高风险匹配项'
      : '当前改动没有匹配门禁'
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
      {error ? (
        <Alert
          type="error"
          showIcon
          message="改动缺口读取失败"
          description={error}
        />
      ) : null}
      {loading ? (
        <Spin tip="正在核对改动缺口">
          <div className="erp-dev-quality-loading" />
        </Spin>
      ) : null}
      {data && !loading && !error && !data.matched ? (
        <Alert
          className="erp-dev-quality-gap-empty"
          type={noChanges || values.risk === 'high' ? 'info' : 'warning'}
          showIcon
          message={emptyTitle}
          description={
            noChanges
              ? '此范围暂无需要比对的文件；服务器 CI 与当前执行端的诊断记录可分别查看。'
              : values.risk === 'high'
                ? '可切回全部风险查看其他匹配项；未匹配不代表已验证安全。'
                : '未知改动不能据此视为安全；请回到测试执行核对验证范围，必要时运行完整门禁。'
          }
          action={
            values.risk === 'high' ? (
              <Button onClick={() => onRisk('all')}>查看全部风险</Button>
            ) : !noChanges ? (
              <RouterLink to="/__dev/testing?view=tiers">
                核对验证范围
              </RouterLink>
            ) : null
          }
        />
      ) : null}
      {!loading && !error && categories.length ? (
        <>
          <QualityGateCoverageMatrix categories={categories} />
          <div className="erp-dev-quality-gap-categories">
            {categories.map((category) => (
              <section
                key={category.key}
                className="erp-dev-quality-gap-category"
              >
                <div>
                  <Space wrap>
                    <Title level={3}>{category.label}</Title>
                    <Tag color={category.highRisk ? 'error' : 'warning'}>
                      {category.highRisk ? '高风险' : '需核对'}
                    </Tag>
                    <Tag
                      color={
                        category.status === 'covered' ? 'success' : 'warning'
                      }
                    >
                      {category.status === 'covered'
                        ? '当前证据齐全'
                        : '仍缺必需门禁'}
                    </Tag>
                  </Space>
                  <Paragraph>{category.risk}</Paragraph>
                </div>
                <div className="erp-dev-quality-gap-category__missing">
                  <Text type="secondary">待补证据：</Text>
                  <Text>
                    {category.missing.length
                      ? category.gateResults
                          .filter((item) => item.status !== 'current')
                          .map((item) => item.label)
                          .join('、')
                      : '没有自动化缺口'}
                  </Text>
                </div>
                <details className="erp-dev-disclosure">
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
        </>
      ) : null}
      {data ? (
        <Text type="secondary" className="erp-dev-quality-boundary">
          证据边界：{data.boundaries.join('；')}
        </Text>
      ) : null}
      <div className="erp-dev-quality-view-footnote">
        <SecurityGuideLink />
      </div>
    </div>
  )
}
