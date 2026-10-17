import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildDevDocsLocation,
  resolveDevDocsMarkdownHref,
  resolveDevDocsReadingHeading,
} from './devDocsNavigation.mjs'

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
