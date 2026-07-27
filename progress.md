# plush-toy-erp progress

本文件只保留当前活跃事项、最近完成记录和归档索引；历史流水已完整归档到 `docs/archive/`。`progress.md` 是过程交接线索，不是正式需求、数据模型、迁移或部署真源。

## 当前活跃事项

- 当前真源入口为 `docs/当前真源与交接顺序.md`、产品能力台账、客户交付矩阵、当前代码、Atlas migration 和测试；截图、历史任务与本文件不能单独证明运行态。
- 单据流 / 业务流审计 Worktree 的 92 个任务归属路径已通过受控 Handoff 带回 Local；Local 原有的流程与状态观察台改动同时保留，起点继承内容没有被重复覆盖或误记为本轮新增。
- 本地开发数据库已统一为 `192.168.0.106:5432/plush_erp`；历史 `plush_erp_*_dev` / acceptance / archive 库完成逐库备份后删除，本地不再保留第二个 plush 开发库。133 V5 固定库 `plush_erp_uat_20260716_v5` 属于独立测试 / 目标环境，本轮未触碰。
- 133 当前 release、数据库、active config、镜像与回滚点必须在每次发布前从目标环境重新读回；历史记录只作定位，不得替代当前技术发布证据。客户 UAT / 签收始终是独立关口。
- 本轮 Git 与发布收口只能由单一 owner 串行执行；clean HEAD 的 full / strict / prepare-push、exact-SHA 远端 CI、不可变制品、本地发布演练和 133 技术发布必须绑定同一最终 SHA，以 Git、CI、制品 manifest 和运行回执为准，不由本文件预写绿色结论。

## 2026-07-28 研发效能工作台与本地质量交付收口

完成：状态合同收敛到服务端 canonical catalog，当前 34 类状态对象、初始 / 终止 / 返回边、守卫、动作、权限与 Fact 边界由正式领域合同生成，DEV 观察台只消费投影；状态漂移守卫覆盖 8 条代表业务路径。异常展示按阻塞、退回、恢复、取消 / 冲正和过期证据分类，不新增万能 `exception_status` 或第二棵状态树。Workflow 任务来源读取门禁与异常动作在解释和写入前均由后端重验，页面不能以菜单、标签或 payload 补造可读性，Workflow task done 仍不等于 Fact posted。

工作台：开发能力迁入 `web/src/dev-workbench/`，一级信息架构固定为总览、产品工程、质量验证、交付运行；正式 router 只保留 compile-time DEV bridge，业务页面、移动端、产品配置与 server runtime 对工作台零依赖。工作台搜索、状态域、对象、异常类型、环境与详情写入 URL，支持深链、前进 / 后退、失败关闭、旧请求失效、键盘焦点、暗色和代表视口；真实 Chromium 代表场景 `11 / 11` 通过，写请求为 `0`。production build 的 import、路由、chunk、source map、HTML / CSS / JS / asset 和 production preview 零残留扫描通过。

质量与数据库：新增统一 receipt schema、脱敏 wrapper、private HMAC pre-push receipt、门禁 profile 与 CI 编排，严格区分 passed、failed、blocked、skipped、partial、stale 和 notProven。固定本地验收库改为每次唯一的 `plush_erp_acceptance_<run>_dev` 与 `plush_erp_acceptance_<run>_browser_actions_dev`；统一生命周期 runner 串联建库、Atlas migration、正式 seed、九岗位数据、50 项真实浏览器只读检查、克隆隔离、4 条异常真实写链、领域读回和最终精确清理，任一步失败仍先固化脱敏回执再清理，残留库会使运行失败。loopback 隔离实例上 24 个已证明归属的旧测试库已逐库生成 manifest、归档并删除，收口读回没有残留测试库；长期开发库仍只有登记的 `192.168.0.106:5432/plush_erp`。

稳定性与交付：容量数据集只写 5000 条 Workflow、2000 条生产草稿、2000 条财务草稿和 1000 条附件元数据，不把草稿或模拟数据包装成 Fact。真实隔离 PostgreSQL 基线为 ramp `100 / 100`、capacity `1000 / 1000`、recovery `100 / 100`，错误、死锁、冲突与残留锁等待均为 `0`，capacity p95 `117.28ms`、p99 `171.43ms`，持久幂等读回严格为一条；容量库已完成归档、restore drill 与清理。新增 exact-SHA 不可变制品 bundle / verify 和本地 release rehearsal，固定 linux/amd64 server / web 镜像、digest、SBOM、migration 序列、客户包来源、secret scan、备份恢复、migration、health / ready、登录、PDF、重启与清理合同；目标机只允许 load、migration、启动和检查。

