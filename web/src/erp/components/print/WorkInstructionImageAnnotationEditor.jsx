import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Checkbox, Input, Modal } from 'antd'
import { DeleteOutlined, DragOutlined } from '@ant-design/icons'
import { PrintToolButton } from './PrintWorkspaceTools.jsx'
import {
  WORK_INSTRUCTION_IMAGE_ANNOTATION_LIMITS,
  WORK_INSTRUCTION_IMAGE_ANNOTATION_TYPES,
  addWorkInstructionCalloutTarget,
  appendWorkInstructionImageAnnotation,
  clampAnnotationPercent,
  getWorkInstructionMeasurementGeometry,
  getWorkInstructionMeasurementLabelPosition,
  normalizeWorkInstructionImageAnnotations,
  removeLastWorkInstructionCalloutTarget,
  deleteWorkInstructionImageAnnotations,
  restoreWorkInstructionImageAnnotations,
  resolveWorkInstructionAnnotationLayout,
  replaceWorkInstructionImageAnnotation,
} from '../../utils/workInstructionImageAnnotations.mjs'

function getCalloutConnectorStart(annotation, target) {
  const center = {
    x: annotation.x + annotation.width / 2,
    y: annotation.y + annotation.height / 2,
  }
  const dx = target.x - center.x
  const dy = target.y - center.y
  const xScale =
    dx === 0 ? Number.POSITIVE_INFINITY : annotation.width / 2 / Math.abs(dx)
  const yScale =
    dy === 0 ? Number.POSITIVE_INFINITY : annotation.height / 2 / Math.abs(dy)
  const scale = Math.min(xScale, yScale)
  if (!Number.isFinite(scale)) return center
  return {
    x: center.x + dx * scale,
    y: center.y + dy * scale,
  }
}

function getMeasurementTick(start, end, point) {
  const dx = end.x - start.x
  const dy = end.y - start.y
  const length = Math.hypot(dx, dy) || 1
  const offsetX = (-dy / length) * 2.2
  const offsetY = (dx / length) * 2.2
  return {
    x1: point.x - offsetX,
    y1: point.y - offsetY,
    x2: point.x + offsetX,
    y2: point.y + offsetY,
  }
}

function getAnnotationLabel(annotation, index) {
  const text = String(annotation.text || '').trim()
  if (text) return text
  return annotation.type === WORK_INSTRUCTION_IMAGE_ANNOTATION_TYPES.measurement
    ? `距离标注 ${index + 1}`
    : `说明框 ${index + 1}`
}

function getAnnotationTypeLabel(annotation) {
  return annotation.type === WORK_INSTRUCTION_IMAGE_ANNOTATION_TYPES.measurement
    ? '距离标注'
    : '说明框'
}

