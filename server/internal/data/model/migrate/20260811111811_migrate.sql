-- migration-risk: maintenance
-- affected-table: inventory_lots, outsourcing_orders, process_instances, process_node_instances, purchase_orders, sales_orders, source_order_lifecycle_events, inventory_lot_status_events
-- expected-lock: ACCESS EXCLUSIVE on altered runtime and source-order tables
-- preflight: scripts/qa/process-runtime-state-machine-preflight.sql
-- recovery: restore verified backup or apply a forward-fix migration; never edit an applied revision
-- maintenance-required: true

-- Modify "inventory_lots" table
ALTER TABLE "inventory_lots" ADD CONSTRAINT "inventory_lots_status_allowed" CHECK ((status)::text = ANY ((ARRAY['ACTIVE'::character varying, 'HOLD'::character varying, 'REJECTED'::character varying, 'DISABLED'::character varying])::text[])), ADD CONSTRAINT "inventory_lots_version_positive" CHECK (version > 0), ADD COLUMN "version" bigint NOT NULL DEFAULT 1, ADD COLUMN "status_action" character varying NULL, ADD COLUMN "status_reason" character varying NULL, ADD COLUMN "status_changed_at" timestamptz NULL, ADD COLUMN "status_changed_by" bigint NULL;
-- Create index "inventorylot_status_updated_at" to table: "inventory_lots"
CREATE INDEX "inventorylot_status_updated_at" ON "inventory_lots" ("status", "updated_at");
-- Modify "outsourcing_orders" table
ALTER TABLE "outsourcing_orders" ADD COLUMN "settlement_action" character varying NULL, ADD COLUMN "settlement_mode" character varying NULL, ADD COLUMN "settlement_reason" character varying NULL, ADD COLUMN "settled_at" timestamptz NULL, ADD COLUMN "settled_by" bigint NULL;
-- Modify "process_instances" table
ALTER TABLE "process_instances" ADD CONSTRAINT "process_instances_resolution_allowed" CHECK ((resolution_kind IS NULL) OR ((resolution_kind)::text = ANY ((ARRAY['succeeded'::character varying, 'rejected'::character varying, 'cancelled'::character varying, 'compensated'::character varying])::text[]))), ADD COLUMN "terminal_node_instance_id" bigint NULL, ADD COLUMN "resolution_kind" character varying NULL, ADD COLUMN "resolution_reason" character varying NULL, ADD COLUMN "resolved_at" timestamptz NULL, ADD COLUMN "resolved_by" bigint NULL, ADD COLUMN "block_kind" character varying NULL, ADD COLUMN "blocked_reason_code" character varying NULL, ADD COLUMN "blocked_reason" character varying NULL, ADD COLUMN "blocked_at" timestamptz NULL, ADD COLUMN "blocked_by" bigint NULL;
-- Create index "processinstance_resolution_kind_resolved_at" to table: "process_instances"
CREATE INDEX "processinstance_resolution_kind_resolved_at" ON "process_instances" ("resolution_kind", "resolved_at");
-- Modify "process_node_instances" table
ALTER TABLE "process_node_instances" DROP CONSTRAINT "process_node_instances_lifecycle_bundle", ADD CONSTRAINT "process_node_instances_lifecycle_bundle" CHECK ((((status)::text = 'waiting'::text) AND (started_at IS NULL) AND (completed_at IS NULL)) OR (((status)::text = 'active'::text) AND (started_at IS NOT NULL) AND (completed_at IS NULL)) OR (((status)::text = 'completed'::text) AND (started_at IS NOT NULL) AND (completed_at IS NOT NULL)) OR (((status)::text = 'blocked'::text) AND (started_at IS NOT NULL) AND (completed_at IS NULL)) OR (((status)::text = 'withdrawn'::text) AND (completed_at IS NOT NULL))), DROP CONSTRAINT "process_node_instances_status_allowed", ADD CONSTRAINT "process_node_instances_status_allowed" CHECK ((status)::text = ANY ((ARRAY['waiting'::character varying, 'active'::character varying, 'completed'::character varying, 'blocked'::character varying, 'withdrawn'::character varying])::text[])), ADD COLUMN "activated_from_node_instance_id" bigint NULL, ADD COLUMN "routing_completed_at" timestamptz NULL, ADD COLUMN "routing_completed_by" bigint NULL, ADD COLUMN "block_kind" character varying NULL, ADD COLUMN "blocked_reason_code" character varying NULL, ADD COLUMN "blocked_reason" character varying NULL, ADD COLUMN "blocked_at" timestamptz NULL, ADD COLUMN "blocked_by" bigint NULL, ADD COLUMN "resume_reason" character varying NULL, ADD COLUMN "resumed_at" timestamptz NULL, ADD COLUMN "resumed_by" bigint NULL, ADD COLUMN "updated_by" bigint NULL;
-- Create index "processnodeinstance_process_instance_id_activated_from_node_ins" to table: "process_node_instances"
CREATE INDEX "processnodeinstance_process_instance_id_activated_from_node_ins" ON "process_node_instances" ("process_instance_id", "activated_from_node_instance_id");
-- Modify "purchase_orders" table
ALTER TABLE "purchase_orders" ADD COLUMN "settlement_action" character varying NULL, ADD COLUMN "settlement_mode" character varying NULL, ADD COLUMN "settlement_reason" character varying NULL, ADD COLUMN "settled_at" timestamptz NULL, ADD COLUMN "settled_by" bigint NULL;
-- Modify "sales_orders" table
ALTER TABLE "sales_orders" ADD COLUMN "settlement_action" character varying NULL, ADD COLUMN "settlement_mode" character varying NULL, ADD COLUMN "settlement_reason" character varying NULL, ADD COLUMN "settled_at" timestamptz NULL, ADD COLUMN "settled_by" bigint NULL;
-- Create "source_order_lifecycle_events" table
CREATE TABLE "source_order_lifecycle_events" (
  "id" bigint NOT NULL GENERATED BY DEFAULT AS IDENTITY,
  "source_type" character varying NOT NULL,
  "source_id" bigint NOT NULL,
  "source_version" bigint NOT NULL,
  "action_key" character varying NOT NULL,
  "from_status" character varying NOT NULL,
  "to_status" character varying NOT NULL,
  "idempotency_key" character varying NOT NULL,
  "intent_hash" character varying NOT NULL,
  "reason" character varying NULL,
  "close_mode" character varying NULL,
  "result_contract" character varying NOT NULL,
  "mutation_result" jsonb NOT NULL,
  "actor_id" bigint NOT NULL,
  "created_at" timestamptz NOT NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "source_order_lifecycle_events_hash_length" CHECK (length((intent_hash)::text) = 64),
  CONSTRAINT "source_order_lifecycle_events_contract_v1" CHECK ((result_contract)::text = 'source-order-lifecycle-result/v1'::text),
  CONSTRAINT "source_order_lifecycle_events_source_allowed" CHECK ((source_type)::text = ANY ((ARRAY['sales_order'::character varying, 'purchase_order'::character varying, 'outsourcing_order'::character varying])::text[])),
  CONSTRAINT "source_order_lifecycle_events_version_positive" CHECK (source_version > 0)
);
-- Create index "sourceorderlifecycleevent_actor_id_created_at" to table: "source_order_lifecycle_events"
CREATE INDEX "sourceorderlifecycleevent_actor_id_created_at" ON "source_order_lifecycle_events" ("actor_id", "created_at");
-- Create index "sourceorderlifecycleevent_source_type_source_id_idempotency_key" to table: "source_order_lifecycle_events"
CREATE UNIQUE INDEX "sourceorderlifecycleevent_source_type_source_id_idempotency_key" ON "source_order_lifecycle_events" ("source_type", "source_id", "idempotency_key");
-- Create index "sourceorderlifecycleevent_source_type_source_id_source_version" to table: "source_order_lifecycle_events"
CREATE UNIQUE INDEX "sourceorderlifecycleevent_source_type_source_id_source_version" ON "source_order_lifecycle_events" ("source_type", "source_id", "source_version");
-- Create "inventory_lot_status_events" table
CREATE TABLE "inventory_lot_status_events" (
  "id" bigint NOT NULL GENERATED BY DEFAULT AS IDENTITY,
  "lot_version" bigint NOT NULL,
  "action_key" character varying NOT NULL,
  "from_status" character varying NOT NULL,
  "to_status" character varying NOT NULL,
  "reason" character varying NOT NULL,
  "idempotency_key" character varying NOT NULL,
  "intent_hash" character varying NOT NULL,
  "actor_id" bigint NULL,
  "quality_inspection_id" bigint NULL,
  "created_at" timestamptz NOT NULL,
  "inventory_lot_id" bigint NOT NULL,
  PRIMARY KEY ("id"),
  CONSTRAINT "inventory_lot_status_events_inventory_lots_status_events" FOREIGN KEY ("inventory_lot_id") REFERENCES "inventory_lots" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION,
  CONSTRAINT "inventory_lot_status_events_quality_inspections_inventory_lot_s" FOREIGN KEY ("quality_inspection_id") REFERENCES "quality_inspections" ("id") ON UPDATE NO ACTION ON DELETE NO ACTION,
  CONSTRAINT "inventory_lot_status_events_hash_length" CHECK (length((intent_hash)::text) = 64),
  CONSTRAINT "inventory_lot_status_events_version_positive" CHECK (lot_version > 0)
);
-- Create index "inventorylotstatusevent_actor_id_created_at" to table: "inventory_lot_status_events"
CREATE INDEX "inventorylotstatusevent_actor_id_created_at" ON "inventory_lot_status_events" ("actor_id", "created_at");
-- Create index "inventorylotstatusevent_inventory_lot_id_idempotency_key" to table: "inventory_lot_status_events"
CREATE UNIQUE INDEX "inventorylotstatusevent_inventory_lot_id_idempotency_key" ON "inventory_lot_status_events" ("inventory_lot_id", "idempotency_key");
-- Create index "inventorylotstatusevent_inventory_lot_id_lot_version" to table: "inventory_lot_status_events"
CREATE UNIQUE INDEX "inventorylotstatusevent_inventory_lot_id_lot_version" ON "inventory_lot_status_events" ("inventory_lot_id", "lot_version");
