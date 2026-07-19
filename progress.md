# plush-toy-erp progress

本文件只保留当前活跃事项、最近完成记录和归档索引；历史流水已完整归档到 `docs/archive/`。`progress.md` 是过程交接线索，不是正式需求、数据模型、迁移或部署真源。

## 当前活跃事项

- 当前真源入口为 `docs/当前真源与交接顺序.md`、对应产品 / 架构文档、当前代码、Atlas migration 和测试；截图、历史任务与本文件不能单独证明运行态。
- 当前共享 worktree 的并行写任务已经结束，现由单一 Git owner 冻结并收口整树；来源血缘、事实退出、生产路线 / WIP、岗位任务和页面合同等改动统一按最终 `strict` 证据提交，不再把相邻差异拆算为独立未收口任务。冻结树首轮 `strict` 已输出 `status=complete`，本记录纳入后仍须对最终树再取得同一结果才允许提交。
- 固定生产路线 / WIP 的版本化 migration 已生成；登记的个人开发库已读回到 `20260718125909`、83 executed、pending 0，schema 与约束已生效，但固定路线所需的工序标准位置仍须通过工序页或受控 seed 显式绑定。共享库和目标环境没有本轮 apply 证据；本轮不执行 schema / migration 或业务数据写入，角色演示账号密码重置是下述独立的本地认证数据写入。
- 本轮已获得整树提交和推送授权；仍不创建分支、不部署、不执行共享库 / 目标库 migration 或 backfill，也不补做目标 health / smoke、真实岗位浏览器读回和客户 UAT。
- 发布目标仍是内网测试机 `192.168.0.133`；本次提交推送不等于该目标环境已经发布或验收。

## 2026-07-19 整树严格门禁与 Git 收口

完成：按 full-worktree 范围冻结当前 45 个修改文件，两个独立只读审查覆盖完整 diff 与角色 seed 安全边界。审查发现的固定公开密码可进入高权限账号 / 非隔离目标问题已修复：公开值按实际密码值而不是输入来源判断，只允许登记的 `192.168.0.106:5432/plush_erp_*_dev`，账号集排除 admin / debug，debug、人工验收场景和 `--allow-prod` 均要求非默认密码；MVP、开发测试工作台和 README 的完整角色验收命令同步恢复为非默认密码占位。两路复核均无剩余提交阻断。

当前验证：冻结树首轮 `bash scripts/qa/strict.sh` 输出 `status=complete`；其中 server quick `2630 / 2630`、关键 PostgreSQL `190 / 190`、server all `2784 / 2784` 均为 `0 fail / 0 skip`，scripts / Web 全量测试、Web production build、Chromium PDF 安全集成、数据库 fresh / populated upgrade、漏洞扫描、ShellCheck、shfmt、YAML 和 Web 零 warning 门禁完成。角色 seed / 文档 / MVP / 开发测试定向合同 `25 / 25`、secrets range gate 和 `git diff --check` 另行通过。本记录是首轮 strict 后唯一计划内改动；只有把它纳入最终树后再次取得 `strict status=complete` 才执行提交和推送。

未做 / 风险：本地门禁不等于发布或客户验收；本次不部署 `192.168.0.133`，不 apply 共享库 / 目标库 migration，不执行目标 health / readback、真实岗位写入 smoke 或客户 UAT。角色公开值的目标保护当前绑定登记的 DSN 地址、端口和隔离库名，尚未增加连接后 PostgreSQL cluster system identifier 读回；这是本次审查确认的非阻断盲区。

## 2026-07-19 角色演示账号密码与环境边界

完成：标准 `demo_*` 角色账号 seed 入口保留无输入开发便利，但公开测试值 `12345678` 现在同时绑定登记的 `192.168.0.106:5432/plush_erp_*_dev` 隔离开发库和九个普通业务角色；无输入不会生成 `demo_admin` / `demo_debug`，也不会重置人工验收场景账号。`demo_admin`、调试账号、人工验收账号和完整角色验收必须显式提供非默认密码；公开测试值即使显式传入也不能离开登记的隔离开发库，`--allow-prod` 必须使用非默认密码。已有账号仍只有显式 `--reset-password` 才改密；同步更新 scripts / server / MVP 验收说明、永绅试用账号清单和开发测试合同。

