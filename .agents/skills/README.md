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

## 按问题选 Skill / Scenario Matrix

| 你现在想做什么 | 优先使用 | 它解决什么 | 不负责什么 |
| --- | --- | --- | --- |
| 选中主会话一段话，简单问“是什么 / 为什么 / 合理吗 / 怎么办” | 全局 `$selected-context-analysis` | 片段理解、短问短答、上下文边界 | 不把片段当 plush 当前真源 |
| 写新主会话、side chat、review、测试、部署或提交推送提示词 | `$plush-prompt-governance` | 把目标、真源、范围、验收和风险写成可执行 prompt | 不替代实际执行或验证 |
| 页面报错、JSON-RPC 失败、本地 / 线上不一致、migration drift | `$plush-runtime-diagnostics` | 分层排查 browser / API / backend / DB / deploy / config | 不在定位前直接补代码 |
| 判断测试是否通过、范围是否足够、要不要跑 `style:l1` / E2E / migration | `$plush-test-governance` | 选择验证层级 T0-T8、测试形态和剩余风险 | 不替代代码审查结论 |
| 实现后看问题是否真的解决、改动是否对、有没有 bug / 缺测试 | `$plush-code-review-governance` | 独立审查 diff、Workflow / Fact、RBAC、字段残值/缺值和文档漂移 | 不以实现总结为主 |
| 文档不好读、信息密度高、链接/目录/表格/Mermaid/真源漂移 | `$plush-docs-governance` | 文档真源、读者路径、文档清单、可读性和跳转 | 不证明 runtime 行为正确 |
| 页面太密、功能细节看不懂、按钮/字段/状态意义不清、原型是否同步 | `$plush-page-design-governance` | 页面意义、信息层级、功能细节、交互态和页面回归 | 不直接管后端事实写入 |
| 要新增或调整 schema / migration / repo / usecase / JSON-RPC / RBAC / 字段真源 | `$plush-domain-boundary-governance` | 业务边界、Workflow / Fact、读写真源和实现层级 | 不处理纯视觉或文案排版 |
| 发布、部署、版本、Atlas migration、health/ready、rollback、旧镜像清理 | `$plush-release-governance` | 发布路径、低配服务器边界、回滚和 release evidence | 不替代 runtime 故障定位 |
| seed、fixture、模拟试用数据、导入 dry-run、清理、真实客户数据边界 | `$plush-seed-import-governance` | 可逆数据、导入边界、cleanup 和客户资料隔离 | 不把模拟数据写成真实导入 |
| request_id、错误码、中文错误提示、结构化日志、排障证据 | `$plush-observability-error-governance` | 可观测性、错误分类、用户提示和证据链 | 不替代安全审查 |
| RBAC、secrets、客户资料、导出权限、生产 env、日志脱敏 | `$plush-security-privacy-governance` | 安全与隐私边界、敏感数据和权限风险 | 不替代普通业务 review |

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
