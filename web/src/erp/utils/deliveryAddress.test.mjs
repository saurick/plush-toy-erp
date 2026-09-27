import test from 'node:test'
import assert from 'node:assert/strict'
import {
  DELIVERY_COUNTRY_OPTIONS,
  MAINLAND_DELIVERY_REGIONS,
  deliveryAddressRule,
  deliveryRegionPrefix,
  isMainlandDeliveryCountry,
  joinDeliveryAddress,
  splitDeliveryAddress,
} from './deliveryAddress.mjs'
import { buildMasterDataParams } from './masterDataParams.mjs'
import {
  buildDeliverySnapshot,
  buildSalesOrderCustomerSourceValues,
  deliverySnapshotFormValues,
} from './sourcePartySnapshots.mjs'
import { isValidContactPhone } from './contactValidation.mjs'

const shenzhen = ['440000', '440300', '440305']
const shanghai = ['310000', '310100', '310115']

test('country choices support international names and keep other regions out of mainland cascading', () => {
  assert.ok(DELIVERY_COUNTRY_OPTIONS.length >= 249)
  assert.equal(
    new Set(DELIVERY_COUNTRY_OPTIONS.map(({ value }) => value)).size,
    DELIVERY_COUNTRY_OPTIONS.length
  )
  assert.equal(DELIVERY_COUNTRY_OPTIONS[0].label, '中国大陆')
  assert.ok(
    DELIVERY_COUNTRY_OPTIONS.find(
      ({ value, searchText }) =>
        value === '美国' && searchText.includes('united states')
    )
  )
  assert.equal(MAINLAND_DELIVERY_REGIONS.length, 31)
  for (const value of ['中国', '中国大陆', 'CN', 'China'])
    { assert.equal(isMainlandDeliveryCountry(value), true) }
  for (const value of ['', '美国', '中国香港', '中国澳门', '中国台湾'])
    { assert.equal(isMainlandDeliveryCountry(value), false) }
})

test('mainland addresses round-trip and changing or clearing regions removes the previous prefix', () => {
  const address = joinDeliveryAddress(shenzhen, '科技园 8 号\n二楼仓库')
  assert.equal(address, '广东省深圳市南山区科技园 8 号\n二楼仓库')
  const draft = splitDeliveryAddress(address, '中国')
  assert.deepEqual(draft, { path: shenzhen, detail: '科技园 8 号\n二楼仓库' })
  assert.equal(
    joinDeliveryAddress(shanghai, draft.detail),
    '上海市浦东新区科技园 8 号\n二楼仓库'
  )
  assert.equal(joinDeliveryAddress([], draft.detail), draft.detail)
  assert.equal(joinDeliveryAddress([], ''), '')
})

test('all supported region paths retain their exact full address and municipalities are not repeated', () => {
  assert.equal(deliveryRegionPrefix(shanghai), '上海市浦东新区')
  const verify = (nodes, parent = []) =>
    nodes.forEach((node) => {
      const path = [...parent, node.value]
      if (node.children) return verify(node.children, path)
      const address = joinDeliveryAddress(path, '试用仓库 8 号')
      const draft = splitDeliveryAddress(address, '中国')
      assert.equal(joinDeliveryAddress(draft.path, draft.detail), address)
    })
  verify(MAINLAND_DELIVERY_REGIONS)
})

test('unrecognized and international addresses retain their original text without guessed region data', () => {
  for (const [country, address] of [
    ['中国', '客户指定中转仓，北门收货'],
    ['中国', '  上海市浦东新区 8 号'],
    ['美国', 'Example Warehouse\n42 Example Road, Suite 6\nAustin, TX 78701'],
    ['英国', 'Unit 4\nExample Industrial Estate\nLondon SW1A 1AA'],
    ['日本', '〒100-0001\n東京都千代田区千代田'],
    ['中国香港', '九龙某工业大厦\n三楼仓库'],
    ['', '广东省深圳市南山区科技园 8 号'],
  ]) {
    assert.deepEqual(splitDeliveryAddress(address, country), {
      path: [],
      detail: address,
    })
  }
})

test('address validation rejects an incomplete region or excessive combined length, allows empty and free-form addresses', async () => {
  const rule = deliveryAddressRule('中国')
  await assert.rejects(rule.validator(null, '上海市浦东新区'), /请补充/)
  await assert.rejects(rule.validator(null, 'x'.repeat(513)), /512/)
  await rule.validator(null, joinDeliveryAddress(shanghai, '示例街 8 号'))
  await rule.validator(null, '客户指定转运仓北门')
  await rule.validator(null, '')
  await deliveryAddressRule('美国').validator(null, 'A\nB\nC')
})

test('customer to order to shipment snapshots preserve full international address and source replacement clears stale values', () => {
  const address =
    'Example Warehouse\n42 Example Road, Suite 6\nAustin, TX 78701'
  const saved = buildMasterDataParams({
    name: '试用国外收货客户',
    country_region: '美国',
    default_delivery_address: address,
    default_delivery_recipient: 'Alex',
    default_delivery_phone: '+1 (512) 555-0100',
  })
  const orderValues = buildSalesOrderCustomerSourceValues({ id: 17, ...saved })
  const orderSnapshot = buildDeliverySnapshot(orderValues)
  assert.equal(orderSnapshot.address, address)
  assert.equal(orderSnapshot.phone, '+1 (512) 555-0100')
  assert.deepEqual(
    buildDeliverySnapshot(deliverySnapshotFormValues(orderSnapshot)),
    orderSnapshot
  )
  const replacement = {
    ...orderValues,
    ...buildSalesOrderCustomerSourceValues({ id: 18, name: '试用空地址客户' }),
  }
  assert.deepEqual(buildDeliverySnapshot(replacement), {})
  const cleared = { ...orderValues, ...buildSalesOrderCustomerSourceValues() }
  assert.equal(cleared.customer_id, undefined)
  assert.deepEqual(buildDeliverySnapshot(cleared), {})
  assert.deepEqual(buildDeliverySnapshot(deliverySnapshotFormValues()), {})
  assert.equal(
    buildMasterDataParams({ ...saved, default_delivery_address: '' })
      .default_delivery_address,
    undefined
  )
})

test('existing phone validation supports international numbers and landlines', () => {
  for (const value of [
    '+1 (512) 555-0100',
    '+44 20 7946 0000',
    '021-55550100',
    '+852 2345 6789',
  ]) {
    assert.equal(isValidContactPhone(value), true)
  }
  assert.equal(isValidContactPhone('not a phone'), false)
})
