import { useCallback, useEffect, useState } from 'react'
import { listWorkflowTaskEvents } from '../api/workflowApi.mjs'
import {
  workflowTaskActionAccessRequestIdentity,
  workflowTaskAdminAccessRequestIdentity,
} from '../utils/workflowTaskActionAccess.mjs'

const EMPTY_ITEMS = Object.freeze([])
const emptyPage = (status = 'loading') => ({
  items: EMPTY_ITEMS,
  status,
  truncated: false,
  loadingMore: false,
  pageError: false,
})

function useEventPage(taskID, identity, scope) {
  const [remote, setRemote] = useState({ identity: '', page: emptyPage() })
  const [request, setRequest] = useState({
    identity: '',
    cursor: 0,
    attempt: 0,
  })
  const cursor = request.identity === identity ? request.cursor : 0
  const attempt = request.identity === identity ? request.attempt : 0
  useEffect(() => {
    if (!identity) return undefined
    const controller = new AbortController()
    setRemote((previous) => ({
      identity,
      page:
        cursor && previous.identity === identity
          ? { ...previous.page, loadingMore: true, pageError: false }
          : emptyPage(),
    }))
    listWorkflowTaskEvents(taskID, {
      scope,
      beforeEventId: cursor,
      signal: controller.signal,
    })
      .then((data) => {
        if (controller.signal.aborted) return
        setRemote((previous) => {
          if (previous.identity !== identity) return previous
          const items = cursor
            ? [
                ...new Map(
                  [...previous.page.items, ...data.items].map((item) => [
                    item.id,
                    item,
                  ])
                ).values(),
              ]
            : data.items
          return {
            identity,
            page: { ...emptyPage('ready'), items, truncated: data.truncated },
          }
        })
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setRemote((previous) =>
            previous.identity === identity
              ? {
                  identity,
                  page: cursor
                    ? { ...previous.page, loadingMore: false, pageError: true }
                    : emptyPage('error'),
                }
              : previous
          )
        }
      })
    return () => controller.abort()
  }, [identity, taskID, scope, cursor, attempt])
  const page =
    identity && remote.identity === identity
      ? remote.page
      : emptyPage(identity ? 'loading' : 'idle')
  const retry = useCallback(() => {
    setRequest((previous) => ({
      identity,
      cursor: 0,
      attempt: previous.attempt + 1,
    }))
  }, [identity])
  const loadOlder = useCallback(() => {
    if (!page.truncated || page.loadingMore || !page.items.length) {
      return
    }
    setRemote((previous) =>
      previous.identity === identity
        ? {
            identity,
            page: { ...previous.page, loadingMore: true, pageError: false },
          }
        : previous
    )
    setRequest((previous) => ({
      identity,
      cursor: page.items[page.items.length - 1].id,
      attempt: previous.attempt + 1,
    }))
  }, [identity, page])
  return { ...page, retry, loadOlder }
}

export default function useWorkflowTaskEventRecords({ task, profile }) {
  const { taskID, requestKey: taskKey } =
    workflowTaskActionAccessRequestIdentity(task)
  const adminKey = workflowTaskAdminAccessRequestIdentity(profile)
  const identity = taskKey
    ? `${taskKey}|${adminKey}|${task.source_type}:${task.source_id}:${task.process_instance_id || ''}`
    : ''
  const currentPage = useEventPage(taskID, identity, 'task')
  const flowPage = useEventPage(taskID, identity, 'flow')
  const [selection, setSelection] = useState({ identity: '', value: 'flow' })
  const scope = selection.identity === identity ? selection.value : 'flow'
  const changeScope = useCallback(
    (value) => {
      if (value === 'task' || value === 'flow') {
        setSelection({ identity, value })
      }
    },
    [identity]
  )
  const selectedPage = scope === 'flow' ? flowPage : currentPage
  return {
    task: currentPage,
    flow: flowPage,
    scope,
    changeScope,
    retry: selectedPage.retry,
    loadOlder: selectedPage.loadOlder,
  }
}
