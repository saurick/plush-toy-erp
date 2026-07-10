import { yoyoosunRoleFlowMatrix } from "./roleFlowMatrix.mjs";

export const yoyoosunCustomerPackage = Object.freeze({
  customerKey: "yoyoosun",
  packageKey: "yoyoosun-customer-package-v5",
  label: "永绅 yoyoosun 客户配置包",
  status: "draft",
  runtimeEnabled: false,
  sourcePolicy: Object.freeze({
    externalImportAllowsCode: false,
    externalImportAllowsSql: false,
    externalImportAllowsSecrets: false,
    externalImportAllowsRawCustomerFiles: false,
    trackedConfigFormat: "mjs-declarative-object",
    previewOnly: true,
    publishEnabled: false,
    activateEnabled: false,
    rollbackEnabled: false,
  }),
  boundaries: Object.freeze({
    createsTenant: false,
    changesSchema: false,
    changesMigration: false,
    changesBackendRbac: false,
    changesWorkflowFactRules: false,
    changesRuntimeLoader: false,
    executesImport: false,
    executesRealImport: false,
    writesBusinessRecords: false,
    writesFacts: false,
    writesInventoryFacts: false,
    writesShipmentFacts: false,
    writesFinanceFacts: false,
  }),
  roleProfiles: yoyoosunRoleFlowMatrix.roles,
  printTemplateDefaults: Object.freeze([
    Object.freeze({
      templateKey: "material-purchase-contract",
      status: "preview_only",
      partyDefaults: Object.freeze({
        buyerCompany: "永绅",
        buyerContact: "采购负责人",
        buyerPhone: "",
        buyerAddress: "东莞-茶山",
        buyerSigner: "",
      }),
      guardrail:
        "仅作为 yoyoosun 客户配置草案里的采购合同买方抬头默认值，不进入 Product Core 默认样例，不自动生成签章、签收、采购事实或财务事实。",
    }),
    Object.freeze({
      templateKey: "processing-contract",
      status: "preview_only",
      partyDefaults: Object.freeze({
        buyerCompany: "永绅",
        buyerContact: "委外负责人",
        buyerPhone: "",
        buyerAddress: "东莞茶山",
        buyerSigner: "",
      }),
      guardrail:
        "仅作为 yoyoosun 客户配置草案里的加工合同委托方抬头默认值，不进入 Product Core 默认样例，不自动生成签章、签收、委外事实或财务事实。",
    }),
  ]),
  workflows: Object.freeze([
    {
      key: "sales_order_approval",
      label: "销售订单审批",
      status: "preview_only",
      sourceModules: Object.freeze(["sales_orders"]),
      ownerPools: Object.freeze(["sales", "boss", "engineering", "pmc"]),
      factBoundary: "workflow_only",
      nodes: Object.freeze([
        {
          key: "sales_submit",
          type: "human_task",
          ownerPool: "sales",
          command: "submit_sales_order",
        },
        {
          key: "boss_approval",
          type: "approval",
          ownerPool: "boss",
          command: "approve_sales_order",
        },
        {
          key: "engineering_data",
          type: "human_task",
          ownerPool: "engineering",
        },
        {
          key: "pmc_review",
          type: "human_task",
          ownerPool: "pmc",
        },
        {
          key: "end",
          type: "end",
          ownerPool: "pmc",
        },
      ]),
      guardrail:
        "销售订单审批只表达协同流转；工程资料补齐只维护产品、工序和 BOM 资料，不生成出货、库存、生产、成本、应收或发票事实。",
    },
    {
      key: "purchase_order_approval",
      label: "采购订单评审",
      status: "preview_only",
      sourceModules: Object.freeze(["purchase_orders"]),
      ownerPools: Object.freeze(["purchase", "boss", "warehouse", "quality"]),
      factBoundary: "workflow_only",
      nodes: Object.freeze([
        {
          key: "purchase_submit",
          type: "human_task",
          ownerPool: "purchase",
          command: "review_purchase_order",
        },
        {
          key: "boss_review",
          type: "approval",
          ownerPool: "boss",
        },
        {
          key: "warehouse_prepare",
          type: "human_task",
          ownerPool: "warehouse",
        },
        {
          key: "quality_prepare",
          type: "human_task",
          ownerPool: "quality",
        },
        {
          key: "end",
          type: "end",
          ownerPool: "purchase",
        },
      ]),
      guardrail:
        "采购订单评审不等于采购入库，不写 purchase_receipts、inventory_txns 或应付事实。",
    },
    {
      key: "payment_approval",
      label: "付款放行",
      status: "preview_only",
      sourceModules: Object.freeze(["finance"]),
      ownerPools: Object.freeze(["finance", "boss"]),
      factBoundary: "workflow_only",
      nodes: Object.freeze([
        {
          key: "finance_submit",
          type: "human_task",
          ownerPool: "finance",
          command: "release_payment",
        },
        {
          key: "boss_approval",
          type: "approval",
          ownerPool: "boss",
        },
        {
          key: "end",
          type: "end",
          ownerPool: "finance",
        },
      ]),
      guardrail:
        "付款放行只作为候选协同结构，不生成付款、应付冲销、发票或总账事实。",
    },
    {
      key: "finished_goods_delivery",
      label: "成品质检到出货结算",
      status: "preview_only",
      sourceModules: Object.freeze(["quality_inspections", "shipments", "finance"]),
      ownerPools: Object.freeze(["quality", "finance", "warehouse"]),
      factBoundary: "workflow_only",
      nodes: Object.freeze([
        {
          key: "finished_goods_qc",
          type: "human_task",
          ownerPool: "quality",
          command: "finished_goods_quality_decide",
        },
        {
          key: "finance_release",
          type: "approval",
          ownerPool: "finance",
          command: "release_shipment_finance",
        },
        {
          key: "shipment_execution",
          type: "human_task",
          ownerPool: "warehouse",
          command: "ship_shipment",
        },
        {
          key: "receivable_lead",
          type: "human_task",
          ownerPool: "finance",
          command: "create_receivable_lead",
        },
        {
          key: "end",
          type: "end",
          ownerPool: "finance",
        },
      ]),
      guardrail:
        "成品质检、财务放行、实际出货和应收线索必须分开；当前仅作为合同预检结构，不自动写质检、出货、库存、应收或开票事实。",
    },
  ]),
  businessFlows: Object.freeze([
    {
      key: "sales_to_production",
      label: "销售到生产",
      status: "preview_only",
      modules: Object.freeze(["sales_orders", "products", "workflow_tasks"]),
      guardrail:
        "销售订单提交后只形成生产评审线索；真实生产事实仍由 OperationalFactUsecase 承接。",
    },
    {
      key: "purchase_to_inventory",
      label: "采购到库存",
      status: "preview_only",
      modules: Object.freeze(["purchase_orders", "purchase_receipts", "inventory"]),
      guardrail:
        "采购承诺、到货协同和库存入账分开；只有采购入库事实 usecase 可写库存。",
    },
    {
      key: "production_to_inventory",
      label: "生产到库存",
      status: "preview_only",
      modules: Object.freeze(["workflow_tasks", "inventory", "quality_inspections"]),
      guardrail:
        "生产完工协同不等于成品入库；质检和入库事实必须走对应 usecase。",
    },
    {
      key: "delivery_to_settlement",
      label: "交付到结算",
      status: "preview_only",
      modules: Object.freeze(["shipments", "finance"]),
      guardrail:
        "出货单 SHIPPED 后才可评审应收 / 开票线索；出货放行不等于 shipped。",
    },
  ]),
  stateMachines: Object.freeze([
    {
      key: "sales_order_lifecycle",
      label: "销售订单生命周期",
      status: "preview_only",
      states: Object.freeze(["draft", "submitted", "approved", "pmc_review", "closed"]),
      transitions: Object.freeze([
        ["draft", "submitted"],
        ["submitted", "approved"],
        ["approved", "pmc_review"],
        ["pmc_review", "closed"],
      ]),
      guardrail: "状态机只用于配置预览，不覆盖销售订单 usecase 当前状态规则。",
    },
    {
      key: "production_order_lifecycle",
      label: "生产任务生命周期",
      status: "preview_only",
      states: Object.freeze(["planned", "released", "processing", "qc_pending", "closed"]),
      transitions: Object.freeze([
        ["planned", "released"],
        ["released", "processing"],
        ["processing", "qc_pending"],
        ["qc_pending", "closed"],
      ]),
      guardrail: "生产状态预览不生成库存、质检或出货事实。",
    },
    {
      key: "purchase_order_lifecycle",
      label: "采购订单生命周期",
      status: "preview_only",
      states: Object.freeze(["draft", "submitted", "approved", "receiving", "closed"]),
      transitions: Object.freeze([
        ["draft", "submitted"],
        ["submitted", "approved"],
        ["approved", "receiving"],
        ["receiving", "closed"],
      ]),
      guardrail: "采购订单生命周期不替代采购入库、退货、调整或库存事实状态。",
    },
  ]),
  processPolicies: Object.freeze([
    {
      key: "skip_policy",
      kind: "skip_policy",
      label: "跳过策略",
      status: "preview_only",
      rules: Object.freeze([
        {
          key: "skip_optional_review_when_unconfigured",
          decision: "manual_review_required",
        },
      ]),
      guardrail: "跳过只能进入人工评审，不允许绕过后端状态、权限或事实校验。",
    },
    {
      key: "auto_generate_policy",
      kind: "auto_generate_policy",
      label: "自动生成策略",
      status: "preview_only",
      rules: Object.freeze([
        {
          key: "generate_downstream_task_preview",
          decision: "preview_only",
        },
      ]),
      guardrail: "自动生成只预览协同任务结构，不自动生成事实单据或库存流水。",
    },
    {
      key: "close_policy",
      kind: "close_policy",
      label: "关闭策略",
      status: "preview_only",
      rules: Object.freeze([
        {
          key: "close_after_required_nodes_done",
          decision: "requires_usecase_review",
        },
      ]),
      guardrail: "关闭策略不能把 task done 写成 fact posted，也不能绕过冲正 / 取消规则。",
    },
  ]),
  extensionPoints: Object.freeze([]),
});
