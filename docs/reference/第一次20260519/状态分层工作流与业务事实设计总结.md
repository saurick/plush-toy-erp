Doc Type / 文档类型: Imported Design Note / 外部导入设计笔记
Status / 状态: Reference Only / 仅作参考
Runtime Source of Truth / 运行时真源: No / 否
Schema Source of Truth / Schema 真源: No / 否
Current Implementation Source of Truth / 当前实现真源: No / 否
Notes / 备注: 当前文档只作为 0 到 1 架构输入，不能直接驱动 schema 或 runtime。

# 状态分层、状态机、Workflow 与业务事实设计总结 / ERP Status Workflow Context

## 一、核心结论

本 ERP 的状态设计不要做成一个大而全的 `status` 字段，也不要把 workflow 状态、订单状态、库存事实、出货事实、财务事实混在一起。

推荐认知：

```text
流程管协同，单据管阶段，事实管落账，结果靠计算，系统状态别混业务。
```

最终分类建议：

```text
1. Workflow 协同层
2. 单据生命周期层
3. 业务事实层
4. 业务结果 / 派生状态
5. 系统横切状态
```

注意：

```text
业务结果 / 派生状态不是新的原始事实层。
它是从业务事实计算出来的结果，可以缓存，但必须能重算。
```

---

## 二、为什么要分层

状态分层的目的不是为了复杂，而是为了避免这些问题：

- 把 `workflow done` 误认为业务完成
- 把 `shipping_released` 误认为已出库
- 把 UI 文案当成系统状态
- 把审批结果、库存流水、财务结果混成一个字段
- 一个 `status` 里塞进 `done / approved / shipped / posted / settled / issued / blocked`
- 重复提交导致重复扣库存、重复开票、重复生成出货单
- 同名 workflow 节点误触发业务动作
- 终态单据被重复回调再次改变

核心原则：

```text
不同层的状态表达不同含义，不能互相替代。
```

---

## 三、状态总分类

| 大类 | 管什么 | 例子 | 是否代表真实业务发生 |
|---|---|---|---|
| Workflow 协同层 | 流程节点有没有完成、审批有没有通过、有没有被阻断 | pending / done / blocked | 否 |
| 单据生命周期层 | 订单、采购单、出货单走到哪个业务阶段 | draft / submitted / shipping_released / shipped / settled | 部分是，需看具体状态 |
| 业务事实层 | 库存、出货、入库、开票、收款等真实动作有没有发生 | inventory_txns / shipments / invoices / payments | 是 |
| 业务结果 / 派生状态 | 根据事实汇总出来的结果 | partial_shipped / fully_paid / settled | 不是原始事实，是计算结果 |
| 系统横切状态 | 幂等、同步、导入、任务、通知等系统过程 | processing / synced / failed | 否 |

---

## 四、Workflow 协同层

Workflow 层只回答：

```text
这个流程节点有没有通过？
有没有被阻断？
要不要退回？
谁来处理？
谁已经处理？
```

常见状态：

| 状态 key | 中文 | 含义 |
|---|---|---|
| pending | 待处理 | 任务已生成，等待处理 |
| in_progress | 处理中 | 有人正在处理 |
| done | 已完成 / 已通过 | 当前 workflow 节点完成 |
| blocked | 已阻断 | 流程被阻断，必须有原因 |
| rejected | 已拒绝 | 审批拒绝，通常归并为 blocked |
| returned | 已退回 | 退回上一步或退回修改 |
| canceled | 已取消 | 流程被取消 |

重要边界：

```text
workflow done 只代表流程节点完成。
它不等于已出库。
它不等于已入库。
它不等于已开票。
它不等于已收款。
它不等于已结算。
```

---

## 五、Workflow 内部也可以细分

| 类型 | 例子 | 说明 |
|---|---|---|
| workflow_instance_status | running / done / canceled / blocked | 整个流程实例的状态 |
| workflow_task_status | pending / in_progress / done / blocked | 单个任务节点的状态 |
| workflow_decision | approved / rejected / returned | 审批人的处理结果 |
| workflow_block_reason | stock_shortage / price_error / credit_blocked | 阻断原因分类 |
| workflow_assignee_status | assigned / claimed / completed | 任务分派和领取状态 |

不要把这些状态直接当成订单、库存、财务事实。

---

## 六、单据生命周期层

单据生命周期层回答：

```text
这个订单 / 采购单 / 出货单 / 入库单走到哪个业务阶段？
```

