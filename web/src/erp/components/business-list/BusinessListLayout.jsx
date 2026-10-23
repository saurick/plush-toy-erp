import React from 'react'
import { createPortal } from 'react-dom'
import { useOutletContext } from 'react-router-dom'

import {
  CheckCircleOutlined,
  CheckSquareOutlined,
  CloseOutlined,
  CopyOutlined,
  DownOutlined,
  EllipsisOutlined,
  FilterOutlined,
  RollbackOutlined,
  SendOutlined,
  StopOutlined,
} from '@ant-design/icons'
import {
  Button,
  Card,
  ConfigProvider,
  Dropdown,
  Empty,
  Popconfirm,
  Popover,
  Space,
  Spin,
  Tag,
  Tooltip,
  Typography,
  theme,
} from 'antd'
import Select from '@/common/components/select/AppSelect'
import FilterSelect from '@/common/components/select/FilterSelect'
import { filterSelectOptions, isEmptyFilterValue } from '@/common/components/select/filterSelectOptions.mjs'
import Table, { TABLE_SELECTION_COLUMN_WIDTH } from '@/common/components/table/AppTable'
import SharedSearchInput from '@/common/components/SearchInput'
import Segmented from '@/common/components/navigation/SlidingSegmented'
import FilterChip from '@/common/components/navigation/FilterChip'
import { shouldUseDirectFilterChoices } from '../../utils/businessFilterPresentation.mjs'
import './businessFilterChoices.css'
import BusinessRecordDetails from './BusinessRecordDetails.jsx'
import ERPPageActions from '../ERPPageActions.jsx'
import useBusinessListStickyHeader from './useBusinessListStickyHeader.js'
import { copyTextToClipboard } from '@/common/utils/clipboard.mjs'
import { message } from '@/common/utils/antdApp'
import { BusinessPageHelpTrigger } from '../help/BusinessContextHelp.jsx'
import { selectStableBusinessActionIndexes } from '../../utils/businessActionAvailability.mjs'
import { formatPaginationTotal } from '@/common/utils/pagination.mjs'
import { filterBusinessListColumns } from '../../utils/moduleTableColumns.mjs'
import {
  businessTableCopyColumnKey,
  resolveBusinessTableCopyLabel,
  resolveBusinessTableCopyText,
} from '../../utils/businessTableCopy.mjs'

const { Text } = Typography
export const SelectionActionOverlayContext = React.createContext(null)
const BusinessFilterPanelContext = React.createContext(false)
const BusinessSelectionAvailabilityContext = React.createContext(null)

export {
  CollaborationPanelResizeHandle,
  CollaborationTaskPanel,
} from './CollaborationTaskPanel.jsx'
const BUSINESS_TABLE_DEFAULT_SCROLL_X = 960
const BUSINESS_TABLE_DEFAULT_COLUMN_WIDTH = 160
const BUSINESS_TABLE_MIN_COLUMN_WIDTH = 88
const SELECTION_ACTION_PRIORITIES = {
  collaboration: 120,
  primary: 100,
  edit: 80,
  view: 60,
  action: 40,
  related: 30,
  output: 20,
  secondary: 20,
  danger: 10,
  recovery: 0,
}
const SELECTION_ACTION_GROUPS = {
  collaboration: '任务协作',
  business: '业务办理',
  query: '查看与关联',
  output: '打印与输出',
  lifecycle: '单据处理',
  other: '其他操作',
}
const SELECTION_ACTION_ROLE_GROUPS = {
  collaboration: 'collaboration',
  primary: 'business',
  edit: 'business',
  action: 'business',
  view: 'query',
  related: 'query',
  output: 'output',
  secondary: 'other',
  danger: 'lifecycle',
  recovery: 'other',
}

function joinClassNames(...items) {
  return items.filter(Boolean).join(' ')
}

function flattenSelectionActions(children) {
  const actions = []

  React.Children.forEach(children, (child) => {
    if (React.isValidElement(child) && child.type === React.Fragment) {
      actions.push(...flattenSelectionActions(child.props.children))
      return
    }
    if (
      child != null && child !== false && child.props?.visible !== false &&
      child.type?.selectionActionVisible?.(child.props) !== false
    ) {
      actions.push(child)
    }
  })

  return actions
}

function isSourceDocumentDetailsAction(action) {
  if (!React.isValidElement(action)) return false
  const key = action.props['data-business-action-key'] || ''
  if (key === 'view' || key.endsWith('-details')) return true
  const children = flattenSelectionActions(action.props.children)
  return children.length > 0 && children.every(isSourceDocumentDetailsAction)
}

function inspectSelectionAction(action) {
  if (!React.isValidElement(action)) {
    return { actionable: false, enabled: false, score: -1 }
  }

  if (action.type === Tag) {
    return { actionable: false, enabled: false, score: -1 }
  }

  const nestedActions = flattenSelectionActions(action.props.children)
    .map(inspectSelectionAction)
    .filter((item) => item.actionable)
  const actionable = action.type === Button || nestedActions.length > 0 ||
    typeof action.type === 'function' || typeof action.type === 'object'
  const role = action.props['data-business-action-role'] || action.type?.selectionActionRole
  const priorityValue = action.props.selectionActionPriority ?? action.type?.selectionActionPriority
  const priority = typeof priorityValue === 'function' ? priorityValue(action.props) : priorityValue
  const actionGroup = action.props['data-business-action-group'] || action.type?.selectionActionGroup ||
    SELECTION_ACTION_ROLE_GROUPS[role] || nestedActions[0]?.group || 'business'
  const group = Object.hasOwn(SELECTION_ACTION_GROUPS, actionGroup) ? actionGroup : 'other'
  const nestedScore = nestedActions.length ? Math.max(...nestedActions.map((item) => item.score)) : 30
  return {
    actionable,
    group,
    pinned: role === 'collaboration' || nestedActions.some((item) => item.pinned),
    dangerous: role === 'danger' || action.props.danger === true || action.props.action?.danger === true || (!role && nestedActions.length > 0 && nestedActions.every((item) => item.dangerous)),
    enabled: action.props.disabled !== true && action.props.loading !== true && (nestedActions.length === 0 || nestedActions.some((item) => item.enabled)),
    score: Number.isFinite(priority)
      ? priority
      : SELECTION_ACTION_PRIORITIES[role] ?? (action.type === Button ? 40 : nestedScore),
  }
}

function deEmphasizeCreation(action) {
  if (!React.isValidElement(action)) return action
  if (action.type === Button || action.type === ToolbarButton) {
    return action.props.type === 'primary' ? React.cloneElement(action, { type: 'default' }) : action
  }
  return action.props.children
    ? React.cloneElement(action, undefined, React.Children.map(action.props.children, deEmphasizeCreation))
    : action
}

function partitionSelectionActions(children, space, mobile = false) {
  const nodes = flattenSelectionActions(children)
  const descriptors = nodes.map((node, index) => ({
    index,
    node,
    ...inspectSelectionAction(node),
  }))
  const measured = space && descriptors.every((item) =>
    !item.actionable || Object.hasOwn(space.widths, item.index)
  )
  const actions = descriptors
    .filter((item) => item.actionable && (!measured || space.widths[item.index] > 0))
    .sort((left, right) => Number(right.pinned) - Number(left.pinned) || Number(left.dangerous) - Number(right.dangerous) || left.index - right.index)
  if (mobile) {
    const mobileScore = (item) => item.pinned ? SELECTION_ACTION_PRIORITIES.related : item.score
    const primary = [...actions].sort((left, right) => Number(left.dangerous) - Number(right.dangerous) || Number(right.enabled) - Number(left.enabled) || mobileScore(right) - mobileScore(left) || left.index - right.index)[0]
    return {
      context: descriptors.filter((item) => !item.actionable).map((item) => item.node),
      visible: primary ? [primary] : [],
      overflow: actions.filter((item) => item !== primary),
    }
  }
  const visibleIndexes = new Set(measured
    ? selectStableBusinessActionIndexes(actions.map((item) => ({
      ...item, width: space.widths[item.index],
    })), space)
    : actions.map((item) => item.index))

  return {
    context: descriptors
      .filter((item) => !item.actionable)
      .map((item) => item.node),
    visible: actions.filter((item) => visibleIndexes.has(item.index)),
    overflow: actions.filter((item) => !visibleIndexes.has(item.index)),
  }
}

