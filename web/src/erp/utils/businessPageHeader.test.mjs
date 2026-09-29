import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'

const erpSourceRoot = resolve(new URL('../', import.meta.url).pathname)

function listSourceFiles(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const filePath = join(directory, entry)
    const stat = statSync(filePath)
    if (stat.isDirectory()) {
      return listSourceFiles(filePath)
    }
    return /\.(jsx|js|mjs|css)$/u.test(filePath) && !/\.test\./u.test(filePath)
      ? [filePath]
      : []
  })
}

function collectComponentOpenings(source, componentName) {
  const blocks = []
  const lines = source.split('\n')
  let current = null

  for (const line of lines) {
    if (!current && line.includes(`<${componentName}`)) {
      current = [line]
      if (/\/>\s*$/u.test(line)) {
        blocks.push(current.join('\n'))
        current = null
      }
      continue
    }

    if (current) {
      current.push(line)
      if (/^\s*\/?>\s*$/u.test(line)) {
        blocks.push(current.join('\n'))
        current = null
      }
    }
  }

  return blocks
}

test('businessPageHeader: 业务页头不提供常驻介绍、标签或底部 summary 区域', () => {
  const layoutPath = resolve(
    erpSourceRoot,
    'components/business-list/BusinessListLayout.jsx'
  )
  const layoutSource = readFileSync(layoutPath, 'utf8')
  const pageHeaderSource = layoutSource.slice(
    layoutSource.indexOf('export function PageHeaderCard'),
    layoutSource.indexOf('export function BusinessFilterPanel')
  )

  assert(
    !/\b(?:summary|description|tags)\b/u.test(pageHeaderSource),
    'PageHeaderCard 不应再接收常驻介绍、标签或 summary'
  )
  assert(
    !pageHeaderSource.includes('erp-business-page-header-card__summary'),
    'PageHeaderCard 不应渲染页头底部 summary 容器'
  )
  assert(
    !pageHeaderSource.includes('erp-business-module-hero__footer'),
    'PageHeaderCard 不应保留页头底部 footer 区域'
  )
  assert(
    !pageHeaderSource.includes('erp-business-page-header-card__tags'),
    'PageHeaderCard 不应保留静态标签容器'
  )
})

test('businessPageHeader: 共享页头只渲染规范化后的非负整数统计', () => {
  const layoutPath = resolve(
    erpSourceRoot,
    'components/business-list/BusinessListLayout.jsx'
  )
  const layoutSource = readFileSync(layoutPath, 'utf8')
  const pageHeaderSource = layoutSource.slice(
    layoutSource.indexOf('export function PageHeaderCard'),
    layoutSource.indexOf('export function BusinessFilterPanel')
  )

  assert.match(
    layoutSource,
    /import \{ normalizeBusinessPageHeaderStats \} from '\.\.\/\.\.\/utils\/businessPageHeader\.mjs'/u
  )
  assert.match(
    pageHeaderSource,
    /const numericStats = normalizeBusinessPageHeaderStats\(stats\)/u
  )
  assert.match(pageHeaderSource, /\{numericStats\.map\(\(item\) =>/u)
  assert.doesNotMatch(pageHeaderSource, /\{stats\.map\(\(item\) =>/u)
})

test('businessPageHeader: 页面调用点不传常驻介绍、标签或 summary', () => {
  const offenders = []

  for (const filePath of listSourceFiles(erpSourceRoot)) {
    const source = readFileSync(filePath, 'utf8')
    for (const block of collectComponentOpenings(source, 'PageHeaderCard')) {
      if (/\b(?:summary|description|tags)\s*=/u.test(block)) {
        offenders.push(relative(erpSourceRoot, filePath))
      }
    }
  }

  assert.deepEqual(offenders, [])
})

test('businessFormHeader: 整页表单标题区不提供常驻介绍', () => {
  const formPagePath = resolve(
    erpSourceRoot,
    'components/business-list/BusinessFormPage.jsx'
  )
  const formPageSource = readFileSync(formPagePath, 'utf8')
  const headerStart = formPageSource.indexOf(
    '<header className="erp-business-form-page__header">'
  )
  const headerEnd = formPageSource.indexOf('</header>', headerStart)
  assert.ok(headerStart >= 0 && headerEnd > headerStart)
  const headerSource = formPageSource.slice(headerStart, headerEnd)

  assert.doesNotMatch(formPageSource, /^\s*description,\s*$/mu)
  assert.doesNotMatch(headerSource, /<p\b/u)

  const offenders = []
  for (const filePath of listSourceFiles(erpSourceRoot)) {
    const source = readFileSync(filePath, 'utf8')
    for (const block of collectComponentOpenings(source, 'BusinessFormPage')) {
      if (/\bdescription\s*=/u.test(block)) {
        offenders.push(relative(erpSourceRoot, filePath))
      }
    }
  }

  assert.deepEqual(offenders, [])
})

test('businessPageHeader: 不保留页头 summary 视觉样式', () => {
  const offenders = listSourceFiles(erpSourceRoot).filter((filePath) => {
    const source = readFileSync(filePath, 'utf8')
    return (
      source.includes('erp-business-page-header-card__summary') ||
      source.includes('erp-business-module-hero__footer')
    )
  })

  assert.deepEqual(
    offenders.map((filePath) => relative(erpSourceRoot, filePath)),
    []
  )
})
