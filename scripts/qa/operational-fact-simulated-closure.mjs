#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const DEFAULT_BACKEND_URL = "http://127.0.0.1:8300";
const DEFAULT_OUT_DIR =
  "output/customers/yoyoosun/operational-fact-simulated-closure";
const SIMULATION_PREFIX = "SIM-YOYOOSUN-OPFACT";
const INPUT_TEMPLATE_SCOPE = "operational-fact-simulated-closure-input-template";
const CONFIRM_PHRASE = "APPLY_SIMULATED_OPERATIONAL_FACTS";
const FORBIDDEN_ARG_PATTERN =
  /--(?:execute|import|real|real-import|customer-data)/u;

const ROLE_USERS = {
  pmc: "demo_pmc",
  purchase: "demo_purchase",
  warehouse: "demo_warehouse",
  finance: "demo_finance",
};

const USAGE = `Operational fact simulated closure

Usage:
  node scripts/qa/operational-fact-simulated-closure.mjs
  node scripts/qa/operational-fact-simulated-closure.mjs --print-input-template

Report-only mode:
  node scripts/qa/operational-fact-simulated-closure.mjs \\
    --product-id 1 --unit-id 1 --warehouse-id 1

Apply simulated operational fact data through JSON-RPC:
  OPERATIONAL_FACT_SIM_CONFIRM=APPLY_SIMULATED_OPERATIONAL_FACTS \\
  OPERATIONAL_FACT_SIM_PASSWORD='replace-with-password' \\
    node scripts/qa/operational-fact-simulated-closure.mjs \\
      --apply \\
      --backend-url http://127.0.0.1:8300 \\
      --product-id 1 \\
      --unit-id 1 \\
      --warehouse-id 1

Options:
  --print-input-template Print local input checklist only; no report/backend/database writes.
  --apply                Write simulated records through /rpc/operational_fact.
  --backend-url <url>    Backend base URL. Default ${DEFAULT_BACKEND_URL}.
  --out <dir>            Output report directory. Default ${DEFAULT_OUT_DIR}.
  --product-id <id>      Active product ID used for simulated fact lines.
  --unit-id <id>         Active unit ID used for simulated quantities.
  --warehouse-id <id>    Active warehouse ID used for inventory-affecting facts.
  --run-id <text>        Optional unique run suffix. Default timestamp.
  --help                 Print this help.

Apply credentials:
  The script uses role demo accounts by default:
  ${ROLE_USERS.pmc}, ${ROLE_USERS.purchase}, ${ROLE_USERS.warehouse}, ${ROLE_USERS.finance}.
  Set OPERATIONAL_FACT_SIM_PASSWORD, TRIAL_ACCOUNT_PASSWORD, or ERP_ROLE_DEMO_PASSWORD.

This script only writes explicitly marked simulated operational fact records. It never imports
real customer data, never writes business_records directly, never creates schema or
migrations, and never turns customer acceptance into an operational fact completion blocker.`;

class CliError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

function optionalText(value) {
  const text = String(value ?? "").trim();
  return text || undefined;
}

function requiredText(value, pathName) {
  const text = optionalText(value);
  if (!text) {
    throw new CliError(`${pathName} is required`);
  }
  return text;
}

function asPositiveInt(value, pathName) {
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    throw new CliError(`${pathName} must be a positive integer`);
  }
  return numberValue;
}

function normalizeBaseURL(raw) {
  const url = new URL(String(raw || DEFAULT_BACKEND_URL).trim());
  if (url.username || url.password) {
    throw new CliError("backend URL must not contain username or password", 2);
  }
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/+$/, "");
}

