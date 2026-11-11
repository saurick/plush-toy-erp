import React from 'react'
import { DatabaseOutlined, FileDoneOutlined, ReloadOutlined } from '@ant-design/icons'
import {
  Alert,
  Button,
  Card,
  Collapse,
  Descriptions,
  Input,
  List,
  Radio,
  Skeleton,
  Space,
  Tag,
  Typography,
} from 'antd'
import Empty from '@/common/components/empty/AppEmpty.jsx'
import Modal from '@/common/components/modal/AppModal'
import DevCustomerScopeSelector from '../components/DevCustomerScopeSelector.jsx'
import DevPageHeader from '../components/DevPageHeader.jsx'
import DevPageNav from '../components/DevPageNav.jsx'
import DevTaskNav from '../components/DevTaskNav.jsx'
import DevTimestamp from '../components/DevTimestamp.jsx'
import {
  DEV_DATA_PREPARATION_PROFILE_COPY,
  DEV_DATA_PREPARATION_PROFILE_KEYS,
  DEV_DATA_PREPARATION_TARGET_KEYS,
  dataPreparationStatusPresentation,
} from '../config/devDataPreparation.mjs'
import { DATA_VIEW_ITEMS, useDataPreparation } from './data-preparation/useDataPreparation.jsx'
import { WorkbenchEmpty, WorkbenchFacts, WorkbenchNotice, WorkbenchReading, WorkbenchSection, WorkbenchToolbar } from '../components/WorkbenchPattern.jsx'

const { Text, Title } = Typography

