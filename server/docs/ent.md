# Ent + Atlas 数据模型说明

当前仓库使用：

- Ent：维护 schema 和生成 Go ORM 代码
- Atlas：生成和执行版本化迁移

核心目录：

- schema：`/Users/simon/projects/plush-toy-erp/server/internal/data/model/schema`
- ent 生成代码：`/Users/simon/projects/plush-toy-erp/server/internal/data/model/ent`
- migration：`/Users/simon/projects/plush-toy-erp/server/internal/data/model/migrate`

## 正确工作流

1. 修改 schema
2. 生成迁移和 ent 代码
3. 通过受控高层入口准备、确认、应用并读回迁移

常用命令：

```bash
cd /Users/simon/projects/plush-toy-erp/server

# 生成 migration + ent 代码
make data

# 登记共享开发库的人机交互入口
make migrate
```

非交互环境先运行 `make migrate_prepare`，再原样使用同一次 ready 输出的 operation
ID 与确认串运行 `make migrate_execute`。prepare 成功固定表示 `writes=0 / ready`，
不能冒充 migration 已 apply；`migrate_status` 只读。裸 `make migrate_plan` 兼容
进入同一高层 prepare，裸 TTY `make migrate_apply` 恢复唯一 ready operation；
找不到可恢复 operation 时会安全地重新准备并等待确认。只有携带完整内部确认的
调用才进入高层服务复用的底层 plan / apply 守卫。

## 相关命令

```bash
# 只生成 migration diff
make ent_migrate

# 只重新生成 ent 代码
make ent_generate

# 重算 atlas.sum
make migrate_hash

```

`migrate_set` 不是日常迁移或故障绕过入口；只有已证明 SQL 效果完整存在、具备
专项备份和修复证据的 revision 对账才可评审使用。

## 数据库表数据字典

当前应用表的人工可读入口是
[`server/docs/database/README.md`](database/README.md)。生成器只读取当前 Ent
generated migration descriptor，不连接数据库：

```bash
cd /Users/simon/projects/plush-toy-erp/server

# 校验 catalog 与 74 张应用表、生成 Markdown 是否一致
go run ./cmd/schema-doc --check

# 审查 table-catalog.json 后重新生成分域 Markdown
go run ./cmd/schema-doc --write
```

机械结构仍以 Ent schema 和 Atlas migration 为真源，业务用途、边界和生命周期维护在
`server/docs/database/table-catalog.json`。生成 Markdown 不接受手工修改，也不会写入
PostgreSQL `COMMENT`。目标数据库是否已 apply、是否存在漂移，仍需按目标环境执行
migration status 与结构读回；数据字典绿色不能替代这两项证据。

## 约束

- 不要手写结构性 SQL 迁移文件
- 不要绕过 schema 直接改数据库结构
- `make data` 是当前仓库唯一推荐的数据结构变更入口

如果需要完整操作手册，优先阅读：

- `/Users/simon/projects/plush-toy-erp/server/internal/data/AI_DB_WORKFLOW.md`

## 什么时候才需要重新导入旧库

当前默认不再依赖 `entimport` 反向生成 schema。

只有在“接手一个已经存在、且没有 Ent schema 的老数据库”这种特殊场景下，才需要考虑先做一次导入；那属于历史库迁移工作，不是当前默认工作流。

## 参考

- Ent 官方文档：[https://entgo.io/zh/docs/tutorial-setup](https://entgo.io/zh/docs/tutorial-setup)
