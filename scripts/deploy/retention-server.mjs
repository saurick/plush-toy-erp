import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  getDeploymentTarget,
  SUPPORTED_DEPLOYMENT_TARGET_KEYS,
} from "./deployment-targets.mjs";
import { runTargetPreflight } from "./target-preflight.mjs";
import {
  plainFile,
  describeFiles,
  rotateFiles,
  rotateScheduled,
  gitlabItems,
} from "./retention-files.mjs";
import {
  atomicJSON,
  privateDirectory,
  digest,
} from "./backup-replica/storage.mjs";
import { requireValue } from "./backup-replica/config.mjs";
import {
  planRetention,
  readRetentionLedger,
  saveRetentionLedger,
} from "./backup-replica/retention.mjs";
import { bundleFiles, bundleTime } from "./backup-replica/gitlab-sync.mjs";
import { pruneSets } from "./backup-set/archive.mjs";

export const RETENTION_STATE = "/var/lib/plush-retention";
const SHA = /^[a-f0-9]{40}$/u;
const TERMINAL = new Set(["passed", "failed", "blocked", "not_proven"]);
const labels = {
  "demo-133": "demo",
  "customer-test-133": "test",
  "production-133": "erp",
};
const json = (file) => JSON.parse(fs.readFileSync(plainFile(file) && file));
const docker = (args) =>
  execFileSync("docker", args, {
    encoding: "utf8",
    timeout: 30000,
    maxBuffer: 8 * 1024 ** 2,
  }).trim();

