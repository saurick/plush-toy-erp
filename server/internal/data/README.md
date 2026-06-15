# 数据层说明 / Data

`data` 层负责数据库、外部依赖和 repo 适配，不承载业务决策或 JSON-RPC 分发。

当前仓库默认保留：

- PostgreSQL 初始化与重试
- Ent ORM 访问
- 用户 / 管理员鉴权 repo
- 后台账号目录 repo
- Workflow / MasterData / Order / Inventory / OperationalFact 等业务 repo

数据库变更前，必须先读：

- [`AI_DB_WORKFLOW.md`](./AI_DB_WORKFLOW.md)

补充说明见：

- `/Users/simon/projects/plush-toy-erp/server/docs/ent.md`
- `/Users/simon/projects/plush-toy-erp/server/docs/config.md`
- `/Users/simon/projects/plush-toy-erp/server/docs/observability.md`
