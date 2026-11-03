import React, { useRef } from 'react'
import TableScrollControls from './TableScrollControls.jsx'
import TableStickyHeader from './TableStickyHeader.jsx'

export default function TableScrollRegion({ children, useToolbar = false, stickyHeader = false, ...props }) {
  const tableRef = useRef(null)
  const content = (
    <>
      <div {...props} ref={tableRef}>
        {children}
      </div>
      {stickyHeader ? <TableStickyHeader tableRef={tableRef} revision={children} /> : null}
      <TableScrollControls tableRef={tableRef} revision={children} useToolbar={useToolbar} />
    </>
  )
  return stickyHeader ? <div className="app-table-sticky-region">{content}</div> : content
}
