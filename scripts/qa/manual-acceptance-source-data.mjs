#!/usr/bin/env node

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const DEFAULT_BACKEND_URL = "http://127.0.0.1:8300";
const DEFAULT_OUT_DIR = "output/qa/manual-acceptance/source-data";
const SIMULATION_PREFIX = "SIM-YOYOOSUN-UAT";
const CONFIRM_PHRASE = "APPLY_SIMULATED_MANUAL_ACCEPTANCE_DATA";
const CUSTOMER_KEY = "yoyoosun";
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);
const REQUIRED_SOURCE_MODULES = Object.freeze([
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
const FORBIDDEN_BUSINESS_COPY =
  /\b(?:workflow|fact|json-rpc|rbac|usecase|schema|api|debugrunid|raw id)\b|甲方/iu;

export const DEFAULT_SOURCE_DATA_SCALE = Object.freeze({
  customers: 60,
  suppliers: 60,
  materials: 80,
  products: 20,
  skusPerProduct: 3,
  processes: 30,
  salesOrders: 45,
  purchaseOrders: 45,
  outsourcingOrders: 45,
  bomVersions: 45,
});

export const ROLE_USERS = Object.freeze({
  seedAdmin: "admin",
  sales: "demo_sales",
  purchase: "demo_purchase",
  engineering: "demo_engineering",
  production: "demo_production",
  boss: "demo_boss",
});

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

function requiredText(value, name) {
  const text = optionalText(value);
  if (!text) throw new CliError(`${name} is required`);
  return text;
}

function asPositiveInt(value, name, { min = 1, max = 200 } = {}) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
    throw new CliError(`${name} must be an integer between ${min} and ${max}`);
  }
  return parsed;
}

export function sanitizeManualAcceptanceRunId(value) {
  const normalized = requiredText(value, "runId")
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/gu, "-")
    .replace(/-+/gu, "-")
    .replace(/^-|-$/gu, "");
  if (!normalized || normalized.length > 24) {
    throw new CliError("runId must be 1-24 safe characters");
  }
  return normalized;
}

function timestampRunId(date = new Date()) {
  return date
    .toISOString()
    .replace(/[-:]/gu, "")
    .replace(/\.\d{3}Z$/u, "Z");
}

function normalizeBackendURL(value) {
  const url = new URL(String(value || DEFAULT_BACKEND_URL).trim());
  if (url.username || url.password) {
    throw new CliError("backend URL must not contain credentials");
  }
  if (!new Set(["http:", "https:"]).has(url.protocol)) {
    throw new CliError("backend URL must use http or https");
  }
  url.pathname = url.pathname.replace(/\/+$/u, "");
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/+$/u, "");
}

function assertLocalBackendURL(backendURL, allowExternalBaseURL) {
  const url = new URL(backendURL);
  if (LOCAL_HOSTS.has(url.hostname)) return backendURL;
  if (!allowExternalBaseURL) {
    throw new CliError(
      `refuse external backend ${url.origin}; pass --allow-external-base-url only for an explicitly prepared non-production test environment`,
      2,
    );
  }
  if (
    process.env.MANUAL_ACCEPTANCE_EXTERNAL_CONFIRM !==
    "ALLOW_NON_PRODUCTION_TEST_ENV"
  ) {
    throw new CliError(
      "external backend requires MANUAL_ACCEPTANCE_EXTERNAL_CONFIRM=ALLOW_NON_PRODUCTION_TEST_ENV",
      2,
    );
  }
  return backendURL;
}

function isoDate(offsetDays = 0, base = new Date()) {
  const value = new Date(base);
  value.setUTCHours(12, 0, 0, 0);
  value.setUTCDate(value.getUTCDate() + offsetDays);
  return value.toISOString().slice(0, 10);
}

function pad(value, width = 2) {
  return String(value).padStart(width, "0");
}

function longBusinessNote(index) {
  if (index % 15 !== 0) return "模拟试用数据，请勿用于正式业务。";
  return "模拟试用数据，请勿用于正式业务。客户希望分批交付，外箱、洗水标和颜色须按订单分别核对；首批确认无误后再安排后续批次。";
}

function lineCountFor(index) {
  if (index === 13 || index % 15 === 0) return 25;
  if (index % 8 === 0) return 8;
  return 1 + (index % 3);
}

function lifecycleAt(index, values) {
  return values[(index - 1) % values.length];
}

function buildCustomers(prefix, count) {
  const regions = ["华南", "华东", "华北", "西南", "海外"];
  const types = ["礼品", "商超", "文创", "乐园", "品牌"];
  return Array.from({ length: count }, (_, offset) => {
    const index = offset + 1;
    const longName = index % 17 === 0 ? "暨周年庆限定联名毛绒礼赠项目" : "";
    return {
      code: `${prefix}-CUST-${pad(index, 3)}`,
      name: `【试用】${regions[offset % regions.length]}${types[offset % types.length]}客户 ${pad(index)}${longName}`,
      short_name: `试用客户${pad(index)}`,
      default_payment_method: index % 3 === 0 ? "月结" : "银行转账",
      default_payment_term_days: [0, 30, 45, 60][offset % 4],
      tax_no: `SIMULATED-CUSTOMER-${pad(index, 3)}`,
      note: longBusinessNote(index),
      isActive: index <= count - 5,
      contacts:
        index % 10 === 0
          ? []
          : [
              {
                owner_type: "CUSTOMER",
                name: `客户业务联系人 ${pad(index)}`,
                mobile: `1300000${pad(index, 4)}`,
                email: `customer-${pad(index, 3)}@example.invalid`,
                title: "业务联系人",
                is_primary: true,
                note: "模拟联系人，请勿用于正式业务。",
              },
              ...(index % 7 === 0
                ? []
                : [
                    {
                      owner_type: "CUSTOMER",
                      name: `客户收货联系人 ${pad(index)}`,
                      phone: `0769-0000${pad(index, 4)}`,
                      title: "收货联系人",
                      is_primary: false,
                      note: "模拟联系人，请勿用于正式业务。",
                    },
                  ]),
            ],
    };
  });
}

function buildSuppliers(prefix, count) {
  const categories = [
    ["面料", "material"],
    ["辅料", "material"],
    ["包装", "material"],
    ["车缝加工", "outsourcing"],
    ["手工加工", "outsourcing"],
    ["综合", "mixed"],
  ];
  return Array.from({ length: count }, (_, offset) => {
    const index = offset + 1;
    const [label, supplierType] = categories[offset % categories.length];
    return {
      code: `${prefix}-SUP-${pad(index, 3)}`,
      name: `【试用】${label}供应商 ${pad(index)}${index % 19 === 0 ? "（多品类与分批送货服务）" : ""}`,
      short_name: `试用${label}${pad(index)}`,
      supplier_type: supplierType,
      tax_no: `SIMULATED-SUPPLIER-${pad(index, 3)}`,
      note: longBusinessNote(index),
      isActive: index <= count - 5,
      contacts:
        index % 12 === 0
          ? []
          : [
              {
                owner_type: "SUPPLIER",
                name: `供应商业务联系人 ${pad(index)}`,
                mobile: `1310000${pad(index, 4)}`,
                email: `supplier-${pad(index, 3)}@example.invalid`,
                title: "业务联系人",
                is_primary: true,
                note: "模拟联系人，请勿用于正式业务。",
              },
              ...(index % 8 === 0
                ? []
                : [
                    {
                      owner_type: "SUPPLIER",
                      name: `供应商送货联系人 ${pad(index)}`,
                      phone: `0769-1000${pad(index, 4)}`,
                      title: "送货联系人",
                      is_primary: false,
                      note: "模拟联系人，请勿用于正式业务。",
                    },
                  ]),
            ],
    };
  });
}

function buildMaterials(prefix, count) {
  const categories = [
    "面料",
    "填充",
    "胶件",
    "绣花线",
    "洗水标",
    "包装",
    "辅料",
    "五金",
  ];
  const colors = [
    "米白",
    "浅粉",
    "雾蓝",
    "焦糖",
    "奶咖",
    "墨绿",
    "黑色",
    "彩色",
  ];
  return Array.from({ length: count }, (_, offset) => {
    const index = offset + 1;
    const category = categories[offset % categories.length];
    return {
      code: `${prefix}-MAT-${pad(index, 3)}`,
      name: `【试用】${category} ${pad(index)}${index % 13 === 0 ? "（同色不同克重与不同供应批次）" : ""}`,
      category,
      spec:
        index % 13 === 0
          ? "150cm 幅宽 / 320g / 长毛与短毛拼接专用规格"
          : `${120 + (index % 5) * 10}cm / ${180 + index * 2}g`,
      color: colors[offset % colors.length],
      isActive: index <= count - 6,
    };
  });
}

