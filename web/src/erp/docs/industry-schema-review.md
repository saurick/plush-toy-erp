# 行业专表 Ent Schema 评审

> 结论：当前不应马上拆行业专表，也不应生成 migration。`business_records + workflow_tasks + workflow_task_events + workflow_business_states` 仍足以承接 v1 闭环验证。下一轮如果要推进 schema，应先定义字段真源和一致性策略，再优先评审库存流水/余额和 AR/AP 财务明细。

## 1. 当前通用表模式

当前业务保存层主要使用：

- `business_records`
- `business_record_items`
- `business_record_events`
- `workflow_tasks`
- `workflow_task_events`
- `workflow_business_states`

优点：

- 快速承接多模块。
- 字段变化成本低。
- 适合 v1 验证。
- 不需要频繁 migration。

缺点：

- 类型约束弱。
- 复杂查询难。
- 金额、数量、库存、财务一致性难。
- 后续报表和性能会受影响。
- 很多 payload 字段难以建立强约束。

## 2. 行业专表候选

| 范围      | 候选表                                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------------------------ |
| 订单侧    | `project_order` / `sales_order`、`order_item`、`order_change`                                                      |
| 工程/BOM  | `product_style`、`material_bom`、`material_requirement`                                                            |
| 采购侧    | `purchase_order`、`purchase_order_item`、`supplier_delivery`                                                       |
| 委外侧    | `outsource_order`、`outsource_issue`、`outsource_return`、`outsource_rework`                                       |
| 生产侧    | `production_order`、`production_task`、`production_progress`、`rework_order`                                       |
| 仓库侧    | `inbound_order`、`outbound_order`、`inventory_txn`、`inventory_balance`、`inventory_adjustment`、`inventory_check` |
| 品质侧    | `quality_inspection`、`quality_inspection_item`、`defect_record`                                                   |
| 财务侧    | `ar_receivable`、`ar_invoice`、`ap_payable`、`ap_reconciliation`、`payment_record`、`receipt_record`               |
| 通知/审计 | `notification`、`notification_recipient`、`audit_log`                                                              |

## 3. 拆表优先级建议

| 优先级                  | 范围                                                                                                   | 结论                                         |
| ----------------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------- |
| P0 暂不拆               | 订单审批流程、帮助中心、调试页、催办 v1、状态字典、角色权限矩阵                                        | 当前用通用表更稳，拆表收益不足               |
| P1 优先评审但不马上落表 | `inventory_txn`、`inventory_balance`、`ar_receivable`、`ar_invoice`、`ap_payable`、`ap_reconciliation` | 最容易成为强一致和报表瓶颈，应先评审字段真源 |
| P2 后续评审             | `purchase_order`、`outsource_order`、`production_order`、`quality_inspection`                          | 业务字段仍有变化，等 P1 口径稳定后推进       |
| P3 更后                 | `notification`、`notification_recipient`、`audit_log`、`cost_snapshot`、`margin_analysis`              | 当前 v1 不需要立即落表                       |

## 4. 什么时候必须拆表

满足任意条件时，应考虑拆表：

- 需要强一致库存余额。
- 需要库存流水可追溯。
- 需要财务金额强约束。
- 需要唯一发票号。
- 需要付款/收款核销。
- 需要跨单据复杂查询。
- 需要高频报表。
- 需要索引优化。
- 需要并发写入控制。
- 需要外部系统集成。

## 5. 什么时候继续使用 business_records

适合继续使用：

- 业务字段仍不稳定。
- 只是流程验证。
- 只是帮助中心/验收调试。
- 只是任务提醒。
- 没有强一致计算。
- 不做复杂报表。
- 不做外部系统集成。

边界：`business_records` 可以继续承接“单据快照和流程验证”，但不应长期承担库存余额、财务核销、唯一票号、成本毛利等强约束事实。

## 6. 分阶段迁移路线

| 阶段                                  | 目标                                                                                                   | 不做什么                       |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------ |
| Phase 0：当前状态                     | `business_records + workflow_tasks` 承接 v1 闭环                                                       | 不拆行业专表                   |
| Phase 1：定义真源字段                 | 明确订单、库存、财务、品质字段口径，输出字段草案和一致性策略                                           | 不立即 migration               |
| Phase 2：只拆库存流水和财务明细       | 评审 `inventory_txn / inventory_balance / ar_receivable / ar_invoice / ap_payable / ap_reconciliation` | 不一次性拆采购、委外、生产全套 |
| Phase 3：拆采购、委外、生产、品质专表 | 评审 `purchase_order / outsource_order / production_order / quality_inspection`                        | 不改回旧项目模型               |
| Phase 4：迁移 workflow source 关联    | `workflow_tasks.source_type/source_id` 指向专表，保留 `business_records` 兼容层或视图层                | 不直接删除旧路径               |

