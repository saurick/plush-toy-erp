# plush-toy-erp progress

本文件只保留当前活跃事项、最近完成记录和归档索引；历史流水已完整归档到 `docs/archive/`。`progress.md` 是过程交接线索，不是正式需求、数据模型、迁移或部署真源。

## 当前活跃事项

- 当前真源入口为 `docs/当前真源与交接顺序.md`、产品能力台账、客户交付矩阵、当前代码、Atlas migration 和测试；截图、历史任务与本文件不能单独证明运行态。
- 审批任务、异常流 V1 及四项收口 Worktree 已带回 Local；本次保留 Local 的能力台账收敛、岗位导航与客户确认文档结构，只吸收 Worktree 的新领域事实，没有恢复已删除的旧状态台账。
- 登记的专用本地验收库 `plush_erp_acceptance_20260716_v5_dev` 与 133 V5 固定库 `plush_erp_uat_20260716_v5` 仍只证明已应用到 `20260722000505` 的固定版本；当前 latest migration `20260723155358_reconcile_permission_assignment_boundaries.sql` 未对共享库、133 或生产库 apply。
- 133 V5 仍运行固定 release `80b77faeab566660c77fc23cc66c272096692f16` 的技术试用版本；当前异常收口、客户退货 / RMA、收付款及岗位导航后续切片未整体重发，客户 UAT / 签收仍是独立关口。
- 当前 Git 由单一 owner 执行本次 full-worktree 收口；提交 / 推送状态以 Git 远端读回为准。当前未部署，也未对共享、133 或生产数据库 apply migration。

## 2026-07-26 推送前 OpenTelemetry 安全门禁收口

完成：最终 clean HEAD 的 `prepare-push` 在严格 `govulncheck` 阶段发现当前服务端调用链命中 `GO-2026-5158`，没有沿用 2026-07-24 的旧绿色结果，也没有跳过漏洞门禁。`go.opentelemetry.io/otel`、OTLP HTTP trace exporter、SDK、trace、metric 与间接 OTLP trace 模块从 `v1.43.0` 统一升级到官方修复版 `v1.44.0`；随同一上游依赖合同更新 grpc-gateway `v2.29.0`、gRPC `v1.81.1` 和对应 genproto，避免 OTel 子模块版本错位。v1.44.0 对 baggage 解析增加 8192 字节上限并限制畸形 / 超长 header 的错误报告，不在应用层另造旁路限制。

验证：`go mod verify`、`go test -count=1 ./cmd/server ./internal/server ./internal/service`、`go build ./...` 通过；修复后的 `govulncheck ./...` 回执为 `No vulnerabilities found`、当前代码调用链受影响漏洞 `0`。最终推送仍只接受包含本节与依赖锁文件的新 clean HEAD 重新执行 `prepare-push / full` 后签发的当前树回执，不复用安全修复前失败轮次的其余绿色分项。

边界：本次安全收口只改变服务端 Go 依赖锁定与过程记录，没有 schema、Ent 生成物、Atlas migration、数据库 apply、部署、目标环境 smoke 或客户 UAT。

## 2026-07-24 Local 会话合并收口与审批 / 动作边界复核

范围与合并：本轮只在当前 Local checkout 收口，没有创建 Codex App Worktree、底层 Git Worktree、分支或执行 Handoff。复核会话 `019f757e-4727-7f62-a4af-1d722724decc` 后没有发现当前 Local 缺失的独有改动；会话 `019f78fd-86b2-7560-ad40-e744d1fa800c` 对应旧 Worktree 落后当前主线 26 个提交、没有独有提交且有约 140 条未提交路径，因此没有整包带回。只把仍符合当前代码、正式合同和测试真源的行为按语义重实现到 Local；旧 migration / Atlas 生成物、发布部署记录、原型 / 旧文档、宽泛旧前端批次、删除历史证据和放宽门禁的残留均未导入。

审批与账号边界：审批责任启停现在是正式运行时门禁，`enabled=false` 在创建 ProcessRuntime 和修改来源单据前失败关闭；已冻结的在途实例不被新配置改写。发布责任设置会同时检查操作人的全部真实岗位和具名身份，不能借较低优先级或其他岗位给自己新增审批能力。冻结 assignee 只在账号仍启用、仍持有所选岗位且具备冻结 entitlement 时继续可见 / 可办；岗位移除、停用或注销会原子释放未完成的具名任务、增加版本并记录事件与审计。权限中心预览与发布共用冻结 payload，发布中的编辑、刷新和重复提交被同步锁住；每次重新编辑都会生成新的安全 revision。

业务动作与基础收口：销售和采购页在生命周期、生成、打印或保存请求进行中会同步锁定选择、清空、编辑和关联动作，避免双击与旧快照竞态。移动端未知非空岗位失败关闭；员工列偏好按行锁和事务保留其他模块；岗位 Demo 重置同步提升 `auth_version` 并撤销会话；WIP 拆分至少要求两个子项；采购调整说明按 Unicode 字符截断到 64；JSON-RPC 对外只保留 POST。错误码生成改为 Go AST 扫描并阻断重复 id / 前端名 / code；commit-msg 只豁免真实 Merge、Revert、fixup 和 squash；畸形百分号解码失败关闭，RGB / HSV 转换与客户 Web CLI 参数校验同步修正。

Fact 与 migration：生产、委外和财务 Fact 的直接创建只允许 `DRAFT` 且不得预填过账 / 结算 / 取消审计字段，create 与 create-bulk 在发 SQL 前由共享 guard 拦截；测试需要构造损坏终态时先创建 DRAFT 再显式写入测试夹具，不为测试放宽正式入口。`make data` 回执为 migration directory synced、no changes，Ent 生成物和 Atlas migration 均无新增；`bash scripts/qa/db-guard.sh` 通过。本轮没有对个人共享库、133、生产或归属不明数据库执行 migration apply。

浏览器场景复核：权限中心 Style L1 原有断言仍按旧的 2 个员工账号和固定岗位序号取值，已改为消费当前 6 个员工 / 财务岗位 3 个关联账号的同一 mock 真源，并明确选择非当前岗位验证未保存保护；菜单帮助浮层先把鼠标移入浮层再截图，避免离开触发器后节点归零。桌面与 390px 暗色移动端定向场景各 `1 / 1`，随后完整 Style L1 `184 / 184` 通过。

