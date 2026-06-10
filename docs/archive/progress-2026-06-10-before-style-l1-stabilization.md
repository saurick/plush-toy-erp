# 过程记录 / Progress

本文件只保留当前活跃事项、最近完成事项和归档索引；历史流水不作为当前正式需求、实现状态或产品路线真源。

## 归档索引

- `docs/archive/progress-2026-06-02-before-print-template-defer.md`：归档 2026-05-31 至 2026-06-02 10:28 的旧过程记录。归档原因：原 `progress.md` 达到 386 行 / 80696 bytes，超过 80KB 阈值。
- `docs/archive/progress-2026-06-05-before-mobile-task-redesign.md`：归档截至 2026-06-04 22:04 CST 的过程记录快照。归档原因：当前 `progress.md` 达到 375 行 / 80895 bytes，超过 80KB 阈值；本轮移动端任务页改版前先保留完整现场，再收缩当前入口。
- `docs/archive/progress-2026-06-08-before-business-records-debug-cleanup.md`：归档截至 2026-06-08 13:50 CST 的过程记录快照。归档原因：当前 `progress.md` 达到 318 行 / 82540 bytes，超过 80KB 阈值；本轮旧 `project-orders` debug cleanup 前先保留完整现场，再收缩当前入口。
- `docs/archive/progress-2026-06-09-before-brand-config.md`：归档 2026-06-08 21:08 CST 至 2026-06-08 23:07 CST 的过程记录。归档原因：当前 `progress.md` 达到 383 行 / 80205 bytes，超过 80KB 阈值；本轮前端品牌客户配置化前先保留完整现场，再收缩当前入口。

## 2026-06-08 23:55 CST

- 完成：按“一步做完 Phase 8、客户验收不作为阶段阻塞、真实数据只能模拟”的口径完成 Phase 8 目标环境内部模拟事实闭环。新增 `scripts/qa/phase8-simulated-fact-closure.mjs` 及测试，并接入 `scripts/qa/fast.sh`、`full.sh`、`strict.sh`；脚本只接受 `SIM-YOYOOSUN-PHASE8` 模拟数据和显式确认，覆盖生产 create/post/cancel、预留 release/consume、委外 create/post/cancel、出货 create/add/ship/cancel、财务 post/settle/cancel。
- 完成：修复无批次库存余额扣减路径中的 PostgreSQL placeholder 间隙问题，补充本地 repo 测试和 PostgreSQL gated 集成测试；本地构建并发布 `plush-toy-erp-server:20260608T2345-phase8-closure-amd64` 到目标环境，保留 web 镜像 `plush-toy-erp-web:20260608T2230-a490b92-phase8-amd64` 不动。
- 完成：目标环境已用模拟主数据 `SIM-YOYOOSUN-PHASE8-PCS` / `SIM-YOYOOSUN-PHASE8-PRODUCT` / `SIM-YOYOOSUN-PHASE8-WH` 执行内部模拟事实闭环；旧失败留下的生产事实已冲正为 `CANCELLED`，旧委外 `DRAFT` 无库存流水影响。
- 完成：同步更新 `docs/current-source-of-truth.md`、`docs/architecture/phase8-fact-expansion-review.md`、`docs/customers/yoyoosun/phase8-target-release-acceptance.md`、`docs/customers/yoyoosun/phase8-target-release-evidence-2026-06-08.md`、`docs/customers/yoyoosun/README.md`、`deployments/yoyoosun/README.md`、`docs/document-inventory.md`、`docs/product/product-completion-roadmap.md`、`docs/product/product-delivery-ledgers.md` 和 `scripts/README.md`，把 Phase 8 状态更新为目标环境内部模拟事实闭环通过；客户使用确认改为交付后业务确认，不再作为 Phase 8 完成阻塞。
- 验证：目标环境 `/healthz` 返回 `ok`、`/readyz` 返回 `ready`，Atlas status pending 0；`trial-account-rbac.mjs` 验证 9 个 demo 账号通过；`phase8-simulated-fact-closure.mjs --apply` 生成 `TARGET-20260608-CLOSURE-V2` evidence；目标数据库核对生产、委外、出货、财务状态和 production / outsourcing / shipment 正反库存流水通过；服务端日志未发现 `ERROR` / `panic` / `fatal` / placeholder 错误。
- 下一步：进入 Phase 9 或后续增强评审；打印、报表、核销、物流退货、自动派生、并发锁升级、生产订单专表、委外订单专表和岗位任务端都不作为 Phase 8 补尾。
- 阻塞/风险：Phase 8 内部闭环不等于客户已签收、真实客户数据导入、完整打印、完整报表、发票明细、收付款核销或对账单已交付；首次目标发布前仍缺 pre-migration 备份 evidence，只能保留为历史发布风险，后续发布必须先记录 pre-migration 备份 evidence。目标机执行了 `docker builder prune -f`，为保留上一版回滚镜像且可回收空间很小，未执行 `docker image prune -a -f`。追加前 `progress.md` 为 319 行 / 62448 bytes，未达到归档阈值。

## 2026-06-09

- 完成：撤掉客户侧栏和默认桌面菜单中的 `Phase 8 事实闭环` / `事实闭环` 工程入口；同步从 yoyoosun 客户菜单、前端默认导航、前端菜单权限选项 / 预设和后端内置菜单移除 `phase8-facts`。保留 `/erp/phase8/facts` 内部直达页面、Phase 8 JSON-RPC、RBAC 动作权限和后端事实 usecase，不影响内部验证和脚本闭环。
- 完成：同步更新 `docs/current-source-of-truth.md`、`docs/architecture/phase8-fact-expansion-review.md`、`docs/customers/yoyoosun/phase8-target-release-acceptance.md` 和 `docs/product/product-delivery-ledgers.md`，明确客户菜单不展示 `Phase 8` 或 `事实闭环` 这类内部工程入口，菜单隐藏不替代后端 RBAC。
- 下一步：如后续要把 Phase 8 能力产品化给客户用，应分别并入生产、委外、出货、库存和财务对应业务菜单，而不是恢复统一的 Phase 编号菜单。
- 阻塞/风险：本轮只改菜单曝光和文档口径，未改 schema、migration、Phase8Usecase、JSON-RPC handler、目标环境镜像或部署配置。追加前 `progress.md` 为 340 行 / 69042 bytes，未达到归档阈值。

## 2026-06-09 11:05 CST

- 完成：按“下一步、不分子阶段、真实导入只能模拟”的口径一次性完成 Phase 9 岗位任务端与岗位协同闭环。新增 `scripts/qa/phase9-simulated-mobile-closure.mjs` 及测试，并接入 `scripts/qa/fast.sh`、`full.sh`、`strict.sh`；脚本只创建和更新 `SIM-YOYOOSUN-PHASE9` 模拟 workflow 任务，覆盖老板审批、成品抽检、仓库入库确认、出货放行异常上报和现场留痕，不写真实客户数据、`business_records` 或任何事实表。
- 完成：岗位任务端详情页新增现场留痕、最近动作、保存 evidence 和异常报告展示；完成 / 催办动作会提交 mobile action evidence；修复 `/m/<role>/guide` wildcard 兼容入口，避免跳到 `tasks/tasks`；`smoke:mobile-auth-login-route` 默认验证当前生产单端口 `/m/<role>/tasks` 主路径。
- 完成：本地构建 `linux/amd64` Web 镜像 `plush-toy-erp-web:20260609T1053-9173b13-phase9-mobile-amd64`，上传到目标环境 `192.168.0.133`，远端只执行 `docker load`、Compose 重建、健康检查、目标 smoke 和发布后清理；server 镜像、schema、migration 和 Phase 8 fact usecase 未变。
- 完成：新增 `docs/customers/yoyoosun/phase9-target-release-evidence-2026-06-09.md`，并同步 `docs/current-source-of-truth.md`、`docs/customers/yoyoosun/README.md`、`docs/document-inventory.md`、`docs/product/product-completion-roadmap.md`、`docs/product/product-delivery-ledgers.md` 和 `scripts/README.md`，把 Phase 9 状态更新为目标环境内部模拟 workflow 闭环通过。
- 验证：本地通过 `node --test web/src/erp/utils/mobileTaskView.test.mjs`、`node --test scripts/qa/phase9-simulated-mobile-closure.test.mjs`、report-only Phase 9 脚本、`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`bash scripts/qa/fast.sh`、`pnpm --dir web style:l1`、`TRIAL_ACCOUNT_PASSWORD=12345678 node scripts/qa/trial-account-rbac.mjs`、`TRIAL_ACCOUNT_PASSWORD=12345678 pnpm --dir web smoke:mobile-auth-login-route` 和本地 `PHASE9_SIM_CONFIRM=APPLY_SIMULATED_PHASE9_MOBILE_TASKS ... --run-id LOCAL-20260609-PHASE9-V3`。
- 验证：目标环境通过 `curl http://192.168.0.133:5175/healthz`、`curl http://192.168.0.133:8300/healthz`、`curl http://192.168.0.133:8300/readyz`、`MOBILE_AUTH_SMOKE_BASE_URL=http://192.168.0.133:5175 MOBILE_AUTH_SMOKE_APP_ID=mobile-warehouse TRIAL_ACCOUNT_PASSWORD=12345678 pnpm --dir web smoke:mobile-auth-login-route`、`TRIAL_ACCOUNT_PASSWORD=12345678 TRIAL_ACCOUNT_BACKEND_URL=http://192.168.0.133:8300 node scripts/qa/trial-account-rbac.mjs` 和目标 `PHASE9_SIM_CONFIRM=APPLY_SIMULATED_PHASE9_MOBILE_TASKS ... --run-id TARGET-20260609-PHASE9`；目标日志近 10 分钟无 `panic|fatal|error` 命中。
- 下一步：进入 Phase 10 行业模板沉淀，先把 yoyoosun 已验证的角色、菜单、字段、编号、导入模板和岗位任务模式区分为行业共性候选、客户样本和 deferred 输入；不要把单客户样本直接写成行业默认。
- 阻塞/风险：Phase 9 内部模拟 workflow 闭环不等于客户已签收、真实客户数据导入、拍照上传 / 附件服务、扫码、完整打印、报表、核销、物流退货、自动派生或出货 / 库存 / 财务事实自动过账已交付。目标机执行了 `docker builder prune -f` 和 `docker image prune -f`；磁盘空间充足且可回收空间极小，为保留当前运行镜像和相邻项目回滚镜像，未执行 `docker image prune -a -f`。追加前 `progress.md` 为 329 行 / 65430 bytes，未达到归档阈值。

## 2026-06-09 11:27 CST

