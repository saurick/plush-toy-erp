import React, { useEffect, useMemo, useState } from 'react'
import {
  DatabaseOutlined,
  InfoCircleOutlined,
  PartitionOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  TeamOutlined,
} from '@ant-design/icons'
import { Button, Empty, Popover, Select, Tag } from 'antd'
import { BusinessChainProjectionContext } from './FlowTaskContext.jsx'
import {
  DEFINITION_SELECT_CLASS_NAMES,
  Paragraph,
  Text,
  Title,
  useDefinitionSelectSearch,
  renderDefinitionSelectOption,
  asArray,
  EvidenceDisclosure,
  KeyValue,
  GuidanceDisclosure,
} from './FlowStateShared.jsx'
import { Markdown } from '@/common/components/markdown'
import { createDevFlowDefinitionOptionFilter } from '../../pages/devFlowDefinitionSearch.mjs'
import { buildStateDefinitionSelectOptions } from '../../pages/devFlowDefinitionSelectOptions.mjs'
import {
  DEV_FLOW_STATE_TRANSITION_FILTERS,
  buildDevFlowStateNodeSummary,
  buildDevFlowStateRelatedViews,
  buildDevFlowStateRuleMermaid,
  buildDevFlowStateRuleSummary,
  filterDevFlowStateTransitions,
  getDevFlowStateTransitionPresentation,
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
      <div>
        <Text strong>要看实际原因或完整影响</Text>
        <Text type="secondary">
          状态规则只说明“允许怎样变化”；实际办理、运行位置和已生效结果回到对应视图核对。
        </Text>
      </div>
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
  scope,
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
          {presentation.conditional ? <Tag color="gold">条件适用</Tag> : null}
        </span>
      </header>
      <dl className="erp-dev-flow-transition-explanation">
        <div>
          <dt>什么时候可以</dt>
          <dd>{transition.guard || '按对应领域合同校验。'}</dd>
        </div>
        <div>
          <dt>转换后到哪里</dt>
          <dd>{presentation.destinationSummary}</dd>
        </div>
        <div>
          <dt>这条路径代表什么</dt>
          <dd>{presentation.group.description}</dd>
        </div>
        <div>
          <dt>影响边界</dt>
          <dd>
            {scope
              ? `${scope.label}：${scope.guardrail}`
              : '影响范围回到当前对象的正式领域合同核对。'}
          </dd>
        </div>
      </dl>
      {presentation.condition ? (
        <p className="erp-dev-flow-transition-condition">
          <InfoCircleOutlined />
          <span>
            <strong>仅在以下条件归入该路径：</strong>
            {presentation.condition}
          </span>
        </p>
      ) : null}
      <details>
        <summary>查看内部规则</summary>
        <dl>
          <div>
            <dt>action</dt>
            <dd>
              <KeyValue value={transition.action} />
            </dd>
          </div>
          <div>
            <dt>内部影响边界</dt>
            <dd>{transition.factBoundary}</dd>
          </div>
          <div>
            <dt>权限</dt>
            <dd>
              {asArray(transition.permission).join('、') || '无额外权限声明'}
            </dd>
          </div>
        </dl>
        <EvidenceDisclosure value={transition} />
      </details>
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
  const [transitionFilter, setTransitionFilter] = useState(
    DEV_FLOW_STATE_TRANSITION_FILTERS.all
  )
  const searchProps = useDefinitionSelectSearch()
  const options = useMemo(
    () => buildStateDefinitionSelectOptions(scopedCatalog),
    [scopedCatalog]
  )
  const optionFilter = useMemo(
    () => createDevFlowDefinitionOptionFilter(scopedCatalog, 'stateOptions'),
    [scopedCatalog]
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
  const mermaid = useMemo(() => buildDevFlowStateRuleMermaid(flow), [flow])

  useEffect(() => {
    setTransitionFilter(
      state
        ? DEV_FLOW_STATE_TRANSITION_FILTERS.related
        : DEV_FLOW_STATE_TRANSITION_FILTERS.all
    )
  }, [flow.key, state])

  return (
    <div className="erp-dev-flow-view-stack">
      <GuidanceDisclosure
        guidanceKey="states"
        title="状态机管“规则”"
        summary="规则视图不是运行实例或事实凭证"
        description="它回答当前所选对象有哪些状态、允许怎样转换，以及取消、退回、冲正或返工后到哪里。这里只展示这个对象自己的合法转换，不把另一个对象的异常结果补造成它的状态；实际发生了什么仍回到任务、运行路径或已生效结果核对。"
      />
      <BusinessChainProjectionContext
        projection={projection}
        onBackToChain={onBackToChain}
        onClearChainContext={onClearChainContext}
      />
      <section className="erp-dev-flow-definition-selector">
        <label htmlFor="dev-flow-state-select">选择状态对象</label>
        <Select
          id="dev-flow-state-select"
          aria-label="选择状态对象"
          showSearch
          virtual={false}
          {...searchProps}
          classNames={DEFINITION_SELECT_CLASS_NAMES}
          filterOption={optionFilter}
          notFoundContent="没有匹配的状态对象"
          value={flow.key}
          options={options}
          optionRender={renderDefinitionSelectOption}
          onChange={onSelectFlow}
        />
      </section>
      <section
        className="erp-dev-flow-state-rule"
        data-selected-flow={flow.key}
      >
        <div className="erp-dev-flow-section-heading">
          <div>
            <Text className="erp-dev-flow-eyebrow">状态规则定义</Text>
            <Title level={2}>{flow.label}</Title>
            <KeyValue value={flow.key} />
          </div>
          <Tag color="green">只读规则</Tag>
        </div>
        <Paragraph>{flow.summary}</Paragraph>
        <div
          className="erp-dev-flow-state-overview"
          role="list"
          aria-label={`${flow.label}状态规则概览`}
        >
          <article role="listitem">
            <strong>{summary.stateCount}</strong>
            <span>个状态</span>
          </article>
          <article role="listitem">
            <strong>{summary.transitionCount}</strong>
            <span>条合法转换</span>
          </article>
          <article role="listitem">
            <strong>{summary.exceptionalTransitionCount}</strong>
            <span>条异常或纠正路径</span>
          </article>
          <article role="listitem">
            <strong>{summary.terminalCount}</strong>
            <span>{summary.terminalPolicyLabel}</span>
          </article>
        </div>
        <section className="erp-dev-flow-state-boundary">
          <SafetyCertificateOutlined />
          <div>
            <strong>{scope?.label || '当前对象'}的规则边界</strong>
            <p>{flow.guard}</p>
            {scope?.guardrail ? <small>{scope.guardrail}</small> : null}
          </div>
        </section>
        <StatePathLegend groups={pathGroups} />
        <div className="erp-dev-flow-state-layout">
          <div
            className="erp-dev-flow-state-graph erp-dev-docs-markdown"
            role="region"
            aria-label={`${flow.label}状态转换图`}
          >
            <Markdown source={`\`\`\`mermaid\n${mermaid}\n\`\`\``} />
          </div>
          <div className="erp-dev-flow-state-list">
            <div className="erp-dev-flow-state-list__heading">
              <h3>选择状态</h3>
              <small>点击后聚焦相关转换，再次点击可取消聚焦。</small>
            </div>
            <ul>
              {flow.states.map((item) => {
                const itemSummary = stateSummaries.get(item.key)
                const selected = item.key === state?.key
                return (
                  <li key={item.key}>
                    <button
                      type="button"
                      className={selected ? 'is-selected' : ''}
                      aria-pressed={selected}
                      aria-label={`${item.label}，${itemSummary.positionLabel}，${itemSummary.incoming.length} 条进入，${itemSummary.outgoing.length} 条离开；${selected ? '取消聚焦' : '查看相关转换'}`}
                      data-state-position={
                        itemSummary.initial
                          ? 'initial'
                          : itemSummary.terminal
                            ? 'terminal'
                            : 'middle'
                      }
                      onClick={() => onSelectState(selected ? null : item.key)}
                    >
                      <strong>{item.label}</strong>
                      <KeyValue value={item.key} copyable={false} />
                      <span>
                        {itemSummary.positionLabel} ·{' '}
                        {itemSummary.incoming.length} 条进入 ·{' '}
                        {itemSummary.outgoing.length} 条离开
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        </div>
        {state ? (
          <section className="erp-dev-flow-selected-state">
            <div>
              <Text className="erp-dev-flow-eyebrow">当前选择</Text>
              <h3>{state.label}</h3>
              <KeyValue value={state.key} />
            </div>
            <div className="erp-dev-flow-selected-state__meaning">
              <p>
                {state.summary ||
                  '目录未提供额外说明，请结合允许进入和离开的转换理解。'}
              </p>
              <dl>
                <div>
                  <dt>状态位置</dt>
                  <dd>{selectedStateSummary?.positionLabel}</dd>
                </div>
                <div>
                  <dt>如何进入</dt>
                  <dd>
                    {selectedStateSummary?.incoming.length || 0} 条登记路径
                    {selectedStateSummary?.incomingExceptionalCount
                      ? `，其中 ${selectedStateSummary.incomingExceptionalCount} 条属于异常或纠正`
                      : ''}
                  </dd>
                </div>
                <div>
                  <dt>怎样离开</dt>
                  <dd>
                    {selectedStateSummary?.outgoing.length || 0} 条登记路径
                    {selectedStateSummary?.outgoingExceptionalCount
                      ? `，其中 ${selectedStateSummary.outgoingExceptionalCount} 条属于异常或纠正`
                      : ''}
                  </dd>
                </div>
              </dl>
            </div>
            <EvidenceDisclosure value={state} />
          </section>
        ) : null}
        <StateRuleRelatedViews
          relatedViews={relatedViews}
          onOpenView={onOpenView}
        />
        <section className="erp-dev-flow-transitions">
          <div className="erp-dev-flow-transition-toolbar">
            <div>
              <Text strong>允许的状态转换</Text>
              <Text type="secondary">
                先看条件、结果和影响边界；内部 action、权限与代码证据按需展开。
              </Text>
            </div>
            <div
              className="erp-dev-flow-transition-filters"
              role="group"
              aria-label="状态转换筛选"
            >
              {filterOptions.map((option) => (
                <Button
                  key={option.key}
                  size="small"
                  type={transitionFilter === option.key ? 'primary' : 'default'}
                  aria-pressed={transitionFilter === option.key}
                  onClick={() => setTransitionFilter(option.key)}
                >
                  {option.label} {option.count}
                </Button>
              ))}
            </div>
            <Text
              className="erp-dev-flow-transition-result-count"
              type="secondary"
              role="status"
              aria-live="polite"
            >
              当前显示 {visibleTransitions.length} / {summary.transitionCount}{' '}
              条
            </Text>
          </div>
          {visibleTransitions.length > 0 ? (
            <ol>
              {visibleTransitions.map((transition) => (
                <StateTransitionCard
                  key={transition.key}
                  flow={flow}
                  index={transitionOrder.get(transition.key) || 0}
                  scope={scope}
                  selectedStateKey={state?.key || ''}
                  stateByKey={stateByKey}
                  transition={transition}
                />
              ))}
            </ol>
          ) : (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description="当前筛选下没有登记的转换；这不表示可以任意改状态。"
            />
          )}
        </section>
        <EvidenceDisclosure value={flow} label="查看状态机证据" />
      </section>
    </div>
  )
}

export { StateRulesView }