自动化验证：当前代码树完成 `bash scripts/qa/full.sh` T8，无 skip 环境：scripts Node `1344 / 1344`、customer index `2 / 2`、Web contracts `201 / 201`、server quick `2824 / 2824`、Web `1805 / 1805`、隔离 PostgreSQL 关键事务 / 并发 `192 / 192`、server all `2984 / 2984` 均为零失败、零跳过；ESLint、Stylelint、Web production build、服务端 build、严格 secrets、`govulncheck`、存量升级和 disposable PostgreSQL 门禁通过，最终回执为 `[qa:full] status=complete 全部门禁通过`。T8 之后只调整上述 Style L1 场景断言并更新本过程记录，没有再改变产品代码。

边界：当前结果只证明 Local 静态、单元、集成、隔离 PostgreSQL 与受控 Chromium 场景；没有部署、目标环境 readback、真实岗位 smoke、客户 UAT、提交或推送。当前 dirty worktree 还包含本轮开始前已经存在并在同一 Local 串行复核的改动，提交前仍需重新读取 status / diff、精确确认范围并由唯一 Git owner 收口。

## 2026-07-24 权限中心关联账号核对

完成：岗位详情新增第 5 个“关联账号（数量）”Tab，按现有 `admin.list` 与账号岗位关系只读展示账号、三态状态和兼任岗位，启用账号优先排列；无员工账号查看权限时明确提示未知，不把未加载数据冒充零账号。账号分配、停用、重置和注销仍只在外层“员工账号”办理；从岗位详情进入时预填当前岗位搜索并回到第一页，没有新增后端接口、权限码、账号真源或第二套管理动作，也不根据账号名前缀猜测 Demo 身份。

验证：Web 全集 `1792 / 1792`、ESLint、Stylelint、权限页静态合同 `63 / 63`、文档清单 / 试用账号 / 岗位手册合同 `13 / 13` 和目标差异检查通过。Node `24.14.0` 下真实 Chromium `permission-center-desktop,permission-center-navigation-mobile-dark` 各 `1 / 1` 通过，覆盖财务岗位关联账号数量、只读状态与兼任岗位、跳转后岗位搜索、桌面布局、390px 暗色布局和无页面级横向溢出；桌面与手机截图已人工检查。未改 RBAC、客户配置、Workflow / Fact、schema 或 migration，未保存真实岗位设置、未提交、未推送、未部署，也未执行目标账号实登或甲方 UAT。

## 2026-07-24 权限中心审批责任与多角色完整性

完成：审批责任已收进“权限管理”的第三个外层 Tab，与“岗位设置 / 员工账号”共用同一岗位和账号真源；删除独立审批设置路由与菜单，不再让管理员在两个页面间来回核对。页面只展示已有正式 ProcessRuntime 与领域命令闭环的销售订单、采购订单和出货财务放行，可维护启停、主办、备用、升级及岗位 / 具名员工；说明改为问号 Popover，停用事项使用紧凑的“不参与流程”状态。审批项现在显式区分“未配置、已启用、已停用”：active revision 缺少审批设置时显示“待初始化 / 待设置”并生成可编辑的推荐责任草稿，不再误报为“停用 / 不参与流程”；推荐草稿必须经过检查、发布和激活才正式生效，明确保存为关闭的事项仍保持停用。预览、发布、显式启用和 active revision / content hash CAS 仍保持分离，普通管理员不能借责任设置给自己或自己的业务岗位新增办理资格，系统 / 调试岗位继续受保护。

多角色完整性：启用员工会按其全部真实岗位进入对应候选，多岗位员工可分别在销售、采购、财务等真实岗位下被选择；具名成员必须处于启用状态并继续持有所选岗位，同一责任成员不能在同一事项的多个层级重复。运行时只开放最低可用优先级：主办可用时备用与升级不可见、不可办理，主办失效后才交给备用，主办与备用均失效后才交给升级；唯一具名候选会冻结具体 assignee。员工停用或注销会释放其未结束具名待办，但任务继续绑定原流程 revision，并按该冻结 revision 重新解析下一可用层级，不会被后来激活的新配置改写。

本地运行态：2026-07-24 在 `ERP_CUSTOMER_KEY=yoyoosun`、HTTP `8300` 健康、数据库 safe target 为 `192.168.0.106:5432/plush_erp_simon_dev` 的个人开发后端，通过权限中心使用正式 `preview_approval_settings -> publish_approval_settings -> check_customer_config_transition -> activate_customer_config -> get_approval_settings` 链路发布并激活推荐责任。读回 active revision 为 `yoyoosun-customer-package-v7.local-2d67add376fa18b4.runtime-v1.a`；销售订单为业务主办、老板升级，采购订单为采购主办、老板升级，出货财务放行为财务主办、老板升级，三项均显示“已生效 / 启用 / 可办理”。本次只改变本地客户配置 revision，不直接改数据库表，不改 Workflow / Fact，也不改已在途流程的冻结责任。

边界：RBAC `workflow.task.approve` 只表达审批资格上限，实际列表、岗位视图与办理动作同时校验任务冻结 revision 的 entitlement、精确责任池 / 岗位或具名成员、账号状态、最低可用层级、owner / assignee、任务状态 / version、幂等键与审计。Workflow task done 仍不直接写 Fact，销售、采购和 Shipment 继续由各自唯一领域命令落地。客户退货和生产异常虽有领域审批但尚未进入配置化 ProcessRuntime；库存调整、PAYMENT、PMC / 工程审批缺正式 Source Document 或门禁，继续失败关闭。

验证：官方 `bash scripts/qa/affected.sh --run` 覆盖 T0、T1、T3、T4、T5、T6、T7；文档合同 `12 / 12`、直接 Node 合同 `41 / 41`、Web 全集 `1798 / 1798`、隔离 PostgreSQL 关键事务与并发 `192 / 192` 均为零失败、零跳过，服务端全包及 domain / API / data、客户配置合同、ESLint、Stylelint 和差异检查通过。随后使用项目要求的 Node `24.14.0` 复跑 Web `1798 / 1798` 和生产构建；真实 Chromium `permission-center-approval-unconfigured,permission-center-approval-responsibility` `2 / 2` 通过，分别覆盖未配置推荐草稿与明确停用状态。本轮未改 Ent schema、未生成 migration；只重建并迁移项目登记的隔离事务测试库，没有对共享、133 或生产数据库 apply migration。

风险：上述配置只在本地开发后端发布、激活和管理员读回，尚未向 133 / 生产目标环境发布；未执行销售 / 采购 / 财务 / 老板真实账号审批办理 smoke、客户 UAT、部署、提交或推送。WorkPoolMembership 当前只有启停，没有独立的时间到期字段，本轮不为尚无正式合同的“成员有效期”新增 schema。

