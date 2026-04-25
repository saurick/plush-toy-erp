import React, { useEffect, useMemo, useState } from 'react'
import {
  Alert,
  Button,
  Card,
  Space,
  Spin,
  Statistic,
  Tag,
  Table,
  Typography,
} from 'antd'
import { useNavigate } from 'react-router-dom'
import HelpCenterBackToTopButton from '../components/HelpCenterBackToTopButton'
import HelpCenterSectionDirectory from '../components/HelpCenterSectionDirectory'
import { FIELD_LINKAGE_COVERAGE_PATH } from '../qa/fieldLinkageCatalog.mjs'
import { BUSINESS_CHAIN_DEBUG_PATH } from '../utils/businessChainDebug.mjs'
import {
  BUSINESS_LOOP_COVERAGE_ROWS,
  KNOWN_QA_BLIND_SPOTS,
  QA_REPORT_OUTPUT_HINTS,
  QA_RUNNER_COMMANDS,
  QA_QUALITY_COMMAND_ROWS,
  QA_WORKBENCH_PATHS,
  getFieldLinkageStatusMeta,
  getQaReportStatusMeta,
  getQaWorkbenchArtifactSnapshot,
  loadQaWorkbenchReports,
} from '../utils/qaWorkbenchReports.mjs'
import { useHashAnchorScroll } from '../utils/useHashAnchorScroll'

const { Paragraph, Text, Title } = Typography

const SECTION_HEADINGS = [
  { id: 'acceptance-overview-summary', title: '总览与当前工具页' },
  { id: 'acceptance-overview-business-loops', title: '当前闭环覆盖' },
  { id: 'acceptance-overview-quality-commands', title: '当前质量命令' },
  { id: 'acceptance-overview-entry-points', title: '当前入口与建议动作' },
  { id: 'acceptance-overview-blind-spots', title: '已知盲区与使用顺序' },
  { id: 'acceptance-overview-planning', title: '规划表速查' },
]

const BUSINESS_CHAIN_HIGHLIGHTS = [
  '业务链路调试当前覆盖 6 条 ERP v1 主干闭环，不代表所有扩展业务链路都已完成。',
  '填入并查询只做只读排查：按业务记录、workflow 状态和协同任务聚合，不伪造一键造数能力。',
  '协同任务调试聚焦角色任务池、移动端可见性和 workflow_task_events 留痕，不改任务和业务数据。',
  '字段快照、残值、缺值和打印取值优先进入“字段联动覆盖”，不要只看当前单个页面现象。',
  '页面结论只代表最近一次可读取的结构化产物；没有 latest 的专项仍以命令、脚本和正式文档为准。',
]

const WORKBENCH_STEPS = [
  '先看这页，确认本轮已有哪几个验收入口和最近覆盖摘要。',
  '若问题落在字段快照、残值、缺值、打印取值，进入“字段联动覆盖”。',
  '若问题落在业务记录状态、上下游链路或金额 / 数量关系，进入“业务链路调试”。',
  '若问题落在角色任务池、移动端为什么看不到任务或任务事件留痕，进入“协同任务调试”。',
  '若要直接找最近一次命令、产物和环境，进入“运行记录”。',
  '若问题已经收口成字段、打印、workflow、权限或错误码专项，进入“专项报告”。',
]

