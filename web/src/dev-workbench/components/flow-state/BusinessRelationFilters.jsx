import React, { useMemo, useState } from 'react'
import { Button, Popover } from 'antd'
import { CloseOutlined, FilterOutlined } from '@ant-design/icons'
import FilterSelect from '@/common/components/select/FilterSelect'
import {
  buildRelationFacets,
  EMPTY_RELATION_FILTERS,
  relationFiltersActive,
} from '../../config/devFulfillmentRelations.mjs'
import './businessRelations.css'

const labels = { role: '参与岗位', machine: '状态对象', permission: '办理权限' }

export default function BusinessRelationFilters({
  catalog,
  actions,
  filters,
  onChange,
}) {
  const [open, setOpen] = useState(false)
  const facets = useMemo(
    () => buildRelationFacets(catalog, actions, filters),
    [catalog, actions, filters]
  )
  const active = Object.keys(labels).filter(
    (key) => filters[key] && filters[key] !== 'all'
  )
  return (
    <div className="erp-dev-relation-filters" data-relation-filters>
      <Popover
        trigger="click"
        placement="bottomLeft"
        open={open}
        onOpenChange={setOpen}
        content={
          <section
            className="erp-dev-relation-filter-panel"
            aria-label="关联筛选条件"
          >
            {Object.entries(labels).map(([key, label]) => (
              <FilterSelect
                key={key}
                label={label}
                aria-label={label}
                placeholder={`全部${label.replace('参与', '').replace('办理', '')}`}
                emptyValue="all"
                value={filters[key]}
                showSearch
                optionFilterProp="searchLabel"
                virtual={false}
                options={facets[key].map((option) => ({
                  ...option,
                  searchLabel: `${option.label} ${option.value}`,
                  label: `${option.label} · ${option.count}`,
                }))}
                onChange={(value) => onChange({ [key]: value })}
              />
            ))}
            <p>
              不同维度须匹配同一动作；数量为关联动作数。岗位不代表当前账号已获授权。
            </p>
            <Button
              disabled={!relationFiltersActive(filters)}
              onClick={() => onChange(EMPTY_RELATION_FILTERS)}
            >
              清除筛选
            </Button>
          </section>
        }
      >
        <Button
          icon={<FilterOutlined />}
          aria-label="关联筛选"
          aria-expanded={open}
        >
          筛选{active.length ? ` · ${active.length}` : ''}
        </Button>
      </Popover>
      {active.map((key) => (
        <Button
          key={key}
          className="erp-dev-relation-filter-value"
          aria-label={`移除${labels[key]}筛选`}
          onClick={() => onChange({ [key]: 'all' })}
        >
          {facets[key].find((option) => option.value === filters[key])?.label ||
            filters[key]}{' '}
          <CloseOutlined />
        </Button>
      ))}
    </div>
  )
}
