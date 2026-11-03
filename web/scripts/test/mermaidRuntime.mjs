import { register } from 'node:module'

// DOM unit tests exercise our event wiring. Real layout and Mermaid syntax run in browser QA.
export function registerMermaidTestRenderer() {
  const renderer = `
const escape = (text) => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;')
export default {
  initialize() {},
  async render(id, chart) {
    const nodes = [...chart.matchAll(/^\\s*(N\\d+)(?:\\[|\\(\\[)"([^"\\n]*)"/gm)]
    const edges = [...chart.matchAll(/^\\s*(N\\d+) (E\\d+)@(?:-->|-\\.->)(?:\\|"([^"\\n]*)"\\|)? (N\\d+)/gm)]
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">' +
      nodes.map((node, index) => '<g class="node" id="' + id + '-flowchart-' + node[1] + '-' + index + '"><rect class="label-container"/><text>' + escape(node[2].replaceAll('<br/>', ' ')) + '</text></g>').join('') +
      edges.map((edge) => '<path id="' + id + '-' + edge[2] + '" data-id="' + edge[2] + '" d="M0 0L10 10"/><g class="edgeLabel" data-id="' + edge[2] + '"><text>' + escape(edge[3] || '') + '</text></g>').join('') + '</svg>'
    return { svg }
  }
}
`
  const loader = `
const source = ${JSON.stringify(renderer)}
export async function resolve(specifier, context, next) {
  if (specifier === 'mermaid') return { url: 'mermaid:test-renderer', shortCircuit: true }
  return next(specifier, context)
}
export async function load(url, context, next) {
  if (url === 'mermaid:test-renderer') return { format: 'module', source, shortCircuit: true }
  return next(url, context)
}
`
  register('data:text/javascript,' + encodeURIComponent(loader), import.meta.url)
}
