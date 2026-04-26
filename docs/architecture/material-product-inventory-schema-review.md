# 材料、成品、BOM 与库存专表 Schema 评审

> 结论：本轮只做设计评审，不改 Ent schema，不生成 migration。当前 `business_records / business_record_items` 继续作为通用单据快照和 v1 流程兼容层；后续库存流水、库存余额和财务事实不能长期依赖通用快照，必须逐步收口到专表。

## 1. 评审依据

本轮对照了以下当前真源和实现：

| 类型 | 文件 / 范围 | 关键结论 |
| --- | --- | --- |
| 当前真源 | `docs/current-source-of-truth.md` | 当前业务保存层真源是 `business_records`、`business_record_items`、`business_record_events`、`workflow_tasks`、`workflow_task_events`、`workflow_business_states`；后续专表继续按真实样本和 Ent + Atlas 推进。 |
| 已有行业表评审 | `docs/architecture/industry-schema-review.md` | 不建议一次性拆完整 ERP；应先评审强一致瓶颈表，尤其库存流水 / 余额和财务明细。 |
| 通用单据 schema | `server/internal/data/model/schema/business_record*.go` | 表头和明细主要是字符串、`payload` 和 `float`，适合通用快照，不适合长期承接库存数量、金额和强约束事实。 |
| workflow schema | `server/internal/data/model/schema/workflow_*.go` | `workflow_tasks` 与 `workflow_business_states` 通过 `source_type/source_id` 关联业务来源，当前多数来源仍指向通用业务记录。 |
| migrations | `server/internal/data/model/migrate/*.sql` | 已落地账号、通用业务记录和 workflow 表；当前没有材料、成品、BOM、库存流水或库存余额专表。 |
| biz / data 主路径 | `server/internal/biz/business_record.go`、`server/internal/data/business_record_repo.go`、`server/internal/biz/workflow.go`、`server/internal/data/workflow_repo.go`、`server/internal/data/debug_seed_repo.go` | 通用单据创建 / 更新 / 软删除、明细替换、事件记录、任务状态和业务状态已经跑通；debug seed / cleanup 也依赖当前通用表和 workflow 表。 |

## 2. 当前 9 张表定位

| 表 | 当前定位 | 是否业务事实真源 | 后续关系 |
| --- | --- | --- | --- |
| `admin_users` | 后台管理员、菜单权限、ERP 偏好和移动端角色权限 | 否，账号 / 权限真源 | 不参与材料、BOM 和库存事实建模。 |
| `users` | 普通用户账号基线 | 否，账号真源 | 当前与行业专表无直接关系。 |
| `business_records` | v1 通用业务单据表头，保存模块、单据号、标题、业务状态、角色、客户 / 供应商 / 产品 / 材料 / 仓库等快照字段和 `payload` | 是 v1 通用单据快照真源，不是长期库存 / 财务事实真源 | 专表落地后继续保留为单据快照、打印 / 帮助中心 / 调试兼容层，可通过 `payload` 或后续映射字段关联专表 ID。 |
| `business_record_items` | v1 通用业务单据明细，保存材料 / 规格 / 单位 / 数量 / 单价 / 金额等快照字段和 `payload` | 是 v1 明细快照真源，不是长期 BOM / 库存事实真源 | 专表落地后可作为历史明细快照和回补来源；不能直接替代 BOM 行、库存流水行或财务核销行。 |
| `business_record_events` | 通用单据创建、更新、删除、恢复和 debug seed / cleanup 等事件 | 是通用单据审计事件，不是库存流水 | 继续记录单据层事件；库存增减必须进入 `inventory_txns`。 |
| `workflow_tasks` | 协同任务、责任角色、任务状态、来源对象、催办和处理 payload | 是任务事实 | 后续 `source_type/source_id` 可逐步从通用单据迁到专表，但不应一次性迁移全部入口。 |
| `workflow_task_events` | 任务创建、状态变化、催办、升级等事件 | 是任务事件事实 | 继续作为 workflow 审计；不替代库存、财务和质量事实流水。 |
| `workflow_business_states` | 每个业务来源当前业务状态快照，唯一键是 `source_type + source_id` | 是业务状态快照，不是业务对象本身 | 后续可指向专表对象，也可在兼容期继续指向 `business_records`。 |
| `atlas_schema_revisions` | Atlas migration 版本记录 | 否，迁移元数据 | 只记录 schema 版本，不参与业务设计。 |

