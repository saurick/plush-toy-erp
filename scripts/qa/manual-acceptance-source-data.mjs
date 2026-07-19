#!/usr/bin/env node

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  assertManualAcceptanceCapabilitiesPolicy,
  assertManualAcceptanceMutationTarget,
  assertManualAcceptanceRuntimeIdentityPrecondition,
  assertManualAcceptanceRuntimePolicy,
  assertManualAcceptanceTargetAttestation,
  parseManualAcceptanceTargetAttestation,
  resolveManualAcceptanceTarget,
} from "./manual-acceptance-target-policy.mjs";

const DEFAULT_BACKEND_URL = "http://127.0.0.1:8300";
const DEFAULT_OUT_DIR = "output/qa/manual-acceptance/source-data";
const SIMULATION_PREFIX = "SIM-YOYOOSUN-UAT";
const CONFIRM_PHRASE = "APPLY_SIMULATED_MANUAL_ACCEPTANCE_DATA";
const CUSTOMER_KEY = "yoyoosun";
export const MANUAL_ACCEPTANCE_CORE_UNIT_CODE = "YS5-DW-01";
export const MANUAL_ACCEPTANCE_CORE_WAREHOUSE_CODES = Object.freeze({
  material: "YS5-CK-01",
  product: "YS5-CK-02",
  qualityHold: "YS5-CK-03",
  workInProcess: "YS5-CK-04",
});
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

function requireUniqueCoreRecord(records, code, label) {
  const matches = (records || []).filter(
    (item) => String(item?.code || "").trim() === code,
  );
  if (matches.length !== 1 || !Number.isSafeInteger(Number(matches[0]?.id))) {
    throw new CliError(
      `${label} must contain exactly one active ${code}; reconcile the shared core dataset first`,
      2,
    );
  }
  return matches[0];
}

export function resolveManualAcceptanceCoreReferences({ units, warehouses }) {
  if (!Array.isArray(units) || !Array.isArray(warehouses)) {
    throw new CliError("core unit and warehouse queries must return arrays", 2);
  }
  const unit = requireUniqueCoreRecord(
    units,
    MANUAL_ACCEPTANCE_CORE_UNIT_CODE,
    "core units",
  );
  const selectedWarehouses = Object.values(
    MANUAL_ACCEPTANCE_CORE_WAREHOUSE_CODES,
  ).map((code) => requireUniqueCoreRecord(warehouses, code, "core warehouses"));
  return Object.freeze({
    unit,
    warehouse: selectedWarehouses[0],
    warehouses: Object.freeze(selectedWarehouses),
  });
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

function isoDate(offsetDays = 0, base = new Date()) {
  const value = new Date(base);
  value.setUTCHours(12, 0, 0, 0);
  value.setUTCDate(value.getUTCDate() + offsetDays);
  return value.toISOString().slice(0, 10);
}

function sourceDataAnchorDate(dataVersion, explicitAnchorDate) {
  const raw = optionalText(explicitAnchorDate);
  const versionDate = String(dataVersion || "").match(
    /^(\d{4})[.-](\d{2})[.-](\d{2})(?:$|[-._])/u,
  );
  const candidate =
    raw ||
    (versionDate
      ? `${versionDate[1]}-${versionDate[2]}-${versionDate[3]}`
      : undefined);
  if (!candidate) return isoDate(0);
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(candidate)) {
    throw new CliError("anchorDate must be YYYY-MM-DD");
  }
  const parsed = new Date(`${candidate}T12:00:00.000Z`);
  if (Number.isNaN(parsed.valueOf()) || isoDate(0, parsed) !== candidate) {
    throw new CliError("anchorDate must be a real calendar date");
  }
  return candidate;
}

function sourceSemanticDigest({
  datasetKey,
  dataVersion,
  runId,
  prefix,
  records,
}) {
  return createHash("sha256")
    .update(JSON.stringify({ datasetKey, dataVersion, runId, prefix, records }))
    .digest("hex");
}

export function manualAcceptanceVisibleSourcePrefix(dataVersion) {
  const version = String(dataVersion || "").trim();
  const match = version.match(/(?:^|[-._])v(\d+)$/iu);
  return match ? `YS${Number(match[1])}` : "YS-CS";
}

function pad(value, width = 2) {
  return String(value).padStart(width, "0");
}

function longBusinessNote(index) {
  const notes = [
    "分两批交货",
    "颜色按样板",
    "外箱按订单分开",
    "回货后先检验",
    "洗水标单独装袋",
  ];
  return notes[(index - 1) % notes.length];
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
  const places = [
    "东莞",
    "深圳",
    "广州",
    "佛山",
    "惠州",
    "中山",
    "珠海",
    "厦门",
    "杭州",
    "苏州",
    "宁波",
    "成都",
  ];
  const names = ["美悦礼品", "森野文创", "星城乐园", "童梦商贸", "晴空品牌"];
  const contacts = ["小陈", "小李", "小周", "小林", "小何", "小吴"];
  return Array.from({ length: count }, (_, offset) => {
    const index = offset + 1;
    const name = `${places[offset % places.length]}${names[Math.floor(offset / places.length) % names.length]}`;
    return {
      code: `${prefix}-KH-${pad(index, 3)}`,
      name,
      short_name: name.replace(
        /^(东莞|深圳|广州|佛山|惠州|中山|珠海|厦门|杭州|苏州|宁波|成都)/u,
        "",
      ),
      default_payment_method: index % 3 === 0 ? "月结" : "银行转账",
      default_payment_term_days: [0, 30, 45, 60][offset % 4],
      note: longBusinessNote(index),
      isActive: index <= count - 5,
      contacts:
        index % 10 === 0
          ? []
          : [
              {
                owner_type: "CUSTOMER",
                name: contacts[offset % contacts.length],
                title: "业务联系人",
                is_primary: true,
                note: "主要联系人",
              },
              ...(index % 7 === 0
                ? []
                : [
                    {
                      owner_type: "CUSTOMER",
                      name: contacts[(offset + 2) % contacts.length],
                      title: "收货联系人",
                      is_primary: false,
                      note: "收货联系",
                    },
                  ]),
            ],
    };
  });
}

function buildSuppliers(prefix, count) {
  const categories = [
    ["布行", "material"],
    ["辅料", "material"],
    ["包装", "material"],
    ["电绣", "outsourcing"],
    ["激光", "outsourcing"],
    ["车缝", "mixed"],
  ];
  const shortNames = [
    "嘉顺",
    "佳美",
    "安达",
    "宏达",
    "顺成",
    "恒兴",
    "新彩",
    "联丰",
    "广源",
    "华盛",
  ];
  const contacts = ["阿明", "小兰", "陈姐", "李生", "周姐", "林生"];
  return Array.from({ length: count }, (_, offset) => {
    const index = offset + 1;
    const [label, supplierType] = categories[offset % categories.length];
    const name = `${shortNames[Math.floor(offset / categories.length) % shortNames.length]}${label}`;
    return {
      code: `${prefix}-GYS-${pad(index, 3)}`,
      name,
      short_name: name,
      supplier_type: supplierType,
      note: longBusinessNote(index),
      isActive: index <= count - 5,
      contacts:
        index % 12 === 0
          ? []
          : [
              {
                owner_type: "SUPPLIER",
                name: contacts[offset % contacts.length],
                title: "业务联系人",
                is_primary: true,
                note: "主要联系人",
              },
              ...(index % 8 === 0
                ? []
                : [
                    {
                      owner_type: "SUPPLIER",
                      name: contacts[(offset + 3) % contacts.length],
                      title: "送货联系人",
                      is_primary: false,
                      note: "送货联系",
                    },
                  ]),
            ],
    };
  });
}