提交前验证：Node `24.14.0` 下新增 / 受影响脚本合同 `178 / 178`，seed / dev DB guard Go 定向测试通过；工作台 Style L1 `11 / 11`、开发入口定向合同 `17 / 17`、production build 与 production DEV boundary 通过。`bash scripts/qa/fast.sh` 从头完成，server quick `2996 / 2996`，零失败、零跳过；最终 dirty tree 的 `bash scripts/qa/full.sh` 从头完成，scripts Node `1427 / 1427`、Web 合同 `207 / 207`、Web 全集 `1889 / 1889`、server all `3156 / 3156` 均为零失败、零跳过，生产构建、DEV 零残留浏览器检查、Style L1、populated upgrade、隔离 PostgreSQL、构建和清理均通过。首轮漏洞门禁发现当前代码可达 `GO-2026-6061`，已将 gRPC-Go 从 `1.81.1` 升到修复版本 `1.82.1`；最终 govulncheck 确认可达漏洞为 `0`。扫描器仍报告依赖图中 1 个 imported-package 与 15 个 required-module 漏洞当前不可达，不将其包装为“整个依赖图零漏洞”。没有 schema / Ent / Atlas migration 变更。

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

## 2026-07-26 Mermaid 全屏缩放修正

完成：共享 Markdown Mermaid 查看器进入全屏时固定从 100% 展示，不再自动放大到 140%，也不继承页面内已经放大的倍率；全屏内仍可继续缩放，退出后保留原页面内倍率。

验证：定向 Chromium 场景覆盖开发文档和项目治理地图的全屏打开、100% 标签与 DOM 缩放值、视口几何、退出恢复和可访问 dialog 语义；前端自动化与静态检查结果以本轮最终回执为准。

边界：未改 Mermaid 图源、页面布局、RBAC、Workflow / Fact、schema 或 migration，未部署、未提交、未推送。

## 2026-07-26 流程与状态观察台

完成：新增仅开发环境开放的只读“流程与状态观察台” `/__dev/status-flows`，从同一目录集中展示 34 类当前状态对象、初始 / 终止 / 可返回边、无终态策略、守卫、动作、权限、Fact 边界和代码证据。页面包含总览、单机状态图、全局状态字典树、流程编排 / 客户差异、运行轨迹 / 证据五种视图，并把业务流、状态流、工作流、审批流、任务流、异常流、通知流、自动流转和 Fact 九个观察维度放进统一筛选。状态图和流程图分别建模，避免把业务编排误当成单一状态机。

客户与运行态：产品核心编排目录覆盖 3 个流程 key、4 个当前变体；`demo`、`reference-customer`、`yoyoosun` 三个已注册客户包只以选择 / 差异覆盖层引用产品核心，不复制运行状态机，也不能覆盖 Product Core。运行轨迹继续复用现有 task-scoped `workflow.get_task_process_context` 只读合同；未知状态、未知机器、未知客户选择和不完整运行证据均失败关闭。页面没有拖拽改图、通用 `set_status`、任意脚本 / SQL 或其他写入口。

界面减负：根据页面复核反馈，代码 / 文档路径不再重复铺在每张迁移卡中，也不在客户摘要默认暴露。迁移卡只保留条件、动作、权限和 Fact 边界；状态机、状态、流程与客户包的实现依据按来源路径去重后收进一个默认折叠区，显示来源数量并支持键盘 Enter 展开 / 收起，仍保留完整可追溯性。

图面减负：状态图不再把源码路径、完整 Guard、动作类名、权限串或原始 Fact key 塞进 Mermaid 边标签；节点 key 和边标签都有长度上限，返回边使用“恢复”，全图层最多显示流向、审批 / 异常和简短 Fact 边界。普通页画布默认收在 `600px` 宽和约 `560px` 高内，全屏默认收在 `820px` 宽，仍可继续缩放；完整条件、权限、动作和来源继续在图下方的详情区查看。

