# plush-toy-erp progress

本文件只保留当前活跃事项、最近完成记录和归档索引；历史流水已归档到 `docs/archive/`。`progress.md` 是过程交接线索，不是正式需求、数据模型或部署真源。
## 当前活跃事项

- 当前真源入口为 `docs/当前真源与交接顺序.md`、对应产品 / 架构文档、当前代码、Atlas migration 和测试。
- 当前只收口上述真实缺口；不得回退其它已完成任务，也不把旧审查中的过期 / 超范围建议重新扩成产品功能。
- 发布目标是内网测试机 `192.168.0.133`；低配目标只加载本地 fixed revision 构建产物、执行 migration、Compose 重启和部署后回归。

## 2026-07-15 密码登录精确提示部署收口

完成：commit `56ecf873` 已推送并以本地构建的 amd64 server/web 镜像加载到 `192.168.0.133`。目标应用数据库已显式核对为 `plush_erp_uat_20260715`，Atlas 为 75 / 75、pending 0；UAT 备份、镜像 digest、旧 release `929ec0b3` 回滚点均已保留。客户试用配置通过标准 validate / publish / activate / effective-session readback 升级到 v3，未直接写配置内容。`admin` 已设置新的生产强密码、撤销既有活动会话，密码只存 macOS Keychain；应用 JWT 签名密钥已轮换并同步当前与回滚 release。

验证：新镜像冷启动、生产预检、health / ready、客户配置读取均通过，最终复核 server/web restart count 为 0、web healthy，公网 health 返回 `ok`。公网 API 已分别确认不存在账号返回 10001 / `账号不存在`、旧开发默认密码返回 10002 / `密码错误`、新密码返回业务码 0 且签发 token；真实 Chromium 页面确认前两类提示与 API 一致。完整操作证据见 `deployments/yoyoosun/evidence/releases/2026-07-15/deployment-operation-evidence.md`。

下一步：由甲方使用实际岗位账号完成业务人工验收；账号所有者在阿里云控制台轮换短信 AccessKey 后，再更新目标环境密钥并复核短信登录。

阻塞/风险：代码、制品、migration、客户试用配置、管理员密码登录和公网提示已闭环；正式客户签收尚未发生。阿里云 AccessKey 属于外部账号资源，本轮无法代替账号所有者完成控制台轮换，不得将其写成已处置。

## 2026-07-15 密码登录错误精确化

完成：线上只读复现确认 `admin.yoyoosun.net` 服务健康，`admin` 使用本地开发默认密码登录失败的内部原因为 `password_invalid`；生产账号不继承本地开发默认密码，且启动不会覆盖已有账号密码。密码登录现按账号不存在、密码错误、账号停用、账号注销和核验期间账号信息变化返回独立错误码与岗位语言提示；短信登录继续保留防手机号枚举合同。未重置或读取线上真实密码，未改目标数据库、配置、账号或会话。

验证：当前 13 文件影响面按 T0-T5 执行 `bash scripts/qa/affected.sh --run` 全部通过：docs inventory 3 / 3，server domain、server-all、server API / JSON-RPC 三组均通过，Web 全量 1255 / 1255、lint、场景语法和 `git diff --check` 通过；错误码生成 / 同步门禁通过。`admin-login-password-errors-desktop` 真实 Chromium 场景 1 / 1 通过，依次核对账号不存在、密码错误、账号停用、账号注销和账号信息变化五种提示，并确认最长提示无截断或布局溢出；`admin-login-mobile` 默认态也已生成本轮基线截图。

下一步：如需上线，先收敛当前工作树并绑定 commit / image 执行正式发布，再在目标环境验证五类密码登录拒绝态；如需恢复 `admin` 登录，应通过受控密码重置设置新的生产强密码，不能使用 `adminadmin`。

阻塞/风险：精确的账号不存在提示允许公开调用方枚举账号；当前只有服务级 BBR 限流，尚无按账号 fingerprint 与可信来源共享的密码登录限速。本轮未提交、推送、部署或执行线上密码重置，当前公网页面仍保持旧的合并提示。

## 归档索引

