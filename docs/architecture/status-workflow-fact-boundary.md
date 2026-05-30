# Status, Workflow And Fact Boundary

## 核心口诀

```text
流程管协同，单据管阶段，事实管落账，结果靠计算，系统状态别混业务。
```

## 五层状态

| 层 | 负责什么 | 例子 |
| --- | --- | --- |
| Workflow 协同层 | 节点有没有处理、通过、拒绝、阻断 | pending / done / blocked |
| 单据生命周期层 | 订单、采购、出货等业务阶段 | draft / submitted / shipping_released / shipped |
| 业务事实层 | 真实动作有没有发生和过账 | inventory_txns / shipments / invoices / payments |
| 业务结果 / 派生状态 | 从事实汇总出来的结果 | partial_shipped / fully_paid / settled |
| 系统横切状态 | 幂等、同步、导入、通知等系统过程 | processing / synced / failed |

## 出货放行边界

- `workflow done != 已出库 / 已入库 / 已开票 / 已收款`。
- `shipping_released = 已放行 / 可发货 / 待出库`。
- `shipping_released != 已出库 / 已发货 / 已扣库存`。
- 只有真实 `ShipmentUsecase`、出库确认和库存事实写入后，才能进入 `shipped`。

`shipment_release done` 禁止直接触发：

- `inventory_txns`
- `shipments`
- `reservations`
- AR / invoice

## 动作、事实、结果

正确链路：

```text
动作产生事实，事实推导结果。
```

示例：

```text
确认出库
-> 创建 / 确认 shipment
-> 写 inventory_txns posted
-> 根据事实计算 fulfillment_status
-> 必要时推进 order.status
```

错误链路：

```text
workflow done
-> 直接 order.status = shipped
-> 不写 shipment
-> 不写 inventory_txns
```

## 派生状态

- 派生状态可以缓存。
- 派生状态必须能从事实重算。
- 派生状态不能伪造事实。

## Canonical status 与中文文案

- DB 和业务逻辑只认 canonical status。
- UI 显示中文文案。
- UI 不能用中文文案做业务判断。
- 客户可以调整低风险显示文案，但不能改变状态语义。

`shipping_released` 可显示为：

- 已放行。
- 可发货。
- 待出库。
- 出货已放行。

不能显示为：

- 已出库。
- 已发货。
- 已扣库存。

## 最小测试要求

- blocked / rejected 必须要求 reason。
- 空字符串 / 全空格 reason 无效。
- 重复提交幂等。
- 同名但非目标任务不触发。
- settled 后不触发特殊 rule。
- 中文文案变更不影响业务逻辑。
