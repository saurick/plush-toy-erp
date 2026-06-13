# yoyoosun 客户交付矩阵 / yoyoosun Delivery Matrix

本文记录永绅 yoyoosun 客户的交付状态。它只代表该客户交付矩阵，不替代全局产品能力台账，也不把客户状态自动升级为 Product Core。

## 0. 文档边界

- 全局产品能力成熟度见 `../../product/capability-ledger.md`。
- 本客户差异明细见 `delta-ledger.md`。
- 总入口索引见 `../../product/product-delivery-ledgers.md`。
- 新客户必须新建 `docs/customers/<customer-key>/delivery-matrix.md`，不要继续追加到本文。

## 5. 客户交付矩阵说明

客户交付矩阵用于追踪每个客户实际交付状态。

它回答：

- 某客户启用了哪些模块？
- 哪些模块是正式可用？
- 哪些只是试用？
- 哪些只是 demo？
- 哪些是配置草案？
- 哪些不能承诺？
- 哪些需要客户确认？
- 哪些依赖 Product Core 后续开发？

### 5.1 交付状态定义

| 状态           | 含义             | 是否可对客户承诺 |
| -------------- | ---------------- | ---------------- |
| Not Planned    | 暂不计划给该客户 | 否               |
| Planned        | 已计划但未实现   | 否               |
| Config Draft   | 配置草案         | 否               |
| Internal Ready | 内部可用         | 否               |
| Local Verified | 本地环境已验证   | 否               |
| Trial Ready    | 可给客户试用     | 有条件           |
| Post-delivery  | 交付后业务确认   | 否               |
| Delivery Ready | 可交付           | 是               |
| Blocked        | 被前置条件阻塞   | 否               |
| Deferred       | 延后             | 否               |
| Deprecated     | 已废弃           | 否               |

---

## 6. 客户交付矩阵：yoyoosun

