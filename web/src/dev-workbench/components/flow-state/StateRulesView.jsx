import React, { useMemo, useState } from 'react'
import { InfoCircleOutlined } from '@ant-design/icons'
import { Button, Dropdown, Empty, Tag } from 'antd'
import { PermissionLabel } from '@/common/consts/permissions.generated.mjs'
import { WorkbenchFacts, WorkbenchSection, WorkbenchToolbar } from '../WorkbenchPattern.jsx'
import Select from '@/common/components/select/AppSelect'
import {
  DEFINITION_SELECT_CLASS_NAMES,
  Text,
  useDefinitionSelectSearch,
  renderDefinitionSelectOption,
} from './FlowStateShared.jsx'
import BusinessFlowDiagram from './BusinessFlowDiagram.jsx'
import { FlowActionRules, MasterLifecycleRules } from './FlowRuleTables.jsx'
import { createDevFlowDefinitionOptionFilter } from '../../pages/devFlowDefinitionSearch.mjs'
import { buildStateDefinitionSelectOptions } from '../../pages/devFlowDefinitionSelectOptions.mjs'
import {
  DEV_FLOW_STATE_TRANSITION_FILTERS,
  buildDevFlowStateNodeSummary,
  buildDevFlowRecordRelationship,
  buildDevFlowStateRelatedViews,
  buildDevFlowStateRuleSummary,
  filterDevFlowStateTransitions,
  getDevFlowStateTransitionPresentation,
  getDevFlowStateTransitionDiagramLabel,
} from '../../pages/devFlowStateRulePresentation.mjs'
import './stateRules.css'

function StateTransitionCard({
  flow,
  index,
  selectedStateKey,
  stateByKey,
  transition,
}) {
  const presentation = getDevFlowStateTransitionPresentation(flow, transition)
  const actionCoveredByPathKind = presentation.pathKinds.some(
    (item) =>
      item.label.includes(presentation.actionLabel) ||
      presentation.actionLabel.includes(item.label)
  )
  const selectedRelated =
    Boolean(selectedStateKey) &&
    (transition.from === selectedStateKey || transition.to === selectedStateKey)
  return (
    <li
      data-transition-key={transition.key}
      data-path-group={presentation.groupKey}
      data-exceptional={presentation.isExceptional ? 'true' : 'false'}
      data-selected-related={selectedRelated ? 'true' : 'false'}
      style={{
        '--erp-dev-state-path-color': presentation.group.diagramStroke,
      }}
    >
      <header className="erp-dev-flow-transition-heading">
        <span aria-hidden="true">{index + 1}</span>
        <strong>
          {stateByKey.get(transition.from)?.label || transition.from} →{' '}
          {stateByKey.get(transition.to)?.label || transition.to}
        </strong>
        <span className="erp-dev-flow-transition-tags">
          {!actionCoveredByPathKind ? (
            <Tag>{presentation.actionLabel}</Tag>
          ) : null}
          {presentation.pathKinds.map((item) => (
            <Tag key={item.key} color={item.color}>
              {item.label}
            </Tag>
          ))}
          {presentation.conditional ? <Tag color="gold">{transition.outcomeDimensionKey ? '结果另记' : '条件适用'}</Tag> : null}
        </span>
      </header>
      <p>什么时候可以：{transition.guard || '按对应领域合同校验。'}</p>
      {transition.permission.length > 0 ? (
        <p>办理权限：{transition.permission.map((key) => PermissionLabel[key]).filter(Boolean).join('、')}</p>
      ) : null}
      {presentation.condition ? (
        <p className="erp-dev-flow-transition-condition">
          <InfoCircleOutlined />
          <span>
            <strong>{transition.outcomeDimensionKey ? '结束结果：' : '仅在以下条件归入该路径：'}</strong>
            {presentation.condition}
          </span>
        </p>
      ) : null}

    </li>
  )
}

function StateRulesView({
  catalog,
  projection,
  flow,
  state,
  onSelectFlow,
  onSelectState,
  onOpenView,
  ruleTools,
  ruleAction,
  onSelectRuleAction,
}) {
  const flows = projection ? projection.flows : catalog.flows
  const scopedCatalog = useMemo(() => ({ ...catalog, flows }), [catalog, flows])
  const searchProps = useDefinitionSelectSearch()
  const options = useMemo(
    () => buildStateDefinitionSelectOptions(scopedCatalog),
    [scopedCatalog]
  )
  const optionFilter = useMemo(
    () => createDevFlowDefinitionOptionFilter(scopedCatalog, 'stateOptions'),
    [scopedCatalog]
  )
  return (
    <div className="erp-dev-flow-view-stack">
      <WorkbenchToolbar className="erp-dev-flow-definition-selector">
        <Select
          placeholder="选择状态对象"
          id="dev-flow-state-select"
          aria-label="选择状态对象"
          showSearch
          virtual={false}
          popupMatchSelectWidth={false}
          {...searchProps}
          classNames={DEFINITION_SELECT_CLASS_NAMES}
          filterOption={optionFilter}
          notFoundContent="没有匹配的状态对象"
          value={flow?.key}
          labelRender={() => flow?.label}
          options={options}
          optionRender={renderDefinitionSelectOption}
          onChange={onSelectFlow}
        />
        {ruleTools}
      </WorkbenchToolbar>
      {flow ? <StateRuleDetail key={flow.key} catalog={catalog} flow={flow} state={state} onSelectState={onSelectState} onOpenView={onOpenView} ruleAction={ruleAction} onSelectRuleAction={onSelectRuleAction} /> : <Empty description="请选择状态对象" />}
    </div>
  )
}

