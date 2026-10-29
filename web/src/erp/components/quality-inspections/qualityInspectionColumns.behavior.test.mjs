import { createElement } from 'react'
import assert from 'node:assert/strict'
import test from 'node:test'
import { businessFormHarness } from '../../../../scripts/test/businessFormHarness.mjs'
import {
  applyModuleColumnVisibility,
  buildDefaultModuleHiddenColumns,
} from '../../utils/moduleTableColumns.mjs'

test('quality list presents one decision while retaining separate status and result exports', async (t) => {
  const ui = await businessFormHarness(t)
  const { buildQualityInspectionDataColumns, buildQualityInspectionExportColumns } = await import('./qualityInspectionColumns.jsx')
  const columns = buildQualityInspectionDataColumns({})
  const visible = applyModuleColumnVisibility(columns, buildDefaultModuleHiddenColumns(columns))
  assert.deepEqual(visible.filter(({ dataIndex }) => ['status', 'result'].includes(dataIndex)).map(({ dataIndex }) => dataIndex), ['status'])
  const status = columns.find(({ dataIndex }) => dataIndex === 'status')
  for (const [record, expected] of [
    [{ status: 'DRAFT', result: 'PASS' }, '草稿'],
    [{ status: 'SUBMITTED' }, '已提交'],
    [{ status: 'PASSED', result: 'PASS' }, '合格'],
    [{ status: 'PASSED', result: 'CONCESSION' }, '让步接收'],
    [{ status: 'REJECTED', result: 'REJECT' }, '不合格'],
    [{ status: 'CANCELLED' }, '已取消'],
    [{ status: 'PASSED' }, '判定待核对'],
    [{ status: 'PASSED', result: 'PASS', superseded_at: 123 }, '已替代 · 合格'],
    [{ status: 'REJECTED', result: 'REJECT', superseded_at: 123 }, '已替代 · 不合格'],
  ]) {
    await ui.render(createElement('div', null, status.render(record.status, record)))
    assert.equal(document.body.textContent.trim(), expected)
    assert.equal(status.exportValue(record), expected)
  }
  const record = { status: 'PASSED', result: 'CONCESSION' }
  const exports = buildQualityInspectionExportColumns({})
  assert.equal(exports.find(({ dataIndex }) => dataIndex === 'status').exportValue(record), '合格')
  assert.equal(exports.find(({ dataIndex }) => dataIndex === 'result').exportValue(record), '让步接收')
  assert.equal(columns.find(({ dataIndex }) => dataIndex === 'result').exportValue(record), '让步接收')
})

test('quality export identifies the recorded inspector and superseded lineage without pretending all types are listed', async (t) => {
  await businessFormHarness(t)
  const { buildQualityInspectionExportColumns, QUALITY_INSPECTION_TYPE_FILTER_OPTIONS } = await import('./qualityInspectionColumns.jsx')
  const columns = buildQualityInspectionExportColumns({})
  const actor = columns.find(({ dataIndex }) => dataIndex === 'inspector_id')
  assert.equal(actor.exportValue({ inspector_id: 7, inspector_name: '质检员陈' }), '质检员陈')
  assert.equal(actor.exportValue({}), '')
  assert.equal(actor.exportValue({ inspector_id: 7 }), '姓名待核对')
  assert.equal(columns.find(({ dataIndex }) => dataIndex === 'superseded_at').exportValue({ superseded_at: 123 }), '已替代')
  assert.ok(columns.some(({ dataIndex }) => dataIndex === 'correction_of_inspection_no'))
  assert.ok(columns.some(({ dataIndex }) => dataIndex === 'corrected_inspection_no'))
  assert.deepEqual(QUALITY_INSPECTION_TYPE_FILTER_OPTIONS.map(({ value }) => value), ['INCOMING', 'OUTSOURCING_RETURN', 'FINISHED_GOODS', 'PRODUCTION_STAGE'])
})
