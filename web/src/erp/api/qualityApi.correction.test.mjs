import assert from 'node:assert/strict'
import test from 'node:test'
import { registerJSXTestLoader } from '../../../scripts/test/reactRuntime.mjs'

test('纠正复检只接受原质检来源和准确单号，完成后的同请求恢复保留当前判定', async (t) => {
  registerJSXTestLoader()
  const [{ JsonRpc }, { correctQualityInspectionResult }] = await Promise.all([import('../../common/utils/jsonRpc.js'), import('./qualityApi.mjs')])
  const original = JsonRpc.prototype.call
  const calls = []
  let inspection = { id: 92, correction_of_inspection_id: 91, inspection_no: 'QC-RECHECK-92', status: 'SUBMITTED' }
  JsonRpc.prototype.call = async function call(method, params) {
    assert.equal(method, 'correct_quality_inspection_result')
    calls.push(params)
    return { data: { quality_inspection: inspection } }
  }
  t.after(() => { JsonRpc.prototype.call = original })
  const request = { id: 91, correction_inspection_no: ' QC-RECHECK-92 ', reason: ' 仪器校准后重新核验 ' }
  assert.equal((await correctQualityInspectionResult(request)).id, 92)
  inspection = { ...inspection, status: 'PASSED', decision_note: '新的实际检验结论' }
  assert.equal((await correctQualityInspectionResult(request)).decision_note, '新的实际检验结论')
  assert.deepEqual(calls[0], { id: 91, correction_inspection_no: 'QC-RECHECK-92', reason: '仪器校准后重新核验' })
  assert.deepEqual(calls[1], calls[0])
  for (const changed of [{ ...inspection, id: 0 }, { ...inspection, id: 91 }, { ...inspection, correction_of_inspection_id: 93 }, { ...inspection, inspection_no: 'another' }, { ...inspection, status: 'DRAFT' }, { ...inspection, status: 'CANCELLED' }]) {
    inspection = changed
    await assert.rejects(correctQualityInspectionResult(request), (error) => error.isInvalidResponse === true)
  }
  const count = calls.length
  for (const invalid of [null, [], {}, { ...request, id: '91' }, { ...request, id: 0 }, { ...request, correction_inspection_no: ' ' }, { ...request, reason: {} }]) await assert.rejects(correctQualityInspectionResult(invalid))
  assert.equal(calls.length, count)
})