- 完成：将撤掉 `Phase 8 事实闭环` / `事实闭环` 客户菜单入口的补丁发布到目标环境；从干净临时 worktree 构建并加载 `plush-toy-erp-web:20260609Tphase8-menu-hide-amd64` 和 `plush-toy-erp-server:20260609Tphase8-menu-hide-amd64`，只替换 `app-server` 与 `web-desktop`，未在目标服务器构建。
- 完成：目标环境 `.env` 已备份为 `.env.bak.20260609Tphase8-menu-hide-amd64`，`APP_IMAGE` 和 `WEB_IMAGE` 均切到本次新 tag；本轮没有 schema 变更，Atlas status 显示 pending 0。
- 验证：目标环境 `plush-toy-erp-web-desktop` healthy，`plush-toy-erp-server` 运行新镜像；`/healthz=ok`、`/readyz=ready`、桌面前端 `/healthz` 返回 `{"status":"ok","appId":"desktop","title":"桌面后台"}`，首页 HTTP 200；前端静态资源和服务端二进制中均未检出 `phase8-facts`，服务端二进制中未检出 `Phase 8 事实闭环`；近 5 分钟 server logs 无 `error|panic|fatal|phase8-facts`。
- 下一步：如后续需要给客户暴露 Phase 8 相关能力，应拆入生产、委外、出货、库存和财务对应业务菜单，而不是恢复 `Phase` 编号工程菜单。
- 阻塞/风险：本轮只发布菜单曝光修正，未改 Phase 8 内部直达页、JSON-RPC handler、RBAC 动作权限、事实 usecase、schema 或 migration。远端磁盘 `/` 为 98G/22G used/72G avail；已执行 `docker builder prune -f`，实际 0B；为保留上一版镜像回滚且磁盘充足，未执行 `docker image prune -a -f`。追加前 `progress.md` 为 347 行 / 70227 bytes，未达到归档阈值。

## 2026-06-09 11:45 CST

- 完成：按“进入 Phase 10，一步完成，不拆子阶段，真实导入只能本地模拟”的口径完成行业模板沉淀闭环。新增 `config/industry-templates/plush/templateConfig.mjs`，将 yoyoosun 已验证的角色、菜单、字段显示、编号、导入模板和岗位任务模式沉淀为毛绒玩具行业候选模板；模板状态为 `candidate`，`runtimeEnabled=false`，不作为运行时 loader 或多客户默认。
- 完成：新增 `scripts/qa/industry-template-boundaries.mjs`、`scripts/qa/phase10-industry-template-closure.mjs` 及测试，并接入 `scripts/qa/fast.sh`、`full.sh`、`strict.sh`；脚本只生成 Phase 10 本地模拟 evidence，不连接数据库、不执行真实客户数据导入、不写 `business_records` 或事实表。
- 完成：同步更新 `config/industry-templates/plush/README.md`、`scripts/README.md`、`docs/current-source-of-truth.md`、`docs/product/product-completion-roadmap.md`、`docs/product/product-delivery-ledgers.md`、`docs/customers/yoyoosun/README.md`、`docs/document-inventory.md`、`docs/architecture/phase8-fact-expansion-review.md` 和 `docs/customers/yoyoosun/phase8-target-release-acceptance.md`；新增 `docs/customers/yoyoosun/phase10-target-release-evidence-2026-06-09.md`。
- 完成：本地构建 `linux/amd64` 镜像 `plush-toy-erp-server:20260609T1125-dd845a4-phase10-industry-amd64` 和 `plush-toy-erp-web:20260609T1125-dd845a4-phase10-industry-amd64`，上传到目标环境 `192.168.0.133` 的 `/home/simon/plush-toy-erp-releases/20260609T1125-dd845a4-phase10-industry-amd64/images.tar.gz`，远端只执行 `docker load`、Compose 切换、migration status、健康检查、浏览器回归和发布后清理；未在目标服务器构建。
- 验证：本地通过 `node scripts/qa/industry-template-boundaries.mjs`、`node --test scripts/qa/phase10-industry-template-closure.test.mjs`、`node scripts/qa/phase10-industry-template-closure.mjs --out output/customers/yoyoosun/phase10-industry-template-closure-local`、`node scripts/qa/customer-config-boundaries.mjs`、`node --test web/src/erp/config/seedData.test.mjs web/src/erp/config/menuPermissions.test.mjs`、`bash scripts/qa/fast.sh`、`pnpm --dir web test`、`pnpm --dir web style:l1`、`bash scripts/qa/full.sh` 和 `git diff --check`。
- 验证：目标环境 Atlas status OK、pending 0；`/healthz=ok`、`/readyz=ready`、桌面前端 `/healthz` 返回 `{"status":"ok","appId":"desktop","title":"桌面后台"}`，`/erp/dashboard` HTTP 200；`TRIAL_ACCOUNT_PASSWORD=12345678 TRIAL_ACCOUNT_BACKEND_URL=http://192.168.0.133:8300 node scripts/qa/trial-account-rbac.mjs` 通过 9 个 demo 账号；`TRIAL_ACCOUNT_PASSWORD=12345678 TRIAL_BROWSER_SMOKE_BASE_URL=http://192.168.0.133:5175 TRIAL_BROWSER_SMOKE_BACKEND_HEALTH_URL=http://192.168.0.133:8300/healthz pnpm --dir web smoke:trial-demo-browser` 通过桌面账号 9 个、岗位任务端 8 个、拒绝态 1 个；目标日志近 10 分钟无 `panic|fatal|error`。
- 下一步：Phase 10 已按内部模拟和目标环境发布口径关闭。后续若要把行业模板从 `candidate` 升为正式默认，必须先有第二客户或更完整业务样本验证，并单独评审 runtime loader、客户差异隔离和回滚路径。
- 阻塞/风险：Phase 10 行业模板不是真实客户数据导入、客户已签收、多客户默认、SaaS、多租户、license、通用打印模板引擎、正式报表、扫码、附件服务或事实自动过账交付；客户使用确认属于交付后业务确认。目标机执行 `docker builder prune -f` 和 `docker image prune -f`，回收 0B；为保留当前运行镜像和相邻项目回滚镜像，未执行 `docker image prune -a -f`。追加前 `progress.md` 为 355 行 / 71849 bytes，未达到归档阈值。

## 2026-06-09 13:25 CST

- 完成：按“Phase 11 一步完成、不拆子阶段、真实导入只能本地模拟”的口径完成多客户私有化复制闭环。新增 `config/private-deployment-template/templateConfig.mjs`、`config/private-deployment-template/README.md`、`docs/product/private-deployment-package-review.md`、`deployments/README.md`、`scripts/qa/private-deployment-boundaries.mjs`、`scripts/qa/phase11-private-deployment-closure.mjs` 和测试；模板状态为 `template_candidate`，`runtimeEnabled=false`，`SIM-PRIVATE-PHASE11` 只用于本地 evidence，不创建正式客户目录。
- 完成：同步更新 `README.md`、`docs/current-source-of-truth.md`、`docs/customers/README.md`、`docs/customers/yoyoosun/README.md`、`docs/document-inventory.md`、`docs/product/product-completion-roadmap.md`、`docs/product/product-delivery-ledgers.md`、`deployments/yoyoosun/README.md`、`scripts/README.md`、`scripts/qa/fast.sh`、`full.sh` 和 `strict.sh`；新增 `docs/customers/yoyoosun/phase11-target-release-evidence-2026-06-09.md`。
- 验证：本地通过 `node scripts/qa/private-deployment-boundaries.mjs`、`node --test scripts/qa/phase11-private-deployment-closure.test.mjs`、`node scripts/qa/phase11-private-deployment-closure.mjs --out output/customers/yoyoosun/phase11-private-deployment-closure-local`、`bash scripts/qa/fast.sh`、`bash scripts/qa/full.sh` 和 `git diff --check`。
- 验证：本地构建并上传 `plush-toy-erp-server:20260609T1320-phase11-private-amd64` 与 `plush-toy-erp-web:20260609T1320-phase11-private-amd64` 到目标环境 `192.168.0.133`；远端只执行 `docker load`、`.env` 镜像切换、migration status、Compose 重建、健康检查、账号 RBAC、浏览器 smoke 和发布后清理，未在目标服务器构建。目标环境 migration pending 0，`/healthz=ok`、`/readyz=ready`、前端 `/healthz` 正常、`/erp/dashboard` HTTP 200，`trial-account-rbac.mjs` 通过 9 个 demo 账号，`smoke:trial-demo-browser` 通过桌面账号 9 个、岗位任务端 8 个、拒绝态 1 个，近 10 分钟 server logs 无 `panic|fatal|error`。
- 下一步：Phase 11 已按模板、模拟闭环和目标环境发布口径关闭。真实新增客户前必须先评审稳定 customer key、资料入仓边界、导入 dry-run / unresolved queue、部署地址、备份恢复、验收清单和是否存在客户专属 extension；Phase 12 SaaS 仍只在多客户私有化成熟后单独评审。
- 阻塞/风险：Phase 11 不代表真实第二客户已创建、真实客户数据导入已批准、多客户 runtime 已生效、SaaS、多租户、license、billing、客户工单系统或客户已签收；本轮未改 schema、migration、RBAC、WorkflowUsecase、Fact usecase、客户菜单 runtime loader 或真实导入 loader 写库语义。目标机执行 `docker builder prune -f` 和 `docker image prune -f`，回收 0B；为保留当前运行镜像和上一版回滚镜像，未执行 `docker image prune -a -f`。追加前 `progress.md` 为 366 行 / 75669 bytes，未达到归档阈值。

## 2026-06-09 13:41 CST

- 完成：按“评审先”的口径完成 Phase 12 SaaS docs-only 评审。新增 `docs/product/phase12-saas-review.md`，结论是当前不进入 SaaS 实现，继续优先验证 Phase 11 私有化客户包和真实新增客户闭环。
- 完成：同步更新 `docs/product/product-completion-roadmap.md`、`docs/current-source-of-truth.md`、`docs/product/product-delivery-ledgers.md` 和 `docs/document-inventory.md`，明确 Phase 12 不新增 `tenant_id`、runtime tenant、license、billing、套餐权限、客户工单系统或 SaaS 运营后台，也不改 schema / migration / RBAC / Workflow / Fact。
- 验证：`git diff --check` 通过；`git status --short` 确认本轮只涉及正式文档 / 台账 / `progress.md` 和新增 `docs/product/phase12-saas-review.md`；Phase 12 / SaaS / `tenant_id` 扫描只命中“不进入实现 / 不新增 / 不代表”等负向边界口径。
- 下一步：真实新增客户前仍先评审 customer key、资料边界、导入 dry-run、部署、备份恢复和验收；只有完成真实多客户私有化证据后，才重新评审 SaaS schema / runtime。
- 阻塞/风险：本轮只改正式文档和台账，未改 runtime、schema、migration、API、RBAC、UI、部署脚本或客户配置运行时；Phase 12 评审不能被解读为 SaaS、多租户或 license / billing 已开始。追加前 `progress.md` 为 375 行 / 78751 bytes，未达到归档阈值。

## 2026-06-09 15:14 CST

