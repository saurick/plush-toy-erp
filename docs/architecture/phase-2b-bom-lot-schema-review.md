# Phase 2B BOM 与库存批次 Schema 评审

## 结论

Phase 2B 建议只推进 `inventory_lots`、`bom_headers`、`bom_items`，并把批次维度接入 Phase 2A 已验收的库存事实闭环。推荐方案是方案 B：新增 `inventory_lots`，同时给 `inventory_txns` 和 `inventory_balances` 增加 nullable `lot_id`。这属于 Phase 2A 模型的一次维度演进，不是推翻 `inventory_txns` 作为库存事实流水真源、`inventory_balances` 作为当前余额 / 查询加速表的既定口径。

本轮只做设计评审文档，不改 Ent schema，不生成 migration，不改运行时代码，不改前端，不迁移 `business_records`。

## 评审依据

| 类型 | 文件 / 实现 | 当前结论 |
| --- | --- | --- |
| 仓库真源 | `README.md`、`AGENTS.md`、`docs/current-source-of-truth.md` | Phase 2A 已落 `units / materials / products / warehouses / inventory_txns / inventory_balances`；仍未落 BOM、批次、采购、生产、委外、品质、财务。 |
| Phase 2A 设计 | `docs/changes/phase-2a-inventory-fact-schema.md` | `inventory_txns` 是库存历史事实真源；`inventory_balances` 是当前余额 / 查询加速表；数量使用 decimal/numeric，不使用 float。 |
| Phase 2A 验收 | `docs/changes/phase-2a-postgres-verification.md` | 本地临时 PostgreSQL 已验证 migration、numeric 精度、幂等、冲正、余额唯一键和并发出库。未对 `192.168.0.106:5432/plush_erp` 执行 apply。 |
| 早期 schema 评审 | `docs/architecture/material-product-inventory-schema-review.md` | 早期已识别 BOM、批次和库存 lot 维度，但 Phase 2A 只落了最小库存事实闭环。 |
| 业务字段材料 | `docs/plush-erp-data-model.md` | 材料分析明细表中款式编号、单位用量、损耗、组装部位、色号 / 颜色等字段已经足够支持最小 BOM 评审；该文档早期“暂不建表”的口径已被 Phase 2A 库存事实落地文档局部更新。 |
| 当前 Ent schema | `server/internal/data/model/schema/*.go` | `products` 已有 `style_no / customer_style_no`；`inventory_txns` 和 `inventory_balances` 当前唯一维度都不含 `lot_id`。 |
| 当前库存写入主路径 | `server/internal/biz/inventory.go`、`server/internal/data/inventory_repo.go`、`server/internal/data/inventory_repo_test.go` | 库存写入在同事务内新增流水并更新余额；余额唯一键当前是 `subject_type + subject_id + warehouse_id + unit_id`。 |

## Phase 2B 边界

| 范围 | 本轮结论 | 原因 |
| --- | --- | --- |
| BOM | 只评审并建议落最小 `bom_headers / bom_items` | BOM 是材料需求、单位用量和损耗率的工程事实，后续采购、领料、成本都依赖它。 |
| 批次 | 只评审并建议落 `inventory_lots` 及库存事实批次维度 | 毛绒工厂材料存在色号、缸号、来料批次、供应商批次；成品也可能有生产批次。 |
| 采购 | 不做 | 采购订单字段、供应商主档、回货和 IQC 关系还未进入本轮边界。 |
| 生产 | 不做 | 生产订单、排产、领料、完工入库会同时牵动 workflow、移动端和库存扣减，本轮不扩张。 |
| 委外 | 不做 | 委外发料、回货、返工和结算样本仍需单独评审。 |
| 品质 | 不做 | `quality_status` 只在批次上预留状态，不建质检单、检验项目或缺陷表。 |
| 财务 | 不做 | BOM 版本切换会影响成本，但本轮不做成本核算、应收应付、发票、核销或总账。 |
| 前端 | 不接 | 本轮不改页面、帮助中心或保存转换层，避免把 schema 评审和交互改造绑在一起。 |
| `business_records` 迁移 | 不迁移 | `business_records / business_record_items` 继续作为通用单据快照和兼容层，不替代 BOM 或库存批次事实。 |
| 真实库 migration apply | 不做 | 不对 `192.168.0.106:5432/plush_erp` 执行 `migrate_apply`。 |
| 分区、读写分离 | 不做 | Phase 2B 只评审普通表形和字段维度，不做真实分区 migration，不引入读写分离。 |

