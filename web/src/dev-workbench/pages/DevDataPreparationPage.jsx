import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  CheckCircleOutlined,
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
import { useSearchParams } from 'react-router-dom'
import { message } from '@/common/utils/antdApp'
import DevCustomerScopeSelector from '../components/DevCustomerScopeSelector.jsx'
import DevPageNav from '../components/DevPageNav.jsx'
import DevTimestamp from '../components/DevTimestamp.jsx'
import {
  DEV_DATA_PREPARATION_PROFILE_COPY,
  DEV_DATA_PREPARATION_PROFILE_KEYS,
  DEV_DATA_PREPARATION_PROFILE_QUERY_KEY,
  DEV_DATA_PREPARATION_SOURCE_PATH,
  DEV_DATA_PREPARATION_TARGET_KEYS,
  DEV_DATA_PREPARATION_TARGET_QUERY_KEY,
  buildDevDataPreparationSearch,
  createDevDataPreparationClient,
  dataPreparationStatusPresentation,
  resolveDataPreparationExecutionConfirmation,
  resolveDataPreparationPrepareIntent,
  selectRecoverableDataPreparationOperation,
} from '../config/devDataPreparation.mjs'
import useDevCustomerScope from '../hooks/useDevCustomerScope.mjs'

const { Paragraph, Text, Title } = Typography
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

function summaryTargetKey(profileKey, scenarioTargetKey) {
  if (profileKey === DEV_DATA_PREPARATION_PROFILE_KEYS.coreDemo) {
    return 'coreDemo'
  }
  if (profileKey === DEV_DATA_PREPARATION_PROFILE_KEYS.fullAcceptance) {
    return 'fullAcceptance'
  }
  return scenarioTargetKey === DEV_DATA_PREPARATION_TARGET_KEYS.customerTrial133
    ? 'scenarioDemo133'
    : 'scenarioDemo'
}

function shortHash(value) {
  return typeof value === 'string' && value.length >= 12
    ? value.slice(0, 12)
    : '未证明'
}

function operationTargetLabel(targetKey) {
  if (targetKey === DEV_DATA_PREPARATION_TARGET_KEYS.customerTrial133) {
    return '133 测试'
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
              label: '本步骤合法场景',
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
          ['合法场景', plan.scenarioCount],
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
            选择只影响计划下钻；完整回归始终执行全部已登记合法场景。
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
      <details className="erp-dev-data-reuse-rules">
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
      </details>
    </div>
  )
}

function WorkflowStep({ number, title, description, extra, children }) {
  return (
    <section
      className="erp-dev-data-workflow-step"
      aria-labelledby={`dev-data-step-${number}`}
    >
      <span className="erp-dev-data-workflow-step__number" aria-hidden="true">
        {number}
      </span>
      <div className="erp-dev-data-workflow-step__head">
        <div>
          <Title level={2} id={`dev-data-step-${number}`}>
            {title}
          </Title>
          <Paragraph>{description}</Paragraph>
        </div>
        {extra}
      </div>
      <div className="erp-dev-data-workflow-step__body">{children}</div>
    </section>
  )
}

