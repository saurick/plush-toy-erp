# 产品完成路线图 / Product Completion Roadmap

- 文档类型：产品完成路线图
- 状态：可演进规划真源
- 作用域：描述 `plush-toy-erp` 重新从 0 到产品成熟的阶段、边界、结果和执行顺序
- 不代表：当前 runtime / schema / migration / API / UI 已实现状态
- 不包含：单轮任务审查报告、历史实现台账

## 0. 文档目的

本文用于描述 `plush-toy-erp` 重新做项目时，从产品定位、分层边界、MVP 主链路、客户资料治理、交付运维，到多客户复制和未来 SaaS 评审的完整路线。

本文是产品路线图，不替代 `docs/current-source-of-truth.md`、代码、Ent schema、Atlas migration、测试或本轮具体任务说明。如果涉及“当前已经实现了什么”，必须回到当前代码、测试、`docs/current-source-of-truth.md` 和 `docs/product/product-delivery-ledgers.md` 交叉确认。

## 0.1 Roadmap、台账和当前真源的关系

本文只回答“产品应该按什么阶段重做、每阶段产出什么结果、哪些边界不能破”。它不直接回答某项能力当前是否可交付给客户。

| 文件 | 回答的问题 | 不替代什么 |
| --- | --- | --- |
| `docs/product/product-completion-roadmap.md` | 重新做项目的阶段路线、边界、结果 | 当前代码、测试、schema、migration |
| `docs/product/product-delivery-ledgers.md` | 产品能力成熟度、客户交付状态、客户差异分类 | roadmap 和当前实现真源 |
| `docs/product/implementation-governance.md` | 模块实施门禁、Phase 与 Architecture Layer 区分、实施任务拆分规则 | roadmap、当前实现真源和测试结果 |
| `docs/current-source-of-truth.md` | 当前仓库实现和阅读顺序 | 产品长期路线 |
| `docs/product/formal-menu-entry-plan.md` | 正式菜单、客户菜单配置和旧入口退出规划 | runtime 菜单实现 |
| `docs/customers/<customer-key>/` | 单客户资料、问题、差异、导入 evidence | Product Core 规则 |

使用规则：

* 修改本文的阶段、顺序或产品目标时，应检查产品台账是否需要同步。
* 修改台账中的能力成熟度、客户交付状态或客户差异分类后，如影响长期路线，应回写本文。
* 拆新模块实现任务前，应先读 `docs/product/implementation-governance.md`，确认 Phase、Architecture Layer、门禁和允许范围。
* 未有代码、测试或当前真源证据的能力，不应在本文写成“已完成”或“可交付”。
* 本文允许描述“未来应做”，但不允许暗示 runtime、schema、API 或 UI 已经实现。

## 0.2 产品定位

`plush-toy-erp` 的目标是毛绒玩具及相近轻工制造企业 ERP 产品内核。

核心定位：

* 一套通用产品代码。
* 一个毛绒玩具行业模板。
* 多个客户配置包和私有化部署实例。
* 少量客户扩展，且必须有准入、边界和退出条件。
* 未来私有化多客户成熟后，再单独评审 SaaS 多租户。

当前第一客户 yoyoosun 的定位：

* 是第一个真实客户。
* 是种子客户。
* 是第一个私有化客户实例。
* 是第一个客户配置包来源。
* 不是 runtime tenant。
* 不是 Product Core 规则来源。

## 0.3 当前阶段禁止项

当前阶段禁止：

* 不新增 `tenant_id`。
* 不实现 SaaS 多租户。
* 不实现 license server。
* 不实现套餐计费。
* 不实现客户工单系统。
* 不创建泛化 `ChangeUsecase` 或 `change_records`。
* 不把任一客户资料直接写成 Product Core。
* 不让 `WorkflowUsecase` 写库存、出货、财务、应收、应付、发票或收付款事实。
* 不把 `business_records`、workflow payload、旧截图、Excel 样本或客户合同样式当长期事实真源。
* 不把 `shipping_released` 写成 `shipped`。
* 不把 workflow task `done` 当成 fact posted。

## 0.4 分层总览

