import React, { useId, useRef, useState } from 'react'
import { Button, Checkbox, Input } from 'antd'
import { BusinessTextPolicy } from '../../common/consts/policies.generated.mjs'
import Select from '@/common/components/select/AppSelect'
import Segmented from '@/common/components/navigation/SlidingSegmented'
import BusinessTextArea from '@/erp/components/business-list/BusinessTextArea.jsx'
import {
  DateInput,
  DateTimeInput,
  DateRangeFilter,
} from '@/erp/components/business-list/BusinessDateInputs.jsx'
import { buildWorkflowDeadlineQuickOptions } from '@/erp/utils/workflowTaskTiming.mjs'
import { buildHistorySourceSelectOptions } from '@/erp/utils/historySourceSelectOptions.mjs'

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
const GROUPED_SOURCE_OPTIONS = buildHistorySourceSelectOptions([
  { key: 'materials', label: '材料档案', kind: 'master' },
  { key: 'suppliers', label: '供应商与加工厂', kind: 'master' },
  { key: 'sales_orders', label: '销售订单', kind: 'order' },
  { key: 'purchase_orders', label: '采购订单', kind: 'order' },
  { key: 'outsourcing_orders', label: '委外订单', kind: 'order' },
]).map((group) => ({
  ...group,
  options: group.options.map((option) => ({
    ...option,
    disabled: option.value === 'suppliers',
  })),
}))
const GROUPED_SOURCE_LABELS = new Map(
  GROUPED_SOURCE_OPTIONS.flatMap((group) => group.options.map(({ value, label }) => [value, label]))
)
const WAREHOUSE_OPTIONS = [
  { value: 1, label: '缝制仓 · 东莞一厂二楼毛绒玩具半成品与配套辅料存放区', code: 'WH-SEWING-01' },
  { value: 2, label: '成品仓', code: 'WH-FINISHED-02' },
].map(({ value, label, code }) => ({
  value,
  label: `${label} · ${code}`,
  identity: { name: label, code },
}))
const STATISTIC_CURRENCIES = [
  { value: 'CNY', label: '人民币' },
  { value: 'USD', label: '美元' },
]

export function SelectOperationParameterExample() {
  const [currency, setCurrency] = useState('CNY')
  const fieldId = useId()
  return (
    <div className="erp-control-example-stack">
      <div className="erp-control-input-field">
        <label htmlFor={fieldId}>统计币种</label>
        <Select
          id={fieldId}
          value={currency}
          options={STATISTIC_CURRENCIES}
          allowClear={false} // 不可清空：统计必须始终使用一个有效币种。
          onChange={setCurrency}
        />
      </div>
      <p>统计始终需要一个有效币种。</p>
    </div>
  )
}

export function SelectLongValueExample() {
  const [warehouse, setWarehouse] = useState(1)
  const [narrow, setNarrow] = useState(true)
  return (
    <div className="erp-control-example-stack">
      <div className="erp-control-example-row">
        <Checkbox checked={narrow} onChange={(event) => setNarrow(event.target.checked)}>
          窄区域
        </Checkbox>
        <Button onClick={() => { setWarehouse(1); setNarrow(true) }}>恢复初始内容</Button>
      </div>
      <div className={narrow ? 'erp-control-input-field erp-control-long-select--narrow' : 'erp-control-input-field'}>
        <label htmlFor="control-long-warehouse">仓库</label>
        <Select
          id="control-long-warehouse"
          value={warehouse}
          onChange={setWarehouse}
          options={WAREHOUSE_OPTIONS}
          showSearch
          optionFilterProp="label"
          placeholder="选择仓库"
        />
        <output aria-label="仓库当前值">
          {WAREHOUSE_OPTIONS.find(({ value }) => value === warehouse)?.identity.name ?? '未选择仓库'}
        </output>
      </div>
    </div>
  )
}

export function GroupedSelectExample() {
  const [source, setSource] = useState('purchase_orders')
  const [sources, setSources] = useState(['materials', 'sales_orders'])
  return (
    <div className="erp-control-example-stack">
      <div className="erp-control-input-grid">
        <div className="erp-control-input-field">
          <label htmlFor="control-grouped-source">单选记录类型</label>
          <Select
            id="control-grouped-source"
            aria-label="单选记录类型"
            placeholder="选择记录类型"
            virtual={false}
            value={source}
            onChange={setSource}
            options={GROUPED_SOURCE_OPTIONS}
          />
          <output aria-label="分组单选结果">{GROUPED_SOURCE_LABELS.get(source) || '未选择记录类型'}</output>
        </div>
        <div className="erp-control-input-field">
          <label htmlFor="control-grouped-sources">多选记录类型</label>
          <Select
            id="control-grouped-sources"
            aria-label="多选记录类型"
            placeholder="选择记录类型"
            mode="multiple"
            virtual={false}
            value={sources}
            onChange={setSources}
            options={GROUPED_SOURCE_OPTIONS}
          />
          <output aria-label="分组多选结果">{sources.length ? sources.map((value) => GROUPED_SOURCE_LABELS.get(value)).join('、') : '未选择记录类型'}</output>
        </div>
      </div>
      <p>供应商与加工厂仅用于演示禁用状态；这些选择不查询或修改业务记录。</p>
      <div className="erp-control-example-row">
        <Button
          onClick={() => {
            setSource('purchase_orders')
            setSources(['materials', 'sales_orders'])
          }}
        >
          重置分组示例
        </Button>
      </div>
    </div>
  )
}

