import React from 'react'
import { ReloadOutlined } from '@ant-design/icons'
import MobileTaskListSkeleton from './MobileTaskListSkeleton.jsx'

export default function MobileTaskListContent({
  loading,
  pending,
  initialLoading,
  label,
  children,
}) {
  return (
    <div
      className="mobile-task-list min-w-0"
      data-testid="mobile-role-task-list"
      aria-busy={loading || pending ? 'true' : 'false'}
    >
      {pending ? (
        initialLoading ? (
          <>
            <span className="erp-sr-only" role="status" aria-live="polite">{label}</span>
            <MobileTaskListSkeleton />
          </>
        ) : (
          <div
            className="mobile-task-list-loading"
            data-testid="mobile-role-task-list-loading"
            role="status"
            aria-live="polite"
          >
            <ReloadOutlined aria-hidden="true" />
            <span>{label}</span>
          </div>
        )
      ) : children}
    </div>
  )
}
