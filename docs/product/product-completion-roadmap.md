# plush-toy-erp 从起步到产品完善的全过程与结果清单

- 文档类型：产品完成路线图
- 状态：可演进规划真源
- 作用域：描述产品从起步到成熟的阶段、边界、结果和产品路线目标顺序
- 不代表：当前 runtime / schema / migration / API / UI 已实现状态
- 不包含：台账维护、issue 标签、可视化系统、一次性检查清单等治理动作的独立路线编号

## 0. 文档目的

本文用于描述 `plush-toy-erp` 从项目起步、服务 current 甲方、沉淀产品内核，到未来可复制交付多个客户的完整过程和结果。

本文是产品规划路线图，不替代 `docs/current-source-of-truth.md`、代码、Ent schema、Atlas migration、测试或具体 `docs/codex-goals/<编号>.md`。调整本路线图时可以重排未来阶段、优先级和产品目标顺序；但涉及“当前已完成 / 未完成 / 已实现编号”时，必须先核对 `docs/current-source-of-truth.md` 和真实代码。

## 0.1 Roadmap 变更规则

本文件是产品完成路线图的可演进规划真源，不是一次性固定计划。执行过程中如果发现路线、顺序、范围或前置条件与当前代码、客户反馈、验收结果或风险判断不一致，应先显式更新本文件，再拆分新的 `docs/codex-goals/*.md` 执行任务。

`docs/codex-goals/001-xxx.md`、`002-xxx.md` 等编号 Goal 只表示阶段性施工单和审计记录；完成后不再作为后续路线真源。后续路线以本文件和 `docs/current-source-of-truth.md` 的当前状态为准。

任何 roadmap 调整都应写清：

* 调整原因。
* 影响的阶段或 Goal。
* 新的下一步。
* 哪些旧 Goal 编号不再继续复用。

## 0.2 Current MVP 基线关系

后续如果新增 `docs/product/current-mvp-requirements-baseline.md`，它只用于约束 current 甲方试用和近期交付 Goal 的执行范围，不能覆盖 `docs/current-source-of-truth.md`、代码、migration、测试，也不能悄悄覆盖本文的长期产品路线。

如果 current MVP 基线与本文或当前真源冲突，必须先显式修正文档并写清原因，再拆具体 `docs/codex-goals/*.md` 执行；不能因为 current 客户急需某个入口，就把单客户样本直接写成 Product Core、schema 必填项或长期产品路线。

本文不按“当前已做 / 未做”来列，而是按产品从 0 到成熟必须经历的阶段列出：

* 每个阶段要解决什么问题。
* 每个阶段应该产出什么结果。
* 每个阶段不能混入什么内容。
* 每个阶段成熟后对产品化有什么价值。

---

## 0.3 Roadmap、三类台账与当前真源的关系

本路线图只回答“产品从现在到成熟应该按什么阶段推进、哪些能力先后做、哪些产品目标需要重排”。它不直接回答某项能力当前是否可交付给客户。

`docs/product/product-delivery-ledgers.md` 负责补齐三类治理判断：

| 台账 | 回答的问题 | 对 roadmap 的作用 | 不替代什么 |
| --- | --- | --- | --- |
| 产品能力进度台账 | 产品能力成熟到 L0-L8 的哪一级 | 判断某能力能否进入试用、交付或下一阶段 Goal | 不替代代码、测试、schema、migration |
| 客户交付矩阵 | 某客户能看到、试用、验收什么 | 判断 current 或后续客户的交付承诺边界 | 不替代客户合同或上线确认 |
| 客户差异台账 | 某差异属于 Core / Template / Config / Extension / Import / Print / Deferred / Forbidden | 判断客户输入是否可以影响产品路线 | 不把单客户样本自动升成 Product Core |

使用规则：

* 本文调整阶段顺序或产品目标时，应检查三类台账是否需要同步更新。
* 三类台账更新了能力成熟度、客户交付状态或客户差异分类后，若影响长期路线，应回写本文的阶段或建议路线。
* `docs/current-source-of-truth.md`、代码、Ent schema、Atlas migration 和测试仍是当前实现状态真源；本文和三类台账都不能直接声明 runtime 已实现。
* 未在台账中列出证据路径、测试命令、当前不包含和风险的能力，不应在本文写成“可交付”或“已完成产品闭环”。
* 台账维护、issue 标签、可视化系统、一次性 review checklist 属于治理或执行辅助；只有它们本身形成面向客户或团队长期使用的产品能力时，才允许进入本文路线编号。

## 0.4 imported-notes 使用规则

`docs/reference/imported-notes/*` 是 Reference Only 输入，不是当前实现、schema、runtime、API、UI 或测试真源。它们可以为路线图提供设计原则，但不能直接生成代码或变更数据库结构。

可以吸收的原则：

* 通用产品内核 + 受控客户差异 + 客户配置包，而不是每客户一套代码。
* 配置自由度分层：业务事实、库存、财务、审计和核心状态机受控；菜单、字段显示、打印模板、角色模板等可配置。
* 状态分层：Workflow 协同层、单据生命周期层、业务事实层、派生结果层和系统横切状态不能混用。
* 执行业务动作的判断链路：Feature Flag -> RBAC -> Data Scope -> State Machine -> Business Rule -> Idempotency -> Audit Log。
* 内部 canonical status 与中文展示文案分离，尤其 `shipping_released != shipped`。
* 流程节点绑定职责 / 权限 / 能力，不绑定固定岗位；客户角色通过权限模板承接职责。
* 菜单表达稳定业务域和业务对象，流程步骤放到功能入口内的 Tab、按钮、待办或移动端任务入口。

不能吸收为当前事实的内容：

* imported note 中的 `tenant_id`、多租户、license、计费、运营后台等示例。
* imported note 中尚未被本仓库评审的字段、表、状态、权限码、菜单名或目录结构。
* imported note 中对未来模块的完整设想，不能越过本路线图和三类台账直接进入 schema / runtime。

任何从 imported-notes 提炼出的新路线项，都必须先进入客户差异台账或产品能力台账分类，再决定是否成为 Product Core、Industry Template、Customer Config、Customer Extension、Data Import Adapter、Print Template、Reporting、Deferred 或 Forbidden。

## 0.5 ERP 业务闭环覆盖口径

