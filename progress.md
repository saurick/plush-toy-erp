# Progress

本文件只保留当前活跃事项、最近完成事项和归档索引；历史流水不作为当前正式需求、实现状态或产品路线真源。

## 归档索引

- `docs/archive/progress-2026-06-02-before-print-template-defer.md`：归档 2026-05-31 至 2026-06-02 10:28 的旧过程记录。归档原因：原 `progress.md` 达到 386 行 / 80696 bytes，超过 80KB 阈值。

## 2026-06-02 12:42
- 完成：将 `docs/document-inventory.md` 同步维护规则写入 `AGENTS.md`、`docs/README.md` 和 `docs/document-inventory.md` 本身：新增、删除、重命名长期维护 Markdown 文档，或调整文档用途、归属分类、产品内入口 / 外部参考 / 归档 / Codex Goal 等入口状态时，必须同步更新文档清单。
- 完成：明确例外边界：只改现有文档正文、措辞、局部结论或表格数据，且不改变标题、职责、分类、路径或入口状态时，通常不需要更新文档清单；如果清单中的“标题 / 当前用途”会因此失真，则必须同步更新。
- 下一步：后续文档增删改名或分类调整时，按该规则同步维护 `docs/document-inventory.md`。
- 阻塞/风险：docs-only；未改 runtime、schema、migration、API、RBAC、UI、seedData、docs registry、loader 或部署配置。本轮追加前 `progress.md` 为 43 行 / 7658 bytes，未达到归档阈值。

## 2026-06-02 12:39
- 完成：将现有英文 metadata 字段名双语化，覆盖 `Doc Type`、`Status`、`Runtime Implemented`、`Ent Schema Implemented`、`Migration Implemented`、`Current Implementation Source of Truth`、`Runtime Source of Truth`、`Schema Source of Truth`、`Notes`、`Current Evidence Inputs` 以及 imported note 的 `Source`、`Imported At`、`Purpose`、`Not Source Of Truth` 等字段；同时给常见 `Status` 值和 `Yes/No` 值补中文说明。
- 完成：新增 `docs/document-inventory.md`，按仓库根文档、配置与部署骨架、docs 真源入口、架构评审、产品与路线、客户资料边界、Codex Goal、历史变更、外部参考、前端产品内文档、前后端 / 脚本说明等分类列出当前 tracked Markdown 文档；同步在根 `README.md` 和 `docs/README.md` 增加文档清单入口。
- 下一步：后续新增、删除或重命名长期维护文档时，同步更新 `docs/document-inventory.md`；若状态值或类型值容易误解，在对应文档触达时继续补中文值说明。
- 阻塞/风险：docs-only；未改 runtime、schema、migration、API、RBAC、UI、seedData、docs registry、loader 或部署配置。本轮追加前 `progress.md` 为 37 行 / 6371 bytes，未达到归档阈值。

## 2026-06-02 12:23
- 完成：补充 metadata 双语规则：后续若新增可被机器读取或跨团队复用的 metadata，必须同时保留中文说明和 English anchor；推荐 `title_zh/title_en`、`summary_zh/summary_en`、`status_zh/status_key` 这类成对字段。
- 完成：明确当前前端 registry 尚未消费 `title_en` / `summary_en` 等字段；如要新增双语 metadata 到运行时 registry，必须同步修改渲染消费逻辑和 `docs.test.mjs`，不能只写未生效字段。
- 下一步：如果后续决定真正支持双语前端文档展示，再单独拆 UI / registry / test 任务，先设计字段结构再落代码。
- 阻塞/风险：docs-only；未改 runtime、schema、migration、API、RBAC、UI、seedData、docs registry、loader 或部署配置。本轮追加前 `progress.md` 为 31 行 / 5490 bytes，未达到归档阈值。

## 2026-06-02 12:22
- 完成：整理文档 metadata / registry 边界，明确当前仓库不要求所有 Markdown 添加 YAML frontmatter 或统一 metadata 头；metadata 主要用于减少产品内文档入口、受众、状态和是否接入前端页面的信息差，不制造新的内容真源。
- 完成：在 `docs/README.md` 增加全仓分类规则，列出 `README`、`docs/current-source-of-truth.md`、`docs/product/*`、`docs/architecture/*`、`docs/codex-goals/*`、`docs/changes/*`、`docs/archive/*`、`progress.md`、`docs/reference/imported-notes/*`、`server/docs/*` 等不需要产品内 metadata 的文档类型和应保留信息；在 `web/README.md` 增加前端文档注册约定，明确 `docRegistry`、`seedData.mjs` 和 `docs.test.mjs` 才是产品内文档入口守卫。
- 下一步：后续若新增产品内文档页，只对 `web/src/erp/docs/*.md` 走 `docs.mjs` / `seedData.mjs` 注册；若要引入 Markdown frontmatter，必须先实现解析器和测试，再限定目录。
- 阻塞/风险：docs-only；未改 runtime、schema、migration、API、RBAC、UI、seedData、docs registry、loader 或部署配置。本轮追加前 `progress.md` 为 25 行 / 4253 bytes，未达到归档阈值。

