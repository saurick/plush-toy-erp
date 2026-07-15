\set ON_ERROR_STOP on

BEGIN;

INSERT INTO units (
  id,
  code,
  name,
  created_at,
  updated_at
) VALUES (
  910001,
  '__qa_populated_upgrade_unit__',
  'QA populated upgrade unit',
  '2026-07-10 15:00:01+00',
  '2026-07-10 15:00:01+00'
);

INSERT INTO products (
  id,
  code,
  name,
  default_unit_id,
  created_at,
  updated_at
) VALUES (
  910001,
  '__qa_populated_upgrade_product__',
  'QA populated upgrade product',
  910001,
  '2026-07-10 15:00:01+00',
  '2026-07-10 15:00:01+00'
);

INSERT INTO bom_headers (
  id,
  version,
  status,
  effective_from,
  effective_to,
  created_at,
  updated_at,
  product_id
) VALUES (
  910001,
  '__qa_populated_upgrade_v1__',
  'DRAFT',
  '2026-07-10 00:00:00+00',
  '2026-07-11 00:00:00+00',
  '2026-07-10 15:00:01+00',
  '2026-07-10 15:00:01+00',
  910001
);

INSERT INTO finance_facts (
  id,
  fact_no,
  fact_type,
  status,
  counterparty_type,
  amount,
  idempotency_key,
  occurred_at,
  created_at,
  updated_at
) VALUES (
  910001,
  '__qa_populated_upgrade_finance__',
  'RECEIVABLE',
  'DRAFT',
  'OTHER',
  1,
  '__qa_populated_upgrade_finance__',
  '2026-07-10 15:00:01+00',
  '2026-07-10 15:00:01+00',
  '2026-07-10 15:00:01+00'
);

INSERT INTO roles (
  id,
  role_key,
  name,
  builtin,
  created_at,
  updated_at
) VALUES
  (
    910001,
    'admin',
    'QA populated upgrade system role',
    true,
    '2026-07-10 15:00:01+00',
    '2026-07-10 15:00:01+00'
  ),
  (
    910002,
    'qa_business_default',
    'QA populated upgrade business default role',
    true,
    '2026-07-10 15:00:01+00',
    '2026-07-10 15:00:01+00'
  ),
  (
    910003,
    'qa_custom',
    'QA populated upgrade custom role',
    false,
    '2026-07-10 15:00:01+00',
    '2026-07-10 15:00:01+00'
  );

INSERT INTO process_instances (
  id,
  process_key,
  process_version,
  config_revision,
  definition_hash,
  business_ref_type,
  business_ref_id,
  idempotency_key,
  status,
  started_at,
  created_at,
  updated_at
) VALUES
  (
    910001,
    '__qa_populated_upgrade_process__',
    'v1',
    '__qa_populated_upgrade_revision__',
    '__qa_populated_upgrade_definition_hash_1__',
    'QA_POPULATED_UPGRADE',
    910001,
    '__qa_populated_upgrade_process_1__',
    'active',
    '2026-07-10 15:00:01+00',
    '2026-07-10 15:00:01+00',
    '2026-07-10 15:00:01+00'
  ),
  (
    910002,
    '__qa_populated_upgrade_process__',
    'v1',
    '__qa_populated_upgrade_revision__',
    '__qa_populated_upgrade_definition_hash_2__',
    'QA_POPULATED_UPGRADE',
    910002,
    '__qa_populated_upgrade_process_2__',
    'active',
    '2026-07-10 15:00:01+00',
    '2026-07-10 15:00:01+00',
    '2026-07-10 15:00:01+00'
  );

INSERT INTO process_node_instances (
  id,
  node_key,
  node_type,
  status,
  version,
  created_at,
  updated_at,
  process_instance_id
) VALUES
  (
    910001,
    '__qa_populated_upgrade_node_1__',
    'human_task',
    'waiting',
    1,
    '2026-07-10 15:00:01+00',
    '2026-07-10 15:00:01+00',
    910001
  ),
  (
    910002,
    '__qa_populated_upgrade_node_2__',
    'human_task',
    'waiting',
    1,
    '2026-07-10 15:00:01+00',
    '2026-07-10 15:00:01+00',
    910002
  );

INSERT INTO workflow_business_states (
  id,
  source_type,
  source_id,
  business_status_key,
  status_changed_at,
  created_at,
  updated_at
) VALUES (
  910001,
  'QA_POPULATED_UPGRADE',
  910001,
  'shipment_release_pending',
  '2026-07-10 15:00:01+00',
  '2026-07-10 15:00:01+00',
  '2026-07-10 15:00:01+00'
);

INSERT INTO workflow_tasks (
  id,
  task_code,
  task_group,
  task_name,
  source_type,
  source_id,
  business_status_key,
  task_status_key,
  owner_role_key,
  created_at,
  updated_at,
  process_instance_id,
  process_node_instance_id
) VALUES (
  910001,
  '__qa_populated_upgrade_task__',
  'QA_POPULATED_UPGRADE',
  'QA populated upgrade task',
  'QA_POPULATED_UPGRADE',
  910001,
  'shipment_release_pending',
  'ready',
  'qa_populated_upgrade_owner',
  '2026-07-10 15:00:01+00',
  '2026-07-10 15:00:01+00',
  910001,
  910001
);

COMMIT;
