import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Select } from 'antd'
import { renderProductOption } from '../master-data/ProductIdentity.jsx'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import { message } from '@/common/utils/antdApp'
import { isRpcAbortError } from '@/common/utils/jsonRpc'
import { listProductionOrderReferenceOptions } from '../../api/productionOrderApi.mjs'
import {
  PRODUCTION_ORDER_REFERENCE_PAGE_SIZE,
  createProductionOrderReferenceRequestGate,
  mergeProductionOrderReferenceOptions,
  nextProductionOrderReferencePage,
  selectedProductionOrderReferenceOptions,
} from '../../utils/productionOrderReferencePagination.mjs'

const SALES_REFERENCE_PLACEMENTS = {
  bottomLeft: {
    points: ['tl', 'bl'],
    offset: [0, 4],
    overflow: { adjustX: true, adjustY: true, shiftX: true, shiftY: true },
    htmlRegion: 'visible',
    dynamicInset: true,
  },
}

function renderSalesReferenceOption(option) {
  return (
    <span style={{ whiteSpace: 'normal', overflowWrap: 'anywhere' }}>
      {option.label}
    </span>
  )
}

export default function ProductionOrderReferenceSelect({
  id,
  referenceType,
  filters = {},
  value,
  initialOptions = [],
  onChange,
  disabled = false,
  placeholder = '请选择',
  allowClear = true,
}) {
  const [options, setOptions] = useState([])
  const [loading, setLoading] = useState(false)
  const requestGateRef = useRef(null)
  if (requestGateRef.current === null) {
    requestGateRef.current = createProductionOrderReferenceRequestGate()
  }
  const pageRef = useRef({
    generation: 0,
    keyword: '',
    nextOffset: null,
    loading: false,
  })
  const controllerRef = useRef(null)
  const timerRef = useRef(null)

  const loadPage = useCallback(
    async ({ generation, keyword, offset, replace }) => {
      if (!requestGateRef.current.isCurrent(generation)) return
      pageRef.current.loading = true
      setLoading(true)
      const controller = new AbortController()
      controllerRef.current = controller
      try {
        const data = await listProductionOrderReferenceOptions(
          referenceType,
          {
            ...(filters.product_id ? { product_id: filters.product_id } : {}),
            ...(filters.product_sku_id
              ? { product_sku_id: filters.product_sku_id }
              : {}),
            ...(filters.unit_id ? { unit_id: filters.unit_id } : {}),
            ...(filters.production_order_id
              ? { production_order_id: filters.production_order_id }
              : {}),
            keyword,
            limit: PRODUCTION_ORDER_REFERENCE_PAGE_SIZE,
            offset,
          },
          { signal: controller.signal }
        )
        if (!requestGateRef.current.isCurrent(generation)) return
        setOptions((current) =>
          mergeProductionOrderReferenceOptions(
            replace
              ? selectedProductionOrderReferenceOptions(current, value)
              : current,
            data.options
          )
        )
        pageRef.current = {
          generation,
          keyword,
          nextOffset: nextProductionOrderReferencePage(data),
          loading: false,
        }
      } catch (error) {
        if (
          requestGateRef.current.isCurrent(generation) &&
          !isRpcAbortError(error)
        ) {
          message.error(getActionErrorMessage(error, '加载可选资料'))
        }
      } finally {
        if (requestGateRef.current.isCurrent(generation)) {
          pageRef.current.loading = false
          setLoading(false)
        }
        if (controllerRef.current === controller) {
          controllerRef.current = null
        }
      }
    },
    [
      referenceType,
      value,
      filters.product_id,
      filters.product_sku_id,
      filters.unit_id,
      filters.production_order_id,
    ]
  )

  const resetAndLoad = useCallback(
    (rawKeyword = '') => {
      window.clearTimeout(timerRef.current)
      controllerRef.current?.abort()
      const keyword = String(rawKeyword || '').trim()
      const generation = requestGateRef.current.next()
      pageRef.current = {
        generation,
        keyword,
        nextOffset: null,
        loading: false,
      }
      setLoading(false)
      setOptions((current) =>
        selectedProductionOrderReferenceOptions(current, value)
      )
      timerRef.current = window.setTimeout(
        () => loadPage({ generation, keyword, offset: 0, replace: true }),
        keyword ? 220 : 0
      )
    },
    [loadPage, value]
  )

  useEffect(() => {
    if (!disabled) {
      resetAndLoad('')
    } else {
      window.clearTimeout(timerRef.current)
      controllerRef.current?.abort()
      requestGateRef.current.next()
      setOptions([])
      setLoading(false)
    }
    return () => window.clearTimeout(timerRef.current)
  }, [disabled, resetAndLoad])

  useEffect(
    () => () => {
      requestGateRef.current.next()
      controllerRef.current?.abort()
      window.clearTimeout(timerRef.current)
    },
    []
  )

  const handlePopupScroll = useCallback(
    (event) => {
      const target = event?.currentTarget
      if (
        !target ||
        target.scrollHeight - target.scrollTop - target.clientHeight > 32
      ) {
        return
      }
      const page = pageRef.current
      if (page.loading || page.nextOffset === null) return
      loadPage({
        generation: page.generation,
        keyword: page.keyword,
        offset: page.nextOffset,
        replace: false,
      })
    },
    [loadPage]
  )

  const renderedOptions = useMemo(() => {
    const merged = new Map()
    for (const option of mergeProductionOrderReferenceOptions(
      initialOptions,
      options
    )) {
      merged.set(option.value, option)
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

  // Sales-source names and capacity wrap; paged options need their actual row height.
  const salesReference = referenceType === 'sales_order_item'

  return (
    <Select
      id={id}
      showSearch
      filterOption={false}
      allowClear={allowClear}
      disabled={disabled}
      loading={loading}
      value={value}
      options={renderedOptions}
      placement={salesReference ? 'bottomLeft' : undefined}
      builtinPlacements={
        salesReference ? SALES_REFERENCE_PLACEMENTS : undefined
      }
      popupMatchSelectWidth={salesReference ? false : undefined}
      styles={
        salesReference
          ? { popup: { root: { width: 'min(520px, calc(100vw - 24px))' } } }
          : undefined
      }
      virtual={salesReference ? false : undefined}
      listItemHeight={referenceType === 'product' ? 48 : undefined}
      optionRender={
        referenceType === 'product'
          ? renderProductOption
          : salesReference
            ? renderSalesReferenceOption
            : undefined
      }
      placeholder={placeholder}
      onSearch={resetAndLoad}
      onPopupScroll={handlePopupScroll}
      onChange={(nextValue, option) => onChange?.(nextValue, option?.raw)}
    />
  )
}
