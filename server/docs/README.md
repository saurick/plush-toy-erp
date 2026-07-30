# server/docs 文档索引

`server/docs` 只保留当前后端真正会用到的专题说明。

## 建议阅读顺序

1. `/Users/simon/projects/plush-toy-erp/server/README.md`
2. `/Users/simon/projects/plush-toy-erp/server/docs/runtime.md`
3. `/Users/simon/projects/plush-toy-erp/server/docs/config.md`
4. `/Users/simon/projects/plush-toy-erp/server/docs/api.md`
5. `/Users/simon/projects/plush-toy-erp/server/docs/observability.md`
6. `/Users/simon/projects/plush-toy-erp/server/docs/ent.md`
7. `/Users/simon/projects/plush-toy-erp/server/docs/database/README.md`

## 文档说明

- `runtime.md`
  - 服务如何启动
  - 默认端口、静态资源和健康检查
- `config.md`
  - `server/configs/*/config.yaml` 字段说明
  - 需要尽快替换的默认占位
- `api.md`
  - 当前保留的 JSON-RPC 入口
  - 鉴权边界和后台账号能力
- `observability.md`
  - 日志、trace、健康检查基线
- `ent.md`
  - Ent + Atlas 数据模型和迁移工作流
- `database/README.md`
  - 当前 74 张 Product Core 应用表的分域数据字典入口
  - 字段、主外键、显式索引、CHECK、用途、生命周期和写入边界的生成投影
  - Atlas 内部 revision 表、目标库 apply 与 PostgreSQL `COMMENT` 的明确边界

## 相关入口

- 服务端总览：`/Users/simon/projects/plush-toy-erp/server/README.md`
- Compose 部署：`/Users/simon/projects/plush-toy-erp/server/deploy/README.md`
- 数据库工作流：`/Users/simon/projects/plush-toy-erp/server/internal/data/AI_DB_WORKFLOW.md`
- 数据库表数据字典：`/Users/simon/projects/plush-toy-erp/server/docs/database/README.md`
