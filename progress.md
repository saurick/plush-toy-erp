# plush-toy-erp progress

本文件只保留当前活跃事项、最近完成记录和归档索引；历史流水已完整归档到 `docs/archive/`。`progress.md` 是过程交接线索，不是正式需求、数据模型、迁移或部署真源。

## 当前活跃事项

- 当前真源入口为 `docs/当前真源与交接顺序.md`、对应产品 / 架构文档、当前代码、Atlas migration 和测试；截图、历史任务与本文件不能单独证明运行态。
- 当前共享 worktree 的并行写任务已经结束，现由单一 Git owner 冻结并收口整树；来源血缘、事实退出、生产路线 / WIP、岗位任务、九角色权限和页面合同按同一最终树核对，不把相邻差异拆算为独立已交付任务。最新完整 `strict` 已输出 `status=complete`；本记录写入后只需完成文档、diff、数据库守卫和证据一致性收口。
- 登记的专用本地验收库 `plush_erp_acceptance_20260716_v5_dev` 与 133 V5 固定库 `plush_erp_uat_20260716_v5` 均已应用到 `20260722000505`、90 executed、pending 0；两端分别从空业务基线生成同版本、独立 ID 的九阶段数据。旧本地库和旧 133 V5 库均以可恢复改名方式保留，未清理。
- 133 V5 已运行 release `80b77faeab566660c77fc23cc66c272096692f16` 的 amd64 server / web 镜像；runtime preflight、health / ready、50 页浏览器和 5 份 PDF 验收通过。公网 `admin.yoyoosun.net` 的入口适配容器也已切到同一 V5 web / backend，旧入口容器仅停止并保留为即时回滚点；客户 UAT / 签收仍是独立关口。
- 当前 Git 由单一 owner 收口；本轮已获提交、推送和 133 部署授权，不创建分支。后续如再修改运行时代码或 migration，必须生成新的不可变 release 并重新走目标环境证据链。

## 2026-07-22 133 凭据生命周期与登录发布门禁

完成：将本地开发与登记的 `customer-trial-133` 隔离测试目标收敛到 `credential.contract.json` v2：稳定管理员固定为 `admin/adminadmin`，十个固定 demo 共用 `12345678`。这两组值被明确标记为公开测试凭据，不再从 Keychain 或临时环境变量派生，避免不同 Codex 会话因“加强安全”自行生成、轮换或沿用另一套密码；其他 staging、UAT 与生产目标仍禁止复用。

完成：镜像内事务化轮换命令和本机受控 wrapper 固定覆盖一个 super admin 与十个 demo，递增 `auth_version`、撤销旧会话并写脱敏审计；小写 UUID v4 operation id 作为 durable marker，同一操作在输出中断后可安全重放而不重复轮换。公开测试密码由版本化合同读取，不进入服务器 steady env、argv、日志或 evidence；SMS 手机号仅在发布工作站人工录入时临时注入、绑定并读回，未录入不阻断密码登录。

完成：正式 smoke 对合同 hash、目标库、dataset 及 11 / 11 账号逐一执行真实 JSON-RPC 登录；每个响应必须精确匹配 JSON-RPC id、业务码、账号身份，并验证 11 个不同 token。仅当 SMS 手机号已人工配置时才额外核对 admin 手机号。发布 gate 交叉核对完整 40 位 commit、migration、目标、账号集合、auth version、可选手机号绑定和脱敏字段；造数、恢复或回滚后缺轮换回执、任一密码账号失败或合同漂移都会 fail closed。