本路线图已经覆盖 ERP 产品业务闭环的主干路线，但这只表示“路线具备”，不表示当前实现已经闭环。当前实现状态必须回到 `docs/current-source-of-truth.md`、代码、migration、测试和 `docs/product/product-delivery-ledgers.md` 交叉确认。

业务闭环按以下主链路判断：

| 闭环 | 产品路线必须覆盖 | 当前 roadmap 对应阶段 |
| --- | --- | --- |
| Order to Cash | 客户 / 产品主数据 -> 销售订单 -> 出货计划 / 预留 / 出库 -> 应收 / 发票 / 收款 / 对账 | 主数据、销售订单、出货、财务 |
| Procure to Pay | 供应商 / 材料主数据 -> 采购承诺 -> 采购入库 / 退货 / 调整 -> 质检 / 库存 -> 应付 / 发票 / 付款 / 对账 | 主数据、采购 / 质检 / 库存、财务 |
| Plan / Make to Stock | 产品 / 材料 / BOM / SKU -> 生产订单 -> 领料 -> 成品入库 -> 质检 -> 库存 | 主数据、BOM / SKU、生产事实、库存事实 |
| Outsourcing | 委外承诺 -> 委外发料 -> 委外回货 -> 质检 / 入库 -> 委外结算 / 应付 | 委外事实、库存事实、财务 |
| Inventory Control | 入库、出库、预留、冻结、批次、盘点、调整、冲正和余额查询都有事实来源 | 采购 / 质检 / 库存、出货、生产 / 委外 |
| Governance / Delivery | 权限、状态机、审计、部署、备份、培训、验收和维护收费可追溯 | RBAC、产品入口、交付运维、多客户复制 |

不构成业务闭环完成的内容：

* 菜单入口存在。
* 台账里有一行。
* workflow task `done`。
* `shipping_released`。
* `business_records` 或旧快照里有字段。
* current 数据 dry-run / freeze evidence。
* 报表、看板或可视化能显示数据。

---

## 1. 总体路线总表

| 阶段 | 过程目标             | 最终结果                                                              | 关键产物                                                      | 不该做的事                          |
| -: | ---------------- | ----------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------ |
|  0 | 明确产品定位           | 确认这是毛绒玩具行业 ERP 产品内核，不是一次性外包                                       | 产品原则、客户定位、长期边界                                            | 不急着写业务代码                       |
|  1 | 整理甲方资料           | 把模糊资料变成需求线索、假设、问题、决策                                              | source materials、question backlog、decision log            | 不把甲方样本直接写成通用规则                 |
|  2 | 建立产品化分层          | 确认 Product Core / Industry Template / Customer Config / Extension，并用三类台账承接成熟度、交付和差异 | 产品分层文档、配置边界、产品能力进度台账、客户交付矩阵、客户差异台账                         | 不做 SaaS 多租户，不用单客户样本跳过台账分类      |
|  3 | 建立状态和事实边界        | 区分 Workflow、单据生命周期、业务事实、派生状态                                      | Workflow / Fact 边界文档                                      | 不把 workflow done 当业务完成         |
|  4 | 确定 V1 主链路范围      | 确定第一版只打通什么，不做什么                                                   | V1 cutline、Go / Draft / Deferred 清单                       | 不把 ERP 全部模块一次做完                |
|  5 | 建立主数据基础          | 客户、供应商、联系人、产品、材料、单位、仓库等稳定                                         | MasterData schema / usecase / API / UI                    | 不重复设计已有主数据                     |
|  6 | 建立源单据            | 销售订单、BOM、采购单等表达业务承诺                                               | Source Document 模型                                        | 不把源单据当事实落账                     |
|  7 | 建立采购 / 质检 / 库存事实 | 入库、退货、调整、质检、批次、库存流水稳定                                             | inventory_txns、lots、balances、quality_inspections          | 不让客户配置库存核心规则                   |
|  8 | 建立生产 / 委外事实      | 生产领料、成品入库、委外发料、委外回货、返工                                            | production / outsourcing facts                            | 不只靠 workflow 状态表示生产完成          |
|  9 | 建立出货事实           | 出货放行、预留、拣货、实际出库分开                                                 | shipments、shipment_items、stock_reservations、outbound txns | 不把 shipping_released 当 shipped |
| 10 | 建立财务事实           | 应收、应付、发票、收付款、对账                                                   | AR/AP/invoice/payment/reconciliation                      | 不从订单或放行直接生成财务事实                |
| 11 | 建立权限职责体系         | 菜单权限、动作权限、工作流职责、数据范围清楚                                            | RBAC、Feature Flag、Data Scope                              | 不只做菜单隐藏                        |
| 12 | 建立正式产品入口          | 桌面端 + 手机端按产品能力、权限职责和客户菜单配置提供稳定入口                                     | V1 pages、formal menu entry、customer menu config、mobile task entry | 不为每个客户 fork 菜单，也不把菜单隐藏当权限边界 |
| 13 | 旧写入口退役与入口移除        | business_records 退出正式业务写路径，旧入口默认从正式产品入口删除或隐藏；底层历史数据只按迁移 / 审计需要处理 | transition audit、cutover plan、legacy entry removal plan | 不保留旧入口作为产品能力，不把旧数据无审计地写入新事实 |
| 14 | current 数据导入     | 当前甲方数据 dry-run、人工确认、受控导入                                          | import dry-run、unresolved queue、loader、acceptance report  | 不自动生成出货/库存/财务事实                |
| 15 | 客户试点上线           | current 甲方可真实试用主链路                                                | 私有化部署、迁移、备份、培训、试运行                                        | 不无备份上线                         |
| 16 | 交付运维体系           | 多客户私有化部署可复制                                                       | deployment package、release checklist、backup/restore       | 不每客户 fork 一套代码                 |
| 17 | 行业模板沉淀           | 将多个客户共性沉淀成毛绒玩具行业模板                                                | roles、menus、fields、print templates、numbering              | 不把单一客户特殊项变默认                   |
| 18 | 多客户复制            | 第二、第三个客户能快速部署                                                     | customer config package、import adapter、deployment notes   | 不做长期分叉                         |
| 19 | 产品成熟             | 核心业务闭环、数据可信、权限清楚、可交付可维护                                           | 版本化产品、回归测试、客户升级机制                                         | 不急着 SaaS                       |
| 20 | SaaS 评审          | 私有化多客户成熟后再评审 SaaS                                                 | tenant_id、隔离、计费、授权、运营后台设计                                 | 不提前污染当前 schema                 |

