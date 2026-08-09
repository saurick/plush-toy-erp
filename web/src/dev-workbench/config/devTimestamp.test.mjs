import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  formatDevTimestamp,
  isDevTimestamp,
  normalizeDevTimestamp,
} from './devTimestamp.mjs'

test('dev timestamp keeps timezone-bearing ISO identity and complete local time', () => {
  const timestamp = normalizeDevTimestamp('2026-08-09T12:26:46+08:00')
  assert.equal(timestamp.dateTime, '2026-08-09T12:26:46+08:00')
  assert.match(timestamp.label, /\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}/u)
  assert.equal(
    formatDevTimestamp('missing', { missing: '完成时间未证明' }),
    '完成时间未证明'
  )
})

test('dev timestamp accepts explicit Unix seconds without guessing units', () => {
  const timestamp = normalizeDevTimestamp(1786249600, {
    unit: 'unix-seconds',
  })
  assert.equal(timestamp.dateTime, '2026-08-09T04:26:40.000Z')
  assert.equal(isDevTimestamp(1786249600, { unit: 'unix-seconds' }), true)
  assert.equal(isDevTimestamp(1786249600000, { unit: 'unix-seconds' }), false)
  assert.equal(isDevTimestamp('1786249600', { unit: 'unix-seconds' }), false)
})

test('dev timestamp fails closed for ambiguous or timezone-free values', () => {
  for (const value of [
    '',
    null,
    '2026-08-09',
    '2026-08-09T12:26:46',
    'not-a-date',
  ]) {
    assert.equal(isDevTimestamp(value), false)
  }
})

test('workbench runtime evidence pages use semantic source-backed timestamps', () => {
  const contracts = [
    ['../components/DevReceiptPanel.jsx', ['receipt.finishedAt']],
    [
      '../pages/DevQualityGatesPage.jsx',
      ['summary?.generatedAt', 'operation.createdAt', 'stage.startedAt'],
    ],
    [
      '../pages/DevTestingPage.jsx',
      ['plan.generatedAt', 'operation?.createdAt', 'report.generatedAt'],
    ],
    [
      '../pages/DevDataPreparationPage.jsx',
      ['summary?.generatedAt', 'operation.createdAt', 'event.at'],
    ],
    [
      '../pages/DevDatabaseMigrationPage.jsx',
      [
        'operationDetail.createdAt',
        'operationDetail.plan.preparedAt',
        'event.at',
      ],
    ],
    [
      '../pages/DevCustomerConfigPage.jsx',
      [
        'result.generatedAt',
        'result.manifestGeneratedAt',
        'publish.published_at',
      ],
    ],
  ]

  for (const [relativePath, evidence] of contracts) {
    const source = readFileSync(new URL(relativePath, import.meta.url), 'utf8')
    assert.match(
      source,
      /DevTimestamp/u,
      `${relativePath} must use DevTimestamp`
    )
    for (const value of evidence) {
      assert.match(
        source,
        new RegExp(value.replaceAll(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'),
        `${relativePath} must expose ${value}`
      )
    }
  }
})
