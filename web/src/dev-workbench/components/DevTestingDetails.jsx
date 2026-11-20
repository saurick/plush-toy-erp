import { Button, Drawer } from 'antd'
import { useRef } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'
import '../styles/dev-testing-simplicity.css'

// A single scoped query restores the requested material after returning from a test task.
export default function DevTestingDetails({ id, label = '查看详情', title = label, children, className = '', inline = false }) {
  const { state } = useLocation()
  const [params, setParams] = useSearchParams()
  const open = params.get('testingDetail') === id
  const trigger = useRef(null)
  const select = (nextOpen) => {
    const next = new URLSearchParams(params)
    if (nextOpen) next.set('testingDetail', id)
    else next.delete('testingDetail')
    setParams(next, { replace: true, state })
  }
  if (inline) {
    return (
      <details className={`erp-dev-testing-inline-details ${className}`} open={open}>
        <summary
          ref={trigger}
          aria-expanded={open}
          onKeyDown={(event) => {
          if (open && event.key === 'Escape') { event.stopPropagation(); select(false) }
        }}
          onClick={(event) => { event.preventDefault(); select(!open) }}
        >{label}
        </summary>
        {open ? <div className="erp-dev-testing-detail-content" role="region" aria-label={title}>{children}</div> : null}
      </details>
    )
  }
  return (
    <>
      <Button ref={trigger} type="link" className={className} onClick={() => select(true)}>{label}</Button>
      <Drawer title={title} width={920} open={open} onClose={() => select(false)} afterOpenChange={(visible) => { if (!visible && !params.has('testingDetail')) trigger.current?.focus({ preventScroll: true }) }} rootClassName="erp-dev-testing-detail-drawer" destroyOnHidden>
        {open ? <div className="erp-dev-testing-detail-content">{children}</div> : null}
      </Drawer>
    </>
  )
}