以销售订单为例：

| 状态 key | 中文 | 含义 |
|---|---|---|
| draft | 草稿 | 还没提交 |
| submitted | 已提交 | 已提交等待后续处理 |
| approval_pending | 待审批 | 等待审批 |
| shipping_released | 已放行 / 可发货 | 允许仓库进入发货环节，但不是已出库 |
| shipped | 已出库 / 已发货 | 真实出库或出货完成，通常需要关联出货事实 |
| settled | 已结算 | 业务或财务已经进入终态 |
| blocked | 已阻断 | 业务被阻断，必须有 reason |
| canceled | 已取消 | 单据被取消 |

关键：

```text
shipping_released 属于单据生命周期层。
它不是 workflow 状态。
它也不是库存事实。
```

正确理解：

```text
workflow done
-> 推动 order.status = shipping_released
-> 代表允许发货
-> 不代表货已经出库
```

---

## 七、单据主状态不要承担所有含义

不要用一个 `order.status` 表达所有事情。

推荐拆成多个状态字段：

| 字段 | 中文 | 说明 |
|---|---|---|
| order.status | 单据主状态 | draft / submitted / active / closed / canceled |
| order.approval_status | 审批状态 | pending / approved / rejected |
| order.release_status | 放行状态 | not_released / shipping_released / blocked |
| order.fulfillment_status | 履约状态 | not_shipped / partial_shipped / fully_shipped |
| order.payment_status | 收款状态 | unpaid / partial_paid / paid |
| order.invoice_status | 开票状态 | not_invoiced / partial_invoiced / fully_invoiced |
| order.settlement_status | 结算状态 | unsettled / partial_settled / settled |

这样比把所有状态塞进一个 `status` 更清晰。

---

## 八、业务事实层

业务事实层回答：

```text
真实业务动作有没有发生？
有没有留下可追溯记录？
有没有过账？
有没有冲正？
```

常见业务事实：

| 事实对象 | 中文 | 说明 |
|---|---|---|
| inventory_txns | 库存流水 | 库存真实变化记录 |
| shipments | 出货 / 发货记录 | 真实出货事实 |
| stock_in_records | 入库记录 | 真实入库事实 |
| reservations | 库存预留 | 库存占用事实 |
| invoices | 发票 | 开票事实 |
| AR / receivables | 应收 | 应收事实 |
| AP / payables | 应付 | 应付事实 |
| payments | 收款 / 付款 | 资金动作事实 |
| quality_inspections | 质检记录 | 质检事实 |

业务事实层原则：

```text
只有真实发生，才写事实表。
事实表不能随便删除。
错误应该靠冲正、作废、反向记录修正。
```

---

## 九、业务事实层内部再分两类

业务事实层内部可以细分为：

```text
1. 业务动作状态
2. 业务结果 / 派生状态
```

### 1. 业务动作状态

业务动作状态表示：

```text
某个真实动作正在做、做完了、失败了、冲正了。
```

例子：

| 对象 | 状态字段 | 例子 |
|---|---|---|
| shipment | shipment.status | pending / picked / shipped / canceled |
| inventory_txn | inventory_txn.status | pending / posted / reversed |
| invoice | invoice.status | draft / issued / voided / reversed |
| payment | payment.status | pending / received / reversed |
| stock_reservation | reservation.status | reserved / consumed / released / expired |
| quality_inspection | quality_status | pending / passed / failed / waived |

### 2. 业务结果 / 派生状态

业务结果 / 派生状态表示：

```text
根据多个事实汇总出来的结果。
```

例子：

| 派生状态 | 例子 | 来源 |
|---|---|---|
| fulfillment_status | not_shipped / partial_shipped / fully_shipped | shipment + inventory_txns + order_lines |
| receipt_status | not_received / partial_received / fully_received | stock_in_records + purchase_order_lines |
| payment_status | unpaid / partial_paid / paid | payments + receivables |
| invoice_status | not_invoiced / partial_invoiced / fully_invoiced | invoices + order amount |
| settlement_status | unsettled / partial_settled / settled | invoice + payment + reconciliation |
| inventory_availability | available / reserved / shortage | on_hand - reserved - allocated |
| exception_status | normal / abnormal / blocked | 异常记录 + 规则判断 |

派生状态原则：

```text
可以缓存，但必须能从事实重算。
```

---

## 十、动作、事实、结果的关系

正确链路：

