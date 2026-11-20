import React from 'react'
import { Tag } from 'antd'
import '../../components/workflow/workflowTaskCopy.css'
import '../../components/workflow/workflowTaskIdentity.css'

const ROWS = [0, 1, 2, 3]

function SkeletonBlock({ className = '' }) {
  return <span className={`mobile-role-skeleton__block ${className}`} />
}

export default function MobileTaskListSkeleton() {
  return (
    <div
      className="mobile-role-skeleton mobile-task-card-list"
      data-testid="mobile-role-task-skeleton"
      data-skeleton-row-count={ROWS.length}
      aria-hidden="true"
    >
      {ROWS.map((row) => (
        <div key={row} className="erp-task-card erp-task-card--compact mobile-task-list-row mobile-role-skeleton__row">
          <div className="erp-task-card__content">
            <div className="erp-task-identity erp-task-identity--card">
              <div className="erp-task-identity__card-heading">
                <SkeletonBlock className="mobile-role-skeleton__title" />
                <Tag className="mobile-task-list-status mobile-role-skeleton__block mobile-role-skeleton__status">{'\u00a0'}</Tag>
              </div>
              <div className="erp-task-identity__card-body">
                <SkeletonBlock className="mobile-role-skeleton__image" />
                <div className="erp-task-identity__content">
                  <SkeletonBlock className="mobile-role-skeleton__product" />
                  <span className="erp-task-identity__metadata">
                    <SkeletonBlock className="mobile-role-skeleton__meta" />
                    <SkeletonBlock className="erp-task-identity__source mobile-role-skeleton__source" />
                  </span>
                </div>
              </div>
            </div>
            <div className="erp-task-card__footer mobile-task-list-row__footer">
              <SkeletonBlock className="mobile-role-skeleton__assignee" />
              <SkeletonBlock className="mobile-role-skeleton__time" />
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
