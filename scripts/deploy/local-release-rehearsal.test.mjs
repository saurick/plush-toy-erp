import assert from "node:assert/strict";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

import {
  activateRehearsalCustomerConfig,
  bootstrapRehearsalAdmin,
  bootstrapRehearsalApprovalEligibility,
  buildRehearsalAdminPassword,
  buildRehearsalEnvironment,
  formatRehearsalEnv,
  parseLocalRehearsalArgs,
  reconcileRehearsalDatabaseRoles,
  runRehearsalCommand,
  runtimeIdentityDigest,
  selectRehearsalWorkbenchArtifact,
} from "./local-release-rehearsal.mjs";

const commit = "a".repeat(40);
const manifest = {
  schemaVersion: "plush-release-artifact/v1",
  passed: true,
  customer: "yoyoosun",
  git: { commit, head: commit, worktreeClean: true },
  sourceArchive: {
    secretScan: "passed",
    sha256: "b".repeat(64),
  },
  migration: {
    latest: "20260726174057",
    sequenceSha256: "c".repeat(64),
  },
  customerConfig: {
    packageKey: "yoyoosun-customer-package-v7",
    sourceSha256: "d".repeat(64),
  },
  sbom: { sha256: "e".repeat(64) },
  images: ["server", "web"].map((kind) => ({
    kind,
    ref: `plush-toy-erp-${kind}:yoyoosun-${commit}`,
    contentId: `sha256:${kind === "server" ? "1" : "2"}`.padEnd(
      71,
      kind === "server" ? "1" : "2",
    ),
    platform: "linux/amd64",
    gitSha: commit,
    archive: {
      file: `${kind}.tar`,
      sha256: "f".repeat(64),
      sizeBytes: 1,
      manifestDigest: `sha256:${kind === "server" ? "3" : "4"}`.padEnd(
        71,
        kind === "server" ? "3" : "4",
      ),
    },
    metadataSecretScan: { passed: true },
  })),
};
const ports = {
  postgres: 51001,
  appHttp: 51002,
  web: 51004,
  jaeger5775: 51005,
  jaeger6831: 51006,
  jaeger6832: 51007,
  jaeger5778: 51008,
  jaegerUi: 51009,
  jaeger14268: 51010,
  jaeger14250: 51011,
  jaeger9411: 51012,
  jaegerOtlpGrpc: 51013,
  jaegerOtlpHttp: 51014,
};

test("local release rehearsal CLI requires explicit manifest inputs", () => {
  assert.deepEqual(
    parseLocalRehearsalArgs([
      "--execute",
      "--manifest",
      "output/release.json",
      "--run-id",
      "release_20260728",
      "--json",
    ]),
    {
      execute: true,
      manifest: "output/release.json",
      runId: "release_20260728",
      json: true,
      help: false,
    },
  );
  assert.throws(
    () => parseLocalRehearsalArgs(["--manifest"]),
    /missing value/u,
  );
});

test("local release rehearsal command wrapper carries SQL only through stdin", () => {
  const output = runRehearsalCommand({
    command: process.execPath,
    args: [
      "-e",
      "process.stdin.setEncoding('utf8'); let value = ''; process.stdin.on('data', (chunk) => { value += chunk; }); process.stdin.on('end', () => process.stdout.write(value));",
    ],
    input: "SELECT 1;\n",
    label: "stdin contract",
  });
  assert.equal(output, "SELECT 1;\n");
});

test("local release rehearsal keeps workbench artifact paths inside the repository", () => {
  const repoRoot = path.resolve("/workspace/plush-toy-erp");
  assert.deepEqual(
    selectRehearsalWorkbenchArtifact({
      repoRoot,
      manifestPath: path.join(
        repoRoot,
        "output/releases/release-artifact.json",
      ),
      receiptPath: path.join(
        repoRoot,
        "output/dev-workbench/receipts/rehearsal.json",
      ),
    }),
    {
      artifactPath: "output/releases/release-artifact.json",
      materializeReceiptFirst: false,
    },
  );
  assert.deepEqual(
    selectRehearsalWorkbenchArtifact({
      repoRoot,
      manifestPath: "/tmp/github-release/release-artifact.json",
      receiptPath: path.join(
        repoRoot,
        "output/dev-workbench/receipts/rehearsal.json",
      ),
    }),
    {
      artifactPath: "output/dev-workbench/receipts/rehearsal.json",
      materializeReceiptFirst: true,
    },
  );
});

