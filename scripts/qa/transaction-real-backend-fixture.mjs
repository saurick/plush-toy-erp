import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { yoyoosunCustomerPackage } from "../../config/customers/yoyoosun/customerPackage.mjs";
import { buildRuntimePreviewManifest } from "./customer-config-runtime-manifest.mjs";
import { assertDisposableDatabaseTarget } from "./database-target.mjs";
import {
  browserWriteOrigin,
  verifyDatabaseRuntimeIdentity,
} from "./browser-write-target.mjs";
import { approvePurchaseOrderThroughProcess } from "./purchase-order-approval-process.mjs";
import { advanceSalesOrderLifecycleThroughProcess } from "./manual-acceptance-source-data.mjs";
import { prepareManualAcceptanceEngineering } from "./manual-acceptance-engineering-data.mjs";
import { OutsourcingOrderStatus } from "../../web/src/common/consts/statuses.generated.mjs";

const followupFixtures = new WeakMap();
export async function prepareTransactionSourceTask(client, role, sourceType, sourceID, prefix) {
  if (!followupFixtures.has(client)) followupFixtures.set(client, new Map());
  const cache = followupFixtures.get(client);
  const key = `${role}:${sourceType}:${sourceID}`;
  if (cache.has(key)) return cache.get(key);
  const options = await client.rpc("admin", "workflow", "get_task_create_options", { source_type: sourceType, source_id: sourceID });
  assert.equal(options.can_create, true);
  assert.ok(options.roles.some((item) => item.role_key === role), `the actual source must have an eligible ${role} recipient`);
  const { task } = await client.rpc("admin", "workflow", "create_followup_task", {
    source_type: sourceType, source_id: sourceID, owner_role_key: role,
    task_name: "核对来源业务", description: "在岗位任务内核对来源并办理关联业务",
    due_at: Math.floor(Date.now() / 1000) + 3600, priority: 0, idempotency_key: `${prefix}:followup:${key}`,
  });
  assert.equal(task.source_type, sourceType);
  assert.equal(task.source_id, sourceID);
  assert.equal(task.owner_role_key, role);
  cache.set(key, task);
  return task;
}

export function validateTransactionTarget(options) {
  assertDisposableDatabaseTarget({
    databaseName: options.databaseName,
    databaseURL: options.databaseURL,
    profile: "browser-actions",
    runID: options.runID,
  });
  for (const key of ["backendURL", "baseURL"]) {
    assert.equal(
      browserWriteOrigin(options[key]),
      options[key],
      `${key} must be an exact loopback origin`,
    );
  }
  assert.notEqual(
    new URL(options.backendURL).port,
    "8300",
    "shared backend is forbidden",
  );
  const webPort = Number(new URL(options.baseURL).port);
  assert.ok(
    webPort >= 15200 && webPort <= 15299,
    "use a dedicated auxiliary frontend port",
  );
  assert.match(options.runID, /^[a-z0-9_]{3,24}$/u);
}

