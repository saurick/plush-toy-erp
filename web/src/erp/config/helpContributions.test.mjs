import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeSupplementMarkdown, publishedSupplementFor, renderHelpSupplement, withPublishedSupplements } from './helpContributions.mjs'
import { searchHelpDocuments } from './helpManualCatalog.mjs'
import { renderBusinessHandbookHtml, renderProjectManualHtml, renderProjectManualMarkdown } from '../utils/businessHandbookExport.mjs'
import { renderBusinessHandbookMarkdown } from './businessHandbook.mjs'

const published = { document_id: 'handbook:start', published_version: 2, markdown: '已发布的企业补充关键字', published_by: '文档维护人', published_at: '2026-10-17T10:00:00Z' }

test('same published snapshot appears in chapter, search and both offline formats', () => {
  const references = withPublishedSupplements([{ id: 'handbook:start', kind: 'chapter', title: '开始使用', summary: '', sections: [] }], [published])
  assert.equal(references[0].supplement.markdown, published.markdown)
  assert.equal(searchHelpDocuments({ references }, '企业补充关键字')[0].id, 'handbook:start')
  assert.match(renderBusinessHandbookMarkdown({ guides: [], pages: [], supplements: [published] }), /已发布的企业补充关键字/u)
  assert.match(renderBusinessHandbookHtml({ guides: [], pages: [], supplements: [published] }), /已发布的企业补充关键字/u)
  assert.equal(publishedSupplementFor([{ ...published, published_version: 0 }], published.document_id), null)
})

test('protected manual supplements stay in their original chapters and keep canonical source intact', () => {
  const manual = { key: 'operations', title: '运维', markdown: '# 运维\n\n介绍\n\n## 第一章 / One\n\n正式甲\n\n## 第二章 / Two\n\n正式乙\n' }
  const supplements = [{ ...published, document_id: 'manual:operations:one', markdown: '# 本公司补充甲\n\n唯一甲' }, { ...published, document_id: 'manual:operations:two', markdown: '唯一乙' }]
  const markdown = renderProjectManualMarkdown(manual, supplements)
  assert.ok(markdown.indexOf('正式甲') < markdown.indexOf('唯一甲'))
  assert.ok(markdown.indexOf('唯一甲') < markdown.indexOf('## 第二章'))
  assert.ok(markdown.indexOf('正式乙') < markdown.indexOf('唯一乙'))
  assert.match(manual.markdown, /正式甲/u)
  assert.doesNotMatch(manual.markdown, /唯一/u)
  const html = renderProjectManualHtml({ ...manual, markdown })
  assert.match(html, /唯一甲/u)
  assert.match(html, /唯一乙/u)
})

test('preview and offline HTML escape scripts and never load manuscript images', () => {
  const source = '# 标题\n\n<script>alert(1)</script>\n\n![外部图片](https://example.invalid/tracker)\n\n[危险](javascript:alert(1))'
  const preview = renderHelpSupplement(source)
  assert.doesNotMatch(preview, /<script|<img|href="javascript:/u)
  assert.match(preview, /&lt;script&gt;/u)
  assert.match(preview, /<h4>标题/u)
  assert.equal(normalizeSupplementMarkdown('```md\n# 原样代码\n```\n# 正文标题'), '```md\n# 原样代码\n```\n#### 正文标题')
  assert.doesNotMatch(renderProjectManualHtml({ title: '离线', markdown: source }), /<script|<img|href="javascript:/u)
})
