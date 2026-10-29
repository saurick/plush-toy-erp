import { taskHandlingPolicy } from './taskHandlingPolicy.mjs'
import { isEngineeringMaterialTask } from './engineeringMaterialTask.mjs'

// These keys select existing UI actions. Domain permissions, record state and
// task ownership are still checked by their original handlers and the server.
const contracts = {
  engineering_data: ['engineering'],
  engineering_material_revision: ['engineering-material'],
  handoff_shipment_execute: ['shipment-edit', 'shipment-release', 'shipment-ship'],
  handoff_purchase_arrival: ['generate-inbound'],
  handoff_receipt_replacement: ['quality-disposition'],
  handoff_receipt_quality: ['submit', 'pass', 'reject'],
  handoff_receipt_inbound: ['post'],
  handoff_receipt_exception: ['quality-disposition'],
  handoff_outsourcing_contract: ['outsourcing-edit', 'lifecycle-submit', 'lifecycle-confirm'],
  handoff_outsourcing_issue: ['related-outsourcing-facts'],
  handoff_outsourcing_return: ['related-outsourcing-facts'],
  handoff_outsourcing_quality: ['submit', 'pass', 'reject'],
  handoff_outsourcing_quality_request: ['related-outsourcing-facts'],
  handoff_outsourcing_inbound: ['related-outsourcing-facts'],
  handoff_production_execute: ['route-execution'],
  handoff_production_cutting_issue: ['route-execution'],
  handoff_production_packaging_transfer: ['route-execution'],
  handoff_production_packaging_execute: ['route-execution'],
  handoff_production_return: ['route-execution'],
  handoff_production_quality: ['submit', 'pass', 'reject'],
  handoff_production_transfer: ['route-execution'],
  handoff_production_exception: ['quality-disposition'],
  handoff_production_packaging: ['route-execution'],
  handoff_production_completion: ['completion', 'route-execution'],
  handoff_production_inbound: ['operational-fact-post'],
  production_scheduling: ['edit', 'release', 'route-execution'],
  production_exception: ['production-fact-edit-draft', 'production-rework-start'],
  finance_payment_execution: ['payment-allocation'],
  inventory_adjustment_execution: ['inventory-operation-execute'],
}

const sourceActions = {
  sales_order: ['engineering', 'engineering-material', 'edit'],
  purchase_order: ['purchase-edit', 'purchase-complete-terms', 'generate-inbound'],
  outsourcing_order: ['outsourcing-edit', 'lifecycle-submit', 'lifecycle-confirm'],
  production_order: ['edit', 'release'],
  production_fact: ['production-fact-edit-draft', 'production-rework-start', 'operational-fact-post'],
  production_wip_batch: ['route-execution'],
  production_packaging_confirmation: ['route-execution'],
  purchase_receipt: ['post'],
  quality_inspection: ['submit', 'pass', 'reject', 'quality-disposition'],
  shipment: ['shipment-edit', 'shipment-release', 'shipment-ship'],
  finance_payment: ['payment-allocation'],
  inventory_operation: ['inventory-operation-execute'],
  production_exception_decision: ['production-exception-execute'],
}

export const WORKFLOW_TASK_BUSINESS_ACTIONS = Object.freeze(
  Object.fromEntries(Object.entries(contracts).map(([key, actions]) => [key, Object.freeze(actions)]))
)

export function workflowTaskBusinessContract(task) {
  const policy = taskHandlingPolicy(task)
  const coordination = task?.task_group === 'business_followup' || policy?.kind === 'coordination'
  const actions = coordination ? [] : WORKFLOW_TASK_BUSINESS_ACTIONS[task?.task_group] || sourceActions[task?.source_type] || []
  return {
    kind: coordination ? 'coordination' : policy?.kind || null,
    containedBusiness: isEngineeringMaterialTask(task) || (!coordination && policy?.kind !== 'decision'),
    actionKeys: actions,
    relatedKinds: task?.task_group === 'production_scheduling' && task?.source_type === 'sales_order' ? ['production_plan'] : [],
    workflowConfirmation: ({ production_scheduling: '确认生产安排', production_exception: '确认返工安排' })[task?.task_group] || '',
    sourceType: task?.source_type || '',
    sourceID: Number.isSafeInteger(task?.source_id) && task.source_id > 0 ? task.source_id : null,
  }
}

export function workflowTaskBusinessActionAllowed(contract, key) {
  return Boolean(key && contract?.actionKeys?.includes(key))
}