- 完成：按“核心产品不应包含客户信息，永绅只应作为客户配置覆盖”的口径完成前端品牌客户配置化。核心默认品牌改为中性 `毛绒玩具 ERP` / `绒`，`config/customers/yoyoosun/menuConfig.mjs` 新增 yoyoosun `brand` 配置；登录页、入口选择页和后台侧栏统一通过 `getActiveERPBrand()` 读取默认品牌或客户覆盖。
- 完成：新增 `web/src/common/consts/brand.test.mjs` 并接入 `web/package.json`，覆盖默认品牌中性、yoyoosun 客户 key 覆盖和 runtime config 覆盖；`style:l1` 默认品牌断言同步改为中性产品名。同步更新 `README.md`、`web/README.md`、`docs/current-source-of-truth.md`、`docs/product/product-delivery-ledgers.md`、`config/customers/yoyoosun/README.md`、`docs/archive/README.md` 和 `docs/document-inventory.md`。
- 完成：按阈值把旧 `progress.md` 归档到 `docs/archive/progress-2026-06-09-before-brand-config.md`；归档前 `progress.md` 为 383 行 / 80205 bytes，超过 80KB 阈值，归档后保留最近活跃记录和归档索引。
- 验证：`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`pnpm --dir web style:l1` 第二轮全量通过 41 个场景；`STYLE_L1_SCENARIOS=print-workspace-processing-row-selection-reset pnpm --dir web style:l1` 单独复跑通过；`git diff --check` 通过。Browser 验证默认实例显示 `毛绒玩具 ERP` / `绒`，yoyoosun 实例显示 `东莞市永绅玩具有限公司` / `永`，console 无 error / warn。
- 下一步：如需目标环境也切到新品牌逻辑，需要按低配 Docker 发布主路径构建并发布 Web 镜像；若要新增第二客户，优先在客户配置包中放 brand/menu，而不是改核心常量。
- 阻塞/风险：本轮只改前端品牌展示配置、测试和文档；未改后端 RBAC、schema、migration、Workflow / Fact usecase、真实导入、部署脚本或目标环境镜像。Browser 中未完成登录表单按钮交互验证，因为测试 profile 存在旧登录态缓存并自动进入入口页；交互态已由 `style:l1` 覆盖。

## 2026-06-09 20:39 CST

- 完成：新增 `docs/product/prototypes/` 产品原型资产目录，集中归档业务模块标准页整页原型、协同入口独立探索原型和三张协同入口方向图；原型明确不进入 `web/src`、菜单、路由或生产构建，只作为设计评审和后续共享组件实现参考。
- 完成：新增 `docs/product/prototypes/README.md` 和 `docs/product/prototypes/business-module-page-standard-v1/README.md`，说明适用页面、非运行时边界、Workflow / Fact 边界、debug 任务不进生产业务页，以及后续应收口到共享业务列表页组件。
- 完成：同步更新 `docs/product/README.md` 和 `docs/document-inventory.md`，将长期原型资产纳入产品文档体系；HTML 和 PNG 由原型目录 README 索引，不作为 Markdown 文档清单条目逐项登记。
- 下一步：如确认该原型方向进入实现，优先改共享业务列表页布局、协同面板和分页 / 选中操作条组件，并按前端样式规则覆盖浅色 / 暗色和交互态回归。
- 阻塞/风险：本轮只归档设计资产和说明文档，未改 runtime、schema、migration、API、RBAC、Workflow / Fact usecase、菜单、路由或目标环境镜像。追加前 `progress.md` 为 83 行 / 21226 bytes，未达到归档阈值。

## 2026-06-09 20:52 CST

- 完成：将之前岗位任务端改版使用的三张 PNG 原型图归档到 `docs/product/prototypes/mobile-role-tasks-v1/images/`，覆盖待办列表页、任务详情页和风险分组页。
- 完成：新增 `docs/product/prototypes/mobile-role-tasks-v1/README.md`，说明这批 PNG 已作为岗位任务端改版参考、真实页面已落到 `MobileRoleTasksPage.jsx`，当前不再机械复刻成 HTML；后续若做岗位任务端 v2，应基于当前真实页面和新目标重新做可交互 HTML。
- 完成：同步更新 `docs/product/prototypes/README.md`、`docs/product/mobile-role-tasks-redesign.md`、`docs/assets/mobile-role-tasks/README.md` 和 `docs/document-inventory.md`，把旧占位路径改为项目内原型归档路径。
- 下一步：如果后续需要继续改岗位任务端，应先评审当前运行态页面与新目标差异，再决定补 HTML 原型还是直接改真实页面。
- 阻塞/风险：本轮只补设计资产归档和说明文档，未改 runtime、schema、migration、API、RBAC、Workflow / Fact usecase、菜单、路由、前端样式或目标环境镜像。

## 2026-06-09 21:08 CST

- 完成：新增 `docs/product/prototypes/mobile-role-tasks-v1/implemented-reference.html`，作为岗位任务端当前实现对齐版原型，覆盖待办 / 已办 / 消息 / 我的、主筛选、分批展开、任务详情、现场留痕、原因面板和底部动作栏。
- 完成：同步更新 `docs/product/prototypes/README.md`、`docs/product/prototypes/mobile-role-tasks-v1/README.md`、`docs/product/mobile-role-tasks-redesign.md` 和 `docs/assets/mobile-role-tasks/README.md`，明确 PNG 统一归为早期视觉方向 / 截图证据 / 方案对比 / 历史参考；岗位任务端三张 PNG 属于早期视觉方向和历史参考，HTML 是 as-built 参考。
- 下一步：如继续推进岗位任务端 v2，应基于当前真实页面、新目标和浏览器回归证据重做交互原型或直接改运行时代码。
- 阻塞/风险：本轮只补原型资产和说明文档，未改 `web/src` 运行时代码、schema、migration、API、RBAC、Workflow / Fact usecase、菜单、路由、前端样式或目标环境镜像。

## 2026-06-09 21:40 CST

- 完成：在 `docs/product/prototypes/README.md` 补充原型格式约定，明确页面 / 交互原型默认用 HTML，流程 / 架构 / 状态关系用 Markdown + Mermaid，PNG 只作为早期视觉方向、截图证据和方案对比，不强行转换为 HTML。
- 完成：补充真实页面落地后的优先级口径：以 `web/src` 运行时代码、自动化测试和浏览器回归结果为准，HTML 原型退为历史参考。
- 下一步：后续新增关键页面原型时按该目录约定归档；若进入实现，仍优先改共享组件并做真实浏览器回归。
- 阻塞/风险：本轮只改原型目录 README 和过程记录，未改 runtime、schema、migration、API、RBAC、菜单、路由、构建或目标环境镜像。追加前 `progress.md` 为 91 行 / 22539 bytes，未达到归档阈值。

## 2026-06-09 22:22 CST

- 完成：新增 `docs/product/prototypes/index.html` 轻量静态产品原型查看器，可直接通过 `file://` 浏览当前 HTML 原型、PNG 方案图和截图证据；页面按当前实现对齐版、探索方案、历史参考、截图证据和方案对比筛选，并提供打开 HTML、查看 PNG / 截图、打开说明或目录入口。
- 完成：同步更新 `docs/product/prototypes/README.md`，明确 `index.html` 只作为原型资产入口，不接后端、不接权限、不进入 ERP 正式菜单、不作为开发文档 registry；补充资产状态分类和维护规则。
- 验证：`git diff --check -- docs/product/prototypes/index.html docs/product/prototypes/README.md progress.md` 通过；本地 Node 静态校验确认 `index.html` 登记 9 个资产、3 个 HTML 链接、6 个 PNG 链接、5 个 README 链接均能解析到本地文件或目录，内联筛选 JS 语法可编译；`file` 确认入口页为 UTF-8 HTML、代表性 PNG 为有效图片。
- 下一步：后续新增原型资产时继续在对应子目录 README 和根 `index.html` 中手工补充条目；若某个原型进入真实实现，仍回到共享组件、运行时代码、测试和浏览器回归。
- 阻塞/风险：本轮只改 `docs/product/prototypes/index.html`、`docs/product/prototypes/README.md` 和 `progress.md`，未改 `web/`、`server/`、migration、ERP 正式菜单、权限、seed、路由、构建流程或 `docs/current-source-of-truth.md`。内置浏览器对 `file://` 访问被策略拦截，本轮未完成真实浏览器点击验证，只完成静态链接和文件有效性校验；追加前 `progress.md` 为 113 行 / 25618 bytes，未达到归档阈值。

## 2026-06-09 22:42 CST

- 完成：新增本地开发态 `/__dev/prototypes` 产品原型查看器，使用 React dev-only route 浏览 `docs/product/prototypes` 下的 HTML 原型、PNG 方案图和截图证据；左侧支持搜索和状态筛选，右侧通过 iframe 预览 HTML 或直接预览 PNG。
- 完成：新增 `web/src/erp/config/devPrototypes.mjs` 和测试，登记 9 个当前原型资产并锁定 dev-only 路由、类型、状态、路径和筛选行为；新增 `web/src/erp/pages/DevPrototypesPage.jsx`，并接入 `web/src/erp/router.jsx`、`web/package.json` 和 `web/src/erp/styles/app.css`。
- 完成：同步更新 `web/README.md`、`docs/current-source-of-truth.md` 和 `docs/product/prototypes/README.md`，明确 `/__dev/prototypes` 不进入 ERP 正式菜单、seedData、RBAC、后端业务、产品内文档 registry 或生产构建。
- 验证：`node --test src/erp/config/devPrototypes.test.mjs src/erp/config/devDocs.test.mjs`、`pnpm css`、`pnpm lint`、`pnpm test`、`pnpm build:desktop`、顺序重跑 `pnpm style:l1` 和 `git diff --check` 均通过；`pnpm test` 通过 284 项，`style:l1` 通过 41 个场景。
- 验证：Browser 打开 `http://localhost:5175/__dev/prototypes` 成功，页面显示 9 个资产，默认 HTML iframe 预览为“业务模块标准页整页原型”；“当前实现对齐版”筛选只剩 `mobile-role-tasks-implemented`，搜索“风险”只剩 `mobile-role-task-detail` 和 `mobile-role-risk-dashboard`，点击 PNG 卡片能加载 853x1844 图片；390px 移动视口无横向溢出，控制台无 error / warn。
- 下一步：如后续新增原型资产，继续同步 `devPrototypes.mjs`、静态 `index.html` 和原型 README；如需要把 `/__dev/prototypes` 纳入专门 L1 场景，再单独扩展 `styleL1.mjs`。
- 阻塞/风险：本轮只触达前端 dev-only route、样式和正式说明文档；未改 `server/`、migration、ERP 正式菜单、权限、seed、后端业务或生产构建主路径。暗色态通过 CSS/主题覆盖和既有 `style:l1` 主题回归间接覆盖，Browser 直接写 `localStorage` 切暗色被只读执行环境拦截，未完成原型页暗色态的浏览器直测；追加前 `progress.md` 为 121 行 / 27340 bytes，未达到归档阈值。

## 2026-06-09 23:34 CST

- 完成：将默认 `YS` favicon 替换为产品中性后台图标，并新增后台、岗位任务端、开发文档和产品原型四套 SVG favicon；`web/index.html` 与 `web/public/index.html` 不再引用旧 PNG 备用图标。
- 完成：新增 `web/src/common/consts/favicon.mjs` 和测试，按当前路由切换 favicon：后台 `/erp/*` 使用 `/favicon-admin.svg`，岗位任务端 `/m/<role>/tasks` 和独立移动端 `/tasks` 使用 `/favicon-tasks.svg`，开发文档 `/__dev/docs` 使用 `/favicon-docs.svg`，原型 `/__dev/prototypes` 使用 `/favicon-prototypes.svg`；从任务端跳转到登录页时按 `location.state.from` 保持任务端图标。
- 完成：用中性后台图标重新生成 `web/public/favicon.png` 和 `web/src/assets/icons/favicon.png`，避免旧 `YS` PNG 通过直接访问或历史引用残留。
- 验证：`pnpm lint && pnpm css && pnpm test && pnpm build && pnpm style:l1` 通过；`pnpm test` 通过 288 项，`style:l1` 通过 41 个场景。`pnpm build` 仍只有既有的动态 / 静态 import 和 chunk size 警告。
- 验证：Browser 复用 `http://localhost:5175` 依次打开 `/erp/dashboard`、`/m/warehouse/tasks`、`/__dev/docs`、`/__dev/prototypes`，4 个路由页面非空、无 Vite overlay、console 无 error / warn，`link[rel~="icon"]` 分别命中对应 SVG；`curl -I http://localhost:5175/favicon.png` 返回 `200 image/png`。
- 下一步：如要让目标环境浏览器标签页也更新，需要按低配 Docker 发布主路径重新构建并发布 Web 镜像。
- 阻塞/风险：本轮只改 favicon 资源、前端路由切换 helper、测试和过程记录；未改客户配置加载、后端、schema、migration、RBAC、菜单、Workflow / Fact usecase 或部署脚本。Browser 截图接口对当前页面两次 `Page.captureScreenshot` 超时，本轮以 DOM / link / console / HTTP 资源验证收口；追加前 `progress.md` 为 131 行 / 29619 bytes，未达到归档阈值。

