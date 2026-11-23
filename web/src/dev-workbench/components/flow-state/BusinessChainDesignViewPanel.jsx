import React, { useId, useLayoutEffect, useRef, useState } from 'react'
import { Checkbox, Radio } from 'antd'
import { CHAIN_DISPLAY_OPTIONS, CHAIN_LAYOUT_OPTIONS } from '../../config/devBusinessChainDesignView.mjs'
import BusinessChainDesignPopover from './BusinessChainDesignPopover.jsx'

export function BusinessChainLayerFilter({ options, layers, onChange }) {
  const slot = useRef(null)
  const inline = useRef(null)
  const [compact, setCompact] = useState(false)
  useLayoutEffect(() => {
    const row = slot.current.closest('.erp-chain-design__toolbar-row')
    const group = slot.current.parentElement
    const actions = row.querySelector('.erp-chain-design__canvas-actions')
    const measure = () => {
      const separateRows = actions.getBoundingClientRect().top >= slot.current.getBoundingClientRect().bottom
      const handoff = slot.current.nextElementSibling
      const gap = parseFloat(getComputedStyle(group).columnGap) || 0
      const available = group.clientWidth - (handoff ? handoff.offsetWidth + gap : 0)
      if (group.clientWidth) setCompact(inline.current.offsetWidth > available + 1 || separateRows)
    }
    const observer = new ResizeObserver(measure)
    for (const element of [group, inline.current, row, actions]) observer.observe(element)
    measure()
    return () => observer.disconnect()
  }, [])
  const choices = options.map(({ value, label }) => (
    <Checkbox
      key={value}
      checked={layers.includes(value)}
      aria-label={label}
      onChange={({ target }) => onChange(target.checked ? [...layers, value] : layers.filter((key) => key !== value))}
    >
      {label}
    </Checkbox>
  ))
  const count = options.filter(({ value }) => layers.includes(value)).length
  return (
    <div ref={slot} className="erp-chain-design__layer-slot" data-compact={compact || undefined}>
      <div ref={inline} className="erp-chain-design__inline-layers" role="group" aria-label="显示内容">
        <span className="erp-chain-design__scope-label">显示内容</span>{choices}
      </div>
      {compact && (
        <BusinessChainDesignPopover kind="layers" title="显示内容" current={`显示内容（已选 ${count} 项）`} closeLabel="关闭显示内容">
          {() => <div className="erp-chain-design__layer-options" role="group" aria-label="显示内容">{choices}</div>}
        </BusinessChainDesignPopover>
      )}
    </div>
  )
}

export default function BusinessChainDesignViewPanel({ mode, layout, globalOverview, collapsedOverview, onModeChange, onLayoutChange }) {
  const id = useId()
  const layoutLabel = collapsedOverview ? '展开后布局' : '布局'
  return (
    <>
      <div className="erp-chain-design__granularity">
        <span id={id}>展示粒度</span>
        <div role="radiogroup" aria-labelledby={id} className="erp-chain-design__grain-options">
          {Object.entries(CHAIN_DISPLAY_OPTIONS).map(([value, option]) => (
            <label key={value} className="erp-chain-design__grain-card">
              <input
                type="radio"
                name={`${id}-mode`}
                value={value}
                checked={mode === value}
                aria-labelledby={`${id}-${value}-name`}
                aria-describedby={`${id}-${value}-description`}
                onChange={() => onModeChange(value)}
              />
              <strong id={`${id}-${value}-name`}>{option.label}</strong>
              <small id={`${id}-${value}-description`}>{option.description}</small>
            </label>
          ))}
        </div>
      </div>
      {!globalOverview && (
        <BusinessChainDesignPopover kind="layout" label={layoutLabel} title={layoutLabel} current={CHAIN_LAYOUT_OPTIONS[layout].label} closeLabel="关闭布局面板">
          {() => (
            <Radio.Group name={`${id}-layout`} aria-label={layoutLabel} className="erp-chain-design__layout-choices" value={layout} onChange={(event) => onLayoutChange(event.target.value)}>
              {Object.entries(CHAIN_LAYOUT_OPTIONS).map(([key, option]) => (
                <Radio.Button key={key} value={key} aria-label={option.label} aria-describedby={`${id}-${key}`}>
                  <span className="erp-chain-design__layout-sample" data-layout={key} aria-hidden="true"><i /><i /><i /></span>
                  <strong className="erp-chain-design__view-name">{option.label}</strong>
                  <small className="erp-chain-design__view-description" id={`${id}-${key}`}>{option.description}</small>
                </Radio.Button>
              ))}
            </Radio.Group>
          )}
        </BusinessChainDesignPopover>
      )}
    </>
  )
}