当前三层边界应保持清晰：

| 层 | 职责 | 不承担 |
| --- | --- | --- |
| workflow 表 | 任务、任务事件、当前业务状态和催办 / 阻塞协同 | 不保存库存真实数量，不做财务核销，不替代 BOM 版本。 |
| `business_records / business_record_items` | 通用单据快照、v1 表格 / 弹窗保存、打印取值、帮助中心和调试验收 | 不长期承接材料主档、成品主档、库存流水、库存余额、BOM 强版本和财务强事实。 |
| 后续专表 | 材料、成品、BOM、库存流水、库存余额、预留和后续财务核销等强约束事实 | 不替代通用单据快照的兼容价值，不一次性覆盖完整 ERP。 |

## 3. 第一批候选专表总览

| 表 | 业务作用 | 关键字段草案 | 主键建议 | 唯一约束草案 | 主要索引草案 | 强事实表 | 软删除策略 | 和 `business_records` 的关系 | 落地优先级 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `material_categories` | 材料分类树，区分布料、辅料、填充物、包材、五金、纸样等 | `category_code`、`name`、`parent_id`、`sort_order`、`is_active`、`deleted_at` | `id bigint` | `category_code`；`parent_id + name` 在未删除范围内唯一 | `parent_id`；`is_active`；`deleted_at` | 否，主数据字典 | 允许软删除；已被材料引用时只停用 | 通用单据里的 `payload.material_category` 可回补到分类 ID，但通用快照继续保留原文 | P2，随材料主档一起或略后 |
| `units` | 单位字典和精度口径，统一 `PCS / 套 / 片 / Y / KG` 等 | `unit_code`、`name`、`unit_kind`、`decimal_places`、`base_unit_id`、`conversion_rate`、`is_active` | `id bigint` | `unit_code` | `unit_kind`；`base_unit_id`；`is_active` | 否，主数据字典 | 不建议物理删除；使用停用 | 通用单据的 `unit` 是快照文本；专表写入时映射到 `unit_id` 并保留 `unit_snapshot` | P1，库存数量落表前必须先定 |
| `suppliers` | 供应商、加工厂、辅包材厂商主档 | `supplier_code`、`name`、`short_name`、`supplier_type`、`contact_name`、`contact_phone`、`address`、`tax_profile`、`is_active`、`deleted_at` | `id bigint` | `supplier_code`；必要时 `name + supplier_type` 未删除范围内唯一 | `supplier_type`；`name`；`short_name`；`is_active` | 否，主数据 | 允许软删除；有业务事实时只停用 | `business_records.supplier_name` 和 item `supplier_name` 是历史快照，不能被主档改名反向覆盖 | P2，采购 / 委外专表前先评审 |
| `customers` | 客户主档，承接订单、成品、出货和应收后续关联 | `customer_code`、`name`、`short_name`、`contact_name`、`contact_phone`、`address`、`is_active`、`deleted_at` | `id bigint` | `customer_code`；必要时 `name` 未删除范围内唯一 | `name`；`short_name`；`is_active` | 否，主数据 | 允许软删除；有订单 / 成品事实时只停用 | `business_records.customer_name` 继续是单据快照；专表可在 payload 里保存 `customer_id` 作为兼容线索 | P2，产品和订单字段真源确认后推进 |
| `product_styles` | 款式主档，承接 `26029# / 26204#` 这类款式编号、款式名和设计信息 | `style_no`、`style_name`、`customer_id`、`designer_name`、`default_unit_id`、`status`、`payload`、`deleted_at` | `id bigint` | `style_no`；可选 `customer_id + style_no` | `customer_id`；`status`；`style_name` | 否，主数据真源 | 允许软删除；已有 BOM / 产品 / 库存事实时只停用 | `business_records.style_no/product_name` 继续保留样本原文；后续保存转换可附带 `style_id` | P1 |
| `products` | 成品 / SKU / 颜色款主档，区分款式与产品编号 / SKU | `product_no`、`style_id`、`product_name`、`color_name`、`size_name`、`default_unit_id`、`status`、`payload`、`deleted_at` | `id bigint` | `product_no`；可选 `style_id + color_name + size_name` | `style_id`；`status`；`product_name`；`color_name` | 否，主数据真源 | 允许软删除；有库存 / 出货事实时只停用 | `business_records.product_no/product_name` 是单据快照；专表 ID 进入后不覆盖历史文本 | P1 |
| `materials` | 材料主档，统一主料、辅料、填充物、包材等物料身份 | `material_code`、`category_id`、`material_name`、`spec`、`color_name`、`supplier_id`、`supplier_item_no`、`default_unit_id`、`status`、`payload`、`deleted_at` | `id bigint` | `material_code`；可选 `category_id + material_name + spec + color_name + supplier_item_no` 未删除范围内唯一 | `category_id`；`supplier_id`；`material_name`；`supplier_item_no`；`status` | 否，主数据真源 | 允许软删除；已有 BOM / 库存 / 采购事实时只停用 | `business_records.material_name` 和 item `material_name/spec/unit` 是快照；专表用于后续事实引用 | P1 |
| `bom_headers` | BOM 版本头，绑定款式或成品，承接材料分析明细表的版本口径 | `bom_no`、`style_id`、`product_id`、`version_no`、`status`、`effective_from`、`effective_to`、`source_record_id`、`approved_at`、`approved_by`、`payload` | `id bigint` | `bom_no`；`style_id + version_no`；可选当前生效 BOM 的 partial unique | `style_id`；`product_id`；`status`；`effective_from` | 是，工程版本事实 | draft 可软删除；approved 后不删除，只作废 / 归档 | `material-bom` 模块的 `business_records` 继续保留导入 / 打印快照；`source_record_id` 可指向快照记录 | P1 |
| `bom_items` | BOM 明细行，保存材料、用量、损耗、组装部位和工艺备注 | `bom_header_id`、`line_no`、`material_id`、`unit_id`、`assembly_part`、`unit_usage numeric`、`loss_rate numeric`、`gross_usage numeric`、`process_note`、`remark`、`payload` | `id bigint` | `bom_header_id + line_no` | `bom_header_id`；`material_id`；`assembly_part` | 是，工程版本明细事实 | 跟随 BOM 版本；approved 后不物理改历史，修订走新版本 | `business_record_items` 可作为导入快照和旧数据回补来源，不能作为 BOM 强版本明细长期真源 | P1 |
| `warehouses` | 仓库主档，区分原料仓、辅料仓、半成品仓、成品仓、委外在途等 | `warehouse_code`、`name`、`warehouse_type`、`status`、`manager_role_key`、`payload`、`deleted_at` | `id bigint` | `warehouse_code`；`name` 未删除范围内唯一 | `warehouse_type`；`status` | 否，主数据 | 允许软删除；有库存余额或流水时只停用 | `business_records.warehouse_location` 是文本快照；后续库存事实必须引用 `warehouse_id` | P1 |
| `warehouse_locations` | 库位 / 区位 / 货架，支持仓库内精细定位 | `warehouse_id`、`location_code`、`name`、`parent_id`、`location_type`、`status`、`deleted_at` | `id bigint` | `warehouse_id + location_code` | `warehouse_id`；`parent_id`；`status` | 否，主数据 | 允许软删除；有余额时只停用 | 通用记录中的库位文本不反向覆盖库位主档；可作为历史快照显示 | P2，复杂库位未稳定前可先建默认库位 |
| `inventory_lots` | 批次 / 批号 / 质量状态载体，连接入库批次、供应商批号和成品批次 | `lot_no`、`item_type`、`material_id`、`product_id`、`supplier_id`、`quality_status`、`source_type`、`source_id`、`source_line_id`、`received_at`、`payload` | `id bigint` | `item_type + item_id + lot_no`；必要时 `source_type + source_id + source_line_id` | `lot_no`；`material_id`；`product_id`；`quality_status`；`source_type + source_id` | 是，批次身份事实 | 不建议软删除；错误用作废状态 | 通用入库记录可作为来源快照；批次专表保存可追溯身份 | P2，先支持无批次或默认批次也要预留字段 |
| `inventory_txns` | 库存事实流水，所有入库、出库、调整、转移、预留释放影响都以追加流水记录 | `txn_no`、`occurred_at`、`item_type`、`material_id`、`product_id`、`warehouse_id`、`location_id`、`lot_id`、`txn_type`、`direction`、`quantity numeric`、`unit_id`、`source_type`、`source_id`、`source_line_id`、`idempotency_key`、`reversal_of_txn_id`、`created_by`、`payload` | 当前草案 `id bigint`；大规模分区时建议主键包含 `occurred_at`，如 `(occurred_at, id)` | `txn_no`；`idempotency_key`；必要时 `source_type + source_id + source_line_id + txn_type` 防重复 | 详见库存专项章节 | 是，库存历史事实主真源 | 不允许软删除，不允许物理改历史事实；错误用冲正流水 | 可由 `business_records`、未来采购 / 生产 / 出货专表触发；`source_type/source_id/source_line_id` 保存来源，不把通用快照当库存事实 | P1，库存专表核心 |
| `inventory_balances` | 当前库存余额 / 查询加速表，按物料或成品、仓库、库位、批次聚合当前可用量和预留量 | `item_type`、`material_id`、`product_id`、`warehouse_id`、`location_id`、`lot_id`、`unit_id`、`qty_on_hand numeric`、`qty_reserved numeric`、`qty_available numeric`、`last_txn_id`、`last_txn_occurred_at`、`version`、`updated_at` | `id bigint` | `item_type + item_id + warehouse_id + location_id + lot_id + unit_id`，`lot_id` 为空时需用 `NULLS NOT DISTINCT` 或显式默认批次 | `item_type + item_id`；`warehouse_id + location_id`；`qty_available` partial | 是，当前余额事实 / 可重算加速表 | 不允许软删除；余额为 0 也可保留或归档，但不能手工删改掩盖流水 | 余额来自专表流水，通用库存记录只能作为旧数据回补线索 | P1，库存查询核心 |
| `stock_reservations` | 库存预留 / 占用，支持出货、生产领料、委外发料前锁定库存 | `reservation_no`、`status`、`item_type`、`material_id`、`product_id`、`warehouse_id`、`location_id`、`lot_id`、`unit_id`、`reserved_qty numeric`、`source_type`、`source_id`、`source_line_id`、`idempotency_key`、`expires_at`、`released_at`、`payload` | `id bigint` | `reservation_no`；`idempotency_key`；可选 active 范围内 `source_type + source_id + source_line_id + item/location/lot` | `status`；`source_type + source_id`；`item_type + item_id`；`expires_at` | 是，库存占用事实 | 不允许物理删除；取消 / 释放 / 过期走状态和释放流水 | 可由通用出货 / 生产任务先触发，后续迁到订单 / 领料 / 出货专表来源 | P2，出货和领料扣减前推进 |

