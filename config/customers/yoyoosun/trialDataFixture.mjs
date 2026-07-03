export const yoyoosunTrialDataFixture = Object.freeze({
  customerKey: "yoyoosun",
  fixtureKey: "yoyoosun-trial-data-fixture-v1",
  status: "preview_only",
  boundary:
    "Trial fixture is deterministic dry-run seed data for UI, print and flow tests. It must not be applied to customer production data without import approval, idempotency keys and release evidence.",
  units: Object.freeze([
    Object.freeze({ unitCode: "PCS", unitName: "个", sourceIds: Object.freeze(["__synthetic_yoyoosun_trial__"]) }),
    Object.freeze({ unitCode: "M", unitName: "米", sourceIds: Object.freeze(["yoyoosun-raw-material-purchase-summary-20260602"]) }),
    Object.freeze({ unitCode: "KG", unitName: "千克", sourceIds: Object.freeze(["yoyoosun-raw-bom-26029-20260119"]) }),
  ]),
  customers: Object.freeze([
    Object.freeze({
      customerCode: "YOYOO-TRIAL-CUSTOMER",
      displayName: "永绅试用客户",
      contactName: "客户联系人",
      contactPhone: "13800000000",
      paymentCondition: "monthly_statement_30_days",
      sourceIds: Object.freeze(["__synthetic_yoyoosun_trial__"]),
    }),
  ]),
  suppliers: Object.freeze([
    Object.freeze({
      supplierCode: "SUP-FABRIC-TRIAL",
      displayName: "试用辅材供应商",
      supplierType: "material",
      contactName: "成慧怡",
      contactPhone: "13900000001",
      sourceIds: Object.freeze(["yoyoosun-raw-material-purchase-summary-20260602"]),
    }),
    Object.freeze({
      supplierCode: "SUP-PROCESS-TRIAL",
      displayName: "试用加工厂",
      supplierType: "outsourcing",
      contactName: "子淳",
      contactPhone: "13900000002",
      sourceIds: Object.freeze(["yoyoosun-raw-outsourcing-summary-20260602", "yoyoosun-raw-outsourcing-contract-pdf-zichun"]),
    }),
  ]),
  materials: Object.freeze([
    Object.freeze({
      materialCode: "MAT-26029-FABRIC",
      materialName: "夜樱烬色主面料",
      spec: "26029#",
      unitCode: "M",
      sourceIds: Object.freeze(["yoyoosun-raw-bom-26029-20260119"]),
    }),
    Object.freeze({
      materialCode: "MAT-26204-FILLING",
      materialName: "抱抱猴子填充棉",
      spec: "26204#",
      unitCode: "KG",
      sourceIds: Object.freeze(["yoyoosun-raw-bom-26204-20260410"]),
    }),
  ]),
  products: Object.freeze([
    Object.freeze({
      productNo: "26029",
      productName: "夜樱烬色玩偶",
      skuNo: "26029-STD",
      sourceIds: Object.freeze(["yoyoosun-raw-bom-26029-20260119"]),
    }),
    Object.freeze({
      productNo: "26204",
      productName: "抱抱猴子玩偶",
      skuNo: "26204-STD",
      sourceIds: Object.freeze(["yoyoosun-raw-bom-26204-20260410"]),
    }),
  ]),
  warehouses: Object.freeze([
    Object.freeze({ warehouseCode: "YOYOO-MAIN", warehouseName: "永绅试用仓", sourceIds: Object.freeze(["__synthetic_yoyoosun_trial__"]) }),
  ]),
  bomVersions: Object.freeze([
    Object.freeze({
      bomNo: "BOM-26029-TRIAL",
      productNo: "26029",
      skuNo: "26029-STD",
      versionNo: "2026-01-19",
      lines: Object.freeze([
        Object.freeze({ materialCode: "MAT-26029-FABRIC", usageQty: "0.80", unitCode: "M" }),
      ]),
      sourceIds: Object.freeze(["yoyoosun-raw-bom-26029-20260119"]),
    }),
  ]),
  salesOrders: Object.freeze([
    Object.freeze({
      orderNo: "SO-YOYO-TRIAL-001",
      customerCode: "YOYOO-TRIAL-CUSTOMER",
      productNo: "26029",
      skuNo: "26029-STD",
      quantity: "120",
      lifecycleStatus: "draft",
      sourceIds: Object.freeze(["__synthetic_yoyoosun_trial__"]),
    }),
  ]),
  purchaseOrders: Object.freeze([
    Object.freeze({
      purchaseOrderNo: "PO-YOYO-TRIAL-001",
      supplierCode: "SUP-FABRIC-TRIAL",
      expectedArrivalDate: "2026-07-15",
      printTemplateKey: "material-purchase-contract",
      lines: Object.freeze([
        Object.freeze({
          productOrderNo: "SO-YOYO-TRIAL-001",
          productNo: "26029",
          productName: "夜樱烬色玩偶",
          materialCode: "MAT-26029-FABRIC",
          materialName: "夜樱烬色主面料",
          unitCode: "M",
          quantity: "96",
          unitPrice: "8.500",
          amount: "816.00",
        }),
      ]),
      sourceIds: Object.freeze(["yoyoosun-raw-material-purchase-summary-20260602", "yoyoosun-raw-purchase-contract-photo-20260421-jpeg"]),
    }),
  ]),
  outsourcingOrders: Object.freeze([
    Object.freeze({
      outsourcingOrderNo: "OS-YOYO-TRIAL-001",
      processorCode: "SUP-PROCESS-TRIAL",
      returnDate: "2026-07-20",
      printTemplateKey: "processing-contract",
      lines: Object.freeze([
        Object.freeze({
          productOrderNo: "SO-YOYO-TRIAL-001",
          productNo: "26029",
          productName: "夜樱烬色玩偶",
          processName: "车缝加工",
          processCategory: "缝制",
          unitCode: "PCS",
          quantity: "120",
          unitPrice: "3.200",
          amount: "384.00",
        }),
      ]),
      sourceIds: Object.freeze(["yoyoosun-raw-outsourcing-summary-20260602", "yoyoosun-raw-outsourcing-contract-pdf-zichun"]),
    }),
  ]),
  purchaseReceipts: Object.freeze([
    Object.freeze({
      receiptNo: "PR-YOYO-TRIAL-001",
      purchaseOrderNo: "PO-YOYO-TRIAL-001",
      warehouseCode: "YOYOO-MAIN",
      status: "draft",
      sourceIds: Object.freeze(["yoyoosun-raw-material-purchase-summary-20260602"]),
    }),
  ]),
  qualityInspections: Object.freeze([
    Object.freeze({
      inspectionNo: "QI-YOYO-TRIAL-001",
      sourceNo: "PR-YOYO-TRIAL-001",
      result: "pending",
      sourceIds: Object.freeze(["__synthetic_yoyoosun_trial__"]),
    }),
  ]),
  inventoryLots: Object.freeze([
    Object.freeze({
      lotNo: "LOT-YOYO-TRIAL-001",
      materialCode: "MAT-26029-FABRIC",
      warehouseCode: "YOYOO-MAIN",
      quantity: "0",
      status: "pending_inbound",
      sourceIds: Object.freeze(["__synthetic_yoyoosun_trial__"]),
    }),
  ]),
  shipments: Object.freeze([
    Object.freeze({
      shipmentNo: "SH-YOYO-TRIAL-001",
      salesOrderNo: "SO-YOYO-TRIAL-001",
      warehouseCode: "YOYOO-MAIN",
      status: "draft",
      sourceIds: Object.freeze(["__synthetic_yoyoosun_trial__"]),
    }),
  ]),
  financeDrafts: Object.freeze([
    Object.freeze({
      financeDraftNo: "AR-YOYO-TRIAL-001",
      sourceNo: "SH-YOYO-TRIAL-001",
      factType: "receivable_draft",
      status: "draft",
      sourceIds: Object.freeze(["__synthetic_yoyoosun_trial__"]),
    }),
  ]),
  workflowTasks: Object.freeze([
    Object.freeze({
      taskCode: "WF-YOYO-TRIAL-SALES-001",
      taskGroup: "sales_order_approval",
      sourceNo: "SO-YOYO-TRIAL-001",
      ownerRoleKey: "sales",
      taskStatusKey: "ready",
      sourceIds: Object.freeze(["yoyoosun-raw-role-workflow-v3-20260413"]),
    }),
    Object.freeze({
      taskCode: "WF-YOYO-TRIAL-PURCHASE-001",
      taskGroup: "purchase_order_approval",
      sourceNo: "PO-YOYO-TRIAL-001",
      ownerRoleKey: "purchasing",
      taskStatusKey: "ready",
      sourceIds: Object.freeze(["yoyoosun-raw-role-workflow-v3-20260413"]),
    }),
  ]),
});
