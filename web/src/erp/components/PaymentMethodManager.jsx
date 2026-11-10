import React, { useEffect, useId, useRef, useState } from 'react'
import { LeftOutlined, PlusOutlined, ReloadOutlined, RightOutlined } from '@ant-design/icons'
import { Alert, Button, Input, Space, Spin, Tooltip, Typography } from 'antd'
import Empty from '@/common/components/empty/AppEmpty.jsx'
import SearchInput from '@/common/components/SearchInput.jsx'
import Table from '@/common/components/table/AppTable.jsx'
import FilterChipGroup from '@/common/components/navigation/FilterChipGroup.jsx'
import { getActionErrorMessage } from '../../common/utils/errorMessage.js'
import { isRpcAbortError } from '../../common/utils/jsonRpc.js'
import { createPaymentMethod, deletePaymentMethod, listPaymentMethodOptions, updatePaymentMethod } from '../api/masterDataOrderApi.mjs'
import BusinessModal from './business-list/BusinessModal.jsx'
import { BusinessActionTooltip } from './business-list/BusinessListLayout.jsx'
import MaintenanceSelectionBar from './business-list/MaintenanceSelectionBar.jsx'
import './paymentMethodInput.css'

const PAGE_SIZE = 20
const PAYMENT_METHOD_STATUS_OPTIONS = [{ value: 'active', label: '启用' }, { value: 'inactive', label: '已停用' }]
const COLUMNS = [
  { title: '付款方式', dataIndex: 'method', key: 'method', render: (method, item) => <div className="erp-payment-method-manager__identity"><span className="erp-payment-method-manager__name">{method}</span><Typography.Text type="secondary" className="erp-payment-method-manager__usage">{item.has_been_used ? '已使用' : '未使用'}</Typography.Text></div> },
  { title: '状态', dataIndex: 'is_active', key: 'is_active', width: 80, render: (isActive) => isActive ? '启用' : '已停用' },
]