```text
用户确认出库
-> 创建 / 确认 shipment
-> 写 inventory_txns posted
-> 根据出库事实计算 order.fulfillment_status
-> 必要时推进 order.status
```

错误链路：

```text
用户点一下“已出库”
-> 直接 order.status = shipped
-> 不写 shipment
-> 不写 inventory_txns
```

核心经验：

```text
动作产生事实，事实推导结果。
```

---

## 十一、出货放行规则

出货放行是一个典型边界场景。

规则：

```text
done -> shipping_released
blocked / rejected -> blocked
```

含义：

```text
workflow done
只表示审批流程完成，可以放行发货。

order.status = shipping_released
只表示允许发货，不表示已经出库。
```

`shipping_released` 不能触发这些动作：

- 不写 `inventory_txns`
- 不写 `shipments`
- 不写 `reservations`
- 不写 `AR / invoice`
- UI 不能写成“已出库”

允许的 UI 文案：

| 状态 | 推荐中文 |
|---|---|
| shipping_released | 已放行 |
| shipping_released | 可发货 |
| shipping_released | 待出库 |
| shipping_released | 出货已放行 |

不允许的 UI 文案：

| 状态 | 错误中文 |
|---|---|
| shipping_released | 已出库 |
| shipping_released | 已发货 |
| shipping_released | 已扣库存 |

只有这些状态才可以写“已出库 / 已发货”：

| 状态 | 中文 |
|---|---|
| shipped | 已出库 / 已发货 |
| shipment.status = shipped | 出货完成 |
| inventory_txn.status = posted 且类型为 outbound | 库存已扣减 |

---

## 十二、blocked / rejected 规则

审批失败或阻断时：

```text
blocked / rejected -> blocked
```

要求：

```text
必须有 reason。
空字符串 / 空格 reason 无效。
```

校验规则：

```go
strings.TrimSpace(reason) != ""
```

原因：

```text
业务被阻断后，仓库、业务、财务都必须知道为什么不能继续。
```

常见 reason：

- 库存不足
- 客户信用不足
- 价格异常
- 资料不完整
- 审批拒绝
- 质检不通过
- 财务未确认

---

## 十三、settled 终态规则

`settled` 是终态或接近终态。

规则：

```text
如果单据已经 settled，后续 workflow 回调不再触发特殊业务规则。
```

不能再触发：

- 自动放行
- 自动出库
- 自动开票
- 自动生成应收
- 自动修改关键金额
- 自动修改库存事实

核心经验：

```text
终态要保护，重复回调不能改变已经结算的业务事实。
```

---

## 十四、幂等设计

幂等不是 workflow 独有。

凡是可能重复提交、重复回调、重复消费、重复点击的地方，都要幂等。

必须考虑幂等的场景：

| 场景 | 风险 |
|---|---|
| workflow 回调 | 审批系统重复通知 |
| 确认入库 | 重复增加库存 |
| 确认出库 | 重复扣库存 |
| 写 inventory_txns | 重复生成库存流水 |
| 生成 shipment | 重复生成出货单 |
| 生成 invoice / AR | 重复生成财务单据 |
| MQ 消费 | 消息重复投递 |
| 定时任务 | 任务重复执行 |
| Excel 导入 | 同一文件重复导入 |
| 支付 / 收款回调 | 第三方重复通知 |

幂等常见实现：

| 方法 | 说明 |
|---|---|
| idempotency_key | 同一动作使用同一个幂等键 |
| unique constraint | 数据库唯一约束兜底 |
| request_log / event_log | 记录处理过的外部事件 |
| status guard | 已完成则直接返回成功 |
| transaction | 状态检查和写入同一事务 |
| outbox pattern | 对外事件可靠发送 |

workflow 回调幂等规则：

```text
同一个 workflow_event_id / task_id / business_id / action
只能成功处理一次。

重复提交时，如果目标状态已经达成，直接返回 success。
```

---

## 十五、同名但非目标任务不触发

workflow 里可能多个节点同名，例如：

```text
财务 approve
仓库 approve
老板 approve
```

所以不能只靠任务名称触发业务动作。

错误判断：

```text
task.name == "approve"
```

正确判断：

```text
workflow_type + task_definition_key + node_id + business_id + expected_action
```

核心经验：

```text
同名任务不能触发错业务。
流程节点要用稳定 key，不用显示名称判断。
```

---

## 十六、Canonical Status 与 Alias

系统内部只认 canonical status。

外部叫法、用户叫法、第三方状态，都要先归一化。

