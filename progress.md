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

## 2026-06-23 业务附件新建态待上传队列

- 完成：共享 `BusinessAttachmentPanel` 支持新建未保存时先选择附件并展示“保存后上传”待上传行，保存成功拿到 owner_id 后由页面保存函数自动 flush 到 `business_attachments`；已有记录仍直接上传、下载和删除。
- 完成：销售订单、采购订单、委外订单、出货单、BOM、SKU 和质检弹窗接入待上传附件 flush，并在打开新建 / 编辑、取消关闭时清空 pending，避免未保存附件串到下一张单；BOM 新建 / 复制不再沿用当前选中版本 id 作为附件 owner。
- 完成：同步更新 `business-form-page-standard-v1` 原型、`web/README.md` 和 `docs/architecture/业务附件证据边界评审.md`，将“未保存禁用上传”改为“未保存先选附件，保存成功后自动上传绑定”。
- 验证：追加前 `progress.md` 为 99 行、15372 字节，未达到归档阈值；已执行 `git diff --check`、旧禁用文案搜索、`cd web && pnpm lint`、`cd web && pnpm css`、`cd web && pnpm test`、`cd web && pnpm style:l1`，均通过；前端单测 387 个通过，`style:l1` 共验证 68 个场景。
- 下一步：如果后续需要“选择后立即上传但未保存也持久化”，必须单独设计临时附件 owner / 草稿 token / 清理任务，不应在页面层绕过当前 owner_type + owner_id 真源。
- 阻塞/风险：本轮不改 schema、migration、附件 JSON-RPC、RBAC、Workflow / Fact 写入边界、菜单、客户配置或部署脚本；附件自动上传失败时业务记录仍已保存，页面提示用户重新选择附件上传。

## 2026-06-23 业务附件图片 PDF 轻量预览

- 完成：共享 `BusinessAttachmentPanel` 新增图片 / PDF 轻量预览，已上传附件复用 `download_attachment` 的 owner 读权限取回内容后转 Blob URL 展示；新建态待上传附件可直接用前端暂存内容预览。Word、Excel、CSV、文本等类型继续下载查看。
- 完成：预览入口只作为附件行内操作，不新增独立大区块；预览 Modal 使用现有 Ant Design 浮层，图片自适应容器，PDF 使用 iframe。预览、下载、删除都不改变 Source Document、Fact、Workflow 或库存 / 财务状态。
- 完成：同步更新 `docs/architecture/业务附件证据边界评审.md`、`docs/当前真源与交接顺序.md`、`web/README.md` 和 `business-form-page-standard-v1` 原型 / README / 原型索引，将附件能力口径从上传 / 下载 / 删除扩展为图片 / PDF 轻量预览，并明确不做 Office 转换、缩略图、OCR、外链共享或对象存储。
- 验证：追加前 `progress.md` 为 108 行、17027 字节，未达到归档阈值；已执行 `git diff --check`、旧预览排除口径搜索、`cd web && pnpm lint`、`cd web && pnpm css`、`cd web && pnpm test`、`cd web && pnpm style:l1`，均通过；前端单测 387 个通过，`style:l1` 共验证 68 个场景。
- 下一步：如后续需要 Office 在线预览、缩略图、全文检索、病毒扫描、对象存储或客户外链共享，必须单独做附件存储 / 权限 / 安全评审，不能沿用当前轻量预览口径扩展。
- 阻塞/风险：本轮不改 schema、migration、附件 JSON-RPC、RBAC、菜单、Workflow / Fact 写入边界、客户配置或部署脚本；预览内容仍通过 JSON-RPC base64 传输，受 5MB 附件上限约束。

## 2026-06-23 业务附件预览入口显性化

- 完成：将共享附件行操作从纯图标改为带文字的 `预览 / 下载 / 删除 / 移除` 行内动作。图片 / PDF 附件现在能直接看到“预览”字样，避免只显示眼睛图标导致用户误判没有预览功能；非图片 / PDF 仍只显示下载。
- 验证：追加前 `progress.md` 为 117 行、18799 字节，未达到归档阈值；已执行 `git diff --check`、`cd web && pnpm lint`、`cd web && pnpm css`、`cd web && pnpm test`、`cd web && pnpm style:l1`，均通过；前端单测 387 个通过，`style:l1` 共验证 68 个场景。
- 下一步：后续如果要让 Office / CSV / 文本也出现预览，需单独实现转换或安全渲染，不在当前轻量预览范围内。
- 阻塞/风险：本轮只改共享附件面板可见操作文案，不改 schema、migration、附件 JSON-RPC、RBAC、菜单、Workflow / Fact 写入边界、客户配置或部署脚本。

## 2026-06-23 业务附件格式合同扩展

- 完成：将业务附件允许格式扩展到 HEIC / HEIF、ZIP、邮件证据 `.eml/.msg` 和 WPS 文件 `.wps/.et/.dps`；前端 `BusinessAttachmentPanel` 增加扩展名到 MIME 的受控归一和上传前不支持格式提示，后端同时校验 MIME 白名单与文件扩展名匹配，继续拒绝任意 `application/octet-stream`。
- 完成：预览口径收窄为 PNG / JPG / WEBP / GIF / PDF；HEIC / HEIF、Office、ZIP、邮件证据和 WPS 文件只承诺上传 / 下载，不做在线转换或浏览器内预览。同步更新 `docs/architecture/业务附件证据边界评审.md`、`docs/当前真源与交接顺序.md`、`docs/product/产品能力证据详情.md`、`web/README.md` 和业务表单原型说明 / HTML。
- 验证：追加前 `progress.md` 为 124 行、19768 字节，未达到归档阈值；已执行 `cd server && go test ./internal/biz`、`cd web && pnpm lint`、`cd web && pnpm css`、`cd web && pnpm test`、`STYLE_L1_PORT=4215 pnpm style:l1`、`git diff --check`，均通过；前端单测 387 个通过，`style:l1` 共验证 68 个场景。默认 `pnpm style:l1` 首次因本机 `4173` 端口占用导致 Vite 启动失败，改用 `4215` 后完整通过。
- 下一步：如后续需要 RAR / 7z、PPT、BMP / TIFF、Office 在线预览、HEIC 转换、病毒扫描或对象存储，必须单独做附件存储 / 安全 / 预览评审。
- 阻塞/风险：本轮不改 schema、migration、RBAC、菜单、Workflow / Fact 写入边界、客户配置或部署脚本；附件仍受 5MB 上限约束。工作区内仍有其它数量单位后缀和 L1 脚本相关改动 / 未跟踪文件，本轮未回退。

## 2026-06-23 业务附件上传上限调整

