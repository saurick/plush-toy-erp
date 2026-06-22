# 文档入口与治理 / docs Guide

本目录服务三类任务：

1. 找到当前真源，判断“现在到底做没做”。
2. 进入产品、架构、客户、部署或测试文档的主路径。
3. 维护文档时保持索引、清单、README 和运行时边界一致。

本文是 `docs/` 的入口和治理说明，不是 runtime、schema、migration、API、UI 或部署状态真源。判断当前实现状态时，先读 [当前真源与交接顺序](当前真源与交接顺序.md)，再回到当前代码、migration 和测试。

## 先读哪几份 / Reader Paths

| 要解决的问题 | 先读 | 再读 / 验证 |
| --- | --- | --- |
| 判断当前能力是否可用 | [当前真源与交接顺序](当前真源与交接顺序.md) | [产品能力进度台账](product/产品能力进度台账.md)、相关代码、migration、测试 |
| 判断治理维度与口径、职责边界、验证口径或文档真源层级 | [项目治理地图](项目治理地图.md) | [当前真源与交接顺序](当前真源与交接顺序.md)、[模块实施治理](product/模块实施治理.md)、[自动化测试策略](product/自动化测试策略.md)、[AGENTS.md](../AGENTS.md) |
| 规划下一轮产品实现 | [产品完成路线图](product/产品完成路线图.md) | [产品台账索引](product/产品台账索引.md)、[模块实施治理](product/模块实施治理.md)、对应目录 README |
| 改菜单、页面、原型或信息密度 | [web/README.md](../web/README.md)、[产品原型资产](product/prototypes/README.md) | 对应原型 README、真实运行页、[正式产品入口与菜单配置计划](product/正式产品入口与菜单配置计划.md) |
| 改 Workflow、状态或 Fact 边界 | [状态 / Workflow / Fact 边界](architecture/状态工作流事实边界.md) | 相关 architecture 评审、[server/README.md](../server/README.md)、usecase / schema / test |
| 改客户资料、导入或交付资料 | [客户资料入口](customers/README.md)、[yoyoosun 客户资料](customers/yoyoosun/README.md) | [客户交付矩阵](customers/yoyoosun/客户交付矩阵.md)、[客户差异台账](customers/yoyoosun/客户差异台账.md)、[source-manifest.json](customers/yoyoosun/source-manifest.json)、对应脚本说明 |
| 改部署、发布或低配运行口径 | [部署约定](部署约定.md) | [server/deploy/README.md](../server/deploy/README.md)、[prod Compose README](../server/deploy/compose/prod/README.md)、[scripts/README.md](../scripts/README.md) |
| 查全量 Markdown 在哪里 | [文档清单](文档清单.md) | 最近目录 README、`rg` 搜索和当前代码 |

只改正文、措辞或局部说明时，通常不需要更新全量清单；新增、删除、重命名、重分类或改变文档职责时，必须同步更新 `docs/文档清单.md` 和最近目录 README。

## 文档地图 / Documentation Map

| 区域 | 回答什么问题 | 入口 |
| --- | --- | --- |
| 当前真源 | 当前状态、阅读顺序、部署和实现边界 | [当前真源与交接顺序](当前真源与交接顺序.md) |
| 项目治理 | 治理维度与口径、判断路径、专题真源分流 | [项目治理地图](项目治理地图.md) |
| 产品与路线 | 产品路线、能力台账、页面 / 菜单 / 原型、产品化治理 | [product/README.md](product/README.md) |
| 架构评审 | Workflow / Fact / MasterData / Source Document / 状态边界 | [architecture/README.md](architecture/README.md) |
| 客户资料 | 客户资料、客户差异、导入准备、交付矩阵 | [customers/README.md](customers/README.md) |
| 部署与运行 | 低配发布、Compose 主路径、迁移和发布门禁 | [部署约定](部署约定.md) |
| 工作流 / 角色 / 财务 / 仓库 / 可观测性 | 专题设计和第一版业务说明 | [workflow](workflow/README.md)、[roles](roles/README.md)、[finance](finance/README.md)、[warehouse](warehouse/README.md)、[observability](observability/README.md) |
| 参考与归档 | 外部输入、历史证据、旧过程记录 | [reference](reference/README.md)、[archive](archive/README.md) |

`docs/reference/**` 只作为设计输入，`docs/archive/**` 和 `progress.md` 只作为历史 / 过程证据。两者都不能直接覆盖当前代码、正式文档、migration 或测试。

## 可视化图索引 / Visual Diagram Index

本节只列出当前已维护的 Mermaid 图，方便快速定位流程和边界。图是阅读辅助，不替代正式文字、代码、migration 或测试。

| 图 | 位置 | 用途 |
| --- | --- | --- |
| 项目治理分流 / Governance Routing | [项目治理地图](项目治理地图.md) | 说明任务问题如何分流到 AGENTS、当前真源、模块实施治理、测试策略、客户 / 部署和页面原型等专题真源。 |
| 产品核心与客户投影 / Product Core And Customer Projection | [模块边界](product/模块边界.md) | 区分 Product Core、客户投影、升级门禁和 Workflow / Fact 禁区。 |
| yoyoosun 客户投影 / Yoyoosun Customer Projection | [yoyoosun 客户资料](customers/yoyoosun/README.md) | 说明 yoyoosun 原始资料、客户配置、模拟 seed、模板候选、Product Core、tenant 和事实表边界。 |
| 出货放行边界 / Shipment Release Boundary | [状态 / Workflow / Fact 边界](architecture/状态工作流事实边界.md) | 锁住 `shipment_release done -> shipping_released`，避免把放行误判成 shipment、inventory 或 finance facts。 |
| T1-T8 主任务树 / Main Task Flow | [工作流主任务树第一版](workflow/工作流主任务树第一版.md) | 作为 Workflow 协同主链和事实 usecase 落账边界的可视化索引。 |
| 标准实施门禁 / Standard Delivery Gate | [模块实施治理](product/模块实施治理.md) | 说明从 docs-only review 到 schema、usecase、API、UI、测试、文档和交付的门禁。 |

