import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";

const databaseURL = process.env.DATA_MODEL_INTEGRITY_TEST_DATABASE_URL;
const migration = readFileSync(new URL("../../server/internal/data/model/migrate/20261017085605_migrate.sql", import.meta.url), "utf8");
const preflight = readFileSync(new URL("./data-model-integrity-preflight.sql", import.meta.url), "utf8");

// Fixtures belong only to the disposable database created by the sibling shell
// entry. Each upgrade runs inside a transaction and leaves the prior schema.
test("data model integrity upgrades preserve facts and reject incomplete sources", { skip: !databaseURL }, async (t) => {
  const target = new URL(databaseURL);
  assert.ok(["127.0.0.1", "localhost"].includes(target.hostname));
  assert.match(target.pathname, /^\/plush_erp_ci_model_[a-z0-9_]+$/u);
  const sql = (input) => spawnSync("psql", [databaseURL, "-XAtq", "-v", "ON_ERROR_STOP=1"], {
    input, encoding: "utf8", maxBuffer: 4 * 1024 * 1024,
  });
  const base = `
    INSERT INTO admin_users(id,username,password_hash,created_at,updated_at)
      VALUES (910001,'model-integrity-maker','test-only',now(),now()),
             (910002,'model-integrity-checker','test-only',now(),now());
    INSERT INTO customers(id,code,name,created_at,updated_at)
      VALUES (910010,'MODEL-INTEGRITY','模型完整性测试客户',now(),now());
    INSERT INTO sales_orders(id,order_no,customer_id,order_date,lifecycle_status,currency,created_at,updated_at)
      VALUES (910020,'MODEL-INTEGRITY',910010,now(),'active','CNY',now(),now());
    INSERT INTO warehouses(id,code,name,type,created_at,updated_at)
      VALUES (910021,'MODEL-INTEGRITY','模型完整性测试仓库','MATERIAL',now(),now());
    INSERT INTO inventory_lots(id,subject_type,subject_id,lot_no,created_at,updated_at)
      VALUES (910022,'MATERIAL',1,'MODEL-INTEGRITY',now(),now());
    INSERT INTO quality_inspections(id,inspection_no,inventory_lot_id,warehouse_id,status,result,inspected_at,created_at,updated_at)
      VALUES (910023,'MODEL-INTEGRITY',910022,910021,'PASSED','PASS',now(),now(),now());
    INSERT INTO finance_facts(id,fact_no,fact_type,status,counterparty_type,counterparty_id,amount,currency,idempotency_key,occurred_at,posted_at,posted_by,created_at,updated_at)
      VALUES (910030,'MODEL-INTEGRITY','INVOICE','POSTED','CUSTOMER',910010,123.456789,'CNY','model-integrity-fact',now(),now(),910001,now(),now());
    INSERT INTO finance_payments(id,payment_no,direction,status,counterparty_type,counterparty_id,amount,currency,account_ref,evidence_ref,idempotency_key,idempotency_payload_hash,occurred_at,created_by,approved_at,approved_by,posted_at,posted_by,created_at,updated_at)
      VALUES (910040,'MODEL-INTEGRITY','RECEIPT','POSTED','CUSTOMER',910010,50,'CNY','测试账户','测试回单','model-integrity-payment',repeat('a',64),now(),910001,now(),910002,now(),910001,now(),now());
    INSERT INTO finance_allocations(id,payment_id,finance_fact_id,amount,currency,status,idempotency_key,created_by,created_at,reversal_of_allocation_id)
      VALUES (910050,910040,910030,10,'CNY','POSTED','model-integrity-allocation',910001,now(),NULL),
             (910051,910040,910030,10,'CNY','REVERSED','model-integrity-allocation-reversal',910001,now(),910050);
    INSERT INTO finance_credit_notes(id,credit_note_no,finance_fact_id,amount,currency,status,reason,idempotency_key,idempotency_payload_hash,created_by,created_at,reversal_of_credit_note_id)
      VALUES (910060,'MODEL-INTEGRITY',910030,1,'CNY','POSTED','测试冲销','model-integrity-credit',repeat('b',64),910001,now(),NULL),
             (910061,'MODEL-INTEGRITY-REVERSE',910030,1,'CNY','REVERSED','测试撤销冲销','model-integrity-credit-reversal',repeat('c',64),910001,now(),910060);
  `;
  const tables = ["finance_allocations", "finance_credit_notes", "finance_payments", "finance_facts", "quality_inspections", "inventory_lots", "sales_orders", "customers", "warehouses", "admin_users"];
  const cleanup = () => {
    const result = sql(`BEGIN; ${tables.map((name) => `DELETE FROM ${name} WHERE id BETWEEN 910000 AND 910099;`).join("\n")} COMMIT;`);
    assert.equal(result.status, 0, result.stderr);
  };
  const fingerprint = () => {
    const result = sql(`SELECT md5(string_agg(value, '' ORDER BY value)) FROM (${tables.map((name) => `SELECT row_to_json(t)::text AS value FROM ${name} t WHERE id BETWEEN 910000 AND 910099`).join(" UNION ALL ")}) rows;`);
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  const empty = sql("SELECT count(*) FROM finance_facts WHERE id BETWEEN 910000 AND 910099;");
  assert.equal(empty.status, 0, empty.stderr);
  assert.equal(empty.stdout.trim(), "0");

  await t.test("upgrade preserves posted facts, frozen quality decisions and reversing entries", () => {
    const result = sql(`BEGIN; ${base} ${migration}
      SELECT json_build_object(
        'amount',(SELECT amount::text FROM finance_facts WHERE id=910030),
        'status',(SELECT status FROM finance_facts WHERE id=910030),
        'quality',(SELECT result FROM quality_inspections WHERE id=910023),
        'allocations',(SELECT count(*) FROM finance_allocations WHERE id IN (910050,910051)),
        'credits',(SELECT count(*) FROM finance_credit_notes WHERE id IN (910060,910061))
      ); ROLLBACK;`);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout.trim()), { amount: "123.456789", status: "POSTED", quality: "PASS", allocations: 2, credits: 2 });
  });

  for (const [name, change, diagnostic] of [
    ["tax rate without mode", "UPDATE sales_orders SET tax_rate=5 WHERE id=910020;", "sales_orders"],
    ["freight without terms", "UPDATE sales_orders SET quoted_freight_amount=10 WHERE id=910020;", "sales_orders"],
    ["quality result missing", "UPDATE quality_inspections SET result=NULL WHERE id=910023;", "quality_inspections"],
    ["orphan allocation fact", "UPDATE finance_allocations SET finance_fact_id=2147483000 WHERE id=910050;", "finance_allocations"],
    ["orphan credit fact", "UPDATE finance_credit_notes SET finance_fact_id=2147483000 WHERE id=910060;", "finance_credit_notes"],
    ["orphan allocation reversal", "UPDATE finance_allocations SET reversal_of_allocation_id=2147483000 WHERE id=910051;", "finance_allocations"],
    ["orphan credit reversal", "UPDATE finance_credit_notes SET reversal_of_credit_note_id=2147483000 WHERE id=910061;", "finance_credit_notes"],
    ["reversal without original", "UPDATE finance_allocations SET reversal_of_allocation_id=NULL WHERE id=910051;", "finance_allocations"],
    ["self credit reversal", "UPDATE finance_credit_notes SET reversal_of_credit_note_id=id WHERE id=910061;", "finance_credit_notes"],
  ]) {
    await t.test(`${name} blocks preflight without changing rows and aborts the upgrade`, () => {
      const fixture = sql(`BEGIN; ${base} ${change} COMMIT;`);
      assert.equal(fixture.status, 0, fixture.stderr);
      try {
        const before = fingerprint();
        const audit = sql(preflight);
        assert.notEqual(audit.status, 0);
        assert.ok(audit.stderr.includes(diagnostic), audit.stderr);
        assert.equal(fingerprint(), before, "preflight changed stored rows");
      } finally {
        cleanup();
      }
      const upgrade = sql(`BEGIN; ${base} ${change} ${migration} COMMIT;`);
      assert.notEqual(upgrade.status, 0, "invalid data unexpectedly migrated");
      const rollback = sql("SELECT count(*) FROM finance_facts WHERE id=910030;");
      assert.equal(rollback.status, 0, rollback.stderr);
      assert.equal(rollback.stdout.trim(), "0", "failed upgrade left partial facts");
    });
  }
});