## 2026-06-09 23:37 CST

- 完成：补提交 pre-push 后遗留的原型查看器状态筛选控件改动，将 Ant Design `Segmented` 改为页面内自定义按钮组，补齐移动端双列排布和暗色主题状态。
- 验证：第一次 push 的 pre-push 已跑过 `qa:full`，包含 web lint / css / test / build、server 全量检查、govulncheck、secrets、error-code、客户配置和 Phase 边界检查，全部通过。
- 下一步：如继续打磨原型查看器交互，建议把 `/__dev/prototypes` 纳入独立 L1 场景。
- 阻塞/风险：这是补提交第一次 push 后本地遗留的两处前端样式 / 组件改动；未改 schema、migration、后端、菜单、权限或目标环境镜像。追加前 `progress.md` 为 153 行 / 34099 bytes，未达到归档阈值。

## 2026-06-09 23:42 CST

- 完成：为本地开发态 `/__dev/prototypes` 产品原型查看器新增全屏预览能力；选中 HTML 原型时以全屏 iframe 查看，选中 PNG / 截图时以全屏长图查看，支持关闭按钮、`Esc` 关闭和背景滚动锁定。
- 完成：为静态 `docs/product/prototypes/index.html` 新增同类全屏预览能力；页面根据现有资产主链接自动补充“全屏预览”按钮，继续保持手工登记、相对链接、无依赖和无构建工具。
- 完成：同步更新 `docs/product/prototypes/README.md`，明确两个查看器的全屏预览只作为资产查看辅助，不改变资产状态或正式实现口径。
- 验证：`git diff --check -- web/src/erp/pages/DevPrototypesPage.jsx web/src/erp/styles/app.css docs/product/prototypes/index.html docs/product/prototypes/README.md`、静态 `index.html` 内联脚本编译检查、静态 20 个 `href` 本地存在性检查、`node --test src/erp/config/devPrototypes.test.mjs src/erp/config/devDocs.test.mjs`、`pnpm css`、`pnpm lint`、`pnpm test`、`pnpm build:desktop` 均通过；`pnpm test` 通过 287 项，构建仍只有既有 chunk / 动静态 import 警告。
- 验证：`pnpm style:l1` 与 `pnpm build:desktop` 并行时出现一次既有业务弹窗居中断言失败；顺序单独重跑 `pnpm style:l1` 通过 41 个场景。
- 验证：Browser 通过 `http://127.0.0.1:5185/__dev/prototypes` 验证 dev 原型查看器：HTML 全屏 overlay 覆盖 1280x720 视口，iframe 铺满顶部栏以外区域，`Esc` 可关闭并恢复背景滚动；PNG 全屏可加载 853x1844 长图并在容器内滚动；390x844 移动视口无横向溢出，overlay 和关闭按钮按移动宽度适配。
- 验证：Browser 因安全策略拒绝直接访问 `file://`，本轮未绕过该策略；改用 `http://127.0.0.1:5195/index.html` 验证同一个静态 `index.html` 的 9 个资产均生成“全屏预览”按钮，HTML iframe 和 PNG 长图全屏预览均可打开和关闭。
- 下一步：如后续要把全屏预览纳入专门 L1 场景，可扩展 `styleL1.mjs` 覆盖 `/__dev/prototypes` 的 HTML / PNG 全屏状态。
- 阻塞/风险：本轮未改 `server/`、migration、ERP 正式菜单、权限、seed、后端业务或生产构建主路径。原型页暗色态通过 CSS 变量和既有 CSS / L1 回归间接覆盖，未完成原型页暗色态浏览器直测；追加前 `progress.md` 为 141 行 / 31616 bytes，未达到归档阈值。

## 2026-06-10 00:18 CST

- 完成：为本地开发态 `/__dev/prototypes` 产品原型查看器新增轻量目录分组、折叠和置顶能力；资产列表按所属目录分组，置顶资产独立显示在顶部，右侧预览栏也可对当前资产置顶 / 取消置顶。
- 完成：新增原型查看器本地偏好 helper 和测试，清理未知 / 重复 pin key、保持置顶排序、按目录分组，并清理无效展开目录 key；偏好只写浏览器本地，不接后端、权限或正式菜单。
- 完成：同步更新 `docs/product/prototypes/README.md` 和 `web/README.md`，说明 `/__dev/prototypes` 支持目录分组折叠和本地置顶，但仍是独立 dev-only 原型资产入口，不是正式文档 registry。
- 验证：`node --test src/erp/config/devPrototypes.test.mjs src/erp/config/devDocs.test.mjs`、`git diff --check -- web/src/erp/pages/DevPrototypesPage.jsx web/src/erp/config/devPrototypes.mjs web/src/erp/config/devPrototypes.test.mjs web/src/erp/styles/app.css docs/product/prototypes/README.md web/README.md`、`pnpm css`、`pnpm lint`、`pnpm test`、`pnpm style:l1` 均通过；`pnpm test` 通过 290 项，`style:l1` 通过 41 个场景。
- 验证：Browser 通过 `http://127.0.0.1:5186/__dev/prototypes` 验证默认桌面态显示 9 个资产、4 个目录分组且无横向溢出；置顶 `mobile-role-tasks-implemented` 后出现置顶区，折叠 `mobile-role-tasks-v1/images/` 后该组资产隐藏，搜索“当前实现”后只剩匹配的置顶资产；390x844 移动视口筛选区双列排布、无横向溢出，控制台无 error / warn。
- 下一步：如原型资产继续增多，可再评估是否增加“只看置顶 / 展开全部 / 收起全部”这类轻量操作；暂不复制 `/__dev/docs` 的完整文档树 registry。
- 阻塞/风险：本轮只改 `/__dev/prototypes` dev-only 前端入口、样式、测试和说明文档；未改静态 `docs/product/prototypes/index.html`、`server/`、migration、ERP 正式菜单、权限、seed、后端业务、生产构建或目标环境镜像。Browser 只读执行环境不能直接读取 `localStorage`，本地偏好持久化以单元测试和页面可见状态验证收口；追加前 `progress.md` 为 160 行 / 34900 bytes，未达到归档阈值。

## 2026-06-10 10:55 CST

- 完成：新增开发态 `/__dev/capability-ledger` 能力台账只读可视化，解析 `docs/product/product-delivery-ledgers.md` 的产品能力进度台账，展示能力总数、成熟度、所属层、业务域、客户试用和交付承诺分布，并支持关键词 / 层级 / 业务域 / 成熟度筛选与详情查看。
- 完成：新增 `devCapabilityLedger` 解析 helper 和测试；接入 dev-only route、favicon 归类、前端样式浅色 / 暗色覆盖和响应式布局；同步更新 `web/README.md` 与 `docs/current-source-of-truth.md`，明确 Markdown 台账仍是唯一维护入口，可视化不进入 ERP 菜单、RBAC、后端业务、产品内 docs registry 或生产构建。
- 验证：`pnpm lint`、`pnpm css`、`pnpm test` 和 `pnpm style:l1` 均通过；`pnpm test` 通过 294 项，`style:l1` 通过 41 个场景。Browser 验证 `http://127.0.0.1:5175/__dev/capability-ledger` 默认态解析 35 条能力，搜索 `tenant` 收敛到 3 条，选择 `CAP-029` 后详情正确更新；桌面、暗色和 390x844 移动视口横向溢出均为 0，console 无 error / warn。
- 下一步：如台账继续膨胀，可再评估是否拆出正式 `docs/product/capability-ledger.md` 后由可视化读取拆分后的单一能力台账。
- 阻塞/风险：本轮只改 dev-only 前端治理入口、测试和说明文档；未改 `server/`、schema、migration、RBAC、Workflow / Fact usecase、ERP 正式菜单、seed、后端业务、生产构建或目标环境镜像。追加前 `progress.md` 为 170 行 / 37188 bytes，未达到归档阈值。

## 2026-06-10 11:00 CST

- 完成：为本地开发态 `/__dev/prototypes` 原型查看器新增明确的“展开全部 / 收起全部”按钮，放在状态筛选下方；按钮作用于目录分组展开状态，并继续使用浏览器本地偏好保存。
- 完成：确认 `/__dev/prototypes` favicon 已由现有 `resolveERPFavicon('/__dev/prototypes') -> /favicon-prototypes.svg` 覆盖，本轮未重复改 favicon 主路径。
- 验证：`node --test src/erp/config/devPrototypes.test.mjs src/erp/config/devDocs.test.mjs src/common/consts/favicon.test.mjs`、`pnpm css`、`pnpm exec eslint --ext .js --ext .jsx src/`、`git diff --check -- web/src/erp/pages/DevPrototypesPage.jsx web/src/erp/styles/app.css web/src/common/consts/favicon.mjs web/src/common/consts/favicon.test.mjs`、`pnpm test`、`pnpm style:l1` 均通过；`pnpm test` 通过 294 项，`style:l1` 通过 41 个场景。
- 验证：Playwright 通过 `http://127.0.0.1:5187/__dev/prototypes` 验证 favicon 为 `/favicon-prototypes.svg`；默认 4 个目录均展开且显示 9 个资产，点击“收起全部”后 4 个目录均为 `aria-expanded=false` 且资产卡片收起，点击“展开全部”后恢复 9 个资产；390x844 移动视口按钮可见且无横向溢出。
- 下一步：如继续打磨原型查看器，可再评估“只看置顶”或“只看当前筛选结果目录”的操作，但不恢复产品内文档 registry。
- 阻塞/风险：本轮只改 `/__dev/prototypes` dev-only 前端入口和样式；未改静态 `docs/product/prototypes/index.html`、`server/`、schema、migration、RBAC、ERP 正式菜单、seed、后端业务、生产构建或目标环境镜像。in-app Browser 本轮未执行入口脚本，改用本地 Playwright 完成浏览器级验证；追加前 `progress.md` 为 170 行 / 37188 bytes，未达到归档阈值。

## 2026-06-10 11:06 CST

- 完成：为 `/__dev/capability-ledger` 替换为独立 favicon，新增 `web/public/favicon-capability-ledger.svg`，并将能力台账路由从 docs favicon 改为 `capability-ledger` favicon variant。
- 完成：同步更新 favicon 路由单测，要求 `/__dev/capability-ledger` 返回 `/favicon-capability-ledger.svg`，避免后续又回退成 docs favicon。
- 验证：`node --test src/common/consts/favicon.test.mjs` 通过 4 项；Browser 验证 `http://127.0.0.1:5175/__dev/capability-ledger` 页面存在且运行时 `link[rel~="icon"]` href 为 `/favicon-capability-ledger.svg`。
- 下一步：如还要区分 `/__dev/docs` 与其他治理页，可继续按独立 favicon variant 扩展，不复用 docs 图标。
- 阻塞/风险：本轮只改 favicon 静态资产、favicon 映射和测试；未改 ERP 正式菜单、业务页面、后端、schema、migration、RBAC、seed、生产构建或目标环境镜像。追加前 `progress.md` 为 178 行 / 38798 bytes，未达到归档阈值。

