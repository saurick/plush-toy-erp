import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import '@fontsource-variable/noto-sans-sc'
import '@fontsource-variable/noto-serif-sc'
import { inspectPrintImageBudget } from '../../utils/printOutputPreflight.mjs'
import { bindPrintEditableCaret } from '../../utils/printEditableCaret.mjs'
import { PrintToolButton } from './PrintWorkspaceTools.jsx'

const PRINT_WORKSPACE_PREPARING_MIN_MS = 280
const DRAFT_PERSISTENCE_STATUS_TEXT = Object.freeze({
  saving: '正在保存本窗口内容...',
  saved: '本窗口内容已保存',
  error: '本窗口内容未保存，请检查浏览器存储权限或空间',
  unavailable: '本窗口内容不会自动保存',
})

const SelectionContext = createContext({})

function revealTool(node) {
  for (
    let parent = node?.parentElement;
    parent;
    parent = parent.parentElement
  ) {
    if (parent.tagName === 'DETAILS') parent.open = true
  }
}

function PrintWorkspaceFeedback({ feedback, local = false }) {
  const feedbackRef = useRef(null)
  useEffect(() => {
    if (!local || !feedback) return
    const node = feedbackRef.current
    revealTool(node)
    const panel = node?.closest('.erp-print-shell__record-panel')
    if (!panel || panel.scrollHeight <= panel.clientHeight) return
    const bounds = panel.getBoundingClientRect()
    const message = node.getBoundingClientRect()
    // 只滚动工具区，让结果可见；纸面位置和输入焦点保持不变。
    if (message.bottom > bounds.bottom) {
      panel.scrollTop += message.bottom - bounds.bottom + 12
    } else if (message.top < bounds.top) {
      panel.scrollTop -= bounds.top - message.top + 12
    }
  }, [feedback, local])
  if (!feedback?.text) return null
  return (
    <p
      ref={feedbackRef}
      className={
        local ? 'erp-print-shell__tool-feedback' : 'erp-print-shell__feedback'
      }
      data-print-feedback={feedback.area}
      data-tone={feedback.tone}
      role={feedback.tone === 'error' ? 'alert' : 'status'}
      aria-atomic="true"
      data-print-editor-only
    >
      {feedback.text}
    </p>
  )
}

function PrintSelectionStatus({ selection }) {
  const { mode, count, bounds, summary } = selection
  return (
    <div className="erp-print-shell__selection" data-print-edit-mode={mode}>
      <p role="status" aria-live="polite">
        已选择 {count} 个{mode === '选择单元格' ? '单元格' : '目标'}
        {bounds
          ? `（第 ${bounds.rowStart + 1}–${bounds.rowEnd + 1} 行，第 ${bounds.colStart + 1}–${bounds.colEnd + 1} 列）`
          : summary
            ? `（${summary}）`
            : ''}
      </p>
      <small className="erp-print-shell__selection-impact">
        {mode === '选择单元格'
          ? '合并保留左上格内容，其余选区内容会清空。'
          : '插入或删除作用于当前选中的位置。'}
      </small>
    </div>
  )
}

export function PrintWorkspaceToolSection({
  title,
  children,
  feedback,
  tool,
  collapsible = false,
  defaultOpen = false,
  count,
}) {
  const sectionRef = useRef(null)
  const selection = useContext(SelectionContext)
  const selected = selection.area === tool && Boolean(selection.mode)
  useEffect(() => {
    if (selected) revealTool(sectionRef.current)
  }, [selected])
  if (!children) return null
  const content = (
    <div className="erp-print-shell__tool-content">
      {selected ? <PrintSelectionStatus selection={selection} /> : null}
      {children}
      <PrintWorkspaceFeedback feedback={feedback} local />
    </div>
  )
  return (
    <section
      ref={sectionRef}
      className="erp-print-shell__tool-section"
      aria-label={title}
      data-print-tool={tool}
    >
      {collapsible ? (
        <details
          open={defaultOpen}
          onToggle={(event) => {
            if (
              !event.currentTarget.open &&
              event.currentTarget.querySelector('[data-print-edit-mode]')
            ) {
              selection.onReturn?.()
            }
          }}
        >
          <summary>
            <span>{title}</span>
            {count !== undefined ? (
              <span className="erp-print-shell__tool-count">{count}</span>
            ) : null}
          </summary>
          {content}
        </details>
      ) : (
        <>
          <h3>{title}</h3>
          {content}
        </>
      )}
    </section>
  )
}