function buildMaterials(prefix, count) {
  const templates = [
    ["短毛绒", "面料", "58 英寸 / 280g", "米白"],
    ["提花布", "面料", "57 英寸", "浅粉"],
    ["网布", "面料", "60 英寸", "黑色"],
    ["填充棉", "填充", "A级 PP棉", "白色"],
    ["眼睛", "胶件", "12mm", "黑色"],
    ["绣花线", "绣花线", "120D", "咖色"],
    ["洗水标", "洗水标", "白底黑字", "白色"],
    ["外箱", "包装", "12只装", "牛皮色"],
    ["丝带", "辅料", "10mm", "浅蓝"],
    ["钥匙圈", "五金", "25mm", "银色"],
  ];
  return Array.from({ length: count }, (_, offset) => {
    const index = offset + 1;
    const [label, category, spec, color] = templates[offset % templates.length];
    const group = Math.floor(offset / templates.length) + 1;
    const displayColor =
      group === 1
        ? color
        : ["雾蓝", "奶咖", "浅黄", "豆绿", "藕粉", "浅灰", "焦糖"][group - 2] ||
          `色号${group}`;
    return {
      code: `${prefix}-WL-${pad(index, 3)}`,
      name: `${displayColor}${label}`,
      category,
      spec,
      color: displayColor,
      isActive: index <= count - 6,
    };
  });
}

function buildProducts(prefix, count, skusPerProduct) {
  const animals = [
    "云朵小熊",
    "星星挂兔",
    "奶油小狗",
    "长尾小猫",
    "围巾狐狸",
    "铃铛小鹿",
    "海盐企鹅",
    "口袋小象",
    "草莓小熊",
    "月亮小兔",
    "趴趴小狗",
    "花园小猫",
    "橘子狐狸",
    "雪花小鹿",
    "水手企鹅",
    "背包小象",
    "饼干小熊",
    "彩虹小兔",
    "咖啡小狗",
    "蝴蝶小猫",
  ];
  const colors = ["米白", "浅粉", "雾蓝"];
  const sizes = ["小号", "中号", "大号"];
  return Array.from({ length: count }, (_, offset) => {
    const index = offset + 1;
    const product = {
      code: `${prefix}-CP-${pad(index, 3)}`,
      name: animals[offset % animals.length],
      style_no: `${27000 + index}${index % 4 === 0 ? "-1" : "#"}`,
      isActive: index <= count - 2,
    };
    product.skus = Array.from({ length: skusPerProduct }, (_, skuOffset) => ({
      sku_code: `${prefix}-GG-${pad(index, 3)}-${pad(skuOffset + 1)}`,
      sku_name: `${colors[skuOffset % colors.length]}·${sizes[skuOffset % sizes.length]}`,
      customer_sku: `${product.style_no}-${colors[skuOffset % colors.length]}-${sizes[skuOffset % sizes.length]}`,
      color: colors[skuOffset % colors.length],
      color_no: `C-${pad(skuOffset + 1, 2)}`,
      size: sizes[skuOffset % sizes.length],
      packaging_version: skuOffset === 2 ? "礼盒装" : "单只装",
      isActive: !(index === count && skuOffset === skusPerProduct - 1),
    }));
    return product;
  });
}

function buildProcesses(prefix, count) {
  const names = [
    "裁片",
    "脸部电绣",
    "耳片激光",
    "图案热转印",
    "本体车缝",
    "充棉",
    "手工收口",
    "检针",
    "成品抽检",
    "包装",
    "装箱",
    "主料裁片",
    "辅料裁片",
    "眼鼻定位",
    "商标车缝",
    "配件安装",
    "毛面梳理",
    "线头修剪",
    "重量检查",
    "尺寸检查",
    "外观检查",
    "针距检查",
    "拉力检查",
    "金属检针",
    "包装复核",
    "外箱贴标",
    "成品装袋",
    "配件装袋",
    "首件确认",
    "尾数清点",
  ];
  return Array.from({ length: count }, (_, offset) => {
    const index = offset + 1;
    const name = names[offset % names.length];
    return {
      code: `${prefix}-GX-${pad(index, 3)}`,
      name,
      category: name,
      outsourcing_enabled: ![
        "检针",
        "成品抽检",
        "重量检查",
        "尺寸检查",
        "外观检查",
      ].includes(name),
      inhouse_enabled: true,
      quality_required: name.includes("检") || name.includes("确认"),
      sort_order: index * 10,
      note: name.includes("检") ? "做完后记录检查结果" : "按生产安排办理",
      isActive: index <= count - 3,
    };
  });
}

function buildSalesOrders(prefix, count, customers, products, anchorDate) {
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
          product_code_snapshot: lineProduct.style_no,
          product_name_snapshot: lineProduct.name,
          color_snapshot: sku.color,
          ordered_quantity: String(quantity),
          unit_price: unitPrice.toFixed(2),
          amount: (quantity * unitPrice).toFixed(2),
          planned_delivery_date: isoDate(
            14 + (index % 20) + lineOffset,
            anchorDate,
          ),
          note: lineOffset === 0 ? longBusinessNote(index) : "按颜色分开装箱",
        };
      },
    );
    return {
      order_no: `${prefix}-XD-${pad(index, 3)}`,
      customerRef: customer.code,
      customer_order_no: `${["MY", "SY", "XC", "TM", "QK"][offset % 5]}${anchorDate.slice(2, 7).replace("-", "")}${pad(index, 3)}`,
      customer_snapshot: { name: customer.name, simulated_only: true },
      sales_owner: ["小陈", "小李", "小周", "小林", "小何", "小吴"][index % 6],
      contact_snapshot: customer.contacts[0]
        ? {
            name: customer.contacts[0].name,
          }
        : {},
      payment_method: index % 3 === 0 ? "月结" : "银行转账",
      payment_term_days: [0, 30, 45, 60][offset % 4],
      price_condition_note: index % 4 === 0 ? "含税含运费" : "含税，运费另计",
      order_date: isoDate(-index, anchorDate),
      planned_delivery_date: isoDate(14 + (index % 20), anchorDate),
      note: longBusinessNote(index),
      targetStatus: lifecycleAt(index, statuses),
      items: lines,
      productRef: product.code,
    };
  });
}

