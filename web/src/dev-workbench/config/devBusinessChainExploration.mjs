import {
  describeDevBusinessChainStep,
  describeDevBusinessChainResponsibility,
} from './devBusinessChainProjection.mjs'

// Display participants for the two explicit review actions; authorization stays in the domain contract.
const reviewRoles = {
  boss_review_engineering_material_request: ['boss'],
  finance_review_engineering_material_request: ['finance'],
}

// Separate sequential actions on the same state object (for example boss and finance review).
// Cross-object changes remain one business action: they may be one atomic transaction.
export function appendBusinessStateSteps(catalog, nodes, relations) {
  for (const parent of [...nodes].filter((node) =>
    node.id.startsWith('step:')
  )) {
    const step = parent.steps[0]
    const refs = step.stateTransitionRefs
    if (
      refs.length < 2 ||
      new Set(refs.map((ref) => ref.machineKey)).size !== 1 ||
      new Set(refs.map((ref) => ref.actionKey)).size !== refs.length
    ) {
      continue
    }
    const first = refs.find(
      (ref) => !refs.some((other) => other.to === ref.from)
    )
    const ordered = []
    for (
      let current = first;
      current && !ordered.includes(current);
      current = refs.find((ref) => ref.from === current.to)
    ) {
      ordered.push(current)
    }
    if (ordered.length !== refs.length) continue
    const flow = catalog.flows.find((item) => item.key === refs[0].machineKey)
    const name = (state) => flow.states.find((item) => item.key === state).label
    const parts = ordered.map((ref) => {
      const transition = flow.transitions.find(
        (item) => item.key === ref.transitionKey
      )
      const id = `action:${step.key}:${ref.transitionKey}`
      const processRef = step.processNodeRefs.find(
        (item) => item.nodeKey === ref.actionKey
      )
      const processNode =
        processRef &&
        catalog.processDefinitions
          .find((item) => item.key === processRef.processDefinitionKey)
          ?.nodes.find((item) => item.key === processRef.nodeKey)
      const label =
        transition.label ||
        processNode?.label ||
        `${flow.label}：${name(ref.from)} → ${name(ref.to)}`
      const roles =
        reviewRoles[transition.action] ||
        (processNode?.ownerPool ? [processNode.ownerPool] : parent.roles)
      const evidence = {
        step,
        chainLabel: parent.chainLabel,
        label,
        condition: transition.guard,
        guards: [],
        preconditions: [`${flow.label}：${name(ref.from)}`],
        results: [`${flow.label}：${name(ref.to)}`],
        responsibility: describeDevBusinessChainResponsibility({
          mode: transition.responsibilityMode,
          ownerPoolKeys: roles,
        }),
      }
      const node = {
        ...parent,
        steps: [
          {
            ...step,
            stateTransitionRefs: [ref],
            preconditionStateRefs: [
              { machineKey: flow.key, stateKey: ref.from },
            ],
            resultStateRefs: [{ machineKey: flow.key, stateKey: ref.to }],
            processNodeRefs: processRef ? [processRef] : [],
          },
        ],
        id,
        label,
        input: name(ref.from),
        output: name(ref.to),
        statePreviewStart: ref.from,
        machineKeys: [flow.key],
        atomicEvidence: evidence,
        roles,
        domain:
          roles.length === 1 && roles[0] === 'finance'
            ? 'finance'
            : parent.domain,
      }
      nodes.push(node)
      return node
    })
    // This registered step includes automatic submission before its two approval transitions.
    if (step.key === 'effective_bom:calls_domain_command:material_request') {
      const label = '汇总用料并自动送审'
      const detail = describeDevBusinessChainStep(catalog, step)
      const preparation = {
        ...parent,
        id: `action:${step.key}:prepare`,
        label,
        type: 'system',
        steps: [
          {
            ...step,
            stateTransitionRefs: [],
            processNodeRefs: [],
            preconditionStateRefs: step.preconditionStateRefs.filter(
              (ref) => ref.machineKey !== flow.key
            ),
            resultStateRefs: [
              { machineKey: flow.key, stateKey: ordered[0].from },
            ],
          },
        ],
        roles: ['engineering'],
        output: name(ordered[0].from),
        machineKeys: [flow.key],
        statePreviewStart: ordered[0].from,
        atomicEvidence: {
          step,
          ...detail,
          label,
          chainLabel: parent.chainLabel,
          guards: [],
          preconditions: detail.preconditions.filter(
            (text) => !text.startsWith(`${flow.label}：`)
          ),
          results: [`${flow.label}：${name(ordered[0].from)}`],
          responsibility: '工程完成资料后由系统自动汇总送审',
        },
      }
      nodes.push(preparation)
      parts.unshift(preparation)
    }
    parent.splitInto = parts.map((node) => node.id)
    const path = [
      `node:${step.fromNodeKey}`,
      ...parent.splitInto,
      `node:${step.toNodeKey}`,
    ]
    path.slice(1).forEach((to, i) =>
      relations.push({
        from: path[i],
        to,
        kind: 'known',
        evidence: parts[Math.min(i, parts.length - 1)].atomicEvidence,
      })
    )
  }
}

