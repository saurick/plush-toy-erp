import React, { useEffect, useMemo, useState } from 'react'

const PRINT_WORKSPACE_PREPARING_MIN_MS = 280

function normalizeSearchText(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
}

export default function PrintWorkspaceShell({
  title,
  sourceTag = '使用默认模板',
  statusText = '',
  panelTip = '',
  detailEditor = null,
  fieldRows = [],
  toolbarActions = null,
  formulaPanel = null,
  prepareSignature = '',
  preparingText = '正在准备打印模板...',
  children,
}) {
  const [searchText, setSearchText] = useState('')
  const [preparing, setPreparing] = useState(true)

  const filteredFieldRows = useMemo(() => {
    const normalizedQuery = normalizeSearchText(searchText)
    if (!normalizedQuery) {
      return fieldRows
    }

    return fieldRows.filter((row) => {
      const haystack = normalizeSearchText(
        `${row.label || ''} ${row.value || ''} ${row.key || ''}`
      )
      return haystack.includes(normalizedQuery)
    })
  }, [fieldRows, searchText])

  useEffect(() => {
    if (typeof window === 'undefined') {
      setPreparing(false)
      return undefined
    }

    let cancelled = false
    let timeoutID = 0
    let firstFrame = 0
    let secondFrame = 0
    const startedAt = Date.now()

    setPreparing(true)

    const reveal = () => {
      if (cancelled) {
        return
      }
      const remainingMs =
        PRINT_WORKSPACE_PREPARING_MIN_MS - (Date.now() - startedAt)
      if (remainingMs > 0) {
        timeoutID = window.setTimeout(() => {
          if (!cancelled) {
            setPreparing(false)
          }
        }, remainingMs)
        return
      }
      setPreparing(false)
    }

    firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(reveal)
    })

    return () => {
      cancelled = true
      if (timeoutID) {
        window.clearTimeout(timeoutID)
      }
      if (firstFrame) {
        window.cancelAnimationFrame(firstFrame)
      }
      if (secondFrame) {
        window.cancelAnimationFrame(secondFrame)
      }
    }
  }, [prepareSignature])

  return (
    <div
      className={`erp-print-shell ${
        preparing ? 'erp-print-shell--preparing' : 'erp-print-shell--ready'
      }`}
      data-preparing-text={preparingText}
    >
      <header className="erp-print-shell__toolbar">
        <div className="erp-print-shell__toolbar-copy">
          <strong>{title}</strong>
          {sourceTag ? (
            <span className="erp-print-shell__source-tag">{sourceTag}</span>
          ) : null}
          {statusText ? (
            <span className="erp-print-shell__toolbar-status">
              {statusText}
            </span>
          ) : null}
        </div>
        <div className="erp-print-shell__toolbar-actions">{toolbarActions}</div>
      </header>

      {formulaPanel ? (
        <section className="erp-print-shell__formula-panel">
          {formulaPanel}
        </section>
      ) : null}

      <main className="erp-print-shell__content">
        <aside className="erp-print-shell__panel">
          <section className="erp-print-shell__record-panel">
            <h3>当前记录字段（可编辑）</h3>
            <p>{panelTip}</p>
            <div className="erp-print-shell__search">
              <input
                className="erp-print-shell__search-input"
                type="search"
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                placeholder="搜索字段名或字段值"
              />
            </div>

            {detailEditor}

            <table className="erp-print-shell__record-table">
              <thead>
                <tr>
                  <th>字段</th>
                  <th>值</th>
                </tr>
              </thead>
              <tbody>
                {filteredFieldRows.length > 0 ? (
                  filteredFieldRows.map((row) => (
                    <tr key={row.key}>
                      <td className="erp-print-shell__field-label">
                        {row.label}
                      </td>
                      <td className="erp-print-shell__field-value">
                        {row.readOnly ? (
                          <div className="erp-print-shell__field-static">
                            {row.value || '-'}
                          </div>
                        ) : row.multiline ? (
                          <textarea
                            className="erp-print-shell__field-editor erp-print-shell__field-editor--multiline"
                            value={row.value}
                            rows={Math.min(Math.max(row.rows || 2, 2), 6)}
                            onChange={(event) =>
                              row.onChange(event.target.value)
                            }
                          />
                        ) : (
                          <input
                            className="erp-print-shell__field-editor"
                            type="text"
                            value={row.value}
                            onChange={(event) =>
                              row.onChange(event.target.value)
                            }
                          />
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={2} className="erp-print-shell__empty-row">
                      未找到匹配字段
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        </aside>

        <section className="erp-print-shell__stage">{children}</section>
      </main>
    </div>
  )
}
