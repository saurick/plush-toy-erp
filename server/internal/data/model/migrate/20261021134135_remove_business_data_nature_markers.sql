-- migration-risk: maintenance
-- affected-table: workflow_tasks, workflow_task_events, workflow_business_states, sales_orders, purchase_orders, outsourcing_orders, materials, products, warehouses, processes, bom_headers, suppliers, production_facts, finance_facts, finance_payments, quality_inspections, business_attachments
-- expected-lock: ROW EXCLUSIVE
-- preflight: scripts/qa/business-data-markers-preflight.sql
-- recovery: restore-reviewed-pre-migration-backup-and-previous-runtime
-- maintenance-required: true

-- The temporary map only removes generator metadata and exact generator phrases.
-- Historical mutation receipts remain immutable; task changes append an event.
CREATE TEMP TABLE business_data_copy (old_value jsonb PRIMARY KEY, new_value jsonb NOT NULL);
INSERT INTO business_data_copy (old_value, new_value) VALUES
  (to_jsonb('模拟业务链核验，不代表真实客户业务。'::text), to_jsonb('按订单要求核对并处理。'::text)),
  (to_jsonb('模拟样品已核对，仅用于试用流程演示。'::text), to_jsonb('样品已核对，请按确认资料办理。'::text)),
  (to_jsonb('模拟工业区加工路 8 号'::text), to_jsonb('加工路 8 号'::text)),
  (to_jsonb('模拟工业区收货路 1 号'::text), to_jsonb('收货路 1 号'::text)),
  (to_jsonb('演示联系人'::text), to_jsonb('采购联系人'::text)),
  (to_jsonb('永绅演示工厂'::text), to_jsonb('永绅玩具工厂'::text)),
  (to_jsonb('演示加工地址'::text), to_jsonb('加工路 8 号'::text)),
  (to_jsonb('演示地址'::text), to_jsonb('收货路 1 号'::text)),
  (to_jsonb('模拟确认样'::text), to_jsonb('确认样'::text)),
  (to_jsonb('模拟手工返修加工'::text), to_jsonb('手工返修加工'::text)),
  (to_jsonb('模拟确认资料补齐后重新检验'::text), to_jsonb('确认资料补齐后重新检验'::text)),
  (to_jsonb('符合模拟确认样'::text), to_jsonb('符合确认样'::text)),
  (to_jsonb('已核对模拟确认样'::text), to_jsonb('已核对确认样'::text)),
  (to_jsonb('模拟颜色偏差'::text), to_jsonb('颜色偏差'::text)),
  (to_jsonb('模拟验收记录'::text), to_jsonb('已记录检验结果'::text)),
  (to_jsonb('本批返工样例取消'::text), to_jsonb('本批返工取消'::text)),
  (to_jsonb('本地验收：模拟生产损耗需追加领料一件。'::text), to_jsonb('生产损耗需追加领料一件。'::text)),
  (to_jsonb('本地验收：批准本批模拟超领额度。'::text), to_jsonb('批准本批超领额度。'::text)),
  (to_jsonb('本地验收：已核对模拟收付款来源与核销金额。'::text), to_jsonb('已核对收付款来源与核销金额。'::text)),
  (to_jsonb('本地验收模拟账户'::text), to_jsonb('银行账户'::text)),
  (to_jsonb('本地验收模拟凭据，不代表真实收付款'::text), to_jsonb('银行回单'::text)),
  (to_jsonb('本地验收：冲销模拟收款并恢复原核销金额。'::text), to_jsonb('冲销收款并恢复原核销金额。'::text)),
  (to_jsonb('本地验收：模拟财务红冲。'::text), to_jsonb('原单金额有误，申请红冲。'::text)),
  (to_jsonb('本地验收：反向红冲错误的模拟红冲单。'::text), to_jsonb('原红冲单有误，反向红冲。'::text)),
  (to_jsonb('样例附件，只用于查看和下载。'::text), to_jsonb('按对应单据核对附件。'::text)),
  (to_jsonb('核心演示 BOM，只用于本地试用和 QA，不代表真实客户资料。'::text), to_jsonb('BOM，按确认材料与用量生产。'::text)),
  (to_jsonb('核心演示 BOM，用于覆盖多材料、多单位和包装箱场景。'::text), to_jsonb('BOM，核对材料、单位和包装箱用量。'::text)),
  (to_jsonb('核心演示委外工序，可按实际工厂继续扩展。'::text), to_jsonb('委外工序，可按实际工厂继续扩展。'::text)),
  (to_jsonb('核心演示 短毛绒面料'::text), to_jsonb('短毛绒面料'::text)),
  (to_jsonb('核心演示 PP 棉'::text), to_jsonb('PP 棉'::text)),
  (to_jsonb('核心演示 安全眼'::text), to_jsonb('安全眼'::text)),
  (to_jsonb('核心演示 绣花线'::text), to_jsonb('绣花线'::text)),
  (to_jsonb('核心演示 包装袋'::text), to_jsonb('包装袋'::text)),
  (to_jsonb('核心演示 外箱'::text), to_jsonb('外箱'::text)),
  (to_jsonb('核心演示 洗水标'::text), to_jsonb('洗水标'::text)),
  (to_jsonb('核心演示 毛绒抱枕'::text), to_jsonb('毛绒抱枕'::text)),
  (to_jsonb('核心演示 毛绒挂件'::text), to_jsonb('毛绒挂件'::text)),
  (to_jsonb('核心演示 安抚熊'::text), to_jsonb('安抚熊'::text)),
  (to_jsonb('核心演示 节日钥匙扣'::text), to_jsonb('节日钥匙扣'::text)),
  (to_jsonb('核心演示原料仓'::text), to_jsonb('原料仓'::text)),
  (to_jsonb('核心演示成品仓'::text), to_jsonb('成品仓'::text)),
  (to_jsonb('核心演示待检仓'::text), to_jsonb('待检仓'::text)),
  (to_jsonb('核心演示在制仓'::text), to_jsonb('在制仓'::text));
