import React, { useEffect, useMemo, useState } from 'react'
import {
  ArrowLeftOutlined,
  ArrowDownOutlined,
  ArrowRightOutlined,
  ArrowUpOutlined,
  DoubleLeftOutlined,
  DoubleRightOutlined,
  MoreOutlined,
  SettingOutlined,
  VerticalAlignBottomOutlined,
  VerticalAlignTopOutlined,
} from '@ant-design/icons'
import { Button, Dropdown, Modal, Space } from 'antd'
import {
  applyModuleColumnOrder,
  buildModuleColumnOrder,
  moveModuleColumnOrder,
  repositionModuleColumnOrder,
  resolveModuleColumnKey,
  sanitizeModuleColumnOrder,
} from '../../utils/moduleTableColumns.mjs'
import { ERP_MODAL_WIDTHS } from '../../utils/modalSizes.mjs'

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

export function ColumnOrderHeaderMenu({
  column = {},
  columns = [],
  order = [],
  saving = false,
  onChange,
  onOpenPanel,
}) {
  const label = getColumnDisplayLabel(column) || '当前列'
  const normalizedOrder = useMemo(() => {
    const sanitizedOrder = sanitizeModuleColumnOrder(order, columns)
    return sanitizedOrder.length > 0
      ? sanitizedOrder
      : buildModuleColumnOrder(columns)
  }, [columns, order])
  const columnKey = useMemo(() => {
    return resolveModuleColumnKey(column, columns)
  }, [column, columns])
  const currentIndex = normalizedOrder.indexOf(columnKey)
  const isFirst = currentIndex <= 0
  const isLast = currentIndex < 0 || currentIndex >= normalizedOrder.length - 1
  const updateOrder = (nextOrder) => {
    if (saving) {
      return
    }
    onChange?.(nextOrder)
  }

  return (
    <span className="erp-module-column-header">
      <span className="erp-module-column-header-text">{label}</span>
      <Dropdown
        trigger={['click']}
        destroyOnHidden
        getPopupContainer={(triggerNode) =>
          triggerNode.closest('.erp-business-data-table-card') ||
          triggerNode.parentElement ||
          document.body
        }
        menu={{
          items: [
            {
              key: 'move-left',
              icon: <ArrowLeftOutlined />,
              label: '左移一列',
              disabled: saving || isFirst,
            },
            {
              key: 'move-right',
              icon: <ArrowRightOutlined />,
              label: '右移一列',
              disabled: saving || isLast,
            },
            { type: 'divider' },
            {
              key: 'move-first',
              icon: <DoubleLeftOutlined />,
              label: '移到最前',
              disabled: saving || isFirst,
            },
            {
              key: 'move-last',
              icon: <DoubleRightOutlined />,
              label: '移到最后',
              disabled: saving || isLast,
            },
            { type: 'divider' },
            {
              key: 'open-panel',
              icon: <SettingOutlined />,
              label: '打开列顺序面板',
            },
          ],
          onClick: ({ key, domEvent }) => {
            domEvent?.stopPropagation?.()
            if (key === 'move-left') {
              updateOrder(
                moveModuleColumnOrder(normalizedOrder, columns, columnKey, -1)
              )
              return
            }
            if (key === 'move-right') {
              updateOrder(
                moveModuleColumnOrder(normalizedOrder, columns, columnKey, 1)
              )
              return
            }
            if (key === 'move-first') {
              updateOrder(
                repositionModuleColumnOrder(
                  normalizedOrder,
                  columns,
                  columnKey,
                  0
                )
              )
              return
            }
            if (key === 'move-last') {
              updateOrder(
                repositionModuleColumnOrder(
                  normalizedOrder,
                  columns,
                  columnKey,
                  normalizedOrder.length - 1
                )
              )
              return
            }
            onOpenPanel?.()
          },
        }}
      >
        <Button
          type="text"
          size="small"
          className="erp-module-column-header-trigger"
          icon={<MoreOutlined />}
          aria-label={`${label} 列设置`}
          title="调整列顺序"
          onClick={(event) => event.stopPropagation()}
          disabled={saving && normalizedOrder.length <= 1}
        />
      </Dropdown>
    </span>
  )
}

export function ColumnOrderModal({
  open,
  columns = [],
  order = [],
  saving = false,
  moduleTitle = '',
  onChange,
  onClose,
}) {
  const [draftOrder, setDraftOrder] = useState([])

  useEffect(() => {
    if (open) {
      setDraftOrder(sanitizeModuleColumnOrder(order, columns))
    }
  }, [columns, open, order])

  const normalizedOrder = useMemo(() => {
    const sanitizedOrder = sanitizeModuleColumnOrder(draftOrder, columns)
    return sanitizedOrder.length > 0
      ? sanitizedOrder
      : buildModuleColumnOrder(columns)
  }, [columns, draftOrder])
  const orderedColumns = useMemo(
    () => applyModuleColumnOrder(columns, normalizedOrder),
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
  }
  const saveDraftOrder = async () => {
    if (saving) {
      return
    }
    await onChange?.(sanitizeModuleColumnOrder(draftOrder, columns))
    onClose?.()
  }

  return (
    <Modal
      className="erp-business-action-modal erp-business-action-modal--columns"
      title={
        <div className="erp-business-action-modal__title">
          <span>调整列表列顺序</span>
          <small>调整后的列顺序会保存到当前账号，下次打开仍会保留。</small>
        </div>
      }
      open={open}
      width={ERP_MODAL_WIDTHS.columnOrder}
      onCancel={onClose}
      destroyOnHidden={false}
      footer={
        <Space wrap className="erp-business-column-order-modal__footer">
          <Button disabled={saving} onClick={resetDraftOrder}>
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
        aria-label={`${moduleTitle || '列表'}列顺序`}
      >
        {orderedColumns.map((column, index) => {
          const key = resolveModuleColumnKey(column, columns)
          const label = getColumnDisplayLabel(column)
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