说明：

- `item_type + item_id` 是草案表达方式。落 Ent schema 前需要在“强外键”和“统一库存对象表”之间二选一：要么 `material_id/product_id` 二选一并加 check，要么引入轻量 `inventory_items` 统一身份表。本轮不新增 `inventory_items`，避免扩大范围。
- 数量、用量、损耗、单价和金额类字段不应继续使用 `float/double precision`。库存和 BOM 数量建议使用 PostgreSQL `numeric/decimal`，Go 层再评估 decimal 类型或 Ent 自定义 schema type。

## 4. `inventory_txns` 重点评审

`inventory_txns` 是库存事实流水。它的核心规则是追加、幂等、可追溯、可冲正。

| 主题 | 推荐规则 |
| --- | --- |
| 历史不可改 | 已生效库存流水不允许物理修改或删除。发现错误时新增冲正流水，`reversal_of_txn_id` 指向原流水，并用相反方向或相反符号数量抵消。 |
| 幂等写入 | 每个库存动作必须有稳定 `idempotency_key`。同一前端重复点击、移动端重试、后端重放或批处理重跑，只能得到同一条库存影响。 |
| 来源追溯 | 必须保存 `source_type`、`source_id`、`source_line_id`。兼容期 `source_type` 可以是 `business_record` 或当前模块 key；专表落地后逐步迁为 `purchase_order`、`production_order`、`outbound_order` 等。 |
| 行级粒度 | `source_line_id` 应指向真实业务来源行。兼容期可指向 `business_record_items.id`；如果来源没有行 ID，写入前应生成稳定来源行 key，不要用空值绕过幂等。 |
| 数量类型 | `quantity` 使用 `numeric(20,6)` 或按单位精度确定的 decimal，不使用 `float`。需要同时约束 `quantity > 0`，由 `direction` 或 `signed_quantity` 表达增减；不要混用两套语义。 |
| 时间语义 | `occurred_at` 表示业务发生时间，用于库存期间归属和分区；`created_at` 表示系统写入时间；不能用创建时间替代发生时间。 |
| 转移语义 | 跨仓 / 跨库位转移建议写两条流水：来源出库一条、目标入库一条，并用同一个 `transfer_group_key` 关联。这样余额校验更直接。 |
| 成本字段 | 可预留 `unit_cost`、`amount`，但成本核算未稳定前不要让它成为财务真源；财务核销后续专表再收口。 |
| payload 边界 | `payload` 只保存扩展和来源摘要，不保存决定库存数量的唯一字段。决定数量、物料、仓库、批次的字段必须结构化。 |

