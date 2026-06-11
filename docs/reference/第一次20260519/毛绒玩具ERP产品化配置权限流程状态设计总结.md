Doc Type / 文档类型: Imported Design Note / 外部导入设计笔记
Status / 状态: Reference Only / 仅作参考
Runtime Source of Truth / 运行时真源: No / 否
Schema Source of Truth / Schema 真源: No / 否
Current Implementation Source of Truth / 当前实现真源: No / 否
Notes / 备注: 当前文档只作为 0 到 1 架构输入，不能直接驱动 schema 或 runtime。

# 毛绒玩具 ERP 产品化配置、权限、流程与状态设计总结


> 适用用途：作为后续需求分析、系统设计、代码实现、客户交付、AI 上下文分析的基础文档。
>
> 核心口径：通用产品内核 + 受控客户差异 + 分层状态机 + 业务事实可追溯 + 权限职责可配置 + UI/模板适度灵活。

---

## 文档修订重点

本版在原稿基础上做了以下修正和补强：

- 明确区分 **Workflow 协同层、单据生命周期层、业务事实层、业务结果 / 派生状态、系统横切状态**。
- 修正“业务事实”的表达：订单、采购单等属于业务源单据 / 业务承诺；库存流水、出入库、收付款、发票等属于更强的执行事实 / 落账事实。
- 补充 `shipping_released` 的边界：它只能表示“已放行 / 可发货”，不能表示“已出库”。
- 补充 `done -> shipping_released`、`blocked / rejected -> blocked`、`settled` 终态保护、reason 非空、重复提交幂等、非目标任务不触发等规则。
- 补充幂等不是 Workflow 专属，库存、出货、发票、收付款、导入、MQ、同步都需要幂等保护。
- 补充内部 canonical status、alias、中文文案分离原则：数据库只存稳定 key，UI 才显示中文。
- 补充实现分层：domain / biz 放状态定义和跳转规则，usecase 做编排，repository 做持久化，UI / 配置表管文案。
- 补充测试清单，便于后续让 AI 或开发人员按清单检查设计。

## 一、项目定位

本 ERP 不应该做成“所有行业通用 ERP”或“低代码平台”，更适合先聚焦同一类型业务 / 同一细分行业，例如毛绒玩具及相近轻工行业。

核心原因：

- 同类客户的业务对象更相似
- 通用能力占比更高
- 客户差异更容易通过配置、模板、模块开关、角色权限、初始化数据解决
- 不容易变成每个客户一套系统
- 更利于后期产品化、交付、维护、升级

目标形态：

- 一套标准产品内核
- 多套客户配置包
- 少量客户专属模板 / 适配层
- 极少数客户专属扩展
- 核心业务代码尽量不分叉

不要做成：

- 客户 A 一套代码
- 客户 B 一套代码
- 客户 C 一套代码

推荐做成：

- 同一套代码
- 不同客户配置
- 不同初始化数据
- 不同打印 / 导出模板
- 不同菜单 / 模块开关
- 不同角色权限模板
- 必要时有客户专属扩展包

---

## 二、核心原则

一句话：

业务事实稳定，状态流程受控，模块菜单受控，职责权限灵活，展示模板可定制，客户配置是我方配置能力的安全子集。

也可以理解为：

- 我们配置“系统能力边界”
- 客户配置“组织使用方式”

客户可以配置：

- 谁能看
- 谁能做
- 谁负责哪个环节
- 显示哪些字段
- 用哪个打印模板
- 公司 Logo / 名称 / 地址
- 基础字典
- 用户和角色

客户不能自由配置：

- 入库是否增加库存
- 出库是否扣库存
- 收付款是否生成财务记录
- 审计日志是否关闭
- 核心单据关系是否存在
- 库存流水能不能删除
- 财务核销逻辑
- 核心状态机自由拖拽
- 数据库结构自由修改
- 自定义业务对象

---

## 三、配置自由度分层

### 1. 不建议灵活配置的层

这些属于 ERP 的核心事实层和账务基础，应该由产品统一维护：

- 订单
- 采购单
- 委外单
- 入库单
- 出库单
- 出货单
- 库存流水
- 对账单
- 收款单
- 付款单
- 操作日志
- 审批记录
- 核心单据关系
- 财务规则
- 库存规则
- 审计逻辑

这类内容不能因为客户不同就变成完全不同的规则。

例如不能让客户配置成：

- 入库确认后不产生库存流水
- 出货确认后不扣库存
- 付款不关联应付
- 收款不核销应收
- 作废单据直接删除财务流水
- 关闭核心审计日志

### 2. 受控配置的层

这些可以配置，但必须是产品内置范围内的受控配置：

- 模块开关
- 菜单入口
- 状态机模式
- 流程节点启用 / 跳过
- 是否启用委外
- 是否启用质检
- 是否启用生产跟进
- 是否启用多仓库
- 是否启用移动端扫码
- 是否启用财务对账
- 某流程节点由哪个职责处理

状态机不要做成客户自由拖拽，而是产品内置有限模式。

例如入库流程可以内置：

- 简单模式：入库通知 -> 入库确认
- 质检模式：入库通知 -> 质检 -> 入库确认
- 严格模式：入库通知 -> 质检 -> 仓库复核 -> 入库确认

