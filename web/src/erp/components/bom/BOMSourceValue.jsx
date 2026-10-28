import React, { useState } from 'react'
import { flushSync } from 'react-dom'
import { Button, Input, Popover } from 'antd'
import { InfoCircleOutlined } from '@ant-design/icons'
import { bomLossSourceLabel, formatBOMSourceNumber, normalizeBOMSourceNumber } from '../../utils/bomSourceValues.mjs'
import './bomSourceValue.css'

export function BOMSourceValueInfo({ source, kind, value, calculatedValue, index }) {
  if (!source) return null
  const label = { quantity: '单位用量', total: '总用量', loss: '损耗' }[kind]
  const original = kind === 'loss'
    ? source.loss_value || source.total_label
    : source[`${kind}_value`]
  const current = kind === 'total' ? calculatedValue || value : value
  const differs = normalizeBOMSourceNumber(original) !== normalizeBOMSourceNumber(current)
  return (
    <Popover
      trigger="click"
      title={`原表第 ${source.row_number} 行`}
      content={
        <div className="erp-bom-source-value__details">
          <div>原表{label}：<span>{original || '未填写'}</span></div>
          {differs || kind === 'loss' ? <div>{kind === 'quantity' ? '保存用量' : kind === 'total' ? '按保存用量计算' : '当前损耗'}：<span>{current || '—'}{kind === 'loss' ? '%' : ''}</span></div> : null}
          {kind === 'total' && differs ? <div>原表总量保留作核对，业务需求按保存用量计算。</div> : null}
          {kind === 'loss' || kind === 'total' ? <div>损耗来源：{bomLossSourceLabel(source.loss_source)}</div> : null}
          {source.total_formula && (kind === 'loss' || kind === 'total') ? <div>原表公式：<span>{source.total_formula}</span></div> : null}
          <div>{source.file_name} / {source.sheet_name}</div>
        </div>
      }
    >
      <Button type="text" size="small" disabled={false} className="erp-bom-source-value__info" icon={<InfoCircleOutlined aria-hidden="true" />} aria-label={`查看${label}原值 ${index + 1}`} />
    </Popover>
  )
}

export function BOMQuantityInput({ value, onChange, source, index, ...props }) {
  const [focused, setFocused] = useState(false)
  return (
    <Input
      {...props}
      value={!focused ? formatBOMSourceNumber(value, source?.quantity_format) || value : value}
      onFocus={(event) => {
        // Select the complete decimal before the first edit can replace it.
        flushSync(() => setFocused(true))
        event.target.select()
      }}
      onBlur={() => setFocused(false)}
      onChange={(event) => onChange?.(event.target.value)}
      suffix={<BOMSourceValueInfo source={source} kind="quantity" value={value} index={index} />}
    />
  )
}
