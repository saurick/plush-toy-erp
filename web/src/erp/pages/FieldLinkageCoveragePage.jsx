import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { CopyOutlined, ReloadOutlined } from '@ant-design/icons'
import {
  Alert,
  Button,
  Card,
  Empty,
  Space,
  Spin,
  Statistic,
  Table,
  Tag,
  Typography,
} from 'antd'
import HelpCenterBackToTopButton from '../components/HelpCenterBackToTopButton'
import HelpCenterSectionDirectory from '../components/HelpCenterSectionDirectory'
import {
  FIELD_LINKAGE_REPORT_PATH,
  FIELD_LINKAGE_RUN_COMMAND,
  buildFieldLinkageCoverageViewModel,
} from '../qa/fieldLinkageCatalog.mjs'
import { message } from '@/common/utils/antdApp'
import { useHashAnchorScroll } from '../utils/useHashAnchorScroll'

const { Paragraph, Text, Title } = Typography

const SECTION_HEADINGS = [
  { id: 'field-linkage-coverage-overview', title: '报告入口' },
  { id: 'field-linkage-coverage-status', title: '当前报告状态' },
  { id: 'field-linkage-coverage-summary', title: '覆盖摘要' },
  { id: 'field-linkage-coverage-table', title: '字段覆盖明细' },
]

const statusMetaMap = {
  covered: { color: 'green', label: '已覆盖' },
  partial: { color: 'gold', label: '部分覆盖' },
  missing: { color: 'default', label: '未覆盖' },
  fail: { color: 'red', label: '失败' },
}

const caseStatusMetaMap = {
  pass: { label: '已通过' },
  fail: { label: '失败' },
  skip: { label: '已跳过' },
  missing: { label: '未覆盖' },
}

const scenarioStatusMetaMap = {
  pass: { label: '已覆盖' },
  fail: { label: '失败' },
  skip: { label: '已跳过' },
  missing: { label: '未覆盖' },
}