## 2026-06-10 11:07 CST

- 完成：将 `/__dev/prototypes` 目录分组操作从两个并排按钮收口为一个按钮，按 `/__dev/docs` 目录树口径显示“展开 / 收起”，减少按钮占位和操作噪音。
- 验证：`node --test src/erp/config/devPrototypes.test.mjs src/common/consts/favicon.test.mjs`、`pnpm css`、`pnpm exec eslint --ext .js --ext .jsx src/erp/pages/DevPrototypesPage.jsx src/erp/config/devPrototypes.mjs src/erp/config/devPrototypes.test.mjs src/common/consts/favicon.test.mjs`、`git diff --check -- web/src/erp/pages/DevPrototypesPage.jsx web/src/erp/styles/app.css progress.md`、`pnpm lint`、`pnpm test`、`pnpm style:l1` 均通过；`pnpm test` 通过 294 项，`style:l1` 通过 41 个场景。
- 验证：Playwright 通过 `http://127.0.0.1:5188/__dev/prototypes` 验证初始单按钮为“收起”，4 个目录均展开且显示 9 个资产；点击后按钮变为“展开”、4 个目录均收起且资产卡片为 0；再次点击恢复“收起”和 9 个资产；favicon 仍为 `/favicon-prototypes.svg`，390x844 移动视口无横向溢出。
- 下一步：如果继续对齐 `/__dev/docs`，可以考虑把目录分组标题也改成“目录”区块标题，但当前不再扩大范围。
- 阻塞/风险：本轮只改 `/__dev/prototypes` dev-only 前端入口、样式和过程记录；未改静态 `docs/product/prototypes/index.html`、后端、schema、migration、RBAC、ERP 正式菜单、seed、生产构建或目标环境镜像。追加前 `progress.md` 为 195 行 / 41691 bytes，未达到归档阈值。

## 2026-06-10 11:14 CST

- 完成：将原 `docs/product/product-delivery-ledgers.md` 拆为索引文档，新增全局 `docs/product/capability-ledger.md`，并把 yoyoosun 客户交付矩阵和客户差异台账分别落到 `docs/customers/yoyoosun/delivery-matrix.md` 与 `docs/customers/yoyoosun/delta-ledger.md`。
- 完成：同步更新 `/__dev/capability-ledger` 读取源、单测样例、README、`docs/current-source-of-truth.md`、`docs/document-inventory.md`、`docs/product/README.md`、`docs/customers/README.md` 和 yoyoosun 客户 README，明确产品能力台账全局一份，客户交付矩阵和客户差异台账按客户一份。
- 验证：已确认能力台账保留 35 条 `CAP-*`，yoyoosun 交付矩阵保留 32 条客户行，yoyoosun 差异台账保留 30 条 `DELTA-YOYOOSUN-*`；旧“产品能力 / 交付 / 差异台账”合并文案已从活跃 README / docs / web 入口清理；`node --test src/erp/config/devCapabilityLedger.test.mjs`、`pnpm lint`、`pnpm test` 和 `git diff --check` 均通过，`pnpm test` 通过 294 项。
- 下一步：后续新增客户时按 `docs/customers/<customer-key>/delivery-matrix.md` 和 `docs/customers/<customer-key>/delta-ledger.md` 新建客户台账，不复制产品能力台账。
- 阻塞/风险：本轮是文档结构和 dev-only 可视化读取源调整；未改后端、schema、migration、RBAC、ERP 正式菜单、seed、生产构建或目标环境镜像。追加前 `progress.md` 为 203 行 / 43272 bytes，未达到归档阈值。

## 2026-06-10 11:40 CST

- 完成：新增 `docs/product/prototypes/admin-command-center-v1/` 后台工作台与看板整套原型，单文件 HTML 覆盖后台首页 / 工作台、任务看板、业务看板、模板打印中心和异常 / 阻塞闭环五个视图，并提供任务详情抽屉、阻塞原因面板、模板切换和异常步骤切换交互。
- 完成：同步更新 `docs/product/prototypes/index.html`、`docs/product/prototypes/README.md`、`docs/document-inventory.md`、`web/src/erp/config/devPrototypes.mjs` 和 `web/src/erp/config/devPrototypes.test.mjs`，让静态原型查看器和开发态 `/__dev/prototypes` 都登记新资产。
- 验证：HTML 内联脚本编译检查、静态原型索引本地链接检查、`node --test web/src/erp/config/devPrototypes.test.mjs`、`pnpm exec eslint --ext .js --ext .jsx src/erp/config/devPrototypes.mjs src/erp/config/devPrototypes.test.mjs`、指定文件 `git diff --check` 均通过；Playwright 打开 `admin-command-center-v1/index.html` 验证桌面五视图切换、任务抽屉、阻塞原因面板、模板切换、异常步骤切换和 390x844 移动视口无横向溢出。
- 下一步：如果要落地真实运行时页面，应先分别评审任务看板、业务看板和工作台的菜单入口、RBAC 权限码、后端 API 聚合口径和浏览器回归范围；不要直接复制 HTML 到 `web/src`。
- 阻塞/风险：本轮只新增和登记原型资产，未改后端、schema、migration、WorkflowUsecase、Fact usecase、ERP 正式菜单、seed、生产构建或目标环境镜像。工作区已有多处非本轮文档 / dev-only 改动，本轮未回退或整理；追加前 `progress.md` 为 211 行 / 44796 bytes，未达到归档阈值。

## 2026-06-10 12:19 CST

- 完成：新增开发态 `/__dev/testing` 测试入口，解析 `docs/product/test-strategy.md` 的 T0-T8 测试分层，并从 `docs/**/*.md` 中筛出测试、验收、QA、smoke、`style:l1` 等相关文档和 fenced command blocks。
- 完成：新增 `devTesting` 解析 helper、单测和 `DevTestingPage`；接入 dev-only router、浅色 / 暗色 / 响应式样式、默认前端测试脚本和 `style:l1` 场景；同步更新 `web/README.md` 与 `docs/current-source-of-truth.md`，明确该入口不进 ERP 菜单、seedData、RBAC、后端业务、产品内 docs registry 或生产构建。
- 验证：`node --test web/src/erp/config/devTesting.test.mjs`、`pnpm --dir web css`、`pnpm --dir web lint`、`pnpm --dir web test`、`STYLE_L1_SCENARIOS=dev-testing-dark-desktop pnpm --dir web style:l1`、`STYLE_L1_PORT=4185 pnpm --dir web style:l1` 均通过；完整 `style:l1` 通过 44 个场景。Browser 通过 `http://127.0.0.1:5175/__dev/testing` 验证默认态 9 个测试层级、92 篇相关文档、命令视图 280 个命令块、包含 `pnpm style:l1` 和 `scripts/qa/fast.sh`，桌面与 390x844 移动视口均无横向溢出。
- 下一步：如后续测试文档继续膨胀，可再评估是否默认隐藏 `docs/reference/*` 或为发布 evidence 单独加筛选组；当前先保持“docs 下测试相关文档可发现”的总入口。
- 阻塞/风险：完整 `style:l1` 前两次分别因 4173 端口残留和 `erp-dashboard-dark-desktop` 偶发加载时序失败，清理为独立端口后重跑通过；本轮未改后端、schema、migration、RBAC、ERP 正式菜单、seed、业务事实、生产构建或目标环境镜像。工作区已有多处非本轮 dev-only / dashboard / prototype 改动，本轮未回退或整理；追加前 `progress.md` 为 236 行 / 50197 bytes，未达到归档阈值。

## 2026-06-10 12:08 CST

- 完成：把开发态 `/__dev/capability-ledger` 从单一产品能力台账扩展为三账联动可视化，继续只读解析 `docs/product/capability-ledger.md`，并新增读取 `docs/customers/yoyoosun/delivery-matrix.md` 与 `docs/customers/yoyoosun/delta-ledger.md`。
- 完成：新增产品能力 / 客户交付 / 客户差异三个视图，支持关键词、产品能力层级 / 业务域 / 成熟度、客户交付状态 / CAP ID、客户差异分类 / Product Core 判断筛选；产品能力详情展示 yoyoosun 交付关联和差异关联，只按显式 `CAP-*` 建立关联，不猜测客户差异到产品能力的隐含关系。
- 完成：同步更新 `web/README.md` 和 `docs/current-source-of-truth.md`，明确该入口是 dev-only 三账只读联动，不进入 ERP 正式菜单、RBAC、后端 API、schema、migration 或产品内 docs registry。
- 验证：`node --test web/src/erp/config/devCapabilityLedger.test.mjs` 通过 6 项；`pnpm lint`、`pnpm css`、`pnpm test` 均通过，`pnpm test` 通过 296 项；指定文件 `git diff --check` 通过。Browser 通过 `http://127.0.0.1:5175/__dev/capability-ledger` 验证默认产品能力视图 35 条、三视图切换、`CAP-029` 搜索收敛到 1/35、390x844 移动视口横向溢出为 0。
- 下一步：如果后续新增第二个客户，可以把当前 yoyoosun source path 抽成 dev-only 客户选择，但仍应先保持 Markdown 台账为唯一维护入口。
- 阻塞/风险：`pnpm style:l1` 当前失败在既有 `erp-dashboard-desktop` 场景，错误为未找到“待处理任务数”；工作区已有非本轮 `web/src/erp/pages/DashboardPage.jsx` 删除现场，本轮未回退或修复该相邻改动。Browser console 存在编辑期旧 HMR reload 失败日志，但新渲染页面无 Vite overlay，DOM 回归和交互验证均通过。追加前 `progress.md` 为 219 行 / 46538 bytes，未达到归档阈值。

## 2026-06-10 12:32 CST

- 完成：新增开发态 `/__dev/customer-config` 客户配置总控页，基于现有 yoyoosun 客户配置资料只读汇总前端品牌 / 菜单 runtime、字段 / 编号草案、导入 tooling 和边界状态；该入口只在 `import.meta.env.DEV` 下注册，不进入 ERP 正式菜单、seedData、RBAC、后端业务、真实导入或生产构建。
- 完成：新增 `devCustomerConfig` 汇总 helper、单测、页面样式、暗色 / 移动端回归场景和独立 `/favicon-customer-config.svg`；同步更新 favicon 路由映射、`web/README.md` 与 `docs/current-source-of-truth.md`，明确 `config/customers/yoyoosun/*`、`scripts/import/*` 和正式文档仍是维护真源。
- 验证：`node --test src/erp/config/devCustomerConfig.test.mjs src/common/consts/favicon.test.mjs`、`node scripts/qa/customer-config-boundaries.mjs`、`pnpm lint`、`pnpm css`、`pnpm test`、`STYLE_L1_SCENARIOS=dev-customer-config-dark-desktop,dev-customer-config-mobile pnpm style:l1`、`pnpm style:l1` 和 `git diff --check` 均通过；`pnpm test` 当前通过 306 项，完整 `style:l1` 通过 44 个场景，客户配置 L1 覆盖暗色桌面、视图切换、favicon 和 390x844 移动视口无横向溢出。Browser 通过 `http://127.0.0.1:5189/__dev/customer-config` 验证标题、yoyoosun、字段编号、导入工具、`/favicon-customer-config.svg`、无横向溢出和 console error 为空。
- 下一步：如后续要把字段 / 编号草案接入运行时，应先做 Product Core 评审、schema / API / UI / 测试边界确认，再从当前只读 dev 页面推进，不直接把草案写入业务 usecase。
- 阻塞/风险：本轮未执行真实客户数据导入、未写数据库、未改后端 / schema / migration / RBAC / ERP 正式菜单 / seed / 生产构建；工作区已有多处非本轮 dev-only 和原型改动，本轮未回退或整理。追加前 `progress.md` 为 228 行 / 48487 bytes，未达到归档阈值。