const MENU_RECOMMENDATIONS = [
  {
    key: 'acceptance-overview',
    menuItem: '验收结果总览',
    decision: '要，优先级最高',
    purpose: '一眼看当前有没有明显红灯，下一步该点哪里',
    note: '作为开发与验收分组总入口',
  },
  {
    key: 'business-chain-debug',
    menuItem: '业务链路调试',
    decision: '保留',
    purpose: '查某条业务链或业务状态流转卡在哪',
    note: '当前只读排查，不做一键造数',
  },
  {
    key: 'workflow-task-debug',
    menuItem: '协同任务调试',
    decision: '新增',
    purpose: '查任务是否进角色池、移动端是否可见、事件是否留痕',
    note: '当前只读诊断，不提供修复按钮',
  },
  {
    key: 'field-linkage-coverage',
    menuItem: '字段联动覆盖',
    decision: '保留',
    purpose: '看字段快照、残值、缺值、打印取值、派生重算有没有被兜住',
    note: '当前已有 latest JSON 和覆盖看板',
  },
  {
    key: 'qa-run-records',
    menuItem: '运行记录',
    decision: '保留',
    purpose: '看最近一次结构化产物、运行环境和命令',
    note: '现阶段仍以命令和 latest 摘要为主',
  },
  {
    key: 'qa-reports',
    menuItem: '专项报告',
    decision: '保留',
    purpose: '统一承接字段、打印、workflow、权限、错误码等专项维度',
    note: '避免继续把每个专项都拆成左侧菜单',
  },
  {
    key: 'quantity',
    menuItem: '数量一致性',
    decision: '不单独上菜单',
    purpose: '查数量、金额、库存、回补是否一致',
    note: '统一收口到“专项报告”',
  },
  {
    key: 'print',
    menuItem: '打印口径覆盖',
    decision: '不单独上菜单',
    purpose: '查页面、合同工作台、PDF 和打印是否同口径',
    note: '统一收口到“专项报告”和合同 smoke',
  },
  {
    key: 'concurrency',
    menuItem: '并发一致性',
    decision: '继续留脚本 / CI',
    purpose: '低频但重要的工程回归',
    note: '不适合作为日常主导航',
  },
]

const OVERVIEW_BLUEPRINT_ROWS = [
  {
    key: 'summary',
    section: '顶部摘要',
    question: '今天整体稳不稳',
    display: '工具页、6 条闭环覆盖、字段联动覆盖、打印模板范围、最近更新时间',
    source: '字段联动 latest、打印模板目录和专项报告',
  },
  {
    key: 'business-loops',
    section: '当前闭环覆盖',
    question: '主业务链路已经接到哪一步',
    display: '6 条已接入 v1 的业务闭环、承载方式、验收方式和当前盲区',
    source: '工作流主任务树、移动端任务测试和验收记录',
  },
  {
    key: 'quality-commands',
    section: '当前质量命令',
    question: '这轮必须跑哪些命令',
    display: '前端 5 条主命令、Go 变更命令、diff 检查和跳过规则',
    source: 'package scripts、server Makefile 和当前验收口径',
  },
  {
    key: 'field-linkage',
    section: '字段联动卡片',
    question: '字段快照 / 残值 / 缺值问题有没有兜住',
    display: '覆盖字段数、场景覆盖率、失败状态、按钮“进入字段联动覆盖”',
    source: QA_REPORT_OUTPUT_HINTS.fieldLinkage,
  },
  {
    key: 'business-chain',
    section: '业务链路调试卡片',
    question: '我要排某张单据或任务，从哪里进',
    display: '固定排查说明 + 按钮“进入业务链路调试”',
    source: '业务记录、workflow 状态、协同任务查询页',
  },
  {
    key: 'workflow-task-debug',
    section: '协同任务调试卡片',
    question: '某个角色为什么看不到任务',
    display: '角色任务池、移动端可见性、事件轨迹和绑定关系说明',
    source:
      'workflow_tasks、mobileTaskQueries、mobileTaskView、workflow_task_events',
  },
  {
    key: 'print',
    section: '打印模板卡片',
    question: '当前打印专项能否直接读状态',
    display: '模板范围、latest 是否存在、合同 smoke 命令',
    source: '打印模板目录、合同工作台 smoke',
  },
  {
    key: 'blind-spots',
    section: '已知盲区',
    question: '这轮还有什么没验证',
    display: '未结构化产物、未做真实链路、仍 deferred 的能力',
    source: '正式文档和脚本边界',
  },
  {
    key: 'actions',
    section: '快捷动作',
    question: '我下一步该点哪',
    display: '进入字段联动覆盖、业务链路调试、协同任务调试、运行记录、专项报告',
    source: '页面动作区',
  },
]

const FIRST_CUT_FOCUS_ROWS = [
  {
    key: 'summary',
    keep: '顶部摘要',
    reason: '没有摘要就无法作为验收总入口',
  },
  {
    key: 'field-linkage',
    keep: '字段联动卡片',
    reason: '当前最成熟，也最容易防残值和缺值回归',
  },
  {
    key: 'business-chain',
    keep: '业务链路调试卡片',
    reason: '能直接承接当前业务记录和 workflow 排查',
  },
  {
    key: 'workflow-task-debug',
    keep: '协同任务调试卡片',
    reason: '能把角色池和移动端可见性从业务主线排查里拆出来',
  },
  {
    key: 'blind-spots',
    keep: '已知盲区',
    reason: '避免页面一片绿，误以为所有专项都已经验完',
  },
]