- `docs/archive/progress-2026-06-28-before-runtime-manifest.md` 至 `docs/archive/progress-2026-07-08-before-runtime-lazy-import-retry.md`：历史过程记录索引见各归档、`docs/archive/README.md` 和 Git 历史。
- `docs/archive/progress-2026-07-11-before-manual-regression-deploy.md`：本轮全场景手工回归数据、提交推送和 133 部署收口前的历史流水。
- `docs/archive/progress-2026-07-12-before-agents-size-gate.md`：自定义 Skills 与项目 AGENTS 首轮治理过程记录。
- `docs/archive/progress-2026-07-15-before-local-admin-default-policy.md`：本地管理员默认凭据稳定化前的完整过程记录；归档前为 395 行 / 81,622 bytes。

## 2026-07-15 来源驱动业务闭环全工作树收口

完成：复核原 Codex 任务、其引用的 GPT 会话和最终全工作树差异后，按生产、委外、销售、采购、质量、出货与财务来源动作的既定边界完成收口。数据库守卫现已正确处理 PostgreSQL 63-byte 标识符截断；生产 / 委外 / 财务事实补齐只读来源编号；出货在真实发货事务内重新锁定并刷新销售来源金额快照；质检退供应商与质量门禁统一锁顺序；销售预留页面按订单剩余量、已生效预留和已出货量 fail closed。委外回货 transport 校验不再把缺失的 SKU 上下文误判为明确无 SKU，同时保留页面真实来源行与材料发料的严格 SKU 边界。

完成：Ent / Atlas migration 链为 75 个文件，`make data` 前后内容指纹一致；隔离 fresh 数据库从 0 应用到 75，upgrade 数据库从 74 升到 75，个人开发库也已升至 75 / 75、pending 0。yoyoosun preview 已纳入生产订单菜单及所需岗位动作，当前 manifest 为 17 个模块、9 个角色、197 个 entitlement；`pnpm start:yoyoosun` 已通过 database、backend health / ready、customer config / asset 预检并启动 Vite，验证后停止本轮测试 Vite，未执行 customer config publish / activate。

验证：来源驱动 Style L1 的 12 个页面场景覆盖 13 个业务方法并全部通过；关键 PostgreSQL 门禁 154 / 154、server-all 1917 / 1917、web-all 1211 / 1211、脚本自动发现 862 / 862，均为 0 fail / 0 skip。production build 完成 3281 个模块，lint、CSS、shellcheck、shfmt、yamllint、零 warning、Go build、govulncheck、docs inventory、`bash scripts/qa/full.sh` 和 `bash scripts/qa/strict.sh` 均通过。

下一步：提交后仍须以该 commit / image 为目标环境发布真源，串行执行发布 migration、health / ready、业务 smoke、回滚点记录、yoyoosun 配置发布 / 激活以及真实岗位人工验收。

阻塞/风险：本地代码、migration、运行预检和自动化门禁已闭环，但本轮没有部署目标环境、没有发布或激活 yoyoosun draft config，也没有取得客户签收。12 个来源驱动浏览器场景使用 current-worktree mock RPC，不能替代真实岗位账号对 13 个后端方法的持久写入 E2E。完整付款 / 核销、多单对账、总账、税控、完整 MRP / APS / MES、任意库存调整和 WMS 仍为明确非目标。

## 2026-07-15 委外 SKU 与本地客户工作台收口

完成：委外回货事实现在由后端按完整来源元组 `OUTSOURCING_ORDER + source_id + source_line_id + product_sku_id` 批量读取委外订单来源行的 `sku_code_snapshot`；来源类型非规范、缺少父单或行、跨单同 SKU、SKU 不一致及历史快照缺失均 fail closed，不回填当前主数据，也不串用其他来源行。列表、首次创建、幂等重放、并发重放、过账和取消响应统一复用该只读投影。回货记录、回货质检和应付来源弹窗统一消费冻结快照；SKU 参照与委外相关事实均改为严格的 200 条完整分页收集，第二页记录不会再因后端默认上限丢失。