## 为什么先做这三张表

| 表 | 为什么优先 | 不提前扩展的边界 |
| --- | --- | --- |
| `inventory_lots` | 批次是库存事实的自然维度。若材料按色号、缸号、供应商批次收发，不把批次进入库存流水和余额，后续很难追溯“哪一批布料 / 填充物 / 包材被领用”。 | 不直接建供应商主档、质检单、库位或预留；供应商批次先保存为批次字段，质检状态只预留。 |
| `bom_headers` | BOM 头承接产品 / 款式的工程版本、生效状态和来源快照，是后续材料需求计算的版本边界。 | 不做审批流和成本冻结；生效状态只表达版本状态，不触发采购或生产。 |
| `bom_items` | BOM 行承接材料、单位用量、损耗率、组装部位和工艺备注，是最小材料需求事实。 | 不生成采购需求，不生成领料单，不生成成本表。 |

## product_styles 是否需要

| 判断项 | 当前观察 | Phase 2B 决策 |
| --- | --- | --- |
| 现有字段 | `products` 已有 `style_no` 和 `customer_style_no`。 | 可表达当前 BOM 最小绑定所需的款式编号和客户款号。 |
| 文档线索 | `docs/plush-erp-data-model.md` 明确提示产品、款式、客户款号、产品订单编号存在多层语义。 | 现有真实样本还不足以稳定“产品、款式、纸样、客户款号”四套独立生命周期。 |
| 最小闭环 | 本轮 BOM 可以先绑定 `products.id`。 | 通过 `products.style_no / customer_style_no` 保存款式和客户款号线索。 |
| 推荐 | Phase 2B 不新增 `product_styles`。 | 等后续明确“一个款式下多个产品 / SKU / 颜色款 / 纸样版本”的长期维护关系，再单独评审并迁移。 |

## 与 Phase 2A 的关系

| 关系 | 设计口径 |
| --- | --- |
| `bom_headers.product_id` | 关联 Phase 2A 已有 `products.id`，先不引入 `product_styles`。 |
| `bom_items.material_id` | 关联 Phase 2A 已有 `materials.id`。 |
| `bom_items.unit_id` | 关联 Phase 2A 已有 `units.id`，BOM 单位用量使用 decimal/numeric。 |
| `inventory_lots.subject_type + subject_id` | 继续复用 Phase 2A 的 `MATERIAL / PRODUCT` 主体表达，避免过早引入多态外键、统一库存对象表或 `material_id/product_id` 二选一外键组合。 |
| `inventory_txns.lot_id` | 若批次要参与库存事实，应在 Phase 2B 增加 nullable `lot_id`。否则批次只能做档案，无法回答“哪一批进出库”。 |
| `inventory_balances.lot_id` | 若流水进入批次维度，余额唯一键也应同步扩展到 `lot_id`，否则只能表示总库存，不能表示当前批次库存。 |
| `business_records` | 继续作为通用单据快照和兼容层；BOM 和批次事实不从旧通用记录批量迁移。 |

## 候选表与候选变更总览

