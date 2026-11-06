import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react'
import { DownOutlined } from '@ant-design/icons'
import { Button, Form, Space, Spin, Typography } from 'antd'
import Select from '@/common/components/select/AppSelect'
import { isRpcAbortError } from '@/common/utils/jsonRpc'
import { listPaymentMethods } from '../api/masterDataOrderApi.mjs'
import useBusinessPageContext from '../hooks/useBusinessPageContext.js'
import { buildPaymentMethodOptions } from '../utils/paymentConditions.mjs'
import PaymentMethodManager from './PaymentMethodManager.jsx'
import './paymentMethodInput.css'

export function PaymentMethodField({ label = '付款方式', inputProps, className, ...fieldProps }) {
  const [management, setManagement] = useState(null)
  const labelId = useId()
  const controlId = inputProps?.id || (Array.isArray(fieldProps.name) ? fieldProps.name.join('_') : fieldProps.name) || `${labelId}-input`
  const registerManagement = useCallback((value) => setManagement(value), [])
  return (
    <Form.Item className={[className, 'erp-payment-method-field'].filter(Boolean).join(' ')} htmlFor={controlId} label={<span className="erp-payment-method-field__label"><span id={labelId}>{label}</span>{management?.canManage ? <span className="erp-payment-method-field__action"><Button type="link" size="small" onClick={() => management.open()}>管理付款方式</Button></span> : null}</span>}>
      <Form.Item {...fieldProps} noStyle>
        <PaymentMethodInput {...inputProps} id={controlId} aria-labelledby={labelId} registerManagement={registerManagement} />
      </Form.Item>
    </Form.Item>
  )
}

export function PaymentMethodEntry() {
  return <PaymentMethodInput managementOnly />
}

