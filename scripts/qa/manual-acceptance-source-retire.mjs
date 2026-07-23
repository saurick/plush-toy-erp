#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  ROLE_USERS,
  buildManualAcceptanceSourceDataPlan,
} from "./manual-acceptance-source-data.mjs";
import {
  CUSTOMER_TRIAL_133_TARGET,
  assertManualAcceptanceCapabilitiesPolicy,
  assertManualAcceptanceMutationTarget,
  assertManualAcceptanceRuntimeIdentityPrecondition,
  assertManualAcceptanceRuntimePolicy,
  assertManualAcceptanceTargetAttestation,
  manualAcceptanceRuntimeCapabilitiesFromAttestation,
  normalizeManualAcceptanceBackendURL,
  parseManualAcceptanceTargetAttestation,
  resolveManualAcceptanceTarget,
} from "./manual-acceptance-target-policy.mjs";

const DEFAULT_BACKEND_URL = "http://127.0.0.1:8300";
const DEFAULT_OUT_DIR = "output/qa/manual-acceptance/source-retire";
const CUSTOMER_KEY = "yoyoosun";
const CONFIRM_PHRASE = "RETIRE_SIMULATED_MANUAL_ACCEPTANCE_SOURCE_DATA";
const REQUIRED_RETIREMENT_MODULES = Object.freeze([
  "customers",
  "suppliers",
  "products",
  "materials",
  "processes",
  "sales_orders",
  "purchase_orders",
  "outsourcing_orders",
  "material_bom",
]);

const DATASET_SPECS = Object.freeze([
  {
    key: "salesOrders",
    role: "sales",
    domain: "sales_order",
    method: "list_sales_orders",
    listKey: "sales_orders",
  },
  {
    key: "purchaseOrders",
    role: "purchase",
    domain: "purchase_order",
    method: "list_purchase_orders",
    listKey: "purchase_orders",
  },
  {
    key: "outsourcingOrders",
    role: "production",
    domain: "outsourcing_order",
    method: "list_outsourcing_orders",
    listKey: "outsourcing_orders",
  },
  {
    key: "bomVersions",
    role: "engineering",
    domain: "bom",
    method: "list_bom_versions",
    listKey: "bom_versions",
  },
  {
    key: "productSkus",
    role: "engineering",
    domain: "masterdata",
    method: "list_product_skus",
    listKey: "product_skus",
  },
  {
    key: "processes",
    role: "engineering",
    domain: "masterdata",
    method: "list_processes",
    listKey: "processes",
  },
  {
    key: "materials",
    role: "purchase",
    domain: "masterdata",
    method: "list_materials",
    listKey: "materials",
  },
  {
    key: "products",
    role: "engineering",
    domain: "masterdata",
    method: "list_products",
    listKey: "products",
  },
  {
    key: "suppliers",
    role: "purchase",
    domain: "masterdata",
    method: "list_suppliers",
    listKey: "suppliers",
  },
  {
    key: "customers",
    role: "sales",
    domain: "masterdata",
    method: "list_customers",
    listKey: "customers",
  },
]);

const DOCUMENT_RETIREMENT = Object.freeze({
  salesOrders: {
    domain: "sales_order",
    method: "cancel_sales_order",
    role: "sales",
    statusKey: "lifecycle_status",
    terminal: new Set(["CLOSED", "CANCELLED", "CANCELED"]),
    label: "销售订单",
  },
  purchaseOrders: {
    domain: "purchase_order",
    method: "cancel_purchase_order",
    role: "purchase",
    statusKey: "lifecycle_status",
    terminal: new Set(["CLOSED", "CANCELLED", "CANCELED"]),
    label: "采购订单",
  },
  outsourcingOrders: {
    domain: "outsourcing_order",
    method: "cancel_outsourcing_order",
    role: "production",
    statusKey: "lifecycle_status",
    terminal: new Set(["CLOSED", "CANCELLED", "CANCELED"]),
    label: "委外订单",
  },
  bomVersions: {
    domain: "bom",
    method: "archive_bom_version",
    role: "engineering",
    statusKey: "status",
    terminal: new Set(["ARCHIVED"]),
    label: "产品结构版本",
  },
});