### Workflow 状态归一化

| 外部叫法 / 用户叫法 | 内部 canonical status | 中文 |
|---|---|---|
| approved | done | 已完成 / 已通过 |
| passed | done | 已完成 / 已通过 |
| success | done | 已完成 / 已通过 |
| completed | done | 已完成 / 已通过 |
| rejected | blocked | 已阻断 |
| denied | blocked | 已阻断 |
| failed | blocked | 已阻断 |
| stopped | blocked | 已阻断 |

### 出货状态归一化

| 外部叫法 / 用户叫法 | 内部 canonical status | 中文 |
|---|---|---|
| released | shipping_released | 已放行 / 可发货 |
| ready_to_ship | shipping_released | 已放行 / 可发货 |
| allowed_to_ship | shipping_released | 已放行 / 可发货 |
| shipped | shipped | 已出库 / 已发货 |
| outbound_done | shipped | 已出库 / 已发货 |
| delivered_to_carrier | shipped | 已交运 / 已发货 |

注意：

```text
shipping_released ≠ shipped
```

---

## 十七、中文文案和内部状态要分离

数据库和代码只判断内部 key：

```text
shipping_released
shipped
blocked
settled
posted
issued
reversed
```

UI 可以显示中文：

```text
已放行
可发货
待出库
已出库
已结算
已过账
已冲正
```

但 UI 文案不能改变业务含义。

禁止：

```text
用中文文案做业务判断。
让客户自定义文案改变状态机含义。
把 shipping_released 显示为“已出库”。
```

核心经验：

```text
内部用 key，外部配文案。
业务逻辑判断 key，不判断中文。
```

---

## 十八、状态机不是 Workflow 独有

状态机不只存在于 workflow。

凡是状态不能乱跳的对象，都应该有状态机。

| 模块 | 是否需要状态机 | 例子 |
|---|---|---|
| workflow | 需要 | pending -> done / blocked |
| 销售订单 | 需要 | draft -> submitted -> shipping_released -> shipped -> settled |
| 采购单 | 需要 | created -> ordered -> received -> settled |
| 入库单 | 需要 | pending -> confirmed -> posted |
| 出库单 | 需要 | pending -> picked -> shipped |
| 库存流水 | 需要 | pending -> posted -> reversed |
| 发票 / 应收 | 需要 | draft -> issued -> settled -> reversed |
| 导入任务 | 需要 | uploaded -> validating -> imported -> failed |
| 外部同步 | 需要 | pending -> synced -> failed |

核心经验：

```text
状态机不是 workflow 专属。
幂等也不是 workflow 专属。
```

---

## 十九、状态机实现归属

按实现层分职责：

| 实现层 | 负责什么 | 不该做什么 |
|---|---|---|
| UI 层 | 展示中文文案、控制按钮显示 | 不决定状态能不能跳 |
| service / API 层 | 接收请求、参数校验、调用 usecase | 不直接写核心状态 |
| usecase / application 层 | 编排流程、处理事务、处理幂等 | 不绕过 domain 状态机 |
| biz / domain 层 | 定义状态、跳转规则、业务不变量 | 不关心数据库细节 |
| data / repository 层 | 持久化状态、写流水、唯一约束 | 不决定业务语义 |
| DB 层 | 存 canonical status、唯一索引、必要约束 | 不存中文状态作为业务判断 |
| tests 层 | 验证允许跳转、禁止跳转、幂等、终态保护 | 不只测 happy path |

推荐归属：

```text
状态定义：biz/domain
状态跳转规则：biz/domain
业务编排：usecase/application
幂等控制：usecase + data + DB
数据落库：data/repository
中文文案：UI / 配置表
```

---

## 二十、推荐目录结构示例

```text
server/internal/biz/status/
  workflow_status.go
  order_status.go
  shipment_status.go
  inventory_txn_status.go
  finance_status.go

server/internal/biz/statemachine/
  workflow_machine.go
  order_machine.go
  shipment_machine.go
  inventory_machine.go
  finance_machine.go

server/internal/biz/
  order.go
  shipment.go
  inventory.go
  finance.go

server/internal/service/
  order_service.go
  workflow_callback_service.go

server/internal/data/
  order_repo.go
  shipment_repo.go
  inventory_txn_repo.go
  idempotency_repo.go
```

原则：

```text
service 层不要到处 if status == xxx 然后直接改数据库。
状态变化必须经过 domain/usecase。
```

