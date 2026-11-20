import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Button, Tag } from 'antd'
import { useLocation, useSearchParams } from 'react-router-dom'
import SlidingTabs from '@/common/components/navigation/SlidingTabs'
import AppSelect from '@/common/components/select/AppSelect'
import {
  WorkbenchFacts,
  WorkbenchNotice,
  WorkbenchSection,
  WorkbenchToolbar,
} from '../WorkbenchPattern.jsx'
import DevTimestamp from '../DevTimestamp.jsx'
import { DevReadingLink } from '../DevReadingNavigation.jsx'
import useDevTestingOperations from '../../hooks/useDevTestingOperations.mjs'
import { BUSINESS_RULE_STATUS } from '../../config/devBusinessRules.mjs'
import {
  DEV_CHAIN_RULE_ACTION,
  isDevTestingOperationActive,
} from '../../config/devTestingOperation.mjs'
import { businessChainRuleBatch } from '../../../../../scripts/qa/lib/business-chain-rule-contract.mjs'
import { CHAIN_AUDIT_BATCH_PATTERN } from '../../config/devBusinessChainAudit.mjs'
import { DEV_FLOW_STATE_QUERY_KEYS as queryKeys } from '../../pages/devFlowStateQuery.mjs'
import {
  describeDevBusinessChainResponsibility,
  describeDevBusinessChainStep,
} from '../../config/devBusinessChainProjection.mjs'
import {
  chainStepAuditURL,
  chainStepEvidenceLayers,
  chainStepRuleRows,
  chainStepSourceAccessFacts,
  readChainVerificationBatch,
  readChainVerificationEvidence,
} from '../../config/devBusinessChainVerification.mjs'
import './businessChainStepVerification.css'

const gateLabels = {
  server: '后端规则',
  web: '前端合同',
  postgres: '真实数据库',
}
const panelTabs = [
  { key: 'rules', label: '办理规则' },
  { key: 'evidence', label: '验证证据' },
]
const emptyBatch = { audit: null, ruleResult: null, error: '' }

