import React, { useEffect, useId, useState } from 'react'
import { Alert, Button, Empty, Radio, Space, Typography } from 'antd'
import FilterSelect from '@/common/components/select/FilterSelect'
import SearchInput from '@/common/components/SearchInput'
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
import BOMImportLineStatus from './BOMImportLineStatus.jsx'

export function bomImportItemsSnapshot(values) {
  return businessFormSnapshot({
    items: values.items,
    quantity_text: values.quantity_text,
  })
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
  const [reviewFilter, setReviewFilter] = useState('')
  const [keyword, setKeyword] = useState('')
  const [page, setPage] = useState(1)
  const importScopeId = useId()
  useEffect(() => { setMode('append'); setReviewFilter(''); setKeyword(''); setPage(1) }, [pending])
  const detailsOnly = pending?.target === 'items'
  const draft = pending?.draft
  const rows = draft?.values.items || []
  const visibleRows = rows.filter((item) => {
    const issues = getBOMImportLineIssues(item)
    const matchesReview = !reviewFilter || (reviewFilter === 'issues' ? issues.length > 0 : issues.some((issue) => issue.field === reviewFilter))
    const text = [item._import_source?.materialName, item.position, ...(item._import_source?.cells || []).map((cell) => cell.value)].join(' ').toLowerCase()
    return matchesReview && text.includes(keyword.trim().toLowerCase())
  })
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
              : item._import_source?.materialName || '待选择物料'}
          </span>
          <Typography.Text type="secondary">
            Excel 第 {item._import_source?.rowNumber} 行 ·{' '}
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
      title: '待处理',
      key: 'review',
      width: 140,
      render: (_, item) =>
        <BOMImportLineStatus issues={getBOMImportLineIssues(item)} rowNumber={item._import_source?.rowNumber} />,
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
      className="erp-bom-import-preview"
      onCancel={onCancel}
      onOk={() => onConfirm(detailsOnly ? mode : 'replace')}
      okText={
        replacing
          ? `替换并带入 ${rows.length} 个部位`
          : detailsOnly && existingCount
            ? `追加 ${rows.length} 个部位`
            : `带入编辑（${rows.length} 个部位）`
      }
      okButtonProps={{
        disabled: appendExceedsLimit || rows.length === 0,
        'aria-label': replacing ? `替换并带入 ${rows.length} 个部位` : detailsOnly && existingCount ? `追加 ${rows.length} 个部位` : '带入编辑',
        'aria-describedby': importScopeId,
      }}
      cancelText="取消"
    >
      <div className="erp-bom-import-preview__content" data-table-scroll-scope>
        <Typography.Text>
          {draft?.review.fileName} / {draft?.review.sheetName} · 已读取{' '}
          {rows.length} 个部位
        </Typography.Text>
        <Typography.Text type="secondary">
          {detailsOnly
            ? '带入材料明细，产品、版本和其他表头保持当前草稿内容。'
            : '带入编辑页，补齐后点击“保存草稿”新建 BOM。'}
          {draft?.review.productCode || draft?.review.productName
            ? ` 原表产品：${draft.review.productCode || draft.review.productName}。`
            : ''}
        </Typography.Text>
        {quantityNotice ? <Typography.Text>{quantityNotice}</Typography.Text> : null}
        <div className="erp-source-import-picker__toolbar" role="group" aria-label="导入筛选与搜索">
          <div className="erp-source-import-picker__filters">
            <FilterSelect
              label="待处理项"
              placeholder="筛选待处理项"
              aria-label="BOM 待处理筛选"
              value={reviewFilter}
              onChange={(value) => { setReviewFilter(value || ''); setPage(1) }}
              options={[{ value: 'issues', label: '全部待处理' }, { value: 'material_id', label: '待选择物料' }, { value: 'unit_id', label: '待选择单位' }]}
            />
          </div>
          <div className="erp-source-import-picker__search-actions">
            <SearchInput
              className="erp-source-import-picker__search"
              aria-label="搜索 BOM 导入明细"
              placeholder="搜索材料、部位或原表内容"
              value={keyword}
              onSearch={(value) => { setKeyword(value); setPage(1) }}
            />
            <Button className="erp-source-import-picker__clear-filter" disabled={!keyword && !reviewFilter} onClick={() => { setKeyword(''); setReviewFilter(''); setPage(1) }}>清空筛选</Button>
          </div>
          <div data-table-scroll-toolbar />
        </div>
        <Typography.Text type="secondary" role="status" id={importScopeId}>整份文件导入；筛选结果 {visibleRows.length} / {rows.length} 个部位。筛选仅用于查看，确认后带入全部 {rows.length} 个部位。</Typography.Text>
        <Table
          scrollToolbar
          scrollControlsOnEmpty
          rowKey={(item) => item._import_source.rowNumber}
          size="small"
          columns={columns}
          dataSource={visibleRows}
          locale={{ emptyText: <Empty description={keyword.trim()
            ? '没有符合条件的部位'
            : reviewFilter === 'material_id' ? '当前没有待选择物料的部位'
              : reviewFilter === 'unit_id' ? '当前没有待选择单位的部位'
                : reviewFilter ? '当前没有待处理的部位' : '文件中没有可导入的部位'}
          /> }}
          scroll={{ x: Math.max(580, columns.length * 140) }}
          pagination={{
            current: page,
            onChange: setPage,
            pageSize: 10,
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
      </div>
    </BusinessModal>
  )
}