- 完成：业务附件前端选择校验、后端解码校验、JSON-RPC 错误文案和正式文档统一从单个 5MB 调整为单个 50MB；服务端测试改为小阈值 helper，避免单测为验证超限而构造 50MB+ base64 内容。当前真源、附件边界评审、产品能力证据、web README 和业务弹窗原型已同步 50MB 口径。
- 验证：追加前 `progress.md` 为 132 行、21465 字节，未达到归档阈值；已执行 `cd server && go test ./internal/biz ./internal/service`、`cd web && pnpm lint`、`cd web && pnpm css`、`cd web && pnpm test`、`git diff --check`，均通过；`STYLE_L1_PORT=4216 pnpm style:l1` 未通过，失败在既有数量单位后缀场景 `business-v1-purchase-order-form-modal 采购数量 应显示单位后缀`，本轮未回退工作区内相关未提交改动。
- 下一步：若继续增长到大文件、批量资料包或长期附件库，应评审对象存储、上传进度、断点续传、病毒扫描和下载权限，而不是继续扩大 JSON-RPC base64 主路径。
- 阻塞/风险：50MB 是解码后的文件内容上限，JSON-RPC base64 请求体会更大；本轮不改 schema、migration、存储形态、RBAC、菜单、Workflow / Fact 写入边界、客户配置或部署脚本。工作区内仍有其它数量单位后缀和 L1 脚本相关改动 / 未跟踪文件，本轮未回退。

## 2026-06-23 业务弹窗附件间距修复

- 完成：全局扫描弹窗内 `BusinessAttachmentPanel variant=\"inline\"` 接入点，确认销售订单、采购订单、委外订单、BOM、出货单、来料质检和 SKU 等业务弹窗共用 `.business-attachment-panel--inline`；已在共享样式增加 `margin-block-start: 16px`，避免附件证据行贴住上方备注 / 主表字段。
- 验证：追加前 `progress.md` 为 148 行、24613 字节，未达到归档阈值；已执行 `cd web && pnpm lint`、`cd web && pnpm css`、`cd web && pnpm test`、`git diff --check`，均通过；临时 Playwright 盒模型量测覆盖销售订单、采购订单、委外订单、BOM、出货单、来料质检和 SKU 新建弹窗，附件面板上方间距为 16px-32px，`scrollWidth <= clientWidth`，未发现横向溢出。
- 下一步：全量 `style:l1` 仍需等既有数量单位后缀场景修复后重跑；当前附件间距已通过独立盒模型回归。
- 阻塞/风险：本轮只改共享附件面板样式，不改 schema、migration、RBAC、菜单、Workflow / Fact 写入边界、客户配置、附件上传逻辑或原型状态。工作区内仍有其它数量单位后缀和 L1 脚本相关改动 / 未跟踪文件，本轮未回退。

## 2026-06-23 弹窗明细数量单位后缀

- 完成：新增共享 `FieldWithUnitSuffix`，采购订单、销售订单和委外订单明细的数量字段按当前行 `unit_id` / 单位快照显示只读单位后缀；未拿到可读单位时不显示裸 `单位 #id`。单价和金额不硬编码 `USD`，后续需有真实币种来源后再评审。
- 完成：销售订单新建弹窗补加载单位选项；采购 / 销售来源导入改为先增 Form.List 行、再用 `setFields` 逐字段写入，确保来源材料 / SKU 的默认单位进入明细行并驱动数量后缀。
- 完成：新增 `lineItemUnitAssertions` L1 断言，覆盖销售 SKU 导入后的“订单数量”单位后缀，以及采购材料导入后的“采购数量”单位后缀；断言同时检查可读单位、aria 名称、输入框 / 后缀盒模型和横向溢出。
- 验证：追加前 `progress.md` 为 139 行、22890 字节，未达到归档阈值；已执行 `git diff --check`、`cd web && pnpm lint`、`cd web && pnpm css`、`cd web && pnpm test`、`STYLE_L1_SCENARIOS=purchase-order-date-filter-desktop pnpm style:l1`、`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm style:l1`、`cd web && pnpm style:l1`，均通过；前端单测 387 个通过，全量 `style:l1` 共验证 68 个场景。
- 下一步：如果后续要给单价 / 金额显示币种后缀，应先收敛订单币种或客户 / 供应商币种真源，再统一接入，不能固定写 `USD`。
- 阻塞/风险：本轮不改 schema、migration、RBAC、菜单、Workflow / Fact 写入边界、客户配置或部署脚本；正式文档 / 原型未新增长期入口或职责变化，因此除本进度记录外未更新文档清单。

## 2026-06-23 销售订单空行数量单位补齐

- 完成：复查用户截图对应的销售订单新建空行状态，确认上一轮只覆盖了 SKU 导入 / 选择后状态，未覆盖未选 SKU 但已手填数量 / 单价的空行状态；现在单单位环境下空行“订单数量”也显示可读单位后缀 `只（PCS）`。
- 完成：销售订单“带出产品 / 单位”摘要从裸 `单位 #id` 改为可读单位名称，避免 SKU 选择后仍暴露数据库 ID；L1 断言同步覆盖空行数量后缀、导入后数量后缀和来源摘要不显示裸单位 ID。
- 验证：追加前 `progress.md` 为 155 行、25878 字节，未达到归档阈值；已执行 `cd web && pnpm lint`、`cd web && pnpm css`、`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm style:l1`、`cd web && pnpm test`、`git diff --check`、`cd web && pnpm style:l1`，均通过；前端单测 387 个通过，全量 `style:l1` 共验证 68 个场景。
- 下一步：如果后续存在多单位环境，空行不应猜默认单位，应先选 SKU / 来源或明确单位真源；如需允许销售订单手工选择单位，应单独评审是否放开隐藏 `unit_id` 为可见可选字段。
- 阻塞/风险：本轮仍不改 schema、migration、RBAC、菜单、Workflow / Fact 写入边界、客户配置或部署脚本；价格 / 金额币种后缀仍未做，需等待真实币种真源。

## 2026-06-23 trade-erp 表单字段借鉴规则收口

