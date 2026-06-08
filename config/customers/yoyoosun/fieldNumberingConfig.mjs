export const yoyoosunFieldNumberingConfig = Object.freeze({
  customerKey: "yoyoosun",
  label: "永绅 yoyoosun 字段与编号配置草案",
  status: "draft",
  runtimeEnabled: false,
  scope:
    "Customer Config review draft only. Do not import this file into runtime until product and customer review approve it.",
  boundaries: Object.freeze({
    createsTenant: false,
    changesSchema: false,
    changesMigration: false,
    changesBackendRbac: false,
    changesWorkflowFactRules: false,
    executesImport: false,
  }),
  fieldDisplayReview: Object.freeze([
    {
      module: "customers",
      label: "客户档案",
      candidates: Object.freeze([
        {
          key: "customer_code",
          label: "客户编码",
          decision: "review_required",
          source: "import-field-classification.md",
          note: "只能作为已有 V1 字段或导入候选口径复核，不能自动变成 Product Core 必填。",
        },
        {
          key: "display_name",
          label: "客户简称",
          decision: "review_required",
          source: "trial-training-note.md",
          note: "需确认永绅是否要求列表优先显示简称；不改变 customers 真源字段。",
        },
        {
          key: "tax_no",
          label: "税号",
          decision: "defer_runtime",
          source: "import-field-classification.md",
          note: "财务资料候选，当前不强制必填，不生成 finance fact。",
        },
      ]),
    },
    {
      module: "suppliers",
      label: "供应商档案",
      candidates: Object.freeze([
        {
          key: "supplier_code",
          label: "供应商编码",
          decision: "review_required",
          source: "import-field-classification.md",
          note: "编号缺失时不得伪造；重复或冲突进入 unresolved queue。",
        },
        {
          key: "supplier_type",
          label: "供应商分类",
          decision: "review_required",
          source: "product-delivery-ledgers.md",
          note: "需确认材料供应商、加工厂、客户或临时文本的边界。",
        },
        {
          key: "settlement_note",
          label: "结算资料",
          decision: "defer_runtime",
          source: "import-field-classification.md",
          note: "只作为客户材料或后续财务评审线索，不生成 AP、invoice 或 payment。",
        },
      ]),
    },
    {
      module: "sales_orders",
      label: "销售订单",
      candidates: Object.freeze([
        {
          key: "order_no",
          label: "销售订单编号",
          decision: "review_required",
          source: "import-field-classification.md",
          note: "必须确认由系统生成、人工录入还是导入保留；不得与旧 project-orders 双写真源。",
        },
        {
          key: "source_no",
          label: "客户订单号",
          decision: "review_required",
          source: "question-backlog.md",
          note: "外部来源单号候选，需确认与内部销售订单编号的职责边界。",
        },
        {
          key: "expected_ship_date",
          label: "交期",
          decision: "review_required",
          source: "trial-training-note.md",
          note: "交期只表示订单承诺，不证明已经出货。",
        },
      ]),
    },
    {
      module: "sales_order_items",
      label: "销售订单明细",
      candidates: Object.freeze([
        {
          key: "product_id",
          label: "产品",
          decision: "review_required",
          source: "import-field-classification.md",
          note: "必须唯一匹配 existing products；不得自动创建 SKU。",
        },
        {
          key: "style_no",
          label: "款式编号",
          decision: "defer_runtime",
          source: "question-backlog.md",
          note: "当前作为 SKU / product / template 评审线索，不落 sales_order_items runtime 字段。",
        },
        {
          key: "color_size",
          label: "颜色 / 尺寸",
          decision: "defer_runtime",
          source: "import-field-classification.md",
          note: "product_skus 仍为 draft-only，不得自动生成。",
        },
      ]),
    },
  ]),
  numberingRuleReview: Object.freeze([
    {
      domain: "customers",
      key: "customer_code",
      label: "客户编码",
      currentDecision: "review_required",
      unresolvedQuestion: "客户编码由系统生成、人工录入还是沿用导入来源？",
    },
    {
      domain: "suppliers",
      key: "supplier_code",
      label: "供应商编码",
      currentDecision: "review_required",
      unresolvedQuestion: "供应商和加工厂是否共用一套编号规则？",
    },
    {
      domain: "sales_orders",
      key: "order_no",
      label: "销售订单编号",
      currentDecision: "review_required",
      unresolvedQuestion:
        "销售订单编号与客户订单号是否必须同时显示？谁负责维护？",
    },
    {
      domain: "products",
      key: "product_code",
      label: "产品编号",
      currentDecision: "review_required",
      unresolvedQuestion: "产品编号、款式编号和未来 SKU 编号是否分层管理？",
    },
    {
      domain: "purchase",
      key: "purchase_order_no",
      label: "采购订单号",
      currentDecision: "deferred",
      unresolvedQuestion:
        "purchase_orders 仍为 V2 candidate，当前不创建编号 runtime。",
    },
  ]),
});
