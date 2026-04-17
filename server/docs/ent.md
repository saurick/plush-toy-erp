# Ent + Atlas 数据模型说明

当前模板使用：

- Ent：维护 schema 和生成 Go ORM 代码
- Atlas：生成和执行版本化迁移

核心目录：

- schema：`/Users/simon/projects/plush-toy-erp/server/internal/data/model/schema`
- ent 生成代码：`/Users/simon/projects/plush-toy-erp/server/internal/data/model/ent`
- migration：`/Users/simon/projects/plush-toy-erp/server/internal/data/model/migrate`

## 正确工作流

1. 修改 schema
2. 生成迁移和 ent 代码
3. 应用迁移

常用命令：

```bash
cd /Users/simon/projects/plush-toy-erp/server

# 生成 migration + ent 代码
make data

# 应用 migration（需要先设置 DB_URL）
make migrate_apply
```

## 相关命令

```bash
# 只生成 migration diff
make ent_migrate

# 只重新生成 ent 代码
make ent_generate

# 重算 atlas.sum
make migrate_hash

# 手动标记某个 migration 已执行
make migrate_set
```

## 约束

- 不要手写结构性 SQL 迁移文件
- 不要绕过 schema 直接改数据库结构
- `make data` 是当前模板唯一推荐的数据结构变更入口

如果需要完整操作手册，优先阅读：

- `/Users/simon/projects/plush-toy-erp/server/internal/data/AI_DB_WORKFLOW.md`

## 什么时候才需要重新导入旧库

模板当前默认不再依赖 `entimport` 反向生成 schema。

只有在“接手一个已经存在、且没有 Ent schema 的老数据库”这种特殊场景下，才需要考虑先做一次导入；那属于派生项目迁移工作，不是模板默认工作流。

## 参考

- Ent 官方文档：[https://entgo.io/zh/docs/tutorial-setup](https://entgo.io/zh/docs/tutorial-setup)