export function WorkInstructionImageAnnotationLayer({
  annotations = [],
  editable = false,
  selectedIndex = null,
  onSelect = null,
  onTextChange = null,
  onBoxPointerDown = null,
  onHandlePointerDown = null,
  onHandleKeyDown = null,
}) {
  const layerRef = useRef(null)
  const normalized = useMemo(
    () => normalizeWorkInstructionImageAnnotations(annotations),
    [annotations]
  )
  useLayoutEffect(() => {
    const layer = layerRef.current
    if (!layer) return undefined
    const labels = Array.from(
      layer.querySelectorAll('[data-work-instruction-measurement-label-id]')
    )
    if (!labels.length) return undefined
    const positionLabels = () => {
      const canvas = { width: layer.clientWidth, height: layer.clientHeight }
      if (!canvas.width || !canvas.height) return
      labels.forEach((label) => {
        const annotation = normalized.find(
          (item) => item.id === label.dataset.workInstructionMeasurementLabelId
        )
        const position = getWorkInstructionMeasurementLabelPosition(
          annotation,
          canvas,
          { width: label.offsetWidth, height: label.offsetHeight }
        )
        label.style.left = `${position.x}%`
        label.style.top = `${position.y}%`
      })
    }
    positionLabels()
    const observer = new ResizeObserver(positionLabels)
    observer.observe(layer)
    labels.forEach((label) => observer.observe(label))
    return () => observer.disconnect()
  }, [normalized, editable])
  const visible = editable
    ? normalized
    : normalized.filter(
        (annotation) =>
          annotation.type ===
            WORK_INSTRUCTION_IMAGE_ANNOTATION_TYPES.measurement ||
          annotation.text
      )
  if (!visible.length) return null

  return (
    <div
      ref={layerRef}
      className={`erp-work-instruction-image-annotations${
        editable ? ' erp-work-instruction-image-annotations--editable' : ''
      }`}
      data-work-instruction-annotation-output={editable ? undefined : 'true'}
    >
      <svg
        aria-hidden="true"
        className="erp-work-instruction-image-annotations__lines"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        {visible.flatMap((annotation) => {
          if (
            annotation.type === WORK_INSTRUCTION_IMAGE_ANNOTATION_TYPES.callout
          ) {
            return annotation.targets.map((target, targetIndex) => {
              const start = getCalloutConnectorStart(annotation, target)
              return [
                <line
                  key={`${annotation.id}-target-${targetIndex}`}
                  data-work-instruction-annotation-leader="true"
                  x1={start.x}
                  y1={start.y}
                  x2={target.x}
                  y2={target.y}
                  stroke={annotation.color}
                />,
                <circle
                  key={`${annotation.id}-target-dot-${targetIndex}`}
                  cx={target.x}
                  cy={target.y}
                  r="0.9"
                  fill={annotation.color}
                />,
              ]
            })
          }
          const startTick = getMeasurementTick(
            annotation.start,
            annotation.end,
            annotation.start
          )
          const endTick = getMeasurementTick(
            annotation.start,
            annotation.end,
            annotation.end
          )
          return [
            <line
              key={`${annotation.id}-measurement`}
              data-work-instruction-annotation-measurement="true"
              x1={annotation.start.x}
              y1={annotation.start.y}
              x2={annotation.end.x}
              y2={annotation.end.y}
              stroke={annotation.color}
            />,
            <line
              key={`${annotation.id}-start-tick`}
              {...startTick}
              stroke={annotation.color}
            />,
            <line
              key={`${annotation.id}-end-tick`}
              {...endTick}
              stroke={annotation.color}
            />,
          ]
        })}
      </svg>

      {visible.map((annotation, annotationIndex) => {
        const isSelected = selectedIndex === annotationIndex
        if (
          annotation.type ===
          WORK_INSTRUCTION_IMAGE_ANNOTATION_TYPES.measurement
        ) {
          const MeasurementLabel = editable ? 'button' : 'span'
          return (
            <React.Fragment key={annotation.id}>
              {annotation.text || editable ? (
                <MeasurementLabel
                  type={editable ? 'button' : undefined}
                  className={`erp-work-instruction-image-annotations__measurement-label${
                    isSelected ? ' is-selected' : ''
                  }`}
                  style={{
                    color: annotation.color,
                  }}
                  data-annotation-control={editable ? 'true' : undefined}
                  data-work-instruction-annotation-kind="measurement"
                  data-work-instruction-measurement-label-id={annotation.id}
                  aria-label={
                    editable ? `移动距离文字 ${annotationIndex + 1}` : undefined
                  }
                  title={
                    editable ? '拖动调整与线段的距离；方向键微调' : undefined
                  }
                  onClick={
                    editable ? () => onSelect?.(annotationIndex) : undefined
                  }
                  onPointerDown={
                    editable
                      ? (event) =>
                          onHandlePointerDown?.(
                            event,
                            annotationIndex,
                            'label',
                            null
                          )
                      : undefined
                  }
                  onKeyDown={
                    editable
                      ? (event) =>
                          onHandleKeyDown?.(
                            event,
                            annotationIndex,
                            'label',
                            null
                          )
                      : undefined
                  }
                >
                  {annotation.text || '填写距离'}
                </MeasurementLabel>
              ) : null}
              {editable
                ? ['start', 'end'].map((handle) => {
                    const point = annotation[handle]
                    return (
                      <button
                        type="button"
                        aria-label={`${getAnnotationLabel(annotation, annotationIndex)}${
                          handle === 'start' ? '起点' : '终点'
                        }`}
                        className="erp-work-instruction-image-annotations__handle"
                        data-annotation-control="true"
                        data-work-instruction-annotation-handle={handle}
                        key={`${annotation.id}-${handle}`}
                        style={{ left: `${point.x}%`, top: `${point.y}%` }}
                        onClick={() => onSelect?.(annotationIndex)}
                        onKeyDown={(event) =>
                          onHandleKeyDown?.(
                            event,
                            annotationIndex,
                            handle,
                            null
                          )
                        }
                        onPointerDown={(event) =>
                          onHandlePointerDown?.(
                            event,
                            annotationIndex,
                            handle,
                            null
                          )
                        }
                      />
                    )
                  })
                : null}
            </React.Fragment>
          )
        }

        const CalloutBox = editable ? 'textarea' : 'span'
        return (
          <React.Fragment key={annotation.id}>
            <CalloutBox
              aria-label={
                editable ? `说明框 ${annotationIndex + 1} 文字` : undefined
              }
              value={editable ? annotation.text : undefined}
              placeholder={editable ? '点击填写' : undefined}
              maxLength={
                editable
                  ? WORK_INSTRUCTION_IMAGE_ANNOTATION_LIMITS.textLength
                  : undefined
              }
              className={`erp-work-instruction-image-annotations__callout erp-work-instruction-image-annotations__callout--${annotation.tone}${
                isSelected ? ' is-selected' : ''
              }`}
              style={{
                left: `${annotation.x}%`,
                top: `${annotation.y}%`,
                width: `${annotation.width}%`,
                height: `${annotation.height}%`,
                '--annotation-color': annotation.color,
              }}
              data-annotation-control={editable ? 'true' : undefined}
              data-work-instruction-annotation-kind="callout"
              data-annotation-id={annotation.id}
              onFocus={editable ? () => onSelect?.(annotationIndex) : undefined}
              onChange={
                editable
                  ? (event) =>
                      onTextChange?.(annotationIndex, event.target.value)
                  : undefined
              }
            >
              {editable ? null : annotation.text}
            </CalloutBox>
            {editable && isSelected ? (
              <button
                type="button"
                aria-label={`移动说明框 ${annotationIndex + 1}`}
                title="拖动移动；方向键微调"
                className="erp-work-instruction-image-annotations__move-handle"
                data-annotation-control="true"
                data-work-instruction-annotation-handle="box"
                style={{
                  left: `${annotation.x >= 5 ? annotation.x : annotation.x + annotation.width}%`,
                  top: `${annotation.y}%`,
                  transform:
                    annotation.x >= 5
                      ? 'translateX(calc(-100% - 4px))'
                      : 'translateX(4px)',
                }}
                onPointerDown={(event) =>
                  onBoxPointerDown?.(event, annotationIndex)
                }
                onKeyDown={(event) =>
                  onHandleKeyDown?.(event, annotationIndex, 'box', null)
                }
              >
                <DragOutlined aria-hidden="true" />
              </button>
            ) : null}
            {editable &&
              annotation.targets.map((target, targetIndex) => (
                <button
                  type="button"
                  aria-label={`${getAnnotationLabel(annotation, annotationIndex)}指向点 ${targetIndex + 1}`}
                  className="erp-work-instruction-image-annotations__handle"
                  data-annotation-control="true"
                  data-work-instruction-annotation-handle="target"
                  key={`${annotation.id}-handle-${targetIndex}`}
                  style={{ left: `${target.x}%`, top: `${target.y}%` }}
                  onClick={() => onSelect?.(annotationIndex)}
                  onKeyDown={(event) =>
                    onHandleKeyDown?.(
                      event,
                      annotationIndex,
                      'target',
                      targetIndex
                    )
                  }
                  onPointerDown={(event) =>
                    onHandlePointerDown?.(
                      event,
                      annotationIndex,
                      'target',
                      targetIndex
                    )
                  }
                />
              ))}
          </React.Fragment>
        )
      })}
    </div>
  )
}

