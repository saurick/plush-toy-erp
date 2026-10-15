import assert from 'node:assert/strict'
import test from 'node:test'

import {
  isValidContactEmail,
  isValidContactPhone,
  isValidMainlandMobilePhone,
  normalizeMainlandMobilePhone,
} from './contactValidation.mjs'

test('contactValidation: business contact email keeps normal mailbox shape only', () => {
  assert.equal(isValidContactEmail('buyer@example.com'), true)
  assert.equal(isValidContactEmail(' buyer@example.com '), true)
  assert.equal(isValidContactEmail('buyer.name+po@example.co'), true)

  assert.equal(isValidContactEmail('buyer'), false)
  assert.equal(isValidContactEmail('buyer@example'), false)
  assert.equal(isValidContactEmail('Buyer <buyer@example.com>'), false)
  assert.equal(isValidContactEmail('buyer @example.com'), false)
})

test('contactValidation: business contact phone accepts phone-like values without SMS semantics', () => {
  assert.equal(isValidContactPhone('0574-12345678'), true)
  assert.equal(isValidContactPhone('400-800-1234'), true)
  assert.equal(isValidContactPhone('+86 138 0013 8000'), true)
  assert.equal(isValidContactPhone('021 12345678 x 801'), true)

  assert.equal(isValidContactPhone('12345'), false)
  assert.equal(isValidContactPhone('phone-abc'), false)
  assert.equal(isValidContactPhone('13800138000#1'), false)
  assert.equal(isValidContactPhone('++86 13800138000'), false)
})

test('contactValidation: admin mobile phone follows SMS login mainland rule', () => {
  assert.equal(normalizeMainlandMobilePhone('+86 138-0013-8000'), '13800138000')
  assert.equal(normalizeMainlandMobilePhone('8613800138000'), '13800138000')
  assert.equal(isValidMainlandMobilePhone('+86 138-0013-8000'), true)
  assert.equal(isValidMainlandMobilePhone('0574-12345678'), false)
  assert.equal(isValidMainlandMobilePhone('12800138000'), false)
})