| 候选对象 | 字段摘要 | 约束建议 | 索引建议 | 是否强事实表 | 是否允许软删除 |
| --- | --- | --- | --- | --- | --- |
| `inventory_lots` | `subject_type`、`subject_id`、`lot_no`、`color_no`、`vat_no`、`incoming_lot_no`、`production_lot_no`、`supplier_lot_no`、`supplier_name_snapshot`、`quality_status`、`status`、`source_type`、`source_id`、`source_line_id`、`received_at`、`created_at`、`updated_at` | `subject_type` 限定 `MATERIAL / PRODUCT`；`subject_id > 0`；`lot_no` 非空；`quality_status` 和 `status` 使用有限状态；`subject_type + subject_id + lot_no` 唯一 | `subject_type, subject_id, lot_no`；`supplier_lot_no`；`color_no`；`status`；`quality_status` | 是，批次身份事实；不是库存数量事实 | 不建议软删除；错误批次用 `status=VOID` 作废 |
| `bom_headers` | `bom_no`、`product_id`、`version`、`status`、`effective_from`、`effective_to`、`source_type`、`source_id`、`source_no_snapshot`、`remark`、`created_at`、`updated_at` | `product_id` 外键；`version` 非空；`status` 有限状态；`product_id + version` 唯一；生效时间范围可空但开始应小于结束 | `product_id, version`；`product_id, status`；`status` | 是，工程版本事实 | draft 可软删除；active / archived 不物理删除，只作废或归档 |
| `bom_items` | `bom_header_id`、`line_no`、`material_id`、`unit_id`、`assembly_part`、`unit_usage`、`loss_rate`、`gross_usage`、`piece_count`、`process_note`、`remark`、`created_at`、`updated_at` | `bom_header_id`、`material_id`、`unit_id` 外键；`line_no > 0`；`unit_usage > 0`；`loss_rate >= 0`；`bom_header_id + line_no` 唯一 | `bom_header_id, material_id`；`material_id`；`assembly_part` | 是，工程版本明细事实 | 跟随 BOM 头；active BOM 的明细不直接删除，修订走新版本 |
| `product_styles` | `style_no`、`style_name`、`customer_style_no`、`status` 等 | 若新增，应至少约束 `style_no` 唯一或 `customer_id + style_no` 唯一 | `style_no`；`customer_style_no`；`status` | 否，主数据 | 可停用；有事实引用后不物理删除 |
| `inventory_txns` 增加 `lot_id` | 在现有库存事实流水上增加 nullable `lot_id` | `lot_id` 可空；非空时应指向 `inventory_lots.id`；应用层校验 lot 的 `subject_type + subject_id` 与流水一致 | 扩展单品流水查询索引到 `subject_type, subject_id, warehouse_id, lot_id, occurred_at`；保留幂等和来源索引 | 是，库存历史事实真源 | 不允许软删除，不允许普通 update/delete |
| `inventory_balances` 增加 `lot_id` | 在现有余额维度上增加 nullable `lot_id` | 唯一键扩展为 `subject_type + subject_id + warehouse_id + unit_id + lot_id`；空批次必须用 `NULLS NOT DISTINCT` 或默认批次策略避免重复行 | `subject_type, subject_id, warehouse_id, unit_id, lot_id` unique；`subject_type, subject_id, lot_id`；`warehouse_id, lot_id` | 是，当前余额 / 查询加速表 | 不允许软删除；余额为 0 可保留或后续归档 |

## `inventory_lots` 字段建议

| 字段 | 类型建议 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | `bigint` | 是 | 批次 ID。 |
| `subject_type` | `varchar(16)` | 是 | `MATERIAL` 或 `PRODUCT`，与 Phase 2A 库存主体一致。 |
| `subject_id` | `bigint` | 是 | 指向材料或成品的 ID；本轮继续应用层校验，不做多态外键。 |
| `lot_no` | `varchar(64)` | 是 | 系统内批次号，可由来料批次、生产批次或人工录入生成。 |
| `color_no` | `varchar(64)` | 否 | 色号；用于布料、辅料、线材等颜色追踪。 |
| `vat_no` | `varchar(64)` | 否 | 缸号；用于同色不同缸的差异追踪。 |
| `incoming_lot_no` | `varchar(64)` | 否 | 来料批次号。 |
| `production_lot_no` | `varchar(64)` | 否 | 成品或半成品生产批次号；本轮不建生产单。 |
| `supplier_lot_no` | `varchar(64)` | 否 | 供应商批次号；本轮不建供应商主档，先保存批次文本。 |
| `supplier_name_snapshot` | `varchar(255)` | 否 | 供应商名称快照；只作追溯摘要，不是供应商主档。 |
| `quality_status` | `varchar(32)` | 是 | 建议默认 `PENDING`，可取 `PENDING / PASSED / HOLD / REJECTED`；本轮不接品质模块。 |
| `status` | `varchar(32)` | 是 | 建议 `ACTIVE / VOID / ARCHIVED`；错误批次用作废状态。 |
| `source_type` | `varchar(64)` | 否 | 来源类型，兼容期可指向通用单据或导入来源。 |
| `source_id` | `bigint` | 否 | 来源表头 ID。 |
| `source_line_id` | `bigint` | 否 | 来源明细 ID。 |
| `received_at` | `timestamptz` | 否 | 来料或入库时间摘要；真实库存发生时间仍以 `inventory_txns.occurred_at` 为准。 |
| `created_at` / `updated_at` | `timestamptz` | 是 | 审计字段。 |

