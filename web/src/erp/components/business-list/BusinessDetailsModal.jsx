import React, { useEffect, useRef, useState } from 'react'
import { RedoOutlined } from '@ant-design/icons'
import { Alert, Button, Spin } from 'antd'
import Empty from '@/common/components/empty/AppEmpty.jsx'

import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { isRpcAbortError } from '@/common/utils/jsonRpc'
import { ERP_MODAL_WIDTHS } from '../../utils/modalSizes.mjs'
import BusinessFormModal from './BusinessFormModal.jsx'
import { BusinessHelpLabel } from '../help/BusinessContextHelp.jsx'
import BusinessDetailsPagination, {
  BUSINESS_DETAILS_PAGE_SIZE,
} from './BusinessDetailsPagination.jsx'
import BusinessRowItemCards from './BusinessRowItemCards.jsx'
import BusinessRecordDetails from './BusinessRecordDetails.jsx'
import BusinessFormSection from './BusinessFormSection.jsx'
import BusinessDetailItemGroups from './BusinessDetailItemGroups.jsx'

const EMPTY_LINE_ITEMS = Object.freeze([])

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
  const [pageSize, setPageSize] = useState(BUSINESS_DETAILS_PAGE_SIZE)
  const [retryKey, setRetryKey] = useState(0)
  const [expandedPages, setExpandedPages] = useState({})

  useEffect(() => {
    setPage(1)
    setPageSize(BUSINESS_DETAILS_PAGE_SIZE)
    setExpandedPages({})
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
    expandedGroups: expandedPages[`${pageSize}:${page}`],
    changeExpandedGroups: (groups) => setExpandedPages((previous) => ({
      ...previous,
      [`${pageSize}:${page}`]: groups,
    })),
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
  const grouped = typeof config.getItemGroup === 'function' && loadState.items.length > 1
  const sectionTitle = loadState.status === 'success' && loadState.items.length > 0
    ? `${title}（共 ${loadState.items.length} 条）`
    : title
  return (
    <div ref={contentRef}>
      <BusinessFormSection
        title={sectionTitle}
        showHeading={!grouped}
        layout="content"
      >
        {loadState.status === 'success' && loadState.items.length === 0 ? (
          <Empty description={emptyDescription} />
        ) : null}
        {loadState.status === 'loading' || loadState.status === 'idle' ? (
          <div className="erp-business-detail-items__loading">
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
        {loadState.status === 'success' && pageItems.length > 0 ? (
          grouped ? (
            <BusinessDetailItemGroups
              config={config}
              items={pageItems}
              record={record}
              startIndex={pageStart}
              title={sectionTitle}
              total={loadState.items.length}
              expandedGroups={state.expandedGroups}
              onExpandedGroupsChange={state.changeExpandedGroups}
            />
          ) : (
            <div className="erp-business-detail-items__items">
              <BusinessRowItemCards
                getItemFields={getItemFields}
                getItemKey={getItemKey}
                getItemLabel={getItemLabel}
                getItemSummary={getItemSummary}
                items={pageItems}
                record={record}
                startIndex={pageStart}
              />
            </div>
          )
        ) : null}
      </BusinessFormSection>
    </div>
  )
}

export default function BusinessDetailsModal({
  children,
  extraActions,
  columns = [],
  description,
  descriptionInHelp = false,
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

  return (
    <BusinessFormModal
      className="erp-business-details-modal"
      description={descriptionInHelp ? undefined : description}
      destroyOnHidden
      footer={
        <>
          {extraActions}
          {lineItems && lineItemsState.loadState.status === 'success' && lineItemsState.loadState.items.length > 0 ? (
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
      title={descriptionInHelp ? <BusinessHelpLabel label={title} description={description} /> : title}
      width={width}
      onCancel={onClose}
    >
      {lineItems ? (
        <BusinessFormSection title="单据信息" layout="content">
          <BusinessRecordDetails columns={columns} record={record} />
        </BusinessFormSection>
      ) : <BusinessRecordDetails columns={columns} record={record} />}
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