完成：安全边界收紧前，已在登记的个人开发库上用无输入命令真实重置十个角色账号，并完成 `admin_login + me` 的 `10 / 10` 读回；该历史执行只证明当时的个人开发库，不是当前代码允许无输入重建高权限账号的合同。收紧后的代码不会再以无输入默认处理 `demo_admin`，本次 Git 收口也没有再次连接数据库或改动任何账号。

当前验证：`go test -count=1 ./cmd/seed-role-demo-admins ./internal/data -run 'RoleDemo|ManualAcceptancePasswords'`、完整 command 包测试、Node 角色文档 / MVP / 开发测试合同 `25 / 25`、文档清单与本地链接 `3 / 3`、脚本语法、secrets range gate 和 `git diff --check` 通过，均无 skip。真实永绅浏览器 smoke 已用 `demo_boss / 12345678` 成功登录并进入工作台，但因当前菜单未显示脚本期望的“业务看板”而在 15 秒后失败，未继续核对其余账号，不能写成浏览器 smoke 通过；该菜单漂移不影响本轮 API 级密码与角色登录证据。

未做 / 风险：收紧代码不会自动轮换个人开发库里此前已重置的账号；如需改变既有密码，仍须在明确目标后显式执行 `--reset-password`。本轮未重置 `demo_debug`、三个 `demo_uat_*` 场景账号、133 或生产账号，未部署、未执行目标环境 readback 或客户 UAT。整树门禁与提交停止线见上方 Git 收口记录。

## 2026-07-19 外部审查问题与并行工作树集中收口

完成：按外部审查优先级收口固定生产路线、WIP migration / command、来源单据与业务事实血缘、岗位任务、客户配置、页面和验收合同；固定路线改用稳定工序代码与版本化绑定，WIP 关联迁移保留可追溯的数据转换边界，初始化命令的幂等语义与事件合同一致。同步修正并行开发后暴露的移动任务刷新、客户配置身份、来源只读分页、Ant Design 表单挂载及 QA 静态合同漂移，没有通过放宽权限、来源、状态或幂等条件换取测试绿色。

完成：Atlas migration、Ent 生成物、正式架构 / 能力 / 客户交付文档与当前实现重新对齐。登记的个人开发库只读核对为 `20260718125909`、83 executed、pending 0；固定路线仍为 `0 / 4` 个标准工序位置已绑定，必须由工序页或受控 seed 显式完成，不能把 migration 已执行写成路线已可用。共享库和目标环境没有本轮 apply 证据。

当前验证：Node `24.14.0` 下 scripts 全量 `1273 / 1273`、Web 全量 `1691 / 1691`，完整 Style L1 mock Chromium `154 / 154`，均为 `0 fail / 0 skip`；关键 PostgreSQL 矩阵连续 3 轮各 `190 / 190`，另完成 24 轮并发竞态复核。`make data` 没有生成额外 migration，Atlas validate、fresh / 存量升级、`db-guard` 和 schema 合同通过。整树冻结后的首轮 `bash scripts/qa/strict.sh` 已输出 `status=complete`；本记录纳入后的最终复核仍是提交停止线。

未做 / 风险：本次只治理、验证、提交和推送当前代码库；未部署 `192.168.0.133`，未写入共享库或目标库，未执行目标环境 health / readback、真实岗位浏览器验收或客户 UAT。Atlas migrate lint 仍受 Pro 登录限制，已由 validate、fresh / 存量升级和 PostgreSQL 矩阵补证；超大前端页面拆分继续作为非阻断技术债，不在本轮扩展范围。

## 2026-07-19 移动岗位任务 v1 列表 + v2 选中任务流

完成：移动岗位任务端保留现有 v1 待办 / 已办 / 提醒 / 我的列表、主筛选、服务端游标分页 / 分批展开和任务卡片；选中任务后改由 v2 独立全屏“查看任务 → 处理任务 → 可信结果回执”承接，结束后恢复原列表的筛选、已加载分页、滚动位置和焦点。浏览器 / 系统返回、处理草稿、深分页任务恢复、重复游标 / 无新增页止损、窄屏、暗色、移动键盘和焦点返回均纳入同一流程合同。

完成：处理动作只消费后端 action explain 投影；有多个可办动作时使用原生单选框选择，只有一个催办动作时不再显示“选择处理方式”或可点击的假“催办”选项，而是在卡片内显示非交互“本次操作：催办”摘要，真正的提交命令固定在底部“确认催办”。历史草稿或授权投影从其他动作收窄为唯一催办时，页面会同步受控动作并隔离旧动作原因，不会落入反复提示“处理方式已变化”却无选项可改的死路。只读任务不展示假动作。完成反馈进入后端 `payload.feedback`，阻塞、退回、解除阻塞和催办继续按动作合同要求原因；动作页不再收集自由文本证据或重复提供文件上传，新动作不生成 `evidence_refs`。回执只接受本次可信 mutation 的 `confirmed / unknown / failed` 结果，不从任务终态补造成功、处理人或时间；Workflow done 和附件上传都不等于业务 Fact 已生效。

