import test from 'node:test'
import assert from 'node:assert/strict'
import { validateRetentionSummary } from './devRetentionSummary.mjs'
import {
  retainedBackupRows,
  versionRetention,
} from '../src/dev-workbench/config/devRetention.mjs'

const summary = () => ({
  schemaVersion: 'plush.retention-summary/v1',
  status: 'passed',
  generatedAt: '2026-10-23T10:00:00Z',
  retentionCount: 7,
  recordsRetained: true,
  versions: [
    {
      gitSha: 'a'.repeat(40),
      state: 'cleaned',
      reasons: [],
      cleanedAt: '2026-10-23T09:00:00Z',
    },
  ],
  backups: ['demo', 'test', 'erp', 'gitlab'].map((environment) => ({
    id: `${environment}:backup`,
    name: 'backup-20261023',
    environment,
    location: '服务端',
    createdAt: '2026-10-23T08:00:00Z',
    sizeBytes: 128,
    state: 'protected',
    reasons: ['升级前恢复点'],
    cleanedAt: null,
  })),
})

test('retention readback preserves all four isolated backup sources and cleaned version records', () => {
  const value = validateRetentionSummary(summary())
  for (const environment of ['demo', 'test', 'erp', 'gitlab']) {
    const rows = retainedBackupRows(value, environment)
    assert.equal(rows.length, 1)
    assert.equal(rows[0].environment, environment)
  }
  assert.equal(
    versionRetention({ gitSha: 'a'.repeat(40) }, { retention: value }).state,
    'cleaned'
  )
  assert.equal(
    versionRetention({ gitSha: 'b'.repeat(40) }, { retention: value }),
    null
  )
})

test('unknown or malformed retention evidence cannot appear as a usable recovery point', () => {
  for (const edit of [
    (v) => {
      v.retentionCount = 6
    },
    (v) => {
      v.backups[0].environment = 'all'
    },
    (v) => {
      v.versions[0].state = 'restorable'
    },
    (v) => {
      v.backups[0].sizeBytes = -1
    },
    (v) => {
      v.backups[0].name = '/private/backup'
    },
    (v) => {
      v.versions.push(v.versions[0])
    },
  ]) {
    const value = summary()
    edit(value)
    assert.throws(() => validateRetentionSummary(value))
  }
  assert.deepEqual(retainedBackupRows(null, 'demo'), [])
})
