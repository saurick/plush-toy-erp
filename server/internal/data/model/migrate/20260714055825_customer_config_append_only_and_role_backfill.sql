-- Run this destructive customer-config cutover only after the fail-prone
-- structural migration has passed. The formal production apply wrapper
-- requires an explicit maintenance confirmation and verifies app-server is
-- stopped, so no old application can race this file. Atlas applies the whole
-- file in one transaction: any failure rolls the reset and every guard back.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "process_instances")
     OR EXISTS (
       SELECT 1
       FROM "workflow_tasks"
       WHERE "config_revision" IS NOT NULL
     ) THEN
    RAISE EXCEPTION 'customer config hash reset requires clearing unreleased process and workflow runtime data first'
      USING ERRCODE = '23514';
  END IF;
END;
$$;

DELETE FROM "access_entitlements";
DELETE FROM "work_pool_memberships";
DELETE FROM "work_pools";
DELETE FROM "role_profiles";
DELETE FROM "deployment_module_states";
DELETE FROM "customer_config_revisions";

ALTER TABLE "customer_config_revisions"
  ADD COLUMN "config_hash_version" smallint NOT NULL DEFAULT 1,
  ADD CONSTRAINT "customer_config_revisions_hash_version"
    CHECK ("config_hash_version" = 1),
  ADD CONSTRAINT "customer_config_revisions_status_allowed"
    CHECK ("status" IN ('building', 'published', 'active', 'superseded'));

CREATE FUNCTION "prevent_customer_config_revision_content_update"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."customer_key" IS DISTINCT FROM OLD."customer_key"
     OR NEW."revision" IS DISTINCT FROM OLD."revision"
     OR NEW."product_version" IS DISTINCT FROM OLD."product_version"
     OR NEW."config_hash" IS DISTINCT FROM OLD."config_hash"
     OR NEW."config_hash_version" IS DISTINCT FROM OLD."config_hash_version"
     OR NEW."compiled_snapshot" IS DISTINCT FROM OLD."compiled_snapshot"
     OR NEW."published_by" IS DISTINCT FROM OLD."published_by"
     OR NEW."published_at" IS DISTINCT FROM OLD."published_at"
     OR NEW."created_at" IS DISTINCT FROM OLD."created_at" THEN
    RAISE EXCEPTION 'customer config revision content is immutable'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "customer_config_revision_content_immutable"
BEFORE UPDATE ON "customer_config_revisions"
FOR EACH ROW
EXECUTE FUNCTION "prevent_customer_config_revision_content_update"();

-- Atlas/Ent owns the structural role columns. This one-time data migration
-- classifies pre-existing rows with the same rule as biz.NormalizeRoleType.
UPDATE "roles"
SET "role_type" = CASE
  WHEN lower(btrim("role_key")) IN ('admin', 'debug_operator') THEN 'system'
  WHEN "builtin" THEN 'business_default'
  ELSE 'custom'
END;

CREATE FUNCTION "prevent_customer_config_revision_delete"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'customer config revisions are append-only'
    USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER "customer_config_revision_delete_immutable"
BEFORE DELETE ON "customer_config_revisions"
FOR EACH ROW
EXECUTE FUNCTION "prevent_customer_config_revision_delete"();

