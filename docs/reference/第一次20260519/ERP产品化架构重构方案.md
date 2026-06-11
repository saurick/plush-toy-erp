# ERP产品化架构重构方案

## Source

- Source file: `/Users/simon/Downloads/c5a55a0880fbc1eeb9b72fadae1db25ace79d55c4feade412713c8badf029efb-2026-06-01-08-14-22-8e60a7b3ad2b4c8f843f84c6c620576c/conversations-008.json`
- Conversation ID: `69f8b0b9-5254-8325-923b-5baf23f5c335`
- Created: `2026-05-04T22:44:11+08:00`
- Updated: `2026-06-01T15:31:04+08:00`
- Match: exact title, one conversation matched in `conversations-*.json`.
- Coverage: official export object, `current_node` main chain; chain nodes `253`, off-chain branch nodes `8` not expanded into the ordered transcript.
- Output scope: visible `user` / `assistant` `text` and `multimodal_text` messages only; skipped internal assistant `thoughts` / `reasoning_recap` records `144`.
- Empty visible messages rendered as `_（空消息）_`: `8`.
- Visible transcript messages: `108`.

## Transcript

### 001. user

_time `2026-05-04T22:44:07+08:00` · content_type `multimodal_text` · node `3a15d36c-20da-471d-8b56-cd5398e418b8`_

[非文本内容]

```json
{
  "asset_pointer": "sediment://file_00000000a2987206890758a41fdd1686",
  "content_type": "image_asset_pointer",
  "fovea": null,
  "height": 477,
  "metadata": {
    "asset_pointer_link": null,
    "container_pixel_height": null,
    "container_pixel_width": null,
    "dalle": null,
    "emu_omit_glimpse_image": null,
    "emu_patches_override": null,
    "generation": null,
    "gizmo": null,
    "is_no_auth_placeholder": null,
    "lpe_delta_encoding_channel": null,
    "lpe_keep_patch_ijhw": null,
    "sanitized": true,
    "watermarked_asset_pointer": null
  },
  "size_bytes": 80528,
  "width": 942
}
```

你是 ERP 产品化与架构重构顾问。请先完整阅读我上传的 plush-toy-erp 最新源码 zip，再基于真实代码和文档给出“系统分层重构 / 产品化隔离 / 后续实施步骤”方案。

重要要求：
1. 不要只根据我的口头描述推断，必须基于上传仓库里的真实代码、AGENTS.md、docs、web/src/erp/docs、server/internal 等内容。
2. 本轮只做分析和路线设计，不要直接写代码，不要生成补丁。
3. 不要建议大爆炸式重构，要给出低风险、可逐步落地的步骤。
4. 不要把当前甲方硬编码成通用产品规则。
5. 不要把 Workflow 协同层和库存/出货/财务事实层混在一起。
6. 不要提前实现真正 SaaS 多租户、tenant_id、license server、套餐计费或客户工单系统。
7. 当前目标是：单一通用产品代码 + 不同客户配置 / 部署包 / 初始化数据；后续才评审多租户 SaaS。

必须先读这些文件：
- AGENTS.md
- README.md
- docs/current-source-of-truth.md
- docs/architecture/workflow-usecase-review.md
- docs/architecture/shipment-release-workflow-review.md
- docs/architecture/shipment-inventory-boundary-review.md
- docs/architecture/shipment-usecase-review.md
- docs/changes/phase-2a-inventory-fact-schema.md
- docs/changes/phase-2b-bom-lot-schema.md
- docs/changes/phase-2c-purchase-receipt-schema.md
- docs/changes/phase-2d-purchase-return-schema.md
- docs/changes/phase-2d-purchase-receipt-adjustment-schema.md
- docs/changes/phase-2d-lot-status-guard.md
- docs/changes/phase-2d-quality-inspection-schema.md
- web/src/erp/docs/system-layer-progress.md
- web/src/erp/docs/productization-delivery.md
- web/src/erp/config/docs.mjs
- web/src/erp/config/seedData.mjs
- server/internal/biz/workflow.go
- server/internal/biz/rbac.go
- server/internal/data/model/schema 目录
- server/internal/data 里 inventory / purchase / quality 相关代码

当前项目背景：
- 这是一个毛绒玩具 ERP。
- 当前先帮一个甲方落地。
- 该甲方未来可能成为合伙人。
- 系统完善后计划作为 SaaS / 私有化部署产品卖给同行，并按年收维护费。
- 目标不是一次性外包系统，而是行业 ERP 产品内核。
- 当前仓库内已有一些和当前甲方深度耦合的文档、样本、字段口径、菜单和说明。
- 当前阶段不应该直接做真正多租户，而是先做产品化隔离规划。

当前已知现状：
1. Workflow 协同层已经后端化了多条规则，包括：
   - boss approval -> engineering_data / order_revision
   - IQC -> warehouse_inbound / purchase_quality_exception
   - purchase warehouse_inbound -> inbound_done / blocked
   - outsource_return_qc -> outsource_warehouse_inbound / outsource_rework
   - finished_goods_qc -> finished_goods_inbound / finished_goods_rework
   - finished_goods_inbound -> inbound_done / blocked
   - shipment_release -> shipping_released / blocked

2. Fact / MasterData 事实层已有：
   - units
   - materials
   - products
   - warehouses
   - inventory_txns
   - inventory_balances
   - inventory_lots
   - bom_headers
   - bom_items
   - purchase_receipts
   - purchase_returns
   - purchase_receipt_adjustments
   - quality_inspections
   - RBAC 相关表和权限底座

3. 当前还没有完整闭环：
   - customers / suppliers 主数据
   - production orders / 生产领料 / 成品入库事实
   - outsourcing facts
   - shipments / shipment_items / reservations
   - AR / invoice / AP / payment / reconciliation
   - 完整 API / 前端页面 / 帮助中心业务版

请重点分析下面问题：

一、当前分层是否合理
请基于代码判断当前系统应如何分层：
- Product Core 通用产品内核
- Industry Template 行业模板
- Tenant Config 客户/租户配置
- Customer Extension 客户扩展层
- Workflow 协同层
- MasterData 主数据层
- Fact 事实层
- RBAC 权限层
- API/UI 层
- Help/Debug/QA 层
- Productization/Delivery 交付层
- Reporting/Audit/Integration 后续增强层

请指出：
- 现在已经做对的地方。
- 现在还混在一起的地方。
- 哪些地方有“当前甲方耦合”风险。
- 哪些地方有“重复设计”风险。
- 哪些地方有“Workflow 和 Fact 混淆”风险。

二、当前是否应该做目录重构
请判断当前是否应该马上做目录重构，还是先做目录隔离评审。

重点回答：
1. 哪些目录 / 文档 / 配置可能属于通用产品真源？
2. 哪些可能属于当前甲方资料？
3. 哪些只是 seed/demo/test 样本？
4. 哪些文件现在不应该移动？
5. 如果要隔离当前甲方资料，推荐目录结构是什么？

请给出候选目录结构，例如：
- docs/product/
- docs/architecture/
- docs/customers/<customer-key>/
- config/tenants/<tenant-key>/
- deployments/<tenant-key>/
- extensions/<customer-key>/
- web/src/erp/docs/
- web/src/erp/config/

但请说明：
- 哪些目录现在可以先建。
- 哪些目录暂时只写进方案，不要创建。
- 哪些迁移必须等引用关系和测试确认后再做。

三、通用产品与客户差异如何隔离
请给出适合当前阶段的产品化路线。

要求区分：
1. Product Core 通用产品内核
   - 所有客户共用的一套代码。
   - 核心 usecase、schema、API、UI、通用文档。
2. Industry Template 行业模板
   - 毛绒玩具行业默认角色、菜单、流程、字段、seed template。
3. Tenant Config 客户配置
   - 公司名、logo、主题色、菜单开关、模块开关、字段显示/必填、编号规则、打印模板、角色模板、权限模板、初始化数据、默认仓库、默认单位。
4. Customer Extension 客户扩展
   - 极少数客户专属逻辑。
5. Runtime Tenant 多租户
   - 当前阶段不实现。
   - 不新增 tenant_id。
   - 不改 Ent schema。
   - 不改 RBAC 为多租户模型。

请给出推荐路线：
- 第一阶段：单客户私有化部署 + 配置预留。
- 第二阶段：多客户私有化部署，每客户一套数据库/对象存储/部署配置，代码版本统一。
- 第三阶段：SaaS 多租户，单独评审 tenant_id、隔离、计费、授权。

四、Workflow 与 Fact 如何继续推进
请基于现有进度，给出后续优先级。

请不要简单说“继续做全部”，而是按风险排序：

可能选项：
- 继续做 shipment_release 后端最小状态 rule review 加固。
- 做客户资料隔离评审。
- 做 customers / suppliers 主数据评审。
- 做 QualityUsecase 与 workflow task 对接评审。
- 做 production material issue / finished goods receipt 事实层评审。
- 做 ShipmentUsecase / shipments / shipment_items / reservations。
- 做 FinanceUsecase / AR/AP/invoice/reconciliation。
- 做 API / UI / 帮助中心。

请给出建议顺序，并说明为什么。

五、需要问甲方的问题
请根据当前菜单和代码，列出还需要问甲方的问题，分组输出：
- 客户/款式立项
- 产品 / SKU / BOM
- 采购 / 辅材包材
- 委外加工
- 入库 / 质检
- 生产排单 / 生产进度
- 出货放行 / 出库
- 财务对账 / 应收 / 应付 / 发票 / 付款
- 客户差异 / 私有化部署 / 产品化交付

要求问题是业务人员能看懂的，不要问技术术语。

六、输出格式
请按下面格式输出：

1. 当前代码真实状态总结
   - 已完成
   - 未完成
   - 仅评审未落地
   - 风险点

2. 推荐分层模型
   用表格列出：
   - 层名称
   - 当前已有内容
   - 当前缺口
   - 下一步
   - 禁止事项

3. 是否建议现在做目录重构
   - 结论：现在做 / 暂不做 / 先评审
   - 理由
   - 如果后续要做，分几步做

4. 推荐目录隔离方案
   - 通用产品文档放哪里
   - 当前甲方资料放哪里
   - 租户配置放哪里
   - 部署配置放哪里
   - 客户扩展放哪里
   - 哪些目录本轮不建议创建

5. 产品化路线
   - 第一阶段
   - 第二阶段
   - 第三阶段
   - 每阶段做什么，不做什么

6. 下一步执行路线
   请给出 5~8 个阶段，每个阶段包含：
   - 阶段目标
   - 主要文件
   - 是否改 schema
   - 是否改 runtime
   - 是否需要 migration
   - 验收命令
   - 风险

7. 甲方问题清单
   用业务语言输出，可以直接复制发给甲方。

8. 最终建议
   回答：
   - 现在应该继续做 workflow / fact，还是先做目录隔离评审？
   - 是否要先暂停功能开发做边界收口？
   - 当前最小安全下一步是什么？

禁止事项：
- 不要建议一轮大爆炸式重构。
- 不要建议马上新增 tenant_id。
- 不要建议马上做完整 SaaS。
- 不要建议每个客户复制一套完整代码长期维护。
- 不要建议把 WorkflowUsecase 改成库存/出货/财务事实真源。
- 不要重复设计已有 products / materials / units / warehouses / inventory_txns / inventory_balances / inventory_lots / purchase_receipts / quality_inspections。
- 不要把当前甲方资料直接当成通用产品真源。

### 002. user

_time `2026-05-04T23:30:37+08:00` · content_type `text` · node `132a05b2-b25a-4857-b7b0-240799f307b2`_

你是 ERP 产品化与架构重构顾问。请先完整阅读我上传的 plush-toy-erp 最新源码 zip，再基于真实代码和文档给出“系统分层重构 / 产品化隔离 / 后续实施步骤”方案。

重要要求：
1. 不要只根据我的口头描述推断，必须基于上传仓库里的真实代码、AGENTS.md、docs、web/src/erp/docs、server/internal 等内容。
2. 本轮只做分析和路线设计，不要直接写代码，不要生成补丁。
3. 不要建议大爆炸式重构，要给出低风险、可逐步落地的步骤。
4. 不要把当前甲方硬编码成通用产品规则。
5. 不要把 Workflow 协同层和库存/出货/财务事实层混在一起。
6. 不要提前实现真正 SaaS 多租户、tenant_id、license server、套餐计费或客户工单系统。
7. 当前目标是：单一通用产品代码 + 不同客户配置 / 部署包 / 初始化数据；后续才评审多租户 SaaS。

必须先读这些文件：
- AGENTS.md
- README.md
- docs/current-source-of-truth.md
- docs/architecture/workflow-usecase-review.md
- docs/architecture/shipment-release-workflow-review.md
- docs/architecture/shipment-inventory-boundary-review.md
- docs/architecture/shipment-usecase-review.md
- docs/changes/phase-2a-inventory-fact-schema.md
- docs/changes/phase-2b-bom-lot-schema.md
- docs/changes/phase-2c-purchase-receipt-schema.md
- docs/changes/phase-2d-purchase-return-schema.md
- docs/changes/phase-2d-purchase-receipt-adjustment-schema.md
- docs/changes/phase-2d-lot-status-guard.md
- docs/changes/phase-2d-quality-inspection-schema.md
- web/src/erp/docs/system-layer-progress.md
- web/src/erp/docs/productization-delivery.md
- web/src/erp/config/docs.mjs
- web/src/erp/config/seedData.mjs
- server/internal/biz/workflow.go
- server/internal/biz/rbac.go
- server/internal/data/model/schema 目录
- server/internal/data 里 inventory / purchase / quality 相关代码

当前项目背景：
- 这是一个毛绒玩具 ERP。
- 当前先帮一个甲方落地。
- 该甲方未来可能成为合伙人。
- 系统完善后计划作为 SaaS / 私有化部署产品卖给同行，并按年收维护费。
- 目标不是一次性外包系统，而是行业 ERP 产品内核。
- 当前仓库内已有一些和当前甲方深度耦合的文档、样本、字段口径、菜单和说明。
- 当前阶段不应该直接做真正多租户，而是先做产品化隔离规划。

当前已知现状：
1. Workflow 协同层已经后端化了多条规则，包括：
   - boss approval -> engineering_data / order_revision
   - IQC -> warehouse_inbound / purchase_quality_exception
   - purchase warehouse_inbound -> inbound_done / blocked
   - outsource_return_qc -> outsource_warehouse_inbound / outsource_rework
   - finished_goods_qc -> finished_goods_inbound / finished_goods_rework
   - finished_goods_inbound -> inbound_done / blocked
   - shipment_release -> shipping_released / blocked

2. Fact / MasterData 事实层已有：
   - units
   - materials
   - products
   - warehouses
   - inventory_txns
   - inventory_balances
   - inventory_lots
   - bom_headers
   - bom_items
   - purchase_receipts
   - purchase_returns
   - purchase_receipt_adjustments
   - quality_inspections
   - RBAC 相关表和权限底座

3. 当前还没有完整闭环：
   - customers / suppliers 主数据
   - production orders / 生产领料 / 成品入库事实
   - outsourcing facts
   - shipments / shipment_items / reservations
   - AR / invoice / AP / payment / reconciliation
   - 完整 API / 前端页面 / 帮助中心业务版

请重点分析下面问题：

一、当前分层是否合理
请基于代码判断当前系统应如何分层：
- Product Core 通用产品内核
- Industry Template 行业模板
- Tenant Config 客户/租户配置
- Customer Extension 客户扩展层
- Workflow 协同层
- MasterData 主数据层
- Fact 事实层
- RBAC 权限层
- API/UI 层
- Help/Debug/QA 层
- Productization/Delivery 交付层
- Reporting/Audit/Integration 后续增强层

请指出：
- 现在已经做对的地方。
- 现在还混在一起的地方。
- 哪些地方有“当前甲方耦合”风险。
- 哪些地方有“重复设计”风险。
- 哪些地方有“Workflow 和 Fact 混淆”风险。

二、当前是否应该做目录重构
请判断当前是否应该马上做目录重构，还是先做目录隔离评审。

重点回答：
1. 哪些目录 / 文档 / 配置可能属于通用产品真源？
2. 哪些可能属于当前甲方资料？
3. 哪些只是 seed/demo/test 样本？
4. 哪些文件现在不应该移动？
5. 如果要隔离当前甲方资料，推荐目录结构是什么？

请给出候选目录结构，例如：
- docs/product/
- docs/architecture/
- docs/customers/<customer-key>/
- config/tenants/<tenant-key>/
- deployments/<tenant-key>/
- extensions/<customer-key>/
- web/src/erp/docs/
- web/src/erp/config/

但请说明：
- 哪些目录现在可以先建。
- 哪些目录暂时只写进方案，不要创建。
- 哪些迁移必须等引用关系和测试确认后再做。

三、通用产品与客户差异如何隔离
请给出适合当前阶段的产品化路线。

要求区分：
1. Product Core 通用产品内核
   - 所有客户共用的一套代码。
   - 核心 usecase、schema、API、UI、通用文档。
2. Industry Template 行业模板
   - 毛绒玩具行业默认角色、菜单、流程、字段、seed template。
3. Tenant Config 客户配置
   - 公司名、logo、主题色、菜单开关、模块开关、字段显示/必填、编号规则、打印模板、角色模板、权限模板、初始化数据、默认仓库、默认单位。
4. Customer Extension 客户扩展
   - 极少数客户专属逻辑。
5. Runtime Tenant 多租户
   - 当前阶段不实现。
   - 不新增 tenant_id。
   - 不改 Ent schema。
   - 不改 RBAC 为多租户模型。

请给出推荐路线：
- 第一阶段：单客户私有化部署 + 配置预留。
- 第二阶段：多客户私有化部署，每客户一套数据库/对象存储/部署配置，代码版本统一。
- 第三阶段：SaaS 多租户，单独评审 tenant_id、隔离、计费、授权。

四、Workflow 与 Fact 如何继续推进
请基于现有进度，给出后续优先级。

请不要简单说“继续做全部”，而是按风险排序：

可能选项：
- 继续做 shipment_release 后端最小状态 rule review 加固。
- 做客户资料隔离评审。
- 做 customers / suppliers 主数据评审。
- 做 QualityUsecase 与 workflow task 对接评审。
- 做 production material issue / finished goods receipt 事实层评审。
- 做 ShipmentUsecase / shipments / shipment_items / reservations。
- 做 FinanceUsecase / AR/AP/invoice/reconciliation。
- 做 API / UI / 帮助中心。

请给出建议顺序，并说明为什么。

五、需要问甲方的问题
请根据当前菜单和代码，列出还需要问甲方的问题，分组输出：
- 客户/款式立项
- 产品 / SKU / BOM
- 采购 / 辅材包材
- 委外加工
- 入库 / 质检
- 生产排单 / 生产进度
- 出货放行 / 出库
- 财务对账 / 应收 / 应付 / 发票 / 付款
- 客户差异 / 私有化部署 / 产品化交付

要求问题是业务人员能看懂的，不要问技术术语。

六、输出格式
请按下面格式输出：

1. 当前代码真实状态总结
   - 已完成
   - 未完成
   - 仅评审未落地
   - 风险点

2. 推荐分层模型
   用表格列出：
   - 层名称
   - 当前已有内容
   - 当前缺口
   - 下一步
   - 禁止事项

3. 是否建议现在做目录重构
   - 结论：现在做 / 暂不做 / 先评审
   - 理由
   - 如果后续要做，分几步做

4. 推荐目录隔离方案
   - 通用产品文档放哪里
   - 当前甲方资料放哪里
   - 租户配置放哪里
   - 部署配置放哪里
   - 客户扩展放哪里
   - 哪些目录本轮不建议创建

5. 产品化路线
   - 第一阶段
   - 第二阶段
   - 第三阶段
   - 每阶段做什么，不做什么

6. 下一步执行路线
   请给出 5~8 个阶段，每个阶段包含：
   - 阶段目标
   - 主要文件
   - 是否改 schema
   - 是否改 runtime
   - 是否需要 migration
   - 验收命令
   - 风险

7. 甲方问题清单
   用业务语言输出，可以直接复制发给甲方。

8. 最终建议
   回答：
   - 现在应该继续做 workflow / fact，还是先做目录隔离评审？
   - 是否要先暂停功能开发做边界收口？
   - 当前最小安全下一步是什么？

禁止事项：
- 不要建议一轮大爆炸式重构。
- 不要建议马上新增 tenant_id。
- 不要建议马上做完整 SaaS。
- 不要建议每个客户复制一套完整代码长期维护。
- 不要建议把 WorkflowUsecase 改成库存/出货/财务事实真源。
- 不要重复设计已有 products / materials / units / warehouses / inventory_txns / inventory_balances / inventory_lots / purchase_receipts / quality_inspections。
- 不要把当前甲方资料直接当成通用产品真源。

### 003. user

_time `2026-05-05T00:23:53+08:00` · content_type `text` · node `d25c3879-0e33-42d4-a58e-ac9ebec1bd77`_

继续

### 004. assistant

_time `2026-05-05T01:02:04+08:00` · content_type `text` · node `ae78518e-d279-4028-9adc-f26d6009ef9a`_

以下方案基于已解压源码中的必读文件和关键目录核对：`AGENTS.md`、`README.md`、`docs/current-source-of-truth.md`、Workflow / Shipment 相关架构评审、Phase 2A~2D 变更文档、`web/src/erp/docs/*`、`web/src/erp/config/docs.mjs`、`web/src/erp/config/seedData.mjs`、`server/internal/biz/workflow.go`、`server/internal/biz/rbac.go`、`server/internal/data/model/schema/*` 以及 `server/internal/data` 下 inventory / purchase / quality 相关 repo。

关键事实依据包括：仓库规则明确要求当前甲方不能硬编码进产品核心，客户资料后续应单独隔离，且目录隔离必须先评审再迁移（`AGENTS.md:179-226`）；Workflow 与 Fact 边界已被正式写入约束：`workflow task done != fact posted`、`shipment_release done != shipped`、workflow payload 不是库存 / 出货 / 财务真源（`AGENTS.md:229-245`）；已存在真源表禁止重复设计（`AGENTS.md:254-276`）；当前真源文档确认 Phase 2A~2D 已有库存、BOM、采购入库、退货、调整、批次状态、来料质检和 RBAC，但仍缺 customers / suppliers、生产、委外、出货、财务等完整闭环（`docs/current-source-of-truth.md:15-31`）；`shipment_release` 最小后端规则只写 `shipping_released / blocked`，不写库存、不派生财务、不改 schema（`docs/architecture/shipment-release-workflow-review.md:1-15`，`server/internal/biz/workflow.go:707-749`）。

---

## 1. 当前代码真实状态总结

### 已完成

**Workflow 协同层已经后端化 7 条最小规则。**  
`WorkflowUsecase.UpdateTaskStatus` 已按任务类型进入特殊分支：老板审批、IQC、采购仓库入库、委外回货质检、成品抽检、成品入库、出货放行（`server/internal/biz/workflow.go:376-425`）。其中采购入库完成只写 `inbound_done` 并标记 `inventory_balance_deferred`（`workflow.go:543-577`），成品入库完成只写 `inbound_done` 并标记库存与出货放行 deferred（`workflow.go:664-705`），出货放行完成只写 `shipping_released` 并标记库存、应收、开票 deferred（`workflow.go:707-724`）。

**MasterData / Fact 底座已经有真实 schema。**  
`server/internal/data/model/schema` 里已经有 `units / materials / products / warehouses / inventory_txns / inventory_balances / inventory_lots / bom_headers / bom_items / purchase_receipts / purchase_returns / purchase_receipt_adjustments / quality_inspections / RBAC` 等表。库存流水通过 hook 禁止普通 update/delete，明确是不可变事实（`inventory_txn.go:19-29`）。Phase 2A 文档也明确 `business_records` 只是通用单据快照和兼容层，不替代库存事实真源（`docs/changes/phase-2a-inventory-fact-schema.md:3-31`）。

**Inventory / Purchase / Quality 已有最小事实 usecase / repo。**  
`InventoryUsecase` 已包含 `IN / OUT / ADJUST_IN / ADJUST_OUT / TRANSFER / REVERSAL`、批次状态、采购入库、采购退货、采购入库调整、来料质检动作（`server/internal/biz/inventory.go:29-71`，`inventory.go:260-289`）。采购入库过账写 `inventory_lots -> inventory_txns -> inventory_balances`（`docs/changes/phase-2c-purchase-receipt-schema.md:39-63`）。来料质检状态变化只改批次状态，不写库存数量流水（`docs/changes/phase-2d-quality-inspection-schema.md:66-73`）。

**RBAC 底座已切换到标准权限模型。**  
权限常量、内置角色、菜单权限、移动端权限在 `server/internal/biz/rbac.go` 中集中定义；`AdminHasPermission` 支持 super admin 与角色权限判断（`rbac.go:5-78`，`rbac.go:339-356`）。菜单包括客户/供应商、产品、订单、BOM、采购、入库、库存、出货、生产、品质、财务、帮助、QA、权限管理等入口（`rbac.go:408-458`）。

**产品化与分层边界已经有文档入口。**  
`web/src/erp/docs/system-layer-progress.md` 已列出 MasterData、Workflow、Inventory、Quality、Purchase、Shipment、Finance、RBAC、API/UI、Help/QA、Productization 等层的状态和边界（`system-layer-progress.md:13-28`）。`productization-delivery.md` 已明确当前不实现 tenant_id、license server、套餐计费、客户工单系统，路线是先单客户私有化，再多客户私有化，最后才评审 SaaS 多租户（`productization-delivery.md:1-14`，`productization-delivery.md:113-138`）。

### 未完成

当前还没有完整闭环的核心模块包括：

- `customers / suppliers` 正式主数据，当前前端有“客户/供应商”入口，但仍复用 `business_records`，没有 partner / customer / supplier Ent schema（`web/src/erp/config/businessModules.mjs:27-63`）。
- 生产事实：production orders、生产领料、WIP、成品入库事实。
- 委外事实：委外发料、委外回货、委外结算、返工补做事实。
- 出货事实：`shipments / shipment_items / reservations / shipment_execution / outbound posting`。
- 财务事实：AR / AP / invoice / payment / reconciliation。
- Fact API / UI：采购、库存、质检等很多能力仍停留在 schema / repo / usecase / test，没有完整业务页面和业务版帮助中心（`system-layer-progress.md:220-235`）。
- Reporting / Audit / Integration：报表、审计、附件、Excel 导入导出、扫码、外部物流 / 财务集成均未开始（`system-layer-progress.md:258-270`）。

### 仅评审未落地

- `ShipmentUsecase / 出货事实最小模型` 已评审，但未实现 schema / migration / runtime。文档建议新增或明确 `ShipmentUsecase`，并把 shipment 头、行、预留、出货执行、取消 / 冲正、`shipped` 确认从 Workflow 与 Inventory 中拆出来（`docs/architecture/shipment-usecase-review.md:31-41`）。
- `stock_reservations / available / reserved / frozen` 只有评审口径，没有表和运行时（`shipment-usecase-review.md:85-123`）。
- 产品化目录：`config/tenants/<tenant-key>/`、`deployments/<tenant-key>/`、`docs/customers/<tenant-key>/` 只在文档中建议，当前没有真正创建复杂目录树，也没有配置加载器（`productization-delivery.md:81-90`）。
- Quality 与 Workflow 的关系只在进度文档里列为下一步，当前 `quality_inspections` 是事实层，Workflow IQC 是协同层，二者尚未正式桥接（`system-layer-progress.md:115-137`）。

### 风险点

**当前甲方耦合风险。**  
`web/src/erp/config/seedData.mjs` 明确收录当前样本文件：`9.3加工合同-子淳.pdf`、`26029#夜樱烬色...xlsx`、`26204#抱抱猴子...xlsx`、`加工 成慧怡.xlsx`、`辅材、包材 成慧怡.xlsx`、生产订单总表截图、正式汇报 PDF 等（`seedData.mjs:440-529`）。这些适合作为种子客户样本、字段调研和 demo seed，不应升级成通用产品规则。

**Workflow 与 Fact 混淆风险。**  
UI 上 `inbound_done`、`shipping_released` 等状态容易被业务用户理解成“库存已入账 / 已出货”，但代码和文档明确不是事实过账。尤其 `shipment_release done` 已被专门收口为 `shipping_released`，不等于 `shipped`，不写库存、不派生应收 / 开票（`shipment-release-workflow-review.md:39-55`）。

**重复设计风险。**  
前端已有 `partners`、`products` 通用业务记录页面；后端已有 `products / materials / units / warehouses` 等事实 / 主数据表。后续做 customers / suppliers、产品资料页或 SKU 时，不能因为前端已有 `business_records` 页面就再复制一套与现有 `products`、`materials` 语义相近的表。

**Help / Debug / QA 与业务帮助混杂风险。**  
`docs.mjs` 把很多开发、QA、评审文档注册到前端文档系统（`docs.mjs:1-37`，`docs.mjs:206-217`）；`seedData.mjs` 又把 QA 和帮助导航混在一个 registry 里（`seedData.mjs:1694-1722`，`seedData.mjs:2328-2385`）。后续迁移目录或做客户资料隔离时，必须同步修复 docs registry、导航、测试断言。

---

## 2. 推荐分层模型

| 层名称 | 当前已有内容 | 当前缺口 | 下一步 | 禁止事项 |
|---|---|---|---|---|
| Product Core 通用产品内核 | `server / web / docs` 中的核心 schema、usecase、RBAC、Workflow、库存 / 采购 / 质检事实底座 | 生产、委外、出货、财务事实闭环；fact API / UI | 继续按 usecase + schema + docs + tests 演进 | 禁止把当前甲方名称、logo、特殊字段、特殊流程写入核心 usecase |
| Industry Template 行业模板 | 毛绒玩具角色、菜单、流程、字段样本、打印模板、移动端角色入口 | 尚未从当前甲方样本中抽离成“行业默认模板” | 先做模板清单：哪些是行业共性，哪些是当前客户样本 | 禁止把第一个客户样本等同于行业标准 |
| Tenant Config 客户配置 | 文档已定义公司名、logo、主题色、菜单、字段、编号、模板、角色、初始化数据等配置项 | 没有实际 config loader；没有配置目录 | 先设计配置形态，不改 runtime，不加 tenant_id | 禁止实现 Runtime Tenant、多租户中间件、SaaS 套餐 |
| Customer Extension 客户扩展层 | 目前没有清晰 extension 层 | 极端客户专属逻辑无放置边界 | 只在真实出现专属逻辑时建立 extension，并记录原因、范围、退出条件 | 禁止让核心 schema / 库存 / 财务规则为客户长期分叉 |
| Workflow 协同层 | 7 条后端最小规则；任务、事件、业务状态；移动端任务处理 | 不是完整 BPMN；还有未迁移的生产、出货执行、财务协同 | 先加固 `shipment_release` 边界与测试，再评审 Quality bridge | 禁止在 `WorkflowUsecase` 直接写库存、出货、财务事实 |
| MasterData 主数据层 | `units / materials / products / warehouses / bom_headers / bom_items` | `customers / suppliers / contacts / supplier prices` | 先评审 customers / suppliers 最小主数据 | 禁止重复设计 products / materials / units / warehouses |
| Fact 事实层 | `inventory_txns / balances / lots`，采购入库 / 退货 / 调整，来料质检 | 生产领料、成品入库、委外、出货、AR/AP/invoice/payment | 按生产 → 出货 → 财务顺序推进 | 禁止把 `business_records` 或 workflow payload 当事实真源 |
| RBAC 权限层 | 标准 roles / permissions / role_permissions / admin_user_roles；菜单按权限过滤 | 采购 / 质检 / 库存事实 API 还未完整接动作级权限 | 每接一个事实 API，同步权限码与 owner / assignee / status 校验 | 禁止只靠前端隐藏菜单作为安全边界 |
| API / UI 层 | 通用业务记录页、移动任务页、帮助与 QA 页 | 多个事实 usecase 尚无正式 API / 页面 | 一次只接一个事实模块，不把 schema-only 当已完成 | 禁止前端继续做后端已迁规则的本地双写 |
| Help / Debug / QA 层 | 验收总览、业务链路调试、字段联动、运行记录、专项报告、系统分层、产品化交付 | 普通业务用户版帮助不足；客户样本与 QA 说明边界不清 | 分离“业务帮助”“开发验收”“客户交付说明” | 禁止把开发术语直接暴露给业务用户 |
| Productization / Delivery 交付层 | 已有 `productization-delivery.md`，明确阶段路线和禁止项 | 没有客户配置包、部署包、初始化数据包结构 | 先做目录隔离评审，再做配置 / 部署模板 | 禁止现在做 tenant_id、license、计费、工单系统 |
| Reporting / Audit / Integration 后续增强层 | 有 observability / audit 文档口径 | 报表、附件、导入导出、扫码、外部集成未落地 | 等事实层稳定后再做 | 禁止先做报表倒推事实模型 |

---

## 3. 是否建议现在做目录重构

**结论：先评审，暂不做目录重构。**

理由：

1. `AGENTS.md` 已明确：当前甲方资料隔离必须先列文件清单、引用关系、docs registry、测试断言和回滚风险，再执行移动；不能顺手大规模重构目录（`AGENTS.md:214-226`，`AGENTS.md:293-299`）。
2. `web/src/erp/config/docs.mjs` 对文档路径做了静态 raw import，移动 `web/src/erp/docs/*` 会直接影响前端构建、文档入口和测试（`docs.mjs:1-37`）。
3. `web/src/erp/config/seedData.mjs` 同时承载 source readiness、导航、QA、帮助中心条目和样本说明，直接拆会牵动大量引用（`seedData.mjs:440-529`，`seedData.mjs:2328-2385`）。
4. 后端 schema / usecase 位置已经是事实真源，不应为了目录好看移动 `server/internal/data/model/schema`、`server/internal/biz/workflow.go`、`server/internal/biz/rbac.go` 或 inventory / purchase / quality repo。
5. 当前唯一部署真源仍是 `server/deploy/compose/prod`，暂时没有第二套部署主路径；现在建复杂 `deployments/*` 容易制造假入口（`AGENTS.md:301-307`）。

后续要做目录隔离，建议分四步：

1. **文件盘点**：给每个文档、配置、样本、seed 标注“Product Core / Industry Template / Customer Material / Demo Seed / QA Debug / Delivery”。
2. **引用盘点**：列出被 `docs.mjs`、`seedData.mjs`、业务导航、测试、README、AGENTS 引用的路径。
3. **低风险建目录**：先建 README / index，不移动核心文件。
4. **逐批迁移**：先迁移纯客户材料说明，再拆 seed/demo，再调整前端 docs registry；每一批都跑前端测试和导航测试。

---

## 4. 推荐目录隔离方案

### 通用产品文档放哪里

推荐：

```text
docs/product/
docs/architecture/
docs/changes/
docs/workflow/
docs/warehouse/
docs/finance/
docs/roles/
docs/observability/
web/src/erp/docs/
```

当前可以保留不动：

- `docs/current-source-of-truth.md`
- `docs/architecture/*`
- `docs/changes/*`
- `web/src/erp/docs/system-layer-progress.md`
- `web/src/erp/docs/productization-delivery.md`

`web/src/erp/docs` 仍作为前端文档渲染来源，但后续应区分：

- 普通业务帮助
- 开发 / QA / 调试文档
- 产品化 / 交付文档
- 客户专属交付说明

### 当前甲方资料放哪里

候选结构：

```text
docs/customers/<customer-key>/
  README.md
  field-research/
  samples/
  delivery-notes/
  meeting-questions/
  print-template-notes/
```

应归入客户资料或客户样本的内容：

- 当前样本 Excel / PDF / 图片对应的字段分析。
- 当前客户的特殊命名、特殊表格、样本订单号、样本款式。
- `seedData.mjs` 里 source readiness 中列出的真实样本文件说明。
- 与当前客户交付、培训、沟通相关的说明。

但本轮不建议直接移动这些资料。先做清单与引用评审。

### 租户配置放哪里

候选结构：

```text
config/tenants/<tenant-key>/
  tenant.json
  modules.json
  menu.json
  fields.json
  numbering.json
  roles.json
  permissions.json
  seed/
  print-templates/
```

当前阶段只写进方案，不建议创建完整配置树。原因是当前没有 config loader，也不应误导成 Runtime Tenant。这里的 `tenant` 只是“客户配置包”命名，不是数据库多租户。

### 部署配置放哪里

候选结构：

```text
deployments/<tenant-key>/
  README.md
  env/
  compose/
  backup/
  restore/
  release-checklist.md
```

当前不建议创建复杂 `deployments/<tenant-key>`。现阶段部署真源仍保持 `server/deploy/compose/prod`。等第二个客户出现或第一个客户需要私有化部署包时，再把 env、域名、数据库、对象存储、备份恢复清单隔离出来。

### 客户扩展放哪里

候选结构：

```text
extensions/<customer-key>/
  README.md
  docs/
  server/
  web/
```

当前只写进方案，不建议创建运行时扩展层。只有当出现无法配置化、确实客户专属、且不应进入行业模板的逻辑时，再建立 extension，并要求记录：

- 专属原因
- 影响范围
- 是否影响核心事实规则
- 是否可退出
- 谁维护

### 哪些目录现在可以先建

在下一轮“目录隔离评审”任务中，可以低风险先建：

```text
docs/product/README.md
docs/customers/<customer-key>/README.md
```

前提是不移动现有文件，只写分类原则和迁移清单。

### 哪些目录暂时只写进方案，不要创建

```text
config/tenants/<tenant-key>/
deployments/<tenant-key>/
extensions/<customer-key>/
```

原因：当前没有运行时配置加载、没有多客户部署包、没有客户扩展 runtime。提前创建会造成“已经支持多客户配置 / 扩展”的假象。

### 哪些迁移必须等引用关系和测试确认后再做

- `web/src/erp/docs/*` 的移动。
- `web/src/erp/config/docs.mjs` 的 registry 改动。
- `web/src/erp/config/seedData.mjs` 的拆分。
- 帮助中心导航、QA 导航、移动端 dock、文档页面路径的改动。
- 任何 `server/internal/data/model/schema`、migration、usecase 目录移动。

---

## 5. 产品化路线

### 第一阶段：单客户私有化部署 + 配置预留

做什么：

- 保持单一产品代码。
- 继续落当前甲方，但所有新功能按通用产品内核设计。
- 用 env、配置文件、seed template、菜单开关、字段显示 / 必填、编号规则、打印模板、角色模板、初始化数据承接客户差异。
- 当前客户资料只作为种子客户样本，不进入核心 usecase。
- 优先补齐主链路事实：主数据、生产、出货、财务前置。

不做什么：

- 不新增 `tenant_id`。
- 不改 Ent schema 为多租户。
- 不做 license server。
- 不做套餐计费。
- 不做客户工单系统。
- 不把客户特殊报表写进 Product Core。

### 第二阶段：多客户私有化部署，每客户一套数据库 / 对象存储 / 配置

做什么：

- 一个产品仓库，一个版本主线。
- 每个客户一套数据库、对象存储、env、部署配置、初始化数据。
- 客户差异进入 `config/tenants/<tenant-key>` 与 `deployments/<tenant-key>`。
- 小量客户专属逻辑进入 `extensions/<customer-key>`，并严格记录。

不做什么：

- 不长期复制完整代码仓库给每个客户。
- 不让每个客户一套 schema。
- 不让客户扩展分叉库存、出货、财务核心规则。

### 第三阶段：SaaS 多租户，单独评审

做什么：

- 单独评审 `tenant_id`、租户隔离、用户隔离、权限隔离、对象存储隔离、数据迁移、升级策略、计费、授权。
- 重新审视 RBAC、审计、备份、恢复、安全、性能和数据隔离。

不做什么：

- 不在当前阶段顺手预埋半成品多租户字段。
- 不把当前私有化配置目录误当成 SaaS tenant runtime。

---

## 6. 下一步执行路线

建议顺序按风险排序：

1. 先做客户资料 / 产品化边界隔离评审。
2. 加固 `shipment_release` 最小 rule review 和测试，防止被误读成 shipped。
3. 做 customers / suppliers 主数据评审。
4. 做 QualityUsecase 与 workflow task 对接评审。
5. 做 production material issue / finished goods receipt 事实层评审。
6. 做 ShipmentUsecase / shipments / shipment_items / reservations。
7. 做 FinanceUsecase / AR / AP / invoice / reconciliation。
8. 最后成批接 API / UI / 帮助中心业务版。

| 阶段 | 阶段目标 | 主要文件 | 是否改 schema | 是否改 runtime | 是否需要 migration | 验收命令 | 风险 |
|---|---|---|---|---|---|---|---|
| 0. 产品化边界与目录隔离评审 | 先列清 Product Core、行业模板、客户资料、seed/demo/test 的文件清单 | `AGENTS.md`、`docs/current-source-of-truth.md`、`web/src/erp/config/docs.mjs`、`seedData.mjs`、`web/src/erp/docs/*` | 否 | 否 | 否 | 文档评审后：`cd web && pnpm test` | 误移动 docs registry 导致帮助中心和测试断言断裂 |
| 1. `shipment_release` 协同规则加固 | 确认 done 只等于 `shipping_released`，补并发 / 幂等 / 前端双写风险评审 | `server/internal/biz/workflow.go`、`workflow_test.go`、`docs/architecture/shipment-release-workflow-review.md` | 否 | 可做小范围测试 / guard 加固 | 否 | `cd server && go test ./internal/biz ./internal/data` | 一旦把放行误作出货，会提前触发财务和库存错误 |
| 2. customers / suppliers 主数据评审 | 先定客户、供应商、联系人、结算对象、开票资料最小模型 | `docs/architecture/*` 新评审文档、`businessModules.mjs`、`businessRecordDefinitions.mjs`、现有 `products/materials` schema | 评审阶段否 | 否 | 否 | `cd web && pnpm test` | 前端已有 partners 页，容易和正式主数据表重复 |
| 3. QualityUsecase 与 workflow 对接评审 | 明确 IQC 任务、`quality_inspections`、批次 HOLD/ACTIVE/REJECTED 的桥接方式 | `quality_inspection.go`、`quality_inspection_repo.go`、`workflow.go`、`rbac.go` | 优先否；若加 inspection items 再评审 | 可能改 API / action guard | 视是否新增表而定 | `cd server && go test ./internal/biz ./internal/data` | 质检任务 done 与质检事实 pass/reject 容易混淆 |
| 4. 生产领料 / 成品入库事实评审 | 定 production order、material issue、finished goods receipt 的事实边界 | `inventory.go`、`inventory_repo.go`、未来 production 评审文档 | 评审阶段否；落地期是 | 落地期是 | 落地期需要 | `cd server && make data && make migrate_status && go test ./internal/data ./internal/biz` | 成品入库 workflow 已有 `inbound_done`，不能当库存入账 |
| 5. ShipmentUsecase / 出货事实 | 定 `shipments / shipment_items / reservations`，真实 `shipped + inventory OUT` | `docs/architecture/shipment-usecase-review.md`、`inventory.go`、未来 shipment schema / usecase | 是 | 是 | 是 | `cd server && make data && make migrate_status && go test ./internal/data ./internal/biz` | 可用量、预留、冻结、并发扣减若不清晰，会导致超卖或错扣库存 |
| 6. FinanceUsecase | 在真实 shipped、采购入库 / 退货 / 调整、委外结算稳定后评审 AR/AP/invoice/payment/reconciliation | `docs/finance/finance-v1.md`、未来 finance schema / usecase、`rbac.go` | 评审后大概率是 | 是 | 是 | `cd server && make data && make migrate_status && go test ./internal/data ./internal/biz` | 不能从 `shipment_release` 直接生成应收；发票、付款、对账涉及法律和财务口径 |
| 7. API / UI / 帮助中心业务版 | 把已落事实 usecase 逐个接入正式 API、页面、业务教程 | `jsonrpc.go`、fact repo/usecase、`web/src/erp/pages/*`、`web/src/erp/docs/*`、`rbac.go` | 通常否，除非补字段 | 是 | 通常否 | `cd web && pnpm lint && pnpm css && pnpm test && pnpm style:l1`；`cd server && go test ./...` | 页面容易把“评审中 / schema-only / debug”能力包装成已可用业务功能 |

---

## 7. 甲方问题清单

### 客户 / 款式立项

1. 一个客户订单里，是否可能有多个产品编号、多个颜色、多个出货批次？
2. 你们现在的“订单编号、客户订单号、产品订单编号、款式编号、产品编号”分别是谁提供、谁维护、什么时候确定？
3. 一个款式改颜色、改尺寸、改包装时，是算同一个款式的版本，还是新产品编号？
4. 订单立项时，哪些资料必须齐全后才能让老板审批？
5. 老板审批通过后，哪些内容还允许改？改了是否要重新审批？
6. 缺资料、客户临时改款、交期变更，通常由谁发起，谁确认？
7. 一个订单取消或暂停时，已经采购、已经委外、已经生产的部分怎么处理？

### 产品 / SKU / BOM

1. 你们内部“款式”“产品”“SKU”“颜色款”分别怎么叫？是否需要在系统里分开？
2. BOM 是按款式维护，还是按产品编号 / 颜色 / 尺寸分别维护？
3. 一个产品是否会有多个 BOM 版本？旧版本什么时候不能再用？
4. BOM 里的损耗率、片数、颜色、组装部位、加工程序，哪些必须录入，哪些只是备注？
5. 材料可以替代吗？例如同一面料换供应商、换色号时，是否需要审批？
6. 色卡、纸样、作业指导书、图片，是否需要随 BOM 一起归档？
7. BOM 改版后，已经下采购单或已经生产的订单是否跟着改？

### 采购 / 辅材包材

1. 主料、辅材、包材是否走同一套采购流程，还是分开下单？
2. 采购单是否一定要关联订单 / 产品订单编号？
3. 供应商名称、厂商料号、联系人、联系电话、开票资料，谁维护为准？
4. 采购数量是否允许超采或少采？超出范围是否要审批？
5. 到货可以分批吗？分批到货时如何记录还欠多少？
6. 到货后是先质检再入库，还是部分材料可直接入库？
7. 单价变更、金额差异、少到 / 多到 / 损耗，通常怎么处理？
8. 退供应商时，是否必须关联原入库单或原采购单？

### 委外加工

1. 哪些工序会委外？哪些工序一定内部生产？
2. 委外下单时，是否需要同时发材料、纸样、色卡、图片？
3. 委外加工单是按订单、按产品、按工序，还是按批次下？
4. 委外回货可以分批吗？分批回货怎么验收和结算？
5. 委外不合格时，是返工、补做、扣款，还是退回？
6. 委外加工费用按数量、按工序、按件，还是按整单结算？
7. 加工厂的对账周期、付款周期、发票要求是否统一？
8. 加工合同上的图片附件、纸样附件是否需要系统留档？

### 入库 / 质检

1. 主料、辅材、包材、成品，哪些必须质检后才能入库？
2. 来料质检是按批次、按供应商、按订单，还是按到货单做？
3. 质检结果有哪些：合格、不合格、让步接收、返工、待处理？
4. 不合格材料是否允许进入库存？如果进入，是不是必须标记不可用？
5. 让步接收由谁批准？是否需要老板或品质主管确认？
6. 质检时是否记录抽检数量、不良数量、不良原因、照片？
7. 成品入库前是否必须抽检？抽检不通过时如何返工？
8. 入库后发现数量错、仓库错、批次错，谁有权调整？

### 生产排单 / 生产进度

1. 生产排单由谁排？PMC、生产经理、厂长分别负责什么？
2. 排单前必须满足哪些条件：BOM 完成、材料齐套、委外安排、老板审批？
3. 生产过程需要记录哪些节点：裁剪、车缝、手工、组装、包装、成品质检？
4. 生产领料是按订单领，按工序领，还是按车间一次性领？
5. 生产过程中材料不够、返工、延期，谁上报，谁处理？
6. 成品完工后，是先入成品仓，还是直接进入待出货？
7. 内部生产和外发生产的进度是否使用同一套看板？
8. 生产数量与订单数量不一致时，短少、多做、损耗怎么处理？

### 出货放行 / 出库

1. “出货放行”在你们现场表示什么：业务允许发、财务允许发、仓库已备货，还是已经实际发出？
2. 出货前必须经过哪些确认：客户确认、业务确认、仓库确认、财务确认？
3. 是否允许部分出货？部分出货后，未出货数量怎么跟踪？
4. 出货是否需要锁定库存？如果锁定，锁定后其他订单能不能使用？
5. 发货单、物流单、快递单、装箱单，哪些需要系统生成或留档？
6. 实际出库时是否必须记录仓库、批次、数量、经手人、出库时间？
7. 已放行但未出库的订单，如果客户取消或财务拦截，怎么处理？
8. 已出库后发现发错、少发、多发，怎么冲正或补发？

### 财务对账 / 应收 / 应付 / 发票 / 付款

1. 应收是在出货放行后产生，还是实际出库后产生？
2. 开票是在出货前、出货后，还是客户对账确认后？
3. 客户对账周期是按月、按批次、按订单，还是按出货单？
4. 应付供应商是在采购入库后产生，还是对账确认后产生？
5. 委外加工费是在回货后、质检后，还是月结对账后确认？
6. 采购退货、入库数量调整、让步接收、质量扣款，会不会影响应付？
7. 付款是按供应商、按合同、按发票，还是按对账单？
8. 是否需要记录预付款、尾款、扣款、折让、红冲、作废发票？
9. 财务需要看到哪些提醒：待对账、待开票、待收款、待付款、异常金额？

### 客户差异 / 私有化部署 / 产品化交付

1. 系统上线时，公司名称、logo、主题色、打印抬头是否需要按客户配置？
2. 哪些菜单你们暂时不用，需要隐藏？
3. 哪些字段必须显示，哪些字段必须填写，哪些字段只是备注？
4. 单号规则是否有固定格式？例如订单号、采购单号、加工合同号、入库单号、出库单号。
5. 角色名称是否按你们公司习惯命名，还是使用系统默认角色？
6. 初始化时需要导入哪些基础资料：客户、供应商、材料、产品、仓库、单位、角色、用户？
7. 打印模板是否需要按你们现有合同版式调整？
8. 系统部署在你们自己的服务器，还是云服务器？谁负责备份？
9. 升级时间是否有要求？例如晚上、周末、月底不能升级。
10. 年维护服务希望包含哪些内容：远程支持、数据备份检查、版本升级、培训、问题修复、报表调整？

---

## 8. 最终建议

**现在应该先做目录隔离评审，再继续重事实功能开发。**  
不是做大规模目录重构，而是先把当前甲方资料、通用产品文档、seed/demo/test、开发 QA 文档的边界收口。`shipment_release` 这种已落地的 Workflow 规则可以继续做小范围测试加固，但不要在边界未收口前急着新增 shipment / finance / production 大 schema。

**需要短暂停止新增重事实表，但不需要停止所有开发。**  
暂停的是“新增大 schema / 新事实闭环 / 大目录迁移”。可以继续做文档评审、规则测试、QA 收口、客户问题清单确认、现有 Workflow 边界加固。

**当前最小安全下一步：做一份客户资料隔离评审清单。**  
清单至少包含：文件路径、当前用途、分类、是否通用产品真源、是否当前甲方资料、是否 seed/demo/test、被哪些 registry / nav / test 引用、建议目标目录、迁移风险、回滚方式。完成这个清单后，再决定是否只创建 `docs/product/README.md` 与 `docs/customers/<customer-key>/README.md`，暂不移动 `server/internal`、Ent schema、migration、`docs.mjs`、`seedData.mjs`。

### 005. user

_time `2026-05-05T01:12:21+08:00` · content_type `text` · node `bb91e6cf-7310-4754-9a63-dd78b206a466`_

继续下一步，而且每一层的开发进度怎么跟踪才好？未来可能是有十几个甲方的项目

### 006. assistant

_time `2026-05-05T01:16:10+08:00` · content_type `text` · node `a10ee33e-9444-4219-bbcd-d0445c005c7c`_

建议下一步先建立**“产品能力进度台账 + 客户交付矩阵 + 客户差异台账”**，再继续大功能开发。未来有十几个甲方时，不能靠“某个菜单做完了”“某个客户说可以了”来判断产品进度，要分清：

**产品内核是否成熟**，这是产品能不能卖给同行的判断。  
**某个客户是否可上线**，这是交付状态。  
**客户差异是否进入通用产品、行业模板、客户配置，还是客户扩展**，这是产品化治理。

正式汇报材料里已经把系统定位成“岗位入口、任务驱动、桌面端 + 手机端”，并建议第一期先打通订单到出货主链路和手机端任务处理，第二期补异常 / 返工中心，第三期补成本、供应商绩效、外发工厂绩效，这个节奏很适合作为产品路线和客户交付阶段的骨架。fileciteturn0file1 另外，像加工合同样本里包含来货要求、交期约定、结算方式、纸样附件等内容，这类信息非常有价值，但应先标记为“客户资料 / 行业样本 / 打印模板输入”，不要直接变成通用产品规则。fileciteturn0file0

---

# 1. 下一步先做什么

## 结论

**下一步不是马上继续新增大 schema，也不是马上目录大迁移，而是先做一轮“产品化进度治理”。**

建议产出 4 份台账：

```text
docs/product/capability-ledger.md
docs/product/layer-progress.md
docs/product/release-gates.md
docs/customers/<customer-key>/delta-register.md
```

本轮可以先只写方案和清单，不动运行时代码，不改 Ent schema，不新增 tenant_id。

---

# 2. 开发进度不要按“菜单”跟踪，要按“能力”跟踪

现在的问题是：一个菜单可能只是 UI，一个 workflow task 可能只是协同状态，一个 schema 可能还没有 API/UI，一个客户样本可能只是 demo seed。未来客户一多，最危险的是大家说“出货模块做完了”，但实际可能只是：

- `shipment_release` 协同放行做完了；
- 真实 `shipments / shipment_items` 没有；
- 库存预留没有；
- 实际出库没有；
- 应收没有；
- 开票没有；
- 客户 A 能用，客户 B 不能用。

所以进度跟踪要改成：

```text
Layer 层级
  -> Capability 能力项
    -> Maturity 成熟度
      -> Evidence 证据
        -> Customer Rollout 客户启用情况
```

也就是：

**产品层进度** 和 **客户交付进度** 分开。

---

# 3. 推荐的能力成熟度等级

建议统一使用 L0 ~ L8。

| 等级 | 名称 | 含义 | 是否能对客户说“已完成” |
|---|---|---|---|
| L0 | Not Started 未开始 | 只有想法，没有文档 | 否 |
| L1 | Reviewed 已评审 | 有架构评审 / 边界文档 | 否 |
| L2 | Schema Ready 模型就绪 | schema / migration / 表结构完成 | 否 |
| L3 | Usecase Ready 业务用例就绪 | repo / usecase / 事务 / 测试完成 | 不能直接说完成 |
| L4 | API + RBAC Ready 接口权限就绪 | API、权限码、后端校验完成 | 仍需 UI / 验收 |
| L5 | UI Ready 页面就绪 | 桌面端 / 手机端页面可操作 | 只能说可试用 |
| L6 | E2E Verified 端到端验收 | 有完整业务链路测试和验收脚本 | 可试点 |
| L7 | Customer Pilot 客户试点 | 至少一个客户真实流程跑通 | 可交付给该客户 |
| L8 | Product GA 产品可销售 | 通用文档、部署、培训、回滚、至少多个客户验证 | 可作为产品能力销售 |

重点约束：

**Workflow 能力和 Fact 能力必须分开评级。**

例如：

| 能力 | 当前判断 |
|---|---|
| `WF-SHIP-RELEASE` 出货放行协同 | 已有后端最小规则，可算 L3 左右，后续补 API/UI/E2E |
| `SHP-SHIPMENTS` 出货单事实 | 仅评审，不能算完成 |
| `SHP-RESERVATION` 库存预留 | 仅评审，不能算完成 |
| `INV-OUTBOUND` 实际出库扣减 | 需要和 shipment fact 对接后才算 |
| `FIN-AR` 应收 | 不能从 `shipment_release` 直接派生 |

这样就不会出现“出货放行完成 = 出货模块完成”的误判。

---

# 4. 每一层开发进度怎么跟踪

建议用一张总表管理产品层进度。

## 4.1 Product Core 通用产品内核

| 跟踪项 | 怎么记 |
|---|---|
| 能力编号 | `CORE-*`、`MD-*`、`INV-*`、`PUR-*`、`QC-*`、`SHP-*`、`FIN-*` |
| 当前成熟度 | L0 ~ L8 |
| 真源文件 | schema / usecase / docs / test 文件路径 |
| 是否有 schema | 是 / 否 / 不需要 |
| 是否有 migration | 是 / 否 / 不需要 |
| 是否有 usecase | 是 / 否 |
| 是否有 API | 是 / 否 |
| 是否有 RBAC | 是 / 否 |
| 是否有 UI | 桌面端 / 手机端 / 无 |
| 是否有帮助文档 | 业务版 / 开发版 / 无 |
| 是否可给客户使用 | 不可用 / 内测 / 试点 / 正式 |

示例：

| 能力编号 | 能力名称 | 层 | 当前状态 | 证据 | 下一步 |
|---|---|---|---|---|---|
| `MD-MATERIAL` | 物料主数据 | MasterData | L2/L3 | 已有 `materials` schema | 补 API/UI/导入 |
| `MD-PRODUCT` | 产品主数据 | MasterData | L2/L3 | 已有 `products` schema | 避免与前端 business_records 重复 |
| `MD-CUSTOMER` | 客户主数据 | MasterData | L0/L1 | 仅前端入口 / 评审需求 | 做 customer/supplier 主数据评审 |
| `INV-TXN` | 库存流水 | Fact | L3 | 已有不可变库存流水模型 | 补正式 API/UI |
| `PUR-RECEIPT` | 采购入库事实 | Fact | L3 | 已有采购入库 schema/usecase | 补业务页面 / 权限 / 帮助 |
| `QC-IQC` | 来料质检事实 | Fact | L3 | 已有 quality_inspections | 评审与 workflow IQC 桥接 |
| `WF-SHIP-RELEASE` | 出货放行协同 | Workflow | L3 | Workflow 已有最小规则 | 加固测试和业务说明 |
| `SHP-SHIPMENT` | 出货事实 | Fact | L1 | 有 shipment usecase review | 后续 schema 评审 |
| `FIN-AR` | 应收 | Fact | L0/L1 | 财务文档口径未落地 | 等 shipment fact 后再做 |

---

## 4.2 Industry Template 行业模板

行业模板不要直接等于当前甲方资料。它跟踪的是“毛绒玩具行业共性”。

| 跟踪项 | 例子 |
|---|---|
| 默认角色 | 老板、业务、工程、PMC、采购、仓库、品质、生产经理、财务 |
| 默认菜单 | 订单、BOM、采购、入库、库存、质检、生产、出货、财务 |
| 默认流程 | 订单审批、工程资料、采购、IQC、委外、成品质检、出货放行 |
| 默认字段 | 产品编号、颜色、数量、交期、供应商、批次、仓库、质检结果 |
| 默认 seed | 行业演示数据，不绑定真实甲方 |
| 默认打印模板 | 采购单、加工合同、入库单、出库单、对账单 |

跟踪表：

| 模板能力 | 当前来源 | 是否行业共性 | 是否含甲方口径 | 下一步 |
|---|---|---:|---:|---|
| 角色入口 | RBAC + 前端菜单 | 是 | 低 | 抽为行业默认角色模板 |
| 加工合同样本 | 当前客户文件 | 部分是 | 高 | 只作为客户样本和模板输入 |
| 材料明细 Excel | 当前客户文件 | 部分是 | 高 | 抽字段，不抽客户值 |
| 手机端任务 | 正式汇报方案 | 是 | 低 | 作为行业模板交付能力 |

---

## 4.3 Tenant Config 客户配置

当前阶段的 Tenant Config 只是**客户配置包**，不是 SaaS 多租户。

每个客户跟踪这些配置：

| 配置项 | 例子 | 是否进 Product Core |
|---|---|---|
| 公司名 / logo / 主题色 | 客户 A 名称、logo | 否 |
| 菜单开关 | 客户 A 暂不开财务 | 否 |
| 模块开关 | 暂不开委外 / 暂不开扫码 | 否 |
| 字段显示 / 必填 | 客户 A 必填客户订单号 | 通常否 |
| 编号规则 | 采购单、加工单、入库单格式 | 通常配置化 |
| 打印模板 | 加工合同、送货单 | 通常配置化 |
| 角色模板 | 老板、PMC、仓库主管 | 行业默认 + 客户微调 |
| 初始化数据 | 客户、供应商、仓库、单位 | 否 |
| 默认仓库 / 默认单位 | 成品仓、辅材仓、件/个/米 | 否 |

客户配置进度表：

| 客户 | 配置包 | 菜单 | 角色 | 编号 | 打印 | 初始化数据 | 状态 |
|---|---|---|---|---|---|---|---|
| 客户 A | 未建立 | 待确认 | 待确认 | 待确认 | 有样本 | 待导入 | 调研 |
| 客户 B | 未建立 | 未开始 | 未开始 | 未开始 | 未开始 | 未开始 | 未开始 |

---

## 4.4 Customer Extension 客户扩展

客户扩展要非常克制。未来十几个甲方时，最容易失控的是每个客户都想要“专属逻辑”。

建议只有满足下面条件才进入 Customer Extension：

1. 不能用字段配置解决。
2. 不能用菜单开关解决。
3. 不能用编号规则解决。
4. 不能用打印模板解决。
5. 不是行业共性。
6. 不影响库存、出货、财务事实真源。
7. 有明确维护人和退出方案。

客户扩展台账：

| 客户 | 需求 | 分类 | 为什么不能配置化 | 是否影响核心事实 | 处理方式 | 退出条件 |
|---|---|---|---|---|---|---|
| 客户 A | 特殊合同打印格式 | 打印模板 | 可配置 | 否 | Tenant Config | 无需 extension |
| 客户 A | 特殊质检扣款算法 | 待评审 | 可能行业共性 | 可能影响财务 | 先评审，不进代码 | 明确是否共性 |
| 客户 B | 特殊 Excel 导入格式 | 数据导入适配 | 只影响导入 | 否 | 客户数据适配 | 导入完成后归档 |

---

## 4.5 Workflow 协同层

Workflow 层要单独跟踪，不能和事实层合并。

跟踪字段：

| 字段 | 说明 |
|---|---|
| workflow task type | `boss_approval`、`iqc`、`shipment_release` 等 |
| done 后状态 | 例如 `shipping_released` |
| blocked 后状态 | 例如 `blocked` |
| 是否写 Fact | 当前应为否，或只触发后续 fact usecase |
| 是否有测试 | 必须有 |
| 是否有前端双写风险 | 必须检查 |
| 是否有业务说明 | 告诉用户 done 代表什么、不代表什么 |

示例：

| Task | Done 表示 | 不表示 | 下一步 |
|---|---|---|---|
| `shipment_release` | 允许进入发货准备 / 放行通过 | 不等于已出库、不等于已开票、不等于已收款 | 加固测试和 UI 文案 |
| `purchase warehouse_inbound` | 仓库任务完成 | 不等于库存已经由 Workflow 直接入账 | 与采购入库 fact 保持边界 |
| `finished_goods_inbound` | 成品入库协同完成 | 不等于成品库存事实入账 | 后续接 finished goods receipt fact |

---

## 4.6 MasterData 主数据层

主数据层要跟踪“谁是长期稳定资料”，不要用订单临时字段替代主数据。

| 主数据 | 当前状态 | 下一步 |
|---|---|---|
| units | 已有 schema | 补 API/UI/seed |
| materials | 已有 schema | 补导入、供应商关联 |
| products | 已有 schema | 与 BOM / SKU 边界评审 |
| warehouses | 已有 schema | 补默认仓库配置 |
| customers | 未正式落地 | 做最小主数据评审 |
| suppliers | 未正式落地 | 做最小主数据评审 |
| contacts | 未正式落地 | 跟 customers/suppliers 一起评审 |

主数据不要和 `business_records` 混用。`business_records` 可以是兼容、演示、调研、通用记录，但不能长期替代正式客户、供应商、产品、物料、仓库主数据。

---

## 4.7 Fact 事实层

事实层要跟踪“是否产生可审计、可对账、可追溯的事实”。

| Fact 能力 | 当前状态 | 下一步 |
|---|---|---|
| inventory_txns | 已有 | 继续保持不可变事实 |
| inventory_balances | 已有 | 补可用量 / 冻结 / 预留评审 |
| inventory_lots | 已有 | 与质检状态、批次状态继续收口 |
| purchase_receipts | 已有 | 补 API/UI |
| purchase_returns | 已有 | 补业务页面和对账影响评审 |
| purchase_adjustments | 已有 | 补权限和审计 |
| quality_inspections | 已有 | 与 workflow IQC 桥接 |
| production orders | 未落地 | 先评审 |
| material issue | 未落地 | 先评审 |
| finished goods receipt | 未落地 | 先评审 |
| shipments | 仅评审 | 后续 schema |
| reservations | 仅评审 | 后续 schema |
| AR/AP/invoice/payment | 未落地 | 等 shipment / purchase fact 稳定 |

事实层每个能力必须记录：

```text
是否有原始单据
是否有行项目
是否有状态机
是否会写 inventory_txns
是否会影响 balance
是否可冲正
是否可审计
是否和财务相关
```

---

## 4.8 RBAC 权限层

RBAC 进度不能只看“菜单能不能隐藏”，还要看后端动作权限。

| 跟踪项 | 必须回答 |
|---|---|
| 菜单权限 | 谁能看到 |
| 动作权限 | 谁能新增、审批、入库、调整、放行、冲正 |
| 数据范围 | 是否只能看自己的任务 / 部门数据 |
| 状态权限 | 什么状态下能改 |
| 审计 | 谁在什么时候做了什么 |
| 移动端权限 | 手机端是否同样受控 |

未来十几个甲方时，角色名称可以配置，但权限码应保持产品内核稳定。

---

## 4.9 API/UI 层

API/UI 层不要独立“抢跑”。它应该跟着 usecase 和 RBAC 走。

| 阶段 | 可以做什么 | 不该做什么 |
|---|---|---|
| L1 评审 | 原型、字段讨论、用户流程 | 不做假数据冒充业务完成 |
| L2 schema | 后台调试页面 | 不给客户承诺完整可用 |
| L3 usecase | 内部操作页、测试页 | 不绕过后端业务规则 |
| L4 API/RBAC | 正式页面接入 | 不只靠前端校验 |
| L5 UI | 桌面 + 手机端 | 不把 workflow 状态误显示为 fact 状态 |
| L6 E2E | 业务验收脚本 | 不跳过异常 / 冲正 / 退回 |

---

## 4.10 Help / Debug / QA 层

未来多客户时，文档要分三类：

| 文档类型 | 读者 | 放置建议 |
|---|---|---|
| 业务帮助 | 甲方业务人员 | 前端帮助中心 |
| 开发 / QA 文档 | 内部团队 | `docs/qa` 或开发文档 |
| 客户交付说明 | 具体客户项目组 | `docs/customers/<customer-key>` |

不要把开发调试说明直接给业务用户看，也不要把客户样本当成通用帮助。

---

# 5. 未来十几个甲方时的项目管理方式

核心原则：

```text
一个产品主线
一个行业模板
多个客户配置包
少量客户扩展
每客户独立部署 / 数据库 / 对象存储
不复制十几套完整代码
```

## 5.1 分成三张看板

### 看板一：Product Core Roadmap

管产品能力，不管某个客户催不催。

例子：

| 能力 | 优先级 | 当前成熟度 | 目标成熟度 | 负责人 | 风险 |
|---|---:|---|---|---|---|
| customers/suppliers | P0 | L1 | L4 | 后端 + 前端 | 和 business_records 重复 |
| production material issue | P0 | L1 | L3 | 后端 | 与库存扣减强相关 |
| shipments/reservations | P0 | L1 | L3 | 后端 | 不能和 shipment_release 混 |
| AR/AP | P1 | L0 | L1 | 产品 + 后端 | 财务口径需甲方确认 |
| mobile task E2E | P0 | L3 | L6 | 前端 + 后端 | 现场验收复杂 |

---

### 看板二：Industry Template Roadmap

管毛绒玩具行业默认能力。

| 模板项 | 状态 | 是否可给新客户复用 | 下一步 |
|---|---|---:|---|
| 默认角色 | 初步已有 | 是 | 抽成角色模板 |
| 默认菜单 | 初步已有 | 是 | 区分必开 / 可选 |
| 默认流程 | 初步已有 | 部分 | 和 fact 层补齐 |
| 默认 seed | 混有甲方样本 | 否 | 拆 demo seed 和客户样本 |
| 默认打印模板 | 有样本 | 部分 | 抽通用版 |

---

### 看板三：Customer Delivery Board

每个客户一张轻量交付板，不重复产品开发板。

| 客户 | 阶段 | 使用版本 | 已开模块 | 数据导入 | 配置包 | 差异项 | 风险 |
|---|---|---|---|---|---|---|---|
| 客户 A | 调研 / 试点 | core 0.x | Workflow、订单样本、手机任务 | 部分 | 未建立 | 多 | 甲方口径混入产品 |
| 客户 B | 未开始 | 未定 | 未定 | 未开始 | 未建立 | 未知 | 需要先复用模板 |
| 客户 C | 未开始 | 未定 | 未定 | 未开始 | 未建立 | 未知 | 不承诺定制开发 |

---

## 5.2 客户需求必须先分类

每个客户提需求时，先进入分类，不要直接开发。

| 客户需求 | 归类 | 处理方式 |
|---|---|---|
| 改公司名称、logo、打印抬头 | Tenant Config | 配置 |
| 隐藏某些菜单 | Tenant Config | 配置 |
| 字段显示 / 必填不同 | Tenant Config | 配置 |
| 订单号规则不同 | Tenant Config | 配置 |
| 加工合同格式不同 | Tenant Config / Print Template | 模板 |
| Excel 导入格式不同 | Customer Data Adapter | 导入适配，不进核心 |
| 所有毛绒厂都会用的流程 | Industry Template | 抽为行业模板 |
| 库存扣减时机 | Product Core Fact | 必须架构评审 |
| 财务应收生成时机 | Product Core Fact | 必须架构评审 |
| 某客户专属算法 | Customer Extension | 严格审批 |
| 某客户临时报表 | Reporting / Customer Config | 不影响核心 |

---

# 6. 建议的 Issue / 任务标签体系

未来客户多了，issue 标签要能一眼看出属于哪一层。

## 6.1 scope 标签

```text
scope:product-core
scope:industry-template
scope:tenant-config
scope:customer-extension
scope:customer-delivery
scope:qa-debug
scope:docs
```

## 6.2 layer 标签

```text
layer:workflow
layer:masterdata
layer:fact
layer:inventory
layer:purchase
layer:quality
layer:shipment
layer:production
layer:finance
layer:rbac
layer:api
layer:ui
layer:help
layer:delivery
layer:reporting
```

## 6.3 phase 标签

```text
phase:review
phase:schema
phase:usecase
phase:api-rbac
phase:ui
phase:e2e
phase:pilot
phase:ga
```

## 6.4 risk 标签

```text
risk:workflow-fact-boundary
risk:customer-coupling
risk:duplicate-masterdata
risk:migration
risk:rbac
risk:frontend-double-write
risk:financial-cutoff
risk:inventory-balance
```

## 6.5 customer 标签

```text
customer:<customer-key>
customer:current
customer:demo
customer:template
```

命名上建议用内部 key，不要在公开 issue 里暴露客户真实全称。

---

# 7. 推荐的进度台账模板

## 7.1 产品能力总台账

```text
Capability ID:
Capability Name:
Layer:
Scope: Product Core / Industry Template / Tenant Config / Extension
Current Level: L0-L8
Target Level This Quarter:
Source of Truth:
Schema:
Migration:
Usecase:
API:
RBAC:
Desktop UI:
Mobile UI:
Help Doc:
Tests:
Known Customer Usage:
Risks:
Next Action:
Owner:
```

示例：

```text
Capability ID: SHP-RELEASE-WF
Capability Name: 出货放行协同
Layer: Workflow
Scope: Product Core
Current Level: L3
Target Level This Quarter: L6
Source of Truth:
  - server/internal/biz/workflow.go
  - docs/architecture/shipment-release-workflow-review.md
Schema: 不新增
Migration: 不需要
Usecase: 已有
API: 待确认
RBAC: 待确认
Desktop UI: 待文案修正
Mobile UI: 待验收
Help Doc: 需要业务版说明
Tests: 需要补幂等 / blocked / done
Risks:
  - 被误认为已出库
  - 被误认为已产生应收
Next Action:
  - 补测试
  - UI 文案写清楚“已放行，不等于已出库”
```

---

## 7.2 客户交付矩阵

```text
Customer:
Deployment Mode: 单客户私有化 / 未来 SaaS 待评审
Core Version:
Template Version:
Config Version:
Enabled Modules:
Disabled Modules:
Imported Data:
Print Templates:
Open Questions:
Customer Deltas:
Extensions:
Go-live Blockers:
Acceptance Status:
```

示例：

| 客户 | 阶段 | Core 版本 | 模块 | 配置 | 数据 | 差异 | 阻塞 |
|---|---|---|---|---|---|---|---|
| current | 试点前 | 0.x | Workflow / 样本订单 / 手机任务 | 未成包 | 样本为主 | 多 | 主数据 / 出货 / 财务未闭环 |
| customer-b | 调研 | 未定 | 待定 | 未开始 | 未开始 | 未知 | 不能复制 current 逻辑 |
| customer-c | 未开始 | 未定 | 待定 | 未开始 | 未开始 | 未知 | 等行业模板 |

---

## 7.3 客户差异台账

```text
Customer:
Request:
Business Reason:
Layer Classification:
Can be config:
Can be template:
Needs extension:
Affects Product Core:
Affects Fact:
Affects Finance:
Decision:
Owner:
Review Date:
Exit Condition:
```

示例：

| 客户 | 需求 | 分类 | 是否配置化 | 是否影响事实 | 决策 |
|---|---|---|---:|---:|---|
| current | 加工合同图片附件 | Tenant Config / Print Template | 是 | 否 | 做模板输入，不进核心逻辑 |
| current | 出货前老板放行 | Workflow | 是，行业共性 | 否 | 保留为 workflow rule |
| current | 出货放行后自动生成应收 | Fact / Finance | 否 | 是 | 暂不做，等 shipment fact |
| customer-b | 不做委外模块 | Tenant Config | 是 | 否 | 菜单 / 模块关闭 |

---

# 8. 每层 Definition of Done

## Workflow 层 Done

必须满足：

1. task type 明确。
2. done / blocked 状态明确。
3. 不写库存、出货、财务事实。
4. 有幂等测试。
5. 有权限校验。
6. UI 文案说明“这个状态代表什么，不代表什么”。
7. 有业务帮助文档。

不能只因为任务能点完成，就说 workflow 层完成。

---

## MasterData 层 Done

必须满足：

1. schema 明确。
2. 编码规则明确。
3. 是否允许停用 / 删除明确。
4. 是否被 fact 引用明确。
5. API / UI / 导入明确。
6. 权限明确。
7. seed template 明确。

客户、供应商、产品、物料、仓库这种主数据，一旦被事实表引用，删除规则必须非常谨慎。

---

## Fact 层 Done

必须满足：

1. 有正式事实表。
2. 有行项目。
3. 有状态机。
4. 有过账 / 撤销 / 冲正规则。
5. 有库存或财务影响说明。
6. 有事务边界。
7. 有审计。
8. 有测试。
9. 与 workflow 的关系明确。

事实层不允许靠 workflow payload 或 `business_records` 长期替代。

---

## RBAC 层 Done

必须满足：

1. 有权限码。
2. 有角色模板。
3. 有菜单权限。
4. 有动作权限。
5. 后端校验。
6. 移动端同样校验。
7. 有 super admin / 普通角色差异。
8. 有测试或至少验收脚本。

---

## API/UI 层 Done

必须满足：

1. API 不绕过 usecase。
2. UI 不绕过 API。
3. 前端没有双写业务状态。
4. 桌面端和手机端职责清晰。
5. 错误状态、blocked 状态、异常状态可以展示。
6. 有业务帮助。
7. 有至少一条 E2E 验收路径。

---

## Productization / Delivery 层 Done

必须满足：

1. 客户配置包明确。
2. 部署配置明确。
3. 初始化数据明确。
4. 打印模板明确。
5. 培训文档明确。
6. 备份恢复明确。
7. 升级流程明确。
8. 客户差异台账明确。

不是部署起来就算产品化完成。

---

# 9. 推荐下一阶段 6 个实际动作

## 动作 1：建立产品能力编号

先定义能力编号，不写代码。

建议初版：

```text
WF-BOSS-APPROVAL
WF-IQC
WF-PURCHASE-INBOUND
WF-OUTSOURCE-QC
WF-FG-QC
WF-FG-INBOUND
WF-SHIPMENT-RELEASE

MD-UNIT
MD-MATERIAL
MD-PRODUCT
MD-WAREHOUSE
MD-CUSTOMER
MD-SUPPLIER
MD-CONTACT

INV-TXN
INV-BALANCE
INV-LOT
INV-REVERSAL
INV-ADJUSTMENT

PUR-RECEIPT
PUR-RETURN
PUR-ADJUSTMENT

QC-IQC
QC-FG
QC-OUTSOURCE

PROD-ORDER
PROD-MATERIAL-ISSUE
PROD-FG-RECEIPT

SHP-SHIPMENT
SHP-SHIPMENT-ITEM
SHP-RESERVATION
SHP-OUTBOUND

FIN-AR
FIN-AP
FIN-INVOICE
FIN-PAYMENT
FIN-RECONCILIATION

RBAC-ROLE
RBAC-PERMISSION
RBAC-MENU
RBAC-MOBILE

DELIVERY-CONFIG
DELIVERY-SEED
DELIVERY-DEPLOYMENT
DELIVERY-PRINT-TEMPLATE
```

---

## 动作 2：把当前能力打上 L0~L8

根据当前代码状态，先给每个能力打初始等级。

例如：

| 能力 | 初始等级建议 |
|---|---|
| Workflow 7 条规则 | L3 |
| units/materials/products/warehouses | L2/L3 |
| inventory_txns/balances/lots | L3 |
| purchase_receipts/returns/adjustments | L3 |
| quality_inspections | L3 |
| customers/suppliers | L0/L1 |
| production facts | L0/L1 |
| shipment facts | L1 |
| finance facts | L0/L1 |
| tenant config | L1 |
| customer extension | L0 |
| productized deployment package | L1 |

---

## 动作 3：建立客户资料隔离清单

先不移动文件，只分类。

分类建议：

| 分类 | 说明 |
|---|---|
| Product Core Source | 通用产品真源 |
| Architecture Review | 架构评审 |
| Industry Template | 毛绒玩具行业模板 |
| Customer Material | 当前甲方资料 |
| Demo Seed | 演示数据 |
| QA Debug | 测试 / 调试 |
| Delivery Note | 交付说明 |
| Deprecated | 待废弃 |

每个文件都记录：

```text
path:
current usage:
classification:
referenced by:
can move now:
target path:
risk:
rollback:
```

---

## 动作 4：建立客户差异评审流程

所有客户需求先过 5 问：

1. 这是行业共性，还是客户个性？
2. 能否用配置解决？
3. 能否用打印模板解决？
4. 会不会影响库存 / 出货 / 财务事实？
5. 是否值得进入 Product Core？

只要影响库存、出货、财务事实，就必须进入产品架构评审，不能在客户项目里单独改。

---

## 动作 5：建立版本号和发布记录

未来十几个甲方时，每个客户都要能回答：

```text
产品内核版本是什么？
行业模板版本是什么？
客户配置版本是什么？
数据库 migration 到哪一步？
当前启用了哪些模块？
哪些模块是试点？
哪些模块是正式？
哪些是客户扩展？
```

建议版本结构：

```text
core_version: 0.6.0
industry_template_version: plush-0.2.0
customer_config_version: current-2026.05
deployment_package_version: current-prod-2026.05.01
migration_version: 202605xxxx
```

---

## 动作 6：继续功能开发时按风险顺序推进

建议顺序：

1. 客户资料隔离评审。
2. `shipment_release` workflow 边界加固。
3. customers / suppliers 主数据评审。
4. QualityUsecase 与 Workflow task 桥接评审。
5. 生产领料 / 成品入库事实评审。
6. ShipmentUsecase / reservations / outbound fact。
7. FinanceUsecase。
8. API / UI / 帮助中心成批接入。

---

# 10. 未来十几个甲方的组织方式

## 10.1 不要变成十几个外包项目

错误方式：

```text
客户 A 一套代码
客户 B 一套代码
客户 C 一套代码
每个客户各改各的
```

这样一年后维护会失控。

正确方式：

```text
一个 core
一个 plush industry template
十几个 customer config
少量 extensions
每客户独立数据库和部署
```

---

## 10.2 每个客户只维护 5 类东西

```text
docs/customers/<customer-key>/
config/tenants/<customer-key>/
deployments/<customer-key>/
data-imports/<customer-key>/
extensions/<customer-key>/    # 极少数才有
```

当前阶段这些目录可以先作为规划，不一定马上全部创建。

---

## 10.3 客户项目分阶段

| 阶段 | 目标 | 主要产出 |
|---|---|---|
| C0 调研 | 看客户现有表格、流程、合同、打印模板 | 客户问题清单、样本文件清单 |
| C1 差异分类 | 判断哪些是通用、模板、配置、扩展 | delta-register |
| C2 配置准备 | 公司信息、菜单、角色、编号、打印 | customer config 草案 |
| C3 数据准备 | 客户、供应商、材料、产品、仓库、单位 | 初始化数据包 |
| C4 试点 | 跑订单到出货主链路 | 试点验收记录 |
| C5 上线 | 私有化部署、备份、培训 | 上线清单 |
| C6 维护 | 版本升级、问题修复、报表调整 | 维护记录 |

---

# 11. 对当前项目的最小安全下一步

建议你现在进入一个很短的“进度治理 Sprint”，不要超过一轮。

## Sprint 目标

把当前系统从“代码推进”切换成“产品能力推进”。

## Sprint 产出

1. `capability-ledger`：产品能力总台账。
2. `layer-progress`：每层 L0~L8 状态。
3. `customer-delta-register`：当前甲方差异台账。
4. `customer-material-inventory`：当前甲方资料清单。
5. `release-gates`：以后什么叫 done。
6. `next-architecture-review-list`：下一批评审顺序。

## Sprint 不做

- 不新增 tenant_id。
- 不做 SaaS。
- 不大迁移目录。
- 不复制客户代码。
- 不新增大型 schema。
- 不把当前甲方资料写进产品核心。
- 不把 workflow done 当 fact done。

---

# 12. 一句话决策

现在最应该做的是：

**先建立“分层能力进度台账 + 客户差异台账”，用 1 个产品主线管理通用能力，用 N 个客户交付矩阵管理甲方上线，不要用 N 套代码管理 N 个客户。**

功能开发可以继续，但下一批重功能开发之前，必须先把 `customers/suppliers`、`Quality ↔ Workflow`、`production facts`、`shipment facts` 的边界评审排好顺序。当前最小安全动作是：**先把现有能力按 L0~L8 打标，并把当前甲方资料标记为 Customer Material / Demo Seed / Industry Template 候选，而不是 Product Core 真源。**

### 007. user

_time `2026-05-05T01:20:17+08:00` · content_type `text` · node `186f1d7a-b6bc-41e8-8d8a-66b7157ae36d`_

那么给我定开发测试运维目标和实施步骤，我用codex来辅助做，一定要具体的，最好codex提示词也给我，尽可能完成这些目标，并且也要告诉我如何在给了codex提示词后，codex输出的内容，让我复制到gpt分析来获得下一步的提示词

### 008. assistant

_time `2026-05-05T01:41:23+08:00` · content_type `text` · node `a729ec26-f731-4cb8-81c4-46fdda2c7a9f`_

已基于源码 zip 中的仓库文件做阅读分析，本轮没有改代码、没有生成补丁、没有运行迁移。下面的判断只把当前甲方资料当作“种子客户样本”，不把它自动升级为通用产品规则。

---

## 1. 当前代码真实状态总结

### 已完成

**Workflow 协同层已经有清晰的后端化起点。**  
`WorkflowUsecase.UpdateTaskStatus` 已经集中识别并处理老板审批、IQC、采购入库确认、委外回货质检、成品抽检、成品入库、出货放行七类任务，代码入口在 `server/internal/biz/workflow.go:376-425`，具体状态推进在 `workflow.go:428-749`。其中 `shipment_release done` 只推进到 `shipping_released`，payload 明确标记库存、应收、开票 deferred，不推进 `shipped`，见 `workflow.go:707-749`、`workflow.go:1427-1451`。这和文档里的边界一致：`Workflow task done != Fact posted`、`shipment_release done != shipped`，见 `web/src/erp/docs/system-layer-progress.md:30-40`。

**MasterData / Fact 已经有一批不可重复设计的事实真源。**  
当前真源文档明确列出：`units / materials / products / warehouses / inventory_txns / inventory_balances / inventory_lots / bom_headers / bom_items / purchase_receipts / purchase_returns / purchase_receipt_adjustments / quality_inspections` 已经落地或形成真源，`business_records` 继续作为通用快照和兼容层，而不是替代事实表，见 `docs/current-source-of-truth.md:12-18`。对应 Ent schema 也真实存在于 `server/internal/data/model/schema` 目录。

**库存事实层的主规则方向是正确的。**  
`InventoryUsecase` 已经区分 `MATERIAL / PRODUCT`、`IN / OUT / ADJUST_IN / ADJUST_OUT / REVERSAL`、批次状态 `ACTIVE / HOLD / REJECTED / DISABLED`，见 `server/internal/biz/inventory.go:29-71`。库存流水 `inventory_txns` 是不可变事实，余额通过事务更新，扣减时做防负库存，见 `server/internal/data/model/schema/inventory_txn.go:32-129`、`server/internal/data/inventory_repo.go:282-302`。这为后续生产领料、出货扣减提供了通用库存原语，但它还不是完整生产 / 出货模块。

**采购事实层已落入库、退货、入库调整三条最小闭环。**  
采购入库 `PostPurchaseReceipt` 写 `inventory_txns.IN`，取消已过账入库写 `REVERSAL`，见 `server/internal/data/purchase_receipt_repo.go:81-147`、`purchase_receipt_repo.go:168-244`。采购退货 `PostPurchaseReturn` 写 `OUT`，取消退货写 `REVERSAL`，见 `purchase_return_repo.go:96-164`、`purchase_return_repo.go:187-259`。采购入库调整根据调整类型写 `ADJUST_IN / ADJUST_OUT`，见 `purchase_receipt_adjustment_repo.go:98-174`、`purchase_receipt_adjustment_repo.go:568-578`。

**来料质检事实层已经有最小主表，但还不是完整质检模块。**  
`quality_inspections` 作为采购入库后材料批次质检状态 / 判定真源，状态包括 `SUBMITTED / PASSED / REJECTED / CANCELLED`，判定包括 `PASS / REJECT / CONCESSION`，见 `server/internal/biz/quality_inspection.go:11-18`。提交质检会把批次改为 `HOLD`，通过 / 让步接收改为 `ACTIVE`，拒收改为 `REJECTED`，取消未判定质检按条件恢复，见 `server/internal/data/quality_inspection_repo.go:38-120`、`quality_inspection_repo.go:215-276`。文档也明确“质检状态变化不写库存流水、不改库存余额”，见 `docs/current-source-of-truth.md:18`。

**RBAC 底座已经标准化。**  
权限码、内置角色、菜单权限集中在 `server/internal/biz/rbac.go`。采购、仓库、品质、财务、PMC、移动端访问、debug 等权限码已定义，见 `rbac.go:5-78`；内置角色矩阵见 `rbac.go:290-320`；菜单权限见 `rbac.go:408-458`。当前真源文档也明确前端隐藏菜单不是安全边界，`auth.me` 返回权限码和后端推导菜单，见 `docs/current-source-of-truth.md:26-29`。

### 未完成

**MasterData 缺 customers / suppliers。**  
当前系统分层文档明确：已有单位、材料、产品、仓库、最小 BOM；客户 / 供应商、供应商联系人、供应商物料 / 价格、主数据页面仍待评审，见 `web/src/erp/docs/system-layer-progress.md:41-64`。

**生产、委外、出货、财务事实层还没有闭环。**  
库存层未完成生产领料、成品入库事实、出货扣减、`available / reserved / frozen`、`stock_reservations`，见 `system-layer-progress.md:86-114`。出货事实层只有评审，未落 `shipments / shipment_items / reservations / shipment_execution / outbound posting`，见 `system-layer-progress.md:162-184`。财务事实层未开始，应收、开票、应付、付款、核销、对账都还没有专表，见 `system-layer-progress.md:185-202`。

**事实 usecase 与 API/UI 还不匹配。**  
采购入库、采购退货、采购入库调整、批次状态变更、来料质检目前很多能力仍停留在 schema / repo / usecase / test，尚未完整接入外部 JSON-RPC/API 和前端页面，见 `docs/current-source-of-truth.md:28`、`web/src/erp/docs/system-layer-progress.md:220-236`。

**产品化隔离还没有真正落目录。**  
产品化文档明确当前只是记录边界，不实现真正多租户、不新增 `tenant_id`、不改 Ent schema；推荐目录 `config/tenants/<tenant-key>/`、`deployments/<tenant-key>/`、`docs/customers/<tenant-key>/` 也只是后续建议，本轮没有创建复杂目录树，见 `web/src/erp/docs/productization-delivery.md:1-14`、`productization-delivery.md:81-90`。

### 仅评审未落地

**ShipmentUsecase 已评审但未落 schema / migration / runtime。**  
`docs/architecture/shipment-usecase-review.md` 建议未来新增 `ShipmentUsecase`，负责出货单头、行、放行、预留 / 冻结、出货执行、取消 / 冲正、`shipped` 确认；`WorkflowUsecase` 只做协同状态，`InventoryUsecase` 只做库存原语，见 `docs/architecture/shipment-usecase-review.md:31-42`。最小 `shipments / shipment_items / stock_reservations` 字段也只是方案评审，见 `shipment-usecase-review.md:43-108`。文档明确本轮未实现 `ShipmentUsecase`、未新增 shipment schema、未写库存、未推进应收 / 开票，见 `shipment-usecase-review.md:204-215`。

**产品化 / 交付层目前是文档总控，不是运行时能力。**  
`productization-delivery.md` 明确当前不实现 Runtime Tenant，不新增 `tenant_id`，不改 Ent schema，不做租户隔离中间件、套餐计费、license server、客户工单系统，见 `productization-delivery.md:99-112`。

**帮助中心和 QA 层目前混合了业务帮助、开发验收、真实样本说明。**  
`web/src/erp/config/docs.mjs` 把业务教程、Workflow 草案、QA 报告、系统分层进度、产品化与交付都注册进文档系统，见 `docs.mjs:1-37`、`docs.mjs:206-217`。这不是错误，但后续要区分“业务用户帮助”“开发验收文档”“客户交付资料”。

### 风险点

**当前甲方耦合风险最高的位置是 `web/src/erp/config/seedData.mjs` 和部分前端文档。**  
`seedData.mjs` 直接引用了本轮上传的真实 Excel、PDF、截图样本，例如材料明细、加工合同、生产订单总表、辅材包材表，并把它们用于字段真源、流程、打印模板、角色说明，见 `seedData.mjs:51-124`、`seedData.mjs:126-255`、`seedData.mjs:257-535`。这些内容适合作为当前甲方 / 种子客户资料和行业模板素材，但不能直接进入 Product Core。

**重复设计风险已经被 AGENTS 明确禁止。**  
`AGENTS.md` 明确禁止重复设计已有 `units / materials / products / warehouses / inventory_txns / inventory_balances / inventory_lots / bom_headers / bom_items / purchase_receipts / quality_inspections / RBAC` 等真源，见 `AGENTS.md:254-285`。后续新增 customers / suppliers、shipments、finance 时必须复用现有主数据和库存事实，不要另造一套“产品表 / 仓库表 / 库存表”。

**Workflow 与 Fact 混淆风险仍然存在。**  
代码本身对七条后端规则边界处理得比较克制，但文档也记录前端工具函数仍保留 seed / test / demo / 手动入口，例如 `finishedGoodsFlow.mjs`、`shipmentFinanceFlow.mjs`，见 `docs/architecture/workflow-usecase-review.md:9-16`。这些 helper 不能重新变成真实运行时双写路径，否则会把 `shipment_release done` 又误当成 `shipped`。

---

## 2. 推荐分层模型

| 层名称 | 当前已有内容 | 当前缺口 | 下一步 | 禁止事项 |
|---|---|---|---|---|
| Product Core 通用产品内核 | `server/internal/biz`、`server/internal/data`、Ent schema、核心 docs、RBAC、Workflow、库存 / 采购 / 质检最小事实 | 客户 / 供应商、生产、出货、财务、完整 API/UI 未闭环 | 先维护“核心真源清单”和“不得客户化污染清单” | 不把当前甲方名称、logo、特殊字段、特殊报表写进核心 usecase |
| Industry Template 行业模板 | 毛绒玩具角色、菜单、流程、字段口径、seed/demo 文案已有雏形 | 目前与当前甲方样本混在 `seedData.mjs` 和部分 docs 里 | 把“行业默认”与“当前甲方样本”分开标注 | 不把一个甲方的 Excel 列名直接当成全行业固定字段 |
| Tenant Config 客户配置 | 产品化文档已定义公司名、logo、主题、菜单、字段、编号、打印模板等配置项 | 尚无真实配置目录、配置 schema、配置加载器 | 先做配置项目录和样例评审，不接 runtime tenant | 不新增 `tenant_id`，不改 Ent schema，不做 SaaS 租户中间件 |
| Customer Extension 客户扩展层 | 目前没有正式扩展层 | 没有扩展准入规则、退出规则、维护责任 | 只在出现极少数客户专属逻辑时建立 | 不允许扩展改写库存、出货、财务核心事实规则 |
| Workflow 协同层 | 七条最小后端规则已落，任务、事件、业务状态、协同任务派生清晰 | 不是完整流程引擎；生产、出货执行、财务仍未迁 | 继续加固 shipment_release 和 Quality task 对接边界 | 不在 `WorkflowUsecase` 写库存、出货、财务事实 |
| MasterData 主数据层 | `units / materials / products / warehouses / bom_headers / bom_items` | `customers / suppliers / contacts / supplier prices` 缺失 | 先做 customers / suppliers 主数据评审 | 不重复建产品、材料、单位、仓库 |
| Fact 事实层 | 库存流水/余额/批次、采购入库/退货/调整、来料质检 | 生产领料、成品入库事实、委外事实、出货事实、财务事实缺失 | 按风险顺序补事实模型，先评审再 schema | 不用 `business_records` 或 workflow payload 替代事实表 |
| RBAC 权限层 | 权限码、角色、菜单、移动端入口已标准化 | 事实 API 接入时权限还要补动作级守卫 | 每新增 API 同步定义权限码和 owner/assignee 校验 | 不把前端隐藏菜单当安全边界；不把 RBAC 改成多租户模型 |
| API/UI 层 | Workflow、business、debug JSON-RPC；桌面和 8 个移动端入口 | 采购 / 库存 / 质检 / 生产 / 出货 / 财务事实页面不足 | 事实 usecase 稳定后逐个接 API/UI | 不在前端补造后端事实 |
| Help / Debug / QA 层 | 验收总览、业务链路调试、字段覆盖、运行记录、专项报告、系统分层、产品化入口 | 普通业务帮助与开发验收文档边界仍需整理 | 文档分类：业务帮助、开发验收、客户交付 | 不把客户专属资料放进普通产品帮助中心 |
| Productization / Delivery 交付层 | 产品化文档已有三阶段路线 | 无客户配置包、部署包、升级/备份/维护清单 | 先做客户资料隔离评审，再做私有化部署模板 | 不马上做 license、计费、工单、完整 SaaS |
| Reporting / Audit / Integration | 当前基本未开始 | 报表、审计、附件、导入导出、条码、外部系统集成缺失 | 等事实层稳定后再做 | 不提前污染核心事实模型 |

---

## 3. 是否建议现在做目录重构

**结论：先评审，暂不做真实目录重构。**

理由有四个：

第一，仓库约束已经明确：当前甲方资料可以作为种子样本，但不能自动升级为通用产品真源；若要隔离客户资料，必须先做目录隔离评审，列出迁移文件、引用关系、docs registry、测试断言和回滚风险，见 `AGENTS.md:214-228`。并且不能在补文档、补菜单、补约束的同轮顺手大规模重构目录，见 `AGENTS.md:293-299`。

第二，`web/src/erp/config/docs.mjs` 是前端文档入口的直接 import registry。它从 `web/src/erp/docs/*.md` 逐个 raw import 文档，见 `docs.mjs:1-37`，再把它们注册为帮助、QA、产品化入口，见 `docs.mjs:39-255`。直接移动文档会影响前端构建、导航、测试和帮助中心入口。

第三，`seedData.mjs` 目前既承载行业流程、角色说明，也承载当前甲方真实样本和字段口径。它不是单纯静态文档，移动或拆分前要先确认哪些页面、测试、调试入口依赖它。

第四，后端 schema / usecase / repo 已经是事实真源，当前问题不是“目录不好看”，而是“产品真源、行业模板、客户样本、demo/seed 边界还没标清”。先做目录隔离评审，风险更低。

后续若要做，建议分四步：

1. **文件分类盘点，不移动文件。**  
   输出一张表：文件路径、当前用途、归属层、是否客户样本、是否被 docs registry / 页面 / 测试引用、迁移风险。

2. **先做文档级隔离，不动 runtime。**  
   可以先新增 customer boundary 文档和 product boundary 文档，用引用说明替代搬文件。

3. **再迁移低风险客户资料。**  
   只迁移不被构建直接 import 的客户样本、调研记录、交付说明；同步修 docs registry 和 README。

4. **最后拆 seed / config / deployment。**  
   等配置项、初始化数据、部署包结构明确后，再拆 `seedData.mjs`、tenant config、deployments，不要一次性大改。

---

## 4. 推荐目录隔离方案

### 通用产品文档放哪里

建议保留并强化：

```text
docs/architecture/
docs/changes/
docs/current-source-of-truth.md
web/src/erp/docs/
```

后续可以新增，但本轮不直接创建代码补丁：

```text
docs/product/
  product-core-boundary.md
  industry-template-plush.md
  configuration-catalog.md
  delivery-roadmap.md
```

`docs/architecture/` 继续放架构边界和 usecase 评审；`docs/changes/` 继续放 schema / migration 变更记录；`web/src/erp/docs/` 继续作为前端可展示文档来源，但要在 docs registry 中标清“业务帮助 / 开发验收 / 产品化交付”。

### 当前甲方资料放哪里

后续建议：

```text
docs/customers/<customer-key>/
  discovery/
  samples/
  field-mapping/
  print-templates/
  decisions/
  acceptance-notes/
```

本轮上传的 Excel、PDF、截图，以及 `seedData.mjs` 中直接引用的真实样本，应优先归为当前甲方 / 种子客户资料或行业模板素材，不直接进入 Product Core。

### 租户配置放哪里

只进入方案，不建议本轮创建复杂 runtime 目录：

```text
config/tenants/<tenant-key>/
  tenant.json
  modules.json
  menus.json
  fields.json
  numbering.json
  roles.json
  permissions.json
  seed/
  print-templates/
```

当前阶段可以先写配置项清单，不接 `tenant_id`，不改 Ent schema，不做多租户中间件。

### 部署配置放哪里

后续多客户私有化时建议：

```text
deployments/<tenant-key>/
  env/
  compose.override.yml
  object-storage.md
  backup-restore.md
  migration-runbook.md
  release-notes.md
```

当前唯一部署真源仍是 `server/deploy/compose/prod`，见 `README.md:14-23`、`AGENTS.md:301-307`。在没有正式部署包任务前，不要新增第二套部署主路径。

### 客户扩展放哪里

后续如确实出现极少数客户专属逻辑：

```text
extensions/<customer-key>/
  README.md
  server/
  web/
  docs/
```

但现在不建议创建。客户扩展必须有准入条件：为什么不能配置化、影响范围、退出方式、维护责任、是否影响升级。扩展不得改库存、出货、财务事实规则。

### 哪些目录现在可以先建

下一轮“目录隔离评审”任务中可以低风险先建：

```text
docs/product/
docs/customers/<current-customer-key>/
```

但只放 README、边界说明、文件清单，不迁移大量文件。

### 哪些目录暂时只写进方案，不要创建

```text
config/tenants/<tenant-key>/
deployments/<tenant-key>/
extensions/<customer-key>/
```

原因是目前没有 runtime config loader、没有多客户部署包、没有真实客户扩展逻辑。提前建空目录容易让团队误以为多租户或客户扩展已经进入实现阶段。

### 哪些迁移必须等引用关系和测试确认后再做

- `web/src/erp/docs/*.md`
- `web/src/erp/config/docs.mjs`
- `web/src/erp/config/seedData.mjs`
- 前端 flow helper 中标注为 seed / test / demo 的文件
- `README.md`、`docs/current-source-of-truth.md`、`AGENTS.md`
- `server/internal/data/model/schema`
- migrations
- `server/deploy/compose/prod`

尤其是 `server/internal/data/model/schema` 和 migrations 不应为了目录“看起来分层”而移动；它们是事实真源和迁移真源。

---

## 5. 产品化路线

### 第一阶段：单客户私有化部署 + 配置预留

做：

- 保持单一通用产品代码。
- 当前甲方作为种子客户落地。
- 通过 env、初始化模板、菜单开关、字段显示、打印模板、角色模板区分客户。
- 建立“客户资料不等于产品真源”的评审机制。
- 输出客户交付清单：初始化数据、默认仓库、默认单位、角色权限、打印模板、备份恢复、升级说明。
- 逐步把通用能力沉淀进 schema / usecase / tests / docs。

不做：

- 不新增 `tenant_id`。
- 不改 RBAC 为多租户模型。
- 不做 license server。
- 不做套餐计费。
- 不做客户工单系统。
- 不为当前甲方复制长期独立代码仓库。

### 第二阶段：多客户私有化部署，每客户一套数据库 / 对象存储 / 配置

做：

- 仍然一套产品代码。
- 每个客户独立数据库、对象存储、env、初始化数据、打印模板、部署配置。
- 建立版本号、升级日志、migration runbook、备份恢复、巡检清单。
- 客户差异通过 config / seed / print template / deployment package 管理。
- 极少数扩展进入 `extensions/<customer-key>/`，并保留退出条件。

不做：

- 不让每个客户 fork 一份完整代码长期维护。
- 不让每个客户拥有不同核心 schema。
- 不把客户差异写进库存、出货、财务核心规则。

### 第三阶段：SaaS 多租户，单独评审

只在多客户 SaaS 明确启动后评审：

- `tenant_id`
- 租户隔离
- 对象存储隔离
- 用户隔离
- 权限隔离
- 统一升级
- 计费 / 授权

现在不提前实现。当前产品化文档也明确“当前不要提前实现第三阶段”，见 `web/src/erp/docs/productization-delivery.md:130-138`。

---

## 6. 下一步执行路线

| 阶段 | 阶段目标 | 主要文件 | 是否改 schema | 是否改 runtime | 是否需要 migration | 验收命令 | 风险 |
|---|---|---|---|---|---|---|---|
| 1 | 客户资料 / 产品真源隔离评审，不移动文件 | `AGENTS.md`、`README.md`、`docs/current-source-of-truth.md`、`web/src/erp/config/docs.mjs`、`web/src/erp/config/seedData.mjs`、`web/src/erp/docs/*` | 否 | 否 | 否 | `bash scripts/project-scan.sh --strict`；前端只读检查可跑 `cd web && pnpm lint && pnpm test` | 最大风险是误把甲方样本当通用规则；本阶段先标清边界 |
| 2 | `shipment_release` 后端最小状态 rule review 加固 | `server/internal/biz/workflow.go`、`server/internal/data/workflow_repo.go`、`docs/architecture/shipment-release-workflow-review.md`、`web/src/erp/mobile/pages/MobileRoleTasksPage.jsx` | 否 | 只在发现 bug 时小改 | 否 | `cd server && go test ./...`；`cd web && pnpm lint && pnpm test` | 不能把 `shipping_released` 扩大成 `shipped` |
| 3 | customers / suppliers 主数据评审 | `docs/architecture/*` 新评审文档、现有 `products / materials / warehouses / units` schema、`rbac.go` 菜单 | 本阶段先否；评审通过后单独 schema 任务 | 否 | 否 | 文档评审 + `bash scripts/project-scan.sh --strict` | 客户简称、客户全称、对账主体、供应商、加工厂可能混用 |
| 4 | QualityUsecase 与 workflow task 对接评审 | `server/internal/biz/quality_inspection.go`、`server/internal/data/quality_inspection_repo.go`、`workflow.go`、`rbac.go` | 默认否；`quality_inspection_items` 另评审 | 未来 API 接入时是 | 默认否 | `cd server && go test ./...`；如涉及 Phase 2D 可跑 `cd server && make phase2d_pg_test` | 不能把 IQC 任务完成等同于 `quality_inspections` 判定完成 |
| 5 | production material issue / finished goods receipt 事实层评审 | `inventory.go`、`inventory_repo.go`、未来 production schema / docs | 评审后大概率是 | 是 | 是 | `cd server && make print_db_url && make data && make migrate_status`；新增 PG 测试脚本 | 生产领料、委外发料、成品入库容易和 workflow 入库状态混淆 |
| 6 | ShipmentUsecase / shipments / shipment_items / reservation 评审与最小落地 | `docs/architecture/shipment-usecase-review.md`、`inventory.go`、未来 shipment schema / repo / usecase / RBAC | 是 | 是 | 是 | `cd server && make data && make migrate_status && go test ./...`；前端接入后 `cd web && pnpm lint && pnpm test` | reservation 强弱模型、并发扣减、部分出货、取消冲正是主要风险 |
| 7 | FinanceUsecase / AR / AP / invoice / reconciliation 评审 | future finance schema / usecase / docs、ShipmentUsecase 输出 | 是 | 是 | 是 | `go test ./...` + 新增 finance PG tests | 不能从 `shipment_release done` 直接生成应收 / 开票；至少要等真实 `shipped` |
| 8 | API / UI / 帮助中心业务版 | JSON-RPC、`rbac.go`、`web/src/erp/pages/*`、`web/src/erp/mobile/*`、`web/src/erp/docs/*` | 通常否 | 是 | 否 | `cd web && pnpm lint && pnpm css && pnpm test && pnpm style:l1`；`cd server && go test ./...` | 前端不能为了页面展示补造后端事实；业务帮助不能暴露过多 schema 技术细节 |

建议优先顺序是：**先做阶段 1 的短评审，再做阶段 2 的 shipment_release 加固，然后进入 customers / suppliers 与 Quality 对接，最后再做生产、出货、财务事实层。**

原因是当前最大架构风险不是“某个功能还没做”，而是客户样本、行业模板、通用产品真源边界还没有收口；但也不应该长期暂停事实层推进。目录评审应短、准、轻，不应演变成大规模搬目录。

---

## 7. 甲方问题清单

下面可以直接复制给甲方，用业务语言沟通。

### 客户 / 款式立项

1. 一个客户订单里，是否可能包含多个款式、多个颜色、多个产品编号？
2. 你们现在区分“客户订单号、订单编号、产品订单编号、款式编号、产品编号”吗？分别是谁提供、谁维护？
3. 新订单进来后，老板主要审核什么：价格、交期、客户信用、资料是否齐全，还是生产风险？
4. 老板审核不通过时，是退给业务补资料，还是直接取消订单？
5. 款式立项时必须有哪些资料：图片、样品、材料明细、包装要求、验货要求、出货日期、合同？
6. 客户中途改颜色、数量、交期、包装方式时，现在怎么记录？是否要保留修改前后的版本？
7. 当前有哪些客户简称或代号？是否有客户全称、开票主体、收货地址、联系人资料？
8. 哪些客户有特殊要求，例如验货、吊牌、包装、唛头、付款方式、出货方式？

### 产品 / SKU / BOM

1. 一个款式是否会有多个颜色、尺寸或版本？这些是否都要单独管理库存和出货？
2. 材料明细里的主料、辅料、包材是否由不同人员维护？
3. BOM 是否需要版本管理？旧版本是否还要保留，避免历史订单查不到？
4. 同一款产品的材料是否允许替代？替代材料由谁批准？
5. 单位用量、损耗率、总用量分别是谁计算，是否需要系统自动计算？
6. 材料颜色、色号、缸号、供应商批号是否需要追踪到入库和出库？
7. 色卡、作业指导书、纸样、图片是否需要作为附件跟随款式或订单？
8. 包装材料是否属于 BOM，还是单独按订单采购？
9. BOM 确认后，采购是否可以直接按 BOM 生成采购需求？
10. BOM 改版后，已经下单采购或已经生产的订单如何处理？

### 采购 / 辅材包材

1. 主料、辅料、包材是否走同一套采购流程？
2. 采购单是按供应商下，还是按订单 / 款式下？
3. 一个订单的材料是否允许分批采购、分批到货？
4. 采购时是否需要记录供应商报价、税率、含税价、不含税价？
5. 到货数量多于或少于采购数量时，仓库和采购如何处理？
6. 到货后是否必须先质检再入库？哪些材料可以免检？
7. 采购退货由谁发起？退货原因有哪些？
8. 采购入库后发现金额、数量、仓库、批次有错，现在怎么调整？
9. 供应商主档需要哪些资料：联系人、电话、地址、开票资料、银行账号、常供材料？
10. 辅材包材表里“厂商料号”是否一定是料号，还是有时会填供应商名称？

### 委外加工

1. 哪些工序需要委外：裁片、车缝、绣花、印花、手工、包装，还是其他？
2. 委外下单时，是按产品下单，还是按工序下单？
3. 委外加工厂是否需要独立供应商档案？
4. 委外合同是否需要系统打印？哪些字段必须固定在合同上？
5. 委外发料是否要扣库存？发出去的材料是否要跟踪在外数量？
6. 加工厂回货时，是否要按批次、数量、工序验收？
7. 回货不合格时，是返工、补做、扣款、退回，还是让步接收？
8. 加工费结算按什么口径：数量、工序、合同、实际合格数量，还是月度对账？
9. 委外延期是否需要自动提醒老板、PMC 或采购？
10. 同一加工厂是否可能同一时间处理多个订单，需要区分哪批材料对应哪张订单？

### 入库 / 质检

1. 材料到仓后，先入待检区还是直接入正式仓？
2. 质检合格、让步接收、不合格、待处理分别怎么处理库存？
3. 不合格材料是否允许退供应商？是否允许继续存放但不能使用？
4. 质检是否需要记录抽检数量、不良数量、不良原因、照片？
5. 谁可以做质检判定？谁可以让步接收？
6. 入库时是否必须有批次号？批次号由供应商提供还是公司内部生成？
7. 仓库是否有库位管理？现在是否需要做到具体货架 / 区域？
8. 成品入库是否需要质检通过后才能入成品仓？
9. 入库后发现数量录错，是否允许修改原单，还是必须做调整单？
10. 仓库盘点差异现在怎么处理？

### 生产排单 / 生产进度

1. 生产单从哪里生成：订单、BOM 齐套、老板审批，还是 PMC 手动创建？
2. 排产时主要看哪些条件：材料齐套、交期、产线、工序、人员、委外回货？
3. 生产过程是否需要分工序记录进度？
4. 生产领料是否要扣库存？是否允许超领、补领、退料？
5. 半成品或在制品是否需要入库管理？
6. 生产延期原因有哪些分类？
7. 返工由谁发起，返工完成后谁确认？
8. 生产进度是每天填一次，还是按关键节点填？
9. PMC、生产经理、仓库、品质之间现在如何交接？
10. 老板想看生产进度时，最关心哪些指标：延期、未齐套、返工、未出货、金额？

### 出货放行 / 出库

1. 出货前需要哪些条件全部满足：业务确认、客户验货、财务放行、包装完成、仓库备货？
2. 财务未放行时，是禁止出货，还是允许备货但不能发货？
3. 出货放行和实际出库是否是两个动作？
4. 是否存在部分出货？部分出货后剩余数量如何跟踪？
5. 出货时是否要指定批次或成品库存来源？
6. 是否需要提前锁定库存，避免同一批成品被多个订单抢占？
7. 出库完成后，谁确认实际发货数量和时间？
8. 出货取消时，如果已经扣库存，是否需要冲回？
9. 发货单、装箱单、物流单号、客户签收是否需要记录？
10. `未出货数` 现在由谁维护，是否要求系统自动计算？

### 财务对账 / 应收 / 应付 / 发票 / 付款

1. 应收是在出货放行后产生，还是实际出货后产生？
2. 开票是在出货后、对账后，还是客户要求时才开？
3. 客户付款条件有哪些：预付款、月结、票到付款、货到付款？
4. 一张发票是否可能对应多张出货单？
5. 一笔收款是否可能对应多张发票或多个订单？
6. 采购应付是在采购入库后产生，还是供应商对账后产生？
7. 委外加工费按合同数量、实际回货数量、合格数量还是对账数量结算？
8. 退货、返工、扣款、让步接收会不会影响应付金额？
9. 发票需要记录哪些字段：发票号、税率、含税金额、开票日期、开票主体？
10. 财务最需要哪些报表：应收账龄、应付账龄、客户对账、供应商对账、加工费汇总、利润核算？

### 客户差异 / 私有化部署 / 产品化交付

1. 系统上线时，公司名称、logo、主题色是否需要定制？
2. 哪些菜单对你们公司必须显示，哪些暂时不用？
3. 哪些字段对你们公司必须填写，哪些只是参考？
4. 编号规则是否有固定格式，例如订单号、采购单号、入库单号、出货单号？
5. 打印模板是否必须与现有纸质合同完全一致？
6. 不同岗位能看的数据范围是否不同？
7. 是否需要导入历史资料？需要导入哪些：客户、供应商、材料、产品、库存、未完成订单？
8. 私有化部署是否有指定服务器、内网、备份、安全要求？
9. 系统升级是否允许停机？通常可以安排在什么时间？
10. 年维护服务希望包含哪些内容：远程支持、数据备份检查、版本升级、模板调整、培训、问题记录？

---

## 8. 最终建议

**现在应该先做“客户资料 / 产品真源隔离评审”，然后继续 workflow / fact。**  
不建议马上大规模搬目录，也不建议继续无边界地加功能。当前最容易造成长期成本的是：把当前甲方样本、字段、菜单、报表口径直接写成通用产品规则。

**是否要先暂停功能开发做边界收口？**  
建议短暂停止新增大功能一个小迭代，只做边界收口，不做大重构。这个收口应包含：`seedData.mjs`、`docs.mjs`、`web/src/erp/docs`、`docs/architecture`、上传样本、打印模板、debug seed 的分类清单。完成后继续推进事实层。

**当前最小安全下一步：**  
做一份“Product Core / Industry Template / Current Customer Sample / Seed-Demo-Test 文件分类评审表”，不移动文件、不改 schema、不改 runtime、不生成 migration。评审通过后，先加固 `shipment_release` 最小后端规则测试和边界文档，再进入 customers / suppliers 主数据评审。这样既不会大爆炸重构，也能防止当前甲方资料继续污染通用产品内核。

### 009. assistant

_time `2026-05-05T01:55:44+08:00` · content_type `text` · node `66004727-7fdb-4540-90b7-4fdab70084b2`_

下面这套方案可以直接拿去用：先定 **30 天开发 / 测试 / 运维目标**，再用 Codex 分任务推进。Codex 适合让它在仓库里读文件、改文件、跑命令；OpenAI 官方说明 Codex CLI 可以在选定目录读取、修改并运行代码，项目级 `AGENTS.md` 也可以作为它的项目指令来源。citeturn251462search5turn251462search11

我建议你不要一次丢一个“大而全”的任务给 Codex，而是按 **“分析 → 文档台账 → 测试门禁 → 小范围加固 → 运维 runbook → 再分析”** 循环推进。

---

# 0. 总目标

未来你可能有十几个甲方，所以现在的目标不是“为当前甲方赶功能”，而是建立一套可以长期复用的工程体系：

```text
一个产品内核
一个毛绒玩具行业模板
多个客户配置包
少量客户扩展
每客户独立部署 / 数据 / 初始化资料
统一开发、测试、运维门禁
```

当前开发优先级应服务正式汇报中的主线：系统是“岗位入口 + 任务驱动 + 桌面端 / 手机端协同”，第一期重点是订单到出货主链路和手机端任务处理，第二期补异常 / 返工中心，第三期补成本、供应商绩效、外发工厂绩效。fileciteturn0file1 加工合同这类真实样本包含来货要求、交期、结算、纸样附件等信息，应该进入“客户资料 / 行业样本 / 打印模板输入”，不能直接硬编码为通用产品规则。fileciteturn0file0

---

# 1. 30 天开发目标

## D1. 建立产品能力台账

目标：以后判断“系统做完多少”，不看菜单，而看能力成熟度。

要落的文件：

```text
docs/product/capability-ledger.md
docs/product/layer-progress.md
docs/product/release-gates.md
docs/product/customer-delta-policy.md
docs/customers/current/README.md
docs/customers/current/material-inventory.md
docs/customers/current/delta-register.md
```

本阶段只写文档，不改 schema，不改 runtime，不新增 tenant_id。

验收标准：

```text
每个能力都有：
- Capability ID
- Layer
- Scope
- 当前成熟度 L0~L8
- 真源文件
- 是否已有 schema / migration / usecase / API / RBAC / UI / tests / docs
- 下一步
- 风险
```

重点能力先覆盖：

```text
WF-BOSS-APPROVAL
WF-IQC
WF-PURCHASE-INBOUND
WF-OUTSOURCE-QC
WF-FG-QC
WF-FG-INBOUND
WF-SHIPMENT-RELEASE

MD-UNIT
MD-MATERIAL
MD-PRODUCT
MD-WAREHOUSE
MD-CUSTOMER
MD-SUPPLIER

INV-TXN
INV-BALANCE
INV-LOT

PUR-RECEIPT
PUR-RETURN
PUR-ADJUSTMENT

QC-IQC

PROD-ORDER
PROD-MATERIAL-ISSUE
PROD-FG-RECEIPT

SHP-SHIPMENT
SHP-SHIPMENT-ITEM
SHP-RESERVATION
SHP-OUTBOUND

FIN-AR
FIN-AP
FIN-INVOICE
FIN-PAYMENT
FIN-RECONCILIATION

RBAC-ROLE
RBAC-PERMISSION
RBAC-MENU
RBAC-MOBILE

DELIVERY-CONFIG
DELIVERY-SEED
DELIVERY-DEPLOYMENT
DELIVERY-PRINT-TEMPLATE
```

---

## D2. 建立 Workflow / Fact 边界测试目标

目标：防止以后 Codex 或人工误把 Workflow 当成库存 / 出货 / 财务事实层。

优先加固：

```text
server/internal/biz/workflow.go
server/internal/biz/workflow_test.go
docs/architecture/shipment-release-workflow-review.md
web/src/erp/docs/system-layer-progress.md
web/src/erp/docs/productization-delivery.md
```

验收标准：

`shipment_release` 必须明确：

```text
done -> shipping_released
blocked/rejected -> blocked
必须有 reason
空字符串 / 空格 reason 无效
重复提交幂等
同名但非目标任务不触发
settled 状态不再触发特殊 rule
不写 inventory_txns
不写 shipments
不写 reservations
不写 AR / invoice
UI 文案不能写成“已出库”
```

---

## D3. 建立客户资料隔离目标

目标：把当前甲方资料从“产品真源”里剥离出来，但先不大迁移。

要做：

```text
docs/customers/current/material-inventory.md
docs/customers/current/delta-register.md
docs/product/customer-delta-policy.md
```

每个文件 / 样本都打标签：

```text
Product Core Source
Architecture Review
Industry Template Candidate
Customer Material
Demo Seed
QA Debug
Delivery Note
Deprecated
```

对当前样本资料，先标为：

```text
Customer Material
Industry Template Candidate
Demo Seed
Print Template Input
```

不允许标为：

```text
Product Core Source
```

除非经过架构评审。

---

## D4. 建立测试门禁目标

目标：让 Codex 每轮改动后知道跑什么测试，输出什么证据。

分级测试：

```text
T0 只改文档：
- git diff --stat
- grep 检查是否误引入 tenant_id / license / SaaS 运行时
- 不强制跑全量

T1 改前端配置 / docs registry / seed：
cd web
pnpm lint
pnpm css
pnpm test

T2 改前端 UI：
cd web
pnpm lint
pnpm css
pnpm test
pnpm style:l1

T3 改后端 biz / data 非 schema：
cd server
go test ./internal/biz ./internal/data

T4 改 Ent schema：
cd server
make data
make migrate_status
go test ./internal/data ./internal/biz

T5 改部署 / 脚本：
bash scripts/project-scan.sh
bash scripts/project-scan.sh --strict
bash scripts/qa/full.sh

T6 发版前：
bash scripts/qa/strict.sh
cd web && pnpm build:all
cd server && make build
```

---

## D5. 建立运维目标

目标：以后十几个客户部署时，每个客户都有相同交付标准，不靠临时记忆。

要落的文档：

```text
docs/product/ops-runbook.md
docs/product/deployment-checklist.md
docs/product/backup-restore-checklist.md
docs/product/release-checklist.md
docs/customers/current/deployment-notes.md
```

本阶段只写文档，不改生产部署主路径。

运维标准先定：

```text
每客户一套数据库
每客户一套对象存储或附件目录
每客户一套 env
每客户一份初始化数据
每客户一份打印模板配置
每客户一份备份恢复说明
每客户一份版本记录
核心代码不复制分叉
```

不要现在做：

```text
tenant_id
SaaS 多租户
license server
套餐计费
客户工单系统
多租户后台
```

---

# 2. 90 天实施路线

## 第 1 阶段：治理台账，1 周

目标：把现状变成可跟踪的产品能力地图。

改动类型：文档为主。

不改：

```text
schema
runtime
migration
RBAC 结构
部署主路径
```

交付物：

```text
capability-ledger
layer-progress
release-gates
customer-delta-policy
current customer material inventory
current customer delta-register
```

验收命令：

```bash
git diff --stat
bash scripts/project-scan.sh
cd web && pnpm test
```

---

## 第 2 阶段：Workflow 边界加固，1~2 周

目标：先把已经后端化的 7 条 Workflow 规则守住，尤其是 `shipment_release`。

优先做：

```text
done / blocked / rejected 测试
reason 必填测试
空格 reason 测试
重复提交幂等测试
非目标 task 不触发测试
settled 状态不触发测试
shipment_release 不写 fact 测试
前端文案检查
```

验收命令：

```bash
cd server
go test ./internal/biz ./internal/data

cd ../web
pnpm test
```

---

## 第 3 阶段：客户 / 供应商主数据评审，1 周

目标：评审 `customers / suppliers / contacts`，但先不急着写 schema。

输出：

```text
docs/architecture/customer-supplier-masterdata-review.md
```

必须回答：

```text
客户和供应商是否共用 partner 模型？
联系人怎么挂？
开票资料怎么挂？
结算主体怎么挂？
客户订单号和系统订单号怎么关联？
business_records 如何过渡？
哪些字段是行业共性？
哪些字段是客户配置？
```

验收命令：

```bash
git diff --stat
cd web && pnpm test
```

---

## 第 4 阶段：QualityUsecase 与 Workflow 桥接评审，1 周

目标：解决 IQC task 与 `quality_inspections` 的关系。

不能做错：

```text
IQC task done != quality_inspection passed
quality_inspection status 改批次状态
quality_inspection 不写 inventory_txns
不合格退货仍走 purchase_returns
```

输出：

```text
docs/architecture/quality-workflow-bridge-review.md
```

验收命令：

```bash
cd server
go test ./internal/biz ./internal/data
```

---

## 第 5 阶段：生产事实评审，2 周

目标：设计 production order、生产领料、成品入库事实。

输出：

```text
docs/architecture/production-fact-usecase-review.md
```

先评审，不直接大改 schema。

关键边界：

```text
finished_goods_inbound workflow done != finished goods stock posted
生产领料才写 inventory_txns.OUT
成品入库 fact 才写 inventory_txns.IN
返工是否写新事实，不能只靠 workflow 状态
```

---

## 第 6 阶段：ShipmentUsecase 事实层，2~3 周

目标：出货事实与库存预留独立落地。

输出：

```text
shipments
shipment_items
stock_reservations
outbound execution
```

但在 schema 前必须确认：

```text
shipping_released != shipped
shipped 后才可评审 AR
reservation != outbound
available != balance
```

---

## 第 7 阶段：FinanceUsecase 评审，2~3 周

目标：应收、应付、开票、付款、对账口径。

先做评审，不直接写表。

关键问题：

```text
应收从 shipped 来，还是客户对账确认来？
应付从 purchase_receipt posted 来，还是供应商对账确认来？
退货、调整、扣款如何影响对账？
发票和付款是否独立事实？
```

---

## 第 8 阶段：API / UI / 帮助中心接入，持续推进

原则：

```text
一个 fact usecase 成熟后，再接 API/UI
不要 UI 抢跑
不要前端本地补后端事实
不要把 debug 页当业务页
```

---

# 3. Codex 使用总原则

建议你每次给 Codex 的任务都包含 7 部分：

```text
1. 必读文件
2. 任务目标
3. 允许修改的文件范围
4. 禁止事项
5. 需要输出的文件 / 测试
6. 验收命令
7. 最终回复格式
```

不要写：

```text
帮我把产品化都做好
帮我重构一下
把 SaaS 做了
把客户配置做一下
```

要写：

```text
只做文档台账，不改 runtime，不改 schema。
只加测试，不改业务行为。
只做 shipment_release 边界加固，不写库存/出货/财务事实。
```

---

# 4. Codex 通用前置提示词

每个任务前都可以先贴这段：

```text
你在 plush-toy-erp 仓库中工作。

必须先读：
- AGENTS.md
- README.md
- docs/current-source-of-truth.md
- scripts/README.md
- web/src/erp/docs/system-layer-progress.md
- web/src/erp/docs/productization-delivery.md

工作约束：
1. 不要大爆炸式重构。
2. 不要新增 tenant_id。
3. 不要实现 SaaS 多租户。
4. 不要实现 license server、套餐计费、客户工单系统。
5. 不要把当前甲方资料硬编码进 Product Core。
6. 不要把 WorkflowUsecase 改成库存、出货、财务事实真源。
7. 不要重复设计已有 products / materials / units / warehouses / inventory_txns / inventory_balances / inventory_lots / purchase_receipts / quality_inspections。
8. 如果改正式文档或代码，按 AGENTS.md 要求更新 progress.md。
9. 先说明计划，再修改文件。
10. 修改后必须输出：
   - 改了哪些文件
   - 为什么改
   - 没改哪些文件
   - 跑了哪些命令
   - 哪些测试没跑，原因是什么
   - 下一步建议

最终回复必须用以下格式：

【完成】
【改动文件】
【没有改的内容】
【测试命令与结果】
【风险】
【下一步建议】
```

---

# 5. Codex 任务 1：建立产品能力台账

直接复制给 Codex：

```text
任务：建立产品能力台账和分层进度文档。本轮只做文档，不改代码，不改 schema，不改 runtime，不改 migration，不移动现有目录。

必须先读：
- AGENTS.md
- README.md
- docs/current-source-of-truth.md
- docs/architecture/workflow-usecase-review.md
- docs/architecture/shipment-release-workflow-review.md
- docs/architecture/shipment-inventory-boundary-review.md
- docs/architecture/shipment-usecase-review.md
- docs/changes/phase-2a-inventory-fact-schema.md
- docs/changes/phase-2b-bom-lot-schema.md
- docs/changes/phase-2c-purchase-receipt-schema.md
- docs/changes/phase-2d-purchase-return-schema.md
- docs/changes/phase-2d-purchase-receipt-adjustment-schema.md
- docs/changes/phase-2d-lot-status-guard.md
- docs/changes/phase-2d-quality-inspection-schema.md
- web/src/erp/docs/system-layer-progress.md
- web/src/erp/docs/productization-delivery.md
- server/internal/biz/workflow.go
- server/internal/biz/rbac.go
- server/internal/data/model/schema
- server/internal/data 里 inventory / purchase / quality 相关代码

请新增或补充以下文档：
- docs/product/capability-ledger.md
- docs/product/layer-progress.md
- docs/product/release-gates.md

文档要求：
1. capability-ledger.md 用表格列出能力编号、能力名称、层级、当前成熟度 L0~L8、当前真源文件、缺口、下一步、风险。
2. layer-progress.md 按 Product Core、Industry Template、Tenant Config、Customer Extension、Workflow、MasterData、Fact、RBAC、API/UI、Help/QA、Productization/Delivery、Reporting/Audit/Integration 分层。
3. release-gates.md 定义每层 Definition of Done，尤其要区分 Workflow done 与 Fact posted。
4. 明确写出当前不做 tenant_id、不做真正 SaaS、多租户、license server、套餐计费、客户工单系统。
5. 当前甲方资料只能标为 Customer Material / Demo Seed / Industry Template Candidate，不得当成 Product Core Source。
6. 如果 docs/product 目录不存在，可以创建。
7. 不要改 web/src/erp/config/docs.mjs，不要改 seedData.mjs，不要把新文档接入前端帮助中心。

验收命令：
- git diff --stat
- cd web && pnpm test

如果 pnpm test 因环境依赖失败，请输出失败原因和关键日志，不要继续乱改。

最终输出：
【完成】
【新增/修改文件】
【关键结论】
【测试命令与结果】
【未覆盖项】
【建议给 GPT 分析的下一步问题】
```

---

# 6. Codex 任务 2：建立当前甲方资料隔离清单

复制给 Codex：

```text
任务：建立当前甲方资料隔离清单。本轮只写文档，不移动文件，不改 docs registry，不改 seedData，不改 runtime。

必须先读：
- AGENTS.md
- README.md
- docs/current-source-of-truth.md
- web/src/erp/config/seedData.mjs
- web/src/erp/config/docs.mjs
- web/src/erp/docs/productization-delivery.md
- web/src/erp/docs/system-layer-progress.md

请新增：
- docs/customers/current/README.md
- docs/customers/current/material-inventory.md
- docs/customers/current/delta-register.md
- docs/product/customer-delta-policy.md

要求：
1. material-inventory.md 列出仓库中当前甲方相关资料、样本、截图、Excel、PDF、字段口径、菜单说明、seed/demo/test 入口。
2. 每项标记 classification：
   - Product Core Source
   - Architecture Review
   - Industry Template Candidate
   - Customer Material
   - Demo Seed
   - QA Debug
   - Delivery Note
   - Deprecated
3. 对当前真实样本，默认不要标为 Product Core Source。
4. delta-register.md 记录当前客户差异项：需求、业务原因、可否配置化、是否影响 Workflow、是否影响 Fact、是否影响财务、建议处理方式。
5. customer-delta-policy.md 定义未来十几个甲方提需求时如何分类：
   - Product Core
   - Industry Template
   - Tenant Config
   - Customer Extension
   - Data Import Adapter
   - Print Template
6. 明确禁止把客户特殊流程、特殊字段、特殊报表写死进核心 usecase。
7. 不创建 config/tenants，不创建 deployments，不创建 extensions。
8. 不新增 tenant_id。

验收命令：
- git diff --stat
- grep -R "tenant_id" docs/product docs/customers || true
- cd web && pnpm test

最终输出：
【完成】
【新增/修改文件】
【客户资料分类摘要】
【发现的甲方耦合风险】
【测试命令与结果】
【未覆盖项】
【建议给 GPT 分析的下一步问题】
```

---

# 7. Codex 任务 3：建立测试门禁文档

复制给 Codex：

```text
任务：建立开发测试门禁文档。本轮只写文档，不改测试脚本，不改代码。

必须先读：
- AGENTS.md
- README.md
- scripts/README.md
- server/Makefile
- web/package.json
- docs/current-source-of-truth.md
- web/src/erp/docs/system-layer-progress.md

请新增：
- docs/product/test-strategy.md
- docs/product/engineering-gates.md

要求：
1. test-strategy.md 定义 T0~T6 测试等级：
   T0 只改文档
   T1 改前端配置 / docs / seed
   T2 改 UI
   T3 改后端 biz/data 非 schema
   T4 改 Ent schema
   T5 改部署 / 脚本
   T6 发版前
2. 每个等级写清楚必须跑的命令。
3. engineering-gates.md 定义每类改动的验收要求：
   - Workflow
   - Fact / Inventory / Purchase / Quality / Shipment / Finance
   - RBAC / API
   - Frontend menu/docs/seed
   - Productization / Delivery
   - Ops / Deployment
4. 明确自动化测试通过只是必要条件，不是充分条件，还要检查架构边界、权限边界、事实真源和产品化约束。
5. 不修改 scripts/qa/*，只记录现有命令。

可引用命令：
- bash scripts/qa/fast.sh
- bash scripts/qa/full.sh
- bash scripts/qa/strict.sh
- bash scripts/project-scan.sh
- bash scripts/project-scan.sh --strict
- cd web && pnpm lint
- cd web && pnpm css
- cd web && pnpm test
- cd web && pnpm style:l1
- cd web && pnpm build:all
- cd server && go test ./internal/biz ./internal/data
- cd server && make data
- cd server && make migrate_status
- cd server && make build

验收命令：
- git diff --stat
- cd web && pnpm test

最终输出：
【完成】
【新增/修改文件】
【测试门禁摘要】
【测试命令与结果】
【未覆盖项】
【建议给 GPT 分析的下一步问题】
```

---

# 8. Codex 任务 4：shipment_release Workflow 边界测试加固

这个任务开始可能会改测试代码。复制给 Codex：

```text
任务：加固 shipment_release Workflow 后端规则测试。本轮优先加测试和文档说明，除非测试暴露真实 bug，否则不要改业务实现。

必须先读：
- AGENTS.md
- docs/current-source-of-truth.md
- docs/architecture/workflow-usecase-review.md
- docs/architecture/shipment-release-workflow-review.md
- docs/architecture/shipment-inventory-boundary-review.md
- server/internal/biz/workflow.go
- server/internal/biz/workflow_test.go
- server/internal/biz/rbac.go

目标：
1. 确认 shipment_release task done 后只推进业务状态为 shipping_released。
2. 确认 blocked / rejected 后只推进 blocked，并强制 reason。
3. 确认空字符串 / 全空格 reason 无效。
4. 确认重复提交幂等。
5. 确认同名但非目标任务不触发 shipment_release rule。
6. 确认 settled 状态不再触发特殊 rule。
7. 确认 WorkflowUsecase 不写库存、出货、财务事实。
8. 如已有测试覆盖，请不要重复造大量相似测试；先补缺口。
9. 如果需要更新文档，只更新 shipment-release 相关边界，不改产品化大路线。
10. 不新增 schema，不新增 migration，不新增 tenant_id。

允许修改：
- server/internal/biz/workflow_test.go
- server/internal/biz/workflow.go 仅限修复测试暴露的真实边界 bug
- docs/architecture/shipment-release-workflow-review.md
- progress.md

禁止修改：
- server/internal/data/model/schema
- migration
- InventoryUsecase / ShipmentUsecase / FinanceUsecase 的事实逻辑
- web 前端大范围 UI

验收命令：
- cd server && go test ./internal/biz ./internal/data
- cd web && pnpm test

最终输出：
【完成】
【新增/修改文件】
【测试覆盖点】
【测试命令与结果】
【没有改的内容】
【风险】
【建议给 GPT 分析的下一步问题】
```

---

# 9. Codex 任务 5：运维 runbook 与多客户私有化交付清单

复制给 Codex：

```text
任务：建立运维 runbook 与多客户私有化交付清单。本轮只写文档，不改 compose，不改部署脚本，不新增 deployments/<tenant-key> 目录。

必须先读：
- AGENTS.md
- README.md
- docs/current-source-of-truth.md
- docs/deployment-conventions.md
- server/deploy/README.md
- server/deploy/compose/prod/README.md
- scripts/README.md
- web/src/erp/docs/productization-delivery.md

请新增：
- docs/product/ops-runbook.md
- docs/product/deployment-checklist.md
- docs/product/backup-restore-checklist.md
- docs/product/release-checklist.md
- docs/customers/current/deployment-notes.md

要求：
1. 明确当前唯一部署主路径仍是 server/deploy/compose/prod。
2. 第一阶段是单客户私有化部署 + 配置预留。
3. 第二阶段才是多客户私有化部署，每客户一套数据库 / 对象存储 / env / 初始化数据 / 打印模板，代码版本统一。
4. 第三阶段才评审 SaaS 多租户。
5. 不要建议每个客户复制完整代码长期维护。
6. 不要新增 tenant_id。
7. 不要实现 license server、套餐计费、客户工单系统。
8. deployment-checklist.md 要包含：
   - env 检查
   - 默认密码替换
   - DB DSN 检查
   - migration status
   - 健康检查
   - 前端 1 桌面 + 8 移动端入口检查
   - smoke 检查
   - 回滚方式
9. backup-restore-checklist.md 要包含：
   - 数据库备份
   - 附件 / 对象存储备份
   - 恢复演练
   - 客户版本记录
10. release-checklist.md 要包含：
   - 测试门禁
   - migration 检查
   - 镜像标签
   - 升级窗口
   - 回滚计划
   - 客户通知
   - 上线后检查

验收命令：
- git diff --stat
- bash scripts/project-scan.sh
- cd web && pnpm test

最终输出：
【完成】
【新增/修改文件】
【运维清单摘要】
【测试命令与结果】
【没有改的内容】
【风险】
【建议给 GPT 分析的下一步问题】
```

---

# 10. Codex 任务 6：README / docs 索引最小接入

这个任务用于让新文档不丢，但仍不要接前端帮助中心。

复制给 Codex：

```text
任务：把新增产品治理文档接入仓库级 docs 索引。本轮只改 README/docs 索引，不改 web/src/erp/config/docs.mjs，不改前端帮助中心。

必须先读：
- AGENTS.md
- README.md
- docs/README.md
- docs/current-source-of-truth.md
- docs/product/capability-ledger.md
- docs/product/layer-progress.md
- docs/product/release-gates.md
- docs/product/customer-delta-policy.md
- docs/product/test-strategy.md
- docs/product/engineering-gates.md
- docs/product/ops-runbook.md
- docs/product/deployment-checklist.md
- docs/product/backup-restore-checklist.md
- docs/product/release-checklist.md
- docs/customers/current/README.md

目标：
1. 在 docs/README.md 增加产品治理文档索引。
2. 在 docs/current-source-of-truth.md 增加一段说明：这些文档是产品化治理与交付台账，不替代 runtime 代码真源。
3. 不把这些文档加入 web/src/erp/config/docs.mjs。
4. 不改 seedData。
5. 不移动旧文档。

验收命令：
- git diff --stat
- cd web && pnpm test

最终输出：
【完成】
【修改文件】
【索引变化】
【测试命令与结果】
【风险】
【建议给 GPT 分析的下一步问题】
```

---

# 11. Codex 任务 7：客户 / 供应商主数据评审文档

复制给 Codex：

```text
任务：编写 customers / suppliers 主数据评审文档。本轮只写架构评审，不新增 schema，不新增 migration，不改 runtime。

必须先读：
- AGENTS.md
- README.md
- docs/current-source-of-truth.md
- docs/plush-erp-data-model.md
- docs/architecture/workflow-usecase-review.md
- web/src/erp/config/businessModules.mjs
- web/src/erp/config/businessRecordDefinitions.mjs
- server/internal/data/model/schema/product.go
- server/internal/data/model/schema/material.go
- server/internal/data/model/schema/unit.go
- server/internal/data/model/schema/warehouse.go
- server/internal/data/model/schema/business_record.go

请新增：
- docs/architecture/customer-supplier-masterdata-review.md

文档必须回答：
1. 当前 business_records / partners 页面能做什么，不能做什么。
2. 为什么 customers / suppliers 需要正式主数据。
3. 是否建议 customer/supplier 共用 partner 模型，还是分表。
4. 最小字段候选：
   - name
   - code
   - type
   - status
   - contacts
   - phone
   - address
   - tax info
   - settlement terms
   - invoice title
   - remark
5. 哪些字段属于 Product Core，哪些属于 Industry Template，哪些应进入 Tenant Config。
6. 与 orders、purchase_receipts、purchase_returns、quality_inspections、future shipments、future AR/AP 的关系。
7. 不要重复设计 products / materials / units / warehouses。
8. 不要引入 tenant_id。
9. 下一步如果落 schema，需要哪些测试和 migration 检查。

验收命令：
- git diff --stat
- cd web && pnpm test

最终输出：
【完成】
【新增文件】
【核心建议】
【测试命令与结果】
【风险】
【建议给 GPT 分析的下一步问题】
```

---

# 12. Codex 任务 8：Quality 与 Workflow 桥接评审文档

复制给 Codex：

```text
任务：编写 QualityUsecase 与 Workflow IQC 桥接评审文档。本轮只写评审，不改代码，不新增 schema。

必须先读：
- AGENTS.md
- docs/current-source-of-truth.md
- docs/architecture/workflow-usecase-review.md
- docs/changes/phase-2d-quality-inspection-schema.md
- docs/changes/phase-2d-lot-status-guard.md
- server/internal/biz/workflow.go
- server/internal/biz/inventory.go
- server/internal/data/model/schema/quality_inspection.go
- server/internal/data/model/schema/inventory_lot.go
- server/internal/data/quality_inspection_repo.go
- server/internal/data/inventory_repo.go

请新增：
- docs/architecture/quality-workflow-bridge-review.md

文档必须明确：
1. workflow IQC task done 不等于 quality_inspection passed。
2. quality_inspections 是采购入库后材料批次质检状态 / 判定真源。
3. quality inspection 改 lot status，不写 inventory_txns，不改 inventory_balances。
4. 不合格退供应商仍走 purchase_returns。
5. Workflow 可以展示质检任务和协同状态，但不能替代 QualityUsecase。
6. 桥接方案至少给两个选项：
   - 先保持分离，只在 UI 链接 task 与 inspection
   - 后续用 QualityUsecase action 驱动 task 状态
7. 推荐低风险路线。
8. 列出需要问甲方的质检问题。
9. 不新增 tenant_id。
10. 不改 schema。

验收命令：
- git diff --stat
- cd server && go test ./internal/biz ./internal/data

最终输出：
【完成】
【新增文件】
【推荐桥接方案】
【测试命令与结果】
【风险】
【建议给 GPT 分析的下一步问题】
```

---

# 13. Codex 输出后，你怎么复制给 GPT 分析

每次 Codex 做完，不要只复制“完成了”。你要复制下面这些内容给我，我才能给你下一轮更准的提示词。

## 复制模板

```text
这是 Codex 本轮输出，请你基于输出和仓库目标，判断下一步应该给 Codex 什么提示词。

【我的目标】
[例如：继续做产品化治理 / 加固 workflow / 做客户主数据评审 / 做测试门禁]

【Codex 原始任务】
[把你发给 Codex 的提示词复制过来]

【Codex 完成摘要】
[复制 Codex 的完成摘要]

【改动文件】
[复制 Codex 列出的文件清单]

【关键 diff 摘要】
[复制 git diff --stat]
[如果有重要 diff，可以复制相关片段，不要全量大 diff]

【测试命令与结果】
[复制 Codex 跑的命令和结果]
[失败日志只复制关键 50~100 行]

【Codex 自己说的风险】
[复制风险]

【Codex 建议的下一步】
[复制下一步]

【我希望你输出】
1. 判断这轮是否合格。
2. 找出是否违反：
   - Workflow / Fact 边界
   - 客户资料硬编码
   - tenant_id / SaaS 提前实现
   - 重复设计已有真源
   - 测试不足
3. 给我下一条可以直接复制给 Codex 的提示词。
```

---

# 14. GPT 收到 Codex 输出后，我会怎么判断

我会按这 8 个门禁判断：

```text
1. 是否读了必须读的文件
2. 是否改了允许范围外的文件
3. 是否新增 tenant_id / SaaS / license / 套餐 / 工单
4. 是否把当前甲方样本当成通用产品规则
5. 是否混淆 Workflow done 与 Fact posted
6. 是否重复设计已有主数据 / 事实表
7. 是否跑了匹配改动类型的测试
8. 是否更新 progress.md 或说明为什么没更新
```

然后我会输出：

```text
- 这轮是否可以接受
- 哪些地方要回滚 / 修正
- 哪些地方可以保留
- 下一轮 Codex 提示词
- 下一轮验收命令
```

---

# 15. 你可以从这条 Codex 提示词开始

建议第一条就用这个，不要先做功能代码：

```text
你在 plush-toy-erp 仓库中工作。

本轮任务：建立产品能力台账、分层进度和 release gates。只做文档，不改代码，不改 schema，不改 runtime，不改 migration，不移动现有目录，不接入前端 docs registry。

必须先读：
- AGENTS.md
- README.md
- docs/current-source-of-truth.md
- scripts/README.md
- docs/architecture/workflow-usecase-review.md
- docs/architecture/shipment-release-workflow-review.md
- docs/architecture/shipment-inventory-boundary-review.md
- docs/architecture/shipment-usecase-review.md
- docs/changes/phase-2a-inventory-fact-schema.md
- docs/changes/phase-2b-bom-lot-schema.md
- docs/changes/phase-2c-purchase-receipt-schema.md
- docs/changes/phase-2d-purchase-return-schema.md
- docs/changes/phase-2d-purchase-receipt-adjustment-schema.md
- docs/changes/phase-2d-lot-status-guard.md
- docs/changes/phase-2d-quality-inspection-schema.md
- web/src/erp/docs/system-layer-progress.md
- web/src/erp/docs/productization-delivery.md
- server/internal/biz/workflow.go
- server/internal/biz/rbac.go
- server/internal/data/model/schema
- server/internal/data 中 inventory / purchase / quality 相关代码

请新增：
- docs/product/capability-ledger.md
- docs/product/layer-progress.md
- docs/product/release-gates.md

要求：
1. capability-ledger.md 用表格列出能力编号、能力名称、层级、Scope、当前成熟度 L0~L8、当前真源文件、缺口、下一步、风险。
2. layer-progress.md 按 Product Core、Industry Template、Tenant Config、Customer Extension、Workflow、MasterData、Fact、RBAC、API/UI、Help/QA、Productization/Delivery、Reporting/Audit/Integration 分层。
3. release-gates.md 定义每层 Definition of Done，尤其明确 Workflow task done 不等于 Fact posted。
4. 明确当前不做 tenant_id、不做真正 SaaS 多租户、不做 license server、不做套餐计费、不做客户工单系统。
5. 当前甲方资料只能作为 Customer Material / Demo Seed / Industry Template Candidate，不得作为 Product Core Source。
6. 不要改 web/src/erp/config/docs.mjs。
7. 不要改 web/src/erp/config/seedData.mjs。
8. 不要移动现有文档。
9. 如果改了正式文档，按 AGENTS.md 检查是否需要更新 progress.md。

验收命令：
- git diff --stat
- cd web && pnpm test

最终回复必须包含：
【完成】
【新增/修改文件】
【关键结论】
【测试命令与结果】
【未覆盖项】
【风险】
【建议给 GPT 分析的下一步问题】
```

---

# 16. 当前执行顺序建议

你接下来按这个顺序让 Codex 做：

```text
1. 产品能力台账
2. 当前甲方资料隔离清单
3. 测试门禁文档
4. 运维 runbook / 发布清单
5. docs 索引最小接入
6. shipment_release 后端测试加固
7. customers / suppliers 主数据评审
8. Quality ↔ Workflow 桥接评审
```

前 5 个主要是治理和文档，风险低；第 6 个开始进入代码测试加固；第 7、8 个继续评审，不急着落 schema。这样最适合你未来扩展到十几个甲方：先建立可复制的工程制度，再逐步补核心事实能力。

### 010. user

_time `2026-05-13T23:18:33+08:00` · content_type `text` · node `3e7df29b-8379-4336-ba0f-3aa6a3617330`_

目前给来的文件就是甲方的全部了，建议怎么从模糊的需求慢慢做得清晰，也就是和甲方不断提业务需求改进意见，就算提什么业务需求，都可以方便修改，这只是一个甲方，从这个甲方开头，是不是要把这个甲方也算做租户

### 011. assistant

_time `2026-05-13T23:24:12+08:00` · content_type `text` · node `dff52c4b-590f-4853-9a42-a94bfb29c3ed`_

可以从这个甲方开始做，而且**应该把它当成“种子客户 / 第一个私有化客户实例 / 第一个客户配置包”来管理**；但**不要把它当成 SaaS 运行时租户**。也就是说：业务和交付管理上可以有 `customer_key` / `tenant_key`，但代码和数据库里现在不要加 `tenant_id`，不要改 RBAC 多租户，不要做真正 SaaS。

当前这些文件已经足够开始做第一轮，但不够一次性定完整 ERP。正式汇报文件已经给出了项目方向：岗位入口、任务驱动、桌面端 + 手机端，第一期先打通订单到出货主链路，第二期补异常 / 返工中心，第三期补成本、供应商绩效和外发工厂绩效。fileciteturn0file1 加工合同样本也说明委外加工里已经有来货要求、交期、违约、结算、纸样附件等真实业务痕迹，这些应该作为“需求线索”和“打印模板输入”，而不是直接硬编码成通用产品规则。fileciteturn0file0

---

# 1. 先定一个原则：甲方资料不是最终需求，是“需求种子”

你现在手上这些资料应该这样看：

| 资料类型 | 应该怎么用 | 不应该怎么用 |
|---|---|---|
| Excel 材料表 / 订单表 | 抽字段、看业务语言、找主数据和单据关系 | 不要直接把所有列变成系统固定字段 |
| 加工合同 | 抽委外加工、交期、结算、附件、打印模板需求 | 不要直接把合同条款写成所有客户通用规则 |
| 正式汇报 PDF | 当作老板沟通、岗位入口、实施阶段的方向 | 不要当成完整需求说明书 |
| 截图 / 样表 | 当作原型和数据导入依据 | 不要当成产品 UI 最终版 |
| 当前源码里的 seed / docs | 当作样本、演示和现状说明 | 不要当成 Product Core 真源 |

所以后续不是“问甲方把所有需求一次性说清楚”，而是做一个可反复迭代的闭环：

```text
资料线索
  -> 需求假设
    -> 业务确认
      -> 原型 / 小功能
        -> 试用反馈
          -> 需求变更
            -> 分类进入配置 / 模板 / 产品内核 / 客户扩展
```

---

# 2. 这个甲方要不要算租户？

## 结论

**要算，但只在“交付管理 / 配置管理”意义上算。**

不要在“数据库多租户 / SaaS runtime”意义上算。

推荐你内部这样命名：

```text
customer_key: current
tenant_key: current-private
deployment_instance: current-prod
template: plush-industry
core_version: 0.x
config_version: current-2026.xx
```

## 三种口径要分清

| 口径 | 是否把甲方算租户 | 说明 |
|---|---:|---|
| 业务口径 | 是 | 这是第一个真实客户，第一个种子客户 |
| 交付口径 | 是 | 这是第一个私有化部署实例 / 客户配置包 |
| 数据库运行时口径 | 否 | 当前不加 `tenant_id`，不做 SaaS 多租户 |

也就是：

```text
可以有：
docs/customers/current/
config draft: current-private
deployment notes: current-prod

暂时不要有：
数据库 tenant_id
多租户中间件
租户隔离 RBAC
SaaS license / billing / 工单系统
```

这样做的好处是：你未来有十几个甲方时，每个客户都有自己的交付资料、配置草案、初始化数据、打印模板、差异台账；但核心代码仍是一套。

---

# 3. 怎么从模糊需求慢慢做清晰

建议你建立一个固定流程：**需求三账本 + 每周小确认 + 每月小版本**。

## 3.1 三个账本

### 账本一：需求线索台账

把所有文件里看到的东西先记录下来，不急着判断对错。

字段建议：

```text
来源文件
页码 / 表格 / 截图位置
原始内容
可能涉及的业务模块
我们当前理解
是否已向甲方确认
下一步问题
```

例子：

| 来源 | 原始线索 | 我们理解 | 状态 |
|---|---|---|---|
| 加工合同 | 来货要求、交期、违约、结算、纸样附件 | 可能涉及委外加工单、委外回货、结算、附件留档 | 待确认 |
| 正式汇报 PDF | 岗位入口、任务驱动、手机端 | 系统主线应该围绕任务，而不是复杂菜单 | 已作为产品方向 |
| 材料明细表 | 产品编号、材料、用量、颜色、损耗 | 可能是 BOM / 物料 / 采购需求来源 | 待确认 |

### 账本二：需求假设台账

把你根据资料推断出来的内容，全部标为“假设”，不要直接开发成真规则。

字段建议：

```text
假设编号
业务假设
为什么这么猜
影响模块
如果猜错的影响
需要问甲方的问题
确认结果
```

例子：

```text
H-001:
我们假设“出货放行”和“实际出库”是两个动作。
原因：当前系统已有 shipment_release workflow，但还没有 shipment fact。
影响：库存、出货、财务。
问题：甲方现场说“放行”时，是允许发货，还是仓库已经发出？
```

### 账本三：决策台账

只记录已经确认的东西。

字段建议：

```text
决策编号
决策内容
适用范围
属于产品内核 / 行业模板 / 客户配置 / 客户扩展
确认人
确认日期
后续是否可变
```

例子：

```text
D-001:
第一期先做订单到出货主链路，不先做完整成本核算。
适用范围：current 客户试点。
归类：实施阶段。
```

---

# 4. 让甲方不断提意见，但系统还能方便改

这里要特别注意：**不是所有需求都应该“方便随便改”**。ERP 里库存、出货、财务是事实层，不能像表单一样随意变。真正可持续的做法是把变化分层。

## 4.1 需求分类规则

甲方无论提什么，先分到下面几类：

| 需求类型 | 例子 | 处理方式 | 修改难度 |
|---|---|---|---|
| 菜单开关 | 财务暂时不用、委外暂时隐藏 | Tenant Config | 低 |
| 字段显示 / 必填 | 客户订单号必填、某字段隐藏 | Tenant Config | 低 |
| 编号规则 | 采购单号、加工单号格式 | Tenant Config | 低 |
| 打印模板 | 加工合同、送货单格式 | Print Template | 低~中 |
| 角色权限 | 老板、业务、仓库、品质能看什么 | RBAC 模板 + 客户配置 | 中 |
| Workflow 协同 | 谁审核、谁确认、谁放行 | Workflow 规则 / 模板 | 中 |
| 主数据 | 客户、供应商、材料、产品、仓库 | Product Core schema | 中~高 |
| 事实规则 | 库存扣减、出货确认、应收生成 | Product Core Fact | 高，必须评审 |
| 报表 | 老板看板、对账表、绩效表 | Reporting | 中 |
| Excel 导入 | 客户独特表格格式 | Data Import Adapter | 中 |
| 客户专属逻辑 | 某客户独有算法 | Customer Extension | 高，慎用 |

这样甲方可以不断提需求，但每个需求不会直接污染核心代码。

---

## 4.2 变化点应该集中在哪里

建议把“容易变”的东西放在配置 / 模板里：

```text
公司名
logo
主题色
菜单开关
模块开关
字段显示
字段必填
编号规则
打印模板
角色模板
权限模板
默认仓库
默认单位
初始化数据
导入模板
报表筛选项
```

把“不该随便变”的东西放在 Product Core：

```text
库存流水
库存余额
批次
采购入库
采购退货
采购调整
质检判定
出货事实
库存预留
实际出库
应收
应付
发票
付款
对账
```

一句话：

**表面差异配置化，行业共性模板化，事实规则产品化，极少数个性扩展化。**

---

# 5. 从这个甲方开头，怎么避免被它绑死

我建议使用一个简单规则：**一客一配置，三客成模板。**

| 出现次数 | 怎么处理 |
|---:|---|
| 只有当前甲方需要 | 先放客户配置 / 客户资料 / 客户差异台账 |
| 第二个甲方也需要 | 标记为 Industry Template Candidate |
| 第三个甲方也需要 | 才考虑上升为行业模板默认规则 |
| 涉及库存 / 出货 / 财务事实 | 不管几个客户，都必须 Product Core 架构评审 |
| 只是打印格式 / 字段显示 | 不进核心，走配置或模板 |

这样当前甲方可以作为起点，但不会把系统做成“只适合这一家”。

---

# 6. 推荐的需求澄清节奏

## 第 0 步：把现有资料冻结成 Baseline 0

先告诉自己和甲方：

```text
当前文件不是最终需求说明书。
当前文件是第一版需求线索。
后续每周通过原型和问题清单确认。
```

产出：

```text
docs/customers/current/source-materials.md
docs/customers/current/requirement-clues.md
docs/customers/current/assumption-register.md
docs/customers/current/question-backlog.md
docs/customers/current/decision-log.md
```

## 第 1 步：先按岗位问，不按模块问

不要一上来问“你们要什么功能”。业务人员通常说不清。应该问：

```text
老板每天最怕什么？
业务员每天最常录什么？
PMC 每天最常催什么？
采购每天最怕漏什么？
仓库每天最怕错什么？
品质每天最常判什么？
生产经理每天最想看什么？
财务月底最痛苦什么？
```

这比问“客户模块需要哪些字段”有效得多。

## 第 2 步：先做主链路，不做全功能

按照正式汇报文件的实施建议，第一期应该先打通订单到出货主链路和手机端任务处理。fileciteturn0file1

第一期建议只聚焦：

```text
订单 / 款式立项
老板审批
工程资料 / BOM
采购需求
采购入库
来料质检
生产 / 委外任务
成品质检
出货放行
实际出库
```

财务先做“口径确认”和“对账原型”，不要马上做完整 AR/AP。

## 第 3 步：用原型逼出需求

每周拿一个小原型给甲方看：

```text
本周只确认订单创建
下周只确认 BOM
再下周只确认采购入库
再下周只确认质检
再下周只确认出货放行
```

每次只问三类问题：

```text
这个页面你们看得懂吗？
这个流程和你们现场一致吗？
出了异常怎么办？
```

## 第 4 步：每个反馈都变成变更卡

不要口头记需求。每个意见都写成卡片：

```text
需求编号：
甲方原话：
业务场景：
当前系统表现：
希望改成什么：
属于配置 / 模板 / 产品内核 / 扩展：
是否影响库存：
是否影响出货：
是否影响财务：
优先级：
验收方式：
```

## 第 5 步：每月只发一个小版本

不要每天被意见牵着改核心。

建议节奏：

```text
每周：收集反馈 + 原型确认
每两周：小功能迭代
每月：稳定版本 + 客户验收
```

---

# 7. 当前最适合的实施路线

## 阶段 A：需求治理，不写大功能

目标：把模糊资料整理成可开发台账。

做：

```text
source-materials.md
requirement-clues.md
assumption-register.md
question-backlog.md
decision-log.md
customer-config-draft.md
delta-register.md
```

不做：

```text
tenant_id
SaaS
大 schema
大目录迁移
客户专属代码
```

## 阶段 B：主链路原型

目标：让甲方围绕真实流程提意见。

做：

```text
订单立项
老板审批
BOM / 材料
采购
质检
委外
生产
出货放行
```

这里的原型可以先不完整，但必须暴露关键问题：

```text
谁填？
谁审？
谁改？
什么时候不能改？
异常怎么办？
```

## 阶段 C：配置项沉淀

把甲方提的变化分类成：

```text
菜单配置
字段配置
编号规则
打印模板
角色权限
初始化数据
导入模板
```

## 阶段 D：核心事实补齐

按顺序做：

```text
customers / suppliers
production facts
shipment facts
finance facts
```

不要跳过 shipment facts 直接做 finance。因为应收、发票、对账要依赖真实出货，而不是 workflow 放行。

## 阶段 E：客户配置包

等配置项稳定后，再建立：

```text
config/tenants/current/
```

但这仍然只是**客户配置包**，不是 SaaS 多租户。

---

# 8. 给 Codex 的下一步提示词

建议下一步先让 Codex 建立“需求澄清与客户实例管理文档”，不要直接写功能。

可以直接复制：

```text
你在 plush-toy-erp 仓库中工作。

本轮任务：建立 current 甲方的需求澄清台账与客户实例管理文档。只写文档，不改代码，不改 schema，不改 runtime，不改 migration，不新增 tenant_id，不创建 SaaS 多租户能力。

必须先读：
- AGENTS.md
- README.md
- docs/current-source-of-truth.md
- web/src/erp/docs/system-layer-progress.md
- web/src/erp/docs/productization-delivery.md
- web/src/erp/config/seedData.mjs
- web/src/erp/config/docs.mjs
- docs/architecture/workflow-usecase-review.md
- docs/architecture/shipment-release-workflow-review.md
- docs/architecture/shipment-usecase-review.md

请新增：
- docs/customers/current/source-materials.md
- docs/customers/current/requirement-clues.md
- docs/customers/current/assumption-register.md
- docs/customers/current/question-backlog.md
- docs/customers/current/decision-log.md
- docs/customers/current/customer-config-draft.md
- docs/customers/current/change-request-process.md
- docs/product/customer-instance-policy.md

要求：

1. source-materials.md
   - 列出当前甲方相关资料来源。
   - 标记每项资料用途：
     Customer Material / Demo Seed / Industry Template Candidate / Print Template Input / QA Debug。
   - 明确当前资料不是 Product Core 真源。

2. requirement-clues.md
   - 从现有资料和 seedData.mjs 中抽取需求线索。
   - 按业务域分类：
     客户/订单/款式、产品/SKU/BOM、采购、委外、入库/质检、生产、出货、财务、手机端、权限、打印模板、部署交付。
   - 每条线索都要标记：
     来源、当前理解、是否已确认、下一步要问的问题。

3. assumption-register.md
   - 记录当前只能推断、不能直接开发成规则的假设。
   - 每条假设包含：
     假设内容、依据、影响模块、如果猜错的风险、需要甲方确认的问题。

4. question-backlog.md
   - 用业务人员能看懂的话列问题。
   - 按岗位分组：
     老板、业务、工程/PMC、采购、仓库、品质、生产经理、财务。
   - 不要问技术术语。

5. decision-log.md
   - 建立决策记录模板。
   - 当前只记录已在文档中明确的项目方向：
     岗位入口、任务驱动、桌面端 + 手机端、第一期订单到出货主链路。
   - 其他未确认内容不要写成已决策。

6. customer-config-draft.md
   - 定义 current 客户未来可能配置的内容：
     公司名、logo、主题、菜单开关、模块开关、字段显示/必填、编号规则、打印模板、角色模板、初始化数据、默认仓库、默认单位。
   - 明确这只是配置草案，不是 runtime tenant。

7. change-request-process.md
   - 定义甲方后续提需求时如何分类：
     Tenant Config、Industry Template、Product Core、Customer Extension、Data Import Adapter、Print Template、Reporting。
   - 对每类写处理方式和是否需要架构评审。
   - 明确涉及库存、出货、财务事实的需求必须进入 Product Core 评审。

8. customer-instance-policy.md
   - 解释 current 是否算租户：
     业务/交付口径算第一个客户实例；
     runtime 口径不算 SaaS 多租户；
     当前不新增 tenant_id。
   - 定义推荐命名：
     customer_key=current
     deployment_instance=current-prod
     config_version=current-YYYY.MM
   - 明确未来十几个甲方采用：
     一个产品内核 + 一个行业模板 + 多个客户配置包 + 少量客户扩展。
   - 禁止每个客户复制一套完整代码长期维护。

禁止事项：
- 不要新增 tenant_id。
- 不要创建 config/tenants/current。
- 不要创建 deployments/current。
- 不要创建 extensions/current。
- 不要改 web/src/erp/config/docs.mjs。
- 不要改 web/src/erp/config/seedData.mjs。
- 不要改 server/internal。
- 不要改 Ent schema。
- 不要把当前甲方资料写成 Product Core 规则。
- 不要把 Workflow done 写成 Fact posted。

验收命令：
- git diff --stat
- grep -R "tenant_id" docs/customers docs/product || true
- cd web && pnpm test

最终回复必须包含：
【完成】
【新增/修改文件】
【当前甲方是否算租户的结论】
【需求澄清流程摘要】
【测试命令与结果】
【没有做的内容】
【风险】
【建议给 GPT 分析的下一步问题】
```

---

# 9. Codex 做完后，你复制给 GPT 的模板

Codex 完成后，你这样贴给我：

```text
这是 Codex 本轮输出，请你判断是否合格，并给我下一轮 Codex 提示词。

【本轮目标】
建立 current 甲方的需求澄清台账与客户实例管理文档。

【Codex 原始提示词】
[粘贴我给 Codex 的提示词]

【Codex 完成摘要】
[粘贴 Codex 的完成摘要]

【新增/修改文件】
[粘贴文件列表]

【git diff --stat】
[粘贴 diff stat]

【关键内容摘录】
[粘贴每个新增文档的标题和核心段落，不要全量贴几千行]

【测试命令与结果】
[粘贴命令和结果，失败只贴关键日志]

【Codex 自己说的风险】
[粘贴风险]

【Codex 建议下一步】
[粘贴下一步]

请你输出：
1. 这轮是否合格。
2. 是否误把 current 甲方当成 SaaS runtime tenant。
3. 是否误加 tenant_id 或多租户实现。
4. 是否把甲方资料误当 Product Core。
5. 哪些地方需要修。
6. 下一轮可以直接复制给 Codex 的提示词。
```

---

# 10. 最后给你一个明确判断

这个甲方应该这样定位：

```text
它是第一个真实客户。
它是种子客户。
它是第一个私有化客户实例。
它可以有 customer_key。
它未来可以有配置包。
它不应该现在变成数据库 tenant。
它的资料不应该直接变成产品核心规则。
```

你现在最应该做的是：**把这批资料变成需求线索、假设、问题、决策和客户配置草案**。这样甲方后面不管提什么业务需求，你都能先分类，再决定是配置、模板、核心产品能力，还是客户扩展，而不是每次都临时改代码。

### 012. user

_time `2026-05-17T18:12:48+08:00` · content_type `text` · node `9a7c5383-d2b1-439a-9392-01703e60359d`_

项目是不是最好不要有change模块，因为可能文档可能和代码产生信息差，全局检查文档容易产生信息差的操作有哪些，你觉得应该怎样避免信息差？

### 013. assistant

_time `2026-05-17T18:16:21+08:00` · content_type `text` · node `dd3cd038-c881-43c9-a2ab-0f57cf26f267`_

我的建议是：**项目当前不要做一个笼统的“Change 模块”作为业务模块或代码模块**；但可以保留“变更记录 / 变更历史 / 架构变更文档”这类资料，只是必须把它们定义成**历史记录**，不能定义成当前真实状态。

尤其 ERP 里最怕出现一种东西：一个通用 `change` 表或 `change` 模块，什么都往里塞。库存变更、订单变更、BOM 变更、出货变更、财务变更如果都走一个泛化 Change，会很快变成“影子事实层”，和真实库存、出货、财务表打架。

你这个系统的主方向本来就是“岗位入口 + 任务驱动 + 桌面端 / 手机端协同”，而不是让业务人员去维护一堆抽象变更记录；正式汇报材料也把第一期重点放在订单到出货主链路和手机端任务处理能力上。fileciteturn0file1 所以变更管理可以有，但应该作为**需求治理 / 客户差异治理 / 事实冲正机制**存在，不建议做一个前台“Change 模块”。

---

# 1. 先把 “change” 分成三种

## 1.1 代码 / schema 变更记录

这个可以有。

比如：

```text
docs/changes/phase-2a-inventory-fact-schema.md
docs/changes/phase-2b-bom-lot-schema.md
docs/changes/phase-2c-purchase-receipt-schema.md
```

这类文档的作用是：

```text
记录某次变更为什么做
做了哪些 schema / usecase / migration
当时的边界是什么
哪些内容明确没有做
```

但是它不能当成当前状态真源。当前状态应该以：

```text
代码
schema
migration
测试
current-source-of-truth
capability-ledger
```

为准。

所以 `docs/changes` 不一定要删，但要明确它是：

```text
历史变更记录 / change history
不是当前能力状态表
不是业务帮助中心
不是甲方需求真源
不是产品路线图
```

---

## 1.2 甲方需求变更

这个也需要，但不应该做成 ERP 里的业务模块。

建议用：

```text
docs/customers/current/change-request-process.md
docs/customers/current/delta-register.md
docs/customers/current/decision-log.md
Issue / 任务系统
```

来管理。

甲方后续提需求时，先分类：

```text
Tenant Config
Industry Template
Product Core
Customer Extension
Data Import Adapter
Print Template
Reporting
```

而不是直接进代码。

---

## 1.3 业务事实变更

这个不能用一个泛化 Change 模块处理。

ERP 事实层必须领域化：

| 业务变化 | 正确做法 | 不建议做法 |
|---|---|---|
| 库存数量错 | inventory adjustment / reversal | 写一条 generic change |
| 采购入库错 | purchase_receipt_adjustment | 写一条 generic change |
| BOM 改版 | bom version / bom revision | 写一条 generic change |
| 订单改款 / 改数量 | order_revision | 写一条 generic change |
| 出货取消 | shipment cancellation / reversal | 写一条 generic change |
| 应收调整 | AR adjustment / credit note | 写一条 generic change |
| 质检改判 | quality re-inspection / quality decision change | 写一条 generic change |

一句话：**业务事实变更要落在对应事实层，不要落在通用 Change 模块。**

---

# 2. 我对 “change 模块” 的结论

## 不建议现在做

不建议现在做：

```text
server/internal/biz/change.go
server/internal/data/change_repo.go
change_records
change_requests
ChangeUsecase
前端“变更中心”
```

因为它会带来三个问题：

1. **会绕过真实事实层。**  
   业务人员可能以为提交了 change 就等于库存、出货、财务都变了。

2. **会和 Workflow 混淆。**  
   Workflow 是协同任务，Change 是需求或修正，两者不是一个东西。

3. **会制造文档和代码信息差。**  
   文档里写“变更已支持”，但代码里可能只是记录了一个 change，并没有影响真实库存或财务。

## 可以保留

可以保留：

```text
docs/changes/
```

但建议加一条规则：

```text
docs/changes 只记录历史变更。
当前状态以 current-source-of-truth + capability-ledger + 代码 + 测试为准。
```

如果未来担心误解，可以逐步把它重命名或解释为：

```text
docs/change-history/
```

但现在不建议马上改目录，因为可能影响引用。

---

# 3. 最容易造成“文档和代码信息差”的操作

下面这些操作特别危险，尤其是用 Codex 或 GPT 做“全局检查 / 全局同步文档”时。

| 操作 | 为什么容易产生信息差 | 应该怎么做 |
|---|---|---|
| 全局把“未完成”改成“已完成” | 文档状态变了，但 schema / API / UI / 测试可能没变 | 只允许 capability-ledger 改成熟度，并附代码路径和测试证据 |
| 全局搜索后批量改模块名 | 容易改坏历史文档、测试说明、客户资料 | 先出影响清单，不直接改 |
| 把架构评审文档当成已实现状态 | review 只是方案，不等于落地 | review 文档必须标 `status: proposed / accepted / implemented / superseded` |
| 把 `docs/changes` 当当前真源 | 变更记录可能是历史阶段 | 当前真源只能在 current-source-of-truth / capability-ledger 里确认 |
| 把前端帮助中心内容当真实后端能力 | 前端可能只是 demo / seed / debug | 每个帮助条目要标清“业务可用 / 演示 / 调试 / 规划” |
| 把甲方样本 Excel/PDF 当通用规则 | 一个客户的字段不等于产品规则 | 标为 Customer Material / Industry Template Candidate |
| 根据 UI 菜单判断模块已完成 | 有菜单不等于有事实表、API、RBAC、测试 | 能力成熟度要按 L0~L8 |
| 用 Workflow 状态说明事实完成 | task done 不等于库存、出货、财务过账 | Workflow 文档必须写“不代表什么” |
| 只改 README，不改 source-of-truth | README 容易过期 | README 只做入口，不承载详细状态 |
| 只改 source-of-truth，不改测试 | 文档说完成，但无法验证 | 每条“已完成”必须有测试命令或代码证据 |
| 修改 schema 后忘记同步文档 | 代码领先文档 | schema PR 必须更新 capability-ledger / current-source-of-truth |
| 修改 docs registry 后忘记页面测试 | 文档链接、前端构建可能断 | 改 `docs.mjs` 必须跑前端测试 |
| 复制旧客户资料到产品文档 | 当前客户差异会污染产品内核 | 客户资料统一放 `docs/customers/<key>` |
| Codex 自动“整理所有文档” | 它可能把旧计划和当前实现混合总结 | 先让 Codex 只做 audit report，不允许直接改 |
| 历史文档没有废弃标记 | 读的人不知道哪个是新旧版本 | 所有旧 review 要有 `superseded_by` |
| 多份文档都写“当前状态” | 状态分散后必然不一致 | 只允许一份能力台账写当前状态 |
| 把 demo seed 当业务数据 | seed 只是演示，不是事实真源 | seed 文档必须标 Demo Seed |
| 把客户交付说明接进通用帮助中心 | 会让其他客户看到不适用内容 | 客户交付文档不要进通用 docs registry |
| 直接让 AI “根据全仓库更新文档” | AI 会把不同时间、不同层级的信息混在一起 | 必须指定权威顺序和允许修改范围 |

---

# 4. 信息差的根因

信息差通常不是因为文档太多，而是因为**每种文档的权威等级不清楚**。

你现在需要建立一个权威顺序。

推荐如下：

```text
第 1 级：代码 / schema / migration / tests
第 2 级：docs/current-source-of-truth.md
第 3 级：docs/product/capability-ledger.md
第 4 级：docs/architecture/*.md
第 5 级：docs/changes/*.md
第 6 级：web/src/erp/docs/*.md
第 7 级：docs/customers/<customer-key>/*
第 8 级：seed/demo/test 文案
```

解释一下：

- **代码、schema、migration、tests** 是实现真源。
- **current-source-of-truth** 是状态真源入口。
- **capability-ledger** 是能力进度真源。
- **architecture review** 是方案，不是实现。
- **changes** 是历史记录，不是当前状态。
- **web docs** 是展示给人看的帮助，不一定代表完整实现。
- **customer docs** 是客户资料，不是产品规则。
- **seed/demo/test** 是样本，不是业务事实。

---

# 5. 怎么避免信息差

## 5.1 每个文档都加状态

建议以后重要文档顶部都加一段 metadata，不一定要 YAML，也可以是 Markdown 表格。

示例：

```md
# ShipmentUsecase Review

| 字段 | 值 |
|---|---|
| Doc Type | Architecture Review |
| Status | Proposed |
| Scope | Product Core |
| Runtime Implemented | No |
| Schema Implemented | No |
| Migration Required | TBD |
| Source of Truth | docs/current-source-of-truth.md |
| Code Refs | server/internal/biz/workflow.go |
| Test Refs | server/internal/biz/workflow_test.go |
| Last Verified | 2026-xx-xx |
| Supersedes | - |
| Superseded By | - |
```

这样读文档的人马上知道：

```text
这是方案，不是已落地。
```

---

## 5.2 能力成熟度只允许在一个地方写

不要让 README、system-layer-progress、productization-delivery、help docs、changes docs 都写“模块完成度”。

建议只允许：

```text
docs/product/capability-ledger.md
```

写 L0~L8 成熟度。

其他文档只能引用它：

```text
当前成熟度以 docs/product/capability-ledger.md 为准。
```

---

## 5.3 “已完成”必须有证据

任何文档里出现：

```text
已完成
已落地
已支持
已上线
当前已实现
事实真源
```

都必须同时具备至少一个代码证据和一个验证证据。

例如：

```text
已完成：采购入库事实过账
代码证据：
- server/internal/data/purchase_receipt_repo.go
- server/internal/biz/inventory.go
schema 证据：
- server/internal/data/model/schema/purchase_receipt.go
测试证据：
- cd server && go test ./internal/biz ./internal/data
```

没有这些证据，就只能写：

```text
已评审
计划中
草案
候选
待落地
```

---

## 5.4 `docs/changes` 只记录历史，不写当前总状态

`docs/changes` 每篇应该回答：

```text
这次变更做了什么
为什么做
影响哪些表 / usecase
哪些没做
怎么验证
后续风险
```

不应该写：

```text
当前库存模块已经完整完成
当前出货模块已经完整完成
当前 ERP 已进入可销售阶段
```

这种话应该只出现在 capability-ledger 或 release note，并且要有证据。

---

## 5.5 架构评审文档必须区分 Proposed / Accepted / Implemented

例如：

```text
docs/architecture/shipment-usecase-review.md
```

如果只是评审，就标：

```text
Status: Accepted Design
Runtime Implemented: No
Schema Implemented: No
```

不要因为“评审通过”就让帮助中心写“出货模块已完成”。

---

## 5.6 客户资料永远不要直接进 Product Core

当前甲方资料要放在：

```text
docs/customers/current/
```

或者在 seed 里标：

```text
Customer Material
Demo Seed
Industry Template Candidate
Print Template Input
```

不要写成：

```text
Product Core Source
```

除非经过产品评审和至少多个客户验证。

---

## 5.7 全局文档检查只能先出报告，不能直接改

以后给 Codex 的任务不要写：

```text
请全局检查并同步所有文档。
```

应该写：

```text
请全局检查文档与代码的一致性，只输出 audit report，不修改文件。
```

报告里列：

```text
疑似不一致
证据文档
证据代码
建议处理
风险等级
是否需要人工确认
```

人工确认后，再给第二个 Codex 任务做小范围修订。

---

# 6. 推荐的文档治理结构

建议以后这样分：

```text
docs/current-source-of-truth.md
  当前真源入口，只做总控，不写太多细节

docs/product/capability-ledger.md
  能力成熟度唯一真源

docs/product/release-gates.md
  什么叫完成

docs/product/customer-delta-policy.md
  客户需求如何分类

docs/architecture/
  架构评审和设计方案

docs/changes/
  历史变更记录

docs/customers/current/
  当前甲方资料、问题、决策、差异、配置草案

web/src/erp/docs/
  前端帮助中心文档，必须标清业务版 / QA / Debug / 产品化

web/src/erp/config/seedData.mjs
  demo / seed / sample，不是事实真源
```

---

# 7. 建议增加一个“文档一致性门禁”

每次 PR 或 Codex 改动后，按改动类型检查。

## 7.1 改代码

必须问：

```text
是否需要更新 current-source-of-truth？
是否需要更新 capability-ledger？
是否需要更新架构评审状态？
是否需要更新 release-gates？
是否影响客户配置草案？
是否影响业务帮助？
```

## 7.2 改 schema / migration

必须问：

```text
是否有 docs/changes 记录？
是否更新 capability-ledger？
是否更新 current-source-of-truth？
是否有 migration status？
是否有测试？
是否影响已有事实表？
```

## 7.3 改 Workflow

必须问：

```text
是否仍然不写库存 / 出货 / 财务事实？
UI 文案有没有误导？
帮助文档有没有写清楚 done 不代表什么？
```

## 7.4 改前端帮助中心

必须问：

```text
是否和后端真实能力一致？
是否把 demo 当产品能力？
是否把客户资料暴露成通用帮助？
是否 docs.mjs 路径正确？
```

## 7.5 改客户资料

必须问：

```text
是否只在 docs/customers/current？
是否误进入 docs/product？
是否误进入 Product Core？
是否只是客户配置 / 打印模板 / 导入样本？
```

---

# 8. 可以做一个轻量 docs-lint

不一定马上写复杂工具，先用 grep 门禁也行。

可以检查这些高风险词：

```text
已完成
已落地
已支持
已上线
事实真源
通用产品规则
tenant_id
SaaS
多租户
license
套餐
工单
```

检查逻辑不是看到就报错，而是要求说明：

```text
这个结论有没有代码证据？
有没有测试证据？
有没有 source-of-truth 指向？
是不是写在了合适的文档类型里？
```

---

# 9. 给 Codex 的“文档一致性审计”提示词

下一步可以先让 Codex 做审计报告，不让它改。

直接复制：

```text
你在 plush-toy-erp 仓库中工作。

本轮任务：做文档与代码一致性审计，只输出审计报告，不修改任何文件。

必须先读：
- AGENTS.md
- README.md
- docs/current-source-of-truth.md
- docs/architecture/workflow-usecase-review.md
- docs/architecture/shipment-release-workflow-review.md
- docs/architecture/shipment-inventory-boundary-review.md
- docs/architecture/shipment-usecase-review.md
- docs/changes/
- web/src/erp/docs/
- web/src/erp/config/docs.mjs
- web/src/erp/config/seedData.mjs
- server/internal/biz/workflow.go
- server/internal/biz/rbac.go
- server/internal/data/model/schema
- server/internal/data 里的 inventory / purchase / quality 相关代码

禁止事项：
1. 不要修改任何文件。
2. 不要生成补丁。
3. 不要新增 tenant_id。
4. 不要建议马上做 SaaS。
5. 不要把 docs/changes 当当前状态真源。
6. 不要把客户样本当 Product Core。
7. 不要把 Workflow done 当 Fact posted。

请输出一份审计报告，包含：

1. 文档类型分类
   - current source of truth
   - architecture review
   - change history
   - productization/delivery
   - frontend help
   - customer material / seed / demo / QA

2. 疑似信息差清单
   每项包含：
   - 文档路径
   - 文档说法
   - 代码 / schema / 测试证据
   - 是否真实不一致
   - 风险等级 High / Medium / Low
   - 建议处理方式

3. 高风险用词扫描
   扫描：
   - 已完成
   - 已落地
   - 已支持
   - 已上线
   - 事实真源
   - tenant_id
   - SaaS
   - 多租户
   - license
   - 套餐
   - 工单
   并判断是否使用在合适上下文。

4. Workflow / Fact 边界审计
   特别检查：
   - shipment_release 是否被文档误写成 shipped
   - inbound_done 是否被误写成库存已入账
   - quality task done 是否被误写成质检事实判定
   - workflow payload 是否被误写成库存 / 财务真源

5. 客户资料污染审计
   检查当前甲方资料、样本、Excel/PDF、seed/demo 是否被写成通用产品规则。

6. 建议的后续修正文档清单
   只列文件和建议，不要改。

最终回复格式：
【审计范围】
【文档分类】
【疑似信息差清单】
【高风险用词】
【Workflow / Fact 边界风险】
【客户资料污染风险】
【建议下一轮最小修正任务】
【本轮未修改任何文件确认】
```

---

# 10. 如果审计后要修文档，第二轮 Codex 提示词

不要让 Codex 全局改。让它只改一小批。

```text
本轮任务：根据上一轮文档一致性审计报告，只修正 High 风险文档表述。本轮只允许改文档，不改代码，不改 schema，不改 runtime。

允许修改：
- [列出具体文件 1]
- [列出具体文件 2]

禁止修改：
- server/internal
- web/src/erp/config/seedData.mjs
- web/src/erp/config/docs.mjs
- migrations
- Ent schema
- 任何 runtime 代码

修正原则：
1. 不把 review 写成 implemented。
2. 不把 docs/changes 写成当前状态真源。
3. 不把当前甲方资料写成 Product Core。
4. 不把 Workflow done 写成 Fact posted。
5. 所有“已完成 / 已落地 / 已支持”必须附代码路径或改成“已评审 / 计划中 / 待接入”。
6. 不新增 tenant_id。
7. 不做 SaaS。

验收命令：
- git diff --stat
- grep -R "tenant_id" docs web/src/erp/docs || true
- cd web && pnpm test

最终回复：
【完成】
【修改文件】
【修正的信息差】
【仍保留的风险】
【测试命令与结果】
【下一步建议】
```

---

# 11. 最终建议

**不要做一个通用 Change 模块。**

保留：

```text
docs/changes
```

但把它定义为：

```text
历史变更记录
```

不要把它定义为：

```text
当前状态真源
```

业务里的“变更”应该拆开：

```text
客户需求变更 -> delta-register / issue / decision-log
订单变更 -> order_revision
BOM 变更 -> bom version
库存变更 -> adjustment / reversal
采购入库变更 -> purchase_receipt_adjustment
出货变更 -> shipment cancellation / correction
财务变更 -> AR/AP adjustment / invoice correction
```

防止信息差的关键不是少写文档，而是：

```text
文档分类型
状态有 metadata
能力进度只有一个真源
已完成必须有代码和测试证据
全局检查只先出报告
客户资料永远不自动升级为产品规则
Workflow 和 Fact 永远分开写
```

当前最小安全下一步：**让 Codex 做一次“文档与代码一致性审计报告”，只审计不修改。** 审计后再按 High 风险逐个修，不要全局同步。

### 014. user

_time `2026-05-18T18:35:39+08:00` · content_type `text` · node `b72bec94-8205-49a1-abba-96bb5c2e1673`_

此项目为起步开发阶段，可以大重写大重构的，再次给出从0到1的方案

### 015. assistant

_time `2026-05-18T18:40:05+08:00` · content_type `text` · node `004afb97-3348-4279-b2c5-6ef4658d7f99`_

可以。既然你确认项目还在起步阶段，允许**大重写 / 大重构**，那我会把方案从“低风险渐进修补”切换成“从 0 到 1 重建产品骨架”。但这里的“大重构”不是无序推倒重来，而是：**先把边界、模型、目录、事实层、配置层一次性立正，再按 MVP 闭环开发。**

我建议把这个项目重新定义为：

> **毛绒玩具工厂任务驱动型 ERP 产品内核**  
> 第一目标：服务当前甲方上线。  
> 第二目标：沉淀为可复制给同行的私有化部署产品。  
> 第三目标：未来再评审 SaaS 多租户。

这和你现有汇报材料是匹配的：材料里已经明确系统原则是“岗位入口、任务驱动、桌面端 + 手机端”，手机端负责移动场景下的高频任务；实施建议也是第一期先打通订单到出货主链路和手机端任务处理，第二期补异常 / 返工中心，第三期补成本、供应商绩效、外发工厂绩效。fileciteturn1file5 fileciteturn1file3

---

# 1. 先给结论

## 1.1 现在可以大重构什么

可以大重构：

```text
目录结构
前端模块组织
后端 usecase 边界
业务模型命名
seed/demo/test 分离
文档体系
客户资料隔离
Workflow / Fact 边界
API 分层
RBAC 权限码体系
测试门禁
部署交付结构
```

可以重新设计：

```text
customers / suppliers
orders
products / SKU / BOM
purchase
outsourcing
quality
inventory
production
shipment
finance
mobile task
```

可以保留并吸收：

```text
已有 inventory_txns / balances / lots 思路
已有 purchase_receipts / returns / adjustments 思路
已有 quality_inspections 思路
已有 workflow task 思路
已有 RBAC 权限底座思路
已有手机端岗位入口设计
```

## 1.2 现在仍然不建议做什么

哪怕从 0 到 1，也不建议第一版就做：

```text
真正 SaaS 多租户
license server
套餐计费
客户工单系统
复杂插件市场
每客户独立 fork 一份代码
泛化 Change 模块
泛化 BusinessRecord 代替所有事实表
```

原因很简单：你现在最缺的不是 SaaS 能力，而是**行业 ERP 产品内核的业务闭环**。

---

# 2. 当前甲方怎么定位

当前甲方应该算：

```text
第一个真实客户
第一个种子客户
第一个私有化部署客户实例
第一个需求验证样本
第一个配置包来源
```

但不建议现在算：

```text
数据库 runtime tenant
SaaS 租户
多租户隔离对象
```

推荐内部口径：

```text
customer_key = current
deployment_key = current-prod
config_key = current-private
template_key = plush-industry
core_version = 0.1.x
```

也就是说，**管理上把它当客户实例，技术运行时先不加 tenant_id。**

如果以后真的做 SaaS，再单独评审 `tenant_id`、数据隔离、对象存储隔离、权限隔离、计费授权。现在先做：

```text
一套代码
一个行业模板
多个客户配置包
每客户一套数据库 / 对象存储 / 部署配置
```

---

# 3. 从 0 到 1 的总架构

建议重构成下面这套分层。

```text
Product Core 产品内核
  ├─ MasterData 主数据
  ├─ Fact 事实层
  ├─ Workflow 协同层
  ├─ RBAC 权限层
  ├─ API 层
  └─ Audit / Reporting 基础

Industry Template 毛绒玩具行业模板
  ├─ 默认角色
  ├─ 默认菜单
  ├─ 默认流程
  ├─ 默认字段
  ├─ 默认打印模板
  └─ 默认 seed

Customer Config 客户配置包
  ├─ 公司信息
  ├─ 菜单开关
  ├─ 字段显示 / 必填
  ├─ 编号规则
  ├─ 打印模板
  ├─ 初始化数据
  └─ 部署参数

Customer Extension 客户扩展
  └─ 极少数客户专属逻辑

Delivery / Ops 交付运维层
  ├─ compose / env
  ├─ migration
  ├─ backup / restore
  ├─ release checklist
  └─ customer deployment notes
```

---

# 4. 从 0 到 1 的推荐目录结构

既然允许大重构，我建议从一开始就把目录切清楚。

## 4.1 后端目录

建议目标结构：

```text
server/
  cmd/
    api/
    migrate/
    seed/

  internal/
    app/
      bootstrap/
      config/
      auth/
      http/
      rpc/

    core/
      masterdata/
        customer/
        supplier/
        product/
        material/
        warehouse/
        unit/

      order/
        sales_order/
        order_revision/

      bom/
        bom_header/
        bom_item/
        bom_version/

      purchase/
        purchase_order/
        purchase_receipt/
        purchase_return/
        purchase_adjustment/

      inventory/
        lot/
        txn/
        balance/
        reservation/
        adjustment/

      quality/
        inspection/
        exception/

      production/
        production_order/
        material_issue/
        finished_goods_receipt/
        rework/

      outsourcing/
        outsource_order/
        outsource_issue/
        outsource_receipt/
        outsource_settlement/

      shipment/
        shipment/
        shipment_item/
        reservation/
        outbound/

      finance/
        ar/
        ap/
        invoice/
        payment/
        reconciliation/

      workflow/
        task/
        rule/
        event/

      rbac/
        role/
        permission/
        menu/

      audit/
        audit_log/

      reporting/
        dashboard/

    data/
      ent/
      migrations/
      repositories/

    interfaces/
      api/
      dto/
      presenters/

    tests/
      fixtures/
      integration/
```

核心原则：

```text
workflow 不写 inventory / shipment / finance fact
inventory 只管库存事实
shipment 只管出货事实
finance 只管财务事实
quality 只管质检事实
purchase 只管采购事实
production 只管生产事实
```

---

## 4.2 前端目录

建议目标结构：

```text
web/src/erp/
  app/
    routes/
    providers/
    layout/

  shared/
    api/
    auth/
    components/
    hooks/
    utils/
    constants/

  modules/
    dashboard/
    workflow/
    masterdata/
      customers/
      suppliers/
      products/
      materials/
      warehouses/
      units/

    order/
    bom/
    purchase/
    inventory/
    quality/
    production/
    outsourcing/
    shipment/
    finance/
    reporting/
    rbac/
    settings/

  mobile/
    app/
    roles/
      boss/
      business/
      pmc/
      purchase/
      warehouse/
      quality/
      production/
      finance/

  docs/
    business/
    qa/
    productization/
    customer-guides/

  config/
    moduleRegistry.mjs
    menuRegistry.mjs
    roleRegistry.mjs
    fieldRegistry.mjs
    docsRegistry.mjs
```

当前汇报材料里已经强调岗位入口和手机端策略：岗位入口不是复杂菜单驱动，订单创建后系统自动生成任务树，手机端负责移动场景高频任务。这个应该成为前端重构主线，不要只做传统后台菜单。fileciteturn1file5

---

## 4.3 文档目录

建议目标结构：

```text
docs/
  README.md
  current-source-of-truth.md

  product/
    product-principles.md
    capability-ledger.md
    release-gates.md
    test-strategy.md
    customer-instance-policy.md
    customer-delta-policy.md

  architecture/
    domain-model.md
    workflow-fact-boundary.md
    masterdata-review.md
    inventory-fact-review.md
    shipment-usecase-review.md
    finance-usecase-review.md

  change-history/
    phase-001-foundation.md
    phase-002-inventory.md
    phase-003-purchase-quality.md

  customers/
    current/
      README.md
      source-materials.md
      requirement-clues.md
      assumption-register.md
      question-backlog.md
      decision-log.md
      delta-register.md
      customer-config-draft.md
      delivery-notes.md

  operations/
    deployment-checklist.md
    backup-restore.md
    release-runbook.md
```

我建议把原来的 `docs/changes` 改名为：

```text
docs/change-history/
```

或者至少定义成历史记录。不要让它承担当前状态真源。

---

## 4.4 配置和部署目录

第一版可以建，但不做 SaaS runtime。

```text
config/
  product/
    modules.yaml
    permissions.yaml
    roles.yaml

  industry-templates/
    plush/
      roles.yaml
      menus.yaml
      workflows.yaml
      fields.yaml
      numbering.yaml
      print-templates/
      seed/

  customers/
    current/
      customer.yaml
      modules.yaml
      menus.yaml
      fields.yaml
      numbering.yaml
      roles.yaml
      seed/
      print-templates/

deployments/
  current/
    README.md
    env.example
    compose.override.example.yml
    backup.md
    restore.md
    release-checklist.md
```

注意：

```text
config/customers/current 不是 SaaS tenant
deployments/current 不是多租户
只是第一个客户私有化部署配置
```

---

# 5. 从 0 到 1 的业务域模型

## 5.1 主数据 MasterData

第一版必须有：

```text
customers
suppliers
contacts
units
materials
products
product_skus
warehouses
locations 可选
```

建议模型：

```text
customers
  id
  code
  name
  short_name
  status
  invoice_title
  tax_no
  payment_terms
  remark

suppliers
  id
  code
  name
  type: material / outsourcing / service / mixed
  status
  invoice_title
  tax_no
  settlement_terms
  remark

contacts
  id
  owner_type: customer / supplier
  owner_id
  name
  phone
  role
  is_primary

products
  id
  code
  name
  customer_id
  category
  status
  remark

product_skus
  id
  product_id
  sku_code
  color
  size
  version
  image_url
  status

materials
  id
  code
  name
  category
  color
  spec
  default_unit_id
  status

warehouses
  id
  code
  name
  type: material / semi_finished / finished_goods / defective / outsource / virtual
  status
```

你上传的生产订单截图里能看到下单日期、客户、订单编号、产品编号、产品名称、颜色、订购数量、出货日期、未出货数、跟单业务人员、类别、单价、备注等列，这说明第一版主数据和订单模型必须支持客户、产品、颜色、数量、交期、未出货、单价这些字段，但不能简单照抄截图列名做死。fileciteturn1file4

---

## 5.2 订单 Order

第一版建议做正式销售订单，不要再用泛化 business_records 顶着。

```text
sales_orders
  id
  order_no
  customer_id
  customer_order_no
  status
  order_date
  delivery_date
  merchandiser_id
  remark

sales_order_items
  id
  sales_order_id
  product_id
  sku_id
  product_code_snapshot
  product_name_snapshot
  color_snapshot
  quantity
  unit_price
  planned_delivery_date
  shipped_quantity
  status
```

订单状态建议：

```text
draft
submitted
boss_reviewing
approved
engineering
purchasing
production
quality_checking
shipping_releasing
shipping_released
partially_shipped
shipped
closed
cancelled
```

但要注意：

```text
shipping_released != shipped
approved != 采购已完成
production != 库存已扣
```

---

## 5.3 BOM

第一版要做 BOM，但要允许版本。

```text
bom_headers
  id
  product_id
  sku_id nullable
  version
  status: draft / active / archived
  effective_from
  remark

bom_items
  id
  bom_header_id
  material_id
  usage_qty
  unit_id
  loss_rate
  position
  color
  process_note
  remark
```

原则：

```text
BOM 是产品工程资料
采购需求可以从 BOM 派生
库存不能直接从 BOM 改
BOM 改版要留版本
```

---

## 5.4 采购 Purchase

第一版必须做：

```text
purchase_orders
purchase_order_items
purchase_receipts
purchase_receipt_items
purchase_returns
purchase_adjustments
```

采购入库过账写库存事实。

```text
purchase_receipt posted
  -> inventory_lots
  -> inventory_txns IN
  -> inventory_balances +
```

采购退货：

```text
purchase_return posted
  -> inventory_txns OUT
  -> inventory_balances -
```

采购调整：

```text
purchase_adjustment posted
  -> inventory_txns ADJUST_IN / ADJUST_OUT
```

---

## 5.5 质检 Quality

第一版建议区分三类质检：

```text
incoming_material_inspection
outsource_return_inspection
finished_goods_inspection
```

可以先共用表：

```text
quality_inspections
  id
  inspection_no
  source_type: purchase_receipt / outsource_receipt / finished_goods_receipt
  source_id
  lot_id nullable
  item_type: material / product
  item_id
  status: submitted / passed / rejected / cancelled
  decision: pass / reject / concession
  inspected_qty
  defect_qty
  inspector_id
  inspected_at
  reason
  photos
```

质检规则：

```text
质检改变批次状态
质检不直接写库存数量流水
不合格退货走 purchase_return 或后续 outsource_return
让步接收要记录批准人
```

---

## 5.6 库存 Inventory

第一版建议坚持事实层：

```text
inventory_lots
inventory_txns
inventory_balances
stock_reservations
```

库存流水不可变。

```text
inventory_txns
  id
  txn_no
  item_type: material / product
  item_id
  lot_id
  warehouse_id
  direction: in / out
  txn_type: purchase_in / purchase_return / production_issue / finished_goods_in / shipment_out / adjustment / reversal
  quantity
  source_type
  source_id
  occurred_at
```

余额表：

```text
inventory_balances
  item_type
  item_id
  warehouse_id
  lot_id nullable
  on_hand_qty
  reserved_qty
  frozen_qty
```

可用量：

```text
available_qty = on_hand_qty - reserved_qty - frozen_qty
```

---

## 5.7 生产 Production

第一版不需要做复杂 MES，但必须做生产事实。

```text
production_orders
  id
  production_no
  sales_order_id
  sales_order_item_id
  product_id
  sku_id
  planned_qty
  status

production_material_issues
  id
  issue_no
  production_order_id
  status

production_material_issue_items
  issue_id
  material_id
  lot_id
  warehouse_id
  qty

finished_goods_receipts
  id
  receipt_no
  production_order_id
  product_id
  sku_id
  qty
  warehouse_id
  status
```

规则：

```text
生产领料 posted -> inventory OUT
成品入库 posted -> inventory IN
workflow 的 finished_goods_inbound done 不是库存入账
```

---

## 5.8 委外 Outsourcing

加工合同样本里能看到来货要求、交期责任、违约处理、结算方式，以及纸样 / 图片附件，这说明委外模块不能只做一个“加工记录”，至少要支持合同 / 发料 / 回货 / 质检 / 结算 / 附件。fileciteturn0file0

第一版建议做：

```text
outsource_orders
outsource_order_items
outsource_material_issues
outsource_receipts
outsource_receipt_inspections
outsource_settlements
```

可以先简化：

```text
委外订单
委外发料
委外回货
委外质检
委外返工
委外结算草稿
```

---

## 5.9 出货 Shipment

第一版一定要把出货事实做清楚。

```text
shipments
  id
  shipment_no
  customer_id
  sales_order_id
  status: draft / released / reserved / picked / shipped / cancelled
  planned_ship_date
  actual_ship_date

shipment_items
  id
  shipment_id
  sales_order_item_id
  product_id
  sku_id
  planned_qty
  shipped_qty

stock_reservations
  id
  source_type: shipment
  source_id
  item_type: product
  item_id
  warehouse_id
  lot_id
  reserved_qty
  status: active / released / consumed / cancelled
```

关键规则：

```text
shipment_release workflow done -> shipping_released
shipping_released 后可以创建 / 确认 shipment
reservation 只是锁库存
shipped 才写 inventory OUT
shipped 后才进入财务应收评审
```

---

## 5.10 财务 Finance

第一版财务不要一口吃完。建议先做：

```text
AR 应收草案
AP 应付草案
invoice 发票记录
payment 收付款记录
reconciliation 对账单
```

但财务生成时机必须明确：

```text
AR 不从 workflow shipment_release 直接生成
AR 应从真实 shipped 或客户对账确认生成
AP 不一定从 purchase_receipt 自动生成，可能从供应商对账确认生成
```

---

# 6. Workflow 从 0 到 1 怎么做

Workflow 是协同层，不是事实层。

建议 Workflow 只做：

```text
任务生成
任务分派
任务认领
任务完成
任务驳回
任务转派
任务超时
任务提醒
任务评论
任务附件
```

任务类型：

```text
boss_approval
engineering_data
purchase_followup
iqc
warehouse_inbound
production_schedule
material_issue
outsource_issue
outsource_return_qc
finished_goods_qc
finished_goods_inbound
shipment_release
finance_review
```

Workflow 的输出可以是：

```text
协同状态
下一任务
事件通知
```

不能直接替代：

```text
库存入账
出货扣减
应收生成
应付生成
发票开具
付款核销
```

---

# 7. 从 0 到 1 的 MVP 顺序

我建议 MVP 分 6 个版本，而不是一个“大 ERP”。

---

## V0：骨架重构，2~3 周

目标：重建目录、文档、测试门禁、基础配置。

做：

```text
新目录结构
Product Core / Template / Customer Config 边界
docs/current-source-of-truth
capability-ledger
release-gates
customer current 资料台账
测试门禁
RBAC 基础
API 基础
前端模块注册
移动端入口骨架
```

不做：

```text
复杂业务功能
财务
SaaS
tenant_id
```

验收：

```text
后端可启动
前端可启动
空数据首页可访问
移动端角色入口可访问
基础测试通过
```

---

## V1：订单到工程资料，3~4 周

目标：从客户订单进入系统，到老板审批、工程资料、BOM。

做：

```text
customers
products
product_skus
sales_orders
sales_order_items
boss approval workflow
BOM
BOM version
工程资料附件
```

页面：

```text
订单列表
订单详情
产品 / SKU
BOM 编辑
老板审批手机端
工程资料任务
```

验收：

```text
创建订单
提交审批
老板手机端审批
审批通过进入工程 / BOM
BOM 生效
```

---

## V2：采购 + 来料 + 质检 + 库存，4~5 周

目标：BOM 触发采购，材料入库，质检，库存形成事实。

做：

```text
suppliers
purchase_orders
purchase_receipts
quality_inspections
inventory_lots
inventory_txns
inventory_balances
purchase_returns
purchase_adjustments
```

页面：

```text
采购单
采购入库
IQC
材料库存
批次详情
采购退货
入库调整
```

验收：

```text
从订单 / BOM 生成采购需求
采购下单
到货入库
提交质检
质检通过批次可用
库存余额正确
不合格退货
```

---

## V3：生产 + 委外 + 成品入库，5~6 周

目标：材料进入生产 / 委外，成品入库形成事实。

做：

```text
production_orders
production_material_issues
finished_goods_receipts
outsource_orders
outsource_material_issues
outsource_receipts
outsource_return_qc
finished_goods_qc
```

页面：

```text
PMC 排产
生产任务
生产领料
委外加工单
委外发料
委外回货
成品质检
成品入库
```

验收：

```text
生产领料扣材料库存
委外发料可追踪
委外回货可质检
成品入库增加成品库存
返工有记录
```

---

## V4：出货 + 库存预留 + 实际出库，4~5 周

目标：完成真实出货事实。

做：

```text
shipment_release workflow
shipments
shipment_items
stock_reservations
picking
shipment_outbound
inventory OUT
```

页面：

```text
出货计划
出货放行
库存预留
拣货
出库确认
出货记录
未出货跟踪
```

验收：

```text
出货放行不扣库存
预留锁定可用库存
实际出库才扣库存
订单 shipped_quantity 正确
支持部分出货
取消可释放预留
```

---

## V5：财务对账最小版，4~6 周

目标：先做应收 / 应付 / 对账，不追求复杂财务。

做：

```text
AR from shipment
AP from purchase / outsource settlement
invoice records
payment records
customer reconciliation
supplier reconciliation
```

页面：

```text
客户对账
供应商对账
应收列表
应付列表
发票记录
收款记录
付款记录
```

验收：

```text
已出货生成应收草案
采购 / 委外生成应付草案
支持对账确认
支持收付款登记
支持未收 / 未付查询
```

---

## V6：产品化交付，持续

目标：让第二个甲方可以复制部署。

做：

```text
config/customers/current
industry template plush
deployment current
backup / restore
release checklist
customer onboarding checklist
data import templates
print templates
training docs
```

验收：

```text
新客户能用同一套代码
替换配置和初始化数据即可试点
不复制代码 fork
```

---

# 8. 大重构的具体执行策略

即使允许大重构，也建议分三步做，不要同时改一切。

## 第一步：立新骨架

先新建目标目录，保留旧代码。

```text
server/internal/core/*
web/src/erp/modules/*
docs/product/*
docs/customers/current/*
config/industry-templates/plush/*
config/customers/current/*
```

旧代码暂时放：

```text
server/internal/legacy/
web/src/erp/legacy/
```

或者不移动旧代码，只通过新入口逐步替换。

## 第二步：迁移可复用逻辑

把现有比较正确的部分吸收到新骨架：

```text
inventory fact 思路
purchase receipt / return / adjustment 思路
quality inspection 思路
workflow task 思路
RBAC 权限思路
mobile role entry 思路
```

但迁移时要重新命名和分层，避免旧的混杂结构继续扩散。

## 第三步：废弃旧入口

等新主链路跑通后，再删旧的：

```text
泛化 business_records 业务入口
前端 demo helper 双写
混杂 seedData
过期 docs
旧 debug 页面
```

---

# 9. 关键技术决策

## 9.1 API

推荐：

```text
JSON-RPC 或 REST 均可，但必须按 usecase 暴露
```

不要让前端直接拼业务规则。

API 命名示例：

```text
salesOrder.create
salesOrder.submit
salesOrder.approve
bom.activate
purchaseOrder.createFromBom
purchaseReceipt.post
qualityInspection.submit
qualityInspection.decide
productionOrder.release
materialIssue.post
finishedGoodsReceipt.post
shipment.release
shipment.reserve
shipment.ship
ar.generateDraft
payment.record
```

---

## 9.2 状态机

每个事实模块单独状态机，不要全塞 workflow。

```text
sales_order.status
purchase_order.status
purchase_receipt.status
quality_inspection.status
production_order.status
shipment.status
ar.status
ap.status
invoice.status
payment.status
```

Workflow task 只是协同任务状态：

```text
pending
claimed
done
blocked
cancelled
```

---

## 9.3 编号规则

第一版就要配置化：

```text
SO-YYYYMMDD-###
PO-YYYYMMDD-###
PR-YYYYMMDD-###
QC-YYYYMMDD-###
PROD-YYYYMMDD-###
OUT-YYYYMMDD-###
SHP-YYYYMMDD-###
AR-YYYYMMDD-###
```

放在：

```text
config/industry-templates/plush/numbering.yaml
config/customers/current/numbering.yaml
```

---

## 9.4 打印模板

第一版不要写死。

打印模板包括：

```text
采购单
加工合同
入库单
质检单
出库单
送货单
客户对账单
供应商对账单
```

加工合同样本可以作为当前客户的打印模板输入，但不要当通用产品固定规则。fileciteturn0file0

---

## 9.5 移动端

移动端不是缩小版后台，而是任务处理端。

角色入口：

```text
老板：审批、风险、异常、放行
业务：订单、客户确认、出货跟进
PMC：排产、卡点、催办
采购：采购跟进、到货异常
仓库：扫码入库、出库、盘点
品质：拍照、不良、判定
生产经理：进度、返工、异常
财务：放行、对账、收付款提醒
```

汇报材料里也强调老板、PMC、生产经理、仓库 / 品质在手机端处理高频任务，减少回填和等待。fileciteturn1file3

---

# 10. 不建议做泛化 Change 模块

从 0 开始更应该避免。

不要做：

```text
change_records
change_module
ChangeUsecase
```

正确做法：

```text
订单变更 -> order_revision
BOM 变更 -> bom_version
库存变更 -> inventory_adjustment / reversal
采购入库变更 -> purchase_receipt_adjustment
出货变更 -> shipment cancellation / correction
财务变更 -> ar_adjustment / ap_adjustment / invoice correction
客户需求变更 -> docs/customers/current/delta-register.md / issue
```

---

# 11. 从 0 到 1 的开发团队任务分配

## 后端

优先级：

```text
1. 目录骨架和基础 app bootstrap
2. Ent schema / migration 规范
3. RBAC
4. Workflow task
5. MasterData
6. SalesOrder
7. BOM
8. Purchase + Inventory + Quality
9. Production + Outsourcing
10. Shipment
11. Finance
```

## 前端

优先级：

```text
1. 新模块路由
2. 岗位入口首页
3. 手机端任务入口
4. 订单页面
5. BOM 页面
6. 采购 / 入库 / 质检
7. 库存
8. 生产 / 委外
9. 出货
10. 财务
```

## 测试

优先级：

```text
1. 状态机测试
2. 库存不可变流水测试
3. 余额防负测试
4. Workflow 不写 Fact 测试
5. 出货预留并发测试
6. 财务生成时机测试
```

## 运维

优先级：

```text
1. dev / test / prod env
2. migration runbook
3. backup / restore
4. release checklist
5. customer deployment package
```

---

# 12. 第一轮大重构 Codex 提示词

你可以让 Codex 先做“重构蓝图和目录骨架”，不要马上写业务逻辑。

```text
你在 plush-toy-erp 仓库中工作。

本轮任务：项目从起步阶段进行 0 到 1 架构重构。只建立新目录骨架、文档蓝图和模块边界，不迁移旧业务代码，不新增业务 schema，不新增 migration，不实现 SaaS 多租户。

必须先读：
- AGENTS.md
- README.md
- docs/current-source-of-truth.md
- web/src/erp/docs/system-layer-progress.md
- web/src/erp/docs/productization-delivery.md
- web/src/erp/config/seedData.mjs
- web/src/erp/config/docs.mjs
- server/internal/biz/workflow.go
- server/internal/biz/rbac.go
- server/internal/data/model/schema
- server/internal/data 里的 inventory / purchase / quality 相关代码

目标：
1. 建立从 0 到 1 的新架构文档。
2. 建立产品内核、行业模板、客户配置、客户资料、交付运维的目录骨架。
3. 不改旧运行时代码。
4. 不移动旧文件。
5. 不接入前端 docs registry。
6. 不新增 tenant_id。
7. 不做 SaaS。
8. 不做 license server、套餐计费、客户工单系统。
9. 不创建泛化 Change 模块。

允许新增：
- docs/product/zero-to-one-architecture.md
- docs/product/domain-model-v1.md
- docs/product/module-boundaries.md
- docs/product/rewrite-roadmap.md
- docs/product/release-gates.md
- docs/customers/current/README.md
- docs/customers/current/source-materials.md
- docs/customers/current/requirement-clues.md
- docs/customers/current/assumption-register.md
- docs/customers/current/question-backlog.md
- docs/customers/current/decision-log.md
- config/industry-templates/plush/README.md
- config/customers/current/README.md
- deployments/current/README.md

可以创建空目录和 README：
- server/internal/core/
- server/internal/core/masterdata/
- server/internal/core/order/
- server/internal/core/bom/
- server/internal/core/purchase/
- server/internal/core/inventory/
- server/internal/core/quality/
- server/internal/core/production/
- server/internal/core/outsourcing/
- server/internal/core/shipment/
- server/internal/core/finance/
- server/internal/core/workflow/
- server/internal/core/rbac/
- server/internal/core/audit/
- web/src/erp/modules/
- web/src/erp/mobile/roles/

但本轮不要把旧代码搬进去。

文档要求：
1. zero-to-one-architecture.md 写清楚整体架构：
   Product Core、Industry Template、Customer Config、Customer Extension、Workflow、MasterData、Fact、RBAC、API/UI、Help/QA、Delivery/Ops。
2. domain-model-v1.md 写清楚第一版业务域模型：
   customers、suppliers、products、SKU、BOM、sales_orders、purchase、inventory、quality、production、outsourcing、shipment、finance。
3. module-boundaries.md 特别写清：
   Workflow task done != Fact posted；
   shipment_release != shipped；
   quality task done != quality decision；
   business_records 不替代事实表；
   客户资料不等于产品真源。
4. rewrite-roadmap.md 写 V0 到 V6：
   V0 骨架；
   V1 订单到工程资料；
   V2 采购 / 质检 / 库存；
   V3 生产 / 委外 / 成品入库；
   V4 出货 / 预留 / 出库；
   V5 财务对账；
   V6 产品化交付。
5. release-gates.md 定义每阶段验收标准和必须跑的测试。
6. customers/current 下的文档只标识当前甲方资料来源和需求线索，不写成 Product Core 规则。
7. config/customers/current/README.md 明确 current 是第一个私有化客户配置包，不是 SaaS runtime tenant。
8. deployments/current/README.md 明确 current 是第一个私有化部署实例，不是多租户部署。

禁止事项：
- 不新增 tenant_id。
- 不改 Ent schema。
- 不新增 migration。
- 不改 server/internal/biz/workflow.go。
- 不改 server/internal/biz/rbac.go。
- 不改 web/src/erp/config/docs.mjs。
- 不改 web/src/erp/config/seedData.mjs。
- 不把客户样本硬编码进产品核心。
- 不创建 ChangeUsecase。
- 不创建 change_records。

验收命令：
- git diff --stat
- find docs/product docs/customers/current config/industry-templates/plush config/customers/current deployments/current -maxdepth 3 -type f
- grep -R "tenant_id" docs/product docs/customers config deployments || true
- cd web && pnpm test

最终回复格式：
【完成】
【新增目录】
【新增/修改文件】
【0到1架构摘要】
【明确没有做的内容】
【测试命令与结果】
【风险】
【建议给 GPT 分析的下一步问题】
```

---

# 13. 第二轮 Codex 提示词：生成领域模型 schema 草案，不落代码

等第一轮骨架完成后，再让 Codex 出 schema 草案。

```text
任务：基于 zero-to-one 架构文档，生成 V1~V5 领域模型 schema 草案。本轮只写 docs/product/domain-schema-draft.md，不改 Ent schema，不生成 migration，不改 runtime。

要求：
1. 按模块列出候选表：
   masterdata、order、bom、purchase、inventory、quality、production、outsourcing、shipment、finance、workflow、rbac。
2. 每张表写：
   - purpose
   - key fields
   - status fields
   - relation
   - fact or masterdata or workflow
   - 是否第一期实现
   - 是否影响库存 / 出货 / 财务
3. 明确哪些表 V1 做，哪些 V2/V3/V4/V5 做。
4. 不新增 tenant_id。
5. 不做 SaaS。
6. 不把业务事实写进 workflow 表。
7. 不创建通用 change_records。

验收命令：
- git diff --stat
- grep -R "tenant_id" docs/product || true

最终回复：
【完成】
【新增文件】
【表清单摘要】
【V1 必做表】
【延后表】
【风险】
【下一步建议】
```

---

# 14. 第三轮 Codex 提示词：正式落 V0 骨架代码

等文档和 schema 草案确认后，才让 Codex 落 V0 代码骨架。

```text
任务：落 V0 代码骨架。本轮只创建模块目录、index、空 usecase 接口、测试占位，不实现业务逻辑，不新增 Ent schema，不新增 migration。

允许新增：
- server/internal/core/*/README.md
- server/internal/core/*/usecase.go
- server/internal/core/*/types.go
- server/internal/core/*/*_test.go
- web/src/erp/modules/*/README.md
- web/src/erp/modules/*/index.js

要求：
1. 每个 module README 写职责边界。
2. workflow README 明确不写事实层。
3. inventory README 明确库存流水是事实。
4. shipment README 明确 shipped 才是真实出货。
5. finance README 明确应收不从 shipment_release 直接生成。
6. 不接入路由。
7. 不改旧业务运行时。
8. 不新增 tenant_id。
9. 不生成 migration。

验收命令：
- git diff --stat
- cd server && go test ./...
- cd web && pnpm test

最终回复：
【完成】
【新增目录和文件】
【模块边界摘要】
【测试命令与结果】
【没有做的内容】
【风险】
【下一步建议】
```

---

# 15. 从 0 到 1 的最终建议

如果你确认项目还没上线、允许大重构，我建议你不要继续在旧结构上缝补，而是走这条线：

```text
第 1 步：建立 0 到 1 架构文档和新目录骨架
第 2 步：生成领域模型 schema 草案
第 3 步：落 V0 模块骨架
第 4 步：落 V1 订单 / 客户 / 产品 / BOM / Workflow
第 5 步：落 V2 采购 / 质检 / 库存
第 6 步：落 V3 生产 / 委外 / 成品入库
第 7 步：落 V4 出货 / 预留 / 出库
第 8 步：落 V5 财务对账
第 9 步：整理 V6 产品化交付
```

现在最小安全动作是：**先让 Codex 建立 0 到 1 架构文档、客户资料目录、配置目录、部署目录和新模块骨架，但不改旧 runtime。** 等你把这轮 Codex 输出贴回来，我再帮你判断哪些内容可以保留、哪些要删、下一轮是写 schema 草案还是直接落 V0 骨架。

### 016. user

_time `2026-05-30T00:49:38+08:00` · content_type `text` · node `f157538a-ba68-41ec-854f-1745a376d0be`_

你觉得这两个md的方案要不要包含

### 017. assistant

_time `2026-05-30T00:52:09+08:00` · content_type `text` · node `7872303e-f581-4cfc-a5cd-4eb495c2410c`_

要包含，而且这两个 md **很有价值**。但不要原封不动塞进从 0 到 1 方案里；应该做成**“吸收为产品内核设计原则 + 状态边界真源 + 配置权限策略”**，同时把不适合当前阶段的内容剔除或标注为未来项。

我的结论是：

```text
要包含。
但要拆分、去重、改写、降级部分内容。
不要把两个 md 都作为并列长期真源。
不要把其中的 tenant_id 字段建议带进当前 V0/V1 schema。
```

---

## 1. 两个 md 分别应该承担什么角色

### 1.1 `erp_status_workflow_context.md`

这个文件应该进入**核心架构真源**。

它最重要的价值是把状态分成：

```text
Workflow 协同层
单据生命周期层
业务事实层
业务结果 / 派生状态
系统横切状态
```

它还明确了核心口诀：

```text
流程管协同，单据管阶段，事实管落账，结果靠计算，系统状态别混业务。
```

这正好应该成为你从 0 到 1 重构时的状态设计总原则。文件里也明确强调 `shipping_released` 只是允许发货，不是 workflow 状态，也不是库存事实，不能代表已经出库。fileciteturn1file19

所以这个文件建议吸收进：

```text
docs/architecture/status-workflow-fact-boundary.md
docs/product/module-boundaries.md
docs/product/release-gates.md
```

它不是客户资料，而是**Product Core 架构原则**。

---

### 1.2 `erp_plush_productization_config_permission_workflow_state_design.md`

这个文件应该进入**产品化、配置、权限、交付策略真源**。

它的核心口径是：

```text
通用产品内核 + 受控客户差异 + 分层状态机 + 业务事实可追溯 + 权限职责可配置 + UI/模板适度灵活
```

它也明确了目标形态：一套标准产品内核，多套客户配置包，少量客户专属模板 / 适配层，极少数客户专属扩展，核心业务代码尽量不分叉。fileciteturn1file5

这个非常适合放进：

```text
docs/product/product-principles.md
docs/product/config-permission-policy.md
docs/product/customer-instance-policy.md
docs/product/customer-delta-policy.md
docs/product/zero-to-one-architecture.md
```

它也明确了“客户可以配置什么、不能配置什么”：客户可以配置谁能看、谁能做、字段展示、打印模板、Logo、用户和角色，但不能配置入库是否增加库存、出库是否扣库存、财务核销逻辑、库存流水能不能删除、核心状态机自由拖拽等内容。fileciteturn1file14

这部分应该作为以后十几个甲方的**客户差异治理原则**。

---

## 2. 必须包含的内容

建议从两个 md 中吸收这些内容。

| 内容 | 是否包含 | 放到哪里 |
|---|---:|---|
| Workflow / 单据 / Fact / 派生状态 / 系统状态五层 | 必须包含 | `docs/architecture/status-workflow-fact-boundary.md` |
| `workflow done != fact posted` | 必须包含 | `module-boundaries.md`、`release-gates.md` |
| `shipping_released != shipped` | 必须包含 | 出货、Workflow、UI 文案规则 |
| `动作产生事实，事实推导结果` | 必须包含 | Fact 层总原则 |
| 幂等、终态保护、reason 必填、非目标任务不触发 | 必须包含 | 状态机 / Workflow 测试门禁 |
| canonical status 与中文文案分离 | 必须包含 | 前后端状态设计 |
| Feature Flag + RBAC + Data Scope + State Machine + Idempotency + Audit | 必须包含 | 权限与动作执行门禁 |
| 节点绑定职责 / 权限，而不是岗位 | 必须包含 | Workflow 与 RBAC 设计 |
| 客户配置是安全子集 | 必须包含 | 产品化配置策略 |
| 模块开关、菜单开关、字段显示、打印模板 | 必须包含 | Tenant Config / Customer Config |
| 客户不能配置库存、财务、审计、核心状态机 | 必须包含 | 配置边界 |
| 不做复杂 BPMN / 低代码流程平台 | 必须包含 | 产品原则 |
| 同一套代码，多客户配置包 | 必须包含 | 产品化路线 |

---

## 3. 不能直接包含，必须改写的内容

有一处尤其要注意：`erp_status_workflow_context.md` 的数据库字段建议里出现了 `tenant_id`，例如 `workflow_tasks`、`sales_orders`、`shipments`、`inventory_txns`、`idempotency_records` 的字段示例里都有 `tenant_id`。fileciteturn1file10

这个**不能直接进入当前 V0/V1 schema**。

建议处理方式：

```text
保留为“未来 SaaS 多租户评审候选字段”
当前私有化阶段不落表
当前不新增 tenant_id
当前每客户一套数据库 / 对象存储 / 部署配置
```

也就是说，你可以在文档里这样写：

```md
> 注意：原始上下文文档中出现 tenant_id 字段示例。
> 当前阶段不实现 Runtime Tenant，不新增 tenant_id。
> 这些字段仅作为未来 SaaS 多租户评审时的候选项，不进入 V0/V1 schema。
```

---

## 4. 不建议包含的内容

下面这些不要进入当前从 0 到 1 实施方案，最多作为“明确不做”：

```text
tenant_id
真正 SaaS 多租户
客户自由拖拽核心状态机
复杂 BPMN / 低代码工作流平台
客户自由配置核心业务对象
客户自由修改数据库结构
客户自由关闭审计
客户自由修改库存扣减 / 入库增库存规则
泛化 Change 模块
```

两个 md 里其实也反复强调不要做复杂 BPMN、低代码流程平台、客户自由配置核心事实规则。产品化配置文档明确建议用单据状态机、审批记录、待办任务、操作日志、职责权限、流程节点开关、少量产品内置流程模式，而不是一开始做复杂 BPMN 或可视化流程编排器。fileciteturn1file9

---

## 5. 我建议怎么整合这两个 md

不要把这两个 md 直接放到 `docs/product/` 当长期主文档。否则以后容易出现三个问题：

```text
1. 两个 md 内容重复，后续维护会分叉。
2. 其中有 tenant_id 示例，容易误导 Codex 落到 schema。
3. 它们是总结型上下文，不适合作为最终工程真源。
```

推荐这样处理：

### 5.1 原始 md 放到参考资料区

```text
docs/reference/imported-notes/
  erp_plush_productization_config_permission_workflow_state_design.md
  erp_status_workflow_context.md
```

或者：

```text
docs/customers/current/source-materials/
```

但我更建议放 `docs/reference/imported-notes/`，因为这两个不是纯甲方资料，而是你整理出来的产品设计上下文。

顶部加声明：

```md
# 原始设计上下文

Doc Type: Imported Design Note
Status: Reference Only
Runtime Source of Truth: No
Schema Source of Truth: No
Current Implementation Source of Truth: No

本文件作为 0 到 1 架构重构的输入资料。
正式真源以 docs/product/*、docs/architecture/*、代码、schema、migration、tests 为准。
```

---

### 5.2 拆成 5 个正式真源文档

把两个 md 的内容抽取成：

```text
docs/product/product-principles.md
docs/product/config-permission-policy.md
docs/product/customer-instance-policy.md
docs/architecture/status-workflow-fact-boundary.md
docs/product/release-gates.md
```

对应关系：

| 新文档 | 来源 |
|---|---|
| `product-principles.md` | 产品化配置文档的一、二、三部分 |
| `config-permission-policy.md` | 配置自由度、客户管理员、Feature Flag、RBAC、Data Scope |
| `customer-instance-policy.md` | 一套代码、多客户配置包、当前客户不是 runtime tenant |
| `status-workflow-fact-boundary.md` | 状态分层文档主体 |
| `release-gates.md` | 测试清单、幂等、终态保护、Workflow / Fact 门禁 |

---

## 6. 从 0 到 1 方案里应该如何引用它们

我建议在 `zero-to-one-architecture.md` 里加一个章节：

```md
## 设计输入资料

本轮 0 到 1 重构吸收以下设计上下文：

1. `erp_status_workflow_context.md`
   - 吸收：状态分层、Workflow / Fact 边界、shipping_released 语义、幂等、终态保护、canonical status。
   - 不直接吸收：tenant_id 字段示例。

2. `erp_plush_productization_config_permission_workflow_state_design.md`
   - 吸收：产品化配置策略、权限职责模型、Feature Flag + RBAC + Data Scope + State Machine + Idempotency + Audit、客户配置安全边界。
   - 不直接吸收：任何让客户自由配置核心事实规则的设计。
```

---

## 7. 对从 0 到 1 方案的影响

包含这两个 md 后，你的从 0 到 1 方案应该做几处增强。

### 7.1 状态设计从一开始就拆字段

不要只做：

```text
order.status
```

应该设计为：

```text
order.status
order.approval_status
order.release_status
order.fulfillment_status
order.invoice_status
order.payment_status
order.settlement_status
```

状态分层文档也建议不要让单据主状态承担所有含义，而是拆成审批、放行、履约、收款、开票、结算等不同状态字段。fileciteturn1file12

---

### 7.2 Workflow 模块从一开始绑定权限点，不绑定岗位

不要写死：

```text
出货放行 -> 仓库主管
付款审核 -> 财务主管
物料齐套确认 -> PMC
```

要写成：

```text
出货放行 -> shipment.release
付款审核 -> payment.approve
物料齐套确认 -> material_readiness.confirm
```

状态上下文文档明确说岗位和角色是客户自己的组织结构，不稳定，流程节点应该绑定职责 / 权限，客户角色再绑定这些职责 / 权限。fileciteturn1file16

---

### 7.3 权限判断顺序要进入 usecase 门禁

每个业务动作按这个顺序：

```text
Feature Flag
RBAC
Data Scope
State Machine
Business Rule
Idempotency
Audit Log
```

这个判断顺序在状态上下文文档里已经写得很清楚，示例是确认出库时要先看模块是否启用、用户是否有权限、是否能操作仓库、单据状态是否允许、库存规则是否满足、是否重复提交，最后写 shipment / inventory_txns 并记录审计。fileciteturn1file16

---

### 7.4 Release Gates 必须加入测试清单

至少包含：

```text
workflow done 只能放行，不能扣库存
shipping_released 不能显示成已出库
blocked 必须有 reason
空字符串 / 空格 reason 报错
重复 workflow event 幂等
非目标 task 不触发
settled 后不再触发
确认出库重复点击不重复扣库存
inventory_txns 有唯一约束或幂等保护
invoice / AR 不在放行阶段生成
UI 隐藏按钮后，后端仍然校验权限和状态
中文文案修改不影响业务逻辑
```

这些测试清单在状态上下文文档里已经有现成内容。fileciteturn1file17

---

## 8. 给 Codex 的修正版提示词

你下一轮可以让 Codex 把这两个 md 吸收进 0 到 1 方案，但要明确“吸收，不照搬”。

```text
你在 plush-toy-erp 仓库中工作。

本轮任务：把两个设计上下文 md 吸收进 0 到 1 架构方案。只做文档整理，不改 runtime 代码，不改 schema，不新增 migration，不新增 tenant_id。

必须先读：
- AGENTS.md
- README.md
- docs/current-source-of-truth.md
- erp_plush_productization_config_permission_workflow_state_design.md
- erp_status_workflow_context.md
- web/src/erp/docs/system-layer-progress.md
- web/src/erp/docs/productization-delivery.md

任务目标：
1. 不要把这两个 md 原封不动作为最终真源。
2. 把它们作为 Imported Design Notes / Reference Only。
3. 抽取其中适合当前 0 到 1 重构的内容，形成正式产品架构文档。
4. 明确过滤掉当前阶段不做的内容，尤其是 tenant_id。

请新增或整理：

- docs/reference/imported-notes/README.md
- docs/reference/imported-notes/erp_plush_productization_config_permission_workflow_state_design.md
- docs/reference/imported-notes/erp_status_workflow_context.md

- docs/product/product-principles.md
- docs/product/config-permission-policy.md
- docs/product/customer-instance-policy.md
- docs/architecture/status-workflow-fact-boundary.md
- docs/product/release-gates.md

要求：

1. imported-notes 下的两个 md 顶部必须标注：
   - Doc Type: Imported Design Note
   - Status: Reference Only
   - Runtime Source of Truth: No
   - Schema Source of Truth: No
   - Current Implementation Source of Truth: No

2. product-principles.md 吸收：
   - 一套标准产品内核
   - 多套客户配置包
   - 少量客户专属模板 / 适配层
   - 极少数客户专属扩展
   - 核心业务代码尽量不分叉
   - 不做所有行业通用 ERP / 低代码平台

3. config-permission-policy.md 吸收：
   - 客户配置是安全子集
   - Feature Flag + RBAC + Data Scope + State Machine + Idempotency + Audit
   - 模块开关、菜单开关、字段显示、打印模板、角色权限
   - 客户不能配置库存、财务、审计、核心状态机、数据库结构

4. customer-instance-policy.md 明确：
   - current 是第一个真实客户 / 私有化客户实例 / 配置包来源
   - current 不是 SaaS runtime tenant
   - 当前不新增 tenant_id
   - 未来十几个甲方采用一个产品内核 + 一个行业模板 + 多个客户配置包 + 少量客户扩展

5. status-workflow-fact-boundary.md 吸收：
   - Workflow 协同层
   - 单据生命周期层
   - 业务事实层
   - 业务结果 / 派生状态
   - 系统横切状态
   - workflow done != fact posted
   - shipping_released != shipped
   - 动作产生事实，事实推导结果
   - canonical status 与中文文案分离
   - 状态跳转归 domain/usecase，不由 UI 或 repository 随便改

6. release-gates.md 加入测试门禁：
   - blocked reason 必填，trim 后不能为空
   - 同一 workflow event 幂等
   - 非目标 task 不触发
   - settled 终态保护
   - shipment_release 不写 inventory_txns / shipments / reservations / AR / invoice
   - shipping_released UI 不能显示为已出库
   - 中文文案修改不影响业务逻辑
   - UI 隐藏按钮后后端仍校验权限、状态、数据范围

禁止事项：
- 不新增 tenant_id。
- 不把两个 md 中的 tenant_id 字段示例写进当前 schema 方案。
- 不改 server/internal。
- 不改 web/src/erp/config/docs.mjs。
- 不改 web/src/erp/config/seedData.mjs。
- 不新增 migration。
- 不创建 SaaS 多租户能力。
- 不创建 license server、套餐计费、客户工单系统。
- 不创建泛化 Change 模块。
- 不把客户配置写成可以修改库存 / 财务核心事实规则。

验收命令：
- git diff --stat
- grep -R "tenant_id" docs/product docs/architecture docs/reference || true
- cd web && pnpm test

最终回复：
【完成】
【新增/修改文件】
【两个 md 被吸收到了哪里】
【明确过滤掉的内容】
【tenant_id 处理结论】
【测试命令与结果】
【风险】
【建议给 GPT 分析的下一步问题】
```

---

## 9. 最终建议

这两个 md **应该包含在从 0 到 1 方案里**，而且应该作为重构的重要输入。

但最终结构应该是：

```text
原始两个 md = reference only
正式方案 = 拆分后的 product / architecture / release gates 文档
```

最重要的一点：

```text
吸收它们的原则，不照搬它们的字段。
```

尤其是 `tenant_id`，当前阶段只作为未来 SaaS 评审候选，不进入当前 schema。当前你要做的是：

```text
单一产品内核
毛绒玩具行业模板
current 客户配置包
current 私有化部署实例
每客户独立数据库
不做 runtime 多租户
```

这样既能把两个 md 的状态、权限、配置、幂等、审计、Workflow / Fact 边界价值吃进去，又不会把项目提前带进 SaaS 多租户和复杂低代码平台。

### 018. user

_time `2026-05-30T00:54:04+08:00` · content_type `multimodal_text` · node `43700139-00bd-4c02-8bfb-d4da33251fee`_

[非文本内容]

```json
{
  "asset_pointer": "sediment://file_00000000cd3472099f097aeea49133c6",
  "content_type": "image_asset_pointer",
  "fovea": null,
  "height": 684,
  "metadata": {
    "asset_pointer_link": null,
    "container_pixel_height": null,
    "container_pixel_width": null,
    "dalle": null,
    "emu_omit_glimpse_image": null,
    "emu_patches_override": null,
    "generation": null,
    "gizmo": null,
    "is_no_auth_placeholder": null,
    "lpe_delta_encoding_channel": null,
    "lpe_keep_patch_ijhw": null,
    "sanitized": true,
    "watermarked_asset_pointer": null
  },
  "size_bytes": 54368,
  "width": 1832
}
```

拿给我一个codex的goal，我上传过去或者复制过去给它实现如何？

### 019. assistant

_time `2026-05-30T00:57:54+08:00` · content_type `text` · node `acb452a3-4526-4329-a0fe-1b5c5941a6c0`_

可以。建议你第一条 Codex Goal 不要直接让它“写完整 ERP”，而是让它完成 **0 到 1 重构 Phase 0：吸收两个设计 md，建立产品内核 / 配置 / 状态 / 权限 / 客户实例 / 交付骨架**。

理由：你这两个 md 已经把关键原则讲清了：一套标准产品内核、多客户配置包、少量客户模板 / 适配层、极少数扩展，核心代码尽量不分叉；同时也明确了 Workflow、单据生命周期、业务事实、派生状态、系统横切状态要分层，尤其 `shipping_released != shipped`、`workflow done != fact posted`。fileciteturn2file0 fileciteturn2file1 Codex 会读取仓库里的 `AGENTS.md` 作为项目指令，这类项目级指令文件正适合放开发约束、测试命令和架构规则。citeturn285191search0

下面这一整段可以直接复制到 Codex 的 **Goal** 里。

```text
Goal: plush-toy-erp 0 到 1 重构 Phase 0 —— 吸收两个设计 md，建立产品化架构、状态分层、配置权限、客户实例和交付骨架。只做文档与目录骨架，不改运行时代码。

背景：
这是一个毛绒玩具 ERP 起步项目。当前目标不是一次性外包系统，而是沉淀为“单一产品内核 + 毛绒玩具行业模板 + 多个客户配置包 + 私有化部署”的行业 ERP 产品。当前甲方是第一个真实客户 / 种子客户 / 私有化客户实例，但不是 SaaS runtime tenant。

本轮必须吸收这两个设计输入文件。如果文件不在仓库中，请先停止并报告缺失文件，不要猜：
- erp_plush_productization_config_permission_workflow_state_design.md
- erp_status_workflow_context.md

必须先读：
- AGENTS.md
- README.md
- docs/current-source-of-truth.md
- web/src/erp/docs/system-layer-progress.md
- web/src/erp/docs/productization-delivery.md
- web/src/erp/config/seedData.mjs
- web/src/erp/config/docs.mjs
- server/internal/biz/workflow.go
- server/internal/biz/rbac.go
- server/internal/data/model/schema
- server/internal/data 中 inventory / purchase / quality 相关代码
- erp_plush_productization_config_permission_workflow_state_design.md
- erp_status_workflow_context.md

核心目标：
1. 把两个 md 作为 Imported Design Notes / Reference Only 保存，不把它们原封不动作为最终真源。
2. 抽取其中适合当前 0 到 1 重构的原则，形成正式产品架构文档。
3. 建立 Product Core、Industry Template、Customer Config、Customer Extension、Workflow、MasterData、Fact、RBAC、API/UI、Help/QA、Delivery/Ops 的边界。
4. 建立 current 甲方的客户资料、需求线索、假设、问题、决策、配置草案。
5. 建立产品化配置、权限、状态分层、Workflow / Fact 边界和 release gates。
6. 创建必要目录骨架和 README，但不迁移旧代码、不改旧 runtime、不接入前端 docs registry。

允许新增或整理这些文件：

参考资料：
- docs/reference/imported-notes/README.md
- docs/reference/imported-notes/erp_plush_productization_config_permission_workflow_state_design.md
- docs/reference/imported-notes/erp_status_workflow_context.md

产品架构：
- docs/product/zero-to-one-architecture.md
- docs/product/product-principles.md
- docs/product/domain-model-v1.md
- docs/product/module-boundaries.md
- docs/product/config-permission-policy.md
- docs/product/customer-instance-policy.md
- docs/product/customer-delta-policy.md
- docs/product/rewrite-roadmap.md
- docs/product/release-gates.md
- docs/product/test-strategy.md

架构边界：
- docs/architecture/status-workflow-fact-boundary.md

当前客户资料：
- docs/customers/current/README.md
- docs/customers/current/source-materials.md
- docs/customers/current/requirement-clues.md
- docs/customers/current/assumption-register.md
- docs/customers/current/question-backlog.md
- docs/customers/current/decision-log.md
- docs/customers/current/customer-config-draft.md
- docs/customers/current/delta-register.md
- docs/customers/current/change-request-process.md

配置 / 交付骨架：
- config/industry-templates/plush/README.md
- config/customers/current/README.md
- deployments/current/README.md

可以创建这些空目录并放 README 或 .gitkeep：
- server/internal/core/
- server/internal/core/masterdata/
- server/internal/core/order/
- server/internal/core/bom/
- server/internal/core/purchase/
- server/internal/core/inventory/
- server/internal/core/quality/
- server/internal/core/production/
- server/internal/core/outsourcing/
- server/internal/core/shipment/
- server/internal/core/finance/
- server/internal/core/workflow/
- server/internal/core/rbac/
- server/internal/core/audit/
- web/src/erp/modules/
- web/src/erp/mobile/roles/

但本轮不要把旧代码搬进去，不要接路由，不要改 runtime。

文档内容要求：

1. docs/reference/imported-notes/README.md
   - 说明 imported-notes 是参考资料，不是当前实现真源。
   - 明确正式真源以 docs/product/*、docs/architecture/*、代码、schema、migration、tests 为准。

2. imported-notes 下两个 md 顶部必须加声明：
   - Doc Type: Imported Design Note
   - Status: Reference Only
   - Runtime Source of Truth: No
   - Schema Source of Truth: No
   - Current Implementation Source of Truth: No
   - Notes: 当前文档只作为 0 到 1 架构输入，不能直接驱动 schema 或 runtime。

3. zero-to-one-architecture.md
   - 写清项目定位：毛绒玩具工厂任务驱动型 ERP 产品内核。
   - 写清三阶段路线：
     第一阶段：单客户私有化部署 + 配置预留。
     第二阶段：多客户私有化部署，每客户一套数据库 / 对象存储 / env / 初始化数据 / 打印模板，代码统一。
     第三阶段：SaaS 多租户，未来单独评审。
   - 写清从 V0 到 V6：
     V0 架构骨架。
     V1 订单 / 客户 / 产品 / SKU / BOM / Boss Approval。
     V2 采购 / 来料 / 质检 / 库存。
     V3 生产 / 委外 / 成品入库。
     V4 出货放行 / 出货事实 / 预留 / 实际出库。
     V5 财务对账 / 应收 / 应付 / 发票 / 收付款。
     V6 产品化交付 / 配置包 / 部署包 / 培训 / 运维。
   - 明确当前不实现 SaaS runtime tenant。

4. product-principles.md
   - 吸收两个 md 中的核心原则：
     一套标准产品内核。
     毛绒玩具行业模板。
     多客户配置包。
     少量客户专属模板 / 数据适配。
     极少数客户扩展。
     核心业务代码尽量不分叉。
   - 明确不做所有行业通用 ERP、不做低代码平台、不做复杂 BPMN、不做泛化 Change 模块。

5. domain-model-v1.md
   - 写清第一版业务域模型：
     customers
     suppliers
     contacts
     products
     product_skus
     materials
     units
     warehouses
     sales_orders
     sales_order_items
     bom_headers
     bom_items
     purchase_orders
     purchase_receipts
     purchase_returns
     purchase_receipt_adjustments
     inventory_lots
     inventory_txns
     inventory_balances
     stock_reservations
     quality_inspections
     production_orders
     production_material_issues
     finished_goods_receipts
     outsource_orders
     outsource_material_issues
     outsource_receipts
     shipments
     shipment_items
     AR / AP / invoice / payment / reconciliation
   - 每个模型写 purpose、属于 MasterData / Source Document / Fact / Derived / Workflow / Config、是否 V1 必做、是否影响库存 / 出货 / 财务。
   - 只写设计草案，不改 Ent schema。

6. module-boundaries.md
   - 明确：
     Workflow task done != Fact posted。
     shipment_release done -> shipping_released。
     shipping_released != shipped。
     Quality task done != quality_inspection passed。
     business_records 不替代正式事实表。
     current 客户资料不等于 Product Core 真源。
     Workflow 只给许可和协同状态。
     Fact 层记录真实入库、出库、库存流水、质检、应收、应付、发票、收付款。
   - 明确禁止 WorkflowUsecase 写库存、出货、财务事实。

7. config-permission-policy.md
   - 吸收配置权限设计：
     Feature Flag
     RBAC
     Data Scope
     State Machine
     Idempotency
     Audit Log
   - 写清客户可以配置：
     公司名、logo、主题色、菜单开关、模块开关、字段显示、字段必填、编号规则、打印模板、角色模板、权限模板、初始化数据、默认仓库、默认单位。
   - 写清客户不能配置：
     库存扣减规则、入库增库存规则、库存流水删除、财务核销逻辑、审计关闭、核心状态机自由拖拽、数据库结构、自定义业务对象。
   - 写清流程节点绑定职责 / 权限，不绑定岗位。例如 shipment.release、payment.approve、material_readiness.confirm。

8. customer-instance-policy.md
   - 明确 current 是：
     第一个真实客户。
     种子客户。
     第一个私有化客户实例。
     第一个客户配置包来源。
   - 明确 current 不是：
     SaaS runtime tenant。
     数据库多租户。
     多租户 RBAC 隔离对象。
   - 推荐命名：
     customer_key = current
     config_key = current-private
     deployment_key = current-prod
     template_key = plush-industry
   - 明确当前不新增 tenant_id。

9. customer-delta-policy.md
   - 定义甲方后续提需求时如何分类：
     Product Core
     Industry Template
     Customer Config
     Customer Extension
     Data Import Adapter
     Print Template
     Reporting
   - 明确涉及库存、出货、财务事实的需求必须进入 Product Core 架构评审。
   - 明确只有当前客户需要的内容先放 current 客户资料或配置草案，不直接写进 Product Core。

10. status-workflow-fact-boundary.md
   - 吸收状态分层 md：
     Workflow 协同层。
     单据生命周期层。
     业务事实层。
     业务结果 / 派生状态。
     系统横切状态。
   - 必须写出核心口诀：
     流程管协同，单据管阶段，事实管落账，结果靠计算，系统状态别混业务。
   - 写清：
     workflow done != 已出库 / 已入库 / 已开票 / 已收款。
     shipping_released = 已放行 / 可发货 / 待出库。
     shipping_released != 已出库 / 已发货 / 已扣库存。
     动作产生事实，事实推导结果。
     派生状态可以缓存，但必须能从事实重算。
     canonical status 与中文文案分离。
     UI 不能用中文文案做业务判断。

11. release-gates.md
   - 定义每层 Definition of Done：
     Product Core
     Industry Template
     Customer Config
     Workflow
     MasterData
     Fact
     RBAC
     API/UI
     Help/QA
     Delivery/Ops
   - 加入测试门禁：
     blocked reason 必填，trim 后不能为空。
     同一 workflow event 幂等。
     非目标 task 不触发。
     settled 终态保护。
     shipment_release 不写 inventory_txns / shipments / reservations / AR / invoice。
     shipping_released UI 不能显示成已出库。
     中文文案修改不影响业务逻辑。
     UI 隐藏按钮后，后端仍校验权限、状态、数据范围。

12. test-strategy.md
   - 定义 T0~T6：
     T0 只改文档。
     T1 改前端配置 / docs / seed。
     T2 改 UI。
     T3 改后端 biz/data 非 schema。
     T4 改 Ent schema。
     T5 改部署 / 脚本。
     T6 发版前。
   - 写清每类改动需要跑哪些命令。

13. docs/customers/current/*
   - 只记录当前甲方资料、需求线索、假设、问题、决策、配置草案。
   - source-materials.md 标记现有 Excel / PDF / 图片 / seed / demo / print template 资料用途：
     Customer Material
     Demo Seed
     Industry Template Candidate
     Print Template Input
     QA Debug
   - requirement-clues.md 按业务域分类：
     客户 / 订单 / 款式
     产品 / SKU / BOM
     采购
     委外
     入库 / 质检
     生产
     出货
     财务
     手机端
     权限
     打印模板
     部署交付
   - assumption-register.md 记录不能直接开发成规则的假设。
   - question-backlog.md 用业务人员能看懂的话列问题，不要技术术语。
   - decision-log.md 只记录已经确认的决策，不要把猜测写成已决策。
   - customer-config-draft.md 写 current 未来可能配置项，但明确不是 runtime tenant。
   - delta-register.md 写当前客户差异项。
   - change-request-process.md 写后续提需求如何进入分类和评审，不创建 Change 模块。

14. config/industry-templates/plush/README.md
   - 说明这是毛绒玩具行业模板目录。
   - 未来放默认角色、默认菜单、默认流程、默认字段、编号规则、打印模板、seed template。
   - 当前只建 README，不写运行时配置加载器。

15. config/customers/current/README.md
   - 说明这是 current 客户配置包目录。
   - 当前只作为配置草案和未来落地位置，不是 SaaS tenant。
   - 不新增 tenant_id。
   - 不创建 runtime loader。

16. deployments/current/README.md
   - 说明这是 current 私有化部署实例资料。
   - 当前不改 server/deploy/compose/prod。
   - 未来可放 env、compose override、备份恢复、发布清单。
   - 不做多租户部署。

严格禁止：
- 不新增 tenant_id。
- 不改 Ent schema。
- 不新增 migration。
- 不改 server/internal/biz/workflow.go。
- 不改 server/internal/biz/rbac.go。
- 不改 server/internal/data。
- 不改 web/src/erp/config/docs.mjs。
- 不改 web/src/erp/config/seedData.mjs。
- 不接入前端 docs registry。
- 不移动旧文档。
- 不移动旧代码。
- 不把两个 md 中的 tenant_id 字段示例写进当前 schema 方案。
- 不实现 SaaS。
- 不实现 license server。
- 不实现套餐计费。
- 不实现客户工单系统。
- 不创建泛化 ChangeUsecase。
- 不创建 change_records。
- 不把当前甲方资料写成 Product Core 规则。
- 不把 Workflow done 写成 Fact posted。
- 不把 shipping_released 写成 shipped。

验收命令：
- git diff --stat
- find docs/product docs/architecture docs/reference docs/customers/current config/industry-templates/plush config/customers/current deployments/current -maxdepth 3 -type f | sort
- grep -R "tenant_id" docs/product docs/architecture docs/reference docs/customers config deployments || true
- cd web && pnpm test

如果测试因环境或已有问题失败：
- 不要继续乱改。
- 输出失败命令。
- 输出关键日志。
- 判断是否与本轮文档改动相关。

最终回复必须包含：
【完成】
【新增目录】
【新增/修改文件】
【两个 md 被吸收到哪里】
【明确过滤掉的内容】
【tenant_id 处理结论】
【0 到 1 架构摘要】
【没有做的内容】
【测试命令与结果】
【风险】
【建议给 GPT 分析的下一步问题】
```

Codex 跑完后，你把它的输出按下面格式贴回来，我就能继续给你下一轮 Goal：

```text
【Codex 完成摘要】
粘贴它的完成结果。

【新增/修改文件】
粘贴文件列表。

【git diff --stat】
粘贴结果。

【测试命令与结果】
粘贴命令和结果，失败只贴关键日志。

【Codex 说的风险】
粘贴风险。

【Codex 建议下一步】
粘贴下一步。

请你判断：
1. 这轮是否合格。
2. 是否误加 tenant_id。
3. 是否误把 current 当 SaaS runtime tenant。
4. 是否误把甲方资料当 Product Core。
5. 是否混淆 Workflow / Fact。
6. 下一轮 Codex Goal 应该是什么。
```

这条 Goal 的定位是：**先把地基打正**。它会让 Codex 做出可审查的架构、文档、客户实例和配置骨架；通过后，再进入第二条 Goal：`domain-schema-draft.md`，也就是正式设计 V1~V5 的表和 usecase，但仍然先不落 migration。

### 020. user

_time `2026-05-30T01:00:27+08:00` · content_type `text` · node `557f1254-5f16-42d2-bf92-2a4dc480cd53`_

每次跑完后，要不要把代码压缩上传给你

### 021. user

_time `2026-05-30T01:03:47+08:00` · content_type `text` · node `9cc76762-2907-4d65-b3b2-f9204a16b526`_

每次跑完后，要不要把代码压缩上传给你

### 022. assistant

_time `2026-05-30T01:05:58+08:00` · content_type `text` · node `ef040203-3f3c-4138-b6d2-5035160019f1`_

## 结论

**不用每次都把整个代码压缩上传给我。**

更推荐：

```text
小改动：贴 Codex 输出 + git diff --stat + 测试结果
中等改动：上传 review bundle zip
大重构 / 阶段结束：上传完整源码 zip 或 review bundle + 源码 zip
```

原因是：你这个项目后续要保持“一套产品内核 + 多客户配置包 + 少量扩展”，同时还要严格守住 Workflow / Fact 状态边界；我每轮主要需要看“Codex 到底改了什么、有没有越界、测试有没有跑”，不一定需要全仓库。两个设计文档里也已经明确了核心代码尽量不分叉，以及 Workflow、单据生命周期、业务事实、派生状态、系统横切状态要分层，不能混在一起。fileciteturn2file0 fileciteturn2file1

---

# 1. 什么时候不用上传 zip

下面这些情况，**不用压缩上传完整代码**：

| Codex 本轮做了什么 | 你给我什么就够 |
|---|---|
| 只写文档 | Codex 输出 + `git diff --stat` + 新文档标题摘要 |
| 只改 README / docs 索引 | Codex 输出 + diff stat + 关键 diff |
| 只改一个小测试 | Codex 输出 + 改动文件 + 测试结果 |
| 只做审计报告 | 直接粘贴报告 |
| Codex 没改文件，只分析 | 粘贴分析结果即可 |

这种情况下，上传全仓库反而会增加分析成本。

---

# 2. 什么时候建议上传 review bundle

下面这些情况，建议上传一个**小型 review bundle zip**，不是完整仓库：

| 情况 | 建议上传 |
|---|---|
| Codex 改了 5 个以上文件 | review bundle |
| 同时改了 docs + server + web | review bundle |
| 新增了目录骨架 | review bundle |
| 改了测试 | review bundle |
| 改了 `docs.mjs` / `seedData.mjs` | review bundle |
| 你不确定 Codex 有没有越界 | review bundle |
| Codex 输出太长，粘贴不方便 | review bundle |

review bundle 里放：

```text
codex-prompt.md
codex-result.md
git-status.txt
git-diff-stat.txt
changed-files.txt
changes.patch
test-output.log
changed-files/
```

这比完整源码 zip 更适合让我审查。

---

# 3. 什么时候上传完整源码 zip

下面这些情况，上传完整源码 zip 更合适：

| 情况 | 是否上传完整源码 |
|---|---|
| Phase 0 完成，准备进入 Phase 1 | 建议上传 |
| 目录大重构完成 | 建议上传 |
| schema / migration 开始落地前 | 建议上传 |
| schema / migration 落地后 | 建议上传 |
| 大量文件被移动 / 删除 / 重命名 | 建议上传 |
| 前端路由 / docs registry / seed 被大改 | 建议上传 |
| 我需要重新完整阅读当前仓库状态 | 建议上传 |
| 准备让 Codex 做下一轮大任务 | 建议上传一次 |

建议频率：

```text
每个大阶段结束上传一次完整源码 zip。
每个 Codex 小任务结束只发 review bundle 或文本摘要。
```

---

# 4. 每次 Codex 跑完后，你最少发我这些

每轮至少发：

```text
【Codex 原始 Goal】
粘贴你给 Codex 的提示词。

【Codex 完成摘要】
粘贴 Codex 的最终回复。

【git diff --stat】
粘贴结果。

【git status --short】
粘贴结果。

【测试命令与结果】
粘贴实际跑过的命令和结果。

【Codex 自己说的风险】
粘贴它列出的风险。

【你希望我判断什么】
例如：是否合格、是否越界、下一轮 Goal 怎么写。
```

这个信息通常已经够我判断：

```text
是否误加 tenant_id
是否误把 current 当 runtime tenant
是否混淆 Workflow / Fact
是否把甲方资料写进 Product Core
是否改了不该改的文件
测试是否匹配改动类型
下一轮 Codex Goal 应该是什么
```

---

# 5. 推荐的 review bundle 生成命令

在 Codex 跑完后，在仓库根目录执行：

```bash
RUN_ID=codex-$(date +%Y%m%d-%H%M)
mkdir -p .review/$RUN_ID

git status --short > .review/$RUN_ID/git-status.txt
git diff --stat > .review/$RUN_ID/git-diff-stat.txt
git diff --name-only > .review/$RUN_ID/changed-files.txt
git diff --binary > .review/$RUN_ID/changes.patch

# 如果有未跟踪的新文件，先记录出来
git ls-files --others --exclude-standard > .review/$RUN_ID/untracked-files.txt

# 复制已修改文件
while IFS= read -r f; do
  if [ -f "$f" ]; then
    mkdir -p ".review/$RUN_ID/changed-files/$(dirname "$f")"
    cp "$f" ".review/$RUN_ID/changed-files/$f"
  fi
done < .review/$RUN_ID/changed-files.txt

# 复制未跟踪文件
while IFS= read -r f; do
  if [ -f "$f" ]; then
    mkdir -p ".review/$RUN_ID/changed-files/$(dirname "$f")"
    cp "$f" ".review/$RUN_ID/changed-files/$f"
  fi
done < .review/$RUN_ID/untracked-files.txt

zip -r /tmp/$RUN_ID-review-bundle.zip .review/$RUN_ID
echo "/tmp/$RUN_ID-review-bundle.zip"
```

然后上传：

```text
/tmp/codex-YYYYMMDD-HHMM-review-bundle.zip
```

---

# 6. 如果要上传完整源码 zip，用这个命令

不要把这些放进去：

```text
.git
node_modules
dist
build
.env
.env.*
tmp
logs
数据库 dump
客户真实私密资料
```

命令：

```bash
RUN_ID=plush-toy-erp-$(date +%Y%m%d-%H%M)

zip -r /tmp/$RUN_ID-source.zip . \
  -x ".git/*" \
  -x "node_modules/*" \
  -x "web/node_modules/*" \
  -x "dist/*" \
  -x "build/*" \
  -x "web/dist/*" \
  -x ".env" \
  -x ".env.*" \
  -x "tmp/*" \
  -x "logs/*" \
  -x ".review/*"

echo "/tmp/$RUN_ID-source.zip"
```

上传这个：

```text
/tmp/plush-toy-erp-YYYYMMDD-HHMM-source.zip
```

---

# 7. 什么时候用 patch 更好

如果 Codex 只是改了一批文本和少量代码，上传 patch 最好。

生成：

```bash
git diff --binary > /tmp/codex-changes.patch
```

如果有新增未跟踪文件，先临时 stage 再生成 patch：

```bash
git add -A
git diff --cached --binary > /tmp/codex-changes.patch
git diff --cached --stat > /tmp/codex-diff-stat.txt
git restore --staged .
```

然后上传：

```text
codex-changes.patch
codex-diff-stat.txt
```

patch 的好处是我能非常快地判断“到底改了什么”。

---

# 8. 我建议你采用这个节奏

## 每个 Codex 小任务后

发我：

```text
Codex 输出
git status --short
git diff --stat
测试结果
```

必要时加：

```text
review bundle zip
```

## 每个阶段完成后

上传：

```text
完整源码 zip
```

阶段包括：

```text
Phase 0：架构 / 文档 / 目录骨架
Phase 1：领域模型草案
Phase 2：V0 代码骨架
Phase 3：V1 订单 / 主数据 / BOM
Phase 4：V2 采购 / 质检 / 库存
Phase 5：V3 生产 / 委外
Phase 6：V4 出货 / 预留 / 出库
Phase 7：V5 财务
```

---

# 9. 你下次 Codex 跑完后，可以这样发我

直接复制这个模板：

```text
这是 Codex 本轮跑完后的结果，请你审查是否合格，并给我下一轮 Codex Goal。

【本轮 Goal】
[粘贴给 Codex 的 Goal]

【Codex 完成摘要】
[粘贴 Codex 输出]

【git status --short】
[粘贴结果]

【git diff --stat】
[粘贴结果]

【新增/修改文件】
[粘贴文件列表]

【测试命令与结果】
[粘贴命令和结果，失败只贴关键日志]

【上传文件】
[如果有 review bundle 或 source zip，说明文件名]

【我希望你检查】
1. 是否误加 tenant_id。
2. 是否误把 current 当 SaaS runtime tenant。
3. 是否误把甲方资料写成 Product Core。
4. 是否混淆 Workflow / Fact。
5. 是否改了禁止修改的文件。
6. 是否测试不足。
7. 下一轮 Codex Goal 应该是什么。
```

---

# 10. 最终建议

**不要每次上传完整源码 zip。**

推荐规则：

```text
每轮小任务：贴摘要 + diff stat + 测试结果。
中等改动：上传 review bundle。
每个大阶段结束：上传完整源码 zip。
```

当前你第一轮 Codex Goal 是 Phase 0 文档和骨架任务。它跑完后，建议先发我：

```text
Codex 输出
git status --short
git diff --stat
测试结果
```

如果它新增了很多文档和目录，再附一个：

```text
review bundle zip
```

完整源码 zip 可以等 Phase 0 审查通过后再传。

### 023. user

_time `2026-05-30T01:11:53+08:00` · content_type `text` · node `fc57596c-ce22-4cc9-b537-02732079f132`_

Goal must be 4,000 characters or fewer，下次直接给出可复制md对应的文件名，你觉得如何？

### 024. assistant

_time `2026-05-30T01:13:51+08:00` · content_type `text` · node `c1268199-29d8-4906-a362-3c20416b9b9d`_

可以，而且我建议以后就改成这种方式：

```text
Codex Goal：只放 500~1500 字的短指令
详细任务：放在一个可复制的 .md 文件里
Codex 跑完：把输出 + diff stat + 测试结果贴回 GPT
```

这样比每次塞一个超长 Goal 更稳。原因是你这个项目有很多固定边界：产品内核、客户配置、Workflow / Fact 分层、`shipping_released != shipped`、客户资料不能变成 Product Core，这些都适合沉淀成版本化的任务 md。两个上传的设计 md 也正好适合作为这套任务体系的输入：一个明确了“一套标准产品内核 + 多客户配置包 + 受控客户差异”的产品化原则，另一个明确了 Workflow、单据生命周期、业务事实、派生状态和系统横切状态的分层边界。fileciteturn2file0 fileciteturn2file1

---

## 以后我给你的格式

后续我建议每次直接给你三段：

```text
1. Codex Goal，保证 4,000 字符以内
2. 需要你创建的 md 文件名
3. md 文件完整内容
```

你先把 md 文件复制到仓库里，然后 Codex Goal 只需要写：

```text
Read <task-md-path> and execute it exactly.
```

---

## 推荐目录

建议放：

```text
docs/codex-goals/
```

例如：

```text
docs/codex-goals/000-phase0-foundation.md
docs/codex-goals/001-doc-consistency-audit.md
docs/codex-goals/002-domain-schema-draft.md
docs/codex-goals/003-v0-module-skeleton.md
docs/codex-goals/004-customer-current-requirements.md
docs/codex-goals/005-workflow-shipment-release-tests.md
```

我不建议放在 `docs/product/` 里，因为这些是“给 Codex 的执行任务”，不是产品真源文档。也不建议放在 `docs/changes/`，避免和历史变更记录混淆。

---

## 这次可以用的短 Goal

这个可以直接复制到 Codex Goal，长度远低于 4,000 字符：

```text
Goal: Execute docs/codex-goals/000-phase0-foundation.md.

Read AGENTS.md first, then read the task file exactly. This is Phase 0 for plush-toy-erp zero-to-one restructuring.

Strict rules:
- Do not modify runtime code.
- Do not modify Ent schema.
- Do not add migrations.
- Do not add tenant_id.
- Do not implement SaaS multi-tenancy.
- Do not modify server/internal/biz/workflow.go.
- Do not modify server/internal/biz/rbac.go.
- Do not modify web/src/erp/config/docs.mjs.
- Do not modify web/src/erp/config/seedData.mjs.
- Do not move old code or old docs.
- Do not create a generic Change module.
- Do not treat current customer files as Product Core rules.
- Do not confuse Workflow done with Fact posted.

After finishing, run the commands required by the task file and reply with:
【完成】
【新增目录】
【新增/修改文件】
【两个 md 被吸收到哪里】
【明确过滤掉的内容】
【tenant_id 处理结论】
【0 到 1 架构摘要】
【没有做的内容】
【测试命令与结果】
【风险】
【建议给 GPT 分析的下一步问题】
```

---

## 对应 md 文件名

你在仓库里创建这个文件：

```text
docs/codex-goals/000-phase0-foundation.md
```

---

## `docs/codex-goals/000-phase0-foundation.md` 内容

下面整段复制进去：

```md
# Codex Goal 000: Phase 0 Foundation

## 任务名称

plush-toy-erp 0 到 1 重构 Phase 0：建立产品化架构、状态分层、配置权限、客户实例和交付骨架。

## 任务性质

本轮只做文档与目录骨架。

不要改运行时代码。  
不要改 schema。  
不要新增 migration。  
不要新增 tenant_id。  
不要实现 SaaS 多租户。  
不要迁移旧代码。  
不要接入前端 docs registry。

## 背景

这是一个毛绒玩具 ERP 起步项目。

当前目标：

1. 服务 current 甲方上线。
2. 沉淀为毛绒玩具行业 ERP 产品内核。
3. 支持未来多个客户私有化部署。
4. 后续才单独评审 SaaS 多租户。

current 甲方是：

- 第一个真实客户。
- 种子客户。
- 第一个私有化客户实例。
- 第一个客户配置包来源。

current 甲方不是：

- SaaS runtime tenant。
- 数据库多租户。
- 多租户 RBAC 隔离对象。

## 必须先读

- AGENTS.md
- README.md
- docs/current-source-of-truth.md
- web/src/erp/docs/system-layer-progress.md
- web/src/erp/docs/productization-delivery.md
- web/src/erp/config/seedData.mjs
- web/src/erp/config/docs.mjs
- server/internal/biz/workflow.go
- server/internal/biz/rbac.go
- server/internal/data/model/schema
- server/internal/data 中 inventory / purchase / quality 相关代码
- erp_plush_productization_config_permission_workflow_state_design.md
- erp_status_workflow_context.md

如果两个设计 md 不在仓库中，请停止并报告缺失文件，不要猜。

## 需要新增或整理的文件

### 参考资料

- docs/reference/imported-notes/README.md
- docs/reference/imported-notes/erp_plush_productization_config_permission_workflow_state_design.md
- docs/reference/imported-notes/erp_status_workflow_context.md

### 产品架构

- docs/product/zero-to-one-architecture.md
- docs/product/product-principles.md
- docs/product/domain-model-v1.md
- docs/product/module-boundaries.md
- docs/product/config-permission-policy.md
- docs/product/customer-instance-policy.md
- docs/product/customer-delta-policy.md
- docs/product/rewrite-roadmap.md
- docs/product/release-gates.md
- docs/product/test-strategy.md

### 架构边界

- docs/architecture/status-workflow-fact-boundary.md

### 当前客户资料

- docs/customers/current/README.md
- docs/customers/current/source-materials.md
- docs/customers/current/requirement-clues.md
- docs/customers/current/assumption-register.md
- docs/customers/current/question-backlog.md
- docs/customers/current/decision-log.md
- docs/customers/current/customer-config-draft.md
- docs/customers/current/delta-register.md
- docs/customers/current/change-request-process.md

### 配置与交付骨架

- config/industry-templates/plush/README.md
- config/customers/current/README.md
- deployments/current/README.md

## 可以创建空目录并放 README 或 .gitkeep

- server/internal/core/
- server/internal/core/masterdata/
- server/internal/core/order/
- server/internal/core/bom/
- server/internal/core/purchase/
- server/internal/core/inventory/
- server/internal/core/quality/
- server/internal/core/production/
- server/internal/core/outsourcing/
- server/internal/core/shipment/
- server/internal/core/finance/
- server/internal/core/workflow/
- server/internal/core/rbac/
- server/internal/core/audit/
- web/src/erp/modules/
- web/src/erp/mobile/roles/

本轮不要把旧代码搬进去。

## imported-notes 要求

两个 imported note 顶部必须加：

```text
Doc Type: Imported Design Note
Status: Reference Only
Runtime Source of Truth: No
Schema Source of Truth: No
Current Implementation Source of Truth: No
```

说明：

- 它们只是 0 到 1 架构输入。
- 不能直接驱动 schema。
- 不能直接驱动 runtime。
- 正式真源以 docs/product/*、docs/architecture/*、代码、schema、migration、tests 为准。

## zero-to-one-architecture.md 要求

写清项目定位：

```text
毛绒玩具工厂任务驱动型 ERP 产品内核
```

写清三阶段路线：

1. 单客户私有化部署 + 配置预留。
2. 多客户私有化部署，每客户一套数据库 / 对象存储 / env / 初始化数据 / 打印模板，代码统一。
3. SaaS 多租户，未来单独评审。

写清 V0 到 V6：

- V0 架构骨架。
- V1 订单 / 客户 / 产品 / SKU / BOM / Boss Approval。
- V2 采购 / 来料 / 质检 / 库存。
- V3 生产 / 委外 / 成品入库。
- V4 出货放行 / 出货事实 / 预留 / 实际出库。
- V5 财务对账 / 应收 / 应付 / 发票 / 收付款。
- V6 产品化交付 / 配置包 / 部署包 / 培训 / 运维。

## product-principles.md 要求

必须包含：

- 一套标准产品内核。
- 毛绒玩具行业模板。
- 多客户配置包。
- 少量客户专属模板 / 数据适配。
- 极少数客户扩展。
- 核心业务代码尽量不分叉。
- 不做所有行业通用 ERP。
- 不做低代码平台。
- 不做复杂 BPMN。
- 不做泛化 Change 模块。

## domain-model-v1.md 要求

列出第一版业务域模型：

- customers
- suppliers
- contacts
- products
- product_skus
- materials
- units
- warehouses
- sales_orders
- sales_order_items
- bom_headers
- bom_items
- purchase_orders
- purchase_receipts
- purchase_returns
- purchase_receipt_adjustments
- inventory_lots
- inventory_txns
- inventory_balances
- stock_reservations
- quality_inspections
- production_orders
- production_material_issues
- finished_goods_receipts
- outsource_orders
- outsource_material_issues
- outsource_receipts
- shipments
- shipment_items
- AR / AP / invoice / payment / reconciliation

每个模型写：

- purpose
- 所属类型：MasterData / Source Document / Fact / Derived / Workflow / Config
- 是否 V1 必做
- 是否影响库存
- 是否影响出货
- 是否影响财务

只写设计草案，不改 Ent schema。

## module-boundaries.md 要求

必须明确：

- Workflow task done != Fact posted。
- shipment_release done -> shipping_released。
- shipping_released != shipped。
- Quality task done != quality_inspection passed。
- business_records 不替代正式事实表。
- current 客户资料不等于 Product Core 真源。
- Workflow 只给许可和协同状态。
- Fact 层记录真实入库、出库、库存流水、质检、应收、应付、发票、收付款。
- 禁止 WorkflowUsecase 写库存、出货、财务事实。

## config-permission-policy.md 要求

必须包含：

- Feature Flag
- RBAC
- Data Scope
- State Machine
- Idempotency
- Audit Log

客户可以配置：

- 公司名
- logo
- 主题色
- 菜单开关
- 模块开关
- 字段显示
- 字段必填
- 编号规则
- 打印模板
- 角色模板
- 权限模板
- 初始化数据
- 默认仓库
- 默认单位

客户不能配置：

- 库存扣减规则
- 入库增库存规则
- 库存流水删除
- 财务核销逻辑
- 审计关闭
- 核心状态机自由拖拽
- 数据库结构
- 自定义业务对象

流程节点绑定职责 / 权限，不绑定岗位。

示例：

- shipment.release
- payment.approve
- material_readiness.confirm

## customer-instance-policy.md 要求

必须明确：

```text
customer_key = current
config_key = current-private
deployment_key = current-prod
template_key = plush-industry
```

current 是第一个私有化客户实例，不是 SaaS runtime tenant。

当前不新增 tenant_id。

未来多个甲方采用：

```text
一个产品内核
一个行业模板
多个客户配置包
少量客户扩展
每客户独立数据库 / 对象存储 / 部署配置
```

## customer-delta-policy.md 要求

定义甲方需求分类：

- Product Core
- Industry Template
- Customer Config
- Customer Extension
- Data Import Adapter
- Print Template
- Reporting

涉及库存、出货、财务事实的需求必须进入 Product Core 架构评审。

只有 current 客户需要的内容，先放 current 客户资料或配置草案，不直接写进 Product Core。

## status-workflow-fact-boundary.md 要求

必须包含状态五层：

1. Workflow 协同层。
2. 单据生命周期层。
3. 业务事实层。
4. 业务结果 / 派生状态。
5. 系统横切状态。

必须写出口诀：

```text
流程管协同，单据管阶段，事实管落账，结果靠计算，系统状态别混业务。
```

必须写清：

- workflow done != 已出库 / 已入库 / 已开票 / 已收款。
- shipping_released = 已放行 / 可发货 / 待出库。
- shipping_released != 已出库 / 已发货 / 已扣库存。
- 动作产生事实，事实推导结果。
- 派生状态可以缓存，但必须能从事实重算。
- canonical status 与中文文案分离。
- UI 不能用中文文案做业务判断。

## release-gates.md 要求

定义每层 Definition of Done：

- Product Core
- Industry Template
- Customer Config
- Workflow
- MasterData
- Fact
- RBAC
- API/UI
- Help/QA
- Delivery/Ops

加入测试门禁：

- blocked reason 必填，trim 后不能为空。
- 同一 workflow event 幂等。
- 非目标 task 不触发。
- settled 终态保护。
- shipment_release 不写 inventory_txns / shipments / reservations / AR / invoice。
- shipping_released UI 不能显示成已出库。
- 中文文案修改不影响业务逻辑。
- UI 隐藏按钮后，后端仍校验权限、状态、数据范围。

## test-strategy.md 要求

定义 T0 到 T6：

- T0 只改文档。
- T1 改前端配置 / docs / seed。
- T2 改 UI。
- T3 改后端 biz/data 非 schema。
- T4 改 Ent schema。
- T5 改部署 / 脚本。
- T6 发版前。

每类改动写清需要跑哪些命令。

## docs/customers/current/* 要求

只记录 current 甲方资料、需求线索、假设、问题、决策、配置草案。

不要把 current 客户资料写成 Product Core 规则。

source-materials.md 标记现有 Excel / PDF / 图片 / seed / demo / print template 资料用途：

- Customer Material
- Demo Seed
- Industry Template Candidate
- Print Template Input
- QA Debug

requirement-clues.md 按业务域分类：

- 客户 / 订单 / 款式
- 产品 / SKU / BOM
- 采购
- 委外
- 入库 / 质检
- 生产
- 出货
- 财务
- 手机端
- 权限
- 打印模板
- 部署交付

assumption-register.md 记录不能直接开发成规则的假设。

question-backlog.md 用业务人员能看懂的话列问题，不要技术术语。

decision-log.md 只记录已经确认的决策，不要把猜测写成已决策。

customer-config-draft.md 写 current 未来可能配置项，但明确不是 runtime tenant。

delta-register.md 写当前客户差异项。

change-request-process.md 写后续提需求如何进入分类和评审，不创建 Change 模块。

## config 与 deployments README 要求

config/industry-templates/plush/README.md：

- 说明这是毛绒玩具行业模板目录。
- 未来放默认角色、默认菜单、默认流程、默认字段、编号规则、打印模板、seed template。
- 当前只建 README，不写运行时配置加载器。

config/customers/current/README.md：

- 说明这是 current 客户配置包目录。
- 当前只作为配置草案和未来落地位置。
- 不是 SaaS tenant。
- 不新增 tenant_id。
- 不创建 runtime loader。

deployments/current/README.md：

- 说明这是 current 私有化部署实例资料。
- 当前不改 server/deploy/compose/prod。
- 未来可放 env、compose override、备份恢复、发布清单。
- 不做多租户部署。

## 严格禁止

- 不新增 tenant_id。
- 不改 Ent schema。
- 不新增 migration。
- 不改 server/internal/biz/workflow.go。
- 不改 server/internal/biz/rbac.go。
- 不改 server/internal/data。
- 不改 web/src/erp/config/docs.mjs。
- 不改 web/src/erp/config/seedData.mjs。
- 不接入前端 docs registry。
- 不移动旧文档。
- 不移动旧代码。
- 不把两个 md 中的 tenant_id 字段示例写进当前 schema 方案。
- 不实现 SaaS。
- 不实现 license server。
- 不实现套餐计费。
- 不实现客户工单系统。
- 不创建泛化 ChangeUsecase。
- 不创建 change_records。
- 不把当前甲方资料写成 Product Core 规则。
- 不把 Workflow done 写成 Fact posted。
- 不把 shipping_released 写成 shipped。

## 验收命令

必须运行：

```bash
git diff --stat
find docs/product docs/architecture docs/reference docs/customers/current config/industry-templates/plush config/customers/current deployments/current -maxdepth 3 -type f | sort
grep -R "tenant_id" docs/product docs/architecture docs/reference docs/customers config deployments || true
cd web && pnpm test
```

如果测试因环境或已有问题失败：

- 不要继续乱改。
- 输出失败命令。
- 输出关键日志。
- 判断是否与本轮文档改动相关。

## 最终回复格式

```text
【完成】
【新增目录】
【新增/修改文件】
【两个 md 被吸收到哪里】
【明确过滤掉的内容】
【tenant_id 处理结论】
【0 到 1 架构摘要】
【没有做的内容】
【测试命令与结果】
【风险】
【建议给 GPT 分析的下一步问题】
```
```

---

## 以后就按这个模式

下一次你问我要 Codex Goal，我会直接给：

```text
Codex Goal:
[≤4000 字符]

MD 文件名:
docs/codex-goals/xxx.md

MD 内容:
[完整可复制]
```

这会比把所有细节塞进 Goal 稳定很多，也更适合你后续多轮让 Codex 做阶段化重构。

### 025. user

_time `2026-05-30T01:17:13+08:00` · content_type `multimodal_text` · node `47c3fb63-1049-43e1-bb23-3a852e0dab80`_

[非文本内容]

```json
{
  "asset_pointer": "sediment://file_0000000053d47209a721a0a49681d308",
  "content_type": "image_asset_pointer",
  "fovea": null,
  "height": 1806,
  "metadata": {
    "asset_pointer_link": null,
    "container_pixel_height": null,
    "container_pixel_width": null,
    "dalle": null,
    "emu_omit_glimpse_image": null,
    "emu_patches_override": null,
    "generation": null,
    "gizmo": null,
    "is_no_auth_placeholder": null,
    "lpe_delta_encoding_channel": null,
    "lpe_keep_patch_ijhw": null,
    "sanitized": true,
    "watermarked_asset_pointer": null
  },
  "size_bytes": 486405,
  "width": 1666
}
```

[非文本内容]

```json
{
  "asset_pointer": "sediment://file_0000000083247209b90ea986b82f6b68",
  "content_type": "image_asset_pointer",
  "fovea": null,
  "height": 1588,
  "metadata": {
    "asset_pointer_link": null,
    "container_pixel_height": null,
    "container_pixel_width": null,
    "dalle": null,
    "emu_omit_glimpse_image": null,
    "emu_patches_override": null,
    "generation": null,
    "gizmo": null,
    "is_no_auth_placeholder": null,
    "lpe_delta_encoding_channel": null,
    "lpe_keep_patch_ijhw": null,
    "sanitized": true,
    "watermarked_asset_pointer": null
  },
  "size_bytes": 292366,
  "width": 1710
}
```

[非文本内容]

```json
{
  "asset_pointer": "sediment://file_0000000035147209a9131bbda5634211",
  "content_type": "image_asset_pointer",
  "fovea": null,
  "height": 1436,
  "metadata": {
    "asset_pointer_link": null,
    "container_pixel_height": null,
    "container_pixel_width": null,
    "dalle": null,
    "emu_omit_glimpse_image": null,
    "emu_patches_override": null,
    "generation": null,
    "gizmo": null,
    "is_no_auth_placeholder": null,
    "lpe_delta_encoding_channel": null,
    "lpe_keep_patch_ijhw": null,
    "sanitized": true,
    "watermarked_asset_pointer": null
  },
  "size_bytes": 445228,
  "width": 1724
}
```

为什么都是小goal，不能一次给个挂一晚的大goal吗


M README.md
M docs/current-source-of-truth.md
M progress.md
M web/src/erp/docs/productization-delivery.md
M web/src/erp/docs/system-layer-progress.md
A config/customers/current/README.md
A config/industry-templates/plush/README.md
A deployments/current/README.md
A docs/architecture/status-workflow-fact-boundary.md
A docs/customers/current/README.md
A docs/customers/current/assumption-register.md
A docs/customers/current/change-request-process.md
A docs/customers/current/customer-config-draft.md
A docs/customers/current/decision-log.md
A docs/customers/current/delta-register.md
A docs/customers/current/question-backlog.md
A docs/customers/current/requirement-clues.md
A docs/customers/current/source-materials.md
A docs/product/config-permission-policy.md
A docs/product/customer-delta-policy.md
A docs/product/customer-instance-policy.md
A docs/product/domain-model-v1.md
A docs/product/module-boundaries.md
A docs/product/product-principles.md
A docs/product/release-gates.md
A docs/product/rewrite-roadmap.md
A docs/product/test-strategy.md
A docs/product/zero-to-one-architecture.md
A docs/reference/imported-notes/README.md
A docs/reference/imported-notes/erp_plush_productization_config_permission_workflow_state_design.md
A docs/reference/imported-notes/erp_status_workflow_context.md
A server/internal/core/README.md
A server/internal/core/audit/.gitkeep
A server/internal/core/bom/.gitkeep
A server/internal/core/finance/.gitkeep
A server/internal/core/inventory/.gitkeep
A server/internal/core/masterdata/.gitkeep
A server/internal/core/order/.gitkeep
A server/internal/core/outsourcing/.gitkeep
A server/internal/core/production/.gitkeep
A server/internal/core/purchase/.gitkeep
A server/internal/core/quality/.gitkeep
A server/internal/core/rbac/.gitkeep
A server/internal/core/shipment/.gitkeep
A server/internal/core/workflow/.gitkeep
A web/src/erp/mobile/roles/README.md
A web/src/erp/modules/README.md

### 026. assistant

_time `2026-05-30T01:20:14+08:00` · content_type `text` · node `e7193ff4-f452-4089-b06a-a72433be4eb9`_

可以，**当然可以给一个挂一晚的大 Goal**。我之前给小 Goal，是因为你刚开始让 Codex 接手项目，最怕它一口气改 schema、runtime、前端、文档、配置，最后很难 review。

现在 Phase 0 已经跑通，Codex 也证明能遵守边界：没有改 runtime、没有改 Ent schema、没有 migration、没有改 `workflow.go / rbac.go / seedData.mjs / docs.mjs`，这一轮我判断**基本合格**。

但“大 Goal”要分类型：

| 大 Goal 类型 | 能不能挂一晚 | 建议 |
|---|---:|---|
| 大范围阅读 + 架构评审 + 文档产出 | 可以 | 最适合 |
| 目录骨架 + README + 测试门禁 | 可以 | 可以挂一晚 |
| schema 草案 + usecase 草案，不落代码 | 可以 | 适合下一步 |
| 直接落 Ent schema + migration + repo + usecase + API + UI | 不建议无人值守 | 容易难 review |
| 一晚做完整订单 / 采购 / 库存 / 出货闭环 | 不建议 | 风险太高 |

你的项目核心原则是“一套标准产品内核 + 多客户配置包 + 少量客户模板 / 适配层 + 极少数扩展”，不是每个客户一套代码；这类原则适合沉淀进大任务的边界条件。fileciteturn2file0 同时状态层也必须守住“流程管协同，单据管阶段，事实管落账，结果靠计算”，所以大 Goal 更要禁止 Codex 把 Workflow、出货、库存、财务混在一起。fileciteturn2file1

---

# 这轮 Codex 输出的判断

## 结论：合格，可以进入下一轮

它做对了：

```text
1. Phase 0 文档和骨架已建立。
2. 两个设计 md 已放到 imported-notes，并标 reference only。
3. current 被定义为客户实例 / 配置包来源，不是 SaaS runtime tenant。
4. 没有新增 tenant_id 到 schema/runtime。
5. 没有改 workflow.go、rbac.go、server/internal/data。
6. 没有改 docs.mjs、seedData.mjs。
7. web pnpm test 273 个测试通过。
8. 已明确 shipment_release done -> shipping_released，不等于 shipped。
```

唯一注意点：

```text
git diff --stat 默认不统计未跟踪新增文件。
```

你这次已经贴了 `git status --short`，所以没问题。以后让 Codex 每轮都跑：

```bash
git status --short
git diff --stat
git ls-files --others --exclude-standard
```

如果想统计新增文件的内容规模，可以让它临时跑：

```bash
git add -N .
git diff --stat
```

不要自动 commit。

---

# 可以给大 Goal，但要这样设计

大 Goal 不是让 Codex “随便做完整功能”，而是让它：

```text
连续做 4~8 小时的阅读、评审、设计、审计、方案生成
每个阶段有 checkpoint
禁止越界改 runtime/schema
最后输出可 review 的文档和下一步实现计划
```

下一轮我建议给它一个**挂一晚的大 Goal**：

> Phase 1：主数据 / 订单源单据 / BOM / 采购前置模型评审  
> 目标是为后续真正落 schema 做准备，但本轮仍不直接改 Ent schema。

---

# 可复制短 Goal

下面这段直接放进 Codex Goal，低于 4000 字符：

```text
Goal: Execute docs/codex-goals/001-overnight-phase1-masterdata-order-review.md.

Read AGENTS.md first, then read the task file exactly. This is an overnight Phase 1 analysis/design task for plush-toy-erp. Produce architecture/design docs only. Do not modify runtime code, Ent schema, migrations, docs registry, seedData, workflow.go, rbac.go, or server/internal/data.

Strict rules:
- Do not add tenant_id.
- Do not implement SaaS multi-tenancy.
- Do not create license server, billing, or customer ticket system.
- Do not create generic ChangeUsecase or change_records.
- Do not treat current customer materials as Product Core.
- Do not duplicate existing products/materials/units/warehouses/inventory/bom/purchase/quality truth sources.
- Do not make Workflow write inventory/shipment/finance facts.
- shipping_released != shipped.
- business_records is compatibility/demo/source snapshot, not long-term fact truth.

Main output:
- Phase 1 masterdata/order/BOM/purchase architecture review docs.
- A domain schema draft for V1/V2, but no Ent schema changes.
- A migration readiness checklist.
- A risk list for duplicate design, customer coupling, Workflow/Fact confusion.
- A next implementation plan split into small Codex goals.

Run required commands from the task file. Final reply must include:
【完成】
【新增/修改文件】
【Phase 1 核心结论】
【建议 V1/V2 表清单】
【明确不落地的内容】
【重复设计风险】
【Workflow/Fact 边界风险】
【tenant_id 处理结论】
【测试命令与结果】
【下一轮 Codex Goal 建议】
```

---

# 对应 md 文件名

创建这个文件：

```text
docs/codex-goals/001-overnight-phase1-masterdata-order-review.md
```

---

# `docs/codex-goals/001-overnight-phase1-masterdata-order-review.md`

直接复制下面内容进去：

```md
# Codex Goal 001: Overnight Phase 1 MasterData / Order / BOM / Purchase Review

## 任务名称

Phase 1：主数据、订单源单据、BOM、采购前置模型评审。

## 任务性质

这是一个 overnight analysis / design task。

本轮只输出文档和实施计划。

不要改 runtime code。  
不要改 Ent schema。  
不要新增 migration。  
不要新增 tenant_id。  
不要接入 API。  
不要改 UI。  
不要改 docs registry。  
不要改 seedData。  
不要移动旧代码。  

## 背景

Phase 0 已经完成：

- 产品化架构骨架。
- 状态分层。
- 配置权限策略。
- current 客户实例边界。
- imported design notes。
- `server/internal/core/*` 空骨架。
- `docs/product/*` 和 `docs/customers/current/*` 初步文档。

Phase 1 的目标是为 V1/V2 真正落 schema 做评审准备。

当前重点不是写代码，而是回答：

1. customers / suppliers / contacts 怎么建模。
2. products / product_skus 与现有 products / materials / units / warehouses / bom_* 怎么衔接。
3. sales_orders / sales_order_items 是否应该作为正式源单据。
4. BOM、订单、采购需求之间的边界是什么。
5. purchase_orders 是否 V1 做，还是 V2 做。
6. business_records 如何过渡，不能长期替代正式事实 / 主数据。
7. 哪些字段来自当前客户样本，但不能写进 Product Core。
8. 哪些模型会影响库存 / 出货 / 财务，必须延后到事实层评审。

## 必须先读

- AGENTS.md
- README.md
- docs/current-source-of-truth.md
- progress.md

Phase 0 文档：

- docs/product/zero-to-one-architecture.md
- docs/product/product-principles.md
- docs/product/domain-model-v1.md
- docs/product/module-boundaries.md
- docs/product/config-permission-policy.md
- docs/product/customer-instance-policy.md
- docs/product/customer-delta-policy.md
- docs/product/rewrite-roadmap.md
- docs/product/release-gates.md
- docs/product/test-strategy.md
- docs/architecture/status-workflow-fact-boundary.md

当前客户资料：

- docs/customers/current/README.md
- docs/customers/current/source-materials.md
- docs/customers/current/requirement-clues.md
- docs/customers/current/assumption-register.md
- docs/customers/current/question-backlog.md
- docs/customers/current/decision-log.md
- docs/customers/current/customer-config-draft.md
- docs/customers/current/delta-register.md
- docs/customers/current/change-request-process.md

设计输入：

- docs/reference/imported-notes/erp_plush_productization_config_permission_workflow_state_design.md
- docs/reference/imported-notes/erp_status_workflow_context.md

后端现状：

- server/internal/biz/workflow.go
- server/internal/biz/rbac.go
- server/internal/biz/inventory.go
- server/internal/biz/quality_inspection.go
- server/internal/data/model/schema
- server/internal/data/business_record*
- server/internal/data/inventory*
- server/internal/data/purchase*
- server/internal/data/quality*

前端现状：

- web/src/erp/config/businessModules.mjs
- web/src/erp/config/businessRecordDefinitions.mjs
- web/src/erp/config/seedData.mjs
- web/src/erp/config/docs.mjs
- web/src/erp/docs/system-layer-progress.md
- web/src/erp/docs/productization-delivery.md

如果某些文件不存在，请记录缺失，不要猜。

## 本轮允许新增 / 修改的文件

允许新增：

- docs/architecture/masterdata-order-source-document-review.md
- docs/architecture/customer-supplier-masterdata-review.md
- docs/architecture/product-sku-bom-boundary-review.md
- docs/architecture/order-purchase-boundary-review.md
- docs/product/domain-schema-draft-v1-v2.md
- docs/product/migration-readiness-checklist.md
- docs/product/phase1-implementation-plan.md
- docs/product/phase1-risk-register.md

允许小幅更新：

- docs/current-source-of-truth.md
- progress.md
- docs/product/domain-model-v1.md
- docs/product/rewrite-roadmap.md

禁止修改：

- server/internal/biz/workflow.go
- server/internal/biz/rbac.go
- server/internal/data
- server/internal/data/model/schema
- server/internal/core/*
- web/src/erp/config/docs.mjs
- web/src/erp/config/seedData.mjs
- web/src/erp/pages
- web/src/erp/mobile
- migrations
- deploy scripts

## 总体原则

1. 本轮不实现。
2. 本轮只评审。
3. 本轮只写设计文档和实施计划。
4. 所有 schema 都只能写在 draft 文档里。
5. 不能把 draft 伪装成已实现。
6. 不能把 current 客户资料写成 Product Core。
7. 不能新增 tenant_id。
8. 不能重复设计已有真源。
9. 不能用 Workflow 承担 Fact。
10. 不能用 business_records 长期替代正式主数据 / 事实表。

## 必须遵守的已有真源

不要重复设计这些对象：

- units
- materials
- products
- warehouses
- inventory_txns
- inventory_balances
- inventory_lots
- bom_headers
- bom_items
- purchase_receipts
- purchase_returns
- purchase_receipt_adjustments
- quality_inspections
- RBAC roles / permissions / menus

如果发现现有模型不够，只能在文档中提出扩展建议，不能直接改 schema。

## 文档 1：masterdata-order-source-document-review.md

必须回答：

1. 什么是 MasterData。
2. 什么是 Source Document。
3. 什么是 Fact。
4. customers / suppliers / contacts 属于 MasterData。
5. sales_orders / sales_order_items 属于 Source Document / Business Commitment。
6. inventory_txns、shipments、AR/AP 属于 Fact 或落账事实。
7. business_records 当前能做什么。
8. business_records 不能长期做什么。
9. 当前 V1 是否应该从正式 customers / suppliers / sales_orders 开始。
10. V1 不应该先做哪些复杂内容。

必须明确：

```text
Source Document 记录业务承诺。
Fact 记录真实发生。
Workflow 记录协同许可。
Derived Status 从事实重算。
```

## 文档 2：customer-supplier-masterdata-review.md

必须评审：

- customers
- suppliers
- contacts
- customer_addresses 可选
- supplier_material_profiles 可选
- settlement_terms 可选

必须回答：

1. customers 和 suppliers 是否共用 partner 模型。
2. 推荐是分表，还是统一 party / partner + role。
3. V1 最小字段。
4. 哪些字段是 Product Core。
5. 哪些字段是 Customer Config。
6. 哪些字段只是 current 客户样本。
7. 与 sales_orders、purchase_orders、purchase_receipts、purchase_returns、quality_inspections、future shipments、future AR/AP 的关系。
8. 如何避免和 business_records 的 partners 页面重复。
9. 如何支持当前客户，但不硬编码当前客户。

必须给出推荐方案：

```text
Option A: customers / suppliers 分表。
Option B: partners + roles。
Option C: 先分表，未来抽象 party。
```

并给出当前阶段推荐。

## 文档 3：product-sku-bom-boundary-review.md

必须评审：

- products
- product_skus
- materials
- units
- bom_headers
- bom_items
- bom_versions 可选

必须回答：

1. 现有 products / materials / units / bom_* 已经是哪些真源。
2. 是否需要 product_skus。
3. SKU 与颜色、尺寸、版本、客户款号的关系。
4. BOM 是按 product，还是按 sku。
5. BOM 改版怎么处理。
6. 材料替代是否 V1 做。
7. 当前客户 Excel 里的字段如何抽成线索，而不是直接硬编码。
8. BOM 如何成为采购需求的来源。
9. BOM 不应该直接写库存事实。

必须给出 V1 推荐模型：

```text
products
product_skus
bom_headers
bom_items
materials
units
```

但只写文档，不改 schema。

## 文档 4：order-purchase-boundary-review.md

必须评审：

- sales_orders
- sales_order_items
- purchase_orders
- purchase_order_items
- purchase_receipts
- purchase_returns
- purchase_receipt_adjustments

必须回答：

1. sales_order 是业务源单据，不是出货事实。
2. sales_order_item 的数量和交期怎么记录。
3. shipped_quantity 是派生 / 缓存，不能伪造出货事实。
4. purchase_order 是否 V1 必做。
5. purchase_receipts 已存在，和 future purchase_orders 怎么关联。
6. 从 BOM 生成采购需求是否 V1 做，还是 V2 做。
7. 采购入库事实已经由 purchase_receipts + inventory_txns 承担。
8. purchase_order 不能替代 purchase_receipt。
9. Workflow 的采购跟进不能替代采购事实。
10. 财务应付不应从采购订单直接生成，至少要评审采购入库 / 对账口径。

## 文档 5：domain-schema-draft-v1-v2.md

这是 schema 草案，不是 Ent schema。

必须列出候选表：

V1 候选：

- customers
- suppliers
- contacts
- product_skus
- sales_orders
- sales_order_items
- order_revisions 可选
- bom version 扩展可选

V2 候选：

- purchase_orders
- purchase_order_items
- purchase_demands 可选
- supplier_material_profiles 可选
- stock_reservations 只作为 V4 候选，不在 V2 落

每张表写：

- purpose
- category: MasterData / Source Document / Fact / Derived / Workflow / Config
- key fields
- relations
- status fields
- whether V1/V2
- affects inventory?
- affects shipment?
- affects finance?
- depends on existing truth source?
- migration risk
- duplicate-design risk

必须明确：

```text
本文件不是实现。
本文件不代表 schema 已落地。
```

## 文档 6：migration-readiness-checklist.md

必须列出真正落 Ent schema 前要确认的事项：

1. 当前已有 schema 对象。
2. 是否重复。
3. 是否需要 data migration。
4. 是否会影响 business_records。
5. 是否需要 backfill。
6. 是否需要唯一索引。
7. 是否需要状态机。
8. 是否需要幂等键。
9. 是否影响库存。
10. 是否影响出货。
11. 是否影响财务。
12. 是否需要 RBAC 权限码。
13. 是否需要 API。
14. 是否需要 UI。
15. 是否需要 seed / demo / import。
16. 是否需要客户配置。
17. 是否需要测试。

## 文档 7：phase1-implementation-plan.md

必须把后续实现拆成小 Codex goals：

- 002 schema design final review
- 003 customers/suppliers Ent schema
- 004 customers/suppliers repo/usecase tests
- 005 product_skus/BOM version schema review
- 006 sales_orders schema
- 007 sales_orders usecase/status machine
- 008 API/RBAC for masterdata/order
- 009 frontend V1 pages
- 010 customer data import draft

每个 goal 写：

- objective
- allowed files
- forbidden files
- schema change yes/no
- migration yes/no
- runtime yes/no
- test commands
- stop conditions

## 文档 8：phase1-risk-register.md

必须列风险：

- customer coupling
- duplicate masterdata
- business_records shadow model
- Workflow / Fact confusion
- tenant_id creep
- over-generalized partner model
- product_sku over-design
- purchase_order vs purchase_receipt confusion
- shipped_quantity fake fact
- current customer Excel field hardcoding
- RBAC menu-only risk
- migration risk

每项写：

- risk
- impact
- evidence
- mitigation
- owner layer
- must-review-before-implementation

## 状态和命名要求

内部状态必须用 canonical key。

不要在设计里用中文文案做业务判断。

必须明确：

```text
shipping_released != shipped
shipped 才能代表真实出货完成
shipment facts / inventory_txns 才能支撑 shipped
```

## tenant_id 规则

禁止新增 tenant_id。

如果原始 imported note 中有 tenant_id，只能这样处理：

```text
未来 SaaS 多租户评审候选，不进入当前 V1/V2 schema。
```

grep 命中 tenant_id 时，必须说明命中是否只在禁止说明或 imported note 中。

## Workflow / Fact 规则

必须明确：

- Workflow task done 不写库存。
- Workflow task done 不写 shipments。
- Workflow task done 不写 AR/AP。
- Workflow task done 不写 invoice/payment。
- Workflow 可以产生许可或协同状态。
- Fact 必须由领域 usecase 产生。

## current 客户规则

current 是：

- seed customer
- first private deployment customer
- source material owner
- first config draft source

current 不是：

- Product Core rule source
- SaaS runtime tenant
- reason to hardcode fields
- reason to fork code

## 验收命令

必须运行：

```bash
git status --short
git diff --stat
git ls-files --others --exclude-standard
grep -R "tenant_id" docs/product docs/architecture docs/customers docs/reference config deployments || true
grep -R "shipping_released" docs/product docs/architecture docs/customers docs/reference || true
cd web && pnpm test
cd ../server && go test ./internal/biz ./internal/data
```

如果 `go test` 因现有环境或依赖失败：

- 输出失败命令。
- 输出关键日志。
- 判断是否与本轮文档改动相关。
- 不要为了通过测试乱改 runtime。

## 最终回复格式

```text
【完成】
【新增/修改文件】
【Phase 1 核心结论】
【建议 V1/V2 表清单】
【明确不落地的内容】
【重复设计风险】
【Workflow/Fact 边界风险】
【tenant_id 处理结论】
【测试命令与结果】
【风险】
【下一轮 Codex Goal 建议】
```
```

---

# 以后什么时候用大 Goal

你可以这样安排：

```text
白天：小 Goal，适合代码改动、测试加固、局部实现。
晚上：大 Goal，适合阅读全仓、生成方案、做审计、拆任务、写 schema 草案。
阶段结束：上传 review bundle 或源码 zip 给我审。
```

我不建议你让 Codex 一晚无人值守直接做：

```text
schema + migration + repo + usecase + API + UI + docs
```

但可以让它一晚做：

```text
全局阅读
方案生成
风险扫描
schema 草案
分阶段实现计划
测试清单
下一批小 Goal
```

这样既能用上 Codex 的长上下文和长时间执行，又不会把项目带偏。

### 027. user

_time `2026-05-30T01:26:24+08:00` · content_type `multimodal_text` · node `6fa30b84-c1fe-4bf7-9ff7-46c2244afb63`_

[非文本内容]

```json
{
  "asset_pointer": "sediment://file_0000000073ec72098be198cec13248b6",
  "content_type": "image_asset_pointer",
  "fovea": null,
  "height": 1388,
  "metadata": {
    "asset_pointer_link": null,
    "container_pixel_height": null,
    "container_pixel_width": null,
    "dalle": null,
    "emu_omit_glimpse_image": null,
    "emu_patches_override": null,
    "generation": null,
    "gizmo": null,
    "is_no_auth_placeholder": null,
    "lpe_delta_encoding_channel": null,
    "lpe_keep_patch_ijhw": null,
    "sanitized": true,
    "watermarked_asset_pointer": null
  },
  "size_bytes": 244301,
  "width": 1854
}
```

给我可复制的整个md，而不是不可复制的有割裂的内容，半md半其他渲染内容

### 028. assistant

_time `2026-05-30T01:28:27+08:00` · content_type `text` · node `32edffb0-68da-4c90-912a-0e59daf0f09d`_

对，你说得对。以后我会直接给**一个完整可复制的 `.md` 文件内容**，不再用半渲染、半代码块的形式。下面就是 `docs/codex-goals/001-overnight-phase1-masterdata-order-review.md` 的完整内容，已吸收产品化配置原则和状态分层原则。fileciteturn2file0turn2file1

````md
# Codex Goal 001: Overnight Phase 1 MasterData / Order / BOM / Purchase Review

## 任务名称

Phase 1：主数据、订单源单据、BOM、采购前置模型评审。

## 任务性质

这是一个 overnight analysis / design task。

本轮只输出文档和实施计划。

不要改 runtime code。  
不要改 Ent schema。  
不要新增 migration。  
不要新增 tenant_id。  
不要接入 API。  
不要改 UI。  
不要改 docs registry。  
不要改 seedData。  
不要移动旧代码。  

## 背景

Phase 0 已经完成：

- 产品化架构骨架。
- 状态分层。
- 配置权限策略。
- current 客户实例边界。
- imported design notes。
- `server/internal/core/*` 空骨架。
- `docs/product/*` 和 `docs/customers/current/*` 初步文档。

Phase 1 的目标是为 V1/V2 真正落 schema 做评审准备。

当前重点不是写代码，而是回答：

1. `customers / suppliers / contacts` 怎么建模。
2. `products / product_skus` 与现有 `products / materials / units / warehouses / bom_*` 怎么衔接。
3. `sales_orders / sales_order_items` 是否应该作为正式源单据。
4. BOM、订单、采购需求之间的边界是什么。
5. `purchase_orders` 是否 V1 做，还是 V2 做。
6. `business_records` 如何过渡，不能长期替代正式事实 / 主数据。
7. 哪些字段来自 current 客户样本，但不能写进 Product Core。
8. 哪些模型会影响库存 / 出货 / 财务，必须延后到事实层评审。

## 必须先读

- `AGENTS.md`
- `README.md`
- `docs/current-source-of-truth.md`
- `progress.md`

Phase 0 文档：

- `docs/product/zero-to-one-architecture.md`
- `docs/product/product-principles.md`
- `docs/product/domain-model-v1.md`
- `docs/product/module-boundaries.md`
- `docs/product/config-permission-policy.md`
- `docs/product/customer-instance-policy.md`
- `docs/product/customer-delta-policy.md`
- `docs/product/rewrite-roadmap.md`
- `docs/product/release-gates.md`
- `docs/product/test-strategy.md`
- `docs/architecture/status-workflow-fact-boundary.md`

当前客户资料：

- `docs/customers/current/README.md`
- `docs/customers/current/source-materials.md`
- `docs/customers/current/requirement-clues.md`
- `docs/customers/current/assumption-register.md`
- `docs/customers/current/question-backlog.md`
- `docs/customers/current/decision-log.md`
- `docs/customers/current/customer-config-draft.md`
- `docs/customers/current/delta-register.md`
- `docs/customers/current/change-request-process.md`

设计输入：

- `docs/reference/imported-notes/erp_plush_productization_config_permission_workflow_state_design.md`
- `docs/reference/imported-notes/erp_status_workflow_context.md`

后端现状：

- `server/internal/biz/workflow.go`
- `server/internal/biz/rbac.go`
- `server/internal/biz/inventory.go`
- `server/internal/biz/quality_inspection.go`
- `server/internal/data/model/schema`
- `server/internal/data/business_record*`
- `server/internal/data/inventory*`
- `server/internal/data/purchase*`
- `server/internal/data/quality*`

前端现状：

- `web/src/erp/config/businessModules.mjs`
- `web/src/erp/config/businessRecordDefinitions.mjs`
- `web/src/erp/config/seedData.mjs`
- `web/src/erp/config/docs.mjs`
- `web/src/erp/docs/system-layer-progress.md`
- `web/src/erp/docs/productization-delivery.md`

如果某些文件不存在，请记录缺失，不要猜。

## 本轮允许新增 / 修改的文件

允许新增：

- `docs/architecture/masterdata-order-source-document-review.md`
- `docs/architecture/customer-supplier-masterdata-review.md`
- `docs/architecture/product-sku-bom-boundary-review.md`
- `docs/architecture/order-purchase-boundary-review.md`
- `docs/product/domain-schema-draft-v1-v2.md`
- `docs/product/migration-readiness-checklist.md`
- `docs/product/phase1-implementation-plan.md`
- `docs/product/phase1-risk-register.md`

允许小幅更新：

- `docs/current-source-of-truth.md`
- `progress.md`
- `docs/product/domain-model-v1.md`
- `docs/product/rewrite-roadmap.md`

禁止修改：

- `server/internal/biz/workflow.go`
- `server/internal/biz/rbac.go`
- `server/internal/data`
- `server/internal/data/model/schema`
- `server/internal/core/*`
- `web/src/erp/config/docs.mjs`
- `web/src/erp/config/seedData.mjs`
- `web/src/erp/pages`
- `web/src/erp/mobile`
- `migrations`
- `server/deploy`
- `scripts`

## 总体原则

1. 本轮不实现。
2. 本轮只评审。
3. 本轮只写设计文档和实施计划。
4. 所有 schema 都只能写在 draft 文档里。
5. 不能把 draft 伪装成已实现。
6. 不能把 current 客户资料写成 Product Core。
7. 不能新增 `tenant_id`。
8. 不能重复设计已有真源。
9. 不能用 Workflow 承担 Fact。
10. 不能用 `business_records` 长期替代正式主数据 / 事实表。
11. 不创建泛化 Change 模块。
12. 不创建 `change_records`。
13. 不创建 `ChangeUsecase`。
14. 不做 SaaS 多租户。
15. 不做 license server。
16. 不做套餐计费。
17. 不做客户工单系统。

## 必须遵守的已有真源

不要重复设计这些对象：

- `units`
- `materials`
- `products`
- `warehouses`
- `inventory_txns`
- `inventory_balances`
- `inventory_lots`
- `bom_headers`
- `bom_items`
- `purchase_receipts`
- `purchase_returns`
- `purchase_receipt_adjustments`
- `quality_inspections`
- RBAC roles / permissions / menus

如果发现现有模型不够，只能在文档中提出扩展建议，不能直接改 schema。

## 状态和事实边界总原则

必须在所有文档中保持以下口径：

```text
流程管协同，单据管阶段，事实管落账，结果靠计算，系统状态别混业务。
```

必须明确：

```text
Source Document 记录业务承诺。
Fact 记录真实发生。
Workflow 记录协同许可。
Derived Status 从事实重算。
```

必须明确：

```text
Workflow task done != Fact posted。
shipping_released != shipped。
shipment_release done -> shipping_released。
quality task done != quality_inspection passed。
business_records 不替代正式事实表。
current 客户资料不等于 Product Core 真源。
```

必须明确：

```text
动作产生事实，事实推导结果。
结果可以缓存，但不能伪造事实。
```

## tenant_id 规则

禁止新增 `tenant_id`。

如果 imported note 或历史文档中已经出现 `tenant_id`，只能这样处理：

```text
未来 SaaS 多租户评审候选，不进入当前 V1/V2 schema。
```

grep 命中 `tenant_id` 时，必须说明命中是否只在以下上下文：

- imported note 原文。
- 禁止新增说明。
- 未来 SaaS 评审候选说明。
- current 不是 runtime tenant 的说明。

不得把 `tenant_id` 写进当前 schema 草案的字段列表。

## Workflow / Fact 规则

必须明确：

- Workflow task done 不写库存。
- Workflow task done 不写 shipments。
- Workflow task done 不写 reservations。
- Workflow task done 不写 AR/AP。
- Workflow task done 不写 invoice/payment。
- Workflow 可以产生许可或协同状态。
- Fact 必须由领域 usecase 产生。
- `shipping_released` 只能表示已放行 / 可发货 / 待出库。
- `shipping_released` 不能显示成已出库。
- `shipped` 才能表示真实出货完成。
- `shipment facts / inventory_txns` 才能支撑 `shipped`。

## current 客户规则

current 是：

- seed customer。
- first private deployment customer。
- source material owner。
- first config draft source。

current 不是：

- Product Core rule source。
- SaaS runtime tenant。
- reason to hardcode fields。
- reason to fork code。

current 客户样本字段只能作为：

- Customer Material。
- Demo Seed。
- Industry Template Candidate。
- Print Template Input。
- QA Debug。

不能直接作为：

- Product Core Source。
- Ent schema 必选字段。
- 通用产品规则。
- 核心状态机规则。

## 文档 1：masterdata-order-source-document-review.md

路径：

```text
docs/architecture/masterdata-order-source-document-review.md
```

必须回答：

1. 什么是 MasterData。
2. 什么是 Source Document。
3. 什么是 Fact。
4. `customers / suppliers / contacts` 属于 MasterData。
5. `sales_orders / sales_order_items` 属于 Source Document / Business Commitment。
6. `inventory_txns / shipments / AR/AP / invoices / payments` 属于 Fact 或落账事实。
7. `business_records` 当前能做什么。
8. `business_records` 不能长期做什么。
9. 当前 V1 是否应该从正式 `customers / suppliers / sales_orders` 开始。
10. V1 不应该先做哪些复杂内容。
11. 如何避免把 Workflow、Source Document、Fact、Derived Status 混成一个 `status`。
12. 如何避免从 UI 菜单反推业务完成度。

必须明确：

```text
MasterData 是长期稳定对象。
Source Document 记录业务承诺。
Fact 记录真实发生。
Workflow 记录协同许可。
Derived Status 从事实重算。
```

必须说明 `business_records` 的定位：

```text
business_records 可以继续作为兼容层、demo、seed、source snapshot、调研入口。
business_records 不能长期替代正式 customers / suppliers / orders / inventory / shipment / finance facts。
```

必须给出 V1 推荐结论：

```text
V1 应优先评审正式 customers / suppliers / contacts / sales_orders / sales_order_items。
V1 不应直接把 current 客户 Excel 列变成 Product Core schema。
V1 不应直接从 Workflow 推导库存、出货、财务事实。
```

## 文档 2：customer-supplier-masterdata-review.md

路径：

```text
docs/architecture/customer-supplier-masterdata-review.md
```

必须评审：

- `customers`
- `suppliers`
- `contacts`
- `customer_addresses` 可选
- `supplier_material_profiles` 可选
- `settlement_terms` 可选

必须回答：

1. `customers` 和 `suppliers` 是否共用 partner 模型。
2. 推荐是分表，还是统一 `party / partner + role`。
3. V1 最小字段。
4. 哪些字段是 Product Core。
5. 哪些字段是 Customer Config。
6. 哪些字段只是 current 客户样本。
7. 与 `sales_orders`、`purchase_orders`、`purchase_receipts`、`purchase_returns`、`quality_inspections`、future `shipments`、future AR/AP 的关系。
8. 如何避免和 `business_records` 的 partners 页面重复。
9. 如何支持 current 客户，但不硬编码 current 客户。
10. 是否需要 contacts 单独建模。
11. 是否需要开票资料第一版就进入 Product Core。
12. 是否需要结算条件第一版就进入 Product Core。

必须给出三个方案：

```text
Option A: customers / suppliers 分表。
Option B: partners + roles。
Option C: 先分表，未来抽象 party。
```

每个方案必须写：

- 优点。
- 缺点。
- 对 V1 的影响。
- 对 future finance 的影响。
- 对客户配置的影响。
- 对 migration 的影响。
- 与现有 `business_records` 的关系。

必须给出当前阶段推荐。

推荐倾向：

```text
如果当前代码还处于起步阶段，可以推荐 Option C：
V1 先用 customers / suppliers 分表，降低复杂度；
文档中保留未来 party 抽象可能性；
不要在 V1 过度抽象成万能 partner 模型。
```

但 Codex 需要根据真实代码和文档判断，不能机械套用。

## 文档 3：product-sku-bom-boundary-review.md

路径：

```text
docs/architecture/product-sku-bom-boundary-review.md
```

必须评审：

- `products`
- `product_skus`
- `materials`
- `units`
- `bom_headers`
- `bom_items`
- `bom_versions` 可选

必须回答：

1. 现有 `products / materials / units / bom_*` 已经是哪些真源。
2. 是否需要 `product_skus`。
3. SKU 与颜色、尺寸、版本、客户款号、产品编号的关系。
4. BOM 是按 product，还是按 sku。
5. BOM 改版怎么处理。
6. 材料替代是否 V1 做。
7. current 客户 Excel 里的字段如何抽成线索，而不是直接硬编码。
8. BOM 如何成为采购需求的来源。
9. BOM 不应该直接写库存事实。
10. `product_skus` 是否应在 V1 落 schema，还是先保留 draft。
11. SKU 是否必须影响库存粒度。
12. 色号、尺寸、图片、版本、客户款号分别应该放在哪里。

必须给出 V1 推荐模型草案：

```text
products
product_skus
bom_headers
bom_items
materials
units
```

但只写文档，不改 schema。

必须说明：

```text
BOM 是工程资料 / 物料需求来源。
BOM 不是库存事实。
BOM 不能直接改库存余额。
采购需求可以从 BOM 派生，但采购事实必须由采购单 / 入库单产生。
```

必须给出字段分类：

- Product Core 字段。
- Industry Template Candidate 字段。
- Customer Config 字段。
- current 客户样本字段。

## 文档 4：order-purchase-boundary-review.md

路径：

```text
docs/architecture/order-purchase-boundary-review.md
```

必须评审：

- `sales_orders`
- `sales_order_items`
- `purchase_orders`
- `purchase_order_items`
- `purchase_receipts`
- `purchase_returns`
- `purchase_receipt_adjustments`

必须回答：

1. `sales_order` 是业务源单据，不是出货事实。
2. `sales_order_item` 的数量和交期怎么记录。
3. `shipped_quantity` 是派生 / 缓存，不能伪造出货事实。
4. `purchase_order` 是否 V1 必做。
5. `purchase_receipts` 已存在，和 future `purchase_orders` 怎么关联。
6. 从 BOM 生成采购需求是否 V1 做，还是 V2 做。
7. 采购入库事实已经由 `purchase_receipts + inventory_txns` 承担。
8. `purchase_order` 不能替代 `purchase_receipt`。
9. Workflow 的采购跟进不能替代采购事实。
10. 财务应付不应从采购订单直接生成，至少要评审采购入库 / 对账口径。
11. sales order 的未出货数量如何从 shipment facts 重算。
12. purchase order 的未收货数量如何从 receipt facts 重算。
13. 出货放行和真实出货如何分离。
14. 采购下单和真实入库如何分离。

必须明确：

```text
sales_order = 业务承诺。
sales_order_item = 承诺明细。
purchase_order = 采购承诺。
purchase_receipt = 采购入库事实。
shipment = 出货事实。
inventory_txns = 库存落账事实。
AR/AP = 财务事实。
```

## 文档 5：domain-schema-draft-v1-v2.md

路径：

```text
docs/product/domain-schema-draft-v1-v2.md
```

这是 schema 草案，不是 Ent schema。

文件顶部必须写：

```text
Doc Type: Schema Draft
Status: Proposed
Runtime Implemented: No
Ent Schema Implemented: No
Migration Implemented: No
Current Implementation Source of Truth: No
```

必须列出候选表。

V1 候选：

- `customers`
- `suppliers`
- `contacts`
- `product_skus`
- `sales_orders`
- `sales_order_items`
- `order_revisions` 可选
- BOM version 扩展可选

V2 候选：

- `purchase_orders`
- `purchase_order_items`
- `purchase_demands` 可选
- `supplier_material_profiles` 可选

V4 候选，仅记录，不在 V2 落：

- `stock_reservations`
- `shipments`
- `shipment_items`

每张表写：

- purpose
- category: MasterData / Source Document / Fact / Derived / Workflow / Config
- key fields
- relations
- status fields
- whether V1/V2/V4
- affects inventory?
- affects shipment?
- affects finance?
- depends on existing truth source?
- migration risk
- duplicate-design risk
- customer-coupling risk
- workflow-fact risk

必须明确：

```text
本文件不是实现。
本文件不代表 schema 已落地。
本文件不允许直接作为 migration 输入。
落 Ent schema 前必须经过 migration-readiness-checklist。
```

字段草案里不得出现 `tenant_id`。

如果需要提到租户：

```text
当前私有化阶段每客户一套数据库 / 对象存储 / 部署配置。
未来 SaaS 多租户另行评审。
```

## 文档 6：migration-readiness-checklist.md

路径：

```text
docs/product/migration-readiness-checklist.md
```

必须列出真正落 Ent schema 前要确认的事项：

1. 当前已有 schema 对象。
2. 是否重复已有真源。
3. 是否需要 data migration。
4. 是否会影响 `business_records`。
5. 是否需要 backfill。
6. 是否需要唯一索引。
7. 是否需要状态机。
8. 是否需要幂等键。
9. 是否影响库存。
10. 是否影响出货。
11. 是否影响财务。
12. 是否需要 RBAC 权限码。
13. 是否需要 API。
14. 是否需要 UI。
15. 是否需要 seed / demo / import。
16. 是否需要客户配置。
17. 是否需要测试。
18. 是否影响 current 客户资料分类。
19. 是否需要更新 `current-source-of-truth`。
20. 是否需要更新 `domain-model-v1`。
21. 是否需要更新 release gates。
22. 是否需要 migration 回滚计划。

每一项要提供检查问题和合格标准。

必须包含一个表格：

| Check | Question | Required Evidence | Stop If |
|---|---|---|---|

必须明确：

```text
如果无法证明不重复已有真源，则停止。
如果影响库存 / 出货 / 财务事实但没有架构评审，则停止。
如果 schema 草案包含 tenant_id，则停止。
如果只是 current 客户样本字段但被写成 Product Core，则停止。
```

## 文档 7：phase1-implementation-plan.md

路径：

```text
docs/product/phase1-implementation-plan.md
```

必须把后续实现拆成小 Codex goals：

- `002-schema-design-final-review`
- `003-customers-suppliers-ent-schema`
- `004-customers-suppliers-repo-usecase-tests`
- `005-product-skus-bom-version-schema-review`
- `006-sales-orders-schema`
- `007-sales-orders-usecase-status-machine`
- `008-api-rbac-for-masterdata-order`
- `009-frontend-v1-pages`
- `010-customer-data-import-draft`

每个 goal 写：

- objective
- allowed files
- forbidden files
- schema change yes/no
- migration yes/no
- runtime yes/no
- test commands
- stop conditions
- expected output
- review checklist

必须把大任务拆小。

不允许建议下一轮直接做：

```text
schema + migration + repo + usecase + API + UI + docs
```

必须按阶段拆：

```text
review -> schema -> migration -> repo -> usecase -> API/RBAC -> UI -> docs -> E2E
```

## 文档 8：phase1-risk-register.md

路径：

```text
docs/product/phase1-risk-register.md
```

必须列风险：

- customer coupling
- duplicate masterdata
- `business_records` shadow model
- Workflow / Fact confusion
- `tenant_id` creep
- over-generalized partner model
- product_sku over-design
- purchase_order vs purchase_receipt confusion
- shipped_quantity fake fact
- current customer Excel field hardcoding
- RBAC menu-only risk
- migration risk
- docs/code information gap
- UI text vs canonical status confusion
- source document vs fact confusion
- finance generated from wrong event
- order status overloaded

每项写：

- risk
- impact
- evidence
- mitigation
- owner layer
- must-review-before-implementation

必须包含风险等级：

- High
- Medium
- Low

必须说明：

```text
High 风险不能进入 implementation goal。
必须先做架构评审或字段确认。
```

## 需要更新的已有文档

可以小幅更新：

### docs/current-source-of-truth.md

增加一段 Phase 1 说明：

```text
Phase 1 新增的是评审文档和 schema draft，不是 runtime 实现。
当前正式实现状态仍以现有代码、schema、migration、tests 为准。
```

### progress.md

增加本轮记录：

```text
Phase 1 masterdata / order / BOM / purchase review docs added.
No runtime/schema/migration changes.
```

### docs/product/domain-model-v1.md

如需要，可以增加链接到：

- `docs/product/domain-schema-draft-v1-v2.md`
- `docs/architecture/customer-supplier-masterdata-review.md`
- `docs/architecture/product-sku-bom-boundary-review.md`
- `docs/architecture/order-purchase-boundary-review.md`

但不得把 draft 写成 implemented。

### docs/product/rewrite-roadmap.md

如需要，可以更新 Phase 1 下一步拆分，但不得承诺已经落 schema。

## 状态和命名要求

内部状态必须用 canonical key。

不要在设计里用中文文案做业务判断。

必须明确：

```text
shipping_released != shipped
shipped 才能代表真实出货完成
shipment facts / inventory_txns 才能支撑 shipped
```

推荐写法：

```text
UI 可显示“已放行 / 可发货 / 待出库”。
UI 不得把 shipping_released 显示为“已出库 / 已发货 / 已扣库存”。
```

## 权限设计要求

本轮只评审，不落权限码。

但文档必须说明后续每个 usecase 要按以下顺序校验：

```text
Feature Flag
RBAC
Data Scope
State Machine
Business Rule
Idempotency
Audit Log
```

必须说明：

```text
菜单权限不等于动作权限。
前端隐藏按钮不是安全边界。
后端 usecase 必须校验动作权限、数据范围和状态机。
```

## 客户需求处理要求

所有来自 current 的字段或流程，必须先进入分类：

- Product Core
- Industry Template Candidate
- Customer Config
- Customer Extension
- Data Import Adapter
- Print Template
- Reporting
- Customer Material

如果一个字段只在 current 样本里出现，不能直接写成 V1 必选 Product Core 字段。

如果一个需求影响库存、出货、财务事实，必须进入 Product Core 架构评审。

## 禁止事项

严格禁止：

- 不新增 `tenant_id`。
- 不改 Ent schema。
- 不新增 migration。
- 不改 `server/internal/biz/workflow.go`。
- 不改 `server/internal/biz/rbac.go`。
- 不改 `server/internal/data`。
- 不改 `server/internal/data/model/schema`。
- 不改 `server/internal/core/*`。
- 不改 `web/src/erp/config/docs.mjs`。
- 不改 `web/src/erp/config/seedData.mjs`。
- 不改前端页面。
- 不改移动端页面。
- 不改部署脚本。
- 不实现 API。
- 不实现 UI。
- 不实现 SaaS。
- 不实现 license server。
- 不实现套餐计费。
- 不实现客户工单系统。
- 不创建泛化 Change 模块。
- 不创建 `change_records`。
- 不创建 `ChangeUsecase`。
- 不把 current 资料写成 Product Core。
- 不从 Workflow 写 Fact。
- 不从 `shipping_released` 生成 shipment / inventory / AR / invoice。
- 不把 draft 说成 implemented。

## 验收命令

必须运行：

```bash
git status --short
git diff --stat
git ls-files --others --exclude-standard
grep -R "tenant_id" docs/product docs/architecture docs/customers docs/reference config deployments || true
grep -R "shipping_released" docs/product docs/architecture docs/customers docs/reference || true
cd web && pnpm test
cd ../server && go test ./internal/biz ./internal/data
```

如果 `go test` 因现有环境或依赖失败：

- 输出失败命令。
- 输出关键日志。
- 判断是否与本轮文档改动相关。
- 不要为了通过测试乱改 runtime。

如果 `pnpm test` 因已有 warning 通过：

- 记录 warning。
- 不要为 warning 乱改不相关配置。

## 最终回复格式

```text
【完成】

【新增/修改文件】

【Phase 1 核心结论】

【建议 V1/V2 表清单】

【明确不落地的内容】

【重复设计风险】

【Workflow/Fact 边界风险】

【tenant_id 处理结论】

【测试命令与结果】

【风险】

【下一轮 Codex Goal 建议】
```

## 完成后给 GPT 的复盘材料

Codex 完成后，请输出足够信息，让 GPT 判断下一轮 goal。

必须包含：

```text
git status --short
git diff --stat
git ls-files --others --exclude-standard
测试命令和结果
grep tenant_id 结果解释
本轮新增文档清单
本轮没有修改的禁止路径
下一轮建议
```
````

### 029. user

_time `2026-05-30T02:10:27+08:00` · content_type `multimodal_text` · node `5718eb19-addd-468f-b80a-5baa04e70488`_

[非文本内容]

```json
{
  "asset_pointer": "sediment://file_0000000046f472099eeef1a8bd99f205",
  "content_type": "image_asset_pointer",
  "fovea": null,
  "height": 1804,
  "metadata": {
    "asset_pointer_link": null,
    "container_pixel_height": null,
    "container_pixel_width": null,
    "dalle": null,
    "emu_omit_glimpse_image": null,
    "emu_patches_override": null,
    "generation": null,
    "gizmo": null,
    "is_no_auth_placeholder": null,
    "lpe_delta_encoding_channel": null,
    "lpe_keep_patch_ijhw": null,
    "sanitized": true,
    "watermarked_asset_pointer": null
  },
  "size_bytes": 405415,
  "width": 1792
}
```

[非文本内容]

```json
{
  "asset_pointer": "sediment://file_00000000399c7209bdb9499314b1ebb8",
  "content_type": "image_asset_pointer",
  "fovea": null,
  "height": 1640,
  "metadata": {
    "asset_pointer_link": null,
    "container_pixel_height": null,
    "container_pixel_width": null,
    "dalle": null,
    "emu_omit_glimpse_image": null,
    "emu_patches_override": null,
    "generation": null,
    "gizmo": null,
    "is_no_auth_placeholder": null,
    "lpe_delta_encoding_channel": null,
    "lpe_keep_patch_ijhw": null,
    "sanitized": true,
    "watermarked_asset_pointer": null
  },
  "size_bytes": 560451,
  "width": 1674
}
```

[非文本内容]

```json
{
  "asset_pointer": "sediment://file_000000006b907209a8fee33d3bba670d",
  "content_type": "image_asset_pointer",
  "fovea": null,
  "height": 1004,
  "metadata": {
    "asset_pointer_link": null,
    "container_pixel_height": null,
    "container_pixel_width": null,
    "dalle": null,
    "emu_omit_glimpse_image": null,
    "emu_patches_override": null,
    "generation": null,
    "gizmo": null,
    "is_no_auth_placeholder": null,
    "lpe_delta_encoding_channel": null,
    "lpe_keep_patch_ijhw": null,
    "sanitized": true,
    "watermarked_asset_pointer": null
  },
  "size_bytes": 353000,
  "width": 1704
}
```

### 030. assistant

_time `2026-05-30T02:13:27+08:00` · content_type `text` · node `fd0ad248-1721-4d99-828b-840414b9216c`_

这轮 **Phase 1 合格，可以继续**。

我会先给判断，再给你下一轮可直接复制的短 Goal 和完整 `.md` 文件。你这轮没有改 runtime、schema、migration、`workflow.go`、`rbac.go`、`server/internal/data`、`docs.mjs`、`seedData.mjs`，前后端测试也通过，方向是对的。下一步不要马上落 Ent schema，应该先做一次 **002 Schema Design Final Review**，把 V1 到底落哪些表、哪些延后、哪些禁止项全部定死，再进入真正 schema 实现。

原因是现在还有几个 High 风险没完全收口：`business_records` 过渡、`customers/suppliers/contacts` 建模方式、`product_skus` 是否 V1 必做、`purchase_orders` 与 `purchase_receipts` 边界、`shipped_quantity` 不能伪造出货事实。这些都符合两个设计 md 里的核心约束：客户差异要受控配置，核心业务代码尽量不分叉；Workflow、单据阶段、事实落账、派生结果必须分层，`shipping_released` 不能当成 `shipped`。fileciteturn2file0 fileciteturn2file1

另外，你现在有大量 untracked 新文档。下一轮前建议至少做一次 checkpoint，例如建分支或本地 commit；否则后续 diff 会越来越难看。

---

## Codex 短 Goal

复制到 Codex Goal：

```text
Goal: Execute docs/codex-goals/002-schema-design-final-review.md.

Read AGENTS.md first, then read the task file exactly. This is Phase 2 schema final review before any Ent schema implementation. Produce docs only. Do not modify runtime code, Ent schema, migrations, API, UI, docs registry, seedData, workflow.go, rbac.go, server/internal/data, or server/internal/core.

Strict rules:
- Do not add tenant_id.
- Do not implement SaaS multi-tenancy.
- Do not create license server, billing, or customer ticket system.
- Do not create generic ChangeUsecase or change_records.
- Do not treat current customer materials as Product Core.
- Do not duplicate existing products/materials/units/warehouses/inventory/bom/purchase/quality truth sources.
- Do not make Workflow write inventory/shipment/finance facts.
- shipping_released != shipped.
- business_records is compatibility/demo/source snapshot, not long-term fact truth.

Main output:
- Final V1/V2 schema decision records.
- Go/no-go decisions for customers/suppliers/contacts, product_skus, sales_orders, purchase_orders, BOM version, business_records transition.
- Exact implementation cutline for the next Ent schema goal.
- Stop conditions and migration readiness checklist.

Run required commands from the task file. Reply in the required final format.
```

---

## 对应文件名

```text
docs/codex-goals/002-schema-design-final-review.md
```

---

## 完整可复制 MD

下面整个复制到 `docs/codex-goals/002-schema-design-final-review.md`。

````md
# Codex Goal 002: Schema Design Final Review Before Ent Implementation

## 任务名称

Phase 2：V1/V2 Schema Design Final Review。

## 任务性质

这是一次 schema 实现前的最终评审任务。

本轮只写文档和决策记录。  
本轮不落 Ent schema。  
本轮不生成 migration。  
本轮不改 runtime。  
本轮不接 API。  
本轮不改 UI。  
本轮不改 docs registry。  
本轮不改 seedData。  

本轮目标是把下一步真正要落的 V1 schema 范围定死，避免一边写 schema 一边争论模型边界。

## 背景

Phase 0 已完成：

- 产品化架构骨架。
- 状态分层。
- 配置权限策略。
- current 客户实例边界。
- imported design notes。
- `server/internal/core/*` 空骨架。
- `docs/product/*` 与 `docs/customers/current/*` 初步文档。

Phase 1 已完成 docs-only 评审：

- 主数据 / 订单源单据 / BOM / 采购边界评审。
- V1/V2 domain schema draft。
- migration readiness checklist。
- phase1 implementation plan。
- phase1 risk register。

Phase 2 的目标不是扩大范围，而是做最终裁剪：

1. V1 到底落哪些表。
2. V1 明确不落哪些表。
3. 哪些字段必须进入 Product Core。
4. 哪些字段只是 current 客户样本。
5. 哪些内容延后到 V2/V3/V4。
6. 哪些风险必须在 schema 实现前关闭。
7. 下一轮 Ent schema goal 的允许范围和禁止范围。

## 必须先读

### 项目约束

- `AGENTS.md`
- `README.md`
- `docs/current-source-of-truth.md`
- `progress.md`

### Phase 0 文档

- `docs/product/zero-to-one-architecture.md`
- `docs/product/product-principles.md`
- `docs/product/domain-model-v1.md`
- `docs/product/module-boundaries.md`
- `docs/product/config-permission-policy.md`
- `docs/product/customer-instance-policy.md`
- `docs/product/customer-delta-policy.md`
- `docs/product/rewrite-roadmap.md`
- `docs/product/release-gates.md`
- `docs/product/test-strategy.md`
- `docs/architecture/status-workflow-fact-boundary.md`

### Phase 1 文档

- `docs/architecture/masterdata-order-source-document-review.md`
- `docs/architecture/customer-supplier-masterdata-review.md`
- `docs/architecture/product-sku-bom-boundary-review.md`
- `docs/architecture/order-purchase-boundary-review.md`
- `docs/product/domain-schema-draft-v1-v2.md`
- `docs/product/migration-readiness-checklist.md`
- `docs/product/phase1-implementation-plan.md`
- `docs/product/phase1-risk-register.md`

### current 客户资料

- `docs/customers/current/README.md`
- `docs/customers/current/source-materials.md`
- `docs/customers/current/requirement-clues.md`
- `docs/customers/current/assumption-register.md`
- `docs/customers/current/question-backlog.md`
- `docs/customers/current/decision-log.md`
- `docs/customers/current/customer-config-draft.md`
- `docs/customers/current/delta-register.md`
- `docs/customers/current/change-request-process.md`

### 设计输入

- `docs/reference/imported-notes/erp_plush_productization_config_permission_workflow_state_design.md`
- `docs/reference/imported-notes/erp_status_workflow_context.md`

### 后端现状

- `server/internal/biz/workflow.go`
- `server/internal/biz/rbac.go`
- `server/internal/biz/inventory.go`
- `server/internal/biz/quality_inspection.go`
- `server/internal/data/model/schema`
- `server/internal/data/business_record*`
- `server/internal/data/inventory*`
- `server/internal/data/purchase*`
- `server/internal/data/quality*`

### 前端现状

- `web/src/erp/config/businessModules.mjs`
- `web/src/erp/config/businessRecordDefinitions.mjs`
- `web/src/erp/config/seedData.mjs`
- `web/src/erp/config/docs.mjs`
- `web/src/erp/docs/system-layer-progress.md`
- `web/src/erp/docs/productization-delivery.md`

如果某些文件不存在，请记录缺失，不要猜。

## 本轮允许新增 / 修改的文件

允许新增：

- `docs/product/schema-design-final-review.md`
- `docs/product/v1-entity-decision-record.md`
- `docs/product/v1-implementation-cutline.md`
- `docs/product/v1-schema-go-no-go.md`
- `docs/product/business-records-transition-plan.md`
- `docs/product/v1-next-codex-goals.md`

允许小幅更新：

- `docs/current-source-of-truth.md`
- `progress.md`
- `docs/product/domain-schema-draft-v1-v2.md`
- `docs/product/phase1-implementation-plan.md`
- `docs/product/phase1-risk-register.md`
- `docs/product/rewrite-roadmap.md`

禁止修改：

- `server/internal/biz/workflow.go`
- `server/internal/biz/rbac.go`
- `server/internal/data`
- `server/internal/data/model/schema`
- `server/internal/core/*`
- `web/src/erp/config/docs.mjs`
- `web/src/erp/config/seedData.mjs`
- `web/src/erp/pages`
- `web/src/erp/mobile`
- `migrations`
- `server/deploy`
- `scripts`

## 总体原则

1. 本轮不实现。
2. 本轮只做 final review。
3. 本轮只写设计文档、决策记录和下一步 goal。
4. 所有 schema 都只能写在文档中。
5. 不得把 draft 写成 implemented。
6. 不得把 current 客户资料写成 Product Core。
7. 不得新增 `tenant_id`。
8. 不得重复设计已有真源。
9. 不得用 Workflow 承担 Fact。
10. 不得用 `business_records` 长期替代正式主数据 / 事实表。
11. 不得创建泛化 Change 模块。
12. 不得创建 `change_records`。
13. 不得创建 `ChangeUsecase`。
14. 不得做 SaaS 多租户。
15. 不得做 license server。
16. 不得做套餐计费。
17. 不得做客户工单系统。

## 必须遵守的已有真源

不要重复设计这些对象：

- `units`
- `materials`
- `products`
- `warehouses`
- `inventory_txns`
- `inventory_balances`
- `inventory_lots`
- `bom_headers`
- `bom_items`
- `purchase_receipts`
- `purchase_returns`
- `purchase_receipt_adjustments`
- `quality_inspections`
- RBAC roles / permissions / menus

如果发现现有模型不够，只能在文档中提出扩展建议，不能直接改 schema。

## 状态和事实边界总原则

必须在所有文档中保持以下口径：

```text
流程管协同，单据管阶段，事实管落账，结果靠计算，系统状态别混业务。
```

必须明确：

```text
Source Document 记录业务承诺。
Fact 记录真实发生。
Workflow 记录协同许可。
Derived Status 从事实重算。
```

必须明确：

```text
Workflow task done != Fact posted。
shipping_released != shipped。
shipment_release done -> shipping_released。
quality task done != quality_inspection passed。
business_records 不替代正式事实表。
current 客户资料不等于 Product Core 真源。
```

必须明确：

```text
动作产生事实，事实推导结果。
结果可以缓存，但不能伪造事实。
```

## tenant_id 规则

禁止新增 `tenant_id`。

如果 imported note 或历史文档中已经出现 `tenant_id`，只能这样处理：

```text
未来 SaaS 多租户评审候选，不进入当前 V1/V2 schema。
```

grep 命中 `tenant_id` 时，必须说明命中是否只在以下上下文：

- imported note 原文。
- 禁止新增说明。
- 未来 SaaS 评审候选说明。
- current 不是 runtime tenant 的说明。

不得把 `tenant_id` 写进当前 schema 草案的字段列表。

## Workflow / Fact 规则

必须明确：

- Workflow task done 不写库存。
- Workflow task done 不写 shipments。
- Workflow task done 不写 reservations。
- Workflow task done 不写 AR/AP。
- Workflow task done 不写 invoice/payment。
- Workflow 可以产生许可或协同状态。
- Fact 必须由领域 usecase 产生。
- `shipping_released` 只能表示已放行 / 可发货 / 待出库。
- `shipping_released` 不能显示成已出库。
- `shipped` 才能表示真实出货完成。
- `shipment facts / inventory_txns` 才能支撑 `shipped`。

## current 客户规则

current 是：

- seed customer。
- first private deployment customer。
- source material owner。
- first config draft source。

current 不是：

- Product Core rule source。
- SaaS runtime tenant。
- reason to hardcode fields。
- reason to fork code。

current 客户样本字段只能作为：

- Customer Material。
- Demo Seed。
- Industry Template Candidate。
- Print Template Input。
- QA Debug。

不能直接作为：

- Product Core Source。
- Ent schema 必选字段。
- 通用产品规则。
- 核心状态机规则。

## 文档 1：schema-design-final-review.md

路径：

```text
docs/product/schema-design-final-review.md
```

文件顶部必须写：

```text
Doc Type: Final Schema Design Review
Status: Proposed
Runtime Implemented: No
Ent Schema Implemented: No
Migration Implemented: No
Current Implementation Source of Truth: No
```

必须输出一个总决策表：

| Area | Decision | V1 | V2 | Deferred | Reason | Risk |
|---|---|---:|---:|---:|---|---|

必须覆盖：

- `customers`
- `suppliers`
- `contacts`
- `customer_addresses`
- `supplier_material_profiles`
- `settlement_terms`
- `product_skus`
- `sales_orders`
- `sales_order_items`
- `order_revisions`
- BOM version extension
- `purchase_orders`
- `purchase_order_items`
- `purchase_demands`
- `stock_reservations`
- `shipments`
- `shipment_items`
- AR/AP/invoice/payment/reconciliation
- `business_records` transition

必须给出总判断：

```text
哪些进入下一轮 Ent schema goal。
哪些只保留 draft。
哪些必须等待后续 fact review。
哪些必须等待客户确认。
哪些不应该做。
```

必须明确：

```text
下一轮 Ent schema goal 只能落 V1 cutline 中明确允许的表。
```

## 文档 2：v1-entity-decision-record.md

路径：

```text
docs/product/v1-entity-decision-record.md
```

必须为每个候选实体写决策记录。

每个实体使用同一模板：

```text
## Entity: <name>

Decision: Go / No-Go / Defer / Draft Only

Category:
- MasterData / Source Document / Fact / Derived / Workflow / Config

V1 Scope:
- Yes / No

Reason:

Existing Truth Sources:

Fields Allowed in Product Core:

Fields Deferred:

Fields Treated as Current Customer Sample:

Relations:

Status Fields:

Affects Inventory:
- Yes / No

Affects Shipment:
- Yes / No

Affects Finance:
- Yes / No

Workflow/Fact Risk:

Duplicate Design Risk:

Customer Coupling Risk:

Migration Risk:

Required Before Ent Schema:

Stop Conditions:
```

必须覆盖至少这些实体：

- `customers`
- `suppliers`
- `contacts`
- `customer_addresses`
- `supplier_material_profiles`
- `settlement_terms`
- `product_skus`
- `sales_orders`
- `sales_order_items`
- `order_revisions`
- `purchase_orders`
- `purchase_order_items`
- `purchase_demands`
- `stock_reservations`
- `shipments`
- `shipment_items`
- AR/AP/invoice/payment/reconciliation

## 文档 3：v1-implementation-cutline.md

路径：

```text
docs/product/v1-implementation-cutline.md
```

这个文件决定下一轮真正可以实现什么。

必须分成四段：

### Allowed in next Ent schema goal

列出下一轮允许落 Ent schema 的表。

建议候选，但 Codex 必须基于真实文档判断：

- `customers`
- `suppliers`
- `contacts`
- `sales_orders`
- `sales_order_items`

`product_skus` 必须单独给 go/no-go，不得自动进入。

### Draft only, not next schema goal

列出暂时只保留 draft 的表。

可能包括：

- `product_skus`
- `order_revisions`
- BOM version extension
- `purchase_orders`
- `purchase_order_items`
- `purchase_demands`
- `supplier_material_profiles`
- `customer_addresses`
- `settlement_terms`

### Deferred to later fact reviews

列出必须等事实层评审的表。

必须包括：

- `stock_reservations`
- `shipments`
- `shipment_items`
- AR/AP/invoice/payment/reconciliation
- production facts
- outsourcing facts

### Explicitly forbidden in V1

必须包括：

- `tenant_id`
- SaaS runtime tenant tables
- license server tables
- billing / plan tables
- customer ticket tables
- generic `change_records`
- `ChangeUsecase`
- workflow-owned inventory/shipment/finance facts

必须包含一个表：

| Object | Next Schema Goal? | Reason | Stop Conditions |
|---|---:|---|---|

## 文档 4：v1-schema-go-no-go.md

路径：

```text
docs/product/v1-schema-go-no-go.md
```

必须输出 go/no-go 检查清单。

每项必须有：

- check
- answer
- evidence
- decision
- owner layer

必须覆盖：

1. 是否重复已有 `products/materials/units/warehouses`。
2. 是否重复已有 `bom_headers/bom_items`。
3. 是否重复已有 `purchase_receipts/purchase_returns/purchase_receipt_adjustments`。
4. 是否重复已有 `inventory_txns/inventory_balances/inventory_lots`。
5. 是否重复已有 `quality_inspections`。
6. 是否只是 current 客户样本字段。
7. 是否影响库存事实。
8. 是否影响出货事实。
9. 是否影响财务事实。
10. 是否需要 workflow 写 fact。
11. 是否需要 migration backfill。
12. 是否需要唯一索引。
13. 是否需要状态机。
14. 是否需要幂等键。
15. 是否需要 RBAC 权限码。
16. 是否需要 API。
17. 是否需要 UI。
18. 是否需要导入。
19. 是否需要客户配置。
20. 是否包含 `tenant_id`。
21. 是否误把 draft 写成 implemented。

必须有最终结论：

```text
Proceed / Proceed With Restrictions / Blocked
```

如果任何 High 风险未关闭，结论必须是：

```text
Proceed With Restrictions
```

或：

```text
Blocked
```

不能写 Proceed。

## 文档 5：business-records-transition-plan.md

路径：

```text
docs/product/business-records-transition-plan.md
```

必须说明 `business_records` 的过渡定位。

必须包含：

```text
business_records 当前可继续作为兼容层、demo、seed、source snapshot、调研入口。
business_records 不能长期替代正式 customers / suppliers / sales_orders / inventory / shipment / finance facts。
```

必须回答：

1. 哪些现有前端页面仍可能依赖 `business_records`。
2. partners 页面如何避免和正式 `customers/suppliers` 重复。
3. products 页面如何避免和现有 `products` schema 重复。
4. 订单样本如何迁移到正式 `sales_orders`。
5. current 客户样本如何保留为 demo/source material。
6. 什么时候可以停止把新业务功能加到 `business_records`。
7. 哪些内容可以继续留在 `business_records`。
8. 哪些内容必须迁移到正式模型。

必须给出过渡阶段：

```text
Stage 0: business_records as existing compatibility/demo layer.
Stage 1: new V1 models created, business_records read-only or demo-only for overlapping domains.
Stage 2: official pages/API switch to V1 models.
Stage 3: business_records retained only for generic snapshots/debug/demo or deprecated.
```

不得建议直接删除 `business_records`，除非完整引用审计完成。

## 文档 6：v1-next-codex-goals.md

路径：

```text
docs/product/v1-next-codex-goals.md
```

必须生成后续小 goal 列表，但不要写超长内容。

至少包含：

- `003-v1-ent-schema-customers-suppliers-orders`
- `004-v1-migration-and-ent-generate`
- `005-v1-repo-usecase-masterdata`
- `006-v1-repo-usecase-sales-order`
- `007-v1-api-rbac-masterdata-order`
- `008-v1-frontend-masterdata-order-pages`
- `009-business-records-transition-audit`
- `010-current-customer-data-import-draft`

每个 goal 必须写：

- objective
- allowed files
- forbidden files
- schema change yes/no
- migration yes/no
- runtime yes/no
- test commands
- stop conditions
- expected output

必须明确：

```text
不要把 schema、repo/usecase、API/RBAC、UI 放进同一轮。
```

推荐顺序：

```text
final review -> Ent schema -> migration/generate -> repo/usecase tests -> API/RBAC -> UI -> import/demo -> E2E
```

## 需要更新的已有文档

可以小幅更新：

### docs/current-source-of-truth.md

增加 Phase 2 说明：

```text
Phase 2 新增的是 schema final review 和 implementation cutline，不是 runtime 实现。
当前正式实现状态仍以现有代码、schema、migration、tests 为准。
```

### progress.md

增加本轮记录：

```text
Phase 2 schema final review docs added.
No runtime/schema/migration changes.
```

### docs/product/domain-schema-draft-v1-v2.md

可以增加链接到：

- `docs/product/schema-design-final-review.md`
- `docs/product/v1-entity-decision-record.md`
- `docs/product/v1-implementation-cutline.md`
- `docs/product/v1-schema-go-no-go.md`

但不得把 draft 写成 implemented。

### docs/product/phase1-implementation-plan.md

可以增加说明：

```text
Implementation must follow the Phase 2 cutline before any Ent schema changes.
```

### docs/product/phase1-risk-register.md

可以增加 Phase 2 risk closure links。

## 强制决策点

本轮必须对以下问题给出明确结论，不允许只写“待定”。

### 1. customers / suppliers / contacts

必须给出：

```text
V1 Go / No-Go
```

必须说明：

- 分表还是 partner abstraction。
- contacts 如何挂 owner。
- V1 最小字段。
- 什么字段不进 V1。
- 是否需要 address / settlement_terms 第一版落表。

### 2. product_skus

必须给出：

```text
Go / No-Go / Draft Only
```

必须说明：

- 它是否只是 products 的别名。
- 它是否真实影响订单行、BOM、库存、出货粒度。
- 如果证据不足，必须 Draft Only。
- 不能因为 current Excel 有颜色字段就直接落 `product_skus`。

### 3. sales_orders / sales_order_items

必须给出：

```text
V1 Go / No-Go
```

必须说明：

- 它们是 Source Document。
- 它们不是出货事实。
- shipped_quantity 如果存在，只能是 derived/cache。
- 真实出货必须等 shipment facts。

### 4. purchase_orders

必须给出：

```text
V1 / V2 / Draft Only
```

必须说明：

- purchase_order 是采购承诺。
- purchase_receipt 是采购入库事实。
- purchase_order 不能替代 purchase_receipt。
- purchase_order 不应直接生成 AP，除非财务评审明确。

### 5. business_records

必须给出：

```text
继续保留 / 限制新增 / 逐步过渡
```

必须说明：

- 当前不能直接删除。
- overlapping domains 不应继续新增核心业务能力。
- 正式 customers/suppliers/orders 出现后，应避免 UI 和 API 双真源。

### 6. BOM version

必须给出：

```text
V1 / Draft Only / Deferred
```

必须说明：

- 现有 `bom_headers/bom_items` 已是真源。
- 不得重复建一套 BOM。
- 如果要做 version extension，必须围绕现有 BOM 真源扩展。

### 7. stock_reservations / shipments / finance

必须给出：

```text
Deferred
```

必须说明：

- 这些属于出货 / 库存 / 财务事实层。
- 不进入 V1/V2 masterdata/order schema goal。
- 不从 `shipment_release` 生成。

## 状态和命名要求

内部状态必须用 canonical key。

不要在设计里用中文文案做业务判断。

必须明确：

```text
shipping_released != shipped
shipped 才能代表真实出货完成
shipment facts / inventory_txns 才能支撑 shipped
```

推荐写法：

```text
UI 可显示“已放行 / 可发货 / 待出库”。
UI 不得把 shipping_released 显示为“已出库 / 已发货 / 已扣库存”。
```

## 权限设计要求

本轮只评审，不落权限码。

但文档必须说明后续每个 usecase 要按以下顺序校验：

```text
Feature Flag
RBAC
Data Scope
State Machine
Business Rule
Idempotency
Audit Log
```

必须说明：

```text
菜单权限不等于动作权限。
前端隐藏按钮不是安全边界。
后端 usecase 必须校验动作权限、数据范围和状态机。
```

## 客户需求处理要求

所有来自 current 的字段或流程，必须先进入分类：

- Product Core
- Industry Template Candidate
- Customer Config
- Customer Extension
- Data Import Adapter
- Print Template
- Reporting
- Customer Material

如果一个字段只在 current 样本里出现，不能直接写成 V1 必选 Product Core 字段。

如果一个需求影响库存、出货、财务事实，必须进入 Product Core 架构评审。

## 禁止事项

严格禁止：

- 不新增 `tenant_id`。
- 不改 Ent schema。
- 不新增 migration。
- 不改 `server/internal/biz/workflow.go`。
- 不改 `server/internal/biz/rbac.go`。
- 不改 `server/internal/data`。
- 不改 `server/internal/data/model/schema`。
- 不改 `server/internal/core/*`。
- 不改 `web/src/erp/config/docs.mjs`。
- 不改 `web/src/erp/config/seedData.mjs`。
- 不改前端页面。
- 不改移动端页面。
- 不改部署脚本。
- 不实现 API。
- 不实现 UI。
- 不实现 SaaS。
- 不实现 license server。
- 不实现套餐计费。
- 不实现客户工单系统。
- 不创建泛化 Change 模块。
- 不创建 `change_records`。
- 不创建 `ChangeUsecase`。
- 不把 current 资料写成 Product Core。
- 不从 Workflow 写 Fact。
- 不从 `shipping_released` 生成 shipment / inventory / AR / invoice。
- 不把 draft 说成 implemented。

## 验收命令

必须运行：

```bash
git status --short
git diff --stat
git ls-files --others --exclude-standard
grep -R "tenant_id" docs/product docs/architecture docs/customers docs/reference config deployments || true
grep -R "shipping_released" docs/product docs/architecture docs/customers docs/reference || true
grep -R "Runtime Implemented: Yes\|Ent Schema Implemented: Yes\|Migration Implemented: Yes" docs/product docs/architecture || true
cd web && pnpm test
cd ../server && go test ./internal/biz ./internal/data
```

如果 `go test` 因现有环境或依赖失败：

- 输出失败命令。
- 输出关键日志。
- 判断是否与本轮文档改动相关。
- 不要为了通过测试乱改 runtime。

如果 `pnpm test` 因已有 warning 通过：

- 记录 warning。
- 不要为 warning 乱改不相关配置。

## 最终回复格式

```text
【完成】

【新增/修改文件】

【Phase 2 核心结论】

【V1 Go 表清单】

【V1 Draft Only / Deferred 清单】

【下一轮 Ent schema cutline】

【明确不落地的内容】

【business_records 过渡结论】

【product_skus go/no-go 结论】

【purchase_orders go/no-go 结论】

【Workflow/Fact 边界风险】

【tenant_id 处理结论】

【测试命令与结果】

【风险】

【下一轮 Codex Goal 建议】
```

## 完成后给 GPT 的复盘材料

Codex 完成后，请输出足够信息，让 GPT 判断下一轮 goal。

必须包含：

```text
git status --short
git diff --stat
git ls-files --others --exclude-standard
测试命令和结果
grep tenant_id 结果解释
grep shipping_released 结果解释
本轮新增文档清单
本轮没有修改的禁止路径
下一轮建议
```
````

### 031. user

_time `2026-05-30T02:31:45+08:00` · content_type `multimodal_text` · node `4d280e09-7504-4323-a62d-007efc3a3d26`_

[非文本内容]

```json
{
  "asset_pointer": "sediment://file_00000000c5847209bd3024717143c8e9",
  "content_type": "image_asset_pointer",
  "fovea": null,
  "height": 1720,
  "metadata": {
    "asset_pointer_link": null,
    "container_pixel_height": null,
    "container_pixel_width": null,
    "dalle": null,
    "emu_omit_glimpse_image": null,
    "emu_patches_override": null,
    "generation": null,
    "gizmo": null,
    "is_no_auth_placeholder": null,
    "lpe_delta_encoding_channel": null,
    "lpe_keep_patch_ijhw": null,
    "sanitized": true,
    "watermarked_asset_pointer": null
  },
  "size_bytes": 306409,
  "width": 1832
}
```

[非文本内容]

```json
{
  "asset_pointer": "sediment://file_00000000306072098879d7870ece4a4b",
  "content_type": "image_asset_pointer",
  "fovea": null,
  "height": 1698,
  "metadata": {
    "asset_pointer_link": null,
    "container_pixel_height": null,
    "container_pixel_width": null,
    "dalle": null,
    "emu_omit_glimpse_image": null,
    "emu_patches_override": null,
    "generation": null,
    "gizmo": null,
    "is_no_auth_placeholder": null,
    "lpe_delta_encoding_channel": null,
    "lpe_keep_patch_ijhw": null,
    "sanitized": true,
    "watermarked_asset_pointer": null
  },
  "size_bytes": 513315,
  "width": 1668
}
```

[非文本内容]

```json
{
  "asset_pointer": "sediment://file_000000002f70720990c16511d67fa867",
  "content_type": "image_asset_pointer",
  "fovea": null,
  "height": 1516,
  "metadata": {
    "asset_pointer_link": null,
    "container_pixel_height": null,
    "container_pixel_width": null,
    "dalle": null,
    "emu_omit_glimpse_image": null,
    "emu_patches_override": null,
    "generation": null,
    "gizmo": null,
    "is_no_auth_placeholder": null,
    "lpe_delta_encoding_channel": null,
    "lpe_keep_patch_ijhw": null,
    "sanitized": true,
    "watermarked_asset_pointer": null
  },
  "size_bytes": 406362,
  "width": 1672
}
```

能不能下次叫codex给个可以一键复制的内容让我直接复制，免得每次都要截图几张来上传

### 032. assistant

_time `2026-05-30T02:33:18+08:00` · content_type `text` · node `7ec5586d-ed72-4d3e-8573-b27068468a43`_

可以，后面我们就固定这样做：**每个 Codex 任务都要求它生成一个可复制的 Markdown 审查报告文件**，你不用再截图几张图上传。

Codex 的项目级规则可以沉淀在 `AGENTS.md` 或任务 md 里；官方 Codex 文档也说明 Codex 会在工作前读取 `AGENTS.md` 这类项目指令，所以这种“固定输出协议”很适合放进去。citeturn369660search0

---

## 以后统一要求 Codex 输出这个文件

让 Codex 每轮都生成：

```text
.codex-review/latest.md
```

同时可选生成带时间的历史文件：

```text
.codex-review/runs/<goal-id>-<YYYYMMDD-HHMM>.md
```

以后你只需要复制这个文件内容给我，不用截图。

Mac 上可以直接一键复制：

```bash
cat .codex-review/latest.md | pbcopy
```

然后粘贴到 GPT。

---

## 固定加到每个 Codex Goal / Task MD 末尾的内容

以后我给你的每个 `docs/codex-goals/*.md`，结尾都会加这一段。你也可以现在先复制到后续任务里。

````md
## Codex Review Output Protocol

本轮完成后，必须生成一个可复制的 Markdown 审查报告。

必须创建或覆盖：

```text
.codex-review/latest.md
```

如果可以，也同时创建历史副本：

```text
.codex-review/runs/<goal-id>-<YYYYMMDD-HHMM>.md
```

其中 `<goal-id>` 使用当前任务文件名，例如：

```text
002-schema-design-final-review
003-v1-ent-schema-customers-suppliers-orders
```

如果 `.codex-review/runs/` 不存在，可以创建。

### `.codex-review/latest.md` 必须包含以下内容

请按下面模板完整输出，不要省略标题。

```md
# Codex Review Report

## 1. Goal

- Goal file:
- Goal name:
- Run time:
- Task type:
- Runtime changed: Yes / No
- Ent schema changed: Yes / No
- Migration changed: Yes / No
- API changed: Yes / No
- UI changed: Yes / No
- Docs registry changed: Yes / No
- seedData changed: Yes / No

## 2. Completion Summary

简要说明本轮做了什么。

## 3. Added / Modified Files

### Added

列出新增文件。

### Modified

列出修改文件。

### Deleted

列出删除文件。没有则写 None。

## 4. Git Status

粘贴命令和结果：

```bash
git status --short
```

```text
<output>
```

## 5. Diff Stat

粘贴命令和结果：

```bash
git diff --stat
```

```text
<output>
```

## 6. Untracked Files

粘贴命令和结果：

```bash
git ls-files --others --exclude-standard
```

```text
<output>
```

## 7. Forbidden Path Check

说明本轮是否修改了禁止路径。

必须检查这些路径：

```text
server/internal/biz/workflow.go
server/internal/biz/rbac.go
server/internal/data
server/internal/data/model/schema
server/internal/core
web/src/erp/config/docs.mjs
web/src/erp/config/seedData.mjs
web/src/erp/pages
web/src/erp/mobile
migrations
server/deploy
scripts
```

输出格式：

| Path | Changed? | Notes |
|---|---:|---|

## 8. tenant_id Check

粘贴命令和结果：

```bash
grep -R "tenant_id" docs/product docs/architecture docs/customers docs/reference config deployments || true
```

```text
<output>
```

解释：

- 是否新增了 `tenant_id` 字段？
- 是否只出现在 imported notes / 禁止说明 / future SaaS 评审候选说明里？
- 是否进入了 schema draft / runtime / Ent schema？

## 9. Workflow / Fact Boundary Check

粘贴命令和结果：

```bash
grep -R "shipping_released" docs/product docs/architecture docs/customers docs/reference || true
```

```text
<output>
```

解释：

- 是否仍然明确 `shipping_released != shipped`？
- 是否有任何文档把 `shipping_released` 写成已出库 / 已发货 / 已扣库存？
- 是否有任何内容让 Workflow 写 inventory / shipment / finance facts？

## 10. Implementation Status Wording Check

粘贴命令和结果：

```bash
grep -R "Runtime Implemented: Yes\|Ent Schema Implemented: Yes\|Migration Implemented: Yes" docs/product docs/architecture || true
```

```text
<output>
```

解释：

- 本轮是否把 draft / review 错写成 implemented？
- 如果没有，写 No issue found。

## 11. Test Commands and Results

必须列出实际运行的命令。

示例：

```bash
cd web && pnpm test
```

结果：

```text
<output summary>
```

```bash
cd server && go test ./internal/biz ./internal/data
```

结果：

```text
<output summary>
```

```bash
git diff --check
```

结果：

```text
<output summary>
```

如果某个测试没有跑，必须写：

- 未跑命令：
- 未跑原因：
- 是否与本轮改动相关：

## 12. Key Decisions

列出本轮产生的关键决策。

例如：

- V1 Go:
- Draft Only:
- Deferred:
- Explicitly Forbidden:

## 13. Risks

列出本轮仍然存在的风险。

每项格式：

```text
Risk:
Impact:
Mitigation:
Next review needed:
```

## 14. Next Suggested Codex Goal

写下一轮建议。

格式：

```text
Suggested next goal:
Suggested goal file:
Why:
Must not do:
```

## 15. Copy This To GPT

请把本节作为用户可直接复制给 GPT 的摘要。

```text
【Codex Review Report】

【Goal】
<goal file and goal name>

【完成摘要】
<completion summary>

【新增文件】
<added files>

【修改文件】
<modified files>

【git status --short】
<output>

【git diff --stat】
<output>

【untracked files】
<output>

【测试命令与结果】
<test output summary>

【tenant_id 检查】
<explanation>

【Workflow / Fact 检查】
<explanation>

【禁止路径检查】
<explanation>

【关键决策】
<decisions>

【风险】
<risks>

【下一轮 Codex 建议】
<next goal>
```
```

### Codex 最终回复要求

最终回复不要只在聊天窗口里分散输出。

最终回复必须包含：

1. `.codex-review/latest.md` 已生成。
2. 如果生成了历史副本，列出历史副本路径。
3. 给出一条 Mac 一键复制命令：

```bash
cat .codex-review/latest.md | pbcopy
```

4. 给出一条普通查看命令：

```bash
cat .codex-review/latest.md
```

5. 不要要求用户截图。
````

---

## 下次短 Goal 也加一句

以后短 Goal 里我会加这一句：

```text
At the end, generate .codex-review/latest.md using the Codex Review Output Protocol in the task file. The user should be able to copy it with: cat .codex-review/latest.md | pbcopy. Do not require screenshots.
```

---

## 你现在也可以补一个小任务让 Codex 做

因为前两轮已经完成了，但还没有 `.codex-review/latest.md`。你可以让 Codex 根据当前工作区补生成一次报告。

### 短 Goal

```text
Goal: Generate a copyable Codex review report for the current workspace.

Read AGENTS.md first. Do not modify runtime code, schema, migrations, API, UI, docs registry, seedData, workflow.go, rbac.go, server/internal/data, or server/internal/core. Only create .codex-review/latest.md and optionally .codex-review/runs/current-workspace-review.md.

The report must summarize the current Phase 0/1/2 docs-only changes, include git status --short, git diff --stat, git ls-files --others --exclude-standard, tenant_id grep explanation, shipping_released grep explanation, forbidden path check, test results, risks, and next suggested Codex goal.

At the end, tell me I can copy it with:
cat .codex-review/latest.md | pbcopy
```

这样之后你就直接贴 `.codex-review/latest.md` 内容给我，我来判断下一轮。

### 033. user

_time `2026-05-30T08:49:46+08:00` · content_type `text` · node `7a6c3a67-2c80-486e-8c5f-f691b0222e71`_

写进记忆，goal给我中文，这个回答重新写一次给我

### 034. assistant

_time `2026-05-30T08:51:03+08:00` · content_type `text` · node `329fb7f7-85aa-420f-a90a-f317f3cfd648`_

可以。后续我会在**本次对话里默认遵守**这几个规则：

```text
1. Codex Goal 用中文。
2. Goal 控制在 4000 字以内。
3. 复杂任务放到 docs/codex-goals/*.md。
4. 我给你的 md 内容必须是完整可复制代码块，不再半渲染半 markdown。
5. 每轮 Codex 完成后，让 Codex 生成 .codex-review/latest.md。
6. 你以后只需要复制 .codex-review/latest.md 内容给我，不用截图。
```

我不能直接写入跨会话长期记忆，但这次对话后续我会按这个规则继续给你。这个规则也符合你现在的架构治理方式：产品化配置文档强调“一套标准产品内核 + 多客户配置包 + 受控差异”，状态分层文档强调 Workflow / 单据 / Fact / 派生状态分层，后续每轮 Codex 输出都应该能被审查这些边界。fileciteturn2file0 fileciteturn2file1

下面是重写后的版本。

---

## 以后固定让 Codex 生成可复制审查报告

以后每轮 Codex 跑完，不要让它只在聊天窗口里分散输出，也不要让你截图。

统一要求 Codex 生成：

```text
.codex-review/latest.md
```

可选再生成历史副本：

```text
.codex-review/runs/<goal-id>-<YYYYMMDD-HHMM>.md
```

你在 Mac 上可以一键复制：

```bash
cat .codex-review/latest.md | pbcopy
```

然后直接粘贴给我。

---

## 以后每个 Goal 末尾都加这句话

之后我给你的每个 Codex Goal，都会加上这段：

```text
最后必须按照任务文件中的 Codex Review Output Protocol 生成 .codex-review/latest.md。用户应该可以用以下命令一键复制：

cat .codex-review/latest.md | pbcopy

不要要求用户截图。
```

---

## 现在可以让 Codex 补生成一次审查报告

你现在已经跑完 Phase 0 / Phase 1 / Phase 2，但还没有统一的 `.codex-review/latest.md`。可以让 Codex 先补一个当前工作区审查报告。

### 中文 Codex Goal

直接复制到 Codex Goal：

```text
目标：为当前工作区生成一份可复制的 Codex 审查报告。

请先阅读 AGENTS.md。本轮只允许创建或覆盖 .codex-review/latest.md，并可选创建 .codex-review/runs/current-workspace-review.md。

禁止修改 runtime code、Ent schema、migration、API、UI、docs registry、seedData、workflow.go、rbac.go、server/internal/data、server/internal/core。

审查报告必须总结当前 Phase 0 / Phase 1 / Phase 2 的 docs-only 改动，并包含：

1. git status --short
2. git diff --stat
3. git ls-files --others --exclude-standard
4. tenant_id grep 结果和解释
5. shipping_released grep 结果和解释
6. 禁止路径检查
7. 测试命令和结果
8. 当前风险
9. 下一轮建议的 Codex Goal

报告必须写入：

.codex-review/latest.md

如果可以，也同时写入：

.codex-review/runs/current-workspace-review.md

最后告诉我可以用下面命令复制：

cat .codex-review/latest.md | pbcopy

不要要求用户截图。
```

---

## 建议你创建一个固定协议文件

为了以后每个 Codex 任务都统一输出格式，可以创建：

```text
docs/codex-goals/_review-output-protocol.md
```

以后每个任务 md 里只需要写：

```text
本轮完成后，必须按 docs/codex-goals/_review-output-protocol.md 生成 .codex-review/latest.md。
```

---

## `docs/codex-goals/_review-output-protocol.md`

下面是完整可复制内容：

````md
# Codex Review Output Protocol

## 目的

每轮 Codex 完成后，必须生成一个用户可以直接复制给 GPT 审查的 Markdown 报告。

不要只在 Codex 聊天窗口里分散输出。  
不要要求用户截图。  
不要只给口头总结。  

## 必须生成的文件

必须创建或覆盖：

```text
.codex-review/latest.md
```

如果可以，也同时创建历史副本：

```text
.codex-review/runs/<goal-id>-<YYYYMMDD-HHMM>.md
```

其中 `<goal-id>` 使用当前任务文件名，例如：

```text
002-schema-design-final-review
003-v1-ent-schema-customers-suppliers-orders
```

如果 `.codex-review/runs/` 不存在，可以创建。

## 最终必须告诉用户

Codex 最终回复必须告诉用户：

```bash
cat .codex-review/latest.md | pbcopy
```

用于一键复制审查报告。

也要告诉用户：

```bash
cat .codex-review/latest.md
```

用于查看报告。

## `.codex-review/latest.md` 模板

请按下面模板完整输出，不要省略标题。

```md
# Codex Review Report

## 1. Goal

- Goal file:
- Goal name:
- Run time:
- Task type:
- Runtime changed: Yes / No
- Ent schema changed: Yes / No
- Migration changed: Yes / No
- API changed: Yes / No
- UI changed: Yes / No
- Docs registry changed: Yes / No
- seedData changed: Yes / No

## 2. Completion Summary

简要说明本轮做了什么。

## 3. Added / Modified Files

### Added

列出新增文件。

### Modified

列出修改文件。

### Deleted

列出删除文件。没有则写 None。

## 4. Git Status

命令：

```bash
git status --short
```

结果：

```text
<粘贴输出>
```

## 5. Diff Stat

命令：

```bash
git diff --stat
```

结果：

```text
<粘贴输出>
```

## 6. Untracked Files

命令：

```bash
git ls-files --others --exclude-standard
```

结果：

```text
<粘贴输出>
```

## 7. Forbidden Path Check

必须检查这些路径是否被修改：

```text
server/internal/biz/workflow.go
server/internal/biz/rbac.go
server/internal/data
server/internal/data/model/schema
server/internal/core
web/src/erp/config/docs.mjs
web/src/erp/config/seedData.mjs
web/src/erp/pages
web/src/erp/mobile
migrations
server/deploy
scripts
```

输出表格：

| Path | Changed? | Notes |
|---|---:|---|

## 8. tenant_id Check

命令：

```bash
grep -R "tenant_id" docs/product docs/architecture docs/customers docs/reference config deployments || true
```

结果：

```text
<粘贴输出>
```

解释：

- 是否新增了 `tenant_id` 字段？
- 是否只出现在 imported notes / 禁止说明 / future SaaS 评审候选说明里？
- 是否进入了 schema draft / runtime / Ent schema？

## 9. Workflow / Fact Boundary Check

命令：

```bash
grep -R "shipping_released" docs/product docs/architecture docs/customers docs/reference || true
```

结果：

```text
<粘贴输出>
```

解释：

- 是否仍然明确 `shipping_released != shipped`？
- 是否有任何文档把 `shipping_released` 写成已出库 / 已发货 / 已扣库存？
- 是否有任何内容让 Workflow 写 inventory / shipment / finance facts？

## 10. Implementation Status Wording Check

命令：

```bash
grep -R "Runtime Implemented: Yes\|Ent Schema Implemented: Yes\|Migration Implemented: Yes" docs/product docs/architecture || true
```

结果：

```text
<粘贴输出>
```

解释：

- 本轮是否把 draft / review 错写成 implemented？
- 如果没有，写 No issue found。

## 11. Test Commands and Results

列出实际运行的命令和结果。

### Frontend

命令：

```bash
cd web && pnpm test
```

结果：

```text
<粘贴摘要>
```

### Backend

命令：

```bash
cd server && go test ./internal/biz ./internal/data
```

结果：

```text
<粘贴摘要>
```

### Diff Check

命令：

```bash
git diff --check
```

结果：

```text
<粘贴摘要>
```

如果某个测试没有跑，必须写：

- 未跑命令：
- 未跑原因：
- 是否与本轮改动相关：

## 12. Key Decisions

列出本轮产生的关键决策。

示例：

- V1 Go:
- Draft Only:
- Deferred:
- Explicitly Forbidden:

## 13. Risks

列出本轮仍然存在的风险。

每项格式：

```text
Risk:
Impact:
Mitigation:
Next review needed:
```

## 14. Next Suggested Codex Goal

写下一轮建议。

格式：

```text
Suggested next goal:
Suggested goal file:
Why:
Must not do:
```

## 15. Copy This To GPT

请把本节作为用户可直接复制给 GPT 的摘要。

```text
【Codex Review Report】

【Goal】
<goal file and goal name>

【完成摘要】
<completion summary>

【新增文件】
<added files>

【修改文件】
<modified files>

【git status --short】
<output>

【git diff --stat】
<output>

【untracked files】
<output>

【测试命令与结果】
<test output summary>

【tenant_id 检查】
<explanation>

【Workflow / Fact 检查】
<explanation>

【禁止路径检查】
<explanation>

【关键决策】
<decisions>

【风险】
<risks>

【下一轮 Codex 建议】
<next goal>
```
```

## Codex 最终回复要求

Codex 最终回复必须包含：

1. `.codex-review/latest.md` 已生成。
2. 如果生成了历史副本，列出历史副本路径。
3. 给出 Mac 一键复制命令：

```bash
cat .codex-review/latest.md | pbcopy
```

4. 给出普通查看命令：

```bash
cat .codex-review/latest.md
```

5. 不要要求用户截图。
````

---

## 以后我给你的 Goal 会长这样

例如下一轮如果是 `003-v1-ent-schema-customers-suppliers-orders`，我会给你：

```text
中文短 Goal:
目标：执行 docs/codex-goals/003-v1-ent-schema-customers-suppliers-orders.md。

请先阅读 AGENTS.md，再严格执行任务文件。本轮只允许落 V1 cutline 中明确允许的 Ent schema：customers、suppliers、contacts、sales_orders、sales_order_items。禁止 repo/usecase、API、UI、docs registry、seedData、workflow.go、rbac.go、server/internal/data 业务逻辑改动。禁止 tenant_id、SaaS、多租户、ChangeUsecase、change_records。完成后必须按 docs/codex-goals/_review-output-protocol.md 生成 .codex-review/latest.md，用户应能用 cat .codex-review/latest.md | pbcopy 复制，不要要求截图。
```

然后我会给完整 md 文件内容。

### 035. user

_time `2026-05-30T08:57:57+08:00` · content_type `text` · node `b28ee564-c41b-4d96-93fb-a8a41524cf9d`_

我每次给goal都是新开对话哦，还是用这个goal吗

### 036. assistant

_time `2026-05-30T08:59:28+08:00` · content_type `text` · node `83e62496-9b99-4689-9938-f4a7911bb889`_

对，**如果你每次都是新开 Codex 对话，那每次都要给一个“启动型短 Goal”**。不过不用每次贴完整大 md，只要仓库里已经有任务文件，就让新对话读取它。

关键点是：**新 Codex 对话不会记得上一次聊天里你说过什么，但它可以读取仓库里的文件**。Codex 官方文档也说明，Codex 会在开始工作前读取项目里的 `AGENTS.md`，所以固定规则应该尽量沉淀到仓库文件里，而不是依赖聊天记忆。citeturn380204search0 Codex 本身可以在选定目录读取、修改并运行代码，所以“短 Goal + 仓库内任务 md + 审查报告文件”是更稳定的方式。citeturn380204search3

---

## 结论

以后每次新开 Codex 对话，都用这种结构：

```text
1. 短 Goal：告诉 Codex 读哪个任务文件。
2. 任务 md：放完整要求。
3. AGENTS.md：放长期固定规则。
4. .codex-review/latest.md：Codex 完成后生成可复制审查报告。
```

你不用每次贴超长 Goal。

---

## 每次新对话通用短 Goal 模板

以后新开 Codex 对话时，直接这样写：

```text
目标：执行 docs/codex-goals/<任务文件名>.md。

请先阅读 AGENTS.md，然后严格执行任务文件。当前是 plush-toy-erp 项目。每次新对话都不能依赖历史聊天记忆，只能以仓库文件为准。

必须遵守：
- 不新增 tenant_id。
- 不实现 SaaS 多租户。
- 不实现 license server、套餐计费、客户工单系统。
- 不创建泛化 ChangeUsecase 或 change_records。
- 不把 current 客户资料写成 Product Core。
- 不混淆 Workflow / Fact。
- shipping_released != shipped。
- business_records 只是兼容层、demo、seed、source snapshot，不是长期事实真源。

本轮允许和禁止修改的文件，以任务 md 为准。

完成后必须按 docs/codex-goals/_review-output-protocol.md 生成：

.codex-review/latest.md

用户应能用下面命令一键复制：

cat .codex-review/latest.md | pbcopy

不要要求用户截图。
```

把 `<任务文件名>` 换成实际文件，例如：

```text
002-schema-design-final-review.md
003-v1-ent-schema-customers-suppliers-orders.md
004-v1-migration-and-ent-generate.md
```

---

## 你现在下一轮应该用哪个 Goal

你现在 Phase 2 已经完成，Codex 建议下一轮是：

```text
003-v1-ent-schema-customers-suppliers-orders
```

所以你下一轮新开 Codex 对话，可以用：

```text
目标：执行 docs/codex-goals/003-v1-ent-schema-customers-suppliers-orders.md。

请先阅读 AGENTS.md，然后严格执行任务文件。当前是 plush-toy-erp 项目。每次新对话都不能依赖历史聊天记忆，只能以仓库文件为准。

本轮只允许落 V1 cutline 中明确允许的 Ent schema：customers、suppliers、contacts、sales_orders、sales_order_items。

禁止：
- 不新增 tenant_id。
- 不实现 SaaS 多租户。
- 不实现 license server、套餐计费、客户工单系统。
- 不创建泛化 ChangeUsecase 或 change_records。
- 不改 repo/usecase。
- 不接 API。
- 不接 UI。
- 不改 docs registry。
- 不改 seedData。
- 不改 workflow.go。
- 不改 rbac.go。
- 不改 server/internal/data 业务逻辑。
- 不把 current 客户资料写成 Product Core。
- 不从 Workflow 写库存、出货、财务事实。
- shipping_released != shipped。

本轮允许和禁止修改的文件，以任务 md 为准。

完成后必须按 docs/codex-goals/_review-output-protocol.md 生成：

.codex-review/latest.md

用户应能用下面命令一键复制：

cat .codex-review/latest.md | pbcopy

不要要求用户截图。
```

前提是：你已经先创建了这个文件：

```text
docs/codex-goals/003-v1-ent-schema-customers-suppliers-orders.md
```

---

## 如果任务 md 还没创建怎么办

如果对应的任务 md 还没在仓库里，新对话里只贴短 Goal 是不够的。你有两种选择：

第一种，更推荐：

```text
先让我给你完整的 003 md。
你把它保存到 docs/codex-goals/003-v1-ent-schema-customers-suppliers-orders.md。
然后新开 Codex 对话只贴短 Goal。
```

第二种：

```text
在 Codex 新对话里直接粘贴完整 md 内容。
```

但 Codex Goal 有 4000 字限制，所以第一种更稳。

---

## 建议把这条写进 AGENTS.md

为了以后每次新对话更稳，建议加一条固定规则到 `AGENTS.md`：

```md
## Codex Goal Workflow

每个 Codex 新会话都必须先阅读 AGENTS.md，然后阅读 docs/codex-goals/<goal>.md。

复杂任务不要直接写在 Codex Goal 输入框里，应写入 docs/codex-goals/*.md。

每轮完成后必须生成：

- .codex-review/latest.md
- 可选 .codex-review/runs/<goal-id>-<timestamp>.md

用户应能用以下命令复制审查报告：

cat .codex-review/latest.md | pbcopy

不要要求用户截图。
```

这样你每次新开 Codex 对话，它都会从仓库规则里继承这个流程。

---

## 最终回答

**是的，每次新开 Codex 对话仍然要给 Goal。**

但不是每次给完整大 Goal，而是给：

```text
执行 docs/codex-goals/xxx.md
```

这种短 Goal。

真正的详细任务、边界、验收命令、审查报告格式都放仓库文件里。这样即使每次都是新对话，也不会丢上下文。

### 037. user

_time `2026-05-30T09:00:59+08:00` · content_type `text` · node `17e22856-ac6a-4dbd-9303-9dd942256c3b`_

是每次新开codex会话，还是接着之前的会话，你又不告诉我，要不要把这个存进记忆

### 038. assistant

_time `2026-05-30T09:02:57+08:00` · content_type `text` · node `3371da8b-5979-493b-a03a-faad64a28824`_

你说得对，这个规则应该早一点说清楚。

## 结论

以后按这个规则：

```text
1. 每个独立 Goal 新开一个 Codex 会话。
2. 同一个 Goal 内的补漏、测试失败修复、生成 review 报告，继续原 Codex 会话。
3. 进入下一轮 Goal，例如 002 -> 003，要新开 Codex 会话。
4. 新会话必须读取 AGENTS.md + docs/codex-goals/<goal>.md。
5. 所有长期规则不要靠聊天记忆，写进仓库。
```

官方 Codex 文档也建议把长期项目规则放进 `AGENTS.md`，Codex 会在开始工作前读取它；复杂任务则适合拆到仓库内的任务文档里，而不是每次靠聊天上下文记住。citeturn202319search0turn202319search2

---

## 为什么建议“每个 Goal 新开 Codex 会话”

因为你现在的流程是：

```text
001 docs-only review
002 schema final review
003 Ent schema
004 migration/generate
005 repo/usecase
006 API/RBAC
007 UI
```

每个 Goal 的允许范围和禁止范围不同。如果一直接着旧会话，Codex 可能会把上一个 Goal 的上下文带到下一个 Goal，尤其是 docs-only 阶段进入 schema 阶段时，容易混淆“评审文档”和“可以实现”。

所以：

| 场景 | 建议 |
|---|---|
| 继续修同一轮测试失败 | 接着原 Codex 会话 |
| 补 `.codex-review/latest.md` | 接着原 Codex 会话 |
| 补漏一个当前 Goal 要求的文件 | 接着原 Codex 会话 |
| 从 002 进入 003 | 新开 Codex 会话 |
| 从 docs-only 进入 schema | 新开 Codex 会话 |
| 从 schema 进入 repo/usecase | 新开 Codex 会话 |
| 从 repo/usecase 进入 API/UI | 新开 Codex 会话 |

一句话：

```text
同一目标内继续，换目标就新开。
```

---

## 要不要存进记忆？

**要存，但最好不是存进 ChatGPT 记忆，而是存进仓库。**

我不能保证跨对话长期记住你这套偏好；即使记住，也不如仓库文件可靠。你这个项目本来就强调“单一产品内核 + 多客户配置包 + 受控差异”，以及 Workflow / Fact 分层边界，所以流程规则也应该版本化写进项目文件，而不是靠人脑或聊天上下文。fileciteturn2file0turn2file1

建议存三处：

```text
AGENTS.md
docs/codex-goals/_review-output-protocol.md
docs/codex-goals/README.md
```

以后每个新 Codex 会话只需要短 Goal：

```text
目标：执行 docs/codex-goals/003-v1-ent-schema-customers-suppliers-orders.md。

请先阅读 AGENTS.md，然后严格执行任务文件。完成后按 docs/codex-goals/_review-output-protocol.md 生成 .codex-review/latest.md。不要要求截图。
```

---

## 建议现在让 Codex 先做一个“持久化规则”小任务

这个任务很小，适合现在做。它会把我们刚刚定下来的规则写进仓库，之后你每次新开 Codex 会话都不会丢。

### 中文 Codex Goal

直接复制：

```text
目标：持久化 Codex 工作流规则。

请先阅读 AGENTS.md。本轮只允许修改 AGENTS.md，并新增或修改 docs/codex-goals/README.md 与 docs/codex-goals/_review-output-protocol.md。

目标是把以下规则写进仓库：
1. 每个独立 Goal 建议新开 Codex 会话。
2. 同一个 Goal 内的补漏、测试失败修复、生成 review 报告，可以继续原 Codex 会话。
3. 新 Codex 会话不能依赖历史聊天记忆，必须先读 AGENTS.md，再读 docs/codex-goals/<goal>.md。
4. Codex Goal 输入框只放 4000 字以内中文短 Goal。
5. 复杂任务必须写入 docs/codex-goals/*.md。
6. 每轮完成后必须生成 .codex-review/latest.md。
7. 用户应能用 cat .codex-review/latest.md | pbcopy 一键复制给 GPT。
8. 不要要求用户截图。
9. 所有长期规则以仓库文件为准，不依赖 ChatGPT 或 Codex 聊天记忆。

禁止：
- 不改 runtime code。
- 不改 Ent schema。
- 不新增 migration。
- 不改 API。
- 不改 UI。
- 不改 docs registry。
- 不改 seedData。
- 不改 workflow.go。
- 不改 rbac.go。
- 不改 server/internal/data。
- 不新增 tenant_id。
- 不实现 SaaS 多租户。

完成后生成 .codex-review/latest.md，并告诉我可以用：

cat .codex-review/latest.md | pbcopy

复制结果。
```

---

## 建议写进 `AGENTS.md` 的内容

你也可以直接让 Codex 写入这段：

```md
## Codex Goal Workflow

- 每个独立 Goal 建议新开一个 Codex 会话。
- 同一个 Goal 内的补漏、测试失败修复、生成 review 报告，可以继续原 Codex 会话。
- 新 Codex 会话不能依赖历史聊天记忆，必须先阅读 `AGENTS.md`，再阅读 `docs/codex-goals/<goal>.md`。
- Codex Goal 输入框只放 4000 字以内中文短 Goal。
- 复杂任务必须写入 `docs/codex-goals/*.md`。
- 每轮完成后必须按 `docs/codex-goals/_review-output-protocol.md` 生成 `.codex-review/latest.md`。
- 用户应能用以下命令复制审查报告：

```bash
cat .codex-review/latest.md | pbcopy
```

- 不要要求用户截图。
- 所有长期规则以仓库文件为准，不依赖 ChatGPT 或 Codex 聊天记忆。
```

---

## 最终规则

以后我默认这样给你：

```text
1. 中文短 Goal
2. 对应 docs/codex-goals/xxx.md 文件名
3. 完整可复制的 md 内容
4. 要求 Codex 生成 .codex-review/latest.md
```

你执行时：

```text
换 Goal = 新开 Codex 会话
同 Goal 修补 = 继续原 Codex 会话
```

这条规则建议马上写进 `AGENTS.md`，不要只靠我或 Codex 的记忆。

### 039. user

_time `2026-05-30T15:01:06+08:00` · content_type `text` · node `ab83b8bf-17e9-49fa-8d39-bd835ddbc6be`_

不一定总是开启goal，所以新开会话是自己手动操作的，所以我除了创建_review-output-protocol.md并且复制你给出的内容，还要叫codex怎么写agents md，然后全局agents md要不要写，如果要，如何写

### 040. assistant

_time `2026-05-30T15:03:55+08:00` · content_type `text` · node `52ee293c-c59b-4bcf-8398-dd6bc59f1266`_

对，你现在需要做三件事：

```text
1. 创建 docs/codex-goals/_review-output-protocol.md。
2. 让 Codex 更新仓库根目录 AGENTS.md。
3. 可选：你自己创建全局 ~/.codex/AGENTS.md。
```

**仓库根目录 `AGENTS.md` 建议必须写。**  
**全局 `~/.codex/AGENTS.md` 建议写，但只写你的通用偏好，不要写 plush-toy-erp 的业务规则。**

Codex 官方文档里也区分了全局指令和仓库级指令：全局 `~/.codex/AGENTS.md` 适合放个人通用偏好，仓库根目录 `AGENTS.md` 适合放项目规范；更靠近工作目录的项目指令会覆盖更通用的指令。citeturn886892search0 官方最佳实践也建议 `AGENTS.md` 不要写成大而空的文档，而是放真正会反复影响开发、测试、审查的规则。citeturn886892search4

你这个项目的长期规则非常适合写进仓库，因为它不是个人偏好，而是项目产品边界：一套产品内核、多客户配置包、受控客户差异、核心代码不分叉，以及 Workflow / 单据 / Fact / 派生状态分层。fileciteturn2file0 fileciteturn2file1

---

## 1. 该不该写全局 AGENTS.md

建议写，但要很克制。

### 全局 `~/.codex/AGENTS.md` 放什么

放你的个人工作流偏好：

```text
Codex Goal 用中文
复杂任务写到 docs/codex-goals/*.md
每轮生成 .codex-review/latest.md
不要要求截图
输出完整可复制 Markdown
新 Goal 建议新开 Codex 会话
同 Goal 内补漏继续原会话
```

### 全局 `~/.codex/AGENTS.md` 不放什么

不要放 plush-toy-erp 专属规则：

```text
不要写库存事实
shipping_released != shipped
current 不是 SaaS tenant
business_records 不是事实真源
不要改 workflow.go
```

这些属于当前仓库，应该写进仓库根目录 `AGENTS.md`。

---

## 2. 推荐文件分工

```text
~/.codex/AGENTS.md
  你的个人 Codex 使用偏好，所有项目通用。

AGENTS.md
  plush-toy-erp 项目级规则，所有 Codex 新会话必须读。

docs/codex-goals/README.md
  说明 Codex Goal 工作流怎么用。

docs/codex-goals/_review-output-protocol.md
  固定审查报告格式，要求生成 .codex-review/latest.md。

docs/codex-goals/003-xxx.md
  每一轮具体任务。
```

---

## 3. 你可以给 Codex 的中文短指令

这段可以直接贴给 Codex。它只让 Codex 改仓库里的文件，不碰 runtime。

```text
目标：持久化 Codex 工作流规则。

请先阅读 AGENTS.md。本轮只允许修改仓库根目录 AGENTS.md，并新增或修改 docs/codex-goals/README.md。不要修改 runtime code、Ent schema、migration、API、UI、docs registry、seedData、workflow.go、rbac.go、server/internal/data、server/internal/core。

如果 docs/codex-goals/_review-output-protocol.md 已存在，只在 README 或 AGENTS.md 中引用它，不要重复粘贴一份长协议。

请把以下规则写进仓库：
1. 每个独立 Goal 建议新开 Codex 会话。
2. 同一个 Goal 内的补漏、测试失败修复、生成 review 报告，可以继续原 Codex 会话。
3. 新 Codex 会话不能依赖历史聊天记忆，必须先读 AGENTS.md，再读 docs/codex-goals/<goal>.md。
4. Codex Goal 输入框只放 4000 字以内中文短 Goal。
5. 复杂任务必须写入 docs/codex-goals/*.md。
6. 每轮完成后必须按 docs/codex-goals/_review-output-protocol.md 生成 .codex-review/latest.md。
7. 用户应能用 cat .codex-review/latest.md | pbcopy 一键复制给 GPT。
8. 不要要求用户截图。
9. 所有长期规则以仓库文件为准，不依赖 ChatGPT 或 Codex 聊天记忆。
10. plush-toy-erp 的产品边界、Workflow/Fact 边界、tenant_id 禁止项、current 客户边界仍以 AGENTS.md 和 docs/product/* 为准。

禁止：
- 不新增 tenant_id。
- 不实现 SaaS 多租户。
- 不实现 license server、套餐计费、客户工单系统。
- 不创建泛化 ChangeUsecase 或 change_records。
- 不把 current 客户资料写成 Product Core。
- 不混淆 Workflow / Fact。
- 不把 shipping_released 写成 shipped。
- 不把 business_records 当长期事实真源。

验收命令：
- git status --short
- git diff --stat
- grep -n "Codex Goal Workflow" AGENTS.md || true
- grep -n "review-output-protocol" docs/codex-goals/README.md || true
- git diff --check

完成后生成 .codex-review/latest.md，并告诉我可以用：

cat .codex-review/latest.md | pbcopy

复制结果。
```

---

## 4. 建议写进仓库根目录 `AGENTS.md` 的内容

让 Codex 把下面这段追加到仓库根目录 `AGENTS.md`。如果已有类似章节，让它合并，不要重复。

````md
## Codex Goal Workflow

This repository uses short Codex goals plus versioned task files.

### Session policy

- Each independent Goal should start in a new Codex session.
- Follow-up fixes inside the same Goal may continue in the existing Codex session.
- Examples of same-Goal follow-ups:
  - fixing a failed test caused by the current Goal
  - generating or repairing `.codex-review/latest.md`
  - adding a missing file explicitly required by the current Goal
  - correcting a formatting issue in files produced by the current Goal
- Examples that should start a new Codex session:
  - moving from one numbered Goal to the next
  - moving from docs-only review to schema implementation
  - moving from schema to repo/usecase
  - moving from repo/usecase to API/RBAC
  - moving from API/RBAC to UI

### Goal input policy

- Codex Goal input should be a short Chinese instruction under 4,000 characters.
- Complex tasks must be written in `docs/codex-goals/*.md`.
- A new Codex session must not rely on prior chat memory.
- A new Codex session must read `AGENTS.md` first, then read the requested `docs/codex-goals/<goal>.md`.

### Required review output

Every Codex Goal must generate a copyable review report:

```text
.codex-review/latest.md
```

When practical, also create a historical copy:

```text
.codex-review/runs/<goal-id>-<YYYYMMDD-HHMM>.md
```

The report must follow:

```text
docs/codex-goals/_review-output-protocol.md
```

The user must be able to copy the report with:

```bash
cat .codex-review/latest.md | pbcopy
```

Do not ask the user to provide screenshots.

### Long-term rules source

Long-term workflow rules must live in repository files, not in ChatGPT or Codex chat memory.

Canonical locations:

```text
AGENTS.md
docs/codex-goals/README.md
docs/codex-goals/_review-output-protocol.md
docs/codex-goals/*.md
docs/product/*
docs/architecture/*
```

### Persistent project boundaries

Unless a task file explicitly narrows the scope further, Codex must preserve these project boundaries:

- Do not add `tenant_id`.
- Do not implement SaaS multi-tenancy.
- Do not implement license server, billing plans, or customer ticket systems.
- Do not create a generic `ChangeUsecase`.
- Do not create generic `change_records`.
- Do not treat `current` customer materials as Product Core rules.
- Do not make `WorkflowUsecase` write inventory, shipment, finance, AR/AP, invoice, or payment facts.
- `shipping_released != shipped`.
- `workflow task done != fact posted`.
- `business_records` is a compatibility/demo/source-snapshot layer, not a long-term fact truth source.
- Customer-specific data belongs under `docs/customers/<customer-key>/`, customer config drafts, seed/demo material, print templates, or data import adapters unless a Product Core review promotes it.
````

---

## 5. 建议创建 `docs/codex-goals/README.md`

完整可复制内容如下：

````md
# Codex Goals

This directory contains versioned task files for Codex.

## Why this exists

Codex Goal input has a short input limit, and every new Codex session should be able to work without relying on previous chat memory.

Therefore, this project uses:

```text
short Chinese Codex Goal
+ docs/codex-goals/<goal>.md
+ AGENTS.md
+ .codex-review/latest.md
```

## How to start a new Codex session

Use a short Chinese Goal like this:

```text
目标：执行 docs/codex-goals/<goal-file>.md。

请先阅读 AGENTS.md，然后严格执行任务文件。每次新会话都不能依赖历史聊天记忆，只能以仓库文件为准。

完成后必须按 docs/codex-goals/_review-output-protocol.md 生成 .codex-review/latest.md。

用户应能用下面命令一键复制：

cat .codex-review/latest.md | pbcopy

不要要求用户截图。
```

## Session policy

Use a new Codex session when switching to a new numbered Goal.

Examples:

```text
002 -> 003: new session
003 -> 004: new session
schema -> repo/usecase: new session
repo/usecase -> API/RBAC: new session
API/RBAC -> UI: new session
```

Continue the same Codex session only for the same Goal.

Examples:

```text
fix current test failure
add missing file required by current Goal
repair .codex-review/latest.md
clarify current Goal output
```

## Required review report

Every Codex run must generate:

```text
.codex-review/latest.md
```

It should follow:

```text
docs/codex-goals/_review-output-protocol.md
```

The user should be able to copy it with:

```bash
cat .codex-review/latest.md | pbcopy
```

Do not ask the user to provide screenshots.

## Goal file naming

Use numeric prefixes:

```text
000-phase0-foundation.md
001-overnight-phase1-masterdata-order-review.md
002-schema-design-final-review.md
003-v1-ent-schema-customers-suppliers-orders.md
004-v1-migration-and-ent-generate.md
005-v1-repo-usecase-masterdata.md
006-v1-repo-usecase-sales-order.md
007-v1-api-rbac-masterdata-order.md
008-v1-frontend-masterdata-order-pages.md
009-business-records-transition-audit.md
010-current-customer-data-import-draft.md
```

## Goal file structure

Each goal file should include:

```text
任务名称
任务性质
背景
必须先读
允许修改的文件
禁止修改的文件
核心原则
验收命令
最终回复格式
Codex Review Output Protocol requirement
```

## Project boundaries

All goal files must preserve the repository boundaries unless explicitly reviewed and approved:

- Do not add `tenant_id`.
- Do not implement SaaS multi-tenancy.
- Do not implement license server, billing plans, or customer ticket systems.
- Do not create generic `ChangeUsecase`.
- Do not create generic `change_records`.
- Do not treat `current` customer materials as Product Core rules.
- Do not make Workflow write inventory, shipment, finance, AR/AP, invoice, or payment facts.
- `shipping_released != shipped`.
- `workflow task done != fact posted`.
- `business_records` is a compatibility/demo/source-snapshot layer, not a long-term fact truth source.
````

---

## 6. 全局 `~/.codex/AGENTS.md` 怎么写

这个建议你自己手动创建，因为它在你的 home 目录，不属于项目仓库。

命令：

```bash
mkdir -p ~/.codex
cat > ~/.codex/AGENTS.md <<'EOF'
# Global Codex Working Agreements

## Language

- Prefer Chinese for Codex Goals and review summaries when the project/user uses Chinese.
- Keep short Goal inputs under 4,000 characters.
- Put complex task details into repository task files instead of long chat prompts.

## Session workflow

- For a new independent Goal, start a new Codex session.
- For fixes inside the same Goal, continue the existing session.
- Do not rely on previous chat memory when starting a new session.
- Read the repository `AGENTS.md` first when present.
- Then read the requested task file, usually under `docs/codex-goals/*.md`.

## Review output

- Every completed Codex task should generate a copyable Markdown review report when the repository defines a review protocol.
- Prefer `.codex-review/latest.md` as the latest report path.
- The user should be able to copy it with:

```bash
cat .codex-review/latest.md | pbcopy
```

- Do not ask the user to provide screenshots when a Markdown report can be generated.

## Editing discipline

- Respect the allowed and forbidden file lists in the task file.
- Do not expand scope without stating the reason and asking for confirmation.
- If tests fail, report the failing command and key logs before making unrelated changes.
- Prefer small, reviewable commits or review bundles over broad unreviewable changes.

## Documentation style

- When asked to provide a task file, output a complete copyable Markdown block.
- Do not mix rendered Markdown fragments with partial code blocks when the user asks for a file.
EOF
```

这个全局文件只放通用偏好，不要放 plush-toy-erp 的业务约束。

---

## 7. 是否需要全局 AGENTS.override.md

现在不需要。

`AGENTS.override.md` 适合临时覆盖全局规则。比如你某天想让 Codex 全程英文、或者临时允许更激进的操作，再用 override。正常不要加，避免忘记关闭。

---

## 8. 你现在实际执行顺序

建议这样做：

```text
第一步：手动创建 ~/.codex/AGENTS.md。
第二步：确认 docs/codex-goals/_review-output-protocol.md 已经存在。
第三步：让 Codex 执行“持久化 Codex 工作流规则”短 Goal。
第四步：Codex 修改 AGENTS.md 和 docs/codex-goals/README.md。
第五步：以后每个新 Codex 会话只贴中文短 Goal。
```

---

## 9. 以后新会话短 Goal 固定模板

以后你每次新开 Codex 会话，贴这个模板即可：

```text
目标：执行 docs/codex-goals/<goal-file>.md。

请先阅读 AGENTS.md，然后严格执行任务文件。每次新会话都不能依赖历史聊天记忆，只能以仓库文件为准。

本轮允许和禁止修改的文件，以任务 md 为准。

必须遵守：
- 不新增 tenant_id。
- 不实现 SaaS 多租户。
- 不实现 license server、套餐计费、客户工单系统。
- 不创建泛化 ChangeUsecase 或 change_records。
- 不把 current 客户资料写成 Product Core。
- 不混淆 Workflow / Fact。
- shipping_released != shipped。
- business_records 只是兼容层、demo、seed、source snapshot，不是长期事实真源。

完成后必须按 docs/codex-goals/_review-output-protocol.md 生成 .codex-review/latest.md。

用户应能用下面命令一键复制：

cat .codex-review/latest.md | pbcopy

不要要求用户截图。
```

把 `<goal-file>` 替换成实际任务文件名。

---

## 10. 最终建议

你要写：

```text
仓库 AGENTS.md：必须写。
docs/codex-goals/README.md：建议写。
docs/codex-goals/_review-output-protocol.md：必须写。
全局 ~/.codex/AGENTS.md：建议写，但只写个人通用偏好。
```

不要把所有东西都塞进全局。项目规则留在项目，个人偏好放全局。这样你手动新开 Codex 会话也不会丢流程。

### 041. user

_time `2026-05-30T18:34:50+08:00` · content_type `text` · node `9a69c4a6-8f5e-4847-8752-fd2d78daec73`_

你怎么又给一堆英文的给我，重新给我复制

### 042. assistant

_time `2026-05-30T18:37:53+08:00` · content_type `text` · node `aeb681b3-2854-4540-b9ad-b212f50b403f`_

对，我重新给你一版**全中文、可直接复制**的。以后我给你的 Codex 内容也按这个格式：**中文短 Goal + 对应 md 文件名 + 完整可复制 md 内容**。

这次你要做的是：

```text
1. 创建或确认 docs/codex-goals/_review-output-protocol.md。
2. 让 Codex 更新仓库根目录 AGENTS.md。
3. 让 Codex 新增或更新 docs/codex-goals/README.md。
4. 可选：你自己创建全局 ~/.codex/AGENTS.md。
```

仓库级规则必须写进 `AGENTS.md`，因为这些是 plush-toy-erp 的长期项目约束；全局 `~/.codex/AGENTS.md` 只写你的个人使用习惯，不写具体业务规则。这个分工也符合你当前的产品化设计：一套产品内核、多客户配置包、受控客户差异；同时 Workflow、单据生命周期、业务事实、派生状态必须分层，不能混在一起。fileciteturn2file0 fileciteturn2file1

---

## 一、给 Codex 的中文短 Goal

复制下面这一段到 Codex：

```text
目标：持久化 Codex 工作流规则。

请先阅读 AGENTS.md。本轮只允许修改仓库根目录 AGENTS.md，并新增或修改 docs/codex-goals/README.md。不要修改运行时代码、Ent schema、migration、API、UI、docs registry、seedData、workflow.go、rbac.go、server/internal/data、server/internal/core。

如果 docs/codex-goals/_review-output-protocol.md 已存在，只在 README 或 AGENTS.md 中引用它，不要重复粘贴一份长协议。

请把以下规则写进仓库：
1. 每个独立 Goal 建议新开 Codex 会话。
2. 同一个 Goal 内的补漏、测试失败修复、生成 review 报告，可以继续原 Codex 会话。
3. 新 Codex 会话不能依赖历史聊天记忆，必须先读 AGENTS.md，再读 docs/codex-goals/<goal>.md。
4. Codex Goal 输入框只放 4000 字以内中文短 Goal。
5. 复杂任务必须写入 docs/codex-goals/*.md。
6. 每轮完成后必须按 docs/codex-goals/_review-output-protocol.md 生成 .codex-review/latest.md。
7. 用户应能用 cat .codex-review/latest.md | pbcopy 一键复制给 GPT。
8. 不要要求用户截图。
9. 所有长期规则以仓库文件为准，不依赖 ChatGPT 或 Codex 聊天记忆。
10. plush-toy-erp 的产品边界、Workflow/Fact 边界、tenant_id 禁止项、current 客户边界仍以 AGENTS.md 和 docs/product/* 为准。

禁止：
- 不新增 tenant_id。
- 不实现 SaaS 多租户。
- 不实现 license server、套餐计费、客户工单系统。
- 不创建泛化 ChangeUsecase 或 change_records。
- 不把 current 客户资料写成 Product Core。
- 不混淆 Workflow / Fact。
- 不把 shipping_released 写成 shipped。
- 不把 business_records 当长期事实真源。

验收命令：
- git status --short
- git diff --stat
- grep -n "Codex 工作流" AGENTS.md || true
- grep -n "_review-output-protocol" docs/codex-goals/README.md || true
- git diff --check

完成后生成 .codex-review/latest.md，并告诉我可以用：

cat .codex-review/latest.md | pbcopy

复制结果。
```

---

## 二、建议追加到仓库根目录 `AGENTS.md` 的内容

让 Codex 把下面内容追加到 `AGENTS.md`。如果已有类似章节，让它合并，不要重复。

````md
## Codex 工作流

本仓库使用“中文短 Goal + 仓库内任务文件 + 可复制审查报告”的 Codex 工作流。

### 会话规则

- 每个独立 Goal 建议新开一个 Codex 会话。
- 同一个 Goal 内的补漏、测试失败修复、生成审查报告，可以继续原 Codex 会话。
- 以下情况属于同一个 Goal 内的后续处理：
  - 修复当前 Goal 导致的测试失败。
  - 生成或修复 `.codex-review/latest.md`。
  - 补充当前 Goal 明确要求但遗漏的文件。
  - 修正当前 Goal 产物中的格式问题。
- 以下情况建议新开 Codex 会话：
  - 从一个编号 Goal 进入下一个编号 Goal。
  - 从 docs-only 评审进入 schema 实现。
  - 从 schema 进入 repo/usecase。
  - 从 repo/usecase 进入 API/RBAC。
  - 从 API/RBAC 进入 UI。

### Goal 输入规则

- Codex Goal 输入框只放 4000 字以内中文短 Goal。
- 复杂任务必须写入 `docs/codex-goals/*.md`。
- 新 Codex 会话不能依赖历史聊天记忆。
- 新 Codex 会话必须先阅读 `AGENTS.md`，再阅读指定的 `docs/codex-goals/<goal>.md`。
- 每个任务的允许修改文件、禁止修改文件、验收命令，以对应的 goal md 为准。

### 审查报告规则

每轮 Codex 完成后必须生成可复制审查报告：

```text
.codex-review/latest.md
```

如果可行，也同时生成历史副本：

```text
.codex-review/runs/<goal-id>-<YYYYMMDD-HHMM>.md
```

审查报告必须遵守：

```text
docs/codex-goals/_review-output-protocol.md
```

用户必须能用下面命令一键复制审查报告：

```bash
cat .codex-review/latest.md | pbcopy
```

不要要求用户截图。

### 长期规则来源

长期规则必须写进仓库文件，不依赖 ChatGPT 或 Codex 的聊天记忆。

规则优先参考：

```text
AGENTS.md
docs/codex-goals/README.md
docs/codex-goals/_review-output-protocol.md
docs/codex-goals/*.md
docs/product/*
docs/architecture/*
```

### 项目长期边界

除非任务文件明确缩小范围或经过单独评审，Codex 必须持续遵守以下边界：

- 不新增 `tenant_id`。
- 不实现 SaaS 多租户。
- 不实现 license server、套餐计费、客户工单系统。
- 不创建泛化 `ChangeUsecase`。
- 不创建泛化 `change_records`。
- 不把 `current` 客户资料写成 Product Core 规则。
- 不让 `WorkflowUsecase` 写库存、出货、财务、应收、应付、发票、收付款事实。
- `shipping_released != shipped`。
- `workflow task done != fact posted`。
- `business_records` 是兼容层、demo、seed、source snapshot、调研入口，不是长期事实真源。
- 客户专属资料应进入 `docs/customers/<customer-key>/`、客户配置草案、seed/demo、打印模板或导入适配；除非经过 Product Core 评审，否则不能上升为产品内核规则。
````

---

## 三、`docs/codex-goals/README.md` 完整中文内容

创建或替换这个文件：

```text
docs/codex-goals/README.md
```

完整复制下面内容：

````md
# Codex Goals 使用说明

本目录用于存放 Codex 的版本化任务文件。

## 为什么要有这个目录

Codex Goal 输入框有长度限制，而且每次新开 Codex 会话时，不能依赖上一次聊天记忆。

所以本项目采用：

```text
中文短 Goal
+ docs/codex-goals/<goal>.md
+ AGENTS.md
+ .codex-review/latest.md
```

的方式执行任务。

## 如何开启一个新的 Codex 会话

新会话中使用这种中文短 Goal：

```text
目标：执行 docs/codex-goals/<goal-file>.md。

请先阅读 AGENTS.md，然后严格执行任务文件。每次新会话都不能依赖历史聊天记忆，只能以仓库文件为准。

本轮允许和禁止修改的文件，以任务 md 为准。

完成后必须按 docs/codex-goals/_review-output-protocol.md 生成 .codex-review/latest.md。

用户应能用下面命令一键复制：

cat .codex-review/latest.md | pbcopy

不要要求用户截图。
```

把 `<goal-file>` 替换成实际任务文件名。

## 什么时候新开 Codex 会话

切换到新的编号 Goal 时，建议新开 Codex 会话。

例如：

```text
002 -> 003：新开会话
003 -> 004：新开会话
schema -> repo/usecase：新开会话
repo/usecase -> API/RBAC：新开会话
API/RBAC -> UI：新开会话
```

## 什么时候继续原 Codex 会话

同一个 Goal 内的补漏可以继续原会话。

例如：

```text
修复当前 Goal 的测试失败
补充当前 Goal 要求但遗漏的文件
修复 .codex-review/latest.md
修正当前 Goal 输出格式
```

## 每轮必须生成审查报告

每轮 Codex 任务完成后，必须生成：

```text
.codex-review/latest.md
```

审查报告格式必须遵守：

```text
docs/codex-goals/_review-output-protocol.md
```

用户应该可以用下面命令复制：

```bash
cat .codex-review/latest.md | pbcopy
```

不要要求用户截图。

## Goal 文件命名规则

使用数字前缀：

```text
000-phase0-foundation.md
001-overnight-phase1-masterdata-order-review.md
002-schema-design-final-review.md
003-v1-ent-schema-customers-suppliers-orders.md
004-v1-migration-and-ent-generate.md
005-v1-repo-usecase-masterdata.md
006-v1-repo-usecase-sales-order.md
007-v1-api-rbac-masterdata-order.md
008-v1-frontend-masterdata-order-pages.md
009-business-records-transition-audit.md
010-current-customer-data-import-draft.md
```

## Goal 文件建议结构

每个 goal 文件建议包含：

```text
任务名称
任务性质
背景
必须先读
允许修改的文件
禁止修改的文件
核心原则
验收命令
最终回复格式
审查报告输出要求
```

## 项目长期边界

所有 goal 文件都必须保留以下项目边界，除非经过单独评审：

- 不新增 `tenant_id`。
- 不实现 SaaS 多租户。
- 不实现 license server、套餐计费、客户工单系统。
- 不创建泛化 `ChangeUsecase`。
- 不创建泛化 `change_records`。
- 不把 `current` 客户资料写成 Product Core 规则。
- 不让 Workflow 写库存、出货、财务、应收、应付、发票、收付款事实。
- `shipping_released != shipped`。
- `workflow task done != fact posted`。
- `business_records` 是兼容层、demo、seed、source snapshot、调研入口，不是长期事实真源。

## 给 GPT 的复盘方式

Codex 完成后，用户只需要执行：

```bash
cat .codex-review/latest.md | pbcopy
```

然后把内容粘贴给 GPT。

不需要截图。
````

---

## 四、`docs/codex-goals/_review-output-protocol.md` 完整中文内容

创建或替换这个文件：

```text
docs/codex-goals/_review-output-protocol.md
```

完整复制下面内容：

````md
# Codex 审查报告输出协议

## 目的

每轮 Codex 完成后，必须生成一个用户可以直接复制给 GPT 审查的 Markdown 报告。

不要只在 Codex 聊天窗口里分散输出。  
不要要求用户截图。  
不要只给口头总结。  

## 必须生成的文件

必须创建或覆盖：

```text
.codex-review/latest.md
```

如果可以，也同时创建历史副本：

```text
.codex-review/runs/<goal-id>-<YYYYMMDD-HHMM>.md
```

其中 `<goal-id>` 使用当前任务文件名，例如：

```text
002-schema-design-final-review
003-v1-ent-schema-customers-suppliers-orders
```

如果 `.codex-review/runs/` 不存在，可以创建。

## Codex 最终必须告诉用户

Codex 最终回复必须告诉用户：

```bash
cat .codex-review/latest.md | pbcopy
```

用于一键复制审查报告。

也要告诉用户：

```bash
cat .codex-review/latest.md
```

用于查看报告。

不要要求用户截图。

## `.codex-review/latest.md` 模板

请按下面模板完整输出，不要省略标题。

```md
# Codex 审查报告

## 1. Goal 信息

- Goal 文件：
- Goal 名称：
- 运行时间：
- 任务类型：
- 是否修改运行时代码：是 / 否
- 是否修改 Ent schema：是 / 否
- 是否修改 migration：是 / 否
- 是否修改 API：是 / 否
- 是否修改 UI：是 / 否
- 是否修改 docs registry：是 / 否
- 是否修改 seedData：是 / 否

## 2. 完成摘要

简要说明本轮做了什么。

## 3. 新增 / 修改 / 删除文件

### 新增文件

列出新增文件。没有则写“无”。

### 修改文件

列出修改文件。没有则写“无”。

### 删除文件

列出删除文件。没有则写“无”。

## 4. Git 状态

命令：

```bash
git status --short
```

结果：

```text
<粘贴输出>
```

## 5. Diff 统计

命令：

```bash
git diff --stat
```

结果：

```text
<粘贴输出>
```

## 6. 未跟踪文件

命令：

```bash
git ls-files --others --exclude-standard
```

结果：

```text
<粘贴输出>
```

## 7. 禁止路径检查

必须检查这些路径是否被修改：

```text
server/internal/biz/workflow.go
server/internal/biz/rbac.go
server/internal/data
server/internal/data/model/schema
server/internal/core
web/src/erp/config/docs.mjs
web/src/erp/config/seedData.mjs
web/src/erp/pages
web/src/erp/mobile
migrations
server/deploy
scripts
```

输出表格：

| 路径 | 是否修改 | 说明 |
|---|---:|---|

## 8. tenant_id 检查

命令：

```bash
grep -R "tenant_id" docs/product docs/architecture docs/customers docs/reference config deployments || true
```

结果：

```text
<粘贴输出>
```

解释：

- 是否新增了 `tenant_id` 字段？
- 是否只出现在 imported notes、禁止说明、future SaaS 评审候选说明里？
- 是否进入了 schema draft、runtime 或 Ent schema？

## 9. Workflow / Fact 边界检查

命令：

```bash
grep -R "shipping_released" docs/product docs/architecture docs/customers docs/reference || true
```

结果：

```text
<粘贴输出>
```

解释：

- 是否仍然明确 `shipping_released != shipped`？
- 是否有任何文档把 `shipping_released` 写成已出库、已发货、已扣库存？
- 是否有任何内容让 Workflow 写 inventory、shipment、finance、AR/AP、invoice、payment facts？

## 10. 实现状态措辞检查

命令：

```bash
grep -R "Runtime Implemented: Yes\|Ent Schema Implemented: Yes\|Migration Implemented: Yes" docs/product docs/architecture || true
```

结果：

```text
<粘贴输出>
```

解释：

- 本轮是否把 draft / review 错写成 implemented？
- 如果没有，写“未发现问题”。

## 11. 测试命令与结果

列出实际运行的命令和结果。

### 前端测试

命令：

```bash
cd web && pnpm test
```

结果：

```text
<粘贴摘要>
```

### 后端测试

命令：

```bash
cd server && go test ./internal/biz ./internal/data
```

结果：

```text
<粘贴摘要>
```

### Diff 检查

命令：

```bash
git diff --check
```

结果：

```text
<粘贴摘要>
```

如果某个测试没有跑，必须写：

- 未跑命令：
- 未跑原因：
- 是否与本轮改动相关：

## 12. 关键决策

列出本轮产生的关键决策。

示例：

- V1 Go：
- Draft Only：
- Deferred：
- 明确禁止：

## 13. 风险

列出本轮仍然存在的风险。

每项格式：

```text
风险：
影响：
缓解措施：
下一步是否需要评审：
```

## 14. 下一轮建议 Codex Goal

写下一轮建议。

格式：

```text
建议下一轮 Goal：
建议 Goal 文件：
为什么：
下一轮禁止做：
```

## 15. 复制给 GPT 的摘要

请把本节作为用户可直接复制给 GPT 的摘要。

```text
【Codex 审查报告】

【Goal】
<goal 文件和 goal 名称>

【完成摘要】
<completion summary>

【新增文件】
<added files>

【修改文件】
<modified files>

【git status --short】
<output>

【git diff --stat】
<output>

【untracked files】
<output>

【测试命令与结果】
<test output summary>

【tenant_id 检查】
<explanation>

【Workflow / Fact 检查】
<explanation>

【禁止路径检查】
<explanation>

【关键决策】
<decisions>

【风险】
<risks>

【下一轮 Codex 建议】
<next goal>
```
```

## Codex 最终回复要求

Codex 最终回复必须包含：

1. `.codex-review/latest.md` 已生成。
2. 如果生成了历史副本，列出历史副本路径。
3. 给出 Mac 一键复制命令：

```bash
cat .codex-review/latest.md | pbcopy
```

4. 给出普通查看命令：

```bash
cat .codex-review/latest.md
```

5. 不要要求用户截图。
````

---

## 五、可选：全局 `~/.codex/AGENTS.md` 中文内容

这个是**全局个人偏好**，不是项目业务规则。建议你自己手动创建。

### 一键创建命令

复制到终端执行：

````bash
mkdir -p ~/.codex
cat > ~/.codex/AGENTS.md <<'EOF'
# 全局 Codex 使用约定

## 语言

- 如果项目或用户使用中文，Codex Goal 和审查摘要优先使用中文。
- Codex Goal 输入框保持 4000 字以内。
- 复杂任务细节应写入仓库内任务文件，不要塞进长聊天提示词。

## 会话工作流

- 新的独立 Goal 建议新开 Codex 会话。
- 同一个 Goal 内的补漏、测试失败修复、生成审查报告，可以继续原 Codex 会话。
- 新会话不能依赖历史聊天记忆。
- 如果仓库里有 AGENTS.md，必须先阅读仓库的 AGENTS.md。
- 然后阅读用户指定的任务文件，通常在 docs/codex-goals/*.md。

## 审查报告

- 如果仓库定义了审查报告协议，每个 Codex 任务完成后都应生成可复制的 Markdown 审查报告。
- 默认最新报告路径为：

.codex-review/latest.md

- 用户应能用下面命令复制：

cat .codex-review/latest.md | pbcopy

- 能生成 Markdown 报告时，不要要求用户截图。

## 修改纪律

- 必须遵守任务文件里的允许修改文件和禁止修改文件。
- 不要擅自扩大范围。
- 如果测试失败，先报告失败命令和关键日志，不要乱改无关文件。
- 优先做小而可审查的改动，避免一次性不可审查的大改动。

## 文档输出风格

- 当用户要求提供任务文件时，输出完整可复制的 Markdown 代码块。
- 不要给半渲染、半代码块的割裂内容。
EOF
````

---

## 六、以后新开 Codex 会话固定短 Goal 模板

以后你每次手动新开 Codex 会话，就复制这个模板：

```text
目标：执行 docs/codex-goals/<goal-file>.md。

请先阅读 AGENTS.md，然后严格执行任务文件。每次新会话都不能依赖历史聊天记忆，只能以仓库文件为准。

本轮允许和禁止修改的文件，以任务 md 为准。

必须遵守：
- 不新增 tenant_id。
- 不实现 SaaS 多租户。
- 不实现 license server、套餐计费、客户工单系统。
- 不创建泛化 ChangeUsecase 或 change_records。
- 不把 current 客户资料写成 Product Core。
- 不混淆 Workflow / Fact。
- shipping_released != shipped。
- business_records 只是兼容层、demo、seed、source snapshot，不是长期事实真源。

完成后必须按 docs/codex-goals/_review-output-protocol.md 生成 .codex-review/latest.md。

用户应能用下面命令一键复制：

cat .codex-review/latest.md | pbcopy

不要要求用户截图。
```

把 `<goal-file>` 换成实际文件名。

---

## 七、最终建议

你现在应该这样处理：

```text
1. 手动创建或确认 ~/.codex/AGENTS.md。
2. 确认 docs/codex-goals/_review-output-protocol.md 存在。
3. 用上面的中文短 Goal 让 Codex 更新仓库 AGENTS.md 和 docs/codex-goals/README.md。
4. 后续每次新开 Codex 会话，只贴中文短 Goal。
5. Codex 跑完后复制 .codex-review/latest.md 给我，不再截图。
```

仓库级 `AGENTS.md` 必须写，因为它保存 plush-toy-erp 的项目边界。  
全局 `~/.codex/AGENTS.md` 建议写，但只保存你的个人偏好。

### 043. user

_time `2026-05-30T19:02:27+08:00` · content_type `text` · node `8dc03f50-1362-48c0-ab79-55a93542cc23`_

这个模板要不要创建个文件写进去

### 044. assistant

_time `2026-05-30T19:04:01+08:00` · content_type `text` · node `adb7e2e4-c298-4392-896b-2dd377ca74d5`_

要，**建议单独创建一个模板文件**。这个模板不是某一轮任务，而是你以后每次新开 Codex 会话都要复制的“启动模板”，所以不要只放在聊天里，也不要只放在 README 里。

建议创建：

```text
docs/codex-goals/_new-session-goal-template.md
```

它和已有文件分工如下：

```text
docs/codex-goals/_new-session-goal-template.md
  每次新开 Codex 会话时复制的中文短 Goal 模板。

docs/codex-goals/_review-output-protocol.md
  每轮完成后生成 .codex-review/latest.md 的报告格式。

docs/codex-goals/README.md
  说明怎么使用 Codex Goals。

AGENTS.md
  项目级强制规则，引用上面两个模板。
```

这样做更稳，因为你的项目长期边界很重要：一套产品内核、多客户配置包、受控客户差异，不能每次靠聊天记忆；状态层也必须长期守住 Workflow、单据生命周期、业务事实、派生状态分层，尤其 `shipping_released != shipped`。fileciteturn2file0 fileciteturn2file1

---

## 一、给 Codex 的中文短 Goal

如果你想让 Codex 帮你创建这个模板文件，复制下面这段：

```text
目标：创建 Codex 新会话短 Goal 模板文件。

请先阅读 AGENTS.md。本轮只允许新增或修改 docs/codex-goals/_new-session-goal-template.md，并可选小幅更新 docs/codex-goals/README.md 和 AGENTS.md 中对该模板的引用。

禁止修改运行时代码、Ent schema、migration、API、UI、docs registry、seedData、workflow.go、rbac.go、server/internal/data、server/internal/core。

请创建 docs/codex-goals/_new-session-goal-template.md，用于保存“每次新开 Codex 会话时复制的中文短 Goal 模板”。

模板必须包含：
1. 让 Codex 先读 AGENTS.md。
2. 让 Codex 再读 docs/codex-goals/<goal-file>.md。
3. 说明新会话不能依赖历史聊天记忆。
4. 说明允许和禁止修改范围以任务 md 为准。
5. 固定项目边界：不新增 tenant_id、不做 SaaS、多租户、license server、套餐计费、客户工单系统、ChangeUsecase、change_records。
6. 固定业务边界：current 客户资料不等于 Product Core，Workflow 不写 Fact，shipping_released != shipped，business_records 不是长期事实真源。
7. 完成后必须按 docs/codex-goals/_review-output-protocol.md 生成 .codex-review/latest.md。
8. 用户应能用 cat .codex-review/latest.md | pbcopy 一键复制。
9. 不要要求用户截图。

验收命令：
- git status --short
- git diff --stat
- test -f docs/codex-goals/_new-session-goal-template.md
- grep -n "目标：执行 docs/codex-goals" docs/codex-goals/_new-session-goal-template.md
- git diff --check

完成后生成 .codex-review/latest.md，并告诉我可以用：

cat .codex-review/latest.md | pbcopy

复制结果。
```

---

## 二、`docs/codex-goals/_new-session-goal-template.md` 完整内容

如果你想自己手动创建，直接把下面整段复制进去：

````md
# Codex 新会话短 Goal 模板

## 用途

每次手动新开 Codex 会话时，复制本文件里的短 Goal 模板。

不要在 Codex Goal 输入框里粘贴超长任务说明。  
复杂任务必须写入：

```text
docs/codex-goals/<goal-file>.md
```

Codex 新会话不能依赖历史聊天记忆，只能以仓库文件为准。

---

## 固定短 Goal 模板

复制下面内容到 Codex Goal 输入框，并把 `<goal-file>` 替换为实际任务文件名。

```text
目标：执行 docs/codex-goals/<goal-file>.md。

请先阅读 AGENTS.md，然后严格执行任务文件。每次新会话都不能依赖历史聊天记忆，只能以仓库文件为准。

本轮允许和禁止修改的文件，以任务 md 为准。

必须遵守：
- 不新增 tenant_id。
- 不实现 SaaS 多租户。
- 不实现 license server、套餐计费、客户工单系统。
- 不创建泛化 ChangeUsecase 或 change_records。
- 不把 current 客户资料写成 Product Core。
- 不混淆 Workflow / Fact。
- Workflow task done != Fact posted。
- shipping_released != shipped。
- business_records 只是兼容层、demo、seed、source snapshot、调研入口，不是长期事实真源。

完成后必须按 docs/codex-goals/_review-output-protocol.md 生成：

.codex-review/latest.md

用户应能用下面命令一键复制：

cat .codex-review/latest.md | pbcopy

不要要求用户截图。
```

---

## 示例

如果下一轮任务文件是：

```text
docs/codex-goals/003-v1-ent-schema-customers-suppliers-orders.md
```

则复制给 Codex 的 Goal 是：

```text
目标：执行 docs/codex-goals/003-v1-ent-schema-customers-suppliers-orders.md。

请先阅读 AGENTS.md，然后严格执行任务文件。每次新会话都不能依赖历史聊天记忆，只能以仓库文件为准。

本轮允许和禁止修改的文件，以任务 md 为准。

必须遵守：
- 不新增 tenant_id。
- 不实现 SaaS 多租户。
- 不实现 license server、套餐计费、客户工单系统。
- 不创建泛化 ChangeUsecase 或 change_records。
- 不把 current 客户资料写成 Product Core。
- 不混淆 Workflow / Fact。
- Workflow task done != Fact posted。
- shipping_released != shipped。
- business_records 只是兼容层、demo、seed、source snapshot、调研入口，不是长期事实真源。

完成后必须按 docs/codex-goals/_review-output-protocol.md 生成：

.codex-review/latest.md

用户应能用下面命令一键复制：

cat .codex-review/latest.md | pbcopy

不要要求用户截图。
```

---

## 什么时候新开 Codex 会话

建议新开会话：

```text
002 -> 003
003 -> 004
schema -> repo/usecase
repo/usecase -> API/RBAC
API/RBAC -> UI
docs-only -> schema implementation
```

也就是：

```text
换 Goal，就新开 Codex 会话。
```

---

## 什么时候继续原 Codex 会话

可以继续原会话：

```text
修复当前 Goal 的测试失败
补当前 Goal 要求但遗漏的文件
修复 .codex-review/latest.md
修正当前 Goal 输出格式
补跑当前 Goal 的验收命令
```

也就是：

```text
同一个 Goal 内补漏，继续原会话。
```

---

## 注意事项

1. 新会话不能假设 Codex 记得上一轮内容。
2. 长期规则必须写进仓库文件。
3. 任务范围必须以 `docs/codex-goals/<goal-file>.md` 为准。
4. 审查报告必须生成 `.codex-review/latest.md`。
5. 不要让用户截图。
6. 用户复制报告给 GPT 的命令是：

```bash
cat .codex-review/latest.md | pbcopy
```
````

---

## 三、建议在 `docs/codex-goals/README.md` 里加一小段

如果你已经有 `docs/codex-goals/README.md`，可以追加这段：

```md
## 新会话短 Goal 模板

每次手动新开 Codex 会话时，使用：

```text
docs/codex-goals/_new-session-goal-template.md
```

该文件保存固定中文短 Goal 模板。

使用方式：

1. 打开 `_new-session-goal-template.md`。
2. 复制“固定短 Goal 模板”。
3. 把 `<goal-file>` 替换成实际任务文件名。
4. 粘贴到 Codex Goal 输入框。
5. Codex 完成后复制 `.codex-review/latest.md` 给 GPT。

复制审查报告：

```bash
cat .codex-review/latest.md | pbcopy
```
```

---

## 四、建议在 `AGENTS.md` 里加一小段引用

如果你已经准备让 Codex 更新 `AGENTS.md`，加这段即可：

```md
### 新会话短 Goal 模板

每次新开 Codex 会话时，用户应使用：

```text
docs/codex-goals/_new-session-goal-template.md
```

该模板用于生成 4000 字以内中文短 Goal。

复杂任务要求写入：

```text
docs/codex-goals/<goal-file>.md
```

Codex 新会话必须先阅读 `AGENTS.md`，再阅读用户指定的 goal 文件。

每轮完成后必须按以下协议生成 `.codex-review/latest.md`：

```text
docs/codex-goals/_review-output-protocol.md
```

用户应能用下面命令复制报告：

```bash
cat .codex-review/latest.md | pbcopy
```

不要要求用户截图。
```

---

## 最终建议

**要创建文件。**

推荐你现在创建：

```text
docs/codex-goals/_new-session-goal-template.md
```

然后在：

```text
docs/codex-goals/README.md
AGENTS.md
```

里引用它。

以后你每次新开 Codex 会话，只需要打开这个模板文件，替换 `<goal-file>`，复制到 Codex Goal 输入框即可。

### 045. user

_time `2026-05-30T19:12:04+08:00` · content_type `text` · node `49245c3a-9d32-4cf3-a472-cc2eed4973c1`_

是不是以后我如果新开gpt会话，就上传new session template和template就好了

### 046. assistant

_time `2026-05-30T19:13:24+08:00` · content_type `text` · node `d229577d-35a1-44b8-8cad-864ff8b15f2e`_

不是只上传 `new session template` 和 `review output template` 就够。

这两个文件只是**工作流模板**，告诉我“怎么给 Codex 写 Goal、Codex 怎么输出报告”。它们不能告诉我当前项目已经做到哪一步、Codex 刚改了什么、下一步应该做什么。

以后你新开 GPT 会话，按用途分三种情况。

---

## 1. 只是让我继续给你写 Codex Goal

最少给我这 3 个内容就够：

```text
1. .codex-review/latest.md
2. docs/codex-goals/_new-session-goal-template.md
3. docs/codex-goals/_review-output-protocol.md
```

其中最重要的是：

```text
.codex-review/latest.md
```

因为它告诉我：

```text
上一轮做了什么
改了哪些文件
测试有没有通过
有没有越界
下一轮 Codex 建议是什么
```

`_new-session-goal-template.md` 和 `_review-output-protocol.md` 是格式规则，不是项目进度。

---

## 2. 让我审查 Codex 这一轮是否合格，并给下一轮 Goal

推荐上传或粘贴：

```text
必须：
.codex-review/latest.md

最好同时给：
docs/codex-goals/<上一轮 goal 文件>.md
docs/codex-goals/<Codex 建议的下一轮 goal 文件，如果已经有>
```

通常不用上传完整源码。

我看完 `.codex-review/latest.md` 就可以判断：

```text
是否误加 tenant_id
是否误把 current 当 SaaS tenant
是否混淆 Workflow / Fact
是否把 current 客户资料写成 Product Core
是否改了禁止路径
测试是否足够
下一轮 Goal 怎么写
```

---

## 3. 让我重新完整理解项目现状

这种情况才需要上传更多文件：

```text
AGENTS.md
docs/current-source-of-truth.md
progress.md
.codex-review/latest.md
docs/product/*
docs/architecture/*
docs/codex-goals/*
```

如果是阶段结束，例如 Phase 0 / Phase 1 / Phase 2 全部完成，也可以上传一个 review bundle 或源码 zip。

但平时不需要每次上传完整代码。

---

## 最推荐的新 GPT 会话输入包

以后你新开 GPT 会话，最省事的方式是上传或粘贴这个组合：

```text
必传：
.codex-review/latest.md

可选：
docs/codex-goals/_new-session-goal-template.md
docs/codex-goals/_review-output-protocol.md
docs/codex-goals/README.md
```

然后你对我说：

```text
这是上轮 Codex 审查报告，请判断是否合格，并给我下一轮中文短 Goal 和完整可复制 md。
```

这样就够了。

---

## 但我建议再加一个 GPT 交接模板文件

可以创建：

```text
docs/codex-goals/_gpt-handoff-template.md
```

这个文件专门告诉你：新开 GPT 会话时要给我什么。

以后你就不用问了，打开这个文件照着贴。

---

## 给 Codex 的中文短 Goal

你可以让 Codex 创建这个文件：

```text
目标：创建 GPT 新会话交接模板。

请先阅读 AGENTS.md。本轮只允许新增或修改 docs/codex-goals/_gpt-handoff-template.md，并可选小幅更新 docs/codex-goals/README.md 中对该文件的引用。

禁止修改运行时代码、Ent schema、migration、API、UI、docs registry、seedData、workflow.go、rbac.go、server/internal/data、server/internal/core。

请创建 docs/codex-goals/_gpt-handoff-template.md，用于说明用户新开 GPT 会话时应该提供哪些文件或内容。

模板必须说明：
1. 新 GPT 会话不会自动记得旧会话。
2. 最重要的是提供 .codex-review/latest.md。
3. 如果只是让 GPT 判断下一轮 Codex Goal，通常不需要上传源码。
4. 如果要让 GPT 重新审查项目阶段状态，才上传 review bundle 或源码 zip。
5. _new-session-goal-template.md 和 _review-output-protocol.md 是工作流模板，不是项目状态。
6. 新 GPT 会话推荐粘贴的固定说明。
7. 不要要求用户截图，优先复制 .codex-review/latest.md 内容。

验收命令：
- git status --short
- git diff --stat
- test -f docs/codex-goals/_gpt-handoff-template.md
- git diff --check

完成后生成 .codex-review/latest.md，并告诉我可以用：

cat .codex-review/latest.md | pbcopy

复制结果。
```

---

## `docs/codex-goals/_gpt-handoff-template.md` 完整内容

你也可以手动创建，直接复制下面这一整段：

````md
# GPT 新会话交接模板

## 用途

当用户新开 GPT 会话，希望 GPT 继续帮助审查 Codex 输出、生成下一轮 Codex Goal、判断项目路线时，使用本模板。

新 GPT 会话不会自动记得旧会话内容。  
因此必须提供当前状态材料。  
不要用截图代替可复制文本。  

---

## 最重要的材料

每次新开 GPT 会话，最推荐提供：

```text
.codex-review/latest.md
```

这是上一轮 Codex 的审查报告，里面应该包含：

- Goal 信息
- 完成摘要
- 新增文件
- 修改文件
- git status
- git diff stat
- untracked files
- tenant_id 检查
- Workflow / Fact 检查
- 禁止路径检查
- 测试命令与结果
- 风险
- 下一轮 Codex 建议

复制命令：

```bash
cat .codex-review/latest.md | pbcopy
```

然后粘贴给 GPT。

---

## 只让 GPT 给下一轮 Codex Goal 时

通常提供这些就够：

```text
.codex-review/latest.md
docs/codex-goals/_new-session-goal-template.md
docs/codex-goals/_review-output-protocol.md
```

其中：

```text
.codex-review/latest.md
```

是项目状态。

```text
_new-session-goal-template.md
_review-output-protocol.md
```

是工作流模板。

如果 GPT 已经知道固定格式，只粘贴 `.codex-review/latest.md` 也可以。

---

## 让 GPT 审查某一轮 Codex 是否合格时

推荐提供：

```text
.codex-review/latest.md
docs/codex-goals/<上一轮 goal 文件>.md
```

例如：

```text
.codex-review/latest.md
docs/codex-goals/002-schema-design-final-review.md
```

GPT 会重点检查：

- 是否改了禁止路径
- 是否误加 tenant_id
- 是否误做 SaaS 多租户
- 是否把 current 客户资料写成 Product Core
- 是否混淆 Workflow / Fact
- 是否把 shipping_released 写成 shipped
- 是否把 business_records 当事实真源
- 测试是否足够
- 下一轮 Goal 是否合理

---

## 让 GPT 重新理解整个项目时

如果是阶段结束、目录大重构、schema 即将落地、或需要重新完整评审项目状态，提供更多材料：

```text
AGENTS.md
docs/current-source-of-truth.md
progress.md
.codex-review/latest.md
docs/product/*
docs/architecture/*
docs/codex-goals/*
```

也可以上传 review bundle 或源码 zip。

但平时不需要每轮上传完整源码。

---

## 新 GPT 会话推荐开场白

复制下面内容给 GPT：

```text
这是 plush-toy-erp 项目的新 GPT 会话。请基于我粘贴的 .codex-review/latest.md 继续分析。

当前项目长期边界：
- 不新增 tenant_id。
- 当前不做 SaaS 多租户。
- current 是第一个真实客户 / 私有化客户实例 / 配置包来源，不是 runtime tenant。
- 不做 license server、套餐计费、客户工单系统。
- 不创建泛化 ChangeUsecase 或 change_records。
- 不把 current 客户资料写成 Product Core。
- 不混淆 Workflow / Fact。
- Workflow task done != Fact posted。
- shipping_released != shipped。
- business_records 是兼容层、demo、seed、source snapshot、调研入口，不是长期事实真源。

请你做：
1. 判断这轮 Codex 是否合格。
2. 检查是否违反项目边界。
3. 判断是否需要回滚或补修。
4. 给我下一轮中文短 Codex Goal。
5. 给我下一轮完整可复制的 docs/codex-goals/<goal>.md 内容。
```

然后粘贴：

```text
.codex-review/latest.md
```

---

## 新 GPT 会话不需要每次上传的内容

通常不需要每次上传：

```text
完整源码 zip
所有客户样本 Excel/PDF
全部 docs
全部 server/internal
全部 web/src
```

除非 GPT 明确需要重新完整审查源码，或者阶段结束要做总审。

---

## 文件类型说明

### `.codex-review/latest.md`

项目当前状态和上轮 Codex 结果。  
最重要。

### `_new-session-goal-template.md`

给 Codex 新会话用的短 Goal 模板。  
是工作流模板，不是项目状态。

### `_review-output-protocol.md`

规定 Codex 怎么生成审查报告。  
是输出协议，不是项目状态。

### `AGENTS.md`

项目长期规则。  
如果 GPT 不知道项目背景，可以一起提供。

### `docs/current-source-of-truth.md`

当前项目真源入口。  
如果 GPT 要做架构判断，可以一起提供。

---

## 最小交接包

最小：

```text
.codex-review/latest.md
```

标准：

```text
.codex-review/latest.md
docs/codex-goals/<上一轮 goal 文件>.md
```

完整：

```text
AGENTS.md
docs/current-source-of-truth.md
progress.md
.codex-review/latest.md
docs/product/*
docs/architecture/*
docs/codex-goals/*
```

---

## 结论

新 GPT 会话时，不是只上传：

```text
_new-session-goal-template.md
_review-output-protocol.md
```

这两个只是格式模板。

真正必须给 GPT 的是：

```text
.codex-review/latest.md
```

如果要 GPT 继续给下一轮 Codex Goal，推荐再给：

```text
docs/codex-goals/<上一轮 goal 文件>.md
```

如果只是让 GPT 按固定格式输出下一轮 Goal，再补：

```text
docs/codex-goals/_new-session-goal-template.md
docs/codex-goals/_review-output-protocol.md
```
````

---

## 最终回答

所以你的问题：

> 是不是以后我如果新开 GPT 会话，就上传 new session template 和 template 就好了？

答案是：

**不完全是。**

你新开 GPT 会话最应该给的是：

```text
.codex-review/latest.md
```

`new session template` 和 `review output protocol template` 只是格式规则，可以辅助，但不能代替项目进度。

最稳的组合是：

```text
.codex-review/latest.md
docs/codex-goals/_new-session-goal-template.md
docs/codex-goals/_review-output-protocol.md
```

如果是让我审查上一轮并写下一轮，还建议附上：

```text
docs/codex-goals/<上一轮 goal 文件>.md
```

这样你就不需要截图，也不需要每次上传完整代码。

### 047. user

_time `2026-05-30T19:15:26+08:00` · content_type `multimodal_text` · node `d6d51c88-7213-4233-963b-1896269df646`_

[非文本内容]

```json
{
  "asset_pointer": "sediment://file_00000000da5c720690ac220a051811cb",
  "content_type": "image_asset_pointer",
  "fovea": null,
  "height": 138,
  "metadata": {
    "asset_pointer_link": null,
    "container_pixel_height": null,
    "container_pixel_width": null,
    "dalle": null,
    "emu_omit_glimpse_image": null,
    "emu_patches_override": null,
    "generation": null,
    "gizmo": null,
    "is_no_auth_placeholder": null,
    "lpe_delta_encoding_channel": null,
    "lpe_keep_patch_ijhw": null,
    "sanitized": true,
    "watermarked_asset_pointer": null
  },
  "size_bytes": 19727,
  "width": 758
}
```

为什么多了一个md，不只是latest md

### 048. assistant

_time `2026-05-30T19:16:47+08:00` · content_type `text` · node `9389bded-bb39-4f10-add6-a6060429456c`_

因为我之前给你的 `_review-output-protocol.md` 里写了两层输出：

```text
必须生成：
.codex-review/latest.md

如果可以，也同时创建历史副本：
.codex-review/runs/<goal-id>-<YYYYMMDD-HHMM>.md
```

所以 Codex 生成了两个文件：

```text
.codex-review/latest.md
.codex-review/runs/inline-agents-codex-workflow-20260530-1901.md
```

它们的区别是：

```text
latest.md
  每轮覆盖，永远是最新一次审查报告。
  你复制给 GPT 时只用这个。

runs/*.md
  历史归档，不覆盖。
  用来回看以前某一轮 Codex 做了什么。
```

如果你觉得多余，**可以不要 runs 历史副本**。我建议你当前阶段先简单一点：**只保留 latest.md**，不生成 runs。因为你本来就会把 Codex 输出贴给我审查，历史归档不是刚需。

---

## 现在这个多出来的文件能不能删

可以删：

```bash
rm .codex-review/runs/inline-agents-codex-workflow-20260530-1901.md
```

如果 `runs` 目录空了，也可以删：

```bash
rmdir .codex-review/runs
```

以后只保留：

```text
.codex-review/latest.md
```

---

## 建议修改规则：以后只生成 latest.md

让 Codex 改这两个文件：

```text
docs/codex-goals/_review-output-protocol.md
docs/codex-goals/README.md
```

如果 `AGENTS.md` 里也写了 runs 历史副本，也一起改。

---

## 给 Codex 的中文短 Goal

复制给 Codex：

```text
目标：简化 Codex 审查报告输出，只保留 .codex-review/latest.md。

请先阅读 AGENTS.md。本轮只允许修改 docs/codex-goals/_review-output-protocol.md、docs/codex-goals/README.md，以及 AGENTS.md 中与 Codex 审查报告输出相关的小段落。

目标：
1. 以后每轮只必须生成 .codex-review/latest.md。
2. 不再要求生成 .codex-review/runs/<goal-id>-<timestamp>.md 历史副本。
3. 文档中删除或改写“如果可以，也同时创建历史副本”的说法。
4. 保留用户复制命令：cat .codex-review/latest.md | pbcopy。
5. 继续要求不要截图。
6. 如果当前 .codex-review/runs 目录存在，不要删除用户本地文件，只更新规则文档。

禁止：
- 不改运行时代码。
- 不改 Ent schema。
- 不新增 migration。
- 不改 API。
- 不改 UI。
- 不改 docs registry。
- 不改 seedData。
- 不改 workflow.go。
- 不改 rbac.go。
- 不改 server/internal/data。
- 不新增 tenant_id。
- 不实现 SaaS 多租户。

验收命令：
- git status --short
- git diff --stat
- grep -R "runs/<goal-id>" AGENTS.md docs/codex-goals || true
- grep -R "历史副本" AGENTS.md docs/codex-goals || true
- grep -R ".codex-review/latest.md" AGENTS.md docs/codex-goals
- git diff --check

完成后生成 .codex-review/latest.md，并告诉我可以用：

cat .codex-review/latest.md | pbcopy

复制结果。
```

---

## 建议你把规则改成这样

以后固定为：

```text
Codex 每轮只生成：
.codex-review/latest.md

不生成：
.codex-review/runs/*.md
```

这样最简单。你只需要复制：

```bash
cat .codex-review/latest.md | pbcopy
```

然后贴给我，不会再多出一堆 md。

### 049. user

_time `2026-05-30T19:18:21+08:00` · content_type `multimodal_text` · node `83959179-9fd9-47f5-b210-3209748639ce`_

[非文本内容]

```json
{
  "asset_pointer": "sediment://file_00000000f018720693af786c35a45ab6",
  "content_type": "image_asset_pointer",
  "fovea": null,
  "height": 1780,
  "metadata": {
    "asset_pointer_link": null,
    "container_pixel_height": null,
    "container_pixel_width": null,
    "dalle": null,
    "emu_omit_glimpse_image": null,
    "emu_patches_override": null,
    "generation": null,
    "gizmo": null,
    "is_no_auth_placeholder": null,
    "lpe_delta_encoding_channel": null,
    "lpe_keep_patch_ijhw": null,
    "sanitized": true,
    "watermarked_asset_pointer": null
  },
  "size_bytes": 376237,
  "width": 1764
}
```

[非文本内容]

```json
{
  "asset_pointer": "sediment://file_000000003f0472098bf8b7786c8b7c17",
  "content_type": "image_asset_pointer",
  "fovea": null,
  "height": 1688,
  "metadata": {
    "asset_pointer_link": null,
    "container_pixel_height": null,
    "container_pixel_width": null,
    "dalle": null,
    "emu_omit_glimpse_image": null,
    "emu_patches_override": null,
    "generation": null,
    "gizmo": null,
    "is_no_auth_placeholder": null,
    "lpe_delta_encoding_channel": null,
    "lpe_keep_patch_ijhw": null,
    "sanitized": true,
    "watermarked_asset_pointer": null
  },
  "size_bytes": 386124,
  "width": 1684
}
```

[非文本内容]

```json
{
  "asset_pointer": "sediment://file_00000000e874720984ff6c7edc18c714",
  "content_type": "image_asset_pointer",
  "fovea": null,
  "height": 1032,
  "metadata": {
    "asset_pointer_link": null,
    "container_pixel_height": null,
    "container_pixel_width": null,
    "dalle": null,
    "emu_omit_glimpse_image": null,
    "emu_patches_override": null,
    "generation": null,
    "gizmo": null,
    "is_no_auth_placeholder": null,
    "lpe_delta_encoding_channel": null,
    "lpe_keep_patch_ijhw": null,
    "sanitized": true,
    "watermarked_asset_pointer": null
  },
  "size_bytes": 107316,
  "width": 1830
}
```

你觉得呢

### 050. assistant

_time `2026-05-30T19:20:27+08:00` · content_type `text` · node `1d6e933e-ee00-41ee-b8cd-8aa824396ee0`_

我同意截图里的判断：**测试规则要加，但不要把 AGENTS.md 写成“所有测试命令大全”。**

最合理的分工是：

```text
AGENTS.md
  写测试原则、测试分层、每轮必须说明为什么选这些测试。

docs/codex-goals/_new-session-goal-template.md
  写新会话固定要求：本轮必须选择测试层级。

每个具体 docs/codex-goals/<goal>.md
  写本轮实际要跑哪些命令。

docs/codex-goals/_review-output-protocol.md
  要求 Codex 在 .codex-review/latest.md 里记录：
  跑了什么、没跑什么、为什么没跑。
```

原因是：你这个 ERP 项目的核心边界很多，尤其 Workflow / Fact、库存、出货、财务不能混。测试不能靠“默认全跑”解决，也不能只跑 `git diff --check` 就算过。状态分层文档明确要求 Workflow、单据生命周期、业务事实、派生状态要分开，`shipping_released` 不能当 `shipped`；产品化配置文档也强调核心事实规则和客户配置边界要受控。fileciteturn2file1turn2file0

---

## 我的建议

### 1. AGENTS.md 写“原则”

AGENTS.md 里写：

```text
每轮必须按改动影响面选择测试层级。
不能机械全跑。
也不能只跑最轻检查。
```

### 2. Goal md 写“本轮具体命令”

例如 docs-only：

```bash
git status --short
git diff --stat
git diff --check
grep ...
cd web && pnpm test
```

例如 Ent schema：

```bash
cd server && make data
cd server && make migrate_status
cd server && go test ./internal/data ./internal/biz
```

### 3. review 报告写“选择理由”

`.codex-review/latest.md` 必须写：

```text
本轮选择的测试层级：
未选择的测试层级：
未选择原因：
是否与本轮改动相关：
```

这样你给我看报告时，我可以判断 Codex 有没有偷懒。

---

# 给 Codex 的中文短 Goal

复制给 Codex：

```text
目标：补充 Codex 测试分层规则。

请先阅读 AGENTS.md。本轮只允许修改 AGENTS.md、docs/codex-goals/README.md、docs/codex-goals/_new-session-goal-template.md、docs/codex-goals/_review-output-protocol.md 中与测试分层和审查报告相关的小段落。

目标：
1. AGENTS.md 只写测试原则，不塞满所有具体命令。
2. _new-session-goal-template.md 增加“本轮必须选择测试层级”的要求。
3. _review-output-protocol.md 增加“测试层级选择、未跑测试及原因”的报告字段。
4. docs/codex-goals/README.md 说明具体测试命令应写在每个 goal md 里。
5. 保留现有项目边界：不新增 tenant_id、不做 SaaS、不混淆 Workflow / Fact、shipping_released != shipped。

禁止：
- 不改运行时代码。
- 不改 Ent schema。
- 不新增 migration。
- 不改 API。
- 不改 UI。
- 不改 docs registry。
- 不改 seedData。
- 不改 workflow.go。
- 不改 rbac.go。
- 不改 server/internal/data。
- 不改 server/internal/core。

验收命令：
- git status --short
- git diff --stat
- grep -n "测试分层" AGENTS.md docs/codex-goals/_new-session-goal-template.md docs/codex-goals/_review-output-protocol.md docs/codex-goals/README.md
- grep -n "未选择的测试层级" docs/codex-goals/_review-output-protocol.md
- git diff --check

完成后生成 .codex-review/latest.md，并告诉我可以用：

cat .codex-review/latest.md | pbcopy

复制结果。
```

---

# 建议追加到 AGENTS.md 的中文内容

````md
## 测试分层原则

Codex 每轮必须按本轮改动影响面选择测试层级。

不要机械全跑所有测试。  
不要只跑最轻检查就认为足够。  
不要把测试选择只依赖 `AGENTS.md`。  

`AGENTS.md` 只定义原则。  
每个具体 `docs/codex-goals/<goal>.md` 必须写清本轮实际验收命令。  
`.codex-review/latest.md` 必须记录本轮选择了哪些测试层级、未选择哪些测试层级、未选择原因。

### 测试层级

- 静态检查：格式、lint、类型、`git diff --check`。适合所有改动。
- 单元测试：验证单个函数、helper、usecase、repo 的边界。适合核心逻辑改动。
- 集成测试：验证 API / usecase / repo / DB / 权限等跨层链路。适合服务端、RBAC、数据层改动。
- 冒烟测试：快速确认主路径能启动、页面能打开、核心入口没炸。适合部署、配置、入口调整。
- 回归测试：验证本轮相关旧行为没有被破坏。适合修改共享组件、状态机、字段映射、样式布局、核心 helper。
- E2E 测试：用真实浏览器或真实接口跑完整用户路径。适合 UI 流程、登录、表单提交、跨页面业务链路。
- 视觉 / 样式回归：检查默认态、交互态、恢复态、响应式和盒模型。适合样式、布局、主题、组件库改动。

### 基础命令

所有轮次至少应考虑：

```bash
git status --short
git diff --stat
git diff --check
```

### 按改动类型补充

- 文档 only：通常补 `grep` / `rg` 检查关键边界词，不强制跑前后端全量测试，除非改了 docs registry 或前端文档入口。
- 前端配置 / docs registry / seed：补 `cd web && pnpm lint && pnpm test`。
- 前端 UI / 样式 / 布局：补 `cd web && pnpm lint && pnpm css && pnpm test && pnpm style:l1`。
- 后端 biz / usecase / repo：补 `cd server && go test ./internal/biz ./internal/data` 或更窄 package 测试。
- Ent schema / migration：补 `cd server && make data && make migrate_status`，并确认 DB 环境。
- API / RBAC：补后端 usecase / data 测试，并检查权限码、菜单权限、动作权限、后端校验。
- 错误码：补 `bash scripts/qa/error-code-sync.sh` 和 `bash scripts/qa/error-codes.sh`。
- 发布 / 部署：补对应 `scripts/qa/*`、构建、冒烟、回滚检查。

### 每轮必须说明

每轮 Codex 输出必须说明：

```text
本轮选择的测试层级：
本轮实际运行的命令：
未选择的测试层级：
未选择原因：
测试失败是否与本轮改动相关：
```

如果测试失败，Codex 必须先报告失败命令和关键日志，不得为了通过测试乱改无关文件。
````

---

# 建议追加到 `_new-session-goal-template.md` 的中文内容

````md
## 测试分层选择要求

每次执行 Goal 时，Codex 必须根据本轮改动影响面选择测试层级。

不要机械全跑。  
不要只跑最轻检查。  
具体命令以本轮 `docs/codex-goals/<goal-file>.md` 为准。

本轮完成后，`.codex-review/latest.md` 必须说明：

```text
本轮选择的测试层级：
本轮实际运行的命令：
未选择的测试层级：
未选择原因：
测试失败是否与本轮改动相关：
```

可选测试层级：

- 静态检查
- 单元测试
- 集成测试
- 冒烟测试
- 回归测试
- E2E 测试
- 视觉 / 样式回归
````

---

# 建议追加到 `_review-output-protocol.md` 的中文内容

把原来的“测试命令与结果”扩展成下面这样：

````md
## 11. 测试层级、命令与结果

### 本轮选择的测试层级

请填写：

```text
静态检查：
单元测试：
集成测试：
冒烟测试：
回归测试：
E2E 测试：
视觉 / 样式回归：
```

每项写：

```text
选择 / 未选择
原因：
```

### 实际运行命令

列出实际运行的命令和结果。

#### Git / 静态检查

命令：

```bash
git status --short
git diff --stat
git diff --check
```

结果：

```text
<粘贴摘要>
```

#### 前端测试

如本轮需要，填写：

```bash
cd web && pnpm test
```

结果：

```text
<粘贴摘要>
```

#### 后端测试

如本轮需要，填写：

```bash
cd server && go test ./internal/biz ./internal/data
```

结果：

```text
<粘贴摘要>
```

#### 其他测试

如本轮需要，填写：

```bash
<命令>
```

结果：

```text
<粘贴摘要>
```

### 未运行测试说明

如果某个测试层级没有选择，必须写：

```text
未选择的测试层级：
未选择原因：
是否与本轮改动相关：
是否需要后续补跑：
```

### 测试失败处理

如果测试失败，必须写：

```text
失败命令：
关键日志：
是否与本轮改动相关：
是否已修复：
未修复原因：
下一步建议：
```
````

---

# 建议追加到 `docs/codex-goals/README.md` 的中文内容

````md
## 测试命令写在哪里

`AGENTS.md` 只写测试分层原则。  
具体测试命令必须写在每个 `docs/codex-goals/<goal>.md` 里。

每个 goal 文件的“验收命令”应该包含：

```text
基础命令
本轮选择的测试层级
每个层级对应命令
未选择层级的原因
```

不要让 Codex 自己猜本轮要不要跑集成、回归、冒烟或 E2E。

每轮完成后，Codex 必须在 `.codex-review/latest.md` 中报告：

```text
本轮选择的测试层级
实际运行的命令
未选择的测试层级
未选择原因
测试结果
```
````

---

## 我的最终建议

你截图里的思路是对的：

```text
AGENTS.md：负责原则。
每个 goal md：负责本轮具体命令。
.codex-review/latest.md：负责记录实际选择和结果。
```

不要把所有测试命令都塞进 AGENTS.md。  
也不要让 AGENTS.md 一句“跑测试”就结束。

你现在最好让 Codex 做一个小任务，把“测试分层选择”补到：

```text
AGENTS.md
docs/codex-goals/README.md
docs/codex-goals/_new-session-goal-template.md
docs/codex-goals/_review-output-protocol.md
```

这样后续每一轮 Codex 都会自动说明：**我为什么跑这些测试，为什么没跑那些测试。**

### 051. user

_time `2026-05-30T19:23:42+08:00` · content_type `multimodal_text` · node `762b0de0-8603-4453-924c-735e01f84a59`_

[非文本内容]

```json
{
  "asset_pointer": "sediment://file_000000005f907206b3afe308561a303b",
  "content_type": "image_asset_pointer",
  "fovea": null,
  "height": 1772,
  "metadata": {
    "asset_pointer_link": null,
    "container_pixel_height": null,
    "container_pixel_width": null,
    "dalle": null,
    "emu_omit_glimpse_image": null,
    "emu_patches_override": null,
    "generation": null,
    "gizmo": null,
    "is_no_auth_placeholder": null,
    "lpe_delta_encoding_channel": null,
    "lpe_keep_patch_ijhw": null,
    "sanitized": true,
    "watermarked_asset_pointer": null
  },
  "size_bytes": 197222,
  "width": 1588
}
```

[非文本内容]

```json
{
  "asset_pointer": "sediment://file_00000000f7b07209989245aaf289f1f8",
  "content_type": "image_asset_pointer",
  "fovea": null,
  "height": 1708,
  "metadata": {
    "asset_pointer_link": null,
    "container_pixel_height": null,
    "container_pixel_width": null,
    "dalle": null,
    "emu_omit_glimpse_image": null,
    "emu_patches_override": null,
    "generation": null,
    "gizmo": null,
    "is_no_auth_placeholder": null,
    "lpe_delta_encoding_channel": null,
    "lpe_keep_patch_ijhw": null,
    "sanitized": true,
    "watermarked_asset_pointer": null
  },
  "size_bytes": 315108,
  "width": 1866
}
```

这些呢，把测试和其他的一同让我复制给codex做

### 052. assistant

_time `2026-05-30T19:26:19+08:00` · content_type `text` · node `c47f42e5-bbc3-4087-9fac-4e39400f493e`_

对，这些都应该加，而且建议一次性让 Codex 把 **测试分层 + 成功标准 + 真源/非真源 + 改动范围 + 停止条件 + Git 策略** 一起写进模板体系。

但不要都塞进 `AGENTS.md`。最好的分工是：

```text
AGENTS.md
  只写长期原则。

docs/codex-goals/_new-session-goal-template.md
  写每次新开 Codex 会话复制的短 Goal 模板。

docs/codex-goals/_review-output-protocol.md
  写 Codex 跑完后 .codex-review/latest.md 必须包含什么。

docs/codex-goals/_goal-file-template.md
  写以后每个具体 goal md 应该包含哪些章节。
```

这样以后你让我生成 `003 / 004 / 005` 的时候，我就按 `_goal-file-template.md` 的结构给你完整可复制 md。

这也符合你项目的长期边界：配置可以灵活，但核心事实规则不能随客户乱变；Workflow、单据、Fact、派生状态要分层，不能把 `shipping_released` 当成 `shipped`。fileciteturn2file0 fileciteturn2file1

---

## 复制给 Codex 的中文 Goal

直接复制这一整段给 Codex：

```text
目标：完善 Codex Goal 模板体系，加入成功标准、真源/非真源、改动范围分级、测试分层、停止条件和 Git 策略。

请先阅读 AGENTS.md。本轮只允许修改：
- AGENTS.md
- docs/codex-goals/README.md
- docs/codex-goals/_new-session-goal-template.md
- docs/codex-goals/_review-output-protocol.md
- docs/codex-goals/_goal-file-template.md

如果 docs/codex-goals/_goal-file-template.md 不存在，请创建。

禁止修改：
- 运行时代码
- Ent schema
- migration
- API
- UI
- docs registry
- seedData
- workflow.go
- rbac.go
- server/internal/data
- server/internal/core
- web/src/erp/pages
- web/src/erp/mobile
- 部署脚本

目标：
1. AGENTS.md 只写原则，不塞满所有具体命令。
2. _new-session-goal-template.md 写新会话短 Goal 模板，并要求每轮选择测试层级。
3. _review-output-protocol.md 增加审查报告字段：成功标准、真源检查、改动范围、测试层级、停止条件、Git 策略。
4. 新增或更新 _goal-file-template.md，作为以后每个 docs/codex-goals/<goal>.md 的标准模板。
5. README.md 说明这些模板怎么用。
6. 保留项目边界：不新增 tenant_id、不做 SaaS、多租户、license server、套餐计费、客户工单系统、不创建 ChangeUsecase/change_records、不混淆 Workflow/Fact、shipping_released != shipped、business_records 不是长期事实真源。
7. 完成后只生成 .codex-review/latest.md，不再生成 .codex-review/runs 历史副本。
8. 不要要求用户截图。

请在 _goal-file-template.md 中至少包含这些章节：
- 任务名称
- 任务性质
- 背景
- 必须先读
- 当前真源与非真源
- 允许修改的文件
- 禁止修改的文件
- 改动范围分级
- 成功标准
- 停止条件
- Git 策略
- 测试分层选择
- 验收命令
- 审查报告要求
- 最终回复格式

验收命令：
- git status --short
- git diff --stat
- grep -n "成功标准" docs/codex-goals/_goal-file-template.md
- grep -n "真源与非真源" docs/codex-goals/_goal-file-template.md
- grep -n "改动范围分级" docs/codex-goals/_goal-file-template.md
- grep -n "测试分层" AGENTS.md docs/codex-goals/_new-session-goal-template.md docs/codex-goals/_review-output-protocol.md docs/codex-goals/_goal-file-template.md
- grep -n "停止条件" docs/codex-goals/_goal-file-template.md
- grep -n "Git 策略" docs/codex-goals/_goal-file-template.md
- git diff --check

完成后生成 .codex-review/latest.md，并告诉我可以用：

cat .codex-review/latest.md | pbcopy

复制结果。
```

---

## 建议创建的文件名

```text
docs/codex-goals/_goal-file-template.md
```

---

## `_goal-file-template.md` 应该长这样

下面这份也可以直接手动保存到：

```text
docs/codex-goals/_goal-file-template.md
```

````md
# Codex Goal 文件模板

## 用途

本文件是 `docs/codex-goals/<goal>.md` 的标准模板。

以后每个具体 Codex Goal 文件都应基于本模板创建。  
不要把复杂任务直接塞进 Codex Goal 输入框。  
Codex Goal 输入框只放 4000 字以内中文短 Goal。  

---

# Codex Goal XXX: <任务标题>

## 任务名称

<写清本轮任务名称>

示例：

```text
003：V1 Ent schema：customers / suppliers / contacts / sales_orders / sales_order_items
```

---

## 任务性质

本轮属于哪一类改动：

```text
Docs-only / Schema-only / Migration / Runtime / API-RBAC / UI / Deployment / Audit
```

必须明确：

```text
本轮是否改 runtime：
本轮是否改 Ent schema：
本轮是否新增 migration：
本轮是否改 API：
本轮是否改 UI：
本轮是否改 docs registry：
本轮是否改 seedData：
```

---

## 背景

说明本轮为什么做。

必须说明：

- 上一轮已经完成什么。
- 本轮要解决什么。
- 本轮不解决什么。
- 本轮与产品路线、当前客户、Workflow / Fact 边界的关系。

---

## 必须先读

列出本轮 Codex 必须先读的文件。

基础文件通常包括：

```text
AGENTS.md
README.md
docs/current-source-of-truth.md
progress.md
docs/product/*
docs/architecture/*
docs/customers/current/*
```

按本轮实际需要补充：

```text
server/internal/biz/*
server/internal/data/model/schema/*
web/src/erp/config/*
web/src/erp/docs/*
```

如果某些文件不存在，Codex 必须记录缺失，不要猜。

---

## 当前真源与非真源

### 当前真源

列出本轮判断必须依赖的当前真源。

示例：

```text
AGENTS.md
docs/current-source-of-truth.md
docs/product/v1-implementation-cutline.md
server/internal/data/model/schema
server/internal/biz/workflow.go
server/internal/biz/rbac.go
```

### 只能作为线索

这些只能作为线索，不能直接当真源：

```text
docs/reference/imported-notes/*
docs/customers/current/*
web/src/erp/config/seedData.mjs
截图
Excel 样本
PDF 样本
历史聊天记录
旧项目实现
旧 Goal 输出
```

### 禁止作为真源

这些不能作为当前实现真源：

```text
历史聊天记忆
未经确认的截图 / 口头描述
未落地的 architecture review
未实现的 schema draft
current 客户样本字段
demo / seed 数据
```

必须保持：

```text
代码 / schema / migration / tests 是实现真源。
current-source-of-truth 是当前状态入口。
schema draft 不是 implemented。
architecture review 不是 runtime。
customer material 不是 Product Core。
```

---

## 允许修改的文件

本轮只允许修改：

```text
<列出允许路径>
```

示例：

```text
server/internal/data/model/schema/customer.go
server/internal/data/model/schema/supplier.go
server/internal/data/model/schema/contact.go
docs/product/v1-implementation-cutline.md
progress.md
```

---

## 禁止修改的文件

本轮禁止修改：

```text
<列出禁止路径>
```

常见禁止项：

```text
server/internal/biz/workflow.go
server/internal/biz/rbac.go
server/internal/data
web/src/erp/config/docs.mjs
web/src/erp/config/seedData.mjs
web/src/erp/pages
web/src/erp/mobile
migrations
server/deploy
scripts
```

如果 Codex 发现必须修改禁止路径，必须停止并报告，不得自行修改。

---

## 改动范围分级

本轮范围级别：

```text
Docs-only / Schema-only / Migration / Runtime / API-RBAC / UI / Deployment
```

必须说明：

```text
本轮是否允许扩大范围：
扩大范围时如何处理：
```

默认规则：

- 不得自动扩大范围。
- 发现范围不足时，停止并报告。
- 不得把 schema、repo/usecase、API、UI 放在同一轮，除非任务明确允许。
- 不得因为测试失败去乱改无关文件。

---

## 成功标准

本轮完成必须满足以下标准：

```text
- <标准 1>
- <标准 2>
- <标准 3>
```

成功标准必须可验证。

示例：

```text
- 只新增 V1 cutline 允许的 Ent schema。
- 不新增 tenant_id。
- 不生成 migration。
- 不改 repo/usecase。
- 不改 API/UI。
- go test 指定 package 通过。
- .codex-review/latest.md 已生成。
```

不能只写：

```text
完成任务
文档写好
代码可用
```

---

## 停止条件

出现以下情况必须停止并报告，不得继续乱改：

```text
- 任务文件与 AGENTS.md 或当前代码真源冲突。
- 需要修改禁止路径。
- 需要新增 tenant_id。
- 需要实现 SaaS 多租户。
- 需要引入新架构、新依赖或新数据模型，但本轮未允许。
- 发现已有真源被重复设计。
- Workflow / Fact 边界无法保持。
- 验收命令暴露大量与本轮无关的既有失败。
- 测试失败原因不明确。
- 需要删除或重写大量历史文件。
```

停止时必须输出：

```text
停止原因：
涉及文件：
风险：
建议下一步：
```

---

## Git 策略

默认规则：

```text
- 本轮默认不提交、不推送。
- 不允许执行 git add .。
- 不允许自动 commit。
- 不允许自动 push。
- 不允许回退、整理或 stash 非本轮改动。
- 如需 stage，必须按路径精确 stage，并且用户明确要求。
```

必须运行：

```bash
git status --short
git diff --stat
git diff --check
```

必须区分：

```text
tracked diff
untracked files
本轮新增文件
历史未跟踪文件
```

如果存在历史 untracked 文件，不要删除，报告即可。

---

## 测试分层选择

本轮必须根据改动影响面选择测试层级。

不要机械全跑。  
不要只跑最轻检查。  
不要让 AGENTS.md 代替本轮测试选择。  

### 可选测试层级

- 静态检查：格式、lint、类型、`git diff --check`。
- 单元测试：验证单个函数、helper、usecase、repo。
- 集成测试：验证 API / usecase / repo / DB / 权限等跨层链路。
- 冒烟测试：确认主路径能启动、页面能打开、核心入口没炸。
- 回归测试：验证本轮相关旧行为没有被破坏。
- E2E 测试：用真实浏览器或真实接口跑完整用户路径。
- 视觉 / 样式回归：检查默认态、交互态、响应式和布局。

### 本轮选择的测试层级

必须填写：

```text
静态检查：
单元测试：
集成测试：
冒烟测试：
回归测试：
E2E 测试：
视觉 / 样式回归：
```

每项必须说明：

```text
选择 / 未选择
原因：
对应命令：
```

---

## 验收命令

基础命令：

```bash
git status --short
git diff --stat
git diff --check
```

按本轮类型补充。

### Docs-only

通常补：

```bash
grep -R "tenant_id" docs/product docs/architecture docs/customers docs/reference config deployments || true
grep -R "shipping_released" docs/product docs/architecture docs/customers docs/reference || true
```

只有改 docs registry 或前端文档入口时，才补前端测试。

### 前端配置 / docs registry / seed

```bash
cd web && pnpm lint && pnpm test
```

### 前端 UI / 样式 / 布局

```bash
cd web && pnpm lint && pnpm css && pnpm test && pnpm style:l1
```

### 后端 biz / usecase / repo

```bash
cd server && go test ./internal/biz ./internal/data
```

或更窄 package 测试。

### Ent schema / migration

```bash
cd server && make data
cd server && make migrate_status
cd server && go test ./internal/data ./internal/biz
```

必须先确认 DB 环境。

### API / RBAC

```bash
cd server && go test ./internal/biz ./internal/data
cd web && pnpm test
```

并检查：

```text
权限码
菜单权限
动作权限
后端校验
```

### 错误码

```bash
bash scripts/qa/error-code-sync.sh
bash scripts/qa/error-codes.sh
```

### 发布 / 部署

按任务要求选择：

```bash
bash scripts/qa/fast.sh
bash scripts/qa/full.sh
bash scripts/qa/strict.sh
```

---

## 项目长期禁止项

除非经过单独评审，本轮必须遵守：

```text
- 不新增 tenant_id。
- 不实现 SaaS 多租户。
- 不实现 license server、套餐计费、客户工单系统。
- 不创建泛化 ChangeUsecase。
- 不创建泛化 change_records。
- 不把 current 客户资料写成 Product Core。
- 不让 WorkflowUsecase 写库存、出货、财务、应收、应付、发票、收付款事实。
- shipping_released != shipped。
- workflow task done != fact posted。
- business_records 是兼容层、demo、seed、source snapshot、调研入口，不是长期事实真源。
```

---

## 审查报告要求

本轮完成后必须生成：

```text
.codex-review/latest.md
```

只生成 latest，不生成 runs 历史副本。

审查报告必须遵守：

```text
docs/codex-goals/_review-output-protocol.md
```

用户必须能用下面命令复制：

```bash
cat .codex-review/latest.md | pbcopy
```

不要要求用户截图。

---

## 最终回复格式

Codex 最终回复必须包含：

```text
【完成】

【新增/修改文件】

【本轮改动范围】

【成功标准完成情况】

【真源与非真源检查】

【禁止路径检查】

【tenant_id 处理结论】

【Workflow / Fact 边界检查】

【测试层级选择】

【测试命令与结果】

【停止条件是否触发】

【Git 状态摘要】

【风险】

【下一轮 Codex Goal 建议】

【.codex-review/latest.md 复制命令】
cat .codex-review/latest.md | pbcopy
```
````

---

## 还要同步改 `_review-output-protocol.md`

建议加进去的核心字段是：

```text
成功标准完成情况
真源与非真源检查
改动范围分级
测试层级选择
停止条件是否触发
Git 策略检查
```

这样以后 `.codex-review/latest.md` 不只是测试结果，还会告诉你：

```text
这轮有没有按真源做
有没有越界
有没有偷跑实现
有没有触发停止条件
有没有乱动 Git
为什么选择这些测试
```

---

## 最终建议

这些都值得加。

建议现在让 Codex 执行上面的中文 Goal，一次性把模板体系补齐。之后每个具体 Goal 都按 `_goal-file-template.md` 生成，就不会再漏测试、漏成功标准、漏停止条件，也不会每轮都靠截图或聊天记忆补上下文。

### 053. user

_time `2026-05-30T22:41:04+08:00` · content_type `text` · node `b99ddb46-2d6e-4352-a614-95da653828fd`_

所以之前的_template.md不要了，换成_goal-file-template.md是吧

### 054. assistant

_time `2026-05-30T22:42:34+08:00` · content_type `text` · node `4b5b9c69-0825-46c7-9099-3b1ac7eb401f`_

对，**如果你说的 `_template.md` 是“每个具体 Goal 文件的通用模板”**，那就不要再用这个模糊名字了，改成：

```text
docs/codex-goals/_goal-file-template.md
```

但注意：**不是把所有 template 都替换掉**。最终应该保留这几个文件：

```text
docs/codex-goals/README.md
docs/codex-goals/_new-session-goal-template.md
docs/codex-goals/_goal-file-template.md
docs/codex-goals/_review-output-protocol.md
```

它们分工如下：

```text
_new-session-goal-template.md
  每次新开 Codex 会话时复制的中文短 Goal 模板。

_goal-file-template.md
  以后每个 docs/codex-goals/003-xxx.md、004-xxx.md 应该怎么写的结构模板。

_review-output-protocol.md
  Codex 完成后 .codex-review/latest.md 应该怎么生成。

README.md
  说明这些模板怎么用。
```

所以结论是：

```text
旧的 _template.md：不要了，改名 / 合并成 _goal-file-template.md。
_new-session-goal-template.md：保留。
_review-output-protocol.md：保留。
```

这样命名更清楚，也更适合长期维护你的项目边界：一套产品内核、多客户配置包、受控客户差异，以及 Workflow / 单据 / Fact / 派生状态分层。fileciteturn2file0 fileciteturn2file1

---

## 建议最终目录

```text
docs/codex-goals/
  README.md
  _new-session-goal-template.md
  _goal-file-template.md
  _review-output-protocol.md
  000-phase0-foundation.md
  001-overnight-phase1-masterdata-order-review.md
  002-schema-design-final-review.md
  003-v1-ent-schema-customers-suppliers-orders.md
```

---

## 如果现在仓库里已经有 `_template.md`

建议处理：

```text
1. 如果 _template.md 内容就是 goal 文件结构模板：
   改名为 _goal-file-template.md。

2. 如果 _template.md 里有有用内容，但 _goal-file-template.md 已存在：
   把有用内容合并进 _goal-file-template.md，然后删除 _template.md。

3. 如果 _template.md 只是旧版本重复内容：
   删除 _template.md。

4. 更新 AGENTS.md 和 docs/codex-goals/README.md 里的引用。
```

---

## 给 Codex 的中文短 Goal

你可以直接复制给 Codex：

```text
目标：统一 Codex 模板命名，废弃模糊的 _template.md，改用 _goal-file-template.md。

请先阅读 AGENTS.md。本轮只允许修改 docs/codex-goals 目录下的模板文档，以及 AGENTS.md、docs/codex-goals/README.md 中对这些模板的引用。

目标：
1. 如果 docs/codex-goals/_template.md 存在，请检查内容。
2. 如果它是具体 Goal 文件结构模板，请合并或改名为 docs/codex-goals/_goal-file-template.md。
3. 如果 docs/codex-goals/_goal-file-template.md 已存在，请把 _template.md 中有价值但缺失的内容合并进去。
4. 合并后删除 docs/codex-goals/_template.md，避免两个模板并存造成混淆。
5. 保留 docs/codex-goals/_new-session-goal-template.md，它是新开 Codex 会话用的短 Goal 模板，不要删除。
6. 保留 docs/codex-goals/_review-output-protocol.md，它是 .codex-review/latest.md 的输出协议，不要删除。
7. 更新 docs/codex-goals/README.md 和 AGENTS.md 中的引用，确保只引用 _goal-file-template.md，不再引用 _template.md。
8. 完成后只生成 .codex-review/latest.md，不生成 .codex-review/runs 历史副本。

禁止：
- 不改运行时代码。
- 不改 Ent schema。
- 不新增 migration。
- 不改 API。
- 不改 UI。
- 不改 docs registry。
- 不改 seedData。
- 不改 workflow.go。
- 不改 rbac.go。
- 不改 server/internal/data。
- 不改 server/internal/core。
- 不新增 tenant_id。
- 不实现 SaaS 多租户。
- 不创建 ChangeUsecase 或 change_records。

验收命令：
- git status --short
- git diff --stat
- test -f docs/codex-goals/_goal-file-template.md
- test -f docs/codex-goals/_new-session-goal-template.md
- test -f docs/codex-goals/_review-output-protocol.md
- test ! -f docs/codex-goals/_template.md
- grep -R "_template.md" AGENTS.md docs/codex-goals || true
- grep -R "_goal-file-template.md" AGENTS.md docs/codex-goals
- git diff --check

完成后生成 .codex-review/latest.md，并告诉我可以用：

cat .codex-review/latest.md | pbcopy

复制结果。
```

---

## 最终判断

是的：

```text
旧 _template.md -> 不要保留。
统一换成 _goal-file-template.md。
```

但这三个要同时存在：

```text
_new-session-goal-template.md
_goal-file-template.md
_review-output-protocol.md
```

以后我给你写具体 `003 / 004 / 005` 的完整 md，就按 `_goal-file-template.md` 的结构来。

### 055. user

_time `2026-05-30T22:57:43+08:00` · content_type `text` · node `91c65d44-b9f2-4523-ba4b-4b92396954d9`_

.codex-review/runs还要保留吗，先讨论

### 056. user

_time `2026-05-30T22:58:03+08:00` · content_type `text` · node `288bbe9a-342e-4aa9-9f08-79350c4d9b5d`_

.codex-review/runs还要保留吗，先讨论，要不就保留多少条这样？

### 057. assistant

_time `2026-05-30T22:59:35+08:00` · content_type `text` · node `f64f9848-21be-403c-a97b-2f572228ffa8`_

要加。建议把截图里这些内容和“测试分层”一起沉淀到模板体系里，而不是每个 Goal 临时想。

分工建议是：

```text
AGENTS.md
  写长期原则和项目边界，不塞满所有具体命令。

docs/codex-goals/_new-session-goal-template.md
  写每次新开 Codex 会话复制的短 Goal 模板。

docs/codex-goals/_goal-file-template.md
  写每个具体 Goal 文件应该包含哪些章节。

docs/codex-goals/_review-output-protocol.md
  写 .codex-review/latest.md 必须报告哪些内容。

docs/codex-goals/README.md
  写这些模板怎么用。
```

这样做是对的，因为 Codex 会读取 `AGENTS.md` 作为项目指令，适合放长期规则；但具体任务的测试命令、成功标准、停止条件，应该放到每个 goal 文件里，避免 `AGENTS.md` 变成大杂烩。citeturn267613search0 你的项目本身也要求“通用产品内核 + 受控客户差异”，并且状态要区分 Workflow、单据生命周期、业务事实、派生状态和系统横切状态，所以模板里必须长期约束这些边界。fileciteturn2file0turn2file1

下面这段直接复制给 Codex 做。

```text
目标：完善 Codex Goal 模板体系，把测试分层、成功标准、真源/非真源、改动范围、停止条件和 Git 策略统一写进仓库模板。

请先阅读 AGENTS.md。本轮只允许修改：
- AGENTS.md
- docs/codex-goals/README.md
- docs/codex-goals/_new-session-goal-template.md
- docs/codex-goals/_review-output-protocol.md
- docs/codex-goals/_goal-file-template.md

如果 docs/codex-goals/_goal-file-template.md 不存在，请创建。
如果旧的 docs/codex-goals/_template.md 存在，请先检查内容；如有价值则合并进 _goal-file-template.md，然后删除 _template.md，避免两个模板并存。

禁止修改：
- 运行时代码
- Ent schema
- migration
- API
- UI
- docs registry
- seedData
- workflow.go
- rbac.go
- server/internal/data
- server/internal/core
- web/src/erp/pages
- web/src/erp/mobile
- 部署脚本

目标要求：
1. AGENTS.md 只写长期原则，不堆所有具体测试命令。
2. _new-session-goal-template.md 写新会话短 Goal 模板，并要求每轮选择测试层级。
3. _goal-file-template.md 作为以后每个 docs/codex-goals/<goal>.md 的标准模板。
4. _review-output-protocol.md 增加审查报告字段：成功标准完成情况、真源/非真源检查、改动范围、测试层级选择、停止条件是否触发、Git 策略检查。
5. README.md 说明这些模板怎么用。
6. 每轮完成后只生成 .codex-review/latest.md，不再生成 .codex-review/runs 历史副本。
7. 不要要求用户截图。

_goal-file-template.md 至少包含这些章节：
- 任务名称
- 任务性质
- 背景
- 必须先读
- 当前真源与非真源
- 允许修改的文件
- 禁止修改的文件
- 改动范围分级
- 成功标准
- 停止条件
- Git 策略
- 测试分层选择
- 验收命令
- 项目长期禁止项
- 审查报告要求
- 最终回复格式

成功标准章节必须强调：
- 成功标准必须可验证。
- 不能只写“完成任务 / 文档写好 / 代码可用”。
- 每个标准要能通过文件、命令、测试或审查报告验证。

真源与非真源章节必须强调：
- 代码 / schema / migration / tests 是实现真源。
- docs/current-source-of-truth.md 是当前状态入口。
- architecture review 不是 runtime。
- schema draft 不是 implemented。
- customer material 不是 Product Core。
- seed/demo/source snapshot 只能作为线索。
- 历史聊天记录、截图、口头描述、旧 Goal 输出不能直接当当前真源。

改动范围分级必须包含：
- Docs-only
- Schema-only
- Migration
- Runtime
- API-RBAC
- UI
- Deployment
并明确：不得擅自扩大范围；发现范围不足时停止并报告。

停止条件必须包含：
- 任务文件与 AGENTS.md 或当前代码真源冲突。
- 需要修改禁止路径。
- 需要新增 tenant_id。
- 需要实现 SaaS 多租户。
- 发现已有真源被重复设计。
- Workflow / Fact 边界无法保持。
- 需要引入新架构、新依赖或新数据模型，但本轮未允许。
- 验收命令暴露大量与本轮无关的既有失败。
- 测试失败原因不明确。
- 需要删除、回退、整理或 stash 非本轮改动。

Git 策略必须包含：
- 默认不提交、不推送。
- 不允许 git add .。
- 不允许自动 commit。
- 不允许自动 push。
- 不允许回退、整理或 stash 非本轮改动。
- 如需 stage，必须按路径精确 stage，并且用户明确要求。
- 必须区分 tracked diff、untracked files、本轮新增文件、历史未跟踪文件。

测试分层必须包含：
- 静态检查
- 单元测试
- 集成测试
- 冒烟测试
- 回归测试
- E2E 测试
- 视觉 / 样式回归

测试分层规则：
- 不要机械全跑。
- 不要只跑最轻检查。
- 每个具体 goal md 必须写本轮实际验收命令。
- .codex-review/latest.md 必须说明本轮选择了哪些测试层级、未选择哪些测试层级、未选择原因、测试失败是否与本轮改动相关。

项目长期边界必须保留：
- 不新增 tenant_id。
- 不实现 SaaS 多租户。
- 不实现 license server、套餐计费、客户工单系统。
- 不创建泛化 ChangeUsecase。
- 不创建泛化 change_records。
- 不把 current 客户资料写成 Product Core。
- 不让 WorkflowUsecase 写库存、出货、财务、应收、应付、发票、收付款事实。
- shipping_released != shipped。
- workflow task done != fact posted。
- business_records 是兼容层、demo、seed、source snapshot、调研入口，不是长期事实真源。

验收命令：
- git status --short
- git diff --stat
- test -f docs/codex-goals/_goal-file-template.md
- test -f docs/codex-goals/_new-session-goal-template.md
- test -f docs/codex-goals/_review-output-protocol.md
- test ! -f docs/codex-goals/_template.md
- grep -n "成功标准" docs/codex-goals/_goal-file-template.md
- grep -n "真源与非真源" docs/codex-goals/_goal-file-template.md
- grep -n "改动范围分级" docs/codex-goals/_goal-file-template.md
- grep -n "停止条件" docs/codex-goals/_goal-file-template.md
- grep -n "Git 策略" docs/codex-goals/_goal-file-template.md
- grep -n "测试分层" AGENTS.md docs/codex-goals/_new-session-goal-template.md docs/codex-goals/_review-output-protocol.md docs/codex-goals/_goal-file-template.md docs/codex-goals/README.md
- grep -R ".codex-review/runs" AGENTS.md docs/codex-goals || true
- git diff --check

完成后必须生成 .codex-review/latest.md，并告诉我可以用：

cat .codex-review/latest.md | pbcopy

复制结果。
```

这轮做完后，你以后生成 `003 / 004 / 005` 这类具体任务，就都按：

```text
docs/codex-goals/_goal-file-template.md
```

来写。这样每个 Goal 都会自动包含：

```text
成功标准
真源与非真源
改动范围
停止条件
Git 策略
测试分层
审查报告要求
```

这比单独只加测试更完整。

### 058. assistant

_time `2026-05-30T22:59:45+08:00` · content_type `text` · node `b8c7915f-9cc5-4c76-a62d-4f75d8a3b029`_

我建议：**保留 `runs`，但只保留最近 5 条，并且不要提交进 Git。**

也就是最终规则：

```text
.codex-review/latest.md
  必须保留，每轮覆盖，给你复制给 GPT 用。

.codex-review/runs/*.md
  可选保留，最多保留最近 5 条，只做本地历史审计。

.codex-review/
  建议加入 .gitignore，不提交。
```

原因是你现在已经进入多轮 Codex 驱动开发。只有 `latest.md` 虽然最简洁，但如果 Codex 某轮报告写错、覆盖了旧报告、或者你想回看“002 到底做了什么”，没有历史会不方便。保留无限多又会变成垃圾堆。**最近 5 条**是比较合适的折中。

这和你项目现在的治理方式一致：核心产品边界、客户配置、Workflow / Fact 分层都需要可追溯，但不要让辅助文件变成新的混乱真源。产品化文档强调一套标准产品内核、多客户配置包、少量扩展，核心代码不分叉；状态文档也强调 Workflow、单据阶段、业务事实、派生状态要分清。fileciteturn2file0 fileciteturn2file1

---

## 三种方案对比

| 方案 | 规则 | 优点 | 缺点 | 我的建议 |
|---|---|---|---|---|
| 不保留 runs | 只保留 `latest.md` | 最简单，不乱 | 无法回看上一轮报告 | 适合极简流程 |
| 保留最近 5 条 | `latest.md` + 最近 5 个 runs | 可回溯，不太乱 | 多一个清理规则 | **推荐** |
| 无限保留 runs | 每轮都归档 | 全量历史 | 很快变乱，容易误传 | 不推荐 |

---

## 推荐最终目录

```text
.codex-review/
  latest.md
  runs/
    003-v1-ent-schema-20260530-1901.md
    004-v1-migration-20260530-2230.md
    ...
```

但 Git 里不要提交这些：

```text
.codex-review/
```

因为它们是本地审查输出，不是产品文档真源。

---

## 为什么不是只保留 latest.md

`latest.md` 是给你复制给 GPT 的，非常好用。

但它有一个问题：

```text
每轮覆盖。
```

如果你过了几轮才发现：

```text
003 的报告里说了某个风险
004 覆盖了 latest
你忘了 003 当时怎么判断
```

那就不好查了。

保留最近 5 条能解决这个问题，而且不会太乱。

---

## 为什么不要提交 `.codex-review/runs`

`.codex-review` 是过程产物，不是正式文档。

正式应该提交的是：

```text
AGENTS.md
docs/codex-goals/*.md
docs/product/*.md
docs/architecture/*.md
docs/current-source-of-truth.md
progress.md
```

不应该提交的是：

```text
.codex-review/latest.md
.codex-review/runs/*.md
```

否则 Git 里会充满每轮 Codex 的审查报告，干扰正式改动。

---

## 推荐规则

可以把规则定成：

```text
每轮 Codex 必须生成 .codex-review/latest.md。
每轮可生成 .codex-review/runs/<goal-id>-<timestamp>.md。
runs 最多保留最近 5 条。
.codex-review/ 不提交进 Git。
用户复制给 GPT 时，只复制 latest.md。
```

---

## 清理 runs 的命令

如果你保留最近 5 条，可以用这个命令清理：

```bash
mkdir -p .codex-review/runs
ls -t .codex-review/runs/*.md 2>/dev/null | tail -n +6 | xargs rm -f
```

意思是：

```text
按修改时间排序
保留最新 5 个
删除第 6 个及以后
```

---

## `.gitignore` 建议

建议加：

```gitignore
.codex-review/
```

如果你想保留目录结构，可以只提交一个说明文件，但我觉得没必要。模板和协议已经在 `docs/codex-goals/` 里了。

---

## 我建议你最终选择

我的建议是：

```text
保留 runs，但只保留最近 5 条。
.codex-review/ 整体 gitignore。
GPT 交接只用 latest.md。
```

这比“完全不保留”更安全，比“无限保留”更干净。

如果你想更简单，也可以选：

```text
不保留 runs，只保留 latest.md。
```

但我不建议无限保留。

### 059. user

_time `2026-05-30T23:11:50+08:00` · content_type `text` · node `ed68a786-6808-478c-82fc-4c4419ad8237`_

好了，我们接着之前的业务继续做：

### 060. assistant

_time `2026-05-30T23:16:32+08:00` · content_type `text` · node `43b24dbe-767f-440c-a48c-a04407fab25e`_

可以继续。基于你这次上传的 `.codex-review/latest.md`，当前状态适合进入**业务实现前的第一轮小范围 schema 落地**：只做 V1 cutline 里已经 Go 的 `customers / suppliers / contacts / sales_orders / sales_order_items` Ent schema，不做 repo/usecase、API、UI、migration，也不碰 Workflow / Fact。上一轮报告确认本轮只是补 `AGENTS.md` 工作流规则，没有改 runtime、Ent schema、migration、API、UI、docs registry、seedData；同时也提醒当前工作区已有大量未跟踪 Phase 0/1/2 文档和骨架，所以这轮一定要严控范围。fileciteturn3file12turn3file4

业务方向上，这一步也符合甲方第一期重点：先打通订单到出货主链路，并同步建设手机端任务处理能力；但现在还只是主数据和订单源单据 schema，不能跳到出货、库存、财务事实。fileciteturn3file2 状态边界继续守住：`shipping_released` 只是已放行 / 可发货，不是 `shipped`；`workflow done != fact posted`。fileciteturn3file15turn3file19

---

## 下一轮中文短 Goal

复制到 Codex Goal：

```text
目标：执行 docs/codex-goals/003-v1-ent-schema-customers-suppliers-orders.md。

请先阅读 AGENTS.md，然后严格执行任务文件。每次新会话都不能依赖历史聊天记忆，只能以仓库文件为准。

本轮只允许落 V1 cutline 明确允许的 Ent schema：customers、suppliers、contacts、sales_orders、sales_order_items。

禁止 repo/usecase、API、UI、migration、docs registry、seedData、workflow.go、rbac.go、server/internal/data 业务逻辑改动。禁止 tenant_id、SaaS 多租户、license server、套餐计费、客户工单系统、ChangeUsecase、change_records。禁止把 current 客户资料写成 Product Core。禁止从 Workflow 写库存、出货、财务事实。shipping_released != shipped。

本轮允许和禁止修改的文件，以任务 md 为准。

完成后必须按 docs/codex-goals/_review-output-protocol.md 生成 .codex-review/latest.md。

用户应能用下面命令复制：

cat .codex-review/latest.md | pbcopy

不要要求用户截图。
```

---

## 文件名

```text
docs/codex-goals/003-v1-ent-schema-customers-suppliers-orders.md
```

---

## 完整可复制 MD

````md
# Codex Goal 003: V1 Ent Schema for Customers / Suppliers / Contacts / Sales Orders

## 任务名称

003：V1 Ent schema：`customers / suppliers / contacts / sales_orders / sales_order_items`

## 任务性质

本轮属于：

```text
Schema-only
```

本轮只允许新增或修改 V1 cutline 明确允许的 Ent schema 文件。

必须明确：

```text
本轮是否改 runtime：否
本轮是否改 Ent schema：是
本轮是否新增 migration：否
本轮是否改 API：否
本轮是否改 UI：否
本轮是否改 docs registry：否
本轮是否改 seedData：否
本轮是否改 repo/usecase：否
```

本轮目标是创建 V1 源单据和主数据的 schema 起点，不生成 migration，不生成 Ent 代码，不接业务逻辑。

---

## 背景

Phase 0 已完成产品化架构、状态分层、配置权限、current 客户实例边界和目录骨架。

Phase 1 已完成主数据、订单源单据、BOM、采购前置模型评审。

Phase 2 已完成 schema final review 和 V1 implementation cutline。

Phase 2 结论：

```text
V1 Go:
- customers
- suppliers
- contacts
- sales_orders
- sales_order_items

Draft Only:
- product_skus
- customer_addresses
- supplier_material_profiles
- settlement_terms
- order_revisions
- BOM version extension
- purchase_orders
- purchase_order_items
- purchase_demands

Deferred:
- stock_reservations
- shipments
- shipment_items
- AR/AP/invoice/payment/reconciliation
- production facts
- outsourcing facts
```

本轮只落 V1 Go 表的 Ent schema。

本轮不处理：

```text
repo
usecase
API
RBAC
UI
数据导入
business_records 迁移
migration
Ent generate
```

---

## 必须先读

### 项目规则

```text
AGENTS.md
README.md
docs/current-source-of-truth.md
progress.md
```

### Codex 工作流

```text
docs/codex-goals/README.md
docs/codex-goals/_new-session-goal-template.md
docs/codex-goals/_goal-file-template.md
docs/codex-goals/_review-output-protocol.md
```

如果其中某些模板文件不存在，记录缺失，不要自行大范围补模板。

### Phase 0 文档

```text
docs/product/zero-to-one-architecture.md
docs/product/product-principles.md
docs/product/domain-model-v1.md
docs/product/module-boundaries.md
docs/product/config-permission-policy.md
docs/product/customer-instance-policy.md
docs/product/customer-delta-policy.md
docs/product/rewrite-roadmap.md
docs/product/release-gates.md
docs/product/test-strategy.md
docs/architecture/status-workflow-fact-boundary.md
```

### Phase 1 文档

```text
docs/architecture/masterdata-order-source-document-review.md
docs/architecture/customer-supplier-masterdata-review.md
docs/architecture/product-sku-bom-boundary-review.md
docs/architecture/order-purchase-boundary-review.md
docs/product/domain-schema-draft-v1-v2.md
docs/product/migration-readiness-checklist.md
docs/product/phase1-implementation-plan.md
docs/product/phase1-risk-register.md
```

### Phase 2 文档

```text
docs/product/schema-design-final-review.md
docs/product/v1-entity-decision-record.md
docs/product/v1-implementation-cutline.md
docs/product/v1-schema-go-no-go.md
docs/product/business-records-transition-plan.md
docs/product/v1-next-codex-goals.md
```

### current 客户资料

```text
docs/customers/current/README.md
docs/customers/current/source-materials.md
docs/customers/current/requirement-clues.md
docs/customers/current/assumption-register.md
docs/customers/current/question-backlog.md
docs/customers/current/decision-log.md
docs/customers/current/customer-config-draft.md
docs/customers/current/delta-register.md
docs/customers/current/change-request-process.md
```

### 后端现状

```text
server/internal/data/model/schema
server/internal/data/model/schema/product.go
server/internal/data/model/schema/material.go
server/internal/data/model/schema/unit.go
server/internal/data/model/schema/warehouse.go
server/internal/data/model/schema/business_record.go
server/internal/data/model/schema/bom_header.go
server/internal/data/model/schema/bom_item.go
server/internal/data/model/schema/purchase_receipt.go
server/internal/data/model/schema/purchase_return.go
server/internal/data/model/schema/purchase_receipt_adjustment.go
server/internal/data/model/schema/quality_inspection.go
server/internal/data/model/schema/inventory_txn.go
server/internal/data/model/schema/inventory_balance.go
server/internal/data/model/schema/inventory_lot.go
```

如果文件名与实际仓库不一致，Codex 必须先 `ls server/internal/data/model/schema` 并按真实文件名阅读。

---

## 当前真源与非真源

### 当前真源

本轮必须以这些为准：

```text
AGENTS.md
docs/current-source-of-truth.md
docs/product/v1-implementation-cutline.md
docs/product/v1-entity-decision-record.md
docs/product/v1-schema-go-no-go.md
docs/product/domain-schema-draft-v1-v2.md
server/internal/data/model/schema
```

### 只能作为线索

```text
docs/customers/current/*
web/src/erp/config/seedData.mjs
截图
Excel 样本
PDF 样本
历史 Codex 输出
docs/reference/imported-notes/*
```

### 禁止作为当前实现真源

```text
历史聊天记忆
未经确认的截图 / 口头描述
未落地 architecture review
未实现 schema draft
current 客户样本字段
demo / seed 数据
```

必须保持：

```text
代码 / schema / migration / tests 是实现真源。
current-source-of-truth 是当前状态入口。
schema draft 不是 implemented。
architecture review 不是 runtime。
customer material 不是 Product Core。
```

---

## 允许修改的文件

本轮允许新增或修改：

```text
server/internal/data/model/schema/customer.go
server/internal/data/model/schema/supplier.go
server/internal/data/model/schema/contact.go
server/internal/data/model/schema/sales_order.go
server/internal/data/model/schema/sales_order_item.go
```

允许小幅更新：

```text
docs/current-source-of-truth.md
progress.md
docs/product/v1-implementation-cutline.md
docs/product/v1-schema-go-no-go.md
docs/product/v1-next-codex-goals.md
```

允许生成或覆盖：

```text
.codex-review/latest.md
```

如果当前仓库协议仍要求历史副本，可按协议生成；但本轮不要修改协议本身。

---

## 禁止修改的文件

本轮禁止修改：

```text
server/internal/biz/workflow.go
server/internal/biz/rbac.go
server/internal/data
server/internal/data/model
server/internal/core
web/src/erp/config/docs.mjs
web/src/erp/config/seedData.mjs
web/src/erp/pages
web/src/erp/mobile
migrations
server/deploy
scripts
```

特别说明：

```text
server/internal/data/model/schema 允许按本轮清单新增 schema 文件。
server/internal/data/model 其他生成代码禁止修改。
server/internal/data 业务 repo/usecase 禁止修改。
```

如果 Codex 发现必须修改禁止路径，必须停止并报告，不得自行修改。

---

## 改动范围分级

本轮范围级别：

```text
Schema-only
```

不得扩大范围。

禁止把下面内容放进同一轮：

```text
Ent schema + migration + generated code + repo/usecase + API + UI
```

发现范围不足时，停止并报告。

---

## 成功标准

本轮完成必须满足：

```text
- 只新增或修改 V1 cutline 允许的 Ent schema 文件。
- 新增 schema 文件命名和风格与现有 Ent schema 保持一致。
- 不新增 tenant_id。
- 不新增 SaaS runtime tenant 相关字段或表。
- 不新增 product_skus。
- 不新增 purchase_orders。
- 不新增 shipments。
- 不新增 stock_reservations。
- 不新增 AR/AP/invoice/payment/reconciliation。
- 不新增 migration。
- 不运行 make data 生成 Ent 代码。
- 不改 repo/usecase。
- 不改 API/RBAC。
- 不改 UI。
- 不改 docs registry。
- 不改 seedData。
- contacts 建模方式必须在文档或 schema 注释中说明约束与后续 guard。
- sales_orders / sales_order_items 必须明确是 Source Document，不是 shipment fact。
- shipped_quantity 不得作为人工事实字段伪造出货；如确需字段，必须标明为 derived/cache，并说明真实来源是 future shipment facts。
- .codex-review/latest.md 已生成。
```

不能只写“schema 已完成”。

---

## 停止条件

出现以下情况必须停止并报告：

```text
- 任务文件与 AGENTS.md 或当前代码真源冲突。
- 需要修改禁止路径。
- 需要新增 tenant_id。
- 需要实现 SaaS 多租户。
- 需要新增 migration。
- 需要运行 make data 生成 Ent 代码。
- 需要修改 server/internal/data 业务逻辑。
- 需要修改 workflow.go 或 rbac.go。
- 发现 customers/suppliers/orders 与已有 schema 重复但无法解释边界。
- contacts 建模无法表达 customer/supplier 归属。
- sales_order_item 无法安全关联现有 products。
- Workflow / Fact 边界无法保持。
- 测试失败原因不明确。
- 需要删除、回退、整理或 stash 非本轮改动。
```

停止时必须输出：

```text
停止原因：
涉及文件：
风险：
建议下一步：
```

---

## Git 策略

默认规则：

```text
- 本轮默认不提交、不推送。
- 不允许执行 git add .。
- 不允许自动 commit。
- 不允许自动 push。
- 不允许回退、整理或 stash 非本轮改动。
- 如需 stage，必须按路径精确 stage，并且用户明确要求。
```

必须区分：

```text
tracked diff
untracked files
本轮新增文件
历史未跟踪文件
```

如果存在历史 untracked 文件，不要删除，报告即可。

---

## Ent schema 设计要求

### 通用要求

所有新 schema 必须：

```text
- 遵守现有 server/internal/data/model/schema 的命名、field、edge、mixin、index 风格。
- 使用现有项目的 created_at / updated_at / status / remark 风格。
- 状态字段使用稳定 canonical key，不使用中文文案。
- 不出现 tenant_id。
- 不引用 current 客户专属字段作为必填 Product Core 字段。
- 不添加库存、出货、财务事实字段。
```

如果现有 schema 有 mixin 或公共字段约定，必须复用。

如果现有 schema 没有统一 mixin，按现有文件风格实现，不自行引入新架构。

---

## Entity: customers

### 分类

```text
MasterData
```

### 目的

记录客户主数据，用于销售订单、未来出货、未来应收、未来发票和对账。

### 推荐字段

Codex 必须先阅读 Phase 2 cutline 和现有 schema，再决定最终字段。

V1 推荐最小字段：

```text
code
name
short_name
status
remark
created_at
updated_at
```

可选字段，如 Phase 2 文档明确允许才加入：

```text
invoice_title
tax_no
phone
address
```

建议延后字段：

```text
settlement_terms
credit_limit
payment_terms
customer_addresses
finance-specific fields
```

### 关系

V1 应支持：

```text
customer -> sales_orders
```

如果 Ent edge 风格允许，添加与 `sales_orders` 的边。

不得添加：

```text
tenant_id
AR/AP direct facts
shipment facts
```

---

## Entity: suppliers

### 分类

```text
MasterData
```

### 目的

记录供应商主数据，用于未来采购订单、采购入库、采购退货、采购对账、委外加工。

### 推荐字段

V1 推荐最小字段：

```text
code
name
short_name
supplier_type
status
remark
created_at
updated_at
```

`supplier_type` 建议使用稳定 key，例如：

```text
material
outsourcing
service
mixed
```

如果 Phase 2 文档判断 V1 不应加入 `supplier_type`，可以延后，但必须在审查报告中说明。

建议延后字段：

```text
settlement_terms
tax_no
invoice_title
bank_account
supplier_material_profiles
finance-specific fields
```

### 关系

V1 应支持：

```text
supplier -> contacts
```

未来才支持：

```text
supplier -> purchase_orders
supplier -> purchase_receipts
supplier -> purchase_returns
supplier -> AP
```

不得添加采购事实替代字段。

---

## Entity: contacts

### 分类

```text
MasterData
```

### 目的

记录客户或供应商联系人。

### 建模决策要求

本轮必须明确选择一种 contacts 归属方式：

#### 方案 A：owner_type + owner_id

```text
owner_type
owner_id
```

优点：

```text
字段少，支持 customer / supplier 统一联系人。
```

风险：

```text
数据库层缺少强外键。
必须在后续 usecase guard 中校验 owner 是否存在。
```

#### 方案 B：customer_id / supplier_id 双 nullable edge

```text
customer_id
supplier_id
```

优点：

```text
数据库关系更清楚。
```

风险：

```text
需要约束二选一。
如果 Ent/DB 无法加 check，需要后续 usecase guard。
```

Codex 必须基于现有 Ent 风格选择一种方案，并在 `.codex-review/latest.md` 说明：

```text
选择了哪种方案：
为什么：
DB 层能否约束：
后续 usecase 需要什么 guard：
```

### 推荐字段

```text
name
phone
role
is_primary
status
remark
created_at
updated_at
```

可选：

```text
email
wechat
```

如果这些只来自 current 样本，不要作为必填字段。

---

## Entity: sales_orders

### 分类

```text
Source Document / Business Commitment
```

### 目的

记录客户销售订单和业务承诺。

它不是出货事实。

### 推荐字段

V1 推荐字段：

```text
order_no
customer_id
customer_order_no
order_date
planned_delivery_date
status
approval_status
release_status
fulfillment_status
remark
created_at
updated_at
```

状态字段必须使用 canonical key。

推荐状态口径：

```text
status: draft / submitted / active / closed / canceled
approval_status: not_required / pending / approved / blocked
release_status: not_released / shipping_released / blocked
fulfillment_status: not_shipped / partial_shipped / fully_shipped
```

注意：

```text
fulfillment_status 是派生 / 缓存状态。
真实出货必须由 future shipments / shipment_items / inventory_txns 支撑。
```

不建议 V1 加入：

```text
invoice_status
payment_status
settlement_status
```

如果 Phase 2 cutline 已明确允许，可以作为 deferred/cache 字段记录；否则延后到 finance review。

不得加入：

```text
tenant_id
shipped fact fields
finance fact fields
```

### 关系

应关联：

```text
sales_order -> customer
sales_order -> sales_order_items
```

不得关联 future shipments 为已实现事实。

---

## Entity: sales_order_items

### 分类

```text
Source Document Line / Business Commitment Line
```

### 目的

记录销售订单行。

它不是出货事实。

### 推荐字段

V1 推荐字段：

```text
sales_order_id
product_id
product_code_snapshot
product_name_snapshot
color_snapshot
ordered_qty
unit_price
planned_delivery_date
status
remark
created_at
updated_at
```

字段说明：

```text
product_id 应关联现有 products。
product_code_snapshot / product_name_snapshot 用于历史快照。
color_snapshot 仅作为订单行快照或行业线索，不得因此新增 product_skus。
ordered_qty 记录订单承诺数量。
```

不建议 V1 加入：

```text
shipped_quantity
```

如果必须加入，必须明确：

```text
shipped_quantity 只能是 derived/cache。
真实来源必须是 future shipment facts。
不能人工维护成事实。
```

不得加入：

```text
tenant_id
inventory_txn_id
shipment_id
AR/AP fields
```

---

## 不允许新增的 schema

本轮不得新增：

```text
product_skus
purchase_orders
purchase_order_items
purchase_demands
supplier_material_profiles
customer_addresses
settlement_terms
order_revisions
stock_reservations
shipments
shipment_items
AR
AP
invoices
payments
reconciliations
change_records
tenant tables
license tables
billing tables
ticket tables
```

---

## business_records 边界

本轮不得改 `business_records`。

必须在文档或 review 中保持：

```text
business_records 继续作为兼容层、demo、seed、source snapshot、调研入口。
business_records 不长期替代正式 customers / suppliers / sales_orders / inventory / shipment / finance facts。
```

不得迁移旧数据。

不得修改前端 business record 页面。

---

## Workflow / Fact 边界

本轮 schema 不能让 Workflow 直接写 Fact。

必须保持：

```text
Workflow task done != Fact posted。
shipping_released != shipped。
shipment_release done -> shipping_released。
sales_order 是 Source Document。
shipment 才是未来出货事实。
inventory_txns 才是库存落账事实。
```

不得新增让 `workflow.go` 写这些对象的逻辑。

---

## tenant_id 规则

本轮禁止新增 `tenant_id`。

如果 grep 命中 `tenant_id`，必须解释是否只来自：

```text
imported notes
禁止说明
future SaaS 评审候选说明
current 不是 runtime tenant 说明
```

不得出现在新 schema 字段中。

---

## 测试分层选择

本轮必须选择测试层级。

### 静态检查

选择：是。

原因：

```text
本轮新增 Go schema 文件和文档，必须检查 diff、格式和语法风险。
```

命令：

```bash
git status --short
git diff --stat
git diff --check
```

### 单元测试

选择：是。

原因：

```text
新增 Ent schema Go 文件，至少要编译 schema package。
```

命令：

```bash
cd server && go test ./internal/data/model/schema
```

如果该 package 不存在或命令不适用，Codex 必须报告并选择最接近的 schema 编译检查命令，不得乱改生成代码。

### 集成测试

选择：否。

原因：

```text
本轮不生成 migration，不接 repo/usecase，不访问 DB。
```

### 冒烟测试

选择：否。

原因：

```text
本轮不改运行入口、部署、API 或 UI。
```

### 回归测试

选择：有限选择。

原因：

```text
本轮不改 runtime，但新 schema 文件不应破坏现有 biz/data 编译。
```

命令：

```bash
cd server && go test ./internal/biz ./internal/data
```

如果因为未生成 Ent 代码导致失败，必须判断是否与本轮 schema-only 分阶段策略有关，不得擅自运行 make data。

### E2E 测试

选择：否。

原因：

```text
本轮不改 UI 或用户路径。
```

### 视觉 / 样式回归

选择：否。

原因：

```text
本轮不改 UI / 样式。
```

---

## 验收命令

必须运行：

```bash
git status --short
git diff --stat
git diff --check
git ls-files --others --exclude-standard
grep -R "tenant_id" server/internal/data/model/schema docs/product docs/architecture docs/customers docs/reference config deployments || true
grep -R "shipping_released" docs/product docs/architecture docs/customers docs/reference || true
cd server && go test ./internal/data/model/schema
cd server && go test ./internal/biz ./internal/data
```

不得运行：

```bash
cd server && make data
cd server && make migrate_status
```

除非任务中止并明确说明为什么下一轮需要。

---

## 需要更新的已有文档

允许小幅更新：

### docs/current-source-of-truth.md

必须写清：

```text
V1 Ent schema files for customers / suppliers / contacts / sales_orders / sales_order_items have been added.
Runtime generated code, migration, repo/usecase, API and UI are not implemented yet.
Current runtime truth remains existing code and migrations.
```

### progress.md

记录本轮：

```text
003 V1 Ent schema cutline files added.
No migration / generate / repo / usecase / API / UI changes.
```

### docs/product/v1-next-codex-goals.md

可以更新下一轮建议：

```text
004-v1-migration-and-ent-generate
```

但不得把 004 写成已完成。

---

## 项目长期禁止项

必须遵守：

```text
- 不新增 tenant_id。
- 不实现 SaaS 多租户。
- 不实现 license server、套餐计费、客户工单系统。
- 不创建泛化 ChangeUsecase。
- 不创建泛化 change_records。
- 不把 current 客户资料写成 Product Core。
- 不让 WorkflowUsecase 写库存、出货、财务、应收、应付、发票、收付款事实。
- shipping_released != shipped。
- workflow task done != fact posted。
- business_records 是兼容层、demo、seed、source snapshot、调研入口，不是长期事实真源。
```

---

## 审查报告要求

本轮完成后必须生成：

```text
.codex-review/latest.md
```

审查报告必须遵守：

```text
docs/codex-goals/_review-output-protocol.md
```

用户必须能用下面命令复制：

```bash
cat .codex-review/latest.md | pbcopy
```

不要要求用户截图。

---

## 最终回复格式

Codex 最终回复必须包含：

```text
【完成】

【新增/修改文件】

【本轮改动范围】

【V1 Ent schema 新增清单】

【contacts 建模方案】

【sales_order / shipment fact 边界】

【business_records 边界】

【禁止路径检查】

【tenant_id 处理结论】

【Workflow / Fact 边界检查】

【测试层级选择】

【测试命令与结果】

【停止条件是否触发】

【Git 状态摘要】

【风险】

【下一轮 Codex Goal 建议】

【.codex-review/latest.md 复制命令】
cat .codex-review/latest.md | pbcopy
```

## 完成后给 GPT 的复盘材料

`.codex-review/latest.md` 必须包含：

```text
git status --short
git diff --stat
git ls-files --others --exclude-standard
新增 schema 文件清单
contacts 建模解释
tenant_id grep 解释
shipping_released grep 解释
禁止路径检查
测试层级选择
测试命令和结果
下一轮建议
```
````

### 061. user

_time `2026-05-30T23:20:07+08:00` · content_type `text` · node `0aa01143-7373-4139-afd4-15bf98d816f7`_

目前大概做到什么进度了，本会话要不要做一次上下文总结，防止上下文信息丢失严重？

### 062. assistant

_time `2026-05-30T23:23:21+08:00` · content_type `text` · node `643bbc6a-f042-4565-b2e1-bd2c924c1387`_

要，**现在很适合做一次上下文总结**。原因是本会话已经经历了：源码分析、产品化边界、两个设计 md 吸收、Phase 0/1/2 文档化、Codex 工作流模板、审查报告协议、测试分层、Goal 模板、`.codex-review` 策略等很多层内容。继续往下进入 schema / migration / repo/usecase 以后，如果没有总结，很容易把“已经评审通过的边界”和“只是讨论过的想法”混起来。

当前整体进度可以概括为：

```text
产品方向已定。
文档与架构骨架已基本搭好。
V1 schema cutline 已评审出来。
还没有真正落 Ent schema / migration / repo / usecase / API / UI。
下一步应进入 003：V1 Ent schema，且只落 customers / suppliers / contacts / sales_orders / sales_order_items。
```

你上传的最新 Codex 审查报告显示，最近一轮只是补 `AGENTS.md` 的 Codex 工作流规则，没有改 runtime、Ent schema、migration、API、UI、docs registry、seedData；它也明确工作区里已有 Phase 0/1/2 大量未跟踪文档和骨架，提交前要按路径核对边界。fileciteturn5file18turn5file10

---

# 当前项目进度总结

## 1. 产品与实施方向

项目已经从“帮一个甲方做系统”升级成：

```text
毛绒玩具行业 ERP 产品内核
+ current 第一个真实客户 / 种子客户 / 私有化客户实例
+ 后续多客户私有化部署
+ 未来再单独评审 SaaS 多租户
```

正式汇报资料里的业务方向是“岗位入口、任务驱动、桌面端 + 手机端”，第一期重点是打通订单到出货主链路，并同步建设手机端任务处理能力；第二期补异常中心、返工中心和管理看板；第三期补成本、供应商绩效、外发工厂绩效。fileciteturn5file3turn5file8

## 2. 架构边界已经定住

已经确立这些长期边界：

```text
不新增 tenant_id。
当前不做 SaaS runtime 多租户。
current 不是 runtime tenant。
不做 license server、套餐计费、客户工单系统。
不创建泛化 ChangeUsecase / change_records。
不把 current 客户资料写成 Product Core。
不让 Workflow 写库存、出货、财务事实。
business_records 是兼容层 / demo / seed / source snapshot，不是长期事实真源。
```

产品化设计文档的核心口径也是“一套标准产品内核、多套客户配置包、少量客户专属模板 / 适配层、极少数客户专属扩展，核心业务代码尽量不分叉”。fileciteturn5file0

## 3. Workflow / Fact 边界已经定住

核心口诀是：

```text
流程管协同，单据管阶段，事实管落账，结果靠计算，系统状态别混业务。
```

关键状态边界：

```text
workflow task done != fact posted
shipment_release done -> shipping_released
shipping_released != shipped
shipping_released 只能表示已放行 / 可发货 / 待出库
shipped 才是真实出货完成
inventory_txns posted 才是库存真的变了
```

状态分层文档明确强调：Workflow 只管协同和审批，不直接代表业务事实；业务事实必须由真实动作产生并可追溯；UI 文案可以配置，但不能改变系统语义。fileciteturn5file15

---

# 已完成的阶段

## Phase 0：0 到 1 架构骨架

已完成内容大致包括：

```text
docs/product/*
docs/architecture/status-workflow-fact-boundary.md
docs/customers/current/*
docs/reference/imported-notes/*
config/customers/current/README.md
config/industry-templates/plush/README.md
deployments/current/README.md
server/internal/core/* 空骨架
web/src/erp/modules/README.md
web/src/erp/mobile/roles/README.md
```

两个设计 md 已被作为 imported notes / reference only 吸收，不作为 runtime 或 schema 真源。最新审查报告也显示这些目录和文件多数还处于未跟踪状态，需要后续按路径核对后再提交。fileciteturn5file6turn5file11

## Phase 1：主数据 / 订单 / BOM / 采购前置评审

已完成 docs-only 评审，主要产物包括：

```text
docs/architecture/masterdata-order-source-document-review.md
docs/architecture/customer-supplier-masterdata-review.md
docs/architecture/product-sku-bom-boundary-review.md
docs/architecture/order-purchase-boundary-review.md
docs/product/domain-schema-draft-v1-v2.md
docs/product/migration-readiness-checklist.md
docs/product/phase1-implementation-plan.md
docs/product/phase1-risk-register.md
```

核心结论：

```text
V1 应优先评审 customers / suppliers / contacts / sales_orders / sales_order_items。
business_records 继续作为兼容层、demo、seed、source snapshot、调研入口，但不应长期替代正式主数据、订单源单据、库存、出货或财务事实。
BOM 是工程资料 / 物料需求来源，不是采购、库存或财务事实。
```

## Phase 2：Schema final review / implementation cutline

已完成 docs-only 的 schema final review。

结论：

```text
V1 Go:
- customers
- suppliers
- contacts
- sales_orders
- sales_order_items

Draft Only:
- product_skus
- customer_addresses
- supplier_material_profiles
- settlement_terms
- order_revisions
- BOM version extension
- purchase_orders
- purchase_order_items
- purchase_demands

Deferred:
- stock_reservations
- shipments
- shipment_items
- AR/AP/invoice/payment/reconciliation
- production facts
- outsourcing facts
```

Codex 最近的报告里也继续确认：没有新增 `tenant_id` 字段，`tenant_id` 命中只出现在禁止说明、future SaaS 评审边界或 imported notes 中；正式文档继续明确 `shipping_released != shipped`。fileciteturn5file14turn5file12

## Codex 工作流治理

已建立或正在完善：

```text
docs/codex-goals/README.md
docs/codex-goals/_new-session-goal-template.md
docs/codex-goals/_goal-file-template.md
docs/codex-goals/_review-output-protocol.md
.codex-review/latest.md
```

当前规则是：

```text
新 Goal 新开 Codex 会话。
同 Goal 内补漏 / 修测试 / 补 review report 继续原会话。
Codex Goal 用中文短 Goal。
复杂任务写 docs/codex-goals/*.md。
Codex 每轮生成 .codex-review/latest.md。
用户复制 latest.md 给 GPT，不再截图。
```

最新报告显示，本轮主要是合并补充 `AGENTS.md` 的 Codex 工作流规则，并没有触达 runtime、schema、migration 等实现路径。fileciteturn5file18

---

# 还没有做的内容

目前还没有真正落地：

```text
Ent schema
migration
Ent generate
repo / usecase
API / RBAC
前端 UI
数据导入
business_records 迁移
出货事实
库存预留
财务事实
生产 / 委外事实
```

尤其注意：

```text
shipments / shipment_items / stock_reservations 仍然 deferred。
product_skus 仍然 Draft Only / No-Go for next schema。
purchase_orders 仍然 Draft Only / V2 candidate。
```

---

# 当前最小安全下一步

当前下一步应该是：

```text
003-v1-ent-schema-customers-suppliers-orders
```

目标只允许落：

```text
server/internal/data/model/schema/customer.go
server/internal/data/model/schema/supplier.go
server/internal/data/model/schema/contact.go
server/internal/data/model/schema/sales_order.go
server/internal/data/model/schema/sales_order_item.go
```

禁止同轮做：

```text
migration
make data
repo/usecase
API/RBAC
UI
seedData
docs registry
business_records 迁移
product_skus
purchase_orders
shipments
stock_reservations
finance facts
```

这是从“评审文档”进入“第一批 schema 实现”的第一步，范围一定要小。

---

# 当前主要风险

## 1. 工作区未提交内容太多

最新审查报告显示，工作区已有大量未跟踪文件，包括 `.codex-review/`、`config/`、`deployments/`、`docs/product/`、`docs/codex-goals/`、`docs/customers/`、`server/internal/core/`、`web/src/erp/modules/` 等。fileciteturn5file18turn5file6

建议在进入 003 前做一次 checkpoint：

```text
要么按 Phase 0/1/2 文档和骨架分批提交；
要么至少生成 review bundle；
不要继续无限叠加 untracked 文件。
```

## 2. imported notes 里有历史反例

`erp_status_workflow_context.md` 的 imported note 中仍有 `tenant_id` 字段示例，也有历史上把 `shipping_released` 显示为“已出库”的反例；正式文档已经声明 imported notes 不是当前真源，但 grep 仍会命中这些内容。fileciteturn5file13turn5file12

处理方式：

```text
不要删除 imported notes。
不要把 imported notes 当 schema 真源。
审查报告里解释命中来源即可。
```

## 3. 下一步 schema 容易越界

003 很容易不小心扩展到：

```text
product_skus
purchase_orders
shipments
stock_reservations
business_records 迁移
repo/usecase
migration
```

这些都不应该在 003 做。

---

# 是否要做本会话上下文总结

**要。建议现在就做，并把下面这段保存起来。**

你可以把下面内容保存成：

```text
docs/codex-goals/_gpt-context-summary.md
```

或者以后新开 GPT 会话时直接复制。

---

# GPT 上下文总结，可复制

```text
这是 plush-toy-erp 项目的上下文总结。

项目定位：
- 毛绒玩具行业 ERP 产品内核。
- current 是第一个真实客户 / 种子客户 / 私有化客户实例 / 客户配置包来源。
- current 不是 SaaS runtime tenant。
- 当前不新增 tenant_id。
- 当前不做 SaaS 多租户、license server、套餐计费、客户工单系统。
- 目标是一套产品内核 + 毛绒玩具行业模板 + 多客户配置包 + 少量客户扩展。

业务方向：
- 正式汇报资料确定系统是岗位入口、任务驱动、桌面端 + 手机端。
- 第一期先打通订单到出货主链路，并同步建设手机端任务处理能力。
- 第二期补异常中心、返工中心和管理看板。
- 第三期补成本、供应商绩效、外发工厂绩效。

长期架构边界：
- Workflow task done != Fact posted。
- shipment_release done -> shipping_released。
- shipping_released != shipped。
- shipping_released 只能表示已放行 / 可发货 / 待出库。
- shipped 才是真实出货完成。
- inventory_txns posted 才是库存真的变了。
- Workflow 不写库存、出货、财务、应收、应付、发票、收付款事实。
- business_records 是兼容层、demo、seed、source snapshot、调研入口，不是长期事实真源。
- current 客户资料不能直接写成 Product Core。
- 不创建泛化 ChangeUsecase / change_records。

已完成 Phase 0：
- 建立 0 到 1 产品化架构骨架。
- 吸收两个设计 md 为 imported notes / reference only。
- 创建 docs/product/*
- 创建 docs/architecture/status-workflow-fact-boundary.md
- 创建 docs/customers/current/*
- 创建 config/customers/current/README.md
- 创建 config/industry-templates/plush/README.md
- 创建 deployments/current/README.md
- 创建 server/internal/core/* 空骨架
- 创建 web/src/erp/modules/README.md
- 创建 web/src/erp/mobile/roles/README.md

已完成 Phase 1：
- 主数据、订单源单据、BOM、采购前置模型评审。
- 产物包括：
  docs/architecture/masterdata-order-source-document-review.md
  docs/architecture/customer-supplier-masterdata-review.md
  docs/architecture/product-sku-bom-boundary-review.md
  docs/architecture/order-purchase-boundary-review.md
  docs/product/domain-schema-draft-v1-v2.md
  docs/product/migration-readiness-checklist.md
  docs/product/phase1-implementation-plan.md
  docs/product/phase1-risk-register.md

已完成 Phase 2：
- schema final review 和 V1 implementation cutline。
- V1 Go:
  customers
  suppliers
  contacts
  sales_orders
  sales_order_items
- Draft Only:
  product_skus
  customer_addresses
  supplier_material_profiles
  settlement_terms
  order_revisions
  BOM version extension
  purchase_orders
  purchase_order_items
  purchase_demands
- Deferred:
  stock_reservations
  shipments
  shipment_items
  AR/AP/invoice/payment/reconciliation
  production facts
  outsourcing facts

Codex 工作流：
- 使用中文短 Goal。
- 复杂任务写 docs/codex-goals/*.md。
- 每个独立 Goal 建议新开 Codex 会话。
- 同一 Goal 内补漏、修测试、生成 review report 可以继续原会话。
- 每轮 Codex 完成后生成 .codex-review/latest.md。
- 用户复制 latest.md 给 GPT，不再截图。
- 重要模板：
  docs/codex-goals/README.md
  docs/codex-goals/_new-session-goal-template.md
  docs/codex-goals/_goal-file-template.md
  docs/codex-goals/_review-output-protocol.md

当前工作区风险：
- Phase 0/1/2 有大量未跟踪文档和骨架。
- 提交前需要按路径核对边界。
- imported notes 中仍有 tenant_id 示例和 shipping_released 反例，但它们只是 reference only，不是当前真源。

下一步建议：
- 进入 003-v1-ent-schema-customers-suppliers-orders。
- 只落 V1 cutline 明确允许的 Ent schema：
  customer.go
  supplier.go
  contact.go
  sales_order.go
  sales_order_item.go
- 003 禁止：
  migration
  make data
  repo/usecase
  API/RBAC
  UI
  docs registry
  seedData
  business_records 迁移
  product_skus
  purchase_orders
  shipments
  stock_reservations
  finance facts
  tenant_id
  SaaS runtime tenant
```

---

# 我的建议

现在本会话确实应该做一次上下文总结。上面这份已经可以作为“本会话交接摘要”。

接下来最稳的顺序是：

```text
1. 把当前 Phase 0/1/2 和 Codex 工作流相关文件做一次 checkpoint。
2. 确认 .codex-review/ 是否 gitignore。
3. 确认 _goal-file-template.md / _review-output-protocol.md / _new-session-goal-template.md 已经是最终版。
4. 再执行 003：V1 Ent schema。
```

如果你现在不想先提交，也至少在进入 003 前保存一份 review bundle，避免 untracked 文件越堆越多。

### 063. user

_time `2026-05-30T23:27:30+08:00` · content_type `text` · node `125557af-757b-4bde-8fb2-17188a668ea0`_

那就做，我切换到了最好的extended pro模型了

### 064. user

_time `2026-05-30T23:28:36+08:00` · content_type `text` · node `42a6b0e0-53be-422f-80a2-31ccb1173732`_

先问为什么是新开会话总结，新开会话知道本会话的上下文吗

### 065. assistant

_time `2026-05-30T23:31:27+08:00` · content_type `text` · node `8dd66897-3187-4069-8ce4-975c40c285cd`_

不会。**新开 GPT 会话默认不知道本会话的完整上下文。**

所以我说要做“新开会话总结”，不是因为新会话知道上下文，而是因为：

```text
新 GPT 会话不知道本会话细节
-> 需要你把总结或 .codex-review/latest.md 贴过去
-> 它才能继续判断下一轮 Codex Goal
```

你可以这样理解：

| 场景 | 是否知道本会话上下文 |
|---|---:|
| 当前这个 GPT 会话继续聊 | 知道，但上下文太长后可能丢细节 |
| 新开 GPT 会话 | 默认不知道 |
| 新开 Codex 会话 | 默认不知道聊天上下文，只能读仓库文件 |
| Codex 读 AGENTS.md / docs/codex-goals/*.md | 知道写进仓库的规则 |
| 你把 `.codex-review/latest.md` 贴给 GPT | GPT 才知道上一轮 Codex 做了什么 |

所以总结的目的有两个：

```text
1. 防止当前 GPT 会话太长后上下文丢失。
2. 方便未来新 GPT 会话快速恢复项目状态。
```

不是说新会话自动知道，而是**给新会话一个可复制的上下文包**。

---

## 为什么不能只靠“记忆”

不建议靠记忆。记忆最多适合保存你的偏好，比如：

```text
Goal 用中文
给完整可复制 md
不要截图
Codex 输出 .codex-review/latest.md
```

但不适合保存项目当前状态，比如：

```text
Phase 0 做了哪些文件
Phase 1 结论是什么
Phase 2 V1 Go 表有哪些
下一轮 003 允许哪些 schema
哪些文件禁止修改
当前 workspace 有哪些 untracked
```

这些必须写进仓库文件或 `.codex-review/latest.md`，否则新会话很容易误判。

---

## 现在为什么要做总结

因为你这个会话已经累积了很多关键结论：

```text
产品化路线
Workflow / Fact 边界
current 客户定位
Phase 0/1/2 完成情况
V1 schema cutline
Codex 工作流
review report 规则
测试分层
模板文件规则
```

下一步要进入真正 schema 落地，一旦上下文丢，风险就很大。

尤其下一轮只允许做：

```text
customers
suppliers
contacts
sales_orders
sales_order_items
```

不能顺手做：

```text
migration
repo/usecase
API
UI
product_skus
purchase_orders
shipments
stock_reservations
finance facts
tenant_id
```

这类边界最好写成一份 `_gpt-context-summary.md`，以后新 GPT 会话直接贴。

---

## 新开 GPT 会话时最少给什么

最少给：

```text
.codex-review/latest.md
```

它告诉 GPT：

```text
上一轮 Codex 做了什么
改了哪些文件
测试跑了什么
有没有越界
下一轮建议是什么
```

如果要让我恢复完整项目上下文，再加：

```text
docs/codex-goals/_gpt-context-summary.md
```

如果要让我检查 Goal 是否按规则写，再加：

```text
docs/codex-goals/_new-session-goal-template.md
docs/codex-goals/_review-output-protocol.md
docs/codex-goals/_goal-file-template.md
```

---

## 结论

**新开 GPT 会话不知道本会话上下文。**

所以需要：

```text
.codex-review/latest.md
+ 可选 _gpt-context-summary.md
```

来交接。

当前这个会话里我知道上下文，但为了防止后面上下文太长丢失，以及方便你以后新开 GPT 会话，建议现在做一份：

```text
docs/codex-goals/_gpt-context-summary.md
```

它不是给 Codex 执行的任务，而是给 GPT 恢复项目上下文用的“交接摘要”。

### 066. user

_time `2026-05-30T23:36:50+08:00` · content_type `text` · node `345e8036-e8eb-4d64-8eb1-0702995f5c92`_

我说的是本会话要不要先总结下上下文，避免丢失，不是新开，另外新开会话的话，它又没本项目的上下文，会不会有信息差导致给的goal质量低？要不要新开会话的同时上传所有代码和发送.codex-review/latest.md给它？

### 067. user

_time `2026-05-31T00:03:37+08:00` · content_type `text` · node `8962e267-3f0c-4250-9210-1e51e4439679`_

我说的是本会话要不要先总结下上下文，避免丢失，不是新开，另外新开会话的话，它又没本项目的上下文，会不会有信息差导致给的goal质量低？要不要新开会话的同时上传所有代码和发送.codex-review/latest.md给它？

### 068. assistant

_time `2026-05-31T00:03:39+08:00` · content_type `text` · node `eb4e5107-d5c6-4c14-ae69-cbbd3dc4735b`_

对，你说的是**当前这个 GPT 会话内部先做一次上下文压缩总结**，防止后面继续聊的时候我丢关键边界。这个要做，而且现在正是合适时间。

另外，新开 GPT 会话确实会有信息差。**新会话默认不知道本项目上下文**，除非你把上下文材料贴过去或上传过去。所以新开 GPT 会话时，不能只说“继续之前项目”，那样给出来的 Codex Goal 质量会下降。

## 结论

当前会话：**现在做一次上下文总结。**

新开 GPT 会话：**不需要每次上传所有代码，但至少要给 `.codex-review/latest.md`。**

新开 Codex 会话：**不用上传代码，因为 Codex 在你的仓库里工作；但要让它读 `AGENTS.md` 和 `docs/codex-goals/<goal>.md`。**

---

## 新开 GPT 会话要不要上传所有代码？

分情况。

| 你要 GPT 做什么 | 需要给什么 |
|---|---|
| 只判断上一轮 Codex 是否合格，并给下一轮 Goal | `.codex-review/latest.md` 基本够 |
| 让我按既定规则写下一轮 Codex Goal | `.codex-review/latest.md` + 上一轮 goal md 更稳 |
| 让我重新审查项目整体架构 | 需要 `AGENTS.md`、`current-source-of-truth.md`、`progress.md`、`docs/product/*`、`docs/architecture/*` |
| 让我基于真实代码写 schema/repo/usecase 的精确 Goal | 最好上传源码 zip 或 review bundle |
| 大阶段结束，比如 Phase 0/1/2 后 | 建议上传源码 zip 或 review bundle |
| 每一个小 Codex 任务后 | 不需要上传所有代码 |

所以最推荐：

```text
日常小循环：
.codex-review/latest.md
+ 上一轮 docs/codex-goals/<goal>.md

阶段审查：
review bundle 或源码 zip
+ .codex-review/latest.md
```

不要每次都上传完整代码。完整代码适合阶段结束、目录大改、schema/migration 前后、或者我需要重新完整读仓库的时候。

---

## 为什么 `.codex-review/latest.md` 很重要

你这次上传的审查报告已经包含了核心交接信息：Goal 信息、完成摘要、改动文件、`git status --short`、`git diff --stat`、未跟踪文件、禁止路径检查、`tenant_id` 检查、Workflow / Fact 边界检查、测试结果和风险。它还明确本轮没有改 runtime、Ent schema、migration、API、UI、docs registry、seedData。fileciteturn6file0

这类报告比截图有价值得多，因为我可以直接判断：

```text
有没有误加 tenant_id
有没有改禁止路径
有没有混淆 Workflow / Fact
有没有把 current 客户资料写成 Product Core
测试是否足够
下一轮 Goal 是否应该继续
```

---

## 新开 GPT 会话会不会因为没代码导致 Goal 质量低？

会，**如果你只给一句话**。

不会，**如果你给足交接材料**。

最低要求：

```text
.codex-review/latest.md
```

更稳要求：

```text
.codex-review/latest.md
docs/codex-goals/<上一轮 goal>.md
docs/codex-goals/<下一轮 goal 草案，如果已有>
```

如果新会话要我重新判断代码层面的实现细节，那就上传：

```text
源码 zip
或 review bundle
```

但如果只是“根据上一轮 Codex 输出，继续给下一轮 Goal”，不需要完整代码。

---

## 当前会话上下文总结

下面这段建议你保存成：

```text
docs/codex-goals/_gpt-context-summary.md
```

或者直接留在当前会话里，后面我可以继续基于它工作。

```md
# plush-toy-erp 当前 GPT 会话上下文总结

## 1. 项目定位

plush-toy-erp 是一个毛绒玩具行业 ERP 产品内核项目。

当前目标不是一次性外包系统，而是：

- 先服务 current 甲方上线。
- 沉淀为毛绒玩具行业 ERP 产品内核。
- 后续支持多个客户私有化部署。
- 未来再单独评审 SaaS 多租户。

current 甲方定位：

- 第一个真实客户。
- 种子客户。
- 第一个私有化客户实例。
- 第一个客户配置包来源。

current 甲方不是：

- SaaS runtime tenant。
- 数据库多租户。
- 多租户 RBAC 隔离对象。
- Product Core 规则来源。

## 2. 长期禁止项

当前阶段禁止：

- 不新增 tenant_id。
- 不实现 SaaS 多租户。
- 不实现 license server。
- 不实现套餐计费。
- 不实现客户工单系统。
- 不创建泛化 ChangeUsecase。
- 不创建泛化 change_records。
- 不把 current 客户资料写成 Product Core。
- 不让 WorkflowUsecase 写库存、出货、财务、应收、应付、发票、收付款事实。
- 不把 business_records 当长期事实真源。

## 3. 产品化原则

项目采用：

- 一套标准产品内核。
- 一个毛绒玩具行业模板。
- 多个客户配置包。
- 少量客户专属模板 / 数据适配。
- 极少数客户扩展。
- 核心业务代码尽量不分叉。

客户可以配置：

- 公司名。
- Logo。
- 菜单开关。
- 模块开关。
- 字段显示 / 必填。
- 编号规则。
- 打印模板。
- 角色模板。
- 权限模板。
- 初始化数据。
- 默认仓库。
- 默认单位。

客户不能配置：

- 库存扣减规则。
- 入库增库存规则。
- 财务核销逻辑。
- 审计关闭。
- 库存流水删除。
- 核心状态机自由拖拽。
- 数据库结构。
- 自定义核心业务对象。

## 4. Workflow / Fact 边界

核心口诀：

流程管协同，单据管阶段，事实管落账，结果靠计算，系统状态别混业务。

关键边界：

- Workflow task done != Fact posted。
- shipment_release done -> shipping_released。
- shipping_released != shipped。
- shipping_released 只能表示已放行 / 可发货 / 待出库。
- shipped 才是真实出货完成。
- inventory_txns posted 才是库存真的变了。
- quality task done != quality_inspection passed。
- sales_order 是 Source Document，不是 shipment fact。
- purchase_order 是采购承诺，不是 purchase_receipt 入库事实。
- business_records 不替代正式事实表。

正式汇报资料明确项目是岗位入口、任务驱动、桌面端 + 手机端，第一期重点是订单到出货主链路和手机端任务处理能力。fileciteturn6file4

两个设计 md 里也明确了产品化配置、权限、流程、状态分层和 Workflow / Fact 边界。fileciteturn6file1 fileciteturn6file2

## 5. 已完成 Phase 0

Phase 0 是 docs-only / 架构骨架阶段。

已完成：

- 产品化架构骨架。
- 状态分层。
- 配置权限策略。
- current 客户实例边界。
- imported design notes。
- docs/product/* 初步文档。
- docs/architecture/status-workflow-fact-boundary.md。
- docs/customers/current/*。
- config/customers/current/README.md。
- config/industry-templates/plush/README.md。
- deployments/current/README.md。
- server/internal/core/* 空骨架。
- web/src/erp/modules/README.md。
- web/src/erp/mobile/roles/README.md。

未落：

- runtime。
- Ent schema。
- migration。
- repo/usecase。
- API。
- UI。

## 6. 已完成 Phase 1

Phase 1 是主数据、订单源单据、BOM、采购前置模型评审。

主要产物：

- docs/architecture/masterdata-order-source-document-review.md
- docs/architecture/customer-supplier-masterdata-review.md
- docs/architecture/product-sku-bom-boundary-review.md
- docs/architecture/order-purchase-boundary-review.md
- docs/product/domain-schema-draft-v1-v2.md
- docs/product/migration-readiness-checklist.md
- docs/product/phase1-implementation-plan.md
- docs/product/phase1-risk-register.md

核心结论：

- customers / suppliers / contacts 属于 MasterData。
- sales_orders / sales_order_items 属于 Source Document / Business Commitment。
- business_records 保留为兼容层、demo、seed、source snapshot、调研入口。
- business_records 不能长期替代正式主数据、订单、库存、出货或财务事实。
- BOM 是工程资料 / 物料需求来源，不是采购、库存或财务事实。

## 7. 已完成 Phase 2

Phase 2 是 schema final review 和 V1 implementation cutline。

V1 Go：

- customers
- suppliers
- contacts
- sales_orders
- sales_order_items

Draft Only：

- product_skus
- customer_addresses
- supplier_material_profiles
- settlement_terms
- order_revisions
- BOM version extension
- purchase_orders
- purchase_order_items
- purchase_demands

Deferred：

- stock_reservations
- shipments
- shipment_items
- AR/AP/invoice/payment/reconciliation
- production facts
- outsourcing facts

Phase 2 结论：

- Proceed With Restrictions。
- 下一轮 003 只允许落 V1 cutline 中的 Ent schema。
- 不得同时做 repo/usecase、API/RBAC、UI、seed、docs registry 或 business_records 迁移。

## 8. Codex 工作流已定

长期使用：

- 中文短 Goal。
- 复杂任务写入 docs/codex-goals/*.md。
- 每个独立 Goal 建议新开 Codex 会话。
- 同一 Goal 内补漏、测试失败修复、生成 review 报告，可以继续原 Codex 会话。
- 每轮完成后生成 .codex-review/latest.md。
- 用户复制 latest.md 给 GPT，不再截图。

关键模板：

- docs/codex-goals/README.md
- docs/codex-goals/_new-session-goal-template.md
- docs/codex-goals/_goal-file-template.md
- docs/codex-goals/_review-output-protocol.md

当前关于 .codex-review/runs 的建议：

- 可以保留最近 5 条本地历史。
- .codex-review/ 建议 gitignore。
- 日常给 GPT 只复制 .codex-review/latest.md。

## 9. 当前工作区风险

当前工作区已有大量未跟踪文件和 Phase 0/1/2 文档骨架。

最新审查报告显示：

- tracked diff 包括 AGENTS.md、README.md、docs/current-source-of-truth.md、progress.md、两个 web docs。
- untracked 包括 .codex-review、config、deployments、docs/product、docs/architecture、docs/codex-goals、docs/customers、docs/reference、server/internal/core、web/src/erp/modules 等。
- 本轮没有改 runtime、Ent schema、migration、API、UI、docs registry、seedData。fileciteturn6file0

进入 003 前建议：

- 做一次 checkpoint。
- 或至少生成 review bundle。
- 确认 .codex-review 是否 gitignore。
- 不要继续无限叠加 untracked 文件。

## 10. 下一步建议

下一步应执行：

docs/codex-goals/003-v1-ent-schema-customers-suppliers-orders.md

003 只允许落：

- server/internal/data/model/schema/customer.go
- server/internal/data/model/schema/supplier.go
- server/internal/data/model/schema/contact.go
- server/internal/data/model/schema/sales_order.go
- server/internal/data/model/schema/sales_order_item.go

003 禁止：

- migration
- make data
- repo/usecase
- API/RBAC
- UI
- docs registry
- seedData
- business_records 迁移
- product_skus
- purchase_orders
- shipments
- stock_reservations
- finance facts
- tenant_id
- SaaS runtime tenant

## 11. 新 GPT 会话交接规则

新 GPT 会话默认不知道本会话上下文。

新 GPT 会话最少提供：

- .codex-review/latest.md

更稳提供：

- .codex-review/latest.md
- docs/codex-goals/<上一轮 goal>.md
- docs/codex-goals/_gpt-context-summary.md

如果让 GPT 重新完整审查源码或写非常精确的实现 Goal，再上传：

- review bundle
- 或源码 zip

日常小循环不需要每轮上传完整代码。
```

---

## 最后给你一个直接判断

**当前会话要总结。**  
这份总结就是为了防止当前会话后续信息丢失。

**新 GPT 会话会有信息差。**  
所以新 GPT 会话至少贴 `.codex-review/latest.md`，最好再贴 `_gpt-context-summary.md`。

**不需要每次上传所有代码。**  
只有当你要我重新审查真实代码状态、阶段结束、schema/migration 前后，才上传源码 zip 或 review bundle。日常下一轮 Goal 生成，`.codex-review/latest.md` 就够。

### 069. user

_time `2026-05-31T00:04:55+08:00` · content_type `text` · node `cd69563d-aa1d-4b68-8d9f-4bf9d146049d`_

003已经执行完了的，再次给出上下文总结的md我复制

### 070. assistant

_time `2026-05-31T00:04:56+08:00` · content_type `text` · node `48ca23fb-5f8b-45d6-96d7-6e994817f3f3`_

下面这份是更新到 **003 已执行完** 的上下文总结，可保存为：

```text
docs/codex-goals/_gpt-context-summary.md
```

依据是你刚上传的 003 审查报告：003 已经只新增 V1 cutline 允许的 5 个 Ent schema 文件，未生成 Ent 代码、未新增 migration、未接 repo/usecase、API、RBAC、UI、docs registry 或 seedData；`contacts` 采用 `owner_type + owner_id`，`sales_orders/items` 仍是 Source Document，不是 shipment / inventory / finance fact。fileciteturn7file0

:::writing{variant="document" id="48291"}
# plush-toy-erp GPT 上下文总结

## 1. 项目定位

`plush-toy-erp` 是一个毛绒玩具行业 ERP 产品内核项目。

当前目标不是一次性外包系统，而是：

- 先服务 `current` 甲方上线。
- 沉淀为毛绒玩具行业 ERP 产品内核。
- 后续支持多个客户私有化部署。
- 未来再单独评审 SaaS 多租户。

`current` 甲方定位：

- 第一个真实客户。
- 种子客户。
- 第一个私有化客户实例。
- 第一个客户配置包来源。

`current` 甲方不是：

- SaaS runtime tenant。
- 数据库多租户。
- 多租户 RBAC 隔离对象。
- Product Core 规则来源。

## 2. 长期禁止项

当前阶段禁止：

- 不新增 `tenant_id`。
- 不实现 SaaS 多租户。
- 不实现 license server。
- 不实现套餐计费。
- 不实现客户工单系统。
- 不创建泛化 `ChangeUsecase`。
- 不创建泛化 `change_records`。
- 不把 `current` 客户资料写成 Product Core。
- 不让 `WorkflowUsecase` 写库存、出货、财务、应收、应付、发票、收付款事实。
- 不把 `business_records` 当长期事实真源。

## 3. 产品化原则

项目采用：

- 一套标准产品内核。
- 一个毛绒玩具行业模板。
- 多个客户配置包。
- 少量客户专属模板 / 数据适配。
- 极少数客户扩展。
- 核心业务代码尽量不分叉。

客户可以配置：

- 公司名。
- Logo。
- 菜单开关。
- 模块开关。
- 字段显示 / 必填。
- 编号规则。
- 打印模板。
- 角色模板。
- 权限模板。
- 初始化数据。
- 默认仓库。
- 默认单位。

客户不能配置：

- 库存扣减规则。
- 入库增库存规则。
- 财务核销逻辑。
- 审计关闭。
- 库存流水删除。
- 核心状态机自由拖拽。
- 数据库结构。
- 自定义核心业务对象。

## 4. Workflow / Fact 边界

核心口诀：

```text
流程管协同，单据管阶段，事实管落账，结果靠计算，系统状态别混业务。
```

关键边界：

- `Workflow task done != Fact posted`。
- `shipment_release done -> shipping_released`。
- `shipping_released != shipped`。
- `shipping_released` 只能表示已放行 / 可发货 / 待出库。
- `shipped` 才是真实出货完成。
- `inventory_txns posted` 才是库存真的变了。
- `quality task done != quality_inspection passed`。
- `sales_order` 是 Source Document，不是 shipment fact。
- `purchase_order` 是采购承诺，不是 `purchase_receipt` 入库事实。
- `business_records` 不替代正式事实表。

## 5. 已完成 Phase 0

Phase 0 是 docs-only / 架构骨架阶段。

已完成：

- 产品化架构骨架。
- 状态分层。
- 配置权限策略。
- `current` 客户实例边界。
- imported design notes。
- `docs/product/*` 初步文档。
- `docs/architecture/status-workflow-fact-boundary.md`。
- `docs/customers/current/*`。
- `config/customers/current/README.md`。
- `config/industry-templates/plush/README.md`。
- `deployments/current/README.md`。
- `server/internal/core/*` 空骨架。
- `web/src/erp/modules/README.md`。
- `web/src/erp/mobile/roles/README.md`。

未落：

- runtime。
- Ent schema。
- migration。
- repo/usecase。
- API。
- UI。

## 6. 已完成 Phase 1

Phase 1 是主数据、订单源单据、BOM、采购前置模型评审。

主要产物：

- `docs/architecture/masterdata-order-source-document-review.md`
- `docs/architecture/customer-supplier-masterdata-review.md`
- `docs/architecture/product-sku-bom-boundary-review.md`
- `docs/architecture/order-purchase-boundary-review.md`
- `docs/product/domain-schema-draft-v1-v2.md`
- `docs/product/migration-readiness-checklist.md`
- `docs/product/phase1-implementation-plan.md`
- `docs/product/phase1-risk-register.md`

核心结论：

- `customers / suppliers / contacts` 属于 MasterData。
- `sales_orders / sales_order_items` 属于 Source Document / Business Commitment。
- `business_records` 保留为兼容层、demo、seed、source snapshot、调研入口。
- `business_records` 不能长期替代正式主数据、订单、库存、出货或财务事实。
- BOM 是工程资料 / 物料需求来源，不是采购、库存或财务事实。

## 7. 已完成 Phase 2

Phase 2 是 schema final review 和 V1 implementation cutline。

V1 Go：

- `customers`
- `suppliers`
- `contacts`
- `sales_orders`
- `sales_order_items`

Draft Only：

- `product_skus`
- `customer_addresses`
- `supplier_material_profiles`
- `settlement_terms`
- `order_revisions`
- BOM version extension
- `purchase_orders`
- `purchase_order_items`
- `purchase_demands`

Deferred：

- `stock_reservations`
- `shipments`
- `shipment_items`
- AR/AP/invoice/payment/reconciliation
- production facts
- outsourcing facts

Phase 2 结论：

- Proceed With Restrictions。
- 下一轮 003 只允许落 V1 cutline 中的 Ent schema。
- 不得同时做 repo/usecase、API/RBAC、UI、seed、docs registry 或 business_records 迁移。

## 8. 已完成 Phase 3 / Goal 003

Goal 文件：

```text
docs/codex-goals/003-v1-ent-schema-customers-suppliers-orders.md
```

Goal 名称：

```text
003：V1 Ent schema：customers / suppliers / contacts / sales_orders / sales_order_items
```

任务类型：

```text
Schema-only
```

003 已完成内容：

- 只新增 V1 cutline 允许的 5 个 Ent schema 文件。
- 未生成 Ent 代码。
- 未新增 Atlas migration。
- 未接 repo/usecase。
- 未接 API/RBAC。
- 未接 UI。
- 未改 docs registry。
- 未改 seedData。
- 未改 `workflow.go`。
- 未改 `rbac.go`。
- 未改 server runtime 业务逻辑。

新增 schema 文件：

- `server/internal/data/model/schema/customer.go`
- `server/internal/data/model/schema/supplier.go`
- `server/internal/data/model/schema/contact.go`
- `server/internal/data/model/schema/sales_order.go`
- `server/internal/data/model/schema/sales_order_item.go`

同步小幅更新：

- `docs/current-source-of-truth.md`
- `docs/product/v1-implementation-cutline.md`
- `docs/product/v1-next-codex-goals.md`
- `docs/product/v1-schema-go-no-go.md`
- `progress.md`

## 9. 003 的关键 schema 决策

### customers

分类：

```text
MasterData
```

用途：

- 客户主数据。
- 支撑销售订单。
- 未来支撑出货、应收、发票、对账。

特征：

- 使用现有主数据风格。
- `code` unique。
- `name`。
- 可选 `short_name`。
- 可选 `tax_no`。
- `is_active`。
- `note`。
- `created_at / updated_at`。

### suppliers

分类：

```text
MasterData
```

用途：

- 供应商主数据。
- 未来支撑采购、委外、采购入库、采购退货、应付、对账。

特征：

- 使用现有主数据风格。
- `code` unique。
- `name`。
- 可选 `short_name`。
- 可选 `tax_no`。
- `supplier_type` nullable 稳定 key。
- `supplier_type` DB check 限制为：
  - `material`
  - `outsourcing`
  - `service`
  - `mixed`
- `is_active`。
- `note`。
- `created_at / updated_at`。

V1 未加入：

- 银行账号。
- 开票信息完整模型。
- 账期。
- supplier_material_profiles。
- 财务事实字段。

### contacts

分类：

```text
MasterData
```

建模方案：

```text
owner_type + owner_id
```

用途：

- 同一张 contacts 表支持 customer / supplier 联系人。

DB 层约束：

- `owner_type` 枚举。
- owner_type 只允许：
  - `CUSTOMER`
  - `SUPPLIER`
- partial unique index 限制同一 owner 最多一个 primary contact。

风险：

- DB 层无法建立跨 `customers / suppliers` 的强外键。
- `owner_id` 是否存在必须由后续 repo/usecase guard 校验。

后续必须补：

- usecase guard 校验 owner_type。
- usecase guard 校验 owner_id 是否存在。
- usecase guard 校验同一 owner primary contact 规则。
- 测试覆盖 customer / supplier 两种 owner。

### sales_orders

分类：

```text
Source Document / Business Commitment
```

用途：

- 销售订单源单据。
- 记录客户订单和业务承诺。
- 不代表真实出货事实。
- 不代表库存扣减。
- 不代表应收或开票。

003 关键边界：

- 只落 `lifecycle_status`。
- 不落 release / fulfillment / finance 状态。
- 避免把 source document 状态误当 shipment 或 finance fact。

### sales_order_items

分类：

```text
Source Document Line / Business Commitment Line
```

用途：

- 销售订单明细。
- 记录订单承诺数量、产品快照、价格等信息。
- 不是出货事实。
- 不是库存事实。
- 不是财务事实。

003 关键边界：

- 关联现有 `products`。
- 保留 product snapshot。
- 不新增 `product_sku_id`。
- 不新增 `shipped_quantity`。
- 不新增 shipment、inventory、AR/AP、invoice、payment 字段。

## 10. 003 明确没有做的内容

003 没有做：

- `tenant_id`
- SaaS runtime tenant tables
- license server tables
- billing / plan tables
- customer ticket tables
- `ChangeUsecase`
- `change_records`
- `product_skus`
- `purchase_orders`
- `purchase_order_items`
- `purchase_demands`
- `stock_reservations`
- `shipments`
- `shipment_items`
- AR/AP/invoice/payment/reconciliation
- production facts
- outsourcing facts
- repo/usecase
- API/RBAC
- UI
- seedData
- docs registry
- migration
- Ent code generation
- `make data`
- `make migrate_status`

## 11. 003 测试结果

已跑：

```bash
git status --short
git diff --stat
git diff --check
git ls-files --others --exclude-standard
grep -R "tenant_id" server/internal/data/model/schema docs/product docs/architecture docs/customers docs/reference config deployments || true
grep -R "shipping_released" docs/product docs/architecture docs/customers docs/reference || true
cd server && go test ./internal/data/model/schema
cd server && go test ./internal/biz ./internal/data
```

结果：

- `git diff --check` 通过。
- `go test ./internal/data/model/schema` 通过。
- `go test ./internal/biz ./internal/data` 通过。
- `tenant_id` grep 只命中文档禁止说明 / imported notes，没有命中新 schema 字段。
- `shipping_released` grep 显示正式文档继续锁定 `shipping_released != shipped`。
- `.codex-review/latest.md` 已生成。

未跑且禁止跑：

```bash
cd server && make data
cd server && make migrate_status
```

原因：

- 当前 Goal 是 schema-only。
- 禁止 Ent generate。
- 禁止 migration。

## 12. 003 后当前风险

### 风险 1：contacts 的 owner 存在性

问题：

- `contacts` 使用 `owner_type + owner_id`。
- DB 层无法强约束跨 `customers / suppliers` 外键。

影响：

- 如果后续 usecase 缺 guard，可能出现悬空联系人。

缓解：

- 005 masterdata repo/usecase 必须补 owner 存在性校验。
- 必须覆盖 customer / supplier 两种 owner。
- 必须覆盖 primary contact 唯一规则。

### 风险 2：schema 文件已新增，但 runtime 还不可用

问题：

- 003 只新增 schema 文件。
- 没有运行 `make data`。
- 没有 migration。
- 数据库没有新表。
- runtime 不能直接使用这些实体。

缓解：

- 下一轮独立做 004：Ent generate + Atlas migration。
- 004 仍禁止 repo/usecase/API/UI。

### 风险 3：business_records 过渡

问题：

- 正式 customers / suppliers / sales_orders schema 已出现。
- 但 `business_records` 仍作为兼容层 / demo / seed / source snapshot 存在。

影响：

- 后续如果 API/UI 不收口，可能形成双真源或双写。

缓解：

- 后续单独做 `business_records` transition audit。
- 不在 004 做迁移。
- 不在 004 改 UI。
- 不在 004 改 seedData。

## 13. Codex 工作流已定

长期使用：

- 中文短 Goal。
- 复杂任务写入 `docs/codex-goals/*.md`。
- 每个独立 Goal 建议新开 Codex 会话。
- 同一 Goal 内补漏、测试失败修复、生成 review 报告，可以继续原 Codex 会话。
- 每轮完成后生成 `.codex-review/latest.md`。
- 用户复制 latest.md 给 GPT，不再截图。

关键模板：

- `docs/codex-goals/README.md`
- `docs/codex-goals/_new-session-goal-template.md`
- `docs/codex-goals/_goal-file-template.md`
- `docs/codex-goals/_review-output-protocol.md`

`.codex-review/runs` 策略：

- 可以保留最近 5 条本地历史。
- `.codex-review/` 建议 gitignore。
- 日常给 GPT 只复制 `.codex-review/latest.md`。

## 14. 当前工作区状态提醒

003 审查报告显示，当前工作区与 003 直接相关的变更包括：

修改：

- `docs/current-source-of-truth.md`
- `docs/product/v1-implementation-cutline.md`
- `docs/product/v1-next-codex-goals.md`
- `docs/product/v1-schema-go-no-go.md`
- `progress.md`

新增未跟踪：

- `server/internal/data/model/schema/contact.go`
- `server/internal/data/model/schema/customer.go`
- `server/internal/data/model/schema/sales_order.go`
- `server/internal/data/model/schema/sales_order_item.go`
- `server/internal/data/model/schema/supplier.go`

注意：

- `git diff --stat` 不统计未跟踪文件。
- 新增 schema 文件仍需加入后续 review / stage / commit 决策。
- 不要 `git add .`。
- 如需 stage，必须按路径精确 stage。

## 15. 下一步建议

下一步应执行：

```text
docs/codex-goals/004-v1-migration-and-ent-generate.md
```

004 目标：

- 基于 003 新增 schema 文件生成 Ent 代码。
- 生成 Atlas migration。
- 检查 generated SQL 不含 forbidden fields。
- 检查没有 `tenant_id`。
- 检查没有 product_skus / purchase_orders / shipments / stock_reservations / finance facts。
- 不接 repo/usecase。
- 不接 API/RBAC。
- 不接 UI。
- 不改 docs registry。
- 不改 seedData。
- 不改 workflow.go。
- 不改 rbac.go。

004 应允许：

- Ent generated code。
- Atlas migration。
- 必要的 schema 编译修正。
- 小幅更新 current-source / progress / V1 next goals。

004 应禁止：

- repo/usecase。
- API/RBAC。
- UI。
- seedData。
- docs registry。
- business_records 迁移。
- product_skus。
- purchase_orders。
- shipments。
- stock_reservations。
- finance facts。
- tenant_id。
- SaaS runtime tenant。

## 16. 新 GPT 会话交接规则

新 GPT 会话默认不知道本会话上下文。

新 GPT 会话最少提供：

- `.codex-review/latest.md`

更稳提供：

- `.codex-review/latest.md`
- `docs/codex-goals/<上一轮 goal>.md`
- `docs/codex-goals/_gpt-context-summary.md`

如果让 GPT 重新完整审查源码或写非常精确的实现 Goal，再上传：

- review bundle
- 或源码 zip

日常小循环不需要每轮上传完整代码。

## 17. 当前会话后续最重要边界

后续必须继续守住：

- 003 之后不能直接跳 repo/usecase。
- 003 之后不能直接跳 API/UI。
- 004 只做 generate + migration。
- 005/006 再分别做 repo/usecase。
- 007 再做 API/RBAC。
- 008 再做前端页面。
- business_records transition audit 单独做。
- current customer data import draft 单独做。

推荐后续顺序：

```text
004-v1-migration-and-ent-generate
005-v1-repo-usecase-masterdata
006-v1-repo-usecase-sales-order
007-v1-api-rbac-masterdata-order
008-v1-frontend-masterdata-order-pages
009-business-records-transition-audit
010-current-customer-data-import-draft
```
:::

下一步我建议直接给你写 `004-v1-migration-and-ent-generate.md`。

### 071. user

_time `2026-05-31T00:06:17+08:00` · content_type `text` · node `c0f931ad-2259-4b55-91d6-0cf21cd295e3`_

_（空消息）_

### 072. assistant

_time `2026-05-31T00:06:18+08:00` · content_type `text` · node `da781b73-7002-4187-82a7-aadec3bc5a1a`_

收到。这个 `docs/codex-goals/_gpt-context-summary.md` 版本可以用，已经覆盖到 **003 已完成后的状态**：V1 的 5 个 Ent schema 已新增，仍未生成 Ent 代码、migration、repo/usecase、API、UI；下一步应进入 `004-v1-migration-and-ent-generate`。fileciteturn8file0

我建议你把它保存到仓库：

```text
docs/codex-goals/_gpt-context-summary.md
```

以后新 GPT 会话最稳的交接组合就是：

```text
docs/codex-goals/_gpt-context-summary.md
.codex-review/latest.md
docs/codex-goals/<上一轮 goal>.md
```

当前进度可以明确为：

```text
Phase 0：产品化架构 / 目录骨架 / current 客户边界，已完成
Phase 1：主数据、订单、BOM、采购前置评审，已完成
Phase 2：V1 schema final review / cutline，已完成
Goal 003：V1 Ent schema 文件新增，已完成
下一步：Goal 004，只做 Ent generate + Atlas migration
```

下一步不要跳 repo/usecase。`004` 的边界应该非常窄：

```text
允许：
- 基于 003 的 5 个 schema 运行 Ent generate
- 生成 Atlas migration
- 检查 generated code / migration SQL
- 必要的 schema 编译修正
- 小幅更新 current-source / progress / v1-next-goals

禁止：
- repo/usecase
- API/RBAC
- UI
- seedData
- docs registry
- business_records 迁移
- product_skus
- purchase_orders
- shipments
- stock_reservations
- finance facts
- tenant_id
```

你下一条直接说“给我 004”，我就按你现在的规范给：**中文短 Goal + 文件名 + 完整可复制 md**。

### 073. user

_time `2026-05-31T00:08:55+08:00` · content_type `text` · node `ce550e97-c4a1-4ab6-8640-97eda8146093`_

给我004

### 074. assistant

_time `2026-05-31T00:08:57+08:00` · content_type `text` · node `00f8e216-7eb1-46f0-a580-657f5cf7f4d8`_

下面是 004。先给你短 Goal，再给完整 `md` 文件内容。

## 中文短 Goal

```text
目标：执行 docs/codex-goals/004-v1-migration-and-ent-generate.md。

请先阅读 AGENTS.md，然后严格执行任务文件。每次新会话都不能依赖历史聊天记忆，只能以仓库文件为准。

本轮只允许基于 003 已新增的 V1 Ent schema：customers、suppliers、contacts、sales_orders、sales_order_items，执行 Ent generate 与 Atlas migration 生成 / 检查。

禁止 repo/usecase、API/RBAC、UI、docs registry、seedData、workflow.go、rbac.go、server/internal/data 业务逻辑改动。禁止新增 tenant_id、SaaS 多租户、license server、套餐计费、客户工单系统、ChangeUsecase、change_records。禁止新增 product_skus、purchase_orders、shipments、stock_reservations、finance facts。禁止从 Workflow 写库存、出货、财务事实。shipping_released != shipped。

本轮允许和禁止修改的文件，以任务 md 为准。

完成后必须按 docs/codex-goals/_review-output-protocol.md 生成 .codex-review/latest.md。

用户应能用下面命令复制：

cat .codex-review/latest.md | pbcopy

不要要求用户截图。
```

## 文件名

```text
docs/codex-goals/004-v1-migration-and-ent-generate.md
```

## 完整可复制 MD

````md
# Codex Goal 004: V1 Ent Generate and Atlas Migration

## 任务名称

004：V1 Ent generate + Atlas migration：`customers / suppliers / contacts / sales_orders / sales_order_items`

---

## 任务性质

本轮属于：

```text
Migration / Generate
```

本轮只允许基于 003 已新增的 5 个 Ent schema 文件执行：

```text
Ent generate
Atlas migration generation / migration status check
generated code inspection
migration SQL inspection
必要的 schema 编译修正
```

必须明确：

```text
本轮是否改 runtime：否
本轮是否改 Ent schema：仅允许为 generate / migration 通过做最小 schema 修正
本轮是否新增 migration：是
本轮是否改 API：否
本轮是否改 UI：否
本轮是否改 docs registry：否
本轮是否改 seedData：否
本轮是否改 repo/usecase：否
```

本轮目标是让 003 的 schema-only 结果进入 generated code + migration 阶段。

本轮不接业务逻辑。

---

## 背景

003 已完成：

```text
server/internal/data/model/schema/customer.go
server/internal/data/model/schema/supplier.go
server/internal/data/model/schema/contact.go
server/internal/data/model/schema/sales_order.go
server/internal/data/model/schema/sales_order_item.go
```

003 结论：

- 只新增 V1 cutline 允许的 5 个 Ent schema 文件。
- 未生成 Ent 代码。
- 未新增 Atlas migration。
- 未接 repo/usecase。
- 未接 API/RBAC。
- 未接 UI。
- 未改 docs registry。
- 未改 seedData。
- 未改 workflow.go。
- 未改 rbac.go。
- 未改 server runtime 业务逻辑。

004 的目标：

```text
把 003 的 schema 文件生成 Ent 代码和 Atlas migration。
```

004 不是业务实现任务。

004 不处理：

```text
repo
usecase
API
RBAC
UI
数据导入
business_records 迁移
shipment facts
inventory facts
finance facts
```

---

## 必须先读

### 项目规则

```text
AGENTS.md
README.md
docs/current-source-of-truth.md
progress.md
```

### GPT / Codex 上下文

```text
docs/codex-goals/_gpt-context-summary.md
docs/codex-goals/README.md
docs/codex-goals/_new-session-goal-template.md
docs/codex-goals/_goal-file-template.md
docs/codex-goals/_review-output-protocol.md
```

如果某些模板文件不存在，请记录缺失，不要自行大范围补模板。

### 003 Goal 与审查结果

```text
docs/codex-goals/003-v1-ent-schema-customers-suppliers-orders.md
.codex-review/latest.md
```

如果 `.codex-review/latest.md` 不存在，请继续，但必须从 003 goal 和当前 git 状态中恢复上下文，并在最终报告中说明缺失。

### Phase 0 / 1 / 2 文档

```text
docs/product/zero-to-one-architecture.md
docs/product/product-principles.md
docs/product/domain-model-v1.md
docs/product/module-boundaries.md
docs/product/config-permission-policy.md
docs/product/customer-instance-policy.md
docs/product/customer-delta-policy.md
docs/product/rewrite-roadmap.md
docs/product/release-gates.md
docs/product/test-strategy.md
docs/architecture/status-workflow-fact-boundary.md

docs/architecture/masterdata-order-source-document-review.md
docs/architecture/customer-supplier-masterdata-review.md
docs/architecture/product-sku-bom-boundary-review.md
docs/architecture/order-purchase-boundary-review.md
docs/product/domain-schema-draft-v1-v2.md
docs/product/migration-readiness-checklist.md
docs/product/phase1-implementation-plan.md
docs/product/phase1-risk-register.md

docs/product/schema-design-final-review.md
docs/product/v1-entity-decision-record.md
docs/product/v1-implementation-cutline.md
docs/product/v1-schema-go-no-go.md
docs/product/business-records-transition-plan.md
docs/product/v1-next-codex-goals.md
```

### 003 新增 schema

```text
server/internal/data/model/schema/customer.go
server/internal/data/model/schema/supplier.go
server/internal/data/model/schema/contact.go
server/internal/data/model/schema/sales_order.go
server/internal/data/model/schema/sales_order_item.go
```

### 现有 Ent / Atlas / migration 相关文件

Codex 必须先查看真实仓库结构，再决定命令和路径。

至少检查：

```text
server/Makefile
server/ent
server/internal/data/model
server/internal/data/model/schema
server/migrations
server/atlas*
server/entgo*
```

如果路径不同，以真实仓库为准，并在 `.codex-review/latest.md` 中说明。

---

## 当前真源与非真源

### 当前真源

本轮必须以这些为准：

```text
AGENTS.md
docs/current-source-of-truth.md
docs/codex-goals/003-v1-ent-schema-customers-suppliers-orders.md
docs/product/v1-implementation-cutline.md
docs/product/v1-entity-decision-record.md
docs/product/v1-schema-go-no-go.md
docs/product/schema-design-final-review.md
server/internal/data/model/schema/*.go
server/Makefile
Atlas / Ent 现有配置
```

### 只能作为线索

```text
docs/customers/current/*
web/src/erp/config/seedData.mjs
截图
Excel 样本
PDF 样本
历史 Codex 输出
docs/reference/imported-notes/*
```

### 禁止作为当前实现真源

```text
历史聊天记忆
未经确认的截图 / 口头描述
未落地 architecture review
未实现 schema draft
current 客户样本字段
demo / seed 数据
```

必须保持：

```text
代码 / schema / migration / tests 是实现真源。
current-source-of-truth 是当前状态入口。
schema draft 不是 implemented。
architecture review 不是 runtime。
customer material 不是 Product Core。
```

---

## 允许修改的文件

本轮允许修改：

### 003 新增 schema 文件

仅当 generate / migration 失败时，允许对以下文件做最小修正：

```text
server/internal/data/model/schema/customer.go
server/internal/data/model/schema/supplier.go
server/internal/data/model/schema/contact.go
server/internal/data/model/schema/sales_order.go
server/internal/data/model/schema/sales_order_item.go
```

修正范围仅限：

```text
字段类型不符合 Ent / Atlas 要求
索引语法错误
edge 语法错误
decimal helper / import 问题
命名和现有 schema 风格不一致导致生成失败
```

不得借此扩大字段范围。

### Ent generated code

允许修改或生成 Ent 生成代码，路径以仓库实际为准，通常包括：

```text
server/internal/data/model/*
```

但不包括：

```text
server/internal/data/model/schema/*
```

schema 目录只有上述 5 个文件允许必要修正。

### Atlas migration

允许新增 V1 migration 文件，路径以仓库实际为准，通常包括：

```text
server/migrations/*
```

或仓库当前 Atlas migration 目录。

### 文档 / 进度

允许小幅更新：

```text
docs/current-source-of-truth.md
docs/product/v1-implementation-cutline.md
docs/product/v1-next-codex-goals.md
docs/product/v1-schema-go-no-go.md
progress.md
```

### Codex review

允许生成或覆盖：

```text
.codex-review/latest.md
```

如果当前协议要求保留 runs 最近历史，可以按协议处理；但本轮不要修改协议本身。

---

## 禁止修改的文件

本轮禁止修改：

```text
server/internal/biz/workflow.go
server/internal/biz/rbac.go
server/internal/data
server/internal/core
web/src/erp/config/docs.mjs
web/src/erp/config/seedData.mjs
web/src/erp/pages
web/src/erp/mobile
server/deploy
scripts
docs/codex-goals/_new-session-goal-template.md
docs/codex-goals/_goal-file-template.md
docs/codex-goals/_review-output-protocol.md
```

特别说明：

```text
server/internal/data/model/generated 代码允许由 Ent 生成。
server/internal/data/model/schema 仅允许为 003 的 5 个 schema 做最小修正。
server/internal/data 业务 repo/usecase 禁止修改。
```

如果 Codex 发现必须修改禁止路径，必须停止并报告，不得自行修改。

---

## 改动范围分级

本轮范围级别：

```text
Migration / Generate
```

不得扩大范围。

禁止把下面内容放进同一轮：

```text
Ent generate + migration + repo/usecase + API + UI
```

发现范围不足时，停止并报告。

---

## 成功标准

本轮完成必须满足：

```text
- 成功基于 003 的 5 个 schema 运行 Ent generate。
- 成功新增 Atlas migration。
- migration SQL 只包含 customers / suppliers / contacts / sales_orders / sales_order_items 相关表、索引、约束和外键。
- generated code 不包含 tenant_id。
- migration 不包含 tenant_id。
- 不新增 product_skus。
- 不新增 purchase_orders。
- 不新增 shipments。
- 不新增 stock_reservations。
- 不新增 AR/AP/invoice/payment/reconciliation。
- 不新增 SaaS runtime tenant 相关表。
- 不新增 license / billing / ticket 相关表。
- 不新增 ChangeUsecase 或 change_records。
- 不改 repo/usecase。
- 不改 API/RBAC。
- 不改 UI。
- 不改 docs registry。
- 不改 seedData。
- 不改 workflow.go。
- 不改 rbac.go。
- 不从 Workflow 写库存、出货、财务事实。
- contacts owner_type + owner_id 的 DB 层约束和 primary contact 规则仍保留。
- sales_orders / sales_order_items 仍是 Source Document，不是 shipment fact。
- 不引入 shipped_quantity。
- 测试通过。
- .codex-review/latest.md 已生成。
```

不能只写“generate 成功”。

---

## 停止条件

出现以下情况必须停止并报告：

```text
- 任务文件与 AGENTS.md 或当前代码真源冲突。
- 003 的 5 个 schema 文件不存在。
- 需要新增 tenant_id。
- 需要实现 SaaS 多租户。
- 需要新增 repo/usecase。
- 需要修改 server/internal/data 业务逻辑。
- 需要修改 workflow.go 或 rbac.go。
- 需要修改 API/UI。
- 需要修改 seedData 或 docs registry。
- Ent generate 要求新增 product_skus / purchase_orders / shipments / stock_reservations / finance facts。
- Atlas migration 生成了非 V1 cutline 表。
- migration SQL 包含 tenant_id。
- migration SQL 包含 deferred 表。
- contacts 建模需要改成另一种模型，超出本轮修正范围。
- sales_order_item 无法安全关联现有 products。
- Workflow / Fact 边界无法保持。
- 测试失败原因不明确。
- 需要删除、回退、整理或 stash 非本轮改动。
```

停止时必须输出：

```text
停止原因：
涉及文件：
风险：
建议下一步：
```

---

## Git 策略

默认规则：

```text
- 本轮默认不提交、不推送。
- 不允许执行 git add .。
- 不允许自动 commit。
- 不允许自动 push。
- 不允许回退、整理或 stash 非本轮改动。
- 如需 stage，必须按路径精确 stage，并且用户明确要求。
```

必须区分：

```text
tracked diff
untracked files
本轮新增文件
历史未跟踪文件
```

如果存在历史 untracked 文件，不要删除，报告即可。

---

## Ent generate 要求

Codex 必须先确认仓库已有生成方式。

优先使用现有 Makefile 或脚本。

通常可能是：

```bash
cd server && make data
```

但必须以真实仓库为准。

如果 `make data` 会同时执行超出本轮范围的步骤，Codex 必须先说明风险并停止，不得自行扩大范围。

生成后必须检查：

```text
generated code 是否只围绕新增 V1 schema 扩展
是否意外修改旧 schema generated code 大量内容
是否有 tenant_id
是否有 deferred 表
```

如果 Ent generate 修改大量旧 generated code，Codex 必须判断是正常生成器输出还是异常，并在 review 中说明。

---

## Atlas migration 要求

Codex 必须先确认仓库已有 migration 生成方式。

优先使用现有 Makefile 或脚本。

通常可能是：

```bash
cd server && make migrate_status
```

但注意：

```text
make migrate_status 可能只是查看状态，不一定生成 migration。
```

Codex 必须根据仓库文档和 Makefile 确认正确命令。

如果仓库有专门的 migration generate 命令，使用仓库约定。

如果没有明确生成命令，必须停止并报告，不得猜。

migration 文件必须只包含：

```text
customers
suppliers
contacts
sales_orders
sales_order_items
```

允许包含这些对象的：

```text
primary key
columns
indexes
unique indexes
check constraints
foreign keys
created_at / updated_at
```

不得包含：

```text
tenant_id
product_skus
purchase_orders
purchase_order_items
purchase_demands
stock_reservations
shipments
shipment_items
AR/AP/invoice/payment/reconciliation
production facts
outsourcing facts
license / billing / ticket tables
change_records
```

---

## Migration SQL 检查

生成 migration 后必须 grep 检查。

必须检查：

```bash
grep -R "tenant_id" server/migrations || true
grep -R "product_skus\|purchase_orders\|shipments\|stock_reservations\|invoice\|payment\|reconciliation\|change_records" server/migrations || true
```

如果 migration 目录不是 `server/migrations`，用真实目录替换，并在审查报告中说明。

必须手动或用 grep 确认 migration 仅涉及 V1 allowed tables。

---

## contacts 约束检查

必须确认 migration 中保留：

```text
owner_type 枚举 / check 约束
同一 owner 最多一个 primary contact 的约束或索引
```

如果 partial unique index 无法被 Atlas 正确生成，必须停止或在审查报告中明确风险，不得假装通过。

如果 Atlas 不支持当前表达，需要提出下一轮 schema 修正建议。

---

## sales_orders / sales_order_items 边界检查

必须确认 generated code / migration 中没有：

```text
shipped_quantity
shipment_id
inventory_txn_id
invoice_id
payment_id
ar_id
ap_id
product_sku_id
tenant_id
```

如果发现这些字段，必须停止并报告。

---

## business_records 边界

本轮不得改 `business_records`。

必须在 review 中保持：

```text
business_records 继续作为兼容层、demo、seed、source snapshot、调研入口。
business_records 不长期替代正式 customers / suppliers / sales_orders / inventory / shipment / finance facts。
```

不得迁移旧数据。

不得修改前端 business record 页面。

---

## Workflow / Fact 边界

本轮 generate / migration 不能让 Workflow 直接写 Fact。

必须保持：

```text
Workflow task done != Fact posted。
shipping_released != shipped。
shipment_release done -> shipping_released。
sales_order 是 Source Document。
shipment 才是未来出货事实。
inventory_txns 才是库存落账事实。
```

不得新增让 `workflow.go` 写这些对象的逻辑。

---

## tenant_id 规则

本轮禁止新增 `tenant_id`。

如果 grep 命中 `tenant_id`，必须解释是否只来自：

```text
imported notes
禁止说明
future SaaS 评审候选说明
current 不是 runtime tenant 说明
```

不得出现在：

```text
新 schema
generated code
migration SQL
runtime
```

---

## 测试分层选择

本轮必须选择测试层级。

### 静态检查

选择：是。

原因：

```text
本轮会生成代码和 migration，必须检查 diff、空白、禁止字段和边界词。
```

命令：

```bash
git status --short
git diff --stat
git diff --check
git ls-files --others --exclude-standard
```

### 单元测试

选择：是。

原因：

```text
生成 Ent 代码后，至少要编译 schema / data / biz。
```

命令：

```bash
cd server && go test ./internal/data/model/schema
cd server && go test ./internal/biz ./internal/data
```

如 generated package 有更合适命令，按仓库真实结构补充。

### 集成测试

选择：有限选择。

原因：

```text
本轮生成 migration，但不接 repo/usecase，不执行业务 DB 测试。
```

命令：

```bash
cd server && make migrate_status
```

如果 `make migrate_status` 需要真实 DB，Codex 必须说明 DB 环境是否可用。

### 冒烟测试

选择：否。

原因：

```text
本轮不改运行入口、API、UI 或部署。
```

### 回归测试

选择：有限选择。

原因：

```text
generated code 不应破坏既有 biz/data 编译。
```

命令：

```bash
cd server && go test ./internal/biz ./internal/data
```

### E2E 测试

选择：否。

原因：

```text
本轮不改 UI 或用户路径。
```

### 视觉 / 样式回归

选择：否。

原因：

```text
本轮不改 UI / 样式。
```

---

## 验收命令

必须运行：

```bash
git status --short
git diff --stat
git diff --check
git ls-files --others --exclude-standard
```

必须运行 Ent generate 命令，优先仓库约定，例如：

```bash
cd server && make data
```

如果命令不同，用真实仓库命令。

必须运行或检查 migration 命令，优先仓库约定。

如果存在：

```bash
cd server && make migrate_status
```

必须运行。

如果 migration 生成命令不同，按真实仓库命令运行，并在审查报告中说明。

必须运行：

```bash
grep -R "tenant_id" server/internal/data/model server/migrations docs/product docs/architecture docs/customers docs/reference config deployments || true
grep -R "product_skus\|purchase_orders\|shipments\|stock_reservations\|invoice\|payment\|reconciliation\|change_records" server/internal/data/model server/migrations || true
grep -R "shipped_quantity\|shipment_id\|inventory_txn_id\|invoice_id\|payment_id\|ar_id\|ap_id\|product_sku_id" server/internal/data/model server/migrations || true
grep -R "shipping_released" docs/product docs/architecture docs/customers docs/reference || true
```

如果 migration 目录不是 `server/migrations`，用真实目录替换。

必须运行：

```bash
cd server && go test ./internal/data/model/schema
cd server && go test ./internal/biz ./internal/data
```

不得运行前端测试，除非本轮意外改了前端文件；如果改了前端文件，必须停止并报告，因为本轮禁止改前端。

---

## 需要更新的已有文档

允许小幅更新：

### docs/current-source-of-truth.md

必须写清：

```text
V1 Ent generated code and Atlas migration for customers / suppliers / contacts / sales_orders / sales_order_items have been generated.
Repo/usecase, API/RBAC, UI, seedData, docs registry, and business_records transition are not implemented yet.
```

如果 migration 未能生成，则写清：

```text
004 stopped before migration generation.
```

不得把 repo/usecase/API/UI 写成完成。

### progress.md

记录本轮：

```text
004 V1 Ent generate and migration completed.
No repo/usecase / API / UI / seedData / docs registry changes.
```

如果中止，记录中止原因。

### docs/product/v1-next-codex-goals.md

可以更新下一轮建议：

```text
005-v1-repo-usecase-masterdata
006-v1-repo-usecase-sales-order
```

但不得把 005/006 写成已完成。

### docs/product/v1-schema-go-no-go.md

可以更新：

```text
003 schema files added
004 generated code / migration added
```

但不得把 runtime usecase 写成完成。

---

## 项目长期禁止项

必须遵守：

```text
- 不新增 tenant_id。
- 不实现 SaaS 多租户。
- 不实现 license server、套餐计费、客户工单系统。
- 不创建泛化 ChangeUsecase。
- 不创建泛化 change_records。
- 不把 current 客户资料写成 Product Core。
- 不让 WorkflowUsecase 写库存、出货、财务、应收、应付、发票、收付款事实。
- shipping_released != shipped。
- workflow task done != fact posted。
- business_records 是兼容层、demo、seed、source snapshot、调研入口，不是长期事实真源。
```

---

## 审查报告要求

本轮完成后必须生成：

```text
.codex-review/latest.md
```

审查报告必须遵守：

```text
docs/codex-goals/_review-output-protocol.md
```

用户必须能用下面命令复制：

```bash
cat .codex-review/latest.md | pbcopy
```

不要要求用户截图。

---

## 最终回复格式

Codex 最终回复必须包含：

```text
【完成】

【新增/修改文件】

【本轮改动范围】

【Ent generate 结果】

【Atlas migration 结果】

【migration 文件清单】

【migration SQL 边界检查】

【contacts 约束检查】

【sales_order / shipment fact 边界】

【business_records 边界】

【禁止路径检查】

【tenant_id 处理结论】

【Workflow / Fact 边界检查】

【测试层级选择】

【测试命令与结果】

【停止条件是否触发】

【Git 状态摘要】

【风险】

【下一轮 Codex Goal 建议】

【.codex-review/latest.md 复制命令】
cat .codex-review/latest.md | pbcopy
```

## 完成后给 GPT 的复盘材料

`.codex-review/latest.md` 必须包含：

```text
git status --short
git diff --stat
git ls-files --others --exclude-standard
generated code 文件清单
migration 文件清单
migration SQL 摘要
contacts 约束检查
sales_order / shipment fact 边界检查
tenant_id grep 解释
deferred table grep 解释
shipping_released grep 解释
禁止路径检查
测试层级选择
测试命令和结果
下一轮建议
```
````

### 075. user

_time `2026-05-31T00:24:03+08:00` · content_type `text` · node `dc430cae-837b-483f-a60b-bf91fe40af34`_

_（空消息）_

### 076. assistant

_time `2026-05-31T00:24:06+08:00` · content_type `text` · node `7efabe19-4d2e-4860-9524-563c84ee26e2`_

004 我判断：**功能目标基本合格，但有一个流程风险要先确认**。

合格点是：004 已经基于 003 的 5 个 schema 执行 `make data`，生成了 Ent generated code 和 Atlas migration；migration 只包含 `customers / suppliers / contacts / sales_orders / sales_order_items`，没有 `tenant_id`、SKU、采购订单、出货、库存预留、财务事实、license/billing/ticket 或 change records；测试也通过了 `make data`、`make migrate_status`、schema package test、`internal/biz` 和 `internal/data` 测试。fileciteturn9file0

但要注意一个红点：报告里写当前 HEAD 是：

```text
e13208f chore(schema): 生成 V1 Ent 代码和迁移
```

并且 `origin/main` 与 HEAD 一致，同时又写“我未执行提交 / 推送”。fileciteturn9file0 这说明有两种可能：

```text
1. 你自己或外部流程已经 commit/push 了，这是可以的；
2. Codex 或某个自动流程提交了，但报告没有说清楚，这就违反我们之前的 Git 策略。
```

进入 005 前，建议你先确认一下：

```bash
git log --oneline -3
git status --short
git branch --show-current
```

如果这个 commit 是你确认过的，就继续；如果不是你确认的，后续 Goal 必须强化一句：**严禁 commit / push，即使测试通过也不允许。**

下面给你 005。

## 中文短 Goal

```text
目标：执行 docs/codex-goals/005-v1-repo-usecase-masterdata.md。

请先阅读 AGENTS.md，然后严格执行任务文件。每次新会话都不能依赖历史聊天记忆，只能以仓库文件为准。

本轮只允许实现 V1 MasterData 的 customers / suppliers / contacts repo、biz usecase 和测试。必须基于 003/004 已生成的 Ent schema、generated code 和 migration。

重点：补 contacts 的 owner_type + owner_id usecase guard，校验 owner 是否存在，校验同一 owner 最多一个 primary contact。

禁止 API/RBAC、UI、docs registry、seedData、workflow.go、rbac.go、出货/库存/财务事实、business_records 迁移。禁止 tenant_id、SaaS 多租户、license server、套餐计费、客户工单系统、ChangeUsecase、change_records。禁止 product_skus、purchase_orders、shipments、stock_reservations、finance facts。

本轮允许和禁止修改的文件，以任务 md 为准。

禁止 git add、commit、push、stash、回退非本轮改动。

完成后必须按 docs/codex-goals/_review-output-protocol.md 生成 .codex-review/latest.md。

用户应能用下面命令复制：

cat .codex-review/latest.md | pbcopy

不要要求用户截图。
```

## 文件名

```text
docs/codex-goals/005-v1-repo-usecase-masterdata.md
```

## 完整可复制 MD

````md
# Codex Goal 005: V1 Repo / Usecase for MasterData Customers / Suppliers / Contacts

## 任务名称

005：V1 MasterData repo / usecase：`customers / suppliers / contacts`

---

## 任务性质

本轮属于：

```text
Runtime / Repo-Usecase
```

本轮只允许实现 V1 MasterData 的后端 repo / biz usecase 和测试：

```text
customers
suppliers
contacts
```

本轮必须基于 003 / 004 已完成内容：

```text
003: V1 Ent schema added.
004: Ent generated code and Atlas migration generated.
```

本轮不接 API。  
本轮不接 RBAC。  
本轮不接 UI。  
本轮不改 docs registry。  
本轮不改 seedData。  
本轮不做 sales order usecase。  
本轮不做 migration apply。  

必须明确：

```text
本轮是否改 runtime：是，仅限 masterdata repo/usecase
本轮是否改 Ent schema：否
本轮是否新增 migration：否
本轮是否改 API：否
本轮是否改 UI：否
本轮是否改 docs registry：否
本轮是否改 seedData：否
本轮是否改 repo/usecase：是，仅限 customers / suppliers / contacts
```

---

## 背景

003 已新增 V1 cutline 允许的 5 个 Ent schema：

```text
server/internal/data/model/schema/customer.go
server/internal/data/model/schema/supplier.go
server/internal/data/model/schema/contact.go
server/internal/data/model/schema/sales_order.go
server/internal/data/model/schema/sales_order_item.go
```

004 已完成：

```text
Ent generated code
Atlas migration
```

004 生成的 migration：

```text
server/internal/data/model/migrate/20260530161152_migrate.sql
```

004 明确：

- generated code 已生成。
- migration 已生成。
- repo/usecase 未实现。
- API/RBAC 未实现。
- UI 未实现。
- business_records transition 未实现。
- migration 在目标库仍 pending。
- contacts 使用 `owner_type + owner_id`，DB 层无法跨 `customers / suppliers` 做强 FK。
- contacts owner 存在性必须在 usecase guard 中校验。

005 的目标：

```text
只实现 customers / suppliers / contacts 的 repo + biz usecase + tests。
```

005 不处理：

```text
sales_orders
sales_order_items
API
RBAC
UI
business_records 迁移
seedData
docs registry
migration apply
shipment facts
inventory facts
finance facts
```

---

## 必须先读

### 项目规则

```text
AGENTS.md
README.md
docs/current-source-of-truth.md
progress.md
```

### GPT / Codex 上下文

```text
docs/codex-goals/_gpt-context-summary.md
docs/codex-goals/README.md
docs/codex-goals/_new-session-goal-template.md
docs/codex-goals/_goal-file-template.md
docs/codex-goals/_review-output-protocol.md
```

如果某些模板文件不存在，请记录缺失，不要自行大范围补模板。

### 003 / 004 Goal 与审查结果

```text
docs/codex-goals/003-v1-ent-schema-customers-suppliers-orders.md
docs/codex-goals/004-v1-migration-and-ent-generate.md
.codex-review/latest.md
```

如果 `.codex-review/latest.md` 不存在，请继续，但必须从 003/004 goal 和当前 git 状态中恢复上下文，并在最终报告中说明缺失。

### Phase 0 / 1 / 2 文档

```text
docs/product/zero-to-one-architecture.md
docs/product/product-principles.md
docs/product/domain-model-v1.md
docs/product/module-boundaries.md
docs/product/config-permission-policy.md
docs/product/customer-instance-policy.md
docs/product/customer-delta-policy.md
docs/product/rewrite-roadmap.md
docs/product/release-gates.md
docs/product/test-strategy.md
docs/architecture/status-workflow-fact-boundary.md

docs/architecture/masterdata-order-source-document-review.md
docs/architecture/customer-supplier-masterdata-review.md
docs/product/domain-schema-draft-v1-v2.md
docs/product/migration-readiness-checklist.md
docs/product/phase1-implementation-plan.md
docs/product/phase1-risk-register.md

docs/product/schema-design-final-review.md
docs/product/v1-entity-decision-record.md
docs/product/v1-implementation-cutline.md
docs/product/v1-schema-go-no-go.md
docs/product/business-records-transition-plan.md
docs/product/v1-next-codex-goals.md
```

### MasterData schema / generated code

```text
server/internal/data/model/schema/customer.go
server/internal/data/model/schema/supplier.go
server/internal/data/model/schema/contact.go

server/internal/data/model/ent/customer.go
server/internal/data/model/ent/supplier.go
server/internal/data/model/ent/contact.go
```

### 现有 repo / usecase 风格

Codex 必须先查看真实仓库结构和现有实现风格，再写代码。

至少检查：

```text
server/internal/biz
server/internal/data
server/internal/data/*repo*
server/internal/biz/inventory.go
server/internal/biz/quality_inspection.go
server/internal/data/inventory*
server/internal/data/purchase*
server/internal/data/quality*
server/internal/data/model/ent
```

如果路径不同，以真实仓库为准，并在 `.codex-review/latest.md` 中说明。

---

## 当前真源与非真源

### 当前真源

本轮必须以这些为准：

```text
AGENTS.md
docs/current-source-of-truth.md
docs/codex-goals/005-v1-repo-usecase-masterdata.md
docs/product/v1-implementation-cutline.md
docs/product/v1-entity-decision-record.md
docs/product/v1-schema-go-no-go.md
docs/product/schema-design-final-review.md
server/internal/data/model/schema/customer.go
server/internal/data/model/schema/supplier.go
server/internal/data/model/schema/contact.go
server/internal/data/model/ent
server/internal/data/model/migrate/20260530161152_migrate.sql
现有 repo/usecase 代码风格
```

### 只能作为线索

```text
docs/customers/current/*
web/src/erp/config/seedData.mjs
截图
Excel 样本
PDF 样本
历史 Codex 输出
docs/reference/imported-notes/*
```

### 禁止作为当前实现真源

```text
历史聊天记忆
未经确认的截图 / 口头描述
未落地 architecture review
未实现 schema draft
current 客户样本字段
demo / seed 数据
```

必须保持：

```text
代码 / schema / migration / tests 是实现真源。
current-source-of-truth 是当前状态入口。
schema draft 不是 implemented。
architecture review 不是 runtime。
customer material 不是 Product Core。
```

---

## 允许修改的文件

本轮允许新增或修改：

### biz usecase

按现有项目风格选择文件名。如果项目已有 masterdata 分层风格，遵守现有风格。

允许新增类似：

```text
server/internal/biz/customer.go
server/internal/biz/supplier.go
server/internal/biz/contact.go
```

或如果现有风格更适合合并，也可以新增：

```text
server/internal/biz/masterdata.go
```

但必须在 review 中说明选择原因。

### data repo

允许新增类似：

```text
server/internal/data/customer_repo.go
server/internal/data/supplier_repo.go
server/internal/data/contact_repo.go
```

或：

```text
server/internal/data/masterdata_repo.go
```

但必须遵守现有 repo 风格。

### tests

允许新增或修改：

```text
server/internal/biz/*customer*_test.go
server/internal/biz/*supplier*_test.go
server/internal/biz/*contact*_test.go
server/internal/data/*customer*_test.go
server/internal/data/*supplier*_test.go
server/internal/data/*contact*_test.go
```

如果项目既有测试命名不同，以现有风格为准。

### 文档 / 进度

允许小幅更新：

```text
docs/current-source-of-truth.md
docs/product/v1-next-codex-goals.md
docs/product/v1-schema-go-no-go.md
progress.md
```

### Codex review

允许生成或覆盖：

```text
.codex-review/latest.md
```

---

## 禁止修改的文件

本轮禁止修改：

```text
server/internal/biz/workflow.go
server/internal/biz/rbac.go
server/internal/data/model/schema
server/internal/data/model/migrate
server/internal/data/model/ent
server/internal/core
web/src/erp/config/docs.mjs
web/src/erp/config/seedData.mjs
web/src/erp/pages
web/src/erp/mobile
server/deploy
scripts
docs/codex-goals/_new-session-goal-template.md
docs/codex-goals/_goal-file-template.md
docs/codex-goals/_review-output-protocol.md
```

特别说明：

```text
本轮不得改 schema。
本轮不得改 generated code。
本轮不得改 migration。
本轮不得改 workflow.go。
本轮不得改 rbac.go。
本轮不得改 API/UI。
```

如果 Codex 发现必须修改禁止路径，必须停止并报告，不得自行修改。

---

## 改动范围分级

本轮范围级别：

```text
Runtime / Repo-Usecase
```

但仅限：

```text
customers / suppliers / contacts
```

不得扩大到：

```text
sales_orders / sales_order_items
API / RBAC / UI / seed / docs registry
```

禁止把下面内容放进同一轮：

```text
masterdata repo/usecase + sales order usecase + API/RBAC + UI
```

发现范围不足时，停止并报告。

---

## 成功标准

本轮完成必须满足：

```text
- 实现 customers repo / usecase。
- 实现 suppliers repo / usecase。
- 实现 contacts repo / usecase。
- customers 支持最小 CRUD 或项目现有主数据标准动作。
- suppliers 支持最小 CRUD 或项目现有主数据标准动作。
- contacts 支持 customer / supplier owner。
- contacts create/update 必须校验 owner_type 合法。
- contacts create/update 必须校验 owner_id 存在。
- contacts primary contact 规则必须有 usecase 或 repo guard。
- 不允许为不存在的 customer / supplier 创建 contact。
- 不允许 owner_type 非 CUSTOMER / SUPPLIER。
- 不允许 current 客户样本字段进入 Product Core。
- 不新增 tenant_id。
- 不改 Ent schema。
- 不新增 migration。
- 不改 generated code。
- 不接 API/RBAC。
- 不接 UI。
- 不改 docs registry。
- 不改 seedData。
- 不改 workflow.go。
- 不改 rbac.go。
- 不接 sales_orders usecase。
- 不接 business_records transition。
- 测试覆盖 customers / suppliers / contacts 的核心路径和 contacts guard。
- .codex-review/latest.md 已生成。
```

不能只写“usecase 完成”。

---

## 停止条件

出现以下情况必须停止并报告：

```text
- 任务文件与 AGENTS.md 或当前代码真源冲突。
- 需要修改禁止路径。
- 需要新增 tenant_id。
- 需要实现 SaaS 多租户。
- 需要新增 migration。
- 需要修改 Ent schema 或 generated code。
- 需要修改 workflow.go 或 rbac.go。
- 需要接 API/RBAC/UI。
- 需要改 seedData 或 docs registry。
- 需要处理 sales_orders usecase。
- 需要处理 business_records 迁移。
- contacts owner guard 无法在当前 repo/usecase 层实现。
- 现有测试环境无法验证 data repo 或 biz usecase。
- 测试失败原因不明确。
- 需要删除、回退、整理或 stash 非本轮改动。
```

停止时必须输出：

```text
停止原因：
涉及文件：
风险：
建议下一步：
```

---

## Git 策略

默认规则：

```text
- 本轮默认不提交、不推送。
- 不允许执行 git add .。
- 不允许自动 commit。
- 不允许自动 push。
- 不允许回退、整理或 stash 非本轮改动。
- 如需 stage，必须按路径精确 stage，并且用户明确要求。
```

必须先运行并记录：

```bash
git status --short
git branch --show-current
git log --oneline -3
```

如果发现当前仓库已经有自动 commit 或 origin/main 同步，必须在 review 中说明，不要继续 commit/push。

必须区分：

```text
tracked diff
untracked files
本轮新增文件
历史未跟踪文件
```

如果存在历史 untracked 文件，不要删除，报告即可。

---

## 业务动作范围

本轮仅实现 MasterData。

允许动作按现有项目风格确定，推荐最小集合：

### customers

```text
CreateCustomer
UpdateCustomer
GetCustomer
ListCustomers
SetCustomerActive / DisableCustomer
```

### suppliers

```text
CreateSupplier
UpdateSupplier
GetSupplier
ListSuppliers
SetSupplierActive / DisableSupplier
```

### contacts

```text
CreateContact
UpdateContact
GetContact
ListContactsByOwner
SetPrimaryContact
DisableContact
```

如果现有项目采用不同命名，遵守现有风格。

---

## contacts guard 要求

contacts 是本轮重点。

必须实现或测试以下 guard：

```text
owner_type 必须是 CUSTOMER 或 SUPPLIER。
owner_id 必须存在于对应 customers 或 suppliers。
不能给不存在的 customer 创建 contact。
不能给不存在的 supplier 创建 contact。
同一 owner 最多一个 primary contact。
设置新的 primary contact 时，必须明确策略：
  方案 A：自动取消同 owner 其他 primary；
  方案 B：如果已有 primary，则返回错误。
```

Codex 必须选择一种策略，并在 review 中说明原因。

推荐策略：

```text
方案 A：设置新的 primary contact 时，事务内取消同 owner 其他 primary。
```

原因：

```text
更符合业务使用习惯，也与“同一 owner 最多一个 primary”一致。
```

如果现有项目风格更倾向返回错误，可以选择方案 B，但必须说明。

---

## customer / supplier 规则

必须保持主数据边界：

```text
customer 是客户主数据。
supplier 是供应商主数据。
它们不是订单事实。
它们不是财务事实。
```

V1 不处理：

```text
customer credit
AR/AP
invoice
payment
settlement_terms
full billing profile
supplier_material_profiles
```

只能保留已有 schema 字段。

---

## business_records 边界

本轮不得改 `business_records`。

必须在 review 中保持：

```text
business_records 继续作为兼容层、demo、seed、source snapshot、调研入口。
business_records 不长期替代正式 customers / suppliers / sales_orders / inventory / shipment / finance facts。
```

不得迁移旧数据。

不得修改前端 business record 页面。

---

## Workflow / Fact 边界

本轮不得接 Workflow。

必须保持：

```text
Workflow task done != Fact posted。
shipping_released != shipped。
shipment_release done -> shipping_released。
customers / suppliers / contacts 是 MasterData。
sales_order 是 Source Document。
shipment 才是未来出货事实。
inventory_txns 才是库存落账事实。
```

不得新增让 `workflow.go` 写这些对象的逻辑。

---

## tenant_id 规则

本轮禁止新增 `tenant_id`。

如果 grep 命中 `tenant_id`，必须解释是否只来自：

```text
imported notes
禁止说明
future SaaS 评审候选说明
current 不是 runtime tenant 说明
```

不得出现在：

```text
repo
usecase
tests
schema
generated code
migration SQL
runtime
```

---

## 测试分层选择

本轮必须选择测试层级。

### 静态检查

选择：是。

原因：

```text
本轮改 repo/usecase/tests，必须检查 diff、格式、禁止字段和边界词。
```

命令：

```bash
git status --short
git diff --stat
git diff --check
git ls-files --others --exclude-standard
```

### 单元测试

选择：是。

原因：

```text
本轮新增 repo/usecase 和 guard，必须覆盖核心逻辑。
```

命令：

```bash
cd server && go test ./internal/biz ./internal/data
```

如存在更窄 masterdata package，按真实结构补充。

### 集成测试

选择：有限选择。

原因：

```text
repo 可能需要 DB 测试；如果现有 data tests 使用 test DB，则运行对应 package。
```

命令：

```bash
cd server && go test ./internal/data
```

如果测试需要目标库 migration apply，而当前 DB pending，必须说明，不得擅自 apply migration，除非本轮明确允许。

### 冒烟测试

选择：否。

原因：

```text
本轮不改运行入口、API、UI 或部署。
```

### 回归测试

选择：是。

原因：

```text
新增 repo/usecase 不应破坏既有 biz/data 行为。
```

命令：

```bash
cd server && go test ./internal/biz ./internal/data
```

### E2E 测试

选择：否。

原因：

```text
本轮不改 UI 或用户路径。
```

### 视觉 / 样式回归

选择：否。

原因：

```text
本轮不改 UI / 样式。
```

---

## 验收命令

必须运行：

```bash
git status --short
git branch --show-current
git log --oneline -3
git diff --stat
git diff --check
git ls-files --others --exclude-standard
```

必须运行：

```bash
grep -R "tenant_id" server/internal/biz server/internal/data server/internal/data/model docs/product docs/architecture docs/customers docs/reference config deployments || true
grep -R "shipping_released" docs/product docs/architecture docs/customers docs/reference || true
grep -R "shipped_quantity\|shipment_id\|inventory_txn_id\|invoice_id\|payment_id\|ar_id\|ap_id\|product_sku_id" server/internal/biz server/internal/data || true
grep -R "ChangeUsecase\|change_records" server/internal/biz server/internal/data docs/product docs/architecture || true
```

必须运行：

```bash
cd server && go test ./internal/biz ./internal/data
```

如果新增了更窄 package 或 test 文件，也运行对应测试。

不得运行：

```bash
cd server && make data
cd server && make migrate_status
```

除非测试要求说明 DB 状态；不得 apply migration。

不得运行前端测试，除非本轮意外改了前端文件；如果改了前端文件，必须停止并报告，因为本轮禁止改前端。

---

## 需要更新的已有文档

允许小幅更新：

### docs/current-source-of-truth.md

必须写清：

```text
V1 repo/usecase for customers / suppliers / contacts has been added.
API/RBAC, UI, sales order usecase, seedData, docs registry, and business_records transition are not implemented yet.
```

如果本轮中止，则写清中止原因。

### progress.md

记录本轮：

```text
005 V1 masterdata repo/usecase for customers / suppliers / contacts completed.
No API / RBAC / UI / seedData / docs registry / business_records transition changes.
```

如果中止，记录中止原因。

### docs/product/v1-next-codex-goals.md

可以更新下一轮建议：

```text
006-v1-repo-usecase-sales-order
```

但不得把 006 写成已完成。

### docs/product/v1-schema-go-no-go.md

可以更新：

```text
005 customers / suppliers / contacts repo/usecase added
```

但不得把 API/UI 写成完成。

---

## 项目长期禁止项

必须遵守：

```text
- 不新增 tenant_id。
- 不实现 SaaS 多租户。
- 不实现 license server、套餐计费、客户工单系统。
- 不创建泛化 ChangeUsecase。
- 不创建泛化 change_records。
- 不把 current 客户资料写成 Product Core。
- 不让 WorkflowUsecase 写库存、出货、财务、应收、应付、发票、收付款事实。
- shipping_released != shipped。
- workflow task done != fact posted。
- business_records 是兼容层、demo、seed、source snapshot、调研入口，不是长期事实真源。
```

---

## 审查报告要求

本轮完成后必须生成：

```text
.codex-review/latest.md
```

审查报告必须遵守：

```text
docs/codex-goals/_review-output-protocol.md
```

用户必须能用下面命令复制：

```bash
cat .codex-review/latest.md | pbcopy
```

不要要求用户截图。

---

## 最终回复格式

Codex 最终回复必须包含：

```text
【完成】

【新增/修改文件】

【本轮改动范围】

【MasterData repo/usecase 清单】

【contacts owner guard 实现】

【primary contact 策略】

【business_records 边界】

【禁止路径检查】

【tenant_id 处理结论】

【Workflow / Fact 边界检查】

【测试层级选择】

【测试命令与结果】

【停止条件是否触发】

【Git 状态摘要】

【风险】

【下一轮 Codex Goal 建议】

【.codex-review/latest.md 复制命令】
cat .codex-review/latest.md | pbcopy
```

## 完成后给 GPT 的复盘材料

`.codex-review/latest.md` 必须包含：

```text
git status --short
git diff --stat
git ls-files --others --exclude-standard
repo/usecase 文件清单
contacts owner guard 解释
primary contact 策略解释
tenant_id grep 解释
shipping_released grep 解释
forbidden field grep 解释
禁止路径检查
测试层级选择
测试命令和结果
下一轮建议
```
````

### 077. user

_time `2026-05-31T00:25:55+08:00` · content_type `text` · node `dd9707fe-5c3c-4760-adb0-9c0946a02eb0`_

这个是我不小心开了另一个会话，那个会话顺带提交了导致的没所谓吧，没所谓我就开启005去了

### 078. assistant

_time `2026-05-31T00:25:56+08:00` · content_type `text` · node `1453ccbf-e124-42bf-bbec-60cf20ede8d7`_

没所谓，**只要那次提交是你确认过的、内容就是 003/004 相关改动，就可以继续开启 005。**

我之前提示那个“红点”，不是说它一定有问题，而是因为我们之前定过规则：

```text
Codex 默认不 commit、不 push
除非你明确允许
```

所以报告里出现：

```text
HEAD 已经是 e13208f
origin/main 与 HEAD 一致
工作区 clean
```

但又写“我未执行提交 / 推送”，这就说明**可能是你另一个会话或你自己顺手提交了**。既然你现在确认是不小心开了另一个会话顺带提交的，而且你接受这个结果，那就不用纠结。

开启 005 前，建议只确认三件事：

```bash
git status --short
git log --oneline -3
git branch --show-current
```

你要看到大概这种结果：

```text
git status --short
# 无输出

git log --oneline -3
# 最上面是 e13208f chore(schema): 生成 V1 Ent 代码和迁移

git branch --show-current
# main 或你当前工作分支
```

如果干净，就可以开 005。

不过 005 的 Goal 里我已经加了这条，继续保留：

```text
禁止 git add、commit、push、stash、回退非本轮改动。
```

也就是说，005 让 Codex 只做 repo/usecase，不要再顺带提交。下一轮如果你想提交，再由你手动决定。

### 079. user

_time `2026-05-31T00:43:30+08:00` · content_type `text` · node `7fd0ca05-0772-450e-b28b-92d04001c080`_

_（空消息）_

### 080. assistant

_time `2026-05-31T00:43:32+08:00` · content_type `text` · node `4a6d605e-4d67-4211-8fe1-eeb30ddce884`_

005 我判断：**合格，可以继续 006**。

关键点：005 只做了 `customers / suppliers / contacts` 的 MasterData repo/usecase 和测试，没有接 API/RBAC/UI、docs registry、seedData、sales order usecase 或 `business_records` transition；`contacts` 已在 usecase 层校验 `owner_type` 和 `owner_id`，primary contact 采用“设置新的 primary 时事务内取消同 owner 其他 primary”的方案；后端测试也通过。fileciteturn10file0

但有两个注意点：

1. `AGENTS.md`、`docs/codex-goals/README.md`、`_review-output-protocol.md` 有并行规则调整，不属于 005 runtime 实现。这个不一定有问题，但提交时要和 005 代码改动分清楚。  
2. 005 报告建议下一步是 `006-v1-repo-usecase-sales-order`，这个顺序对：先做 Sales Order Source Document usecase，**仍然不能碰 shipment / inventory / finance fact**。fileciteturn10file0

下面给你 006。

## 中文短 Goal

```text
目标：执行 docs/codex-goals/006-v1-repo-usecase-sales-order.md。

请先阅读 AGENTS.md，然后严格执行任务文件。每次新会话都不能依赖历史聊天记忆，只能以仓库文件为准。

本轮只允许实现 V1 Sales Order Source Document 的 repo/usecase 和测试：sales_orders / sales_order_items。必须基于 003/004 已生成的 Ent schema、generated code 和 migration，以及 005 已完成的 customers MasterData usecase/repo。

重点：sales_order 是 Source Document / Business Commitment，不是 shipment fact；sales_order_item 是承诺明细，不是库存、出货、财务事实。禁止新增 shipped_quantity。禁止从 sales_order 直接写 inventory_txns、shipments、reservations、AR/AP、invoice、payment。

禁止 API/RBAC、UI、docs registry、seedData、workflow.go、rbac.go、business_records 迁移。禁止 tenant_id、SaaS 多租户、license server、套餐计费、客户工单系统、ChangeUsecase、change_records。禁止 product_skus、purchase_orders、shipments、stock_reservations、finance facts。

本轮允许和禁止修改的文件，以任务 md 为准。

禁止 git add、commit、push、stash、回退非本轮改动。

完成后必须按 docs/codex-goals/_review-output-protocol.md 生成 .codex-review/latest.md。

用户应能用下面命令复制：

cat .codex-review/latest.md | pbcopy

不要要求用户截图。
```

## 文件名

```text
docs/codex-goals/006-v1-repo-usecase-sales-order.md
```

下面是完整可复制内容。

:::writing{variant="document" id="77146"}
# Codex Goal 006: V1 Repo / Usecase for Sales Orders

## 任务名称

006：V1 Sales Order repo / usecase：`sales_orders / sales_order_items`

---

## 任务性质

本轮属于：

```text
Runtime / Repo-Usecase
```

本轮只允许实现 V1 Sales Order Source Document 的后端 repo / biz usecase 和测试：

```text
sales_orders
sales_order_items
```

本轮必须基于 003 / 004 / 005 已完成内容：

```text
003: V1 Ent schema added.
004: Ent generated code and Atlas migration generated.
005: customers / suppliers / contacts MasterData repo/usecase added.
```

本轮不接 API。  
本轮不接 RBAC。  
本轮不接 UI。  
本轮不改 docs registry。  
本轮不改 seedData。  
本轮不做 business_records transition。  
本轮不做 shipment facts。  
本轮不做 inventory facts。  
本轮不做 finance facts。  

必须明确：

```text
本轮是否改 runtime：是，仅限 sales_orders / sales_order_items repo/usecase
本轮是否改 Ent schema：否
本轮是否新增 migration：否
本轮是否改 API：否
本轮是否改 UI：否
本轮是否改 docs registry：否
本轮是否改 seedData：否
本轮是否改 repo/usecase：是，仅限 sales_orders / sales_order_items
```

---

## 背景

003 已新增 V1 cutline 允许的 5 个 Ent schema：

```text
server/internal/data/model/schema/customer.go
server/internal/data/model/schema/supplier.go
server/internal/data/model/schema/contact.go
server/internal/data/model/schema/sales_order.go
server/internal/data/model/schema/sales_order_item.go
```

004 已完成：

```text
Ent generated code
Atlas migration
```

004 migration：

```text
server/internal/data/model/migrate/20260530161152_migrate.sql
```

005 已完成：

```text
customers / suppliers / contacts repo/usecase
contacts owner_type + owner_id guard
contacts primary contact 策略
```

006 的目标：

```text
只实现 sales_orders / sales_order_items 的 repo + biz usecase + tests。
```

006 不处理：

```text
API
RBAC
UI
数据导入
business_records 迁移
seedData
docs registry
shipment facts
stock reservations
inventory facts
finance facts
```

---

## 必须先读

### 项目规则

```text
AGENTS.md
README.md
docs/current-source-of-truth.md
progress.md
```

### GPT / Codex 上下文

```text
docs/codex-goals/_gpt-context-summary.md
docs/codex-goals/README.md
docs/codex-goals/_new-session-goal-template.md
docs/codex-goals/_goal-file-template.md
docs/codex-goals/_review-output-protocol.md
```

如果某些模板文件不存在，请记录缺失，不要自行大范围补模板。

### 003 / 004 / 005 Goal 与审查结果

```text
docs/codex-goals/003-v1-ent-schema-customers-suppliers-orders.md
docs/codex-goals/004-v1-migration-and-ent-generate.md
docs/codex-goals/005-v1-repo-usecase-masterdata.md
.codex-review/latest.md
```

如果 `.codex-review/latest.md` 不存在，请继续，但必须从 003/004/005 goal 和当前 git 状态中恢复上下文，并在最终报告中说明缺失。

### Phase 0 / 1 / 2 文档

```text
docs/product/zero-to-one-architecture.md
docs/product/product-principles.md
docs/product/domain-model-v1.md
docs/product/module-boundaries.md
docs/product/config-permission-policy.md
docs/product/customer-instance-policy.md
docs/product/customer-delta-policy.md
docs/product/rewrite-roadmap.md
docs/product/release-gates.md
docs/product/test-strategy.md
docs/architecture/status-workflow-fact-boundary.md

docs/architecture/masterdata-order-source-document-review.md
docs/architecture/customer-supplier-masterdata-review.md
docs/architecture/order-purchase-boundary-review.md
docs/product/domain-schema-draft-v1-v2.md
docs/product/migration-readiness-checklist.md
docs/product/phase1-implementation-plan.md
docs/product/phase1-risk-register.md

docs/product/schema-design-final-review.md
docs/product/v1-entity-decision-record.md
docs/product/v1-implementation-cutline.md
docs/product/v1-schema-go-no-go.md
docs/product/business-records-transition-plan.md
docs/product/v1-next-codex-goals.md
```

### Sales Order schema / generated code

```text
server/internal/data/model/schema/sales_order.go
server/internal/data/model/schema/sales_order_item.go
server/internal/data/model/ent/salesorder.go
server/internal/data/model/ent/salesorderitem.go
server/internal/data/model/migrate/20260530161152_migrate.sql
```

### MasterData repo/usecase

```text
server/internal/biz/masterdata.go
server/internal/biz/masterdata_test.go
server/internal/data/masterdata_repo.go
server/internal/data/masterdata_repo_test.go
```

### 现有 repo / usecase 风格

Codex 必须先查看真实仓库结构和现有实现风格，再写代码。

至少检查：

```text
server/internal/biz
server/internal/data
server/internal/data/*repo*
server/internal/biz/masterdata.go
server/internal/data/masterdata_repo.go
server/internal/biz/inventory.go
server/internal/biz/quality_inspection.go
server/internal/data/inventory*
server/internal/data/purchase*
server/internal/data/quality*
server/internal/data/model/ent
```

如果路径不同，以真实仓库为准，并在 `.codex-review/latest.md` 中说明。

---

## 当前真源与非真源

### 当前真源

本轮必须以这些为准：

```text
AGENTS.md
docs/current-source-of-truth.md
docs/codex-goals/006-v1-repo-usecase-sales-order.md
docs/product/v1-implementation-cutline.md
docs/product/v1-entity-decision-record.md
docs/product/v1-schema-go-no-go.md
docs/product/schema-design-final-review.md
server/internal/data/model/schema/sales_order.go
server/internal/data/model/schema/sales_order_item.go
server/internal/data/model/ent
server/internal/data/model/migrate/20260530161152_migrate.sql
server/internal/biz/masterdata.go
server/internal/data/masterdata_repo.go
现有 repo/usecase 代码风格
```

### 只能作为线索

```text
docs/customers/current/*
web/src/erp/config/seedData.mjs
截图
Excel 样本
PDF 样本
历史 Codex 输出
docs/reference/imported-notes/*
```

### 禁止作为当前实现真源

```text
历史聊天记忆
未经确认的截图 / 口头描述
未落地 architecture review
未实现 schema draft
current 客户样本字段
demo / seed 数据
```

必须保持：

```text
代码 / schema / migration / tests 是实现真源。
current-source-of-truth 是当前状态入口。
schema draft 不是 implemented。
architecture review 不是 runtime。
customer material 不是 Product Core。
```

---

## 允许修改的文件

本轮允许新增或修改：

### biz usecase

按现有项目风格选择文件名。

允许新增类似：

```text
server/internal/biz/sales_order.go
server/internal/biz/sales_order_test.go
```

或如现有风格更适合，也可以新增：

```text
server/internal/biz/order.go
server/internal/biz/order_test.go
```

但必须在 review 中说明选择原因。

### data repo

允许新增类似：

```text
server/internal/data/sales_order_repo.go
server/internal/data/sales_order_repo_test.go
```

或如现有风格更适合，也可以新增：

```text
server/internal/data/order_repo.go
server/internal/data/order_repo_test.go
```

但必须遵守现有 repo 风格。

### 文档 / 进度

允许小幅更新：

```text
docs/current-source-of-truth.md
docs/product/v1-next-codex-goals.md
docs/product/v1-schema-go-no-go.md
progress.md
```

### Codex review

允许生成或覆盖：

```text
.codex-review/latest.md
```

---

## 禁止修改的文件

本轮禁止修改：

```text
server/internal/biz/workflow.go
server/internal/biz/rbac.go
server/internal/data/model/schema
server/internal/data/model/migrate
server/internal/data/model/ent
server/internal/core
web/src/erp/config/docs.mjs
web/src/erp/config/seedData.mjs
web/src/erp/pages
web/src/erp/mobile
server/deploy
scripts
docs/codex-goals/_new-session-goal-template.md
docs/codex-goals/_goal-file-template.md
docs/codex-goals/_review-output-protocol.md
```

特别说明：

```text
本轮不得改 schema。
本轮不得改 generated code。
本轮不得改 migration。
本轮不得改 workflow.go。
本轮不得改 rbac.go。
本轮不得改 API/UI。
```

如果 Codex 发现必须修改禁止路径，必须停止并报告，不得自行修改。

---

## 改动范围分级

本轮范围级别：

```text
Runtime / Repo-Usecase
```

但仅限：

```text
sales_orders / sales_order_items
```

不得扩大到：

```text
customers / suppliers / contacts runtime 之外的新改动
API / RBAC / UI / seed / docs registry
```

禁止把下面内容放进同一轮：

```text
sales order usecase + API/RBAC + UI
sales order usecase + shipment facts
sales order usecase + inventory facts
sales order usecase + finance facts
```

发现范围不足时，停止并报告。

---

## 成功标准

本轮完成必须满足：

```text
- 实现 sales_orders repo / usecase。
- 实现 sales_order_items repo / usecase。
- 支持创建 sales order。
- 支持更新 sales order 基础信息。
- 支持获取 sales order。
- 支持列表查询 sales orders。
- 支持取消 / 关闭 sales order 或项目现有 Source Document 标准动作。
- 支持新增 / 更新 / 删除或取消 sales order items，按项目风格确定。
- 创建 sales order 必须校验 customer_id 存在。
- 创建 sales order item 必须校验 product_id 存在。
- 如 schema 包含 unit_id，必须校验 unit_id 存在。
- sales_order 生命周期状态必须用 canonical key。
- sales_order lifecycle 不能直接变成 shipped。
- 不允许新增 shipped_quantity。
- 不允许写 shipments。
- 不允许写 inventory_txns。
- 不允许写 stock_reservations。
- 不允许写 AR/AP/invoice/payment。
- 不允许从 sales_order usecase 触发 Workflow。
- 不允许 current 客户样本字段进入 Product Core。
- 不新增 tenant_id。
- 不改 Ent schema。
- 不新增 migration。
- 不改 generated code。
- 不接 API/RBAC。
- 不接 UI。
- 不改 docs registry。
- 不改 seedData。
- 不改 workflow.go。
- 不改 rbac.go。
- 不接 business_records transition。
- 测试覆盖 sales order source document 核心路径和状态 guard。
- .codex-review/latest.md 已生成。
```

不能只写“usecase 完成”。

---

## 停止条件

出现以下情况必须停止并报告：

```text
- 任务文件与 AGENTS.md 或当前代码真源冲突。
- 需要修改禁止路径。
- 需要新增 tenant_id。
- 需要实现 SaaS 多租户。
- 需要新增 migration。
- 需要修改 Ent schema 或 generated code。
- 需要修改 workflow.go 或 rbac.go。
- 需要接 API/RBAC/UI。
- 需要改 seedData 或 docs registry。
- 需要处理 shipment facts。
- 需要处理 inventory facts。
- 需要处理 finance facts。
- 需要处理 business_records 迁移。
- sales order usecase 无法保持 Source Document 边界。
- product_id / customer_id / unit_id 存在性 guard 无法实现。
- 现有测试环境无法验证 data repo 或 biz usecase。
- 测试失败原因不明确。
- 需要删除、回退、整理或 stash 非本轮改动。
```

停止时必须输出：

```text
停止原因：
涉及文件：
风险：
建议下一步：
```

---

## Git 策略

默认规则：

```text
- 本轮默认不提交、不推送。
- 不允许执行 git add .。
- 不允许自动 commit。
- 不允许自动 push。
- 不允许回退、整理或 stash 非本轮改动。
- 如需 stage，必须按路径精确 stage，并且用户明确要求。
```

必须先运行并记录：

```bash
git status --short
git branch --show-current
git log --oneline -3
```

如果发现当前仓库已经有自动 commit 或 origin/main 同步，必须在 review 中说明，不要继续 commit/push。

必须区分：

```text
tracked diff
untracked files
本轮新增文件
历史未跟踪文件
```

如果存在历史 untracked 文件，不要删除，报告即可。

---

## 业务动作范围

本轮仅实现 Sales Order Source Document。

允许动作按现有项目风格确定，推荐最小集合：

### sales_orders

```text
CreateSalesOrder
UpdateSalesOrder
GetSalesOrder
ListSalesOrders
CancelSalesOrder
CloseSalesOrder
```

### sales_order_items

```text
AddSalesOrderItem
UpdateSalesOrderItem
RemoveSalesOrderItem
ListSalesOrderItems
```

如果现有项目采用不同命名，遵守现有风格。

---

## sales_order 生命周期规则

sales_order 是 Source Document，不是 shipment fact。

允许状态应来自 schema 和 Phase 2 cutline。

推荐 canonical lifecycle status：

```text
draft
submitted
active
closed
canceled
```

如果 schema 里实际状态不同，以 schema 为准，并在 review 中说明。

必须保证：

```text
不允许 sales order usecase 直接设置 shipped。
不允许 sales order usecase 生成 shipped。
不允许 sales order usecase 写 shipment / inventory / finance fact。
```

允许：

```text
draft -> submitted
submitted -> active
active -> closed
draft/submitted/active -> canceled
```

如果本轮只实现更小状态集，也可以，但必须测试状态 guard。

---

## customer / product / unit guard

### customer guard

创建 sales order 时：

```text
customer_id 必须存在。
customer 必须 active，如现有项目有 active 规则。
```

如果客户不存在，必须返回明确业务错误。

### product guard

创建 sales order item 时：

```text
product_id 必须存在。
product 必须 active，如现有项目有 active 规则。
```

如果产品不存在，必须返回明确业务错误。

### unit guard

如果 sales_order_items schema 有 `unit_id`：

```text
unit_id 必须存在。
unit 必须 active，如现有项目有 active 规则。
```

如果 schema 没有 `unit_id`，不要新增字段，不要改 schema。

---

## order item 规则

sales_order_item 是承诺明细，不是出货事实。

必须保持：

```text
ordered quantity 是订单承诺数量。
unit price / amount 是订单明细金额。
product snapshots 是历史展示 / 对账辅助。
```

不得新增或写入：

```text
shipped_quantity
shipment_id
inventory_txn_id
invoice_id
payment_id
ar_id
ap_id
product_sku_id
```

如果 schema 已没有这些字段，不得新增。

---

## business_records 边界

本轮不得改 `business_records`。

必须在 review 中保持：

```text
business_records 继续作为兼容层、demo、seed、source snapshot、调研入口。
business_records 不长期替代正式 customers / suppliers / sales_orders / inventory / shipment / finance facts。
```

不得迁移旧数据。

不得修改前端 business record 页面。

---

## Workflow / Fact 边界

本轮不得接 Workflow。

必须保持：

```text
Workflow task done != Fact posted。
shipping_released != shipped。
shipment_release done -> shipping_released。
sales_order 是 Source Document。
shipment 才是未来出货事实。
inventory_txns 才是库存落账事实。
```

不得新增让 `workflow.go` 写这些对象的逻辑。

---

## tenant_id 规则

本轮禁止新增 `tenant_id`。

如果 grep 命中 `tenant_id`，必须解释是否只来自：

```text
imported notes
禁止说明
future SaaS 评审候选说明
current 不是 runtime tenant 说明
```

不得出现在：

```text
repo
usecase
tests
schema
generated code
migration SQL
runtime
```

---

## 测试分层选择

本轮必须选择测试层级。

### 静态检查

选择：是。

原因：

```text
本轮改 repo/usecase/tests/docs，需要检查 diff、格式、禁止字段和边界词。
```

命令：

```bash
git status --short
git diff --stat
git diff --check
git ls-files --others --exclude-standard
```

### 单元测试

选择：是。

原因：

```text
本轮新增 sales order usecase 和 guard，必须覆盖核心逻辑。
```

命令：

```bash
cd server && go test ./internal/biz ./internal/data
```

如存在更窄 sales order test，按真实结构补充。

### 集成测试

选择：有限选择。

原因：

```text
data repo 可能需要 SQLite enttest 验证 repo / DB 约束。
```

命令：

```bash
cd server && go test ./internal/data
```

如果测试需要目标库 migration apply，而当前 DB pending，必须说明，不得擅自 apply migration，除非本轮明确允许。

### 冒烟测试

选择：否。

原因：

```text
本轮不改运行入口、API、UI 或部署。
```

### 回归测试

选择：是。

原因：

```text
新增 repo/usecase 不应破坏既有 biz/data 行为。
```

命令：

```bash
cd server && go test ./internal/biz ./internal/data
```

### E2E 测试

选择：否。

原因：

```text
本轮不改 UI 或用户路径。
```

### 视觉 / 样式回归

选择：否。

原因：

```text
本轮不改 UI / 样式。
```

---

## 验收命令

必须运行：

```bash
git status --short
git branch --show-current
git log --oneline -3
git diff --stat
git diff --check
git ls-files --others --exclude-standard
```

必须运行：

```bash
grep -R "tenant_id" server/internal/biz server/internal/data server/internal/data/model docs/product docs/architecture docs/customers docs/reference config deployments || true
grep -R "shipping_released" docs/product docs/architecture docs/customers docs/reference || true
grep -R "shipped_quantity\|shipment_id\|inventory_txn_id\|invoice_id\|payment_id\|ar_id\|ap_id\|product_sku_id" server/internal/biz server/internal/data || true
grep -R "ChangeUsecase\|change_records" server/internal/biz server/internal/data docs/product docs/architecture || true
```

必须运行：

```bash
cd server && go test ./internal/biz ./internal/data
```

如果新增了更窄 package 或 test 文件，也运行对应测试。

不得运行：

```bash
cd server && make data
cd server && make migrate_status
```

除非测试要求说明 DB 状态；不得 apply migration。

不得运行前端测试，除非本轮意外改了前端文件；如果改了前端文件，必须停止并报告，因为本轮禁止改前端。

---

## 需要更新的已有文档

允许小幅更新：

### docs/current-source-of-truth.md

必须写清：

```text
V1 sales order repo/usecase has been added.
Sales order remains Source Document and does not write shipment / inventory / finance facts.
API/RBAC, UI, seedData, docs registry, business_records transition, shipment facts, inventory reservations, and finance facts are not implemented yet.
```

如果本轮中止，则写清中止原因。

### progress.md

记录本轮：

```text
006 V1 sales order repo/usecase completed.
No API / RBAC / UI / seedData / docs registry / business_records transition / shipment / inventory / finance changes.
```

如果中止，记录中止原因。

### docs/product/v1-next-codex-goals.md

可以更新下一轮建议：

```text
007-v1-api-rbac-masterdata-order
```

但不得把 007 写成已完成。

### docs/product/v1-schema-go-no-go.md

可以更新：

```text
006 sales order repo/usecase added
```

但不得把 API/UI 写成完成。

---

## 项目长期禁止项

必须遵守：

```text
- 不新增 tenant_id。
- 不实现 SaaS 多租户。
- 不实现 license server、套餐计费、客户工单系统。
- 不创建泛化 ChangeUsecase。
- 不创建泛化 change_records。
- 不把 current 客户资料写成 Product Core。
- 不让 WorkflowUsecase 写库存、出货、财务、应收、应付、发票、收付款事实。
- shipping_released != shipped。
- workflow task done != fact posted。
- business_records 是兼容层、demo、seed、source snapshot、调研入口，不是长期事实真源。
```

---

## 审查报告要求

本轮完成后必须生成：

```text
.codex-review/latest.md
```

审查报告必须遵守：

```text
docs/codex-goals/_review-output-protocol.md
```

用户必须能用下面命令复制：

```bash
cat .codex-review/latest.md | pbcopy
```

不要要求用户截图。

---

## 最终回复格式

Codex 最终回复必须包含：

```text
【完成】

【新增/修改文件】

【本轮改动范围】

【Sales Order repo/usecase 清单】

【Sales Order lifecycle 策略】

【customer/product/unit guard 实现】

【sales_order / shipment fact 边界】

【business_records 边界】

【禁止路径检查】

【tenant_id 处理结论】

【Workflow / Fact 边界检查】

【测试层级选择】

【测试命令与结果】

【停止条件是否触发】

【Git 状态摘要】

【风险】

【下一轮 Codex Goal 建议】

【.codex-review/latest.md 复制命令】
cat .codex-review/latest.md | pbcopy
```

## 完成后给 GPT 的复盘材料

`.codex-review/latest.md` 必须包含：

```text
git status --short
git diff --stat
git ls-files --others --exclude-standard
repo/usecase 文件清单
sales order lifecycle 策略解释
customer/product/unit guard 解释
sales_order / shipment fact 边界解释
tenant_id grep 解释
shipping_released grep 解释
forbidden field grep 解释
禁止路径检查
测试层级选择
测试命令和结果
下一轮建议
```
:::

### 081. user

_time `2026-05-31T01:02:51+08:00` · content_type `text` · node `72e53ffa-b29b-43bb-891c-581f6e1e3635`_

_（空消息）_

### 082. assistant

_time `2026-05-31T01:02:52+08:00` · content_type `text` · node `de08c040-3885-4274-9d27-7b15224f0d51`_

006 我判断：**业务实现目标合格，可以进入 007 API/RBAC**。

006 做对的点：

- 只实现了 `sales_orders / sales_order_items` 的 repo/usecase 和测试。
- `sales_order` 继续保持 Source Document / Business Commitment，不是出货事实。
- 生命周期限定为 `draft / submitted / active / closed / canceled`，没有 `shipped`。
- 没有新增 `shipped_quantity`、`shipment_id`、`inventory_txn_id`、`invoice_id`、`payment_id`、`product_sku_id` 等事实字段。
- 没有改 Workflow、schema、migration、generated code、API/UI、docs registry、seedData。
- `go test ./internal/biz ./internal/data` 与 `go test -count=1 ./internal/biz ./internal/data` 都通过。fileciteturn11file0

但这里仍然有一个 Git 流程红点：报告里 `git log` 已经出现 `94da857 feat(masterdata): 实现客户供应商联系人用例`，而当前 `git status` 仍有 006 的新增文件未跟踪。说明 005 已经被提交了，006 还没提交。这个可以接受，但后续继续明确：**Codex 不要自动 commit/push，除非你明确允许。**

下面给你 007。

## 中文短 Goal

```text
目标：执行 docs/codex-goals/007-v1-api-rbac-masterdata-order.md。

请先阅读 AGENTS.md，然后严格执行任务文件。每次新会话都不能依赖历史聊天记忆，只能以仓库文件为准。

本轮只允许接 V1 API/RBAC：customers、suppliers、contacts、sales_orders、sales_order_items。必须基于 003/004/005/006 已完成的 schema、migration、repo/usecase。

重点：只接 API/RBAC，不接 UI、不改 seedData、不改 docs registry、不做 business_records 迁移。sales_order 仍是 Source Document，不是 shipment fact；禁止写 shipments、stock_reservations、inventory_txns、AR/AP、invoice、payment。

禁止修改 Ent schema、migration、generated code、workflow.go、rbac.go、server/internal/core、web 页面、移动端页面。禁止 tenant_id、SaaS 多租户、license server、套餐计费、客户工单系统、ChangeUsecase、change_records。禁止 product_skus、purchase_orders、shipments、stock_reservations、finance facts。

本轮允许和禁止修改的文件，以任务 md 为准。

禁止 git add、commit、push、stash、回退非本轮改动。

完成后必须按 docs/codex-goals/_review-output-protocol.md 生成 .codex-review/latest.md。

用户应能用下面命令复制：

cat .codex-review/latest.md | pbcopy

不要要求用户截图。
```

## 文件名

```text
docs/codex-goals/007-v1-api-rbac-masterdata-order.md
```

## 完整可复制 MD

```md
# Codex Goal 007: V1 API / RBAC for MasterData and Sales Order

## 任务名称

007：V1 API / RBAC：`customers / suppliers / contacts / sales_orders / sales_order_items`

---

## 任务性质

本轮属于：

```text
API-RBAC
```

本轮只允许给已经完成 repo/usecase 的 V1 能力接 API/RBAC：

```text
customers
suppliers
contacts
sales_orders
sales_order_items
```

本轮必须基于 003 / 004 / 005 / 006 已完成内容：

```text
003: V1 Ent schema added.
004: Ent generated code and Atlas migration generated.
005: customers / suppliers / contacts MasterData repo/usecase added.
006: sales_orders / sales_order_items Source Document repo/usecase added.
```

本轮不接 UI。  
本轮不改 docs registry。  
本轮不改 seedData。  
本轮不做 business_records transition。  
本轮不做 data import。  
本轮不做 shipment facts。  
本轮不做 stock reservations。  
本轮不做 inventory facts。  
本轮不做 finance facts。  

必须明确：

```text
本轮是否改 runtime：是，仅限 API/RBAC 接入
本轮是否改 Ent schema：否
本轮是否新增 migration：否
本轮是否改 API：是
本轮是否改 RBAC：是
本轮是否改 UI：否
本轮是否改 docs registry：否
本轮是否改 seedData：否
本轮是否改 repo/usecase：原则上否，除非 API 接入暴露必要的小 bug 修复
```

---

## 背景

003 已新增 V1 cutline 允许的 5 个 Ent schema：

```text
server/internal/data/model/schema/customer.go
server/internal/data/model/schema/supplier.go
server/internal/data/model/schema/contact.go
server/internal/data/model/schema/sales_order.go
server/internal/data/model/schema/sales_order_item.go
```

004 已完成：

```text
Ent generated code
Atlas migration
```

004 migration：

```text
server/internal/data/model/migrate/20260530161152_migrate.sql
```

005 已完成：

```text
customers / suppliers / contacts repo/usecase
contacts owner_type + owner_id guard
contacts primary contact 策略
```

006 已完成：

```text
sales_orders / sales_order_items repo/usecase
sales order lifecycle: draft / submitted / active / closed / canceled
sales order item status: open / closed / canceled
customer / product / unit guard
```

007 的目标：

```text
只给 V1 MasterData 和 Sales Order 接 API/RBAC。
```

007 不处理：

```text
UI
移动端页面
数据导入
business_records 迁移
shipment facts
stock reservations
inventory facts
finance facts
```

---

## 必须先读

### 项目规则

```text
AGENTS.md
README.md
docs/current-source-of-truth.md
progress.md
```

### GPT / Codex 上下文

```text
docs/codex-goals/_gpt-context-summary.md
docs/codex-goals/README.md
docs/codex-goals/_new-session-goal-template.md
docs/codex-goals/_goal-file-template.md
docs/codex-goals/_review-output-protocol.md
```

如果某些模板文件不存在，请记录缺失，不要自行大范围补模板。

### 003 / 004 / 005 / 006 Goal 与审查结果

```text
docs/codex-goals/003-v1-ent-schema-customers-suppliers-orders.md
docs/codex-goals/004-v1-migration-and-ent-generate.md
docs/codex-goals/005-v1-repo-usecase-masterdata.md
docs/codex-goals/006-v1-repo-usecase-sales-order.md
.codex-review/latest.md
```

如果 `.codex-review/latest.md` 不存在，请继续，但必须从 003/004/005/006 goal 和当前 git 状态中恢复上下文，并在最终报告中说明缺失。

### Phase 0 / 1 / 2 文档

```text
docs/product/zero-to-one-architecture.md
docs/product/product-principles.md
docs/product/domain-model-v1.md
docs/product/module-boundaries.md
docs/product/config-permission-policy.md
docs/product/customer-instance-policy.md
docs/product/customer-delta-policy.md
docs/product/rewrite-roadmap.md
docs/product/release-gates.md
docs/product/test-strategy.md
docs/architecture/status-workflow-fact-boundary.md

docs/architecture/masterdata-order-source-document-review.md
docs/architecture/customer-supplier-masterdata-review.md
docs/architecture/order-purchase-boundary-review.md
docs/product/domain-schema-draft-v1-v2.md
docs/product/migration-readiness-checklist.md
docs/product/phase1-implementation-plan.md
docs/product/phase1-risk-register.md

docs/product/schema-design-final-review.md
docs/product/v1-entity-decision-record.md
docs/product/v1-implementation-cutline.md
docs/product/v1-schema-go-no-go.md
docs/product/business-records-transition-plan.md
docs/product/v1-next-codex-goals.md
```

### 已实现 repo/usecase

```text
server/internal/biz/masterdata.go
server/internal/biz/masterdata_test.go
server/internal/data/masterdata_repo.go
server/internal/data/masterdata_repo_test.go

server/internal/biz/sales_order.go
server/internal/biz/sales_order_test.go
server/internal/data/sales_order_repo.go
server/internal/data/sales_order_repo_test.go
```

### 现有 API / RBAC 风格

Codex 必须先查看真实仓库结构和现有实现风格，再写代码。

至少检查：

```text
server/internal/biz/rbac.go
server/internal/service
server/internal/server
server/internal/conf
server/api
server/internal/data
server/internal/biz
```

如果 API 入口不是这些路径，以真实仓库为准，并在 `.codex-review/latest.md` 中说明。

必须查找现有 JSON-RPC / HTTP / service 注册方式，例如：

```bash
grep -R "jsonrpc\|JSON-RPC\|Register\|rpc" server/internal server/api -n | head -80
```

也可以用 `rg`，以本地可用命令为准。

---

## 当前真源与非真源

### 当前真源

本轮必须以这些为准：

```text
AGENTS.md
docs/current-source-of-truth.md
docs/codex-goals/007-v1-api-rbac-masterdata-order.md
docs/product/v1-implementation-cutline.md
docs/product/v1-entity-decision-record.md
docs/product/v1-schema-go-no-go.md
docs/product/schema-design-final-review.md
server/internal/biz/masterdata.go
server/internal/data/masterdata_repo.go
server/internal/biz/sales_order.go
server/internal/data/sales_order_repo.go
server/internal/biz/rbac.go
现有 API / service / server 注册代码
```

### 只能作为线索

```text
docs/customers/current/*
web/src/erp/config/seedData.mjs
截图
Excel 样本
PDF 样本
历史 Codex 输出
docs/reference/imported-notes/*
```

### 禁止作为当前实现真源

```text
历史聊天记忆
未经确认的截图 / 口头描述
未落地 architecture review
未实现 schema draft
current 客户样本字段
demo / seed 数据
```

必须保持：

```text
代码 / schema / migration / tests 是实现真源。
current-source-of-truth 是当前状态入口。
schema draft 不是 implemented。
architecture review 不是 runtime。
customer material 不是 Product Core。
```

---

## 允许修改的文件

本轮允许新增或修改：

### API / service

按现有项目风格选择文件。

允许修改或新增类似：

```text
server/internal/service/*
server/internal/server/*
server/api/*
```

但仅限 V1 customers / suppliers / contacts / sales_orders / sales_order_items API 接入。

如果仓库使用 JSON-RPC registry，允许修改对应 registry 文件。

如果仓库使用 HTTP handlers，允许新增对应 handler / route。

如果仓库使用 Kratos service，允许新增对应 service 方法。

Codex 必须遵守现有风格，不引入新 API 框架。

### RBAC

允许修改：

```text
server/internal/biz/rbac.go
```

仅限新增 V1 API 所需权限码、菜单/动作权限映射或角色权限种子。

不得重构整个 RBAC。

不得改 RBAC 为多租户模型。

### API tests

允许新增或修改与本轮 API/RBAC 直接相关的测试。

路径按现有项目风格确定，例如：

```text
server/internal/service/*_test.go
server/internal/server/*_test.go
server/internal/biz/rbac_test.go
```

### 文档 / 进度

允许小幅更新：

```text
docs/current-source-of-truth.md
docs/product/v1-next-codex-goals.md
docs/product/v1-schema-go-no-go.md
progress.md
```

### Codex review

允许生成或覆盖：

```text
.codex-review/latest.md
```

---

## 禁止修改的文件

本轮禁止修改：

```text
server/internal/biz/workflow.go
server/internal/data/model/schema
server/internal/data/model/migrate
server/internal/data/model/ent
server/internal/core
web/src/erp/config/docs.mjs
web/src/erp/config/seedData.mjs
web/src/erp/pages
web/src/erp/mobile
server/deploy
scripts
docs/codex-goals/_new-session-goal-template.md
docs/codex-goals/_goal-file-template.md
docs/codex-goals/_review-output-protocol.md
```

原则上禁止修改 repo/usecase：

```text
server/internal/biz/masterdata.go
server/internal/data/masterdata_repo.go
server/internal/biz/sales_order.go
server/internal/data/sales_order_repo.go
```

如果 API 接入暴露出 repo/usecase 的必要小 bug，允许最小修复，但必须在 review 中单独说明：

```text
修复原因：
涉及方法：
为什么不能留到后续：
是否改变业务边界：
```

特别说明：

```text
本轮不得改 schema。
本轮不得改 generated code。
本轮不得改 migration。
本轮不得改 workflow.go。
本轮不得改 UI。
```

如果 Codex 发现必须修改禁止路径，必须停止并报告，不得自行修改。

---

## 改动范围分级

本轮范围级别：

```text
API-RBAC
```

仅限：

```text
customers / suppliers / contacts / sales_orders / sales_order_items
```

不得扩大到：

```text
UI
seedData
docs registry
business_records migration
shipment/inventory/finance facts
```

禁止把下面内容放进同一轮：

```text
API/RBAC + UI
API/RBAC + seedData
API/RBAC + business_records transition
API/RBAC + shipment facts
API/RBAC + finance facts
```

发现范围不足时，停止并报告。

---

## 成功标准

本轮完成必须满足：

```text
- 为 customers 提供 API 接入。
- 为 suppliers 提供 API 接入。
- 为 contacts 提供 API 接入。
- 为 sales_orders 提供 API 接入。
- 为 sales_order_items 提供 API 接入。
- API 调用必须走已实现 usecase，不得绕过 usecase 直接写 Ent。
- API 层不得复制业务状态机。
- API 层不得复制 contacts owner guard。
- API 层不得复制 sales order lifecycle 规则。
- RBAC 必须新增或复用清晰权限码。
- 后端必须校验动作权限，不能只靠前端隐藏菜单。
- 必须覆盖无权限或未登录 / 非管理员 / disabled admin / no permission 的至少核心路径测试，按现有项目 auth 测试能力执行。
- customers / suppliers / contacts API 不得写订单、库存、出货、财务事实。
- sales_order API 不得写 shipments、stock_reservations、inventory_txns、AR/AP、invoice、payment。
- sales_order API 不得允许 lifecycle 直接进入 shipped。
- 不新增 shipped_quantity。
- 不新增 tenant_id。
- 不改 Ent schema。
- 不新增 migration。
- 不改 generated code。
- 不改 UI。
- 不改 docs registry。
- 不改 seedData。
- 不改 workflow.go。
- 不接 business_records transition。
- 测试通过。
- .codex-review/latest.md 已生成。
```

不能只写“API 完成”。

---

## 停止条件

出现以下情况必须停止并报告：

```text
- 找不到现有 API 注册方式，且无法确认项目约定。
- 需要引入新 API 框架。
- 需要修改禁止路径。
- 需要新增 tenant_id。
- 需要实现 SaaS 多租户。
- 需要新增 migration。
- 需要修改 Ent schema 或 generated code。
- 需要修改 workflow.go。
- 需要接 UI。
- 需要改 seedData 或 docs registry。
- 需要处理 shipment facts。
- 需要处理 inventory facts。
- 需要处理 finance facts。
- 需要处理 business_records 迁移。
- API 无法走 usecase，只能直接写 Ent。
- RBAC 无法后端校验权限。
- 测试环境无法验证 API/RBAC 核心路径。
- 测试失败原因不明确。
- 需要删除、回退、整理或 stash 非本轮改动。
```

停止时必须输出：

```text
停止原因：
涉及文件：
风险：
建议下一步：
```

---

## Git 策略

默认规则：

```text
- 本轮默认不提交、不推送。
- 不允许执行 git add .。
- 不允许自动 commit。
- 不允许自动 push。
- 不允许回退、整理或 stash 非本轮改动。
- 如需 stage，必须按路径精确 stage，并且用户明确要求。
```

必须先运行并记录：

```bash
git status --short
git branch --show-current
git log --oneline -3
```

如果发现当前仓库已经有自动 commit 或 origin/main 同步，必须在 review 中说明，不要继续 commit/push。

必须区分：

```text
tracked diff
untracked files
本轮新增文件
历史未跟踪文件
```

如果存在历史 untracked 文件，不要删除，报告即可。

---

## API 范围

本轮 API 范围只包括 V1 后端能力。

### Customers API

必须支持或按项目风格等价支持：

```text
createCustomer
updateCustomer
getCustomer
listCustomers
setCustomerActive
```

### Suppliers API

必须支持或按项目风格等价支持：

```text
createSupplier
updateSupplier
getSupplier
listSuppliers
setSupplierActive
```

### Contacts API

必须支持或按项目风格等价支持：

```text
createContact
updateContact
getContact
listContactsByOwner
setPrimaryContact
disableContact
```

Contacts API 必须走 usecase guard。

不得在 API 层绕过：

```text
owner_type 合法性
owner_id 存在性
primary contact 策略
```

### Sales Orders API

必须支持或按项目风格等价支持：

```text
createSalesOrder
updateSalesOrder
getSalesOrder
listSalesOrders
submitSalesOrder
activateSalesOrder
closeSalesOrder
cancelSalesOrder
```

### Sales Order Items API

必须支持或按项目风格等价支持：

```text
addSalesOrderItem
updateSalesOrderItem
removeSalesOrderItem
listSalesOrderItems
```

Sales Order Items API 必须走 usecase guard。

不得在 API 层绕过：

```text
customer_id active guard
product_id active guard
unit_id active guard
lifecycle status guard
line status guard
```

---

## RBAC 范围

本轮只允许新增或复用权限码。

建议权限粒度：

```text
customer.view
customer.create
customer.update
customer.disable

supplier.view
supplier.create
supplier.update
supplier.disable

contact.view
contact.create
contact.update
contact.disable
contact.set_primary

sales_order.view
sales_order.create
sales_order.update
sales_order.submit
sales_order.activate
sales_order.close
sales_order.cancel

sales_order_item.view
sales_order_item.create
sales_order_item.update
sales_order_item.cancel
```

如果现有项目权限码命名不同，必须遵守现有风格，并在 review 中列出映射。

必须明确：

```text
菜单权限不等于动作权限。
前端隐藏按钮不是安全边界。
后端 API 必须校验动作权限。
```

不得做：

```text
tenant-scoped RBAC
SaaS tenant role model
客户可自由定义核心权限点
```

---

## Auth / Permission 测试要求

必须按现有项目能力覆盖核心路径。

优先覆盖：

```text
unauthenticated request
disabled admin
non-admin or not operator
admin without permission
admin with permission
```

如果现有测试框架没有这些 helper，必须说明限制，并至少覆盖权限函数 / handler guard 的可测部分。

不得因为测试困难就移除权限检查。

---

## business_records 边界

本轮不得改 `business_records`。

必须在 review 中保持：

```text
business_records 继续作为兼容层、demo、seed、source snapshot、调研入口。
business_records 不长期替代正式 customers / suppliers / sales_orders / inventory / shipment / finance facts。
```

不得迁移旧数据。

不得修改前端 business record 页面。

---

## Workflow / Fact 边界

本轮不得接 Workflow。

必须保持：

```text
Workflow task done != Fact posted。
shipping_released != shipped。
shipment_release done -> shipping_released。
sales_order 是 Source Document。
shipment 才是未来出货事实。
inventory_txns 才是库存落账事实。
```

不得新增让 `workflow.go` 写这些对象的逻辑。

---

## Sales Order / Shipment 边界

Sales Order API 不得支持：

```text
markAsShipped
shipSalesOrder
reserveStock
deductInventory
generateInvoice
generateReceivable
receivePayment
```

Sales Order API 只允许推进 Source Document 生命周期：

```text
draft
submitted
active
closed
canceled
```

`closed` 不等于 `shipped`。

如果需要未来出货，应后续单独做：

```text
ShipmentUsecase
stock_reservations
inventory outbound facts
```

---

## tenant_id 规则

本轮禁止新增 `tenant_id`。

如果 grep 命中 `tenant_id`，必须解释是否只来自：

```text
imported notes
禁止说明
future SaaS 评审候选说明
current 不是 runtime tenant 说明
```

不得出现在：

```text
API
RBAC
repo
usecase
tests
schema
generated code
migration SQL
runtime
```

---

## 测试分层选择

本轮必须选择测试层级。

### 静态检查

选择：是。

原因：

```text
本轮改 API/RBAC/tests/docs，需要检查 diff、格式、禁止字段和边界词。
```

命令：

```bash
git status --short
git diff --stat
git diff --check
git ls-files --others --exclude-standard
```

### 单元测试

选择：是。

原因：

```text
本轮新增 API/RBAC guard，必须覆盖核心逻辑。
```

命令：

```bash
cd server && go test ./internal/biz ./internal/data
```

以及 API / service 所在 package 的测试。

### 集成测试

选择：有限选择。

原因：

```text
API/RBAC 可能涉及 handler/service + auth/permission 链路。
```

命令按真实 package 选择。

### 冒烟测试

选择：否。

原因：

```text
本轮不改部署和前端入口。
```

### 回归测试

选择：是。

原因：

```text
API/RBAC 接入不应破坏既有 biz/data 行为。
```

命令：

```bash
cd server && go test ./internal/biz ./internal/data
```

### E2E 测试

选择：否。

原因：

```text
本轮不改 UI 或完整用户路径。
```

### 视觉 / 样式回归

选择：否。

原因：

```text
本轮不改 UI / 样式。
```

---

## 验收命令

必须运行：

```bash
git status --short
git branch --show-current
git log --oneline -3
git diff --stat
git diff --check
git ls-files --others --exclude-standard
```

必须运行：

```bash
grep -R "tenant_id" server/internal/biz server/internal/data server/internal/service server/internal/server server/api docs/product docs/architecture docs/customers docs/reference config deployments || true
grep -R "shipping_released" docs/product docs/architecture docs/customers docs/reference || true
grep -R "shipped_quantity\|shipment_id\|inventory_txn_id\|invoice_id\|payment_id\|ar_id\|ap_id\|product_sku_id" server/internal/biz server/internal/data server/internal/service server/internal/server server/api || true
grep -R "markAsShipped\|shipSalesOrder\|reserveStock\|deductInventory\|generateInvoice\|generateReceivable\|receivePayment" server/internal/biz server/internal/data server/internal/service server/internal/server server/api || true
grep -R "ChangeUsecase\|change_records" server/internal/biz server/internal/data server/internal/service server/internal/server server/api docs/product docs/architecture || true
```

必须运行：

```bash
cd server && go test ./internal/biz ./internal/data
```

还必须运行 API / service / server 相关测试。Codex 必须先识别真实 package 后运行，例如：

```bash
cd server && go test ./internal/service ./internal/server
```

如果 package 不存在，以真实结构为准，并在报告中说明。

不得运行：

```bash
cd server && make data
cd server && make migrate_status
```

除非任务要求说明 DB 状态；不得 apply migration。

不得运行前端测试，除非本轮意外改了前端文件；如果改了前端文件，必须停止并报告，因为本轮禁止改前端。

---

## 需要更新的已有文档

允许小幅更新：

### docs/current-source-of-truth.md

必须写清：

```text
V1 API/RBAC for customers / suppliers / contacts / sales_orders / sales_order_items has been added.
UI, seedData, docs registry, business_records transition, shipment facts, inventory reservations, and finance facts are not implemented yet.
```

如果本轮中止，则写清中止原因。

### progress.md

记录本轮：

```text
007 V1 API/RBAC for MasterData and Sales Order completed.
No UI / seedData / docs registry / business_records transition / shipment / inventory / finance changes.
```

如果中止，记录中止原因。

### docs/product/v1-next-codex-goals.md

可以更新下一轮建议：

```text
008-v1-frontend-masterdata-order-pages
```

但不得把 008 写成已完成。

### docs/product/v1-schema-go-no-go.md

可以更新：

```text
007 API/RBAC added
```

但不得把 UI 写成完成。

---

## 项目长期禁止项

必须遵守：

```text
- 不新增 tenant_id。
- 不实现 SaaS 多租户。
- 不实现 license server、套餐计费、客户工单系统。
- 不创建泛化 ChangeUsecase。
- 不创建泛化 change_records。
- 不把 current 客户资料写成 Product Core。
- 不让 WorkflowUsecase 写库存、出货、财务、应收、应付、发票、收付款事实。
- shipping_released != shipped。
- workflow task done != fact posted。
- business_records 是兼容层、demo、seed、source snapshot、调研入口，不是长期事实真源。
```

---

## 审查报告要求

本轮完成后必须生成：

```text
.codex-review/latest.md
```

审查报告必须遵守：

```text
docs/codex-goals/_review-output-protocol.md
```

用户必须能用下面命令复制：

```bash
cat .codex-review/latest.md | pbcopy
```

不要要求用户截图。

---

## 最终回复格式

Codex 最终回复必须包含：

```text
【完成】

【新增/修改文件】

【本轮改动范围】

【API 接入清单】

【RBAC 权限清单】

【权限校验策略】

【Auth / Permission 测试覆盖】

【Sales Order / Shipment 边界】

【business_records 边界】

【禁止路径检查】

【tenant_id 处理结论】

【Workflow / Fact 边界检查】

【测试层级选择】

【测试命令与结果】

【停止条件是否触发】

【Git 状态摘要】

【风险】

【下一轮 Codex Goal 建议】

【.codex-review/latest.md 复制命令】
cat .codex-review/latest.md | pbcopy
```

## 完成后给 GPT 的复盘材料

`.codex-review/latest.md` 必须包含：

```text
git status --short
git diff --stat
git ls-files --others --exclude-standard
API 文件清单
RBAC 权限清单
auth/permission 测试说明
sales order / shipment fact 边界解释
tenant_id grep 解释
shipping_released grep 解释
forbidden field grep 解释
禁止路径检查
测试层级选择
测试命令和结果
下一轮建议
```
```

### 083. user

_time `2026-05-31T01:07:17+08:00` · content_type `text` · node `8eee39b5-23ed-482d-af72-85581d846017`_

这个md没有完整可复制

### 084. assistant

_time `2026-05-31T01:07:18+08:00` · content_type `text` · node `d9593623-9426-44dc-8f37-e8a814bc3344`_

对，重新给你**完整单一代码块版**。下面整段就是：

```text
docs/codex-goals/007-v1-api-rbac-masterdata-order.md
```

直接复制整个代码块保存即可。

````md
# Codex Goal 007: V1 API / RBAC for MasterData and Sales Order

## 任务名称

007：V1 API / RBAC：`customers / suppliers / contacts / sales_orders / sales_order_items`

---

## 任务性质

本轮属于：

```text
API-RBAC
```

本轮只允许给已经完成 repo/usecase 的 V1 能力接 API/RBAC：

```text
customers
suppliers
contacts
sales_orders
sales_order_items
```

本轮必须基于 003 / 004 / 005 / 006 已完成内容：

```text
003: V1 Ent schema added.
004: Ent generated code and Atlas migration generated.
005: customers / suppliers / contacts MasterData repo/usecase added.
006: sales_orders / sales_order_items Source Document repo/usecase added.
```

本轮不接 UI。  
本轮不改 docs registry。  
本轮不改 seedData。  
本轮不做 business_records transition。  
本轮不做 data import。  
本轮不做 shipment facts。  
本轮不做 stock reservations。  
本轮不做 inventory facts。  
本轮不做 finance facts。  

必须明确：

```text
本轮是否改 runtime：是，仅限 API/RBAC 接入
本轮是否改 Ent schema：否
本轮是否新增 migration：否
本轮是否改 API：是
本轮是否改 RBAC：是
本轮是否改 UI：否
本轮是否改 docs registry：否
本轮是否改 seedData：否
本轮是否改 repo/usecase：原则上否，除非 API 接入暴露必要的小 bug 修复
```

---

## 背景

003 已新增 V1 cutline 允许的 5 个 Ent schema：

```text
server/internal/data/model/schema/customer.go
server/internal/data/model/schema/supplier.go
server/internal/data/model/schema/contact.go
server/internal/data/model/schema/sales_order.go
server/internal/data/model/schema/sales_order_item.go
```

004 已完成：

```text
Ent generated code
Atlas migration
```

004 migration：

```text
server/internal/data/model/migrate/20260530161152_migrate.sql
```

005 已完成：

```text
customers / suppliers / contacts repo/usecase
contacts owner_type + owner_id guard
contacts primary contact 策略
```

006 已完成：

```text
sales_orders / sales_order_items repo/usecase
sales order lifecycle: draft / submitted / active / closed / canceled
sales order item status: open / closed / canceled
customer / product / unit guard
```

007 的目标：

```text
只给 V1 MasterData 和 Sales Order 接 API/RBAC。
```

007 不处理：

```text
UI
移动端页面
数据导入
business_records 迁移
shipment facts
stock reservations
inventory facts
finance facts
```

---

## 必须先读

### 项目规则

```text
AGENTS.md
README.md
docs/current-source-of-truth.md
progress.md
```

### GPT / Codex 上下文

```text
docs/codex-goals/_gpt-context-summary.md
docs/codex-goals/README.md
docs/codex-goals/_new-session-goal-template.md
docs/codex-goals/_goal-file-template.md
docs/codex-goals/_review-output-protocol.md
```

如果某些模板文件不存在，请记录缺失，不要自行大范围补模板。

### 003 / 004 / 005 / 006 Goal 与审查结果

```text
docs/codex-goals/003-v1-ent-schema-customers-suppliers-orders.md
docs/codex-goals/004-v1-migration-and-ent-generate.md
docs/codex-goals/005-v1-repo-usecase-masterdata.md
docs/codex-goals/006-v1-repo-usecase-sales-order.md
.codex-review/latest.md
```

如果 `.codex-review/latest.md` 不存在，请继续，但必须从 003/004/005/006 goal 和当前 git 状态中恢复上下文，并在最终报告中说明缺失。

### Phase 0 / 1 / 2 文档

```text
docs/product/zero-to-one-architecture.md
docs/product/product-principles.md
docs/product/domain-model-v1.md
docs/product/module-boundaries.md
docs/product/config-permission-policy.md
docs/product/customer-instance-policy.md
docs/product/customer-delta-policy.md
docs/product/rewrite-roadmap.md
docs/product/release-gates.md
docs/product/test-strategy.md
docs/architecture/status-workflow-fact-boundary.md

docs/architecture/masterdata-order-source-document-review.md
docs/architecture/customer-supplier-masterdata-review.md
docs/architecture/order-purchase-boundary-review.md
docs/product/domain-schema-draft-v1-v2.md
docs/product/migration-readiness-checklist.md
docs/product/phase1-implementation-plan.md
docs/product/phase1-risk-register.md

docs/product/schema-design-final-review.md
docs/product/v1-entity-decision-record.md
docs/product/v1-implementation-cutline.md
docs/product/v1-schema-go-no-go.md
docs/product/business-records-transition-plan.md
docs/product/v1-next-codex-goals.md
```

### 已实现 repo/usecase

```text
server/internal/biz/masterdata.go
server/internal/biz/masterdata_test.go
server/internal/data/masterdata_repo.go
server/internal/data/masterdata_repo_test.go

server/internal/biz/sales_order.go
server/internal/biz/sales_order_test.go
server/internal/data/sales_order_repo.go
server/internal/data/sales_order_repo_test.go
```

### 现有 API / RBAC 风格

Codex 必须先查看真实仓库结构和现有实现风格，再写代码。

至少检查：

```text
server/internal/biz/rbac.go
server/internal/service
server/internal/server
server/internal/conf
server/api
server/internal/data
server/internal/biz
```

如果 API 入口不是这些路径，以真实仓库为准，并在 `.codex-review/latest.md` 中说明。

必须查找现有 JSON-RPC / HTTP / service 注册方式，例如：

```bash
grep -R "jsonrpc\|JSON-RPC\|Register\|rpc" server/internal server/api -n | head -80
```

也可以用 `rg`，以本地可用命令为准。

---

## 当前真源与非真源

### 当前真源

本轮必须以这些为准：

```text
AGENTS.md
docs/current-source-of-truth.md
docs/codex-goals/007-v1-api-rbac-masterdata-order.md
docs/product/v1-implementation-cutline.md
docs/product/v1-entity-decision-record.md
docs/product/v1-schema-go-no-go.md
docs/product/schema-design-final-review.md
server/internal/biz/masterdata.go
server/internal/data/masterdata_repo.go
server/internal/biz/sales_order.go
server/internal/data/sales_order_repo.go
server/internal/biz/rbac.go
现有 API / service / server 注册代码
```

### 只能作为线索

```text
docs/customers/current/*
web/src/erp/config/seedData.mjs
截图
Excel 样本
PDF 样本
历史 Codex 输出
docs/reference/imported-notes/*
```

### 禁止作为当前实现真源

```text
历史聊天记忆
未经确认的截图 / 口头描述
未落地 architecture review
未实现 schema draft
current 客户样本字段
demo / seed 数据
```

必须保持：

```text
代码 / schema / migration / tests 是实现真源。
current-source-of-truth 是当前状态入口。
schema draft 不是 implemented。
architecture review 不是 runtime。
customer material 不是 Product Core。
```

---

## 允许修改的文件

本轮允许新增或修改：

### API / service

按现有项目风格选择文件。

允许修改或新增类似：

```text
server/internal/service/*
server/internal/server/*
server/api/*
```

但仅限 V1 customers / suppliers / contacts / sales_orders / sales_order_items API 接入。

如果仓库使用 JSON-RPC registry，允许修改对应 registry 文件。

如果仓库使用 HTTP handlers，允许新增对应 handler / route。

如果仓库使用 Kratos service，允许新增对应 service 方法。

Codex 必须遵守现有风格，不引入新 API 框架。

### RBAC

允许修改：

```text
server/internal/biz/rbac.go
```

仅限新增 V1 API 所需权限码、菜单/动作权限映射或角色权限种子。

不得重构整个 RBAC。

不得改 RBAC 为多租户模型。

### API tests

允许新增或修改与本轮 API/RBAC 直接相关的测试。

路径按现有项目风格确定，例如：

```text
server/internal/service/*_test.go
server/internal/server/*_test.go
server/internal/biz/rbac_test.go
```

### 文档 / 进度

允许小幅更新：

```text
docs/current-source-of-truth.md
docs/product/v1-next-codex-goals.md
docs/product/v1-schema-go-no-go.md
progress.md
```

### Codex review

允许生成或覆盖：

```text
.codex-review/latest.md
```

---

## 禁止修改的文件

本轮禁止修改：

```text
server/internal/biz/workflow.go
server/internal/data/model/schema
server/internal/data/model/migrate
server/internal/data/model/ent
server/internal/core
web/src/erp/config/docs.mjs
web/src/erp/config/seedData.mjs
web/src/erp/pages
web/src/erp/mobile
server/deploy
scripts
docs/codex-goals/_new-session-goal-template.md
docs/codex-goals/_goal-file-template.md
docs/codex-goals/_review-output-protocol.md
```

原则上禁止修改 repo/usecase：

```text
server/internal/biz/masterdata.go
server/internal/data/masterdata_repo.go
server/internal/biz/sales_order.go
server/internal/data/sales_order_repo.go
```

如果 API 接入暴露出 repo/usecase 的必要小 bug，允许最小修复，但必须在 review 中单独说明：

```text
修复原因：
涉及方法：
为什么不能留到后续：
是否改变业务边界：
```

特别说明：

```text
本轮不得改 schema。
本轮不得改 generated code。
本轮不得改 migration。
本轮不得改 workflow.go。
本轮不得改 UI。
```

如果 Codex 发现必须修改禁止路径，必须停止并报告，不得自行修改。

---

## 改动范围分级

本轮范围级别：

```text
API-RBAC
```

仅限：

```text
customers / suppliers / contacts / sales_orders / sales_order_items
```

不得扩大到：

```text
UI
seedData
docs registry
business_records migration
shipment/inventory/finance facts
```

禁止把下面内容放进同一轮：

```text
API/RBAC + UI
API/RBAC + seedData
API/RBAC + business_records transition
API/RBAC + shipment facts
API/RBAC + finance facts
```

发现范围不足时，停止并报告。

---

## 成功标准

本轮完成必须满足：

```text
- 为 customers 提供 API 接入。
- 为 suppliers 提供 API 接入。
- 为 contacts 提供 API 接入。
- 为 sales_orders 提供 API 接入。
- 为 sales_order_items 提供 API 接入。
- API 调用必须走已实现 usecase，不得绕过 usecase 直接写 Ent。
- API 层不得复制业务状态机。
- API 层不得复制 contacts owner guard。
- API 层不得复制 sales order lifecycle 规则。
- RBAC 必须新增或复用清晰权限码。
- 后端必须校验动作权限，不能只靠前端隐藏菜单。
- 必须覆盖无权限或未登录 / 非管理员 / disabled admin / no permission 的至少核心路径测试，按现有项目 auth 测试能力执行。
- customers / suppliers / contacts API 不得写订单、库存、出货、财务事实。
- sales_order API 不得写 shipments、stock_reservations、inventory_txns、AR/AP、invoice、payment。
- sales_order API 不得允许 lifecycle 直接进入 shipped。
- 不新增 shipped_quantity。
- 不新增 tenant_id。
- 不改 Ent schema。
- 不新增 migration。
- 不改 generated code。
- 不改 UI。
- 不改 docs registry。
- 不改 seedData。
- 不改 workflow.go。
- 不接 business_records transition。
- 测试通过。
- .codex-review/latest.md 已生成。
```

不能只写“API 完成”。

---

## 停止条件

出现以下情况必须停止并报告：

```text
- 找不到现有 API 注册方式，且无法确认项目约定。
- 需要引入新 API 框架。
- 需要修改禁止路径。
- 需要新增 tenant_id。
- 需要实现 SaaS 多租户。
- 需要新增 migration。
- 需要修改 Ent schema 或 generated code。
- 需要修改 workflow.go。
- 需要接 UI。
- 需要改 seedData 或 docs registry。
- 需要处理 shipment facts。
- 需要处理 inventory facts。
- 需要处理 finance facts。
- 需要处理 business_records 迁移。
- API 无法走 usecase，只能直接写 Ent。
- RBAC 无法后端校验权限。
- 测试环境无法验证 API/RBAC 核心路径。
- 测试失败原因不明确。
- 需要删除、回退、整理或 stash 非本轮改动。
```

停止时必须输出：

```text
停止原因：
涉及文件：
风险：
建议下一步：
```

---

## Git 策略

默认规则：

```text
- 本轮默认不提交、不推送。
- 不允许执行 git add .。
- 不允许自动 commit。
- 不允许自动 push。
- 不允许回退、整理或 stash 非本轮改动。
- 如需 stage，必须按路径精确 stage，并且用户明确要求。
```

必须先运行并记录：

```bash
git status --short
git branch --show-current
git log --oneline -3
```

如果发现当前仓库已经有自动 commit 或 origin/main 同步，必须在 review 中说明，不要继续 commit/push。

必须区分：

```text
tracked diff
untracked files
本轮新增文件
历史未跟踪文件
```

如果存在历史 untracked 文件，不要删除，报告即可。

---

## API 范围

本轮 API 范围只包括 V1 后端能力。

### Customers API

必须支持或按项目风格等价支持：

```text
createCustomer
updateCustomer
getCustomer
listCustomers
setCustomerActive
```

### Suppliers API

必须支持或按项目风格等价支持：

```text
createSupplier
updateSupplier
getSupplier
listSuppliers
setSupplierActive
```

### Contacts API

必须支持或按项目风格等价支持：

```text
createContact
updateContact
getContact
listContactsByOwner
setPrimaryContact
disableContact
```

Contacts API 必须走 usecase guard。

不得在 API 层绕过：

```text
owner_type 合法性
owner_id 存在性
primary contact 策略
```

### Sales Orders API

必须支持或按项目风格等价支持：

```text
createSalesOrder
updateSalesOrder
getSalesOrder
listSalesOrders
submitSalesOrder
activateSalesOrder
closeSalesOrder
cancelSalesOrder
```

### Sales Order Items API

必须支持或按项目风格等价支持：

```text
addSalesOrderItem
updateSalesOrderItem
removeSalesOrderItem
listSalesOrderItems
```

Sales Order Items API 必须走 usecase guard。

不得在 API 层绕过：

```text
customer_id active guard
product_id active guard
unit_id active guard
lifecycle status guard
line status guard
```

---

## RBAC 范围

本轮只允许新增或复用权限码。

建议权限粒度：

```text
customer.view
customer.create
customer.update
customer.disable

supplier.view
supplier.create
supplier.update
supplier.disable

contact.view
contact.create
contact.update
contact.disable
contact.set_primary

sales_order.view
sales_order.create
sales_order.update
sales_order.submit
sales_order.activate
sales_order.close
sales_order.cancel

sales_order_item.view
sales_order_item.create
sales_order_item.update
sales_order_item.cancel
```

如果现有项目权限码命名不同，必须遵守现有风格，并在 review 中列出映射。

必须明确：

```text
菜单权限不等于动作权限。
前端隐藏按钮不是安全边界。
后端 API 必须校验动作权限。
```

不得做：

```text
tenant-scoped RBAC
SaaS tenant role model
客户可自由定义核心权限点
```

---

## Auth / Permission 测试要求

必须按现有项目能力覆盖核心路径。

优先覆盖：

```text
unauthenticated request
disabled admin
non-admin or not operator
admin without permission
admin with permission
```

如果现有测试框架没有这些 helper，必须说明限制，并至少覆盖权限函数 / handler guard 的可测部分。

不得因为测试困难就移除权限检查。

---

## business_records 边界

本轮不得改 `business_records`。

必须在 review 中保持：

```text
business_records 继续作为兼容层、demo、seed、source snapshot、调研入口。
business_records 不长期替代正式 customers / suppliers / sales_orders / inventory / shipment / finance facts。
```

不得迁移旧数据。

不得修改前端 business record 页面。

---

## Workflow / Fact 边界

本轮不得接 Workflow。

必须保持：

```text
Workflow task done != Fact posted。
shipping_released != shipped。
shipment_release done -> shipping_released。
sales_order 是 Source Document。
shipment 才是未来出货事实。
inventory_txns 才是库存落账事实。
```

不得新增让 `workflow.go` 写这些对象的逻辑。

---

## Sales Order / Shipment 边界

Sales Order API 不得支持：

```text
markAsShipped
shipSalesOrder
reserveStock
deductInventory
generateInvoice
generateReceivable
receivePayment
```

Sales Order API 只允许推进 Source Document 生命周期：

```text
draft
submitted
active
closed
canceled
```

`closed` 不等于 `shipped`。

如果需要未来出货，应后续单独做：

```text
ShipmentUsecase
stock_reservations
inventory outbound facts
```

---

## tenant_id 规则

本轮禁止新增 `tenant_id`。

如果 grep 命中 `tenant_id`，必须解释是否只来自：

```text
imported notes
禁止说明
future SaaS 评审候选说明
current 不是 runtime tenant 说明
```

不得出现在：

```text
API
RBAC
repo
usecase
tests
schema
generated code
migration SQL
runtime
```

---

## 测试分层选择

本轮必须选择测试层级。

### 静态检查

选择：是。

原因：

```text
本轮改 API/RBAC/tests/docs，需要检查 diff、格式、禁止字段和边界词。
```

命令：

```bash
git status --short
git diff --stat
git diff --check
git ls-files --others --exclude-standard
```

### 单元测试

选择：是。

原因：

```text
本轮新增 API/RBAC guard，必须覆盖核心逻辑。
```

命令：

```bash
cd server && go test ./internal/biz ./internal/data
```

以及 API / service 所在 package 的测试。

### 集成测试

选择：有限选择。

原因：

```text
API/RBAC 可能涉及 handler/service + auth/permission 链路。
```

命令按真实 package 选择。

### 冒烟测试

选择：否。

原因：

```text
本轮不改部署和前端入口。
```

### 回归测试

选择：是。

原因：

```text
API/RBAC 接入不应破坏既有 biz/data 行为。
```

命令：

```bash
cd server && go test ./internal/biz ./internal/data
```

### E2E 测试

选择：否。

原因：

```text
本轮不改 UI 或完整用户路径。
```

### 视觉 / 样式回归

选择：否。

原因：

```text
本轮不改 UI / 样式。
```

---

## 验收命令

必须运行：

```bash
git status --short
git branch --show-current
git log --oneline -3
git diff --stat
git diff --check
git ls-files --others --exclude-standard
```

必须运行：

```bash
grep -R "tenant_id" server/internal/biz server/internal/data server/internal/service server/internal/server server/api docs/product docs/architecture docs/customers docs/reference config deployments || true
grep -R "shipping_released" docs/product docs/architecture docs/customers docs/reference || true
grep -R "shipped_quantity\|shipment_id\|inventory_txn_id\|invoice_id\|payment_id\|ar_id\|ap_id\|product_sku_id" server/internal/biz server/internal/data server/internal/service server/internal/server server/api || true
grep -R "markAsShipped\|shipSalesOrder\|reserveStock\|deductInventory\|generateInvoice\|generateReceivable\|receivePayment" server/internal/biz server/internal/data server/internal/service server/internal/server server/api || true
grep -R "ChangeUsecase\|change_records" server/internal/biz server/internal/data server/internal/service server/internal/server server/api docs/product docs/architecture || true
```

必须运行：

```bash
cd server && go test ./internal/biz ./internal/data
```

还必须运行 API / service / server 相关测试。Codex 必须先识别真实 package 后运行，例如：

```bash
cd server && go test ./internal/service ./internal/server
```

如果 package 不存在，以真实结构为准，并在报告中说明。

不得运行：

```bash
cd server && make data
cd server && make migrate_status
```

除非任务要求说明 DB 状态；不得 apply migration。

不得运行前端测试，除非本轮意外改了前端文件；如果改了前端文件，必须停止并报告，因为本轮禁止改前端。

---

## 需要更新的已有文档

允许小幅更新：

### docs/current-source-of-truth.md

必须写清：

```text
V1 API/RBAC for customers / suppliers / contacts / sales_orders / sales_order_items has been added.
UI, seedData, docs registry, business_records transition, shipment facts, inventory reservations, and finance facts are not implemented yet.
```

如果本轮中止，则写清中止原因。

### progress.md

记录本轮：

```text
007 V1 API/RBAC for MasterData and Sales Order completed.
No UI / seedData / docs registry / business_records transition / shipment / inventory / finance changes.
```

如果中止，记录中止原因。

### docs/product/v1-next-codex-goals.md

可以更新下一轮建议：

```text
008-v1-frontend-masterdata-order-pages
```

但不得把 008 写成已完成。

### docs/product/v1-schema-go-no-go.md

可以更新：

```text
007 API/RBAC added
```

但不得把 UI 写成完成。

---

## 项目长期禁止项

必须遵守：

```text
- 不新增 tenant_id。
- 不实现 SaaS 多租户。
- 不实现 license server、套餐计费、客户工单系统。
- 不创建泛化 ChangeUsecase。
- 不创建泛化 change_records。
- 不把 current 客户资料写成 Product Core。
- 不让 WorkflowUsecase 写库存、出货、财务、应收、应付、发票、收付款事实。
- shipping_released != shipped。
- workflow task done != fact posted。
- business_records 是兼容层、demo、seed、source snapshot、调研入口，不是长期事实真源。
```

---

## 审查报告要求

本轮完成后必须生成：

```text
.codex-review/latest.md
```

审查报告必须遵守：

```text
docs/codex-goals/_review-output-protocol.md
```

用户必须能用下面命令复制：

```bash
cat .codex-review/latest.md | pbcopy
```

不要要求用户截图。

---

## 最终回复格式

Codex 最终回复必须包含：

```text
【完成】

【新增/修改文件】

【本轮改动范围】

【API 接入清单】

【RBAC 权限清单】

【权限校验策略】

【Auth / Permission 测试覆盖】

【Sales Order / Shipment 边界】

【business_records 边界】

【禁止路径检查】

【tenant_id 处理结论】

【Workflow / Fact 边界检查】

【测试层级选择】

【测试命令与结果】

【停止条件是否触发】

【Git 状态摘要】

【风险】

【下一轮 Codex Goal 建议】

【.codex-review/latest.md 复制命令】
cat .codex-review/latest.md | pbcopy
```

## 完成后给 GPT 的复盘材料

`.codex-review/latest.md` 必须包含：

```text
git status --short
git diff --stat
git ls-files --others --exclude-standard
API 文件清单
RBAC 权限清单
auth/permission 测试说明
sales order / shipment fact 边界解释
tenant_id grep 解释
shipping_released grep 解释
forbidden field grep 解释
禁止路径检查
测试层级选择
测试命令和结果
下一轮建议
```
````

### 085. user

_time `2026-05-31T12:02:17+08:00` · content_type `text` · node `23bbfe96-665d-46af-b876-8fbd2a2d6211`_

_（空消息）_

### 086. assistant

_time `2026-05-31T12:02:19+08:00` · content_type `text` · node `03029bd7-9d64-462d-94ce-5babb2f1b0ce`_

007 我判断：**合格，可以进入 008 前端页面接入**。

007 已经完成 V1 后端 JSON-RPC API/RBAC 接入：`customers / suppliers / contacts / sales_orders / sales_order_items` 都已接 API，写入全部走 `MasterDataUsecase` / `SalesOrderUsecase`，没有绕过 owner guard、primary contact 策略、sales order lifecycle guard、customer/product/unit active guard；并新增了对应 RBAC 权限和 API/RBAC 测试。它也没有改 UI、docs registry、seedData、schema、migration、generated code、Workflow，也没有写 shipment / inventory / finance facts。fileciteturn12file0

下一步合理进入：

```text
docs/codex-goals/008-v1-frontend-masterdata-order-pages.md
```

但 008 要注意：**只接 UI 页面，不改 schema/migration/API/RBAC/usecase，不做 business_records 迁移，不做出货/库存/财务事实。**

下面是完整可复制 MD。

````md
# Codex Goal 008: V1 Frontend Pages for MasterData and Sales Order

## 任务名称

008：V1 Frontend pages：`customers / suppliers / contacts / sales_orders / sales_order_items`

---

## 任务性质

本轮属于：

```text
UI
```

本轮只允许给已经完成后端 API/RBAC 的 V1 能力接前端页面：

```text
customers
suppliers
contacts
sales_orders
sales_order_items
```

本轮必须基于 003 / 004 / 005 / 006 / 007 已完成内容：

```text
003: V1 Ent schema added.
004: Ent generated code and Atlas migration generated.
005: customers / suppliers / contacts MasterData repo/usecase added.
006: sales_orders / sales_order_items Source Document repo/usecase added.
007: customers / suppliers / contacts / sales_orders / sales_order_items JSON-RPC API/RBAC added.
```

本轮只做 UI 页面接入。

本轮不改 schema。  
本轮不改 migration。  
本轮不改 generated code。  
本轮不改 repo/usecase。  
本轮不改 API/RBAC。  
本轮不改 docs registry。  
本轮不改 seedData。  
本轮不做 business_records transition。  
本轮不做 data import。  
本轮不做 shipment facts。  
本轮不做 stock reservations。  
本轮不做 inventory facts。  
本轮不做 finance facts。  

必须明确：

```text
本轮是否改 runtime：是，仅限前端 UI
本轮是否改 Ent schema：否
本轮是否新增 migration：否
本轮是否改 API：否
本轮是否改 RBAC：否
本轮是否改 UI：是
本轮是否改 docs registry：否
本轮是否改 seedData：否
本轮是否改 repo/usecase：否
```

---

## 背景

003 已新增 V1 cutline 允许的 5 个 Ent schema：

```text
server/internal/data/model/schema/customer.go
server/internal/data/model/schema/supplier.go
server/internal/data/model/schema/contact.go
server/internal/data/model/schema/sales_order.go
server/internal/data/model/schema/sales_order_item.go
```

004 已完成：

```text
Ent generated code
Atlas migration
```

005 已完成：

```text
customers / suppliers / contacts repo/usecase
contacts owner_type + owner_id guard
contacts primary contact 策略
```

006 已完成：

```text
sales_orders / sales_order_items repo/usecase
sales order lifecycle: draft / submitted / active / closed / canceled
sales order item status: open / closed / canceled
customer / product / unit guard
```

007 已完成：

```text
customers / suppliers / contacts JSON-RPC API
sales_orders / sales_order_items JSON-RPC API
customer.* / supplier.* / contact.* / sales_order.* / sales_order_item.* RBAC 权限码
API/RBAC tests
```

008 的目标：

```text
只给 V1 MasterData 和 Sales Order 接前端页面。
```

008 不处理：

```text
schema
migration
generated code
repo/usecase
API/RBAC
docs registry
seedData
business_records 迁移
shipment facts
stock reservations
inventory facts
finance facts
```

---

## 必须先读

### 项目规则

```text
AGENTS.md
README.md
docs/current-source-of-truth.md
progress.md
```

### GPT / Codex 上下文

```text
docs/codex-goals/_gpt-context-summary.md
docs/codex-goals/README.md
docs/codex-goals/_new-session-goal-template.md
docs/codex-goals/_goal-file-template.md
docs/codex-goals/_review-output-protocol.md
```

如果某些模板文件不存在，请记录缺失，不要自行大范围补模板。

### 003 / 004 / 005 / 006 / 007 Goal 与审查结果

```text
docs/codex-goals/003-v1-ent-schema-customers-suppliers-orders.md
docs/codex-goals/004-v1-migration-and-ent-generate.md
docs/codex-goals/005-v1-repo-usecase-masterdata.md
docs/codex-goals/006-v1-repo-usecase-sales-order.md
docs/codex-goals/007-v1-api-rbac-masterdata-order.md
.codex-review/latest.md
```

如果 `.codex-review/latest.md` 不存在，请继续，但必须从 003/004/005/006/007 goal 和当前 git 状态中恢复上下文，并在最终报告中说明缺失。

### Phase 0 / 1 / 2 文档

```text
docs/product/zero-to-one-architecture.md
docs/product/product-principles.md
docs/product/domain-model-v1.md
docs/product/module-boundaries.md
docs/product/config-permission-policy.md
docs/product/customer-instance-policy.md
docs/product/customer-delta-policy.md
docs/product/rewrite-roadmap.md
docs/product/release-gates.md
docs/product/test-strategy.md
docs/architecture/status-workflow-fact-boundary.md

docs/architecture/masterdata-order-source-document-review.md
docs/architecture/customer-supplier-masterdata-review.md
docs/architecture/order-purchase-boundary-review.md
docs/product/domain-schema-draft-v1-v2.md
docs/product/migration-readiness-checklist.md
docs/product/phase1-implementation-plan.md
docs/product/phase1-risk-register.md

docs/product/schema-design-final-review.md
docs/product/v1-entity-decision-record.md
docs/product/v1-implementation-cutline.md
docs/product/v1-schema-go-no-go.md
docs/product/business-records-transition-plan.md
docs/product/v1-next-codex-goals.md
```

### 已实现后端 API/RBAC

```text
server/internal/data/jsonrpc_masterdata_order.go
server/internal/data/jsonrpc_masterdata_order_test.go
server/internal/data/jsonrpc.go
server/internal/biz/rbac.go
```

### 现有前端结构

Codex 必须先查看真实仓库结构和现有实现风格，再写 UI。

至少检查：

```text
web/src/erp
web/src/erp/pages
web/src/erp/config
web/src/erp/components
web/src/erp/modules
web/src/erp/mobile
web/src/erp/docs
web/package.json
```

必须查找现有 API 调用方式、页面路由、菜单配置、权限判断方式，例如：

```bash
grep -R "jsonrpc\|JSON-RPC\|fetch\|request\|rpc" web/src/erp -n | head -120
grep -R "businessRecords\|businessModules\|permissions\|menu" web/src/erp/config web/src/erp/pages -n | head -120
```

也可以用 `rg`，以本地可用命令为准。

如果前端入口不是这些路径，以真实仓库为准，并在 `.codex-review/latest.md` 中说明。

---

## 当前真源与非真源

### 当前真源

本轮必须以这些为准：

```text
AGENTS.md
docs/current-source-of-truth.md
docs/codex-goals/008-v1-frontend-masterdata-order-pages.md
docs/product/v1-implementation-cutline.md
docs/product/v1-entity-decision-record.md
docs/product/v1-schema-go-no-go.md
docs/product/schema-design-final-review.md
server/internal/data/jsonrpc_masterdata_order.go
server/internal/biz/rbac.go
现有前端页面 / 路由 / API 调用 / 权限判断风格
```

### 只能作为线索

```text
docs/customers/current/*
web/src/erp/config/seedData.mjs
截图
Excel 样本
PDF 样本
历史 Codex 输出
docs/reference/imported-notes/*
```

### 禁止作为当前实现真源

```text
历史聊天记忆
未经确认的截图 / 口头描述
未落地 architecture review
未实现 schema draft
current 客户样本字段
demo / seed 数据
```

必须保持：

```text
代码 / schema / migration / tests 是实现真源。
current-source-of-truth 是当前状态入口。
schema draft 不是 implemented。
architecture review 不是 runtime。
customer material 不是 Product Core。
```

---

## 允许修改的文件

本轮允许新增或修改：

### 前端页面

按现有项目风格选择路径。

允许新增或修改类似：

```text
web/src/erp/pages/*
web/src/erp/modules/*
web/src/erp/components/*
```

但仅限 V1 customers / suppliers / contacts / sales_orders / sales_order_items 页面。

推荐根据现有结构建立或接入：

```text
customers 页面
suppliers 页面
contacts 页面或客户/供应商详情页内联系人区块
sales_orders 页面
sales_order_items 区块或订单详情页内明细区块
```

如果当前前端仍以 `businessRecords` 通用页面为主，允许新增独立 V1 页面入口或内部模块页面，但不得删除旧 business_records 页面。

### 前端 API client

允许新增或修改：

```text
web/src/erp/api/*
web/src/erp/services/*
web/src/erp/shared/api/*
web/src/erp/config/*
```

但仅限 V1 API 调用封装和菜单/模块入口。

不得改 `web/src/erp/config/docs.mjs`。  
不得改 `web/src/erp/config/seedData.mjs`。  

### 前端测试

允许新增或修改与本轮 UI 直接相关的测试。

路径按现有项目风格确定，例如：

```text
web/src/erp/**/*.test.*
web/tests/*
web/scripts/*
```

### 文档 / 进度

允许小幅更新：

```text
docs/current-source-of-truth.md
docs/product/v1-next-codex-goals.md
docs/product/v1-schema-go-no-go.md
progress.md
```

### Codex review

允许生成或覆盖：

```text
.codex-review/latest.md
```

---

## 禁止修改的文件

本轮禁止修改：

```text
server/internal/biz/workflow.go
server/internal/biz/rbac.go
server/internal/data/model/schema
server/internal/data/model/migrate
server/internal/data/model/ent
server/internal/data/masterdata_repo.go
server/internal/data/sales_order_repo.go
server/internal/data/jsonrpc_masterdata_order.go
server/internal/core
web/src/erp/config/docs.mjs
web/src/erp/config/seedData.mjs
server/deploy
scripts
docs/codex-goals/_new-session-goal-template.md
docs/codex-goals/_goal-file-template.md
docs/codex-goals/_review-output-protocol.md
```

原则上禁止修改后端：

```text
server/internal/biz/*
server/internal/data/*
server/internal/service/*
server/internal/server/*
server/api/*
```

如果 UI 接入暴露出 API 返回字段命名或 handler 的必要小 bug，必须停止并报告，不得自行修改后端。

特别说明：

```text
本轮不得改 schema。
本轮不得改 generated code。
本轮不得改 migration。
本轮不得改 workflow.go。
本轮不得改 rbac.go。
本轮不得改 API/RBAC。
本轮不得改 docs registry。
本轮不得改 seedData。
```

---

## 改动范围分级

本轮范围级别：

```text
UI
```

仅限：

```text
customers / suppliers / contacts / sales_orders / sales_order_items
```

不得扩大到：

```text
schema
migration
repo/usecase
API/RBAC
seedData
docs registry
business_records migration
shipment/inventory/finance facts
```

禁止把下面内容放进同一轮：

```text
UI + API/RBAC
UI + seedData
UI + docs registry
UI + business_records transition
UI + shipment facts
UI + finance facts
```

发现范围不足时，停止并报告。

---

## 成功标准

本轮完成必须满足：

```text
- customers 页面可列表、创建、编辑、查看、启停。
- suppliers 页面可列表、创建、编辑、查看、启停。
- contacts 可按 owner 查看、创建、编辑、设置 primary、禁用。
- sales_orders 页面可列表、创建、编辑、查看。
- sales_order 页面可提交、激活、关闭、取消。
- sales_order_items 可新增、编辑、取消/移除、列表查看。
- UI 调用 007 已存在 API，不绕过 API。
- UI 不直接写 Ent / local fake state 当真源。
- UI 不复制 sales order lifecycle 业务规则，只按 API 返回和 action 结果展示。
- UI 不把 shipping_released 显示成已出库。
- UI 不显示 sales_order 为 shipped。
- UI 不展示或编辑 shipped_quantity。
- UI 不展示 shipment / inventory / finance facts。
- UI 不把 current 客户样本字段写成固定产品字段。
- UI 权限按钮显示可以根据权限控制，但后端权限仍是安全边界。
- 不改 docs registry。
- 不改 seedData。
- 不改后端 API/RBAC。
- 不改 schema/migration/generated code。
- 不改 workflow.go。
- 测试通过。
- .codex-review/latest.md 已生成。
```

不能只写“页面完成”。

---

## 停止条件

出现以下情况必须停止并报告：

```text
- 找不到现有前端路由 / 页面 / API 调用方式，且无法确认项目约定。
- 需要引入新前端框架或大组件库。
- 需要修改后端 API/RBAC。
- 需要修改 seedData 或 docs registry。
- 需要改 schema/migration/generated code。
- 需要处理 business_records 迁移。
- 需要处理 shipment facts。
- 需要处理 inventory facts。
- 需要处理 finance facts。
- 需要新增 tenant_id。
- 需要实现 SaaS 多租户。
- UI 只能靠假数据完成，无法连接后端 API。
- UI 需要把 sales_order 显示成 shipped。
- UI 需要展示 shipped_quantity。
- UI 需要展示 shipment/inventory/finance facts。
- 测试环境无法验证前端核心路径。
- 测试失败原因不明确。
- 需要删除、回退、整理或 stash 非本轮改动。
```

停止时必须输出：

```text
停止原因：
涉及文件：
风险：
建议下一步：
```

---

## Git 策略

默认规则：

```text
- 本轮默认不提交、不推送。
- 不允许执行 git add .。
- 不允许自动 commit。
- 不允许自动 push。
- 不允许回退、整理或 stash 非本轮改动。
- 如需 stage，必须按路径精确 stage，并且用户明确要求。
```

必须先运行并记录：

```bash
git status --short
git branch --show-current
git log --oneline -3
```

如果发现当前仓库已经有自动 commit 或 origin/main 同步，必须在 review 中说明，不要继续 commit/push。

必须区分：

```text
tracked diff
untracked files
本轮新增文件
历史未跟踪文件
```

如果存在历史 untracked 文件，不要删除，报告即可。

---

## UI 范围

本轮 UI 范围只包括 V1 后端能力。

### Customers UI

必须支持或按现有项目风格等价支持：

```text
客户列表
创建客户
编辑客户
查看客户
启停客户
```

### Suppliers UI

必须支持或按现有项目风格等价支持：

```text
供应商列表
创建供应商
编辑供应商
查看供应商
启停供应商
```

### Contacts UI

必须支持或按现有项目风格等价支持：

```text
按 owner 查看联系人
创建联系人
编辑联系人
设置主联系人
禁用联系人
```

Contacts UI 必须使用后端 API。

不得在 UI 层绕过：

```text
owner_type 合法性
owner_id 存在性
primary contact 策略
```

### Sales Orders UI

必须支持或按现有项目风格等价支持：

```text
销售订单列表
创建销售订单
编辑销售订单
查看销售订单
提交销售订单
激活销售订单
关闭销售订单
取消销售订单
```

### Sales Order Items UI

必须支持或按现有项目风格等价支持：

```text
新增订单行
编辑订单行
移除/取消订单行
查看订单行
```

Sales Order Items UI 必须使用后端 API。

不得在 UI 层绕过：

```text
customer_id active guard
product_id active guard
unit_id active guard
lifecycle status guard
line status guard
```

---

## 权限与按钮显示

UI 可以根据当前用户权限控制按钮显示。

但必须保持：

```text
前端隐藏按钮不是安全边界。
后端 API/RBAC 才是安全边界。
```

如果现有前端已有权限判断工具，复用。

如果没有权限工具：

```text
不要发明复杂权限系统。
只做最小按钮禁用 / 隐藏，并在 review 中说明后端仍是最终校验。
```

---

## Sales Order / Shipment 边界

Sales Order UI 不得出现这些动作：

```text
标记已出库
确认出货
库存预留
扣减库存
生成发票
生成应收
登记收款
```

不得调用或新增：

```text
markAsShipped
shipSalesOrder
reserveStock
deductInventory
generateInvoice
generateReceivable
receivePayment
```

Sales Order UI 只允许展示和推进 Source Document 生命周期：

```text
draft
submitted
active
closed
canceled
```

`closed` 不等于 `shipped`。

如果页面需要说明出货状态，只能写：

```text
出货事实后续由 ShipmentUsecase 接入。
当前销售订单页面不代表已出货。
```

---

## business_records 边界

本轮不得迁移 `business_records`。

允许：

```text
新增正式 V1 页面入口。
保留旧 business_records 页面。
在文案中说明旧 business_records 是兼容 / demo / source snapshot 入口。
```

禁止：

```text
删除 business_records。
把 business_records 数据自动迁移到新模型。
让新 UI 双写 business_records 和新 API。
把 business_records 当事实真源。
```

如果当前前端菜单里已有 partners / orders business_records 入口，不要强行删除。

---

## Workflow / Fact 边界

本轮不得接 Workflow。

必须保持：

```text
Workflow task done != Fact posted。
shipping_released != shipped。
shipment_release done -> shipping_released。
sales_order 是 Source Document。
shipment 才是未来出货事实。
inventory_txns 才是库存落账事实。
```

不得新增让 UI 调用 workflow 或写 fact 的逻辑。

---

## tenant_id 规则

本轮禁止新增 `tenant_id`。

如果 grep 命中 `tenant_id`，必须解释是否只来自：

```text
imported notes
禁止说明
future SaaS 评审候选说明
current 不是 runtime tenant 说明
```

不得出现在：

```text
UI
API client
tests
runtime
schema
generated code
migration SQL
```

---

## 测试分层选择

本轮必须选择测试层级。

### 静态检查

选择：是。

原因：

```text
本轮改前端 UI/API client/tests/docs，需要检查 diff、格式、禁止字段和边界词。
```

命令：

```bash
git status --short
git diff --stat
git diff --check
git ls-files --others --exclude-standard
```

### 单元测试

选择：是。

原因：

```text
前端页面、API client、helper、权限按钮逻辑需要测试。
```

命令按真实项目选择，例如：

```bash
cd web && pnpm test
```

### 集成测试

选择：有限选择。

原因：

```text
本轮可能接前端 API client，但不启动真实后端。
```

如果现有前端测试有 mock API / integration test，运行对应测试。

### 冒烟测试

选择：有限选择。

原因：

```text
新增前端入口和页面，需要确认页面路由 / 渲染不炸。
```

命令按项目真实脚本选择。

### 回归测试

选择：是。

原因：

```text
新增页面和配置不应破坏现有 ERP 前端测试。
```

命令：

```bash
cd web && pnpm test
```

### E2E 测试

选择：否或有限选择。

原因：

```text
本轮不做完整用户路径端到端，除非项目已有轻量 browser QA 可直接跑。
```

如果现有 E2E 非常轻量且项目要求，可运行；否则说明未选原因。

### 视觉 / 样式回归

选择：有限选择。

原因：

```text
新增页面可能影响样式 / 布局。
```

如果项目有 `style:l1` 或类似脚本，运行：

```bash
cd web && pnpm style:l1
```

---

## 验收命令

必须运行：

```bash
git status --short
git branch --show-current
git log --oneline -3
git diff --stat
git diff --check
git ls-files --others --exclude-standard
```

必须运行：

```bash
grep -R "tenant_id" web/src/erp server/internal/biz server/internal/data docs/product docs/architecture docs/customers docs/reference config deployments || true
grep -R "shipping_released" web/src/erp docs/product docs/architecture docs/customers docs/reference || true
grep -R "shipped_quantity\|shipment_id\|inventory_txn_id\|invoice_id\|payment_id\|ar_id\|ap_id\|product_sku_id" web/src/erp server/internal/biz server/internal/data || true
grep -R "markAsShipped\|shipSalesOrder\|reserveStock\|deductInventory\|generateInvoice\|generateReceivable\|receivePayment" web/src/erp server/internal/biz server/internal/data || true
grep -R "ChangeUsecase\|change_records" web/src/erp server/internal/biz server/internal/data docs/product docs/architecture || true
```

必须运行前端测试：

```bash
cd web && pnpm test
```

如果本轮改 CSS / layout / className / style：

```bash
cd web && pnpm css
cd web && pnpm style:l1
```

如果项目要求 lint：

```bash
cd web && pnpm lint
```

必须保留后端回归：

```bash
cd server && go test ./internal/biz ./internal/data
```

不得运行：

```bash
cd server && make data
cd server && make migrate_status
```

不得 apply migration。

---

## 需要更新的已有文档

允许小幅更新：

### docs/current-source-of-truth.md

必须写清：

```text
V1 frontend pages for customers / suppliers / contacts / sales_orders / sales_order_items have been added.
The pages use V1 API/RBAC and do not write shipment / inventory / finance facts.
seedData, docs registry, business_records transition, shipment facts, inventory reservations, and finance facts are not implemented yet.
```

如果本轮中止，则写清中止原因。

### progress.md

记录本轮：

```text
008 V1 frontend pages for MasterData and Sales Order completed.
No schema / migration / generated code / API / RBAC / seedData / docs registry / business_records transition / shipment / inventory / finance changes.
```

如果中止，记录中止原因。

### docs/product/v1-next-codex-goals.md

可以更新下一轮建议：

```text
009-business-records-transition-audit
010-current-customer-data-import-draft
```

但不得把 009/010 写成已完成。

### docs/product/v1-schema-go-no-go.md

可以更新：

```text
008 frontend pages added
```

但不得把 business_records transition 或 shipment facts 写成完成。

---

## 项目长期禁止项

必须遵守：

```text
- 不新增 tenant_id。
- 不实现 SaaS 多租户。
- 不实现 license server、套餐计费、客户工单系统。
- 不创建泛化 ChangeUsecase。
- 不创建泛化 change_records。
- 不把 current 客户资料写成 Product Core。
- 不让 WorkflowUsecase 写库存、出货、财务、应收、应付、发票、收付款事实。
- shipping_released != shipped。
- workflow task done != fact posted。
- business_records 是兼容层、demo、seed、source snapshot、调研入口，不是长期事实真源。
```

---

## 审查报告要求

本轮完成后必须生成：

```text
.codex-review/latest.md
```

审查报告必须遵守：

```text
docs/codex-goals/_review-output-protocol.md
```

用户必须能用下面命令复制：

```bash
cat .codex-review/latest.md | pbcopy
```

不要要求用户截图。

---

## 最终回复格式

Codex 最终回复必须包含：

```text
【完成】

【新增/修改文件】

【本轮改动范围】

【前端页面清单】

【API client 接入清单】

【权限按钮策略】

【Sales Order / Shipment 边界】

【business_records 边界】

【禁止路径检查】

【tenant_id 处理结论】

【Workflow / Fact 边界检查】

【测试层级选择】

【测试命令与结果】

【停止条件是否触发】

【Git 状态摘要】

【风险】

【下一轮 Codex Goal 建议】

【.codex-review/latest.md 复制命令】
cat .codex-review/latest.md | pbcopy
```

## 完成后给 GPT 的复盘材料

`.codex-review/latest.md` 必须包含：

```text
git status --short
git diff --stat
git ls-files --others --exclude-standard
前端页面清单
API client 文件清单
权限按钮策略
sales order / shipment fact 边界解释
business_records 边界解释
tenant_id grep 解释
shipping_released grep 解释
forbidden field grep 解释
禁止路径检查
测试层级选择
测试命令和结果
下一轮建议
```
````

### 087. user

_time `2026-05-31T12:21:14+08:00` · content_type `text` · node `b30c58dd-12d8-42c1-aa12-d363fd748a2e`_

短goal不给我妈

### 088. assistant

_time `2026-05-31T12:21:16+08:00` · content_type `text` · node `3ee827ce-148e-4195-961e-9a6694b5064e`_

给，刚才漏了。008 的中文短 Goal 如下：

```text
目标：执行 docs/codex-goals/008-v1-frontend-masterdata-order-pages.md。

请先阅读 AGENTS.md，然后严格执行任务文件。每次新会话都不能依赖历史聊天记忆，只能以仓库文件为准。

本轮只允许接 V1 前端页面：customers、suppliers、contacts、sales_orders、sales_order_items。必须基于 003/004/005/006/007 已完成的 schema、migration、repo/usecase、JSON-RPC API 和 RBAC。

重点：只接 UI 页面，不改 schema、migration、generated code、repo/usecase、API/RBAC、docs registry、seedData，不做 business_records 迁移。sales_order 仍是 Source Document，不是 shipment fact；禁止写 shipments、stock_reservations、inventory_txns、AR/AP、invoice、payment。

禁止修改 workflow.go、rbac.go、server/internal/data/model、server/internal/data/jsonrpc_masterdata_order.go、web/src/erp/config/docs.mjs、web/src/erp/config/seedData.mjs。禁止 tenant_id、SaaS 多租户、license server、套餐计费、客户工单系统、ChangeUsecase、change_records。禁止 product_skus、purchase_orders、shipments、stock_reservations、finance facts。

本轮允许和禁止修改的文件，以任务 md 为准。

禁止 git add、commit、push、stash、回退非本轮改动。

完成后必须按 docs/codex-goals/_review-output-protocol.md 生成 .codex-review/latest.md。

用户应能用下面命令复制：

cat .codex-review/latest.md | pbcopy

不要要求用户截图。
```

### 089. user

_time `2026-05-31T12:59:04+08:00` · content_type `text` · node `b2305351-3a3e-4fd4-b8dc-c7e12f054af1`_

_（空消息）_

### 090. assistant

_time `2026-05-31T12:59:06+08:00` · content_type `text` · node `9b0d39fd-59e2-493a-9c04-8e1db096a21c`_

008 我判断：**合格，可以进入 009**。它已经完成 V1 前端页面接入：新增 `masterdata / sales_order` 前端 client，新增 customers / suppliers / contacts / sales_orders / sales_order_items 页面和路由，并且没有改 schema、migration、generated code、repo/usecase、后端 API/RBAC、docs registry、seedData，也没有迁移 `business_records` 或写 shipment / inventory / finance facts。测试也覆盖了 `pnpm lint/css/test/style:l1`、后端 `go test` 和 mocked RPC route render。fileciteturn12file0

下一步我建议按报告里的建议走：**009 先做 business_records transition audit**，不要直接删旧入口，也不要直接迁移数据。因为现在正式 V1 页面已经出现，但旧 `business_records` 兼容入口还在，最容易产生“双真源 / 双写 / 菜单误导”。fileciteturn12file0

## 中文短 Goal

```text
目标：执行 docs/codex-goals/009-business-records-transition-audit.md。

请先阅读 AGENTS.md，然后严格执行任务文件。每次新会话都不能依赖历史聊天记忆，只能以仓库文件为准。

本轮只做 business_records 兼容层过渡审计和退出方案设计。只允许写审计文档、引用清单、风险清单、迁移草案和下一步计划。

重点：business_records 仍是兼容层、demo、seed、source snapshot、调研入口，不是长期事实真源。本轮不得删除 business_records，不得改 schema/migration/generated code，不得改 repo/usecase/API/RBAC/UI，不得改 docs registry，不得改 seedData，不得做真实数据迁移。

禁止 tenant_id、SaaS 多租户、license server、套餐计费、客户工单系统、ChangeUsecase、change_records。禁止 product_skus、purchase_orders、shipments、stock_reservations、finance facts。禁止从 Workflow 写库存、出货、财务事实。shipping_released != shipped。

本轮允许和禁止修改的文件，以任务 md 为准。

禁止 git add、commit、push、stash、回退非本轮改动。

完成后必须按 docs/codex-goals/_review-output-protocol.md 生成 .codex-review/latest.md。

用户应能用下面命令复制：

cat .codex-review/latest.md | pbcopy

不要要求用户截图。
```

## 文件名

```text
docs/codex-goals/009-business-records-transition-audit.md
```

## 完整可复制 MD

```md
# Codex Goal 009: business_records Transition Audit

## 任务名称

009：business_records 兼容层过渡审计与退出方案

---

## 任务性质

本轮属于：

Audit / Docs-only

本轮只允许做审计、文档和计划。

本轮不改 runtime。  
本轮不改 Ent schema。  
本轮不新增 migration。  
本轮不改 generated code。  
本轮不改 repo/usecase。  
本轮不改 API/RBAC。  
本轮不改 UI。  
本轮不改 docs registry。  
本轮不改 seedData。  
本轮不迁移数据。  
本轮不删除 business_records。  

必须明确：

本轮是否改 runtime：否
本轮是否改 Ent schema：否
本轮是否新增 migration：否
本轮是否改 API：否
本轮是否改 RBAC：否
本轮是否改 UI：否
本轮是否改 docs registry：否
本轮是否改 seedData：否
本轮是否改 repo/usecase：否
本轮是否做真实数据迁移：否

---

## 背景

003 已新增 V1 Ent schema：

- customers
- suppliers
- contacts
- sales_orders
- sales_order_items

004 已完成：

- Ent generated code
- Atlas migration

005 已完成：

- customers / suppliers / contacts repo/usecase
- contacts owner_type + owner_id guard
- contacts primary contact 策略

006 已完成：

- sales_orders / sales_order_items repo/usecase
- sales order lifecycle: draft / submitted / active / closed / canceled
- sales order item status: open / closed / canceled
- customer / product / unit guard

007 已完成：

- customers / suppliers / contacts JSON-RPC API
- sales_orders / sales_order_items JSON-RPC API
- V1 API/RBAC 权限码和测试

008 已完成：

- V1 customers / suppliers / contacts 前端页面
- V1 sales_orders / sales_order_items 前端页面
- V1 前端 API client
- V1 路由
- 前端测试、mocked route render、style:l1

但旧的 business_records 兼容层仍然存在。

business_records 当前定位：

- 兼容层
- demo
- seed
- source snapshot
- 调研入口
- 旧页面 / 旧样本承载层

business_records 不是：

- 长期事实真源
- 正式 customers / suppliers 真源
- 正式 sales_orders 真源
- 库存事实
- 出货事实
- 财务事实

009 的目标：

审计 business_records 现在被哪些页面、配置、seed、docs、测试、helper、API 使用，判断它与 V1 正式模型的重叠点，输出过渡计划。

009 不处理：

- 删除 business_records
- 修改 business_records schema
- 修改 business_records repo/usecase
- 修改 business_records API
- 修改前端页面
- 修改 seedData
- 修改 docs registry
- 执行数据迁移
- 写 import/backfill 代码
- 写双写逻辑

---

## 必须先读

### 项目规则

- AGENTS.md
- README.md
- docs/current-source-of-truth.md
- progress.md

### GPT / Codex 上下文

- docs/codex-goals/_gpt-context-summary.md
- docs/codex-goals/README.md
- docs/codex-goals/_new-session-goal-template.md
- docs/codex-goals/_goal-file-template.md
- docs/codex-goals/_review-output-protocol.md

如果某些模板文件不存在，请记录缺失，不要自行大范围补模板。

### 003 / 004 / 005 / 006 / 007 / 008 Goal 与审查结果

- docs/codex-goals/003-v1-ent-schema-customers-suppliers-orders.md
- docs/codex-goals/004-v1-migration-and-ent-generate.md
- docs/codex-goals/005-v1-repo-usecase-masterdata.md
- docs/codex-goals/006-v1-repo-usecase-sales-order.md
- docs/codex-goals/007-v1-api-rbac-masterdata-order.md
- docs/codex-goals/008-v1-frontend-masterdata-order-pages.md
- .codex-review/latest.md

如果 .codex-review/latest.md 不存在，请继续，但必须从 003/004/005/006/007/008 goal 和当前 git 状态中恢复上下文，并在最终报告中说明缺失。

### Phase 0 / 1 / 2 文档

- docs/product/zero-to-one-architecture.md
- docs/product/product-principles.md
- docs/product/domain-model-v1.md
- docs/product/module-boundaries.md
- docs/product/config-permission-policy.md
- docs/product/customer-instance-policy.md
- docs/product/customer-delta-policy.md
- docs/product/rewrite-roadmap.md
- docs/product/release-gates.md
- docs/product/test-strategy.md
- docs/architecture/status-workflow-fact-boundary.md

- docs/architecture/masterdata-order-source-document-review.md
- docs/architecture/customer-supplier-masterdata-review.md
- docs/architecture/product-sku-bom-boundary-review.md
- docs/architecture/order-purchase-boundary-review.md
- docs/product/domain-schema-draft-v1-v2.md
- docs/product/migration-readiness-checklist.md
- docs/product/phase1-implementation-plan.md
- docs/product/phase1-risk-register.md

- docs/product/schema-design-final-review.md
- docs/product/v1-entity-decision-record.md
- docs/product/v1-implementation-cutline.md
- docs/product/v1-schema-go-no-go.md
- docs/product/business-records-transition-plan.md
- docs/product/v1-next-codex-goals.md

### business_records 相关代码与配置

Codex 必须先搜索真实仓库，不要猜路径。

至少搜索：

- business_records
- businessRecords
- BusinessRecord
- partners
- project-orders
- sales-orders
- products
- customer
- supplier

建议命令：

    grep -R "business_records\|businessRecords\|BusinessRecord" server web docs -n | head -200
    grep -R "partners\|project-orders\|sales-orders" web/src/erp docs -n | head -200

如本地有 rg，可用 rg。

必须重点检查：

- server/internal/data/model/schema/business_record.go
- server/internal/data/model/ent/businessrecord*
- server/internal/data/business_record*
- server/internal/biz/business*
- server/internal/data/jsonrpc*
- web/src/erp/config/businessModules.mjs
- web/src/erp/config/businessRecordDefinitions.mjs
- web/src/erp/config/seedData.mjs
- web/src/erp/router.jsx
- web/src/erp/pages/*
- web/src/erp/api/*
- web/src/erp/utils/*
- web/src/erp/docs/*
- docs/current-source-of-truth.md
- docs/product/*
- docs/architecture/*

如果某些文件不存在，请记录缺失，不要猜。

---

## 当前真源与非真源

### 当前真源

本轮必须以这些为准：

- AGENTS.md
- docs/current-source-of-truth.md
- docs/product/business-records-transition-plan.md
- docs/product/v1-implementation-cutline.md
- docs/product/v1-schema-go-no-go.md
- docs/product/v1-next-codex-goals.md
- server/internal/data/model/schema/business_record.go
- 现有 business_records 相关代码
- 现有 business_records 相关前端配置
- 003 到 008 已完成的 V1 正式模型 / API / UI 文件

### 只能作为线索

- docs/customers/current/*
- web/src/erp/config/seedData.mjs
- 截图
- Excel 样本
- PDF 样本
- 历史 Codex 输出
- docs/reference/imported-notes/*

### 禁止作为当前实现真源

- 历史聊天记忆
- 未经确认的截图 / 口头描述
- 未落地 architecture review
- 未实现 schema draft
- current 客户样本字段
- demo / seed 数据

必须保持：

- 代码 / schema / migration / tests 是实现真源。
- current-source-of-truth 是当前状态入口。
- schema draft 不是 implemented。
- architecture review 不是 runtime。
- customer material 不是 Product Core。
- business_records 是兼容层，不是正式事实真源。

---

## 允许修改的文件

本轮允许新增：

- docs/product/business-records-reference-audit.md
- docs/product/business-records-transition-audit.md
- docs/product/business-records-cutover-plan.md
- docs/product/business-records-data-map-draft.md
- docs/product/business-records-risk-register.md

允许小幅更新：

- docs/current-source-of-truth.md
- docs/product/business-records-transition-plan.md
- docs/product/v1-next-codex-goals.md
- docs/product/v1-schema-go-no-go.md
- progress.md

允许生成或覆盖：

- .codex-review/latest.md

---

## 禁止修改的文件

本轮禁止修改：

- server/internal/biz/*
- server/internal/data/*
- server/internal/data/model/schema/*
- server/internal/data/model/migrate/*
- server/internal/data/model/ent/*
- server/internal/core/*
- web/src/erp/config/docs.mjs
- web/src/erp/config/seedData.mjs
- web/src/erp/router.jsx
- web/src/erp/pages/*
- web/src/erp/api/*
- web/src/erp/utils/*
- web/src/erp/mobile/*
- server/deploy
- scripts
- docs/codex-goals/_new-session-goal-template.md
- docs/codex-goals/_goal-file-template.md
- docs/codex-goals/_review-output-protocol.md

特别说明：

- 本轮不得改 business_records 代码。
- 本轮不得改 business_records schema。
- 本轮不得改 V1 页面。
- 本轮不得改 seedData。
- 本轮不得改 docs registry。
- 本轮不得做任何实际迁移。
- 本轮不得做双写。
- 本轮不得删除旧入口。

如果 Codex 发现必须修改禁止路径，必须停止并报告，不得自行修改。

---

## 改动范围分级

本轮范围级别：

Audit / Docs-only

不得扩大到：

- runtime
- schema
- migration
- generated code
- repo/usecase
- API/RBAC
- UI
- seedData
- docs registry
- data migration
- import/backfill

禁止把下面内容放进同一轮：

- audit + 删除 business_records
- audit + seedData 改造
- audit + UI 入口切换
- audit + API 双写
- audit + 数据迁移
- audit + import/backfill

发现范围不足时，停止并报告。

---

## 成功标准

本轮完成必须满足：

- 输出 business_records 引用审计清单。
- 输出 business_records 与 V1 正式模型的重叠矩阵。
- 输出 business_records 可以继续保留的范围。
- 输出 business_records 不应继续承载的范围。
- 输出 business_records 切换 / 降级 / 只读 / deprecated 的分阶段计划。
- 输出 business_records 数据映射草案，但不迁移数据。
- 输出 current 客户样本和 demo/seed 的处理建议。
- 输出 business_records 相关风险登记。
- 明确哪些内容可以进入后续 import draft。
- 明确哪些内容必须等待人工确认。
- 明确哪些内容不能自动迁移。
- 不删除 business_records。
- 不改 business_records runtime。
- 不改 V1 页面。
- 不改 seedData。
- 不改 docs registry。
- 不新增 tenant_id。
- 不新增 schema/migration。
- 不新增 ChangeUsecase/change_records。
- 不写 shipment/inventory/finance facts。
- .codex-review/latest.md 已生成。

不能只写“已完成审计”。

---

## 停止条件

出现以下情况必须停止并报告：

- 任务文件与 AGENTS.md 或当前代码真源冲突。
- 需要修改禁止路径。
- 需要删除 business_records。
- 需要修改 business_records schema。
- 需要修改 business_records runtime。
- 需要改 seedData 或 docs registry。
- 需要改 V1 页面。
- 需要做数据迁移。
- 需要写 import/backfill 代码。
- 需要新增 tenant_id。
- 需要实现 SaaS 多租户。
- 需要新增 schema/migration。
- 需要写 shipment/inventory/finance facts。
- 无法区分 demo/seed/source snapshot 与正式事实。
- 无法确认引用来源。
- 需要删除、回退、整理或 stash 非本轮改动。

停止时必须输出：

停止原因：
涉及文件：
风险：
建议下一步：

---

## Git 策略

默认规则：

- 本轮默认不提交、不推送。
- 不允许执行 git add .
- 不允许自动 commit。
- 不允许自动 push。
- 不允许回退、整理或 stash 非本轮改动。
- 如需 stage，必须按路径精确 stage，并且用户明确要求。

必须先运行并记录：

    git status --short
    git branch --show-current
    git log --oneline -3

如果发现当前仓库已经有自动 commit 或 origin/main 同步，必须在 review 中说明，不要继续 commit/push。

必须区分：

- tracked diff
- untracked files
- 本轮新增文件
- 历史未跟踪文件

如果存在历史 untracked 文件，不要删除，报告即可。

---

## 审计内容要求

### 1. business-records-reference-audit.md

路径：

- docs/product/business-records-reference-audit.md

必须包含：

- business_records 后端 schema 引用。
- business_records 后端 repo/usecase/API 引用。
- business_records 前端页面引用。
- business_records 前端 config 引用。
- business_records seed/demo 引用。
- business_records docs 引用。
- business_records tests 引用。
- business_records 与 partners / project-orders / products / orders 相关的入口。
- 每个引用的作用：
  - runtime
  - UI
  - seed/demo
  - docs/help
  - test
  - compatibility
  - source snapshot
- 每个引用是否与 V1 正式模型重叠。
- 每个引用建议：
  - keep
  - keep as demo
  - make read-only
  - deprecate later
  - replace by V1
  - needs manual review

必须用表格。

### 2. business-records-transition-audit.md

路径：

- docs/product/business-records-transition-audit.md

必须回答：

- business_records 当前是什么。
- business_records 现在不能是什么。
- V1 customers / suppliers / contacts 出现后，partners 类入口如何处理。
- V1 sales_orders 出现后，orders / project-orders 类入口如何处理。
- products 类 business_records 与现有 products schema 如何避免重复。
- business_records 如何继续作为兼容层。
- business_records 如何避免双写真源。
- business_records 何时进入只读。
- business_records 何时可以标记 deprecated。
- business_records 是否能删除，删除前需要哪些条件。
- 哪些内容必须人工确认。

必须明确：

business_records 是兼容层、demo、seed、source snapshot、调研入口，不是长期事实真源。

### 3. business-records-cutover-plan.md

路径：

- docs/product/business-records-cutover-plan.md

必须输出分阶段计划：

Stage 0: 当前状态
- business_records 继续存在。
- V1 正式模型已具备 schema / migration / repo/usecase / API/RBAC / UI。
- business_records 仍可能承载旧入口、demo、source snapshot、seed。

Stage 1: 并行可见但禁止双写
- 新 V1 页面作为正式入口。
- business_records 相关重叠入口不得继续新增核心功能。
- 不做自动迁移。
- 不删除旧数据。

Stage 2: 只读 / demo 化
- 重叠领域的 business_records 页面转为只读或 demo。
- seed/demo 明确标记。
- 用户操作引导到 V1 页面。

Stage 3: 数据映射 / dry-run
- 只做 dry-run mapping。
- 输出可迁移、不可迁移、需人工确认清单。
- 不写正式数据。

Stage 4: 受控迁移
- 只有人工确认后才允许执行。
- 必须有备份、回滚、校验。
- 必须禁止双写。

Stage 5: deprecated / archive
- 只在引用清零、数据完成迁移、客户确认后执行。
- 不建议当前阶段做。

### 4. business-records-data-map-draft.md

路径：

- docs/product/business-records-data-map-draft.md

必须输出映射草案：

- business_records partners -> customers / suppliers / contacts
- business_records project-orders / orders -> sales_orders / sales_order_items
- business_records products -> existing products / future product_skus draft-only
- business_records materials -> existing materials
- business_records warehouses -> existing warehouses

每类必须写：

- source fields
- target model
- target fields
- can auto map?
- needs manual review?
- forbidden auto map?
- notes

必须明确：

- current 客户样本字段不能自动变成 Product Core 必填字段。
- product_skus 仍 draft-only，不得自动映射。
- purchase_orders / shipments / finance facts 仍 deferred，不得自动映射。
- 没有事实依据不得生成 shipment / inventory / finance facts。

### 5. business-records-risk-register.md

路径：

- docs/product/business-records-risk-register.md

必须列风险：

- 双真源风险。
- 双写风险。
- demo 数据误当正式数据。
- current 客户字段污染 Product Core。
- business_records orders 误当 sales_orders。
- business_records products 与 products schema 重复。
- partners 同时对应 customers / suppliers。
- 旧页面继续新增功能导致 V1 失焦。
- 自动迁移误写正式数据。
- 删除 business_records 破坏历史文档 / demo / QA。
- seedData / docs registry 修改引发前端回归。
- 迁移后无法回滚。
- 用户误认为 business_records 是正式入口。

每项写：

- risk
- impact
- evidence
- mitigation
- owner layer
- next review needed

---

## Workflow / Fact 边界

本轮不得接 Workflow。

必须保持：

- Workflow task done != Fact posted。
- shipping_released != shipped。
- shipment_release done -> shipping_released。
- sales_order 是 Source Document。
- shipment 才是未来出货事实。
- inventory_txns 才是库存落账事实。

不得新增让 workflow 写这些对象的逻辑。

---

## Sales Order / Shipment 边界

business_records audit 不得建议：

- markAsShipped
- shipSalesOrder
- reserveStock
- deductInventory
- generateInvoice
- generateReceivable
- receivePayment

不得建议从 business_records 自动生成：

- shipments
- stock_reservations
- inventory_txns
- AR/AP
- invoice
- payment

---

## tenant_id 规则

本轮禁止新增 tenant_id。

如果 grep 命中 tenant_id，必须解释是否只来自：

- imported notes
- 禁止说明
- future SaaS 评审候选说明
- current 不是 runtime tenant 说明

不得进入：

- schema
- runtime
- migration
- transition plan
- data mapping target

---

## 测试分层选择

本轮必须选择测试层级。

### 静态检查

选择：是。

原因：

本轮改文档，需要检查 diff、格式、边界词和禁止项。

命令：

    git status --short
    git diff --stat
    git diff --check
    git ls-files --others --exclude-standard

### 单元测试

选择：否。

原因：

本轮 docs-only，不改代码。

### 集成测试

选择：否。

原因：

本轮 docs-only，不改 API/repo/usecase/DB。

### 冒烟测试

选择：否。

原因：

本轮不改运行入口或前端页面。

### 回归测试

选择：有限选择。

原因：

如果只改 docs/product，不需要跑前后端全量；如果误改 web/docs registry，则必须停止。

### E2E 测试

选择：否。

原因：

本轮不改 UI 或用户路径。

### 视觉 / 样式回归

选择：否。

原因：

本轮不改 UI / 样式。

---

## 验收命令

必须运行：

    git status --short
    git branch --show-current
    git log --oneline -3
    git diff --stat
    git diff --check
    git ls-files --others --exclude-standard

必须运行引用审计命令：

    grep -R "business_records\|businessRecords\|BusinessRecord" server web docs -n || true
    grep -R "partners\|project-orders\|sales-orders" web/src/erp docs -n || true

必须运行边界检查：

    grep -R "tenant_id" docs/product docs/architecture docs/customers docs/reference config deployments || true
    grep -R "shipping_released" docs/product docs/architecture docs/customers docs/reference || true
    grep -R "shipped_quantity\|shipment_id\|inventory_txn_id\|invoice_id\|payment_id\|ar_id\|ap_id\|product_sku_id" docs/product docs/architecture || true
    grep -R "markAsShipped\|shipSalesOrder\|reserveStock\|deductInventory\|generateInvoice\|generateReceivable\|receivePayment" docs/product docs/architecture || true
    grep -R "ChangeUsecase\|change_records" docs/product docs/architecture || true

不得运行：

    cd server && make data
    cd server && make migrate_status

不得运行前端测试，除非本轮意外改了前端文件；如果改了前端文件，必须停止并报告。

不得运行后端测试，除非本轮意外改了后端文件；如果改了后端文件，必须停止并报告。

---

## 需要更新的已有文档

允许小幅更新：

### docs/current-source-of-truth.md

必须写清：

business_records transition audit has been added.
No runtime, API, UI, seedData, docs registry, migration, schema, import/backfill, or deletion has been implemented.

### progress.md

记录本轮：

009 business_records transition audit completed.
No runtime / schema / migration / API / UI / seedData / docs registry / import/backfill changes.

如果本轮中止，记录中止原因。

### docs/product/v1-next-codex-goals.md

可以更新下一轮建议：

- 010-current-customer-data-import-draft
- 或 008-menu-entry-review / V1 menu entry goal，如项目更需要菜单入口

但不得把下一轮写成已完成。

### docs/product/v1-schema-go-no-go.md

可以更新：

009 business_records transition audit added

但不得把 migration / import / deletion 写成完成。

---

## 项目长期禁止项

必须遵守：

- 不新增 tenant_id。
- 不实现 SaaS 多租户。
- 不实现 license server、套餐计费、客户工单系统。
- 不创建泛化 ChangeUsecase。
- 不创建泛化 change_records。
- 不把 current 客户资料写成 Product Core。
- 不让 WorkflowUsecase 写库存、出货、财务、应收、应付、发票、收付款事实。
- shipping_released != shipped。
- workflow task done != fact posted。
- business_records 是兼容层、demo、seed、source snapshot、调研入口，不是长期事实真源。

---

## 审查报告要求

本轮完成后必须生成：

.codex-review/latest.md

审查报告必须遵守：

docs/codex-goals/_review-output-protocol.md

用户必须能用下面命令复制：

    cat .codex-review/latest.md | pbcopy

不要要求用户截图。

---

## 最终回复格式

Codex 最终回复必须包含：

【完成】

【新增/修改文件】

【本轮改动范围】

【business_records 引用审计摘要】

【与 V1 正式模型重叠矩阵】

【cutover 分阶段计划】

【data map draft 摘要】

【明确没有做的内容】

【禁止路径检查】

【tenant_id 处理结论】

【Workflow / Fact 边界检查】

【测试层级选择】

【测试命令与结果】

【停止条件是否触发】

【Git 状态摘要】

【风险】

【下一轮 Codex Goal 建议】

【.codex-review/latest.md 复制命令】

    cat .codex-review/latest.md | pbcopy

## 完成后给 GPT 的复盘材料

.codex-review/latest.md 必须包含：

- git status --short
- git diff --stat
- git ls-files --others --exclude-standard
- business_records 引用清单摘要
- 重叠矩阵摘要
- cutover plan 摘要
- data map draft 摘要
- tenant_id grep 解释
- shipping_released grep 解释
- forbidden action grep 解释
- 禁止路径检查
- 测试层级选择
- 测试命令和结果
- 下一轮建议
```

### 091. user

_time `2026-05-31T13:04:49+08:00` · content_type `text` · node `ac5d1875-b7b7-4d59-a7c0-f79d5dfc8db1`_

目前是不是还没到重构或者重写前端菜单和页面的时候是吗

### 092. assistant

_time `2026-05-31T13:04:50+08:00` · content_type `text` · node `b8fce380-3e8f-46f6-8396-7bc352c38f23`_

对，**现在还没到“大重构 / 重写前端菜单和页面体系”的时候**。

更准确地说：

```text
现在已经可以做“局部新增 V1 正式页面”。
但还不适合做“全局重写菜单 / 全局重构页面 / 删除旧 business_records 入口”。
```

008 已经完成了第一步：新增了 V1 的 customers / suppliers / contacts / sales_orders / sales_order_items 前端页面和路由，但它刻意没有改 `docs registry`、没有改 `seedData`、没有做 `business_records` transition，也没有写出货 / 库存 / 财务事实。Codex 报告里也明确下一步建议是 `009-business-records-transition-audit`，先审计旧 `business_records` 兼容层引用和退出路径，而不是直接删旧入口或重写菜单。fileciteturn12file0

---

## 当前阶段该做什么

现在应该做：

```text
1. 保留旧 business_records 入口。
2. 保留新 V1 正式页面路由。
3. 做 business_records transition audit。
4. 梳理旧入口、旧菜单、seedData、businessModules、businessRecordDefinitions、旧页面和新 V1 页面之间的重叠关系。
5. 决定哪些旧入口 keep、read-only、demo-only、deprecate later、replace by V1。
```

也就是先做：

```text
审计 -> 过渡计划 -> 小范围菜单入口调整 -> 页面收口
```

不是：

```text
直接重写前端菜单
直接删除旧页面
直接把 business_records 改成 V1
直接 seedData 大改
直接全局替换路由
```

---

## 为什么现在不适合大重写菜单

因为现在有几个事实还没收口：

| 问题 | 现在状态 | 为什么不能大重写 |
|---|---|---|
| `business_records` 仍存在 | 兼容层 / demo / source snapshot | 还不知道哪些旧入口仍被测试、文档、seed、QA 依赖 |
| V1 页面刚接好 | customers / suppliers / contacts / sales_orders 页面已新增 | 还没经过真实业务试用和菜单切换验证 |
| seedData 未改 | 008 明确没改 seedData | 直接改菜单可能影响现有演示 / QA / 帮助入口 |
| docs registry 未改 | 008 明确没改 docs registry | 说明帮助中心 / 文档入口还未一起收口 |
| 真实数据迁移未做 | business_records transition 未做 | 旧数据和新模型还没有映射 / dry-run |
| 出货 / 库存 / 财务事实未做 | 仍 deferred | 菜单如果先“完整 ERP 化”，容易误导为主链路已闭环 |

所以现在大重写菜单，会制造信息差：

```text
菜单看起来像正式产品已经完整切换
但底层 business_records / seed / docs / V1 model / fact 层还没完全收口
```

这就是你前面一直担心的“文档和代码信息差”的前端版本。

---

## 现在的正确路线

建议下一步顺序是：

```text
009-business-records-transition-audit
  -> 审计旧 business_records 入口和 V1 正式模型的重叠关系

010-current-customer-data-import-draft 或 010-v1-menu-entry-review
  -> 一个做 current 数据导入草案
  -> 一个做 V1 菜单入口切换评审

011-v1-menu-entry-minimal
  -> 小范围把 V1 页面挂到菜单
  -> 不删旧页面
  -> 旧入口标 compatibility / demo / source snapshot

012-business-records-readonly-or-demo-mode
  -> 根据审计结果，把重叠旧入口降级为只读 / demo / deprecated candidate

后面再考虑：
  -> 重构菜单结构
  -> 清理旧页面
  -> 统一 V1 页面框架
```

---

## 什么情况下才适合重写前端菜单和页面

满足这些条件后再做：

```text
1. business_records 引用审计完成。
2. 哪些旧入口保留、只读、废弃、替换已经写清。
3. V1 页面有 API/RBAC 和测试支撑。
4. seedData / businessModules / businessRecordDefinitions 的职责清楚。
5. current 客户资料不会被误写成 Product Core。
6. 新旧页面没有双写。
7. 菜单改动有回归测试。
8. 旧入口删除或降级有回滚方案。
```

没有这些条件，就只适合：

```text
新增 V1 页面
增加独立路由
小范围入口验证
不动旧菜单主结构
```

---

## 我的建议

现在不要做“大前端重构”。

当前最小安全下一步就是你已经准备的：

```text
009-business-records-transition-audit
```

009 做完后，再决定是先做：

```text
010-current-customer-data-import-draft
```

还是：

```text
010-v1-menu-entry-review
```

如果你现在特别想让新页面更容易访问，也不要直接重写菜单。可以后续单独做一个很小的 Goal：

```text
V1 menu entry minimal
```

只做：

```text
给 V1 页面加入口
旧入口不删
旧 business_records 不迁移
不改 docs registry
不改 seedData 或只做极小受控改动
```

一句话：**现在是“新旧入口审计和过渡期”，不是“全局菜单重构期”。**

### 093. user

_time `2026-05-31T13:07:06+08:00` · content_type `text` · node `8418d01f-5710-4d04-a99f-b94825fd7c0b`_

罗列一下目前的进度，颗粒度尽量细一点

### 094. assistant

_time `2026-05-31T13:07:07+08:00` · content_type `text` · node `4a02e8bf-f145-4ce5-b4b0-2640297c04de`_

下面按**从产品定位 → 架构治理 → 后端 schema/migration → repo/usecase → API/RBAC → 前端 UI → 未完成项**的顺序，把当前进度细颗粒度列出来。

---

# 0. 总体进度一句话

目前项目已经从“架构/文档规划”推进到了 **V1 主数据 + 销售订单的前后端最小闭环雏形**：

```text
已完成：
产品化架构 / 状态边界 / V1 schema cutline
→ Ent schema
→ Ent generate + Atlas migration
→ customers / suppliers / contacts repo/usecase
→ sales_orders / sales_order_items repo/usecase
→ JSON-RPC API + RBAC
→ V1 前端页面和路由

未完成：
business_records 过渡审计
正式菜单/seedData 接入
真实数据导入
shipment / inventory reservation / finance facts
production / outsourcing facts
完整 E2E / 客户试点闭环
```

008 的 Codex 审查报告显示，V1 前端页面已经接入 customers / suppliers / contacts / sales_orders / sales_order_items，并且没有改 schema、migration、generated code、repo/usecase、后端 API/RBAC、docs registry、seedData，也没有写出货、库存、财务事实。fileciteturn13file0

---

# 1. 产品定位 / 产品化边界进度

## 1.1 已确定

项目定位已经明确：

```text
毛绒玩具行业 ERP 产品内核
```

不是一次性外包项目，而是：

```text
先服务 current 甲方上线
→ 沉淀为毛绒玩具行业 ERP 产品内核
→ 后续支持多个客户私有化部署
→ 未来再单独评审 SaaS 多租户
```

`current` 甲方定位已经明确：

```text
第一个真实客户
种子客户
第一个私有化客户实例
第一个客户配置包来源
```

`current` 不是：

```text
SaaS runtime tenant
数据库多租户
多租户 RBAC 隔离对象
Product Core 规则来源
```

这些边界已经写入上下文总结，并在后续 Goal 中持续作为禁止项使用。fileciteturn8file0

## 1.2 已确定的长期禁止项

当前阶段持续禁止：

```text
不新增 tenant_id
不实现 SaaS 多租户
不实现 license server
不实现套餐计费
不实现客户工单系统
不创建泛化 ChangeUsecase
不创建泛化 change_records
不把 current 客户资料写成 Product Core
不让 WorkflowUsecase 写库存、出货、财务、应收、应付、发票、收付款事实
不把 business_records 当长期事实真源
```

这些禁止项从 Phase 0 到 008 都被持续继承。003、004、005、006、007、008 的审查报告都明确没有新增 `tenant_id`，命中只来自文档禁止说明、future SaaS 评审说明或 imported notes。fileciteturn7file0turn9file0turn10file0turn11file0turn12file0

---

# 2. Workflow / Fact 边界进度

## 2.1 已确定核心口诀

```text
流程管协同，单据管阶段，事实管落账，结果靠计算，系统状态别混业务。
```

## 2.2 已确定关键边界

目前已经持续写入文档和每轮 Goal 的边界：

```text
Workflow task done != Fact posted
shipment_release done -> shipping_released
shipping_released != shipped
shipping_released 只能表示已放行 / 可发货 / 待出库
shipped 才是真实出货完成
inventory_txns posted 才是库存真的变了
quality task done != quality_inspection passed
sales_order 是 Source Document，不是 shipment fact
purchase_order 是采购承诺，不是 purchase_receipt 入库事实
business_records 不替代正式事实表
```

006 的审查报告显示，Sales Order usecase 没有使用 `shipping_released`，`sales_orders.lifecycle_status` 只允许 `draft / submitted / active / closed / canceled`，没有 `shipped` 或 `shipping_released`。fileciteturn11file0

008 的审查报告也显示，前端新增 Sales Order UI 只展示 `draft / submitted / active / closed / canceled`，不展示 `shipping_released` 或 `shipped`，不展示 shipment / inventory / finance facts。fileciteturn13file0

---

# 3. Codex 工作流治理进度

## 3.1 已建立工作流规则

目前已经形成固定协作方式：

```text
中文短 Goal
+ docs/codex-goals/<goal>.md
+ .codex-review/latest.md
```

规则：

```text
每个独立 Goal 建议新开 Codex 会话
同一 Goal 内补漏 / 修测试 / 补 review report 可以继续原会话
每轮 Codex 完成后生成 .codex-review/latest.md
用户复制 latest.md 给 GPT，不再截图
```

## 3.2 已有/使用中的模板

当前流程中已经使用或约定这些文件：

```text
docs/codex-goals/README.md
docs/codex-goals/_new-session-goal-template.md
docs/codex-goals/_goal-file-template.md
docs/codex-goals/_review-output-protocol.md
docs/codex-goals/_gpt-context-summary.md
```

不过最近几轮报告里多次记录：`docs/codex-goals/_gpt-context-summary.md` 在仓库中不存在，Codex 按要求记录缺失后继续，没有自行补模板。fileciteturn10file0turn11file0turn12file0

---

# 4. Phase 0：产品化架构 / 目录骨架进度

## 4.1 已完成内容

Phase 0 已完成 docs-only / 架构骨架：

```text
docs/product/* 初步文档
docs/architecture/status-workflow-fact-boundary.md
docs/customers/current/*
docs/reference/imported-notes/*
config/customers/current/README.md
config/industry-templates/plush/README.md
deployments/current/README.md
server/internal/core/* 空骨架
web/src/erp/modules/README.md
web/src/erp/mobile/roles/README.md
```

## 4.2 Phase 0 未做

Phase 0 未落：

```text
runtime
Ent schema
migration
repo/usecase
API
UI
```

这一点在 `_gpt-context-summary` 中有明确整理。fileciteturn8file0

---

# 5. Phase 1：主数据 / 订单 / BOM / 采购前置评审进度

## 5.1 已完成文档评审

Phase 1 已完成这些 docs-only 评审：

```text
docs/architecture/masterdata-order-source-document-review.md
docs/architecture/customer-supplier-masterdata-review.md
docs/architecture/product-sku-bom-boundary-review.md
docs/architecture/order-purchase-boundary-review.md
docs/product/domain-schema-draft-v1-v2.md
docs/product/migration-readiness-checklist.md
docs/product/phase1-implementation-plan.md
docs/product/phase1-risk-register.md
```

## 5.2 Phase 1 核心结论

已确定：

```text
customers / suppliers / contacts 属于 MasterData
sales_orders / sales_order_items 属于 Source Document / Business Commitment
business_records 保留为兼容层、demo、seed、source snapshot、调研入口
business_records 不能长期替代正式主数据、订单、库存、出货或财务事实
BOM 是工程资料 / 物料需求来源，不是采购、库存或财务事实
```

这些内容在上下文总结中已经形成阶段结论。fileciteturn8file0

---

# 6. Phase 2：Schema final review / V1 cutline 进度

## 6.1 已完成

Phase 2 已完成 schema final review 和 V1 implementation cutline。

## 6.2 V1 Go

已确认 V1 Go：

```text
customers
suppliers
contacts
sales_orders
sales_order_items
```

## 6.3 Draft Only

仍是 Draft Only：

```text
product_skus
customer_addresses
supplier_material_profiles
settlement_terms
order_revisions
BOM version extension
purchase_orders
purchase_order_items
purchase_demands
```

## 6.4 Deferred

已延期：

```text
stock_reservations
shipments
shipment_items
AR/AP/invoice/payment/reconciliation
production facts
outsourcing facts
```

这个 cutline 在 003 的审查报告和上下文总结里都被持续继承。fileciteturn7file0turn8file0

---

# 7. Goal 003：V1 Ent schema 进度

## 7.1 已完成内容

003 已完成：

```text
只新增 V1 cutline 允许的 5 个 Ent schema 文件
没有生成 Ent 代码
没有新增 Atlas migration
没有接 repo/usecase
没有接 API/RBAC
没有接 UI
没有改 docs registry
没有改 seedData
没有改 workflow.go / rbac.go
没有改 server runtime 业务逻辑
```

## 7.2 新增 schema 文件

```text
server/internal/data/model/schema/customer.go
server/internal/data/model/schema/supplier.go
server/internal/data/model/schema/contact.go
server/internal/data/model/schema/sales_order.go
server/internal/data/model/schema/sales_order_item.go
```

003 报告明确这 5 个 schema 是本轮唯一新增的实现产物。fileciteturn7file0

## 7.3 customers 决策

`customers` 分类：

```text
MasterData
```

用途：

```text
客户主数据
支撑销售订单
未来支撑出货、应收、发票、对账
```

字段风格：

```text
code unique
name
short_name optional
tax_no optional
is_active
note
created_at / updated_at
```

## 7.4 suppliers 决策

`suppliers` 分类：

```text
MasterData
```

用途：

```text
供应商主数据
未来支撑采购、委外、采购入库、采购退货、应付、对账
```

字段特征：

```text
code unique
name
short_name optional
tax_no optional
supplier_type nullable stable key
is_active
note
created_at / updated_at
```

`supplier_type` 限制：

```text
material
outsourcing
service
mixed
```

V1 未加入：

```text
银行账号
开票信息完整模型
账期
supplier_material_profiles
财务事实字段
```

## 7.5 contacts 决策

`contacts` 分类：

```text
MasterData
```

建模：

```text
owner_type + owner_id
```

DB 层约束：

```text
owner_type 枚举
owner_type 只允许 CUSTOMER / SUPPLIER
partial unique index 限制同一 owner 最多一个 primary contact
```

风险：

```text
DB 层无法建立跨 customers / suppliers 的强外键
owner_id 是否存在必须由后续 repo/usecase guard 校验
```

003 后该风险已在 005 通过 usecase guard 补上。fileciteturn10file0

## 7.6 sales_orders 决策

`sales_orders` 分类：

```text
Source Document / Business Commitment
```

用途：

```text
销售订单源单据
记录客户订单和业务承诺
不代表真实出货事实
不代表库存扣减
不代表应收或开票
```

003 关键边界：

```text
只落 lifecycle_status
不落 release / fulfillment / finance 状态
避免把 source document 状态误当 shipment 或 finance fact
```

## 7.7 sales_order_items 决策

`sales_order_items` 分类：

```text
Source Document Line / Business Commitment Line
```

用途：

```text
销售订单明细
记录订单承诺数量、产品快照、价格等信息
不是出货事实
不是库存事实
不是财务事实
```

003 明确没有新增：

```text
product_sku_id
shipped_quantity
shipment
inventory
AR/AP
invoice
payment 字段
```

---

# 8. Goal 004：Ent generate + Atlas migration 进度

## 8.1 已完成内容

004 已完成：

```text
基于 003 的 5 个 schema 执行 cd server && make data
生成 Ent generated code
生成 Atlas migration
未接 repo/usecase
未接 API/RBAC
未接 UI
未接 business_records transition
```

004 报告显示新增 migration：

```text
server/internal/data/model/migrate/20260530161152_migrate.sql
```

并且 migration 只包含 `contacts / suppliers / customers / sales_orders / sales_order_items`。fileciteturn9file0

## 8.2 004 生成内容

新增 Ent generated code，覆盖：

```text
contact
customer
supplier
salesorder
salesorderitem
```

并修改 Ent 公共生成文件，例如：

```text
server/internal/data/model/ent/client.go
server/internal/data/model/ent/ent.go
server/internal/data/model/ent/mutation.go
server/internal/data/model/ent/migrate/schema.go
server/internal/data/model/migrate/atlas.sum
```

## 8.3 004 检查结果

通过检查：

```text
generated code 不包含 tenant_id
migration 不包含 tenant_id
migration 不包含 product_skus / purchase_orders / shipments / stock_reservations / finance facts
contacts check + primary contact partial unique index 已生成
sales_order 仍是 Source Document
未引入 shipped_quantity
```

004 测试通过：

```text
make data 通过
make migrate_status 通过，状态 pending
go test ./internal/data/model/schema 通过
go test ./internal/biz ./internal/data 通过
```

目标库 migration 仍是 pending，没有 apply。fileciteturn9file0

## 8.4 004 风险

风险：

```text
目标库 migration 仍 pending
contacts owner 存在性仍需 usecase guard
Ent 生成器重写 mutation.go 等大文件，diff 较大但属正常生成
```

contacts owner guard 已在 005 处理。目标库 migration apply 仍未作为正式发布动作执行。fileciteturn9file0turn10file0

---

# 9. Goal 005：MasterData repo/usecase 进度

## 9.1 已完成内容

005 已完成：

```text
customers / suppliers / contacts 后端 MasterData repo/usecase
对应测试
contacts owner guard
primary contact 事务策略
```

新增文件：

```text
server/internal/biz/masterdata.go
server/internal/biz/masterdata_test.go
server/internal/data/masterdata_repo.go
server/internal/data/masterdata_repo_test.go
```

005 报告明确没有接 API/RBAC/UI、docs registry、seedData、sales order usecase 或 `business_records` transition。fileciteturn10file0

## 9.2 customers 动作

已支持：

```text
Create
Update
Get
List
SetActive
```

## 9.3 suppliers 动作

已支持：

```text
Create
Update
Get
List
SetActive
```

## 9.4 contacts 动作

已支持：

```text
Create
Update
Get
ListContactsByOwner
SetPrimaryContact
DisableContact
```

## 9.5 contacts guard

已实现：

```text
owner_type 必须是 CUSTOMER / SUPPLIER
owner_id 必须存在于对应 customers / suppliers
不能给不存在的 customer 创建 contact
不能给不存在的 supplier 创建 contact
同一 owner 最多一个 primary contact
```

primary contact 策略：

```text
设置新的 primary contact 时，事务内取消同 owner 其他 primary
```

005 报告明确这个策略被选择为方案 A。fileciteturn10file0

## 9.6 005 测试

已跑：

```text
go test ./internal/biz ./internal/data -run 'TestMasterData'
go test ./internal/biz ./internal/data
```

结果通过。fileciteturn10file0

## 9.7 005 后风险

仍有：

```text
目标库 migration 是否 apply 不在 005 范围
API/RBAC/UI 尚未实现
business_records partners 兼容层仍存在
```

API/RBAC 已在 007 处理，UI 已在 008 处理；business_records transition 仍未做。fileciteturn10file0turn12file0turn13file0

---

# 10. Goal 006：Sales Order repo/usecase 进度

## 10.1 已完成内容

006 已完成：

```text
sales_orders / sales_order_items 后端 repo/usecase
对应测试
生命周期状态机
customer/product/unit guard
```

新增文件：

```text
server/internal/biz/sales_order.go
server/internal/biz/sales_order_test.go
server/internal/data/sales_order_repo.go
server/internal/data/sales_order_repo_test.go
```

006 报告明确没有接 API/RBAC/UI、docs registry、seedData 或 `business_records` transition；也没有写 Workflow、shipment、inventory、stock reservation、finance、invoice 或 payment facts。fileciteturn11file0

## 10.2 sales_orders 支持动作

已支持：

```text
CreateSalesOrder
UpdateSalesOrder
GetSalesOrder
ListSalesOrders
SubmitSalesOrder
ActivateSalesOrder
CloseSalesOrder
CancelSalesOrder
```

## 10.3 sales_order_items 支持动作

已支持：

```text
AddSalesOrderItem
UpdateSalesOrderItem
RemoveSalesOrderItem
ListSalesOrderItems
```

其中：

```text
RemoveSalesOrderItem = line_status canceled
不是物理删除
```

## 10.4 Sales Order lifecycle

已实现 canonical lifecycle：

```text
draft -> submitted -> active -> closed
draft / submitted / active -> canceled
```

禁止：

```text
draft -> active
closed / canceled -> any next state
any -> shipped
```

006 报告明确 `IsValidSalesOrderStatus("shipped") == false`，测试覆盖。fileciteturn11file0

## 10.5 Sales Order Item status

已实现：

```text
open
closed
canceled
```

## 10.6 Guard

已实现：

```text
创建 / 更新订单：customer_id 必须存在且 active
新增 / 更新订单行：sales_order_id 必须存在且订单未 closed/canceled
新增 / 更新订单行：product_id 必须存在且 active
新增 / 更新订单行：unit_id 必须存在且 active
ordered_quantity > 0
unit_price / amount 如提供则不得为负
```

## 10.7 006 边界

006 明确没有：

```text
shipped_quantity
shipment_id
inventory_txn_id
invoice_id
payment_id
ar_id
ap_id
product_sku_id
```

新增 runtime 文件 forbidden grep 无命中。fileciteturn11file0

## 10.8 006 测试

已跑：

```text
go test ./internal/biz ./internal/data
go test -count=1 ./internal/biz ./internal/data
```

结果通过。fileciteturn11file0

---

# 11. Goal 007：API / RBAC 进度

## 11.1 已完成内容

007 已完成：

```text
customers / suppliers / contacts JSON-RPC API
sales_orders / sales_order_items JSON-RPC API
customer.* / supplier.* / contact.* / sales_order.* / sales_order_item.* RBAC 动作权限
API/RBAC 测试
```

新增文件：

```text
server/internal/data/jsonrpc_masterdata_order.go
server/internal/data/jsonrpc_masterdata_order_test.go
```

修改文件：

```text
server/internal/data/jsonrpc.go
server/internal/biz/rbac.go
docs/current-source-of-truth.md
docs/product/v1-next-codex-goals.md
docs/product/v1-schema-go-no-go.md
progress.md
```

007 报告显示 API 写入全部走 `MasterDataUsecase` / `SalesOrderUsecase`，不绕过 contacts owner guard、主联系人策略、sales order lifecycle guard、customer/product/unit active guard。fileciteturn12file0

## 11.2 新增 API 分组

新增 JSON-RPC url：

```text
masterdata
sales_order
```

## 11.3 MasterData API

支持：

```text
create_customer / createCustomer
update_customer / updateCustomer
get_customer / getCustomer
list_customers / listCustomers
set_customer_active / setCustomerActive

create_supplier / createSupplier
update_supplier / updateSupplier
get_supplier / getSupplier
list_suppliers / listSuppliers
set_supplier_active / setSupplierActive

create_contact / createContact
update_contact / updateContact
get_contact / getContact
list_contacts_by_owner / listContactsByOwner
set_primary_contact / setPrimaryContact
disable_contact / disableContact
```

## 11.4 Sales Order API

支持：

```text
create_sales_order / createSalesOrder
update_sales_order / updateSalesOrder
get_sales_order / getSalesOrder
list_sales_orders / listSalesOrders
submit_sales_order / submitSalesOrder
activate_sales_order / activateSalesOrder
close_sales_order / closeSalesOrder
cancel_sales_order / cancelSalesOrder

add_sales_order_item / addSalesOrderItem
update_sales_order_item / updateSalesOrderItem
remove_sales_order_item / removeSalesOrderItem
list_sales_order_items / listSalesOrderItems
```

## 11.5 RBAC 权限

新增或补齐：

```text
customer.*
supplier.*
contact.*
sales_order.*
sales_order_item.*
```

报告提到权限码遵循现有 `resource.action` 风格，用 `read` 替代 goal 示例中的 `view`。fileciteturn12file0

## 11.6 权限测试覆盖

007 覆盖：

```text
未登录
非管理员
disabled admin
无权限
有权限
contacts owner guard
sales order item product/unit guard
禁止 shipment verb 暴露
```

007 测试通过：

```text
go test ./internal/data -run 'TestJsonrpcData_(MasterData|ContactAPI|SalesOrder|RBAC)'
go test ./internal/biz -run 'TestBuiltinRoleWorkflowPermissionMatrix|TestAdminHasPermissionSuperAdminHasAllPermissions'
go test ./internal/biz ./internal/data ./internal/service ./internal/server
go test ./internal/biz ./internal/data
```

均通过。fileciteturn12file0

## 11.7 007 边界

007 没有：

```text
UI
移动端页面
docs registry
seedData
business_records transition
shipments
stock_reservations
inventory_txns
AR/AP
invoice
payment
```

也没有改：

```text
workflow.go
schema
migration
generated code
```

---

# 12. Goal 008：前端页面进度

## 12.1 已完成内容

008 已完成：

```text
V1 MasterData / Sales Order 前端 API client
customers 页面
suppliers 页面
contacts 区块
sales_orders 页面
sales_order_items 区块
路由
前端 helper
前端 contract tests
mocked RPC route render
```

新增文件：

```text
web/src/erp/api/masterDataOrderApi.mjs
web/src/erp/api/masterDataOrderApi.test.mjs
web/src/erp/pages/V1MasterDataPage.jsx
web/src/erp/pages/V1SalesOrdersPage.jsx
web/src/erp/utils/masterDataOrderView.mjs
web/src/erp/utils/masterDataOrderView.test.mjs
```

修改文件：

```text
web/package.json
web/src/erp/router.jsx
docs/current-source-of-truth.md
docs/product/v1-next-codex-goals.md
docs/product/v1-schema-go-no-go.md
progress.md
```

008 报告明确没有改后端 API/RBAC、schema、migration、generated code、repo/usecase、docs registry、seedData，也没有做 business_records transition。fileciteturn13file0

## 12.2 新增路由

新增：

```text
/erp/master/partners/customers
/erp/master/partners/suppliers
/erp/sales/project-orders/sales-orders
```

## 12.3 customers 页面

支持：

```text
列表
创建
编辑
查看
启停
```

## 12.4 suppliers 页面

支持：

```text
列表
创建
编辑
查看
启停
```

## 12.5 contacts 区块

在客户/供应商详情 Drawer 内提供联系人区块，支持：

```text
按 owner 查看
创建
编辑
设置主联系人
禁用
```

## 12.6 sales_orders 页面

支持：

```text
列表
创建
编辑
查看
提交
激活
关闭
取消
```

## 12.7 sales_order_items 区块

支持：

```text
列表
新增
编辑
移除/取消
```

## 12.8 008 边界

008 明确：

```text
UI 调用 007 JSON-RPC API
不绕过 API
不直接写 Ent
不把 local fake state 当真源
不复制 sales order lifecycle 业务规则
不把 shipping_released 显示成已出库
不显示 sales_order 为 shipped
不展示或编辑 shipped_quantity
不展示 shipment / inventory / finance facts
不把 current 客户样本字段写成固定产品字段
```

## 12.9 008 测试

已跑：

```text
pnpm lint
pnpm css
pnpm test
pnpm style:l1
go test ./internal/biz ./internal/data
Playwright mocked RPC route render
git diff --check
```

结果：

```text
pnpm test 279 pass
style:l1 45 场景通过
后端 go test 通过
mocked RPC route render 通过 customers/suppliers/sales_orders 默认态
```

008 报告提到真实后端 + 真实数据库 E2E 未跑，这是后续风险。fileciteturn13file0

## 12.10 008 风险

仍有：

```text
V1 页面未接正式菜单入口
sales_order_items 产品 / 单位暂用 ID 输入
未跑真实后端数据库 E2E
business_records transition 未做
```

008 里曾尝试给兼容 business_records 页面头部加跳转按钮，但会影响既有 L1 布局预算，已撤回，最终只保留正式 V1 路由页面。fileciteturn13file0

---

# 13. 当前 business_records 状态

## 13.1 当前定位

仍然是：

```text
兼容层
demo
seed
source snapshot
调研入口
```

不是：

```text
正式 customers / suppliers 真源
正式 sales_orders 真源
库存事实
出货事实
财务事实
```

## 13.2 当前未做

还未做：

```text
business_records transition audit
business_records 引用清单
business_records 与 V1 模型重叠矩阵
business_records data map draft
business_records cutover plan
旧入口 read-only/demo/deprecated 方案
真实数据迁移
删除旧入口
```

## 13.3 下一步优先级

008 报告建议下一轮优先做：

```text
009-business-records-transition-audit
```

理由是：V1 正式 UI 已经存在，但旧 `business_records` 兼容入口仍保留，必须先审计引用和退出路径，避免双真源 / 双写 / 菜单误导。fileciteturn13file0

---

# 14. 当前还未完成的业务模块

## 14.1 主数据仍未完全完成

已完成：

```text
customers
suppliers
contacts
```

未完成 / deferred：

```text
customer_addresses
supplier_material_profiles
settlement_terms
product_skus
```

## 14.2 销售订单已完成最小 Source Document

已完成：

```text
sales_orders schema
sales_order_items schema
Ent generate
migration
repo/usecase
API/RBAC
前端页面
```

但销售订单仍不是完整订单到出货闭环。

未完成：

```text
shipment
stock reservation
actual outbound
inventory deduction
AR/AP
invoice
payment
reconciliation
```

## 14.3 出货事实未做

仍 deferred：

```text
shipments
shipment_items
stock_reservations
shipment outbound
inventory outbound
```

## 14.4 财务事实未做

仍 deferred：

```text
AR
AP
invoice
payment
reconciliation
settlement
```

## 14.5 生产 / 委外事实未做

仍 deferred：

```text
production_orders
production_material_issues
finished_goods_receipts
outsourcing facts
```

---

# 15. 当前测试与验证状态

## 15.1 后端测试

已覆盖：

```text
MasterData repo/usecase
contacts owner guard
primary contact 策略
Sales Order repo/usecase
Sales Order lifecycle guard
customer/product/unit active guard
JSON-RPC API/RBAC 核心路径
```

## 15.2 前端测试

已覆盖：

```text
API client contract tests
helper tests
前端路由 mocked RPC render
pnpm lint
pnpm css
pnpm test
pnpm style:l1
```

## 15.3 未覆盖

仍未做：

```text
真实后端 + 真实数据库 E2E
真实客户数据导入 dry-run
business_records 迁移 dry-run
完整订单到出货链路 E2E
shipment/inventory/finance facts 相关测试
```

---

# 16. 当前 Git / 工作区注意点

近几轮有一个现象：部分 Goal 被另一个 Codex 会话顺手提交过，比如 004 报告里曾显示 HEAD 已经是 `e13208f`，005 报告里 `git log` 显示 `94da857 feat(masterdata): 实现客户供应商联系人用例`。这本身不是业务问题，但流程上要继续坚持：

```text
Codex 默认不 git add
Codex 默认不 commit
Codex 默认不 push
除非用户明确允许
```

006 / 007 / 008 报告都显示未执行 git add、commit、push、stash、回退。fileciteturn11file0turn12file0turn13file0

---

# 17. 目前最建议的下一步

## 17.1 推荐下一步

```text
009-business-records-transition-audit
```

原因：

```text
V1 schema/repo/usecase/API/UI 已经出现
旧 business_records 仍存在
如果不审计就继续加功能，容易形成双真源、双写、旧入口误导
```

## 17.2 009 应该只做

```text
引用审计
重叠矩阵
cutover plan
data map draft
risk register
```

## 17.3 009 不应该做

```text
删除 business_records
修改 business_records schema
修改 business_records runtime
修改 V1 页面
修改 seedData
修改 docs registry
执行数据迁移
写 import/backfill 代码
做双写
```

---

# 18. 目前进度总表

| 层级 | 当前状态 | 说明 |
|---|---|---|
| 产品定位 | 已确定 | 毛绒玩具行业 ERP 产品内核 |
| current 客户定位 | 已确定 | 种子客户 / 私有化客户实例，不是 runtime tenant |
| Workflow / Fact 边界 | 已确定 | `shipping_released != shipped`，Workflow 不写事实 |
| Codex 工作流 | 已建立 | 中文短 Goal + md + latest review |
| Phase 0 架构骨架 | 已完成 | docs / 目录 / current 边界 |
| Phase 1 评审 | 已完成 | 主数据 / 订单 / BOM / 采购前置 |
| Phase 2 cutline | 已完成 | V1 Go / Draft Only / Deferred |
| 003 Ent schema | 已完成 | 5 个 V1 schema |
| 004 Ent generate + migration | 已完成 | generated code + migration |
| 005 MasterData repo/usecase | 已完成 | customers / suppliers / contacts |
| 006 SalesOrder repo/usecase | 已完成 | sales_orders / items |
| 007 API/RBAC | 已完成 | JSON-RPC + 权限 |
| 008 Frontend pages | 已完成 | V1 页面 + 路由 |
| business_records transition | 未完成 | 下一步 009 |
| 数据导入 | 未完成 | 010 候选 |
| 正式菜单/seedData 接入 | 未完成 | 009 后再做 |
| shipment facts | 未完成 | 后续独立阶段 |
| inventory reservation/outbound | 未完成 | 后续独立阶段 |
| finance facts | 未完成 | 后续独立阶段 |
| production / outsourcing facts | 未完成 | 后续独立阶段 |

---

# 19. 简短结论

目前项目已经完成了：

```text
V1 customers / suppliers / contacts / sales_orders / sales_order_items
从 schema -> migration -> repo/usecase -> API/RBAC -> 前端页面
```

但还没有完成：

```text
旧 business_records 退出
真实数据导入
正式菜单切换
出货 / 库存 / 财务 / 生产 / 委外事实层
真实 E2E
```

所以现在不是继续大改菜单或加出货财务，而是应该先做：

```text
009-business-records-transition-audit
```

把旧兼容层和新 V1 正式模型的边界收口。

### 095. user

_time `2026-05-31T13:12:12+08:00` · content_type `text` · node `465d4303-19af-4e12-8618-79718e60e591`_

给出一个完整的md

### 096. assistant

_time `2026-05-31T13:12:16+08:00` · content_type `text` · node `77dac457-7494-4315-90b3-d2bcf0491f73`_

下面是完整可复制版，保存为：

`docs/codex-goals/009-business-records-transition-audit.md`

```md
# Codex Goal 009: business_records Transition Audit

## 任务名称

009：business_records 兼容层过渡审计与退出方案

---

## 任务性质

本轮属于：

Audit / Docs-only

本轮只允许做审计、文档和计划。

本轮不改 runtime。  
本轮不改 Ent schema。  
本轮不新增 migration。  
本轮不改 generated code。  
本轮不改 repo/usecase。  
本轮不改 API/RBAC。  
本轮不改 UI。  
本轮不改 docs registry。  
本轮不改 seedData。  
本轮不迁移数据。  
本轮不删除 business_records。  

必须明确：

- 本轮是否改 runtime：否
- 本轮是否改 Ent schema：否
- 本轮是否新增 migration：否
- 本轮是否改 API：否
- 本轮是否改 RBAC：否
- 本轮是否改 UI：否
- 本轮是否改 docs registry：否
- 本轮是否改 seedData：否
- 本轮是否改 repo/usecase：否
- 本轮是否做真实数据迁移：否

---

## 背景

003 已新增 V1 Ent schema：

- customers
- suppliers
- contacts
- sales_orders
- sales_order_items

004 已完成：

- Ent generated code
- Atlas migration

005 已完成：

- customers / suppliers / contacts repo/usecase
- contacts owner_type + owner_id guard
- contacts primary contact 策略

006 已完成：

- sales_orders / sales_order_items repo/usecase
- sales order lifecycle: draft / submitted / active / closed / canceled
- sales order item status: open / closed / canceled
- customer / product / unit guard

007 已完成：

- customers / suppliers / contacts JSON-RPC API
- sales_orders / sales_order_items JSON-RPC API
- V1 API/RBAC 权限码和测试

008 已完成：

- V1 customers / suppliers / contacts 前端页面
- V1 sales_orders / sales_order_items 前端页面
- V1 前端 API client
- V1 路由
- 前端测试、mocked route render、style:l1

但旧的 business_records 兼容层仍然存在。

business_records 当前定位：

- 兼容层
- demo
- seed
- source snapshot
- 调研入口
- 旧页面 / 旧样本承载层

business_records 不是：

- 长期事实真源
- 正式 customers / suppliers 真源
- 正式 sales_orders 真源
- 库存事实
- 出货事实
- 财务事实

009 的目标：

审计 business_records 现在被哪些页面、配置、seed、docs、测试、helper、API 使用，判断它与 V1 正式模型的重叠点，输出过渡计划。

009 不处理：

- 删除 business_records
- 修改 business_records schema
- 修改 business_records repo/usecase
- 修改 business_records API
- 修改前端页面
- 修改 seedData
- 修改 docs registry
- 执行数据迁移
- 写 import/backfill 代码
- 写双写逻辑

---

## 必须先读

### 项目规则

- AGENTS.md
- README.md
- docs/current-source-of-truth.md
- progress.md

### GPT / Codex 上下文

- docs/codex-goals/_gpt-context-summary.md
- docs/codex-goals/README.md
- docs/codex-goals/_new-session-goal-template.md
- docs/codex-goals/_goal-file-template.md
- docs/codex-goals/_review-output-protocol.md

如果某些模板文件不存在，请记录缺失，不要自行大范围补模板。

### 003 / 004 / 005 / 006 / 007 / 008 Goal 与审查结果

- docs/codex-goals/003-v1-ent-schema-customers-suppliers-orders.md
- docs/codex-goals/004-v1-migration-and-ent-generate.md
- docs/codex-goals/005-v1-repo-usecase-masterdata.md
- docs/codex-goals/006-v1-repo-usecase-sales-order.md
- docs/codex-goals/007-v1-api-rbac-masterdata-order.md
- docs/codex-goals/008-v1-frontend-masterdata-order-pages.md
- .codex-review/latest.md

如果 .codex-review/latest.md 不存在，请继续，但必须从 003/004/005/006/007/008 goal 和当前 git 状态中恢复上下文，并在最终报告中说明缺失。

### Phase 0 / 1 / 2 文档

- docs/product/zero-to-one-architecture.md
- docs/product/product-principles.md
- docs/product/domain-model-v1.md
- docs/product/module-boundaries.md
- docs/product/config-permission-policy.md
- docs/product/customer-instance-policy.md
- docs/product/customer-delta-policy.md
- docs/product/rewrite-roadmap.md
- docs/product/release-gates.md
- docs/product/test-strategy.md
- docs/architecture/status-workflow-fact-boundary.md

- docs/architecture/masterdata-order-source-document-review.md
- docs/architecture/customer-supplier-masterdata-review.md
- docs/architecture/product-sku-bom-boundary-review.md
- docs/architecture/order-purchase-boundary-review.md
- docs/product/domain-schema-draft-v1-v2.md
- docs/product/migration-readiness-checklist.md
- docs/product/phase1-implementation-plan.md
- docs/product/phase1-risk-register.md

- docs/product/schema-design-final-review.md
- docs/product/v1-entity-decision-record.md
- docs/product/v1-implementation-cutline.md
- docs/product/v1-schema-go-no-go.md
- docs/product/business-records-transition-plan.md
- docs/product/v1-next-codex-goals.md

### business_records 相关代码与配置

Codex 必须先搜索真实仓库，不要猜路径。

至少搜索：

- business_records
- businessRecords
- BusinessRecord
- partners
- project-orders
- sales-orders
- products
- customer
- supplier

建议命令：

    grep -R "business_records\|businessRecords\|BusinessRecord" server web docs -n || true
    grep -R "partners\|project-orders\|sales-orders" web/src/erp docs -n || true

如本地有 rg，可用 rg。

必须重点检查：

- server/internal/data/model/schema/business_record.go
- server/internal/data/model/ent/businessrecord*
- server/internal/data/business_record*
- server/internal/biz/business*
- server/internal/data/jsonrpc*
- web/src/erp/config/businessModules.mjs
- web/src/erp/config/businessRecordDefinitions.mjs
- web/src/erp/config/seedData.mjs
- web/src/erp/router.jsx
- web/src/erp/pages/*
- web/src/erp/api/*
- web/src/erp/utils/*
- web/src/erp/docs/*
- docs/current-source-of-truth.md
- docs/product/*
- docs/architecture/*

如果某些文件不存在，请记录缺失，不要猜。

---

## 当前真源与非真源

### 当前真源

本轮必须以这些为准：

- AGENTS.md
- docs/current-source-of-truth.md
- docs/product/business-records-transition-plan.md
- docs/product/v1-implementation-cutline.md
- docs/product/v1-schema-go-no-go.md
- docs/product/v1-next-codex-goals.md
- server/internal/data/model/schema/business_record.go
- 现有 business_records 相关代码
- 现有 business_records 相关前端配置
- 003 到 008 已完成的 V1 正式模型 / API / UI 文件

### 只能作为线索

- docs/customers/current/*
- web/src/erp/config/seedData.mjs
- 截图
- Excel 样本
- PDF 样本
- 历史 Codex 输出
- docs/reference/imported-notes/*

### 禁止作为当前实现真源

- 历史聊天记忆
- 未经确认的截图 / 口头描述
- 未落地 architecture review
- 未实现 schema draft
- current 客户样本字段
- demo / seed 数据

必须保持：

- 代码 / schema / migration / tests 是实现真源。
- current-source-of-truth 是当前状态入口。
- schema draft 不是 implemented。
- architecture review 不是 runtime。
- customer material 不是 Product Core。
- business_records 是兼容层，不是正式事实真源。

---

## 允许修改的文件

本轮允许新增：

- docs/product/business-records-reference-audit.md
- docs/product/business-records-transition-audit.md
- docs/product/business-records-cutover-plan.md
- docs/product/business-records-data-map-draft.md
- docs/product/business-records-risk-register.md

允许小幅更新：

- docs/current-source-of-truth.md
- docs/product/business-records-transition-plan.md
- docs/product/v1-next-codex-goals.md
- docs/product/v1-schema-go-no-go.md
- progress.md

允许生成或覆盖：

- .codex-review/latest.md

---

## 禁止修改的文件

本轮禁止修改：

- server/internal/biz/*
- server/internal/data/*
- server/internal/data/model/schema/*
- server/internal/data/model/migrate/*
- server/internal/data/model/ent/*
- server/internal/core/*
- web/src/erp/config/docs.mjs
- web/src/erp/config/seedData.mjs
- web/src/erp/router.jsx
- web/src/erp/pages/*
- web/src/erp/api/*
- web/src/erp/utils/*
- web/src/erp/mobile/*
- server/deploy
- scripts
- docs/codex-goals/_new-session-goal-template.md
- docs/codex-goals/_goal-file-template.md
- docs/codex-goals/_review-output-protocol.md

特别说明：

- 本轮不得改 business_records 代码。
- 本轮不得改 business_records schema。
- 本轮不得改 V1 页面。
- 本轮不得改 seedData。
- 本轮不得改 docs registry。
- 本轮不得做任何实际迁移。
- 本轮不得做双写。
- 本轮不得删除旧入口。

如果 Codex 发现必须修改禁止路径，必须停止并报告，不得自行修改。

---

## 改动范围分级

本轮范围级别：

Audit / Docs-only

不得扩大到：

- runtime
- schema
- migration
- generated code
- repo/usecase
- API/RBAC
- UI
- seedData
- docs registry
- data migration
- import/backfill

禁止把下面内容放进同一轮：

- audit + 删除 business_records
- audit + seedData 改造
- audit + UI 入口切换
- audit + API 双写
- audit + 数据迁移
- audit + import/backfill

发现范围不足时，停止并报告。

---

## 成功标准

本轮完成必须满足：

- 输出 business_records 引用审计清单。
- 输出 business_records 与 V1 正式模型的重叠矩阵。
- 输出 business_records 可以继续保留的范围。
- 输出 business_records 不应继续承载的范围。
- 输出 business_records 切换 / 降级 / 只读 / deprecated 的分阶段计划。
- 输出 business_records 数据映射草案，但不迁移数据。
- 输出 current 客户样本和 demo/seed 的处理建议。
- 输出 business_records 相关风险登记。
- 明确哪些内容可以进入后续 import draft。
- 明确哪些内容必须等待人工确认。
- 明确哪些内容不能自动迁移。
- 不删除 business_records。
- 不改 business_records runtime。
- 不改 V1 页面。
- 不改 seedData。
- 不改 docs registry。
- 不新增 tenant_id。
- 不新增 schema/migration。
- 不新增 ChangeUsecase/change_records。
- 不写 shipment/inventory/finance facts。
- .codex-review/latest.md 已生成。

不能只写“已完成审计”。

---

## 停止条件

出现以下情况必须停止并报告：

- 任务文件与 AGENTS.md 或当前代码真源冲突。
- 需要修改禁止路径。
- 需要删除 business_records。
- 需要修改 business_records schema。
- 需要修改 business_records runtime。
- 需要改 seedData 或 docs registry。
- 需要改 V1 页面。
- 需要做数据迁移。
- 需要写 import/backfill 代码。
- 需要新增 tenant_id。
- 需要实现 SaaS 多租户。
- 需要新增 schema/migration。
- 需要写 shipment/inventory/finance facts。
- 无法区分 demo/seed/source snapshot 与正式事实。
- 无法确认引用来源。
- 需要删除、回退、整理或 stash 非本轮改动。

停止时必须输出：

停止原因：
涉及文件：
风险：
建议下一步：

---

## Git 策略

默认规则：

- 本轮默认不提交、不推送。
- 不允许执行 git add .
- 不允许自动 commit。
- 不允许自动 push。
- 不允许回退、整理或 stash 非本轮改动。
- 如需 stage，必须按路径精确 stage，并且用户明确要求。

必须先运行并记录：

    git status --short
    git branch --show-current
    git log --oneline -3

如果发现当前仓库已经有自动 commit 或 origin/main 同步，必须在 review 中说明，不要继续 commit/push。

必须区分：

- tracked diff
- untracked files
- 本轮新增文件
- 历史未跟踪文件

如果存在历史 untracked 文件，不要删除，报告即可。

---

## 审计内容要求

### 1. business-records-reference-audit.md

路径：

- docs/product/business-records-reference-audit.md

必须包含：

- business_records 后端 schema 引用。
- business_records 后端 repo/usecase/API 引用。
- business_records 前端页面引用。
- business_records 前端 config 引用。
- business_records seed/demo 引用。
- business_records docs 引用。
- business_records tests 引用。
- business_records 与 partners / project-orders / products / orders 相关的入口。
- 每个引用的作用：
  - runtime
  - UI
  - seed/demo
  - docs/help
  - test
  - compatibility
  - source snapshot
- 每个引用是否与 V1 正式模型重叠。
- 每个引用建议：
  - keep
  - keep as demo
  - make read-only
  - deprecate later
  - replace by V1
  - needs manual review

必须用表格。

### 2. business-records-transition-audit.md

路径：

- docs/product/business-records-transition-audit.md

必须回答：

- business_records 当前是什么。
- business_records 现在不能是什么。
- V1 customers / suppliers / contacts 出现后，partners 类入口如何处理。
- V1 sales_orders 出现后，orders / project-orders 类入口如何处理。
- products 类 business_records 与现有 products schema 如何避免重复。
- business_records 如何继续作为兼容层。
- business_records 如何避免双写真源。
- business_records 何时进入只读。
- business_records 何时可以标记 deprecated。
- business_records 是否能删除，删除前需要哪些条件。
- 哪些内容必须人工确认。

必须明确：

business_records 是兼容层、demo、seed、source snapshot、调研入口，不是长期事实真源。

### 3. business-records-cutover-plan.md

路径：

- docs/product/business-records-cutover-plan.md

必须输出分阶段计划：

Stage 0: 当前状态

- business_records 继续存在。
- V1 正式模型已具备 schema / migration / repo/usecase / API/RBAC / UI。
- business_records 仍可能承载旧入口、demo、source snapshot、seed。

Stage 1: 并行可见但禁止双写

- 新 V1 页面作为正式入口。
- business_records 相关重叠入口不得继续新增核心功能。
- 不做自动迁移。
- 不删除旧数据。

Stage 2: 只读 / demo 化

- 重叠领域的 business_records 页面转为只读或 demo。
- seed/demo 明确标记。
- 用户操作引导到 V1 页面。

Stage 3: 数据映射 / dry-run

- 只做 dry-run mapping。
- 输出可迁移、不可迁移、需人工确认清单。
- 不写正式数据。

Stage 4: 受控迁移

- 只有人工确认后才允许执行。
- 必须有备份、回滚、校验。
- 必须禁止双写。

Stage 5: deprecated / archive

- 只在引用清零、数据完成迁移、客户确认后执行。
- 不建议当前阶段做。

### 4. business-records-data-map-draft.md

路径：

- docs/product/business-records-data-map-draft.md

必须输出映射草案：

- business_records partners -> customers / suppliers / contacts
- business_records project-orders / orders -> sales_orders / sales_order_items
- business_records products -> existing products / future product_skus draft-only
- business_records materials -> existing materials
- business_records warehouses -> existing warehouses

每类必须写：

- source fields
- target model
- target fields
- can auto map?
- needs manual review?
- forbidden auto map?
- notes

必须明确：

- current 客户样本字段不能自动变成 Product Core 必填字段。
- product_skus 仍 draft-only，不得自动映射。
- purchase_orders / shipments / finance facts 仍 deferred，不得自动映射。
- 没有事实依据不得生成 shipment / inventory / finance facts。

### 5. business-records-risk-register.md

路径：

- docs/product/business-records-risk-register.md

必须列风险：

- 双真源风险。
- 双写风险。
- demo 数据误当正式数据。
- current 客户字段污染 Product Core。
- business_records orders 误当 sales_orders。
- business_records products 与 products schema 重复。
- partners 同时对应 customers / suppliers。
- 旧页面继续新增功能导致 V1 失焦。
- 自动迁移误写正式数据。
- 删除 business_records 破坏历史文档 / demo / QA。
- seedData / docs registry 修改引发前端回归。
- 迁移后无法回滚。
- 用户误认为 business_records 是正式入口。

每项写：

- risk
- impact
- evidence
- mitigation
- owner layer
- next review needed

---

## Workflow / Fact 边界

本轮不得接 Workflow。

必须保持：

- Workflow task done != Fact posted。
- shipping_released != shipped。
- shipment_release done -> shipping_released。
- sales_order 是 Source Document。
- shipment 才是未来出货事实。
- inventory_txns 才是库存落账事实。

不得新增让 workflow 写这些对象的逻辑。

---

## Sales Order / Shipment 边界

business_records audit 不得建议：

- markAsShipped
- shipSalesOrder
- reserveStock
- deductInventory
- generateInvoice
- generateReceivable
- receivePayment

不得建议从 business_records 自动生成：

- shipments
- stock_reservations
- inventory_txns
- AR/AP
- invoice
- payment

---

## tenant_id 规则

本轮禁止新增 tenant_id。

如果 grep 命中 tenant_id，必须解释是否只来自：

- imported notes
- 禁止说明
- future SaaS 评审候选说明
- current 不是 runtime tenant 说明

不得进入：

- schema
- runtime
- migration
- transition plan
- data mapping target

---

## 测试分层选择

本轮必须选择测试层级。

### 静态检查

选择：是。

原因：

本轮改文档，需要检查 diff、格式、边界词和禁止项。

命令：

    git status --short
    git diff --stat
    git diff --check
    git ls-files --others --exclude-standard

### 单元测试

选择：否。

原因：

本轮 docs-only，不改代码。

### 集成测试

选择：否。

原因：

本轮 docs-only，不改 API/repo/usecase/DB。

### 冒烟测试

选择：否。

原因：

本轮不改运行入口或前端页面。

### 回归测试

选择：有限选择。

原因：

如果只改 docs/product，不需要跑前后端全量；如果误改 web/docs registry，则必须停止。

### E2E 测试

选择：否

### 097. user

_time `2026-05-31T13:13:19+08:00` · content_type `text` · node `44b5b37c-a4a3-414a-ac67-4e0b2bf7d417`_

是这个给出一个完整md

### 098. assistant

_time `2026-05-31T13:13:20+08:00` · content_type `text` · node `49ab5346-81c1-4c0f-8451-df7c64da1634`_

下面是你要的“当前进度细颗粒度总结”完整 Markdown。建议保存为：

`docs/codex-goals/_gpt-context-summary.md`

这版已更新到 **008 已完成，下一步建议 009 business_records transition audit**。依据是你最新上传的 008 审查报告：V1 前端页面、API client、路由和测试已完成；未改 schema/migration/generated code/repo/usecase/API/RBAC/docs registry/seedData，也未做 business_records transition 或 shipment / inventory / finance facts。fileciteturn13file0

```md
# plush-toy-erp 当前进度细颗粒度总结

## 0. 总体进度一句话

目前项目已经从“架构 / 文档规划”推进到了 **V1 主数据 + 销售订单的前后端最小闭环雏形**。

当前已经完成：

```text
产品化架构 / 状态边界 / V1 schema cutline
-> Ent schema
-> Ent generate + Atlas migration
-> customers / suppliers / contacts repo/usecase
-> sales_orders / sales_order_items repo/usecase
-> JSON-RPC API + RBAC
-> V1 前端页面和路由
```

当前尚未完成：

```text
business_records 过渡审计
正式菜单 / seedData 接入
真实数据导入
shipment / inventory reservation / finance facts
production / outsourcing facts
完整 E2E / 客户试点闭环
```

---

## 1. 产品定位 / 产品化边界进度

### 1.1 项目定位已确定

`plush-toy-erp` 定位为：

```text
毛绒玩具行业 ERP 产品内核
```

不是一次性外包系统，而是：

```text
先服务 current 甲方上线
-> 沉淀为毛绒玩具行业 ERP 产品内核
-> 后续支持多个客户私有化部署
-> 未来再单独评审 SaaS 多租户
```

### 1.2 current 甲方定位已确定

`current` 甲方是：

```text
第一个真实客户
种子客户
第一个私有化客户实例
第一个客户配置包来源
```

`current` 甲方不是：

```text
SaaS runtime tenant
数据库多租户
多租户 RBAC 隔离对象
Product Core 规则来源
```

### 1.3 长期禁止项已确定

当前阶段持续禁止：

```text
不新增 tenant_id
不实现 SaaS 多租户
不实现 license server
不实现套餐计费
不实现客户工单系统
不创建泛化 ChangeUsecase
不创建泛化 change_records
不把 current 客户资料写成 Product Core
不让 WorkflowUsecase 写库存、出货、财务、应收、应付、发票、收付款事实
不把 business_records 当长期事实真源
```

### 1.4 产品化原则已确定

项目采用：

```text
一套标准产品内核
一个毛绒玩具行业模板
多个客户配置包
少量客户专属模板 / 数据适配
极少数客户扩展
核心业务代码尽量不分叉
```

客户可以配置：

```text
公司名
Logo
菜单开关
模块开关
字段显示 / 必填
编号规则
打印模板
角色模板
权限模板
初始化数据
默认仓库
默认单位
```

客户不能配置：

```text
库存扣减规则
入库增库存规则
财务核销逻辑
审计关闭
库存流水删除
核心状态机自由拖拽
数据库结构
自定义核心业务对象
```

---

## 2. Workflow / Fact 边界进度

### 2.1 核心口诀已确定

```text
流程管协同，单据管阶段，事实管落账，结果靠计算，系统状态别混业务。
```

### 2.2 关键边界已确定

当前项目持续遵守：

```text
Workflow task done != Fact posted
shipment_release done -> shipping_released
shipping_released != shipped
shipping_released 只能表示已放行 / 可发货 / 待出库
shipped 才是真实出货完成
inventory_txns posted 才是库存真的变了
quality task done != quality_inspection passed
sales_order 是 Source Document，不是 shipment fact
purchase_order 是采购承诺，不是 purchase_receipt 入库事实
business_records 不替代正式事实表
```

### 2.3 Sales Order 状态边界

当前 V1 `sales_order` 只允许 Source Document 生命周期：

```text
draft
submitted
active
closed
canceled
```

禁止：

```text
shipped
shipping_released
shipped_quantity
shipment_id
inventory_txn_id
invoice_id
payment_id
ar_id
ap_id
product_sku_id
```

### 2.4 UI 文案边界

允许显示：

```text
shipping_released = 已放行 / 可发货 / 待出库
```

禁止显示：

```text
shipping_released = 已出库 / 已发货 / 已扣库存
```

---

## 3. Codex 工作流治理进度

### 3.1 已确定工作流

当前长期使用：

```text
中文短 Goal
+ docs/codex-goals/<goal>.md
+ .codex-review/latest.md
```

规则：

```text
每个独立 Goal 建议新开 Codex 会话
同一 Goal 内补漏 / 修测试 / 补 review report 可以继续原会话
每轮 Codex 完成后生成 .codex-review/latest.md
用户复制 latest.md 给 GPT，不再截图
```

### 3.2 已使用 / 约定的模板文件

```text
docs/codex-goals/README.md
docs/codex-goals/_new-session-goal-template.md
docs/codex-goals/_goal-file-template.md
docs/codex-goals/_review-output-protocol.md
docs/codex-goals/_gpt-context-summary.md
```

### 3.3 新 GPT 会话交接规则

新 GPT 会话默认不知道旧会话上下文。

最少提供：

```text
.codex-review/latest.md
```

更稳提供：

```text
.codex-review/latest.md
docs/codex-goals/<上一轮 goal>.md
docs/codex-goals/_gpt-context-summary.md
```

如果需要重新完整审查源码或写非常精确的实现 Goal，再上传：

```text
review bundle
或源码 zip
```

日常小循环不需要每轮上传完整代码。

---

## 4. Phase 0：产品化架构 / 目录骨架进度

### 4.1 已完成

Phase 0 是 docs-only / 架构骨架阶段。

已完成：

```text
产品化架构骨架
状态分层
配置权限策略
current 客户实例边界
imported design notes
docs/product/* 初步文档
docs/architecture/status-workflow-fact-boundary.md
docs/customers/current/*
config/customers/current/README.md
config/industry-templates/plush/README.md
deployments/current/README.md
server/internal/core/* 空骨架
web/src/erp/modules/README.md
web/src/erp/mobile/roles/README.md
```

### 4.2 Phase 0 未落

Phase 0 未落：

```text
runtime
Ent schema
migration
repo/usecase
API
UI
```

---

## 5. Phase 1：主数据 / 订单 / BOM / 采购前置评审进度

### 5.1 已完成文档评审

Phase 1 已完成这些 docs-only 评审：

```text
docs/architecture/masterdata-order-source-document-review.md
docs/architecture/customer-supplier-masterdata-review.md
docs/architecture/product-sku-bom-boundary-review.md
docs/architecture/order-purchase-boundary-review.md
docs/product/domain-schema-draft-v1-v2.md
docs/product/migration-readiness-checklist.md
docs/product/phase1-implementation-plan.md
docs/product/phase1-risk-register.md
```

### 5.2 Phase 1 核心结论

已确定：

```text
customers / suppliers / contacts 属于 MasterData
sales_orders / sales_order_items 属于 Source Document / Business Commitment
business_records 保留为兼容层、demo、seed、source snapshot、调研入口
business_records 不能长期替代正式主数据、订单、库存、出货或财务事实
BOM 是工程资料 / 物料需求来源，不是采购、库存或财务事实
```

---

## 6. Phase 2：Schema final review / V1 cutline 进度

### 6.1 已完成

Phase 2 已完成：

```text
schema final review
V1 implementation cutline
```

### 6.2 V1 Go

已确认 V1 Go：

```text
customers
suppliers
contacts
sales_orders
sales_order_items
```

### 6.3 Draft Only

仍是 Draft Only：

```text
product_skus
customer_addresses
supplier_material_profiles
settlement_terms
order_revisions
BOM version extension
purchase_orders
purchase_order_items
purchase_demands
```

### 6.4 Deferred

已延期：

```text
stock_reservations
shipments
shipment_items
AR/AP/invoice/payment/reconciliation
production facts
outsourcing facts
```

---

## 7. Goal 003：V1 Ent schema 进度

### 7.1 已完成内容

003 已完成：

```text
只新增 V1 cutline 允许的 5 个 Ent schema 文件
没有生成 Ent 代码
没有新增 Atlas migration
没有接 repo/usecase
没有接 API/RBAC
没有接 UI
没有改 docs registry
没有改 seedData
没有改 workflow.go / rbac.go
没有改 server runtime 业务逻辑
```

### 7.2 新增 schema 文件

```text
server/internal/data/model/schema/customer.go
server/internal/data/model/schema/supplier.go
server/internal/data/model/schema/contact.go
server/internal/data/model/schema/sales_order.go
server/internal/data/model/schema/sales_order_item.go
```

### 7.3 customers 决策

`customers` 分类：

```text
MasterData
```

用途：

```text
客户主数据
支撑销售订单
未来支撑出货、应收、发票、对账
```

字段风格：

```text
code unique
name
short_name optional
tax_no optional
is_active
note
created_at / updated_at
```

### 7.4 suppliers 决策

`suppliers` 分类：

```text
MasterData
```

用途：

```text
供应商主数据
未来支撑采购、委外、采购入库、采购退货、应付、对账
```

字段特征：

```text
code unique
name
short_name optional
tax_no optional
supplier_type nullable stable key
is_active
note
created_at / updated_at
```

`supplier_type` 限制：

```text
material
outsourcing
service
mixed
```

V1 未加入：

```text
银行账号
开票信息完整模型
账期
supplier_material_profiles
财务事实字段
```

### 7.5 contacts 决策

`contacts` 分类：

```text
MasterData
```

建模：

```text
owner_type + owner_id
```

DB 层约束：

```text
owner_type 枚举
owner_type 只允许 CUSTOMER / SUPPLIER
partial unique index 限制同一 owner 最多一个 primary contact
```

风险：

```text
DB 层无法建立跨 customers / suppliers 的强外键
owner_id 是否存在必须由后续 repo/usecase guard 校验
```

### 7.6 sales_orders 决策

`sales_orders` 分类：

```text
Source Document / Business Commitment
```

用途：

```text
销售订单源单据
记录客户订单和业务承诺
不代表真实出货事实
不代表库存扣减
不代表应收或开票
```

003 关键边界：

```text
只落 lifecycle_status
不落 release / fulfillment / finance 状态
避免把 source document 状态误当 shipment 或 finance fact
```

### 7.7 sales_order_items 决策

`sales_order_items` 分类：

```text
Source Document Line / Business Commitment Line
```

用途：

```text
销售订单明细
记录订单承诺数量、产品快照、价格等信息
不是出货事实
不是库存事实
不是财务事实
```

003 明确没有新增：

```text
product_sku_id
shipped_quantity
shipment
inventory
AR/AP
invoice
payment 字段
```

---

## 8. Goal 004：Ent generate + Atlas migration 进度

### 8.1 已完成内容

004 已完成：

```text
基于 003 的 5 个 schema 执行 cd server && make data
生成 Ent generated code
生成 Atlas migration
未接 repo/usecase
未接 API/RBAC
未接 UI
未接 business_records transition
```

004 新增 migration：

```text
server/internal/data/model/migrate/20260530161152_migrate.sql
```

migration 只包含：

```text
contacts
suppliers
customers
sales_orders
sales_order_items
```

### 8.2 004 生成内容

新增 Ent generated code，覆盖：

```text
contact
customer
supplier
salesorder
salesorderitem
```

并修改 Ent 公共生成文件，例如：

```text
server/internal/data/model/ent/client.go
server/internal/data/model/ent/ent.go
server/internal/data/model/ent/mutation.go
server/internal/data/model/ent/migrate/schema.go
server/internal/data/model/migrate/atlas.sum
```

### 8.3 004 检查结果

通过检查：

```text
generated code 不包含 tenant_id
migration 不包含 tenant_id
migration 不包含 product_skus / purchase_orders / shipments / stock_reservations / finance facts
contacts check + primary contact partial unique index 已生成
sales_order 仍是 Source Document
未引入 shipped_quantity
```

004 测试通过：

```text
make data 通过
make migrate_status 通过，状态 pending
go test ./internal/data/model/schema 通过
go test ./internal/biz ./internal/data 通过
```

目标库 migration 仍是 pending，没有 apply。

### 8.4 004 风险

风险：

```text
目标库 migration 仍 pending
contacts owner 存在性仍需 usecase guard
Ent 生成器重写 mutation.go 等大文件，diff 较大但属正常生成
```

contacts owner guard 已在 005 处理。

---

## 9. Goal 005：MasterData repo/usecase 进度

### 9.1 已完成内容

005 已完成：

```text
customers / suppliers / contacts 后端 MasterData repo/usecase
对应测试
contacts owner guard
primary contact 事务策略
```

新增文件：

```text
server/internal/biz/masterdata.go
server/internal/biz/masterdata_test.go
server/internal/data/masterdata_repo.go
server/internal/data/masterdata_repo_test.go
```

005 没有接：

```text
API/RBAC
UI
docs registry
seedData
sales order usecase
business_records transition
```

### 9.2 customers 动作

已支持：

```text
Create
Update
Get
List
SetActive
```

### 9.3 suppliers 动作

已支持：

```text
Create
Update
Get
List
SetActive
```

### 9.4 contacts 动作

已支持：

```text
Create
Update
Get
ListContactsByOwner
SetPrimaryContact
DisableContact
```

### 9.5 contacts guard

已实现：

```text
owner_type 必须是 CUSTOMER / SUPPLIER
owner_id 必须存在于对应 customers / suppliers
不能给不存在的 customer 创建 contact
不能给不存在的 supplier 创建 contact
同一 owner 最多一个 primary contact
```

primary contact 策略：

```text
设置新的 primary contact 时，事务内取消同 owner 其他 primary
```

### 9.6 005 测试

已跑：

```text
go test ./internal/biz ./internal/data -run 'TestMasterData'
go test ./internal/biz ./internal/data
```

结果通过。

### 9.7 005 后风险

仍有：

```text
目标库 migration 是否 apply 不在 005 范围
API/RBAC/UI 尚未实现
business_records partners 兼容层仍存在
```

API/RBAC 已在 007 处理。  
UI 已在 008 处理。  
business_records transition 仍未做。

---

## 10. Goal 006：Sales Order repo/usecase 进度

### 10.1 已完成内容

006 已完成：

```text
sales_orders / sales_order_items 后端 repo/usecase
对应测试
生命周期状态机
customer/product/unit guard
```

新增文件：

```text
server/internal/biz/sales_order.go
server/internal/biz/sales_order_test.go
server/internal/data/sales_order_repo.go
server/internal/data/sales_order_repo_test.go
```

006 没有接：

```text
API/RBAC
UI
docs registry
seedData
business_records transition
Workflow
shipment
inventory
stock reservation
finance
invoice
payment
```

### 10.2 sales_orders 支持动作

已支持：

```text
CreateSalesOrder
UpdateSalesOrder
GetSalesOrder
ListSalesOrders
SubmitSalesOrder
ActivateSalesOrder
CloseSalesOrder
CancelSalesOrder
```

### 10.3 sales_order_items 支持动作

已支持：

```text
AddSalesOrderItem
UpdateSalesOrderItem
RemoveSalesOrderItem
ListSalesOrderItems
```

其中：

```text
RemoveSalesOrderItem = line_status canceled
不是物理删除
```

### 10.4 Sales Order lifecycle

已实现 canonical lifecycle：

```text
draft -> submitted -> active -> closed
draft / submitted / active -> canceled
```

禁止：

```text
draft -> active
closed / canceled -> any next state
any -> shipped
```

### 10.5 Sales Order Item status

已实现：

```text
open
closed
canceled
```

### 10.6 Guard

已实现：

```text
创建 / 更新订单：customer_id 必须存在且 active
新增 / 更新订单行：sales_order_id 必须存在且订单未 closed/canceled
新增 / 更新订单行：product_id 必须存在且 active
新增 / 更新订单行：unit_id 必须存在且 active
ordered_quantity > 0
unit_price / amount 如提供则不得为负
```

### 10.7 006 边界

006 明确没有：

```text
shipped_quantity
shipment_id
inventory_txn_id
invoice_id
payment_id
ar_id
ap_id
product_sku_id
```

### 10.8 006 测试

已跑：

```text
go test ./internal/biz ./internal/data
go test -count=1 ./internal/biz ./internal/data
```

结果通过。

---

## 11. Goal 007：API / RBAC 进度

### 11.1 已完成内容

007 已完成：

```text
customers / suppliers / contacts JSON-RPC API
sales_orders / sales_order_items JSON-RPC API
customer.* / supplier.* / contact.* / sales_order.* / sales_order_item.* RBAC 动作权限
API/RBAC 测试
```

新增文件：

```text
server/internal/data/jsonrpc_masterdata_order.go
server/internal/data/jsonrpc_masterdata_order_test.go
```

修改文件：

```text
server/internal/data/jsonrpc.go
server/internal/biz/rbac.go
docs/current-source-of-truth.md
docs/product/v1-next-codex-goals.md
docs/product/v1-schema-go-no-go.md
progress.md
```

### 11.2 新增 API 分组

新增 JSON-RPC url：

```text
masterdata
sales_order
```

### 11.3 MasterData API

支持：

```text
create_customer / createCustomer
update_customer / updateCustomer
get_customer / getCustomer
list_customers / listCustomers
set_customer_active / setCustomerActive

create_supplier / createSupplier
update_supplier / updateSupplier
get_supplier / getSupplier
list_suppliers / listSuppliers
set_supplier_active / setSupplierActive

create_contact / createContact
update_contact / updateContact
get_contact / getContact
list_contacts_by_owner / listContactsByOwner
set_primary_contact / setPrimaryContact
disable_contact / disableContact
```

### 11.4 Sales Order API

支持：

```text
create_sales_order / createSalesOrder
update_sales_order / updateSalesOrder
get_sales_order / getSalesOrder
list_sales_orders / listSalesOrders
submit_sales_order / submitSalesOrder
activate_sales_order / activateSalesOrder
close_sales_order / closeSalesOrder
cancel_sales_order / cancelSalesOrder

add_sales_order_item / addSalesOrderItem
update_sales_order_item / updateSalesOrderItem
remove_sales_order_item / removeSalesOrderItem
list_sales_order_items / listSalesOrderItems
```

### 11.5 RBAC 权限

新增或补齐：

```text
customer.*
supplier.*
contact.*
sales_order.*
sales_order_item.*
```

权限码遵循现有 `resource.action` 风格，用 `read` 替代 `view`。

### 11.6 权限测试覆盖

007 覆盖：

```text
未登录
非管理员
disabled admin
无权限
有权限
contacts owner guard
sales order item product/unit guard
禁止 shipment verb 暴露
```

测试通过：

```text
go test ./internal/data -run 'TestJsonrpcData_(MasterData|ContactAPI|SalesOrder|RBAC)'
go test ./internal/biz -run 'TestBuiltinRoleWorkflowPermissionMatrix|TestAdminHasPermissionSuperAdminHasAllPermissions'
go test ./internal/biz ./internal/data ./internal/service ./internal/server
go test ./internal/biz ./internal/data
```

### 11.7 007 边界

007 没有：

```text
UI
移动端页面
docs registry
seedData
business_records transition
shipments
stock_reservations
inventory_txns
AR/AP
invoice
payment
```

也没有改：

```text
workflow.go
schema
migration
generated code
```

---

## 12. Goal 008：前端页面进度

### 12.1 已完成内容

008 已完成：

```text
V1 MasterData / Sales Order 前端 API client
customers 页面
suppliers 页面
contacts 区块
sales_orders 页面
sales_order_items 区块
路由
前端 helper
前端 contract tests
mocked RPC route render
```

新增文件：

```text
web/src/erp/api/masterDataOrderApi.mjs
web/src/erp/api/masterDataOrderApi.test.mjs
web/src/erp/pages/V1MasterDataPage.jsx
web/src/erp/pages/V1SalesOrdersPage.jsx
web/src/erp/utils/masterDataOrderView.mjs
web/src/erp/utils/masterDataOrderView.test.mjs
```

修改文件：

```text
web/package.json
web/src/erp/router.jsx
docs/current-source-of-truth.md
docs/product/v1-next-codex-goals.md
docs/product/v1-schema-go-no-go.md
progress.md
```

008 没有改：

```text
后端 API/RBAC
schema
migration
generated code
repo/usecase
docs registry
seedData
business_records transition
```

### 12.2 新增路由

新增：

```text
/erp/master/partners/customers
/erp/master/partners/suppliers
/erp/sales/project-orders/sales-orders
```

### 12.3 customers 页面

支持：

```text
列表
创建
编辑
查看
启停
```

### 12.4 suppliers 页面

支持：

```text
列表
创建
编辑
查看
启停
```

### 12.5 contacts 区块

在客户/供应商详情 Drawer 内提供联系人区块，支持：

```text
按 owner 查看
创建
编辑
设置主联系人
禁用
```

### 12.6 sales_orders 页面

支持：

```text
列表
创建
编辑
查看
提交
激活
关闭
取消
```

### 12.7 sales_order_items 区块

支持：

```text
列表
新增
编辑
移除/取消
```

### 12.8 008 边界

008 明确：

```text
UI 调用 007 JSON-RPC API
不绕过 API
不直接写 Ent
不把 local fake state 当真源
不复制 sales order lifecycle 业务规则
不把 shipping_released 显示成已出库
不显示 sales_order 为 shipped
不展示或编辑 shipped_quantity
不展示 shipment / inventory / finance facts
不把 current 客户样本字段写成固定产品字段
```

### 12.9 008 测试

已跑：

```text
pnpm lint
pnpm css
pnpm test
pnpm style:l1
go test ./internal/biz ./internal/data
Playwright mocked RPC route render
git diff --check
```

结果：

```text
pnpm test 279 pass
style:l1 45 场景通过
后端 go test 通过
mocked RPC route render 通过 customers/suppliers/sales_orders 默认态
```

真实后端 + 真实数据库 E2E 未跑。

### 12.10 008 风险

仍有：

```text
V1 页面未接正式菜单入口
sales_order_items 产品 / 单位暂用 ID 输入
未跑真实后端数据库 E2E
business_records transition 未做
```

008 里曾尝试给兼容 `business_records` 页面头部加跳转按钮，但会影响既有 L1 布局预算，已撤回，最终只保留正式 V1 路由页面。

---

## 13. 当前 business_records 状态

### 13.1 当前定位

`business_records` 仍然是：

```text
兼容层
demo
seed
source snapshot
调研入口
```

不是：

```text
正式 customers / suppliers 真源
正式 sales_orders 真源
库存事实
出货事实
财务事实
```

### 13.2 当前未做

还未做：

```text
business_records transition audit
business_records 引用清单
business_records 与 V1 模型重叠矩阵
business_records data map draft
business_records cutover plan
旧入口 read-only/demo/deprecated 方案
真实数据迁移
删除旧入口
```

### 13.3 下一步优先级

下一步优先做：

```text
009-business-records-transition-audit
```

理由：

```text
V1 正式 UI 已经存在
旧 business_records 兼容入口仍保留
必须先审计引用和退出路径
避免双真源 / 双写 / 菜单误导
```

---

## 14. 当前还未完成的业务模块

### 14.1 主数据仍未完全完成

已完成：

```text
customers
suppliers
contacts
```

未完成 / deferred：

```text
customer_addresses
supplier_material_profiles
settlement_terms
product_skus
```

### 14.2 销售订单已完成最小 Source Document

已完成：

```text
sales_orders schema
sales_order_items schema
Ent generate
migration
repo/usecase
API/RBAC
前端页面
```

但销售订单仍不是完整订单到出货闭环。

未完成：

```text
shipment
stock reservation
actual outbound
inventory deduction
AR/AP
invoice
payment
reconciliation
```

### 14.3 出货事实未做

仍 deferred：

```text
shipments
shipment_items
stock_reservations
shipment outbound
inventory outbound
```

### 14.4 财务事实未做

仍 deferred：

```text
AR
AP
invoice
payment
reconciliation
settlement
```

### 14.5 生产 / 委外事实未做

仍 deferred：

```text
production_orders
production_material_issues
finished_goods_receipts
outsourcing facts
```

---

## 15. 当前测试与验证状态

### 15.1 后端测试

已覆盖：

```text
MasterData repo/usecase
contacts owner guard
primary contact 策略
Sales Order repo/usecase
Sales Order lifecycle guard
customer/product/unit active guard
JSON-RPC API/RBAC 核心路径
```

### 15.2 前端测试

已覆盖：

```text
API client contract tests
helper tests
前端路由 mocked RPC render
pnpm lint
pnpm css
pnpm test
pnpm style:l1
```

### 15.3 未覆盖

仍未做：

```text
真实后端 + 真实数据库 E2E
真实客户数据导入 dry-run
business_records 迁移 dry-run
完整订单到出货链路 E2E
shipment/inventory/finance facts 相关测试
```

---

## 16. 当前 Git / 工作区注意点

近几轮有一个现象：部分 Goal 曾被另一个 Codex 会话顺手提交过。

当前流程上要继续坚持：

```text
Codex 默认不 git add
Codex 默认不 commit
Codex 默认不 push
除非用户明确允许
```

后续审查 `.codex-review/latest.md` 时要继续关注：

```text
git status --short
git log --oneline -3
是否有未授权 commit
是否有未跟踪文件
是否有禁止路径改动
```

---

## 17. 当前最建议的下一步

### 17.1 推荐下一步

```text
009-business-records-transition-audit
```

### 17.2 009 应该只做

```text
引用审计
重叠矩阵
cutover plan
data map draft
risk register
```

### 17.3 009 不应该做

```text
删除 business_records
修改 business_records schema
修改 business_records runtime
修改 V1 页面
修改 seedData
修改 docs registry
执行数据迁移
写 import/backfill 代码
做双写
```

---

## 18. 当前进度总表

| 层级 | 当前状态 | 说明 |
|---|---|---|
| 产品定位 | 已确定 | 毛绒玩具行业 ERP 产品内核 |
| current 客户定位 | 已确定 | 种子客户 / 私有化客户实例，不是 runtime tenant |
| Workflow / Fact 边界 | 已确定 | `shipping_released != shipped`，Workflow 不写事实 |
| Codex 工作流 | 已建立 | 中文短 Goal + md + latest review |
| Phase 0 架构骨架 | 已完成 | docs / 目录 / current 边界 |
| Phase 1 评审 | 已完成 | 主数据 / 订单 / BOM / 采购前置 |
| Phase 2 cutline | 已完成 | V1 Go / Draft Only / Deferred |
| 003 Ent schema | 已完成 | 5 个 V1 schema |
| 004 Ent generate + migration | 已完成 | generated code + migration |
| 005 MasterData repo/usecase | 已完成 | customers / suppliers / contacts |
| 006 SalesOrder repo/usecase | 已完成 | sales_orders / items |
| 007 API/RBAC | 已完成 | JSON-RPC + 权限 |
| 008 Frontend pages | 已完成 | V1 页面 + 路由 |
| business_records transition | 未完成 | 下一步 009 |
| 数据导入 | 未完成 | 010 候选 |
| 正式菜单 / seedData 接入 | 未完成 | 009 后再做 |
| shipment facts | 未完成 | 后续独立阶段 |
| inventory reservation/outbound | 未完成 | 后续独立阶段 |
| finance facts | 未完成 | 后续独立阶段 |
| production / outsourcing facts | 未完成 | 后续独立阶段 |

---

## 19. 简短结论

目前项目已经完成了：

```text
V1 customers / suppliers / contacts / sales_orders / sales_order_items
从 schema -> migration -> repo/usecase -> API/RBAC -> 前端页面
```

但还没有完成：

```text
旧 business_records 退出
真实数据导入
正式菜单切换
出货 / 库存 / 财务 / 生产 / 委外事实层
真实 E2E
```

所以当前最小安全下一步是：

```text
009-business-records-transition-audit
```

目标是把旧兼容层和新 V1 正式模型的边界收口，避免后续出现双真源、双写、旧菜单误导或 current 客户样本污染 Product Core。
```

### 099. user

_time `2026-05-31T13:21:17+08:00` · content_type `text` · node `977474bc-bf9b-4f5c-bc00-ecc9162814f1`_

_（空消息）_

### 100. assistant

_time `2026-05-31T13:21:19+08:00` · content_type `text` · node `28b490e1-f82f-4819-90c1-b017c8ffa4bb`_

009 我判断：**合格，可以进入 010-current-customer-data-import-draft**。

009 是 docs-only 审计，新增了 5 份 `business-records-*` 文档，没有改 runtime、schema、migration、API/RBAC、UI、docs registry、seedData，也没有做真实迁移、双写或删除；这正好符合当前阶段先审计 `business_records`，再做 current 客户数据导入草案的顺序。fileciteturn14file0

短 Goal 先复制这个：

```text
目标：执行 docs/codex-goals/010-current-customer-data-import-draft.md。

请先阅读 AGENTS.md，然后严格执行任务文件。每次新会话都不能依赖历史聊天记忆，只能以仓库文件为准。

本轮只做 current 客户数据导入 dry-run / 字段分类 / unresolved queue 草案。只允许写文档和导入方案，不改 runtime、schema、migration、generated code、repo/usecase、API/RBAC、UI、docs registry、seedData，不写 import/backfill 代码，不执行真实数据迁移。

重点：current 客户资料只能作为 Customer Material / Demo Seed / Industry Template Candidate / Print Template Input / Data Import Source，不得直接变成 Product Core。business_records 仍是兼容层、demo、seed、source snapshot、调研入口，不是长期事实真源。

禁止 tenant_id、SaaS 多租户、license server、套餐计费、客户工单系统、ChangeUsecase、change_records。禁止 product_skus、purchase_orders、shipments、stock_reservations、finance facts。禁止从旧记录自动生成 shipment / inventory / finance facts。shipping_released != shipped。

本轮允许和禁止修改的文件，以任务 md 为准。

禁止 git add、commit、push、stash、回退非本轮改动。

完成后必须按 docs/codex-goals/_review-output-protocol.md 生成 .codex-review/latest.md。

用户应能用下面命令复制：

cat .codex-review/latest.md | pbcopy

不要要求用户截图。
```

文件名：

```text
docs/codex-goals/010-current-customer-data-import-draft.md
```

完整 md 如下：

:::writing{variant="document" id="64827"}
# Codex Goal 010: current Customer Data Import Draft

## 任务名称

010：current 客户数据导入 dry-run / 字段分类 / unresolved queue 草案

---

## 任务性质

本轮属于：

Audit / Docs-only / Import Design Draft

本轮只允许做导入方案、字段分类、dry-run 设计、unresolved queue 设计和后续执行计划。

本轮不改 runtime。  
本轮不改 Ent schema。  
本轮不新增 migration。  
本轮不改 generated code。  
本轮不改 repo/usecase。  
本轮不改 API/RBAC。  
本轮不改 UI。  
本轮不改 docs registry。  
本轮不改 seedData。  
本轮不写 import/backfill 代码。  
本轮不执行真实数据迁移。  
本轮不删除或修改 business_records。  

必须明确：

- 本轮是否改 runtime：否
- 本轮是否改 Ent schema：否
- 本轮是否新增 migration：否
- 本轮是否改 API：否
- 本轮是否改 RBAC：否
- 本轮是否改 UI：否
- 本轮是否改 docs registry：否
- 本轮是否改 seedData：否
- 本轮是否改 repo/usecase：否
- 本轮是否做真实数据迁移：否
- 本轮是否写 import/backfill 代码：否

---

## 背景

003 已新增 V1 Ent schema：

- customers
- suppliers
- contacts
- sales_orders
- sales_order_items

004 已完成：

- Ent generated code
- Atlas migration

005 已完成：

- customers / suppliers / contacts repo/usecase
- contacts owner_type + owner_id guard
- contacts primary contact 策略

006 已完成：

- sales_orders / sales_order_items repo/usecase
- sales order lifecycle: draft / submitted / active / closed / canceled
- sales order item status: open / closed / canceled
- customer / product / unit guard

007 已完成：

- customers / suppliers / contacts JSON-RPC API
- sales_orders / sales_order_items JSON-RPC API
- V1 API/RBAC 权限码和测试

008 已完成：

- V1 customers / suppliers / contacts 前端页面
- V1 sales_orders / sales_order_items 前端页面
- V1 前端 API client
- V1 路由
- 前端测试、mocked route render、style:l1

009 已完成：

- business_records 引用审计
- business_records 与 V1 正式模型重叠矩阵
- business_records cutover plan
- business_records data map draft
- business_records risk register

009 结论：

- business_records 继续保留。
- business_records 不删除、不迁移、不双写。
- partners / products / project-orders 是最高优先级重叠入口。
- data map 只能进入 dry-run / import draft，不自动写正式数据。
- product_skus、采购订单、出货、库存预留和财务事实继续 draft-only / deferred，不从旧快照自动生成。

010 的目标：

基于 current 客户资料、seed/demo/source snapshot、business_records audit 和 V1 正式模型，设计 current 客户数据导入 dry-run 方案。

010 不处理：

- 真实导入
- 真实 backfill
- 修改 seedData
- 修改 docs registry
- 修改 business_records
- 修改 V1 页面
- 修改 API/RBAC
- 修改 repo/usecase
- 修改 schema/migration
- 自动生成 shipment / inventory / finance facts

---

## 必须先读

### 项目规则

- AGENTS.md
- README.md
- docs/current-source-of-truth.md
- progress.md

### GPT / Codex 上下文

- docs/codex-goals/_gpt-context-summary.md
- docs/codex-goals/README.md
- docs/codex-goals/_new-session-goal-template.md
- docs/codex-goals/_goal-file-template.md
- docs/codex-goals/_review-output-protocol.md

如果某些模板文件不存在，请记录缺失，不要自行大范围补模板。

### 003 / 004 / 005 / 006 / 007 / 008 / 009 Goal 与审查结果

- docs/codex-goals/003-v1-ent-schema-customers-suppliers-orders.md
- docs/codex-goals/004-v1-migration-and-ent-generate.md
- docs/codex-goals/005-v1-repo-usecase-masterdata.md
- docs/codex-goals/006-v1-repo-usecase-sales-order.md
- docs/codex-goals/007-v1-api-rbac-masterdata-order.md
- docs/codex-goals/008-v1-frontend-masterdata-order-pages.md
- docs/codex-goals/009-business-records-transition-audit.md
- .codex-review/latest.md

如果 .codex-review/latest.md 不存在，请继续，但必须从 003 到 009 goal 和当前 git 状态中恢复上下文，并在最终报告中说明缺失。

### Phase 0 / 1 / 2 文档

- docs/product/zero-to-one-architecture.md
- docs/product/product-principles.md
- docs/product/domain-model-v1.md
- docs/product/module-boundaries.md
- docs/product/config-permission-policy.md
- docs/product/customer-instance-policy.md
- docs/product/customer-delta-policy.md
- docs/product/rewrite-roadmap.md
- docs/product/release-gates.md
- docs/product/test-strategy.md
- docs/architecture/status-workflow-fact-boundary.md

- docs/architecture/masterdata-order-source-document-review.md
- docs/architecture/customer-supplier-masterdata-review.md
- docs/architecture/product-sku-bom-boundary-review.md
- docs/architecture/order-purchase-boundary-review.md
- docs/product/domain-schema-draft-v1-v2.md
- docs/product/migration-readiness-checklist.md
- docs/product/phase1-implementation-plan.md
- docs/product/phase1-risk-register.md

- docs/product/schema-design-final-review.md
- docs/product/v1-entity-decision-record.md
- docs/product/v1-implementation-cutline.md
- docs/product/v1-schema-go-no-go.md
- docs/product/business-records-transition-plan.md
- docs/product/v1-next-codex-goals.md

### 009 business_records 审计文档

- docs/product/business-records-reference-audit.md
- docs/product/business-records-transition-audit.md
- docs/product/business-records-cutover-plan.md
- docs/product/business-records-data-map-draft.md
- docs/product/business-records-risk-register.md

### current 客户资料

- docs/customers/current/README.md
- docs/customers/current/source-materials.md
- docs/customers/current/requirement-clues.md
- docs/customers/current/assumption-register.md
- docs/customers/current/question-backlog.md
- docs/customers/current/decision-log.md
- docs/customers/current/customer-config-draft.md
- docs/customers/current/delta-register.md
- docs/customers/current/change-request-process.md

### current 资料和 seed 相关文件

Codex 必须搜索真实仓库，不要猜路径。

至少检查：

- docs/customers/current/*
- web/src/erp/config/seedData.mjs
- web/src/erp/config/businessModules.mjs
- web/src/erp/config/businessRecordDefinitions.mjs
- docs/product/business-records-data-map-draft.md
- docs/product/business-records-reference-audit.md

建议命令：

    grep -R "current\|客户\|供应商\|订单\|产品\|材料\|仓库\|Excel\|PDF\|加工合同\|seed\|demo" docs/customers web/src/erp/config docs/product -n || true

如果本地有 rg，可用 rg。

如果某些文件不存在，请记录缺失，不要猜。

---

## 当前真源与非真源

### 当前真源

本轮必须以这些为准：

- AGENTS.md
- docs/current-source-of-truth.md
- docs/product/business-records-data-map-draft.md
- docs/product/business-records-transition-audit.md
- docs/product/business-records-cutover-plan.md
- docs/product/v1-implementation-cutline.md
- docs/product/v1-schema-go-no-go.md
- docs/customers/current/source-materials.md
- docs/customers/current/requirement-clues.md
- docs/customers/current/customer-config-draft.md
- docs/customers/current/delta-register.md
- V1 正式 schema / API / UI 已完成状态

### 只能作为线索

- web/src/erp/config/seedData.mjs
- docs/customers/current/*
- current 客户 Excel / PDF / 图片样本
- business_records 历史快照
- imported notes
- 历史 changes 文档

### 禁止作为当前实现真源

- 历史聊天记忆
- 未确认截图 / 口头描述
- demo / seed 数据
- current 客户样本字段
- 未落地 schema draft
- business_records 历史记录

必须保持：

- 代码 / schema / migration / tests 是实现真源。
- current-source-of-truth 是当前状态入口。
- customer material 不是 Product Core。
- seed/demo/source snapshot 只能作为导入线索。
- business_records 是兼容层，不是正式事实真源。
- import draft 不是实际迁移。

---

## 允许修改的文件

本轮允许新增：

- docs/customers/current/import-source-inventory.md
- docs/customers/current/import-field-classification.md
- docs/customers/current/import-dry-run-plan.md
- docs/customers/current/import-unresolved-queue.md
- docs/customers/current/import-acceptance-checklist.md
- docs/product/current-customer-import-strategy.md
- docs/product/current-customer-import-risk-register.md

允许小幅更新：

- docs/current-source-of-truth.md
- docs/customers/current/README.md
- docs/customers/current/source-materials.md
- docs/customers/current/delta-register.md
- docs/product/v1-next-codex-goals.md
- docs/product/v1-schema-go-no-go.md
- progress.md

允许生成或覆盖：

- .codex-review/latest.md

---

## 禁止修改的文件

本轮禁止修改：

- server/internal/biz/*
- server/internal/data/*
- server/internal/data/model/schema/*
- server/internal/data/model/migrate/*
- server/internal/data/model/ent/*
- server/internal/core/*
- web/src/erp/config/docs.mjs
- web/src/erp/config/seedData.mjs
- web/src/erp/config/businessModules.mjs
- web/src/erp/config/businessRecordDefinitions.mjs
- web/src/erp/router.jsx
- web/src/erp/pages/*
- web/src/erp/api/*
- web/src/erp/utils/*
- web/src/erp/mobile/*
- server/deploy
- scripts
- docs/codex-goals/_new-session-goal-template.md
- docs/codex-goals/_goal-file-template.md
- docs/codex-goals/_review-output-protocol.md

特别说明：

- 本轮不得写 import loader。
- 本轮不得写 backfill 脚本。
- 本轮不得修改 seedData。
- 本轮不得修改 business_records。
- 本轮不得修改 V1 页面。
- 本轮不得修改 API/RBAC。
- 本轮不得执行真实迁移。
- 本轮不得做双写。
- 本轮不得删除旧入口。

如果 Codex 发现必须修改禁止路径，必须停止并报告，不得自行修改。

---

## 改动范围分级

本轮范围级别：

Audit / Docs-only / Import Design Draft

不得扩大到：

- runtime
- schema
- migration
- generated code
- repo/usecase
- API/RBAC
- UI
- seedData
- docs registry
- data migration
- import/backfill code

禁止把下面内容放进同一轮：

- import draft + 写 import loader
- import draft + seedData 改造
- import draft + business_records 修改
- import draft + V1 UI 改造
- import draft + API 双写
- import draft + 数据迁移
- import draft + 自动生成出货 / 库存 / 财务事实

发现范围不足时，停止并报告。

---

## 成功标准

本轮完成必须满足：

- 输出 current 客户导入来源清单。
- 输出 current 客户字段分类表。
- 输出 current 客户导入 dry-run plan。
- 输出 unresolved queue 设计。
- 输出 import acceptance checklist。
- 输出 Product 层 current customer import strategy。
- 输出 import risk register。
- 明确哪些字段可以自动进入 V1 正式模型。
- 明确哪些字段只能进入 Customer Material / Demo Seed / Industry Template Candidate。
- 明确哪些字段必须人工确认。
- 明确哪些字段不能自动迁移。
- 明确哪些内容不得生成 shipment / inventory / finance facts。
- 明确哪些内容必须等待 product_skus / purchase_orders / shipments / finance 后续模型。
- 不改 runtime。
- 不改 schema/migration。
- 不改 seedData。
- 不改 business_records。
- 不做真实数据迁移。
- 不写 import/backfill 代码。
- 不新增 tenant_id。
- 不新增 ChangeUsecase/change_records。
- .codex-review/latest.md 已生成。

不能只写“已完成导入草案”。

---

## 停止条件

出现以下情况必须停止并报告：

- 任务文件与 AGENTS.md 或当前代码真源冲突。
- 需要修改禁止路径。
- 需要改 seedData。
- 需要改 business_records。
- 需要写 import/backfill 代码。
- 需要做真实数据迁移。
- 需要改 V1 页面。
- 需要改 API/RBAC。
- 需要新增 schema/migration。
- 需要新增 tenant_id。
- 需要实现 SaaS 多租户。
- 需要自动生成 shipments。
- 需要自动生成 stock_reservations。
- 需要自动生成 inventory_txns。
- 需要自动生成 AR/AP/invoice/payment。
- 无法区分 demo/seed/source snapshot 与正式事实。
- 无法确认字段来源。
- 需要删除、回退、整理或 stash 非本轮改动。

停止时必须输出：

停止原因：
涉及文件：
风险：
建议下一步：

---

## Git 策略

默认规则：

- 本轮默认不提交、不推送。
- 不允许执行 git add .
- 不允许自动 commit。
- 不允许自动 push。
- 不允许回退、整理或 stash 非本轮改动。
- 如需 stage，必须按路径精确 stage，并且用户明确要求。

必须先运行并记录：

    git status --short
    git branch --show-current
    git log --oneline -3

如果发现当前仓库已经有自动 commit 或 origin/main 同步，必须在 review 中说明，不要继续 commit/push。

必须区分：

- tracked diff
- untracked files
- 本轮新增文件
- 历史未跟踪文件

如果存在历史 untracked 文件，不要删除，报告即可。

---

## 输出文档要求

### 1. import-source-inventory.md

路径：

- docs/customers/current/import-source-inventory.md

必须列出 current 客户所有可作为导入来源的资料。

至少包括：

- docs/customers/current/source-materials.md 中列出的资料
- web/src/erp/config/seedData.mjs 中的 seed/demo/source snapshot
- business_records 相关旧数据或旧入口
- current 客户 Excel / PDF / 图片样本
- 加工合同样本
- 材料表 / 订单表 / 辅材包材表 / 生产订单表等线索
- V1 页面当前可承载的数据

每项必须写：

- source
- type
- owner
- business domain
- can import?
- import target
- confidence
- needs manual review?
- notes

分类建议：

- Customer Material
- Demo Seed
- Source Snapshot
- Print Template Input
- Industry Template Candidate
- Data Import Source
- QA Debug
- Do Not Import

### 2. import-field-classification.md

路径：

- docs/customers/current/import-field-classification.md

必须按业务域分类字段：

- customers
- suppliers
- contacts
- sales_orders
- sales_order_items
- products
- materials
- warehouses
- BOM
- purchase
- outsourcing
- shipment
- inventory
- finance

每个字段必须标记：

- source field
- meaning
- target model
- target field
- classification
- auto import?
- manual review?
- forbidden?
- reason

classification 必须使用：

- Product Core
- Industry Template Candidate
- Customer Config
- Customer Material
- Demo Seed
- Data Import Source
- Print Template Input
- Deferred
- Forbidden Auto Import

必须明确：

- current 客户样本字段不能自动变成 Product Core 必填字段。
- product_skus 仍 draft-only，不得自动创建。
- purchase_orders 仍 draft-only / V2 candidate，不得自动创建。
- shipments / stock_reservations / finance facts 仍 deferred，不得自动创建。
- 没有事实依据不得生成库存、出货、财务记录。

### 3. import-dry-run-plan.md

路径：

- docs/customers/current/import-dry-run-plan.md

必须设计 dry-run 流程，不写代码。

dry-run 阶段至少包括：

Stage 0: Source collection

- 收集来源文件、seed、business_records 快照。
- 只读扫描，不写数据库。

Stage 1: Parse and normalize

- 解析字段。
- 标准化客户、供应商、产品、材料、订单字段。
- 记录无法识别字段。

Stage 2: Match existing V1 data

- 匹配 customers。
- 匹配 suppliers。
- 匹配 contacts。
- 匹配 sales_orders。
- 匹配 sales_order_items。
- 匹配 existing products / materials / warehouses / units。

Stage 3: Generate preview

- 生成可导入预览。
- 生成 skipped rows。
- 生成 unresolved queue。
- 生成 duplicate candidates。
- 生成 conflict candidates。

Stage 4: Manual review

- 人工确认客户 / 供应商 / 产品 / 订单映射。
- 人工确认不能自动判断的字段。

Stage 5: Approval before import

- 审批导入结果。
- 明确本阶段仍不写数据库。

Stage 6: Future import execution

- 只有后续单独 Goal 才能写 import loader。
- 必须有备份、回滚、校验。
- 必须禁止双写。

必须明确：

当前 010 不执行 Stage 6。

### 4. import-unresolved-queue.md

路径：

- docs/customers/current/import-unresolved-queue.md

必须设计 unresolved queue。

必须包含 unresolved 类型：

- unknown customer
- unknown supplier
- unknown product
- unknown material
- unknown unit
- unknown warehouse
- ambiguous customer/supplier
- duplicate code
- duplicate name
- missing required field
- invalid date
- invalid quantity
- invalid money
- unmapped field
- deferred domain
- forbidden fact generation
- needs manual review

每类必须写：

- meaning
- example
- owner role
- resolution options
- can auto resolve?
- must block import?
- notes

必须明确：

- 涉及 shipment / inventory / finance facts 的 unresolved 必须 block。
- 涉及 product_skus / purchase_orders 的 unresolved 必须 deferred。
- 涉及 current 客户特殊字段的 unresolved 不得自动进 Product Core。

### 5. import-acceptance-checklist.md

路径：

- docs/customers/current/import-acceptance-checklist.md

必须输出导入验收清单。

至少包含：

- source files confirmed
- field classification reviewed
- target model confirmed
- required fields present
- duplicate rules reviewed
- unresolved queue empty or approved
- no forbidden facts generated
- no tenant_id introduced
- no shipment facts generated
- no inventory facts generated
- no finance facts generated
- no product_skus generated unless future review approves
- no purchase_orders generated unless future review approves
- business_records not deleted
- seedData not modified
- V1 data preview reviewed
- rollback plan prepared
- backup plan prepared
- customer sign-off

### 6. current-customer-import-strategy.md

路径：

- docs/product/current-customer-import-strategy.md

必须从 Product 层总结 current 客户导入策略：

- current 是种子客户。
- current 资料是 Customer Material / Data Import Source。
- current 资料不直接成为 Product Core。
- 导入必须先 dry-run。
- 导入必须先分类字段。
- 导入必须先 unresolved queue。
- 导入必须先人工确认。
- 导入不得自动生成 deferred facts。
- 导入不得绕过 V1 usecase。
- 后续真实 import loader 必须单独 Goal。
- 后续真实 import 必须有备份、回滚、校验。

### 7. current-customer-import-risk-register.md

路径：

- docs/product/current-customer-import-risk-register.md

必须列风险：

- current 客户字段污染 Product Core。
- Excel 字段语义不清。
- 同名客户 / 供应商 / 产品重复。
- 产品与 product_skus 混淆。
- 订单样本误当 sales_orders 正式数据。
- 业务快照误当事实。
- business_records 与 V1 双真源。
- seedData 被误当正式数据。
- 自动生成出货 / 库存 / 财务事实。
- migration / import 无回滚。
- 导入后客户不认可。
- 未确认字段被自动丢弃。
- 未确认字段被错误写入 note。
- 时间、数量、金额格式错误。
- 单位映射错误。
- 仓库映射错误。

每项写：

- risk
- impact
- evidence
- mitigation
- owner layer
- next review needed

---

## Workflow / Fact 边界

本轮不得接 Workflow。

必须保持：

- Workflow task done != Fact posted。
- shipping_released != shipped。
- shipment_release done -> shipping_released。
- sales_order 是 Source Document。
- shipment 才是未来出货事实。
- inventory_txns 才是库存落账事实。

不得建议从 current 资料或 business_records 自动生成：

- shipments
- stock_reservations
- inventory_txns
- AR/AP
- invoice
- payment

---

## Sales Order / Shipment 边界

import draft 不得建议：

- markAsShipped
- shipSalesOrder
- reserveStock
- deductInventory
- generateInvoice
- generateReceivable
- receivePayment

不得建议从 Excel / PDF / business_records 自动生成：

- shipments
- stock_reservations
- inventory_txns
- AR/AP
- invoice
- payment

---

## tenant_id 规则

本轮禁止新增 tenant_id。

如果 grep 命中 tenant_id，必须解释是否只来自：

- imported notes
- 禁止说明
- future SaaS 评审候选说明
- current 不是 runtime tenant 说明

不得进入：

- schema
- runtime
- migration
- import target
- data mapping target
- unresolved queue target

---

## 测试分层选择

本轮必须选择测试层级。

### 静态检查

选择：是。

原因：

本轮改文档，需要检查 diff、格式、边界词和禁止项。

命令：

    git status --short
    git diff --stat
    git diff --check
    git ls-files --others --exclude-standard

### 单元测试

选择：否。

原因：

本轮 docs-only，不改代码。

### 集成测试

选择：否。

原因：

本轮 docs-only，不改 API/repo/usecase/DB。

### 冒烟测试

选择：否。

原因：

本轮不改运行入口或前端页面。

### 回归测试

选择：有限选择。

原因：

如果只改 docs/customers 和 docs/product，不需要跑前后端全量；如果误改 web/docs registry，则必须停止。

### E2E 测试

选择：否。

原因：

本轮不改 UI 或用户路径。

### 视觉 / 样式回归

选择：否。

原因：

本轮不改 UI / 样式。

---

## 验收命令

必须运行：

    git status --short
    git branch --show-current
    git log --oneline -3
    git diff --stat
    git diff --check
    git ls-files --others --exclude-standard

必须运行来源检查命令：

    grep -R "Excel\|PDF\|加工合同\|材料\|订单\|供应商\|客户\|仓库\|seed\|demo\|business_records\|businessRecords\|BusinessRecord" docs/customers web/src/erp/config docs/product -n || true

必须运行边界检查：

    grep -R "tenant_id" docs/customers docs/product docs/architecture docs/reference config deployments || true
    grep -R "shipping_released" docs/customers docs/product docs/architecture docs/reference || true
    grep -R "shipped_quantity\|shipment_id\|inventory_txn_id\|invoice_id\|payment_id\|ar_id\|ap_id\|product_sku_id" docs/customers docs/product docs/architecture || true
    grep -R "markAsShipped\|shipSalesOrder\|reserveStock\|deductInventory\|generateInvoice\|generateReceivable\|receivePayment" docs/customers docs/product docs/architecture || true
    grep -R "ChangeUsecase\|change_records" docs/customers docs/product docs/architecture || true

不得运行：

    cd server && make data
    cd server && make migrate_status

不得运行前端测试，除非本轮意外改了前端文件；如果改了前端文件，必须停止并报告。

不得运行后端测试，除非本轮意外改了后端文件；如果改了后端文件，必须停止并报告。

---

## 需要更新的已有文档

允许小幅更新：

### docs/current-source-of-truth.md

必须写清：

current customer import dry-run draft has been added.
No runtime, API, UI, seedData, docs registry, migration, schema, import/backfill, or real data migration has been implemented.

### docs/customers/current/README.md

可以增加链接到：

- import-source-inventory.md
- import-field-classification.md
- import-dry-run-plan.md
- import-unresolved-queue.md
- import-acceptance-checklist.md

但不得写成真实导入已完成。

### progress.md

记录本轮：

010 current customer import dry-run draft completed.
No runtime / schema / migration / API / UI / seedData / docs registry / import/backfill changes.

如果本轮中止，记录中止原因。

### docs/product/v1-next-codex-goals.md

可以更新下一轮建议：

- V1 menu entry review
- current customer import loader design
- true import dry-run tooling

但不得把下一轮写成已完成。

### docs/product/v1-schema-go-no-go.md

可以更新：

010 current customer import dry-run draft added

但不得把 real import / migration / loader 写成完成。

---

## 项目长期禁止项

必须遵守：

- 不新增 tenant_id。
- 不实现 SaaS 多租户。
- 不实现 license server、套餐计费、客户工单系统。
- 不创建泛化 ChangeUsecase。
- 不创建泛化 change_records。
- 不把 current 客户资料写成 Product Core。
- 不让 WorkflowUsecase 写库存、出货、财务、应收、应付、发票、收付款事实。
- shipping_released != shipped。
- workflow task done != fact posted。
- business_records 是兼容层、demo、seed、source snapshot、调研入口，不是长期事实真源。

---

## 审查报告要求

本轮完成后必须生成：

.codex-review/latest.md

审查报告必须遵守：

docs/codex-goals/_review-output-protocol.md

用户必须能用下面命令复制：

    cat .codex-review/latest.md | pbcopy

不要要求用户截图。

---

## 最终回复格式

Codex 最终回复必须包含：

【完成】

【新增/修改文件】

【本轮改动范围】

【current 导入来源清单摘要】

【字段分类摘要】

【dry-run plan 摘要】

【unresolved queue 摘要】

【acceptance checklist 摘要】

【明确没有做的内容】

【禁止路径检查】

【tenant_id 处理结论】

【Workflow / Fact 边界检查】

【测试层级选择】

【测试命令与结果】

【停止条件是否触发】

【Git 状态摘要】

【风险】

【下一轮 Codex Goal 建议】

【.codex-review/latest.md 复制命令】

    cat .codex-review/latest.md | pbcopy

## 完成后给 GPT 的复盘材料

.codex-review/latest.md 必须包含：

- git status --short
- git diff --stat
- git ls-files --others --exclude-standard
- current 导入来源清单摘要
- 字段分类摘要
- dry-run plan 摘要
- unresolved queue 摘要
- acceptance checklist 摘要
- tenant_id grep 解释
- shipping_released grep 解释
- forbidden action grep 解释
- 禁止路径检查
- 测试层级选择
- 测试命令和结果
- 下一轮建议
```

### 101. user

_time `2026-05-31T13:43:27+08:00` · content_type `text` · node `74fb8bd8-2a4c-45d2-8d7d-c8d2352c2fc6`_

_（空消息）_

### 102. assistant

_time `2026-05-31T13:43:29+08:00` · content_type `text` · node `4246099d-880c-424e-839e-15a587f4ce19`_

010 我判断：**本轮目标合格，但进入下一轮前要先处理“并行改动污染工作区”的问题。**

010 本身是合格的：它只做了 current 客户导入 dry-run / 字段分类 / unresolved queue 的文档草案，没有改 runtime、schema、migration、API、UI、docs registry、seedData，也没有写 import/backfill code 或执行真实数据迁移；新增了 7 份导入相关文档，并小幅更新 current 资料索引、V1 go/no-go、后续 Goal 和 `progress.md`。fileciteturn15file0

但有一个流程风险比较明显：010 执行期间出现了**非本轮 / 并行改动**，包括：

```text
D docs/changes/*
M web/src/erp/api/masterDataOrderApi.test.mjs
并行提交 10c9607 docs: 清理无效文档入口
```

报告也明确这些不是本轮操作。fileciteturn15file0 所以现在不建议直接继续 011。先把工作区归属理清楚，否则后面 Codex 可能会把非本轮改动一起带进下一轮判断。

---

## 当前进度判断

现在主线已经做到：

```text
003 Ent schema
004 Ent generate + migration
005 MasterData repo/usecase
006 SalesOrder repo/usecase
007 API/RBAC
008 Frontend pages
009 business_records transition audit
010 current customer import dry-run draft
```

这意味着：

```text
V1 customers / suppliers / contacts / sales_orders / sales_order_items
已经从 schema -> migration -> repo/usecase -> API/RBAC -> frontend pages 跑通了一个最小产品闭环。
```

但仍未完成：

```text
business_records 实际只读化 / 入口切换
current 客户真实导入工具
真实 import dry-run 执行
真实后端 + DB E2E
shipment / inventory / finance facts
production / outsourcing facts
```

---

## 010 是否可以接受

可以接受。

理由：

```text
1. 范围是 docs-only，实际也只是 docs-only。
2. 没有改 seedData、docs registry、business_records runtime。
3. 没有写 import/backfill code。
4. 没有自动生成 shipment / inventory / finance facts。
5. 已经把 current 字段分类、dry-run、unresolved queue、acceptance checklist、风险登记都补上。
```

唯一不舒服的点不是 010 内容，而是：

```text
执行期间出现并行提交和非本轮工作区改动。
```

---

## 下一步不要马上做什么

现在不要马上做：

```text
真实 import loader
真实 backfill
seedData 改造
docs registry 改造
前端菜单重构
business_records 删除
business_records 双写
shipment / inventory / finance
```

也不要让 Codex 在当前工作区混着做 011，除非先确认这些并行改动的归属。

---

## 现在建议先做一个很小的整理任务

我建议下一轮先不是业务功能，而是：

```text
011-workspace-boundary-checkpoint
```

目的：

```text
确认 010 后工作区哪些改动属于 010
哪些属于并行提交 / 其他会话
哪些应该保留
哪些应该单独处理
哪些不能带入下一轮
```

这轮只做审计报告，不改代码，不回退，不删除，不提交。

你可以先手动跑：

```bash
git status --short
git log --oneline -5
git diff --name-status
git ls-files --others --exclude-standard
```

如果你确认 `docs/changes/*` 删除和 `masterDataOrderApi.test.mjs` 修改都是你认可的，那也可以直接继续。但我更建议让 Codex 先做一次 checkpoint，避免下一轮混乱。

---

## 业务下一步二选一

等工作区干净或归属明确后，有两个合理方向：

### 方向 A：current-customer-import-loader-design

这个是 010 报告建议的下一步。它仍然是 docs-only，设计真实导入工具之前的：

```text
备份
回滚
幂等
对账
source reference
usecase 边界
dry-run 输出格式
unresolved queue 数据结构
```

不写代码。

### 方向 B：V1 menu entry review

这个更贴近你前面问的“是不是还没到菜单重构”。可以先评审：

```text
V1 页面怎么进入菜单
旧 business_records 入口怎么标记
哪些入口保留
哪些入口只读
哪些入口不动
seedData / businessModules / businessRecordDefinitions 是否要改
```

我倾向：**先做 workspace checkpoint，再做 V1 menu entry review 或 import loader design。**

如果你现在更想推进给甲方试用，优先做：

```text
V1 menu entry review
```

如果你更想准备真实数据落地，优先做：

```text
current-customer-import-loader-design
```

---

## 我的推荐顺序

```text
011-workspace-boundary-checkpoint
012-v1-menu-entry-review
013-current-customer-import-loader-design
014-current-customer-import-dry-run-tooling
```

当前最小安全下一步是：

```text
011-workspace-boundary-checkpoint
```

这样先把并行改动和 010 产物分清楚，再继续业务。

### 103. user

_time `2026-05-31T21:30:24+08:00` · content_type `text` · node `9b27e988-4573-41ef-ab59-bc5b7f8b754d`_

你再列出表格给我，对齐一下需求先，从这个会话的开头开始你审查下我的需求讨论先

### 104. assistant

_time `2026-05-31T21:30:25+08:00` · content_type `text` · node `5573d401-87e5-46fe-9c51-f6c00cfcd594`_

可以。下面我按**从本会话开头到现在**，把你一路讨论出来的需求、我理解到的边界、当前实现进度、仍未对齐的问题重新梳理成表格。重点不是“代码做了多少”，而是先把**需求口径**对齐，避免后面 Codex 继续做偏。

当前事实状态我参考了最近几轮 Codex 审查报告：008 已完成 V1 前端页面和路由，但未做 `business_records` transition；009 已完成 `business_records` 过渡审计；010 已完成 current 客户导入 dry-run / 字段分类 / unresolved queue 草案，但没有写真实导入代码，也没有改 runtime/schema/API/UI。fileciteturn13file0 fileciteturn14file0 fileciteturn15file0

---

# 1. 本会话需求主线总览

| 序号 | 你最初/过程中表达的需求 | 当前对齐后的理解 | 当前处理状态 | 后续注意 |
|---:|---|---|---|---|
| 1 | 这是毛绒玩具 ERP，不是一次性外包 | 要做行业 ERP 产品内核，先服务 current 甲方，后续卖给同行 | 已形成产品化路线 | 不能把 current 甲方资料直接写成 Product Core |
| 2 | 当前先帮一个甲方落地，未来可能成合伙人 | current 是种子客户 / 第一个私有化客户实例 | 已对齐 | current 不是 runtime tenant |
| 3 | 不要提前 SaaS 多租户 | 当前不做 `tenant_id`、license、套餐、工单 | 已写入所有 Goal 禁止项 | 未来 SaaS 单独评审 |
| 4 | 通用产品内核 + 受控客户差异 | 一套产品代码，多客户配置包，每客户独立部署/数据库/初始化数据 | 已形成 docs/product 设计 | 还没真正实现配置 loader |
| 5 | Workflow 和 Fact 不能混 | Workflow 管协同，Fact 管库存/出货/财务落账 | 已形成核心边界 | 后续 shipment/finance 时继续严守 |
| 6 | 起步阶段可以大重构 | 已用 Phase 0 方式搭了架构/文档/目录骨架 | 已完成基础骨架 | 没有一次性大爆炸写业务 |
| 7 | 不要只做文档，要推进实现 | 已从 schema → migration → repo/usecase → API/RBAC → UI 推到 V1 最小闭环 | 已完成 V1 主数据/销售订单雏形 | 还不是订单到出货闭环 |
| 8 | Codex Goal 要中文、可复制、短 Goal + md | 已建立 Codex 工作流 | 已执行多轮 | 后续继续用这个模式 |
| 9 | Codex 每轮输出不要截图 | 要生成 `.codex-review/latest.md` | 已执行 | 新 GPT 会话至少贴 latest.md |
| 10 | 要防止信息差 | 建立 current-source、progress、review、context summary | 已建立流程 | 工作区并行改动要先 checkpoint |

---

# 2. 产品定位需求对齐表

| 维度 | 当前结论 | 已确认程度 | 当前实现/文档状态 | 仍需确认 |
|---|---|---:|---|---|
| 产品类型 | 毛绒玩具行业 ERP 产品内核 | 高 | docs/product 已有产品化原则 | 是否未来扩展到相近轻工行业 |
| 第一客户 | current 甲方 | 高 | docs/customers/current 已建立 | current 的真实公司名/部署标识可后续配置 |
| 交付形态 | 先私有化部署，不做 SaaS | 高 | config/customers/current、deployments/current 已建 | 未来多客户部署包结构细化 |
| 多客户策略 | 一套产品代码 + 多客户配置包 | 高 | customer-instance-policy / delta-policy 已有 | 配置 loader 尚未实现 |
| 客户扩展 | 极少数客户专属扩展 | 中 | 只在设计中保留 | 什么时候允许 extension 还需准入标准 |
| 商业化方向 | SaaS / 私有化均可，先私有化 | 高 | 三阶段路线已定 | SaaS 阶段再评审 tenant_id / 计费 / 授权 |

---

# 3. 当前甲方 / current 客户需求对齐表

| 问题 | 当前结论 | 为什么这样定 | 后续做法 |
|---|---|---|---|
| current 算不算租户？ | 业务/交付口径算客户实例；runtime 口径不算租户 | 当前不做 SaaS 多租户 | 用 `customer_key=current` / 配置包管理，不加 `tenant_id` |
| current 资料是不是产品真源？ | 不是 | 一个甲方样本不能变成全行业规则 | 先归类为 Customer Material / Data Import Source |
| current Excel/PDF/截图怎么用？ | 作为需求线索、字段线索、导入来源、打印模板输入 | 防止硬编码客户字段 | 010 已做 import source / field classification 草案 |
| current 的特殊字段怎么办？ | 先进入 unresolved queue 或 Customer Config | 未确认前不能进 Product Core | 后续 dry-run 输出“需人工确认” |
| current 数据要不要真实导入？ | 还没到真实导入 | 010 只是 dry-run 草案 | 后续先做 loader design，再做 dry-run tooling |

---

# 4. Workflow / Fact 分层需求对齐表

| 层 | 当前定义 | 已完成内容 | 未完成内容 | 禁止事项 |
|---|---|---|---|---|
| Workflow 协同层 | 谁处理、谁审批、任务是否 done/blocked | 既有 workflow rules；边界文档已明确 | 后续任务与事实 usecase 的桥接 | 不写库存/出货/财务事实 |
| 单据生命周期层 | 单据走到哪个业务阶段 | `sales_order.lifecycle_status` 已落并接 usecase/UI | 后续 production/shipment/finance 单据生命周期 | 不用一个大 status 混所有状态 |
| 业务事实层 | 真实发生、可追溯、可审计 | 既有 inventory/purchase/quality facts；V1 sales_order 不是 fact | shipment、stock_reservation、finance、production、outsourcing facts | 不从 workflow done 伪造事实 |
| 派生状态层 | 从事实计算出来的结果 | 销售订单暂未落 shipped/fulfillment | 后续从 shipment facts 推导 fulfillment | 不人工维护 shipped_quantity 伪事实 |
| 系统横切状态 | 幂等、导入、同步、任务状态 | 设计文档有原则 | import dry-run / loader 的幂等未实现 | 不把系统状态当业务事实 |

---

# 5. V1 主数据 / 订单实现进度表

| 模块 | Schema | Migration/Generate | Repo/Usecase | API/RBAC | Frontend | 当前状态 |
|---|---:|---:|---:|---:|---:|---|
| customers | 已完成 | 已完成 | 已完成 | 已完成 | 已完成 | V1 最小闭环完成 |
| suppliers | 已完成 | 已完成 | 已完成 | 已完成 | 已完成 | V1 最小闭环完成 |
| contacts | 已完成 | 已完成 | 已完成 | 已完成 | 已完成 | V1 最小闭环完成，owner guard 已补 |
| sales_orders | 已完成 | 已完成 | 已完成 | 已完成 | 已完成 | Source Document 闭环完成 |
| sales_order_items | 已完成 | 已完成 | 已完成 | 已完成 | 已完成 | 承诺明细闭环完成 |
| product_skus | Draft Only | 未做 | 未做 | 未做 | 未做 | 暂不做 |
| purchase_orders | Draft Only / V2 | 未做 | 未做 | 未做 | 未做 | 暂不做 |
| shipments | Deferred | 未做 | 未做 | 未做 | 未做 | 后续出货事实阶段 |
| stock_reservations | Deferred | 未做 | 未做 | 未做 | 未做 | 后续库存预留阶段 |
| finance facts | Deferred | 未做 | 未做 | 未做 | 未做 | 后续财务阶段 |

---

# 6. 从 003 到 008 的实现链路表

| Goal | 做了什么 | 明确没做什么 | 当前评价 |
|---|---|---|---|
| 003 | 新增 5 个 Ent schema | 不 generate、不 migration、不 runtime | 合格 |
| 004 | Ent generate + Atlas migration | 不 repo/usecase、不 API/UI | 合格，但目标库 migration 仍 pending |
| 005 | customers/suppliers/contacts repo/usecase | 不 API/UI，不 sales order | 合格 |
| 006 | sales_orders/items repo/usecase | 不 shipment/inventory/finance | 合格 |
| 007 | JSON-RPC API + RBAC | 不 UI，不 business_records transition | 合格 |
| 008 | V1 前端页面 + route | 不 seedData，不 docs registry，不 business_records transition | 合格 |
| 009 | business_records 过渡审计 | 不删、不迁移、不改 runtime | 合格 |
| 010 | current 数据导入 dry-run 草案 | 不写 loader、不迁移、不改 seedData | 合格但有并行改动污染工作区 |

---

# 7. business_records 需求对齐表

| 问题 | 当前结论 | 当前状态 | 后续建议 |
|---|---|---|---|
| business_records 要不要删？ | 现在不删 | 009 明确保留为兼容层 | 后续分阶段只读 / demo / deprecated |
| business_records 是否是真源？ | 不是长期事实真源 | 已写入多份文档 | 新业务不要继续加到重叠旧入口 |
| partners 旧入口怎么办？ | 与 customers/suppliers/contacts 重叠 | 已审计 | 后续 menu entry review / read-only |
| project-orders 旧入口怎么办？ | 与 sales_orders 重叠 | 已审计 | 后续逐步引导到 V1 |
| products 旧入口怎么办？ | 可能与现有 products schema 重叠 | 已列风险 | 不要自动生成 product_skus |
| 是否做数据迁移？ | 当前不做，只做 dry-run / mapping | 010 已做草案 | 后续 loader design，再 dry-run tooling |
| 是否双写？ | 禁止 | 已明确 | 后续任何迁移都禁止双写 |

---

# 8. current 数据导入需求对齐表

| 项 | 当前结论 | 010 结果 | 后续 |
|---|---|---|---|
| 导入来源清单 | 需要 | 已完成 import-source-inventory | 后续按真实文件/seed 补充 |
| 字段分类 | 需要 | 已完成 import-field-classification | 后续人工确认 |
| dry-run plan | 需要 | 已完成 | 后续 loader design |
| unresolved queue | 需要 | 已完成 | 后续做工具时必须落 |
| acceptance checklist | 需要 | 已完成 | 后续真实导入前必用 |
| 是否写 import loader | 现在不写 | 未写 | 下一阶段先 design |
| 是否真实导入 | 现在不导入 | 未导入 | 需备份/回滚/审批 |
| 是否生成事实 | 禁止 | 已明确禁止 | shipment/inventory/finance 后续独立做 |

---

# 9. 前端菜单 / 页面重构需求对齐表

| 问题 | 当前结论 | 理由 | 后续 |
|---|---|---|---|
| 现在是否重构全局菜单？ | 还不是时候 | business_records transition 未收口 | 先做 menu entry review |
| 现在是否删除旧页面？ | 不删除 | 旧入口仍可能承载 demo/source snapshot | 后续审计后只读/废弃 |
| V1 页面是否已存在？ | 已存在 | 008 已新增页面和路由 | 但未接正式菜单入口 |
| 是否改 seedData？ | 现在不改 | 防止影响旧 QA / demo / 菜单 | 单独 Goal 评审 |
| 是否改 docs registry？ | 现在不改 | docs registry 和业务入口不是一回事 | 后续单独处理 |
| 是否可以让甲方试 V1 页面？ | 可以，但入口可能需直链 | 路由已存在 | 先明确不是完整出货闭环 |

---

# 10. 后续未完成大模块表

| 模块 | 当前状态 | 前置条件 | 备注 |
|---|---|---|---|
| V1 menu entry review | 未做 | 009 / 010 已完成 | 建议较快做 |
| current import loader design | 未做 | 010 已完成 | 仍 docs-only，不写代码 |
| current import dry-run tooling | 未做 | loader design 完成 | 可写工具，但不真实导入 |
| business_records read-only/demo mode | 未做 | transition audit 完成 | 不能直接删 |
| product_skus | Draft Only | 需产品/SKU/BOM 再评审 | 不因颜色字段自动做 |
| purchase_orders | Draft/V2 | 需采购承诺评审 | 不替代 purchase_receipts |
| shipment facts | Deferred | 需 ShipmentUsecase 评审 | `shipping_released != shipped` |
| stock_reservations | Deferred | 需 shipment/inventory boundary | 后续库存预留 |
| finance facts | Deferred | 需 shipped/receipt/settlement 口径 | 不能从放行生成应收 |
| production facts | Deferred | 需生产评审 | 生产领料/成品入库 |
| outsourcing facts | Deferred | 需委外评审 | 委外发料/回货/结算 |

---

# 11. 当前风险表

| 风险 | 当前表现 | 影响 | 建议处理 |
|---|---|---|---|
| 并行改动污染工作区 | 010 报告出现 docs/changes 删除、web test 修改、并行提交 | 后续 diff 难判断 | 先做 workspace checkpoint |
| business_records 双真源 | V1 页面已存在，旧入口也存在 | 用户可能继续用旧入口 | 做 menu entry / read-only 评审 |
| current 字段污染 Product Core | current 导入资料很多 | 可能把甲方字段写成通用字段 | 继续用 field classification |
| 没有真实 E2E | 目前多为单测/mock route render | 真实环境可能有 API/DB 问题 | 后续 migration apply + smoke |
| 目标库 migration pending | 004 生成但未 apply | 真实 API 接数据库可能表不存在 | 发布/试用前单独 apply/check |
| sales_order 被误当出货事实 | 页面已出现销售订单 | 甲方可能以为已出货闭环 | UI/文档继续标明不是 shipment |
| 产品/单位 ID 输入 | 008 暂未做选择器 | 业务可用性弱 | 后续接产品/单位 selector |

---

# 12. 当前推荐下一步路线

我建议后续顺序调整为：

```text
011-workspace-boundary-checkpoint
012-v1-menu-entry-review
013-current-customer-import-loader-design
014-current-customer-import-dry-run-tooling
015-business-records-readonly-demo-mode-review
```

如果你想更快给甲方看系统，可优先：

```text
011-workspace-boundary-checkpoint
012-v1-menu-entry-review
```

如果你想更快准备真实数据落地，可优先：

```text
011-workspace-boundary-checkpoint
013-current-customer-import-loader-design
```

---

# 13. 是否现在继续做功能？

当前不建议直接继续写大业务功能。

不建议现在直接做：

```text
shipment
inventory reservation
finance
production
outsourcing
真实 import loader
真实数据迁移
前端菜单大重构
删除 business_records
```

建议先做：

```text
workspace checkpoint
V1 menu entry review
import loader design
```

原因：

```text
V1 最小链路已经到了 UI
旧入口和新入口需要收口
current 数据导入路径需要先设计
工作区并行改动需要理清
```

---

# 14. 当前阶段一句话结论

目前已经完成：

```text
V1 customers / suppliers / contacts / sales_orders / sales_order_items
从 schema -> migration -> repo/usecase -> API/RBAC -> 前端页面
```

接下来不该立刻冲 shipment/finance，而应该先收口：

```text
business_records 过渡
current 数据导入 dry-run
V1 菜单入口
工作区边界
```

最小安全下一步：

```text
先做 workspace-boundary-checkpoint
再做 v1-menu-entry-review 或 current-customer-import-loader-design
```
```

### 105. user

_time `2026-05-31T21:41:14+08:00` · content_type `text` · node `4b96c1b9-e58a-489f-b218-b4aab4a188b1`_

不要列当前做没做，而是列从一开始到产品完善的所有过程和结果

### 106. assistant

_time `2026-05-31T21:41:16+08:00` · content_type `text` · node `6f0a0075-6b64-489b-8dae-a06188b642ae`_

明白。你要的不是“现在完成了哪些”，而是：**从项目一开始，到产品真正完善、可交付、可复制卖给多个甲方，中间完整要经历哪些过程，以及每个过程最终应该产出什么结果。**

下面我按“产品从 0 到成熟”的全流程列，不再重点写当前做没做。当前 003~010 的状态只作为我们已经走到中间某一步的背景：目前 V1 主数据和销售订单已经走过 schema → migration → repo/usecase → API/RBAC → 前端页面，009/010 已做 business_records 和 current 导入草案，但业务事实层还没做出货、库存预留、财务、生产、委外等闭环。fileciteturn13file0turn14file0turn15file0

---

# 1. 总体路线总表：从 0 到产品完善

| 阶段 | 过程目标 | 最终结果 | 关键产物 | 不该做的事 |
|---:|---|---|---|---|
| 0 | 明确产品定位 | 确认这是毛绒玩具行业 ERP 产品内核，不是一次性外包 | 产品原则、客户定位、长期边界 | 不急着写业务代码 |
| 1 | 整理甲方资料 | 把模糊资料变成需求线索、假设、问题、决策 | source materials、question backlog、decision log | 不把甲方样本直接写成通用规则 |
| 2 | 建立产品化分层 | 确认 Product Core / Industry Template / Customer Config / Extension | 产品分层文档、配置边界 | 不做 SaaS 多租户 |
| 3 | 建立状态和事实边界 | 区分 Workflow、单据生命周期、业务事实、派生状态 | Workflow/Fact 边界文档 | 不把 workflow done 当业务完成 |
| 4 | 确定 V1 主链路范围 | 确定第一版只打通什么，不做什么 | V1 cutline、Go / Draft / Deferred 清单 | 不把 ERP 全部模块一次做完 |
| 5 | 建立主数据基础 | 客户、供应商、联系人、产品、材料、单位、仓库等稳定 | MasterData schema / usecase / API / UI | 不重复设计已有主数据 |
| 6 | 建立源单据 | 销售订单、BOM、采购单等表达业务承诺 | Source Document 模型 | 不把源单据当事实落账 |
| 7 | 建立采购 / 质检 / 库存事实 | 入库、退货、调整、质检、批次、库存流水稳定 | inventory_txns、lots、balances、quality_inspections | 不让客户配置库存核心规则 |
| 8 | 建立生产 / 委外事实 | 生产领料、成品入库、委外发料、委外回货、返工 | production / outsourcing facts | 不只靠 workflow 状态表示生产完成 |
| 9 | 建立出货事实 | 出货放行、预留、拣货、实际出库分开 | shipments、shipment_items、stock_reservations、outbound txns | 不把 shipping_released 当 shipped |
| 10 | 建立财务事实 | 应收、应付、发票、收付款、对账 | AR/AP/invoice/payment/reconciliation | 不从订单或放行直接生成财务事实 |
| 11 | 建立权限职责体系 | 菜单权限、动作权限、工作流职责、数据范围清楚 | RBAC、Feature Flag、Data Scope | 不只做菜单隐藏 |
| 12 | 建立前端岗位入口 | 桌面端 + 手机端，按岗位和任务驱动 | V1 pages、mobile roles、task entry | 不让菜单看起来比能力更成熟 |
| 13 | 处理旧兼容层 | business_records 降级为兼容 / demo / source snapshot | transition audit、cutover plan、read-only/demo plan | 不直接删除旧入口 |
| 14 | current 数据导入 | 当前甲方数据 dry-run、人工确认、受控导入 | import dry-run、unresolved queue、loader、acceptance report | 不自动生成出货/库存/财务事实 |
| 15 | 客户试点上线 | current 甲方可真实试用主链路 | 私有化部署、迁移、备份、培训、试运行 | 不无备份上线 |
| 16 | 交付运维体系 | 多客户私有化部署可复制 | deployment package、release checklist、backup/restore | 不每客户 fork 一套代码 |
| 17 | 行业模板沉淀 | 将多个客户共性沉淀成毛绒玩具行业模板 | roles、menus、fields、print templates、numbering | 不把单一客户特殊项变默认 |
| 18 | 多客户复制 | 第二、第三个客户能快速部署 | customer config package、import adapter、deployment notes | 不做长期分叉 |
| 19 | 产品成熟 | 核心业务闭环、数据可信、权限清楚、可交付可维护 | 版本化产品、回归测试、客户升级机制 | 不急着 SaaS |
| 20 | SaaS 评审 | 只有私有化多客户成熟后才评审 SaaS | tenant_id、隔离、计费、授权、运营后台设计 | 不提前污染当前 schema |

---

# 2. 产品从 0 到 1 的过程与结果

| 步骤 | 过程 | 目标 | 结果产物 | 验收方式 |
|---:|---|---|---|---|
| 1 | 收集甲方所有资料 | 把“模糊需求”变成可分析资料 | source-materials.md | 所有资料都有来源、类型、用途 |
| 2 | 建立需求线索台账 | 抽出业务线索，不直接开发 | requirement-clues.md | 每条线索有来源和待确认问题 |
| 3 | 建立假设台账 | 把推测和事实分开 | assumption-register.md | 每个假设都有风险和确认问题 |
| 4 | 建立问题清单 | 用业务语言问甲方 | question-backlog.md | 问题按岗位/业务域分类 |
| 5 | 建立决策日志 | 记录已经确认的东西 | decision-log.md | 只记录已确认，不写猜测 |
| 6 | 建立客户差异台账 | 区分客户配置、模板、核心能力 | delta-register.md | 每个差异都有分类 |
| 7 | 建立配置草案 | current 客户未来配置包 | customer-config-draft.md | 配置项不侵入 Product Core |
| 8 | 建立产品原则 | 防止项目变定制外包 | product-principles.md | 明确一套内核、多配置包 |
| 9 | 建立状态边界 | 防止 Workflow / Fact 混淆 | status-workflow-fact-boundary.md | 口诀和禁止项清楚 |
| 10 | 建立 V1 cutline | 明确第一版做什么 | v1-implementation-cutline.md | Go / Draft / Deferred 清楚 |

最终结果：

```text
项目从“甲方给了一堆模糊资料”
变成“有产品定位、有客户边界、有状态边界、有 V1 范围、有可执行 Goal 队列”。
```

---

# 3. 主数据建设全过程

| 业务对象 | 建设过程 | 最终结果 | 典型字段/能力 | 后续扩展 |
|---|---|---|---|---|
| customers | 评审 → schema → migration → repo/usecase → API/RBAC → UI | 正式客户主数据 | code、name、short_name、tax_no、is_active | 地址、账期、信用额度 |
| suppliers | 评审 → schema → migration → repo/usecase → API/RBAC → UI | 正式供应商主数据 | code、name、supplier_type、is_active | 供应物料档案、结算资料 |
| contacts | 评审 → schema → migration → repo/usecase → API/RBAC → UI | 客户/供应商联系人 | owner_type、owner_id、primary contact | 联系人权限、通知配置 |
| products | 复用已有真源 | 产品主数据 | code、name、category | SKU、图片、客户款号 |
| materials | 复用已有真源 | 材料主数据 | code、name、unit、spec | 替代料、供应商报价 |
| units | 复用已有真源 | 单位主数据 | code、name | 换算关系 |
| warehouses | 复用已有真源 | 仓库主数据 | code、name、type | 库位、仓区 |
| product_skus | 暂缓，先评审 | 后续 SKU 模型 | 色号、尺寸、版本 | 不能因 Excel 有颜色就直接落 |

最终结果：

```text
ERP 有稳定主数据根基。
业务单据引用主数据，而不是把客户、供应商、产品、材料散落在文本字段里。
```

---

# 4. 销售订单 Source Document 建设全过程

| 阶段 | 过程 | 最终结果 | 关键边界 |
|---|---|---|---|
| 评审 | 明确 sales_order 是业务承诺 | 不把销售订单当出货事实 | Source Document ≠ Fact |
| Schema | 建 sales_orders / sales_order_items | 有正式订单源单据 | 不加 shipped_quantity |
| Migration | 生成表和索引 | DB 可承载订单 | 不生成 shipment / finance |
| Repo/Usecase | 建订单生命周期和行操作 | 可创建、编辑、提交、激活、关闭、取消 | 不写库存 |
| API/RBAC | 暴露后端接口和权限 | 后端可安全调用 | 后端校验权限 |
| UI | 建销售订单页面 | 用户可录订单和明细 | UI 不显示 shipped |
| 后续 | 与 shipment 事实衔接 | 从真实出货推导履约 | 不从订单伪造出货 |

销售订单当前生命周期：

```text
draft -> submitted -> active -> closed
draft / submitted / active -> canceled
```

最终结果：

```text
系统有正式销售订单，但它只代表业务承诺。
真实出货、库存扣减、应收开票还要后续独立事实层实现。
```

---

# 5. Workflow 协同层全过程

| 阶段 | 过程 | 结果 | 禁止事项 |
|---|---|---|---|
| 任务定义 | 定义老板审批、IQC、入库、出货放行等任务 | 有协同节点 | 不直接写事实 |
| 状态定义 | pending / done / blocked / canceled | 有 workflow task 状态 | 不混成订单状态 |
| 规则后端化 | done / blocked / rejected 有规则 | 协同状态可推进 | 不跳过 usecase |
| reason 校验 | blocked 必须有 reason | 阻断可解释 | 空 reason 无效 |
| 幂等 | 重复回调不重复推进 | 防重复动作 | 不重复写事实 |
| 终态保护 | settled 后不再触发 | 保护终态 | 不二次放行 |
| 与 Fact 衔接 | Workflow 只给许可 | 后续 fact usecase 写事实 | 不由 workflow 写库存/财务 |

典型边界：

```text
shipment_release done -> shipping_released
shipping_released != shipped
```

最终结果：

```text
Workflow 成为任务协同和许可层，而不是库存、出货、财务事实层。
```

---

# 6. 采购 / 质检 / 库存事实全过程

| 阶段 | 过程 | 最终结果 | 关键边界 |
|---|---|---|---|
| 采购承诺 | purchase_orders 评审 | 采购订单表达承诺 | 不等于入库 |
| 采购入库 | purchase_receipts | 采购入库事实 | 入库后才影响库存 |
| 采购退货 | purchase_returns | 退货事实 | 写库存出向流水 |
| 入库调整 | purchase_receipt_adjustments | 调整事实 | 不直接改余额 |
| 质检 | quality_inspections | 批次质检事实 | task done 不等于 passed |
| 批次 | inventory_lots | 可追溯批次 | 批次状态受控 |
| 库存流水 | inventory_txns | 库存真实变化 | 事实不可随便删 |
| 库存余额 | inventory_balances | 查询缓存/余额 | 从流水派生或维护 |
| 可用量 | on_hand - reserved - frozen | 支撑出货/预留 | 不等同总库存 |

最终结果：

```text
库存可信：所有库存变化都有来源单据、流水、批次和可追溯状态。
```

---

# 7. 生产 / 委外全过程

| 模块 | 建设过程 | 最终结果 | 注意边界 |
|---|---|---|---|
| production_orders | 评审 → schema → usecase → UI | 生产任务 / 生产单 | 不代表已领料 |
| material_issue | 生产领料事实 | 材料库存扣减 | 必须写 inventory_txns |
| finished_goods_receipt | 成品入库事实 | 成品库存增加 | 不等于 workflow done |
| rework | 返工事实 | 可追溯返工 | 不能只改状态 |
| outsource_orders | 委外承诺 | 委外加工单 | 不代表发料 |
| outsource_issue | 委外发料事实 | 材料转出/占用 | 要写库存事实 |
| outsource_receipt | 委外回货事实 | 回货记录 | 可能进入质检 |
| outsource_settlement | 委外结算 | 委外应付依据 | 不直接从 workflow 生成 |

最终结果：

```text
生产和委外不只是“任务状态”，而是有真实领料、回货、入库、返工、结算事实。
```

---

# 8. 出货全过程

| 阶段 | 过程 | 最终结果 | 禁止混淆 |
|---|---|---|---|
| 出货放行 | shipment_release workflow | shipping_released | 不是已出库 |
| 出货计划 | shipments draft | 出货计划单 | 不扣库存 |
| 库存预留 | stock_reservations | 锁定可用库存 | 不等于出库 |
| 拣货 | picking | 仓库操作过程 | 不等于 shipped |
| 实际出库 | shipment shipped + inventory_txns OUT | 出货事实完成 | shipped 才是真出货 |
| 订单履约 | 从 shipment facts 汇总 | partial / full shipped | 派生状态 |
| 异常处理 | 取消/释放/冲正 | 可回滚可追溯 | 不直接删事实 |

最终结果：

```text
出货可信：放行、预留、拣货、出库、库存扣减是分开的。
```

---

# 9. 财务全过程

| 阶段 | 过程 | 最终结果 | 关键口径 |
|---|---|---|---|
| 应收草案 | 从真实出货或对账生成 | AR draft | 不从 shipping_released 生成 |
| 应付草案 | 从采购入库/委外结算/对账生成 | AP draft | 不从采购订单直接生成 |
| 发票 | invoice issued | 开票事实 | 可作废/冲正 |
| 收款 | payment received | 收款事实 | 关联应收 |
| 付款 | payment paid | 付款事实 | 关联应付 |
| 对账 | reconciliation | 客户/供应商确认 | 可成为财务确认点 |
| 核销 | payment matching | 清账状态 | 不靠手改状态 |
| 调整/冲正 | adjustment/reversal | 错账修正 | 不能物理删除事实 |

最终结果：

```text
财务可信：应收应付、发票、收付款、对账和核销都有事实来源和可追溯链路。
```

---

# 10. 前端与菜单全过程

| 阶段 | 过程 | 最终结果 | 注意 |
|---|---|---|---|
| V1 独立页面 | 先建正式页面和路由 | 可通过直链访问 V1 | 不急着替换菜单 |
| API client | 封装 JSON-RPC | 页面调用后端 | 不写 fake truth |
| 权限按钮 | 根据权限隐藏/禁用 | 用户体验更清晰 | 后端仍是安全边界 |
| 旧入口审计 | 审计 business_records 菜单 | 知道哪些入口重叠 | 不直接删除 |
| menu entry review | 评审 V1 如何进入菜单 | 菜单切换方案 | 不改 seedData 前先评审 |
| minimal menu entry | 小范围加 V1 入口 | 用户能正式进入 | 旧入口保留/标记 |
| read-only/demo mode | 旧入口降级 | 避免双真源 | 不双写 |
| 全局菜单重构 | 等事实层更完整再做 | 产品菜单稳定 | 不在早期大改 |

最终结果：

```text
前端从“旧 demo/兼容页面”逐步过渡到“正式 V1 产品页面”，而不是一刀切重写菜单。
```

---

# 11. business_records 过渡全过程

| 阶段 | 过程 | 最终结果 | 禁止事项 |
|---|---|---|---|
| 引用审计 | 查后端/前端/seed/docs/tests | 知道哪里在用 | 不改代码 |
| 重叠矩阵 | 对比 V1 正式模型 | 知道重叠风险 | 不自动替换 |
| data map draft | 设计映射 | 知道可迁移字段 | 不真实迁移 |
| cutover plan | 分阶段退出 | 有只读/demo/deprecated 路线 | 不直接删 |
| dry-run | 扫描旧数据 | 输出可迁移/冲突/待确认 | 不写正式数据 |
| read-only | 重叠旧入口只读 | 防止双写 | 不影响非重叠 demo |
| V1 替换 | 新入口成为正式入口 | 用户走正式模型 | 需回归测试 |
| archive/deprecate | 历史归档 | 旧入口退出 | 需客户确认 |

最终结果：

```text
business_records 从旧兼容层逐步退出正式业务链路，保留必要的 demo/source snapshot/历史参考价值。
```

---

# 12. current 客户数据导入全过程

| 阶段 | 过程 | 最终结果 | 禁止事项 |
|---|---|---|---|
| source inventory | 列出资料来源 | 知道数据从哪里来 | 不写数据库 |
| field classification | 字段分类 | Product Core / Customer Config / Deferred | 不把样本字段变必填 |
| dry-run plan | 设计导入预演 | 可检查不落库 | 不真实导入 |
| unresolved queue | 设计待处理队列 | 冲突/缺失/歧义可处理 | 不静默丢弃 |
| acceptance checklist | 验收清单 | 导入前有客户确认 | 不无确认导入 |
| loader design | 设计导入器 | 备份/回滚/幂等/审计 | 仍不写代码 |
| dry-run tooling | 写只读预演工具 | 输出 preview/conflict | 不写正式数据 |
| import execution | 受控真实导入 | 写 V1 正式表 | 必须备份/回滚 |
| post-import audit | 导入后校验 | 数量、字段、关系校验 | 不只看成功日志 |

最终结果：

```text
current 客户数据可受控导入，但不会污染 Product Core，也不会凭旧资料伪造出货、库存、财务事实。
```

---

# 13. 后续完整产品闭环过程

| 产品能力 | 要经历的过程 | 完成结果 |
|---|---|---|
| 主数据 | schema → migration → repo/usecase → API/RBAC → UI → import | 可维护的客户/供应商/产品/材料/仓库 |
| 销售订单 | schema → usecase → API → UI → 生命周期 | 可录正式订单 |
| BOM | 评审 → 版本 → 用量 → 采购需求 | 工程资料稳定 |
| 采购 | 采购承诺 → 到货 → 入库 | 从需求到入库 |
| 质检 | IQC/OQC/成品质检 | 质量事实可追溯 |
| 库存 | 批次 → 流水 → 余额 → 可用量 | 库存可信 |
| 生产 | 排产 → 领料 → 成品入库 | 生产事实闭环 |
| 委外 | 发料 → 回货 → 质检 → 结算 | 委外闭环 |
| 出货 | 放行 → 预留 → 拣货 → 出库 | 出货事实闭环 |
| 财务 | 应收/应付 → 发票 → 收付款 → 对账 | 财务闭环 |
| 报表 | 事实汇总 → 管理看板 | 经营数据可信 |
| 移动端 | 岗位任务 → 审批/扫码/拍照 | 现场操作可用 |
| 交付 | 配置包 → 部署包 → 培训 → 运维 | 多客户可复制 |

---

# 14. 产品完善后的结果形态

当产品真正完善后，应达到：

| 维度 | 完善结果 |
|---|---|
| 产品内核 | 主数据、订单、BOM、采购、库存、质检、生产、委外、出货、财务均有清晰事实模型 |
| 客户配置 | 每个客户有配置包，不 fork 代码 |
| 私有化部署 | 每客户独立 DB / 对象存储 / env / 初始化数据 |
| 工作流 | 只做协同许可，不写事实 |
| 事实层 | 库存、出货、财务可追溯、可审计、可冲正 |
| 权限 | 菜单权限 + 动作权限 + 数据范围 + 职责权限 |
| 前端 | 岗位入口 + 任务驱动 + 桌面端 + 手机端 |
| 导入 | 有 dry-run、unresolved queue、人工确认、回滚 |
| 运维 | 有备份、恢复、发布、回滚、升级 checklist |
| 多客户 | 新客户通过配置包 + 导入适配上线 |
| 商业化 | 私有化部署可收费维护，未来可评审 SaaS |

---

# 15. 从现在到产品完善的建议路线

```text
011 workspace-boundary-checkpoint
012 v1-menu-entry-review
013 current-customer-import-loader-design
014 current-customer-import-dry-run-tooling
015 business-records-readonly-demo-mode-review
016 product-sku-bom-version-review
017 purchase-order-usecase-review
018 shipment-usecase-review
019 stock-reservation-usecase
020 shipment-outbound-inventory-fact
021 finance-ar-ap-invoice-payment-review
022 production-fact-review
023 outsourcing-fact-review
024 mobile-task-entry-review
025 deployment-package-current
026 customer-trial-acceptance
027 second-customer-template-hardening
028 private-deployment-productization
029 SaaS-multitenancy-review
```

---

# 16. 最终大图

```text
模糊甲方资料
  -> 需求线索 / 假设 / 问题 / 决策
  -> 产品定位 / 分层边界
  -> V1 cutline
  -> 主数据 + 销售订单最小闭环
  -> business_records 过渡
  -> current 数据 dry-run
  -> 正式菜单入口
  -> 采购 / 库存 / 质检
  -> 生产 / 委外
  -> 出货事实
  -> 财务事实
  -> 移动端任务
  -> 私有化部署包
  -> 多客户配置包
  -> 行业模板沉淀
  -> 产品成熟
  -> 未来 SaaS 评审
```

核心不变：

```text
通用产品内核 + 受控客户差异 + 分层状态机 + 业务事实可追溯 + 权限职责可配置 + UI/模板适度灵活
```

### 107. user

_time `2026-05-31T21:49:31+08:00` · content_type `text` · node `eda1a5ce-459a-485b-abdc-6482e5d51b78`_

列一个md给我可复制的

### 108. assistant

_time `2026-05-31T21:49:33+08:00` · content_type `text` · node `a1da14f3-cce6-4ff6-bd83-0da83817955d`_

下面是完整可复制版，可保存为 `docs/product/product-completion-roadmap.md` 或 `docs/codex-goals/_product-completion-roadmap.md`。

:::writing{variant="document" id="48372"}
# plush-toy-erp 从起步到产品完善的全过程与结果清单

## 0. 文档目的

本文用于描述 `plush-toy-erp` 从项目起步、服务 current 甲方、沉淀产品内核，到未来可复制交付多个客户的完整过程和结果。

本文不按“当前已做 / 未做”来列，而是按产品从 0 到成熟必须经历的阶段列出：

- 每个阶段要解决什么问题。
- 每个阶段应该产出什么结果。
- 每个阶段不能混入什么内容。
- 每个阶段成熟后对产品化有什么价值。

---

## 1. 总体路线总表

| 阶段 | 过程目标 | 最终结果 | 关键产物 | 不该做的事 |
|---:|---|---|---|---|
| 0 | 明确产品定位 | 确认这是毛绒玩具行业 ERP 产品内核，不是一次性外包 | 产品原则、客户定位、长期边界 | 不急着写业务代码 |
| 1 | 整理甲方资料 | 把模糊资料变成需求线索、假设、问题、决策 | source materials、question backlog、decision log | 不把甲方样本直接写成通用规则 |
| 2 | 建立产品化分层 | 确认 Product Core / Industry Template / Customer Config / Extension | 产品分层文档、配置边界 | 不做 SaaS 多租户 |
| 3 | 建立状态和事实边界 | 区分 Workflow、单据生命周期、业务事实、派生状态 | Workflow / Fact 边界文档 | 不把 workflow done 当业务完成 |
| 4 | 确定 V1 主链路范围 | 确定第一版只打通什么，不做什么 | V1 cutline、Go / Draft / Deferred 清单 | 不把 ERP 全部模块一次做完 |
| 5 | 建立主数据基础 | 客户、供应商、联系人、产品、材料、单位、仓库等稳定 | MasterData schema / usecase / API / UI | 不重复设计已有主数据 |
| 6 | 建立源单据 | 销售订单、BOM、采购单等表达业务承诺 | Source Document 模型 | 不把源单据当事实落账 |
| 7 | 建立采购 / 质检 / 库存事实 | 入库、退货、调整、质检、批次、库存流水稳定 | inventory_txns、lots、balances、quality_inspections | 不让客户配置库存核心规则 |
| 8 | 建立生产 / 委外事实 | 生产领料、成品入库、委外发料、委外回货、返工 | production / outsourcing facts | 不只靠 workflow 状态表示生产完成 |
| 9 | 建立出货事实 | 出货放行、预留、拣货、实际出库分开 | shipments、shipment_items、stock_reservations、outbound txns | 不把 shipping_released 当 shipped |
| 10 | 建立财务事实 | 应收、应付、发票、收付款、对账 | AR/AP/invoice/payment/reconciliation | 不从订单或放行直接生成财务事实 |
| 11 | 建立权限职责体系 | 菜单权限、动作权限、工作流职责、数据范围清楚 | RBAC、Feature Flag、Data Scope | 不只做菜单隐藏 |
| 12 | 建立前端岗位入口 | 桌面端 + 手机端，按岗位和任务驱动 | V1 pages、mobile roles、task entry | 不让菜单看起来比能力更成熟 |
| 13 | 处理旧兼容层 | business_records 降级为兼容 / demo / source snapshot | transition audit、cutover plan、read-only/demo plan | 不直接删除旧入口 |
| 14 | current 数据导入 | 当前甲方数据 dry-run、人工确认、受控导入 | import dry-run、unresolved queue、loader、acceptance report | 不自动生成出货/库存/财务事实 |
| 15 | 客户试点上线 | current 甲方可真实试用主链路 | 私有化部署、迁移、备份、培训、试运行 | 不无备份上线 |
| 16 | 交付运维体系 | 多客户私有化部署可复制 | deployment package、release checklist、backup/restore | 不每客户 fork 一套代码 |
| 17 | 行业模板沉淀 | 将多个客户共性沉淀成毛绒玩具行业模板 | roles、menus、fields、print templates、numbering | 不把单一客户特殊项变默认 |
| 18 | 多客户复制 | 第二、第三个客户能快速部署 | customer config package、import adapter、deployment notes | 不做长期分叉 |
| 19 | 产品成熟 | 核心业务闭环、数据可信、权限清楚、可交付可维护 | 版本化产品、回归测试、客户升级机制 | 不急着 SaaS |
| 20 | SaaS 评审 | 私有化多客户成熟后再评审 SaaS | tenant_id、隔离、计费、授权、运营后台设计 | 不提前污染当前 schema |

---

## 2. 第 0 阶段：明确产品定位

| 项目 | 内容 |
|---|---|
| 过程目标 | 把项目从“给某个甲方做系统”提升为“毛绒玩具行业 ERP 产品内核” |
| 要解决的问题 | 防止项目变成一次性定制外包 |
| 最终结果 | 明确 Product Core、Industry Template、Customer Config、Customer Extension 的边界 |
| 关键产物 | product-principles.md、customer-instance-policy.md、zero-to-one-architecture.md |
| 成熟标志 | 所有后续开发都能判断某个需求属于产品内核、行业模板、客户配置还是客户扩展 |

### 2.1 产品定位

项目定位为：

- 毛绒玩具行业 ERP 产品内核。
- 先服务 current 甲方上线。
- 后续支持多个同行客户私有化部署。
- 未来再单独评审 SaaS 多租户。

### 2.2 current 客户定位

current 是：

- 第一个真实客户。
- 种子客户。
- 第一个私有化客户实例。
- 第一个客户配置包来源。

current 不是：

- SaaS runtime tenant。
- 数据库多租户。
- 多租户 RBAC 隔离对象。
- Product Core 规则来源。

### 2.3 当前阶段禁止项

当前阶段禁止：

- 不新增 tenant_id。
- 不实现 SaaS 多租户。
- 不实现 license server。
- 不实现套餐计费。
- 不实现客户工单系统。
- 不创建泛化 ChangeUsecase。
- 不创建泛化 change_records。
- 不把 current 客户资料写成 Product Core。
- 不让 WorkflowUsecase 写库存、出货、财务、应收、应付、发票、收付款事实。
- 不把 business_records 当长期事实真源。

---

## 3. 第 1 阶段：整理甲方资料与模糊需求

| 项目 | 内容 |
|---|---|
| 过程目标 | 把甲方给的 Excel、PDF、截图、口头需求变成可分析材料 |
| 要解决的问题 | 防止直接把样本字段写进 schema |
| 最终结果 | 资料线索、假设、问题、决策、差异都有台账 |
| 关键产物 | source-materials.md、requirement-clues.md、assumption-register.md、question-backlog.md、decision-log.md、delta-register.md |
| 成熟标志 | 每个甲方输入都能被分类，而不是直接进入代码 |

### 3.1 资料分类

甲方资料应归类为：

- Customer Material
- Demo Seed
- Source Snapshot
- Data Import Source
- Print Template Input
- Industry Template Candidate
- QA Debug
- Do Not Import

### 3.2 资料不等于产品真源

甲方样本只能作为线索，不能直接成为：

- Product Core 必填字段。
- Ent schema 字段。
- 核心状态机规则。
- 通用产品流程。
- 财务事实规则。
- 库存事实规则。

### 3.3 需求澄清结果

最终要得到：

- 需求线索清单。
- 假设清单。
- 甲方问题清单。
- 已确认决策清单。
- 客户差异清单。
- 客户配置草案。

---

## 4. 第 2 阶段：建立产品化分层

| 层级 | 含义 | 应包含 | 不应包含 |
|---|---|---|---|
| Product Core | 所有客户共用的产品内核 | 主数据、事实模型、核心 usecase、API、权限、审计 | current 客户专属字段 |
| Industry Template | 毛绒玩具行业默认模板 | 默认角色、默认菜单、流程模式、字段模板、打印模板 | 无限制低代码 |
| Customer Config | 客户配置包 | 公司信息、菜单开关、字段显示、编号规则、打印模板、初始化数据 | 库存扣减规则、财务核销规则 |
| Customer Extension | 极少数客户扩展 | 数据适配、专属模板、特殊报表 | 核心事实分叉 |
| Runtime Tenant | SaaS 多租户运行时 | tenant_id、租户隔离、计费授权 | 当前阶段不做 |

### 4.1 客户可以配置

- 公司名。
- Logo。
- 菜单开关。
- 模块开关。
- 字段显示。
- 字段必填。
- 编号规则。
- 打印模板。
- 角色模板。
- 权限模板。
- 初始化数据。
- 默认仓库。
- 默认单位。

### 4.2 客户不能配置

- 入库是否增加库存。
- 出库是否扣库存。
- 库存流水能不能删除。
- 财务核销逻辑。
- 审计日志是否关闭。
- 核心状态机自由拖拽。
- 数据库结构。
- 自定义核心业务对象。

### 4.3 成熟结果

最终产品应该是：

- 一套产品内核。
- 一个毛绒玩具行业模板。
- 多个客户配置包。
- 少量客户扩展。
- 每客户独立私有化部署。
- 未来 SaaS 再单独评审。

---

## 5. 第 3 阶段：建立 Workflow / Fact 状态边界

| 状态层 | 管什么 | 例子 | 是否事实 |
|---|---|---|---|
| Workflow 协同层 | 谁处理、任务是否完成 | pending、done、blocked | 否 |
| 单据生命周期层 | 单据处于哪个阶段 | draft、submitted、shipping_released、closed | 部分是阶段，不是事实 |
| 业务事实层 | 真实发生的业务动作 | inventory_txns、shipments、payments | 是 |
| 派生状态层 | 从事实计算的结果 | partial_shipped、fully_paid | 不是原始事实 |
| 系统横切状态 | 导入、同步、任务过程 | processing、failed、synced | 否 |

核心口诀：

流程管协同，单据管阶段，事实管落账，结果靠计算，系统状态别混业务。

### 5.1 Workflow 边界

Workflow 只负责：

- 谁处理。
- 谁审批。
- 谁确认。
- 当前节点是否 done / blocked。
- 是否可以进入下一步。

Workflow 不负责：

- 写库存流水。
- 创建出货单。
- 扣减库存。
- 生成应收。
- 生成发票。
- 生成收付款。

### 5.2 shipping_released 边界

shipping_released 表示：

- 已放行。
- 可发货。
- 待出库。

shipping_released 不表示：

- 已出库。
- 已发货。
- 已扣库存。
- 已生成应收。
- 已开票。

### 5.3 动作、事实、结果

正确链路：

用户确认出库
-> 创建 / 确认 shipment
-> 写 inventory_txns posted
-> 根据事实计算 order.fulfillment_status
-> 必要时推进订单派生状态

错误链路：

用户点一下已出库
-> 直接把 order.status 改成 shipped
-> 不写 shipment
-> 不写 inventory_txns

---

## 6. 第 4 阶段：确定 V1 cutline

| 分类 | 对象 |
|---|---|
| V1 Go | customers、suppliers、contacts、sales_orders、sales_order_items |
| Draft Only | product_skus、customer_addresses、supplier_material_profiles、settlement_terms、order_revisions、BOM version extension、purchase_orders、purchase_order_items、purchase_demands |
| Deferred | stock_reservations、shipments、shipment_items、AR/AP/invoice/payment/reconciliation、production facts、outsourcing facts |

### 6.1 V1 为什么只做这些

V1 的目标是建立最小正式业务基础：

- 客户。
- 供应商。
- 联系人。
- 销售订单。
- 销售订单明细。

它不追求立刻做完整 ERP，因为：

- 出货事实还没有评审。
- 库存预留还没有评审。
- 财务事实还没有评审。
- 生产/委外事实还没有评审。
- business_records 兼容层还需要过渡审计。

---

## 7. 第 5 阶段：主数据建设全过程

| 业务对象 | 建设过程 | 最终结果 | 后续扩展 |
|---|---|---|---|
| customers | 评审 -> schema -> migration -> repo/usecase -> API/RBAC -> UI | 正式客户主数据 | 地址、账期、信用额度 |
| suppliers | 评审 -> schema -> migration -> repo/usecase -> API/RBAC -> UI | 正式供应商主数据 | 供应物料档案、结算资料 |
| contacts | 评审 -> schema -> migration -> repo/usecase -> API/RBAC -> UI | 客户/供应商联系人 | 联系人权限、通知配置 |
| products | 复用已有真源 | 产品主数据 | SKU、图片、客户款号 |
| materials | 复用已有真源 | 材料主数据 | 替代料、供应商报价 |
| units | 复用已有真源 | 单位主数据 | 换算关系 |
| warehouses | 复用已有真源 | 仓库主数据 | 库位、仓区 |
| product_skus | 暂缓评审 | 后续 SKU 模型 | 色号、尺寸、版本 |

### 7.1 主数据成熟结果

ERP 有稳定的主数据根基。

业务单据引用主数据，而不是把客户、供应商、产品、材料散落在文本字段里。

---

## 8. 第 6 阶段：销售订单 Source Document 建设全过程

| 阶段 | 过程 | 最终结果 | 关键边界 |
|---|---|---|---|
| 评审 | 明确 sales_order 是业务承诺 | 不把销售订单当出货事实 | Source Document 不等于 Fact |
| Schema | 建 sales_orders / sales_order_items | 有正式订单源单据 | 不加 shipped_quantity |
| Migration | 生成表和索引 | DB 可承载订单 | 不生成 shipment / finance |
| Repo/Usecase | 建订单生命周期和行操作 | 可创建、编辑、提交、激活、关闭、取消 | 不写库存 |
| API/RBAC | 暴露后端接口和权限 | 后端可安全调用 | 后端校验权限 |
| UI | 建销售订单页面 | 用户可录订单和明细 | UI 不显示 shipped |
| 后续 | 与 shipment 事实衔接 | 从真实出货推导履约 | 不从订单伪造出货 |

### 8.1 当前销售订单生命周期

允许：

- draft -> submitted
- submitted -> active
- active -> closed
- draft / submitted / active -> canceled

禁止：

- any -> shipped
- order 直接写 shipment
- order 直接写 inventory_txns
- order 直接写 AR/AP
- order 直接生成 invoice/payment

### 8.2 销售订单成熟结果

系统有正式销售订单，但它只代表业务承诺。

真实出货、库存扣减、应收开票要后续独立事实层实现。

---

## 9. 第 7 阶段：采购 / 质检 / 库存事实全过程

| 阶段 | 过程 | 最终结果 | 关键边界 |
|---|---|---|---|
| 采购承诺 | purchase_orders 评审 | 采购订单表达承诺 | 不等于入库 |
| 采购入库 | purchase_receipts | 采购入库事实 | 入库后才影响库存 |
| 采购退货 | purchase_returns | 退货事实 | 写库存出向流水 |
| 入库调整 | purchase_receipt_adjustments | 调整事实 | 不直接改余额 |
| 质检 | quality_inspections | 批次质检事实 | task done 不等于 passed |
| 批次 | inventory_lots | 可追溯批次 | 批次状态受控 |
| 库存流水 | inventory_txns | 库存真实变化 | 事实不可随便删 |
| 库存余额 | inventory_balances | 查询缓存/余额 | 从流水派生或维护 |
| 可用量 | on_hand - reserved - frozen | 支撑出货/预留 | 不等同总库存 |

最终结果：

库存可信，所有库存变化都有来源单据、流水、批次和可追溯状态。

---

## 10. 第 8 阶段：生产 / 委外事实全过程

| 模块 | 建设过程 | 最终结果 | 注意边界 |
|---|---|---|---|
| production_orders | 评审 -> schema -> usecase -> UI | 生产任务 / 生产单 | 不代表已领料 |
| material_issue | 生产领料事实 | 材料库存扣减 | 必须写 inventory_txns |
| finished_goods_receipt | 成品入库事实 | 成品库存增加 | 不等于 workflow done |
| rework | 返工事实 | 可追溯返工 | 不能只改状态 |
| outsource_orders | 委外承诺 | 委外加工单 | 不代表发料 |
| outsource_issue | 委外发料事实 | 材料转出/占用 | 要写库存事实 |
| outsource_receipt | 委外回货事实 | 回货记录 | 可能进入质检 |
| outsource_settlement | 委外结算 | 委外应付依据 | 不直接从 workflow 生成 |

最终结果：

生产和委外不只是任务状态，而是有真实领料、回货、入库、返工、结算事实。

---

## 11. 第 9 阶段：出货全过程

| 阶段 | 过程 | 最终结果 | 禁止混淆 |
|---|---|---|---|
| 出货放行 | shipment_release workflow | shipping_released | 不是已出库 |
| 出货计划 | shipments draft | 出货计划单 | 不扣库存 |
| 库存预留 | stock_reservations | 锁定可用库存 | 不等于出库 |
| 拣货 | picking | 仓库操作过程 | 不等于 shipped |
| 实际出库 | shipment shipped + inventory_txns OUT | 出货事实完成 | shipped 才是真出货 |
| 订单履约 | 从 shipment facts 汇总 | partial / full shipped | 派生状态 |
| 异常处理 | 取消/释放/冲正 | 可回滚可追溯 | 不直接删事实 |

最终结果：

出货可信，放行、预留、拣货、出库、库存扣减是分开的。

---

## 12. 第 10 阶段：财务全过程

| 阶段 | 过程 | 最终结果 | 关键口径 |
|---|---|---|---|
| 应收草案 | 从真实出货或对账生成 | AR draft | 不从 shipping_released 生成 |
| 应付草案 | 从采购入库/委外结算/对账生成 | AP draft | 不从采购订单直接生成 |
| 发票 | invoice issued | 开票事实 | 可作废/冲正 |
| 收款 | payment received | 收款事实 | 关联应收 |
| 付款 | payment paid | 付款事实 | 关联应付 |
| 对账 | reconciliation | 客户/供应商确认 | 可成为财务确认点 |
| 核销 | payment matching | 清账状态 | 不靠手改状态 |
| 调整/冲正 | adjustment/reversal | 错账修正 | 不能物理删除事实 |

最终结果：

财务可信，应收应付、发票、收付款、对账和核销都有事实来源和可追溯链路。

---

## 13. 第 11 阶段：权限职责体系全过程

| 层级 | 过程 | 最终结果 | 注意 |
|---|---|---|---|
| Feature Flag | 控制模块是否启用 | 模块开关可控 | 不等于普通 RBAC |
| Menu Permission | 控制菜单是否可见 | 用户看到合理入口 | 不是安全边界 |
| Action Permission | 控制动作能否执行 | 后端校验动作 | 不能只靠按钮隐藏 |
| Data Scope | 控制能操作哪些数据 | 仓库、客户、部门范围 | 后续细化 |
| Workflow Responsibility | 流程节点绑定职责 | 节点不绑定死岗位 | 客户角色可配置 |
| Audit | 记录谁做了什么 | 可追溯 | 不能关闭 |

最终结果：

权限不只是菜单隐藏，而是后端动作权限、职责权限、数据范围和审计共同构成安全边界。

---

## 14. 第 12 阶段：前端与菜单全过程

| 阶段 | 过程 | 最终结果 | 注意 |
|---|---|---|---|
| V1 独立页面 | 先建正式页面和路由 | 可通过直链访问 V1 | 不急着替换菜单 |
| API client | 封装 JSON-RPC | 页面调用后端 | 不写 fake truth |
| 权限按钮 | 根据权限隐藏/禁用 | 用户体验更清晰 | 后端仍是安全边界 |
| 旧入口审计 | 审计 business_records 菜单 | 知道哪些入口重叠 | 不直接删除 |
| menu entry review | 评审 V1 如何进入菜单 | 菜单切换方案 | 不改 seedData 前先评审 |
| minimal menu entry | 小范围加 V1 入口 | 用户能正式进入 | 旧入口保留/标记 |
| read-only/demo mode | 旧入口降级 | 避免双真源 | 不双写 |
| 全局菜单重构 | 等事实层更完整再做 | 产品菜单稳定 | 不在早期大改 |

最终结果：

前端从旧 demo/兼容页面逐步过渡到正式 V1 产品页面，而不是一刀切重写菜单。

---

## 15. 第 13 阶段：business_records 过渡全过程

| 阶段 | 过程 | 最终结果 | 禁止事项 |
|---|---|---|---|
| 引用审计 | 查后端/前端/seed/docs/tests | 知道哪里在用 | 不改代码 |
| 重叠矩阵 | 对比 V1 正式模型 | 知道重叠风险 | 不自动替换 |
| data map draft | 设计映射 | 知道可迁移字段 | 不真实迁移 |
| cutover plan | 分阶段退出 | 有只读/demo/deprecated 路线 | 不直接删 |
| dry-run | 扫描旧数据 | 输出可迁移/冲突/待确认 | 不写正式数据 |
| read-only | 重叠旧入口只读 | 防止双写 | 不影响非重叠 demo |
| V1 替换 | 新入口成为正式入口 | 用户走正式模型 | 需回归测试 |
| archive/deprecate | 历史归档 | 旧入口退出 | 需客户确认 |

最终结果：

business_records 从旧兼容层逐步退出正式业务链路，保留必要的 demo / source snapshot / 历史参考价值。

---

## 16. 第 14 阶段：current 客户数据导入全过程

| 阶段 | 过程 | 最终结果 | 禁止事项 |
|---|---|---|---|
| source inventory | 列出资料来源 | 知道数据从哪里来 | 不写数据库 |
| field classification | 字段分类 | Product Core / Customer Config / Deferred | 不把样本字段变必填 |
| dry-run plan | 设计导入预演 | 可检查不落库 | 不真实导入 |
| unresolved queue | 设计待处理队列 | 冲突/缺失/歧义可处理 | 不静默丢弃 |
| acceptance checklist | 验收清单 | 导入前有客户确认 | 不无确认导入 |
| loader design | 设计导入器 | 备份/回滚/幂等/审计 | 仍不写代码 |
| dry-run tooling | 写只读预演工具 | 输出 preview/conflict | 不写正式数据 |
| import execution | 受控真实导入 | 写 V1 正式表 | 必须备份/回滚 |
| post-import audit | 导入后校验 | 数量、字段、关系校验 | 不只看成功日志 |

最终结果：

current 客户数据可受控导入，但不会污染 Product Core，也不会凭旧资料伪造出货、库存、财务事实。

---

## 17. 第 15 阶段：客户试点上线全过程

| 阶段 | 过程 | 最终结果 | 注意 |
|---|---|---|---|
| 环境准备 | 私有化部署环境、数据库、对象存储 | current 可部署 | 不混 SaaS |
| migration apply | 按 migration 顺序应用 | 数据库结构就绪 | 必须可回滚 |
| 初始配置 | 公司信息、角色、权限、仓库、单位 | current 可使用 | 配置不进 Product Core |
| 数据导入 | dry-run -> 人工确认 -> 导入 | current 初始数据就绪 | 不生成事实 |
| 培训 | 按岗位培训 | 老板/业务/仓库/品质可试用 | 不讲技术术语 |
| 试运行 | 小范围真实录单 | 发现问题 | 不直接全量切换 |
| 问题收集 | 需求 / bug / 数据问题分类 | 进入 backlog | 不直接乱改 |
| 验收 | 当前阶段验收 | 可进入下一阶段 | 有签字/确认记录 |

最终结果：

current 甲方能真实试用系统，并且反馈能分类进入产品、配置、模板、扩展或数据导入改进。

---

## 18. 第 16 阶段：交付运维体系全过程

| 能力 | 过程 | 最终结果 |
|---|---|---|
| 部署包 | config + env + compose/k8s + 初始化数据 | 每客户可独立部署 |
| 备份 | DB / 文件 / 对象存储备份 | 可恢复 |
| 恢复 | restore runbook | 出问题能回滚 |
| migration | 迁移顺序和状态检查 | 可升级 |
| 发布 | release checklist | 可控发版 |
| 回滚 | rollback plan | 出错可退 |
| 日志 | 运行日志 / 操作日志 | 可排查 |
| 监控 | 健康检查、错误告警 | 可维护 |
| 培训 | 客户培训资料 | 可交付 |
| 验收 | 验收清单 | 可收款/维护 |

最终结果：

系统不是只在开发环境能跑，而是能交付、升级、备份、恢复、维护。

---

## 19. 第 17 阶段：行业模板沉淀全过程

| 来源 | 沉淀过程 | 最终产物 |
|---|---|---|
| current 甲方 | 只作为第一客户样本 | current config package |
| 第二个客户 | 对比差异 | template candidate |
| 第三个客户 | 验证共性 | industry template default |
| 多客户反馈 | 归纳行业共性 | plush industry template |
| 特殊需求 | 保持客户配置或扩展 | customer delta |

行业模板包括：

- 默认角色。
- 默认菜单。
- 默认流程模式。
- 默认字段显示。
- 默认编号规则。
- 默认打印模板。
- 默认导入模板。
- 默认培训文档。
- 默认验收清单。

最终结果：

毛绒玩具同行客户可以用同一套行业模板快速初始化，而不是每家重新设计。

---

## 20. 第 18 阶段：多客户复制全过程

| 阶段 | 过程 | 最终结果 |
|---|---|---|
| 新客户调研 | 收资料和问题 | source materials |
| 配置包复制 | 从行业模板生成客户配置 | customer config |
| 数据导入适配 | 设计 mapping / dry-run | import plan |
| 私有化部署 | 独立 DB / 对象存储 / env | customer instance |
| 差异分类 | Core / Template / Config / Extension | delta register |
| 试运行 | 小范围上线 | trial report |
| 模板回流 | 多客户共性回产品 | industry template improvement |
| 维护收费 | 年维护 / 私有化服务 | 商业闭环 |

最终结果：

新增客户时，主要工作是配置、导入和少量适配，而不是复制一套代码。

---

## 21. 第 19 阶段：产品成熟标准

产品成熟不是“页面很多”，而是满足以下条件：

| 维度 | 成熟标准 |
|---|---|
| 数据模型 | 主数据、源单据、事实、派生状态边界清楚 |
| 业务闭环 | 订单、采购、生产、委外、库存、出货、财务闭环 |
| 状态机 | 每类状态有合法跳转和终态保护 |
| 事实追溯 | 库存、出货、财务都能追溯来源 |
| 权限职责 | 菜单、按钮、动作、数据范围、流程职责分离 |
| 客户配置 | 多客户差异通过配置包管理 |
| 交付 | 私有化部署、备份、回滚、升级可执行 |
| 测试 | 单元、集成、回归、E2E、导入 dry-run 覆盖关键链路 |
| 文档 | current-source、progress、runbook、training、acceptance 完整 |
| 多客户 | 第二/第三客户能复用模板而不是 fork 代码 |

---

## 22. 第 20 阶段：未来 SaaS 评审

只有在私有化多客户成熟后，再评审 SaaS。

SaaS 评审内容包括：

- tenant_id 是否进入 schema。
- 租户数据隔离模型。
- 对象存储隔离。
- RBAC 多租户化。
- 运营后台。
- license / billing。
- 套餐权限。
- 客户工单系统。
- 多租户迁移方案。
- 私有化与 SaaS 共存策略。

当前阶段明确不做。

---

## 23. 从现在到产品完善的建议路线

建议后续路线：

```text
011 workspace-boundary-checkpoint
012 v1-menu-entry-review
013 current-customer-import-loader-design
014 current-customer-import-dry-run-tooling
015 business-records-readonly-demo-mode-review
016 product-sku-bom-version-review
017 purchase-order-usecase-review
018 shipment-usecase-review
019 stock-reservation-usecase
020 shipment-outbound-inventory-fact
021 finance-ar-ap-invoice-payment-review
022 production-fact-review
023 outsourcing-fact-review
024 mobile-task-entry-review
025 deployment-package-current
026 customer-trial-acceptance
027 second-customer-template-hardening
028 private-deployment-productization
029 SaaS-multitenancy-review
```

如果目标是尽快给 current 甲方试用：

```text
workspace checkpoint
-> V1 menu entry review
-> current data dry-run tooling
-> current deployment package
-> current trial acceptance
```

如果目标是尽快完善产品内核：

```text
workspace checkpoint
-> product-sku-bom-version-review
-> purchase-order-usecase-review
-> shipment-usecase-review
-> inventory outbound facts
-> finance facts
```

---

## 24. 最终大图

```text
模糊甲方资料
-> 需求线索 / 假设 / 问题 / 决策
-> 产品定位 / 分层边界
-> V1 cutline
-> 主数据 + 销售订单最小闭环
-> business_records 过渡
-> current 数据 dry-run
-> 正式菜单入口
-> 采购 / 库存 / 质检
-> 生产 / 委外
-> 出货事实
-> 财务事实
-> 移动端任务
-> 私有化部署包
-> 多客户配置包
-> 行业模板沉淀
-> 产品成熟
-> 未来 SaaS 评审
```

核心不变：

```text
通用产品内核
+ 受控客户差异
+ 分层状态机
+ 业务事实可追溯
+ 权限职责可配置
+ UI / 模板适度灵活
```
````
