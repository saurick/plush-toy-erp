# plush-toy-erp progress（归档）

本文件只保留当前活跃事项、最近完成记录和归档索引；历史流水已完整归档到 `docs/archive/`。`progress.md` 是过程交接线索，不是正式需求、数据模型、迁移或部署真源。

## 当前活跃事项

- 当前真源入口为 `docs/当前真源与交接顺序.md`、产品能力台账、客户交付矩阵、当前代码、Atlas migration 和测试；截图、历史任务与本文件不能单独证明运行态。
- 单据流 / 业务流审计 Worktree 的 92 个任务归属路径已通过受控 Handoff 带回 Local；Local 原有的流程与状态观察台改动同时保留，起点继承内容没有被重复覆盖或误记为本轮新增。
- 本地开发数据库已统一为 `192.168.0.106:5432/plush_erp`；历史 `plush_erp_*_dev` / acceptance / archive 库完成逐库备份后删除，本地不再保留第二个 plush 开发库。133 V5 固定库 `plush_erp_uat_20260716_v5` 属于独立测试 / 目标环境，本轮未触碰。
- 133 当前 release、数据库、active config、镜像与回滚点必须在每次发布前从目标环境重新读回；历史记录只作定位，不得替代当前技术发布证据。客户 UAT / 签收始终是独立关口。
- 本轮 Git 与发布收口只能由单一 owner 串行执行；clean HEAD 的 full / strict / prepare-push、exact-SHA 远端 CI、不可变制品、本地发布演练和 133 技术发布必须绑定同一最终 SHA，以 Git、CI、制品 manifest 和运行回执为准，不由本文件预写绿色结论。

## 2026-07-29 本地发布演练客户配置门禁修正

根因与修正：`95d64e23eb7c10b6cfc966391504528ceb93978f` 的唯一一次本地 bundle、四项 checksum / load identity 和 migration、一次性管理员、RBAC / 审计、health / ready、登录、运行身份均通过；演练随后在 `validate_customer_config` fail closed，PDF 与备份恢复未执行，专属容器和数据库清理为零残留。原因是演练尝试应用 `local_test_apply` 配置，但该能力按既有安全合同只允许登记的 106 开发库，生产 Compose 也正确拒绝旧开关。现新增独立 release-rehearsal opt-in：只接受 exact run ID 对应的 `postgres:5432/plush_erp_release_<run-id>`，启动前写入实际 PostgreSQL system identifier，启动和 active revision 重启读回时再次核对同名数据库与相同 cluster identity；旧 106 门禁、133 和普通生产默认值均不放宽。

验证与边界：本地演练、生产管理员 bootstrap、migration 与 production preflight Node 合同 `182 / 182` 通过；Go 的 devdbguard、server 启动前检、JSON-RPC 门禁和 active-revision 启动读回四包通过，生产 Compose 可解析且 `git diff --check` 通过。`95d64e23` 不推送、不发布、不复用失败回执；下一步在新 clean SHA 上只构建并演练一次，成功后才执行一次 prepare-push、远端 CI、不可变 Release 与远端制品演练。当前 133 仍保持旧运行版本，未执行目标 migration / 岗位 smoke 或客户 UAT。

## 2026-07-29 本地发布演练 fresh 审批岗位前置修正

根因与修正：`f14532a2f948af990f05a464cbdc10ae44b6f224` 的唯一一次 full、bundle、checksum 和 load identity 均通过；唯一一次本地演练也已完成 migration、一次性管理员、RBAC / 审计、health / ready、登录和运行身份，但 fresh database 只有超级管理员，没有销售、老板、采购、财务岗位员工，客户配置因此在 `publish_customer_config` 的审批责任可办理性检查中失败。失败环境已清理为零残留，PDF、备份恢复和重启恢复未执行。现从实际 `local_test_apply` manifest 推导所需审批岗位，只在 exact run ID、同名 `plush_erp_release_*` 和相同 PostgreSQL cluster identity 的一次性数据库中，把这些岗位临时绑定到一次性超级管理员；写前核对岗位存在、启用且具备审批权限，写后读回精确绑定数，演练销毁时连同数据库删除，不创建可复用账号、不写业务事实，也不放宽 106 / 133 / 普通生产门禁。

验证与边界：演练定向合同 `10 / 10`，与 production admin bootstrap、migration、production preflight 的组合回归 `183 / 183` 通过；SQL 只通过 stdin，数据库名、cluster identity、岗位与绑定数均 fail closed，密码不进入 argv 或回执。RPC 失败收据同时保留脱敏后的 code / message，后续不再靠重复演练猜原因。`f14532a2` 不推送、不发布、不复用旧 full 收据或失败演练回执；下一步为该修正形成新 clean SHA，再各执行一次 full / prepare-push、bundle、演练、远端 CI 与不可变 Release。133 仍保持旧运行版本，尚未执行目标 migration、岗位 smoke 或客户 UAT。

## 2026-07-29 生产异常待审批模块间距修正

完成：生产异常处置的“待审批”页签现在复用业务列表页统一的 `BusinessPageLayout`，操作区与下方表格恢复标准 `6px` 模块间距；没有新增页面专用 CSS，也没有改变筛选、审批动作、表格或页签行为。

验证：页面与 Style L1 定向合同 `25 / 25`、Web ESLint、Vite production build（`3341 modules`）通过。真实 Chromium 定向场景 `1 / 1` 通过，DOM 盒模型在 `1440 × 900` 桌面和 `390 × 844` 窄屏下均读回 `6px` 配置间距与 `6px` 实际渲染间距；桌面和窄屏待审批截图已人工复核，模块分隔清晰且页面无横向溢出。

边界：本轮没有修改 CSS、schema、migration、RBAC、Workflow / Fact 合同、菜单或原型文档，没有提交、推送、部署、目标环境岗位实登或客户 UAT。验证使用本机 Node `26.5.0`，仓库正式版本仍为 `24.14.x`，命令带 engine warning 但未发生测试、lint、构建或浏览器失败。

## 2026-07-29 本地不可变发布演练一次性管理员修正

根因与修正：精确 SHA `1c9027dd501bc0535a08acd8beef0364721f986f` 的 GitHub CI、单次 `2026.07.29-3` Release、六件远端制品 checksum / manifest / SBOM / 镜像身份均已通过；首次本地制品演练在 migration 完成后被服务端生产安全门禁拒绝。演练脚本原先把一次性管理员密码只写入 Compose 替换 env，但生产 Compose 按设计不映射该 secret，同时又把常驻服务设为 `BOOTSTRAP_ADMIN_ONCE=true`；服务因此以退出码 2 反复退出。现改为 migration 后启动无端口、固定镜像的一次性容器，只通过当前进程环境注入符合 8–20 字符合同的临时密码，绑定 container / Compose project / service / image content ID / operation，读回 marker、管理员、completed audit 与内置 RBAC 后精确删除；稳态 env 从创建起始终为 `BOOTSTRAP_ADMIN_ONCE=false` 且不含密码。

验证与边界：定向 Node 合同 `8 / 8`、语法、Prettier 和 `git diff --check` 通过；首次失败演练已自动销毁专属 Compose 与数据库，容器残留为 0。该修正尚未形成新 clean SHA、构建新制品、推送、发布或部署 133；下一步只在新 clean SHA 上各执行一次本地 bundle / 演练、prepare-push、远端 CI 与不可变 Release，禁止重试 `2026.07.29-3` 或复用其失败演练回执。客户 UAT / 签收仍为独立关口。

收口补充：`3eb8192d3532ee932985053457171abf40ef6853` 的唯一一次本地 bundle、checksum、load identity 均通过；随后演练在约 16 秒内于一次性管理员 SQL 读回处停止并完成零残留清理，没有进入健康、PDF 或备份阶段。原因是变量化 psql 读回误用了 `-c`，违反项目既有 stdin `-f -` 合同；现已让命令包装器显式承载 stdin，并新增参数、SQL 与 secret 不进入 argv 的合同。演练与正式生产 bootstrap 定向测试合计 `46 / 46` 通过。`3eb8192d` 不推送、不发布、不复用失败回执；待新 clean SHA 只构建和演练一次。

## 2026-07-29 133 扩容与不可变制品构建边界修正

完成：用户确认虚拟机快照后，133 的 root LV 与 ext4 已从 100GiB 在线扩至 250GiB，当前根分区约 155GiB 可用；ERP 容器未重启。扩容后的目标只读前检已通过容量、环境、Compose、数据库身份、health / ready 与 migration lock，旧运行版本保持不变。

发布证据：`babd2393e6bf7d30acf2c4bc4ae600a52856c40e` 的单次 `2026.07.29-1` 发布在 strict 通过后，因独立 Web Dockerfile 的 Node-only builder 调用 Go 错误码生成器而失败。修正形成 `50c203ed51334f95089abccf81348eeed356bc18` 后，本地 full、非强制推送和远端 CI 均通过；其单次 `2026.07.29-2` 发布也通过 strict，但随后暴露 Server Dockerfile 内还有一份重复的 Web builder，仍调用带 prebuild 的旧命令。两次失败都没有生成 GitHub Release、tag 或可晋级制品，也没有自动重跑。

