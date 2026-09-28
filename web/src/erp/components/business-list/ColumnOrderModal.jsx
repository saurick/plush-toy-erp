import React, { useEffect, useMemo, useState } from 'react'
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  UndoOutlined,
  VerticalAlignBottomOutlined,
  VerticalAlignTopOutlined,
} from '@ant-design/icons'
import { Button, Checkbox, Space } from 'antd'
import BusinessModal from '@/erp/components/business-list/BusinessModal.jsx'
import {
  applyModuleColumnOrder,
  completeModuleColumnOrder,
  filterBusinessListColumns,
  moveModuleColumnOrder,
  repositionModuleColumnOrder,
  resolveModuleColumnKey,
  sanitizeModuleColumnOrder,
  sanitizeModuleHiddenColumns,
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

  useEffect(() => {
    if (open) {
      setDraftOrder(sanitizeModuleColumnOrder(order, columns))
      setDraftHidden(sanitizeModuleHiddenColumns(hiddenColumns, columns))
    }
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

  const moveColumn = (key, direction) => {
    if (saving) {
      return
    }
    setDraftOrder(
      moveModuleColumnOrder(normalizedOrder, columns, key, direction)
    )
  }
  const repositionColumn = (key, targetIndex) => {
    if (saving) {
      return
    }
    setDraftOrder(
      repositionModuleColumnOrder(normalizedOrder, columns, key, targetIndex)
    )
  }
  const resetDraftOrder = () => {
    if (saving) {
      return
    }
    setDraftOrder([])
    setDraftHidden([])
  }
  const saveDraftOrder = async () => {
    if (saving) {
      return
    }
    const saved = await onChange?.(
      sanitizeModuleColumnOrder(draftOrder, columns),
      sanitizeModuleHiddenColumns(draftHidden, columns)
    )
    if (saved !== false) onClose?.()
  }

  return (
    <BusinessModal
      className="erp-business-action-modal erp-business-action-modal--columns"
      title={
        <div className="erp-business-action-modal__title">
          <span>列设置</span>
          <small>
            勾选显示列并调整顺序，点击完成保存到当前账号；不影响详情和导出。
          </small>
        </div>
      }
      open={open}
      size="columnOrder"
      onCancel={saving ? undefined : onClose}
      closable={!saving}
      maskClosable={!saving}
      keyboard={!saving}
      destroyOnHidden={false}
      footer={
        <Space wrap className="erp-business-column-order-modal__footer">
          <Button
            icon={<UndoOutlined aria-hidden="true" />}
            className="erp-action-button"
            disabled={saving}
            onClick={resetDraftOrder}
          >
            恢复默认
          </Button>
          <Button type="primary" loading={saving} onClick={saveDraftOrder}>
            完成
          </Button>
        </Space>
      }
    >
      <div
        className="erp-business-column-order-modal"
        role="list"
        aria-label={`${moduleTitle || '列表'}列设置`}
      >
        {orderedColumns.map((column, index) => {
          const key = resolveModuleColumnKey(column, columns)
          const label = getColumnDisplayLabel(column)
          const isFirst = index === 0
          const isLast = index === orderedColumns.length - 1
          const checked = !draftHidden.includes(key)
          const isOnlyVisible =
            checked && orderedColumns.length - draftHidden.length <= 1
          return (
            <div
              key={key}
              className="erp-business-column-order-modal__row erp-business-column-order-modal__row--visibility"
              role="listitem"
            >
              <span className="erp-business-column-order-modal__index">
                {index + 1}
              </span>
              <Checkbox
                className="erp-business-column-order-modal__label"
                checked={checked}
                disabled={saving || isOnlyVisible}
                title={isOnlyVisible ? '至少保留一列' : undefined}
                onChange={(event) =>
                  setDraftHidden((current) =>
                    event.target.checked
                      ? current.filter((item) => item !== key)
                      : [...current, key]
                  )
                }
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