function parseCliArgs(argv) {
  const options = {
    apply: false,
    help: false,
    printInputTemplate: false,
    out: DEFAULT_OUT_DIR,
    backendURL: process.env.OPERATIONAL_FACT_SIM_BACKEND_URL || DEFAULT_BACKEND_URL,
    runId: process.env.OPERATIONAL_FACT_SIM_RUN_ID || buildTimestampRunId(),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (FORBIDDEN_ARG_PATTERN.test(token)) {
      throw new CliError(
        `Operational fact simulated closure refuses real import style flag: ${token}`,
        2,
      );
    }
    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }
    if (token === "--print-input-template") {
      options.printInputTemplate = true;
      continue;
    }
    if (token === "--apply") {
      options.apply = true;
      continue;
    }
    if (!token.startsWith("--")) {
      throw new CliError(`Unexpected argument: ${token}`, 2);
    }
    const equalIndex = token.indexOf("=");
    const key = token.slice(2, equalIndex === -1 ? undefined : equalIndex);
    const inlineValue =
      equalIndex === -1 ? undefined : token.slice(equalIndex + 1);
    const value = inlineValue ?? argv[index + 1];
    if (inlineValue === undefined) {
      index += 1;
    }
    if (value === undefined || String(value).startsWith("--")) {
      throw new CliError(`Missing value for --${key}`, 2);
    }
    switch (key) {
      case "backend-url":
        options.backendURL = value;
        break;
      case "out":
        options.out = value;
        break;
      case "product-id":
        options.productId = asPositiveInt(value, "--product-id");
        break;
      case "unit-id":
        options.unitId = asPositiveInt(value, "--unit-id");
        break;
      case "warehouse-id":
        options.warehouseId = asPositiveInt(value, "--warehouse-id");
        break;
      case "run-id":
        options.runId = sanitizeRunId(value);
        break;
      default:
        throw new CliError(`Unknown option --${key}`, 2);
    }
  }
  options.backendURL = normalizeBaseURL(options.backendURL);
  options.runId = sanitizeRunId(options.runId);
  if (options.printInputTemplate && options.apply) {
    throw new CliError("--print-input-template cannot be combined with --apply", 2);
  }
  return options;
}

function buildInputTemplate(options = {}) {
  const backendURL = normalizeBaseURL(options.backendURL || DEFAULT_BACKEND_URL);
  const out = optionalText(options.out) || DEFAULT_OUT_DIR;
  const runId = sanitizeRunId(options.runId || "DEV-TESTING-REPORT");
  return {
    scope: INPUT_TEMPLATE_SCOPE,
    customerKey: "yoyoosun",
    scenario: "operational-fact-simulated-closure",
    simulatedOnly: true,
    realCustomerImport: false,
    customerAcceptanceRequiredForClosure: false,
    writesReports: false,
    writesDatabase: false,
    callsBackend: false,
    importsRealCustomerData: false,
    createsBusinessRecords: false,
    downstreamReportOnlyWritesReports: true,
    downstreamApplyWritesDatabase: true,
    defaultBackendURL: DEFAULT_BACKEND_URL,
    backendURL,
    defaultOut: DEFAULT_OUT_DIR,
    out,
    runId,
    requiredReportInputs: [
      "--product-id <active_product_id>",
      "--unit-id <active_unit_id>",
      "--warehouse-id <active_warehouse_id>",
    ],
    requiredApplyInputs: [
      "OPERATIONAL_FACT_SIM_CONFIRM=APPLY_SIMULATED_OPERATIONAL_FACTS",
      "OPERATIONAL_FACT_SIM_PASSWORD or TRIAL_ACCOUNT_PASSWORD or ERP_ROLE_DEMO_PASSWORD",
      "--product-id <active_product_id>",
      "--unit-id <active_unit_id>",
      "--warehouse-id <active_warehouse_id>",
    ],
    roleAccounts: ROLE_USERS,
    commands: {
      printInputTemplate:
        "PATH=/usr/local/bin:$PATH node scripts/qa/operational-fact-simulated-closure.mjs --print-input-template",
      reportOnly:
        `PATH=/usr/local/bin:$PATH node scripts/qa/operational-fact-simulated-closure.mjs --product-id <active_product_id> --unit-id <active_unit_id> --warehouse-id <active_warehouse_id> --run-id ${runId} --out ${out}`,
      applySimulated:
        "OPERATIONAL_FACT_SIM_CONFIRM=APPLY_SIMULATED_OPERATIONAL_FACTS OPERATIONAL_FACT_SIM_PASSWORD='<local-demo-password>' PATH=/usr/local/bin:$PATH node scripts/qa/operational-fact-simulated-closure.mjs --apply --backend-url http://127.0.0.1:8300 --product-id <active_product_id> --unit-id <active_unit_id> --warehouse-id <active_warehouse_id>",
      seedCoreDemo:
        "PATH=/usr/local/bin:$PATH bash scripts/seed-core-demo-data.sh",
    },
    boundary:
      "This template only prints prerequisites and commands. It does not write reports, call backend, login, import real customer data, write business_records, or create operational facts.",
  };
}

function buildTimestampRunId(date = new Date()) {
  return date
    .toISOString()
    .replace(/[-:]/gu, "")
    .replace(/\.\d{3}Z$/u, "Z");
}