验证：官方 `bash scripts/qa/affected.sh --run` 覆盖 T0、T1、T5，受影响文档合同 `12 / 12`、直接合同 `13 / 13`、Web 全集 `1817 / 1817` 均零失败。图面与界面减负后再次完成定向合同 `18 / 18`、Web 全集 `1817 / 1817`、ESLint、Stylelint、Prettier、生产构建（Vite `3336` 个模块）和差异检查；项目 Node `24.14.0` 下真实 Chromium 桌面、Workflow 全图层暗色与 390×844 暗色移动端场景 `3 / 3` 通过。Workflow 复现场景的普通图为 `600×479`，全屏图为 `820×654`，边标签最长 `15` 字符，技术路径 / 完整条件标签和几何重叠均为 `0`；桌面 body / document / root 宽度均为 `1440`，移动端均为 `390`，三种场景的写请求均为 `0`。默认折叠、展开证据、移动暗色及 Workflow 普通 / 全屏图定向截图已人工复核。

边界与下一步：本轮未改 schema、Ent 生成物、Atlas migration、后端写路径或 RBAC，没有数据库 apply、部署、目标岗位 smoke 或客户 UAT。观察台随本轮完整工作树统一执行 Git 收口，实际提交与远端 ref 以 Git 为准；观察台目录仍只是从当前真源整理出的开发投影与证据索引，不替代领域 usecase、Fact 表、ProcessRuntime 或客户配置真源，后续新增状态或编排时应先修改真实合同，再同步目录和守卫测试。

## 2026-07-24 至 2026-07-26 当前单据流 / 业务流重新审计

完成：当前新建 `material_supply` 图收窄为“采购 Source Document 提交 → 统一审批 → 唯一采购批准命令 → end”。采购正式页和所有仍使用采购造数的验收脚本共用同一个 ProcessRuntime helper，不再调用公开直提 / 直批方法；采购收货、IQC 和库存入库继续由各自正式页面和领域 usecase 负责。当前新建 `finished_goods_delivery` 图收窄为“财务 approval → Shipment 版本化放行门禁 → end”，启动前只重验已有成品质检；质检判定、确认出货、库存 OUT、应收、发票与收付款不再伪装成流程隐藏节点。旧长图只允许冻结在途 revision 恢复。

完成：通用 `settle_finance_fact` 只允许 `RECONCILIATION`，不能直接结清应收 / 应付；后两者只由 FinancePayment allocation、CreditNote 或冲正链改变余额。库存人工调整审批引用前后端统一为最多 128 字符。审批事项缺失或停用时新流程 fail closed，不回退默认老板池；独立 `purchase.order.approve` 权限已从 Product Core、永绅岗位配置和运行 manifest 退出，采购审批统一使用 `workflow.task.approve` 与任务冻结 revision / 责任池。

完成：移动岗位端增加真实多岗位切换，并把账号 `mobile.<role>.access` 与 active revision 对同一岗位入口的 effective action 作为双重门禁；super admin 不能凭管理身份冒充业务岗位。审批责任页刷新在覆盖未保存草稿前必须确认。Shipment 正式页在财务门禁未达到 `APPROVED` 前明确禁用确认出货。正式真源文档、客户矩阵、服务端 / 前端 README 与验收脚本已同步到相同边界。

范围量化：14 个审计切片中，当前 Product Core 代码边界已闭环 8 个、部分 4 个、因正式合同 / 数据缺失阻塞 1 个、当前 V1 范围外 1 个。部分项为 BOM / 工程、库存 / 预留、客户退货 / RMA、收付款页面与永绅投影；阻塞项为 PAYMENT 申请 / 审批和真实客户数据写入导入；银行直连 / 流水自动导入、总账和税控属于范围外。具体口径见产品能力台账，不能把部分 / 阻塞 / 范围外计为完整闭环。

验证完成：仓库锁定 Node `24.14.0`、pnpm `10.13.1`、Go `1.26.5`，本地临时安装 CI 同版 Atlas `0.38.0`、govulncheck `1.6.0` 和 shfmt `3.13.1`，并使用任务专属 `postgres:18.1` 容器。最终 `affected.sh --run` 为文档 `12 / 12`、直接合同 `160 / 160` 与 `79 / 79`、隔离 PostgreSQL 关键事务 / 并发 `192 / 192`，均零失败、零跳过；完整 Style L1 为 `184 / 184`，属于真实 Chromium + 受控 mock 的 `simulated_display_only` 前端覆盖。`make data` 前后 schema / Ent / migration / `atlas.sum` 差异哈希均为空树哈希，`db-guard` 通过，没有生成 schema、migration 或 Ent 漂移。

