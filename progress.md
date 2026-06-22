# plush-toy-erp 过程记录 / Progress

`progress.md` 只记录最近活跃事项和交接线索，不作为当前正式需求、数据模型或部署真源。当前能力判断仍回到 `docs/当前真源与交接顺序.md`、正式产品 / 架构文档、代码和测试。

## 归档索引

| 归档文件                                                         | 范围                                                                                                                                     |
| ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `docs/archive/progress-2026-06-20-before-lifecycle-ui-policy.md` | 截至 2026-06-20 业务数据生命周期页面治理前的完整过程流水，包含 debug 清表、删除 / 回收站边界、项目 skills 迁入和加工环节页面收口等记录。 |
| `docs/archive/progress-2026-06-22-before-project-skill-agents-rules.md` | 截至 2026-06-22 项目级 AGENTS skill 维护规则补充前的完整过程流水，包含 dev-only 治理地图、登录页动效、skill metadata 中英化和运营事实筛选合同等记录。 |

## 最近活跃事项

- 库存台账筛选已移除业务用户不可理解的内部 ID 输入；批次视图按仓库筛选表示“该仓库当前数量大于 0 的批次”，历史发生记录进入流水视图追溯；后续若要显示物料 / 成品、仓库、批次的可读名称，应补后端 read model 或关联查询，不在前端伪造名称。
- 加工环节页面已收口重复页头并恢复共享列顺序能力；后续同类工程页继续复用自包含页头和共享列表工具，不再按页面类型绕开列顺序。
- 业务列表删除 / 回收站边界已写入仓库级规则和当前真源；后续若某对象确需删除，先补后端 usecase、RBAC、审计、引用检查和测试，再单独开放入口。
- `.agents/skills/plush-docs-governance` 与 `.agents/skills/plush-page-design-governance` 已作为项目内 canonical，后续修改以仓库内 skill 为准。

## 2026-06-22 Codex 项目 skills metadata 中英化补全

- 完成：统一修正项目内全部 `.agents/skills/*` 的 `SKILL.md` frontmatter `description`、`agents/openai.yaml` 的 `short_description` 和 `default_prompt`，避免 UI 摘要继续显示英文-only；`name`、目录名和 `display_name` 仍保持英文，方便 `$skill-name` 触发。
- 完成：给项目和通用治理 skill 正文顶部补充中文主线 + English anchors 的阅读口径，并在 `/Users/simon/.codex/AGENTS.md` 写入全局规则，后续创建或维护项目相关 skill 时默认遵守同一口径。
- 验证：追加前 `progress.md` 为 444 行、77769 字节，未达到归档阈值；已执行 54 个治理 skill 目录的 `quick_validate.py`，54 个 `agents/openai.yaml` Ruby YAML 解析通过；扫描确认 description 中文开头、`short_description` 含中文、`display_name` 无中文、`default_prompt` 包含 `$skill`。
- 下一步：如 Codex UI 仍显示旧摘要，重新打开会话或等待 skill metadata 刷新；后续新增 skill 应先按全局 AGENTS 的中英规则写 metadata。
- 阻塞/风险：本轮只改 Codex skill 文本、metadata 和全局 AGENTS 规则，不改运行时代码、schema、migration、RBAC、页面、部署脚本、真实导入流程、监控系统或安全策略。

## 2026-06-22 库存批次仓库筛选语义收口

- 完成：将库存批次列表的仓库筛选从“存在该仓库余额行”收口为“该仓库当前数量大于 0 的批次”，避免 0 余额历史批次继续被仓库筛选命中；库存流水仍承担历史发生记录追溯。
- 完成：同步库存台账页头说明和产品能力证据详情，明确批次视图按仓库筛当前余额，历史流水通过流水视图查；未新增页面入口、菜单、RBAC、schema、migration 或库存写入 API。
- 验证：追加前 `progress.md` 为 57 行、8107 字节，未达到归档阈值；已补数据层测试覆盖入库后可筛出、扣到 0 后不再被该仓库筛出。
- 下一步：若后续要让业务用户直接看到仓库、物料、批次的可读名称，应补后端 read model / 关联查询，再调整前端展示，不在前端伪造名称。
- 阻塞/风险：本轮不做盘点调整、批次状态变更、预留明细页、历史流水聚合筛选、客户真实数据导入或目标环境 migration apply。

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

## 2026-06-22 P0/P1 业务附件证据层接入