验证：定向 Go 包覆盖 133 / 本地精确目标密码、其他目标拒绝、SMS 缺省与非法手机号；脚本覆盖版本化合同、SSH stdin、未知结果幂等回放、可选手机号、JSON-RPC 响应严格性、11 账号登录矩阵及 release evidence gate。最终整仓 `strict` 从头完成，scripts Node 1318 / 1318、server all 2820 / 2820、Web contract 209 / 209、Web all 1711 / 1711，均为零失败、零跳过；构建、真实 Chromium、fresh / populated migration、PostgreSQL、ShellCheck、shfmt、YAML、密钥扫描和 govulncheck 同轮通过。当前修改仍只证明本地代码合同；尚未提交、推送、构建不可变镜像或重新部署 133，目标数据库密码也尚未按新合同轮换。后续必须在取得 Git 收口确认后完成受控备份、发布、事务轮换和公网 11 / 11 登录，SMS 未人工录入时不要求发送或投递验证。

## 2026-07-22 GitHub CI Linux 测试夹具修复

完成：保留单一 `Strict repository gate` GitHub Actions 门禁和生产预检的 fail-closed 规则。连续失败不是 Actions、依赖安装或 `strict.sh` 编排故障，而是 `bootstrap-production-admin` 测试把部署锁夹具建在 `os.tmpdir()`；Ubuntu 将其解析为 `/tmp`，被生产预检正确拒绝，macOS 的 `/var/folders` 则掩盖了跨平台差异。测试夹具现改用仓库已忽略的 `output/qa-tmp` 私有根并强制 `0700`，同时主动断言不落入 `/tmp`、`/var/tmp` 或 `/dev/shm`；聚合测试 watchdog 只增加调度余量，生产脚本接收的锁等待与共享临时目录拒绝合同未放宽。

验证：Linux arm64 Node `24.14.0` 容器内 `bootstrap-production-admin` 定向测试 `36 / 36` 通过，`0 fail / 0 skip`；生产预检“拒绝共享临时目录锁”合同 `1 / 1` 通过。`git diff --check` 通过。该证据证明当前工作树的 Linux 根因已修复，不等于远端 CI 已绿色。

下一步 / 风险：需要由当前单一 Git owner 将本修复与同文件现有 SMS 运行合同改动一起审查、精确提交并推送，再等待新 commit 的 GitHub Actions 完整结束；远端 run 通过前仍只能报告“本地与 Linux 等价验证通过”。当前共享工作树还有其他部署改动，本节未 stage、提交、推送、部署或改动数据库。

## 2026-07-22 133 V5 发布、同语义造数与目标浏览器验收

完成：将整树提交 `80b77faeab566660c77fc23cc66c272096692f16` 推送到 `origin/main`，从该 clean commit 构建并上传 `linux/amd64` server / web 固定标签镜像。源码包与镜像包在上传两端完成 SHA-256 校验；133 当前 V5 release 目录和受控 env 已切换到新镜像，旧源码、旧镜像、旧库及 `plush-toy-erp-prod` 栈均保留为回滚点。

完成：发布前对旧 V5 库生成备份并在本机隔离 PostgreSQL 中完成真实恢复演练。恢复库从 `20260715161753` 应用 14 个 migration 到 `20260722000505`，populated-upgrade、customer-config-cutover 两项只读审计、64 张 public 表 smoke、后端 health / ready 和 Web smoke 均通过。目标停机窗口只停止 V5 app / web；旧固定库可恢复地改名为 `plush_erp_uat_20260716_v5_pre80b77fae`，随后重建同名空库并执行 90 / 90 migration、首个管理员、客户配置 validate / publish / activate / readback 和 exact core bootstrap。

完成：首次 133 dataset fresh run 在 role 阶段发现 migration 先于核心仓库创建，导致 `warehouse / quality` 范围仍为 `NONE`，runner 正确 fail-closed，未进入来源单或 Fact 写入。修复后已注册 local / 133 验收目标统一通过带版本校验和审计的正式 `admin.set_role_data_scopes`，精确绑定 4 个核心仓库；没有直接 SQL 改 RBAC，也没有扩大生产目标。原失败回执和时间锚点保留，通过同批 resume 完成 role、source、task、facts、purchase-quality、attachments 和 readiness。

