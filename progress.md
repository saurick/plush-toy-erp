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