## 2026-07-23 任务流程起点、当前位置与终点

完成：新增 task-scoped `get_task_process_context` 只读合同。服务端先按当前账号的任务可见范围取得任务，再校验任务、来源单据、流程实例和节点锚点一致，才返回来源单据、流程状态、起点、当前节点、已完成节点和终点；不向前端暴露内部 definition hash 或策略。桌面任务抽屉和移动岗位任务详情统一展示这组正式运行态，加载失败或合同不完整时 fail closed，不由前端根据任务名称猜流程位置。

试用数据：现有 180 条长列表任务继续明确标记为 `simulated_display_only`，只证明列表、筛选和交互容量，不证明已创建 ProcessRuntime。另从同一批次 5 张模拟销售订单经正式客户配置入口创建流程运行证据，覆盖仅启动、审批就绪、已阻塞、已驳回和已完成五种状态；数据集整体仍为 `simulatedOnly: true`，不得描述为真实客户订单、客户验收或领域事实完成。

清理边界：当前业务来源取消不等于 ProcessRuntime 取消；存在 active / blocked 的正式流程证据时，`manual-acceptance-source-retire` 不伪造通用流程撤销。需要完全清理时重建专用本地验收库；133 固定库按受控数据库重建 / 恢复流程处理。

验证：Node `24.14.0` 下 `affected.sh --run` 覆盖 T0、T1、T3、T4、T5、T7；受影响脚本合同 `152 / 152`、Web 全集 `1780 / 1780`、隔离 PostgreSQL 关键事务与并发 `192 / 192` 均为零失败、零跳过，前端 lint、文档合同和 `git diff --check` 通过。真实 Chromium `erp-task-board-desktop,mobile-yoyo-role-task-projection` 为 `2 / 2`，覆盖桌面与移动端流程位置回显。

边界：本轮只把独立 Worktree 中仍适配当前主线的改动选择性带回 Local；销售提交失败修复已存在于当前主线，没有重复覆盖。未提交、未推送、未部署，未对共享、133 或生产数据库写入 / apply migration，也未执行真实岗位 UAT；Local 中其他任务的门禁提速和页面操作权限改动继续保留，归属不变。

## 2026-07-23 开发阶段 pre-push 门禁提速

完成：开发内循环统一使用 `affected`、定向测试和 `fast`；最终代码形成 clean HEAD 后由 `prepare-push.sh` 在建立 receive-pack 连接前读取真实 remote/ref、计算 aggregate range，并完整执行一次 `full.sh`。pre-push hook 不再在已打开的 SSH 连接上重复等待 full，只消费真实 push stdin，复核短期回执并实时执行每个 range 的 `git log --check` 与严格 secrets，消除了“手动 full 后 hook 再 full”和长时间空闲 SSH 连接这两条结构性重复路径。

门禁边界：本地回执绑定 worktree、HEAD/tree、每个 local/remote ref 与 SHA、aggregate range、full profile/gate contract、关键工具/依赖环境和 30 分钟 TTL；保存在 Git common dir，按 worktree 隔离，使用私有 HMAC key、目录并发锁、同目录临时文件、fsync 和原子 rename。full 失败、HEAD/tree/worktree/环境/远端任一前后漂移都先删除旧回执且不签发新回执；只有 owner PID 已确认不存在的脚本残留锁可被安全回收，其余锁状态继续 fail closed。hook 命中时仍重算真实范围并再次核对 clean HEAD、签名、profile、gate/environment/TTL；缺失、篡改、过期、代码/依赖/migration/测试/门禁/环境或远端变化均 fail closed。`SKIP_PRE_PUSH`、调用者注入 range、回执路径/token/TTL 和其他 skip 环境不再是常规接口；CI strict 永不读取本地回执。

验证：hook 与回执的临时 Git 仓库 / bare remote 测试 `16 / 16` 通过，覆盖 full 只执行一次、真实 `git push` 启动环境、真实多 ref/new ref 范围、失败无残留、签名/TTL/环境/远端/HEAD/dirty/锁漂移与确认死亡 owner 的残留锁恢复、实时 log/secrets 失败、删除语义、调用者伪造输入、detached HEAD、help 无副作用和 Git common dir 符号链接逃逸；affected、gate profile、gate orchestration 治理测试 `42 / 42` 通过。skill health、文档清单 `3 / 3`、full required-files 合同、ShellCheck、shfmt、`git diff --check` 与严格 secrets 通过，均为零失败、零跳过。

继续复测：Local 静止后修正了 4 组与当前正式合同不一致的旧治理断言：无权限动作应隐藏而不是永久置灰、模拟展示任务不得冒充 ProcessRuntime、销售流程验收数据必须同时声明 `workflow_tasks / sales_orders` 隔离模块，以及新增任务流程位置读取必须复用任务可见范围。scripts Node `1334 / 1334`、Web `1780 / 1780`、server quick `2763 / 2763`、server all `2923 / 2923` 均为零失败、零跳过；Web production build、存量 PostgreSQL 升级、隔离关键 PostgreSQL 矩阵、服务端构建、严格 secrets 和严格 `govulncheck` 通过。完整 Chromium Style L1 `177 / 177` 通过；其中权限中心手机暗色场景曾出现一次不可稳定复现的分类状态失败，随后定向 `4 / 4` 和完整套件均通过，保留为后续观察项。

真实 Git hook runner 复核：首次真实 push 在 4.94 秒内 fail closed，原因是 Git 会在 hook 子进程的 `PATH` 首部自动注入 `git --exec-path`，而准备阶段没有该前缀，导致同一工具环境被误判为漂移。环境合同升级为 v2，只归一化这一个 Git 自身注入的首部路径；其他 `PATH` 变化、工具版本、依赖元数据和关键环境仍会使回执失效。新增临时 bare remote 上的真实 `git push` 集成测试，防止仅用直接执行 hook 的测试再次漏掉 Git 启动上下文。

收口边界：最终提交后必须由 `prepare-push.sh` 对新的 clean HEAD 从头完成唯一一次 full，再立即走未绕过的真实 push；提交、推送和远端同步状态只以本轮最终 Git 回读为准。未部署，也不对共享、133 或生产数据库 apply migration；任何代码、环境或远端范围变化都必须重新准备。

## 2026-07-23 页面入口与读取权限一致性治理