目标证据：当前库有 14 个管理员、272 条 Workflow 任务、45 张销售单、90 张采购单、45 张委外单、54 张采购收货、169 张质检、498 条库存流水、47 张出货和 274 条财务事实；`warehouse / quality` 均为 `ASSIGNED:4`。浏览器验收正式桌面账号 10 / 10、移动岗位 9 / 9、异常账号 3 / 3、页面 50 / 50、页面数据证据 48 / 48；5 份采购 / 加工 / 工程 PDF 均为 HTTP 200、有效 PDF、带 request id 和 25 行来源数据。运行态 preflight 证明四服务唯一、镜像 / release 一致、非 root、Chromium pin / seccomp、health / ready 均通过，fatal 日志扫描为 0。

公网入口纠偏：首次收口只完成了 `127.0.0.1:5185 / 8315` 的隔离 V5 发布，没有切换 `admin.yoyoosun.net` 实际使用的宿主机 `5175` 入口，因此用户看到的仍是 `51dd98ec3c0e` 旧页面；不能把隔离栈绿色写成公网已部署。现已按服务器既有入口适配模式，将 `0.0.0.0:5175` 切到 `plush-toy-erp-web:yoyoosun-20260722-80b77fae-amd64`，接入 `plush-toy-erp-v5_default` 并代理到 V5 `app-server`；新入口容器具备与 Compose web 一致的资源限制、5 秒健康检查和 `always` 重启策略。旧 `51dd98ec3c0e` 入口容器保持 stopped、未删除，回滚只需停止新入口并重新启动旧入口。

公网读回：绕过本机代理后连续 5 次访问 `https://admin.yoyoosun.net/` 均返回新资源 `index.hUVoU3vj.js / index.CmoBVjik.css`，新 JS 为 HTTP 200、旧 JS 为 404，`/healthz` 为 200；133 本机入口 `/rpc` 代理返回 200。真实 Chromium 使用受控 Keychain 管理员凭据从公网登录到 `/erp/dashboard`，显示东莞市永绅玩具有限公司、业务管理、当前菜单和 V5 工作台任务数据，浏览器控制台 0 error / 0 warning。服务器侧新公网入口为 running / healthy，V5 backend 为 running，`/healthz=ok`、`/readyz=ready`。

未做 / 风险：这是 `customer-trial-133` 模拟验收数据与目标技术验收，不是真实客户数据、正式生产配置或客户 UAT。公网入口适配容器沿用服务器既有独立入口模式，不属于 V5 Compose 四服务，也不能替代正式网关 / Cloudflare 配置治理；后续若把该试用环境转为正式生产，必须先按正式客户配置、目标库和入口真源重新发布，不能直接把当前试用开关当生产配置。旧库、旧源码和旧镜像暂未清理；当前根磁盘约 79% 使用、约 21 GiB 可用，后续清理必须继续保留当前版与明确回滚版，不得全局 prune。管理员与岗位临时密码不写入仓库、报告或远端 steady env。

## 2026-07-22 永绅九角色 P0 权限与本地验收闭环

完成：以 Product Core RBAC、永绅角色矩阵、客户配置投影和正式角色手册为同一链路，补齐老板、销售、工程、PMC、采购、仓库、品质、财务、生产九岗位的主责操作、协作只读、工作台、任务看板和上下游穿透。最终为 9 个角色、280 条角色权限分配、119 个唯一权限；全部业务岗位有工作台和任务看板，业务看板仅老板与 PMC。权限中心显示后端 RBAC、客户启用模块、角色页面投影和最终有效结果及阻断原因；直接 URL 访问继续 fail closed。后端新增仓库 Data Scope 的 `ALL / ASSIGNED / NONE` 强制查询边界，以及往来隐私、销售商业、采购商业、财务结算四组敏感字段读取权限，不用前端隐藏冒充安全控制。

