import { readDeliveryOperation, transitionDeliveryOperation } from './delivery-operation-store.mjs';

// Read-only qualification is a short-lived decision, never an execution lease.
export const DELIVERY_PLAN_VALIDITY_MS = 24 * 60 * 60 * 1000;
const PLAN_ACTIONS = new Set(['promote', 'rollback', 'rebuild-database']);
const SHA_PATTERN = /^[0-9a-f]{40}$/u;

export function deliveryPlanInvalidation(operation, {
  now = new Date().toISOString(), preflight, initializationPreflight, versions,
} = {}) {
  if (operation.status !== 'ready' || !PLAN_ACTIONS.has(operation.action)) return null;
  const preparedAt = operation.events.findLast(event => event.status === 'ready')?.at;
  if (Date.parse(now) - Date.parse(preparedAt) >= DELIVERY_PLAN_VALIDITY_MS) {
    return { code: 'delivery_plan_expired', level: 'warning', message: '待确认计划已超过 24 小时有效期，请重新准备' };
  }
  const runtime = preflight?.target === operation.target ? preflight.remote?.runtime : null;
  const runtimeProven = SHA_PATTERN.test(String(runtime?.serverSha || '')) && runtime.serverSha === runtime.webSha;
  const baseline = operation.metadata?.currentGitSha || (operation.action === 'rebuild-database' ? operation.gitSha : null);
  if (runtimeProven && ((baseline && baseline !== runtime.serverSha) || operation.metadata?.promotionMode === 'initialize')) {
    return { code: 'delivery_plan_target_changed', level: 'warning', message: '目标运行版本已变化，原计划失效，请重新准备' };
  }
  if (operation.metadata?.promotionMode === 'initialize' && initializationPreflight?.target === operation.target && initializationPreflight.remote?.rootState === 'present') {
    return { code: 'delivery_plan_target_changed', level: 'warning', message: '目标已不再是空环境，首次部署计划失效，请重新准备' };
  }
  // Absence from a bounded or failed catalog read does not prove asset removal.
  const version = versions?.find(item => item.gitSha === operation.gitSha);
  if (version && (version.status !== 'published' || version.completeAssets !== true || (operation.action === 'promote' && version.promotionEligible !== true))) {
    return { code: 'delivery_plan_artifact_changed', level: 'warning', message: '候选制品已不满足原计划条件，请重新选择版本并准备' };
  }
  return null;
}

export function closeReadyDeliveryPlan(store, operationId, { target, invalidation = null, now = new Date().toISOString() }) {
  const current = readDeliveryOperation(store, operationId);
  const status = invalidation ? 'invalidated' : 'abandoned';
  if (current.target !== target || !PLAN_ACTIONS.has(current.action)) throw new Error('delivery plan target or action does not match');
  if (current.status === status) return current;
  if (current.status !== 'ready') throw new Error('only a ready delivery plan can be closed');
  const issue = invalidation || { code: 'delivery_plan_abandoned', level: 'info', message: '已放弃待确认计划，未执行目标写入' };
  return transitionDeliveryOperation(store, current.id, {
    status, message: issue.message, issues: [issue], now,
    metadata: { ...current.metadata, planClosureReason: issue.code },
  });
}