修正与验证：两份 Dockerfile 现在统一消费 CI 已校验的 committed error-code projection；Server 内嵌 Web builder 同时改为复制完整顶层 `.mjs` 构建图，避免手工插件清单再次漂移。定向合同、`git diff --check` 和真实 Server `linux/amd64` Docker 构建通过；镜像内三个二进制、正式 Web 入口、客户配置及内置 SHA 均已读回，临时镜像已精确移除。完整本地 bundle 继续推进到两张镜像均成功后，又发现 source archive 的 `sha256:<64hex>` 合同没有在 manifest 边界归一化；现已在唯一入口严格转为裸 64 位哈希，并新增 bundle 级集成合同，验证 manifest、SBOM、两张 image tar 与四行 checksums 一起原子落盘。clean `25b21dec1db9561ad1f430366bf8ab49b5a5b5bc` 的完整 bundle 与 load verify 随后通过，manifest、SBOM、两张镜像归档、内置 SHA、`linux/amd64` 与加载后 content identity 全部一致，脱敏扫描通过。

当前阻塞与下一步：`25b21dec` 的首次 prepare-push 在 full 的客户配置边界检查中失败；旧断言只接受 Server Dockerfile 逐个枚举 Vite 顶层插件，没有识别已经真实构建通过的 `COPY web/*.mjs ./` 合同。该失败发生在静态门禁，没有触发远端 CI 或新发布，隔离数据库残留读回为 0 并已停止。先提交只兼容显式复制或受控顶层 `.mjs` glob 的门禁修正，在新 clean SHA 上完成定向合同、一次完整 bundle / load verify 和一次有效 prepare-push，再推进远端 CI 与一次 `2026.07.29-3` 不可变发布，随后校验远端 manifest / digest、执行同制品本地发布演练并从版本中心晋级 133。当前尚未部署新版本、执行目标 migration / 岗位 smoke 或客户 UAT；两个失败发布 SHA 均不复用、不重跑。

## 2026-07-29 DEV-only 测试数据准备中心

完成：新增 `/__dev/data-preparation`，登记 `core-demo`、`scenario-demo` 与 `full-acceptance` 三个固定档位。页面先读取仓库、目标和 migration 前置，再准备绑定 repository fingerprint、target fingerprint、preflight fingerprint、operation runId 与 planHash 的不可变计划。`scenario-demo` 已收口为“生成业务场景测试数据”：点击后自动准备计划并直接打开可读确认，用户核对固定目标、V5 批次、数据范围与长期保留边界后确认一次即可，不再手工复制长确认串；其他高风险档位继续使用完整确认串。浏览器不能传入命令、路径、DSN、后端地址、密码、环境变量或任意 SQL。operation、幂等索引、prepare claim 和全局 execute lock 使用本机私有回执持久化；跨进程同键只产生一个计划，进程中断后的写入结果标记为 `not_proven`，禁止自动重试。

数据边界：`core-demo` 只复用现有十个角色演示账号与 `SIM-PLUSH-CORE` 单位、材料、产品、仓库、工艺和 BOM 稳定 upsert，不生成客户、订单、Workflow、库存、出货或财务事实，也不提供批次删除。`scenario-demo` 固定绑定 `yoyoosun-manual-acceptance / 2026.07.16-v5 / 20260716-V5`、`127.0.0.1:8300` 与登记的 106 长期开发库，默认 plan / summary 不登录、不写库；只有固定目标、migration 与 runtime identity 已证明后，后台才使用本机开发账号约定，显式服务端环境覆盖仍优先，凭据不进入浏览器、命令参数或回执。页面确认后才走正式 API 串行准备 core reference、账号、Source Document、5 条可证明 ProcessRuntime、180 条模拟岗位任务和来源驱动 Fact。同批只能精确创建或读回，半批或漂移阻断，不清理已有数据；读回忠实记录 40 / 50 项数据前置已证明、10 项浏览器检查和人工验收未完成。`full-acceptance` 仍只接受 clean exact commit 与服务端登记的隔离库环境，复用统一 lifecycle 完成正式数据、50 项只读页面和四条异常真实写链，并在成功或失败后自动删库和读回零残留。该入口是 loopback、same-origin、CSRF 和本机操作系统用户边界，不进入正式 ERP 菜单、RBAC 或生产制品。

验证：target policy、固定控制器、operation store、Vite Bridge 与关联手工验收控制器 Node 合同 `230 / 230`，DEV 入口 / 工作台 / 生产制品 / 前端配置合同 `25 / 25`，文档与角色入口合同 `10 / 10`，`go test ./cmd/seed-core-demo-data`、Web 全量 ESLint / Stylelint、目标文件 Prettier 与 `pnpm build:committed`（`3341` modules）通过；生产制品扫描 `120` 个文本文件，不含 DEV / private 标记。真实 DEV 浏览器已读取登记目标为 `192.168.0.106:5432/plush_erp` 且 `scenario-demo=available`，覆盖选择、一键准备、可读确认 Modal、取消和受控同源模拟执行后的固定 V5 终态读回；模拟回执继续标明 `40 / 50`、10 项 browser-only gap 与人工验收未完成。浏览器验证没有执行 `scenario-demo --apply`、没有写数据库；验证产生的唯一待确认 operation 与幂等索引已精确移除，实时 summary 读回 operations 为空。

当前阻塞与下一步：日常造业务场景数据已可直接在页面选择 `业务场景演示数据 → 生成业务场景测试数据 → 确认生成`，不需要 `make dev_restart`；只有显式修改 Vite 凭据覆盖环境时才重启一次 `pnpm start`。当前完整验收档位仍因共享 dirty worktree 和未配置专用隔离库而单独阻断，不影响 `scenario-demo`。本轮未绕过 db-guard、未替其他 writer apply migration，也未执行任何 core / scenario seed；未提交、推送、部署或执行客户 UAT。Web 验证使用本机 Node `26.5.0`，高于仓库声明的 `24.14.x`，构建虽通过但不替代后续正式 Node / exact-SHA 发布证据；AGENTS.md 只读未改。

## 2026-07-29 生产异常处置命名与审批入口收敛

完成：把菜单、页头、dashboard、岗位帮助、权限展示、客户包目录和正式文档中的页面名称从容易被理解为“异常事件总览”的 `生产异常` 收敛为 `生产异常处置`，页签同步改为 `处置申请 / 待审批`。稳定 page key、路由、权限码、ProcessRuntime、Workflow 和 Fact usecase 均未改变。待审批页只读取 `production_exception_decision_approval`，岗位筛选按服务端流程合同收窄为老板；返工事实产生的独立 `production_exception` 来源提醒继续由任务看板和岗位任务端承接，不再写成该页审批任务。

结构化真源：页面 lineage 已改为正式 `production_exception_decision` 来源和 `production_exception_decision_approval` 任务组，生产订单超领与质检报废 / 在制让步仍通过现有 `submit_production_exception` 和 ProcessRuntime 启动链生成处置申请与审批。审批只记录决定或额度，报废 / 在制让步仍须生产显式执行或冲正，超领额度仍由正式领料消费。

验证：当前 Node `26.5.0` 下前端页面、菜单、岗位帮助、lineage、dashboard、试用 smoke 和客户文档定向测试 `124 / 124`，Web ESLint、Vite production build（`3341 modules`）、服务端 `go build ./internal/biz`、目标 Go 文件 `gofmt -d` 和 `git diff --check` 通过。真实 Chromium 定向场景 `1 / 1` 通过并人工复核桌面申请页、桌面审批页、暗色和 `390 × 844` 四张关键截图；页签无横向溢出且任一时刻只挂载一张业务表。服务端 `go test ./internal/biz` 首轮通过；最终复跑时，共享工作区另一组导航设置改动已把 `NormalizeRoleNavigationSettings` 改为三参数，但其旧测试仍按两参数调用，测试包因此在非本轮编译错误处阻断。

下一步与风险：共享 dirty worktree 中并行写入的 `scripts/qa/database-target.mjs` 曾在 Vite 读取期间出现瞬时拼接内容，前两次 build 在非本轮语法错误处阻断；本轮未修改或回退该现场，writer 稳定后最终 production build 已通过。当前剩余共享阻塞仅是上述导航设置旧测试签名；未执行 full / strict、数据库写入、migration、提交、推送、部署、目标岗位实登或客户 UAT。

## 2026-07-29 开发测试覆盖证据采集与一键执行闭环