function callSelectionActionThenClose(handler, close, ...args) {
  try {
    return handler?.(...args)
  } finally {
    close?.()
  }
}

function wrapSelectionAction(action, close, onOverlayChange) {
  if (!React.isValidElement(action)) return action

  if (action.type === Button) {
    return close ? React.cloneElement(action, {
      onClick: (...args) =>
        callSelectionActionThenClose(action.props.onClick, close, ...args),
    }) : action
  }

  if (action.type === Popconfirm) {
    return React.cloneElement(action, {
      onOpenChange: (open, event) => {
        onOverlayChange(open)
        action.props.onOpenChange?.(open, event)
      },
      onConfirm: (...args) =>
        callSelectionActionThenClose(action.props.onConfirm, close, ...args),
    })
  }

  if (action.type === Dropdown) {
    const menu = action.props.menu || {}
    return React.cloneElement(action, {
      onOpenChange: (open, info) => {
        onOverlayChange(open)
        action.props.onOpenChange?.(open, info)
      },
      menu: {
        ...menu,
        onClick: (...args) =>
          callSelectionActionThenClose(menu.onClick, close, ...args),
      },
    })
  }

  if (action.props.children) {
    return React.cloneElement(
      action,
      undefined,
      React.Children.map(action.props.children, (child) =>
        wrapSelectionAction(child, close, onOverlayChange)
      )
    )
  }

  return action
}

function containsDeferredSelectionAction(action) {
  if (!React.isValidElement(action)) return false
  if (action.type === Popconfirm || action.type === Dropdown) return true
  return React.Children.toArray(action.props.children).some(
    containsDeferredSelectionAction
  )
}

function selectionActionRenderState(action) {
  if (!React.isValidElement(action)) return String(action ?? '')
  const children = React.Children.toArray(action.props.children)
    .map(selectionActionRenderState)
    .join(',')
  return [
    action.key || '',
    action.props.disabled === true ? 'disabled' : 'enabled',
    action.props.loading === true ? 'loading' : 'idle',
    action.props.visible === false ? 'hidden' : 'visible',
    children,
  ].join(':')
}

function isSelectionActionLoading(action) {
  return React.isValidElement(action) && (Boolean(action.props.loading) ||
    React.Children.toArray(action.props.children).some(isSelectionActionLoading))
}

function disableUnselectedAction(action) {
  if (!React.isValidElement(action)) return action
  const props = typeof action.type === 'string' ? {} : { disabled: true }
  if (action.type === BusinessActionTooltip) props.disabledReason = '请先选择一条记录'
  return React.cloneElement(action, props, action.props.children
    ? React.Children.map(action.props.children, disableUnselectedAction)
    : action.props.children)
}

