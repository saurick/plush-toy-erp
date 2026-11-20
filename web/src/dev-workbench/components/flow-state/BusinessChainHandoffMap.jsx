import React, { useId, useLayoutEffect, useRef, useState } from 'react'
import { Button } from 'antd'
import { businessChainRelationLayer } from '../../config/devBusinessChainReading.mjs'

// Reserve one row for every registered handoff, including hidden layers.
// Opposite directions share a peer card but always have separate tracks.
function handoffRows(chainKey, relations) {
  const peers = new Map()
  for (const edge of relations) {
    const key = edge.fromChainKey === chainKey ? edge.toChainKey : edge.fromChainKey
    if (!peers.has(key)) peers.set(key, [])
    peers.get(key).push(edge)
  }
  return [...peers].map(([key, edges]) => ({ key, edges }))
}

export default function BusinessChainHandoffMap({ chainKey, library, relations, layers, onRelation, onChain, onClose, dockRef }) {
  const arrows = useId().replaceAll(':', '')
  const plot = useRef(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = plot.current
    const measure = () => setWidth(el.clientWidth)
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    measure()
    return () => observer.disconnect()
  }, [])
  const peers = handoffRows(chainKey, relations)
  const rowHeight = width < 560 ? 68 : width < 900 ? 46 : 38
  const marginY = Math.max(6, (88 - relations.length * rowHeight) / 2)
  const height = relations.length * rowHeight + marginY * 2
  const cardWidth = Math.min(190, Math.floor(width * 0.22))
  const x1 = cardWidth + 9
  const x2 = width - x1
  const span = x2 - x1
  let row = 0
  const rows = peers.map((peer) => {
    const top = marginY + row * rowHeight
    row += peer.edges.length
    return { ...peer, top, center: top + peer.edges.length * rowHeight / 2 }
  })
  const center = rows.find((peer) => peer.edges.length > 1)?.center ?? height / 2
  const label = (key) => library.chainDefinitions.get(key).label
  const visible = (edge) => layers.includes(businessChainRelationLayer(edge))
  const card = (key, cy, edges = []) => {
    const current = key === chainKey
    const activeEdges = edges.filter(visible)
    return (
      <button
        type="button"
        key={key}
        data-handoff-chain={key}
        data-current={current || undefined}
        data-muted={(!current && activeEdges.length === 0) || undefined}
        data-exception={activeEdges.some((edge) => businessChainRelationLayer(edge) === 'exception') || undefined}
        className="erp-chain-handoffs__card"
        aria-label={`查看链路：${label(key)}`}
        onClick={(event) => onChain(key, event.currentTarget)}
        style={{ left: current ? 8 : x2 + 1, top: cy, width: cardWidth, minHeight: edges.length > 1 ? (edges.length - 1) * rowHeight + 16 : undefined }}
      >
        {current && <small>当前链</small>}<strong>{label(key)}</strong>
      </button>
    )
  }
  return (
    <section className="erp-chain-handoffs" aria-label="本链对外交接">
      <div ref={dockRef} className="erp-chain-handoffs__settings" />
      <div className="erp-chain-handoffs__content">
        <header><strong>对外交接</strong><small role="status">本链 {relations.filter(visible).length} / {relations.length} 条交接</small><Button type="text" size="small" onClick={onClose}>收起交接图</Button></header>
        <div ref={plot} className="erp-chain-handoffs__plot" style={{ height }}>
          {width > 0 && (
            <>
              <svg width={width} height={height} className="erp-chain-design__lines" aria-label="本链交接连线">
                <defs>{['known', 'exception'].map((kind) => (
                  <marker key={kind} id={`${arrows}-${kind}`} data-design-arrow={kind} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
                    <path d="M0 0 L10 5 L0 10 Z" />
                  </marker>
                ))}
                </defs>
                {rows.flatMap(({ edges, top }) => edges.map((edge, index) => {
                  if (!visible(edge)) return null
                  const layer = businessChainRelationLayer(edge)
                  const kind = ['exception', 'correction'].includes(layer) ? 'exception' : 'known'
                  const out = edge.fromChainKey === chainKey
                  const y = top + (index + 0.5) * rowHeight
                  const start = center + Math.max(-30, Math.min(30, edges.length > 1 ? y - center : (y - center) * 0.35))
                  const near = x1 + span * 0.13
                  const bend = x1 + span * 0.27
                  const d = out ? `M ${x1} ${start} C ${near} ${start}, ${near} ${y}, ${bend} ${y} H ${x2}` : `M ${x2} ${y} H ${bend} C ${near} ${y}, ${near} ${start}, ${x1} ${start}`
                  const name = `${label(edge.fromChainKey)} → ${label(edge.toChainKey)}：${edge.label}`
                  const text = layer === 'exception' ? `${out ? '送出' : '回接'} · ${edge.label}` : edge.label
                  const columns = Math.max(3, Math.floor((span * 0.74 - 16) / 13))
                  const lines = text.match(new RegExp(`.{1,${columns}}`, 'gu'))
                  return (
                    <g
                      key={edge.key}
                      data-design-edge={kind}
                      data-relation-kind={edge.kind}
                      data-edge-from={edge.fromChainKey}
                      data-edge-to={edge.toChainKey}
                      role="button"
                      tabIndex={0}
                      aria-label={name}
                      onClick={(event) => onRelation(edge, event.currentTarget)}
                      onKeyDown={(event) => {
                        if (['Enter', ' '].includes(event.key)) { event.preventDefault(); onRelation(edge, event.currentTarget) }
                      }}
                    >
                      <title>{name}</title>
                      <path className="erp-chain-design__edge-hit" d={d} />
                      <path className="erp-chain-design__edge" d={d} markerEnd={`url(#${arrows}-${kind})`} />
                      <text textAnchor="middle">{lines.map((line, i) => <tspan key={i} x={x1 + span * 0.58} y={y + 4 + (i - (lines.length - 1) / 2) * 15}>{line}</tspan>)}</text>
                    </g>
                  )
                }))}
              </svg>
              {card(chainKey, center)}
              {rows.map(({ key, center: cy, edges }) => card(key, cy, edges))}
            </>
          )}
        </div>
      </div>
    </section>
  )
}
