#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const DEFAULT_BACKEND_URL = "http://127.0.0.1:8300";
const DEFAULT_OUT_DIR = "output/customers/yoyoosun/trial-simulated-data";
const SIMULATION_PREFIX = "SIM-YOYOOSUN-TRIAL";
const INPUT_TEMPLATE_SCOPE = "trial-simulated-data-input-template";
const CONFIRM_PHRASE = "APPLY_SIMULATED_TRIAL_DATA";
const FORBIDDEN_ARG_PATTERN =
  /--(?:execute|import|real|real-import|customer-data)/u;
const FORBIDDEN_METHOD_PATTERN =
  /ship|shipment|inventory|stock|finance|invoice|payment|receivable|payable/iu;

const USAGE = `Trial simulated data

Usage:
  node scripts/qa/trial-simulated-data.mjs
  node scripts/qa/trial-simulated-data.mjs --print-input-template

Report-only mode:
  node scripts/qa/trial-simulated-data.mjs \\
    --out output/customers/yoyoosun/trial-simulated-data

Apply simulated data through V1 JSON-RPC:
  TRIAL_SIM_CONFIRM=APPLY_SIMULATED_TRIAL_DATA \\
  TRIAL_SIM_PASSWORD='replace-with-password' \\
    node scripts/qa/trial-simulated-data.mjs \\
      --apply \\
      --backend-url http://127.0.0.1:8300 \\
      --product-id 1 \\
      --unit-id 1

Options:
  --print-input-template          Print local input checklist only; no report/backend/database writes.
  --apply                         Create missing simulated V1 records through JSON-RPC.
  --backend-url <url>             Backend base URL. Default ${DEFAULT_BACKEND_URL}.
  --out <dir>                     Output report directory. Default ${DEFAULT_OUT_DIR}.
  --product-id <id>               Active product ID used for the simulated sales order item.
  --unit-id <id>                  Active unit ID used for the simulated sales order item.
  --product-code <code>           Optional product code snapshot.
  --product-name <name>           Optional product name snapshot.
  --order-date <yyyy-mm-dd>       Optional simulated order date. Default 2026-06-08.
  --planned-delivery-date <date>  Optional simulated delivery date. Default 2026-06-22.
  --help                          Print this help.

Apply credentials:
  The default role-account mode uses demo_sales for customer/sales order data and
  demo_purchase for supplier data. Set TRIAL_SIM_PASSWORD, TRIAL_ACCOUNT_PASSWORD,
  or ERP_ROLE_DEMO_PASSWORD for the shared role-account password.

  Optional overrides:
  TRIAL_SIM_CUSTOMER_USERNAME / TRIAL_SIM_CUSTOMER_PASSWORD
  TRIAL_SIM_SUPPLIER_USERNAME / TRIAL_SIM_SUPPLIER_PASSWORD
  TRIAL_SIM_SALES_USERNAME / TRIAL_SIM_SALES_PASSWORD

  TRIAL_SIM_ADMIN_TOKEN or TRIAL_SIM_ADMIN_USERNAME/PASSWORD may be used only
  when that account really has all required V1 customer, supplier, contact, sales
  order, and sales order item permissions.

This script is trial simulated/demo tooling only. It never executes real customer import,
never writes business_records directly, never creates schema or migrations, and never
creates shipment, inventory, finance, invoice, payment, receivable, or payable facts.`;

class CliError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.name = "CliError";
    this.exitCode = exitCode;
  }
}

function asPositiveInt(value, pathName) {
  const numberValue = Number(value);
  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    throw new CliError(`${pathName} must be a positive integer`);
  }
  return numberValue;
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

