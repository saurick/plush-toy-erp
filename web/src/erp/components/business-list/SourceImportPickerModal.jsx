import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { SearchOutlined } from '@ant-design/icons'
import {
  Button,
  Empty,
  Input,
  Modal,
  Pagination,
  Popover,
  Table,
  Tag,
  Typography,
} from 'antd'
import { ERP_MODAL_WIDTHS } from '../../utils/modalSizes.mjs'

const { Text } = Typography
const SELECTED_SUMMARY_VISIBLE_LIMIT = 2

function normalizeText(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
}

function defaultRowSearchText(row = {}, columns = []) {
  return columns
    .map((column) => {
      if (typeof column.searchText === 'function') {
        return column.searchText(row)
      }
      if (typeof column.dataIndex === 'string') {
        return row[column.dataIndex]
      }
      return ''
    })
    .join(' ')
}

function toggleKey(keys, key, multiple) {
  const currentKeys = Array.isArray(keys) ? keys : []
  if (!multiple) {
    return [key]
  }
  return currentKeys.includes(key)
    ? currentKeys.filter((item) => item !== key)
    : [...currentKeys, key]
}

function defaultSelectedLabel(row = {}) {
  return (
    row.code ||
    row.order_no ||
    row.purchase_order_no ||
    row.material_no ||
    row.sku_code ||
    row.name ||
    row.title ||
    row.id ||
    '-'
  )
}

function formatPaginationTotal(total, currentPage, pageSize) {
  if (total <= 0) return '共 0 条'
  const start = (currentPage - 1) * pageSize + 1
  const end = Math.min(total, currentPage * pageSize)
  return `${start}-${end} / 共 ${total} 条`
}

