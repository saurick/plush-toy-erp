# 服务运行说明

本文档说明服务端当前的默认启动方式、对外端口和运行时约定。

## 启动方式

最常用的本地启动命令：

```bash
cd /Users/simon/projects/plush-toy-erp/server
make init
make run
```

如果要显式指定配置文件：

```bash
cd /Users/simon/projects/plush-toy-erp/server
go run ./cmd/server -conf ./configs/dev/config.yaml
```

说明：

- `make run` 会先构建稳定路径的本地二进制，再启动它。
- `cmd/server/main.go` 支持自动探测配置路径；未传 `-conf` 时，默认优先找 `configs/dev/config.yaml`。

## 默认端口

- HTTP：`8200`
- gRPC：`9200`
- 本地开发数据库：`192.168.0.106:5432/plush_erp`
- PostgreSQL Compose 宿主机映射：`5435`

配置来源：

- `/Users/simon/projects/plush-toy-erp/server/configs/dev/config.yaml`
- `/Users/simon/projects/plush-toy-erp/server/configs/prod/config.yaml`

## HTTP 入口

当前服务默认暴露以下 HTTP 能力：

- `/rpc/{url}`
  - JSON-RPC HTTP 入口，支持 `GET` 和 `POST`
- `/ping`
  - 最简单的探活接口，返回 `pong`
- `/healthz`
  - 进程级健康检查，返回 `ok`
- `/readyz`
  - 就绪检查，当前默认只检查 PostgreSQL 连通性，成功返回 `ready`

如果容器内存在静态目录，还会挂载前端静态资源：

- 默认读取环境变量 `STATIC_DIR`
- 未设置时默认使用 `/app/public`
- 健康检查路由和静态资源路由当前都已走统一观测包装，不再是裸挂 handler
- HTTP 层已内置 `request_id` 过滤器，会优先透传 `X-Request-Id`，缺失时自动生成并回写响应头

## gRPC 入口

- gRPC 服务同样承载 `Jsonrpc` 服务定义
- 默认监听 `0.0.0.0:9200`

说明：当前服务主要以 HTTP JSON-RPC 为默认入口，gRPC 更多是保留 Kratos 的统一接入能力。

## 启动依赖

当前服务默认把以下项目视为启动硬依赖：

- PostgreSQL

当前配置里虽然还保留了 `etcd` 字段，但默认代码路径并未实际初始化 etcd 客户端，因此它不是当前运行时的启动硬依赖。

## 本地开发常用命令

```bash
cd /Users/simon/projects/plush-toy-erp/server

# 代码生成
make config
make api
go generate ./cmd/server

# 数据模型与迁移
make data
make migrate_apply

# 测试
go test ./...
```

## 后续扩展时建议确认

- 是否仍保留 JSON-RPC 作为主入口
- HTTP / gRPC 端口是否需要调整
- 是否需要静态资源托管，或改由独立前端服务提供
- `/readyz` 是否需要新增 Redis、MQ、OSS 等真实项目依赖检查
