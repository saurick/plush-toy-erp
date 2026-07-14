# 永绅 raw-source 到表单映射

> 本文只保留永绅来源资料“类别”到 Product Core 表单、实体和打印草稿的脱敏映射。具体文件名、sourceId、hash、大小和私有相对路径由客户私有仓库 manifest 管理，不复制进 Product Core。它是导入前分类依据，不是导入批准。

## 总边界

- 客户专属 Private 仓库保存来源级 inventory、原件和私密 manifest；Product Core 只认识经审查的来源类别和通用校验合同。
- 来源文件不直接写 runtime，也不写 Workflow、库存、质检、出货、财务或其他 Fact。
- 图片 / PDF 不做 OCR 自动导入，只作人工核对线索。
- Excel 只能进入只读 extract、dry-run / preview 和人工 review；真实导入必须另行实现通用批次 usecase、RBAC、审计、幂等和回滚。
- 合同照片与模板样本只能约束打印字段和纸面样式，不覆盖 Product Core 模板结构或业务 usecase。

## 脱敏类别映射

| 来源类别 | 目标表单 / 工作台 | 目标领域 | 当前状态 | 关键边界 |
| --- | --- | --- | --- | --- |
| 材料 / 包材采购汇总 | SupplierForm / MaterialForm / PurchaseOrderForm / MaterialPurchaseContractPrintDraft | suppliers / materials / units / purchase source documents | dry-run category | 只生成供应商、材料、单位和采购源单候选；不写采购入库、库存或应付事实 |
| 委外加工汇总 | SupplierForm / ContactForm / OutsourcingOrderForm / ProcessingContractPrintDraft | suppliers / contacts / outsourcing source documents | dry-run category | 产品 / 材料主体必须人工确认；不写回货、质检、库存、应付或付款事实 |
| 材料分析 / BOM | ProductForm / MaterialForm / BOMVersionForm | products / materials / units / BOM | dry-run category | 只生成主数据和 BOM 候选；不写采购、生产、库存或成本事实 |
| 采购 / 加工合同模板 | MaterialPurchaseContractPrintDraft / ProcessingContractPrintDraft | print inputs / source documents | manual reference | 只作字段与版式参考，不作为运行时 Excel 母版 |
| 已签或纸面合同 | 对应合同打印草稿与源单据表单 | purchase / outsourcing / print | manual reference | 不做 OCR，不自动生成结算、付款、入库或库存事实 |
| 页面 / 移动端汇报材料 | MobileRoleTasksPage / 相关业务页面 | UI / delivery review | manual reference | 只作观感与交付线索，不生成结构化行或 runtime 状态 |
| 岗位 / 流程图 | CustomerConfigPreview / Workflow review | role / workflow review | manual reference | 只作角色与流程边界线索，不自动升级为 Product Core runtime 流程 |

## 测试锚点

- `config/customers/yoyoosun/rawSourceFormMap.mjs`
- `scripts/qa/yoyoosun-customer-closure.test.mjs`
- `scripts/import/fixtures/synthetic/`

Product Core 测试只应锁住类别映射、禁用 Fact 目标和合成 fixture 的通用合同。私有 manifest 是否覆盖真实来源、hash / size 是否匹配，由客户私有仓库验证；缺少私有资料不能导致普通 Product Core CI 失败。