完成：补齐采购与仓库的采购退货 / 入库调整生命周期权限、工程材料建档维护、销售 / 采购联系人停用与主联系人设置、销售草稿取消、老板 / PMC 跨岗位任务监督等闭环。对应 Atlas migration 已完整进入 `20260721134123` 与 `20260722000500..00505`，fresh 和 populated-upgrade 均覆盖。角色手册 `docs/customers/yoyoosun/角色能力与流程矩阵.md` 逐角色列出职责、精确权限、菜单、责任池、协作交接和 Source Document / Workflow / Fact 边界，并使用表格和 Mermaid 保持可审查；客户包仍是 draft / preview-only，local-test 激活不改变正式发布状态。

运行态证据：旧本地验收 revision 的同批 resume 因 `resume_baseline_config_mismatch` 正确失败，没有复用旧 baseline。随后将精确专用模拟库可恢复地重命名归档，重建同名空库并完成 90 / 90 migration、内容寻址配置 `yoyoosun-customer-package-v7.local-cb388f5a72dd9f59.runtime-v1` 的 validate / publish / transition / activate / effective-session readback，以及 1 个单位、4 个仓库、24 类业务对象为 0 的 fresh baseline。九阶段 runner 全部 completed，出货精确 47 张；九账号 JSON-RPC 门禁 9 / 9 完成允许读取、预期 `40304 PermissionDenied` 写探针和前后总数一致，业务写入为 0。

浏览器循环：首轮 50 页验收为 49 / 50，真实暴露 BOM 搜索的旧异步响应覆盖新结果，导致色卡 25 行源单选择失败；没有重跑成偶然绿色。BOM 页面接入共享 latest-request coordinator，以 abort + sequence 双守卫禁止旧响应覆盖 rows / total / loading，并加入共享乱序回归合同。修复后从头重跑为正式桌面账号 10 / 10、移动岗位 9 / 9、异常账号 3 / 3、页面 50 / 50、页面数据证据 48 / 48；5 份业务来源 PDF 均为 HTTP 200、有效 PDF、25 行。独立角色菜单 smoke 同时为桌面 10 / 10、岗位任务端 9 / 9、管理员拒绝态 1 / 1，绑定上述新 revision。

验证：最终从头执行 `bash scripts/qa/strict.sh`，脚本自动发现、Web 合同、Web 全量、fresh / populated-upgrade、关键 PostgreSQL、server quick / all、构建、扩展 Chromium、ShellCheck、shfmt、YAML、Web 零 warning 和 govulncheck 全部实际执行；Web 合同 209 / 209、server all 2808 / 2808，均为 0 fail / 0 skip，最终输出 `full status=complete` 与 `strict status=complete`。govulncheck 调用路径为 0 漏洞；`golang.org/x/text` 已升级到 0.39.0。定向 BOM 乱序合同 11 / 11、完整 Style L1 157 / 157 也通过。

未做 / 风险：没有提交、推送或部署，没有在 133 / 生产应用 migration、激活 customer config、重放数据或执行目标角色 smoke，也没有客户 UAT。当前运行态证据只属于登记的本地专用模拟库；可恢复归档库尚未清理。正式发布仍须绑定最终 commit / image、目标 migration、health / ready、回滚点、目标岗位浏览器 / PDF 和客户签收。

## 2026-07-22 按岗位区分的用户帮助中心

完成：恢复 `/erp/help-center` 单一登录态入口，为老板、业务、采购、生产经理、仓库、财务、PMC、品质、工程和系统管理员提供不同的当日重点、推荐顺序、交接、注意事项和常见问题。帮助页优先消费当前客户有效岗位投影；多岗位可切换，单岗位不显示切换器，未知自定义岗位使用中性帮助且不暴露内部 key。常用页面捷径与当前账号已开放菜单取交集，手机待办按岗位权限显示。该入口由已登录壳层提供，不恢复旧 `erp.help_center.read`、后端 RBAC、客户配置菜单或 Markdown docs registry。