const MASTER_RETIREMENT = Object.freeze({
  productSkus: {
    domain: "masterdata",
    method: "set_product_sku_active",
    role: "engineering",
    label: "产品规格",
  },
  processes: {
    domain: "masterdata",
    method: "set_process_active",
    role: "engineering",
    label: "加工环节",
  },
  materials: {
    domain: "masterdata",
    method: "set_material_active",
    role: "purchase",
    label: "材料",
  },
  products: {
    domain: "masterdata",
    method: "set_product_active",
    role: "engineering",
    label: "产品",
  },
  suppliers: {
    domain: "masterdata",
    method: "set_supplier_active",
    role: "purchase",
    label: "供应商",
  },
  customers: {
    domain: "masterdata",
    method: "set_customer_active",
    role: "sales",
    label: "客户",
  },
});

class CliError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

function requiredText(value, name) {
  const normalized = String(value ?? "").trim();
  if (!normalized) throw new CliError(`${name} is required`);
  return normalized;
}

function normalizeBackendURL(value) {
  return normalizeManualAcceptanceBackendURL(value || DEFAULT_BACKEND_URL);
}

function rpcURL(backendURL, domain) {
  return new URL(`/rpc/${domain}`, `${backendURL}/`).toString();
}

async function rpcCall({
  backendURL,
  domain,
  method,
  params = {},
  token,
  fetchImpl = fetch,
}) {
  const response = await fetchImpl(rpcURL(backendURL, domain), {
    method: "POST",
    redirect: "error",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `manual-acceptance-retire-${domain}-${method}-${Date.now()}`,
      method,
      params:
        domain === "auth" ? params : { customer_key: CUSTOMER_KEY, ...params },
    }),
  });
  if (response.redirected === true) {
    throw new CliError(`${domain}.${method} refused a redirected response`);
  }
  if (!response.ok) {
    throw new CliError(`${domain}.${method} HTTP ${response.status}`);
  }
  const json = await response.json();
  if (json?.result?.code !== 0) {
    throw new CliError(
      `${domain}.${method} code=${json?.result?.code} message=${json?.result?.message}`,
    );
  }
  return json.result.data || {};
}

async function loginRoles({
  backendURL,
  password,
  seedAdminPassword,
  includeSeedAdmin,
  fetchImpl,
}) {
  const roleEntries = Object.entries(ROLE_USERS).filter(
    ([role]) => includeSeedAdmin || role !== "seedAdmin",
  );
  const entries = await Promise.all(
    roleEntries.map(async ([role, username]) => {
      const data = await rpcCall({
        backendURL,
        domain: "auth",
        method: "admin_login",
        params: {
          username,
          password: role === "seedAdmin" ? seedAdminPassword : password,
        },
        fetchImpl,
      });
      const token = data.access_token || data.token;
      if (!token)
        throw new CliError(`${username}: login response missing token`);
      if (username === ROLE_USERS.seedAdmin && data.is_super_admin !== true) {
        throw new CliError(
          `${username}: manual acceptance retirement writer must be a runtime super admin`,
        );
      }
      return [role, token];
    }),
  );
  return Object.fromEntries(entries);
}

function resolveRetirementTargetAttestation(policy, value) {
  const parsed = parseManualAcceptanceTargetAttestation(value);
  if (policy.target === CUSTOMER_TRIAL_133_TARGET) {
    return assertManualAcceptanceTargetAttestation({
      policy,
      attestation: parsed,
    });
  }
  if (parsed) {
    assertManualAcceptanceTargetAttestation({
      policy,
      attestation: parsed,
    });
  }
  return undefined;
}

