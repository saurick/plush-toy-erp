import React, {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { Alert, Button, Spin, Tag } from 'antd'
import {
  DownOutlined,
  RightOutlined,
} from '@ant-design/icons'
import Drawer from '@/common/components/drawer/AppDrawer.jsx'
import Empty from '@/common/components/empty/AppEmpty.jsx'
import MobileBackToTop from '@/common/components/scroll/MobileBackToTop'
import SlidingTabList from '@/common/components/navigation/SlidingTabList'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { getBusinessProgress } from '../../api/businessProgressApi.mjs'
import useLatestRequestCoordinator from '../../hooks/useLatestRequestCoordinator.js'
import ProgressRelatedTasks from './ProgressRelatedTasks.jsx'
import MobileDetailHeader from '../../mobile/components/MobileDetailHeader.jsx'
import MobileProgressSummary from '../../mobile/components/MobileProgressSummary.jsx'
import BusinessModal from '../business-list/BusinessModal.jsx'
import { BusinessCopyField } from '../business-list/BusinessCopyButton.jsx'
import { ProgressDocumentNumber } from './ProgressCompactContent.jsx'
import BusinessProgressSummary, {
  BusinessProgressHeader,
} from './BusinessProgressSummary.jsx'
import ProductIdentity from '../master-data/ProductIdentity.jsx'
import { progressStatusLabel } from '../../utils/businessProgress.mjs'

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
  sourceOrderNo,
  onClose,
  adminProfile,
  mobile = false,
  suppressOpenMotion = false,
  onOpenProduction,
  onOpenTask,
  onSectionChange,
}) {
  const begin = useLatestRequestCoordinator()
  const [state, setState] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [tab, setTab] = useState('overview')
  const [productionOpen, setProductionOpen] = useState(true)
  const [stagesExpanded, setStagesExpanded] = useState(false)
  const recordsRef = useRef(null)
  const headingRef = useRef(null)
  const contextRef = useRef(new Map())
  const pendingTaskFocus = useRef(null)
  const pendingProductionFocus = useRef(null)
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
    setStagesExpanded(previous?.stagesExpanded ?? selection?.stagesExpanded ?? false)
  }, [requestKey, selection?.section, selection?.productionOpen, selection?.stagesExpanded])
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
  const rememberContext = useCallback((changes) => {
    if (!requestKey) return
    contextRef.current.set(requestKey, {
      ...contextRef.current.get(requestKey),
      ...changes,
    })
    if (contextRef.current.size > 20) {
      contextRef.current.delete(contextRef.current.keys().next().value)
    }
  }, [requestKey])
  const entryTaskQuery = selection?.taskQuery
  const entryTaskScroll = selection?.detailScroll?.tasks
  const entryTaskFocus = selection?.section === 'tasks' ? selection.focusTaskID : null
  useLayoutEffect(() => {
    pendingTaskFocus.current = entryTaskFocus
    if (!entryTaskQuery) return
    rememberContext({
      taskQuery: entryTaskQuery,
      scrolls: { ...contextRef.current.get(requestKey)?.scrolls, tasks: entryTaskScroll ?? 0 },
    })
  }, [entryTaskFocus, entryTaskQuery, entryTaskScroll, rememberContext, requestKey])
  const entryProductionFocus = selection?.focusProductionID
  useLayoutEffect(() => {
    pendingProductionFocus.current = entryProductionFocus
  }, [entryProductionFocus, requestKey])
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
    const records = recordsRef.current
    if (!data || !records) return
    const productionID = activeTab === 'production' ? pendingProductionFocus.current : null
    records.scrollTop = (productionID
      ? selection?.detailScroll?.production
      : contextRef.current.get(requestKey)?.scrolls?.[activeTab] ?? selection?.detailScroll?.[activeTab]) ?? 0
    if (activeTab === 'lines' && selection?.lineID && !selection?.detailScroll?.lines) {
      records.querySelector(`[data-progress-detail-line="${selection.lineID}"]`)?.scrollIntoView({ block: 'nearest' })
    }
    if (productionID) {
      const trigger = records.querySelector(`[data-progress-production-id="${productionID}"]`) || records
      trigger.focus({ preventScroll: true })
      pendingProductionFocus.current = null
    }
  }, [data, activeTab, requestKey, selection?.detailScroll, selection?.lineID])
  const currentContext = () => {
    const saved = contextRef.current.get(requestKey)
    return {
      section: activeTab,
      productionOpen,
      stagesExpanded,
      taskQuery: saved?.taskQuery || selection?.taskQuery,
      detailScroll: {
        ...selection?.detailScroll,
        ...saved?.scrolls,
        [activeTab]: recordsRef.current?.scrollTop || 0,
      },
    }
  }
  const orderFocus = data?.row.view === 'orders' ? {
    mobile,
    stagesExpanded,
    onToggleStages: () => {
      const next = !stagesExpanded
      rememberContext({ stagesExpanded: next })
      setStagesExpanded(next)
    },
  } : undefined
  const title = selectedView === 'production' ? '生产单进度' : '订单进度'
  const backLabel = sourceOrderNo ? '返回订单进度' : '返回进度看板'
  const Surface = mobile ? Drawer : BusinessModal
  const footer = (
    <div
      className={
        mobile
          ? 'mobile-role-action-bar mobile-progress-detail-actions'
          : 'erp-progress-detail-actions'
      }
    >
      <Button onClick={onClose}>{backLabel}</Button>
    </div>
  )
  const surfaceProps = mobile
    ? {
        title: (
          <MobileDetailHeader
            title={title}
            backLabel={backLabel}
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
            <ProgressDocumentNumber number={data?.row.order_no} view={selectedView}>
              <span role="heading" aria-level={2} ref={headingRef} tabIndex={-1}>
                {data?.row.order_no?.trim() || selection?.orderNo || '订单'}
              </span>
            </ProgressDocumentNumber>{' '}
            · {title}
          </>
        ),
        onCancel: onClose,
        afterOpenChange: (open) => {
          if (open) focusHeading()
        },
        className: `erp-progress-modal${selectedView === 'orders' ? ' erp-progress-modal--order' : ''}`,
        size: 'localAction',
      }
  const renderRecords = (section) => {
    if (section === 'tasks') {
      const saved = contextRef.current.get(requestKey)
      return <ProgressRelatedTasks
        key={requestKey}
        detail={data}
        mobile={mobile}
        scrollRef={recordsRef}
        pendingFocus={pendingTaskFocus}
        saved={{
          ...(saved?.taskQuery || selection?.taskQuery),
          scrollTop: saved?.scrolls?.tasks ?? selection?.detailScroll?.tasks,
        }}
        onRemember={(taskQuery) => rememberContext({ taskQuery })}
        onOpen={onOpenTask ? (record, taskQuery) => {
          onOpenTask(record.id, { ...currentContext(), taskQuery, focusTaskID: record.id })
        } : undefined}
      />
    }
    const records = sectionRecords(section)
    return (
      <>
        {section === 'materials' && (
          <p className="erp-progress-hint">
            按已登记领料与计划用量核对。尚未领齐不代表库存缺料；采购到货需到相关业务中核对。
          </p>
        )}
        {records.length === 0 ? (
          <Empty
            description={
              section === 'production' ? '暂无关联生产单' : '暂无可见记录'
            }
          />
        ) : (
          records.map((record) => {
            const productLine =
              record.kind === 'sales_line' || record.kind === 'production_line'
            const recordTitle = record.label || record.number
            return (
              <article
                className="erp-progress-record"
                data-progress-detail-line={productLine ? record.id : undefined}
                data-progress-line-selected={productLine && record.id === selection?.lineID ? true : undefined}
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
                  {record.kind === 'production' &&
                    onOpenProduction && (
                      <Button
                        data-progress-production-id={record.id}
                        aria-label={`查看生产单进度 ${record.number || recordTitle}`}
                        onClick={() => onOpenProduction(record, { ...currentContext(), focusProductionID: record.id })}
                      >
                        查看生产单进度
                      </Button>
                    )}
                </div>
              </article>
            )
          })
        )}
        {data?.has_more?.[section] && (
          <p className="erp-progress-hint">已显示前 100 条</p>
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
      {sourceOrderNo && (
        <p className="erp-progress-hint erp-progress-source-order">
          来源订单 <BusinessCopyField label="来源订单号" value={sourceOrderNo} />
        </p>
      )}
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
          showOrderConcerns={Boolean(orderFocus)}
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
                  orderFocus={orderFocus}
                />
              ) : (
                <BusinessProgressSummary
                  row={data.row}
                  access={data.access}
                  sections={data.sections}
                  onSelectSection={showSection}
                  orderFocus={orderFocus}
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