function StateRuleDetail({ catalog, flow, state, onSelectState, onOpenView, ruleAction, onSelectRuleAction }) {
  const [transitionFilter, setTransitionFilter] = useState(
    DEV_FLOW_STATE_TRANSITION_FILTERS.all
  )
  const stateByKey = useMemo(
    () => new Map(flow.states.map((item) => [item.key, item])),
    [flow]
  )
  const stateSummaries = useMemo(
    () =>
      new Map(
        flow.states.map((item) => [
          item.key,
          buildDevFlowStateNodeSummary(flow, item),
        ])
      ),
    [flow]
  )
  const selectedStateSummary = state ? stateSummaries.get(state.key) : null
  const summary = useMemo(() => buildDevFlowStateRuleSummary(flow), [flow])

  const visibleTransitions = useMemo(
    () => filterDevFlowStateTransitions(flow, state?.key, transitionFilter),
    [flow, state?.key, transitionFilter]
  )
  const transitionOrder = useMemo(
    () => new Map(flow.transitions.map((item, index) => [item.key, index])),
    [flow]
  )
  const relatedTransitionCount = state
    ? filterDevFlowStateTransitions(
        flow,
        state.key,
        DEV_FLOW_STATE_TRANSITION_FILTERS.related
      ).length
    : 0
  const filterOptions = [
    {
      key: DEV_FLOW_STATE_TRANSITION_FILTERS.standard,
      label: '正常推进',
      count: filterDevFlowStateTransitions(flow, '', DEV_FLOW_STATE_TRANSITION_FILTERS.standard).length,
    },
    {
      key: DEV_FLOW_STATE_TRANSITION_FILTERS.all,
      label: '全部',
      count: summary.transitionCount,
    },
    ...(summary.exceptionalTransitionCount > 0
      ? [
          {
            key: DEV_FLOW_STATE_TRANSITION_FILTERS.exceptional,
            label: '异常与纠正',
            count: summary.exceptionalTransitionCount,
          },
        ]
      : []),
    ...(state
      ? [
          {
            key: DEV_FLOW_STATE_TRANSITION_FILTERS.related,
            label: '当前状态',
            count: relatedTransitionCount,
          },
        ]
      : []),
  ]
  const graph = useMemo(() => ({
    entryNodeKeys: flow.initialStates,
    nodes: flow.states.filter((item) => transitionFilter === DEV_FLOW_STATE_TRANSITION_FILTERS.all || item.key === state?.key || visibleTransitions.some((edge) => edge.from === item.key || edge.to === item.key)).map((item) => ({ ...item, kind: flow.terminalStates.includes(item.key) ? 'terminal' : 'state' })),
    edges: visibleTransitions.map((item) => { const { group } = getDevFlowStateTransitionPresentation(flow, item); return { ...item, label: getDevFlowStateTransitionDiagramLabel(item), condition: item.guard, stroke: group.diagramStroke, dasharray: group.diagramStrokeDasharray } }),
  }), [flow, visibleTransitions, state?.key, transitionFilter])
  const focusedTransitions = state ? visibleTransitions.filter((item) => item.from === state.key || item.to === state.key) : []
  const recordRelationship = useMemo(() => buildDevFlowRecordRelationship(flow), [flow])
  const related = useMemo(() => buildDevFlowStateRelatedViews(catalog, flow), [catalog, flow])
  const relatedItems = [
    ...related.facts.map((item) => ({ key: `fact:${item.factKey}`, label: `${item.label} · 事实规则`, view: 'facts', patch: { fact: item.factKey } })),
    ...related.chains.map((item) => ({ key: item.key, label: `${item.chainLabel} / ${item.nodeLabel}`, view: 'chain', patch: { chain: item.chainKey, node: item.nodeKey } })),
  ]

  const renderTransitions = (items) => items.length ? (
    <ol>{items.map((transition) => <StateTransitionCard key={transition.key} flow={flow} index={transitionOrder.get(transition.key) || 0} selectedStateKey={state?.key || ''} stateByKey={stateByKey} transition={transition} />)}</ol>
  ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前筛选没有登记的转换" />

  return (
    <WorkbenchSection flat className="erp-dev-flow-state-rule" data-selected-flow={flow.key} data-record-reference={recordRelationship ? 'true' : undefined} aria-label={flow.label}>
      <div className="erp-dev-rule-heading">
        <h2>{flow.label}</h2>
        <Tag>{recordRelationship ? '不可变记录' : flow.transitions.length ? '状态流转' : flow.lifecycleRules.length ? '启停规则' : '状态分类'}</Tag>
        {relatedItems.length && onOpenView ? (
          <Dropdown menu={{ items: relatedItems.map(({ key, label }) => ({ key, label })), onClick: ({ key }) => { const item = relatedItems.find((item) => item.key === key); onOpenView(item.view, item.patch) } }}>
            <Button>关联查看</Button>
          </Dropdown>
        ) : null}
      </div>
      <p>{recordRelationship ? '纠正时另建反向记录，原记录保持不变。' : flow.guard}</p>
      <div className="erp-dev-rule-layout" data-split={flow.transitions.length > 0 || recordRelationship ? 'true' : undefined}>
        <div className="erp-dev-rule-graph">
          {recordRelationship ? (
            <BusinessFlowDiagram relationships flow={recordRelationship} label={`${flow.label}记录引用关系图`} selectedKey={state?.key} onSelect={(key) => onSelectState(key === state?.key ? null : key)} legend="箭头表示记录引用；两条记录分别保留。" />
      ) : flow.transitions.length > 0 ? (
        <>
          <div className="erp-dev-flow-transition-toolbar">
            <div className="erp-dev-flow-transition-filters" role="group" aria-label="状态转换筛选">
              {filterOptions.map((option) => <Button key={option.key} size="small" type={transitionFilter === option.key ? 'primary' : 'default'} aria-pressed={transitionFilter === option.key} onClick={() => setTransitionFilter(option.key)}>{option.label} {option.count}</Button>)}
            </div>
            <Select id="dev-flow-state-focus" aria-label="聚焦状态" allowClear showSearch optionFilterProp="label" placeholder="定位状态" value={state?.key} options={flow.states.map((item) => ({ value: item.key, label: item.label }))} onChange={(key) => onSelectState(key || null)} />
          </div>
          {visibleTransitions.length > 0 || state ? (
            <BusinessFlowDiagram relationships legend="实线：状态转换 · 虚线：分支或纠正 · 点选状态查看条件。" flow={graph} label={`${flow.label}状态转换图`} selectedKey={state?.key} onSelect={(key) => onSelectState(key === state?.key ? null : key)} />
          ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前筛选没有登记的转换" />}
        </>
      ) : flow.lifecycleRules.length === 0 ? <WorkbenchFacts items={flow.states.map((item) => ({ label: item.label, value: item.summary || '由对象专属规则约束' }))} /> : null}
        </div>
        <div className="erp-dev-rule-inspection">
          {recordRelationship ? (
            <section className="erp-dev-flow-selected-state" aria-label="记录与纠正规则" aria-live="polite">
              <h3>{state ? recordRelationship.nodes.find((node) => node.key === state.key)?.label : '记录与纠正'}</h3>
              <WorkbenchFacts items={[
            { label: '原记录', value: '已过账后继续留存，不能更新或删除。' },
            { label: '纠正方式', value: '另建反向记录并引用原记录；不修改原行状态。' },
            { label: '关联核对', value: '同时保留原记录、反向记录及所属账款的关联。' },
          ]}
              />
            </section>
      ) : (
        <>
          {flow.lifecycleRules.length === 0 ? (
          state ? (
            <section className="erp-dev-flow-selected-state" aria-live="polite">
              <div><h3>{state.label}</h3><Text type="secondary">{selectedStateSummary?.positionLabel}</Text></div>
              <div className="erp-dev-flow-selected-state__meaning"><p>{state.summary || (flow.transitions.length > 0 ? '查看下面允许进入和离开的转换。' : flow.guard)}</p></div>
              {flow.transitions.length > 0 ? (
                <section className="erp-dev-flow-transitions" aria-label="当前状态的转换条件">
                  {renderTransitions(focusedTransitions)}
                </section>
              ) : null}
            </section>
          ) : flow.transitions.length > 0 ? <Text type="secondary">点选状态查看进入和离开的条件。</Text> : null
      ) : null}
          <FlowActionRules flow={flow} stateKey={state?.key || ''} selectedKey={ruleAction} onSelect={onSelectRuleAction} />
          <MasterLifecycleRules flow={flow} selectedKey={ruleAction} onSelect={onSelectRuleAction} />
        </>
      )}
        </div>
      </div>
      {flow.dimensions.length > 0 ? (
        <section aria-label="关联状态与结果" className="erp-dev-flow-rule-dimensions">
          {flow.dimensions.map((dimension) => (
            <div key={dimension.key}>
              <h3>{dimension.label}</h3>
              <p>{dimension.states.map((item) => item.label).join(' / ')}</p>
              <Text type="secondary">{dimension.guard}</Text>
            </div>
          ))}
        </section>
      ) : null}
    </WorkbenchSection>
  )
}

export { StateRulesView }