## 文档写法 / Writing Rules

文档先按职责分层，再决定写法。普通说明文档默认写目标、职责、当前真源、主路径和验收方式；规则、限制和红线应优先放在 `AGENTS.md`、实施治理、测试策略、部署约定、hook 或 QA 脚本中。

| 文档类型 | 主要写什么 | 红线放在哪里 |
| --- | --- | --- |
| 规则文档 | AI / 开发者容易误操作的约束、守卫和执行流程 | 可写少量明确红线，并尽量配自动化守卫或验收命令 |
| 真源索引 | 当前事实、阅读顺序、实现状态和正式入口 | 以“当前真源是...”为主，风险只写会导致误判的边界 |
| 产品 / 架构设计 | 能力目标、领域边界、状态机、事实源、接口和测试证据 | 以主路径和归属关系为主，负面例子只用于防止已知高风险混淆 |
| 原型 / 样板 | 资产用途、阶段、归属、吸收范围、正式实现入口 | 写“如何吸收”和“正式真源是谁”，少写无限扩张的“不替代”列表 |
| 客户 / 交付资料 | 客户输入、配置草案、验收状态、交付边界和待确认项 | 客户差异优先写归属与处理路径；隐私、真实导入、事实写入等高风险项才写硬限制 |
| 参考 / 归档 | 外部输入和历史追溯 | 入口 README 标注 Reference / Archive；正文保持原貌，避免改写历史证据 |

写作时优先让读者能执行下一步：

- 结论、当前状态、主路径、命令和风险边界放在历史背景前面。
- 表格用于短字段和横向比较；步骤用编号列表；规则和边界用短段落。
- 命令要可复制，并写清工作目录、成功信号和失败时应看哪里。
- Mermaid 只在能减少理解成本时添加；图旁边必须有文字说明其回答的问题。

## 索引同步 / Index Sync

`docs/文档清单.md` 是当前仓库 Markdown 文档的查阅索引。以下情况必须同步更新它：

- 新增、删除或重命名长期维护 Markdown。
- 调整文档用途、归属目录、入口状态或真源状态。
- 修改标题或正文后，导致清单里的“标题 / 当前用途”失真。

长期维护且容易误读职责的目录应保留对应 `README.md`。目录 README 只维护目录职责、非真源边界和更新规则，不重复每篇文档正文细节。

## 文件名与 metadata / Filenames And Metadata

长期维护 Markdown 文档默认使用中文文件名，让文件树先服务人工查找。英文名、英文术语或稳定 anchor 保留在 H1、metadata、摘要、正文或 `docs/文档清单.md` 中，用于搜索、对照和跨工具引用。

不机械中文化的例外包括：

- `README.md`、`AGENTS.md`、`CHANGELOG.md` 等约定文件名。
- `docs/archive/**` 中作为历史证据保留的旧文件。
- `docs/reference/**` 中需要保持外部输入原貌的资料。
- 被脚本、URL、原型查看器、生成流程或外部链接稳定引用，且尚未完成迁移评审的文件或目录。
- 代码包名、API、表名、配置 key、状态 key 等必须保持英文稳定锚点的技术对象。

当前仓库不要求所有 Markdown 都添加 YAML frontmatter 或统一 metadata 头。若某篇文档已经使用 `Doc Type`、`Status`、`Source`、`Current Implementation Source of Truth` 等 metadata 字段，字段名和值应尽量中英双语，避免清单和正文变成只有英文 anchor 的维护者索引。

## 产品内入口边界 / Runtime Docs Boundary

当前前端不再维护产品内文档中心、帮助中心、高级文档和开发与验收页面：

- 不再维护 `web/src/erp/docs/*.md`、`web/src/erp/config/docs.mjs` 或 `docRegistry`。
- 旧 `/erp/docs/*`、`/erp/qa/*`、`/erp/help-center`、`/erp/source-readiness`、`/erp/mobile-workbenches` 和 `/erp/roles/*` 路径只做兼容重定向到 `/erp/dashboard`。
- 正式文档继续保留在 `docs/`、`server/docs/`、`web/README.md`、`server/README.md` 等仓库文档入口，不复制或镜像到前端运行时页面。
- 本地开发态可通过 `/__dev/governance` 只读浏览 [项目治理地图](项目治理地图.md) 的治理维度与口径、任务分流和文档跳转；该入口不进入 ERP 正式菜单，也不替代 Markdown 真源。

未来若重新新增产品内文档入口，必须先设计 registry、seed navigation、菜单权限、路由、渲染代码和测试断言；不要为了静态说明页临时恢复旧 docs registry。

## 相关目录

- 产品与路线：[product/README.md](product/README.md)
- 架构评审：[architecture/README.md](architecture/README.md)
- 客户资料：[customers/README.md](customers/README.md)
- 外部参考：[reference/README.md](reference/README.md)
- 归档：[archive/README.md](archive/README.md)
- 后端总览：[server/README.md](../server/README.md)
- 后端专题：[server/docs/README.md](../server/docs/README.md)
- Compose 部署：[server/deploy/README.md](../server/deploy/README.md)
- 脚本说明：[scripts/README.md](../scripts/README.md)
