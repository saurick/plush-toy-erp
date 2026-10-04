import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import test from 'node:test'

const root = fileURLToPath(new URL('../../', import.meta.url))

function files(directory, extensions) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'archive') return []
    const file = path.join(directory, entry.name)
    if (entry.isDirectory()) return files(file, extensions)
    return entry.isFile() && extensions.includes(path.extname(file)) ? [file] : []
  })
}

test('current documentation and workbench guidance keep diagrams valid and bounded', async () => {
  const requireFromWeb = createRequire(path.join(root, 'web/package.json'))
  const { Window } = requireFromWeb('happy-dom')
  const window = new Window()
  Object.assign(globalThis, { window, document: window.document, Element: window.Element, SVGElement: window.SVGElement })
  try {
    const { default: mermaid } = await import(pathToFileURL(requireFromWeb.resolve('mermaid')).href)
    mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' })
    const diagrams = files(path.join(root, 'docs'), ['.md']).flatMap((file) => {
      const source = readFileSync(file, 'utf8')
      return [...source.matchAll(/```mermaid[^\n]*\n([\s\S]*?)```/gu)].map((match) => ({
        name: `${path.relative(root, file)}:${source.slice(0, match.index).split('\n').length}`,
        source: match[1].trim(),
      }))
    })
    // Literal guidance is checked without evaluating page modules or generated runtime graphs.
    for (const file of files(path.join(root, 'web/src/dev-workbench'), ['.jsx', '.mjs'])) {
      if (file.endsWith('.test.mjs')) continue
      const source = readFileSync(file, 'utf8')
      for (const match of source.matchAll(/`((?:flowchart|graph|sequenceDiagram|stateDiagram-v2)\b[^`]*?)`/gu)) {
        if (match[1].includes('${')) continue
        diagrams.push({ name: path.relative(root, file), source: match[1] })
      }
    }
    assert(diagrams.length > 0, 'no diagrams checked')
    for (const diagram of diagrams) {
      await assert.doesNotReject(() => mermaid.parse(diagram.source), diagram.name)
      if (!/^(?:flowchart|graph)\b/u.test(diagram.source)) continue
      const parsed = await mermaid.mermaidAPI.getDiagramFromText(diagram.source)
      const nodes = parsed.db.getVertices().size
      const edges = parsed.db.getEdges().length
      assert(nodes > 0 && nodes <= 12, `${diagram.name}: ${nodes} nodes; split into overview and focused topics (max 12)`)
      assert(edges <= 18, `${diagram.name}: ${edges} edges; split independent questions (max 18)`)
    }
  } finally {
    await window.happyDOM.close()
  }
})