最终 `full.sh` 和 `strict.sh` 均从头完成：scripts Node `1337 / 1337`、Web 全集 `1807 / 1807`、server quick `2809 / 2809`、server all `2969 / 2969`、隔离 PostgreSQL `192 / 192`，全部零失败、零跳过；fresh migration 覆盖 `95` 条 migration / `622` 条 SQL，populated upgrade、ESLint、Stylelint、Vite build、shellcheck、shfmt、yamllint、零 warning 检查和 Chromium smoke 均通过，strict Chromium 为 `3 / 3`。首轮 full 暴露 6 条已过期的客户包 identity / 页面内联断言，修正为当前内容寻址 revision 和共享生命周期 action 合同后定向 `54 / 54` 通过；第二轮 full 又由当前漏洞库发现可达 `GO-2026-5158`，已把 OpenTelemetry `1.43.0` 升到 `1.44.0`，在真实 HTTP handler 增加超长 baggage fail-closed 回归，并以 govulncheck 复跑确认可达漏洞为 0。扫描器仍报告依赖图中存在未调用的 1 个 imported-package 与 15 个 required-module 漏洞，不包装为“依赖图完全无漏洞”。

Local 受控 Handoff 后重新验证：Codex App 自动 Handoff 在 detach / stash source changes 阶段失败且未触碰 Local，随后按任务归属路径和 3 个重叠文件做语义合并；原流程观察台、采购订单 in-flight 锁与行选择保护均保留。首轮跨层静态合同发现采购页仍运行较新的 `recordActionBusy`，但带回的旧断言只识别 `itemsLoading`；断言已修正为继续要求统一 busy guard，定向脚本复跑 `64 / 64`。最终 `affected.sh --run` 覆盖 T0、T1、T3、T4、T5、T6、T7：文档 `12 / 12`、直接合同 `201 / 201`、Web `1826 / 1826`、隔离 PostgreSQL 关键事务 / 并发 `192 / 192` 均零失败、零跳过，前端 CSS、lint 与三轮 Go 包测试通过；另在真实 Chromium + 受控 mock 中完成审批责任、未配置审批、采购、出货、多岗位手机端和流程观察台等 `11 / 11` 场景。只有任务专属隔离库执行 migration；该轮 Handoff 验证结束时未对共享、133 或生产库 apply，也未 stage、commit、push、部署或执行客户 UAT。

Git 收口冻结树验证：再次执行官方 `affected.sh --run` 覆盖 T0、T1、T3、T4、T5、T6、T7，文档、三轮 Go、直接合同、Web、客户配置以及隔离 PostgreSQL 关键事务 / 并发均通过，其中 PostgreSQL 为 `192 / 192`、零失败、零跳过。完整 Style L1 首轮发现开发导航新增流程观察台后仍保留旧的 6 项入口、7 项侧栏和虚拟下拉 DOM 断言；同步为当前 7 张入口卡、8 项工作台导航，并让移动端全页场景纳入观察台后，定向场景 `3 / 3`、开发导航合同 `12 / 12`、最终真实 Chromium + 受控 mock Style L1 `187 / 187` 通过，写请求审计保持 0。ESLint 与 `git diff --check` 同步通过；最终 clean HEAD 仍须由 `prepare-push.sh` 执行一次当前提交绑定的 full 并让真实 pre-push hook 核验实际推送范围，不能复用此段开发期绿色替代。

clean HEAD 首轮 full 捕获状态字典守卫把 WIP 的正式首态 `PLANNED` 误判为“计划成熟度标签”；正式 Schema 与领域状态未为通过测试而改名。守卫改为精确要求 English tree 的 WIP 行完整登记八个 canonical 状态、全树只允许该行出现一次 `PLANNED`，同时继续拒绝其他 planned / current / legacy / compatibility / deferred 成熟度标签，定向 `3 / 3` 通过。该次 full 明确失败且未签发 push 回执，修复提交后仍须重新从头运行 `prepare-push.sh`。

本地 CI 模拟边界：`.github/workflows/ci.yml` 的锁定工具、PostgreSQL、range whitespace / commit-message、生成、strict 和 committed source archive 命令均已实际核对；`HEAD` 的 light archive 检查通过 `2651` 个文件，归档 SHA-256 为 `23408857044ffc76605d4d49d7f0b7353ef12dec805d3c7920e9a3f81384e4d4`。但它只归档起点提交 `bd943a09b818f573d8f7f81731521c4516754547`，脚本明确回读 `clean=false`、`formalEvidenceEligible=false`；当前实现仍是按任务要求保留的未提交 dirty tree，因此 CI 的“`make data` 后全树干净”和“当前实现 committed archive”门禁不能执行为 passed。GitHub Actions 未运行，不能写成 GitHub CI 通过。任务专属 PostgreSQL 容器在确认无 `plush_erp_%` 数据库残留后已删除。

