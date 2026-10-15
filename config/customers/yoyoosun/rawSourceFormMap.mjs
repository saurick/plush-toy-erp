export const yoyoosunRawSourceFormMap = Object.freeze({
  customerKey: "yoyoosun",
  status: "source_category_mapping_only",
  privateValidation: Object.freeze({
    status: "external_required",
    manifestLocation: "customer_private_repository",
    bundledInProductRepository: false,
    productQaRequiresPrivateManifest: false,
  }),
  boundary:
    "Product-side mappings describe source categories only. Private manifests own source IDs, filenames and object references; no category may write runtime data, Workflow state, inventory, shipment or finance Facts.",
  entries: Object.freeze([
    Object.freeze({
      categoryKey: "purchase_material_summary",
      inputMode: "structured_extract_candidate",
      targetForms: Object.freeze([
        "SupplierForm",
        "MaterialForm",
        "PurchaseOrderForm",
        "MaterialPurchaseContractPrintDraft",
      ]),
      targetEntities: Object.freeze([
        "suppliers",
        "materials",
        "units",
        "purchase_orders",
        "purchase_order_items",
      ]),
      status: "private_validation_only",
      fieldCoverage: Object.freeze([
        "supplier.identity_and_contact_candidate",
        "material.identity_and_unit_candidate",
        "purchase_order.header_candidate",
        "purchase_order_items.material_quantity_price_candidate",
      ]),
      printCoverage: Object.freeze(["material-purchase-contract"]),
      boundary:
        "采购汇总类别只生成候选主数据、源单和打印草稿；不得自动生成采购入库、库存或应付事实。",
    }),
    Object.freeze({
      categoryKey: "outsourcing_summary",
      inputMode: "structured_extract_candidate",
      targetForms: Object.freeze([
        "SupplierForm",
        "ContactForm",
        "OutsourcingOrderForm",
        "ProcessingContractPrintDraft",
      ]),
      targetEntities: Object.freeze([
        "suppliers",
        "contacts",
        "outsourcing_orders",
        "outsourcing_order_items",
      ]),
      status: "private_validation_only",
      fieldCoverage: Object.freeze([
        "supplier.identity_and_contact_candidate",
        "outsourcing_order.header_candidate",
        "outsourcing_order_items.product_process_quantity_price_candidate",
      ]),
      printCoverage: Object.freeze(["processing-contract"]),
      boundary:
        "委外汇总类别只生成候选供应商、联系人、委外源单和打印草稿；不得自动写委外回货、库存、应付或付款事实。",
    }),
    Object.freeze({
      categoryKey: "bom_workbook",
      inputMode: "structured_extract_candidate",
      targetForms: Object.freeze([
        "ProductForm",
        "ProductSKUForm",
        "MaterialForm",
        "BOMVersionForm",
      ]),
      targetEntities: Object.freeze([
        "products",
        "product_skus",
        "materials",
        "units",
        "bom_versions",
        "bom_items",
      ]),
      status: "private_validation_only",
      fieldCoverage: Object.freeze([
        "product.identity_candidate",
        "product_sku.identity_candidate",
        "material.identity_and_unit_candidate",
        "bom_version.header_candidate",
        "bom_items.material_usage_candidate",
      ]),
      printCoverage: Object.freeze([]),
      boundary:
        "BOM 工作簿类别只形成产品、SKU、材料和 BOM 候选；不得自动写采购、库存、生产或成本事实。",
    }),
    Object.freeze({
      categoryKey: "contract_print_reference",
      inputMode: "manual_reference_only",
      targetForms: Object.freeze([
        "MaterialPurchaseContractPrintDraft",
        "ProcessingContractPrintDraft",
      ]),
      targetEntities: Object.freeze([
        "print_template_defaults",
        "purchase_orders",
        "outsourcing_orders",
      ]),
      status: "private_validation_only",
      fieldCoverage: Object.freeze([
        "contract.header_labels",
        "contract.detail_labels",
        "contract.clauses",
        "contract.party_snapshot_candidate",
      ]),
      printCoverage: Object.freeze([
        "material-purchase-contract",
        "processing-contract",
      ]),
      boundary:
        "合同文档或图片类别只作人工字段与版式核对，不做 OCR，不作为运行时母版，也不生成源单、库存或财务事实。",
    }),
    Object.freeze({
      categoryKey: "workflow_ui_reference",
      inputMode: "manual_reference_only",
      targetForms: Object.freeze([
        "CustomerConfigPreview",
        "MobileRoleTasksPage",
        "WorkflowTaskActionDrawer",
      ]),
      targetEntities: Object.freeze([
        "role_profiles",
        "work_pools",
        "process_definitions",
        "workflow_tasks",
      ]),
      status: "private_validation_only",
      fieldCoverage: Object.freeze([
        "role.owner_pool_candidate",
        "workflow.node_order_candidate",
        "workflow.action_labels_candidate",
        "mobile.task_visual_reference",
      ]),
      printCoverage: Object.freeze([]),
      boundary:
        "流程或界面资料类别只作人工设计线索，不生成 Workflow runtime 状态，不把任务完成升级为 Fact 过账。",
    }),
  ]),
});