---

## 2. 第 0 阶段：明确产品定位

| 项目     | 内容                                                                            |
| ------ | ----------------------------------------------------------------------------- |
| 过程目标   | 把项目从“给某个甲方做系统”提升为“毛绒玩具行业 ERP 产品内核”                                            |
| 要解决的问题 | 防止项目变成一次性定制外包                                                                 |
| 最终结果   | 明确 Product Core、Industry Template、Customer Config、Customer Extension 的边界      |
| 关键产物   | product-principles.md、customer-instance-policy.md、zero-to-one-architecture.md |
| 成熟标志   | 所有后续开发都能判断某个需求属于产品内核、行业模板、客户配置还是客户扩展                                          |

### 2.1 产品定位

项目定位为：

* 毛绒玩具行业 ERP 产品内核。
* 先服务 current 甲方上线。
* 后续支持多个同行客户私有化部署。
* 未来再单独评审 SaaS 多租户。

### 2.2 current 客户定位

current 是：

* 第一个真实客户。
* 种子客户。
* 第一个私有化客户实例。
* 第一个客户配置包来源。

current 不是：

* SaaS runtime tenant。
* 数据库多租户。
* 多租户 RBAC 隔离对象。
* Product Core 规则来源。

### 2.3 当前阶段禁止项

当前阶段禁止：

* 不新增 tenant_id。
* 不实现 SaaS 多租户。
* 不实现 license server。
* 不实现套餐计费。
* 不实现客户工单系统。
* 不创建泛化 ChangeUsecase。
* 不创建泛化 change_records。
* 不把 current 客户资料写成 Product Core。
* 不让 WorkflowUsecase 写库存、出货、财务、应收、应付、发票、收付款事实。
* 不把 business_records 当长期事实真源。
* 不做 `business_records` 长期可写兼容。
* 不双写 V1 正式表和 `business_records`。
* 不让旧入口继续作为正式业务写入口。

---

## 3. 第 1 阶段：整理甲方资料与模糊需求

| 项目     | 内容                                                                                                                    |
| ------ | --------------------------------------------------------------------------------------------------------------------- |
| 过程目标   | 把甲方给的 Excel、PDF、截图、口头需求变成可分析材料                                                                                        |
| 要解决的问题 | 防止直接把样本字段写进 schema                                                                                                    |
| 最终结果   | 资料线索、假设、问题、决策、差异都有台账                                                                                                  |
| 关键产物   | source-materials.md、requirement-clues.md、assumption-register.md、question-backlog.md、decision-log.md、delta-register.md |
| 成熟标志   | 每个甲方输入都能被分类，而不是直接进入代码                                                                                                 |

### 3.1 资料分类

甲方资料应归类为：

* Customer Material
* Demo Seed
* Source Snapshot
* Data Import Source
* Print Template Input
* Industry Template Candidate
* QA Debug
* Do Not Import

### 3.2 资料不等于产品真源

甲方样本只能作为线索，不能直接成为：

* Product Core 必填字段。
* Ent schema 字段。
* 核心状态机规则。
* 通用产品流程。
* 财务事实规则。
* 库存事实规则。

### 3.3 需求澄清结果

最终要得到：

* 需求线索清单。
* 假设清单。
* 甲方问题清单。
* 已确认决策清单。
* 客户差异清单。
* 客户配置草案。

---

## 4. 第 2 阶段：建立产品化分层

| 层级                 | 含义          | 应包含                            | 不应包含           |
| ------------------ | ----------- | ------------------------------ | -------------- |
| Product Core       | 所有客户共用的产品内核 | 主数据、事实模型、核心 usecase、API、权限、审计  | current 客户专属字段 |
| Industry Template  | 毛绒玩具行业默认模板  | 默认角色、默认菜单、流程模式、字段模板、打印模板       | 无限制低代码         |
| Customer Config    | 客户配置包       | 公司信息、菜单开关、字段显示、编号规则、打印模板、初始化数据 | 库存扣减规则、财务核销规则  |
| Customer Extension | 极少数客户扩展     | 数据适配、专属模板、特殊报表                 | 核心事实分叉         |
| Runtime Tenant     | SaaS 多租户运行时 | tenant_id、租户隔离、计费授权            | 当前阶段不做         |

本文统一使用 `Customer Config` 表示客户配置包。若历史讨论或外部材料写成 `Tenant Config`，当前阶段只能按客户配置包理解，不代表 Runtime Tenant、`tenant_id`、多租户中间件或 SaaS 套餐能力。

### 4.1 客户可以配置

* 公司名。
* Logo。
* 菜单开关。
* 模块开关。
* 字段显示。
* 字段必填。
* 编号规则。
* 打印模板。
* 角色模板。
* 权限模板。
* 初始化数据。
* 默认仓库。
* 默认单位。

### 4.2 客户不能配置

* 入库是否增加库存。
* 出库是否扣库存。
* 库存流水能不能删除。
* 财务核销逻辑。
* 审计日志是否关闭。
* 核心状态机自由拖拽。
* 数据库结构。
* 自定义核心业务对象。

### 4.3 成熟结果

最终产品应该是：

* 一套产品内核。
* 一个毛绒玩具行业模板。
* 多个客户配置包。
* 少量客户扩展。
* 每客户独立私有化部署。
* 未来 SaaS 再单独评审。

### 4.4 三类台账作为路线图执行门禁

产品化分层不能只停留在原则文档。后续每个能力推进时，应同步落到三类台账：

| 台账 | 门禁问题 | Roadmap 影响 |
| --- | --- | --- |
| 产品能力进度台账 | 该能力是 L0 未开始、L3 草案、L5 后端可测、L7 UI 可试用，还是 L8 可交付？ | 决定它能否从设计阶段进入实现、试用或交付阶段 |
| 客户交付矩阵 | current 或其他客户是否真的能看到、试用、验收该能力？ | 防止 roadmap 写“可试用”但客户入口、数据、权限、培训或回滚缺失 |
| 客户差异台账 | 客户输入属于 Product Core、Industry Template、Customer Config、Extension、Import、Print、Reporting、Deferred 还是 Forbidden？ | 防止 current 样本字段、打印格式或旧快照字段直接污染 Product Core |

成熟度口径：