完成：修正开发测试入口“覆盖率全空”的证据链根因。原入口只聚合已有 JSON，没有运行 Go / Web 测试或生成当前工作区绑定的原始覆盖制品；现在新增 `test-coverage-collect.mjs --profile baseline --write`，在执行前冻结 repository identity 与 `affected` T0-T8 计划，使用仓库锁定的 Node / pnpm 运行 T0 静态、T1 文档、非 PostgreSQL Go coverprofile、Web lint / CSS / 含 pretest 的 Node native coverage、导入合同和字段联动专项，执行后再次核对同一 identity，再原子写入 baseline evidence 并聚合 latest。Go 业务域使用显式 `scenario id + package + test prefix` 注册表，字段联动打印域使用显式 caseId，不再按测试名、目录或关键词猜测覆盖；零执行、skip、失败、缺场景和运行期工作区变化均 fail closed。

一键执行：覆盖页现在以“一键采集覆盖率”为主动作，浏览器只提交固定 `collect + idempotencyKey`，不能传命令、参数、路径、环境变量或 profile。DEV Bridge 使用 loopback Host、same-origin、CSRF 和 exact JSON 合同，持久化私有 operation / 幂等索引并以跨进程排他锁串行启动固定采集器；只公开 10 个脱敏阶段，不保存或返回命令输出、PID、环境或幂等 key。字段联动 TAP / 报告、baseline evidence 和 candidate latest 先进入 ignored staging；候选 schema、repository、路径脱敏与读回通过后，按“证据先、latest 最后”原子提升，latest 提升后的 identity 复核失败会恢复旧报告。运行中按钮原位禁用，页面保留上一份报告并轮询进度；切换视图不会中断后台任务，重新进入可恢复读回，终态自动刷新。网络结果不明时再次点击复用同一 key，不重复启动；当前不提供取消，避免固定制品半写形成含糊终态。

证据边界：baseline 不写 PostgreSQL、不运行真实业务浏览器、不探测 readiness、不部署目标环境，也不替代客户 UAT；`affected` 要求但未执行的 T2 / T7 / T8 保持缺证据，只有未受影响层可显示 N/A。采集真实完成但存在失败、缺失或零执行时发布当前 identity 的 issues 报告，不能让旧绿色继续遮蔽；启动失败、服务 / 子进程中断、报告读回失败或仓库身份变化则记为 failed / not_proven 并保留上一份报告。通用 full / strict 聚合回执不再被拆成 PostgreSQL、浏览器或目标环境分别通过，只有绑定当前 clean commit 且携带制品摘要的专用回执可以补充对应项。

验证：Node `24.14.0` 下 operation store、固定 action / session / polling Bridge、幂等 / 跨进程锁 / 中断恢复 / identity fail-closed、采集器、工具链锁定、显式 QA 分组和前端 client / 页面合同定向测试通过；fast required-file 与 Node 分组登记合同通过。Web ESLint 零 warning、Stylelint、Vite production build（`3341 modules`）通过。真实 Chromium 的加载态、`390 × 844` 一键启动与运行中禁用、深色 current → 固定 action → completed → 自动刷新 → stale 共 `3 / 3` 场景通过，单次 POST、备用命令、暗色对比和无横向溢出均已断言，三张截图已人工复核。最后一项 tracked 修改落盘后执行一次完整 baseline；实际 Go / Web 数值及共享现场失败只写入 ignored coverage JSON，不复制为长期绿色结论。

边界与风险：本轮没有修改 schema / migration、业务 usecase、RBAC、客户配置或部署，没有写数据库、提交、推送、发布或执行客户 UAT。Style L1 首次因固定 Node PATH 漏列系统 `lsof` 而在端口检查前失败，补齐系统工具路径后由本轮自托管 `127.0.0.1:6175` Vite / Chromium 完成上述浏览器回归；该浏览器证据证明当前页面与受控 mock 交互，不证明全量真实业务浏览器、目标环境或客户验收。

## 2026-07-29 生产异常复合页签收口

完成：将生产异常页原先上下堆叠的“异常办理记录 + Workflow 审批任务”改为同一页头下的“异常办理 / 审批任务”同级页签。页签按有效权限显示，异常记录或任务深链优先打开对应页签；只有当前页签挂载并请求数据，页头统计、全局刷新、任务筛选与动作也跟随当前工作区，避免隐藏表格继续加载或把两套数量混在一起。异常办理仍读取正式 `ProductionExceptionDecision` 并执行生产异常领域动作，审批任务仍读取 `production_exception_decision_approval`；没有改变 Workflow task done 与 Fact / Source Document 执行分离的边界，也没有修改 schema、migration、RBAC、菜单或后端合同。


边界：本轮没有提交、推送、部署、目标环境岗位实登或客户 UAT；浏览器证据来自本地自托管前端与受控 mock，只证明当前 Local 页面合同和交互。

## 2026-07-29 GitHub CI/CD 去重与版本中心

完成：按 `docs/engineering/研发效能工作台与CI-CD实施计划.md` 收敛普通反馈、最终验证、制品发布和 133 promotion。普通 PR / push 只走 affected 或 full；strict 只由 clean exact SHA 的发布 workflow 触发，同 gate fingerprint 复用已有终态且失败不自动重启 lifecycle。GitHub-hosted Runner 负责一次 linux/amd64 Server / Web 构建并发布 GHCR digest、GitHub Release、manifest、SBOM 和 checksums；133 固定为 `test-133`，只允许 load、migration、启动和检查，不安装公开仓库 self-hosted runner，也不在目标机编译源码。

交付控制：新增 provider-neutral release catalog、固定目标 registry、私有 operation store、promotion / code-only rollback controller 与执行器。本地 DEV Bridge 只接受固定 GitHub workflow、固定仓库、固定 `test-133` 和 allowlist 动作，要求 loopback、同源、CSRF、JSON content-type、幂等键和单目标串行；浏览器不能传入 shell、SSH、路径、仓库、workflow、SQL 或 Docker 参数。执行前重新核对容量、目标身份、运行 SHA、数据库、备份、migration/config 指纹与 rollback point；结果不明进入 `not_proven`，不自动重试或 down migration。

工作台与交互：新增 `/__dev/version-center`，显示 clean/dirty HEAD、GitHub 不可变版本、133 当前 SHA、容量 blocker、版本新旧关系、准备部署 / 回滚、operation 详情和显式确认。真实 Chromium 已覆盖桌面、`390 × 844`、深色、无横向溢出、详情 Drawer、最近 100 条事件、确认 Modal、未输入完整确认文本时禁用执行、Escape 关闭与焦点回返；控制台错误 / 警告为 0，未提交确认文本，目标写请求为 0。验收时发现仅覆盖 Vite CLI `--port` 会让 HMR 仍连接旧端口；现增加 resolved listener / HMR 同端口启动门禁，错误配置在服务启动前失败，不再进入浏览器自动重载循环。

验证：发布 / promotion / rollback 定向合同 `50 / 50`，affected、exact-SHA、pre-push receipt、CI / Release workflow、工作台和生产边界合同 `118 / 118` 通过；Bash 语法、ShellCheck、ESLint、Stylelint 通过。当前源码只执行一次最终 production build（3341 modules），随后生产制品扫描 `120` 个文件通过，built-app Chromium 直达 `/__dev` 会回到 `/admin-login`，没有工作台、Bridge、DEV favicon 或本机路径残留。本地 managed output 的 5GiB 保留预览约为 `5,345,977,158` bytes，状态 `within_budget`；预览列出约 3.56GB 历史候选但故意没有删除入口，本轮未删除历史证据。

当前阻塞与边界：定向实现阶段没有在共享 dirty tree 运行 full / strict，也没有创建 GitHub Release、写入 GHCR / 133、执行目标 migration、岗位凭据 / PDF smoke、客户 UAT 或签收；后续 Git 收口状态只以实际 commit、远端 ref 和 CI 回执为准。133 只读预检显示当前可用空间约 `13.4GiB`，低于首次 promotion 的 `30GiB` 门槛；必须先完成 VM 快照、root LV 扩容和读回，再以唯一 clean candidate SHA 完成远端 exact-SHA 验证与不可变发布。production build 的本机 Web 目录默认 Node 为 `26.5.0`，仓库正式版本仍是 `24.14.0`；最终 GitHub Release workflow 固定使用正式 Node 版本，本地这次构建不替代远端 exact-SHA 证据。

## 2026-07-29 审批责任原子保存并生效

完成：定位销售订单选择 PMC 后提交报错的直接根因：前端把已达到 64 字符上限的 active revision 继续拼接时间戳后再截断，生成结果仍等于当前 active revision，后端按不可变 revision 合同正确拒绝覆盖。revision 已改为使用 128-bit 安全随机 UUID 的 32 位十六进制后缀，在 64 字符上限内保留可读前缀并保证新 revision 不复用；权限页收口为单一“保存并生效”动作。新增 `apply_approval_settings`，同时要求发布与启用权限，并在一个 PostgreSQL 事务内完成 active CAS、完整责任投影写入、published / active 状态切换和审计；任何一步失败全部回滚，不对其他会话暴露 building / published 中间态。通用配置控制面的 publish / activate API 仍保留，不改变其分阶段治理用途。

