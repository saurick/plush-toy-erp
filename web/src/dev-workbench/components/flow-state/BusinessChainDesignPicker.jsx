import React from 'react'
import { CheckOutlined } from '@ant-design/icons'
import FilterChip from '@/common/components/navigation/FilterChip.jsx'
import FilterField from '@/common/components/navigation/FilterField.jsx'
import BusinessChainDesignPopover from './BusinessChainDesignPopover.jsx'

const pickers = {
  scope: { label: '流程范围', title: '选择流程范围', closeLabel: '关闭范围面板', first: { value: 'all', label: '业务全流程地图' } },
  role: { label: '岗位高亮', title: '选择高亮岗位', closeLabel: '关闭岗位面板', first: { value: '', label: '全链路视角' } },
}

export default function BusinessChainDesignPicker({ kind, value, groups, onSelect, hint }) {
  const { label, title, closeLabel, first } = pickers[kind]
  const options = [first, ...groups.flatMap((group) => group.options)]
  const current = options.find((option) => option.value === value)?.label ?? value ?? '尚未加载链路'
  const choice = (option, dismiss) => (
    <FilterChip
      key={option.value}
      selected={value === option.value}
      count={option.count}
      aria-label={option.label}
      aria-description={option.count != null ? `当前画布有 ${option.count} 个相关节点` : undefined}
      onClick={() => {
        onSelect(option.value)
        dismiss()
      }}
    >
      {option.label}
      {value === option.value && <CheckOutlined aria-hidden="true" />}
    </FilterChip>
  )
  return (
    <BusinessChainDesignPopover kind={kind} label={label} title={title} current={current} closeLabel={closeLabel} singleChoice>
      {(dismiss) => (
        <>
          <div className="erp-filter-chip-group">{choice(first, dismiss)}</div>
          {groups.map((group) => (
            <FilterField key={group.key} label={group.label}>
              <div className="erp-filter-chip-group" role="group" aria-label={group.label}>
                {group.options.map((option) => choice(option, dismiss))}
              </div>
            </FilterField>
          ))}
          {hint && <small className="erp-chain-design__scope-label">{hint}</small>}
        </>
      )}
    </BusinessChainDesignPopover>
  )
}
