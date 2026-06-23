# Codex 项目 Skills / Project Skills

本目录保存 plush-toy-erp 的项目专属 Codex skills，是仓库内 canonical 版本。全局 `~/.codex/skills` 只放通用范式；涉及本项目时优先用这里的 `$plush-*` skills。

## 使用入口 / Usage

| Skill | 主要用途 |
| --- | --- |
| `$plush-docs-governance` | 文档治理、真源索引、文档清单、可读性、Mermaid、链接和 `progress.md` |
| `$plush-page-design-governance` | 页面意义、功能细节、信息密度、原型同步、低心智负担和浏览器回归 |
| `$plush-code-review-governance` | 独立代码审查、Workflow / Fact、RBAC、字段残值/缺值、删除语义和文档漂移 |
| `$plush-test-governance` | 验证层级 T0-T8、测试形态、浏览器回归、migration、release checks |
| `$plush-prompt-governance` | 新会话、side chat、review、实现、测试、部署和提交推送提示词 |
| `$plush-release-governance` | 发布、部署、版本、migration、rollback、health/ready 和 release evidence |
| `$plush-domain-boundary-governance` | schema、migration、repo、usecase、JSON-RPC、RBAC、Workflow / Fact 和字段真源 |
| `$plush-runtime-diagnostics` | 页面报错、JSON-RPC、真实后端、DB/migration drift、浏览器证据和部署差异 |
| `$plush-seed-import-governance` | seed、fixture、模拟试用数据、import dry-run、cleanup 和真实客户数据边界 |
| `$plush-observability-error-governance` | request_id、结构化日志、错误码、前端中文错误提示和排障证据 |
| `$plush-security-privacy-governance` | RBAC、secrets、客户资料、导出、生产 env、日志脱敏和权限边界 |

## 常用组合 / Pairings

| 场景 | 建议同时使用 |
| --- | --- |
| 文档改动会影响页面口径、帮助入口或原型 | `$plush-docs-governance` + `$plush-page-design-governance` |
| 页面改动涉及 schema、JSON-RPC、RBAC、Workflow / Fact 或字段真源 | `$plush-page-design-governance` + `$plush-domain-boundary-governance` |
| 实现完成后做独立 review 或提交前自查 | `$plush-code-review-governance` + `$plush-test-governance` |
| 本地 / 线上故障排查后准备发布或回滚 | `$plush-runtime-diagnostics` + `$plush-release-governance` |
| seed、导入、客户资料、权限或脱敏边界相关 | `$plush-seed-import-governance` + `$plush-security-privacy-governance` |

## 使用规则 / Rules

- 在 Codex 会话里直接写 `$skill-name` 即可触发，例如 `$plush-docs-governance`；一次任务经常跨边界时，可以在同一条消息里同时写多个 skill。
- 先选最贴近本轮主任务的 skill，再按影响面补相邻 skill：文档 + 页面用 docs/page，页面 + 后端边界用 page/domain，发布故障用 release/runtime，涉及客户资料或权限再加 security。
- 涉及 plush-toy-erp 时优先使用本目录 `$plush-*` 项目版；只有缺少项目专属能力，或任务明确跨项目通用，才退回 `~/.codex/skills` 的通用版。
- 本 README 只负责选型和导航；真正执行前必须读对应 skill 的 `SKILL.md`，不要只按 README 摘要执行。
- 修改 skill 本身时同步检查 `SKILL.md`、`agents/openai.yaml`、触发名和 UI 摘要；只改目录 README 不代表更新了任何 skill workflow。

## 维护规则 / Maintenance

- 单个 skill 的入口必须是它自己的 `SKILL.md`；不要在每个 skill 子目录再加 README、quick reference 或 changelog。
- 新增或修改 skill 时保持 `name`、目录名和 UI `display_name` 英文稳定；`description`、正文、`short_description` 和 `default_prompt` 使用中文主体 + English anchors。
- 只改 skill/docs 时默认跑 skill validator、YAML 解析、`git diff --check` 和必要引用扫描，不机械运行前后端全量测试。
- 修改本目录后按项目约定更新 `/Users/simon/projects/plush-toy-erp/progress.md`。
