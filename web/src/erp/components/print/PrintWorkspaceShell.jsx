import React, { useEffect, useRef, useState } from 'react'
import '@fontsource-variable/noto-sans-sc'
import '@fontsource-variable/noto-serif-sc'
import { inspectPrintImageBudget } from '../../utils/printOutputPreflight.mjs'

const PRINT_WORKSPACE_PREPARING_MIN_MS = 280
const DRAFT_PERSISTENCE_STATUS_TEXT = Object.freeze({
  saving: '正在保存本窗口内容...',
  saved: '本窗口内容已保存',
  error: '本窗口内容未保存，请检查浏览器存储权限或空间',
  unavailable: '本窗口内容不会自动保存',
})

export default function PrintWorkspaceShell({
  title,
  sourceTag = '使用默认模板',
  statusText = '',
  persistenceStatus = '',
  tools = [],
  onRetrySave,
  workspaceClassName = '',
  panelTip = '',
  panelActions = null,
  editorActions = null,
  draftActions = null,
  formatActions = null,
  selectionMode = '',
  selectionCount = 0,
  selectionBounds = null,
  selectionSummary = '',
  onReturnToEdit,
  toolbarActions = null,
  formulaPanel = null,
  prepareSignature = '',
  preparingText = '正在准备打印模板...',
  children,
}) {
  const stageRef = useRef(null)
  const [zoomMode, setZoomMode] = useState('fit')
  const [fitScale, setFitScale] = useState(1)
  const [editingText, setEditingText] = useState('直接点击纸面填写内容')
  const [preparing, setPreparing] = useState(true)
  const [imageBudget, setImageBudget] = useState({ count: 0, problem: '' })

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return undefined
    let frame
    const update = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => {
        const next = inspectPrintImageBudget(stage)
        setImageBudget((current) =>
          current.count === next.count && current.problem === next.problem
            ? current
            : next
        )
      })
    }
    const observer = new MutationObserver(update)
    observer.observe(stage, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['src'],
    })
    update()
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
    }
  }, [prepareSignature])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return undefined
    const measure = () => {
      const paper = stage.querySelector('.erp-print-shell__stage-wrap > *')
      if (!paper) return
      setFitScale(
        Math.min(
          1,
          Math.max(0.25, (stage.clientWidth - 48) / paper.offsetWidth)
        )
      )
    }
    const observer = new ResizeObserver(measure)
    observer.observe(stage)
    measure()
    return () => observer.disconnect()
  }, [prepareSignature])
  const scale = zoomMode === 'fit' ? fitScale : Number(zoomMode)
  const captureInput = (event) => {
    const editable = event.target.closest?.('[contenteditable="true"]')
    if (editable) {
      editable.dataset.printEmpty = String(!editable.textContent.trim())
    }
  }

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
      } ${workspaceClassName}`.trim()}
      data-preparing-text={preparingText}
      onKeyDownCapture={(event) => {
        if (event.key === 'Escape' && selectionMode && !event.isComposing) {
          event.preventDefault()
          onReturnToEdit?.()
        }
      }}
    >
      <header className="erp-print-shell__toolbar">
        <div className="erp-print-shell__toolbar-copy">
          <strong>{title}</strong>
          {sourceTag ? (
            <span className="erp-print-shell__source-tag">{sourceTag}</span>
          ) : null}
          {DRAFT_PERSISTENCE_STATUS_TEXT[persistenceStatus] ? (
            <span
              className="erp-print-shell__toolbar-status"
              data-print-draft-save-status={persistenceStatus}
              role="status"
              aria-live="polite"
            >
              {DRAFT_PERSISTENCE_STATUS_TEXT[persistenceStatus]}
            </span>
          ) : null}
          {persistenceStatus === 'error' && onRetrySave ? (
            <button
              type="button"
              className="erp-print-shell__button erp-print-shell__button--ghost"
              onClick={onRetrySave}
            >
              重试保存
            </button>
          ) : null}
        </div>
        <div className="erp-print-shell__toolbar-actions">{toolbarActions}</div>
      </header>

      <main className="erp-print-shell__content">
        <aside className="erp-print-shell__panel">
          <div className="erp-print-shell__record-panel">
            <h3>编辑工具</h3>
            {panelTip ? <p>{panelTip}</p> : null}
            {editorActions &&
            tools.some((tool) => ['rows', 'cells', 'blocks'].includes(tool)) ? (
              <section className="erp-print-shell__tool-section">
                <h4>行与单元格</h4>
                {editorActions}
              </section>
            ) : null}
            {formatActions && tools.includes('text') ? (
              <section className="erp-print-shell__tool-section">
                <h4>文字格式</h4>
                {formatActions}
              </section>
            ) : null}
            {panelActions && tools.includes('images') ? (
              <section className="erp-print-shell__tool-section">
                <h4>图片管理</h4>
                {panelActions}
                <p role="status" data-print-image-budget>
                  {imageBudget.problem ||
                    `输出图片 ${imageBudget.count}/32 张（含长图分段）`}
                </p>
              </section>
            ) : null}
            {formulaPanel && tools.includes('calculation') ? (
              <section className="erp-print-shell__tool-section erp-print-shell__formula-panel">
                <h4>计算规则</h4>
                {formulaPanel}
              </section>
            ) : null}
            {draftActions ? (
              <section className="erp-print-shell__tool-section">
                <h4>整份内容</h4>
                {draftActions}
              </section>
            ) : null}
          </div>
        </aside>

        <section className="erp-print-shell__workspace">
          <div className="erp-print-shell__view-bar" data-print-editor-only>
            <div
              role="status"
              aria-live="polite"
              data-print-edit-mode={selectionMode || 'edit'}
            >
              {selectionMode ? (
                <>
                  <strong>{selectionMode}</strong> · 已选择 {selectionCount} 个
                  {selectionMode === '选择单元格' ? '单元格' : '目标'}
                  {selectionBounds
                    ? `（第 ${selectionBounds.rowStart + 1}–${selectionBounds.rowEnd + 1} 行，第 ${selectionBounds.colStart + 1}–${selectionBounds.colEnd + 1} 列）`
                    : selectionSummary
                      ? `（${selectionSummary}）`
                      : ''}
                  <button
                    type="button"
                    className="erp-print-shell__button erp-print-shell__button--ghost"
                    onClick={onReturnToEdit}
                  >
                    返回编辑
                  </button>
                  <small className="erp-print-shell__selection-impact">
                    {selectionMode === '选择单元格'
                      ? '合并保留左上格内容，其余选区内容会清空。'
                      : '插入或删除作用于当前选中的位置。'}
                  </small>
                </>
              ) : (
                editingText
              )}
            </div>
            <label className="erp-print-shell__zoom-control">
              显示比例{' '}
              <select
                aria-label="显示比例"
                value={zoomMode}
                onChange={(event) => setZoomMode(event.target.value)}
              >
                <option value="fit">适应宽度</option>
                <option value="0.75">75%</option>
                <option value="1">100%</option>
                <option value="1.25">125%</option>
                <option value="1.5">150%</option>
              </select>
            </label>
          </div>
          {statusText ? (
            <p className="erp-print-shell__feedback" role="status">
              {statusText}
            </p>
          ) : null}
          <div
            className="erp-print-shell__stage"
            ref={stageRef}
            style={{ '--print-view-scale': scale }}
            onInputCapture={captureInput}
            onFocusCapture={(event) => {
              if (event.target.isContentEditable) {
                setEditingText('正在编辑纸面内容 · 完成后自动保存')
              }
            }}
            onBlurCapture={() => setEditingText('直接点击纸面填写内容')}
          >
            {children}
          </div>
        </section>
      </main>
    </div>
  )
}
