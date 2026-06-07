Doc Type / 文档类型: Business Records Cutover Plan / business_records 切换计划
Status / 状态: Draft Plan / 草案计划
Runtime Implemented / 运行时已实现: No / 否
Ent Schema Implemented / Ent Schema 已实现: No / 否
Migration Implemented / Migration 已实现: No / 否
Current Implementation Source of Truth / 当前实现真源: No / 否

# 业务记录切换计划 / business_records Cutover Plan

本计划只设计 `business_records` 兼容层的分阶段切换，不执行切换、迁移、删除或双写。

## Stage 0: 当前状态

当前状态：

- `business_records` 继续存在。
- V1 正式模型已具备 schema、migration、repo/usecase、API/RBAC 和 UI。
- `business_records` 仍可能承载旧入口、demo、source snapshot、seed、debug 和旧测试。
- V1 页面已存在，桌面正式菜单、dashboard、前后端菜单权限已切到 `客户档案`、`供应商档案`、`销售订单`。
- 旧 `partners / project-orders` 路径不再承载旧通用业务页，访问时只重定向到正式 V1 入口；其他旧模块和旧数据迁移 / 归档仍未处理。

保持边界：

- 不删除 `business_records`。
- 不改 runtime。
- 不做数据迁移。
- 不从旧记录生成库存、出货或财务事实。

退出 Stage 0 的条件：

- 引用审计文档完成。
- 风险登记完成。
- data map draft 完成。
- 下一轮明确选择菜单入口评审或 import dry-run。

## Stage 1: 并行可见但禁止双写

目标：

- 新 V1 页面作为正式客户、供应商、联系人和销售订单入口。
- `business_records` 相关重叠入口不得继续新增核心功能。
- 不做自动迁移。
- 不删除旧数据。

执行原则：

| 项目 | 规则 |
|---|---|
| 正式写入 | V1 MasterData / SalesOrder usecase |
| 旧入口 | `partners / project-orders` 不作为旧入口保留，旧路径只重定向到正式 V1；其他旧入口按各自领域后续评审 |
| 数据关系 | 旧记录只作为 source snapshot，不作为 V1 父表 |
| 禁止 | 同一业务动作同时写 V1 和 `business_records` |

进入下一阶段条件：

- 继续确认 mobile task、debug 和历史打印是否依赖旧入口。
- 评审旧数据迁移、归档、删除或只读归档是否需要客户可见承诺。
- 补客户培训说明和客户菜单配置方案。

## Stage 2: 只读 / demo 化

目标：

- `partners / project-orders` 旧路径已退出旧通用业务页并重定向到正式 V1；其他重叠领域按后续评审转为只读、demo 或直接退出。
- seed / demo 数据明确标记。
- 用户操作引导到 V1 页面。

优先模块：

1. `partners` -> `customers / suppliers / contacts`。
2. `project-orders` -> `sales_orders / sales_order_items`。
3. `products` -> existing `products` 正式入口或产品资料导入草案。

需要单独完成：

- UI 只读策略。
- seedData 菜单入口策略。
- 产品内帮助入口口径；当前不恢复已下线 docs registry。
- 前端 L1 / route / permission 回归。

禁止：

- 为了只读化删除旧数据。
- 为了提示用户而修改 schema。
- 用前端隐藏替代后端权限或写入限制。

## Stage 3: 数据映射 / dry-run

目标：

- 只做 dry-run mapping。
- 输出可迁移、不可迁移、需人工确认清单。
- 不写正式数据。

dry-run 输出：

| 输出 | 内容 |
|---|---|
| 可迁移清单 | 唯一匹配且字段完整的候选记录 |
| 不可迁移清单 | demo/debug、缺关键字段、无唯一匹配、违反边界的记录 |
| 人工确认清单 | 同名主体、多角色主体、联系人归属、单位 / 产品不确定等 |
| 禁止自动生成清单 | shipment、inventory、finance facts 和 draft-only 对象 |

必须保留：

- source record id。
- source module key。
- source document no。
- 字段映射理由。
- 跳过理由。
- unresolved reason。

## Stage 4: 受控迁移

目标：

- 只有人工确认后才允许执行。
- 必须有备份、回滚、校验。
- 必须禁止双写。

前置条件：

1. dry-run 报告已被人工确认。
2. 目标模型 usecase、API、权限和测试已稳定。
3. 旧入口已重定向、只读或冻结写入。
4. 备份和恢复方案已演练。
5. 幂等键和重复导入策略明确。
6. 迁移后校验口径明确。

迁移校验：

- 记录数对账。
- 唯一键冲突清单。
- 跳过记录清单。
- 联系人 owner 校验。
- 订单行数量 / 单位 / 金额校验。
- 正式模型状态没有伪造出货、库存和财务事实。

## 阶段 5：废弃 / 归档 / Stage 5: deprecated / archive

目标：

- 只在引用清零、数据完成迁移、客户确认后执行。
- 保留历史查询或归档方案。
- 不让旧入口继续被误认为正式入口。

deprecated 条件：

- UI 写入口已经关闭。
- seedData / Dashboard / mobile / tests 不再依赖旧写入。
- debug seed 和 QA 已有替代或明确保留 demo 边界。
- 历史数据归档查看可用。
- 客户确认不再使用旧入口新增正式记录。

archive / delete 条件：

- 必须另开 migration / cleanup 实现任务。
- 必须检查所有 runtime 引用。
- 必须提供备份、回滚和 smoke / regression。
- 必须确认不破坏历史审计、打印、帮助和 QA。

## 下一步建议

| 下一步 | 为什么 |
|---|---|
| yoyoosun customer import dry-run / strategy | 先基于本 data map 做 dry-run/import 设计，分类 永绅 yoyoosun 样本字段 |
| business_records migration / archive decision | 正式菜单、Dashboard 和菜单权限已指向 V1 入口，`partners / project-orders` 旧路径已重定向到 V1；下一步应单独评审旧数据迁移、归档或删除边界 |
| customer menu config review | 在正式入口基础上继续评审客户菜单配置，不把客户菜单开关当 RBAC 或事实规则 |