## 2026-06-10 12:22 CST

- 完成：恢复前端 `style:l1` 基线。原 dashboard 断言已随当前 `DashboardPage.jsx` 恢复通过；继续修复新暴露的 `dev-customer-config-dark-desktop` 失败，把 `runtimeEnabled=false` 显式纳入客户字段编号草案的边界守卫输出，并补充 `devCustomerConfig` 单测。
- 完成：修复 `web/scripts/styleL1.mjs` 场景隔离和本地预览启动判定。每个场景改为独立 browser context，避免 localStorage / 登录态在全量场景之间串场；预览进程若已非 0 退出则直接失败，不再误连端口上可能残留的旧服务。
- 验证：`node --test web/src/erp/config/devCustomerConfig.test.mjs` 通过 5 项；`node --check web/scripts/styleL1.mjs`、`pnpm lint`、`pnpm css`、`pnpm style:l1` 和 `pnpm test` 均通过；完整 `style:l1` 通过 44 个场景，`pnpm test` 通过 306 项；4173 端口收口后无残留监听。
- 下一步：当前可继续做真实运行时页面评审或下一个 dev-only 治理入口，但前端样式回归基线已恢复，后续改动应保持每轮都能完整跑过 `style:l1`。
- 阻塞/风险：本轮只修 QA 脚本隔离和客户配置 dev-only 守卫展示；未改后端、schema、migration、RBAC、ERP 正式菜单、seed、业务事实、生产构建或目标环境镜像。工作区已有多处非本轮 dev-only / dashboard / prototype 改动，本轮未回退或整理；追加前 `progress.md` 为 244 行 / 52340 bytes，未达到归档阈值。

## 2026-06-10 12:24 CST

- 完成：把后台 `/erp/dashboard` 从原任务列表升级为工作台式任务协同入口，保留“任务看板”路由和既有 L1 文案契约，同时新增任务池总览、统计卡、状态 / 角色 / 到期 / 来源筛选、任务泳道、分页表格、详情抽屉、阻塞原因面板、催办和完成动作。
- 完成：新增 `workflowTaskBoard` 展示 helper 与测试，统一任务状态文案、负责人角色、到期标签、阻塞 / 退回原因读取、筛选和泳道分组；同步更新业务看板边界提示、打印中心回工作台入口、工作台样式浅色 / 暗色 / 响应式覆盖、`web/README.md` 和 `web/package.json` 测试清单。
- 验证：`pnpm lint`、`pnpm css`、`pnpm test`、`pnpm style:l1`、`git diff --check` 均通过；`pnpm test` 当前通过 310 项，完整 `style:l1` 通过 44 个场景。另用 Playwright 在 `http://127.0.0.1:5187/erp/dashboard` mock workflow/admin RPC 验证任务详情抽屉、提交阻塞原因、桌面和 390x844 移动视口横向溢出均通过。
- 下一步：如果要继续推进，可评审是否把任务看板的筛选状态写入 URL 或本地偏好；当前先保持运行时最小闭环，不新增后端聚合 API。
- 阻塞/风险：本轮只改桌面前端工作台、现有 workflow API 调用、样式、测试和前端说明；未改后端、schema、migration、RBAC 权限码、seed、WorkflowUsecase、Fact usecase、库存 / 出货 / 应收 / 开票 / 收付款事实写入、生产构建或目标环境镜像。工作区仍有多处非本轮 dev-only / 文档 / 原型改动，本轮未回退或整理；追加前 `progress.md` 为 252 行 / 53845 bytes，未达到归档阈值。

## 2026-06-10 12:25 CST

- 完成：同步后台工作台与看板原型的运行时承接口径，明确 `docs/product/prototypes/admin-command-center-v1/` 仍是参考原型，而 `/erp/dashboard`、`/erp/business-dashboard` 和 `/erp/print-center` 已分别承接 Workflow 任务工作台、业务摘要看板和模板打印中心。
- 完成：更新 `docs/current-source-of-truth.md` 和 `web/README.md`，把原型参考、运行时入口、Workflow / Fact 边界和不写库存 / 出货 / 财务 / 发票 / 收付款事实的限制写到正式阅读入口。
- 验证：`git diff --check -- docs/product/prototypes/admin-command-center-v1/README.md docs/current-source-of-truth.md web/README.md progress.md` 通过。
- 下一步：可继续评审任务看板是否需要 URL / 本地偏好保存，或转向下一个 dev-only 治理入口；若继续扩展运行时工作台，需先评审菜单、RBAC、seed、后端聚合口径和浏览器回归范围。
- 阻塞/风险：本轮只同步文档口径，未改后端、schema、migration、RBAC、seed、WorkflowUsecase、Fact usecase、正式菜单、生产构建或目标环境镜像；追加前 `progress.md` 为 260 行 / 55576 bytes，未达到归档阈值。

## 2026-06-10 12:30 CST

- 完成：将 `/erp/dashboard` 任务工作台筛选状态收口到 URL query，关键词、状态、角色、到期和来源筛选可复制链接并在刷新后恢复；默认筛选不写入 URL，无关 query 参数保留。
- 完成：新增 `workflowTaskBoard` URL 筛选读写 helper 和单测，`DashboardPage` 改为从 `useSearchParams` 派生筛选状态；扩展 `erp-dashboard-desktop` L1 场景，覆盖关键词 / 角色筛选写入 URL、刷新恢复和任务跳转仍可用。
- 完成：修复 `style:l1` 本地预览启动探活，`fetch` 失败但 Vite 本地端口已 TCP 可连时允许继续进入浏览器加载，避免 Vite 已 ready 但 Node fetch 瞬时失败导致误判。
- 完成：同步更新 `docs/current-source-of-truth.md` 和 `web/README.md`，明确 URL 筛选只影响当前页面展示，不写后端用户偏好、WorkflowUsecase 或事实表。
- 验证：`node --test web/src/erp/utils/workflowTaskBoard.test.mjs`、`node --check web/scripts/styleL1.mjs`、`pnpm --dir web css`、`pnpm --dir web lint`、`pnpm --dir web test`、`STYLE_L1_SCENARIOS=erp-dashboard-desktop STYLE_L1_PORT=4186 pnpm --dir web style:l1`、`STYLE_L1_SCENARIOS=root-redirect-desktop,root-redirect-mobile,admin-login-mobile,admin-login-theme-modes-desktop STYLE_L1_PORT=4191 pnpm --dir web style:l1` 和 `STYLE_L1_PORT=4192 pnpm --dir web style:l1` 均通过；`pnpm test` 当前通过 312 项，完整 `style:l1` 通过 44 个场景。
- 下一步：可继续把业务看板的状态钻取参数和任务工作台筛选参数做双向联动，或先补任务工作台筛选清空按钮；当前不新增后端聚合 API。
- 阻塞/风险：本轮只改桌面前端页面状态、helper、L1 回归和文档；未改后端、schema、migration、RBAC、seed、WorkflowUsecase、Fact usecase、正式菜单、生产构建或目标环境镜像。追加前 `progress.md` 为 268 行 / 56802 bytes，未达到归档阈值。

## 2026-06-10 12:38 CST

- 完成：为 `/erp/dashboard` 任务工作台新增“清空筛选”按钮；仅在关键词、状态、角色、到期或来源存在非默认筛选时启用，点击后移除任务看板自己的 URL query 参数并保留无关 query。
- 完成：新增 `hasActiveWorkflowTaskBoardFilters` helper 和单测，扩展 `erp-dashboard-desktop` L1 场景，覆盖筛选后按钮启用、清空后 URL 和输入框恢复默认、按钮禁用以及任务跳转仍可用。
- 完成：同步更新 `docs/current-source-of-truth.md` 和 `web/README.md`，明确任务筛选支持复制链接、刷新恢复和一键清空，但仍只影响页面展示。
- 验证：`node --test web/src/erp/utils/workflowTaskBoard.test.mjs`、`node --check web/scripts/styleL1.mjs`、`pnpm --dir web css`、`STYLE_L1_SCENARIOS=erp-dashboard-desktop STYLE_L1_PORT=4195 pnpm --dir web style:l1`、`pnpm --dir web lint`、`pnpm --dir web test` 和 `STYLE_L1_PORT=4196 pnpm --dir web style:l1` 均通过；`pnpm test` 当前通过 313 项，完整 `style:l1` 通过 44 个场景。首次 dashboard 定向 L1 曾出现浏览器 `localStorage access denied` 偶发 pageerror，换新端口重跑同场景通过。
- 下一步：可继续做业务看板状态钻取参数与任务工作台筛选参数的双向联动；当前仍不新增后端聚合 API。
- 阻塞/风险：本轮只改桌面前端筛选交互、helper、样式、L1 回归和文档；未改后端、schema、migration、RBAC、seed、WorkflowUsecase、Fact usecase、正式菜单、生产构建或目标环境镜像。追加前 `progress.md` 为 278 行 / 58768 bytes，未达到归档阈值。

## 2026-06-10 13:27 CST

- 完成：提交前修复 `web/scripts/styleL1.mjs` 登录页类 L1 场景的 `/rpc/auth` capabilities mock，避免本地无后端时 Vite proxy 500 被误判为页面控制台错误；保留控制台错误零容忍校验，不放宽失败条件。
- 完成：按用户要求准备提交推送当前工作区全部代码，提交范围包括后台工作台 / 看板、dev-only 能力台账 / 客户配置 / 测试入口、原型登记、favicon、正式说明文档和本过程记录。
- 验证：`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test` 已通过，`pnpm test` 当前通过 313 项；`pnpm --dir web style:l1` 重跑通过 44 个场景。首次完整链路曾暴露登录页 `/rpc/auth` proxy 500 和 `erp-dashboard-mobile` 偶发等待问题，修复 mock 后完整重跑通过。
- 下一步：完成 `git add -A`、提交和推送；推送前继续确认 `origin/main...HEAD` 状态，若远端新增提交则按仓库 Git 约定停止直接覆盖。
- 阻塞/风险：本轮收口只补 L1 mock 和提交前验证记录；未改后端、schema、migration、RBAC、seed、WorkflowUsecase、Fact usecase、ERP 正式菜单、生产构建或目标环境镜像。追加前 `progress.md` 为 287 行 / 60432 bytes，未达到归档阈值。

## 2026-06-10 13:54 CST