完成：修复 `start:yoyoosun` 与桌面客户门禁的开发态合同错位。前端 DEV 构建在后端成功返回同 customer key 的 `builtin_rbac_fallback` 时只挂载带明确警示的本地桌面预览壳，避免把成功登录误报为“暂时无法进入工作台”；fallback 仍不属于 active customer runtime，工作台、任务看板和客户业务数据页只显示零 Workflow RPC 的 Product Core 能力审阅，移动岗位端和正式构建仍只接受 `active_customer_config_revision`。真实 5177 登录态复核中 `admin.me` 与 `get_effective_session` 均为 HTTP / 业务成功，`/erp/dashboard` 显示“工作台 能力审阅”、不显示任务队列，且没有客户运行态不可用页。委外开单的材料 / 产品条件选择器增加稳定组件身份，消除相同数值 ID 在条件切换时复用旧 label 的 Ant Select 控制台告警。

验证：本轮追加前 `progress.md` 为 321 行 / 65,188 bytes，未达到 600 行或 80 KiB 归档阈值。Node 24.14.0 下 `go test -count=1 ./internal/biz ./internal/data ./internal/service ./internal/server` 通过；Web 全量测试 1219 / 1219、lint 和 production build 3283 modules 通过；docs inventory 与 dev-entry boundary 9 / 9 通过。合并 Style L1 6 / 6 通过，覆盖本地 fallback 工作台、持续同步失败 fail closed、委外开单第二页 SKU、委外来源回货、回货质检和应付来源；fallback 场景另断言 Workflow 请求数为 0，委外开单场景控制台无 warning / error。`local-runtime-preflight` 通过 schema / migration guard、开发库 75 / 75 pending 0、backend health / ready。

下一步：yoyoosun 客户配置包仍是 draft / preview-only；正式或静态预览环境必须完成受控 manifest 评审、publish / activate、effective session 读回及岗位人工验收，不能依赖本地 builtin fallback。目标环境发布仍需绑定本次 commit / image、migration、health / ready、业务 smoke 和回滚点。

阻塞/风险：本轮没有新增或改写 schema / migration，没有发布或激活客户配置，没有目标环境部署或客户签收。SKU Style L1 使用 mock RPC；后端来源投影与写入响应一致性由 repo / service 测试证明，尚未用真实岗位账号写入新的委外回货记录做浏览器 E2E。另一任务的时区、存量升级和客户版本锁治理已迁到独立 detached worktree，不纳入本轮提交或成果口径。

## 2026-07-15 永绅本地客户运行态可重复应用

完成：本地后端的 `make run / make dev / make dev_restart` 默认固定 `ERP_CUSTOMER_KEY=yoyoosun`，显式 `ERP_CUSTOMER_KEY=demo` 仍可覆盖；`pnpm start:yoyoosun` 保持只预检和启动，不自动写库。登录后的开发控制台现在可在匹配的客户开发上下文与 loopback API 下，显式生成并应用内容寻址、长度不超过 64 的 `local_test_apply` revision。后端默认拒绝该 manifest 及其 check / activate / rollback，只有本地 Make 入口显式开放；gate 开启时启动预检使用 pgx 的最终连接配置，只接受 `192.168.0.106:5432` 的 `plush_erp` / `plush_erp_*_dev` 开发库，不受 `ERP_ALLOW_TEST_DB_AS_DEV` 影响，133、query override、multi-host fallback、其他数据库和 loopback tunnel 均拒绝。production 配置携带此开关也会失败，正式 validator / executor 同样拒绝该 marker。biz normalization 同步锁住 customer key / revision / product version 的 64 / 64 / 128 schema 长度和 local-test purpose / product identity 配对。应用链复用后端 validate / publish / transition / activate 或 rollback / effective-session readback，支持相同内容幂等重放及 A-B-A 回切；生产订单模块同时收口到独立 `production_orders` catalog / runtime gate，避免永绅 manifest 因模块依赖闭包漂移被拒绝。首次进入工作台时，`admin.me` 与有效配置只读请求会对 network / 非 4xx invalid response / HTTP 5xx / internal 瞬时错误按 200ms、600ms 做两次短重试；权限、认证、未激活配置和用户取消仍立即 fail closed，实例 active guard 同时阻止真实卸载后的旧请求回写，并让 React StrictMode 重挂载复用同一个 single-flight。

