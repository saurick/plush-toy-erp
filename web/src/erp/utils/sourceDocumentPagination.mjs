import {
  DEFAULT_RPC_ERROR_MESSAGES,
  RpcErrorCode,
} from '../../common/consts/errorCodes.js'
import { BUSINESS_ROW_ITEMS_PREVIEW_LIMIT } from './businessRowItemsPreview.mjs'

export const SOURCE_DOCUMENT_ITEMS_PREVIEW_LIMIT =
  BUSINESS_ROW_ITEMS_PREVIEW_LIMIT

function invalidSourceDocumentItemsResponse() {
  const error = new Error('服务器返回的单据明细不完整，请核对后重试')
  error.isInvalidResponse = true
  return error
}

function resourceVersionConflict() {
  const error = new Error(
    DEFAULT_RPC_ERROR_MESSAGES[RpcErrorCode.RESOURCE_VERSION_CONFLICT]
  )
  error.code = RpcErrorCode.RESOURCE_VERSION_CONFLICT
  return error
}

function isValidSourceDocumentSnapshot(document) {
  return Boolean(
    document &&
      typeof document === 'object' &&
      typeof document.id === 'number' &&
      Number.isSafeInteger(document.id) &&
      document.id > 0 &&
      typeof document.version === 'number' &&
      Number.isSafeInteger(document.version) &&
      document.version > 0
  )
}

function assertExpectedSourceDocument(document, expectedDocument) {
  if (
    !isValidSourceDocumentSnapshot(document) ||
    document.id !== expectedDocument.id
  ) {
    throw invalidSourceDocumentItemsResponse()
  }
  if (document.version !== expectedDocument.version) {
    throw resourceVersionConflict()
  }
}

export async function listSourceDocumentItemsAtVersion({
  expectedDocument,
  getDocument,
  listItems,
}) {
  if (
    !isValidSourceDocumentSnapshot(expectedDocument) ||
    typeof getDocument !== 'function' ||
    typeof listItems !== 'function'
  ) {
    throw invalidSourceDocumentItemsResponse()
  }

  const before = await getDocument()
  assertExpectedSourceDocument(before, expectedDocument)
  const result = await listItems()
  const after = await getDocument()
  assertExpectedSourceDocument(after, expectedDocument)
  return result
}

export async function listSourceDocumentItemsPreview(
  listPage,
  params,
  itemKey,
  options = {}
) {
  if (typeof listPage !== 'function' || typeof itemKey !== 'string') {
    throw invalidSourceDocumentItemsResponse()
  }

  const previewParams = { ...params }
  delete previewParams.expected_version
  delete previewParams.limit
  delete previewParams.offset
  const data = await listPage(
    {
      ...previewParams,
      limit: SOURCE_DOCUMENT_ITEMS_PREVIEW_LIMIT,
      offset: 0,
    },
    options
  )
  const items = data?.[itemKey]
  const total = data?.total
  const responseLimit = data?.limit
  const responseOffset = data?.offset
  if (
    !Array.isArray(items) ||
    typeof total !== 'number' ||
    !Number.isSafeInteger(total) ||
    total < 0 ||
    typeof responseLimit !== 'number' ||
    !Number.isSafeInteger(responseLimit) ||
    responseLimit !== SOURCE_DOCUMENT_ITEMS_PREVIEW_LIMIT ||
    typeof responseOffset !== 'number' ||
    !Number.isSafeInteger(responseOffset) ||
    responseOffset !== 0 ||
    items.length !== Math.min(total, SOURCE_DOCUMENT_ITEMS_PREVIEW_LIMIT)
  ) {
    throw invalidSourceDocumentItemsResponse()
  }

  const itemIDs = new Set()
  for (const item of items) {
    const itemID = item?.id
    if (
      typeof itemID !== 'number' ||
      !Number.isSafeInteger(itemID) ||
      itemID <= 0 ||
      itemIDs.has(itemID)
    ) {
      throw invalidSourceDocumentItemsResponse()
    }
    itemIDs.add(itemID)
  }

  return data
}

export async function listAllSourceDocumentItems(
  listPage,
  params,
  itemKey,
  options = {}
) {
  const pageSize = 200
  const baseParams = { ...params }
  delete baseParams.limit
  delete baseParams.offset
  let offset = 0
  let expectedTotal = null
  let lastData = {}
  const items = []
  const itemIDs = new Set()

  for (;;) {
    const data = await listPage(
      {
        ...baseParams,
        limit: pageSize,
        offset,
      },
      options
    )
    const page = data?.[itemKey]
    const total = data?.total
    const responseLimit = data?.limit
    const responseOffset = data?.offset
    if (
      !Array.isArray(page) ||
      typeof total !== 'number' ||
      !Number.isSafeInteger(total) ||
      total < 0 ||
      typeof responseLimit !== 'number' ||
      !Number.isSafeInteger(responseLimit) ||
      responseLimit !== pageSize ||
      page.length > responseLimit ||
      typeof responseOffset !== 'number' ||
      !Number.isSafeInteger(responseOffset) ||
      responseOffset !== offset ||
      (expectedTotal !== null && total !== expectedTotal)
    ) {
      throw invalidSourceDocumentItemsResponse()
    }
    expectedTotal ??= total
    lastData = data

    for (const item of page) {
      const itemID = item?.id
      if (
        typeof itemID !== 'number' ||
        !Number.isSafeInteger(itemID) ||
        itemID <= 0 ||
        itemIDs.has(itemID)
      ) {
        throw invalidSourceDocumentItemsResponse()
      }
      itemIDs.add(itemID)
      items.push(item)
    }

    if (items.length > expectedTotal) {
      throw invalidSourceDocumentItemsResponse()
    }
    if (items.length === expectedTotal) {
      return {
        ...lastData,
        [itemKey]: items,
        total: expectedTotal,
        limit: pageSize,
        offset: 0,
      }
    }
    if (page.length === 0 || page.length < pageSize) {
      throw invalidSourceDocumentItemsResponse()
    }
    offset += page.length
  }
}