function normalizeBaseURL(raw) {
  const url = new URL(String(raw || DEFAULT_BACKEND_URL).trim());
  if (url.username || url.password) {
    throw new CliError("backend URL must not contain username or password");
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
    backendURL: process.env.TRIAL_SIM_BACKEND_URL || DEFAULT_BACKEND_URL,
    orderDate: "2026-06-08",
    plannedDeliveryDate: "2026-06-22",
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (FORBIDDEN_ARG_PATTERN.test(token)) {
      throw new CliError(
        `Trial simulated data script refuses real import style flag: ${token}`,
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
      case "product-code":
        options.productCode = value;
        break;
      case "product-name":
        options.productName = value;
        break;
      case "order-date":
        options.orderDate = value;
        break;
      case "planned-delivery-date":
        options.plannedDeliveryDate = value;
        break;
      default:
        throw new CliError(`Unknown option --${key}`, 2);
    }
  }
  options.backendURL = normalizeBaseURL(options.backendURL);
  if (options.printInputTemplate && options.apply) {
    throw new CliError(
      "--print-input-template cannot be combined with --apply",
      2,
    );
  }
  return options;
}

function buildInputTemplate(options = {}) {
  const backendURL = normalizeBaseURL(
    options.backendURL || DEFAULT_BACKEND_URL,
  );
  const out = optionalText(options.out) || DEFAULT_OUT_DIR;
  return {
    scope: INPUT_TEMPLATE_SCOPE,
    customerKey: "yoyoosun",
    scenario: "trial-simulated-data",
    simulatedOnly: true,
    realCustomerImport: false,
    writesReports: false,
    writesDatabase: false,
    callsBackend: false,
    importsRealCustomerData: false,
    createsBusinessRecords: false,
    createsShipmentInventoryFinanceFacts: false,
    downstreamReportOnlyWritesReports: true,
    downstreamApplyWritesDatabase: true,
    defaultBackendURL: DEFAULT_BACKEND_URL,
    backendURL,
    defaultOut: DEFAULT_OUT_DIR,
    out,
    requiredApplyInputs: [
      "TRIAL_SIM_CONFIRM=APPLY_SIMULATED_TRIAL_DATA",
      "TRIAL_SIM_PASSWORD or TRIAL_ACCOUNT_PASSWORD or ERP_ROLE_DEMO_PASSWORD",
      "--product-id <active_product_id>",
      "--unit-id <active_unit_id>",
    ],
    optionalInputs: [
      "--backend-url <url>",
      "--out <dir>",
      "--product-code <code>",
      "--product-name <name>",
      "--order-date <yyyy-mm-dd>",
      "--planned-delivery-date <yyyy-mm-dd>",
      "TRIAL_SIM_ADMIN_TOKEN or TRIAL_SIM_ADMIN_USERNAME/PASSWORD",
    ],
    commands: {
      printInputTemplate:
        "PATH=/usr/local/bin:$PATH node scripts/qa/trial-simulated-data.mjs --print-input-template",
      reportOnly: `PATH=/usr/local/bin:$PATH node scripts/qa/trial-simulated-data.mjs --out ${out}`,
      applySimulated:
        "TRIAL_SIM_CONFIRM=APPLY_SIMULATED_TRIAL_DATA TRIAL_SIM_PASSWORD='<local-demo-password>' PATH=/usr/local/bin:$PATH node scripts/qa/trial-simulated-data.mjs --apply --backend-url http://127.0.0.1:8300 --product-id <active_product_id> --unit-id <active_unit_id>",
      seedCoreDemo:
        "PATH=/usr/local/bin:$PATH bash scripts/seed-core-demo-data.sh",
      seedMinimalTrial:
        "PATH=/usr/local/bin:$PATH bash scripts/seed-trial-sim-masterdata.sh",
    },
    boundary:
      "This template only prints prerequisites and commands. It does not write reports, call backend, login, import real customer data, write business_records, create schema/migrations, or create shipment/inventory/finance facts.",
  };
}

function unixSeconds(dateText, pathName) {
  const parsed = Date.parse(requiredText(dateText, pathName));
  if (Number.isNaN(parsed)) {
    throw new CliError(`${pathName} must be a valid date`);
  }
  return Math.floor(parsed / 1000);
}

function buildSimulatedDataset(options = {}) {
  const productId = options.productId
    ? asPositiveInt(options.productId, "productId")
    : undefined;
  const unitId = options.unitId
    ? asPositiveInt(options.unitId, "unitId")
    : undefined;
  return {
    customerKey: "yoyoosun",
    scenario: "trial-simulated-data",
    simulatedOnly: true,
    realCustomerImport: false,
    simulationPrefix: SIMULATION_PREFIX,
    records: {
      customer: {
        code: `${SIMULATION_PREFIX}-C001`,
        name: "试用模拟客户 001",
        short_name: "模拟客户001",
        tax_no: "SIMULATED-NO-TAX",
        note: "trial simulated/demo data only; not real customer data.",
      },
      supplier: {
        code: `${SIMULATION_PREFIX}-S001`,
        name: "试用模拟供应商 001",
        short_name: "模拟供应商001",
        supplier_type: "material",
        tax_no: "SIMULATED-NO-TAX",
        note: "trial simulated/demo data only; not real supplier data.",
      },
      customerContact: {
        owner_type: "CUSTOMER",
        name: "试用模拟客户联系人",
        mobile: "13000000001",
        email: "trial-customer@example.invalid",
        title: "模拟联系人",
        is_primary: true,
        note: "trial simulated/demo contact only.",
      },
      supplierContact: {
        owner_type: "SUPPLIER",
        name: "试用模拟供应商联系人",
        mobile: "13000000002",
        email: "trial-supplier@example.invalid",
        title: "模拟联系人",
        is_primary: true,
        note: "trial simulated/demo contact only.",
      },
      salesOrder: {
        order_no: `${SIMULATION_PREFIX}-SO001`,
        customer_order_no: `${SIMULATION_PREFIX}-CUSTOMER-PO001`,
        customer_snapshot: {
          simulationPrefix: SIMULATION_PREFIX,
          simulatedOnly: true,
        },
        order_date: unixSeconds(options.orderDate || "2026-06-08", "orderDate"),
        planned_delivery_date: unixSeconds(
          options.plannedDeliveryDate || "2026-06-22",
          "plannedDeliveryDate",
        ),
        note: "trial simulated/demo sales order only; not shipped and not a fact posting.",
      },
      salesOrderItem: {
        line_no: 1,
        product_id: productId,
        unit_id: unitId,
        product_code_snapshot:
          optionalText(options.productCode) || `${SIMULATION_PREFIX}-PRODUCT`,
        product_name_snapshot:
          optionalText(options.productName) || "试用模拟产品",
        color_snapshot: "模拟配色",
        ordered_quantity: "12.000000",
        unit_price: "10.500000",
        amount: "126.000000",
        planned_delivery_date: unixSeconds(
          options.plannedDeliveryDate || "2026-06-22",
          "plannedDeliveryDate",
        ),
        note: "trial simulated/demo order item only; requires an existing active product and unit.",
      },
    },
  };
}

function assertDatasetBoundary(dataset) {
  if (!dataset?.simulatedOnly || dataset?.realCustomerImport !== false) {
    throw new CliError(
      "trial dataset must be simulatedOnly and realCustomerImport=false",
    );
  }
  const text = JSON.stringify(dataset);
  if (!text.includes(SIMULATION_PREFIX)) {
    throw new CliError(`trial dataset must include ${SIMULATION_PREFIX}`);
  }
  for (const forbidden of [
    "shipment",
    "inventory",
    "stock",
    "finance",
    "invoice",
    "payment",
    "receivable",
    "payable",
  ]) {
    if (Object.keys(dataset.records || {}).includes(forbidden)) {
      throw new CliError(
        `trial dataset contains forbidden record ${forbidden}`,
      );
    }
  }
}

function requireApplyInputs(options, dataset) {
  if (!options.apply) {
    return;
  }
  if (process.env.TRIAL_SIM_CONFIRM !== CONFIRM_PHRASE) {
    throw new CliError(`apply requires TRIAL_SIM_CONFIRM=${CONFIRM_PHRASE}`);
  }
  if (!dataset.records.salesOrderItem.product_id) {
    throw new CliError("--product-id is required with --apply");
  }
  if (!dataset.records.salesOrderItem.unit_id) {
    throw new CliError("--unit-id is required with --apply");
  }
}

async function rpcCall({
  backendURL,
  rpcPath,
  method,
  params,
  token,
  fetchImpl = fetch,
}) {
  if (FORBIDDEN_METHOD_PATTERN.test(method)) {
    throw new CliError(`forbidden trial method ${method}`);
  }
  const response = await fetchImpl(
    new URL(rpcPath, `${backendURL}/`).toString(),
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `trial-sim-${method}-${Date.now()}`,
        method,
        params:
          rpcPath === "/rpc/auth"
            ? params
            : { customer_key: "yoyoosun", ...params },
      }),
    },
  );
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

