import { RollbackOutlined } from '@ant-design/icons'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Checkbox, Empty, Popover, Tag, Typography } from 'antd'
import { modal } from '@/common/utils/antdApp'
import Pagination from '@/common/components/pagination/AppPagination'
import BusinessModal from '@/erp/components/business-list/BusinessModal.jsx'
import Table from '@/common/components/table/AppTable'
import SearchInput from '@/common/components/SearchInput'
import { ERP_MODAL_WIDTHS } from '../../utils/modalSizes.mjs'

const { Text } = Typography
const SELECTED_SUMMARY_VISIBLE_LIMIT = 2
const INTERACTIVE_ROW_TARGET_SELECTOR = [
  'button',
  'a',
  'input',
  'label',
  'select',
  'textarea',
  '[role="button"]',
  '[role="link"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="combobox"]',
  '[role="option"]',
  '.ant-select',
  '.ant-select-dropdown',
].join(', ')

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

function isInteractiveRowTarget(target) {
  return Boolean(target?.closest?.(INTERACTIVE_ROW_TARGET_SELECTOR))
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
    '记录已关联'
  )
}

export default function SourceImportPickerModal({
  open,
  title,
  description,
  searchPlaceholder = '搜索要导入的记录',
  searchHint,
  searchMaxLength,
  rows = [],
  columns = [],
  rowKey = 'id',
  multiple = true,
  loading = false,
  importText = '导入',
  importDisabled = false,
  cancelText = '取消',
  selectedNoun = '来源',
  emptyDescription = '暂无可导入记录',
  getSearchText,
  getSelectedLabel,
  isRowDisabled,
  getRowDisabledReason,
  filterRow,
  filterResetKey,
  renderFilters,
  hasActiveFilters = false,
  onClearFilters,
  getSelectionGroup,
  onCancel,
  onImport,
  onReload,
  width = ERP_MODAL_WIDTHS.lineItems,
  pageSize = 5,
  serverPagination = false,
  total: serverTotal = 0,
  current: serverCurrentPage,
  onPageChange,
  onSearchChange,
  allowSelectAll = false,
  expandable,
}) {
  const [keyword, setKeyword] = useState('')
  const [selectedRowKeys, setSelectedRowKeys] = useState([])
  const [selectedRowSnapshotsByKey, setSelectedRowSnapshotsByKey] = useState(
    () => new Map()
  )
  const [currentPage, setCurrentPage] = useState(1)
  const [onlySelected, setOnlySelected] = useState(false)
  const effectiveCurrentPage =
    serverPagination && !onlySelected && Number.isSafeInteger(serverCurrentPage)
      ? serverCurrentPage
      : currentPage

  useEffect(() => {
    if (open) {
      setKeyword('')
      setSelectedRowKeys([])
      setSelectedRowSnapshotsByKey(new Map())
      setCurrentPage(1)
      setOnlySelected(false)
    }
  }, [open])

  const getKey = useCallback(
    (row) => (typeof rowKey === 'function' ? rowKey(row) : row?.[rowKey]),
    [rowKey]
  )

  useEffect(() => { setCurrentPage(1) }, [filterResetKey])

  const filteredRows = useMemo(() => {
    if (serverPagination) return rows
    const candidates = filterRow ? rows.filter(filterRow) : rows
    const query = normalizeText(keyword)
    if (!query) return candidates
    return candidates.filter((row) => {
      const text =
        typeof getSearchText === 'function'
          ? getSearchText(row)
          : defaultRowSearchText(row, columns)
      return normalizeText(text).includes(query)
    })
  }, [columns, filterRow, getSearchText, keyword, rows, serverPagination])

  const rowsByKey = useMemo(
    () => new Map(rows.map((row) => [String(getKey(row)), row])),
    [getKey, rows]
  )

  useEffect(() => {
    if (selectedRowKeys.length === 0) return
    setSelectedRowSnapshotsByKey((current) => {
      let changed = false
      const next = new Map(current)
      selectedRowKeys.forEach((key) => {
        const normalizedKey = String(key)
        const currentRow = rowsByKey.get(normalizedKey)
        if (currentRow && current.get(normalizedKey) !== currentRow) {
          next.set(normalizedKey, currentRow)
          changed = true
        }
      })
      return changed ? next : current
    })
  }, [rowsByKey, selectedRowKeys])

  const selectedRows = selectedRowKeys
    .map((key) => rowsByKey.get(String(key)) || selectedRowSnapshotsByKey.get(String(key)))
    .filter(Boolean)
  const visibleTotal = onlySelected ? selectedRows.length : serverPagination ? serverTotal : filteredRows.length
  const hasInvalidSelectedRows =
    typeof isRowDisabled === 'function' &&
    selectedRows.some((row) => isRowDisabled(row))
  const canImport =
    !loading &&
    !importDisabled &&
    selectedRows.length > 0 &&
    !hasInvalidSelectedRows

  useEffect(() => {
    if (loading) return
    const totalRows = visibleTotal
    if (totalRows === 0) {
      setCurrentPage(1)
      if (serverPagination && !onlySelected && effectiveCurrentPage !== 1) {
        onPageChange?.(1, pageSize, keyword)
      }
      return
    }
    const totalPages = Math.max(1, Math.ceil(totalRows / pageSize))
    if (effectiveCurrentPage > totalPages) {
      setCurrentPage(totalPages)
      if (serverPagination && !onlySelected) {
        onPageChange?.(totalPages, pageSize, keyword)
      }
    }
  }, [
    effectiveCurrentPage,
    filteredRows.length,
    pageSize,
    keyword,
    onPageChange,
    serverPagination,
    serverTotal,
    visibleTotal,
    onlySelected,
    loading,
  ])

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
    if (onlySelected) return selectedRows.slice((effectiveCurrentPage - 1) * pageSize, effectiveCurrentPage * pageSize)
    if (serverPagination) return filteredRows
    const start = (effectiveCurrentPage - 1) * pageSize
    return filteredRows.slice(start, start + pageSize)
  }, [effectiveCurrentPage, filteredRows, pageSize, serverPagination, onlySelected, selectedRows])

  const handleKeywordChange = (rawKeyword) => {
    const nextKeyword = Number.isSafeInteger(searchMaxLength)
      ? [...rawKeyword].slice(0, searchMaxLength).join('')
      : rawKeyword
    setKeyword(nextKeyword)
    setCurrentPage(1)
    if (serverPagination) onSearchChange?.(nextKeyword)
  }

  const clearFilters = () => {
    handleKeywordChange('')
    setOnlySelected(false)
    onClearFilters?.()
  }

  const handlePageChange = (page) => {
    setCurrentPage(page)
    if (!onlySelected) onPageChange?.(page, pageSize, keyword)
  }
  const searchAccessibleLabel = searchHint || searchPlaceholder

  const updateSelectedRowKeys = (nextKeys = []) => {
    const normalizedKeys = Array.isArray(nextKeys) ? nextKeys : []
    if (getSelectionGroup && selectedRows.length) {
      const addedRow = normalizedKeys.filter((key) => !selectedRowKeys.includes(key))
        .map((key) => rowsByKey.get(String(key))).find(Boolean)
      if (addedRow && getSelectionGroup(addedRow) !== getSelectionGroup(selectedRows[0])) {
        modal.confirm({
          title: '切换销售订单？',
          content: `每次只能导入同一张销售订单。切换将清空已选的 ${selectedRows.length} 条明细。`,
          okText: '切换并重新选择',
          cancelText: '保留已选',
          onOk: () => replaceSelection(normalizedKeys.filter((key) => {
            const row = rowsByKey.get(String(key))
            return row && getSelectionGroup(row) === getSelectionGroup(addedRow)
          })),
        })
        return
      }
    }
    replaceSelection(normalizedKeys)
  }

  const replaceSelection = (normalizedKeys) => {
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
        align: 'left',
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
    if (!canImport) return
    onImport?.(selectedRows)
  }

  const clearSelection = () => {
    setSelectedRowKeys([])
    setSelectedRowSnapshotsByKey(new Map())
  }

  const confirmSelectionReset = (onConfirm) => {
    if (!selectedRows.length) return onConfirm()
    modal.confirm({
      title: '切换导入来源？',
      content: `切换将清空已选的 ${selectedRows.length} 条明细，是否继续？`,
      okText: '切换并清空已选',
      cancelText: '保留已选',
      onOk: () => { clearSelection(); setOnlySelected(false); onConfirm() },
    })
  }

  return (
    <BusinessModal
      className="erp-source-import-picker-modal"
      width={width}
      open={open}
      onCancel={onCancel}
      title={
        <div className="erp-source-import-picker__title">
          <span>{title}</span>
        </div>
      }
      footer={
        <div className="erp-source-import-picker__footer">
          <div className="erp-source-import-picker__footer-actions">
            {typeof onReload === 'function' ? (
              <Button
                disabled={loading}
                onClick={() => onReload(keyword, serverPagination && onlySelected ? serverCurrentPage : effectiveCurrentPage)}
              >
                重新加载
              </Button>
            ) : null}
            <Button onClick={onCancel}>{cancelText}</Button>
            <Button type="primary" disabled={!canImport} onClick={handleImport}>
              {importText}
            </Button>
          </div>
        </div>
      }
      centered
      destroyOnHidden
      maskClosable
    >
      <div className="erp-source-import-picker">
        {description ? <div className="erp-source-import-picker__description">{description}</div> : null}
        <div className="erp-source-import-picker__toolbar" role="group" aria-label="导入筛选与搜索">
          {renderFilters ? <div className="erp-source-import-picker__filters">{renderFilters({ selectedRows, confirmSelectionReset })}</div> : null}
          <div className="erp-source-import-picker__search-actions">
            <SearchInput
              allowClear
              className="erp-source-import-picker__search"
              value={keyword}
              onSearch={handleKeywordChange}
              resetKey={open}
              placeholder={searchPlaceholder}
              aria-label={searchAccessibleLabel}
              title={searchAccessibleLabel}
            />
            <Button
              icon={<RollbackOutlined aria-hidden="true" />}
              className="erp-source-import-picker__clear-filter erp-action-button"
              disabled={keyword.length === 0 && !hasActiveFilters && !onlySelected}
              onClick={clearFilters}
            >
              清空筛选
            </Button>
          </div>
        </div>
        <div className="erp-source-import-picker__selection">
          <Checkbox checked={onlySelected} onChange={(event) => { setOnlySelected(event.target.checked); setCurrentPage(1) }}>
            仅看已选
          </Checkbox>
          {allowSelectAll && multiple && !serverPagination && !onlySelected ? (
            <Button onClick={() => updateSelectedRowKeys([...new Set([...selectedRowKeys, ...filteredRows.filter((row) => !isRowDisabled?.(row)).map(getKey)])])} disabled={loading || !filteredRows.length}>
              全选筛选结果
            </Button>
          ) : null}
          <div
            className="erp-source-import-picker__selection-items"
            aria-atomic="true"
            aria-live="polite"
          >
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
                    classNames={{
                      root: 'erp-source-import-picker__selected-popover',
                    }}
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
                      aria-label={`显示全部已选${selectedNoun}，共 ${selectedSummaryItems.length} 条`}
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
                {hasInvalidSelectedRows ? (
                  <Text type="danger">所选来源已不可导入，请清空后重选</Text>
                ) : null}
              </>
            ) : (
              <Text type="secondary">未选择{selectedNoun}</Text>
            )}
          </div>
          {selectedSummaryItems.length > 0 ? (
            <Button
              className="erp-source-import-picker__clear-selection"
              type="link"
              size="small"
              title={`清空已选${selectedNoun}`}
              onClick={clearSelection}
            >
              清空已选
            </Button>
          ) : null}
        </div>
        <Table
          rowKey={rowKey}
          size="small"
          loading={loading}
          dataSource={pagedRows}
          columns={tableColumns}
          expandable={expandable}
          pagination={false}
          locale={{
            emptyText: <Empty description={emptyDescription} />,
          }}
          rowSelection={{
            type: multiple ? 'checkbox' : 'radio',
            selectedRowKeys,
            preserveSelectedRowKeys: true,
            hideSelectAll: Boolean(getSelectionGroup && new Set(pagedRows.map(getSelectionGroup)).size > 1),
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
            onClick: (event) => {
              if (isInteractiveRowTarget(event.target)) return
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
          <Pagination
            current={effectiveCurrentPage}
            pageSize={pageSize}
            total={visibleTotal}
            hideOnSinglePage={false}
            showSizeChanger={false}
            onChange={handlePageChange}
          />
        </div>
      </div>
    </BusinessModal>
  )
}