---

## 二十一、权限、模块、数据范围、状态机的判断顺序

执行业务动作时，不能只看 UI 按钮。

推荐判断顺序：

```text
1. Feature Flag：客户是否启用该模块
2. RBAC：用户是否拥有该动作 / 职责权限
3. Data Scope：用户是否能操作这条数据
4. State Machine：当前状态是否允许该动作
5. Business Rule：业务规则是否允许
6. Idempotency：是否重复提交
7. Audit Log：记录谁在什么时候做了什么
```

例如确认出库：

```text
enable_shipping 是否启用
用户是否有 stock_out.confirm / shipment.confirm
用户是否能操作该仓库
出货单是否处于待出库状态
库存是否满足业务规则
是否已经处理过同一个确认请求
确认后写 shipment / inventory_txns
记录审计日志
```

---

## 二十二、Workflow 节点不要绑定岗位，要绑定职责 / 权限

不要这样设计：

```text
出货放行 -> 仓库主管
付款审核 -> 财务主管
物料齐套确认 -> PMC
```

应该这样设计：

```text
出货放行 -> shipment.release
付款审核 -> payment.approve
物料齐套确认 -> material_readiness.confirm
```

原因：

```text
岗位和角色是客户自己的组织结构，不稳定。
职责 / 权限 / 能力点是系统内核，比较稳定。
```

关系应该是：

```text
流程节点 -> 需要某种职责 / 权限
客户角色 -> 绑定这些职责 / 权限
用户 -> 绑定角色
```

---

## 二十三、Workflow / 状态中英对照示例

### Workflow 节点示例

| Workflow key | 中文 | 含义 |
|---|---|---|
| boss_approval | 老板审批 / 主管审批 | 订单或关键业务进入上级审批 |
| engineering_data | 工程资料完善 | 审批通过后完善 BOM / 工艺 / 工程资料 |
| order_revision | 订单退回修改 | 审批不通过，退回业务修改 |
| iqc | 来料质检 | 采购物料到厂后的来料检验 |
| warehouse_inbound | 仓库入库确认 | 质检通过后，仓库确认入库 |
| purchase_quality_exception | 采购质检异常 | 来料质检不合格后的异常处理 |
| outsource_return_qc | 外协回厂质检 | 外协加工件回厂后的质检 |
| outsource_warehouse_inbound | 外协件入库确认 | 外协质检通过后入库 |
| outsource_rework | 外协返工 | 外协质检不合格，需要返工 |
| finished_goods_qc | 成品质检 | 成品完工后的最终质检 |
| finished_goods_inbound | 成品入库确认 | 成品质检通过后入成品仓 |
| finished_goods_rework | 成品返工 | 成品质检不合格，需要返工 |
| shipment_release | 出货放行审批 | 出货前的放行判断，不等于真实出库 |

### 单据 / 事实状态示例

| 状态 key | 中文 | 所属层 |
|---|---|---|
| pending | 待处理 | Workflow / 任务状态 |
| done | 已完成 / 已通过 | Workflow 协同层 |
| blocked | 已阻断 | Workflow / 单据层都可有，但语义要明确 |
| rejected | 已拒绝 | Workflow decision，通常归并 blocked |
| shipping_released | 已放行 / 可发货 | 单据生命周期层 |
| shipped | 已出库 / 已发货 | 单据生命周期层 + 出货事实相关 |
| inbound_done | 已入库 | 入库事实 / 单据阶段 |
| posted | 已过账 | 库存 / 财务事实层 |
| reversed | 已冲正 | 事实层修正状态 |
| settled | 已结算 | 单据 / 财务终态 |

---

## 二十四、典型流程跳转示例

| 当前 workflow | 中文 | 成功后进入 | 中文 | 失败 / 阻断后进入 | 中文 |
|---|---|---|---|---|---|
| boss_approval | 老板审批 | engineering_data | 工程资料完善 | order_revision | 订单退回修改 |
| iqc | 来料质检 | warehouse_inbound | 仓库入库确认 | purchase_quality_exception | 采购质检异常 |
| warehouse_inbound | 仓库入库确认 | inbound_done | 已入库 | blocked | 已阻断 |
| outsource_return_qc | 外协回厂质检 | outsource_warehouse_inbound | 外协件入库确认 | outsource_rework | 外协返工 |
| finished_goods_qc | 成品质检 | finished_goods_inbound | 成品入库确认 | finished_goods_rework | 成品返工 |
| finished_goods_inbound | 成品入库确认 | inbound_done | 已入库 | blocked | 已阻断 |
| shipment_release | 出货放行审批 | shipping_released | 已放行 / 可发货 | blocked | 已阻断 |