* L0-L3 只能作为规划、评审、草案或候选 Goal，不对客户承诺。
* L4-L6 只能作为内部可测或内部联调，不等于客户可试用。
* L7 可以成为客户试用候选，但必须显式写清不包含、前置条件和风险。
* L8 才能进入客户交付承诺；必须同时具备数据、权限、菜单、部署、培训、验收和回滚口径。

这意味着 roadmap 的下一步排序要同时看“产品内核优先级”和“交付台账阻塞项”。例如 current 要试用 V1，不只是写完 V1 页面，还必须处理菜单入口、旧写入口退役、导入 dry-run / 人工确认、权限模板、客户确认项和部署回滚。

### 4.5 系统分层进入 roadmap 的口径

系统分层表可以进入 roadmap，但只能进入“路线、顺序、边界和禁止项”层面；“当前已有内容 / 当前缺口 / 是否可试用 / 是否可交付”必须落到 `docs/product/product-delivery-ledgers.md` 和 `web/src/erp/docs/system-layer-progress.md`，避免 roadmap 变成第二份易漂移的实现台账。

| 层 | Roadmap 口径 | 当前状态跟踪 | 下一步排序原则 | 禁止项 |
| --- | --- | --- | --- | --- |
| Product Core 通用产品内核 | 所有客户共享的 schema、usecase、事实、权限、API / UI 和正式帮助口径 | 产品能力进度台账 + 当前真源 | 继续按主数据、源单据、事实闭环、API / UI、测试和文档逐步演进 | 不写死 current 甲方名称、logo、特殊字段或特殊流程 |
| Industry Template 行业模板 | 毛绒玩具行业默认角色、菜单、流程模式、字段样本、打印模板和初始化模板 | 产品能力台账 + 客户差异台账 | 先做模板清单，区分行业共性、current 样本和 deferred 输入 | 不把第一个客户样本等同于行业标准 |
| Customer Config 客户配置包 | 公司信息、logo、主题色、菜单开关、字段显示、编号规则、打印模板、角色权限模板和初始化数据 | 客户交付矩阵 + 客户差异台账 | 先设计配置形态和目录边界，不接 runtime loader，不加 `tenant_id` | 不实现 Runtime Tenant、多租户中间件、SaaS 套餐 |
| Customer Extension 客户扩展层 | 极少数客户专属逻辑的隔离边界 | 客户差异台账 | 只有真实出现专属逻辑时才建立 extension，并记录原因、范围、退出条件 | 不让核心 schema、库存、出货或财务规则为客户长期分叉 |
| Workflow 协同层 | 任务、事件、业务状态和必要任务派生 | 当前真源 + 系统分层进度 | 先守住 `shipment_release` 边界，再评审 Quality bridge 或后续 workflow 对接 | 不让 `WorkflowUsecase` 直接写库存、出货、财务事实 |
| MasterData 主数据层 | 客户、供应商、联系人、产品、材料、单位、仓库、BOM 等稳定主数据 | 当前真源 + 产品能力台账 | 先复用已落对象，再评审地址、账期、供应商物料档案和价格 | 不重复设计 products、materials、units、warehouses |
| Fact 事实层 | 采购、质检、库存、生产、委外、出货、财务等真实业务事实 | 当前真源 + 系统分层进度 | 按生产 / 委外 -> 出货 -> 财务顺序推进，具体事实单独评审 | 不把 `business_records` 或 workflow payload 当事实真源 |
| RBAC 权限层 | 菜单权限、动作权限、角色职责、数据范围和任务处理边界 | 产品能力台账 + 当前真源 | 每接一个事实 API，同步权限码、owner / assignee / status 校验和测试 | 不只靠前端隐藏菜单作为安全边界 |
| API / UI 层 | 将已评审 usecase 以 JSON-RPC/API、桌面页、移动任务和正式菜单投影出来 | 产品能力台账 + 客户交付矩阵 | 一次只接一个事实模块，不把 schema-only 或后端可测写成客户可用 | 不让前端继续做后端已迁规则的本地双写 |
| Help / Debug / QA 层 | 分离业务帮助、开发验收、客户交付说明和调试入口 | 系统分层进度 + 客户交付矩阵 | 先补业务版帮助，再保持开发验收入口不进普通帮助中心 | 不把 schema、migration、usecase 等开发术语暴露给业务用户 |
| Productization / Delivery 交付层 | 私有化部署包、客户配置包、初始化数据包、培训验收和维护交付 | 客户交付矩阵 + 产品化文档 | 先做目录隔离评审，再做配置包和部署模板 | 不提前做 `tenant_id`、license、计费、工单系统 |
| Reporting / Audit / Integration 后续增强层 | 报表、审计、附件、导入导出、扫码和外部集成 | 产品能力台账 | 事实层稳定后再做，不用报表倒推事实模型 | 不先做报表或集成反向污染核心事实 |

---

## 5. 第 3 阶段：建立 Workflow / Fact 状态边界

| 状态层          | 管什么        | 例子                                       | 是否事实       |
| ------------ | ---------- | ---------------------------------------- | ---------- |
| Workflow 协同层 | 谁处理、任务是否完成 | pending、done、blocked                     | 否          |
| 单据生命周期层      | 单据处于哪个阶段   | draft、submitted、shipping_released、closed | 部分是阶段，不是事实 |
| 业务事实层        | 真实发生的业务动作  | inventory_txns、shipments、payments        | 是          |
| 派生状态层        | 从事实计算的结果   | partial_shipped、fully_paid               | 不是原始事实     |
| 系统横切状态       | 导入、同步、任务过程 | processing、failed、synced                 | 否          |

核心口诀：

流程管协同，单据管阶段，事实管落账，结果靠计算，系统状态别混业务。

### 5.1 Workflow 边界

Workflow 只负责：

* 谁处理。
* 谁审批。
* 谁确认。
* 当前节点是否 done / blocked。
* 是否可以进入下一步。

Workflow 不负责：

* 写库存流水。
* 创建出货单。
* 扣减库存。
* 生成应收。
* 生成发票。
* 生成收付款。

### 5.2 shipping_released 边界

shipping_released 表示：

* 已放行。
* 可发货。
* 待出库。

shipping_released 不表示：

* 已出库。
* 已发货。
* 已扣库存。
* 已生成应收。
* 已开票。

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

