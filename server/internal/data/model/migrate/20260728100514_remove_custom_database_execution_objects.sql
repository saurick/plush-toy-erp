-- Customer configuration and Workflow writes are owned by the Go repository
-- transactions. Keep the database declarative: CHECK/UNIQUE/FK constraints
-- remain, while project-defined executable objects are retired explicitly.
-- PostgreSQL internal FK triggers (tgisinternal=true) are not project objects
-- and are intentionally untouched.

DROP TRIGGER "customer_config_revision_content_immutable"
  ON public."customer_config_revisions";
DROP TRIGGER "customer_config_revision_delete_immutable"
  ON public."customer_config_revisions";
DROP TRIGGER "customer_config_revision_lifecycle_guard"
  ON public."customer_config_revisions";
DROP TRIGGER "deployment_module_states_immutable"
  ON public."deployment_module_states";
DROP TRIGGER "role_profiles_immutable"
  ON public."role_profiles";
DROP TRIGGER "access_entitlements_immutable"
  ON public."access_entitlements";
DROP TRIGGER "work_pools_immutable"
  ON public."work_pools";
DROP TRIGGER "work_pool_memberships_immutable"
  ON public."work_pool_memberships";
DROP TRIGGER "workflow_task_process_anchor_match"
  ON public."workflow_tasks";

DROP FUNCTION public."prevent_customer_config_revision_content_update"();
DROP FUNCTION public."prevent_customer_config_revision_delete"();
DROP FUNCTION public."enforce_customer_config_revision_lifecycle"();
DROP FUNCTION public."protect_customer_config_projection"();
DROP FUNCTION public."enforce_workflow_task_process_anchor_match"();