- 完成：新增开发态 `/__dev` 入口总控页，集中展示 `/__dev/docs`、`/__dev/testing`、`/__dev/prototypes`、`/__dev/capability-ledger` 和 `/__dev/customer-config`，支持按标题、分组、路径和资料来源搜索后跳转；该入口仍只在 `import.meta.env.DEV` 下注册，不进入 ERP 正式菜单、seedData、RBAC、后端业务、产品内 docs registry 或生产构建。
- 完成：新增 `devHub` 配置 helper、单测、页面样式、暗色 / 移动端 L1 场景；新增 `/favicon-dev.svg` 与 `/favicon-testing.svg`，并更新 favicon 路由映射，使 `/__dev` 使用开发总控图标、`/__dev/testing` 使用测试图标；同步更新 `web/README.md` 和 `docs/current-source-of-truth.md`。
- 验证：`node --test web/src/erp/config/devHub.test.mjs web/src/common/consts/favicon.test.mjs`、`node --check web/scripts/styleL1.mjs`、`pnpm --dir web css`、目标文件 ESLint、`pnpm --dir web lint`、`pnpm --dir web test` 和 `STYLE_L1_SCENARIOS=dev-hub-dark-desktop,dev-testing-dark-desktop STYLE_L1_PORT=4197 pnpm --dir web style:l1` 均通过；`pnpm test` 当前通过 317 项。Browser 通过 `http://127.0.0.1:5201/__dev` 验证桌面 5 个入口、搜索“测试”后只剩 `/__dev/testing`、跳转到测试入口、两页 favicon 分别为 `/favicon-dev.svg` 和 `/favicon-testing.svg`，console warn/error 为空，桌面与 390x844 移动视口均无横向溢出。
- 下一步：如果后续 dev-only 页面继续增多，可以在 `/__dev` 里增加分组折叠或最近访问本地偏好；当前先保持只读搜索和跳转，不新增 registry、权限、后端 API 或生产入口。
- 阻塞/风险：完整 `pnpm --dir web style:l1` 本轮两次重跑分别在既有 `mobile-tasks-dark` 导航 `ERR_ADDRESS_INVALID` 和既有 `admin-login-mobile-source-desktop-choice` 回跳断言失败处中断；后者单场景 `STYLE_L1_SCENARIOS=admin-login-mobile-source-desktop-choice STYLE_L1_PORT=4200 pnpm --dir web style:l1` 通过，新增的两个 dev-only 场景已定向通过。追加前 `progress.md` 为 295 行 / 61731 bytes，未达到归档阈值；本轮未改后端、schema、migration、RBAC、seed、WorkflowUsecase、Fact usecase、ERP 正式菜单、生产构建或目标环境镜像。

## 2026-06-10 14:27 CST

- 完成：为开发态 `/__dev` 入口总控补充浏览器本地“最近访问”偏好，点击任一 dev-only 入口后会记录最近 3 个有效 `/__dev/*` 子入口；无效路径、重复路径和非 dev 路径会被过滤，不写后端、权限、菜单、seedData 或产品内 docs registry。
- 完成：新增 `DEV_HUB_RECENT_STORAGE_KEY`、最近访问归一化 / 记录 / 映射 helper 和单测；页面新增最近访问区，样式覆盖浅色、暗色和移动端；`dev-hub-dark-desktop` L1 场景补充空态、非法路径过滤、最近访问顺序和横向溢出断言；同步更新 `web/README.md` 与 `docs/current-source-of-truth.md`。
- 验证：`node --test web/src/erp/config/devHub.test.mjs`、`node --check web/scripts/styleL1.mjs`、`pnpm --dir web css`、目标文件 ESLint、`pnpm --dir web lint`、`pnpm --dir web test`、`STYLE_L1_SCENARIOS=dev-hub-dark-desktop STYLE_L1_PORT=4201 pnpm --dir web style:l1` 和 `STYLE_L1_PORT=4202 pnpm --dir web style:l1` 均通过；完整 `style:l1` 当前通过 45 个场景，`pnpm test` 当前通过 320 项。Browser 通过 `http://127.0.0.1:5202/__dev` 验证空态、点击 `/__dev/testing` 后回到总控出现最近访问 `/__dev/testing`、favicon 正确、console warn/error 为空，桌面与 390x844 移动视口无横向溢出。
- 下一步：如继续优化 dev-only 总控，可增加“分组折叠 / 只看某类治理面”这类纯前端本地偏好；仍不应引入后端 registry、正式菜单、RBAC 或生产入口。
- 阻塞/风险：首次完整 `pnpm --dir web test` 因本机 Node 子进程 `spawn /usr/local/bin/node EAGAIN` 导致 `linkedNavigation` 与 `masterDataOrderView` 两个文件未启动，单独复跑通过，随后完整 `pnpm --dir web test` 重跑通过。追加前 `progress.md` 为 303 行 / 64030 bytes，未达到归档阈值；本轮未改后端、schema、migration、RBAC、seed、WorkflowUsecase、Fact usecase、ERP 正式菜单、生产构建或目标环境镜像。

## 2026-06-10 14:42 CST

- 完成：为开发态 `/__dev` 入口总控新增治理分组筛选，按“文档治理 / 验证治理 / 产品设计 / 产品治理 / 客户治理”切换，并与关键词搜索组合生效；默认仍显示全部入口，不持久化筛选条件，避免上次筛选影响下一次进入总控。
- 完成：新增 `DEV_HUB_ALL_GROUP`、分组选项构造和组合筛选 helper，补充单测、Ant Design `Segmented` 样式、暗色 / 移动端回归断言；同步更新 `web/README.md` 与 `docs/current-source-of-truth.md`，明确 `/__dev` 提供分组筛选、搜索、跳转和浏览器本地最近访问记录。
- 验证：`node --test web/src/erp/config/devHub.test.mjs`、`node --check web/scripts/styleL1.mjs`、`pnpm --dir web css`、目标文件 ESLint、`pnpm --dir web lint`、`pnpm --dir web test` 和 `STYLE_L1_SCENARIOS=dev-hub-dark-desktop STYLE_L1_PORT=4203 pnpm --dir web style:l1` 均通过；`pnpm test` 当前通过 321 项。完整 `STYLE_L1_PORT=4204 pnpm --dir web style:l1` 曾在既有 `print-preview-material` 等待“采购合同”标题处超时，随后 `STYLE_L1_SCENARIOS=print-preview-material STYLE_L1_PORT=4205 pnpm --dir web style:l1` 单场景复跑通过。Browser 通过 `http://127.0.0.1:5203/__dev` 验证桌面 5 个入口、`产品治理` 分组收敛到 `/__dev/capability-ledger`、切回全部后搜索“测试”收敛到 `/__dev/testing`、`/favicon-dev.svg` 正确、console warn/error 为空，桌面与 390x844 移动视口无横向溢出。
- 下一步：如继续优化 dev-only 总控，可评审是否需要把分组筛选写入 URL 或本地偏好；当前先保持默认全量视图，避免开发入口被历史筛选状态隐藏。
- 阻塞/风险：本轮仍只改 dev-only 前端入口、测试、样式和说明文档；未改后端、schema、migration、RBAC、seedData、WorkflowUsecase、Fact usecase、ERP 正式菜单、产品内 docs registry、生产构建或目标环境镜像。追加前 `progress.md` 为 311 行 / 66058 bytes，未达到归档阈值。

## 2026-06-10 15:37 CST

- 完成：为开发态 `/__dev/testing` 测试入口补齐 T0-T8 每层“一键复制”按钮，并新增“本轮前端验证 / 提交前 QA / 发版前严格 QA”三个常用复制预设；按钮只写入浏览器剪贴板，不在浏览器内执行 shell。
- 完成：在 `devTesting` 配置层收口复制预设、分层复制文本和 T1 / T7 / T8 的说明性 fallback；T7 明确当前没有完整业务 E2E runner，只复制当前可用事实层检查和后续说明，避免把未来能力伪装成当前自动化。
- 完成：同步更新 `web/README.md` 与 `docs/current-source-of-truth.md`，明确测试入口支持每层及常用预设一键复制命令 / 清单，但不进入 ERP 菜单、seedData、RBAC、后端业务、产品内 docs registry 或生产构建。
- 验证：`node --test web/src/erp/config/devTesting.test.mjs`、`node --check web/scripts/styleL1.mjs`、目标文件 ESLint、`pnpm --dir web css`、`pnpm --dir web lint`、`pnpm --dir web test`、`STYLE_L1_SCENARIOS=dev-testing-dark-desktop STYLE_L1_PORT=4206 pnpm --dir web style:l1` 和 `STYLE_L1_PORT=4207 pnpm --dir web style:l1` 均通过；`pnpm test` 当前通过 327 项，完整 `style:l1` 通过 45 个场景。Codex app 崩溃后 Browser 插件会话不可用，改用项目 Playwright 在 `http://127.0.0.1:5205/__dev/testing` 验证桌面 9 个层级、9 个层级复制按钮、3 个常用预设、T7 无完整 E2E runner 提示、测试 favicon、命令入口、T5 和前端预设复制内容、console warn/error 为空，桌面与 390x844 移动视口无横向溢出。
- 下一步：如果要进一步提升测试入口，可增加“按本轮改动类型推荐测试层级”的只读选择器；当前仍不引入浏览器内执行器或 dev 后端 runner。
- 阻塞/风险：本轮只改 dev-only 测试入口、测试、样式、L1 回归和说明文档；未改后端、schema、migration、RBAC、seedData、WorkflowUsecase、Fact usecase、ERP 正式菜单、产品内 docs registry、生产构建或目标环境镜像。追加前 `progress.md` 为 344 行 / 74418 bytes，未达到归档阈值；工作区仍包含前面几轮未提交改动和相邻 favicon / 品牌相关现场，本轮未回退或整理。

## 2026-06-10 15:35 CST

- 完成：为开发态 `/__dev/testing` 测试入口补齐 T0-T8 每层一键复制命令 / 清单；T7 明确当前没有完整业务 E2E runner，只复制当前可用事实层检查与“按阶段选择 Phase PG”的说明，不伪造自动化能力。
- 完成：新增“本轮前端验证 / 提交前 QA / 发版前严格 QA”三个顶部常用预设；复制按钮只写浏览器剪贴板，不在页面内执行 shell，不接后端 runner、正式菜单、RBAC、seedData、产品内 docs registry 或生产构建。同步更新 `web/README.md` 与 `docs/current-source-of-truth.md`。
- 验证：`node --test web/src/erp/config/devTesting.test.mjs`、`node --check web/scripts/styleL1.mjs`、目标文件 ESLint、`pnpm --dir web css`、`pnpm --dir web test`、`STYLE_L1_SCENARIOS=dev-testing-dark-desktop STYLE_L1_PORT=4206 pnpm --dir web style:l1`、`pnpm --dir web lint` 和 `STYLE_L1_PORT=4207 pnpm --dir web style:l1` 均通过；`pnpm test` 当前通过 327 项，完整 `style:l1` 当前通过 45 个场景。L1 已覆盖 3 个顶部预设、每层复制按钮、前端预设剪贴板内容、T5 层级剪贴板内容、暗色桌面和无横向溢出。
- 下一步：如后续确实要“一键执行”，需要另行评审 dev-only 本地 runner / 后端桥接的安全边界、权限、输出日志和不可进入生产的守卫；当前建议继续停留在一键复制。
- 阻塞/风险：Browser 插件路径在本轮验证时先出现 native pipe closed，重连后返回 `Browser is not available: iab`，因此未完成 in-app Browser 实测；已用仓库 L1 的真实 Chromium 渲染与剪贴板交互覆盖本轮 UI 行为。追加前 `progress.md` 为 336 行 / 72584 bytes，未达到归档阈值；当前工作区还有相邻未提交改动，本轮未回退或整理。