| 分类         | 对象                                                                                                                                                                      |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| V1 Go      | customers、suppliers、contacts、sales_orders、sales_order_items                                                                                                             |
| Draft Only | product_skus、customer_addresses、supplier_material_profiles、settlement_terms、order_revisions、BOM version extension、purchase_orders、purchase_order_items、purchase_demands |
| Deferred   | stock_reservations、shipments、shipment_items、AR/AP/invoice/payment/reconciliation、production facts、outsourcing facts                                                     |

### 6.1 V1 为什么只做这些

V1 的目标是建立最小正式业务基础：

* 客户。
* 供应商。
* 联系人。
* 销售订单。
* 销售订单明细。

它不追求立刻做完整 ERP，因为：

* 出货事实还没有评审。
* 库存预留还没有评审。
* 财务事实还没有评审。
* 生产/委外事实还没有评审。
* `business_records` 旧写入口还需要退役审计。

---

## 7. 第 5 阶段：主数据建设全过程

| 业务对象         | 建设过程                                                        | 最终结果      | 后续扩展        |
| ------------ | ----------------------------------------------------------- | --------- | ----------- |
| customers    | 评审 -> schema -> migration -> repo/usecase -> API/RBAC -> UI | 正式客户主数据   | 地址、账期、信用额度  |
| suppliers    | 评审 -> schema -> migration -> repo/usecase -> API/RBAC -> UI | 正式供应商主数据  | 供应物料档案、结算资料 |
| contacts     | 评审 -> schema -> migration -> repo/usecase -> API/RBAC -> UI | 客户/供应商联系人 | 联系人权限、通知配置  |
| products     | 复用已有真源                                                      | 产品主数据     | SKU、图片、客户款号 |
| materials    | 复用已有真源                                                      | 材料主数据     | 替代料、供应商报价   |
| units        | 复用已有真源                                                      | 单位主数据     | 换算关系        |
| warehouses   | 复用已有真源                                                      | 仓库主数据     | 库位、仓区       |
| product_skus | 暂缓评审                                                        | 后续 SKU 模型 | 色号、尺寸、版本    |

### 7.1 主数据成熟结果

ERP 有稳定的主数据根基。

业务单据引用主数据，而不是把客户、供应商、产品、材料散落在文本字段里。

---

## 8. 第 6 阶段：销售订单 Source Document 建设全过程

| 阶段           | 过程                                 | 最终结果               | 关键边界                     |
| ------------ | ---------------------------------- | ------------------ | ------------------------ |
| 评审           | 明确 sales_order 是业务承诺               | 不把销售订单当出货事实        | Source Document 不等于 Fact |
| Schema       | 建 sales_orders / sales_order_items | 有正式订单源单据           | 不加 shipped_quantity      |
| Migration    | 生成表和索引                             | DB 可承载订单           | 不生成 shipment / finance   |
| Repo/Usecase | 建订单生命周期和行操作                        | 可创建、编辑、提交、激活、关闭、取消 | 不写库存                     |
| API/RBAC     | 暴露后端接口和权限                          | 后端可安全调用            | 后端校验权限                   |
| UI           | 建销售订单页面                            | 用户可录订单和明细          | UI 不显示 shipped           |
| 后续           | 与 shipment 事实衔接                    | 从真实出货推导履约          | 不从订单伪造出货                 |

### 8.1 当前销售订单生命周期

允许：

* draft -> submitted
* submitted -> active
* active -> closed
* draft / submitted / active -> canceled

禁止：

* any -> shipped
* order 直接写 shipment
* order 直接写 inventory_txns
* order 直接写 AR/AP
* order 直接生成 invoice/payment

### 8.2 销售订单成熟结果

系统有正式销售订单，但它只代表业务承诺。

真实出货、库存扣减、应收开票要后续独立事实层实现。

---

## 9. 第 7 阶段：采购 / 质检 / 库存事实全过程

| 阶段   | 过程                           | 最终结果     | 关键边界                 |
| ---- | ---------------------------- | -------- | -------------------- |
| 采购承诺 | purchase_orders 评审           | 采购订单表达承诺 | 不等于入库                |
| 采购入库 | purchase_receipts            | 采购入库事实   | 入库后才影响库存             |
| 采购退货 | purchase_returns             | 退货事实     | 写库存出向流水              |
| 入库调整 | purchase_receipt_adjustments | 调整事实     | 不直接改余额               |
| 质检   | quality_inspections          | 批次质检事实   | task done 不等于 passed |
| 批次   | inventory_lots               | 可追溯批次    | 批次状态受控               |
| 库存流水 | inventory_txns               | 库存真实变化   | 事实不可随便删              |
| 库存余额 | inventory_balances           | 查询缓存/余额  | 从流水派生或维护             |
| 可用量  | on_hand - reserved - frozen  | 支撑出货/预留  | 不等同总库存               |

最终结果：

库存可信，所有库存变化都有来源单据、流水、批次和可追溯状态。

---

## 10. 第 8 阶段：生产 / 委外事实全过程

| 模块                     | 建设过程                          | 最终结果       | 注意边界               |
| ---------------------- | ----------------------------- | ---------- | ------------------ |
| production_orders      | 评审 -> schema -> usecase -> UI | 生产任务 / 生产单 | 不代表已领料             |
| material_issue         | 生产领料事实                        | 材料库存扣减     | 必须写 inventory_txns |
| finished_goods_receipt | 成品入库事实                        | 成品库存增加     | 不等于 workflow done  |
| rework                 | 返工事实                          | 可追溯返工      | 不能只改状态             |
| outsource_orders       | 委外承诺                          | 委外加工单      | 不代表发料              |
| outsource_issue        | 委外发料事实                        | 材料转出/占用    | 要写库存事实             |
| outsource_receipt      | 委外回货事实                        | 回货记录       | 可能进入质检             |
| outsource_settlement   | 委外结算                          | 委外应付依据     | 不直接从 workflow 生成   |

最终结果：

生产和委外不只是任务状态，而是有真实领料、回货、入库、返工、结算事实。

---

## 11. 第 9 阶段：出货全过程

| 阶段   | 过程                                    | 最终结果                   | 禁止混淆          |
| ---- | ------------------------------------- | ---------------------- | ------------- |
| 出货放行 | shipment_release workflow             | shipping_released      | 不是已出库         |
| 出货计划 | shipments draft                       | 出货计划单                  | 不扣库存          |
| 库存预留 | stock_reservations                    | 锁定可用库存                 | 不等于出库         |
| 拣货   | picking                               | 仓库操作过程                 | 不等于 shipped   |
| 实际出库 | shipment shipped + inventory_txns OUT | 出货事实完成                 | shipped 才是真出货 |
| 订单履约 | 从 shipment facts 汇总                   | partial / full shipped | 派生状态          |
| 异常处理 | 取消/释放/冲正                              | 可回滚可追溯                 | 不直接删事实        |

