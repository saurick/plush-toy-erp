# 可观测性 / Observability

本目录保存日志、审计、Trace、健康检查和运维可观测性相关长期文档。

## 放什么

- 日志 / 审计 / Trace 口径。
- 健康检查、排障、告警和运维观察方向。

## 不放什么

- 部署主路径。
- 客户私有化部署包。
- 临时事故记录。

## 是否是真源

本目录是可观测性设计和说明入口。当前部署、运行和健康检查真源仍以 `docs/current-source-of-truth.md`、`server/README.md`、`server/deploy/README.md` 和当前代码为准。

## 更新规则

新增、删除、重命名可观测性文档，或改变日志、审计、Trace、健康检查口径时，必须同步检查：

- 本 README。
- `docs/document-inventory.md`。
- `docs/current-source-of-truth.md`。
- 相关部署 / server 文档。
