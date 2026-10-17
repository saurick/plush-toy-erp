import { Remarkable } from 'remarkable'
import { rewriteProjectManualLinks, getProjectManualDocuments } from '../config/projectManuals.mjs'
import { publishedSupplementFor, renderHelpSupplement, supplementMarkdown } from '../config/helpContributions.mjs'
import { extractMarkdownHeadings } from '../../common/components/markdown/anchors.mjs'
import {
  BUSINESS_HANDBOOK_TITLE,
  getBusinessHandbookIntroductions,
  getBusinessPageHandbookSections,
  renderBusinessHandbookMarkdown,
} from '../config/businessHandbook.mjs'

const escapeHtml = (value) =>
  String(value ?? '').replace(
    /[&<>"']/gu,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ]
  )

export function wrapHandbookHtml(title, content) {
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>
body{font:15px/1.8 system-ui,"Noto Sans SC","PingFang SC",sans-serif;color:#222;background:#fff;max-width:900px;margin:auto;padding:32px 24px;overflow-wrap:anywhere}h1,h2,h3{line-height:1.5}h1{font-size:28px}h2{font-size:22px;margin-top:36px;padding-bottom:8px;border-bottom:1px solid #ddd}h3{font-size:17px;margin-top:24px}a{color:#943363}p,li,dd{orphans:3;widows:3}dt{font-weight:600}dd{margin:4px 0 14px}.handbook-detail{display:grid;grid-template-columns:128px minmax(0,1fr);gap:14px;margin-bottom:12px;break-inside:avoid}.handbook-detail dd{margin:0}table{width:100%;border-collapse:collapse;font-size:14px}td,th{border:1px solid #ddd;padding:8px;text-align:left;vertical-align:top}pre{white-space:pre-wrap;background:#f5f5f5;padding:12px}code{font-size:13px}nav{columns:2;column-gap:32px}nav a{display:block;padding:3px 0}img{max-width:100%}@media(max-width:600px){body{padding:20px 16px}nav{columns:1}table{table-layout:fixed}td,th{padding:8px 6px}td:first-child,th:first-child{width:28%}.handbook-detail{grid-template-columns:minmax(0,1fr);gap:4px}}@page{size:A4;margin:18mm 16mm}@media print{body{font-size:14px;padding:0;max-width:none}h1{font-size:26px}h2{font-size:20px;break-before:auto;break-after:avoid}h3{font-size:16px;break-after:avoid}header+nav+article{break-before:page}table{font-size:12px}tr{break-inside:avoid}nav{columns:2}a{color:inherit;text-decoration:none}pre{font-size:12px}header p{font-size:12px}}
</style></head><body>${content}</body></html>`
}

export function renderBusinessHandbookHtml({ guides, pages, supplements = [] }) {
  const chapters = [
    ...getBusinessHandbookIntroductions(guides),
    ...pages.map((page) => ({
      id: page.key,
      title: page.title,
      sections: getBusinessPageHandbookSections(page),
    })),
  ]
  const anchor = (id) => escapeHtml(id.replaceAll(':', '-'))
  const supplementHtml = (id) => {
    const supplement = publishedSupplementFor(supplements, id)
    return supplement?.markdown?.trim() ? `<section><h3>企业补充</h3>${renderHelpSupplement(`发布人：${supplement.published_by} · ${supplement.published_at?.slice(0, 10) || ''}`)}${renderHelpSupplement(supplement.markdown)}</section>` : ''
  }
  return wrapHandbookHtml(
    BUSINESS_HANDBOOK_TITLE,
    `<header><h1>${BUSINESS_HANDBOOK_TITLE}</h1><p>当前可阅读范围的离线手册。内容与在线帮助共用来源；实际办理以当前发布版本、账号权限及业务状态为准。可使用浏览器查找、打印或保存为 PDF。</p></header><nav aria-label="目录">${chapters.map((c) => `<a href="#${anchor(c.id)}">${escapeHtml(c.title)}</a>`).join('')}</nav>${chapters
      .map(
        (c) =>
          `<article id="${anchor(c.id)}"><h2>${escapeHtml(c.title)}</h2>${c.sections.map((s) => `<section><h3>${escapeHtml(s.title)}</h3>${(s.paragraphs || []).map((p) => `<p>${escapeHtml(p)}</p>`).join('')}${s.steps?.length ? `<ol>${s.steps.map((text) => `<li>${escapeHtml(text)}</li>`).join('')}</ol>` : ''}${s.rows?.length ? `<dl>${s.rows.map(([label, text]) => `<div class="handbook-detail"><dt>${escapeHtml(label)}</dt><dd>${escapeHtml(text)}</dd></div>`).join('')}</dl>` : ''}</section>`).join('')}${supplementHtml(c.id)}</article>`
      )
      .join('')}`
  )
}

export function renderProjectManualHtml(manual) {
  const headings = extractMarkdownHeadings(manual.markdown, [1, 2, 3, 4, 5, 6])
  const markdown = new Remarkable({ html: false })
  markdown.renderer.rules.image = () => '[图片]'
  let ordinal = 0
  markdown.renderer.rules.heading_open = (tokens, index) =>
    `<h${tokens[index].hLevel} id="${escapeHtml(headings[ordinal++].id)}">`
  const contents = `<nav aria-label="目录">${headings
    .filter((heading) => heading.level === 2)
    .map((heading) => `<a href="#${escapeHtml(heading.id)}">${escapeHtml(heading.title)}</a>`)
    .join('')}</nav>`
  const body = markdown.render(rewriteProjectManualLinks(manual.markdown, []))
  return wrapHandbookHtml(manual.title, body.replace(/<h2\b/u, `${contents}<h2`))
}

export function downloadProjectManual({
  manual,
  guides,
  pages,
  format = 'html',
  supplements = [],
}) {
  const business = manual.key === 'business'
  const markdown = business
    ? renderBusinessHandbookMarkdown({ guides, pages, supplements })
    : renderProjectManualMarkdown(manual, supplements)
  const content =
    format === 'markdown'
      ? markdown
      : business
        ? renderBusinessHandbookHtml({ guides, pages, supplements })
        : renderProjectManualHtml({ ...manual, markdown })
  const extension = format === 'markdown' ? 'md' : 'html'
  const url = URL.createObjectURL(
    new Blob([content], {
      type:
        format === 'markdown'
          ? 'text/markdown;charset=utf-8'
          : 'text/html;charset=utf-8',
    })
  )
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `${manual.title}.${extension}`
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function renderProjectManualMarkdown(manual, supplements = []) {
  if (!supplements.length) return manual.markdown
  const lines = manual.markdown.split(/\r?\n/u)
  const tokens = new Remarkable().parse(manual.markdown, {})
  const starts = tokens.filter((token) => token.type === 'heading_open' && token.hLevel === 2).map((token) => token.lines[0])
  const documents = getProjectManualDocuments(manual)
  const inserts = documents.map((entry, index) => ({ at: starts[index] ?? lines.length, content: supplementMarkdown(publishedSupplementFor(supplements, entry.id)) })).filter((entry) => entry.content)
  for (const entry of inserts.reverse()) lines.splice(entry.at, 0, '', entry.content, '')
  return lines.join('\n')
}

export function downloadBusinessHandbook(options) {
  downloadProjectManual({
    ...options,
    manual: { key: 'business', title: BUSINESS_HANDBOOK_TITLE },
  })
}