| 层级 | 职责 | 当前路线原则 | 禁止项 |
| --- | --- | --- | --- |
| Product Core | 所有客户共用的产品内核 | 主数据、事实模型、核心 usecase、API、权限、审计 | 写死客户名称、logo、特殊字段或特殊流程 |
| Industry Template | 毛绒玩具行业默认模板 | 默认角色、菜单、流程模式、字段样本、编号规则、导入模板 | 把单一客户样本当行业标准 |
| Customer Config | 客户配置包 | 公司信息、菜单开关、字段显示、编号规则、角色模板、初始化数据 | 改库存、财务、审计等核心事实规则 |
| Customer Extension | 少量客户扩展 | 只承接真实出现且无法配置化的专属需求 | 提前造 extension runtime |
| Workflow | 协同与任务流转 | 管谁处理、谁审批、任务是否 done / blocked / rejected | 写库存、出货、财务事实 |
| MasterData | 主数据 | 客户、供应商、联系人、产品、材料、单位、仓库等 | 重复设计语义相近对象 |
| Source Document | 源单据 | 销售订单、采购订单、生产订单等业务承诺 | 直接当业务事实落账 |
| Fact | 事实层 | 采购、库存、质检、生产、委外、出货、财务事实 | 从 workflow 或菜单伪造事实 |
| RBAC | 权限职责 | 后端动作权限、角色职责、任务 owner / assignee | 只靠前端隐藏菜单 |
| API / UI | 业务入口 | 已评审 usecase 才接页面和 API | 前端补造后端事实 |
| Help / QA | 帮助和验收 | 区分业务帮助、开发验收、客户交付说明 | 把开发文档当客户教程 |
| Delivery | 私有化交付 | 部署包、配置包、备份、恢复、培训、验收 | 每客户 fork 一套代码 |

## 0.5 Workflow / Fact 边界

核心口诀：

```text
流程管协同，单据管承诺，事实管落账，结果靠计算，客户差异先分类。
```

关键边界：

| 场景 | 正确口径 | 不表示 |
| --- | --- | --- |
| workflow task done | 协同任务完成 | 库存、出货、财务事实已发生 |
| `shipping_released` | 已放行、可发货、待出库 | shipped、已扣库存、已生成应收 |
| sales order | 客户订单承诺 | 出货事实或财务事实 |
| purchase order | 采购承诺 | 入库事实 |
| quality task done | 质检协同完成 | 质检结果 passed / rejected |
| dashboard / report | 从事实读取的展示 | 原始事实真源 |

## 1. 总体路线总表

| Phase | 阶段 | 目标 | 关键产物 | 不做 |
| ---: | --- | --- | --- | --- |
| 0 | 产品重启与边界收口 | 重新确认产品定位、分层、禁止项和执行纪律 | 产品原则、分层说明、状态边界、测试策略、任务拆分规则 | 不写业务 runtime |
| 1 | 客户资料治理 | 把客户资料变成线索、问题、差异和导入输入 | source materials、question backlog、delta ledger、customer config draft | 不把客户样本写进 schema |
| 2 | MVP cutline 与领域模型 | 定义第一版先打通哪些对象和边界 | MVP cutline、domain model、source document / fact boundary | 不把完整 ERP 一次做完 |
| 3 | MasterData + Source Document MVP | 建立基础主数据和销售订单等源单据 | schema / repo / usecase / API / UI / tests | 不做出货、库存、财务伪事实 |
| 4 | 采购 / 质检 / 库存事实基础 | 建立可信库存和采购事实基础 | purchase receipt / return / adjustment、quality、inventory txns / lots / balances | 不让客户配置核心库存规则 |
| 5 | 正式产品入口与旧入口退出 | 建立正式菜单、权限入口和业务帮助边界；开发阶段不保留与正式 V1 重叠的旧兼容页面 | formal menu、legacy removal、RBAC guard、business help | 不保留旧入口作为正式写路径或兼容只读页 |
| 6 | 客户数据 dry-run 与 loader 设计 | 设计受控导入，不写错库、不伪造事实 | freeze、dry-run evidence、loader design、unresolved queue、acceptance checklist | 不直接真实导入 |
| 7 | 受控导入与试点部署 | 备份、回滚、导入、校验、培训和试运行 | import execution audit、deployment package、trial acceptance | 不无备份上线 |
| 8 | 生产 / 委外 / 出货 / 财务事实扩展 | 补齐 ERP 主干事实闭环 | production facts、outsourcing facts、shipment facts、finance facts | 不从 workflow 放行直接生成事实 |
| 9 | 岗位任务端与岗位协同 | 将高频任务投影到岗位任务端 | mobile task entry、workflow action UI、role task smoke | 不做空壳岗位任务端 |
| 10 | 行业模板沉淀 | 从多客户共性沉淀默认模板 | industry roles、menus、fields、numbering、import template | 不把单客户特殊项变默认 |
| 11 | 多客户私有化复制 | 新客户主要靠配置、导入和部署上线 | customer package、deployment runbook、upgrade checklist | 不长期 fork |
| 12 | SaaS 单独评审 | 私有化多客户成熟后再评审 SaaS | tenant isolation design、billing / license review、ops console design | 不提前污染当前 schema |

