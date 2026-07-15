export const WORKFLOW_TASK_BOARD_LANE_KEYS = Object.freeze([
  'actionable',
  'exception',
  'due',
  'finished',
])

const WORKFLOW_TASK_BOARD_STATUS_KEYS_BY_LANE = Object.freeze({
  actionable: new Set(['ready']),
  exception: new Set(['blocked']),
  due: new Set(['ready']),
  finished: new Set(['done', 'rejected']),
})

function isNonNegativeSafeInteger(value) {
  return Number.isSafeInteger(value) && value >= 0
}

function invalidTaskBoardResponse() {
  throw Object.assign(new Error('任务列表暂时无法显示，请刷新后重试'), {
    isInvalidResponse: true,
  })
}

export function requireWorkflowTaskBoardResponse(response, request = {}) {
  if (!response || typeof response !== 'object' || Array.isArray(response)) {
    return invalidTaskBoardResponse()
  }
  if (
    !isNonNegativeSafeInteger(response.snapshot_at) ||
    !isNonNegativeSafeInteger(response.total) ||
    !response.counts ||
    typeof response.counts !== 'object' ||
    Array.isArray(response.counts) ||
    !Array.isArray(response.lanes) ||
    !Array.isArray(response.source_types)
  ) {
    return invalidTaskBoardResponse()
  }

  const counts = WORKFLOW_TASK_BOARD_LANE_KEYS.map(
    (key) => response.counts[key]
  )
  if (
    counts.some((count) => !isNonNegativeSafeInteger(count)) ||
    counts.reduce((sum, count) => sum + count, 0) !== response.total
  ) {
    return invalidTaskBoardResponse()
  }

  const requestedLaneKey = String(request.lane_key || '').trim()
  const expectedLaneKeys = requestedLaneKey
    ? [requestedLaneKey]
    : WORKFLOW_TASK_BOARD_LANE_KEYS
  if (
    expectedLaneKeys.some(
      (key) => !WORKFLOW_TASK_BOARD_LANE_KEYS.includes(key)
    ) ||
    response.lanes.length !== expectedLaneKeys.length
  ) {
    return invalidTaskBoardResponse()
  }

  const requestedLimit = Number(request.limit)
  const expectedLimit = Number.isSafeInteger(requestedLimit)
    ? Math.min(Math.max(requestedLimit, 1), 50)
    : Number.NaN
  const expectedOffset = Number(request.offset || 0)
  const seenLaneKeys = new Set()
  for (const lane of response.lanes) {
    const key = String(lane?.key || '').trim()
    if (
      !lane ||
      typeof lane !== 'object' ||
      !expectedLaneKeys.includes(key) ||
      seenLaneKeys.has(key) ||
      !isNonNegativeSafeInteger(lane.total) ||
      lane.total !== response.counts[key] ||
      !isNonNegativeSafeInteger(lane.limit) ||
      !isNonNegativeSafeInteger(lane.offset) ||
      (Number.isSafeInteger(expectedLimit) && lane.limit !== expectedLimit) ||
      (Number.isSafeInteger(expectedOffset) &&
        lane.offset !== expectedOffset) ||
      !Array.isArray(lane.tasks) ||
      lane.tasks.length > lane.limit ||
      lane.tasks.some((task) => {
        if (!task || typeof task !== 'object' || Array.isArray(task)) return true
        return (
          !Number.isSafeInteger(task.id) ||
          task.id <= 0 ||
          !Number.isSafeInteger(task.version) ||
          task.version <= 0 ||
          !WORKFLOW_TASK_BOARD_STATUS_KEYS_BY_LANE[key].has(
            task.task_status_key
          )
        )
      })
    ) {
      return invalidTaskBoardResponse()
    }
    seenLaneKeys.add(key)
  }
  if (expectedLaneKeys.some((key) => !seenLaneKeys.has(key))) {
    return invalidTaskBoardResponse()
  }

  const normalizedSourceTypes = response.source_types.map((sourceType) =>
    String(sourceType || '').trim()
  )
  if (
    normalizedSourceTypes.some((sourceType) => !sourceType) ||
    new Set(normalizedSourceTypes).size !== normalizedSourceTypes.length
  ) {
    return invalidTaskBoardResponse()
  }

  return response
}