验证：项目锁定 Node `24.14.0` 下帮助内容、导航、权限边界和页面合同定向测试 `31 / 31`，`pnpm lint`、`pnpm css`、生产构建、文档清单 `3 / 3` 和 `git diff --check` 通过。Chromium 已实测管理员从业务切换到仓库帮助，以及单岗位业务账号的 390px 暗色移动布局；两种布局均无横向溢出、页面控制台错误为 0。当前共享树的 Web 全量测试被另一组未收口 `PermissionCenterPage` 可见文案与 `userVisibleTechnicalFields.test.mjs` 断言不一致阻断；该失败不在本次帮助中心修改路径内，未作宽松处理或误报全量绿色。

未做 / 风险：未改 schema、migration、后端权限、客户配置、Workflow 或 Fact，未连接或写入数据库，未部署 133，也未完成目标环境真实岗位登录、发布读回或客户 UAT。项目中没有对应帮助中心原型，本次按现有设计系统直接实现，不伪造原型状态。

## 2026-07-22 任务看板负责岗位筛选按可见范围收口

完成：修复桌面任务看板把九个业务岗位静态展示成可选项的问题。`get_task_board` 现在从与任务查询相同的 revision、责任池、角色和本人指派可见性条件中返回 `owner_role_keys` facet；前端只用该服务端投影生成“负责岗位”筛选，不再把筛选误呈现为账号角色切换。普通单岗位账号不显示无意义的岗位下拉；当前可见范围包含多个岗位时显示“全部可见岗位”和相应岗位；直接输入不在可见范围内的 `role` URL 参数会在安全的空结果读回后自动清除。现有 Workflow owner / assignee / RBAC 校验、任务动作和 Fact 边界未改变。

验证：项目锁定 Node `24.14.0` 下，前端任务看板 API、响应合同、模型和 mock 定向测试 `38 / 38`，Web 全量 `1710 / 1710`，均为零失败、零跳过；`pnpm lint`、`pnpm css`、`git diff --check` 通过。后端 `go test ./internal/biz ./internal/data ./internal/service` 通过，数据层覆盖本岗责任池、跨岗位本人指派、岗位筛选切换和稳定 owner facet。Chromium Style L1 的全岗位可见与仓库单岗位两个场景 `2 / 2` 通过：单岗位从 `?role=sales` 进入后 URL 收敛、岗位控件为 0，筛选容器无横向溢出；多岗位仍可选择“全部可见岗位 / 仓库”。本轮定向与 Web 全量已使用 canonical Node，但仍不替代最终整树 strict、目标发布或客户验收。

未做 / 风险：未改 schema、migration、角色权限、客户配置、Workflow 状态或 Fact；未连接或 apply 数据库，未部署 133，也未完成目标环境真实岗位登录、发布读回或客户 UAT。任务看板原型已经明确“当前可见范围”语义，本次是运行时合同修复，未修改或升级原型状态。当前共享 worktree 仍含客户角色、权限、迁移和销售订单等其他会话改动，本节只归属任务看板 API / UI / 测试文件，不把相邻 diff 或历史 strict 结果算作本次成果。

## 2026-07-22 永绅九角色菜单、权限与本地运行态收口

完成：把永绅九个业务岗位的主责入口和现有 Product Core RBAC 可安全支撑的协作只读入口一次性补齐。最终叶子菜单数为老板 19、销售 9、采购 12、生产 13、仓库 9、品质 12、财务 15、PMC 11、工程 7；全部岗位均有工作台和任务看板，业务看板仅老板、PMC。销售订单、采购金额、联系人和财务数据没有为“菜单更多”而向缺少服务端字段隔离的岗位扩散。`production-exceptions` 的页面合同改为 PMC 风险读取或品质检验读取任一满足，未把 PMC 风险权限错误授予品质。

完成：修正两处运行态根因。客户配置切换原先把 entitlement 变化误算为责任池迁移，导致 148 条未结 Workflow 任务错误阻断纯权限版本；现在责任变化只比较角色责任、责任池和成员关系，并新增“存在未结任务时 entitlement-only 变更仍允许切换”的回归。存量 `business_default` 角色按设计不会被启动 seed 覆盖，因此新增 `20260722000500_reconcile_business_role_collaboration_permissions.sql`，只补齐当前 Product Core 默认角色范围内缺失的协作权限，不触碰 custom / system 角色。登记开发库按 `status → apply → status` 升级为 85 executed、0 pending。

