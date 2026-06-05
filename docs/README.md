# 文档目录说明 / docs Directory Guide

本目录存放仓库级约定和当前项目基线，优先服务于“当前该读什么、当前部署走哪条路径、当前还缺什么信息”这三类问题。

## 入口

- 阅读顺序与真源：`/Users/simon/projects/plush-toy-erp/docs/current-source-of-truth.md`
- 文档清单：`/Users/simon/projects/plush-toy-erp/docs/document-inventory.md`
- 部署口径：`/Users/simon/projects/plush-toy-erp/docs/deployment-conventions.md`
- 产品完成路线图：`/Users/simon/projects/plush-toy-erp/docs/product/product-completion-roadmap.md`
- 产品能力 / 交付 / 差异台账：`/Users/simon/projects/plush-toy-erp/docs/product/product-delivery-ledgers.md`
- 架构评审：`/Users/simon/projects/plush-toy-erp/docs/architecture/`
- 历史归档：`/Users/simon/projects/plush-toy-erp/docs/archive/`

## 设计文档分类入口 / Design Document Entry Points

本节只按人工校对和任务拆分顺序提供常用入口，不替代完整文档清单。判断当前实现状态时，仍以 `docs/current-source-of-truth.md`、当前代码、migration 和测试为准。

### 顶层设计 / Top-level Design

- 当前真源与阅读顺序：`/Users/simon/projects/plush-toy-erp/docs/current-source-of-truth.md`
- 产品完成路线图：`/Users/simon/projects/plush-toy-erp/docs/product/product-completion-roadmap.md`
- 零到一产品架构：`/Users/simon/projects/plush-toy-erp/docs/product/zero-to-one-architecture.md`
- 产品原则：`/Users/simon/projects/plush-toy-erp/docs/product/product-principles.md`
- 模块边界：`/Users/simon/projects/plush-toy-erp/docs/product/module-boundaries.md`
- 模块实施治理：`/Users/simon/projects/plush-toy-erp/docs/product/implementation-governance.md`
- 产品能力 / 交付 / 差异台账：`/Users/simon/projects/plush-toy-erp/docs/product/product-delivery-ledgers.md`

### 详细设计 / Detailed Design

- 领域模型 V1：`/Users/simon/projects/plush-toy-erp/docs/product/domain-model-v1.md`
- 正式产品入口与菜单配置计划：`/Users/simon/projects/plush-toy-erp/docs/product/formal-menu-entry-plan.md`
- 移动端岗位任务页改版：`/Users/simon/projects/plush-toy-erp/docs/product/mobile-role-tasks-redesign.md`
- 配置与权限策略：`/Users/simon/projects/plush-toy-erp/docs/product/config-permission-policy.md`
- 客户实例策略：`/Users/simon/projects/plush-toy-erp/docs/product/customer-instance-policy.md`
- 客户差异策略：`/Users/simon/projects/plush-toy-erp/docs/product/customer-delta-policy.md`
- 架构评审入口：`/Users/simon/projects/plush-toy-erp/docs/architecture/README.md`

### 测试与验收设计 / Test And Acceptance Design

- 自动化测试策略：`/Users/simon/projects/plush-toy-erp/docs/product/test-strategy.md`
- 发布门禁：`/Users/simon/projects/plush-toy-erp/docs/product/release-gates.md`
- 迁移准备检查清单：`/Users/simon/projects/plush-toy-erp/docs/product/migration-readiness-checklist.md`
- QA 脚本说明：`/Users/simon/projects/plush-toy-erp/scripts/README.md`

### 客户与交付设计 / Customer And Delivery Design

- 客户资料入口：`/Users/simon/projects/plush-toy-erp/docs/customers/README.md`
- 永绅 yoyoosun 客户资料：`/Users/simon/projects/plush-toy-erp/docs/customers/yoyoosun/README.md`
- 产品能力 / 交付 / 差异台账：`/Users/simon/projects/plush-toy-erp/docs/product/product-delivery-ledgers.md`
- 部署口径：`/Users/simon/projects/plush-toy-erp/docs/deployment-conventions.md`
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
| 当前真源索引 | `docs/current-source-of-truth.md` | 本身就是阅读顺序和真源索引，不需要再被前端 registry 二次定义 | 真源原则、当前状态、按任务分流 |
| 产品 / 架构正式文档 | `docs/product/*`、`docs/architecture/*` | 这些是仓库正式评审和路线文档，不再镜像到前端文档中心 | 结论、范围、真源 / 非真源、后续边界 |
| archive / progress | `docs/archive/*`、`progress.md` | 只用于过程追溯，不作为当前实现或产品路线真源；原 `docs/changes/*` 历史文件已删除 | 归档说明、发生时间、非真源声明 |
| imported notes / 外部输入 | `docs/reference/imported-notes/*` | 只作为参考输入，不能直接驱动 runtime、schema、migration 或 roadmap | 来源、导入时间、Reference Only、Not Source Of Truth |
| 后端 / 内部技术文档 | `server/docs/*`、`server/internal/**/README.md` | 面向子系统维护，不进入产品内文档入口 | 子系统边界、命令、配置、维护注意事项 |

不需要产品内 metadata 不等于不需要中文。任何文档只要已经出现 `Doc Type`、`Status`、`Source`、`Current Implementation Source of Truth` 等 metadata 字段，都必须至少做到字段名中英双语；其中 `Doc Type / 文档类型` 的类型值必须保留 English anchor 并补中文说明，例如 `Yoyoosun Source Snapshot Freeze Evidence / yoyoosun 来源快照冻结证据`。`Status`、`Source` 等状态值或来源值若容易误解，也应补中文说明。

`docs/document-inventory.md` 是当前仓库 Markdown 文档的查阅索引。新增、删除、重命名长期维护文档，或调整文档用途、归属分类、入口状态时，必须同步更新该索引。只改正文但不改变文档职责和分类时，可以不更新该索引；如果清单中的“标题 / 当前用途”会因此失真，则必须同步更新。

`docs/document-inventory.md` 的“标题 / 当前用途”列默认采用中文主体 + English anchor。若原文档标题是英文，清单里也要补中文说明，方便人工审查时先读懂用途，再保留英文锚点用于检索和对照。

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
