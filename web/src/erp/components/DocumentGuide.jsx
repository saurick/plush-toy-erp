import React, { useLayoutEffect, useRef, useState } from 'react'
import { layoutDocumentGuideCallouts } from './documentGuideGeometry.mjs'
import './documentGuide.css'

export default function DocumentGuide({
  children,
  parts,
  figureRef,
  caption,
  summary,
  fill = false,
}) {
  const [selection, setSelection] = useState(() => new Map())
  const activeIndex = selection.get(parts) ?? 0
  const onSelect = (index) => {
    setSelection((previous) => new Map(previous).set(parts, index))
  }
  return (
    <div
      className={`erp-document-guide${fill ? ' erp-document-guide--fill' : ''}`}
    >
      <div className="erp-document-guide__body">
        <figure className="erp-document-guide__figure" ref={figureRef}>
          {children({ activeIndex, onSelect })}
          {caption && <figcaption>{caption}</figcaption>}
        </figure>
        <div className="erp-document-guide__details">
          {summary && <p className="erp-document-guide__summary">{summary}</p>}
          <ol className="erp-document-guide__parts">
            {parts.map((part, index) => (
              <li key={part.title}>
                <button
                  type="button"
                  className="erp-document-guide__part"
                  aria-pressed={activeIndex === index}
                  onClick={() => onSelect(index)}
                >
                  <span
                    className="erp-document-guide__number"
                    aria-hidden="true"
                  >
                    {index + 1}
                  </span>
                  <span className="erp-document-guide__description">
                    <span className="erp-document-guide__part-title">
                      {part.title}
                    </span>
                    <span className="erp-document-guide__part-description">
                      {part.description}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  )
}

export function DocumentGuideAnnotations({
  parts,
  regions,
  activeIndex,
  onSelect,
}) {
  const rootRef = useRef(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  useLayoutEffect(() => {
    const node = rootRef.current
    const update = () => {
      const next = { width: node.clientWidth, height: node.clientHeight }
      setSize((previous) =>
        previous.width === next.width && previous.height === next.height
          ? previous
          : next
      )
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  const callouts = layoutDocumentGuideCallouts(regions, size.height)
  return (
    <div className="erp-document-guide__annotations" ref={rootRef}>
      <svg
        className="erp-document-guide__highlights"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {regions.flatMap((region, index) => {
          if (!region) return []
          return (region.fragments || [region]).map(
            (fragment, fragmentIndex) => (
              <rect
                key={`${parts[index].title}-${fragmentIndex}`}
                x={fragment.left}
                y={fragment.top}
                width={fragment.right - fragment.left}
                height={fragment.bottom - fragment.top}
                className={
                  activeIndex === index
                    ? 'erp-document-guide__highlight--active'
                    : undefined
                }
              />
            )
          )
        })}
      </svg>
      {callouts.map((item) => {
        if (!item) return null
        const { index, side, center, markerY } = item
        const part = parts[index]
        const railX = side === 'left' ? 44 : 8
        const markerX = side === 'left' ? 35 : 17
        const pointX =
          side === 'left'
            ? 52 + ((item.left + item.right) / 200) * size.width
            : ((item.left + item.right) / 200 - 1) * size.width
        return (
          <div
            className="erp-document-guide__callout"
            data-side={side}
            key={part.title}
          >
            <svg
              className="erp-document-guide__lines"
              viewBox={`0 0 52 ${size.height}`}
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              {item.kind !== 'point' &&
                (item.fragments || [item]).map((fragment, fragmentIndex) => (
                  <line
                    key={fragmentIndex}
                    data-guide-range=""
                    x1={railX}
                    x2={railX}
                    y1={(fragment.top / 100) * size.height}
                    y2={(fragment.bottom / 100) * size.height}
                  />
                ))}
              <line
                data-guide-leader=""
                x1={item.kind === 'point' ? pointX : railX}
                y1={center}
                x2={markerX}
                y2={markerY}
              />
            </svg>
            <button
              type="button"
              className="erp-document-guide__marker"
              style={{ top: markerY }}
              aria-label={`${index + 1} ${part.title}：${part.description}`}
              aria-pressed={activeIndex === index}
              data-guide-target={part.selector}
              data-guide-separate-targets={part.separateTargets || undefined}
              data-guide-part={index + 1}
              onClick={() => onSelect(index)}
            >
              <span className="erp-document-guide__number" aria-hidden="true">
                {index + 1}
              </span>
            </button>
          </div>
        )
      })}
    </div>
  )
}
