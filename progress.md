# plush-toy-erp progress

本文件只保留当前活跃事项、最近完成记录和归档索引；历史流水已归档到 `docs/archive/`。`progress.md` 是过程交接线索，不是正式需求、数据模型或部署真源。

## 2026-07-14 全仓提交前门禁收口

完成：按 full-worktree 范围核对并同步 Ent / Atlas 与 Wire 生成物。管理员状态审计约束补齐完整外层表达式，保持 PostgreSQL migration 语义不变并恢复 SQLite 测试建表；模板 PDF 管理员校验只接受已经服务端 session 验证后注入的 claims，不再从原始 Bearer token 绕过会话注销和认证版本检查。对应生命周期测试改为写入完整状态原因、时间和操作者审计字段。

验证：`make data` 零 migration 漂移；隔离 PostgreSQL fresh database 完整应用 61 个 migration，`make critical_transactions_pg_test` 通过；`go test ./...`、server build 和 govulncheck 通过。前置 `full.sh` 的 fast、secrets、web 全量 test / build 已通过；最终完整 pre-push 仍由本次 `git push` hook 重跑并以远端同步结果为准。

下一步：完成当前 full-worktree commit / push 后，以 `origin/main...HEAD = 0 0` 和 clean worktree 作为 Git 收口证据；部署到 `192.168.0.133`、目标 migration / health / smoke / rollback evidence 与客户签收仍是独立动作。

阻塞/风险：本轮只修复提交门禁暴露的生成与认证一致性问题，没有执行目标环境部署，也不把本地自动化绿色写成客户验收。为全量门禁启动了仅绑定 `127.0.0.1:55432` 的本地测试 PostgreSQL 容器 `plush-qa-postgres-55432`。

## 2026-07-14 任务看板全量计数与互斥泳道

完成：任务看板不再从 `list_tasks(limit=200)` 的局部结果推导顶部统计，而由只读 `workflow.get_task_board` 在同一查询快照内返回可见范围的全量 `total`、四个互斥运营泳道计数和有界任务切片。`rejected` 保持生命周期终态，但只读投影到“阻塞 / 退回”承接交接；未知状态 fail closed。来源候选由数据库 `DISTINCT` 生成，只受可见性和显式 owner role 范围约束，不随当前内容筛选塌缩。

完成：总览每栏最多 5 条，聚焦页固定每页 8 条并把 `lane / page` 写入 URL；筛选、分页、选择与旧响应隔离使用同一服务端合同。完成态及其他非异常任务不会再显示或被历史 `blocked_reason / rejected_reason` 搜索命中，后续状态写入会清除字段残值，事件中的处理原因仍保留审计。工作台既有每页 8 条、队列切换选择联动、焦点选择、`aria-selected` 和桌面 sticky 合同保持不变。

验证：Node 24.14.0 / pnpm 10.13.1 下任务看板及共享生命周期定向 80 项测试、全量 ESLint、全量 CSS 检查、Vite build（3245 modules）通过；`erp-task-board-desktop / mobile / dark-wide-desktop` 与 `erp-yoyo-global-dashboard-desktop` 四个浏览器场景通过，后者在 1440×600 下实际滚过 sticky 阈值并按 2px 误差上限核对位置。`go test ./... -count=1` 和隔离 PostgreSQL `make workflow_pg_test` 通过；PG 用例覆盖 478 条任务的全量计数、数据库来源去重、固定查询上界、终态历史原因搜索隔离和事件原因保留。`git diff --check` 通过。

下一步：共享长期任务可在冻结快照上只读重跑 final PostgreSQL、`full.sh` 与 `strict.sh`；目标环境部署和客户验收仍是独立步骤。若后续继续做无障碍增强，可单独把泳道卡外层从依赖内部按钮 focus capture 收口为自身完整键盘语义，不与本轮计数真源混改。

阻塞/风险：本轮未改 schema / migration，也未对历史数据库残值做物理回填；旧值由服务端读取投影和搜索条件隔离，受控清理需另行评审。共享工作区仍包含其他会话的大量 WIP，本轮未暂存、提交、推送、部署或形成目标环境发布证据。

## 2026-07-13 工作台长队列分页与上下文跟随

