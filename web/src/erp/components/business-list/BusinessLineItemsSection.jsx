import React from 'react'
import { Form } from 'antd'
import { BusinessLineItemsEmpty } from './BusinessCompactFieldTable.jsx'

import BusinessLineItemsFooter, {
  BusinessLineItemsHeader,
} from './BusinessLineItemsFooter.jsx'
import BusinessLineItemsTable from './BusinessLineItemsTable.jsx'
import BusinessGroupedLineItems from './BusinessGroupedLineItems.jsx'

function classNames(...values) {
  return values.filter(Boolean).join(' ')
}

export default function BusinessLineItemsSection({
  addLineAriaLabel,
  className,
  columns,
  description,
  emptyDescription = '暂无明细',
  footerProps,
  name = 'items',
  renderBeforeHeader,
  headerActions,
  headerNotice,
  grouping,
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
              <BusinessLineItemsHeader
                title={title}
                description={description}
                notice={headerNotice}
              >
                {headerActions ?? normalizedFooterProps?.children}
              </BusinessLineItemsHeader>
              {fields.length === 0 ? (
                <BusinessLineItemsEmpty>{emptyDescription}</BusinessLineItemsEmpty>
              ) : grouping ? (
                <BusinessGroupedLineItems
                  fields={fields}
                  form={grouping.form}
                  getGroup={grouping.getGroup}
                  name={name}
                  tableProps={{ columns, label: addLineAriaLabel || title }}
                >
                  {(field, index) => renderRow({ ...context, field, index })}
                </BusinessGroupedLineItems>
              ) : (
                <BusinessLineItemsTable
                  columns={columns}
                  label={addLineAriaLabel || title}
                >
                  {fields.map((field, index) =>
                    renderRow({ ...context, field, index })
                  )}
                </BusinessLineItemsTable>
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