test("local release rehearsal environment binds isolated database fixed images and steady runtime", () => {
  const built = buildRehearsalEnvironment({
    manifest,
    runId: "release_20260728",
    workspace: "/private/tmp/release",
    ports,
    postgresPassword: "postgres-password",
    postgresAppPassword: "app-password",
    postgresMigratorPassword: "migrator-password",
    postgresBackupPassword: "backup-password",
    jwtSecret: "jwt-secret",
  });
  assert.equal(built.database, "plush_erp_release_release_20260728");
  assert.equal(
    built.values.APP_IMAGE,
    `plush-toy-erp-server:yoyoosun-${commit}`,
  );
  assert.equal(built.values.WEB_IMAGE, `plush-toy-erp-web:yoyoosun-${commit}`);
  assert.equal(built.values.POSTGRES_IMAGE, "postgres:18.1");
  assert.equal(built.values.POSTGRES_APP_PASSWORD, "app-password");
  assert.equal(built.values.POSTGRES_MIGRATOR_PASSWORD, "migrator-password");
  assert.equal(built.values.POSTGRES_BACKUP_PASSWORD, "backup-password");
  assert.equal(built.values.JAEGER_IMAGE, "jaegertracing/all-in-one:1.76.0");
  assert.equal(built.values.ERP_DEBUG_ENV, "prod");
  assert.equal(built.values.ERP_DEBUG_SEED_ENABLED, "false");
  assert.equal(built.values.BOOTSTRAP_ADMIN_ONCE, "false");
  assert.equal(built.values.ERP_ALLOW_RELEASE_REHEARSAL_CUSTOMER_CONFIG, "1");
  assert.equal(built.values.ERP_RELEASE_REHEARSAL_ID, "release_20260728");
  assert.equal(
    "ERP_RELEASE_REHEARSAL_PG_SYSTEM_IDENTIFIER" in built.values,
    false,
  );
  assert.equal("ERP_ALLOW_LOCAL_TEST_CUSTOMER_CONFIG" in built.values, false);
  assert.equal("APP_ADMIN_PASSWORD" in built.values, false);
  assert.throws(
    () =>
      buildRehearsalEnvironment({
        manifest,
        runId: `release_${"a".repeat(38)}`,
        workspace: "/private/tmp/release",
        ports,
        postgresPassword: "postgres-password",
        postgresAppPassword: "app-password",
        postgresMigratorPassword: "migrator-password",
        postgresBackupPassword: "backup-password",
        jwtSecret: "jwt-secret",
      }),
    /run id is invalid/u,
  );
  assert.throws(
    () =>
      buildRehearsalEnvironment({
        manifest,
        runId: "release_20260728",
        workspace: "/private/tmp/release",
        ports,
        postgresPassword: "postgres-password",
        postgresAppPassword: "app-password",
        postgresMigratorPassword: "app-password",
        postgresBackupPassword: "backup-password",
        jwtSecret: "jwt-secret",
      }),
    /database role passwords must be distinct/u,
  );
});

test("local release rehearsal creates a server-compatible ephemeral admin password", () => {
  for (let index = 0; index < 32; index += 1) {
    const password = buildRehearsalAdminPassword();
    assert.ok([...password].length >= 8);
    assert.ok([...password].length <= 20);
    assert.ok(Buffer.byteLength(password, "utf8") <= 72);
    assert.notEqual(password, "adminadmin");
    assert.doesNotMatch(password, /\s/u);
  }
});

test("local release rehearsal reconciles and verifies isolated database roles after migration", () => {
  const calls = [];
  const context = {
    composeDir: "/private/tmp/release/server/deploy/compose/prod",
    composeFile: "/private/tmp/release/server/deploy/compose/prod/compose.yml",
    envFile: "/private/tmp/release/release.env",
    project: "plush-release-example",
    runCommand(input) {
      calls.push(input);
      return "database_permissions=verified\n";
    },
  };

  assert.deepEqual(reconcileRehearsalDatabaseRoles(context), {
    status: "passed",
    reconcile: "passed",
    verify: "passed",
  });
  assert.deepEqual(
    calls.map(({ command, args, label }) => ({ command, args, label })),
    [
      {
        command: "docker",
        args: [
          "compose",
          "--project-name",
          context.project,
          "--env-file",
          context.envFile,
          "-f",
          context.composeFile,
          "exec",
          "-T",
          "postgres",
          "/usr/local/bin/plush-database-roles",
          "reconcile",
        ],
        label: "reconcile isolated release database roles",
      },
      {
        command: "docker",
        args: [
          "compose",
          "--project-name",
          context.project,
          "--env-file",
          context.envFile,
          "-f",
          context.composeFile,
          "exec",
          "-T",
          "postgres",
          "/usr/local/bin/plush-database-roles",
          "verify",
        ],
        label: "verify isolated release database roles",
      },
    ],
  );
});