运行态证据：通过永绅开发控制台完成 validate、publish、CAS transition、activate 和 effective-session readback，当前本地 active revision 为 `yoyoosun-customer-package-v7.local-2d67add376fa18b4.runtime-v1`。真实 Chromium 重新登录 10 个桌面账号并验证 9 个岗位任务端、1 个管理员岗位端拒绝态；九业务账号的左侧全部叶子菜单集合、`visibleMenuItems`、`pages` 和 revision 均逐角色精确相等，报告为桌面 10 / 10、岗位端 9 / 9、拒绝态 1 / 1、diagnostic blocker 0。浏览器脚本已从“只等预期项出现”收紧为精确集合比较，越权多菜单也会失败。

验证：角色配置 / 手册 / manifest 定向合同 86 / 86，运行态相关定向合同 75 / 75，客户配置 transition Go 回归通过。全量门禁循环复核先后真实发现并修正函数重命名后的静态守卫漂移、以及新增角色权限 reconciliation migration 导致 populated-upgrade 角色 version 读回合同过期；存量升级门禁单独复跑为 latest、pending 0、out-of-order 0。修正后从头执行最终 `strict`，scripts Node 1282 / 1282、Web 1698 / 1698、server quick 2631 / 2631、关键 PostgreSQL 191 / 191、server all 2785 / 2785 均为 0 fail / 0 skip，full、ShellCheck、shfmt、YAML、Web 零 warning、构建、fresh / populated upgrade、漏洞扫描与扩展浏览器门禁全部通过，最终输出 `strict status=complete`。

未做 / 风险：没有部署到 133 或生产，没有目标环境 active revision、目标角色 smoke 或客户 UAT。通用本人 / 部门 / 指定仓库 Data Scope 与价格、成本、账户、联系方式字段级后端策略仍未实现；本轮只开放已有 Product Core 后端权限允许且经敏感信息评审的整页，其余协作继续通过任务摘要或后续脱敏 read model 解决。本轮尚未提交或推送。

## 2026-07-21 持续质量 Worktree Handoff

完成：从 `codex/continuous-quality` 按当前 `main` 结构选择性移植两组质量修复，没有整分支 merge、整提交 cherry-pick 或覆盖本地并行改动。销售订单编辑不再依据产品、单位和历史快照为 `product_sku_id=NULL` 的未分规格行自动推断 SKU；只有用户显式选择时才写入精确 SKU，历史未分规格真源保持不变。客户配置模块状态与 activate / rollback preflight 的开放 Workflow 任务计数由仅责任池扩为“责任池 + 无责任池时的 owner role 回退”：只统计 `ready / blocked`，ProcessRuntime 任务要求当前 revision 与成对有效锚点，standalone 来源任务要求 revision / process / node 三项均为空，显式责任池不按角色重复回退。该计数只用于配置切换与停用门禁，不修改 Workflow 任务，更不写入 Fact。

验证：项目锁定 Node `24.14.0` 下前端定向合同 `77 / 77`、0 skip，销售订单历史 NULL SKU 的 Chromium Style L1 `1 / 1` 通过并停留在销售订单恢复态取证，Web production build 完成 `3319 modules transformed`；服务端 `go test ./internal/biz ./internal/data ./internal/service` 通过。一次性 PostgreSQL disposable critical gate 从 fresh migration 到当前本地 revision，状态为 executed 84、pending 0；关键 PostgreSQL `191 / 191`、0 skip、0 fail，其中新增客户配置责任计数用例真实执行通过，临时数据库已删除。定向语法检查和 `git diff --check` 通过。

下一步：由当前单一 Git owner 将本节与同一冻结树其余改动统一运行最终 `strict` 后收口；不要单独 cherry-pick 旧 Worktree 的 `fafc5852` 或回灌旧 `progress.md`。如需发布，仍须绑定最终 commit / image，在目标环境独立完成 migration、health / ready、业务 smoke、回滚点与客户岗位验收。

