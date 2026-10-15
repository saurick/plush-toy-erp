import { useState } from 'react'
import { PictureOutlined } from '@ant-design/icons'
import { isUsableImageDimensions } from '../../utils/imageDisplay.mjs'
import './businessImage.css'

export default function BusinessImage({
  src,
  alt,
  compact = false,
  printable = false,
  loadFailed = false,
  emptyText = compact ? '暂无图' : '暂无图片',
  ...imageProps
}) {
  const [result, setResult] = useState(null)
  const failure = loadFailed
    ? 'failed'
    : result?.src === src
      ? result.failure
      : ''
  if (!src || failure) {
    const failureText =
      failure === 'unusable'
        ? compact
          ? '不可用'
          : '图片不可用'
        : compact
          ? '加载失败'
          : '图片加载失败'
    const text = failure ? failureText : emptyText
    return (
      <span
        className={`erp-image-placeholder${compact ? ' erp-image-placeholder--compact' : ''}`}
        role="img"
        aria-label={`${alt || '图片'}：${text}`}
        title={failure === 'unusable' ? '图片尺寸过小，请更换图片' : text}
        data-image-state={failure || 'empty'}
        data-print-image-error={printable && failure ? text : undefined}
      >
        <PictureOutlined aria-hidden="true" />
        <span>{text}</span>
      </span>
    )
  }
  return (
    <img
      {...imageProps}
      src={src}
      alt={alt}
      onLoad={(event) => {
        if (!isUsableImageDimensions(event.currentTarget)) {
          setResult({ src, failure: 'unusable' })
        } else {
          setResult({ src, failure: '' })
        }
      }}
      onError={() => setResult({ src, failure: 'failed' })}
    />
  )
}
