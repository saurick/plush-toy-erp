import { Fragment, useEffect, useId, useMemo, useRef, useState } from 'react'
import { Button, Space, Switch, Typography } from 'antd'
import DevTaskNav from '../../components/DevTaskNav.jsx'
import { WorkbenchSection, WorkbenchToolbar } from '../../components/WorkbenchPattern.jsx'
import CustomerConfigDeclarationTable from './CustomerConfigDeclarationTable.jsx'
import { buildCustomerConfigDeclarationExport } from './customerConfigDeclarationExport.mjs'
import { buildCustomerConfigDeclarationPreview } from './customerConfigDeclarationPreview.mjs'

const { Text } = Typography
const VIEWS = [
  { value: 'table', label: '表格视图' },
  { value: 'jsonc', label: 'JSONC' },
]
const VIEW_ID = 'dev-customer-declaration'

function downloadFile(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  try {
    link.click()
  } finally {
    link.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

export default function CustomerConfigExportPanel({ overview, onBack, disabled }) {
  const title = useRef(null)
  const tablePanel = useRef(null)
  const locatedLine = useRef(null)
  const previewId = useId()
  const [status, setStatus] = useState('idle')
  const [view, setView] = useState('table')
  const [locatedRow, setLocatedRow] = useState(null)
  const [showFieldMeanings, setShowFieldMeanings] = useState(true)
  const { customerKey } = overview
  const { filename, json } = useMemo(() => buildCustomerConfigDeclarationExport(customerKey), [customerKey])
  const { sources, rows, lines } = useMemo(
    () => buildCustomerConfigDeclarationPreview(overview, json),
    [overview, json],
  )

  useEffect(() => {
    title.current?.focus({ preventScroll: true })
  }, [])

  useEffect(() => {
    if (!locatedRow) return undefined
    const frame = window.requestAnimationFrame(() => {
      const target = view === 'jsonc'
        ? locatedLine.current
        : tablePanel.current?.querySelector('tr[aria-current="location"] button')
      target?.scrollIntoView({ block: view === 'jsonc' ? 'center' : 'nearest' })
      target?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [locatedRow, view])

  const download = () => {
    try {
      downloadFile(new Blob([json], { type: 'application/octet-stream' }), filename)
      setStatus('ready')
    } catch {
      setStatus('error')
    }
  }

  return (
    <WorkbenchSection
      flat
      title={<span ref={title} tabIndex={-1}>配置声明</span>}
      description={<Text code>{filename}</Text>}
      tools={(
        <Space wrap>
          <Button onClick={onBack}>返回配置核对</Button>
          <Button type="primary" disabled={disabled} onClick={download}>下载 JSON</Button>
        </Space>
      )}
    >
      {status === 'ready' ? <Text type="secondary" role="status">已生成文件，可在浏览器下载中查看。</Text> : null}
      {status === 'error' ? <Text type="danger" role="alert">文件生成失败，请重试。</Text> : null}
      <WorkbenchToolbar className="erp-dev-customer-review-toolbar">
        <DevTaskNav
          compact
          idPrefix={VIEW_ID}
          ariaLabel="配置声明视图"
          items={VIEWS}
          value={view}
          onChange={setView}
        />
      </WorkbenchToolbar>
      <section
        ref={tablePanel}
        id={`${VIEW_ID}-panel-table`}
        role="tabpanel"
        aria-labelledby={`${VIEW_ID}-tab-table`}
        hidden={view !== 'table'}
      >
        <CustomerConfigDeclarationTable
          sources={sources}
          rows={rows}
          locatedRow={locatedRow}
          disabled={disabled}
          onLocate={(row) => {
            setLocatedRow(row)
            setView('jsonc')
          }}
        />
      </section>
      <section
        id={`${VIEW_ID}-panel-jsonc`}
        role="tabpanel"
        aria-labelledby={`${VIEW_ID}-tab-jsonc`}
        hidden={view !== 'jsonc'}
      >
        {view === 'jsonc' ? (
          <>
            <WorkbenchToolbar
              tools={(
                <label className="erp-dev-customer-json-meaning-toggle">
                  <Switch
                    aria-label="显示字段含义"
                    aria-controls={previewId}
                    checked={showFieldMeanings}
                    onChange={setShowFieldMeanings}
                  />
                  显示字段含义
                </label>
              )}
            >
              {locatedRow ? (
                <Text type="secondary" className="erp-dev-customer-field-value" role="status">
                  {locatedRow.sourcePath} · <code>{locatedRow.path}</code>
                </Text>
              ) : null}
            </WorkbenchToolbar>
            <pre id={previewId} className="erp-dev-customer-export-json" aria-label="JSON 内容预览">
              <code>
                {lines.map(({ line, comment }, index) => {
                  const newline = index === 0 ? '' : '\n'
                  const meaning = showFieldMeanings && comment
                    ? <span className="erp-dev-customer-json-comment">{`  // ${comment}`}</span>
                    : null
                  if (index === locatedRow?.lineIndex) {
                    return (
                      <Fragment key={index}>
                        {newline}<span ref={locatedLine} tabIndex={-1} className="erp-dev-customer-json-location">{line}{meaning}</span>
                      </Fragment>
                    )
                  }
                  return meaning ? <Fragment key={index}>{newline}{line}{meaning}</Fragment> : `${newline}${line}`
                })}
              </code>
            </pre>
          </>
        ) : null}
      </section>
    </WorkbenchSection>
  )
}