function buildProducts(prefix, count, skusPerProduct) {
  const animals = [
    "抱抱熊",
    "安抚兔",
    "趴趴狗",
    "长尾猫",
    "小狐狸",
    "节日鹿",
    "企鹅",
    "小象",
  ];
  const colors = ["米白", "浅粉", "雾蓝"];
  const sizes = ["小号", "中号", "大号"];
  return Array.from({ length: count }, (_, offset) => {
    const index = offset + 1;
    const product = {
      code: `${prefix}-PROD-${pad(index, 3)}`,
      name: `【试用】${animals[offset % animals.length]} ${pad(index)}${index % 11 === 0 ? "（礼盒装周年限定款）" : ""}`,
      style_no: `${prefix}-STYLE-${pad(index, 3)}`,
      customer_style_no: `${prefix}-CUSTOMER-STYLE-${pad(index, 3)}`,
      isActive: index <= count - 2,
    };
    product.skus = Array.from({ length: skusPerProduct }, (_, skuOffset) => ({
      sku_code: `${prefix}-SKU-${pad(index, 3)}-${pad(skuOffset + 1)}`,
      sku_name: `${product.name} / ${colors[skuOffset % colors.length]} / ${sizes[skuOffset % sizes.length]}`,
      barcode: `690${pad(index, 6)}${pad(skuOffset + 1, 3)}`,
      customer_sku: `${prefix}-CSKU-${pad(index, 3)}-${pad(skuOffset + 1)}`,
      color: colors[skuOffset % colors.length],
      color_no: `C-${pad(skuOffset + 1, 2)}`,
      size: sizes[skuOffset % sizes.length],
      packaging_version: skuOffset === 2 ? "礼盒装 V2" : "常规单只装 V1",
      isActive: !(index === count && skuOffset === skusPerProduct - 1),
    }));
    return product;
  });
}

function buildProcesses(prefix, count) {
  const names = [
    "开料",
    "裁片",
    "绣花",
    "车缝",
    "充棉",
    "手工",
    "检针",
    "查货",
    "包装",
    "贴合",
  ];
  return Array.from({ length: count }, (_, offset) => {
    const index = offset + 1;
    const name = names[offset % names.length];
    return {
      code: `${prefix}-PROC-${pad(index, 3)}`,
      name: `【试用】${name}环节 ${pad(index)}`,
      category: name,
      outsourcing_enabled: !["检针", "查货"].includes(name),
      inhouse_enabled: true,
      quality_required: ["绣花", "检针", "查货"].includes(name),
      sort_order: index * 10,
      note: `${name}环节模拟资料，请按实际生产安排选择。`,
      isActive: index <= count - 3,
    };
  });
}

function buildSalesOrders(prefix, count, customers, products) {
  const statuses = ["DRAFT", "SUBMITTED", "ACTIVE", "CLOSED", "CANCELED"];
  return Array.from({ length: count }, (_, offset) => {
    const index = offset + 1;
    const customerIndex = offset % Math.min(customers.length - 5, 45);
    const productIndex = offset % Math.min(products.length - 2, 18);
    const customer = customers[customerIndex];
    const product = products[productIndex];
    const lines = Array.from(
      { length: lineCountFor(index) },
      (_, lineOffset) => {
        const lineProduct =
          products[
            (productIndex + lineOffset) % Math.min(products.length - 2, 18)
          ];
        const sku = lineProduct.skus[lineOffset % lineProduct.skus.length];
        const quantity =
          lineOffset === 0 && index % 10 === 0
            ? 99999
            : 120 + index * 3 + lineOffset;
        const unitPrice = 18.5 + (lineOffset % 5) * 2.25;
        return {
          line_no: lineOffset + 1,
          productRef: lineProduct.code,
          skuRef: sku.sku_code,
          product_code_snapshot: lineProduct.code,
          product_name_snapshot: lineProduct.name,
          color_snapshot: sku.color,
          ordered_quantity: String(quantity),
          unit_price: unitPrice.toFixed(2),
          amount: (quantity * unitPrice).toFixed(2),
          planned_delivery_date: isoDate(14 + (index % 20) + lineOffset),
          note:
            lineOffset === 0 ? longBusinessNote(index) : "按产品规格分批交付。",
        };
      },
    );
    return {
      order_no: `${prefix}-SO-${pad(index, 3)}`,
      customerRef: customer.code,
      customer_order_no: `${prefix}-CPO-${pad(index, 3)}`,
      customer_snapshot: { name: customer.name, simulated_only: true },
      sales_owner: `试用业务员 ${pad((index % 6) + 1)}`,
      contact_snapshot: customer.contacts[0]
        ? {
            name: customer.contacts[0].name,
            mobile: customer.contacts[0].mobile,
          }
        : {},
      payment_method: index % 3 === 0 ? "月结" : "银行转账",
      payment_term_days: [0, 30, 45, 60][offset % 4],
      price_condition_note: index % 4 === 0 ? "含税含运费" : "含税，运费另计",
      order_date: isoDate(-index),
      planned_delivery_date: isoDate(14 + (index % 20)),
      note: longBusinessNote(index),
      targetStatus: lifecycleAt(index, statuses),
      items: lines,
      productRef: product.code,
    };
  });
}

function buildPurchaseOrders(prefix, count, suppliers, materials, salesOrders) {
  const statuses = ["DRAFT", "SUBMITTED", "APPROVED", "CLOSED", "CANCELED"];
  return Array.from({ length: count }, (_, offset) => {
    const index = offset + 1;
    const supplier = suppliers[offset % Math.min(suppliers.length - 5, 45)];
    const lines = Array.from(
      { length: lineCountFor(index) },
      (_, lineOffset) => {
        const material =
          materials[(offset + lineOffset) % Math.min(materials.length - 6, 74)];
        const quantity =
          lineOffset === 0 && index % 10 === 0
            ? 88888
            : 300 + index * 5 + lineOffset * 10;
        const unitPrice = 1.8 + (lineOffset % 7) * 0.65;
        const salesOrder =
          salesOrders[(offset + lineOffset) % salesOrders.length];
        return {
          line_no: lineOffset + 1,
          materialRef: material.code,
          material_code_snapshot: material.code,
          material_name_snapshot: material.name,
          color_snapshot: material.color,
          product_order_no_snapshot: salesOrder.order_no,
          product_no_snapshot: salesOrder.productRef,
          product_name_snapshot: `对应${salesOrder.productRef}`,
          purchased_quantity: String(quantity),
          unit_price: unitPrice.toFixed(2),
          amount: (quantity * unitPrice).toFixed(2),
          expected_arrival_date: isoDate(5 + (index % 15) + lineOffset),
          note:
            lineOffset === 0
              ? longBusinessNote(index)
              : "按产品订单分别标识送货。",
        };
      },
    );
    return {
      purchase_order_no: `${prefix}-PO-${pad(index, 3)}`,
      supplierRef: supplier.code,
      supplier_purchase_order_no: `${prefix}-SUP-PO-${pad(index, 3)}`,
      supplier_snapshot: { name: supplier.name, simulated_only: true },
      contract_party_snapshot: {
        buyerCompany: "试用企业",
        buyerContact: "试用采购负责人",
        buyerPhone: "0769-00000000",
        buyerAddress: "试用地址",
        buyerSigner: "试用采购负责人",
      },
      purchase_date: isoDate(-index + 2),
      expected_arrival_date: isoDate(5 + (index % 15)),
      note: longBusinessNote(index),
      targetStatus: lifecycleAt(index, statuses),
      items: lines,
    };
  });
}

function buildOutsourcingOrders(
  prefix,
  count,
  suppliers,
  products,
  materials,
  processes,
  salesOrders,
) {
  const statuses = ["DRAFT", "SUBMITTED", "CONFIRMED", "CLOSED", "CANCELED"];
  const activeProcesses = processes.filter(
    (item) => item.isActive && item.outsourcing_enabled,
  );
  return Array.from({ length: count }, (_, offset) => {
    const index = offset + 1;
    const supplier =
      suppliers[(offset * 3 + 3) % Math.min(suppliers.length - 5, 45)];
    const sourceOrder = salesOrders[offset % salesOrders.length];
    const lines = Array.from(
      { length: lineCountFor(index) },
      (_, lineOffset) => {
        const processItem =
          activeProcesses[(offset + lineOffset) % activeProcesses.length];
        const product =
          products[(offset + lineOffset) % Math.min(products.length - 2, 18)];
        const material =
          materials[(offset + lineOffset) % Math.min(materials.length - 6, 74)];
        const materialSubject = (index + lineOffset) % 4 === 0;
        const quantity =
          lineOffset === 0 && index % 10 === 0
            ? 77777
            : 100 + index * 4 + lineOffset;
        const unitPrice = 0.85 + (lineOffset % 6) * 0.55;
        return {
          line_no: lineOffset + 1,
          subject_type: materialSubject ? "MATERIAL" : "PRODUCT",
          productRef: materialSubject ? undefined : product.code,
          materialRef: materialSubject ? material.code : undefined,
          processRef: processItem.code,
          product_no_snapshot: materialSubject ? undefined : product.code,
          product_order_no_snapshot: sourceOrder.order_no,
          product_name_snapshot: materialSubject ? undefined : product.name,
          material_code_snapshot: materialSubject ? material.code : undefined,
          material_name_snapshot: materialSubject ? material.name : undefined,
          process_name_snapshot: processItem.name,
          process_category_snapshot: processItem.category,
          unit_name_snapshot: "个",
          outsourcing_quantity: String(quantity),
          unit_price: unitPrice.toFixed(2),
          amount: (quantity * unitPrice).toFixed(2),
          expected_return_date: isoDate(7 + (index % 18) + lineOffset),
          note:
            lineOffset === 0
              ? longBusinessNote(index)
              : "按订单和工序分批回货。",
        };
      },
    );
    return {
      outsourcing_order_no: `${prefix}-OS-${pad(index, 3)}`,
      supplierRef: supplier.code,
      supplier_snapshot: { name: supplier.name, simulated_only: true },
      contract_party_snapshot: {
        buyerCompany: "试用企业",
        buyerContact: "试用委外负责人",
        buyerPhone: "0769-00000000",
        buyerAddress: "试用地址",
        buyerSigner: "试用委外负责人",
      },
      source_order_no: sourceOrder.order_no,
      sourceSalesOrderRef: sourceOrder.order_no,
      order_date: isoDate(-index + 4),
      expected_return_date: isoDate(7 + (index % 18)),
      note: longBusinessNote(index),
      targetStatus: lifecycleAt(index, statuses),
      items: lines,
    };
  });
}

