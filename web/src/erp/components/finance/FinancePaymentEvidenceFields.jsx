import React, { useEffect, useRef, useState } from 'react'
import { Alert, AutoComplete, Form, Input } from 'antd'
import { listFinancePayments } from '../../api/operationalFactApi.mjs'
import { createLatestRequestCoordinator } from '../../hooks/useLatestRequestCoordinator.js'

export default function FinancePaymentEvidenceFields({ form, open, accountSuggestions = [], canRead = true }) {
  const evidence = Form.useWatch('evidence_ref', form)
  const account = Form.useWatch('account_ref', form)
  const [duplicates, setDuplicates] = useState([])
  const [checkFailed, setCheckFailed] = useState(false)
  const coordinator = useRef(createLatestRequestCoordinator())
  useEffect(() => {
    setDuplicates([]); setCheckFailed(false)
    if (!open || !canRead || !String(evidence || '').trim()) return undefined
    const request = coordinator.current.begin('evidence')
    const timeout = setTimeout(async () => {
      try {
        const result = await listFinancePayments({ evidence_ref: evidence.trim(), ...(account?.trim() ? { account_ref: account.trim() } : {}), limit: 10 }, { signal: request.signal })
        if (request.isCurrent()) setDuplicates((result?.payments || []).filter((row) => !['CANCELLED', 'REVERSED'].includes(row.status)))
      } catch { if (request.isCurrent()) setCheckFailed(true) }
      finally { request.finish() }
    }, 350)
    const scope = coordinator.current
    return () => { clearTimeout(timeout); scope.abortAll() }
  }, [account, canRead, evidence, open])
  return (
    <>
      <Form.Item name="account_ref" label="收付款账户摘要" rules={[{ required: true, whitespace: true, message: '请填写账户摘要' }, { max: 128, message: '账户摘要不能超过128个字符' }]}>
        <AutoComplete options={[...new Set(accountSuggestions.filter(Boolean))].slice(0, 20).map((value) => ({ value }))} filterOption={(input, option) => option.value.toLowerCase().includes(input.toLowerCase())}>
          <Input placeholder="填写账户，或选择最近用过的账户" />
        </AutoComplete>
      </Form.Item>
      <Form.Item name="evidence_ref" label="业务凭据" rules={[{ required: true, whitespace: true, message: '请填写回单或凭据摘要' }]}>
        <Input maxLength={255} placeholder="银行流水号、回单号或业务凭据摘要" />
      </Form.Item>
      {duplicates.length ? <Alert showIcon type="warning" message={`相同凭据已用于 ${duplicates.map((row) => row.payment_no).join('、')}，请核对是否重复登记。`} /> : null}
      {checkFailed ? <Alert showIcon type="warning" message="重复凭据暂时无法核对，可在收付款记录中搜索凭据后继续。" /> : null}
      <p className="erp-business-inline-note">记录创建后，可在详情中上传回单图片或 PDF；凭据撤回会保留原因与记录。</p>
    </>
  )
}
