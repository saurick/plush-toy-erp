import React from 'react'
import { Button } from 'antd'
import Drawer from '@/common/components/drawer/AppDrawer.jsx'
import BusinessRecordDetails from '../business-list/BusinessRecordDetails.jsx'
import BusinessCopyButton from '../business-list/BusinessCopyButton.jsx'
import BusinessFormPage from '../business-list/BusinessFormPage.jsx'
import useBusinessPageContext from '../../hooks/useBusinessPageContext.js'
import './productionRecords.css'

export default function ProductionRecordDrawer({
  open,
  onClose,
  title,
  record,
  columns,
  summary,
  actions,
  loading = false,
}) {
  const taskBusiness = useBusinessPageContext()?.taskBusiness
  const content = (
    <>
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
    </>
  )
  if (taskBusiness) {
    return (
      <BusinessFormPage
        open={open}
        title={title}
        confirmLoading={loading}
        footer={actions}
        onCancel={onClose}
      >
        {content}
      </BusinessFormPage>
    )
  }
  return (
    <Drawer
      rootClassName="erp-production-record-drawer"
      title={title}
      open={open}
      onClose={onClose}
      closable={Boolean(onClose) && !loading}
      maskClosable={Boolean(onClose) && !loading}
      keyboard={Boolean(onClose) && !loading}
      width="min(640px, 100vw)"
      destroyOnHidden
      footer={
        <div className="erp-production-record-drawer__actions">
          {actions}
          <Button disabled={!onClose || loading} onClick={onClose}>
            返回列表
          </Button>
        </div>
      }
    >
      {content}
    </Drawer>
  )
}
