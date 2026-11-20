#!/usr/bin/env node
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  readAllDeliveryOperations,
  consumeDeliveryOperationStore,
  DELIVERY_OPERATION_TERMINAL_STATUSES,
} from "./delivery-operation-store.mjs";
import {
  createGitlabDeploymentClient,
  createGitlabDeploymentRecorder,
} from "./gitlab-deployment-records.mjs";
import {
  resolveGitlabReleaseCredential,
  verifyGitlabReleaseCredential,
} from "./gitlab-release-cli.mjs";

export async function runDeploymentRecordsCLI(
  argv,
  {
    root = process.cwd(),
    resolveCredential = resolveGitlabReleaseCredential,
    verifyCredential = verifyGitlabReleaseCredential,
    createClient = createGitlabDeploymentClient,
    write = console.log,
  } = {},
) {
  const [command = "plan", ...args] = argv;
  if (!["plan", "sync", "verify", "reconcile"].includes(command))
    throw new Error(
      "use plan, sync --execute, verify, or reconcile --execute --operation-id <uuid> --deployment-id <id>",
    );
  const options = {};
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] === "--execute") options.execute = true;
    else if (
      ["--operation-id", "--deployment-id"].includes(args[i]) &&
      args[i + 1]
    )
      options[args[i].slice(2)] = args[++i];
    else throw new Error("unsupported deployment records argument");
  }
  const store = consumeDeliveryOperationStore(root);
  const operations = readAllDeliveryOperations(store)
    .filter(
      (x) =>
        (command === "reconcile" ||
          DELIVERY_OPERATION_TERMINAL_STATUSES.includes(x.status)) &&
        (!options["operation-id"] || x.id === options["operation-id"]),
    )
    .sort(
      (a, b) =>
        a.updatedAt.localeCompare(b.updatedAt) || a.id.localeCompare(b.id),
    );
  if (options["operation-id"] && operations.length !== 1)
    throw new Error(
      command === "reconcile"
        ? "operation was not found"
        : "a terminal operation is required",
    );
  const counts = {};
  for (const operation of operations)
    counts[operation.target] = (counts[operation.target] || 0) + 1;
  if (command === "plan")
    return {
      mode: "read-only",
      operations: operations.length,
      byTarget: counts,
      historicalTime:
        "source timestamps preserved; GitLab created_at is registration time",
    };
  if (command !== "verify" && !options.execute)
    throw new Error("GitLab record writes require --execute");
  if (
    command === "reconcile" &&
    (!options["operation-id"] ||
      !Number.isSafeInteger(Number(options["deployment-id"])) ||
      Number(options["deployment-id"]) < 1)
  )
    throw new Error("reconcile requires exact operation and deployment IDs");
  const { token } = await resolveCredential();
  await verifyCredential(token);
  const recorder = createGitlabDeploymentRecorder({
    store,
    client: createClient({ token }),
  });
  const results = [];
  for (const operation of operations) {
    const record =
      command === "verify"
        ? await recorder.verify(operation.id)
        : command === "reconcile"
          ? await recorder.reconcile(
              operation.id,
              Number(options["deployment-id"]),
            )
          : await recorder.register(operation.id, { historical: true });
    results.push({
      operationId: operation.id,
      target: operation.target,
      ...record,
    });
    write(
      JSON.stringify({
        operationId: operation.id,
        target: operation.target,
        status: record.status,
        deploymentId: record.deploymentId,
      }),
    );
  }
  return {
    mode: command,
    operations: results.length,
    byTarget: counts,
    results,
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  try {
    console.log(
      JSON.stringify(
        await runDeploymentRecordsCLI(process.argv.slice(2)),
        null,
        2,
      ),
    );
  } catch (error) {
    console.error(`[gitlab-deployment-records] ${error.message}`);
    process.exitCode = 1;
  }
}