- 完成：将 trade-erp 弹窗字段和表单字段扫描结论收口到 `docs/product/业务主链路数据流向与字段来源规则.md`，新增可借鉴矩阵和落地优先级，明确只借来源导入、剩余数量、字段联动、明细 items 和附件证据等通用模式，不照搬外贸、结汇、水单、报关、提单或磁材字段。
- 完成：同步更新 `business-form-page-standard-v1` 和 `action-modal-drawer-standard-v1` 原型 README，把来源摘要、不可导入原因、已选摘要、清空已选、剩余数量、父弹窗字段维护和后端 usecase 校验边界写成页面标准。
- 验证：追加前 `progress.md` 为 163 行、27290 字节，未达到归档阈值；已执行 `git diff --check` 和 targeted `rg` 搜索确认 trade 借鉴、来源导入、剩余数量和不可导入原因已落到正式文档 / 原型标准。
- 下一步：后续进入运行时代码时，优先从采购订单转采购入库、销售订单转出货或入库转质检中选一个闭环做“来源导入 + 剩余量约束 + 字段链路 QA”，不要一次性搬字段全集。
- 阻塞/风险：本轮只改正式文档和原型 README，不改 schema、migration、API、RBAC、菜单、Workflow / Fact usecase、客户配置或部署脚本；当前 plush 工作区仍有其它未提交运行时代码和文档改动，本轮未回退。

## 2026-06-23 采购订单生成入库来源预览

- 完成：采购订单“生成采购入库草稿”弹窗新增来源明细预览，展示来源行、材料、采购数量、已入库、剩余数量和本次生成数量；无剩余数量时禁用生成按钮并给出明确提示。
- 完成：预览数据复用已有采购订单明细和采购入库列表，按后端 `create_purchase_receipt_from_purchase_order` 主路径只计算 open 来源行、排除已取消入库单，并保留后端 usecase 的状态与剩余量复验；前端只做生成前反馈，不写库存事实。
- 验证：追加前 `progress.md` 为 171 行、28723 字节，未达到归档阈值；已执行 `cd web && pnpm css`、`cd web && pnpm lint`、`cd web && pnpm test`、`STYLE_L1_PORT=4217 STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm style:l1` 和 `git diff --check`，均通过；默认 `4173` 端口首次被占用导致 L1 启动失败，换端口后通过 1 个业务模块场景。
- 下一步：如果要继续把 trade-erp 的“来源选择弹窗 + 部分行选择 + 不可导入原因”扩展到采购入库，需要先评审 API 合同和后端 usecase 参数，不应只在前端局部选择。
- 阻塞/风险：本轮不改 schema、migration、RBAC、菜单、Workflow / Fact 写入边界、客户配置或部署脚本；当前工作区仍有其它会话留下的附件、数量单位和 L1 脚本相关改动，本轮未回退。

## 2026-06-23 销售订单单位字段与金额计算补齐

- 完成：复查用户截图对应的销售订单新建明细，确认仅显示数量 suffix 不够，真实 `unit_id` 仍是隐藏字段；已将销售订单明细单位改为可见可选字段，并在单单位环境下自动填入默认单位，数量后缀改为读取真实 `unit_id`。
- 完成：销售 / 采购 / 委外订单金额派生统一从 JS `Number` 乘法切换为字符串十进制乘法，避免小数精度误差；截图中的 `123.11 × 12.11` 按两位金额口径锁定为 `1490.86`，并补 `0.1 × 0.2`、`1.005 × 1` 回归。
- 完成：L1 明细断言新增金额计算回读，销售订单新建弹窗会实际填写订单数量 `123.11`、单价 `12.11` 并断言金额字段为只读 `1490.86`，同时保留单位后缀盒模型 / 横向溢出校验。
- 验证：追加前 `progress.md` 为 179 行、30010 字节，未达到归档阈值；已执行 `pnpm --dir web exec node --test src/erp/utils/masterDataOrderView.test.mjs`、`pnpm --dir web css`、`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1`、`pnpm --dir web test`、`pnpm --dir web style:l1`、`pnpm --dir web lint`、`git diff --check`，均通过；全量前端单测 387 个通过，全量 `style:l1` 共验证 68 个场景。
- 下一步：如果后续要给单价 / 金额字段增加币种后缀，应先确定订单币种真源；当前只补数量单位和金额计算，不硬编码 `USD`。
- 阻塞/风险：多单位环境下空行不会猜单位，必须选择 SKU 或单位后才显示对应数量后缀；本轮不改 schema、migration、RBAC、菜单、Workflow / Fact 写入边界、客户配置或部署脚本。

## 2026-06-23 明细弹窗字段密度与单位精度修复

- 完成：按页面设计治理复查销售订单新建弹窗真实 DOM / 盒模型，确认旧明细行 12 个字段等宽导致单行宽度约 3638px，数量输入本体被单位后缀挤到约 135px，并且产品编号 / 名称 / 颜色快照重复占位；现在销售明细保留行号、SKU 来源、带出产品 / 单位、单位、订单数量、单价、金额、计划交付日期和备注，隐藏重复快照字段但继续保存快照值。
- 完成：共享明细 CSS 改为按字段语义定宽，行号 / 来源 / 摘要 / 单位 / 数量 / 金额 / 日期 / 备注不再等宽；目标 L1 默认视口下行号到金额字段完整可见，日期和备注保留在横向滚动后段，数量输入本体不小于 L1 锁定阈值。
- 完成：单位 option 真源补传 `precision`；销售、采购、委外数量字段按单位精度校验。`只（PCS）` 精度为 0 时，`123.11` 会显示“当前单位只允许整数数量”，金额为空；改为合法整数 `123` 后才按 `123 × 12.11 = 1489.53` 显示金额。
- 验证：追加前 `progress.md` 为 188 行、31903 字节，未达到归档阈值；已执行 `pnpm --dir web exec node --test src/erp/utils/masterDataOrderView.test.mjs src/erp/utils/referenceSelectOptions.test.mjs`、`pnpm --dir web lint`、`pnpm --dir web css`、`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1`、`pnpm --dir web test`、`pnpm --dir web style:l1`、`git diff --check`，均通过；全量前端单测 388 个通过，全量 `style:l1` 共验证 68 个场景。
- 下一步：若后续要让采购 / 委外也像销售一样合并重复快照字段，应单独按各自字段是否允许人工改写评审，不在本轮顺手隐藏。
- 阻塞/风险：本轮不改 schema、migration、RBAC、菜单、Workflow / Fact 写入边界、客户配置或部署脚本；单价 / 金额币种后缀仍等待订单币种真源，不硬编码 `USD`。

## 2026-06-23 业务弹窗输入框圆角基线

