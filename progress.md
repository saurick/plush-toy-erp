# 过程记录 / Progress

本文件只保留当前活跃事项、最近完成事项和归档索引；历史流水不作为当前正式需求、实现状态或产品路线真源。

## 归档索引

- `docs/archive/progress-2026-06-15-before-final-bom-closeout.md`：归档截至 2026-06-15 22:42 CST 的过程记录快照。归档原因：当前 `progress.md` 达到 428 行 / 83344 bytes，超过 80KB 阈值；本轮 BOM Version、JSON-RPC service 迁移和全量验收提交前先保留完整现场，再收缩当前入口。
- `docs/archive/progress-2026-06-02-before-print-template-defer.md`：归档 2026-05-31 至 2026-06-02 10:28 的旧过程记录。归档原因：原 `progress.md` 达到 386 行 / 80696 bytes，超过 80KB 阈值。
- `docs/archive/progress-2026-06-05-before-mobile-task-redesign.md`：归档截至 2026-06-04 22:04 CST 的过程记录快照。归档原因：当前 `progress.md` 达到 375 行 / 80895 bytes，超过 80KB 阈值；本轮移动端任务页改版前先保留完整现场，再收缩当前入口。
- `docs/archive/progress-2026-06-08-before-business-records-debug-cleanup.md`：归档截至 2026-06-08 13:50 CST 的过程记录快照。归档原因：当前 `progress.md` 达到 318 行 / 82540 bytes，超过 80KB 阈值；本轮旧 `project-orders` debug cleanup 前先保留完整现场，再收缩当前入口。
- `docs/archive/progress-2026-06-09-before-brand-config.md`：归档 2026-06-08 21:08 CST 至 2026-06-08 23:07 CST 的过程记录。归档原因：当前 `progress.md` 达到 383 行 / 80205 bytes，超过 80KB 阈值；本轮前端品牌客户配置化前先保留完整现场，再收缩当前入口。
- `docs/archive/progress-2026-06-10-before-style-l1-stabilization.md`：归档 2026-06-08 23:55 CST 至 2026-06-10 17:34 CST 的过程记录快照。归档原因：当前 `progress.md` 达到 378 行 / 82385 bytes，超过 80KB 阈值；本轮修完整 `style:l1` 稳定性前先保留完整现场，再收缩当前入口。
- `docs/archive/progress-2026-06-11-before-ui-simplification-rules.md`：归档截至 2026-06-11 14:06 CST 的过程记录快照。归档原因：当前 `progress.md` 达到 395 行 / 80005 bytes，接近并按项目约定视为达到 80KB 归档边界；本轮补 UI 极简不改语义规则前先保留完整现场，再收缩当前入口。
- `docs/archive/progress-2026-06-12-before-formal-menu-candidate-prototype.md`：归档截至 2026-06-12 18:29 CST 的过程记录快照。归档原因：当前 `progress.md` 达到 425 行 / 81740 bytes，超过 80KB 阈值；本轮补正式菜单候选原型前先保留完整现场，再收缩当前入口。
- `docs/archive/progress-2026-06-13-before-workbench-prototype-redesign.md`：归档截至 2026-06-13 19:59 CST 的过程记录快照。归档原因：当前 `progress.md` 达到 385 行 / 81720 bytes，达到 80KB 归档边界；本轮重做工作台原型前先保留完整现场，再收缩当前入口。
- `docs/archive/progress-2026-06-14-before-business-modal-alignment.md`：归档截至 2026-06-14 18:20 CST 的过程记录快照。归档原因：当前 `progress.md` 达到 369 行 / 80362 bytes，达到 80KB 归档边界；本轮继续统一业务新建 / 编辑弹窗前先保留完整现场，再收缩当前入口。

## 当前活跃事项