| Customer Key | 模块 / 能力             | 产品能力 ID         | 交付状态       | 当前客户可见方式                                                          | 交付结果                                                                                                                                                                                                                                                                                                                                                                            | 不包含                                                                                     | 前置条件                                                                                          | 客户确认项                                                             | 风险                                                    |
| ------------ | ----------------------- | ------------------- | -------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------------------------- |
| yoyoosun     | 客户主数据              | CAP-003             | Trial Ready    | 桌面正式菜单 `客户档案`                                                   | 可创建、编辑、查看、启停客户；当前试用使用模拟客户数据                                                                                                                                                                                                                                                                                                                              | 地址、账期、信用额度；真实客户数据导入当前不可执行                                         | 模拟数据 / 客户菜单配置                                                                           | 客户编码规则、客户简称、税号是否必填                                   | 模拟数据被误读为真实客户数据                            |
| yoyoosun     | 供应商主数据            | CAP-004             | Trial Ready    | 桌面正式菜单 `供应商档案`                                                 | 可创建、编辑、查看、启停供应商；当前试用使用模拟供应商数据                                                                                                                                                                                                                                                                                                                          | 银行账号、账期、供应物料档案；真实供应商数据导入当前不可执行                               | 模拟数据 / 客户菜单配置                                                                           | 供应商分类、是否区分委外/材料                                          | supplier_type 后续可能调整                              |
| yoyoosun     | 联系人                  | CAP-005             | Trial Ready    | 客户 / 供应商详情区块                                                     | 可维护主联系人和普通联系人；当前试用使用模拟联系人数据                                                                                                                                                                                                                                                                                                                              | 联系人通知权限；真实联系人数据导入当前不可执行                                             | 模拟数据 / 客户菜单配置                                                                           | 联系人角色、手机号、微信等字段                                         | owner guard 依赖 usecase                                |
| yoyoosun     | 销售订单                | CAP-006             | Trial Ready    | 桌面正式菜单 `销售订单`                                                   | 可录入、提交、激活、关闭、取消销售订单；当前试用使用模拟销售订单数据                                                                                                                                                                                                                                                                                                                | 出货、库存、财务；真实销售订单数据导入当前不可执行                                         | 模拟数据 / 客户菜单配置                                                                           | 订单编号规则、客户订单号、交期字段                                     | 甲方可能误解为出货闭环                                  |
| yoyoosun     | 销售订单明细            | CAP-007             | Trial Ready    | 销售订单详情区块                                                          | 可维护订单行                                                                                                                                                                                                                                                                                                                                                                        | SKU、已出货数                                                                              | 产品/单位选择器                                                                                   | 颜色、尺寸、客户款号如何处理                                           | 当前产品/单位暂用 ID                                    |
| yoyoosun     | V1 API/RBAC             | CAP-011             | Local Verified | 后端 JSON-RPC / 试用账号角色菜单核对清单 / 目标试用环境执行手册           | 有权限码和后端校验；已明确普通试用账号不使用 super admin、不分配 debug_operator，岗位任务端只认 `mobile.<role>.access`；本地 9 个 `demo_*` 账号已通过 RBAC 核对                                                                                                                                                                                                                                    | 未接客户化角色模板 runtime；目标客户环境真实账号核对未完成                                             | `phase7-simulated-trial-acceptance.md` / `trial-account-role-menu-checklist.md` / `trial-environment-runbook.md` | 角色权限模板 / 试用账号清单 / 目标环境账号核对                         | 权限模板还未客户化，账号误配会影响试用                  |
| yoyoosun     | V1 前端页面             | CAP-010             | Local Verified | 桌面正式菜单 / route                                                      | 页面可操作，且客户、供应商、销售订单已进入正式菜单；旧 `partners / project-orders` 路径不再保留产品内路由、重定向或权限别名；桌面菜单可由 yoyoosun 菜单配置生成；本地 Phase 7 浏览器入口 smoke 已通过                                                                                                                                                       | 当前只能使用模拟数据试用；真实数据导入不可执行；目标客户环境验收未完成                                             | `phase7-simulated-trial-acceptance.md` / trial feedback / trial environment runbook                       | 甲方试用入口 / 试用账号角色菜单核对                                    | 旧书签和账号权限仍需培训确认                            |
| yoyoosun     | business_records 旧入口 | CAP-008             | Retired        | 不进入正式菜单 / 无旧路径重定向 / 旧 API 已退出运行时                     | `partners / project-orders` 不再作为交付写入能力；当前 dev DB 旧 `business_records / business_record_items / business_record_events` 表族已通过 migration 删除，删除前 JSONL evidence 仅作迁移证据，不代表客户库结论                                                                                                                                                                   | 不承诺客户可见归档页；如需历史归档需另行设计只读归档模型                                  | legacy deletion evidence / target migration review                                                | 如需迁移或展示历史数据再确认范围                                       | 旧书签、历史归档诉求和培训口径风险                      |
| yoyoosun     | yoyoosun 数据导入       | CAP-009             | Local Verified | 本地 CLI evidence / Markdown 报告 / execution report / `importConfig.mjs`  | 已有来源清单、字段分类、unresolved queue、Excel source extract、只读 dry-run tooling、source freeze evidence、受控 JSON-RPC execution loader、tracked 导入配置草案和本地 Phase 7 模拟试用验收记录；当前没有客户真实数据，只作为模拟数据试用前门禁、报告模式工具和配置 review 材料                                                                                                                                             | 当前不可执行真实导入；`importConfig.mjs` 不接 loader、不嵌入 raw rows、不代表客户真实数据已导入 | `phase7-simulated-trial-acceptance.md` / `config/customers/yoyoosun/importConfig.mjs`                    | 字段含义、敏感字段、owner 匹配、冲突处理和未来数据治理条件              | 样本语义不清，execution loader、配置草案或模拟数据可能被误读成已完成导入 |
| yoyoosun     | 正式菜单入口            | CAP-010 / CAP-011   | Trial Ready    | 桌面正式菜单 / yoyoosun menu config                                       | `客户档案`、`供应商档案`、`销售订单` 已接入桌面菜单、dashboard 和前后端菜单权限选项；旧重叠路径不再保留产品内路由、重定向或权限别名；`config/customers/yoyoosun/menuConfig.mjs` 已可控制桌面菜单分组、排序、显隐和文案；客户侧栏不展示 `Phase 8` 或 `事实闭环` 这类内部工程入口；`trial-training-note.md`、`trial-account-role-menu-checklist.md` 与 `trial-environment-runbook.md` 已说明旧入口退出、账号角色、岗位任务端和目标环境执行边界 | 需用真实试用反馈复核；不创建真实账号或记录密码                                             | trial feedback / trial account setup / trial environment runbook                                  | 确认旧入口和内部工程入口不进入正式产品菜单，确认试用账号角色           | 旧书签、培训口径和账号权限误配风险                      |
| yoyoosun     | 产品 / SKU              | CAP-012 / CAP-013   | Deferred       | 既有产品可用，SKU 延后                                                    | 产品主数据已有基础                                                                                                                                                                                                                                                                                                                                                                  | SKU 未落                                                                                   | product-sku-bom-version-review                                                                    | 色号、尺寸、版本口径                                                   | 不能从订单颜色自动建 SKU                                |
| yoyoosun     | BOM                     | CAP-014             | Deferred       | 既有 BOM 能力 / 后续评审                                                  | 有基础 BOM 真源                                                                                                                                                                                                                                                                                                                                                                     | 版本扩展未做                                                                               | BOM version review                                                                                | BOM 改版规则                                                           | 与 SKU 关系未定                                         |
| yoyoosun     | 采购订单                | CAP-015             | Deferred       | 无正式 V1 入口                                                            | 延后 V2                                                                                                                                                                                                                                                                                                                                                                             | 不代表采购入库                                                                             | purchase-order review                                                                             | 采购流程口径                                                           | 不可替代 purchase_receipts                              |
| yoyoosun     | 采购入库                | CAP-016             | Internal Ready | 既有能力                                                                  | 有采购入库事实基础                                                                                                                                                                                                                                                                                                                                                                  | 与采购订单衔接未做                                                                         | purchase review                                                                                   | 入库/质检流程                                                          | 口径需客户确认                                          |
| yoyoosun     | 质检                    | CAP-017             | Internal Ready | 既有能力                                                                  | 有 quality_inspections 基础                                                                                                                                                                                                                                                                                                                                                         | 与 workflow 任务对接需评审                                                                 | quality-workflow review                                                                           | IQC/OQC 口径                                                           | task done 与 passed 混淆                                |
| yoyoosun     | 库存事实                | CAP-018             | Internal Ready | 既有能力                                                                  | 有 txns / lots / balances                                                                                                                                                                                                                                                                                                                                                           | 出货预留/出库未做                                                                          | inventory boundary review                                                                         | 仓库/批次规则                                                          | 出货会影响库存，需谨慎                                  |
| yoyoosun     | 出货放行                | Workflow capability | Internal Ready | workflow 状态                                                             | `shipping_released` 表示已放行                                                                                                                                                                                                                                                                                                                                                      | 不等于出库                                                                                 | shipment review                                                                                   | 放行权限                                                               | UI 文案误导                                             |
| yoyoosun     | 出货事实                | CAP-020             | Trial Ready     | Phase 8 内部模拟事实闭环                                                  | 目标环境已落 `shipments` / `shipment_items`、发货库存 OUT、取消冲正和统一事实页面；`phase8` 路由、登录态只读 API smoke 和模拟出货 ship / cancel 已通过                                                                                                                                                                                                                    | 不等于客户已签收；不等于出货放行；未做打印、物流、退货或自动应收                            | `phase8-target-release-evidence-2026-06-08.md`                                                   | 出货流程 / 使用反馈                                                    | 高风险事实层                                            |
| yoyoosun     | 库存预留                | CAP-019             | Trial Ready     | Phase 8 内部模拟事实闭环                                                  | 目标环境已落 `stock_reservations`、可用量检查和统一事实页面；预留不写库存流水；`phase8` 路由、登录态只读 API smoke 和模拟预留 release / consume 已通过                                                                                                                                                                                                                  | 不等于客户已签收；不从销售订单直接扣库存；未做自动预留或出货自动消耗                        | `phase8-target-release-evidence-2026-06-08.md`                                                   | 是否需要预留 / 使用反馈                                                | 容易和出库混                                            |
| yoyoosun     | 财务应收 / 应付         | CAP-022             | Trial Ready     | Phase 8 内部模拟事实闭环                                                  | 目标环境已落 `finance_facts`、AR/AP/invoice/payment/reconciliation 状态事实和统一事实页面；`phase8` 路由、登录态只读 API smoke 和模拟财务 settle / cancel 已通过                                                                                                                                                                                                       | 不等于客户已签收；不能从放行生成财务事实；未做发票明细、收付款核销或对账单                  | `phase8-target-release-evidence-2026-06-08.md`                                                   | 对账/开票/收付款流程 / 使用反馈                                        | 不能从放行生成                                          |
| yoyoosun     | 生产事实                | CAP-023             | Trial Ready     | Phase 8 内部模拟事实闭环                                                  | 目标环境已落 `production_facts`、生产领料 / 返工 OUT、成品入库 IN、取消冲正和统一事实页面；`phase8` 路由、登录态只读 API smoke 和模拟生产 post / cancel 已通过                                                                                                                                                                                                          | 不等于客户已签收；未接生产订单专表、移动端岗位任务、成本归集或完整报工                      | `phase8-target-release-evidence-2026-06-08.md`                                                   | 排产/领料流程 / 使用反馈                                                | 不要只做状态                                            |
| yoyoosun     | 委外事实                | CAP-024             | Trial Ready     | Phase 8 内部模拟事实闭环                                                  | 目标环境已落 `outsourcing_facts`、委外发料 OUT、委外回料 IN、取消冲正和统一事实页面；`phase8` 路由、登录态只读 API smoke 和模拟委外 post / cancel 已通过                                                                                                                                                                                                                 | 不等于客户已签收；委外结算进入财务事实；未做委外订单专表、质检对接或应付自动生成             | `phase8-target-release-evidence-2026-06-08.md`                                                   | 加工合同/外发流程 / 使用反馈                                            | 委外合同样本需人工确认                                  |
| yoyoosun     | 岗位任务                | CAP-025             | Target Released | Phase 9 岗位任务端 / 内部模拟 workflow 闭环                               | 目标环境已发布岗位任务端现场留痕、最近动作、保存 evidence、异常报告展示和 `/m/<role>/guide` 兼容跳转修复；目标仓库岗位任务端路由 smoke、试用账号 RBAC 和 `SIM-YOYOOSUN-PHASE9` 内部模拟 workflow 闭环已通过                                                                                                                                                               | 不等于客户已签收；不等于真实拍照上传 / 附件服务 / 扫码已交付；不从任务端自动写库存、出货、预留或财务事实 | `phase9-target-release-evidence-2026-06-09.md`                                                   | 哪些岗位真实使用手机 / 现场留痕格式 / 附件服务是否需要                 | 误把 workflow evidence 当事实或附件服务                  |
| yoyoosun     | 私有化部署包            | CAP-026             | Target Released | deployments/yoyoosun / Phase 8 与 Phase 9 发布 evidence                    | 已执行目标环境镜像加载、健康检查、Compose 重建、试用账号 RBAC、Phase 8 登录态只读 API smoke、内部模拟事实写入闭环、Phase 9 岗位任务端目标路由 smoke、内部模拟 workflow 闭环和发布后清理；Phase 9 不涉及 migration                                                                                                                                                          | 缺首次目标发布前 pre-migration 备份 evidence；客户使用确认属于交付后业务确认                 | `phase8-target-release-evidence-2026-06-08.md` / `phase9-target-release-evidence-2026-06-09.md`    | 使用确认                                                               | 运维风险                                                |
| yoyoosun     | 客户使用确认            | CAP-027             | Post-delivery   | checklist 草案 / 模拟数据试用目标 / Phase 8 与 Phase 9 发布 evidence        | Phase 7 本地模拟试用已关闭；Phase 8 目标环境发布 smoke、试用账号 RBAC、登录态只读 API smoke 和内部模拟事实写入闭环已通过；Phase 9 目标环境岗位任务端路由 smoke 和内部模拟 workflow 闭环已通过                                                                                                                                                                                        | 不作为 Phase 8 或 Phase 9 完成阻塞；当前不可执行真实导入；模拟数据不代表客户已签收或真实出货 / 库存 / 财务事实 | `phase7-simulated-trial-acceptance.md` / `phase8-target-release-evidence-2026-06-08.md` / `phase9-target-release-evidence-2026-06-09.md` | 使用范围、模拟数据范围、真实导入不可执行边界                           | 范围过大或把内部闭环误读为客户签收                     |
| yoyoosun     | 行业默认模板清单        | CAP-028             | Candidate Ready | config/industry-templates/plush                                           | Phase 10 已把 yoyoosun 已验证的角色、菜单、字段、编号、导入模板、岗位任务模式和培训验收清单归入行业模板候选配置；客户侧栏不展示 `Phase 8` / `事实闭环` 内部工程入口                                                                                                                                                                                                   | 仍未经过多客户重复验证；打印样本、合同条款、logo、客户名称、附件服务、扫码、报表和真实导入不进入行业默认模板 | `templateConfig.mjs` / `industry-template-boundaries.mjs` / `phase10-industry-template-closure.mjs` / `phase10-target-release-evidence-2026-06-09.md` | 后续多客户验证；进入 Phase 11 前按客户包复用模板候选                    | 单客户样本或打印格式污染行业模板                        |
| yoyoosun     | 客户配置包              | CAP-029             | Config Draft   | config/customers/yoyoosun                                                 | 已有目录骨架和配置项口径，桌面菜单配置已接入前端 loader；字段显示和编号规则已形成 `runtimeEnabled=false` 草案配置；导入与客户差异配置已新增 `importConfig.mjs`，收口 source extract 统计、字段映射分组、导入顺序、review queue、deferred runtime 项和 forbidden auto-import targets                                                                                                              | 不是 `tenant_id`，不含通用打印模板引擎；字段 / 编号 / 导入草案不接运行时，角色模板 runtime 尚未做，不执行真实导入 | customer field / numbering config review / existing V1 snapshot review                              | 公司信息、主题、编号、打印样本记录、字段编号确认清单、确认结果回写模板、导入 review queue | 被误读为 SaaS tenant、模板系统、真实导入批准或已生效 runtime 字段规则 |
| yoyoosun     | 多客户私有化复制包模板  | CAP-033             | Template Ready | config/private-deployment-template                                        | Phase 11 已把新增客户包结构、复用来源、低配部署边界、真实导入阻断和模拟验收口径沉淀为模板候选；当前 yoyoosun 仍只是第一个客户包和模板输入来源                                                                                                                                                                                                                | 不代表真实第二客户已交付；`SIM-PRIVATE-PHASE11` 不创建正式客户目录；不新增 SaaS / tenant / license / billing | `private-deployment-package-review.md` / `private-deployment-boundaries.mjs` / `phase11-private-deployment-closure.mjs` / `phase11-target-release-evidence-2026-06-09.md` | 真实新增客户前先评审 customer key、资料边界、部署和备份恢复             | 模拟复制包被误读为多客户 runtime 或正式第二客户             |
| yoyoosun     | Phase 12 SaaS 评审       | CAP-034             | Reviewed / No-Go | docs/product/phase12-saas-review.md                                      | 已完成 SaaS docs-only 进入门禁评审；当前结论是不进入实现，yoyoosun 仍按私有化客户实例和 Phase 11 客户包模板输入来源管理                                                                                                                                                                                                 | 不代表 SaaS、多租户、runtime tenant、license、billing 或客户工单系统已开始；不新增 `tenant_id`                 | `phase12-saas-review.md`                                                                            | 真实第二客户私有化闭环后再评审是否需要 SaaS                             | 把第一个客户配置误读为 tenant 或共享库隔离需求             |
| yoyoosun     | 客户扩展边界            | CAP-030             | Not Planned    | 无                                                                        | 当前没有需要落地的专属 extension                                                                                                                                                                                                                                                                                                                                                    | 不创建 extension runtime                                                                   | 真实出现专属逻辑后再评审                                                                          | 暂无                                                                   | 为假想定制过早造层                                      |
| yoyoosun     | 业务帮助 / 交付说明     | CAP-031             | Draft Ready    | 试用培训说明 / 账号角色菜单核对清单 / 目标试用环境执行手册 / Phase 8 发布验收手册 / 后续业务帮助 | 已新增 `trial-training-note.md`、`trial-account-role-menu-checklist.md`、`trial-environment-runbook.md` 和 `phase8-target-release-acceptance.md`，用于说明正式入口、旧入口退出、菜单配置边界、销售订单边界、普通试用账号、岗位任务端、目标环境执行和内部事实验收边界；客户菜单不展示 `Phase 8` 或 `事实闭环` 工程入口                                                                                                            | 仍不是产品内帮助中心；不创建真实账号或记录密码；不代表目标环境已发布或客户已签收；需按试用反馈继续业务化 | trial feedback / business help split review / trial account setup / trial environment runbook / phase8 release acceptance | 客户培训材料 / 试用账号角色菜单确认 / 目标环境执行记录                 | 开发术语误导业务用户、账号权限误配或敏感信息写入文档    |
| yoyoosun     | 报表 / 审计 / 集成增强  | CAP-032             | Deferred       | 无正式入口                                                                | 后续增强方向明确                                                                                                                                                                                                                                                                                                                                                                    | 报表、附件、扫码、外部集成未做                                                             | 事实层稳定后再评审                                                                                | 报表范围                                                               | 倒推事实模型                                            |