完成：修复“菜单可见但页面首批请求权限不足”的主路径。生产进度入口、客户页面目录和页面读合同统一为 `production.fact.read`；未授权直达路由在子页面挂载前即返回可进入页面，不再先发请求后连续弹出“权限不足”。生产异常按复合页拆分权限：品质可进入协同任务页，但没有生产风险 / Fact / 异常办理权限时不加载生产异常决定面板；服务端异常决定读取保持最小权限，不因 `quality.inspection.read` 放宽生产事实读取。

完成：生产订单详情把只读快照与编辑引用候选分开。仅有 WIP 读取权限的岗位查看详情时不再请求产品、销售订单或 BOM 候选；草稿保留了当前岗位不可读取的销售 / BOM 来源时自动降级为只读，避免编辑和保存阶段再触发 403。产品档案、供应商档案和库存台账的可选页签 / 引用字典也改为按精确权限加载，不再由一个无权的辅助字典请求拖垮整页。

补充收口：生产排程入口改为同时要求计划读取与协同任务读取；出货放行入口改为“出货业务权限任一 + 协同任务读取”；生产异常删除无法支撑页面首读的 `quality.inspection.read` 假入口，并把 `workflow.task.read` 纳入真实任务列表入口。客户目录、后端菜单和页面 RPC 使用面同步更新，新增合同会阻断“菜单条件存在但页面没有对应首读”或“页面首读没有菜单入口”的再次漂移。

预防：新增后端“主页面首读权限必须守住菜单入口”合同、客户页面目录合同、页面静态权限合同，以及 7 个网络计数 Chromium 场景，覆盖未授权直达零业务 RPC、WIP 只读详情零引用 RPC、不可读来源降级、生产异常可选面板跳过、供应商跳过工序字典、库存跳过主数据字典和 SKU-only 产品页。`affected.sh --run` 最终覆盖 T0-T7：Web `1763 / 1763`、客户 / 页面合同、服务端全包、ESLint、Stylelint、隔离 PostgreSQL migration 和关键事务 / 并发 `192 / 192` 均通过；定向 Chromium `7 / 7` 通过，Vite build 与 `git diff --check` 通过。

风险：本轮没有 schema 变更，也未发布客户配置、部署或对目标账号执行真实登录 smoke / UAT；本地浏览器证据使用受控 mock 网络，只证明页面不会发送当前岗位无权的请求。客户环境需在发布后回读 active revision、`me / effective_session`、菜单与首批 RPC；现有岗位若本就缺少页面主读取权限，将不再看到 / 进入该页，而不是通过前端绕过后端 RBAC。

## 2026-07-23 销售订单提交审批任务恢复

完成：修复生产 Wire 未向 `ProcessRuntimeUsecase` 注入客户配置岗位解析器的问题。`CustomerConfigUsecase` 现在以 `ProcessRuntimeOwnerRoleResolver` 接入生成后的服务组装，人工 / 审批节点会按流程冻结的配置版本解析唯一责任岗位并创建关联任务；岗位缺失或候选不唯一时，流程启动与任务推进入口都返回业务人员可行动的中文提示，不再统一落入“请稍后重试”。未新增 schema、migration、RBAC、前端补造任务或运行时 fallback。

完成：销售订单前端把 fresh start 与已完成首节点的恢复重放分开处理。fresh 路径仍执行 `start -> execute`；若 start 已通过持久结果对账完成首领域节点并补齐下游任务，前端直接采用重放结果，不再拿完成后的版本重复执行领域命令。blocked、compensated、来源不符、节点列表缺失或 success 结构不可信均 fail closed。

运行态恢复：本机项目安全重启前的 preflight 确认开发库 migration 为 `20260723155358`、`95 / 95`；重启后 `/healthz` 与 `/readyz` 通过。对 `SIM-YOYOOSUN-UAT-20260715-V2-SO-036` 使用正式销售入口重放同一幂等键后，原流程实例 `2` 保持 active，首节点 `6` 保持 `completed / sales_order.submitted / version 3`，老板审批节点 `7` 为 active，并唯一生成 `PROC-2-NODE-7-A1`（task `585`、boss、ready）。销售岗位真实页面读回订单为“已提交”且无失败提示；老板岗位端真实页面读回该订单的 `order_approval` 为“可执行”。本次没有重复销售订单、流程实例或领域命令。

验证：Sol Medium Worktree 的 `affected --run` 覆盖 T0 / T1 / T3 / T4 / T5 / T7，Go / Web / 服务合同、隔离 PostgreSQL 关键事务 `192 / 192`、前端重放 `12 / 12` 与定向 Chromium 场景通过；隔离库已删除。选择性带回当前 Local 后重新执行 Wire 生成、Go `internal/biz + internal/service + internal/server`、`cmd/server` 编译、前端重放 `12 / 12`、相关 ESLint 与 `git diff --check`，均通过；同时修正了 Local 已新增采购审批 import 与旧 Worktree 动态测试装载器之间的组合差异。未执行 `full.sh`、`strict.sh`、133 / 生产发布或客户 UAT。

## 2026-07-23 任务受控转交

完成：新增独立 `workflow.task.assign` 能力和 `get_task_assignment_options / reassign_task` 合同。当前默认只授予老板；super admin 可通过全权限执行转交，但不会因此自动成为老板、仓库、财务等业务岗位或接收候选人，PMC 继续只读监督，普通 admin 默认没有转交权限。只允许调整 `ready / blocked` 任务，必须填写原因，可转给同一负责岗位的合格 active 人员或暂不指定个人并退回该岗位共同待办。

边界：接收人必须直接持有任务 `owner_role_key`，并在任务冻结 revision 中具备读取、更新和完成 / 审批能力。repo 在事务内锁定并重验任务、账号、岗位关联和负责岗位自身的权限，不把接收人的其他岗位权限拼接成资格；再以 version、状态和原处理人做 CAS。成功只更新 `assignee_id / updated_by / version`，原子写转交事件、`workflow.task-assignment/v1` receipt 与运行审计。任务状态、负责岗位、责任池、payload、ProcessRuntime 锚点和任何库存、出货、质检、财务事实均不改变。

前端：桌面任务看板新增明确的“转交任务”入口、合格接收人 / 退回岗位共同待办选择、必填原因、边界确认和任务级重复提交保护；退回选项按任务负责岗位动态显示“负责岗位：工程 / 仓库 / 财务……”等名称，不写死工程。候选人完全消费后端返回，不由前端拼造。Style L1 mock 同步覆盖 super admin 操作人不因管理身份进入候选、停用 / 缺权限人员被排除、精确 receipt 重放、转交与退回，以及状态和 payload 不变。