function sharedPassword() {
  return (
    process.env.TRIAL_SIM_PASSWORD ||
    process.env.TRIAL_SIM_ADMIN_PASSWORD ||
    process.env.TRIAL_ACCOUNT_PASSWORD ||
    process.env.ERP_ROLE_DEMO_PASSWORD ||
    ""
  );
}

async function loginToken({ backendURL, username, password, fetchImpl }) {
  if (!username || !password) {
    throw new CliError("login requires username and password");
  }
  const data = await rpcCall({
    backendURL,
    rpcPath: "/rpc/auth",
    method: "admin_login",
    params: { username, password },
    fetchImpl,
  });
  const token = data.access_token || data.token;
  if (!token) {
    throw new CliError("admin_login response missing access token");
  }
  return token;
}

async function resolveAdminToken({ backendURL, fetchImpl }) {
  if (process.env.TRIAL_SIM_ADMIN_TOKEN) {
    return process.env.TRIAL_SIM_ADMIN_TOKEN;
  }
  const username = process.env.TRIAL_SIM_ADMIN_USERNAME;
  const password = sharedPassword();
  if (!username || !password) {
    throw new CliError(
      "apply requires TRIAL_SIM_ADMIN_TOKEN or TRIAL_SIM_ADMIN_USERNAME with TRIAL_SIM_ADMIN_PASSWORD/TRIAL_ACCOUNT_PASSWORD/ERP_ROLE_DEMO_PASSWORD",
    );
  }
  return loginToken({ backendURL, username, password, fetchImpl });
}