## 2026-06-02 12:01
- 完成：读取 `/Users/simon/Desktop/automated-test-strategy.md`，将其中适合本项目的自动化测试分层、Workflow / Fact 边界检查、docs-only 验收、Schema / Migration、Repo / Usecase、API / RBAC、Frontend UI、current import dry-run / freeze 和部署前验收口径整理进 `docs/product/test-strategy.md`。
- 完成：明确暂不直接落地的内容，包括完整业务 E2E runner、真实 import loader 测试、shipment / finance 完整事实测试、backup / restore 脚本和 CI 分层自动化，避免把未来建议写成当前已实现能力；同步在 `README.md` 文档索引加入自动化测试策略入口。
- 下一步：后续新增真实 import loader、出货 / 财务事实层或 CI 流水线时，再按本文 T6 / T7 / T8 补 runner、结构化摘要和验收命令。
- 阻塞/风险：docs-only；未改 runtime、schema、migration、API、RBAC、UI、seedData、docs registry、import loader、部署脚本或 CI 配置。本轮追加前 `progress.md` 为 19 行 / 3170 bytes，未达到归档阈值。

## 2026-06-02 11:47
- 完成：按“打印模板暂不做产品内核”的决策收紧正式产品文档。`docs/product/product-completion-roadmap.md`、`docs/product/product-delivery-ledgers.md`、`docs/product/zero-to-one-architecture.md`、`docs/product/product-principles.md`、`docs/product/config-permission-policy.md`、`docs/product/v1-schema-go-no-go.md`、`docs/product/customer-delta-policy.md` 和 `docs/product/formal-menu-entry-plan.md` 均已明确：打印格式当前只作为客户打印样本、交付诉求或 `Print Template Candidate` 记录，默认 Deferred；不进入 Product Core，不作为行业模板默认能力，不新增模板 schema，不实现模板设计器或通用模板引擎。
- 完成：同步 current 客户资料边界和业务记录过渡文档，把“打印模板 / 合同样式”统一改为客户打印样本、`Print Template Input` 或 `Print Template Candidate`；只有至少 2-3 个真实客户同类单据重复、字段来源稳定且差异主要是抬头 / 字段显示 / 版式微调时，才重新评审是否做 Print Template Core MVP。
- 下一步：如果后续客户继续提出打印格式诉求，先登记到客户差异台账和客户打印样本清单，不进入 roadmap 编号；等多客户重复性成立后再单独拆 `print-template-core-mvp-review`。
- 阻塞/风险：docs-only；未改 runtime、schema、migration、API、RBAC、UI、seedData、docs registry、打印中心实现、模板渲染、loader 或部署配置。旧 `progress.md` 已按阈值要求归档到 `docs/archive/progress-2026-06-02-before-print-template-defer.md`。

## 2026-06-02 10:28
- 完成：将 `/Users/simon/Desktop/plush-toy-erp-from-0-to-1-plan.md` 归档为 `docs/reference/imported-notes/plush-toy-erp-from-0-to-1-plan.md`，明确 `Reference Only`，不作为 runtime、schema、migration、API、UI、目录结构、roadmap 编号或交付排期真源；同步更新 imported-notes README 文件清单。
- 完成：从外部规划稿中只提炼稳定口径到正式文档：`docs/product/zero-to-one-architecture.md` 补业务闭环主线；`docs/product/domain-model-v1.md` 补业务域职责和字段 / API / 状态示例边界；`docs/architecture/status-workflow-fact-boundary.md` 补混合状态词拆层规则。
- 下一步：如继续吸收外部规划，只能按具体评审拆到 domain model、architecture review 或 `docs/codex-goals/*.md`；roadmap 不吸收目录大重构、团队排期、时间估算或 API / schema 示例。
- 阻塞/风险：docs-only；未改 runtime、schema、migration、API、RBAC、UI、seedData、docs registry、loader 或部署配置。`progress.md` 本次追加前已检查为 380 行 / 79551 bytes，后续再更新时大概率需要先归档。