- 完成：按页面设计治理全局扫描业务弹窗输入控件，确认问题不应在单个“入库单号”字段硬编码；已将 `.erp-business-action-form` 下 AntD 输入、数字输入、下拉、日期、文本域和文本域 affix wrapper 的圆角基线统一到 10px，并在 focus 态显式清理浏览器默认 outline。
- 完成：补上业务弹窗内 `DateInput` 的后置样式覆盖，避免 `.erp-business-date-input` 从列表筛选样式继承 8px 圆角；日期范围筛选内部组合控件仍保持原来的分段圆角，不当作独立输入框改动。
- 完成：L1 增加业务表单控件圆角断言；采购入库新建弹窗额外锁定“入库单号 / 头部备注 / 材料下拉 / 入库数量”的 focus 绿色边框、圆角和 outline，防止截图里的方角输入框回归。
- 验证：追加前 `progress.md` 为 197 行、33914 字节，未达到归档阈值；已执行 `pnpm --dir web css`、`pnpm --dir web lint`、`pnpm --dir web test`、`STYLE_L1_PORT=4224 STYLE_L1_SCENARIOS=purchase-receipt-create-modal-desktop pnpm --dir web style:l1`、`STYLE_L1_PORT=4223 STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1`、`git diff --check`，均通过；前端单测 388 个通过，两个 targeted L1 场景各通过 1 个场景。
- 下一步：若后续发现打印工作台或移动端原生输入也有类似视觉问题，应按各自 surface 单独收口，不把打印纸面编辑态和业务弹窗表单混成一套规则。
- 阻塞/风险：本轮只改前端共享样式和 L1 断言，不改 schema、migration、API、RBAC、菜单、Workflow / Fact usecase、客户配置、正式文档或原型状态；当前工作区仍有其他会话留下的附件、单位后缀、文档和 `masterDataRpcMocks.mjs` 相关改动，本轮未回退。

## 2026-06-23 输入控件圆角全局扫描收口

- 完成：继续扩大输入圆角治理范围，将业务列表筛选、独立业务日期控件、业务动作弹窗、记录 / 权限 / 状态原因弹窗和打印中心工具栏搜索框统一到 12px 业务输入圆角基线；日期范围筛选内部、AntD compact 组合控件拼接边、打印纸张内部编辑单元格按组合 / 纸面编辑语义排除，不当作独立业务输入框硬改。
- 完成：`style:l1` 新增全局后置扫描 `assertVisibleInputControlRadius`，每个通过 `verify` 的场景都会读取真实 DOM / computed style，检查可见 input / textarea / select / AntD InputNumber / DatePicker / Select selector 的四角圆角，防止后续再出现 6px / 8px / 直角输入框；采购入库新建弹窗继续保留 focus 圆角与 outline 专项断言。
- 验证：追加前 `progress.md` 为 206 行、35804 字节，未达到归档阈值；已执行 `pnpm --dir web css`、`pnpm --dir web test`、`git diff --check`、`STYLE_L1_PORT=4240 STYLE_L1_SCENARIOS=purchase-receipt-create-modal-desktop,print-center-desktop,dev-docs-dark-desktop,dev-customer-config-dark-desktop,mobile-tasks-dark pnpm --dir web style:l1`、`STYLE_L1_PORT=4241 STYLE_L1_SCENARIOS=admin-login-theme-modes-desktop pnpm --dir web style:l1`、`STYLE_L1_PORT=4243 STYLE_L1_SCENARIOS=erp-business-dashboard-desktop,business-module-dark-customers-desktop,shipment-date-filter-desktop pnpm --dir web style:l1`，均通过；前端单测 390 个通过。
- 下一步：等当前脏工作区里的采购订单 / 出货业务页合同恢复后，再跑完整 `pnpm --dir web style:l1`，确认所有 68 个场景都能经过新的全局输入圆角扫描。
- 阻塞/风险：`pnpm --dir web lint` 当前失败在既有 `ShipmentsPage.jsx` 未使用变量；`business-formal-module-shells-desktop` 当前失败在出货页找不到“从销售订单导入出货明细”；`purchase-order-date-filter-desktop` 当前失败在 `V1PurchaseOrdersPage.jsx` 读取 `supplier_id` 的 null 运行时错误。本轮不回退这些其它会话 / 既有业务改动，也不改 schema、migration、API、RBAC、菜单、Workflow / Fact usecase、客户配置或部署脚本。

## 2026-06-23 输入控件圆角全局兜底规则

- 完成：确认前一轮仍有遗漏，因为圆角规则只覆盖业务弹窗和部分业务列表，登录验证码 compact 输入、开发页、任务 / 工作台、部分原生输入和后续局部样式仍可能绕过；新增 `control-radius.css` 并在 `app.css` 最后导入，用 `#root` 和浮层作用域统一接管 ERP runtime 可见输入控件四角圆角，覆盖 AntD Input / AffixWrapper / InputNumber / DatePicker / Select selector / textarea / 常见原生 input / select。
- 完成：把 `style:l1` 的全局输入圆角扫描改为严格四角检查，不再允许 compact 组合控件半边直角；只排除打印纸张内部编辑区、隐藏输入、checkbox/radio/file/button 和 AntD 内部无边框输入。业务弹窗专项 focus 断言继续保留。
- 验证：追加前 `progress.md` 为 233 行、42454 字节，未达到归档阈值；已执行 `pnpm --dir web css`、`pnpm --dir web lint`、`pnpm --dir web test`、`STYLE_L1_PORT=4244 STYLE_L1_SCENARIOS=admin-login-theme-modes-desktop,purchase-receipt-create-modal-desktop,print-center-desktop,mobile-tasks-dark pnpm --dir web style:l1`、`STYLE_L1_PORT=4245 STYLE_L1_SCENARIOS=erp-business-dashboard-desktop,business-module-dark-customers-desktop,shipment-date-filter-desktop,dev-docs-dark-desktop,dev-customer-config-dark-desktop,dev-governance-dark-desktop,dev-prototypes-dark-desktop,dev-testing-dark-desktop pnpm --dir web style:l1`、独立 Playwright 路由扫描 16 条路径、`STYLE_L1_PORT=4246 pnpm --dir web style:l1` 和 `git diff --check`，均通过；全量 `style:l1` 共验证 68 个场景，前端单测 390 个通过。
- 下一步：后续如果新增独立 iframe、shadow DOM 或不走 `app.css` 的前端入口，需要把该入口纳入同一 `control-radius.css` 或单独补 L1 路由扫描。
- 阻塞/风险：本轮只改 ERP runtime 前端样式入口和浏览器回归断言，不改 schema、migration、API、RBAC、菜单、Workflow / Fact usecase、客户配置、正式文档、原型状态或部署脚本；打印纸张内部编辑单元格按纸面表格编辑语义保留，不作为普通业务输入框统一圆角。

## 2026-06-23 来源导入字段运行态收口

