# 毛绒 ERP 数据模型与导入映射

## 当前数据库状态

当前数据库 `192.168.0.106:5432/plush_erp` 已执行基线迁移，但当前正式真源仍只有两张基线表：

- `admin_users`
- `users`

对应 schema 真源：

- `/Users/simon/projects/plush-toy-erp/server/internal/data/model/schema/admin_user.go`
- `/Users/simon/projects/plush-toy-erp/server/internal/data/model/schema/user.go`

当前这些表只够支撑账号与后台权限体系，不能误当成毛绒 ERP 业务模型。

## 为什么不能照搬旧外贸模型

不能照搬旧外贸 ERP 模型的原因不是“名字不同”，而是当前真实资料已经明确展示出完全不同的单据关系和字段层次：

1. 旧外贸主线是报价、外销、出运、结汇；毛绒工厂当前真源主线是款式、材料、加工合同、生产、仓库、结算。
2. 当前毛绒资料至少同时出现 `客户 / 订单编号`、`产品订单编号`、`款式编号`、`产品编号 / SKU` 四层编码；外贸模型里这几层并不是同一套关系。
3. 材料真源不是报价行，而是 `材料分析明细表 + 汇总表 + 色卡 + 作业指导书` 组合。
4. 加工合同 PDF 同时承担业务单据、打印快照、条款快照和附件图样，不是简单“采购订单”替代物。
5. 包装材料存在独立支线，不是主流程中的备注字段。

因此本轮选择：

- 先收口文档、字段真源、桌面角色化和多移动端入口
- 暂不把未确认字段硬落 Ent schema
- 正式建表只在字段层级稳定后推进

## 字段真源对照表

| 字段 | 当前真实来源 | 原始字段 / 位置 | 主数据 or 快照 | 目标模块 / 表 | 稳定度 | 说明 |
| --- | --- | --- | --- | --- | --- | --- |
| 客户 | 生产订单总表截图 | `客户` | 业务快照 | `order_header.customer_snapshot`，后续关联 `partner` | 中 | 当前只有简称 / 代号，还不足以直接固化主档编码。 |
| 款式编号 | 两份材料分析明细表 | `产品编号`（26029# / 26204#） | 主数据候选 | `style.style_no` / `bom_header.style_no_snapshot` | 高 | 当前最像款式主档编号。 |
| 产品编号 / SKU | 加工合同 PDF、生产订单总表截图 | `产品编号`（24594 / 25481 等） | 业务快照 | `order_line.product_no_snapshot` / `processing_contract_line.product_no_snapshot` | 中 | 不能与款式编号混用。 |
| 产品订单编号 | 材料 Excel、加工合同 PDF、加工汇总表、生产订单总表截图 | `订单编号` / `产品订单编号` / `客户订单号` | 业务快照 | `order_header.external_order_no` / `order_line.order_line_no` | 低 | 当前命名混乱，需要更多样本确认层级。 |
| 产品名称 | 材料 Excel、加工合同 PDF、生产订单总表截图 | `产品名称` | 主数据 + 快照并存 | `style.style_name` + 各业务表 `name_snapshot` | 中 | 存在整款、颜色款、部件名三层。 |
| 颜色 | 26204 材料分析表、生产订单总表截图 | `颜色` / `本色` | 业务快照 | `style_variant.color_name` / `order_line.color_snapshot` | 中 | 部分文件把颜色写进名称。 |
| 数量 | 材料 Excel、加工合同、加工汇总表、生产订单总表截图 | `数量` / `委托加工数量` / `订单数量` / `生产数量` | 业务字段 | `order_qty`、`contract_qty`、`planned_qty`、`unshipped_qty` | 高 | 必须拆字段，不保留单一 `qty`。 |
| 损耗 | 材料分析明细表 | `损耗%` / 标题里的 `含损耗10%` | BOM 字段 | `bom_line.loss_rate` / `loss_rule_snapshot` | 中 | 模板存在固定损耗与独立列两种格式。 |
| 单价 | 加工合同、加工汇总表、辅包材采购表、生产订单总表截图 | `单价` | 业务字段 | `processing_unit_price` / `material_unit_price` / `order_unit_price` | 中 | 至少三种语义，不能共用一个裸字段。 |
| 加工费 | 加工合同 PDF、加工汇总表 | `委托加工金额` / `加工金额` | 合同 / 结算快照 | `processing_contract_line.amount_snapshot` / `settlement_line.amount` | 高 | 金额快照必须保留。 |
| 主料 | 材料分析明细表 / 汇总表 | `物料名称`、`厂商料号`、`规格`、`组装部位`、`总用量` | 主数据 + BOM + 采购派生 | `material` / `bom_line` / `material_purchase_snapshot` | 高 | 当前首批最稳定的业务真源之一。 |
| 辅材 / 包材 | 辅材、包材采购表 | `材料品名`、`厂商料号`、`规格`、`采购数量` | 采购快照 | `material`(category) / `purchase_snapshot` | 中 | 原模板列名不稳定，需清洗规则。 |
| 交期 / 回货日期 | 加工合同 PDF | `回货日期` | 业务字段 | `processing_contract.promised_return_date` | 中 | 是加工回货时间，不是客户出货日期。 |
| 出货日期 | 生产订单总表截图 | `出货日期` | 业务快照 | `order_line.ship_date_snapshot` / `shipment_plan` | 中 | 缺少正式出货单样本。 |
| 图片 / 附件 | 加工合同 PDF、材料汇总 / 作业指导书、生产订单截图 | 合同页图样 / Excel 内嵌图片 / `图片`列 | 附件快照 | `attachment` | 中 | 需要单独 attachment 表，不应塞主表。 |
| 备注 | 合同、材料 Excel、辅包材采购表、生产订单截图 | `备注` | 业务快照 | 各业务表 `remark` | 高 | 备注必须按单据类型分别保存。 |
| 结算相关金额 | 合同、加工汇总、辅包材采购表 | `委托加工金额` / 金额公式列 | 结算快照 | `settlement` | 中 | 还缺正式对账单样本。 |