### 4.1 建议字段

| 字段 | 建议类型 | 说明 |
| --- | --- | --- |
| `id` | `bigint` | 单表阶段可作主键；分区阶段需评估 `(occurred_at, id)` 复合主键。 |
| `txn_no` | `varchar(64)` | 人可读流水号，可按月分段生成。 |
| `occurred_at` | `timestamptz` | 业务发生时间，未来分区键候选。 |
| `item_type` | `varchar(16)` | `material` 或 `product`，后续如需半成品再扩展。 |
| `material_id` / `product_id` | `bigint` | 二选一，配合 check 约束保证身份清晰。 |
| `warehouse_id` / `location_id` / `lot_id` | `bigint` | 仓库、库位、批次维度；`location_id` 可先指向默认库位。 |
| `txn_type` | `varchar(32)` | `purchase_inbound`、`outsource_issue`、`outsource_return`、`production_issue`、`finished_goods_inbound`、`shipment_outbound`、`adjustment`、`transfer_in`、`transfer_out`、`reservation_release` 等。 |
| `direction` | `varchar(8)` | `in`、`out`、`adjust`。推荐业务写入时统一正数量 + 方向，查询时派生 signed quantity。 |
| `quantity` | `numeric(20,6)` | 不使用 `float`；精度后续可按单位类型细化。 |
| `unit_id` | `bigint` | 指向 `units`；禁止只保存单位文本。 |
| `source_type` / `source_id` / `source_line_id` | `varchar(64)` / `bigint` / `bigint` | 来源单据或任务行追溯。 |
| `idempotency_key` | `varchar(128)` | 库存写入幂等键，建议非空。 |
| `reversal_of_txn_id` | `bigint` | 冲正原流水。 |
| `transfer_group_key` | `varchar(128)` | 转移出入两条流水的关联键。 |
| `created_by` / `created_at` | `bigint` / `timestamptz` | 审计字段。 |
| `payload` | `jsonb` | 保存来源摘要、导入批次、调试标记等非关键结构化扩展。 |

