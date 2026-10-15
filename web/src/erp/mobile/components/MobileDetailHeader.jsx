import { useEffect, useRef } from 'react'
import { LeftOutlined } from '@ant-design/icons'

export default function MobileDetailHeader({
  title,
  backLabel,
  onBack,
  busy = false,
  trailing = null,
  children = null,
}) {
  const titleRef = useRef(null)

  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true })
  }, [])

  return (
    <header className="mobile-role-detail-header mobile-task-flow-header">
      <div className="mobile-task-flow-topbar">
        <button
          type="button"
          className="mobile-task-flow-back"
          aria-label={backLabel}
          disabled={busy}
          onClick={onBack}
        >
          <LeftOutlined aria-hidden="true" />
        </button>
        <h1 ref={titleRef} className="mobile-task-flow-title" tabIndex={-1}>
          {title}
        </h1>
        <div className="mobile-task-flow-trailing">{trailing}</div>
      </div>
      {children}
    </header>
  )
}