function sanitizeRunId(value) {
  const text = requiredText(value, "runId")
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "");
  if (!text || text.length > 48) {
    throw new CliError("runId must be 1-48 safe characters");
  }
  return text;
}

function ensureIDs(options) {
  return {
    productId: asPositiveInt(options.productId, "productId"),
    unitId: asPositiveInt(options.unitId, "unitId"),
    warehouseId: asPositiveInt(options.warehouseId, "warehouseId"),
  };
}

function buildPlan(options) {
  const ids = ensureIDs(options);
  const prefix = `${SIMULATION_PREFIX}-${options.runId}`;
  return {
    customerKey: "yoyoosun",
    scope: "Operational Facts",
    simulatedOnly: true,
    realCustomerImport: false,
    customerAcceptanceRequiredForClosure: false,
    simulationPrefix: SIMULATION_PREFIX,
    runId: options.runId,
    backendURL: options.backendURL,
    ids,
    records: {
      productionReceipt: {
        fact_no: `${prefix}-PROD-IN`,
        fact_type: "FINISHED_GOODS_RECEIPT",
        subject_type: "PRODUCT",
        subject_id: ids.productId,
        warehouse_id: ids.warehouseId,
        unit_id: ids.unitId,
        quantity: "20",
        source_type: "SIMULATED_OPERATIONAL_FACT",
        idempotency_key: `${prefix}:PRODUCTION:RECEIPT`,
        note: "Operational fact simulated closure stock seed; not real customer data.",
      },
      outsourcingIssue: {
        fact_no: `${prefix}-OUT-MAT`,
        fact_type: "MATERIAL_ISSUE",
        subject_type: "PRODUCT",
        subject_id: ids.productId,
        warehouse_id: ids.warehouseId,
        unit_id: ids.unitId,
        quantity: "2",
        supplier_name: "模拟委外供应商",
        source_type: "SIMULATED_OPERATIONAL_FACT",
        idempotency_key: `${prefix}:OUTSOURCING:ISSUE`,
        note: "Operational fact simulated outsourcing issue; not real customer data.",
      },
      stockReservationRelease: {
        reservation_no: `${prefix}-RSV-REL`,
        product_id: ids.productId,
        warehouse_id: ids.warehouseId,
        unit_id: ids.unitId,
        quantity: "1",
        idempotency_key: `${prefix}:RESERVATION:RELEASE`,
        note: "Operational fact simulated reservation release path.",
      },
      stockReservationConsume: {
        reservation_no: `${prefix}-RSV-CON`,
        product_id: ids.productId,
        warehouse_id: ids.warehouseId,
        unit_id: ids.unitId,
        quantity: "1",
        idempotency_key: `${prefix}:RESERVATION:CONSUME`,
        note: "Operational fact simulated reservation consume path.",
      },
      shipment: {
        shipment_no: `${prefix}-SHP`,
        customer_snapshot: "Operational fact simulated shipment customer",
        idempotency_key: `${prefix}:SHIPMENT`,
        note: "Operational fact simulated shipment; not real customer data.",
      },
      shipmentItem: {
        product_id: ids.productId,
        warehouse_id: ids.warehouseId,
        unit_id: ids.unitId,
        quantity: "3",
        note: "Operational fact simulated shipment line.",
      },
      financeSettle: {
        fact_no: `${prefix}-FIN-SET`,
        fact_type: "RECEIVABLE",
        counterparty_type: "OTHER",
        amount: "128.50",
        currency: "CNY",
        source_type: "SIMULATED_OPERATIONAL_FACT",
        idempotency_key: `${prefix}:FINANCE:SETTLE`,
        note: "Operational fact simulated finance settle path.",
      },
      financeCancel: {
        fact_no: `${prefix}-FIN-CAN`,
        fact_type: "INVOICE",
        counterparty_type: "OTHER",
        amount: "36.80",
        currency: "CNY",
        source_type: "SIMULATED_OPERATIONAL_FACT",
        idempotency_key: `${prefix}:FINANCE:CANCEL`,
        note: "Operational fact simulated finance cancel path.",
      },
    },
  };
}

function rpcURLFor(backendURL, domain) {
  return new URL(`/rpc/${domain}`, `${backendURL}/`).toString();
}

async function rpcCall({ backendURL, domain, method, params = {}, token }) {
  const response = await fetch(rpcURLFor(backendURL, domain), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `operational-fact-sim-${method}-${Date.now()}`,
      method,
      params,
    }),
  });
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