完成：详情页把原“现场证据”收敛为真实“任务附件”。只有任务可由当前岗位办理且账号具备 `workflow.task.update` 时才显示“查看与补充附件”，跨岗位催办、终态回执或无写权限场景只显示“查看任务附件”；只读弹窗不再渲染禁用的假上传按钮或隐藏文件输入。旧 `mobile_action_evidence_refs / evidence_refs` 继续只读归一化，并仅在确有数据时以“历史处理线索”展示；新动作和新回执不会复制这些历史引用。附件按钮的装饰图标已从可访问名称中移除。

完成：终态动作把任务从待办 / 风险缓存移走后，结果回执仍可按同一账号、客户与权限 revision 的可信 canonical 快照回看只读详情，不重新开放处理。History 草稿、回执详情与 Back / Forward 恢复均要求完整 access scope 相等；稀疏筛选另存每个服务端视图的实际已加载数量，刷新时最多按 `20 x 50 = 1000` 条恢复，不再把筛选后可见条数误当服务端扫描深度。三位数任务计数在 390px 窄屏筛选条内保持裁切，无内部横向溢出。

完成：原型与文档登记改为有意组合的当前主路径。`mobile-role-tasks-v1/implemented-reference.html` 与 `mobile-role-tasks-v2/index.html` 同时登记为 Current，分别描述当前列表基线和当前选中任务流程；v1 文件内旧详情只作历史对照，v2 不替换或移除 v1 列表。旧 `filter=to-implement&asset=mobile-role-tasks-v2` 深链会保留资产并自动迁移为 `filter=current`，不再把用户跳到待实现队列第一项。

当前验证：Node `24.14.0` 下动作、附件、回执、原型登记、模拟闭环和运行时 smoke 定向合同 `134 / 134`，当前共享树 Web 全量 `1697 / 1697`，均为 `0 fail / 0 skip`；文档 / MVP 定向合同 `7 / 7`、Web ESLint、Stylelint、`git diff --check` 通过，Vite production build 转换 `3319` 个模块并通过。`mobile-yoyo-role-task-projection`、`mobile-yoyo-boss-urge-only`、`mobile-yoyo-role-task-readonly-actions`、`mobile-tasks-dark`、`mobile-tasks-browser-back-stays-mobile` 五个 mock Chromium Style L1 场景 `5 / 5` 通过，覆盖 390 / 430px、多岗位、只读附件、无假上传、催办单一摘要、动作页无证据输入、暗色和返回恢复。真实本地浏览器复用已登录 `http://127.0.0.1:15200/m/boss/tasks` 做了只读核对：任务详情显示只读“任务附件”，弹窗没有上传按钮或 file input；进入催办页后只有“本次操作：催办”、一个催办原因文本框和底部“确认催办”，没有“选择处理方式”、radio、现场证据或 file input，文档横向宽度与视口一致；随后取消返回详情，未提交任何任务动作。`5175` 原型中心 live 核对显示 v1 与 v2 两项 Current，旧 v2 待实现深链自动规范为 Current 并保持选中 v2。

未做 / 风险：本轮没有在真实任务上点击“确认催办 / 完成 / 阻塞 / 退回”，也未执行会创建并变更 Workflow 模拟任务的真实岗位账号全流程 smoke，因此真实后端写入、回执读回和附件上传成功链仍未由本次浏览器核对证明。未完成目标环境发布读回或客户 UAT，未改 schema / migration、后端 Fact、RBAC 权限码、正式菜单或客户数据，也未连接 / apply 数据库或部署；移动切片的定向绿色已由上方整树 strict 补充本地门禁，但仍不替代真实写入、目标发布或 UAT。

## 2026-07-19 开发工作台覆盖状态与证据边界

完成：开发工作台新增整个 Product Core 的只读覆盖视图，按 Go / Web 代码、业务域场景、T0-T8 门禁和运行态 / UAT 分层展示，不把财务专项或局部绿色合成“全系统覆盖率”。开发态固定 GET 接口只读 ignored latest 报告，严格校验 loopback / Host、schema、大小、敏感字段和仓库指纹；原有 `web/public/qa` 跟踪报告已删除，不再进入生产构建。