async function assertSafeRuntime({
  plan,
  tokens,
  targetAttestation,
  fetchImpl,
}) {
  const capabilities = !targetAttestation || tokens.seedAdmin
    ? await rpcCall({
        backendURL: plan.backendURL,
        domain: "debug",
        method: "capabilities",
        token: tokens.seedAdmin || tokens.sales,
        fetchImpl,
      })
    : manualAcceptanceRuntimeCapabilitiesFromAttestation({
        policy: plan,
        attestation: targetAttestation,
      });
  assertManualAcceptanceCapabilitiesPolicy({ policy: plan, capabilities });
  const data = await rpcCall({
    backendURL: plan.backendURL,
    domain: "customer_config",
    method: "get_effective_session",
    token: tokens.sales,
    fetchImpl,
  });
  const session = data.session || {};
  const runtime = assertManualAcceptanceRuntimePolicy({
    policy: plan,
    capabilities,
    session,
    requiredModules: REQUIRED_RETIREMENT_MODULES,
    customerKey: CUSTOMER_KEY,
  });
  return targetAttestation
    ? {
        ...runtime,
        targetAttestation: {
          source: "out-of-band",
          release: targetAttestation.release,
          migration: targetAttestation.migration,
        },
      }
    : runtime;
}

function upper(value) {
  return String(value || "")
    .trim()
    .toUpperCase();
}

function itemIdentity(item) {
  return (
    item.order_no ||
    item.purchase_order_no ||
    item.outsourcing_order_no ||
    item.version ||
    item.sku_code ||
    item.code ||
    String(item.id)
  );
}

function retirementIdentityAllowlists(plan) {
  const records = plan?.records || {};
  const values = {
    salesOrders: (records.salesOrders || []).map((item) => item.order_no),
    purchaseOrders: (records.purchaseOrders || []).map(
      (item) => item.purchase_order_no,
    ),
    outsourcingOrders: (records.outsourcingOrders || []).map(
      (item) => item.outsourcing_order_no,
    ),
    bomVersions: (records.bomVersions || []).map((item) => item.version),
    productSkus: (records.products || []).flatMap((product) =>
      (product.skus || []).map((item) => item.sku_code),
    ),
    processes: (records.processes || []).map((item) => item.code),
    materials: (records.materials || []).map((item) => item.code),
    products: (records.products || []).map((item) => item.code),
    suppliers: (records.suppliers || []).map((item) => item.code),
    customers: (records.customers || []).map((item) => item.code),
  };
  return Object.fromEntries(
    Object.entries(values).map(([datasetKey, identities]) => {
      const normalized = identities.map((value) => requiredText(value, datasetKey));
      if (
        normalized.length === 0 ||
        new Set(normalized).size !== normalized.length
      ) {
        throw new CliError(
          `source retirement ${datasetKey} identity allowlist is empty or duplicated`,
          2,
        );
      }
      return [datasetKey, new Set(normalized)];
    }),
  );
}

function assertExactRetirementSnapshot(datasetKey, items, allowlist) {
  const identities = items.map((item) => itemIdentity(item));
  const actual = new Set(identities);
  const duplicate = identities.find(
    (identity, index) => identities.indexOf(identity) !== index,
  );
  const unknown = identities.filter((identity) => !allowlist.has(identity));
  const missing = [...allowlist].filter((identity) => !actual.has(identity));
  if (duplicate || unknown.length > 0 || missing.length > 0) {
    throw new CliError(
      `source retirement ${datasetKey} exact batch mismatch: duplicate=${duplicate || "none"} unknown=${unknown.slice(0, 3).join(",") || "none"} missing=${missing.slice(0, 3).join(",") || "none"}`,
      2,
    );
  }
  return items;
}

export function buildManualAcceptanceRetirementActions(snapshot) {
  const actions = [];
  for (const [datasetKey, config] of Object.entries(DOCUMENT_RETIREMENT)) {
    for (const item of snapshot[datasetKey] || []) {
      const status = upper(item[config.statusKey]);
      if (config.terminal.has(status)) continue;
      actions.push({
        datasetKey,
        label: config.label,
        key: itemIdentity(item),
        currentStatus: status || "UNKNOWN",
        role: config.role,
        domain: config.domain,
        method: config.method,
        params: { id: item.id },
      });
    }
  }
  for (const [datasetKey, config] of Object.entries(MASTER_RETIREMENT)) {
    for (const item of snapshot[datasetKey] || []) {
      if (item.is_active === false) continue;
      actions.push({
        datasetKey,
        label: config.label,
        key: itemIdentity(item),
        currentStatus: "ENABLED",
        role: config.role,
        domain: config.domain,
        method: config.method,
        params: { id: item.id, active: false },
      });
    }
  }
  return actions;
}

