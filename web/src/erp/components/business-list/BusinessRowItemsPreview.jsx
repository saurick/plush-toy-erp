import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DownOutlined, RightOutlined } from '@ant-design/icons'
import { Alert, Button, Empty, Modal, Pagination, Spin } from 'antd'

import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isRpcAbortError } from '@/common/utils/jsonRpc'
import {
  BUSINESS_ROW_ITEMS_MODAL_PAGE_SIZE,
  BUSINESS_ROW_ITEMS_PREVIEW_LIMIT,
  businessRowItemsCacheKey,
  businessRowEmbeddedItemsSnapshot,
  businessRowItemsModalPage,
  normalizeBusinessRowItemsTotal,
  normalizeBusinessRowItemsResult,
  resolveBusinessRowItemsTotal,
} from '../../utils/businessRowItemsPreview.mjs'

const IDLE_LOAD_STATE = Object.freeze({ status: 'idle' })
const EMPTY_ITEMS = Object.freeze([])

function successLoadState(data) {
  return { status: 'success', data }
}

function loadingLoadState(previous) {
  return { status: 'loading', data: previous?.data }
}

function errorLoadState(error, previous) {
  return { status: 'error', error, data: previous?.data }
}

function loadState(entry, mode) {
  return entry?.[mode] || IDLE_LOAD_STATE
}

function itemValue(value) {
  if (value === undefined || value === null || value === '') return '-'
  return value
}

function BusinessRowItemCards({
  getItemFields,
  getItemKey,
  getItemLabel,
  getItemSummary,
  items,
  record,
  startIndex = 0,
  view,
}) {
  return (
    <div className="erp-business-row-items-preview__items">
      {items.map((item, localIndex) => {
        const index = startIndex + localIndex
        const fields = getItemFields(item, { index, record, view }) || []
        const label =
          getItemLabel?.(item, { index, record, view }) || `明细 ${index + 1}`
        const summary = getItemSummary?.(item, { index, record, view })
        const key = getItemKey?.(item, { index, record, view })
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
                  <dd>{itemValue(field?.value)}</dd>
                </div>
              ))}
            </dl>
          </article>
        )
      })}
    </div>
  )
}

function BusinessRowItemsLoadState({
  emptyDescription,
  load,
  onRetry,
  children,
}) {
  if (load.status === 'loading' || load.status === 'idle') {
    return (
      <div className="erp-business-row-items-preview__loading">
        <Spin size="small" />
        <span>正在加载明细…</span>
      </div>
    )
  }

  if (load.status === 'error') {
    return (
      <Alert
        action={
          <Button size="small" onClick={onRetry}>
            重试
          </Button>
        }
        message={getActionErrorMessage(load.error, '加载明细失败')}
        showIcon
        type="error"
      />
    )
  }

  if (!load.data?.items?.length) {
    return (
      <Empty
        className="erp-business-row-items-preview__empty"
        description={emptyDescription}
        image={Empty.PRESENTED_IMAGE_SIMPLE}
      />
    )
  }

  return children
}

function BusinessRowItemsPanel({
  emptyDescription,
  entry,
  getItemFields,
  getItemKey,
  getItemLabel,
  getItemSummary,
  onLoad,
  onOpenAll,
  onRetry,
  previewLimit,
  record,
  recordCacheKey,
}) {
  const preview = loadState(entry, 'preview')

  useEffect(() => {
    onLoad(record)
  }, [onLoad, record, recordCacheKey])

  const items = preview.data?.items?.slice(0, previewLimit) || []
  const total = preview.data?.total || 0
  return (
    <section
      aria-label="明细快速预览"
      className="erp-business-row-items-preview"
      id={`erp-business-row-items-${recordCacheKey.replace(/[^a-zA-Z0-9_-]/g, '-')}`}
    >
      <BusinessRowItemsLoadState
        emptyDescription={emptyDescription}
        load={preview}
        onRetry={() => onRetry(record)}
      >
        <BusinessRowItemCards
          getItemFields={getItemFields}
          getItemKey={getItemKey}
          getItemLabel={getItemLabel}
          getItemSummary={getItemSummary}
          items={items}
          record={record}
          view="preview"
        />
        <div className="erp-business-row-items-preview__footer">
          <span>{`已显示 ${items.length} / ${total} 条`}</span>
          {total > items.length ? (
            <Button type="link" onClick={() => onOpenAll(record)}>
              查看全部
            </Button>
          ) : null}
        </div>
      </BusinessRowItemsLoadState>
    </section>
  )
}