export default function SourceImportPickerModal({
  open,
  title,
  description,
  searchPlaceholder = '搜索要导入的记录',
  rows = [],
  columns = [],
  rowKey = 'id',
  multiple = true,
  loading = false,
  importText = '导入',
  cancelText = '取消',
  emptyDescription = '暂无可导入记录',
  getSearchText,
  getSelectedLabel,
  isRowDisabled,
  getRowDisabledReason,
  onCancel,
  onImport,
  width = ERP_MODAL_WIDTHS.localAction,
  pageSize = 5,
}) {
  const [keyword, setKeyword] = useState('')
  const [selectedRowKeys, setSelectedRowKeys] = useState([])
  const [selectedRowSnapshotsByKey, setSelectedRowSnapshotsByKey] = useState(
    () => new Map()
  )
  const [currentPage, setCurrentPage] = useState(1)

  useEffect(() => {
    if (open) {
      setKeyword('')
      setSelectedRowKeys([])
      setSelectedRowSnapshotsByKey(new Map())
      setCurrentPage(1)
    }
  }, [open])

  const getKey = useCallback(
    (row) => (typeof rowKey === 'function' ? rowKey(row) : row?.[rowKey]),
    [rowKey]
  )

  const filteredRows = useMemo(() => {
    const query = normalizeText(keyword)
    if (!query) return rows
    return rows.filter((row) => {
      const text =
        typeof getSearchText === 'function'
          ? getSearchText(row)
          : defaultRowSearchText(row, columns)
      return normalizeText(text).includes(query)
    })
  }, [columns, getSearchText, keyword, rows])

  const rowsByKey = useMemo(
    () => new Map(rows.map((row) => [String(getKey(row)), row])),
    [getKey, rows]
  )

  const selectedRows = selectedRowKeys
    .map((key) => selectedRowSnapshotsByKey.get(String(key)))
    .filter(Boolean)

  useEffect(() => {
    if (filteredRows.length === 0) {
      setCurrentPage(1)
      return
    }
    const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize))
    if (currentPage > totalPages) {
      setCurrentPage(totalPages)
    }
  }, [currentPage, filteredRows.length, pageSize])

  const selectedSummaryItems = useMemo(
    () =>
      selectedRows.map((row) => ({
        key: String(getKey(row)),
        label:
          typeof getSelectedLabel === 'function'
            ? getSelectedLabel(row)
            : defaultSelectedLabel(row),
      })),
    [getKey, getSelectedLabel, selectedRows]
  )

  const pagedRows = useMemo(() => {
    const start = (currentPage - 1) * pageSize
    return filteredRows.slice(start, start + pageSize)
  }, [currentPage, filteredRows, pageSize])

  const handleKeywordChange = (event) => {
    setKeyword(event.target.value)
    setCurrentPage(1)
  }

  const updateSelectedRowKeys = (nextKeys = []) => {
    const normalizedKeys = Array.isArray(nextKeys) ? nextKeys : []
    setSelectedRowKeys(normalizedKeys)
    setSelectedRowSnapshotsByKey((current) => {
      const next = new Map()
      normalizedKeys.forEach((key) => {
        const normalizedKey = String(key)
        const row =
          rowsByKey.get(normalizedKey) || current.get(normalizedKey) || null
        if (row) {
          next.set(normalizedKey, row)
        }
      })
      return next
    })
  }

  const tableColumns = useMemo(() => {
    const baseColumns = columns.map((column) => {
      const nextColumn = { ...column }
      delete nextColumn.ellipsis
      return nextColumn
    })
    if (typeof getRowDisabledReason !== 'function') {
      return baseColumns
    }
    return [
      ...baseColumns,
      {
        title: '限制说明',
        key: '__disabled_reason',
        width: 180,
        render: (_, row) => {
          const reason = getRowDisabledReason(row)
          return reason ? (
            <Text className="erp-source-import-picker__reason">{reason}</Text>
          ) : (
            <Text type="secondary">可导入</Text>
          )
        },
      },
    ]
  }, [columns, getRowDisabledReason])

  const handleImport = () => {
    if (selectedRows.length === 0) return
    onImport?.(selectedRows)
  }

  const clearSelection = () => {
    setSelectedRowKeys([])
    setSelectedRowSnapshotsByKey(new Map())
  }

  return (
    <Modal
      className="erp-source-import-picker-modal"
      width={width}
      open={open}
      onCancel={onCancel}
      title={
        <div className="erp-source-import-picker__title">
          <span>{title}</span>
          {description ? <small>{description}</small> : null}
        </div>
      }
      footer={
        <div className="erp-source-import-picker__footer">
          <div className="erp-source-import-picker__footer-actions">
            <Button onClick={onCancel}>{cancelText}</Button>
            <Button
              type="primary"
              disabled={selectedRows.length === 0}
              onClick={handleImport}
            >
              {importText}
            </Button>
          </div>
        </div>
      }
      centered
      destroyOnHidden
      maskClosable={false}
    >
      <div className="erp-source-import-picker">
        <Input
          allowClear
          prefix={<SearchOutlined />}
          value={keyword}
          onChange={handleKeywordChange}
          placeholder={searchPlaceholder}
        />
        <div className="erp-source-import-picker__selection">
          <div className="erp-source-import-picker__selection-items">
            {selectedSummaryItems.length > 0 ? (
              <>
                <Text type="secondary">
                  已选 <strong>{selectedSummaryItems.length}</strong> 条：
                </Text>
                {selectedSummaryItems
                  .slice(0, SELECTED_SUMMARY_VISIBLE_LIMIT)
                  .map((item) => (
                    <Tag
                      className="erp-source-import-picker__selection-tag"
                      key={item.key}
                    >
                      {item.label}
                    </Tag>
                  ))}
                {selectedSummaryItems.length >
                SELECTED_SUMMARY_VISIBLE_LIMIT ? (
                  <Popover
                    trigger={['hover', 'click', 'focus']}
                    placement="bottomLeft"
                    destroyOnHidden
                    overlayClassName="erp-source-import-picker__selected-popover"
                    content={
                      <div className="erp-source-import-picker__selected-popover-content">
                        <Text strong>
                          已选 {selectedSummaryItems.length} 条
                        </Text>
                        <div className="erp-source-import-picker__selected-popover-items">
                          {selectedSummaryItems.map((item) => (
                            <Tag
                              className="erp-source-import-picker__selected-popover-item"
                              key={item.key}
                              title={item.label}
                            >
                              {item.label}
                            </Tag>
                          ))}
                        </div>
                      </div>
                    }
                  >
                    <Tag
                      aria-label={`显示全部已选来源，共 ${selectedSummaryItems.length} 条`}
                      className="erp-source-import-picker__selection-tag erp-source-import-picker__selection-more"
                      role="button"
                      tabIndex={0}
                    >
                      {`+${
                        selectedSummaryItems.length -
                        SELECTED_SUMMARY_VISIBLE_LIMIT
                      }`}
                    </Tag>
                  </Popover>
                ) : null}
              </>
            ) : (
              <Text type="secondary">未选择来源</Text>
            )}
          </div>
          <Button
            disabled={selectedSummaryItems.length === 0}
            type="link"
            size="small"
            onClick={clearSelection}
          >
            清空已选
          </Button>
        </div>
        <Table
          rowKey={rowKey}
          size="small"
          loading={loading}
          dataSource={pagedRows}
          columns={tableColumns}
          pagination={false}
          locale={{
            emptyText: <Empty description={emptyDescription} />,
          }}
          rowSelection={{
            type: multiple ? 'checkbox' : 'radio',
            selectedRowKeys,
            preserveSelectedRowKeys: true,
            onChange: updateSelectedRowKeys,
            getCheckboxProps: (row) => ({
              disabled:
                typeof isRowDisabled === 'function' && isRowDisabled(row),
            }),
          }}
          rowClassName={(row) =>
            typeof isRowDisabled === 'function' && isRowDisabled(row)
              ? 'erp-source-import-picker__row--disabled'
              : ''
          }
          onRow={(row) => ({
            onClick: () => {
              if (typeof isRowDisabled === 'function' && isRowDisabled(row)) {
                return
              }
              updateSelectedRowKeys(
                toggleKey(selectedRowKeys, getKey(row), multiple)
              )
            },
          })}
          scroll={{ x: 760, y: 380 }}
        />
        <div className="erp-source-import-picker__pagination">
          <Text type="secondary">
            {formatPaginationTotal(filteredRows.length, currentPage, pageSize)}
          </Text>
          <Pagination
            current={currentPage}
            pageSize={pageSize}
            total={filteredRows.length}
            hideOnSinglePage={false}
            showSizeChanger={false}
            showLessItems
            onChange={(page) => setCurrentPage(page)}
          />
        </div>
      </div>
    </Modal>
  )
}
