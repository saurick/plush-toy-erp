import React, { useContext, useMemo, useState } from 'react'
import { MermaidDiagram } from '@/common/components/markdown'
import {
  buildBusinessFlowMermaid,
  splitBusinessFlowForPrint,
} from '@/common/components/markdown/mermaidGraph.mjs'
import { FlowDiagramPrintContext } from './FlowDiagramPrintContext.mjs'
import { getFulfillmentSubstepCopy } from '../../config/devFulfillmentPresentation.mjs'
import './businessFlowDiagram.css'

export default function BusinessFlowDiagram({
  flow,
  label,
  selectedKey,
  onSelect,
  onInspect,
  role = 'all',
  matchingKeys,
  runtimeKey,
  relationships = false,
  legend,
}) {
  const [localKey, setLocalKey] = useState(null)
  const [status, setStatus] = useState('loading')
  const printing = useContext(FlowDiagramPrintContext)
  const [printStatus, setPrintStatus] = useState({})
  const printGraphs = useMemo(
    () =>
      printing
        ? splitBusinessFlowForPrint(flow).map((part) => {
            const graph = buildBusinessFlowMermaid(part, { role, matchingKeys, runtimeKey })
            return { ...graph, printKey: JSON.stringify([graph.chart, part.nodes.map((node) => node.key), part.edges.map((edge) => edge.key)]) }
          })
        : [],
    [printing, flow, role, matchingKeys, runtimeKey]
  )
  const graph = useMemo(
    () =>
      buildBusinessFlowMermaid(
        {
          ...flow,
          nodes: flow.nodes.map((node) => ({
            ...node,
            label: getFulfillmentSubstepCopy(node),
          })),
        },
        { role, matchingKeys, runtimeKey }
      ),
    [flow, role, matchingKeys, runtimeKey]
  )
  const selected = selectedKey === undefined ? localKey : selectedKey
  return (
    <section
      className="erp-dev-business-flow"
      aria-label={label}
      data-business-flow
      data-graph-status={
        printing
          ? printGraphs.every((part) => printStatus[part.printKey] === 'rendered')
            ? 'rendered'
            : 'loading'
          : status
      }
      data-relationships={relationships || undefined}
      data-flow-node-count={
        printing
          ? printGraphs.reduce((count, part) => count + part.nodes.length, 0)
          : graph.nodes.length
      }
      data-flow-edge-count={graph.edges.length}
    >
      {printing ? (
        printGraphs.map((part, index) => (
          <section
            key={part.printKey}
            className="erp-dev-business-flow__print-part"
            data-flow-print-part
          >
            <p>
              {label} · {index + 1}/{printGraphs.length}，跨段按同名对象衔接
            </p>
            <MermaidDiagram
              chart={part.chart}
              label={`${label}打印图 ${index + 1}`}
              initialZoom={1}
              themeMode="light"
              flowchartHtmlLabels={false}
              showSourceOnError={false}
              interactiveNodes={part.nodes}
              interactiveEdges={part.edges}
              selectedNodeId={part.ids.get(selected)}
              onStatusChange={(next) =>
                setPrintStatus((previous) =>
                  previous[part.printKey] === next
                    ? previous
                    : { ...previous, [part.printKey]: next }
                )
              }
            />
          </section>
        ))
      ) : (
        <MermaidDiagram
          chart={graph.chart}
          label={label}
          showSourceOnError={false}
          interactiveNodes={graph.nodes}
          interactiveEdges={graph.edges}
          onStatusChange={setStatus}
          onNodeInspect={
            onInspect
              ? (id) =>
                  onInspect(
                    graph.nodes.find((node) => node.id === id)?.key ||
                      graph.edges.find((edge) => edge.id === id)?.from ||
                      null
                  )
              : undefined
          }
          selectedNodeId={graph.ids.get(selected)}
          onNodeSelect={(id) => {
            const node = graph.nodes.find((item) => item.id === id)
            if (!node) return
            setLocalKey(node.key)
            onSelect?.(node.key)
          }}
        />
      )}
      <p className="erp-dev-business-flow__legend">
        {legend ??
          (relationships
            ? '实线：依赖 · 虚线：分支或纠正 · 点选对象查看条件。'
            : '实线：办理路径 · 虚线：分支或回接。')}
      </p>
      {graph.edges.some((edge) => edge.description) ? (
        <dl className="erp-dev-business-flow__print-conditions">
          {graph.edges.map((edge) => (
            <div key={edge.key}>
              <dt>
                {flow.nodes.find((node) => node.key === edge.from)?.label} →{' '}
                {flow.nodes.find((node) => node.key === edge.to)?.label}
              </dt>
              <dd>{edge.description}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  )
}
