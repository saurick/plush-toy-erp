import React, { useEffect, useState } from 'react'
import { Alert, Form, Radio, Space, Typography, Button } from 'antd'
import { UndoOutlined } from '@ant-design/icons'
import Table from '@/common/components/table/AppTable'
import BusinessModal from '../business-list/BusinessModal.jsx'
import { businessFormSnapshot } from '../../utils/businessFormSnapshot.mjs'
import {
  MAX_BOM_IMPORT_ROWS,
  describeBOMImportQuantity,
  getBOMImportLineIssues,
} from '../../utils/bomXlsxImport.mjs'
import { referenceLabel } from '../../utils/referenceSelectOptions.mjs'
import { formatBOMSourceNumber } from '../../utils/bomSourceValues.mjs'

export function bomImportItemsSnapshot(values) {
  return businessFormSnapshot({
    items: values.items,
    quantity_text: values.quantity_text,
  })
}

export function BOMImportUndoAction({ form, undo, disabled, onUndo }) {
  const current = Form.useWatch(bomImportItemsSnapshot, {
    form,
    preserve: true,
  })
  if (!undo || current !== undo.appliedSnapshot) return null
  return (
    <Button
      size="small"
      aria-label="撤销本次导入"
      icon={<UndoOutlined />}
      disabled={disabled}
      onClick={onUndo}
    >
      撤销本次导入
    </Button>
  )
}

export default function BOMExcelImportPreview({
  pending,
  existingCount,
  currentQuantity,
  materialOptions,
  unitOptions,
  onCancel,
  onConfirm,
}) {
  const [mode, setMode] = useState('append')
  useEffect(() => setMode('append'), [pending])
  const detailsOnly = pending?.target === 'items'
  const draft = pending?.draft
  const rows = draft?.values.items || []
  const quantityNotice = detailsOnly
    ? describeBOMImportQuantity(currentQuantity, draft?.values.quantity_text, { pending: true })
    : ''
  const appendExceedsLimit =
    detailsOnly &&
    mode === 'append' &&
    existingCount + rows.length > MAX_BOM_IMPORT_ROWS
  const replacing = detailsOnly && existingCount > 0 && mode === 'replace'
  const fallbackColumns = [
    {
      title: '材料 / 原表名称',
      key: 'material',
      align: 'left',
      render: (_, item) => (
        <Space direction="vertical" size={0}>
          <span>
            {item.material_id
              ? referenceLabel(materialOptions, item.material_id, '材料')
              : item._import_source?.materialName || '待选择材料'}
          </span>
          <Typography.Text type="secondary">
            原表第 {item._import_source?.rowNumber} 行 ·{' '}
            {item._import_source?.materialName}
          </Typography.Text>
        </Space>
      ),
    },
    { title: '部位', dataIndex: 'position', width: 90 },
    { title: '单位用量', dataIndex: 'quantity', width: 100, align: 'right' },
    {
      title: '单位',
      key: 'unit',
      width: 90,
      render: (_, item) =>
        item.unit_id
          ? referenceLabel(unitOptions, item.unit_id, '单位')
          : item._import_source?.unit || '待选择',
    },
    {
      title: '校对',
      key: 'review',
      width: 90,
      render: (_, item) =>
        getBOMImportLineIssues(item).length ? '待补全' : '已匹配',
    },
  ]
  const columns = draft?.review.columns?.length
    ? [...draft.review.columns.map((column) => ({
      title: column.label,
      key: column.column,
      width: 140,
      render: (_, item) => {
        const cell = item._import_source?.cells?.find((entry) => entry.column === column.column)
        const text = cell?.value || ''
        return <span title={text}>{(cell?.numeric ? formatBOMSourceNumber(text, cell.numberFormat) : text) || text || '—'}</span>
      },
    })), fallbackColumns[fallbackColumns.length - 1]]
    : fallbackColumns
  return (
    <BusinessModal
      open={Boolean(pending)}
      title={detailsOnly ? '导入材料明细' : '从 Excel 新建 BOM'}
      size="lineItems"
      onCancel={onCancel}
      onOk={() => onConfirm(detailsOnly ? mode : 'replace')}
      okText={
        replacing
          ? `替换并带入 ${rows.length} 个部位`
          : detailsOnly && existingCount
            ? `追加 ${rows.length} 个部位`
            : '带入并核对'
      }
      okButtonProps={{ disabled: appendExceedsLimit }}
      cancelText="取消"
    >
      <Space direction="vertical" size="middle" style={{ width: '100%' }}>
        <Typography.Text>
          {draft?.review.fileName} / {draft?.review.sheetName} · 已读取{' '}
          {rows.length} 个部位
        </Typography.Text>
        <Typography.Text type="secondary">
          {detailsOnly
            ? '带入材料明细，产品、版本和其他表头保持当前草稿内容。'
            : '带入编辑页核对，点击“保存草稿”后才新建 BOM。'}
          {draft?.review.productCode || draft?.review.productName
            ? ` 原表产品：${draft.review.productCode || draft.review.productName}。`
            : ''}
        </Typography.Text>
        {quantityNotice ? <Typography.Text>{quantityNotice}</Typography.Text> : null}
        <Table
          rowKey={(item) => item._import_source.rowNumber}
          size="small"
          columns={columns}
          dataSource={rows}
          scroll={{ x: Math.max(580, columns.length * 140) }}
          pagination={{
            pageSize: 5,
            showSizeChanger: false,
            hideOnSinglePage: true,
          }}
        />
        {detailsOnly && existingCount > 0 ? (
          <Radio.Group
            value={mode}
            onChange={(event) => setMode(event.target.value)}
            aria-label="导入明细处理方式"
          >
            <Space wrap>
              <Radio value="append">
                追加，保留现有 {existingCount} 个部位
              </Radio>
              <Radio value="replace">替换现有 {existingCount} 个部位</Radio>
            </Space>
          </Radio.Group>
        ) : null}
        {appendExceedsLimit ? (
          <Alert
            type="warning"
            showIcon
            message="追加后超过 1000 个部位，请选择替换或减少现有明细。"
          />
        ) : replacing ? (
          <Alert
            type="warning"
            showIcon
            message="确认后将替换当前草稿明细，保存前可撤销本次导入。"
          />
        ) : null}
      </Space>
    </BusinessModal>
  )
}
