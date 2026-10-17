import React from 'react'
import { Button, Drawer } from 'antd'
import BusinessRecordDetails from '../business-list/BusinessRecordDetails.jsx'
import BusinessCopyButton from '../business-list/BusinessCopyButton.jsx'
import './productionRecords.css'

export default function ProductionRecordDrawer({
  open,
  onClose,
  title,
  record,
  columns,
  summary,
  actions,
}) {
  return (
    <Drawer
      rootClassName="erp-production-record-drawer"
      title={title}
      open={open}
      onClose={onClose}
      closable={Boolean(onClose)}
      maskClosable={Boolean(onClose)}
      keyboard={Boolean(onClose)}
      width="min(640px, 100vw)"
      destroyOnHidden
      footer={
        <div className="erp-production-record-drawer__actions">
          {actions}
          <Button disabled={!onClose} onClick={onClose}>
            返回列表
          </Button>
        </div>
      }
    >
      <section
        className="erp-production-record-drawer__summary"
        aria-label="当前事项与下一步"
      >
        <div className="erp-production-record-drawer__reference">
          <small>
            {record?.fact_no || record?.decision_no || '记录待核对'}
          </small>
          <BusinessCopyButton
            label="单号"
            value={record?.fact_no || record?.decision_no || ''}
          />
        </div>
        <h3>{summary.title}</h3>
        <p>{summary.next}</p>
      </section>
      <BusinessRecordDetails
        columns={columns.filter(
          (column) => !['fact_no', 'decision_no'].includes(column.dataIndex)
        )}
        record={record}
        column={{ xs: 1, sm: 2, md: 2, lg: 2, xl: 2, xxl: 2 }}
      />
    </Drawer>
  )
}
