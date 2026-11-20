// 岗位目录和数量由造数、页面目录与读回共同消费。
export const MANUAL_ACCEPTANCE_TASKS_PER_ROLE = 90;

export const MANUAL_ACCEPTANCE_ROLE_TASK_SCENARIOS = Object.freeze({
  boss: Object.freeze([
    "delivery_review",
    "quotation_review",
    "delay_risk",
    "customer_requirement",
    "priority_order",
  ]),
  sales: Object.freeze([
    "customer_details",
    "color_confirmation",
    "packaging_confirmation",
    "delivery_address",
    "delivery_date_reply",
  ]),
  purchase: Object.freeze([
    "main_material_arrival",
    "accessory_delivery",
    "supplier_reply",
    "purchase_quantity",
    "expedite_material",
  ]),
  production: Object.freeze([
    "today_production",
    "outsourcing_return",
    "rework",
    "production_exception",
  ]),
  warehouse: Object.freeze([
    "receiving",
    "inbound",
    "material_picking",
    "shipping",
    "exception",
  ]),
  finance: Object.freeze([
    "customer_receipt",
    "supplier_statement",
    "invoice_details",
    "overdue_receivable",
    "weekly_payment",
  ]),
  pmc: Object.freeze([
    "material_readiness",
    "order_priority",
    "delay_risk",
    "production_readiness",
    "open_item_followup",
  ]),
  quality: Object.freeze([
    "incoming_inspection",
    "first_article",
    "rework_inspection",
    "pre_shipment_inspection",
    "appearance_issue",
  ]),
  engineering: Object.freeze([
    "material_list",
    "drawing_dimensions",
    "sewing_instructions",
    "packaging_information",
    "first_article_requirements",
  ]),
});

export const MANUAL_ACCEPTANCE_TOTAL_TASKS =
  Object.keys(MANUAL_ACCEPTANCE_ROLE_TASK_SCENARIOS).length * MANUAL_ACCEPTANCE_TASKS_PER_ROLE;
