Doc Type / 文档类型: Current Customer Import Dry-run Plan
Status / 状态: Draft + 011 Tooling Added / 草案，已补 011 工具
Runtime Implemented / 运行时已实现: No / 否
Ent Schema Implemented / Ent Schema 已实现: No / 否
Migration Implemented / Migration 已实现: No / 否
Current Implementation Source of Truth / 当前实现真源: No / 否

# current 客户导入 dry-run 计划 / Current Customer Import Dry-run Plan

本计划最初由 010 设计 dry-run 流程。011 已新增 `scripts/import/currentCustomerDryRun.mjs`，用于执行 Stage 0 - Stage 3 的 JSON snapshot dry-run preview。012 已新增 `scripts/import/currentSourceSnapshotFreezeCheck.mjs`，用于冻结 source snapshot evidence，并基于 sanitized freeze fixtures 生成 real dry-run evidence package。011 和 012 都不读写正式数据库、不执行真实迁移、不修改 seedData 或 `business_records`。

## 范围 / Scope

| item | decision |
|---|---|
| 本轮是否执行 Stage 6 | 否 |
| 本轮是否写真实 import loader | 否 |
| 本轮是否写 backfill 脚本 | 否 |
| 本轮是否修改 runtime/schema/migration/API/UI/seedData | 否 |
| 010 输出 | 来源清单、字段分类、dry-run plan、unresolved queue、验收清单、产品策略、风险登记 |
| 011 输出 | `source-references.json`、`normalized-rows.json`、`candidates.json`、`unresolved-queue.json`、`duplicates.json`、`conflicts.json`、`forbidden-auto-import.json`、`validation-summary.json`、`dry-run-report.md` |
| 012 输出 | `freeze-metadata.json`、`freeze-check-summary.json`、`freeze-check-report.md`、`output/current-real-dry-run-evidence/*`、source snapshot freeze 文档、real dry-run evidence 文档和人工 review checklist |

## 011 工具状态 / 011 Tooling Status

011 已实现一个只读 CLI：

```bash
node scripts/import/currentCustomerDryRun.mjs \
  --source scripts/import/fixtures/current/source-snapshot.sample.json \
  --existing scripts/import/fixtures/current/existing-v1.sample.json \
  --out output/current-import-dry-run \
  --format json,md
```

该 CLI 已支撑：

- Stage 0：读取 source snapshot 与 existing snapshot，生成 source references。
- Stage 1：基础字段规范化和 source metadata 校验。
- Stage 2：匹配 customers / suppliers / contacts / sales_orders / sales_order_items / products / materials / units / warehouses / BOM 候选。
- Stage 3：生成 candidates、duplicates、conflicts、unresolved、forbidden 和 validation summary。

仍需人工或 future Goal 处理：

- Stage 4：人工确认 unresolved、duplicate、conflict、forbidden。
- Stage 5：客户 sign-off、备份 / 回滚 / 导入审批。
- Stage 6：真实 import execution；011 未实现。

## 012 冻结 + 证据状态 / 012 Freeze + Evidence Status

012 已实现 freeze checker：

```bash
node scripts/import/currentSourceSnapshotFreezeCheck.mjs \
  --source scripts/import/fixtures/current/source-snapshot.freeze.sample.json \
  --existing scripts/import/fixtures/current/existing-v1.freeze.sample.json \
  --out output/current-source-snapshot-freeze
```

012 已用 freeze fixtures 生成 dry-run evidence：

```bash
node scripts/import/currentCustomerDryRun.mjs \
  --source scripts/import/fixtures/current/source-snapshot.freeze.sample.json \
  --existing scripts/import/fixtures/current/existing-v1.freeze.sample.json \
  --out output/current-real-dry-run-evidence \
  --format json,md
```

012 的 evidence 只用于人工 review：

- 不是真实导入。
- 不写 DB。
- 不做 loader。
- 不改 schema / migration / API / UI / seedData / docs registry。
- 不做 `business_records` runtime cutover。
- output 是 evidence，不是 import approval。
- 真实 import loader 仍需单独 Goal，并且必须另有备份、回滚、幂等、对账、客户确认和正式 usecase 边界。

## 阶段 0：来源收集 / Stage 0: Source Collection

目标：收集来源文件、seed、`business_records` 快照和 V1 现有数据引用，只读扫描，不写数据库。

输入：

- current Excel / PDF / 图片 / 截图样本。
- `docs/customers/current/*`。
- `web/src/erp/config/seedData.mjs`。
- `web/src/erp/config/businessModules.mjs`。
- `web/src/erp/config/businessRecordDefinitions.mjs`。
- `docs/product/business-records-data-map-draft.md`。
- `business_records` 旧数据快照。
- V1 customers / suppliers / contacts / sales_orders / sales_order_items 当前数据快照。
- existing products / materials / units / warehouses / BOM 当前数据快照。

输出：

- source reference list。
- source type 分类：Customer Material、Demo Seed、Source Snapshot、Print Template Input、Industry Template Candidate、Data Import Source、QA Debug、Do Not Import。
- demo/debug/source snapshot 标记。
- 文件缺失、格式不明或来源不明记录。

停止条件：

- 无法确认字段来源。
- 无法区分 demo/seed/source snapshot 与正式事实。
- 需要写数据库、写 loader 或改 seedData。

## 阶段 1：解析与标准化 / Stage 1: Parse and Normalize

