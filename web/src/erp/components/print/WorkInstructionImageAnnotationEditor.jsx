import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Input, Modal } from 'antd'
import {
  WORK_INSTRUCTION_IMAGE_ANNOTATION_LIMITS,
  WORK_INSTRUCTION_IMAGE_ANNOTATION_TYPES,
  addWorkInstructionCalloutTarget,
  appendWorkInstructionImageAnnotation,
  clampAnnotationPercent,
  normalizeWorkInstructionImageAnnotations,
  removeLastWorkInstructionCalloutTarget,
  removeWorkInstructionImageAnnotation,
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

export function WorkInstructionImageAnnotationLayer({
  annotations = [],
  editable = false,
  selectedIndex = null,
  onSelect = null,
  onBoxPointerDown = null,
  onHandlePointerDown = null,
  onHandleKeyDown = null,
}) {
  const normalized = normalizeWorkInstructionImageAnnotations(annotations)
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
          const midpoint = {
            x: (annotation.start.x + annotation.end.x) / 2,
            y:
              (annotation.start.y + annotation.end.y) / 2 +
              annotation.labelOffset,
          }
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
                    left: `${midpoint.x}%`,
                    top: `${midpoint.y}%`,
                    color: annotation.color,
                  }}
                  data-annotation-control={editable ? 'true' : undefined}
                  data-work-instruction-annotation-kind="measurement"
                  onClick={
                    editable ? () => onSelect?.(annotationIndex) : undefined
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

        const CalloutBox = editable ? 'button' : 'span'
        return (
          <React.Fragment key={annotation.id}>
            <CalloutBox
              type={editable ? 'button' : undefined}
              className={`erp-work-instruction-image-annotations__callout erp-work-instruction-image-annotations__callout--${annotation.tone}${
                isSelected ? ' is-selected' : ''
              }`}
              style={{
                left: `${annotation.x}%`,
                top: `${annotation.y}%`,
                width: `${annotation.width}%`,
                minHeight: `${annotation.height}%`,
                '--annotation-color': annotation.color,
              }}
              data-annotation-control={editable ? 'true' : undefined}
              data-work-instruction-annotation-kind="callout"
              onClick={editable ? () => onSelect?.(annotationIndex) : undefined}
              onKeyDown={
                editable
                  ? (event) =>
                      onHandleKeyDown?.(event, annotationIndex, 'box', null)
                  : undefined
              }
              onPointerDown={
                editable
                  ? (event) => onBoxPointerDown?.(event, annotationIndex)
                  : undefined
              }
            >
              {annotation.text || '填写说明'}
            </CalloutBox>
            {editable
              ? annotation.targets.map((target, targetIndex) => (
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
              ))
              : null}
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

function hasCallout(annotations) {
  return annotations.some(
    (annotation) =>
      annotation.type === WORK_INSTRUCTION_IMAGE_ANNOTATION_TYPES.callout
  )
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
  const surfaceRef = useRef(null)
  const dragRef = useRef(null)
  const textInputRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const nextImages = images.map((image) => ({
      ...image,
      annotations: normalizeWorkInstructionImageAnnotations(image?.annotations),
    }))
    const firstVisibleIndex = nextImages.findIndex((image) => image?.dataURL)
    const requestedImage = nextImages[initialImageIndex]?.dataURL
      ? initialImageIndex
      : firstVisibleIndex
    setDraftImages(nextImages)
    setActiveImageIndex(Math.max(0, requestedImage))
    setSelectedAnnotationIndex(null)
    setAddingTarget(false)
    setStatus('先添加说明框或距离标注，再在大图上拖动位置。')
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

  useEffect(() => {
    if (!selectedAnnotationId) return
    textInputRef.current?.focus?.({ preventScroll: true })
  }, [selectedAnnotationId])

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
    setSelectedAnnotationIndex(result.selectedIndex)
    setAddingTarget(false)
  }

  const handleSelectImage = (imageIndex) => {
    setActiveImageIndex(imageIndex)
    setSelectedAnnotationIndex(null)
    setAddingTarget(false)
    setStatus(
      `正在标注第 ${imageEntries.findIndex((entry) => entry.imageIndex === imageIndex) + 1} 张图片。`
    )
  }

  const startDrag = (event, annotationIndex, kind, targetIndex = null) => {
    if (event.button !== 0) return
    const point = getCanvasPoint(event, surfaceRef.current)
    if (!point) return
    const annotation = annotations[annotationIndex]
    if (!annotation) return
    event.preventDefault()
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
    const invalid = draftImages.some((image) =>
      normalizeWorkInstructionImageAnnotations(image?.annotations).some(
        (annotation) =>
          !annotation.text ||
          (annotation.type ===
            WORK_INSTRUCTION_IMAGE_ANNOTATION_TYPES.callout &&
            annotation.targets.length === 0)
      )
    )
    if (invalid) {
      setStatus('请填写每个标注的文字；说明框至少保留一个指向点。')
      return
    }
    onSave?.(draftImages)
  }

  return (
    <Modal
      open={open}
      title="大图标注"
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
            <button type="button" onClick={onCancel}>
              取消
            </button>
            <button type="button" className="is-primary" onClick={handleSave}>
              保存标注
            </button>
          </div>
        </div>
      }
    >
      <p className="erp-work-instruction-annotation-modal__help">
        说明框可指向同一图片的一个或多个部位；距离标注请拖动两个端点，并按尺子上的实际读数填写数值。
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
                hasCallout(annotations) ? ' has-callout' : ''
              }${addingTarget ? ' is-adding-target' : ''}`}
              data-work-instruction-annotation-canvas="true"
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
            <button
              type="button"
              data-add-callout
              disabled={!activeImage}
              onClick={() =>
                handleAddAnnotation(
                  WORK_INSTRUCTION_IMAGE_ANNOTATION_TYPES.callout
                )
              }
            >
              添加说明框
            </button>
            <button
              type="button"
              data-add-measurement
              disabled={!activeImage}
              onClick={() =>
                handleAddAnnotation(
                  WORK_INSTRUCTION_IMAGE_ANNOTATION_TYPES.measurement
                )
              }
            >
              添加距离标注
            </button>
          </div>

          {annotations.length ? (
            <div className="erp-work-instruction-annotation-modal__annotation-list">
              {annotations.map((annotation, annotationIndex) => (
                <button
                  type="button"
                  className={
                    selectedAnnotationIndex === annotationIndex
                      ? 'is-active'
                      : ''
                  }
                  key={annotation.id}
                  onClick={() => {
                    setSelectedAnnotationIndex(annotationIndex)
                    setAddingTarget(false)
                  }}
                >
                  {getAnnotationLabel(annotation, annotationIndex)}
                </button>
              ))}
            </div>
          ) : (
            <p className="erp-work-instruction-annotation-modal__empty-copy">
              还没有标注。
            </p>
          )}

          {selectedAnnotation ? (
            <div className="erp-work-instruction-annotation-modal__form">
              <label>
                {selectedAnnotation.type ===
                WORK_INSTRUCTION_IMAGE_ANNOTATION_TYPES.measurement
                  ? '距离文字'
                  : '说明文字'}
                <Input.TextArea
                  ref={textInputRef}
                  value={selectedAnnotation.text}
                  maxLength={
                    WORK_INSTRUCTION_IMAGE_ANNOTATION_LIMITS.textLength
                  }
                  autoSize={{ minRows: 3, maxRows: 8 }}
                  placeholder={
                    selectedAnnotation.type ===
                    WORK_INSTRUCTION_IMAGE_ANNOTATION_TYPES.measurement
                      ? '例如：30 mm、45±2 mm'
                      : '填写工艺说明或质量要求'
                  }
                  onChange={(event) =>
                    updateSelectedAnnotation((annotation) => ({
                      ...annotation,
                      text: event.target.value,
                    }))
                  }
                />
              </label>

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
                    <button
                      type="button"
                      className={addingTarget ? 'is-active' : ''}
                      data-add-target
                      disabled={
                        selectedAnnotation.targets.length >=
                        WORK_INSTRUCTION_IMAGE_ANNOTATION_LIMITS.calloutTargets
                      }
                      onClick={() => setAddingTarget((current) => !current)}
                    >
                      {addingTarget ? '停止添加指向点' : '添加指向点'}
                    </button>
                    <button
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
                    </button>
                  </div>
                  <small>
                    当前 {selectedAnnotation.targets.length}/
                    {WORK_INSTRUCTION_IMAGE_ANNOTATION_LIMITS.calloutTargets}{' '}
                    个指向点
                  </small>
                </>
              ) : (
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
              )}

              <button
                type="button"
                className="erp-work-instruction-annotation-modal__delete"
                onClick={() => {
                  updateAnnotations((current) =>
                    removeWorkInstructionImageAnnotation(
                      current,
                      selectedAnnotationIndex
                    )
                  )
                  setSelectedAnnotationIndex(null)
                  setAddingTarget(false)
                }}
              >
                删除当前标注
              </button>
            </div>
          ) : null}
        </aside>
      </div>
    </Modal>
  )
}