function buildBOMVersions(prefix, count, products, materials) {
  const productGroupCount = Math.floor(count / 3);
  const statuses = ["ARCHIVED", "ACTIVE", "DRAFT"];
  const versions = [];
  for (
    let productOffset = 0;
    productOffset < productGroupCount;
    productOffset += 1
  ) {
    const product = products[productOffset];
    for (
      let statusOffset = 0;
      statusOffset < statuses.length;
      statusOffset += 1
    ) {
      const index = versions.length + 1;
      const targetStatus = statuses[statusOffset];
      const items = Array.from(
        { length: lineCountFor(index) },
        (_, lineOffset) => {
          const material =
            materials[
              (productOffset * 3 + lineOffset) %
                Math.min(materials.length - 6, 74)
            ];
          return {
            materialRef: material.code,
            quantity: (0.2 + (lineOffset % 7) * 0.15).toFixed(6),
            loss_rate: ((lineOffset % 4) * 0.02).toFixed(6),
            position: ["面料", "填充", "五金配件", "包装", "标识"][
              lineOffset % 5
            ],
            piece_count: String((lineOffset % 4) + 1),
            total_usage_snapshot: String(120 + lineOffset * 15),
            process_base: lineOffset % 2 === 0 ? "常规底料" : "按色卡确认底料",
            process_method: ["热裁", "车缝", "充棉", "包装"][lineOffset % 4],
            note:
              lineOffset === 0 ? longBusinessNote(index) : "按色卡和样板确认。",
          };
        },
      );
      versions.push({
        productRef: product.code,
        version: `${prefix}-BOM-${pad(productOffset + 1, 3)}-${statusOffset + 1}`,
        source_order_no: `${prefix}-SO-${pad(productOffset + 1, 3)}`,
        quantity_text: String(500 + productOffset * 50),
        spare_text: productOffset % 2 === 0 ? "含 3% 备品" : "按订单数量备料",
        print_date: isoDate(-productOffset),
        designer: `试用设计员 ${pad((productOffset % 4) + 1)}`,
        maker: `试用制单员 ${pad((productOffset % 3) + 1)}`,
        auditor: "试用工程审核",
        hair_direction: productOffset % 2 === 0 ? "单方向" : "按样板方向",
        note: longBusinessNote(index),
        targetStatus,
        items,
      });
    }
  }
  return versions.slice(0, count);
}

function assertBusinessCopy(value, pathName = "dataset") {
  if (value == null) return;
  if (typeof value === "string") {
    if (FORBIDDEN_BUSINESS_COPY.test(value)) {
      throw new CliError(
        `${pathName} contains developer-facing wording: ${value}`,
      );
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) =>
      assertBusinessCopy(item, `${pathName}[${index}]`),
    );
    return;
  }
  if (typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (["targetStatus", "subject_type"].includes(key)) continue;
      assertBusinessCopy(item, `${pathName}.${key}`);
    }
  }
}

export function buildManualAcceptanceSourceDataPlan(options = {}) {
  const runId = sanitizeManualAcceptanceRunId(options.runId || "LOCAL-UAT");
  const backendURL = normalizeBackendURL(
    options.backendURL || DEFAULT_BACKEND_URL,
  );
  const scale = {
    ...DEFAULT_SOURCE_DATA_SCALE,
    ...(options.scale || {}),
  };
  for (const [key, value] of Object.entries(scale)) {
    scale[key] = asPositiveInt(value, `scale.${key}`, {
      min: 1,
      max: key === "materials" ? 200 : 120,
    });
  }
  for (const [key, minimum] of Object.entries({
    customers: 6,
    suppliers: 6,
    materials: 7,
    products: 3,
    processes: 4,
  })) {
    if (scale[key] < minimum) {
      throw new CliError(
        `scale.${key} must be at least ${minimum} for active/inactive and relation coverage`,
      );
    }
  }
  if (scale.bomVersions % 3 !== 0) {
    throw new CliError("scale.bomVersions must be divisible by 3");
  }
  if (scale.products < scale.bomVersions / 3) {
    throw new CliError(
      "scale.products must cover every three-version BOM product group",
    );
  }
  const prefix = `${SIMULATION_PREFIX}-${runId}`;
  const customers = buildCustomers(prefix, scale.customers);
  const suppliers = buildSuppliers(prefix, scale.suppliers);
  const materials = buildMaterials(prefix, scale.materials);
  const products = buildProducts(prefix, scale.products, scale.skusPerProduct);
  const processes = buildProcesses(prefix, scale.processes);
  const salesOrders = buildSalesOrders(
    prefix,
    scale.salesOrders,
    customers,
    products,
  );
  const purchaseOrders = buildPurchaseOrders(
    prefix,
    scale.purchaseOrders,
    suppliers,
    materials,
    salesOrders,
  );
  const outsourcingOrders = buildOutsourcingOrders(
    prefix,
    scale.outsourcingOrders,
    suppliers,
    products,
    materials,
    processes,
    salesOrders,
  );
  const bomVersions = buildBOMVersions(
    prefix,
    scale.bomVersions,
    products,
    materials,
  );
  const plan = {
    scope: "manual-acceptance-source-data",
    customerKey: CUSTOMER_KEY,
    simulatedOnly: true,
    realCustomerImport: false,
    directSQL: false,
    runId,
    prefix,
    backendURL,
    allowExternalBaseURL: options.allowExternalBaseURL === true,
    scale,
    records: {
      customers,
      suppliers,
      materials,
      products,
      processes,
      salesOrders,
      purchaseOrders,
      outsourcingOrders,
      bomVersions,
    },
    cleanup: {
      mode: "lifecycle-and-disable",
      description:
        "源单通过取消或关闭退出，主数据通过停用退出；不会物理删除已形成的业务记录。",
    },
    boundary:
      "全部为模拟试用数据，请勿用于正式业务，也不代表真实客户资料已经导入。",
  };
  assertBusinessCopy(plan.records);
  return plan;
}

export function parseManualAcceptanceSourceDataArgs(argv) {
  const options = {
    apply: false,
    verify: false,
    json: false,
    help: false,
    allowExternalBaseURL: false,
    backendURL:
      process.env.MANUAL_ACCEPTANCE_BACKEND_URL || DEFAULT_BACKEND_URL,
    out: DEFAULT_OUT_DIR,
    runId: process.env.MANUAL_ACCEPTANCE_RUN_ID || timestampRunId(),
    scale: {},
  };
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === "--apply") {
      options.apply = true;
      continue;
    }
    if (token === "--verify") {
      options.verify = true;
      continue;
    }
    if (token === "--json") {
      options.json = true;
      continue;
    }
    if (token === "--allow-external-base-url") {
      options.allowExternalBaseURL = true;
      continue;
    }
    if (token === "--help" || token === "-h") {
      options.help = true;
      continue;
    }
    if (!token.startsWith("--"))
      throw new CliError(`unexpected argument ${token}`, 2);
    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--"))
      throw new CliError(`missing value for ${token}`, 2);
    index += 1;
    switch (key) {
      case "backend-url":
        options.backendURL = value;
        break;
      case "out":
        options.out = value;
        break;
      case "run-id":
        options.runId = value;
        break;
      case "customers":
        options.scale.customers = value;
        break;
      case "suppliers":
        options.scale.suppliers = value;
        break;
      case "materials":
        options.scale.materials = value;
        break;
      case "products":
        options.scale.products = value;
        break;
      case "skus-per-product":
        options.scale.skusPerProduct = value;
        break;
      case "processes":
        options.scale.processes = value;
        break;
      case "sales-orders":
        options.scale.salesOrders = value;
        break;
      case "purchase-orders":
        options.scale.purchaseOrders = value;
        break;
      case "outsourcing-orders":
        options.scale.outsourcingOrders = value;
        break;
      case "bom-versions":
        options.scale.bomVersions = value;
        break;
      default:
        throw new CliError(`unknown option ${token}`, 2);
    }
  }
  options.backendURL = normalizeBackendURL(options.backendURL);
  options.runId = sanitizeManualAcceptanceRunId(options.runId);
  if (options.apply && options.verify)
    throw new CliError("--apply and --verify are separate modes", 2);
  return options;
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
      id: `manual-acceptance-${domain}-${method}-${Date.now()}`,
      method,
      params:
        domain === "auth" ? params : { customer_key: CUSTOMER_KEY, ...params },
    }),
  });
  if (response.redirected === true) {
    throw new CliError(`${domain}.${method} refused a redirected response`);
  }
  if (!response.ok)
    throw new CliError(`${domain}.${method} HTTP ${response.status}`);
  const json = await response.json();
  if (json?.result?.code !== 0) {
    throw new CliError(
      `${domain}.${method} code=${json?.result?.code} message=${json?.result?.message}`,
    );
  }
  return json.result.data || {};
}

