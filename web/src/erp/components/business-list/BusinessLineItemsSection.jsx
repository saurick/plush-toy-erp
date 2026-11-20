import React from 'react'
import { Form } from 'antd'
import { BusinessLineItemsEmpty } from './BusinessCompactFieldTable.jsx'

import BusinessLineItemsFooter, {
  BusinessLineItemsHeader,
} from './BusinessLineItemsFooter.jsx'
import BusinessLineItemsTable from './BusinessLineItemsTable.jsx'
import BusinessGroupedLineItems from './BusinessGroupedLineItems.jsx'
import BusinessLineEditor from './BusinessLineEditor.jsx'

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
    <section className={classNames('erp-sales-order-lines-form', 'erp-line-editor-surface', className)} data-table-scroll-scope>
      <Form.List name={name}>
        {(fields, operations, meta) => {
          const context = { fields, ...operations, meta }
          const normalizedFooterProps =
            typeof footerProps === 'function'
              ? footerProps(context)
              : footerProps

          const header = (
            <BusinessLineItemsHeader title={title} description={description} notice={headerNotice} scrollControls>
              {headerActions ?? normalizedFooterProps?.children}
            </BusinessLineItemsHeader>
          )

          return (
            <>
              {renderBeforeHeader ? renderBeforeHeader(context) : null}
              {grouping && fields.length > 0 ? (
                <BusinessGroupedLineItems
                  title={title}
                  description={description}
                  notice={headerNotice}
                  headerActions={headerActions ?? normalizedFooterProps?.children}
                  fields={fields}
                  form={grouping.form}
                  getGroup={grouping.getGroup}
                  defaultExpanded={grouping.defaultExpanded}
                  name={name}
                  tableProps={{ columns, label: addLineAriaLabel || title }}
                >
                  {(field, index) => renderRow({ ...context, field, index })}
                </BusinessGroupedLineItems>
              ) : (
                <BusinessLineEditor>
                  {fields.length === 0 ? (
                    <>
                      {header}
                      <BusinessLineItemsEmpty>{emptyDescription}</BusinessLineItemsEmpty>
                    </>
                  ) : (
                    <BusinessLineItemsTable header={header} columns={columns} label={addLineAriaLabel || title} scrollControlsInToolbar>
                      {fields.map((field, index) => renderRow({ ...context, field, index }))}
                    </BusinessLineItemsTable>
                  )}
                </BusinessLineEditor>
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