function getCanvasPoint(event, element) {
  const rect = element?.getBoundingClientRect?.()
  if (!rect || rect.width <= 0 || rect.height <= 0) return null
  return {
    x: clampAnnotationPercent(((event.clientX - rect.left) / rect.width) * 100),
    y: clampAnnotationPercent(((event.clientY - rect.top) / rect.height) * 100),
  }
}

export default function WorkInstructionImageAnnotationEditor({
  open,
  images = [],
  initialImageIndex = 0,
  onCancel,
  onSave,
}) {
  const [draftImages, setDraftImages] = useState([])
  const [activeImageIndex, setActiveImageIndex] = useState(0)
  const [selectedAnnotationIndex, setSelectedAnnotationIndex] = useState(null)
  const [addingTarget, setAddingTarget] = useState(false)
  const [status, setStatus] = useState('')
  const [checkedIDs, setCheckedIDs] = useState([])
  const [undoRecord, setUndoRecord] = useState(null)
  const [overflowIDs, setOverflowIDs] = useState([])
  const surfaceRef = useRef(null)
  const dragRef = useRef(null)
  const textInputRef = useRef(null)
  const focusTextIDRef = useRef(null)
  const overflowByImageRef = useRef(new Map())
  const focusAnnotationText = useCallback((annotation) => {
    const field =
      annotation?.type === WORK_INSTRUCTION_IMAGE_ANNOTATION_TYPES.callout
        ? surfaceRef.current?.querySelector(
            `[data-annotation-id="${annotation.id}"]`
          )
        : textInputRef.current
    field?.focus?.({ preventScroll: true })
  }, [])

  useEffect(() => {
    if (!open) return
    const nextImages = images.map((image) => ({
      ...image,
      annotations: normalizeWorkInstructionImageAnnotations(image?.annotations),
      annotationLayout: resolveWorkInstructionAnnotationLayout(image),
    }))
    const firstVisibleIndex = nextImages.findIndex((image) => image?.dataURL)
    const requestedImage = nextImages[initialImageIndex]?.dataURL
      ? initialImageIndex
      : firstVisibleIndex
    setDraftImages(nextImages)
    setActiveImageIndex(Math.max(0, requestedImage))
    setSelectedAnnotationIndex(null)
    setAddingTarget(false)
    setCheckedIDs([])
    setUndoRecord(null)
    focusTextIDRef.current = null
    overflowByImageRef.current.clear()
    setStatus('添加说明框后可直接输入文字；用移动手柄调整位置。')
  }, [images, initialImageIndex, open])

  const imageEntries = useMemo(
    () =>
      draftImages
        .map((image, imageIndex) => ({ image, imageIndex }))
        .filter(({ image }) => image?.dataURL),
    [draftImages]
  )
  const activeImage = draftImages[activeImageIndex] || null
  const annotations = normalizeWorkInstructionImageAnnotations(
    activeImage?.annotations
  )
  const selectedAnnotation =
    Number.isInteger(selectedAnnotationIndex) &&
    selectedAnnotationIndex >= 0 &&
    selectedAnnotationIndex < annotations.length
      ? annotations[selectedAnnotationIndex]
      : null
  const selectedAnnotationId = selectedAnnotation?.id
  const selectedAnnotationType = selectedAnnotation?.type

  useEffect(() => {
    if (
      !selectedAnnotationId ||
      focusTextIDRef.current !== selectedAnnotationId
    ) {
      return
    }
    focusAnnotationText({
      id: selectedAnnotationId,
      type: selectedAnnotationType,
    })
    focusTextIDRef.current = null
  }, [
    activeImageIndex,
    focusAnnotationText,
    selectedAnnotationId,
    selectedAnnotationType,
  ])

  useLayoutEffect(() => {
    const canvas = surfaceRef.current
    if (!canvas) return undefined
    const check = () => {
      const ids = Array.from(canvas.querySelectorAll('[data-annotation-id]'))
        .filter(
          (box) =>
            box.scrollHeight > box.clientHeight + 1 ||
            box.scrollWidth > box.clientWidth + 1
        )
        .map((box) => box.dataset.annotationId)
      overflowByImageRef.current.set(activeImageIndex, ids)
      setOverflowIDs((current) =>
        current.join() === ids.join() ? current : ids
      )
    }
    check()
    const observer = new ResizeObserver(check)
    observer.observe(canvas)
    return () => observer.disconnect()
  }, [activeImage, activeImageIndex])

  const updateAnnotations = (nextAnnotations) => {
    setDraftImages((current) =>
      current.map((image, imageIndex) =>
        imageIndex === activeImageIndex
          ? {
              ...image,
              annotations: normalizeWorkInstructionImageAnnotations(
                typeof nextAnnotations === 'function'
                  ? nextAnnotations(
                      normalizeWorkInstructionImageAnnotations(
                        image?.annotations
                      )
                    )
                  : nextAnnotations
              ),
            }
          : image
      )
    )
  }

  const updateSelectedAnnotation = (updater) => {
    if (!selectedAnnotation) return
    updateAnnotations((current) =>
      replaceWorkInstructionImageAnnotation(
        current,
        selectedAnnotationIndex,
        updater
      )
    )
  }

  const handleAddAnnotation = (type) => {
    const result = appendWorkInstructionImageAnnotation(annotations, type)
    setStatus(result.message)
    if (!result.ok) return
    updateAnnotations(result.annotations)
    focusTextIDRef.current = result.annotations[result.selectedIndex].id
    setSelectedAnnotationIndex(result.selectedIndex)
    setAddingTarget(false)
  }

  const handleSelectImage = (imageIndex) => {
    setActiveImageIndex(imageIndex)
    setSelectedAnnotationIndex(null)
    setAddingTarget(false)
    setCheckedIDs([])
    setStatus(
      `正在标注第 ${imageEntries.findIndex((entry) => entry.imageIndex === imageIndex) + 1} 张图片。`
    )
  }

  const handleDelete = (ids) => {
    const result = deleteWorkInstructionImageAnnotations(annotations, ids)
    if (!result.removed.length) return
    setUndoRecord({ imageIndex: activeImageIndex, removed: result.removed })
    updateAnnotations(result.annotations)
    const nextIndex = result.annotations.findIndex(
      (item) => item.id === selectedAnnotationId
    )
    setSelectedAnnotationIndex(
      nextIndex >= 0
        ? nextIndex
        : result.annotations.length
          ? Math.min(
              selectedAnnotationIndex ?? 0,
              result.annotations.length - 1
            )
          : null
    )
    setCheckedIDs((current) => current.filter((id) => !ids.includes(id)))
    setAddingTarget(false)
    setStatus(`已删除 ${result.removed.length} 个标注，可以撤销。`)
  }

  const handleUndo = () => {
    if (!undoRecord) return
    const result = restoreWorkInstructionImageAnnotations(
      draftImages[undoRecord.imageIndex]?.annotations,
      undoRecord.removed
    )
    if (!result.ok) {
      setStatus(
        `撤销后会超过每图 ${WORK_INSTRUCTION_IMAGE_ANNOTATION_LIMITS.perImage} 个标注，请先移除新增标注。`
      )
      return
    }
    setDraftImages((current) =>
      current.map((image, index) =>
        index === undoRecord.imageIndex
          ? { ...image, annotations: result.annotations }
          : image
      )
    )
    setActiveImageIndex(undoRecord.imageIndex)
    setSelectedAnnotationIndex(
      result.annotations.findIndex(
        (item) => item.id === undoRecord.removed[0].annotation.id
      )
    )
    setCheckedIDs([])
    setAddingTarget(false)
    setUndoRecord(null)
    setStatus('已恢复删除的标注。')
  }

  const startDrag = (event, annotationIndex, kind, targetIndex = null) => {
    if (event.button !== 0) return
    const point = getCanvasPoint(event, surfaceRef.current)
    if (!point) return
    const annotation = annotations[annotationIndex]
    if (!annotation) return
    event.preventDefault()
    event.currentTarget.focus({ preventScroll: true })
    event.stopPropagation()
    surfaceRef.current?.setPointerCapture?.(event.pointerId)
    dragRef.current = {
      annotationIndex,
      kind,
      targetIndex,
      pointerId: event.pointerId,
      offset:
        kind === 'box'
          ? { x: point.x - annotation.x, y: point.y - annotation.y }
          : null,
      startPoint: point,
      labelOffset: annotation.labelOffset,
    }
    setSelectedAnnotationIndex(annotationIndex)
    setAddingTarget(false)
  }

  const handlePointerMove = (event) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const point = getCanvasPoint(event, surfaceRef.current)
    if (!point) return
    updateAnnotations((current) =>
      replaceWorkInstructionImageAnnotation(
        current,
        drag.annotationIndex,
        (annotation) => {
          if (drag.kind === 'label') {
            const canvas = surfaceRef.current
            const { normal } = getWorkInstructionMeasurementGeometry(
              annotation,
              {
                width: canvas.clientWidth,
                height: canvas.clientHeight,
              }
            )
            const delta =
              ((point.x - drag.startPoint.x) * canvas.clientWidth * normal.x) /
                canvas.clientHeight +
              (point.y - drag.startPoint.y) * normal.y
            return { ...annotation, labelOffset: drag.labelOffset + delta }
          }
          if (drag.kind === 'box') {
            return {
              ...annotation,
              x: point.x - drag.offset.x,
              y: point.y - drag.offset.y,
            }
          }
          if (
            drag.kind === 'target' &&
            annotation.type === WORK_INSTRUCTION_IMAGE_ANNOTATION_TYPES.callout
          ) {
            return {
              ...annotation,
              targets: annotation.targets.map((target, targetIndex) =>
                targetIndex === drag.targetIndex ? point : target
              ),
            }
          }
          if (
            ['start', 'end'].includes(drag.kind) &&
            annotation.type ===
              WORK_INSTRUCTION_IMAGE_ANNOTATION_TYPES.measurement
          ) {
            return { ...annotation, [drag.kind]: point }
          }
          return annotation
        }
      )
    )
  }

  const handlePointerUp = (event) => {
    if (dragRef.current?.pointerId !== event.pointerId) return
    surfaceRef.current?.releasePointerCapture?.(event.pointerId)
    dragRef.current = null
    setStatus('位置已调整；保存后会进入当前打印草稿。')
  }

  const handleCanvasPointerDown = (event) => {
    if (!addingTarget || !selectedAnnotation) return
    if (
      selectedAnnotation.type !==
      WORK_INSTRUCTION_IMAGE_ANNOTATION_TYPES.callout
    ) {
      return
    }
    if (event.target.closest?.('[data-annotation-control]')) return
    const point = getCanvasPoint(event, surfaceRef.current)
    if (!point) return
    const beforeCount = selectedAnnotation.targets.length
    const next = addWorkInstructionCalloutTarget(
      annotations,
      selectedAnnotationIndex,
      point
    )
    updateAnnotations(next)
    if (next[selectedAnnotationIndex].targets.length === beforeCount) {
      setStatus(
        `每个说明框最多支持 ${WORK_INSTRUCTION_IMAGE_ANNOTATION_LIMITS.calloutTargets} 个指向点。`
      )
      return
    }
    setStatus('已添加指向点，可继续点击图片添加，或关闭“添加指向点”。')
  }

  const handleHandleKeyDown = (event, annotationIndex, kind, targetIndex) => {
    const offsets = {
      ArrowLeft: { x: -1, y: 0 },
      ArrowRight: { x: 1, y: 0 },
      ArrowUp: { x: 0, y: -1 },
      ArrowDown: { x: 0, y: 1 },
    }
    const offset = offsets[event.key]
    if (!offset) return
    event.preventDefault()
    const amount = event.shiftKey ? 5 : 1
    updateAnnotations((current) =>
      replaceWorkInstructionImageAnnotation(
        current,
        annotationIndex,
        (annotation) => {
          if (kind === 'label') {
            const canvas = surfaceRef.current
            const { normal } = getWorkInstructionMeasurementGeometry(
              annotation,
              {
                width: canvas.clientWidth,
                height: canvas.clientHeight,
              }
            )
            return {
              ...annotation,
              labelOffset:
                annotation.labelOffset +
                (offset.x * normal.x + offset.y * normal.y) * amount,
            }
          }
          if (kind === 'box') {
            return {
              ...annotation,
              x: annotation.x + offset.x * amount,
              y: annotation.y + offset.y * amount,
            }
          }
          if (
            kind === 'target' &&
            annotation.type === WORK_INSTRUCTION_IMAGE_ANNOTATION_TYPES.callout
          ) {
            return {
              ...annotation,
              targets: annotation.targets.map((target, index) =>
                index === targetIndex
                  ? {
                      x: target.x + offset.x * amount,
                      y: target.y + offset.y * amount,
                    }
                  : target
              ),
            }
          }
          if (
            ['start', 'end'].includes(kind) &&
            annotation.type ===
              WORK_INSTRUCTION_IMAGE_ANNOTATION_TYPES.measurement
          ) {
            return {
              ...annotation,
              [kind]: {
                x: annotation[kind].x + offset.x * amount,
                y: annotation[kind].y + offset.y * amount,
              },
            }
          }
          return annotation
        }
      )
    )
  }

  const handleSave = () => {
    for (const [imageIndex, image] of draftImages.entries()) {
      const items = normalizeWorkInstructionImageAnnotations(image?.annotations)
      const invalidIndex = items.findIndex(
        (annotation) =>
          !annotation.text.trim() ||
          (annotation.type ===
            WORK_INSTRUCTION_IMAGE_ANNOTATION_TYPES.callout &&
            annotation.targets.length === 0) ||
          overflowByImageRef.current.get(imageIndex)?.includes(annotation.id)
      )
      if (invalidIndex >= 0) {
        setActiveImageIndex(imageIndex)
        setSelectedAnnotationIndex(invalidIndex)
        focusTextIDRef.current = items[invalidIndex].id
        if (imageIndex === activeImageIndex) {
          focusAnnotationText(items[invalidIndex])
        }
        setStatus(
          `请检查图片 ${imageIndex + 1} 的标注 ${invalidIndex + 1}：填写文字、保留指向点；文字超框时请扩大说明框或拆分说明。`
        )
        return
      }
    }
    onSave?.(draftImages)
  }

  return (
    <Modal
      open={open}
      title="图片标注"
      width="min(1120px, calc(100vw - 32px))"
      className="erp-work-instruction-annotation-modal"
      rootClassName="erp-work-instruction-annotation-modal-root"
      data-work-instruction-annotation-editor="true"
      destroyOnHidden
      keyboard
      maskClosable={false}
      focusTriggerAfterClose
      onCancel={onCancel}
      footer={
        <div className="erp-work-instruction-annotation-modal__footer">
          <span aria-live="polite">{status}</span>
          <div>
            {undoRecord ? (
              <PrintToolButton icon="back" onClick={handleUndo}>
                撤销删除
              </PrintToolButton>
            ) : null}
            <button type="button" onClick={onCancel}>
              取消
            </button>
            <PrintToolButton
              icon="save"
              className="is-primary"
              onClick={handleSave}
            >
              保存标注
            </PrintToolButton>
          </div>
        </div>
      }
    >
      <p className="erp-work-instruction-annotation-modal__help">
        点击说明框直接填写；拖动移动手柄、指向点或距离文字调整位置，也可用方向键微调。距离数值请按实测结果填写。
      </p>
      <div className="erp-work-instruction-annotation-modal__layout">
        <section className="erp-work-instruction-annotation-modal__stage">
          {imageEntries.length > 1 ? (
            <div
              aria-label="选择要标注的图片"
              className="erp-work-instruction-annotation-modal__image-tabs"
              role="tablist"
            >
              {imageEntries.map(({ image, imageIndex }, visibleIndex) => (
                <button
                  type="button"
                  aria-selected={activeImageIndex === imageIndex}
                  className={activeImageIndex === imageIndex ? 'is-active' : ''}
                  key={`${image.name || 'image'}-${imageIndex}`}
                  role="tab"
                  onClick={() => handleSelectImage(imageIndex)}
                >
                  图片 {visibleIndex + 1}
                </button>
              ))}
            </div>
          ) : null}
          {activeImage ? (
            <div
              ref={surfaceRef}
              className={`erp-work-instruction-annotation-modal__canvas${
                activeImage.annotationLayout === 'sidebar' ? ' has-callout' : ''
              }${addingTarget ? ' is-adding-target' : ''}`}
              data-work-instruction-annotation-canvas="true"
              aria-label="图片标注画布"
              onPointerDown={handleCanvasPointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            >
              <div className="erp-work-instruction-annotation-modal__image-viewport">
                <img src={activeImage.dataURL} alt="待标注工序" />
              </div>
              <WorkInstructionImageAnnotationLayer
                annotations={annotations}
                editable
                selectedIndex={selectedAnnotationIndex}
                onSelect={setSelectedAnnotationIndex}
                onTextChange={(annotationIndex, text) =>
                  updateAnnotations((current) =>
                    replaceWorkInstructionImageAnnotation(
                      current,
                      annotationIndex,
                      (annotation) => ({ ...annotation, text })
                    )
                  )
                }
                onBoxPointerDown={(event, annotationIndex) =>
                  startDrag(event, annotationIndex, 'box')
                }
                onHandlePointerDown={(
                  event,
                  annotationIndex,
                  kind,
                  targetIndex
                ) => startDrag(event, annotationIndex, kind, targetIndex)}
                onHandleKeyDown={handleHandleKeyDown}
              />
            </div>
          ) : (
            <div className="erp-work-instruction-annotation-modal__empty">
              当前行还没有可标注的图片。
            </div>
          )}
        </section>

        <aside className="erp-work-instruction-annotation-modal__panel">
          <div className="erp-work-instruction-annotation-modal__add-actions">
            <PrintToolButton
              icon="note"
              type="button"
              data-add-callout
              disabled={
                !activeImage ||
                annotations.length >=
                  WORK_INSTRUCTION_IMAGE_ANNOTATION_LIMITS.perImage
              }
              onClick={() =>
                handleAddAnnotation(
                  WORK_INSTRUCTION_IMAGE_ANNOTATION_TYPES.callout
                )
              }
            >
              添加说明框
            </PrintToolButton>
            <PrintToolButton
              icon="measure"
              type="button"
              data-add-measurement
              disabled={
                !activeImage ||
                annotations.length >=
                  WORK_INSTRUCTION_IMAGE_ANNOTATION_LIMITS.perImage
              }
              onClick={() =>
                handleAddAnnotation(
                  WORK_INSTRUCTION_IMAGE_ANNOTATION_TYPES.measurement
                )
              }
            >
              添加距离标注
            </PrintToolButton>
          </div>

          {annotations.length ? (
            <section
              className="erp-work-instruction-annotation-modal__list-section"
              aria-label="当前图片的标注"
            >
              <div className="erp-work-instruction-annotation-modal__list-toolbar">
                <Checkbox
                  checked={checkedIDs.length === annotations.length}
                  indeterminate={
                    checkedIDs.length > 0 &&
                    checkedIDs.length < annotations.length
                  }
                  onChange={(event) =>
                    setCheckedIDs(
                      event.target.checked
                        ? annotations.map((item) => item.id)
                        : []
                    )
                  }
                >
                  全选
                </Checkbox>
                <span>
                  {annotations.length}/
                  {WORK_INSTRUCTION_IMAGE_ANNOTATION_LIMITS.perImage}
                </span>
                <PrintToolButton
                  icon="remove"
                  type="button"
                  className="erp-work-instruction-annotation-modal__delete"
                  disabled={!checkedIDs.length}
                  onClick={() => handleDelete(checkedIDs)}
                >
                  删除所选{checkedIDs.length ? ` (${checkedIDs.length})` : ''}
                </PrintToolButton>
              </div>
              <div className="erp-work-instruction-annotation-modal__annotation-list">
                {annotations.map((annotation, annotationIndex) => (
                  <div
                    className="erp-work-instruction-annotation-modal__list-row"
                    key={annotation.id}
                  >
                    <Checkbox
                      aria-label={`选择标注 ${annotationIndex + 1}`}
                      checked={checkedIDs.includes(annotation.id)}
                      onChange={(event) =>
                        setCheckedIDs((current) =>
                          event.target.checked
                            ? [...current, annotation.id]
                            : current.filter((id) => id !== annotation.id)
                        )
                      }
                    />
                    <button
                      type="button"
                      aria-pressed={selectedAnnotationIndex === annotationIndex}
                      className={
                        selectedAnnotationIndex === annotationIndex
                          ? 'is-active'
                          : ''
                      }
                      title={`${getAnnotationTypeLabel(annotation)} ${annotationIndex + 1}：${annotation.text || '未填写'}`}
                      onClick={() => {
                        setSelectedAnnotationIndex(annotationIndex)
                        setAddingTarget(false)
                      }}
                    >
                      <span className="erp-work-instruction-annotation-modal__list-type">
                        {getAnnotationTypeLabel(annotation)}{' '}
                        {annotationIndex + 1}
                      </span>
                      <span className="erp-work-instruction-annotation-modal__list-text">
                        {annotation.text.trim() || '点击填写'}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="erp-work-instruction-annotation-modal__delete"
                      aria-label={`删除标注 ${annotationIndex + 1}`}
                      title="删除此标注"
                      onClick={() => handleDelete([annotation.id])}
                    >
                      <DeleteOutlined />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ) : (
            <p className="erp-work-instruction-annotation-modal__empty-copy">
              还没有标注。
            </p>
          )}

          {selectedAnnotation ? (
            <div className="erp-work-instruction-annotation-modal__form">
              {selectedAnnotation.type ===
              WORK_INSTRUCTION_IMAGE_ANNOTATION_TYPES.measurement ? (
                <label>
                  距离文字
                  <Input.TextArea
                    ref={textInputRef}
                    aria-label="距离文字"
                    value={selectedAnnotation.text}
                    maxLength={
                      WORK_INSTRUCTION_IMAGE_ANNOTATION_LIMITS.textLength
                    }
                    autoSize={{ minRows: 3, maxRows: 8 }}
                    status={
                      overflowIDs.includes(selectedAnnotation.id)
                        ? 'error'
                        : undefined
                    }
                    placeholder="例如：30 mm、45±2 mm"
                    onChange={(event) =>
                      updateSelectedAnnotation((annotation) => ({
                        ...annotation,
                        text: event.target.value,
                      }))
                    }
                  />
                </label>
              ) : null}
              {overflowIDs.includes(selectedAnnotation.id) ? (
                <small
                  role="status"
                  className="erp-work-instruction-annotation-modal__overflow-warning"
                >
                  文字超出说明框，请扩大说明框或拆分说明。
                </small>
              ) : null}

              <label>
                线条颜色
                <select
                  value={selectedAnnotation.color}
                  onChange={(event) =>
                    updateSelectedAnnotation((annotation) => ({
                      ...annotation,
                      color: event.target.value,
                    }))
                  }
                >
                  <option value="#2563eb">蓝色</option>
                  <option value="#ef4444">红色</option>
                  <option value="#111827">黑色</option>
                </select>
              </label>

              {selectedAnnotation.type ===
              WORK_INSTRUCTION_IMAGE_ANNOTATION_TYPES.callout ? (
                <>
                  <label>
                    说明框样式
                    <select
                      value={selectedAnnotation.tone}
                      onChange={(event) =>
                        updateSelectedAnnotation((annotation) => ({
                          ...annotation,
                          tone: event.target.value,
                        }))
                      }
                    >
                      <option value="white">白底</option>
                      <option value="blue-fill">蓝底白字</option>
                    </select>
                  </label>
                  <label>
                    说明框宽度
                    <input
                      type="range"
                      min="14"
                      max="48"
                      value={selectedAnnotation.width}
                      onChange={(event) =>
                        updateSelectedAnnotation((annotation) => ({
                          ...annotation,
                          width: Number(event.target.value),
                        }))
                      }
                    />
                  </label>
                  <label>
                    说明框高度
                    <input
                      type="range"
                      min="10"
                      max="42"
                      value={selectedAnnotation.height}
                      onChange={(event) =>
                        updateSelectedAnnotation((annotation) => ({
                          ...annotation,
                          height: Number(event.target.value),
                        }))
                      }
                    />
                  </label>
                  <div className="erp-work-instruction-annotation-modal__point-actions">
                    <PrintToolButton
                      icon={addingTarget ? 'clear' : 'target'}
                      type="button"
                      className={addingTarget ? 'is-active' : ''}
                      aria-pressed={addingTarget}
                      data-add-target
                      disabled={
                        selectedAnnotation.targets.length >=
                        WORK_INSTRUCTION_IMAGE_ANNOTATION_LIMITS.calloutTargets
                      }
                      onClick={() => setAddingTarget((current) => !current)}
                    >
                      {addingTarget ? '停止添加指向点' : '添加指向点'}
                    </PrintToolButton>
                    <PrintToolButton
                      icon="minus"
                      type="button"
                      disabled={selectedAnnotation.targets.length <= 1}
                      onClick={() => {
                        updateAnnotations((current) =>
                          removeLastWorkInstructionCalloutTarget(
                            current,
                            selectedAnnotationIndex
                          )
                        )
                        setAddingTarget(false)
                      }}
                    >
                      移除末个指向点
                    </PrintToolButton>
                  </div>
                  <small>
                    当前 {selectedAnnotation.targets.length}/
                    {WORK_INSTRUCTION_IMAGE_ANNOTATION_LIMITS.calloutTargets}{' '}
                    个指向点
                  </small>
                </>
              ) : (
                <>
                  <label>
                    距离文字位置
                    <input
                      type="range"
                      min="-24"
                      max="24"
                      value={selectedAnnotation.labelOffset}
                      onChange={(event) =>
                        updateSelectedAnnotation((annotation) => ({
                          ...annotation,
                          labelOffset: Number(event.target.value),
                        }))
                      }
                    />
                  </label>
                  <small>沿线段两侧调整，文字与线条自动留出间距。</small>
                </>
              )}
            </div>
          ) : null}
        </aside>
      </div>
    </Modal>
  )
}