完成：新增共享 repository identity、字段联动 runner 和整仓聚合器。指纹同时绑定 commit、tracked diff 字节和稳定的 untracked 内容；测试运行前后变动、错误 schema、计数冲突、跳过 / 取消 / todo、零执行、过期 artifact 和缺失证据均 fail closed。当前字段联动专项业务场景为 `66 / 68`，另 `2` 项明确保持 missing；这只是 Frontend 字段联动切片，不等于整仓覆盖。

当前验证：Node `24.14.0` 下覆盖报告、安全接口、字段目录和工作台定向合同 `82 / 82`、文档清单 `3 / 3`通过；Prettier、ESLint、Stylelint、Vite production build 和生产产物泄露扫描通过。覆盖页亮色 / 暗色、loading、missing、current + stale 和移动端共 `5 / 5` 个 mock Chromium Style L1 场景通过。

未做 / 风险：当前 Go / Web 行与分支覆盖制品、T0-T8 全部门禁回执、PostgreSQL、真实浏览器业务读回、readiness、目标环境和客户 UAT 仍为 missing，不用 `0%` 或局部通过掩盖。共享 worktree 因其他任务改动已升级到 T8 风险，本任务未运行或宣称整树 full / strict 通过，也未连接 / apply 数据库、提交、推送、部署或执行客户验收。

## 2026-07-19 相关单据连续往返与数字参数合同

完成：修复发票管理 -> 出货单 -> 发票管理的连续相关单据跳转。每一跳都从目标页自己的精确关系重新建立筛选，不再依赖上一页残留状态；URL 中的精确 ID 在请求边界统一转为 JSON number，避免 Go 严格参数解析把字符串 ID 当成 0。发票页按 `INVOICE + SHIPMENT / source_id` 的事实真源筛选，只有一条可确定的有效记录时自动选中并回显规范发票号；存在多条取消历史且无法唯一确定时不臆选。用户编辑或清空筛选后仍会退出相关单据上下文。相同数值 ID 合同同步覆盖销售、采购、生产、委外、收货、质检、出货、库存和 Operational Fact 相关跳转。

当前验证：Node `24.14.0` 下相关页面和导航合同 `97 / 97`、Web ESLint、Vite production build、`git diff --check` 均通过；定向 Style L1 `发票 -> 出货 -> 发票 -> 出货 -> 发票` mock Chromium 场景 `1 / 1` 通过，覆盖 URL 精确参数、RPC number 类型、规范业务单号回显、唯一记录自动选中、清空恢复、无错误提示和无横向溢出，并保存 3 张 `1440 x 900` 视觉证据。Web 全量单测 `1669 / 1671` 通过，另 2 项失败来自共享 worktree 中已退役桌面“异常处理”入口后的旧菜单数 `30 -> 29` 与 Dashboard 元数据数 `4 -> 3` 断言，未加载本轮相关单据代码。

未做 / 风险：本轮未改 schema / migration、后端 Fact / RBAC / menu，也未连接或 apply 数据库。本机 `5175` 当前是未连接客户数据的 Product Core preview，无法提供真实业务记录运行态验收；Style L1 是 mock Chromium，不能替代真实客户 runtime、133 发布读回或客户 UAT。共享工作树 `affected --plan` 因 520 个跨任务文件达到 T8，本任务没有运行或宣称整树 `full / strict` 通过，也未提交、推送或部署。

## 2026-07-19 提醒页统一显示更多与刷新边界

完成：移动岗位任务页不再同时显示“分批展开”和“继续加载风险任务”两个入口。待办、已办、预警、提醒统一使用一个“显示更多”按钮：先展开当前已加载内容，接近已加载边界且服务端仍有下一页时，由同一按钮按原 `server_time` 游标快照续取并直接显示新批次；顶部刷新继续使用无游标请求，单独负责获取最新快照。移除了“当前只显示已加载内容”等实现性说明，保留加载中禁用、失败后可重试、全部显示后的收起行为。

当前验证：Node `24.14.0` 下分页、快照漂移、失败保留与 Style L1 RPC mock 定向测试 `39 / 39` 通过，Web ESLint 和 CSS lint 通过；`mobile-tasks-dark` mock Chromium 场景 `1 / 1` 通过，真实点击验证页面始终只有一个列表控制，跨首个 50 条服务端页后预警已加载数由 50 增至 62、可见条目继续增加，并保存折叠态与跨页态截图。Web 全量单测 `1651 / 1653` 通过，另 2 项失败来自共享 worktree 中已退役桌面“异常处理”入口后的旧菜单数 `30 -> 29` 与 Dashboard 元数据数 `4 -> 3` 断言，未加载本轮移动提醒页代码。

