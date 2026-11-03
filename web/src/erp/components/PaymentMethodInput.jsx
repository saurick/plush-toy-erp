import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { DownOutlined } from '@ant-design/icons'
import { AutoComplete, Button, Space, Spin, Typography } from 'antd'
import { isRpcAbortError } from '@/common/utils/jsonRpc'
import { listPaymentMethods } from '../api/masterDataOrderApi.mjs'
import useBusinessPageContext from '../hooks/useBusinessPageContext.js'
import { buildPaymentMethodOptions } from '../utils/paymentConditions.mjs'
import PaymentMethodManager from './PaymentMethodManager.jsx'
import './paymentMethodInput.css'

export default function PaymentMethodInput({
  value,
  onChange,
  onBlur,
  disabled,
  placeholder = '选择或输入付款方式',
  ...props
}) {
  const context = useBusinessPageContext()
  const scope = JSON.stringify(context?.adminProfile || null)
  const [access, setAccess] = useState({ scope: null, canManage: false })
  const canManage = context?.taskBusiness?.readOnly !== true && access.scope === scope && access.canManage
  const [managerScope, setManagerScope] = useState(null)
  const [open, setOpen] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [retry, setRetry] = useState(0)
  const [status, setStatus] = useState('idle')
  const [result, setResult] = useState({ methods: [], hasMore: false, scope })
  const generation = useRef(0)
  const control = useRef(null)
  const accessScope = useRef(null)

  useEffect(() => { setManagerScope(null) }, [scope, canManage])

  useEffect(() => {
    const sequence = ++generation.current
    if (disabled || (!open && accessScope.current === scope)) return undefined
    const controller = new AbortController()
    setStatus('loading')
    const timer = setTimeout(async () => {
      try {
        const data = await listPaymentMethods(
          { keyword },
          { signal: controller.signal }
        )
        if (controller.signal.aborted || sequence !== generation.current) return
        accessScope.current = scope
        setAccess({ scope, canManage: data.can_manage })
        setResult({ methods: data.methods, hasMore: data.has_more, keywordNotRecommended: data.keyword_not_recommended, keyword: keyword.trim(), scope })
        setStatus('ready')
      } catch (error) {
        if (controller.signal.aborted || sequence !== generation.current || isRpcAbortError(error)) return
        accessScope.current = scope
        setAccess({ scope, canManage: false })
        setResult({ methods: [], hasMore: false, scope })
        setStatus('error')
      }
    }, keyword ? 180 : 0)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [disabled, keyword, open, retry, scope])

  const renderPopup = useCallback((menu) => (
    <>
      {menu}
      {status === 'loading' ? (
        <Space className="erp-payment-method-input__feedback" role="status">
          <Spin size="small" /><Typography.Text type="secondary">正在读取历史方式</Typography.Text>
        </Space>
          ) : result.hasMore ? (
            <Typography.Text className="erp-payment-method-input__feedback" type="secondary">输入关键词查找更多方式</Typography.Text>
          ) : null}
    </>
  ), [result.hasMore, status])

  const options = useMemo(
    () => buildPaymentMethodOptions(result.scope === scope ? result.methods : [], keyword)
      .map((option) => option.isNew
        ? {
            ...option,
            label: (
              <div className="erp-payment-method-input__new-option">
                <span>{result.scope === scope && result.keyword === keyword.trim() && result.keywordNotRecommended ? '本次使用' : '使用'}「{option.value}」</span>
                <Typography.Text type="secondary">{result.scope === scope && result.keyword === keyword.trim() && result.keywordNotRecommended ? '保存不会恢复推荐' : '随当前记录保存'}</Typography.Text>
              </div>
            ),
          }
        : option),
    [keyword, result, scope]
  )

  return (
    <div className="erp-payment-method-input">
      <AutoComplete
        {...props}
        ref={control}
        className={['erp-payment-method-input__control', props.className].filter(Boolean).join(' ')}
        allowClear
        autoComplete="off"
        disabled={disabled}
        filterOption={false}
        maxLength={128}
        open={open && !disabled}
        options={options}
        placeholder={placeholder}
        suffixIcon={<DownOutlined />}
        value={value}
        onChange={onChange}
        onSearch={setKeyword}
        onInputKeyDown={(event) => {
          props.onInputKeyDown?.(event)
          if (event.key === 'Escape' && open && !event.nativeEvent?.isComposing) {
            event.preventDefault()
            setOpen(false)
          }
        }}
        onFocus={() => {
          setKeyword('')
          setOpen(true)
        }}
        onOpenChange={setOpen}
        onBlur={(event) => {
          setOpen(false)
          onBlur?.(event)
        }}
        popupRender={renderPopup}
      />
      {canManage ? <Button disabled={disabled} onClick={() => { setOpen(false); setManagerScope(scope) }}>管理付款方式</Button> : null}
      {status === 'error' && result.scope === scope ? (
        <Space className="erp-payment-method-input__error" wrap role="status">
          <Typography.Text type="secondary">历史方式读取失败，仍可直接输入</Typography.Text>
          <Button size="small" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => { control.current?.focus(); setOpen(true); setRetry((current) => current + 1) }}>重试</Button>
        </Space>
      ) : null}
      {canManage && managerScope === scope ? (
        <PaymentMethodManager
          key={scope}
          onClose={() => setManagerScope(null)}
          onChanged={() => {
            setResult({ methods: [], hasMore: false, scope })
            setRetry((current) => current + 1)
          }}
        />
      ) : null}
    </div>
  )
}
