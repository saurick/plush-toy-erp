import React, { useRef, useState } from 'react'
import { ArrowRightOutlined, CloseOutlined } from '@ant-design/icons'
import { Button, Drawer, Popover, Radio } from 'antd'
import { useLocation, useSearchParams } from 'react-router-dom'
import AppSelect from '@/common/components/select/AppSelect'
import { getRoleDisplayName } from '@/erp/utils/roleKeys.mjs'
import DevTaskNav from '../DevTaskNav.jsx'
import FinanceRulesView from './FinanceRulesView.jsx'
import FinanceTraceView from './FinanceTraceView.jsx'
import {
  buildFinanceRelationships,
  FINANCE_TOPIC_KEYS,
  FINANCE_TOPIC_STEPS,
  purchaseFinanceScenario,
} from '../../config/devFinanceWorkbench.mjs'
import { DEV_FLOW_STATE_QUERY_KEYS as keys } from '../../pages/devFlowStateQuery.mjs'
import { WorkbenchFacts, WorkbenchSection } from '../WorkbenchPattern.jsx'
import {
  buildChainActionRelations,
  relationMatches,
  relationFiltersActive,
} from '../../config/devFulfillmentRelations.mjs'
import './financeWorkbench.css'

function FinanceNode({ node, selected, onSelect, preview }) {
  const button = useRef(null)
  const explanation = useRef(null)
  const closing = useRef(false)
  const open = preview?.active === node.key
  const close = () => {
    closing.current = true
    preview.setActive(null)
    button.current?.focus({ preventScroll: true })
    closing.current = false
  }
  const dismissOnEscape = (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation()
      close()
    }
  }
  const control = (
    <Button
      ref={button}
      className="erp-dev-finance__node"
      data-finance-node={node.key}
      data-financial={node.financial || undefined}
      data-match={node.match || undefined}
      aria-pressed={preview ? undefined : selected}
      aria-expanded={preview ? open : undefined}
      aria-controls={open ? `finance-note-${node.key}` : undefined}
      onClick={preview ? () => preview.setActive(node.key) : onSelect}
      onFocus={() => {
        if (preview && !closing.current) preview.setActive(node.key)
      }}
      onBlur={(event) => {
        if (preview && !explanation.current?.contains(event.relatedTarget)) {
          preview.setActive((current) =>
            current === node.key ? null : current
          )
        }
      }}
      onKeyDown={(event) => {
        if (preview && event.key === 'Escape') {
          event.stopPropagation()
          close()
        } else if (open && event.key === 'ArrowDown') {
          event.preventDefault()
          explanation.current
            ?.querySelector('button')
            ?.focus({ preventScroll: true })
        }
      }}
    >
      <strong>{node.label}</strong>
      {node.summary ? <span>{node.summary}</span> : null}
    </Button>
  )
  if (!preview) return control
  return (
    <Popover
      trigger={['hover']}
      open={open}
      onOpenChange={(next) =>
        preview.setActive((current) =>
          next ? node.key : current === node.key ? null : current
        )
      }
      placement="bottom"
      content={
        <div
          ref={explanation}
          role="dialog"
          tabIndex={-1}
          id={`finance-note-${node.key}`}
          className="erp-dev-finance__node-note"
          aria-label={`${node.label}说明`}
          onBlur={(event) => {
            if (
              !event.currentTarget.contains(event.relatedTarget) &&
              event.relatedTarget !== button.current
            ) {
              preview.setActive((current) =>
                current === node.key ? null : current
              )
            }
          }}
        >
          <div className="erp-dev-finance__note-heading">
            <strong>{node.label}</strong>
            <Button
              type="text"
              aria-label="关闭步骤说明"
              icon={<CloseOutlined aria-hidden="true" />}
              onClick={close}
              onKeyDown={dismissOnEscape}
            />
          </div>
          <p>{node.description}</p>
          {node.roles.length ? (
            <p className="erp-dev-finance__note-roles">
              关联岗位：{node.roles.join('、')}
            </p>
          ) : null}
          <Button
            onClick={() => preview.onExpand(node, button.current)}
            onKeyDown={dismissOnEscape}
          >
            展开说明与规则
          </Button>
        </div>
      }
    >
      {control}
    </Popover>
  )
}

