import React, { useEffect, useRef, useState } from 'react'
import { Alert, Button, Space, Spin, Typography } from 'antd'
import Empty from '@/common/components/empty/AppEmpty.jsx'
import SearchInput from '@/common/components/SearchInput.jsx'
import SlidingTabs from '../../common/components/navigation/SlidingTabs.jsx'
import { getActionErrorMessage } from '../../common/utils/errorMessage.js'
import { isRpcAbortError } from '../../common/utils/jsonRpc.js'
import { listPaymentMethodRecommendations, setPaymentMethodRecommendation } from '../api/masterDataOrderApi.mjs'
import BusinessModal from './business-list/BusinessModal.jsx'

export default function PaymentMethodManager({ onClose, onChanged }) {
  const [view, setView] = useState('recommended')
  const [queries, setQueries] = useState({ recommended: '', hidden: '' })
  const [offset, setOffset] = useState(0)
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState({ key: '', items: [], hasMore: false })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [readError, setReadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [lastChange, setLastChange] = useState(null)
  const active = useRef(true)
  const submitting = useRef(false)
  const sequence = useRef(0)
  const keyword = queries[view].trim()
  const requestKey = `${view}|${keyword}`
  const current = result.key === requestKey ? result : { items: [], hasMore: false }

  useEffect(() => {
    active.current = true
    return () => { active.current = false }
  }, [])

  useEffect(() => {
    const generation = ++sequence.current
    const controller = new AbortController()
    setLoading(true)
    setReadError('')
    const timer = setTimeout(async () => {
      try {
        const data = await listPaymentMethodRecommendations({ keyword, is_recommended: view === 'recommended', limit: 50, offset }, { signal: controller.signal })
        if (controller.signal.aborted || generation !== sequence.current) return
        setResult((previous) => ({
          key: requestKey,
          items: offset > 0 && previous.key === requestKey ? [...previous.items, ...data.items.filter((item) => !previous.items.some((old) => old.method === item.method))] : data.items,
          hasMore: data.has_more,
        }))
      } catch (error) {
        if (controller.signal.aborted || generation !== sequence.current || isRpcAbortError(error)) return
        setReadError('付款方式读取失败，已保留上次结果')
      } finally {
        if (!controller.signal.aborted && generation === sequence.current) setLoading(false)
      }
    }, keyword ? 180 : 0)
    return () => { clearTimeout(timer); controller.abort() }
  }, [keyword, offset, requestKey, revision, view])

  const refresh = () => { setOffset(0); setRevision((value) => value + 1) }
  const changeRecommendation = async (item, recommended, undo = false) => {
    if (submitting.current) return
    submitting.current = true
    setBusy(true)
    setActionError('')
    try {
      const changed = await setPaymentMethodRecommendation({ method: item.method, is_recommended: recommended, expected_version: item.version })
      if (!active.current) return
      setLastChange(undo ? null : { ...changed, previous: item.is_recommended })
      onChanged()
      refresh()
    } catch (error) {
      if (active.current) setActionError(getActionErrorMessage(error, undo ? '撤销推荐变更' : '修改付款方式推荐'))
    } finally {
      submitting.current = false
      if (active.current) setBusy(false)
    }
  }

  return (
    <BusinessModal
      open
      title="管理付款方式"
      className="erp-payment-method-manager"
      size="localAction"
      width={720}
      centered={false}
      confirmLoading={busy}
      onCancel={onClose}
      footer={<Button disabled={busy} onClick={onClose}>返回填写</Button>}
    >
      <Typography.Paragraph type="secondary">公司共用候选；不再推荐不会改动已保存的档案和订单。</Typography.Paragraph>
      <SlidingTabs
        activeKey={view}
        items={[{ key: 'recommended', label: '可选', disabled: busy }, { key: 'hidden', label: '不再推荐', disabled: busy }]}
        onChange={(key) => { setView(key); setOffset(0) }}
      />
      <div className="erp-payment-method-manager__search">
        <SearchInput allowClear aria-label="搜索付款方式" placeholder="搜索付款方式" maxLength={128} disabled={busy} value={queries[view]} resetKey={view} onSearch={(value) => { setQueries((previous) => ({ ...previous, [view]: value })); setOffset(0) }} />
        <Button disabled={busy || loading} onClick={refresh}>刷新</Button>
      </div>
      {lastChange ? (
        <div className="erp-payment-method-manager__notice" role="status">
          <span>已{lastChange.is_recommended ? '恢复推荐' : '停止推荐'}「{lastChange.method}」</span>
          <Button size="small" disabled={busy} onClick={() => changeRecommendation(lastChange, lastChange.previous, true)}>撤销</Button>
        </div>
      ) : null}
      {actionError ? <Alert type="error" showIcon message={actionError} /> : null}
      {readError ? <Alert type="error" showIcon message={readError} action={<Button size="small" disabled={busy || loading} onClick={() => setRevision((value) => value + 1)}>重试</Button>} /> : null}
      <div className="erp-payment-method-manager__list" aria-busy={loading}>
        {current.items.map((item) => (
          <div className="erp-payment-method-manager__row" key={item.method}>
            <span className="erp-payment-method-manager__name">{item.method}</span>
            <Button disabled={busy || loading} aria-label={`${item.is_recommended ? '不再推荐' : '恢复推荐'} ${item.method}`} onClick={() => changeRecommendation(item, !item.is_recommended)}>{item.is_recommended ? '不再推荐' : '恢复推荐'}</Button>
          </div>
        ))}
        {loading ? <Space className="erp-payment-method-manager__loading" role="status"><Spin size="small" />正在读取</Space> : !readError && current.items.length === 0 ? <Empty description={keyword ? '没有匹配的付款方式' : view === 'hidden' ? '没有不再推荐的付款方式' : '暂无可选方式，仍可返回直接输入'} /> : null}
        {current.hasMore ? <Button block disabled={busy || loading || Boolean(readError)} onClick={() => setOffset(current.items.length)}>显示更多</Button> : null}
      </div>
    </BusinessModal>
  )
}