- 完成：出货单来源导入从单据级改为销售订单行级候选，来源选择器展示销售订单号、来源行、客户、产品 / SKU、订单数量、已生成出货、剩余可出货、状态和不可导入原因；导入后默认本次数量使用剩余可出货数量，并在父弹窗展示来源销售订单、已导入来源行数量和剩余量摘要。
- 完成：采购订单“生成采购入库草稿”预览补齐来源采购单摘要、供应商、来源行、采购数量、已生成入库、本次入库、剩余可生成和不可生成原因；采购入库明细详情不再展示裸 `purchase_order_item_id`，改为“来源行 N / 已关联采购来源行”。
- 完成：质检新建表单展示来源采购入库、来源入库行、供应商、状态、到货数量、材料、仓库和批次提示；当前没有后端字段的“本次送检数量 / 已检数量 / 待检数量”不在前端伪造。
- 完成：同步更新 `docs/product/业务主链路数据流向与字段来源规则.md`、`business-form-page-standard-v1` 和 `action-modal-drawer-standard-v1` 原型 README，记录 trade-erp 来源摘要、不可导入原因、已选摘要、清空已选和剩余数量模式的运行态吸收范围与禁止照搬边界。
- 验证：追加前 `progress.md` 为 206 行、35804 字节，未达到归档阈值；已执行 `pnpm exec node --test src/erp/utils/businessLineItems.test.mjs`、`pnpm lint`、`pnpm css`、`pnpm test`、`STYLE_L1_PORT=4219 STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm style:l1`、`git diff --check`，均通过；前端单测 390 个通过，targeted L1 验证 1 个正式业务模块场景。
- 下一步：若继续做“全部值得引入字段”，优先进入后端合同：Shipment/OperationalFact usecase 按销售订单行剩余量强制阻断超量和并发重复；QualityUsecase/schema 增加本次送检数量、已检 / 待检数量后再接前端字段；委外回货、领料、出库的剩余量字段待对应 Source Document 和 Fact usecase 成立后再做。
- 阻塞/风险：本轮不改 schema、migration、RBAC、菜单、Workflow / Fact 写入边界、客户配置或部署脚本；出货页面当前剩余量是前端基于非取消出货行生成的可见提示，后端仍只保存 `sales_order_item_id` 追溯并校验 active 引用，尚未完成来源行剩余量强校验。当前工作区仍有其它附件、单位后缀、样式、L1 脚本和文档改动，本轮未回退。

## 2026-06-23 明细金额精度与长单位文案收口

- 完成：修正销售 / 采购 / 委外明细金额派生规则，不再把输入态金额固定四舍五入到 2 位；金额按数量与单价的小数位保留最多 6 位、最少 2 位，例如 `11.11 × 11.11` 显示 `123.4321`，整数金额仍显示 `40.00`。
- 完成：单位下拉、数量后缀和主数据默认单位统一使用短业务标签，`核心演示单位-件（SIM-PLUSH-CORE-PCS）` 显示为 `件（PCS）`，长演示文案只保留在搜索文本和 title 中，不再挤占输入框可见空间。
- 完成：补齐长单位文案与短标签的单测 / L1 断言；全量 L1 重新跑通后，前一条记录中的出货导入标题、采购订单 null supplier、紧凑组合控件圆角误报等阻塞已在本轮修正。
- 验证：追加前 `progress.md` 为 224 行、40597 字节，未达到归档阈值；已执行 `pnpm --dir web exec node --test src/erp/utils/masterDataOrderView.test.mjs src/erp/utils/referenceSelectOptions.test.mjs`、`pnpm --dir web lint && pnpm --dir web css && pnpm --dir web test`、`STYLE_L1_SCENARIOS=material-master-header-desktop pnpm --dir web style:l1`、`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1`、`STYLE_L1_SCENARIOS=purchase-order-date-filter-desktop pnpm --dir web style:l1`、`pnpm --dir web style:l1`、`git diff --check`，均通过；全量前端单测 390 个通过，全量 `style:l1` 共验证 68 个场景。
- 下一步：若要给单价 / 金额增加币种后缀，应先确定订单币种字段和后端合同；当前不硬编码 `USD`。
- 阻塞/风险：本轮不改 schema、migration、RBAC、菜单、Workflow / Fact 写入边界、客户配置或部署脚本；金额与单位验证基于前端单测和 mock/browser L1，未执行真实后端保存链路。

## 2026-06-23 明细行号输入降级为自动序号

- 完成：销售订单、采购订单和加工合同 / 委外下单弹窗不再展示可手填“行号”输入框；行头继续显示“第 N 行”作为定位信息，隐藏字段仅用于编辑旧数据回显。
- 完成：保存参数统一按当前明细数组顺序生成 `line_no = index + 1`，覆盖隐藏旧值，避免删除 / 插入后出现不可见的残值行号；公共参数 helper 增加测试锁住“表单旧行号不能覆盖当前顺序”。
- 完成：业务弹窗 L1 明细布局断言新增“行号不可作为可见输入字段”检查，防止后续回归成用户手填。
- 验证：追加前 `progress.md` 为 256 行、47541 字节，未达到归档阈值；已执行 `pnpm --dir web exec node --test src/erp/utils/masterDataOrderView.test.mjs`、`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1`、`pnpm --dir web lint && pnpm --dir web css && pnpm --dir web test`、`pnpm --dir web style:l1`，均通过；全量前端单测 390 个通过，全量 `style:l1` 共验证 69 个场景。
- 下一步：若未来需要业务可编辑的“客户行号 / 客户明细编号”，应作为独立业务字段评审命名和后端合同，不复用 `line_no`。
- 阻塞/风险：本轮不改 schema、migration、RBAC、菜单、Workflow / Fact 写入边界、客户配置、原型状态或部署脚本；未执行真实后端保存链路。

## 2026-06-23 业务表单单行输入高度统一

- 完成：将普通业务表单 `.erp-business-form` 纳入共享控件高度变量，单行 Input、Select、DatePicker、InputNumber 和 AffixWrapper 统一使用 36px 布局高度；textarea 保持多行语义，只继承最小高度，不按单行控件压缩。
- 完成：`style:l1` 新增可见业务表单单行控件高度扫描，读取真实 DOM 的 `offsetHeight` 与 `--erp-control-height`，覆盖普通业务表单和业务动作表单；新增 `purchase-order-inbound-draft-modal-controls-desktop` 场景，打开“生成采购入库草稿”弹窗锁定入库单号、仓库下拉和入库日期的真实布局高度。
- 验证：追加前 `progress.md` 为 241 行、44659 字节，未达到归档阈值；已执行 `pnpm --dir web css`、`pnpm --dir web lint`、`pnpm --dir web test`、`node --check web/scripts/styleL1.mjs && node --check web/scripts/style-l1/scenarios.mjs`、`STYLE_L1_PORT=4247 STYLE_L1_SCENARIOS=purchase-order-inbound-draft-modal-controls-desktop pnpm --dir web style:l1`、`STYLE_L1_PORT=4249 pnpm --dir web style:l1`、`git diff --check`，均通过；前端单测 390 个通过，全量 `style:l1` 共验证 69 个场景。
- 下一步：若后续新增不带 `.erp-business-form` / `.erp-business-action-form` 的表单 surface，应优先补统一 class 或共享组件入口，再让 L1 扫描接管，不在页面里写死单独高度。
- 阻塞/风险：本轮只改前端共享样式和浏览器回归断言，不改 schema、migration、API、RBAC、菜单、Workflow / Fact usecase、客户配置、正式文档或部署脚本；打印纸面编辑区、登录页和非业务表单不纳入这条 36px 业务表单高度规则。