客户只能选择模式或开启 / 关闭节点，不能随便把流程改成反常顺序。

### 3. 可以灵活配置的层

这些属于低风险配置，可以给客户管理员开放一部分：

- 公司名称
- Logo
- 公司地址
- 电话
- 税号
- 单号规则
- 打印模板
- 导出模板
- 字典项
- 角色
- 用户
- 权限分配
- 菜单显示 / 隐藏
- 按钮显示 / 隐藏
- 移动端入口
- 列表字段显示
- 列顺序
- 报表展示字段
- 通知人
- 审批人
- 部分审批金额阈值

---

## 四、客户配置是我方配置能力的安全子集

系统内部可以支持很多配置，但不能全部开放给客户。

### 1. 我方 / 实施方配置

我方控制：

- 客户启用哪些模块
- 客户是否启用委外
- 客户是否启用质检
- 客户采用哪种状态机模式
- 核心权限点定义
- 核心流程模式
- 核心单据关系
- 财务规则
- 库存规则
- 审计规则
- 初始化角色模板
- 初始权限模板
- 客户交付包
- 客户专属打印模板
- 客户专属导入模板
- 部署参数
- 升级迁移策略

### 2. 客户管理员配置

客户管理员可以配置：

- 用户账号
- 员工角色
- 角色名称
- 角色绑定部分权限
- 菜单显示范围
- 基础字典
- 公司信息
- Logo
- 打印模板参数
- 审批人
- 通知人
- 移动端入口权限
- 列表字段显示
- 部分报表展示配置

### 3. 客户不能配置

客户不能自由配置：

- 自己开启未启用模块
- 改库存扣减规则
- 改入库增库存规则
- 改财务核销规则
- 改核心状态机结构
- 关闭审计日志
- 删除库存流水
- 修改核心单据关系
- 自定义数据库结构
- 自定义业务对象

---

## 五、业务事实、财务规则、核心单据关系、审计逻辑解释

### 1. 业务事实

业务事实是 ERP 中需要被追溯、审计、对账的业务记录。它可以再细分为两类：

#### 1.1 业务源单据 / 业务承诺

这类记录表达业务约定、计划、责任或来源，不一定代表库存或财务已经真实落账。

例如：

- 销售订单
- 采购单
- 委外单
- 生产任务
- 入库通知
- 出货通知
- 对账单

这些单据一旦进入正式流程，就不能随意删除或改写历史，只能通过状态、作废、变更记录、审计日志来处理。

#### 1.2 执行事实 / 落账事实

这类记录表达真实业务动作已经发生，通常会影响库存、财务、履约或审计。

例如：

- 入库记录
- 出库记录
- 出货单
- 库存流水 `inventory_txns`
- 库存预留 `reservations`
- 收款单
- 付款单
- 发票 / 应收 / 应付
- 冲正记录

这类事实不能被客户自由配置，也不能通过直接删除来回滚。需要作废、冲正、反过账或重新生成对应的修正记录。

一句话：

```text
源单据记录业务来源；执行事实记录真实发生；流水和财务记录负责落账追溯。
```

### 2. 财务规则

财务规则是钱相关的事实怎么生成、怎么追溯、怎么冲正。

例如：

- 出货后是否形成应收
- 收款后如何核销应收
- 采购入库后是否形成应付
- 付款后如何核销应付
- 委外完成后是否形成委外应付
- 作废后是删除记录还是生成冲正记录

这些不能开放给客户自由配置。

### 3. 核心单据关系

核心单据关系是系统中单据之间的业务链路。

例如：

- 销售订单 -> 采购单
- 销售订单 -> 委外单
- 采购单 -> 入库单
- 委外单 -> 委外发料单
- 委外单 -> 委外回货单
- 入库单 -> 库存流水
- 出货单 -> 出库单
- 出库单 -> 库存流水
- 出货单 -> 对账单
- 对账单 -> 收款单
- 采购单 -> 付款单

这些关系用于追溯业务，不能随便配置成每个客户不同。

### 4. 审计逻辑

审计逻辑记录：

- 谁创建了订单
- 谁提交了订单
- 谁审核通过
- 谁驳回
- 谁修改数量
- 谁作废单据
- 谁确认入库
- 谁确认出库
- 谁改了客户资料
- 谁导出了财务报表
- 谁修改了权限配置

审计逻辑必须强制存在，不能给客户关闭。

### 5. 业务结果 / 派生状态

业务结果 / 派生状态不是最底层事实，而是根据业务事实计算或汇总出来的结果。

例如：

- 订单是否未出货 / 部分出货 / 全部出货
- 采购单是否未收货 / 部分收货 / 全部收货
- 订单是否未开票 / 部分开票 / 全部开票
- 订单是否未收款 / 部分收款 / 已收款
- 库存是否可用 / 被预留 / 短缺
- 应收是否正常 / 逾期
- 生产是否未开始 / 进行中 / 已完成

派生状态可以缓存到主单据上，方便查询和 UI 展示，但必须尽量能从底层事实重算。

例如：

```text
order.fulfillment_status = fully_shipped
```

应该能从：

```text
shipments
inventory_txns
order_lines
```

重新计算出来。

原则：

```text
动作产生事实，事实推导结果；结果可以缓存，但不能伪造事实。
```