阻塞/风险：本次没有 schema / migration 新增，也没有向个人、共享、133 或生产数据库 apply；PostgreSQL 门禁使用的是一次性本机隔离库。当前共享工作树仍含本轮外的客户角色、权限、QA 和 migration 改动，本节测试证明当前组合树的相应切片，不把相邻差异归为本次 Handoff，也不代表最终 `full / strict`、提交推送、目标发布或客户 UAT 已完成。

## 2026-07-21 永绅岗位工作台与协作菜单复核

完成：把原来同时控制岗位工作台和跨部门业务看板的 `erp.dashboard.read` 拆为 `erp.workbench.read` 与 `erp.business_dashboard.read`；`dashboard_stats` 后端只接受业务看板权限，任务看板继续独立使用 `workflow.task.read`。新增受控 Atlas data migration：旧权限持有者迁到岗位工作台，只有原本持有旧权限的老板 / PMC 迁入业务看板，自定义角色的显式选择不由 seed 扩权。永绅 9 个业务岗位全部增加岗位工作台，业务看板只给老板和 PMC。

完成：按已有后端只读权限补齐协作入口。PMC 增加生产异常；采购增加材料、库存与所需产品只读；品质增加生产订单和库存；财务增加销售订单、质检和库存；生产增加排程和库存。销售、工程、仓库增加岗位工作台。没有把通用 Data Scope 或角色级敏感字段做成 UI 假开关，相关后端强制链仍作为正式缺口。同步角色手册为 9 岗位、218 条分配、103 个唯一权限，并给同步测试增加菜单 / 权限重复项阻断。

当前验证：`make data` 显示 migration 目录与 Ent 目标同步且生成完成；新增 populated-upgrade 场景从旧 `erp.dashboard.read` 绑定读回为 3 个岗位工作台绑定、2 个老板 / PMC 业务看板绑定，旧权限为 0，角色 version 精确递增，并由一次完整 `full` 的 fresh / populated upgrade 再次覆盖。后端定向测试通过；角色手册 / 客户配置定向合同 `94 / 94`、Web 关键合同 `207 / 207`、scripts 全量 `1281 / 1281`、Web all `1697 / 1697`、server quick `2630 / 2630`、server all `2784 / 2784` 均为零失败、零跳过。首次 `full` 真实发现工程岗位浏览器 smoke 仍使用旧菜单清单，修正后重新运行完整 `affected.sh --run`，最终输出 `full status=complete`。Chromium Style L1 已用 canonical Node 运行工作台、业务看板、菜单分组三个场景，`3 / 3` 通过；本记录写入后执行的最终 `strict` 也输出 `status=complete`，覆盖 full、ShellCheck、shfmt、YAML、Web 零 warning、构建、fresh / populated upgrade、漏洞扫描与扩展浏览器门禁。

完成：scripts Node 测试入口固定为 `--test-concurrency=1`，并增加自测锁定该合同。原因是原入口并发运行大量 shell / Docker 模拟子进程时出现随机 `SIGTERM 143`；临时串行诊断无业务断言失败，标准串行入口随后真实完成 `1281 / 1281`，不再用偶发重跑作为绿色证据。

未做 / 风险：未对个人、共享、目标或生产数据库执行 migration apply；客户包仍为 preview，未 publish / activate；没有目标 effective session、9 岗位真实登录、敏感字段红线、发布或 UAT 证据。本轮尚未提交或推送。

## 2026-07-19 永绅角色、权限与全流程协作手册

