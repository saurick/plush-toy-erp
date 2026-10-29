import {
  taskHandlingMatrix,
  TASK_HANDLING_KINDS,
  taskHandlingPolicy,
} from '../../erp/utils/taskHandlingPolicy.mjs'
import { SALES_ORDER_ACCEPTANCE_RUNTIME_OWNER_POOLS } from '../../../../config/catalog/customerPackageCatalog.mjs'
import { ROLE_DISPLAY_NAMES } from '../../erp/utils/roleKeys.mjs'
import { DEV_FLOW_STATE_CATALOG } from './devFlowStateCatalog.mjs'
import { buildFulfillmentRelations } from './devFulfillmentRelations.mjs'
import { TASK_HANDLING_DUTIES } from './devTaskHandlingResponsibilities.mjs'
import { getWorkflowTaskActionMeta } from '../../erp/utils/workflowTaskActionPresentation.mjs'

export const MOBILE_HANDLING_LABELS = {
  full: '可办理',
  limited: '仅核对与执行',
  desktop: '仅查看',
  observe: '仅查看结果',
}
const roleForPool = (pool) =>
  ROLE_DISPLAY_NAMES[pool]
    ? pool
    : SALES_ORDER_ACCEPTANCE_RUNTIME_OWNER_POOLS.find(
        (item) => item.pool_key === pool
      )?.source_pool_key