---

## 六、状态机与工作流设计

ERP 不应该一开始做复杂 BPMN、可视化流程编排器、低代码工作流平台。

原因：

- 维护成本高
- 客户容易乱配
- 难以保证库存、财务、单据事实一致性
- 难升级
- 难排错
- 容易变成 ERP + 流程平台 + 表单平台 + 规则引擎

推荐：

- 单据状态机
- 审批记录
- 待办任务
- 操作日志
- 职责权限
- 流程节点开关
- 少量产品内置流程模式
- 关键动作幂等保护
- 终态保护
- 业务事实可追溯

### 1. 状态总分类

状态不要混成一个大 `status`。推荐按以下几类理解和实现：

| 分类 | 负责什么 | 典型例子 |
|---|---|---|
| Workflow 协同层 | 流程节点有没有处理、通过、拒绝、阻断 | `pending` / `in_progress` / `done` / `blocked` / `canceled` |
| 单据生命周期层 | 订单、采购单、入库单、出货单走到哪个业务阶段 | `draft` / `submitted` / `shipping_released` / `shipped` / `settled` |
| 业务事实层 | 库存、出货、财务、质检等真实动作有没有发生 | `inventory_txns.posted` / `shipment.shipped` / `invoice.issued` |
| 业务结果 / 派生状态 | 根据事实汇总出来的结果 | `partial_shipped` / `fully_shipped` / `paid` / `overdue` |
| 系统横切状态 | 幂等、同步、导入、任务、通知等系统状态 | `processing` / `succeeded` / `failed` / `synced` |

核心口诀：

```text
流程管协同，单据管阶段，事实管落账，结果靠计算，系统状态别混业务。
```

### 2. Workflow 协同层

Workflow 只回答：

```text
这个流程节点有没有处理？
有没有通过？
有没有拒绝？
有没有阻断？
下一步应该由谁处理？
```

常见状态：

| 状态 | 中文 | 说明 |
|---|---|---|
| `pending` | 待处理 | 节点还没人处理 |
| `in_progress` | 处理中 | 节点正在处理 |
| `done` | 已完成 / 已通过 | 当前流程节点通过 |
| `blocked` | 已阻断 | 不能继续，必须有 reason |
| `rejected` | 已拒绝 | 外部可以叫 rejected，内部通常归并为 blocked |
| `returned` | 已退回 | 退回修改，不等同于业务失败 |
| `canceled` | 已取消 | 流程取消 |

注意：

```text
workflow done != 已出库
workflow done != 已入库
workflow done != 已开票
workflow done != 已结算
```

### 3. 单据生命周期层

单据生命周期层回答：

```text
这个业务单据走到哪个阶段？
```

例如销售订单：

| 状态 | 中文 | 说明 |
|---|---|---|
| `draft` | 草稿 | 还未提交 |
| `submitted` | 已提交 | 已进入正式流程 |
| `approval_pending` | 待审批 | 等待审批 |
| `shipping_released` | 已放行 / 可发货 | 允许仓库进入发货阶段，但不是已出库 |
| `shipped` | 已出库 / 已发货 | 真实出货完成 |
| `settled` | 已结算 | 终态或接近终态 |
| `blocked` | 已阻断 | 业务被阻断，必须有原因 |
| `canceled` | 已取消 / 已作废 | 单据取消 |

`shipping_released` 必须特别注意：

```text
shipping_released = 已放行 / 可发货 / 待出库
shipping_released != 已出库
```

UI 不能把 `shipping_released` 显示成“已出库”。

### 4. 业务事实层

业务事实层回答：

```text
真实业务动作有没有发生？
有没有过账？
有没有冲正？
```

例如：

| 对象 | 状态 | 说明 |
|---|---|---|
| `inventory_txns` | `pending` / `posted` / `reversed` | 库存流水是否过账 / 冲正 |
| `shipments` | `pending` / `picked` / `shipped` / `canceled` | 出货动作是否完成 |
| `reservations` | `reserved` / `released` / `consumed` / `expired` | 库存预留状态 |
| `invoices` | `draft` / `issued` / `voided` / `reversed` | 发票状态 |
| `payments` | `pending` / `received` / `reversed` | 收付款状态 |
| `quality_inspections` | `pending` / `passed` / `failed` / `waived` | 质检状态 |

原则：

```text
只有真实发生，才写事实表。
没有真实发生，不要伪造库存、出货、财务事实。
```

### 5. 业务动作状态与业务结果状态

业务事实层内部可以再分成两类：

| 类型 | 含义 | 例子 |
|---|---|---|
| 业务动作状态 | 某个真实业务动作做没做、成功没成功、有没有冲正 | 出库确认、入库确认、库存过账、开票、收款 |
| 业务结果 / 派生状态 | 根据多个事实汇总出来的结果 | 全部出货、部分收款、已结清、库存短缺 |

关系：

```text
业务动作 -> 产生事实记录 -> 派生业务结果
```

不要反过来：

```text
直接把 order.status 改成 shipped
但不写 shipment / inventory_txns
```

正确做法：

```text
确认出库
-> 创建 / 确认 shipment
-> 写 inventory_txns posted
-> 根据事实计算 fulfillment_status
-> 必要时推进 order.status
```

