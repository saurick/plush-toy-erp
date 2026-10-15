package data

// Source relations are shared by order progress and task-chain reads. Only
// persisted foreign keys link records; workflow payloads never supply identity.
const workflowTaskSourceLinksCTE = `production_task_lines AS (
 SELECT t.id AS task_id,pi.id AS item_id FROM visible_tasks t
 JOIN production_order_items pi ON lower(t.source_type) IN ('production_order','production-orders') AND t.source_id=pi.production_order_id
 UNION
 SELECT t.id,b.production_order_item_id FROM visible_tasks t JOIN production_wip_batches b
 ON lower(t.source_type)='production_wip_batch' AND t.source_id=b.id
 UNION
 SELECT t.id,p.production_order_item_id FROM visible_tasks t JOIN production_packaging_confirmations p
 ON lower(t.source_type)='production_packaging_confirmation' AND t.source_id=p.id
 UNION
 SELECT t.id,f.source_line_id FROM visible_tasks t JOIN production_facts f
 ON lower(t.source_type) IN ('production_fact','production-progress') AND t.source_id=f.id
 WHERE f.source_type='PRODUCTION_ORDER' AND f.fact_type='FINISHED_GOODS_RECEIPT'
 UNION
 SELECT t.id,m.production_order_item_id FROM visible_tasks t JOIN production_facts f
 ON lower(t.source_type) IN ('production_fact','production-progress') AND t.source_id=f.id
 JOIN production_order_material_requirements m ON m.id=f.source_line_id
 WHERE f.source_type='PRODUCTION_ORDER' AND f.fact_type='MATERIAL_ISSUE'
 UNION
 SELECT t.id,c.source_line_id FROM visible_tasks t JOIN production_facts f
 ON lower(t.source_type) IN ('production_fact','production-progress') AND t.source_id=f.id
 JOIN production_facts c ON f.source_type='PRODUCTION_FACT' AND f.source_id=c.id
 WHERE f.fact_type='REWORK' AND c.source_type='PRODUCTION_ORDER' AND c.fact_type='FINISHED_GOODS_RECEIPT'
 UNION
 SELECT t.id,b.production_order_item_id FROM visible_tasks t JOIN quality_inspections q
 ON lower(t.source_type)='quality_inspection' AND t.source_id=q.id JOIN production_wip_batches b ON b.id=q.production_wip_batch_id
 UNION
 SELECT t.id,b.production_order_item_id FROM visible_tasks t JOIN outsourcing_orders o
 ON lower(t.source_type)='outsourcing_order' AND t.source_id=o.id JOIN production_wip_batches b ON b.id=o.source_wip_batch_id
 UNION
 SELECT t.id,b.production_order_item_id FROM visible_tasks t JOIN outsourcing_facts f
 ON lower(t.source_type)='outsourcing_fact' AND t.source_id=f.id
 JOIN outsourcing_orders o ON f.source_type='OUTSOURCING_ORDER' AND o.id=f.source_id
 JOIN production_wip_batches b ON b.id=o.source_wip_batch_id
 UNION
 SELECT t.id,b.production_order_item_id FROM visible_tasks t JOIN quality_inspections q
 ON lower(t.source_type)='quality_inspection' AND t.source_id=q.id
 JOIN outsourcing_facts f ON q.source_type='OUTSOURCING_FACT' AND q.source_id=f.id
 JOIN outsourcing_orders o ON f.source_type='OUTSOURCING_ORDER' AND o.id=f.source_id
 JOIN production_wip_batches b ON b.id=o.source_wip_batch_id
),
purchase_task_orders AS (
 SELECT t.id AS task_id,p.id AS purchase_order_id FROM visible_tasks t JOIN purchase_orders p
 ON lower(t.source_type)='purchase_order' AND t.source_id=p.id
 UNION
 SELECT t.id,pi.purchase_order_id FROM visible_tasks t JOIN purchase_receipt_items r
 ON lower(t.source_type)='purchase_receipt' AND t.source_id=r.receipt_id
 JOIN purchase_order_items pi ON pi.id=r.purchase_order_item_id
 UNION
 SELECT t.id,pi.purchase_order_id FROM visible_tasks t JOIN quality_inspections q
 ON lower(t.source_type)='quality_inspection' AND t.source_id=q.id
 JOIN purchase_receipt_items r ON r.id=q.purchase_receipt_item_id JOIN purchase_order_items pi ON pi.id=r.purchase_order_item_id
),
task_sources AS (
 SELECT t.id AS task_id, 'orders' AS view_key, s.id AS board_id FROM visible_tasks t
 JOIN sales_orders s ON lower(t.source_type)='sales_order' AND t.source_id=s.id
 UNION
 SELECT x.task_id,'purchase',x.purchase_order_id FROM purchase_task_orders x
 UNION
 SELECT t.id, 'production', p.id FROM visible_tasks t
 JOIN production_orders p ON lower(t.source_type) IN ('production_order','production-orders') AND t.source_id=p.id
 UNION
 SELECT t.id, 'orders', si.sales_order_id FROM visible_tasks t
 JOIN production_order_items pi ON lower(t.source_type) IN ('production_order','production-orders') AND t.source_id=pi.production_order_id
 JOIN sales_order_items si ON si.id=pi.sales_order_item_id
 UNION
 SELECT t.id, 'orders', s.sales_order_id FROM visible_tasks t
 JOIN shipments s ON lower(t.source_type) IN ('shipment','shipments') AND t.source_id=s.id WHERE s.sales_order_id IS NOT NULL
 UNION
 SELECT t.id, 'orders', r.sales_order_id FROM visible_tasks t
 JOIN engineering_material_requests r ON lower(t.source_type)='engineering_material_request' AND t.source_id=r.id
 UNION
 SELECT t.id, 'production', e.production_order_id FROM visible_tasks t
 JOIN production_exception_decisions e ON lower(t.source_type)='production_exception_decision' AND t.source_id=e.id
 UNION
 SELECT t.id, 'orders', si.sales_order_id FROM visible_tasks t
 JOIN production_exception_decisions e ON lower(t.source_type)='production_exception_decision' AND t.source_id=e.id
 JOIN production_order_items pi ON pi.id=e.production_order_item_id JOIN sales_order_items si ON si.id=pi.sales_order_item_id
 UNION
 SELECT x.task_id,'production',pi.production_order_id FROM production_task_lines x JOIN production_order_items pi ON pi.id=x.item_id
 UNION
 SELECT x.task_id,'orders',si.sales_order_id FROM production_task_lines x JOIN production_order_items pi ON pi.id=x.item_id
 JOIN sales_order_items si ON si.id=pi.sales_order_item_id
 UNION
 SELECT x.task_id,'orders',r.sales_order_id FROM purchase_task_orders x JOIN purchase_orders p ON p.id=x.purchase_order_id
 JOIN engineering_material_requests r ON r.id=p.engineering_material_request_id
)`