恢复态：候选接口返回的任务版本与当前抽屉不一致时，前端明确进入“任务信息已更新”状态，停止 loading、不展示旧候选，也不允许提交旧快照；用户刷新任务列表后才能重新发起转交。该状态与正常空候选、请求失败分别呈现，避免版本漂移被误报为无限加载或继续提交。

验证：`make data` 确认 Ent 目标与 Atlas migration 目录同步且无新增 schema migration，`db-guard` 通过；`affected.sh --run` 从 T0 跑到 T7 并最终完成，文档 `12 / 12`、直接客户配置 / 转交合同 `66 / 66`、Web `1747 / 1747`、隔离 PostgreSQL 关键事务 / 并发 `192 / 192` 均为零失败、零跳过，服务端 data / domain / API、ESLint、Stylelint、客户包边界和 `git diff --check` 通过。真实 Chromium `erp-task-board-desktop,erp-task-board-mobile` 为 `2 / 2`，覆盖完整转交和窄屏无横向溢出；最终截图已人工检查。

风险：新增 migration `20260723155358_reconcile_permission_assignment_boundaries.sql` 只进入代码并应用到受影响门禁创建的隔离测试库，未对共享、133 或生产库 apply；永绅 active revision 未发布 / 激活 / readback，未执行真实账号 UAT 或部署。窄屏浏览器场景验证的是桌面任务看板响应式布局，专用 `/m/<role>/tasks` 岗位任务端尚未接入转交。浏览器使用本机 Node `26.5.0`，仓库声明 `24.14.x`。

## 2026-07-23 审批产品层与领域门禁 Handoff

完成：所有 ProcessRuntime approval 节点统一声明 `workflow.task.approve`；销售订单审批后由唯一领域命令原子激活，采购批准由 `PurchaseOrderUsecase` 唯一承接，出货财务审批写入 Shipment 版本化门禁。桌面审批箱、Workflow、协同 Drawer 和移动岗位端共用来源、意见、状态、版本与轨迹合同；WIP 异常继续走现有生产异常真源，PAYMENT 不伪造审批完成。

Handoff：Codex Worktree 的 86 个文件已带回 Local，并形成审批提交；整合到最新 `main` 时保留异常流、岗位导航和精简文档真源，同时吸收审批领域事实。已删除的 `产品能力证据详情.md` 不恢复，新增事实进入唯一产品能力台账。

Worktree 验证：`go test -count=1 ./...`、前端 `1728 / 1728`、ESLint、Vite build、`make data`、`db-guard`、`agents-size`、`git diff --check` 和真实 Chromium 审批箱场景均通过。该证据只绑定 Worktree 固定树。

Local 合并树验证：`make data` 确认 Ent 与 Atlas 无新增漂移，`affected.sh --run` 覆盖 T0-T7；文档 `12 / 12`、审批 / 浏览器 mock 定向 `38 / 38`、Web `1729 / 1729`、客户配置与私有部署边界 `76 / 76`、隔离 PostgreSQL 关键事务 `192 / 192` 均为零失败、零跳过，ESLint、`db-guard` 和 `git diff --check` 通过。真实 Chromium `erp-task-board-desktop` 场景 `1 / 1` 通过，覆盖待我审批入口、出货财务审批详情和返回任务看板。首轮合并树验证发现并修正已退役直连销售提交白名单、旧审批自动派生断言和 PostgreSQL fixture 全局岗位串数，随后从头复跑绿色。

验收合同收口：首轮 `full.sh` 继续发现并修正 4 项合并树旧合同：PostgreSQL 关键测试旧名称、本地验收 manifest 旧内容地址、销售造数仍直连已退出的公开出货放行方法，以及样式回归仍模拟旧仓库放行 producer。销售造数现按“出货前质检 → 财务审批 → Shipment 财务放行门禁 → 确认出货 → 应收草稿”逐节点调用正式 API，并按 quality、finance、warehouse 岗位路由；行业模板与浏览器 mock 同步使用 `finished_goods_delivery` active revision。完整 Node 合同 `1321 / 1321`、现行出货流程 Chromium 场景 `1 / 1`、前端 lint 与 `git diff --check` 通过，均为零失败、零跳过。

最终门禁：在代码提交 `25ad3e19` 的干净树从头执行 `bash scripts/qa/full.sh`，scripts Node `1321 / 1321`、server all `2864 / 2864` 均为零失败、零跳过；Web 合同与全集、ESLint / Stylelint、前后端构建、隔离 PostgreSQL populated upgrade 与关键事务、真实 Chromium smoke、密钥扫描和 Go 漏洞扫描全部通过，最终输出 `full status=complete`。

风险：仅对登记的本地隔离事务测试库应用 latest migration；未对共享、133 或生产数据库 apply，未部署，未执行真实九岗位账号 smoke 或客户 UAT。Worktree 与 Local 浏览器验证使用 Node `26.5.0`，仓库声明 `24.14.x`。

## 2026-07-23 权限中心菜单结果治理

完成：权限中心“可用功能”已收口为权限行结果。每条权限同行区分“菜单入口 / 页内操作”：菜单入口直接显示页面是否出现及“看板中心 / 常用工作 / 更多功能”位置，页内操作直接显示所需入口且不冒充菜单位置，不再在每个业务分组顶部重复展示整组菜单结果卡。页面入口继续由后端菜单 `required_any / required_all` 合同决定；主办理页面明确且入口唯一时自动补齐该入口，但不连带开启其他关联页面。关闭单一入口时取消仅在该页使用的操作，跨页面操作不自动删除。本地即时草稿与后端确认草稿使用同一组稳定文案和标签尺寸，不再出现“预计显示 → 草稿会显示”的闪烁。

完成：`admin.effective_role_access` 支持用严格校验的 `permission_keys` 解释未保存业务岗位草稿，复用 RBAC、active revision、模块和岗位页面投影，不落库、不改角色版本、不写审计，并以 `is_preview` 明确标记。系统岗位、未知权限和不可委派权限继续拒绝；前端请求使用短延迟与最新请求守卫，草稿失败时只显示本地岗位权限结果，不冒充公司最终结果。