### 6. 出货放行的特殊规则

出货放行是最容易混淆的地方。

Workflow 结果：

```text
done -> shipping_released
blocked / rejected -> blocked
```

含义：

```text
审批通过，只能表示允许发货。
审批拒绝或阻断，统一进入 blocked。
```

禁止行为：

- 不写 `inventory_txns`
- 不写 `shipments`
- 不写 `reservations`
- 不写 AR / invoice
- UI 文案不能写成“已出库”

原因：

```text
放行只是许可，不是真实出库。
真实出库必须由仓库确认出货 / 出库动作产生。
```

### 7. blocked / rejected 的 reason 规则

只要进入 `blocked`，必须有 `reason`。

无效 reason：

```text
""
" "
"    "
```

有效判断：

```go
strings.TrimSpace(reason) != ""
```

外部可以传 `rejected`、`denied`、`failed`，内部可以统一归一化成：

```text
blocked
```

但必须保留原因。

### 8. settled 终态保护

如果单据已经是：

```text
settled
```

后续重复 workflow 回调或重复请求，不能再触发特殊业务规则。

禁止：

- 再次放行
- 再次出库
- 再次写库存流水
- 再次生成发票 / 应收
- 再次触发自动结算

这叫终态保护。

### 9. 幂等规则

幂等不是 Workflow 专属。

凡是可能重复提交、重复回调、重复消费、重复点击的地方，都要考虑幂等。

需要幂等的场景：

- workflow 回调
- 确认入库
- 确认出库
- 写库存流水
- 生成 shipment
- 生成 invoice / AR / AP
- 收款 / 付款回调
- MQ 消费
- 定时任务
- Excel 导入
- 外部系统同步

最小原则：

```text
同一个业务动作 + 同一个业务对象 + 同一个幂等键，只能成功产生一次事实。
```

例如：

```text
workflow_callback_id
external_event_id
document_id + action
source_doc_id + source_line_id + action_type
```

### 10. 同名但非目标任务不触发

不能只靠任务名称判断是否触发业务规则。

错误做法：

```text
if task.name == "approve" { triggerRelease() }
```

正确做法应该同时判断：

```text
workflow_type
task_definition_key
node_id
business_type
business_id
target_action
```

原因：

```text
同一个流程里可能有多个 approve：老板审批、财务审批、仓库审批。
同名不代表同一个业务节点。
```

### 11. Canonical Status 与 Alias

系统内部只认稳定的 canonical status。

例如：

| 外部叫法 / 用户叫法 | 内部统一状态 | 中文 |
|---|---|---|
| `approved` / `passed` / `success` | `done` | 已完成 / 已通过 |
| `rejected` / `denied` / `failed` | `blocked` | 已阻断 |
| `released` / `ready_to_ship` | `shipping_released` | 已放行 / 可发货 |
| `outbound_done` / `dispatched` | `shipped` | 已出库 / 已发货 |

数据库只存内部 key，不存中文文案。

### 12. 状态机不是 Workflow 独有

凡是状态不能乱跳的地方，都应该有状态机。

| 模块 | 是否需要状态机 | 例子 |
|---|---|---|
| Workflow | 需要 | `pending -> done / blocked` |
| 销售订单 | 需要 | `draft -> submitted -> shipping_released -> shipped -> settled` |
| 采购单 | 需要 | `created -> ordered -> received -> settled` |
| 入库单 | 需要 | `pending -> confirmed -> posted` |
| 出库单 | 需要 | `pending -> picked -> shipped` |
| 库存流水 | 需要轻量状态机 | `pending -> posted -> reversed` |
| 发票 / 应收 | 需要 | `draft -> issued -> settled -> reversed` |
| 导入任务 | 需要 | `validating -> imported -> failed` |
| 外部同步 | 需要 | `pending -> synced -> failed` |

### 13. 工作流与业务服务的边界

工作流负责：

- 谁处理
- 谁审核
- 谁确认
- 谁收到待办
- 谁可以推动状态变化
- 节点是否通过、拒绝、阻断、退回

状态机负责：

- 当前对象处于什么状态
- 允许进入哪些状态
- 状态变化前要校验什么
- 状态变化后允许触发什么业务动作

业务服务负责：

- 真正执行业务动作
- 写业务事实
- 写库存流水
- 写财务记录
- 记录审计日志
- 保证幂等和事务一致性

边界：

```text
工作流只给许可；业务服务写事实；状态机控制跳转。
```

## 七、流程节点不要绑定岗位，要绑定职责 / 权限 / 能力

不要设计成：

- 物料齐套确认 -> PMC
- 采购审核 -> 采购主管
- 出货放行 -> 仓库主管
- 付款审核 -> 财务主管

应该设计成：

- 物料齐套确认 -> material_readiness.confirm
- 采购审核 -> purchase.approve
- 出货放行 -> shipment.release
- 付款审核 -> payment.approve

岗位 / 角色是客户自己的组织结构，不稳定。

职责 / 权限 / 能力点是系统内核，比较稳定。

例如：

客户 A 有 PMC：

- material_readiness.confirm -> PMC
- production_plan.confirm -> PMC

客户 B 没有 PMC：

- material_readiness.confirm -> 采购主管
- production_plan.confirm -> 跟单 / 老板

