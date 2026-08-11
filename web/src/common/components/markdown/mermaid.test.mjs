import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

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
    /\.erp-markdown-mermaid__canvas[\s\S]*?width:\s*calc\(var\(--mermaid-zoom, 1\) \* 100%\)/u
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
