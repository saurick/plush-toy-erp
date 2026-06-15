# 客户 / 供应商主数据评审 / Customer / Supplier MasterData Review

## 结论

当前阶段推荐 Option C：V1 先落 `customers / suppliers / contacts` 分表草案，保留未来抽象 `party / partner + role` 的可能性，但不在 V1 过度抽象成万能 partner 模型。

原因：

- 当前代码处于正式客户 / 供应商主数据起步阶段，分表更直观，迁移和权限边界更容易验收。
- 旧 `business_records` partners 页面已退出运行时，旧表族已删除；不得恢复为正式主数据入口。
- future finance 需要客户、供应商、开票资料、结算条件，但 V1 可以先把 finance 相关字段评审为可选或后置，避免把 永绅 yoyoosun 样本字段硬写进 Product Core。

本文件是评审文档，不改 Ent schema，不生成 migration。

## 对象评审

| 对象 | 分类 | V1 建议 | 说明 |
| --- | --- | --- | --- |
| `customers` | MasterData | 推荐 | 客户交易主体，供销售订单、出货、应收、发票引用 |
| `suppliers` | MasterData | 推荐 | 供应商 / 加工厂交易主体，供采购、委外、应付、质检引用 |
| `contacts` | MasterData | 推荐 | 联系人应单独建模，支持同一客户/供应商多个联系人 |
| `customer_addresses` | MasterData | 可选 V1 / V2 | 如果订单交付地址、发票地址和客户注册地址差异明确，再拆 |
| `supplier_material_profiles` | MasterData / Config | V2 可选 | 供应商供货能力、默认物料、价格和质检要求，先不进 V1 必做 |
| `settlement_terms` | Config / Finance Candidate | V2 可选 | 付款周期、结算方式、账期和开票规则需 finance 评审后再落 |

## 字段分类

| 分类 | 字段例子 | 处理口径 |
| --- | --- | --- |
| Product Core | code、name、status/is_active、display_name、created_at、updated_at | 可进入 V1 草案 |
| Product Core 可选 | tax_no、default_currency、default_payment_terms、default_contact_id | 需要确认是否对所有客户通用，V1 可先 nullable |
| Customer Config | 编号规则、字段显示 / 必填、默认付款方式、默认角色可见性 | 放配置草案，不写死 usecase |
| Customer Material | 永绅 yoyoosun 样本中的厂家简称、办公室电话格式、银行账户、特殊开票字段 | 先作为线索，不直接成为 V1 必填字段 |
| Finance Review Candidate | 开票抬头、税号、银行账号、账期、结算币种 | future AR/AP / invoice 评审前不作为强事实规则 |

## 与下游关系

| 下游对象 | 关系口径 |
| --- | --- |
| `sales_orders` | 引用 `customer_id`，同时可保存订单快照用于历史回显 |
| `purchase_orders` | future 引用 `supplier_id`，采购承诺不等于入库事实 |
| `purchase_receipts` | 当前已存在 `supplier_name` 快照；未来可评审可选 `supplier_id` 回补，但不能破坏历史入库事实 |
| `purchase_returns` | 退货事实可关联供应商快照或 future `supplier_id`，仍以 receipt / inventory facts 为真源 |
| `quality_inspections` | 来料质检事实通过采购入库和材料 / 批次追溯供应商，不由联系人主档决定结果 |
| future `shipments` | 出货事实可引用 customer / address snapshot，但真实 shipped 由 shipment facts 和 inventory_txns 支撑 |
| future AR/AP | 应收 / 应付应引用客户 / 供应商，但生成时机必须由 shipped / receipt / invoice / payment 评审确定 |

## 与旧 business_records partners 页关系

旧 partners 通用页面和旧表族已退出当前运行时。正式主数据落地后，必须避免恢复两套主数据同时对外写入：

