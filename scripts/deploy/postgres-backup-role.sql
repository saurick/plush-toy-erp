SELECT
  current_user,
  current_setting('server_version'),
  current_setting('server_version_num'),
  current_setting('default_transaction_read_only'),
  role.rolsuper,
  role.rolcreatedb,
  role.rolcreaterole,
  role.rolbypassrls,
  has_database_privilege(current_user, current_database(), 'CREATE'),
  has_schema_privilege(current_user, 'public', 'CREATE'),
  (
    SELECT count(*)
    FROM information_schema.tables AS source_table
    WHERE source_table.table_schema = 'public'
      AND source_table.table_type = 'BASE TABLE'
      AND (
        NOT has_table_privilege(current_user, format('%I.%I', source_table.table_schema, source_table.table_name), 'SELECT')
        OR has_table_privilege(current_user, format('%I.%I', source_table.table_schema, source_table.table_name), 'INSERT')
        OR has_table_privilege(current_user, format('%I.%I', source_table.table_schema, source_table.table_name), 'UPDATE')
        OR has_table_privilege(current_user, format('%I.%I', source_table.table_schema, source_table.table_name), 'DELETE')
        OR has_table_privilege(current_user, format('%I.%I', source_table.table_schema, source_table.table_name), 'TRUNCATE')
      )
  )
FROM pg_roles AS role
WHERE role.rolname = current_user;