export function buildTaskHandlingRows(catalog) {
  const stageRows = taskHandlingMatrix().map((row) => {
    const duty = TASK_HANDLING_DUTIES[row.key]
    if (!duty) throw new Error(`Missing task responsibility: ${row.key}`)
    return { ...row, ...duty }
  })
  const scopesFor = (definition) =>
    stageRows.filter(
      (row) =>
        row.kind === 'decision' &&
        row.sources?.includes(definition.businessRefType)
    )
  const coveredStages = new Set(
    catalog.processDefinitions
      .filter((definition) =>
        definition.nodes.some((node) => node.type === 'approval')
      )
      .flatMap((definition) => scopesFor(definition).map((row) => row.key))
  )
  const rows = stageRows.filter((row) => !coveredStages.has(row.key))
  const processRows = new Map()
  for (const definition of catalog.processDefinitions) {
    for (const node of definition.nodes) {
      if (!['approval', 'human_task'].includes(node.type)) continue
      // The engineering preparation row already covers this human task.
      if (node.key === 'engineering_data') continue
      const key = `process/${definition.processKey}/${node.key}`
      const existing = processRows.get(key)
      if (existing) {
        existing.processRefs.push({ definition, node })
        existing.roleKeys = [
          ...new Set(
            [...existing.roleKeys, roleForPool(node.ownerPool)].filter(Boolean)
          ),
        ]
        continue
      }
      const policy = taskHandlingPolicy({
        task_group: node.key,
        required_capability_key: node.permission[0],
        discovery: {
          stage_key: stageRows.find((row) =>
            row.kind !== 'decision' && row.sources?.includes(definition.businessRefType)
          )?.key,
        },
      })
      if (!policy) throw new Error(`Missing handling policy: ${key}`)
      processRows.set(key, {
        ...policy,
        key,
        label: node.label,
        kindLabel: policy.label,
        group: scopesFor(definition).length
          ? `适用：${[...new Set(scopesFor(definition).map((row) => row.group))].join('、')}`
          : definition.label,
        roleKeys: [roleForPool(node.ownerPool)].filter(Boolean),
        processRefs: [{ definition, node }],
        operationLabels: node.type === 'approval' || node.key === 'order_review'
          ? ['complete', 'reject'].map((mode) => getWorkflowTaskActionMeta({ task_group: node.key, required_capability_key: node.permission[0] }, mode).title)
          : [],
        input: node.type === 'approval'
          ? '核对来源和依据，选择通过或退回并填写意见'
          : node.key === 'order_review'
            ? '核对订单、物料和交期，完成本次评审'
            : '核对已批准内容，办理执行并记录结果',
        handoff: node.type === 'approval'
          ? '通过后交后续岗位；退回时保留原因'
          : node.key === 'order_review'
            ? '完成订单评审，保留核对结果'
            : '由对应业务单据记录执行结果',
        roleNote: node.type === 'approval' &&
          ['sales_order_acceptance', 'material_supply', 'finished_goods_delivery'].includes(definition.processKey)
          ? '流程默认，可按配置调整'
          : '',
      })
    }
  }
  const relations = buildFulfillmentRelations(catalog)
  const material = relations.find((item) => item.stage.stage === 'sales_order')
  const materialRows = ['boss_review', 'finance_review'].map((substepKey) => {
    const node = material.stage.subflow.nodes.find(
      (item) => item.key === substepKey
    )
    const policy = TASK_HANDLING_KINDS.decision
    return {
      ...policy,
      kind: 'decision',
      key: `source/sales_order/${substepKey}`,
      label: node.label,
      group: '工程用料',
      kindLabel: policy.label,
      roleKeys: node.role_keys,
      relationRef: { stage: 'sales_order', substepKey },
      operationLabels: [substepKey === 'boss_review' ? '确认通过，交财务' : '批准并生成采购订单', '确认退回工程'],
      input: '核对自动汇总的用料数量、供应商和来源，填写审批意见；退回须说明原因',
      handoff: substepKey === 'boss_review'
        ? '通过后交另一位财务复核；退回交工程修改'
        : '通过后按厂商生成采购单；退回交工程修订原资料',
    }
  })
  return [...rows, ...processRows.values(), ...materialRows]
}
export const TASK_HANDLING_ROWS = buildTaskHandlingRows(DEV_FLOW_STATE_CATALOG)
export const TASK_HANDLING_ROLE_KEYS = [
  ...new Set(TASK_HANDLING_ROWS.flatMap((row) => row.roleKeys)),
]
const queryChoices = {
  role: TASK_HANDLING_ROLE_KEYS,
  kind: Object.keys(TASK_HANDLING_KINDS).filter((key) => key !== 'automatic'),
  mobile: Object.keys(MOBILE_HANDLING_LABELS).filter(
    (key) => key !== 'observe'
  ),
  stage: TASK_HANDLING_ROWS.map((row) => row.key),
}
export function readTaskHandlingSearch(params) {
  return {
    role: params.get('role') || '',
    kind: params.get('kind') || '',
    mobile: params.get('mobile') || '',
    stage: params.get('stage') || '',
    action: params.has('action') ? params.get('action') : undefined,
  }
}
export function patchTaskHandlingSearch(before, patch) {
  const next = new URLSearchParams(before)
  for (const [key, value] of Object.entries(patch)) {
    if (key === 'action' && value !== null) next.set(key, value ?? '')
    else if (value == null || value === '') next.delete(key)
    else next.set(key, value)
  }
  return next
}
export function taskHandlingActions(catalog, stageKey) {
  const selected = TASK_HANDLING_ROWS.find((row) => row.key === stageKey)
  if (!catalog || !selected) return []
  // A process node owns its own responsibility and successors. Chain-level
  // relations can include adjacent nodes and are not a node's action contract.
  if (selected.processRefs) return []
  const relations = buildFulfillmentRelations(catalog)
  const linked = selected.relationRef
    ? relations
        .filter((item) => item.stage.stage === selected.relationRef.stage)
        .flatMap((item) => item.actions)
        .filter(
          (action) => action.substepKey === selected.relationRef.substepKey
        )
    : (selected.relationRefs || []).flatMap(([stageKey, substepKey]) =>
        relations
          .filter((item) => item.stage.stage === stageKey)
          .flatMap((item) => item.actions)
          .filter((item) => item.substepKey === substepKey &&
            item.responsibilityMode === 'human' && item.roleKeys.length > 0 &&
            item.roleKeys.every((pool) => selected.roleKeys.includes(roleForPool(pool)))
          )
      )
  return [...new Map(linked.map((action) => [action.key, action])).values()]
}

export function validateTaskHandlingSearch(params, catalog) {
  const keys = new Set([...Object.keys(queryChoices), 'action'])
  for (const key of params.keys()) {
    if (!keys.has(key) || params.getAll(key).length > 1) {
      return '链接中的条件无法识别，请重新选择。'
    }
    const value = params.get(key)
    if (value && queryChoices[key] && !queryChoices[key].includes(value)) {
      return '所选条件已失效，请重新选择。'
    }
  }
  const state = readTaskHandlingSearch(params)
  if (
    state.action &&
    !taskHandlingActions(catalog, state.stage).some(
      (action) => action.key === state.action
    )
  ) {
    return '所选动作不属于当前办理事项，请重新选择。'
  }
  const selected = TASK_HANDLING_ROWS.find((row) => row.key === state.stage)
  if (
    selected &&
    ((state.role && !selected.roleKeys.includes(state.role)) ||
      (state.kind && selected.kind !== state.kind) ||
      (state.mobile && selected.mobile !== state.mobile))
  ) {
    return '所选事项不在当前筛选范围，请重新选择。'
  }
  return ''
}
