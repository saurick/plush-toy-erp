import {
  readRuntimeBuildInputs,
  runtimeGoBuildArgs,
} from "./local-runtime-build-inputs.mjs";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { promisify, parseEnv } from "node:util";
import { execFile } from "node:child_process";
import { databaseQuery } from "./local-database-roles.mjs";
import { databaseProgrammabilityReceiptSQL } from "./qa/database-programmability.mjs";

const exec = promisify(execFile);
const ID =
  /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u;
const HASH = /^[a-f0-9]{64}$/u;
export const WORKSPACE_RUNTIME_SOURCE_CHANGED_CODE =
  "WORKSPACE_RUNTIME_SOURCE_CHANGED";
const SOURCE_ROOTS = ["server/", "web/", "config/", "scripts/", "deployments/"];
const BACKEND_SOURCE_ROOTS = ["server/", "config/"];
const omitted =
  /(?:^|\/)(?:node_modules|\.git|output|logs|\.vite-cache)(?:\/|$)|^(?:web\/build|server\/bin)(?:\/|$)/u;
const runtimeKeys = [
  "ATTACHMENT_S3_ENDPOINT",
  "ATTACHMENT_S3_BUCKET",
  "ATTACHMENT_S3_REGION",
  "ATTACHMENT_S3_ACCESS_KEY_ID",
  "ATTACHMENT_S3_SECRET_ACCESS_KEY",
  "APP_JWT_SECRET",
  "APP_ADMIN_USERNAME",
  "APP_ADMIN_PASSWORD",
  "APP_AUTH_SMS_MODE",
  "ERP_CUSTOMER_KEY",
  "ERP_PDF_CHROME_PATH",
];
const defaultCustomerKey = "yoyoosun";

function workspaceRuntimeSourceChanged(message) {
  const error = new Error(message);
  error.code = WORKSPACE_RUNTIME_SOURCE_CHANGED_CODE;
  return error;
}

export function readLocalRuntimeEnvironment(root, env = process.env) {
  const file = path.join(root, "server/.env");
  const result = {};
  if (fs.existsSync(file)) {
    const stat = fs.lstatSync(file);
    if (!stat.isFile() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0)
      throw new Error("server/.env 必须是仅当前用户可读的普通文件");
    const values = parseEnv(fs.readFileSync(file, "utf8"));
    for (const key of runtimeKeys) if (values[key]) result[key] = values[key];
  }
  for (const key of runtimeKeys) if (env[key]) result[key] = env[key];
  // `make dev_restart` exports this project default while direct read-only
  // identity checks do not. Normalize the effective value so both entrypoints
  // describe the same runtime configuration.
  result.ERP_CUSTOMER_KEY ||= defaultCustomerKey;
  return result;
}

export function assertRuntimeEnvironment(environment) {
  let endpoint;
  try {
    endpoint = new URL(environment.ATTACHMENT_S3_ENDPOINT);
  } catch {}
  if (
    !endpoint ||
    !["http:", "https:"].includes(endpoint.protocol) ||
    endpoint.username ||
    endpoint.password ||
    endpoint.pathname !== "/" ||
    endpoint.search ||
    endpoint.hash ||
    !/^[a-z0-9][a-z0-9-]{1,61}[a-z0-9]$/u.test(
      environment.ATTACHMENT_S3_BUCKET || "",
    ) ||
    !environment.ATTACHMENT_S3_ACCESS_KEY_ID ||
    !environment.ATTACHMENT_S3_SECRET_ACCESS_KEY
  ) {
    throw new Error(
      "本地附件存储配置不完整；请检查 server/.env 的 ATTACHMENT_S3_*，日常版本保持不变",
    );
  }
}

export function runtimeBundleDirectory(root, id) {
  if (!ID.test(String(id))) throw new Error("运行版本标识无效");
  return path.join(root, "output/dev-workbench/runtime-bundles", id);
}

function hashFiles(root, files) {
  const hash = createHash("sha256");
  for (const file of files) {
    const stat = fs.lstatSync(path.join(root, file));
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error(`运行版本包含非普通文件：${file}`);
    }
    hash
      .update(file)
      .update("\0")
      .update(fs.readFileSync(path.join(root, file)))
      .update("\0");
  }
  return hash.digest("hex");
}

function runtimeSourceFingerprint(contentFingerprint, environment) {
  return createHash("sha256")
    .update(contentFingerprint)
    .update(JSON.stringify(environment))
    .digest("hex");
}

