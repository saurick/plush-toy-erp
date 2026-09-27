import fs from "node:fs";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import net from "node:net";
import { once } from "node:events";
import { promisify } from "node:util";
import { randomBytes } from "node:crypto";
import {
  readRuntimeBundle,
  assertRuntimeEnvironment,
  hashRuntimeBackup,
  verifyLocalRuntimeIdentity,
} from "./local-runtime-bundle.mjs";

const exec = promisify(execFile);

export async function waitForRehearsalStorage(
  check,
  { timeoutMs = 30_000, intervalMs = 500 } = {},
) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      await check();
      return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error("临时附件恢复存储未就绪；本次未恢复附件，日常存储不受影响");
}

export async function verifyRuntimeBusiness(
  apiOrigin,
  {
    username = process.env.APP_ADMIN_USERNAME || "admin",
    password = process.env.APP_ADMIN_PASSWORD || "adminadmin",
    customerKey = process.env.ERP_CUSTOMER_KEY || "yoyoosun",
    fetchImpl = fetch,
  } = {},
) {
  const rpc = async (url, method, params, token = "") => {
    const response = await fetchImpl(`${apiOrigin}/rpc/${url}`, {
      method: "POST",
      signal: AbortSignal.timeout(10_000),
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "runtime-upgrade-check",
        method,
        params,
      }),
    });
    const body = await response.json();
    if (!response.ok || body.result?.code !== 0)
      throw new Error(`运行验证未通过：${url}.${method}；检查受保护的启动日志`);
    return body.result.data;
  };
  const login = await rpc("auth", "admin_login", { username, password });
  const token = login?.access_token;
  if (!token) throw new Error("登录验证未返回有效会话");
  try {
    const context = await rpc(
      "customer_config",
      "get_effective_session",
      { customer_key: customerKey },
      token,
    );
    if (
      context?.session?.customer?.key !== customerKey ||
      !context.session.configRevision ||
      context.session.source !== "active_customer_config_revision"
    )
      throw new Error("候选业务未读取到目标客户的已激活配置", {
        cause: new Error(
          JSON.stringify({
            expectedCustomer: customerKey,
            actualCustomer: context?.session?.customer?.key,
            source: context?.session?.source,
            hasRevision: Boolean(context?.session?.configRevision),
          }),
        ),
      });
    await rpc("masterdata", "list_units", { page: 1, page_size: 10 }, token);
  } finally {
    await rpc("auth", "logout", {}, token);
  }
  return { login: true, customerConfig: true, business: true };
}

