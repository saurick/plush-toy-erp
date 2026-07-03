export const yoyoosunFlowOrchestrationCoverage = Object.freeze({
  customerKey: 'yoyoosun',
  status: 'coverage_matrix',
  layers: Object.freeze([
    Object.freeze({ key: 'workflow_task', status: 'runtime_enabled', evidence: Object.freeze(['official_task_actions', 'owner_pool_scope', 'mobile_role_tasks']) }),
    Object.freeze({ key: 'process_runtime', status: 'runtime_enabled_partial', evidence: Object.freeze(['sales_order_acceptance', 'material_supply', 'finished_goods_delivery']) }),
    Object.freeze({ key: 'business_flows', status: 'preview_only', evidence: Object.freeze(['sales_to_production', 'purchase_to_inventory', 'production_to_inventory', 'delivery_to_settlement']) }),
    Object.freeze({ key: 'state_machines', status: 'preview_only', evidence: Object.freeze(['sales_order_lifecycle', 'production_order_lifecycle', 'purchase_order_lifecycle']) }),
    Object.freeze({ key: 'process_policies', status: 'preview_only', evidence: Object.freeze(['skip_policy', 'auto_generate_policy', 'close_policy']) }),
  ]),
  runtimeProcesses: Object.freeze([
    Object.freeze({ key: 'sales_order_acceptance', status: 'runtime_enabled_partial', nodeTypes: Object.freeze(['domain_command', 'approval', 'human_task', 'end']) }),
    Object.freeze({ key: 'material_supply', status: 'runtime_enabled_partial', nodeTypes: Object.freeze(['domain_command', 'end']) }),
    Object.freeze({ key: 'finished_goods_delivery', status: 'runtime_enabled_partial_target_evidence_required', nodeTypes: Object.freeze(['domain_command', 'end']) }),
  ]),
  uiEntrypoints: Object.freeze([
    'desktop_task_board',
    'workflow_v1_page',
    'business_collaboration_drawer',
    'mobile_role_tasks',
    'customer_config_preview',
    'purchase_contract_print',
    'processing_contract_print',
  ]),
  signoffGates: Object.freeze([
    'customer_package_preview_boundary_passed',
    'yoyoosun_customer_closure_passed',
    'yoyoosun_release_readiness_passed',
    'target_effective_session_readback_required',
    'role_smoke_required',
    'purchase_and_processing_pdf_evidence_required',
  ]),
});
