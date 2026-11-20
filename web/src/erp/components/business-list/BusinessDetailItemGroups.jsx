import React, { useId } from 'react'
import { Button, Space } from 'antd'
import { DownOutlined } from '@ant-design/icons'
import { adjacentLineItemRuns } from '../../utils/adjacentLineItemRuns.mjs'
import BusinessRowItemCards from './BusinessRowItemCards.jsx'
import { BusinessLineItemsHeader } from './BusinessLineItemsFooter.jsx'
import './businessDetailGroups.css'

export default function BusinessDetailItemGroups({
  config,
  items,
  record,
  startIndex,
  title,
  total,
  expandedGroups,
  onExpandedGroupsChange,
}) {
  const id = useId()
  const entries = items.map((item, localIndex) => {
    const index = startIndex + localIndex
    const context = { index, record }
    return {
      item,
      index,
      key: config.getItemKey?.(item, context) ?? item?.id ?? index,
      label: config.getItemLabel?.(item, context) || `明细 ${index + 1}`,
      summary: config.getItemSummary?.(item, context),
      fields: config.getItemFields?.(item, context) || [],
      group: config.getItemGroup(item, context),
    }
  })
  const groups = adjacentLineItemRuns(entries, (entry) => entry.group?.key).map((run) => ({
    id: String(entries[run.start].key),
    label: entries[run.start].group?.title || entries[run.start].group?.label || entries[run.start].label,
    entries: entries.slice(run.start, run.start + run.count),
  }))
  const opened = new Set(expandedGroups ?? groups.slice(0, 1).map((group) => group.id))
  const toggle = (groupID) => {
    const next = new Set(opened)
    if (next.has(groupID)) next.delete(groupID)
    else next.add(groupID)
    onExpandedGroupsChange([...next])
  }

  return (
    <div className="erp-business-detail-groups">
      <BusinessLineItemsHeader
        title={title}
        description={`${groups.length} 组${total > items.length ? ' · 本页' : ''}`}
      >
        <Space role="group" aria-label="本页明细分组" size={4} wrap>
          <Button onClick={() => onExpandedGroupsChange(groups.map((group) => group.id))}>全部展开</Button>
          <Button onClick={() => onExpandedGroupsChange([])}>全部收起</Button>
        </Space>
      </BusinessLineItemsHeader>
      {groups.map((group, groupIndex) => {
        const expanded = opened.has(group.id)
        const contentID = `${id}-${groupIndex}`
        return (
          <section className="erp-business-detail-group" key={group.id}>
            <button
              type="button"
              className="erp-business-detail-group__toggle"
              aria-expanded={expanded}
              aria-controls={contentID}
              onClick={() => toggle(group.id)}
            >
              <DownOutlined rotate={expanded ? 0 : -90} aria-hidden="true" />
              <strong>{group.label}</strong>
              <span>{group.entries.length} 条</span>
            </button>
            <div id={contentID} className="erp-business-detail-group__items" hidden={!expanded}>
              <BusinessRowItemCards
                items={group.entries}
                record={record}
                getItemKey={(entry) => entry.key}
                getItemLabel={(entry) => entry.label}
                getItemSummary={(entry) => entry.summary}
                getItemFields={(entry) => entry.fields}
              />
            </div>
          </section>
        )
      })}
    </div>
  )
}