function buildPurchaseOrders(
  prefix,
  count,
  suppliers,
  materials,
  salesOrders,
  anchorDate,
) {
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
        const salesItem =
          salesOrder.items[lineOffset % salesOrder.items.length];
        return {
          line_no: lineOffset + 1,
          materialRef: material.code,
          material_code_snapshot: material.code,
          material_name_snapshot: material.name,
          color_snapshot: material.color,
          product_order_no_snapshot: salesOrder.customer_order_no,
          product_no_snapshot: salesItem.product_code_snapshot,
          product_name_snapshot: salesItem.product_name_snapshot,
          purchased_quantity: String(quantity),
          unit_price: unitPrice.toFixed(2),
          amount: (quantity * unitPrice).toFixed(2),
          expected_arrival_date: isoDate(
            5 + (index % 15) + lineOffset,
            anchorDate,
          ),
          note: lineOffset === 0 ? longBusinessNote(index) : "按订单分开送货",
        };
      },
    );
    return {
      purchase_order_no: `${prefix}-CG-${pad(index, 3)}`,
      supplierRef: supplier.code,
      supplier_purchase_order_no: `CG${anchorDate.slice(2, 7).replace("-", "")}${pad(index, 3)}`,
      supplier_snapshot: { name: supplier.name, simulated_only: true },
      contract_party_snapshot: {
        buyerCompany: "永绅演示工厂",
        buyerContact: "采购部",
        buyerPhone: "0769-00000000",
        buyerAddress: "演示地址",
        buyerSigner: "采购部",
      },
      purchase_date: isoDate(-index + 2, anchorDate),
      expected_arrival_date: isoDate(5 + (index % 15), anchorDate),
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
  anchorDate,
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
          product_no_snapshot: materialSubject ? undefined : product.style_no,
          product_order_no_snapshot: materialSubject
            ? undefined
            : sourceOrder.customer_order_no,
          product_name_snapshot: materialSubject ? undefined : product.name,
          material_code_snapshot: materialSubject ? material.code : undefined,
          material_name_snapshot: materialSubject ? material.name : undefined,
          process_name_snapshot: processItem.name,
          process_category_snapshot: processItem.category,
          outsourcing_quantity: String(quantity),
          unit_price: unitPrice.toFixed(2),
          amount: (quantity * unitPrice).toFixed(2),
          expected_return_date: isoDate(
            7 + (index % 18) + lineOffset,
            anchorDate,
          ),
          note: lineOffset === 0 ? longBusinessNote(index) : "回货后先检验",
        };
      },
    );
    return {
      outsourcing_order_no: `${prefix}-WW-${pad(index, 3)}`,
      supplierRef: supplier.code,
      supplier_snapshot: { name: supplier.name, simulated_only: true },
      contract_party_snapshot: {
        buyerCompany: "永绅演示工厂",
        buyerContact: "生产部",
        buyerPhone: "0769-00000000",
        buyerAddress: "演示地址",
        buyerSigner: "生产部",
      },
      source_order_no: sourceOrder.customer_order_no,
      order_date: isoDate(-index + 4, anchorDate),
      expected_return_date: isoDate(7 + (index % 18), anchorDate),
      note: longBusinessNote(index),
      targetStatus: lifecycleAt(index, statuses),
      items: lines,
    };
  });
}

function buildBOMVersions(prefix, count, products, materials, anchorDate) {
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
            note: lineOffset === 0 ? longBusinessNote(index) : "颜色按样板",
          };
        },
      );
      versions.push({
        productRef: product.code,
        version: `${prefix}-BOM-${pad(productOffset + 1, 3)}-${statusOffset + 1}`,
        source_order_no: `${prefix}-XD-${pad(productOffset + 1, 3)}`,
        quantity_text: String(500 + productOffset * 50),
        spare_text: productOffset % 2 === 0 ? "含 3% 备品" : "按订单数量备料",
        print_date: isoDate(-productOffset, anchorDate),
        designer: ["小陈", "小李", "小周", "小林"][productOffset % 4],
        maker: ["小何", "小吴", "小梁"][productOffset % 3],
        auditor: "工程部",
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
  const targetPolicy = resolveManualAcceptanceTarget({
    backendURL: options.backendURL || DEFAULT_BACKEND_URL,
    target: options.target,
    dataVersion: options.dataVersion,
    runId,
    databaseName: options.databaseName,
  });
  const backendURL = targetPolicy.backendURL;
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
  const prefix = manualAcceptanceVisibleSourcePrefix(targetPolicy.dataVersion);
  const anchorDate = sourceDataAnchorDate(
    targetPolicy.dataVersion,
    options.anchorDate,
  );
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
    anchorDate,
  );
  const purchaseOrders = buildPurchaseOrders(
    prefix,
    scale.purchaseOrders,
    suppliers,
    materials,
    salesOrders,
    anchorDate,
  );
  const outsourcingOrders = buildOutsourcingOrders(
    prefix,
    scale.outsourcingOrders,
    suppliers,
    products,
    materials,
    processes,
    salesOrders,
    anchorDate,
  );
  const bomVersions = buildBOMVersions(
    prefix,
    scale.bomVersions,
    products,
    materials,
    anchorDate,
  );
  const records = {
    customers,
    suppliers,
    materials,
    products,
    processes,
    salesOrders,
    purchaseOrders,
    outsourcingOrders,
    bomVersions,
  };
  const plan = {
    scope: "manual-acceptance-source-data",
    customerKey: CUSTOMER_KEY,
    simulatedOnly: true,
    realCustomerImport: false,
    directSQL: false,
    target: targetPolicy.target,
    datasetKey: targetPolicy.datasetKey,
    dataVersion: targetPolicy.dataVersion,
    runId,
    prefix,
    anchorDate,
    backendURL,
    databaseName: targetPolicy.databaseName,
    scale,
    records,
    semanticDigest: sourceSemanticDigest({
      datasetKey: targetPolicy.datasetKey,
      dataVersion: targetPolicy.dataVersion,
      runId,
      prefix,
      records,
    }),
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
    backendURL:
      process.env.MANUAL_ACCEPTANCE_BACKEND_URL || DEFAULT_BACKEND_URL,
    target: process.env.MANUAL_ACCEPTANCE_TARGET,
    databaseName: process.env.MANUAL_ACCEPTANCE_DATABASE_NAME,
    dataVersion: process.env.MANUAL_ACCEPTANCE_DATA_VERSION,
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
      case "target":
        options.target = value;
        break;
      case "data-version":
        options.dataVersion = value;
        break;
      case "database-name":
        options.databaseName = value;
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
  options.runId = sanitizeManualAcceptanceRunId(options.runId);
  const targetPolicy = resolveManualAcceptanceTarget({
    backendURL: options.backendURL,
    target: options.target,
    dataVersion: options.dataVersion,
    runId: options.runId,
    databaseName: options.databaseName,
  });
  options.backendURL = targetPolicy.backendURL;
  options.target = targetPolicy.target;
  options.dataVersion = targetPolicy.dataVersion;
  options.databaseName = targetPolicy.databaseName;
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

async function assertSafeRuntime({
  plan,
  tokens,
  targetAttestation,
  fetchImpl,
}) {
  const attested = targetAttestation
    ? assertManualAcceptanceTargetAttestation({
        policy: plan,
        attestation: targetAttestation,
      })
    : undefined;
  const capabilities = await rpcCall({
    backendURL: plan.backendURL,
    domain: "debug",
    method: "capabilities",
    token: tokens.seedAdmin || tokens.sales,
    fetchImpl,
  });
  assertManualAcceptanceCapabilitiesPolicy({ policy: plan, capabilities });
  const sessionData = await rpcCall({
    backendURL: plan.backendURL,
    domain: "customer_config",
    method: "get_effective_session",
    token: tokens.sales,
    fetchImpl,
  });
  const session = sessionData.session || {};
  const runtime = assertManualAcceptanceRuntimePolicy({
    policy: plan,
    capabilities,
    session,
    requiredModules: REQUIRED_SOURCE_MODULES,
    customerKey: CUSTOMER_KEY,
  });
  return attested
    ? {
        ...runtime,
        targetAttestation: {
          source: "out-of-band",
          release: attested.release,
          migration: attested.migration,
        },
      }
    : runtime;
}

function mapBy(items, key) {
  return new Map((items || []).map((item) => [item?.[key], item]));
}

function comparableDate(value) {
  if (value == null || value === "") return null;
  if (typeof value === "number") return value;
  const parsed = Date.parse(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) return value;
  return Math.trunc(parsed / 1000);
}

function comparableDecimal(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : value;
}

function comparableValue(value) {
  if (value == null || value === "") return null;
  if (Array.isArray(value)) return value.map(comparableValue);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, comparableValue(item)]),
    );
  }
  return value;
}

