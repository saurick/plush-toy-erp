import React, { useContext, useEffect, useRef, useState } from 'react'
import { CloseOutlined } from '@ant-design/icons'
import { Button, Popover } from 'antd'
import { useLocation, useSearchParams } from 'react-router-dom'
import SlidingSegmented from '@/common/components/navigation/SlidingSegmented'
import { getRoleDisplayName } from '@/erp/utils/roleKeys.mjs'
import DevTaskNav from '../DevTaskNav.jsx'
import FinanceRulesView from './FinanceRulesView.jsx'
import FinanceTraceView from './FinanceTraceView.jsx'
import {
  buildFinanceRelationships,
  FINANCE_TOPIC_KEYS,
  FINANCE_TOPIC_STEPS,
  PURCHASE_FINANCE_CHANGES,
  PURCHASE_FINANCE_STAGES,
  purchaseFinanceScenario,
} from '../../config/devFinanceWorkbench.mjs'
import { DEV_FLOW_STATE_QUERY_KEYS as keys } from '../../pages/devFlowStateQuery.mjs'
import { WorkbenchFacts, WorkbenchSection } from '../WorkbenchPattern.jsx'
import { buildChainActionRelations } from '../../config/devFulfillmentRelations.mjs'
import BusinessFlowDiagram from './BusinessFlowDiagram.jsx'
import { FlowDiagramPrintContext } from './FlowDiagramPrintContext.mjs'
import './financeWorkbench.css'

const FINANCE_TOPICS = [
  { key: 'purchase', label: '采购退货与数量差额', tabLabel: '采购差额' },
  { key: 'terms', label: '月结与期间对账', tabLabel: '月结对账' },
  { key: 'permissions', label: '审批、权限与凭据', tabLabel: '审批凭据' },
]

const FINANCE_TABS = [
  { value: 'overview', label: '总览' },
  ...FINANCE_TOPICS.map(({ key, tabLabel }) => ({
    value: key,
    label: tabLabel,
  })),
]

const TERM_RELATIONSHIPS = [
  { from: 'terms-0', to: 'terms-1', label: '按冻结账期计算' },
  { from: 'terms-2', to: 'terms-3', label: '按往来方、币种和中国日期核对' },
]

const READING_TABS = [
  { value: 'detail', label: '办理说明' },
  { value: 'rules', label: '财务口径' },
  { value: 'records', label: '真实记录' },
]

function FinanceSteps({
  nodes,
  label,
  selected,
  onSelect,
  preview,
  edges,
  groups,
  compactControls,
  legend,
}) {
  const root = useRef(null)
  const [anchor, setAnchor] = useState(null)
  const active = nodes.find((node) => node.key === preview.active)
  const graph = {
    direction: 'LR',
    groups,
    nodeSpacing: groups ? 16 : undefined,
    nodes: nodes.map((node) => ({
      ...node,
      summary: [
        node.description || node.summary,
        node.roles?.length ? `关联岗位：${node.roles.join('、')}` : '',
      ]
        .filter(Boolean)
        .join('；'),
      expanded: preview.active === node.key,
      data: {
        'finance-node': node.key,
        'finance-lane': node.lane,
        financial: node.financial || undefined,
      },
    })),
    edges:
      edges ??
      nodes.slice(1).map((node, index) => ({
        from: nodes[index].key,
        to: node.key,
        label: '办理顺序',
        condition: node.description || node.summary,
      })),
  }
  const findStep = (key) =>
    root.current?.querySelector(`[data-finance-node="${key}"]`)
  const inspect = (key) => {
    const trigger = findStep(key)
    if (trigger) {
      const target = trigger.getBoundingClientRect()
      const chart = root.current.getBoundingClientRect()
      setAnchor({
        left: target.left - chart.left,
        top: target.top - chart.top,
        width: target.width,
        height: target.height,
      })
    }
    preview.setActive(key)
  }
  const close = () => {
    findStep(active?.key)?.focus({ preventScroll: true })
    preview.setActive(null)
  }
  const dismissOnEscape = (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      close()
    }
  }
  const dismissWhenLeaving = (event) => {
    if (!active) return
    const explanation = document.getElementById(`finance-note-${active.key}`)
    if (
      !root.current?.contains(event.relatedTarget) &&
      !explanation?.contains(event.relatedTarget)
    ) {
      preview.setActive((current) => (current === active.key ? null : current))
    }
  }
  return (
    <div
      ref={root}
      className="erp-dev-finance__step-diagram"
      onBlur={dismissWhenLeaving}
      onMouseLeave={dismissWhenLeaving}
      onKeyDownCapture={(event) => {
        if (event.key === 'Escape' && active) close()
      }}
    >
      <BusinessFlowDiagram
        relationships
        flow={graph}
        compactControls={compactControls}
        label={label}
        selectedKey={onSelect ? (nodes[selected]?.key ?? null) : preview.active}
        onInspect={inspect}
        onSelect={(key) => {
          const index = nodes.findIndex((node) => node.key === key)
          if (onSelect) onSelect(index)
        }}
        legend={
          legend ?? '按登记的办理顺序阅读。首款、审批与事实过账分别判断。'
        }
      />
      <Popover
        open={Boolean(active && anchor)}
        trigger={[]}
        placement="bottom"
        content={
          active ? (
            <div
              role="dialog"
              tabIndex={-1}
              id={`finance-note-${active.key}`}
              className="erp-dev-finance__node-note"
              aria-label={`${active.label}说明`}
              onBlur={dismissWhenLeaving}
              onMouseLeave={dismissWhenLeaving}
            >
              <div className="erp-dev-finance__note-heading">
                <strong>{active.label}</strong>
                <Button
                  type="text"
                  aria-label="关闭步骤说明"
                  icon={<CloseOutlined aria-hidden="true" />}
                  onClick={close}
                  onKeyDown={dismissOnEscape}
                />
              </div>
              <p>{active.description || active.summary}</p>
              {active.roles?.length ? (
                <p>关联岗位：{active.roles.join('、')}</p>
              ) : null}
              {preview.onExpand ? (
                <Button
                  onClick={() => preview.onExpand(active, findStep(active.key))}
                  onKeyDown={dismissOnEscape}
                >
                  展开说明与规则
                </Button>
              ) : null}
            </div>
          ) : null
        }
      >
        <span
          aria-hidden="true"
          className="erp-dev-finance__note-anchor"
          style={anchor || undefined}
        />
      </Popover>
    </div>
  )
}

