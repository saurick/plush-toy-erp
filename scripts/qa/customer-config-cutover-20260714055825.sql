\set ON_ERROR_STOP on

BEGIN TRANSACTION READ ONLY;

DO $plush_customer_config_cutover$
DECLARE
  blockers text[] := ARRAY[]::text[];
  invalid_count bigint := 0;
  column_count integer := 0;
  cutover_migration_pending boolean := true;
  workflow_config_revision_migration_pending boolean := true;
BEGIN
  IF to_regclass('atlas_schema_revisions.atlas_schema_revisions') IS NOT NULL THEN
    EXECUTE $sql$
      SELECT NOT EXISTS (
        SELECT 1
          FROM atlas_schema_revisions.atlas_schema_revisions
         WHERE version = '20260714055825'
      )
    $sql$ INTO cutover_migration_pending;

    EXECUTE $sql$
      SELECT NOT EXISTS (
        SELECT 1
          FROM atlas_schema_revisions.atlas_schema_revisions
         WHERE version = '20260629120814'
      )
    $sql$ INTO workflow_config_revision_migration_pending;
  END IF;

  IF NOT cutover_migration_pending THEN
    RAISE NOTICE 'customer config cutover preflight skipped because migration 20260714055825 is already applied';
    RETURN;
  END IF;

  IF to_regclass('public.process_instances') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM public.process_instances'
      INTO invalid_count;
    IF invalid_count > 0 THEN
      blockers := array_append(
        blockers,
        format(
          'process_instances has %s rows that must be explicitly governed before customer config hash cutover',
          invalid_count
        )
      );
    END IF;
  END IF;

  IF to_regclass('public.workflow_tasks') IS NOT NULL THEN
    SELECT count(*)
      INTO column_count
      FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'workflow_tasks'
       AND column_name = 'config_revision';
    IF column_count <> 1 AND NOT workflow_config_revision_migration_pending THEN
      blockers := array_append(
        blockers,
        'workflow_tasks.config_revision is missing before customer config hash cutover'
      );
    ELSIF column_count = 1 THEN
      EXECUTE $sql$
        SELECT count(*)
          FROM public.workflow_tasks
         WHERE config_revision IS NOT NULL
      $sql$ INTO invalid_count;
      IF invalid_count > 0 THEN
        blockers := array_append(
          blockers,
          format(
            'workflow_tasks has %s config revision anchors that must be explicitly governed before customer config hash cutover',
            invalid_count
          )
        );
      END IF;
    END IF;
  END IF;

  IF cardinality(blockers) > 0 THEN
    RAISE EXCEPTION
      'customer config cutover preflight failed: %',
      array_to_string(blockers, '; ');
  END IF;

  RAISE NOTICE 'customer config cutover preflight passed';
END
$plush_customer_config_cutover$;

COMMIT;
