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
    invalidResponseMessage = '服务器返回的列表不完整，请刷新后重试',
    recordIdentityKey,
  } = {}
) {
  const invalidResponse = () => invalidPaginatedResponse(invalidResponseMessage)
  const usesCustomIdentity = recordIdentityKey !== undefined
  if (
    typeof listPage !== 'function' ||
    typeof recordKey !== 'string' ||
    (usesCustomIdentity && typeof recordIdentityKey !== 'function')
  ) {
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
      let recordID
      try {
        recordID = usesCustomIdentity ? recordIdentityKey(record) : record?.id
      } catch {
        throw invalidResponse()
      }
      const validRecordIdentity = usesCustomIdentity
        ? typeof recordID === 'string' && recordID.trim().length > 0
        : Number.isSafeInteger(recordID) && recordID > 0
      if (!validRecordIdentity || recordIDs.has(recordID)) {
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

// Exact reference reads keep historical records and the endpoint's permission
// filters. Chunk the requested set rather than scanning unrelated catalog rows.
export async function listReferenceRecordsByIDs(
  listPage, params, recordKey, ids, options = {},
  { filterKey = 'ids', referenceKey = 'id' } = {}
) {
  const uniqueIDs = [...new Set(ids.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))]
  const records = new Map()
  for (let offset = 0; offset < uniqueIDs.length; offset += REFERENCE_PAGE_SIZE) {
    const batch = uniqueIDs.slice(offset, offset + REFERENCE_PAGE_SIZE)
    const requested = new Set(batch)
    const data = await listAllReferenceRecords(
      listPage, { ...params, [filterKey]: batch }, recordKey, options
    )
    for (const record of data[recordKey]) {
      if (!requested.has(Number(record[referenceKey]))) {
        throw invalidPaginatedResponse('服务器返回的关联资料不正确，请刷新后重试')
      }
      records.set(record.id, record)
    }
  }
  return { [recordKey]: [...records.values()] }
}
