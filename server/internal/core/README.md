# 产品规则内核 / Product Core Rules

`server/internal/core` 只承载稳定、纯粹、可复用、无 IO 的产品领域规则。它不是第二套 `biz`，不是第二套 `data`，也不是 JSON-RPC、HTTP 或部署入口。

当前状态：已建立边界文档、import guard、第一批低风险值对象 / 领域错误、当前出货三态状态机、当前库存批次 `ACTIVE / HOLD / REJECTED / DISABLED` 状态机、采购入库 / 采购退货 / 采购入库调整单 `DRAFT / POSTED / CANCELLED` 过账单据状态机、来料质检 `DRAFT / SUBMITTED / PASSED / REJECTED / CANCELLED` 状态机、销售订单 `draft / submitted / active / closed / canceled` 生命周期状态机，以及当前库存可用量纯计算：`available = balance - active_reserved`。已替换 `biz/data` 中明确重复的纯校验、出货状态判断、库存批次状态迁移判断、采购过账单据重复动作判断、质检状态判断、销售订单生命周期判断和库存预留可用量公式；其他状态机、计算器或应用编排不迁入；不接 runtime，不改 schema / migration，不改变 JSON-RPC / 前端主路径。

## 允许放入

适合进入 `core` 的代码必须能用纯输入输出测试，并且不需要数据库、网络、文件、配置读取或登录态。

| 类型 | 示例 | 约束 |
| --- | --- | --- |
| 值对象 | 已有 `Quantity`、`Money`、`IdempotencyKey`；后续候选 `Percentage`、`SourceRef` | 只做基础校验和规范化 |
| 状态机 | 已有 `ShipmentStatus`、`InventoryLotStatus`、`PurchaseReceiptStatus`、`PurchaseReturnStatus`、`PurchaseReceiptAdjustmentStatus`、`QualityInspectionStatus`、`SalesOrderLifecycleStatus`；后续候选 `BOMStatus`、`FinanceFactStatus` | 只判断状态迁移是否合法 |
| 业务不变量 | 防负库存、BOM item 数量、出货数量、财务事实重复来源 | 只判断规则，不加载或保存数据 |
| 纯计算器 | 已有库存可用量；后续候选 BOM 展开需求、收货状态、结算状态 | 公式只能有一处真源 |
| 领域错误 | 已有 `ErrInvalidQuantity`、`ErrInvalidMoney`、`ErrInvalidIdempotencyKey`；后续候选 `ErrInvalidStatusTransition`、`ErrInsufficientInventory` | 表达领域规则失败，不负责 transport 映射 |
| 领域事件定义 | `ShipmentShipped`、`InventoryReserved` | 只定义结构，不发布、不持久化 |
| Policy 类型 | 超收、超发、负库存、自动归档旧 BOM | 由 `biz` 构造 policy，`core` 只消费参数 |

## 禁止放入

`core` 中禁止出现下列职责：

- JSON-RPC / HTTP / gRPC handler、Kratos service、transport DTO。
- Ent query、SQL、repository 实现、数据库事务、行锁、advisory lock。
- 应用编排 usecase，例如 `CreateShipment`、`PostPurchaseReceipt`、`ApplyImport`。
- 权限 session 解析、JWT / header 解析、管理员上下文读取。
- 配置文件读取、环境变量读取、客户配置 loader。
- 文件、网络、短信、邮件、webhook、部署、备份恢复、导入脚本。
- `yoyoosun` 或任一客户专属字段映射、菜单配置、打印样式或导入规则。
- 前端页面 DTO、Ant Design 表单结构、菜单渲染配置。

## 依赖方向

允许的主方向：

```text
service -> biz -> core
biz -> repository interface
data -> repository implementation
data -> ent / sql
```

禁止的反向依赖：

```text
core -> biz
core -> data
core -> service
core -> server
core -> ent / sql
core -> HTTP / JSON-RPC / Kratos transport
core -> config / env / filesystem
```

`service` 不应绕过 `biz` 直接调用 `core` 后再写 `data`。权限、事务、审计、幂等持久化和 repository 调用仍由 `biz/data` 主路径负责。

## 迁移顺序

后续如果确实要继续迁入规则，按低风险顺序推进：

1. 继续补充已被 `biz` 实际消费的值对象和领域错误。
2. 已稳定且多处复用的状态机。
3. 库存、BOM、收货、结算等纯计算器。
4. 由 `biz` 构造 policy 后传入的复杂策略。

每次迁移必须同时删除 `biz` 中已被替代的重复规则，避免形成双真源。没有被 `biz` 或多个入口实际消费的抽象，不应提前放进 `core`。

## 测试与守卫

涉及本目录的改动至少执行：

```bash
cd /Users/simon/projects/plush-toy-erp
node --test scripts/qa/core-boundary.test.mjs

cd /Users/simon/projects/plush-toy-erp/server
go test ./internal/core/...
```

`scripts/qa/core-boundary.test.mjs` 会扫描 `server/internal/core`，阻止本目录 import `internal/biz`、`internal/data`、`internal/service`、Ent、SQL、HTTP、Kratos transport、配置或文件系统相关依赖。

如果新增状态机、规则或计算器，还必须补表驱动 Go 单测，覆盖正常路径、非法输入、边界值、禁止迁移、重复动作和 policy 分支。
