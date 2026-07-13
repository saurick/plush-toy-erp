import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Select } from 'antd'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { message } from '@/common/utils/antdApp'
import { listProductionOrderReferenceOptions } from '../../api/productionOrderApi.mjs'

export default function ProductionOrderReferenceSelect({
  referenceType,
  filters = {},
  value,
  initialOptions = [],
  onChange,
  disabled = false,
  placeholder = '请选择',
  allowClear = true,
}) {
  const [options, setOptions] = useState(initialOptions)
  const requestRef = useRef(0)
  const timerRef = useRef(null)

  useEffect(() => {
    setOptions(initialOptions)
  }, [initialOptions])

  const load = (keyword = '') => {
    window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(
      async () => {
        const requestID = ++requestRef.current
        try {
          const data = await listProductionOrderReferenceOptions(
            referenceType,
            {
              ...filters,
              keyword,
              limit: 20,
              offset: 0,
            }
          )
          if (requestID === requestRef.current) setOptions(data.options)
        } catch (error) {
          if (requestID === requestRef.current) {
            message.error(getActionErrorMessage(error, '加载可选资料'))
          }
        }
      },
      keyword ? 220 : 0
    )
  }

  useEffect(() => {
    if (!disabled) load('')
    return () => window.clearTimeout(timerRef.current)
    // Filters are primitive values assembled by the form row.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    disabled,
    referenceType,
    filters.product_id,
    filters.product_sku_id,
    filters.unit_id,
  ])

  const renderedOptions = useMemo(() => {
    const merged = new Map()
    for (const option of [...initialOptions, ...options]) {
      if (option?.value) merged.set(option.value, option)
    }
    if (value && !merged.has(value)) {
      merged.set(value, {
        value,
        label: '历史引用信息缺失',
        selectable: false,
        reason: '原关联资料已不存在，请联系管理员核对',
      })
    }
    return [...merged.values()].map((option) => ({
      value: option.value,
      label: option.label,
      disabled: option.selectable === false,
      title: option.reason || option.label,
      raw: option,
    }))
  }, [initialOptions, options, value])

  return (
    <Select
      showSearch
      filterOption={false}
      allowClear={allowClear}
      disabled={disabled}
      value={value}
      options={renderedOptions}
      placeholder={placeholder}
      onSearch={load}
      onChange={(nextValue, option) => onChange?.(nextValue, option?.raw)}
    />
  )
}
