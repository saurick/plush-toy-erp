const caseDefinition = (id, lane, scenarioCount, name) =>
  Object.freeze({ id, lane, scenarioCount, name });

export const BOOTSTRAP_PRODUCTION_ADMIN_TEST_CASES = Object.freeze([
  caseDefinition(
    "release-root",
    "contract",
    1,
    "bootstrap resolves its release root independently of the caller cwd",
  ),
  caseDefinition(
    "success-receipt",
    "runtime",
    1,
    "bootstrap production admin uses one secret-safe one-shot and reads back all evidence",
  ),
  caseDefinition(
    "gnu-stat",
    "contract",
    1,
    "bootstrap production admin reads scalar mode and owner with GNU stat semantics",
  ),
  caseDefinition(
    "bsd-stat",
    "contract",
    1,
    "bootstrap production admin falls back to scalar BSD stat semantics",
  ),
  caseDefinition(
    "demo-target-contract",
    "contract",
    1,
    "bootstrap production admin binds the demo-133 override, lock and all Compose calls",
  ),
  caseDefinition(
    "customer-test-contract",
    "contract",
    1,
    "bootstrap production admin binds the isolated customer-test-133 contract",
  ),
  caseDefinition(
    "demo-target-drift",
    "contract",
    13,
    "bootstrap production admin rejects every drift from the exact demo-133 data, lock and Jaeger contract",
  ),
  caseDefinition(
    "compose-override-scope",
    "contract",
    2,
    "bootstrap production admin rejects missing or out-of-scope Compose overrides before docker",
  ),
  caseDefinition(
    "compose-database-serialization",
    "runtime",
    2,
    "bootstrap production admin serializes the same Compose project and database before docker",
  ),
  caseDefinition(
    "alternate-target-lock-root",
    "contract",
    1,
    "bootstrap production admin rejects an alternate registered-target lock root before Docker",
  ),
  caseDefinition(
    "advisory-lock-busy",
    "runtime",
    2,
    "bootstrap production admin rejects busy or abnormal PostgreSQL advisory locks before one-shot",
  ),
  caseDefinition(
    "stale-file-lock",
    "runtime",
    1,
    "bootstrap production admin preserves an existing lock as stale evidence",
  ),
  caseDefinition(
    "post-lock-failure-release",
    "runtime",
    1,
    "bootstrap production admin releases its lock after a post-lock failure",
  ),
  caseDefinition(
    "acquired-lock-token",
    "runtime",
    1,
    "bootstrap production admin only releases the lock token it acquired",
  ),
  caseDefinition(
    "private-lock-parent",
    "contract",
    1,
    "bootstrap production admin rejects a non-private lock parent before docker",
  ),
  caseDefinition(
    "shared-temp-lock-root",
    "contract",
    3,
    "bootstrap production admin rejects shared temporary lock roots before docker",
  ),
  caseDefinition(
    "secret-validation",
    "contract",
    3,
    "bootstrap production admin rejects missing, local-default and weak secrets before docker",
  ),
  caseDefinition(
    "postgres-dsn",
    "contract",
    8,
    "bootstrap production admin accepts only one exact internal PostgreSQL DSN before docker",
  ),
  caseDefinition(
    "steady-password-window",
    "contract",
    2,
    "bootstrap production admin rejects password persistence and an open once window in steady env",
  ),
  caseDefinition(
    "confirmation-release-binding",
    "contract",
    4,
    "bootstrap production admin binds confirmation, database, migration and image release",
  ),
  caseDefinition(
    "postgres-container-identity",
    "contract",
    2,
    "bootstrap production admin rejects the wrong PostgreSQL Compose label or container name before DB writes",
  ),
  caseDefinition(
    "one-shot-identity-cleanup",
    "runtime",
    7,
    "bootstrap production admin never accepts or cleans a one-shot with mismatched CID, name, labels, image or operation",
  ),
  caseDefinition(
    "infrastructure-schema-blockers",
    "contract",
    4,
    "bootstrap production admin fails before writes on infrastructure and schema blockers",
  ),
  caseDefinition(
    "existing-marker-username",
    "contract",
    2,
    "bootstrap production admin refuses a preexisting marker or username without starting a container",
  ),
  caseDefinition(
    "committed-evidence-mismatch",
    "runtime",
    6,
    "bootstrap production admin treats committed evidence mismatches as non-retryable",
  ),
  caseDefinition(
    "early-exit-cleanup",
    "runtime",
    1,
    "bootstrap production admin cleans an early-exit container and never reports committed",
  ),
  caseDefinition(
    "timeout-cleanup",
    "runtime",
    1,
    "bootstrap production admin times out fail-closed and removes the one-shot",
  ),
  caseDefinition(
    "invalid-cid-recovery",
    "runtime",
    1,
    "bootstrap production admin recovers an invalid cid only through the unique random operation label",
  ),
  caseDefinition(
    "random-operation-discovery",
    "runtime",
    2,
    "bootstrap production admin retains locks when random-operation discovery fails or is non-unique",
  ),
  caseDefinition(
    "compose-failure-unverified-container",
    "runtime",
    1,
    "bootstrap production admin retains locks when a failed compose run has no verified container",
  ),
  caseDefinition(
    "cleanup-failure-receipt",
    "runtime",
    1,
    "bootstrap production admin reports committed but not ready when container cleanup fails",
  ),
  caseDefinition(
    "disappeared-rm-container",
    "runtime",
    1,
    "bootstrap production admin accepts an already verified --rm container disappearing during cleanup",
  ),
  caseDefinition(
    "inspect-failure",
    "runtime",
    1,
    "bootstrap production admin does not confuse Docker inspect failure with verified absence",
  ),
  caseDefinition(
    "advisory-release-failure",
    "runtime",
    1,
    "bootstrap production admin retains the file lock when PostgreSQL cannot prove advisory release",
  ),
  caseDefinition(
    "env-snapshot-drift",
    "runtime",
    1,
    "bootstrap production admin pins a private env snapshot and detects steady env drift",
  ),
  caseDefinition(
    "compose-password-mapping",
    "contract",
    1,
    "bootstrap production admin rejects a steady Compose password mapping",
  ),
  caseDefinition(
    "env-file-permissions",
    "contract",
    2,
    "bootstrap production admin rejects permissive or symlinked env files",
  ),
  caseDefinition(
    "host-target-overrides",
    "contract",
    1,
    "bootstrap production admin rejects host target overrides",
  ),
  caseDefinition(
    "one-shot-source-contract",
    "contract",
    0,
    "bootstrap production admin script keeps the compose one-shot fail-closed",
  ),
]);

const casesById = new Map(
  BOOTSTRAP_PRODUCTION_ADMIN_TEST_CASES.map((definition) => [
    definition.id,
    definition,
  ]),
);

export function bootstrapProductionAdminTestCase(id) {
  const definition = casesById.get(id);
  if (!definition) {
    throw new Error(`unknown bootstrap production admin test id: ${id}`);
  }
  return definition;
}

export function bootstrapProductionAdminTestLaneCases(lane) {
  const cases = BOOTSTRAP_PRODUCTION_ADMIN_TEST_CASES.filter(
    (definition) => definition.lane === lane,
  );
  if (cases.length === 0) {
    throw new Error(
      `unknown or empty bootstrap production admin lane: ${lane}`,
    );
  }
  return Object.freeze(cases);
}