## 2. Phase 0：产品重启与边界收口

目标：先把项目重新做的边界收住，避免一开始就陷入旧实现、旧菜单或单客户样本。

必须产出：

* 产品原则。
* 产品分层。
* Workflow / Fact 边界。
* Customer Config / Customer Extension 准入规则。
* 测试和验收策略。
* 实施任务拆分规则和验收记录口径。
* 当前真源阅读顺序。

不做：

* 不写业务 usecase。
* 不改 schema。
* 不改 runtime API / UI。
* 不做目录大迁移。
* 不把旧实现状态写成新路线目标。

验收结果：

* 后续任何实现任务都能先判断自己属于哪一层。
* 后续任何客户资料都能先分类，再决定是否进入 Product Core。
* 后续任何 workflow 需求都不会直接写事实。

## 3. Phase 1：客户资料治理

目标：把 yoyoosun 或未来客户提供的 Excel、PDF、截图、口头需求转成可追踪输入，而不是直接进入代码。

资料分类：

| 分类 | 含义 | 是否进入 Product Core |
| --- | --- | --- |
| Customer Material | 客户原始资料 | 否 |
| Data Import Source | 可作为导入来源 | 否，需 mapper / dry-run |
| Customer Config | 客户配置项 | 否 |
| Industry Template Candidate | 可能是行业共性 | 多客户验证后再评审 |
| Print Template Candidate | 打印 / 导出样本 | 当前默认 Deferred |
| Demo Seed | 演示样本 | 否 |
| QA Debug | 验收或调试输入 | 否 |
| Forbidden | 明确不能做 | 否 |

必须产出：

* source materials。
* requirement clues。
* assumption register。
* question backlog。
* decision log。
* delta register。
* customer config draft。

不做：

* 不真实导入。
* 不创建 schema 字段。
* 不自动生成出货、库存或财务事实。
* 不把合同格式抽成通用模板引擎。

## 4. Phase 2：MVP cutline 与领域模型

目标：定义第一版产品到底先打通什么，并明确哪些只是 Draft / Deferred。

MVP 主线建议：

| 分类 | 对象 |
| --- | --- |
| Go | customers、suppliers、contacts、products、materials、units、warehouses、sales_orders、sales_order_items |
| Go / Review | BOM 基础、purchase receipt、inventory txns / lots / balances、quality inspections |
| Draft | product_skus、purchase_orders、production_orders、outsourcing_orders、customer addresses、settlement terms |
| Deferred | stock reservations、shipments、shipment outbound、AR/AP、invoice、payment、reconciliation、full mobile task flow |

MVP 原则：

* 先建立主数据和源单据。
* 采购、质检、库存必须是事实层，不从 workflow 伪造。
* 销售订单只代表客户承诺，不代表出货。
* 出货、财务、生产、委外都独立评审。

不做：

* 不一次性做完整 ERP。
* 不让页面菜单看起来比能力更成熟。
* 不通过字段残值或快照伪造事实。

## 5. Phase 3：MasterData + Source Document MVP

目标：让产品具备最小正式业务基础。

能力范围：

| 能力 | 结果 | 边界 |
| --- | --- | --- |
| customers | 客户主数据 | 地址、账期、信用额度后续评审 |
| suppliers | 供应商主数据 | 供应物料档案、结算资料后续评审 |
| contacts | 客户 / 供应商联系人 | 通知权限后续评审 |
| products / materials / units / warehouses | 基础主数据 | SKU、库位、单位换算后续评审 |
| sales_orders | 销售订单源单据 | 不写出货、库存、应收 |
| sales_order_items | 订单明细承诺 | 不维护 shipped quantity 伪事实 |

验收要求：

* 后端 usecase 有状态机和权限边界。
* API / RBAC 接入后端动作权限。
* UI 只展示和提交业务动作，不补造后端事实。
* 测试覆盖正常、非法状态、权限、重复提交和边界输入。

## 6. Phase 4：采购 / 质检 / 库存事实基础

