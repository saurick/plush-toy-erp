# 0 到 1 产品架构

## 定位

`plush-toy-erp` 的目标是毛绒玩具工厂任务驱动型 ERP 产品内核，而不是一次性外包系统、所有行业通用 ERP、低代码平台或复杂 BPMN 系统。

本文已吸收 `docs/reference/imported-notes/plush-toy-erp-from-0-to-1-plan.md` 中稳定的产品定位、分层和闭环顺序；未吸收其中的目录大重构、时间估算、团队排期或 API/schema 示例。外部 planning note 只能作为参考输入，不覆盖当前代码、测试、`docs/current-source-of-truth.md` 或具体 Goal 文件。

当前路线是：

| 层级 | 口径 |
| --- | --- |
| Product Core | 单一产品内核，沉淀通用 usecase、schema、权限、事实规则和帮助口径 |
| Industry Template | 毛绒玩具及相近轻工行业模板，沉淀默认角色、流程、字段、编号和 seed / import 模板 |
| Customer Config | 客户配置包，承接公司名、logo、菜单、字段、编号、角色、初始化数据和客户打印样本引用 |
| Customer Extension | 极少量客户专属扩展，必须隔离并记录退出条件 |
| Delivery / Ops | 私有化部署、备份恢复、升级、培训、巡检和维护费交付能力 |

打印格式当前不进入 Product Core，也不作为行业模板默认能力。现阶段只记录客户打印样本、字段来源和交付诉求；若后续多个真实客户的同类单据结构高度重复，再单独评审是否做 Print Template Core MVP。

## 三阶段路线

| 阶段 | 目标 | 当前动作 |
| --- | --- | --- |
| 第一阶段 | 单客户私有化部署 + 配置预留 | 以 `current` 客户为第一个私有化客户实例，建立配置和交付骨架 |
| 第二阶段 | 多客户私有化部署 | 每客户一套数据库 / 对象存储 / env / 初始化数据 / 客户打印样本记录，代码统一 |
| 第三阶段 | SaaS 多租户 | 未来单独评审，不在当前阶段实现 |

当前不实现 SaaS runtime tenant，不新增 `tenant_id`，不改 Ent schema，不改 RBAC 为多租户模型。

## 业务闭环主线

0 到 1 的产品目标不是先做完整 SaaS，也不是先做通用低代码平台，而是把毛绒工厂的业务主链路按事实边界闭环：

| 主线 | 0 到 1 成熟口径 |
| --- | --- |
| Order To Shipment | 客户订单作为 Source Document，老板审批只推进协同；真实出货必须由 ShipmentUsecase 和库存事实确认 |
| Procure To Inventory | 采购承诺、到货、质检、入库、退货和调整分层；采购入库事实写 `inventory_txns / inventory_balances / inventory_lots` |
| Production / Outsourcing | 生产领料、委外发料、委外回货、成品入库必须形成事实，不靠 workflow task done 伪造库存 |
| Shipment To Finance | `shipping_released` 只表示可发货；实际 shipped 后才评审应收、发票、收款和对账 |
| Productization / Delivery | 用一个产品内核、一个行业模板、多个客户配置包和私有化部署包复制客户，不复制多套核心代码 |

## V0 到 V6

| 版本 | 目标 | Definition of Done 摘要 |
| --- | --- | --- |
| V0 | 架构骨架 | 文档、目录、边界和 release gates 建立；不改 runtime |
| V1 | 订单 / 客户 / 产品 / SKU / BOM / Boss Approval | 主数据和源单据边界清楚，老板审批只推进协同和单据阶段 |
| V2 | 采购 / 来料 / 质检 / 库存 | 采购、质检、库存事实 usecase 分层，库存流水可追溯 |
| V3 | 生产 / 委外 / 成品入库 | 生产和委外源单据、成品入库事实、库存过账边界清楚 |
| V4 | 出货放行 / 出货事实 / 预留 / 实际出库 | `shipping_released` 与 `shipped` 分离，出货事实和库存扣减由 ShipmentUsecase 落账 |
| V5 | 财务对账 / 应收 / 应付 / 发票 / 收付款 | 财务事实在真实 shipped、receipt、invoice、payment 后形成 |
| V6 | 产品化交付 / 配置包 / 部署包 / 培训 / 运维 | 私有化交付包、升级说明、培训和维护费支持闭环 |

## 当前 V0 边界

- 只做文档和目录骨架。
- 不迁移旧代码。
- 不接前端 docs registry。
- 不新增 schema、migration 或 runtime loader。
- 不把当前甲方资料升级为 Product Core 规则。
- 不把 imported notes 作为 runtime source of truth。
