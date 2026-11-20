-- Read-only guard: a batch reference cannot own a ProcessRuntime node.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM workflow_tasks
     WHERE (source_type IS NULL) <> (source_id IS NULL)
        OR (source_type IS NOT NULL AND (length(trim(source_type)) = 0 OR source_id <= 0))) THEN
    RAISE EXCEPTION 'workflow tasks contain an incomplete business source pair';
  END IF;
  IF EXISTS (SELECT 1 FROM workflow_tasks
     WHERE source_type = 'simulated-manual-acceptance-task-batch'
       AND (process_instance_id IS NOT NULL OR process_node_instance_id IS NOT NULL)) THEN
    RAISE EXCEPTION 'batch-only workflow source unexpectedly has process anchors';
  END IF;
END $$;

SELECT count(*) AS task_marker_candidates FROM workflow_tasks
 WHERE payload ?| ARRAY['simulated_only', 'real_customer_data', 'trial_task', 'evidence_class', 'proves_process_runtime', 'acceptance_scenario_key']
    OR source_type = 'simulated-manual-acceptance-task-batch';
