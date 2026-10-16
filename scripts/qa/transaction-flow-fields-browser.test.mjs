import assert from "node:assert/strict";
import test from "node:test";
import {
  assertPostgresColumnMetadata,
  readExpectedPostgresColumns,
} from "./transaction-flow-fields-browser.mjs";

test("generated dictionary keeps physical string types distinct from application length validators", () => {
  const fields = readExpectedPostgresColumns();
  assert.equal(
    fields.find(
      ({ table, column }) =>
        table === "finance_payments" && column === "payment_no",
    ).type,
    "varchar",
  );
  assert.equal(
    fields.find(
      ({ table, column }) =>
        table === "production_facts" && column === "quantity",
    ).type,
    "numeric(20,6)",
  );
});

test("PostgreSQL metadata comparison rejects missing, extra, duplicate, type and nullability drift", () => {
  const expected = [
    { table: "sample", column: "name", type: "varchar", nullable: false },
    { table: "sample", column: "code", type: "varchar(64)", nullable: true },
    {
      table: "sample",
      column: "amount",
      type: "numeric(20,6)",
      nullable: false,
    },
  ];
  const actual = [
    {
      table_name: "sample",
      column_name: "name",
      data_type: "character varying",
      character_maximum_length: null,
      is_nullable: "NO",
    },
    {
      table_name: "sample",
      column_name: "code",
      data_type: "character varying",
      character_maximum_length: 64,
      is_nullable: "YES",
    },
    {
      table_name: "sample",
      column_name: "amount",
      data_type: "numeric",
      numeric_precision: 20,
      numeric_scale: 6,
      is_nullable: "NO",
    },
  ];
  assert.deepEqual(assertPostgresColumnMetadata(actual, expected), {
    columns: 3,
    columnNamesMatched: true,
    postgresTypesMatched: true,
    nullabilityMatched: true,
  });
  for (const change of [
    (rows) => rows.pop(),
    (rows) => rows.push({ ...rows[0], column_name: "extra" }),
    (rows) => rows.push({ ...rows[0] }),
    (rows) => {
      rows[0].character_maximum_length = 64;
    },
    (rows) => {
      rows[1].character_maximum_length = null;
    },
    (rows) => {
      rows[0].is_nullable = "YES";
    },
    (rows) => {
      rows[2].numeric_scale = 5;
    },
  ]) {
    const changed = structuredClone(actual);
    change(changed);
    assert.throws(() => assertPostgresColumnMetadata(changed, expected));
  }
  assert.throws(() => assertPostgresColumnMetadata([], []));
});
