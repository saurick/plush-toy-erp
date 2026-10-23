import React, {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { Alert, Button, Drawer, Empty, Spin, Tag } from 'antd'
import {
  ArrowRightOutlined,
  DownOutlined,
  RightOutlined,
} from '@ant-design/icons'
import MobileBackToTop from '@/common/components/scroll/MobileBackToTop'
import SlidingTabList from '@/common/components/navigation/SlidingTabList'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { getBusinessProgress } from '../../api/businessProgressApi.mjs'
import useLatestRequestCoordinator from '../../hooks/useLatestRequestCoordinator.js'
import { getWorkflowTaskOwnerRoleLabel } from '../../utils/workflowTaskBoard.mjs'
import { getWorkflowTaskDisplayName } from '../../utils/processRuntimePresentation.mjs'
import MobileDetailHeader from '../../mobile/components/MobileDetailHeader.jsx'
import MobileProgressSummary from '../../mobile/components/MobileProgressSummary.jsx'
import BusinessModal from '../business-list/BusinessModal.jsx'
import BusinessProgressSummary, {
  BusinessProgressHeader,
} from './BusinessProgressSummary.jsx'
import ProductIdentity from '../master-data/ProductIdentity.jsx'
import {
  progressSourcePath,
  progressStatusLabel,
} from '../../utils/businessProgress.mjs'

const SECTIONS = [
  { key: 'overview', label: '进度总览' },
  { key: 'lines', label: '产品明细' },
  { key: 'production', label: '生产单' },
  { key: 'batches', label: '工序批次' },
  { key: 'materials', label: '领料' },
  { key: 'tasks', label: '关联任务' },
]

const PRODUCTION_SECTIONS = ['production', 'batches', 'materials']
const MOBILE_TABS = [
  { key: 'overview', label: '总览' },
  { key: 'lines', label: '产品' },
  { key: 'execution', label: '生产' },
  { key: 'tasks', label: '任务' },
]

const SUPPRESS_OPEN_MOTION = Object.freeze({
  motionAppear: false,
  motionEnter: false,
})

export default function BusinessProgressDrawer({
  selection,
  onClose,
  adminProfile,
  canOpen,
  onNavigate,
  mobile = false,
  suppressOpenMotion = false,
  onOpenTask,
  onOpenProduction,
  onSectionChange,
  onRememberContext,
}) {
  const begin = useLatestRequestCoordinator()
  const [state, setState] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('overview')
  const [productionOpen, setProductionOpen] = useState(true)
  const recordsRef = useRef(null)
  const headingRef = useRef(null)
  const contextRef = useRef(new Map())
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
    contextRef.current.clear()
  }, [adminProfile])
  useLayoutEffect(() => {
    const previous = contextRef.current.get(requestKey)
    setTab(selection?.section || previous?.section || 'overview')
    setProductionOpen(
      previous?.productionOpen ?? selection?.productionOpen ?? true
    )
  }, [requestKey, selection?.section, selection?.productionOpen])
  const data =
    state?.key === requestKey && state?.profile === adminProfile
      ? state.data
      : null
  const focusHeading = useCallback(() => {
    const heading = headingRef.current
    if (heading && !heading.closest('[role="dialog"]')?.contains(document.activeElement)) {
      heading.focus({ preventScroll: true })
    }
  }, [])
  useLayoutEffect(() => {
    if (data && !mobile) focusHeading()
  }, [data, focusHeading, mobile])
  const sectionRecords = (section) => data?.sections?.[section] || []
  const items = SECTIONS.filter(
    (item) =>
      item.key === 'overview' ||
      !data ||
      (data.sections[item.key] &&
        (item.key !== 'tasks' || data.access.tasks) &&
        (item.key !== 'batches' || data.access.wip) &&
        (!['production', 'materials'].includes(item.key) ||
          data.access.production))
  )
  const activeTab = items.some((item) => item.key === tab) ? tab : 'overview'
  const productionSections = items.filter((item) =>
    PRODUCTION_SECTIONS.includes(item.key)
  )
  const mobileItems = MOBILE_TABS.filter((item) =>
    item.key === 'execution'
      ? productionSections.length > 0
      : items.some((section) => section.key === item.key)
  )
  const navigationTab =
    mobile && PRODUCTION_SECTIONS.includes(activeTab) ? 'execution' : activeTab
  const rememberContext = (changes) => {
    if (!requestKey) return
    contextRef.current.set(requestKey, {
      ...contextRef.current.get(requestKey),
      ...changes,
    })
    if (contextRef.current.size > 20) {
      contextRef.current.delete(contextRef.current.keys().next().value)
    }
  }
  const changeSection = (section) => {
    const next =
      section === 'execution'
        ? PRODUCTION_SECTIONS.includes(activeTab)
          ? activeTab
          : productionSections[0]?.key
        : section
    if (!next) return
    rememberContext({ section: next, productionOpen: true })
    setProductionOpen(true)
    setTab(next)
    onSectionChange?.(next)
  }
  const showSection = (section) => {
    changeSection(section)
    requestAnimationFrame(() =>
      recordsRef.current?.focus({ preventScroll: true })
    )
  }
  useLayoutEffect(() => {
    if (data && recordsRef.current) {
      recordsRef.current.scrollTop =
        contextRef.current.get(requestKey)?.scrolls?.[activeTab] ??
        selection?.detailScroll?.[activeTab] ??
        0
    }
  }, [data, activeTab, requestKey, selection?.detailScroll])
  const rememberSelection = () =>
    onRememberContext?.({
      section: activeTab,
      productionOpen,
      detailScroll: {
        ...selection?.detailScroll,
        ...contextRef.current.get(requestKey)?.scrolls,
        [activeTab]: recordsRef.current?.scrollTop || 0,
      },
    })
  const sourcePath = data ? progressSourcePath(data.row, data.row.view) : ''
  const sourceAction =
    !mobile && sourcePath && canOpen(sourcePath) ? (
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
    </div>
  )
  const surfaceProps = mobile
    ? {
        title: (
          <MobileDetailHeader
            title="进度详情"
            backLabel="返回进度"
            onBack={onClose}
          />
        ),
        width: '100%',
        onClose,
        closable: false,
        className: 'erp-progress-drawer erp-progress-drawer--mobile',
        classNames: { body: 'mobile-detail-content' },
        ...(suppressOpenMotion
          ? {
              maskMotion: SUPPRESS_OPEN_MOTION,
              motion: SUPPRESS_OPEN_MOTION,
            }
          : {}),
      }
    : {
        title: (
          <>
            <span role="heading" aria-level={2} ref={headingRef} tabIndex={-1}>
              {selection?.orderNo || '订单'}
            </span>{' '}
            · 完整进度
          </>
        ),
        onCancel: onClose,
        afterOpenChange: (open) => {
          if (open) focusHeading()
        },
        className: 'erp-progress-modal',
        size: 'localAction',
      }
  const renderRecords = (section) => {
    const records = sectionRecords(section)
    return (
      <>
        {section === 'materials' && (
          <p className="erp-progress-hint">
            按已登记领料与计划用量核对。尚未领齐不代表库存缺料；采购到货需到相关业务中核对。
          </p>
        )}
        {section === 'tasks' && (
          <p className="erp-progress-hint">
            仅显示当前账号可见的关联任务。任务完成不代表已经生产、入库或出货。
          </p>
        )}
        {records.length === 0 ? (
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={
              section === 'production' ? '暂无关联生产单' : '暂无可见记录'
            }
          />
        ) : (
          records.map((record) => {
            const path = progressSourcePath(record, selection?.view)
            const productLine =
              record.kind === 'sales_line' || record.kind === 'production_line'
            const recordTitle =
              record.kind === 'task'
                ? getWorkflowTaskDisplayName({
                    task_name: record.label,
                  })
                : record.label || record.number
            return (
              <article
                className="erp-progress-record"
                key={`${record.kind}:${record.id}`}
              >
                <div className="erp-progress-record-main">
                  {productLine ? (
                    <ProductIdentity
                      productId={record.product_id}
                      name={recordTitle}
                      compact
                    >
                      <strong>{recordTitle}</strong>
                    </ProductIdentity>
                  ) : (
                    <strong>{recordTitle}</strong>
                  )}
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
                  {!mobile && canOpen(path) && (
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
                      onClick={() => {
                        rememberSelection()
                        onOpenTask(record.id)
                      }}
                      aria-label={`查看任务 ${record.number || record.label}`}
                    >
                      查看任务
                    </Button>
                  )}
                  {mobile &&
                    record.kind === 'production' &&
                    onOpenProduction && (
                      <Button
                        onClick={() => {
                          rememberSelection()
                          onOpenProduction(record)
                        }}
                      >
                        查看生产进度
                      </Button>
                    )}
                </div>
              </article>
            )
          })
        )}
        {data?.has_more?.[section] && (
          <p className="erp-progress-hint">
            {mobile
              ? '已显示前 100 条'
              : '此处展示前 100 条，请进入原业务页面查看完整记录。'}
          </p>
        )}
      </>
    )
  }
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
      {data && (
        <BusinessProgressHeader
          mobile={mobile}
          row={data.row}
          access={data.access}
          onSelectSection={showSection}
        />
      )}
      <SlidingTabList
        className="erp-progress-detail-tabs erp-navigation-tabs"
        aria-label="进度明细分类"
      >
        {(mobile ? mobileItems : items).map((item) => (
          <button
            key={item.key}
            type="button"
            role="tab"
            id={`${tabID}-${item.key}`}
            aria-controls={`${tabID}-panel`}
            aria-selected={navigationTab === item.key}
            onClick={() => changeSection(item.key)}
          >
            {item.label}
          </button>
        ))}
      </SlidingTabList>
      <section
        id={`${tabID}-panel`}
        ref={recordsRef}
        className="erp-progress-detail-scroll"
        role="tabpanel"
        aria-labelledby={`${tabID}-${navigationTab}`}
        tabIndex={0}
        onScroll={(event) =>
          rememberContext({
            scrolls: {
              ...contextRef.current.get(requestKey)?.scrolls,
              [activeTab]: event.currentTarget.scrollTop,
            },
          })
        }
      >
        <Spin spinning={loading}>
          {!error &&
            data &&
            (activeTab === 'overview' ? (
              mobile ? (
                <MobileProgressSummary
                  data={data}
                  onSelectSection={showSection}
                />
              ) : (
                <BusinessProgressSummary
                  row={data.row}
                  access={data.access}
                  sections={data.sections}
                  onSelectSection={showSection}
                />
              )
            ) : mobile && navigationTab === 'execution' ? (
              <div className="mobile-progress-detail-groups">
                {productionSections.map((item) => {
                  const expanded = productionOpen && activeTab === item.key
                  const triggerID = `${tabID}-group-${item.key}`
                  const panelID = `${triggerID}-panel`
                  const count = sectionRecords(item.key).length
                  const unit =
                    item.key === 'production'
                      ? '单'
                      : item.key === 'batches'
                        ? '批次'
                        : '项'
                  return (
                    <section
                      className="mobile-progress-detail-group"
                      key={item.key}
                    >
                      <button
                        type="button"
                        id={triggerID}
                        className="mobile-progress-detail-group-trigger"
                        aria-expanded={expanded}
                        aria-controls={panelID}
                        aria-label={`${item.label}，${count} ${unit}`}
                        onClick={() => {
                          if (expanded) {
                            setProductionOpen(false)
                            rememberContext({ productionOpen: false })
                          } else changeSection(item.key)
                        }}
                      >
                        <strong>{item.label}</strong>
                        <span>
                          {count}
                          {data.has_more?.[item.key] ? '+' : ''} {unit}
                        </span>
                        {expanded ? (
                          <DownOutlined aria-hidden="true" />
                        ) : (
                          <RightOutlined aria-hidden="true" />
                        )}
                      </button>
                      {expanded && (
                        <div
                          id={panelID}
                          className="mobile-progress-detail-group-body"
                          role="region"
                          aria-labelledby={triggerID}
                        >
                          {renderRecords(item.key)}
                        </div>
                      )}
                    </section>
                  )
                })}
              </div>
            ) : (
              <div className="erp-progress-detail-records">
                {renderRecords(activeTab)}
              </div>
            ))}
        </Spin>
        <MobileBackToTop enabled={mobile && Boolean(selection)} />
      </section>
    </Surface>
  )
}