export function targetProtection(target, preflight) {
  requireValue(
    preflight.status === "passed" &&
      preflight.remote?.retention.protectionStatus === "complete",
    "target_protection_not_proven",
  );
  const root = target.filesystem.root,
    current = preflight.remote.runtime.serverSha;
  const protectedShas = new Map([
    [current, ["当前运行"]],
    ...preflight.remote.retention.rollbackReleaseShas.map((sha) => [
      sha,
      ["必要回滚版本"],
    ]),
  ]);
  const removable = new Set(preflight.remote.retention.candidateShas);
  for (const sha of fs.readdirSync(target.filesystem.releases)) {
    if (SHA.test(sha) && !removable.has(sha) && !protectedShas.has(sha))
      protectedShas.set(sha, ["目标最近版本或未闭环引用"]);
  }
  const operations = [];
  for (const dir of fs.readdirSync(target.filesystem.operationRoot)) {
    const documents = fs
      .readdirSync(path.join(target.filesystem.operationRoot, dir))
      .filter((n) =>
        /^(?:receipt|state|rollback-receipt|rollback-state|database-rebuild-receipt|database-rebuild-state)\.json$/u.test(
          n,
        ),
      )
      .map((name) =>
        json(path.join(target.filesystem.operationRoot, dir, name)),
      );
    requireValue(
      documents.length > 0 &&
        documents.every(
          (x) => x.target === target.key && x.operationId === dir,
        ),
      "operation_identity_mismatch",
    );
    const passed = documents.filter(
      (x) => x.status === "passed" && x.schemaVersion.includes("-receipt/"),
    );
    const unresolved = passed.length === 0;
    for (const value of documents) {
      requireValue(
        TERMINAL.has(value.status) ||
          (!unresolved && value.status === "running"),
        "target_operation_running",
      );
      if (unresolved) {
        for (const match of JSON.stringify(value).matchAll(
          /["']([a-f0-9]{40})["']/gu,
        ))
          protectedShas.set(match[1], ["未闭环操作引用"]);
      }
      if (value.rollbackPoint?.backupAlias)
        operations.push({ value, unresolved });
    }
  }
  const refs = new Map();
  for (const { value, unresolved } of operations) {
    const point = value.rollbackPoint,
      id = `${point.backupAlias}.dump`;
    if (!refs.has(id) || value.status === "passed")
      refs.set(id, { point, value, unresolved });
  }
  const latest = operations
    .filter((x) => x.value.status === "passed")
    .sort(
      (a, b) => Date.parse(b.value.finishedAt) - Date.parse(a.value.finishedAt),
    )[0]?.value.operationId;
  return { root, current, protectedShas, refs, latest };
}

export async function targetBackups(target, protection, execute) {
  const root = path.join(protection.root, "backups"),
    items = [];
  const protectedBackups = Object.fromEntries(
    [...protection.refs]
      .filter(
        ([, ref]) =>
          ref.unresolved ||
          ref.value.operationId === protection.latest ||
          protection.protectedShas.has(ref.value.gitSha),
      )
      .map(([name, ref]) => [
        name,
        [
          ...(ref.unresolved ? ["未闭环操作引用"] : []),
          ...(ref.value.operationId === protection.latest
            ? ["最近升级前恢复点"]
            : []),
          ...(protection.protectedShas.has(ref.value.gitSha)
            ? ["当前或回滚版本恢复点"]
            : []),
        ],
      ]),
  );
  for (const name of fs.readdirSync(root)) {
    if (!name.endsWith(".dump")) continue;
    const file = path.join(root, name),
      stat = plainFile(file),
      ref = protection.refs.get(name);
    const actual = await digest(file),
      reasons = [];
    const valid = Boolean(
      ref?.point.restoreChecked &&
      ref.point.backupSha256 === actual &&
      ref.point.backupSizeBytes === stat.size,
    );
    if (!ref) reasons.push("历史恢复点待核对");
    else {
      if (ref.unresolved) reasons.push("未闭环操作引用");
      if (ref.value.operationId === protection.latest)
        reasons.push("最近升级前恢复点");
      if (protection.protectedShas.has(ref.value.gitSha))
        reasons.push("当前或回滚版本恢复点");
    }
    items.push({
      id: name,
      createdAt: ref?.value.finishedAt ?? stat.mtime.toISOString(),
      valid,
      reasons,
      files: [{ name, sha256: actual, sizeBytes: stat.size }],
    });
  }
  return rotateFiles(root, target.key, items, {
    execute,
    protection: protectedBackups,
  });
}

export async function gitlabExportItems(root) {
  const items = [];
  const ledger = readRetentionLedger(root, "gitlab-export");
  for (const name of fs.readdirSync(root)) {
    if (!/^backup-\d{8}T\d{6}Z$/u.test(name)) continue;
    if (ledger.records[name]?.state === "cleaning") continue;
    const directory = path.join(root, name);
    requireValue(
      fs.realpathSync(directory) === directory &&
        fs.statSync(directory).isDirectory(),
      "unsafe_gitlab_export",
    );
    const checksum = path.join(directory, "encrypted.sha256");
    const rows = fs
      .readFileSync(plainFile(checksum) && checksum, "utf8")
      .trim()
      .split("\n")
      .map((x) => /^([a-f0-9]{64})  ([a-z0-9.]+)$/u.exec(x));
    requireValue(
      rows.length === 4 &&
        rows.every(Boolean) &&
        rows
          .map((x) => x[2])
          .sort()
          .join() === bundleFiles.join(),
      "invalid_gitlab_export",
    );
    const files = rows.map((x) => ({
      name: `${name}/${x[2]}`,
      sha256: x[1],
      sizeBytes: plainFile(path.join(directory, x[2])).size,
    }));
    files.push(...(await describeFiles(root, [`${name}/encrypted.sha256`])));
    items.push({
      id: name,
      createdAt: new Date(bundleTime(name)).toISOString(),
      valid: true,
      reasons: [],
      files,
      emptyDirectories: [name],
    });
  }
  return items;
}

export function rotateTargetArtifacts(
  target,
  preflight,
  versions,
  execute,
  state,
) {
  const root = target.filesystem.root,
    allowed = new Set(preflight.remote.retention.candidateShas);
  const retained = new Set(
    versions
      .filter((x) => x.state !== "cleaned" && x.state !== "eligible")
      .map((x) => x.id),
  );
  const ledgerRoot = privateDirectory(path.join(state, `target-${target.key}`)),
    ledger = readRetentionLedger(ledgerRoot, target.key);
  for (const sha of allowed) {
    if (retained.has(sha)) continue;
    const directory = path.join(target.filesystem.releases, sha);
    requireValue(
      SHA.test(sha) && fs.realpathSync(directory) === directory,
      "unsafe_release_directory",
    );
    const identity = json(path.join(directory, ".plush-release-identity.json"));
    requireValue(
      identity.gitSha === sha &&
        identity.schemaVersion === "plush.target-release-identity/v1",
      "release_identity_mismatch",
    );
    const row = { id: sha, state: "eligible", identity, reasons: [] };
    if (execute) {
      ledger.records[sha] = { ...row, state: "cleaning" };
      saveRetentionLedger(ledgerRoot, ledger);
      fs.rmSync(directory, { recursive: true });
      ledger.records[sha] = {
        ...row,
        state: "cleaned",
        cleanedAt: new Date().toISOString(),
      };
      saveRetentionLedger(ledgerRoot, ledger);
    }
  }
  for (const name of ["release-cache", "release-cache-v2"]) {
    const directory = path.join(root, name);
    if (!fs.existsSync(directory)) continue;
    for (const id of fs.readdirSync(directory)) {
      const cache = path.join(directory, id),
        manifest = path.join(cache, "release-artifact.json");
      requireValue(
        /^[a-f0-9]{64}$/u.test(id) && fs.realpathSync(cache) === cache,
        "unsafe_release_cache",
      );
      const sha = json(manifest).git?.commit;
      if (allowed.has(sha) && !retained.has(sha) && execute)
        fs.rmSync(cache, { recursive: true });
    }
  }
  for (const name of docker(["ps", "-a", "--format", "{{.Names}}"]).split(
    "\n",
  )) {
    if (!name.startsWith(target.publicEntry.containerPrefix)) continue;
    const details = JSON.parse(docker(["inspect", name]))[0];
    const sha = details.Config.Env?.find((x) =>
      x.startsWith("GIT_SHA="),
    )?.slice(8);
    if (
      SHA.test(sha) &&
      allowed.has(sha) &&
      !retained.has(sha) &&
      details.State.Running === false &&
      execute
    )
      docker(["rm", name]);
  }
  // Only exact project tags which have lost all retained release references.
  // Docker itself refuses removal when an existing container still needs them.
  const obsolete = new Set(
    versions.filter((x) => x.state === "cleaned").map((x) => x.id),
  );
  for (const row of docker([
    "image",
    "ls",
    "--format",
    "{{.Repository}}\t{{.Tag}}",
  ]).split("\n")) {
    const [repository, tag] = row.split("\t");
    const sha = /^yoyoosun-([a-f0-9]{40})$/u.exec(tag)?.[1];
    if (
      !/^plush-toy-erp-(?:server|web)$/u.test(repository) ||
      !obsolete.has(sha)
    )
      continue;
    if (execute) {
      const imageId = docker([
        "image",
        "inspect",
        `${repository}:${tag}`,
        "--format",
        "{{.Id}}",
      ]);
      const referenced = docker([
        "ps",
        "-a",
        "--filter",
        `ancestor=${imageId}`,
        "--format",
        "{{.ID}}",
      ]);
      if (referenced) continue;
      const result = spawnSync(
        "docker",
        ["image", "rm", `${repository}:${tag}`],
        { encoding: "utf8", timeout: 30000 },
      );
      if (result.status !== 0) throw new Error("image_cleanup_not_proven");
    }
  }
}

export async function rotateGitlabArtifacts(
  protectedShas,
  { state = RETENTION_STATE, execute = false, request = fetch, token } = {},
) {
  const root = privateDirectory(path.join(state, "artifacts")),
    ledger = readRetentionLedger(root, "gitlab-release");
  async function api(endpoint, method = "GET") {
    const response = await request(
      `http://127.0.0.1:8929/api/v4/projects/1${endpoint}`,
      {
        method,
        headers: { "PRIVATE-TOKEN": token },
        redirect: "error",
        signal: AbortSignal.timeout(30000),
      },
    );
    requireValue(response.ok, "gitlab_retention_request_failed");
    return method === "DELETE" ? null : response.json();
  }
  async function pages(endpoint) {
    const all = [];
    for (let page = 1; page <= 200; page++) {
      const items = await api(
        `${endpoint}${endpoint.includes("?") ? "&" : "?"}per_page=100&page=${page}`,
      );
      requireValue(Array.isArray(items), "invalid_gitlab_retention_inventory");
      all.push(...items);
      if (items.length < 100) return all;
    }
    throw new Error("gitlab_retention_inventory_limit");
  }
  requireValue(
    (await api("/pipelines?status=running&per_page=1")).length === 0 &&
      (await api("/pipelines?status=pending&per_page=1")).length === 0,
    "gitlab_pipeline_active",
  );
  const releases = await pages("/releases"),
    packages = (await pages("/packages?package_type=generic")).filter((x) =>
      [
        "plush-release",
        "plush-release-source",
        "plush-release-candidate",
      ].includes(x.name),
    );
  const groups = new Map();
  for (const item of packages) {
    if (!/^artifact-[a-f0-9]{40}$/u.test(item.version)) continue;
    requireValue(
      item.status === "default" && Number.isSafeInteger(item.id),
      "gitlab_package_not_ready",
    );
    const files = await pages(`/packages/${item.id}/package_files`);
    requireValue(
      files.every(
        (f) =>
          Number.isSafeInteger(f.id) &&
          f.size > 0 &&
          /^[a-f0-9]{64}$/u.test(f.file_sha256),
      ),
      "invalid_gitlab_package_file",
    );
    const group = groups.get(item.version) ?? [];
    group.push({ ...item, files });
    groups.set(item.version, group);
  }
  const items = [];
  for (const release of releases) {
    const sha = String(release.tag_name).replace(/^artifact-/u, "");
    if (!SHA.test(sha)) continue;
    requireValue(
      release.commit?.id === sha,
      "gitlab_release_identity_mismatch",
    );
    const group = groups.get(release.tag_name) ?? [],
      formal = group.filter((x) => x.name === "plush-release");
    requireValue(formal.length <= 1, "duplicate_gitlab_release_package");
    const fileNames = new Set(
      formal.flatMap((x) => x.files.map((f) => f.file_name)),
    );
    const valid = [
      "checksums.sha256",
      "release-artifact.json",
      "release-manifest.json",
      "sbom.cdx.json",
      "server-image.tar",
      "web-image.tar",
    ].every((n) => fileNames.has(n));
    if (!valid && ["cleaned", "cleaning"].includes(ledger.records[sha]?.state))
      continue;
    items.push({
      id: sha,
      version: release.name,
      createdAt: release.released_at,
      valid,
      reasons: protectedShas.get(sha) ?? [],
      files: group.flatMap((pkg) =>
        pkg.files.map((f) => ({
          packageId: pkg.id,
          packageName: pkg.name,
          id: f.id,
          name: f.file_name,
          sizeBytes: f.size,
          sha256: f.file_sha256,
        })),
      ),
    });
  }
  const plan = planRetention(items);
  for (const item of plan) ledger.records[item.id] = item;
  if (execute) {
    saveRetentionLedger(root, ledger);
    for (const item of Object.values(ledger.records).filter((x) =>
      ["eligible", "cleaning"].includes(x.state),
    )) {
      requireValue(!protectedShas.has(item.id), "protected_release_cleanup");
      ledger.records[item.id] = {
        ...item,
        state: "cleaning",
        cleanupStartedAt: new Date().toISOString(),
      };
      saveRetentionLedger(root, ledger);
      for (const file of item.files.filter((f) =>
        ["server-image.tar", "web-image.tar", "source.tar"].includes(f.name),
      )) {
        const current = (
          await pages(`/packages/${file.packageId}/package_files`)
        ).find((f) => f.id === file.id);
        if (!current) continue;
        requireValue(
          current.file_name === file.name &&
            current.file_sha256 === file.sha256 &&
            current.size === file.sizeBytes,
          "gitlab_cleanup_identity_changed",
        );
        await api(
          `/packages/${file.packageId}/package_files/${file.id}`,
          "DELETE",
        );
        requireValue(
          !(await pages(`/packages/${file.packageId}/package_files`)).some(
            (f) => f.id === file.id,
          ),
          "gitlab_cleanup_not_proven",
        );
      }
      ledger.records[item.id].state = "cleaned";
      ledger.records[item.id].cleanedAt = new Date().toISOString();
      saveRetentionLedger(root, ledger);
    }
  }
  return Object.values(ledger.records);
}

function publicRows(value, environment, location) {
  return value.records.map(
    ({ id, createdAt, state, reasons, cleanedAt, files, sizeBytes }) => ({
      id: `${environment}:${location}:${id}`,
      name: id,
      environment,
      location,
      createdAt,
      state,
      reasons,
      cleanedAt: cleanedAt ?? null,
      sizeBytes:
        sizeBytes ?? (files ?? []).reduce((n, f) => n + f.sizeBytes, 0),
    }),
  );
}

export async function runRetention({
  execute = false,
  state = RETENTION_STATE,
} = {}) {
  requireValue(
    process.platform === "linux" &&
      os.hostname() === "r740xd" &&
      process.getuid() === 0,
    "retention_host_mismatch",
  );
  privateDirectory(state);
  const summary = {
    schemaVersion: "plush.retention-summary/v1",
    status: "passed",
    generatedAt: new Date().toISOString(),
    retentionCount: 7,
    recordsRetained: true,
    backups: [],
    versions: [],
  };
  const protections = [],
    protectedShas = new Map();
  for (const key of SUPPORTED_DEPLOYMENT_TARGET_KEYS) {
    console.error(`[retention] preflight ${key}`);
    const target = getDeploymentTarget(key),
      preflight = runTargetPreflight(key, { timeoutMs: 60000 });
    if (preflight.status !== "passed")
      console.error(
        `[retention] target=${key} blockers=${JSON.stringify(preflight.blockers)}`,
      );
    const protection = targetProtection(target, preflight);
    for (const [sha, reasons] of protection.protectedShas)
      protectedShas.set(sha, [
        ...new Set([
          ...(protectedShas.get(sha) ?? []),
          ...reasons.map((r) => `${labels[key]}：${r}`),
        ]),
      ]);
    protections.push({ target, preflight, protection });
  }
  const tokenFile =
    "/root/deploy/plush-workbench-test/runtime/gitlab-release-token";
  plainFile(tokenFile);
  console.error("[retention] GitLab release inventory");
  const versions = await rotateGitlabArtifacts(protectedShas, {
    state,
    execute,
    token: fs.readFileSync(tokenFile, "utf8").trim(),
  });
  summary.versions = versions.map(({ id, state, reasons, cleanedAt }) => ({
    gitSha: id,
    state,
    reasons,
    cleanedAt: cleanedAt ?? null,
  }));
  for (const { target, protection } of protections) {
    summary.backups.push(
      ...publicRows(
        await targetBackups(target, protection, execute),
        labels[target.key],
        "部署恢复点",
      ),
    );
    const scheduled = path.join(protection.root, "backups/scheduled");
    if (fs.existsSync(scheduled))
      summary.backups.push(
        ...publicRows(
          await rotateScheduled(scheduled, { execute }),
          labels[target.key],
          "定时备份",
        ),
      );
    for (const name of fs.readdirSync(path.join(protection.root, "backups"))) {
      const directory = path.join(protection.root, "backups", name);
      if (
        !fs.lstatSync(directory).isDirectory() ||
        fs.lstatSync(directory).isSymbolicLink()
      )
        continue;
      if (
        !fs
          .readdirSync(directory)
          .some((x) => /^plush-set-.+\.tar\.age$/u.test(x))
      )
        continue;
      const paired = pruneSets(directory, 7, { execute });
      summary.backups.push(
        ...publicRows(paired, labels[target.key], "数据库与附件"),
      );
    }
  }
  const gitlabRoot = "/srv/raid5/gitlab/backups";
  console.error("[retention] verify GitLab native recovery sets");
  summary.backups.push(
    ...publicRows(
      await rotateFiles(
        gitlabRoot,
        "gitlab-native",
        await gitlabItems(gitlabRoot),
        { execute },
      ),
      "gitlab",
      "服务端",
    ),
  );
  const exportRoot = path.join(gitlabRoot, "export");
  console.error("[retention] verify encrypted export sets");
  summary.backups.push(
    ...publicRows(
      await rotateFiles(
        exportRoot,
        "gitlab-export",
        await gitlabExportItems(exportRoot),
        { execute },
      ),
      "gitlab",
      "加密源副本",
    ),
  );
  const env = fs.readFileSync("/etc/plush-toy-erp/backup.env", "utf8");
  const offsite = /^BACKUP_OFFSITE_DIR=(\/[A-Za-z0-9._/-]+)$/mu.exec(env)?.[1];
  requireValue(
    offsite && fs.realpathSync(offsite) === offsite,
    "backup_offsite_identity_missing",
  );
  summary.backups.push(
    ...publicRows(
      await rotateScheduled(offsite, { execute }),
      "erp",
      "加密源副本",
    ),
  );
  for (const [root, environment] of [
    [offsite, "erp"],
    [path.join(gitlabRoot, "export"), "gitlab"],
  ]) {
    const file = path.join(root, "retention-replica-report.json");
    if (fs.existsSync(file)) {
      const replica = json(file);
      requireValue(
        replica.schemaVersion === "plush.replica-retention-report/v1" &&
          replica.retentionCount === 7 &&
          Array.isArray(replica.records),
        "invalid_replica_retention_report",
      );
      summary.backups.push(...publicRows(replica, environment, "PD-SSD"));
    }
  }
  for (const { target, preflight } of protections)
    rotateTargetArtifacts(target, preflight, versions, execute, state);
  if (execute) {
    const records = privateDirectory(path.join(state, "records"));
    for (const { target, protection } of protections) {
      const root = path.join(protection.root, "backups");
      atomicJSON(
        path.join(records, `${target.key}.json`),
        readRetentionLedger(root, target.key),
      );
      const scheduled = path.join(root, "scheduled");
      if (fs.existsSync(scheduled))
        atomicJSON(
          path.join(records, `${target.key}-scheduled.json`),
          readRetentionLedger(scheduled, "scheduled-database"),
        );
    }
    atomicJSON(
      path.join(records, "gitlab-native.json"),
      readRetentionLedger(gitlabRoot, "gitlab-native"),
    );
    atomicJSON(
      path.join(records, "gitlab-export.json"),
      readRetentionLedger(exportRoot, "gitlab-export"),
    );
    atomicJSON(
      path.join(records, "erp-encrypted.json"),
      readRetentionLedger(offsite, "scheduled-database"),
    );
    atomicJSON(path.join(state, "summary.json"), summary);
    privateDirectory(path.join(state, "runs"));
    atomicJSON(
      path.join(
        state,
        "runs",
        `${summary.generatedAt.replaceAll(":", "-")}.json`,
      ),
      summary,
    );
  }
  return summary;
}

if (
  process.argv[1] &&
  fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    const execute = process.argv.includes("--execute");
    requireValue(
      process.argv
        .slice(2)
        .every((x) => ["--execute", "--preview", "--locked"].includes(x)) &&
        process.argv.includes(execute ? "--execute" : "--preview"),
      "invalid_retention_arguments",
    );
    if (!process.argv.includes("--locked")) {
      privateDirectory(RETENTION_STATE);
      const locks = [
        path.join(RETENTION_STATE, "rotation.lock"),
        ...SUPPORTED_DEPLOYMENT_TARGET_KEYS.map((k) =>
          path.join(
            getDeploymentTarget(k).filesystem.root,
            "run/promotion.lock",
          ),
        ),
        "/srv/raid5/gitlab/backups/.backup.lock",
        "/root/deploy/plush-toy-erp-production/backups/scheduled/.scheduled-backup.lock",
      ];
      for (const lock of locks) if (fs.existsSync(lock)) plainFile(lock);
      const args = locks.flatMap((lock) => ["flock", "--nonblock", lock]);
      const result = spawnSync(
        args.shift(),
        [
          ...args,
          process.execPath,
          fileURLToPath(import.meta.url),
          execute ? "--execute" : "--preview",
          "--locked",
        ],
        { stdio: "inherit" },
      );
      process.exitCode = result.status ?? 1;
    } else {
      const summary = await runRetention({ execute });
      console.log(JSON.stringify(summary));
    }
  } catch (error) {
    if (
      process.argv.includes("--execute") &&
      process.argv.includes("--locked")
    ) {
      const file = path.join(RETENTION_STATE, "summary.json");
      const summary = fs.existsSync(file)
        ? json(file)
        : {
            schemaVersion: "plush.retention-summary/v1",
            generatedAt: new Date().toISOString(),
            retentionCount: 7,
            recordsRetained: true,
            versions: [],
            backups: [],
          };
      const artifactRoot = path.join(RETENTION_STATE, "artifacts");
      const versions = fs.existsSync(artifactRoot)
        ? Object.values(
            readRetentionLedger(artifactRoot, "gitlab-release").records,
          ).map(({ id, state, reasons, cleanedAt }) => ({
            gitSha: id,
            state,
            reasons,
            cleanedAt: cleanedAt ?? null,
          }))
        : summary.versions;
      const failed = {
        ...summary,
        versions,
        backups: summary.backups.map((row) =>
          row.state === "cleaned"
            ? row
            : {
                ...row,
                state: "unverified",
                reasons: [
                  ...new Set([...row.reasons, "本轮未完成，文件状态待核对"]),
                ],
              },
        ),
        status: "failed",
        lastAttemptAt: new Date().toISOString(),
        reason: error.code ?? "retention_failed",
      };
      atomicJSON(file, failed);
      privateDirectory(path.join(RETENTION_STATE, "runs"));
      atomicJSON(
        path.join(
          RETENTION_STATE,
          "runs",
          `failed-${failed.lastAttemptAt.replaceAll(":", "-")}.json`,
        ),
        failed,
      );
    }
    console.error(`[retention] ${error.code ?? "retention_failed"}`);
    process.exitCode = 1;
  }
}