## 首批正式业务表建议

### 建模原则

- 先把主档、业务表、快照表分开
- 先区分主数据字段和打印 / 导入快照字段
- 不在字段还不稳定时直接建“万能 JSON 表”
- 编号体系先保留多字段，不抢着归并

### 表建议总览

| 表 | 为什么需要 | 本轮是否建表 | 主要字段 | 编号 / 唯一键口径 | 真源字段 | 快照字段 |
| --- | --- | --- | --- | --- | --- | --- |
| `erp_partners` | 承接客户、加工厂、辅包材供应商 | 暂不建 | `partner_type`、`name`、`short_name`、`contact_name`、`contact_phone`、`address` | 建议 `partner_code` + `partner_type`，但当前客户主档编码未稳定 | 加工商资料、合同头、订单截图 | 合同联系人、合同地址、供应商快照 |
| `erp_styles` | 承接款式主档 | 暂不建 | `style_no`、`style_name`、`designer_name`、`default_color` | `style_no` 唯一 | 材料明细表里的 `26029# / 26204#` | 订单 / 合同名称快照 |
| `erp_materials` | 主料 / 辅材 / 包材统一物料主档 | 暂不建 | `material_name`、`supplier_item_no`、`spec`、`unit`、`material_category` | 建议 `material_name + spec + supplier_item_no` 去重，仍需更多样本 | 两份材料 Excel、辅包材采购表 | 采购快照里的供应商名称 |
| `erp_bom_headers` | 款式 BOM 版本头 | 暂不建 | `style_id`、`version_no`、`order_no_snapshot`、`designer_name_snapshot` | `style_id + version_no` | 材料明细表表头 | 订单编号、日期、备注 |
| `erp_bom_lines` | BOM 明细行 | 暂不建 | `bom_header_id`、`material_id`、`assembly_part`、`unit_usage`、`loss_rate`、`total_usage_snapshot`、`process_note` | `bom_header_id + line_no` | 材料分析明细表 | 备注、加工方式、共享纸样备注 |
| `erp_processing_contract_headers` | 加工合同头 | 暂不建 | `contract_no`、`partner_id`、`client_name_snapshot`、`placed_date_raw`、`promised_return_date`、`settlement_terms_snapshot` | `contract_no` | 合同 PDF | 委托单位、委托人、联系方式、签署图样 |
| `erp_processing_contract_lines` | 加工合同明细 | 暂不建 | `contract_header_id`、`product_order_no_snapshot`、`product_no_snapshot`、`product_name_snapshot`、`process_name`、`process_type`、`unit`、`unit_price_snapshot`、`qty`、`amount_snapshot` | `contract_header_id + line_no` | 合同 PDF、加工汇总表 | 备注、工厂名称快照 |
| `erp_production_orders` | 生产 / 排单头 | 暂不建 | `order_no_snapshot`、`client_code_snapshot`、`ship_date_snapshot`、`business_owner_name_snapshot`、`category_snapshot` | 当前编号体系未稳定 | 生产订单总表截图 | 颜色、图片、备注 |
| `erp_production_progress_logs` | 进度、延期、返工、异常日志 | 暂不建 | `production_order_id`、`event_type`、`progress_status`、`reason`、`occurred_at`、`reported_by` | `production_order_id + event_no` | 正式汇报 PDF 第 7 页信息结构 | 返工 / 异常备注 |
| `erp_inventory_moves` | 收发 / 入库 / 待出货 | 暂不建 | `move_type`、`material_or_goods_type`、`related_order_id`、`qty`、`warehouse_status` | `move_no` | 正式汇报 PDF 第 4 页流程图 | IQC 结果、出货备注 |
| `erp_settlements` | 加工费、辅材 / 包材费用结算入口 | 暂不建 | `settlement_type`、`partner_id`、`period`、`amount_snapshot`、`status` | `settlement_no` | 合同结算条款、金额类 Excel | 对账说明、付款说明 |
| `erp_attachments` | 合同图样、色卡、作业指导书、内嵌图 | 可以先建，但本轮暂不落库 | `biz_type`、`biz_id`、`file_name`、`file_kind`、`source_path`、`mime_type` | `attachment_id` | PDF / Excel / 图片原件 | 页面展示标题、排序 |

