import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { readLatestBackupRestoreEvidence } from './devRecoveryEvidence.mjs'

const SHA = 'a'.repeat(40)
const report = () => ({
  schemaVersion: 'plush.backup-set-restore/v1',
  status: 'passed',
  backupId: 'plush-set-20261022T000000Z-11111111-1111-4111-8111-111111111111',
  releaseSha: SHA,
  project: 'plush-toy-erp-demo-v1',
  sourceKind: 'offsite-backup-set',
  encryptedSha256: 'b'.repeat(64),
  attachmentRowsSha256: 'c'.repeat(64),
  backupAgeSeconds: 300,
  maxBackupAgeSeconds: 129600,
  migrationVersion: '20261017094049',
  attachmentCount: 2,
  attachmentBytes: 1234,
  publicTableCount: 79,
  startedAt: '2026-10-22T00:00:00Z',
  checkedAt: '2026-10-22T00:03:00Z',
  restoreTarget: 'temporary-postgres-and-s3-removed',
  businessSmoke: 'not-run',
})
const keys = [
  'health',
  'ready',
  'login',
  'customer-config',
  'units',
  'sales-orders',
  'attachment-download',
  'logout',
]
function setup(t, value) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plush-recovery-'))
  t.after(() => fs.rmSync(root, { recursive: true, force: true }))
  const dir = path.join(
    root,
    'output/customers/yoyoosun/backup-restore-rehearsal/current'
  )
  fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'backup-set-restore-report.json'),
    JSON.stringify(value)
  )
  return {
    projectRoot: root,
    target: 'demo-133',
    customer: 'yoyoosun',
    environment: 'customer-trial-133',
  }
}
test('paired restore evidence preserves its partial business coverage and strips private fields', (t) => {
  const value = report()
  value.privateDiagnostic = 'must not be projected'
  const receipt = readLatestBackupRestoreEvidence(setup(t, value))
  assert.equal(receipt.coverage, 'database-and-attachments')
  assert.equal(receipt.businessSmoke, 'not-run')
  assert.equal(receipt.attachmentCount, 2)
  assert.equal(receipt.privateDiagnostic, undefined)
  assert.equal(receipt.backupSizeBytes, undefined)
})
test('paired recovery only accepts complete business checks bound to the same backup and release', (t) => {
  const value = report()
  value.businessSmoke = {
    status: 'passed',
    releaseSha: SHA,
    backupId: value.backupId,
    responseBodiesStored: false,
    checks: keys.map((key) => ({ key, status: 'passed' })),
  }
  assert.equal(
    readLatestBackupRestoreEvidence(setup(t, value)).businessSmoke,
    'passed'
  )
  for (const mutation of [
    (v) => {
      v.businessSmoke.backupId = 'another'
    },
    (v) => {
      v.businessSmoke.checks.pop()
    },
    (v) => {
      v.businessSmoke.checks = {}
    },
    (v) => {
      v.businessSmoke.checks[0] = null
    },
    (v) => {
      v.maxBackupAgeSeconds = 169 * 3600
    },
    (v) => {
      v.businessSmoke.checks[0].status = 'failed'
    },
    (v) => {
      v.businessSmoke.responseBodiesStored = true
    },
    (v) => {
      v.project = 'plush-toy-erp-production'
    },
    (v) => {
      v.restoreTarget = 'new-isolated-resources-retained'
    },
    (v) => {
      v.status = 'failed'
    },
    (v) => {
      v.checkedAt = '2099-01-01T00:00:00Z'
    },
    (v) => {
      v.attachmentBytes = 0
    },
  ]) {
    const bad = structuredClone(value)
    mutation(bad)
    assert.equal(readLatestBackupRestoreEvidence(setup(t, bad)), null)
  }
})