export function BasicInputExample({ field }) {
  const [state, setState] = useState('normal')
  const [name, setName] = useState('布偶熊')
  const [category, setCategory] = useState('toy')
  const [note, setNote] = useState('')
  const [categorySave, setCategorySave] = useState('')
  const categoryErrorId = useId()
  const categoryRef = useRef(null)
  const categoryRequired = field === 'select'
  const categoryInvalid = categorySave === 'missing'
  const disabled = state === 'disabled'
  const status = state === 'error' ? 'error' : undefined
  const hasField = (key) => !field || field === key
  const categoryName =
    { toy: '毛绒玩具', accessory: '挂件' }[category] ?? '未选择类别'
  return (
    <div className="erp-control-example-stack">
      <Segmented
        aria-label="基础输入状态"
        value={state}
        onChange={(value) => {
          setState(value)
          setCategorySave('')
        }}
        options={STATES}
      />
      {field !== 'note' && (
        <div className="erp-control-input-grid">
          {hasField('name') && (
            <div className="erp-control-input-field">
              <label htmlFor="control-product-name">产品名称</label>
              <Input
                id="control-product-name"
                placeholder="填写产品名称"
                allowClear
                value={name}
                disabled={disabled}
                status={status}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
          )}
          {hasField('select') && (
            <div className="erp-control-input-field">
              <label htmlFor="control-product-category">
                {categoryRequired && <span className="erp-control-example-validation" aria-hidden="true">* </span>}
                产品类别
              </label>
              <Select
                ref={categoryRef}
                placeholder="选择产品类别"
                aria-label="产品类别"
                id="control-product-category"
                aria-required={categoryRequired || undefined}
                aria-invalid={categoryInvalid || undefined}
                aria-describedby={categoryInvalid ? categoryErrorId : undefined}
                value={category}
                disabled={disabled}
                status={categoryInvalid ? 'error' : status}
                onChange={(value) => {
                  setCategory(value)
                  setCategorySave('')
                }}
                options={[
                  { value: 'toy', label: '毛绒玩具' },
                  { value: 'accessory', label: '挂件' },
                ]}
              />
              {categoryInvalid && (
                <span id={categoryErrorId} className="erp-control-example-validation" role="alert">
                  请选择产品类别
                </span>
              )}
            </div>
          )}
        </div>
      )}
      {hasField('note') && (
        <div className="erp-control-input-field">
          <label htmlFor="control-remark">备注</label>
          <BusinessTextArea
            id="control-remark"
            minRows={2}
            maxLength={BusinessTextPolicy.noteMaxCharacters}
            showCount
            allowClear
            value={note}
            disabled={disabled}
            status={status}
            onChange={(event) => setNote(event.target.value)}
          />
        </div>
      )}
      {status && (
        <p role="alert">错误外观由示例状态触发；正式页面按字段校验结果设置。</p>
      )}
      {field !== 'note' && (
        <output aria-label="基础输入结果">
          {hasField('name') && (name || '未填写名称')}
          {!field && ' · '}
          {hasField('select') && categoryName}
        </output>
      )}
      <div className="erp-control-example-row">
        {categoryRequired && (
          <Button
            type="primary"
            disabled={disabled}
            onClick={() => {
              setCategorySave(category ? 'saved' : 'missing')
              if (!category) categoryRef.current?.focus()
            }}
          >
            保存样例
          </Button>
        )}
        <Button
          disabled={disabled}
          onClick={() => {
            setName('布偶熊')
            setCategory('toy')
            setCategorySave('')
            setNote('')
            setState('normal')
          }}
        >
          恢复初始内容
        </Button>
        {categorySave === 'saved' && <output>已保存样例</output>}
      </div>
    </div>
  )
}

export function DateInputExample({ field }) {
  const [state, setState] = useState('normal')
  const [values, setValues] = useState(INITIAL_DATES)
  const [resetKey, setResetKey] = useState(0)
  const update = (key, value) =>
    setValues((current) => ({ ...current, [key]: value }))
  const disabled = state === 'disabled'
  const status = state === 'error' ? 'error' : undefined
  return (
    <div className="erp-control-example-stack">
      {field !== 'range' && (
        <Segmented
          aria-label="日期输入状态"
          value={state}
          onChange={setState}
          options={STATES}
        />
      )}
      {field !== 'range' && (
        <div className="erp-control-input-grid">
          {field === 'date' && (
            <div className="erp-control-input-field">
              <label htmlFor="control-date">单个日期</label>
              <DateInput
                key={`date-${resetKey}`}
                id="control-date"
                value={values.date}
                disabled={disabled}
                status={status}
                onChange={(value) => update('date', value)}
              />
              <output aria-label="日期当前值">{values.date || '未设置'}</output>
            </div>
          )}
          {field === 'time' && (
            <div className="erp-control-input-field">
              <label htmlFor="control-deadline">跟进截止时间</label>
              <DateTimeInput
                key={`deadline-${resetKey}`}
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
          )}
        </div>
      )}
      {field === 'range' && (
        <section className="erp-control-input-field" aria-label="日期范围示例">
          <DateRangeFilter
            key={`range-${resetKey}`}
            options={[
              { value: 'order', label: '下单日期' },
              { value: 'delivery', label: '交货日期', upcoming: true },
            ]}
            value={values.type}
            startValue={values.start}
            endValue={values.end}
            onRangeChange={(start, end, type) =>
              setValues((current) => ({ ...current, start, end, type }))
            }
          />
          <output aria-label="日期范围当前值">
            {values.start || '未设置'} 至 {values.end || '未设置'}
          </output>
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
      )}
      <div className="erp-control-example-row">
        <Button
          onClick={() => {
            setValues(INITIAL_DATES)
            setState('normal')
            // 显式重置同时丢弃控件尚未提交的输入，操作按钮保持挂载。
            setResetKey((current) => current + 1)
          }}
        >
          重置日期示例
        </Button>
      </div>
    </div>
  )
}
