import React, { useEffect, useMemo, useState } from 'react'
import {
  DatabaseOutlined,
  InfoCircleOutlined,
  PartitionOutlined,
  SearchOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import { Button, Empty, Popover, Tag } from 'antd'
import { WorkbenchFacts, WorkbenchSection } from '../WorkbenchPattern.jsx'
import Select from '@/common/components/select/AppSelect'
import { BusinessChainProjectionContext } from './FlowTaskContext.jsx'
import {
  DEFINITION_SELECT_CLASS_NAMES,
  Text,
  useDefinitionSelectSearch,
  renderDefinitionSelectOption,
  asArray,
  EvidenceDisclosure,
  KeyValue,
} from './FlowStateShared.jsx'
import BusinessFlowDiagram from './BusinessFlowDiagram.jsx'
import { FlowActionRules, MasterLifecycleRules } from './FlowRuleTables.jsx'
import { createDevFlowDefinitionOptionFilter } from '../../pages/devFlowDefinitionSearch.mjs'
import { buildStateDefinitionSelectOptions } from '../../pages/devFlowDefinitionSelectOptions.mjs'
import {
  DEV_FLOW_STATE_TRANSITION_FILTERS,
  buildDevFlowStateNodeSummary,
  buildDevFlowStateRelatedViews,
  buildDevFlowStateRuleSummary,
  filterDevFlowStateTransitions,
  getDevFlowStateTransitionPresentation,
  getDevFlowStateTransitionDiagramLabel,
  listDevFlowStatePathGroups,
} from '../../pages/devFlowStateRulePresentation.mjs'
import { DEV_FLOW_STATE_QUERY_KEYS as QUERY_KEYS } from '../../pages/devFlowStateQuery.mjs'

function StatePathLegend({ groups }) {
  if (groups.length === 0) return null
  return (
    <section
      className="erp-dev-flow-state-path-legend"
      aria-labelledby="dev-flow-state-path-legend-title"
    >
      <div>
        <Text strong id="dev-flow-state-path-legend-title">
          图和清单怎么读
        </Text>
        <Text type="secondary">
          图中的彩色线和短标签共同区分路径；清单再解释条件和影响边界，不只靠颜色判断。
        </Text>
      </div>
      <div role="list">
        {groups.map((group) => (
          <article
            key={group.key}
            role="listitem"
            data-path-group={group.key}
            style={{ '--erp-dev-state-path-color': group.diagramStroke }}
          >
            <span aria-hidden="true" />
            <strong>{group.label}</strong>
            <small>{group.description}</small>
          </article>
        ))}
      </div>
    </section>
  )
}

function StateRuleRelatedViews({ relatedViews, onOpenView }) {
  const hasTargets =
    relatedViews.direct.length > 0 ||
    relatedViews.facts.length > 0 ||
    relatedViews.chains.length > 0
  if (!hasTargets) return null

  const openTarget = (target) => {
    if (target.type === 'chain') {
      onOpenView('chain', {
        [QUERY_KEYS.chain]: target.chainKey,
        [QUERY_KEYS.node]: target.nodeKey,
      })
    } else if (target.type === 'facts') {
      onOpenView('facts', { [QUERY_KEYS.fact]: target.factKey })
    } else {
      onOpenView(target.type)
    }
  }

  const chainPicker = (
    <div className="erp-dev-flow-state-related-chain-picker">
      {relatedViews.chains.map((target) => (
        <Button
          key={target.key}
          type="text"
          onClick={() => openTarget(target)}
          data-related-chain={target.chainKey}
        >
          <strong>{target.chainLabel}</strong>
          <small>{target.nodeLabel}</small>
        </Button>
      ))}
    </div>
  )

  return (
    <section className="erp-dev-flow-state-related-views">
      <div className="erp-dev-flow-state-related-actions">
        {relatedViews.direct.map((target) => (
          <Button
            key={target.key}
            icon={
              target.type === 'workflow' ? (
                <TeamOutlined />
              ) : (
                <PartitionOutlined />
              )
            }
            onClick={() => openTarget(target)}
            data-related-view={target.type}
          >
            {target.label}
          </Button>
        ))}
        {relatedViews.facts.map((target) => (
          <Button
            key={target.key}
            icon={<DatabaseOutlined />}
            onClick={() => openTarget(target)}
            data-related-view="facts"
          >
            查看{target.label}
          </Button>
        ))}
        {relatedViews.chains.length === 1 ? (
          <Button
            icon={<SearchOutlined />}
            onClick={() => openTarget(relatedViews.chains[0])}
            data-related-view="chain"
          >
            查看相关业务链
          </Button>
        ) : null}
        {relatedViews.chains.length > 1 ? (
          <Popover
            trigger="click"
            placement="bottomRight"
            title="选择业务链位置"
            content={chainPicker}
          >
            <Button icon={<SearchOutlined />} data-related-view="chain">
              相关业务链（{relatedViews.chains.length}）
            </Button>
          </Popover>
        ) : null}
      </div>
    </section>
  )
}

function StateTransitionCard({
  flow,
  index,
  selectedStateKey,
  stateByKey,
  transition,
  showInternal = false,
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
          {presentation.conditional ? <Tag color="gold">条件适用</Tag> : null}
        </span>
      </header>
      <p>什么时候可以：{transition.guard || '按对应领域合同校验。'}</p>
      {presentation.condition ? (
        <p className="erp-dev-flow-transition-condition">
          <InfoCircleOutlined />
          <span>
            <strong>仅在以下条件归入该路径：</strong>
            {presentation.condition}
          </span>
        </p>
      ) : null}
      {showInternal ? (
        <dl>
          <div><dt>转换后到哪里</dt><dd>{presentation.destinationSummary}</dd></div>
          <div><dt>action</dt><dd><KeyValue value={transition.action} /></dd></div>
          <div><dt>内部影响边界</dt><dd>{transition.factBoundary}</dd></div>
          <div><dt>权限</dt><dd>{transition.systemOnly ? '系统内部触发；入口权限由来源动作校验' : asArray(transition.permission).join('、') || '见所属领域动作合同'}</dd></div>
        </dl>
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
  onBackToChain,
  onClearChainContext,
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
      <BusinessChainProjectionContext
        projection={projection}
        onBackToChain={onBackToChain}
        onClearChainContext={onClearChainContext}
      />
      <section className="erp-dev-flow-definition-selector">
        <label htmlFor="dev-flow-state-select">选择状态对象</label>
        <Select
          placeholder="选择状态对象"
          id="dev-flow-state-select"
          aria-label="选择状态对象"
          showSearch
          virtual={false}
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
      </section>
      {flow ? <StateRuleDetail key={flow.key} catalog={catalog} flow={flow} state={state} onSelectState={onSelectState} onOpenView={onOpenView} /> : <Empty description="请选择状态对象" />}
    </div>
  )
}

function StateRuleDetail({ catalog, flow, state, onSelectState, onOpenView }) {
  const [transitionFilter, setTransitionFilter] = useState(
    DEV_FLOW_STATE_TRANSITION_FILTERS.standard
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
  const pathGroups = useMemo(() => listDevFlowStatePathGroups(flow), [flow])
  const scope = useMemo(
    () => catalog.scopes.find((item) => item.key === flow.scopeKey) || null,
    [catalog.scopes, flow.scopeKey]
  )
  const relatedViews = useMemo(
    () => buildDevFlowStateRelatedViews(catalog, flow),
    [catalog, flow]
  )
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
      count: summary.transitionCount - summary.exceptionalTransitionCount,
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
    nodes: flow.states.filter((item) => item.key === state?.key || visibleTransitions.some((edge) => edge.from === item.key || edge.to === item.key)).map((item) => ({ ...item, kind: flow.terminalStates.includes(item.key) ? 'terminal' : 'state' })),
    edges: visibleTransitions.map((item) => { const { group } = getDevFlowStateTransitionPresentation(flow, item); return { ...item, label: getDevFlowStateTransitionDiagramLabel(item), condition: item.guard, stroke: group.diagramStroke, dasharray: group.diagramStrokeDasharray } }),
  }), [flow, visibleTransitions, state?.key])
  const focusedTransitions = state ? visibleTransitions.filter((item) => item.from === state.key || item.to === state.key) : []
  useEffect(() => {
    setTransitionFilter(state?.key ? DEV_FLOW_STATE_TRANSITION_FILTERS.related : DEV_FLOW_STATE_TRANSITION_FILTERS.standard)
  }, [flow.key, state?.key])

  const renderTransitions = (items, showInternal = false) => items.length ? (
    <ol>{items.map((transition) => <StateTransitionCard key={transition.key} flow={flow} index={transitionOrder.get(transition.key) || 0} selectedStateKey={state?.key || ''} stateByKey={stateByKey} transition={transition} showInternal={showInternal} />)}</ol>
  ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前筛选没有登记的转换" />

  return (
    <WorkbenchSection flat className="erp-dev-flow-state-rule" data-selected-flow={flow.key} title={flow.label}>
      <Text type="secondary">{flow.guard}</Text>
      {flow.transitions.length > 0 ? (
        <>
          <div className="erp-dev-flow-transition-toolbar">
            <div className="erp-dev-flow-transition-filters" role="group" aria-label="状态转换筛选">
              {filterOptions.map((option) => <Button key={option.key} size="small" type={transitionFilter === option.key ? 'primary' : 'default'} aria-pressed={transitionFilter === option.key} onClick={() => setTransitionFilter(option.key)}>{option.label} {option.count}</Button>)}
            </div>
            <Text className="erp-dev-flow-transition-result-count" type="secondary" role="status" aria-live="polite">当前显示 {visibleTransitions.length} / {summary.transitionCount} 条</Text>
          </div>
          {visibleTransitions.length > 0 || state ? (
            <BusinessFlowDiagram flow={graph} label={`${flow.label}状态转换图`} selectedKey={state?.key} onSelect={(key) => onSelectState(key === state?.key ? null : key)} />
          ) : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="当前筛选没有登记的转换" />}
        </>
      ) : flow.lifecycleRules.length === 0 ? <WorkbenchFacts items={flow.states.map((item) => ({ label: item.label, value: item.summary || '独立状态维度，不表示办理先后' }))} /> : null}
      {flow.lifecycleRules.length === 0 ? (
        <>
          <div className="erp-dev-flow-inline-note">
            <label htmlFor="dev-flow-state-focus">聚焦状态</label>
            <Select id="dev-flow-state-focus" aria-label="聚焦状态" allowClear placeholder="在图中点选或选择状态" value={state?.key} options={flow.states.map((item) => ({ value: item.key, label: item.label }))} onChange={(key) => onSelectState(key || null)} />
          </div>
          {state ? (
            <section className="erp-dev-flow-selected-state" aria-live="polite">
              <div><h3>{state.label}</h3><Text type="secondary">{selectedStateSummary?.positionLabel}</Text></div>
              <div className="erp-dev-flow-selected-state__meaning"><p>{state.summary || (flow.transitions.length > 0 ? '查看下面允许进入和离开的转换。' : flow.guard)}</p></div>
              {flow.transitions.length > 0 ? (
                <section className="erp-dev-flow-transitions" aria-label="当前状态的转换条件">
                  {renderTransitions(focusedTransitions)}
                </section>
              ) : null}
            </section>
          ) : <Text type="secondary">{flow.transitions.length > 0 ? '点选状态，查看进入、离开条件和转换结果。' : '以上为独立状态分类，不表示办理先后。'}</Text>}
        </>
      ) : null}
      <FlowActionRules flow={flow} />
      <MasterLifecycleRules flow={flow} />
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
      <StateRuleRelatedViews relatedViews={relatedViews} onOpenView={onOpenView} />
      {flow.transitions.length > 0 ? (
        <details className="erp-dev-disclosure erp-dev-flow-transitions" data-all-transitions>
          <summary>完整转换清单（{visibleTransitions.length}）</summary>
          {renderTransitions(visibleTransitions, true)}
        </details>
      ) : null}
      <EvidenceDisclosure
        value={{
          sourceRefs: [...asArray(flow.sourceRefs), ...flow.actionRules.flatMap((item) => item.sourceRefs), ...flow.lifecycleRules.flatMap((item) => item.sourceRefs), ...flow.dimensions.map((item) => item.contractRef.path), ...asArray(state?.sourceRefs), ...visibleTransitions.flatMap((item) => asArray(item.sourceRefs))],
          evidence: [...asArray(flow.evidence), ...asArray(state?.evidence), ...visibleTransitions.flatMap((item) => asArray(item.evidence))],
        }}
        label="状态与规则依据"
      >
        <WorkbenchFacts items={[
          { label: '状态对象', value: <KeyValue value={flow.key} /> },
          { label: '选中状态', value: state ? <KeyValue value={state.key} /> : '未选择' },
          { label: '定义范围', value: flow.summary },
          { label: '规则边界', value: scope?.guardrail || flow.guard },
          { label: '目录概览', value: `${summary.stateCount} 个状态 · ${summary.transitionCount} 条转换 · ${summary.exceptionalTransitionCount} 条异常或纠正路径 · ${summary.terminalCount} ${summary.terminalPolicyLabel}` },
        ]}
        />
        <StatePathLegend groups={pathGroups} />
      </EvidenceDisclosure>
    </WorkbenchSection>
  )
}

export { StateRulesView }