const formatGeneratedAt = (value) => {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date
    .toLocaleString('zh-Hans-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
    .replace(/\//g, '-')
}

const formatRepoContext = (value) => {
  if (!value || typeof value !== 'object') return ''
  const branch = String(value.gitBranch || '').trim()
  const commit =
    String(value.gitCommitShort || value.gitCommit || '').trim() ||
    '未识别 commit'
  const dirty = value.gitDirty ? '（含未提交改动）' : ''
  return branch ? `${branch} @ ${commit}${dirty}` : `${commit}${dirty}`
}

const buildColumns = () => [
  {
    title: '字段',
    dataIndex: 'fieldLabel',
    width: 180,
    render: (_, record) => (
      <Space direction="vertical" size={2}>
        <Text strong>{record.fieldLabel}</Text>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {record.fieldKey}
        </Text>
      </Space>
    ),
  },
  { title: '类型', dataIndex: 'category', width: 160 },
  {
    title: '风险',
    dataIndex: 'risk',
    width: 80,
    render: (value) => (
      <Tag color={value === 'P0' ? 'red' : 'gold'}>{value}</Tag>
    ),
  },
  {
    title: '状态',
    dataIndex: 'status',
    width: 110,
    render: (value) => {
      const meta = statusMetaMap[value] || statusMetaMap.missing
      return <Tag color={meta.color}>{meta.label}</Tag>
    },
    filters: Object.entries(statusMetaMap).map(([value, meta]) => ({
      text: meta.label,
      value,
    })),
    onFilter: (value, record) => record.status === value,
  },
  {
    title: '场景覆盖',
    dataIndex: 'passedScenarios',
    width: 110,
    render: (_, record) => `${record.passedScenarios}/${record.totalScenarios}`,
  },
  {
    title: '层级',
    dataIndex: 'layers',
    width: 120,
    render: (values = []) => values.join(' / ') || '-',
  },
  {
    title: '对应用例',
    dataIndex: 'scenarios',
    render: (_, record) => {
      const scenarios = Array.isArray(record.scenarios) ? record.scenarios : []
      const cases = Array.isArray(record.cases) ? record.cases : []
      if (scenarios.length === 0) {
        return (
          <Paragraph style={{ marginBottom: 0, whiteSpace: 'pre-line' }}>
            -
          </Paragraph>
        )
      }
      return (
        <Paragraph style={{ marginBottom: 0, whiteSpace: 'pre-line' }}>
          {scenarios
            .map((scenario) => {
              const scenarioMeta =
                scenarioStatusMetaMap[scenario.status] ||
                scenarioStatusMetaMap.missing
              const scenarioCases = cases.filter(
                (item) => item.scenarioKey === scenario.scenarioKey
              )
              const caseLines = scenarioCases.length
                ? scenarioCases.map((item) => {
                    const caseMeta =
                      caseStatusMetaMap[item.status] ||
                      caseStatusMetaMap.missing
                    return `  ${caseMeta.label}用例 · ${item.title} (${item.caseId})`
                  })
                : ['  未登记用例']
              return [
                `${scenarioMeta.label}场景 · ${scenario.scenarioLabel}`,
                ...caseLines,
              ].join('\n')
            })
            .join('\n\n')}
        </Paragraph>
      )
    },
  },
]

export default function FieldLinkageCoveragePage() {
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const columns = useMemo(() => buildColumns(), [])

  const loadReport = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch(FIELD_LINKAGE_REPORT_PATH, {
        cache: 'no-store',
      })
      if (!response.ok) {
        throw new Error('字段联动覆盖报告暂未生成')
      }
      const payload = await response.json()
      setReport(buildFieldLinkageCoverageViewModel(payload))
    } catch (_fetchError) {
      setReport(null)
      setError(
        `未找到 ${FIELD_LINKAGE_REPORT_PATH}。请先在仓库根目录执行 ${FIELD_LINKAGE_RUN_COMMAND} 生成 latest 报告。`
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadReport()
  }, [loadReport])

  useHashAnchorScroll(`${report ? 'report' : 'empty'}-${loading}`)

  const handleCopyCommand = async () => {
    try {
      await navigator.clipboard.writeText(FIELD_LINKAGE_RUN_COMMAND)
      message.success('字段联动专项命令已复制')
    } catch (_error) {
      message.warning(`请手动执行：${FIELD_LINKAGE_RUN_COMMAND}`)
    }
  }

  const runContextText = formatRepoContext(report?.runContext)
  const generatedAtText = formatGeneratedAt(report?.generatedAt)

  return (
    <Space
      direction="vertical"
      size={16}
      style={{ width: '100%' }}
      className="erp-help-doc-single-column"
    >
      <Card className="erp-page-card" variant="borderless">
        <Title level={4} style={{ margin: 0 }}>
          ERP 字段联动覆盖状态
        </Title>
        <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
          这页按当前项目的覆盖看板思路收口：字段目录统一登记，报告来自最近一次本地
          QA 生成，页面只展示真实测试覆盖和当前未覆盖场景。字段正式口径仍以 ERP
          字段联动口径为准。
        </Paragraph>
        <Space size={[8, 8]} wrap style={{ marginTop: 12 }}>
          <Tag color="green">{'catalog -> latest JSON -> 页面汇总'}</Tag>
          <Text type="secondary">章节数：{SECTION_HEADINGS.length}</Text>
        </Space>
      </Card>

      <HelpCenterSectionDirectory headings={SECTION_HEADINGS} />

      <section id="field-linkage-coverage-overview">
        <Card className="erp-page-card" variant="borderless">
          <Title level={5} style={{ margin: 0 }}>
            报告入口
          </Title>
          <Paragraph type="secondary" style={{ marginTop: 8, marginBottom: 0 }}>
            当前先保留本地命令生成报告，不开放后端一键执行脚本入口。重跑后刷新本页即可看到最新覆盖矩阵。
          </Paragraph>
          <Space size={[8, 8]} wrap style={{ marginTop: 12 }}>
            <Button icon={<ReloadOutlined />} onClick={loadReport}>
              重新读取报告
            </Button>
            <Button icon={<CopyOutlined />} onClick={handleCopyCommand}>
              复制运行命令
            </Button>
            <Text code style={{ whiteSpace: 'normal', wordBreak: 'break-all' }}>
              {FIELD_LINKAGE_RUN_COMMAND}
            </Text>
          </Space>
          {generatedAtText ? (
            <Paragraph
              type="secondary"
              style={{ marginTop: 12, marginBottom: 0 }}
            >
              最近生成时间（本机时区）：{generatedAtText}
            </Paragraph>
          ) : null}
          {runContextText ? (
            <Paragraph
              type="secondary"
              style={{ marginTop: 8, marginBottom: 0 }}
            >
              报告版本：{runContextText}
            </Paragraph>
          ) : null}
          {report?.runContext?.gitDirty ? (
            <Alert
              style={{ marginTop: 12 }}
              type="info"
              showIcon
              message="这份覆盖报告生成于未提交工作区"
              description="未提交改动不会被排除在覆盖之外，但这份结果更适合当前调试，不应直接当作稳定基线。"
            />
          ) : null}
        </Card>
      </section>

      <section id="field-linkage-coverage-status">
        {loading ? (
          <Card className="erp-page-card" variant="borderless">
            <Space
              direction="vertical"
              align="center"
              style={{ width: '100%' }}
            >
              <Spin size="large" />
              <Text type="secondary">字段联动覆盖报告加载中...</Text>
            </Space>
          </Card>
        ) : null}

        {!loading && error ? (
          <Card className="erp-page-card" variant="borderless">
            <Alert
              type="warning"
              showIcon
              message="未找到字段联动覆盖报告"
              description={error}
            />
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="当前还没有可展示的字段联动覆盖结果"
              style={{ marginTop: 24 }}
            />
          </Card>
        ) : null}
      </section>

      <section id="field-linkage-coverage-summary">
        {!loading && report ? (
          <Card className="erp-page-card" variant="borderless">
            <Space size={24} wrap>
              <Statistic title="字段总数" value={report.summary.totalFields} />
              <Statistic title="已覆盖" value={report.summary.coveredFields} />
              <Statistic
                title="部分覆盖"
                value={report.summary.partialFields}
              />
              <Statistic title="未覆盖" value={report.summary.missingFields} />
              <Statistic title="失败" value={report.summary.failingFields} />
              <Statistic
                title="场景覆盖"
                value={`${report.summary.passedScenarios}/${report.summary.totalScenarios}`}
              />
              <Statistic
                title="用例覆盖"
                value={`${report.summary.passedCases}/${report.summary.totalCases}`}
              />
            </Space>
          </Card>
        ) : null}
      </section>

      <section id="field-linkage-coverage-table">
        {!loading && report ? (
          <Card className="erp-page-card" variant="borderless">
            <Table
              rowKey="fieldKey"
              columns={columns}
              dataSource={report.fields}
              pagination={false}
              scroll={{ x: 1100 }}
            />
          </Card>
        ) : null}
      </section>

      <HelpCenterBackToTopButton />
    </Space>
  )
}