批次表不建议放当前数量字段。数量事实应来自 `inventory_txns`，当前量应来自 `inventory_balances`。如果后续为了导入暂存或标签打印确实需要批次数量快照，也必须使用 decimal/numeric，且不得替代库存事实。

## `bom_headers` 字段建议

| 字段 | 类型建议 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | `bigint` | 是 | BOM 头 ID。 |
| `bom_no` | `varchar(64)` | 是 | BOM 编号；可系统生成。 |
| `product_id` | `bigint` | 是 | 关联 `products.id`。 |
| `version` | `varchar(32)` | 是 | 版本号，如 `V1`、`2026-04-25` 或业务约定版本。 |
| `status` | `varchar(32)` | 是 | 建议 `DRAFT / ACTIVE / INACTIVE / ARCHIVED`。 |
| `effective_from` | `timestamptz` | 否 | 生效开始时间。 |
| `effective_to` | `timestamptz` | 否 | 生效结束时间。 |
| `source_type` | `varchar(64)` | 否 | 来源类型，如 `BUSINESS_RECORD`、`IMPORT`。 |
| `source_id` | `bigint` | 否 | 来源单据或导入记录 ID。 |
| `source_no_snapshot` | `varchar(128)` | 否 | 来源单号快照，如材料明细表里的订单编号。 |
| `remark` | `varchar(255)` | 否 | 版本备注。 |
| `created_at` / `updated_at` | `timestamptz` | 是 | 审计字段。 |

BOM 头只表达工程版本，不触发采购、生产或成本。`ACTIVE` 状态最多表达“当前可用于后续业务选择”，不代表已生成采购需求或生产领料。

## `bom_items` 字段建议

| 字段 | 类型建议 | 必填 | 说明 |
| --- | --- | --- | --- |
| `id` | `bigint` | 是 | BOM 明细 ID。 |
| `bom_header_id` | `bigint` | 是 | 关联 `bom_headers.id`。 |
| `line_no` | `int` | 是 | 行号，用于保留材料分析明细表顺序。 |
| `material_id` | `bigint` | 是 | 关联 `materials.id`。 |
| `unit_id` | `bigint` | 是 | 关联 `units.id`。 |
| `assembly_part` | `varchar(128)` | 否 | 组装部位，如脸、后头、身体等。 |
| `unit_usage` | `numeric(20,6)` | 是 | 单位用量，不使用 float。 |
| `loss_rate` | `numeric(10,6)` | 是 | 损耗率，建议保存为比例值，如 `0.100000` 表示 10%，不保存百分号字符串。 |
| `gross_usage` | `numeric(20,6)` | 否 | 含损耗用量，可保存导入结果或由 `unit_usage * (1 + loss_rate)` 派生；若保存，必须可校验。 |
| `piece_count` | `numeric(20,6)` | 否 | 片数；当前样本有该字段但缺值较多，先可选。 |
| `process_note` | `varchar(255)` | 否 | 加工程序、加工方式、工艺备注。 |
| `remark` | `varchar(255)` | 否 | 行备注。 |
| `created_at` / `updated_at` | `timestamptz` | 是 | 审计字段。 |

BOM 数量、损耗率、片数和含损耗用量都必须使用 decimal/numeric，不使用 float。后续若要从 BOM 生成采购需求或生产领料，必须在生产 / 采购专项里定义生成规则，本轮不做。

## 是否应该修改 `inventory_txns`