CREATE FUNCTION "enforce_customer_config_revision_lifecycle"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW."status" <> 'building'
       OR NEW."published_by" IS NULL
       OR NEW."published_at" IS NULL
       OR NEW."activated_by" IS NOT NULL
       OR NEW."activated_at" IS NOT NULL THEN
      RAISE EXCEPTION 'customer config revisions must start in building state'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW."status" = OLD."status" THEN
    IF NEW."activated_by" IS DISTINCT FROM OLD."activated_by"
       OR NEW."activated_at" IS DISTINCT FROM OLD."activated_at" THEN
      RAISE EXCEPTION 'customer config lifecycle metadata cannot change without a state transition'
        USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
  END IF;

  IF OLD."status" = 'building'
     AND NEW."status" = 'published'
     AND NEW."activated_by" IS NULL
     AND NEW."activated_at" IS NULL THEN
    RETURN NEW;
  END IF;

  IF OLD."status" = 'published'
     AND NEW."status" = 'active'
     AND NEW."activated_by" IS NOT NULL
     AND NEW."activated_at" IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF OLD."status" = 'active'
     AND NEW."status" = 'superseded'
     AND NEW."activated_by" IS NOT DISTINCT FROM OLD."activated_by"
     AND NEW."activated_at" IS NOT DISTINCT FROM OLD."activated_at" THEN
    RETURN NEW;
  END IF;

  IF OLD."status" = 'superseded'
     AND NEW."status" = 'active'
     AND NEW."activated_by" IS NOT NULL
     AND NEW."activated_at" IS NOT NULL THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'invalid customer config revision lifecycle transition: % -> %', OLD."status", NEW."status"
    USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER "customer_config_revision_lifecycle_guard"
BEFORE INSERT OR UPDATE ON "customer_config_revisions"
FOR EACH ROW
EXECUTE FUNCTION "enforce_customer_config_revision_lifecycle"();

-- Compiled rows are built only inside the publication transaction. The
-- repository inserts the parent revision with the transaction-local
-- "building" state, writes every projection, then atomically publishes it.
-- Once published, no projection may be appended, updated, or deleted.
CREATE FUNCTION "protect_customer_config_projection"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  parent_is_building boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    SELECT EXISTS (
      SELECT 1
      FROM "customer_config_revisions"
      WHERE "customer_key" = NEW."customer_key"
        AND "revision" = NEW."config_revision"
        AND "status" = 'building'
    ) INTO parent_is_building;

    IF parent_is_building THEN
      RETURN NEW;
    END IF;
  END IF;

  RAISE EXCEPTION 'published customer config projections are immutable'
    USING ERRCODE = '23514';
END;
$$;

CREATE TRIGGER "deployment_module_states_immutable"
BEFORE INSERT OR UPDATE OR DELETE ON "deployment_module_states"
FOR EACH ROW
EXECUTE FUNCTION "protect_customer_config_projection"();

CREATE TRIGGER "role_profiles_immutable"
BEFORE INSERT OR UPDATE OR DELETE ON "role_profiles"
FOR EACH ROW
EXECUTE FUNCTION "protect_customer_config_projection"();

CREATE TRIGGER "access_entitlements_immutable"
BEFORE INSERT OR UPDATE OR DELETE ON "access_entitlements"
FOR EACH ROW
EXECUTE FUNCTION "protect_customer_config_projection"();

CREATE TRIGGER "work_pools_immutable"
BEFORE INSERT OR UPDATE OR DELETE ON "work_pools"
FOR EACH ROW
EXECUTE FUNCTION "protect_customer_config_projection"();

CREATE TRIGGER "work_pool_memberships_immutable"
BEFORE INSERT OR UPDATE OR DELETE ON "work_pool_memberships"
FOR EACH ROW
EXECUTE FUNCTION "protect_customer_config_projection"();

-- The two task anchors are one business identity, not two independent optional
-- references. Keep the direct FKs for existence and prevent a task from
-- combining process A with a node owned by process B.
CREATE FUNCTION "enforce_workflow_task_process_anchor_match"()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."process_instance_id" IS NULL
     AND NEW."process_node_instance_id" IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW."process_instance_id" IS NULL
     OR NEW."process_node_instance_id" IS NULL THEN
    RAISE EXCEPTION 'workflow task process anchors must be paired'
      USING ERRCODE = '23514';
  END IF;

  PERFORM 1
  FROM "process_node_instances"
  WHERE "id" = NEW."process_node_instance_id"
    AND "process_instance_id" = NEW."process_instance_id"
  FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'workflow task process node does not belong to process instance'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER "workflow_task_process_anchor_match"
BEFORE INSERT OR UPDATE OF "process_instance_id", "process_node_instance_id"
ON "workflow_tasks"
FOR EACH ROW
EXECUTE FUNCTION "enforce_workflow_task_process_anchor_match"();
