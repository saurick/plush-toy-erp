import React, { useRef, useState } from 'react'
import { Button, Checkbox, Space } from 'antd'
import Modal from '@/common/components/modal/AppModal.jsx'
import { businessChainExportBlob, businessChainPngSize, createBusinessChainExport } from '../../config/devBusinessChainExport.mjs'
import './businessChainExport.css'

export default function BusinessChainDesignExport({ getGraph, open, onClose, triggerRef, onNotice }) {
  const [includeLegend, setIncludeLegend] = useState(true)
  const [includeOperations, setIncludeOperations] = useState(true)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState('')
  const panel = useRef(null)
  const download = async (format) => {
    if (busy) return
    setBusy(format)
    setError('')
    try {
      await document.fonts.ready
      const { surface, scale, title, context } = getGraph()
      const date = new Date()
      const artifact = createBusinessChainExport(surface, scale, {
        title,
        context,
        includeLegend,
        includeOperations,
        exportedAt: date.toLocaleString('zh-CN', { hour12: false }),
      })
      // Check before allocating or decoding a bitmap; an oversized graph stays exportable as SVG.
      if (format === 'png') {
        try { businessChainPngSize(artifact) } catch (issue) { setError(issue.message); return }
      }
      const blob = await businessChainExportBlob(artifact, format)
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      const filename = (title || '流程探索').replace(/[\\/:*?"<>|\p{Cc}]/gu, '-').slice(0, 60)
      link.href = url
      link.download = `${filename}-${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}.${format}`
      link.click()
      // Keep the URL alive until the browser has accepted the download.
      window.setTimeout(() => URL.revokeObjectURL(url), 1000)
      onClose()
      const size = format === 'png' ? businessChainPngSize(artifact) : artifact
      onNotice(`已生成 ${format.toUpperCase()}（${size.width} × ${size.height}${format === 'png' ? ' 像素' : '，矢量图'}），请在浏览器下载中查看。`)
    } catch {
      setError('导出未完成，请重试或选择 SVG。当前视图已保留。')
    } finally {
      setBusy(null)
    }
  }
  return (
    <Modal
      title="导出当前范围"
      open={open}
      footer={null}
      keyboard={!busy}
      closable={!busy}
      maskClosable={!busy}
      onCancel={onClose}
      afterClose={() => { setError(''); triggerRef.current?.focus({ preventScroll: true }) }}
      afterOpenChange={(visible) => { if (visible) panel.current?.querySelector('input')?.focus({ preventScroll: true }) }}
    >
      <div className="erp-chain-export" ref={panel}>
        <span>按当前展示粒度和分支状态导出，保留排布及屏幕外的内容。</span>
        <Checkbox checked={includeLegend} disabled={Boolean(busy)} onChange={(event) => setIncludeLegend(event.target.checked)}>附带图例</Checkbox>
        <Checkbox checked={includeOperations} disabled={Boolean(busy)} onChange={(event) => setIncludeOperations(event.target.checked)}>附带操作说明</Checkbox>
        <Space wrap>
          <Button type="primary" loading={busy === 'png'} disabled={Boolean(busy)} onClick={() => download('png')}>导出 PNG</Button>
          <Button loading={busy === 'svg'} disabled={Boolean(busy)} onClick={() => download('svg')}>导出 SVG</Button>
        </Space>
        <small>PNG 为 2 倍清晰度；SVG 可无损放大。</small>
        {error ? <span className="erp-chain-export__error" role="alert">{error}</span> : null}
      </div>
    </Modal>
  )
}
