import assert from 'node:assert/strict'
import test from 'node:test'
import {
  CUSTOMER_CONFIG_HASH_VERSION,
  assertEffectiveCustomerConfigIdentity,
  assertPublishedCustomerConfigIdentity,
  buildCustomerConfigMutationPayload,
  confirmCustomerConfigTransition,
  resolveCustomerConfigApplyTransitionAction,
} from './customerConfigTransition.mjs'

const configHash = 'a'.repeat(64)
const manifest = {
  customer_key: 'yoyoosun',
  revision: 'rev-2',
  product_version: 'product-v1',
}
const validation = {
  customer_key: 'yoyoosun',
  revision: 'rev-2',
  config_hash: configHash,
  config_hash_version: CUSTOMER_CONFIG_HASH_VERSION,
  compiled_snapshot_ok: true,
}

function transition(params, overrides = {}) {
  return {
    action: params.action,
    customer_key: params.customer_key,
    target_revision: params.target_revision,
    target_config_hash: params.expected_config_hash,
    target_product_version: params.expected_product_version,
    expected_active_revision: params.expected_active_revision,
    observed_active_revision: '',
    allowed: true,
    noop: false,
    blockers: [],
    ...overrides,
  }
}

test('mutation payload 使用 activate/rollback 各自唯一字段合同', () => {
  assert.deepEqual(
    buildCustomerConfigMutationPayload('activate', {
      customer_key: 'yoyoosun',
      revision: 'rev-2',
      expected_config_hash: configHash,
      expected_product_version: 'product-v1',
      expected_active_revision: '',
    }),
    {
      customer_key: 'yoyoosun',
      revision: 'rev-2',
      expected_config_hash: configHash,
      expected_product_version: 'product-v1',
      expected_active_revision: '',
    }
  )
  const rollback = buildCustomerConfigMutationPayload('rollback', {
    customer_key: 'yoyoosun',
    target_revision: 'rev-1',
    expected_config_hash: configHash,
    expected_product_version: 'product-v1',
    expected_active_revision: 'rev-2',
  })
  assert.equal(rollback.target_revision, 'rev-1')
  assert.equal('revision' in rollback, false)
  assert.throws(
    () =>
      buildCustomerConfigMutationPayload('rollback', {
        customer_key: 'yoyoosun',
        revision: 'rev-1',
        expected_config_hash: configHash,
        expected_product_version: 'product-v1',
        expected_active_revision: 'rev-2',
      }),
    /未支持参数/
  )
  assert.throws(
    () =>
      buildCustomerConfigMutationPayload('activate', {
        customer_key: 'yoyoosun',
        revision: 'rev-2',
        expected_config_hash: configHash,
        expected_product_version: 'product-v1',
      }),
    /缺少当前有效配置版本/
  )
})

test('transition discovery 最多确认两次并复用同一 CAS identity', async () => {
  const calls = []
  const result = await confirmCustomerConfigTransition({
    action: 'activate',
    manifest,
    validation,
    check: async (params) => {
      calls.push(params)
      const confirmed = params.expected_active_revision === 'rev-1'
      return transition(params, {
        observed_active_revision: 'rev-1',
        allowed: confirmed,
        blockers: confirmed ? [] : [{ code: 'active_revision_changed' }],
      })
    },
  })

  assert.equal(calls.length, 2)
  assert.equal(calls[0].expected_active_revision, '')
  assert.equal(calls[1].expected_active_revision, 'rev-1')
  assert.equal(result.attempts, 2)
  assert.deepEqual(result.mutationPayload, {
    customer_key: 'yoyoosun',
    revision: 'rev-2',
    expected_config_hash: configHash,
    expected_product_version: 'product-v1',
    expected_active_revision: 'rev-1',
  })
})

test('transition blocker 和二次 active 漂移均 fail closed', async () => {
  await assert.rejects(
    () =>
      confirmCustomerConfigTransition({
        action: 'activate',
        manifest,
        validation,
        check: async (params) =>
          transition(params, {
            allowed: false,
            blockers: [{ code: 'target_module_closure_invalid' }],
          }),
      }),
    /不满足切换条件/
  )

  let callCount = 0
  await assert.rejects(
    () =>
      confirmCustomerConfigTransition({
        action: 'activate',
        manifest,
        validation,
        check: async (params) => {
          callCount += 1
          return transition(params, {
            expected_active_revision:
              callCount === 1 ? params.expected_active_revision : 'rev-1',
            observed_active_revision: callCount === 1 ? 'rev-1' : 'rev-3',
            allowed: callCount === 2,
          })
        },
      }),
    /发生变化/
  )
  assert.equal(callCount, 2)
})

test('publish 与 effective readback 必须匹配 canonical identity', () => {
  const published = {
    customer_key: 'yoyoosun',
    revision: 'rev-2',
    product_version: 'product-v1',
    config_hash: configHash,
    config_hash_version: CUSTOMER_CONFIG_HASH_VERSION,
    status: 'published',
  }
  assert.equal(
    assertPublishedCustomerConfigIdentity(published, manifest, validation)
      .configHash,
    configHash
  )
  assert.throws(
    () =>
      assertPublishedCustomerConfigIdentity(
        { ...published, config_hash: 'b'.repeat(64) },
        manifest,
        validation
      ),
    /发布结果与已校验/
  )
  assert.equal(
    assertEffectiveCustomerConfigIdentity(
      {
        customer: { key: 'yoyoosun' },
        configRevision: 'rev-2',
        configHash,
        configHashVersion: CUSTOMER_CONFIG_HASH_VERSION,
        source: 'active_customer_config_revision',
      },
      manifest,
      validation
    ).configRevision,
    'rev-2'
  )
})

test('内容寻址版本 A-B-A 回切时 superseded 版本必须走 rollback', async () => {
  assert.equal(
    resolveCustomerConfigApplyTransitionAction({ status: 'published' }),
    'activate'
  )
  assert.equal(
    resolveCustomerConfigApplyTransitionAction({ status: 'active' }),
    'activate'
  )
  assert.equal(
    resolveCustomerConfigApplyTransitionAction({ status: 'superseded' }),
    'rollback'
  )
  assert.throws(
    () => resolveCustomerConfigApplyTransitionAction({ status: 'draft' }),
    /状态不支持/
  )

  const result = await confirmCustomerConfigTransition({
    action: 'rollback',
    manifest,
    validation,
    check: async (params) => {
      const confirmed = params.expected_active_revision === 'rev-3'
      return transition(params, {
        observed_active_revision: 'rev-3',
        allowed: confirmed,
        blockers: confirmed ? [] : [{ code: 'active_revision_changed' }],
      })
    },
  })
  assert.deepEqual(result.mutationPayload, {
    customer_key: 'yoyoosun',
    target_revision: 'rev-2',
    expected_config_hash: configHash,
    expected_product_version: 'product-v1',
    expected_active_revision: 'rev-3',
  })
})

test('effective readback 的客户身份不一致时 fail closed', () => {
  assert.throws(
    () =>
      assertEffectiveCustomerConfigIdentity(
        {
          customer: { key: 'other-customer' },
          configRevision: 'rev-2',
          configHash,
          configHashVersion: CUSTOMER_CONFIG_HASH_VERSION,
          source: 'active_customer_config_revision',
        },
        manifest,
        validation
      ),
    /有效配置读回与已校验/
  )
})
