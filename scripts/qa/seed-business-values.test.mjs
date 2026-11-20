import assert from 'node:assert/strict';
import test from 'node:test';
import { assertSeedBusinessValues } from './seed-business-values.mjs';

test('business values reject nested data-nature fields and copy', () => {
  for (const value of [
    { payload: { simulated_only: true } },
    { supplier_snapshot: { real_customer_data: false } },
    { payload: { trial_task: true } },
    { payload: { evidence_class: 'display_only' } },
    { payload: { proves_process_runtime: false } },
    { items: [{ note: '模拟业务链核验，不代表真实客户业务。' }] },
    { name: '核心演示原料仓' },
    { source_type: 'simulated-manual-acceptance-task-batch' },
  ]) assert.throws(() => assertSeedBusinessValues(value), /data-nature/);
});

test('ordinary business names, empty references and inspection values remain valid', () => {
  assert.doesNotThrow(() => assertSeedBusinessValues({
    task_name: '整理首件要求', source_type: null, source_id: null,
    payload: { business_summary: '核对款图与尺寸表。', quantity: '0' },
    supplier_snapshot: { name: '嘉顺布行', address: '加工路 8 号' },
    items: [{ observation: '拉力测试合格', unit_price: '0.01' }],
  }));
});