运行态证据：共享开发 PostgreSQL 当前 `yoyoosun-customer-package-v7.local-57b75a53ba779a6f.runtime-v1` 为 active，先前过长的测试 revision 为 superseded；同一 revision 重复应用成功且没有新增版本。真实 5177 管理员登录态完成编译、校验、发布、切换、激活和有效配置读回；随后 `/erp/dashboard` 不再显示“暂时无法进入工作台”或本地 fallback，永绅品牌、27 个页面投影、生产订单等业务菜单及真实工作队列正常挂载。

验证：Node 定向合同 109 / 109、`adminProfileSync` 36 / 36、Go `internal/biz + internal/service + cmd/server` 客户配置、生产订单、字段长度和 production fail-closed 定向测试、目标 ESLint、production build（3283 modules）和 `git diff --check` 通过；Style L1 首次同步 2 / 2，证明前两次 `get_effective_session` internal 失败后第三次成功且不显示阻断页，同时持续失败仍保持 fail closed。重启后的真实后端再次完成相同 revision 幂等应用与 active readback，真实浏览器另验证首次应用、dashboard 恢复与整页刷新。`affected.sh --plan` 将当前改动最高归为 T8，并要求 push 前由 `full.sh` 兜底；本轮没有把定向绿色写成 full / strict、正式发布或目标环境验收。

下一步：提交推送前在冻结工作树执行项目 Git 收口门禁，并与 detached worktree 中等待集成的全量测试治理补丁协调顺序；随后如要进入正式交付，再绑定 commit / image 独立执行正式 customer config publish / activate、目标环境 migration、health / ready、业务 smoke、回滚点和岗位人工验收。

阻塞/风险：当前本地配置写入的是共享开发库，active 切换会被其他同库开发者看到；严格并行隔离仍需独立 PostgreSQL。正式 publish / activate、目标环境部署和客户签收均未执行。当前改动尚未 stage、commit 或 push。

## 2026-07-15 BOM 人员字段文案明确化

完成：BOM 新建 / 编辑表单的 `maker`、`auditor` 可见标签由“制表 / 审核”明确为“制表人 / 审核人”，让工程岗位直接理解这里填写人员姓名。后端字段、保存与回显链路、打印纸面签字栏及审批流程边界均未改变；打印模板仍按单据习惯保留“制表 / 审核”。现有 `business-core-pages-desktop` 浏览器场景新增两项字段文案断言。

验证：使用项目锁定的 Node 24.14.0 / pnpm 10.13.1 运行 `pnpm lint` 与 Web 全量测试，1224 / 1224 通过，0 fail / 0 skip；`STYLE_L1_SCENARIOS=bom-person-field-labels-desktop pnpm style:l1` 通过 1 / 1。浏览器默认态确认“制表人 / 审核人”标签完整显示；长姓名与审核人聚焦态确认两个值槽均保持在字段容器内、输入值不丢失，截图为 `bom-person-field-labels-default.png` 与 `bom-person-field-labels-boundary.png`。大场景 `business-core-pages-desktop` 在到达 BOM 前被既有 SKU 单重列不可排序断言阻断，本轮不把它计为 BOM 失败或通过。

下一步：如后续需要把自由文本升级为人员选择器，应另行评审人员真源、历史快照和权限边界。

阻塞/风险：本轮只调整表单可见文案，不表示系统新增 BOM 审批流，也不改变历史数据。共享工作树中的其他会话改动均保留，本轮不提交、不推送、不部署。

## 2026-07-15 永绅本地、133 试用与存量升级三方收口

完成：把永绅可重复本地配置应用、133 隔离试用数据和全量测试治理三个切片合并为单一闭包。local-test 与 customer-trial 使用独立显式 identity / runtime gate；trial 分类器只占用 `customer-trial-` / `customer_trial_` 命名空间，不再把通用 `datasetVersion` 或本地 `local_test_apply` 误判为远端试用。两类 purpose / product 必须原子配对，本地身份夹带远端 `datasetVersion / target`、未知 trial 命名空间、未开放环境或目标数据库漂移均 fail closed。133 active revision 启动守卫改为通过已登记试用边界参数化查询 customer key，不在 Product Core data SQL 中硬编码客户规则。工作台首次 profile 同步只对 network、非 4xx 非法响应、5xx 和 internal 做 200ms / 600ms 短重试；认证、权限、未激活配置和卸载继续立即停止，React StrictMode 复用 single-flight。

