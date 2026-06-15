# 文档目录说明 / docs Directory Guide

本目录存放仓库级约定和当前项目基线，优先服务于“当前该读什么、当前部署走哪条路径、当前还缺什么信息”这三类问题。

## 文档治理原则 / Documentation Governance

文档先按职责分层，再决定写法。规则、限制和普通说明不能混成一类：

| 文档类型 | 主要写什么 | 红线放在哪里 |
| --- | --- | --- |
| 规则文档 | AI / 开发者容易误操作的约束、守卫和执行流程，例如 `AGENTS.md`、实施治理、测试策略、部署约定 | 可以写少量明确红线，并尽量配自动化守卫或验收命令 |
| 真源索引 | 当前事实、阅读顺序、实现状态和正式入口，例如 `docs/当前真源与交接顺序.md` | 以“当前真源是…”为主，风险只写会导致误判的边界 |
| 产品 / 架构设计 | 能力目标、领域边界、状态机、事实源、接口和测试证据 | 以主路径和归属关系为主，负面例子只用于防止已知高风险混淆 |
| 原型 / 样板 | 资产用途、阶段、归属、吸收范围、正式实现入口 | 写“如何吸收”和“正式真源是谁”，少写无限扩张的“不替代”列表 |
| 客户 / 交付资料 | 客户输入、配置草案、验收状态、交付边界和待确认项 | 客户差异优先写归属与处理路径；只有隐私、真实导入、事实写入等高风险项写硬限制 |
| 参考 / 归档 | 外部输入和历史追溯 | 入口 README 标注 Reference / Archive；正文保持原貌，避免改写历史证据 |

普通说明文档优先使用正向表达：这个文档服务什么读者、当前真源是谁、内容如何进入实现、需要同步哪些测试或文档。`不要 xxx`、`禁止 xxx`、`不替代 xxx` 只用于 AI 经常犯错、已经反复污染主路径、或会造成数据 / 权限 / 部署风险的边界。能由脚本守住的规则，应写清脚本入口，而不是在多个文档里复制同一串负面清单。

## 入口

- 阅读顺序与真源：`/Users/simon/projects/plush-toy-erp/docs/当前真源与交接顺序.md`
- 文档清单：`/Users/simon/projects/plush-toy-erp/docs/文档清单.md`
- 部署口径：`/Users/simon/projects/plush-toy-erp/docs/部署约定.md`
- 产品完成路线图：`/Users/simon/projects/plush-toy-erp/docs/product/产品完成路线图.md`
- 产品台账索引：`/Users/simon/projects/plush-toy-erp/docs/product/产品台账索引.md`
- 产品能力进度台账：`/Users/simon/projects/plush-toy-erp/docs/product/产品能力进度台账.md`
- 架构评审：`/Users/simon/projects/plush-toy-erp/docs/architecture/`
- 历史归档：`/Users/simon/projects/plush-toy-erp/docs/archive/`

## 可视化图索引 / Visual Diagram Index

本节只列出当前已维护的 Mermaid 图，方便快速定位流程和边界。图只是正式文档的可视化索引，不替代 `docs/当前真源与交接顺序.md`、代码、migration 或测试。

| 图 | 位置 | 用途 |
| --- | --- | --- |
| 产品核心与客户投影 / Product Core And Customer Projection | `/Users/simon/projects/plush-toy-erp/docs/product/模块边界.md` | 区分 Product Core、客户投影、升级门禁和 Workflow / Fact 禁区。 |
| yoyoosun 客户投影 / Yoyoosun Customer Projection | `/Users/simon/projects/plush-toy-erp/docs/customers/yoyoosun/README.md` | 说明 yoyoosun 原始资料、客户配置、模拟 seed、模板候选、Product Core、tenant 和事实表边界。 |
| 出货放行边界 / Shipment Release Boundary | `/Users/simon/projects/plush-toy-erp/docs/architecture/状态工作流事实边界.md` | 锁住 `shipment_release done -> shipping_released`，禁止直接生成 shipment、inventory 或 finance facts。 |
| T1-T8 主任务树 / Main Task Flow | `/Users/simon/projects/plush-toy-erp/docs/workflow/工作流主任务树第一版.md` | 作为 Workflow 协同主链和事实 usecase 落账边界的可视化索引。 |
| 标准实施门禁 / Standard Delivery Gate | `/Users/simon/projects/plush-toy-erp/docs/product/模块实施治理.md` | 说明从 docs-only review 到 schema、usecase、API、UI、测试、文档和交付的门禁。 |

