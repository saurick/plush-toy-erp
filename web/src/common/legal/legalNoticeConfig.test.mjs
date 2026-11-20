import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DEFAULT_LEGAL_NOTICE_VERSION,
  getLegalNoticeBundle,
  getLegalNoticeIdentity,
  stableSerialize,
} from './legalNoticeConfig.mjs'

test('legal notice config falls back to neutral private-deployment wording', () => {
  const bundle = getLegalNoticeBundle({})
  assert.equal(bundle.noticeVersion, DEFAULT_LEGAL_NOTICE_VERSION)
  assert.match(bundle.contactChannel, /系统管理员/u)
  assert.match(bundle.storageLocation, /私有化部署/u)
  assert.deepEqual(bundle.processors, [])
})

test('legal notice config keeps only complete processors and HTTPS links', () => {
  const bundle = getLegalNoticeBundle({
    __PLUSH_ERP_CUSTOMER_CONFIG__: {
      brand: { companyName: '测试单位' },
      legalNotice: {
        controllerName: '测试单位',
        processors: [
          {
            name: '短信服务商',
            purpose: '发送登录验证码',
            dataCategories: '手机号、发送状态',
            condition: '仅在主动获取验证码时',
            privacyURL: 'https://example.com/privacy',
          },
          { name: '不完整配置' },
        ],
      },
    },
  })
  assert.equal(bundle.controllerName, '测试单位')
  assert.equal(bundle.processors.length, 1)
  assert.equal(bundle.processors[0].privacyURL, 'https://example.com/privacy')
})

test('legal notice identity changes with version or displayed customer terms', () => {
  const base = getLegalNoticeBundle({
    __PLUSH_ERP_CUSTOMER_CONFIG__: {
      legalNotice: {
        noticeVersion: '2026-08-11.1',
        controllerName: '甲单位',
        contactChannel: '联系甲单位管理员',
      },
    },
  })
  const same = { ...base }
  const changedContact = { ...base, contactChannel: '联系乙单位管理员' }
  const changedVersion = { ...base, noticeVersion: '2026-08-12.1' }

  assert.deepEqual(getLegalNoticeIdentity(base), getLegalNoticeIdentity(same))
  assert.notEqual(
    getLegalNoticeIdentity(base).contentFingerprint,
    getLegalNoticeIdentity(changedContact).contentFingerprint
  )
  assert.notEqual(
    getLegalNoticeIdentity(base).contentFingerprint,
    getLegalNoticeIdentity(changedVersion).contentFingerprint
  )
})

test('stable serialization is independent of object key order', () => {
  assert.equal(
    stableSerialize({ b: 2, a: { d: 4, c: 3 } }),
    stableSerialize({ a: { c: 3, d: 4 }, b: 2 })
  )
})
