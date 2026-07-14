import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(
  new URL('./qualityInspectionColumns.jsx', import.meta.url),
  'utf8'
)

test('quality inspection columns distinguish business source and subject grain', () => {
  assert.match(source, /OUTSOURCING_RETURN: '委外回货'/u)
  assert.match(source, /INCOMING: '采购来料'/u)
  assert.match(source, /sourceType === 'OUTSOURCING_FACT'/u)
  assert.match(source, /subjectType === 'PRODUCT'/u)
  assert.match(source, /productOptions/u)
  assert.match(source, /title: '检验来源'/u)
  assert.match(source, /title: '检验对象 \/ 批次'/u)
  assert.doesNotMatch(source, /title: '采购来源'/u)
  assert.doesNotMatch(source, /title: '物料批次'/u)
})

test('quality inspection columns keep technical source identifiers out of visible fallbacks', () => {
  assert.match(source, /委外回货记录已关联/u)
  assert.match(source, /业务来源已关联/u)
  assert.doesNotMatch(source, /`[^`]*\$\{record\?\.source_id/u)
  assert.doesNotMatch(source, /`[^`]*\$\{record\?\.subject_id/u)
})