目标：解析字段并标准化客户、供应商、产品、材料、订单字段；记录无法识别字段。

只做 dry-run 规则设计：

1. 解析来源列名、原始值、行号、文件名和 sheet 名。
2. 标准化空值、日期、decimal 数量、金额、单位文本和主体名称。
3. 规范客户、供应商、加工厂、产品、材料、仓库、订单编号候选字段。
4. 标记 `demo/debug` 行和不应导入行。
5. 将未知字段写入 unresolved queue，不丢弃。

输出：

- normalized rows preview。
- skipped rows preview。
- unmapped fields list。
- invalid date / quantity / money list。
- source field to target candidate map。

边界：

- 空值不伪造。
- 旧快照缺值不自动补“看起来合理”的值。
- current 专属字段不自动成为 Product Core。

## 阶段 2：匹配现有 V1 数据 / Stage 2: Match Existing V1 Data

目标：只读匹配 V1 和 existing formal model，识别可导入候选、重复候选和冲突候选。

匹配对象：

- `customers`：按 code、name、display_name、旧 `partners` source reference 匹配。
- `suppliers`：按 code、name、short_name、partner_type / 加工厂线索匹配。
- `contacts`：必须先匹配 owner_type + owner_id。
- `sales_orders`：按 order_no、source_no、customer_id 和 source reference 匹配。
- `sales_order_items`：按 order + line_no / product / unit / source line 匹配。
- existing `products`：按 code、name、style_no、customer_style_no 匹配。
- existing `materials`：按 code、name、spec、category 匹配。
- existing `warehouses`：按 code、name 匹配。
- existing `units`：按 unit text 和 code/name 匹配。

输出：

- matched existing list。
- create candidate list。
- update candidate list。
- duplicate candidates。
- conflict candidates。
- unresolved queue。

边界：

- 不创建 `product_skus`。
- 不创建 `purchase_orders`。
- 不创建 shipments、stock reservations、inventory facts 或 finance facts。
- 不让 `business_records` 成为正式模型父表。

## 阶段 3：生成预览 / Stage 3: Generate Preview

目标：生成可导入预览、skipped rows、unresolved queue、duplicate candidates 和 conflict candidates。

preview 必须包含：

- source reference：文件名 / sheet / row / business_record id / module key。
- target model：customers / suppliers / contacts / sales_orders / sales_order_items / existing products / materials / warehouses / units / BOM candidate。
- action candidate：create / update / skip / defer / forbidden。
- confidence：High / Medium / Low。
- reason：为什么可导入、为什么跳过或为什么阻断。
- before / after candidate：只读预览，不写数据库。

skipped rows 包含：

- demo/debug 数据。
- source 不明。
- 目标模型不存在或属于 deferred domain。
- forbidden fact generation。

## 阶段 4：人工复查 / Stage 4: Manual Review

目标：人工确认客户、供应商、产品、订单映射和不能自动判断的字段。

必须人工确认：

- 客户 / 供应商同名或多角色。
- 联系人 owner 不唯一。
- 产品编号、款式编号、颜色、SKU、包装版本之间的关系。
- 文本单位到 `units.id` 的匹配。
- 仓库文本到底是仓库、库位还是备注。
- 旧订单金额、币种、税率是否进入正式 Source Document。
- current 特殊字段属于 Product Core、Industry Template、Customer Config、Print Template Input / Candidate、Reporting 还是 Customer Material。
- 任何 shipment / inventory / finance 相关字段。

输出：

- reviewed mapping decisions。
- rejected candidates。
- accepted dry-run candidates。
- unresolved remain list。
- forbidden auto-import acknowledgement。

## 阶段 5：导入前批准 / Stage 5: Approval Before Import

目标：审批导入结果，明确本阶段仍不写数据库。

审批前必须确认：

- source files confirmed。
- field classification reviewed。
- target model confirmed。
- duplicate rules reviewed。
- unresolved queue empty or approved。
- no forbidden facts generated。
- no `tenant_id` introduced。
- `business_records` not deleted。
- seedData not modified。
- V1 data preview reviewed。
- backup plan prepared。
- rollback / forward-fix plan prepared。
- customer sign-off prepared。

输出：

- approved dry-run package。
- import execution readiness notes。
- future loader design requirements。

## 阶段 6：未来真实导入执行 / Stage 6: Future Import Execution

当前 010 不执行 Stage 6。

后续只有单独 Goal 才能设计或实现 import loader。Stage 6 必须满足：

- 明确允许修改 runtime/import code。
- 只走 V1 usecase 或已有正式 usecase。
- 有备份、回滚、校验、幂等和审计。
- 禁止双写 `business_records`。
- 禁止直接写 schema 外字段。
- 禁止自动生成 shipments、stock reservations、inventory_txns、AR/AP、invoice、payment。
- 导入前后对账，并保留 source reference。

## Dry-run 交付物 / Dry-run Deliverables

| deliverable | purpose |
|---|---|
| source reference list | 证明每条候选来自哪里 |
| normalized preview | 显示字段解析结果 |
| target candidate preview | 显示拟进入的正式模型候选 |
| skipped rows | 说明不导入原因 |
| unresolved queue | 人工确认队列 |
| duplicate candidates | 去重审核 |
| conflict candidates | 冲突审核 |
| forbidden auto-import list | 拦截 deferred facts 和禁止对象 |
| validation summary | 统计 can import / manual / deferred / forbidden |
