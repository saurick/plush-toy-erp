import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { CopyOutlined } from '@ant-design/icons'
import { Button, Empty, Tag, Tooltip } from 'antd'
import { Markdown } from '@/common/components/markdown'
import SlidingSegmented from '@/common/components/navigation/SlidingSegmented'
import { RpcTransport } from '@/common/consts/rpcMethods.generated.mjs'
import { copyTextToClipboard } from '@/common/utils/clipboard.mjs'
import { buildIntegrationCurl } from '../config/devIntegration.mjs'

function FieldDescription({ field }) {
  const source = field.description || ''
  const guard = /拒绝条件：“([\s\S]*?)”。/u.exec(source)
  const description = source
    .replace(/^解析器 `[^`]+`；调用 `[^`]+`。\s*/u, '')
    .replace(/\s*拒绝条件：“[\s\S]*?”。/u, '')
    .replace(/\s*依据：`[^`]+`。$/u, '')
    .replace(/^后端返回映射字段；/u, '')
    .trim()
  return <Markdown source={[description, guard ? `拒绝条件：${guard[1]}` : ''].filter(Boolean).join('\n\n')} />
}

export default function DevIntegrationCallDetails({ entry, view, format, onFormatChange, onContract }) {
  const [copyState, setCopyState] = useState('')
  const copyAttempt = useRef(0)
  const manualCopy = useRef(null)
  const part = entry.contract?.documentation?.[view]
  const { inspection } = entry
  const indexed = view === 'request' ? inspection?.parameters : inspection?.response
  const emptyShape = !part && (view === 'request' ? inspection?.emptyParameters : inspection?.emptyData)
  const fields = part ? part.fields : indexed?.map((field) => ({
    ...field, required: '', description: '',
  }))
  const label = view === 'request' ? '请求参数' : '返回结果'
  const exampleLabel = view === 'request' ? '请求示例' : '响应示例'
  const example = part?.example
    ? view === 'request' && format === 'curl'
      ? buildIntegrationCurl(entry, RpcTransport)
      : JSON.stringify(part.example, null, 2)
    : ''
  useEffect(() => {
    setCopyState('')
    copyAttempt.current += 1
    return () => { copyAttempt.current += 1 }
  }, [entry.key, view, example])
  useLayoutEffect(() => {
    if (copyState === 'manual') {
      const input = manualCopy.current
      input?.focus({ preventScroll: true })
      input?.select()
      const panel = input?.closest('[role="tabpanel"]')
      if (panel) {
        const bounds = input.getBoundingClientRect()
        const available = panel.getBoundingClientRect()
        if (bounds.top < available.top || bounds.bottom > available.bottom) {
          panel.scrollTop += bounds.top - available.top - 36
        }
      }
    }
  }, [copyState])
  const copyExample = async () => {
    const attempt = ++copyAttempt.current
    setCopyState('copying')
    try {
      await copyTextToClipboard(example)
      if (copyAttempt.current === attempt) setCopyState('copied')
    } catch {
      if (copyAttempt.current === attempt) setCopyState('manual')
    }
  }

  return (
    <section className="erp-dev-integration__call-contract" aria-label={label}>
      <div className="erp-dev-integration__section-heading">
        <h2>{view === 'request' ? '业务参数' : '响应字段'}</h2>
        <Tag color={part ? 'default' : 'warning'}>{part ? '正式合同' : inspection ? '源码索引 · 约束待核对' : '合同待补齐'}</Tag>
      </div>
      {!part && inspection ? (
        <p className="erp-dev-integration__note">
          从实际方法分支生成读取点，便于核对字段；必填、条件分支及嵌套结构仍以完整方法合同为准。
        </p>
      ) : null}
      {fields?.length ? (
        <table className="erp-dev-integration__fields" data-table-lines="appearance">
          <thead>
            <tr><th scope="col">{part?.fieldHeader || '字段'}</th><th scope="col">{part ? '类型 / 必填' : '读取类型'}</th><th scope="col">{part ? '说明' : '实际读取点'}</th></tr>
          </thead>
          <tbody>
            {fields.map((field) => (
              <tr key={field.name}>
                <td><code>{field.name}</code></td>
                <td>
                  <code>{field.type}</code>
                  {field.required ? <span className="erp-dev-integration__required">{field.required}</span> : null}
                </td>
                <td>{field.source ? (
                  <Tooltip title={`${field.source.path}:${field.source.line}`}>
                    <code>{field.expression}</code>
                  </Tooltip>
                ) : <FieldDescription field={field} />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : !part && inspection?.emptyParameters && view === 'request' ? (
        <p>方法显式校验空参数，仅接受空对象。</p>
      ) : !part && inspection?.emptyData && view === 'response' ? (
        <p>成功结果不携带业务 data；仍通过统一响应封装返回结果码与提示。</p>
      ) : null}
      {part?.notesSource ? (
        <div className="erp-dev-integration__note"><Markdown source={part.notesSource} /></div>
      ) : !fields?.length && !emptyShape ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={view === 'request' ? '字段合同待补齐' : '返回合同待补齐'}
        >
          <p className="erp-dev-integration__note">尚未逐项登记{label}，请核对已有正式文档。</p>
          <Button onClick={onContract}>查看正式文档关联</Button>
        </Empty>
      ) : null}
      {part?.invalidExample ? (
        <p role="status">示例报文未通过合同格式核对，暂不提供复制。</p>
      ) : null}
      {example ? (
        <section className="erp-dev-integration__example-section" aria-label={exampleLabel}>
          <h3>{exampleLabel}</h3>
          <div className="erp-dev-integration__codebox">
            <div className="erp-dev-integration__example-toolbar">
              {view === 'request' ? (
                <SlidingSegmented
                  aria-label="请求示例格式"
                  hierarchy="secondary"
                  value={format}
                  options={[
                    { label: 'JSON', value: 'json' },
                    { label: 'cURL', value: 'curl' },
                  ]}
                  onChange={onFormatChange}
                />
              ) : <span>JSON</span>}
              <Button size="small" icon={<CopyOutlined aria-hidden="true" />} loading={copyState === 'copying'} onClick={copyExample}>
                复制示例
              </Button>
            </div>
            <pre className="erp-dev-integration__example"><code>{example}</code></pre>
          </div>
          <p className="erp-dev-integration__copy-feedback" role="status" aria-live="polite">
            {copyState === 'copied' ? '示例已复制' : copyState === 'manual' ? '自动复制不可用，示例已选中，可按 ⌘C 或 Ctrl+C 复制。' : ''}
          </p>
          {copyState === 'manual' ? (
            <div className="erp-dev-integration__manual-copy">
              <label htmlFor="integration-example-manual-copy">待复制示例</label>
              <textarea id="integration-example-manual-copy" ref={manualCopy} readOnly value={example} />
            </div>
          ) : null}
          <p className="erp-dev-integration__note">
            示例使用模拟值；请按实际授权、有效引用和当前版本替换后使用。
          </p>
        </section>
      ) : (
        <div className="erp-dev-integration__missing-example">
          <p className="erp-dev-integration__note">尚未登记可复制的{exampleLabel}。</p>
          {fields?.length || emptyShape || part?.notesSource ? <Button type="link" onClick={onContract}>查看正式文档关联</Button> : null}
        </div>
      )}

    </section>
  )
}