async function resolveApplyTokens({ backendURL, fetchImpl }) {
  if (
    process.env.TRIAL_SIM_ADMIN_TOKEN ||
    process.env.TRIAL_SIM_ADMIN_USERNAME
  ) {
    const token = await resolveAdminToken({ backendURL, fetchImpl });
    return {
      customer: token,
      supplier: token,
      sales: token,
    };
  }

  const defaultPassword = sharedPassword();
  if (!defaultPassword) {
    throw new CliError(
      "apply requires TRIAL_SIM_PASSWORD/TRIAL_ACCOUNT_PASSWORD/ERP_ROLE_DEMO_PASSWORD for role-account mode, or TRIAL_SIM_ADMIN_TOKEN/TRIAL_SIM_ADMIN_USERNAME for all-permission mode",
    );
  }
  const credentials = {
    customer: {
      username: process.env.TRIAL_SIM_CUSTOMER_USERNAME || "demo_sales",
      password: process.env.TRIAL_SIM_CUSTOMER_PASSWORD || defaultPassword,
    },
    supplier: {
      username: process.env.TRIAL_SIM_SUPPLIER_USERNAME || "demo_purchase",
      password: process.env.TRIAL_SIM_SUPPLIER_PASSWORD || defaultPassword,
    },
    sales: {
      username: process.env.TRIAL_SIM_SALES_USERNAME || "demo_sales",
      password: process.env.TRIAL_SIM_SALES_PASSWORD || defaultPassword,
    },
  };
  const tokens = {};
  const cache = new Map();
  for (const [scope, credential] of Object.entries(credentials)) {
    const cacheKey = `${credential.username}\n${credential.password}`;
    if (!cache.has(cacheKey)) {
      cache.set(
        cacheKey,
        loginToken({
          backendURL,
          username: credential.username,
          password: credential.password,
          fetchImpl,
        }),
      );
    }
    tokens[scope] = await cache.get(cacheKey);
  }
  return tokens;
}

function firstBy(items, predicate) {
  return (items || []).find(predicate) || null;
}

async function findOrCreate({
  backendURL,
  token,
  list,
  create,
  listKey,
  idKey,
  match,
  createParams,
  fetchImpl,
}) {
  const listData = await rpcCall({
    backendURL,
    token,
    fetchImpl,
    rpcPath: list.rpcPath,
    method: list.method,
    params: list.params,
  });
  const existing = firstBy(listData[listKey], match);
  if (existing) {
    return {
      action: "reuse",
      item: existing,
      id: asPositiveInt(existing[idKey], idKey),
    };
  }
  const createData = await rpcCall({
    backendURL,
    token,
    fetchImpl,
    rpcPath: create.rpcPath,
    method: create.method,
    params: createParams,
  });
  const item = createData[create.resultKey];
  return { action: "create", item, id: asPositiveInt(item?.[idKey], idKey) };
}