客户 C 是小公司：

- material_readiness.confirm -> 老板
- purchase.approve -> 老板
- payment.approve -> 老板

所以正确关系是：

- 流程节点 -> 需要某种职责 / 权限 / 能力
- 客户角色 -> 绑定这些职责 / 权限 / 能力
- 用户 -> 绑定角色

---

## 八、RBAC 可以同时承载 UI 权限和职责权限

RBAC 不应该只理解成：

- 角色 -> 菜单

应该理解成：

- 角色 -> 权限点
- 权限点 -> 菜单 / 按钮 / 接口 / 工作流节点 / 数据范围

权限类型至少包括：

### 1. 模块权限

控制客户是否启用某模块。

例如：

- 是否启用委外
- 是否启用质检
- 是否启用生产跟进
- 是否启用财务对账
- 是否启用多仓库

模块权限更适合由 Feature Flag 控制，不完全属于普通 RBAC。

### 2. 菜单权限

控制角色看不看得到菜单。

例如：

- menu.inventory.view
- menu.stock_in.view
- menu.finance.view

### 3. 页面 / 按钮权限

控制页面中能不能看到按钮。

例如：

- 是否显示确认入库按钮
- 是否显示审核采购按钮
- 是否显示作废按钮
- 是否显示导出按钮

### 4. 动作权限 / 职责权限

这是业务协同的核心。

例如：

- purchase.create
- purchase.approve
- stock_in.notice.create
- stock_in.quality_check
- stock_in.confirm
- stock_out.confirm
- shipment.release
- payment.approve
- report.view_all

### 5. 数据权限

控制用户能看到哪些数据。

例如：

- 只能看自己的订单
- 只能看本部门订单
- 只能看自己仓库的数据
- 可以看全部数据

### 6. 工作流处理权限

控制某个流程节点由谁处理。

例如：

- 入库质检节点派给拥有 stock_in.quality_check 的人
- 入库确认节点派给拥有 stock_in.confirm 的人
- 采购审核节点派给拥有 purchase.approve 的人

---

## 九、完整权限判断顺序

执行业务动作时，不能只看 UI 菜单权限。

推荐判断顺序：

1. 客户是否启用该模块
2. 用户是否拥有该动作 / 职责权限
3. 用户是否拥有该数据范围权限
4. 当前单据状态是否允许该动作
5. 业务规则是否允许该动作
6. 幂等键是否已经处理过
7. 执行业务动作并写业务事实
8. 记录审计日志

例如确认入库：

- stock_in 模块是否启用
- 用户是否有 stock_in.confirm
- 用户是否能操作该仓库
- 入库单是否处于待确认状态
- 入库单数据是否完整
- 幂等键是否已经处理过
- 确认后生成库存流水
- 记录谁确认了入库

---

## 十、Feature Flag + RBAC + Data Scope + State Machine + Idempotency + Audit Log

单独 RBAC 不够，推荐组合：

### Feature Flag

解决客户是否启用某模块。

例如：

- enable_outsource
- enable_quality_check
- enable_production_tracking
- enable_multi_warehouse
- enable_mobile_scan

### RBAC

解决角色拥有哪些权限 / 职责。

例如：

- stock_in.confirm
- purchase.approve
- payment.approve

### Data Scope

解决用户能看哪些数据。

例如：

- 本人
- 本部门
- 指定仓库
- 全部

### State Machine

解决当前单据状态能不能做某个动作。

例如：

- 草稿才能提交
- 已提交才能审核
- 待入库才能确认入库
- 已出货不能再随便修改
- 已作废不能再操作

### Idempotency

解决重复请求、重复回调、重复消费时不能重复产生业务事实的问题。

例如：

- 同一个 workflow 回调不能重复放行
- 同一个出库确认不能重复扣库存
- 同一个入库确认不能重复增加库存
- 同一个发票生成动作不能重复生成发票
- 同一个收款回调不能重复核销应收

幂等建议由 usecase + repository + 数据库唯一约束共同保证。

### Audit Log

记录谁在什么时间做了什么。

审计日志要覆盖：

- 业务动作
- 权限变更
- 配置变更
- 状态变更
- 高危操作
- 导出操作
- 冲正 / 作废动作

---

## 十一、模块差异处理：有委外 / 无委外

有些客户有委外，有些客户没有，这不应该拆成两套系统。

应该设计为：

- 委外是可选模块
- 核心订单 / 库存 / 财务统一
- 菜单、权限、流程节点、报表根据客户配置启用或隐藏

有委外客户：

- enable_outsource = true
- 显示委外加工菜单
- 启用委外加工单
- 启用委外发料
- 启用委外回货
- 启用委外结算
- 初始化委外权限点
- 工作流出现委外节点

无委外客户：

- enable_outsource = false
- 隐藏委外菜单
- 不生成委外待办
- 禁止访问委外接口
- 不初始化委外权限
- 流程跳过委外节点
- 报表不显示委外统计

注意：

关闭委外只是隐藏 / 禁用模块，不代表修改核心库存事实。

委外模块相关表可以独立：

- outsource_orders
- outsource_material_issues
- outsource_receipts
- outsource_progress
- outsource_settlements

库存事实层仍然统一：

