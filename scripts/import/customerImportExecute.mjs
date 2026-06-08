#!/usr/bin/env node

import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const USAGE = `Customer import execution loader

Usage:
  node scripts/import/customerImportExecute.mjs \\
    --dry-run-package output/customers/yoyoosun/import-dry-run \\
    --approval scripts/import/fixtures/customers/yoyoosun/import-approval.sample.json \\
    --backup-evidence output/customers/yoyoosun/backup-evidence.txt \\
    --out output/customers/yoyoosun/import-execution

Execution mode:
  CUSTOMER_IMPORT_CONFIRM=EXECUTE_YOYOOSUN_IMPORT \\
  CUSTOMER_IMPORT_ADMIN_USERNAME='admin' \\
  CUSTOMER_IMPORT_ADMIN_PASSWORD='replace-with-password' \\
    node scripts/import/customerImportExecute.mjs ... --backend-url http://127.0.0.1:8300 --execute

Options:
  --dry-run-package <dir>   Required. Directory containing candidates.json and validation-summary.json.
  --approval <path>         Required. Approved execution plan JSON.
  --backup-evidence <path>  Required. Existing backup evidence file.
  --out <dir>               Required. Output directory for execution report.
  --backend-url <url>       Backend base URL. Required with --execute unless CUSTOMER_IMPORT_BACKEND_URL is set.
  --execute                 Execute via JSON-RPC. Without this flag the loader only validates and writes a report.
  --help                    Print this help.

This loader can execute approved V1 customer, supplier, contact, sales order, and sales order item create/update actions through JSON-RPC only. It never writes database tables directly, never writes business_records, never creates schema or migrations, and refuses deferred or forbidden fact domains.`;

const CONFIRM_PHRASE = "EXECUTE_YOYOOSUN_IMPORT";
const SUPPORTED_TARGETS = new Set([
  "customers",
  "suppliers",
  "contacts",
  "sales_orders",
  "sales_order_items",
]);
const SUPPORTED_ACTIONS = new Set(["create", "update"]);
const FORBIDDEN_TARGET_PATTERN =
  /product_skus|purchase_orders|shipments?|stock_reservations|inventory|finance|invoice|payment|receivable|payable|reconciliation|facts?/iu;

class CliError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

export function parseCliArgs(argv) {
  const options = { execute: false, help: false };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }
    if (token === "--execute") {
      options.execute = true;
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
      case "dry-run-package":
        options.dryRunPackage = value;
        break;
      case "approval":
        options.approval = value;
        break;
      case "backup-evidence":
        options.backupEvidence = value;
        break;
      case "out":
        options.out = value;
        break;
      case "backend-url":
        options.backendURL = value;
        break;
      default:
        throw new CliError(`Unknown option --${key}`, 2);
    }
  }
  return options;
}