async function loginRole({ backendURL, username, password, fetchImpl }) {
  const data = await rpcCall({
    backendURL,
    domain: "auth",
    method: "admin_login",
    params: { username, password },
    fetchImpl,
  });
  const token = data.access_token || data.token;
  if (!token) throw new CliError(`${username}: login response missing token`);
  if (username === ROLE_USERS.seedAdmin && data.is_super_admin !== true) {
    throw new CliError(
      `${username}: manual acceptance seed writer must be a local super admin`,
    );
  }
  return token;
}

async function loginRoles({
  backendURL,
  password,
  seedAdminPassword,
  includeSeedAdmin = false,
  fetchImpl,
}) {
  const roleEntries = Object.entries(ROLE_USERS).filter(
    ([role]) => includeSeedAdmin || role !== "seedAdmin",
  );
  const entries = [];
  for (const [role, username] of roleEntries) {
    entries.push([
      role,
      await loginRole({
        backendURL,
        username,
        password: role === "seedAdmin" ? seedAdminPassword : password,
        fetchImpl,
      }),
    ]);
  }
  return Object.fromEntries(entries);
}

async function assertSafeRuntime({ plan, tokens, fetchImpl }) {
  const capabilities = await rpcCall({
    backendURL: plan.backendURL,
    domain: "debug",
    method: "capabilities",
    token: tokens.seedAdmin || tokens.sales,
    fetchImpl,
  });
  if (!new Set(["local", "dev"]).has(capabilities.environment)) {
    throw new CliError(
      `refuse manual acceptance writes in environment=${capabilities.environment || "unknown"}`,
    );
  }
  const sessionData = await rpcCall({
    backendURL: plan.backendURL,
    domain: "customer_config",
    method: "get_effective_session",
    token: tokens.sales,
    fetchImpl,
  });
  const session = sessionData.session || {};
  const configRevision = optionalText(
    session.configRevision || session.config_revision,
  );
  if (
    session?.customer?.key !== CUSTOMER_KEY ||
    session.source !== "active_customer_config_revision" ||
    !configRevision
  ) {
    throw new CliError(
      "refuse writes: yoyoosun active customer configuration is not the current runtime source",
    );
  }
  const modules = session.modules || {};
  const unavailableModules = REQUIRED_SOURCE_MODULES.filter(
    (key) => modules[key] !== "enabled",
  );
  if (unavailableModules.length > 0) {
    throw new CliError(
      `refuse writes: required modules are not enabled: ${unavailableModules.join(", ")}`,
    );
  }
  return {
    environment: capabilities.environment,
    customerKey: session.customer.key,
    configRevision,
    source: session.source,
    requiredModules: REQUIRED_SOURCE_MODULES,
  };
}

function mapBy(items, key) {
  return new Map((items || []).map((item) => [item?.[key], item]));
}

async function listAll({
  plan,
  token,
  domain,
  method,
  listKey,
  fetchImpl,
  params = {},
}) {
  const data = await rpcCall({
    backendURL: plan.backendURL,
    domain,
    method,
    params: { keyword: plan.prefix, active_only: false, limit: 200, ...params },
    token,
    fetchImpl,
  });
  return data[listKey] || [];
}

async function createMissingAggregate({
  plan,
  token,
  fetchImpl,
  records,
  existing,
  key,
  method,
  resultKey,
}) {
  const steps = [];
  for (const record of records) {
    if (existing.has(record[key])) {
      steps.push({
        target: resultKey,
        key: record[key],
        action: "reuse",
        id: existing.get(record[key]).id,
      });
      continue;
    }
    const payload = { ...record };
    delete payload.isActive;
    const data = await rpcCall({
      backendURL: plan.backendURL,
      domain: "masterdata",
      method,
      params: payload,
      token,
      fetchImpl,
    });
    const item = data[resultKey];
    if (!item?.id)
      throw new CliError(`${method} response missing ${resultKey}.id`);
    existing.set(record[key], item);
    steps.push({
      target: resultKey,
      key: record[key],
      action: "create",
      id: item.id,
    });
  }
  return steps;
}

async function createMissingMasterRecords({ plan, tokens, fetchImpl, report }) {
  const customers = mapBy(
    await listAll({
      plan,
      token: tokens.sales,
      domain: "masterdata",
      method: "list_customers",
      listKey: "customers",
      fetchImpl,
    }),
    "code",
  );
  report.steps.push(
    ...(await createMissingAggregate({
      plan,
      token: tokens.sales,
      fetchImpl,
      records: plan.records.customers,
      existing: customers,
      key: "code",
      method: "save_customer_with_contacts",
      resultKey: "customer",
    })),
  );

  const suppliers = mapBy(
    await listAll({
      plan,
      token: tokens.purchase,
      domain: "masterdata",
      method: "list_suppliers",
      listKey: "suppliers",
      fetchImpl,
    }),
    "code",
  );
  report.steps.push(
    ...(await createMissingAggregate({
      plan,
      token: tokens.purchase,
      fetchImpl,
      records: plan.records.suppliers,
      existing: suppliers,
      key: "code",
      method: "save_supplier_with_contacts",
      resultKey: "supplier",
    })),
  );

  const units = await listAll({
    plan,
    token: tokens.purchase,
    domain: "masterdata",
    method: "list_units",
    listKey: "units",
    fetchImpl,
    params: { keyword: "", active_only: true },
  });
  const unit = units[0];
  if (!unit?.id)
    throw new CliError(
      "no active unit available; run scripts/seed-core-demo-data.sh first",
    );
  const warehouses = await listAll({
    plan,
    token: tokens.purchase,
    domain: "masterdata",
    method: "list_warehouses",
    listKey: "warehouses",
    fetchImpl,
    params: { keyword: "", active_only: true },
  });
  const warehouse = warehouses[0];
  if (!warehouse?.id || warehouses.length < 4)
    throw new CliError(
      "at least four active warehouses are required for multi-warehouse acceptance; run scripts/seed-core-demo-data.sh first",
    );

  const materials = mapBy(
    await listAll({
      plan,
      token: tokens.purchase,
      domain: "masterdata",
      method: "list_materials",
      listKey: "materials",
      fetchImpl,
    }),
    "code",
  );
  for (const record of plan.records.materials) {
    if (materials.has(record.code)) continue;
    const data = await rpcCall({
      backendURL: plan.backendURL,
      domain: "masterdata",
      method: "create_material",
      params: { ...record, default_unit_id: unit.id },
      token: tokens.purchase,
      fetchImpl,
    });
    materials.set(record.code, data.material);
    report.steps.push({
      target: "material",
      key: record.code,
      action: "create",
      id: data.material?.id,
    });
  }

  const products = mapBy(
    await listAll({
      plan,
      token: tokens.engineering,
      domain: "masterdata",
      method: "list_products",
      listKey: "products",
      fetchImpl,
    }),
    "code",
  );
  for (const record of plan.records.products) {
    if (!products.has(record.code)) {
      const data = await rpcCall({
        backendURL: plan.backendURL,
        domain: "masterdata",
        method: "create_product",
        params: { ...record, skus: undefined, default_unit_id: unit.id },
        token: tokens.engineering,
        fetchImpl,
      });
      products.set(record.code, data.product);
      report.steps.push({
        target: "product",
        key: record.code,
        action: "create",
        id: data.product?.id,
      });
    }
  }

  const skus = mapBy(
    await listAll({
      plan,
      token: tokens.engineering,
      domain: "masterdata",
      method: "list_product_skus",
      listKey: "product_skus",
      fetchImpl,
    }),
    "sku_code",
  );
  for (const record of plan.records.products) {
    const product = products.get(record.code);
    for (const sku of record.skus) {
      if (skus.has(sku.sku_code)) continue;
      const data = await rpcCall({
        backendURL: plan.backendURL,
        domain: "masterdata",
        method: "create_product_sku",
        params: { ...sku, product_id: product.id, default_unit_id: unit.id },
        token: tokens.engineering,
        fetchImpl,
      });
      skus.set(sku.sku_code, data.product_sku);
      report.steps.push({
        target: "product_sku",
        key: sku.sku_code,
        action: "create",
        id: data.product_sku?.id,
      });
    }
  }

  const processes = mapBy(
    await listAll({
      plan,
      token: tokens.engineering,
      domain: "masterdata",
      method: "list_processes",
      listKey: "processes",
      fetchImpl,
    }),
    "code",
  );
  for (const record of plan.records.processes) {
    if (processes.has(record.code)) continue;
    const data = await rpcCall({
      backendURL: plan.backendURL,
      domain: "masterdata",
      method: "create_process",
      params: record,
      token: tokens.engineering,
      fetchImpl,
    });
    processes.set(record.code, data.process);
    report.steps.push({
      target: "process",
      key: record.code,
      action: "create",
      id: data.process?.id,
    });
  }

  return {
    customers,
    suppliers,
    materials,
    products,
    skus,
    processes,
    unit,
    warehouse,
    warehouses,
  };
}

