import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  DatabaseOutlined,
  FileDoneOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons'
import {
  Alert,
  Button,
  Card,
  Collapse,
  Descriptions,
  Empty,
  Input,
  List,
  Modal,
  Radio,
  Select,
  Skeleton,
  Space,
  Tag,
  theme,
  Typography,
} from 'antd'
import { Link, useSearchParams } from 'react-router-dom'
import { MermaidDiagram } from '@/common/components/markdown'
import { message } from '@/common/utils/antdApp'
import DevCustomerScopeSelector from '../components/DevCustomerScopeSelector.jsx'
import DevPageNav from '../components/DevPageNav.jsx'
import DevTaskNav from '../components/DevTaskNav.jsx'
import DevTimestamp from '../components/DevTimestamp.jsx'
import {
  DEV_DATA_PREPARATION_INCREMENTAL_FLOW,
  DEV_DATA_PREPARATION_MODULE_FLOW,
  DEV_DATA_PREPARATION_PROFILE_COPY,
  DEV_DATA_PREPARATION_PROFILE_KEYS,
  DEV_DATA_PREPARATION_PROFILE_QUERY_KEY,
  DEV_DATA_PREPARATION_ROUTE,
  DEV_DATA_PREPARATION_SOURCE_PATH,
  DEV_DATA_PREPARATION_TARGET_KEYS,
  DEV_DATA_PREPARATION_TARGET_QUERY_KEY,
  buildDevDataPreparationSearch,
  createDevDataPreparationClient,
  dataPreparationStatusPresentation,
  resolveDataPreparationAvailability,
  resolveDataPreparationExecutionConfirmation,
  resolveDataPreparationPrepareIntent,
  selectRecoverableDataPreparationOperation,
} from '../config/devDataPreparation.mjs'
import useDevCustomerScope from '../hooks/useDevCustomerScope.mjs'

const { Paragraph, Text, Title } = Typography
const DATA_VIEW_ITEMS = [
  { value: 'scope', label: '准备数据' },
  { value: 'confirm', label: '当前批次' },
  { value: 'receipts', label: '执行记录' },
]
const DATA_PROFILE_ORDER = [
  DEV_DATA_PREPARATION_PROFILE_KEYS.scenarioDemo,
  DEV_DATA_PREPARATION_PROFILE_KEYS.coreDemo,
  DEV_DATA_PREPARATION_PROFILE_KEYS.fullAcceptance,
]
const POLL_INTERVAL_MS = 1500
const POLL_RECOVERY_INTERVAL_MS = 3000

function profileTargetKey(profileKey, scenarioTargetKey) {
  if (profileKey === DEV_DATA_PREPARATION_PROFILE_KEYS.coreDemo) {
    return DEV_DATA_PREPARATION_TARGET_KEYS.localDevelopment
  }
  if (profileKey === DEV_DATA_PREPARATION_PROFILE_KEYS.scenarioDemo) {
    return scenarioTargetKey
  }
  return DEV_DATA_PREPARATION_TARGET_KEYS.isolatedLocal
}

function shortHash(value) {
  return typeof value === 'string' && value.length >= 12
    ? value.slice(0, 12)
    : '未证明'
}

function operationTargetLabel(targetKey) {
  if (targetKey === DEV_DATA_PREPARATION_TARGET_KEYS.customerTrial133) {
    return 'demo 演练造数'
  }
  if (targetKey === DEV_DATA_PREPARATION_TARGET_KEYS.isolatedLocal) {
    return '本地隔离验收'
  }
  return '本地开发'
}

function StatusTag({ status }) {
  const presentation = dataPreparationStatusPresentation(status)
  return <Tag color={presentation.color}>{presentation.label}</Tag>
}

function operationUpdateAction(operation) {
  return operation?.terminal ? '完成于' : '更新于'
}

function issueText(issues = []) {
  return Array.isArray(issues)
    ? issues.map((issue) => issue.message).join('；')
    : ''
}

function upsertOperation(operation, operations = []) {
  if (!operation) return operations
  const nextOperations = operations.filter((item) => item.id !== operation.id)
  return [operation, ...nextOperations]
}

