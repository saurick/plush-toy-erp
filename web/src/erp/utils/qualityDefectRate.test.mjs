import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildQualityDefectRateParams,
  formatQualityDefectRate,
  normalizeQualityDefectPercent,
  QUALITY_DEFECT_RATE_PRESETS,
} from './qualityDefectRate.mjs'

test('quality defect presets cover the agreed approximate bands and custom entry', () => {
  assert.deepEqual(
    QUALITY_DEFECT_RATE_PRESETS.map((option) => option.value),
    [
      'APPROX:0',
      'APPROX:5',
      'APPROX:10',
      'APPROX:20',
      'APPROX:30',
      'APPROX:50',
      'GT:50',
      'APPROX:100',
      'CUSTOM',
    ]
  )
})

test('quality defect params preserve operator meaning and canonical decimal strings', () => {
  assert.deepEqual(buildQualityDefectRateParams('GT:50'), {
    defect_rate_operator: 'GT',
    defect_rate_percent: '50',
  })
  assert.deepEqual(buildQualityDefectRateParams('CUSTOM', '037.50'), {
    defect_rate_operator: 'APPROX',
    defect_rate_percent: '37.5',
  })
  assert.equal(normalizeQualityDefectPercent('100.00'), '100')
})

test('quality defect params reject missing, over-range, or over-precision input', () => {
  assert.throws(() => buildQualityDefectRateParams('', ''), /请选择/u)
  assert.throws(
    () => buildQualityDefectRateParams('CUSTOM', '100.01'),
    /0% 到 100%/u
  )
  assert.throws(
    () => buildQualityDefectRateParams('CUSTOM', '12.3456789'),
    /最多保留 6 位小数/u
  )
})

test('quality defect display distinguishes approximate, greater-than, and legacy empty data', () => {
  assert.equal(
    formatQualityDefectRate({
      defect_rate_operator: 'APPROX',
      defect_rate_percent: '5.00',
    }),
    '约 5%'
  )
  assert.equal(
    formatQualityDefectRate({
      defect_rate_operator: 'GT',
      defect_rate_percent: '50',
    }),
    '大于 50%'
  )
  assert.equal(formatQualityDefectRate({}), '未记录')
  assert.equal(
    formatQualityDefectRate({ defect_rate_percent: '20' }),
    '比例待核对'
  )
})

test('business data consistency: backend precision survives quality display and edit', () => {
  for (const [raw, canonical] of [
    ['12.3456780', '12.345678'],
    ['100.0000000', '100'],
    ['0.0000000', '0'],
  ]) {
    assert.equal(normalizeQualityDefectPercent(raw), canonical)
    assert.equal(buildQualityDefectRateParams('CUSTOM', raw).defect_rate_percent, canonical)
  }
  assert.throws(() => normalizeQualityDefectPercent('12.3456781'), /最多保留 6 位小数/u)
  for (const percent of ['12.345', '0.000001', '99.999999']) {
    assert.equal(normalizeQualityDefectPercent(percent), percent)
    assert.equal(
      formatQualityDefectRate({
        defect_rate_operator: 'APPROX',
        defect_rate_percent: percent,
      }),
      `约 ${percent}%`
    )
    assert.equal(
      buildQualityDefectRateParams('CUSTOM', percent).defect_rate_percent,
      percent
    )
  }
})