目标：建立可信库存基础，而不是让订单或 workflow 直接改变库存。

事实对象：

| 事实 | 结果 |
| --- | --- |
| purchase_receipts | 采购入库事实 |
| purchase_returns | 采购退货事实 |
| purchase_receipt_adjustments | 入库差异调整事实 |
| quality_inspections | 来料质检判定和批次状态来源 |
| inventory_txns | 库存流水真源 |
| inventory_balances | 余额 / 查询加速 |
| inventory_lots | 批次追溯和批次可用性 |

关键规则：

* 库存错误通过调整或冲正处理，不直接修改历史流水。
* 质检状态变化不等于库存数量变化。
* 批次状态和库存余额是不同约束，必须同时满足。
* 采购订单如果后续实现，也只是采购承诺，不替代入库事实。

## 7. Phase 5：正式产品入口与旧入口退出

目标：让客户看到正式产品能力，而不是继续在旧兼容入口里写重叠数据。当前仍处于开发阶段，尚未进入甲方正式测试；与正式 V1 能力重叠的旧入口不保留产品内可见兼容页面、只读兼容页、旧路径重定向或权限别名。

必须处理：

* 正式菜单入口。
* 客户菜单配置。
* 后端动作权限。
* 业务帮助文档。
* 旧 `business_records` 重叠入口删除、隐藏或退出正式写路径；已由 V1 承接的旧路径不再保留产品内路由、重定向或权限别名，普通 `business` API 已冻结 `partners / project-orders` 写操作。
* 旧数据是否迁移、保留或只作为审计线索。

不做：

* 不把旧入口保留为正式业务写入口。
* 不为已由 V1 承接的旧入口保留兼容只读页。
* 不承诺旧入口只读归档页，除非后续单独评审。
* 不双写 V1 正式表和 `business_records`。
* 不靠前端隐藏菜单当安全边界。

## 8. Phase 6：客户数据 dry-run 与 loader 设计

目标：在真实导入前先做可复查、可阻断、可回滚的导入设计。

必须覆盖：

* source snapshot freeze。
* dry-run preview。
* unresolved queue。
* duplicates / conflicts。
* forbidden facts。
* loader design。
* backup / rollback / forward-fix。
* idempotency key。
* audit log。
* customer sign-off。
* post-import reconciliation。

强制边界：

* dry-run 和 freeze evidence 不是真实导入批准。
* `canExecuteRealImport` 必须保持 `false`，直到单独的真实导入执行任务明确打开。
* loader design 先于 implementation。
* 真实导入不能生成出货、库存出库、财务、发票或付款事实。

## 9. Phase 7：受控导入与试点部署

目标：让第一个客户在可备份、可回滚、可验收的私有化实例中试用。

过程：

| 步骤 | 结果 |
| --- | --- |
| 环境准备 | DB、对象存储、Compose、配置包就绪 |
| migration apply | 目标库结构确认 |
| backup | 导入前备份可恢复 |
| import execution | 只写批准范围内的正式表 |
| post-import audit | 数量、字段、关系、异常核对 |
| training | 按岗位培训 |
| trial run | 小范围真实试用 |
| acceptance | 记录通过、阻塞和下一轮问题 |

不做：

* 不无备份上线。
* 不在低配服务器构建。
* 不把试运行问题直接写成核心规则。

## 10. Phase 8：生产 / 委外 / 出货 / 财务事实扩展

目标：补齐 ERP 主干闭环，但每条事实链都必须单独评审。

建议顺序：

1. production fact review：生产订单、生产领料、成品入库、返工。
2. outsourcing fact review：委外订单、委外发料、委外回货、委外结算。
3. shipment usecase review：出货计划、预留、拣货、实际出库、冲正。
4. stock reservation review：可用量、预留、释放、并发扣减。
5. finance fact review：AR/AP、invoice、payment、reconciliation。

关键边界：

* 成品入库 task done 不等于库存入账。
* shipment release 不等于 shipped。
* shipped 后才评审应收 / 开票。
* 采购入库或委外结算后才评审应付。
* 财务事实必须可冲正、可审计。

## 11. Phase 9：岗位任务端与岗位协同

目标：把高频岗位任务投影到移动端，减少现场回填和等待。

岗位任务端应优先承接：

* 审批。
* 质检确认。
* 仓库入库确认。
* 出货放行。
* 拍照 / 附件留痕。
* 异常上报。

不做：

