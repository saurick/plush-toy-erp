import React, { useEffect, useRef, useState } from 'react'
import { RedoOutlined } from '@ant-design/icons'
import { Alert, Button, Descriptions, Divider, Empty, Spin } from 'antd'

import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isRpcAbortError } from '@/common/utils/jsonRpc'
import { ERP_MODAL_WIDTHS } from '../../utils/modalSizes.mjs'
import { BUSINESS_ROW_ITEMS_MODAL_PAGE_SIZE } from '../../utils/businessRowItemsPreview.mjs'

import { getColumnLabel } from './ColumnOrderModal.jsx'
import BusinessFormModal from './BusinessFormModal.jsx'
import BusinessDetailsPagination from './BusinessDetailsPagination.jsx'
import BusinessRowItemCards, {
  visibleDetailValue,
} from './BusinessRowItemCards.jsx'

const EMPTY_LINE_ITEMS = Object.freeze([])

function readDataIndex(record, dataIndex) {
  if (Array.isArray(dataIndex)) {
    return dataIndex.reduce((current, key) => current?.[key], record)
  }
  if (typeof dataIndex === 'string' && dataIndex.includes('.')) {
    return dataIndex.split('.').reduce((current, key) => current?.[key], record)
  }
  return dataIndex ? record?.[dataIndex] : undefined
}

function detailValue(column, record) {
  if (typeof column.detailValue === 'function') {
    return column.detailValue(record)
  }
  if (typeof column.exportValue === 'function') {
    return column.exportValue(record)
  }
  const rawValue = readDataIndex(record, column.dataIndex)
  if (typeof column.render === 'function') {
    return column.render(rawValue, record)
  }
  return rawValue
}

function normalizeLineItems(result) {
  const items = Array.isArray(result) ? result : result?.items
  if (!Array.isArray(items)) throw new Error('返回的明细数据无效')
  return items
}

function useBusinessLineItems(config, open, record) {
  const { items: embeddedItems, load: loadItems } = config || {}
  const [loadState, setLoadState] = useState({
    status: 'idle',
    items: EMPTY_LINE_ITEMS,
  })
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(BUSINESS_ROW_ITEMS_MODAL_PAGE_SIZE)
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    setPage(1)
    setPageSize(BUSINESS_ROW_ITEMS_MODAL_PAGE_SIZE)
    if (!open || !record) {
      setLoadState({ status: 'idle', items: EMPTY_LINE_ITEMS })
      return undefined
    }
    if (Array.isArray(embeddedItems)) {
      setLoadState({ status: 'success', items: embeddedItems })
      return undefined
    }
    if (typeof loadItems !== 'function') {
      setLoadState({ status: 'success', items: EMPTY_LINE_ITEMS })
      return undefined
    }

    const controller = new AbortController()
    setLoadState({ status: 'loading', items: EMPTY_LINE_ITEMS })
    Promise.resolve(loadItems(record, { signal: controller.signal }))
      .then(normalizeLineItems)
      .then((items) => {
        if (!controller.signal.aborted) {
          setLoadState({ status: 'success', items })
        }
      })
      .catch((error) => {
        if (!controller.signal.aborted && !isRpcAbortError(error)) {
          setLoadState({ status: 'error', error, items: EMPTY_LINE_ITEMS })
        }
      })

    return () => controller.abort()
  }, [embeddedItems, loadItems, open, record, retryKey])

  const pageStart = (page - 1) * pageSize
  const pageItems = loadState.items.slice(pageStart, pageStart + pageSize)

  return {
    loadState,
    page,
    pageSize,
    changePage: (nextPage, nextPageSize) => {
      setPage(nextPage)
      setPageSize(nextPageSize)
    },
    pageStart,
    pageItems,
    retry: () => setRetryKey((value) => value + 1),
  }
}

function BusinessLineItems({ config, record, state, contentRef }) {
  const {
    emptyDescription = '当前记录暂无明细',
    getItemFields,
    getItemKey,
    getItemLabel,
    getItemSummary,
    title = '完整明细',
  } = config
  const { loadState, pageItems, pageStart, retry } = state
  return (
    <section aria-label={title} ref={contentRef}>
      <Divider orientation="left" plain>
        {loadState.status === 'success'
          ? `${title}（共 ${loadState.items.length} 条）`
          : title}
      </Divider>
      {loadState.status === 'loading' || loadState.status === 'idle' ? (
        <div className="erp-business-row-items-preview__loading">
          <Spin size="small" />
          <span>正在加载明细…</span>
        </div>
      ) : null}
      {loadState.status === 'error' ? (
        <Alert
          action={
            <Button
              size="small"
              className="erp-business-retry-button"
              icon={<RedoOutlined aria-hidden="true" />}
              onClick={retry}
            >
              重试
            </Button>
          }
          message={getActionErrorMessage(loadState.error, '加载明细失败')}
          showIcon
          type="error"
        />
      ) : null}
      {loadState.status === 'success' && loadState.items.length === 0 ? (
        <Empty
          description={emptyDescription}
          image={Empty.PRESENTED_IMAGE_SIMPLE}
        />
      ) : null}
      {loadState.status === 'success' && pageItems.length > 0 ? (
        <div className="erp-business-row-items-preview__items">
          <BusinessRowItemCards
            getItemFields={getItemFields}
            getItemKey={getItemKey}
            getItemLabel={getItemLabel}
            getItemSummary={getItemSummary}
            items={pageItems}
            record={record}
            startIndex={pageStart}
            view="details"
          />
        </div>
      ) : null}
    </section>
  )
}

export default function BusinessDetailsModal({
  children,
  columns = [],
  description,
  lineItems,
  onClose,
  open,
  record,
  title = '记录详情',
  width = lineItems
    ? ERP_MODAL_WIDTHS.lineItems
    : ERP_MODAL_WIDTHS.recordDetails,
}) {
  const lineItemsState = useBusinessLineItems(lineItems, open, record)
  const lineItemsRef = useRef(null)
  const detailColumns = columns.filter(
    (column) =>
      column &&
      column.hidden !== true &&
      column.hiddenByEffectiveFieldPolicy !== true &&
      column.detailHidden !== true &&
      getColumnLabel(column)
  )

  return (
    <BusinessFormModal
      className="erp-business-details-modal"
      description={description}
      destroyOnHidden
      footer={
        <>
          {lineItems && lineItemsState.loadState.status === 'success' ? (
            <BusinessDetailsPagination
              current={lineItemsState.page}
              pageSize={lineItemsState.pageSize}
              total={lineItemsState.loadState.items.length}
              onChange={lineItemsState.changePage}
              contentRef={lineItemsRef}
            />
          ) : null}
          <Button key="close" onClick={onClose}>
            关闭
          </Button>
        </>
      }
      open={open}
      title={title}
      width={width}
      onCancel={onClose}
    >
      <Descriptions
        bordered
        column={{ xs: 1, sm: 2, lg: 3 }}
        size="small"
        items={detailColumns.map((column, index) => {
          const label = getColumnLabel(column)
          const key =
            column.key ||
            (Array.isArray(column.dataIndex)
              ? column.dataIndex.join('.')
              : column.dataIndex) ||
            `${label}-${index}`
          return {
            key,
            label,
            children: visibleDetailValue(detailValue(column, record || {})),
          }
        })}
      />
      {lineItems ? (
        <BusinessLineItems
          config={lineItems}
          record={record}
          state={lineItemsState}
          contentRef={lineItemsRef}
        />
      ) : null}
      {children}
    </BusinessFormModal>
  )
}
