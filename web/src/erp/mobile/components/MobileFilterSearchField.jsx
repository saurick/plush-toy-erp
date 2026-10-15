import React, { useContext, useId, useState } from 'react'
import { createPortal } from 'react-dom'
import { Button } from 'antd'
import { CheckOutlined, RightOutlined } from '@ant-design/icons'
import SearchInput from '../../../common/components/SearchInput.jsx'
import MobileFilterViewContext from './MobileFilterViewContext.js'

export default function MobileFilterSearchField({ label, value = '', options, onChange, disabled = false }) {
  const id = useId()
  const navigation = useContext(MobileFilterViewContext)
  const [search, setSearch] = useState('')
  const flatOptions = options.flatMap((option) => option.options || [option])
  const selected = flatOptions.find((option) => option.value === value)
  const matches = (option) => search.trim().toLocaleLowerCase().split(/\s+/u).every((word) =>
    String(option.searchText || option.label).toLocaleLowerCase().includes(word))
  const visible = flatOptions.filter(matches)
  const active = navigation?.view?.id === id
  const renderOption = (option) => (
    <button
      type="button"
      key={option.value}
      aria-label={option.label}
      aria-pressed={value === option.value}
      disabled={option.disabled}
      onClick={() => { onChange(option.value); navigation.closeView() }}
    >
      <span>{option.displayLabel || option.label}</span>{value === option.value && <CheckOutlined aria-hidden />}
    </button>
  )
  return (
    <>
      <Button
        className="mobile-filter-search-entry"
        disabled={disabled}
        aria-label={`选择${label}：${selected?.label || `全部${label}`}`}
        onClick={(event) => {
          setSearch('')
          navigation.openView({ id, title: label }, event.currentTarget)
        }}
      >
        <span>{selected?.label || `全部${label}`}</span><RightOutlined aria-hidden />
      </Button>
      {active && navigation.host && createPortal(
        <div className="mobile-filter-search-view">
          <SearchInput
            aria-label={`搜索${label}`}
            placeholder={`搜索${label}`}
            allowClear
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <div className="mobile-filter-search-results" role="group" aria-label={`${label}选项`}>
            {renderOption({ value: '', label: `全部${label}` })}
            {options.map((option) => {
              if (!option.options) return option.value !== '' && matches(option) ? renderOption(option) : null
              const items = option.options.filter(matches)
              return items.length ? (
                <section key={option.label} aria-label={option.label}>
                  <h3>{option.label}</h3>
                  {items.map(renderOption)}
                </section>
              ) : null
            })}
            {!visible.filter((option) => option.value !== '').length && <p role="status">{search ? '没有匹配的选项，请换个关键词' : '暂无可选项'}</p>}
          </div>
        </div>, navigation.host
      )}
    </>
  )
}