export default function BusinessChainStepVerification({
  catalog,
  topic,
  step,
  onClose,
  testingClient,
}) {
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const view = searchParams.getAll(queryKeys.roleTopicPanel).length === 1 &&
    searchParams.get(queryKeys.roleTopicPanel) === 'rules' ? 'rules' : 'evidence'
  const updateSelection = useCallback((patch, replace = false) => {
    setSearchParams((previous) => {
      const next = new URLSearchParams(previous)
      for (const [key, value] of Object.entries(patch)) {
        if (value === null) next.delete(key)
        else next.set(key, value)
      }
      return next
    }, { replace, state: location.state })
  }, [setSearchParams, location.state])
  const [evidence, setEvidence] = useState({})
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)
  const [batchData, setBatchData] = useState(emptyBatch)
  const [batchLoading, setBatchLoading] = useState(false)
  const [batchError, setBatchError] = useState('')
  const [checksOpen, setChecksOpen] = useState(false)
  const completed = useRef('')
  const running = useRef('')
  const operations = useDevTestingOperations({ client: testingClient })
  const candidate = operations.testingOperations[DEV_CHAIN_RULE_ACTION.key]
  const operation = candidate?.chainKey === topic.key ? candidate : null
  const batches = (evidence.batches || []).filter((batch) =>
    batch.status === 'ready' && batch.chainKeys.includes(topic.key)
  )
  const requestedBatch = searchParams.getAll(queryKeys.roleTopicBatch).length === 1
    ? searchParams.get(queryKeys.roleTopicBatch) : ''
  const selectedBatch = CHAIN_AUDIT_BATCH_PATTERN.test(requestedBatch || '') &&
    batches.some((batch) => batch.id === requestedBatch)
    ? requestedBatch : batches[0]?.id || ''
  const currentBatch = batchData.audit?.batch === selectedBatch && batchData.audit?.chainKey === topic.key
    ? batchData : emptyBatch
  const visibleEvidence = { ...evidence, ruleResult: currentBatch.ruleResult }
  const description = describeDevBusinessChainStep(catalog, step)
  const rules = chainStepRuleRows(step, visibleEvidence)
  const layers = chainStepEvidenceLayers(step, visibleEvidence, currentBatch.audit)
  const from = topic.nodes.find((node) => node.key === step.fromNodeKey)
  const to = topic.nodes.find((node) => node.key === step.toNodeKey)
  const access = chainStepSourceAccessFacts(step)
  const failed = layers.some((layer) => ['failed', 'blocked'].includes(layer.status))
  const reading = loading || batchLoading

  useEffect(() => {
    const patch = {}
    if (searchParams.has(queryKeys.roleTopicPanel) &&
      (searchParams.getAll(queryKeys.roleTopicPanel).length !== 1 ||
        !['rules', 'evidence'].includes(searchParams.get(queryKeys.roleTopicPanel)))) {
      patch[queryKeys.roleTopicPanel] = null
    }
    if (!loading && evidence.generation === reload && evidence.batchesLoaded && searchParams.has(queryKeys.roleTopicBatch) &&
      requestedBatch !== selectedBatch) patch[queryKeys.roleTopicBatch] = null
    if (Object.keys(patch).length) updateSelection(patch, true)
  }, [searchParams, requestedBatch, selectedBatch, loading, reload, evidence.generation, evidence.batchesLoaded, updateSelection])

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    readChainVerificationEvidence({ signal: controller.signal }).then((value) => {
      if (!controller.signal.aborted) {
        setEvidence({ ...value, generation: reload })
        setLoading(false)
      }
    })
    return () => controller.abort()
  }, [reload])

  useEffect(() => {
    if (loading || !selectedBatch) {
      setBatchLoading(false)
      if (!selectedBatch) {
        setBatchError('')
        setBatchData(emptyBatch)
      }
      return undefined
    }
    const controller = new AbortController()
    setBatchLoading(true)
    setBatchError('')
    setBatchData(emptyBatch)
    readChainVerificationBatch({ batch: selectedBatch, chain: topic, signal: controller.signal }).then(
      (value) => {
        if (!controller.signal.aborted) {
          setBatchData(value)
          setBatchLoading(false)
        }
      },
      () => {
        if (!controller.signal.aborted) {
          setBatchError('链路报告读取失败，可重新读取；规则关联仍可查看。')
          setBatchLoading(false)
        }
      }
    )
    return () => controller.abort()
  }, [loading, selectedBatch, topic])

  useEffect(() => {
    if (!operation) return
    if (isDevTestingOperationActive(operation)) {
      running.current = operation.id
      return
    }
    if (running.current !== operation.id) return
    const key = `${operation.id}:${operation.revision}`
    if (completed.current === key) return
    completed.current = key
    updateSelection({ [queryKeys.roleTopicBatch]: businessChainRuleBatch(operation.id) })
    setReload((value) => value + 1)
  }, [operation, updateSelection])

  const run = async () => {
    const result = await operations.runTestingAction(DEV_CHAIN_RULE_ACTION.key, undefined, topic.key)
    if (result && !isDevTestingOperationActive(result)) {
      completed.current = `${result.id}:${result.revision}`
      updateSelection({ [queryKeys.roleTopicBatch]: businessChainRuleBatch(result.id) })
      setReload((value) => value + 1)
    }
  }

  const refresh = () => {
    operations.reloadTestingSummary()
    setReload((value) => value + 1)
  }
  const errors = [...(evidence.errors || []), batchError, currentBatch.error, operations.testingSummaryError].filter(Boolean)

  const content = (
    <div className="erp-dev-chain-step-verification__body">
      {view === 'rules' ? (
        <>
          <WorkbenchFacts items={[
            { label: '办理岗位', value: describeDevBusinessChainResponsibility(step.responsibility) },
            { label: '办理条件', value: [description.condition, ...description.preconditions].filter(Boolean).join('；') || '复核来源、状态及当前岗位权限' },
            { label: '正式结果', value: description.results.join('；') || '以所属领域动作的正式结果为准' },
          ]}
          />
          {access.length ? (
            <details className="erp-dev-disclosure">
              <summary>来源读取与权限</summary>
              <WorkbenchFacts items={access} />
            </details>
          ) : null}
          <ul className="erp-dev-chain-step-verification__rules">
            {rules.map((rule) => <li key={rule.id}><strong>{rule.label}</strong><p>{rule.standard}</p></li>)}
          </ul>
          <details className="erp-dev-disclosure">
            <summary>规则依据</summary>
            <ul className="erp-dev-chain-step-verification__sources">
              {step.sourceRefs.map((source) => <li key={source}><code>{source}</code></li>)}
            </ul>
          </details>
        </>
      ) : (
        <>
          <WorkbenchToolbar tools={<Button loading={reading} onClick={refresh}>重新读取</Button>}>
            <Button
              type="primary"
              loading={operations.testingActionStarting === DEV_CHAIN_RULE_ACTION.key || isDevTestingOperationActive(operation)}
              disabled={!operations.testingSummary || Boolean(operations.testingSummaryError) || operations.testingBusy.active || operations.testingHasActive}
              onClick={run}
            >
              运行本链规则检查
            </Button>
            {failed ? <Tag color="red">存在失败或阻断</Tag> : null}
          </WorkbenchToolbar>
          <p className="erp-dev-chain-step-verification__hint">各层独立核对；规则通过不代表整条链路已验收。</p>
          {operations.testingBusy.active && !operation ? <p className="erp-dev-chain-step-verification__hint">已有其他验证正在执行，结束后可检查本链。</p> : null}
          {operation ? <p className="erp-dev-chain-step-verification__operation" role="status">{operation.message}</p> : null}
          {errors.length ? <WorkbenchNotice tone="error" title={errors.join('；')} description="可重新读取，现有规则和报告保持各自的证据范围。" /> : null}
          {currentBatch.warning ? <WorkbenchNotice tone="warning" title={currentBatch.warning} /> : null}
          <table data-table-lines="appearance" aria-label="当前动作的分层验证证据">
            <thead><tr><th scope="col">验证范围</th><th scope="col">结果</th><th scope="col">来源与范围</th></tr></thead>
            <tbody>
              {layers.map((layer) => (
                <tr key={layer.key} data-verification-layer={layer.key}>
                  <th scope="row">{layer.label}</th>
                  <td><Tag color={BUSINESS_RULE_STATUS[layer.status][1]}>{reading ? '读取中' : BUSINESS_RULE_STATUS[layer.status][0]}</Tag></td>
                  <td>{layer.source}<DevTimestamp value={layer.time} missing="" /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {batches.length ? (
            <AppSelect
              label="链路记录"
              aria-label="选择链路验证记录"
              className="erp-dev-chain-step-verification__batch"
              value={selectedBatch}
              options={batches.map((batch) => ({ value: batch.id, label: batch.title }))}
              onChange={(batch) => updateSelection({ [queryKeys.roleTopicBatch]: batch })}
            />
          ) : null}
          {layers.find((layer) => layer.observed)?.observed ? (
            <details className="erp-dev-disclosure">
              <summary>本批次的实际观察与边界</summary>
              <p>{layers.at(-1).observed.level}</p>
              <p>{layers.at(-1).observed.observed}</p>
            </details>
          ) : null}
          <details className="erp-dev-disclosure" open={checksOpen} onToggle={(event) => setChecksOpen(event.currentTarget.open)}>
            <summary>具名检查项与执行结果</summary>
            {checksOpen ? (
              <ul className="erp-dev-chain-step-verification__checks">
                {rules.map((rule) => (
                  <li key={rule.id} data-step-rule={rule.id}>
                    <strong>{rule.label}</strong>
                    <ul>
                      {rule.tests.map((test) => (
                        <li key={test.id}>
                          <span>{gateLabels[test.gate]}</span>
                          <Tag color={BUSINESS_RULE_STATUS[test.status][1]}>{BUSINESS_RULE_STATUS[test.status][0]}</Tag>
                          <code>{test.name}</code>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            ) : null}
          </details>
          <DevReadingLink to={chainStepAuditURL(topic.key, step.key, selectedBatch)} fromLabel={step.label}>查看所选动作的链路实测报告</DevReadingLink>
        </>
      )}
    </div>
  )

  return (
    <WorkbenchSection
      flat
      className="erp-dev-chain-step-verification"
      aria-label="交接规则与验证"
      aria-busy={reading}
      data-chain-step-verification={step.key}
      title={step.label}
      headingLevel={3}
      description={`${from.label} → ${to.label}`}
      actions={onClose ? <Button onClick={onClose}>返回关系图</Button> : null}
    >
      <SlidingTabs
        activeKey={view}
        onChange={(key) => updateSelection({ [queryKeys.roleTopicPanel]: key === 'evidence' ? null : key })}
        items={panelTabs.map((tab) => ({ ...tab, children: tab.key === view ? content : null }))}
        aria-label="所选动作的核验内容"
      />

    </WorkbenchSection>
  )
}