function ResponsiveSelectionActions({ children, mobile = false }) {
  const { token } = theme.useToken()
  const [space, setSpace] = React.useState(null)
  const [measurementRevision, setMeasurementRevision] = React.useState(0)
  const [moreActionsOpen, setMoreActionsOpen] = React.useState(false)
  const [actionOverlayOpen, setActionOverlayOpen] = React.useState(false)
  const actionsRef = React.useRef(null)
  const visibleActionsRef = React.useRef(null)
  const contextRef = React.useRef(null)
  const measureItemsRef = React.useRef(null)
  const measureMoreRef = React.useRef(null)
  const moreActionsListRef = React.useRef(null)
  const moreActionsTriggerRef = React.useRef(null)
  const moreActionsId = React.useId()
  const actionsBusy = React.Children.toArray(children).some(isSelectionActionLoading)
  // Moving a stateful action between the toolbar and menu unmounts its dialog.
  // Let the dialog adapt to the viewport before regrouping its trigger on close.
  const partitionSpaceRef = React.useRef(space)
  if (!actionOverlayOpen && !moreActionsOpen && !actionsBusy) partitionSpaceRef.current = space
  const partitionSpace = partitionSpaceRef.current
  const { context, visible, overflow } = React.useMemo(
    () => partitionSelectionActions(children, partitionSpace, mobile),
    [children, partitionSpace, mobile]
  )
  const overflowRenderKey = React.useMemo(
    () => overflow.map((item) => selectionActionRenderState(item.node)).join('|'),
    [overflow]
  )
  const overflowGroups = React.useMemo(() => Object.entries(SELECTION_ACTION_GROUPS)
    .map(([key, label]) => ({ key, label, actions: overflow.filter((item) => item.group === key) }))
    .filter((group) => group.actions.length > 0), [overflow])
  const visibleGroups = React.useMemo(() => Object.entries(SELECTION_ACTION_GROUPS)
    .map(([key, label]) => ({ key, label, actions: visible.filter((item) => item.group === key) }))
    .filter((group) => group.actions.length > 0)
    .sort((left, right) => Number(left.key === 'lifecycle') - Number(right.key === 'lifecycle')), [visible])
  const showGroupHeadings = !mobile && new Set([...visible, ...overflow].map((item) => item.group)).size > 1
  const attachMoreActionsList = React.useCallback((node) => {
    moreActionsListRef.current = node
    if (node) setMeasurementRevision((current) => current + 1)
  }, [])

  React.useLayoutEffect(() => {
    const root = actionsRef.current
    const rail = measureItemsRef.current
    if (!root || !rail) return undefined
    let frame
    let stopped = false
    const measure = () => {
      if (stopped || !root.isConnected) return
      const { width } = root.getBoundingClientRect()
      if (width <= 0) return
      const gap = Number.parseFloat(getComputedStyle(root).columnGap) || 8
      const nodes = [
        ...visibleActionsRef.current.querySelectorAll('[data-selection-action-index]'),
        ...(moreActionsListRef.current?.querySelectorAll('[data-selection-action-index]') || []),
      ]
      // Measure inert DOM copies in toolbar styles, including actions in the hidden menu.
      // Business components are never duplicated just to discover their natural width.
      const clones = nodes.map((node) => {
        const clone = node.cloneNode(true)
        clone.className = 'erp-business-selection-action-bar__measure-item'
        clone.querySelectorAll('[id]').forEach((item) => item.removeAttribute('id'))
        clone.querySelectorAll('[data-business-action-key]').forEach((item) => item.removeAttribute('data-business-action-key'))
        clone.querySelectorAll('.ant-btn-loading-icon').forEach((item) => item.remove())
        clone.querySelectorAll('button').forEach((button) => {
          const item = document.createElement('span')
          item.className = button.className
          item.style.cssText = button.style.cssText
          item.append(...button.childNodes)
          button.replaceWith(item)
        })
        return clone
      })
      const headings = Object.entries(SELECTION_ACTION_GROUPS).map(([key, label]) => {
        const heading = document.createElement('span')
        heading.className = 'erp-business-selection-action-bar__group-heading'
        heading.dataset.actionGroup = key
        heading.textContent = label
        return heading
      })
      rail.replaceChildren(...clones, ...headings)
      const widths = Object.fromEntries(clones.map((node) => [
        node.dataset.selectionActionIndex,
        Math.ceil(node.getBoundingClientRect().width),
      ]))
      const groupMinWidths = Object.fromEntries(headings.map((heading) => [
        heading.dataset.actionGroup, Math.ceil(heading.getBoundingClientRect().width),
      ]))
      rail.replaceChildren()
      const contextWidth = contextRef.current?.getBoundingClientRect().width || 0
      const next = {
        availableWidth: Math.floor(width - contextWidth - (contextWidth ? gap : 0)),
        moreWidth: Math.ceil(measureMoreRef.current.getBoundingClientRect().width),
        gap,
        groupGap: Number.parseFloat(getComputedStyle(visibleActionsRef.current).columnGap) || gap,
        groupMinWidths,
        widths,
      }
      setSpace((current) => JSON.stringify(current) === JSON.stringify(next) ? current : next)
    }
    const schedule = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(measure)
    }
    measure()
    const resizeObserver = new ResizeObserver(schedule)
    resizeObserver.observe(root)
    resizeObserver.observe(visibleActionsRef.current)
    const mutationObserver = new MutationObserver(schedule)
    const options = { childList: true, subtree: true, characterData: true }
    mutationObserver.observe(visibleActionsRef.current, options)
    if (moreActionsListRef.current) mutationObserver.observe(moreActionsListRef.current, options)
    window.addEventListener('resize', schedule)
    document.fonts?.addEventListener('loadingdone', schedule)
    return () => {
      stopped = true
      cancelAnimationFrame(frame)
      resizeObserver.disconnect()
      mutationObserver.disconnect()
      window.removeEventListener('resize', schedule)
      document.fonts?.removeEventListener('loadingdone', schedule)
    }
  }, [children, measurementRevision, overflow.length, visible.length])
  const closeMoreActions = React.useCallback(() => {
    setMoreActionsOpen(false)
  }, [])
  const closeMoreActionsAndRestoreFocus = React.useCallback(() => {
    setMoreActionsOpen(false)
    const trigger = moreActionsTriggerRef.current
    window.requestAnimationFrame(() => {
      trigger?.focus({ preventScroll: true })
    })
  }, [])
  const focusMoreAction = React.useCallback((event) => {
    const list = moreActionsListRef.current
    if (!list?.contains(event.target)) return
    const actions = Array.from(
      list.querySelectorAll(
        'button:not(:disabled), .erp-business-action-tooltip-anchor[tabindex="0"]'
      )
    )
    if (actions.length === 0) return
    const current = actions.indexOf(document.activeElement)
    const last = actions.length - 1
    const index = {
      ArrowDown: current < last ? current + 1 : 0,
      ArrowUp: current > 0 ? current - 1 : last,
      Home: 0,
      End: last,
    }[event.key]
    if (index !== undefined) {
      event.preventDefault()
      event.stopPropagation()
      const target = actions[index]
      target.focus({ preventScroll: true })
      const bounds = target.getBoundingClientRect()
      const viewport = list.getBoundingClientRect()
      if (bounds.top < viewport.top) list.scrollTop -= viewport.top - bounds.top
      else if (bounds.bottom > viewport.bottom) list.scrollTop += bounds.bottom - viewport.bottom
    }
  }, [])

  React.useEffect(() => {
    if (overflow.length === 0) setMoreActionsOpen(false)
  }, [overflow.length])

  const renderMoreActions = React.useCallback(
    () => (
      <div
        ref={attachMoreActionsList}
        id={moreActionsId}
        className="erp-business-selection-action-menu"
        style={{
          background: token.colorBgElevated,
          color: token.colorText,
          borderColor: token.colorBorderSecondary,
          boxShadow: token.boxShadowSecondary,
        }}
        role="toolbar"
        aria-label="更多操作"
        tabIndex={-1}
        onFocus={(event) => {
          if (event.target === event.currentTarget) {
            moreActionsListRef.current
              ?.querySelector(
                'button:not(:disabled), .erp-business-action-tooltip-anchor[tabindex="0"]'
              )
              ?.focus({ preventScroll: true })
          }
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault()
            // Nested dropdowns also close through their window key listener.
            closeMoreActionsAndRestoreFocus()
            return
          }
          focusMoreAction(event)
        }}
      >
        {overflowGroups.map((group) => (
          <section key={group.key} className="erp-business-selection-action-menu__group" aria-label={group.label}>
            <div className="erp-business-selection-action-menu__heading">{group.label}</div>
            {group.actions.map(({ node: action, index }) => (
              <div
                key={action?.key || `selection-overflow-action-${index}`}
                data-selection-action-index={index}
                className="erp-business-selection-action-menu__item"
                onClick={(event) => {
                  const button = event.target.closest('button')
                  if (
                    !containsDeferredSelectionAction(action) &&
                    button &&
                    !button.disabled &&
                    !button.classList.contains('ant-btn-loading')
                  ) {
                    closeMoreActions()
                  }
                }}
              >
                {wrapSelectionAction(action, closeMoreActions, setActionOverlayOpen)}
              </div>
            ))}
          </section>
        ))}
      </div>
    ),
    [
      closeMoreActions,
      attachMoreActionsList,
      closeMoreActionsAndRestoreFocus,
      focusMoreAction,
      moreActionsId,
      overflowGroups,
      token,
    ]
  )

  const renderVisibleAction = ({ node, index }) => (
    <div key={node?.key || `selection-action-${index}`} data-selection-action-index={index} className="erp-business-selection-action-bar__action-item">
      {wrapSelectionAction(node, undefined, setActionOverlayOpen)}
    </div>
  )

  return (
    <SelectionActionOverlayContext.Provider value={setActionOverlayOpen}>
      <div
        ref={actionsRef}
        data-selection-layout-locked={actionOverlayOpen || moreActionsOpen || actionsBusy || undefined}
        className={joinClassNames('erp-business-selection-action-bar__actions erp-business-module-selection-actions erp-business-selection-action-bar__actions--responsive', showGroupHeadings && 'erp-business-selection-action-bar__actions--grouped')}
      >
        {context.length > 0 ? (
          <div ref={contextRef} className="erp-business-selection-action-bar__compact-context">
            {context}
          </div>
        ) : null}
        <div ref={visibleActionsRef} className="erp-business-selection-action-bar__compact-visible">
          {mobile ? visible.map(renderVisibleAction) : visibleGroups.map((group) => (
            <div key={group.key} className="erp-business-selection-action-bar__group" role="group" aria-label={group.label} data-business-action-group={group.key}>
              {showGroupHeadings ? <div className="erp-business-selection-action-bar__group-heading">{group.label}</div> : null}
              <div className="erp-business-selection-action-bar__group-actions">
                {group.actions.map(renderVisibleAction)}
              </div>
            </div>
          ))}
        </div>
        {overflow.length > 0 ? (
          <Dropdown
            key={overflowRenderKey}
            trigger={['click']}
            placement="bottomRight"
            open={moreActionsOpen}
            onOpenChange={setMoreActionsOpen}
            autoFocus
            autoAdjustOverflow
            // Stateful actions own dialogs and drawers that must outlive the menu.
            // The render key still rebuilds them when external action state changes.
            forceRender
            destroyOnHidden={false}
            overlayClassName="erp-business-selection-action-dropdown"
            popupRender={renderMoreActions}
          >
            <Button
              ref={moreActionsTriggerRef}
              className="erp-business-selection-action-bar__compact-more erp-action-button"
              size="small"
              disabled={false}
              aria-label={`更多操作，共 ${overflow.length} 项`}
              aria-expanded={moreActionsOpen}
              aria-controls={moreActionsId}
            >
              {mobile ? <EllipsisOutlined aria-hidden="true" /> : <>更多操作 <DownOutlined /></>}
            </Button>
          </Dropdown>
        ) : null}
        <div className="erp-business-selection-action-bar__measure" aria-hidden="true">
          <Button ref={measureMoreRef} href="#" tabIndex={-1} size="small" className="erp-action-button">{mobile ? <EllipsisOutlined aria-hidden="true" /> : <>更多操作 <DownOutlined /></>}</Button>
          <div ref={measureItemsRef} />
        </div>
      </div>
    </SelectionActionOverlayContext.Provider>
  )
}

