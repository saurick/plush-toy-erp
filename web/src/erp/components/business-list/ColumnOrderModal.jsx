import React, { useEffect, useMemo, useRef, useState } from 'react'
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  HolderOutlined,
  UndoOutlined,
  VerticalAlignBottomOutlined,
  VerticalAlignTopOutlined,
} from '@ant-design/icons'
import { Button, Checkbox, Space } from 'antd'
import BusinessModal from '@/erp/components/business-list/BusinessModal.jsx'
import {
  applyModuleColumnOrder,
  buildDefaultModuleHiddenColumns,
  completeModuleColumnOrder,
  filterBusinessListColumns,
  moveModuleColumnOrder,
  repositionModuleColumnOrder,
  resolveModuleColumnKey,
  resolveModuleHiddenColumns,
} from '../../utils/moduleTableColumns.mjs'

const EMPTY_COLUMNS = Object.freeze([])

export function getColumnLabel(column = {}) {
  return String(column.exportTitle || column.title || column.key || '').trim()
}

export function getColumnDisplayLabel(column = {}) {
  if (typeof column.title === 'string' || typeof column.title === 'number') {
    const title = String(column.title).trim()
    if (title) return title
  }
  return getColumnLabel(column)
}

export function ColumnOrderModal({
  open,
  columns = EMPTY_COLUMNS,
  order = EMPTY_COLUMNS,
  hiddenColumns = EMPTY_COLUMNS,
  saving = false,
  moduleTitle = '',
  onChange,
  onClose,
}) {
  const [draftOrder, setDraftOrder] = useState([])
  const [draftHidden, setDraftHidden] = useState([])
  const [dropTarget, setDropTarget] = useState(null)
  const contentRef = useRef(null)
  const wasOpenRef = useRef(false)
  const draggedColumnRef = useRef(null)

  useEffect(() => {
    // 同一次打开只初始化一次草稿，普通重绘和保存失败不覆盖用户调整。
    if (open && !wasOpenRef.current) {
      setDraftOrder(completeModuleColumnOrder(order, columns))
      setDraftHidden(resolveModuleHiddenColumns(order, hiddenColumns, columns))
      setDropTarget(null)
      draggedColumnRef.current = null
    }
    wasOpenRef.current = open
  }, [columns, hiddenColumns, open, order])

  const normalizedOrder = useMemo(() => {
    return completeModuleColumnOrder(draftOrder, columns)
  }, [columns, draftOrder])
  const orderedColumns = useMemo(
    () =>
      filterBusinessListColumns(
        applyModuleColumnOrder(columns, normalizedOrder)
      ),
    [columns, normalizedOrder]
  )
  const normalizedHidden = resolveModuleHiddenColumns(
    draftOrder,
    draftHidden,
    columns
  )
  const savedOrder = completeModuleColumnOrder(order, columns)
  const savedHidden = resolveModuleHiddenColumns(order, hiddenColumns, columns)
  const hasChanges =
    normalizedOrder.some((key, index) => key !== savedOrder[index]) ||
    normalizedHidden.length !== savedHidden.length ||
    normalizedHidden.some((key) => !savedHidden.includes(key))
  const visibleCount = orderedColumns.length - normalizedHidden.length

  const moveColumn = (key, direction) => {
    if (saving) {
      return
    }
    setDraftHidden(normalizedHidden)
    setDraftOrder(
      moveModuleColumnOrder(normalizedOrder, columns, key, direction)
    )
  }
  const repositionColumn = (key, targetIndex) => {
    if (saving) {
      return
    }
    setDraftHidden(normalizedHidden)
    setDraftOrder(
      repositionModuleColumnOrder(normalizedOrder, columns, key, targetIndex)
    )
  }
  const resetDraftOrder = () => {
    if (saving) {
      return
    }
    setDraftOrder(completeModuleColumnOrder([], columns))
    setDraftHidden(buildDefaultModuleHiddenColumns(columns))
  }
  const saveDraftOrder = async () => {
    if (saving) {
      return
    }
    const saved = await onChange?.(
      normalizedOrder,
      normalizedHidden
    )
    if (saved !== false) onClose?.()
  }

  return (
    <BusinessModal
      className="erp-business-action-modal erp-business-action-modal--columns"
      title={
        <div className="erp-business-action-modal__title">
          <span>列设置</span>
          <small>{moduleTitle || '当前列表'} · 仅对当前账号生效</small>
        </div>
      }
      open={open}
      size="columnOrder"
      afterOpenChange={(visible) => {
        if (!visible) return
        window.requestAnimationFrame(() => {
          const firstControl =
            contentRef.current?.querySelector('input:not(:disabled)') ||
            contentRef.current?.querySelector('button:not(:disabled)')
          firstControl?.focus({ preventScroll: true })
        })
      }}
      onCancel={saving ? undefined : onClose}
      closable={!saving}
      maskClosable={!saving}
      keyboard={!saving}
      destroyOnHidden={false}
      footer={
        <div className="erp-business-column-order-modal__footer">
          <span
            className="erp-business-column-order-modal__draft-status"
            data-dirty={hasChanges}
            role="status"
          >
            {hasChanges ? '有未保存的调整' : '至少保留一列'}
          </span>
          <Space>
            <Button disabled={saving} onClick={onClose}>取消</Button>
            <Button
              type="primary"
              aria-label="完成"
              aria-busy={saving}
              loading={saving}
              onClick={saveDraftOrder}
            >
              完成
            </Button>
          </Space>
        </div>
      }
    >
      <p className="erp-business-column-order-modal__description">
        勾选显示列，拖动或用箭头调整顺序；详情和导出不变。
      </p>
      <div className="erp-business-column-order-modal__toolbar">
        <span role="status">已选 {visibleCount} / {orderedColumns.length} 列</span>
        <Space size={4} wrap>
          <Button
            type="link"
            disabled={saving || normalizedHidden.length === 0}
            onClick={() => {
              setDraftOrder(normalizedOrder)
              setDraftHidden([])
            }}
          >
            全部显示
          </Button>
          <Button
            type="link"
            icon={<UndoOutlined aria-hidden="true" />}
            disabled={saving}
            onClick={resetDraftOrder}
          >
            恢复默认
          </Button>
        </Space>
      </div>
      <div
        ref={contentRef}
        className="erp-business-column-order-modal"
        role="list"
        aria-label={`${moduleTitle || '列表'}列设置`}
      >
        {orderedColumns.map((column, index) => {
          const key = resolveModuleColumnKey(column, columns)
          const label = getColumnDisplayLabel(column)
          const isFirst = index === 0
          const isLast = index === orderedColumns.length - 1
          const checked = !normalizedHidden.includes(key)
          const isOnlyVisible = checked && visibleCount <= 1
          return (
            <div
              key={key}
              className="erp-business-column-order-modal__row erp-business-column-order-modal__row--visibility"
              role="listitem"
              data-column-key={key}
              data-drop-target={dropTarget === key}
              onDragOver={(event) => {
                if (saving || !draggedColumnRef.current) return
                event.preventDefault()
                event.dataTransfer.dropEffect = 'move'
                setDropTarget(key)
              }}
              onDrop={(event) => {
                const draggedKey = draggedColumnRef.current
                if (saving || !draggedKey) return
                event.preventDefault()
                draggedColumnRef.current = null
                setDropTarget(null)
                repositionColumn(draggedKey, index)
              }}
            >
              <Button
                type="text"
                className="erp-business-column-order-modal__index erp-business-column-order-modal__drag-handle"
                icon={<HolderOutlined aria-hidden="true" />}
                aria-label={`${label} 拖动排列`}
                title="拖动排列，也可使用右侧移动按钮"
                tabIndex={-1}
                draggable={!saving}
                disabled={saving}
                onDragStart={(event) => {
                  draggedColumnRef.current = key
                  event.dataTransfer.effectAllowed = 'move'
                  event.dataTransfer.setData('text/plain', key)
                }}
                onDragEnd={() => {
                  draggedColumnRef.current = null
                  setDropTarget(null)
                }}
              >
                {index + 1}
              </Button>
              <Checkbox
                className="erp-business-column-order-modal__label"
                checked={checked}
                disabled={saving || isOnlyVisible}
                title={isOnlyVisible ? '至少保留一列' : undefined}
                onChange={(event) => {
                  setDraftOrder(normalizedOrder)
                  setDraftHidden(
                    event.target.checked
                      ? normalizedHidden.filter((item) => item !== key)
                      : [...normalizedHidden, key]
                  )
                }}
              >
                {label}
              </Checkbox>
              <Space
                size={8}
                wrap
                className="erp-business-column-order-modal__actions"
              >
                <Button
                  className="erp-business-column-order-modal__action"
                  icon={<VerticalAlignTopOutlined />}
                  aria-label={`${label} 移到最前`}
                  title="移到最前"
                  disabled={saving || isFirst}
                  onClick={() => repositionColumn(key, 0)}
                />
                <Button
                  className="erp-business-column-order-modal__action"
                  icon={<ArrowUpOutlined />}
                  aria-label={`${label} 上移`}
                  title="上移"
                  disabled={saving || isFirst}
                  onClick={() => moveColumn(key, -1)}
                />
                <Button
                  className="erp-business-column-order-modal__action"
                  icon={<ArrowDownOutlined />}
                  aria-label={`${label} 下移`}
                  title="下移"
                  disabled={saving || isLast}
                  onClick={() => moveColumn(key, 1)}
                />
                <Button
                  className="erp-business-column-order-modal__action"
                  icon={<VerticalAlignBottomOutlined />}
                  aria-label={`${label} 移到最后`}
                  title="移到最后"
                  disabled={saving || isLast}
                  onClick={() =>
                    repositionColumn(key, orderedColumns.length - 1)
                  }
                />
              </Space>
            </div>
          )
        })}
      </div>
    </BusinessModal>
  )
}
