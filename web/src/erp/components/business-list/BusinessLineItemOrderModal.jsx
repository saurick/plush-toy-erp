import React, { useEffect, useMemo, useState } from 'react'
import {
  ArrowDownOutlined,
  ArrowUpOutlined,
  VerticalAlignBottomOutlined,
  VerticalAlignTopOutlined,
} from '@ant-design/icons'
import { Button, Empty, Modal, Space } from 'antd'

import { ERP_MODAL_WIDTHS } from '../../utils/modalSizes.mjs'
import {
  buildBusinessLineItemOrderEntries,
  businessLineItemOrderChanged,
  moveBusinessLineItem,
  orderedBusinessLineItems,
  repositionBusinessLineItem,
} from './businessLineItemOrder.mjs'
import './BusinessLineItemOrderModal.css'

function fallbackLineLabel(item, index, itemNoun) {
  const lineNo = Number(item?.line_no || 0)
  return lineNo > 0 ? `${itemNoun} ${lineNo}` : `第 ${index + 1} 条${itemNoun}`
}

export default function BusinessLineItemOrderModal({
  description = '应用后只调整当前表单中的明细顺序，保存单据后才会正式生效。',
  getItemLabel,
  itemNoun = '明细',
  items = [],
  onApply,
  onClose,
  open,
  title = '调整明细顺序',
}) {
  const [draftEntries, setDraftEntries] = useState([])

  useEffect(() => {
    if (open) {
      setDraftEntries(buildBusinessLineItemOrderEntries(items))
    }
  }, [items, open])

  const hasChanges = useMemo(
    () => businessLineItemOrderChanged(draftEntries),
    [draftEntries]
  )

  const applyOrder = () => {
    if (!hasChanges) return
    onApply?.(orderedBusinessLineItems(draftEntries))
    onClose?.()
  }

  return (
    <Modal
      className="erp-business-action-modal erp-business-action-modal--columns"
      destroyOnHidden={false}
      footer={
        <Space wrap className="erp-business-column-order-modal__footer">
          <Button onClick={onClose}>取消</Button>
          <Button type="primary" disabled={!hasChanges} onClick={applyOrder}>
            应用顺序
          </Button>
        </Space>
      }
      onCancel={onClose}
      open={open}
      title={
        <div className="erp-business-action-modal__title">
          <span>{title}</span>
          <small>{description}</small>
        </div>
      }
      width={ERP_MODAL_WIDTHS.columnOrder}
    >
      {draftEntries.length === 0 ? (
        <Empty description={`暂无可调整的${itemNoun}`} />
      ) : (
        <div
          aria-label={`${itemNoun}顺序`}
          className="erp-business-column-order-modal"
          role="list"
        >
          {draftEntries.map((entry, index) => {
            const label =
              String(getItemLabel?.(entry.item, index) || '').trim() ||
              fallbackLineLabel(entry.item, index, itemNoun)
            const isFirst = index === 0
            const isLast = index === draftEntries.length - 1
            return (
              <div
                className="erp-business-column-order-modal__row"
                key={entry.key}
                role="listitem"
              >
                <span className="erp-business-column-order-modal__index">
                  {index + 1}
                </span>
                <span className="erp-business-column-order-modal__label">
                  {label}
                </span>
                <Space
                  className="erp-business-column-order-modal__actions"
                  size={8}
                  wrap
                >
                  <Button
                    aria-label={`${label} 移到最前`}
                    className="erp-business-column-order-modal__action"
                    disabled={isFirst}
                    icon={<VerticalAlignTopOutlined />}
                    onClick={() =>
                      setDraftEntries((current) =>
                        repositionBusinessLineItem(current, entry.key, 0)
                      )
                    }
                  >
                    移到最前
                  </Button>
                  <Button
                    aria-label={`${label} 上移`}
                    className="erp-business-column-order-modal__action"
                    disabled={isFirst}
                    icon={<ArrowUpOutlined />}
                    onClick={() =>
                      setDraftEntries((current) =>
                        moveBusinessLineItem(current, entry.key, -1)
                      )
                    }
                  >
                    上移
                  </Button>
                  <Button
                    aria-label={`${label} 下移`}
                    className="erp-business-column-order-modal__action"
                    disabled={isLast}
                    icon={<ArrowDownOutlined />}
                    onClick={() =>
                      setDraftEntries((current) =>
                        moveBusinessLineItem(current, entry.key, 1)
                      )
                    }
                  >
                    下移
                  </Button>
                  <Button
                    aria-label={`${label} 移到最后`}
                    className="erp-business-column-order-modal__action"
                    disabled={isLast}
                    icon={<VerticalAlignBottomOutlined />}
                    onClick={() =>
                      setDraftEntries((current) =>
                        repositionBusinessLineItem(
                          current,
                          entry.key,
                          current.length - 1
                        )
                      )
                    }
                  >
                    移到最后
                  </Button>
                </Space>
              </div>
            )
          })}
        </div>
      )}
    </Modal>
  )
}