未做 / 风险：本轮未改 schema / migration、RBAC、Workflow / Fact、正式 API 或菜单，没有连接或 apply 数据库；浏览器证据使用本地 mock，不能替代真实后端岗位账号、133 发布读回或客户 UAT。共享工作树 `affected --plan` 因 513 个跨任务文件达到 T8，本任务没有运行或宣称整树 `full / strict` 通过，也未提交、推送或部署。

## 2026-07-18 通用异常总控入口退役

完成：移除与工作台、任务看板重复的通用异常总控菜单、路由、页面投影和专用样式，不保留旧路由重定向或权限别名。跨模块待处理和阻塞 / 逾期风险统一由工作台风险队列、任务看板、岗位任务端及相关业务页承接；领域 `生产异常` 页面、`production_exception` 来源任务、Workflow 动作权限和 Fact 边界保持不变。

完成：同步前后端内置菜单、客户配置、角色投影、权限使用面、正式产品文档和 yoyoosun 培训 / 菜单 / 验收资料。正式手工验收目录从 51 项收敛为 50 项，桌面页面从 30 项收敛为 29 项；`production-exception-active-tasks` 探针改归保留的生产异常页。产品核心原型的 51 个内部覆盖细项不是页面验收数量，继续保持原口径。

当前验证：`git diff --check` 通过；`go test ./internal/biz -count=1` 通过；菜单与客户配置 Node 合同 75 / 75、手工验收 catalog / browser / readiness / dataset 合同 110 / 110、文档清单 3 / 3 均通过且无跳过；Web lint、CSS lint、Vite build 通过。`erp-yoyo-global-dashboard-desktop`、`erp-task-board-desktop`、`business-menu-groups-desktop` 三个 Style L1 浏览器场景通过，证明工作台和任务看板承接路径仍可用，侧栏不显示通用“异常处理”且保留“生产异常”。

未做 / 风险：旧书签会按明确退役策略失效，不提供兼容跳转；本轮未改 schema / migration、未连接或 apply 数据库，也未提交、推送、部署、执行 133 readback 或客户 UAT。共享工作树的 `affected --plan` 因 488 个跨任务文件达到 T8，本任务没有把其他 writer 的 schema / 发布影响算入自身，也没有以定向绿色声明整树 `full / strict` 通过。

## 2026-07-18 财务字段真源与分层验收合同收口

完成：财务列表不再以“每个单元格都非空”为目标，而是按 FactType 固定字段适用性。出货应收从销售订单冻结收款分类与精确账期天数，`0 / 30 / 45` 天分别投影为现款、月结 30 天、月结 45 天，其他合法天数保留为“自定义账期 / N 天”，不猜测枚举；发票由操作人从正式类别中必填，发票类别不再误写到应收。当前采购 / 委外来源没有可证明的付款方式、账期与发票类别真源，因此应付保持不适用空值；对账同样不展示这些非本类型字段。非取消记录的取消审计为空属于正确语义，取消记录必须完整保存取消时间、操作人和原因。

完成：服务端来源创建、流程命令和事务内读回统一执行上述合同。应收在写入前锁定并复核出货、销售订单、客户和账期；发票缺类别会 fail closed；自定义账期保留精确天数。Web 页面只展示本 FactType 适用列，并区分“不适用”“历史未记录”“待核对”；出货来源动作只允许发票提交发票类别，服务端拥有的金额、客户、账期等字段继续禁止由前端补造。

完成：新增共享财务字段验收合同，贯穿 source-data、source-driven facts、fact-data、readiness 与 browser 报告。数据集与 readiness 对本批全部财务引用逐行校验，要求字段合同覆盖率 `100%` 且摘要 digest 一致；浏览器自动化要求应收、应付、发票、对账 4 / 4 页面列投影正确，并验证代表记录的有效值与非取消记录的取消字段 `-`。正式业务场景、数据集、目标环境验收与客户必验项均要求 `100%`；行覆盖率 `>= 90%`、分支覆盖率 `>= 85%` 只作辅助质量指标，不能替代业务场景覆盖。