## 设计文档分类入口 / Design Document Entry Points

本节只按人工校对和任务拆分顺序提供常用入口，不替代完整文档清单。判断当前实现状态时，仍以 `docs/当前真源与交接顺序.md`、当前代码、migration 和测试为准。

### 顶层设计 / Top-level Design

- 当前真源与阅读顺序：`/Users/simon/projects/plush-toy-erp/docs/当前真源与交接顺序.md`
- 产品完成路线图：`/Users/simon/projects/plush-toy-erp/docs/product/产品完成路线图.md`
- 零到一产品架构：`/Users/simon/projects/plush-toy-erp/docs/product/零到一产品架构.md`
- 产品原则：`/Users/simon/projects/plush-toy-erp/docs/product/产品原则.md`
- 模块边界：`/Users/simon/projects/plush-toy-erp/docs/product/模块边界.md`
- 模块实施治理：`/Users/simon/projects/plush-toy-erp/docs/product/模块实施治理.md`
- 产品台账索引：`/Users/simon/projects/plush-toy-erp/docs/product/产品台账索引.md`
- 产品能力进度台账：`/Users/simon/projects/plush-toy-erp/docs/product/产品能力进度台账.md`

### 详细设计 / Detailed Design

- 领域模型 V1：`/Users/simon/projects/plush-toy-erp/docs/product/领域模型第一版.md`
- 正式产品入口与菜单配置计划：`/Users/simon/projects/plush-toy-erp/docs/product/正式产品入口与菜单配置计划.md`
- 移动端岗位任务页改版：`/Users/simon/projects/plush-toy-erp/docs/product/移动端岗位任务页改版.md`
- 配置与权限策略：`/Users/simon/projects/plush-toy-erp/docs/product/配置与权限策略.md`
- 客户实例策略：`/Users/simon/projects/plush-toy-erp/docs/product/客户实例策略.md`
- 客户差异策略：`/Users/simon/projects/plush-toy-erp/docs/product/客户差异策略.md`
- 架构评审入口：`/Users/simon/projects/plush-toy-erp/docs/architecture/README.md`

### 测试与验收设计 / Test And Acceptance Design

- 自动化测试策略：`/Users/simon/projects/plush-toy-erp/docs/product/自动化测试策略.md`
- 发布门禁：`/Users/simon/projects/plush-toy-erp/docs/product/发布门禁.md`
- 迁移准备检查清单：`/Users/simon/projects/plush-toy-erp/docs/product/迁移准备检查清单.md`
- QA 脚本说明：`/Users/simon/projects/plush-toy-erp/scripts/README.md`

### 客户与交付设计 / Customer And Delivery Design

- 客户资料入口：`/Users/simon/projects/plush-toy-erp/docs/customers/README.md`
- 永绅 yoyoosun 客户资料：`/Users/simon/projects/plush-toy-erp/docs/customers/yoyoosun/README.md`
- 产品台账索引：`/Users/simon/projects/plush-toy-erp/docs/product/产品台账索引.md`
- 永绅 yoyoosun 客户交付矩阵：`/Users/simon/projects/plush-toy-erp/docs/customers/yoyoosun/客户交付矩阵.md`
- 永绅 yoyoosun 客户差异台账：`/Users/simon/projects/plush-toy-erp/docs/customers/yoyoosun/客户差异台账.md`
- 部署口径：`/Users/simon/projects/plush-toy-erp/docs/部署约定.md`
- Compose 部署：`/Users/simon/projects/plush-toy-erp/server/deploy/README.md`

