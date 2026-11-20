import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import test from 'node:test'
import assert from 'node:assert/strict'
import { Linter } from 'eslint'

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
  if (!source.includes(`<${componentName}`)) return []
  const blocks = []
  const messages = new Linter().verify(source, [{
    files: ['**/*.jsx'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { headers: { rules: { collect: { create() { return {
      JSXOpeningElement(node) {
        if (node.name.type === 'JSXIdentifier' && node.name.name === componentName) {
          blocks.push(node.attributes.filter((attribute) => attribute.type === 'JSXAttribute').map((attribute) => `${attribute.name.name}=`).join(' '))
        }
      },
    } } } } } },
    rules: { 'headers/collect': 'error' },
  }], { filename: 'component.jsx', allowInlineConfig: false })
  assert.deepEqual(messages, [], 'header contract must parse actual JSX')
  return blocks
}

test('header props are checked independently of child descriptions and inline JSX', () => {
  const source = '<BusinessFormPage title="表单" headerActions={<Button description="操作提示" />}><Attachment description="附件说明" /></BusinessFormPage>'
  assert.deepEqual(collectComponentOpenings(source, 'BusinessFormPage'), ['title= headerActions='])
  assert.deepEqual(collectComponentOpenings('<BusinessFormPage description="常驻介绍" />', 'BusinessFormPage'), ['description='])
})

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
    !/\b(?:stats|summary|description|tags)\b/u.test(pageHeaderSource),
    'PageHeaderCard 不应再接收统计、常驻介绍、标签或 summary'
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

test('businessPageHeader: 页面调用点不传统计、常驻介绍、标签或 summary', () => {
  const offenders = []

  for (const filePath of listSourceFiles(erpSourceRoot)) {
    const source = readFileSync(filePath, 'utf8')
    for (const block of collectComponentOpenings(source, 'PageHeaderCard')) {
      if (/\b(?:stats|summary|description|tags)\s*=/u.test(block)) {
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
