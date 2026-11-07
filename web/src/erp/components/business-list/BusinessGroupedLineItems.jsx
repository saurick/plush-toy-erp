import React, { useMemo, useState } from 'react'
import { Button, Form, Space } from 'antd'
import { adjacentLineItemRuns } from '../../utils/adjacentLineItemRuns.mjs'
import BusinessLineItemsTable, { BusinessLineItemGroupHeading } from './BusinessLineItemsTable.jsx'
import { BusinessLineItemDisclosureContext } from './BusinessLineItemDisclosureContext.js'
import BusinessLineItemGroupControls from './BusinessLineItemGroupControls.jsx'
import useBusinessLineItemGroups from './useBusinessLineItemGroups.js'
import { BusinessLineItemsHeader } from './BusinessLineItemsFooter.jsx'
import BusinessLineEditor from './BusinessLineEditor.jsx'
import useBusinessPageContext from '../../hooks/useBusinessPageContext.js'

function GroupedRow({ hidden, index, identity, onFocus, form, lineErrors, validationRevision, children }) {
  const value = useMemo(() => ({ hidden, index, identity, form, lineErrors, validationRevision, onFocus: () => onFocus(index) }), [hidden, index, identity, onFocus, form, lineErrors, validationRevision])
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
  defaultExpanded,
  title,
  description,
  headerActions,
  notice,
}) {
  const { taskBusiness } = useBusinessPageContext() || {}
  const mobile = taskBusiness?.device === 'mobile'
  const [groupView, setGroupView] = useState(false)
  const watched = Form.useWatch(name, form)
  const items = watched || form.getFieldValue(name) || []
  const descriptors = new Map(fields.map((field, index) => [field.name, getGroup(items[field.name] || {}, field, index)]))
  const groups = adjacentLineItemRuns(fields, (field) => descriptors.get(field.name)?.key).map((run) => ({
    ...run,
    id: String(fields[run.start].key),
    indexes: fields.slice(run.start, run.start + run.count).map((field) => field.name),
    descriptor: descriptors.get(fields[run.start].name),
  }))
  const controller = useBusinessLineItemGroups({ form, groups, name, defaultExpanded: defaultExpanded ?? !mobile })
  const rows = new Map(groups.flatMap((group) => group.indexes.map((index) => [index, group])))
  const headings = new Map(groups.map((group) => [group.start, group]))
  const actionColumns = (tableProps?.columns || []).filter((column) => column.actions).length
  const columns = columnCount ?? ((tableProps?.columns || []).length - actionColumns + (Table === BusinessLineItemsTable ? 1 : Number(Boolean(tableProps?.showSequence))))
  const canGroup = fields.length > 1
  const grouped = canGroup && (mobile || groupView)

  return (
    <BusinessLineEditor className="erp-line-item-disclosures" rowActions={Table === BusinessLineItemsTable || actionColumns > 0} data-table-scroll-scope ref={controller.rootRef} onFocusCapture={controller.onFocusCapture}>
      <Table
        {...tableProps}
        scrollControlsInToolbar
        header={title || fields.length > 0 || headerActions ? (
          <BusinessLineItemsHeader
            title={title}
            description={description}
            notice={notice}
            groupCount={grouped ? groups.length : undefined}
            groupActions={canGroup ? (
              <Space size={4} wrap>
                {!mobile ? <Button type="text" disabled={false} onClick={() => setGroupView((current) => !current)}>{groupView ? '取消归组' : '分组显示'}</Button> : null}
                {grouped ? <BusinessLineItemGroupControls controller={controller} form={form} label={label} /> : null}
              </Space>
          ) : null}
            scrollControls
          >
            {headerActions}
          </BusinessLineItemsHeader>
      ) : notice}
      >
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
              <GroupedRow key="row" hidden={hidden} index={field.name} identity={group.descriptor?.label} onFocus={controller.onRowFocus} form={form} lineErrors={controller.lineErrors} validationRevision={controller.validationRevision}>
                {children(field, index)}
              </GroupedRow>
            </React.Fragment>
          )
        })}
      </Table>
    </BusinessLineEditor>
  )
}
