-- migration-risk: maintenance
-- affected-table: workflow_tasks, workflow_task_number_counters
-- expected-lock: ROW EXCLUSIVE
-- preflight: scripts/qa/workflow-task-number-preflight.sql
-- recovery: restore-backup-or-forward-fix
-- maintenance-required: true

WITH numbered AS (
  SELECT id,
         to_char(created_at AT TIME ZONE 'Asia/Shanghai', 'YYYYMMDD') AS number_day,
         row_number() OVER (
           PARTITION BY (created_at AT TIME ZONE 'Asia/Shanghai')::date
           ORDER BY created_at, id
         ) AS sequence
  FROM workflow_tasks
  WHERE task_no IS NULL
)
UPDATE workflow_tasks AS task
SET task_no = 'RW' || numbered.number_day || '-' ||
              lpad(numbered.sequence::text, greatest(4, length(numbered.sequence::text)), '0')
FROM numbered
WHERE task.id = numbered.id;

INSERT INTO workflow_task_number_counters (id, last_value)
SELECT substring(task_no FROM 3 FOR 8), max(substring(task_no FROM 12)::bigint)
FROM workflow_tasks
GROUP BY substring(task_no FROM 3 FOR 8)
ON CONFLICT (id) DO UPDATE
SET last_value = greatest(workflow_task_number_counters.last_value, EXCLUDED.last_value);
