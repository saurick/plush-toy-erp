import React, { useRef, useState } from 'react'
import { message } from '@/common/utils/antdApp'
import { getActionErrorMessage } from '@/common/utils/errorMessage'
import {
  PRINT_APPENDIX_IMAGE_ACCEPT,
  PRINT_APPENDIX_IMAGE_LAYOUT_AUTO,
  PRINT_APPENDIX_IMAGE_LAYOUT_FULL,
  PRINT_APPENDIX_IMAGE_LAYOUT_HALF,
  appendPrintAppendixImages,
  createPrintAppendixImageSnapshot,
  getPrintAppendixImagePreviewDataURL,
  getPrintAppendixImageSegments,
  groupPrintAppendixImageRows,
  movePrintAppendixImage,
  normalizePrintAppendixImages,
  removePrintAppendixImage,
  resolvePrintAppendixImageLayout,
  setPrintAppendixImageLayoutMode,
} from '../../utils/printAppendixImages.mjs'

const PRINT_APPENDIX_LAYOUT_OPTIONS = [
  { value: PRINT_APPENDIX_IMAGE_LAYOUT_AUTO, label: '自动' },
  { value: PRINT_APPENDIX_IMAGE_LAYOUT_HALF, label: '半宽' },
  { value: PRINT_APPENDIX_IMAGE_LAYOUT_FULL, label: '整行' },
]

const resolveLayoutLabel = (layout) =>
  layout === PRINT_APPENDIX_IMAGE_LAYOUT_FULL ? '整行' : '半宽'

export function PrintAppendixImages({ images = [] }) {
  const normalizedImages = normalizePrintAppendixImages(images)
  if (!normalizedImages.length) {
    return null
  }
  const rows = groupPrintAppendixImageRows(normalizedImages)

  return (
    <section
      className="erp-print-appendix-images"
      data-print-appendix-images
      data-print-appendix-image-count={normalizedImages.length}
      aria-label="模板末尾附图"
    >
      {rows.map((row, rowIndex) => {
        const hasSegments = row.images.some(
          (image) => getPrintAppendixImageSegments(image).length > 1
        )
        return (
          <div
            className={`erp-print-appendix-images__row erp-print-appendix-images__row--${row.layout}${
              hasSegments ? ' erp-print-appendix-images__row--segmented' : ''
            }`}
            data-print-appendix-row={rowIndex + 1}
            data-print-appendix-row-layout={row.layout}
            key={`appendix-row-${row.images
              .map((image) => image.id)
              .join('-')}`}
          >
            {row.images.map((image, columnIndex) => {
              const resolvedLayout = resolvePrintAppendixImageLayout(image)
              const segments = getPrintAppendixImageSegments(image)
              const column =
                resolvedLayout === PRINT_APPENDIX_IMAGE_LAYOUT_FULL
                  ? 'full'
                  : columnIndex === 0
                    ? 'left'
                    : 'right'
              return (
                <figure
                  className={`erp-print-appendix-images__item erp-print-appendix-images__item--${resolvedLayout}${
                    segments.length > 1
                      ? ' erp-print-appendix-images__item--segmented'
                      : ''
                  }`}
                  data-print-appendix-image-id={image.id}
                  data-print-appendix-image-name={image.name}
                  data-print-appendix-requested-layout={image.layoutMode}
                  data-print-appendix-resolved-layout={resolvedLayout}
                  data-print-appendix-column={column}
                  data-print-appendix-segment-count={segments.length}
                  key={image.id}
                >
                  {segments.map((segment, segmentIndex) => (
                    <div
                      className="erp-print-appendix-images__segment"
                      data-print-appendix-segment={segmentIndex + 1}
                      data-print-appendix-segment-count={segments.length}
                      key={`${image.id}-segment-${segmentIndex + 1}`}
                    >
                      <img
                        className="erp-print-appendix-images__image"
                        data-server-pdf-preserve-resolution="true"
                        src={segment.dataURL}
                        alt={
                          segments.length === 1
                            ? image.name
                            : `${image.name}（第 ${segmentIndex + 1} 段）`
                        }
                      />
                    </div>
                  ))}
                </figure>
              )
            })}
          </div>
        )
      })}
    </section>
  )
}

