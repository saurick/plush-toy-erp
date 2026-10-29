import React, { useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Tooltip } from 'antd'
import {
  buildBusinessFlowLayout,
  buildBusinessFlowWires,
} from '../../config/devBusinessFlowGraph.mjs'
import { getFulfillmentSubstepCopy } from '../../config/devFulfillmentPresentation.mjs'
import './businessFlowDiagram.css'

const layerLabels = {
  source_document: '单据',
  masterdata_lifecycle: '基础资料',
  process_runtime: '流程',
  workflow_task: '协同任务',
  fact_ledger: '业务事实',
  derived_result: '结果',
  topic: '专题',
  terminal: '结束',
}

export default function BusinessFlowDiagram({
  flow,
  label,
  selectedKey,
  onSelect,
  role = 'all',
  matchingKeys,
  runtimeKey,
  relationships = false,
  legend,
}) {
  const root = useRef(null)
  const marker = `business-flow-${useId().replaceAll(':', '')}`
  const layout = useMemo(() => buildBusinessFlowLayout(flow), [flow])
  const nodeLabels = useMemo(
    () =>
      new Map(
        flow.nodes.map((node) => [node.key, getFulfillmentSubstepCopy(node)])
      ),
    [flow]
  )
  const [paths, setPaths] = useState([])
  const [hintKey, setHintKey] = useState(null)
  const setHint = (key, open) =>
    setHintKey((current) => open ? key : current === key ? null : current)
  const dismissHint = (event) => {
    if (event.key === 'Escape' && hintKey !== null) {
      event.stopPropagation()
      setHintKey(null)
    }
  }
  useLayoutEffect(() => {
    const el = root.current
    const draw = () => {
      const base = el.getBoundingClientRect()
      const boxes = (selector, field) =>
        Object.fromEntries(
          [...el.querySelectorAll(selector)].map((node) => {
            const rect = node.getBoundingClientRect()
            return [
              node.dataset[field],
              {
                x: rect.left - base.left,
                y: rect.top - base.top,
                width: rect.width,
                height: rect.height,
              },
            ]
          })
        )
      if (!base.width) return
      setPaths(
        buildBusinessFlowWires(layout, {
          width: el.clientWidth,
          nodes: boxes('[data-graph-node]', 'graphNode'),
          labels: boxes('[data-graph-edge]', 'graphEdge'),
        })
      )
    }
    draw()
    const observer = new ResizeObserver(draw)
    observer.observe(el)
    window.addEventListener('beforeprint', draw)
    window.addEventListener('afterprint', draw)
    return () => {
      observer.disconnect()
      window.removeEventListener('beforeprint', draw)
      window.removeEventListener('afterprint', draw)
    }
  }, [layout])
  return (
    <section
      ref={root}
      className="erp-dev-business-flow"
      aria-label={label}
      data-business-flow
      data-relationships={relationships || undefined}
      data-graph-status={
        paths.length === layout.edges.length ? 'rendered' : 'loading'
      }
    >
      <svg className="erp-dev-business-flow__wires" aria-hidden="true">
        <defs>
          <marker
            id={marker}
            viewBox="0 0 8 8"
            refX="7"
            refY="4"
            markerWidth="5"
            markerHeight="5"
            orient="auto"
          >
            <path d="M0 0 L8 4 L0 8 Z" />
          </marker>
        </defs>
        {paths.map((edge) => (
          <path
            key={edge.key}
            d={edge.d}
            style={
              edge.stroke
                ? { stroke: edge.stroke, strokeDasharray: edge.dasharray }
                : undefined
            }
            data-graph-wire={edge.key}
            data-from={edge.from}
            data-to={edge.to}
            data-branch={edge.branch || undefined}
            data-selected={
              selectedKey === edge.from || selectedKey === edge.to || undefined
            }
            markerEnd={`url(#${marker})`}
          />
        ))}
      </svg>
      <div className="erp-dev-business-flow__levels">
        {Array.from({ length: layout.levels }, (_, rank) => {
          const nodes = flow.nodes.filter(
            (node) => layout.ranks.get(node.key) === rank
          )
          const edges = layout.edges.filter(
            (edge) => layout.ranks.get(edge.from) === rank
          )
          return (
            <div key={rank} className="erp-dev-business-flow__level">
              <div className="erp-dev-business-flow__nodes">
                {nodes.map((node) => {
                  const button = (
                    <button
                      type="button"
                      key={node.key}
                      data-graph-node={node.key}
                      data-graph-rank={rank}
                      data-kind={
                        node.terminal ? 'terminal' : node.kind || node.layer
                      }
                      data-risk={node.risk || undefined}
                      data-runtime-current={node.key === runtimeKey || undefined}
                      data-role-match={
                        (matchingKeys ? matchingKeys.has(node.key) : role !== 'all' && node.role_keys?.includes(role)) ||
                        undefined
                      }
                      aria-pressed={node.key === selectedKey}
                      onClick={() => {
                        if (relationships) setHintKey(null)
                        onSelect?.(node.key)
                      }}
                      onKeyDown={relationships ? dismissHint : undefined}
                    >
                      <strong>{nodeLabels.get(node.key)}</strong>
                      {node.key === runtimeKey ? <small>实例所在</small> : null}
                      {node.role ? (
                        <small>{node.role}</small>
                      ) : layerLabels[node.kind || node.layer] ? (
                        <small>{layerLabels[node.kind || node.layer]}</small>
                      ) : null}
                    </button>
                  )
                  return relationships ? (
                    <Tooltip
                      key={node.key}
                      title={node.summary || nodeLabels.get(node.key)}
                      trigger={['hover', 'focus']}
                      open={hintKey === `node:${node.key}`}
                      onOpenChange={(open) => setHint(`node:${node.key}`, open)}
                    >
                      {button}
                    </Tooltip>
                  ) : button
                })}
              </div>
              {edges.length ? (
                <div className="erp-dev-business-flow__conditions">
                  {edges.map((edge) => {
                    const condition = relationships ? edge.condition : ''
                    const Caption = condition ? 'button' : 'span'
                    const caption = (
                      <Caption
                        key={edge.key}
                        type={condition ? 'button' : undefined}
                        data-graph-edge={edge.key}
                        data-empty={(!edge.label && !edge.condition) || undefined}
                        aria-label={condition ? `查看条件：${edge.label}` : undefined}
                        onClick={condition ? () => {
                          setHintKey(null)
                          onSelect?.(edge.from)
                        } : undefined}
                        onKeyDown={condition ? dismissHint : undefined}
                      >
                        <span className="erp-dev-business-flow__print-relation">
                          {nodeLabels.get(edge.from)} → {nodeLabels.get(edge.to)}
                        </span>
                        {relationships ? edge.label : [
                          ...new Set(
                            [edge.label, edge.condition].filter(Boolean)
                          ),
                        ].join(' · ')}
                        {condition && condition !== edge.label ? (
                          <span className="erp-dev-business-flow__print-condition">
                            {' · '}{condition}
                          </span>
                        ) : null}
                      </Caption>
                    )
                    return condition ? (
                      <Tooltip
                        key={edge.key}
                        title={condition}
                        trigger={['hover', 'focus']}
                        open={hintKey === `edge:${edge.key}`}
                        onOpenChange={(open) => setHint(`edge:${edge.key}`, open)}
                      >
                        {caption}
                      </Tooltip>
                    ) : caption
                  })}
                </div>
              ) : null}
            </div>
          )
        })}
      </div>
      <p className="erp-dev-business-flow__legend">
        <span className="erp-dev-business-flow__screen-legend">
          {legend ?? (relationships
            ? '实线：依赖 · 虚线：分支或纠正 · 点选对象查看条件。'
            : '实线：办理路径 · 虚线：分支或回接。')}
        </span>
        <span className="erp-dev-business-flow__print-legend">
          箭头表示路径，按起止节点衔接。
        </span>
      </p>
    </section>
  )
}