当前验证：`cd server && go test ./internal/biz ./internal/data ./internal/service -count=1` 通过；Node `24.14.0` 下财务字段、来源动作、页面投影、验收 catalog / dataset / readiness / browser 合同定向测试 `181 / 181`，相邻 API / Style L1 mock / 财务来源合同测试 `41 / 41`，均为 `0 fail / 0 skip`；`web/src` ESLint 通过，`git diff --check` 通过。自动化证明代码合同与报告门禁，不代表已对真实目标数据库生成新批次或完成浏览器运行态验收。

未做 / 风险：未 apply 或清理任何数据库，未改 schema / migration，未重建当前截图中的历史财务事实。财务事实不可为补齐展示字段而直接覆写；旧 V5 报告不满足新合同，应在确认归属的专用验收库用新数据身份重新生成并完成 dataset -> readiness -> browser 证据链。当前共享 worktree 还有大量其他会话改动，因此没有把定向绿色写成当前整树 `full / strict` 通过；也尚未提交、推送、部署、执行 133 readback 或客户 UAT。

## 2026-07-18 来源血缘、草稿事实退出与结算边界收口

完成：采购入库、采购退货、采购入库调整、生产事实、委外事实和正式来源财务事实均支持 `DRAFT -> CANCELLED`。草稿取消只终止未过账记录，不写库存流水；`POSTED -> CANCELLED` 仍按各领域既有合同写库存 `REVERSAL` 或保留财务取消审计，不能把两条路径合并描述为“删除”或“统一冲正”。取消终态重放保持幂等，来源坐标损坏、无正式来源的财务草稿或改 actor / reason 的财务重放均 fail closed。

完成：采购入库草稿取消会在同一事务锁定收货、关联来料质检和涉及批次，校验 `PURCHASE_RECEIPT / INCOMING / MATERIAL` 的精确来源形状；`DRAFT / SUBMITTED` IQC 转为 `CANCELLED`，已判定或已取消 IQC 保留审计。仅由该草稿准备且没有其他收货引用的批次，必须确认所有余额精确为零后才改为 `DISABLED`；任一非零余额或来源形状异常会整笔回滚。采购退货 / 调整草稿取消会同时锁定父收货，终止草稿但不写库存；子修正全部 `CANCELLED` 后，父收货取消依赖解除。采购收货草稿取消后也不再阻断采购订单关闭 / 取消。

完成：生产订单来源的领料、完工和返工草稿可直接取消且零库存；已过账完工仍受未取消返工事实阻断，已过账返工仍受来源异常任务终态约束。生产父单关闭要求子事实处于 `POSTED / CANCELLED`，取消要求全部子事实 `CANCELLED`；草稿事实取消后父单对应关闭 / 取消路径解除。委外订单来源的发料 / 回货草稿同样零库存退出，关闭 / 取消父单分别要求子事实 `POSTED / CANCELLED` 或全部 `CANCELLED`；委外回货无论草稿或已过账，只要仍有非取消质检或应付就阻断取消，委外发料已过账取消还继续服从 WIP 外发分配依赖。

完成：正式来源财务草稿（出货应收 / 发票、采购或委外应付、财务事实对账）取消会写 `cancelled_at / cancelled_by / cancel_reason`，不写库存；非取消对账子事实继续阻断上游财务事实取消。并发 post / cancel 通过相同事实行锁串行：cancel-first 时后续 post 失败且不产生库存，post-first 时取消在过账后执行既有反向路径；最终只允许 `CANCELLED`，不会留下半笔库存变动或缺失财务取消审计。

完成：公开来源动作的读取能力由服务端共享 registry 统一声明，handler 在进入来源 repository / usecase 前同时执行目标动作权限、精确来源读权限和对应模块的 enabled / readable 门禁；条件来源只按请求真实引用项加权，动态财务来源先做候选读权收窄，再按服务端读回的 authoritative FactType 校验精确读权。registry 与 permission usage 同步测试、逐项缺权测试和 AST handler guard 阻止“登记了来源动作但 handler 漏调 guard”；流程启动还验证来源模块无效时不会读取来源或写 ProcessRuntime。

完成：页面血缘已重新区分“服务端实现”与“正式 Web 可达”。`add_purchase_receipt_item`、物料供应 4 个和成品交付 5 个公开动作统一标为 `partial / backend-only`；销售订单正式提交只登记 ProcessRuntime start + execute，不把服务端 `submit_sales_order` 冒充为第二条页面链路；发票不再误登 `settle_finance_fact`，从发票生成对账事实仍是正式路径。