INSERT INTO business_data_copy (old_value, new_value) VALUES
  (to_jsonb('验收样例：保留未履约源单的短关闭终态。'::text), to_jsonb('剩余数量不再履约，按当前数量结束。'::text)),
  (to_jsonb('验收样例：保留源单取消终态。'::text), to_jsonb('订单取消，不再安排后续业务。'::text)),
  (to_jsonb('验收样例：当前流程节点已核对完成。'::text), to_jsonb('当前流程节点已核对完成。'::text));
CREATE TEMP TABLE business_data_values (
  table_name text NOT NULL, row_id bigint NOT NULL, column_name text NOT NULL,
  original jsonb NOT NULL, normalized jsonb NOT NULL,
  PRIMARY KEY (table_name, row_id, column_name)
);
INSERT INTO business_data_values (table_name, row_id, column_name, original, normalized)
SELECT 'workflow_tasks', id, 'payload', payload, payload FROM workflow_tasks WHERE payload IS NOT NULL
UNION ALL
SELECT 'workflow_business_states', id, 'payload', payload, payload FROM workflow_business_states WHERE payload IS NOT NULL
UNION ALL
SELECT 'sales_orders', id, 'customer_snapshot', customer_snapshot, customer_snapshot FROM sales_orders WHERE customer_snapshot IS NOT NULL
UNION ALL
SELECT 'sales_orders', id, 'contact_snapshot', contact_snapshot, contact_snapshot FROM sales_orders WHERE contact_snapshot IS NOT NULL
UNION ALL
SELECT 'sales_orders', id, 'delivery_snapshot', delivery_snapshot, delivery_snapshot FROM sales_orders WHERE delivery_snapshot IS NOT NULL
UNION ALL
SELECT 'sales_orders', id, 'note', to_jsonb(note), to_jsonb(note) FROM sales_orders WHERE note IS NOT NULL
UNION ALL
SELECT 'purchase_orders', id, 'supplier_snapshot', supplier_snapshot, supplier_snapshot FROM purchase_orders WHERE supplier_snapshot IS NOT NULL
UNION ALL
SELECT 'purchase_orders', id, 'contract_party_snapshot', contract_party_snapshot, contract_party_snapshot FROM purchase_orders WHERE contract_party_snapshot IS NOT NULL
UNION ALL
SELECT 'purchase_orders', id, 'note', to_jsonb(note), to_jsonb(note) FROM purchase_orders WHERE note IS NOT NULL
UNION ALL
SELECT 'purchase_orders', id, 'delivery_address', to_jsonb(delivery_address), to_jsonb(delivery_address) FROM purchase_orders WHERE delivery_address IS NOT NULL
UNION ALL
SELECT 'outsourcing_orders', id, 'supplier_snapshot', supplier_snapshot, supplier_snapshot FROM outsourcing_orders WHERE supplier_snapshot IS NOT NULL
UNION ALL
SELECT 'outsourcing_orders', id, 'contract_party_snapshot', contract_party_snapshot, contract_party_snapshot FROM outsourcing_orders WHERE contract_party_snapshot IS NOT NULL
UNION ALL
SELECT 'outsourcing_orders', id, 'note', to_jsonb(note), to_jsonb(note) FROM outsourcing_orders WHERE note IS NOT NULL
UNION ALL
SELECT 'materials', id, 'name', to_jsonb(name), to_jsonb(name) FROM materials WHERE name IS NOT NULL
UNION ALL
SELECT 'products', id, 'name', to_jsonb(name), to_jsonb(name) FROM products WHERE name IS NOT NULL
UNION ALL
SELECT 'warehouses', id, 'name', to_jsonb(name), to_jsonb(name) FROM warehouses WHERE name IS NOT NULL
UNION ALL
SELECT 'processes', id, 'note', to_jsonb(note), to_jsonb(note) FROM processes WHERE note IS NOT NULL
UNION ALL
SELECT 'bom_headers', id, 'note', to_jsonb(note), to_jsonb(note) FROM bom_headers WHERE note IS NOT NULL
UNION ALL
SELECT 'suppliers', id, 'address', to_jsonb(address), to_jsonb(address) FROM suppliers WHERE address IS NOT NULL
UNION ALL
SELECT 'production_facts', id, 'note', to_jsonb(note), to_jsonb(note) FROM production_facts WHERE note IS NOT NULL
UNION ALL
SELECT 'finance_facts', id, 'note', to_jsonb(note), to_jsonb(note) FROM finance_facts WHERE note IS NOT NULL
UNION ALL
SELECT 'finance_payments', id, 'purpose_note', to_jsonb(purpose_note), to_jsonb(purpose_note) FROM finance_payments WHERE purpose_note IS NOT NULL
UNION ALL
SELECT 'finance_payments', id, 'account_ref', to_jsonb(account_ref), to_jsonb(account_ref) FROM finance_payments WHERE account_ref IS NOT NULL
UNION ALL
SELECT 'finance_payments', id, 'evidence_ref', to_jsonb(evidence_ref), to_jsonb(evidence_ref) FROM finance_payments WHERE evidence_ref IS NOT NULL
UNION ALL
SELECT 'quality_inspections', id, 'check_items', check_items, check_items FROM quality_inspections WHERE check_items IS NOT NULL
UNION ALL
SELECT 'sales_orders', id, 'settlement_reason', to_jsonb(settlement_reason), to_jsonb(settlement_reason) FROM sales_orders WHERE settlement_reason IS NOT NULL
UNION ALL
SELECT 'purchase_orders', id, 'settlement_reason', to_jsonb(settlement_reason), to_jsonb(settlement_reason) FROM purchase_orders WHERE settlement_reason IS NOT NULL
UNION ALL
SELECT 'outsourcing_orders', id, 'settlement_reason', to_jsonb(settlement_reason), to_jsonb(settlement_reason) FROM outsourcing_orders WHERE settlement_reason IS NOT NULL
UNION ALL
SELECT 'production_facts', id, 'cancel_reason', to_jsonb(cancel_reason), to_jsonb(cancel_reason) FROM production_facts WHERE cancel_reason IS NOT NULL
UNION ALL
SELECT 'finance_facts', id, 'cancel_reason', to_jsonb(cancel_reason), to_jsonb(cancel_reason) FROM finance_facts WHERE cancel_reason IS NOT NULL
UNION ALL
SELECT 'finance_payments', id, 'cancel_reason', to_jsonb(cancel_reason), to_jsonb(cancel_reason) FROM finance_payments WHERE cancel_reason IS NOT NULL
UNION ALL
SELECT 'finance_payments', id, 'reject_reason', to_jsonb(reject_reason), to_jsonb(reject_reason) FROM finance_payments WHERE reject_reason IS NOT NULL
UNION ALL
SELECT 'finance_payments', id, 'reverse_reason', to_jsonb(reverse_reason), to_jsonb(reverse_reason) FROM finance_payments WHERE reverse_reason IS NOT NULL
UNION ALL
SELECT 'business_attachments', id, 'note', to_jsonb(note), to_jsonb(note) FROM business_attachments WHERE note IS NOT NULL;