## 为什么当前仍然不开始建表

本轮没有开始改 Ent schema，原因不是“不做”，而是以下几个关键字段仍然不稳定：

1. `订单编号 / 产品订单编号 / 客户订单号 / 产品编号 / 款式编号` 的层级关系还没有收稳。
2. `产品名称 / 款式名称 / 部件名称 / 颜色款名称` 仍然混在不同原件里。
3. `partner` 主档还缺客户主档样本和稳定编码规则。
4. `settlement` 还缺正式对账单 / 结算单样本。
5. `attachment` 虽然结构上已经明确，但当前业务表主键都还没稳定，先落库只会制造残值风险。

因此本轮决定：

- 先停在文档、前端角色页和导入映射设计
- 等更多样本确认编号关系后，再决定是否落 Ent schema

## Excel 导入映射草案

### 1. `26029#夜樱烬色才料明细表2026-1-19.xlsx`

#### Sheet: `材料分析明细表`

| 原始表头 | 标准字段名 | 目标表 | 清洗规则 | 必填 / 选填 | 冲突点 / 待确认 |
| --- | --- | --- | --- | --- | --- |
| `产品编号`（B3） | `style_no` | `erp_styles` / `erp_bom_headers` | 保留 `#` 后缀原值 | 必填 | 当前确认这是款式编号，不是 SKU |
| `订单编号`（D3） | `order_no_snapshot` | `erp_bom_headers` | 原样保留 | 必填 | 与产品订单编号关系未完全确认 |
| `数量`（G3） | `order_qty_snapshot` | `erp_bom_headers` | 数值化 | 必填 | 仅为当前样本订单数量 |
| `产品名称`（B4） | `style_name_snapshot` | `erp_bom_headers` | trim | 必填 | 可能是款式名而非最终销售名 |
| `日 期`（G4） | `source_date` | `erp_bom_headers` | 转 ISO 日期 | 选填 | 可作为版本日期候选 |
| `设计师`（H4） | `designer_name` | `erp_styles` / `erp_bom_headers` | 去掉 `设计师：` 前缀 | 选填 | 设计师是否归 style 主档待确认 |
| `物料名称` | `material_name` | `erp_materials` | 合并上方空白继承 | 必填 | 同一物料跨多行组装部位 |
| `厂商料号` | `supplier_item_no` | `erp_materials` | 合并继承 | 选填 | 部分物料为空 |
| `规格` | `spec` | `erp_materials` | 合并继承 | 选填 | 单位与规格需分开保留 |
| `单位` | `unit` | `erp_materials` | 合并继承 | 必填 | 有 `Y / PCS / 套` 等 |
| `组装部位` | `assembly_part` | `erp_bom_lines` | 原样保留 | 必填 | 需要保留多行拆分 |
| `单位用量` | `unit_usage` | `erp_bom_lines` | 数值化 | 必填 | 精度较高，需保留 decimal |
| `总用量含损耗10％` | `total_usage_snapshot` | `erp_bom_lines` | 优先读取缓存值 | 必填 | 损耗 10% 写在标题而不是独立列 |
| `加工程序` | `process_note` | `erp_bom_lines` | 原样保留 | 选填 | 当前列有激光等工序 |
| `备注` | `remark` | `erp_bom_lines` | 原样保留 | 选填 | 含缩褶、布底对贴等工艺备注 |

