import React from 'react'
import OutsourcingOrderHandlingItems from '../../components/outsourcing-orders/OutsourcingOrderHandlingItems.jsx'

export default function MobileOutsourcingTaskActions({ record, load, getItemFields, refreshKey }) {
  return (
    <section className="mobile-outsourcing-task-actions" data-testid="mobile-outsourcing-task-actions">
      <OutsourcingOrderHandlingItems record={record} load={load} getItemFields={getItemFields} refreshKey={refreshKey} summaryOnly />
    </section>
  )
}