- 完成：新增 `business_attachments` schema、migration、repo、usecase 和 `attachment` JSON-RPC 域，按 owner_type 复用对应业务对象既有读写权限；上传内容走 base64，限制 5MB 和白名单 MIME，并在 RPC 日志参数中补充附件内容脱敏。
- 完成：新增共享 `BusinessAttachmentPanel` 和附件 API，接入销售订单、采购订单、委外订单、采购入库、来料质检、出货、运营事实、BOM、产品 SKU、Workflow 看板和岗位任务端详情等 P0/P1 编辑或详情场景；附件只作为证据层，不替代 Source Document、Fact 或 Workflow 真源。
- 完成：同步新增 `docs/architecture/业务附件证据边界评审.md`，并更新架构索引、文档清单、当前真源、产品能力台账、能力证据、`server/README.md` 和 `web/README.md` 的附件口径。
- 验证：追加前 `progress.md` 为 73 行、10405 字节，未达到归档阈值；已执行 `cd server && make data`、`cd server && go test ./internal/biz ./internal/data ./internal/service`、`cd server && make migrate_status`、`cd web && pnpm lint`、`cd web && pnpm test`、`cd web && pnpm css`、`cd web && pnpm style:l1`、`git diff --check`，均通过；`style:l1` 共验证 68 个场景，前端单测 387 个通过。
- 下一步：需要在共享开发库或线上环境启用前，按部署 / migration 主路径应用 `20260622140642_migrate.sql`；如后续要做对象存储、病毒扫描、预览缩略图或附件引用审计，应作为单独任务评审。
- 阻塞/风险：本轮只生成 migration 并确认本地迁移状态存在 1 个 pending 文件，未对 `192.168.0.106` 等共享数据库执行 `make migrate_apply`；现阶段附件内容仍存 PostgreSQL bytea，适合当前 P0/P1 证据补齐，不作为长期大文件存储方案。

## 2026-06-22 全局日期先后校验收口

- 完成：新增前端共享 `dateRange` 工具，将业务列表日期范围、销售订单、采购订单、委外订单和 BOM 生效期接入统一先后校验；日期控件会禁选不合法日期，表单提交前也会给出中文校验提示。
- 完成：在销售订单、采购订单、委外订单 biz 层补充后端保存合同，拒绝表头计划日期早于单据日期、明细计划日期早于单据日期；列表 JSON-RPC 反向 `date_from / date_to` 和 BOM 反向生效期补负向测试。
- 完成：将正式业务页 L1 回归接上日期范围控件断言，并新增真实 DatePicker 交互校验：选择开始日期后，结束日期面板中更早日期必须禁用。
- 验证：追加前 `progress.md` 为 82 行、12284 字节，未达到归档阈值；已执行 `cd server && go test ./internal/biz ./internal/service`、`cd web && pnpm test`、`cd web && pnpm css`、针对本轮文件的 `pnpm exec eslint --fix --ext .js --ext .jsx ...`、`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm style:l1`，均通过。
- 下一步：后续新增业务表单日期对或列表日期范围时，复用 `web/src/erp/utils/dateRange.mjs`，后端入口同步补保存 / 筛选合同测试。
- 阻塞/风险：本轮不改 schema、migration、RBAC、菜单、Workflow / Fact 写入边界、客户差异配置或部署脚本；当前只覆盖已识别的通用列表日期范围和核心订单 / BOM 日期对，未把所有单日期字段改成范围关系。

## 2026-06-22 业务附件编辑区布局与原型同步

- 完成：将共享 `BusinessAttachmentPanel` 增加紧凑 inline 形态，未保存和无附件状态改为轻量空态；销售订单、采购订单、委外订单、出货单、BOM、SKU 和质检等编辑场景把附件入口收口到备注 / 交付 / 合同资料 / 凭证附近，位于明细 items 之前，不再作为弹窗末尾大区块。
- 完成：同步更新业务表单原型 `business-form-page-standard-v1` 的 HTML 和 README，来源切换时会清空附件证据显示；同步调整原型总览、业务详情原型说明、`web/README.md` 和 `docs/architecture/业务附件证据边界评审.md` 的附件布局口径。
- 验证：追加前 `progress.md` 为 91 行、13838 字节，未达到归档阈值；已执行 `git diff --check`、旧术语搜索、`cd web && pnpm lint`、`cd web && pnpm css`、`cd web && pnpm test`、`cd web && pnpm style:l1`，均通过；`style:l1` 共验证 68 个场景，前端单测 387 个通过。
- 下一步：后续新增带明细的业务编辑弹窗时，单据级附件默认沿用 inline 证据行；页面级选中记录详情可继续用独立 section，但必须绑定已保存 owner。
- 阻塞/风险：本轮只改附件面板布局、运行时接入位置和原型 / 文档口径，不改 schema、migration、附件 JSON-RPC、RBAC、Workflow / Fact 写入边界、客户配置或部署脚本；工作区内仍有其他会话留下的附件后端、日期校验和文档改动，本轮未回退。