const MENU_RECOMMENDATION_COLUMNS = [
  {
    title: '菜单项',
    dataIndex: 'menuItem',
    key: 'menuItem',
    width: 180,
  },
  {
    title: '现在要不要做',
    dataIndex: 'decision',
    key: 'decision',
    width: 180,
  },
  {
    title: '作用',
    dataIndex: 'purpose',
    key: 'purpose',
  },
  {
    title: '备注',
    dataIndex: 'note',
    key: 'note',
  },
]

const OVERVIEW_BLUEPRINT_COLUMNS = [
  {
    title: '区块',
    dataIndex: 'section',
    key: 'section',
    width: 180,
  },
  {
    title: '用户最关心的问题',
    dataIndex: 'question',
    key: 'question',
    width: 260,
  },
  {
    title: '页面上显示什么',
    dataIndex: 'display',
    key: 'display',
  },
  {
    title: '数据来源',
    dataIndex: 'source',
    key: 'source',
    width: 240,
  },
]

const FIRST_CUT_FOCUS_COLUMNS = [
  {
    title: '首版保留',
    dataIndex: 'keep',
    key: 'keep',
    width: 220,
  },
  {
    title: '为什么',
    dataIndex: 'reason',
    key: 'reason',
  },
]

const BUSINESS_LOOP_COLUMNS = [
  {
    title: '业务闭环',
    dataIndex: 'chain',
    key: 'chain',
    width: 300,
  },
  {
    title: '状态',
    dataIndex: 'status',
    key: 'status',
    width: 120,
    render: (value) => <Tag color="green">{value}</Tag>,
  },
  {
    title: '承载方式',
    dataIndex: 'carrier',
    key: 'carrier',
    width: 240,
  },
  {
    title: '验收方式',
    dataIndex: 'validation',
    key: 'validation',
    width: 260,
  },
  {
    title: '当前盲区',
    dataIndex: 'blindSpot',
    key: 'blindSpot',
  },
]

const QUALITY_COMMAND_COLUMNS = [
  {
    title: '命令',
    dataIndex: 'command',
    key: 'command',
    width: 280,
    render: (value) => <Text code>{value}</Text>,
  },
  {
    title: '覆盖范围',
    dataIndex: 'scope',
    key: 'scope',
    width: 260,
  },
  {
    title: '执行规则',
    dataIndex: 'rule',
    key: 'rule',
  },
]

