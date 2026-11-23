import React, { useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Button } from 'antd'
import { CheckOutlined, CloseOutlined } from '@ant-design/icons'
import AnchoredControlPopover, { FilterPopoverButton } from '@/common/components/overlay/AnchoredControlPopover.jsx'
import FilterPopoverPanel from '@/common/components/overlay/FilterPopoverPanel.jsx'
import FilterChip from '@/common/components/navigation/FilterChip.jsx'
import FilterField from '@/common/components/navigation/FilterField.jsx'
import FilterSelect from '@/common/components/select/FilterSelect.jsx'
import {
  handleFilterPanelTab,
  useFilterPopoverMaxHeight,
} from '@/erp/components/business-list/BusinessFilterPopoverContent.jsx'
import {
  buildRelationFacets,
  EMPTY_RELATION_FILTERS,
  relationFiltersActive,
} from '../../config/devFulfillmentRelations.mjs'
import { fulfillmentRoleOptions } from '../../../erp/utils/workflowFulfillment.mjs'
import './businessRelations.css'

const labels = { role: '参与岗位', machine: '状态对象', permission: '办理权限' }
const activeKeys = (filters) => Object.keys(labels).filter(
  (key) => filters[key] && filters[key] !== 'all'
)

function AppliedRelationFilters({ keys, facets, filters, onChange }) {
  return keys.map((key) => (
    <Button
      key={key}
      className="erp-dev-relation-filter-value"
      aria-label={`移除${labels[key]}筛选`}
      onClick={() => onChange({ [key]: 'all' })}
    >
      {facets[key].find((option) => option.value === filters[key])?.label || filters[key]}
      <CloseOutlined />
    </Button>
  ))
}

export function BusinessChainRoleFilter({ catalog, actions, filters, onChange }) {
  const facets = buildRelationFacets(catalog, actions, filters)
  const roleOptions = fulfillmentRoleOptions.filter(({ value }) =>
    facets.role.some((option) => option.value === value)
  )
  const linkedRole = facets.role.find(({ value }) => value === filters.role)
  if (linkedRole && !roleOptions.some(({ value }) => value === linkedRole.value)) {
    roleOptions.push(linkedRole)
  }

  return (
    <div className="erp-dev-relation-filters" data-relation-filters>
      <FilterSelect
        className="erp-dev-fulfillment-guide__role-select"
        label="参与岗位"
        placeholder="全部岗位"
        emptyValue="all"
        value={filters.role}
        options={roleOptions}
        showSearch={false}
        virtual={false}
        onChange={(role) => onChange({ role })}
      />
      <AppliedRelationFilters
        keys={activeKeys(filters).filter((key) => key !== 'role')}
        facets={facets}
        filters={filters}
        onChange={onChange}
      />
    </div>
  )
}

export default function BusinessRelationFilters({
  catalog,
  actions,
  filters,
  onChange,
}) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const panelRef = useRef(null)
  const triggerRef = useRef(null)
  const pendingFilters = useRef(filters)
  useLayoutEffect(() => {
    pendingFilters.current = filters
  }, [filters])
  const apply = (patch) => {
    // Several choices can be clicked before the router renders the latest URL.
    pendingFilters.current = { ...pendingFilters.current, ...patch }
    onChange(pendingFilters.current)
  }
  const maxHeight = useFilterPopoverMaxHeight(open, triggerRef)
  const facets = useMemo(
    () => buildRelationFacets(catalog, actions, filters),
    [catalog, actions, filters]
  )
  const active = activeKeys(filters)
  const groups = Object.entries(labels).filter(([key]) => facets[key].length > 0)
  const dismiss = () => {
    setOpen(false)
    triggerRef.current?.focus({ preventScroll: true })
  }

  return (
    <div className="erp-dev-relation-filters" data-relation-filters>
      <AnchoredControlPopover
        trigger="click"
        placement="bottomLeft"
        classNames={{ root: 'erp-business-filter-popover' }}
        open={open}
        onOpenChange={setOpen}
        afterOpenChange={(visible) => {
          if (visible && !panelRef.current?.contains(document.activeElement)) {
            panelRef.current?.focus({ preventScroll: true })
          }
        }}
        destroyOnHidden
        content={
          <section
            id={panelId}
            ref={panelRef}
            className="erp-dev-relation-filter-panel"
            style={{ '--erp-filter-available-height': maxHeight && `${maxHeight}px` }}
            role="dialog"
            aria-label="关联筛选条件"
            tabIndex={-1}
            onKeyDownCapture={(event) => {
              if (event.defaultPrevented || event.nativeEvent.isComposing) return
              if (event.key === 'Escape') {
                event.preventDefault()
                event.stopPropagation()
                dismiss()
              } else {
                handleFilterPanelTab(event)
              }
            }}
          >
            <FilterPopoverPanel
              panelRef={panelRef}
              fieldsClassName="erp-dev-relation-filter-options"
              onClear={() => apply(EMPTY_RELATION_FILTERS)}
              clearDisabled={!relationFiltersActive(filters)}
              onDismiss={dismiss}
              footerNote="数字是关联动作数。各组条件须匹配同一动作。实际办理以账号权限为准。"
            >
              {groups.map(([key, label]) => (
                <FilterField key={key} label={label}>
                  <div className="erp-filter-chip-group" role="group" aria-label={label}>
                    {facets[key].map((option) => {
                      const selected = filters[key] === option.value
                      return (
                        <FilterChip
                          key={option.value}
                          count={option.count}
                          disabled={option.disabled}
                          selected={selected}
                          onClick={() => apply({ [key]: pendingFilters.current[key] === option.value ? 'all' : option.value })}
                        >
                          {option.label}
                          {selected && <CheckOutlined aria-hidden="true" />}
                        </FilterChip>
                      )
                    })}
                  </div>
                </FilterField>
              ))}
              {groups.length === 0 && <p role="status">暂无可选筛选项</p>}
            </FilterPopoverPanel>
          </section>
        }
      >
        <FilterPopoverButton
          ref={triggerRef}
          count={active.length}
          aria-label="关联筛选"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
        />
      </AnchoredControlPopover>
      <AppliedRelationFilters keys={active} facets={facets} filters={filters} onChange={apply} />
    </div>
  )
}