DO $$
DECLARE edit record;
BEGIN
  IF EXISTS (SELECT 1 FROM workflow_tasks
     WHERE source_type = 'simulated-manual-acceptance-task-batch'
       AND (process_instance_id IS NOT NULL OR process_node_instance_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'batch-only workflow source unexpectedly has process anchors';
  END IF;
  FOR edit IN
    WITH RECURSIVE nodes AS (
      SELECT table_name, row_id, column_name, ARRAY[]::text[] AS path, original AS value
      FROM business_data_values
      UNION ALL
      SELECT node.table_name, node.row_id, node.column_name, node.path || child.key, child.value
      FROM nodes AS node
      CROSS JOIN LATERAL (
        SELECT key, value FROM jsonb_each(CASE WHEN jsonb_typeof(node.value) = 'object' THEN node.value ELSE '{}'::jsonb END)
        UNION ALL
        SELECT (ordinality - 1)::text, value FROM jsonb_array_elements(CASE WHEN jsonb_typeof(node.value) = 'array' THEN node.value ELSE '[]'::jsonb END) WITH ORDINALITY
      ) AS child
    )
    SELECT node.table_name, node.row_id, node.column_name, node.path, replacement.new_value,
      coalesce(node.path[cardinality(node.path)] = ANY (ARRAY['simulated_only', 'real_customer_data', 'trial_task', 'evidence_class', 'proves_process_runtime', 'acceptance_scenario_key']), false) AS remove_key
    FROM nodes AS node
    LEFT JOIN business_data_copy AS replacement ON replacement.old_value = node.value
    WHERE replacement.new_value IS NOT NULL
       OR node.path[cardinality(node.path)] = ANY (ARRAY['simulated_only', 'real_customer_data', 'trial_task', 'evidence_class', 'proves_process_runtime', 'acceptance_scenario_key'])
    ORDER BY cardinality(node.path) DESC
  LOOP
    UPDATE business_data_values AS target
       SET normalized = CASE WHEN edit.remove_key THEN target.normalized #- edit.path
         WHEN cardinality(edit.path) = 0 THEN edit.new_value
         ELSE jsonb_set(target.normalized, edit.path, edit.new_value, false) END
     WHERE target.table_name = edit.table_name AND target.row_id = edit.row_id AND target.column_name = edit.column_name;
  END LOOP;
END $$;

WITH normalized AS (
  SELECT task.id, coalesce(value.normalized, task.payload) AS payload,
    task.source_type = 'simulated-manual-acceptance-task-batch' AS batch_only
  FROM workflow_tasks AS task
  LEFT JOIN business_data_values AS value ON value.table_name = 'workflow_tasks' AND value.row_id = task.id AND value.column_name = 'payload'
), changed AS (
  UPDATE workflow_tasks AS task
     SET payload = normalized.payload,
         source_type = CASE WHEN normalized.batch_only THEN NULL ELSE task.source_type END,
         source_id = CASE WHEN normalized.batch_only THEN NULL ELSE task.source_id END,
         source_no = CASE WHEN normalized.batch_only THEN NULL ELSE task.source_no END,
         task_name = CASE WHEN normalized.batch_only THEN regexp_replace(task.task_name, '（[0-9]+）$', '') ELSE task.task_name END,
         version = task.version + 1, updated_at = CURRENT_TIMESTAMP
    FROM normalized
   WHERE task.id = normalized.id
     AND (task.payload IS DISTINCT FROM normalized.payload OR normalized.batch_only)
  RETURNING task.id, task.version, task.task_status_key
)
INSERT INTO workflow_task_events (task_id, task_version, event_type, from_status_key, to_status_key, reason, payload, created_at)
SELECT id, version, 'source_updated', task_status_key, task_status_key,
  '任务资料已整理', '{"source":"business_data_normalization"}'::jsonb, CURRENT_TIMESTAMP FROM changed;

-- A generator batch has no source document or business state of its own.
DELETE FROM workflow_business_states WHERE source_type = 'simulated-manual-acceptance-task-batch';

UPDATE workflow_business_states AS target SET payload = value.normalized
 FROM business_data_values AS value
 WHERE value.table_name = 'workflow_business_states' AND value.row_id = target.id AND value.column_name = 'payload'
   AND value.original IS DISTINCT FROM value.normalized;
UPDATE sales_orders AS target SET customer_snapshot = value.normalized
 FROM business_data_values AS value
 WHERE value.table_name = 'sales_orders' AND value.row_id = target.id AND value.column_name = 'customer_snapshot'
   AND value.original IS DISTINCT FROM value.normalized;
UPDATE sales_orders AS target SET contact_snapshot = value.normalized
 FROM business_data_values AS value
 WHERE value.table_name = 'sales_orders' AND value.row_id = target.id AND value.column_name = 'contact_snapshot'
   AND value.original IS DISTINCT FROM value.normalized;
UPDATE sales_orders AS target SET delivery_snapshot = value.normalized
 FROM business_data_values AS value
 WHERE value.table_name = 'sales_orders' AND value.row_id = target.id AND value.column_name = 'delivery_snapshot'
   AND value.original IS DISTINCT FROM value.normalized;
UPDATE sales_orders AS target SET note = value.normalized #>> '{}'
 FROM business_data_values AS value
 WHERE value.table_name = 'sales_orders' AND value.row_id = target.id AND value.column_name = 'note'
   AND value.original IS DISTINCT FROM value.normalized;
UPDATE purchase_orders AS target SET supplier_snapshot = value.normalized
 FROM business_data_values AS value
 WHERE value.table_name = 'purchase_orders' AND value.row_id = target.id AND value.column_name = 'supplier_snapshot'
   AND value.original IS DISTINCT FROM value.normalized;
UPDATE purchase_orders AS target SET contract_party_snapshot = value.normalized
 FROM business_data_values AS value
 WHERE value.table_name = 'purchase_orders' AND value.row_id = target.id AND value.column_name = 'contract_party_snapshot'
   AND value.original IS DISTINCT FROM value.normalized;
UPDATE purchase_orders AS target SET note = value.normalized #>> '{}'
 FROM business_data_values AS value
 WHERE value.table_name = 'purchase_orders' AND value.row_id = target.id AND value.column_name = 'note'
   AND value.original IS DISTINCT FROM value.normalized;
UPDATE purchase_orders AS target SET delivery_address = value.normalized #>> '{}'
 FROM business_data_values AS value
 WHERE value.table_name = 'purchase_orders' AND value.row_id = target.id AND value.column_name = 'delivery_address'
   AND value.original IS DISTINCT FROM value.normalized;
UPDATE outsourcing_orders AS target SET supplier_snapshot = value.normalized
 FROM business_data_values AS value
 WHERE value.table_name = 'outsourcing_orders' AND value.row_id = target.id AND value.column_name = 'supplier_snapshot'
   AND value.original IS DISTINCT FROM value.normalized;
UPDATE outsourcing_orders AS target SET contract_party_snapshot = value.normalized
 FROM business_data_values AS value
 WHERE value.table_name = 'outsourcing_orders' AND value.row_id = target.id AND value.column_name = 'contract_party_snapshot'
   AND value.original IS DISTINCT FROM value.normalized;
UPDATE outsourcing_orders AS target SET note = value.normalized #>> '{}'
 FROM business_data_values AS value
 WHERE value.table_name = 'outsourcing_orders' AND value.row_id = target.id AND value.column_name = 'note'
   AND value.original IS DISTINCT FROM value.normalized;
UPDATE materials AS target SET name = value.normalized #>> '{}'
 FROM business_data_values AS value
 WHERE value.table_name = 'materials' AND value.row_id = target.id AND value.column_name = 'name'
   AND value.original IS DISTINCT FROM value.normalized;
UPDATE products AS target SET name = value.normalized #>> '{}'
 FROM business_data_values AS value
 WHERE value.table_name = 'products' AND value.row_id = target.id AND value.column_name = 'name'
   AND value.original IS DISTINCT FROM value.normalized;
UPDATE warehouses AS target SET name = value.normalized #>> '{}'
 FROM business_data_values AS value
 WHERE value.table_name = 'warehouses' AND value.row_id = target.id AND value.column_name = 'name'
   AND value.original IS DISTINCT FROM value.normalized;
UPDATE processes AS target SET note = value.normalized #>> '{}'
 FROM business_data_values AS value
 WHERE value.table_name = 'processes' AND value.row_id = target.id AND value.column_name = 'note'
   AND value.original IS DISTINCT FROM value.normalized;
UPDATE bom_headers AS target SET note = value.normalized #>> '{}'
 FROM business_data_values AS value
 WHERE value.table_name = 'bom_headers' AND value.row_id = target.id AND value.column_name = 'note'
   AND value.original IS DISTINCT FROM value.normalized;
UPDATE suppliers AS target SET address = value.normalized #>> '{}'
 FROM business_data_values AS value
 WHERE value.table_name = 'suppliers' AND value.row_id = target.id AND value.column_name = 'address'
   AND value.original IS DISTINCT FROM value.normalized;
UPDATE production_facts AS target SET note = value.normalized #>> '{}'
 FROM business_data_values AS value
 WHERE value.table_name = 'production_facts' AND value.row_id = target.id AND value.column_name = 'note'
   AND value.original IS DISTINCT FROM value.normalized;
UPDATE finance_facts AS target SET note = value.normalized #>> '{}'
 FROM business_data_values AS value
 WHERE value.table_name = 'finance_facts' AND value.row_id = target.id AND value.column_name = 'note'
   AND value.original IS DISTINCT FROM value.normalized;
UPDATE finance_payments AS target SET purpose_note = value.normalized #>> '{}'
 FROM business_data_values AS value
 WHERE value.table_name = 'finance_payments' AND value.row_id = target.id AND value.column_name = 'purpose_note'
   AND value.original IS DISTINCT FROM value.normalized;
UPDATE finance_payments AS target SET account_ref = value.normalized #>> '{}'
 FROM business_data_values AS value
 WHERE value.table_name = 'finance_payments' AND value.row_id = target.id AND value.column_name = 'account_ref'
   AND value.original IS DISTINCT FROM value.normalized;
UPDATE finance_payments AS target SET evidence_ref = value.normalized #>> '{}'
 FROM business_data_values AS value
 WHERE value.table_name = 'finance_payments' AND value.row_id = target.id AND value.column_name = 'evidence_ref'
   AND value.original IS DISTINCT FROM value.normalized;
UPDATE quality_inspections AS target SET check_items = value.normalized
 FROM business_data_values AS value
 WHERE value.table_name = 'quality_inspections' AND value.row_id = target.id AND value.column_name = 'check_items'
   AND value.original IS DISTINCT FROM value.normalized;

UPDATE sales_orders AS target SET settlement_reason = value.normalized #>> '{}'
 FROM business_data_values AS value
 WHERE value.table_name = 'sales_orders' AND value.row_id = target.id AND value.column_name = 'settlement_reason'
   AND value.original IS DISTINCT FROM value.normalized;
UPDATE purchase_orders AS target SET settlement_reason = value.normalized #>> '{}'
 FROM business_data_values AS value
 WHERE value.table_name = 'purchase_orders' AND value.row_id = target.id AND value.column_name = 'settlement_reason'
   AND value.original IS DISTINCT FROM value.normalized;
UPDATE outsourcing_orders AS target SET settlement_reason = value.normalized #>> '{}'
 FROM business_data_values AS value
 WHERE value.table_name = 'outsourcing_orders' AND value.row_id = target.id AND value.column_name = 'settlement_reason'
   AND value.original IS DISTINCT FROM value.normalized;
UPDATE production_facts AS target SET cancel_reason = value.normalized #>> '{}'
 FROM business_data_values AS value
 WHERE value.table_name = 'production_facts' AND value.row_id = target.id AND value.column_name = 'cancel_reason'
   AND value.original IS DISTINCT FROM value.normalized;
UPDATE finance_facts AS target SET cancel_reason = value.normalized #>> '{}'
 FROM business_data_values AS value
 WHERE value.table_name = 'finance_facts' AND value.row_id = target.id AND value.column_name = 'cancel_reason'
   AND value.original IS DISTINCT FROM value.normalized;
UPDATE finance_payments AS target SET cancel_reason = value.normalized #>> '{}'
 FROM business_data_values AS value
 WHERE value.table_name = 'finance_payments' AND value.row_id = target.id AND value.column_name = 'cancel_reason'
   AND value.original IS DISTINCT FROM value.normalized;
UPDATE finance_payments AS target SET reject_reason = value.normalized #>> '{}'
 FROM business_data_values AS value
 WHERE value.table_name = 'finance_payments' AND value.row_id = target.id AND value.column_name = 'reject_reason'
   AND value.original IS DISTINCT FROM value.normalized;
UPDATE finance_payments AS target SET reverse_reason = value.normalized #>> '{}'
 FROM business_data_values AS value
 WHERE value.table_name = 'finance_payments' AND value.row_id = target.id AND value.column_name = 'reverse_reason'
   AND value.original IS DISTINCT FROM value.normalized;
UPDATE business_attachments AS target SET note = value.normalized #>> '{}'
 FROM business_data_values AS value
 WHERE value.table_name = 'business_attachments' AND value.row_id = target.id AND value.column_name = 'note'
   AND value.original IS DISTINCT FROM value.normalized;

DROP TABLE business_data_values;
DROP TABLE business_data_copy;