---

# 维护流程

## 11. 什么时候更新客户交付矩阵

以下情况必须更新客户交付矩阵：

- 某客户启用模块。
- 某客户完成配置草案。
- 某客户完成数据导入 dry-run。
- 某客户完成真实导入。
- 某客户开始试用。
- 某客户验收某模块。
- 某客户模块被阻塞。
- 某客户模块进入 deferred。
- 某客户模块不再交付。

更新时必须写：

- 交付状态。
- 客户可见方式。
- 不包含什么。
- 客户确认项。
- 风险。

---

## 13. 三类台账之间的关系

```text
客户差异台账
  -> 判断某个需求属于什么分类

产品能力进度台账
  -> 判断产品内核是否已经具备该能力

客户交付矩阵
  -> 判断某个客户是否可以看到、试用、验收该能力
```

关系示例：

```text
yoyoosun 提出“订单里要颜色”
  -> 客户差异台账：颜色字段来自 永绅 yoyoosun 样本，分类为 Industry Template Candidate / Deferred
  -> 产品能力进度台账：product_skus 仍 L3 Draft Only
  -> 客户交付矩阵：yoyoosun 暂不能承诺 SKU 能力，只能在 sales_order_item 中保留 color snapshot 或备注类字段
```

---

## 14. 防止信息差规则

### 14.1 禁止写法

禁止在没有证据时写：

- 已完成。
- 已上线。
- 已支持。
- 已交付。
- 可销售。
- 事实真源。
- 客户已确认。
- 已迁移。

### 14.2 推荐写法

应写：

- 已评审。
- 已形成草案。
- 已完成 schema。
- 已生成 migration。
- 已完成 repo/usecase。
- 已完成 API/RBAC。
- 已完成 UI。
- 可内部联调。
- 可客户试用。
- 待客户确认。
- 待真实导入。
- 待交付验收。

### 14.3 “已完成”必须附证据

任何“已完成”都必须附：

- 文件路径。
- 测试命令。
- review 报告。
- 不包含内容。

---
