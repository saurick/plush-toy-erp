import React, { useMemo } from 'react'
import { Form } from 'antd'
import { adjacentLineItemRuns } from '../../utils/adjacentLineItemRuns.mjs'
import BusinessLineItemsTable, { BusinessLineItemGroupHeading } from './BusinessLineItemsTable.jsx'
import { BusinessLineItemDisclosureContext } from './BusinessLineItemDisclosureContext.js'
import BusinessLineItemGroupControls from './BusinessLineItemGroupControls.jsx'
import useBusinessLineItemGroups from './useBusinessLineItemGroups.js'

function GroupedRow({ hidden, index, onFocus, form, children }) {
  const value = useMemo(() => ({ hidden, index, form, onFocus: () => onFocus(index) }), [hidden, index, onFocus, form])
  return <BusinessLineItemDisclosureContext.Provider value={value}>{children}</BusinessLineItemDisclosureContext.Provider>
}

export default function BusinessGroupedLineItems({
  fields,
  form,
  name = 'items',
  getGroup,
  children,
  table: Table = BusinessLineItemsTable,
  tableProps,
  columnCount,
  label = tableProps?.label || '明细',
  alwaysGrouped = false,
}) {
  const watched = Form.useWatch(name, form)
  const items = watched || form.getFieldValue(name) || []
  const descriptors = new Map(fields.map((field, index) => [field.name, getGroup(items[field.name] || {}, field, index)]))
  const groups = adjacentLineItemRuns(fields, (field) => descriptors.get(field.name)?.key).map((run) => ({
    ...run,
    id: String(fields[run.start].key),
    indexes: fields.slice(run.start, run.start + run.count).map((field) => field.name),
    descriptor: descriptors.get(fields[run.start].name),
  }))
  const controller = useBusinessLineItemGroups({ form, groups, name })
  const rows = new Map(groups.flatMap((group) => group.indexes.map((index) => [index, group])))
  const headings = new Map(groups.map((group) => [group.start, group]))
  const columns = columnCount ?? ((tableProps?.columns || []).length + (Table === BusinessLineItemsTable ? 2 : Number(Boolean(tableProps?.showSequence))))
  const grouped = fields.length > 1 || (alwaysGrouped && fields.length > 0)

  return (
    <div className="erp-line-item-disclosures" ref={controller.rootRef} onFocusCapture={controller.onFocusCapture}>
      {grouped ? <BusinessLineItemGroupControls controller={controller} form={form} label={label} groupCount={groups.length} /> : null}
      <Table {...tableProps}>
        {fields.map((field, index) => {
          const group = rows.get(field.name)
          const heading = headings.get(index)
          const hidden = grouped && controller.isCollapsed(group.id)
          return (
            <React.Fragment key={field.key}>
              {grouped && heading ? (
                <BusinessLineItemGroupHeading
                  key="heading"
                  columnCount={columns}
                  collapsed={controller.isCollapsed(group.id)}
                  onToggle={() => controller.toggle(group.id)}
                  label={group.descriptor?.label || `第 ${index + 1} 条明细`}
                  count={group.count}
                  controller={controller}
                  groupId={group.id}
                >
                  {group.descriptor?.title || group.descriptor?.label || `第 ${index + 1} 条明细`}
                </BusinessLineItemGroupHeading>
              ) : null}
              <GroupedRow key="row" hidden={hidden} index={field.name} onFocus={controller.onRowFocus} form={form}>
                {children(field, index)}
              </GroupedRow>
            </React.Fragment>
          )
        })}
      </Table>
    </div>
  )
}