export default function PaymentMethodManager({ onClose, onChanged, onCreated, initialName = null }) {
  const [quickCreate, setQuickCreate] = useState(initialName !== null)
  const [creationDraft, setCreationDraft] = useState(initialName)
  const [view, setView] = useState('active')
  const [queries, setQueries] = useState({ active: '', inactive: '' })
  const [offsets, setOffsets] = useState({ active: 0, inactive: 0 })
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState({ key: '', items: [], hasMore: false })
  const [loading, setLoading] = useState(!quickCreate)
  const [busy, setBusy] = useState(false)
  const [canDelete, setCanDelete] = useState(false)
  const [readError, setReadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [notice, setNotice] = useState('')
  const [lastChange, setLastChange] = useState(null)
  const [editor, setEditor] = useState(quickCreate ? { item: null, name: initialName } : null)
  const [selection, setSelection] = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)
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
  const navigationLocked = busy || editor !== null || deleteTarget !== null
  const selectedItem = selection?.key === requestKey ? current.items.find((item) => item.id === selection.id) : null
  const recordLocked = navigationLocked || loading || Boolean(readError) || !selectedItem
  const showPager = offset > 0 || current.hasMore

  useEffect(() => {
    active.current = true
    return () => { active.current = false }
  }, [])
  useEffect(() => { if (editorKey !== null) editorInput.current?.focus() }, [editorKey])
  useEffect(() => { setSelection(null) }, [requestKey])
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
        setCanDelete(data.can_delete)
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

  const refresh = () => { setSelection(null); setRevision((value) => value + 1) }
  const selectItem = (item) => {
    if (navigationLocked || loading || readError) return
    setSelection(item ? { id: item.id, key: requestKey } : null)
    setActionError('')
  }
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
    setSelection(null)
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
      setCreationDraft(null)
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
    setDeleteTarget(null)
    setNotice(`已删除未使用的「${item.method}」`)
    onChanged?.({ type: 'delete', before: item })
    refresh()
  }, '删除付款方式')
  const cancelEditor = () => { setEditor(null); setActionError('') }
  const editorField = editor ? <Input id={editorId} aria-label={editor.item ? '修改名称' : '新增名称'} ref={editorInput} maxLength={128} disabled={busy} status={actionError ? 'error' : undefined} value={editor.name} placeholder="输入付款方式名称" onChange={(event) => setEditor((previous) => ({ ...previous, name: event.target.value }))} onPressEnter={(event) => { if (!event.nativeEvent?.isComposing) { event.preventDefault(); saveEditor() } }} /> : null
  const editorSubmitLabel = editor?.item ? '保存名称' : onCreated ? '新增并选用' : '保存'
  const editorActions = <Space><Button aria-label="取消" disabled={busy} onClick={cancelEditor}>取消</Button><Button aria-label={editorSubmitLabel} type="primary" loading={busy} onClick={saveEditor}>{editorSubmitLabel}</Button></Space>
  const openManagement = () => {
    setCreationDraft(editor?.name ?? creationDraft ?? '')
    setEditor(null)
    setActionError('')
    setLoading(true)
    setQuickCreate(false)
  }
  const returnToCreate = () => {
    setEditor({ item: null, name: creationDraft || '' })
    setActionError('')
    setLoading(false)
    setQuickCreate(true)
  }
  const footer = quickCreate ? (originNode) => <div className="erp-payment-method-quick-create__footer"><Button type="link" disabled={busy} onClick={openManagement}>管理付款方式</Button><span>{originNode}</span></div> : editor ? (
    <div key="editor" className="erp-payment-method-manager__footer"><Typography.Text type="secondary">{editor.item ? '正在改名' : '正在新增'}</Typography.Text>{editorActions}</div>
  ) : deleteTarget ? (
    <div key="delete" className="erp-payment-method-manager__footer"><Typography.Text type="secondary">确认删除未使用项</Typography.Text><Space><Button aria-label="取消" disabled={busy} onClick={() => { setDeleteTarget(null); setActionError('') }}>取消</Button><Button aria-label="确认删除" danger loading={busy} onClick={() => remove(deleteTarget)}>确认删除</Button></Space></div>
  ) : (
    <div key="catalogue" className="erp-payment-method-manager__footer">
      <div className="erp-payment-method-manager__footer-meta">
        <Typography.Text type="secondary">{showPager ? '本页' : '共'} {current.items.length} 项</Typography.Text>
        {showPager ? (
          <Space className="erp-payment-method-manager__pager" aria-label="付款方式分页">
            <Tooltip title="上一页" trigger={['hover', 'focus']}><Button aria-label="上一页" icon={<LeftOutlined />} disabled={navigationLocked || loading || offset === 0} onClick={() => setOffsets((previous) => ({ ...previous, [view]: Math.max(0, offset - PAGE_SIZE) }))} /></Tooltip>
            <span className="erp-payment-method-manager__page">第 {Math.floor(offset / PAGE_SIZE) + 1} 页</span>
            <Tooltip title="下一页" trigger={['hover', 'focus']}><Button aria-label="下一页" icon={<RightOutlined />} disabled={navigationLocked || loading || Boolean(readError) || !current.hasMore} onClick={() => setOffsets((previous) => ({ ...previous, [view]: offset + PAGE_SIZE }))} /></Tooltip>
          </Space>
        ) : null}
      </div>
      <Space wrap className="erp-payment-method-manager__footer-actions">
        {creationDraft !== null ? <Button type="link" disabled={navigationLocked} onClick={returnToCreate}>返回新增</Button> : null}
        <Button aria-label={onCreated ? '返回填写' : '关闭'} disabled={busy} onClick={onClose}>{onCreated ? '返回填写' : '关闭'}</Button>
      </Space>
    </div>
  )

  return (
    <BusinessModal open title={quickCreate ? '新增付款方式' : '管理付款方式'} className={quickCreate ? 'erp-payment-method-quick-create' : 'erp-payment-method-modal'} size="localAction" width={quickCreate ? 480 : 680} afterOpenChange={(opened) => { if (opened) editorInput.current?.focus() }} confirmLoading={busy} onCancel={onClose} onOk={quickCreate ? saveEditor : undefined} okText="新增并选用" cancelText="取消" footer={footer}>
      {quickCreate ? <div className="erp-payment-method-quick-create__field"><div className="erp-payment-method-quick-create__label"><label htmlFor={editorId}>名称</label><Typography.Text type="secondary">公司共用选项</Typography.Text></div>{editorField}</div> : (
        <div className="erp-payment-method-manager">
          <Typography.Text type="secondary">公司共用；改名、停用不改写已保存单据。</Typography.Text>
          <div className="erp-payment-method-manager__toolbar">
            <FilterChipGroup aria-label="付款方式状态" value={view} options={PAYMENT_METHOD_STATUS_OPTIONS} disabled={navigationLocked} onChange={setView} />
            <div className="erp-payment-method-manager__search"><SearchInput allowClear aria-label="搜索付款方式" placeholder="搜索付款方式" maxLength={128} disabled={navigationLocked} value={queries[view]} resetKey={view} onSearch={(value) => { setQueries((previous) => ({ ...previous, [view]: value })); setOffsets((previous) => ({ ...previous, [view]: 0 })) }} /><Tooltip title="刷新" trigger={['hover', 'focus']}><Button aria-label="刷新" icon={<ReloadOutlined />} loading={loading} disabled={navigationLocked} onClick={refresh} /></Tooltip></div>
            <Button className="erp-payment-method-manager__create" type="primary" icon={<PlusOutlined />} aria-label="新增付款方式" disabled={navigationLocked || loading} onClick={() => { setEditor({ item: null, name: '' }); setActionError('') }}>新增付款方式</Button>
          </div>
          <MaintenanceSelectionBar selectionLabel="付款方式" selectedLabel={selectedItem?.method} disabled={navigationLocked || loading} onClear={() => selectItem(null)}>
            <BusinessActionTooltip disabled={recordLocked} disabledReason={selectedItem ? '请先完成当前操作或等待读取完成' : '请先选择一条付款方式'}><Button disabled={recordLocked} aria-label={selectedItem ? `改名 ${selectedItem.method}` : '改名付款方式'} onClick={() => { setEditor({ item: selectedItem, name: selectedItem.method }); setActionError('') }}>改名</Button></BusinessActionTooltip>
            <BusinessActionTooltip disabled={recordLocked} disabledReason={selectedItem ? '请先完成当前操作或等待读取完成' : '请先选择一条付款方式'}><Button disabled={recordLocked} aria-label={selectedItem ? `${selectedItem.is_active ? '停用' : '启用'} ${selectedItem.method}` : '停用付款方式'} onClick={() => update(selectedItem, { ...selectedItem, is_active: !selectedItem.is_active })}>{selectedItem?.is_active === false ? '启用' : '停用'}</Button></BusinessActionTooltip>
            {canDelete ? <BusinessActionTooltip disabled={recordLocked || selectedItem?.has_been_used} disabledReason={selectedItem?.has_been_used ? '已使用的付款方式不可删除，可停用以停止新单据选用' : selectedItem ? '请先完成当前操作或等待读取完成' : '请先选择一条付款方式'}><Button danger disabled={recordLocked || selectedItem?.has_been_used} aria-label={selectedItem ? `删除 ${selectedItem.method}` : '删除付款方式'} onClick={() => { setDeleteTarget(selectedItem); setActionError('') }}>删除</Button></BusinessActionTooltip> : null}
          </MaintenanceSelectionBar>
          {editor ? <div className="erp-payment-method-manager__editor-field"><label htmlFor={editorId}>{editor.item ? '修改名称' : '新增名称'}</label>{editorField}</div> : null}
          {deleteTarget ? <Alert type="warning" showIcon message={`删除尚未使用的「${deleteTarget.method}」？`} /> : null}
          {notice ? <div className="erp-payment-method-manager__notice" role="status"><span>{notice}</span>{lastChange ? <Button type="link" size="small" disabled={navigationLocked} onClick={() => update(lastChange.after, lastChange.before, true)}>撤销</Button> : null}</div> : null}
          {readError ? <Alert type="error" showIcon message={readError} action={<Button size="small" disabled={busy || loading} onClick={refresh}>重试</Button>} /> : null}
          {actionError ? <Alert type="error" showIcon message={actionError} /> : null}
          <div className="erp-payment-method-manager__list" aria-busy={loading}>
            <Table rowKey="id" size="small" columns={COLUMNS} dataSource={current.items} pagination={false} rowSelection={{ type: 'radio', columnTitle: null, selectedRowKeys: selectedItem ? [selectedItem.id] : [], getCheckboxProps: (item) => ({ disabled: navigationLocked || loading || Boolean(readError), 'aria-label': `选择 ${item.method}` }), onChange: (_keys, selectedRows) => selectItem(selectedRows[0] || null) }} rowClassName={(item) => `erp-payment-method-manager__row${selectedItem?.id === item.id ? ' ant-table-row-selected' : ''}`} onRow={(item) => ({ onClick: () => selectItem(item) })} locale={{ emptyText: initialLoading || readError ? null : <Empty description={keyword ? '没有匹配的付款方式' : view === 'inactive' ? '没有停用的付款方式' : '暂无付款方式，可点击新增'} /> }} />
            {initialLoading ? <Space className="erp-payment-method-manager__loading" role="status"><Spin size="small" />正在读取</Space> : null}
          </div>
        </div>
      )}
      {quickCreate && actionError ? <Alert type="error" showIcon message={actionError} /> : null}
    </BusinessModal>
  )
}