- `/erp/dashboard` 已作为后台首页 / 工作台首屏：聚合今日必须处理、跨角色阻塞、业务对象、完成率、当前处理、今日焦点、业务状态摘要、业务对象分布、角色提醒和阻塞交接，不再内嵌“看板中心 / 运营工具”卡片导航，也不把核心区域做成跳转入口集合；`/erp/task-board` 独立承接 Workflow 任务看板。
- `BusinessListLayout` 已承接正式业务页共享骨架；`客户档案`、`供应商档案` 和 `销售订单` 使用 V1 页面，`产品档案`、`BOM 管理`、采购、入库、质检、库存、委外、生产、出货和财务等 16 个 `formal-shell` 菜单统一使用 `FormalBusinessModulePage`。共享骨架已收口紧凑筛选、列表统计、列顺序、列排序、导出、批量删除、回收站、行点击选中、双击进入编辑 / 主操作弹窗、显式详情、当前操作和协同入口；formal-shell 新建 / 编辑现在统一走只读业务表单弹窗，真实保存仍待领域 usecase / API / RBAC 接入；协同入口只处理 Workflow 任务，不写事实层。
- `/erp/business-dashboard` 仍只作为运营摘要和业务风险看板，不作为事实真源；`/erp/print-center` 保留模板目录、纸面预览和可编辑打印窗口入口；字段编辑、明细确认和纸面微调回到独立打印窗口；`/erp/operations/exceptions` 作为异常 / 阻塞闭环入口。
- 完整 `pnpm --dir web style:l1` 已恢复通过；后续若继续吸收或评审原型，应继续复用现有页面、现有 Workflow API、现有菜单 / RBAC / theme token，不新增未评审后端 API、schema、migration、权限码或 Fact 写入。
- 业务页协同入口的任务分组、统计、阻塞原因和催办态已收口到纯前端 helper，并纳入 `pnpm test`；该 helper 只服务 Workflow 展示口径，不写事实层。
- `docs/product/prototypes` 当前待实现队列包含工作台 / 总控页、任务中心、业务管理中心、产品核心菜单覆盖矩阵、正式菜单候选导航、业务模块列表页、业务详情页、页面级新建 / 编辑表单、业务页协同入口组件、业务弹窗和模板打印中心十一个 HTML 标准样板；只有岗位任务端 `mobile-role-tasks-v1/implemented-reference.html` 登记为当前实现参考。
- 原型查看器和原型 README 已补“参照范围”口径：`admin-command-center-v1` 是判断型工作台样板，`core-menu-coverage-v1` 是内部覆盖矩阵，`formal-menu-candidate-v1` 是正式菜单候选原型；它们都不是正式菜单、路由、权限或 seedData 映射表，真正对应关系必须在进入真实实现任务时回到代码、菜单配置和 RBAC 重新核对。

## 2026-06-16 12:52 CST

- 完成：重排 `docs/product/产品能力进度台账.md`，取消快速查阅表第一列内部编号，改为按“能力 / 所属层 / 成熟度 / 客户可见性 / 下一步”给人查阅。
- 完成：新增 `docs/product/产品能力证据详情.md`，把原宽表中的当前结果、当前不包含、证据、风险和客户边界拆到按能力名称索引的详情文档；可见正文只按能力名称查阅。
- 完成：同步 `docs/product/产品台账索引.md`、`docs/product/README.md`、`docs/文档清单.md`，并修正台账内和客户差异台账内 SKU 示例，避免继续写成“只落 schema 未接 API / UI”。
- 下一步：后续维护台账时先更新主台账的人可读状态，再按需补证据详情；如证据详情继续变大，再按业务域拆分详情。
- 阻塞/风险：本轮只改正式文档呈现和 SKU 示例口径，不改 runtime、schema、migration、测试、部署或客户交付矩阵。

## 2026-06-16 12:53 CST

- 完成：收口 V1 主数据客户 / 供应商页面的前端称呼，保留客户与供应商作为不同业务入口和后端真源，但不再在按钮、统计和联系人面板里统一显示成泛化“主体”，避免误读为两套重复表单。
- 下一步：如后续要把客户与供应商进一步合成“往来单位 / 交易主体”单入口，需要单独评审 schema、RBAC、销售 / 采购外键、联系人 owner_type、菜单和迁移，不在本轮文案收口范围内。
- 阻塞/风险：此条仅记录早先称呼收口；同轮后续已在 13:08 CST 继续完成单页结构收口和 `style:l1` 回归，最终风险以 13:08 CST 记录为准。

## 2026-06-16 13:08 CST

- 完成：进一步收口 V1 客户 / 供应商页单页结构，删除页面底部常驻联系人明细表，把联系人列表和新建联系人入口移入“查看详情”抽屉；主页面只保留一张客户 / 供应商主数据表。
- 完成：清理已失效的联系人面板 CSS，并同步 `style:l1` 客户 / 供应商场景断言，按“新建客户 / 新建供应商”和详情抽屉联系人入口验证新结构。
- 下一步：联系人编辑、设为主联系人和停用仍需后续按 masterdata 联系人能力单独补 UI 动作，不回到主页面常驻第二张表。
- 阻塞/风险：本轮未改后端 schema、API、RBAC、菜单、migration 或真实数据；联系人仍是当前客户 / 供应商的从属明细，不作为独立业务对象。

## 2026-06-16 12:16 CST