## 2026-06-23 附件行去除 MIME 展示

- 完成：共享 `BusinessAttachmentPanel` 附件行去掉可见 `mime_type` 展示，避免上传后露出 `application/vnd...`、`image/...`、`text/...` 这类技术类型字符串；保留文件名、文件大小、保存后上传状态和预览 / 下载 / 删除动作。
- 验证：追加前 `progress.md` 为 249 行、46397 字节，未达到归档阈值；已执行 `pnpm lint`、`pnpm css`、`pnpm test`、`git diff --check`，均通过；另用 Playwright 打开销售订单新建弹窗并选择 `客户确认.docx`，附件面板文本为“客户确认.docx / 25 B / 保存后上传 / 移除”，未出现 MIME 字符串，面板 `scrollHeight=136`、`clientHeight=136`，无纵向溢出。
- 下一步：如后续需要展示文件类型，应使用中文业务标签或图标，不直接暴露 MIME / 存储路径。
- 阻塞/风险：本轮只改附件行展示，不改上传格式合同、后端 MIME 校验、schema、migration、RBAC、菜单、Workflow / Fact 写入边界、客户配置或附件下载 / 预览逻辑；原型当前本身不展示 MIME，本轮未改原型。

## 2026-06-23 业务页新建入口语义收口

- 完成：旧内部事实汇总路由 `/erp/operations/facts` 退出正式 ERP 运行时入口并重定向到业务看板，保留 `OperationalFactsPage` 作为收窄 V1 事实页复用的内部 workspace，不再提供客户可直达的内部事实汇总新建页。
- 完成：Workflow 协同页入口从“新建排程协同 / 新建放行协同”收窄为“发起排程协同 / 发起放行协同”，弹窗提交按钮与结果提示同步改为发起 / 提交语义；生产进度和出库管理的事实入口从“新建生产事实 / 新建库存预留”收窄为“登记生产事实 / 登记库存预留”。
- 完成：共享业务表格默认空态从“点击新建记录开始落盘”改为中性“暂无匹配记录”，避免只读页或来源生成页漏传空态时暗示可新建；同步更新业务事实扩展架构文档和 L1 / 单测断言。
- 验证：追加前 `progress.md` 为 273 行、49891 字节，未达到归档阈值；已执行 `pnpm --dir web exec node --test src/erp/utils/businessModuleNavigation.test.mjs src/erp/config/seedData.test.mjs src/erp/config/menuPermissions.test.mjs`、`git diff --check`、`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`pnpm --dir web style:l1`，均通过；前端单测 390 个通过，全量 `style:l1` 共验证 69 个场景。
- 下一步：如果后续决定库存预留必须全部从销售 / 出货来源生成，再另开任务隐藏 `/erp/warehouse/outbound` 的登记入口并补来源生成 usecase / 回归，不在本轮用前端隐藏替代后端合同。
- 阻塞/风险：本轮不改 schema、migration、RBAC 权限码、后端 WorkflowUsecase / Fact usecase、客户菜单配置或部署脚本；当前工作区仍有本轮前已存在的表单 / 单位 / 样式相关改动和未跟踪 `.agents/skills/README.md`，本轮未回退、未归并。

## 2026-06-23 Codex skills 目录 README 入口补充

- 完成：新增 `.agents/skills/README.md`，作为项目专属 Codex skills 的父目录薄入口，列出 `$plush-*` skills、主要用途和维护规则。
- 完成：明确单个 skill 子目录仍以 `SKILL.md` 为唯一入口，不给每个 skill 包再加 README / quick reference / changelog，避免违反 skill 包最小结构。
- 完成：补充 `使用规则 / Rules` 小节，说明 `$skill-name` 触发、多 skill 组合、项目版优先、README 与 `SKILL.md` 的边界，以及 skill 修改时的 metadata 检查。
- 完成：补充 `常用组合 / Pairings` 短表，列出 docs/page、page/domain、review/test、runtime/release、seed/security 等常见并用场景，便于一次会话同时 `$` 多个 skill。
- 验证：追加前 `progress.md` 为 265 行、49007 字节，未达到归档阈值；本轮只新增并补充 skill 目录 README 和过程记录，不改运行时代码、schema、migration、RBAC、页面、部署脚本或真实业务流程。
- 下一步：后续新增、删除、重命名项目 skill 时，同步更新 `.agents/skills/README.md`。
- 阻塞/风险：README 只做目录路由，不替代各 skill 的 `SKILL.md`、项目 `AGENTS.md`、正式 docs 或自动化校验。

## 2026-06-23 入库出库库存页面级新建入口收口

- 完成：对齐 trade-erp 的入库 / 出库 / 库存页面语义，采购入库列表移除页面级“新建入库单”和整单新建弹窗分支，保留采购订单“生成入库”来源入口以及已选草稿“添加明细”；出库管理库存预留 view 增加 `hideCreateAction`，不再展示页面级“登记库存预留”主按钮；库存台账仍保持只读事实 / 审计页。
- 完成：同步更新 L1 场景、采购入库浏览器真实写入脚本和测试策略 / web 脚本 README，明确浏览器写入脚本通过 RPC 准备测试草稿，页面只处理过账 / 取消 / 回显，不再代表入库列表有整单新建能力。
- 验证：追加前 `progress.md` 为 283 行、52019 字节，未达到归档阈值；已执行 `pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web exec node --test src/erp/utils/businessModuleNavigation.test.mjs src/erp/config/seedData.test.mjs src/erp/config/menuPermissions.test.mjs`、`node --check web/scripts/style-l1/purchaseReceiptAssertions.mjs && node --check web/scripts/style-l1/purchaseReceiptScenarios.mjs && node --check web/scripts/style-l1/scenarios.mjs && node --check web/scripts/styleL1.mjs && node --check web/scripts/purchaseReceiptRealWriteBrowserE2E.mjs`、`git diff --check`、`pnpm --dir web test`、`STYLE_L1_SCENARIOS=purchase-receipts-table-control-columns-desktop,purchase-receipt-add-item-modal-draft-desktop,purchase-receipt-add-item-modal-dark-desktop,purchase-receipt-add-item-modal-mobile,business-formal-module-shells-desktop pnpm --dir web style:l1`，均通过；前端单测 390 个通过，targeted L1 覆盖 5 个受影响场景。
- 下一步：如后续需要真实出库预留生成入口，应先评审销售 / 出货来源单据链路和对应后端 usecase，而不是在出库管理列表恢复手工新建按钮。
- 阻塞/风险：本轮不改后端 purchase / operational fact API、RBAC、schema、migration 或菜单真源；`pnpm smoke:purchase-receipt-real-write` 因会写本地 / 开发库持久测试事实，本轮只做脚本语法检查和文档口径更新，未实际执行真实写入。

## 2026-06-23 来源生成页面入口规则文档与剩余入口收口

- 完成：新增 `docs/product/页面来源生成入口规则.md`，把“由其他页面、来源单据、事实行或后续 usecase 生成的表单不保留无来源页面级新建 / 登记按钮”写成正式产品治理规则；同步更新 `docs/product/README.md`、`docs/文档清单.md` 和 `docs/当前真源与交接顺序.md`。
- 完成：来料质检页面主按钮从“新建质检单”改为“生成质检草稿”，弹窗标题改为“生成来料质检草稿”，保留采购入库 / 入库行 / 批次来源选择，不伪造本次送检数量等后端未闭环字段。
- 完成：应收、应付、发票、对账四个财务事实页隐藏页面级“登记事实”入口，避免在来源生成 usecase 未完成前提供无来源手工登记按钮；同步更新 L1 断言和业务事实 / 字段来源 / 能力证据文档旧口径。
- 验证：追加前 `progress.md` 为 292 行、54416 字节，未达到归档阈值；已执行 `pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`node --check web/scripts/style-l1/businessFormalScenarios.mjs && git diff --check`、`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1`，均通过；前端单测 390 个通过，targeted L1 覆盖 1 个正式业务模块场景。
- 下一步：若后续要恢复应收 / 应付 / 发票 / 对账生成入口，先补真实来源生成 usecase、JSON-RPC、RBAC、审计、幂等和 L1，再按 `页面来源生成入口规则.md` 使用“从来源生成 / 生成草稿”语义。
- 阻塞/风险：本轮不改 schema、migration、后端 usecase、RBAC、菜单真源、客户配置或部署脚本；生产事实页暂保留“登记生产事实”，因为当前页面仍是生产事实登记 owner，后续接入生产任务来源后再收口。