| 方案 | 判断 |
| --- | --- |
| 不加 `lot_id` | 批次只能做主档或标签档案，无法成为库存事实维度。入库和出库仍然只知道材料 / 成品、仓库、单位，不知道具体哪一批。 |
| 只给 `inventory_txns` 加 `lot_id` | 历史流水能追溯批次，但当前余额仍只能按总库存查询；每次查批次当前量都要聚合流水，且与余额表口径不一致。 |
| 给 `inventory_txns` 和 `inventory_balances` 同时加 nullable `lot_id` | 批次进入事实流水，也进入当前余额维度，可以支持批次库存查询、批次出库和后续质检状态拦截。 |

推荐给 `inventory_txns` 增加 nullable `lot_id`，并同步调整 `inventory_balances`。批次是库存事实的一部分，不应只停留在档案层。

## 方案 A / B 比较

| 方案 | 内容 | 优点 | 缺点 | 适用场景 |
| --- | --- | --- | --- | --- |
| 方案 A | 只新增 `inventory_lots`，`inventory_txns` 暂不加 `lot_id`，`inventory_balances` 不变 | 改动小；不影响 Phase 2A 已验收的余额唯一键；migration 和测试范围窄 | 批次不进入库存事实；无法按批次扣减、追溯和查询当前库存；`inventory_lots` 退化为档案，业务价值有限 | 只想先做批次号登记、标签打印或导入暂存，且明确暂不按批次发料 / 出库。 |
| 方案 B | 新增 `inventory_lots`，同时给 `inventory_txns` 增加 nullable `lot_id`，给 `inventory_balances` 增加 nullable `lot_id` 并扩展唯一键 | 真正支持材料批次、成品批次、色号、缸号、供应商批次进入库存闭环；后续可按批次查库存、出库和追溯 | 需要演进 Phase 2A 模型；余额唯一键、库存写入 SQL、幂等重放、冲正校验和测试都要同步调整 | 毛绒工厂存在色号、缸号、来料批次和供应商批次追踪需求，应优先采用。 |

结合毛绒工厂业务，推荐方案 B。布料、辅料、填充物、包材常见同物料不同色号 / 缸号 / 批次差异；如果只落方案 A，后续领料、退料、品质追溯仍然无法回答具体批次问题。方案 B 会触达 Phase 2A 已验收模型，但它只是把库存维度从“主体 + 仓库 + 单位”扩展为“主体 + 仓库 + 单位 + 批次”，主路径仍然是追加 `inventory_txns` 并同事务更新 `inventory_balances`。

## 索引建议

| 对象 | 索引 |
| --- | --- |
| `inventory_lots` | `UNIQUE (subject_type, subject_id, lot_no)` |
| `inventory_lots` | `INDEX (supplier_lot_no)` |
| `inventory_lots` | `INDEX (color_no)` |
| `inventory_lots` | `INDEX (quality_status)` |
| `bom_headers` | `UNIQUE (product_id, version)` |
| `bom_headers` | `INDEX (product_id, status)` |
| `bom_items` | `UNIQUE (bom_header_id, line_no)` |
| `bom_items` | `INDEX (bom_header_id, material_id)` |
| `inventory_txns` 方案 B | `INDEX (subject_type, subject_id, warehouse_id, lot_id, occurred_at)` |
| `inventory_balances` 方案 B | `UNIQUE (subject_type, subject_id, warehouse_id, unit_id, lot_id)`，需要处理 nullable `lot_id` 的唯一语义 |

PostgreSQL 下如果 `lot_id` 允许为空，唯一键不能直接依赖默认 NULL 语义，否则同一主体 / 仓库 / 单位可能出现多条空批次余额。下一轮落 schema 时需要在两种策略中选一种：使用 `NULLS NOT DISTINCT`，或显式建立“无批次”默认批次行并让 `lot_id` 非空。考虑 Ent + Atlas 兼容性，推荐下一轮优先评估“默认无批次 lot”是否能降低 migration 和查询复杂度；如果坚持 nullable `lot_id`，migration 需要确认 Atlas 生成结果能表达 PostgreSQL 的唯一语义。

## 数据类型建议

