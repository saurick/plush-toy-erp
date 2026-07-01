import React from 'react'
import { Empty, Form } from 'antd'

import BusinessLineItemsFooter from './BusinessLineItemsFooter.jsx'

function classNames(...values) {
  return values.filter(Boolean).join(' ')
}

export default function BusinessLineItemsSection({
  addLineAriaLabel,
  className,
  description,
  emptyDescription = '暂无明细',
  footerProps,
  name = 'items',
  renderBeforeHeader,
  renderRow,
  title,
}) {
  return (
    <section className={classNames('erp-sales-order-lines-form', className)}>
      <Form.List name={name}>
        {(fields, operations, meta) => {
          const context = { fields, ...operations, meta }
          const normalizedFooterProps =
            typeof footerProps === 'function'
              ? footerProps(context)
              : footerProps

          return (
            <>
              {renderBeforeHeader ? renderBeforeHeader(context) : null}
              <div className="erp-sales-order-lines-form__head">
                <div>
                  <strong>{title}</strong>
                  {description ? <span>{description}</span> : null}
                </div>
              </div>
              {fields.length === 0 ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={emptyDescription}
                />
              ) : (
                <div
                  aria-label={addLineAriaLabel}
                  className="erp-sales-order-lines-form__list"
                >
                  {fields.map((field, index) =>
                    renderRow({ ...context, field, index })
                  )}
                </div>
              )}
              {normalizedFooterProps ? (
                <BusinessLineItemsFooter {...normalizedFooterProps} />
              ) : null}
            </>
          )
        }}
      </Form.List>
    </section>
  )
}