// Expand grouped collaboration into the actual nodes and branches of each registered variant.
// Variants keep separate identities; their tasks must never become one invented sequence.
export function appendBusinessProcessNodes(catalog, nodes, relations) {
  const processId = (chainKey, definitionKey, nodeKey) =>
    `process:${chainKey}:${definitionKey}:${nodeKey}`
  for (const chain of catalog.businessChains) {
    const base = nodes.filter((node) => node.chainKey === chain.key)
    const definitionKeys = new Set(
      chain.nodes.flatMap((node) => node.processDefinitionKeys)
    )
    for (const step of chain.steps) {
      for (const ref of step.processNodeRefs) {
        definitionKeys.add(ref.processDefinitionKey)
      }
    }
    for (const definition of catalog.processDefinitions.filter((item) =>
      definitionKeys.has(item.key)
    )) {
      for (const source of definition.nodes) {
        const steps = chain.steps.filter((step) =>
          step.processNodeRefs.some(
            (ref) =>
              ref.processDefinitionKey === definition.key &&
              ref.nodeKey === source.key
          )
        )
        const task = ['human_task', 'approval'].includes(source.type)
        const roles = source.ownerPool
          ? [source.ownerPool]
          : [
              ...new Set(
                steps.flatMap((step) => step.responsibility.ownerPoolKeys)
              ),
            ]
        nodes.push({
          id: processId(chain.key, definition.key, source.key),
          label: source.label,
          type: task ? 'task' : source.type === 'end' ? 'result' : 'system',
          domain:
            base.find((node) => node.roles.some((role) => roles.includes(role)))
              ?.domain || base[0].domain,
          chainKey: chain.key,
          chainLabel: definition.label,
          source,
          roles,
          steps,
          processNode: { definitionKey: definition.key, nodeKey: source.key },
          entry: source.key === definition.initial,
          terminal: source.type === 'end',
          machineKeys: [
            ...new Set([
              ...(task ? ['workflow.task'] : []),
              ...steps.flatMap((step) =>
                step.stateTransitionRefs.map((ref) => ref.machineKey)
              ),
            ]),
          ],
        })
      }
      for (const edge of definition.edges) {
        const source = definition.nodes.find((node) => node.key === edge.from)
        const step = chain.steps.find((item) =>
          item.processNodeRefs.some(
            (ref) =>
              ref.processDefinitionKey === definition.key &&
              ref.nodeKey === edge.to
          )
        )
        const detail = step ? describeDevBusinessChainStep(catalog, step) : null
        relations.push({
          from: processId(chain.key, definition.key, edge.from),
          to: processId(chain.key, definition.key, edge.to),
          kind:
            step &&
            chain.edges.find((item) => item.key === step.edgeKey)?.kind ===
              'returns'
              ? 'exception'
              : 'known',
          evidence: {
            step: step || { key: edge.key, label: source.label },
            chainLabel: definition.label,
            label: source.label,
            condition: detail?.condition || '按此流程分支的办理结果接续。',
            preconditions: detail?.preconditions || [],
            guards: edge.branchPolicy
              ? [
                  '此处有条件分支；按办理结果选择出口，不能将所有出口同时视为完成。',
                ]
              : [],
            results: detail?.results || [],
            responsibility: describeDevBusinessChainResponsibility({
              mode: source.ownerPool ? 'human' : 'system',
              ownerPoolKeys: source.ownerPool ? [source.ownerPool] : [],
            }),
          },
        })
      }
    }
    for (const node of base) {
      node.relatedNodeIds = [
        ...new Set(
          node.steps.flatMap((step) =>
            step.processNodeRefs.map((ref) =>
              processId(chain.key, ref.processDefinitionKey, ref.nodeKey)
            )
          )
        ),
      ]
    }
  }
}