- 完成：关闭 P0/P1 硬缺口主路径：生产配置移除 token 形态 Telegram 注释块；个人开发阶段不落 GitHub CI，继续以本地 QA / hooks 为主；后端 HTTP 增加 CSP、Referrer-Policy、X-Content-Type-Options、X-Frame-Options 和 Permissions-Policy 基础安全响应头。
- 完成：公开自助注册从“生产关闭”改为“运行时删除”：后端移除 `auth.register` 分发和 `AuthUsecase.Register`，`auth.capabilities` 不再返回 `public_register`，生产 Compose / preflight 不再使用 `APP_PUBLIC_REGISTER_ENABLED`，前端删除 `/register` 路由和注册页，登录页不再展示注册链接，正式 API / 配置 / 部署 / 前端 README 同步为不提供公开自助注册。
- 下一步：SKU 继续只按已修正台账推进；如要进一步降低 token 风险，应单独评审 HttpOnly SameSite Cookie、CSRF、刷新 token 和前端 API client 改造；如要补普通协作账号创建入口，应单独评审受控 `user.create` 权限、流程、审计和测试。
- 阻塞/风险：本轮未做 SKU API/UI、真实 MVP runner、目标环境部署、生产镜像构建或线上 smoke；后端 CSP 仍保留 inline script/style 兼容现有构建和模板渲染，后续收紧需要前端构建和 PDF 回归。

## 2026-06-16 12:50 CST

- 完成：按用户确认删除公开注册入口，清理后端 register 方法、前端注册路由 / 页面、公开注册 capability、公开注册错误码消费、生产部署开关、preflight 检查和相关正式文档口径；保留测试断言 `register` 返回 UnknownMethod，避免后续误恢复。
- 下一步：如需要新增普通协作账号，另起受控账号创建任务，不从公开注册入口恢复。
- 阻塞/风险：未新增普通协作账号创建 API；当前普通用户新增仍依赖既有初始化 / 数据准备路径或后续账号管理能力设计。

## 2026-06-16 12:33 CST

- 完成：按个人开发边界撤回 GitHub CI 落地，删除 `.github/workflows/ci.yml`，并把 `docs/product/自动化测试策略.md` 改回“当前不配置 GitHub CI，后续协作扩大时再评审”的口径。
- 下一步：继续保留本地 `scripts/qa/fast.sh`、`full.sh`、`strict.sh`、preflight 和 hooks 作为当前质量主路径。
- 阻塞/风险：未改生产注册关闭、安全响应头、错误码、前端 capabilities 或部署 preflight 收口；后续若需要远端门禁再重新评审 CI。

## 2026-06-16 12:08 CST

- 完成：修正 `docs/product/产品能力进度台账.md` 中 `product_skus` 口径，补齐 masterdata JSON-RPC、`product_sku.*` RBAC 和 `/erp/master/products` SKU 最小维护页面已接入的状态，避免继续被误读为只落 schema。
- 完成：保留 SKU 当前边界：订单、出货、库存和预留运行时主路径仍未切 SKU；销售订单行 SKU 选择、出货 / 库存 / 预留 SKU 校验、BOM SKU 粒度和导入受控创建 SKU 仍待单独评审。
- 下一步：后续推进 SKU 时优先评审销售订单行 SKU 选择与快照带值，再评审 BOM SKU 粒度和事实链路 SKU 校验。
- 阻塞/风险：本轮只修正式产品能力台账口径，不改运行时代码、schema、migration、测试脚本、部署或 git 提交。

## 2026-06-15 22:59 CST

- 完成：BOM Version 已完成 runtime 闭环并通过最终收口验证：后端 BOM lifecycle / repo / service JSON-RPC / RBAC、前端 BOM API / V1 页面 / 路由、`style:l1` BOM 页面 mock 与断言、正式文档和客户交付矩阵均已同步；BOM 仍只维护产品物料清单版本，不写库存、采购、生产、成本或财务事实。
- 完成：收口 JSON-RPC service/data 分层迁移现场，修复 Product SKU L1 暗色客户场景空记录崩溃，并补齐 `style:l1` 对 Product SKU、BOM Version 和当前业务页表头 / 回收站列的断言口径。
- 验证：`go test ./...` 通过；`pnpm --dir web lint && pnpm --dir web css && pnpm --dir web test && pnpm --dir web build` 通过，前端单测 312 项通过；`node --test scripts/qa/mvp-closure.test.mjs && node scripts/qa/mvp-closure.mjs --out output/customers/yoyoosun/mvp-closure-smoke` 通过；`pnpm --dir web style:l1` 全量 48 个场景通过；本轮提交前还将执行 `git diff --check`。
- 下一步：按用户要求全量 stage、提交并推送当前工作区。
- 阻塞/风险：未执行目标服务器 migration、部署或线上 smoke；BOM SKU 粒度、采购需求生成、MRP / 替代料、成本核算、订单 / 采购需求版本快照和客户真实数据验收仍需后续单独评审。
