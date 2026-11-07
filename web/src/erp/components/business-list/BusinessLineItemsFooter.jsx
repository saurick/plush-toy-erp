import React, { forwardRef, useRef } from 'react'
import { PlusOutlined } from '@ant-design/icons'
import { Button, Popover } from 'antd'
import './businessFormSections.css'
import { useTableStickyToolbar } from '@/common/components/table/TableStickyHeader.jsx'
import { BusinessLineEditorActionHost, useBusinessLineEditor } from './BusinessLineEditor.jsx'

function classNames(...values) {
  return values.filter(Boolean).join(' ')
}

export function BusinessLineItemsAddButton({
  addLabel = '添加明细',
  addDisabled = false,
  addLoading = false,
  addButtonClassName,
  addButtonProps,
  onAdd,
}) {
  if (!onAdd) return null

  return (
    <Button
      {...addButtonProps}
      type={addButtonProps?.type ?? 'default'}
      icon={addButtonProps?.icon ?? <PlusOutlined aria-hidden="true" />}
      aria-label={addLabel}
      className={classNames(
        'erp-line-items-form__add-button',
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

export function BusinessLineItemsHeader({ title, description, notice, children, groupCount, groupActions, scrollControls = false }) {
  const editor = useBusinessLineEditor()
  const headerRef = useRef(null)
  useTableStickyToolbar(headerRef, Boolean(groupActions || scrollControls), 'var(--erp-form-reading-top, 0px)')
  return (
    <>
      <div ref={headerRef} className={classNames(editor && 'erp-line-editor__heading', title && 'erp-business-form-heading', 'erp-sales-order-lines-form__head')} data-line-items-title={title ? 'true' : 'false'} data-line-items-toolbar={groupActions || scrollControls ? 'true' : 'false'}>
        <div className="erp-line-items-form__head-identity">
          {title ? (
            <strong role="heading" aria-level={3} tabIndex={-1}>
              {title}
            </strong>
          ) : null}
          {groupCount !== undefined ? <span className="erp-line-items-form__group-count">{groupCount} 组</span> : null}
          {description ? <span className="erp-line-items-form__head-description">{description}</span> : null}
        </div>
        <BusinessLineEditorActionHost />
        {children || groupActions || scrollControls ? (
          <div className="erp-line-items-form__head-actions">
            {groupActions}
            {scrollControls ? <span className="erp-line-items-form__scroll-tools" data-table-scroll-toolbar /> : null}
            {children ? <div className="erp-line-items-form__head-extra-actions">{children}</div> : null}
          </div>
        ) : null}
      </div>
      {notice}
    </>
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