function formatDuration(durationMs) {
  if (!Number.isFinite(durationMs)) return '尚未记录'
  if (durationMs < 1000) return `${Math.round(durationMs)} 毫秒`
  const seconds = durationMs / 1000
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)} 秒`
  const minutes = Math.floor(seconds / 60)
  const remainder = Math.round(seconds % 60)
  return `${minutes} 分 ${remainder} 秒`
}

function AcceptancePlanReview({ plan, selectedChainKey, onSelectChain }) {
  const [reuseRulesOpen, setReuseRulesOpen] = useState(false)
  const selectedChain = plan.chains.find(
    (chain) => chain.key === selectedChainKey
  )
  const scenarioLabelByKey = new Map(
    plan.scenarioKinds.map((scenario) => [scenario.key, scenario.label])
  )
  const stepItems = (selectedChain?.steps || []).map((step, index) => ({
    key: step.key,
    label: `${index + 1}. ${step.label}`,
    children: (
      <div className="erp-dev-data-chain-step">
        <Text type="secondary">
          {step.fromLabel} → {step.toLabel}
        </Text>
        <Descriptions
          size="small"
          bordered
          column={{ xs: 1, lg: 2 }}
          items={[
            {
              key: 'responsibility',
              label: '责任岗位',
              children: step.responsibleRole,
            },
            {
              key: 'preconditions',
              label: '前置状态',
              children: step.preconditions.join('；'),
            },
            {
              key: 'actions',
              label: '允许动作',
              children: step.actions.join('；'),
            },
            {
              key: 'results',
              label: '结果状态',
              children: step.results.join('；'),
            },
            {
              key: 'facts',
              label: 'Fact',
              children: step.facts.join('；'),
            },
            {
              key: 'scenarios',
              label: '本步骤场景合同',
              children: (
                <Space wrap size={[4, 4]}>
                  {step.scenarioKinds.map((kind) => (
                    <Tag key={kind}>{scenarioLabelByKey.get(kind) || kind}</Tag>
                  ))}
                </Space>
              ),
            },
          ]}
        />
      </div>
    ),
  }))

  return (
    <div className="erp-dev-data-acceptance-plan">
      <div
        className="erp-dev-data-plan-counts"
        aria-label="当前完整回归计划摘要"
      >
        {[
          ['业务链', plan.chainCount],
          ['链路步骤', plan.stepCount],
          ['场景合同', plan.scenarioCount],
          ['造数阶段', plan.dataStageCount],
          ['页面目标', plan.catalogTargetCount],
        ].map(([label, value]) => (
          <div key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
          </div>
        ))}
      </div>
      <div className="erp-dev-data-chain-toolbar">
        <div>
          <Text strong>选择业务链查看</Text>
          <Text type="secondary">
            选择只影响计划下钻；完整回归始终执行全部已登记场景合同。
          </Text>
        </div>
        <Select
          value={selectedChainKey}
          aria-label="选择业务链查看步骤"
          onChange={onSelectChain}
          options={[
            { value: '', label: '全部业务链' },
            ...plan.chains.map((chain) => ({
              value: chain.key,
              label: chain.label,
            })),
          ]}
        />
      </div>
      {selectedChain ? (
        <section className="erp-dev-data-selected-chain">
          <div>
            <Title level={3}>{selectedChain.label}</Title>
            <Paragraph>{selectedChain.summary}</Paragraph>
            <Space wrap size={[4, 4]}>
              {selectedChain.scenarioKinds.map((kind) => (
                <Tag color="green" key={kind}>
                  {scenarioLabelByKey.get(kind) || kind}
                </Tag>
              ))}
            </Space>
          </div>
          <Collapse accordion items={stepItems} />
        </section>
      ) : (
        <List
          className="erp-dev-data-chain-list"
          size="small"
          dataSource={plan.chains}
          renderItem={(chain) => (
            <List.Item
              actions={[
                <Button
                  key="inspect"
                  type="link"
                  onClick={() => onSelectChain(chain.key)}
                >
                  展开步骤
                </Button>,
              ]}
            >
              <List.Item.Meta
                title={chain.label}
                description={`${chain.summary}（${chain.stepCount} 步 / ${chain.scenarioCount} 类场景）`}
              />
            </List.Item>
          )}
        />
      )}
      <details className="erp-dev-data-reuse-rules" onToggle={(event) => setReuseRulesOpen(event.currentTarget.open)}>
        <summary>代码变化后，旧数据怎么处理</summary>
        <div className="erp-dev-data-table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">结论</th>
                <th scope="col">怎么判断</th>
                <th scope="col">下一步</th>
              </tr>
            </thead>
            <tbody>
              {plan.reuseRules.map((rule) => (
                <tr key={rule.status}>
                  <th scope="row">{rule.label}</th>
                  <td>{rule.condition}</td>
                  <td>{rule.nextAction}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="erp-dev-data-reuse-diagram">
          <div className="erp-dev-data-reuse-diagram__heading">
            <Text strong>增量造数判断</Text>
            <Text type="secondary">
              这是固定规则说明；本次实际复用和刷新范围仍以当前合同、阶段指纹与
              operation 回执为准。
            </Text>
          </div>
          {reuseRulesOpen ? (
            <MermaidDiagram chart={DEV_DATA_PREPARATION_INCREMENTAL_FLOW} label="增量造数判断图" />
          ) : null}
          <Text strong>模块依赖与刷新范围</Text>
          <Text type="secondary">
            依赖用于计算刷新范围；当前 registry 与本次回执决定实际执行内容。
          </Text>
          {reuseRulesOpen ? (
            <MermaidDiagram chart={DEV_DATA_PREPARATION_MODULE_FLOW} label="造数模块依赖图" />
          ) : null}
        </div>
      </details>
    </div>
  )
}

function DataSection({ id, title, description, extra, children }) {
  return (
    <section className="erp-dev-data-section" aria-labelledby={id}>
      <header className="erp-dev-data-section__head">
        <div>
          <Title level={2} id={id}>
            {title}
          </Title>
          {description ? <Paragraph>{description}</Paragraph> : null}
        </div>
        {extra}
      </header>
      {children}
    </section>
  )
}

function currentPassedOperation(summary, profileKey, predicate) {
  return summary.currentOperations.find(
    (operation) =>
      operation.profileKey === profileKey &&
      operation.status === 'passed' &&
      operation.repository?.commit === summary.repository?.commit &&
      operation.repository?.dirty === false &&
      predicate(operation)
  )
}

function DatasetEnvironmentContract({ summary }) {
  const contract = summary.datasetContract
  const coreReadback = currentPassedOperation(
    summary,
    DEV_DATA_PREPARATION_PROFILE_KEYS.coreDemo,
    (operation) =>
      operation.readback?.core?.units === contract.unitCount &&
      operation.readback?.core?.warehouses === contract.warehouseCount
  )
  const localScenarioReadback = currentPassedOperation(
    summary,
    DEV_DATA_PREPARATION_PROFILE_KEYS.scenarioDemo,
    (operation) =>
      operation.targetSummary.targetKey ===
        DEV_DATA_PREPARATION_TARGET_KEYS.localDevelopment &&
      operation.readback?.dataVersion === contract.dataVersion &&
      operation.readback?.runId === contract.runId
  )
  const trialScenarioReadback = currentPassedOperation(
    summary,
    DEV_DATA_PREPARATION_PROFILE_KEYS.scenarioDemo,
    (operation) =>
      operation.targetSummary.targetKey ===
        DEV_DATA_PREPARATION_TARGET_KEYS.customerTrial133 &&
      operation.readback?.dataVersion === contract.dataVersion &&
      operation.readback?.runId === contract.runId &&
      operation.readback?.semanticDigest === contract.semanticDigest
  )
  const fullReadback = currentPassedOperation(
    summary,
    DEV_DATA_PREPARATION_PROFILE_KEYS.fullAcceptance,
    (operation) =>
      operation.readback?.dataVersion === contract.dataVersion &&
      operation.readback?.reportStatus === 'passed' &&
      operation.readback?.cleanupComplete === true &&
      operation.readback?.residualDatabaseCount === 0
  )
  const localReadBack = Boolean(coreReadback && localScenarioReadback)
  const targetRows = [
    {
      key: 'local',
      title: '本地长期数据',
      target: summary.target.scenarioDemo.databaseName,
      status: localReadBack ? '已读回' : '待补齐 / 待读回',
      color: localReadBack ? 'success' : 'default',
      action:
        'Core 精确读回；缺失才补齐。Scenario 按固定版本向前补齐并长期保留。',
    },
    {
      key: 'trial',
      title: 'demo 演练造数',
      target: contract.customerTrial133.databaseName,
      status: trialScenarioReadback ? '已独立读回' : '待目标回执',
      color: trialScenarioReadback ? 'success' : 'default',
      action:
        '只走 customer-trial-133 目标策略、attestation 和独立回执；不复制本地数据库。',
    },
    {
      key: 'isolated',
      title: '隔离完整验收',
      target: '每次新建的可丢弃数据库',
      status: fullReadback ? '已通过并清理' : '待新批次',
      color: fullReadback ? 'success' : 'default',
      action: '绑定 clean exact commit 运行全部链路；成功或失败都自动清理。',
    },
  ]

  return (
    <section
      className="erp-dev-data-environment-contract"
      aria-labelledby="dev-data-environment-contract-title"
    >
      <header>
        <div className="erp-dev-data-environment-contract__heading">
          <Title level={2} id="dev-data-environment-contract-title">
            统一数据合同
          </Title>
          <Text type="secondary">
            两端共用一套业务语义，但目标身份、写入锁、回执和回滚点始终独立。
          </Text>
        </div>
        <Space wrap size={[4, 4]}>
          <Tag>{contract.dataVersion}</Tag>
          <Tag>{contract.runId}</Tag>
          <Tag color="blue">仅模拟数据</Tag>
        </Space>
      </header>
      <Descriptions
        size="small"
        column={{ xs: 1, md: 2, xl: 4 }}
        items={[
          {
            key: 'dataset',
            label: 'Dataset key',
            children: contract.datasetKey,
          },
          {
            key: 'digest',
            label: 'Semantic digest',
            children: <Text code>{shortHash(contract.semanticDigest)}</Text>,
          },
          {
            key: 'units',
            label: '审定模拟单位',
            children: `${contract.unitCount} 个`,
          },
          {
            key: 'warehouses',
            label: '模拟仓库',
            children: `${contract.warehouseCount} 个`,
          },
        ]}
      />
      <div className="erp-dev-data-environment-contract__targets">
        {targetRows.map((row) => (
          <article key={row.key}>
            <header>
              <strong>{row.title}</strong>
              <Tag color={row.color}>{row.status}</Tag>
            </header>
            <Text code>{row.target}</Text>
            <Text type="secondary">{row.action}</Text>
          </article>
        ))}
      </div>
      <Text type="secondary">
        本批次不是永绅真实客户导入，不得当作真实出货、库存、财务或客户签收证据。
      </Text>
    </section>
  )
}

function ProfileOption({ profile, selected, disabled, availability }) {
  const copy = DEV_DATA_PREPARATION_PROFILE_COPY[profile.key]
  return (
    <tr
      className={
        selected
          ? 'erp-dev-data-profile-row is-selected'
          : 'erp-dev-data-profile-row'
      }
    >
      <th scope="row">
        <Radio value={profile.key} disabled={disabled}>
          {copy.title}
        </Radio>
      </th>
      <td>
        <Text>{copy.purpose}</Text>
        <Text type="secondary">{copy.cleanupBoundary}</Text>
      </td>
      <td>
        <Tag
          color={
            availability.status === 'blocked'
              ? 'warning'
              : availability.status === 'available'
                ? 'success'
                : 'default'
          }
        >
          {availability.label}
        </Tag>
        <small>
          {availability.blockers.map((blocker) => blocker.title).join('；') ||
            (availability.status === 'not_proven'
              ? '点击准备后读取目标，不会立即写入。'
              : '可以准备计划，确认后才写入。')}
        </small>
      </td>
      <td>
        <details>
          <summary>范围与退出方式</summary>
          <p>{copy.scope}</p>
          <p>{copy.cleanup}</p>
          <div>
            {profile.requiredEnvironment.map((requirement) => (
              <Tag key={requirement}>{requirement}</Tag>
            ))}
          </div>
        </details>
      </td>
    </tr>
  )
}

const READBACK_PRESENTATIONS = Object.freeze({
  [DEV_DATA_PREPARATION_PROFILE_KEYS.coreDemo]: (readback) => ({
    column: { xs: 1, sm: 2, lg: 3 },
    items: [
      {
        key: 'accounts',
        label: '岗位账号',
        children: readback.roleAccounts,
      },
      {
        key: 'units',
        label: '单位',
        children: readback.core.units,
      },
      {
        key: 'materials',
        label: '材料',
        children: readback.core.materials,
      },
      {
        key: 'products',
        label: '产品',
        children: readback.core.products,
      },
      {
        key: 'warehouses',
        label: '仓库',
        children: readback.core.warehouses,
      },
      {
        key: 'processes',
        label: '工艺',
        children: readback.core.processes,
      },
      {
        key: 'bomHeaders',
        label: 'BOM',
        children: readback.core.bomHeaders,
      },
      {
        key: 'retention',
        label: '数据策略',
        children: '稳定 upsert，按正常生命周期退出',
      },
    ],
  }),
  [DEV_DATA_PREPARATION_PROFILE_KEYS.scenarioDemo]: (readback) => ({
    column: { xs: 1, sm: 2, lg: 3 },
    notice:
      '本读回只证明固定批次业务场景已精确创建或读回：41 / 51 项已由数据查询证明，另 10 项只能在浏览器中确认。51 项页面操作与人工验收均未执行，不代表完整验收。',
    items: [
      {
        key: 'targetKey',
        label: '目标环境',
        children: operationTargetLabel(readback.targetKey),
      },
      {
        key: 'release',
        label: 'Release / SHA',
        children: <Text code>{shortHash(readback.release)}</Text>,
      },
      {
        key: 'databaseName',
        label: '数据库',
        children: readback.databaseName,
      },
      {
        key: 'migrationVersion',
        label: 'Migration',
        children: readback.migrationVersion,
      },
      {
        key: 'customerConfigRevision',
        label: '客户配置 revision',
        children: readback.customerConfigRevision,
      },
      {
        key: 'datasetKey',
        label: '固定数据集',
        children: <Text code>{readback.datasetKey}</Text>,
      },
      {
        key: 'dataVersion',
        label: '数据版本',
        children: <Text code>{readback.dataVersion}</Text>,
      },
      {
        key: 'runId',
        label: '数据批次',
        children: <Text code>{readback.runId}</Text>,
      },
      ...(readback.backupReceipt
        ? [
            {
              key: 'backupAlias',
              label: '133 新回滚点',
              children: readback.backupReceipt.backupAlias,
            },
            {
              key: 'backupDigest',
              label: '备份校验',
              children: `${shortHash(readback.backupReceipt.sha256)} / ${readback.backupReceipt.sizeBytes} bytes`,
            },
            {
              key: 'backupCreatedAt',
              label: '备份创建',
              children: (
                <DevTimestamp
                  value={readback.backupReceipt.createdAt}
                  missing="备份时间未证明"
                />
              ),
            },
          ]
        : []),
      {
        key: 'semanticDigest',
        label: 'Semantic digest',
        children: <Text code>{shortHash(readback.semanticDigest)}</Text>,
      },
      {
        key: 'sourceDocumentCount',
        label: '来源单据',
        children: readback.sourceDocumentCount,
      },
      {
        key: 'processRuntimeCount',
        label: '已验证流程实例',
        children: readback.processRuntimeCount,
      },
      {
        key: 'factCount',
        label: '业务事实',
        children: readback.factCount,
      },
      {
        key: 'catalog',
        label: '目录数据已证明',
        children: `${readback.catalogReadyCount} / ${readback.catalogTargetCount}`,
      },
      {
        key: 'replay',
        label: '同批复用',
        children:
          readback.replayMode === 'exact-create-or-readback'
            ? '精确创建或读回'
            : readback.replayMode,
      },
      {
        key: 'retention',
        label: '保留边界',
        children: readback.cleanupSupported
          ? '支持清理'
          : '长期保留，不清空已有数据',
      },
      {
        key: 'browserChecks',
        label: '仅浏览器可证明项',
        children: `${readback.browserChecksPending} 项`,
      },
      {
        key: 'manualAcceptance',
        label: '人工验收',
        children: readback.manualAcceptanceCompleted ? '已完成' : '未完成',
      },
    ],
  }),
  [DEV_DATA_PREPARATION_PROFILE_KEYS.fullAcceptance]: (readback) => ({
    column: { xs: 1, sm: 3 },
    notice:
      '本回执证明当前代码合同下的本地技术回归与清理结果，不等于目标环境发布或客户 UAT。',
    items: [
      {
        key: 'report',
        label: `${readback.catalogTargetCount} 项页面回归`,
        children: readback.reportStatus === 'passed' ? '通过' : '失败',
      },
      {
        key: 'chains',
        label: '业务链 / 步骤 / 场景',
        children: `${readback.chainCount} / ${readback.stepCount} / ${readback.scenarioCount}`,
      },
      {
        key: 'duration',
        label: '造数总耗时',
        children: formatDuration(readback.datasetDurationMs),
      },
      {
        key: 'cleanup',
        label: '自动清理',
        children: readback.cleanupComplete ? '完成' : '未完成',
      },
      {
        key: 'residual',
        label: '残留隔离库',
        children: readback.residualDatabaseCount,
      },
    ],
  }),
})

function OperationIssues({ issues = [] }) {
  if (!issues.length) return null
  return (
    <Alert
      type="warning"
      showIcon
      message="当前计划存在阻断或风险"
      description={issueText(issues)}
    />
  )
}

function OperationReadback({ operation, acceptancePlan }) {
  const { readback } = operation
  if (!readback) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="终态读回尚未生成"
      />
    )
  }

  const presentation = READBACK_PRESENTATIONS[readback.profileKey](readback)

  return (
    <Space direction="vertical" size={12} className="erp-dev-data-readback">
      <Descriptions
        size="small"
        bordered
        column={presentation.column}
        items={presentation.items}
      />
      {presentation.notice ? (
        <Alert type="info" showIcon message={presentation.notice} />
      ) : null}
      {readback.profileKey ===
        DEV_DATA_PREPARATION_PROFILE_KEYS.fullAcceptance &&
      readback.stageTimings.length > 0 ? (
        <section
          className="erp-dev-data-stage-timings"
          aria-label="造数阶段耗时"
        >
          <div className="erp-dev-data-stage-timings__head">
            <Text strong>9 个现有造数阶段</Text>
            <Text type="secondary">
              总耗时是墙钟时间；各阶段按唯一串行 runner 的真实开始和结束记录。
            </Text>
          </div>
          <List
            size="small"
            dataSource={readback.stageTimings}
            renderItem={(stage) => {
              const definition = acceptancePlan?.dataStages.find(
                (candidate) => candidate.key === stage.key
              )
              return (
                <List.Item>
                  <Space wrap>
                    <Tag
                      color={
                        stage.status === 'completed'
                          ? 'success'
                          : stage.status === 'failed'
                            ? 'error'
                            : 'default'
                      }
                    >
                      {stage.status === 'completed'
                        ? '完成'
                        : stage.status === 'failed'
                          ? '失败'
                          : '未开始'}
                    </Tag>
                    <Text>{definition?.label || stage.key}</Text>
                    <Text type="secondary">
                      {formatDuration(stage.durationMs)}
                    </Text>
                  </Space>
                </List.Item>
              )
            }}
          />
        </section>
      ) : null}
    </Space>
  )
}

function OperationDetail({ operation, acceptancePlan, compact = false }) {
  const profileCopy = DEV_DATA_PREPARATION_PROFILE_COPY[operation.profileKey]
  const [technicalOpen, setTechnicalOpen] = useState(false)
  return (
    <div className="erp-dev-data-operation-detail">
      <div className="erp-dev-data-operation-overview">
        <div>
          <Text strong>{profileCopy.title}</Text>
          <Tag>{operationTargetLabel(operation.targetSummary.targetKey)}</Tag>
          <StatusTag status={operation.status} />
        </div>
        <Text>{operation.targetSummary.safeTarget}</Text>
        <Space wrap size={[12, 4]}>
          <DevTimestamp
            value={operation.createdAt}
            action="开始于"
            missing="开始时间未证明"
          />
          <Text type="secondary">
            实际执行：{formatDuration(operation.timing.durationMs)}
          </Text>
          <DevTimestamp
            value={operation.updatedAt}
            action={operationUpdateAction(operation)}
            missing="更新时间未证明"
          />
        </Space>
      </div>
      <OperationIssues issues={operation.issues} />
      <details
        className="erp-dev-data-operation-technical"
        open={technicalOpen}
        onToggle={(event) => setTechnicalOpen(event.currentTarget.open)}
      >
        <summary>核对不可变计划、批次与固定步骤</summary>
        <Descriptions
          size="small"
          column={{ xs: 1, md: 2 }}
          items={[
            {
              key: 'planHash',
              label: '不可变计划',
              children: (
                <Text code copyable>
                  {operation.planHash}
                </Text>
              ),
            },
            {
              key: 'runId',
              label: '运行批次',
              children: (
                <Text code copyable>
                  {operation.runId}
                </Text>
              ),
            },
            {
              key: 'preflightFingerprint',
              label: '预检指纹',
              children: (
                <Text code copyable>
                  {operation.targetSummary.preflightFingerprint}
                </Text>
              ),
            },
            {
              key: 'cleanup',
              label: '清理边界',
              children: profileCopy.cleanupBoundary,
            },
            {
              key: 'createdAt',
              label: '计划创建',
              children: (
                <DevTimestamp
                  value={operation.createdAt}
                  missing="计划创建时间未证明"
                />
              ),
            },
          ]}
        />
        <section aria-label="固定执行步骤">
          <Text strong>固定执行步骤</Text>
          <ol className="erp-dev-data-step-list">
            {profileCopy.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>
      </details>
      {!compact ? (
        <>
          <section aria-label="状态事件">
            <Text strong>状态事件</Text>
            <List
              size="small"
              dataSource={operation.events}
              locale={{ emptyText: '尚无状态事件' }}
              renderItem={(event) => (
                <List.Item>
                  <Space direction="vertical" size={2}>
                    <Space wrap>
                      <Tag>{event.status}</Tag>
                      <DevTimestamp value={event.at} missing="事件时间未证明" />
                    </Space>
                    <Text>{event.message}</Text>
                  </Space>
                </List.Item>
              )}
            />
          </section>
          <section aria-label="终态读回">
            <Text strong>终态读回</Text>
            <OperationReadback
              operation={operation}
              acceptancePlan={acceptancePlan}
            />
          </section>
        </>
      ) : null}
    </div>
  )
}

export default function DevDataPreparationPage() {
  const { token } = theme.useToken()
  const [searchParams, setSearchParams] = useSearchParams()
  const requestedDataView = DATA_VIEW_ITEMS.some(
    (item) => item.value === searchParams.get('view')
  )
    ? searchParams.get('view')
    : 'scope'
  const selectDataView = (value) =>
    setSearchParams((current) => {
      const next = new URLSearchParams(current)
      next.set('view', value)
      return next
    })
  const client = useMemo(() => createDevDataPreparationClient(), [])
  const mountedRef = useRef(false)
  const requestVersionRef = useRef(0)
  const refreshAbortRef = useRef(null)
  const currentOperationIdRef = useRef('')
  const prepareIntentRef = useRef(null)
  const [summary, setSummary] = useState(null)
  const [selectedProfileKey, setSelectedProfileKey] = useState(() => {
    const requested = searchParams.get(DEV_DATA_PREPARATION_PROFILE_QUERY_KEY)
    return Object.values(DEV_DATA_PREPARATION_PROFILE_KEYS).includes(requested)
      ? requested
      : DEV_DATA_PREPARATION_PROFILE_KEYS.scenarioDemo
  })
  const [selectedScenarioTargetKey, setSelectedScenarioTargetKey] = useState(
    () =>
      searchParams.get(DEV_DATA_PREPARATION_TARGET_QUERY_KEY) ===
      DEV_DATA_PREPARATION_TARGET_KEYS.customerTrial133
        ? DEV_DATA_PREPARATION_TARGET_KEYS.customerTrial133
        : DEV_DATA_PREPARATION_TARGET_KEYS.localDevelopment
  )
  const selectedIsScenarioDemo =
    selectedProfileKey === DEV_DATA_PREPARATION_PROFILE_KEYS.scenarioDemo
  const customerScope = useDevCustomerScope({
    searchParams,
    setSearchParams,
    normalize: selectedIsScenarioDemo,
  })
  const customerReady = customerScope.status === 'ready'
  const [selectedChainKey, setSelectedChainKey] = useState('')
  const [currentOperation, setCurrentOperation] = useState(null)
  const dataView =
    requestedDataView === 'confirm' && !currentOperation
      ? 'scope'
      : requestedDataView
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [pollError, setPollError] = useState('')
  const [preparing, setPreparing] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmation, setConfirmation] = useState('')

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  // Lazy route loading can keep this component mounted after the address changes.
  const isPageActive = () =>
    mountedRef.current &&
    window.location.pathname.replace(/\/$/u, '') === DEV_DATA_PREPARATION_ROUTE

  const updateOperation = useCallback((operation) => {
    currentOperationIdRef.current = operation.id
    setCurrentOperation(operation)
    setSummary((current) =>
      current
        ? {
            ...current,
            currentOperations: upsertOperation(
              operation,
              current.currentOperations
            ),
          }
        : current
    )
  }, [])

  const refresh = useCallback(
    async ({ force = false } = {}) => {
      refreshAbortRef.current?.abort()
      const controller = new AbortController()
      refreshAbortRef.current = controller
      const requestVersion = requestVersionRef.current + 1
      requestVersionRef.current = requestVersion
      setLoading(true)
      setLoadError('')
      try {
        const summaryClient = createDevDataPreparationClient({
          fetchImpl: (input, init) =>
            globalThis.fetch(input, { ...init, signal: controller.signal }),
        })
        const nextSummary = await summaryClient.summary({ force })
        if (requestVersion !== requestVersionRef.current) return
        setSummary(nextSummary)
        const recoveredOperation = selectRecoverableDataPreparationOperation(
          nextSummary.currentOperations,
          currentOperationIdRef.current,
          selectedProfileKey,
          profileTargetKey(selectedProfileKey, selectedScenarioTargetKey)
        )
        currentOperationIdRef.current = recoveredOperation?.id || ''
        setCurrentOperation(recoveredOperation)
        if (recoveredOperation) {
          setSelectedProfileKey(recoveredOperation.profileKey)
          const recoveredTargetKey = recoveredOperation.targetSummary.targetKey
          if (
            recoveredOperation.profileKey ===
            DEV_DATA_PREPARATION_PROFILE_KEYS.scenarioDemo
          ) {
            setSelectedScenarioTargetKey(recoveredTargetKey)
          }
          setSearchParams(
            (currentSearchParams) =>
              buildDevDataPreparationSearch(currentSearchParams, {
                profileKey: recoveredOperation.profileKey,
                targetKey: recoveredTargetKey,
                customerKey: customerScope.customerKey,
              }),
            { replace: true }
          )
          if (
            prepareIntentRef.current?.profileKey ===
            recoveredOperation.profileKey
          ) {
            prepareIntentRef.current = null
          }
        }
      } catch (error) {
        if (error?.name === 'AbortError') return
        if (requestVersion !== requestVersionRef.current) return
        setLoadError(error?.message || '数据准备预检读取失败')
      } finally {
        if (requestVersion === requestVersionRef.current) {
          setLoading(false)
        }
      }
    },
    [
      customerScope.customerKey,
      selectedProfileKey,
      selectedScenarioTargetKey,
      setSearchParams,
    ]
  )

  useEffect(() => {
    refresh()
    return () => {
      refreshAbortRef.current?.abort()
      requestVersionRef.current += 1
    }
  }, [refresh])

  const activeOperationId = currentOperation?.id || ''
  const activeOperationTerminal = currentOperation?.terminal === true

  useEffect(() => {
    if (!activeOperationId || activeOperationTerminal) return undefined
    let cancelled = false
    let timerId

    const poll = async () => {
      try {
        const operation = await client.operation(activeOperationId)
        if (cancelled) return
        setPollError('')
        updateOperation(operation)
        if (!operation.terminal) {
          timerId = window.setTimeout(poll, POLL_INTERVAL_MS)
        }
      } catch (error) {
        if (cancelled) return
        setPollError(error?.message || '回执刷新暂时失败')
        timerId = window.setTimeout(poll, POLL_RECOVERY_INTERVAL_MS)
      }
    }

    timerId = window.setTimeout(poll, POLL_INTERVAL_MS)
    return () => {
      cancelled = true
      window.clearTimeout(timerId)
    }
  }, [activeOperationId, activeOperationTerminal, client, updateOperation])

  const profiles = [...(summary?.profiles || [])].sort(
    (left, right) =>
      DATA_PROFILE_ORDER.indexOf(left.key) - DATA_PROFILE_ORDER.indexOf(right.key)
  )
  const selectedProfile = profiles.find(
    (profile) => profile.key === selectedProfileKey
  )
  const selectedProfileCopy =
    DEV_DATA_PREPARATION_PROFILE_COPY[selectedProfileKey]
  const selectedOperationTargetKey = profileTargetKey(
    selectedProfileKey,
    selectedScenarioTargetKey
  )
  const availability = resolveDataPreparationAvailability(
    summary,
    selectedProfileKey,
    selectedOperationTargetKey
  )
  const hasActiveOperation = (summary?.currentOperations || []).some(
    (operation) => ['launching', 'running'].includes(operation.status)
  )
  const currentIsScenarioDemo =
    currentOperation?.profileKey ===
    DEV_DATA_PREPARATION_PROFILE_KEYS.scenarioDemo
  const canPrepare =
    Boolean(selectedProfile) &&
    availability.blockers.length === 0 &&
    !hasActiveOperation &&
    (!selectedIsScenarioDemo || customerReady) &&
    !loading &&
    !loadError &&
    !preparing &&
    !executing
  const canExecuteCurrent =
    currentOperation?.status === 'ready' &&
    currentOperation.profileKey === selectedProfileKey &&
    currentOperation.targetSummary.targetKey === selectedOperationTargetKey &&
    !hasActiveOperation &&
    availability.blockers.length === 0 &&
    (!currentIsScenarioDemo || customerReady) &&
    !loading &&
    !loadError &&
    !preparing &&
    !executing
  const currentExecutionConfirmation = currentOperation
    ? resolveDataPreparationExecutionConfirmation(
        currentOperation,
        confirmation
      )
    : ''
  const selectProfile = (profileKey) => {
    if (preparing || executing) return
    setSelectedProfileKey(profileKey)
    setSearchParams(
      (currentSearchParams) =>
        buildDevDataPreparationSearch(currentSearchParams, {
          profileKey,
          targetKey: selectedScenarioTargetKey,
          customerKey: customerScope.customerKey,
        }),
      { replace: true }
    )
    currentOperationIdRef.current = ''
    prepareIntentRef.current = null
    setCurrentOperation(null)
    setActionError('')
    setPollError('')
    setConfirmOpen(false)
    setConfirmation('')
  }

  const selectScenarioTarget = (targetKey) => {
    if (preparing || executing) return
    setSelectedScenarioTargetKey(targetKey)
    setSearchParams(
      (currentSearchParams) =>
        buildDevDataPreparationSearch(currentSearchParams, {
          profileKey: selectedProfileKey,
          targetKey,
          customerKey: customerScope.customerKey,
        }),
      { replace: true }
    )
    currentOperationIdRef.current = ''
    prepareIntentRef.current = null
    setCurrentOperation(null)
    setActionError('')
    setPollError('')
    setConfirmOpen(false)
    setConfirmation('')
  }

  const prepareBlockingReason = loading
    ? '正在检查当前条件…'
    : loadError
      ? '预检读取失败，请重新检查后再操作。'
      : selectedIsScenarioDemo && !customerReady
        ? '先选择已登记甲方，再准备对应的业务场景。'
        : hasActiveOperation
          ? '已有批次正在执行，请先查看当前批次。'
          : availability.blockers.length
            ? '请先处理下面列出的条件，再重新检查。'
            : ''

  const handlePrepare = async () => {
    if (!canPrepare) return
    const profileKey = selectedProfileKey
    setPreparing(true)
    setActionError('')
    try {
      const intent = resolveDataPreparationPrepareIntent(
        prepareIntentRef.current,
        profileKey,
        selectedOperationTargetKey
      )
      prepareIntentRef.current = intent
      const result = await client.prepare(
        profileKey,
        selectedOperationTargetKey,
        intent.idempotencyKey
      )
      if (!isPageActive()) return
      updateOperation(result.operation)
      selectDataView('confirm')
      prepareIntentRef.current = null
      message.success(
        result.reused ? '已读回复用的不可变计划' : '不可变计划已准备'
      )
      if (
        profileKey === DEV_DATA_PREPARATION_PROFILE_KEYS.scenarioDemo &&
        result.operation.status === 'ready'
      ) {
        setConfirmation(result.operation.confirmationRequired)
        setConfirmOpen(true)
      }
    } catch (error) {
      if (isPageActive()) setActionError(error?.message || '计划准备失败')
    } finally {
      if (isPageActive()) setPreparing(false)
    }
  }

  const handleExecute = async () => {
    if (
      !canExecuteCurrent ||
      !currentOperation ||
      currentExecutionConfirmation !== currentOperation.confirmationRequired
    ) {
      return
    }
    setExecuting(true)
    setActionError('')
    try {
      const result = await client.execute(
        currentOperation.id,
        currentExecutionConfirmation
      )
      if (!isPageActive()) return
      updateOperation(result.operation)
      setConfirmOpen(false)
      setConfirmation('')
      selectDataView('confirm')
      message.success('批次已启动，正在跟踪执行结果')
    } catch (error) {
      if (isPageActive()) {
        setActionError(error?.message || '固定计划执行失败')
      }
    } finally {
      if (isPageActive()) setExecuting(false)
    }
  }

  const historyItems = (summary?.currentOperations || []).map((operation) => ({
    key: operation.id,
    label: (
      <div className="erp-dev-data-history-label">
        <span>
          {DEV_DATA_PREPARATION_PROFILE_COPY[operation.profileKey].title}
        </span>
        <Tag>{operationTargetLabel(operation.targetSummary.targetKey)}</Tag>
        <StatusTag status={operation.status} />
        <Text type="secondary" code>
          {shortHash(operation.planHash)}
        </Text>
        <DevTimestamp
          value={operation.updatedAt}
          action={operationUpdateAction(operation)}
          missing="更新时间未证明"
        />
      </div>
    ),
    children: (
      <OperationDetail
        operation={operation}
        acceptancePlan={summary?.acceptancePlan}
      />
    ),
  }))
  const receiptIssues = (summary?.issues || []).filter((issue) =>
    [
      'unresolved_operation_contract_preserved',
      'unresolved_operation_outcome',
      'scenario_demo_explicit_resume_available',
    ].includes(issue.code)
  )
  const historicalOperationReferences = [
    ...(summary?.historicalOperations || []),
    ...(summary?.unresolvedOperations || []),
  ]

  return (
    <div
      className="erp-dev-hub-page erp-dev-workspace-page erp-dev-data-page"
      style={{
        '--dev-data-border': token.colorBorder,
        '--dev-data-primary': token.colorPrimary,
        '--dev-data-selected': token.colorPrimaryBg,
        '--dev-data-surface': token.colorBgContainer,
        '--dev-data-muted': token.colorTextSecondary,
        '--dev-data-warning-bg': token.colorWarningBg,
      }}
    >
      <DevPageNav sourcePath={DEV_DATA_PREPARATION_SOURCE_PATH} />
      <header className="erp-dev-hub-header">
        <div className="erp-dev-hub-header__copy">
          <span className="erp-dev-hub-header__icon">
            <DatabaseOutlined aria-hidden="true" />
          </span>
          <div>
            <Text className="erp-dev-data-header__eyebrow">
              测试数据准备中心
            </Text>
            <Title level={1} className="erp-dev-hub-title">
              测试数据
            </Title>
          </div>
        </div>
        <Space direction="vertical" align="end" size={4}>
          <Button
            icon={<ReloadOutlined aria-hidden="true" />}
            loading={loading}
            disabled={preparing || executing}
            onClick={() => refresh({ force: true })}
          >
            重新检查
          </Button>
          <DevTimestamp
            value={summary?.generatedAt}
            action="预检读取于"
            missing="预检时间未证明"
          />
        </Space>
      </header>

      <main className="erp-dev-hub-shell erp-dev-data-shell">
        <div className="erp-dev-data-context">
          <Text type="secondary">
            <SafetyCertificateOutlined aria-hidden="true" />{' '}
            仅用于开发与模拟数据
          </Text>
          {summary?.repository ? (
            <Space size={8}>
              <Text code>{shortHash(summary.repository.commit)}</Text>
              <Tag color={summary.repository.dirty ? 'default' : 'success'}>
                {summary.repository.dirty ? '有未提交改动' : '代码已固定'}
              </Tag>
            </Space>
          ) : null}
        </div>

        {loadError ? (
          <Alert
            type="error"
            showIcon
            message="预检读取失败"
            description={
              <Space direction="vertical" size={8}>
                <Text>{loadError}</Text>
                <Space>
                  <Button onClick={() => refresh({ force: true })}>
                    重新读取预检
                  </Button>
                  <Link to="/__dev/database-migration">
                    查看数据库与运行状态
                  </Link>
                </Space>
              </Space>
            }
          />
        ) : null}

        {actionError ? (
          <Alert
            type="error"
            showIcon
            closable
            message="本次操作未完成"
            description={actionError}
            onClose={() => setActionError('')}
          />
        ) : null}

        {pollError ? (
          <Alert
            type="warning"
            showIcon
            message="回执刷新暂时中断"
            description={`${pollError}；页面会继续自动恢复，也可手动刷新预检。`}
          />
        ) : null}

        {loading && !summary ? (
          <Card>
            <Skeleton active paragraph={{ rows: 8 }} />
          </Card>
        ) : null}

        {summary ? (
          <div className="erp-dev-data-workspace">
            <DevTaskNav
              compact
              idPrefix="dev-data"
              ariaLabel="测试数据视图"
              items={DATA_VIEW_ITEMS.filter(
                (item) => item.value !== 'confirm' || currentOperation
              )}
              value={dataView}
              onChange={selectDataView}
            />
            {receiptIssues.length > 0 ? (
              <Alert
                type="warning"
                showIcon
                message="有批次结果需要核对"
                description={
                  <Space direction="vertical" size={4}>
                    {receiptIssues.map((issue) => (
                      <Text key={issue.code}>{issue.message}</Text>
                    ))}
                    {dataView !== 'receipts' ? (
                      <Button onClick={() => selectDataView('receipts')}>
                        查看执行记录
                      </Button>
                    ) : null}
                  </Space>
                }
              />
            ) : null}
            {currentOperation &&
            !currentOperation.terminal &&
            dataView !== 'confirm' ? (
              <div className="erp-dev-data-pending" role="status">
                <Text strong>
                  {
                    DEV_DATA_PREPARATION_PROFILE_COPY[
                      currentOperation.profileKey
                    ].title
                  }
                </Text>
                <StatusTag status={currentOperation.status} />
                <Button onClick={() => selectDataView('confirm')}>
                  查看当前批次
                </Button>
              </div>
            ) : null}
            <section
              hidden={dataView !== 'scope'}
              id="dev-data-panel-scope"
              role="tabpanel"
              aria-labelledby="dev-data-tab-scope"
            >
              <DataSection
                id="dev-data-prepare-heading"
                title="选择要准备的数据"
                description="选择用途并核对当前条件，准备计划后再确认执行。"
              >
                <Radio.Group
                  className="erp-dev-data-profile-table-control"
                  value={selectedProfileKey}
                  disabled={preparing || executing}
                  onChange={(event) => selectProfile(event.target.value)}
                >
                  <div className="erp-dev-tool-table-wrap">
                    <table
                      className="erp-dev-tool-table erp-dev-data-profile-table"
                      aria-label="数据准备方式"
                    >
                      <thead>
                        <tr>
                          <th scope="col">准备范围</th>
                          <th scope="col">用途与保留</th>
                          <th scope="col">当前条件</th>
                          <th scope="col">数据明细</th>
                        </tr>
                      </thead>
                      <tbody>
                        {profiles.map((profile) => (
                          <ProfileOption
                            key={profile.key}
                            profile={profile}
                            selected={selectedProfileKey === profile.key}
                            disabled={preparing || executing}
                            availability={resolveDataPreparationAvailability(
                              summary,
                              profile.key,
                              profileTargetKey(
                                profile.key,
                                selectedScenarioTargetKey
                              )
                            )}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Radio.Group>
                {selectedIsScenarioDemo ? (
                  <div className="erp-dev-data-target-choice">
                    <Text strong>生成到哪里</Text>
                    <Radio.Group
                      value={selectedScenarioTargetKey}
                      disabled={preparing || executing}
                      onChange={(event) =>
                        selectScenarioTarget(event.target.value)
                      }
                      options={[
                        {
                          value:
                            DEV_DATA_PREPARATION_TARGET_KEYS.localDevelopment,
                          label: '本地开发',
                        },
                        {
                          value:
                            DEV_DATA_PREPARATION_TARGET_KEYS.customerTrial133,
                          label: 'demo 演练环境',
                        },
                      ]}
                    />
                    <DevCustomerScopeSelector
                      scope={customerScope}
                      onChange={customerScope.selectCustomer}
                      disabled={preparing || executing}
                      label="业务场景甲方"
                      note="按登记的固定批次补齐模拟数据。"
                      invalidDescription="当前甲方没有登记固定场景数据；其他数据准备方式不受影响。"
                    />
                  </div>
                ) : null}
                <div className="erp-dev-data-selection">
                  <div className="erp-dev-data-prepare-actions">
                    <div>
                      <Text strong>{selectedProfileCopy.title}</Text>
                      <Text type="secondary">
                        {prepareBlockingReason ||
                          selectedProfileCopy.prepareDescription}
                      </Text>
                    </div>
                    <Button
                      type="primary"
                      icon={<FileDoneOutlined aria-hidden="true" />}
                      disabled={!canPrepare}
                      loading={preparing}
                      onClick={handlePrepare}
                    >
                      {selectedProfileCopy.prepareButtonLabel}
                    </Button>
                  </div>
                  {availability.blockers.length > 0 ? (
                    <section
                      className="erp-dev-data-blockers"
                      aria-label="本次准备需要处理的条件"
                    >
                      {availability.blockers.map((blocker) => (
                        <div key={blocker.code}>
                          <Text>{blocker.message}</Text>
                          {blocker.nextAction ? (
                            <Text type="secondary">{blocker.nextAction}</Text>
                          ) : null}
                          {blocker.migration ? (
                            <Link to="/__dev/database-migration">
                              查看数据库与运行状态
                            </Link>
                          ) : null}
                        </div>
                      ))}
                    </section>
                  ) : null}
                  <details className="erp-dev-data-disclosure">
                    <summary>目标与执行前置</summary>
                    <Descriptions
                      size="small"
                      column={2}
                      items={[
                        {
                          key: 'target',
                          label: '目标',
                          children:
                            availability.target?.status === 'available'
                              ? availability.target.safeTarget
                              : operationTargetLabel(
                                  selectedOperationTargetKey
                                ),
                        },
                        {
                          key: 'cleanup',
                          label: '保留方式',
                          children: selectedProfileCopy.cleanupBoundary,
                        },
                      ]}
                    />
                    {selectedProfile.requiredEnvironment.length > 0 ? (
                      <Text type="secondary">
                        所需环境：
                        {selectedProfile.requiredEnvironment.join('、')}
                      </Text>
                    ) : null}
                    <ol className="erp-dev-data-step-list">
                      {selectedProfileCopy.steps.map((step) => (
                        <li key={step}>{step}</li>
                      ))}
                    </ol>
                  </details>
                </div>
                <details className="erp-dev-data-disclosure">
                  <summary>
                    业务链与场景范围 · {summary.acceptancePlan.chainCount}{' '}
                    条业务链 / {summary.acceptancePlan.scenarioCount} 项场景
                  </summary>
                  <AcceptancePlanReview
                    plan={summary.acceptancePlan}
                    selectedChainKey={selectedChainKey}
                    onSelectChain={setSelectedChainKey}
                  />
                </details>
                <details className="erp-dev-data-disclosure">
                  <summary>环境与数据合同</summary>
                  <DatasetEnvironmentContract summary={summary} />
                </details>
              </DataSection>
            </section>
            <section
              hidden={dataView !== 'confirm'}
              id="dev-data-panel-confirm"
              role="tabpanel"
              aria-labelledby="dev-data-tab-confirm"
            >
              {currentOperation ? (
                <DataSection
                  id="dev-data-current-heading"
                  title="当前批次"
                  description="核对目标、数据范围与保留方式后确认执行。"
                  extra={
                    currentOperation.status === 'ready' ? (
                      <Button
                        type="primary"
                        icon={<PlayCircleOutlined aria-hidden="true" />}
                        disabled={!canExecuteCurrent}
                        onClick={() => {
                          setConfirmation(
                            currentIsScenarioDemo
                              ? currentOperation.confirmationRequired
                              : ''
                          )
                          setConfirmOpen(true)
                        }}
                      >
                        {currentIsScenarioDemo ? '确认并生成' : '确认执行'}
                      </Button>
                    ) : null
                  }
                >
                  <OperationDetail
                    operation={currentOperation}
                    acceptancePlan={summary.acceptancePlan}
                    compact
                  />
                  {currentOperation.status === 'ready' && !canExecuteCurrent ? (
                    <Alert
                      type="warning"
                      showIcon
                      message="执行前置尚未通过"
                      description={
                        prepareBlockingReason ||
                        availability.blockers
                          .map((issue) => issue.message)
                          .join('；')
                      }
                    />
                  ) : null}
                  {currentOperation.terminal ? (
                    <div className="erp-dev-data-result" role="status">
                      <Text>
                        {currentOperation.status === 'passed'
                          ? DEV_DATA_PREPARATION_PROFILE_COPY[
                              currentOperation.profileKey
                            ].successDescription
                          : '本次结果已保留。处理问题并重新检查后，可以准备新的计划。'}
                      </Text>
                      <Space>
                        <Button onClick={() => selectDataView('receipts')}>
                          查看执行记录
                        </Button>
                        <Button onClick={() => selectDataView('scope')}>
                          返回准备数据
                        </Button>
                      </Space>
                    </div>
                  ) : null}
                </DataSection>
              ) : null}
            </section>
            <section
              hidden={dataView !== 'receipts'}
              id="dev-data-panel-receipts"
              role="tabpanel"
              aria-labelledby="dev-data-tab-receipts"
            >
              <DataSection
                id="dev-data-records-heading"
                title="执行记录"
                description="按批次核对执行结果、耗时和清理记录。"
                extra={
                  <Tag>
                    {historyItems.length} 条当前回执
                    {historicalOperationReferences.length > 0
                      ? ` · ${historicalOperationReferences.length} 条旧合同记录`
                      : ''}
                  </Tag>
                }
              >
                {currentOperation?.terminal ? (
                  <section
                    className="erp-dev-data-latest-result"
                    aria-label="本次回执"
                  >
                    <Text strong>本次回执</Text>
                    <OperationDetail
                      operation={currentOperation}
                      acceptancePlan={summary.acceptancePlan}
                    />
                  </section>
                ) : null}
                {historyItems.length > 0 ? (
                  <Collapse items={historyItems} />
                ) : (
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description="尚无数据准备回执"
                  />
                )}
                {historicalOperationReferences.length > 0 ? (
                  <details className="erp-dev-data-history">
                    <summary>
                      展开旧合同与未识别合同记录（
                      {historicalOperationReferences.length}）
                    </summary>
                    <Alert
                      type="info"
                      showIcon
                      message="这些记录只用于追溯"
                      description="旧数据合同和无法识别版本的历史记录不会参与当前数据合同的执行、恢复选择或环境就绪判断。"
                    />
                    <List
                      size="small"
                      dataSource={historicalOperationReferences}
                      renderItem={(operation) => (
                        <List.Item>
                          <Space wrap>
                            <Text>
                              {
                                DEV_DATA_PREPARATION_PROFILE_COPY[
                                  operation.profileKey
                                ].title
                              }
                            </Text>
                            <StatusTag status={operation.status} />
                            <Tag>
                              {operation.contract.classification ===
                              'historical'
                                ? '旧合同'
                                : '合同未识别'}
                            </Tag>
                            <Text type="secondary">
                              {operation.contract.dataVersion || '版本未记录'} ·{' '}
                              {operation.contract.datasetRunId || '批次未记录'}
                            </Text>
                            <DevTimestamp
                              value={operation.updatedAt}
                              action="最后记录于"
                              missing="时间未证明"
                            />
                          </Space>
                        </List.Item>
                      )}
                    />
                  </details>
                ) : null}
              </DataSection>
            </section>
          </div>
        ) : null}
      </main>

      <Modal
        title={
          currentIsScenarioDemo
            ? '确认生成业务场景测试数据'
            : '确认执行不可变数据计划'
        }
        open={confirmOpen}
        okText={currentIsScenarioDemo ? '确认生成' : '执行固定计划'}
        cancelText="取消"
        confirmLoading={executing}
        cancelButtonProps={{ disabled: executing }}
        closable={!executing}
        maskClosable={!executing}
        keyboard={!executing}
        okButtonProps={{
          danger: !currentIsScenarioDemo,
          disabled:
            !currentOperation ||
            !canExecuteCurrent ||
            currentExecutionConfirmation !==
              currentOperation.confirmationRequired,
        }}
        onOk={handleExecute}
        onCancel={() => {
          if (executing) return
          setConfirmOpen(false)
          setConfirmation('')
        }}
        destroyOnHidden
      >
        <Space direction="vertical" size={12} className="erp-dev-data-confirm">
          <Alert
            type="warning"
            showIcon
            message={
              currentIsScenarioDemo
                ? '确认后按当前数据合同生成业务场景数据'
                : '确认后才会写入固定目标'
            }
            description={
              currentOperation
                ? DEV_DATA_PREPARATION_PROFILE_COPY[currentOperation.profileKey]
                    .confirmationDescription
                : ''
            }
          />
          {currentIsScenarioDemo ? (
            <Descriptions
              size="small"
              column={1}
              bordered
              items={[
                {
                  key: 'customer',
                  label: '甲方',
                  children: customerScope.customer?.label || '未选择',
                },
                {
                  key: 'target',
                  label: '固定目标',
                  children:
                    currentOperation?.targetSummary.safeTarget || '未证明',
                },
                {
                  key: 'release',
                  label: '已核对 release',
                  children: (
                    <Text code copyable>
                      {currentOperation?.targetSummary.releaseSha || '未证明'}
                    </Text>
                  ),
                },
                {
                  key: 'database',
                  label: '数据库身份',
                  children:
                    currentOperation?.targetSummary.databaseName || '未证明',
                },
                {
                  key: 'migration',
                  label: 'migration',
                  children:
                    currentOperation?.targetSummary.migrationVersion ||
                    '未证明',
                },
                {
                  key: 'customer-config',
                  label: '客户配置 revision',
                  children:
                    currentOperation?.targetSummary.customerConfigRevision ||
                    '未证明',
                },
                {
                  key: 'dataset',
                  label: '固定数据合同',
                  children: (
                    <>
                      {currentOperation?.targetSummary.datasetVersion ||
                        '未证明'}{' '}
                      /{' '}
                      {currentOperation?.targetSummary.datasetRunId || '未证明'}
                    </>
                  ),
                },
                {
                  key: 'semantic-digest',
                  label: '语义摘要',
                  children: (
                    <Text code copyable>
                      {currentOperation?.targetSummary.semanticDigest ||
                        '未证明'}
                    </Text>
                  ),
                },
                {
                  key: 'rollback',
                  label: '回滚或清理点',
                  children:
                    currentOperation?.targetSummary.rollbackPoint || '未证明',
                },
                {
                  key: 'scope',
                  label: '数据范围',
                  children:
                    DEV_DATA_PREPARATION_PROFILE_COPY[
                      DEV_DATA_PREPARATION_PROFILE_KEYS.scenarioDemo
                    ].scope,
                },
                {
                  key: 'retention',
                  label: '保留方式',
                  children: '长期保留，只向前补齐，不提供一键清空或重置',
                },
              ]}
            />
          ) : (
            <>
              <Text>请完整输入以下 exact confirmation：</Text>
              <Text code copyable className="erp-dev-data-confirm__value">
                {currentOperation?.confirmationRequired || ''}
              </Text>
              <Input
                autoFocus
                value={confirmation}
                maxLength={400}
                placeholder="输入完整确认文本"
                aria-label="不可变计划确认文本"
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </>
          )}
        </Space>
      </Modal>
    </div>
  )
}