### 参考与归档 / Reference And Archive

- 外部参考：`/Users/simon/projects/plush-toy-erp/docs/reference/README.md`
- imported design notes：`/Users/simon/projects/plush-toy-erp/docs/reference/imported-notes/README.md`
- 历史归档：`/Users/simon/projects/plush-toy-erp/docs/archive/README.md`

## 文档 metadata 与产品内入口边界

当前仓库不要求所有 Markdown 都添加 YAML frontmatter 或统一 metadata 头。metadata 的目的不是制造新真源，而是减少入口、受众、状态和是否已接产品页面的信息差。

当前前端不再维护产品内文档中心、帮助中心、高级文档和开发与验收页面：

- 不再维护 `web/src/erp/docs/*.md`、`web/src/erp/config/docs.mjs` 或 `docRegistry`。
- 旧 `/erp/docs/*`、`/erp/qa/*`、`/erp/help-center`、`/erp/source-readiness`、`/erp/mobile-workbenches` 和 `/erp/roles/*` 路径只做兼容重定向到 `/erp/dashboard`。
- 正式文档继续保留在 `docs/`、`server/docs/`、`web/README.md`、`server/README.md` 等仓库文档入口，不复制或镜像到前端运行时页面。

若后续新增可被机器读取或跨团队复用的 metadata，必须同时保留中文说明和 English anchor：

- 中文用于人工复查、交接和业务语义理解。
- English anchor 用于机器检索、跨工具对齐、导入导出、API / config / status code 等稳定键名。
- 对同一字段不要只写中文或只写英文；推荐使用成对字段，例如 `title_zh` / `title_en`、`summary_zh` / `summary_en`、`status_zh` / `status_key`。
- English anchor 应保持稳定、短小、可检索，不要为了翻译优雅频繁改名；中文说明可以随业务口径优化。
- 当前前端没有文档 registry；除非重新设计产品内文档中心并同步渲染代码、菜单、权限和测试，不要把 metadata 字段写成已被运行时消费的能力。

不需要产品内 metadata 的文档类型如下：

| 文档类型 | 示例 | 不加产品内 metadata 的原因 | 应保留的信息 |
| --- | --- | --- | --- |
| 仓库 / 子系统 README | `README.md`、`docs/README.md`、`web/README.md`、`server/README.md`、`scripts/README.md` | 这是目录和使用说明，不是产品内文档页 | 入口、目录职责、命令、当前边界 |
| 当前真源索引 | `docs/当前真源与交接顺序.md` | 本身就是阅读顺序和真源索引，不需要再被前端 registry 二次定义 | 真源原则、当前状态、按任务分流 |
| 产品 / 架构正式文档 | `docs/product/*`、`docs/architecture/*` | 这些是仓库正式评审和路线文档，不再镜像到前端文档中心 | 结论、范围、真源 / 非真源、后续边界 |
| archive / progress | `docs/archive/*`、`progress.md` | 只用于过程追溯，不作为当前实现或产品路线真源；原 `docs/changes/*` 历史文件已删除 | 归档说明、发生时间、非真源声明 |
| imported notes / 外部输入 | `docs/reference/imported-notes/*` | 只作为参考输入，不能直接驱动 runtime、schema、migration 或 roadmap | 来源、导入时间、Reference Only、Not Source Of Truth |
| 后端 / 内部技术文档 | `server/docs/*`、`server/internal/**/README.md` | 面向子系统维护，不进入产品内文档入口 | 子系统边界、命令、配置、维护注意事项 |