async function availablePort() {
  const server = net.createServer();
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

export async function rehearseRuntimeBundle(
  root,
  id,
  container,
  output,
  env = process.env,
) {
  const bundle = readRuntimeBundle(root, id);
  const fixed = JSON.parse(
    fs.readFileSync(
      path.join(bundle.directory, "runtime/environment.json"),
      "utf8",
    ),
  );
  assertRuntimeEnvironment(fixed);
  if (bundle.platform !== process.platform || bundle.arch !== process.arch)
    throw new Error("候选版本与本机运行平台不一致");
  if (!/^plush-yoyoosun-restore-br-yoyoosun-[A-Za-z0-9-]+$/u.test(container))
    throw new Error("候选版本只能连接本次恢复演练容器");
  const runID = `local_${id.replaceAll("-", "")}`;
  const database = `plush_erp_release_${runID}`;
  const name = `plush-runtime-${id}`;
  const storageSecret = path.join(output, "candidate-storage.env");
  const storage = `${name}-objects`;
  const access = randomBytes(24).toString("hex");
  const storagePassword = randomBytes(32).toString("hex");
  let createdStorage = false;
  let child;
  let childError;
  const docker = (args) =>
    exec("docker", args, {
      env: { ...env, GIT_OPTIONAL_LOCKS: "0" },
      timeout: 120_000,
      maxBuffer: 1024 * 1024,
    });
  try {
    const identity = (
      await docker([
        "exec",
        container,
        "psql",
        "-U",
        "postgres",
        "-d",
        database,
        "-XAtc",
        "SELECT system_identifier::text FROM pg_control_system()",
      ])
    ).stdout.trim();
    if (
      !/^\d{1,20}$/u.test(identity) ||
      !/^[a-zA-Z0-9._~-]{20,128}$/u.test(env.CANDIDATE_APP_PASSWORD || "")
    )
      throw new Error("恢复数据库身份或应用账号未就绪");
    const databasePort = (await docker(["port", container, "5432/tcp"])).stdout
      .trim()
      .split(":")
      .at(-1);
    if (!/^\d{4,5}$/u.test(databasePort)) throw new Error("恢复库本机端口无效");
    fs.writeFileSync(
      storageSecret,
      `AWS_ACCESS_KEY_ID=${access}\nAWS_SECRET_ACCESS_KEY=${storagePassword}\nS3_BUCKET=plush-runtime-rehearsal\n`,
      { mode: 0o600, flag: "wx" },
    );
    await docker([
      "run",
      "-d",
      "--name",
      storage,
      "-p",
      "127.0.0.1::8333",
      "--env-file",
      storageSecret,
      "chrislusf/seaweedfs:4.47@sha256:ce9e796f1fe6f06968f4c04bdaf8f678dad9c8acdfef3d244133d71bfa6bf882",
      "mini",
      "-dir=/data",
      "-admin.ui=false",
      "-webdav=false",
      "-s3.iam=false",
      "-s3.port.iceberg=0",
      "-s3.port.lance=0",
    ]);
    createdStorage = true;
    const storagePort = (await docker(["port", storage, "8333/tcp"])).stdout
      .trim()
      .split(":")
      .at(-1);
    const candidateDSN = `postgres://erp_app:${env.CANDIDATE_APP_PASSWORD}@127.0.0.1:${databasePort}/${database}?sslmode=disable`;
    const objectEnvironment = {
      ATTACHMENT_S3_ENDPOINT: `http://127.0.0.1:${storagePort}`,
      ATTACHMENT_S3_BUCKET: "plush-runtime-rehearsal",
      ATTACHMENT_S3_ACCESS_KEY_ID: access,
      ATTACHMENT_S3_SECRET_ACCESS_KEY: storagePassword,
    };
    const attachments = path.join(output, "attachments");
    const attachmentCommand = (mode, storageEnvironment) =>
      exec(
        path.join(bundle.directory, "runtime/attachment-storage"),
        [
          "-mode",
          mode,
          "-database",
          database,
          "-dir",
          attachments,
          "-execute",
          "-confirm",
          `ATTACHMENT_${mode.toUpperCase()}:${database}`,
        ],
        {
          env: {
            ...env,
            ...fixed,
            ...storageEnvironment,
            GIT_OPTIONAL_LOCKS: "0",
            POSTGRES_DSN: candidateDSN,
            PGOPTIONS: "-c default_transaction_read_only=on",
          },
          timeout: mode === "check" ? 3000 : 300_000,
          maxBuffer: 1024 * 1024,
        },
      );
    await attachmentCommand("backup", {});
    await waitForRehearsalStorage(() =>
      attachmentCommand("check", objectEnvironment),
    );
    // The paired dump selects immutable object keys; ordinary writes after the
    // dump cannot change the files that this restoration must prove.
    await attachmentCommand("restore", objectEnvironment);
    const port = await availablePort();
    const origin = `http://127.0.0.1:${port}`;
    const descriptor = fs.openSync(
      path.join(output, "candidate-runtime.log"),
      "a",
      0o600,
    );
    try {
      child = spawn(path.join(bundle.directory, "runtime/server"), [], {
        cwd: path.join(bundle.directory, "source/server"),
        env: {
          ...env,
          ...fixed,
          GIT_OPTIONAL_LOCKS: "0",
          GIT_SHA: `local-${id}`,
          DEV_HTTP_PORT: String(port),
          PLUSH_GITLAB_READ_TOKEN: "",
          PLUSH_GITLAB_TOKEN: "",
          POSTGRES_DSN: candidateDSN,
          ERP_CUSTOMER_KEY: fixed.ERP_CUSTOMER_KEY || "yoyoosun",
          ERP_ALLOW_LOCAL_TEST_CUSTOMER_CONFIG: "0",
          ERP_ALLOW_RELEASE_REHEARSAL_CUSTOMER_CONFIG: "1",
          ERP_RELEASE_REHEARSAL_ID: runID,
          ERP_RELEASE_REHEARSAL_PG_SYSTEM_IDENTIFIER: identity,
          ERP_DEBUG_SEED_ENABLED: "false",
          ERP_DEBUG_CLEANUP_ENABLED: "false",
          ERP_DEBUG_BUSINESS_CLEAR_ENABLED: "false",
          ...objectEnvironment,
        },
        detached: true,
        stdio: ["ignore", descriptor, descriptor],
      });
      child.once("error", (error) => {
        childError = error;
      });
    } finally {
      fs.closeSync(descriptor);
    }
    let ready = false;
    let reason = "unreachable";
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      if (childError || child.exitCode !== null || child.signalCode) break;
      try {
        const health = await fetch(`${origin}/healthz`, {
          signal: AbortSignal.timeout(2000),
        });
        const readiness = await fetch(`${origin}/readyz`, {
          signal: AbortSignal.timeout(2000),
        });
        reason = (await readiness.text()).trim();
        if (
          health.ok &&
          readiness.ok &&
          (await health.text()).trim() === "ok" &&
          reason === "ready"
        ) {
          ready = true;
          break;
        }
        if (reason === "pdf warmup failed") break;
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!ready)
      throw new Error(
        `候选后端在恢复库未就绪（${reason}）；日常运行版本不受影响`,
      );
    await verifyLocalRuntimeIdentity(bundle, origin, database);
    const smoke = await verifyRuntimeBusiness(origin, {
      username: fixed.APP_ADMIN_USERNAME,
      password: fixed.APP_ADMIN_PASSWORD,
      customerKey: fixed.ERP_CUSTOMER_KEY || "yoyoosun",
    });
    const proof = {
      schemaVersion: "plush.local-runtime-rehearsal/v1",
      bundleId: id,
      artifactHash: bundle.artifactHash,
      sourceFingerprint: bundle.sourceFingerprint,
      migrationVersion: bundle.migrationVersion,
      populatedRestore: true,
      attachmentsRestored: true,
      attachmentBackupSHA256: hashRuntimeBackup(attachments),
      health: true,
      ready: true,
      ...smoke,
      verifiedAt: new Date().toISOString(),
    };
    fs.writeFileSync(
      path.join(output, "candidate-runtime-proof.json"),
      JSON.stringify(proof, null, 2) + "\n",
      { mode: 0o600 },
    );
    return proof;
  } catch (error) {
    fs.writeFileSync(
      path.join(output, "candidate-error.log"),
      String(error.stdout || "") +
        String(error.stderr || "") +
        String(error.message || "") +
        (error.cause ? `\n${error.cause.message}` : ""),
      { mode: 0o600 },
    );
    throw error;
  } finally {
    if (child?.pid && child.exitCode === null && !child.signalCode) {
      const exited = once(child, "exit");
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch {}
      const timer = setTimeout(() => {
        try {
          process.kill(-child.pid, "SIGKILL");
        } catch {}
      }, 10_000);
      try {
        await exited;
      } finally {
        clearTimeout(timer);
      }
    }
    if (createdStorage) await docker(["rm", "-fv", storage]);
    if (fs.existsSync(storageSecret)) fs.unlinkSync(storageSecret);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === import.meta.filename) {
  const [id, container, output] = process.argv.slice(2);
  rehearseRuntimeBundle(
    path.resolve(import.meta.dirname, ".."),
    id,
    container,
    output,
  )
    .then(() =>
      console.log(
        "[runtime-rehearsal] passed: populated restore / candidate startup / login / business read",
      ),
    )
    .catch((error) => {
      console.error(
        error.message?.startsWith("Command failed")
          ? "候选运行验证命令失败；诊断保存在本次私有目录"
          : error.message,
      );
      process.exitCode = 1;
    });
}
