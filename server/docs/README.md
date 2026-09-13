# server/docs 文档索引

服务端专题按问题进入，启动命令与分层总览见 [后端入口](../README.md)。

| 问题 | 入口 |
| --- | --- |
| 启动、端口、HTTP、健康检查与来源任务修复 | [服务运行](runtime.md) |
| 环境字段、管理员初始化与配置来源 | [配置说明](config.md) |
| JSON-RPC 方法、领域状态、权限与幂等 | [API 合同](api.md) |
| 日志、Trace、控制面与业务审计 | [日志、审计与 Trace](../../docs/observability/日志链路追踪审计第一版.md) |
| Ent / Atlas 生成、迁移、回执和恢复 | [模型与迁移](ent.md) |
| 应用表、字段、约束、生命周期与写入归属 | [生成的数据字典](database/README.md) |
| 固定制品、目标迁移与运行检查 | [部署入口](../deploy/README.md) |

数据字典是 schema 与语义 catalog 的生成投影；表数量、字段与约束由生成器给出，目标是否已 apply 另取运行证据。