#### Sheet: `材料分析汇总表-修改`

| 原始表头 | 标准字段名 | 目标表 | 清洗规则 | 必填 / 选填 | 冲突点 / 待确认 |
| --- | --- | --- | --- | --- | --- |
| `订单编号` | `order_no_snapshot` | `material_purchase_snapshot` | 取缓存值 | 必填 | 派生自明细表，不是主真源 |
| `产品编号` | `style_no_snapshot` | `material_purchase_snapshot` | 取缓存值 | 必填 | 与 style_no 对齐 |
| `材料品名` | `material_name_snapshot` | `material_purchase_snapshot` | 原样保留 | 必填 | 仅作采购汇总展示 |
| `厂商料号` | `supplier_item_no_snapshot` | `material_purchase_snapshot` | 原样保留 | 选填 | 依赖主料明细继承 |
| `规格` | `spec_snapshot` | `material_purchase_snapshot` | 原样保留 | 选填 |  |
| `单位` | `unit_snapshot` | `material_purchase_snapshot` | 原样保留 | 必填 |  |
| `采购数量` | `purchase_qty_snapshot` | `material_purchase_snapshot` | 优先缓存值 | 必填 | 汇总表是采购派生层 |

### 2. `26204#抱抱猴子材料明细表2026-4-10.xlsx`

#### Sheet: `材料分析明细表-1`

| 原始表头 | 标准字段名 | 目标表 | 清洗规则 | 必填 / 选填 | 冲突点 / 待确认 |
| --- | --- | --- | --- | --- | --- |
| `产品编号`（C3） | `style_no` | `erp_styles` / `erp_bom_headers` | 原样保留 | 必填 | 当前与 26029 模板位置不同 |
| `订单编号`（F3） | `order_no_snapshot` | `erp_bom_headers` | 原样保留 | 必填 |  |
| `数量(PCS)`（K3） | `order_qty_snapshot` | `erp_bom_headers` | 数值化 | 必填 |  |
| `含备品30`（L3） | `spare_qty_snapshot` | `erp_bom_headers` | 提取数字 30 | 选填 | 26029 模板用文本挂在数量后 |
| `材料类别` | `material_category` | `erp_materials` / `erp_bom_lines` | 合并继承空白 | 选填 | 当前样本很多空白，需继续确认模板稳定性 |
| `颜色` | `color_snapshot` | `erp_bom_lines` / `style_variant` | 原样保留 | 选填 | 多数行为空 |
| `片数` | `piece_count` | `erp_bom_lines` | 数值化 | 选填 | 当前样本为空值较多 |
| `损耗%` | `loss_rate` | `erp_bom_lines` | 百分比数值化 | 选填 | 与 26029 模板不同 |
| `总用量含损耗` | `total_usage_snapshot` | `erp_bom_lines` | 优先缓存值 | 必填 |  |
| `加工方式`（两列） | `process_prepare_note` / `process_type` | `erp_bom_lines` | 左列视为前处理，右列视为工序类型 | 选填 | 当前模板出现双 `加工方式` 列，需导入时按列序区分 |
| `备注` | `remark` | `erp_bom_lines` | 原样保留 | 选填 | 有共享纸样 / 色卡说明 |

#### Sheet: `汇总表`

映射原则与 `26029` 的汇总表一致，新增注意点：

- `产品型号` 当前样本里出现 `-1`，是否作为 variant 后缀还需更多样本确认
- 采购数量继续视为派生字段，不反向覆盖 BOM 明细真源

### 3. `加工 成慧怡.xlsx`

#### Sheet: `委外加工汇总表`

