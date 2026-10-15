import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import test from 'node:test'

const databaseURL = process.env.UNIT_NORMALIZATION_TEST_DATABASE_URL
const migration = readFileSync(new URL('../../server/internal/data/model/migrate/20260927100348_normalize_units.sql', import.meta.url), 'utf8')
const catalog = JSON.parse(readFileSync(new URL('../../server/internal/unitpolicy/units.json', import.meta.url), 'utf8'))

// This migration test needs its own empty disposable PostgreSQL database with
// the preceding migrations applied. Every fixture/migration run rolls back.
test('unit normalization preserves facts, merges projections and blocks ambiguous data', { skip: !databaseURL }, async (t) => {
  const target = new URL(databaseURL)
  assert.ok(['127.0.0.1', 'localhost'].includes(target.hostname), 'only a loopback disposable database is allowed')
  assert.match(target.pathname, /^\/plush_erp_ci_unit_[a-z0-9_]+$/u)
  const sql = (input) => spawnSync('psql', [databaseURL, '-XAtq', '-v', 'ON_ERROR_STOP=1'], {
    env: { ...process.env, PGDATABASE: databaseURL }, input, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024,
  })
  const base = `
    INSERT INTO units(id,code,name,precision,is_active,created_at,updated_at) VALUES
      (910001,'EA','个',6,false,now(),now()), (910002,'LEGACY-PCS','PCS',6,true,now(),now()),
      (910003,'LEGACY-Y','Y',6,true,now(),now()), (910004,'LEGACY-KG','kg',6,true,now(),now());
    INSERT INTO warehouses(id,code,name,type,is_active,created_at,updated_at)
      VALUES (910010,'SIM-UNIT-WH','模拟计量仓库','MATERIAL',true,now(),now());
    INSERT INTO materials(id,code,name,default_unit_id,is_active,created_at,updated_at)
      VALUES (910011,'SIM-UNIT-M','模拟纽扣',910002,true,now(),now());
    INSERT INTO inventory_txns(subject_type,subject_id,warehouse_id,unit_id,quantity,direction,txn_type,source_type,idempotency_key,occurred_at,created_at)
      VALUES ('MATERIAL',910011,910010,910001,1,1,'IN','SIM_UNIT_TEST','SIM-UNIT-1',now(),now()),
             ('MATERIAL',910011,910010,910002,2,1,'IN','SIM_UNIT_TEST','SIM-UNIT-2',now(),now());
    INSERT INTO inventory_balances(subject_type,subject_id,warehouse_id,unit_id,quantity,updated_at)
      VALUES ('MATERIAL',910011,910010,910001,1,now()), ('MATERIAL',910011,910010,910002,2,now());
  `
  const before = sql('SELECT count(*) FROM units;')
  assert.equal(before.status, 0, before.stderr)
  assert.equal(before.stdout.trim(), '0', 'test requires an empty, isolated units table')

  await t.test('upgrade preserves quantities and identities, coalesces balances and fills the standard catalog', () => {
    const result = sql(`BEGIN; ${base} ${migration}
      SELECT json_build_object(
        'units',(SELECT json_agg(json_build_object('code',code,'name',name,'precision',precision) ORDER BY code) FROM units),
        'active',(SELECT is_active FROM units WHERE code='EA'),
        'material_unit',(SELECT default_unit_id FROM materials WHERE id=910011),
        'balances',(SELECT count(*) FROM inventory_balances),
        'balance',(SELECT sum(quantity)::text FROM inventory_balances),
        'facts',(SELECT count(*) FROM inventory_txns),
        'fact_quantity',(SELECT sum(quantity)::text FROM inventory_txns),
        'fact_units',(SELECT count(DISTINCT unit_id) FROM inventory_txns)); ROLLBACK;`)
    assert.equal(result.status, 0, result.stderr)
    const actual = JSON.parse(result.stdout.trim().split('\n').at(-1))
    assert.deepEqual(actual.units, catalog.map(({code,name,precision}) => ({code,name,precision})).sort((a,b) => a.code.localeCompare(b.code)))
    assert.equal(actual.active, true)
    assert.equal(actual.material_unit, 910001)
    assert.equal(actual.balances, 1)
    assert.equal(Number(actual.balance), 3)
    assert.equal(actual.facts, 2)
    assert.equal(Number(actual.fact_quantity), 3)
    assert.equal(actual.fact_units, 1)
  })

  const engineeringSource = `
    INSERT INTO customers(id,code,name,is_active,created_at,updated_at)
      VALUES (910030,'SIM-UNIT-C','模拟计量客户',true,now(),now());
    INSERT INTO products(id,code,name,default_unit_id,is_active,created_at,updated_at)
      VALUES (910031,'SIM-UNIT-P','模拟计量产品',910001,true,now(),now());
    INSERT INTO bom_headers(id,product_id,version,status,created_at,updated_at)
      VALUES (910032,910031,'SIM-UNIT-BOM','ACTIVE',now(),now());
    INSERT INTO bom_items(bom_header_id,material_id,unit_id,quantity,loss_rate,created_at,updated_at)
      VALUES (910032,910011,910002,0.25,0,now(),now());
    INSERT INTO sales_orders(id,order_no,customer_id,order_date,created_at,updated_at)
      VALUES (910033,'SIM-UNIT-SO',910030,now(),now(),now());
    INSERT INTO sales_order_items(sales_order_id,line_no,product_id,sample_bom_id,unit_id,ordered_quantity,created_at,updated_at)
      VALUES (910033,1,910031,910032,910001,1,now(),now());
  `
  const reviewedRequest = `${engineeringSource}
    INSERT INTO suppliers(id,code,name,is_active,created_at,updated_at)
      VALUES (910034,'SIM-UNIT-SUP','模拟供应商',true,now(),now());
    INSERT INTO engineering_material_requests(id,sales_order_id,source_order_version,order_no_snapshot,source_snapshot,submitted_by,submitted_at)
      VALUES (910035,910033,1,'SIM-UNIT-SO','[]',7,now());
    INSERT INTO engineering_material_request_items(request_id,material_id,unit_id,supplier_id,material_code,material_name,supplier_name,unit_name,required_quantity)
      VALUES (910035,910011,910002,910034,'SIM-UNIT-M','模拟纽扣','模拟供应商','PCS',2);
  `
  for (const [name, fixture, error] of [
    ['confirmed BOM fingerprint', `${engineeringSource} UPDATE sales_order_items SET engineering_status='CONFIRMED', sample_bom_fingerprint=repeat('a',64);`, 'sales_order_items.confirmed_bom_unit_change'],
    ['pending reviewed request', reviewedRequest, 'engineering_material_requests.frozen_unit_change'],
    ['approved source snapshot', `${reviewedRequest} UPDATE engineering_material_requests SET status='APPROVED',boss_reviewed_by=7,boss_reviewed_at=now(),finance_reviewed_by=7,finance_reviewed_at=now();`, 'engineering_material_requests.frozen_unit_change'],
    ['merged request item key', `${reviewedRequest} INSERT INTO engineering_material_request_items(request_id,material_id,unit_id,supplier_id,material_code,material_name,supplier_name,unit_name,required_quantity) VALUES (910035,910011,910001,910034,'SIM-UNIT-M','模拟纽扣','模拟供应商','个',1);`, 'engineering_material_request_items.merge_conflict'],
    ['fractional count', 'UPDATE inventory_txns SET quantity=1.5 WHERE unit_id=910002;', 'inventory_txns.quantity'],
    ['unsupported unit', "INSERT INTO units(code,name,precision,is_active,created_at,updated_at) VALUES ('M','米',6,true,now(),now());", 'units.unsupported_active_name'],
    ['occupied canonical code', "UPDATE units SET name='米' WHERE code='EA';", 'units.code_conflict'],
    ['balance overflow', 'UPDATE inventory_balances SET quantity=99999999999999 WHERE unit_id=910001;', 'inventory_balances.merge_overflow'],
  ]) {
    await t.test(`${name} aborts without partial writes`, () => {
      const result = sql(`BEGIN; ${base} ${fixture} ${migration} COMMIT;`)
      assert.notEqual(result.status, 0, 'invalid source data unexpectedly migrated')
      assert.ok(result.stderr.includes(error), result.stderr)
      const rollback = sql('SELECT count(*) FROM units; SELECT count(*) FROM inventory_txns;')
      assert.equal(rollback.status, 0, rollback.stderr)
      assert.equal(rollback.stdout.trim(), '0\n0')
    })
  }
})
