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
import { InfoCircleOutlined } from '@ant-design/icons'
import Select from '@/common/components/select/AppSelect'
import { inspectPrintImageBudget } from '../../utils/printOutputPreflight.mjs'
import {
  findBlankPrintFields,
  findBlankPrintField,
} from '../../utils/printBlankContentNotice.mjs'
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

function PrintWorkspaceFeedback({ feedback, local = false, returnFocusRef }) {
  const feedbackRef = useRef(null)
  const [dismissedFeedback, setDismissedFeedback] = useState(null)
  useEffect(() => {
    if (local || feedback?.tone !== 'success') return undefined
    const timer = window.setTimeout(() => setDismissedFeedback(feedback), 4000)
    return () => window.clearTimeout(timer)
  }, [feedback, local])
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
  if (!feedback?.text || feedback === dismissedFeedback) return null
  return (
    <div
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
      <span>{feedback.text}</span>
      {!local ? (
        <button
          type="button"
          className="erp-print-shell__feedback-close"
          aria-label="关闭提示"
          onClick={(event) => {
            if (document.activeElement === event.currentTarget) {
              const trigger = returnFocusRef?.current
              const target =
                trigger?.isConnected && !trigger.disabled
                  ? trigger
                  : feedbackRef.current
                      ?.closest('.erp-print-shell')
                      ?.querySelector('.erp-print-shell__zoom-control [role="combobox"]')
              target?.focus({ preventScroll: true })
            }
            setDismissedFeedback(feedback)
          }}
        >
          <span aria-hidden="true">×</span>
        </button>
      ) : null}
    </div>
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
  clauseActions = null,
  draftActions = null,
  draftTitle = '模板内容',
  draftDefaultOpen = false,
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
  const outputTriggerRef = useRef(null)
  const lastBlankFieldRef = useRef(null)
  const blankFocusFrameRef = useRef(0)
  const [zoomMode, setZoomMode] = useState('fit')
  const [fitScale, setFitScale] = useState(1)
  const [preparing, setPreparing] = useState(true)
  const [imageBudget, setImageBudget] = useState({ count: 0, problem: '' })
  const [blankCount, setBlankCount] = useState(0)
  const [hasLocatedBlank, setHasLocatedBlank] = useState(false)

  useEffect(() => {
    if (!selectionMode) return undefined
    const shell = stageRef.current?.closest('.erp-print-shell')
    const ownerDocument = shell?.ownerDocument
    if (!ownerDocument) return undefined
    const returnToEdit = (event) => {
      const active = ownerDocument.activeElement
      const ownsFocus = active === ownerDocument.body ||
        active === ownerDocument.documentElement || shell.contains(active)
      if (event.key !== 'Escape' || event.isComposing || event.keyCode === 229 || event.defaultPrevented || !ownsFocus) return
      event.preventDefault()
      onReturnToEdit?.()
    }
    // WebKit 鼠标点击按钮后可能仍由 body 接收键盘事件。
    ownerDocument.addEventListener('keydown', returnToEdit)
    return () => ownerDocument.removeEventListener('keydown', returnToEdit)
  }, [selectionMode, onReturnToEdit])

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return undefined
    lastBlankFieldRef.current = null
    setHasLocatedBlank(false)
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
        const count = findBlankPrintFields(stage).length
        setBlankCount(count)
        if (count === 0) {
          lastBlankFieldRef.current = null
          setHasLocatedBlank(false)
        }
      })
    }
    const observer = new MutationObserver(update)
    observer.observe(stage, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: [
        'src',
        'data-print-blank-region',
        'data-print-blank-row',
        'data-print-blank-field',
      ],
    })
    update()
    return () => {
      observer.disconnect()
      cancelAnimationFrame(frame)
      cancelAnimationFrame(blankFocusFrameRef.current)
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
  const outputFeedback = useMemo(
    () =>
      statusText
        ? { area: 'output', text: statusText, tone: 'info' }
        : feedback?.area === 'output'
          ? feedback
          : null,
    [statusText, feedback]
  )
  const captureInput = (event) => {
    const editable = event.target.closest?.('[contenteditable="true"]')
    if (editable) {
      editable.dataset.printEmpty = String(!editable.textContent.trim())
      onClearFeedback?.()
    }
  }
  const revealBlankContent = (action) => {
    const field = findBlankPrintField(
      stageRef.current,
      lastBlankFieldRef.current,
      action
    )
    if (!field) return
    lastBlankFieldRef.current = field
    setHasLocatedBlank(true)
    onReturnToEdit?.()
    cancelAnimationFrame(blankFocusFrameRef.current)
    blankFocusFrameRef.current = requestAnimationFrame(() => {
      if (!stageRef.current?.contains(field)) return
      const editable = field.matches('[contenteditable="true"]')
        ? field
        : field.querySelector('[contenteditable="true"]')
      field.scrollIntoView({ block: 'nearest', inline: 'nearest' })
      editable?.focus({ preventScroll: true })
    })
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
        onClickCapture={(event) => {
          if (event.target.closest('[data-print-structure-action]')) {
            lastBlankFieldRef.current = null
            setHasLocatedBlank(false)
          }
        }}
      >
        <div className="erp-print-shell__header" data-print-editor-only>
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
            <div
              className="erp-print-shell__toolbar-actions"
              onClickCapture={(event) => {
                const button = event.target.closest('button')
                if (button) outputTriggerRef.current = button
              }}
            >
              <label className="erp-print-shell__zoom-control print-zoom-control">
                显示比例
                <span className="print-zoom-select">
                  <Select
                    allowClear={false /* 不可清空：纸面缩放必须是有效比例，空值无法确定预览尺寸。 */}
                    label="显示比例"
                    placeholder="显示比例"
                    aria-label="显示比例"
                    virtual={false}
                    data-value={zoomMode}
                    value={zoomMode}
                    onChange={setZoomMode}
                    options={[
                      ['fit', '适应宽度'],
                      ['0.75', '75%'],
                      ['1', '100%'],
                      ['1.25', '125%'],
                      ['1.5', '150%'],
                    ].map(([value, label]) => ({
                      value,
                      label,
                      'data-select-value': value,
                    }))}
                  />
                </span>
              </label>
              {toolbarActions}
            </div>
          </header>

          {blankCount > 0 ? (
            <div
              className="erp-print-shell__blank-notice"
              data-print-blank-notice=""
              data-print-editor-only
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              <InfoCircleOutlined aria-hidden="true" />
              <span className="erp-print-shell__blank-notice-text">
                当前有 {blankCount}{' '}
                处留白，将按当前内容输出；空白处可打印后手写补充。
              </span>
              <div
                className="erp-print-shell__blank-actions"
                role="group"
                aria-label="留白定位"
              >
                {hasLocatedBlank && blankCount > 1 ? (
                  [
                    ['first', '第一处'],
                    ['previous', '上一处'],
                    ['next', '下一处'],
                    ['last', '最后一处'],
                  ].map(([action, label]) => (
                    <button
                      key={action}
                      type="button"
                      onClick={() => revealBlankContent(action)}
                    >
                      {label}
                    </button>
                  ))
                ) : (
                  <button
                    type="button"
                    onClick={() => revealBlankContent('first')}
                  >
                    查看留白
                  </button>
                )}
              </div>
            </div>
          ) : null}
        </div>

        <PrintWorkspaceFeedback
          feedback={outputFeedback}
          returnFocusRef={outputTriggerRef}
        />

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
              {clauseActions}
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
                  title={draftTitle}
                  collapsible
                  defaultOpen={draftDefaultOpen}
                  feedback={feedback?.area === 'draft' ? feedback : null}
                >
                  {draftActions}
                </PrintWorkspaceToolSection>
              ) : null}
            </div>
          </aside>

          <section className="erp-print-shell__workspace">
            <div
              className="erp-print-shell__stage"
              data-scroll-edges="off"
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