function requireOption(options, key) {
  if (!options[key]) {
    throw new CliError(
      `Missing required --${key.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`)}`,
      2,
    );
  }
}

async function pathExists(filePath) {
  try {
    await stat(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

async function writeJson(filePath, data) {
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

function normalizeSourceReference(value) {
  return String(value || "").trim();
}

function sourceIdFromReference(sourceReference) {
  const match =
    normalizeSourceReference(sourceReference).match(/sourceId=([^ |]+)/u);
  if (match) {
    return match[1];
  }
  const sourceIdMatch = normalizeSourceReference(sourceReference).match(
    /(?:^|\/)(src-[A-Za-z0-9_-]+)/u,
  );
  return sourceIdMatch
    ? sourceIdMatch[1]
    : normalizeSourceReference(sourceReference);
}

function approvalItemKey(item) {
  return item.sourceReference
    ? normalizeSourceReference(item.sourceReference)
    : String(item.sourceId || "").trim();
}

function buildApprovalIndex(approval) {
  const index = new Map();
  for (const item of approval.items || []) {
    const key = approvalItemKey(item);
    if (!key) {
      throw new CliError("approval item missing sourceReference/sourceId");
    }
    if (index.has(key)) {
      throw new CliError(`approval contains duplicate item ${key}`);
    }
    index.set(key, item);
  }
  return index;
}

export function validateApprovalPlan(approval) {
  if (!approval || typeof approval !== "object") {
    throw new CliError("approval plan must be a JSON object");
  }
  if (approval.customerKey !== "yoyoosun") {
    throw new CliError("approval.customerKey must be yoyoosun");
  }
  if (approval.realImportApproved !== true) {
    throw new CliError("approval.realImportApproved must be true");
  }
  if (!approval.approvedBy || !approval.approvedAt) {
    throw new CliError("approval must include approvedBy and approvedAt");
  }
  if (!Array.isArray(approval.items) || approval.items.length === 0) {
    throw new CliError("approval.items must not be empty");
  }
  buildApprovalIndex(approval);
}

function assertNoDryRunBlockers(summary, approval) {
  const allow = approval.allowRemainingReviewItems === true;
  if (!allow && Number(summary.blockerCount || 0) > 0) {
    throw new CliError(
      "dry-run package still has blockers; set approval.allowRemainingReviewItems=true only after rejected/deferred items are explicitly excluded",
    );
  }
}

function assertCandidateAllowed(candidate, approvalItem) {
  const targetModel = String(candidate.targetModel || "");
  const action = String(candidate.actionCandidate || "");
  if (FORBIDDEN_TARGET_PATTERN.test(targetModel)) {
    throw new CliError(
      `${candidate.sourceReference}: forbidden targetModel ${targetModel}`,
    );
  }
  if (!SUPPORTED_TARGETS.has(targetModel)) {
    throw new CliError(
      `${candidate.sourceReference}: unsupported targetModel ${targetModel}`,
    );
  }
  if (!SUPPORTED_ACTIONS.has(action)) {
    throw new CliError(
      `${candidate.sourceReference}: unsupported action ${action}`,
    );
  }
  if (approvalItem.targetModel && approvalItem.targetModel !== targetModel) {
    throw new CliError(
      `${candidate.sourceReference}: approval targetModel mismatch`,
    );
  }
  if (approvalItem.action && approvalItem.action !== action) {
    throw new CliError(
      `${candidate.sourceReference}: approval action mismatch`,
    );
  }
}

function assertApprovedSourcesClear({
  candidates,
  forbidden,
  unresolved,
  approvalIndex,
}) {
  const approvedSourceIds = new Set([...approvalIndex.keys()]);
  for (const candidate of candidates) {
    const key = normalizeSourceReference(candidate.sourceReference);
    const sourceId = sourceIdFromReference(key);
    if (approvalIndex.has(key) || approvalIndex.has(sourceId)) {
      approvedSourceIds.add(key);
      approvedSourceIds.add(sourceId);
    }
  }
  for (const item of forbidden || []) {
    const key = normalizeSourceReference(item.sourceReference);
    const sourceId = sourceIdFromReference(key);
    if (approvedSourceIds.has(key) || approvedSourceIds.has(sourceId)) {
      throw new CliError(
        `${key}: forbidden auto-import evidence cannot be approved for execution`,
      );
    }
  }
  for (const item of unresolved || []) {
    const key = normalizeSourceReference(item.sourceReference);
    const sourceId = sourceIdFromReference(key);
    if (
      (approvedSourceIds.has(key) || approvedSourceIds.has(sourceId)) &&
      item.severity === "block"
    ) {
      throw new CliError(
        `${key}: block unresolved item cannot be approved for execution`,
      );
    }
  }
}

function asPositiveInt(value, pathName) {
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    throw new CliError(`${pathName} must be a positive integer`);
  }
  return numberValue;
}

function requiredText(value, fallback, pathName) {
  const text = String(value ?? fallback ?? "").trim();
  if (!text) {
    throw new CliError(`${pathName} is required`);
  }
  return text;
}

function optionalText(value) {
  const text = String(value ?? "").trim();
  return text || undefined;
}

function unixSecondsOrToday(value) {
  if (value === undefined || value === null || value === "") {
    return Math.floor(Date.now() / 1000);
  }
  if (Number.isInteger(Number(value))) {
    return Number(value);
  }
  const parsed = Date.parse(String(value));
  if (Number.isNaN(parsed)) {
    throw new CliError(`invalid date value ${value}`);
  }
  return Math.floor(parsed / 1000);
}

function buildRpcOperation(candidate, approvalItem) {
  const fields = {
    ...(candidate.targetFields || {}),
    ...(approvalItem.params || {}),
  };
  const targetModel = candidate.targetModel;
  const action = candidate.actionCandidate;
  const id = fields.id ?? candidate.matchedExistingId;

  if (targetModel === "customers") {
    return {
      rpcPath: "/rpc/masterdata",
      method: action === "create" ? "create_customer" : "update_customer",
      params: {
        ...(action === "update"
          ? {
              id: asPositiveInt(
                id,
                `${candidate.sourceReference}.matchedExistingId`,
              ),
            }
          : {}),
        code: optionalText(fields.code),
        name: requiredText(
          fields.name,
          fields.displayName,
          `${candidate.sourceReference}.name`,
        ),
        short_name: optionalText(fields.shortName ?? fields.displayName),
        tax_no: optionalText(fields.taxNo),
        note: optionalText(fields.note),
      },
    };
  }

  if (targetModel === "suppliers") {
    return {
      rpcPath: "/rpc/masterdata",
      method: action === "create" ? "create_supplier" : "update_supplier",
      params: {
        ...(action === "update"
          ? {
              id: asPositiveInt(
                id,
                `${candidate.sourceReference}.matchedExistingId`,
              ),
            }
          : {}),
        code: optionalText(fields.code),
        name: requiredText(
          fields.name,
          fields.shortName,
          `${candidate.sourceReference}.name`,
        ),
        short_name: optionalText(fields.shortName),
        supplier_type: optionalText(fields.supplierType),
        tax_no: optionalText(fields.taxNo),
        note: optionalText(fields.note),
      },
    };
  }

  if (targetModel === "contacts") {
    return {
      rpcPath: "/rpc/masterdata",
      method: action === "create" ? "create_contact" : "update_contact",
      params: {
        ...(action === "update"
          ? {
              id: asPositiveInt(
                id,
                `${candidate.sourceReference}.matchedExistingId`,
              ),
            }
          : {}),
        owner_type: requiredText(
          fields.ownerType ?? fields.owner_type,
          undefined,
          `${candidate.sourceReference}.ownerType`,
        ),
        owner_id: asPositiveInt(
          fields.ownerId ?? fields.owner_id,
          `${candidate.sourceReference}.ownerId`,
        ),
        name: requiredText(
          fields.name,
          undefined,
          `${candidate.sourceReference}.name`,
        ),
        phone: optionalText(fields.phone),
        mobile: optionalText(fields.mobile),
        email: optionalText(fields.email),
        title: optionalText(fields.title),
        is_primary: Boolean(fields.isPrimary ?? fields.is_primary ?? false),
        note: optionalText(fields.note),
      },
    };
  }

  if (targetModel === "sales_orders") {
    return {
      rpcPath: "/rpc/sales_order",
      method: action === "create" ? "create_sales_order" : "update_sales_order",
      params: {
        ...(action === "update"
          ? {
              id: asPositiveInt(
                id,
                `${candidate.sourceReference}.matchedExistingId`,
              ),
            }
          : {}),
        order_no: requiredText(
          fields.orderNo ?? fields.order_no,
          undefined,
          `${candidate.sourceReference}.orderNo`,
        ),
        customer_id: asPositiveInt(
          fields.customerId ?? fields.customer_id,
          `${candidate.sourceReference}.customerId`,
        ),
        customer_order_no: optionalText(
          fields.customerOrderNo ?? fields.customer_order_no,
        ),
        customer_snapshot:
          fields.customerSnapshot ?? fields.customer_snapshot ?? {},
        order_date: unixSecondsOrToday(fields.orderDate ?? fields.order_date),
        planned_delivery_date:
          fields.expectedShipDate ||
          fields.expected_ship_date ||
          fields.plannedDeliveryDate ||
          fields.planned_delivery_date
            ? unixSecondsOrToday(
                fields.expectedShipDate ??
                  fields.expected_ship_date ??
                  fields.plannedDeliveryDate ??
                  fields.planned_delivery_date,
              )
            : undefined,
        note: optionalText(fields.note),
      },
    };
  }

  return {
    rpcPath: "/rpc/sales_order",
    method:
      action === "create" ? "add_sales_order_item" : "update_sales_order_item",
    params: {
      ...(action === "update"
        ? {
            id: asPositiveInt(
              id,
              `${candidate.sourceReference}.matchedExistingId`,
            ),
          }
        : {}),
      sales_order_id: asPositiveInt(
        fields.salesOrderId ?? fields.sales_order_id,
        `${candidate.sourceReference}.salesOrderId`,
      ),
      line_no: asPositiveInt(
        fields.lineNo ?? fields.line_no ?? 1,
        `${candidate.sourceReference}.lineNo`,
      ),
      product_id: asPositiveInt(
        fields.productId ?? fields.product_id,
        `${candidate.sourceReference}.productId`,
      ),
      unit_id: asPositiveInt(
        fields.unitId ?? fields.unit_id,
        `${candidate.sourceReference}.unitId`,
      ),
      product_code_snapshot: optionalText(
        fields.productCodeSnapshot ?? fields.product_code_snapshot,
      ),
      product_name_snapshot: optionalText(
        fields.productNameSnapshot ?? fields.product_name_snapshot,
      ),
      color_snapshot: optionalText(
        fields.colorSnapshot ?? fields.color_snapshot,
      ),
      ordered_quantity: requiredText(
        fields.orderedQuantity ?? fields.ordered_quantity,
        undefined,
        `${candidate.sourceReference}.orderedQuantity`,
      ),
      unit_price: fields.unitPrice ?? fields.unit_price,
      amount: fields.amount,
      planned_delivery_date:
        fields.expectedShipDate ||
        fields.expected_ship_date ||
        fields.plannedDeliveryDate ||
        fields.planned_delivery_date
          ? unixSecondsOrToday(
              fields.expectedShipDate ??
                fields.expected_ship_date ??
                fields.plannedDeliveryDate ??
                fields.planned_delivery_date,
            )
          : undefined,
      note: optionalText(fields.note),
    },
  };
}

export function buildExecutionPlan({
  candidates,
  summary,
  approval,
  forbidden = [],
  unresolved = [],
}) {
  validateApprovalPlan(approval);
  assertNoDryRunBlockers(summary, approval);
  const approvalIndex = buildApprovalIndex(approval);
  assertApprovedSourcesClear({
    candidates,
    forbidden,
    unresolved,
    approvalIndex,
  });
  const operations = [];
  for (const candidate of candidates) {
    const key = normalizeSourceReference(candidate.sourceReference);
    const sourceId = sourceIdFromReference(key);
    const approvalItem = approvalIndex.get(key) || approvalIndex.get(sourceId);
    if (!approvalItem) {
      continue;
    }
    assertCandidateAllowed(candidate, approvalItem);
    const operation = buildRpcOperation(candidate, approvalItem);
    operations.push({
      sourceReference: key,
      sourceId,
      targetModel: candidate.targetModel,
      action: candidate.actionCandidate,
      rpcPath: operation.rpcPath,
      method: operation.method,
      params: operation.params,
      reason: candidate.reason,
    });
  }
  if (operations.length !== approvalIndex.size) {
    throw new CliError(
      `approval item count ${approvalIndex.size} does not match executable candidate count ${operations.length}`,
    );
  }
  return operations;
}

function normalizeBaseURL(raw) {
  const url = new URL(String(raw || "").trim());
  url.pathname = url.pathname.replace(/\/+$/, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/+$/, "");
}

async function rpcCall({ backendURL, token, rpcPath, method, params }) {
  const response = await fetch(new URL(rpcPath, `${backendURL}/`).toString(), {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: `customer-import-${method}-${Date.now()}`,
      method,
      params,
    }),
  });
  if (!response.ok) {
    throw new CliError(`${method} HTTP ${response.status}`);
  }
  const json = await response.json();
  if (json?.result?.code !== 0) {
    throw new CliError(
      `${method} code=${json?.result?.code} message=${json?.result?.message}`,
    );
  }
  return json.result.data || {};
}

async function resolveAdminToken(backendURL) {
  if (process.env.CUSTOMER_IMPORT_ADMIN_TOKEN) {
    return process.env.CUSTOMER_IMPORT_ADMIN_TOKEN;
  }
  const username = process.env.CUSTOMER_IMPORT_ADMIN_USERNAME;
  const password = process.env.CUSTOMER_IMPORT_ADMIN_PASSWORD;
  if (!username || !password) {
    throw new CliError(
      "execution requires CUSTOMER_IMPORT_ADMIN_TOKEN or CUSTOMER_IMPORT_ADMIN_USERNAME/CUSTOMER_IMPORT_ADMIN_PASSWORD",
    );
  }
  const data = await rpcCall({
    backendURL,
    rpcPath: "/rpc/auth",
    method: "admin_login",
    params: { username, password },
  });
  const token = data.access_token || data.token;
  if (!token) {
    throw new CliError("admin_login response missing access token");
  }
  return token;
}

async function executeOperations({ backendURL, operations }) {
  if (process.env.CUSTOMER_IMPORT_CONFIRM !== CONFIRM_PHRASE) {
    throw new CliError(
      `execution requires CUSTOMER_IMPORT_CONFIRM=${CONFIRM_PHRASE}`,
    );
  }
  const token = await resolveAdminToken(backendURL);
  const results = [];
  for (const operation of operations) {
    const data = await rpcCall({
      backendURL,
      token,
      rpcPath: operation.rpcPath,
      method: operation.method,
      params: operation.params,
    });
    results.push({
      sourceReference: operation.sourceReference,
      targetModel: operation.targetModel,
      action: operation.action,
      method: operation.method,
      resultId: data?.item?.id ?? data?.id ?? null,
    });
  }
  return results;
}

async function loadInputs(options) {
  requireOption(options, "dryRunPackage");
  requireOption(options, "approval");
  requireOption(options, "backupEvidence");
  requireOption(options, "out");

  if (!(await pathExists(options.backupEvidence))) {
    throw new CliError(`backup evidence not found: ${options.backupEvidence}`);
  }
  const candidates = await readJson(
    path.join(options.dryRunPackage, "candidates.json"),
  );
  const summary = await readJson(
    path.join(options.dryRunPackage, "validation-summary.json"),
  );
  const forbidden = await readJson(
    path.join(options.dryRunPackage, "forbidden-auto-import.json"),
  );
  const unresolved = await readJson(
    path.join(options.dryRunPackage, "unresolved-queue.json"),
  );
  const approval = await readJson(options.approval);
  return { candidates, summary, approval, forbidden, unresolved };
}

async function writeReport({ options, operations, results, executed }) {
  await mkdir(options.out, { recursive: true });
  const report = {
    generatedAt: new Date().toISOString(),
    customerKey: "yoyoosun",
    executed,
    dryRunPackage: options.dryRunPackage,
    approval: options.approval,
    backupEvidence: options.backupEvidence,
    operationCount: operations.length,
    operations,
    results,
    noDirectDatabaseWrite: true,
    noBusinessRecordsWrite: true,
    noSchemaOrMigrationChange: true,
  };
  await writeJson(
    path.join(options.out, "import-execution-report.json"),
    report,
  );
  await writeFile(
    path.join(options.out, "import-execution-report.md"),
    [
      "# Yoyoosun Import Execution Report",
      "",
      `| executed | ${executed} |`,
      `| operationCount | ${operations.length} |`,
      `| dryRunPackage | ${options.dryRunPackage} |`,
      `| approval | ${options.approval} |`,
      `| backupEvidence | ${options.backupEvidence} |`,
      "",
      "This report is generated by the import execution loader. The loader uses JSON-RPC V1 APIs only and does not write database tables directly, write business_records, generate migrations, or create shipment / inventory / finance facts.",
      "",
    ].join("\n"),
    "utf8",
  );
  return report;
}

export async function runImportExecution(options) {
  const inputs = await loadInputs(options);
  const operations = buildExecutionPlan(inputs);
  if (
    options.execute &&
    !(options.backendURL || process.env.CUSTOMER_IMPORT_BACKEND_URL)
  ) {
    throw new CliError(
      "execution requires --backend-url or CUSTOMER_IMPORT_BACKEND_URL",
    );
  }
  const backendURL = options.execute
    ? normalizeBaseURL(
        options.backendURL || process.env.CUSTOMER_IMPORT_BACKEND_URL,
      )
    : "";
  const results = options.execute
    ? await executeOperations({ backendURL, operations })
    : [];
  return writeReport({
    options,
    operations,
    results,
    executed: Boolean(options.execute),
  });
}

async function runCli() {
  const options = parseCliArgs(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
    return 0;
  }
  const report = await runImportExecution(options);
  console.log(
    `import execution report: ${path.join(options.out, "import-execution-report.json")}`,
  );
  console.log(`executed: ${report.executed}`);
  console.log(`operationCount: ${report.operationCount}`);
  return 0;
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === currentFile) {
  runCli()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      if (error instanceof CliError) {
        console.error(error.message);
        process.exitCode = error.exitCode;
        return;
      }
      console.error(error);
      process.exitCode = 1;
    });
}

export { CONFIRM_PHRASE, USAGE };