恢复与运行边界：前端在预览后冻结本次完整意图，提交结果不确定时先读取 authoritative active 配置，按 customer、revision、hash、product、status 和完整责任投影逐项确认；只有尚未生效时才使用完全相同的 revision 与 payload 重试，避免双写或把其他管理员的设置误认成成功。事务提交后新建业务流程使用新 active revision，已经创建且冻结配置的在途流程继续使用原 revision，不追改历史实例；日常调整写入运行时配置，不要求每次重新构建镜像。


边界：本轮没有改 schema / migration，没有写共享 `plush_erp`，没有提交、推送、部署、目标环境岗位 smoke 或客户 UAT。`affected.sh --plan` 因当前 139 个文件的共享现场含其他任务 migration / 全站改动而保守升级到 T8，本轮只采用上述定向、三包、production build、Chromium 和隔离 PostgreSQL 证据，不把共享现场的全量失败包装成绿色。

## 2026-07-29 本地标准 demo 账号固定密码恢复

完成：确认当前本地前端 `127.0.0.1:15200` 调用本地后端 `127.0.0.1:8300`，后端实际连接登记的 `192.168.0.106:5432/plush_erp`；migration 为 `104 / 104`、pending 0。此前公开测试密码虽有代码常量，但 seed 额外要求数据库名以 `_dev` 结尾，导致当前 `plush_erp` 不能使用默认重置；已有账号密码也不会因常量存在自动更新。现删除重复的 `_dev` 后缀门禁，继续复用登记本地开发库守卫，并把普通演示管理员 `demo_admin` 纳入十个标准账号；`demo_debug`、稳定超级管理员和三个人工验收账号仍不在默认范围，133、其他共享 / 试用、staging 和生产目标继续拒绝公开默认值。

运行与验证：已对上述精确目标执行一次 `seed-role-demo-admins.sh --reset-password`，回执为 `accounts=10`、`password_source=default`、十个账号均 `password_reset=true`。随后通过真实 `/rpc/auth -> me -> logout` 验证 `demo_boss`、八个其他业务岗位和 `demo_admin` 共 `10 / 10` 均可用 `12345678` 登录；全部 `disabled=false`、`is_super_admin=false`，普通岗位权限、桌面入口和调试权限边界通过。seed / devdbguard、data 层保护、角色文档合同和 MVP 命令合同定向测试通过，scripts 全量合同测试 `1449 / 1449` 通过。

边界：受影响规划因触及 Makefile 注释保守要求 full；full 在共享 dirty worktree 的非本轮 Workflow 改动处失败，精确错误为 `server/internal/service/jsonrpc_workflow_task.go` 的读取 scope 与 `customer-config-boundaries.mjs` 合同不一致，后续 Web / server 全量阶段未执行。本轮不修改该并行现场，也不把 full 写成绿色；未改 schema / migration，未触碰 133，未提交、未推送、未部署或执行客户 UAT。

## 2026-07-29 财务菜单认知边界收紧

完成：正式菜单入口 `finance-payments` 从“收付款与核销”收紧为“收付款核销”，并把产品默认、后端内置菜单、永绅客户菜单和财务岗位推荐顺序统一为应收在前、应付在后，三项关系表达为“应收管理 → 应付管理 → 收付款核销”。页面标题和页内 `收付款与核销 / 红冲处理` tab 保持不变；路由、权限码、客户菜单显隐、Workflow、Fact、schema 和 migration 均未改变。

验证与边界：Node `24.14.0` 下前端菜单 / 岗位导航定向测试 `39 / 39`、客户配置 / 文档定向测试 `60 / 60` 通过，服务端内置菜单与权限说明定向 Go 测试、目标文件 Prettier、ESLint、Stylelint 和 `git diff --check` 通过。真实 Chromium 在隔离端口完成财务系统推荐与自定义导航 `2 / 2`，覆盖顺序、新菜单名和横向溢出，两张截图已人工复核。未运行全量测试、未提交、未推送、未部署，也未执行目标账号实登或客户 UAT。



页面：两页统一使用 `BusinessOperationPanel`、`SelectionActionBar`、`BusinessDataTable`、`BusinessFormModal` 和 `BusinessRecordDetailsModal`；支持单击选中、双击详情、稳定分页、操作边界提示、加载 / 空态 / 失败恢复。任一客户、供应商、产品、仓库或批次参考接口失败不再清空核心业务记录。没有改 Workflow / Fact 分层、Source 状态机、RBAC、schema / migration 或客户专属规则，也没有新增退款、换货、银行流水、总账或税控语义。



## 2026-07-28 QA 证明循环收敛

完成：scripts Node 测试从递归全量发现改为 `fast / database / browser / release` 四组显式清单；当前 124 个 tracked 测试全部且仅登记一次，fast 只运行 57 个高频文件，full 一次覆盖四组。full 复用 fast 基础守卫时不再重复随后由 Web 全集和 server 全集覆盖的 Web 合同、lint / css 与 server quick；strict 先跑独有 shell / YAML 检查，再以 strict profile 单次执行 full，前端零 warning、扩展 Chromium 视口和严格 govulncheck 各执行一次。

停止条件：开发期只跑 affected、同名测试和受影响单链浏览器；产品范围与 clean exact SHA 冻结后，同一候选只执行一轮完整 lifecycle 和一轮 prepare-push。只有影响生产正确性、安全、数据完整性、权限或可恢复发布的缺陷才允许改候选并重新进入 affected；不使生产结论失效的 fixture、mock、选择器、测试文案、开发工作台和证据展示问题转为后续事项。会话 `019fa48a-0088-7142-a8a5-3c079cffe6f1` 因已命中候选变化后反复补 QA / 重跑全套的循环而终止，相关测试、隧道和临时容器已清理，现场保留。

验证：Node `24.14.0` 下编排 / profile / PostgreSQL 门禁合同 `26 / 26` 通过；新的 fast Node 组实际运行 `473 / 473`，失败、跳过均为 0；脚本语法、显式清单 124 / 124 唯一覆盖和分组 list 检查通过。按本次治理目标未运行 full、strict、lifecycle、真实 PostgreSQL、Chromium、CI、部署或客户 UAT；未删除现有历史失败证据。

边界：本轮未改业务 runtime、Workflow / Fact、RBAC、schema / migration、客户配置或部署脚本；没有提交、推送、迁移、发布或触碰 133。共享 dirty worktree 的其他任务现场原样保留，最终 Git 收口仍需单一 owner 审查并精确暂存本轮范围。

## 2026-07-28 admin 工作台任务读取权限修复

完成：桌面工作台新增独立的 `list_workbench_role_tasks` 只读合同，要求当前有效会话同时具备工作台与 Workflow 任务读取权限，并且只能查询客户配置投影到当前会话的有效岗位；主管 / 超级管理员的只读可见范围继续复用现有 Workflow scope。工作台不再复用手机岗位任务接口，因此 admin 没有显式手机岗位时不会因汇总桌面待办而收到“权限不足”。原 `list_role_tasks`、手机岗位分配门禁、任务办理动作、Workflow / Fact 边界均未放宽；没有新增权限码、客户配置、schema 或 migration。

验证：服务端 `internal/biz`、`internal/service`、`internal/server` 定向 Go 测试通过；Node `24.14.0` 下相关前端 / mock / QA 合同 `81 / 81`、Web 全集 `1892 / 1892` 与 `pnpm lint` 通过。重启本地开发服务后，health / ready 均正常；复用现有 admin 登录态打开真实工作台，开发模式下捕获的 `36 / 36` 次 `list_workbench_role_tasks` 均为 HTTP 200、业务码 0，旧 `list_role_tasks` 调用为 0，页面无“权限不足”；手机仓库岗位入口仍显示“当前账号未分配业务岗位”并在请求任务列表前失败关闭。

边界：`affected.sh --plan` 因共享 dirty worktree 中其他任务同时涉及 migration、数据库和全站文件而升级到 T8，本轮没有把其他 writer 的现场混入 full / strict 结论；只报告上述定向、Web 全集和本地运行态证据。未提交、未推送、未部署，未执行目标环境账号 smoke 或客户 UAT。

## 2026-07-28 甲方正式汇报 V3 集中解读

完成：新增 `docs/customers/yoyoosun/甲方正式汇报V3逐页解读与现行映射.md`，逐页转写 `plush_factory_formal_report_v3_mobile.pdf` 的定位、老板总览流程、业务 / 老板 / PMC / 生产经理桌面与手机示意、管理价值和三期建议；第 4 页按原图保留完整 Mermaid，同时把 PDF 原稿、甲方确认、当前 Product Core 映射和交付状态分层。`需求线索.md` 删除重复大图，只保留 D-006 已确认生产基线并回链集中稿；客户 README 和文档清单已同步入口。

验证：原 PDF 8 页已完成文本和逐页画面核对；活动 Markdown 清单与本地链接 `3 / 3`、永绅角色 / 流程文档守卫 `10 / 10`、集中稿 Mermaid `1 / 1` 和定向 `git diff --check` 通过。