function PurchaseScenarioControls({ stage, change, scenario, onChange }) {
  return (
    <>
      <div className="erp-dev-finance__scenario-controls">
        <fieldset>
          <legend>应付阶段</legend>
          <SlidingSegmented
            aria-label="应付阶段"
            value={stage}
            onChange={(value) => onChange(keys.financeStage, value)}
            options={PURCHASE_FINANCE_STAGES}
          />
        </fieldset>
        <fieldset>
          <legend>来源变化</legend>
          <SlidingSegmented
            aria-label="来源变化"
            value={change}
            onChange={(value) => onChange(keys.financeChange, value)}
            options={PURCHASE_FINANCE_CHANGES}
          />
        </fieldset>
      </div>
      <p
        className="erp-dev-finance__scenario-result"
        data-purchase-scenario-result
        role="status"
      >
        <span>
          {scenario.stageLabel} ＋ {scenario.changeLabel}
        </span>
        <span aria-hidden="true">→</span>
        <strong>{scenario.title}</strong>
      </p>
    </>
  )
}

function getTopicToggle(root, key) {
  return root?.querySelector(`[data-finance-reading-toggle="${key}"]`)
}

export default function FinanceRelationshipsView({ catalog }) {
  const [params, setParams] = useSearchParams()
  const { state: locationState } = useLocation()
  const printing = useContext(FlowDiagramPrintContext)
  const topic = params.get(keys.financeTopic)
  const topicTab = FINANCE_TOPICS.find(({ key }) => key === topic)
  const activeTab = topicTab?.key ?? 'overview'
  const showOverview = printing || activeTab === 'overview'
  const readingOpen = Boolean(
    topic && (!topicTab || params.has(keys.financeStep))
  )
  const root = useRef(null)
  const opener = useRef(null)
  const pendingFocus = useRef(
    readingOpen && !locationState?.flowRestoreFrame ? topic : null
  )
  const [activeNode, setActiveNode] = useState(null)
  const [panel, setPanel] = useState('detail')
  const [ruleKey, setRuleKey] = useState(null)
  const [factID, setFactID] = useState(null)
  const model = buildFinanceRelationships(catalog)
  const selected = model.groups.find((item) => item.key === topic)
  const lanes = showOverview
    ? model.lanes.map((lane) => ({
        ...lane,
        nodes: lane.nodes.map((node) => {
          const actions = buildChainActionRelations(catalog, node.chain).filter(
            (action) =>
              action.nodeKeys.some((key) =>
                [node.nodeKey, ...(node.relatedNodeKeys || [])].includes(key)
              )
          )
          return {
            ...node,
            roles: [
              ...new Set(actions.flatMap((action) => action.roleKeys)),
            ].map((roleKey) => getRoleDisplayName(roleKey)),
          }
        }),
      }))
    : []
  const stage = params.get(keys.financeStage) || 'posted'
  const change = params.get(keys.financeChange) || 'return'
  const step = Number(params.get(keys.financeStep) || 0)
  const scenario = purchaseFinanceScenario(stage, change)

  useEffect(() => {
    if (!readingOpen || pendingFocus.current !== topic) return
    pendingFocus.current = null
    getTopicToggle(root.current, topic)?.focus()
  }, [readingOpen, topic])

  const update = (patch) =>
    setParams(
      (previous) => {
        const next = new URLSearchParams(previous)
        Object.entries(patch).forEach(([key, value]) =>
          value == null ? next.delete(key) : next.set(key, String(value))
        )
        return next
      },
      { replace: true, state: locationState }
    )

  const changeTab = (key) => {
    if (key === activeTab) return
    opener.current = null
    pendingFocus.current = null
    setActiveNode(null)
    setPanel('detail')
    setRuleKey(null)
    setFactID(null)
    update({
      [keys.financeTopic]: key === 'overview' ? null : key,
      [keys.financeStep]: null,
    })
  }
  const openReading = (key, initialStep = 0, trigger = null) => {
    if (!readingOpen || topic !== key) {
      opener.current = trigger
      pendingFocus.current = trigger ? key : null
      setFactID(null)
    } else if (trigger) {
      opener.current = trigger
      getTopicToggle(root.current, key)?.focus()
    }
    setActiveNode(null)
    setPanel('detail')
    setRuleKey(null)
    update({
      [keys.financeTopic]: key,
      [keys.financeStep]: initialStep,
    })
  }
  const closeReading = () => {
    const overviewNode = model.lanes
      .flatMap((lane) => lane.nodes)
      .find((node) => node.topic === topic)
    const focusTarget = opener.current?.isConnected
      ? opener.current
      : topicTab
        ? getTopicToggle(root.current, topic)
        : root.current?.querySelector(
            `[data-finance-node="${overviewNode?.key}"]`
          )
    focusTarget?.focus()
    opener.current = null
    setActiveNode(null)
    setFactID(null)
    update({
      [keys.financeTopic]: topicTab?.key ?? null,
      [keys.financeStep]: null,
    })
  }
  const openRule = (key) => {
    setRuleKey(key)
    setPanel('rules')
    root.current?.querySelector('#finance-reading-tab-rules')?.focus()
  }
  const updateScenario = (key, value) => {
    setActiveNode(null)
    update({
      [key]: value,
      ...(topic === 'purchase' && readingOpen ? { [keys.financeStep]: 0 } : {}),
    })
  }

  if ((topic && !FINANCE_TOPIC_KEYS.includes(topic)) || !scenario) return null

  const overviewTopic = topicTab ? null : selected
  const topics = printing
    ? [...(overviewTopic ? [overviewTopic] : []), ...FINANCE_TOPICS]
    : [topicTab || overviewTopic].filter(Boolean)
  const overviewPreview = {
    active: activeNode,
    setActive: setActiveNode,
    onExpand: (node, trigger) =>
      openReading(
        node.topic,
        node.topic === 'purchase' ? 0 : node.readingStep,
        trigger
      ),
  }
  // Mermaid stacks disconnected LR groups from the last declaration upward.
  const overviewGroups = lanes.toReversed().map((lane) => ({
    label: lane.label,
    direction: 'LR',
    nodeKeys: lane.nodes.map((node) => node.key),
  }))
  const defaultRule =
    selected?.rule ?? (topic === 'terms' && step >= 2 ? 'statement' : topic)

  const content = (
    <>
      {showOverview ? (
        <WorkbenchSection title="业务怎样连接财务" flat data-finance-overview>
          {printing ? (
            lanes.map((lane) => (
              <section className="erp-dev-finance__print-lane" key={lane.key}>
                <h3>{lane.label}</h3>
                <FinanceSteps
                  nodes={lane.nodes}
                  label={`${lane.label}办理顺序`}
                  preview={overviewPreview}
                />
              </section>
            ))
          ) : (
            <FinanceSteps
              label="跨模块财务关系图"
              compactControls
              nodes={lanes.flatMap((lane) =>
                lane.nodes.map((node) => ({
                  ...node,
                  lane: lane.key,
                }))
              )}
              groups={overviewGroups}
              edges={lanes.flatMap((lane) =>
                lane.nodes.slice(1).map((node, index) => ({
                  from: lane.nodes[index].key,
                  to: node.key,
                }))
              )}
              preview={overviewPreview}
              legend="每行按箭头方向阅读。悬停、聚焦或点选步骤查看说明。"
            />
          )}
          <div className="erp-dev-finance__boundary">
            <strong>账款与首款先独立，形成账款后再抵扣</strong>
            <p>
              账款以真实出货、入库或验收为来源。首款可先收付。仓库纠错产生的应付差额由财务另行确认，原过账记录保留。
            </p>
          </div>
        </WorkbenchSection>
      ) : null}

      {topics.map(({ key, label, summary }) => {
        const isPurchase = key === 'purchase'
        const isTerms = key === 'terms'
        const expanded = readingOpen && topic === key
        const topicSteps = isPurchase
          ? scenario.steps.map(
              ([label, description, conditionLabel], index) => ({
                key: `purchase-${index}`,
                label,
                description,
                conditionLabel,
                financial: index === 3,
              })
            )
          : FINANCE_TOPIC_STEPS[key].map(
              ([label, summary, description, conditionLabel], index) => ({
                key: `${key}-${index}`,
                label,
                summary,
                description,
                conditionLabel,
                financial: index >= 2,
              })
            )
        const currentStep = topicSteps[step]
        const topicEdges =
          isPurchase || key === 'permissions'
            ? topicSteps
                .slice(0, -1)
                .map(({ key: from, description, conditionLabel }, index) => ({
                  from,
                  to: topicSteps[index + 1].key,
                  label: conditionLabel,
                  condition: conditionLabel ? description : undefined,
                }))
            : isTerms
              ? TERM_RELATIONSHIPS
              : undefined
        const detailID = `finance-reading-${key}`

        return (
          <WorkbenchSection
            key={key}
            title={label}
            description={summary}
            flat
            data-finance-topic={key}
          >
            {isPurchase ? (
              <PurchaseScenarioControls
                stage={stage}
                change={change}
                scenario={scenario}
                onChange={updateScenario}
              />
            ) : null}
            <FinanceSteps
              nodes={topicSteps}
              label={`${label}流程图`}
              selected={expanded ? step : null}
              onSelect={(index) => openReading(key, index)}
              preview={{ active: activeNode, setActive: setActiveNode }}
              edges={topicEdges}
              legend={
                isTerms
                  ? '月结到期日与期间对账各有自己的计算依据。'
                  : '点选步骤查看办理说明。'
              }
            />
            <div className="erp-dev-finance__detail-actions">
              <Button
                aria-expanded={expanded}
                aria-controls={expanded ? detailID : undefined}
                data-finance-reading-toggle={key}
                onClick={expanded ? closeReading : () => openReading(key)}
              >
                {expanded ? '收起说明与记录' : '查看说明与记录'}
              </Button>
            </div>
            {expanded ? (
              <div
                className="erp-dev-finance__detail"
                data-finance-detail={key}
                id={detailID}
              >
                <DevTaskNav
                  ariaLabel="财务专题内容"
                  idPrefix="finance-reading"
                  compact
                  value={panel}
                  onChange={setPanel}
                  items={READING_TABS}
                />
                <div
                  role="tabpanel"
                  id={`finance-reading-panel-${panel}`}
                  aria-labelledby={`finance-reading-tab-${panel}`}
                >
                  {panel === 'rules' ? (
                    <FinanceRulesView
                      ruleKey={ruleKey ?? defaultRule}
                      onSelectRule={setRuleKey}
                      onOpenRecords={() => setPanel('records')}
                    />
                  ) : panel === 'records' ? (
                    <FinanceTraceView
                      factID={factID}
                      onSelectFact={setFactID}
                      onOpenRules={() => setPanel('rules')}
                      inlineDetails
                    />
                  ) : (
                    <>
                      <div className="erp-dev-finance__explanation">
                        <h3>{currentStep?.label}</h3>
                        <p>{currentStep?.description}</p>
                      </div>
                      {isPurchase ? (
                        <WorkbenchFacts
                          items={[
                            {
                              label: '谁来处理',
                              value: scenario.responsibility,
                            },
                            { label: '账款与资金', value: scenario.impact },
                          ]}
                        />
                      ) : null}
                      <div className="erp-dev-finance__detail-actions">
                        <Button onClick={() => openRule(defaultRule)}>
                          {isPurchase
                            ? '查看采购差额规则'
                            : isTerms
                              ? defaultRule === 'terms'
                                ? '查看月结到期日规则'
                                : '查看期间对账规则'
                              : '查看关联规则'}
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            ) : null}
          </WorkbenchSection>
        )
      })}
    </>
  )

  return (
    <div ref={root} className="erp-dev-finance" data-finance-relationships>
      <DevTaskNav
        ariaLabel="财务关联视图"
        idPrefix="finance-section"
        className="erp-dev-finance__tabs"
        compact
        items={FINANCE_TABS}
        value={activeTab}
        onChange={changeTab}
      />
      {FINANCE_TABS.map(({ value }) => (
        <div
          key={value}
          className="erp-dev-finance__tab-panel"
          role="tabpanel"
          id={`finance-section-panel-${value}`}
          aria-labelledby={`finance-section-tab-${value}`}
          hidden={value !== activeTab}
        >
          {value === activeTab ? content : null}
        </div>
      ))}
    </div>
  )
}