### 4.2 PostgreSQL 索引建议

| 目标 | 索引建议 | 说明 |
| --- | --- | --- |
| 防重复写入 | `UNIQUE (idempotency_key)` | 推荐应用层所有库存写入都传入非空幂等键。 |
| 来源追溯 | `INDEX (source_type, source_id, source_line_id)` | 支持从通用单据、未来采购 / 生产 / 出货专表反查库存影响。 |
| 单品库存流水查询 | `INDEX (item_type, material_id, warehouse_id, location_id, lot_id, occurred_at DESC)` 和 `INDEX (item_type, product_id, warehouse_id, location_id, lot_id, occurred_at DESC)` | 如果采用 `material_id/product_id` 二选一，建议分别建 partial index：`WHERE material_id IS NOT NULL`、`WHERE product_id IS NOT NULL`。 |
| 时间范围审计 | `INDEX (occurred_at DESC, id DESC)` | 支持最近流水和期间查询。 |
| 大历史扫描 | `BRIN (occurred_at)` | 十亿级历史流水下，BRIN 适合按时间范围粗过滤。 |
| 冲正追踪 | `INDEX (reversal_of_txn_id) WHERE reversal_of_txn_id IS NOT NULL` | 快速查原流水是否被冲正。 |
| 转移成组查询 | `INDEX (transfer_group_key) WHERE transfer_group_key IS NOT NULL` | 支持转移出入两边对账。 |