边界：本轮没有改变甲方决策、角色权限、客户配置、ProcessRuntime、领域 Fact、schema / migration、部署或 UAT 状态；客户私有原件与 manifest 未修改，也未把 hash、访问路径或示意数据复制进 Product Core。

## 2026-07-28 登录页样式回归修正

完成：确认 `65fb19cf` 在隔离研发效能工作台样式时，把夹带正式登录页规则的 `dev-prototypes.css` 整体迁入 DEV-only 目录，导致正式入口丢失满屏背景、居中和 `620px` 卡片上限。登录与工作入口页共享样式已拆回 `web/src/erp/styles/app/login.css`，正式入口显式加载；DEV 样式删除重复登录规则，未把研发工作台重新引入生产包。

门禁：Style L1 新增卡片最大宽度、水平 / 垂直居中、满屏背景几何断言；DEV / Product 样式边界禁止 `.erp-login-*` 留在工作台 bundle；production built-app Chromium 同样校验 `/admin-login` 的宽度、居中和视口覆盖。

验证：Web ESLint、Stylelint、Node `1889 / 1889`、边界合同 `5 / 5`、Vite production build 和 production DEV 零残留扫描通过；Chromium 登录页桌面、390×844 手机、暗色与登录方式切换 `3 / 3` 通过，并人工复核桌面 / 手机截图。当前执行 Node `26.5.0`，仓库声明 `24.14.x`，pnpm 有 engine warning；未部署、未执行目标账号实登或客户 UAT，也未提交或推送。

## 2026-07-28 本地数据库执行对象退出

完成：新增 forward migration，精确删除 5 个自定义 Function 与 9 个非内部 Trigger；客户配置唯一写入口和 Workflow 跨实例锚点约束收回 Go 事务。`db-guard` 禁止新增 Function / Procedure / Trigger，启动、plan / apply 及隔离库均强制目录读回 `0 / 0 / 0`。

验证：`plush_erp` 为 `104 / 104`、pending 0、目录 `0 / 0 / 0`；556 个 internal Trigger 均为 FK。fresh、populated upgrade、关键 PostgreSQL `187 / 187`、Node `1448 / 1448`、Go 全包通过；`make dev_restart` 的 `8300 / 9300`、health / ready 通过。

边界：数据库超级用户手工 DDL 无法由仓库门禁物理阻止，属不支持操作；提交推送待确认，未部署、未执行客户 UAT。

## 2026-07-28 研发效能工作台与本地质量交付收口

完成：状态合同收敛到服务端 canonical catalog，当前 34 类状态对象、初始 / 终止 / 返回边、守卫、动作、权限与 Fact 边界由正式领域合同生成，DEV 观察台只消费投影；状态漂移守卫覆盖 8 条代表业务路径。异常展示按阻塞、退回、恢复、取消 / 冲正和过期证据分类，不新增万能 `exception_status` 或第二棵状态树。Workflow 任务来源读取门禁与异常动作在解释和写入前均由后端重验，页面不能以菜单、标签或 payload 补造可读性，Workflow task done 仍不等于 Fact posted。

工作台：开发能力迁入 `web/src/dev-workbench/`，一级信息架构固定为总览、产品工程、质量验证、交付运行；正式 router 只保留 compile-time DEV bridge，业务页面、移动端、产品配置与 server runtime 对工作台零依赖。工作台搜索、状态域、对象、异常类型、环境与详情写入 URL，支持深链、前进 / 后退、失败关闭、旧请求失效、键盘焦点、暗色和代表视口；真实 Chromium 代表场景 `11 / 11` 通过，写请求为 `0`。production build 的 import、路由、chunk、source map、HTML / CSS / JS / asset 和 production preview 零残留扫描通过。

桌面布局修正：产品工程、质量和交付区域页不再把无图标卡片正文放进固定 `40px` 图标列，区域卡片以显式无图标修饰类占满单列。Node `24.14.0` 下 Web 全集 `1889 / 1889`、ESLint、Stylelint 和三项真实 Chromium 回归通过；桌面暗色产品工程卡片正文为 `518px / 542px`，标题横排、无横向溢出，暗色总览与 `390px` 移动端相邻状态同步通过。本修正未改原型、后端、RBAC、schema / migration、Workflow 或 Fact。

质量与数据库：新增统一 receipt schema、脱敏 wrapper、private HMAC pre-push receipt、门禁 profile 与 CI 编排，严格区分 passed、failed、blocked、skipped、partial、stale 和 notProven。固定本地验收库改为每次唯一的 `plush_erp_acceptance_<run>_dev` 与 `plush_erp_acceptance_<run>_browser_actions_dev`；统一生命周期 runner 串联建库、Atlas migration、正式 seed、九岗位数据、50 项真实浏览器只读检查、克隆隔离、4 条异常真实写链、领域读回和最终精确清理，任一步失败仍先固化脱敏回执再清理，残留库会使运行失败。loopback 隔离实例上 24 个已证明归属的旧测试库已逐库生成 manifest、归档并删除，收口读回没有残留测试库；长期开发库仍只有登记的 `192.168.0.106:5432/plush_erp`。

稳定性与交付：容量数据集只写 5000 条 Workflow、2000 条生产草稿、2000 条财务草稿和 1000 条附件元数据，不把草稿或模拟数据包装成 Fact。真实隔离 PostgreSQL 基线为 ramp `100 / 100`、capacity `1000 / 1000`、recovery `100 / 100`，错误、死锁、冲突与残留锁等待均为 `0`，capacity p95 `117.28ms`、p99 `171.43ms`，持久幂等读回严格为一条；容量库已完成归档、restore drill 与清理。新增 exact-SHA 不可变制品 bundle / verify 和本地 release rehearsal，固定 linux/amd64 server / web 镜像、digest、SBOM、migration 序列、客户包来源、secret scan、备份恢复、migration、health / ready、登录、PDF、重启与清理合同；目标机只允许 load、migration、启动和检查。

提交前验证：Node `24.14.0` 下新增 / 受影响脚本合同 `178 / 178`，seed / dev DB guard Go 定向测试通过；工作台 Style L1 `11 / 11`、开发入口定向合同 `17 / 17`、production build 与 production DEV boundary 通过。`bash scripts/qa/fast.sh` 从头完成，server quick `2996 / 2996`，零失败、零跳过；最终 dirty tree 的 `bash scripts/qa/full.sh` 从头完成，scripts Node `1427 / 1427`、Web 合同 `207 / 207`、Web 全集 `1889 / 1889`、server all `3156 / 3156` 均为零失败、零跳过，生产构建、DEV 零残留浏览器检查、Style L1、populated upgrade、隔离 PostgreSQL、构建和清理均通过。首轮漏洞门禁发现当前代码可达 `GO-2026-6061`，已将 gRPC-Go 从 `1.81.1` 升到修复版本 `1.82.1`；最终 govulncheck 确认可达漏洞为 `0`。扫描器仍报告依赖图中 1 个 imported-package 与 15 个 required-module 漏洞当前不可达，不将其包装为“整个依赖图零漏洞”。没有 schema / Ent / Atlas migration 变更。

执行期修正：提交后的首次本地生命周期在 fresh 库发布客户配置时，被新增的审批责任岗位门禁以“所选岗位当前没有可办理员工”正确拒绝；失败回执显示 migration、runtime identity 已通过，两个批次库均已清理且残留为 `0`。根因是旧顺序把正式模拟岗位账号放在客户配置之后，形成 fresh database 初始化死锁。统一入口现先在 exact runtime identity、数据库、环境、super admin、目标确认和账号确认下通过 `admin.create` 创建或核对十个固定单岗位账号，再发布客户配置；dataset role 阶段仍会二次核对账号并补齐权限与仓库范围，不放宽客户配置发布门禁，也不直写账号表。该修正需绑定新的最终 clean HEAD 从头重跑生命周期与全部发布门禁。

下一步与边界：实现落盘后必须在最终 clean HEAD 真实执行本地验收生命周期、full、strict、prepare-push、非强制推送、exact-SHA 远端 CI、不可变制品构建 / 校验、本地发布演练及 133 技术发布；这些运行证据写入 ignored receipt 和正式发布 evidence，不为补记运行结果再制造与已部署 SHA 不一致的提交。本节不证明尚未执行的目标动作，也不证明客户真实数据导入、岗位人工 UAT 或签收。当前无已知代码阻塞；外部 target / CI / SSH / secret / 运行身份若无法从正式入口证明，发布流程必须失败关闭并保持最后一个已验证版本。

## 2026-07-28 Workflow 任务来源读取门禁

完成：工作台、任务看板和业务看板继续按责任、指派、阻塞与逾期展示协同任务，不再用来源菜单权限过滤任务本身。服务端新增权威来源关联与当前账号来源读取门禁：只有完整 ProcessRuntime 锚点或受信任业务生产者签名可证明真实来源，普通 `source_type / source_id / source_no` 标签不能证明已关联单据；非催办状态动作在解释和最终写入前都重验来源读取权限，break-glass 不绕过，`urge` 继续独立可用。转交候选也必须具备来源读取能力；来源读取可来自候选账号另一个启用岗位，但 Workflow 办理权限仍必须由任务责任岗位自身满足，不能跨岗位拼接。