最终结果：

出货可信，放行、预留、拣货、出库、库存扣减是分开的。

---

## 12. 第 10 阶段：财务全过程

| 阶段    | 过程                  | 最终结果     | 关键口径                    |
| ----- | ------------------- | -------- | ----------------------- |
| 应收草案  | 从真实出货或对账生成          | AR draft | 不从 shipping_released 生成 |
| 应付草案  | 从采购入库/委外结算/对账生成     | AP draft | 不从采购订单直接生成              |
| 发票    | invoice issued      | 开票事实     | 可作废/冲正                  |
| 收款    | payment received    | 收款事实     | 关联应收                    |
| 付款    | payment paid        | 付款事实     | 关联应付                    |
| 对账    | reconciliation      | 客户/供应商确认 | 可成为财务确认点                |
| 核销    | payment matching    | 清账状态     | 不靠手改状态                  |
| 调整/冲正 | adjustment/reversal | 错账修正     | 不能物理删除事实                |

最终结果：

财务可信，应收应付、发票、收付款、对账和核销都有事实来源和可追溯链路。

---

## 13. 第 11 阶段：权限职责体系全过程

| 层级                      | 过程        | 最终结果       | 注意         |
| ----------------------- | --------- | ---------- | ---------- |
| Feature Flag            | 控制模块是否启用  | 模块开关可控     | 不等于普通 RBAC |
| Menu Permission         | 控制菜单是否可见  | 用户看到合理入口   | 不是安全边界     |
| Action Permission       | 控制动作能否执行  | 后端校验动作     | 不能只靠按钮隐藏   |
| Data Scope              | 控制能操作哪些数据 | 仓库、客户、部门范围 | 后续细化       |
| Workflow Responsibility | 流程节点绑定职责  | 节点不绑定死岗位   | 客户角色可配置    |
| Audit                   | 记录谁做了什么   | 可追溯        | 不能关闭       |

最终结果：

权限不只是菜单隐藏，而是后端动作权限、职责权限、数据范围和审计共同构成安全边界。

权限和职责的产品化判断顺序：

```text
Feature Flag
-> RBAC action / responsibility permission
-> Data Scope
-> State Machine
-> Business Rule
-> Idempotency
-> Audit Log
```

客户角色可以灵活命名和组合，但产品内核应稳定定义职责 / 权限点。流程节点不应绑定死“仓库主管 / PMC / 财务主管”这类岗位，而应绑定 `shipment.release`、`stock_in.confirm`、`payment.approve` 等职责；不同客户再通过角色模板把职责分配给具体角色。

Feature Flag、菜单权限和动作权限也不能混用：

| 控制项 | 管什么 | 不能替代什么 |
| --- | --- | --- |
| Feature Flag | 客户是否启用某模块 | 不能替代动作权限、状态机和事实校验 |
| Menu Permission | 用户是否看到入口 | 不能替代后端安全边界 |
| Action / Responsibility Permission | 用户能否执行动作或处理节点 | 不能绕过数据范围、状态机和业务规则 |
| Data Scope | 用户能操作哪些数据 | 不能替代动作权限 |
| Audit Log | 记录谁做了什么 | 不能被客户配置关闭 |

---

## 14. 第 12 阶段：正式产品入口与菜单配置全过程

| 阶段                         | 过程                         | 最终结果             | 注意                                  |
| -------------------------- | -------------------------- | ---------------- | ----------------------------------- |
| V1 独立页面                    | 先建正式页面和路由                  | 可通过直链访问 V1       | 不写 fake truth                      |
| API client                 | 封装 JSON-RPC                | 页面调用后端           | 后端事实仍由 usecase / fact table 决定       |
| 权限按钮                       | 根据权限隐藏/禁用                  | 用户体验更清晰          | 后端动作权限才是安全边界                       |
| 旧入口审计                      | 审计 `business_records` 菜单和写路径 | 知道哪些入口重叠         | 不无证据删除历史数据                         |
| formal menu entry          | 把 V1 正式页面接入产品菜单             | 菜单切换方案           | 不改 seedData 前先确认入口和权限边界                    |
| entry dependency alignment | 对齐菜单、权限、docs、打印、mobile task 的入口依赖 | 后续菜单重构有统一口径      | 这是入口依赖清单，不是新建台账系统 |
| customer menu config       | 配置每客户菜单启用、隐藏、排序、文案和默认入口 | 每客户看到自己的菜单       | 不为每个客户 fork 一套菜单；隐藏菜单不是权限边界        |
| minimal official entry     | 小范围加 V1 正式入口               | 用户默认走 V1          | 不保留旧写入口作为正式业务入口                    |
| legacy entry removal boundary | 旧重叠入口删除、隐藏或从客户菜单移出        | 避免双真源            | 不双写，不承诺旧入口只读归档页                  |
| 全局菜单重构                     | 等事实层和能力边界更完整后再做            | 产品菜单稳定           | 不在早期大改                              |

最终结果：

前端从旧通用入口切到正式 V1 产品入口。菜单、移动端、权限、打印和 docs 后续应围绕正式产品入口同步；每个客户的菜单通过 customer menu config 配置隐藏、启用、排序和显示文案，而不是复制一套菜单代码。本阶段不要求实现新的台账系统或能力 registry。

### 14.1 Roadmap 只保留的产品目标

本阶段在 roadmap 中只保留产品目标：

* V1 正式页面进入正式产品菜单。
* 旧 `business_records` 重叠入口退出正式业务写路径。
* 客户菜单配置只控制启用、隐藏、排序、文案和默认入口。
* 菜单隐藏不替代 RBAC action permission、状态机、事实校验和审计。
* 移动端、帮助文档、打印模板入口跟随产品能力和客户启用状态。

菜单基线、current 组合入口拆分和隐藏后的业务保证不放在 roadmap 主文中，统一进入 `docs/product/formal-menu-entry-plan.md`。该文件只作为 013 的规划输入，不代表 seedData、docs registry、路由、权限码或前端 runtime 已修改。

---