async function loginRole({ backendURL, username, password }) {
  const data = await rpcCall({
    backendURL,
    domain: "auth",
    method: "admin_login",
    params: { username, password },
  });
  const token = data.access_token || data.token;
  if (!token) {
    throw new CliError(`${username}: admin_login response missing token`);
  }
  return token;
}

async function loginRoles({ backendURL, password }) {
  const entries = await Promise.all(
    Object.entries(ROLE_USERS).map(async ([role, username]) => [
      role,
      await loginRole({ backendURL, username, password }),
    ]),
  );
  return Object.fromEntries(entries);
}

function expectStatus(item, expected, label) {
  if (item?.status !== expected) {
    throw new CliError(`${label}: expected status ${expected}, got ${item?.status}`);
  }
  return item;
}

async function applyPlan(plan, tokens) {
  const { backendURL, records } = plan;
  const steps = [];
  const call = async (label, role, method, params, pick, expectedStatus) => {
    const data = await rpcCall({
      backendURL,
      domain: "operational_fact",
      method,
      params,
      token: tokens[role],
    });
    const item = pick(data);
    if (expectedStatus) {
      expectStatus(item, expectedStatus, label);
    }
    steps.push({ label, method, status: item?.status || "OK", id: item?.id || null });
    return item;
  };

  const production = await call(
    "production create",
    "pmc",
    "create_production_fact",
    records.productionReceipt,
    (data) => data.production_fact,
    "DRAFT",
  );
  await call(
    "production post",
    "pmc",
    "post_production_fact",
    { id: production.id },
    (data) => data.production_fact,
    "POSTED",
  );

  const reservationRelease = await call(
    "reservation create release path",
    "warehouse",
    "create_stock_reservation",
    records.stockReservationRelease,
    (data) => data.stock_reservation,
    "ACTIVE",
  );
  await call(
    "reservation release",
    "warehouse",
    "release_stock_reservation",
    { id: reservationRelease.id },
    (data) => data.stock_reservation,
    "RELEASED",
  );

  const reservationConsume = await call(
    "reservation create consume path",
    "warehouse",
    "create_stock_reservation",
    records.stockReservationConsume,
    (data) => data.stock_reservation,
    "ACTIVE",
  );
  await call(
    "reservation consume",
    "warehouse",
    "consume_stock_reservation",
    { id: reservationConsume.id },
    (data) => data.stock_reservation,
    "CONSUMED",
  );

  const outsourcing = await call(
    "outsourcing create",
    "purchase",
    "create_outsourcing_fact",
    records.outsourcingIssue,
    (data) => data.outsourcing_fact,
    "DRAFT",
  );
  await call(
    "outsourcing post",
    "purchase",
    "post_outsourcing_fact",
    { id: outsourcing.id },
    (data) => data.outsourcing_fact,
    "POSTED",
  );
  await call(
    "outsourcing cancel",
    "purchase",
    "cancel_outsourcing_fact",
    { id: outsourcing.id },
    (data) => data.outsourcing_fact,
    "CANCELLED",
  );

  const shipment = await call(
    "shipment create",
    "warehouse",
    "create_shipment",
    records.shipment,
    (data) => data.shipment,
    "DRAFT",
  );
  await call(
    "shipment add item",
    "warehouse",
    "add_shipment_item",
    { ...records.shipmentItem, shipment_id: shipment.id },
    (data) => data.shipment_item,
  );
  await call(
    "shipment ship",
    "warehouse",
    "ship_shipment",
    { id: shipment.id },
    (data) => data.shipment,
    "SHIPPED",
  );

  const financeSettle = await call(
    "finance create settle path",
    "finance",
    "create_finance_fact",
    {
      ...records.financeSettle,
      source_type: "SHIPMENT",
      source_id: shipment.id,
    },
    (data) => data.finance_fact,
    "DRAFT",
  );
  await call(
    "finance post settle path",
    "finance",
    "post_finance_fact",
    { id: financeSettle.id },
    (data) => data.finance_fact,
    "POSTED",
  );
  await call(
    "finance settle",
    "finance",
    "settle_finance_fact",
    { id: financeSettle.id },
    (data) => data.finance_fact,
    "SETTLED",
  );

  const financeCancel = await call(
    "finance create cancel path",
    "finance",
    "create_finance_fact",
    {
      ...records.financeCancel,
      source_type: "SHIPMENT",
      source_id: shipment.id,
    },
    (data) => data.finance_fact,
    "DRAFT",
  );
  await call(
    "finance post cancel path",
    "finance",
    "post_finance_fact",
    { id: financeCancel.id },
    (data) => data.finance_fact,
    "POSTED",
  );
  await call(
    "finance cancel",
    "finance",
    "cancel_finance_fact",
    { id: financeCancel.id },
    (data) => data.finance_fact,
    "CANCELLED",
  );

  await call(
    "shipment cancel",
    "warehouse",
    "cancel_shipment",
    { id: shipment.id },
    (data) => data.shipment,
    "CANCELLED",
  );

  await call(
    "production cancel stock seed",
    "pmc",
    "cancel_production_fact",
    { id: production.id },
    (data) => data.production_fact,
    "CANCELLED",
  );

  return steps;
}

