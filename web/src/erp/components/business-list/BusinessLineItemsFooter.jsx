import React, { forwardRef } from 'react'
import { PlusOutlined } from '@ant-design/icons'
import { Button } from 'antd'

function BusinessLineItemsFooter(
  {
    addLabel = '添加条目',
    addDisabled = false,
    addLoading = false,
    addButtonClassName,
    addButtonProps,
    onAdd,
    stats = [],
  },
  ref
) {
  const normalizedStats = Array.isArray(stats) ? stats.filter(Boolean) : []

  return (
    <div className="erp-line-items-form__footer" ref={ref}>
      <div className="erp-line-items-form__footer-actions">
        {onAdd ? (
          <Button
            type="dashed"
            icon={<PlusOutlined />}
            {...addButtonProps}
            className={addButtonClassName}
            disabled={addDisabled}
            loading={addLoading}
            onClick={onAdd}
          >
            {addLabel}
          </Button>
        ) : null}
      </div>
      {normalizedStats.length > 0 ? (
        <div className="erp-line-items-form__stats">
          {normalizedStats.map((stat) => (
            <span className="erp-line-items-form__stat" key={stat.key}>
              {stat.label}
              <strong className="erp-line-items-form__stat-value">
                {stat.value}
              </strong>
              {stat.suffix}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  )
}

export default forwardRef(BusinessLineItemsFooter)