### 4.3 分区建议

| 数据规模 | 建议 |
| --- | --- |
| 初期 / 验证期 | 可先用普通表，但字段和索引必须按分区可迁移方式设计，避免后续重写业务语义。 |
| 亿级以上 | 按 `occurred_at` 做月分区或季度分区；毛绒工厂库存流水如果写入频率和历史查询都高，优先月分区。 |
| 十亿到几十亿级 | 月分区更利于冷热数据归档、局部索引维护和批量校验；如果单月数据仍过大，再评估按 `warehouse_id` 或 hash 子分区。 |
| 分区主键 | PostgreSQL 分区表的唯一约束通常需要包含分区键。落表前必须决定主键是否使用 `(occurred_at, id)`，避免 Ent 默认单列 `id` 与分区唯一约束冲突。 |
| 归档策略 | 冷分区只读化，保留本地索引；历史报表走分区裁剪，不把老流水汇总进不可追溯的黑箱表。 |

## 5. `inventory_balances` 重点评审

`inventory_balances` 是当前余额和查询加速表，但不是历史事实唯一来源。它必须能由 `inventory_txns` 重新计算和校验。

| 主题 | 推荐规则 |
| --- | --- |
| 派生但强约束 | 余额表是当前库存查询真源，但历史事实真源是流水。任何余额都必须能追溯到 `inventory_txns`。 |
| 同事务更新 | 写入库存流水时，在同一个数据库事务内更新对应余额行，避免流水成功但余额未更新。 |
| 并发控制 | 按余额维度行锁或乐观版本 `version` 更新；同一物料 / 成品 + 仓库 + 库位 + 批次并发扣减必须串行化。 |
| 不手工改数 | 禁止直接修改 `qty_on_hand` 修库存。盘点差异、纠错、报废和损耗都要写 `inventory_txns`，再派生余额。 |
| 可重算校验 | 提供定期校验脚本：按 `item/location/lot` 聚合流水，与余额表比对差异，输出差异而不是自动吞掉。 |
| 预留关系 | `qty_reserved` 来自 `stock_reservations`；`qty_available = qty_on_hand - qty_reserved` 可存储也可生成，但必须有一致性校验。 |

### 5.1 建议字段

| 字段 | 建议类型 | 说明 |
| --- | --- | --- |
| `id` | `bigint` | 余额行 ID。 |
| `item_type`、`material_id`、`product_id` | `varchar(16)`、`bigint`、`bigint` | 与流水保持同一库存对象维度。 |
| `warehouse_id`、`location_id`、`lot_id` | `bigint` | 与流水维度一致。 |
| `unit_id` | `bigint` | 余额单位。跨单位换算必须先统一到库存基本单位。 |
| `qty_on_hand` | `numeric(20,6)` | 账面现存量。 |
| `qty_reserved` | `numeric(20,6)` | 已预留未释放量。 |
| `qty_available` | `numeric(20,6)` | 可用量，可存储并通过约束 / 应用校验，也可由查询生成。 |
| `last_txn_id` | `bigint` | 最近影响该余额的库存流水。 |
| `last_txn_occurred_at` | `timestamptz` | 最近业务发生时间。 |
| `version` | `bigint` | 并发控制。 |
| `updated_at` | `timestamptz` | 系统更新时间。 |

### 5.2 PostgreSQL 索引建议

| 目标 | 索引建议 | 说明 |
| --- | --- | --- |
| 余额唯一维度 | `UNIQUE (item_type, material_id, product_id, warehouse_id, location_id, lot_id, unit_id)` | 如果 `lot_id` 或二选一 ID 允许空值，应使用 `NULLS NOT DISTINCT` 或显式默认批次 / 默认对象列，避免重复余额行。 |
| 单品查总库存 | `INDEX (item_type, material_id)`、`INDEX (item_type, product_id)` | 分别对材料和成品建 partial index 更清晰。 |
| 仓库查库存 | `INDEX (warehouse_id, location_id)` | 支持仓库盘点、库位列表和移动端查询。 |
| 可用库存筛选 | `INDEX (item_type, material_id, qty_available) WHERE qty_available > 0` 和产品对应 partial index | 支持发料、出货和预留选择可用库存。 |
| 最近变动 | `INDEX (last_txn_occurred_at DESC)` | 支持库存异常排查和最近变动看板。 |

