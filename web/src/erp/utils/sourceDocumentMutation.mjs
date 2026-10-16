export function isResourceVersionConflict(error) {
  return Number(error?.code || 0) === 40922
}

export function isMutationResultUnknown(error) {
  const httpStatus = Number(error?.httpStatus || 0)
  return Boolean(
    error?.isNetworkError ||
      error?.isAbortError ||
      error?.isInvalidResponse ||
      httpStatus === 408 ||
      httpStatus >= 500 ||
      Number(error?.code || 0) >= 50000
  )
}

function invalidSourceDocumentItemsResponse() {
  const error = new Error('服务器返回的单据明细不完整，请重新打开后再编辑')
  error.isInvalidResponse = true
  return error
}

const SOURCE_DOCUMENT_OPEN_EDIT_REQUEST_KEY = 'source-document-open-edit'

function requestIsCurrent(isCurrent) {
  return typeof isCurrent !== 'function' || isCurrent()
}

export async function openSourceDocumentEditAfterItemsLoaded({
  loadItems,
  enterEditing,
  isCurrent,
}) {
  let items
  try {
    items = await loadItems()
  } catch (error) {
    if (!requestIsCurrent(isCurrent)) {
      return { status: 'stale' }
    }
    return { status: 'load_failed', error }
  }

  if (!requestIsCurrent(isCurrent)) {
    return { status: 'stale' }
  }
  if (!Array.isArray(items)) {
    return {
      status: 'load_failed',
      error: invalidSourceDocumentItemsResponse(),
    }
  }

  // Editing identity and form values become writable only after the complete
  // line-item read succeeds. An empty array is a valid read, not a read error.
  enterEditing(items)
  return { status: 'ready', items }
}

export function createSourceDocumentOpenEditController({
  beginLatestRequest,
  setLoading = () => {},
}) {
  if (typeof beginLatestRequest !== 'function') {
    throw new TypeError('beginLatestRequest must be a function')
  }

  return {
    invalidate() {
      const invalidation = beginLatestRequest(
        SOURCE_DOCUMENT_OPEN_EDIT_REQUEST_KEY
      )
      invalidation.finish()
      setLoading(false)
    },
    async open({ loadItems, enterEditing }) {
      const request = beginLatestRequest(SOURCE_DOCUMENT_OPEN_EDIT_REQUEST_KEY)
      setLoading(true)
      try {
        return await openSourceDocumentEditAfterItemsLoaded({
          loadItems: () => loadItems({ signal: request.signal }),
          enterEditing,
          isCurrent: request.isCurrent,
        })
      } finally {
        if (request.isCurrent()) {
          setLoading(false)
          request.finish()
        }
      }
    },
  }
}

export async function openSourceDocumentEditWithAccessGate({
  canUpdate,
  document,
  invalidatePending,
  isEditable,
  open,
}) {
  const blocked = (reason) => {
    invalidatePending?.()
    return { status: 'blocked', reason }
  }
  if (!document?.id) {
    return blocked('missing_document')
  }
  if (canUpdate !== true) {
    return blocked('forbidden')
  }
  if (typeof isEditable !== 'function' || !isEditable(document)) {
    return blocked('not_editable')
  }
  if (typeof open !== 'function') {
    throw new TypeError('open must be a function')
  }
  return open()
}

export function isOpenSourceDocumentItem(item) {
  return (
    String(item?.line_status || '')
      .trim()
      .toLowerCase() === 'open'
  )
}

export function selectOpenSourceDocumentItems(items) {
  if (!Array.isArray(items)) {
    throw invalidSourceDocumentItemsResponse()
  }
  return items.filter(isOpenSourceDocumentItem)
}

export function selectSourceDocumentItemsForSave(items) {
  if (!Array.isArray(items)) {
    return []
  }
  return items.filter((item) => {
    const lineStatus = String(item?.line_status || '')
      .trim()
      .toLowerCase()
    if (lineStatus && lineStatus !== 'open') {
      return false
    }
    const itemID = Number(item?.id || 0)
    return !Number.isSafeInteger(itemID) || itemID <= 0 || lineStatus === 'open'
  })
}

export function buildSourceDocumentItemSaveParams(items, buildItemParams) {
  if (typeof buildItemParams !== 'function') {
    throw new TypeError('buildItemParams must be a function')
  }
  return selectSourceDocumentItemsForSave(items).map((item, index) => {
    const itemID = item?.id
    return buildItemParams(item, {
      ...(Number.isSafeInteger(itemID) && itemID > 0 ? { id: itemID } : {}),
      line_no: index + 1,
    })
  })
}

export async function commitSourceDocumentSaveResult({ save, bindSaved }) {
  let saved
  try {
    saved = await save()
  } catch (error) {
    return { status: 'save_failed', error }
  }

  // Bind the durable identity outside the mutation catch. Later UI I/O must not
  // turn an accepted save into a second create attempt or a mutation-unknown state.
  bindSaved(saved)
  return { status: 'saved', saved }
}

export async function settleSourceDocumentPostSaveEffect(run) {
  try {
    return { status: 'fulfilled', value: await run() }
  } catch (error) {
    return { status: 'rejected', error }
  }
}
