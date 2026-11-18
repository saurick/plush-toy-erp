-- migration-risk: maintenance
-- affected-table: sales_orders
-- expected-lock: ACCESS EXCLUSIVE while adding the creation receipt columns and validating their bundle
-- preflight: scripts/qa/database-constraint-preflight.sql
-- recovery: restore verified backup or apply a forward-fix migration; never edit an applied revision
-- maintenance-required: true

-- Modify "sales_orders" table
ALTER TABLE "sales_orders" ADD CONSTRAINT "sales_orders_create_intent_bundle" CHECK (((create_idempotency_key IS NULL) AND (create_intent_hash IS NULL) AND (create_actor_id IS NULL)) OR ((create_idempotency_key IS NOT NULL) AND (create_intent_hash IS NOT NULL) AND (create_actor_id IS NOT NULL) AND (create_actor_id > 0) AND ((length(TRIM(BOTH FROM create_idempotency_key)) >= 1) AND (length(TRIM(BOTH FROM create_idempotency_key)) <= 128)) AND (length((create_intent_hash)::text) = 64))), ADD COLUMN "create_idempotency_key" character varying NULL, ADD COLUMN "create_intent_hash" character varying NULL, ADD COLUMN "create_actor_id" bigint NULL;
-- Create index "salesorder_create_idempotency_key" to table: "sales_orders"
CREATE UNIQUE INDEX "salesorder_create_idempotency_key" ON "sales_orders" ("create_idempotency_key");
