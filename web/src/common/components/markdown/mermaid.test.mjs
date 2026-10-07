import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  fitMermaidZoom,
  getMermaidDirection,
  toggleMermaidDirection,
  withMermaidDirection,
} from './mermaidViewport.mjs'

const componentSource = readFileSync(
  new URL('./index.jsx', import.meta.url),
  'utf8'
)
const css = readFileSync(new URL('./mermaid.css', import.meta.url), 'utf8')

test('Mermaid viewer owns its shared interaction styles', () => {
  assert.match(componentSource, /import '\.\/mermaid\.css'/u)
  assert.match(css, /^\.erp-markdown-mermaid\s*\{/mu)
  assert.match(css, /\.erp-markdown-mermaid__toolbar[\s\S]*?flex-wrap:\s*wrap/u)
  assert.match(
    css,
    /\.erp-markdown-mermaid__tool[\s\S]*?width:\s*32px[\s\S]*?height:\s*32px/u
  )
  assert.match(css, /\.erp-markdown-mermaid__viewport[\s\S]*?overflow:\s*auto/u)
})

test('Mermaid viewer applies zoom and fullscreen geometry without a page wrapper', () => {
  assert.match(
    css,
    /\.erp-markdown-mermaid__canvas[\s\S]*?width:\s*calc\(\s*var\(--mermaid-zoom, 1\) \* min\(100%, var\(--mermaid-intrinsic-width, 100%\)\)\s*\)/u
  )
  assert.match(
    css,
    /\.erp-markdown-mermaid--fullscreen[\s\S]*?position:\s*fixed[\s\S]*?inset:\s*0/u
  )
  assert.match(
    css,
    /@media \(max-width: 480px\)[\s\S]*?\.erp-markdown-mermaid--fullscreen/u
  )
})

test('Mermaid viewer preserves keyboard focus affordances and theme tokens', () => {
  assert.match(css, /\.erp-markdown-mermaid__tool:focus-visible/u)
  assert.match(css, /--erp-border/u)
  assert.match(css, /--erp-surface-bg/u)
  assert.match(css, /--erp-text/u)
  assert.match(css, /--erp-primary/u)
  assert.match(componentSource, /fullscreenReturnFocusRef/u)
  assert.match(
    componentSource,
    /fullscreenOpenRef\.current \|\| returnFocusElement/u
  )
})

test('layout switching preserves labels, subgraphs, metadata and reverse flow', () => {
  const source =
    '---\ntitle: 示例\n---\n%%{init: {"theme": "base"}}%%\n%% overview\nflowchart RL\nsubgraph group\ndirection TB\nA["flowchart LR<br>说明"] --> B\nend'
  assert.equal(getMermaidDirection(source), 'RL')
  const switched = withMermaidDirection(source, toggleMermaidDirection('RL'))
  assert.equal(getMermaidDirection(switched), 'BT')
  assert.equal(switched.replace('flowchart BT', 'flowchart RL'), source)
  assert.equal(
    withMermaidDirection(switched, toggleMermaidDirection('BT')),
    source
  )
  assert.equal(getMermaidDirection('graph TD; A --> B'), 'TD')
  assert.equal(toggleMermaidDirection('TD'), 'LR')
})

test('unsupported diagrams and quoted diagram keywords are never rewritten', () => {
  for (const source of [
    'sequenceDiagram\nA->>B: flowchart LR',
    'stateDiagram-v2\n direction LR',
    'flowchart\nA --> B',
  ]) {
    assert.equal(getMermaidDirection(source), '')
    assert.equal(withMermaidDirection(source, 'TB'), source)
  }
  assert.equal(
    withMermaidDirection('flowchart LR\nA --> B', 'bogus'),
    'flowchart LR\nA --> B'
  )
})

test('fit all accounts for tall, wide and naturally small diagrams', () => {
  assert.equal(
    fitMermaidZoom({
      width: 500,
      height: 2000,
      viewportWidth: 1200,
      viewportHeight: 600,
    }),
    0.3
  )
  assert.equal(
    fitMermaidZoom({
      width: 500,
      height: 10000,
      viewportWidth: 1200,
      viewportHeight: 600,
    }),
    0.06
  )
  assert.equal(
    fitMermaidZoom({
      width: 2000,
      height: 400,
      viewportWidth: 1000,
      viewportHeight: 600,
    }),
    1
  )
  assert.equal(
    fitMermaidZoom({
      width: 200,
      height: 100,
      viewportWidth: 1000,
      viewportHeight: 600,
    }),
    1
  )
  assert.equal(
    fitMermaidZoom({
      width: NaN,
      height: 100,
      viewportWidth: 1000,
      viewportHeight: 600,
    }),
    1
  )
})

test('page styles do not impose a minimum canvas size that defeats shared zoom', () => {
  for (const name of [
    'dev-docs',
    'dev-permission-relationships',
    'dev-quality-gates',
    'dev-version-center',
    'dev-flow-state-observatory',
  ]) {
    const pageCSS = readFileSync(
      new URL(`../../../dev-workbench/styles/${name}.css`, import.meta.url),
      'utf8'
    )
    assert.doesNotMatch(
      pageCSS,
      /[^{}]*mermaid__canvas[^{}]*\{[^{}]*min-(?:width|height):\s*[1-9][\d.]*px/u,
      name
    )
  }
})