| 原始表头 | 标准字段名 | 目标表 | 清洗规则 | 必填 / 选填 | 冲突点 / 待确认 |
| --- | --- | --- | --- | --- | --- |
| `委外加工订单号` | `processing_order_no` | `erp_processing_contract_headers` / import staging | 原样保留 | 必填 | 当前样本列 A 为空，真实值在列 B，需要按列位置导入 |
| `产品订单编号` | `product_order_no_snapshot` | `erp_processing_contract_lines` | 原样保留 | 必填 | 与订单编号层级仍待确认 |
| `产品编号` | `product_no_snapshot` | `erp_processing_contract_lines` | 原样保留 | 必填 | 当前是 SKU / 产品号，不是 style_no |
| `产品名称` | `product_name_snapshot` | `erp_processing_contract_lines` | trim | 必填 |  |
| `加工项目` | `process_name` | `erp_processing_contract_lines` | 原样保留 | 必填 | 如 `脸*1`、`后头*2` |
| `厂家名称` | `vendor_name_snapshot` | `erp_processing_contract_headers` / `erp_partners` | trim | 必填 | 需后续和 partner 主档对齐 |
| `工序类别` | `process_type` | `erp_processing_contract_lines` | trim | 必填 | 如 `电绣`、`激光` |
| `单位` | `unit` | `erp_processing_contract_lines` | trim | 必填 | `PCS / 对 / 套 / 片` |
| `单价` | `processing_unit_price` | `erp_processing_contract_lines` | decimal | 必填 |  |
| `数量` | `qty` | `erp_processing_contract_lines` | integer / decimal | 必填 |  |
| `加工金额` | `amount_snapshot` | `erp_processing_contract_lines` | 优先缓存值 | 必填 | 当前为公式列 |
| `备注` | `remark` | `erp_processing_contract_lines` | 原样保留 | 选填 | 有老单价说明 |
| `下单人` | `ordered_by_snapshot` | `erp_processing_contract_headers` | trim | 选填 |  |
| `联系电话` | `ordered_by_phone_snapshot` | `erp_processing_contract_headers` | 清洗手机号格式 | 选填 |  |

#### Sheet: `加工厂商资料`

| 原始表头 | 标准字段名 | 目标表 | 清洗规则 | 必填 / 选填 | 冲突点 / 待确认 |
| --- | --- | --- | --- | --- | --- |
| `厂家简称` | `partner_short_name` | `erp_partners` | 若为公式则取缓存值 | 选填 | 当前多行为 `=C3` 这类公式 |
| `厂家全称` | `partner_name` | `erp_partners` | trim | 必填 |  |
| `加工工序` | `partner_process_scope` | `erp_partners` | trim | 选填 |  |
| `联系人` | `contact_name` | `erp_partners` | trim | 选填 |  |
| `联系电话` | `contact_phone` | `erp_partners` | 规范化手机号 | 选填 |  |
| `开票类型` / `开票点数` | `invoice_type` / `invoice_rate` | `erp_partners` | 原样保留 | 选填 | 当前样本缺值较多 |
| `加工商地址` | `address` | `erp_partners` | trim | 选填 |  |
| `银行卡号` | `bank_info_snapshot` | 暂不入正式主表 | 原样保留 | 选填 | 含敏感信息，本轮先停文档 |
| `公司对接人` / `对接人电话` | `account_manager_snapshot` | 暂不入正式主表 | trim | 选填 | 当前样本缺值较多 |

### 4. `辅材、包材 成慧怡.xlsx`

#### Sheet: `Sheet1`

| 原始表头 | 标准字段名 | 目标表 | 清洗规则 | 必填 / 选填 | 冲突点 / 待确认 |
| --- | --- | --- | --- | --- | --- |
| `产品订单编号` | `product_order_no_snapshot` | `material_purchase_snapshot` | 原样保留 | 必填 | 仍需与订单编号体系对齐 |
| `产品编号` | `product_no_snapshot` | `material_purchase_snapshot` | 原样保留 | 必填 |  |
| `产品名称` | `product_name_snapshot` | `material_purchase_snapshot` | trim | 必填 |  |
| `材料品名` | `material_name` | `erp_materials` / `material_purchase_snapshot` | trim | 必填 |  |
| `厂商料号` | `supplier_item_no_or_vendor_name` | `material_purchase_snapshot` | 允许写入供应商名称 | 选填 | 当前样本大量承载的是供应商名称，不是料号 |
| `规格` | `spec` | `erp_materials` / `material_purchase_snapshot` | trim | 选填 |  |
| `单位` | `unit` | `material_purchase_snapshot` | trim | 必填 |  |
| `单价` | `material_unit_price` | `material_purchase_snapshot` | 允许 `基价` 文本 | 必填 | 非纯数值时需标记待确认 |
| `采购数量` | `purchase_qty` | `material_purchase_snapshot` | integer / decimal | 必填 |  |
| `金额`（当前模板表头不稳定） | `amount_snapshot` | `material_purchase_snapshot` | 优先缓存值 | 选填 | 当前样本列标题显示不稳定，需按列位置识别 |
| `备注` | `remark` | `material_purchase_snapshot` | 原样保留 | 选填 | 当前样本存在空值 / 共用备注 |
| `下单人` | `ordered_by_snapshot` | `material_purchase_snapshot` | trim | 选填 |  |
| `联系电话` | `ordered_by_phone_snapshot` | `material_purchase_snapshot` | 清洗手机号格式 | 选填 |  |

