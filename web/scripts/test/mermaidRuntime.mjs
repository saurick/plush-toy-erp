import { registerHooks } from 'node:module'

const escape = (text) => String(text).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;')

// DOM tests use stable SVG hooks; browser QA covers real Mermaid parsing and layout.
export default {
  initialize() {},
  async render(id, chart) {
    const nodes = [...chart.matchAll(/^\s*(N\d+)(?:\[|\(\[)"([^"\n]*)"/gm)]
    const edges = [...chart.matchAll(/^\s*(N\d+) (E\d+)@(?:-->|-\.->)(?:\|"([^"\n]*)"\|)? (N\d+)/gm)]
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400">' +
      nodes.map((node, index) => '<g class="node" id="' + id + '-flowchart-' + node[1] + '-' + index + '"><rect class="label-container"/><text>' + escape(node[2].replaceAll('<br/>', ' ')) + '</text></g>').join('') +
      edges.map((edge) => '<path id="' + id + '-' + edge[2] + '" data-id="' + edge[2] + '" d="M0 0L10 10"/><g class="edgeLabel" data-id="' + edge[2] + '"><text>' + escape(edge[3] || '') + '</text></g>').join('') + '</svg>'
    return { svg }
  },
}

export function registerMermaidTestRenderer() {
  registerHooks({
    resolve(specifier, context, nextResolve) {
      return specifier === 'mermaid'
        ? { url: import.meta.url, shortCircuit: true }
        : nextResolve(specifier, context)
    },
  })
}