function BusinessRowExpandButton({
  available,
  expanded,
  expandable,
  getRecordLabel,
  itemTotal,
  onExpand,
  record,
  recordCacheKey,
}) {
  if (!available) {
    return (
      <span
        aria-hidden="true"
        className="erp-business-row-expand-placeholder"
      />
    )
  }

  const recordLabel = getRecordLabel?.(record) || '当前单据'
  if (itemTotal === 0) {
    return (
      <span
        aria-label={`${recordLabel}明细，共 0 条`}
        className="erp-business-row-item-count"
        title="0条"
      >
        0条
      </span>
    )
  }

  if (!expandable) {
    return (
      <span
        aria-hidden="true"
        className="erp-business-row-expand-placeholder"
      />
    )
  }

  const action = expanded ? '收起' : '展开'
  const totalLabel = itemTotal === undefined ? '查看' : `${itemTotal}条`
  const accessibleTotal =
    itemTotal === undefined ? '查看' : `共 ${itemTotal} 条`
  return (
    <button
      aria-controls={`erp-business-row-items-${recordCacheKey.replace(/[^a-zA-Z0-9_-]/g, '-')}`}
      aria-expanded={expanded}
      aria-label={`${action}${recordLabel}明细，${accessibleTotal}`}
      className="erp-business-row-expand-button"
      title={totalLabel}
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        onExpand(record, event)
      }}
      onDoubleClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {expanded ? <DownOutlined /> : <RightOutlined />}
      <span className="erp-business-row-expand-button__label">
        {totalLabel}
      </span>
    </button>
  )
}

