import React, { forwardRef } from 'react'
import { PlusOutlined } from '@ant-design/icons'
import { Button, Popover } from 'antd'

function classNames(...values) {
  return values.filter(Boolean).join(' ')
}

export function BusinessLineItemsAddButton({
  addLabel = '添加明细',
  addDisabled = false,
  addLoading = false,
  addButtonClassName,
  addButtonProps,
  ariaLabel,
  placement = 'footer',
  onAdd,
}) {
  if (!onAdd) return null

  return (
    <Button
      {...addButtonProps}
      type={addButtonProps?.type ?? 'default'}
      icon={addButtonProps?.icon ?? <PlusOutlined aria-hidden="true" />}
      aria-label={ariaLabel || addLabel}
      className={classNames(
        'erp-line-items-form__add-button',
        `erp-line-items-form__add-button--${placement}`,
        addButtonClassName,
        addButtonProps?.className
      )}
      disabled={addDisabled}
      loading={addLoading}
      onClick={onAdd}
    >
      {addLabel}
    </Button>
  )
}

export function BusinessLineItemsHeader({
  title,
  description,
  children,
  addLabel = '添加明细',
  addDisabled = false,
  addLoading = false,
  addButtonClassName,
  addButtonProps,
  onAdd,
}) {
  return (
    <div className="erp-sales-order-lines-form__head">
      <div>
        <strong>{title}</strong>
        {description ? <span>{description}</span> : null}
      </div>
      {children || onAdd ? (
        <div className="erp-line-items-form__head-actions">
          {children}
          <BusinessLineItemsAddButton
            addLabel={addLabel}
            addDisabled={addDisabled}
            addLoading={addLoading}
            addButtonClassName={addButtonClassName}
            addButtonProps={addButtonProps}
            ariaLabel={`在顶部${addLabel}`}
            placement="head"
            onAdd={onAdd}
          />
        </div>
      ) : null}
    </div>
  )
}

function BusinessLineItemsFooter(
  {
    addLabel = '添加明细',
    addDisabled = false,
    addLoading = false,
    addButtonClassName,
    addButtonProps,
    onAdd,
    stats = [],
    detailsLabel = '金额明细',
  },
  ref
) {
  const normalizedStats = Array.isArray(stats) ? stats.filter(Boolean) : []
  const summaryStats = normalizedStats.filter((stat) => !stat.detail)
  const detailStats = normalizedStats.filter((stat) => stat.detail)

  return (
    <div className="erp-line-items-form__footer" ref={ref}>
      <div className="erp-line-items-form__footer-actions">
        <BusinessLineItemsAddButton
          addLabel={addLabel}
          addDisabled={addDisabled}
          addLoading={addLoading}
          addButtonClassName={addButtonClassName}
          addButtonProps={addButtonProps}
          onAdd={onAdd}
        />
      </div>
      {normalizedStats.length > 0 ? (
        <div className="erp-line-items-form__stats">
          {summaryStats.map((stat) => (
            <span
              className={classNames(
                'erp-line-items-form__stat',
                stat.emphasis && 'erp-line-items-form__stat--emphasis'
              )}
              key={stat.key}
            >
              {stat.label}
              <strong className="erp-line-items-form__stat-value">
                {stat.value}
              </strong>
              {stat.suffix}
            </span>
          ))}
          {detailStats.length > 0 ? (
            <Popover
              trigger="click"
              placement="topRight"
              title={detailsLabel}
              content={
                <dl className="erp-line-items-form__amount-details">
                  {detailStats.map((stat) => (
                    <div key={stat.key}>
                      <dt>{stat.label}</dt>
                      <dd>
                        {stat.value}
                        {stat.suffix}
                      </dd>
                    </div>
                  ))}
                </dl>
              }
            >
              <Button type="link" size="small">
                {detailsLabel}
              </Button>
            </Popover>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export default forwardRef(BusinessLineItemsFooter)
