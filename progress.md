# Progress

本文件只保留当前活跃事项、最近完成事项和归档索引；历史流水不作为当前正式需求、实现状态或产品路线真源。

## 归档索引

- `docs/archive/progress-2026-06-02-before-print-template-defer.md`：归档 2026-05-31 至 2026-06-02 10:28 的旧过程记录。归档原因：原 `progress.md` 达到 386 行 / 80696 bytes，超过 80KB 阈值。

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
