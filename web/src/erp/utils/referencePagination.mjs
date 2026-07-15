export const REFERENCE_PAGE_SIZE = 200

function invalidPaginatedResponse(message) {
  const error = new Error(message)
  error.isInvalidResponse = true
  return error
}

export async function listAllPaginatedRecords(
  listPage,
  params,
  recordKey,
  options = {},
  {
    invalidResponseMessage =
      '服务器返回的列表不完整，请刷新后重试',
  } = {}
) {
  const invalidResponse = () =>
    invalidPaginatedResponse(invalidResponseMessage)
  if (typeof listPage !== 'function' || typeof recordKey !== 'string') {
    throw invalidResponse()
  }

  const baseParams = { ...(params || {}) }
  delete baseParams.limit
  delete baseParams.offset
  let offset = 0
  let expectedTotal = null
  let lastData = {}
  const records = []
  const recordIDs = new Set()

  for (;;) {
    const data = await listPage(
      { ...baseParams, limit: REFERENCE_PAGE_SIZE, offset },
      options
    )
    const page = data?.[recordKey]
    const total = data?.total
    const responseLimit = data?.limit
    const responseOffset = data?.offset
    if (
      !Array.isArray(page) ||
      !Number.isSafeInteger(total) ||
      total < 0 ||
      responseLimit !== REFERENCE_PAGE_SIZE ||
      !Number.isSafeInteger(responseOffset) ||
      responseOffset !== offset ||
      page.length > REFERENCE_PAGE_SIZE ||
      (expectedTotal !== null && total !== expectedTotal)
    ) {
      throw invalidResponse()
    }

    expectedTotal ??= total
    lastData = data
    for (const record of page) {
      const recordID = record?.id
      if (
        !Number.isSafeInteger(recordID) ||
        recordID <= 0 ||
        recordIDs.has(recordID)
      ) {
        throw invalidResponse()
      }
      recordIDs.add(recordID)
      records.push(record)
    }

    if (records.length > expectedTotal) {
      throw invalidResponse()
    }
    if (records.length === expectedTotal) {
      return {
        ...lastData,
        [recordKey]: records,
        total: expectedTotal,
        limit: REFERENCE_PAGE_SIZE,
        offset: 0,
      }
    }
    if (page.length < REFERENCE_PAGE_SIZE) {
      throw invalidResponse()
    }
    offset += page.length
  }
}

export async function listAllReferenceRecords(
  listPage,
  params,
  recordKey,
  options = {}
) {
  return listAllPaginatedRecords(listPage, params, recordKey, options, {
    invalidResponseMessage: '服务器返回的基础资料列表不完整，请刷新后重试',
  })
}