## 加工合同 PDF 字段映射草案

| PDF 字段 | 标准字段 | 目标表 | 是否合同快照 | 是否后续打印回填 |
| --- | --- | --- | --- | --- |
| 合同编号 | `contract_no` | `erp_processing_contract_headers` | 否，业务单号 | 是 |
| 下单日期 | `placed_date_raw` | `erp_processing_contract_headers` | 是 | 是 |
| 回货日期 | `promised_return_date` | `erp_processing_contract_headers` | 否，业务字段 | 是 |
| 加工方名称 | `vendor_name_snapshot` | `erp_processing_contract_headers` + `erp_partners` | 是 | 是 |
| 联系人 | `vendor_contact_snapshot` | `erp_processing_contract_headers` | 是 | 是 |
| 联系电话 | `vendor_phone_snapshot` | `erp_processing_contract_headers` | 是 | 是 |
| 供应商地址 | `vendor_address_snapshot` | `erp_processing_contract_headers` | 是 | 是 |
| 委托单位 | `client_name_snapshot` | `erp_processing_contract_headers` | 是 | 是 |
| 委托人 | `ordered_by_snapshot` | `erp_processing_contract_headers` | 是 | 是 |
| 联系电话（委托方） | `ordered_by_phone_snapshot` | `erp_processing_contract_headers` | 是 | 是 |
| 公司地址 | `client_address_snapshot` | `erp_processing_contract_headers` | 是 | 是 |
| 委外加工订单号 | `processing_order_no_snapshot` | `erp_processing_contract_lines` | 是 | 是 |
| 产品订单编号 | `product_order_no_snapshot` | `erp_processing_contract_lines` | 是 | 是 |
| 产品编号 | `product_no_snapshot` | `erp_processing_contract_lines` | 是 | 是 |
| 产品名称 | `product_name_snapshot` | `erp_processing_contract_lines` | 是 | 是 |
| 工序名称 | `process_name` | `erp_processing_contract_lines` | 是 | 是 |
| 加工厂 | `vendor_name_line_snapshot` | `erp_processing_contract_lines` | 是 | 是 |
| 工序类别 | `process_type` | `erp_processing_contract_lines` | 是 | 是 |
| 单位 | `unit` | `erp_processing_contract_lines` | 是 | 是 |
| 单价 | `processing_unit_price_snapshot` | `erp_processing_contract_lines` | 是 | 是 |
| 委托加工数量 | `qty_snapshot` | `erp_processing_contract_lines` | 是 | 是 |
| 委托加工金额 | `amount_snapshot` | `erp_processing_contract_lines` | 是 | 是 |
| 备注 | `remark` | `erp_processing_contract_lines` | 是 | 是 |
| 求货要求 | `delivery_requirements_snapshot` | `erp_processing_contract_headers` | 是 | 是 |
| 合同约定 | `contract_terms_snapshot` | `erp_processing_contract_headers` | 是 | 是 |
| 结算方式 | `settlement_terms_snapshot` | `erp_processing_contract_headers` | 是 | 是 |
| 合同附图 / 纸样图片 | `attachment` | `erp_attachments` | 是 | 否，作为附件引用 |

## 当前结论

本轮已经足够明确：

- 应该建哪些表
- 哪些字段来自哪份真源
- 哪些字段是主数据，哪些只是快照
- Excel / PDF 导入该先落哪一层

但本轮仍然不开始改 Ent schema，原因是编号体系和结算样本还没稳定。  
下一步应继续补订单 / 出货 / 结算原件，等字段关系确认后再执行：

```bash
cd /Users/simon/projects/plush-toy-erp/server
make data
make migrate_apply
```