## 7. 拆表后的数据一致性策略

| 主题     | 策略                                                                       |
| -------- | -------------------------------------------------------------------------- |
| 唯一真源 | 专表落地后，库存和财务事实以专表为真源，`business_records` 只保留兼容快照  |
| 双写阶段 | 先在后端 usecase 内双写或只读校验，不由前端分别写两套事实                  |
| 幂等     | 使用稳定业务 key、来源单据和任务组保证重复点击不会重复写事实               |
| 事务     | 同一业务动作内写专表、任务、事件和业务状态，避免半成功                     |
| 回补     | 老数据按 `source_type/source_id/source_no` 回补，不能伪造真源不存在的值    |
| 对账     | 每个阶段提供数据校验脚本，比较通用记录快照和专表事实                       |
| 读路径   | 报表和详情逐步切到专表，列表可以先保留兼容读                               |
| 审计     | 关键事实变化写业务事件和任务事件，保留 actor、role、reason 和 payload 摘要 |

## 8. 迁移风险

| 风险                                               | 影响                                                     |
| -------------------------------------------------- | -------------------------------------------------------- |
| 现有前端业务模块强依赖 `business_records`          | 详情、列表、保存、打印和调试页都要兼容                   |
| 现有 workflow `source_type/source_id` 依赖通用记录 | 任务详情加载和移动端跳转要改造                           |
| 测试数据迁移                                       | 旧样本如果没有专表字段，会出现缺值                       |
| 文档入口同步                                       | 帮助中心、验收页和调试页需要同时更新                     |
| Dashboard 统计改造                                 | 当前按任务和业务状态聚合，专表后要区分事实统计和任务统计 |
| 移动端任务详情加载改造                             | 任务来源可能从 `business_records` 变成专表               |
| 旧记录兼容                                         | 历史单据不能因为没有专表行而不可查                       |

## 9. 回滚策略

- 保留 `business_records` 兼容写入，直到专表读写稳定。
- 专表先双写或只读验证，不直接切断旧路径。
- `workflow_tasks.source_type/source_id` 保持旧路径直到迁移完成。
- 每个阶段都有测试和回滚点。
- 如果专表规则异常，关闭新写入入口，恢复读取 `business_records` 快照。
- 不在同一阶段同时改 schema、workflow 编排、Dashboard、移动端详情和打印取值。

## 10. 决策矩阵

| 方案               | 优点                   | 缺点                                       | 结论       |
| ------------------ | ---------------------- | ------------------------------------------ | ---------- |
| 继续完全通用表     | 迁移风险最低，适合 v1  | 强约束、报表和并发能力不足                 | 短期可维持 |
| 立即拆所有行业专表 | 类型约束最强           | migration 风险高，字段未稳定，前端改动大   | 不建议     |
| 先评审 P1 专表草案 | 聚焦库存和财务核心瓶颈 | 需要字段真源和一致性设计                   | 推荐       |
| 先拆通知表         | 通知中心更完整         | 当前 v1 可用任务事件承接，收益低于库存财务 | 暂缓       |

## 11. 推荐结论

本轮不改 Ent schema，不生成 migration。下一步只建议做设计评审：

1. 先设计 `inventory_txn / inventory_balance` 草案，但不 migration。
2. 再设计 `ar_receivable / ar_invoice / ap_payable / ap_reconciliation` 草案，但不 migration。
3. 同步定义业务字段真源、旧数据回补策略和 workflow source 迁移策略。
4. 等后端 workflow usecase 至少试迁一条规则后，再进入专表落地更稳。

当前仍继续使用 `business_records` 的边界是：只承接 v1 主干闭环、单据快照、任务提醒、帮助中心和调试验收，不承诺真实库存余额、财务核销、唯一发票号和完整报表性能。

## 12. 本轮明确不做

- 不新增 `production_order / purchase_order / outsource_order / inventory_txn / inventory_balance / ar_receivable / ar_invoice / ap_payable / settlement` 等表。
- 不生成 migration。
- 不跑 `make data`。
- 不跑 `make migrate_status`。
- 不删除 `business_records / workflow_tasks` 现有路径。
- 不做通知中心落表。
- 不做真实库存余额。
- 不做财务总账、凭证、纳税申报、固定资产、低值易耗品。