补充治理：权限模块岗位名称已收口到后端注册表，`rbac_options` 同时返回稳定 module key 和业务 `module_name`；BOM、客户退货、生产执行、敏感字段等不再分别显示为“其他功能”，未知分类只合并为一个“未分类功能”。模块名覆盖测试会阻断新增内置权限漏分类。`process_runtime.recover` 已从误标的可委派业务权限修正为控制面权限，不再出现在业务岗位勾选清单。

控制面边界：客户 entitlement 收窄改为读取权限注册表 class，只对业务权限生效；`system`、`customer_config`、`process_runtime` 和 `debug` 类不再因客户业务包缺项被误删，未知权限仍 fail closed。新增 migration 同时清理历史非系统岗位对 `process_runtime.recover` 的绑定并提升受影响岗位版本，避免旧数据绕过新的不可委派边界。完整门禁首轮发现历史升级读回仍锁定旧岗位版本；现已把 system、business-default、custom 三类历史绑定纳入隔离 PostgreSQL fixture，验证 system 保留、非 system 清理、任务转交只授予老板，并确保同一 migration 内每个受影响岗位只提升一次版本。定向 populated-upgrade 门禁完成且 pending / out-of-order 均为 0；当前 migration 未对共享、133 或生产库 apply。

补充易用性：权限中心“可用功能”已删除低频功能搜索。桌面改为吸顶业务分类导航并显示已选 / 总数，支持鼠标和键盘直达；手机改为“跳到功能分类”下拉；“只看已选”继续用于复核。分类导航只定位当前页面，不改勾选、RBAC、客户页面投影或常用 / 更多结果。真实浏览器首轮发现并修正桌面目标标题被吸顶导航遮挡约 7px，以及手机跳转后当前分类被上一分组覆盖的问题。

样式补充：权限页删除重复的岗位说明、四块统计、已分配账号和重点功能卡，把岗位名称、功能数、账号数、帮助、保存状态与主按钮压缩到同一头部；分类导航使用独立浅绿 / 深色底、细品牌标记和轻投影，吸顶语义明确但不抢占内容。说明改为问号 hover / focus / click 浮层；桌面权限组保持双栏，手机岗位列表横向滚动、权限组单栏。分类按钮、勾选结果和权限真源均未改变。

验证：`affected.sh --run` 覆盖 T0-T5，文档 `12 / 12`、Web `1739 / 1739`、领域 / data / service / server 包、ESLint 和 Stylelint 均通过；Node `24.14.0` 下真实 Chromium `2 / 2` 覆盖财务旧无效组合提示、勾选“确认应收”自动补齐“查看应收”、应收进入财务常用工作、桌面布局、手机暗色单列和无横向溢出；在草稿接口人为延迟 `900ms` 时，等待态与回读态均不出现“预计显示”，状态标签宽高无漂移，前后截图已人工检查。该证据只属于本地 mock / 浏览器运行态；未保存岗位设置、未部署、未执行目标账号实登或甲方 UAT。

补充验证：权限模块分类治理后重新执行 `affected.sh --run`，T0-T5、文档 `12 / 12`、Web `1739 / 1739`、领域 / data / service / server、ESLint 和 Stylelint 均通过；真实 Chromium 权限中心桌面与手机暗色场景 `2 / 2` 通过，覆盖四个原“其他功能”分类、控制面权限隐藏及原有应收菜单联动。浏览器验证使用本机 Node `26.5.0`，仓库声明 `24.14.x`；未部署、未保存真实岗位配置、未执行目标账号实登或甲方 UAT。

本次简化验证：Web 全集 `1791 / 1791`、ESLint、Stylelint、权限页静态文案合同 `62 / 62`、真实 Chromium `permission-center-desktop,permission-center-navigation-mobile-dark` `2 / 2` 均通过；桌面场景使用与选稿一致的 `1486 × 1058` 视口，覆盖帮助浮层、分类键盘直达、应收入口自动补齐、菜单 / 操作行分离、常用工作位置、状态标签零抖动、未保存切换保护和导航保存，手机暗色场景覆盖单栏与无横向溢出。并排 Design QA 结果为 `passed`。浏览器使用本机 Node `26.5.0`，仓库声明 `24.14.x`；本轮未改后端、RBAC、客户配置、schema 或 migration，未保存真实岗位配置、未提交、未推送、未部署，也未执行目标账号实登或甲方 UAT。

分类导航验证：真实 Chromium 权限中心桌面与手机暗色场景 `2 / 2` 通过，覆盖低频搜索已移除、桌面分类按钮键盘直达、“只看已选”同步收窄目录、手机分类下拉显示当前分组，以及吸顶导航不遮挡目标标题；两张回归截图已人工检查。该证据仅证明本地 mock / 浏览器交互，未改权限判定或岗位菜单结果，也不替代目标账号实登、部署和甲方 UAT；验证使用本机 Node `26.5.0`，仓库声明 `24.14.x`。

样式补充验证：Web `1740 / 1740`、ESLint、Stylelint、脚本语法和 `git diff --check` 通过；真实 Chromium 桌面与手机暗色场景 `2 / 2` 重新通过，并新增导航渐变底、下投影和顶部识别线的 computed-style 守卫，截图已人工确认导航与普通内容卡片层级可辨。

## 2026-07-23 异常流 V1 四项收口与 Local Handoff

完成：首次 IQC 拒绝改为按精确来源行和部分数量累计办理退厂或供应商补换；补换确认生成新的 DRAFT 收货、单行待收、零余额 HOLD 批次和 SUBMITTED IQC，原收货不整单取消。创建、确认和取消使用幂等 intent、version CAS、来源锁与事务边界，已过账或已有下游的补换链 fail closed。

完成：委外不合格返厂 / 返工补齐正式品质页和列表读回；返厂以库存 OUT / REVERSAL 为事实真源，返工持久化结果 WIP 并只在无活动下游时允许取消。生产报废、WIP 让步与超领保持“审批决定不等于事实执行”：报废 / 让步由独立执行和冲正动作落 Fact / WIP，超领额度由正式生产领料事务消费。

完成：财务 CreditNote 在 repo 事务内只接受应收 / 应付来源，发票、付款、核对及其他类型均拒绝；反向红冲支持 exact replay，正式收付款页对 408 / 5xx / 非法 success 通过详情与列表读回。正式真源、客户交付矩阵、流程图、岗位帮助和合同测试已同步；Product Core 本地能力没有写成永绅已授权、133 已发布或客户已 UAT。