test("local release rehearsal bootstraps admin only through a verified no-port one-shot container", async () => {
  const containerId = "3".repeat(64);
  const operationPassword = "Rel_admin_9aA";
  const calls = [];
  let containerStopped = false;
  const context = {
    repoRoot: "/private/tmp/release",
    composeDir: "/private/tmp/release/server/deploy/compose/prod",
    composeFile: "/private/tmp/release/server/deploy/compose/prod/compose.yml",
    envFile: "/private/tmp/release/release.env",
    project: "plush-release-example",
    database: "plush_erp_release_example",
    postgresContainer: "plush-release-example-postgres",
    adminPassword: operationPassword,
    manifest,
    runCommand(input) {
      calls.push(input);
      const args = input.args || [];
      if (args[0] === "compose" && args.includes("run")) {
        return `${containerId}\n`;
      }
      if (args[0] === "inspect") {
        const runCall = calls.find(
          (item) => item.args?.[0] === "compose" && item.args.includes("run"),
        );
        return [
          containerId,
          `/${runCall.args[runCall.args.indexOf("--name") + 1]}`,
          context.project,
          "app-server",
          manifest.images.find((item) => item.kind === "server").ref,
          manifest.images.find((item) => item.kind === "server").archive
            .manifestDigest,
          runCall.args[runCall.args.indexOf("--label") + 1].split("=")[1],
          "true",
          "0",
        ].join("\t");
      }
      if (args[0] === "exec") return "1\t1\t1\t12\t3\t20\n";
      if (args[0] === "ps") {
        return containerStopped ? "" : `${containerId}\n`;
      }
      if (args[0] === "rm") {
        containerStopped = true;
        return `${containerId}\n`;
      }
      throw new Error(`unexpected command: ${input.command} ${args.join(" ")}`);
    },
  };

  const result = await bootstrapRehearsalAdmin(context);
  assert.equal(result.status, "passed");
  assert.equal(result.mode, "one-shot-no-ports");
  assert.equal(result.passwordPersisted, false);
  assert.equal(result.containerRemoved, true);
  const runCall = calls.find(
    (item) => item.args?.[0] === "compose" && item.args.includes("run"),
  );
  assert.ok(runCall);
  assert.equal(runCall.env.APP_ADMIN_PASSWORD, operationPassword);
  assert.ok(runCall.args.includes("--no-deps"));
  assert.ok(runCall.args.includes("--rm"));
  assert.ok(runCall.args.includes("--pull"));
  assert.ok(runCall.args.includes("never"));
  assert.ok(runCall.args.includes("APP_ADMIN_PASSWORD"));
  assert.ok(runCall.args.includes("BOOTSTRAP_ADMIN_ONCE=true"));
  assert.equal(
    runCall.args.some((item) => String(item).includes(operationPassword)),
    false,
  );
  assert.equal(
    calls.some(
      (item) => item.args?.[0] === "compose" && item.args.includes("up"),
    ),
    false,
  );
  const readbackCall = calls.find((item) => item.args?.[0] === "exec");
  assert.ok(readbackCall);
  assert.ok(readbackCall.args.includes("-i"));
  assert.ok(readbackCall.args.includes("-f"));
  assert.ok(readbackCall.args.includes("-"));
  assert.equal(readbackCall.args.includes("-c"), false);
  assert.match(readbackCall.input, /:'admin_username'/u);
  assert.equal(readbackCall.input.includes(operationPassword), false);
});

test("local release rehearsal binds approval eligibility only inside the exact isolated database", () => {
  const database = "plush_erp_release_release_20260728";
  const systemIdentifier = "1234567890123456789";
  const calls = [];
  const context = {
    repoRoot: "/private/tmp/release",
    postgresContainer: "plush-release-example-postgres",
    database,
    postgresSystemIdentifier: systemIdentifier,
    manifest,
    runCommand(input) {
      calls.push(input);
      if (input.label === "preflight isolated approval eligibility") {
        return `${database}\t${systemIdentifier}\t1\t4\t4\n`;
      }
      if (input.label === "bind isolated approval eligibility") {
        return `${database}\t${systemIdentifier}\t4\n`;
      }
      throw new Error(`unexpected command: ${input.label}`);
    },
  };

  const result = bootstrapRehearsalApprovalEligibility(context);
  assert.deepEqual(result.roleKeys, ["boss", "finance", "purchase", "sales"]);
  assert.equal(result.status, "passed");
  assert.equal(result.mode, "isolated-super-admin-role-binding");
  assert.equal(result.bindingCount, 4);
  assert.equal(result.writesBusinessFacts, false);
  assert.equal(result.retainedAfterCleanup, false);
  assert.equal(calls.length, 2);
  for (const call of calls) {
    assert.equal(call.command, "docker");
    assert.ok(call.args.includes("-i"));
    assert.ok(call.args.includes("-f"));
    assert.ok(call.args.includes("-"));
    assert.equal(call.args.includes("-c"), false);
    assert.equal(call.args.includes(database), true);
    assert.equal(call.input.includes("postgres-password"), false);
  }
  assert.doesNotMatch(calls[0].input, /INSERT INTO admin_user_roles/u);
  assert.match(calls[1].input, /INSERT INTO admin_user_roles/u);
  assert.match(calls[1].input, /ON CONFLICT \(admin_user_id, role_id\)/u);
  assert.match(calls[1].input, /'boss', 'finance', 'purchase', 'sales'/u);
  assert.throws(
    () =>
      bootstrapRehearsalApprovalEligibility({
        ...context,
        database: "plush_erp",
      }),
    /identity is not bound/u,
  );
});