## 15. 第 13 阶段：business_records 旧写入口退役与入口移除全过程

| 阶段 | 过程 | 最终结果 | 禁止事项 |
| --- | --- | --- | --- |
| 引用审计 | 查后端 / 前端 / seed / docs / tests | 知道哪里在用 | 不直接把旧入口迁成新产品入口 |
| 重叠矩阵 | 对比 V1 正式模型 | 知道哪些能力已由正式模型承接 | 不自动替换事实，不双写 |
| source snapshot | 如需迁移，冻结旧数据作为导入和审计参考 | 有可追溯证据 | 不把旧快照当新事实 |
| data map draft | 设计迁移映射 | 知道哪些字段可迁移、哪些丢弃、哪些待确认 | 不真实迁移 |
| dry-run | 扫描旧数据 | 输出可迁移 / 冲突 / 待确认 | 不写正式数据 |
| import decision | 人工确认导入范围 | 有批准或阻断依据 | 不自动批准 |
| hard cutover | 正式模型成为唯一写入口 | 旧写入口关闭 | 不双写 |
| remove / hide legacy entry | 删除、隐藏或从客户菜单中移出旧入口 | 客户默认只看到正式产品入口 | 不承诺旧入口只读归档页 |

最终结果：

`business_records` 从 runtime 正式业务写入口退役。旧入口不进入产品路线，默认删除或隐藏；底层历史数据是否保留，只按迁移、审计、回滚和客户确认需要决定。产品不承诺长期可写兼容、不双写，也不承诺旧入口只读归档页。

---

## 16. 第 14 阶段：current 客户数据导入全过程

| 阶段                   | 过程      | 最终结果                                      | 禁止事项      |
| -------------------- | ------- | ----------------------------------------- | --------- |
| source inventory     | 列出资料来源  | 知道数据从哪里来                                  | 不写数据库     |
| field classification | 字段分类    | Product Core / Customer Config / Deferred | 不把样本字段变必填 |
| dry-run plan         | 设计导入预演  | 可检查不落库                                    | 不真实导入     |
| unresolved queue     | 设计待处理队列 | 冲突/缺失/歧义可处理                               | 不静默丢弃     |
| acceptance checklist | 验收清单    | 导入前有客户确认                                  | 不无确认导入    |
| loader design        | 设计导入器   | 备份/回滚/幂等/审计                               | 仍不写代码     |
| dry-run tooling      | 写只读预演工具 | 输出 preview/conflict                       | 不写正式数据    |
| import execution     | 受控真实导入  | 写 V1 正式表                                  | 必须备份/回滚   |
| post-import audit    | 导入后校验   | 数量、字段、关系校验                                | 不只看成功日志   |

导入路线只按能力阶段判断，不按历史 Goal 编号判断。已有 dry-run / freeze / evidence 工具只能说明“预演和证据能力可用”，不能说明真实导入、DB 写入、客户批准或交付完成。

导入相关能力必须同时进入三类台账：

* 产品能力进度台账：记录 dry-run tooling、loader design、真实导入执行、post-import audit 各自成熟度和证据。
* 客户交付矩阵：记录 current 哪些资料已 freeze、哪些 dry-run 已通过、哪些需要客户确认、哪些仍 blocked。
* 客户差异台账：记录 Excel / PDF / 旧快照字段属于 Product Core、Customer Config、Data Import Adapter、Print Template、Deferred 还是 Forbidden。

真实导入前必须先有 loader design，而不是从 dry-run evidence 直接跳到写库。loader design 至少要覆盖备份、回滚、幂等键、冲突处理、unresolved queue、审计日志、重复导入保护、客户签字确认和导入后对账。

最终结果：

current 客户数据可受控导入，但不会污染 Product Core，也不会凭旧资料伪造出货、库存、财务事实。

---

## 17. 第 15 阶段：客户试点上线全过程

| 阶段              | 过程                    | 最终结果           | 注意                |
| --------------- | --------------------- | -------------- | ----------------- |
| 环境准备            | 私有化部署环境、数据库、对象存储      | current 可部署    | 不混 SaaS           |
| migration apply | 按 migration 顺序应用      | 数据库结构就绪        | 必须可回滚             |
| 初始配置            | 公司信息、角色、权限、仓库、单位      | current 可使用    | 配置不进 Product Core |
| 数据导入            | dry-run -> 人工确认 -> 导入 | current 初始数据就绪 | 不生成事实             |
| 培训              | 按岗位培训                 | 老板/业务/仓库/品质可试用 | 不讲技术术语            |
| 试运行             | 小范围真实录单               | 发现问题           | 不直接全量切换           |
| 问题收集            | 需求 / bug / 数据问题分类     | 进入 backlog     | 不直接乱改             |
| 验收              | 当前阶段验收                | 可进入下一阶段        | 有签字/确认记录          |

### 17.1 Roadmap 只保留的试点目标

current MVP 具体能力清单、客户可见方式、前置条件和风险不放在 roadmap 主文中，统一由 `docs/product/product-delivery-ledgers.md` 的客户交付矩阵维护。更细的近期试用需求可后续拆到 `docs/product/current-mvp-requirements-baseline.md`。

本路线图只保留试点目标：

* current 甲方可以使用正式主数据和销售订单源单据入口。
* 旧 `business_records` 写入口不再作为正式业务入口。
* current 数据经过 freeze、dry-run、人工确认、备份和回滚方案后受控导入。
* 菜单、权限、部署、备份、培训和验收能支撑小范围真实试运行。
* 已有后端事实能力不自动等于本期必须开放完整 UI / API；是否进入试用由客户交付矩阵和单独 Goal 决定。

最终结果：

current 甲方能真实试用系统，并且反馈能分类进入产品、配置、模板、扩展或数据导入改进。

---

## 18. 第 16 阶段：交付运维体系全过程

| 能力        | 过程                                 | 最终结果     |
| --------- | ---------------------------------- | -------- |
| 部署包       | config + env + compose + 初始化数据 | 每客户可独立部署 |
| 备份        | DB / 文件 / 对象存储备份                   | 可恢复      |
| 恢复        | restore runbook                    | 出问题能回滚   |
| migration | 迁移顺序和状态检查                          | 可升级      |
| 发布        | release checklist                  | 可控发版     |
| 回滚        | rollback plan                      | 出错可退     |
| 日志        | 运行日志 / 操作日志                        | 可排查      |
| 监控        | 健康检查、错误告警                          | 可维护      |
| 培训        | 客户培训资料                             | 可交付      |
| 验收        | 验收清单                               | 可收款/维护   |

