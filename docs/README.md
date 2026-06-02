# docs 目录说明

本目录存放仓库级约定和当前项目基线，优先服务于“当前该读什么、当前部署走哪条路径、当前还缺什么信息”这三类问题。

## 入口

- 阅读顺序与真源：`/Users/simon/projects/plush-toy-erp/docs/current-source-of-truth.md`
- 文档清单：`/Users/simon/projects/plush-toy-erp/docs/document-inventory.md`
- 部署口径：`/Users/simon/projects/plush-toy-erp/docs/deployment-conventions.md`
- 产品完成路线图：`/Users/simon/projects/plush-toy-erp/docs/product/product-completion-roadmap.md`
- 产品能力 / 交付 / 差异台账：`/Users/simon/projects/plush-toy-erp/docs/product/product-delivery-ledgers.md`
- 架构评审：`/Users/simon/projects/plush-toy-erp/docs/architecture/`
- 历史归档：`/Users/simon/projects/plush-toy-erp/docs/archive/`

## 文档 metadata 与注册边界

当前仓库不要求所有 Markdown 都添加 YAML frontmatter 或统一 metadata 头。metadata 的目的不是制造新真源，而是减少入口、受众、状态和是否已接产品页面的信息差。

当前唯一会被前端文档页消费的 metadata 在 `web/src/erp/config/docs.mjs` 和 `web/src/erp/config/seedData.mjs`：

- `web/src/erp/docs/*.md` 若作为 `/erp/docs/:docKey` 或 `/erp/qa/:docKey` 文档页展示，必须在 `docRegistry` 中有 `title`、`summary`、`source`。
- 文档若进入帮助中心、开发与验收、高级文档或文档卡片，还必须在 `seedData.mjs` 中有导航项和明确分组。
- `web/src/erp/config/docs.test.mjs` 已校验前端正式 Markdown 是否导入注册、导航是否指向已注册文档、帮助中心主入口和开发与验收入口是否受控。

若后续新增可被机器读取或跨团队复用的 metadata，必须同时保留中文说明和 English anchor：

- 中文用于人工复查、交接和业务语义理解。
- English anchor 用于机器检索、跨工具对齐、导入导出、API / config / status code 等稳定键名。
- 对同一字段不要只写中文或只写英文；推荐使用成对字段，例如 `title_zh` / `title_en`、`summary_zh` / `summary_en`、`status_zh` / `status_key`。
- English anchor 应保持稳定、短小、可检索，不要为了翻译优雅频繁改名；中文说明可以随业务口径优化。
- 当前前端 registry 还没有消费 `title_en` / `summary_en` 等字段；除非同步修改渲染代码和测试，不要把这些字段加入运行时 registry 当作已生效能力。

不需要产品内 metadata 的文档类型如下：

| 文档类型 | 示例 | 不加产品内 metadata 的原因 | 应保留的信息 |
| --- | --- | --- | --- |
| 仓库 / 子系统 README | `README.md`、`docs/README.md`、`web/README.md`、`server/README.md`、`scripts/README.md` | 这是目录和使用说明，不是产品内文档页 | 入口、目录职责、命令、当前边界 |
| 当前真源索引 | `docs/current-source-of-truth.md` | 本身就是阅读顺序和真源索引，不需要再被前端 registry 二次定义 | 真源原则、当前状态、按任务分流 |
| 产品 / 架构正式文档 | `docs/product/*`、`docs/architecture/*` | 这些是仓库正式评审和路线文档；只有被复制或镜像到 `web/src/erp/docs` 后才需要前端 registry metadata | 结论、范围、真源 / 非真源、后续边界 |
| Codex Goal 文件 | `docs/codex-goals/*.md` | 这是执行规格和验收边界，不是帮助中心内容；已完成编号 Goal 不保留为活跃文档，可从 Git 历史追溯 | Goal 名称、允许 / 禁止路径、验收命令、停止条件 |
| archive / progress | `docs/archive/*`、`progress.md` | 只用于过程追溯，不作为当前实现或产品路线真源；原 `docs/changes/*` 历史文件已删除 | 归档说明、发生时间、非真源声明 |
| imported notes / 外部输入 | `docs/reference/imported-notes/*` | 只作为参考输入，不能直接驱动 runtime、schema、migration 或 roadmap | 来源、导入时间、Reference Only、Not Source Of Truth |
| 后端 / 内部技术文档 | `server/docs/*`、`server/internal/**/README.md` | 面向子系统维护，不进入产品帮助中心 | 子系统边界、命令、配置、维护注意事项 |

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