完成：存量升级治理新增 `20260714055504` populated-upgrade 与 `20260714055825` customer-config-cutover 两项只读 preflight；线上 migration 固定为 status → 两项审计 → dry-run → apply，同一私有锁内任一失败即停止且不自动 DML。恢复演练、release evidence gate、critical PostgreSQL profile 和 affected/full 共同锁住跨 migration 的审计状态、版本、脱敏 artifact、回滚证据及非空测试执行；fresh schema、静态 DDL 和空库迁移不再冒充 populated upgrade 证明。永绅 Private 仓版本锁、Product Core 配置和正式发布仍保持各自真源，不因本轮合并形成运行时私有仓依赖。

运行态证据：133 隔离试用曾在数据库 `plush_erp_uat_20260715` 激活 `yoyoosun-customer-trial-133-package-v1.runtime-manifest-v1`，以同一 `2026.07.15-v1 / 20260715-V1` 语义数据生成 60 客户、60 供应商、80 材料、60 SKU、30 工序、销售 / 采购 / 委外 / BOM 各 45，以及 180 条 Workflow（ready 121、blocked 27、done 24、rejected 8）；source 与 task 重放均 0 新建、全量复用，Fact 保持 plan-only。该证据绑定旧基线 `929ec0b3` 的隔离试用镜像，不是本次最终集成 commit/image 的发布读回，报告仍为 `releaseReady=false`，不能写成正式部署或客户签收。

验证：Node 24.14.0 下 acceptance 定向 108 / 108、governance 定向 129 / 129、dashboard / local-test 合同 82 / 82，Go 7 包定向全绿；工作台瞬时恢复与持续失败两项 Style L1 为 2 / 2。最终隔离树 `affected.sh --plan` 识别 111 个路径、最高 T8；`bash scripts/qa/full.sh` 完整通过，包含脚本自动发现 935 / 935、Web 合同 194 / 194、server-all 2036 / 2036、fresh / populated-upgrade、关键 PostgreSQL、浏览器、lint / CSS、Go build 和 govulncheck，0 fail / 0 skip。首次 full 发现并阻止 data SQL 硬编码客户 key，参数化修正并补测试后复跑全绿。

下一步：取得提交推送授权后精确提交当前 111 个路径；再以新 commit 构建固定 digest 镜像，在 133 隔离验收库重新执行 migration、customer-trial publish / activate、数据重放、health / ready、岗位浏览器读回和密码轮换校验，替换旧基线 attestation。正式交付仍需走正式 customer config / release evidence、备份恢复、回滚点和客户签收，不能复用 local-test 或 customer-trial 开关。

阻塞/风险：本地共享开发库的 active revision 会影响同库使用者；133 当前 trial active revision 与模拟数据只属于隔离验收环境。最终集成树尚未 stage、commit、push、构建新镜像或重新部署，现有 133 证据不绑定最终代码；Fact 数据未写入，完整付款 / 核销、总账、税控和完整 MRP / APS / MES 仍不在本轮范围。

## 2026-07-15 业务看板数量真源治理

完成：业务看板后端数量收口为 20 模块只读 projection，每项固定返回 `module_key / available / total`。客户、供应商、产品与 BOM 读取 MasterData，销售、采购、生产与委外读取 Source Document，入库、库存、质检、生产、出货和财务读取各自 Fact；财务对账、应付、应收、发票按精确 FactType 分开计数。出货放行、生产排程和生产异常按 Workflow task group 计数，并复用 `workflow.task.read`、active / stored revision、owner / assignee 可见性。成功零值与暂不可用明确区分，不再从有界列表、前端状态分组或 Workflow payload 反推业务总量；相关 server 与原型 README 已同步四类独立口径、20 模块入口和 `get_task_board` 全量计数边界。

