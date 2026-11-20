const HASH = /^[a-f0-9]{64}$/u;
const UUID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;

export function validateScenarioGeneration(value) {
  const keys = [
    "archiveSha256",
    "batchId",
    "completedAt",
    "fileCount",
    "id",
    "parametersFingerprint",
    "planDigest",
    "repositoryFingerprint",
    "schemaVersion",
    "sourceFingerprint",
    "startedAt",
    "status",
    "targetKey",
  ];
  if (
    !value ||
    JSON.stringify(Object.keys(value).sort()) !== JSON.stringify(keys) ||
    value.schemaVersion !== "plush.scenario-generation/v1" ||
    !UUID.test(value.id) ||
    !["local-development", "customer-trial-133"].includes(value.targetKey) ||
    !["running", "passed", "not_proven"].includes(value.status) ||
    !Number.isSafeInteger(value.fileCount) ||
    value.fileCount < 1 ||
    [
      "archiveSha256",
      "sourceFingerprint",
      "parametersFingerprint",
      "repositoryFingerprint",
      "planDigest",
    ].some((key) => !HASH.test(value[key])) ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value.startedAt) ||
    !Number.isFinite(Date.parse(value.startedAt)) ||
    value.batchId !==
      `${value.startedAt.replace(/[-:.]/gu, "")}_${value.sourceFingerprint.slice(0, 12)}` ||
    (value.status === "running"
      ? value.completedAt !== null
      : !Number.isFinite(Date.parse(value.completedAt)) ||
        Date.parse(value.completedAt) < Date.parse(value.startedAt))
  ) {
    throw new Error("scenario generation receipt is invalid");
  }
  return value;
}

export function assertScenarioGenerationId(id) {
  if (!UUID.test(String(id)))
    throw new Error("scenario generation id is invalid");
  return id;
}
