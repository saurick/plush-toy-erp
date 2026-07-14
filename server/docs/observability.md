# 可观测性与健康检查说明

本文档只描述当前仓库真实存在的服务端观测基线，不写理想化规范。

## 当前已有的基线

### 日志

- `cmd/server/main.go` 启动时会初始化全局 logger
- `service`、`biz`、`data` 层默认都会打日志
- HTTP 层已内置 `request_id` 过滤器，日志会自动带上 `request_id`
- 日志会额外输出 `trace_sampled`；只有 trace 真正被采样时才输出 `trace_link_id`，供 Loki 安全跳转 Jaeger
- 关键鉴权与后台账号链路已保留成功 / 失败日志；匿名管理员登录失败只记录稳定 reason，不记录原始用户名、密码、token 或 session key

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

### 运行时与系统控制面审计

- 新库首次生产 bootstrap 管理员时会写入 `runtime_markers` 和 `runtime_audit_events`，用于记录一次性初始化是否完成、重复初始化或同名账号拒绝原因。
- 管理员创建、角色绑定、手机号调整、账号启停 / 注销、重置密码和角色权限变更会与 `runtime_audit_events` 在同一事务提交。手机号只保存掩码；会话失效只记录数量和稳定原因；不保存密码、token、密码 hash 或 session key。账号状态原因保留在账号状态记录和受 `system.audit.read` 保护的控制面审计中，不复制到通用 Workflow payload 或入口日志。
- 后台只读入口为 `admin.audit_logs` JSON-RPC 和 `/erp/system/audit-logs` 页面，受 `system.audit.read` 权限控制。
- `runtime_audit_events` 和 `runtime_markers` 通过 Ent hook 拒绝普通 update / delete；更正只能追加新的受控事件或通过后续专门恢复流程处理。
- 这组表只承接服务启动安全审计和系统控制面审计，不是采购、库存、质检、出货、财务等业务动作的通用 `audit_events` 事实表。

## 当前已知盲区

以下点目前仍不算理想，需要后续按真实需求补：

- `/readyz` 失败时虽然已有结构化日志，但响应体仍是简单文本
- JSON-RPC 入口日志仍以文本 `Infof/Warnf` 为主，字段化程度一般
- 当前 `request_id` 自动生成只覆盖 HTTP 链路，gRPC 和异步任务还没有统一 request id 策略
- HTTP / gRPC 已有服务级 BBR 限流，但密码登录尚无按账号 fingerprint 和可信来源的共享限速；多副本部署不能把单进程内存计数器当成完整防爆破能力

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
