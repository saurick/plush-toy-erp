# server 后端说明

图片与业务附件使用统一 S3 存储接口；PG 保存文件元数据和对象 key，文件内容落在 RAID5 上的私有 SeaweedFS。配置、旧文件迁移、独立备份与恢复见 [Compose 附件说明](deploy/compose/prod/README.md#附件存储与raid5)。开发启动同样需要 `ATTACHMENT_S3_*` 配置，迁移前必须先完成旧附件导出校验。

## 技术栈

- Kratos
- Ent + Atlas
- PostgreSQL
- OpenTelemetry（可选）

## 环境版本

后端 Go 版本以 `server/go.mod` 为准：`go 1.25.0`，当前 toolchain 为 `go1.26.6`。本机检查走仓库根目录的 `scripts/doctor.sh`，该脚本会在 `server/` 模块内读取实际 Go toolchain，避免只看仓库根目录默认 Go 版本造成误判。

```bash
cd "$(git rev-parse --show-toplevel)"
bash scripts/doctor.sh
```

若 `doctor` 报 Go 低于 `1.26.6`，先升级 Go 或启用 Go toolchain 自动切换，再执行 `make init`、`make data`、`go test` 或 migration 相关命令。

## 分层

执行链路：`server -> service -> biz -> data`

- `server`：HTTP / JSON-RPC 接入层
- `service`：DTO 转换、JSON-RPC URL / method 分发、入口级鉴权与调用编排
- `biz`：业务规约与 UseCase
- `data`：数据库与外部依赖访问

HTTP transport 日志只记录 operation、JSON-RPC domain / method / id、结果码和耗时，不序列化请求体；密码、验证码、token、附件内容和客户业务参数必须留在脱敏后的业务日志边界内。

## 快速开始

```bash
cd "$(git rev-parse --show-toplevel)/server"
make init
make run
```

`make run`、`make dev` 和 `make dev_restart` 会先校验仓库根目录 `config/dev-ports.env`，并把其中固定的 HTTP `8300` 注入 dev 配置；生产配置不消费这组覆盖。随后共享本地启动预检运行 `db-guard` 核对 Ent schema、versioned migration 与“禁止新增数据库可编程对象”规则，再读取当前 dev 配置命中的数据库，要求 Atlas status 已到最新 revision、pending 为 0，且 `public` 下自定义 Function、Procedure、非内部 Trigger 均为 0。`make dev_restart` 只在预检通过后才停止旧进程，避免先停服再发现缺 migration。该预检始终只读，不会自动执行 migration；pending 时在交互终端运行 `make migrate`，非交互环境运行显式的 prepare / execute 两阶段，不应绕过。

主端口不自动顺延。`make dev_stop` / `make dev_restart` 虽按登记端口查找 listener，但停止前会逐个校验进程 cwd 位于本仓库；端口被其他项目占用时会报告 PID、cwd 和命令并拒绝 kill。整组本机覆盖必须写入 ignored 的 `config/dev-ports.local.env`，且包含完整端口组。

Linux 本地终端确实以 root 运行时，`make run` / `make dev_restart` 会把 `ERP_PDF_ALLOW_LOCAL_NO_SANDBOX=1` 只传给本地后端，供 Playwright Chromium 完成 PDF warmup；服务端还会同时核对 Linux 与 effective UID 0。非 root 本地进程继续启用 Chromium sandbox，生产镜像也不设置该开关，并由运行预检拒绝 root app-server。

登记的本地开发库未显式设置管理员账号或密码时，分别使用 `admin` / `adminadmin`。配置或 `APP_ADMIN_*` 显式值优先；启动只创建缺失账号，不会覆盖已有账号密码。管理员账号创建、初始化和重置密码统一要求 8～20 位，并继续受 bcrypt 72-byte 安全边界保护。若本地验收工具曾改动稳定管理员，使用以下专用命令恢复当前开发库；它会递增认证版本并撤销旧会话，且没有通往演示、验收或生产实例的逃逸开关：

```bash
make reset_local_admin_password
```

本地后端默认固定 `ERP_CUSTOMER_KEY=yoyoosun`，并只在 `make run`、`make dev`、`make dev_restart` 这些本地入口中设置 `ERP_ALLOW_LOCAL_TEST_CUSTOMER_CONFIG=1`。前者避免显式 session 请求读取永绅、而未携带 customer key 的业务 RPC 回落到 `demo`；后者只允许本地服务接收带 `local_test_apply` 标记的测试 revision。专用别名仍可用于强调意图：

```bash
make run_yoyoosun
make dev_restart_yoyoosun
```

确需启动 demo 时必须显式覆盖，例如 `ERP_CUSTOMER_KEY=demo make dev_restart`。永绅本地测试配置仍需登录后在 Vite 开发控制台显式应用；上述目标不会自动发布或激活配置。未通过本地 Make 入口启动的后端默认拒绝 local-test manifest 及其切换操作；本地 gate 开启时，启动预检和 JSON-RPC dispatcher 会基于同一份启动时配置，按 pgx 最终连接结果把 DSN 固定到 `192.168.0.133:5432` 上的 `plush_erp` 或 `plush_erp_*_dev` 开发库，不会因运行中修改环境变量、query override、multi-host fallback 或 `ERP_ALLOW_TEST_DB_AS_DEV=1` 放行 133 其他实例或 loopback tunnel。人工验收数据 runner 另行把 `local-dev` 精确绑定到当前版本的隔离验收库，不会写共享开发库；production 配置发现该环境开关时也会直接失败。

## 常用命令

在 `server/` 执行；先按当前任务选择所需项。

| 目的 | 命令与说明 |
| --- | --- |
| 启动 / 重启 / 停止 | `make run` / `make dev_restart` / `make dev_stop`，先做只读预检 |
| 协议 / 配置生成 | `make api` / `make config`，构造注入见 `go generate ./cmd/server` |
| 模型、Ent 和版本化迁移 | `make data`，随后核对生成差异与零漂移 |
| 共享开发库迁移 | 交互 `make migrate`；非交互按同一次 `make migrate_prepare` 回执执行 `make migrate_execute` |
| 普通测试 / 构建 | `go test ./...` / `make build`；普通测试不代替真实 PostgreSQL 事务验证 |
| 本地管理员恢复 | `make reset_local_admin_password`，撤销旧会话，范围仅登记开发库 |

## 迁移说明

操作合同统一见 [Ent + Atlas](docs/ent.md)。模型生成、隔离验证与目标库 apply 分别留证据；生产只使用 [prod Compose 迁移入口](deploy/compose/prod/README.md)，不由本地命令代替。

## 目录结构（简版）

| 路径                   | 职责                                                                                                                                                                                                                                          |
| --- | --- |
| `api/`、`internal/conf/` | 协议与配置结构、生成入口 |
| `cmd/` | 服务、迁移、受控 seed 与恢复命令 |
| `internal/server/`、`internal/service/` | HTTP / JSON-RPC 接入、鉴权、DTO 和调用编排 |
| [internal/biz](internal/biz/README.md) | 业务 usecase 与真源边界 |
| [internal/core](internal/core/README.md) | 无 IO 的领域规则、值对象、状态机与计算 |
| [internal/data](internal/data/README.md) | 数据与外部依赖、Ent schema / migration |
| `internal/devdbguard/`、`internal/errcode/` | 登记目标保护与错误码真源 |
| `pkg/`、`third_party/` | 复用基础设施、第三方协议依赖 |
| `configs/`、[deploy](deploy/README.md)、[docs](docs/README.md) | 环境配置、部署与后端专题 |

## 文档索引

| 主题 | 唯一维护入口 |
| --- | --- |
| 启动、HTTP、健康与来源任务修复 | [服务运行](docs/runtime.md) |
| 环境配置与账号初始化 | [配置说明](docs/config.md) |
| JSON-RPC 领域方法、状态、权限和幂等 | [API 合同](docs/api.md) |
| Ent / Atlas 与共享开发库迁移 | [模型与迁移](docs/ent.md)、[生成的数据字典](docs/database/README.md) |
| 日志、Trace 与审计 | [可观测性](../docs/observability/日志链路追踪审计第一版.md) |
| PostgreSQL 事务与定向验证 | [QA 脚本](../scripts/qa/README.md#postgresql-领域事务验证) |
| 目标机发布、附件存储、备份与恢复 | [部署总览](deploy/README.md)、[prod Compose](deploy/compose/prod/README.md) |

## 实现命名写入边界

自动化命名统一复用后端 validator；适用范围见 [服务运行说明](docs/runtime.md#实现命名写入边界)。

## 部署

当前运行主路径是 `server/deploy/compose/prod`。目标机只加载不可变制品并执行正式迁移和运行检查；发布证据与客户 UAT 分别验收。