## 2026-06-23 页面级附件缺少记录时禁用暂存上传

- 完成：共享 `BusinessAttachmentPanel` 新增缺少 owner 时是否允许暂存附件的显式语义；默认保留表单弹窗“先选附件，保存业务对象后自动绑定”主路径，页面级附件区可关闭暂存并显示“请先选择记录 / 协同任务”。
- 完成：桌面 Workflow 协同页、采购入库页、Operational Fact 复用页和移动任务详情关闭缺 owner 暂存附件；出货放行等 Workflow 页面未选任务时不再显示“保存业务记录后自动上传”误导文案，也不会启用选择附件按钮。
- 完成：新增 `businessAttachmentPanelState` 纯 helper 和单测，锁住表单内待保存附件、页面级缺 owner 禁用上传、已有 owner 恢复真实上传文案三种状态。
- 验证：追加前 `progress.md` 为 301 行、56312 字节，未达到归档阈值；已执行 `node --test src/erp/utils/businessAttachmentPanelState.test.mjs`、限定文件 `eslint --fix --ext .js --ext .jsx ...`、`pnpm --dir web css`、`pnpm --dir web test`、`STYLE_L1_SCENARIOS=shipment-date-filter-desktop,business-collaboration-purchase-selected-desktop,mobile-tasks-dark pnpm --dir web style:l1`，均通过；前端单测 393 个通过，targeted L1 覆盖 3 个相关页面 / 移动场景。
- 下一步：如果后续新增页面级附件区，默认传入 `allowPendingAttachmentsWithoutOwner={false}` 并写清当前记录选择要求；只有业务表单保存链路才保留缺 owner 暂存。
- 阻塞/风险：本轮不改 schema、migration、后端附件 usecase、WorkflowUsecase、Fact usecase、RBAC、菜单真源、客户配置、原型状态或部署脚本；未做真实文件上传 RPC，只验证前端状态合同、单测和页面 L1 回归。

## 2026-06-23 出货放行日期筛选样式修复

- 完成：出货放行 / Workflow V1 筛选栏的到期开始、到期结束从两个独立 `DateInput` 收口为共享 `DateRangeFilter`，显示单一“到期日期”类型标签，并沿用共享日期区间的边框、焦点、反向日期禁用和响应式布局。
- 完成：在 `business-formal-module-shells-desktop` L1 场景中新增出货放行到期日期筛选 DOM / box 断言，锁住不再使用两个独立 DateInput、开始 / 结束输入数量、宽屏同排、内部无横向溢出和筛选栏不溢出父容器。
- 验证：追加前 `progress.md` 为 310 行、58115 字节，未达到归档阈值；已执行 `pnpm exec eslint --ext .js --ext .jsx src/erp/pages/WorkflowBusinessModulePage.jsx scripts/style-l1/businessFormalScenarios.mjs`、`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm style:l1`，均通过。
- 下一步：若后续其它 Workflow V1 页面出现同类日期筛选，应继续复用 `DateRangeFilter`，不要在页面筛选栏直接堆两个独立 DateInput。
- 阻塞/风险：本轮只改前端筛选控件组合和 L1 断言，不改 schema、migration、RBAC、菜单、WorkflowUsecase、Fact usecase、客户配置、原型或部署脚本；当前工作区仍有其它文档、附件、表单和 L1 相关现场改动，本轮未回退、未归并。

## 2026-06-23 页面级附件入口弹窗化