注意：

```text
这里的 shipping_released 是单据状态，不是 workflow 任务状态。
```

---

## 二十五、出货放行回调的规则清单

当收到 workflow 回调时：

| 规则 | 说明 |
|---|---|
| done -> shipping_released | 审批完成后，订单进入已放行 / 可发货 |
| blocked / rejected -> blocked | 阻断和拒绝统一为 blocked |
| 必须有 reason | blocked 必须有原因 |
| 空字符串 / 空格 reason 无效 | reason 要 trim 后非空 |
| 重复提交幂等 | 同一事件重复提交不能重复改变业务 |
| 同名但非目标任务不触发 | 必须匹配 workflow_type / task_definition_key / node_id |
| settled 状态不再触发特殊 rule | 终态保护 |
| 不写 inventory_txns | 放行不是扣库存 |
| 不写 shipments | 放行不是已发货 |
| 不写 reservations | 放行不自动预留，除非明确设计 |
| 不写 AR / invoice | 放行不是财务事实 |
| UI 文案不能写“已出库” | shipping_released 只能写已放行 / 可发货 / 待出库 |

---

## 二十六、数据库字段设计建议

### workflow_tasks

```text
id
tenant_id
workflow_instance_id
workflow_type
task_definition_key
node_id
business_type
business_id
status
assignee_id
decision
reason
created_at
updated_at
completed_at
```

### sales_orders

```text
id
tenant_id
order_no
status
approval_status
release_status
fulfillment_status
invoice_status
payment_status
settlement_status
blocked_reason
created_at
updated_at
settled_at
```

### shipments

```text
id
tenant_id
shipment_no
order_id
status
picked_at
shipped_at
canceled_at
created_at
updated_at
```

### inventory_txns

```text
id
tenant_id
txn_no
source_type
source_id
warehouse_id
sku_id
direction
quantity
status
posted_at
reversed_at
created_at
updated_at
```

### idempotency_records

```text
id
tenant_id
idempotency_key
source_system
business_type
business_id
action
status
request_hash
response_snapshot
created_at
updated_at
```

---

## 二十七、测试清单

状态机测试不要只测 happy path。

必须测试：

- 允许的状态跳转可以成功
- 禁止的状态跳转会失败
- workflow done 只能放行，不能扣库存
- shipping_released 不能显示成已出库
- blocked 必须有 reason
- reason 为空字符串或空格时报错
- 同一个 workflow 事件重复回调不会重复执行
- 非目标 task 不触发业务动作
- settled 后不再触发特殊规则
- 确认出库重复点击不会重复扣库存
- inventory_txns 有唯一约束或幂等保护
- invoice / AR 不会在放行阶段生成
- UI 隐藏按钮后，后端仍然做权限和状态校验
- 中文文案修改不影响业务逻辑

---

## 二十八、最重要的经验口诀

```text
流程管协同，单据管阶段，事实管落账，结果靠计算，系统状态别混业务。
```

```text
审批 done 只是流程完成；
shipping_released 只是允许发货；
shipped 才是已出库；
inventory_txns posted 才是库存真的变了；
invoice issued 才是财务单据真的生成了。
```

```text
状态分层，语义归一；内部用 key，外部配文案。
```

```text
动作产生事实，事实推导结果。
```

```text
状态要受控，重试要幂等，终态要保护。
```

---

## 二十九、最终结论

本 ERP 的状态设计应该走：

```text
分层状态 + 受控状态机 + 业务事实可追溯 + 派生状态可重算 + 幂等保护 + UI 文案分离
```

不要走：

```text
一个大 status 管所有事情
workflow 直接改库存 / 财务事实
客户自由拖拽核心状态机
用中文文案做业务判断
用审批通过代替真实出库 / 入库 / 开票 / 收款
```

最关键边界：

- Workflow 只管协同和审批，不直接代表业务事实
- 单据状态只管业务阶段，不一定代表真实落账
- 业务事实必须由真实动作产生，并留下可追溯记录
- 业务结果 / 派生状态必须能从事实重算
- 幂等不只是 workflow，要覆盖所有关键业务动作
- UI 文案可以配置，但不能改变系统语义
- 终态单据要保护，重复回调不能再触发特殊规则
