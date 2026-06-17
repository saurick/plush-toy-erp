# 可观测性 / Observability

本目录回答“日志、审计、Trace 和健康检查怎么理解”的问题。部署和运行状态仍以部署文档、server 文档、当前代码和目标环境 evidence 为准。

## 先读哪几份 / Reader Paths

| 任务 | 先读 | 再核对 |
| --- | --- | --- |
| 看日志 / 审计 / Trace V1 口径 | `日志链路追踪审计第一版.md` | `server/README.md`、server docs 和当前代码 |
| 改系统审计页或审计 API | `server/README.md` | `docs/当前真源与交接顺序.md`、RBAC、service / biz / data tests |
| 改部署健康检查或 tracing | `docs/部署约定.md` | `server/deploy/README.md`、`server/docs/observability.md` |

## 真源边界 / Source Boundary

本目录是可观测性设计和说明入口，不是部署主路径、客户部署包或事故记录归档。系统控制面审计和业务事实审计也要分开判断，不能因为有 audit 文档就扩成通用业务流水。

## 更新规则 / Maintenance

新增、删除、重命名可观测性文档，或改变日志、审计、Trace、健康检查口径时，必须同步检查：

- 本 README。
- `docs/文档清单.md`。
- `docs/当前真源与交接顺序.md`。
- 相关部署 / server 文档。