- 完成：新增 `BusinessAttachmentModalButton`，把桌面 Workflow 协同页、采购入库页、Operational Fact 复用页和移动任务详情的页面主体附件区收口为“先选当前记录 / 任务，再通过动作按钮打开附件弹窗”，不再让附件块常驻占据页面业务表单 / 列表空间。
- 完成：保留业务表单弹窗内的 `BusinessAttachmentPanel` 暂存上传主路径，明确区分页面级附件弹窗和表单保存后绑定附件；全局扫描确认剩余直接附件面板都位于 `BusinessFormModal` 内。
- 完成：新增 `businessAttachmentEntrypoints` 静态测试和 `businessAttachmentAssertions` L1 helper，锁住页面级入口必须走弹窗、剩余直接附件面板必须留在业务表单弹窗内；入库管理和出货放行 L1 场景增加真实 DOM / modal / overflow 断言。
- 验证：追加前 `progress.md` 为 318 行、59492 字节，未达到归档阈值；已执行限定文件 `eslint --fix`、`node --test src/erp/utils/businessAttachmentEntrypoints.test.mjs src/erp/utils/businessAttachmentPanelState.test.mjs`、`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop,purchase-receipts-table-control-columns-desktop,mobile-tasks-dark pnpm --dir web style:l1`、`pnpm --dir web css`、`pnpm --dir web test`、`git diff --check`，均通过；前端单测 396 个通过，targeted L1 覆盖 3 个场景。
- 下一步：后续新增页面级附件入口时，复用 `BusinessAttachmentModalButton`；只有业务表单弹窗内允许继续使用直接 `BusinessAttachmentPanel` 暂存待保存附件。
- 阻塞/风险：本轮不改 schema、migration、后端附件 usecase、WorkflowUsecase、Fact usecase、RBAC、菜单真源、客户配置、原型状态或部署脚本；未执行真实文件上传到后端，只验证前端状态合同、静态约束和浏览器 L1。

## 2026-06-23 Workflow 页面局部刷新协同按钮收口

- 完成：桌面 Workflow V1 业务页移除 toolbar 内局部“刷新协同”按钮，保留壳层全局“刷新当前页”作为唯一刷新入口；`registerPageRefresh` 和协同任务加载逻辑不变。
- 完成：`businessFormalScenarios` 的统一业务列表 toolbar L1 规则新增 `刷新协同` 负向断言，后续正式业务列表页不应再补回重复局部协同刷新按钮。
- 验证：追加前 `progress.md` 为 327 行、61407 字节，未达到归档阈值；已执行 `pnpm --dir web exec eslint --ext .js --ext .jsx src/erp/pages/WorkflowBusinessModulePage.jsx scripts/style-l1/businessFormalScenarios.mjs`、`node --check web/scripts/style-l1/businessFormalScenarios.mjs`、`pnpm --dir web test`、`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm --dir web style:l1`、`pnpm --dir web css`、`git diff --check -- web/src/erp/pages/WorkflowBusinessModulePage.jsx web/scripts/style-l1/businessFormalScenarios.mjs progress.md`，均通过；前端单测 396 个通过，targeted L1 覆盖 1 个正式业务模块场景。
- 下一步：如后续确需局部刷新入口，应先证明该入口不是全局刷新重复能力，并在 L1 中补对应例外说明。
- 阻塞/风险：本轮不改 schema、migration、RBAC、菜单、WorkflowUsecase、Fact usecase、客户配置、原型状态、部署脚本或移动端任务列表刷新；当前工作区仍有本轮前已存在的文档、附件、表单和 L1 相关现场改动，本轮未回退、未归并。

## 2026-06-23 业务筛选日期区间组件防复发守卫

- 完成：新增 `businessDateFilterUsage.test.mjs` 静态测试，扫描 `pages/**/*.jsx` 中的 `BusinessOperationPanel filters={...}`，禁止在业务筛选栏直接使用独立 `<DateInput>` 拼日期区间，要求走共享 `DateRangeFilter`。
- 完成：将该守卫接入 `web/package.json` 的 `pnpm test`，保留表单、弹窗和单日期字段继续使用 `DateInput` 的合法路径，不机械替换所有日期输入。
- 验证：追加前 `progress.md` 为 335 行、62981 字节，未达到归档阈值；已执行 `pnpm exec node --test src/erp/utils/businessDateFilterUsage.test.mjs`、`pnpm exec eslint --ext .js --ext .jsx src/erp/utils/businessDateFilterUsage.test.mjs src/erp/pages/WorkflowBusinessModulePage.jsx scripts/style-l1/businessFormalScenarios.mjs`、`pnpm test`、`STYLE_L1_PORT=4247 STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm style:l1`、`git diff --check -- web/src/erp/utils/businessDateFilterUsage.test.mjs web/package.json web/src/erp/pages/WorkflowBusinessModulePage.jsx web/scripts/style-l1/businessFormalScenarios.mjs progress.md`，均通过；`pnpm test` 共 397 个测试通过。第一次不带端口的 targeted L1 因 `4173` 端口占用导致 Vite 未启动，换 `STYLE_L1_PORT=4247` 后通过。
- 下一步：若未来新增业务筛选面板且确需日期区间，继续复用 `DateRangeFilter`；若新增非业务页独立日期筛选，需要按该页职责单独评审，不默认纳入 `BusinessOperationPanel` 守卫。
- 阻塞/风险：本轮只增加前端静态守卫和测试脚本接入，不改 schema、migration、API、RBAC、菜单、WorkflowUsecase、Fact usecase、客户配置、原型或部署脚本；当前工作区仍有其它文档、附件、表单和 L1 相关现场改动，本轮未回退、未归并。

## 2026-06-24 日期区间左侧圆角裁切修复

- 完成：共享 `.erp-business-date-range-filter` 外壳从 `overflow: visible` 改为 `overflow: hidden`，让内部只读日期类型标签背景按外层边框圆角裁切，修复“入库日期”等日期区间筛选左侧圆角显示不完整的问题。
- 完成：采购入库 L1 场景新增 `入库日期` 共享日期区间控件 DOM / box 断言，锁住标签文本、圆角半径、外壳 overflow、内部 scrollWidth/clientWidth 和页面级横向溢出。
- 验证：追加前 `progress.md` 为 343 行、64853 字节，未达到归档阈值；已执行 `pnpm exec eslint --ext .js --ext .jsx scripts/style-l1/purchaseReceiptScenarios.mjs`、`pnpm css`、`STYLE_L1_PORT=4247 STYLE_L1_SCENARIOS=purchase-receipts-table-control-columns-desktop pnpm style:l1`、`git diff --check -- web/src/erp/styles/app/business-tables.css web/scripts/style-l1/purchaseReceiptScenarios.mjs`，均通过；targeted L1 覆盖入库管理默认态、日期筛选圆角壳层、相邻工具栏、表格和页面横向溢出。
- 下一步：后续日期区间筛选仍走共享 `DateRangeFilter`；如果其它页面出现圆角或裁切异常，优先检查共享壳层与内部背景的盒模型关系，不在单页硬补。
- 阻塞/风险：本轮只改前端共享样式和采购入库 L1 断言，不改 schema、migration、API、RBAC、菜单、WorkflowUsecase、Fact usecase、客户配置、原型或部署脚本；当前工作区仍有其它文档、附件、表单和 L1 相关现场改动，本轮未回退、未归并。