阻塞 / 未执行：九岗位真实登录 / JSON-RPC / 浏览器的只读 preflight 已执行，RBAC 与浏览器报告均为 `ready=false`，明确缺少演示账号密码环境；`8300` 虽返回 health 200，但监听进程 cwd 为 Local checkout `/Users/simon/projects/plush-toy-erp/server`，不属于本 Worktree，独立 `8310` 没有监听。本任务不能向归属不明的 Local 数据库 seed、发布 active revision 或写业务事实；同时仓库 local-test customer-config guard 只允许已登记的 `192.168.0.106:5432/plush_erp[_*_dev]` 集群，不能拿临时 loopback PostgreSQL 伪造永绅 active revision。因此真实九岗位验收保持 blocked；现有 mock / Style L1 只能证明 UI 交互与恢复态，不能替代真实 JSON-RPC 业务闭环或客户 UAT。没有对共享、133 或生产库 apply migration，也没有执行目标 migration status / apply / readback、发布、health / ready、目标账号 smoke 或客户 UAT。

边界：本轮没有 schema 变更，不生成新 migration；没有对共享、133 或生产库 apply，也未发布客户配置、部署或执行客户 UAT。代码已通过受控 Handoff 带回 Local并进入本轮完整工作树 Git 收口；具体提交和远端状态以 Git ref 为准。

## 2026-07-24 权限中心关联账号核对（起点继承记录）

完成：岗位详情新增第 5 个“关联账号（数量）”Tab，按现有 `admin.list` 与账号岗位关系只读展示账号、三态状态和兼任岗位，启用账号优先排列；无员工账号查看权限时明确提示未知，不把未加载数据冒充零账号。账号分配、停用、重置和注销仍只在外层“员工账号”办理；从岗位详情进入时预填当前岗位搜索并回到第一页，没有新增后端接口、权限码、账号真源或第二套管理动作，也不根据账号名前缀猜测 Demo 身份。

验证：Web 全集 `1792 / 1792`、ESLint、Stylelint、权限页静态合同 `63 / 63`、文档清单 / 试用账号 / 岗位手册合同 `13 / 13` 和目标差异检查通过。Node `24.14.0` 下真实 Chromium `permission-center-desktop,permission-center-navigation-mobile-dark` 各 `1 / 1` 通过，覆盖财务岗位关联账号数量、只读状态与兼任岗位、跳转后岗位搜索、桌面布局、390px 暗色布局和无页面级横向溢出；桌面与手机截图已人工检查。未改 RBAC、客户配置、Workflow / Fact、schema 或 migration，未保存真实岗位设置、未提交、未推送、未部署，也未执行目标账号实登或甲方 UAT。

## 2026-07-24 权限中心审批责任与多角色完整性（起点继承记录；本轮未复用运行态结论）

完成：审批责任已收进“权限管理”的第三个外层 Tab，与“岗位设置 / 员工账号”共用同一岗位和账号真源；删除独立审批设置路由与菜单，不再让管理员在两个页面间来回核对。页面只展示已有正式 ProcessRuntime 与领域命令闭环的销售订单、采购订单和出货财务放行，可维护启停、主办、备用、升级及岗位 / 具名员工；说明改为问号 Popover，停用事项使用紧凑的“不参与流程”状态。审批项现在显式区分“未配置、已启用、已停用”：active revision 缺少审批设置时显示“待初始化 / 待设置”并生成可编辑的推荐责任草稿，不再误报为“停用 / 不参与流程”；推荐草稿必须经过检查、发布和激活才正式生效，明确保存为关闭的事项仍保持停用。预览、发布、显式启用和 active revision / content hash CAS 仍保持分离，普通管理员不能借责任设置给自己或自己的业务岗位新增办理资格，系统 / 调试岗位继续受保护。