export function assertManualAcceptanceRetirementComplete(snapshot) {
  const remaining = buildManualAcceptanceRetirementActions(snapshot);
  if (remaining.length > 0) {
    throw new CliError(
      `source retirement verification found ${remaining.length} records still active or non-terminal`,
    );
  }
  return true;
}

async function loadSnapshot({ plan, tokens, fetchImpl }) {
  const allowlists = retirementIdentityAllowlists(plan);
  const entries = await Promise.all(
    DATASET_SPECS.map(async (spec) => {
      const data = await rpcCall({
        backendURL: plan.backendURL,
        domain: spec.domain,
        method: spec.method,
        params: { keyword: plan.prefix, active_only: false, limit: 200 },
        token: tokens[spec.role],
        fetchImpl,
      });
      return [
        spec.key,
        assertExactRetirementSnapshot(
          spec.key,
          data[spec.listKey] || [],
          allowlists[spec.key],
        ),
      ];
    }),
  );
  return Object.fromEntries(entries);
}

function summarize(snapshot, actions) {
  const found = Object.fromEntries(
    DATASET_SPECS.map((spec) => [spec.key, (snapshot[spec.key] || []).length]),
  );
  const planned = {};
  for (const action of actions) {
    planned[action.datasetKey] = (planned[action.datasetKey] || 0) + 1;
  }
  return { found, planned, totalActions: actions.length };
}

export async function retireManualAcceptanceSourceData(
  plan,
  {
    apply = false,
    password,
    adminPassword,
    retireConfirm = process.env.MANUAL_ACCEPTANCE_RETIRE_CONFIRM,
    targetConfirmation = process.env.MANUAL_ACCEPTANCE_TARGET_CONFIRM,
    targetAttestation = process.env.MANUAL_ACCEPTANCE_TARGET_ATTESTATION_JSON,
    fetchImpl = fetch,
  } = {},
) {
  const backendURL = normalizeBackendURL(plan?.backendURL);
  const targetPolicy = resolveManualAcceptanceTarget({ ...plan, backendURL });
  const safePlan = {
    ...plan,
    backendURL: targetPolicy.backendURL,
    target: targetPolicy.target,
    datasetKey: targetPolicy.datasetKey,
    dataVersion: targetPolicy.dataVersion,
    runId: targetPolicy.runId || plan?.runId,
  };
  if (apply) {
    assertManualAcceptanceMutationTarget(safePlan, {
      confirmation: targetConfirmation,
    });
  }
  const parsedTargetAttestation = resolveRetirementTargetAttestation(
    targetPolicy,
    targetAttestation,
  );
  if (apply && retireConfirm !== CONFIRM_PHRASE) {
    throw new CliError(
      `apply requires MANUAL_ACCEPTANCE_RETIRE_CONFIRM=${CONFIRM_PHRASE}`,
      2,
    );
  }
  const effectivePassword = requiredText(
    password ||
      process.env.MANUAL_ACCEPTANCE_PASSWORD ||
      process.env.TRIAL_ACCOUNT_PASSWORD ||
      process.env.ERP_ROLE_DEMO_PASSWORD,
    "MANUAL_ACCEPTANCE_PASSWORD/TRIAL_ACCOUNT_PASSWORD/ERP_ROLE_DEMO_PASSWORD",
  );
  const effectiveAdminPassword = apply
    ? requiredText(
        adminPassword || process.env.MANUAL_ACCEPTANCE_ADMIN_PASSWORD,
        "MANUAL_ACCEPTANCE_ADMIN_PASSWORD",
      )
    : undefined;
  if (apply) {
    await assertManualAcceptanceRuntimeIdentityPrecondition({
      policy: targetPolicy,
      attestation: parsedTargetAttestation,
      fetchImpl,
    });
  }
  const tokens = await loginRoles({
    backendURL: safePlan.backendURL,
    password: effectivePassword,
    seedAdminPassword: effectiveAdminPassword,
    includeSeedAdmin: apply,
    fetchImpl,
  });
  const runtime = await assertSafeRuntime({
    plan: safePlan,
    tokens,
    targetAttestation: parsedTargetAttestation,
    fetchImpl,
  });
  const snapshot = await loadSnapshot({ plan: safePlan, tokens, fetchImpl });
  const actions = buildManualAcceptanceRetirementActions(snapshot);
  const executed = [];
  let postApplySummary = null;
  if (apply) {
    for (const action of actions) {
      await rpcCall({
        backendURL: safePlan.backendURL,
        domain: action.domain,
        method: action.method,
        params: action.params,
        token: tokens.seedAdmin,
        fetchImpl,
      });
      executed.push({
        datasetKey: action.datasetKey,
        key: action.key,
        method: action.method,
      });
    }
    const afterSnapshot = await loadSnapshot({
      plan: safePlan,
      tokens,
      fetchImpl,
    });
    assertManualAcceptanceRetirementComplete(afterSnapshot);
    postApplySummary = summarize(afterSnapshot, []);
  }
  return {
    mode: apply ? "apply" : "dry-run",
    generatedAt: new Date().toISOString(),
    runId: safePlan.runId,
    target: safePlan.target,
    datasetKey: safePlan.datasetKey,
    dataVersion: safePlan.dataVersion,
    prefix: safePlan.prefix,
    backendURL: safePlan.backendURL,
    databaseName: safePlan.databaseName,
    simulatedOnly: true,
    physicalDelete: false,
    runtime,
    summary: summarize(snapshot, actions),
    actions,
    executed,
    postApplySummary,
    boundary:
      "只处理没有 active / blocked ProcessRuntime 阻断的源单取消或归档与主数据停用；不物理删除历史记录，也不处理流程撤销或已过账的库存、出货、财务记录。当前流程证据需通过专用验收库重建清理。",
  };
}