function buildMarkdownReport(report) {
  const lines = [
    "# Operational Fact Simulated Closure Report",
    "",
    `- mode: ${report.mode}`,
    `- backend: ${report.plan.backendURL}`,
    `- runId: ${report.plan.runId}`,
    `- simulatedOnly: ${report.plan.simulatedOnly}`,
    `- realCustomerImport: ${report.plan.realCustomerImport}`,
    `- customerAcceptanceRequiredForClosure: ${report.plan.customerAcceptanceRequiredForClosure}`,
    "",
    "## IDs",
    "",
    `- product_id: ${report.plan.ids.productId}`,
    `- unit_id: ${report.plan.ids.unitId}`,
    `- warehouse_id: ${report.plan.ids.warehouseId}`,
    "",
    "## Steps",
    "",
  ];
  if (report.steps.length === 0) {
    lines.push("- report-only: no JSON-RPC writes executed");
  } else {
    for (const step of report.steps) {
      lines.push(`- ${step.label}: ${step.status}${step.id ? ` id=${step.id}` : ""}`);
    }
  }
  lines.push(
    "",
    "## Boundary",
    "",
    "- This report is simulated operational fact evidence only.",
    "- It is not real customer data import and not customer sign-off.",
  );
  return `${lines.join("\n")}\n`;
}

async function writeReports(outDir, report) {
  await mkdir(outDir, { recursive: true });
  const jsonPath = path.join(outDir, "operational-fact-simulated-closure-report.json");
  const markdownPath = path.join(
    outDir,
    "operational-fact-simulated-closure-report.md",
  );
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(markdownPath, buildMarkdownReport(report));
  return { jsonPath, markdownPath };
}

async function main() {
  const options = parseCliArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${USAGE}\n`);
    return;
  }
  if (options.printInputTemplate) {
    process.stdout.write(`${JSON.stringify(buildInputTemplate(options), null, 2)}\n`);
    return;
  }
  const plan = buildPlan(options);
  const report = {
    mode: options.apply ? "apply-simulated-operational-facts" : "report-only",
    generatedAt: new Date().toISOString(),
    plan,
    steps: [],
  };

  if (options.apply) {
    if (process.env.OPERATIONAL_FACT_SIM_CONFIRM !== CONFIRM_PHRASE) {
      throw new CliError(
        `apply requires OPERATIONAL_FACT_SIM_CONFIRM=${CONFIRM_PHRASE}`,
        2,
      );
    }
    const password = optionalText(
      process.env.OPERATIONAL_FACT_SIM_PASSWORD ||
        process.env.TRIAL_ACCOUNT_PASSWORD ||
        process.env.ERP_ROLE_DEMO_PASSWORD,
    );
    if (!password) {
      throw new CliError(
        "apply requires OPERATIONAL_FACT_SIM_PASSWORD, TRIAL_ACCOUNT_PASSWORD, or ERP_ROLE_DEMO_PASSWORD",
        2,
      );
    }
    const tokens = await loginRoles({ backendURL: plan.backendURL, password });
    report.steps = await applyPlan(plan, tokens);
  }

  const output = await writeReports(options.out, report);
  process.stdout.write(
    `[qa:operational-fact-simulated-closure] ${report.mode} complete. json=${output.jsonPath} md=${output.markdownPath}\n`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(
      `[qa:operational-fact-simulated-closure][fatal] ${error?.stack || error?.message || error}\n`,
    );
    process.exitCode = error instanceof CliError ? error.exitCode : 1;
  });
}

export {
  buildInputTemplate,
  buildPlan,
  buildTimestampRunId,
  CONFIRM_PHRASE,
  INPUT_TEMPLATE_SCOPE,
  parseCliArgs,
  sanitizeRunId,
};
