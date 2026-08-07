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
