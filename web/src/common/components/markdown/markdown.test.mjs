import assert from 'node:assert/strict'
import test from 'node:test'
import { act, createElement } from 'react'

import {
  installTestDOM,
  registerJSXTestLoader,
} from '../../../../scripts/test/reactRuntime.mjs'
import { findDevDocsMarkdownAnchor } from '../../../dev-workbench/pages/devDocsNavigation.mjs'
import { extractMarkdownHeadings } from './anchors.mjs'

registerJSXTestLoader()

test('Markdown renders GitHub-compatible heading ids and safe explicit aliases', async (t) => {
  const dom = installTestDOM()
  const [{ createRoot }, { Markdown }] = await Promise.all([
    import('react-dom/client'),
    import('./index.jsx'),
  ])
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)

  t.after(async () => {
    await act(async () => root.unmount())
    container.remove()
    dom.restore()
  })

  const source = `# 文档

## 阅读与同步维护 / Reading and Maintenance
## 重复标题
## 重复标题

<a id="stable-explicit-anchor"></a>
<a name="stable-name-anchor"></a>

#### Custom Target

~~~md
## tilde fenced heading
<a id="fenced-anchor"></a>
~~~

\`\`\`md
## backtick fenced heading
\`\`\`

<a id="unsafe-anchor" onclick="alert(1)"></a>
`

  await act(async () => root.render(createElement(Markdown, { source })))

  assert(container.querySelector('#阅读与同步维护--reading-and-maintenance'))
  assert(container.querySelector('#重复标题'))
  assert(container.querySelector('#重复标题-1'))
  assert(container.querySelector('h4#custom-target'))
  assert.equal(
    container.querySelectorAll('[id="stable-explicit-anchor"]').length,
    1
  )
  assert.equal(
    container.querySelectorAll('[id="stable-name-anchor"]').length,
    1
  )
  assert.equal(container.querySelector('#fenced-anchor'), null)
  assert.equal(container.querySelector('#unsafe-anchor'), null)
  assert.equal(container.querySelector('script'), null)

  assert.equal(
    findDevDocsMarkdownAnchor(container, 'stable-explicit-anchor')?.tagName,
    'SPAN'
  )
  assert.equal(
    findDevDocsMarkdownAnchor(container, 'custom-target')?.tagName,
    'H4'
  )
})

test('heading ids count duplicates across levels while filtered outlines stay narrow', () => {
  assert.deepEqual(
    extractMarkdownHeadings('## Same\n#### Same\n## Same\n', [2]),
    [
      { aliases: [], id: 'same', level: 2, title: 'Same' },
      { aliases: [], id: 'same-2', level: 2, title: 'Same' },
    ]
  )
})

test('long Markdown preserves all blocks, duplicate anchors and replacement without layout wrappers', async (t) => {
  const dom = installTestDOM()
  const [{ createRoot }, { Markdown }] = await Promise.all([
    import('react-dom/client'),
    import('./index.jsx'),
  ])
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  t.after(async () => {
    await act(async () => root.unmount())
    container.remove()
    dom.restore()
  })
  const sections = Array.from({ length: 300 }, (_, index) =>
    `## 重复标题\n\n段落 ${index}\n\n| 字段 | 值 |\n| --- | --- |\n| id | ${index} |\n`)
  const source = sections.join('\n')
  await act(async () => root.render(createElement(Markdown, { source })))
  assert.equal(container.querySelectorAll('h2').length, 300)
  assert.equal(container.querySelectorAll('table').length, 300)
  assert.equal(container.children.length, 900)
  assert.equal(container.querySelectorAll('div').length, 0)
  assert.equal(container.querySelectorAll('[id="重复标题-299"]').length, 1)
  assert.equal(container.lastElementChild.textContent, '字段值id299')
  await act(async () => root.render(createElement(Markdown, { source: '# 替换内容' })))
  assert.equal(container.children.length, 1)
  assert.equal(container.querySelector('h1').id, '替换内容')
  await act(async () => root.render(createElement(Markdown, { source: '' })))
  assert.equal(container.children.length, 0)
})