function operationTargetLabel(targetKey) {
  if (targetKey === DEV_DATA_PREPARATION_TARGET_KEYS.customerTrial133) {
    return '服务器 Demo'
  }
  if (targetKey === DEV_DATA_PREPARATION_TARGET_KEYS.isolatedLocal) {
    return '本地隔离验收'
  }
  return targetKey === DEV_DATA_PREPARATION_TARGET_KEYS.localDevelopment ? '本地开发' : '目标未确认'
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

function formatDuration(durationMs) {
  if (!Number.isFinite(durationMs)) return '尚未记录'
  if (durationMs < 1000) return `${Math.round(durationMs)} 毫秒`
  const seconds = durationMs / 1000
  if (seconds < 60) return `${seconds.toFixed(seconds < 10 ? 1 : 0)} 秒`
  const minutes = Math.floor(seconds / 60)
  const remainder = Math.round(seconds % 60)
  return `${minutes} 分 ${remainder} 秒`
}

function AcceptancePlanFacts({ plan }) {
  return (
    <WorkbenchFacts
      aria-label="业务场景覆盖摘要"
      items={[
        { label: '业务链', value: plan.chainCount },
        { label: '场景', value: plan.scenarioCount },
        { label: '链路步骤', value: plan.stepCount },
        { label: '造数阶段', value: plan.dataStageCount },
        { label: '页面目标', value: plan.catalogTargetCount },
      ]}
    />
  )
}

function AcceptancePlanReview({ plan, selectedChainKey, onSelectChain, regression }) {
  const selectedChain = plan.chains.find(
    (chain) => chain.key === selectedChainKey
  ) || plan.chains[0]
  const scenarioLabelByKey = new Map(
    plan.scenarioKinds.map((scenario) => [scenario.key, scenario.label])
  )
  const chainScenarioLabels = (selectedChain?.scenarioKinds || []).map((kind) => scenarioLabelByKey.get(kind) || kind)
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
          column={regression ? 1 : { xs: 1, lg: 2 }}
          classNames={regression ? { label: 'erp-dev-regression-step-label' } : undefined}
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
              label: regression ? '业务事实' : 'Fact',
              children: step.facts.join('；'),
            },
            {
              key: 'scenarios',
              label: regression ? '覆盖场景' : '本步骤场景合同',
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
      {regression ? null : <AcceptancePlanFacts plan={plan} />}
      <WorkbenchReading
        label="业务链范围目录"
        detailLabel="业务链详情"
        items={plan.chains.map((chain) => ({ value: chain.key, label: chain.label }))}
        value={selectedChain?.key}
        onChange={onSelectChain}
      >
        {selectedChain ? (
          <WorkbenchSection flat headingLevel={3} title={selectedChain.label} description={regression ? `${stepItems.length} 个步骤` : undefined}>
            <Text>{selectedChain.summary}</Text>
            {regression ? (
              <Text type="secondary">覆盖场景：{chainScenarioLabels.join('、')}</Text>
            ) : (
              <Space wrap size={[4, 4]}>
                {selectedChain.scenarioKinds.map((kind) => (
                  <Tag className="erp-dev-accent-tag" key={kind}>{scenarioLabelByKey.get(kind) || kind}</Tag>
                ))}
              </Space>
            )}
            <Collapse key={selectedChain.key} accordion size="small" items={stepItems} />
          </WorkbenchSection>
        ) : <WorkbenchEmpty title="尚无业务链范围" />}
      </WorkbenchReading>
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
      '这是数据核对结果，仍需按岗位手测页面和业务操作。',
    items: [
      {
        key: 'targetKey',
        label: '目标环境',
        children: operationTargetLabel(readback.targetKey),
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
    column: 1,
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

function OperationDetail({ operation, acceptancePlan }) {
  const profileCopy = DEV_DATA_PREPARATION_PROFILE_COPY[operation.profileKey]
  const fullAcceptance = operation.profileKey === DEV_DATA_PREPARATION_PROFILE_KEYS.fullAcceptance
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
      {operation.terminal ? <OperationReadback operation={operation} acceptancePlan={acceptancePlan} /> : null}
      <details className="erp-dev-disclosure erp-dev-data-operation-technical">
        <summary>排查信息</summary>
        <Descriptions
          size="small"
          column={fullAcceptance ? 1 : { xs: 1, md: 2 }}
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
              label: '执行编号',
              children: (
                <Text code copyable>
                  {operation.runId}
                </Text>
              ),
            },
            {
              key: 'datasetIdentity',
              label: '数据合同标识',
              children: (
                <Text code copyable>
                  {`${operation.contract.dataVersion} / ${operation.contract.datasetRunId}`}
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
            ...(operation.readback?.backupReceipt ? [{
              key: 'backup',
              label: '执行前备份',
              children: operation.readback.backupReceipt.backupAlias,
            }] : []),
          ]}
        />
        <List
          size="small"
          aria-label="状态事件"
          dataSource={operation.events}
          renderItem={(event) => (
            <List.Item>
              <Space wrap>
                <DevTimestamp value={event.at} />
                <Text>{event.message}</Text>
              </Space>
            </List.Item>
          )}
        />
      </details>
    </div>
  )
}

function DataPreparationHistory({ summary, profileKey, onBack, stale }) {
  const daily = profileKey === DEV_DATA_PREPARATION_PROFILE_KEYS.scenarioDemo
  const belongs = (operation) => daily
    ? operation.profileKey !== DEV_DATA_PREPARATION_PROFILE_KEYS.fullAcceptance
    : operation.profileKey === profileKey
  const operations = summary.currentOperations.filter(belongs)
  const references = [...summary.unresolvedOperations, ...summary.historicalOperations].filter(belongs)
  const items = operations.map((operation) => ({
    key: operation.id,
    label: (
      <div className="erp-dev-data-history-label">
        {daily ? (
          <>
            <span>{DEV_DATA_PREPARATION_PROFILE_COPY[operation.profileKey].title}</span>
            <Tag>{operationTargetLabel(operation.targetSummary.targetKey)}</Tag>
          </>
        ) : null}
        <StatusTag status={operation.status} />
        <DevTimestamp value={operation.updatedAt} action={operationUpdateAction(operation)} />
      </div>
    ),
    children: <OperationDetail operation={operation} acceptancePlan={summary.acceptancePlan} />,
  }))
  const shownItems = daily ? items : items.slice(0, 1)
  const moreItems = daily ? [] : items.slice(1)
  const moreCount = moreItems.length + references.length
  const referenceList = references.length ? (
    <WorkbenchSection
      flat
      headingLevel={3}
      title={daily ? '历史记录' : undefined}
      description="这里保留以前的执行结果。标记为“结果未证明”的记录需按原目标和日志核对。"
    >
      <List
        size="small"
        dataSource={references}
        renderItem={(operation) => (
          <List.Item>
            <details className="erp-dev-disclosure erp-dev-data-history">
              <summary>
                <Space wrap size={[8, 4]}>
                  {daily ? <span>{DEV_DATA_PREPARATION_PROFILE_COPY[operation.profileKey].title}</span> : null}
                  <Tag>{operationTargetLabel(operation.targetKey)}</Tag>
                  <StatusTag status={operation.status} />
                  <DevTimestamp value={operation.updatedAt} />
                </Space>
              </summary>
              <WorkbenchNotice title="原记录" description={<Text code copyable>{operation.id}</Text>} />
            </details>
          </List.Item>
        )}
      />
    </WorkbenchSection>
  ) : null
  return (
    <WorkbenchSection flat title="执行记录" description={stale ? '显示上次读取的记录。' : undefined}>
      {shownItems.length ? <Collapse size={daily ? undefined : 'small'} items={shownItems} /> : null}
      {daily ? referenceList : moreCount ? (
        <details className="erp-dev-disclosure erp-dev-regression-records-more">
          <summary>{shownItems.length ? '更多记录' : '历史记录'} · {moreCount} 条</summary>
          {moreItems.length ? <Collapse accordion size="small" items={moreItems} /> : null}
          {referenceList}
        </details>
      ) : null}
      {!items.length && !references.length ? (
        daily ? (
          <WorkbenchEmpty title="暂无执行记录" description="补齐手测数据后，可在这里查看结果。" action={<Button onClick={onBack}>返回准备数据</Button>} />
        ) : <Text type="secondary">暂无执行记录</Text>
      ) : null}
    </WorkbenchSection>
  )
}

function DataPreparationWorkspace({ profileKey }) {
  const daily = profileKey === DEV_DATA_PREPARATION_PROFILE_KEYS.scenarioDemo
  const copy = DEV_DATA_PREPARATION_PROFILE_COPY[profileKey]
  const {
    actionError, availability, canPrepare, canExecute, confirmOpen, confirmation,
    currentOperation, customerScope, dataView, executing, executionConfirmation,
    handleExecute, handlePrepare, hasActiveOperation, loading, loadError, pollError,
    preparing, refresh, selectedChainKey, selectedTargetKey, summary,
    closeConfirm, selectTarget, setConfirmation, selectDataView, setSelectedChainKey,
  } = useDataPreparation(profileKey)
  const busy = preparing || executing
  const onScope = dataView === 'scope'
  const targetLabel = operationTargetLabel(selectedTargetKey)
  const terminalResult = daily && (currentOperation?.terminal ? currentOperation
    : summary?.currentOperations.find((item) => item.terminal &&
      item.profileKey === profileKey && item.targetSummary.targetKey === selectedTargetKey))
  const outcome = terminalResult && dataPreparationStatusPresentation(terminalResult.status)
  const readyIssues = currentOperation?.status === 'ready' ? currentOperation.issues : []
  const runningHere = currentOperation?.status === 'launching' || currentOperation?.status === 'running'
  const reload = (
    <Button icon={<ReloadOutlined aria-hidden="true" />} loading={loading} disabled={busy} onClick={() => refresh({ force: true })}>
      重新检查
    </Button>
  )
  const prepareButton = (
    <Button type="primary" icon={<FileDoneOutlined aria-hidden="true" />} disabled={!canPrepare} loading={preparing} onClick={handlePrepare}>
      {copy.prepareButtonLabel}
    </Button>
  )
  const plan = summary?.acceptancePlan
  const Content = daily ? 'main' : 'div'
  const coverage = plan && (
    <AcceptancePlanReview plan={plan} selectedChainKey={selectedChainKey} onSelectChain={setSelectedChainKey} regression={!daily} />
  )
  const loadErrorNotice = loadError ? (
    <WorkbenchNotice tone="error" title={daily ? '无法检查数据环境' : '无法检查回归条件'} description={loadError} />
  ) : null
  const preflightNotice = summary && !loadError && (!daily || !loading) && availability.blockers.length ? (
    <WorkbenchNotice
      tone="warning"
      className={daily ? undefined : 'erp-dev-regression-blockers'}
      title={daily ? '所选环境暂不能执行' : (loading ? '上次检查：暂不能运行' : '暂不能运行')}
      description={daily ? availability.blockers.map(({ code, message, nextAction }) => (
        <div key={code}>{message}{nextAction ? ` ${nextAction}` : ''}</div>
      )) : (
        <ul>
          {availability.blockers.map(({ code, title, message, nextAction }) => (
            <li key={code}><strong>{title}</strong><span>{message}{nextAction ? ` ${nextAction}` : ''}</span></li>
          ))}
        </ul>
      )}
    />
  ) : null
  const operationNotices = summary && (
    <>
      {hasActiveOperation ? (
        <WorkbenchNotice tone="loading" title={runningHere ? (daily ? '正在补齐手测数据' : '正在运行完整回归') : '已有操作正在执行'} description="执行完成后会更新结果。" />
      ) : null}
      {pollError ? <WorkbenchNotice tone="warning" title="暂时无法刷新结果" description={pollError} /> : null}
      {actionError ? <WorkbenchNotice tone="error" title="本次操作未完成" description={actionError} /> : null}
      {readyIssues.length ? <OperationIssues issues={readyIssues} /> : null}
      {terminalResult && !runningHere && !busy ? (
        <WorkbenchNotice
          tone={terminalResult.status === 'passed' ? 'success' : 'warning'}
          title={`最近一次 · ${outcome.label}`}
          description={
            <Space wrap size={[8, 4]}>
              <span>{terminalResult.status === 'passed' ? copy.successDescription : '请查看执行记录中的原因。'}</span>
              <DevTimestamp value={terminalResult.updatedAt} />
            </Space>
          }
          action={<Button onClick={() => selectDataView('receipts')}>查看执行记录</Button>}
        />
      ) : null}
    </>
  )
  const checking = loading ? <WorkbenchNotice tone="loading" title="正在检查回归条件" /> : null

  return (
    <div className={daily ? 'erp-dev-hub-page erp-dev-workspace-page erp-dev-tool-page erp-dev-data-page' : 'erp-dev-data-page erp-dev-regression-workspace'}>
      {daily ? (
        <>
          <DevPageNav />
          <DevPageHeader
            className="erp-dev-hub-header"
            title={
              <div className="erp-dev-hub-header__copy">
                <span className="erp-dev-hub-header__icon"><DatabaseOutlined aria-hidden="true" /></span>
                <Title level={1} className="erp-dev-hub-title">测试数据</Title>
              </div>
            }
            navigation={(
              <DevTaskNav
                compact
                idPrefix="dev-data"
                ariaLabel="测试数据视图"
                items={DATA_VIEW_ITEMS}
                value={dataView}
                onChange={selectDataView}
              />
            )}
            tools={reload}
          />
        </>
      ) : null}

      <Content className={daily ? 'erp-dev-hub-shell erp-dev-data-shell' : 'erp-dev-data-shell'}>
        {daily ? (
          <>
            {loadErrorNotice}
            {loading && !summary ? <Card><Skeleton active paragraph={{ rows: 3 }} /></Card> : null}
            <div id="dev-data-panel-scope" role="tabpanel" aria-labelledby="dev-data-tab-scope" hidden={!onScope}>
              {summary ? (
                <WorkbenchSection flat title="准备手测数据" description={copy.purpose}>
                  {(customerScope.status !== 'ready' || customerScope.registeredCustomers.length > 1) ? (
                    <DevCustomerScopeSelector
                      compact
                      scope={customerScope}
                      onChange={customerScope.selectCustomer}
                      disabled={busy}
                      label="客户"
                      note=""
                    />
                  ) : null}
                  <WorkbenchToolbar actions={prepareButton}>
                    <Radio.Group
                      aria-label="数据目标"
                      value={selectedTargetKey}
                      disabled={busy}
                      onChange={(event) => selectTarget(event.target.value)}
                      options={[
                        { value: DEV_DATA_PREPARATION_TARGET_KEYS.localDevelopment, label: '本地开发' },
                        { value: DEV_DATA_PREPARATION_TARGET_KEYS.customerTrial133, label: '服务器 Demo' },
                      ]}
                    />
                  </WorkbenchToolbar>
                  {preflightNotice}
                  {operationNotices}
                </WorkbenchSection>
              ) : null}
              {coverage ? (
                <>
                  <hr className="erp-dev-data-coverage-divider" />
                  <WorkbenchSection flat title="覆盖内容" description={copy.scope}>{coverage}</WorkbenchSection>
                </>
              ) : null}
            </div>
            <div id="dev-data-panel-receipts" role="tabpanel" aria-labelledby="dev-data-tab-receipts" hidden={onScope}>
              {!onScope && summary ? (
                <DataPreparationHistory summary={summary} profileKey={profileKey} onBack={() => selectDataView('scope')} />
              ) : null}
            </div>
          </>
        ) : (
          <>
            <div className="erp-dev-regression-overview">
              <WorkbenchSection flat title="运行条件">
                <Text type="secondary">使用本地临时数据库，回归结束后自动清理。</Text>
                {loadErrorNotice}
                {preflightNotice || checking}
                {canPrepare && !readyIssues.length && !actionError ? <WorkbenchNotice tone="success" title="运行条件已满足" /> : null}
                {operationNotices}
                <WorkbenchToolbar actions={<>{prepareButton}{reload}</>} />
              </WorkbenchSection>
              <div className="erp-dev-regression-summary">
                <WorkbenchSection flat title="回归范围" description={plan && (loadError || loading) ? '显示上次读取的覆盖范围。' : '每次回归覆盖全部已登记场景。'}>
                  {plan ? <AcceptancePlanFacts plan={plan} /> : (
                    <Text type="secondary">{loading ? '正在读取覆盖范围…' : '未能读取覆盖范围。'}</Text>
                  )}
                </WorkbenchSection>
                <div className="erp-dev-regression-records">
                  {summary ? (
                    <DataPreparationHistory summary={summary} profileKey={profileKey} stale={loading || Boolean(loadError)} />
                  ) : (
                    <WorkbenchSection flat title="执行记录" description={loading ? '正在读取记录…' : '未能读取执行记录。'} />
                  )}
                </div>
              </div>
            </div>
            <div className="erp-dev-regression-coverage">
              <WorkbenchSection flat title="业务链与步骤">
                {coverage || <Text type="secondary">{loading ? '正在读取覆盖范围…' : '未能读取覆盖范围。'}</Text>}
              </WorkbenchSection>
            </div>
          </>
        )}
      </Content>

      <Modal
        title={daily ? `补齐手测数据 · ${targetLabel}` : '确认完整回归'}
        open={confirmOpen}
        okText={daily ? '确认补齐' : '开始回归'}
        cancelText="取消"
        confirmLoading={executing}
        cancelButtonProps={{ disabled: executing }}
        closable={!executing}
        maskClosable={!executing}
        keyboard={!executing}
        okButtonProps={{ disabled: !canExecute || executionConfirmation !== currentOperation?.confirmationRequired }}
        onOk={handleExecute}
        onCancel={() => { if (!executing) closeConfirm() }}
        destroyOnHidden
      >
        <Space direction="vertical" size={12} className="erp-dev-data-confirm">
          <Text>{copy.confirmationDescription}</Text>
          {!daily ? (
            <>
              <Text code copyable className="erp-dev-data-confirm__value">{currentOperation?.confirmationRequired || ''}</Text>
              <Input
                autoFocus
                value={confirmation}
                maxLength={400}
                placeholder="输入上方确认文本"
                aria-label="完整回归确认文本"
                onChange={(event) => setConfirmation(event.target.value)}
              />
            </>
          ) : null}
        </Space>
      </Modal>
    </div>
  )
}

export function FullAcceptanceWorkspace() {
  return <DataPreparationWorkspace profileKey={DEV_DATA_PREPARATION_PROFILE_KEYS.fullAcceptance} />
}

export default function DevDataPreparationPage() {
  return <DataPreparationWorkspace profileKey={DEV_DATA_PREPARATION_PROFILE_KEYS.scenarioDemo} />
}
