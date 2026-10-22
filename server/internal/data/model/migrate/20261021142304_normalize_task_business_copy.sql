-- migration-risk: maintenance
-- affected-table: workflow_tasks, workflow_task_events, sales_orders
-- expected-lock: ROW EXCLUSIVE
-- preflight: scripts/qa/business-data-markers-preflight.sql
-- recovery: restore-reviewed-pre-migration-backup-and-previous-runtime
-- maintenance-required: true

-- Match the exact retired generator phrases. Historical mutation receipts
-- remain unchanged; the current task projection receives a forward event.
WITH business_phrases(old_value, new_value) AS (VALUES
  ('验收样例：当前节点已核对完成。', '当前节点已核对完成。'),
  ('验收样例：等待客户补充资料。', '等待客户补充资料。'),
  ('验收样例：订单资料不完整，退回补充。', '订单资料不完整，退回补充。')
), normalized AS (
  SELECT task.id,
    coalesce((
      SELECT jsonb_object_agg(entry.key, coalesce(to_jsonb(business_phrases.new_value), entry.value))
      FROM jsonb_each(task.payload) AS entry
      LEFT JOIN business_phrases ON entry.value = to_jsonb(business_phrases.old_value)
    ), task.payload) AS payload,
    coalesce((SELECT new_value FROM business_phrases WHERE old_value = task.blocked_reason), task.blocked_reason) AS blocked_reason
  FROM workflow_tasks AS task
), changed AS (
  UPDATE workflow_tasks AS task
     SET payload = normalized.payload, blocked_reason = normalized.blocked_reason,
         version = task.version + 1, updated_at = CURRENT_TIMESTAMP
    FROM normalized
   WHERE task.id = normalized.id
     AND (task.payload IS DISTINCT FROM normalized.payload
       OR task.blocked_reason IS DISTINCT FROM normalized.blocked_reason)
  RETURNING task.id, task.version, task.task_status_key
)
INSERT INTO workflow_task_events (task_id, task_version, event_type, from_status_key, to_status_key, reason, payload, created_at)
SELECT id, version, 'source_updated', task_status_key, task_status_key,
  '任务资料已整理', '{"source":"business_data_copy_normalization"}'::jsonb, CURRENT_TIMESTAMP FROM changed;

UPDATE sales_orders AS orders SET settlement_reason = business_phrases.new_value
FROM (VALUES
  ('验收样例：当前节点已核对完成。', '当前节点已核对完成。'),
  ('验收样例：等待客户补充资料。', '等待客户补充资料。'),
  ('验收样例：订单资料不完整，退回补充。', '订单资料不完整，退回补充。')
) AS business_phrases(old_value, new_value)
WHERE orders.settlement_reason = business_phrases.old_value;