完成：工作台优先处理队列从整表无限撑高收口为每页 8 项的受控分页，显示当前范围和当前已加载总数；翻页、切换待我处理 / 阻塞逾期 / 等待交接队列时，右侧上下文同步到当前页首条，刷新或处理导致末页缩减时自动回到最后有效页。桌面右侧上下文保持跟随，窄屏恢复普通文档流；当前页任务行支持焦点选择和 `aria-selected`，原“优先级”列按真实展示语义改为“状态 / 风险”。

验证：Node 24.14 / pnpm 10.13.1 下前端全量 861 项测试、全量 lint、全量 CSS 检查通过；`erp-yoyo-global-dashboard-desktop` 定向 `style:l1` 以 18 条待办和 9 条逾期样本覆盖 8 项分页、翻页、切队列重置、当前行 / 右侧上下文一致、桌面 sticky、390px 窄屏和暗色对比度，浏览器场景通过。相关文件 Prettier、脚本语法和 `git diff --check` 通过。

下一步：如果工作台需要准确承载超过 200 条任务，应单独扩展后端队列查询，提供 `queue_key`、固定业务优先排序、服务端分页和三队列准确总数；不通过前端循环拉取冒充可扩展方案。

阻塞/风险：本轮只修复当前接口已加载范围内的长列表交互；`list_tasks` 单次上限仍为 200，当前三个队列数量不是超过该上限后的全量事实。未改 schema、migration、RBAC、Workflow / Fact、客户配置、seed 或部署，未执行发布门禁和目标环境验收。

## 2026-07-13 财务取消审计与生产订单本地闭环

完成：财务事实取消不再覆盖原始过账时间；正式取消在同一事务记录认证操作人、取消时间和 1..255 字业务原因，三字段按版本约束成组。迁移前本项目已有的取消记录保留显式历史版本，页面只显示“历史记录，取消审计信息缺失”，不从其他时间或账号猜值。ProcessRuntime 补偿、JSON-RPC/RBAC、列表详情和财务页面均使用同一审计真源。

完成：生产订单 Product Core 独立页面和通用菜单已接入现有后端，覆盖可读引用选择、草稿新建/编辑、发布、关闭、取消、版本冲突草稿保留和刷新恢复；表单只在 Modal 挂载后初始化，普通业务页不展示系统创建/更新时间。财务与生产订单两条浏览器脚本的 CLI 主入口均按绝对路径判断，已重新执行真实后端 E2E，旧“仅加载未执行”的 finance browser 证据作废。

验证：Ent/Atlas 生成物零漂移；fresh PostgreSQL 迁移、坏行、事务、并发和 critical gate 通过；production/finance 定向 race 通过；财务取消真实后端浏览器输出 `finance cancellation real-backend browser e2e passed`，生产订单真实后端浏览器输出 `production order real-backend browser e2e passed`；`business-core-pages-desktop` L1、`scripts/qa/full.sh` 与 `scripts/qa/strict.sh` 均通过。

下一步：永绅客户菜单投影、试用 seed、部署和客户签收仍是独立切片；未获授权前不把 Product Core 本地闭环直接写入客户配置或目标环境，也不扩成完整 MES、总账、税控或核销系统。

阻塞/风险：本轮证据只证明当前共享工作树的本地实现和隔离环境验证，不代表 `192.168.0.133` 已部署或客户已签收。工作区仍有数百项其他会话改动，当前 staged 为 0；后续提交必须重新精确审查范围并取得用户授权。

## 2026-07-13 管理员生命周期与权限地图

完成：管理员账号补齐 `active / suspended / revoked` 三态语义，`disabled` 只表达临时停用，`revoked_at` 表达正式注销；状态原因、时间和操作者进入 schema。临时禁用要求填写原因，正式注销保留历史身份且不能普通恢复。注销事务同时退回该账号尚未完成的个人待办到原岗位池、递增任务版本、写 `unassigned` 任务事件和控制面审计，避免账号状态与审计或待办处置部分成功。

完成：新增 `system.user.revoke` 高风险权限和管理员账号“离职注销”交互；权限中心“生效页面预览”升级为只读“权限地图”，每项已选功能展示影响页面、控件类型和最终限制，仍不建立独立页面授权真源。功能勾选项直接展示影响摘要，甲方无需理解权限 key。