### 5.3 校验策略

| 校验 | 建议 |
| --- | --- |
| 流水聚合对余额 | 按 `item_type + item_id + warehouse_id + location_id + lot_id + unit_id` 聚合已生效流水，比较 `qty_on_hand`。 |
| 预留对余额 | 按 active `stock_reservations` 聚合，比较 `qty_reserved`。 |
| 负库存 | 默认禁止出库后 `qty_available < 0`；是否允许负库存必须是仓库级配置，不要在单次出库里临时放开。 |
| 冲正校验 | 原流水和冲正流水要能成对查出；冲正后余额由两条流水自然抵消。 |
| 分区校验 | 历史分区按月 / 季度批量校验，当前热分区按日或按小时增量校验。 |

## 6. 为什么本轮不拆完整 ERP

| 候选范围 | 本轮不拆的原因 |
| --- | --- |
| `purchase_order / purchase_order_items` | 材料、辅料、包材采购字段真源仍在收口；采购来源可能来自 BOM 汇总、辅包材表、手工采购和委外补料，不宜先建窄表再反复迁移。 |
| `production_order / production_task` | 当前生产排单、委外、返工、异常、成品入库之间还有前端 v1 编排和业务状态快照，先拆生产全套会同时牵动 workflow、移动端、Dashboard 和库存。 |
| `outsource_order / outsource_issue / outsource_return` | 委外合同、回货、检验、返工和应付之间仍缺稳定字段和样本；应先让库存发料 / 回货事实有专表承接，再拆委外单据。 |
| `quality_inspection / defect_record` | 品质 v1 当前能通过任务和 payload 跑通 IQC、回货检验、成品抽检；正式质检专表应等检验项目、缺陷分类和放行口径稳定后再落。 |
| `finance / ar / ap / settlement` 全套 | 当前财务 v1 明确不做总账、凭证和复杂成本；应收、应付、开票、对账还缺正式单据样本和核销口径。本轮只设计库存与主数据，不把财务复杂度提前引入。 |

本阶段真正的瓶颈是库存事实和库存查询：材料、成品、BOM、仓库、批次、流水和余额是后续采购、委外、生产、品质、出货、财务都要引用的底座。先把底座做窄、做稳，比一次性拆完整 ERP 更符合当前复杂度预算。

## 7. 分阶段落地路线

| 阶段 | 目标 | 关键动作 | 不做什么 | 验收重点 |
| --- | --- | --- | --- | --- |
| Phase 0：保持现有通用表 | 继续让 v1 流程、任务、帮助中心、打印和 debug seed / cleanup 运行在通用表上 | 不改 Ent schema；继续使用 `business_records / workflow` | 不写专表，不迁移 `source_type/source_id` | 现有业务链路不受影响。 |
| Phase 1：字段真源评审 | 明确材料、成品、BOM、仓库、库存维度、单位精度、批次、来源行和幂等键 | 输出字段字典、状态口径、decimal scale、来源映射和旧数据回补策略 | 不生成 migration，不改运行时代码 | 每个字段有唯一真源、缺值回补和残值清理策略。 |
| Phase 2：落核心表 | 先落 `units`、`product_styles`、`products`、`materials`、`bom_headers`、`bom_items`、`warehouses`、`inventory_txns`、`inventory_balances` | 使用 Ent + Atlas 生成迁移；库存数量使用 numeric/decimal；先支持默认库位 / 默认批次 | 不拆完整采购、委外、生产、品质、财务 | 专表能承接材料 / 成品 / BOM 和最小库存流水 / 余额闭环。 |
| Phase 3：后端 usecase 双写或只读校验 | 在后端统一入口内写专表，或先根据通用记录只读校验专表计算结果 | 同事务写库存流水和余额；保留通用记录写入；补幂等测试 | 不让前端分别写两套事实 | 重复点击不会重复入库 / 出库，流水与余额一致。 |
| Phase 4：库存查询和报表切换到专表 | 库存列表、库存余额、库存流水、仓库移动端查询改读专表 | 报表按专表读；通用快照只用于单据详情和历史兼容 | 不删除 `business_records` | 查询性能、余额准确性和历史追溯通过校验。 |
| Phase 5：再拆采购、委外、生产、品质、财务 | 在库存底座稳定后，逐步拆采购单、委外单、生产单、质检单、AR/AP/结算表 | 每次只拆一条强事实链路；同步迁移 workflow source | 不一次性重写全部 ERP | 每个新专表有明确来源、幂等、回补、兼容和回滚策略。 |

