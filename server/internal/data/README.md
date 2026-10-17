# 数据层说明 / Data

`data` 层负责数据库、外部依赖和 repo 适配，不承载业务决策或 JSON-RPC 分发。

当前仓库默认保留：

- PostgreSQL 初始化与重试
- Ent ORM 访问
- 用户 / 管理员鉴权 repo
- 后台账号目录 repo
- Workflow / MasterData / Order / Inventory / OperationalFact 等业务 repo

BOM、采购和质检的持久化约束错误在 repo 返回边界统一转换为对应的业务冲突错误，并保留原始错误链供诊断；service 只依赖业务错误，不判断 Ent 类型。BOM 草稿统一通过 `SaveBOMWithItems` 整单保存，使用事务与版本检查同步头、明细和可选字段清空；库存流水与余额统一经过原子写入，复制、激活、归档仍有各自的领域动作。

客户、供应商的单独保存与联系人聚合保存复用字段映射。财务列表按来源类型批量读取单号，预付款候选与核销写入共用订单归属筛选；工程用料预览和 BOM 指纹复用批量加载的材料与单位。财务核销、冲销及其原记录引用由数据库外键保护，空值组合和生命周期完整性由 schema CHECK 与领域校验共同约束。

开发环境的业务数据清空按显式表清单执行。账号、权限、客户配置与运行审计保持保留；企业帮助补充、不可变修订历史和章节纠错也在保留范围内，不随模拟订单、库存或财务记录清空。

数据库变更前，必须先读：

- [`../../docs/ent.md`](../../docs/ent.md)

补充说明见：

- `server/docs/ent.md`
- `server/docs/config.md`
- `docs/observability/日志链路追踪与审计.md`