function FinanceSteps({ nodes, label, selected, onSelect, preview }) {
  return (
    <ol className="erp-dev-finance__flow" aria-label={label}>
      {nodes.map((node, index) => (
        <li key={node.key}>
          {index > 0 ? (
            <ArrowRightOutlined
              className="erp-dev-finance__arrow"
              aria-hidden="true"
            />
          ) : null}
          <FinanceNode
            node={node}
            selected={selected === undefined ? undefined : selected === index}
            onSelect={() => onSelect?.(node, index)}
            preview={preview}
          />
        </li>
      ))}
    </ol>
  )
}

export default function FinanceRelationshipsView({
  catalog,
  role = 'all',
  filters = {},
}) {
  const [params, setParams] = useSearchParams()
  const { state: locationState } = useLocation()
  const root = useRef(null)
  const opener = useRef(null)
  const [activeNode, setActiveNode] = useState(null)
  const [panel, setPanel] = useState('detail')
  const [ruleKey, setRuleKey] = useState(null)
  const [factID, setFactID] = useState(null)
  const topic = params.get(keys.financeTopic)
  const model = buildFinanceRelationships(catalog)
  const selected = model.groups.find((item) => item.key === topic)
  const activeFilters = { ...filters, role: filters.role || role }
  const filtered = relationFiltersActive(activeFilters)
  const lanes = model.lanes.map((lane) => ({
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
        roles: [...new Set(actions.flatMap((action) => action.roleKeys))].map(
          (roleKey) => getRoleDisplayName(roleKey)
        ),
        match:
          filtered &&
          actions.some((action) => relationMatches(action, activeFilters)),
      }
    }),
  }))
  const stage = params.get(keys.financeStage) || 'posted'
  const change = params.get(keys.financeChange) || 'return'
  const step = Number(params.get(keys.financeStep) || 0)
  const scenario = purchaseFinanceScenario(stage, change)
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
  const openTopic = (key, trigger, initialStep = 0) => {
    opener.current = trigger
    setActiveNode(null)
    setPanel('detail')
    setRuleKey(
      model.groups.find((group) => group.key === key)?.rule ||
        (key === 'terms' ? 'terms' : 'permissions')
    )
    update({
      [keys.financeTopic]: key,
      [keys.financeStep]: initialStep || null,
    })
  }
  const closePanel = () => {
    if (!opener.current?.isConnected) {
      const fallback = model.lanes
        .flatMap((lane) => lane.nodes)
        .find((node) => node.topic === topic)?.key
      opener.current =
        root.current?.querySelector(`[data-finance-node="topic-${topic}"]`) ||
        root.current?.querySelector(`[data-finance-node="${fallback}"]`)
    }
    setActiveNode(null)
    setFactID(null)
    update({ [keys.financeTopic]: null, [keys.financeStep]: null })
  }
  const openRule = (key) => {
    setRuleKey(key)
    setPanel('rules')
  }
  if (topic && !FINANCE_TOPIC_KEYS.includes(topic)) return null
  const detailTitle =
    selected?.label ||
    (topic === 'terms' ? '月结与期间对账' : '审批、权限与凭据')
  const topicSteps =
    topic === 'purchase'
      ? scenario.steps.map((label, index) => ({
          key: `purchase-${index}`,
          label,
          financial: index === 3,
        }))
      : (FINANCE_TOPIC_STEPS[topic] || []).map(([label, summary], index) => ({
          key: `${topic}-${index}`,
          label,
          summary,
          financial: index >= 2,
        }))
  const purchaseNotes = scenario && [
    stage === 'draft'
      ? '原草稿保留冻结金额与取消原因。'
      : '以正式入库行的确认单价和本次有效数量形成来源，保留原始记录。',
    stage === 'draft'
      ? scenario.impact
      : change === 'transfer'
        ? scenario.detail
        : '区分首次净来源与已过账后的待调整差额，避免同一来源重复确认。',
    scenario.detail,
    scenario.impact,
  ]

  return (
    <div
      ref={root}
      className="erp-dev-finance erp-dev-finance--relationships"
      data-finance-relationships
    >
      <WorkbenchSection
        title="业务怎样连接财务"
        description="悬停或点选步骤查看说明；专题在侧栏展开。"
        flat
        data-finance-overview
      >
        {filtered &&
        !lanes.some((lane) => lane.nodes.some((node) => node.match)) ? (
          <p className="erp-dev-finance__filter-note" role="status">
            没有匹配当前筛选的财务节点，完整业务链仍保留。可清除筛选后查看。
          </p>
        ) : null}
        <div className="erp-dev-finance__lanes" aria-label="跨模块财务关系图">
          {lanes.map((lane) => (
            <section
              key={lane.key}
              className="erp-dev-finance__lane"
              data-finance-lane={lane.key}
              aria-label={lane.label}
            >
              <h3>{lane.label}</h3>
              <FinanceSteps
                nodes={lane.nodes}
                label={`${lane.label}办理顺序`}
                preview={{
                  active: activeNode,
                  setActive: setActiveNode,
                  onExpand: (node, trigger) =>
                    openTopic(
                      node.topic,
                      trigger,
                      node.topic === 'purchase' ? 0 : node.readingStep
                    ),
                }}
              />
            </section>
          ))}
        </div>
        <div className="erp-dev-finance__shortcuts" aria-label="财务专题">
          {[
            ['purchase', '采购退货与数量差额'],
            ['terms', '月结与期间对账'],
            ['permissions', '审批、权限与凭据'],
          ].map(([key, label]) => (
            <Button
              key={key}
              data-finance-node={`topic-${key}`}
              onClick={(event) => openTopic(key, event.currentTarget)}
            >
              {label}
            </Button>
          ))}
        </div>
        <div className="erp-dev-finance__boundary">
          <strong>账款与首款先独立，形成账款后再抵扣</strong>
          <p>
            账款以真实出货、入库或验收为来源；首款可先收付。仓库纠错不会直接改写已过账应付。
          </p>
        </div>
      </WorkbenchSection>
      <Drawer
        title={detailTitle}
        rootClassName="erp-dev-finance-drawer"
        width="min(900px, 92vw)"
        open={Boolean(topic)}
        onClose={closePanel}
        closable={false}
        extra={
          <Button
            icon={<CloseOutlined aria-hidden="true" />}
            onClick={closePanel}
          >
            关闭
          </Button>
        }
        afterOpenChange={(open) => {
          if (!open && opener.current?.isConnected) {
            opener.current.focus({ preventScroll: true })
            setActiveNode(null)
          }
        }}
        destroyOnHidden
      >
        <div
          className="erp-dev-finance erp-dev-finance__detail"
          data-finance-detail={topic}
        >
          <DevTaskNav
            ariaLabel="财务专题内容"
            idPrefix="finance-reading"
            compact
            value={panel}
            onChange={setPanel}
            items={[
              { value: 'detail', label: '办理说明' },
              { value: 'rules', label: '财务口径' },
              { value: 'records', label: '真实记录' },
            ]}
          />
          <div
            role="tabpanel"
            id={`finance-reading-panel-${panel}`}
            aria-labelledby={`finance-reading-tab-${panel}`}
          >
            {!topic ? null : panel === 'rules' ? (
              <FinanceRulesView
                ruleKey={
                  ruleKey ??
                  selected?.rule ??
                  (topic === 'terms' ? 'terms' : 'permissions')
                }
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
              <WorkbenchSection
                description={
                  topic === 'purchase'
                    ? '按应付阶段区分净来源、冻结草稿和过账后差额。'
                    : selected?.summary
                }
                flat
              >
                {topic === 'terms' ? (
                  <>
                    <div className="erp-dev-finance__term-choices">
                      <Button
                        className="erp-dev-finance__node"
                        onClick={() => openRule('terms')}
                      >
                        <strong>月结到期日</strong>
                        <span>中国自然月月末 ＋ 约定天数</span>
                      </Button>
                      <Button
                        className="erp-dev-finance__node"
                        onClick={() => openRule('statement')}
                      >
                        <strong>期间对账</strong>
                        <span>按往来方、币种和中国日期核对余额</span>
                      </Button>
                    </div>
                    <WorkbenchFacts
                      items={[
                        {
                          label: '账期来源',
                          value:
                            '订单冻结的结算方式与天数；默认值变化不重算已有账款。',
                        },
                        {
                          label: '对账口径',
                          value:
                            '按入账、冲回时间核对期间；核销不重复计入收付款金额。',
                        },
                      ]}
                    />
                  </>
                ) : (
                  <>
                    {topic === 'purchase' ? (
                      <div className="erp-dev-finance__scenario-controls">
                        <fieldset>
                          <legend>应付阶段</legend>
                          <Radio.Group
                            aria-label="应付阶段"
                            value={stage}
                            onChange={(event) =>
                              update({
                                [keys.financeStage]: event.target.value,
                                [keys.financeStep]: null,
                              })
                            }
                            options={[
                              { value: 'none', label: '尚未生成' },
                              { value: 'draft', label: '草稿' },
                              { value: 'posted', label: '已过账或结清' },
                            ]}
                            optionType="button"
                          />
                        </fieldset>
                        <fieldset>
                          <legend>来源变化</legend>
                          <AppSelect
                            aria-label="来源变化"
                            allowClear={false} // 不可清空：情景计算必须指定一种来源变化。
                            value={change}
                            onChange={(value) =>
                              update({
                                [keys.financeChange]: value,
                                [keys.financeStep]: null,
                              })
                            }
                            options={[
                              { value: 'return', label: '采购退货' },
                              { value: 'increase', label: '数量调增' },
                              { value: 'transfer', label: '移库或批次修正' },
                            ]}
                          />
                        </fieldset>
                      </div>
                    ) : null}
                    <FinanceSteps
                      nodes={topicSteps}
                      label={`${detailTitle}办理顺序`}
                      selected={step}
                      onSelect={(_node, index) =>
                        update({ [keys.financeStep]: index })
                      }
                    />
                    <div className="erp-dev-finance__explanation">
                      <h3>
                        {topic === 'purchase'
                          ? scenario.title
                          : topicSteps[step]?.label}
                      </h3>
                      {topic !== 'purchase' ||
                      purchaseNotes[step] !== scenario.impact ? (
                        <p>
                          {topic === 'purchase'
                            ? purchaseNotes[step]
                            : FINANCE_TOPIC_STEPS[topic]?.[step]?.[2]}
                        </p>
                      ) : null}
                    </div>
                    {topic === 'purchase' ? (
                      <WorkbenchFacts
                        items={[
                          {
                            label: '谁来处理',
                            value: '仓库维护来源；财务确认账款差额。',
                          },
                          { label: '账款与资金', value: scenario.impact },
                        ]}
                      />
                    ) : null}
                    <div className="erp-dev-finance__detail-actions">
                      <Button
                        onClick={() =>
                          openRule(selected?.rule || 'permissions')
                        }
                      >
                        {topic === 'purchase'
                          ? '查看采购差额规则'
                          : '查看关联规则'}
                      </Button>
                    </div>
                  </>
                )}
              </WorkbenchSection>
            )}
          </div>
        </div>
      </Drawer>
    </div>
  )
}
