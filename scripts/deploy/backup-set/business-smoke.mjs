import fs from "node:fs";
import path from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { requireValue, waitFor } from "./common.mjs";

// All requests stay inside the disposable network. Credentials and response
// bodies are consumed in memory and never enter the public recovery receipt.
export async function verifyRestoredBusiness({
  manifest,
  work,
  appImage,
  app,
  pg,
  s3,
  network,
  access,
  secret,
  credentials,
  scalar,
  run,
  signal,
}) {
  requireValue(
    Boolean(credentials?.username && credentials?.password),
    "restore_business_credentials_missing",
  );
  requireValue(
    /^[a-z][a-z0-9_-]{1,63}$/u.test(manifest.customer),
    "restore_customer_identity_invalid",
  );
  requireValue(
    /^[a-z][a-z0-9_]{1,62}$/u.test(manifest.database),
    "restore_database_identity_invalid",
  );
  const isolatedNetwork = JSON.parse(
    await run(["docker", "network", "inspect", network], { signal }),
  )[0];
  requireValue(
    isolatedNetwork?.Internal === true,
    "restore_network_not_internal",
  );
  const activeConfig = manifest.activeCustomerConfig.find(
    (item) => item.customer_key === manifest.customer,
  );
  const trialTarget = activeConfig?.product_version?.match(
    /^(customer-trial-[a-z0-9-]+)-test-\d{4}\.\d{2}\.\d{2}-v\d+$/u,
  )?.[1];
  const random = () => randomBytes(32).toString("hex");
  const appPassword = random(),
    migratorPassword = random(),
    backupPassword = random();
  const roleEnv = path.join(work, "roles.env");
  fs.writeFileSync(
    roleEnv,
    [
      "POSTGRES_USER=postgres",
      `POSTGRES_DB=${manifest.database}`,
      `POSTGRES_APP_PASSWORD=${appPassword}`,
      `POSTGRES_MIGRATOR_PASSWORD=${migratorPassword}`,
      `POSTGRES_BACKUP_PASSWORD=${backupPassword}`,
    ].join("\n") + "\n",
    { mode: 0o600, flag: "wx" },
  );
  for (const mode of ["reconcile", "verify"])
    await run(
      [
        "docker",
        "exec",
        "-i",
        "--env-file",
        roleEnv,
        pg,
        "bash",
        "-s",
        "--",
        mode,
      ],
      {
        input: fs.readFileSync(
          new URL(
            "../../../server/deploy/compose/prod/database_roles.sh",
            import.meta.url,
          ),
          "utf8",
        ),
        signal,
      },
    );
  const appEnv = path.join(work, "app.env");
  fs.writeFileSync(
    appEnv,
    [
      `POSTGRES_DSN=postgres://erp_app:${appPassword}@postgres:5432/${manifest.database}?sslmode=disable`,
      `ERP_CUSTOMER_KEY=${manifest.customer}`,
      `APP_JWT_SECRET=${random()}`,
      "APP_AUTH_SMS_MODE=disabled",
      "BOOTSTRAP_ADMIN_ONCE=false",
      "ERP_DEBUG_ENV=prod",
      "ERP_DEBUG_SEED_ENABLED=false",
      "ERP_DEBUG_CLEANUP_ENABLED=false",
      "ERP_DEBUG_BUSINESS_CLEAR_ENABLED=false",
      ...(trialTarget
        ? [
            "ERP_ALLOW_CUSTOMER_TRIAL_CONFIG=1",
            `ERP_CUSTOMER_TRIAL_TARGET=${trialTarget}`,
          ]
        : []),
      "TRACE_RATIO=0",
      "TRACE_ENDPOINT=127.0.0.1:4318",
      "ERP_PDF_CHROME_PATH=/usr/bin/chromium",
      "ERP_PDF_WARMUP=async",
      `ATTACHMENT_S3_ENDPOINT=http://${s3}:8333`,
      "ATTACHMENT_S3_BUCKET=plush-set-restore",
      "ATTACHMENT_S3_REGION=us-east-1",
      `ATTACHMENT_S3_ACCESS_KEY_ID=${access}`,
      `ATTACHMENT_S3_SECRET_ACCESS_KEY=${secret}`,
    ].join("\n") + "\n",
    { mode: 0o600, flag: "wx" },
  );
  await run(
    [
      "docker",
      "run",
      "-d",
      "--init",
      "--name",
      app,
      "--network",
      network,
      "--label",
      `plush.backup-set=${network}`,
      "--cpus",
      "2",
      "--memory",
      "2g",
      "--pids-limit",
      "512",
      "--shm-size",
      "256m",
      "--security-opt",
      `seccomp=${fileURLToPath(new URL("../../../server/deploy/compose/prod/chromium-seccomp.json", import.meta.url))}`,
      "--env-file",
      appEnv,
      appImage,
    ],
    { signal },
  );
  const curl = (route, { body, token } = {}) => {
    const config = [
      `url = "http://127.0.0.1:8300${route}"`,
      "fail",
      "silent",
      "show-error",
      "max-time = 30",
    ];
    if (token)
      config.push(
        `header = ${JSON.stringify(`Authorization: Bearer ${token}`)}`,
      );
    if (body)
      config.push(
        'header = "Content-Type: application/json"',
        `data = ${JSON.stringify(JSON.stringify(body))}`,
      );
    return run(["docker", "exec", "-i", app, "curl", "--config", "-"], {
      input: config.join("\n") + "\n",
      signal,
      timeout: 35_000,
    });
  };
  const checks = [];
  const record = (key, extra = {}) => {
    checks.push({ key, status: "passed", ...extra });
    process.stderr.write(
      JSON.stringify({
        event: "backup_restore_business_check",
        backupId: manifest.backupId,
        check: key,
        status: "passed",
      }) + "\n",
    );
  };
  process.stderr.write(
    JSON.stringify({
      event: "backup_restore_business_starting",
      backupId: manifest.backupId,
      container: app,
    }) + "\n",
  );
  await waitFor(
    async () => {
      try {
        await curl("/readyz");
        return true;
      } catch {
        const state = JSON.parse(
          await run(["docker", "inspect", "--format", "{{json .State}}", app], {
            signal,
          }),
        );
        requireValue(state.Running === true, "restore_business_app_exited");
        return false;
      }
    },
    { signal, attempts: 180 },
  );
  await curl("/healthz");
  record("health");
  await curl("/readyz");
  record("ready");
  const rpc = async (domain, method, params, token) => {
    const response = JSON.parse(
      await curl(`/rpc/${domain}`, {
        body: { jsonrpc: "2.0", id: `restore-${method}`, method, params },
        token,
      }),
    );
    requireValue(
      !response.error && response.result?.code === 0,
      `restore_business_rpc_failed:${domain}:${method}`,
    );
    return response.result.data;
  };
  const login = await rpc("auth", "admin_login", credentials);
  requireValue(
    typeof login?.access_token === "string" && login.access_token.length > 0,
    "restore_login_token_missing",
  );
  const token = login.access_token;
  record("login");
  try {
    const effective = await rpc(
      "customer_config",
      "get_effective_session",
      { customer_key: manifest.customer },
      token,
    );
    const expected = activeConfig;
    requireValue(
      Boolean(expected) &&
        effective?.session?.configRevision === expected.revision &&
        effective.session?.source === "active_customer_config_revision",
      "restore_effective_config_mismatch",
    );
    record("customer-config", { revision: expected.revision });
    const units = await rpc(
      "masterdata",
      "list_units",
      { limit: 10, offset: 0 },
      token,
    );
    requireValue(
      Array.isArray(units?.units) && units.units.length > 0,
      "restore_units_missing",
    );
    record("units", { recordsRead: units.units.length });
    const orders = await rpc(
      "sales_order",
      "list_sales_orders",
      { limit: 10, offset: 0 },
      token,
    );
    requireValue(
      Array.isArray(orders?.sales_orders),
      "restore_sales_orders_missing",
    );
    const orderCount = Number(
      await scalar("SELECT count(*) FROM sales_orders"),
    );
    requireValue(
      orderCount === 0 || orders.sales_orders.length > 0,
      "restore_sales_orders_unreadable",
    );
    record("sales-orders", {
      recordsRead: orders.sales_orders.length,
      sourceCount: orderCount,
    });
    const rows = JSON.parse(
      await scalar(
        "SELECT COALESCE(json_agg(t),'[]') FROM (SELECT id,sha256,file_size FROM business_attachments WHERE withdrawn_at IS NULL ORDER BY id LIMIT 3) t",
      ),
    );
    requireValue(
      Array.isArray(rows) &&
        (manifest.attachmentCount === 0 || rows.length > 0),
      "restore_attachment_sample_missing",
    );
    for (const row of rows) {
      const data = await rpc(
        "attachment",
        "download_attachment",
        { id: row.id },
        token,
      );
      const content = Buffer.from(
        data?.attachment?.content_base64 || "",
        "base64",
      );
      requireValue(
        content.length === row.file_size &&
          createHash("sha256").update(content).digest("hex") === row.sha256,
        "restore_attachment_download_mismatch",
      );
    }
    record("attachment-download", {
      sampled: rows.length,
      totalRestored: manifest.attachmentCount,
    });
  } finally {
    await rpc("auth", "logout", {}, token);
    record("logout");
  }
  return {
    status: "passed",
    releaseSha: manifest.releaseSha,
    backupId: manifest.backupId,
    responseBodiesStored: false,
    checks,
  };
}
