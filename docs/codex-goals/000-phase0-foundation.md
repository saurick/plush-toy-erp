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