| 数据 | 类型建议 | 说明 |
| --- | --- | --- |
| BOM 单位用量 | `numeric(20,6)` | 与库存数量精度保持一致，不使用 float。 |
| BOM 含损耗用量 | `numeric(20,6)` | 如果落字段，必须可由单位用量和损耗率校验。 |
| BOM 损耗率 | `numeric(10,6)` | 保存比例值，不保存百分号字符串。 |
| 批次数量 | 不建议放在 `inventory_lots`；如后续存在批次数量快照，使用 `numeric(20,6)` | 数量事实仍以流水和余额为准。 |
| 库存流水数量 | 继续使用 Phase 2A 的 `numeric(20,6)` | 批次维度不改变数量类型。 |
| 库存余额数量 | 继续使用 Phase 2A 的 `numeric(20,6)` | 批次维度只改变唯一键和聚合维度。 |

## 主要风险

| 风险 | 影响 | 控制建议 |
| --- | --- | --- |
| 批次进入 `inventory_txns` 后，余额是否按 lot 聚合 | 如果 `inventory_balances` 不带 `lot_id`，只能表示总库存，不能表示批次库存；如果带 `lot_id`，唯一键和库存更新 SQL 必须扩展。 | 推荐方案 B 同时调整流水和余额，并补齐集成测试。 |
| nullable `lot_id` 唯一语义 | PostgreSQL 默认允许多条 NULL，可能破坏余额唯一性。 | 下一轮 schema 设计必须明确 `NULLS NOT DISTINCT` 或默认无批次 lot，不要让默认 NULL 唯一语义决定库存口径。 |
| 旧余额迁移 | Phase 2A 已有余额行没有批次，扩展唯一键后需要明确旧行归属。 | 不迁移 `business_records`；只对 Phase 2A 余额数据按“无批次”口径迁移或保持 nullable，但必须有可回滚 migration 和测试。 |
| 冲正校验 | 当前冲正要求主体、仓库、单位、数量和方向匹配；加入 `lot_id` 后也必须匹配批次。 | 下一轮同步更新 biz 校验、repo 查询和测试。 |
| 幂等重放 | 相同 `idempotency_key` 返回既有流水；如果批次字段参与语义，重放时要确保返回的余额 key 也包含 lot。 | `inventoryBalanceKeyFromEntTxn` 和相关查询必须纳入 `lot_id`。 |
| BOM 版本切换 | BOM 生效版本会影响后续采购需求、生产领料和成本核算。 | 本轮只保存版本与状态，不生成采购 / 生产 / 成本；后续链路必须引用明确版本。 |
| 质检状态预留 | 批次上有 `quality_status` 但没有品质模块，可能被误用成完整质检事实。 | 文档和代码注释需明确它只是批次可用状态预留，不保存检验项目、抽检结果或缺陷明细。 |
| `product_styles` 推迟 | BOM 先绑 `products.id`，后续如果产品 / 款式层级拆开，需要迁移 BOM 绑定口径。 | 当前 `products.style_no / customer_style_no` 足够最小闭环；后续新增 `product_styles` 时再做显式迁移评审。 |

## 下一轮落 schema 建议

建议下一轮落 Ent schema，但只在以下最小范围内推进：

| 范围 | 建议 |
| --- | --- |
| 新表 | `inventory_lots`、`bom_headers`、`bom_items`。 |
| 现有表变更 | 采用方案 B：`inventory_txns` 增加 `lot_id`，`inventory_balances` 增加 `lot_id` 并调整唯一键。 |
| 同步代码 | 只调整后端库存 usecase / repo / tests 和 Ent 生成代码；不改前端。 |
| migration | 只生成普通 PostgreSQL migration，不做真实分区，不对 `192.168.0.106:5432/plush_erp` apply。 |
| 测试 | 在 Phase 2A 现有 SQLite 单测和本地临时 PostgreSQL 集成测试基础上，新增批次入库、批次出库、同物料不同批次余额隔离、冲正批次匹配、无批次兼容和余额唯一键测试。 |

暂时不做采购、生产、委外、品质、财务，是因为这些模块会把订单、任务、发料、回货、检验、结算和成本一次性拉进来，复杂度超过 Phase 2B 的目标。当前最小且必要的底座是：BOM 说明“产品需要什么材料、用量和损耗”，批次说明“库存事实属于哪一批”。等这个底座在后端闭环和 PostgreSQL 验证通过后，再逐条业务链路拆采购、生产、委外、品质和财务，风险更可控。
