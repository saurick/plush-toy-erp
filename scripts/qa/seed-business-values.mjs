const DATA_NATURE_FIELDS = new Set([
  'simulated_only',
  'real_customer_data',
  'trial_task',
  'evidence_class',
  'proves_process_runtime',
  'acceptance_scenario_key',
]);
const DATA_NATURE_COPY = /模拟|演示|示例|样例|测试数据|simulated[-_ ](?:only|display)|simulated-manual-acceptance-task-batch/iu;

// Batch identity and evidence belong to runner receipts, outside business values.
export function assertSeedBusinessValues(value, location = 'business') {
  if (typeof value === 'string') {
    if (DATA_NATURE_COPY.test(value)) {
      throw new Error(`${location} contains data-nature copy`);
    }
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertSeedBusinessValues(item, `${location}[${index}]`));
    return;
  }
  for (const [key, item] of Object.entries(value)) {
    if (DATA_NATURE_FIELDS.has(key) || /^simulat(?:ed|ion)(?:_|$)/iu.test(key)) {
      throw new Error(`${location}.${key} is a data-nature field`);
    }
    assertSeedBusinessValues(item, `${location}.${key}`);
  }
}