多角色完整性：启用员工会按其全部真实岗位进入对应候选，多岗位员工可分别在销售、采购、财务等真实岗位下被选择；具名成员必须处于启用状态并继续持有所选岗位，同一责任成员不能在同一事项的多个层级重复。运行时只开放最低可用优先级：主办可用时备用与升级不可见、不可办理，主办失效后才交给备用，主办与备用均失效后才交给升级；唯一具名候选会冻结具体 assignee。员工停用或注销会释放其未结束具名待办，但任务继续绑定原流程 revision，并按该冻结 revision 重新解析下一可用层级，不会被后来激活的新配置改写。

起点历史记录曾描述一次本地客户配置发布 / 激活与管理员读回；本轮独立 Worktree 没有对该数据库或 active revision 做当前读回，也没有复用该记录作为验证证据。当前可执行结论只取本轮代码、测试和明确环境前提；若后续需要运行态结论，必须重新执行 `get_approval_settings / get_effective_session` 与真实岗位登录。

边界：RBAC `workflow.task.approve` 只表达审批资格上限，实际列表、岗位视图与办理动作同时校验任务冻结 revision 的 entitlement、精确责任池 / 岗位或具名成员、账号状态、最低可用层级、owner / assignee、任务状态 / version、幂等键与审计。Workflow task done 仍不直接写 Fact，销售、采购和 Shipment 继续由各自唯一领域命令落地。客户退货和生产异常虽有领域审批但尚未进入配置化 ProcessRuntime；库存调整、PAYMENT、PMC / 工程审批缺正式 Source Document 或门禁，继续失败关闭。

起点验证记录中的 affected、Web、PostgreSQL 与 Chromium 数字只绑定其当时工作树；当前代码已变化，不能作为本轮绿色结果。当前任务的实际命令、非零测试数、fail / skip 和环境边界统一登记在上方“当前单据流 / 业务流重新审计”最终记录。

风险：当前没有本轮可复用的 active revision / effective session 或真实账号办理证据；133 / 生产目标环境发布、销售 / 采购 / 财务 / 老板真实账号 smoke、客户 UAT、部署、提交和推送均未执行。WorkPoolMembership 当前只有启停，没有独立的时间到期字段，不为尚无正式合同的“成员有效期”新增 schema。

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

## 2026-07-27 异常流完整收口与最终 Local 验收

完成：79da Worktree 的异常流改动已按业务真源逐文件、逐 hunk 语义带回 Local，没有整树覆盖、merge、cherry-pick、rebase 或兼容兜底。Local 原有的正常流、审批责任、状态观察台和页面治理继续保留；异常流补齐客户退货、收付款、手工库存调整和生产异常四条正式 ProcessRuntime，以及对应 Source Document / Fact / Inventory / Allocation、RBAC、CAS、幂等、审计和前端动作。Workflow task done 仍不等于 Fact posted，四条流程的领域结果只由各自 usecase 写入。

配置真源：当前 yoyoosun runtime manifest 选择七条正式流程：销售接单、采购供料、成品交付、客户退货、收付款、手工库存调整和生产异常。权限中心“审批责任”只允许配置销售、采购和 Shipment 财务放行三类日常责任模板；四条异常流程继续使用注册流程合同中的固定责任池，页面不再把已注册流程误报为“尚未接入”。没有新增别名、默认经办人、默认原因、默认数量、任务名猜测或测试专用业务旁路。

迁移与生成：`make data` 连续执行保持 Ent / Atlas 零漂移；生成模型 diff 的 SHA-256 保持 `181ecc97c899c833cbaed5f3f6723abd2cb56f524a154fdf2b38f248c6680abf`。全新登记隔离库 `plush_erp_acceptance_local_browser_actions_20260727_v5_dev` 在 `192.168.0.106:5432` 完成 `migrate_status → migrate_apply → migrate_status`，populated preflight 通过，Atlas 为 `102 / 102`、最新 `20260726174057`、pending 0。没有对共享开发库、133、客户试用或生产数据库 apply。

浏览器验收：当前 Local 源码后端固定在独立 `8324`，yoyoosun Vite 固定在 `15215`；管理员从真实客户配置控制台点击应用，读回 active revision `yoyoosun-customer-package-v7.local-931c8fda75bc4b6a.runtime-v1`，active snapshot 恰好包含上述七条流程。完整角色 smoke 为桌面 `10 / 10`、手机业务岗位 `9 / 9`、管理员手机拒绝 1 项通过，10 个账号的 effective-session 诊断均来自 active revision 且 blocker 为 0。

