# 配置与权限策略 / Config And Permission Policy

## 分层

| 层 | 作用 |
| --- | --- |
| Feature Flag | 控制客户启用哪些模块或产品内置流程模式 |
| RBAC | 控制角色、权限、动作、职责和岗位任务端入口 |
| Data Scope | 控制用户能看或能操作哪些数据范围 |
| State Machine | 控制当前状态是否允许执行动作 |
| Idempotency | 防止重复提交、重复回调、重复扣库存或重复开票 |
| Audit Log | 记录关键配置、权限、状态和业务事实变化 |

业务动作判断顺序：

1. Feature Flag：客户是否启用该模块。
2. RBAC：用户是否拥有动作 / 职责权限。
3. Data Scope：用户是否拥有数据范围权限。
4. State Machine：当前状态是否允许该动作。
5. Idempotency：同一动作是否已经处理过。
6. Audit：记录谁在何时做了什么。

## 客户可以配置

- 公司名、logo、主题色。
- 菜单开关、模块开关。
- 字段显示、字段必填。
- 编号规则。
- 打印抬头、页脚、logo、公司信息等低风险展示参数，或客户打印样本引用；不包含通用打印模板引擎。
- 角色模板、权限模板。
- 初始化数据。
- 默认仓库、默认单位。

## 客户不能配置

- 库存扣减规则。
- 入库增库存规则。
- 库存流水删除。
- 财务核销逻辑。
- 审计关闭。
- 核心状态机自由拖拽。
- 数据库结构。
- 自定义业务对象。

## 流程节点绑定职责

流程节点不绑定固定岗位，绑定稳定职责 / 权限：

| 节点 | 建议职责 / 权限 |
| --- | --- |
| shipment.release | `shipment.release` / `warehouse.outbound.confirm` / 财务放行相关动作 |
| payment.approve | `payment.approve` / `finance.payable.confirm` |
| material_readiness.confirm | `material_readiness.confirm` / `pmc.plan.update` |
| quality.inspection.pass | `quality.inspection.update` 或后续独立 pass 动作 |

客户角色再绑定这些职责。不同客户有不同岗位名称时，不需要改 Product Core。
