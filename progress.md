# 过程记录 / Progress

本文件只保留当前活跃事项、最近完成事项和归档索引；历史流水不作为当前正式需求、实现状态或产品路线真源。

## 归档索引

- `docs/archive/progress-2026-06-15-before-final-bom-closeout.md`：当前工作区已有归档快照，保留 BOM 收口和文档治理前的旧流水。
- `docs/archive/progress-2026-06-16-before-audit-log-readable.md`：当前工作区已有归档快照，保留旧流水和较早移动任务页拆分记录。
- `docs/archive/progress-2026-06-16-before-backup-restore-rehearsal.md`：当前工作区已有归档快照，保留旧流水和较早移动任务页拆分记录。
- `docs/archive/progress-2026-06-17-before-related-actions.md`：本轮写入关联按钮前，因 `progress.md` 超过 80KB 归档的完整过程流水快照。

## 当前活跃事项

- 当前工作区仍有大量非本轮并行改动，包含 schema / API / UI / 文档 / 原型 / 客户配置等混合现场；每轮收口必须按本轮允许路径精确说明和验证，不得回退或整理非本轮现场。
- 已接正式 V1 的销售订单、采购订单、采购入库、来料质检、库存台账、出货 / 预留和财务事实页面应保持 Workflow / Fact 边界：关联入口只提供上下文跳转或已有打印 / 生成动作，不代表下游事实自动过账。
- 移动岗位任务端 `/m/<role>/tasks` 仍是岗位协同入口；后续拆分应继续保持 Workflow 任务完成不写库存、出货、财务或付款事实。

## 2026-06-17 关联按钮全局补齐

- 完成：按 `plush-page-design-governance` 全局扫描正式业务页，在销售订单、采购入库、来料质检、库存台账和 Operational Fact 工作区补选中态 `关联` 下拉；采购订单原有关联逻辑保留。
- 完成：关联入口只导航到已有正式页面、切换库存台账视图或回到可识别来源页；不新增 schema、migration、RBAC、菜单、后端 usecase、Workflow / Fact 写入或客户专属规则。
- 完成：不在 BOM / 主数据维护页补关联按钮，原因是当前没有明确的上下游事实动作或已实现承接页面，避免把主数据页伪装成链路总控。
- 验证：`cd web && pnpm lint`、`cd web && pnpm css`、`cd web && pnpm test`、`cd web && pnpm style:l1` 均通过；`style:l1` 覆盖 56 个场景。
- 下一步：如要让关联入口按当前单据自动筛选目标页，需要先给目标列表补正式查询参数读取和浏览器回归；不能在按钮处做页面局部假过滤。
- 阻塞/风险：当前工作区仍有大量非本轮并行改动；本轮未提交、未推送、未改部署，也未验证后端 Go 测试或 migration 状态，因为本轮只改前端关联入口和过程记录。

## 2026-06-17 委外订单加工合同源单 V1

- 完成：将 `委外订单` 从旧 operational fact 列表收口为加工合同 / 委外源单 V1：新增 `outsourcing_orders / outsourcing_order_items` schema、migration、Ent generated code、repo/usecase、`outsourcing_order` JSON-RPC、`outsourcing.order.*` RBAC 和 `/erp/purchase/processing-contracts` 页面。页面支持状态栏统计、单选当前合同、提交 / 确认 / 关闭 / 取消、编辑弹窗、工序明细和加工合同打印带值；确认合同不写库存、质检、应付、发票、付款或 Workflow 完成。
- 完成：加工合同打印模板新增从委外订单映射合同号、来源订单、加工厂、产品、工序、单位、数量、单价、金额和备注；L1 mock 补 `outsourcing_order` 域和可委外工序，避免回归继续验证旧“委外事实”页面。
- 完成：同步 README、当前真源、正式菜单计划、实施拆分清单和产品能力台账，把“委外订单=委外发料 / 回货 facts 页面”的旧口径改为“加工合同源单已落，发料 / 回货 facts 仍在事实层”。
- 验证：`cd server && make data`、`cd server && make migrate_apply && make migrate_status` 通过，本地 dev DB 当前版本 `20260617124401`、pending 0；`cd server && go test ./internal/biz ./internal/data ./internal/service -count=1` 通过；`cd web && pnpm lint`、`cd web && pnpm css`、`cd web && pnpm test` 通过，前端单测 342 项通过；`STYLE_L1_SCENARIOS=business-formal-module-shells-desktop pnpm style:l1` 通过；`node --check web/scripts/styleL1.mjs`、`git diff --check` 通过。
- 下一步：评审委外发料 / 回货从加工合同明细带值、委外回货质检联动和委外应付 / 对账联动；不要在合同确认动作里直接写库存或财务事实。
- 阻塞/风险：完整 `pnpm style:l1` 本轮曾运行到工作台 / 业务看板阶段后长时间无输出，已中断并清理本轮 4173 验证进程；本轮用覆盖委外页和相邻业务页的目标 L1 收口。当前未做真实 yoyoosun Excel 导入、合同审批流、工序报价、附件留档或目标环境发布。