export function assertPersistedSourceRecord({
  label,
  expected,
  actual,
  fields,
  dateFields = [],
  decimalFields = [],
}) {
  if (!actual || typeof actual !== "object" || Array.isArray(actual)) {
    throw new CliError(`${label} persisted record is missing`);
  }
  const dates = new Set(dateFields);
  const decimals = new Set(decimalFields);
  for (const field of fields) {
    const normalize = dates.has(field)
      ? comparableDate
      : decimals.has(field)
        ? comparableDecimal
        : comparableValue;
    const planned = normalize(expected?.[field]);
    const persisted = normalize(actual?.[field]);
    try {
      if (typeof planned === "object" && planned !== null) {
        if (JSON.stringify(planned) !== JSON.stringify(persisted)) {
          throw new Error("mismatch");
        }
      } else if (persisted !== planned) {
        throw new Error("mismatch");
      }
    } catch {
      throw new CliError(
        `${label}.${field} differs from dataVersion planned content`,
      );
    }
  }
}

function assertPersistedContacts(label, expected, actual) {
  if (!Array.isArray(actual) || actual.length !== expected.length) {
    throw new CliError(
      `${label} expected ${expected.length} contacts, got ${actual?.length ?? "invalid"}`,
    );
  }
  const byName = mapBy(actual, "name");
  for (const contact of expected) {
    assertPersistedSourceRecord({
      label: `${label} contact ${contact.name}`,
      expected: contact,
      actual: byName.get(contact.name),
      fields: [
        "owner_type",
        "name",
        "phone",
        "mobile",
        "email",
        "title",
        "is_primary",
        "note",
      ],
    });
  }
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
  persistedFields,
  contactOwnerType,
}) {
  const steps = [];
  for (const record of records) {
    if (existing.has(record[key])) {
      const current = existing.get(record[key]);
      assertPersistedSourceRecord({
        label: `${resultKey} ${record[key]}`,
        expected: record,
        actual: current,
        fields: persistedFields,
      });
      if (contactOwnerType) {
        const data = await rpcCall({
          backendURL: plan.backendURL,
          domain: "masterdata",
          method: "list_contacts_by_owner",
          params: { owner_type: contactOwnerType, owner_id: current.id },
          token,
          fetchImpl,
        });
        assertPersistedContacts(
          `${resultKey} ${record[key]}`,
          record.contacts,
          data.contacts,
        );
      }
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
    assertPersistedSourceRecord({
      label: `${resultKey} ${record[key]}`,
      expected: record,
      actual: item,
      fields: persistedFields,
    });
    if (contactOwnerType) {
      assertPersistedContacts(
        `${resultKey} ${record[key]}`,
        record.contacts,
        data.contacts,
      );
    }
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
      persistedFields: [
        "code",
        "name",
        "short_name",
        "default_payment_method",
        "default_payment_term_days",
        "tax_no",
        "note",
      ],
      contactOwnerType: "CUSTOMER",
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
      persistedFields: [
        "code",
        "name",
        "short_name",
        "supplier_type",
        "tax_no",
        "note",
      ],
      contactOwnerType: "SUPPLIER",
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
  const warehouses = await listAll({
    plan,
    token: tokens.purchase,
    domain: "masterdata",
    method: "list_warehouses",
    listKey: "warehouses",
    fetchImpl,
    params: { keyword: "", active_only: true },
  });
  const coreReferences = resolveManualAcceptanceCoreReferences({
    units,
    warehouses,
  });
  const { unit, warehouse } = coreReferences;

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
    const expected = { ...record, default_unit_id: unit.id };
    if (materials.has(record.code)) {
      assertPersistedSourceRecord({
        label: `material ${record.code}`,
        expected,
        actual: materials.get(record.code),
        fields: [
          "code",
          "name",
          "category",
          "spec",
          "color",
          "default_unit_id",
        ],
      });
      continue;
    }
    const data = await rpcCall({
      backendURL: plan.backendURL,
      domain: "masterdata",
      method: "create_material",
      params: expected,
      token: tokens.purchase,
      fetchImpl,
    });
    assertPersistedSourceRecord({
      label: `material ${record.code}`,
      expected,
      actual: data.material,
      fields: ["code", "name", "category", "spec", "color", "default_unit_id"],
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
    const expected = {
      ...record,
      skus: undefined,
      default_unit_id: unit.id,
    };
    if (!products.has(record.code)) {
      const data = await rpcCall({
        backendURL: plan.backendURL,
        domain: "masterdata",
        method: "create_product",
        params: expected,
        token: tokens.engineering,
        fetchImpl,
      });
      assertPersistedSourceRecord({
        label: `product ${record.code}`,
        expected,
        actual: data.product,
        fields: [
          "code",
          "name",
          "style_no",
          "customer_style_no",
          "default_unit_id",
        ],
      });
      products.set(record.code, data.product);
      report.steps.push({
        target: "product",
        key: record.code,
        action: "create",
        id: data.product?.id,
      });
    } else {
      assertPersistedSourceRecord({
        label: `product ${record.code}`,
        expected,
        actual: products.get(record.code),
        fields: [
          "code",
          "name",
          "style_no",
          "customer_style_no",
          "default_unit_id",
        ],
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
      const expected = {
        ...sku,
        product_id: product.id,
        default_unit_id: unit.id,
      };
      if (skus.has(sku.sku_code)) {
        assertPersistedSourceRecord({
          label: `product_sku ${sku.sku_code}`,
          expected,
          actual: skus.get(sku.sku_code),
          fields: [
            "product_id",
            "sku_code",
            "sku_name",
            "barcode",
            "customer_sku",
            "color",
            "color_no",
            "size",
            "packaging_version",
            "default_unit_id",
          ],
        });
        continue;
      }
      const data = await rpcCall({
        backendURL: plan.backendURL,
        domain: "masterdata",
        method: "create_product_sku",
        params: expected,
        token: tokens.engineering,
        fetchImpl,
      });
      assertPersistedSourceRecord({
        label: `product_sku ${sku.sku_code}`,
        expected,
        actual: data.product_sku,
        fields: [
          "product_id",
          "sku_code",
          "sku_name",
          "barcode",
          "customer_sku",
          "color",
          "color_no",
          "size",
          "packaging_version",
          "default_unit_id",
        ],
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
    if (processes.has(record.code)) {
      assertPersistedSourceRecord({
        label: `process ${record.code}`,
        expected: record,
        actual: processes.get(record.code),
        fields: [
          "code",
          "name",
          "category",
          "outsourcing_enabled",
          "inhouse_enabled",
          "quality_required",
          "sort_order",
          "note",
        ],
      });
      continue;
    }
    const data = await rpcCall({
      backendURL: plan.backendURL,
      domain: "masterdata",
      method: "create_process",
      params: record,
      token: tokens.engineering,
      fetchImpl,
    });
    assertPersistedSourceRecord({
      label: `process ${record.code}`,
      expected: record,
      actual: data.process,
      fields: [
        "code",
        "name",
        "category",
        "outsourcing_enabled",
        "inhouse_enabled",
        "quality_required",
        "sort_order",
        "note",
      ],
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
    warehouses: [...coreReferences.warehouses],
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
  headerFields,
  headerDateFields,
  itemMethod,
  itemListKey,
  itemForeignKey,
  itemFields,
  itemDateFields,
  itemDecimalFields,
  report,
}) {
  for (const record of records) {
    const resolvedParams = resolveParams(record);
    let item = existing.get(record[key]);
    if (!item) {
      const data = await rpcCall({
        backendURL: plan.backendURL,
        domain,
        method: saveMethod,
        params: resolvedParams,
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
    assertPersistedSourceRecord({
      label: `${resultKey} ${record[key]}`,
      expected: resolvedParams,
      actual: item,
      fields: headerFields,
      dateFields: headerDateFields,
    });
    const itemData = await rpcCall({
      backendURL: plan.backendURL,
      domain,
      method: itemMethod,
      params: { [itemForeignKey]: item.id, limit: 200, offset: 0 },
      token,
      fetchImpl,
    });
    const persistedItems = itemData[itemListKey];
    if (
      !Array.isArray(persistedItems) ||
      persistedItems.length !== resolvedParams.items.length
    ) {
      throw new CliError(
        `${resultKey} ${record[key]} expected ${resolvedParams.items.length} lines, got ${persistedItems?.length ?? "invalid"}`,
      );
    }
    const persistedByLine = mapBy(persistedItems, "line_no");
    for (const expectedItem of resolvedParams.items) {
      assertPersistedSourceRecord({
        label: `${resultKey} ${record[key]} line ${expectedItem.line_no}`,
        expected: expectedItem,
        actual: persistedByLine.get(expectedItem.line_no),
        fields: itemFields,
        dateFields: itemDateFields,
        decimalFields: itemDecimalFields,
      });
    }
    const current = item[listStatusKey] || "DRAFT";
    const finalStatus = await advanceLifecycle({
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
    item[listStatusKey] = finalStatus;
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

export function buildPurchaseOrderLineReferences({
  orderNo,
  plannedItems,
  actualItems,
  materialIds,
  unitId,
}) {
  if (
    !Array.isArray(actualItems) ||
    actualItems.length !== plannedItems.length
  ) {
    throw new CliError(
      `${orderNo} expected ${plannedItems.length} purchase order lines, got ${actualItems?.length ?? "invalid"}`,
    );
  }
  const actualByLine = new Map(
    actualItems.map((item) => [Number(item?.line_no), item]),
  );
  return plannedItems.map((planned) => {
    const actual = actualByLine.get(Number(planned.line_no));
    const expectedMaterialId = materialIds.get(planned.materialRef);
    if (
      !actual?.id ||
      actual.material_id !== expectedMaterialId ||
      actual.unit_id !== unitId ||
      String(actual.line_status || "").toUpperCase() !== "OPEN"
    ) {
      throw new CliError(
        `${orderNo} line ${planned.line_no} does not match its persisted material, unit, or open-line reference`,
      );
    }
    return {
      purchaseOrderItemId: actual.id,
      lineNo: actual.line_no,
      materialId: actual.material_id,
      unitId: actual.unit_id,
      quantity: actual.purchased_quantity,
      unitPrice: actual.unit_price,
      amount: actual.amount,
    };
  });
}

export function buildOutsourcingOrderLineReferences({
  orderNo,
  plannedItems,
  actualItems,
  productIds,
  materialIds,
  processIds,
  unitId,
}) {
  if (
    !Array.isArray(actualItems) ||
    actualItems.length !== plannedItems.length
  ) {
    throw new CliError(
      `${orderNo} expected ${plannedItems.length} outsourcing order lines, got ${actualItems?.length ?? "invalid"}`,
    );
  }
  const actualByLine = new Map(
    actualItems.map((item) => [Number(item?.line_no), item]),
  );
  return plannedItems.map((planned) => {
    const actual = actualByLine.get(Number(planned.line_no));
    const subjectType = String(planned.subject_type || "").toUpperCase();
    const expectedProductId = planned.productRef
      ? productIds.get(planned.productRef)
      : undefined;
    const expectedMaterialId = planned.materialRef
      ? materialIds.get(planned.materialRef)
      : undefined;
    const expectedProcessId = processIds.get(planned.processRef);
    if (
      !actual?.id ||
      String(actual.subject_type || "").toUpperCase() !== subjectType ||
      (actual.product_id ?? undefined) !== expectedProductId ||
      (actual.material_id ?? undefined) !== expectedMaterialId ||
      actual.process_id !== expectedProcessId ||
      actual.unit_id !== unitId ||
      String(actual.line_status || "").toUpperCase() !== "OPEN"
    ) {
      throw new CliError(
        `${orderNo} line ${planned.line_no} does not match its persisted subject, process, unit, or open-line reference`,
      );
    }
    const subjectId =
      subjectType === "MATERIAL" ? actual.material_id : actual.product_id;
    return {
      outsourcingOrderItemId: actual.id,
      lineNo: actual.line_no,
      subjectType,
      subjectId,
      ...(actual.product_id == null ? {} : { productId: actual.product_id }),
      ...(actual.product_sku_id == null
        ? {}
        : { productSkuId: actual.product_sku_id }),
      ...(actual.material_id == null ? {} : { materialId: actual.material_id }),
      processId: actual.process_id,
      unitId: actual.unit_id,
      quantity: actual.outsourcing_quantity,
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
    headerFields: [
      "order_no",
      "customer_id",
      "customer_order_no",
      "customer_snapshot",
      "sales_owner",
      "contact_snapshot",
      "payment_method",
      "payment_term_days",
      "price_condition_note",
      "order_date",
      "planned_delivery_date",
      "note",
    ],
    headerDateFields: ["order_date", "planned_delivery_date"],
    itemMethod: "list_sales_order_items",
    itemListKey: "sales_order_items",
    itemForeignKey: "sales_order_id",
    itemFields: [
      "line_no",
      "product_id",
      "product_sku_id",
      "unit_id",
      "product_code_snapshot",
      "product_name_snapshot",
      "color_snapshot",
      "ordered_quantity",
      "unit_price",
      "amount",
      "planned_delivery_date",
      "note",
    ],
    itemDateFields: ["planned_delivery_date"],
    itemDecimalFields: ["ordered_quantity", "unit_price", "amount"],
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
    headerFields: [
      "purchase_order_no",
      "supplier_id",
      "supplier_purchase_order_no",
      "supplier_snapshot",
      "contract_party_snapshot",
      "purchase_date",
      "expected_arrival_date",
      "note",
    ],
    headerDateFields: ["purchase_date", "expected_arrival_date"],
    itemMethod: "list_purchase_order_items",
    itemListKey: "purchase_order_items",
    itemForeignKey: "purchase_order_id",
    itemFields: [
      "line_no",
      "material_id",
      "unit_id",
      "material_code_snapshot",
      "material_name_snapshot",
      "color_snapshot",
      "product_order_no_snapshot",
      "product_no_snapshot",
      "product_name_snapshot",
      "purchased_quantity",
      "unit_price",
      "amount",
      "expected_arrival_date",
      "note",
    ],
    itemDateFields: ["expected_arrival_date"],
    itemDecimalFields: ["purchased_quantity", "unit_price", "amount"],
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

  const materialIds = new Map(
    [...refs.materials].map(([code, item]) => [code, item.id]),
  );
  const purchaseOrderItems = new Map();
  for (const record of plan.records.purchaseOrders.filter(
    (item) => item.targetStatus === "APPROVED",
  )) {
    const order = purchase.get(record.purchase_order_no);
    if (!order?.id) {
      throw new CliError(
        `${record.purchase_order_no} approved purchase order is missing id`,
      );
    }
    const data = await rpcCall({
      backendURL: plan.backendURL,
      domain: "purchase_order",
      method: "list_purchase_order_items",
      params: { purchase_order_id: order.id, limit: 50, offset: 0 },
      token: tokens.purchase,
      fetchImpl,
    });
    purchaseOrderItems.set(
      order.id,
      buildPurchaseOrderLineReferences({
        orderNo: record.purchase_order_no,
        plannedItems: record.items,
        actualItems: data.purchase_order_items,
        materialIds,
        unitId: refs.unit.id,
      }),
    );
  }

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
    headerFields: [
      "outsourcing_order_no",
      "supplier_id",
      "supplier_snapshot",
      "contract_party_snapshot",
      "source_order_no",
      "order_date",
      "expected_return_date",
      "note",
    ],
    headerDateFields: ["order_date", "expected_return_date"],
    itemMethod: "list_outsourcing_order_items",
    itemListKey: "outsourcing_order_items",
    itemForeignKey: "outsourcing_order_id",
    itemFields: [
      "line_no",
      "subject_type",
      "product_id",
      "material_id",
      "process_id",
      "unit_id",
      "product_no_snapshot",
      "product_order_no_snapshot",
      "product_name_snapshot",
      "material_code_snapshot",
      "material_name_snapshot",
      "process_name_snapshot",
      "process_category_snapshot",
      "unit_name_snapshot",
      "outsourcing_quantity",
      "unit_price",
      "amount",
      "expected_return_date",
      "note",
    ],
    itemDateFields: ["expected_return_date"],
    itemDecimalFields: ["outsourcing_quantity", "unit_price", "amount"],
    report,
    resolveParams: (record) => ({
      ...record,
      supplier_id: refs.suppliers.get(record.supplierRef).id,
      supplierRef: undefined,
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
        unit_name_snapshot: refs.unit.name,
        productRef: undefined,
        materialRef: undefined,
        processRef: undefined,
      })),
    }),
  });
  const outsourcingOrderItems = new Map();
  for (const confirmedRecord of plan.records.outsourcingOrders.filter(
    (item) => item.targetStatus === "CONFIRMED",
  )) {
    const order = outsourcing.get(confirmedRecord.outsourcing_order_no);
    if (!order?.id) {
      throw new CliError(
        `${confirmedRecord.outsourcing_order_no} confirmed outsourcing order is missing id`,
      );
    }
    const data = await rpcCall({
      backendURL: plan.backendURL,
      domain: "outsourcing_order",
      method: "list_outsourcing_order_items",
      params: { outsourcing_order_id: order.id, limit: 50, offset: 0 },
      token: tokens.production,
      fetchImpl,
    });
    outsourcingOrderItems.set(
      order.id,
      buildOutsourcingOrderLineReferences({
        orderNo: confirmedRecord.outsourcing_order_no,
        plannedItems: confirmedRecord.items,
        actualItems: data.outsourcing_order_items,
        productIds,
        materialIds,
        processIds: new Map(
          [...refs.processes].map(([code, item]) => [code, item.id]),
        ),
        unitId: refs.unit.id,
      }),
    );
  }
  return {
    sales,
    salesOrderItems,
    purchase,
    purchaseOrderItems,
    outsourcing,
    outsourcingOrderItems,
  };
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
  const details = new Map();
  for (const record of plan.records.bomVersions) {
    let bom = existing.get(record.version);
    let headerAction = "reuse";
    if (!bom) {
      const data = await rpcCall({
        backendURL: plan.backendURL,
        domain: "bom",
        method: "save_bom_with_items",
        params: {
          ...record,
          product_id: refs.products.get(record.productRef).id,
          productRef: undefined,
          targetStatus: undefined,
          items: record.items.map((item) => ({
            ...item,
            material_id: materialIds.get(item.materialRef),
            unit_id: refs.unit.id,
            materialRef: undefined,
          })),
        },
        token: tokens.engineering,
        fetchImpl,
      });
      bom = data.bom_version;
      if (!bom?.id)
        throw new CliError(
          `save_bom_with_items response missing id for ${record.version}`,
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
    assertPersistedSourceRecord({
      label: `bom_version ${record.version}`,
      expected: {
        ...record,
        product_id: refs.products.get(record.productRef).id,
      },
      actual: detail,
      fields: [
        "product_id",
        "version",
        "source_order_no",
        "quantity_text",
        "spare_text",
        "print_date",
        "designer",
        "maker",
        "auditor",
        "hair_direction",
        "note",
      ],
      dateFields: ["print_date"],
    });
    const reconciliation = planBOMItemReconciliation({
      version: record.version,
      status: detail.status,
      plannedItems: record.items,
      actualItems: detail.items,
      materialIds,
      unitId: refs.unit.id,
    });
    if (
      String(detail.status || "").toUpperCase() === "DRAFT" &&
      (reconciliation.missing.length > 0 ||
        reconciliation.actualCount !== record.items.length)
    ) {
      const existingByMaterial = new Map(
        detail.items.map((item) => [Number(item.material_id || 0), item]),
      );
      const data = await rpcCall({
        backendURL: plan.backendURL,
        domain: "bom",
        method: "save_bom_with_items",
        params: {
          ...record,
          id: bom.id,
          expected_version: detail.edit_version,
          product_id: refs.products.get(record.productRef).id,
          productRef: undefined,
          targetStatus: undefined,
          items: record.items.map((item) => {
            const materialId = materialIds.get(item.materialRef);
            return {
              ...item,
              id: existingByMaterial.get(materialId)?.id,
              material_id: materialId,
              unit_id: refs.unit.id,
              materialRef: undefined,
            };
          }),
        },
        token: tokens.engineering,
        fetchImpl,
      });
      if (!data.bom_version?.id) {
        throw new CliError(
          `save_bom_with_items response missing id for ${record.version}`,
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
    const finalStatus = await advanceLifecycle({
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
    detail.status = finalStatus;
    details.set(record.version, detail);
  }
  return details;
}

function sortedReferenceWarehouses(warehouses) {
  return [...warehouses]
    .map((item) => ({ id: item.id, code: item.code, name: item.name }))
    .sort(
      (left, right) =>
        String(left.code || "").localeCompare(String(right.code || "")) ||
        left.id - right.id,
    );
}

export function buildSourceDrivenFactReferences({
  plan,
  refs,
  sourceDocuments,
  bomVersions,
}) {
  const activeBOMPlans = new Map(
    plan.records.bomVersions
      .filter((record) => record.targetStatus === "ACTIVE")
      .map((record) => [record.productRef, record]),
  );
  const productionCandidates = [];
  const salesCandidates = [];
  for (const orderPlan of plan.records.salesOrders.filter(
    (record) => record.targetStatus === "ACTIVE",
  )) {
    const order = sourceDocuments.sales.get(orderPlan.order_no);
    const items = sourceDocuments.salesOrderItems.get(order?.id) || [];
    const customer = refs.customers.get(orderPlan.customerRef);
    if (
      !order?.id ||
      String(order.lifecycle_status || "").toUpperCase() !== "ACTIVE" ||
      !customer?.id ||
      !customer?.name
    ) {
      continue;
    }
    const salesOrder = {
      id: order.id,
      orderNo: orderPlan.order_no,
      status: "ACTIVE",
      customerId: customer.id,
      customerSnapshot: customer.name,
      paymentTermDays: order.payment_term_days,
    };
    for (const plannedLine of orderPlan.items) {
      const line = items.find((item) => item.lineNo === plannedLine.line_no);
      if (!line?.salesOrderItemId) continue;
      const item = {
        id: line.salesOrderItemId,
        productId: line.productId,
        productSkuId: line.productSkuId,
        unitId: line.unitId,
        orderedQuantity: line.quantity,
      };
      salesCandidates.push({ order: salesOrder, item });
      const bomPlan = activeBOMPlans.get(plannedLine.productRef);
      const bom = bomPlan ? bomVersions.get(bomPlan.version) : undefined;
      if (
        !bom?.id ||
        String(bom.status || "").toUpperCase() !== "ACTIVE" ||
        !Array.isArray(bom.items) ||
        bom.items.length === 0
      ) {
        continue;
      }
      productionCandidates.push({
        salesOrder,
        item,
        bom: {
          id: bom.id,
          version: bomPlan.version,
          status: "ACTIVE",
          items: bom.items.map((bomItem) => ({
            id: bomItem.id,
            materialId: bomItem.material_id,
            unitId: bomItem.unit_id,
            quantity: bomItem.quantity,
            lossRate: bomItem.loss_rate,
          })),
        },
      });
    }
  }
  const outsourcingCandidates = [];
  for (const orderPlan of plan.records.outsourcingOrders.filter(
    (record) => record.targetStatus === "CONFIRMED",
  )) {
    const order = sourceDocuments.outsourcing.get(
      orderPlan.outsourcing_order_no,
    );
    if (
      !order?.id ||
      String(order.lifecycle_status || "").toUpperCase() !== "CONFIRMED"
    ) {
      continue;
    }
    for (const item of sourceDocuments.outsourcingOrderItems.get(order.id) ||
      []) {
      if (!item?.outsourcingOrderItemId) continue;
      outsourcingCandidates.push({
        order: {
          id: order.id,
          orderNo: orderPlan.outsourcing_order_no,
          status: "CONFIRMED",
        },
        item,
      });
    }
  }
  const purchaseCandidates = [];
  for (const orderPlan of plan.records.purchaseOrders.filter(
    (record) => record.targetStatus === "APPROVED",
  )) {
    const order = sourceDocuments.purchase?.get(orderPlan.purchase_order_no);
    const supplier = refs.suppliers?.get(orderPlan.supplierRef);
    if (
      !order?.id ||
      String(order.lifecycle_status || "").toUpperCase() !== "APPROVED" ||
      !supplier?.id
    ) {
      continue;
    }
    for (const item of sourceDocuments.purchaseOrderItems?.get(order.id) ||
      []) {
      if (!item?.purchaseOrderItemId) continue;
      purchaseCandidates.push({
        order: {
          id: order.id,
          orderNo: orderPlan.purchase_order_no,
          status: "APPROVED",
          supplierId: supplier.id,
          supplierName: supplier.name,
        },
        item,
      });
    }
  }
  const productionCandidate = productionCandidates[0];
  const outsourcingCandidate = outsourcingCandidates[0];
  const salesCandidate = salesCandidates[0];
  const purchaseCandidate = purchaseCandidates[0];

  const warehouses = sortedReferenceWarehouses(refs.warehouses);
  return {
    datasetKey: plan.datasetKey,
    dataVersion: plan.dataVersion,
    runId: plan.runId,
    sourceCandidates: {
      ...(productionCandidate ? { production: productionCandidate } : {}),
      ...(outsourcingCandidate ? { outsourcing: outsourcingCandidate } : {}),
      ...(salesCandidate ? { sales: salesCandidate } : {}),
      ...(purchaseCandidate ? { purchase: purchaseCandidate } : {}),
      productionCandidates,
      outsourcingCandidates,
      salesCandidates,
      purchaseCandidates,
      warehouses,
    },
    phaseReadiness: {
      production: {
        status: "blocked",
        reason: productionCandidate
          ? "no posted inventory lot was created or read back for the BOM material budgets"
          : "no read-back ACTIVE sales line with a matching read-back ACTIVE BOM was available",
      },
      outsourcing: {
        status: "blocked",
        reason: outsourcingCandidate
          ? "no posted inventory lot was created or read back for the confirmed outsourcing line"
          : "no read-back CONFIRMED outsourcing order with an OPEN line was available",
      },
      sales: {
        status: "blocked",
        reason: salesCandidate
          ? "no posted inventory lot was created or read back for the active sales line"
          : "no read-back ACTIVE sales line was available",
      },
      purchase: {
        status: "unsupported",
        reason: purchaseCandidate
          ? "no POSTED purchase receipt was created or read back"
          : "no read-back APPROVED purchase order line was available",
      },
    },
  };
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
  {
    password,
    adminPassword,
    confirmPhrase = process.env.MANUAL_ACCEPTANCE_SIM_CONFIRM,
    targetConfirmation = process.env.MANUAL_ACCEPTANCE_TARGET_CONFIRM,
    targetAttestation = process.env.MANUAL_ACCEPTANCE_TARGET_ATTESTATION_JSON,
    fetchImpl = fetch,
  } = {},
) {
  assertManualAcceptanceMutationTarget(plan, {
    confirmation: targetConfirmation,
  });
  const parsedTargetAttestation =
    parseManualAcceptanceTargetAttestation(targetAttestation);
  if (parsedTargetAttestation) {
    assertManualAcceptanceTargetAttestation({
      policy: plan,
      attestation: parsedTargetAttestation,
    });
  }
  if (confirmPhrase !== CONFIRM_PHRASE) {
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
  await assertManualAcceptanceRuntimeIdentityPrecondition({
    policy: plan,
    attestation: parsedTargetAttestation,
    fetchImpl,
  });
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
    datasetKey: plan.datasetKey,
    dataVersion: plan.dataVersion,
    target: plan.target,
    prefix: plan.prefix,
    anchorDate: plan.anchorDate,
    semanticDigest: plan.semanticDigest,
    backendURL: plan.backendURL,
    databaseName: plan.databaseName,
    scale: plan.scale,
    simulatedOnly: true,
    realCustomerImport: false,
    runtime: await assertSafeRuntime({
      plan,
      tokens,
      targetAttestation: parsedTargetAttestation,
      fetchImpl,
    }),
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
  const bomVersions = await createBOMVersions({
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
    sourceDrivenFacts: buildSourceDrivenFactReferences({
      plan,
      refs,
      sourceDocuments,
      bomVersions,
    }),
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
    purchaseOrders: plan.records.purchaseOrders
      .filter((record) => record.targetStatus === "APPROVED")
      .map((record) => {
        const order = sourceDocuments.purchase.get(record.purchase_order_no);
        const supplier = refs.suppliers.get(record.supplierRef);
        return {
          id: order.id,
          orderNo: record.purchase_order_no,
          status: "APPROVED",
          supplierCode: record.supplierRef,
          supplierId: supplier.id,
          supplierName: supplier.name,
          items: sourceDocuments.purchaseOrderItems.get(order.id) || [],
        };
      }),
    outsourcingOrders: plan.records.outsourcingOrders
      .filter((record) => record.targetStatus === "CONFIRMED")
      .map((record) => {
        const order = sourceDocuments.outsourcing.get(
          record.outsourcing_order_no,
        );
        const supplier = refs.suppliers.get(record.supplierRef);
        return {
          id: order.id,
          orderNo: record.outsourcing_order_no,
          status: "CONFIRMED",
          supplierCode: record.supplierRef,
          supplierId: supplier.id,
          supplierName: supplier.name,
          items: sourceDocuments.outsourcingOrderItems.get(order.id) || [],
        };
      }),
    bomVersions: plan.records.bomVersions.map((record) => {
      const bom = bomVersions.get(record.version);
      return {
        id: bom.id,
        version: record.version,
        status: record.targetStatus,
        productCode: record.productRef,
        productId: refs.products.get(record.productRef).id,
        items: bom.items.map((item) => ({
          id: item.id,
          materialId: item.material_id,
          unitId: item.unit_id,
          quantity: item.quantity,
          lossRate: item.loss_rate,
        })),
      };
    }),
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
  {
    password,
    adminPassword,
    targetAttestation = process.env.MANUAL_ACCEPTANCE_TARGET_ATTESTATION_JSON,
    fetchImpl = fetch,
  } = {},
) {
  resolveManualAcceptanceTarget(plan);
  const parsedTargetAttestation =
    parseManualAcceptanceTargetAttestation(targetAttestation);
  if (parsedTargetAttestation) {
    assertManualAcceptanceTargetAttestation({
      policy: plan,
      attestation: parsedTargetAttestation,
    });
  }
  const effectivePassword = requiredText(
    password ||
      process.env.MANUAL_ACCEPTANCE_PASSWORD ||
      process.env.TRIAL_ACCOUNT_PASSWORD ||
      process.env.ERP_ROLE_DEMO_PASSWORD,
    "MANUAL_ACCEPTANCE_PASSWORD/TRIAL_ACCOUNT_PASSWORD/ERP_ROLE_DEMO_PASSWORD",
  );
  const effectiveAdminPassword = parsedTargetAttestation
    ? undefined
    : requiredText(
        adminPassword || process.env.MANUAL_ACCEPTANCE_ADMIN_PASSWORD,
        "MANUAL_ACCEPTANCE_ADMIN_PASSWORD",
      );
  const tokens = await loginRoles({
    backendURL: plan.backendURL,
    password: effectivePassword,
    seedAdminPassword: effectiveAdminPassword,
    includeSeedAdmin: !parsedTargetAttestation,
    fetchImpl,
  });
  const runtime = await assertSafeRuntime({
    plan,
    tokens,
    targetAttestation: parsedTargetAttestation,
    fetchImpl,
  });
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
    datasetKey: plan.datasetKey,
    dataVersion: plan.dataVersion,
    target: plan.target,
    prefix: plan.prefix,
    anchorDate: plan.anchorDate,
    semanticDigest: plan.semanticDigest,
    backendURL: plan.backendURL,
    databaseName: plan.databaseName,
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
  MANUAL_ACCEPTANCE_TARGET_CONFIRM=APPLY_SIMULATED_MANUAL_ACCEPTANCE_DATA:local-dev:2026.07.16-v5:20260716-V5:plush_erp_acceptance_20260716_v5_dev \\
  MANUAL_ACCEPTANCE_PASSWORD='<local-demo-password>' \\
  MANUAL_ACCEPTANCE_ADMIN_PASSWORD='<local-admin-password>' \\
    node scripts/qa/manual-acceptance-source-data.mjs --apply \\
      --target local-dev \\
      --backend-url http://127.0.0.1:8310 \\
      --database-name plush_erp_acceptance_20260716_v5_dev \\
      --data-version 2026.07.16-v5 \\
      --run-id 20260716-V5 \\
      --out output/qa/manual-acceptance/datasets/2026.07.16-v5/local/source

写入已登记的 133 客户试用环境还必须显式提供：
  --target customer-trial-133 --backend-url http://127.0.0.1:18375 \\
  --data-version 2026.07.16-v5 --run-id 20260716-V5
并设置绑定 target / dataVersion / runId 的 MANUAL_ACCEPTANCE_TARGET_CONFIRM，
以及包含精确 origin/customer/release/migration/debug 开关的
MANUAL_ACCEPTANCE_TARGET_ATTESTATION_JSON。

写后核验：
  MANUAL_ACCEPTANCE_PASSWORD='<local-demo-password>' \\
  MANUAL_ACCEPTANCE_ADMIN_PASSWORD='<local-admin-password>' \\
    node scripts/qa/manual-acceptance-source-data.mjs --verify \\
      --target local-dev \\
      --backend-url http://127.0.0.1:8310 \\
      --database-name plush_erp_acceptance_20260716_v5_dev \\
      --data-version 2026.07.16-v5 \\
      --run-id 20260716-V5

默认生成：60 客户、60 供应商、80 材料、20 产品/60 规格、30 加工环节、
45 销售订单、45 采购订单、45 委外订单、45 BOM 版本。

本入口默认只允许 localhost；外部写入只允许已登记的精确目标。业务名称使用试用人员可理解的中文，不写真实客户资料。`;
}

export async function runManualAcceptanceSourceDataCli(argv, deps = {}) {
  const options = parseManualAcceptanceSourceDataArgs(argv);
  if (options.help) {
    return { text: `${usage()}\n`, exitCode: 0 };
  }
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