Handoff：Codex App 自动 Handoff 因 Local dirty 在 checkout-local-branch 前安全停止，未覆盖 Local。确认 Local 无活动 writer 后，手工转入 69 个可 clean apply 的 tracked 变更和 4 个新增文件，再对 11 个同路径文件做三方语义合并；68 个无重叠 tracked 文件与 4 个新增文件逐字核对无差异。Local 主动删除的 `产品能力证据详情.md` 与 `流程编排运行时完成度台账.md` 保持删除，其新增事实已迁入唯一产品能力台账和现有流程文档。

Worktree 验证：冻结树已从头完成 `full.sh` 与 `strict.sh`；scripts Node `1318 / 1318`、Web contract `209 / 209`、Web all `1729 / 1729`、server all `2879 / 2879`、隔离 PostgreSQL `192 / 192`，均为零失败、零跳过，最终输出 `full status=complete` 与 `strict status=complete`。这只证明 Worktree 固定树，不替代 Local 合并树验证。

Local 验证：角色 / 流程与生产路线文档合同 `15 / 15`、异常相关 Web 定向 `36 / 36`、文档 / 客户 / 生产合同 `46 / 46` 通过；`go test ./internal/biz ./internal/data ./internal/service -count=1` 三包通过，`db-guard` 与 `git diff --check` 通过。最终从头执行 `bash scripts/qa/full.sh`，其中 server quick `2719 / 2719`、server all `2879 / 2879` 均为零失败、零跳过，构建、隔离 PostgreSQL、真实 Chromium smoke 与 Go 漏洞扫描依次完成，最终输出 `full status=complete`。首轮文档合同发现并修正 1 条仍锁定“整单取消”的旧断言后已从头复跑绿色。

Git 收口：用户授权提交推送所有 Local 代码后，单一 owner 将 164 个文件收口为功能 / 文档主提交 `6a458cf2` 并推送到 `origin/main`。pre-commit 的暂存 migration、密钥、Go vet 与 lint 门禁通过；pre-push 对同一提交从头完成 `full.sh`，最终为 `status=complete`。发布前仍须绑定最终 commit / image，完成目标 migration、health / ready、真实岗位 smoke、回滚点与客户 UAT。

风险：本轮未部署 133、未执行客户 UAT，也未对共享 / 133 / 生产数据库应用 migration。Worktree 保留为恢复副本；Local 的本地绿色和历史固定目标证据均不代表当前版本已上线。

## 2026-07-23 九岗位易用性与流程帮助

完成：永绅侧栏统一为“看板中心 → 常用工作 → 更多功能”，岗位帮助固定放更多；财务系统推荐常用已调整为应付、应收、发票、对账。“更多功能”保持受控恢复态：首次与返回看板 / 常用页时折叠，进入或刷新更多页时展开。老板即使优先项全是看板也会补足 3 个常用业务；有电脑端菜单的岗位可从手机顶部或“我的”直接进入电脑端。入口按菜单投影判断，不按账号名硬编码。权限中心新增岗位级“系统推荐 / 自定义常用”：管理员可从最终可进入页面中选择并排序 1–5 个入口；布局随角色 version 持久化并写 `role.navigation.set` 审计，但不增加 RBAC、客户页面投影或页面内操作权限。

验证：本轮后端 `go test -count=1 ./internal/biz ./internal/data ./internal/service` 通过，覆盖角色版本冲突、自岗位保护、非法路径、事务审计与审计失败回滚；Web 全集 `1733 / 1733`、ESLint、Stylelint 与定向文档 `12 / 12` 通过。真实 Chromium `4 / 4` 覆盖财务系统推荐、财务自定义顺序、权限中心桌面保存与手机暗色布局；截图已人工检查。Ent / Atlas 已生成 `20260723044307` migration，未对共享、133 或生产库 apply。未发布、未执行目标账号 UAT；本机浏览器和 Web 测试使用 Node `26.5.0`，仓库声明 `24.14.x`。

## 2026-07-23 产品能力台账收敛

完成：四份全局能力文档和两份 yoyoosun 客户状态文档已收敛为产品、客户两份真源，四份冗余文档已删除。开发态能力页改为两张真源入口卡，只导航，不再解析或统计台账；三视图、成熟度指标、筛选、详情和内嵌摘要已删除，导航、配置来源与项目 skill 已同步。

验证：文档收敛阶段 affected 曾通过 `12 / 12`、`42 / 42`、Web `1734 / 1734` 与客户边界 `76 / 76`；页面改造后 Web `1726 / 1726`、定向 `45 / 45`、Chromium `4 / 4`、CSS、lint、skill health 和 diff 通过。当前异常收口 Handoff 没有恢复已删除台账，新增事实已迁入唯一产品能力台账。

## 2026-07-23 永绅甲方确认表复审修正

完成：甲方确认表把岗位职责、审批 / 办理节点、业务目标、产品基础能力、永绅配置、目标环境、用户验收和交付范围分轴记录；首次 IQC 处置、补换新到货、FinanceFact / Payment / Allocation / CreditNote 与固定版本证据分层，不让甲方替乙方实现、配置、发布或 UAT 背书。

验证：原复审阶段 affected 文档与角色合同 `12 / 12`、WIP / 角色 / 原型合同 `35 / 35`、客户配置与私有部署边界 `76 / 76` 通过。本次 Handoff 又按新“精确行部分处置 + 新待收待检链 + CreditNote 来源守卫”语义更新确认表和自动化合同，角色 / 流程文档合同 `15 / 15` 通过。

下一步：会前在受控工作副本填入客户交付矩阵状态日期、目标环境证据编号和 R / A 卡预填内容；面谈后按 D / Q 分流到决策、问题，并把批准差异写入客户交付矩阵。未发布、未 UAT、未接银行直连 / 总账 / 税控，不能外推为完整财务或客户交付闭环。

## 2026-07-23 销售订单计划交付日期表头不换行

完成：销售订单列表“计划交付日期”列宽由 120px 调整为 150px，为列设置按钮和排序图标保留空间，避免中文表头末字换到第二行；字段、排序、导出和窄屏横向滚动语义不变。未修改共享表头换行规则，避免影响长标题列。

验证：销售订单页面定向合同 `5 / 5` 与 `git diff --check` 通过；真实 Chromium 在桌面和 `800px` 窄屏下确认表头文字高度均为单行 `18.9px`、列宽约 `155.2px`，与右侧状态列无重叠。窄屏表格保留 `1560px / 742px` 横向滚动边界，两张定向截图已人工检查。

## 2026-07-23 工作台任务状态与时间风险并列展示

