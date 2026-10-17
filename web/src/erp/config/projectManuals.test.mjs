import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  getProjectManualDocuments,
  rewriteProjectManualLinks,
  validateProjectManuals,
} from './projectManuals.mjs'
import { getHelpReadingCatalog, searchHelpDocuments } from './helpManualCatalog.mjs'
import { getRoleHelpGuidesForProfile } from './roleHelpContent.mjs'
import { renderProjectManualHtml } from '../utils/businessHandbookExport.mjs'

const manuals = JSON.parse(
  await readFile(
    new URL(
      '../../../../server/internal/projectmanuals/content.generated.json',
      import.meta.url
    ),
    'utf8'
  )
)

test('在线两册内容来自正式手册，按章节阅读与全文搜索不遗漏命令和表格', () => {
  assert.deepEqual(
    validateProjectManuals({ manuals }).map((book) => book.key),
    ['administration', 'operations']
  )
  const references = manuals.flatMap(getProjectManualDocuments)
  assert(
    references.some(
      (doc) => doc.title === '员工账号' && doc.markdown.includes('离职注销')
    )
  )
  assert(
    references.some(
      (doc) =>
        doc.title === '本地启动与重启' &&
        doc.markdown.includes('make dev_restart')
    )
  )
  assert(
    references.some((doc) => doc.markdown.includes('| 仓库根')) ||
      references.some((doc) => doc.markdown.includes('GIT_OPTIONAL_LOCKS=0'))
  )
  assert(
    searchHelpDocuments({ references }, '离职注销').every(
      (doc) => doc.manualKey === 'administration'
    )
  )
  assert(
    searchHelpDocuments({ references }, 'migrate_execute').some(
      (doc) => doc.manualKey === 'operations'
    )
  )
  assert.equal(new Set(references.map((doc) => doc.id)).size, references.length)
})

test('章节切分不把命令注释中的标题当成章节', () => {
  const docs = getProjectManualDocuments({
    key: 'operations',
    title: '手册',
    summary: '测试',
    markdown:
      '# 手册\n\n先读这里\n\n## 开始 / Start\n\n```sh\n## 这不是章节\n```\n\n## 下一步 / Next\n\n继续\n',
  })
  assert.deepEqual(
    docs.map((doc) => doc.title),
    ['使用说明', '开始', '下一步']
  )
  assert(docs[1].markdown.includes('## 这不是章节'))
})

test('受控正文响应拒绝未知书籍、重复或缺失内容，不默认为权限为空', () => {
  assert.deepEqual(validateProjectManuals({ manuals: [] }), [])
  for (const data of [
    {},
    { manuals: [manuals[0], manuals[0]] },
    { manuals: [{ ...manuals[0], key: 'arbitrary' }] },
    { manuals: [{ ...manuals[0], markdown: '' }] },
    { manuals: [{ ...manuals[0], source_hash: 'unknown' }] },
  ]) {
    assert.throws(
      () => validateProjectManuals(data),
      (error) => error.isInvalidResponse === true
    )
  }
})

test('在线跨册链接只指向可读手册，仓库专题不会形成无效文件请求', () => {
  const source =
    '[技术](技术维护与运维手册.md) [业务](业务使用手册.md#products) [权限](../product/配置与权限策略.md)'
  const restricted = rewriteProjectManualLinks(source, [
    'business',
    'administration',
  ])
  assert(!restricted.includes('book=operations'))
  assert(restricted.includes('book=business&ref=products'))
  assert(!restricted.includes('](../product/'))
  const full = rewriteProjectManualLinks(source, [
    'business',
    'administration',
    'operations',
  ])
  assert(full.includes('book=operations'))
  assert(!rewriteProjectManualLinks(source, []).includes('/erp/help-center'))
})

test('跨册链接核对实际章节范围，手机链接保留岗位入口和准确的小节', () => {
  const documents = manuals.flatMap(getProjectManualDocuments)
  const bossCatalog = getHelpReadingCatalog(
    getRoleHelpGuidesForProfile({ roles: [{ role_key: 'boss' }] })
  )
  const references = [...bossCatalog.references, ...documents]
  const source = '[产品](业务使用手册.md#products) [业务](业务使用手册.md) [员工](管理员与实施手册.md#员工账号--employee-accounts) [离职](管理员与实施手册.md#调岗临时停用与离职注销)'
  const text = rewriteProjectManualLinks(source, ['business', 'administration'], {
    references,
    helpPath: '/m/boss/handle/help-center',
  })
  assert(!text.includes('ref=products'))
  assert(text.includes('[业务](/m/boss/handle/help-center?'))
  assert(text.includes('ref=manual%3Aadministration%3Aemployee-accounts'))
  assert(text.includes(`#${encodeURIComponent('调岗临时停用与离职注销')}`))
  assert(!text.includes('](/erp/'))
  assert.equal(rewriteProjectManualLinks('[异常](业务使用手册.md#%E0%A4)', ['business'], { references }), '异常')
})

test('手册章名与使用说明键不冲突，同名章节仍有独立地址', () => {
  const documents = getProjectManualDocuments({
    key: 'operations',
    title: '手册',
    summary: '说明',
    markdown: '# 手册\n\n前言\n\n## 总览 / Overview\n\n第一章\n\n## 总览 / Overview\n\n第二章',
  })
  assert.equal(new Set(documents.map((document) => document.id)).size, 3)
})

test('两册离线 HTML 提供完整目录与真实锚点，正文安全且无需网络', () => {
  for (const manual of manuals) {
    const html = renderProjectManualHtml(manual)
    assert(html.includes('<nav aria-label="目录">'), manual.key)
    assert(!/<script|fetch\(|href="\/erp\//u.test(html), manual.key)
    const anchors = [...html.matchAll(/href="#([^"]+)"/gu)].map((match) => match[1])
    assert.equal(anchors.length, getProjectManualDocuments(manual).length - 1, manual.key)
    for (const anchor of anchors) assert(html.includes(`id="${anchor}"`), anchor)
    assert(html.includes(manual.key === 'operations' ? 'make migrate_execute' : '离职注销'))
  }
  const sample = renderProjectManualHtml({
    title: '手册', markdown: '# 手册\n\n## 小节\n\n<script>alert(1)</script>\n\n[跳转](#小节)',
  })
  assert(sample.includes('&lt;script&gt;'))
  assert(!sample.includes('<script>'))
})
