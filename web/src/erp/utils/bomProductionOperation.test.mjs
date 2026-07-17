import assert from 'node:assert/strict'
import test from 'node:test'

import {
  BOM_PRODUCTION_OPERATION_CODE,
  BOM_PRODUCTION_OPERATION_OPTIONS,
  bomProductionOperationLabel,
  normalizeBOMProductionOperationCode,
} from './bomProductionOperation.mjs'

test('BOM material operation ownership only accepts the explicit fabric-processing code', () => {
  assert.deepEqual(BOM_PRODUCTION_OPERATION_OPTIONS, [
    { value: 'FABRIC_PROCESSING', label: '布料加工' },
  ])
  assert.equal(
    normalizeBOMProductionOperationCode(' fabric_processing '),
    BOM_PRODUCTION_OPERATION_CODE.FABRIC_PROCESSING
  )
  assert.equal(normalizeBOMProductionOperationCode(''), undefined)
  assert.equal(normalizeBOMProductionOperationCode(null), undefined)
  assert.throws(
    () => normalizeBOMProductionOperationCode('SEWING'),
    /生产工序归属不完整/u
  )
})

test('BOM material operation ownership uses business-facing labels', () => {
  assert.equal(bomProductionOperationLabel('FABRIC_PROCESSING'), '布料加工')
  assert.equal(bomProductionOperationLabel(undefined), '不指定')
  assert.equal(bomProductionOperationLabel('SEWING'), '归属待核对')
})
