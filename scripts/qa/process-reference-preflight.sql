\set ON_ERROR_STOP on

BEGIN TRANSACTION READ ONLY;

SELECT count(*) AS process_rows,
       count(*) FILTER (WHERE to_jsonb(process)->>'quality_required' = 'true') AS reference_flags_to_remove,
       count(*) FILTER (WHERE production_route_operation_code IS NOT NULL) AS route_bindings,
       count(*) FILTER (WHERE is_active) AS active_processes
  FROM public.processes AS process;

COMMIT;
