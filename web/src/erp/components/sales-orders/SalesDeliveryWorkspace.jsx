import React from 'react'
import { Alert, Button, Space, Spin, Tag } from 'antd'
import { ReloadOutlined } from '@ant-design/icons'
import Empty from '@/common/components/empty/AppEmpty.jsx'
import Drawer from '@/common/components/drawer/AppDrawer'
import Pagination from '@/common/components/pagination/AppPagination'
import AppTable from '@/common/components/table/AppTable'
import { getWorkflowTaskOwnerRoleLabel } from '../../utils/workflowTaskBoard.mjs'
import { progressStatusLabel } from '../../utils/businessProgress.mjs'
import BusinessModal from '../business-list/BusinessModal.jsx'
import MobileDetailHeader from '../../mobile/components/MobileDetailHeader.jsx'
import {
  ProgressDelivery,
  ProgressLineProduct,
  ProgressLineRemaining,
  ProgressLineStatus,
} from '../business-visualizations/ProgressCompactContent.jsx'
import { SALES_DELIVERY_PAGE_SIZE } from './useSalesDeliveryWorkspace.js'
import './salesDeliveryWorkspace.css'

function DeliveryMilestone({ milestone }) {
  const role = getWorkflowTaskOwnerRoleLabel({ owner_role_key: milestone.role })
  const pending = milestone.status === 'ready' || milestone.status === 'blocked'
  return (
    <div className="erp-sales-delivery-item-copy">
      <Space size="small" wrap>
        <strong>{milestone.label}</strong>
        <Tag color={milestone.status === 'blocked' ? 'red' : undefined}>{progressStatusLabel(milestone.status)}</Tag>
      </Space>
      <span>{[role, milestone.assignee || (pending ? '未指定办理人' : ''), milestone.date].filter(Boolean).join(' · ')}</span>
      {milestone.reason && <span>{milestone.reason}</span>}
    </div>
  )
}

function MobileDeliveryLines({ data, pagination }) {
  if (!data.lines.length) return <Empty description="没有可查看的交付明细" />
  return (
    <>
      <ul className="erp-sales-delivery-list" aria-label="本单产品交付明细">
        {data.lines.map((row) => (
          <li key={row.id} className="erp-sales-delivery-list-item erp-sales-delivery-item-copy">
            <ProgressLineProduct row={row} />
            <ProgressLineStatus row={row} snapshotAt={data.snapshot_at} />
            <span>{row.due_date ? `交期 ${row.due_date}` : '未排交期'}</span>
            <ProgressDelivery row={row} />
            <span>剩余待交 <ProgressLineRemaining row={row} /></span>
          </li>
        ))}
      </ul>
      {data.total > SALES_DELIVERY_PAGE_SIZE && <Pagination {...pagination} simple />}
    </>
  )
}

function DeliveryProgress({ data, workspace, mobile }) {
  const columns = [
    {
      title: '产品',
      key: 'product',
      render: (_, row) => <ProgressLineProduct row={row} />,
    },
    { title: '交期', dataIndex: 'due_date', render: (value) => value || '未排交期' },
    { title: '已出货 / 订购', key: 'delivery', render: (_, row) => <ProgressDelivery row={row} showLabel={false} /> },
    { title: '剩余待交', key: 'remaining', render: (_, row) => <ProgressLineRemaining row={row} /> },
    { title: '交付状态', key: 'status', render: (_, row) => <ProgressLineStatus row={row} snapshotAt={data.snapshot_at} /> },
  ]
  const pagination = {
    current: workspace.frame.page,
    pageSize: SALES_DELIVERY_PAGE_SIZE,
    total: data.total,
    showSizeChanger: false,
    hideOnSinglePage: true,
    onChange: workspace.setPage,
  }
  return (
    <div className="erp-sales-delivery-content">
      <div className="erp-sales-delivery-list-item">
        <div className="erp-sales-delivery-item-copy">
          <strong>{data.label}</strong>
          <span>{[data.customer, progressStatusLabel(data.status), data.owner && `跟单人 ${data.owner}`].filter(Boolean).join(' · ')}</span>
        </div>
      </div>
      <section aria-label="当前事项" className="erp-sales-delivery-current">
        <h3>当前事项</h3>
        {data.current
          ? <DeliveryMilestone milestone={data.current} />
          : <span>{data.tasks_available ? '暂无可见待办' : '当前账号无流程查看权限'}</span>}
      </section>
      {mobile ? <MobileDeliveryLines data={data} pagination={pagination} /> : <AppTable
        size="small"
        rowKey="id"
        columns={columns}
        dataSource={data.lines}
        scroll={{ x: 660 }}
        pagination={pagination}
        locale={{ emptyText: '没有可查看的交付明细' }}
        aria-label="本单产品交付明细"
      />}
      {data.recent.length > 0 && (
        <section aria-label="最近处理结果">
          <h3>最近处理结果</h3>
          <ul className="erp-sales-delivery-list">
            {data.recent.map((milestone, index) => (
              <li className="erp-sales-delivery-list-item" key={index}><DeliveryMilestone milestone={milestone} /></li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

export default function SalesDeliveryWorkspace({ workspace, onOpenDashboard, onMobileClose, mobile = false }) {
  const { frame } = workspace
  const content = workspace.detailState
  const body = content?.error
    ? <Alert type="error" showIcon message={content.error} />
    : !content?.data ? <div className="erp-sales-delivery-loading"><Spin /> 正在读取</div>
      : <DeliveryProgress data={content.data} workspace={workspace} mobile={mobile} />
  if (mobile) {
    return (
      <Drawer
        open={Boolean(frame)}
        onClose={onMobileClose || workspace.close}
        width="100%"
        closable={false}
        title={<MobileDetailHeader title="交付进度" backLabel="返回进度" onBack={onMobileClose || workspace.close} />}
        classNames={{ body: 'mobile-detail-content' }}
        footer={<Button block onClick={workspace.loadProgress}>刷新交付进度</Button>}
      >
        {body}
      </Drawer>
    )
  }
  return (
    <BusinessModal
      open={Boolean(frame)}
      title="交付进度"
      width={940}
      onCancel={workspace.close}
      className="erp-sales-delivery-modal"
      footer={
        <Space wrap>
          {onOpenDashboard && content?.data && (
            <Button onClick={() => {
              workspace.close()
              onOpenDashboard(content.data.order_id)
            }}
            >在进度看板查看
            </Button>
          )}
          <Button icon={<ReloadOutlined aria-hidden="true" />} onClick={workspace.loadProgress}>刷新</Button>
          <Button onClick={workspace.close}>关闭</Button>
        </Space>
      }
    >
      {body}
    </BusinessModal>
  )
}
