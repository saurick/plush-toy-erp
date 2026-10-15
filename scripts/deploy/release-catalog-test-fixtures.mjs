export function releaseManifestStrictEvidenceFixture({
  fingerprint = "d".repeat(64),
  receiptSha256 = "e".repeat(64),
} = {}) {
  return {
    contract: "plush.exact-sha-strict/v2",
    profile: "strict",
    status: "passed",
    fingerprint,
    receiptSha256,
    provenance: {
      source: "github-actions",
      repository: "saurick/plush-toy-erp",
      workflowRef:
        "saurick/plush-toy-erp/.github/workflows/release.yml@refs/heads/main",
      runId: "123",
      runAttempt: "1",
      job: "strict",
    },
  };
}

export function releaseManifestV2Fixture({
  gitSha,
  version,
  artifactSha256,
  receiptSha256,
}) {
  const strict = releaseManifestStrictEvidenceFixture();
  const counts = { executed: 1, passed: 1, failed: 0, skipped: 0 };
  const runtime = {
    serverHealth: "passed",
    serverReady: "passed",
    webHealth: "passed",
    webRoot: "passed",
    runtimeIdentity: "passed",
    authenticatedAdmin: "passed",
    embeddedGitSha: gitSha,
  };
  return {
    schemaVersion: "plush.release-manifest/v2",
    passed: true,
    version,
    gitSha,
    strict: {
      ...strict,
      contract: "plush.exact-sha-strict/v3",
      identity: {
        repository: "saurick/plush-toy-erp",
        gitSha,
        sourceArchiveSha256: "e".repeat(64),
        policyFingerprint: strict.fingerprint,
        workflowFingerprint: "8".repeat(64),
        toolchainFingerprint: "9".repeat(64),
        migrationSequenceSha256: "f".repeat(64),
        dependencyLockFingerprint: "a".repeat(64),
        customerConfigFingerprint: "1".repeat(64),
      },
      checks: Object.fromEntries(
        ["web", "server", "database", "browser", "security"].map((key) => [
          key,
          counts,
        ]),
      ),
      timeSensitiveChecks: {
        vulnerabilityDatabase: {
          status: "passed",
          checkedAt: "2026-08-29T00:00:00.000Z",
          validUntil: "2026-08-30T00:00:00.000Z",
        },
      },
      provenance: {
        source: "gitlab-ci",
        repository: "saurick/plush-toy-erp",
        workflowRef: "saurick/plush-toy-erp/.gitlab-ci.yml@refs/heads/main",
        runId: "123",
        runAttempt: "1",
        job: "quality_aggregate",
        eventName: "push",
        ref: "refs/heads/main",
        refName: "main",
        headRepository: "saurick/plush-toy-erp",
        conclusion: "success",
      },
    },
    artifact: {
      schemaVersion: "plush-release-artifact/v1",
      manifestSha256: artifactSha256,
      sourceArchiveSha256: "e".repeat(64),
    },
    migration: {
      latest: "20260729000000",
      sequenceSha256: "f".repeat(64),
    },
    customerConfig: { sourceSha256: "1".repeat(64) },
    sbom: { sha256: "7".repeat(64) },
    images: [
      {
        kind: "server",
        repository: "ghcr.io/saurick/plush-toy-erp-server",
        digest: `sha256:${"2".repeat(64)}`,
        ref: `ghcr.io/saurick/plush-toy-erp-server@sha256:${"2".repeat(64)}`,
        sourceContentId: `sha256:${"3".repeat(64)}`,
        platform: "linux/amd64",
      },
      {
        kind: "web",
        repository: "ghcr.io/saurick/plush-toy-erp-web",
        digest: `sha256:${"4".repeat(64)}`,
        ref: `ghcr.io/saurick/plush-toy-erp-web@sha256:${"4".repeat(64)}`,
        sourceContentId: `sha256:${"5".repeat(64)}`,
        platform: "linux/amd64",
      },
    ],
    rehearsal: {
      contract: "plush-local-release-rehearsal/v1",
      status: "passed",
      receiptSha256,
      generatedAt: "2026-08-29T01:00:00.000Z",
      finishedAt: "2026-08-29T01:05:00.000Z",
      gitSha,
      artifact: {
        manifestSchema: "plush-release-artifact/v1",
        serverContentId: `sha256:${"3".repeat(64)}`,
        webContentId: `sha256:${"5".repeat(64)}`,
        migrationSequenceSha256: "f".repeat(64),
        sbomSha256: "7".repeat(64),
      },
      environment: {
        kind: "local-isolated-release-compose",
        composeSource: "server/deploy/compose/prod/compose.yml",
        databaseIdentityBound: true,
      },
      migration: {
        latest: "20260729000000",
        sequenceSha256: "f".repeat(64),
        directoryValidation: "passed",
        dryRun: "passed",
        apply: "passed",
        readback: "passed",
      },
      runtime: { initial: runtime, steadyStateRestart: runtime },
      backupRestore: {
        status: "passed",
        backupSha256: "b".repeat(64),
        backupSizeBytes: 1024,
        dumpRetained: false,
      },
      recoveryRestart: {
        status: "passed",
        bootstrapSecretRemoved: true,
        sameServerContentId: true,
        sameWebContentId: true,
        healthReadyAndLoginRecovered: true,
        customerConfigRecovered: true,
      },
      cleanup: {
        attempted: true,
        passed: true,
        residualContainers: 0,
        temporaryDatabaseRetained: false,
      },
      redaction: {
        containsSecrets: false,
        containsCredentials: false,
        containsFullDsn: false,
        containsAbsoluteWorkspacePaths: false,
        containsRawCustomerRows: false,
      },
    },
    rollback: {
      targetRollbackPointRequiredBeforePromotion: true,
      databaseDownMigrationAutomatic: false,
    },
    redaction: {
      containsSecrets: false,
      containsCredentials: false,
      containsAbsoluteWorkspacePaths: false,
    },
  };
}
