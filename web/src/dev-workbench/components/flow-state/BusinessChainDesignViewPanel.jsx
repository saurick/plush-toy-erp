import React, { useId } from 'react'
import { Checkbox, Radio } from 'antd'
import FilterField from '@/common/components/navigation/FilterField.jsx'
import { CHAIN_DISPLAY_OPTIONS, CHAIN_LAYOUT_OPTIONS } from '../../config/devBusinessChainDesignView.mjs'
import { businessChainRelationLayer, CHAIN_READING_LAYERS } from '../../config/devBusinessChainReading.mjs'
import BusinessChainDesignPopover from './BusinessChainDesignPopover.jsx'

export default function BusinessChainDesignViewPanel({ mode, layout, globalOverview, dock, collapsedOverview, relations, layers, onLayersChange, onModeChange, onLayoutChange }) {
  const id = useId()
  const groups = CHAIN_READING_LAYERS.map((layer) => ({ ...layer, edges: relations.filter((edge) => businessChainRelationLayer(edge) === layer.value) }))
  const shown = groups.filter((layer) => layer.edges.length && layers.includes(layer.value))
  const count = shown.reduce((total, group) => total + group.edges.length, 0)
  const selected = shown.length === 1 ? shown[0].label : count === relations.length ? '全部' : shown.map((layer) => layer.shortLabel).join('、') || '已隐藏'
  const reading = globalOverview ? '链路概览' : `${CHAIN_DISPLAY_OPTIONS[mode].label} · ${CHAIN_LAYOUT_OPTIONS[layout].label}`
  const summary = relations.length ? `${reading} · 跨链：${selected}` : reading
  const layoutLabel = collapsedOverview ? '展开后布局' : '布局'
  const readingFields = (
    <>
      <FilterField label="显示">
        <Radio.Group name={`${id}-mode`} aria-label="显示" className="erp-chain-design__mode-list" value={mode} onChange={(event) => onModeChange(event.target.value)}>
          {Object.entries(CHAIN_DISPLAY_OPTIONS).map(([key, option]) => (
            <Radio key={key} value={key} aria-label={option.label} aria-describedby={`${id}-${key}`}>
              <strong className="erp-chain-design__view-name">{option.label}</strong>
              <small className="erp-chain-design__view-description" id={`${id}-${key}`}>{option.description}</small>
            </Radio>
          ))}
        </Radio.Group>
      </FilterField>
      <FilterField label={layoutLabel}>
        <Radio.Group name={`${id}-layout`} aria-label={layoutLabel} className="erp-chain-design__layout-choices" value={layout} onChange={(event) => onLayoutChange(event.target.value)}>
          {Object.entries(CHAIN_LAYOUT_OPTIONS).map(([key, option]) => (
            <Radio.Button key={key} value={key} aria-label={option.label} aria-describedby={`${id}-${key}`}>
              <span className="erp-chain-design__layout-sample" data-layout={key} aria-hidden="true"><i /><i /><i /></span>
              <strong className="erp-chain-design__view-name">{option.label}</strong>
              <small className="erp-chain-design__view-description" id={`${id}-${key}`}>{option.description}</small>
            </Radio.Button>
          ))}
        </Radio.Group>
      </FilterField>
    </>
  )
  return (
    <BusinessChainDesignPopover kind="view" label="画布视图" title="画布视图" dock={dock} current={summary} closeLabel="关闭视图面板">
      {() => (
        <>
          {relations.length > 0 && (
            <FilterField label={globalOverview ? '跨链关系' : '跨链关系 · 本链对外交接'}>
              <div role="group" className="erp-chain-design__relation-options" aria-label="跨链关系">
                {groups.filter((group) => group.edges.length > 0).map(({ value, label, edges }) => (
                  <Checkbox
                    key={value}
                    checked={layers.includes(value)}
                    aria-label={label}
                    aria-describedby={`${id}-${value}`}
                    onChange={(event) => onLayersChange(event.target.checked ? [...layers, value] : layers.filter((key) => key !== value))}
                  >
                    <span className="erp-chain-design__relation-name"><strong>{label}</strong><small>{edges.length} 条</small></span>
                    <small className="erp-chain-design__view-description" id={`${id}-${value}`}>{edges[0].label}</small>
                  </Checkbox>
                ))}
              </div>
              <small role="status">已显示 {count} / {relations.length} 条{globalOverview ? '跨链连线' : '本链交接'}</small>
            </FilterField>
          )}
          {!globalOverview && (dock ? <details><summary>显示与布局</summary>{readingFields}</details> : readingFields)}
        </>
      )}
    </BusinessChainDesignPopover>
  )
}