1. 新建 / 编辑正式客户供应商应进入 `customers / suppliers / contacts` usecase。
2. 删除前 JSONL evidence 只能作为人工审计或导入 dry-run 线索，不作为长期唯一真源或自动 backfill 来源。
3. 如未来需要从历史 evidence 补数据，必须先评审 document_no、partner type、联系人明细、付款周期、税号和地址的 backfill 策略。
4. UI 不应从旧 partners 菜单或旧 evidence 反推正式主数据已完成。

## 是否共用 partner 模型

### Option A: customers / suppliers 分表

优点：

- 表意直接，业务人员容易理解。
- V1 schema 和 API 简单。
- customer / supplier 不同生命周期和权限更容易隔离。
- 和销售订单、采购订单、应收、应付关系清晰。

缺点：

- 同一主体既是客户又是供应商时可能重复。
- 通用联系人、地址、税务资料复用需要额外设计。

对 V1 的影响：

- 最小实现快，字段清晰。
- contacts 需要支持 owner_type 或分别 customer_contact / supplier_contact。

对 future finance 的影响：

- AR/AP 分别引用 customer / supplier，简单但会有重复开票资料风险。

对客户配置的影响：

- 客户和供应商字段显示可分别配置。

对 migration 的影响：

- 从 `business_records` partners backfill 时需要按 partner type 拆分。

与 `business_records` 的关系：

- partners 记录按类型迁移或保留为历史快照。

### 方案 B：合作方 + 角色 / Option B: partners + roles

优点：

- 统一主体，避免同一公司重复建档。
- contacts、addresses、tax profiles 可统一复用。
- 长期对多角色交易对象更灵活。

缺点：

- V1 复杂度更高。
- role、data scope、API 和 UI 更容易变成过度抽象。
- 当前并没有足够证据需要万能 partner 模型。

对 V1 的影响：

- schema、迁移、权限和 UI 都要同时解释 partner role。

对 future finance 的影响：

- AR/AP 可统一 party，但财务方向和科目仍要拆清。

对客户配置的影响：

- 字段配置更通用，但配置规则更复杂。

对 migration 的影响：

- 需要去重、角色归并和冲突处理，风险更高。

与 `business_records` 的关系：

- 需要从 partner type 推导 roles，容易把 永绅 yoyoosun 样本文案当系统角色。

### Option C: 先分表，未来抽象 party

优点：

- V1 保持低复杂度。
- 保留未来同一主体多角色的演进空间。
- 可以先稳定销售、采购、联系人和 source document 关系。

缺点：

- 未来抽象 party 时可能需要迁移。
- 需要在 V1 字段命名中避免写死无法迁移的 customer-only / supplier-only 假设。

对 V1 的影响：

- 推荐 V1 先用 `customers / suppliers / contacts`，contacts 可用 `owner_type + owner_id` 或在 schema final review 中决定拆分。

对 future finance 的影响：

- V1 不阻断 AR/AP；future finance 可先分别引用 customer / supplier，再评审 party 抽象。

对客户配置的影响：

- 永绅 yoyoosun 客户字段先进入 Customer Config / Customer Material 分类，不污染 Product Core。

对 migration 的影响：

- 初期迁移简单；未来抽象前需要唯一主体识别、重复主体合并和引用迁移计划。

与 `business_records` 的关系：

- partners 兼容页可按类型迁入分表；未迁数据保留 source snapshot。

## 当前阶段推荐

推荐 Option C。

V1 schema final review 应先确认：

- 客户 / 供应商 code 生成规则。
- name 是否唯一，以及是否允许停用后重名。
- contacts 采用 owner_type + owner_id，还是拆 customer_contacts / supplier_contacts。
- tax_no、invoice title、bank account、settlement terms 是否 V1 nullable，还是延后到 finance。
- 是否需要 `business_record_id` 迁移来源字段，仅用于 migration trace，不作为长期业务关系。

## 明确不落地

- 不新增通用 `party` 表作为 V1 必做。
- 不新增 SaaS 多租户字段。
- 不把 current 厂家简称、银行账号、开票习惯写成 Product Core 必填。
- 不用 `business_records` partners 页面继续替代正式主数据。
- 不从客户 / 供应商主档直接生成 AR/AP、invoice、payment。
