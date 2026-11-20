import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { Window } from 'happy-dom'
import {
  QUALITY_GATE_FLOWS,
  QUALITY_GATE_HOOK_GROUPS,
  QUALITY_GATE_HOOK_FILES,
} from './devQualityGateGuide.mjs'
import { CI_WORKFLOW_SECTIONS } from './devCiWorkflow.mjs'

const root = fileURLToPath(new URL('../../../../', import.meta.url))

test('all actual Git Hook entrypoints have an index, sources and valid flow destinations', () => {
  assert.deepEqual(
    QUALITY_GATE_HOOK_GROUPS.map((hook) => hook.name).sort(),
    readdirSync(path.join(root, '.githooks')).sort()
  )
  for (const [file, hook] of Object.entries(QUALITY_GATE_HOOK_FILES)) {
    assert(existsSync(path.join(root, file)), file)
    if (hook.test) assert(existsSync(path.join(root, hook.test)), hook.test)
    if (hook.flow)
      { assert(
        QUALITY_GATE_FLOWS[hook.flow]?.nodes[hook.node],
        `${file} destination`
      ) }
  }
  for (const flow of Object.values(QUALITY_GATE_FLOWS)) {
    assert(flow.nodes[flow.default])
    for (const source of [
      ...flow.source,
      ...Object.values(flow.nodes).flatMap((node) => node.sources),
    ])
      { assert(existsSync(path.join(root, source)), source) }
    for (const node of Object.values(flow.nodes))
      { if (node.more) assert(QUALITY_GATE_FLOWS[node.more]) }
  }
  for (const [key, source] of [
    ['commit', 'commit'],
    ['push', 'push'],
    ['ci-entry', 'ci'],
  ]) {
    const section = CI_WORKFLOW_SECTIONS.find((item) => item.key === key)
    assert.equal(section.chart, QUALITY_GATE_FLOWS[source].chart)
    assert.equal(section.nodes, QUALITY_GATE_FLOWS[source].nodes)
  }
})

test('key Mermaid flows parse and all visible nodes have readable conditions and failure details', async () => {
  const window = new Window()
  Object.assign(globalThis, {
    window,
    document: window.document,
    Element: window.Element,
    SVGElement: window.SVGElement,
  })
  try {
    const { default: mermaid } = await import('mermaid')
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' })
    for (const [key, flow] of Object.entries(QUALITY_GATE_FLOWS)) {
      const seen = new Set()
      for (const { chart } of flow.charts || [{ chart: flow.chart }]) {
        const diagram = await mermaid.mermaidAPI.getDiagramFromText(chart)
        const nodes = diagram.db.getVertices()
        assert(nodes.size > 0 && nodes.size <= 12, key)
        assert(diagram.db.getEdges().length <= 18, key)
        for (const id of nodes.keys()) {
          const node = flow.nodes[id]
          assert(
            node?.label &&
              node.trigger &&
              node.checks.length &&
              node.result &&
              node.failure,
            `${key}/${id}`
          )
          seen.add(id)
        }
      }
      assert.deepEqual([...seen].sort(), Object.keys(flow.nodes).sort(), key)
    }
  } finally {
    await window.happyDOM.close()
  }
})
