import React, { useId, useLayoutEffect, useRef } from 'react'
import { useSearchParams } from 'react-router-dom'
import '../styles/dev-ui-design-callouts.css'

export default function DevUIDesignCallouts({ points, children }) {
  const [params, setParams] = useSearchParams()
  const root = useRef(null)
  const pendingTarget = useRef(null)
  const descriptionId = useId()
  const active = points.find(({ key }) => key === params.get('point')) || points[0]

  const locate = (destination) => {
    root.current?.querySelector(destination)?.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }
  useLayoutEffect(() => {
    if (pendingTarget.current) {
      locate(pendingTarget.current)
      pendingTarget.current = null
    }
  }, [active.key])

  const select = (key, destination) => {
    if (active.key === key) {
      locate(destination)
      return
    }
    pendingTarget.current = destination
    const next = new URLSearchParams(window.location.search)
    if (key === points[0].key) next.delete('point')
    else next.set('point', key)
    setParams(next, { preventScrollReset: true })
  }

  const point = (key, content) => {
    const index = points.findIndex((item) => item.key === key)
    const { title } = points[index]
    const selected = active.key === key
    return (
      <div className="erp-design-callouts__region" data-guide-region={key} data-active={selected}>
        <button
          type="button"
          className="erp-design-callouts__marker"
          aria-label={`图解 ${index + 1}：${title}`}
          aria-pressed={selected}
          aria-controls={descriptionId}
          onClick={() => select(key, '[data-guide-explanation]')}
        >
          <span aria-hidden="true">{index + 1}</span>
        </button>
        <div className="erp-design-callouts__target">{content}</div>
      </div>
    )
  }

  return (
    <div className="erp-design-callouts" ref={root}>
      <div className="erp-design-callouts__layout">
        <div className="erp-design-callouts__scene">{children(point)}</div>
        <aside className="erp-design-callouts__notes" aria-label="图解要点">
          <h3>图解要点</h3>
          <ol>
            {points.map(({ key, title }, index) => (
              <li key={key}>
                <button
                  type="button"
                  className="erp-design-callouts__note"
                  aria-label={`${index + 1} ${title}`}
                  aria-pressed={active.key === key}
                  aria-controls={descriptionId}
                  onClick={() => select(key, `[data-guide-region="${key}"]`)}
                >
                  <span aria-hidden="true">{index + 1}</span>
                  {title}
                </button>
              </li>
            ))}
          </ol>
          <p id={descriptionId} data-guide-explanation="" role="status">{active.description}</p>
        </aside>
      </div>
    </div>
  )
}