前端：所有“查看相关单据”入口统一要求后端 `source_access` 明确允许、已登记页面路由和当前有效菜单投影同时成立；任务行标题、双击、详情面板、抽屉与业务看板风险卡片不再形成旁路。无来源读取权限时任务与上下文仍可见，只显示只读原因；若仅可催办，主按钮明确显示“催办”。后端缺失或返回畸形来源投影时前端失败关闭。同步更新当前真源、永绅角色矩阵和任务指挥中心原型说明；没有新增、重命名或重分类长期文档，因此文档清单无需改动。

验证：服务端 `internal/biz`、`internal/service`、`internal/data` 定向测试通过；前端定向 Node 测试 `92 / 92`、ESLint、目标文件 Prettier、脚本语法检查和 Vite production build 通过。真实 Chromium + 受控 mock 的全局工作台、任务看板和业务看板场景 `3 / 3` 通过，覆盖“菜单与读取权限存在但没有权威来源锚点时仍不显示入口”、任务抽屉 / 双击和风险卡片旁路。追加的出货放行只读场景两次都在 Vite 启动前被共享工作区另一任务并发写入中的 `scripts/qa/dev-workbench-receipt.mjs` 语法中间态阻断，未执行页面断言；该场景脚本本身已通过 `node --check`。前端全集为 `1880 / 1883`：三项失败均来自同一 DEV workbench 迁移后，旧测试仍读取已删除的 `DevCustomerConfigPage.jsx` / `devCustomerConfigRoute.mjs`，与本轮 Workflow 文件无关；当前命令使用 Node `26.5.0`，仓库要求 `24.14.x`，pnpm 对此给出 engine warning。

边界：Workflow task done 仍不写 Fact。ProcessRuntime 初始具名候选仍按冻结 revision 的 Workflow 责任配置选择；若该责任配置中的人员缺少来源读取权限，任务会继续可见但不可办理，需要修正配置或由具备 `workflow.task.assign` 的管理者转交给同责任岗位且可读来源的候选。本轮没有 schema、Ent、Atlas migration 或数据库变更，未执行数据库 apply、部署、目标账号登录 smoke 或客户 UAT，也未提交或推送。共享工作树同时存在其他任务的大量 DEV workbench、migration 和治理改动；上述验证只作为本轮定向证据，不把整棵 dirty tree 包装成完整 T8 绿色。

## 2026-07-28 本地开发数据库统一与运行态闭环

恢复点：使用 PostgreSQL 18 客户端把 `trade_erp`、`plush_erp`、`plush_erp_simon_dev` 及十个历史 acceptance / archive 库分别备份到 `/Users/simon/Backups/erp-local-db-consolidation/20260727T170955Z`。13 个 custom-format archive 均通过 `pg_restore --list` 并记录 SHA-256；`plush_erp`、`plush_erp_simon_dev`、`trade_erp` 又分别完整恢复到一次性隔离库并成功查询，随后删除隔离库。旧 PostgreSQL 14 客户端在版本检查阶段失败的零字节产物已立即删除，没有被当成恢复点。

数据库统一：精确核对备份 manifest 与实时数据库清单后，逐个强制断连并删除十二个 `plush_erp*` 旧库，再按原 owner、UTF8 和 `en_US.utf8` locale 重建唯一 `plush_erp`。本机 ignored `server/configs/dev/config.local.yaml` 已从 `plush_erp_simon_dev` 切回正式默认 `plush_erp`。空库通过正式 migration plan 完成 102 条 migration / 648 条 SQL 的整链事务回滚预演，再以 `tx-mode=all` 整批提交；最终 status 为 `102 / 102`、pending `0`，Ent / PostgreSQL schema 同目标零差异并返回 `applied_verified`。旧库数据只保留在上述备份中，没有猜造 582 条历史事实的 actor。

迁移校验修正：Atlas 在零差异时会输出 `Schemas are synced, no changes to be made.`；旧包装器把这条成功提示误判为 drift，导致 migration 已提交后返回 `committed_unverified`。包装器现在只把空输出或该精确成功提示识别为零差异，其他输出继续 fail closed；数据库已是 latest 时再次执行 `make migrate_apply` 只做同目标 schema readback 并返回 `applied_verified`，不会重放 revision。migration / runtime / Makefile 定向测试 `19 / 19`、Prettier 与 `git diff --check` 通过。

运行态：`trade_erp` 的最后一条 `20260727223000` 已在同一备份与停写窗口内完成 plan、事务回滚预演、整批 apply 和 `db_schema_check`，最终 `20 / 20`、pending `0`。两个项目均实际执行 `make dev_restart` 并保持运行：plush HTTP / gRPC 为 `8300 / 9300`，trade 为 `8100 / 9100`；两边 `/healthz` 与 `/readyz` 均为 HTTP 200。未提交、未推送、未部署，也未执行 133 / 生产数据库变更或客户 UAT。

## 2026-07-27 开发库 migration 事务预演与整批 apply 门禁

完成：开发入口从直接 `migrate_apply` 收口为 `migrate_status → migrate_plan → migrate_apply → 同目标 status / schema readback`。status 绑定脱敏目标和 PostgreSQL cluster identity；plan / apply 使用 Git 内部路径的本机串行锁，冻结 migration 快照，执行既有 populated-upgrade / customer-config-cutover 审计、operational fact lifecycle 只读审计、Atlas `tx-mode=all` dry-run，并在单个 PostgreSQL 事务内真实预演全部 pending SQL 后强制 `ROLLBACK`；apply 重新核对目标、pending revisions、migration hash 与包装器 / 审计 / Ent schema 指纹，重跑门禁后才以 `tx-mode=all` 整批提交，只有同目标 `pending=0` 且 Ent / PostgreSQL schema 零差异才报告 `applied_verified`。apply 异常会继续读 status，区分 `apply_failed_no_revision_advance` 与 `committed_unverified`；确认值只接受当前命令环境，`.env` 残值无效。

目标边界：loopback `plush_erp*` 隔离库可使用开发入口；application config 精确命中的 `192.168.0.106:5432/plush_erp` / `plush_erp_*_dev` 识别为登记共享开发库，plan 前要求停止本仓库后端和其它数据库客户端，apply 前额外要求备份 / 停写维护确认。环境变量覆盖的远程库、133、生产和归属不明目标继续拒绝并转正式发布流程。启动预检保持只读，只给出 status / plan 的纠正顺序，不自动 apply。

当时数据诊断：`plush_erp_simon_dev` 已由旧的逐文件 apply 推进到 `20260726173924`，仍有 `20260726173943` 与 `20260726174057` 两条 pending；只读核对发现 finance `270`、production `221`、outsourcing `91` 条既有事实缺精确生命周期 actor / cancellation audit。仓库没有足以逐行证明这些 actor 的权威来源，因此当日没有自动回填、放宽约束、`migrate_set`、继续 apply 或重建数据库；后续处置见上方 2026-07-28 记录。

当日验证：最终代码的 migration / runtime / Makefile / SQL 定向 Node 测试 `26 / 26` 通过；项目 `bash scripts/qa/fast.sh` 从头通过，递归发现的 `109` 个 scripts 测试文件、Web 合同 `201 / 201`、ESLint、Stylelint 和 server quick `2977 / 2977` 均零失败。真实 `migrate_status` 在当日 plan 前后都保持 `100 / 102`、pending `2`；真实只读 plan 依次通过 populated-upgrade 与 customer-config-cutover 审计，再以 finance `270`、production `221`、outsourcing `91` 的 operational fact blocker 失败关闭。当日未对共享开发库执行持久数据库写入；后续经明确授权的重建与 apply 见上方 2026-07-28 记录。

## 2026-07-24 全站选择记录动作稳定性治理

完成：正式业务列表页统一采用四类动作可用性合同：无权限、客户配置未开放或产品无能力时隐藏；有权限但未选择、临时前置条件不足或请求处理中时置灰并提供可聚焦原因；动作已完成、记录处于终态或当前来源结构不适用时隐藏并由状态表达结果；“更多操作”没有实际可用项时隐藏。`SelectionActionBar` 的桌面顺序、平板 / 手机固定优先级、更多操作 Drawer、键盘可聚焦禁用原因、生命周期主槽和更多操作槽已收敛到共享实现；不再出现没有原因的灰色按钮，也不再用只读权限显示写动作名称。


质量检验：写操作统一为“ 不合格处置 ”，按来源和来源单状态路由到首次来料退厂 / 补换、已入库采购退货、委外返厂 / 返工或生产异常处置。只有对应写能力才显示该入口；仅有委外读取权限的 demo_boss 不再看到永久置灰的“委外返厂 / 返工”，无选择时显示带原因的“查看委外处置”，选择不合格委外质检后可查看，选择来料、合格、已取消或其他不相关记录时隐藏。已生成采购退货后处置动作隐藏。浏览器同时发现并修正质检堆叠单元格在相同回退文案下的重复 React key。