- 采购入库
- 委外发料
- 委外回货
- 销售出库
- 盘点调整

---

## 十二、菜单设计原则

菜单最好不要用 “/” 把多个流程环节硬绑在一起。

不推荐：

- 入库通知/检验/入库
- 待出货/出货放行
- 加工合同/委外下单
- 订单/款式立项

推荐：

- 入库管理
- 出货管理
- 委外加工
- 销售订单
- 款式立项
- 采购管理
- 库存管理
- BOM 管理

原因：

- 有些客户没有质检
- 有些客户没有委外
- 有些客户不需要出货放行
- 有些客户角色拆分不同
- 用 “/” 会把多个环节绑定成一个菜单，后期权限、模块开关、移动端入口都不好处理

主菜单应该表达：

- 业务域
- 业务对象
- 稳定模块

具体流程环节放在：

- 二级菜单
- Tab
- 按钮
- 待办
- 流程节点
- 权限点

例如：

入库管理下面可以按配置显示：

- 入库通知
- 质检
- 入库确认
- 入库单
- 入库记录

如果客户没有质检，只隐藏质检 Tab / 节点 / 权限即可。

---

## 十三、UI 层配置原则

UI 层不是全部死控，也不是全部自由。

应该是：

- 主结构受控
- 模块入口受控
- 菜单显示按权限配置
- 按钮跟随动作权限
- 字段 / 列 / 打印模板更灵活

### 受控 UI

- 主菜单结构
- 模块入口
- 移动端主入口
- 核心页面结构
- 核心业务动作按钮
- 与模块开关强相关的入口

### 可灵活 UI

- Logo
- 公司名称
- 打印模板
- 列表字段显示
- 列顺序
- 报表字段
- 导出格式
- 非核心字段显示 / 隐藏
- 备注模板

注意：

前端隐藏菜单只是用户体验，后端必须校验模块、权限、数据范围、状态机。

状态文案要和内部 key 分离：

| 内部 key | 推荐中文 | 禁止误写 |
|---|---|---|
| `shipping_released` | 已放行 / 可发货 / 待出库 | 已出库 |
| `shipped` | 已出库 / 已发货 | 已放行 |
| `blocked` | 已阻断 | 已失败但无原因 |
| `settled` | 已结算 | 可继续触发特殊规则 |

UI 可以配置显示文案，但不能改变状态语义。

---

## 十四、客户角色差异处理

不同客户角色数量不同是正常的。

小公司可能只有：

- 老板
- 业务员
- 仓库
- 财务
- 管理员

大公司可能有：

- 老板
- 总经理
- 业务主管
- 业务员
- 采购主管
- 采购员
- 仓库主管
- 仓管员
- 质检员
- 财务主管
- 会计
- 出纳
- 生产跟单
- PMC
- 系统管理员

系统不应该绑定固定岗位，而应该让不同客户通过 RBAC 组合。

推荐内置角色模板：

- small-company-role-template
- medium-factory-role-template
- large-factory-role-template
- trade-company-role-template
- factory-with-outsource-template
- factory-without-outsource-template

交付时选择模板，再按客户实际微调。

---

## 十五、移动端权限

移动端不需要给所有角色完整能力。

适合移动端的角色：

- 老板：看报表、审批、异常提醒
- 业务员：查看客户、订单进度、报价状态
- 仓库：扫码入库、扫码出货、库存查询、盘点
- 质检：质检确认、拍照上传、异常记录
- 生产 / 跟单：更新生产节点、查看进度
- 财务：简单审批、查看待处理收付款

移动端入口也应该由权限控制：

- mobile.dashboard
- mobile.approval
- mobile.stock_scan
- mobile.quality_check
- mobile.production_update
- mobile.inventory_query

没有相关职责的角色不显示移动端入口。

---

## 十六、打印模板与 Logo

公司名称、Logo、打印模板属于低风险定制，可以支持客户差异。

但不要让客户无限自由拖拽整个打印系统。

推荐：

- 系统提供标准模板
- 支持客户专属模板
- 支持模板参数配置
- 支持 Logo、抬头、页脚、签字栏、字段显示
- 深度定制由我方实施
- 客户管理员可以选择模板和调整低风险参数

Logo 不应该固定图片大小，而是：

- 固定展示区域
- 图片等比例缩放
- 不裁剪
- 不拉伸
- 通过 max-width / max-height / object-fit: contain 处理

打印模板的最佳边界：

- 核心数据结构统一
- 模板展示可以不同
- 客户看起来可以完全不同
- 底层业务数据必须一致

例如：

quotation_print_view 统一输出：

- company
- customer
- quotation_no
- quotation_date
- items
- total_amount
- remark
- signatures

客户 A / B / C 可以使用不同 HTML / PDF 模板渲染，但数据来源统一。

---

## 十七、客户差异文档

每个客户差异都必须有文档记录。

推荐目录：

customers/customer-a/
  README.md
  company-settings.yaml
  feature-flags.yaml
  roles.md
  permissions.md
  dictionaries.md
  print-templates.md
  import-mappers.md
  known-differences.md
  deployment-notes.md

known-differences.md 应记录：

