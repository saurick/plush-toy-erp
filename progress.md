# plush-toy-erp 过程记录 / Progress

`progress.md` 只记录最近活跃事项和交接线索，不作为当前正式需求、数据模型或部署真源。当前能力判断仍回到 `docs/当前真源与交接顺序.md`、正式产品 / 架构文档、代码和测试。

## 归档索引

| 归档文件                                                         | 范围                                                                                                                                     |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/archive/progress-2026-06-20-before-lifecycle-ui-policy.md` | 截至 2026-06-20 业务数据生命周期页面治理前的完整过程流水，包含 debug 清表、删除 / 回收站边界、项目 skills 迁入和加工环节页面收口等记录。 |
| `docs/archive/progress-2026-06-22-before-project-skill-agents-rules.md` | 截至 2026-06-22 项目级 AGENTS skill 维护规则补充前的完整过程流水，包含 dev-only 治理地图、登录页动效、skill metadata 中英化和运营事实筛选合同等记录。 |

## 最近活跃事项

- 库存台账筛选已移除业务用户不可理解的内部 ID 输入；后续若要显示物料 / 成品、仓库、批次的可读名称，应补后端 read model 或关联查询，不在前端伪造名称。
- 加工环节页面已收口重复页头并恢复共享列顺序能力；后续同类工程页继续复用自包含页头和共享列表工具，不再按页面类型绕开列顺序。
- 业务列表删除 / 回收站边界已写入仓库级规则和当前真源；后续若某对象确需删除，先补后端 usecase、RBAC、审计、引用检查和测试，再单独开放入口。
- `.agents/skills/plush-docs-governance` 与 `.agents/skills/plush-page-design-governance` 已作为项目内 canonical，后续修改以仓库内 skill 为准。

## 2026-06-22 Codex 项目 skills metadata 中英化补全

- 完成：统一修正项目内全部 `.agents/skills/*` 的 `SKILL.md` frontmatter `description`、`agents/openai.yaml` 的 `short_description` 和 `default_prompt`，避免 UI 摘要继续显示英文-only；`name`、目录名和 `display_name` 仍保持英文，方便 `$skill-name` 触发。
- 完成：给项目和通用治理 skill 正文顶部补充中文主线 + English anchors 的阅读口径，并在 `/Users/simon/.codex/AGENTS.md` 写入全局规则，后续创建或维护项目相关 skill 时默认遵守同一口径。
- 验证：追加前 `progress.md` 为 444 行、77769 字节，未达到归档阈值；已执行 54 个治理 skill 目录的 `quick_validate.py`，54 个 `agents/openai.yaml` Ruby YAML 解析通过；扫描确认 description 中文开头、`short_description` 含中文、`display_name` 无中文、`default_prompt` 包含 `$skill`。
- 下一步：如 Codex UI 仍显示旧摘要，重新打开会话或等待 skill metadata 刷新；后续新增 skill 应先按全局 AGENTS 的中英规则写 metadata。
- 阻塞/风险：本轮只改 Codex skill 文本、metadata 和全局 AGENTS 规则，不改运行时代码、schema、migration、RBAC、页面、部署脚本、真实导入流程、监控系统或安全策略。

## 2026-06-22 提交推送收口与日期过滤合同

- 完成：将 `devGovernance` 汇总逻辑中以 `(` / `[` 开头的表达式语句改为可选链和中间变量，消除 Prettier 与 ESLint fix 在行首分号上的反复改写。
- 完成：收口库存、采购、质检和运营事实 JSON-RPC 列表过滤中的 `date_from` / `date_to` 解析合同；非法日期不再静默忽略，统一返回 `InvalidParam`，并补充对应服务端测试。
- 验证：追加前 `progress.md` 为 428 行、75107 字节，未达到归档阈值；提交推送路径由 pre-commit Prettier 和 pre-push `qa:full` 覆盖。
- 下一步：后续新增 JSON-RPC 日期筛选时复用 `getOptionalJSONRPCTime` 的布尔结果，不要丢弃解析失败状态；新增类似前端表达式语句时优先使用命名中间变量。
- 阻塞/风险：本轮不改 schema、migration、RBAC、正式菜单、Workflow / Fact 事实落账、客户资料或部署脚本。

## 2026-06-22 JSON-RPC 日期筛选非法参数收口

- 完成：将库存台账、采购入库、来料质检和 operational_fact 通用列表筛选的 `date_from / date_to` 解析改为严格合同；非法日期不再静默当作未传筛选，而是在 service 层返回 `InvalidParam`。
- 完成：补充 inventory lot / txn、purchase receipt、quality inspection、production / outsourcing / stock reservation / finance fact 列表的 `not-a-date` 负例测试；保留 shipment list 既有严格日期解析路径。
- 验证：追加前 `progress.md` 为 428 行、75107 字节，未达到归档阈值；已执行 `cd server && go test ./internal/service -run 'Test(JsonrpcDispatcher_Inventory|PurchaseReceipt|QualityInspection|OperationalFact)'`、`git diff --check`、`cd server && go test ./internal/biz ./internal/data ./internal/service ./internal/server`，均通过。
- 下一步：提交前如合并无关前端格式化现场，需按实际改动范围补前端校验；本轮后端日期筛选合同已完成。
- 阻塞/风险：本轮只改 JSON-RPC service parser 和 service 测试，不改 schema、migration、RBAC、正式菜单、页面结构、WorkflowUsecase、Fact usecase、客户差异配置或部署脚本；前端页面 / 原型 / 浏览器回归不属于本次修复范围。

## 2026-06-22 运营事实筛选负向合同补齐

- 完成：将 production / outsourcing / stock reservation / finance list 的筛选归一化改为显式校验，非法 `status`、`fact_type`、不支持的 `date_field`、`date_from > date_to` 统一返回 `InvalidParam`；shipment list 同步补 status 校验。
- 完成：补充 biz 层筛选合同测试和 JSON-RPC dispatcher 负向测试，覆盖非法日期、空字符串日期、反向日期、非法状态、非法类型与不支持日期字段；页面现有筛选字段语义未改。
- 验证：追加前 `progress.md` 为 452 行、79092 字节，未达到归档阈值；已执行 `cd server && go test ./internal/biz ./internal/service`，通过。
- 下一步：如后续新增运营事实列表筛选项，应先在 usecase 层登记允许值，再接 UI 控件和 repo 查询；不要让 repo 静默兜底非法枚举。
- 阻塞/风险：本轮只改后端筛选合同、服务端测试和进度记录，不改 schema、migration、RBAC、正式菜单、页面布局、Workflow / Fact 写入边界、客户资料或部署脚本；未跑浏览器 / `style:l1`，因为没有页面视觉或交互态改动。

## 2026-06-22 项目 AGENTS skill 维护规则补充

- 完成：在项目级 `AGENTS.md` 增加“项目专属 Skill 维护约定”，明确 `.agents/skills/<skill-name>/` 随项目 git 管理、全局 `~/.codex/skills/` 只放通用 skill、项目版 skill 需包含 Truth Chain / Project Rules / Workflow / Output / Validation 等约束。
- 完成：同步写清 skill 命名与 metadata 口径：`name`、目录名、`display_name` 保持英文；`description`、正文、`short_description`、`default_prompt` 使用中文主体 + English anchors。
- 验证：追加前 `progress.md` 为 460 行、80274 字节，已按规则归档到 `docs/archive/progress-2026-06-22-before-project-skill-agents-rules.md`；本轮只改项目级 AGENTS / progress，不改运行时代码、schema、migration、RBAC、页面或部署脚本；已执行 `git diff --check -- AGENTS.md progress.md docs/archive/progress-2026-06-22-before-project-skill-agents-rules.md`。
- 下一步：后续新增或维护项目 skill 时，按项目 AGENTS 和全局 AGENTS 的一致规则执行；如只改 skill 正文且职责不变，通常不需要改文档清单。
- 阻塞/风险：本轮规则只约束后续 skill 维护，不代表已经修改任何自动 hook、CI 或真实业务流程。

## 2026-06-22 页面治理与后端边界 skill 说明收口

- 完成：在 `plush-page-design-governance` 开头补充边界说明，明确该 skill 只负责页面可见能力、功能语义、信息层级、交互和页面回归；涉及 API / RBAC / schema / migration / Workflow / Fact 时只做真实性核对和升级判断。
- 完成：增强 `plush-domain-boundary-governance`，去掉 description 重复句，并补充后端实现触发词与正文边界，明确它是 schema / migration / repo / usecase / JSON-RPC / API / RBAC / transaction / idempotency / error code / Workflow-Fact boundary 的主治理入口。
- 验证：追加前 `progress.md` 为 65 行、9295 字节，未达到归档阈值；已执行相关 skill validator 和 diff 检查。
- 下一步：页面任务若需要新增或修改后端能力，先切到 `$plush-domain-boundary-governance`，再按 test / security / release skill 补验证。
- 阻塞/风险：本轮只改两份 skill 和过程记录，不新增后端 skill，不改运行时代码、schema、migration、RBAC、页面、部署脚本或测试实现。