export default function PaymentMethodInput({ value, onChange, onBlur, disabled, registerManagement, managementOnly = false, placeholder = '搜索并选择付款方式', ...props }) {
  const context = useBusinessPageContext()
  const scope = JSON.stringify(context?.adminProfile || null)
  const [access, setAccess] = useState({ scope: null, canManage: false })
  const canManage = context?.taskBusiness?.readOnly !== true && access.scope === scope && access.canManage
  const [manager, setManager] = useState(null)
  const [renameOffer, setRenameOffer] = useState(null)
  const [open, setOpen] = useState(false)
  const [keyword, setKeyword] = useState('')
  const [retry, setRetry] = useState(0)
  const [status, setStatus] = useState('idle')
  const [result, setResult] = useState({ methods: [], hasMore: false, scope })
  const generation = useRef(0)
  const control = useRef(null)
  const accessScope = useRef(null)
  const managerTrigger = useRef(null)
  const restoreFocus = useRef(false)
  const openManager = useCallback((name = null) => { managerTrigger.current = document.activeElement?.tabIndex >= 0 ? document.activeElement : null; setOpen(false); setManager({ scope, name }) }, [scope])

  useEffect(() => {
    if (manager || !restoreFocus.current) return
    restoreFocus.current = false
    if (managerTrigger.current?.isConnected) managerTrigger.current.focus({ preventScroll: true })
    else control.current?.focus()
    setOpen(false)
  }, [manager])

  useEffect(() => { setManager(null); setRenameOffer(null) }, [scope, canManage])
  useEffect(() => {
    registerManagement?.({ canManage: canManage && !disabled, open: openManager })
    return () => registerManagement?.(null)
  }, [canManage, disabled, openManager, registerManagement])
  useEffect(() => {
    const sequence = ++generation.current
    if (disabled || (!open && accessScope.current === scope && retry === 0)) return undefined
    const controller = new AbortController()
    setStatus('loading')
    const timer = setTimeout(async () => {
      try {
        const data = await listPaymentMethods({ keyword }, { signal: controller.signal, readScope: JSON.stringify([scope, retry]) })
        if (controller.signal.aborted || sequence !== generation.current) return
        accessScope.current = scope
        setAccess({ scope, canManage: data.can_manage })
        setResult({ methods: data.methods, hasMore: data.has_more, keywordExists: data.keyword_exists, keywordInactive: data.keyword_inactive, keyword: keyword.trim(), scope })
        setStatus('ready')
      } catch (error) {
        if (controller.signal.aborted || sequence !== generation.current || isRpcAbortError(error)) return
        accessScope.current = scope
        setAccess((previous) => previous.scope === scope ? previous : { scope, canManage: false })
        setResult({ methods: [], hasMore: false, scope })
        setStatus('error')
      }
    }, keyword ? 180 : 0)
    return () => { clearTimeout(timer); controller.abort() }
  }, [disabled, keyword, open, retry, scope])

  const currentResult = result.scope === scope && result.keyword === keyword.trim() && status === 'ready'
  const newName = keyword.trim()
  const canCreate = canManage && currentResult && Boolean(newName) && !result.keywordExists
  const renderPopup = useCallback((menu) => (
    <>
      {menu}
      {status === 'loading' ? <Space className="erp-payment-method-input__feedback" role="status"><Spin size="small" /><Typography.Text type="secondary">正在读取付款方式</Typography.Text></Space> : result.hasMore ? <Typography.Text className="erp-payment-method-input__feedback" type="secondary">输入关键词查找更多方式</Typography.Text> : null}
      {canCreate ? <div className="erp-payment-method-input__popup-actions"><Button type="link" onMouseDown={(event) => event.preventDefault()} onClick={() => openManager(newName)}>新增并选用「{newName}」</Button></div> : null}
    </>
  ), [canCreate, newName, openManager, result.hasMore, status])
  const options = useMemo(() => buildPaymentMethodOptions(result.scope === scope ? result.methods : [], keyword), [keyword, result, scope])
  const changed = (change) => {
    setRetry((previous) => previous + 1)
    if (change.type === 'delete') setRenameOffer((previous) => previous?.id === change.before.id ? null : previous)
    if (change.type === 'update' && change.before.method !== change.after.method) {
      setRenameOffer((previous) => {
        if (previous?.id === change.after.id) return value === change.after.method ? null : { ...previous, after: change.after.method }
        return value === change.before.method ? { id: change.after.id, scope, before: change.before.method, after: change.after.method } : previous
      })
    }
  }
  const managerElement = canManage && manager?.scope === scope ? <PaymentMethodManager key={scope} initialName={manager.name} onClose={() => { restoreFocus.current = true; setManager(null) }} onChanged={changed} onCreated={onChange ? (item) => { onChange(item.method); setKeyword('') } : undefined} /> : null

  if (managementOnly) return <>{canManage ? <Button disabled={disabled} onClick={() => openManager()}>管理付款方式</Button> : null}{managerElement}</>

  return (
    <div className="erp-payment-method-input">
      <Select
        {...props}
        ref={control}
        className={['erp-payment-method-input__control', props.className].filter(Boolean).join(' ')}
        allowClear
        disabled={disabled}
        filterOption={false}
        showSearch
        searchValue={keyword}
        notFoundContent={status === 'loading' ? null : '没有匹配的公司共用付款方式'}
        open={open && !disabled}
        options={options}
        placeholder={placeholder}
        popupMatchSelectWidth
        suffixIcon={<DownOutlined />}
        value={value}
        onChange={(next) => { onChange?.(next ?? ''); setKeyword('') }}
        onSearch={(next) => setKeyword(next.slice(0, 128))}
        onInputKeyDown={(event) => { props.onInputKeyDown?.(event); if (event.key === 'Escape' && open && !event.nativeEvent?.isComposing) { event.preventDefault(); setOpen(false) } }}
        onFocus={() => { setKeyword(''); setOpen(true) }}
        onOpenChange={setOpen}
        onBlur={(event) => { setOpen(false); setKeyword(''); onBlur?.(event) }}
        popupRender={renderPopup}
      />
      {!registerManagement && canManage ? <Button type="link" disabled={disabled} onClick={() => openManager()}>管理付款方式</Button> : null}
      {renameOffer?.scope === scope && value === renameOffer.before ? <Space className="erp-payment-method-input__rename" wrap role="status"><span>选项已改名为「{renameOffer.after}」，当前记录保留原值。</span><Button size="small" disabled={disabled} onClick={() => { onChange?.(renameOffer.after); setRenameOffer(null) }}>本单也使用新名称</Button><Button size="small" onClick={() => setRenameOffer(null)}>保留原值</Button></Space> : null}
      {status === 'error' && result.scope === scope ? <Space className="erp-payment-method-input__error" wrap role="status"><Typography.Text type="secondary">付款方式读取失败，请重试</Typography.Text><Button size="small" disabled={disabled} onMouseDown={(event) => event.preventDefault()} onClick={() => { control.current?.focus(); setOpen(true); setRetry((current) => current + 1) }}>重试</Button></Space> : null}
      {managerElement}
    </div>
  )
}