export default function PrintAppendixImageManager({
  images = [],
  onImagesChange,
  onStatusChange,
}) {
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(false)
  const normalizedImages = normalizePrintAppendixImages(images)

  const commitImages = async (nextImages, statusText) => {
    const result = await onImagesChange?.(
      normalizePrintAppendixImages(nextImages)
    )
    if (result === false) {
      const warning =
        '图片已保留在当前窗口，但浏览器存储空间不足；请先完成打印，刷新前不要关闭窗口。'
      onStatusChange?.(warning)
      message.warning(warning)
      return false
    }
    onStatusChange?.(statusText)
    return true
  }

  const handleFileChange = async (event) => {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (!files.length) return

    setBusy(true)
    onStatusChange?.(`正在处理 ${files.length} 张末尾图片...`)
    try {
      const snapshots = []
      for (const file of files) {
        snapshots.push(await createPrintAppendixImageSnapshot(file))
      }
      await commitImages(
        appendPrintAppendixImages(normalizedImages, snapshots),
        `已添加 ${snapshots.length} 张末尾图片，共 ${normalizedImages.length + snapshots.length} 张。`
      )
    } catch (error) {
      const errorMessage = getActionErrorMessage(error, '添加末尾图片失败')
      onStatusChange?.(errorMessage)
      message.error(errorMessage)
    } finally {
      setBusy(false)
    }
  }

  return (
    <section
      className="erp-print-appendix-manager"
      data-print-appendix-manager
      aria-label="管理模板末尾图片"
    >
      <div className="erp-print-appendix-manager__heading">
        <strong>模板末尾图片</strong>
        <span>{normalizedImages.length} 张</span>
      </div>
      <p>
        普通图片自动两张一行，长图自动整行并按打印页分段；每张都可手动改为半宽或整行。
      </p>
      <input
        ref={inputRef}
        className="erp-print-appendix-manager__input"
        data-print-appendix-input
        type="file"
        accept={PRINT_APPENDIX_IMAGE_ACCEPT}
        multiple
        onChange={handleFileChange}
      />
      <button
        type="button"
        className="erp-print-shell__button erp-print-shell__button--ghost"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? '正在添加…' : '添加末尾图片'}
      </button>
      {normalizedImages.length ? (
        <ol className="erp-print-appendix-manager__list">
          {normalizedImages.map((image, index) => {
            const resolvedLayout = resolvePrintAppendixImageLayout(image)
            const segmentCount = getPrintAppendixImageSegments(image).length
            return (
              <li
                className="erp-print-appendix-manager__item"
                data-print-appendix-manager-item={image.id}
                data-print-appendix-manager-layout={image.layoutMode}
                key={image.id}
              >
                <img src={getPrintAppendixImagePreviewDataURL(image)} alt="" />
                <div className="erp-print-appendix-manager__item-copy">
                  <strong>图片 {index + 1}</strong>
                  <span title={image.name}>{image.name}</span>
                  <span>
                    {image.layoutMode === PRINT_APPENDIX_IMAGE_LAYOUT_AUTO
                      ? `自动 · ${resolveLayoutLabel(resolvedLayout)}`
                      : resolveLayoutLabel(resolvedLayout)}
                    {segmentCount > 1 ? ` · ${segmentCount} 段` : ''}
                  </span>
                </div>
                <div
                  className="erp-print-appendix-manager__layout-actions"
                  role="group"
                  aria-label={`图片 ${index + 1} 排版`}
                >
                  {PRINT_APPENDIX_LAYOUT_OPTIONS.map((option) => (
                    <button
                      type="button"
                      aria-label={`将末尾图片 ${index + 1} 设为${option.label}`}
                      aria-pressed={image.layoutMode === option.value}
                      disabled={busy}
                      key={option.value}
                      onClick={() =>
                        commitImages(
                          setPrintAppendixImageLayoutMode(
                            normalizedImages,
                            index,
                            option.value
                          ),
                          `已将图片 ${index + 1} 的排版改为${option.label}。`
                        )
                      }
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                <div className="erp-print-appendix-manager__item-actions">
                  <button
                    type="button"
                    disabled={busy || index === 0}
                    aria-label={`将末尾图片 ${index + 1} 前移`}
                    onClick={() =>
                      commitImages(
                        movePrintAppendixImage(
                          normalizedImages,
                          index,
                          'backward'
                        ),
                        `已将图片 ${index + 1} 前移。`
                      )
                    }
                  >
                    前移
                  </button>
                  <button
                    type="button"
                    disabled={busy || index === normalizedImages.length - 1}
                    aria-label={`将末尾图片 ${index + 1} 后移`}
                    onClick={() =>
                      commitImages(
                        movePrintAppendixImage(
                          normalizedImages,
                          index,
                          'forward'
                        ),
                        `已将图片 ${index + 1} 后移。`
                      )
                    }
                  >
                    后移
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    aria-label={`移除末尾图片 ${index + 1}`}
                    onClick={() =>
                      commitImages(
                        removePrintAppendixImage(normalizedImages, index),
                        `已移除图片 ${index + 1}，剩余 ${normalizedImages.length - 1} 张。`
                      )
                    }
                  >
                    移除
                  </button>
                </div>
              </li>
            )
          })}
        </ol>
      ) : (
        <div className="erp-print-appendix-manager__empty">还没有末尾图片</div>
      )}
    </section>
  )
}