function currentPassedOperation(summary, profileKey, predicate) {
  return summary.operations.find(
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
      title: '133 试用数据',
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

function ProfileOption({ profile, selected, disabled, onSelect }) {
  const copy = DEV_DATA_PREPARATION_PROFILE_COPY[profile.key]
  const className = [
    'erp-dev-data-profile',
    selected ? 'erp-dev-data-profile--selected' : '',
    profile.key === DEV_DATA_PREPARATION_PROFILE_KEYS.fullAcceptance
      ? 'erp-dev-data-profile--primary'
      : 'erp-dev-data-profile--secondary',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <div
      className={className}
      onClick={() => {
        if (!disabled) onSelect(profile.key)
      }}
    >
      <Radio value={profile.key}>
        <span className="erp-dev-data-profile__radio-label">{copy.title}</span>
      </Radio>
      <div className="erp-dev-data-profile__head">
        <Text type="secondary">{copy.shortTitle}</Text>
        <Tag color={copy.badgeColor}>{copy.badgeLabel}</Tag>
      </div>
      <Text>{copy.purpose}</Text>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-element-interactions -- native disclosure clicks must not select the surrounding profile card. */}
      <details
        className="erp-dev-data-profile__details"
        onClick={(event) => event.stopPropagation()}
      >
        <summary>查看数据范围与退出方式</summary>
        <Text type="secondary">数据范围：{copy.scope}</Text>
        <Text type="secondary">{copy.retention}</Text>
        <Text type="secondary">{copy.cleanup}</Text>
        <div className="erp-dev-data-profile__requirements">
          {profile.requiredEnvironment.map((requirement) => (
            <Tag key={requirement}>{requirement}</Tag>
          ))}
        </div>
      </details>
    </div>
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
        label: '流程运行时',
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
  const [technicalOpen, setTechnicalOpen] = useState(
    compact && operation.status === 'ready'
  )
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
  const client = useMemo(() => createDevDataPreparationClient(), [])
  const requestVersionRef = useRef(0)
  const refreshAbortRef = useRef(null)
  const currentOperationIdRef = useRef('')
  const prepareIntentRef = useRef(null)
  const [summary, setSummary] = useState(null)
  const [selectedProfileKey, setSelectedProfileKey] = useState(() => {
    const requested = searchParams.get(DEV_DATA_PREPARATION_PROFILE_QUERY_KEY)
    return Object.values(DEV_DATA_PREPARATION_PROFILE_KEYS).includes(requested)
      ? requested
      : DEV_DATA_PREPARATION_PROFILE_KEYS.fullAcceptance
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
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [pollError, setPollError] = useState('')
  const [preparing, setPreparing] = useState(false)
  const [executing, setExecuting] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [confirmation, setConfirmation] = useState('')

  const updateOperation = useCallback((operation) => {
    currentOperationIdRef.current = operation.id
    setCurrentOperation(operation)
    setSummary((current) =>
      current
        ? {
            ...current,
            operations: upsertOperation(operation, current.operations),
          }
        : current
    )
  }, [])

  const refresh = useCallback(async () => {
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
      const nextSummary = await summaryClient.summary()
      if (requestVersion !== requestVersionRef.current) return
      setSummary(nextSummary)
      const recoveredOperation = selectRecoverableDataPreparationOperation(
        nextSummary.operations,
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
          prepareIntentRef.current?.profileKey === recoveredOperation.profileKey
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
  }, [
    customerScope.customerKey,
    selectedProfileKey,
    selectedScenarioTargetKey,
    setSearchParams,
  ])

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

  const profiles = summary?.profiles || []
  const selectedProfile = profiles.find(
    (profile) => profile.key === selectedProfileKey
  )
  const selectedProfileCopy =
    DEV_DATA_PREPARATION_PROFILE_COPY[selectedProfileKey]
  const selectedOperationTargetKey = profileTargetKey(
    selectedProfileKey,
    selectedScenarioTargetKey
  )
  const selectedTarget =
    summary?.target?.[
      summaryTargetKey(selectedProfileKey, selectedScenarioTargetKey)
    ]
  const repositoryBlocked =
    selectedProfile?.exactCleanCommitRequired === true &&
    (!summary?.repository || summary.repository.dirty)
  const hasActiveOperation = (summary?.operations || []).some(
    (operation) =>
      operation.profileKey === selectedProfileKey &&
      operation.targetSummary.targetKey === selectedOperationTargetKey &&
      !operation.terminal
  )
  const currentIsScenarioDemo =
    currentOperation?.profileKey ===
    DEV_DATA_PREPARATION_PROFILE_KEYS.scenarioDemo
  const canPrepare =
    Boolean(selectedProfile) &&
    (selectedTarget?.status === 'available' ||
      (selectedIsScenarioDemo &&
        selectedOperationTargetKey ===
          DEV_DATA_PREPARATION_TARGET_KEYS.customerTrial133 &&
        selectedTarget?.status === 'not_proven')) &&
    !repositoryBlocked &&
    !hasActiveOperation &&
    (!selectedIsScenarioDemo || customerReady) &&
    !loading
  const canExecuteCurrent =
    currentOperation?.status === 'ready' &&
    currentOperation?.targetSummary?.targetKey === selectedOperationTargetKey &&
    (selectedTarget?.status === 'available' ||
      selectedOperationTargetKey ===
        DEV_DATA_PREPARATION_TARGET_KEYS.customerTrial133) &&
    !repositoryBlocked &&
    (!currentIsScenarioDemo || customerReady)
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
    setConfirmation('')
  }

  const prepareBlockingReason =
    selectedIsScenarioDemo && !customerReady
      ? '先选择已登记甲方，再准备对应的固定业务场景数据'
      : repositoryBlocked
        ? '完整验收只接受 clean exact commit'
        : selectedTarget?.status === 'blocked'
          ? '固定目标预检已阻断，请先处理预检问题'
          : hasActiveOperation
            ? '该档位已有未结束 operation，请先等待终态'
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
      updateOperation(result.operation)
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
      setActionError(error?.message || '计划准备失败')
    } finally {
      setPreparing(false)
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
      updateOperation(result.operation)
      setConfirmOpen(false)
      setConfirmation('')
      message.success('固定计划已启动，正在跟踪 operation 回执')
    } catch (error) {
      setActionError(error?.message || '固定计划执行失败')
    } finally {
      setExecuting(false)
    }
  }

  const historyItems = (summary?.operations || []).map((operation) => ({
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

  return (
    <div
      className="erp-dev-hub-page erp-dev-workspace-page erp-dev-data-page"
      style={{
        '--dev-data-border': token.colorBorder,
        '--dev-data-primary': token.colorPrimary,
        '--dev-data-selected': token.colorPrimaryBg,
        '--dev-data-surface': token.colorBgContainer,
        '--dev-data-muted': token.colorTextSecondary,
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
              准备回归数据
            </Title>
            <Paragraph className="erp-dev-hub-summary">
              默认按最新业务链合同建立完整回归新批次；先看合法步骤和场景，再确认执行并查看真实耗时。页面不接收自定义目标、命令或凭据。
            </Paragraph>
          </div>
        </div>
        <Space direction="vertical" align="end" size={4}>
          <Button icon={<ReloadOutlined />} loading={loading} onClick={refresh}>
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
        <details className="erp-dev-data-local-boundary">
          <summary>
            <SafetyCertificateOutlined aria-hidden="true" />
            仅用于本机开发环境
          </summary>
          <Paragraph>
            该入口以当前操作系统用户和固定后端目标为边界；它不进入正式 ERP
            菜单，也不冒充 ERP RBAC 授权。
          </Paragraph>
        </details>

        {loadError ? (
          <Alert
            type="error"
            showIcon
            message="预检读取失败"
            description={
              <Space direction="vertical" size={8}>
                <Text>{loadError}</Text>
                <Button onClick={refresh}>重新读取预检</Button>
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

        {summary?.issues?.length > 0 ? (
          <Alert
            type="warning"
            showIcon
            message="预检发现问题"
            description={issueText(summary.issues)}
          />
        ) : null}

        {loading && !summary ? (
          <Card>
            <Skeleton active paragraph={{ rows: 8 }} />
          </Card>
        ) : null}

        {summary ? (
          <div className="erp-dev-data-workflow">
            <DatasetEnvironmentContract summary={summary} />
            <WorkflowStep
              number="1"
              title="确认完整回归能否开始"
              description="先看完整回归的 clean commit 与隔离库结论；其他联调目标只作次要参考。"
              extra={
                <Tag>
                  {
                    Object.values(summary.target).filter(
                      (target) => target.status === 'available'
                    ).length
                  }{' '}
                  / {Object.keys(summary.target).length} 个登记目标可用
                </Tag>
              }
            >
              <div
                className="erp-dev-data-preflight-list"
                aria-label="数据准备预检摘要"
              >
                <div className="erp-dev-data-preflight-row">
                  <div>
                    <Text strong>当前代码现场</Text>
                    <Text type="secondary">
                      完整验收必须绑定干净且精确的提交；其他档位仍按各自固定边界执行。
                    </Text>
                  </div>
                  {summary.repository ? (
                    <Tag
                      color={summary.repository.dirty ? 'warning' : 'success'}
                    >
                      {summary.repository.dirty ? '有未提交改动' : '干净现场'}
                    </Tag>
                  ) : (
                    <Tag color="error">身份未证明</Tag>
                  )}
                  <details>
                    <summary>查看提交身份</summary>
                    <Text code>{shortHash(summary.repository?.commit)}</Text>
                  </details>
                </div>
                {profiles.map((profile) => {
                  const copy = DEV_DATA_PREPARATION_PROFILE_COPY[profile.key]
                  const target = summary.target[copy.targetKey]
                  return (
                    <div
                      className="erp-dev-data-preflight-row"
                      key={profile.key}
                    >
                      <div>
                        <Text strong>{copy.targetTitle}</Text>
                        <Text type="secondary">{copy.purpose}</Text>
                      </div>
                      <StatusTag status={target.status} />
                      <details>
                        <summary>查看目标身份</summary>
                        <Text>{target.safeTarget}</Text>
                        <Text>数据库：{target.databaseName}</Text>
                        <Text>Migration：{target.migrationVersion}</Text>
                        <Text>客户配置：{target.customerConfigRevision}</Text>
                        <Text code>{shortHash(target.targetFingerprint)}</Text>
                      </details>
                    </div>
                  )
                })}
                <div className="erp-dev-data-preflight-row">
                  <div>
                    <Text strong>133 测试场景目标</Text>
                    <Text type="secondary">
                      当前页面只保存登记身份；点击准备后才做权威 target
                      preflight，不会自动创建写操作。
                    </Text>
                  </div>
                  <StatusTag status={summary.target.scenarioDemo133.status} />
                  <details>
                    <summary>查看登记目标</summary>
                    <Text>{summary.target.scenarioDemo133.safeTarget}</Text>
                    <Text>
                      数据库：{summary.target.scenarioDemo133.databaseName}
                    </Text>
                    <Text>
                      最低 Migration：
                      {summary.target.scenarioDemo133.migrationVersion}
                    </Text>
                    <Text>
                      期望客户配置：
                      {summary.target.scenarioDemo133.customerConfigRevision}
                    </Text>
                  </details>
                </div>
              </div>
            </WorkflowStep>

            <WorkflowStep
              number="2"
              title="核对最新业务链与数据范围"
              description="选择业务链，展开步骤绑定的责任、状态、动作、结果和 Fact；只查看已登记合法场景。"
              extra={<Text type="secondary">不支持自定义参数</Text>}
            >
              <AcceptancePlanReview
                plan={summary.acceptancePlan}
                selectedChainKey={selectedChainKey}
                onSelectChain={setSelectedChainKey}
              />
              <div className="erp-dev-data-profile-heading">
                <div>
                  <Text strong>选择本次准备方式</Text>
                  <Text type="secondary">
                    完整回归每次建立新隔离批次；共享基础和长期场景只用于日常联调。
                  </Text>
                </div>
                <Tag color="green">完整回归优先</Tag>
              </div>
              <Radio.Group
                className="erp-dev-data-profile-group"
                value={selectedProfileKey}
                disabled={preparing || executing}
                onChange={(event) => selectProfile(event.target.value)}
              >
                {profiles.map((profile) => (
                  <ProfileOption
                    key={profile.key}
                    profile={profile}
                    selected={selectedProfileKey === profile.key}
                    disabled={preparing || executing}
                    onSelect={selectProfile}
                  />
                ))}
              </Radio.Group>
              {selectedIsScenarioDemo ? (
                <Space
                  direction="vertical"
                  size={12}
                  className="erp-dev-data-target-choice"
                >
                  <div className="erp-dev-data-target-choice__heading">
                    <Text strong>选择本次固定目标</Text>
                    <Text type="secondary">
                      这只绑定当前 Scenario
                      operation，不会静默改变其他页面或操作的写入目标。
                    </Text>
                  </div>
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
                        label: '133 测试',
                      },
                    ]}
                  />
                  <DevCustomerScopeSelector
                    scope={customerScope}
                    onChange={customerScope.selectCustomer}
                    disabled={preparing || executing}
                    label="业务场景甲方"
                    note="仅业务场景模拟数据按甲方选择；当前永绅对应固定 yoyoosun V6 场景批次。"
                    invalidDescription="当前甲方没有登记固定场景数据；业务场景的准备与执行已停止，其他数据准备方式不受影响。"
                  />
                </Space>
              ) : null}
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
                  icon={
                    selectedIsScenarioDemo ? (
                      <PlayCircleOutlined />
                    ) : (
                      <FileDoneOutlined />
                    )
                  }
                  disabled={!canPrepare}
                  loading={preparing}
                  onClick={handlePrepare}
                >
                  {selectedProfileCopy.prepareButtonLabel}
                </Button>
              </div>
            </WorkflowStep>

            <WorkflowStep
              number="3"
              title="准备并确认新批次"
              description="完整回归计划同时绑定当前业务链摘要、clean exact commit 和隔离目标；只有确认后才会写入。"
              extra={
                currentOperation?.status === 'ready' ? (
                  <Button
                    type="primary"
                    danger={!currentIsScenarioDemo}
                    icon={<PlayCircleOutlined />}
                    disabled={!canExecuteCurrent}
                    title={
                      canExecuteCurrent
                        ? currentIsScenarioDemo
                          ? '核对固定目标后确认生成'
                          : '输入 exact confirmation 后执行'
                        : '当前目标或仓库预检已阻断'
                    }
                    onClick={() => {
                      setConfirmation(
                        currentIsScenarioDemo
                          ? currentOperation.confirmationRequired
                          : ''
                      )
                      setConfirmOpen(true)
                    }}
                  >
                    {currentIsScenarioDemo
                      ? '确认并生成'
                      : '输入 exact confirmation 执行'}
                  </Button>
                ) : null
              }
            >
              {currentOperation ? (
                <>
                  <OperationDetail
                    key={`${currentOperation.id}:${currentOperation.status}`}
                    operation={currentOperation}
                    acceptancePlan={summary.acceptancePlan}
                    compact
                  />
                  {currentOperation.terminal &&
                  currentOperation.status !== 'passed' ? (
                    <Alert
                      className="erp-dev-data-recovery"
                      type="warning"
                      showIcon
                      message="已保留终态回执，不会自动重试"
                      description="先在页面外处理阻断，再刷新预检并准备新计划；不得复用旧 plan hash 或确认文本。"
                    />
                  ) : null}
                  {currentOperation.status === 'passed' ? (
                    <Alert
                      className="erp-dev-data-recovery"
                      type="success"
                      showIcon
                      icon={<CheckCircleOutlined />}
                      message="数据准备已完成"
                      description={
                        DEV_DATA_PREPARATION_PROFILE_COPY[
                          currentOperation.profileKey
                        ].successDescription
                      }
                    />
                  ) : null}
                </>
              ) : (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="核对业务链并准备新批次后，在这里确认目标、固定步骤和阻断。"
                />
              )}
            </WorkflowStep>

            <WorkflowStep
              number="4"
              title="查看回执与耗时"
              description="查看实际执行总耗时、完整回归的 9 个造数阶段耗时和自动清理读回；旧回执只证明对应旧计划。"
              extra={<Tag>{historyItems.length} 条回执</Tag>}
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
                <details className="erp-dev-data-history">
                  <summary>展开历史回执（{historyItems.length}）</summary>
                  <Collapse items={historyItems} />
                </details>
              ) : (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description="尚无数据准备回执"
                />
              )}
            </WorkflowStep>
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
                ? '确认后生成固定 V6 业务场景数据'
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