权限与领域边界：移动任务页按后端 action explain 的 `required_permission` 与当前有效会话区分“无权限隐藏”和“有能力但当前任务暂不可办置灰”。本轮未改后端 RBAC、schema / migration、Workflow / Fact 写入、来源单生命周期或领域 usecase；Workflow task done 仍不等于 Fact posted。

验证：Web 全集 `1786 / 1786`、ESLint、Stylelint、Vite production build（`3333 modules`）、相关脚本 ESLint 和 `git diff --check` 通过。真实 Chromium 定向 `6 / 6` 覆盖无选择、无权限、loading / saving、销售五状态、采购 / 收货 / 质检 / 出货代表状态、桌面 / 手机暗色、终态隐藏、空“更多操作”隐藏、demo_boss 委外只读切换，以及首次来料与已入库采购退货共用统一入口；DOM 顺序、相对位置、控制台错误和横向溢出守卫通过，关键截图已人工检查。

边界：浏览器证据来自本地自托管 React + Chromium 与受控 mock RPC，只证明当前 Local 前端合同和运行态，不是目标账号实登、共享 / 133 / 生产数据库验证、部署、甲方 UAT 或客户签收。本机使用 Node `26.5.0`，仓库声明 `24.14.x`；本轮未提交、未推送、未部署。

## 2026-07-27 异常流完整收口与最终 Local 验收



迁移与生成：`make data` 连续执行保持 Ent / Atlas 零漂移；生成模型 diff 的 SHA-256 保持 `181ecc97c899c833cbaed5f3f6723abd2cb56f524a154fdf2b38f248c6680abf`。全新登记隔离库 `plush_erp_acceptance_local_browser_actions_20260727_v5_dev` 在 `192.168.0.106:5432` 完成 `migrate_status → migrate_apply → migrate_status`，populated preflight 通过，Atlas 为 `102 / 102`、最新 `20260726174057`、pending 0。没有对共享开发库、133、客户试用或生产数据库 apply。

浏览器验收：当前 Local 源码后端固定在独立 `8324`，yoyoosun Vite 固定在 `15215`；管理员从真实客户配置控制台点击应用，读回 active revision `yoyoosun-customer-package-v7.local-931c8fda75bc4b6a.runtime-v1`，active snapshot 恰好包含上述七条流程。完整角色 smoke 为桌面 `10 / 10`、手机业务岗位 `9 / 9`、管理员手机拒绝 1 项通过，10 个账号的 effective-session 诊断均来自 active revision 且 blocker 为 0。


验证边界：定向 Go、Node、文档合同、`db-guard`、`go test ./...`、`go build ./...`、前端单测 / lint / CSS / production build、真实 Chromium、shell / YAML / 漏洞检查均已在当前实现阶段通过。最终仓库门禁固定为在本节落盘后的同一工作树执行 `bash scripts/qa/strict.sh`；本文件不预写该命令的绿色结果，最终交接以终端回执为准。当前没有提交、推送、部署或 Handoff 后 Git 收口，133 / 生产 migration、目标 readback、真实客户数据导入、甲方 UAT / 签收仍未执行。

## 2026-07-27 审批责任岗位候选与权限失配提示

完成：审批责任弹窗不再过滤后裸露 `sales` 等原始岗位 key。已保存但停用、缺少审批功能、没有启用员工或已经不存在的岗位会保留为不可选项，并使用中文岗位名和原因回显；当前只有一个可承接岗位时，页面明确说明备用、升级可留空，同一岗位池已占用时直接标明所在责任层级。岗位池或指定员工重复承担多个层级改为候选禁用、字段校验和保存兜底三层提示。服务端发布检查同步读取持久化岗位状态与 `workflow.task.approve`，缺权、停用或不存在的岗位不能通过前端外的调用发布。

验证：affected 计划判定为 T0 / T1 / T4 / T5；服务端 `go test -count=1 ./internal/core/... ./internal/biz ./internal/data ./internal/service ./internal/server`、Web ESLint、定向 Node `5 / 5`、脚本语法与 `git diff --check` 通过。真实 Chromium `3 / 3` 覆盖未初始化、正常发布 / 启用和持久化岗位权限漂移；漂移场景确认“业务（未开启审批功能）”、唯一可用“老板”、跨层占用原因、字段错误、弹窗居中、无横向溢出和零未声明控制台错误，截图已人工检查。

边界：本轮没有自动给业务、采购或财务岗位扩权，也没有修改数据库、已发布 revision 或在途流程；当前失配配置需要管理员在岗位设置中恢复审批功能，或把责任改到现有合格岗位。浏览器证据来自本地自托管前端与受控 mock，只证明当前 Local UI 合同；未部署、未执行目标账号实登或甲方 UAT。本机使用 Node `26.5.0`，仓库声明 `24.14.x`。

## 2026-07-29 岗位常用工作与更多功能双列表配置

完成：权限中心“页面与导航”已支持按岗位手工维护有序的“常用工作”和“更多功能”，常用工作保留 `1–5` 项，其余当前最终可进入页面必须完整且不重复地进入更多功能。撤销权限或客户能力后旧入口会从草稿与运行菜单移除，新获得的页面会稳定追加到更多功能；看板仍固定在前、岗位帮助仍固定在最后，多岗位账号按 authoritative effective-session 岗位顺序确定性合并。菜单布局只负责位置与顺序，运行时继续与最终页面权限相交，不会因移动菜单获得权限。

页面组织补充：“页面与导航”新增二级“菜单布局 / 页面可用范围”，默认进入可编辑的菜单布局；页面可用范围保持只读，提供全部、可进入、不可进入筛选和最终原因，精确客户配置版本降级为按需查看。切换二级 Tab 不会重置权限、范围或双列表草稿，也不会重复请求权限解释；“常用工作 / 更多功能”继续在桌面并排、手机堆叠，不再增加第三层 Tab，保存仍统一使用岗位头部唯一动作。

后端与持久化：`roles` 新增 `secondary_menu_paths`，Atlas migration 为 `20260729043852_migrate.sql`。旧的权限、数据范围和菜单三段保存入口已收口为 `set_role_settings`：完整权限、仓库范围、导航模式、两组路径和 `expected_version` 在同一个 PostgreSQL 事务、一次 CAS 版本递增和一条 `role.settings.set` 审计中提交；任一步失败全部回滚。自定义布局保存前按本次完整权限预览最终客户页面，要求双列表精确分区；持久化异常布局读回时失败关闭到系统推荐。页面整页刷新会按角色与版本读取服务端布局，并发冲突刷新则保留权限、数据范围和两组菜单的整份本地草稿。

验证：`make data` 复跑显示 migration 目录与 Ent schema 零漂移，`bash scripts/qa/db-guard.sh`、`go test ./...`、Web ESLint、Stylelint、`build:committed` 及定向 Node 回归 `128 / 128` 通过。真实 Chromium 定向 `5 / 5` 覆盖桌面双栏键盘移动与排序、一次完整聚合请求、保存成功、整页刷新后服务端原值读回、移动端暗色无横向溢出、销售与财务岗位推荐菜单及财务自定义运行菜单；关键截图已人工复核。一次性 PostgreSQL 18 隔离库完成全部 `105 / 105` migration 并读回 pending 0，双并发同版本聚合保存验证只有一个 winner、另一个 CAS 冲突，最终权限、数据范围、双列表布局、version 与审计均来自同一个 winner；测试数据库和容器已删除。

二级 Tab 增量验证：Web lint、CSS 门禁和 production build 通过，定向 Node `80 / 80` 与 style-l1 场景合同 `17 / 17` 通过；真实 Chromium 桌面 / 移动端 `2 / 2` 证明默认 Tab、筛选结果、配置版本按需查看、切换后草稿保持、零重复权限解释请求、暗色主题和页面无横向溢出，截图已人工检查。本轮没有改变后端、schema、RBAC 或保存合同。

边界：migration 已生成但未对本地共享库、133 或其他目标 apply；本轮没有部署、目标岗位实登或客户 UAT，也没有提交或推送。当前本机 Node 为 `26.5.0`，仓库声明 `24.14.x`，上述前端检查虽通过但不替代后续正式 Node 版本与 exact-SHA 发布证据。

## 2026-07-29 共享开发库数据库迁移工作台

完成：研发效能工作台新增 `/__dev/database-migration`，把登记共享开发库的手工 `status → plan → apply → readback → dev_restart` 收口为“检查并准备 → 输入当前完整确认串后执行”两步交互。浏览器只提交固定 action、幂等键和 operation ID，不接收 DSN、目标、命令、SQL、脚本路径、凭据或环境变量；当前只允许 application config 登记的 `192.168.0.106:5432/plush_erp`，不支持 133、测试或生产数据库。prepare 固定完成 status、停后端、plan、备份恢复演练和最终身份复核；execute 只 apply 一次，再读回 `pending=0`、重启后端并检查 health / ready。