完成：工作台“状态 / 风险”列不再用逾期覆盖任务主状态。每条任务固定显示一个主状态，并在存在时追加一个时间风险；因此阻塞且逾期显示“阻塞 + 逾期”，可执行且即将到期显示“可执行 + 即将到期”，终态任务不产生到期风险标签。该改动只消费现有 `task_status_key / due_at`，未改 Workflow、RBAC、API、schema、客户配置或 Fact 边界。

验证：Node `24.14.0` 下 Web 全集 `1749 / 1749`、ESLint、Stylelint、定向状态组合 `22 / 22` 和 `git diff --check` 通过；真实 Chromium 工作台场景 `1 / 1` 构造“阻塞且逾期”任务，桌面、`390px` 窄屏与暗色均同时显示两枚标签，DOM 宽度与页面横向溢出守卫通过，三张截图已人工检查。未部署、未执行目标账号实登或甲方 UAT。

## 2026-07-23 暗夜主题 Tag 语义色恢复

完成：删除暗夜主题对全部 Ant Design Tag 的灰蓝色总覆盖，让现有 `darkAlgorithm` 统一负责无色与 `blue / green / red / purple / gold / cyan / orange / geekblue / volcano` 等语义色。全局盘点确认 46 个前端文件共 217 处 Tag，其中 149 处显式颜色均通过这一共享主题路径恢复，无需逐页面加样式。Style L1 新增 computed-style 守卫：同屏不同语义 tone 的文字、背景和边框不得被渲染成同一组颜色，并继续检查暗色对比度。

验证：Web 全集 `1749 / 1749`、ESLint、Stylelint、脚本语法和 `git diff --check` 通过；真实 Chromium 入库管理暗夜场景 `1 / 1` 显示草稿、已过账、已取消三种可区分颜色，权限中心暗夜场景 `1 / 1` 验证蓝、绿等多色 Tag，截图已人工检查。`mobile-tasks-dark` 在到达 Tag 门禁前被共享现场已有的“切换工作入口”按钮缺失断言阻断，该失败与主题样式无关；本轮未修改移动导航、业务状态映射、Workflow / Fact、RBAC、API 或 schema。测试使用本机 Node `26.5.0`，仓库声明 `24.14.x`；未部署、未执行目标账号实登或甲方 UAT。

## 2026-07-24 全站选择记录动作稳定性治理

完成：正式业务列表页统一采用四类动作可用性合同：无权限、客户配置未开放或产品无能力时隐藏；有权限但未选择、临时前置条件不足或请求处理中时置灰并提供可聚焦原因；动作已完成、记录处于终态或当前来源结构不适用时隐藏并由状态表达结果；“更多操作”没有实际可用项时隐藏。`SelectionActionBar` 的桌面顺序、平板 / 手机固定优先级、更多操作 Drawer、键盘可聚焦禁用原因、生命周期主槽和更多操作槽已收敛到共享实现；不再出现没有原因的灰色按钮，也不再用只读权限显示写动作名称。

覆盖：扫描并治理主数据、BOM、销售订单、采购订单、采购入库、生产订单、委外订单、质量检验、库存台账、出货单、客户退货、运营 / 财务事实、收付款与红冲、Workflow 任务共 14 类正式选择页。销售、采购、收货、生产、出货等页面在未选择时保留有权限动作的稳定入口，选择后只呈现当前记录仍可能办理的动作；终态、已完成动作和空“更多操作”均不占位。

质量检验：写操作统一为“ 不合格处置 ”，按来源和来源单状态路由到首次来料退厂 / 补换、已入库采购退货、委外返厂 / 返工或生产异常处置。只有对应写能力才显示该入口；仅有委外读取权限的 demo_boss 不再看到永久置灰的“委外返厂 / 返工”，无选择时显示带原因的“查看委外处置”，选择不合格委外质检后可查看，选择来料、合格、已取消或其他不相关记录时隐藏。已生成采购退货后处置动作隐藏。浏览器同时发现并修正质检堆叠单元格在相同回退文案下的重复 React key。

权限与领域边界：移动任务页按后端 action explain 的 `required_permission` 与当前有效会话区分“无权限隐藏”和“有能力但当前任务暂不可办置灰”。本轮未改后端 RBAC、schema / migration、Workflow / Fact 写入、来源单生命周期或领域 usecase；Workflow task done 仍不等于 Fact posted。

验证：Web 全集 `1786 / 1786`、ESLint、Stylelint、Vite production build（`3333 modules`）、相关脚本 ESLint 和 `git diff --check` 通过。真实 Chromium 定向 `6 / 6` 覆盖无选择、无权限、loading / saving、销售五状态、采购 / 收货 / 质检 / 出货代表状态、桌面 / 手机暗色、终态隐藏、空“更多操作”隐藏、demo_boss 委外只读切换，以及首次来料与已入库采购退货共用统一入口；DOM 顺序、相对位置、控制台错误和横向溢出守卫通过，关键截图已人工检查。

边界：浏览器证据来自本地自托管 React + Chromium 与受控 mock RPC，只证明当前 Local 前端合同和运行态，不是目标账号实登、共享 / 133 / 生产数据库验证、部署、甲方 UAT 或客户签收。本机使用 Node `26.5.0`，仓库声明 `24.14.x`；本轮未提交、未推送、未部署。

## 下一步与停止条件

1. 发布前必须绑定最终 commit / image，按正式流程执行备份 / 回滚点、migration status / apply / readback、health / ready、真实账号与业务 smoke。
2. 客户交付仍须甲方岗位 UAT / 签收；本地或固定旧版本绿色不能替代。
3. 异常流 Worktree 暂保留为恢复副本；后续清理须单独确认目标和现场，不把 Handoff、提交或推送等同于 Worktree 删除。

## 归档索引

- `docs/archive/progress-2026-07-23-before-exception-flow-v1-final-handoff.md`：本次异常流四项收口 Handoff 前的完整过程记录；归档前为 354 行 / 81,412 bytes，SHA-256 `7ecb190e0242aaf42a16d946eeb2045c4ddeba290f611f2bfe9d5452a8cfb4a2`。
- `docs/archive/progress-2026-07-18-before-source-lineage-draft-cancellation-closeout.md`：来源血缘和草稿取消集中收口前的完整过程记录。
- `docs/archive/progress-2026-07-17-before-workflow-source-task-producers.md` 与 `docs/archive/progress-2026-07-15-before-local-admin-default-policy.md`：更早完整过程记录。
- 其余历史过程记录索引见 `docs/archive/README.md`、`docs/文档清单.md` 和 Git 历史。