不需要产品内 metadata 不等于不需要中文。任何文档只要已经出现 `Doc Type`、`Status`、`Source`、`Current Implementation Source of Truth` 等 metadata 字段，都必须至少做到字段名中英双语；其中 `Doc Type / 文档类型` 的类型值必须保留 English anchor 并补中文说明，例如 `Yoyoosun Source Snapshot Freeze Evidence / yoyoosun 来源快照冻结证据`。`Status`、`Source` 等状态值或来源值若容易误解，也应补中文说明。

`docs/文档清单.md` 是当前仓库 Markdown 文档的查阅索引。新增、删除、重命名长期维护文档，或调整文档用途、归属分类、入口状态时，必须同步更新该索引。只改正文但不改变文档职责和分类时，可以不更新该索引；如果清单中的“标题 / 当前用途”会因此失真，则必须同步更新。

`docs/文档清单.md` 的“标题 / 当前用途”列默认采用中文主体 + English anchor。若原文档标题是英文，清单里也要补中文说明，方便人工审查时先读懂用途，再保留英文锚点用于检索和对照。

长期维护 Markdown 文档默认使用中文文件名，让文件树先服务人工查找。英文名、英文术语或稳定 anchor 保留在 H1、metadata、摘要、正文或 `docs/文档清单.md` 中，用于搜索、对照和跨工具引用。新增或重命名文档时，应同步修正：

- `docs/文档清单.md`。
- 所属目录的 `README.md`。
- 正文链接、原型入口、脚本引用和测试断言。

不要求机械改成中文文件名的情况包括：

- `README.md`、`AGENTS.md`、`CHANGELOG.md` 等约定文件名。
- `docs/archive/**` 中作为历史证据保留的旧文件。
- `docs/reference/**` 中需要保持外部输入原貌的资料；整理后的参考资料可以使用中文文件名。
- 被脚本、URL、原型查看器、生成流程或外部链接稳定引用，且尚未完成迁移评审的文件或目录。
- 代码包名、API、表名、配置 key、状态 key 等必须保持英文稳定锚点的技术对象。

现有英文文件名文档按目录分批重命名和验证，不把整个 `docs/` 当作一次性改名任务处理。

长期维护 Markdown 文档的 H1 标题和用于阅读的主要章节标题也默认采用中文主体 + English anchor。项目名、包名、工具名、表名、API 路径等英文专名可以保留，但应按需要补中文用途或语义说明；外部导入原文、归档日期标题、纯代码锚点可保留原样。

如果后续确实要引入 Markdown frontmatter，必须先实现解析和测试，再限定到明确目录；不要在当前无解析器的情况下给所有文件堆重复字段。

## 目录 README 维护规则

`docs/` 下长期维护且容易误读职责的目录应保留对应 `README.md`。目录 README 维护目录级事实，不维护每篇文档的正文细节。

目录 README 应优先说明：

- 这个目录放什么。
- 这个目录不放什么。
- 是否是真源，或与当前真源的关系。
- 相关入口和更新规则。

新增、删除、重命名长期维护 Markdown 文档，或改变文档职责、归属目录、入口状态、真源状态时，必须同步检查该目录 README 是否需要更新。只修改现有文档正文、措辞、局部结论或表格数据，且不改变文档职责、分类、路径或入口状态时，通常不需要更新目录 README。

## 相关目录

- 产品与路线：`/Users/simon/projects/plush-toy-erp/docs/product/README.md`
- 架构评审：`/Users/simon/projects/plush-toy-erp/docs/architecture/README.md`
- 客户资料：`/Users/simon/projects/plush-toy-erp/docs/customers/README.md`
- 外部参考：`/Users/simon/projects/plush-toy-erp/docs/reference/README.md`
- 归档：`/Users/simon/projects/plush-toy-erp/docs/archive/README.md`
- 后端总览：`/Users/simon/projects/plush-toy-erp/server/README.md`
- 后端专题：`/Users/simon/projects/plush-toy-erp/server/docs/README.md`
- Compose 部署：`/Users/simon/projects/plush-toy-erp/server/deploy/README.md`
- 脚本说明：`/Users/simon/projects/plush-toy-erp/scripts/README.md`