export function useBusinessRowItemsPreview({
  emptyDescription = '暂无明细',
  getCacheKey = businessRowItemsCacheKey,
  getEmbeddedItems,
  getItemFields,
  getItemKey,
  getItemLabel,
  getItemSummary,
  getItemTotal,
  getRecordKey = (record) => record?.id,
  getRecordLabel,
  loadAll,
  loadPreview,
  modalTitle = '查看全部明细',
  previewLimit = BUSINESS_ROW_ITEMS_PREVIEW_LIMIT,
  records = [],
  rowExpandable = () => true,
}) {
  const [entries, setEntries] = useState(() => new Map())
  const [expandedRowKey, setExpandedRowKey] = useState(null)
  const [modalRecord, setModalRecord] = useState(null)
  const [modalPage, setModalPage] = useState(1)
  const entriesRef = useRef(entries)
  const mountedRef = useRef(true)
  const requestsRef = useRef(new Map())
  const configRef = useRef({})
  configRef.current = {
    getCacheKey,
    getEmbeddedItems,
    getItemTotal,
    getRecordKey,
    loadAll,
    loadPreview,
    previewLimit,
    rowExpandable,
  }

  const replaceEntry = useCallback((key, updater) => {
    const nextEntries = new Map(entriesRef.current)
    const nextEntry = updater(nextEntries.get(key) || {})
    nextEntries.set(key, nextEntry)
    entriesRef.current = nextEntries
    if (mountedRef.current) setEntries(nextEntries)
  }, [])

  const abortRequest = useCallback((requestKey) => {
    const request = requestsRef.current.get(requestKey)
    request?.controller.abort()
    requestsRef.current.delete(requestKey)
  }, [])

  const ensureLoaded = useCallback(
    (record, mode = 'preview', { force = false } = {}) => {
      const {
        getCacheKey: resolveCacheKey,
        getEmbeddedItems: resolveEmbeddedItems,
        loadAll: loadAllItems,
        loadPreview: loadPreviewItems,
        previewLimit: limit,
      } = configRef.current
      const key = resolveCacheKey(record)
      const currentEntry = entriesRef.current.get(key) || {}
      const currentLoad = loadState(currentEntry, mode)
      if (!force && currentLoad.status === 'success') {
        return Promise.resolve(currentLoad.data)
      }

      if (
        mode === 'all' &&
        currentEntry.preview?.status === 'success' &&
        currentEntry.preview.data.items.length ===
          currentEntry.preview.data.total
      ) {
        const completeData = currentEntry.preview.data
        replaceEntry(key, (entry) => ({
          ...entry,
          all: successLoadState(completeData),
        }))
        return Promise.resolve(completeData)
      }

      const requestKey = `${key}:${mode}`
      const existingRequest = requestsRef.current.get(requestKey)
      if (!force && existingRequest) return existingRequest.promise
      if (force) abortRequest(requestKey)

      replaceEntry(key, (entry) => ({
        ...entry,
        [mode]: loadingLoadState(entry[mode]),
      }))

      const controller = new AbortController()
      const loader =
        mode === 'all' ? loadAllItems || loadPreviewItems : loadPreviewItems
      const promise = Promise.resolve()
        .then(() => {
          if (typeof resolveEmbeddedItems === 'function') {
            return businessRowEmbeddedItemsSnapshot(
              resolveEmbeddedItems(record),
              limit
            ).all
          }
          if (typeof loader !== 'function') {
            throw new Error('当前页面暂时无法加载明细')
          }
          return loader(record, { signal: controller.signal, limit })
        })
        .then(normalizeBusinessRowItemsResult)
        .then((data) => {
          if (controller.signal.aborted || !mountedRef.current) return data
          replaceEntry(key, (entry) => {
            const nextEntry = {
              ...entry,
              [mode]: successLoadState(data),
            }
            if (mode === 'preview' && data.items.length === data.total) {
              nextEntry.all = successLoadState(data)
            }
            if (mode === 'all') {
              nextEntry.preview = successLoadState({
                items: data.items.slice(0, limit),
                total: data.total,
              })
            }
            return nextEntry
          })
          if (data.total === 0) {
            let recordKey
            try {
              recordKey = configRef.current.getRecordKey(record)
            } catch {
              recordKey = null
            }
            setExpandedRowKey((current) =>
              current !== null && current === recordKey ? null : current
            )
          }
          return data
        })
        .catch((error) => {
          if (
            controller.signal.aborted ||
            isRpcAbortError(error) ||
            !mountedRef.current
          ) {
            return null
          }
          replaceEntry(key, (entry) => ({
            ...entry,
            [mode]: errorLoadState(error, entry[mode]),
          }))
          return null
        })
        .finally(() => {
          if (requestsRef.current.get(requestKey)?.promise === promise) {
            requestsRef.current.delete(requestKey)
          }
        })
      requestsRef.current.set(requestKey, { controller, promise })
      return promise
    },
    [abortRequest, replaceEntry]
  )

  const invalidate = useCallback(
    (record) => {
      if (!record) {
        for (const requestKey of requestsRef.current.keys()) {
          abortRequest(requestKey)
        }
        entriesRef.current = new Map()
        if (mountedRef.current) setEntries(new Map())
        return
      }
      const key = configRef.current.getCacheKey(record)
      abortRequest(`${key}:preview`)
      abortRequest(`${key}:all`)
      const nextEntries = new Map(entriesRef.current)
      nextEntries.delete(key)
      entriesRef.current = nextEntries
      if (mountedRef.current) setEntries(nextEntries)
    },
    [abortRequest]
  )

  const prime = useCallback(
    (record, result) => {
      const key = configRef.current.getCacheKey(record)
      const data = normalizeBusinessRowItemsResult(result)
      replaceEntry(key, (entry) => ({
        ...entry,
        preview: successLoadState({
          items: data.items.slice(0, configRef.current.previewLimit),
          total: data.total,
        }),
        all: successLoadState(data),
      }))
    },
    [replaceEntry]
  )

  useEffect(() => {
    const validCacheKeys = new Set()
    const validRowKeys = new Set()
    const currentRecords = Array.isArray(records) ? records : []
    for (const record of currentRecords) {
      try {
        validCacheKeys.add(configRef.current.getCacheKey(record))
        validRowKeys.add(configRef.current.getRecordKey(record))
      } catch {
        // Invalid rows remain visible in the main table but do not get a preview.
      }
    }

    const nextEntries = new Map(
      [...entriesRef.current].filter(([key]) => validCacheKeys.has(key))
    )
    let entriesChanged = nextEntries.size !== entriesRef.current.size
    if (typeof configRef.current.getEmbeddedItems === 'function') {
      for (const record of currentRecords) {
        let key
        try {
          key = configRef.current.getCacheKey(record)
        } catch {
          continue
        }
        const currentEntry = nextEntries.get(key)
        if (!currentEntry) continue
        let snapshot
        try {
          snapshot = businessRowEmbeddedItemsSnapshot(
            configRef.current.getEmbeddedItems(record),
            configRef.current.previewLimit
          )
        } catch {
          abortRequest(`${key}:preview`)
          abortRequest(`${key}:all`)
          nextEntries.delete(key)
          entriesChanged = true
          continue
        }
        if (
          currentEntry.all?.status === 'success' &&
          currentEntry.all.data.items === snapshot.all.items &&
          currentEntry.all.data.total === snapshot.all.total
        ) {
          continue
        }
        abortRequest(`${key}:preview`)
        abortRequest(`${key}:all`)
        nextEntries.set(key, {
          ...currentEntry,
          all: successLoadState(snapshot.all),
          preview: successLoadState(snapshot.preview),
        })
        entriesChanged = true
      }
    }
    if (entriesChanged) {
      entriesRef.current = nextEntries
      setEntries(nextEntries)
    }
    for (const requestKey of requestsRef.current.keys()) {
      const cacheKey = requestKey.replace(/:(preview|all)$/, '')
      if (!validCacheKeys.has(cacheKey)) abortRequest(requestKey)
    }
    setExpandedRowKey((current) =>
      current !== null && !validRowKeys.has(current) ? null : current
    )
    setModalRecord((current) => {
      if (!current) return current
      try {
        return validCacheKeys.has(configRef.current.getCacheKey(current))
          ? current
          : null
      } catch {
        return null
      }
    })
  }, [abortRequest, records])

  useEffect(() => {
    mountedRef.current = true
    const requests = requestsRef.current
    return () => {
      mountedRef.current = false
      for (const request of requests.values()) {
        request.controller.abort()
      }
      requests.clear()
    }
  }, [])

  const openAll = useCallback(
    (record) => {
      setModalRecord(record)
      setModalPage(1)
      ensureLoaded(record, 'all')
    },
    [ensureLoaded]
  )

  const closeModal = useCallback(() => {
    setModalRecord(null)
    setModalPage(1)
  }, [])

  const modalCacheKey = modalRecord
    ? configRef.current.getCacheKey(modalRecord)
    : ''
  const modalLoad = modalRecord
    ? loadState(entries.get(modalCacheKey), 'all')
    : IDLE_LOAD_STATE
  const modalItems = modalLoad.data?.items || EMPTY_ITEMS
  const modalPageData = useMemo(
    () =>
      businessRowItemsModalPage(
        modalItems,
        modalPage,
        BUSINESS_ROW_ITEMS_MODAL_PAGE_SIZE
      ),
    [modalItems, modalPage]
  )
  const modalRecordLabel = modalRecord
    ? getRecordLabel?.(modalRecord) || ''
    : ''

  const resolveRecordDisclosure = (record) => {
    try {
      const available = Boolean(configRef.current.rowExpandable(record))
      if (!available) {
        return { available: false, expandable: false, itemTotal: undefined }
      }
      const recordCacheKey = configRef.current.getCacheKey(record)
      const entry = entries.get(recordCacheKey)
      const previewTotal = normalizeBusinessRowItemsTotal(
        entry?.preview?.data?.total
      )
      const cachedTotal =
        previewTotal ?? normalizeBusinessRowItemsTotal(entry?.all?.data?.total)
      const itemTotal = resolveBusinessRowItemsTotal({
        cachedTotal,
        getItemTotal: configRef.current.getItemTotal,
        record,
      })
      return {
        available: true,
        expandable: itemTotal !== 0,
        itemTotal,
        recordCacheKey,
      }
    } catch {
      return { available: false, expandable: false, itemTotal: undefined }
    }
  }

  const expandable = {
    columnTitle: '明细',
    columnWidth: 96,
    expandedRowKeys: expandedRowKey === null ? [] : [expandedRowKey],
    expandRowByClick: false,
    onExpand: (expanded, record) => {
      setExpandedRowKey(
        expanded ? configRef.current.getRecordKey(record) : null
      )
    },
    rowExpandable: (record) => resolveRecordDisclosure(record).expandable,
    expandIcon: (props) => {
      const disclosure = resolveRecordDisclosure(props.record)
      return (
        <BusinessRowExpandButton
          available={disclosure.available}
          expanded={props.expanded}
          expandable={disclosure.expandable && props.expandable}
          getRecordLabel={getRecordLabel}
          itemTotal={disclosure.itemTotal}
          onExpand={props.onExpand}
          record={props.record}
          recordCacheKey={disclosure.recordCacheKey || 'unavailable'}
        />
      )
    },
    expandedRowRender: (record) => {
      const recordCacheKey = configRef.current.getCacheKey(record)
      return (
        <BusinessRowItemsPanel
          emptyDescription={emptyDescription}
          entry={entries.get(recordCacheKey)}
          getItemFields={getItemFields}
          getItemKey={getItemKey}
          getItemLabel={getItemLabel}
          getItemSummary={getItemSummary}
          onLoad={(nextRecord) => ensureLoaded(nextRecord, 'preview')}
          onOpenAll={openAll}
          onRetry={(nextRecord) =>
            ensureLoaded(nextRecord, 'preview', { force: true })
          }
          previewLimit={previewLimit}
          record={record}
          recordCacheKey={recordCacheKey}
        />
      )
    },
  }

  const modal = (
    <Modal
      cancelText="关闭"
      footer={
        <Button key="close" onClick={closeModal}>
          关闭
        </Button>
      }
      open={Boolean(modalRecord)}
      title={
        modalRecordLabel ? `${modalTitle} · ${modalRecordLabel}` : modalTitle
      }
      width={1040}
      onCancel={closeModal}
    >
      <section aria-label="完整明细" className="erp-business-row-items-modal">
        <BusinessRowItemsLoadState
          emptyDescription={emptyDescription}
          load={modalLoad}
          onRetry={() =>
            modalRecord && ensureLoaded(modalRecord, 'all', { force: true })
          }
        >
          <BusinessRowItemCards
            getItemFields={getItemFields}
            getItemKey={getItemKey}
            getItemLabel={getItemLabel}
            getItemSummary={getItemSummary}
            items={modalPageData.items}
            record={modalRecord}
            startIndex={(modalPageData.page - 1) * modalPageData.pageSize}
            view="modal"
          />
          {modalItems.length > modalPageData.pageSize ? (
            <Pagination
              current={modalPageData.page}
              pageSize={modalPageData.pageSize}
              showSizeChanger={false}
              total={modalItems.length}
              onChange={setModalPage}
            />
          ) : null}
        </BusinessRowItemsLoadState>
      </section>
    </Modal>
  )

  return { expandable, invalidate, modal, prime }
}
