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
<a id="产品工程入口-__devproduct-engineering"></a>

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
  assert.equal(findDevDocsMarkdownAnchor(container, '产品工程入口-__devproduct-engineering')?.tagName, 'SPAN')
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

test('chapter title styling preserves native headings and Markdown anchors', async (t) => {
  const dom = installTestDOM()
  const [{ createRoot }, { Markdown }, { default: SectionTitle }] = await Promise.all([
    import('react-dom/client'),
    import('./index.jsx'),
    import('../../../erp/components/business-list/BusinessFormSectionTitle.jsx'),
  ])
  const container = document.createElement('div')
  document.body.appendChild(container)
  const root = createRoot(container)
  t.after(async () => {
    await act(async () => root.unmount())
    container.remove()
    dom.restore()
  })

  const source = '# 文档\n\n<a id="section-link"></a>\n\n## 主章\n\n### 子标题'
  const renderHeading = (heading) => heading.type === 'h2'
    ? createElement(SectionTitle, {
      ...heading.props,
      as: heading.type,
      'data-current-section-title': 'true',
    })
    : heading
  await act(async () => root.render([
    createElement(Markdown, { key: 'docs', source, renderHeading }),
    createElement(SectionTitle, { key: 'form', id: 'form-heading' }, '表单分区'),
  ]))

  const chapter = container.querySelector('h2[data-markdown-anchor="heading"]')
  assert.equal(chapter?.id, '主章')
  assert.equal(chapter?.textContent, '主章')
  assert(chapter?.classList.contains('erp-business-form-heading'))
  assert.equal(chapter?.dataset.currentSectionTitle, 'true')
  assert.equal(findDevDocsMarkdownAnchor(container, 'section-link')?.closest('h2')?.id, '主章')
  assert.equal(container.querySelector('h3')?.classList.contains('erp-business-form-heading'), false)
  assert(container.querySelector('div#form-heading[role="heading"][aria-level="3"]'))
})

test('marked sections keep their contents and anchors when rendered as disclosures', async (t) => {
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

  const marker = '<!-- dev-docs:collapse -->'
  const source = [
    '## 概要',
    `<a id="section-link"></a>\n${marker}\n## 明细`,
    '<a id="detail-link"></a>\n### 规则',
    '可查找的正文',
    `~~~md\n${marker}\n## fenced heading\n~~~`,
    '## 规则',
    '直接可读的下一节',
  ].join('\n\n')
  const renderCollapsedSection = (heading, children) => createElement(
    'details',
    { key: heading.props.id },
    createElement('summary', null, heading),
    children,
  )

  await act(async () => root.render(createElement(Markdown, { source })))
  assert.equal(container.querySelector('details'), null)
  assert(container.querySelector('h2#明细'))

  await act(async () => root.render(createElement(Markdown, { source, renderCollapsedSection })))
  assert.equal(container.querySelectorAll('details').length, 1)
  assert(container.querySelector('details:not([open]) > summary > h2#明细 > #section-link'))
  assert(container.querySelector('details h3#规则 > #detail-link'))
  assert.match(container.querySelector('details').textContent, /可查找的正文/u)
  assert.match(container.querySelector('pre').textContent, /<!-- dev-docs:collapse -->/u)
  assert.equal(container.querySelector('details').nextElementSibling?.id, '规则-1')
  assert.equal(container.textContent.split(marker).length - 1, 1)
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