完成：加工合同页新增统一“委外记录”入口，展示 `MATERIAL_ISSUE / RETURN_RECEIPT`。页面按 `outsourcing.fact.read / post / cancel` 精确权限和 canonical `list / post / cancel_outsourcing_fact` 办理状态：`DRAFT` 可过账或作废，`POSTED` 可取消，`CANCELLED` 只读；草稿作废与已过账取消分别提示“库存零变动”和“恢复至过账前库存”。写请求返回后必须重新读取并确认目标 ID / 状态，未知结果不允许提示成功或盲目重试。质检 / 应付只对 `POSTED RETURN_RECEIPT` 开放，应付继续要求质检合格或让步接收。

完成：通用业务记录页对历史无合法来源的草稿收口。生产 / 委外 `DRAFT` 缺必需来源坐标时，过账与作废同时禁用；财务 `DRAFT` 缺正式来源时，确认与作废同时禁用。来源完整的合法草稿仍可过账 / 确认或零库存作废，不用必然失败的请求来掩盖历史数据缺口。出货服务端同时明确支持 `DRAFT -> CANCELLED` 零库存，`SHIPPED -> CANCELLED` 才写库存冲正；正式出货页已分别显示“作废草稿”和“撤销已出货”，并在取消 RPC 后重新加载列表。

完成：采购订单页不再把基础资料加载竞态显示成“暂无材料”。供应商 / 材料 / 单位的表单 readiness 与启用仓库的入库草稿 readiness 分开；库存批次不参与这两条准备链。未 ready 或失败时，对应新建、编辑、来源导入、保存或生成入库草稿操作 fail closed；刷新页面会重试并传递失败，不误报刷新成功。重叠请求使用 latest-wins，只有最新请求成功 ready 后的零条才是合法空结果；已打开表单和保存 handler 仍有第二层禁用 / 拦截。

完成：浏览器恢复态回归发现并修正出货来源残值。用户查看过销售来源单后再新建出货草稿，页面会显式清空 `sales_order_id`、客户带值和来源候选 / 行选择缓存，不会将上一张单的锁定来源泄漏到新草稿。Workflow 场景同步当前可见口径“可执行 / 任务附件 / 更多操作”；生产草稿 fixture 使用 canonical `PRODUCTION_ORDER + source_line_id` 来源，并只精确授予 `production.fact.cancel`，没有为让场景通过而放宽来源、状态或权限。

当前验证（本轮直接相关）：PATH 锁定 Node `24.14.0` 后，实际当前树与冻结快照的来源链 mock Chromium 均为 `business-core 1 / 1 + 来源链 33 / 33 = 34 / 34`，失败关闭与竞态证据一致；相关前端合同 `450 / 450`，以上均 `0 fail / 0 skip`。冻结来源链快照的 Web lint 通过；最新实际共享树的 CSS lint 和 Vite production build（`3319 modules`）通过，但 Web lint 被 3 个共享树外部移动端错误阻断：`useMobileRoleTaskActions.test.mjs:261` 违反 `prefer-destructuring`，`MobileRoleTasksPage.jsx:28` 的 `resolveMobileRoleTaskReceiptDetailTask` 和 `MobileRoleTasksPage.jsx:275` 的 `receiptDetailSnapshot` 未使用；因此不声明最新共享树 Web lint 通过。`go test ./...` 通过，`go test ./internal/biz ./internal/data ./internal/service -count=1` 冻结后重跑通过；一次性 PostgreSQL 整组 `190 / 190`、关键并发集 `5 / 5`，均 `0 fail / 0 skip`。`make data`、`db-guard`、`git diff --check` 和 `agents-size` 通过。

整树门禁未全绿：前一次完整 frontend 为 `1673 / 1682`、`9 fail / 0 skip`；Node `24.14.0` 下当前完整复跑 `pnpm test --test-reporter=tap` 的新鲜结果为 `1679 / 1686`、`7 fail / 0 skip`。7 个失败分别是 frozen user-intent attempt store 静态断言、devCustomerConfig 菜单数、task surfaces metadata 数、3 个移动端流程旧 `loadTasks` 断言，以及正式页“响应快照”文案。审计未发现 Document / Fact / Workflow 边界被破坏，但这 7 项仍是当前整树的真实失败，不因与本轮来源链无关而删除或写成通过。