async function applyDataset({ options, dataset, fetchImpl = fetch }) {
  const tokens = await resolveApplyTokens({
    backendURL: options.backendURL,
    fetchImpl,
  });
  const results = [];
  const customer = await findOrCreate({
    backendURL: options.backendURL,
    token: tokens.customer,
    fetchImpl,
    list: {
      rpcPath: "/rpc/masterdata",
      method: "list_customers",
      params: {
        keyword: dataset.records.customer.code,
        active_only: false,
        limit: 50,
      },
    },
    create: {
      rpcPath: "/rpc/masterdata",
      method: "create_customer",
      resultKey: "customer",
    },
    listKey: "customers",
    idKey: "id",
    match: (item) => item?.code === dataset.records.customer.code,
    createParams: dataset.records.customer,
  });
  results.push({ target: "customer", ...customer });

  const supplier = await findOrCreate({
    backendURL: options.backendURL,
    token: tokens.supplier,
    fetchImpl,
    list: {
      rpcPath: "/rpc/masterdata",
      method: "list_suppliers",
      params: {
        keyword: dataset.records.supplier.code,
        active_only: false,
        limit: 50,
      },
    },
    create: {
      rpcPath: "/rpc/masterdata",
      method: "create_supplier",
      resultKey: "supplier",
    },
    listKey: "suppliers",
    idKey: "id",
    match: (item) => item?.code === dataset.records.supplier.code,
    createParams: dataset.records.supplier,
  });
  results.push({ target: "supplier", ...supplier });

  const customerContactParams = {
    ...dataset.records.customerContact,
    owner_id: customer.id,
  };
  const customerContact = await findOrCreate({
    backendURL: options.backendURL,
    token: tokens.customer,
    fetchImpl,
    list: {
      rpcPath: "/rpc/masterdata",
      method: "list_contacts_by_owner",
      params: { owner_type: "CUSTOMER", owner_id: customer.id, limit: 50 },
    },
    create: {
      rpcPath: "/rpc/masterdata",
      method: "create_contact",
      resultKey: "contact",
    },
    listKey: "contacts",
    idKey: "id",
    match: (item) => item?.name === dataset.records.customerContact.name,
    createParams: customerContactParams,
  });
  results.push({ target: "customer_contact", ...customerContact });

  const supplierContactParams = {
    ...dataset.records.supplierContact,
    owner_id: supplier.id,
  };
  const supplierContact = await findOrCreate({
    backendURL: options.backendURL,
    token: tokens.supplier,
    fetchImpl,
    list: {
      rpcPath: "/rpc/masterdata",
      method: "list_contacts_by_owner",
      params: { owner_type: "SUPPLIER", owner_id: supplier.id, limit: 50 },
    },
    create: {
      rpcPath: "/rpc/masterdata",
      method: "create_contact",
      resultKey: "contact",
    },
    listKey: "contacts",
    idKey: "id",
    match: (item) => item?.name === dataset.records.supplierContact.name,
    createParams: supplierContactParams,
  });
  results.push({ target: "supplier_contact", ...supplierContact });

  const salesOrderParams = {
    ...dataset.records.salesOrder,
    customer_id: customer.id,
    customer_snapshot: {
      ...dataset.records.salesOrder.customer_snapshot,
      code: dataset.records.customer.code,
      name: dataset.records.customer.name,
      id: customer.id,
    },
  };
  const salesOrderList = await rpcCall({
    backendURL: options.backendURL,
    token: tokens.sales,
    fetchImpl,
    rpcPath: "/rpc/sales_order",
    method: "list_sales_orders",
    params: { keyword: dataset.records.salesOrder.order_no, limit: 50 },
  });
  const existingSalesOrder = firstBy(
    salesOrderList.sales_orders,
    (item) => item?.order_no === dataset.records.salesOrder.order_no,
  );

  if (existingSalesOrder) {
    const salesOrderID = asPositiveInt(existingSalesOrder.id, "sales_order.id");
    const itemList = await rpcCall({
      backendURL: options.backendURL,
      token: tokens.sales,
      fetchImpl,
      rpcPath: "/rpc/sales_order",
      method: "list_sales_order_items",
      params: { sales_order_id: salesOrderID, limit: 50 },
    });
    const existingItem = firstBy(
      itemList.sales_order_items,
      (item) =>
        Number(item?.line_no) === dataset.records.salesOrderItem.line_no,
    );
    results.push({ target: "sales_order", action: "reuse", id: salesOrderID });
    if (!existingItem) {
      throw new CliError(
        `${dataset.records.salesOrder.order_no}: existing simulated order is missing its expected line`,
      );
    }
    results.push({
      target: "sales_order_item",
      action: "reuse",
      id: asPositiveInt(existingItem.id, "sales_order_item.id"),
    });
  } else {
    const saved = await rpcCall({
      backendURL: options.backendURL,
      token: tokens.sales,
      fetchImpl,
      rpcPath: "/rpc/sales_order",
      method: "save_sales_order_with_items",
      params: {
        ...salesOrderParams,
        items: [dataset.records.salesOrderItem],
      },
    });
    const savedItem = firstBy(
      saved.sales_order_items,
      (item) =>
        Number(item?.line_no) === dataset.records.salesOrderItem.line_no,
    );
    results.push({
      target: "sales_order",
      action: "create",
      id: asPositiveInt(saved.sales_order?.id, "sales_order.id"),
    });
    results.push({
      target: "sales_order_item",
      action: "create",
      id: asPositiveInt(savedItem?.id, "sales_order_item.id"),
    });
  }
  return results;
}