下一轮如果要落 Ent schema，建议先从 `materials`、`products`、`warehouses`、`inventory_txns`、`inventory_balances` 开始；`units` 实际上应作为库存数量落表前的前置小表同步处理。

## 8. 迁移风险

| 风险 | 影响 | 建议控制 |
| --- | --- | --- |
| 前端通用 `business_records` 依赖 | 桌面业务页、弹窗、列表、Dashboard、帮助中心、打印入口和移动端任务详情都依赖当前通用记录结构 | 专表落地后保留通用记录写入和读取；先只把库存查询切专表，不直接替换所有业务详情。 |
| workflow `source_type/source_id` 迁移 | 当前任务和业务状态通常指向通用单据。直接改指向会影响移动端跳转、任务列表、状态回显和 debug 数据清理 | 兼容期允许 workflow 继续指向 `business_records`；专表 ID 先放 payload 或映射表，等单链路稳定后再迁 source。 |
| 旧数据回补 | 老 `business_records/items` 里有快照字段、payload 字段和 `float` 数量，缺少强主档 ID、批次、库位和幂等键 | 回补只能按既定口径补真实存在的字段；缺主档 ID 时建立待确认清单，不伪造材料 / 成品 / 批次。 |
| 调试 seed / cleanup 兼容 | debug seed 当前创建通用记录、任务和业务状态；cleanup 根据 debugRunId 和 DBG 前缀清理 | 专表双写阶段的 debug 数据必须也带 debugRunId 和来源标记；cleanup 才能安全清理或归档。 |
| 打印模板取值兼容 | 采购合同、加工合同和后续模板当前从通用单据快照取值 | 专表不反向覆盖历史打印快照；打印优先使用单据快照，必要时只从专表补缺值并标明口径。 |
| 移动端任务详情跳转兼容 | 移动端按任务来源打开业务详情，若来源变成专表会找不到旧详情入口 | 保留 `source_type=business_record` 的旧路径；新专表来源需要统一详情解析器，支持从专表回到通用单据快照。 |
| 数量精度迁移 | 当前通用表数量和金额是 `double precision`，专表使用 decimal 后可能出现历史值四舍五入差异 | 定义单位精度和导入 rounding 规则；回补差异进入校验报告，不直接静默改数。 |
| 分区与 Ent 默认主键 | 大规模流水需要按 `occurred_at` 分区，但 Ent 默认单列 ID 与 PostgreSQL 分区唯一约束可能冲突 | Phase 1 就决定分区 DDL 策略；必要时为 `inventory_txns` 编写受控 Atlas migration，而不是让默认生成结果决定表形。 |

## 9. 推荐落地边界

| 决策 | 推荐 |
| --- | --- |
| 是否删除或替代 `business_records` | 不删除，不替代。当前它仍是 v1 通用单据快照、兼容层、打印取值和调试验收基础。 |
| 专表落地后 `business_records` 的角色 | 保留为单据快照和历史兼容层；可以记录专表 ID、来源摘要和打印快照，但不再承担库存和财务事实真源。 |
| 库存事实真源 | 最终以 `inventory_txns` 为历史事实主真源，错误通过冲正；`inventory_balances` 是当前余额 / 查询加速表，必须能由流水校验。 |
| 财务事实真源 | 后续应以 AR/AP/发票/核销专表为真源；当前不在本轮落表，避免库存底座未稳时提前扩大范围。 |
| 本轮是否改 schema / migration / 运行时代码 | 不改 Ent schema，不生成 migration，不改运行时代码。本文档只作为下一阶段 schema 评审草案。 |