export function createTransactionClient(options) {
  validateTransactionTarget(options);
  const tokens = new Map();
  const calls = [];
  let verified = false;
  function query(sql) {
    assert.ok(verified, "verify runtime identity before database readback");
    assert.match(sql.trim(), /^SELECT\s/iu, "readback only accepts SELECT");
    const database = new URL(options.databaseURL);
    const password = decodeURIComponent(database.password);
    database.password = "";
    const value = execFileSync(
      "psql",
      [database.href, "-X", "-At", "-v", "ON_ERROR_STOP=1", "-c", sql],
      {
        encoding: "utf8",
        timeout: 10000,
        env: {
          ...process.env,
          PGPASSWORD: password,
          PGOPTIONS:
            "-c default_transaction_read_only=on -c statement_timeout=5000",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    ).trim();
    return value ? JSON.parse(value) : null;
  }
  async function raw(actor, domain, method, params = {}) {
    assert.ok(verified, "verify runtime identity before API access");
    const response = await fetch(`${options.backendURL}/rpc/${domain}`, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(30000),
      headers: {
        "content-type": "application/json",
        ...(tokens.has(actor)
          ? { authorization: `Bearer ${tokens.get(actor)}` }
          : {}),
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: `${options.runID}:${calls.length}`,
        method,
        params,
      }),
    });
    assert.equal(response.status, 200, `${domain}.${method} HTTP status`);
    const body = await response.json();
    assert.ok(
      body.result && Number.isInteger(body.result.code),
      `${method} requires a business result`,
    );
    calls.push({
      actor,
      domain,
      method,
      code: body.result.code,
      requestID: response.headers.get("x-request-id"),
    });
    return body.result;
  }
  async function rpc(actor, domain, method, params = {}) {
    const result = await raw(actor, domain, method, params);
    assert.equal(
      result.code,
      0,
      `${actor}:${domain}.${method}: ${result.message}`,
    );
    return result.data;
  }
  async function verify() {
    verified = false;
    const proof = await verifyDatabaseRuntimeIdentity(options);
    verified = true;
    try {
      assert.equal(
        query("SELECT to_json(current_database())"),
        options.databaseName,
      );
    } catch (error) {
      verified = false;
      throw error;
    }
    return proof;
  }
  async function login(role) {
    const data = await rpc(role, "auth", "admin_login", {
      username: role === "admin" ? options.adminUsername : `demo_${role}`,
      password: role === "admin" ? options.adminPassword : options.rolePassword,
    });
    assert.ok(data.access_token && !data.disabled);
    assert.equal(Boolean(data.is_super_admin), role === "admin");
    if (role !== "admin")
      assert.ok(data.roles.some((item) => item.role_key === role));
    tokens.set(role, data.access_token);
    return data;
  }
  async function verifyFrontend() {
    assert.ok(
      verified && tokens.has("admin"),
      "verify and authenticate the isolated backend first",
    );
    const expected = await rpc("admin", "auth", "me");
    const response = await fetch(`${options.baseURL}/rpc/auth`, {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(10000),
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${tokens.get("admin")}`,
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "frontend-identity",
        method: "me",
        params: {},
      }),
    });
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(
      body.result?.code,
      0,
      "frontend must accept only the verified backend's freshly issued token",
    );
    assert.deepEqual(
      body.result.data,
      expected,
      "frontend RPC must read the same isolated identity",
    );
    return {
      proof: "authenticated-proxy-matched",
      databaseName: options.databaseName,
    };
  }
  return {
    calls,
    login,
    query,
    raw,
    rpc,
    verify,
    verifyFrontend,
    roleTokens: () => Object.fromEntries(tokens),
  };
}

export async function prepareTransactionSalesOrder(client, options, fixture) {
  const { products } = await client.rpc(
    "admin",
    "masterdata",
    "list_products",
    { limit: 100 },
  );
  const product = products.find(
    (item) => item.is_active && item.default_unit_id,
  );
  assert.ok(product);
  const { product_sku: sku } = await client.rpc(
    "admin",
    "masterdata",
    "create_product_sku",
    {
      product_id: product.id,
      sku_code: `${fixture.prefix}-SKU`,
      sku_name: "标准规格",
      default_unit_id: product.default_unit_id,
      color: "白色",
    },
  );
  assert.equal(sku.is_active, true);
  const orderNo = `${fixture.prefix}-SO`;
  const { sales_order: order } = await client.rpc(
    "sales",
    "sales_order",
    "save_sales_order_with_items",
    {
      order_no: orderNo,
      customer_id: fixture.customer.id,
      customer_snapshot: { name: fixture.customer.name },
      order_date: new Date().toISOString().slice(0, 10),
      currency: "CNY",
      payment_method: "银行转账",
      payment_term_days: 0,
      tax_mode: "INCLUSIVE",
      tax_rate: "13",
      freight_terms: "INCLUDED",
      note: "预收订单",
      items: [
        {
          line_no: 1,
          product_id: product.id,
          product_sku_id: sku.id,
          unit_id: product.default_unit_id,
          product_code_snapshot: product.code,
          product_name_snapshot: product.name,
          color_snapshot: sku.color,
          ordered_quantity: "10",
          unit_price: "3.5",
          amount: "35",
        },
      ],
    },
  );
  const tokens = client.roleTokens();
  const status = await advanceSalesOrderLifecycleThroughProcess({
    plan: { backendURL: options.backendURL, runId: options.runID },
    record: { order_no: orderNo, targetStatus: "ACTIVE" },
    item: order,
    token: tokens.admin,
    roleTokens: tokens,
    fetchImpl: fetch,
    report: { steps: [] },
  });
  assert.equal(status, "ACTIVE");
  const saved = (
    await client.rpc("sales", "sales_order", "get_sales_order", {
      id: order.id,
    })
  ).sales_order;
  assert.equal(saved.lifecycle_status, "active");
  return saved;
}

export async function prepareTransactionFixture(client, options) {
  for (const role of [
    "admin",
    "purchase",
    "quality",
    "warehouse",
    "finance",
    "boss",
    "sales",
    "production",
    "pmc",
    "engineering",
  ])
    await client.login(role);
  const rpc = client.rpc;
  const manifest = structuredClone(
    buildRuntimePreviewManifest(yoyoosunCustomerPackage),
  );
  Object.assign(manifest, {
    manifest_status: "runtime_compile_ready",
    runtime_enabled: true,
    publishable: true,
    revision: `simulated-browser-${options.runID}`,
    product_version: `simulated-browser-${options.runID}`,
  });
  manifest.compiled_snapshot.browserFixture = {
    simulatedOnly: true,
    realCustomerData: false,
    runID: options.runID,
  };
  const { validation } = await rpc(
    "admin",
    "customer_config",
    "validate_customer_config",
    manifest,
  );
  assert.equal(validation.compiled_snapshot_ok, true);
  assert.equal(validation.config_hash_version, 1);
  assert.match(validation.config_hash, /^[a-f0-9]{64}$/u);
  const { revision } = await rpc(
    "admin",
    "customer_config",
    "publish_customer_config",
    manifest,
  );
  assert.equal(revision.config_hash, validation.config_hash);
  const activation = {
    customer_key: "yoyoosun",
    expected_config_hash: validation.config_hash,
    expected_product_version: manifest.product_version,
    expected_active_revision: "",
  };
  const { transition } = await rpc(
    "admin",
    "customer_config",
    "check_customer_config_transition",
    { ...activation, action: "activate", target_revision: manifest.revision },
  );
  assert.equal(transition.allowed, true, JSON.stringify(transition.blockers));
  assert.deepEqual(transition.blockers, []);
  const activated = await rpc(
    "admin",
    "customer_config",
    "activate_customer_config",
    { ...activation, revision: manifest.revision },
  );
  assert.equal(activated.revision.status, "active");
  const { session } = await rpc(
    "admin",
    "customer_config",
    "get_effective_session",
    { customer_key: "yoyoosun" },
  );
  assert.equal(session.source, "active_customer_config_revision");
  assert.equal(session.configHash, validation.config_hash);

  return prepareTransactionPurchase(client, options, validation.config_hash);
}

export async function prepareTransactionPurchase(client, options, configHash) {
  const rpc = client.rpc;
  const prefix = `SIM-E2E-${options.runID.toUpperCase()}`;
  const { supplier } = await rpc("admin", "masterdata", "create_supplier", {
    code: `${prefix}-SUP`,
    name: `${prefix} 材料供应商`,
    default_payment_term_days: 30,
    default_payment_method: "BANK_TRANSFER",
  });
  const { customer } = await rpc("admin", "masterdata", "create_customer", {
    code: `${prefix}-CUS`,
    name: `${prefix} 美悦礼品`,
  });
  const { materials } = await rpc("admin", "masterdata", "list_materials", {
    limit: 100,
  });
  const { warehouses } = await rpc("admin", "masterdata", "list_warehouses", {
    limit: 100,
  });
  const materialTemplate = materials.find(
    (item) => item.is_active && item.default_unit_id,
  );
  const warehouse = warehouses.find((item) => item.is_active);
  assert.ok(
    materialTemplate && warehouse,
    "canonical core seed must provide material and warehouse",
  );
  const { material } = await rpc("admin", "masterdata", "create_material", {
    code: `${prefix}-MAT`,
    name: `${prefix} 采购材料`,
    default_unit_id: materialTemplate.default_unit_id,
    stock_category: materialTemplate.stock_category,
    default_warehouse_id: warehouse.id,
    supplier_id: supplier.id,
  });
  await assignTransactionWarehouseScopes(client, warehouse.id);
  const { purchase_order: order } = await rpc(
    "purchase",
    "purchase_order",
    "save_purchase_order_with_items",
    {
      purchase_order_no: `${prefix}-PO`,
      supplier_id: supplier.id,
      supplier_snapshot: { code: supplier.code, name: supplier.name },
      purchase_date: new Date().toISOString().slice(0, 10),
      note: "按订单要求办理",
      items: [
        {
          line_no: 1,
          material_id: material.id,
          unit_id: material.default_unit_id,
          material_code_snapshot: material.code,
          material_name_snapshot: material.name,
          purchased_quantity: "10",
          unit_price: "3.50",
          amount: "35.00",
        },
      ],
    },
  );
  if (options.purchaseDraftOnly) {
    assert.equal(order.lifecycle_status, "draft");
    return { prefix, customer, supplier, material, warehouse, order, configHash };
  }
  await approvePurchaseOrderThroughProcess({
    purchaseOrder: order,
    customerKey: "yoyoosun",
    idempotencyPrefix: `${prefix}:purchase`,
    invoke: ({ actor, domain, method, params }) =>
      rpc(actor, domain, method, params),
  });
  const { purchase_receipt: receipt } = await rpc(
    "warehouse",
    "purchase",
    "create_purchase_receipt_from_purchase_order",
    {
      purchase_order_id: order.id,
      all_remaining: true,
      receipt_no: `${prefix}-PR`,
      warehouse_id: warehouse.id,
      received_at: new Date().toISOString().slice(0, 10),
      idempotency_key: `${prefix}:receipt`,
      note: "到货",
    },
  );
  assert.equal(receipt.status, "DRAFT");
  assert.equal(receipt.items.length, 1);
  const { quality_inspections: inspections } = await rpc(
    "quality",
    "quality",
    "list_quality_inspections",
    { purchase_receipt_id: receipt.id, limit: 100 },
  );
  assert.equal(inspections.length, 1);
  assert.equal(inspections[0].status, "SUBMITTED");
  return {
    prefix,
    customer,
    supplier,
    material,
    warehouse,
    order,
    receipt,
    inspection: inspections[0],
    configHash,
  };
}

export async function prepareTransactionReceivable(client, fixture) {
  const { rpc, query } = client;
  const { warehouses } = await rpc("admin", "masterdata", "list_warehouses", {
    limit: 100,
  });
  const warehouse = warehouses.find(
    (row) => row.is_active && row.type === "FINISHED_GOODS",
  );
  assert.ok(
    warehouse,
    "receivable shipment requires the seeded finished goods warehouse",
  );
  await assignTransactionWarehouseScopes(
    client,
    [fixture.warehouse.id, warehouse.id],
    ["warehouse", "quality", "sales"],
  );
  const order = fixture.salesOrder;
  const { sales_order_items: items } = await rpc(
    "sales",
    "sales_order",
    "list_sales_order_items",
    { sales_order_id: order.id, limit: 100 },
  );
  assert.equal(items.length, 1);
  const item = items[0];
  const prefix = `${fixture.prefix}-AR`;
  // Establish simulated opening stock through an independently reviewed adjustment.
  // Production routing is outside this receivable settlement fixture.
  let operation = (
    await rpc("warehouse", "inventory", "create_inventory_operation", {
      operation_no: `${prefix}-STOCK`,
      operation_type: "MANUAL_ADJUSTMENT",
      reason: "应收结算模拟期初库存",
      idempotency_key: `${prefix}:stock`,
      items: [
        {
          line_no: "1",
          subject_type: "PRODUCT",
          subject_id: item.product_id,
          product_sku_id: item.product_sku_id,
          unit_id: item.unit_id,
          from_warehouse_id: warehouse.id,
          adjustment_quantity: "10",
        },
      ],
    })
  ).inventory_operation;
  operation = await postTransactionInventoryCount(client, operation, prefix);
  assert.equal(operation.status, "POSTED");
  let shipment = (
    await rpc("sales", "operational_fact", "create_shipment_with_items", {
      shipment_no: `${prefix}-SHIP`,
      sales_order_id: order.id,
      customer_id: fixture.customer.id,
      customer_snapshot: fixture.customer.name,
      idempotency_key: `${prefix}:shipment`,
      note: "出货应收",
      items: [
        {
          sales_order_item_id: item.id,
          product_id: item.product_id,
          product_sku_id: item.product_sku_id,
          warehouse_id: warehouse.id,
          unit_id: item.unit_id,
          quantity: "10",
        },
      ],
    })
  ).shipment;
  assert.equal(shipment.status, "DRAFT");
  const process = await rpc(
    "sales",
    "customer_config",
    "start_finished_goods_delivery_process",
    {
      customer_key: "yoyoosun",
      shipment_id: shipment.id,
      idempotency_key: `${prefix}:release`,
    },
  );
  assert.equal(process.process_instance.business_ref_id, shipment.id);
  const { tasks } = await rpc("finance", "workflow", "list_tasks", {
    task_group: "shipment_finance_approval",
    source_type: "shipment",
    source_id: shipment.id,
    limit: 50,
  });
  const ready = tasks.filter(
    (task) =>
      task.owner_role_key === "finance" && task.task_status_key === "ready",
  );
  assert.equal(ready.length, 1);
  assert.equal(ready[0].process_instance_id, process.process_instance.id);
  await rpc("finance", "workflow", "complete_task_action", {
    task_id: ready[0].id,
    expected_version: ready[0].version,
    idempotency_key: `${prefix}:approve`,
    action_key: "complete",
    payload: {
      surface_key: "shipment-finance-approval",
      feedback: "已核对出货金额和放行条件",
    },
  });
  shipment = (
    await rpc("sales", "operational_fact", "get_shipment", {
      id: shipment.id,
    })
  ).shipment;
  assert.equal(shipment.status, "DRAFT", "finance release must not ship stock");
  assert.equal(shipment.finance_release_status, "APPROVED");
  const receivableParams = {
    shipment_id: shipment.id,
    fact_no: prefix,
    idempotency_key: `${prefix}:receivable`,
  };
  assert.equal(
    (
      await client.raw(
        "finance",
        "operational_fact",
        "create_receivable_from_shipment",
        receivableParams,
      )
    ).code,
    40010,
  );
  assert.equal(
    query(
      `SELECT to_json(count(*)) FROM finance_facts WHERE fact_no='${prefix}'`,
    ),
    0,
    "financial release alone cannot create receivables",
  );
  shipment = (
    await rpc("sales", "operational_fact", "ship_shipment", {
      id: shipment.id,
    })
  ).shipment;
  assert.equal(shipment.status, "SHIPPED");
  assert.equal(
    query(
      `SELECT to_json(quantity) FROM inventory_balances WHERE subject_type='PRODUCT' AND subject_id=${item.product_id} AND product_sku_id=${item.product_sku_id} AND warehouse_id=${warehouse.id}`,
    ),
    0,
  );
  let fact = (
    await rpc(
      "finance",
      "operational_fact",
      "create_receivable_from_shipment",
      receivableParams,
    )
  ).finance_fact;
  assert.equal(fact.fact_type, "RECEIVABLE");
  assert.equal(Number(fact.amount), 35);
  fact = (
    await rpc("finance", "operational_fact", "post_finance_fact", {
      id: fact.id,
      expected_version: fact.version,
    })
  ).finance_fact;
  assert.equal(fact.status, "POSTED");
  return { fact, shipment, stockOperation: operation };
}

export async function postTransactionInventoryCount(client, operation, prefix, { post = true, beforeExecution } = {}) {
  const { rpc } = client;
  const operationID = operation.id;
  const source = { customer_key: "yoyoosun", inventory_operation_id: operationID };
  const read = () => rpc("warehouse", "customer_config", "get_inventory_adjustment_approval_process", source);
  let data = await read();
  if (!data.process_context) {
    await rpc("warehouse", "customer_config", "start_inventory_adjustment_approval_process", {
      ...source, idempotency_key: `inventory-adjustment-approval/${operationID}`,
    });
    data = await read();
  }
  const node = (key) => {
    const found = data.process_context.nodes.find((item) => item.node_key === key);
    assert.ok(found?.id, `missing inventory process node ${key}`);
    assert.equal(found.process_instance_id, data.process_context.process_instance.id);
    return found;
  };
  const execute = async (key, method) => {
    const current = node(key);
    assert.equal(current.status, "active");
    data = await rpc("warehouse", "customer_config", method, {
      ...source, process_instance_id: current.process_instance_id,
      process_node_instance_id: current.id, expected_version: current.version,
      idempotency_key: `${prefix}:inventory-verification:${operationID}:${current.id}:${method}`,
    });
  };
  if (data.source_readback.status === "DRAFT") {
    await execute("submit_inventory_adjustment", "execute_inventory_adjustment_submit");
  }
  for (const [actor, key] of [["boss", "inventory_adjustment_approval"], ["warehouse", "inventory_adjustment_execution"]]) {
    const current = node(key);
    if (current.status === "completed") continue;
    assert.equal(current.status, "active");
    const { tasks } = await rpc(actor, "workflow", "list_tasks", {
      source_type: "inventory_operation", source_id: operationID, limit: 200,
    });
    const matches = tasks.filter((item) => item.process_instance_id === current.process_instance_id && item.process_node_instance_id === current.id);
    assert.equal(matches.length, 1, `${key} must have one bound task`);
    const task = matches[0];
    assert.equal(task.owner_role_key, actor);
    if (actor === 'warehouse' && beforeExecution) await beforeExecution(task);
    const { task: completed } = await rpc(actor, "workflow", "complete_task_action", {
      task_id: task.id, expected_version: task.version,
      idempotency_key: `${prefix}:inventory-verification:${operationID}:${task.id}:complete`,
      action_key: "complete", reason: "模拟核对库存盘点与调整",
      payload: { surface_key: "workflow_business_module", feedback: "模拟核对库存盘点与调整",
        ...(actor === "boss" ? { process_decision: { reason: "模拟独立复核" } } : {}),
      },
    });
    assert.equal(completed.task_status_key, "done");
    data = await read();
  }
  assert.equal(data.source_readback.status, "APPROVED");
  if (post) {
    await execute("post_inventory_adjustment", "execute_inventory_adjustment_post");
    assert.equal(data.source_readback.status, "POSTED");
  }
  return data.source_readback;
}

export async function prepareTransactionProductionSource(
  client,
  options,
  fixture,
) {
  const prefix = `${fixture.prefix}-${options.mobile ? "MP" : "DP"}`;
  const salesOrder = await prepareTransactionSalesOrder(client, options, {
    ...fixture,
    prefix,
  });
  const { sales_order_items: salesItems } = await client.rpc(
    "sales",
    "sales_order",
    "list_sales_order_items",
    { sales_order_id: salesOrder.id, limit: 100 },
  );
  assert.equal(salesItems.length, 1);
  const item = salesItems[0];
  const { warehouses } = await client.rpc(
    "admin",
    "masterdata",
    "list_warehouses",
    { limit: 100 },
  );
  const warehouse = warehouses.find(
    (row) => row.is_active && row.type === "FINISHED_GOODS",
  );
  assert.ok(warehouse);
  await assignTransactionWarehouseScopes(
    client,
    [fixture.warehouse.id, warehouse.id],
    ["warehouse", "quality", "sales", "production", "pmc"],
  );
  let bom = (
    await client.rpc("admin", "bom", "save_bom_with_items", {
      product_id: item.product_id,
      version: `${prefix}-BOM`,
      items: [
        {
          material_id: fixture.material.id,
          unit_id: fixture.material.default_unit_id,
          quantity: "1",
          loss_rate: "0",
          position: "裁片用料",
        },
      ],
    })
  ).bom_version;
  assert.equal(bom.status, "DRAFT");
  bom = (
    await client.rpc("admin", "bom", "activate_bom_version", { id: bom.id })
  ).bom_version;
  assert.equal(bom.status, "ACTIVE");
  const materialFields = [
    "code",
    "name",
    "default_unit_id",
    "stock_category",
    "default_warehouse_id",
    "supplier_item_no",
    "category",
    "spec",
    "color",
  ];
  const { material: suppliedMaterial } = await client.rpc(
    "admin",
    "masterdata",
    "update_material",
    {
      ...Object.fromEntries(
        materialFields.map((key) => [key, fixture.material[key]]),
      ),
      id: fixture.material.id,
      supplier_id: fixture.supplier.id,
    },
  );
  assert.equal(suppliedMaterial.supplier_id, fixture.supplier.id);
  const { products } = await client.rpc(
    "engineering",
    "masterdata",
    "list_products",
    { limit: 100 },
  );
  const product = products.find((row) => row.id === item.product_id);
  assert.ok(product);
  const engineering = await prepareManualAcceptanceEngineering({
    plan: {
      prefix: "SIM-E2E",
      productionCandidates: [
        { salesOrder: { id: salesOrder.id, orderNo: salesOrder.order_no } },
      ],
    },
    sourceReport: {
      referenceRecords: {
        products: [product],
        bomVersions: [
          {
            id: bom.id,
            version: bom.version,
            productId: item.product_id,
            status: "ACTIVE",
          },
        ],
      },
    },
    rpc: ({ actor, domain, method, params }) =>
      client.rpc(actor, domain, method, params),
  });
  assert.equal(engineering.materialRequests.length, 1);
  assert.equal(engineering.materialRequests[0].status, "APPROVED");
  const { processes } = await client.rpc(
    "admin",
    "masterdata",
    "list_processes",
    { limit: 100 },
  );
  const process = processes.find(
    (row) =>
      row.is_active &&
      row.production_route_operation_code === "FABRIC_PROCESSING",
  );
  assert.ok(
    process,
    "core seed must bind the fabric route to a process master",
  );
  let contract = (
    await client.rpc(
      "purchase",
      "outsourcing_order",
      "save_outsourcing_order_with_items",
      {
        outsourcing_order_no: `${prefix}-CUT`,
        supplier_id: fixture.supplier.id,
        currency: "CNY",
        order_date: new Date().toISOString().slice(0, 10),
        expected_return_date: new Date(Date.now() + 86400000)
          .toISOString()
          .slice(0, 10),
        supplier_snapshot: {
          name: fixture.supplier.name,
          contact_name: "加工联系人",
          contact_phone: "0769-00000000",
          address: "加工路 8 号",
        },
        contract_party_snapshot: {
          buyerCompany: "毛绒玩具厂",
          buyerContact: "采购部",
          buyerPhone: "0769-00000000",
          buyerAddress: "收货路 1 号",
        },
        source_order_no: salesOrder.order_no,
        note: "生产裁片加工前置合同",
        items: [
          {
            line_no: 1,
            subject_type: "MATERIAL",
            material_id: fixture.material.id,
            process_id: process.id,
            unit_id: fixture.material.default_unit_id,
            outsourcing_quantity: "2",
            processing_item: "裁片加工",
            unit_price: "1",
            amount: "2",
          },
        ],
      },
    )
  ).outsourcing_order;
  for (const [method, status] of [
    ["submit_outsourcing_order", OutsourcingOrderStatus.SUBMITTED],
    ["confirm_outsourcing_order", OutsourcingOrderStatus.CONFIRMED],
  ]) {
    contract = (
      await client.rpc("purchase", "outsourcing_order", method, {
        id: contract.id,
        expected_version: contract.version,
        idempotency_key: `${prefix}:${method}`,
      })
    ).outsourcing_order;
    assert.equal(contract.lifecycle_status, status);
  }
  const { outsourcing_order_items: contractItems } = await client.rpc(
    "purchase",
    "outsourcing_order",
    "list_outsourcing_order_items",
    { outsourcing_order_id: contract.id, limit: 100 },
  );
  assert.equal(contractItems.length, 1);
  return {
    ...fixture,
    prefix,
    salesOrder,
    salesItem: item,
    bom,
    finishedWarehouse: warehouse,
    contract,
    contractItem: contractItems[0],
    quantity: 2,
  };
}

export async function assignTransactionWarehouseScopes(
  client,
  warehouseID,
  roleKeys = ["warehouse", "quality"],
) {
  const { roles } = await client.rpc("admin", "admin", "rbac_options");
  for (const roleKey of roleKeys) {
    const role = roles.find((item) => item.role_key === roleKey);
    assert.ok(role && !role.disabled);
    const scopes = [
      {
        resource_type: "warehouse",
        mode: "ASSIGNED",
        resource_ids: [
          ...new Set(Array.isArray(warehouseID) ? warehouseID : [warehouseID]),
        ].sort((a, b) => a - b),
      },
    ];
    const { role: updated } = await client.rpc(
      "admin",
      "admin",
      "set_role_settings",
      {
        role_key: roleKey,
        permission_keys: role.permissions,
        data_scopes: scopes,
        navigation_mode: role.navigation_mode,
        primary_menu_paths: role.primary_menu_paths,
        secondary_menu_paths: role.secondary_menu_paths,
        expected_version: role.version,
      },
    );
    assert.deepEqual(updated.data_scopes, scopes);
    assert.deepEqual(
      updated.permissions,
      role.permissions,
      "warehouse assignment must preserve capability permissions",
    );
    await client.login(roleKey);
  }
}

export async function prepareTransactionProductOutsourcingContract(client, source, operationCode) {
  assert.ok(['SEWING', 'HANDWORK'].includes(operationCode));
  const { processes } = await client.rpc('admin', 'masterdata', 'list_processes', { limit: 100 });
  const process = processes.find(row => row.is_active && row.production_route_operation_code === operationCode);
  assert.ok(process, `${operationCode} requires an active route-bound process`);
  let contract = (await client.rpc('purchase', 'outsourcing_order', 'save_outsourcing_order_with_items', {
    outsourcing_order_no: `${source.prefix}-${operationCode}`,
    supplier_id: source.supplier.id,
    supplier_snapshot: source.contract.supplier_snapshot,
    contract_party_snapshot: source.contract.contract_party_snapshot,
    expected_return_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
    currency: 'CNY',
    order_date: new Date().toISOString().slice(0, 10),
    source_order_no: source.salesOrder.order_no,
    note: '车缝或手工委外',
    items: [{
      line_no: 1, subject_type: 'PRODUCT', product_id: source.salesItem.product_id,
      product_sku_id: source.salesItem.product_sku_id, process_id: process.id,
      unit_id: source.salesItem.unit_id, outsourcing_quantity: String(source.quantity),
      processing_item: `${operationCode}加工`, unit_price: '1', amount: String(source.quantity),
    }],
  })).outsourcing_order;
  for (const [method, status] of [['submit_outsourcing_order', OutsourcingOrderStatus.SUBMITTED], ['confirm_outsourcing_order', OutsourcingOrderStatus.CONFIRMED]]) {
    contract = (await client.rpc('purchase', 'outsourcing_order', method, { id: contract.id, expected_version: contract.version, idempotency_key: `${source.prefix}:${operationCode}:${method}` })).outsourcing_order;
    assert.equal(contract.lifecycle_status, status);
  }
  const { outsourcing_order_items: items } = await client.rpc('purchase', 'outsourcing_order', 'list_outsourcing_order_items', { outsourcing_order_id: contract.id, limit: 100 });
  assert.equal(items.length, 1);
  assert.equal(items[0].product_sku_id, source.salesItem.product_sku_id);
  assert.equal(items[0].process_id, process.id);
  assert.equal(Number(items[0].outsourcing_quantity), source.quantity);
  return { contract, item: items[0] };
}