验证：Ent/Atlas 已生成账号生命周期 migration 与代码；账号 usecase、事务 repo、权限影响 JSON-RPC 定向 Go 测试通过；Node 24.14 下前端 lint、css、权限中心搜索/菜单投影/错误码定向测试通过；`permission-center-desktop` 浏览器回归覆盖权限地图、账号列表和注销确认交互。全量 data/service 测试受到共享工作区中财务取消审计并行改动失败影响，未将其冒充为本轮通过。

下一步：普通业务资源数据范围仍等待甲方给出本人/岗位/仓库等真实隔离要求和对应负责人真源；敏感字段仍需先确定领域字段组，并让查询、修改、导出和打印在后端共同执行。两者在合同闭环前不开放前端伪开关。

阻塞/风险：账号 schema migration 尚未在目标数据库 apply，也未形成发布证据。共享工作区含其他会话的大量未提交改动，尤其同期生成的财务 migration 和代码；提交时必须精确审查本轮路径和迁移顺序。

## 2026-07-13 状态顶层设计与全局字典核对

完成：将 `docs/architecture/状态字典与生命周期索引.md` 从当前文件导航升级为状态顶层设计与实现证据双层入口。中文 / English 两棵树保持对应，并以 `Current / Planned / Deferred` 区分当前 canonical 生命周期、已评审演进和长期边界；补齐订单行、生产 / 委外事实、库存预留和业务财务等当前状态族。顶层设计允许表达经正式评审的目标态，未实现内容不得混入 Current 证据或预占 canonical key。

完成：同步架构 README、文档清单、角色流程文档和 Workflow / Fact 边界入口；前后端 Workflow business status key 合同测试继续阻断显示映射漂移。全局活跃文档扫描未保留旧“为避免虚构而禁止目标态设计”口径。

验证：Node 24.14 下文档清单 / 活跃链接 3/3、Workflow 状态合同 4/4 通过；Go core status 与 Workflow business status 定向测试通过；`git diff --check` 通过。本轮未改 schema、migration、usecase、API、RBAC、页面 runtime、客户配置或部署。

下一步：后续新增状态先进入 owning layer 的正式评审并登记 `Planned`，代码 / Schema、流转、测试和必要显示映射就绪后再升级 `Current`；长期质检、MES 和完整财务边界保持 `Deferred`。

阻塞/风险：状态索引证明当前本地仓库设计和代码证据，不代表目标环境已发布；共享工作区仍有其他会话的大量未提交改动，提交时必须精确审查和暂存本轮路径。

## 2026-07-12 docs 与代码一致性审计

完成：按活跃正式文档、原型、归档和外部参考四类建立 `docs/` 全量清单，逐项核对当前真源、Ent schema / Atlas migration、biz/data/service、前端路由与配置、QA 脚本和现有工作区改动。修正生产订单 option API / provider / 事实联动状态、业务事实总评审、成品入库 Workflow / Fact 边界、客户交付矩阵、菜单评审、附件删除语义和中文真源路径等信息差。

验证：`docs-inventory.test.mjs` 通过，包含长期 Markdown 登记、失效路径和活跃文档本地链接检查；`phase-label-boundaries.mjs`、`agents-size.sh` 和 `git diff --check` 通过。归档前 `progress.md` 为 435 行 / 83,153 bytes，已超过 80 KiB 阈值，完整归档后仅保留当前活跃事项、最近记录和归档索引。

下一步：后续生产订单 UI / 菜单、客户配置、seed 或部署真正接入时，同步当前真源、能力台账、客户交付矩阵和生产订单边界评审；不用本地实现推断目标环境已发布。

阻塞/风险：`docs/reference/**` 是外部输入，`docs/archive/**` 是历史证据，本轮只核对分类、索引和链接，不用当前代码改写其历史内容。共享工作区仍有大量其他会话改动，本轮未暂存、提交或推送。

## 2026-07-12 生产订单可读引用选项与销售来源 eligibility

完成：新增 canonical `list_production_order_reference_options`，以 `pmc.plan.read` 和 production readable module gate 提供产品、SKU、单位、销售订单行、Active BOM 五类服务端分页投影。搜索与 `selected_ids` 历史回显严格互斥；历史模式不依赖级联字段，失效或缺失引用只返回不可选择的业务说明。销售订单行支持先搜索来源，再一次带回产品、SKU、单位；无前端全量 join、N+1 或 fallback。

完成：create/save/release 在同一事务锁定销售父单和来源行，并复核父单 active、行 open、产品/SKU/单位一致；精确 receipt 重放仍先于当前 eligibility。失败保持零订单部分写入、零状态推进和零 receipt。