- 差异名称
- 差异类型
- 涉及模块
- 处理方式
- 是否影响核心业务
- 是否客户专属
- 是否可产品化
- 对应配置位置
- 对应模板位置
- 对应代码位置
- 上线日期
- 后续维护注意事项

差异类型可以分：

- 公司信息差异
- 打印模板差异
- 角色权限差异
- 字典差异
- 模块开关差异
- 导入导出差异
- 报表展示差异
- 流程节点处理人差异
- 客户专属扩展

重点：

每个差异都要有归类，不要散落在代码里。

---

## 十八、客户交付包

推荐将每个客户做成交付包，而不是代码分叉。

customer-a-package/
  company.yaml
  feature-flags.yaml
  role-template.yaml
  permissions.yaml
  dictionaries.yaml
  print-templates/
  import-mappers/
  init-data/
  delivery-notes.md

交付包记录：

- 公司信息
- 启用模块
- 角色模板
- 权限分配
- 字典项
- 打印模板
- 导入模板
- 初始化数据
- 客户差异说明

这样客户看起来是定制系统，但底层仍然是一套产品。

---

## 十九、客户自助配置的保护机制

只要开放客户自助配置，就必须有保护机制：

1. 配置变更日志
   - 谁改了什么
   - 什么时候改
   - 改前是什么
   - 改后是什么

2. 配置版本
   - 支持回滚

3. 配置预览
   - 菜单预览
   - 权限预览
   - 打印模板预览

4. 高危配置二次确认
   - 作废权限
   - 财务审核权限
   - 库存调整权限
   - 权限管理权限

5. 默认角色模板
   - 不让客户从零乱配

6. 权限互斥规则
   - 避免一个普通角色同时拥有过多高危权限

7. 模块依赖校验
   - 没启用委外，不能分配 outsource.* 权限

8. 后端强校验
   - 不能只靠前端隐藏按钮

9. 审计日志强制开启
   - 配置变更也要记录审计

---

## 二十、推荐后台身份

### 1. 平台 / 实施管理员

我方使用。

能力：

- 配置客户交付包
- 启用 / 关闭模块
- 初始化角色权限
- 导入初始化数据
- 维护打印模板
- 处理客户专属配置
- 查看客户配置差异
- 执行升级迁移

不要给普通客户。

### 2. 客户超级管理员

客户公司负责人使用。

能力：

- 管理用户
- 管理角色
- 分配安全范围内的权限
- 维护字典
- 调整审批人
- 配置通知人
- 维护公司基础信息
- 查看操作日志
- 配置部分打印参数

不能改核心规则。

### 3. 客户业务管理员

客户内部部门负责人使用。

能力：

- 维护本模块基础数据
- 管理本部门人员
- 查看本模块日志
- 调整本模块常用配置

---

## 二十一、实现建议

### 1. 权限模型

建议实体：

- User
- Role
- Permission
- Menu
- FeatureFlag
- DataScope
- WorkflowNode
- AuditLog
- CustomerConfig
- CustomerPackage

Role 绑定 Permission。

Permission 分类型：

- menu
- page
- action
- responsibility
- data_scope
- mobile_entry

### 2. 权限命名建议

菜单权限：

- menu.inventory.view
- menu.stock_in.view
- menu.finance.view

动作 / 职责权限：

- purchase.create
- purchase.approve
- purchase.void
- stock_in.notice.create
- stock_in.quality_check
- stock_in.confirm
- stock_in.void
- stock_in.export
- stock_out.confirm
- shipment.release
- payment.approve
- receivable.write_off
- report.view_all

移动端权限：

- mobile.dashboard
- mobile.approval
- mobile.stock_scan
- mobile.quality_check
- mobile.production_update

数据权限：

- data_scope.own
- data_scope.department
- data_scope.assigned_warehouse
- data_scope.all

### 3. 模块开关

Feature Flags 示例：

- enable_outsource
- enable_quality_check
- enable_production_tracking
- enable_multi_warehouse
- enable_mobile_scan
- enable_finance_reconcile

模块关闭时要联动：

- 菜单隐藏
- 接口拒绝
- 权限不可分配
- 待办不生成
- 流程节点跳过
- 报表字段隐藏
- 移动端入口隐藏

### 4. 状态机

状态机应该产品内置，不让客户完全自由拖拽。

可以支持：

- 模式选择
- 节点启用 / 禁用
- 节点处理职责配置
- 节点自动跳过
- 节点合并到某角色处理

但核心业务事实不能跳过。

### 5. 状态与工作流实现建议

推荐目录结构：

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

职责归属：

| 实现层 | 负责什么 | 不应该做什么 |
|---|---|---|
| UI 层 | 中文文案、按钮显示、字段展示 | 不决定状态能不能跳 |
| service/API 层 | 参数接收、权限入口、调用 usecase | 不绕过 usecase 直接改状态 |
| usecase/application 层 | 编排业务动作、处理幂等、调用状态机 | 不随手写事实表 |
| biz/domain 层 | 定义状态、状态机、业务不变量 | 不关心数据库细节 |
| data/repository 层 | 持久化、唯一约束、事务写入 | 不决定业务语义 |
| DB 层 | 存 canonical status、唯一索引、必要约束 | 不存中文文案做业务判断 |

数据库字段建议：

