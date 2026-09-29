import React, { useRef } from 'react'
import TableScrollControls from './TableScrollControls.jsx'

export default function TableScrollRegion({ children, ...props }) {
  const tableRef = useRef(null)
  return (
    <>
      <div {...props} ref={tableRef}>
        {children}
      </div>
      <TableScrollControls tableRef={tableRef} revision={children} />
    </>
  )
}