async function writeReport({ options, dataset, results }) {
  await mkdir(options.out, { recursive: true });
  const report = {
    generatedAt: new Date().toISOString(),
    customerKey: "yoyoosun",
    scenario: "trial-simulated-data",
    mode: options.apply ? "apply-simulated-data" : "report-only",
    simulatedOnly: true,
    realCustomerImport: false,
    backendURL: options.apply ? options.backendURL : "",
    dataset,
    results,
    noDirectDatabaseWrite: true,
    noBusinessRecordsWrite: true,
    noSchemaOrMigrationChange: true,
    noShipmentInventoryFinanceFacts: true,
  };
  await writeFile(
    path.join(options.out, "trial-simulated-data-report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    path.join(options.out, "trial-simulated-data-report.md"),
    [
      "# Trial Simulated Data Report",
      "",
      `| mode | ${report.mode} |`,
      `| customerKey | ${report.customerKey} |`,
      `| simulatedOnly | ${report.simulatedOnly} |`,
      `| realCustomerImport | ${report.realCustomerImport} |`,
      `| resultCount | ${results.length} |`,
      "",
      "This is simulated trial data only. It is not customer real data, not real import evidence, and not a shipment, inventory, finance, invoice, payment, receivable, or payable fact posting.",
      "",
    ].join("\n"),
    "utf8",
  );
  return report;
}

async function runTrialSimulatedData(options, deps = {}) {
  const dataset = buildSimulatedDataset(options);
  assertDatasetBoundary(dataset);
  requireApplyInputs(options, dataset);
  const results = options.apply
    ? await applyDataset({
        options,
        dataset,
        fetchImpl: deps.fetchImpl || fetch,
      })
    : [];
  return writeReport({ options, dataset, results });
}

async function runCli() {
  const options = parseCliArgs(process.argv.slice(2));
  if (options.help) {
    console.log(USAGE);
    return 0;
  }
  if (options.printInputTemplate) {
    console.log(JSON.stringify(buildInputTemplate(options), null, 2));
    return 0;
  }
  const report = await runTrialSimulatedData(options);
  console.log(
    `trial simulated data report: ${path.join(
      options.out,
      "trial-simulated-data-report.json",
    )}`,
  );
  console.log(`mode: ${report.mode}`);
  console.log(`simulatedOnly: ${report.simulatedOnly}`);
  console.log(`realCustomerImport: ${report.realCustomerImport}`);
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

export {
  CONFIRM_PHRASE,
  CliError,
  INPUT_TEMPLATE_SCOPE,
  SIMULATION_PREFIX,
  USAGE,
  assertDatasetBoundary,
  buildInputTemplate,
  buildSimulatedDataset,
  normalizeBaseURL,
  parseCliArgs,
  runTrialSimulatedData,
};
