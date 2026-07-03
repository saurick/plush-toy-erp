# 永绅 raw-source-files 到表单映射

> 本文把 `docs/customers/yoyoosun/raw-source-files` 中的来源文件映射到当前产品核心表单、实体和打印草稿。它是导入前证据和 dry-run 依据，不是导入批准。

## 总边界

- raw source 文件不直接写 runtime。
- raw source 文件不写 Workflow、库存、出货、财务或其他 Fact。
- 图片 / PDF 不做 OCR 自动导入，只作人工核对线索。
- Excel 来源只能进入 dry-run / preview，必须经过字段覆盖检查、人工 review、release evidence 后才能考虑真实导入。
- 合同照片和合同模板只能约束打印字段与纸面样式，不覆盖 Product Core 模板结构和业务 usecase。

## 映射表

| Source ID | 来源文件 | 目标表单 | 目标实体 | 当前状态 | 关键边界 |
| --- | --- | --- | --- | --- | --- |
| `yoyoosun-raw-material-purchase-summary-20260602` | 辅材、包材 成慧怡.xlsx | SupplierForm / MaterialForm / PurchaseOrderForm / MaterialPurchaseContractPrintDraft | suppliers / materials / units / purchase_orders / purchase_order_items | dry_run_ready | 只生成供应商、材料、单位和采购源单候选；不写采购入库、库存或应付事实 |
| `yoyoosun-raw-outsourcing-summary-20260602` | 加工 成慧怡.xlsx | SupplierForm / ContactForm / OutsourcingOrderForm / ProcessingContractPrintDraft | suppliers / contacts / outsourcing_orders / outsourcing_order_items | dry_run_ready | 只生成委外源单和加工合同草稿候选；不写委外回货、应付、付款或库存事实 |
| `yoyoosun-raw-bom-26029-20260119` | 26029#夜樱烬色才料明细表2026-1-19.xlsx | ProductForm / ProductSKUForm / MaterialForm / BOMVersionForm | products / product_skus / materials / units / bom_versions / bom_items | dry_run_ready | 只生成产品、SKU、材料和 BOM 候选；不写采购、库存、生产或成本事实 |
| `yoyoosun-raw-bom-26204-20260410` | 26204#抱抱猴子材料明细表2026-4-10.xlsx | ProductForm / ProductSKUForm / MaterialForm / BOMVersionForm | products / product_skus / materials / units / bom_versions / bom_items | dry_run_ready | 只生成产品、SKU、材料和 BOM 候选；不写采购、库存、生产或成本事实 |
| `yoyoosun-raw-contract-template-material-outsourcing` | 模板-材料与加工合同.xlsx | MaterialPurchaseContractPrintDraft / ProcessingContractPrintDraft | print_template_defaults / purchase_orders / outsourcing_orders | manual_reference | 只作字段和纸面样式来源；不作为运行时 Excel 母版 |
| `yoyoosun-raw-outsourcing-contract-pdf-zichun` | 9.3加工合同-子淳.pdf | ProcessingContractPrintDraft / OutsourcingOrderForm | outsourcing_orders / outsourcing_order_items / print_template_defaults | manual_reference | 只作人工核对来源，不做 OCR，不自动生成委外、应付、付款或库存事实 |
| `yoyoosun-raw-formal-mobile-report-v3` | plush_factory_formal_report_v3_mobile.pdf | MobileRoleTasksPage / WorkflowTaskActionDrawer | workflow_tasks / workflow_task_events | manual_reference | 只作页面观感和交付线索，不生成结构化导入行或 Workflow runtime 状态 |
| `yoyoosun-raw-mobile-report-screenshot-20260420` | yoyoosun-report-mobile-screenshot-20260420.png | MobileRoleTasksPage | workflow_tasks | manual_reference | 只作人工 UI 核对线索，不能作为唯一字段、流程或事实真源 |
| `yoyoosun-raw-role-workflow-v3-20260413` | yoyoosun-role-workflow-v3-20260413.png | CustomerConfigPreview / WorkflowRuntimeLedger / MobileRoleTasksPage | role_profiles / work_pools / workflow_tasks / process_definitions | manual_reference | 只作角色与流程边界线索，不自动升级为 Product Core runtime 流程真源 |
| `yoyoosun-raw-purchase-contract-photo-20260421-jpeg` | yoyoosun-purchase-contract-order-photo-20260421.jpeg | MaterialPurchaseContractPrintDraft / PurchaseOrderForm | purchase_orders / purchase_order_items / print_template_defaults | manual_reference | 只作人工字段和版式线索，不做 OCR，不重复计为独立业务单据 |
| `yoyoosun-raw-purchase-contract-photo-20260421-source-copy-jpg` | yoyoosun-purchase-contract-order-photo-20260421-source-copy.jpg | MaterialPurchaseContractPrintDraft / PurchaseOrderForm | purchase_orders / purchase_order_items / print_template_defaults | manual_reference | 与主 .jpeg 为同组副本，不重复计为独立业务单据 |

## 测试锚点

- `config/customers/yoyoosun/rawSourceFormMap.mjs`
- `scripts/qa/yoyoosun-customer-closure.test.mjs`

测试必须确保：每个 source-manifest 来源都有映射；映射不指向禁用 runtime Fact 表；试用 fixture 的关键打印字段不为空。
