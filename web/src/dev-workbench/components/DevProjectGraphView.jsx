import React from 'react'
import { MermaidDiagram } from '@/common/components/markdown'
import { getProjectGraphNodeContext } from '../config/devProjectGraph.mjs'
import '../styles/dev-project-relationships.css'

export default function DevProjectGraphView({ graph, selectedNodeId, onNodeSelect }) {
  const node = getProjectGraphNodeContext(graph, selectedNodeId)

  return (
    <>
      <MermaidDiagram
        chart={graph.chart}
        label="项目关系图"
        nativeSize
        interactiveNodes={graph.nodes}
        selectedNodeId={node?.id || ''}
        onNodeSelect={onNodeSelect}
        showSourceOnError={false}
      />
      <p className="erp-dev-project-relationships__caption">{graph.caption}</p>
      <section className="erp-dev-project-relationships__node" aria-label="节点关系说明" aria-live="polite">
        <h3>{node ? node.label : '点选节点，查看关系含义'}</h3>
        {node ? <><p>{node.description}</p><p>{node.relationships}</p></> : <p>节点说明与前后关系在此显示，不改变业务状态。</p>}
      </section>
    </>
  )
}
