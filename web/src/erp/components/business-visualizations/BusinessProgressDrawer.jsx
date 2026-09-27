import React, { useCallback, useEffect, useId, useRef, useState } from 'react'
import { Alert, Button, Drawer, Empty, Spin, Tag } from 'antd'
import { ArrowRightOutlined } from '@ant-design/icons'
import SlidingTabList from '@/common/components/navigation/SlidingTabList'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { getBusinessProgress } from '../../api/businessProgressApi.mjs'
import useLatestRequestCoordinator from '../../hooks/useLatestRequestCoordinator.js'
import { getWorkflowTaskOwnerRoleLabel } from '../../utils/workflowTaskBoard.mjs'
import { getWorkflowTaskDisplayName } from '../../utils/processRuntimePresentation.mjs'
import MobileDetailHeader from '../../mobile/components/MobileDetailHeader.jsx'
import MobileProgressSummary from '../../mobile/components/MobileProgressSummary.jsx'
import BusinessModal from '../business-list/BusinessModal.jsx'
import BusinessProgressSummary from './BusinessProgressSummary.jsx'
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
  const [mobileRecordsOpen, setMobileRecordsOpen] = useState(false)
  const recordsRef = useRef(null)
  const tabID = useId()
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
  useEffect(() => {
    setMobileRecordsOpen(
      Boolean(selection?.section && selection.section !== 'lines')
    )
  }, [requestKey, selection?.section])
  const data =
    state?.key === requestKey && state?.profile === adminProfile
      ? state.data
      : null
  const items = SECTIONS.filter((item) => !data || data.sections[item.key])
  const activeTab = items.some((item) => item.key === tab) ? tab : 'lines'
  const records = data?.sections[activeTab] || []
  const sourcePath = data ? progressSourcePath(data.row, data.row.view) : ''
  const changeSection = (section) => {
    setTab(section)
    onSectionChange?.(section)
  }
  const showSection = (section) => {
    setMobileRecordsOpen(true)
    changeSection(section)
    if (!mobile || mobileRecordsOpen) {
      recordsRef.current?.scrollIntoView({ block: 'start' })
      recordsRef.current?.focus({ preventScroll: true })
    }
  }
  const sourceAction =
    sourcePath && canOpen(sourcePath) ? (
      <Button
        icon={<ArrowRightOutlined />}
        aria-label="打开原单"
        onClick={() => onNavigate(sourcePath)}
      >
        打开原单
      </Button>
    ) : null
  const Surface = mobile ? Drawer : BusinessModal
  const footer = (
    <div
      className={
        mobile
          ? 'mobile-role-action-bar mobile-progress-detail-actions'
          : 'erp-progress-detail-actions'
      }
    >
      <Button onClick={onClose}>返回进度</Button>
      {!mobile && sourceAction}
      {data?.access.tasks && data.sections.tasks && (
        <Button type="primary" onClick={() => showSection('tasks')}>
          查看关联任务
        </Button>
      )}
    </div>
  )
  const surfaceProps = mobile
    ? {
        title: (
          <MobileDetailHeader
            title="进度详情"
            backLabel="返回进度"
            onBack={onClose}
            trailing={
              data ? (
                <Tag className="mobile-task-flow-status">
                  {progressStatusLabel(data.row.status)}
                </Tag>
              ) : null
            }
          />
        ),
        width: '100%',
        onClose,
        closable: false,
        className: 'erp-progress-drawer erp-progress-drawer--mobile',
        classNames: { body: 'mobile-detail-content' },
      }
    : {
        title: `${selection?.orderNo || '订单'} · 完整进度`,
        onCancel: onClose,
        className: 'erp-progress-modal',
        size: 'localAction',
      }
  useEffect(() => {
    if (
      !data ||
      (mobile
        ? !mobileRecordsOpen
        : !selection?.section || selection.section === 'lines')
    ) {
      return undefined
    }
    const frame = requestAnimationFrame(() => {
      recordsRef.current?.scrollIntoView({ block: 'start' })
      recordsRef.current?.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(frame)
  }, [data, selection?.section, mobile, mobileRecordsOpen])
  return (
    <Surface
      {...surfaceProps}
      open={Boolean(selection)}
      destroyOnHidden
      footer={footer}
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
      {mobile && loading && !data ? (
        <div className="mobile-detail-muted" role="status">
          <Spin size="small" /> 正在读取进度…
        </div>
      ) : null}
      {mobile && data ? (
        <>
          <MobileProgressSummary data={data} />
          <button
            type="button"
            className="mobile-progress-detail-toggle"
            aria-expanded={mobileRecordsOpen}
            aria-controls={`${tabID}-records`}
            onClick={() =>
              mobileRecordsOpen
                ? setMobileRecordsOpen(false)
                : showSection(activeTab)
            }
          >
            {mobileRecordsOpen ? '收起业务明细' : '查看业务明细'}
          </button>
        </>
      ) : (
        data && (
          <BusinessProgressSummary
            row={data.row}
            access={data.access}
            sections={data.sections}
            onSelectSection={showSection}
          />
        )
      )}
      <section
        id={`${tabID}-records`}
        ref={recordsRef}
        hidden={mobile && !mobileRecordsOpen}
        className={
          mobile
            ? 'mobile-detail-section mobile-progress-detail-records'
            : 'erp-progress-detail-records'
        }
        aria-label="进度明细"
        tabIndex={-1}
      >
        {mobile && sourceAction ? (
          <div className="mobile-progress-detail-source">{sourceAction}</div>
        ) : null}
        <SlidingTabList
          className="erp-progress-detail-tabs"
          aria-label="进度明细分类"
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="tab"
              id={`${tabID}-${item.key}`}
              aria-controls={`${tabID}-panel`}
              aria-selected={activeTab === item.key}
              onClick={() => changeSection(item.key)}
            >
              {item.label}
            </button>
          ))}
        </SlidingTabList>
        <Spin spinning={loading}>
          {!error && data && (
            <div
              role="tabpanel"
              id={`${tabID}-panel`}
              aria-labelledby={`${tabID}-${activeTab}`}
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
                    activeTab === 'production'
                      ? '暂无关联生产单'
                      : '暂无可见记录'
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
                        <strong>
                          {record.kind === 'task'
                            ? getWorkflowTaskDisplayName({
                                task_name: record.label,
                              })
                            : record.label || record.number}
                        </strong>
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
      </section>
    </Surface>
  )
}
