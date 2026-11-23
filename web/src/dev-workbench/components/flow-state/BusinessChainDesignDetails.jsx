import React, { useMemo, useState } from 'react'
import { Button } from 'antd'
import AppSelect from '@/common/components/select/AppSelect.jsx'
import SlidingTabList from '@/common/components/navigation/SlidingTabList.jsx'
import {
  describeDevBusinessChainStep,
  describeDevBusinessChainResponsibility,
} from '../../config/devBusinessChainProjection.mjs'
import {
  CHAIN_DESIGN_DOMAINS,
  CHAIN_DESIGN_TYPES,
} from '../../config/devBusinessChainDesign.mjs'
import {
  businessChainNodeContext,
  businessChainNeighbors,
} from '../../config/devBusinessChainDesignView.mjs'
import { businessChainApprovalChoices } from '../../config/devBusinessChainReading.mjs'
import { buildDevFlowStateRuleGraph } from '../../pages/devFlowStateRulePresentation.mjs'
import BusinessFlowDiagram from './BusinessFlowDiagram.jsx'
import { ChainApprovalDetails } from './BusinessChainReadingDetails.jsx'

export function ChainDesignEvidence({ evidence }) {
  if (!evidence) return null
  return (
    <div className="erp-chain-design__evidence">
      {evidence.via ? (
        <p>
          <strong>交接依据：</strong>
          {evidence.via}
        </p>
      ) : null}
      <p>
        <strong>接入条件：</strong>
        {evidence.condition || '按下列状态与办理约束核对。'}
      </p>
      {evidence.preconditions.map((text) => (
        <p key={text}>{text}</p>
      ))}
      {evidence.guards.map((text) => (
        <p key={text}>{text}</p>
      ))}
      <p>
        <strong>办理岗位：</strong>
        {evidence.responsibility}
      </p>
      {evidence.results.map((text) => (
        <p key={text} className="erp-chain-design__state-path">
          {text}
        </p>
      ))}
      <p className="erp-chain-design__muted">
        依据：{evidence.chainLabel} · {evidence.label}
      </p>
    </div>
  )
}

function StatePreview({ catalog, node }) {
  const flows = node.machineKeys
    .map((key) => catalog.flows.find((flow) => flow.key === key))
    .filter(Boolean)
  const references = node.steps.flatMap((step) =>
    node.type === 'system' ? step.resultStateRefs || [] : step.preconditionStateRefs || []
  )
  const initial = references.find((ref) => flows.some((flow) => flow.key === ref.machineKey))
  const [flowKey, setFlowKey] = useState(initial?.machineKey || flows[0]?.key)
  const flow = flows.find((item) => item.key === flowKey) || flows[0]
  const [selected, setSelected] = useState(
    initial?.stateKey || node.statePreviewStart ||
      node.steps
        .flatMap((step) => step.preconditionStateRefs || [])
        .find((ref) => ref.machineKey === flows[0]?.key)?.stateKey ||
      null
  )
  const state =
    flow?.states.find((item) => item.key === selected) || flow?.states[0]
  const graph = useMemo(() => {
    if (!flow || !state) return null
    const whole = buildDevFlowStateRuleGraph(flow)
    const transitions = whole.edges.filter((item) => item.from === state.key)
    const shown = new Set([state.key, ...transitions.map((item) => item.to)])
    return { ...whole, nodes: whole.nodes.filter((item) => shown.has(item.key)), edges: transitions }
  }, [flow, state])
  if (!flow) {
    return (
      <p>当前节点未关联单独的状态机；请按节点说明中的业务动作与结果核对。</p>
    )
  }
  const transitions = flow.transitions.filter((item) => item.from === state.key)
  const name = (key) =>
    flow.states.find((item) => item.key === key)?.label || key
  return (
    <div className="erp-chain-design__state-preview">
      <div className="erp-chain-design__state-controls">
        <AppSelect
          aria-label="查看状态对象"
          allowClear={false /* 不可清空：状态预览必须指定一个已登记对象。 */}
          value={flow.key}
          options={flows.map(({ key, label }) => ({ value: key, label }))}
          onChange={(key) => {
          setFlowKey(key)
          setSelected(null)
        }}
        />
        <AppSelect
          aria-label="选择要观察的状态"
          allowClear={false /* 不可清空：规则预览必须选定一个已登记状态。 */}
          value={state.key}
          options={flow.states.map((item) => ({ value: item.key, label: item.label }))}
          onChange={setSelected}
        />
      </div>
      <BusinessFlowDiagram
        relationships
        flow={graph}
        label={`${flow.label}所选状态的后续变化`}
        selectedKey={state.key}
        onSelect={setSelected}
        legend="所选状态用于理解规则，不表示本次业务已经处于该状态。任务完成不代表库存、出货或财务事实已生效。"
      />
      {transitions.length ? (
        transitions.map((item) => (
          <div className="erp-chain-design__state-transition" key={item.key}>
            <strong>
              {name(item.from)} → {name(item.to)}
            </strong>
            {item.label ? <p>{item.label}</p> : null}
            <p>{item.guard}</p>
            {item.systemOnly ? <p>由系统处理</p> : null}
          </div>
        ))
      ) : (
        <p>当前状态没有登记后续迁移。</p>
      )}
    </div>
  )
}

