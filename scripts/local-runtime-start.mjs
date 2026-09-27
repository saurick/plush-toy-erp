#!/usr/bin/env node
import path from "node:path";
import { randomUUID } from "node:crypto";
import { buildRuntimeBundle } from "./local-runtime-bundle.mjs";
import { checkLocalDatabaseMigrations } from "./local-runtime-preflight.mjs";
import { loadDevPorts } from "./dev-ports.mjs";
import {
  createDevDatabaseMigrationRuntime,
  executeCommand,
} from "../web/dev-server/devDatabaseMigrationRuntime.mjs";
import {
  acquireDatabaseMigrationExecutionLock,
  releaseDatabaseMigrationExecutionLock,
  resolveDatabaseMigrationOperationStore,
} from "./qa/dev-database-migration-operation-store.mjs";

export async function startWorkspaceRuntime(
  root,
  {
    preflight = checkLocalDatabaseMigrations,
    build = buildRuntimeBundle,
    execute = executeCommand,
    progress = (message) => console.log(`[local-runtime] ${message}`),
    createRuntime = createDevDatabaseMigrationRuntime,
    ports = loadDevPorts,
  } = {},
) {
  const operationId = randomUUID();
  const store = resolveDatabaseMigrationOperationStore(root);
  acquireDatabaseMigrationExecutionLock(store, operationId);
  try {
    // Pending migrations and failed builds must leave the running backend intact.
    await preflight();
    const candidate = await build(root, operationId, execute, progress);
    const runtime = createRuntime(root, `http://127.0.0.1:${ports(root).http}`);
    const result = await runtime.restart(operationId, candidate.id);
    return { ...result, sourceFingerprint: candidate.sourceFingerprint };
  } finally {
    releaseDatabaseMigrationExecutionLock(store, operationId);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  startWorkspaceRuntime(path.resolve(import.meta.dirname, ".."))
    .then((result) => {
      console.log(
        `[local-runtime] started workspace-source=${result.sourceFingerprint} bundle=${result.bundleId} migration=${result.activeVersion} health=passed ready=passed business=passed`,
      );
    })
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
