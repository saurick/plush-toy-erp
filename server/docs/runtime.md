# 服务运行说明

本文档说明服务端当前的默认启动方式、对外端口和运行时约定。

## 启动方式

最常用的本地启动命令：

```bash
cd "$(git rev-parse --show-toplevel)/server"
make init
make run
```

如果要显式指定配置文件：

```bash
cd "$(git rev-parse --show-toplevel)/server"
go run ./cmd/server -conf ./configs/dev/config.yaml
```

说明：

- `make run` 会先构建稳定路径的本地二进制，再启动它。
- `cmd/server/main.go` 支持自动探测配置路径；未传 `-conf` 时，默认优先找 `configs/dev/config.yaml`。

## 默认端口

- HTTP：`8300`
- 本地开发数据库：`192.168.0.133:5432/plush_erp`
- PostgreSQL Compose 宿主机映射：`5435`

配置来源：

- `server/configs/dev/config.yaml`
- `server/configs/prod/config.yaml`

## HTTP 入口

当前服务默认暴露以下 HTTP 能力：

- `/rpc/{url}`
  - JSON-RPC HTTP 入口，只接受 `POST`；不允许用 GET query 传递鉴权参数或调用业务方法
  - 普通请求正文最多 2 MiB，附件入口最多 7 MiB；已知 `Content-Length` 和 chunked 超限都在业务 handler 前返回 HTTP 413，Web 代理使用相同上限
- `/ping`
  - 最简单的探活接口，返回 `pong`
- `/healthz`
  - 进程级健康检查，返回 `ok`
- `/readyz`
  - 就绪检查，当前检查 PostgreSQL 连通性和 PDF 启动预热状态；成功返回 `ready`
- `/metrics`
  - 只读 Prometheus 文本指标，包含 Go 堆/GC、数据库连接池、PDF 渲染占用与排队、附件表大小和估算行数；生产环境只通过 loopback 后端端口或受控采集网络访问
- `/templates/render-pdf`
  - 在线 PDF 渲染入口，请求体只接受 `title`、`file_name`、`template_key`、`html`；客户 key 读取部署环境，客户端不能提交 `customer_key` 或 `base_url`
  - 路由复用统一管理员认证 middleware；每个请求以实时 session / RBAC 和同一次 active customer revision effective session 检查打印 action 与模板 module
  - HTML / CSS 只接受静态 allowlist、文档内锚点和受限内嵌位图；Chromium 禁用脚本与缓存、阻断 `data:` / `about:blank` 之外的请求，并为每次渲染创建独立 browser context
  - 最多 32 张内嵌图片，单图解码后最多 5 MiB、全部图片合计最多 16 MiB；HTML 最多 24 MiB、CSS 文本合计最多 4 MiB、DOM 节点最多 20,000 个、请求体最多 32 MiB、生成 PDF 最多 32 MiB，超限在继续分配或渲染前拒绝
  - 使用共享 Headless Chromium 进程生成 PDF；生产镜像默认内置 `/usr/bin/chromium`、以非 root 用户运行且不关闭 sandbox，并精确固定经目标宿主验证的 Debian 包版本。默认并发为 4、等待名额为 2；超过 6 个已接纳请求时立即返回忙碌，不继续读取大请求体。`ERP_PDF_RENDER_CONCURRENCY` 和 `ERP_PDF_QUEUE_CAPACITY` 分别控制执行与等待；正式发布使用 `ERP_PDF_WARMUP=async` 异步执行一次中文合同 PDF 预热，`/readyz` 在预热完成前或失败后保持未就绪。`off` 只用于临时故障隔离，发布 smoke 仍必须用受控管理员 token 真实生成非空 PDF

如果容器内存在静态目录，还会挂载前端静态资源：

- 默认读取环境变量 `STATIC_DIR`
- 未设置时默认使用 `/app/public`
- 健康检查路由和静态资源路由当前都已走统一观测包装，不再是裸挂 handler
- HTTP 层已内置 `request_id` 过滤器，会优先透传 `X-Request-Id`，缺失时自动生成并回写响应头

## 启动依赖

当前服务默认把以下项目视为启动硬依赖：

- PostgreSQL

当前配置里虽然还保留了 `etcd` 字段，但默认代码路径并未实际初始化 etcd 客户端，因此它不是当前运行时的启动硬依赖。

## 本地开发常用命令

```bash
cd "$(git rev-parse --show-toplevel)/server"

# 代码生成
make config
make api
go generate ./cmd/server

# 数据模型与迁移
make data
make migrate

# 测试
go test ./...
```

`make migrate` 是登记共享开发库的人机交互入口。非交互执行必须先运行
`make migrate_prepare`，再原样使用同一次 ready 输出运行 `make migrate_execute`；
prepare 成功不表示数据库已经升级。133 上演示、验收和生产实例不使用这些本地目标。

## 启动与观测

`data.NewData(...)` 初始化 PostgreSQL 时对瞬时连接失败做有界重试，不能代替目标数据库迁移或就绪检查。HTTP 健康路由有定向回归；PDF 异步预热完成前 `/readyz` 保持未就绪。

Compose 保留 PostgreSQL healthcheck，业务发布分别读回 health / ready 和业务 smoke。Jaeger 只绑定 loopback，远程查看通过 SSH tunnel；它不承担长期审计或业务事实存储。日志、Trace、控制面审计和已知盲区统一见 [日志、审计与 Trace](../../docs/observability/日志链路追踪审计第一版.md#服务端观测接入-server-instrumentation)。


## 来源任务修复

以下命令在 `server/` 执行。

存量来源任务修复使用后端专用命令，并先由受控环境注入 `POSTGRES_DSN`，不要把连接串写入命令或报告：

```bash
# 默认在事务中执行与正式修复相同的检查和写入，然后回滚
go run ./cmd/backfill-workflow-source-tasks

# 核对 dry-run 的数据库名、扫描数和新增数后，才允许显式提交
go run ./cmd/backfill-workflow-source-tasks \
  --apply \
  --confirm-database=<精确数据库名>
```

该命令只扫描当前仍为 `RELEASED` 的生产订单和当前仍为 `POSTED REWORK` 的返工事实，补齐缺失的 task / `created` event / business state 包；确定性编号被占用、已有包不完整或来源不合法时整批失败。新建任务保持 `ready`，由真实责任岗位处理，不推断历史 `done / rejected`。它不扫描 `DRAFT` 出货单，也不猜测历史上是否点过提交；出货放行仍必须从出货页显式提交。命令可执行不表示任何共享库、目标环境或客户数据库已经 dry-run / apply。


## 实现命名写入边界

自动生成的 Workflow 任务名称 / payload、核心演示 seed 和试用 MasterData seed 复用 `internal/biz/implementation_naming.go`，避免自动化重新写入编号阶段标签。普通 MasterData 和客户业务数据不套用开发阶段命名规则；风险等级（内部优先级 P0/P1/P2）、p50/p95/p99 百分位、产品编码和部署技术步骤按原业务 / 技术语义保留。历史数据库残值按需使用只读 SQL 专项盘点，不建立常驻全表扫描流程。