验证：最终共享工作树执行 `go test -count=1 ./internal/biz ./internal/service`，两个 package 均通过；Node 24.14.0 下看板 API / 页面 / 统计 / 任务展示合同 21 / 21、ESLint、CSS、三个 Style L1 脚本语法和 `git diff --check` 均通过。独立端口自托管 mock 的真实 Chromium 6 / 6 通过并人工核图，覆盖默认态 `191 / 135 / 0 / 93`、暗色、移动端、七位大数字、业务统计首次失败后刷新恢复、协同统计首次失败后刷新恢复及客户入口下钻；恢复场景会等临时提示层退出后再留图，避免把截图合成过渡态当成页面故障。全面试用模拟数据已经 ready；共享开发库只读核对的 Workflow 四个互斥泳道为常规待办 `55`、阻塞 `27`、到期提醒 `66`、已结束 `32`。这些数字证明当前模拟数据批次与全库只读投影可用于页面复核，不是客户真实业务事实或发布证据。

下一步：保持当前工作树不提交、不推送、不部署。若后续另行授权发布，须先冻结提交范围并补当前整树 full / strict，再绑定新 commit / image 对目标环境执行 migration、health / ready、业务 smoke、回滚点和岗位验收；`192.168.0.133` 当前只作旧基线试用数据与数量交叉核对，不能复用为本次页面代码的发布证据。

阻塞/风险：本轮没有 schema / migration 变化，没有 stage、commit、push、部署或新的 133 发布证据。当前 Fact 为 0 是本轮模拟数据边界，不代表 Fact 页面不可用，也不代表真实客户没有业务事实；`dashboard_stats` 任一已接入查询失败会整次 fail closed，协同模块没有 `workflow.task.read` 时显示不可用，均不应被解释为真实 0。

## 2026-07-15 明细列条数统一

完成：销售订单、采购订单、加工合同、生产订单、BOM、采购入库、出货单统一在“明细”列显示“箭头 + N条”；精确 0 显示不可操作的“0条”，未知显示“查看”，无权限不显示数量。五个按需读取域由后端对当前页一次 GROUP BY 计数，销售条数受 `sales_order_item.read` 约束；入库与出货复用随列表返回的明细数组。原重复计数列退出表格但保留 CSV。未改 schema、migration、RBAC、Workflow / Fact、菜单或原型状态。

验证：`go test -count=1 ./internal/biz ./internal/data ./internal/service` 通过；Node 24.14.0 下 Web 全量 1246 / 1246、lint、CSS 通过。Style L1 5 / 5 覆盖正数、0、未知加载、无权限、长数字、完整明细弹窗、移动暗色和入库列表列宽；生产与 BOM 也已锁定每页固定 3 次 SELECT，防止 N+1。

下一步：如需发布，先在共享工作树收敛提交范围，再绑定 commit / image 执行目标环境检查。

阻塞/风险：本轮未 stage、commit、push、deploy 或客户验收；共享工作树其他改动均保留，当前证据只证明本地 T3-T5。

## 2026-07-15 全站用户文案治理

完成：正式页面、登录、客户品牌及错误提示改用岗位业务语言，并扩展防回归扫描；未改数据、权限或路由。
验证：Web 1254/1254、lint、CSS、build 及浏览器 20/20 通过。
下一步/风险：如需上线须另行授权发布；浏览器使用本地 mock，未提交、推送、部署或客户验收。

## 2026-07-15 本地管理员默认凭据稳定化

完成：确认反复登录失败不是页面问题，而是人工验收密码批量轮换把稳定超级管理员 `admin` 与 `demo_*` 同批改密。登记开发库现在只在管理员字段未显式配置时使用 `admin / adminadmin`，`config.local.yaml` 和环境变量显式值仍优先；公共 dev 配置及本机私有覆盖均不再重复写默认凭据。启动初始化继续保持 create-only，不覆盖已有账号。人工验收批量轮换默认只处理 `demo_*`；133 如确需改稳定管理员，必须额外启用独立开关和目标绑定确认。本地新增无生产逃逸的专用重置命令，生产 Go 启动门禁和 shell preflight 均拒绝已知本地默认密码。复发后进一步定位到旧临时验收副本与主后端共用 `plush_erp_simon_dev`，其旧轮换器再次覆盖 `admin`；并发任务已停止该写入边界。普通角色演示 seed 已删除稳定管理员改密开关，数据层同时在事务前拒绝把 `admin` 当作演示账号创建或改密。

