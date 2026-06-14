import React, { useMemo } from 'react'
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  VerticalAlignBottomOutlined,
  VerticalAlignTopOutlined,
} from '@ant-design/icons'
import { Button, Modal, Space } from 'antd'
import {
  applyModuleColumnOrder,
  buildModuleColumnOrder,
  getModuleColumnKey,
  moveModuleColumnOrder,
  repositionModuleColumnOrder,
  sanitizeModuleColumnOrder,
} from '../../utils/moduleTableColumns.mjs'

export function getColumnLabel(column = {}) {
  return String(column.exportTitle || column.title || column.key || '').trim()
}

export function ColumnOrderModal({
  open,
  columns = [],
  order = [],
  saving = false,
  moduleTitle = '',
  onChange,
  onReset,
  onClose,
}) {
  const normalizedOrder = useMemo(() => {
    const sanitizedOrder = sanitizeModuleColumnOrder(order, columns)
    return sanitizedOrder.length > 0
      ? sanitizedOrder
      : buildModuleColumnOrder(columns)
  }, [columns, order])
  const orderedColumns = useMemo(
    () => applyModuleColumnOrder(columns, normalizedOrder),
    [columns, normalizedOrder]
  )

  const moveColumn = (key, direction) => {
    onChange?.(moveModuleColumnOrder(normalizedOrder, columns, key, direction))
  }
  const repositionColumn = (key, targetIndex) => {
    onChange?.(
      repositionModuleColumnOrder(normalizedOrder, columns, key, targetIndex)
    )
  }

  return (
    <Modal
      className="erp-business-action-modal erp-business-action-modal--columns"
      title={
        <div className="erp-business-action-modal__title">
          <span>调整列表列顺序</span>
          <small>
            当前模块列顺序会跟随当前管理员账号保存；浏览器本地仅保留缓存兜底，表头菜单也可直接快捷调整。
          </small>
        </div>
      }
      open={open}
      width="min(960px, calc(100vw - 48px))"
      onCancel={onClose}
      destroyOnHidden={false}
      footer={
        <Space wrap className="erp-business-column-order-modal__footer">
          <Button disabled={saving} onClick={onReset}>
            恢复默认
          </Button>
          <Button type="primary" loading={saving} onClick={onClose}>
            完成
          </Button>
        </Space>
      }
    >
      <div
        className="erp-business-column-order-modal"
        role="list"
        aria-label={`${moduleTitle || '列表'}列顺序`}
      >
        {orderedColumns.map((column, index) => {
          const key = getModuleColumnKey(column, index)
          const label = getColumnLabel(column)
          const isFirst = index === 0
          const isLast = index === orderedColumns.length - 1
          return (
            <div
              key={key}
              className="erp-business-column-order-modal__row"
              role="listitem"
            >
              <span className="erp-business-column-order-modal__index">
                {index + 1}
              </span>
              <span className="erp-business-column-order-modal__label">
                {label}
              </span>
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
                >
                  移到最前
                </Button>
                <Button
                  className="erp-business-column-order-modal__action"
                  icon={<ArrowUpOutlined />}
                  aria-label={`${label} 上移`}
                  title="上移"
                  disabled={saving || isFirst}
                  onClick={() => moveColumn(key, -1)}
                >
                  上移
                </Button>
                <Button
                  className="erp-business-column-order-modal__action"
                  icon={<ArrowDownOutlined />}
                  aria-label={`${label} 下移`}
                  title="下移"
                  disabled={saving || isLast}
                  onClick={() => moveColumn(key, 1)}
                >
                  下移
                </Button>
                <Button
                  className="erp-business-column-order-modal__action"
                  icon={<VerticalAlignBottomOutlined />}
                  aria-label={`${label} 移到最后`}
                  title="移到最后"
                  disabled={saving || isLast}
                  onClick={() =>
                    repositionColumn(key, orderedColumns.length - 1)
                  }
                >
                  移到最后
                </Button>
              </Space>
            </div>
          )
        })}
      </div>
    </Modal>
  )
}