export async function readRuntimeSource(root) {
  const { stdout } = await exec(
    "git",
    ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
    {
      cwd: root,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  const files = [
    ...new Set(
      stdout
        .split("\0")
        .filter(
          (file) =>
            SOURCE_ROOTS.some((prefix) => file.startsWith(prefix)) &&
            !omitted.test(file) &&
            !file.endsWith(".md") &&
            fs.existsSync(path.join(root, file)),
        ),
    ),
  ].sort();
  // Private configuration is part of the runtime identity, but never published.
  for (const file of [
    "server/configs/dev/config.local.yaml",
    "server/.env",
    "config/dev-ports.local.env",
  ]) {
    if (fs.existsSync(path.join(root, file)) && !files.includes(file))
      files.push(file);
  }
  files.sort();
  const environment = readLocalRuntimeEnvironment(root);
  const backendFiles = files.filter(
    (file) =>
      BACKEND_SOURCE_ROOTS.some((prefix) => file.startsWith(prefix)) ||
      file === "config/dev-ports.local.env",
  );
  const contentFingerprint = hashFiles(root, files);
  const backendContentFingerprint = hashFiles(root, backendFiles);
  return {
    files,
    fingerprint: runtimeSourceFingerprint(contentFingerprint, environment),
    contentFingerprint,
    backendFiles,
    backendFingerprint: runtimeSourceFingerprint(
      backendContentFingerprint,
      environment,
    ),
    backendContentFingerprint,
    environment,
  };
}

function artifactFiles(root, prefix = "") {
  return fs
    .readdirSync(path.join(root, prefix), { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const file = path.posix.join(prefix, entry.name);
      if (entry.isSymbolicLink()) throw new Error("运行制品不能包含符号链接");
      return entry.isDirectory() ? artifactFiles(root, file) : [file];
    });
}

export function hashRuntimeBackup(directory) {
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw new Error("恢复证据目录必须是普通目录");
  return hashFiles(directory, artifactFiles(directory));
}

export async function verifyRuntimeBackup(root, backup) {
  if (
    !backup ||
    !/^br-yoyoosun-[A-Za-z0-9+_-]+$/u.test(String(backup.id || "")) ||
    !Number.isSafeInteger(backup.sizeBytes) ||
    backup.sizeBytes < 1 ||
    !HASH.test(String(backup.sha256 || "")) ||
    backup.restoreVerified !== true
  )
    return false;
  try {
    const bundle = readRuntimeBundle(root, backup.bundleId);
    if (bundle.scope === "backend") return false;
    const directory = path.join(
      root,
      "output/dev-workbench/database-migration-backups",
      backup.id,
    );
    const proof = backup.candidate;
    if (
      proof?.artifactHash !== bundle.artifactHash ||
      proof?.populatedRestore !== true ||
      proof?.attachmentsRestored !== true ||
      proof?.health !== true ||
      proof?.ready !== true ||
      proof?.business !== true ||
      proof?.migrationVersion !== backup.migrationAfter ||
      bundle.migrationVersion !== backup.migrationAfter ||
      proof?.attachmentBackupSHA256 !==
        hashRuntimeBackup(path.join(directory, "attachments"))
    )
      return false;
    const file = path.join(directory, "database.dump");
    const stat = fs.lstatSync(file);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.size !== backup.sizeBytes
    )
      return false;
    const hash = createHash("sha256");
    for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
    return hash.digest("hex") === backup.sha256;
  } catch {
    return false;
  }
}

export async function verifyLocalRuntimeIdentity(
  bundle,
  origin,
  database = "plush_erp",
  fetchImpl = fetch,
) {
  const digest = createHash("sha256")
    .update(
      [
        "release-v1",
        database,
        runtimeServerVersion(bundle),
        bundle.migrationVersion,
      ].join("\n"),
    )
    .digest("hex");
  const response = await fetchImpl(`${origin}/readyz/runtime-identity`, {
    signal: AbortSignal.timeout(5000),
    redirect: "manual",
    headers: {
      "X-ERP-Runtime-Identity-Scope": "release-v1",
      "X-ERP-Expected-Runtime-Identity-SHA256": digest,
    },
  });
  if (
    !response.ok ||
    response.headers.get("X-ERP-Runtime-Identity-Proof") !== "matched-v1"
  )
    throw new Error("后端运行身份与固定版本或数据库不一致");
}

export function runtimeServerVersion(bundle) {
  return bundle.components?.backend?.version || `local-${bundle.id}`;
}

export function readRuntimeBundle(root, id) {
  const directory = runtimeBundleDirectory(root, id);
  const manifest = JSON.parse(
    fs.readFileSync(path.join(directory, "manifest.json"), "utf8"),
  );
  const actualFiles = artifactFiles(directory).filter(
    (file) => file !== "manifest.json",
  );
  if (
    manifest.schemaVersion !== "plush.local-runtime-bundle/v1" ||
    manifest.id !== id ||
    !HASH.test(manifest.sourceFingerprint) ||
    (manifest.backendSourceFingerprint !== undefined &&
      !HASH.test(manifest.backendSourceFingerprint)) ||
    (manifest.scope !== undefined &&
      !["backend", "full"].includes(manifest.scope)) ||
    (manifest.components !== undefined &&
      ![
        "backend",
        ...(manifest.scope === "backend" ? [] : ["attachment", "web"]),
      ].every(
        (component) =>
          HASH.test(manifest.components?.[component]?.fingerprint) &&
          (component === "web" ||
            (manifest.components?.[component]?.version?.startsWith("local-") &&
              ID.test(manifest.components[component].version.slice(6)))),
      )) ||
    manifest.platform !== process.platform ||
    manifest.arch !== process.arch ||
    !Array.isArray(manifest.files) ||
    manifest.files.some(
      (file) =>
        typeof file !== "string" ||
        file.startsWith("/") ||
        file.split("/").includes(".."),
    ) ||
    JSON.stringify(manifest.files) !== JSON.stringify(actualFiles) ||
    ![
      "runtime/server",
      "runtime/environment.json",
      ...(manifest.scope === "backend"
        ? []
        : ["runtime/attachment-storage", "runtime/web/index.html"]),
    ].every((file) => manifest.files.includes(file)) ||
    hashFiles(directory, manifest.files) !== manifest.artifactHash
  ) {
    throw new Error("固定运行版本的内容校验未通过；保留恢复页并重新准备");
  }
  return { ...manifest, directory };
}

export function readActiveRuntimeBundle(root) {
  const pointer = path.join(
    root,
    "output/dev-workbench/runtime-bundles/active.json",
  );
  if (!fs.existsSync(pointer)) return null;
  const active = JSON.parse(fs.readFileSync(pointer, "utf8"));
  const bundle = readRuntimeBundle(root, active.id);
  if (
    active.artifactHash !== bundle.artifactHash ||
    active.migrationVersion !== bundle.migrationVersion
  ) {
    throw new Error("日常运行版本与激活记录不一致");
  }
  return {
    ...bundle,
    activatedAt: active.activatedAt,
    runtime: active.runtime,
  };
}

export function activateRuntimeBundle(root, id, evidence) {
  const bundle = readRuntimeBundle(root, id);
  if (
    evidence?.artifactHash !== bundle.artifactHash ||
    evidence?.migrationVersion !== bundle.migrationVersion ||
    evidence?.health !== true ||
    evidence?.ready !== true ||
    evidence?.business !== true
  ) {
    throw new Error("缺少当前固定版本的运行验证，不能切换日常版本");
  }
  const directory = path.dirname(bundle.directory);
  const active = { ...evidence, id, activatedAt: new Date().toISOString() };
  const temporary = path.join(directory, `active-${id}.tmp`);
  fs.writeFileSync(temporary, `${JSON.stringify(active, null, 2)}\n`, {
    mode: 0o600,
    flag: "wx",
  });
  fs.renameSync(temporary, path.join(directory, "active.json"));
  return active;
}

export async function verifyBundleDatabase(root, bundle, auditDSN) {
  const checked = readRuntimeBundle(root, bundle.id);
  const { stdout } = await exec(
    "atlas",
    [
      "migrate",
      "status",
      "--dir",
      `file://${path.join(checked.directory, "source/server/internal/data/model/migrate")}`,
      "--url",
      auditDSN,
      "--format",
      "{{ json . }}",
    ],
    {
      cwd: root,
      env: { ...process.env, GIT_OPTIONAL_LOCKS: "0" },
      timeout: 15_000,
      maxBuffer: 4 * 1024 * 1024,
    },
  ).catch(() => {
    throw new Error("无法核对固定运行版本的数据库状态");
  });
  const status = JSON.parse(stdout);
  if (
    status.Current !== checked.migrationVersion ||
    status.Status !== "OK" ||
    (status.Pending || []).length !== 0 ||
    (status.Applied || []).length !== (status.Available || []).length
  ) {
    throw new Error("数据库与固定运行版本不匹配，不能启动或自动回退");
  }
  if (
    (await databaseQuery(auditDSN, databaseProgrammabilityReceiptSQL)) !==
    "database_programmability=0|0|0"
  ) {
    throw new Error(
      "数据库仍含自定义 Function、Procedure 或非内部 Trigger，不能启动",
    );
  }
  return checked;
}

export async function buildRuntimeBundle(
  root,
  id,
  execute,
  progress = () => {},
  {
    workspaceVerification = "full",
    scope = "full",
    forceBackendBuild = false,
  } = {},
) {
  if (
    !["full", "backend"].includes(workspaceVerification) ||
    !["full", "backend"].includes(scope)
  ) {
    throw new Error("固定运行版本的工作区核对范围无效");
  }
  const source = await readRuntimeSource(root);
  assertRuntimeEnvironment(source.environment);
  let inputs = await readRuntimeBuildInputs(root, source, execute, { scope });
  let previous;
  try {
    previous = readActiveRuntimeBundle(root);
  } catch {
    progress(
      "现有制品完整性核对未通过，正在从当前源码构建；原进程保留到候选通过检查",
    );
  }
  if (
    scope === "backend" &&
    !forceBackendBuild &&
    previous?.backendSourceFingerprint === source.backendFingerprint &&
    previous.components?.backend?.fingerprint === inputs.backend &&
    previous.platform === process.platform &&
    previous.arch === process.arch
  ) {
    progress(
      "构建输入未变化，复用已验证后端制品；跳过编译，继续重启与运行验证",
    );
    return { ...previous, reusedBuild: true, reusedBundle: true };
  }
  const directory = runtimeBundleDirectory(root, id);
  fs.mkdirSync(path.dirname(directory), { recursive: true, mode: 0o700 });
  fs.mkdirSync(directory, { recursive: false, mode: 0o700 });
  const sourceRoot = path.join(directory, "source");
  const snapshotFiles = [
    ...new Set([
      ...(scope === "backend"
        ? source.files.filter(
            (file) => file.startsWith("server/") || file.startsWith("config/"),
          )
        : source.files),
      ...inputs.files,
    ]),
  ].sort();
  const snapshotHash = hashFiles(root, snapshotFiles);
  for (const file of snapshotFiles) {
    const destination = path.join(sourceRoot, file);
    fs.mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
    fs.copyFileSync(
      path.join(root, file),
      destination,
      fs.constants.COPYFILE_EXCL,
    );
  }
  if (
    hashFiles(sourceRoot, snapshotFiles) !== snapshotHash ||
    (scope === "full" &&
      (workspaceVerification === "full"
        ? hashFiles(sourceRoot, source.files) !== source.contentFingerprint
        : hashFiles(sourceRoot, source.backendFiles) !==
          source.backendContentFingerprint))
  )
    throw workspaceRuntimeSourceChanged(
      "工作区在固定版本期间发生变化，请重新准备",
    );
  const capturedSourceFingerprint =
    scope === "full"
      ? runtimeSourceFingerprint(
          hashFiles(sourceRoot, source.files),
          source.environment,
        )
      : source.fingerprint;
  if (scope === "full" && workspaceVerification === "backend") {
    const capturedInputs = await readRuntimeBuildInputs(
      sourceRoot,
      source,
      execute,
      {
        scope,
        webDependencyRoot: root,
      },
    );
    if (
      capturedInputs.backend !== inputs.backend ||
      capturedInputs.attachment !== inputs.attachment
    )
      throw workspaceRuntimeSourceChanged(
        "后端构建输入在固定版本期间发生变化，请重新准备",
      );
    // Frontend edits before the copy belong to the captured candidate; later
    // Vite edits cannot rewrite its provenance or invalidate backend recovery.
    inputs = capturedInputs;
  }
  const env = { ...process.env, GIT_OPTIONAL_LOCKS: "0" };
  fs.mkdirSync(path.join(directory, "runtime"), { mode: 0o700 });
  fs.writeFileSync(
    path.join(directory, "runtime/environment.json"),
    JSON.stringify(source.environment),
    { mode: 0o600, flag: "wx" },
  );
  const components = {};
  let backendBuilt = false;
  const reuseComponent = (name, target) => {
    if (
      !previous ||
      previous.platform !== process.platform ||
      previous.arch !== process.arch ||
      previous.components?.[name]?.fingerprint !== inputs[name]
    )
      return false;
    const from = path.join(previous.directory, target);
    if (!fs.existsSync(from)) return false;
    fs.cpSync(from, path.join(directory, target), {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
    components[name] = previous.components[name];
    progress(
      `${name === "backend" ? "后端" : name === "attachment" ? "附件服务" : "固定页面"}构建输入未变化，复用已有制品`,
    );
    return true;
  };
  const goArgs = runtimeGoBuildArgs(`local-${id}`);
  if (forceBackendBuild || !reuseComponent("backend", "runtime/server")) {
    progress("正在编译当前后端；原后端继续运行");
    await execute(
      "go",
      [...goArgs, "-o", path.join(directory, "runtime/server"), "./cmd/server"],
      { cwd: path.join(sourceRoot, "server"), env },
    );
    components.backend = {
      fingerprint: inputs.backend,
      version: `local-${id}`,
    };
    backendBuilt = true;
  }
  if (scope === "full") {
    if (!reuseComponent("attachment", "runtime/attachment-storage")) {
      progress("正在编译迁移演练所需的附件服务");
      await execute(
        "go",
        [
          ...goArgs,
          "-o",
          path.join(directory, "runtime/attachment-storage"),
          "./cmd/attachment-storage",
        ],
        { cwd: path.join(sourceRoot, "server"), env },
      );
      components.attachment = {
        fingerprint: inputs.attachment,
        version: `local-${id}`,
      };
    }
    if (!reuseComponent("web", "runtime/web")) {
      progress("正在构建迁移演练所需的固定页面");
      const modules = path.join(sourceRoot, "web/node_modules");
      fs.symlinkSync(path.join(root, "web/node_modules"), modules, "dir");
      try {
        await execute(
          process.execPath,
          [
            path.join(root, "web/node_modules/vite/bin/vite.js"),
            "build",
            "--config",
            "vite.config.mjs",
            "--outDir",
            path.join(directory, "runtime/web"),
          ],
          {
            cwd: path.join(sourceRoot, "web"),
            env: { ...env, VITE_BASE_URL: "/", NODE_ENV: "production" },
          },
        );
      } finally {
        fs.unlinkSync(modules);
      }
      await execute(
        process.execPath,
        [
          path.join(sourceRoot, "scripts/build/apply-customer-web-config.mjs"),
          "--customer",
          source.environment.ERP_CUSTOMER_KEY,
          "--config-root",
          path.join(sourceRoot, "config"),
          "--web-build-dir",
          path.join(directory, "runtime/web"),
        ],
        { cwd: sourceRoot, env },
      );
      components.web = { fingerprint: inputs.web };
    }
  }
  const snapshotInputs = await readRuntimeBuildInputs(
    sourceRoot,
    source,
    execute,
    { scope, webDependencyRoot: root },
  );
  // Installed web dependencies belong to the checkout, outside the snapshot.
  if (
    snapshotInputs.backend !== inputs.backend ||
    (scope === "full" &&
      (snapshotInputs.attachment !== inputs.attachment ||
        snapshotInputs.web !== inputs.web))
  )
    throw workspaceRuntimeSourceChanged(
      "候选快照的构建输入发生变化，请重新准备",
    );
  progress("正在核对候选制品与当前工作区");
  const after = await readRuntimeSource(root);
  const currentInputs = await readRuntimeBuildInputs(root, after, execute, {
    scope,
  });
  if (
    currentInputs.backend !== inputs.backend ||
    (scope === "full" &&
      (currentInputs.attachment !== inputs.attachment ||
        currentInputs.webDependencies !== inputs.webDependencies ||
        (workspaceVerification === "full" &&
          currentInputs.web !== inputs.web)))
  )
    throw workspaceRuntimeSourceChanged(
      "构建期间编译输入或工具链发生变化，请重新准备",
    );
  const changed =
    workspaceVerification === "backend"
      ? after.backendFingerprint !== source.backendFingerprint
      : after.fingerprint !== source.fingerprint;
  if (changed)
    throw workspaceRuntimeSourceChanged("构建期间运行代码已变化，请重新准备");
  const migrationFiles = fs
    .readdirSync(path.join(sourceRoot, "server/internal/data/model/migrate"))
    .filter((file) => /^\d+_.+\.sql$/u.test(file))
    .sort();
  const files = artifactFiles(directory);
  const manifest = {
    schemaVersion: "plush.local-runtime-bundle/v1",
    id,
    scope,
    components,
    sourceFingerprint: capturedSourceFingerprint,
    backendSourceFingerprint: source.backendFingerprint,
    artifactHash: hashFiles(directory, files),
    files,
    migrationVersion: migrationFiles.at(-1)?.split("_")[0],
    builtAt: new Date().toISOString(),
    platform: process.platform,
    arch: process.arch,
  };
  fs.writeFileSync(
    path.join(directory, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    { mode: 0o600, flag: "wx" },
  );
  return {
    ...readRuntimeBundle(root, id),
    reusedBuild: !backendBuilt,
    reusedBundle: false,
  };
}