test("local release rehearsal runtime identity binds database SHA and migration", () => {
  const first = runtimeIdentityDigest(
    "plush_erp_release_release_20260728",
    commit,
    "20260726174057",
  );
  assert.match(first, /^[a-f0-9]{64}$/u);
  assert.notEqual(
    first,
    runtimeIdentityDigest(
      "plush_erp_release_release_20260729",
      commit,
      "20260726174057",
    ),
  );
  assert.throws(
    () => runtimeIdentityDigest("database", "short", "20260726174057"),
    /input is invalid/u,
  );
});

test("local release rehearsal activates only the content-addressed local-test customer manifest", async () => {
  const methods = [];
  let appliedManifest;
  const configHash = "9".repeat(64);
  const rpc = async (_appUrl, _token, method, params) => {
    methods.push(method);
    if (method === "validate_customer_config") {
      appliedManifest = params;
      return {
        validation: {
          customer_key: params.customer_key,
          revision: params.revision,
          compiled_snapshot_ok: true,
          config_hash: configHash,
          config_hash_version: 1,
        },
      };
    }
    if (method === "publish_customer_config") {
      return {
        revision: {
          revision: appliedManifest.revision,
          product_version: appliedManifest.product_version,
          config_hash: configHash,
          status: "published",
        },
      };
    }
    if (method === "check_customer_config_transition") {
      assert.equal(params.expected_active_revision, "");
      return {
        transition: {
          allowed: true,
          blockers: [],
          target_revision: appliedManifest.revision,
          observed_active_revision: "",
        },
      };
    }
    if (method === "activate_customer_config") {
      assert.equal(params.expected_config_hash, configHash);
      return {
        revision: {
          status: "active",
          revision: appliedManifest.revision,
          product_version: appliedManifest.product_version,
          config_hash: configHash,
        },
      };
    }
    if (method === "get_effective_session") {
      return {
        session: {
          source: "active_customer_config_revision",
          configRevision: appliedManifest.revision,
          configProductVersion: appliedManifest.product_version,
          configHash,
          pages: ["dashboard"],
        },
      };
    }
    throw new Error(`unexpected method ${method}`);
  };
  const result = await activateRehearsalCustomerConfig(
    "http://127.0.0.1:51002",
    "test-token",
    manifest,
    { rpc },
  );
  assert.deepEqual(methods, [
    "validate_customer_config",
    "publish_customer_config",
    "check_customer_config_transition",
    "activate_customer_config",
    "get_effective_session",
  ]);
  assert.equal(
    appliedManifest.compiled_snapshot.applyPurpose,
    "local_test_apply",
  );
  assert.match(
    appliedManifest.revision,
    /^yoyoosun-customer-package-v7\.local-[a-f0-9]{16}\.runtime-v1$/u,
  );
  assert.equal(result.status, "passed");
  assert.equal(result.writesBusinessFacts, false);
});

test("local release rehearsal env formatting is deterministic and contains no shell syntax", () => {
  const content = formatRehearsalEnv({
    PROJECT_SLUG: "plush-release-example",
    BOOTSTRAP_ADMIN_ONCE: "false",
  });
  assert.equal(
    content,
    "PROJECT_SLUG=plush-release-example\nBOOTSTRAP_ADMIN_ONCE=false\n",
  );
  assert.doesNotMatch(content, /\bexport\b|[`;$]/u);
});

test("local release rehearsal help documents teardown and evidence boundary", () => {
  const result = spawnSync(
    process.execPath,
    [path.join(import.meta.dirname, "local-release-rehearsal.mjs"), "--help"],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /backup\+restore drill/u);
  assert.match(result.stdout, /one-shot admin bootstrap/u);
  assert.match(result.stdout, /destroys the\s+Compose\/database/u);
  assert.match(result.stdout, /does not contact or\s+prove 133\/UAT/u);
});