## 2026-06-10 15:05 CST

- 完成：将开发态 `/__dev` 入口总控升级为入口台账 / 管理页，每个入口展示维护真源和边界标签，并新增浏览器本地置顶入口；置顶和最近访问只写本地偏好，不写后端配置。
- 完成：新增 `DEV_HUB_PINNED_STORAGE_KEY`、置顶归一化 / 切换 / 映射 helper，补充 devHub 单测、页面图钉交互、浅色 / 暗色 / 移动端样式和 `dev-hub-dark-desktop` L1 断言；同步更新 `docs/current-source-of-truth.md` 与 `web/README.md`，明确 `/__dev` 是 dev-only 入口台账，不进入正式菜单、seedData、RBAC、后端业务、产品内 docs registry 或生产构建。
- 验证：`pnpm --dir web exec eslint --fix --ext .js --ext .jsx src/erp/config/devHub.mjs src/erp/config/devHub.test.mjs src/erp/pages/DevHubPage.jsx`、`pnpm --dir web exec node --test src/erp/config/devHub.test.mjs`、`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test`、`STYLE_L1_SCENARIOS=dev-hub-dark-desktop pnpm --dir web style:l1` 和 `pnpm --dir web style:l1` 均通过；完整 `style:l1` 当前通过 45 个场景，`pnpm test` 当前通过 324 项。Browser 通过 `http://localhost:5175/__dev` 验证页面非空、5 个入口、15 个边界标签、5 个图钉按钮、置顶新增 / 取消 DOM 状态、console warn/error 为空，桌面 1280 宽与 390x844 移动视口均无横向溢出。
- 下一步：后续如果 `/__dev/*` 继续增加，优先只扩展 `DEV_HUB_ITEMS` 台账元数据和对应 dev-only 页面；不新增第二套管理页、不接后端 registry、不接正式菜单。
- 阻塞/风险：Browser 移动截图捕获曾因 CDP `Page.captureScreenshot` 超时中断一次，已恢复默认视口并改用 DOM / box metrics 完成移动回归；本轮未改后端、schema、migration、RBAC、seedData、WorkflowUsecase、Fact usecase、ERP 正式菜单、产品内 docs registry、生产构建或目标环境镜像。追加前 `progress.md` 为 319 行 / 68125 bytes，未达到归档阈值。

## 2026-06-10 15:28 CST

- 完成：为 yoyoosun 客户配置包新增甲方专属 favicon，`config/customers/yoyoosun/menuConfig.mjs` 的 `brand.faviconHref` 指向 `/favicon-yoyoosun.svg`；默认中性产品品牌仍不带客户 favicon。
- 完成：`getActiveERPBrand()` 现在会从 runtime config、客户 key 或 yoyoosun bundled config 读取 `faviconHref`；`applyERPFavicon()` 在后台和岗位任务端等客户运行时路径优先使用客户 favicon，但 `/__dev`、`/__dev/testing`、`/__dev/docs`、`/__dev/prototypes`、`/__dev/capability-ledger` 和 `/__dev/customer-config` 继续使用各自开发态识别图标。
- 完成：同步更新 `docs/current-source-of-truth.md` 与 `web/README.md`，明确客户前端展示配置包含品牌、favicon 和菜单，且只影响前端展示，不替代后端 RBAC、Workflow / Fact usecase、schema、migration 或真实导入。
- 验证：`pnpm --dir web exec node --test src/common/consts/brand.test.mjs src/common/consts/favicon.test.mjs`、`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test` 均通过；`pnpm test` 当前通过 326 项。临时启动 `VITE_ERP_CUSTOMER_KEY=yoyoosun pnpm --dir web exec vite --config vite.config.mjs --host 127.0.0.1 --port 5210` 后，Browser 验证 `http://127.0.0.1:5210/erp/dashboard` 重定向到登录页仍使用 `/favicon-yoyoosun.svg`，`http://127.0.0.1:5210/__dev` 仍使用 `/favicon-dev.svg`，console warn/error 为空；`curl` 验证 `/favicon-yoyoosun.svg` 和 `/favicon-dev.svg` 资产可访问。完整 `pnpm --dir web style:l1` 曾在既有 `business-module-toolbar-mobile-dropdown` 等待标题处超时，随后 `STYLE_L1_SCENARIOS=business-module-toolbar-mobile-dropdown pnpm --dir web style:l1` 单场景复跑通过；`STYLE_L1_PORT=4210 STYLE_L1_SCENARIOS=dev-hub-dark-desktop,dev-testing-dark-desktop pnpm --dir web style:l1` 通过。
- 下一步：如果后续新增其他客户，按 `config/customers/<customer-key>/menuConfig.mjs` 增加各自 `brand.faviconHref`，不要把客户 favicon 写死到通用 favicon helper。
- 阻塞/风险：本轮只改前端品牌 / favicon 展示链路、客户配置、文档和测试；未改后端、schema、migration、RBAC、seedData、WorkflowUsecase、Fact usecase、ERP 正式菜单、产品内 docs registry、生产构建或目标环境镜像。追加前 `progress.md` 为 327 行 / 70157 bytes，未达到归档阈值。

## 2026-06-10 15:48 CST

- 完成：将开发态 `/__dev` 入口总控中的入口卡片统一改为新标签打开，置顶、最近访问和主入口列表都走 `target="_blank"` / `rel="noreferrer"`；只影响总控页入口跳转，不改变 ERP 正式业务页或各 `/__dev/*` 子页内部导航。
- 完成：扩展 `dev-hub-dark-desktop` L1 断言，锁住入口链接 `href` 仍指向 `/__dev/*`、`target="_blank"` 且 `rel="noreferrer"`；同步更新 `docs/current-source-of-truth.md` 与 `web/README.md`。
- 验证：`pnpm --dir web exec eslint --fix --ext .js --ext .jsx src/erp/pages/DevHubPage.jsx`、`pnpm --dir web exec node --test src/erp/config/devHub.test.mjs`、`STYLE_L1_PORT=4211 STYLE_L1_SCENARIOS=dev-hub-dark-desktop pnpm --dir web style:l1` 均通过。Browser 通过 `http://localhost:5175/__dev` 验证页面 5 个主入口卡片、所有 `.erp-dev-hub-card__link` 的 `target` 均为 `_blank`、`rel` 均为 `noreferrer`，console warn/error 为空，桌面无横向溢出。
- 下一步：如后续要给某个 `/__dev/*` 子页内部链接也新标签打开，应单独按页面使用场景评审；不要扩大到 ERP 正式业务导航。
- 阻塞/风险：本轮只改 dev-only 总控入口链接行为、L1 断言和说明文档；未改后端、schema、migration、RBAC、seedData、WorkflowUsecase、Fact usecase、ERP 正式菜单、生产构建或目标环境镜像。追加前 `progress.md` 为 353 行 / 76674 bytes，未达到归档阈值。

## 2026-06-10 17:09 CST

- 完成：为开发态 `/__dev/customer-config` 预留客户包选择器和 URL query `customer`；query 缺失默认 `yoyoosun`，当前 registry 只登记 `yoyoosun`，后续新增客户包可在同一 registry 扩展。未登记 customer 显示“未登记客户配置包”和已登记客户列表，不 fallback 到 yoyoosun 冒充。
- 完成：客户配置总控页新增下拉选择器，切换只更新 URL query，不写 localStorage、后端、数据库或正式运行配置；未知客户阻断态不展示 yoyoosun 菜单品牌内容。同步更新 `web/README.md` 与 `docs/current-source-of-truth.md`。
- 验证：`node --test web/src/erp/config/devCustomerConfig.test.mjs`、`node --check web/scripts/styleL1.mjs`、`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test` 和 `STYLE_L1_SCENARIOS=dev-customer-config-dark-desktop,dev-customer-config-mobile pnpm --dir web style:l1` 均通过；`pnpm test` 当前通过 331 项，客户配置 L1 覆盖 `?customer=yoyoosun`、无 query 默认 yoyoosun、未知 customer 阻断提示、下拉切回 yoyoosun 只停留在 `/__dev/customer-config` URL，以及暗色桌面和 390x844 移动视口无横向溢出。
- 下一步：新增第二个客户包时，只扩展 dev customer config registry 和对应 `config/customers/<customer-key>/` 配置 / 文档，不把客户 key 升级成 SaaS runtime tenant。
- 阻塞/风险：本轮只改 dev-only 客户配置总控、helper、测试、样式、L1 场景和说明文档；未改后端、schema、migration、RBAC、seedData、WorkflowUsecase、Fact usecase、ERP 正式菜单、生产登录页客户切换、SaaS tenant、`tenant_id`、真实客户数据导入或目标环境镜像。追加前 `progress.md` 为 361 行 / 78165 bytes，未达到归档阈值。

## 2026-06-10 17:34 CST

- 完成：将 `docs/product/prototypes` 中工作台、业务模块标准页和协同入口原型吸收到真实前端运行时：`/erp/dashboard` 新增任务池概览；`BusinessModulePage` 将筛选区和表格工具栏拆清；业务页协同入口升级为“当前记录协同 + 本页待办”，支持阻塞原因、催办和完成 Workflow 任务。
- 完成：协同动作全部复用现有 `workflowApi.mjs` 的 `updateWorkflowTaskStatus` / `urgeWorkflowTask`，未复制 HTML 原型，未新增正式原型菜单、后端 API、schema、migration、Ent 字段、数据库表或 Fact 写入；完成任务仍只代表 Workflow 协同完成，不代表库存、出货、财务、应收、开票或收付款事实完成。
- 验证：`pnpm --dir web lint`、`pnpm --dir web css`、`pnpm --dir web test` 通过，`pnpm test` 当前通过 331 项；`STYLE_L1_SCENARIOS=root-redirect-desktop,erp-dashboard-desktop,erp-dashboard-mobile,erp-dashboard-dark-desktop,business-module-workflow-actions,business-module-dark-products-modal-desktop pnpm --dir web style:l1` 通过，覆盖根路由、工作台桌面 / 移动 / 暗色、业务页 Workflow 动作和业务页暗色弹窗。完整 `pnpm --dir web style:l1` 多次出现随机既有页面等待超时，失败场景包括 `dev-testing-dark-desktop`、`erp-dashboard-mobile`、`root-redirect-desktop`，对应单场景均可复跑通过。
- 验证：Browser 插件在 `http://127.0.0.1:5176/erp/dashboard` 验证应用壳层无 Vite overlay、console warn/error 为空；390x844 移动视口验证未登录跳转到 `/admin-login`、无 overlay、console warn/error 为空、`scrollWidth == clientWidth`。当前 Browser 会话无已登录 mock，因此已登录工作台 / 业务页交互以 L1 Playwright mock 场景为准。
- 下一步：如果后续继续吸收原型，应继续在现有正式页面和共享组件内推进，不新增原型菜单或第二套 workflow 入口；可再补专门的协同面板组件单测，锁住当前记录任务与本页任务分组口径。
- 阻塞/风险：完整 `style:l1` 套件存在随机等待超时，尚未在本轮修测试脚本稳定性；本轮未改后端、schema、migration、RBAC、seedData、WorkflowUsecase、Fact usecase、正式菜单、生产构建或目标环境镜像。追加前 `progress.md` 为 369 行 / 79982 bytes，未达到归档阈值。
