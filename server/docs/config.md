# 服务配置说明

本文档对应：

- `/Users/simon/projects/plush-toy-erp/server/internal/conf/conf.proto`
- `/Users/simon/projects/plush-toy-erp/server/configs/dev/config.yaml`
- `/Users/simon/projects/plush-toy-erp/server/configs/prod/config.yaml`

## 顶层结构

当前配置分为 4 组：

- `server`
- `log`
- `trace`
- `data`

## `server`

用于定义监听地址和超时：

- `server.http.addr`
- `server.http.timeout`
- `server.grpc.addr`
- `server.grpc.timeout`

默认值：

- HTTP `0.0.0.0:8200`
- gRPC `0.0.0.0:9200`
- `server.http.timeout=45s`，给 `/templates/render-pdf` 这类重渲染链路留出稳定完成窗口
- `server.grpc.timeout=10s`

## `log`

- `log.debug`
  - `true` 时更适合本地开发
  - `false` 时更适合生产环境

## `trace`

当前只保留 `jaeger` 这一组字段：

- `trace.jaeger.traceName`
- `trace.jaeger.endpoint`
- `trace.jaeger.ratio`

说明：

- `traceName` 为空时，会回退到 `cmd/server/main.go` 里的默认服务名。
- `endpoint` 为空时，服务仍能启动，只是使用本地无 exporter 的 tracer provider。
- 当前通过 OTLP HTTP exporter 发 trace，仓库默认内置 Jaeger 作为 tracing 存储和查询入口。
- 宿主机本地调试当前默认连 `192.168.0.106:4318`；若本机 Jaeger VM IP 变化，需同步改 dev 本地配置。
- 宿主机线上进程当前默认连 `127.0.0.1:4318`。
- Compose 里的 `app-server` 容器仍通过 `TRACE_ENDPOINT=jaeger:4318` 走容器网络，不读宿主机的 `127.0.0.1`。
- 如果后续改用其他 OTLP 兼容后端，只需替换 endpoint 和服务名即可。

## `data.postgres`

- `data.postgres.dsn`
- `data.postgres.debug`

说明：

- 这是当前仓库唯一真正运行时必需的数据依赖。
- `debug=true` 时会输出更多 SQL 调试信息，更适合开发环境。
- 本地开发默认 DSN 已收口到共享 PG `192.168.0.106:5432/plush_erp`。
- 若你在数据库客户端里使用的是 `zos_test_user` 等其他账号，应该通过 `server/configs/dev/config.local.yaml` 或环境变量覆盖用户名和密码，而不是改公共仓库默认值。

## `data.etcd`

- `data.etcd.hosts`

说明：

- 当前配置骨架里保留了这一组字段，方便后续继续扩展。
- 但当前默认代码路径并未真正初始化 etcd 客户端，所以它只是扩展位，不是现阶段必填运行依赖。

## `data.auth`

- `data.auth.jwtSecret`
- `data.auth.jwtExpireSeconds`
- `data.auth.admin.username`
- `data.auth.admin.password`

说明：

- 这组字段决定用户 token 签名和默认管理员初始化逻辑。
- 必须替换仓库里的默认密钥和管理员密码。

## 初始化后必须改的字段

以下内容不应直接进入交付项目：

- `data.postgres.dsn`
- `data.auth.jwtSecret`
- `data.auth.admin.username`
- `data.auth.admin.password`
- `trace.jaeger.traceName`
- `trace.jaeger.endpoint`

## 配置选择建议

- 本地开发：
  - `log.debug=true`
  - `data.postgres.debug=true`
  - `trace.jaeger.ratio=1`
- 生产环境：
  - `log.debug=false`
  - `data.postgres.debug=false`
  - `trace.jaeger.ratio` 按观测成本控制

## 额外建议

- 生产环境不要把最终密钥长期写死在仓库中的 YAML 文件里。
- 如果项目会长期运行，建议把敏感配置迁移到 `.env`、密钥管理服务、K8s Secret 或其他外部注入方式。
