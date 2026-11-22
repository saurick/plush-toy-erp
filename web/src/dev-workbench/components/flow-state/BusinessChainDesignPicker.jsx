import React from 'react'
import { CheckOutlined } from '@ant-design/icons'
import { Button, Checkbox } from 'antd'
import FilterChip from '@/common/components/navigation/FilterChip.jsx'
import FilterField from '@/common/components/navigation/FilterField.jsx'
import BusinessChainDesignPopover from './BusinessChainDesignPopover.jsx'

const pickers = {
  scope: { label: '流程范围', title: '选择流程范围', closeLabel: '关闭范围面板', first: { value: 'all', label: '业务全流程地图' } },
  role: { label: '岗位高亮', title: '选择高亮岗位', closeLabel: '关闭岗位面板' },
}

export default function BusinessChainDesignPicker({ kind, value, groups, onChange, hint }) {
  const { label, title, closeLabel, first } = pickers[kind]
  const singleChoice = kind === 'scope'
  const options = groups.flatMap((group) => group.options)
  if (first) options.unshift(first)
  const picked = options.find((option) => option.value === (singleChoice ? value : value[0]))
  let current = picked?.label ?? value ?? '尚未加载链路'
  if (!singleChoice) {
    current = value.length === 0 ? '全链路视角' : `已选 ${value.length} 个岗位`
    if (value.length === 1 && picked) current = `${picked.label} · ${picked.count ?? 0} 个节点`
  }
  const scopeChoice = (option, dismiss) => (
    <FilterChip
      key={option.value}
      selected={value === option.value}
      aria-label={option.label}
      onClick={() => {
        onChange(option.value)
        dismiss()
      }}
    >
      {option.label}
      {value === option.value && <CheckOutlined aria-hidden="true" />}
    </FilterChip>
  )
  const roleChoice = (option) => (
    <Checkbox
      key={option.value}
      checked={value.includes(option.value)}
      aria-label={option.label}
      aria-description={option.count != null ? `当前画布有 ${option.count} 个相关节点` : undefined}
      onChange={({ target }) => onChange(target.checked ? [...value, option.value] : value.filter((key) => key !== option.value))}
    >
      {option.label}
      {option.count != null && <small className="erp-chain-design__role-count">{option.count}</small>}
    </Checkbox>
  )
  return (
    <BusinessChainDesignPopover
      kind={kind}
      label={label}
      title={title}
      modeLabel={singleChoice ? '单选' : '可多选'}
      current={current}
      closeLabel={closeLabel}
      singleChoice={singleChoice}
    >
      {(dismiss) => (
        <>
          <div className="erp-filter-chip-group">
            {singleChoice ? scopeChoice(first, dismiss) : (
              <Button size="small" aria-pressed={!value.length} onClick={() => onChange([])}>全链路视角</Button>
            )}
          </div>
          {groups.map((group) => (
            <FilterField key={group.key} label={group.label}>
              <div className={singleChoice ? 'erp-filter-chip-group' : 'erp-chain-design__role-options'} role="group" aria-label={group.label}>
                {singleChoice ? group.options.map((option) => scopeChoice(option, dismiss)) : group.options.map(roleChoice)}
              </div>
            </FilterField>
          ))}
          {hint && <small className="erp-chain-design__scope-label">{hint}</small>}
        </>
      )}
    </BusinessChainDesignPopover>
  )
}