防重复执行：operation 使用 `0600` 原子状态、幂等索引和跨 Vite 进程排他锁；进程中断且写入结果不明确时标记 `not_proven`，先读回而不自动重试。计划指纹只覆盖 migration、schema、guard、备份和编排真源，不因无关工作区文件变化失效；目标状态仍必须精确一致。相同真源和目标下，只有备份恢复报告通过且 dump 的常规文件身份、大小和 SHA-256 再读回一致时才复用。页面不运行 affected、fast、full、strict、完整验收 lifecycle 或 CI；后端只在已确认 apply 后重启一次，数据库已到 head 时不为了证明绿色重复迁移、备份或构建。

验证：项目 Node `24.14.0` 下 operation、runtime、Bridge、安全输入、测试分组和门禁 profile 定向 `32 / 32`，开发路由、工作台边界、文档清单、导航与可见文案 `26 / 26`，完整相关合同组 `43 / 43`；Web 全量 ESLint、Stylelint、新文件 Prettier 和 scoped `git diff --check` 通过。真实 Chromium 已检查实际默认页的桌面和手机布局、实际只读状态，以及仅拦截 summary GET 的 ready / 完整确认 Modal 展示；没有提交确认、没有调用真实 prepare / execute，控制台错误和警告均为 0。

运行读回：共享开发库 current / latest 均为 `20260729043852`，Atlas `105 / 105`、pending 0；后端 health / ready 均为 HTTP 200。因此本轮没有制造新 migration，也没有执行备份、apply、数据库写入或后端重建。下次真实出现 pending 时从本页按两步操作；若其它数据库客户端占用、真源变化或结果不明确，页面停在精确 blocker / `not_proven`，先排除占用或读回同一 operation，不另起一轮盲目重跑。

## 2026-07-29 收付款核销页签归属统一

完成：收付款核销页不再把页签作为页面级独立横条悬在说明卡与操作区之间，改为复用 `BusinessDataTable.tableHeader` 放入数据表卡片顶部，与库存台账的视图归属保持一致。页面标题继续使用“收付款与核销”，两个视图页签收窄为“收付款记录 / 红冲记录”；筛选、当前记录动作、登记收付款、登记红冲、详情、核销、冲销和恢复逻辑均保持原有视图边界。本轮没有新增样式或页面壳，也没有修改 API、RBAC、菜单、Workflow、ProcessRuntime、Fact、schema、migration 或客户专属配置。现有通用业务列表原型仍能表达该结构，没有新增或改写原型资产。


边界：浏览器证据来自本地自托管 React、受控 mock RPC 与 Chromium，只证明当前 Local 前端布局和交互合同，不是目标账号实登、部署或甲方 UAT。当前使用 Node `26.5.0`，仓库声明 `24.14.x`；本轮未提交、未推送、未部署。

## 下一步与停止条件

### 2026-07-28 研发效能工作台与本地质量交付收口

完成：研发效能工作台、统一质量回执 / 预推送门禁、数据库目标身份与清理、容量基线、不可变发布制品、本地发布演练和全新库 lifecycle 已进入当前主线。真实全新库迭代依次修正正式账号初始化顺序、F02 来源读取、销售关闭权限、任务幂等键、Fact CAS 版本、成品质检与交付流程顺序、Shipment 放行事务、RPC 精确参数和 ProcessRuntime 责任权限；没有放宽质量、RBAC、CAS、幂等或 Fact 边界。

当前出货合同已收敛为 `出货单动作 → ProcessRuntime → shipment_finance_approval task/node → Shipment 放行门禁 → 正式出货 / 应收领域动作`。45 张已出货单、财务岗位页面、工作台、浏览器探针、事实报告和 readiness 均绑定同一审批任务与节点；公共建任务禁止伪造正式 task group 与 `PROC-` 任务码。当前 revision 为 `yoyoosun-customer-package-v7.local-8ab8deaa7b7e9c6f.runtime-v1`，试用执行手册数量已按同批读回更新为审批任务 `45`、库存余额 / 批次 / 流水 `193 / 211 / 496`。

最新 lifecycle 已完成九阶段 dataset apply、40 项可查询 readiness 且 0 项失败，随后在浏览器启动前发现 dataset 总回执只接受顶层路径、未接受 lifecycle 隔离根目录。浏览器现仅接受顶层 canonical 路径或单层合法 `lifecycle/<run-id>`，同时校验每个阶段的精确路径、摘要、批次身份和真实文件路径；任意嵌套根目录及外部符号链接均失败关闭，定向 Node `47 / 47` 与脚本语法、diff check 已通过。上述失败运行均保留脱敏回执并清理为零残留；最终提交仍须重跑全新库 lifecycle、全量门禁、精确 SHA CI、不可变制品、本地发布演练和 133 技术发布，客户 UAT / 签收单独保留。

随后绑定 `7dfbd11235141b5d00e29acfd0f69aedcec4a37c` 的 fresh lifecycle 已走完九阶段数据、readiness 与浏览器启动，50 个页面中 49 个通过；唯一失败是“生产异常”仍用已取消返工事实生成的 `production_exception` 来源提醒任务作为页面证据，而当前页面只查询正式 `production_exception_decision_approval`。本轮没有恢复旧任务组兼容，而是让 V5 从已发布生产订单物料需求提交 1 条 `OVER_ISSUE` 正式异常申请，由老板完成 `production_exception_approval`，精确读回 8 个节点、确定性 `PROC-<process>-NODE-<approval>-A1` 任务码、`APPROVED / PENDING` 决定及 1 件可消费额度。Fact 报告、readiness、页面数据合同、浏览器检索、客户手册与当前真源已统一；返工来源提醒继续只服务其原协同语义，不能冒充正式申请或审批。受影响脚本测试和自动发现的 124 个脚本测试文件均已通过；新的最终 clean SHA lifecycle 与发布全链仍待执行。


发布身份预检发现 133 当前激活的 V5 revision hash 为 `cc60f2462936777125206f55416ed60b95d0a195152418f271ca8b43459b8b3d`，当前 V7 内容按正式归一化合同计算为 `17e504945d066fcca973ab9a8463e5e1e26f517fa4630f856b8e6e32f9cf83bc`；同名 revision 内容不同会按追加式门禁失败关闭。133 目标 revision 因此升级为独立的 `yoyoosun-customer-trial-133-package-v7.runtime-manifest-v1`，数据合同与运行批次继续保持 `2026.07.16-v5 / 20260716-V5`，并同步目标策略、服务端守卫、凭据轮换合同、测试和客户交付矩阵。相关 Node 合同 `31 / 31` 与 Go 定向包均已通过；最终提交仍须重新绑定 fresh lifecycle、全量门禁、精确 SHA CI、不可变制品、本机发布演练和 133 激活读回。

升级启动复核进一步确认：若新后端在 V5 仍为 active 时只识别 V7，会在正式 API 切换前因启动检查失败。当前实现只在启动读回中接受精确的 V5 → V7 前置状态；validate、publish、transition 和 activate 仍只接受 V7，旧 V5 不能成为新写入别名。V7 激活后运行主路径只读取 V7；旧镜像回滚必须先由仍健康的新后端按正式 rollback 链切回 V5。服务端启动 / trial guard 定向测试和客户配置 Node 合同 `29 / 29` 已通过，切换与回滚顺序已同步到试用执行手册。

1. 发布前必须绑定最终 commit / image，按正式流程执行备份 / 回滚点、migration status / apply / readback、health / ready、真实账号与业务 smoke。
2. 客户交付仍须甲方岗位 UAT / 签收；本地或固定旧版本绿色不能替代。
3. 异常流 Worktree 暂保留为恢复副本；后续清理须单独确认目标和现场，不把 Handoff、提交或推送等同于 Worktree 删除。

## 归档索引

- `docs/archive/progress-2026-07-28-before-login-style-recovery.md`：登录页样式回归修正前的完整过程记录；归档前为 352 行 / 81,679 bytes，SHA-256 `0e8adf36af8650d5c00656c0eca06aeeb92b27e18e494a63099c326285f20685`。
- `docs/archive/progress-2026-07-23-before-exception-flow-v1-final-handoff.md`：本次异常流四项收口 Handoff 前的完整过程记录；归档前为 354 行 / 81,412 bytes，SHA-256 `7ecb190e0242aaf42a16d946eeb2045c4ddeba290f611f2bfe9d5452a8cfb4a2`。
- `docs/archive/progress-2026-07-18-before-source-lineage-draft-cancellation-closeout.md`：来源血缘和草稿取消集中收口前的完整过程记录。
- `docs/archive/progress-2026-07-17-before-workflow-source-task-producers.md` 与 `docs/archive/progress-2026-07-15-before-local-admin-default-policy.md`：更早完整过程记录。
- 其余历史过程记录索引见 `docs/archive/README.md`、`docs/文档清单.md` 和 Git 历史。