export function parseManualAcceptanceRetireArgs(argv) {
  const options = {
    apply: false,
    help: false,
    json: false,
    backendURL:
      process.env.MANUAL_ACCEPTANCE_BACKEND_URL || DEFAULT_BACKEND_URL,
    target: process.env.MANUAL_ACCEPTANCE_TARGET,
    dataVersion: process.env.MANUAL_ACCEPTANCE_DATA_VERSION,
    out: DEFAULT_OUT_DIR,
    runId: process.env.MANUAL_ACCEPTANCE_RUN_ID || "LOCAL-UAT",
    databaseName: process.env.MANUAL_ACCEPTANCE_DATABASE_NAME,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--apply") {
      options.apply = true;
      continue;
    }
    if (token === "--json") {
      options.json = true;
      continue;
    }
    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }
    if (!token.startsWith("--")) {
      throw new CliError(`unexpected argument ${token}`, 2);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new CliError(`missing value for ${token}`, 2);
    }
    index += 1;
    switch (token) {
      case "--backend-url":
        options.backendURL = value;
        break;
      case "--target":
        options.target = value;
        break;
      case "--data-version":
        options.dataVersion = value;
        break;
      case "--out":
        options.out = value;
        break;
      case "--run-id":
        options.runId = value;
        break;
      case "--database-name":
        options.databaseName = value;
        break;
      default:
        throw new CliError(`unknown option ${token}`, 2);
    }
  }
  const targetPolicy = resolveManualAcceptanceTarget({
    backendURL: normalizeBackendURL(options.backendURL),
    target: options.target,
    dataVersion: options.dataVersion,
    runId: options.runId,
    databaseName: options.databaseName,
  });
  options.backendURL = targetPolicy.backendURL;
  options.target = targetPolicy.target;
  options.dataVersion = targetPolicy.dataVersion;
  options.databaseName = targetPolicy.databaseName;
  return options;
}

