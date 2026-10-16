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
