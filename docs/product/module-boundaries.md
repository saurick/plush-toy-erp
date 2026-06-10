# 模块边界 / Module Boundaries

## 核心边界

| 边界 | 正式口径 |
| --- | --- |
| Workflow task done != Fact posted | 协同任务完成不等于库存、出货、质检、财务事实落账 |
| `shipment_release done -> shipping_released` | 出货放行只表示已放行 / 可发货 / 待出库 |
| `shipping_released != shipped` | 已放行不等于已出库、已发货、已扣库存 |
| Quality task done != quality_inspection passed | 协同任务完成不等于质检事实判定通过 |
| `business_records` 不替代事实表 | 它是通用快照和兼容层，不是库存、出货、财务事实真源 |
| 永绅 yoyoosun 客户资料不等于 Product Core | 只有经过架构评审并通用化的能力才能进入产品内核 |

## 产品核心与客户投影 / Product Core And Customer Projection

```mermaid
flowchart TD
  subgraph core["产品核心 / Product Core"]
    coreEntry["Core change entry<br/>正式实现前再评审 schema / usecase / RBAC / UI"]
    master["MasterData<br/>单位 / 材料 / 产品 / 仓库 / 客户 / 供应商 / BOM"]
    sourceDoc["Source Document<br/>销售订单 / 采购入库 / 业务承诺"]
    workflow["Workflow<br/>任务 / 事件 / 协同状态 / 角色流转"]
    fact["Fact Usecases<br/>库存 / 质检 / 生产 / 出货 / 财务事实"]
    rbac["RBAC<br/>权限码 / 角色 / 菜单守卫 / API 守卫"]
    ui["UI<br/>桌面后台 / 岗位任务端 / 打印入口"]
  end

  subgraph customer["客户投影 / Customer Projection"]
    customerDocs["docs/customers/&lt;customer-key&gt;<br/>客户资料 / 交付矩阵 / 差异台账"]
    customerConfig["config/customers/&lt;customer-key&gt;<br/>品牌 / 菜单展示 / 字段编号 / 导入草案"]
    customerSeed["seed / fixture / training<br/>试用账号 / 模拟数据 / 培训验收"]
    customerTemplate["打印模板 / 字段显示<br/>客户配置或模板候选"]
  end

  subgraph review["升级门禁 / Promotion Gate"]
    coreReview["Product Core 评审<br/>通用性依据 / 排除客户专属内容 / 测试与文档同步"]
  end

  master --> sourceDoc
  sourceDoc --> workflow
  sourceDoc --> fact
  workflow --> ui
  fact --> ui
  rbac --> ui
  customerDocs --> customerConfig
  customerConfig --> customerSeed
  customerConfig --> customerTemplate
  customerConfig -->|确认通用能力后| coreReview
  coreReview --> coreEntry
  coreEntry --> master
  customerDocs -. 不得自动升级 .-> coreEntry
  workflow -. 禁止直接写 .-> fact
```

上图只描述归属边界，不新增 runtime loader、schema、migration、RBAC 权限码或菜单入口。客户资料要进入产品核心，必须先完成通用性评审；Workflow 到 Fact 的虚线是禁区提示，不是调用关系。

## Workflow 协同层 / Workflow

Workflow 只负责：

- 协同任务。
- 任务事件。
- 业务状态推进。
- 必要的协同任务派生。
- 许可和职责流转。

WorkflowUsecase 禁止直接写：

- `inventory_txns`
- `inventory_balances`
- `shipments`
- `stock_reservations`
- AR / AP
- invoice
- payment

## Fact 事实层 / Fact

Fact 层记录真实业务发生：

- 入库。
- 出库。
- 库存流水。
- 库存预留。
- 质检判定。
- 出货。
- 应收 / 应付。
- 发票。
- 收付款。

事实层必须有状态机、幂等、审计和冲正边界，不能靠 UI 状态或 workflow payload 伪造。
