\set ON_ERROR_STOP on

BEGIN TRANSACTION READ ONLY;

DO $data_model_integrity_preflight$
DECLARE
  rule record;
  invalid_count bigint;
  blockers text[] := ARRAY[]::text[];
BEGIN
  -- IS NOT TRUE also rejects UNKNOWN, which a nullable CHECK otherwise accepts.
  FOR rule IN
    SELECT * FROM (VALUES
      ('sales_orders', 'tax pair',
       '(tax_mode IS NULL AND tax_rate IS NULL) OR (tax_mode IS NOT NULL AND ((tax_mode = ''NONE'' AND tax_rate IS NULL) OR (tax_mode IN (''INCLUSIVE'', ''EXCLUSIVE'') AND tax_rate IS NOT NULL)))'),
      ('sales_orders', 'quoted freight terms',
       'quoted_freight_amount IS NULL OR (freight_terms IS NOT NULL AND freight_terms = ''EXCLUDED'')'),
      ('quality_inspections', 'quality lifecycle',
       '(status IN (''DRAFT'', ''SUBMITTED'', ''CANCELLED'') AND result IS NULL AND inspected_at IS NULL) OR (status = ''PASSED'' AND result IS NOT NULL AND result IN (''PASS'', ''CONCESSION'') AND inspected_at IS NOT NULL) OR (status = ''REJECTED'' AND result IS NOT NULL AND result = ''REJECT'' AND inspected_at IS NOT NULL)'),
      ('finance_allocations', 'allocation reversal bundle',
       '(status = ''POSTED'' AND reversal_of_allocation_id IS NULL) OR (status = ''REVERSED'' AND reversal_of_allocation_id IS NOT NULL)'),
      ('finance_credit_notes', 'credit reversal identity',
       'reversal_of_credit_note_id IS NULL OR reversal_of_credit_note_id <> id')
    ) AS rules(table_name, label, expression)
  LOOP
    IF to_regclass(format('public.%I', rule.table_name)) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('SELECT count(*) FROM public.%I WHERE (%s) IS NOT TRUE', rule.table_name, rule.expression)
      INTO invalid_count;
    IF invalid_count > 0 THEN
      blockers := array_append(blockers, format('%s has %s rows violating %s', rule.table_name, invalid_count, rule.label));
    END IF;
  END LOOP;

  FOR rule IN
    SELECT * FROM (VALUES
      ('finance_allocations', 'finance_fact_id', 'finance_facts'),
      ('finance_allocations', 'reversal_of_allocation_id', 'finance_allocations'),
      ('finance_credit_notes', 'finance_fact_id', 'finance_facts'),
      ('finance_credit_notes', 'reversal_of_credit_note_id', 'finance_credit_notes')
    ) AS rules(table_name, column_name, referenced_table)
  LOOP
    IF to_regclass(format('public.%I', rule.table_name)) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format(
      'SELECT count(*) FROM public.%I AS source LEFT JOIN public.%I AS target ON target.id = source.%I WHERE source.%I IS NOT NULL AND target.id IS NULL',
      rule.table_name, rule.referenced_table, rule.column_name, rule.column_name
    ) INTO invalid_count;
    IF invalid_count > 0 THEN
      blockers := array_append(blockers, format('%s has %s orphan %s references', rule.table_name, invalid_count, rule.column_name));
    END IF;
  END LOOP;

  IF cardinality(blockers) > 0 THEN
    RAISE EXCEPTION 'data model integrity preflight blocked: %', array_to_string(blockers, '; ');
  END IF;
END
$data_model_integrity_preflight$;

ROLLBACK;