`strict.sh` 最后一次完整执行在修复前阻断于 `full -> fast` 的 scripts Node tests：`1263 / 1273`、`10 fail / 0 skip`，原失败包含 formal frontend customer config boundary、fixed full / strict gate、fixed Node / Go summaries、2 个 local-test manifest / session、3 个 mobile workflow copy / access / refresh、purchase projected actions、fact action / status guards。其中 2 个本轮相关的 gate-orchestration 旧硬编码断言已修正，现会验证共享 critical PostgreSQL 清单被 fast / full 消费，对应文件定向 `7 / 7` 通过。修复后已完整复跑 scripts Node tests，新鲜结果为 `1265 / 1273`、`8 fail / 0 skip`，失败正是上述剩余 8 个共享树外部面。该结果只更新 scripts Node tests 层；strict 未从头重跑，后续 secrets、web-all、build、browser、PostgreSQL、server-all 和 govulncheck 仍未执行，本轮不声明 `full / strict passed`。

未做 / 风险：整树 frontend 和 `full / strict` 仍有上述失败与未执行阶段；本轮尚未提交、推送或部署，未 apply 任何个人开发库、共享库或 133 migration，未执行目标环境 health / smoke、真实岗位浏览器读回或客户 UAT。已过账委外取消目前由页面 / 组件合同覆盖，mock Chromium 没有代替真实后端持久写入和数据库库存冲正读回；因此可以写“页面可达”，不能写“真实后端库存冲正已浏览器验收”。

## 近期已完成基线

- 2026-07-19：`/m/<role>/tasks` 已形成有意组合的 v1 列表 + v2 选中任务流程；v1 与 v2 同为 Current，分别登记列表基线和选中任务流程。动作页只提交反馈 / 原因，任务附件统一在详情按权限管理，旧证据引用仅作历史线索；未删除 v1 列表，也不以整页替换 v1 作为 v2 完成条件。

- 2026-07-18：出货来源导入改为服务端候选分页和十进制字符串，只有 `SHIPPED` 占用来源余量；公开流程只从销售订单、采购订单和出货单三类真实来源启动，旧无来源采购入库与入库单起流程入口退役。
- 2026-07-18：外部代码审查 P1 / P2 集中治理时，Node 24.14.0 下 `strict.sh` 曾完成 scripts 1242 / 1242、Web 合同 200 / 200、server quick 2359 / 2359、Web 全量 1570 / 1570、关键 PostgreSQL 156 / 156、server-all 2493 / 2493，0 fail / 0 skip；这是后续密集并行修改前的历史基线，不证明当前工作树仍全绿。
- 2026-07-17：三类确定性 Workflow 来源任务已接入真实领域 producer；`production_scheduling / production_exception / shipment_release` 使用 `workflow.source-task/v1`，任务完成仍不代写生产、库存、出货或财务事实。

## 下一步与停止条件

1. 收口或隔离共享树尚存的 scripts / frontend 失败，冻结后从头重跑 frontend 全量与 `strict.sh`；只有 strict 后续 secrets、web-all、build、browser、PostgreSQL、server-all、govulncheck 全部真实执行并通过后，才能声明 `full / strict passed`。本轮来源链定向绿色不覆盖该停止线。
2. 以真实后端岗位账号补做委外 `DRAFT` 过账 / 作废、`POSTED` 取消和数据库库存流水读回；mock 场景与静态合同不能替代该层。
3. 由单一 Git owner 核对最终 `git status / diff`，只在用户授权后精确 stage、提交和推送；发布、迁移、133 smoke 和客户验收继续作为独立关口。

## 归档索引

- `docs/archive/progress-2026-07-18-before-source-lineage-draft-cancellation-closeout.md`：本轮来源血缘和草稿取消集中收口前的完整过程记录；归档前为 382 行 / 80,765 bytes，SHA-256 `e12b6a5716423623d3766fbbe3bbb365b5ae3376d272a44077758630fba1a31a`。
- `docs/archive/progress-2026-07-17-before-workflow-source-task-producers.md`：三类 Workflow 真实业务 producer 接入前的完整过程记录。
- `docs/archive/progress-2026-07-15-before-local-admin-default-policy.md`：本地管理员默认凭据稳定化前的完整过程记录；归档前为 395 行 / 81,622 bytes。
- `docs/archive/progress-2026-06-28-before-runtime-manifest.md` 至 `docs/archive/progress-2026-07-12-before-doc-code-consistency-audit.md`：更早历史过程记录索引见各归档、`docs/archive/README.md`、`docs/文档清单.md` 和 Git 历史。
