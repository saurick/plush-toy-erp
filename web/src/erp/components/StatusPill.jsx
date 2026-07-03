import React from 'react'
import { STATUS_LABELS, STATUS_STYLES } from '../config/seedData.mjs'

export default function StatusPill({ status }) {
  const normalizedStatus = String(status || '').trim()
  const label =
    STATUS_LABELS[normalizedStatus] || (normalizedStatus ? '业务状态' : '-')
  const style = STATUS_STYLES[normalizedStatus] || STATUS_STYLES.deferred

  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium tracking-[0.12em] ${style}`}
    >
      {label}
    </span>
  )
}