export default function PrintWorkspaceShell({
  title,
  sourceTag = '使用默认模板',
  statusText = '',
  feedback = null,
  onClearFeedback,
  persistenceStatus = '',
  tools = [],
  onRetrySave,
  workspaceClassName = '',
  panelActions = null,
  appendixActions = null,
  appendixCount = 0,
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
  useEffect(() => bindPrintEditableCaret(stageRef.current), [])

  const scale = zoomMode === 'fit' ? fitScale : Number(zoomMode)
  const captureInput = (event) => {
    const editable = event.target.closest?.('[contenteditable="true"]')
    if (editable) {
      editable.dataset.printEmpty = String(!editable.textContent.trim())
      onClearFeedback?.()
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

  const selection = useMemo(
    () => ({
      mode: selectionMode,
      area:
        selectionMode === '选择单元格'
          ? 'cells'
          : selectionMode === '选择色卡块'
            ? 'blocks'
            : 'rows',
      count: selectionCount,
      bounds: selectionBounds,
      summary: selectionSummary,
      onReturn: onReturnToEdit,
    }),
    [
      selectionMode,
      selectionCount,
      selectionBounds,
      selectionSummary,
      onReturnToEdit,
    ]
  )

  return (
    <SelectionContext.Provider value={selection}>
      <div
        className={`erp-print-shell ${
          preparing ? 'erp-print-shell--preparing' : 'erp-print-shell--ready'
        } ${workspaceClassName}`.trim()}
        data-preparing-text={preparingText}
        data-print-workspace-mode={selectionMode || 'edit'}
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
              <PrintToolButton
                icon="reset"
                type="button"
                className="erp-print-shell__button--ghost"
                onClick={onRetrySave}
              >
                重试保存
              </PrintToolButton>
            ) : null}
          </div>
          <div className="erp-print-shell__toolbar-actions">
            <label className="erp-print-shell__zoom-control print-zoom-control">
              显示比例
              <span className="print-zoom-select">
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
              </span>
            </label>
            {toolbarActions}
          </div>
        </header>

        <main className="erp-print-shell__content">
          <aside className="erp-print-shell__panel" aria-label="打印编辑工具">
            <div className="erp-print-shell__record-panel">
              {editorActions &&
              tools.some((tool) =>
                ['rows', 'cells', 'blocks'].includes(tool)
              ) ? (
                <PrintWorkspaceToolSection
                  title="表格操作"
                  collapsible
                  defaultOpen
                >
                  {editorActions}
                </PrintWorkspaceToolSection>
              ) : null}
              {formatActions && tools.includes('text') ? (
                <PrintWorkspaceToolSection
                  title="文字格式"
                  feedback={feedback?.area === 'text' ? feedback : null}
                >
                  {formatActions}
                </PrintWorkspaceToolSection>
              ) : null}
              {panelActions && tools.includes('images') ? (
                <PrintWorkspaceToolSection
                  title="产品图片"
                  feedback={feedback?.area === 'images' ? feedback : null}
                >
                  {panelActions}
                </PrintWorkspaceToolSection>
              ) : null}
              {appendixActions && tools.includes('images') ? (
                <PrintWorkspaceToolSection
                  title="末尾附图"
                  collapsible
                  count={appendixCount}
                  feedback={
                    feedback?.area === 'appendix'
                      ? feedback
                      : imageBudget.problem && !feedback
                        ? {
                            area: 'appendix',
                            text: imageBudget.problem,
                            tone: 'error',
                          }
                        : null
                  }
                >
                  {appendixActions}
                  <p role="status" data-print-image-budget>
                    输出图片 {imageBudget.count}/32 张（含长图分段）
                  </p>
                </PrintWorkspaceToolSection>
              ) : null}
              {formulaPanel && tools.includes('calculation') ? (
                <PrintWorkspaceToolSection title="计算规则" collapsible>
                  <div className="erp-print-shell__formula-panel">
                    {formulaPanel}
                  </div>
                </PrintWorkspaceToolSection>
              ) : null}
              {draftActions ? (
                <PrintWorkspaceToolSection
                  title="模板内容"
                  collapsible
                  feedback={feedback?.area === 'draft' ? feedback : null}
                >
                  {draftActions}
                </PrintWorkspaceToolSection>
              ) : null}
            </div>
          </aside>

          <section className="erp-print-shell__workspace">
            <PrintWorkspaceFeedback
              feedback={
                statusText
                  ? { area: 'output', text: statusText, tone: 'info' }
                  : feedback?.area === 'output'
                    ? feedback
                    : null
              }
            />
            <div
              className="erp-print-shell__stage"
              ref={stageRef}
              style={{ '--print-view-scale': scale }}
              onInputCapture={captureInput}
            >
              {children}
            </div>
          </section>
        </main>
      </div>
    </SelectionContext.Provider>
  )
}