async function advanceLifecycle({
  plan,
  token,
  fetchImpl,
  domain,
  id,
  current,
  target,
  actions,
  resultKey,
}) {
  let status = String(current || "DRAFT").toUpperCase();
  if (status === target) return status;
  const targetPath = actions[target] || [];
  const currentIndex = targetPath.findIndex(
    (step) => step.resultStatus === status,
  );
  const remaining =
    currentIndex >= 0 ? targetPath.slice(currentIndex + 1) : targetPath;
  if (new Set(["CLOSED", "CANCELED", "ARCHIVED"]).has(status)) {
    throw new CliError(
      `${domain} id=${id} is terminal ${status}, expected ${target}`,
    );
  }
  for (const step of remaining) {
    const data = await rpcCall({
      backendURL: plan.backendURL,
      domain,
      method: step.method,
      params: { id },
      token: step.token || token,
      fetchImpl,
    });
    status = requireLifecycleMutationStatus({
      data,
      resultKey,
      domain,
      id,
      method: step.method,
      expectedStatus: step.resultStatus,
    });
  }
  if (status !== target)
    throw new CliError(`${domain} id=${id} expected ${target}, got ${status}`);
  return status;
}

export function requireLifecycleMutationStatus({
  data,
  resultKey,
  domain,
  id,
  method,
  expectedStatus,
}) {
  const item = data?.[resultKey];
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    throw new CliError(
      `${domain}.${method} id=${id} response missing ${resultKey}`,
    );
  }
  const rawStatus = optionalText(item.lifecycle_status ?? item.status);
  if (!rawStatus) {
    throw new CliError(
      `${domain}.${method} id=${id} response missing lifecycle status`,
    );
  }
  const status = rawStatus.toUpperCase();
  if (status !== expectedStatus) {
    throw new CliError(
      `${domain}.${method} id=${id} expected ${expectedStatus}, got ${status}`,
    );
  }
  return status;
}

async function applyDocumentGroup({
  plan,
  token,
  fetchImpl,
  records,
  existing,
  key,
  domain,
  saveMethod,
  resultKey,
  listStatusKey,
  resolveParams,
  lifecycleActions,
  report,
}) {
  for (const record of records) {
    let item = existing.get(record[key]);
    if (!item) {
      const data = await rpcCall({
        backendURL: plan.backendURL,
        domain,
        method: saveMethod,
        params: resolveParams(record),
        token,
        fetchImpl,
      });
      item = data[resultKey];
      if (!item?.id)
        throw new CliError(`${saveMethod} response missing ${resultKey}.id`);
      existing.set(record[key], item);
      report.steps.push({
        target: resultKey,
        key: record[key],
        action: "create",
        id: item.id,
      });
    } else {
      report.steps.push({
        target: resultKey,
        key: record[key],
        action: "reuse",
        id: item.id,
      });
    }
    const current = item[listStatusKey] || "DRAFT";
    await advanceLifecycle({
      plan,
      token,
      fetchImpl,
      domain,
      id: item.id,
      current,
      target: record.targetStatus,
      actions: lifecycleActions,
      resultKey,
    });
  }
}

export function buildSalesOrderLineReferences({
  orderNo,
  plannedItems,
  actualItems,
  productIds,
  skuIds,
  unitId,
}) {
  if (
    !Array.isArray(actualItems) ||
    actualItems.length !== plannedItems.length
  ) {
    throw new CliError(
      `${orderNo} expected ${plannedItems.length} sales order lines, got ${actualItems?.length ?? "invalid"}`,
    );
  }
  const actualByLine = new Map(
    actualItems.map((item) => [Number(item?.line_no), item]),
  );
  return plannedItems.map((planned) => {
    const actual = actualByLine.get(Number(planned.line_no));
    const expectedProductId = productIds.get(planned.productRef);
    const expectedSkuId = skuIds.get(planned.skuRef);
    if (
      !actual?.id ||
      actual.product_id !== expectedProductId ||
      actual.product_sku_id !== expectedSkuId ||
      actual.unit_id !== unitId
    ) {
      throw new CliError(
        `${orderNo} line ${planned.line_no} does not match its persisted product, SKU, or unit reference`,
      );
    }
    return {
      salesOrderItemId: actual.id,
      lineNo: actual.line_no,
      productId: actual.product_id,
      productSkuId: actual.product_sku_id,
      unitId: actual.unit_id,
      productName:
        actual.product_name_snapshot || planned.product_name_snapshot,
      color: actual.color_snapshot || planned.color_snapshot,
      quantity: actual.ordered_quantity || planned.ordered_quantity,
    };
  });
}