* 不复制桌面菜单树。
* 不做空壳角色入口。
* 不让岗位任务端绕过后端权限、状态机和事实 usecase。

## 12. Phase 10：行业模板沉淀

目标：从第一个客户和后续客户中抽离行业共性，而不是复制客户定制。

行业模板候选：

* 默认角色。
* 默认菜单。
* 默认流程模式。
* 默认字段显示。
* 默认编号规则。
* 默认初始化数据。
* 默认导入模板。
* 默认培训和验收清单。

进入行业模板的条件：

* 至少经过人工确认是行业共性，或多客户重复出现。
* 不包含单一客户名称、logo、合同条款或特殊报表。
* 不改变库存、财务、审计和核心状态机规则。

## 13. Phase 11：多客户私有化复制

目标：新增客户时主要做配置、导入和部署，而不是复制代码。

每个客户应有：

* `docs/customers/<customer-key>/`
* `config/customers/<customer-key>/`
* `deployments/<customer-key>/`
* 数据导入适配说明。
* 客户差异台账。
* 部署和运维 runbook。
* 验收清单。

不做：

* 不长期 fork 一套代码。
* 不按客户复制核心 schema。
* 不让客户扩展污染 Product Core。

## 14. Phase 12：SaaS 单独评审

只有私有化多客户成熟后，再评审 SaaS。

评审内容包括：

* `tenant_id` 是否进入 schema。
* 租户数据隔离。
* 对象存储隔离。
* RBAC 多租户化。
* 运营后台。
* license / billing。
* 套餐权限。
* 客户工单系统。
* 多租户迁移方案。
* 私有化与 SaaS 共存策略。

当前阶段明确不做。

## 15. 下一步执行路线

后续每个正式实现任务的前置检查：

```text
workspace checkpoint
-> roadmap / product-delivery-ledgers impact check
-> current-source-of-truth verification
-> allowed / forbidden path confirmation
```

建议下一步不再复用旧编号，按 Phase 拆：

```text
Phase 0 docs-only reset
-> Phase 1 customer source governance
-> Phase 2 MVP cutline and domain model review
-> Phase 3 MasterData + Source Document MVP
-> Phase 4 Purchase / Quality / Inventory fact foundation
-> Phase 5 Formal product entry and legacy exit
-> Phase 6 Customer import loader design
-> Phase 7 Controlled import and trial deployment
-> Phase 8 Production / Outsourcing / Shipment / Finance facts
-> Phase 9 Mobile task entry
-> Phase 10 Industry template hardening
-> Phase 11 Multi-customer private deployment
-> Phase 12 SaaS review
```

如果目标是尽快重新开工：

```text
Phase 0 docs-only reset
```

这轮只更新产品原则、分层、状态边界、客户配置、交付骨架、测试策略和任务拆分规则；不改 runtime、schema、migration、API、RBAC、UI、seedData，不恢复产品内 docs registry，也不做 loader。

如果目标是尽快给 yoyoosun 试用：

```text
Phase 0 docs-only reset
-> Phase 1 yoyoosun source governance
-> Phase 2 MVP cutline
-> Phase 3 MasterData + Sales Order MVP
-> Phase 5 Formal product entry
-> Phase 6 import loader design
-> Phase 7 trial deployment and acceptance
```

如果目标是尽快完善产品内核：

```text
Phase 0 docs-only reset
-> Phase 2 domain model review
-> Phase 3 MasterData + Source Document MVP
-> Phase 4 Purchase / Quality / Inventory facts
-> Phase 8 Shipment and Finance facts
```

## 16. 最终大图

```text
客户资料 / 行业样本 / 旧系统线索
-> 资料分类 / 问题 / 假设 / 决策 / 差异
-> 产品定位 / 分层 / 禁止项
-> MVP cutline
-> 主数据 + 源单据
-> 采购 / 质检 / 库存事实
-> 正式入口 + 权限 + 帮助
-> 客户数据 dry-run + loader design
-> 受控导入 + 私有化试点
-> 生产 / 委外 / 出货 / 财务事实
-> 岗位任务
-> 行业模板
-> 多客户私有化复制
-> 产品成熟
-> SaaS 单独评审
```

核心不变：

```text
通用产品内核
+ 行业模板
+ 受控客户配置
+ 少量客户扩展
+ Workflow / Fact 分离
+ 事实可追溯
+ 权限职责可配置
+ 私有化可交付
+ 未来 SaaS 单独评审
```