function markdown(report) {
  const lines = [
    "# 试用源数据退出报告",
    "",
    `- 模式：${report.mode === "apply" ? "已执行" : "仅预览"}`,
    `- 目标：${report.target}`,
    `- 数据版本：${report.dataVersion}`,
    `- 试用批次：${report.runId}`,
    `- 编号前缀：${report.prefix}`,
    `- 预计处理：${report.summary.totalActions}`,
    "- 处理方式：取消或归档源单，停用主数据，不物理删除历史记录",
    "",
    "| 数据类别 | 找到 | 预计处理 |",
    "| --- | ---: | ---: |",
  ];
  for (const spec of DATASET_SPECS) {
    lines.push(
      `| ${spec.key} | ${report.summary.found[spec.key] || 0} | ${report.summary.planned[spec.key] || 0} |`,
    );
  }
  lines.push(
    "",
    "> 已形成的库存、出货和财务历史记录继续保留；需要完全清空时，只能在专用本地测试库按既有整库清理流程另行处理。",
    "",
  );
  return lines.join("\n");
}

async function writeReport(outDir, report) {
  await mkdir(outDir, { recursive: true });
  const jsonPath = path.join(outDir, `${report.mode}-report.json`);
  const markdownPath = path.join(outDir, `${report.mode}-report.md`);
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, `${markdown(report)}\n`, "utf8");
  return { jsonPath, markdownPath };
}

function usage() {
  return `试用源数据退出 / Manual Acceptance Source Retirement

仅预览：
  MANUAL_ACCEPTANCE_PASSWORD='<local-demo-password>' \\
    node scripts/qa/manual-acceptance-source-retire.mjs --run-id LOCAL-UAT

确认执行：
  MANUAL_ACCEPTANCE_RETIRE_CONFIRM=${CONFIRM_PHRASE} \\
  MANUAL_ACCEPTANCE_PASSWORD='<local-demo-password>' \\
  MANUAL_ACCEPTANCE_ADMIN_PASSWORD='<local-admin-password>' \\
    node scripts/qa/manual-acceptance-source-retire.mjs --apply --run-id LOCAL-UAT

133 客户试用环境必须通过已登记的 SSH 隧道，并额外提供：
  --target customer-trial-133 --backend-url http://127.0.0.1:18375 \\
  --data-version 2026.07.16-v5 --run-id 20260716-V5
以及绑定 target / dataVersion / runId 的 MANUAL_ACCEPTANCE_TARGET_CONFIRM，
和包含精确 origin/customer/release/migration/debug=false 的
MANUAL_ACCEPTANCE_TARGET_ATTESTATION_JSON。

默认仅预览，不物理删除历史记录；active / blocked ProcessRuntime 和已过账记录不在本入口处理。当前流程位置证据需通过专用验收库重建清理。`;
}

export async function runManualAcceptanceRetireCli(argv, deps = {}) {
  const options = parseManualAcceptanceRetireArgs(argv);
  if (options.help) return { text: `${usage()}\n`, exitCode: 0 };
  const plan = buildManualAcceptanceSourceDataPlan({
    runId: options.runId,
    backendURL: options.backendURL,
    target: options.target,
    dataVersion: options.dataVersion,
    databaseName: options.databaseName,
  });
  const report = await retireManualAcceptanceSourceData(plan, {
    ...deps,
    apply: options.apply,
  });
  const output = await writeReport(options.out, report);
  return {
    text: options.json
      ? `${JSON.stringify(report, null, 2)}\n`
      : `[qa:manual-acceptance-source-retire] ${report.mode} complete json=${output.jsonPath} md=${output.markdownPath}\n`,
    exitCode: 0,
    plan,
    report,
    output,
  };
}

const currentFile = fileURLToPath(import.meta.url);
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(currentFile)
) {
  runManualAcceptanceRetireCli(process.argv.slice(2))
    .then((result) => {
      process.stdout.write(result.text);
      process.exitCode = result.exitCode;
    })
    .catch((error) => {
      process.stderr.write(`${error?.stack || error?.message || error}\n`);
      process.exitCode = error instanceof CliError ? error.exitCode : 1;
    });
}

export { CONFIRM_PHRASE as MANUAL_ACCEPTANCE_RETIRE_CONFIRM_PHRASE };
