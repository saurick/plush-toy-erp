import React, { useCallback, useEffect, useRef, useState } from 'react'
import WorkflowExceptionPanel from '../../components/workflow/WorkflowExceptionPanel.jsx'
import { normalizeTaskDiscoveryFilters } from '../../utils/workflowTaskDiscovery.mjs'
import MobileTaskPullRefresh from './MobileTaskPullRefresh.jsx'

const HISTORY_KEY = 'mobileWorkflowExceptions'

export default function MobileWorkflowExceptionPanel({ accessScope, profile, onOpenTask, scrollContainerRef }) {
  const [initialQuery] = useState(() => {
    const saved = window.history.state?.[HISTORY_KEY]
    const query = saved?.accessScope === accessScope ? saved.query : null
    return {
      filters: normalizeTaskDiscoveryFilters(query?.filters || {}),
      keyword: String(query?.keyword || '').trim().slice(0, 100),
      state: ['open', 'closed'].includes(query?.state) ? query.state : '',
      view: ['tasks', 'orders'].includes(query?.view) ? query.view : '',
      loadedCount: Number.isSafeInteger(query?.loadedCount) && query.loadedCount > 0 ? query.loadedCount : 20,
      scrollTop: Number.isFinite(query?.scrollTop) && query.scrollTop > 0 ? query.scrollTop : 0,
      listPosition: query?.listPosition ? {
        page: 1,
        loadedCount: Number.isSafeInteger(query.listPosition.loadedCount) && query.listPosition.loadedCount > 0 ? query.listPosition.loadedCount : 20,
        scrollTop: Number.isFinite(query.listPosition.scrollTop) && query.listPosition.scrollTop > 0 ? query.listPosition.scrollTop : 0,
      } : null,
    }
  })
  const queryRef = useRef(initialQuery)
  const positionRef = useRef(initialQuery.scrollTop)
  const rememberQuery = useCallback((query) => {
    queryRef.current = query
    window.history.replaceState({
      ...window.history.state,
      [HISTORY_KEY]: { accessScope, query: { ...query, scrollTop: positionRef.current } },
    }, '')
  }, [accessScope])
  useEffect(() => {
    const container = scrollContainerRef?.current
    if (!container) return undefined
    const rememberScroll = () => {
      positionRef.current = container.scrollTop
      rememberQuery(queryRef.current)
    }
    container.addEventListener('scroll', rememberScroll, { passive: true })
    return () => container.removeEventListener('scroll', rememberScroll)
  }, [rememberQuery, scrollContainerRef])

  return (
    <div className="mobile-workspace-exceptions">
      <WorkflowExceptionPanel
        compact
        profile={profile}
        initialQuery={initialQuery}
        onQueryChange={rememberQuery}
        onOpenTask={(task) => {
          positionRef.current = scrollContainerRef?.current?.scrollTop || 0
          rememberQuery(queryRef.current)
          onOpenTask?.(task.id)
        }}
        scrollContainerRef={scrollContainerRef}
        renderRefreshControl={({ key, ...controls }) => <MobileTaskPullRefresh key={key} {...controls} scrollContainerRef={scrollContainerRef} />}
      />
    </div>
  )
}
