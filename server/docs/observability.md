# 可观测性与健康检查说明

本文档只描述当前仓库真实存在的服务端观测基线，不写理想化规范。

## 当前已有的基线

### 日志

- `cmd/server/main.go` 启动时会初始化全局 logger
- `service`、`biz`、`data` 层默认都会打日志
- HTTP 层已内置 `request_id` 过滤器，日志会自动带上 `request_id`
- 日志会额外输出 `trace_sampled`；只有 trace 真正被采样时才输出 `trace_link_id`，供 Loki 安全跳转 Jaeger
- 关键鉴权与后台账号链路已保留成功 / 失败日志

### Trace 链路追踪 / Trace

- HTTP JSON-RPC 路由已接入 tracing middleware
- gRPC 服务已接入 tracing middleware
- 自定义健康检查和静态路由已走统一观测包装，会补 span、recover 和收尾日志
- `biz.auth`、`biz.useradmin` 等关键 usecase 已显式创建 span
- SQL tracing 保留 SQL span 的耗时、错误和链路关系，但不记录 SQL text、语句模板、bind args 或 SQL 参数值，避免客户、账号、手机号、业务 payload 或密码哈希进入 Jaeger。
- 业务 trace attribute 只记录 ID、数量、状态、耗时或已脱敏值；不记录用户名、账号搜索词、手机号明文、密码哈希、token 或业务 payload 明文。
- 启动时会打一条 `startup-span`，方便排查进程是否成功初始化 tracer provider

### 健康检查

- `/ping`
- `/healthz`
- `/readyz`

其中：

- `/healthz` 只做浅检查
- `/readyz` 当前检查 PostgreSQL 连通性和 PDF 启动预热状态；PDF 异步预热完成前返回未就绪
- 健康检查路由已有最小回归测试

### 启动韧性

- `data.NewData(...)` 在初始化 PostgreSQL 时会做短暂重试
- 目标是避免宿主机或数据库刚恢复时，服务因瞬时连接拒绝直接退出

## 当前已知盲区

以下点目前仍不算理想，需要后续按真实需求补：

- `/readyz` 失败时虽然已有结构化日志，但响应体仍是简单文本
- JSON-RPC 入口日志仍以文本 `Infof/Warnf` 为主，字段化程度一般
- 当前 `request_id` 自动生成只覆盖 HTTP 链路，gRPC 和异步任务还没有统一 request id 策略

## 对当前部署路径的影响

### Compose 部署观测 / Compose

- Compose 当前保留 PostgreSQL `healthcheck`
- 业务容器默认依赖 `/healthz`、`/readyz` 作为发布后 smoke 检查入口
- Compose 默认同时拉起 Jaeger，便于本地和单机部署查看 trace；Jaeger 宿主机端口默认只绑定 `127.0.0.1`，远程查看优先使用 SSH tunnel。

## 后续常见补法

- 如果项目长期跑在 Kubernetes，优先按真实依赖继续扩展 `readyz`，并为失败响应补更细的 JSON 细节
- 如果项目依赖 Redis、MQ、OSS、第三方 API，再把这些依赖纳入 `/readyz`
- 如果项目有统一日志平台，优先把关键 JSON-RPC 链路改成结构化字段日志

## 约束来源

仓库级观测要求见：

- `/Users/simon/projects/plush-toy-erp/AGENTS.md`

其中要求的重点是：

- 改服务端关键链路时，必须同时检查 trace 和 log
- 最终交付时要说明观测覆盖结果和剩余盲区
