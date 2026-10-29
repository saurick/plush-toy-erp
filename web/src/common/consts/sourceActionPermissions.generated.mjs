// 由 `node scripts/gen-public-contracts.mjs` 生成；请勿手改。
// 真源：server/internal/biz/source_action_permission.go；前端用于说明与预检，最终授权由后端执行。
export const SourceActionReadPermissions = Object.freeze({
  'bom.copy_bom_version': Object.freeze([Object.freeze({
    permission: 'bom.read',
  })]),
  'customer_config.execute_finance_payment_post': Object.freeze([Object.freeze({
    permission: 'finance.payment.read',
  }), Object.freeze({
    condition: 'finance_receivable',
    permission: 'finance.receivable.read',
  }), Object.freeze({
    condition: 'finance_payable',
    permission: 'finance.payable.read',
  })]),
  'customer_config.execute_inventory_adjustment_post': Object.freeze([Object.freeze({
    permission: 'warehouse.inventory.read',
  })]),
  'customer_config.execute_inventory_adjustment_submit': Object.freeze([Object.freeze({
    permission: 'warehouse.inventory.read',
  })]),
  'customer_config.execute_material_supply_purchase_order_submit': Object.freeze([Object.freeze({
    permission: 'purchase.order.read',
  })]),
  'customer_config.execute_production_exception_process': Object.freeze([Object.freeze({
    permission: 'production.fact.read',
  }), Object.freeze({
    permission: 'production.wip.read',
  })]),
  'customer_config.execute_sales_order_acceptance_submit': Object.freeze([Object.freeze({
    permission: 'sales_order.read',
  })]),
  'customer_config.get_finance_payment_approval_process': Object.freeze([Object.freeze({
    permission: 'finance.payment.read',
  })]),
  'customer_config.get_inventory_adjustment_approval_process': Object.freeze([Object.freeze({
    permission: 'warehouse.inventory.read',
  })]),
  'customer_config.get_production_exception_approval_process': Object.freeze([Object.freeze({
    condition: 'production_exception_wip',
    permission: 'quality.inspection.read',
  }), Object.freeze({
    condition: 'production_exception_wip',
    permission: 'production.wip.read',
  }), Object.freeze({
    condition: 'production_exception_over_issue',
    permission: 'pmc.plan.read',
  })]),
  'customer_config.get_sales_order_acceptance_process': Object.freeze([Object.freeze({
    permission: 'sales_order.read',
  })]),
  'customer_config.start_finance_payment_approval_process': Object.freeze([Object.freeze({
    permission: 'finance.payment.read',
  })]),
  'customer_config.start_finished_goods_delivery_process': Object.freeze([Object.freeze({
    permission: 'shipment.read',
  })]),
  'customer_config.start_inventory_adjustment_approval_process': Object.freeze([Object.freeze({
    permission: 'warehouse.inventory.read',
  })]),
  'customer_config.start_material_supply_purchase_order_process': Object.freeze([Object.freeze({
    permission: 'purchase.order.read',
  })]),
  'customer_config.start_production_exception_approval_process': Object.freeze([Object.freeze({
    condition: 'production_exception_wip',
    permission: 'quality.inspection.read',
  }), Object.freeze({
    condition: 'production_exception_wip',
    permission: 'production.wip.read',
  }), Object.freeze({
    condition: 'production_exception_over_issue',
    permission: 'pmc.plan.read',
  })]),
  'customer_config.start_sales_order_acceptance_process': Object.freeze([Object.freeze({
    permission: 'sales_order.read',
  })]),
  'operational_fact.allocate_finance_payment': Object.freeze([Object.freeze({
    permission: 'finance.payment.read',
  }), Object.freeze({
    condition: 'finance_receivable',
    permission: 'finance.receivable.read',
  }), Object.freeze({
    condition: 'finance_payable',
    permission: 'finance.payable.read',
  })]),
  'operational_fact.create_finance_credit_note': Object.freeze([Object.freeze({
    condition: 'finance_payable',
    permission: 'finance.payable.read',
  }), Object.freeze({
    condition: 'finance_receivable',
    permission: 'finance.receivable.read',
  })]),
  'operational_fact.create_finance_source_adjustment': Object.freeze([Object.freeze({
    permission: 'finance.payable.read',
  }), Object.freeze({
    permission: 'purchase.receipt.read',
  }), Object.freeze({
    permission: 'purchase.return.read',
  }), Object.freeze({
    permission: 'purchase.receipt.adjustment.read',
  })]),
  'operational_fact.create_invoice_from_shipment': Object.freeze([Object.freeze({
    permission: 'shipment.read',
  })]),
  'operational_fact.create_outsourcing_material_issue_from_order': Object.freeze([Object.freeze({
    permission: 'outsourcing.order.read',
  })]),
  'operational_fact.create_outsourcing_return_disposition': Object.freeze([Object.freeze({
    permission: 'quality.inspection.read',
  }), Object.freeze({
    permission: 'outsourcing.fact.read',
  })]),
  'operational_fact.create_outsourcing_return_receipt_from_order': Object.freeze([Object.freeze({
    permission: 'outsourcing.order.read',
  })]),
  'operational_fact.create_payable_from_outsourcing_order': Object.freeze([Object.freeze({
    permission: 'outsourcing.order.read',
  })]),
  'operational_fact.create_payable_from_outsourcing_return': Object.freeze([Object.freeze({
    permission: 'outsourcing.fact.read',
  }), Object.freeze({
    permission: 'outsourcing.order.read',
  }), Object.freeze({
    permission: 'quality.inspection.read',
  })]),
  'operational_fact.create_payable_from_purchase_receipt': Object.freeze([Object.freeze({
    permission: 'purchase.receipt.read',
  }), Object.freeze({
    permission: 'purchase.return.read',
  }), Object.freeze({
    permission: 'purchase.receipt.adjustment.read',
  })]),
  'operational_fact.create_production_completion_from_order': Object.freeze([Object.freeze({
    permission: 'production.wip.read',
  })]),
  'operational_fact.create_production_material_issue_from_order': Object.freeze([Object.freeze({
    permission: 'pmc.plan.read',
  })]),
  'operational_fact.create_production_rework_from_completion': Object.freeze([Object.freeze({
    permission: 'production.fact.read',
  }), Object.freeze({
    permission: 'pmc.plan.read',
  })]),
  'operational_fact.create_receivable_from_shipment': Object.freeze([Object.freeze({
    permission: 'shipment.read',
  })]),
  'operational_fact.create_reconciliation_from_finance_fact': Object.freeze([Object.freeze({
    condition: 'finance_payable',
    permission: 'finance.payable.read',
  }), Object.freeze({
    condition: 'finance_receivable',
    permission: 'finance.receivable.read',
  }), Object.freeze({
    condition: 'finance_invoice',
    permission: 'finance.invoice.read',
  })]),
  'operational_fact.create_shipment_with_items': Object.freeze([Object.freeze({
    condition: 'shipment_sales_order',
    permission: 'sales_order.read',
  }), Object.freeze({
    condition: 'shipment_sales_order',
    permission: 'sales_order_item.read',
  })]),
  'operational_fact.create_stock_reservation_from_sales_order': Object.freeze([Object.freeze({
    permission: 'sales_order.read',
  }), Object.freeze({
    permission: 'sales_order_item.read',
  })]),
  'operational_fact.get_finance_statement': Object.freeze([Object.freeze({
    condition: 'finance_payable',
    permission: 'finance.payable.read',
  }), Object.freeze({
    condition: 'finance_receivable',
    permission: 'finance.receivable.read',
  })]),
  'operational_fact.get_production_exception_context': Object.freeze([Object.freeze({
    permission: 'quality.inspection.read',
  }), Object.freeze({
    permission: 'production.wip.read',
  })]),
  'operational_fact.list_finance_payment_allocation_candidates': Object.freeze([Object.freeze({
    permission: 'finance.payment.read',
  }), Object.freeze({
    condition: 'finance_receivable',
    permission: 'finance.receivable.read',
  }), Object.freeze({
    condition: 'finance_payable',
    permission: 'finance.payable.read',
  })]),
  'operational_fact.list_finance_source_adjustments': Object.freeze([Object.freeze({
    permission: 'finance.payable.read',
  }), Object.freeze({
    permission: 'purchase.receipt.read',
  }), Object.freeze({
    permission: 'purchase.return.read',
  }), Object.freeze({
    permission: 'purchase.receipt.adjustment.read',
  })]),
  'operational_fact.list_production_order_material_requirements': Object.freeze([Object.freeze({
    permission: 'pmc.plan.read',
  })]),
  'operational_fact.list_shipment_source_candidates': Object.freeze([Object.freeze({
    permission: 'sales_order.read',
  }), Object.freeze({
    permission: 'sales_order_item.read',
  })]),
  'operational_fact.post_production_fact': Object.freeze([Object.freeze({
    permission: 'production.fact.read',
  })]),
  'operational_fact.reverse_finance_allocation': Object.freeze([Object.freeze({
    permission: 'finance.payment.read',
  }), Object.freeze({
    condition: 'finance_receivable',
    permission: 'finance.receivable.read',
  }), Object.freeze({
    condition: 'finance_payable',
    permission: 'finance.payable.read',
  })]),
  'operational_fact.reverse_finance_credit_note': Object.freeze([Object.freeze({
    condition: 'finance_payable',
    permission: 'finance.payable.read',
  }), Object.freeze({
    condition: 'finance_receivable',
    permission: 'finance.receivable.read',
  })]),
  'operational_fact.save_outsourcing_material_issue_draft': Object.freeze([Object.freeze({
    permission: 'outsourcing.order.read',
  })]),
  'operational_fact.save_outsourcing_return_receipt_draft': Object.freeze([Object.freeze({
    permission: 'outsourcing.order.read',
  })]),
  'operational_fact.save_production_completion_draft': Object.freeze([Object.freeze({
    permission: 'production.wip.read',
  })]),
  'operational_fact.save_production_material_issue_draft': Object.freeze([Object.freeze({
    permission: 'pmc.plan.read',
  })]),
  'operational_fact.save_production_rework_from_completion_draft': Object.freeze([Object.freeze({
    permission: 'production.fact.read',
  }), Object.freeze({
    permission: 'pmc.plan.read',
  })]),
  'operational_fact.save_shipment_draft': Object.freeze([Object.freeze({
    condition: 'shipment_sales_order',
    permission: 'sales_order.read',
  }), Object.freeze({
    condition: 'shipment_sales_order',
    permission: 'sales_order_item.read',
  })]),
  'operational_fact.submit_production_exception': Object.freeze([Object.freeze({
    condition: 'production_exception_wip',
    permission: 'quality.inspection.read',
  }), Object.freeze({
    condition: 'production_exception_wip',
    permission: 'production.wip.read',
  }), Object.freeze({
    condition: 'production_exception_over_issue',
    permission: 'pmc.plan.read',
  })]),
  'production_order.create_production_order': Object.freeze([Object.freeze({
    condition: 'production_sales_order_item',
    permission: 'sales_order.read',
  }), Object.freeze({
    condition: 'production_sales_order_item',
    permission: 'sales_order_item.read',
  }), Object.freeze({
    condition: 'production_bom_header',
    permission: 'bom.read',
  })]),
  'production_order.list_production_order_reference_options': Object.freeze([Object.freeze({
    condition: 'production_sales_order_item',
    permission: 'sales_order.read',
  }), Object.freeze({
    condition: 'production_sales_order_item',
    permission: 'sales_order_item.read',
  }), Object.freeze({
    condition: 'production_bom_header',
    permission: 'bom.read',
  })]),
  'production_order.release_production_order': Object.freeze([Object.freeze({
    permission: 'pmc.plan.read',
  })]),
  'production_order.save_production_order': Object.freeze([Object.freeze({
    condition: 'production_sales_order_item',
    permission: 'sales_order.read',
  }), Object.freeze({
    condition: 'production_sales_order_item',
    permission: 'sales_order_item.read',
  }), Object.freeze({
    condition: 'production_bom_header',
    permission: 'bom.read',
  })]),
  'production_wip.execute_production_wip_action': Object.freeze([Object.freeze({
    permission: 'production.wip.read',
  }), Object.freeze({
    condition: 'outsourced_execution',
    permission: 'outsourcing.order.read',
  })]),
  'production_wip.prepare_production_outsourcing_order': Object.freeze([Object.freeze({
    permission: 'production.wip.read',
  }), Object.freeze({
    permission: 'outsourcing.order.read',
  }), Object.freeze({
    permission: 'supplier.read',
  })]),
  'purchase_order.get_purchase_order_receipt_progress': Object.freeze([Object.freeze({
    permission: 'purchase.order.read',
  })]),
  'purchase.add_purchase_receipt_item': Object.freeze([Object.freeze({
    permission: 'purchase.order.read',
  })]),
  'purchase.create_purchase_receipt_adjustment_from_receipt': Object.freeze([Object.freeze({
    permission: 'purchase.receipt.read',
  })]),
  'purchase.create_purchase_receipt_from_purchase_order': Object.freeze([Object.freeze({
    permission: 'purchase.order.read',
  })]),
  'purchase.create_purchase_rejection_disposition': Object.freeze([Object.freeze({
    permission: 'quality.inspection.read',
  }), Object.freeze({
    permission: 'purchase.receipt.read',
  })]),
  'purchase.create_purchase_return_from_quality_inspection': Object.freeze([Object.freeze({
    permission: 'quality.inspection.read',
  }), Object.freeze({
    permission: 'purchase.receipt.read',
  })]),
  'purchase.create_purchase_return_from_receipt': Object.freeze([Object.freeze({
    permission: 'purchase.receipt.read',
  })]),
  'quality.correct_quality_inspection_result': Object.freeze([Object.freeze({
    permission: 'quality.inspection.read',
  })]),
  'quality.create_finished_goods_quality_inspection_draft': Object.freeze([Object.freeze({
    permission: 'shipment.read',
  })]),
  'quality.create_quality_inspection_draft': Object.freeze([Object.freeze({
    permission: 'purchase.receipt.read',
  })]),
  'quality.create_quality_inspection_from_outsourcing_return': Object.freeze([Object.freeze({
    permission: 'outsourcing.fact.read',
  }), Object.freeze({
    permission: 'outsourcing.order.read',
  })]),
  'quality.get_quality_inspection': Object.freeze([Object.freeze({
    condition: 'quality_purchase',
    permission: 'purchase.receipt.read',
  }), Object.freeze({
    condition: 'quality_outsourcing',
    permission: 'outsourcing.fact.read',
  }), Object.freeze({
    condition: 'quality_shipment',
    permission: 'shipment.read',
  }), Object.freeze({
    condition: 'quality_wip',
    permission: 'production.wip.read',
  })]),
  'quality.list_finished_goods_quality_inspections': Object.freeze([Object.freeze({
    permission: 'shipment.read',
  })]),
  'quality.list_outsourcing_return_quality_inspections': Object.freeze([Object.freeze({
    permission: 'outsourcing.fact.read',
  })]),
  'quality.list_production_stage_quality_inspections': Object.freeze([Object.freeze({
    permission: 'production.wip.read',
  })]),
  'quality.list_quality_inspections': Object.freeze([Object.freeze({
    permission: 'purchase.receipt.read',
  })]),
  'sales_order.finance_review_engineering_material_request': Object.freeze([Object.freeze({
    permission: 'engineering.material.read',
  }), Object.freeze({
    permission: 'sales_order.read',
  })]),
  'sales_order.get_engineering_material_request': Object.freeze([Object.freeze({
    permission: 'engineering.material.read',
  }), Object.freeze({
    permission: 'sales_order.read',
  })]),
  'sales_order.list_engineering_material_requests': Object.freeze([Object.freeze({
    permission: 'engineering.material.read',
  }), Object.freeze({
    permission: 'sales_order.read',
  })]),
})