function resolveBusinessTableColumnWidth(column = {}) {
  if (Number.isFinite(column.width)) {
    return Math.max(column.width, BUSINESS_TABLE_MIN_COLUMN_WIDTH)
  }

  if (typeof column.width === 'string') {
    const pixelWidth = Number.parseFloat(column.width)
    if (Number.isFinite(pixelWidth) && column.width.trim().endsWith('px')) {
      return Math.max(pixelWidth, BUSINESS_TABLE_MIN_COLUMN_WIDTH)
    }
  }

  return BUSINESS_TABLE_DEFAULT_COLUMN_WIDTH
}

function CopyableBusinessTableCell({ column, value, record, children }) {
  const copyConfig =
    typeof column?.copyable === 'object' && column.copyable !== null
      ? column.copyable
      : {}
  const copyText = resolveBusinessTableCopyText(column, value, record)
  const copyLabel = resolveBusinessTableCopyLabel(column)

  if (!copyText) return children

  const handleCopy = async (event) => {
    const trigger = event.currentTarget
    const shouldReleasePointerFocus = event.detail > 0
    event.stopPropagation()
    try {
      await copyTextToClipboard(copyText)
      message.success(copyConfig.successText || `${copyLabel}已复制`)
    } catch {
      message.error(copyConfig.errorText || '复制失败，请手动复制')
    } finally {
      if (shouldReleasePointerFocus && document.activeElement === trigger) {
        trigger.blur()
      }
    }
  }

  return (
    <div
      className="erp-business-table-copyable-cell"
      data-copyable-column={businessTableCopyColumnKey(column) || undefined}
      data-align={column.align || 'left'}
    >
      <div
        className="erp-business-table-copyable-cell__content"
        title={copyText}
      >
        {children}
      </div>
      <Button
        type="text"
        size="small"
        className="erp-business-table-copyable-cell__button"
        icon={<CopyOutlined />}
        aria-label={`复制${copyLabel}`}
        title={`复制${copyLabel}`}
        onClick={handleCopy}
        onDoubleClick={(event) => event.stopPropagation()}
      />
    </div>
  )
}

function normalizeBusinessTableColumn(column) {
  if (!column || typeof column !== 'object') {
    return column
  }

  const nextColumn = { ...column }
  const { onCell } = column
  nextColumn.onCell = (...args) => {
    const props = onCell?.(...args) || {}
    return {
      ...props,
      style: {
        minWidth: resolveBusinessTableColumnWidth(column),
        ...props.style,
      },
    }
  }
  delete nextColumn.ellipsis
  if (Array.isArray(nextColumn.children)) {
    nextColumn.children = normalizeBusinessTableColumns(nextColumn.children)
  }
  if (nextColumn.copyable) {
    const renderCell = nextColumn.render
    nextColumn.render = (value, record, index) => {
      const renderedValue =
        typeof renderCell === 'function'
          ? renderCell(value, record, index)
          : value
      return (
        <CopyableBusinessTableCell
          column={nextColumn}
          value={value}
          record={record}
        >
          {renderedValue}
        </CopyableBusinessTableCell>
      )
    }
  }

  return nextColumn
}

export function normalizeBusinessTableColumns(columns = []) {
  return filterBusinessListColumns(columns).map(normalizeBusinessTableColumn)
}

function resolveBusinessTableScrollX({ columns = [], rowSelection, scrollX }) {
  const estimatedColumnsWidth = columns.reduce(
    (total, column) => total + resolveBusinessTableColumnWidth(column),
    rowSelection ? TABLE_SELECTION_COLUMN_WIDTH : 0
  )
  const estimatedScrollX = Math.max(
    BUSINESS_TABLE_DEFAULT_SCROLL_X,
    estimatedColumnsWidth
  )

  if (Number.isFinite(scrollX)) {
    return Math.max(scrollX, estimatedScrollX)
  }

  if (scrollX === true || scrollX == null) {
    return estimatedScrollX
  }

  return scrollX
}

function resolveBusinessTableRowSelection(rowSelection) {
  if (!rowSelection) return rowSelection

  if (rowSelection.type !== 'radio') return rowSelection

  const columnTitle =
    rowSelection.columnTitle && rowSelection.columnTitle !== '选择'
      ? rowSelection.columnTitle
      : null

  return {
    ...rowSelection,
    columnTitle,
  }
}

export function BusinessPageLayout({ children, className = '' }) {
  const [selectionAvailability, setSelectionAvailability] = React.useState({ visible: false, loading: false })
  const selectionContext = React.useMemo(
    () => ({ ...selectionAvailability, setSelectionAvailability }),
    [selectionAvailability]
  )
  return (
    <BusinessSelectionAvailabilityContext.Provider value={selectionContext}>
      <div className={joinClassNames('erp-business-page-layout', className)} data-table-scroll-scope>
        {children}
      </div>
    </BusinessSelectionAvailabilityContext.Provider>
  )
}

export function PageHeaderCard({
  title,
  helpKey = '',
  compact = false,
  viewSwitch = null,
  className = '',
}) {
  const { moduleWorkspace, mobileTaskBusiness } = useOutletContext() || {}
  const insideModule = Boolean(moduleWorkspace?.tabs.length)
  if (mobileTaskBusiness) return null
  if (insideModule && !viewSwitch) return null

  return (
    <Card
      className={joinClassNames(
        'erp-business-page-header-card erp-business-module-hero',
        compact ? 'erp-business-page-header-card--compact' : '',
        insideModule ? 'erp-business-page-header-card--secondary' : '',
        className
      )}
    >
      <div className="erp-business-page-header-card__grid erp-business-module-hero__grid">
        {!insideModule && (
          <div className="erp-business-page-header-card__main erp-business-module-hero__main">
            <div>
              <div className="erp-business-page-header-card__title-row">
                <h1>{title}</h1>
                <BusinessPageHelpTrigger pageKey={helpKey} />
              </div>
            </div>
          </div>
        )}
        {viewSwitch}
        {!insideModule ? <ERPPageActions /> : null}
      </div>
    </Card>
  )
}

