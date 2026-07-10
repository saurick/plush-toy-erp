export const demoCustomerPackage = Object.freeze({
  customerKey: "demo",
  packageKey: "demo-customer-package-v1",
  label: "中性 demo 客户配置包",
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
  workPoolRoleOverrides: Object.freeze({
    order_review: "sales",
  }),
  printTemplateDefaults: Object.freeze([
    Object.freeze({
      templateKey: "material-purchase-contract",
      status: "preview_only",
      partyDefaults: Object.freeze({
        buyerCompany: "演示买方公司",
        buyerContact: "采购负责人",
        buyerPhone: "",
        buyerAddress: "演示地址",
        buyerSigner: "",
      }),
      guardrail:
        "仅作为 demo 客户配置草案里的采购合同买方抬头默认值，不进入 Product Core 默认样例，不自动生成签章、签收、采购事实或财务事实。",
    }),
    Object.freeze({
      templateKey: "processing-contract",
      status: "preview_only",
      partyDefaults: Object.freeze({
        buyerCompany: "演示买方公司",
        buyerContact: "委外负责人",
        buyerPhone: "",
        buyerAddress: "演示地址",
        buyerSigner: "",
      }),
      guardrail:
        "仅作为 demo 客户配置草案里的加工合同委托方抬头默认值，不进入 Product Core 默认样例，不自动生成签章、签收、委外事实或财务事实。",
    }),
  ]),
  workflows: Object.freeze([
    {
      key: "demo_sales_order_review",
      label: "演示销售订单评审",
      status: "preview_only",
      sourceModules: Object.freeze(["sales_orders"]),
      ownerPools: Object.freeze(["sales", "boss", "pmc"]),
      factBoundary: "workflow_only",
      nodes: Object.freeze([
        {
          key: "sales_prepare",
          type: "human_task",
          ownerPool: "sales",
          command: "submit_sales_order",
        },
        {
          key: "boss_review",
          type: "approval",
          ownerPool: "boss",
          command: "approve_sales_order",
        },
        {
          key: "pmc_followup",
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
        "演示销售订单评审只验证责任池编排，不生成库存、出货、应收或发票事实。",
    },
    {
      key: "demo_material_supply_review",
      label: "演示物料供应评审",
      status: "preview_only",
      sourceModules: Object.freeze(["purchase_orders"]),
      ownerPools: Object.freeze(["purchase", "warehouse", "quality"]),
      factBoundary: "workflow_only",
      nodes: Object.freeze([
        {
          key: "purchase_review",
          type: "human_task",
          ownerPool: "purchase",
          command: "review_purchase_order",
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
        "演示物料供应评审不等于采购入库，不写 purchase_receipts、inventory_txns 或质检事实。",
    },
    {
      key: "demo_payment_review",
      label: "演示付款放行",
      status: "preview_only",
      sourceModules: Object.freeze(["finance"]),
      ownerPools: Object.freeze(["finance", "boss"]),
      factBoundary: "workflow_only",
      nodes: Object.freeze([
        {
          key: "finance_prepare",
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
        "演示付款放行只验证流程策略，不生成付款、应付冲销、发票或总账事实。",
    },
    {
      key: "demo_finished_goods_delivery",
      label: "演示成品交付闭环",
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
        "演示成品交付闭环只验证责任池和合同边界，不自动写质检、出货、库存、应收或开票事实。",
    },
  ]),
  businessFlows: Object.freeze([
    {
      key: "demo_sales_to_pmc",
      label: "演示销售到 PMC",
      status: "preview_only",
      modules: Object.freeze(["sales_orders", "workflow_tasks"]),
      guardrail: "只表达协同交接，不生成出货或生产事实。",
    },
    {
      key: "demo_engineering_data",
      label: "演示工程资料",
      status: "preview_only",
      modules: Object.freeze(["products", "material_bom", "processes"]),
      guardrail: "只维护产品、BOM 和工序资料，不生成采购需求或成本事实。",
    },
    {
      key: "demo_quality_gate",
      label: "演示质量门禁",
      status: "preview_only",
      modules: Object.freeze(["quality_inspections", "workflow_tasks"]),
      guardrail: "只表达质量协同门禁，不自动判定质检事实。",
    },
    {
      key: "demo_finance_followup",
      label: "演示财务跟进",
      status: "preview_only",
      modules: Object.freeze(["finance", "workflow_tasks"]),
      guardrail: "只表达财务提醒，不写应收、应付、发票或付款事实。",
    },
  ]),
  stateMachines: Object.freeze([
    {
      key: "demo_sales_lifecycle",
      label: "演示销售生命周期",
      status: "preview_only",
      states: Object.freeze(["draft", "submitted", "approved", "closed"]),
      transitions: Object.freeze([
        Object.freeze(["draft", "submitted"]),
        Object.freeze(["submitted", "approved"]),
        Object.freeze(["approved", "closed"]),
      ]),
      guardrail: "状态机仅作配置预览，不覆盖销售订单领域状态机。",
    },
    {
      key: "demo_purchase_lifecycle",
      label: "演示采购生命周期",
      status: "preview_only",
      states: Object.freeze(["draft", "reviewing", "ordered", "closed"]),
      transitions: Object.freeze([
        Object.freeze(["draft", "reviewing"]),
        Object.freeze(["reviewing", "ordered"]),
        Object.freeze(["ordered", "closed"]),
      ]),
      guardrail: "状态机仅作配置预览，不生成采购入库或库存事实。",
    },
    {
      key: "demo_finance_lifecycle",
      label: "演示财务生命周期",
      status: "preview_only",
      states: Object.freeze(["pending", "reviewing", "approved", "archived"]),
      transitions: Object.freeze([
        Object.freeze(["pending", "reviewing"]),
        Object.freeze(["reviewing", "approved"]),
        Object.freeze(["approved", "archived"]),
      ]),
      guardrail: "状态机仅作配置预览，不写付款、发票、对账或总账事实。",
    },
  ]),
  processPolicies: Object.freeze([
    {
      key: "skip_policy",
      kind: "skip_policy",
      label: "演示跳过策略",
      status: "preview_only",
      rules: Object.freeze([
        Object.freeze({ when: "no_risk", action: "skip_optional_review" }),
      ]),
      guardrail: "跳过策略只作命名策略预览，不绕过后端领域校验。",
    },
    {
      key: "auto_generate_policy",
      kind: "auto_generate_policy",
      label: "演示自动生成策略",
      status: "preview_only",
      rules: Object.freeze([
        Object.freeze({ when: "source_ready", action: "generate_next_task_preview" }),
      ]),
      guardrail: "自动生成策略只作预览，不允许前端创建真实下游任务。",
    },
    {
      key: "close_policy",
      kind: "close_policy",
      label: "演示关闭策略",
      status: "preview_only",
      rules: Object.freeze([
        Object.freeze({ when: "all_tasks_done", action: "close_preview_flow" }),
      ]),
      guardrail: "关闭策略只作预览，不关闭领域事实或历史记录。",
    },
  ]),
  extensionPoints: Object.freeze([]),
});
