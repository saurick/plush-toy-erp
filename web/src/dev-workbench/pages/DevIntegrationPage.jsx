import React, { useCallback } from 'react'
import { Typography } from 'antd'
import { Link, useSearchParams } from 'react-router-dom'
import DevPageNav from '../components/DevPageNav.jsx'
import DevProjectGraphView from '../components/DevProjectGraphView.jsx'
import { buildProjectGraph } from '../config/devProjectGraph.mjs'

const graph = buildProjectGraph('integration')

export default function DevIntegrationPage() {
  const [params, setParams] = useSearchParams()
  const selectedNodeId = params.getAll('node').length === 1 ? params.get('node') : ''
  const selectNode = useCallback((nodeId) => setParams((previous) => {
    const next = new URLSearchParams(previous)
    next.set('node', nodeId)
    return next
  }), [setParams])

  return (
    <div className="erp-dev-workspace-page erp-dev-tool-page">
      <DevPageNav sourcePath="server/docs/api.md" />
      <header className="erp-dev-hub-header">
        <Typography.Title level={1}>接口与集成</Typography.Title>
      </header>
      <main className="erp-dev-project-relationships">
        <section className="erp-dev-project-relationships__detail" aria-label="接口契约与接入边界">
          <nav className="erp-dev-project-relationships__links" aria-label="合同与验证入口">
            {graph.destinations.map((destination) => (
              <Link key={destination.route} to={destination.route}>{destination.label}</Link>
            ))}
          </nav>
          <DevProjectGraphView graph={graph} selectedNodeId={selectedNodeId} onNodeSelect={selectNode} />
        </section>
      </main>
    </div>
  )
}
