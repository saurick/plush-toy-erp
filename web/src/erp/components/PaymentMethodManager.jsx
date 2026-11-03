import React, { useEffect, useId, useRef, useState } from 'react'
import { LeftOutlined, PlusOutlined, ReloadOutlined, RightOutlined } from '@ant-design/icons'
import { Alert, Button, Input, Popconfirm, Space, Spin, Tooltip, Typography } from 'antd'
import Empty from '@/common/components/empty/AppEmpty.jsx'
import SearchInput from '@/common/components/SearchInput.jsx'
import SlidingTabs from '../../common/components/navigation/SlidingTabs.jsx'
import { getActionErrorMessage } from '../../common/utils/errorMessage.js'
import { isRpcAbortError } from '../../common/utils/jsonRpc.js'
import { createPaymentMethod, deletePaymentMethod, listPaymentMethodOptions, updatePaymentMethod } from '../api/masterDataOrderApi.mjs'
import BusinessModal from './business-list/BusinessModal.jsx'
import './paymentMethodInput.css'

const PAGE_SIZE = 20

export default function PaymentMethodManager({ onClose, onChanged, onCreated, initialName = null }) {
  const quickCreate = initialName !== null
  const [view, setView] = useState('active')
  const [queries, setQueries] = useState({ active: '', inactive: '' })
  const [offsets, setOffsets] = useState({ active: 0, inactive: 0 })
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState({ key: '', items: [], hasMore: false })
  const [loading, setLoading] = useState(!quickCreate)
  const [busy, setBusy] = useState(false)
  const [readError, setReadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')
  const [lastChange, setLastChange] = useState(null)
  const [editor, setEditor] = useState(quickCreate ? { item: null, name: initialName } : null)
  const active = useRef(true)
  const submitting = useRef(false)
  const sequence = useRef(0)
  const editorInput = useRef(null)
  const editorId = useId()
  const keyword = queries[view].trim()
  const offset = offsets[view]
  const requestKey = `${view}|${keyword}|${offset}`
  const current = result.key === requestKey ? result : { items: [], hasMore: false }
  const initialLoading = loading && result.key !== requestKey
  const editorKey = editor ? editor.item?.id ?? 'new' : null
  const navigationLocked = busy || editor !== null

  useEffect(() => {
    active.current = true
    return () => { active.current = false }
  }, [])
  useEffect(() => { if (editorKey !== null) editorInput.current?.focus() }, [editorKey])
  useEffect(() => {
    if (quickCreate) return undefined
    const generation = ++sequence.current
    const controller = new AbortController()
    setLoading(true)
    setReadError('')
    const read = async () => {
      try {
        const data = await listPaymentMethodOptions({ keyword, is_active: view === 'active', limit: PAGE_SIZE, offset }, { signal: controller.signal })
        if (controller.signal.aborted || generation !== sequence.current) return
        if (data.items.length === 0 && offset > 0) {
          setOffsets((previous) => ({ ...previous, [view]: Math.max(0, offset - PAGE_SIZE) }))
          return
        }
        setResult({ key: requestKey, items: data.items, hasMore: data.has_more })
      } catch (error) {
        if (controller.signal.aborted || generation !== sequence.current || isRpcAbortError(error)) return
        setReadError('付款方式读取失败，请重试')
      } finally {
        if (!controller.signal.aborted && generation === sequence.current) setLoading(false)
      }
    }
    read()
    return () => controller.abort()
  }, [keyword, offset, quickCreate, requestKey, revision, view])

  const refresh = () => setRevision((value) => value + 1)
  const revealName = (method, targetView = view) => {
    setView(targetView)
    setQueries((previous) => ({ ...previous, [targetView]: method }))
    setOffsets((previous) => ({ ...previous, [targetView]: 0 }))
  }
  const mutate = async (action, fallback) => {
    if (submitting.current) return
    submitting.current = true
    setBusy(true)
    setActionError('')
    try { await action() } catch (error) {
      if (active.current) {
        setActionError(getActionErrorMessage(error, fallback))
        editorInput.current?.focus()
      }
    } finally {
      submitting.current = false
      if (active.current) setBusy(false)
    }
  }
  const update = (item, values, undo = false) => mutate(async () => {
    const changed = await updatePaymentMethod({ id: item.id, method: values.method, is_active: values.is_active, expected_version: item.version })
    if (!active.current) return
    setLastChange(undo ? null : { before: item, after: changed })
    setNotice(undo ? '已撤销上次修改' : item.method !== changed.method ? `已改名为「${changed.method}」` : `已${changed.is_active ? '启用' : '停用'}「${changed.method}」`)
    setEditor(null)
    if (item.method !== changed.method) revealName(changed.method)
    onChanged?.({ type: 'update', before: item, after: changed })
    refresh()
  }, undo ? '撤销付款方式修改' : '修改付款方式')
  const saveEditor = () => {
    if (!editor) return undefined
    const method = editor.name.trim()
    if (!method) { setActionError('请填写付款方式名称'); editorInput.current?.focus(); return undefined }
    if (editor.item) return update(editor.item, { ...editor.item, method })
    return mutate(async () => {
      const item = await createPaymentMethod({ method })
      if (!active.current) return
      setLastChange(null)
      onChanged?.({ type: 'create', after: item })
      onCreated?.(item)
      if (quickCreate) { onClose(); return }
      setEditor(null)
      setNotice(`已新增「${item.method}」`)
      revealName(item.method, 'active')
      refresh()
    }, '新增付款方式')
  }
  const remove = (item) => mutate(async () => {
    await deletePaymentMethod({ id: item.id, expected_version: item.version })
    if (!active.current) return
    setLastChange(null)
    setNotice(`已删除未使用的「${item.method}」`)
    onChanged?.({ type: 'delete', before: item })
    refresh()
  }, '删除付款方式')
  const cancelEditor = () => { setEditor(null); setActionError('') }
  const editorField = editor ? <Input id={editorId} aria-label={editor.item ? '修改名称' : '新增名称'} ref={editorInput} maxLength={128} disabled={busy} status={actionError ? 'error' : undefined} value={editor.name} placeholder="输入付款方式名称" onChange={(event) => setEditor((previous) => ({ ...previous, name: event.target.value }))} onPressEnter={(event) => { if (!event.nativeEvent?.isComposing) { event.preventDefault(); saveEditor() } }} /> : null
  const editorActions = <Space><Button disabled={busy} onClick={cancelEditor}>取消</Button><Button type="primary" loading={busy} onClick={saveEditor}>{editor?.item ? '保存名称' : onCreated ? '新增并选用' : '保存'}</Button></Space>
  const footer = quickCreate ? undefined : (
    <div className="erp-payment-method-manager__footer">
      <Typography.Text type="secondary" className="erp-payment-method-manager__hint">公司共用；历史不变，已使用项不可删除。</Typography.Text>
      <Space className="erp-payment-method-manager__pager" aria-label="付款方式分页">
        <Tooltip title="上一页" trigger={['hover', 'focus']}><Button aria-label="上一页" icon={<LeftOutlined />} disabled={navigationLocked || loading || offset === 0} onClick={() => setOffsets((previous) => ({ ...previous, [view]: Math.max(0, offset - PAGE_SIZE) }))} /></Tooltip>
        <span className="erp-payment-method-manager__page">第 {Math.floor(offset / PAGE_SIZE) + 1} 页</span>
        <Tooltip title="下一页" trigger={['hover', 'focus']}><Button aria-label="下一页" icon={<RightOutlined />} disabled={navigationLocked || loading || Boolean(readError) || !current.hasMore} onClick={() => setOffsets((previous) => ({ ...previous, [view]: offset + PAGE_SIZE }))} /></Tooltip>
      </Space>
      <Button disabled={busy} onClick={onClose}>{onCreated ? '返回填写' : '关闭'}</Button>
    </div>
  )

  return (
    <BusinessModal open title={quickCreate ? '新增付款方式' : '维护付款方式'} className={quickCreate ? 'erp-payment-method-quick-create' : 'erp-payment-method-modal'} size="localAction" width={quickCreate ? 480 : 680} centered={false} afterOpenChange={(opened) => { if (opened) editorInput.current?.focus() }} confirmLoading={busy} onCancel={onClose} onOk={quickCreate ? saveEditor : undefined} okText="新增并选用" cancelText="取消" {...(!quickCreate ? { footer } : {})}>
      {quickCreate ? <div className="erp-payment-method-quick-create__field"><div className="erp-payment-method-quick-create__label"><label htmlFor={editorId}>名称</label><Typography.Text type="secondary">公司共用选项</Typography.Text></div>{editorField}</div> : (
        <div className="erp-payment-method-manager">
          <SlidingTabs tabBarGutter={20} activeKey={view} items={[{ key: 'active', label: '启用', disabled: navigationLocked }, { key: 'inactive', label: '已停用', disabled: navigationLocked }]} onChange={setView} tabBarExtraContent={<Space><Tooltip title="刷新" trigger={['hover', 'focus']}><Button aria-label="刷新" icon={<ReloadOutlined />} loading={loading} disabled={navigationLocked} onClick={refresh} /></Tooltip><Button type="primary" icon={<PlusOutlined />} aria-label="新增付款方式" disabled={navigationLocked || loading} onClick={() => { setEditor({ item: null, name: '' }); setActionError('') }}>新增</Button></Space>} />
          <div className="erp-payment-method-manager__search"><SearchInput allowClear aria-label="搜索付款方式" placeholder="搜索付款方式" maxLength={128} disabled={navigationLocked} value={queries[view]} resetKey={view} onSearch={(value) => { setQueries((previous) => ({ ...previous, [view]: value })); setOffsets((previous) => ({ ...previous, [view]: 0 })) }} /></div>
          {notice ? <div className="erp-payment-method-manager__notice" role="status"><span>{notice}</span>{lastChange ? <Button type="link" size="small" disabled={navigationLocked} onClick={() => update(lastChange.after, lastChange.before, true)}>撤销</Button> : null}</div> : null}
          {readError ? <Alert type="error" showIcon message={readError} action={<Button size="small" disabled={busy || loading} onClick={refresh}>重试</Button>} /> : null}
          <div className="erp-payment-method-manager__list" aria-busy={loading}>
            {editor && !editor.item ? <div className="erp-payment-method-manager__row erp-payment-method-manager__row--editing"><div className="erp-payment-method-manager__editor-field">{editorField}</div>{editorActions}</div> : null}
            {current.items.map((item) => (
              <div className="erp-payment-method-manager__row" key={item.id}>
                {editor?.item?.id === item.id ? <><div className="erp-payment-method-manager__editor-field">{editorField}</div>{editorActions}</> : <><div className="erp-payment-method-manager__identity"><span className="erp-payment-method-manager__name">{item.method}</span><Typography.Text type="secondary" className="erp-payment-method-manager__usage">{item.has_been_used ? '已使用' : '未使用'}</Typography.Text></div><Space className="erp-payment-method-manager__actions"><Button type="link" size="small" disabled={navigationLocked || loading} aria-label={`改名 ${item.method}`} onClick={() => { setEditor({ item, name: item.method }); setActionError('') }}>改名</Button><Button type="link" size="small" disabled={navigationLocked || loading} aria-label={`${item.is_active ? '停用' : '启用'} ${item.method}`} onClick={() => update(item, { ...item, is_active: !item.is_active })}>{item.is_active ? '停用' : '启用'}</Button><Popconfirm title={`删除尚未使用的「${item.method}」？`} okText="删除" cancelText="取消" disabled={navigationLocked || loading || item.has_been_used} onConfirm={() => remove(item)}><Button type="link" size="small" danger disabled={navigationLocked || loading || item.has_been_used} aria-label={`删除 ${item.method}`}>删除</Button></Popconfirm></Space></>}
              </div>
            ))}
            {initialLoading ? <Space className="erp-payment-method-manager__loading" role="status"><Spin size="small" />正在读取</Space> : !readError && current.items.length === 0 && !editor ? <Empty description={keyword ? '没有匹配的付款方式' : view === 'inactive' ? '没有停用的付款方式' : '暂无付款方式，可点击新增'} /> : null}
          </div>
        </div>
      )}
      {actionError ? <Alert type="error" showIcon message={actionError} /> : null}
    </BusinessModal>
  )
}
