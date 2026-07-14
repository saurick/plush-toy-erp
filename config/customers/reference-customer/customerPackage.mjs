export const referenceCustomerPackage = Object.freeze({
  customerKey: "reference-customer",
  packageKey: "reference-customer-package-v1",
  label: "标准样例毛绒制造有限公司（工程参考）",
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
  runtimeProcessSelections: Object.freeze([
    Object.freeze({
      processKey: "sales_order_acceptance",
      processVersion: "v1",
      variantKey: "approval_pmc",
      businessRefType: "sales_order",
    }),
  ]),
  workPoolRoleOverrides: Object.freeze({
    order_review: "sales",
  }),
  fieldPolicyOverrides: Object.freeze([
    Object.freeze({
      surfaceKey: "suppliers.default",
      fieldKey: "supplier_type",
      visible: false,
      reason: "标准样例隐藏一个低风险非关键列表字段，用于验证客户字段投影闭环。",
    }),
  ]),
  printTemplateDefaults: Object.freeze([
    Object.freeze({
      templateKey: "material-purchase-contract",
      status: "preview_only",
      partyDefaults: Object.freeze({
        buyerCompany: "标准样例毛绒制造有限公司（工程参考）",
        buyerContact: "purchasing@reference-customer.example.invalid",
        buyerPhone: "",
        buyerAddress: "示例工业园",
        buyerSigner: "SIM-REF-SIGNER-001",
      }),
      guardrail:
        "仅提供工程参考抬头，不代表真实客户签章、采购事实或财务事实。",
    }),
    Object.freeze({
      templateKey: "processing-contract",
      status: "preview_only",
      partyDefaults: Object.freeze({
        buyerCompany: "标准样例毛绒制造有限公司（工程参考）",
        buyerContact: "outsourcing@reference-customer.example.invalid",
        buyerPhone: "",
        buyerAddress: "示例工业园",
        buyerSigner: "SIM-REF-SIGNER-002",
      }),
      guardrail:
        "仅提供工程参考抬头，不代表真实客户签章、委外事实或财务事实。",
    }),
  ]),
  workflows: Object.freeze([
    Object.freeze({
      key: "reference_sales_order_review",
      label: "标准样例销售订单评审",
      status: "preview_only",
      sourceModules: Object.freeze(["sales_orders"]),
      ownerPools: Object.freeze(["sales", "boss", "pmc"]),
      factBoundary: "workflow_only",
      nodes: Object.freeze([
        Object.freeze({
          key: "sales_prepare",
          type: "human_task",
          ownerPool: "sales",
          command: "submit_sales_order",
        }),
        Object.freeze({
          key: "boss_review",
          type: "approval",
          ownerPool: "boss",
          command: "approve_sales_order",
        }),
        Object.freeze({
          key: "order_review",
          type: "human_task",
          ownerPool: "pmc",
        }),
        Object.freeze({
          key: "end",
          type: "end",
          ownerPool: "pmc",
        }),
      ]),
      guardrail:
        "只验证销售订单协同责任投影；Workflow task done 不生成库存、出货、应收或发票事实。",
    }),
  ]),
  businessFlows: Object.freeze([]),
  stateMachines: Object.freeze([]),
  processPolicies: Object.freeze([]),
  extensionPoints: Object.freeze([]),
});