const formatGeneratedAt = (value) => {
  if (!value) return '未生成'
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

const formatCoverage = (passed, total) => {
  if (!Number.isFinite(total) || total <= 0) {
    return '--'
  }
  return `${passed}/${total}`
}

export default function AcceptanceOverviewPage() {
  const navigate = useNavigate()
  const [reports, setReports] = useState({
    fieldLinkage: null,
    print: null,
  })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false

    const loadReports = async () => {
      setLoading(true)
      setError('')
      try {
        const payload = await loadQaWorkbenchReports(fetch)
        if (cancelled) return
        setReports(payload)
        if (!payload.fieldLinkage) {
          setError(
            '字段联动覆盖报告暂未生成；当前仍可继续通过业务链路调试、专项脚本和最近回归记录验收改动。'
          )
        }
      } catch (_error) {
        if (cancelled) return
        setReports({
          fieldLinkage: null,
          print: null,
        })
        setError(
          '字段联动覆盖报告暂未生成；当前仍可继续通过业务链路调试、专项脚本和最近回归记录验收改动。'
        )
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    loadReports()
    return () => {
      cancelled = true
    }
  }, [])

  const artifactSnapshot = useMemo(
    () => getQaWorkbenchArtifactSnapshot(reports),
    [reports]
  )
  const fieldLinkageReport = reports.fieldLinkage
  const fieldLinkageSummary = fieldLinkageReport?.summary || null
  const fieldLinkageStatus = getFieldLinkageStatusMeta(fieldLinkageSummary)
  const printStatusMeta = getQaReportStatusMeta(
    artifactSnapshot.print.status,
    'gold'
  )
  const printPassedTemplateCount = artifactSnapshot.print.templates.filter(
    (item) => item.latestStatus === 'passed'
  ).length

  useHashAnchorScroll(loading ? 'loading' : 'ready')

  return (
    <Space
      direction="vertical"
      size={16}
      style={{ width: '100%' }}
      className="erp-help-doc-single-column"
    >
      <Card className="erp-page-card" variant="borderless">
        <Title level={4} style={{ margin: 0 }}>
          验收结果总览
        </Title>
        <Paragraph
          type="secondary"
          style={{ maxWidth: 920, marginBottom: 0, marginTop: 8 }}
        >
          这页收口当前已接入的业务闭环、QA
          工具页、可读取报告、质量命令和已知盲区，用来先判断“这轮有没有明显红灯、下一步该点哪里”。
        </Paragraph>
        <Space size={[8, 8]} wrap style={{ marginTop: 12 }}>
          <Tag color="green">状态总览</Tag>
          <Tag color="blue">catalog -&gt; latest JSON -&gt; 页面汇总</Tag>
          <Text type="secondary">章节数：{SECTION_HEADINGS.length}</Text>
        </Space>
      </Card>

      <HelpCenterSectionDirectory headings={SECTION_HEADINGS} />

      <section id="acceptance-overview-summary" className="erp-anchor-section">
        <Alert
          showIcon
          type="info"
          message="开发与验收是内部 QA 工具台，不是所有测试文件和脚本的目录。"
          description="字段联动覆盖已接入 latest 报告；打印模板当前先按模板目录识别范围，只有存在稳定 latest 摘要时才显示为通过或失败。运行记录和专项报告继续承接命令、产物和正式验收口径。"
        />

        <Space
          direction="vertical"
          size={12}
          style={{ width: '100%', marginTop: 16 }}
        >
          <Card size="small">
            <Statistic title="当前工具页" value={6} suffix="个" />
            <Text type="secondary">
              总览、业务链路调试、协同任务调试、字段联动覆盖、运行记录、专项报告
            </Text>
          </Card>
          <Card size="small">
            <Statistic
              title="已接入 v1 主干闭环"
              value={BUSINESS_LOOP_COVERAGE_ROWS.length}
              suffix="条"
            />
            <Text type="secondary">
              均先复用 business_records + workflow_tasks；扩展链路仍按 deferred
              / partial 管理。
            </Text>
          </Card>
          <Card size="small">
            <Statistic
              title="字段联动字段覆盖"
              value={
                loading
                  ? '--'
                  : formatCoverage(
                      fieldLinkageSummary?.coveredFields || 0,
                      fieldLinkageSummary?.totalFields || 0
                    )
              }
            />
            <Text type="secondary">
              最近更新时间：
              {formatGeneratedAt(fieldLinkageReport?.generatedAt)}
            </Text>
          </Card>
          <Card size="small">
            <Statistic
              title="字段联动场景覆盖"
              value={
                loading
                  ? '--'
                  : formatCoverage(
                      fieldLinkageSummary?.passedScenarios || 0,
                      fieldLinkageSummary?.totalScenarios || 0
                    )
              }
            />
            <Tag color={fieldLinkageStatus.color} style={{ marginTop: 8 }}>
              {fieldLinkageStatus.label}
            </Tag>
          </Card>
          <Card size="small">
            <Statistic
              title="打印模板覆盖"
              value={
                loading
                  ? '--'
                  : `${printPassedTemplateCount}/${artifactSnapshot.print.templateCount}`
              }
            />
            <Space size={[8, 8]} wrap style={{ marginTop: 8 }}>
              <Tag color={printStatusMeta.color}>{printStatusMeta.label}</Tag>
              <Text type="secondary">
                最近更新时间：
                {artifactSnapshot.print.isAvailable
                  ? formatGeneratedAt(artifactSnapshot.print.latestAt)
                  : '未生成'}
              </Text>
            </Space>
          </Card>
        </Space>
      </section>

      <section
        id="acceptance-overview-business-loops"
        className="erp-anchor-section"
      >
        <Card title="当前闭环覆盖">
          <Paragraph type="secondary">
            当前 6 条 ERP v1
            主干闭环已经接入。这里显示的是主干功能闭环覆盖，不等于全量业务链路、后端
            E2E 造数、行业专表或生产库人工联调已经完成。
          </Paragraph>
          <Table
            size="small"
            pagination={false}
            columns={BUSINESS_LOOP_COLUMNS}
            dataSource={BUSINESS_LOOP_COVERAGE_ROWS}
            rowKey="key"
            scroll={{ x: 1260 }}
          />
        </Card>
      </section>

      <section
        id="acceptance-overview-quality-commands"
        className="erp-anchor-section"
      >
        <Card title="当前质量命令">
          <Paragraph type="secondary">
            前端逻辑、帮助中心、验收页、菜单和移动端入口改动默认执行前 5 条；改
            Go 才跑 server 命令；改 Ent schema 才跑 make data / make
            migrate_status；每轮收口都跑 git diff --check。
          </Paragraph>
          <Table
            size="small"
            pagination={false}
            columns={QUALITY_COMMAND_COLUMNS}
            dataSource={QA_QUALITY_COMMAND_ROWS}
            rowKey="key"
            scroll={{ x: 980 }}
          />
        </Card>
      </section>

      <section
        id="acceptance-overview-entry-points"
        className="erp-anchor-section"
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Card
            title="字段联动覆盖"
            extra={
              <Tag color={fieldLinkageStatus.color}>
                {fieldLinkageStatus.label}
              </Tag>
            }
          >
            {loading ? (
              <Space
                direction="vertical"
                align="center"
                style={{ width: '100%' }}
              >
                <Spin />
                <Text type="secondary">正在加载字段联动覆盖报告...</Text>
              </Space>
            ) : error ? (
              <Alert
                type="warning"
                showIcon
                message="字段联动覆盖报告暂未生成"
                description={error}
              />
            ) : (
              <Space direction="vertical" size={12} style={{ width: '100%' }}>
                <Paragraph style={{ marginBottom: 0 }}>
                  当前字段联动覆盖页已按字段收口快照、残值、缺值、打印取值和派生重算场景，并汇总最近一次专项结果。
                </Paragraph>
                <Card size="small">
                  <Statistic
                    title="已覆盖字段"
                    value={formatCoverage(
                      fieldLinkageSummary?.coveredFields || 0,
                      fieldLinkageSummary?.totalFields || 0
                    )}
                  />
                </Card>
                <Card size="small">
                  <Statistic
                    title="已覆盖场景"
                    value={formatCoverage(
                      fieldLinkageSummary?.passedScenarios || 0,
                      fieldLinkageSummary?.totalScenarios || 0
                    )}
                  />
                </Card>
                <Text type="secondary">
                  最近一次报告：
                  {formatGeneratedAt(fieldLinkageReport?.generatedAt)}
                </Text>
              </Space>
            )}
            <Space style={{ marginTop: 16 }} wrap>
              <Button
                type="primary"
                onClick={() => navigate(FIELD_LINKAGE_COVERAGE_PATH)}
              >
                进入字段联动覆盖
              </Button>
            </Space>
          </Card>

          <Card title="业务链路调试">
            <Paragraph>
              当问题不是单个字段口径，而是某张单据为什么不能继续流转、任务为什么阻塞、数量或金额关系为什么不对时，优先从这里排查。
            </Paragraph>
            <Space size={[8, 8]} wrap>
              <Tag color="blue">只读查询</Tag>
              <Tag color="geekblue">业务记录</Tag>
              <Tag color="purple">workflow 状态</Tag>
            </Space>
            <Space direction="vertical" size={8} style={{ marginTop: 16 }}>
              {BUSINESS_CHAIN_HIGHLIGHTS.map((item) => (
                <Text key={item}>{item}</Text>
              ))}
            </Space>
            <Space style={{ marginTop: 16 }} wrap>
              <Button
                type="primary"
                onClick={() => navigate(BUSINESS_CHAIN_DEBUG_PATH)}
              >
                进入业务链路调试
              </Button>
            </Space>
          </Card>

          <Card title="协同任务调试">
            <Paragraph>
              当问题已经定位到 workflow_tasks、角色任务池、移动端是否可见或
              workflow_task_events
              事件留痕时，从这里排查，不和业务主线调试混在一起。
            </Paragraph>
            <Space size={[8, 8]} wrap>
              <Tag color="blue">只读诊断</Tag>
              <Tag color="geekblue">角色任务池</Tag>
              <Tag color="purple">移动端可见性</Tag>
              <Tag color="gold">事件轨迹</Tag>
            </Space>
            <Space style={{ marginTop: 16 }} wrap>
              <Button
                type="primary"
                onClick={() => navigate(QA_WORKBENCH_PATHS.workflowTaskDebug)}
              >
                进入协同任务调试
              </Button>
            </Space>
          </Card>

          <Card title="打印模板与合同回归">
            <Paragraph>
              打印模板范围来自当前模板目录；如果还没有打印 latest
              摘要，本页会显式显示“待生成”，避免把模板存在误读成打印专项已经跑完。
            </Paragraph>
            <Space direction="vertical" size={8}>
              <Space size={[8, 8]} wrap>
                <Tag color={printStatusMeta.color}>
                  打印专项 {printStatusMeta.label}
                </Tag>
                <Tag color="blue">
                  启用模板 {artifactSnapshot.print.templateCount} 个
                </Tag>
                <Tag color="green">
                  已完整收口 {printPassedTemplateCount} 个
                </Tag>
              </Space>
              <Text type="secondary">
                当前合同工作台仍按采购合同和加工合同两条真实登录 smoke
                单独验收；要看命令和边界，进入运行记录或专项报告。
              </Text>
              <Text type="secondary">
                推荐命令：
                {QA_RUNNER_COMMANDS.purchaseContractRealLogin}；
                {QA_RUNNER_COMMANDS.processingContractRealLogin}
              </Text>
            </Space>
            <Space style={{ marginTop: 16 }} wrap>
              <Button onClick={() => navigate(QA_WORKBENCH_PATHS.runRecords)}>
                进入运行记录
              </Button>
              <Button onClick={() => navigate(QA_WORKBENCH_PATHS.reports)}>
                进入专项报告
              </Button>
            </Space>
          </Card>
        </Space>
      </section>

      <section
        id="acceptance-overview-blind-spots"
        className="erp-anchor-section"
      >
        <Card title="已知盲区与使用顺序">
          <Paragraph>
            当前不要把这页误读成“全部验收已经完成”。它只是总入口，必须保留未覆盖范围和推荐进入顺序。
          </Paragraph>
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            <div>
              <Text strong>已知盲区</Text>
              <Space direction="vertical" size={8} style={{ marginTop: 8 }}>
                {KNOWN_QA_BLIND_SPOTS.map((item) => (
                  <Text key={item}>{item}</Text>
                ))}
              </Space>
            </div>
            <div>
              <Text strong>推荐使用顺序</Text>
              <Space direction="vertical" size={8} style={{ marginTop: 8 }}>
                {WORKBENCH_STEPS.map((item, index) => (
                  <Text key={item}>
                    {index + 1}. {item}
                  </Text>
                ))}
              </Space>
            </div>
          </Space>
        </Card>
      </section>

      <section id="acceptance-overview-planning" className="erp-anchor-section">
        <Card title="规划表速查">
          <Paragraph type="secondary">
            下面三张表把菜单建议、页面草图和首版重点直接放在页面里，避免总览页只有摘要卡片，真正的取舍依据还散在文档里。
          </Paragraph>
          <Space direction="vertical" size={20} style={{ width: '100%' }}>
            <div>
              <Title level={4} style={{ marginBottom: 12 }}>
                菜单建议
              </Title>
              <Table
                size="small"
                pagination={false}
                columns={MENU_RECOMMENDATION_COLUMNS}
                dataSource={MENU_RECOMMENDATIONS}
                rowKey="key"
                scroll={{ x: 980 }}
              />
            </div>

            <div>
              <Title level={4} style={{ marginBottom: 12 }}>
                验收结果总览页面草图
              </Title>
              <Table
                size="small"
                pagination={false}
                columns={OVERVIEW_BLUEPRINT_COLUMNS}
                dataSource={OVERVIEW_BLUEPRINT_ROWS}
                rowKey="key"
                scroll={{ x: 1180 }}
              />
            </div>

            <div>
              <Title level={4} style={{ marginBottom: 12 }}>
                首版建议只做 4 个重点
              </Title>
              <Table
                size="small"
                pagination={false}
                columns={FIRST_CUT_FOCUS_COLUMNS}
                dataSource={FIRST_CUT_FOCUS_ROWS}
                rowKey="key"
                scroll={{ x: 720 }}
              />
            </div>
          </Space>
        </Card>
      </section>

      <HelpCenterBackToTopButton />
    </Space>
  )
}