async function createSourceDocuments({
  plan,
  tokens,
  refs,
  fetchImpl,
  report,
}) {
  const sales = mapBy(
    await listAll({
      plan,
      token: tokens.sales,
      domain: "sales_order",
      method: "list_sales_orders",
      listKey: "sales_orders",
      fetchImpl,
    }),
    "order_no",
  );
  const salesActions = {
    DRAFT: [],
    SUBMITTED: [{ method: "submit_sales_order", resultStatus: "SUBMITTED" }],
    ACTIVE: [
      { method: "submit_sales_order", resultStatus: "SUBMITTED" },
      { method: "activate_sales_order", resultStatus: "ACTIVE" },
    ],
    CLOSED: [
      { method: "submit_sales_order", resultStatus: "SUBMITTED" },
      { method: "activate_sales_order", resultStatus: "ACTIVE" },
      { method: "close_sales_order", resultStatus: "CLOSED" },
    ],
    CANCELED: [{ method: "cancel_sales_order", resultStatus: "CANCELED" }],
  };
  await applyDocumentGroup({
    plan,
    token: tokens.sales,
    fetchImpl,
    records: plan.records.salesOrders,
    existing: sales,
    key: "order_no",
    domain: "sales_order",
    saveMethod: "save_sales_order_with_items",
    resultKey: "sales_order",
    listStatusKey: "lifecycle_status",
    lifecycleActions: salesActions,
    report,
    resolveParams: (record) => ({
      ...record,
      customer_id: refs.customers.get(record.customerRef).id,
      customerRef: undefined,
      productRef: undefined,
      targetStatus: undefined,
      items: record.items.map((item) => ({
        ...item,
        product_id: refs.products.get(item.productRef).id,
        product_sku_id: refs.skus.get(item.skuRef).id,
        unit_id: refs.unit.id,
        productRef: undefined,
        skuRef: undefined,
      })),
    }),
  });

  const salesOrderItems = new Map();
  const productIds = new Map(
    [...refs.products].map(([code, item]) => [code, item.id]),
  );
  const skuIds = new Map([...refs.skus].map(([code, item]) => [code, item.id]));
  for (const record of plan.records.salesOrders.filter(
    (item) => item.targetStatus === "ACTIVE",
  )) {
    const order = sales.get(record.order_no);
    if (!order?.id) {
      throw new CliError(`${record.order_no} active sales order is missing id`);
    }
    const data = await rpcCall({
      backendURL: plan.backendURL,
      domain: "sales_order",
      method: "list_sales_order_items",
      params: { sales_order_id: order.id, limit: 50, offset: 0 },
      token: tokens.sales,
      fetchImpl,
    });
    salesOrderItems.set(
      order.id,
      buildSalesOrderLineReferences({
        orderNo: record.order_no,
        plannedItems: record.items,
        actualItems: data.sales_order_items,
        productIds,
        skuIds,
        unitId: refs.unit.id,
      }),
    );
  }

  const purchase = mapBy(
    await listAll({
      plan,
      token: tokens.purchase,
      domain: "purchase_order",
      method: "list_purchase_orders",
      listKey: "purchase_orders",
      fetchImpl,
    }),
    "purchase_order_no",
  );
  const purchaseActions = {
    DRAFT: [],
    SUBMITTED: [{ method: "submit_purchase_order", resultStatus: "SUBMITTED" }],
    APPROVED: [
      { method: "submit_purchase_order", resultStatus: "SUBMITTED" },
      {
        method: "approve_purchase_order",
        resultStatus: "APPROVED",
        token: tokens.boss,
      },
    ],
    CLOSED: [
      { method: "submit_purchase_order", resultStatus: "SUBMITTED" },
      {
        method: "approve_purchase_order",
        resultStatus: "APPROVED",
        token: tokens.boss,
      },
      { method: "close_purchase_order", resultStatus: "CLOSED" },
    ],
    CANCELED: [{ method: "cancel_purchase_order", resultStatus: "CANCELED" }],
  };
  await applyDocumentGroup({
    plan,
    token: tokens.purchase,
    fetchImpl,
    records: plan.records.purchaseOrders,
    existing: purchase,
    key: "purchase_order_no",
    domain: "purchase_order",
    saveMethod: "save_purchase_order_with_items",
    resultKey: "purchase_order",
    listStatusKey: "lifecycle_status",
    lifecycleActions: purchaseActions,
    report,
    resolveParams: (record) => ({
      ...record,
      supplier_id: refs.suppliers.get(record.supplierRef).id,
      supplierRef: undefined,
      targetStatus: undefined,
      items: record.items.map((item) => ({
        ...item,
        material_id: refs.materials.get(item.materialRef).id,
        unit_id: refs.unit.id,
        materialRef: undefined,
      })),
    }),
  });

  const outsourcing = mapBy(
    await listAll({
      plan,
      token: tokens.production,
      domain: "outsourcing_order",
      method: "list_outsourcing_orders",
      listKey: "outsourcing_orders",
      fetchImpl,
    }),
    "outsourcing_order_no",
  );
  const outsourcingActions = {
    DRAFT: [],
    SUBMITTED: [
      { method: "submit_outsourcing_order", resultStatus: "SUBMITTED" },
    ],
    CONFIRMED: [
      { method: "submit_outsourcing_order", resultStatus: "SUBMITTED" },
      { method: "confirm_outsourcing_order", resultStatus: "CONFIRMED" },
    ],
    CLOSED: [
      { method: "submit_outsourcing_order", resultStatus: "SUBMITTED" },
      { method: "confirm_outsourcing_order", resultStatus: "CONFIRMED" },
      { method: "close_outsourcing_order", resultStatus: "CLOSED" },
    ],
    CANCELED: [
      { method: "cancel_outsourcing_order", resultStatus: "CANCELED" },
    ],
  };
  await applyDocumentGroup({
    plan,
    token: tokens.production,
    fetchImpl,
    records: plan.records.outsourcingOrders,
    existing: outsourcing,
    key: "outsourcing_order_no",
    domain: "outsourcing_order",
    saveMethod: "save_outsourcing_order_with_items",
    resultKey: "outsourcing_order",
    listStatusKey: "lifecycle_status",
    lifecycleActions: outsourcingActions,
    report,
    resolveParams: (record) => ({
      ...record,
      supplier_id: refs.suppliers.get(record.supplierRef).id,
      source_sales_order_id: sales.get(record.sourceSalesOrderRef)?.id,
      supplierRef: undefined,
      sourceSalesOrderRef: undefined,
      targetStatus: undefined,
      items: record.items.map((item) => ({
        ...item,
        product_id: item.productRef
          ? refs.products.get(item.productRef).id
          : undefined,
        material_id: item.materialRef
          ? refs.materials.get(item.materialRef).id
          : undefined,
        process_id: refs.processes.get(item.processRef).id,
        unit_id: refs.unit.id,
        productRef: undefined,
        materialRef: undefined,
        processRef: undefined,
      })),
    }),
  });
  return { sales, salesOrderItems, purchase, outsourcing };
}

export function planBOMItemReconciliation({
  version,
  status,
  plannedItems,
  actualItems,
  materialIds,
  unitId,
}) {
  const plannedByMaterial = new Map(
    plannedItems.map((item) => [materialIds.get(item.materialRef), item]),
  );
  if (
    plannedByMaterial.size !== plannedItems.length ||
    [...plannedByMaterial.keys()].some((id) => !id)
  ) {
    throw new CliError(`${version} planned BOM lines have invalid materials`);
  }
  const actualByMaterial = new Map();
  for (const item of actualItems || []) {
    const planned = plannedByMaterial.get(item?.material_id);
    if (!planned || actualByMaterial.has(item.material_id)) {
      throw new CliError(`${version} has an unexpected or duplicate BOM line`);
    }
    if (
      item.unit_id !== unitId ||
      Number(item.quantity) !== Number(planned.quantity) ||
      Number(item.loss_rate) !== Number(planned.loss_rate) ||
      String(item.position || "") !== String(planned.position || "")
    ) {
      throw new CliError(
        `${version} persisted BOM line differs from the planned material usage`,
      );
    }
    actualByMaterial.set(item.material_id, item);
  }
  const missing = plannedItems.filter(
    (item) => !actualByMaterial.has(materialIds.get(item.materialRef)),
  );
  if (missing.length > 0 && String(status || "").toUpperCase() !== "DRAFT") {
    throw new CliError(
      `${version} is ${status || "unknown"} but is missing ${missing.length} BOM lines`,
    );
  }
  return { missing, actualCount: actualByMaterial.size };
}

async function createBOMVersions({ plan, tokens, refs, fetchImpl, report }) {
  const existing = mapBy(
    await listAll({
      plan,
      token: tokens.engineering,
      domain: "bom",
      method: "list_bom_versions",
      listKey: "bom_versions",
      fetchImpl,
    }),
    "version",
  );
  const materialIds = new Map(
    [...refs.materials].map(([code, item]) => [code, item.id]),
  );
  for (const record of plan.records.bomVersions) {
    let bom = existing.get(record.version);
    let headerAction = "reuse";
    if (!bom) {
      const data = await rpcCall({
        backendURL: plan.backendURL,
        domain: "bom",
        method: "create_bom_draft",
        params: {
          ...record,
          product_id: refs.products.get(record.productRef).id,
          productRef: undefined,
          targetStatus: undefined,
          items: undefined,
        },
        token: tokens.engineering,
        fetchImpl,
      });
      bom = data.bom_version;
      if (!bom?.id)
        throw new CliError(
          `create_bom_draft response missing id for ${record.version}`,
        );
      existing.set(record.version, bom);
      headerAction = "create";
    }
    const detailData = await rpcCall({
      backendURL: plan.backendURL,
      domain: "bom",
      method: "get_bom_version",
      params: { id: bom.id },
      token: tokens.engineering,
      fetchImpl,
    });
    let detail = detailData.bom_version;
    if (!detail?.id || !Array.isArray(detail.items)) {
      throw new CliError(
        `get_bom_version response is incomplete for ${record.version}`,
      );
    }
    const reconciliation = planBOMItemReconciliation({
      version: record.version,
      status: detail.status,
      plannedItems: record.items,
      actualItems: detail.items,
      materialIds,
      unitId: refs.unit.id,
    });
    for (const item of reconciliation.missing) {
      const data = await rpcCall({
        backendURL: plan.backendURL,
        domain: "bom",
        method: "add_bom_item",
        params: {
          ...item,
          bom_header_id: bom.id,
          material_id: materialIds.get(item.materialRef),
          unit_id: refs.unit.id,
          materialRef: undefined,
        },
        token: tokens.engineering,
        fetchImpl,
      });
      if (!data.bom_item?.id) {
        throw new CliError(
          `add_bom_item response missing id for ${record.version}`,
        );
      }
    }
    const verifiedData = await rpcCall({
      backendURL: plan.backendURL,
      domain: "bom",
      method: "get_bom_version",
      params: { id: bom.id },
      token: tokens.engineering,
      fetchImpl,
    });
    detail = verifiedData.bom_version;
    const verified = planBOMItemReconciliation({
      version: record.version,
      status: detail?.status,
      plannedItems: record.items,
      actualItems: detail?.items,
      materialIds,
      unitId: refs.unit.id,
    });
    if (
      verified.missing.length > 0 ||
      verified.actualCount !== record.items.length
    ) {
      throw new CliError(
        `${record.version} BOM line reconciliation is incomplete`,
      );
    }
    report.steps.push({
      target: "bom_version",
      key: record.version,
      action: headerAction,
      id: bom.id,
      items: record.items.length,
      addedItems: reconciliation.missing.length,
    });
    const actions = {
      DRAFT: [],
      ACTIVE: [{ method: "activate_bom_version", resultStatus: "ACTIVE" }],
      ARCHIVED: [
        { method: "activate_bom_version", resultStatus: "ACTIVE" },
        { method: "archive_bom_version", resultStatus: "ARCHIVED" },
      ],
    };
    await advanceLifecycle({
      plan,
      token: tokens.engineering,
      fetchImpl,
      domain: "bom",
      id: bom.id,
      current: detail.status,
      target: record.targetStatus,
      actions,
      resultKey: "bom_version",
    });
  }
}