验证：biz/data/service 定向测试、Go 全仓、build、`-race`、canonical API 与 critical PostgreSQL gate 静态守卫通过。新增真实 PostgreSQL 锁序测试已纳入 critical gate，但当前受控执行环境禁止连接本机 `127.0.0.1:55432`，因此本轮没有把该测试、full 或 strict 冒充为通过。

下一步：在允许访问隔离 PostgreSQL 的环境完成 critical/full/strict 后，再进入 production order UI / 通用菜单独立切片。

阻塞/风险：尚无 UI、菜单、seed、客户配置、部署或客户签收；共享工作区改动未暂存、未提交、未推送。

## 当前活跃事项

- 当前真源入口为 `docs/当前真源与交接顺序.md`、对应产品 / 架构文档、当前代码、Atlas migration 和测试。
- 当前只收口上述真实缺口；不得回退其它已完成任务，也不把旧审查中的过期 / 超范围建议重新扩成产品功能。
- 发布目标是内网测试机 `192.168.0.133`；低配目标只加载本地 fixed revision 构建产物、执行 migration、Compose 重启和部署后回归。

## 归档索引

## 2026-07-12 权限中心岗位能力可读化

完成：权限中心角色模板接入后端现有 `menu_options` 投影，在不新增菜单权限真源的前提下，按当前勾选即时展示“可以进入 / 暂不可进入”的桌面菜单，并把功能勾选区改为甲方可理解的岗位能力说明。页面同时明确字段显示属于当前客户页面配置，不把尚不存在的字段级角色授权伪装成可配置能力。未保存状态不再常驻展示大块警告，只保留轻量状态；切换角色、切换 Tab、侧栏离开页面、刷新当前页和浏览器刷新时才确认，取消继续编辑，确认后丢弃草稿再执行动作。

完成：复核外部权限管理建议后撤回顶级“页面字段”Tab，避免把客户级列表 / CSV 显示配置误写成角色字段权限。角色详情收口为“功能权限 / 数据范围 / 敏感字段 / 生效页面预览”：功能权限继续走现有 RBAC 保存，页面只读投影继续由后端菜单映射推导；数据范围如实展示 Workflow 任务已有责任岗位 / 指定处理人边界和普通业务资源尚未隔离的现状；敏感字段明确要求后端查询、修改、导出和打印同源执行，当前不提供前端伪开关。

完成：内置菜单权限合同从单一 `RequiredPermissions + HasAny` 拆为显式 `RequiredAny / RequiredAll`，共享页面继续按任一相关读取权限进入，组合权限合同可独立表达并由 Go / 前端单测守住。JSON-RPC 菜单选项新增 `required_any / required_all`，暂保留合并后的 `required_permissions` 兼容旧消费者；权限中心生效页面预览优先消费新合同，旧 mock / 旧响应仍按 ANY 兼容。

验证：权限中心可见技术字段守卫 53/53、定向 ESLint、定向 Stylelint、`permission-center-desktop` 与暗色 loading/恢复态 style:l1、相关文件 `git diff --check` 均通过；浏览器证据覆盖角色能力视图、长菜单列表、账号 tab、窄区不横向溢出和暗色可读性。

下一步：后续若要让甲方逐字段查看或调整，必须基于 customer config 已接通的字段 surface 单独建设“页面字段配置”控制面；不能塞进角色 RBAC，也不能把当前仅三个列表 / CSV surface 的 `visible` 扩大表述为全页面字段权限。

阻塞/风险：本轮未修改 RBAC、schema、migration、后端菜单映射、客户字段策略、Workflow / Fact 或部署。共享工作区仍包含大量其他会话改动，提交时必须精确审查本轮文件。

- `docs/archive/progress-2026-06-28-before-runtime-manifest.md` 至 `docs/archive/progress-2026-07-08-before-runtime-lazy-import-retry.md`：历史过程记录索引见各归档、`docs/archive/README.md` 和 Git 历史。
- `docs/archive/progress-2026-07-11-before-manual-regression-deploy.md`：本轮全场景手工回归数据、提交推送和 133 部署收口前的历史流水。
- `docs/archive/progress-2026-07-12-before-agents-size-gate.md`：自定义 Skills 与项目 AGENTS 首轮治理过程记录。
