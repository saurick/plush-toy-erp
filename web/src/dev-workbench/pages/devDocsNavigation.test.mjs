import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildDevDocsChapterOutline,
  buildDevDocsLocation,
  resolveDevDocsMarkdownHref,
  resolveDevDocsReadingHeading,
} from './devDocsNavigation.mjs'

test('buildDevDocsChapterOutline: 列出两级标题，深层标题沿用最近的目录项', () => {
  const headings = [
    { id: 'title', level: 1 },
    { id: 'example', level: 2 },
    { id: 'contract', level: 2 },
    { id: 'note', level: 4 },
    { id: 'workflow', level: 3, title: '4.1 流程' },
    { id: 'master-data', level: 5 },
    { id: 'facts', level: 3, title: '业务事实' },
    { id: 'finance', level: 2 },
  ]
  const { chapters, locationByHeadingId } = buildDevDocsChapterOutline(headings, 'title')
  assert.deepEqual(chapters.map(({ heading, sections }) => [
    heading.id, sections.map(({ id }) => id),
  ]), [
    ['example', []],
    ['contract', ['workflow', 'facts']],
    ['finance', []],
  ])
  assert.equal(locationByHeadingId.has('title'), false)
  assert.deepEqual(locationByHeadingId.get('note'), { chapterId: 'contract', tocHeadingId: 'contract' })
  assert.deepEqual(locationByHeadingId.get('master-data'), { chapterId: 'contract', tocHeadingId: 'workflow' })
  assert.deepEqual(locationByHeadingId.get('facts'), { chapterId: 'contract', tocHeadingId: 'facts' })
  assert.deepEqual(locationByHeadingId.get('finance'), { chapterId: 'finance', tocHeadingId: 'finance' })
})

test('buildDevDocsChapterOutline: 使用文档实际的主标题层级', () => {
  const headings = [
    { id: 'title', level: 1 },
    { id: 'chapter', level: 3 },
    { id: 'section', level: 4 },
    { id: 'detail', level: 5 },
  ]
  assert.deepEqual(buildDevDocsChapterOutline(headings.slice(0, 1), 'title').chapters, [])
  assert.deepEqual(buildDevDocsChapterOutline(headings, 'title').chapters, [
    { heading: headings[1], sections: [headings[2]] },
  ])
})

test('resolveDevDocsReadingHeading: 阅读位置、底部与短文档各自定位', () => {
  const headings = [
    { id: 'intro', top: 18 },
    { id: 'details', top: 220 },
    { id: 'end', top: 760 },
  ]
  assert.equal(resolveDevDocsReadingHeading([]), '')
  assert.equal(resolveDevDocsReadingHeading(headings), 'intro')
  assert.equal(
    resolveDevDocsReadingHeading(headings, {
      scrollTop: 204,
      clientHeight: 300,
      scrollHeight: 1000,
    }),
    'details'
  )
  assert.equal(
    resolveDevDocsReadingHeading(headings, {
      scrollTop: 700,
      clientHeight: 300,
      scrollHeight: 1000,
    }),
    'end'
  )
  assert.equal(
    resolveDevDocsReadingHeading(headings, {
      scrollTop: 0,
      clientHeight: 1200,
      scrollHeight: 1000,
    }),
    'intro'
  )
})

test('resolveDevDocsReadingHeading: 正文展开后，标题进入阅读区上边距即定位到本章', () => {
  const headings = [
    { id: 'example', top: 170 },
    { id: 'diagrams', top: 490 },
  ]
  assert.equal(resolveDevDocsReadingHeading(headings, {
    scrollTop: 470,
    clientHeight: 600,
    scrollHeight: 1800,
    readingInset: 24,
  }), 'diagrams')
})

test('resolveDevDocsReadingHeading: 页尾多个章节共用滚动位置时，保留已定位的可见章节', () => {
  const headings = [
    { id: 'intro', top: 24 },
    { id: 'details', top: 700 },
    { id: 'end', top: 900 },
  ]
  const bottom = { scrollTop: 600, clientHeight: 400, scrollHeight: 1000 }
  assert.equal(resolveDevDocsReadingHeading(headings, bottom, 'details'), 'details')
  assert.equal(resolveDevDocsReadingHeading(headings, bottom, 'intro'), 'end')
  assert.equal(resolveDevDocsReadingHeading(headings, bottom), 'end')

  const short = { scrollTop: 0, clientHeight: 1200, scrollHeight: 1000 }
  assert.equal(resolveDevDocsReadingHeading(headings, short, 'end'), 'end')
})

test('buildDevDocsLocation: 同步 path、保留其他 query 并按需清理 hash', () => {
  const location = buildDevDocsLocation({
    pathname: '/__dev/docs',
    search: '?view=tree&path=docs%2Fold.md',
    path: 'docs/当前真源与交接顺序.md',
  })

  assert.equal(location.pathname, '/__dev/docs')
  assert.equal(location.hash, '')
  assert.equal(new URLSearchParams(location.search).get('view'), 'tree')
  assert.equal(
    new URLSearchParams(location.search).get('path'),
    'docs/当前真源与交接顺序.md'
  )

  const headingLocation = buildDevDocsLocation({
    path: 'docs/README.md',
    headingId: '索引同步-index-sync',
  })
  assert.equal(
    decodeURIComponent(headingLocation.hash.slice(1)),
    '索引同步-index-sync'
  )
})

test('resolveDevDocsMarkdownHref: 解析同文档和相对 Markdown 深链', () => {
  assert.deepEqual(
    resolveDevDocsMarkdownHref(
      '当前真源与交接顺序.md#前端入口',
      'docs/项目治理地图.md'
    ),
    {
      path: 'docs/当前真源与交接顺序.md',
      headingId: '前端入口',
    }
  )
  assert.deepEqual(
    resolveDevDocsMarkdownHref('../../AGENTS.md', 'docs/product/README.md'),
    { path: 'AGENTS.md', headingId: '' }
  )
  assert.deepEqual(
    resolveDevDocsMarkdownHref('#维护规则', 'docs/项目治理地图.md'),
    { path: 'docs/项目治理地图.md', headingId: '维护规则' }
  )
})

test('resolveDevDocsMarkdownHref: 站外、站内路由和非 Markdown 链接保持原行为', () => {
  for (const href of [
    'https://example.com/docs/readme.md',
    'mailto:owner@example.com',
    '//example.com/readme.md',
    '/erp/dashboard',
    './image.png',
  ]) {
    assert.equal(resolveDevDocsMarkdownHref(href, 'docs/项目治理地图.md'), null)
  }
})
