import { RollbackOutlined } from '@ant-design/icons'
import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Alert, Button, Checkbox, Popover, Tag, Typography } from 'antd'
import Empty from '@/common/components/empty/AppEmpty.jsx'
import { useModal } from '@/common/utils/antdApp'
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

function SelectedRecordsPopover({ items }) {
  return (
    <div className="erp-source-import-picker__selected-popover-content">
      <Text strong>已选 {items.length} 条</Text>
      <div className="erp-source-import-picker__selected-popover-items">
        {items.map((item) => (
          <Tag className="erp-source-import-picker__selected-popover-item" key={item.key} title={item.label}>
            {item.label}
          </Tag>
        ))}
      </div>
    </div>
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
  importDisabledReason = '当前暂不可导入',
  cancelText = '取消',
  selectedNoun = '来源',
  emptyDescription = '暂无可导入记录',
  filteredEmptyDescription = '没有符合条件的记录',
  loadError,
  readDenied = false,
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
  selectionGroup,
  selectAllDisabledReason,
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
  allowSelectAll = true,
  onSelectAllFiltered,
  expandable,
}) {
  const modal = useModal()
  const [keyword, setKeyword] = useState('')
  const [selectedRowKeys, setSelectedRowKeys] = useState([])
  const [selectedRowSnapshotsByKey, setSelectedRowSnapshotsByKey] = useState(
    () => new Map()
  )
  const [currentPage, setCurrentPage] = useState(1)
  const [onlySelected, setOnlySelected] = useState(false)
  const [selectingAll, setSelectingAll] = useState(false)
  const selectionBlocked = loading || readDenied || Boolean(loadError) || selectingAll
  const [selectAllError, setSelectAllError] = useState('')
  const [allFilteredKeys, setAllFilteredKeys] = useState([])
  const selectAllRequest = useRef(null)
  const selectionSummaryId = useId()
  useEffect(() => {
    setSelectingAll(false)
    setSelectAllError('')
    setAllFilteredKeys([])
    return () => {
      selectAllRequest.current?.abort()
      selectAllRequest.current = null
    }
  }, [open, keyword, filterResetKey, onSelectAllFiltered, selectionGroup])
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
    if (readDenied) return []
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
  }, [columns, filterRow, getSearchText, keyword, rows, serverPagination, readDenied])

  const rowsByKey = useMemo(
    () => new Map(rows.map((row) => [String(getKey(row)), row])),
    [getKey, rows]
  )

  useEffect(() => {
    setSelectedRowSnapshotsByKey((current) => {
      if (current.size === 0) return current
      let changed = false
      const next = new Map(current)
      current.forEach((snapshot, normalizedKey) => {
        const currentRow = rowsByKey.get(normalizedKey)
        if (currentRow && snapshot !== currentRow) {
          next.set(normalizedKey, currentRow)
          changed = true
        }
      })
      return changed ? next : current
    })
  }, [rowsByKey])

  const selectedRows = useMemo(() => readDenied ? [] : selectedRowKeys
    .map((key) => selectedRowSnapshotsByKey.get(String(key)) || rowsByKey.get(String(key)))
    .filter(Boolean), [selectedRowKeys, rowsByKey, selectedRowSnapshotsByKey, readDenied])
  const selectableFilteredRows = useMemo(() => filteredRows.filter((row) => !isRowDisabled?.(row)), [filteredRows, isRowDisabled])
  const filteredGroups = getSelectionGroup ? new Set(selectableFilteredRows.map(getSelectionGroup)) : null
  const groupSelectionHint = getSelectionGroup && (serverPagination ? selectionGroup == null : filteredGroups.size > 1)
    ? '先按销售订单筛选，再全选'
    : ''
  const bulkSelectionHint = selectAllDisabledReason || groupSelectionHint
  const visibleTotal = readDenied ? 0 : onlySelected ? selectedRows.length : serverPagination ? serverTotal : filteredRows.length
  const hasInvalidSelectedRows =
    typeof isRowDisabled === 'function' &&
    selectedRows.some((row) => isRowDisabled(row))
  const canImport =
    !selectionBlocked &&
    !importDisabled &&
    selectedRows.length > 0 &&
    !hasInvalidSelectedRows
  const importHint = readDenied ? '当前账号无权查看可选资料' : selectingAll
    ? '正在选择筛选结果，请稍候'
    : loading
    ? '正在加载，请稍候'
    : loadError || (importDisabled
      ? importDisabledReason
      : hasInvalidSelectedRows
        ? '所选来源已不可导入，请清空后重选'
        : selectAllError || (multiple && !onlySelected && (serverPagination ? serverTotal : filteredRows.length) > 0 ? bulkSelectionHint : '') || (selectedRows.length === 0
          ? (serverPagination ? serverTotal : filteredRows.length) > 0
            ? `请先选择${selectedNoun}`
            : `当前没有可选${selectedNoun}`
          : ''))

  useEffect(() => {
    if (loading || readDenied || loadError) return
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
    readDenied,
    loadError,
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

  const selectedKeys = useMemo(() => new Set(selectedRowKeys), [selectedRowKeys])
  const filteredTotal = readDenied ? 0 : serverPagination ? serverTotal : selectableFilteredRows.length
  const showSelectAllFiltered = !readDenied && allowSelectAll && multiple && !onlySelected &&
    (serverPagination ? typeof onSelectAllFiltered === 'function' : true) &&
    (serverPagination ? serverTotal : filteredRows.length) > pageSize
  const pageHasMixedGroups = Boolean(getSelectionGroup && new Set(pagedRows.filter((row) => !isRowDisabled?.(row)).map(getSelectionGroup)).size > 1)
  const filteredSelectionComplete = (serverPagination ? allFilteredKeys : selectableFilteredRows.map(getKey))
  const allFilteredSelected = filteredSelectionComplete.length > 0 && filteredSelectionComplete.every((key) => selectedKeys.has(key))

  const cancelSelectAll = () => {
    selectAllRequest.current?.abort()
    selectAllRequest.current = null
    setSelectingAll(false)
    setSelectAllError('')
    setAllFilteredKeys([])
  }

  const handleKeywordChange = (rawKeyword) => {
    cancelSelectAll()
    const nextKeyword = Number.isSafeInteger(searchMaxLength)
      ? [...rawKeyword].slice(0, searchMaxLength).join('')
      : rawKeyword
    setKeyword(nextKeyword)
    setCurrentPage(1)
    if (serverPagination) onSearchChange?.(nextKeyword)
  }

  const clearFilters = () => {
    cancelSelectAll()
    setKeyword('')
    setCurrentPage(1)
    setOnlySelected(false)
    if (onClearFilters) onClearFilters()
    else onSearchChange?.('')
  }

  const reload = () => {
    if (typeof onReload !== 'function') return
    cancelSelectAll()
    onReload(keyword, serverPagination && onlySelected ? serverCurrentPage : effectiveCurrentPage)
  }

  const handlePageChange = (page) => {
    cancelSelectAll()
    setCurrentPage(page)
    if (!onlySelected) onPageChange?.(page, pageSize, keyword)
  }
  const searchAccessibleLabel = searchHint || searchPlaceholder

  const updateSelectedRowKeys = (nextKeys = [], additionalRows = []) => {
    const normalizedKeys = Array.isArray(nextKeys) ? nextKeys : []
    const candidatesByKey = new Map([...rowsByKey, ...additionalRows.map((row) => [String(getKey(row)), row])])
    if (getSelectionGroup && selectedRows.length) {
      const addedRow = normalizedKeys.filter((key) => !selectedRowKeys.includes(key))
        .map((key) => candidatesByKey.get(String(key))).find(Boolean)
      if (addedRow && getSelectionGroup(addedRow) !== getSelectionGroup(selectedRows[0])) {
        modal.confirm({
          maskClosable: true,
          title: '切换销售订单？',
          content: `每次只能导入同一张销售订单。切换将清空已选的 ${selectedRows.length} 条明细。`,
          okText: '切换并重新选择',
          cancelText: '保留已选',
          onOk: () => replaceSelection(normalizedKeys.filter((key) => {
            const row = candidatesByKey.get(String(key))
            return row && getSelectionGroup(row) === getSelectionGroup(addedRow)
          }), additionalRows),
        })
        return
      }
    }
    replaceSelection(normalizedKeys, additionalRows)
  }

  const replaceSelection = (normalizedKeys, additionalRows = []) => {
    setSelectedRowKeys(normalizedKeys)
    setSelectedRowSnapshotsByKey((current) => {
      const incoming = new Map(additionalRows.map((row) => [String(getKey(row)), row]))
      const next = new Map()
      normalizedKeys.forEach((key) => {
        const normalizedKey = String(key)
        const row =
          incoming.get(normalizedKey) || rowsByKey.get(normalizedKey) || current.get(normalizedKey) || null
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
    cancelSelectAll()
    setSelectedRowKeys([])
    setSelectedRowSnapshotsByKey(new Map())
  }

  const selectAllFiltered = async () => {
    if (selectionBlocked || importDisabled || bulkSelectionHint || selectAllRequest.current || !showSelectAllFiltered) return
    const request = new AbortController()
    selectAllRequest.current = request
    setSelectingAll(true)
    setSelectAllError('')
    try {
      const candidates = serverPagination
        ? await onSelectAllFiltered({ signal: request.signal, expectedTotal: serverTotal })
        : filteredRows
      if (request.signal.aborted || selectAllRequest.current !== request) return
      const eligibleRows = candidates.filter((row) => !isRowDisabled?.(row))
      if (getSelectionGroup && (new Set(eligibleRows.map(getSelectionGroup)).size > 1 ||
        (selectionGroup != null && eligibleRows.some((row) => getSelectionGroup(row) !== selectionGroup)))) {
        setSelectAllError('筛选结果包含其他销售订单，请重新加载后重选；原有选择已保留')
        return
      }
      const keys = eligibleRows.map(getKey)
      updateSelectedRowKeys([...new Set([...selectedRowKeys, ...keys])], candidates)
      setAllFilteredKeys(keys)
    } catch {
      if (!request.signal.aborted && selectAllRequest.current === request) {
        setSelectAllError('未能全选筛选结果，请重试；原有选择已保留')
      }
    } finally {
      if (selectAllRequest.current === request) {
        selectAllRequest.current = null
        setSelectingAll(false)
      }
    }
  }

  const confirmSelectionReset = (onConfirm) => {
    if (!selectedRows.length) return onConfirm()
    modal.confirm({
      maskClosable: true,
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
          {importHint ? (
            <Text type={hasInvalidSelectedRows || selectAllError ? 'danger' : 'secondary'} role="status">
              {importHint}
            </Text>
          ) : null}
          <div className="erp-source-import-picker__footer-actions">
            {typeof onReload === 'function' && !readDenied && !loadError ? (
              <Button
                disabled={loading}
                onClick={reload}
              >
                重新加载
              </Button>
            ) : null}
            <Button onClick={onCancel}>{cancelText}</Button>
            {!readDenied ? (
              <Button type="primary" disabled={!canImport} onClick={handleImport} aria-label={importText} aria-describedby={selectionSummaryId}>
                {importText}
                {multiple ? <span className="erp-source-import-picker__import-count" aria-hidden="true">（{selectedRows.length} 条）</span> : null}
              </Button>
            ) : null}
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
          {renderFilters && !readDenied ? <div className="erp-source-import-picker__filters">{renderFilters({ selectedRows, confirmSelectionReset })}</div> : null}
          <div className="erp-source-import-picker__search-actions">
            <SearchInput
              disabled={readDenied}
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
              disabled={readDenied || (keyword.length === 0 && !hasActiveFilters && !onlySelected)}
              onClick={clearFilters}
            >
              清空筛选
            </Button>
          </div>
        </div>
        <div className="erp-source-import-picker__selection">
          <div className="erp-source-import-picker__selection-actions">
            <Checkbox checked={onlySelected} onChange={(event) => { cancelSelectAll(); setOnlySelected(event.target.checked); setCurrentPage(1) }}>
              仅看已选
            </Checkbox>
            {showSelectAllFiltered ? (
              <Button className="erp-source-import-picker__select-all" aria-label={`全选筛选结果（${filteredTotal} 条）`} title={bulkSelectionHint || undefined} onClick={selectAllFiltered} loading={selectingAll} disabled={selectionBlocked || importDisabled || Boolean(bulkSelectionHint) || !filteredTotal || allFilteredSelected}>
                全选筛选结果（{filteredTotal} 条）
              </Button>
            ) : null}
          </div>
          <div className="erp-source-import-picker__selection-summary">
            <div
              className="erp-source-import-picker__selection-items"
              aria-atomic="true"
              aria-live="polite"
            >
              {selectedSummaryItems.length > 0 ? (
                <>
                  <Text type="secondary" id={selectionSummaryId}>
                    已选 <strong>{selectedSummaryItems.length}</strong> 条：
                  </Text>
                  {selectedSummaryItems
                    .slice(0, SELECTED_SUMMARY_VISIBLE_LIMIT)
                    .map((item) => (
                      <Tag
                        className="erp-source-import-picker__selection-tag"
                        key={item.key}
                        title={item.label}
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
                      content={<SelectedRecordsPopover items={selectedSummaryItems} />}
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
                </>
              ) : (
                <Text type="secondary" id={selectionSummaryId}>已选 <strong>0</strong> 条</Text>
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
        </div>
        {!readDenied && loadError && !loading && pagedRows.length > 0 ? (
          <Alert type="error" showIcon message={loadError} description="已保留上次结果和筛选条件。" action={onReload ? <Button onClick={reload}>重新加载</Button> : undefined} />
        ) : null}
        <Table
          rowKey={rowKey}
          scrollControlsOnEmpty
          size="small"
          loading={loading}
          dataSource={readDenied ? [] : pagedRows}
          columns={tableColumns}
          expandable={expandable}
          pagination={false}
          locale={{
            emptyText: loading ? null : (
              <Empty
                state={readDenied ? 'denied' : loadError ? 'error' : 'empty'}
                description={readDenied ? '当前账号无权查看可选资料' : loadError || (onlySelected
                  ? `尚未选择${selectedNoun}`
                  : keyword.trim() || hasActiveFilters ? filteredEmptyDescription : emptyDescription)}
                detail={readDenied ? '请联系管理员核对权限。' : undefined}
              >
                {!readDenied && loadError && onReload ? <Button onClick={reload}>重新加载</Button> : null}
              </Empty>
            ),
          }}
          rowSelection={{
            type: multiple ? 'checkbox' : 'radio',
            selectedRowKeys,
            preserveSelectedRowKeys: true,
            onChange: (keys) => { if (!selectionBlocked) updateSelectedRowKeys(keys) },
            getCheckboxProps: (row) => ({
              'aria-label': '选择此条记录',
              disabled:
                selectionBlocked || (typeof isRowDisabled === 'function' && isRowDisabled(row)),
            }),
            getTitleCheckboxProps: () => ({ 'aria-label': '全选本页', title: pageHasMixedGroups ? '先按销售订单筛选，再全选' : '全选本页', disabled: selectionBlocked || pageHasMixedGroups || pagedRows.every((row) => isRowDisabled?.(row)) }),
          }}
          rowClassName={(row) =>
            typeof isRowDisabled === 'function' && isRowDisabled(row)
              ? 'erp-source-import-picker__row--disabled'
              : ''
          }
          onRow={(row) => ({
            onClick: (event) => {
              if (isInteractiveRowTarget(event.target)) return
              if (selectionBlocked) return
              if (typeof isRowDisabled === 'function' && isRowDisabled(row)) {
                return
              }
              updateSelectedRowKeys(
                toggleKey(selectedRowKeys, getKey(row), multiple)
              )
            },
          })}
          scroll={{ x: 760, y: 'var(--erp-source-import-table-height)' }}
        />
        <div className="erp-source-import-picker__pagination">
          <Pagination
            disabled={selectionBlocked}
            showTotal={selectionBlocked && visibleTotal === 0 ? false : undefined}
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
