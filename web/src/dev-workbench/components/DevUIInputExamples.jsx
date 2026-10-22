import React, { useState } from 'react'
import { Button, Input } from 'antd'
import Select from '@/common/components/select/AppSelect'
import Segmented from '@/common/components/navigation/SlidingSegmented'
import {
  DateInput,
  DateTimeInput,
  DateRangeFilter,
} from '@/erp/components/business-list/BusinessDateInputs.jsx'
import { isDateInputRangeReversed } from '@/erp/utils/dateRange.mjs'
import { buildWorkflowDeadlineQuickOptions } from '@/erp/utils/workflowTaskTiming.mjs'

const STATES = [
  { value: 'normal', label: '正常' },
  { value: 'disabled', label: '禁用' },
  { value: 'error', label: '错误' },
]
const INITIAL_DATES = {
  date: '2026-10-08',
  deadline: '2026-10-08T09:00',
  type: 'order',
  start: '2026-10-08',
  end: '2026-10-15',
}
const DEADLINE_OPTIONS = buildWorkflowDeadlineQuickOptions()

export function BasicInputExample() {
  const [state, setState] = useState('normal')
  const [name, setName] = useState('布偶熊')
  const [category, setCategory] = useState('toy')
  const disabled = state === 'disabled'
  const status = state === 'error' ? 'error' : undefined
  return (
    <div className="erp-control-example-stack">
      <Segmented
        aria-label="基础输入状态"
        value={state}
        onChange={setState}
        options={STATES}
      />
      <div className="erp-control-input-grid">
        <div className="erp-control-input-field">
          <label htmlFor="control-product-name">产品名称</label>
          <Input
            id="control-product-name"
            allowClear
            value={name}
            disabled={disabled}
            status={status}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="erp-control-input-field">
          <label htmlFor="control-product-category">产品类别</label>
          <Select
            placeholder="产品类别"
            aria-label="产品类别"
            id="control-product-category"
            allowClear
            value={category}
            disabled={disabled}
            status={status}
            onChange={setCategory}
            options={[
              { value: 'toy', label: '毛绒玩具' },
              { value: 'accessory', label: '挂件' },
            ]}
          />
        </div>
      </div>
      {status && (
        <p role="alert">错误外观由示例状态触发；正式页面按字段校验结果设置。</p>
      )}
      <output aria-label="基础输入结果">
        {name || '未填写名称'} ·{' '}
        {category === 'toy'
          ? '毛绒玩具'
          : category === 'accessory'
            ? '挂件'
            : '未选择类别'}
      </output>
      <div className="erp-control-example-row">
        <Button
          disabled={disabled}
          onClick={() => {
            setName('布偶熊')
            setCategory('toy')
            setState('normal')
          }}
        >
          恢复初始内容
        </Button>
      </div>
    </div>
  )
}

export function DateInputExample() {
  const [state, setState] = useState('normal')
  const [values, setValues] = useState(INITIAL_DATES)
  const update = (key, value) =>
    setValues((current) => ({ ...current, [key]: value }))
  const disabled = state === 'disabled'
  const status = state === 'error' ? 'error' : undefined
  const rangeInvalid = isDateInputRangeReversed(values.start, values.end)
  return (
    <div className="erp-control-example-stack">
      <Segmented
        aria-label="日期输入状态"
        value={state}
        onChange={setState}
        options={STATES}
      />
      <div className="erp-control-input-grid">
        <div className="erp-control-input-field">
          <label htmlFor="control-date">单个日期</label>
          <DateInput
            id="control-date"
            value={values.date}
            disabled={disabled}
            status={status}
            onChange={(value) => update('date', value)}
          />
          <output aria-label="日期当前值">{values.date || '未设置'}</output>
        </div>
        <div className="erp-control-input-field">
          <label htmlFor="control-deadline">跟进截止时间</label>
          <DateTimeInput
            id="control-deadline"
            value={values.deadline}
            disabled={disabled}
            status={status}
            quickOptions={DEADLINE_OPTIONS}
            quickOptionsLabel="快捷截止"
            showNow={false}
            onChange={(value) => update('deadline', value)}
          />
          <output aria-label="截止时间当前值">
            {values.deadline || '未设置'}
          </output>
        </div>
      </div>
      <section className="erp-control-input-field" aria-label="日期范围示例">
        <h3>日期范围</h3>
        <DateRangeFilter
          options={[
            { value: 'order', label: '下单日期' },
            { value: 'delivery', label: '交货日期' },
          ]}
          value={values.type}
          onTypeChange={(value) => update('type', value)}
          startValue={values.start}
          endValue={values.end}
          onStartChange={(value) => update('start', value)}
          onEndChange={(value) => update('end', value)}
        />
        <output aria-label="日期范围当前值">
          {values.start || '未设置'} 至 {values.end || '未设置'}
        </output>
        {rangeInvalid && (
          <p role="alert">开始日期不能晚于结束日期，请调整或清空范围。</p>
        )}
        <div className="erp-control-example-row">
          <Button
            onClick={() =>
              setValues((current) => ({
                ...current,
                start: INITIAL_DATES.end,
                end: INITIAL_DATES.start,
              }))
            }
          >
            查看倒置范围
          </Button>
          <Button
            onClick={() =>
              setValues((current) => ({ ...current, start: '', end: '' }))
            }
          >
            清空范围
          </Button>
        </div>
      </section>
      <div className="erp-control-example-row">
        <Button
          onClick={() => {
            setValues(INITIAL_DATES)
            setState('normal')
          }}
        >
          重置日期示例
        </Button>
      </div>
    </div>
  )
}