完成：以 Product Core 当前代码 / 测试、永绅客户配置和客户 Private 仓 17 份受控原件为分层真源，重写 `docs/customers/yoyoosun/角色能力与流程矩阵.md`。手册当前逐角色列出 9 个业务岗位、218 条精确权限分配（103 个唯一权限）、菜单、职责、责任池和与其他角色的交接；按 Source Document / Workflow / Fact 边界整理 22 类流程，并用 16 幅 Mermaid 图和表格展示销售、工程、PMC、采购、仓库、品质、生产、委外、出货、财务及控制角色的协作。同步补齐文档导航、流程编排矩阵和决策日志，不把客户图、预览配置或本地实现冒充目标运行事实。

完成：新增手册同步测试并接入 docs affected gate 与 gate profile，动态读取 `roleFlowMatrix`、`customerPackage`、`flowOrchestrationCoverage` 和后端 144 个权限 key，逐角色核对精确权限集合、菜单、职责、工作流节点 / 命令、ProcessRuntime、甲方流程锚点、已知缺口、Mermaid 数量、敏感信息与最终验证占位。独立只读审查按事实边界、可读性和假绿风险循环复核；发现问题后回改并从受影响层重跑。

当前验证：手册同步测试 7 / 7、客户配置 / readiness / 验收等定向 Node 测试 122 / 122、客户源 manifest / extract 工具测试 52 / 52、Mermaid 11 Chromium 解析 16 / 16、scripts 1280 / 1280、Web contracts 207 / 207、Web all 1697 / 1697、disposable PostgreSQL critical suite 190 / 190、server quick 2630 / 2630、server all 2784 / 2784 均为零失败、零跳过；`affected.sh --run` 5 / 5 命令组（docs 10 / 10、direct 42 / 42）、当前 worktree Chromium 3 / 3、`full.sh status=complete` 和 `strict.sh status=complete` 均通过。strict 还真实完成 ShellCheck、shfmt、YAML、Web 零 warning 与末尾严格漏洞扫描；Private 正式 pin 因 lock 指向旧 Product Core 而按设计 fail closed，不能计作通过。

未做 / 风险：永绅客户包仍是 `runtimeEnabled=false` / `previewOnly=true`，未 publish / activate；未执行目标 migration、active revision / effective session 读回、9 岗位真实登录与写入 smoke、采购 / 加工合同实物 PDF、目标发布或客户 UAT。首次来料拒绝回路、客户普通岗位的采购退货 / 调整全生命周期权限、财务放行 Web 入口、包材独立事实、外部 QC 门户、PAYMENT / 银行多单核销 / 总账税控等缺口已在手册显式登记。本轮未提交、未推送、未部署，也未写入共享库、目标库或客户业务数据。

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

## 2026-07-22 133 短信登录发布合同与公网切流收口

完成：yoyoosun 新增不含密钥的运行能力合同，固定短信登录为 `provider / enabled / not-mock`。生产 preflight 同时校验受控 env、app 容器实际 env 和公开 `auth.capabilities`，任一降级即阻断；服务端生产启动也改为只接受 `disabled / provider`，拼错或未知 mode 不再静默归一为关闭。正式 yoyoosun smoke 和 release evidence gate 强制包含同一脱敏 capabilities 读回，不再依赖孤立的历史旁证。

完成：新增 plan-first 的 yoyoosun 133 公网前端切流脚本。脚本只接受绑定 40 位 Git SHA 的不可变镜像，先在候选 loopback 端口验证健康和 provider capabilities，再切换 5175；切流失败会尝试恢复旧容器，旧容器保留为回滚点。短信 provider 四项真实值仍只存在于目标服务器受控 `0600` env，不进入代码、测试输出或 evidence。

当前验证：`go test ./cmd/server`、`run-smoke-script.test.mjs` 7 / 7、`production-preflight.test.mjs` 76 / 76、`release-evidence-gate.test.mjs` 67 / 67 通过；公网切流脚本通过 `bash -n`，`git diff --check` 通过。下一步是提交推送当前固定版本，在本地构建 amd64 镜像并传输到 133，安全迁移原有 provider Secret、执行目标 runtime preflight、切流和公网 smoke。真实短信发送仍需受控测试手机号，capabilities 读回不等于阿里云实际送达证明。

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
