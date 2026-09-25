import React, { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Drawer, Empty, Spin, Tag } from 'antd'
import { ArrowLeftOutlined, ArrowRightOutlined } from '@ant-design/icons'
import SlidingTabs from '@/common/components/navigation/SlidingTabs'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { getBusinessProgress } from '../../api/businessProgressApi.mjs'
import useLatestRequestCoordinator from '../../hooks/useLatestRequestCoordinator.js'
import { getWorkflowTaskOwnerRoleLabel } from '../../utils/workflowTaskBoard.mjs'
import {
  progressSourcePath,
  progressStatusLabel,
} from '../../utils/businessProgress.mjs'

const SECTIONS = [
  { key: 'lines', label: '产品明细' },
  { key: 'production', label: '生产单' },
  { key: 'batches', label: '工序批次' },
  { key: 'materials', label: '领料' },
  { key: 'tasks', label: '关联任务' },
]

export default function BusinessProgressDrawer({
  selection,
  onClose,
  adminProfile,
  canOpen,
  onNavigate,
  mobile = false,
  onOpenTask,
  onOpenProduction,
  onSectionChange,
}) {
  const begin = useLatestRequestCoordinator()
  const [state, setState] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('lines')
  const requestKey = selection ? `${selection.view}:${selection.id}` : ''
  const selectedID = selection?.id
  const selectedView = selection?.view
  const load = useCallback(async () => {
    const request = begin('progress-detail')
    if (!selectedID || !adminProfile?.id) {
      request.finish()
      return false
    }
    setLoading(true)
    setError('')
    try {
      const data = await getBusinessProgress(
        { view: selectedView, id: selectedID },
        { signal: request.signal }
      )
      if (!request.isCurrent()) return false
      setState({ key: requestKey, profile: adminProfile, data })
      return true
    } catch (failure) {
      if (request.isCurrent()) {
        setState(null)
        setError(getActionErrorMessage(failure, '查看进度明细'))
      }
      return false
    } finally {
      if (request.isCurrent()) {
        setLoading(false)
        request.finish()
      }
    }
  }, [adminProfile, begin, requestKey, selectedID, selectedView])
  useEffect(() => {
    setState(null)
    load()
    return () => {
      const request = begin('progress-detail')
      request.finish()
    }
  }, [begin, load])
  useEffect(() => {
    setTab(selection?.section || 'lines')
  }, [requestKey, selection?.section])
  const data =
    state?.key === requestKey && state?.profile === adminProfile
      ? state.data
      : null
  const items = SECTIONS.filter((item) => !data || data.sections[item.key])
  const activeTab = items.some((item) => item.key === tab) ? tab : 'lines'
  const records = data?.sections[activeTab] || []
  const sourcePath = data ? progressSourcePath(data.row, data.row.view) : ''
  return (
    <Drawer
      title={selection?.orderNo || '进度明细'}
      open={Boolean(selection)}
      onClose={onClose}
      width={mobile ? '100%' : 680}
      closeIcon={
        mobile ? <ArrowLeftOutlined aria-label="返回进度" /> : undefined
      }
      className={`erp-progress-drawer${mobile ? ' erp-progress-drawer--mobile' : ''}`}
      destroyOnHidden
      extra={
        sourcePath && canOpen(sourcePath) ? (
          <Button
            icon={<ArrowRightOutlined />}
            aria-label="打开原单"
            onClick={() => onNavigate(sourcePath)}
          >
            打开原单
          </Button>
        ) : null
      }
    >
      {error && (
        <Alert
          type="error"
          showIcon
          message={error}
          action={
            <Button size="small" onClick={load} aria-label="重试">
              重试
            </Button>
          }
        />
      )}
      {data && (
        <div className="erp-progress-detail-summary">
          <strong>
            {data.row.product}
            {data.row.product_count > 1
              ? ` 等 ${data.row.product_count} 项`
              : ''}
          </strong>
          <span>
            {[
              data.row.customer,
              progressStatusLabel(data.row.status),
              data.row.due_date ? `交期 ${data.row.due_date}` : '尚未确定交期',
            ]
              .filter(Boolean)
              .join(' · ')}
          </span>
          {data.row.attention_reason && (
            <p className="erp-progress-danger">
              当前阻塞：{data.row.attention_reason}
            </p>
          )}
        </div>
      )}
      <SlidingTabs
        activeKey={activeTab}
        onChange={(section) => {
          setTab(section)
          onSectionChange?.(section)
        }}
        items={items}
        aria-label="进度明细分类"
      />
      <Spin spinning={loading}>
        {!error && data && (
          <div
            role="region"
            aria-label={items.find((item) => item.key === activeTab)?.label}
          >
            {activeTab === 'materials' && (
              <p className="erp-progress-hint">
                按已登记领料与计划用量核对。尚未领齐不代表库存缺料；采购到货需到相关业务中核对。
              </p>
            )}
            {activeTab === 'tasks' && (
              <p className="erp-progress-hint">
                仅显示当前账号可见的关联任务。任务完成不代表已经生产、入库或出货。
              </p>
            )}
            {records.length === 0 ? (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={
                  activeTab === 'production' ? '暂无关联生产单' : '暂无可见记录'
                }
              />
            ) : (
              records.map((record) => {
                const path = progressSourcePath(record, selection?.view)
                return (
                  <article
                    className="erp-progress-record"
                    key={`${record.kind}:${record.id}`}
                  >
                    <div className="erp-progress-record-main">
                      <strong>{record.label || record.number}</strong>
                      <span>
                        {record.label && record.number ? record.number : ''}
                        {record.quantity
                          ? ` · ${record.quantity} ${record.unit}`
                          : ''}
                      </span>
                      {record.note && <p>{record.note}</p>}
                      {record.kind === 'task' && (
                        <span>
                          {record.owner || '未分配处理人'} ·{' '}
                          {getWorkflowTaskOwnerRoleLabel({
                            owner_role_key: record.role,
                          })}
                        </span>
                      )}
                      {record.date && (
                        <span>
                          {record.kind === 'batch' ? '更新 ' : '日期 '}
                          {record.date}
                        </span>
                      )}
                    </div>
                    <div className="erp-progress-record-actions">
                      {record.status && (
                        <Tag
                          color={
                            ['blocked', 'REJECTED'].includes(record.status)
                              ? 'red'
                              : undefined
                          }
                        >
                          {progressStatusLabel(record.status)}
                        </Tag>
                      )}
                      {canOpen(path) && (
                        <Button
                          type="link"
                          size="small"
                          onClick={() => onNavigate(path)}
                          aria-label={`查看 ${record.number || record.label}`}
                        >
                          查看 <ArrowRightOutlined />
                        </Button>
                      )}
                      {mobile && record.kind === 'task' && onOpenTask && (
                        <Button
                          onClick={() => onOpenTask(record.id)}
                          aria-label={`查看任务 ${record.number || record.label}`}
                        >
                          查看任务
                        </Button>
                      )}
                      {mobile &&
                        record.kind === 'production' &&
                        onOpenProduction && (
                          <Button onClick={() => onOpenProduction(record)}>
                            查看生产进度
                          </Button>
                        )}
                    </div>
                  </article>
                )
              })
            )}
            {data.has_more[activeTab] && (
              <p className="erp-progress-hint">
                此处展示前 100 条，请进入原业务页面查看完整记录。
              </p>
            )}
          </div>
        )}
      </Spin>
    </Drawer>
  )
}
