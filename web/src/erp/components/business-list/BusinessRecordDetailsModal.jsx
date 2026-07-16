import React, { useEffect, useState } from 'react'
import {
  Alert,
  Button,
  Descriptions,
  Divider,
  Empty,
  Pagination,
  Spin,
} from 'antd'

import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isRpcAbortError } from '@/common/utils/jsonRpc'

import { getColumnLabel } from './ColumnOrderModal.jsx'
import BusinessFormModal from './BusinessFormModal.jsx'

const LINE_ITEM_PAGE_SIZE = 10
const EMPTY_LINE_ITEMS = Object.freeze([])

function readDataIndex(record, dataIndex) {
  if (Array.isArray(dataIndex)) {
    return dataIndex.reduce((current, key) => current?.[key], record)
  }
  if (typeof dataIndex === 'string' && dataIndex.includes('.')) {
    return dataIndex
      .split('.')
      .reduce((current, key) => current?.[key], record)
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

function visibleDetailValue(value) {
  if (React.isValidElement(value)) return value
  if (value === undefined || value === null || value === '') return '-'
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (['string', 'number', 'bigint'].includes(typeof value)) return String(value)
  return '-'
}

function normalizeLineItems(result) {
  const items = Array.isArray(result) ? result : result?.items
  if (!Array.isArray(items)) throw new Error('返回的明细数据无效')
  return items
}

function BusinessRecordLineItems({ config, open, record }) {
  const {
    emptyDescription = '当前记录暂无明细',
    getItemFields,
    getItemKey,
    getItemLabel,
    getItemSummary,
    items: embeddedItems,
    load: loadItems,
    title = '完整明细',
  } = config
  const [loadState, setLoadState] = useState({
    status: 'idle',
    items: EMPTY_LINE_ITEMS,
  })
  const [page, setPage] = useState(1)
  const [retryKey, setRetryKey] = useState(0)

  useEffect(() => {
    setPage(1)
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

  const pageStart = (page - 1) * LINE_ITEM_PAGE_SIZE
  const pageItems = loadState.items.slice(
    pageStart,
    pageStart + LINE_ITEM_PAGE_SIZE
  )

  return (
    <section aria-label={title}>
      <Divider orientation="left" plain>
        {`${title}（共 ${loadState.items.length} 条）`}
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
            <Button size="small" onClick={() => setRetryKey((value) => value + 1)}>
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
          {pageItems.map((item, localIndex) => {
            const index = pageStart + localIndex
            const label =
              getItemLabel?.(item, { index, record, view: 'details' }) ||
              `明细 ${index + 1}`
            const summary = getItemSummary?.(item, {
              index,
              record,
              view: 'details',
            })
            const fields =
              getItemFields?.(item, {
                index,
                record,
                view: 'details',
              }) || []
            const key = getItemKey?.(item, {
              index,
              record,
              view: 'details',
            })
            return (
              <article
                className="erp-business-row-item-card"
                key={key ?? item?.id ?? `${label}-${index}`}
              >
                <div className="erp-business-row-item-card__head">
                  <strong>{label}</strong>
                  {summary ? <span>{summary}</span> : null}
                </div>
                <dl className="erp-business-row-item-card__grid">
                  {fields.map((field, fieldIndex) => (
                    <div
                      className={
                        field?.wide
                          ? 'erp-business-row-item-card__field erp-business-row-item-card__field--wide'
                          : 'erp-business-row-item-card__field'
                      }
                      key={field?.key || field?.label || fieldIndex}
                    >
                      <dt>{field?.label || '字段'}</dt>
                      <dd>{visibleDetailValue(field?.value)}</dd>
                    </div>
                  ))}
                </dl>
              </article>
            )
          })}
          {loadState.items.length > LINE_ITEM_PAGE_SIZE ? (
            <Pagination
              current={page}
              pageSize={LINE_ITEM_PAGE_SIZE}
              showSizeChanger={false}
              total={loadState.items.length}
              onChange={setPage}
            />
          ) : null}
        </div>
      ) : null}
    </section>
  )
}

export default function BusinessRecordDetailsModal({
  children,
  columns = [],
  description,
  lineItems,
  onClose,
  open,
  record,
  title = '记录详情',
  width = 'min(1120px, calc(100vw - 48px))',
}) {
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
      description={description}
      footer={
        <Button key="close" onClick={onClose}>
          关闭
        </Button>
      }
      open={open}
      title={title}
      width={width}
      onCancel={onClose}
    >
      <Descriptions bordered column={{ xs: 1, sm: 2, lg: 3 }} size="small">
        {detailColumns.map((column, index) => {
          const label = getColumnLabel(column)
          const key =
            column.key ||
            (Array.isArray(column.dataIndex)
              ? column.dataIndex.join('.')
              : column.dataIndex) ||
            `${label}-${index}`
          return (
            <Descriptions.Item key={key} label={label}>
              {visibleDetailValue(detailValue(column, record || {}))}
            </Descriptions.Item>
          )
        })}
      </Descriptions>
      {lineItems ? (
        <BusinessRecordLineItems
          config={lineItems}
          open={open}
          record={record}
        />
      ) : null}
      {children}
    </BusinessFormModal>
  )
}