当前交付主路径仍以 Compose 为准；Kubernetes 只能作为未来单独评审方向，不进入当前部署包默认范围。

客户交付包应优先沉淀为配置、模板、导入适配和部署资料，而不是代码分叉。典型交付包内容：

* 公司信息。
* Feature Flags / 模块开关。
* 角色模板与权限模板。
* 字典和初始化数据。
* 客户菜单配置。
* 打印模板。
* 导入 mapper。
* 部署参数与备份恢复说明。
* 客户差异说明和验收清单。

客户管理员未来可以维护低风险配置，但高风险配置必须有保护机制：配置变更日志、配置版本、预览、回滚、高危权限确认、权限互斥、模块依赖校验和后端强校验。审计日志不能作为客户自助配置项关闭。

最终结果：

系统不是只在开发环境能跑，而是能交付、升级、备份、恢复、维护。

---

## 19. 第 17 阶段：行业模板沉淀全过程

| 来源         | 沉淀过程      | 最终产物                      |
| ---------- | --------- | ------------------------- |
| current 甲方 | 只作为第一客户样本 | current config package    |
| 第二个客户      | 对比差异      | template candidate        |
| 第三个客户      | 验证共性      | industry template default |
| 多客户反馈      | 归纳行业共性    | plush industry template   |
| 特殊需求       | 保持客户配置或扩展 | customer delta            |

行业模板包括：

* 默认角色。
* 默认菜单。
* 默认流程模式。
* 默认字段显示。
* 默认编号规则。
* 默认打印模板。
* 默认导入模板。
* 默认培训文档。
* 默认验收清单。

最终结果：

毛绒玩具同行客户可以用同一套行业模板快速初始化，而不是每家重新设计。

---

## 20. 第 18 阶段：多客户复制全过程

| 阶段     | 过程                                   | 最终结果                          |
| ------ | ------------------------------------ | ----------------------------- |
| 新客户调研  | 收资料和问题                               | source materials              |
| 配置包复制  | 从行业模板生成客户配置                          | customer config               |
| 数据导入适配 | 设计 mapping / dry-run                 | import plan                   |
| 私有化部署  | 独立 DB / 对象存储 / env                   | customer instance             |
| 差异分类   | Core / Template / Config / Extension | delta register                |
| 试运行    | 小范围上线                                | trial report                  |
| 模板回流   | 多客户共性回产品                             | industry template improvement |
| 维护收费   | 年维护 / 私有化服务                          | 商业闭环                          |

最终结果：

新增客户时，主要工作是配置、导入和少量适配，而不是复制一套代码。

---

## 21. 第 19 阶段：产品成熟标准

产品成熟不是“页面很多”，而是满足以下条件：

| 维度   | 成熟标准                                                   |
| ---- | ------------------------------------------------------ |
| 数据模型 | 主数据、源单据、事实、派生状态边界清楚                                    |
| 业务闭环 | 订单、采购、生产、委外、库存、出货、财务闭环                                 |
| 状态机  | 每类状态有合法跳转和终态保护                                         |
| 事实追溯 | 库存、出货、财务都能追溯来源                                         |
| 权限职责 | 菜单、按钮、动作、数据范围、流程职责分离                                   |
| 客户配置 | 多客户差异通过配置包管理                                           |
| 交付   | 私有化部署、备份、回滚、升级可执行                                      |
| 测试   | 单元、集成、回归、E2E、导入 dry-run 覆盖关键链路                         |
| 文档   | current-source、progress、runbook、training、acceptance 完整 |
| 多客户  | 第二/第三客户能复用模板而不是 fork 代码                                |

---

## 22. 第 20 阶段：未来 SaaS 评审

只有在私有化多客户成熟后，再评审 SaaS。

SaaS 评审内容包括：

* tenant_id 是否进入 schema。
* 租户数据隔离模型。
* 对象存储隔离。
* RBAC 多租户化。
* 运营后台。
* license / billing。
* 套餐权限。
* 客户工单系统。
* 多租户迁移方案。
* 私有化与 SaaS 共存策略。

当前阶段明确不做。

---

## 23. 从现在到产品完善的建议路线

后续每个正式 Goal 的前置检查应包含：

```text
workspace checkpoint
-> roadmap / product-delivery-ledgers impact check
-> current-source-of-truth verification
-> allowed / forbidden path confirmation
```

其中 `roadmap / product-delivery-ledgers impact check` 不单独占用产品路线编号。如果未来确实需要一次专门的台账收口，应作为 `docs/codex-goals/*.md` 内的治理任务或 `progress.md` 过程记录，不写进本文建议路线。它只要求在拆新 Goal 前回答：

* 是否改变某个产品能力成熟度。
* 是否改变 current 或其他客户交付状态。
* 是否新增、重分类或关闭某个客户差异。
* 是否从 imported-notes 吸收了只能作为参考的原则。
* 是否需要同步 `docs/current-source-of-truth.md`。

建议后续路线：

```text
013 v1-formal-menu-and-legacy-entry-exit
014 current-customer-import-loader-design
015 current-customer-import-loader-implementation
016 current-import-execution-and-audit
017 current-trial-deployment-package
018 current-trial-acceptance
019 product-sku-bom-version-review
020 purchase-order-usecase-review
021 shipment-usecase-review
022 stock-reservation-usecase
023 shipment-outbound-inventory-fact
024 finance-ar-ap-invoice-payment-review
025 production-fact-review
026 outsourcing-fact-review
027 mobile-task-entry
028 industry-template-hardening
029 private-deployment-productization
030 SaaS-multitenancy-review
```

`workspace checkpoint` 是每个正式 Goal 的前置检查，不单独占用编号，除非未来明确要做一次专门的工作区收口 Goal。

如果目标是尽快给 current 甲方试用：

```text
workspace checkpoint
-> roadmap / product-delivery-ledgers impact check
-> V1 formal menu and legacy entry exit
-> current import loader design
-> current import loader implementation
-> current import execution and audit
-> current trial deployment package
-> current trial acceptance
```

如果目标是尽快完善产品内核：

```text
workspace checkpoint
-> roadmap / product-delivery-ledgers impact check
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
-> business_records 旧写入口退役
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
