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

function collectPageHeaderBlocks(source) {
  const blocks = []
  const lines = source.split('\n')
  let current = null

  for (const line of lines) {
    if (!current && line.includes('<PageHeaderCard')) {
      current = [line]
      if (/\/>\s*$/u.test(line)) {
        blocks.push(current.join('\n'))
        current = null
      }
      continue
    }

    if (current) {
      current.push(line)
      if (/\/>\s*$/u.test(line)) {
        blocks.push(current.join('\n'))
        current = null
      }
    }
  }

  return blocks
}

test('businessPageHeader: 业务页头不再提供底部 summary 区域', () => {
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
    !/\bsummary\b/u.test(pageHeaderSource),
    'PageHeaderCard 不应再接收 summary'
  )
  assert(
    !pageHeaderSource.includes('erp-business-page-header-card__summary'),
    'PageHeaderCard 不应渲染页头底部 summary 容器'
  )
  assert(
    !pageHeaderSource.includes('erp-business-module-hero__footer'),
    'PageHeaderCard 不应保留页头底部 footer 区域'
  )
})

test('businessPageHeader: 页面调用点不得向 PageHeaderCard 传 summary', () => {
  const offenders = []

  for (const filePath of listSourceFiles(erpSourceRoot)) {
    const source = readFileSync(filePath, 'utf8')
    for (const block of collectPageHeaderBlocks(source)) {
      if (/\bsummary\s*=/u.test(block)) {
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