async function reconcileMasterActiveStates({
  plan,
  tokens,
  refs,
  fetchImpl,
  report,
}) {
  const groups = [
    [
      plan.records.customers,
      refs.customers,
      "masterdata",
      "set_customer_active",
      tokens.sales,
      "customer",
    ],
    [
      plan.records.suppliers,
      refs.suppliers,
      "masterdata",
      "set_supplier_active",
      tokens.purchase,
      "supplier",
    ],
    [
      plan.records.materials,
      refs.materials,
      "masterdata",
      "set_material_active",
      tokens.purchase,
      "material",
    ],
    [
      plan.records.products,
      refs.products,
      "masterdata",
      "set_product_active",
      tokens.engineering,
      "product",
    ],
    [
      plan.records.processes,
      refs.processes,
      "masterdata",
      "set_process_active",
      tokens.engineering,
      "process",
    ],
  ];
  for (const [records, map, domain, method, token, target] of groups) {
    for (const record of records) {
      const item = map.get(record.code);
      if (!item?.id || item.is_active === record.isActive) continue;
      await rpcCall({
        backendURL: plan.backendURL,
        domain,
        method,
        params: { id: item.id, active: record.isActive },
        token,
        fetchImpl,
      });
      item.is_active = record.isActive;
      report.steps.push({
        target,
        key: record.code,
        action: record.isActive ? "enable" : "disable",
        id: item.id,
      });
    }
  }
  for (const product of plan.records.products) {
    for (const sku of product.skus) {
      const item = refs.skus.get(sku.sku_code);
      const desiredActive = product.isActive && sku.isActive;
      if (!item?.id || item.is_active === desiredActive) continue;
      await rpcCall({
        backendURL: plan.backendURL,
        domain: "masterdata",
        method: "set_product_sku_active",
        params: { id: item.id, active: desiredActive },
        token: tokens.engineering,
        fetchImpl,
      });
      item.is_active = desiredActive;
      report.steps.push({
        target: "product_sku",
        key: sku.sku_code,
        action: desiredActive ? "enable" : "disable",
        id: item.id,
      });
    }
  }
}

