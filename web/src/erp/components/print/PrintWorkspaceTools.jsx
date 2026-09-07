import React, { useRef } from 'react'

const TOOL_ICON_PATHS = {
  preview:
    'M2 12a11 11 0 0 1 20 0 11 11 0 0 1-20 0Zm13 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
  download: 'M12 3v12m-5-5 5 5 5-5M4 15v6h16v-6',
  print: 'M6 9V3h12v6M6 18H3V9h18v9h-3M6 14h12v7H6ZM17 12h1',
  select: 'M5 3v17l5-5 4 6 3-2-4-6 7-1Z',
  cells: 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M3 11v2m18-2v2M11 3h2m-2 18h2',
  up: 'm5 10 7-7 7 7M12 3v18',
  down: 'm5 14 7 7 7-7M12 3v18',
  remove: 'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7',
  merge: 'M9 3H3v18h6m6-18h6v18h-6M3 12h18M9 8l4 4-4 4m6-8-4 4 4 4',
  split: 'M3 3h18v18H3ZM12 3v18M3 12h18',
  text: 'm6 17 6-14 6 14M8 12h8M3 21h18',
  image: 'M3 3h18v18H3Zm0 13 6-6 12 11M15 7h2',
  note: 'M3 3h18v14H9l-6 4ZM7 7h10M7 11h7',
  reset: 'M3 4v6h6M3 10a9 9 0 1 1 1 8',
  blank: 'M14 3H5v18h14V8ZM14 3v5h5',
  signature: 'm4 16 11-11 4 4L8 20H4ZM3 22h18',
  back: 'm9 4-6 6 6 6M3 10h12a6 6 0 0 1 6 6v4',
}

export function PrintToolIcon({ name }) {
  const path = TOOL_ICON_PATHS[name]
  return path ? (
    <svg
      className="erp-print-tool-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={path} />
    </svg>
  ) : null
}

export function PrintToolButton({
  icon,
  wide = false,
  className = '',
  children,
  ...props
}) {
  return (
    <button
      type="button"
      className={`erp-print-shell__button erp-print-tool-button ${className}`.trim()}
      data-print-tool-wide={wide || undefined}
      aria-pressed={
        ['select', 'cells'].includes(icon)
          ? className.includes('erp-print-shell__button--active')
          : undefined
      }
      {...props}
    >
      <PrintToolIcon
        name={
          ['select', 'cells'].includes(icon) &&
          className.includes('erp-print-shell__button--active')
            ? 'back'
            : icon
        }
      />
      <span>{children}</span>
    </button>
  )
}

export function PrintImageSlotTool({
  label,
  image,
  accept,
  onUpload,
  onClear,
}) {
  const inputRef = useRef(null)
  return (
    <div className="erp-print-image-tool" role="group" aria-label={label}>
      <div className="erp-print-image-tool__thumbnail">
        {image?.dataURL ? (
          <img src={image.dataURL} alt={label} />
        ) : (
          <PrintToolIcon name="image" />
        )}
      </div>
      <div className="erp-print-image-tool__copy">
        <strong>{label}</strong>
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          hidden
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) onUpload(file)
          }}
        />
        <div className="erp-print-image-tool__actions">
          <button
            type="button"
            aria-label={`${image?.dataURL ? '更换' : '上传'}${label}`}
            onClick={() => inputRef.current?.click()}
          >
            {image?.dataURL ? '更换' : '上传'}
          </button>
          <button
            type="button"
            aria-label={`清空${label}`}
            disabled={!image?.dataURL}
            onClick={onClear}
          >
            清空
          </button>
        </div>
      </div>
    </div>
  )
}