export default function BusinessChainDesignDetails({
  catalog,
  library,
  node,
  draft,
  onInspect,
  onExpand,
  onAdd,
  onRelation,
  onHighlight,
  onCanvas,
}) {
  const [tab, setTab] = useState('neighbors')
  const approvals = useMemo(() => businessChainApprovalChoices(catalog, library, node), [catalog, library, node])
  const handoffs = catalog.businessChainOverview.relations.filter((relation) => relation.fromChainKey === node.chainKey)
  const context = businessChainNodeContext(library, node.id)
  const related = context.filter((item) => item.id !== node.id)
  const stateNode = {
    ...node,
    machineKeys: [
      ...new Set([
        ...node.machineKeys,
        ...(node.machineKeys.length
          ? []
          : context.flatMap((item) => item.machineKeys)),
      ]),
    ],
  }
  const present = new Set(draft.nodes.map((item) => item.id))
  const processTasks = related.filter(
    (item) => item.processNode && item.type === 'task'
  )
  const inspect = (item) => (
    <Button onClick={() => onInspect(item.id)}>{item.label}</Button>
  )
  return (
    <>
      <p className="erp-chain-design__muted">
        {CHAIN_DESIGN_DOMAINS[node.domain]} · {CHAIN_DESIGN_TYPES[node.type]} ·{' '}
        {node.chainLabel}
      </p>
      {!onCanvas ? <p className="erp-chain-design__muted">当前画布未显示此节点。可按需加入画布或展开上下游。</p> : null}
      {node.definition && ['rules', 'related'].includes(tab) ? <p>{node.definition}</p> : null}
      {node.representedBy ? (
        <p>
          同一动作在流程中的位置：
          <Button onClick={() => onAdd(node.representedBy)}>
            {library.byId.get(node.representedBy).label}
          </Button>
        </p>
      ) : null}
      {node.splitInto?.length ? (
        <section
          className="erp-chain-design__related"
          aria-label="分组中的独立节点"
        >
          <strong>
            {node.splitMode === 'sequence' ? '独立办理步骤' : '分支与具体节点'}
          </strong>
          <p>
            {node.splitMode === 'sequence'
              ? '分别查看每个动作的条件和结果；条件分支以接入规则为准。'
              : '按来源选择节点，分支之间不表示先后顺序。'}
          </p>
          {node.splitInto.map((id) => {
            const item = library.byId.get(id)
            return (
              <div key={id}>
                <Button onClick={() => onAdd(item.representedBy || id)}>
                  {item.label}
                </Button>
                <small>{item.variantLabel || item.chainLabel}</small>
              </div>
            )
          })}
        </section>
      ) : null}
      {['rules', 'related'].includes(tab) && node.input ? (
        <p>
          <strong>输入：</strong>
          {node.input}
          <br />
          <strong>结果：</strong>
          {node.output}
        </p>
      ) : ['rules', 'related'].includes(tab) && node.source.summary ? (
        <p>{node.source.summary}</p>
      ) : null}
      <SlidingTabList
        aria-label="节点信息"
        value={tab}
        onChange={setTab}
        options={[
          { value: 'neighbors', label: '上下游' },
          { value: 'rules', label: '接入规则' },
          { value: 'state', label: '状态' },
          { value: 'related', label: '任务与单据' },
          ...(approvals.length ? [{ value: 'approval', label: '审批' }] : []),
        ]}
      />
      {tab === 'neighbors' ? (
        <div className="erp-chain-design__related">
          <div className="erp-chain-design__actions">
            <Button onClick={() => onExpand('upstream')}>展开上游</Button>
            <Button onClick={() => onExpand('downstream')}>展开下游</Button>
            <Button onClick={() => onExpand('both', true)}>
              展开完整上下游
            </Button>
          </div>
          {['upstream', 'downstream'].map((direction) => {
            const edges = businessChainNeighbors(library, node.id, direction)
            return (
              <section
                key={direction}
                aria-label={
                  direction === 'upstream' ? '已登记上游' : '已登记下游'
                }
              >
                <strong>
                  {direction === 'upstream' ? '上游' : '下游'} · {edges.length}
                </strong>
                {edges.length ? (
                  edges.map((edge) => {
                    const item = library.byId.get(
                      direction === 'upstream' ? edge.from : edge.to
                    )
                    return (
                      <div
                        key={item.id}
                        className="erp-chain-design__state-transition"
                      >
                        {inspect(item)}
                        <p>{edge.evidence.condition}</p>
                        <Button
                          size="small"
                          onClick={() => onExpand(direction, false, item.id)}
                          aria-label={`展开关联：${item.label}`}
                        >
                          {present.has(item.id) ? '显示关联线' : '加入并连接'}
                        </Button>
                      </div>
                    )
                  })
                ) : (
                  <p>
                    {direction === 'downstream' && node.terminal
                      ? '本次办理在此结束。'
                      : '当前目录未登记此方向的接续；不代表业务允许任意连接。'}
                  </p>
                )}
              </section>
            )
          })}
          <p className="erp-chain-design__muted">
            依据完整目录展开，不受画布已加入节点限制；分支分别满足条件。
          </p>
          {handoffs.length ? (
            <AppSelect
              aria-label="查看一条链路交接"
              placeholder="查看本链的一条交接"
              value={null}
              options={handoffs.map((relation) => ({ value: relation.key, label: relation.label }))}
              onChange={(key) => { if (key) onRelation(handoffs.find((relation) => relation.key === key)) }}
            />
          ) : null}
        </div>
      ) : tab === 'approval' ? (
        <ChainApprovalDetails library={library} choices={approvals} onHighlight={onHighlight} />
      ) : tab === 'state' ? (
        <StatePreview key={node.id} catalog={catalog} node={stateNode} />
      ) : tab === 'related' ? (
        <div className="erp-chain-design__related">
          {processTasks.length ? (
            <section aria-label="具体岗位任务">
              <strong>具体岗位任务</strong>
              {processTasks.map((item) => (
                <div
                  className="erp-chain-design__state-transition"
                  key={item.id}
                >
                  {inspect(item)}
                  <p>{item.chainLabel}</p>
                  <Button onClick={() => onAdd(item.id)}>
                    {present.has(item.id) ? '定位任务' : '加入任务节点'}
                  </Button>
                </div>
              ))}
            </section>
          ) : null}
          {[
            ['关联任务', new Set(['task'])],
            [
              '单据与业务记录',
              new Set(['document', 'master', 'record', 'process']),
            ],
            ['办理步骤', new Set(['business_action', 'system'])],
          ].map(([title, types]) => {
            const items = related.filter(
              (item) => types.has(item.type) && !processTasks.includes(item)
            )
            return items.length ? (
              <section key={title} aria-label={title}>
                <strong>{title}</strong>
                <div className="erp-chain-design__related-items">
                  {items.map((item) => (
                    <React.Fragment key={item.id}>
                      {inspect(item)}
                    </React.Fragment>
                  ))}
                </div>
              </section>
            ) : null
          })}
          {!related.some((item) => item.type === 'task') ? (
            <p>当前步骤没有登记独立协同任务；办理责任与权限请查看接入规则。</p>
          ) : null}
        </div>
      ) : (
        <div className="erp-chain-design__related">
          {!node.steps.length ? (
            <p>
              <strong>办理岗位：</strong>
              {describeDevBusinessChainResponsibility({
                ownerPoolKeys: node.roles,
                mode: node.roles.length ? 'human' : 'system',
              })}
            </p>
          ) : null}
          {node.atomicEvidence ? (
            <ChainDesignEvidence evidence={node.atomicEvidence} />
          ) : (
            node.steps.map((step) => (
              <section
                key={step.key}
                className="erp-chain-design__state-transition"
              >
                <strong>{step.label}</strong>
                <ChainDesignEvidence
                  evidence={{
                    ...describeDevBusinessChainStep(catalog, step),
                    step,
                    chainLabel: node.chainLabel,
                    guards: step.stateTransitionRefs.flatMap((ref) => {
                      const transition = catalog.flows
                        .find((flow) => flow.key === ref.machineKey)
                        ?.transitions.find(
                          (item) => item.key === ref.transitionKey
                        )
                      return transition?.guard ? [transition.guard] : []
                    }),
                    responsibility: describeDevBusinessChainResponsibility(
                      step.responsibility
                    ),
                  }}
                />
              </section>
            ))
          )}
          {!node.steps.length ? (
            <p>
              按该流程节点的已登记上下游办理；当前目录没有单独登记领域动作合同。
            </p>
          ) : null}
        </div>
      )}
    </>
  )
}