export function BusinessFilterPanel({
  children,
  actions = null,
  summary = null,
  compact = false,
}) {
  const hasAside = Boolean(actions || summary)
  return (
    <Card
      className={joinClassNames(
        'erp-business-filter-panel erp-business-module-filter-panel erp-business-module-toolbar',
        hasAside ? 'erp-business-filter-panel--with-actions' : '',
        compact ? 'erp-business-filter-panel--compact' : ''
      )}
    >
      <div className="erp-business-filter-panel__row erp-business-module-toolbar__row">
        <div className="erp-business-filter-panel__grid erp-business-module-toolbar__filters">
          {children}
        </div>
        {hasAside ? (
          <div className="erp-business-filter-panel__aside">
            {summary ? (
              <div className="erp-business-filter-panel__summary">
                {summary}
              </div>
            ) : null}
            {actions ? (
              <div className="erp-business-filter-panel__actions erp-business-module-toolbar__actions">
                {actions}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </Card>
  )
}

export function SearchInput({
  value,
  onSearch,
  placeholder = '搜索关键词',
  searchHint,
  className = '',
  ...restProps
}) {
  return (
    <SharedSearchInput
      allowClear
      className={joinClassNames(
        'erp-business-filter-control erp-business-filter-control--search',
        className
      )}
      placeholder={placeholder}
      searchHint={searchHint}
      value={value}
      onSearch={onSearch}
      {...restProps}
    />
  )
}

export function SelectFilter({
  value,
  onChange,
  options,
  placeholder,
  mode,
  allowClear = true,
  emptyValue = '',
  maxTagCount,
  className = '',
  onOpenChange,
  onMouseDownCapture,
  inline = false,
  ...restProps
}) {
  const selectRef = React.useRef(null)
  const inFilterPanel = React.useContext(BusinessFilterPanelContext)
  const filterLabel = restProps['aria-label'] || placeholder || '筛选条件'
  const scrollMobileSelectIntoView = React.useCallback((element) => {
    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(max-width: 768px)').matches
    ) {
      element?.scrollIntoView({
        block: 'center',
        inline: 'nearest',
      })
    }
  }, [])
  const handleMouseDownCapture = React.useCallback(
    (event) => {
      scrollMobileSelectIntoView(event.currentTarget)
      onMouseDownCapture?.(event)
    },
    [onMouseDownCapture, scrollMobileSelectIntoView]
  )
  const handleOpenChange = React.useCallback(
    (open) => {
      if (
        open &&
        typeof window !== 'undefined' &&
        window.matchMedia?.('(max-width: 768px)').matches
      ) {
        window.requestAnimationFrame(() => {
          scrollMobileSelectIntoView(selectRef.current?.nativeElement)
          window.requestAnimationFrame(() => {
            window.dispatchEvent(new Event('scroll'))
            window.dispatchEvent(new Event('resize'))
          })
        })
      }
      onOpenChange?.(open)
    },
    [onOpenChange, scrollMobileSelectIntoView]
  )

  if (inline) {
    return (
      <Segmented
        className="erp-business-status-filter"
        aria-label={restProps['aria-label'] || '业务状态'}
        value={value}
        options={options}
        onChange={onChange}
      />
    )
  }
  if (inFilterPanel && shouldUseDirectFilterChoices({ options, mode, allowClear, className, ...restProps })) {
    const choices = allowClear
      ? [{ value: emptyValue, label: '不限' }, ...filterSelectOptions(options, emptyValue)]
      : options
    return (
      <fieldset role="presentation" className="erp-business-filter-field erp-business-filter-field--choices" disabled={restProps.disabled || restProps.loading}>
        <legend>{filterLabel}</legend>
        <div className="erp-business-filter-choices" role="group" aria-label={filterLabel}>
          {choices.map((option) => (
            <FilterChip
              key={option.value ?? '__all'}
              selected={(allowClear && isEmptyFilterValue(value, emptyValue) ? emptyValue : value) === option.value}
              disabled={restProps.disabled || restProps.loading || option.disabled}
              onClick={() => onChange?.(option.value, option)}
            >
              {option.label}
            </FilterChip>
          ))}
        </div>
      </fieldset>
    )
  }
  const SelectControl = allowClear ? FilterSelect : Select
  const select = (
    <SelectControl
      ref={selectRef}
      {...(allowClear ? { emptyValue } : {})}
      label={inFilterPanel ? undefined : filterLabel}
      className={joinClassNames(
        'erp-business-filter-control erp-business-filter-control--select erp-business-filter-control--compact-select',
        className
      )}
      value={value}
      onChange={onChange}
      options={options}
      placeholder={placeholder || filterLabel}
      mode={mode}
      allowClear={allowClear}
      maxTagCount={maxTagCount}
      onOpenChange={handleOpenChange}
      onMouseDownCapture={handleMouseDownCapture}
      showSearch={false}
      optionFilterProp="label"
      {...restProps}
    />
  )
  return inFilterPanel ? (
    <label className="erp-business-filter-field">
      <span>{filterLabel}</span>
      {select}
    </label>
  ) : select
}

export function BusinessListToolbar({ stats = [], actions = null }) {
  const hasStats = stats.length > 0
  if (!hasStats && !actions) return null
  return (
    <Card className="erp-business-list-toolbar erp-business-module-toolbar">
      <div className="erp-business-list-toolbar__row erp-business-module-toolbar__row">
        {hasStats ? (
          <div className="erp-business-list-toolbar__stats">
            {stats.map((item) => (
              <span
                key={item.key || item.label}
                className="erp-business-list-toolbar__stat"
              >
                <Text type="secondary">{item.label}</Text>
                <strong>{item.value}</strong>
              </span>
            ))}
          </div>
        ) : null}
        {actions ? (
          <div className="erp-business-list-toolbar__actions erp-business-module-toolbar__actions">
            {actions}
          </div>
        ) : null}
      </div>
    </Card>
  )
}

export function BusinessOperationPanel({
  filters,
  viewSwitch,
  hidden = false,
  actions = null,
  primaryAction = null,
  onClearFilters = null,
  activeFilterCount = 0,
  children,
  showSelection = true,
  compact = false,
  filtersOpen: controlledFiltersOpen,
  onFiltersOpenChange,
}) {
  const { mobileTaskBusiness, mobileTaskCommand } = useOutletContext() || {}
  const selectionAvailability = React.useContext(BusinessSelectionAvailabilityContext)
  const hasToolbar = Boolean(actions || primaryAction)
  const hasClearFilters = typeof onClearFilters === 'function'
  const hasActiveFilters = activeFilterCount > 0
  const childActions = React.Children.toArray(flattenSelectionActions(children))
  const hasSelectedRecord = childActions.some((child) => child.type === SelectionActionBar && Number(child.props.selectedCount) > 0)
  const hasRecordActions = childActions.some((child) =>
    child.type === SelectionActionBar && flattenSelectionActions(child.props.children)
      .some((action) => action.type !== SelectionClearAction && inspectSelectionAction(action).actionable)
  )
  const showRecordActions = hasRecordActions && (hasSelectedRecord || (selectionAvailability?.visible ?? true))
  const hasVisibleChildren = showRecordActions || childActions.some((child) => child.type !== SelectionActionBar)
  const [internalFiltersOpen, setInternalFiltersOpen] = React.useState(false)
  const filtersOpen = controlledFiltersOpen ?? internalFiltersOpen
  const setFiltersOpen = (open) => {
    if (controlledFiltersOpen === undefined) setInternalFiltersOpen(open)
    onFiltersOpenChange?.(open)
  }
  const filterTriggerRef = React.useRef(null)
  const filterPanelRef = React.useRef(null)
  const filterPanelId = React.useId()
  const closeFilters = () => {
    setFiltersOpen(false)
    filterTriggerRef.current?.focus({ preventScroll: true })
  }
  if (mobileTaskBusiness) return <>{mobileTaskCommand ? primaryAction : null}{children}</>
  if (hidden) return null
  const filterControls = React.Children.toArray(
    flattenSelectionActions(filters)
  )
  const primarySearch = filterControls.find(
    (child) => child.type === SearchInput || child.props?.primarySearch
  )
  const searchControls = primarySearch ? [primarySearch] : []
  const additionalFilters = filterControls.filter(
    (child) => child !== primarySearch && !child.props?.inline
  )
  const quickFilters = filterControls.filter((child) => child.props?.inline)
  return (
    <Card
      className={joinClassNames(
        'erp-business-operation-panel',
        compact ? 'erp-business-operation-panel--compact' : '',
        hasRecordActions ? 'erp-business-operation-panel--record-actions' : ''
      )}
    >
      <div className="erp-business-operation-panel__command">
        {viewSwitch ? <div className="erp-business-operation-panel__view-switch">{viewSwitch}</div> : null}
        {quickFilters.length ? (
          <div className="erp-business-operation-panel__quick">
            {quickFilters}
          </div>
        ) : null}
        <div className="erp-business-operation-panel__search">
          {searchControls}
        </div>
        {additionalFilters.length > 0 ? (
          <Space.Compact
            className="erp-business-filter-trigger-group"
            role="group"
            aria-label="筛选操作"
          >
            <Popover
              trigger="click"
              placement="bottomLeft"
              align={{ overflow: { adjustX: true, adjustY: true, shiftY: true } }}
              open={filtersOpen}
              onOpenChange={setFiltersOpen}
              classNames={{ root: 'erp-business-filter-popover' }}
              afterOpenChange={(open) => {
                // Opening motion must not take focus back from a field already in use.
                if (
                  open &&
                  (document.activeElement === filterTriggerRef.current ||
                    document.activeElement === document.body)
                ) {
                  filterPanelRef.current?.focus({ preventScroll: true })
                }
              }}
              content={
                <section
                  className="erp-business-filter-popover__content"
                  aria-label="筛选条件"
                  role="dialog"
                  id={filterPanelId}
                  ref={filterPanelRef}
                  tabIndex={-1}
                  onKeyDownCapture={(event) => {
                    if (
                      event.defaultPrevented ||
                      document.querySelector(
                        '.ant-select-dropdown:not(.ant-select-dropdown-hidden), .ant-picker-dropdown:not(.ant-picker-dropdown-hidden)'
                      )
                    ) {
                      return
                    }
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      event.stopPropagation()
                      closeFilters()
                    }
                    if (event.key === 'Tab') {
                      const controls = [
                        ...event.currentTarget.querySelectorAll(
                          'button:not(:disabled), input:not(:disabled), [tabindex="0"]'
                        ),
                      ].filter((node) => node.getClientRects().length)
                      const first = controls[0]
                      const last = controls.at(-1)
                      if (
                        event.shiftKey &&
                        (document.activeElement === first ||
                          document.activeElement === event.currentTarget)
                      ) {
                        event.preventDefault()
                        last?.focus()
                      } else if (
                        !event.shiftKey &&
                        document.activeElement === last
                      ) {
                        event.preventDefault()
                        first?.focus()
                      }
                    }
                  }}
                >
                  <header>
                    <strong>筛选条件</strong>
                    {hasClearFilters ? (
                      <Button
                        aria-label="清空筛选"
                        size="small"
                        type="text"
                        disabled={!hasActiveFilters}
                        icon={<RollbackOutlined />}
                        onClick={() => {
                          onClearFilters()
                          filterPanelRef.current?.focus({ preventScroll: true })
                        }}
                      >
                        清空筛选
                      </Button>
                    ) : null}
                  </header>
                  <div className="erp-business-operation-panel__filters">
                    <BusinessFilterPanelContext.Provider value>
                      {additionalFilters}
                    </BusinessFilterPanelContext.Provider>
                  </div>
                  <footer>
                    <Button type="primary" onClick={closeFilters}>
                      完成
                    </Button>
                  </footer>
                </section>
              }
            >
              <Button
                ref={filterTriggerRef}
                icon={<FilterOutlined aria-hidden />}
                aria-label={hasActiveFilters ? `筛选，已应用 ${activeFilterCount} 项` : '筛选'}
                aria-haspopup="dialog"
                aria-controls={filtersOpen ? filterPanelId : undefined}
                aria-expanded={filtersOpen}
                className={
                  hasActiveFilters ? 'erp-business-filter-trigger--active' : ''
                }
              >
                筛选{hasActiveFilters ? ` · ${activeFilterCount}` : ''}
              </Button>
            </Popover>
            {hasActiveFilters && hasClearFilters ? (
              <Tooltip title="清空额外条件，保留搜索与快捷筛选">
                <Button
                  className="erp-business-filter-clear"
                  aria-label="清空筛选"
                  icon={<CloseOutlined aria-hidden />}
                  onClick={() => {
                    onClearFilters()
                    closeFilters()
                  }}
                />
              </Tooltip>
            ) : null}
          </Space.Compact>
        ) : null}
        {!actions ? <span data-table-scroll-toolbar /> : null}
        {hasToolbar ? (
          <div className="erp-business-operation-panel__toolbar">
            {actions ? (
              <div className="erp-business-operation-panel__actions">
                {actions}
                <span data-table-scroll-toolbar />
              </div>
            ) : null}
            {primaryAction ? (
              <div className="erp-business-operation-panel__primary">
                {hasSelectedRecord ? deEmphasizeCreation(primaryAction) : primaryAction}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
      {showSelection && childActions.length > 0 ? (
        <div
          className="erp-business-operation-panel__selection"
          hidden={!hasVisibleChildren}
          style={hasVisibleChildren ? undefined : { display: 'none' }}
        >
          {childActions}
        </div>
      ) : null}
    </Card>
  )
}

export function SelectionActionBar({
  selectedCount,
  selectedLabel,
  selectedItems = [],
  summaryItems = [],
  collaborationItems = [],
  children,
  embedded = false,
}) {
  const { mobileTaskBusiness } = useOutletContext() || {}
  const selectionAvailability = React.useContext(BusinessSelectionAvailabilityContext)
  const hasSelection = Number(selectedCount) > 0
  const actionNodes = flattenSelectionActions(children).filter((action) => !mobileTaskBusiness || !isSourceDocumentDetailsAction(action))
  const clearActions = actionNodes.filter(
    (child) => child.type === SelectionClearAction
  )
  const recordActions = actionNodes.filter(
    (child) => child.type !== SelectionClearAction
  ).map((action, index) => {
    if (!React.isValidElement(action)) return action
    const key = action.key || (inspectSelectionAction(action).pinned ? 'task-collaboration' : `record-action-${index}`)
    const node = React.cloneElement(action, { key })
    return hasSelection ? node : disableUnselectedAction(node)
  })
  const visible = hasSelection || (recordActions.length > 0 && (selectionAvailability?.visible ?? true))
  const loading = !hasSelection && selectionAvailability?.loading
  if (mobileTaskBusiness) {
    if (!hasSelection || !mobileTaskBusiness.actionHost) return null
    return createPortal(
      <div className="mobile-task-business-primary" role="group" aria-label="本次业务操作">
        <ResponsiveSelectionActions mobile>{recordActions}</ResponsiveSelectionActions>
      </div>,
      mobileTaskBusiness.actionHost
    )
  }
  const className = joinClassNames(
    'erp-business-selection-action-bar erp-business-module-current-action',
    hasSelection
      ? 'erp-business-selection-action-bar--active'
      : 'erp-business-selection-action-bar--empty',
    embedded ? 'erp-business-selection-action-bar--embedded' : '',
    loading ? 'erp-business-selection-action-bar--loading' : ''
  )
  const content = (
    <div className="erp-business-selection-action-bar__row">
      <div className="erp-business-selection-action-bar__copy erp-business-module-selection-block">
        <div className="erp-business-selection-action-bar__primary">
          {!hasSelection ? <Text strong>当前操作</Text> : null}
          <SelectedItemsSummaryTag
            selectedCount={selectedCount}
            selectedLabel={selectedLabel}
            selectedItems={selectedItems}
          />
          {hasSelection ? clearActions.map((action, index) => React.cloneElement(action, { compact: true, key: action.key || `clear-selection-${index}` })) : null}
        </div>
        {summaryItems.length > 0 ? (
          <div className="erp-business-selection-action-bar__summary">
            {summaryItems.map((item) => (
              <span
                key={item.key || `${item.label}-${item.value}`}
                className="erp-business-selection-action-bar__summary-item"
              >
                <Text type="secondary">{item.label}</Text>
                <strong>{item.value}</strong>
              </span>
            ))}
          </div>
        ) : null}
        {collaborationItems.length > 0 ? (
          <div className="erp-business-selection-action-bar__collab">
            {collaborationItems.map((item) => (
              <Tag
                key={item.key || `${item.label}-${item.value}`}
                color={item.color || 'default'}
              >
                {item.label} {item.value}
              </Tag>
            ))}
          </div>
        ) : null}
      </div>
      {recordActions.length > 0 ? (
        <div
          className="erp-business-selection-action-bar__record-actions"
          role="group"
          aria-label="当前记录操作"
        >
          <ConfigProvider componentDisabled={!hasSelection}>
            <ResponsiveSelectionActions>
              {recordActions}
            </ResponsiveSelectionActions>
          </ConfigProvider>
        </div>
      ) : null}
    </div>
  )

  if (embedded) {
    return <div className={className} aria-label="当前操作" aria-hidden={loading || undefined} hidden={!visible} style={visible ? undefined : { display: 'none' }}>{content}</div>
  }

  return <Card className={className} aria-label="当前操作" aria-hidden={loading || undefined} hidden={!visible} style={visible ? undefined : { display: 'none' }}>{content}</Card>
}

export function BusinessActionTooltip({
  children,
  visible = true,
  disabled = false,
  disabledReason = '',
}) {
  if (!visible) return null
  return (
    <Tooltip
      title={disabled && disabledReason ? disabledReason : null}
      trigger={['hover', 'focus']}
    >
      {/* Disabled Ant buttons cannot receive focus; this stable wrapper exposes the reason to keyboard users. */}
      {/* eslint-disable jsx-a11y/no-noninteractive-tabindex */}
      <span
        className="erp-business-action-tooltip-anchor"
        tabIndex={disabled && disabledReason ? 0 : undefined}
        aria-disabled={disabled && disabledReason ? true : undefined}
        aria-label={disabled && disabledReason ? disabledReason : undefined}
      >
        {children}
      </span>
      {/* eslint-enable jsx-a11y/no-noninteractive-tabindex */}
    </Tooltip>
  )
}

export function SelectionClearAction({
  selectedCount = 0,
  label = '清空已选',
  selectionLabel = '记录',
  disabled = false,
  disabledReason = '',
  onClear = () => {},
  compact = false,
}) {
  const actionDisabled = disabled || Number(selectedCount) <= 0
  const actionDisabledReason =
    disabled && disabledReason ? disabledReason : `请先选择${selectionLabel}`

  return (
    <BusinessActionTooltip
      disabled={actionDisabled}
      disabledReason={actionDisabledReason}
    >
      <Button
        data-business-action-key="clear-selection"
        type="text"
        size="small"
        aria-label={label}
        title={compact ? label : undefined}
        icon={compact ? <CloseOutlined /> : undefined}
        disabled={actionDisabled}
        onClick={onClear}
      >
        {compact ? null : label}
      </Button>
    </BusinessActionTooltip>
  )
}

SelectionClearAction.selectionActionPriority = 0

const LIFECYCLE_ACTION_ICONS = {
  submit: SendOutlined,
  confirm: CheckCircleOutlined,
  normal_close: CheckSquareOutlined,
  short_close: StopOutlined,
  cancel: StopOutlined,
}

function getLifecycleActionIcon(action) {
  const Icon = Object.hasOwn(LIFECYCLE_ACTION_ICONS, action?.key)
    ? LIFECYCLE_ACTION_ICONS[action.key]
    : null
  return Icon ? <Icon aria-hidden="true" /> : undefined
}

export function BusinessLifecyclePrimaryAction({
  action = null,
  disabled = false,
  disabledReason = '',
  loading = false,
  onAction = () => {},
  placeholder = '状态办理',
}) {
  if (!action) return null
  return (
    <BusinessActionTooltip disabled={disabled} disabledReason={disabledReason}>
      <Button
        icon={getLifecycleActionIcon(action)}
        data-business-action-key="lifecycle-primary"
        className="erp-business-module-status-action erp-action-button"
        size="small"
        type={isClosingLifecycleAction(action) ? 'default' : 'primary'}
        danger={action?.danger === true}
        disabled={disabled}
        loading={loading}
        onClick={() => {
          if (action) onAction(action)
        }}
      >
        {action?.label || placeholder}
      </Button>
    </BusinessActionTooltip>
  )
}

function isClosingLifecycleAction(action) {
  return ['normal_close', 'short_close', 'cancel'].includes(action?.key)
}

BusinessLifecyclePrimaryAction.selectionActionPriority = ({ action }) => isClosingLifecycleAction(action) ? 20 : 100
BusinessLifecyclePrimaryAction.selectionActionGroup = 'lifecycle'

export function BusinessLifecycleSecondaryAction({
  action = null,
  disabled = false,
  disabledReason = '',
  onAction = () => {},
}) {
  if (!action) return null
  return (
    <BusinessActionTooltip disabled={disabled} disabledReason={disabledReason}>
      <Button
        icon={getLifecycleActionIcon(action)}
        data-business-action-key={`lifecycle-${action.key}`}
        className="erp-business-module-status-action erp-action-button"
        size="small"
        danger={action.danger === true}
        disabled={disabled}
        onClick={() => onAction(action)}
      >
        {action.label}
      </Button>
    </BusinessActionTooltip>
  )
}

BusinessLifecycleSecondaryAction.selectionActionRole = 'secondary'
BusinessLifecycleSecondaryAction.selectionActionGroup = 'lifecycle'

export function SelectedItemsSummaryTag({
  selectedCount,
  selectedLabel,
  selectedItems = [],
}) {
  const hasSelection = Number(selectedCount) > 0
  const items = selectedItems
    .map((item, index) => ({
      key: item?.key ?? item?.id ?? `${item?.label || 'item'}-${index}`,
      label: String(item?.label ?? item?.name ?? item?.title ?? '').trim(),
      title: String(item?.title ?? item?.description ?? '').trim(),
    }))
    .filter((item) => item.label)
  const label = hasSelection
    ? selectedLabel || `已选择 ${selectedCount} 条记录`
    : '请选择一条记录'
  const tag = (
    <Tag
      tabIndex={hasSelection && items.length > 0 ? 0 : undefined}
      className="erp-business-selection-action-bar__tag erp-business-module-selection-tag"
      color={hasSelection ? 'green' : 'default'}
    >
      {label}
    </Tag>
  )

  if (!hasSelection || items.length === 0) {
    return hasSelection ? <Tooltip title={label}>{tag}</Tooltip> : tag
  }

  return (
    <Popover
      trigger={['hover', 'click', 'focus']}
      placement="bottomLeft"
      classNames={{ root: 'erp-business-selected-items-popover' }}
      title={`已选 ${selectedCount} 条`}
      content={
        <div className="erp-business-selected-items-popover__items">
          {items.map((item) => (
            <Tag
              key={item.key}
              title={item.title || item.label}
              className="erp-business-selected-items-popover__item"
            >
              {item.label}
            </Tag>
          ))}
        </div>
      }
    >
      {tag}
    </Popover>
  )
}

const BUSINESS_DATA_TABLE_INTERACTIVE_TARGET = [
  'a',
  'button',
  'input',
  'textarea',
  'select',
  'label',
  '[role="button"]',
  '[role="link"]',
  '.ant-table-selection-column',
  '.ant-radio-wrapper',
  '.ant-checkbox-wrapper',
].join(', ')

function isBusinessDataTableInteractiveTarget(target) {
  return Boolean(
    target instanceof Element &&
    target.closest(BUSINESS_DATA_TABLE_INTERACTIVE_TARGET)
  )
}

export function useBusinessTableRecordOpen({ dataSource, rowKey, onRow, onOpenRecord }) {
  const rowClickOriginRef = React.useRef(null)
  const handledDoubleClickRef = React.useRef(null)
  const resolvedOnRow = React.useCallback(
    (record, index) => {
      const rowProps = onRow?.(record, index) || {}
      if (typeof onOpenRecord !== 'function') return rowProps
      const userDoubleClick = rowProps.onDoubleClick
      return {
        ...rowProps,
        style: { cursor: 'pointer', ...(rowProps.style || {}) },
        title: rowProps.title || '单击选中，双击打开',
        onDoubleClick: (event) => {
          rowClickOriginRef.current = null
          if (isBusinessDataTableInteractiveTarget(event?.target)) return
          userDoubleClick?.(event)
          if (!event?.defaultPrevented) onOpenRecord(record, event)
        },
        onClick: (event) => {
          if (event.detail === 1) {
            rowClickOriginRef.current = !userDoubleClick && !isBusinessDataTableInteractiveTarget(event.target)
              ? { node: event.currentTarget, key: typeof rowKey === 'function' ? rowKey(record, index) : record[rowKey || 'key'], top: event.currentTarget.getBoundingClientRect().top, x: event.clientX, y: event.clientY }
              : null
          }
          rowProps.onClick?.(event)
          if (event.defaultPrevented) rowClickOriginRef.current = null
        },
      }
    },
    [onOpenRecord, onRow, rowKey]
  )
  const captureRowClick = React.useCallback((event) => {
    if (event.type === 'dblclick') {
      const handled = handledDoubleClickRef.current
      handledDoubleClickRef.current = null
      if (handled && Math.abs(event.clientX - handled.x) <= 2 && Math.abs(event.clientY - handled.y) <= 2) {
        event.preventDefault()
        event.stopPropagation()
      }
      return
    }
    const origin = rowClickOriginRef.current
    if (event.detail === 1) { rowClickOriginRef.current = null; handledDoubleClickRef.current = null; return }
    if (event.detail !== 2 || !origin || typeof onOpenRecord !== 'function' || origin.node.contains(event.target)) return
    rowClickOriginRef.current = null
    if (!origin.node.isConnected || !origin.node.getClientRects().length || Math.abs(origin.node.getBoundingClientRect().top - origin.top) < 1 || Math.abs(event.clientX - origin.x) > 2 || Math.abs(event.clientY - origin.y) > 2) return
    const matches = (dataSource || []).map((record, index) => ({ record, index })).filter(({ record, index }) => Object.is(typeof rowKey === 'function' ? rowKey(record, index) : record[rowKey || 'key'], origin.key))
    if (matches.length !== 1 || onRow?.(matches[0].record, matches[0].index)?.onDoubleClick) return
    // Selecting a row can insert the action bar between native clicks. Keep
    // that double click on its original record and out of the shifted header.
    event.preventDefault()
    event.stopPropagation()
    handledDoubleClickRef.current = { x: event.clientX, y: event.clientY }
    onOpenRecord(matches[0].record, event)
  }, [dataSource, onOpenRecord, onRow, rowKey])
  return { onRow: resolvedOnRow, onClickCapture: captureRowClick, onDoubleClickCapture: captureRowClick }
}

export function BusinessDataTable({
  tableHeader,
  loading,
  rowKey,
  columns,
  dataSource,
  // Let complete headers determine minimum column widths even with sticky columns.
  tableLayout = 'auto',
  expandable,
  scroll,
  rowSelection,
  rowClassName,
  onRow,
  onOpenRecord,
  onChange,
  pagination,
  emptyDescription = '暂无匹配记录',
}) {
  const { mobileTaskBusiness } = useOutletContext() || {}
  const tableCardRef = React.useRef(null)
  const sticky = useBusinessListStickyHeader(tableCardRef, !mobileTaskBusiness && !scroll?.y)
  const selectionContext = React.useContext(BusinessSelectionAvailabilityContext)
  const setSelectionAvailability = selectionContext?.setSelectionAvailability
  const selectionOwner = React.useId()
  const busy = typeof loading === 'object' ? Boolean(loading?.spinning) : Boolean(loading)
  const selectable = Boolean(rowSelection && dataSource?.some((record) => !rowSelection.getCheckboxProps?.(record)?.disabled))
  React.useLayoutEffect(() => {
    if (mobileTaskBusiness) return
    // A table without selection (for example in a detail dialog) does not own the page toolbar.
    setSelectionAvailability?.((current) => {
      if (!rowSelection && current.owner !== selectionOwner) return current
      const visible = busy ? current.visible : selectable
      if (current.owner === selectionOwner && current.visible === visible && current.loading === busy) return current
      return { owner: selectionOwner, visible, loading: busy }
    })
  }, [rowSelection, selectable, busy, mobileTaskBusiness, setSelectionAvailability, selectionOwner])
  React.useLayoutEffect(() => () => {
    setSelectionAvailability?.((current) => current.owner === selectionOwner ? { visible: false, loading: false } : current)
  }, [setSelectionAvailability, selectionOwner])
  const resolvedColumns = React.useMemo(
    () => normalizeBusinessTableColumns(columns),
    [columns]
  )
  const resolvedRowSelection = React.useMemo(
    () => resolveBusinessTableRowSelection(rowSelection),
    [rowSelection]
  )
  const hasPageLocalSorter = React.useMemo(
    () =>
      Boolean(
        pagination &&
        resolvedColumns.some((column) => typeof column?.sorter === 'function')
      ),
    [pagination, resolvedColumns]
  )
  const resolvedScroll = React.useMemo(() => {
    const baseScroll =
      scroll && typeof scroll === 'object' && !Array.isArray(scroll)
        ? scroll
        : {}
    return {
      ...baseScroll,
      x: resolveBusinessTableScrollX({
        columns: resolvedColumns,
        rowSelection: resolvedRowSelection,
        scrollX: baseScroll.x,
      }),
    }
  }, [resolvedColumns, resolvedRowSelection, scroll])
  const { onRow: resolvedOnRow, onClickCapture: captureRowClick } = useBusinessTableRecordOpen({ dataSource, rowKey, onRow, onOpenRecord })

  if (mobileTaskBusiness) {
    const selectedKeys = rowSelection?.selectedRowKeys || []
    const selected = (dataSource || []).find((row) => selectedKeys.includes(typeof rowKey === 'function' ? rowKey(row) : row[rowKey || 'id']))
    return (
      <section className="mobile-task-business-source" data-testid="mobile-task-business-source" data-record-id={selected?.id} aria-busy={busy}>
        <Spin spinning={busy}>
          {selected ? (
            <BusinessRecordDetails columns={columns} record={selected} presentation="mobile-task" />
          ) : <Empty description={busy ? '正在读取任务业务资料' : '未读取到任务对应单据，请返回任务后重新读取。'} />}
        </Spin>
      </section>
    )
  }

  return (
    <Card ref={tableCardRef} className={joinClassNames('erp-business-data-table-card erp-business-module-table-card', sticky && 'erp-business-data-table-card--sticky')} onClickCapture={captureRowClick} onDoubleClickCapture={captureRowClick}>
      {tableHeader ? (
        <div className="erp-business-data-table-card__header">{tableHeader}</div>
      ) : null}
      <Table
        scrollToolbar
        sticky={sticky}
        size="small"
        loading={loading}
        rowKey={rowKey}
        columns={resolvedColumns}
        dataSource={dataSource}
        tableLayout={tableLayout}
        expandable={expandable}
        scroll={resolvedScroll}
        rowSelection={resolvedRowSelection}
        rowClassName={rowClassName}
        onRow={resolvedOnRow}
        onChange={onChange}
        pagination={pagination ? { showTotal: formatPaginationTotal, ...pagination } : pagination}
        showSorterTooltip={
          hasPageLocalSorter ? { title: '仅排序当前页' } : undefined
        }
        locale={{
          emptyText: <Empty description={emptyDescription} />,
        }}
      />
    </Card>
  )
}

export const ToolbarButton = React.forwardRef(({ className = '', ...props }, ref) => {
  return (
    <Button
      ref={ref}
      className={joinClassNames('erp-business-toolbar-button', className)}
      {...props}
    />
  )
})