export async function applyManualAcceptanceSourceData(
  plan,
  { password, adminPassword, fetchImpl = fetch } = {},
) {
  assertLocalBackendURL(plan?.backendURL, plan?.allowExternalBaseURL === true);
  if (process.env.MANUAL_ACCEPTANCE_SIM_CONFIRM !== CONFIRM_PHRASE) {
    throw new CliError(
      `apply requires MANUAL_ACCEPTANCE_SIM_CONFIRM=${CONFIRM_PHRASE}`,
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
  const effectiveAdminPassword = requiredText(
    adminPassword || process.env.MANUAL_ACCEPTANCE_ADMIN_PASSWORD,
    "MANUAL_ACCEPTANCE_ADMIN_PASSWORD",
  );
  const tokens = await loginRoles({
    backendURL: plan.backendURL,
    password: effectivePassword,
    seedAdminPassword: effectiveAdminPassword,
    includeSeedAdmin: true,
    fetchImpl,
  });
  const report = {
    mode: "apply",
    generatedAt: new Date().toISOString(),
    runId: plan.runId,
    prefix: plan.prefix,
    backendURL: plan.backendURL,
    scale: plan.scale,
    simulatedOnly: true,
    realCustomerImport: false,
    runtime: await assertSafeRuntime({ plan, tokens, fetchImpl }),
    steps: [],
  };
  const writeTokens = Object.fromEntries(
    Object.keys(tokens).map((roleKey) => [roleKey, tokens.seedAdmin]),
  );
  const refs = await createMissingMasterRecords({
    plan,
    tokens: writeTokens,
    fetchImpl,
    report,
  });
  const sourceDocuments = await createSourceDocuments({
    plan,
    tokens: writeTokens,
    refs,
    fetchImpl,
    report,
  });
  await createBOMVersions({
    plan,
    tokens: writeTokens,
    refs,
    fetchImpl,
    report,
  });
  await reconcileMasterActiveStates({
    plan,
    tokens: writeTokens,
    refs,
    fetchImpl,
    report,
  });
  report.summary = summarizeSteps(report.steps);
  report.referenceIds = {
    unitId: refs.unit.id,
    warehouseId: refs.warehouse.id,
    customerIds: [...refs.customers.values()].map((item) => item.id),
    supplierIds: [...refs.suppliers.values()].map((item) => item.id),
    materialIds: [...refs.materials.values()].map((item) => item.id),
    productIds: [...refs.products.values()].map((item) => item.id),
    skuIds: [...refs.skus.values()].map((item) => item.id),
    processIds: [...refs.processes.values()].map((item) => item.id),
  };
  report.referenceRecords = {
    unit: { id: refs.unit.id, code: refs.unit.code, name: refs.unit.name },
    warehouse: {
      id: refs.warehouse.id,
      code: refs.warehouse.code,
      name: refs.warehouse.name,
    },
    warehouses: refs.warehouses.map((item) => ({
      id: item.id,
      code: item.code,
      name: item.name,
    })),
    customers: plan.records.customers
      .filter((record) => record.isActive)
      .map((record) => ({
        code: record.code,
        id: refs.customers.get(record.code).id,
        name: record.name,
      })),
    suppliers: plan.records.suppliers
      .filter((record) => record.isActive)
      .map((record) => ({
        code: record.code,
        id: refs.suppliers.get(record.code).id,
        name: record.name,
      })),
    materials: plan.records.materials
      .filter((record) => record.isActive)
      .map((record) => ({
        code: record.code,
        id: refs.materials.get(record.code).id,
        name: record.name,
      })),
    products: plan.records.products
      .filter((record) => record.isActive)
      .map((record) => ({
        code: record.code,
        id: refs.products.get(record.code).id,
        name: record.name,
      })),
    skus: plan.records.products.flatMap((product) =>
      product.skus
        .filter((record) => product.isActive && record.isActive)
        .map((record) => ({
          code: record.sku_code,
          id: refs.skus.get(record.sku_code).id,
          name: record.sku_name,
          productCode: product.code,
          productId: refs.products.get(product.code).id,
          productName: product.name,
        })),
    ),
    processes: plan.records.processes
      .filter((record) => record.isActive)
      .map((record) => ({
        code: record.code,
        id: refs.processes.get(record.code).id,
        name: record.name,
      })),
    salesOrders: plan.records.salesOrders
      .filter((record) => record.targetStatus === "ACTIVE")
      .map((record) => ({
        id: sourceDocuments.sales.get(record.order_no).id,
        orderNo: record.order_no,
        customerCode: record.customerRef,
        customerId: refs.customers.get(record.customerRef).id,
        customerName: refs.customers.get(record.customerRef).name,
        items:
          sourceDocuments.salesOrderItems.get(
            sourceDocuments.sales.get(record.order_no).id,
          ) || [],
      })),
  };
  return report;
}

function summarizeSteps(steps) {
  const summary = {};
  for (const step of steps) {
    const key = `${step.target}.${step.action}`;
    summary[key] = (summary[key] || 0) + 1;
  }
  return summary;
}

export function statusCounts(items, key) {
  const out = {};
  for (const item of items) {
    const raw = item?.[key];
    const value =
      key === "is_active" && typeof raw === "boolean"
        ? raw
          ? "TRUE"
          : "FALSE"
        : String(raw ?? "UNKNOWN").toUpperCase();
    out[value] = (out[value] || 0) + 1;
  }
  return out;
}

export async function verifyManualAcceptanceSourceData(
  plan,
  { password, adminPassword, fetchImpl = fetch } = {},
) {
  assertLocalBackendURL(plan?.backendURL, plan?.allowExternalBaseURL === true);
  const effectivePassword = requiredText(
    password ||
      process.env.MANUAL_ACCEPTANCE_PASSWORD ||
      process.env.TRIAL_ACCOUNT_PASSWORD ||
      process.env.ERP_ROLE_DEMO_PASSWORD,
    "MANUAL_ACCEPTANCE_PASSWORD/TRIAL_ACCOUNT_PASSWORD/ERP_ROLE_DEMO_PASSWORD",
  );
  const effectiveAdminPassword = requiredText(
    adminPassword || process.env.MANUAL_ACCEPTANCE_ADMIN_PASSWORD,
    "MANUAL_ACCEPTANCE_ADMIN_PASSWORD",
  );
  const tokens = await loginRoles({
    backendURL: plan.backendURL,
    password: effectivePassword,
    seedAdminPassword: effectiveAdminPassword,
    includeSeedAdmin: true,
    fetchImpl,
  });
  const runtime = await assertSafeRuntime({ plan, tokens, fetchImpl });
  const specs = [
    [
      "customers",
      tokens.sales,
      "masterdata",
      "list_customers",
      "customers",
      "is_active",
      plan.scale.customers,
      ["TRUE", "FALSE"],
    ],
    [
      "suppliers",
      tokens.purchase,
      "masterdata",
      "list_suppliers",
      "suppliers",
      "is_active",
      plan.scale.suppliers,
      ["TRUE", "FALSE"],
    ],
    [
      "materials",
      tokens.purchase,
      "masterdata",
      "list_materials",
      "materials",
      "is_active",
      plan.scale.materials,
      ["TRUE", "FALSE"],
    ],
    [
      "product_skus",
      tokens.engineering,
      "masterdata",
      "list_product_skus",
      "product_skus",
      "is_active",
      plan.scale.products * plan.scale.skusPerProduct,
      ["TRUE", "FALSE"],
    ],
    [
      "processes",
      tokens.engineering,
      "masterdata",
      "list_processes",
      "processes",
      "is_active",
      plan.scale.processes,
      ["TRUE", "FALSE"],
    ],
    [
      "sales_orders",
      tokens.sales,
      "sales_order",
      "list_sales_orders",
      "sales_orders",
      "lifecycle_status",
      plan.scale.salesOrders,
      ["DRAFT", "SUBMITTED", "ACTIVE", "CLOSED", "CANCELED"],
    ],
    [
      "purchase_orders",
      tokens.purchase,
      "purchase_order",
      "list_purchase_orders",
      "purchase_orders",
      "lifecycle_status",
      plan.scale.purchaseOrders,
      ["DRAFT", "SUBMITTED", "APPROVED", "CLOSED", "CANCELED"],
    ],
    [
      "outsourcing_orders",
      tokens.production,
      "outsourcing_order",
      "list_outsourcing_orders",
      "outsourcing_orders",
      "lifecycle_status",
      plan.scale.outsourcingOrders,
      ["DRAFT", "SUBMITTED", "CONFIRMED", "CLOSED", "CANCELED"],
    ],
    [
      "bom_versions",
      tokens.engineering,
      "bom",
      "list_bom_versions",
      "bom_versions",
      "status",
      plan.scale.bomVersions,
      ["DRAFT", "ACTIVE", "ARCHIVED"],
    ],
  ];
  const datasets = [];
  for (const [
    key,
    token,
    domain,
    method,
    listKey,
    statusKey,
    minimum,
    expectedStatuses,
  ] of specs) {
    const items = await listAll({
      plan,
      token,
      domain,
      method,
      listKey,
      fetchImpl,
    });
    const counts = statusCounts(items, statusKey);
    const missingStatuses = expectedStatuses.filter(
      (status) => !counts[status],
    );
    const detailErrors = [];
    if (key === "bom_versions") {
      const plannedByVersion = new Map(
        plan.records.bomVersions.map((item) => [item.version, item]),
      );
      const materialIds = new Map(
        plan.records.materials.map((item) => [item.code, undefined]),
      );
      const materialRows = await listAll({
        plan,
        token: tokens.purchase,
        domain: "masterdata",
        method: "list_materials",
        listKey: "materials",
        fetchImpl,
      });
      for (const item of materialRows) materialIds.set(item.code, item.id);
      const unitRows = await listAll({
        plan,
        token: tokens.purchase,
        domain: "masterdata",
        method: "list_units",
        listKey: "units",
        fetchImpl,
        params: { keyword: "", active_only: true },
      });
      const unitId = unitRows[0]?.id;
      if (!unitId) detailErrors.push("active unit is missing");
      for (const header of items) {
        const planned = plannedByVersion.get(header.version);
        try {
          if (!planned) throw new CliError(`${header.version} is not planned`);
          const data = await rpcCall({
            backendURL: plan.backendURL,
            domain: "bom",
            method: "get_bom_version",
            params: { id: header.id },
            token: tokens.engineering,
            fetchImpl,
          });
          const detail = data.bom_version;
          const result = planBOMItemReconciliation({
            version: planned.version,
            status: detail?.status,
            plannedItems: planned.items,
            actualItems: detail?.items,
            materialIds,
            unitId,
          });
          if (
            result.missing.length > 0 ||
            result.actualCount !== planned.items.length
          ) {
            throw new CliError(`${planned.version} line count is incomplete`);
          }
        } catch (error) {
          detailErrors.push(String(error?.message || error));
        }
      }
    }
    datasets.push({
      key,
      expectedMinimum: minimum,
      actual: items.length,
      statusCounts: counts,
      missingStatuses,
      detailErrors,
      ok:
        items.length >= minimum &&
        missingStatuses.length === 0 &&
        detailErrors.length === 0,
    });
  }
  return {
    mode: "verify",
    generatedAt: new Date().toISOString(),
    runId: plan.runId,
    prefix: plan.prefix,
    simulatedOnly: true,
    realCustomerImport: false,
    runtime,
    datasets,
    ok: datasets.every((item) => item.ok),
  };
}

function buildMarkdownReport(report) {
  const lines = [
    "# 试用源数据报告 / Manual Acceptance Source Data",
    "",
    `- 模式：${report.mode}`,
    `- 试用批次：${report.runId}`,
    `- 编号前缀：${report.prefix}`,
    "- 数据性质：模拟试用数据，不是真实客户导入",
    "",
  ];
  if (report.datasets) {
    lines.push(
      "| 数据页 | 最少数量 | 当前数量 | 状态 |",
      "| --- | ---: | ---: | --- |",
    );
    for (const dataset of report.datasets) {
      lines.push(
        `| ${dataset.key} | ${dataset.expectedMinimum} | ${dataset.actual} | ${dataset.ok ? "通过" : "不足"} |`,
      );
    }
  } else {
    lines.push("## 写入摘要", "");
    for (const [key, value] of Object.entries(report.summary || {})) {
      lines.push(`- ${key}: ${value}`);
    }
  }
  lines.push(
    "",
    "> 这份报告只证明模拟资料已准备，不代表试用人员已经完成验收。",
    "",
  );
  return `${lines.join("\n")}\n`;
}

async function writeReports(outDir, report) {
  await mkdir(outDir, { recursive: true });
  const jsonPath = path.join(outDir, `${report.mode}-report.json`);
  const markdownPath = path.join(outDir, `${report.mode}-report.md`);
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, buildMarkdownReport(report), "utf8");
  return { jsonPath, markdownPath };
}

function usage() {
  return `试用源数据 / Manual Acceptance Source Data

只读计划：
  node scripts/qa/manual-acceptance-source-data.mjs --run-id LOCAL-UAT --json

写入本地开发环境：
  MANUAL_ACCEPTANCE_SIM_CONFIRM=${CONFIRM_PHRASE} \\
  MANUAL_ACCEPTANCE_PASSWORD='<local-demo-password>' \\
  MANUAL_ACCEPTANCE_ADMIN_PASSWORD='<local-admin-password>' \\
    node scripts/qa/manual-acceptance-source-data.mjs --apply --run-id LOCAL-UAT

写后核验：
  MANUAL_ACCEPTANCE_PASSWORD='<local-demo-password>' \\
  MANUAL_ACCEPTANCE_ADMIN_PASSWORD='<local-admin-password>' \\
    node scripts/qa/manual-acceptance-source-data.mjs --verify --run-id LOCAL-UAT

默认生成：60 客户、60 供应商、80 材料、20 产品/60 规格、30 加工环节、
45 销售订单、45 采购订单、45 委外订单、45 BOM 版本。

本入口默认只允许 localhost；业务名称使用试用人员可理解的中文，不写真实客户资料。`;
}

export async function runManualAcceptanceSourceDataCli(argv, deps = {}) {
  const options = parseManualAcceptanceSourceDataArgs(argv);
  if (options.help) {
    return { text: `${usage()}\n`, exitCode: 0 };
  }
  assertLocalBackendURL(options.backendURL, options.allowExternalBaseURL);
  const plan = buildManualAcceptanceSourceDataPlan(options);
  if (!options.apply && !options.verify) {
    return {
      text: `${JSON.stringify(plan, null, options.json ? 2 : 0)}\n`,
      exitCode: 0,
      plan,
    };
  }
  const report = options.apply
    ? await applyManualAcceptanceSourceData(plan, deps)
    : await verifyManualAcceptanceSourceData(plan, deps);
  const output = await writeReports(options.out, report);
  return {
    text: `[qa:manual-acceptance-source-data] ${report.mode} complete json=${output.jsonPath} md=${output.markdownPath}\n`,
    exitCode: report.ok === false ? 1 : 0,
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
  runManualAcceptanceSourceDataCli(process.argv.slice(2))
    .then((result) => {
      process.stdout.write(result.text);
      process.exitCode = result.exitCode;
    })
    .catch((error) => {
      process.stderr.write(`${error?.stack || error?.message || error}\n`);
      process.exitCode = error instanceof CliError ? error.exitCode : 1;
    });
}

export {
  CONFIRM_PHRASE as MANUAL_ACCEPTANCE_CONFIRM_PHRASE,
  SIMULATION_PREFIX,
};