```text
workflow_tasks.status
workflow_tasks.decision
workflow_tasks.reason
workflow_tasks.task_definition_key
workflow_tasks.node_id

sales_orders.status
sales_orders.approval_status
sales_orders.release_status
sales_orders.fulfillment_status
sales_orders.invoice_status
sales_orders.payment_status
sales_orders.settlement_status

shipments.status
inventory_txns.status
invoices.status
payments.status
idempotency_records.status
```

原则：

```text
状态定义和跳转规则放 domain / biz；
业务编排放 usecase；
落库放 repository；
中文文案放 UI / 配置表。
```

### 6. 审计

所有关键动作必须记录：

- 创建
- 修改
- 删除 / 作废
- 提交
- 审核
- 驳回
- 确认入库
- 确认出库
- 库存调整
- 财务收付款
- 权限变更
- 配置变更
- 导出报表

---

## 二十二、菜单命名建议

避免把多个流程阶段写进一级菜单。

推荐菜单：

基础资料：
- 往来单位
- 产品档案
- BOM 管理

销售链路：
- 款式立项
- 销售订单
- 报价管理

采购 / 供应：
- 采购管理
- 委外加工

仓储：
- 入库管理
- 库存管理
- 出货管理
- 出库管理
- 盘点管理

财务：
- 对账管理
- 收款管理
- 付款管理

系统：
- 用户管理
- 角色权限
- 字典配置
- 公司配置
- 打印模板
- 操作日志

具体流程环节不要塞到主菜单名里，而放在页面内部：

入库管理：
- 入库通知
- 质检
- 入库确认
- 入库单

出货管理：
- 待出货
- 出货放行
- 出货单

委外加工：
- 委外单
- 委外发料
- 委外回货
- 委外结算

---

## 二十三、最终落地路线

### 第一阶段：我方配置为主，客户少量维护

优先做：

- 公司信息配置
- 用户 / 角色 / RBAC
- 菜单权限
- 动作权限
- 基础字典
- Logo
- 单号规则
- 打印模板选择
- 模块开关由我方控制

### 第二阶段：客户管理员配置更多日常项

开放：

- 角色权限分配
- 审批人设置
- 移动端入口权限
- 列表字段显示
- 打印模板参数
- 通知规则
- 基础资料导入

同时加入：

- 配置日志
- 配置回滚
- 权限预览
- 高危配置确认

### 第三阶段：配置模板产品化

沉淀：

- 小公司角色模板
- 中型工厂角色模板
- 贸易型客户模板
- 有委外模板
- 无委外模板
- 有质检模板
- 无质检模板
- 标准打印模板
- 客户专属模板管理

以后交付新客户时：

- 选择模板
- 微调配置
- 生成客户交付包
- 记录差异文档

---

## 二十四、测试与验收清单

后续让开发或其他 AI 分析时，可以按这份清单检查：

### 1. 配置边界

- 客户不能改库存扣减规则
- 客户不能改入库增加库存规则
- 客户不能改财务核销规则
- 客户不能关闭审计日志
- 客户不能自由拖拽核心状态机
- 客户不能删除业务事实和库存流水

### 2. 权限边界

- 后端是否校验 Feature Flag
- 后端是否校验 RBAC 动作权限
- 后端是否校验 Data Scope
- 后端是否校验状态机
- 高危权限是否有二次确认或互斥规则
- 前端隐藏按钮是否只是体验，不是安全边界

### 3. Workflow 边界

- Workflow 是否只负责协同和许可
- Workflow 是否没有直接写库存、出货、财务事实
- 节点是否绑定职责 / 权限，而不是绑定固定岗位
- 同名但非目标任务是否不会误触发
- `blocked` 是否必须有非空 reason
- `settled` 是否有终态保护

### 4. 状态机边界

- 状态是否按 Workflow、单据生命周期、业务事实、派生结果、系统横切状态区分
- 数据库存的是不是 canonical status
- 中文文案是否没有参与业务判断
- `shipping_released` 是否没有被显示为“已出库”
- `shipped` 是否由真实出货事实推动

### 5. 幂等边界

- Workflow 回调是否幂等
- 入库确认是否幂等
- 出库确认是否幂等
- 库存流水是否有唯一约束或幂等键
- 发票 / 应收 / 应付生成是否幂等
- 收付款回调是否幂等
- MQ / 定时任务 / 导入是否幂等

### 6. 业务事实边界

- 确认入库是否生成库存流水
- 确认出库是否生成库存流水
- 放行是否没有提前写库存流水
- 放行是否没有提前写 shipment
- 放行是否没有提前写 invoice / AR
- 作废或回滚是否通过冲正 / 反过账，而不是直接删除事实

---

## 二十五、最终结论

本 ERP 应该走：

通用产品内核 + 受控客户差异 + 客户安全自助配置 + 差异文档化 + 配置包交付

不要走：

低代码平台、BPMN 自由编排、客户随意定义业务对象、客户随意改库存财务规则、每个客户一套代码

最重要的边界：

- 业务事实固定
- 财务 / 库存 / 审计固定
- 状态机受控
- 模块菜单受控
- 权限点产品定义
- 角色分配客户灵活
- UI 展示适度灵活
- 打印模板可客户专属
- 客户配置是我方配置能力的安全子集
- 所有客户差异必须记录文档