运行态与验证：已在登记开发库 `plush_erp_simon_dev` 再次执行 `make reset_local_admin_password`，认证版本递增、旧会话撤销；`8300` 直连及用户页面实际代理 `5178 → 8300` 的 `/rpc/auth admin_login` 均返回 HTTP 200、业务 code 0 和非空认证数据，响应输出未保存 token。应用内真实浏览器从 `/erp/admin/login` 填写默认凭据后进入 `/erp/dashboard`，页面显示“超级管理员 admin”，控制台无 error / warn。角色演示 seed / 密码事务定向 Go 测试通过，新增用例证明误传 `admin` 时在数据库事务前失败；production preflight 23 / 23、docs inventory 3 / 3、`project-scan --strict`、YAML 解析、bash / shfmt、定向 `git diff --check` 均通过。归档前 `progress.md` 为 395 行 / 81,622 bytes，原文以 SHA-256 `79bd024995cc15d9df6ddd66d54008deeb897ba960e8f25fe3ce83d9b0c0e1d3` 完整保存到新归档。

下一步：若要提交推送，先按共享工作树实际归属精确收敛本轮文件并执行冻结树门禁；若要发布，再绑定 commit / image 独立完成目标 migration、health / ready、业务 smoke、回滚点和岗位验收。

阻塞/风险：固定凭据只适用于项目登记的受信开发库，不适用于 133 或生产。已有账号不会被服务重启静默改回默认值，显式改密后应继续使用显式值；复制到临时目录的旧代码不会自动继承主工作区修复，验收任务必须使用隔离库或只使用 `demo_*`，不得再轮换共享库稳定管理员。本轮未执行全工作树 `full.sh` / `strict.sh`，未 stage、commit、push、deploy 或客户验收。

## 2026-07-15 全量工作树提交前收口

完成：冻结全部并行写入后，以共享 `main` 为唯一收口树，精确合并本地客户运行态、永绅试用模拟数据、业务看板、订单 / Fact 闭环、全站用户文案、管理员稳定凭据和全量测试治理。验收数据统一为 `2026.07.15-v3 / 20260715-V3`，本地开发使用独立验收库，轮换器默认只处理 `demo_*`；稳定超级管理员 `admin` 不进入本地批量轮换，133 的稳定管理员变更仍要求显式开关和目标绑定二次确认。合并时保留生产 / 委外明细计数、当前“业务管理 / 电脑端业务管理 / 手机端待办”文案、skill 健康检查与生产默认密码门禁，没有整包覆盖旧 worktree。首轮门禁发现的审计、移动任务、Workflow / Fact 和客户菜单旧文案断言已同步到“撤销、库存数量、基础资料、财务管理”等岗位语言，同时继续禁止 raw reason / summary 和技术 key 进入用户界面。

验证：`server/make data` 确认 Atlas migration 与 Ent schema 同步且无生成 diff；验收与客户配置 Node 定向 283 / 283、Go 7 个相关 package、文案 / Workflow / 审计定向 42 / 42、客户配置定向 20 / 20 均通过。最终 `bash scripts/qa/strict.sh` 完整通过，包含 scripts Node 1000 / 1000、Web 关键合同 195 / 195、Web 全量测试与构建、lint / CSS、自托管无头 Chromium、fresh / populated-upgrade 与关键 PostgreSQL、server-all 2075 / 2075、Go build、shellcheck、shfmt、yamllint、零 warning 和 govulncheck；全部 0 fail / 0 skip，migration preflight 为 pending 0、out_of_order 0。

下一步：按用户授权一次性暂存全部工作树、运行提交钩子、提交并推送 `main`；push 前由仓库钩子再次执行 `full.sh`。若后续要更新 133，必须基于新 commit / image 在隔离验收库重跑 migration、试用配置 publish / activate、v3 数据回放、health / ready、岗位浏览器读回与回滚验证，不能复用旧基线证据。

阻塞/风险：本轮不部署、不写 133、不轮换共享开发库稳定管理员，也不把模拟数据描述为客户真实事实或签收结果。目标环境发布与客户验收仍是提交推送后的独立事项。