四条异常流真实写入为 `4 / 4`：销售退货完成收货与入库冲正，收付款完成过账 / 核销与冲销恢复，库存调整完成新建 / 提交 / 老板审批 / 仓库执行 / 过账 / 取消冲正，生产超领完成额度消费、领料 Fact 过账、取消冲正和额度恢复。四条主 mutation 均由产品 UI 点击触发；另有四个结构合法的无权角色请求被服务端以 `40304` 拒绝，四次后端成功后丢弃响应均由页面权威读回恢复，四个重复或旧 version 请求均以 `40920` 拒绝。报告不保存密码、token 或 Authorization header。数据库额外读回四个对应 ProcessInstance 均为 `completed`，销售退货、收付款、库存调整的执行节点与 end 均完成；生产超领按审批决定的 `over_issue_end` 完成，不把后续领料 Fact 误写成审批任务结果。

验证边界：定向 Go、Node、文档合同、`db-guard`、`go test ./...`、`go build ./...`、前端单测 / lint / CSS / production build、真实 Chromium、shell / YAML / 漏洞检查均已在当前实现阶段通过。最终仓库门禁固定为在本节落盘后的同一工作树执行 `bash scripts/qa/strict.sh`；本文件不预写该命令的绿色结果，最终交接以终端回执为准。当前没有提交、推送、部署或 Handoff 后 Git 收口，133 / 生产 migration、目标 readback、真实客户数据导入、甲方 UAT / 签收仍未执行。

## 2026-07-27 审批责任岗位候选与权限失配提示

完成：审批责任弹窗不再过滤后裸露 `sales` 等原始岗位 key。已保存但停用、缺少审批功能、没有启用员工或已经不存在的岗位会保留为不可选项，并使用中文岗位名和原因回显；当前只有一个可承接岗位时，页面明确说明备用、升级可留空，同一岗位池已占用时直接标明所在责任层级。岗位池或指定员工重复承担多个层级改为候选禁用、字段校验和保存兜底三层提示。服务端发布检查同步读取持久化岗位状态与 `workflow.task.approve`，缺权、停用或不存在的岗位不能通过前端外的调用发布。

验证：affected 计划判定为 T0 / T1 / T4 / T5；服务端 `go test -count=1 ./internal/core/... ./internal/biz ./internal/data ./internal/service ./internal/server`、Web ESLint、定向 Node `5 / 5`、脚本语法与 `git diff --check` 通过。真实 Chromium `3 / 3` 覆盖未初始化、正常发布 / 启用和持久化岗位权限漂移；漂移场景确认“业务（未开启审批功能）”、唯一可用“老板”、跨层占用原因、字段错误、弹窗居中、无横向溢出和零未声明控制台错误，截图已人工检查。

边界：本轮没有自动给业务、采购或财务岗位扩权，也没有修改数据库、已发布 revision 或在途流程；当前失配配置需要管理员在岗位设置中恢复审批功能，或把责任改到现有合格岗位。浏览器证据来自本地自托管前端与受控 mock，只证明当前 Local UI 合同；未部署、未执行目标账号实登或甲方 UAT。本机使用 Node `26.5.0`，仓库声明 `24.14.x`。

## 下一步与停止条件

1. 发布前必须绑定最终 commit / image，按正式流程执行备份 / 回滚点、migration status / apply / readback、health / ready、真实账号与业务 smoke。
2. 客户交付仍须甲方岗位 UAT / 签收；本地或固定旧版本绿色不能替代。
3. 异常流 Worktree 暂保留为恢复副本；后续清理须单独确认目标和现场，不把 Handoff、提交或推送等同于 Worktree 删除。

## 归档索引

- `docs/archive/progress-2026-07-23-before-exception-flow-v1-final-handoff.md`：本次异常流四项收口 Handoff 前的完整过程记录；归档前为 354 行 / 81,412 bytes，SHA-256 `7ecb190e0242aaf42a16d946eeb2045c4ddeba290f611f2bfe9d5452a8cfb4a2`。
- `docs/archive/progress-2026-07-18-before-source-lineage-draft-cancellation-closeout.md`：来源血缘和草稿取消集中收口前的完整过程记录。
- `docs/archive/progress-2026-07-17-before-workflow-source-task-producers.md` 与 `docs/archive/progress-2026-07-15-before-local-admin-default-policy.md`：更早完整过程记录。
- 其余历史过程记录索引见 `docs/archive/README.md`、`docs/文档清单.md` 和 Git 历史。
