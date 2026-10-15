import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

import {
  canActivateBOM,
  canArchiveBOM,
  canCopyBOM,
  canEditBOM,
  canRequestBOMArchive,
  runBOMArchiveBatch,
} from './bomLifecycle.mjs'

test('BOM lifecycle actions match the backend transition contract', () => {
  assert.deepEqual(
    ['DRAFT', 'ACTIVE', 'ARCHIVED', 'DISABLED', 'UNKNOWN'].map((status) => ({
      status,
      activate: canActivateBOM(status),
      archive: canArchiveBOM(status),
      copy: canCopyBOM(status),
      edit: canEditBOM(status),
      archiveRequest: canRequestBOMArchive(status),
    })),
    [
      {
        status: 'DRAFT',
        activate: true,
        archive: true,
        copy: true,
        edit: true,
        archiveRequest: true,
      },
      {
        status: 'ACTIVE',
        activate: false,
        archive: true,
        copy: true,
        edit: false,
        archiveRequest: true,
      },
      {
        status: 'ARCHIVED',
        activate: true,
        archive: false,
        copy: true,
        edit: false,
        archiveRequest: true,
      },
      {
        status: 'DISABLED',
        activate: false,
        archive: false,
        copy: false,
        edit: false,
        archiveRequest: false,
      },
      {
        status: 'UNKNOWN',
        activate: false,
        archive: false,
        copy: false,
        edit: false,
        archiveRequest: false,
      },
    ]
  )
})

test('BOM visible status choices only expose the current lifecycle', () => {
  const columnsSource = readFileSync(
    new URL('./BOMVersionColumns.jsx', import.meta.url),
    'utf8'
  )
  const pageSource = readFileSync(
    new URL('../../pages/BOMVersionsPage.jsx', import.meta.url),
    'utf8'
  )

  assert.doesNotMatch(columnsSource, /['"]DISABLED['"]/u)
  assert.doesNotMatch(pageSource, /['"]DISABLED['"]/u)
})

test('BOM archive batch runs sequentially and refreshes after success', async () => {
  const calls = []
  const result = await runBOMArchiveBatch({
    records: [{ id: 1 }, { id: 2 }],
    archive: async (record) => calls.push(`archive:${record.id}`),
    refresh: async () => {
      calls.push('refresh')
      return true
    },
  })

  assert.deepEqual(calls, ['archive:1', 'archive:2', 'refresh'])
  assert.deepEqual(result, {
    archivedCount: 2,
    archiveError: null,
    refreshError: null,
  })
})

test('BOM archive batch preserves a later archive error and refreshes partial success', async () => {
  const archiveError = new Error('second archive failed')
  const calls = []
  const result = await runBOMArchiveBatch({
    records: [{ id: 1 }, { id: 2 }, { id: 3 }],
    archive: async (record) => {
      calls.push(`archive:${record.id}`)
      if (record.id === 2) throw archiveError
    },
    refresh: async () => {
      calls.push('refresh')
      return true
    },
  })

  assert.deepEqual(calls, ['archive:1', 'archive:2', 'refresh'])
  assert.equal(result.archivedCount, 1)
  assert.equal(result.archiveError, archiveError)
  assert.equal(result.refreshError, null)
})

test('BOM archive batch refreshes when the first result is unknown', async () => {
  const archiveError = new Error('network response lost')
  let refreshCalls = 0
  const result = await runBOMArchiveBatch({
    records: [{ id: 1 }, { id: 2 }],
    archive: async () => {
      throw archiveError
    },
    refresh: async () => {
      refreshCalls += 1
      return true
    },
  })

  assert.equal(refreshCalls, 1)
  assert.equal(result.archivedCount, 0)
  assert.equal(result.archiveError, archiveError)
  assert.equal(result.refreshError, null)
})

test('BOM archive batch keeps refresh failure separate from the archive error', async () => {
  const archiveError = new Error('archive failed')
  const refreshError = new Error('refresh failed')
  const result = await runBOMArchiveBatch({
    records: [{ id: 1 }],
    archive: async () => {
      throw archiveError
    },
    refresh: async () => {
      throw refreshError
    },
  })

  assert.equal(result.archiveError, archiveError)
  assert.equal(result.refreshError, refreshError)
})

test('BOM archive batch records a handled refresh failure without false success', async () => {
  const result = await runBOMArchiveBatch({
    records: [{ id: 1 }],
    archive: async () => {},
    refresh: async () => false,
  })

  assert.equal(result.archivedCount, 1)
  assert.equal(result.archiveError, null)
  assert(result.refreshError instanceof Error)
})
