import React from 'react'
import BusinessCellStack from './BusinessCellStack.jsx'

export default function DeliveryInfoCell({ snapshot }) {
  return (
    <BusinessCellStack
      primary={[snapshot?.recipient, snapshot?.phone].filter(Boolean).join(' ')}
      secondary={[snapshot?.country_region, snapshot?.address].filter(Boolean).join(' ')}
    />
  )
}
